const BUNDLED_FFMPEG_PATH_ENV: &str = "VIDEORC_BUNDLED_FFMPEG_PATH";
const BUNDLED_FFPROBE_PATH_ENV: &str = "VIDEORC_BUNDLED_FFPROBE_PATH";

pub fn default_ffmpeg_path() -> String {
    std::env::var(BUNDLED_FFMPEG_PATH_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ffmpeg".to_string())
}

pub fn default_ffprobe_path() -> String {
    std::env::var(BUNDLED_FFPROBE_PATH_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ffprobe".to_string())
}

/// Resolves the FFprobe binary that pairs with an already-resolved FFmpeg path: an
/// explicit `VIDEORC_BUNDLED_FFPROBE_PATH` wins, otherwise a sibling `ffprobe` next to a
/// bundled `ffmpeg` is derived, otherwise it falls back to `ffprobe` on `PATH`.
pub fn ffprobe_path_for(ffmpeg_path: &str) -> String {
    if let Ok(explicit) = std::env::var(BUNDLED_FFPROBE_PATH_ENV)
        && !explicit.trim().is_empty()
    {
        return explicit.trim().to_string();
    }
    if let Some(prefix) = ffmpeg_path.trim().strip_suffix("ffmpeg") {
        return format!("{prefix}ffprobe");
    }
    default_ffprobe_path()
}

pub fn resolve_ffmpeg_path(path: Option<String>) -> String {
    path.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(default_ffmpeg_path)
}

pub fn resolve_ffmpeg_path_ref(path: Option<&str>) -> String {
    path.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(default_ffmpeg_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_sibling_ffprobe_next_to_bundled_ffmpeg() {
        // Only meaningful when the explicit override env is unset (the common case).
        if std::env::var("VIDEORC_BUNDLED_FFPROBE_PATH").is_ok() {
            return;
        }
        assert_eq!(ffprobe_path_for("/opt/ff/ffmpeg"), "/opt/ff/ffprobe");
        assert_eq!(ffprobe_path_for("ffmpeg"), "ffprobe");
    }

    #[test]
    fn falls_back_to_ffprobe_for_unrecognized_ffmpeg_path() {
        if std::env::var("VIDEORC_BUNDLED_FFPROBE_PATH").is_ok() {
            return;
        }
        assert_eq!(ffprobe_path_for("/opt/custom/ffmpeg-static"), "ffprobe");
    }
}
