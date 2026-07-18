use std::io::{self, Write};

const TS_PACKET_SIZE: usize = 188;
const TS_PAYLOAD_SIZE: usize = TS_PACKET_SIZE - 4;
const MPEG_TS_CLOCK_HZ: u64 = 90_000;
const PAT_PID: u16 = 0x0000;
const PMT_PID: u16 = 0x0100;
const VIDEO_PID: u16 = 0x0101;
const PROGRAM_NUMBER: u16 = 1;
const STREAM_TYPE_H264: u8 = 0x1b;
const VIDEO_STREAM_ID: u8 = 0xe0;

#[derive(Debug, Clone)]
pub struct MpegTsH264Writer {
    pat_continuity: u8,
    pmt_continuity: u8,
    video_continuity: u8,
}

impl MpegTsH264Writer {
    pub const fn new() -> Self {
        Self {
            pat_continuity: 0,
            pmt_continuity: 0,
            video_continuity: 0,
        }
    }

    pub fn write_h264_access_unit<W: Write>(
        &mut self,
        writer: &mut W,
        pts_90khz: u64,
        access_unit: &[u8],
    ) -> io::Result<usize> {
        let mut written = 0;
        written += write_psi_packet(
            writer,
            PAT_PID,
            &mut self.pat_continuity,
            &pat_section(PMT_PID),
        )?;
        written += write_psi_packet(
            writer,
            PMT_PID,
            &mut self.pmt_continuity,
            &pmt_section(VIDEO_PID),
        )?;
        written +=
            write_pes_packetized_h264(writer, &mut self.video_continuity, pts_90khz, access_unit)?;
        Ok(written)
    }
}

pub fn timing_to_90khz(value: i64, time_scale: i32) -> Option<u64> {
    if value < 0 || time_scale <= 0 {
        return None;
    }
    Some(
        u64::try_from(value).ok()?.checked_mul(MPEG_TS_CLOCK_HZ)?
            / u64::try_from(time_scale).ok()?,
    )
}

fn write_psi_packet<W: Write>(
    writer: &mut W,
    pid: u16,
    continuity: &mut u8,
    section: &[u8],
) -> io::Result<usize> {
    debug_assert!(section.len() < TS_PAYLOAD_SIZE);
    let mut packet = [0xff; TS_PACKET_SIZE];
    packet[0] = 0x47;
    packet[1] = 0x40 | pid_high(pid);
    packet[2] = pid_low(pid);
    packet[3] = 0x10 | (*continuity & 0x0f);
    packet[4] = 0x00; // pointer_field: section starts immediately.
    packet[5..5 + section.len()].copy_from_slice(section);
    writer.write_all(&packet)?;
    increment_continuity(continuity);
    Ok(TS_PACKET_SIZE)
}

fn write_pes_packetized_h264<W: Write>(
    writer: &mut W,
    continuity: &mut u8,
    pts_90khz: u64,
    access_unit: &[u8],
) -> io::Result<usize> {
    let mut pes = Vec::with_capacity(14 + access_unit.len());
    pes.extend_from_slice(&[0x00, 0x00, 0x01, VIDEO_STREAM_ID]);
    pes.extend_from_slice(&[0x00, 0x00]); // unbounded video PES length.
    pes.push(0x80); // marker bits, no scrambling, no priority.
    pes.push(0x80); // PTS only.
    pes.push(0x05); // PTS field length.
    pes.extend_from_slice(&encode_pts(pts_90khz));
    pes.extend_from_slice(access_unit);
    write_ts_payload(writer, VIDEO_PID, continuity, true, Some(pts_90khz), &pes)
}

