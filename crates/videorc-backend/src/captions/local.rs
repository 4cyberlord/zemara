//! On-device caption engine: streams tap audio through a sherpa-onnx online
//! Zipformer recognizer running fully on this machine — no account, no API
//! key, no network after the one-time model download. This is the engine that
//! makes Bible Verse live detection work for everyone out of the box.
//!
//! The recognizer lives on its own thread: sherpa's raw pointers are `!Send`,
//! so one dedicated std::thread owns recognizer + stream while the async
//! session loop ships PCM in and lifts partial/endpoint events out.

use std::ffi::{CStr, CString};
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use sherpa_rs::sherpa_rs_sys as sys;

use super::{
    CAPTION_SAMPLE_RATE, CaptionAudioHeartbeat, CaptionChunkRecord, CaptionSequence,
    CaptionSession, CaptionTimeline, CaptionUpdateKind, CaptionsState, CaptionsStatus,
    CaptionsTransport, CaptionsUpdate, downmix_resample_to_16k_mono, publish_status, remove_tap,
    upsert_caption_record,
};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Model management
// ---------------------------------------------------------------------------

const LOCAL_MODEL_DIR_NAME: &str = "sherpa-onnx-streaming-zipformer-en-2023-06-26";
const LOCAL_MODEL_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26.tar.bz2";
const MODEL_ENCODER: &str = "encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx";
const MODEL_DECODER: &str = "decoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx";
const MODEL_JOINER: &str = "joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx";
const MODEL_TOKENS: &str = "tokens.txt";
/// ~74 MB archive; slow church Wi-Fi still finishes well inside this window.
const MODEL_DOWNLOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

#[derive(Debug, Clone)]
pub struct LocalModelPaths {
    encoder: PathBuf,
    decoder: PathBuf,
    joiner: PathBuf,
    tokens: PathBuf,
}

fn app_data_root() -> PathBuf {
    let home = std::env::var_os(if cfg!(target_os = "windows") {
        "USERPROFILE"
    } else {
        "HOME"
    })
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("."));
    #[cfg(target_os = "macos")]
    {
        home.join("Library")
            .join("Application Support")
            .join("Videorc")
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or(home.join("AppData").join("Roaming"))
            .join("Videorc")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        home.join(".videorc")
    }
}

fn local_model_dir() -> PathBuf {
    app_data_root().join("models").join(LOCAL_MODEL_DIR_NAME)
}

fn model_paths_in(dir: &std::path::Path) -> LocalModelPaths {
    LocalModelPaths {
        encoder: dir.join(MODEL_ENCODER),
        decoder: dir.join(MODEL_DECODER),
        joiner: dir.join(MODEL_JOINER),
        tokens: dir.join(MODEL_TOKENS),
    }
}

fn model_files_present(paths: &LocalModelPaths) -> bool {
    [&paths.encoder, &paths.decoder, &paths.joiner, &paths.tokens]
        .iter()
        .all(|path| path.metadata().map(|meta| meta.len() > 0).unwrap_or(false))
}

/// Resolve the on-device model, downloading and extracting it on first run.
/// Progress is published as caption status messages so the operator sees real
/// state instead of a spinner that might be stuck.
async fn ensure_local_model(state: &AppState, session_client_id: &str) -> Result<LocalModelPaths> {
    let dir = local_model_dir();
    let paths = model_paths_in(&dir);
    if model_files_present(&paths) {
        return Ok(paths);
    }

    let mut status = CaptionsStatus::active(
        CaptionsState::Starting,
        CaptionsTransport::Realtime,
        session_client_id,
    );
    status.message =
        Some("Downloading the on-device speech model (first run only, ~74 MB)…".to_string());
    publish_status(state, status).await;

    let client = reqwest::Client::builder()
        .timeout(MODEL_DOWNLOAD_TIMEOUT)
        .build()
        .context("Could not create the model download client")?;
    let archive = client
        .get(LOCAL_MODEL_URL)
        .send()
        .await
        .context("Could not reach the speech-model download server")?
        .error_for_status()
        .context("The speech-model download was rejected by the server")?
        .bytes()
        .await
        .context("The speech-model download was interrupted")?;

    let mut status = CaptionsStatus::active(
        CaptionsState::Starting,
        CaptionsTransport::Realtime,
        session_client_id,
    );
    status.message = Some("Installing the on-device speech model…".to_string());
    publish_status(state, status).await;

    let final_dir = dir.clone();
    tokio::task::spawn_blocking(move || extract_model_archive(&archive, &final_dir))
        .await
        .context("The speech-model installer thread failed")??;

    let paths = model_paths_in(&dir);
    if model_files_present(&paths) {
        Ok(paths)
    } else {
        bail!("The speech-model archive did not contain every required file.")
    }
}

