//! Three-legged OAuth 1.0a for the X Livestream API.
//!
//! The Livestream management endpoints only accept OAuth 1.0a user-context
//! signatures (the OAuth2 PKCE token used for chat cannot call them), so each
//! user mints their own access token/secret against the allow-listed Videorc
//! consumer pair: request token → browser authorize on x.com → loopback
//! callback with `oauth_token` + `oauth_verifier` → access token exchange.
//! The resulting token pair is stored in the local secret store.

use std::collections::HashMap;

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::x_live::{
    Oauth1SigningInputs, XOauth1Consumer, oauth_nonce, oauth_percent_encode, oauth_timestamp,
    oauth1_signed_header,
};

const DEFAULT_OAUTH1_BASE_URL: &str = "https://api.x.com";
const PENDING_TTL_MINUTES: i64 = 10;

#[derive(Debug, Default)]
pub struct XOauth1Sessions {
    // Keyed by the request oauth_token: OAuth 1.0a has no `state` param — the
    // token itself correlates the callback with the pending authorization.
    pending: Mutex<HashMap<String, PendingXOauth1Authorization>>,
}

#[derive(Debug, Clone)]
struct PendingXOauth1Authorization {
    request_token_secret: String,
    consumer: XOauth1Consumer,
    base_url: String,
    expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XOauth1StartResult {
    pub auth_url: String,
    pub redirect_uri: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct XOauth1AccessToken {
    pub access_token: String,
    pub access_token_secret: String,
    pub user_id: String,
    pub screen_name: Option<String>,
}

impl XOauth1Sessions {
    /// Leg 1: obtain a request token bound to the loopback callback and build
    /// the browser authorization URL.
    pub async fn start(
        &self,
        consumer: XOauth1Consumer,
        callback_url: &str,
        client: &reqwest::Client,
        base_url_override: Option<&str>,
    ) -> Result<XOauth1StartResult> {
        let base_url = oauth1_base_url(base_url_override);
        let request_token_url = format!("{base_url}/oauth/request_token");
        let authorization = oauth1_signed_header(&Oauth1SigningInputs {
            method: "POST",
            url: &request_token_url,
            consumer_key: &consumer.key,
            consumer_secret: &consumer.secret,
            token: None,
            extra_oauth_params: &[("oauth_callback", callback_url)],
            nonce: &oauth_nonce(),
            timestamp: oauth_timestamp(),
        })?;
        let response = client
            .post(&request_token_url)
            .header("Authorization", authorization)
            .send()
            .await
            .context("Could not reach the X OAuth request token endpoint.")?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!(
                "X OAuth request token failed with HTTP {status}: {}",
                oauth1_error_detail(&body)
            );
        }
        let fields = parse_form_body(&body);
        let oauth_token = required_field(&fields, "oauth_token", "request token response")?;
        let oauth_token_secret =
            required_field(&fields, "oauth_token_secret", "request token response")?;
        if fields.get("oauth_callback_confirmed").map(String::as_str) != Some("true") {
            anyhow::bail!(
                "X did not confirm the OAuth callback URL. Register {callback_url} (and the other loopback port variants) as callback URLs on the X developer app."
            );
        }

        let expires_at = Utc::now() + Duration::minutes(PENDING_TTL_MINUTES);
        self.pending.lock().await.insert(
            oauth_token.clone(),
            PendingXOauth1Authorization {
                request_token_secret: oauth_token_secret,
                consumer,
                base_url: base_url.clone(),
                expires_at,
            },
        );

        Ok(XOauth1StartResult {
            auth_url: format!(
                "{base_url}/oauth/authorize?oauth_token={}",
                oauth_percent_encode(&oauth_token)
            ),
            redirect_uri: callback_url.to_string(),
            expires_at: expires_at.to_rfc3339(),
        })
    }

    /// Leg 3: swap the verifier for the user's permanent access token pair.
    pub async fn complete(
        &self,
        oauth_token: &str,
        oauth_verifier: &str,
        client: &reqwest::Client,
    ) -> Result<XOauth1AccessToken> {
        let pending = self.pending.lock().await.remove(oauth_token).context(
            "X live authorization is not pending for this token. Start Authorize X Live again.",
        )?;
        if pending.expires_at < Utc::now() {
            anyhow::bail!("X live authorization expired. Start Authorize X Live again.");
        }

        let access_token_url = format!("{}/oauth/access_token", pending.base_url);
        let authorization = oauth1_signed_header(&Oauth1SigningInputs {
            method: "POST",
            url: &access_token_url,
            consumer_key: &pending.consumer.key,
            consumer_secret: &pending.consumer.secret,
            token: Some((oauth_token, &pending.request_token_secret)),
            extra_oauth_params: &[("oauth_verifier", oauth_verifier)],
            nonce: &oauth_nonce(),
            timestamp: oauth_timestamp(),
        })?;
        let response = client
            .post(&access_token_url)
            .header("Authorization", authorization)
            .send()
            .await
            .context("Could not reach the X OAuth access token endpoint.")?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!(
                "X OAuth access token exchange failed with HTTP {status}: {}",
                oauth1_error_detail(&body)
            );
        }
        let fields = parse_form_body(&body);
        let access_token = required_field(&fields, "oauth_token", "access token response")?;
        let access_token_secret =
            required_field(&fields, "oauth_token_secret", "access token response")?;
        let user_id = fields
            .get("user_id")
            .map(String::to_owned)
            .or_else(|| {
                access_token
                    .split_once('-')
                    .map(|(prefix, _)| prefix.to_string())
            })
            .filter(|value| {
                !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
            })
            .context("X OAuth access token response did not include a numeric user id.")?;

        Ok(XOauth1AccessToken {
            access_token,
            access_token_secret,
            user_id,
            screen_name: fields
                .get("screen_name")
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(|value| format!("@{}", value.trim_start_matches('@'))),
        })
    }

