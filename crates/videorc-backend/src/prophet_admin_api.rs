//! HTTP client for the prophet-roja-admin REST API — Zemara's connection to
//! the same backend the admin dashboard and mobile app already read/write
//! (Sermons today; Members/Alerts/Videos as later phases reuse this module).
//!
//! Unlike videorc_api.rs (a fixed first-party host), the base URL and API key
//! here are user-supplied: whoever runs Zemara points it at their own
//! prophet-roja-admin deployment via Settings > Database. Both are stored
//! through the local secret store (secrets.rs) — the same file used for
//! account OAuth tokens — never in a config file or env var. Zemara holds no
//! direct database credentials; every read/write goes through this client to
//! the admin app's existing `/api/admin/*` routes, reusing its Zod
//! validation, service layer, and audit logging instead of duplicating them
//! (owner decision 2026-07-15: "ENSURE THAT THE API IS IN A SEPERATE THING
//! NOT BAKED INTO THIS PROJECT").

use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::secrets::{delete_secrets, put_secrets, try_get_secret};

const BASE_URL_SECRET: &str = "prophet-admin:base-url";
const API_KEY_SECRET: &str = "prophet-admin:api-key";
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const TEST_CONNECTION_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

// ---------------------------------------------------------------------------
// Connection (Settings > Database)
// ---------------------------------------------------------------------------

/// What Settings > Database renders. The raw API key never round-trips back
/// to the renderer once saved — only whether one is set and a tail hint.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminConnection {
    pub base_url: Option<String>,
    pub api_key_configured: bool,
    /// Last 4 characters of the stored key, e.g. `"…8OkI0"` — enough to
    /// confirm "yes that's the one" without exposing the secret.
    pub api_key_hint: Option<String>,
}

pub fn get_connection() -> Result<AdminConnection> {
    let base_url = try_get_secret(BASE_URL_SECRET)?;
    let api_key = try_get_secret(API_KEY_SECRET)?;
    Ok(AdminConnection {
        base_url,
        api_key_configured: api_key.is_some(),
        api_key_hint: api_key.map(|key| tail_hint(&key)),
    })
}

fn tail_hint(secret: &str) -> String {
    let tail: String = secret.chars().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect();
    format!("…{tail}")
}

/// Saves the base URL, and the API key only when a new one is provided —
/// the Database settings field re-sends nothing once the key is masked, so a
/// URL-only edit must not clobber the already-stored key.
pub fn set_connection(base_url: &str, api_key: Option<&str>) -> Result<()> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        bail!("Admin API base URL cannot be empty.");
    }
    match api_key.map(str::trim).filter(|key| !key.is_empty()) {
        Some(key) => put_secrets(&[(BASE_URL_SECRET, base_url), (API_KEY_SECRET, key)]),
        None => put_secrets(&[(BASE_URL_SECRET, base_url)]),
    }
}

pub fn clear_connection() -> Result<()> {
    delete_secrets(&[BASE_URL_SECRET, API_KEY_SECRET])
}

fn load_credentials() -> Result<(String, String)> {
    let base_url = try_get_secret(BASE_URL_SECRET)?
        .filter(|url| !url.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("The admin API base URL is not configured yet."))?;
    let api_key = try_get_secret(API_KEY_SECRET)?
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("The admin API key is not configured yet."))?;
    Ok((base_url, api_key))
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub reachable: bool,
    pub database_ok: bool,
    pub auth_ok: bool,
    pub message: String,
}

impl ConnectionTestResult {
    fn failure(message: impl Into<String>) -> Self {
        Self { reachable: false, database_ok: false, auth_ok: false, message: message.into() }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheck {
    #[allow(dead_code)]
    status: String,
    database: String,
    #[serde(default)]
    auth: Option<String>,
}

/// Tests exactly the base URL + key currently on screen — not what's saved —
/// so Settings can validate an edit before the user commits to Save.
pub async fn test_connection(base_url: &str, api_key: &str) -> ConnectionTestResult {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return ConnectionTestResult::failure("Enter the admin API base URL first.");
    }
    if api_key.trim().is_empty() {
        return ConnectionTestResult::failure("Enter the admin API key first.");
    }

    let http = match build_http_client(TEST_CONNECTION_TIMEOUT) {
        Ok(client) => client,
        Err(error) => return ConnectionTestResult::failure(format!("{error:#}")),
    };

    let url = format!("{base_url}/api/health");
    let response = match http.get(&url).bearer_auth(api_key.trim()).send().await {
        Ok(response) => response,
        Err(error) => return ConnectionTestResult::failure(format!("Could not reach {url}: {error}")),
    };
    let status = response.status();

    match response.json::<HealthCheck>().await {
        Ok(health) => {
            let database_ok = health.database == "reachable";
            let auth_ok = health.auth.as_deref() == Some("ok");
            let message = if !database_ok {
                "Reached the admin API, but its database is unreachable.".to_string()
            } else if !auth_ok {
                "Reached the admin API, but it rejected this API key.".to_string()
            } else {
                "Connected.".to_string()
            };
            ConnectionTestResult { reachable: true, database_ok, auth_ok, message }
        }
        Err(_) => ConnectionTestResult::failure(format!(
            "Unexpected response from {url} ({status}). Is this the right base URL?"
        )),
    }
}

// ---------------------------------------------------------------------------
// Registration (first-run: create a brand-new church workspace)
// ---------------------------------------------------------------------------

/// What a successful registration hands back — the caller is expected to
/// immediately persist `base_url` + `api_key` via `set_connection` so the
/// rest of the app can start using it.
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResult {
    pub app_id: String,
    pub app_slug: String,
    pub api_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterRequestBody<'a> {
    organization_name: &'a str,
    owner_name: &'a str,
    owner_email: &'a str,
    owner_password: &'a str,
}

/// Public, unauthenticated — there is no API key yet. This is how a brand
/// new church creates its own tenant (App + Owner TeamUser + first API key)
/// from Zemara's Database settings before it has anything else configured.
pub async fn register_organization(
    base_url: &str,
    organization_name: &str,
    owner_name: &str,
    owner_email: &str,
    owner_password: &str,
) -> Result<RegisterResult> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        bail!("Enter the admin API base URL first.");
    }

    let http = build_http_client(REQUEST_TIMEOUT)?;
    let url = format!("{base_url}/api/register");
    let body = RegisterRequestBody { organization_name, owner_name, owner_email, owner_password };
    let response = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .with_context(|| format!("Could not reach {url}."))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .with_context(|| format!("Could not read the response from {url}."))?;
    let envelope: ApiEnvelope<RegisterResult> = serde_json::from_str(&text)
        .with_context(|| format!("Could not parse the response from {url} ({status})."))?;
    if !envelope.ok {
        bail!(envelope.error.unwrap_or_else(|| format!("Registration failed ({status}).")));
    }
    envelope
        .data
        .ok_or_else(|| anyhow::anyhow!("Registration response had no data."))
}