fn extract_model_archive(archive: &[u8], final_dir: &std::path::Path) -> Result<()> {
    let wanted = [MODEL_ENCODER, MODEL_DECODER, MODEL_JOINER, MODEL_TOKENS];
    let staging_dir = final_dir.with_extension("download");
    if staging_dir.exists() {
        std::fs::remove_dir_all(&staging_dir)
            .with_context(|| format!("Could not clear {}", staging_dir.display()))?;
    }
    std::fs::create_dir_all(&staging_dir)
        .with_context(|| format!("Could not create {}", staging_dir.display()))?;

    let decoder = bzip2::read::BzDecoder::new(archive);
    let mut tar = tar::Archive::new(decoder);
    for entry in tar
        .entries()
        .context("The speech-model archive is unreadable")?
    {
        let mut entry = entry.context("The speech-model archive is corrupt")?;
        let name = {
            let path = entry
                .path()
                .context("The speech-model archive is corrupt")?;
            path.file_name()
                .and_then(|name| name.to_str())
                .map(str::to_owned)
        };
        let Some(name) = name else {
            continue;
        };
        if wanted.contains(&name.as_str()) {
            entry
                .unpack(staging_dir.join(&name))
                .with_context(|| format!("Could not unpack {name}"))?;
        }
    }
    let staged = model_paths_in(&staging_dir);
    if !model_files_present(&staged) {
        let _ = std::fs::remove_dir_all(&staging_dir);
        bail!("The speech-model archive did not contain every required file.");
    }

    if final_dir.exists() {
        // A racing start finished first — trust the complete copy already there.
        if model_files_present(&model_paths_in(final_dir)) {
            let _ = std::fs::remove_dir_all(&staging_dir);
            return Ok(());
        }
        std::fs::remove_dir_all(final_dir)
            .with_context(|| format!("Could not clear {}", final_dir.display()))?;
    }
    if let Some(parent) = final_dir.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Could not create {}", parent.display()))?;
    }
    std::fs::rename(&staging_dir, final_dir).with_context(|| {
        format!(
            "Could not move the speech model into {}",
            final_dir.display()
        )
    })?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Engine thread (owns every !Send sherpa pointer)
// ---------------------------------------------------------------------------

enum EngineCommand {
    Chunk(Vec<f32>),
    Finish,
}

#[derive(Debug)]
enum EngineEvent {
    Ready,
    Partial {
        text: String,
    },
    /// A settled segment; empty text means the endpoint carried no speech.
    Endpoint {
        text: String,
    },
    Failed {
        message: String,
    },
}

fn cstring(value: &std::path::Path) -> CString {
    CString::new(value.to_string_lossy().as_bytes()).expect("model paths never contain NUL")
}

/// Read the current segment text and free the FFI result.
unsafe fn current_segment_text(
    recognizer: *const sys::SherpaOnnxOnlineRecognizer,
    stream: *const sys::SherpaOnnxOnlineStream,
) -> String {
    unsafe {
        let result = sys::SherpaOnnxGetOnlineStreamResult(recognizer, stream);
        if result.is_null() {
            return String::new();
        }
        let text = if (*result).text.is_null() {
            String::new()
        } else {
            CStr::from_ptr((*result).text)
                .to_string_lossy()
                .into_owned()
        };
        sys::SherpaOnnxDestroyOnlineRecognizerResult(result);
        text.trim().to_string()
    }
}

