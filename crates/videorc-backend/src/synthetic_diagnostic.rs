//! Developer/diagnostics-only synthetic-source overlay.
//!
//! Draws a machine-decodable frame-number strip plus a human-readable frame number and
//! timecode over the animated test pattern, so a decoded recording frame can be matched back to
//! the exact source frame it shows. The frame *number* (the compositor sequence) is the
//! authoritative identity; the timecode is rendered for human readability.

/// Reference rate for the rendered HH:MM:SS:FF timecode. The frame number is authoritative; the
/// timecode is illustrative, so it is rendered against this fixed rate rather than threading the
/// live output fps through the compositor.
pub const SYNTHETIC_TIMECODE_FPS: u32 = 30;

/// Number of low-order sequence bits encoded in the machine-readable strip. 16 bits (one wrap
/// every 65536 frames, ~36 min at 30fps) is ample to pin frame identity within a test window
/// while keeping cells large enough to survive scaling and H.264.
const STRIP_BITS: usize = 16;

const GLYPH_WIDTH: usize = 3;
const GLYPH_HEIGHT: usize = 5;

// 3x5 bitmaps for digits 0-9 and ':'. Each row's low 3 bits are pixels, MSB = leftmost.
fn glyph(ch: u8) -> [u8; GLYPH_HEIGHT] {
    match ch {
        b'0' => [0b111, 0b101, 0b101, 0b101, 0b111],
        b'1' => [0b010, 0b110, 0b010, 0b010, 0b111],
        b'2' => [0b111, 0b001, 0b111, 0b100, 0b111],
        b'3' => [0b111, 0b001, 0b111, 0b001, 0b111],
        b'4' => [0b101, 0b101, 0b111, 0b001, 0b001],
        b'5' => [0b111, 0b100, 0b111, 0b001, 0b111],
        b'6' => [0b111, 0b100, 0b111, 0b101, 0b111],
        b'7' => [0b111, 0b001, 0b010, 0b010, 0b010],
        b'8' => [0b111, 0b101, 0b111, 0b101, 0b111],
        b'9' => [0b111, 0b101, 0b111, 0b001, 0b111],
        b':' => [0b000, 0b010, 0b000, 0b010, 0b000],
        _ => [0; GLYPH_HEIGHT],
    }
}

fn put_pixel(
    bytes: &mut [u8],
    width: usize,
    height: usize,
    x: usize,
    y: usize,
    (b, g, r): (u8, u8, u8),
) {
    if x >= width || y >= height {
        return;
    }
    let off = (y * width + x) * 4;
    if off + 3 < bytes.len() {
        bytes[off] = b;
        bytes[off + 1] = g;
        bytes[off + 2] = r;
        bytes[off + 3] = 255;
    }
}

fn draw_text(
    bytes: &mut [u8],
    width: usize,
    height: usize,
    text: &str,
    x0: usize,
    y0: usize,
    color: (u8, u8, u8),
) {
    let mut cx = x0;
    for ch in text.bytes() {
        let rows = glyph(ch);
        for (row, bits) in rows.iter().enumerate() {
            for col in 0..GLYPH_WIDTH {
                if bits & (0b100 >> col) != 0 {
                    put_pixel(bytes, width, height, cx + col, y0 + row, color);
                }
            }
        }
        cx += GLYPH_WIDTH + 1;
    }
}

/// Draw the machine-decodable sequence strip (top rows) plus the human-readable frame number
/// and timecode onto an existing BGRA buffer.
pub fn overlay_frame_markers(
    bytes: &mut [u8],
    width: usize,
    height: usize,
    sequence: u64,
    fps: u32,
) {
    if width < STRIP_BITS || height < 2 {
        return;
    }
    let cell_w = width / STRIP_BITS;
    let strip_h = 3.min(height);
    let value = sequence & ((1u64 << STRIP_BITS) - 1);
    for bit in 0..STRIP_BITS {
        let set = value & (1u64 << (STRIP_BITS - 1 - bit)) != 0;
        let color = if set { (255, 255, 255) } else { (0, 0, 0) };
        for dx in 0..cell_w {
            for dy in 0..strip_h {
                put_pixel(bytes, width, height, bit * cell_w + dx, dy, color);
            }
        }
    }
    draw_text(
        bytes,
        width,
        height,
        &format!("{sequence}"),
        1,
        strip_h + 1,
        (255, 245, 80),
    );
    let tc = timecode(sequence, fps);
    draw_text(
        bytes,
        width,
        height,
        &tc,
        1,
        strip_h + 2 + GLYPH_HEIGHT,
        (120, 230, 255),
    );
}