fn build_http_client(timeout: std::time::Duration) -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(concat!("Zemara-Desktop/", env!("CARGO_PKG_VERSION")))
        .timeout(timeout)
        .build()
        .context("Could not build the admin API HTTP client.")
}

// ---------------------------------------------------------------------------
// Sermon models (mirrors prophet-roja-admin's sermon.schema.ts / Prisma model
// exactly — field names and nullability, verified against a live response)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SermonSeries {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub image_path: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SermonTopicSummary {
    #[allow(dead_code)]
    id: String,
    name: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct SermonTopicLink {
    topic: SermonTopicSummary,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminSermon {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub series_id: Option<String>,
    #[serde(default)]
    pub speaker_name: Option<String>,
    #[serde(default)]
    pub scripture: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub audio_url: Option<String>,
    #[serde(default)]
    pub video_id: Option<String>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    pub status: String,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub views_count: i64,
    #[serde(default)]
    pub saves_count: i64,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub series: Option<SermonSeries>,
    // The admin API's Prisma include nests topics as `{ topic: {...} }` link
    // rows — flattened into `topics` below so callers never see that shape.
    #[serde(default, skip_serializing, rename = "topics")]
    topic_links: Vec<SermonTopicLink>,
    #[serde(default, skip_deserializing)]
    pub topics: Vec<String>,
}

impl AdminSermon {
    fn finish_deserialize(mut self) -> Self {
        self.topics = self.topic_links.iter().map(|link| link.topic.name.clone()).collect();
        self
    }
}

impl<'de> serde::Deserialize<'de> for SermonWithFlattenedTopics {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Ok(SermonWithFlattenedTopics(AdminSermon::deserialize(deserializer)?.finish_deserialize()))
    }
}

/// Deserialization shim so callers get `AdminSermon` with `topics` already
/// flattened, without hand-writing a full custom `Deserialize` impl.
struct SermonWithFlattenedTopics(AdminSermon);

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSermonRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scripture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<String>>,
}

/// All fields optional (PATCH semantics): omit a field to leave it
/// unchanged, or send `Some(String::new())` to clear a nullable field — the
/// admin API's repository already treats `""` as "set to null" (`|| null`).
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSermonRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub series_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scripture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<String>>,
}

// ---------------------------------------------------------------------------
// Video models (mirrors prophet-roja-admin's Video Prisma model / video.dto.ts
// exactly — field names and nullability, verified against a live response)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoCategory {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub slug: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminVideo {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub speaker_name: Option<String>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub video_path: Option<String>,
    #[serde(default)]
    pub video_url: Option<String>,
    pub storage_disk: String,
    #[serde(default)]
    pub duration_seconds: Option<i64>,
    pub status: String,
    #[serde(default)]
    pub visibility: String,
    /// 0/1, matching the admin API's MySQL-style Int boolean.
    #[serde(default)]
    pub is_featured: i64,
    #[serde(default)]
    pub views_count: i64,
    #[serde(default)]
    pub saves_count: i64,
    #[serde(default)]
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // The admin API's toAdminVideoDto flattens the category join into this
    // array (a video has at most one, in practice) — take the first, if any.
    #[serde(default, skip_serializing, rename = "categories")]
    category_list: Vec<VideoCategory>,
    #[serde(default, skip_deserializing)]
    pub category: Option<VideoCategory>,
}

impl AdminVideo {
    fn finish_deserialize(mut self) -> Self {
        self.category = self.category_list.first().cloned();
        self
    }
}

/// Deserialization shim so callers get `AdminVideo` with `category` already
/// flattened, without hand-writing a full custom `Deserialize` impl.
struct VideoWithFlattenedCategory(AdminVideo);

impl<'de> serde::Deserialize<'de> for VideoWithFlattenedCategory {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Ok(VideoWithFlattenedCategory(
            AdminVideo::deserialize(deserializer)?.finish_deserialize(),
        ))
    }
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVideoRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_name: Option<String>,
    pub video_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateVideoRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speaker_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVideoCategoryRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSeriesRequest {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
}