unsafe fn decode_while_ready(
    recognizer: *const sys::SherpaOnnxOnlineRecognizer,
    stream: *const sys::SherpaOnnxOnlineStream,
) {
    unsafe {
        while sys::SherpaOnnxIsOnlineStreamReady(recognizer, stream) == 1 {
            sys::SherpaOnnxDecodeOnlineStream(recognizer, stream);
        }
    }
}

fn engine_thread_main(
    paths: LocalModelPaths,
    command_rx: std::sync::mpsc::Receiver<EngineCommand>,
    event_tx: tokio::sync::mpsc::UnboundedSender<EngineEvent>,
) {
    let encoder = cstring(&paths.encoder);
    let decoder = cstring(&paths.decoder);
    let joiner = cstring(&paths.joiner);
    let tokens = cstring(&paths.tokens);
    let provider = CString::new("cpu").expect("static");
    let decoding_method = CString::new("greedy_search").expect("static");

    let config = sys::SherpaOnnxOnlineRecognizerConfig {
        feat_config: sys::SherpaOnnxFeatureConfig {
            sample_rate: CAPTION_SAMPLE_RATE as i32,
            feature_dim: 80,
        },
        model_config: sys::SherpaOnnxOnlineModelConfig {
            transducer: sys::SherpaOnnxOnlineTransducerModelConfig {
                encoder: encoder.as_ptr(),
                decoder: decoder.as_ptr(),
                joiner: joiner.as_ptr(),
            },
            tokens: tokens.as_ptr(),
            num_threads: 2,
            provider: provider.as_ptr(),
            debug: 0,
            ..unsafe { std::mem::zeroed() }
        },
        decoding_method: decoding_method.as_ptr(),
        max_active_paths: 4,
        enable_endpoint: 1,
        // Sermon pacing: keep segments alive across natural sentence pauses,
        // but still settle promptly enough for live detection.
        rule1_min_trailing_silence: 2.4,
        rule2_min_trailing_silence: 1.4,
        rule3_min_utterance_length: 30.0,
        ..unsafe { std::mem::zeroed() }
    };

    let recognizer = unsafe { sys::SherpaOnnxCreateOnlineRecognizer(&config) };
    if recognizer.is_null() {
        let _ = event_tx.send(EngineEvent::Failed {
            message: "The on-device speech model could not load. Try removing it from the app data folder so it downloads again.".to_string(),
        });
        return;
    }
    let stream = unsafe { sys::SherpaOnnxCreateOnlineStream(recognizer) };
    if stream.is_null() {
        unsafe { sys::SherpaOnnxDestroyOnlineRecognizer(recognizer) };
        let _ = event_tx.send(EngineEvent::Failed {
            message: "The on-device speech engine could not start a recognition stream."
                .to_string(),
        });
        return;
    }
    if event_tx.send(EngineEvent::Ready).is_err() {
        unsafe {
            sys::SherpaOnnxDestroyOnlineStream(stream);
            sys::SherpaOnnxDestroyOnlineRecognizer(recognizer);
        }
        return;
    }

    let mut last_text = String::new();
    while let Ok(command) = command_rx.recv() {
        match command {
            EngineCommand::Chunk(samples) => {
                unsafe {
                    sys::SherpaOnnxOnlineStreamAcceptWaveform(
                        stream,
                        CAPTION_SAMPLE_RATE as i32,
                        samples.as_ptr(),
                        samples.len() as i32,
                    );
                    decode_while_ready(recognizer, stream);
                }
                let text = unsafe { current_segment_text(recognizer, stream) };
                if !text.is_empty() && text != last_text {
                    last_text = text.clone();
                    if event_tx.send(EngineEvent::Partial { text }).is_err() {
                        break;
                    }
                }
                if unsafe { sys::SherpaOnnxOnlineStreamIsEndpoint(recognizer, stream) } == 1 {
                    let text = std::mem::take(&mut last_text);
                    if event_tx.send(EngineEvent::Endpoint { text }).is_err() {
                        break;
                    }
                    unsafe { sys::SherpaOnnxOnlineStreamReset(recognizer, stream) };
                }
            }
            EngineCommand::Finish => {
                unsafe {
                    sys::SherpaOnnxOnlineStreamInputFinished(stream);
                    decode_while_ready(recognizer, stream);
                }
                let text = unsafe { current_segment_text(recognizer, stream) };
                let _ = event_tx.send(EngineEvent::Endpoint { text });
                break;
            }
        }
    }

    unsafe {
        sys::SherpaOnnxDestroyOnlineStream(stream);
        sys::SherpaOnnxDestroyOnlineRecognizer(recognizer);
    }
}

