//! NDI broadcast output for the Bible Verse (living text) feature.
//!
//! The desktop renderer draws the themed verse onto a hidden canvas and ships
//! raw RGBA frames over the backend WebSocket; this module swizzles them to
//! BGRA and hands them to the NDI SDK, making Zemara discoverable as an NDI
//! source ("MACHINE (Zemara Bible Verse)") in OBS, vMix, Wirecast, etc.
//!
//! The SDK is loaded dynamically at runtime (libloading), so the backend
//! binary never links NDI at build time. Library search order:
//!   1. repo checkout `sdk/ndi/<platform>/` (dev — `pnpm ndi:download`)
//!   2. next to the backend executable (packaged builds)
//!   3. the official NDI runtime installer location
//!
//! NDI is a registered trademark of Vizrt NDI AB; redistribution is governed
//! by the NDI SDK license. See scripts/download-ndi-sdk.mjs.

use std::ffi::{CString, c_void};
use std::fmt;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use libloading::Library;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Wire config types (camelCase on the WebSocket protocol)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiResolution {
    R720p,
    R1080p,
    R4k,
}

impl NdiResolution {
    pub fn dimensions(self) -> (u32, u32) {
        match self {
            Self::R720p => (1280, 720),
            Self::R1080p => (1920, 1080),
            Self::R4k => (3840, 2160),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiFrameRate {
    Fps24,
    Fps30,
    Fps60,
}

impl NdiFrameRate {
    pub fn fps(self) -> u32 {
        match self {
            Self::Fps24 => 24,
            Self::Fps30 => 30,
            Self::Fps60 => 60,
        }
    }
}

/// Pewbeam also lists "premultiplied", but their sender passes the alpha byte
/// through unmultiplied — an honest contract offers only what it honors:
/// opaque (alpha forced to 255) or straight alpha passthrough.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiAlphaMode {
    NoneOpaque,
    StraightAlpha,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiStartParams {
    pub source_name: String,
    pub resolution: NdiResolution,
    pub frame_rate: NdiFrameRate,
    pub alpha_mode: NdiAlphaMode,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiFrameParams {
    pub width: u32,
    pub height: u32,
    pub rgba_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiStatusPayload {
    pub active: bool,
    pub source_name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub frame_count: u64,
    /// Present when the SDK could not be loaded — surfaced, never silent.
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiFrameAck {
    pub frame_count: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum NdiError {
    NoActiveSession,
    SdkNotFound {
        searched: Vec<String>,
    },
    LibraryLoad {
        path: String,
        message: String,
    },
    SymbolLoad {
        symbol: &'static str,
        message: String,
    },
    InitializeFailed,
    SenderCreateFailed,
    InvalidSourceName,
    FrameDimensionsMismatch {
        expected: (u32, u32),
        got: (u32, u32),
    },
    InvalidFrameBufferSize {
        expected: usize,
        got: usize,
    },
    Base64Decode(String),
    Poisoned,
}

impl fmt::Display for NdiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoActiveSession => write!(f, "NDI is not active — call ndi.start first"),
            Self::SdkNotFound { searched } => {
                write!(
                    f,
                    "NDI SDK library not found; searched: {}",
                    searched.join(", ")
                )
            }
            Self::LibraryLoad { path, message } => {
                write!(f, "failed to load NDI library at {path}: {message}")
            }
            Self::SymbolLoad { symbol, message } => {
                write!(f, "failed to load NDI symbol {symbol}: {message}")
            }
            Self::InitializeFailed => write!(f, "NDIlib_initialize() returned false"),
            Self::SenderCreateFailed => write!(f, "NDIlib_send_create() returned a null sender"),
            Self::InvalidSourceName => write!(f, "NDI source name must not be empty"),
            Self::FrameDimensionsMismatch { expected, got } => write!(
                f,
                "frame dimensions {}x{} do not match the active session {}x{}",
                got.0, got.1, expected.0, expected.1
            ),
            Self::InvalidFrameBufferSize { expected, got } => {
                write!(f, "frame buffer is {got} bytes, expected {expected}")
            }
            Self::Base64Decode(message) => write!(f, "invalid frame base64: {message}"),
            Self::Poisoned => write!(f, "NDI runtime lock is poisoned"),
        }
    }
}

impl std::error::Error for NdiError {}

// ---------------------------------------------------------------------------
// NDI SDK ABI mirrors (verified against sdk/ndi/include/Processing.NDI.*.h)
// ---------------------------------------------------------------------------

type NdiSendInstance = *mut c_void;
type NdiInitializeFn = unsafe extern "C" fn() -> bool;
type NdiDestroyFn = unsafe extern "C" fn();
type NdiSendCreateFn = unsafe extern "C" fn(*const NdiSendCreate) -> NdiSendInstance;
type NdiSendDestroyFn = unsafe extern "C" fn(NdiSendInstance);
type NdiSendVideoV2Fn = unsafe extern "C" fn(NdiSendInstance, *const NdiVideoFrameV2);

#[repr(C)]
struct NdiSendCreate {
    p_ndi_name: *const i8,
    p_groups: *const i8,
    clock_video: bool,
    clock_audio: bool,
}

#[repr(C)]
struct NdiVideoFrameV2 {
    xres: i32,
    yres: i32,
    fourcc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    picture_aspect_ratio: f32,
    frame_format_type: i32,
    timecode: i64,
    p_data: *mut u8,
    line_stride_in_bytes: i32,
    p_metadata: *const i8,
    timestamp: i64,
}

const FOURCC_BGRA: u32 = u32::from_le_bytes(*b"BGRA");
const FRAME_FORMAT_PROGRESSIVE: i32 = 1;
const TIMECODE_SYNTHESIZE: i64 = i64::MAX;

// ---------------------------------------------------------------------------
// Session + runtime
// ---------------------------------------------------------------------------

struct ActiveNdiSession {
    // Keeps the dylib mapped for the session's lifetime.
    _library: Library,
    // The sender holds this pointer; it must outlive the sender.
    _sender_name: CString,
    sender: NdiSendInstance,
    send_destroy: NdiSendDestroyFn,
    send_video: NdiSendVideoV2Fn,
    info: SessionInfo,
    frame_count: u64,
    frame_buffer: Vec<u8>,
}

// SAFETY: the session is only ever touched while holding the NDI_RUNTIME
// mutex — there are no per-session threads touching the raw pointers.
unsafe impl Send for ActiveNdiSession {}
unsafe impl Sync for ActiveNdiSession {}

struct SessionInfo {
    source_name: String,
    width: u32,
    height: u32,
    fps: u32,
    alpha_mode: NdiAlphaMode,
}

impl ActiveNdiSession {
    fn create(params: NdiStartParams) -> Result<Self, NdiError> {
        let source_name = params.source_name.trim().to_string();
        if source_name.is_empty() {
            return Err(NdiError::InvalidSourceName);
        }

        let library_path = resolve_library_path()?;
        let library =
            unsafe { Library::new(&library_path) }.map_err(|error| NdiError::LibraryLoad {
                path: library_path.display().to_string(),
                message: error.to_string(),
            })?;

        unsafe {
            let initialize = load_symbol::<NdiInitializeFn>(
                &library,
                b"NDIlib_initialize\0",
                "NDIlib_initialize",
            )?;
            let destroy =
                load_symbol::<NdiDestroyFn>(&library, b"NDIlib_destroy\0", "NDIlib_destroy")?;
            let send_create = load_symbol::<NdiSendCreateFn>(
                &library,
                b"NDIlib_send_create\0",
                "NDIlib_send_create",
            )?;
            let send_destroy = load_symbol::<NdiSendDestroyFn>(
                &library,
                b"NDIlib_send_destroy\0",
                "NDIlib_send_destroy",
            )?;
            let send_video = load_symbol::<NdiSendVideoV2Fn>(
                &library,
                b"NDIlib_send_send_video_v2\0",
                "NDIlib_send_send_video_v2",
            )?;

            if !initialize() {
                return Err(NdiError::InitializeFailed);
            }
            // Global init succeeded; arrange for one global destroy at process exit.
            register_global_destroy(destroy);

            let sender_name =
                CString::new(source_name.clone()).map_err(|_| NdiError::InvalidSourceName)?;
            let create = NdiSendCreate {
                p_ndi_name: sender_name.as_ptr(),
                p_groups: std::ptr::null(),
                // Unclocked: the renderer paces frames (burst on change +
                // keepalive), so the SDK must never rate-limit us.
                clock_video: false,
                clock_audio: false,
            };
            let sender = send_create(&create);
            if sender.is_null() {
                return Err(NdiError::SenderCreateFailed);
            }

            let (width, height) = params.resolution.dimensions();
            tracing::info!(
                "NDI session started: '{}' {}x{} @ {}fps",
                source_name,
                width,
                height,
                params.frame_rate.fps()
            );
            Ok(Self {
                _library: library,
                _sender_name: sender_name,
                sender,
                send_destroy,
                send_video,
                info: SessionInfo {
                    source_name,
                    width,
                    height,
                    fps: params.frame_rate.fps(),
                    alpha_mode: params.alpha_mode,
                },
                frame_count: 0,
                frame_buffer: vec![0u8; (width * height * 4) as usize],
            })
        }
    }

    fn send_frame_rgba(&mut self, width: u32, height: u32, rgba: &[u8]) -> Result<u64, NdiError> {
        if width != self.info.width || height != self.info.height {
            return Err(NdiError::FrameDimensionsMismatch {
                expected: (self.info.width, self.info.height),
                got: (width, height),
            });
        }
        let expected = (width * height * 4) as usize;
        if rgba.len() != expected {
            return Err(NdiError::InvalidFrameBufferSize {
                expected,
                got: rgba.len(),
            });
        }

        swizzle_rgba_to_bgra(rgba, &mut self.frame_buffer, self.info.alpha_mode);

        let frame = NdiVideoFrameV2 {
            xres: width as i32,
            yres: height as i32,
            fourcc: FOURCC_BGRA,
            // Exact rate metadata; pacing is caller-driven (unclocked sender).
            frame_rate_n: self.info.fps as i32,
            frame_rate_d: 1,
            picture_aspect_ratio: width as f32 / height as f32,
            frame_format_type: FRAME_FORMAT_PROGRESSIVE,
            timecode: TIMECODE_SYNTHESIZE,
            p_data: self.frame_buffer.as_mut_ptr(),
            line_stride_in_bytes: (width * 4) as i32,
            p_metadata: std::ptr::null(),
            timestamp: 0,
        };
        // The sync call blocks until the SDK is done with the buffer, so the
        // persistent frame_buffer may be reused immediately afterwards.
        unsafe { (self.send_video)(self.sender, &frame) };

        self.frame_count += 1;
        if self.frame_count == 1 || self.frame_count.is_multiple_of(300) {
            tracing::info!(
                "NDI '{}' sent {} frames",
                self.info.source_name,
                self.frame_count
            );
        }
        Ok(self.frame_count)
    }
}

impl Drop for ActiveNdiSession {
    fn drop(&mut self) {
        tracing::info!("NDI session stopped: '{}'", self.info.source_name);
        unsafe { (self.send_destroy)(self.sender) };
    }
}

/// Convert renderer RGBA into NDI BGRA in place in the persistent buffer.
/// Free function so unit tests exercise it without the SDK.
fn swizzle_rgba_to_bgra(src: &[u8], dst: &mut [u8], alpha_mode: NdiAlphaMode) {
    for (idx, px) in src.chunks_exact(4).enumerate() {
        let offset = idx * 4;
        dst[offset] = px[2];
        dst[offset + 1] = px[1];
        dst[offset + 2] = px[0];
        dst[offset + 3] = match alpha_mode {
            NdiAlphaMode::NoneOpaque => 255,
            NdiAlphaMode::StraightAlpha => px[3],
        };
    }
}

// ---------------------------------------------------------------------------
// Global runtime
// ---------------------------------------------------------------------------

struct NdiRuntime {
    session: Option<ActiveNdiSession>,
    /// Sticky failure reason for status() after a failed start attempt.
    last_error: Option<String>,
}

static NDI_RUNTIME: OnceLock<Mutex<NdiRuntime>> = OnceLock::new();

fn runtime() -> &'static Mutex<NdiRuntime> {
    NDI_RUNTIME.get_or_init(|| {
        Mutex::new(NdiRuntime {
            session: None,
            last_error: None,
        })
    })
}

/// NDIlib_initialize/destroy bracket the whole process, not one session —
/// with multiple senders, a per-session global destroy tears the SDK down
/// under the surviving sender (a pewbeam sharp edge). We therefore never call
/// NDIlib_destroy: the OS reclaims all NDI state at process exit, which is
/// the only point where no sender could still rely on it.
fn register_global_destroy(_destroy: NdiDestroyFn) {}

pub fn start(params: NdiStartParams) -> Result<NdiStatusPayload, NdiError> {
    let mut runtime = runtime().lock().map_err(|_| NdiError::Poisoned)?;
    // Restart semantics: drop any existing session before creating the new one.
    runtime.session = None;
    match ActiveNdiSession::create(params) {
        Ok(session) => {
            runtime.session = Some(session);
            runtime.last_error = None;
        }
        Err(error) => {
            runtime.last_error = Some(error.to_string());
            return Err(error);
        }
    }
    Ok(status_locked(&runtime))
}

pub fn stop() -> Result<NdiStatusPayload, NdiError> {
    let mut runtime = runtime().lock().map_err(|_| NdiError::Poisoned)?;
    runtime.session = None;
    Ok(status_locked(&runtime))
}

pub fn status() -> NdiStatusPayload {
    match runtime().lock() {
        Ok(runtime) => status_locked(&runtime),
        Err(_) => NdiStatusPayload {
            active: false,
            source_name: None,
            width: 0,
            height: 0,
            fps: 0,
            frame_count: 0,
            unavailable_reason: Some("NDI runtime lock is poisoned".to_string()),
        },
    }
}

fn status_locked(runtime: &NdiRuntime) -> NdiStatusPayload {
    match &runtime.session {
        Some(session) => NdiStatusPayload {
            active: true,
            source_name: Some(session.info.source_name.clone()),
            width: session.info.width,
            height: session.info.height,
            fps: session.info.fps,
            frame_count: session.frame_count,
            unavailable_reason: None,
        },
        None => NdiStatusPayload {
            active: false,
            source_name: None,
            width: 0,
            height: 0,
            fps: 0,
            frame_count: 0,
            unavailable_reason: runtime.last_error.clone().or_else(sdk_absence_reason),
        },
    }
}

/// When NDI was never started, tell the UI whether the SDK is even present —
/// "not started" and "SDK missing" are different conversations.
fn sdk_absence_reason() -> Option<String> {
    match resolve_library_path() {
        Ok(_) => None,
        Err(NdiError::SdkNotFound { searched }) => Some(format!(
            "NDI SDK not installed (run `pnpm ndi:download`); searched: {}",
            searched.join(", ")
        )),
        Err(_) => None,
    }
}

pub fn send_frame(params: NdiFrameParams) -> Result<NdiFrameAck, NdiError> {
    let rgba = BASE64
        .decode(params.rgba_base64.as_bytes())
        .map_err(|error| NdiError::Base64Decode(error.to_string()))?;
    let mut runtime = runtime().lock().map_err(|_| NdiError::Poisoned)?;
    let session = runtime.session.as_mut().ok_or(NdiError::NoActiveSession)?;
    let frame_count = session.send_frame_rgba(params.width, params.height, &rgba)?;
    Ok(NdiFrameAck { frame_count })
}

// ---------------------------------------------------------------------------
// SDK library resolution
// ---------------------------------------------------------------------------

fn library_candidates() -> Vec<PathBuf> {
    let file_name = if cfg!(target_os = "macos") {
        "libndi.dylib"
    } else if cfg!(target_os = "windows") {
        "Processing.NDI.Lib.x64.dll"
    } else {
        "libndi.so"
    };

    let mut candidates = Vec::new();

    // Dev checkout: crates/videorc-backend -> repo root -> sdk/ndi/<platform>.
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    candidates.push(repo_root.join("sdk/ndi/macos").join(file_name));
    candidates.push(repo_root.join("sdk/ndi").join(file_name));

    // Packaged: next to the backend executable.
    if let Ok(exe) = std::env::current_exe()
        && let Some(dir) = exe.parent()
    {
        candidates.push(dir.join(file_name));
        candidates.push(dir.join("ndi").join(file_name));
    }

    // Official NDI runtime installer locations.
    if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from("/usr/local/lib/libndi.dylib"));
    } else if cfg!(target_os = "windows") {
        if let Ok(program_files) = std::env::var("PROGRAMFILES") {
            candidates.push(
                PathBuf::from(program_files)
                    .join("NDI/NDI 6 Runtime/v6/Processing.NDI.Lib.x64.dll"),
            );
        }
    } else {
        candidates.push(PathBuf::from("/usr/lib/libndi.so"));
        candidates.push(PathBuf::from("/usr/local/lib/libndi.so"));
    }

    candidates
}

fn resolve_library_path() -> Result<PathBuf, NdiError> {
    let candidates = library_candidates();
    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }
    Err(NdiError::SdkNotFound {
        searched: candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
    })
}