// ---------------------------------------------------------------------------
// Member models (mirrors prophet-roja-admin's Member/MemberDevice Prisma
// models — field names and nullability, verified against a live response.
// Sensitive fields the admin API's /api/admin/members route happens to
// return — passwordHash, passwordResetToken, clerkUserId — are deliberately
// left off this struct; serde ignores unknown JSON fields by default, so
// they're simply never parsed into Zemara's process.)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberDevice {
    pub id: String,
    pub platform: String,
    #[serde(default)]
    pub device_token: Option<String>,
    #[serde(default)]
    pub app_version: Option<String>,
    #[serde(default)]
    pub build_number: Option<String>,
    #[serde(default)]
    pub notification_permission: Option<String>,
    pub last_seen_at: String,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminMember {
    pub id: String,
    #[serde(default)]
    pub location_id: Option<String>,
    pub full_name: String,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub birth_year: Option<i64>,
    pub status: String,
    /// 0/1, matching the admin API's MySQL-style Int boolean.
    #[serde(default)]
    pub notification_enabled: i64,
    #[serde(default)]
    pub last_login_at: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub username: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub devices: Vec<MemberDevice>,
    /// Present (and non-null) only in the response right after
    /// admin.members.create — the one time the plaintext default password
    /// is available. Never returned by list/get; there is no way to recover
    /// it afterward, by design (see CreateMemberRequest doc comment).
    #[serde(default)]
    pub default_password: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemberRequest {
    pub full_name: String,
    pub phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_enabled: Option<bool>,
}

/// All fields optional (PATCH semantics): omit a field to leave it
/// unchanged — same convention as UpdateSermonRequest/UpdateVideoRequest.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemberRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notification_enabled: Option<bool>,
}

#[derive(Debug, Clone, Default, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MembersStats {
    #[serde(default)]
    pub total_members: i64,
    #[serde(default)]
    pub active_members: i64,
    #[serde(default)]
    pub push_enabled: i64,
    #[serde(default)]
    pub new_this_month: i64,
    #[serde(default)]
    pub countries_count: i64,
    #[serde(default)]
    pub countries: Vec<String>,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MembersPage {
    pub items: Vec<AdminMember>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
    #[serde(default)]
    pub stats: MembersStats,
}

// ---------------------------------------------------------------------------
// Notification campaign models (mirrors prophet-roja-admin's
// NotificationCampaign Prisma model / notification.schema.ts exactly)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationCampaign {
    pub id: String,
    pub title: String,
    pub body: String,
    pub target: String,
    /// "draft" | "scheduled" | "sent"
    pub status: String,
    #[serde(default)]
    pub image_path: Option<String>,
    /// 0/1, matching the admin API's MySQL-style Int boolean.
    #[serde(default)]
    pub show_in_app: i64,
    #[serde(default)]
    pub send_push: i64,
    #[serde(default)]
    pub scheduled_at: Option<String>,
    #[serde(default)]
    pub sent_at: Option<String>,
    #[serde(default)]
    pub sent_count: i64,
    #[serde(default)]
    pub failed_count: i64,
    #[serde(default)]
    pub opened_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCampaignRequest {
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    /// ISO 8601 — presence (and being in the future) is what makes the admin
    /// API schedule instead of sending immediately.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_in_app: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_push: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
}

/// All fields optional (PATCH semantics) — only draft/scheduled campaigns
/// can be updated; the admin API rejects edits to already-sent ones.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCampaignRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
}

// ---------------------------------------------------------------------------
// YouTube search / bulk-import models (mirrors prophet-roja-admin's
// youtubeSearchSchema / createFromYouTubeSchema response and request shapes)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeSearchResult {
    pub video_id: String,
    pub title: String,
    pub channel_title: String,
    pub thumbnail_url: String,
    #[serde(default)]
    pub duration_seconds: Option<i64>,
    #[serde(default)]
    pub published_at: Option<String>,
    pub video_url: String,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeImportItem {
    pub video_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_title: Option<String>,
    pub thumbnail_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<i64>,
    pub video_url: String,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeImportRequest {
    pub videos: Vec<YoutubeImportItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    /// "draft" | "published"
    pub status: String,
}

// ---------------------------------------------------------------------------
// Event models (mirrors prophet-roja-admin's Event Prisma model exactly —
// field names and nullability, verified against a live response)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminEvent {
    pub id: String,
    #[serde(default)]
    pub church_location_id: Option<String>,
    pub title: String,
    pub slug: String,
    #[serde(default)]
    pub description: Option<String>,
    pub category: String,
    pub event_type: String,
    pub status: String,
    pub starts_at: String,
    #[serde(default)]
    pub ends_at: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub location_name: Option<String>,
    #[serde(default)]
    pub location_address: Option<String>,
    #[serde(default)]
    pub location_lat: Option<f64>,
    #[serde(default)]
    pub location_lng: Option<f64>,
    #[serde(default)]
    pub online_url: Option<String>,
    #[serde(default)]
    pub image_path: Option<String>,
    #[serde(default)]
    pub capacity: Option<i64>,
    #[serde(default)]
    pub registered_count: i64,
    #[serde(default)]
    pub is_recurring: bool,
    #[serde(default)]
    pub recurrence_rule: Option<String>,
    #[serde(default)]
    pub recurrence_group_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventRequest {
    pub title: String,
    pub starts_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub church_location_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_lng: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub online_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_recurring: Option<bool>,
    /// "weekly" or "monthly"; server defaults to weekly if omitted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_freq: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_interval: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recurrence_until: Option<String>,
}

/// All fields optional (PATCH semantics): omit a field to leave it unchanged.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub church_location_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starts_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ends_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_lat: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_lng: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub online_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity: Option<i64>,
    /// When true and the event belongs to a recurrence series, applies the
    /// rest of this update (excluding starts_at/ends_at) to every future
    /// occurrence in the series, not just this one row.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apply_to_series: Option<bool>,
}