// ---------------------------------------------------------------------------
// Session loop
// ---------------------------------------------------------------------------

pub async fn run_local_caption_session(
    session: &mut CaptionSession,
    sequence: &CaptionSequence,
    timeline: &mut CaptionTimeline,
    audio_heartbeat: &mut CaptionAudioHeartbeat,
) -> bool {
    let paths = match ensure_local_model(&session.state, &session.session_client_id).await {
        Ok(paths) => paths,
        Err(error) => {
            let mut status = CaptionsStatus::active(
                CaptionsState::Blocked,
                CaptionsTransport::Realtime,
                &session.session_client_id,
            );
            status.reason_code = Some("local-model-unavailable".to_string());
            status.message = Some(format!("The on-device speech model is not ready — {error}"));
            publish_status(&session.state, status).await;
            return false;
        }
    };

    let (command_tx, command_rx) = std::sync::mpsc::sync_channel::<EngineCommand>(32);
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<EngineEvent>();
    let engine_thread = std::thread::Builder::new()
        .name("caption-local-engine".to_string())
        .spawn(move || engine_thread_main(paths, command_rx, event_tx));

    let mut engine_thread = match engine_thread {
        Ok(handle) => Some(handle),
        Err(error) => {
            let mut status = CaptionsStatus::active(
                CaptionsState::Blocked,
                CaptionsTransport::Realtime,
                &session.session_client_id,
            );
            status.reason_code = Some("local-engine-spawn-failed".to_string());
            status.message = Some(format!(
                "The on-device speech engine could not start — {error}"
            ));
            publish_status(&session.state, status).await;
            return false;
        }
    };

    // Current in-flight utterance: caption seq + its audio-timeline offset.
    let mut current: Option<(u64, f64)> = None;
    let mut provider_ready = false;
    let mut receiver_open = true;
    let mut engine_open = true;
    let mut heartbeat_tick = tokio::time::interval(std::time::Duration::from_millis(250));
    heartbeat_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    heartbeat_tick.reset();

    let ended_normally = loop {
        if session.stop.load(std::sync::atomic::Ordering::Relaxed) {
            break false;
        }

        tokio::select! {
            maybe_frame = session.receiver.recv(), if receiver_open => {
                let Some(frame) = maybe_frame else {
                    receiver_open = false;
                    continue;
                };
                audio_heartbeat.record_frame(std::time::Instant::now());
                let mono = downmix_resample_to_16k_mono(&frame.samples, frame.channels, frame.sample_rate);
                let frame_seconds = mono.len() as f64 / f64::from(CAPTION_SAMPLE_RATE);
                timeline.advance_seconds(frame_seconds);
                let samples: Vec<f32> = mono
                    .iter()
                    .map(|sample| f32::from(*sample) / 32768.0)
                    .collect();
                // The engine decodes far faster than realtime; a full queue
                // means something is deeply wrong — drop rather than stall
                // the 93Hz audio producer.
                if command_tx.try_send(EngineCommand::Chunk(samples)).is_err() {
                    tracing::warn!("Local caption engine queue full; dropping an audio chunk.");
                }
            }
            maybe_event = event_rx.recv(), if engine_open => {
                let Some(event) = maybe_event else {
                    engine_open = false;
                    continue;
                };
                match event {
                    EngineEvent::Ready => {
                        provider_ready = true;
                        let mut status = CaptionsStatus::active(
                            CaptionsState::Listening,
                            CaptionsTransport::Realtime,
                            &session.session_client_id,
                        );
                        status.provider_ready = true;
                        status.message = Some("On-device captions listening.".to_string());
                        publish_status(&session.state, status).await;
                    }
                    EngineEvent::Partial { text } => {
                        if text.is_empty() {
                            continue;
                        }
                        let (seq, _) = *current
                            .get_or_insert_with(|| (sequence.next(), timeline.current_seconds()));
                        session.state.emit_event(
                            "captions.update",
                            CaptionsUpdate {
                                session_client_id: session.session_client_id.clone(),
                                seq,
                                kind: CaptionUpdateKind::Partial,
                                text,
                                chunk_seconds: 0,
                                remaining_seconds: None,
                            },
                        );
                    }
                    EngineEvent::Endpoint { text } => {
                        let Some((seq, offset)) = current.take() else {
                            continue;
                        };
                        let text = text.trim().to_string();
                        if text.is_empty() {
                            continue;
                        }
                        let end = timeline.current_seconds();
                        {
                            let mut coordinator = session.state.captions.lock().await;
                            let capture_epoch = coordinator.capture_epoch;
                            upsert_caption_record(
                                &mut coordinator.chunks,
                                CaptionChunkRecord {
                                    seq,
                                    offset_seconds: offset,
                                    duration_seconds: (end - offset).clamp(0.5, 30.0),
                                    text: text.clone(),
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
                                text,
                                chunk_seconds: (end - offset).ceil() as u64,
                                remaining_seconds: None,
                            },
                        );
                    }
                    EngineEvent::Failed { message } => {
                        let mut status = CaptionsStatus::active(
                            CaptionsState::Blocked,
                            CaptionsTransport::Realtime,
                            &session.session_client_id,
                        );
                        status.reason_code = Some("local-engine-failed".to_string());
                        status.message = Some(message);
                        publish_status(&session.state, status).await;
                        break false;
                    }
                }
            }
            _ = heartbeat_tick.tick() => {
                audio_heartbeat.refresh_from_caption_bus();
                if provider_ready
                    && let Some(failure) = audio_heartbeat.failure_at(std::time::Instant::now())
                {
                    let mut status = CaptionsStatus::active(
                        CaptionsState::Blocked,
                        CaptionsTransport::Realtime,
                        &session.session_client_id,
                    );
                    status.reason_code = Some(failure.reason_code().to_string());
                    status.message = Some(failure.message().to_string());
                    publish_status(&session.state, status).await;
                    break false;
                }
                if engine_thread.as_ref().is_some_and(|handle| handle.is_finished()) && engine_open {
                    // Engine died without sending Failed — surface it honestly.
                    engine_open = false;
                    if provider_ready {
                        let mut status = CaptionsStatus::active(
                            CaptionsState::Blocked,
                            CaptionsTransport::Realtime,
                            &session.session_client_id,
                        );
                        status.reason_code = Some("local-engine-exited".to_string());
                        status.message = Some("The on-device speech engine stopped unexpectedly.".to_string());
                        publish_status(&session.state, status).await;
                        break false;
                    }
                }
            }
        }
    };

    // Drain path: give the engine a chance to settle the final segment whether
    // we stopped by flag (teardown) or by tap close (capture ended).
    let _ = command_tx.send(EngineCommand::Finish);
    drop(command_tx);
    if let Some(handle) = engine_thread.take() {
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            tokio::task::spawn_blocking(move || handle.join()),
        )
        .await;
    }

    if ended_normally {
        remove_tap();
    }
    ended_normally
}