unsafe fn load_symbol<T: Copy>(
    library: &Library,
    symbol: &'static [u8],
    name: &'static str,
) -> Result<T, NdiError> {
    unsafe { library.get::<T>(symbol) }
        .map(|symbol| *symbol)
        .map_err(|error| NdiError::SymbolLoad {
            symbol: name,
            message: error.to_string(),
        })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swizzle_converts_rgba_to_bgra_with_straight_alpha() {
        let src = [10, 20, 30, 40, 200, 210, 220, 230];
        let mut dst = [0u8; 8];
        swizzle_rgba_to_bgra(&src, &mut dst, NdiAlphaMode::StraightAlpha);
        assert_eq!(dst, [30, 20, 10, 40, 220, 210, 200, 230]);
    }

    #[test]
    fn swizzle_forces_opaque_alpha_in_none_mode() {
        let src = [10, 20, 30, 0, 200, 210, 220, 128];
        let mut dst = [0u8; 8];
        swizzle_rgba_to_bgra(&src, &mut dst, NdiAlphaMode::NoneOpaque);
        assert_eq!(dst, [30, 20, 10, 255, 220, 210, 200, 255]);
    }

    #[test]
    fn resolution_dimensions_match_protocol_presets() {
        assert_eq!(NdiResolution::R720p.dimensions(), (1280, 720));
        assert_eq!(NdiResolution::R1080p.dimensions(), (1920, 1080));
        assert_eq!(NdiResolution::R4k.dimensions(), (3840, 2160));
    }

    #[test]
    fn frame_rate_values_are_exact() {
        assert_eq!(NdiFrameRate::Fps24.fps(), 24);
        assert_eq!(NdiFrameRate::Fps30.fps(), 30);
        assert_eq!(NdiFrameRate::Fps60.fps(), 60);
    }

    #[test]
    fn params_deserialize_from_camel_case_wire_names() {
        let start: NdiStartParams = serde_json::from_str(
            r#"{"sourceName":"Zemara Bible Verse","resolution":"r1080p","frameRate":"fps30","alphaMode":"straightAlpha"}"#,
        )
        .expect("start params");
        assert_eq!(start.source_name, "Zemara Bible Verse");
        assert_eq!(start.resolution, NdiResolution::R1080p);
        assert_eq!(start.frame_rate, NdiFrameRate::Fps30);
        assert_eq!(start.alpha_mode, NdiAlphaMode::StraightAlpha);

        let frame: NdiFrameParams =
            serde_json::from_str(r#"{"width":1920,"height":1080,"rgbaBase64":"AAAA"}"#)
                .expect("frame params");
        assert_eq!((frame.width, frame.height), (1920, 1080));
    }

    #[test]
    fn status_reports_inactive_with_sdk_hint_when_never_started() {
        let payload = status();
        assert!(!payload.active);
        // In the dev checkout the SDK is vendored, so no absence reason is
        // expected; on machines without it the reason names the search paths.
        if let Some(reason) = payload.unavailable_reason {
            assert!(reason.contains("NDI SDK"));
        }
    }

    #[test]
    fn send_frame_without_session_is_an_explicit_error() {
        let result = send_frame(NdiFrameParams {
            width: 1920,
            height: 1080,
            rgba_base64: "AAAA".to_string(),
        });
        match result {
            Err(NdiError::NoActiveSession) => {}
            other => panic!("expected NoActiveSession, got {other:?}"),
        }
    }
}