fn write_ts_payload<W: Write>(
    writer: &mut W,
    pid: u16,
    continuity: &mut u8,
    payload_unit_start: bool,
    first_pcr_90khz: Option<u64>,
    payload: &[u8],
) -> io::Result<usize> {
    let mut written = 0;
    let mut offset = 0;
    let mut first = true;

    while offset < payload.len() {
        let include_pcr = first && first_pcr_90khz.is_some();
        let max_payload = if include_pcr { 176 } else { TS_PAYLOAD_SIZE };
        let remaining = payload.len() - offset;
        let payload_len = remaining.min(max_payload);
        let mut packet = [0xff; TS_PACKET_SIZE];

        packet[0] = 0x47;
        let payload_unit_start_bit = if first && payload_unit_start {
            0x40
        } else {
            0x00
        };
        packet[1] = payload_unit_start_bit | pid_high(pid);
        packet[2] = pid_low(pid);

        if include_pcr || payload_len < TS_PAYLOAD_SIZE {
            let adaptation_length = 183 - payload_len;
            packet[3] = 0x30 | (*continuity & 0x0f);
            packet[4] = u8::try_from(adaptation_length).unwrap_or(0);
            if adaptation_length > 0 {
                packet[5] = if include_pcr { 0x10 } else { 0x00 };
                if let Some(pcr_90khz) = first_pcr_90khz.filter(|_| include_pcr) {
                    packet[6..12].copy_from_slice(&encode_pcr(pcr_90khz));
                }
            }
            let payload_start = 5 + adaptation_length;
            packet[payload_start..payload_start + payload_len]
                .copy_from_slice(&payload[offset..offset + payload_len]);
        } else {
            packet[3] = 0x10 | (*continuity & 0x0f);
            packet[4..4 + payload_len].copy_from_slice(&payload[offset..offset + payload_len]);
        }

        writer.write_all(&packet)?;
        increment_continuity(continuity);
        offset += payload_len;
        first = false;
        written += TS_PACKET_SIZE;
    }

    Ok(written)
}

fn pat_section(pmt_pid: u16) -> Vec<u8> {
    let mut section = vec![
        0x00,
        0xb0,
        0x0d,
        0x00,
        0x01,
        0xc1,
        0x00,
        0x00,
        u16_high(PROGRAM_NUMBER),
        u16_low(PROGRAM_NUMBER),
        0xe0 | pid_high(pmt_pid),
        pid_low(pmt_pid),
    ];
    append_crc32(&mut section);
    section
}

fn pmt_section(video_pid: u16) -> Vec<u8> {
    let mut section = vec![
        0x02,
        0xb0,
        0x12,
        u16_high(PROGRAM_NUMBER),
        u16_low(PROGRAM_NUMBER),
        0xc1,
        0x00,
        0x00,
        0xe0 | pid_high(video_pid),
        pid_low(video_pid),
        0xf0,
        0x00,
        STREAM_TYPE_H264,
        0xe0 | pid_high(video_pid),
        pid_low(video_pid),
        0xf0,
        0x00,
    ];
    append_crc32(&mut section);
    section
}

fn append_crc32(section: &mut Vec<u8>) {
    let crc = mpeg2_crc32(section);
    section.extend_from_slice(&crc.to_be_bytes());
}