    /// The user clicked "Cancel" on x.com: X redirects with `?denied=<token>`.
    /// Returns true when a pending authorization matched.
    pub async fn deny(&self, oauth_token: &str) -> bool {
        self.pending.lock().await.remove(oauth_token).is_some()
    }
}

fn oauth1_base_url(base_url_override: Option<&str>) -> String {
    base_url_override
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_end_matches('/').to_string())
        .or_else(|| {
            std::env::var("VIDEORC_X_OAUTH1_BASE_URL")
                .ok()
                .map(|value| value.trim().trim_end_matches('/').to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| DEFAULT_OAUTH1_BASE_URL.to_string())
}

fn required_field(
    fields: &HashMap<String, String>,
    name: &str,
    response_label: &str,
) -> Result<String> {
    fields
        .get(name)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .with_context(|| format!("X OAuth {response_label} did not include {name}."))
}

/// The OAuth 1.0a token endpoints answer with form-encoded bodies
/// (`oauth_token=...&oauth_token_secret=...`), not JSON.
fn parse_form_body(body: &str) -> HashMap<String, String> {
    body.trim()
        .split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            let key = percent_decode(key);
            (!key.is_empty()).then(|| (key, percent_decode(value)))
        })
        .collect()
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' => {
                let hex = bytes.get(index + 1..index + 3);
                if let Some(byte) = hex
                    .and_then(|hex| std::str::from_utf8(hex).ok())
                    .and_then(|hex| u8::from_str_radix(hex, 16).ok())
                {
                    decoded.push(byte);
                    index += 3;
                } else {
                    decoded.push(b'%');
                    index += 1;
                }
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

