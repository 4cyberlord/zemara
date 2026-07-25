//! Deepgram live caption session (bring-your-own-key).
//!
//! Streams tapped mic audio to Deepgram's `/v1/listen` websocket as 16 kHz
//! mono linear16 PCM and maps interim/final transcripts onto the shared
//! caption records so detection, the live transcript panel, and the output
//! window all work exactly like the managed realtime backend.

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::net::TcpStream;
use tokio::time::{MissedTickBehavior, interval, sleep, timeout};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

use super::{
    CAPTION_SAMPLE_RATE, CaptionAudioHeartbeat, CaptionChunkRecord, CaptionSequence,
    CaptionSession, CaptionTimeline, CaptionUpdateKind, CaptionsState, CaptionsStatus,
    CaptionsTransport, CaptionsUpdate, downmix_resample_to_16k_mono, publish_blocked_status,
    publish_listening_if_ready, publish_status, upsert_caption_record,
};

const DEEPGRAM_LISTEN_URL: &str = "wss://api.deepgram.com/v1/listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true&smart_format=true&endpointing=300&utterance_end_ms=1000";
const DEEPGRAM_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const DEEPGRAM_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(8);
const DEEPGRAM_MAX_RECONNECTS: u32 = 5;
/// ~100 ms of 16 kHz mono s16 per socket write — small enough for responsive
/// endpointing, large enough to avoid per-callback frame spam.
const DEEPGRAM_SEND_CHUNK_SAMPLES: usize = 1_600;

type DeepgramSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug, Deserialize)]
struct DeepgramMessage {
    #[serde(rename = "type")]
    message_type: String,
    #[serde(default)]
    channel: Option<DeepgramChannel>,
    #[serde(default)]
    is_final: bool,
    #[serde(default)]
    speech_final: bool,
    #[serde(default)]
    duration: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct DeepgramChannel {
    #[serde(default)]
    alternatives: Vec<DeepgramAlternative>,
}

#[derive(Debug, Deserialize)]
struct DeepgramAlternative {
    #[serde(default)]
    transcript: String,
}

/// Run a Deepgram-backed caption session.
///
/// Returns `true` when the caption bus went away (the outer coordinator should
/// drop back to idle/ready) and `false` for stops and terminal failures, which
/// keep their published status.
pub async fn run_deepgram_caption_session(
    session: &mut CaptionSession,
    sequence: &CaptionSequence,
    timeline: &mut CaptionTimeline,
    audio_heartbeat: &mut CaptionAudioHeartbeat,
) -> bool {
    let mut reconnects: u32 = 0;
    loop {
        if session.stop.load(Ordering::Relaxed) {
            return false;
        }
        let socket = match connect_deepgram(&session.bearer).await {
            Ok(socket) => socket,
            Err(message) => {
                publish_blocked_status(
                    session,
                    "deepgram-connect-failed",
                    &message,
                    CaptionsTransport::Realtime,
                )
                .await;
                return false;
            }
        };
        match run_deepgram_connection(session, sequence, timeline, audio_heartbeat, socket).await {
            DeepgramSessionEnd::StopRequested => return false,
            DeepgramSessionEnd::ReceiverClosed => return true,
            DeepgramSessionEnd::Failed(code, message) => {
                publish_blocked_status(session, &code, &message, CaptionsTransport::Realtime).await;
                return false;
            }
            DeepgramSessionEnd::Reconnect(message) => {
                reconnects = reconnects.saturating_add(1);
                if reconnects >= DEEPGRAM_MAX_RECONNECTS {
                    publish_blocked_status(
                        session,
                        "deepgram-stream-lost",
                        &message,
                        CaptionsTransport::Realtime,
                    )
                    .await;
                    return false;
                }
                let mut status = CaptionsStatus::active(
                    CaptionsState::Reconnecting,
                    CaptionsTransport::Realtime,
                    &session.session_client_id,
                );
                status.message = Some(format!("{message} Reconnecting to Deepgram…"));
                publish_status(&session.state, status).await;
                sleep(Duration::from_millis(500 * u64::from(reconnects))).await;
            }
        }
    }
}

async fn connect_deepgram(api_key: &str) -> std::result::Result<DeepgramSocket, String> {
    let mut request = DEEPGRAM_LISTEN_URL
        .into_client_request()
        .map_err(|error| format!("Could not prepare the Deepgram request: {error}"))?;
    let header = format!("Token {api_key}")
        .parse()
        .map_err(|_| "The Deepgram API key is not valid in a request header.".to_string())?;
    request.headers_mut().insert("Authorization", header);
    match timeout(DEEPGRAM_CONNECT_TIMEOUT, connect_async(request)).await {
        Ok(Ok((socket, _))) => Ok(socket),
        Ok(Err(error)) => Err(format!("Deepgram connection failed: {error}")),
        Err(_) => Err("Deepgram connection timed out.".to_string()),
    }
}

enum DeepgramSessionEnd {
    StopRequested,
    ReceiverClosed,
    Reconnect(String),
    Failed(String, String),
}

async fn run_deepgram_connection(
    session: &mut CaptionSession,
    sequence: &CaptionSequence,
    timeline: &mut CaptionTimeline,
    audio_heartbeat: &mut CaptionAudioHeartbeat,
    mut socket: DeepgramSocket,
) -> DeepgramSessionEnd {
    let mut pending: Vec<i16> = Vec::with_capacity(DEEPGRAM_SEND_CHUNK_SAMPLES * 2);
    let mut keepalive = interval(DEEPGRAM_KEEPALIVE_INTERVAL);
    keepalive.set_missed_tick_behavior(MissedTickBehavior::Delay);
    // Current utterance: caption seq + its offset on the capture timeline.
    let mut current: Option<(u64, f64)> = None;
    let mut last_sent_partial: Option<String> = None;
    let mut listening_published = false;

    loop {
        tokio::select! {
            _ = keepalive.tick() => {
                if let Err(error) = socket
                    .send(Message::Text(r#"{"type":"KeepAlive"}"#.into()))
                    .await
                {
                    return DeepgramSessionEnd::Reconnect(format!(
                        "Lost the Deepgram connection ({error})."
                    ));
                }
            }
            incoming = socket.next() => {
                match incoming {
                    Some(Ok(Message::Text(payload))) => {
                        let Ok(parsed) = serde_json::from_str::<DeepgramMessage>(&payload) else {
                            continue;
                        };
                        if parsed.message_type != "Results" {
                            continue;
                        }
                        let transcript = parsed
                            .channel
                            .as_ref()
                            .and_then(|channel| channel.alternatives.first())
                            .map(|alternative| alternative.transcript.trim().to_string())
                            .unwrap_or_default();
                        if transcript.is_empty() {
                            if parsed.speech_final {
                                current = None;
                                last_sent_partial = None;
                            }
                            continue;
                        }
                        publish_listening_if_ready(
                            session,
                            true,
                            audio_heartbeat.has_seen_frame(),
                            &mut listening_published,
                            None,
                        )
                        .await;
                        let (seq, offset) = *current
                            .get_or_insert_with(|| (sequence.next(), timeline.current_seconds()));
                        if parsed.is_final {
                            let end = timeline.current_seconds();
                            let duration_seconds = parsed
                                .duration
                                .map(|duration| duration.max(0.0))
                                .unwrap_or_else(|| (end - offset).max(0.0))
                                .clamp(0.5, 30.0);
                            {
                                let mut coordinator = session.state.captions.lock().await;
                                let capture_epoch = coordinator.capture_epoch;
                                upsert_caption_record(
                                    &mut coordinator.chunks,
                                    CaptionChunkRecord {
                                        seq,
                                        offset_seconds: offset,
                                        duration_seconds,
                                        text: transcript.clone(),
                                        segments: Vec::new(),
                                        capture_epoch,
                                        provider_item_id: None,
                                    },
                                );
                            }
                            session.state.emit_event(
                                "captions.update",
                                CaptionsUpdate {
                                    session_client_id: session.session_client_id.clone(),
                                    seq,
                                    kind: CaptionUpdateKind::Final,
                                    text: transcript,
                                    chunk_seconds: duration_seconds.ceil() as u64,
                                    remaining_seconds: None,
                                },
                            );
                            current = None;
                            last_sent_partial = None;
                        } else if last_sent_partial.as_deref() != Some(transcript.as_str()) {
                            last_sent_partial = Some(transcript.clone());
                            session.state.emit_event(
                                "captions.update",
                                CaptionsUpdate {
                                    session_client_id: session.session_client_id.clone(),
                                    seq,
                                    kind: CaptionUpdateKind::Partial,
                                    text: transcript,
                                    chunk_seconds: 0,
                                    remaining_seconds: None,
                                },
                            );
                        }
                        if parsed.speech_final {
                            current = None;
                            last_sent_partial = None;
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        let detail = frame
                            .map(|close| format!("{} {}", close.code, close.reason).trim().to_string())
                            .filter(|reason| !reason.is_empty())
                            .unwrap_or_else(|| "connection closed".to_string());
                        if detail.contains("1011")
                            || detail.to_lowercase().contains("unauthorized")
                            || detail.to_lowercase().contains("forbidden")
                        {
                            return DeepgramSessionEnd::Failed(
                                "deepgram-key-rejected".to_string(),
                                "Deepgram rejected the API key. Check it in Settings → Bible Verse.".to_string(),
                            );
                        }
                        return DeepgramSessionEnd::Reconnect(format!(
                            "Deepgram closed the stream ({detail})."
                        ));
                    }
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        return DeepgramSessionEnd::Reconnect(format!(
                            "Deepgram stream error: {error}."
                        ));
                    }
                    None => {
                        return DeepgramSessionEnd::Reconnect(
                            "Deepgram ended the stream.".to_string(),
                        );
                    }
                }
            }
            maybe_frame = session.receiver.recv() => {
                let Some(frame) = maybe_frame else {
                    // The capture pipeline closed the tap: flush and finish
                    // gracefully so the last utterance still lands.
                    if !pending.is_empty() {
                        let bytes = pcm_bytes(&pending);
                        pending.clear();
                        if socket.send(Message::Binary(bytes.into())).await.is_err() {
                            return DeepgramSessionEnd::ReceiverClosed;
                        }
                    }
                    let _ = socket
                        .send(Message::Text(r#"{"type":"CloseStream"}"#.into()))
                        .await;
                    let _ = socket.close(None).await;
                    return DeepgramSessionEnd::ReceiverClosed;
                };
                audio_heartbeat.record_frame(Instant::now());
                let mono = downmix_resample_to_16k_mono(
                    &frame.samples,
                    frame.channels,
                    frame.sample_rate,
                );
                timeline.advance_seconds(mono.len() as f64 / f64::from(CAPTION_SAMPLE_RATE));
                pending.extend(mono);
                while pending.len() >= DEEPGRAM_SEND_CHUNK_SAMPLES {
                    let payload: Vec<i16> = pending.drain(..DEEPGRAM_SEND_CHUNK_SAMPLES).collect();
                    if let Err(error) = socket.send(Message::Binary(pcm_bytes(&payload).into())).await {
                        return DeepgramSessionEnd::Reconnect(format!(
                            "Lost the Deepgram connection ({error})."
                        ));
                    }
                }
            }
            _ = sleep(Duration::from_millis(250)) => {
                if session.stop.load(Ordering::Relaxed) {
                    let _ = socket
                        .send(Message::Text(r#"{"type":"CloseStream"}"#.into()))
                        .await;
                    let _ = socket.close(None).await;
                    return DeepgramSessionEnd::StopRequested;
                }
                audio_heartbeat.refresh_from_caption_bus();
                if let Some(failure) = audio_heartbeat.failure_at(Instant::now()) {
                    return DeepgramSessionEnd::Failed(
                        failure.reason_code().to_string(),
                        failure.message().to_string(),
                    );
                }
            }
        }
    }
}

fn pcm_bytes(samples: &[i16]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}
