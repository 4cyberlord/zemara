# Plan 005: Make platform-safe livestreaming use VideoToolbox by default

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- crates/videorc-backend/src/recording.rs crates/videorc-backend/src/encoder_bridge.rs crates/videorc-backend/src/diagnostics.rs crates/videorc-backend/src/protocol.rs scripts/stream-av-sync-baseline.mjs scripts/lib/encoder-bridge-output-gates.mjs scripts/lib/media-quality-mode.mjs package.json docs/native-4k-media-engine-refactor.md`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: perf, bug, tests
- **Planned at**: commit `3d217933`, 2026-06-13

## Why this matters

Recording can look good while livestreaming still lags because enabling stream
currently forces the encoder bridge back to raw YUV frames. That path copies
frames into FFmpeg and is explicitly called fallback evidence by the native 4K
media-engine plan. This plan makes the v1 platform-safe livestream path
VideoToolbox-backed by default, while keeping raw YUV only as an explicit debug
fallback.

## Current state

Relevant files:

- `crates/videorc-backend/src/recording.rs` - selects encoder bridge output,
  starts the compositor, and builds FFmpeg args.
- `crates/videorc-backend/src/encoder_bridge.rs` - counts raw-copy and
  zero-copy VideoToolbox diagnostics.
- `scripts/stream-av-sync-baseline.mjs` - stream A/V sync gate; currently
  documents the default stream path as raw YUV.
- `scripts/lib/encoder-bridge-output-gates.mjs` - already asserts
  VideoToolbox output has zero raw copies when asked.
- `docs/native-4k-media-engine-refactor.md` - product target and fallback
  policy.

Current product target:

```md
<!-- docs/native-4k-media-engine-refactor.md:31 -->
- 4K30 local recording is required.
- Livestreaming is platform-safe 1080p for v1.
- 4K recording plus 1080p streaming must work simultaneously through separate Metal output targets and separate VideoToolbox encoders.
```

Current fallback policy:

```md
<!-- docs/native-4k-media-engine-refactor.md:49 -->
Raw-YUV, image-polling, FFmpeg-filter, and other legacy media paths may remain only as explicit developer/debug fallbacks while the refactor is underway.
```

Current stream default forces raw YUV:

```rust
// crates/videorc-backend/src/recording.rs:3466
fn default_encoder_bridge_video_output_for_outputs(
    _record_enabled: bool,
    stream_enabled: bool,
) -> EncoderBridgeVideoOutput {
    if stream_enabled {
        return EncoderBridgeVideoOutput::RawYuv420p;
    }
```

The compositor only publishes YUV frames for the raw path:

```rust
// crates/videorc-backend/src/recording.rs:546
publish_yuv_frames: matches!(
    encoder_bridge_video_output,
    EncoderBridgeVideoOutput::RawYuv420p
),
```

The FFmpeg bridge already knows how to copy VideoToolbox H.264 instead of
encoding raw YUV:

```rust
// crates/videorc-backend/src/recording.rs:3580
match video_output {
    EncoderBridgeVideoOutput::RawYuv420p => {
        args.extend(["-c:v".to_string(), "h264_videotoolbox".to_string(), ...]);
    }
    EncoderBridgeVideoOutput::VideoToolboxH264AnnexB
    | EncoderBridgeVideoOutput::VideoToolboxH264MpegTs => {
        args.extend(["-c:v".to_string(), "copy".to_string()]);
    }
}
```

The tests currently pin raw-YUV streaming:

```rust
// crates/videorc-backend/src/recording.rs:6541
fn bridge_stream_only_args_use_raw_yuv_video_and_flv_output() {
    ...
    assert_eq!(video_output, EncoderBridgeVideoOutput::RawYuv420p);
```

Diagnostics already separate raw-copy from zero-copy evidence:

```rust
// crates/videorc-backend/src/encoder_bridge.rs:100
/// Frames written through the raw-video FFmpeg bridge. Today this is the recording
/// export hot path; zero-copy VideoToolbox export should drive it to zero.
raw_video_copied_frames: u64,
/// Frames submitted to the encoder without a CPU raw-video copy.
zero_copy_frames: u64,
```

The stream baseline currently says the default stream path is raw:

```js
// scripts/stream-av-sync-baseline.mjs:7
//   1. record-only          -- the pre-encoded VideoToolbox MPEG-TS product path
//   2. record+stream        -- the DEFAULT stream path (raw YUV -> FFmpeg encode -> tee),
```

Repo conventions:

- Explicit diagnostics beat silent fallbacks.
- Raw-YUV output may remain only as an explicit developer/debug fallback.
- Keep current Rust tests close to the helper functions in `recording.rs` unless
  the file is split by a separate plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Targeted Rust tests | `cargo test -p videorc-backend encoder_bridge` | relevant tests pass |
| Full Rust tests | `cargo test -p videorc-backend` | all non-ignored tests pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |
| Node script tests | `pnpm test:scripts` | all script tests pass |
| Stream smoke | `pnpm smoke:multistream` | exits 0 |
| Stream A/V gate | `pnpm baseline:stream:av-sync -- --gate` | exits 0 on a permitted local macOS machine |

## Scope

**In scope**:

- `crates/videorc-backend/src/recording.rs`
- `crates/videorc-backend/src/encoder_bridge.rs`
- `crates/videorc-backend/src/diagnostics.rs`
- `crates/videorc-backend/src/protocol.rs`
- `scripts/stream-av-sync-baseline.mjs`
- `scripts/lib/encoder-bridge-output-gates.mjs`
- `scripts/lib/media-quality-mode.mjs`
- `package.json` only if adding a named smoke/gate script
- `docs/native-4k-media-engine-refactor.md`

**Out of scope**:

- True 4K-recording-plus-1080p-stream split output. That is Plan 006.
- Removing the raw-YUV debug override entirely.
- UI redesign or pricing/product copy.
- Native preview helper packaging. That is Plan 004.

## Git workflow

- Branch: `codex/005-livestream-videotoolbox-default`
- Commit style: imperative/slice-oriented.
- Do not push unless instructed.

## Steps

### Step 1: Replace tests that bless raw-YUV streaming

In `recording.rs`, change the tests that currently expect raw-YUV when streaming
is enabled:

- `bridge_stream_only_args_use_raw_yuv_video_and_flv_output`
- `bridge_stream_only_multistream_tees_flv_targets`
- `bridge_record_and_stream_tees_mkv_and_flv_targets`
- selector assertions around `select_encoder_bridge_video_output(None, true, true)`
  and `select_encoder_bridge_video_output(None, false, true)`

New macOS expectations:

- stream-only default is `EncoderBridgeVideoOutput::VideoToolboxH264MpegTs`
- record+stream default is `EncoderBridgeVideoOutput::VideoToolboxH264MpegTs`
- FFmpeg args use `-c:v copy`
- FFmpeg args do not include rawvideo `-pix_fmt yuv420p`
- FFmpeg args do not include the raw video filter graph
- FLV/tee outputs still exist for one or more targets

Use `#[cfg(target_os = "macos")]` for macOS-specific selector expectations.
Keep non-mac default expectations raw unless a Windows/Linux VideoToolbox
equivalent exists.

**Verify**: `cargo test -p videorc-backend encoder_bridge` should fail before
the production change and pass after Step 2.

### Step 2: Change the stream default to VideoToolbox on macOS

Update `default_encoder_bridge_video_output_for_outputs` so macOS stream-enabled
sessions default to `VideoToolboxH264MpegTs`. Keep explicit env parsing intact:
`VIDEORC_ENCODER_BRIDGE_VIDEO_OUTPUT=raw-yuv420p` must still select raw for
debugging.

Make sure this causes `publish_yuv_frames` to be false for normal stream
sessions.

If FFmpeg cannot remux the MPEG-TS/H.264 FIFO into FLV with `-c:v copy`, try
`VideoToolboxH264AnnexB` only if tests and the stream A/V gate prove stable
timestamps. Do not silently return to raw YUV.

**Verify**: `cargo test -p videorc-backend encoder_bridge` exits 0.

### Step 3: Strengthen diagnostics and stream gates

Update `scripts/stream-av-sync-baseline.mjs` comments and gate behavior so the
default stream session is expected to prove VideoToolbox output, not raw YUV.

Use or extend `assertEncoderBridgeVideoOutputHealthy` from
`scripts/lib/encoder-bridge-output-gates.mjs` so stream evidence fails when:

- `encoderBridgeRawVideoCopiedFrames > 0`
- `encoderBridgeMetalTargetCopiedFrames > 0`
- `encoderBridgeZeroCopyFrames <= 0`
- `encoderBridgeVideoToolboxOutputFrames <= 0`
- VideoToolbox output errors are non-zero

If the baseline evidence file does not currently carry the needed diagnostics
for the record+stream run, add them there rather than weakening the gate.

**Verify**: `pnpm test:scripts` exits 0.

### Step 4: Keep fallback explicit in docs and status

Update `docs/native-4k-media-engine-refactor.md` so it reflects the new v1
state:

- platform-safe 1080p streaming uses VideoToolbox by default on macOS
- raw-YUV streaming is an explicit debug fallback only
- true simultaneous 4K record plus 1080p stream remains Plan 006 until separate
  encoders are proved

If any status/diagnostics copy currently says raw-YUV is the normal stream path,
update it. Do not add user-facing promises for 4K+stream yet.

**Verify**: `pnpm format:check` exits 0.

### Step 5: Run acceptance gates

Run the automated gates first:

```sh
cargo test -p videorc-backend
cargo clippy -p videorc-backend -- -D warnings
pnpm test:scripts
pnpm smoke:multistream
```

On a local macOS machine with the required capture permissions, run:

```sh
pnpm baseline:stream:av-sync -- --gate
```

Expected: the gate exits 0 and the evidence shows zero raw-video copied frames
for the stream session.

## Test plan

- Rust unit tests:
  - selector defaults for macOS stream-only and record+stream choose
    `VideoToolboxH264MpegTs`
  - explicit raw env still chooses `RawYuv420p`
  - stream-only FFmpeg args copy H.264 video and produce a single FLV target
  - multistream FFmpeg args tee FLV targets without rawvideo input flags
  - record+stream FFmpeg args tee MKV plus FLV targets with `-c:v copy`
- Node/script tests:
  - stream A/V baseline rejects raw-copy diagnostics for the default stream
    session
  - media quality mode still classifies single-encoder stream sessions honestly
    and does not claim `record-stream-split-output`

## Done criteria

- [ ] macOS stream-only default is VideoToolbox, not raw YUV.
- [ ] macOS record+stream default is VideoToolbox, not raw YUV.
- [ ] Raw-YUV stream remains available only via explicit debug override.
- [ ] Stream FFmpeg args copy encoded video rather than encoding rawvideo.
- [ ] Stream A/V baseline fails if raw copied frames appear in the default
      stream session.
- [ ] `cargo test -p videorc-backend`, `cargo clippy -p videorc-backend -- -D warnings`,
      `pnpm test:scripts`, and `pnpm smoke:multistream` pass.
- [ ] `pnpm baseline:stream:av-sync -- --gate` passes or the executor records
      the exact local-permission/device blocker.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- FFmpeg cannot remux the VideoToolbox H.264 FIFO into platform-safe FLV without
  re-encoding raw video.
- VideoToolbox streaming works only by losing audio sync or producing invalid
  timestamps.
- The implementation requires changing UI output-profile semantics for 4K
  recording plus streaming. That belongs in Plan 006.
- The stream gate has to be weakened to pass.

## Maintenance notes

After this lands, raw copied frames in a normal macOS livestream should be
treated as a regression. This plan does not complete the full OBS-class
simultaneous 4K recording plus 1080p streaming target; it clears the immediate
streaming fallback and gives Plan 006 a stable VideoToolbox baseline.