fn oauth1_error_detail(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "no error detail".to_string();
    }
    // Token endpoints answer either plain text/HTML or JSON `{"errors": [...]}`.
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed)
        && let Some(errors) = value.get("errors").and_then(|errors| errors.as_array())
    {
        let joined = errors
            .iter()
            .filter_map(|error| {
                error
                    .get("message")
                    .and_then(|message| message.as_str())
                    .or_else(|| error.as_str())
            })
            .collect::<Vec<_>>()
            .join("; ");
        if !joined.is_empty() {
            return joined;
        }
    }
    trimmed.chars().take(300).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Router;
    use axum::http::HeaderMap;
    use axum::response::IntoResponse;
    use axum::routing::post;
    use tokio::net::TcpListener;

    fn consumer() -> XOauth1Consumer {
        XOauth1Consumer {
            key: "consumer-key".to_string(),
            secret: "consumer-secret".to_string(),
            source: "environment",
        }
    }

    async fn spawn_oauth1_stub() -> String {
        async fn request_token(headers: HeaderMap) -> impl IntoResponse {
            let authorization = headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            if !authorization.starts_with("OAuth ")
                || !authorization.contains(r#"oauth_consumer_key="consumer-key""#)
                || !authorization.contains("oauth_callback=")
                || authorization.contains("oauth_token=")
            {
                return (axum::http::StatusCode::UNAUTHORIZED, "bad header").into_response();
            }
            "oauth_token=req-token&oauth_token_secret=req-secret&oauth_callback_confirmed=true"
                .into_response()
        }
        async fn access_token(headers: HeaderMap) -> impl IntoResponse {
            let authorization = headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            if !authorization.contains(r#"oauth_token="req-token""#)
                || !authorization.contains(r#"oauth_verifier="verifier-1""#)
            {
                return (axum::http::StatusCode::UNAUTHORIZED, "bad header").into_response();
            }
            "oauth_token=172483972-final&oauth_token_secret=final-secret&user_id=172483972&screen_name=videorc"
                .into_response()
        }

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new()
                    .route("/oauth/request_token", post(request_token))
                    .route("/oauth/access_token", post(access_token)),
            )
            .await
            .unwrap();
        });
        format!("http://{address}")
    }

    #[tokio::test]
    async fn three_legged_flow_mints_user_access_token() {
        let base = spawn_oauth1_stub().await;
        let sessions = XOauth1Sessions::default();
        let client = reqwest::Client::new();

        let started = sessions
            .start(
                consumer(),
                "http://127.0.0.1:17995/oauth/callback",
                &client,
                Some(&base),
            )
            .await
            .unwrap();
        assert_eq!(
            started.auth_url,
            format!("{base}/oauth/authorize?oauth_token=req-token")
        );
        assert_eq!(
            started.redirect_uri,
            "http://127.0.0.1:17995/oauth/callback"
        );

        let token = sessions
            .complete("req-token", "verifier-1", &client)
            .await
            .unwrap();
        assert_eq!(token.access_token, "172483972-final");
        assert_eq!(token.access_token_secret, "final-secret");
        assert_eq!(token.user_id, "172483972");
        assert_eq!(token.screen_name.as_deref(), Some("@videorc"));
    }

    #[tokio::test]
    async fn completion_is_single_use_and_denial_clears_pending() {
        let base = spawn_oauth1_stub().await;
        let sessions = XOauth1Sessions::default();
        let client = reqwest::Client::new();

        sessions
            .start(
                consumer(),
                "http://127.0.0.1:17995/oauth/callback",
                &client,
                Some(&base),
            )
            .await
            .unwrap();
        assert!(sessions.deny("req-token").await);
        assert!(!sessions.deny("req-token").await);
        let error = sessions
            .complete("req-token", "verifier-1", &client)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("not pending"));
    }

    #[tokio::test]
    async fn unconfirmed_callback_is_a_hard_error_with_registration_hint() {
        async fn request_token() -> impl IntoResponse {
            "oauth_token=req-token&oauth_token_secret=req-secret&oauth_callback_confirmed=false"
        }
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(
                listener,
                Router::new().route("/oauth/request_token", post(request_token)),
            )
            .await
            .unwrap();
        });

        let sessions = XOauth1Sessions::default();
        let error = sessions
            .start(
                consumer(),
                "http://127.0.0.1:17995/oauth/callback",
                &reqwest::Client::new(),
                Some(&format!("http://{address}")),
            )
            .await
            .unwrap_err();
        assert!(error.to_string().contains("callback URL"));
    }

    #[test]
    fn form_body_parsing_percent_decodes_pairs() {
        let fields = parse_form_body("a=1%202&b=x%2By&empty=&c=plus+space");
        assert_eq!(fields.get("a").map(String::as_str), Some("1 2"));
        assert_eq!(fields.get("b").map(String::as_str), Some("x+y"));
        assert_eq!(fields.get("empty").map(String::as_str), Some(""));
        assert_eq!(fields.get("c").map(String::as_str), Some("plus space"));
    }

    #[test]
    fn error_detail_prefers_json_errors_and_truncates_plain_text() {
        assert_eq!(
            oauth1_error_detail(r#"{"errors":[{"message":"Could not authenticate you"}]}"#),
            "Could not authenticate you"
        );
        assert_eq!(oauth1_error_detail("  plain failure  "), "plain failure");
        assert_eq!(oauth1_error_detail(""), "no error detail");
    }
}