fn mpeg2_crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc ^= u32::from(*byte) << 24;
        for _ in 0..8 {
            crc = if crc & 0x8000_0000 != 0 {
                (crc << 1) ^ 0x04c1_1db7
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn encode_pts(pts_90khz: u64) -> [u8; 5] {
    let pts = pts_90khz & 0x1_ffff_ffff;
    [
        (0x20 | (((pts >> 30) as u8 & 0x07) << 1) | 0x01),
        (pts >> 22) as u8,
        ((((pts >> 15) as u8) & 0x7f) << 1) | 0x01,
        (pts >> 7) as u8,
        (((pts as u8) & 0x7f) << 1) | 0x01,
    ]
}

fn encode_pcr(pcr_90khz: u64) -> [u8; 6] {
    let base = pcr_90khz & 0x1_ffff_ffff;
    [
        (base >> 25) as u8,
        (base >> 17) as u8,
        (base >> 9) as u8,
        (base >> 1) as u8,
        (((base & 0x01) as u8) << 7) | 0x7e,
        0x00,
    ]
}

fn increment_continuity(counter: &mut u8) {
    *counter = counter.wrapping_add(1) & 0x0f;
}

const fn pid_high(pid: u16) -> u8 {
    ((pid >> 8) & 0x1f) as u8
}

const fn pid_low(pid: u16) -> u8 {
    (pid & 0xff) as u8
}

const fn u16_high(value: u16) -> u8 {
    (value >> 8) as u8
}

const fn u16_low(value: u16) -> u8 {
    (value & 0xff) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timing_to_90khz_converts_positive_time_values() {
        assert_eq!(timing_to_90khz(0, 30), Some(0));
        assert_eq!(timing_to_90khz(1, 30), Some(3_000));
        assert_eq!(timing_to_90khz(60, 30), Some(180_000));
        assert_eq!(timing_to_90khz(-1, 30), None);
        assert_eq!(timing_to_90khz(1, 0), None);
    }

    #[test]
    fn h264_writer_emits_timestamped_pat_pmt_and_pes_packets() {
        let mut writer = MpegTsH264Writer::new();
        let mut bytes = Vec::new();
        let access_unit = [
            0x00, 0x00, 0x00, 0x01, 0x09, 0xf0, 0x00, 0x00, 0x00, 0x01, 0x65,
        ];

        let written = writer
            .write_h264_access_unit(&mut bytes, 3_000, &access_unit)
            .expect("write timestamped H.264 access unit");

        assert_eq!(written, bytes.len());
        assert_eq!(bytes.len() % TS_PACKET_SIZE, 0);
        for packet in bytes.chunks_exact(TS_PACKET_SIZE) {
            assert_eq!(packet[0], 0x47);
        }

        let pat = &bytes[0..TS_PACKET_SIZE];
        assert_eq!(packet_pid(pat), PAT_PID);
        assert_eq!(pat[5], 0x00);

        let pmt = &bytes[TS_PACKET_SIZE..TS_PACKET_SIZE * 2];
        assert_eq!(packet_pid(pmt), PMT_PID);
        assert!(pmt.windows(5).any(|window| {
            window
                == [
                    STREAM_TYPE_H264,
                    0xe0 | pid_high(VIDEO_PID),
                    pid_low(VIDEO_PID),
                    0xf0,
                    0x00,
                ]
        }));

        let video = &bytes[TS_PACKET_SIZE * 2..TS_PACKET_SIZE * 3];
        assert_eq!(packet_pid(video), VIDEO_PID);
        assert!(
            video[1] & 0x40 != 0,
            "PES must start on a payload-unit boundary"
        );
        let payload = packet_payload(video);
        assert_eq!(&payload[0..4], &[0x00, 0x00, 0x01, VIDEO_STREAM_ID]);
        assert_eq!(decode_pts(&payload[9..14]), 3_000);
        assert!(
            payload
                .windows(access_unit.len())
                .any(|window| window == access_unit)
        );
    }

    #[test]
    fn h264_writer_advances_video_continuity_across_large_access_units() {
        let mut writer = MpegTsH264Writer::new();
        let mut bytes = Vec::new();
        let access_unit = vec![0x55; 600];

        writer
            .write_h264_access_unit(&mut bytes, 0, &access_unit)
            .expect("write large access unit");

        let video_packets = bytes
            .chunks_exact(TS_PACKET_SIZE)
            .filter(|packet| packet_pid(packet) == VIDEO_PID)
            .collect::<Vec<_>>();
        assert!(video_packets.len() > 1);
        for (index, packet) in video_packets.iter().enumerate() {
            assert_eq!(packet[3] & 0x0f, index as u8 & 0x0f);
        }
    }

    fn packet_pid(packet: &[u8]) -> u16 {
        (u16::from(packet[1] & 0x1f) << 8) | u16::from(packet[2])
    }

    fn packet_payload(packet: &[u8]) -> &[u8] {
        let adaptation_control = (packet[3] >> 4) & 0x03;
        match adaptation_control {
            1 => &packet[4..],
            3 => {
                let adaptation_len = usize::from(packet[4]);
                &packet[5 + adaptation_len..]
            }
            _ => &[],
        }
    }

    fn decode_pts(bytes: &[u8]) -> u64 {
        (u64::from((bytes[0] >> 1) & 0x07) << 30)
            | (u64::from(bytes[1]) << 22)
            | (u64::from((bytes[2] >> 1) & 0x7f) << 15)
            | (u64::from(bytes[3]) << 7)
            | u64::from((bytes[4] >> 1) & 0x7f)
    }
}