/// Decode the sequence (low `STRIP_BITS` bits) from a rendered tile by sampling each cell centre.
/// Returns `None` if the buffer is too small to carry the strip.
// Exercised by the round-trip tests; consumed by the preview/recording parity check (slice 6).
#[allow(dead_code)]
pub fn decode_sequence(bytes: &[u8], width: usize, height: usize) -> Option<u64> {
    if width < STRIP_BITS || height < 1 || bytes.len() < width * height * 4 {
        return None;
    }
    let cell_w = width / STRIP_BITS;
    if cell_w == 0 {
        return None;
    }
    let y = 1.min(height - 1);
    let mut value: u64 = 0;
    for bit in 0..STRIP_BITS {
        let cx = bit * cell_w + cell_w / 2;
        let off = (y * width + cx) * 4;
        let (b, g, r) = (
            u32::from(bytes[off]),
            u32::from(bytes[off + 1]),
            u32::from(bytes[off + 2]),
        );
        let luma = (r * 299 + g * 587 + b * 114) / 1000;
        if luma >= 128 {
            value |= 1u64 << (STRIP_BITS - 1 - bit);
        }
    }
    Some(value)
}

fn timecode(sequence: u64, fps: u32) -> String {
    let fps = u64::from(fps.max(1));
    let frames = sequence % fps;
    let total_seconds = sequence / fps;
    let seconds = total_seconds % 60;
    let minutes = (total_seconds / 60) % 60;
    let hours = (total_seconds / 3600) % 100;
    format!("{hours:02}:{minutes:02}:{seconds:02}:{frames:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blank(width: usize, height: usize) -> Vec<u8> {
        vec![0u8; width * height * 4]
    }

    #[test]
    fn sequence_round_trips_through_strip() {
        let (w, h) = (64, 64);
        for seq in [0u64, 1, 2, 255, 4096, 65535, 65536, 100_003] {
            let mut bytes = blank(w, h);
            overlay_frame_markers(&mut bytes, w, h, seq, 30);
            assert_eq!(
                decode_sequence(&bytes, w, h),
                Some(seq & 0xFFFF),
                "seq {seq}"
            );
        }
    }

    #[test]
    fn distinct_sequences_render_distinct_strips() {
        let (w, h) = (64, 64);
        let mut a = blank(w, h);
        let mut b = blank(w, h);
        overlay_frame_markers(&mut a, w, h, 10, 30);
        overlay_frame_markers(&mut b, w, h, 11, 30);
        assert_ne!(a, b);
    }

    #[test]
    fn timecode_formats_hh_mm_ss_ff() {
        assert_eq!(timecode(0, 30), "00:00:00:00");
        assert_eq!(timecode(30, 30), "00:00:01:00");
        assert_eq!(timecode(90, 30), "00:00:03:00");
        assert_eq!(timecode(30 * 61 + 5, 30), "00:01:01:05");
    }

    #[test]
    fn frame_number_draws_ink_below_strip() {
        let (w, h) = (64, 64);
        let mut bytes = blank(w, h);
        overlay_frame_markers(&mut bytes, w, h, 12345, 30);
        let digit_region_has_ink = (4..20).any(|y| {
            (0..w).any(|x| {
                let off = (y * w + x) * 4;
                bytes[off] != 0 || bytes[off + 1] != 0 || bytes[off + 2] != 0
            })
        });
        assert!(digit_region_has_ink);
    }

    #[test]
    fn ignores_buffers_too_small_for_the_strip() {
        let mut tiny = blank(8, 8);
        overlay_frame_markers(&mut tiny, 8, 8, 5, 30);
        assert_eq!(decode_sequence(&tiny, 8, 8), None);
    }
}