/// QR-code attendance session — one per Event occurrence, created on demand
/// when an admin opens attendance (absence of a session means it was never
/// opened for that occurrence).
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceSession {
    pub id: String,
    pub event_id: String,
    pub status: String,
    pub qr_rotation_seconds: i64,
    pub geofence_radius_meters: i64,
    pub opened_by: String,
    pub opened_at: String,
    #[serde(default)]
    pub closed_by: Option<String>,
    #[serde(default)]
    pub closed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// One person marked present at a session, via QR self-scan or an admin's
/// manual override.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceRecord {
    pub id: String,
    pub session_id: String,
    pub event_id: String,
    pub member_id: String,
    pub status: String,
    pub method: String,
    pub checked_in_at: String,
    #[serde(default)]
    pub minutes_late: Option<i64>,
    pub display_name_snapshot: String,
    #[serde(default)]
    pub qr_nonce: Option<String>,
    #[serde(default)]
    pub device_installation_id: Option<String>,
    #[serde(default)]
    pub latitude: Option<f64>,
    #[serde(default)]
    pub longitude: Option<f64>,
    #[serde(default)]
    pub accuracy_meters: Option<f64>,
    #[serde(default)]
    pub distance_from_event_meters: Option<f64>,
    #[serde(default)]
    pub inside_geofence: Option<bool>,
    #[serde(default)]
    pub recorded_by_user_id: Option<String>,
    #[serde(default)]
    pub manual_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// The current rotating QR token for a session, minted fresh on every call
/// (no per-rotation row is persisted — the signature + short expiry are the
/// security, verified statelessly on scan).
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceQr {
    pub token: String,
    pub rotation: i64,
    pub expires_at: String,
    pub rotation_seconds: i64,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceList {
    #[serde(default)]
    pub session: Option<AttendanceSession>,
    pub records: Vec<AttendanceRecord>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualCheckInRequest {
    pub member_id: String,
    pub manual_reason: String,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
pub struct UnitMembershipCount {
    pub memberships: i64,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitMemberSummary {
    pub id: String,
    pub full_name: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

/// Departments, ministries, teams, and small groups are all rows in this one
/// nestable type (see the matching Prisma model) — distinguished only by
/// `unit_type`. List responses come back with `positions`/`_count` populated;
/// the single-unit detail response also includes `memberships`/`childUnits`/
/// `parentUnit`. Both shapes deserialize into this same struct.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationalUnit {
    pub id: String,
    #[serde(default)]
    pub parent_unit_id: Option<String>,
    #[serde(rename = "type")]
    pub unit_type: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, rename = "_count")]
    pub member_count: Option<UnitMembershipCount>,
    #[serde(default)]
    pub positions: Option<Vec<OrganizationalUnitPosition>>,
    #[serde(default)]
    pub memberships: Option<Vec<OrganizationalUnitMembership>>,
    #[serde(default)]
    pub child_units: Option<Vec<OrganizationalUnit>>,
    #[serde(default)]
    pub parent_unit: Option<Box<OrganizationalUnit>>,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationalUnitMembership {
    pub id: String,
    pub unit_id: String,
    pub member_id: String,
    pub status: String,
    pub joined_at: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub member: Option<UnitMemberSummary>,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationalUnitPosition {
    pub id: String,
    pub unit_id: String,
    pub name: String,
    pub is_leadership_position: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub assignments: Option<Vec<OrganizationalUnitPositionAssignment>>,
}

/// History of who held a position and when, rather than a single leader
/// field on the unit — a past Choir Director doesn't just disappear when a
/// new one is assigned, they get `status: "ended"` + `endedAt` instead.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationalUnitPositionAssignment {
    pub id: String,
    pub unit_id: String,
    pub position_id: String,
    pub member_id: String,
    pub status: String,
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub member: Option<UnitMemberSummary>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnitRequest {
    #[serde(rename = "type")]
    pub unit_type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_unit_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUnitRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub unit_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_unit_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddUnitMemberRequest {
    pub member_id: String,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnitPositionRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_leadership_position: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignUnitPositionRequest {
    pub member_id: String,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
pub struct LocationCounts {
    pub members: i64,
    pub events: i64,
}

/// A physical branch/campus/parish/assembly belonging to one church
/// organization — NOT a university campus.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub id: String,
    #[serde(rename = "type")]
    pub location_type: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub address_line1: Option<String>,
    #[serde(default)]
    pub address_line2: Option<String>,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub state_or_region: Option<String>,
    #[serde(default)]
    pub postal_code: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub latitude: Option<f64>,
    #[serde(default)]
    pub longitude: Option<f64>,
    #[serde(default)]
    pub timezone: Option<String>,
    pub is_headquarters: bool,
    pub is_online: bool,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, rename = "_count")]
    pub counts: Option<LocationCounts>,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocationRequest {
    #[serde(rename = "type")]
    pub location_type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_line1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_line2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_or_region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub postal_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_headquarters: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_online: Option<bool>,
}

/// All fields optional (PATCH semantics): omit a field to leave it unchanged.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLocationRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub location_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_line1: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address_line2: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state_or_region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub postal_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_headquarters: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_online: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// A person with dashboard access — never includes passwordHash (the admin
/// API deliberately never selects it out to any client).
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub status: String,
    #[serde(default)]
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTeamUserRequest {
    pub name: String,
    pub email: String,
    pub role: String,
}

/// All fields optional (PATCH semantics): omit a field to leave it unchanged.
#[derive(Debug, Clone, Default, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTeamUserRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// Response from `/api/uploads/image` — a bespoke `{ ok, url, path }` shape
/// (not the usual `{ ok, data, error }` envelope every other route uses).
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedImage {
    pub url: String,
    pub path: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct UploadImageResponse {
    ok: bool,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

/// A single OpenStreetMap Nominatim search result, narrowed to what the
/// location-picker UI needs.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
pub struct GeocodeResult {
    pub display_name: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct NominatimResult {
    display_name: String,
    lat: String,
    lon: String,
}

/// Place-name search via OpenStreetMap's free public Nominatim API — no API
/// key required. Called from the Rust process (not the renderer) because the
/// renderer's CSP only allows connections to the admin backend and a handful
/// of first-party hosts; a third-party geocoding host would be blocked there.
/// Nominatim's usage policy requires a descriptive User-Agent and asks
/// callers to debounce/throttle — the renderer side debounces before this is
/// ever invoked.
pub async fn geocode_search(query: &str) -> Result<Vec<GeocodeResult>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let http = build_http_client(REQUEST_TIMEOUT)?;
    let response = http
        .get("https://nominatim.openstreetmap.org/search")
        .header("User-Agent", "Zemara/1.0 (https://www.videorc.com)")
        .query(&[
            ("q", query),
            ("format", "jsonv2"),
            ("addressdetails", "0"),
            ("limit", "5"),
        ])
        .send()
        .await
        .context("Could not reach the location search service.")?;
    if !response.status().is_success() {
        bail!("Location search failed ({}).", response.status());
    }
    let results: Vec<NominatimResult> =
        response.json().await.context("Location search returned an unexpected response.")?;
    Ok(results
        .into_iter()
        .filter_map(|entry| {
            Some(GeocodeResult {
                display_name: entry.display_name,
                lat: entry.lat.parse().ok()?,
                lon: entry.lon.parse().ok()?,
            })
        })
        .collect())
}

/// A single Photon GeoJSON feature's address parts, narrowed to what label
/// formatting needs. Photon (unlike Nominatim) returns structured parts
/// rather than one display string, so `format_geocode_label` stitches them.
#[derive(Debug, Clone, Default, serde::Deserialize)]
struct PhotonProperties {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    housenumber: Option<String>,
    #[serde(default)]
    street: Option<String>,
    #[serde(default)]
    district: Option<String>,
    #[serde(default)]
    city: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    country: Option<String>,
}

/// Mirrors prophet-roja-admin's `formatGeocodeLabel` (src/lib/geocode.ts)
/// exactly, so a reverse-geocoded address reads the same in both apps.
fn format_geocode_label(props: &PhotonProperties) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(name) = props.name.as_deref().filter(|value| !value.is_empty()) {
        parts.push(name.to_string());
    }
    let house_street = [props.housenumber.as_deref(), props.street.as_deref()]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    if !house_street.trim().is_empty() {
        parts.push(house_street.trim().to_string());
    }
    for value in [&props.district, &props.city, &props.state, &props.country]
        .into_iter()
        .flatten()
        .filter(|value| !value.is_empty())
    {
        parts.push(value.clone());
    }
    let mut seen = std::collections::HashSet::new();
    parts.retain(|part| seen.insert(part.clone()));
    parts.join(", ")
}

/// A human-readable address for a pair of coordinates.
#[derive(Debug, Clone, serde::Deserialize, Serialize)]
pub struct GeocodeReverseResult {
    pub label: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct PhotonReverseFeature {
    properties: PhotonProperties,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct PhotonReverseResponse {
    features: Vec<PhotonReverseFeature>,
}

/// Reverse geocoding (coordinates -> address label) via Komoot's free public
/// Photon API — matches prophet-roja-admin's own `/api/admin/geocode/reverse`
/// route exactly (same endpoint, same label formatting), so the location
/// map's auto-filled address reads the same in both apps. Called from Rust
/// for the same CSP reason as `geocode_search` above.
pub async fn geocode_reverse(lat: f64, lng: f64) -> Result<GeocodeReverseResult> {
    let http = build_http_client(REQUEST_TIMEOUT)?;
    let response = http
        .get("https://photon.komoot.io/reverse")
        .header("Accept", "application/json")
        .query(&[("lat", lat.to_string()), ("lon", lng.to_string())])
        .send()
        .await
        .context("Could not reach the reverse geocoding service.")?;
    if !response.status().is_success() {
        bail!("Reverse geocoding failed ({}).", response.status());
    }
    let result: PhotonReverseResponse =
        response.json().await.context("Reverse geocoding returned an unexpected response.")?;
    let label = result
        .features
        .first()
        .map(|feature| format_geocode_label(&feature.properties))
        .unwrap_or_default();
    Ok(GeocodeReverseResult { label })
}

// ---------------------------------------------------------------------------
// Living Text — Bible translation/verse sync models (mirrors
// prophet-roja-admin's BibleTranslation/BibleVerse Prisma models)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBibleTranslation {
    pub id: String,
    pub code: String,
    pub name: String,
    pub language: String,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBibleVerse {
    pub book: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[derive(Debug, Clone, serde::Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminBibleVerseExport {
    pub translation: AdminBibleTranslation,
    pub verses: Vec<AdminBibleVerse>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize)]
#[serde(bound(deserialize = "T: DeserializeOwned"))]
struct ApiEnvelope<T> {
    ok: bool,
    #[serde(default)]
    data: Option<T>,
    #[serde(default)]
    error: Option<String>,
}

/// A thin client over prophet-roja-admin's `/api/admin/*` REST API.
#[derive(Clone)]
pub struct ProphetAdminApiClient {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}

impl ProphetAdminApiClient {
    /// Builds a client from the connection stored via `set_connection`.
    /// Fails clearly if Settings > Database hasn't been configured yet.
    pub fn connect() -> Result<Self> {
        let (base_url, api_key) = load_credentials()?;
        Self::new(base_url, api_key)
    }

    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Result<Self> {
        Ok(Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            http: build_http_client(REQUEST_TIMEOUT)?,
        })
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let response = self
            .http
            .get(self.endpoint(path))
            .bearer_auth(&self.api_key)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        Self::unwrap_data(response, path).await
    }

    async fn get_with_query<T: DeserializeOwned>(&self, path: &str, params: &[(&str, String)]) -> Result<T> {
        let response = self
            .http
            .get(self.endpoint(path))
            .bearer_auth(&self.api_key)
            .query(params)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        Self::unwrap_data(response, path).await
    }

    async fn post_json<T: DeserializeOwned, B: Serialize + ?Sized>(&self, path: &str, body: &B) -> Result<T> {
        let response = self
            .http
            .post(self.endpoint(path))
            .bearer_auth(&self.api_key)
            .json(body)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        Self::unwrap_data(response, path).await
    }

    async fn post_no_body<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let response = self
            .http
            .post(self.endpoint(path))
            .bearer_auth(&self.api_key)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        Self::unwrap_data(response, path).await
    }

    async fn patch_json<T: DeserializeOwned, B: Serialize + ?Sized>(&self, path: &str, body: &B) -> Result<T> {
        let response = self
            .http
            .patch(self.endpoint(path))
            .bearer_auth(&self.api_key)
            .json(body)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        Self::unwrap_data(response, path).await
    }

    async fn delete_ok(&self, path: &str) -> Result<()> {
        let response = self
            .http
            .delete(self.endpoint(path))
            .bearer_auth(&self.api_key)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        Self::check_ok(response, path).await
    }

    async fn unwrap_data<T: DeserializeOwned>(response: reqwest::Response, path: &str) -> Result<T> {
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            bail!("The admin API rejected this API key. Check Settings > Database.");
        }
        let text = response
            .text()
            .await
            .with_context(|| format!("Could not read the admin API response for {path}."))?;
        let envelope: ApiEnvelope<T> = serde_json::from_str(&text)
            .with_context(|| format!("Could not parse the admin API response for {path}."))?;
        if !envelope.ok {
            bail!(envelope.error.unwrap_or_else(|| format!("Admin API request to {path} failed ({status}).")));
        }
        envelope
            .data
            .ok_or_else(|| anyhow::anyhow!("Admin API response for {path} had no data."))
    }

    async fn check_ok(response: reqwest::Response, path: &str) -> Result<()> {
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            bail!("The admin API rejected this API key. Check Settings > Database.");
        }
        let text = response
            .text()
            .await
            .with_context(|| format!("Could not read the admin API response for {path}."))?;
        let envelope: ApiEnvelope<serde_json::Value> = serde_json::from_str(&text)
            .with_context(|| format!("Could not parse the admin API response for {path}."))?;
        if !envelope.ok {
            bail!(envelope.error.unwrap_or_else(|| format!("Admin API request to {path} failed ({status}).")));
        }
        Ok(())
    }

    pub async fn list_sermons(&self) -> Result<Vec<AdminSermon>> {
        let raw: Vec<SermonWithFlattenedTopics> = self.get("/api/admin/sermons").await?;
        Ok(raw.into_iter().map(|entry| entry.0).collect())
    }

    pub async fn create_sermon(&self, request: &CreateSermonRequest) -> Result<AdminSermon> {
        let raw: SermonWithFlattenedTopics = self.post_json("/api/admin/sermons", request).await?;
        Ok(raw.0)
    }

    pub async fn update_sermon(&self, id: &str, request: &UpdateSermonRequest) -> Result<AdminSermon> {
        let raw: SermonWithFlattenedTopics =
            self.patch_json(&format!("/api/admin/sermons/{id}"), request).await?;
        Ok(raw.0)
    }

    pub async fn delete_sermon(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/sermons/{id}")).await
    }

    pub async fn list_series(&self) -> Result<Vec<SermonSeries>> {
        self.get("/api/admin/sermons/series").await
    }

    pub async fn create_series(&self, request: &CreateSeriesRequest) -> Result<SermonSeries> {
        self.post_json("/api/admin/sermons/series", request).await
    }

    pub async fn list_videos(&self) -> Result<Vec<AdminVideo>> {
        let raw: Vec<VideoWithFlattenedCategory> = self.get("/api/admin/videos").await?;
        Ok(raw.into_iter().map(|entry| entry.0).collect())
    }

    pub async fn create_video(&self, request: &CreateVideoRequest) -> Result<AdminVideo> {
        let raw: VideoWithFlattenedCategory = self.post_json("/api/admin/videos", request).await?;
        Ok(raw.0)
    }

    pub async fn update_video(&self, id: &str, request: &UpdateVideoRequest) -> Result<AdminVideo> {
        let raw: VideoWithFlattenedCategory =
            self.patch_json(&format!("/api/admin/videos/{id}"), request).await?;
        Ok(raw.0)
    }

    pub async fn delete_video(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/videos/{id}")).await
    }

    /// Toggles the video's featured spotlight slot (surfaced as "Featured
    /// Teaching"/"Featured Now" on the mobile Home/Watch tabs). This route
    /// predates the `{ok, data, error}` envelope the rest of the admin API
    /// uses — it replies `{ok, isFeatured}` directly — so it can't go
    /// through `post_json`/`unwrap_data`.
    pub async fn toggle_video_featured(&self, id: &str) -> Result<bool> {
        let path = format!("/api/videos/{id}/feature");
        let response = self
            .http
            .post(self.endpoint(&path))
            .bearer_auth(&self.api_key)
            .send()
            .await
            .with_context(|| format!("Could not reach the admin API at {path}."))?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            bail!("The admin API rejected this API key. Check Settings > Database.");
        }
        let text = response
            .text()
            .await
            .with_context(|| format!("Could not read the admin API response for {path}."))?;
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FeatureToggleResponse {
            ok: bool,
            #[serde(default)]
            is_featured: Option<i64>,
            #[serde(default)]
            error: Option<String>,
        }
        let parsed: FeatureToggleResponse = serde_json::from_str(&text)
            .with_context(|| format!("Could not parse the admin API response for {path}."))?;
        if !parsed.ok {
            bail!(parsed.error.unwrap_or_else(|| format!("Admin API request to {path} failed ({status}).")));
        }
        Ok(parsed.is_featured == Some(1))
    }

    pub async fn list_video_categories(&self) -> Result<Vec<VideoCategory>> {
        self.get("/api/admin/videos/categories").await
    }

    pub async fn create_video_category(
        &self,
        request: &CreateVideoCategoryRequest,
    ) -> Result<VideoCategory> {
        self.post_json("/api/admin/videos/categories", request).await
    }

    pub async fn list_members(
        &self,
        query: Option<&str>,
        status: Option<&str>,
        country: Option<&str>,
        page: u32,
        page_size: u32,
    ) -> Result<MembersPage> {
        let mut params: Vec<(&str, String)> =
            vec![("page", page.to_string()), ("pageSize", page_size.to_string())];
        if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
            params.push(("q", query.to_string()));
        }
        if let Some(status) = status.map(str::trim).filter(|value| !value.is_empty()) {
            params.push(("status", status.to_string()));
        }
        if let Some(country) = country.map(str::trim).filter(|value| !value.is_empty()) {
            params.push(("country", country.to_string()));
        }
        self.get_with_query("/api/admin/members", &params).await
    }

    pub async fn create_member(&self, request: &CreateMemberRequest) -> Result<AdminMember> {
        self.post_json("/api/admin/members", request).await
    }

    pub async fn update_member(&self, id: &str, request: &UpdateMemberRequest) -> Result<AdminMember> {
        self.patch_json(&format!("/api/admin/members/{id}"), request).await
    }

    pub async fn delete_member(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/members/{id}")).await
    }

    pub async fn list_campaigns(&self) -> Result<Vec<NotificationCampaign>> {
        self.get("/api/notifications").await
    }

    pub async fn create_campaign(&self, request: &CreateCampaignRequest) -> Result<NotificationCampaign> {
        self.post_json("/api/notifications", request).await
    }

    pub async fn update_campaign(
        &self,
        id: &str,
        request: &UpdateCampaignRequest,
    ) -> Result<NotificationCampaign> {
        self.patch_json(&format!("/api/notifications/{id}"), request).await
    }

    pub async fn delete_campaign(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/notifications/{id}")).await
    }

    pub async fn send_campaign_now(&self, id: &str) -> Result<NotificationCampaign> {
        self.post_no_body(&format!("/api/notifications/{id}/send")).await
    }

    pub async fn search_youtube(&self, query: &str) -> Result<Vec<YoutubeSearchResult>> {
        self.get_with_query("/api/videos/youtube-search", &[("q", query.to_string())]).await
    }

    pub async fn import_from_youtube(&self, request: &YoutubeImportRequest) -> Result<Vec<AdminVideo>> {
        let raw: Vec<VideoWithFlattenedCategory> =
            self.post_json("/api/videos/youtube-import", request).await?;
        Ok(raw.into_iter().map(|entry| entry.0).collect())
    }

    pub async fn list_events(&self) -> Result<Vec<AdminEvent>> {
        self.get("/api/admin/events").await
    }

    pub async fn create_event(&self, request: &CreateEventRequest) -> Result<AdminEvent> {
        self.post_json("/api/admin/events", request).await
    }

    pub async fn update_event(&self, id: &str, request: &UpdateEventRequest) -> Result<AdminEvent> {
        self.patch_json(&format!("/api/admin/events/{id}"), request).await
    }

    pub async fn delete_event(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/events/{id}")).await
    }

    pub async fn open_attendance(&self, event_id: &str) -> Result<AttendanceSession> {
        self.post_no_body(&format!("/api/admin/events/{event_id}/attendance/open")).await
    }

    pub async fn close_attendance(&self, event_id: &str) -> Result<AttendanceSession> {
        self.post_no_body(&format!("/api/admin/events/{event_id}/attendance/close")).await
    }

    pub async fn get_attendance_qr(&self, event_id: &str) -> Result<AttendanceQr> {
        self.get(&format!("/api/admin/events/{event_id}/attendance/qr")).await
    }

    pub async fn list_attendance(&self, event_id: &str) -> Result<AttendanceList> {
        self.get(&format!("/api/admin/events/{event_id}/attendance")).await
    }

    pub async fn manual_check_in(
        &self,
        event_id: &str,
        request: &ManualCheckInRequest,
    ) -> Result<AttendanceRecord> {
        self.post_json(&format!("/api/admin/events/{event_id}/attendance/manual"), request).await
    }

    pub async fn delete_attendance_record(&self, event_id: &str, record_id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/events/{event_id}/attendance/{record_id}")).await
    }

    pub async fn list_units(&self) -> Result<Vec<OrganizationalUnit>> {
        self.get("/api/admin/units").await
    }

    pub async fn get_unit(&self, id: &str) -> Result<OrganizationalUnit> {
        self.get(&format!("/api/admin/units/{id}")).await
    }

    pub async fn create_unit(&self, request: &CreateUnitRequest) -> Result<OrganizationalUnit> {
        self.post_json("/api/admin/units", request).await
    }

    pub async fn update_unit(&self, id: &str, request: &UpdateUnitRequest) -> Result<OrganizationalUnit> {
        self.patch_json(&format!("/api/admin/units/{id}"), request).await
    }

    pub async fn delete_unit(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/units/{id}")).await
    }

    pub async fn add_unit_member(&self, unit_id: &str, request: &AddUnitMemberRequest) -> Result<OrganizationalUnitMembership> {
        self.post_json(&format!("/api/admin/units/{unit_id}/members"), request).await
    }

    pub async fn remove_unit_member(&self, unit_id: &str, membership_id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/units/{unit_id}/members/{membership_id}")).await
    }

    pub async fn create_unit_position(
        &self,
        unit_id: &str,
        request: &CreateUnitPositionRequest,
    ) -> Result<OrganizationalUnitPosition> {
        self.post_json(&format!("/api/admin/units/{unit_id}/positions"), request).await
    }

    pub async fn delete_unit_position(&self, unit_id: &str, position_id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/units/{unit_id}/positions/{position_id}")).await
    }

    pub async fn assign_unit_position(
        &self,
        unit_id: &str,
        position_id: &str,
        request: &AssignUnitPositionRequest,
    ) -> Result<OrganizationalUnitPositionAssignment> {
        self.post_json(&format!("/api/admin/units/{unit_id}/positions/{position_id}/assignments"), request).await
    }

    pub async fn end_unit_position_assignment(
        &self,
        unit_id: &str,
        position_id: &str,
        assignment_id: &str,
    ) -> Result<OrganizationalUnitPositionAssignment> {
        self.post_no_body(&format!(
            "/api/admin/units/{unit_id}/positions/{position_id}/assignments/{assignment_id}/end"
        ))
        .await
    }

    pub async fn list_locations(&self) -> Result<Vec<Location>> {
        self.get("/api/admin/locations").await
    }

    pub async fn create_location(&self, request: &CreateLocationRequest) -> Result<Location> {
        self.post_json("/api/admin/locations", request).await
    }

    pub async fn update_location(&self, id: &str, request: &UpdateLocationRequest) -> Result<Location> {
        self.patch_json(&format!("/api/admin/locations/{id}"), request).await
    }

    pub async fn delete_location(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/locations/{id}")).await
    }

    pub async fn list_team_users(&self) -> Result<Vec<TeamUser>> {
        self.get("/api/admin/team").await
    }

    pub async fn create_team_user(&self, request: &CreateTeamUserRequest) -> Result<TeamUser> {
        self.post_json("/api/admin/team", request).await
    }

    pub async fn update_team_user(&self, id: &str, request: &UpdateTeamUserRequest) -> Result<TeamUser> {
        self.patch_json(&format!("/api/admin/team/{id}"), request).await
    }

    pub async fn delete_team_user(&self, id: &str) -> Result<()> {
        self.delete_ok(&format!("/api/admin/team/{id}")).await
    }

    /// Uploads a single image to the admin API's shared thumbnail endpoint
    /// (folder must be one of "sermons", "events", "announcements", "series"
    /// — the admin route rejects anything else). Multipart, not JSON, so it
    /// bypasses the `post_json`/`unwrap_data` helpers above.
    pub async fn upload_image(
        &self,
        folder: &str,
        file_name: &str,
        mime_type: &str,
        bytes: Vec<u8>,
    ) -> Result<UploadedImage> {
        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name.to_string())
            .mime_str(mime_type)
            .with_context(|| format!("\"{mime_type}\" is not a valid image type."))?;
        let form = reqwest::multipart::Form::new().text("folder", folder.to_string()).part("file", part);

        let response = self
            .http
            .post(self.endpoint("/api/uploads/image"))
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .context("Could not reach the admin API to upload the image.")?;

        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            bail!("The admin API rejected this API key. Check Settings > Database.");
        }
        let text = response.text().await.context("Could not read the image upload response.")?;
        let parsed: UploadImageResponse = serde_json::from_str(&text)
            .with_context(|| format!("The admin API returned an unexpected image upload response: {text}"))?;
        if !parsed.ok || parsed.url.is_none() {
            bail!(parsed.error.unwrap_or_else(|| format!("Image upload failed ({status}).")));
        }
        Ok(UploadedImage {
            url: parsed.url.unwrap_or_default(),
            path: parsed.path.unwrap_or_default(),
        })
    }

    // -----------------------------------------------------------------------
    // Living Text — Bible data sync. These are the ONLY two admin-side calls
    // this feature makes: pulling the translation list and a one-shot bulk
    // verse dump to build the local cache (bible_store.rs). Everything after
    // that — citation detection, search, chapter lookups — runs against that
    // local cache; there is no per-detection network round-trip.
    // -----------------------------------------------------------------------

    pub async fn list_bible_translations(&self) -> Result<Vec<AdminBibleTranslation>> {
        self.get("/api/admin/bible/translations").await
    }

    pub async fn fetch_bible_verses(&self, translation_code: &str) -> Result<AdminBibleVerseExport> {
        self.get(&format!("/api/admin/bible/translations/{translation_code}/verses")).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_joins_paths_without_double_slashes() {
        let client = ProphetAdminApiClient::new("https://admin.example.com/", "key").unwrap();
        assert_eq!(
            client.endpoint("/api/admin/sermons"),
            "https://admin.example.com/api/admin/sermons"
        );
        assert_eq!(
            client.endpoint("api/admin/sermons/series"),
            "https://admin.example.com/api/admin/sermons/series"
        );
    }

    #[test]
    fn tail_hint_shows_only_the_last_four_characters() {
        assert_eq!(tail_hint("rk_2dgCsl0x6Sc3eBdnVkaMjtT9Q1Vppjz1B47Tgv8OkI0"), "…OkI0");
        assert_eq!(tail_hint("ab"), "…ab");
    }

    #[test]
    fn sermon_response_flattens_nested_topic_links() {
        let json = serde_json::json!({
            "id": "sermon_1",
            "title": "Sunday Service",
            "status": "published",
            "createdAt": "2026-07-12T21:12:42.936Z",
            "updatedAt": "2026-07-12T21:17:29.197Z",
            "series": null,
            "topics": [{ "id": "link_1", "sermonId": "sermon_1", "topicId": "topic_1", "topic": { "id": "topic_1", "name": "Faith", "slug": "faith" } }]
        });
        let parsed: SermonWithFlattenedTopics = serde_json::from_value(json).unwrap();
        assert_eq!(parsed.0.topics, vec!["Faith".to_string()]);
    }

    #[test]
    fn update_request_omits_unset_fields_but_keeps_explicit_empty_strings() {
        let request = UpdateSermonRequest {
            title: Some("New title".to_string()),
            scripture: Some(String::new()),
            ..Default::default()
        };
        let value = serde_json::to_value(&request).unwrap();
        assert_eq!(value["title"], "New title");
        assert_eq!(value["scripture"], "");
        assert!(value.get("summary").is_none(), "unset fields must not be sent at all");
    }

    #[tokio::test]
    async fn test_connection_reports_a_clear_message_when_the_base_url_is_empty() {
        let result = test_connection("", "key").await;
        assert!(!result.reachable);
        assert!(result.message.contains("base URL"));
    }

    #[tokio::test]
    async fn test_connection_reports_a_clear_message_when_the_api_key_is_empty() {
        let result = test_connection("https://admin.example.com", "").await;
        assert!(!result.reachable);
        assert!(result.message.contains("API key"));
    }
}
