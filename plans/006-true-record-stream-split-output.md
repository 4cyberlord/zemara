# Plan 006: Implement true 4K record plus 1080p stream split output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- crates/videorc-backend/src/recording.rs crates/videorc-backend/src/encoder_bridge.rs crates/videorc-backend/src/compositor.rs crates/videorc-backend/src/diagnostics.rs crates/videorc-backend/src/protocol.rs apps/desktop/src/renderer/src/lib/capture.ts scripts/lib/media-quality-mode.mjs scripts/stream-av-sync-baseline.mjs scripts/real-source-baseline-app.mjs docs/native-4k-media-engine-refactor.md`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plan 005
- **Category**: perf, direction, tests
- **Planned at**: commit `3d217933`, 2026-06-13
- **Status**: BLOCKED (2026-06-13; implementation slices landed, latest gates still block before encoding because the only online display is 3024x1964 and ScreenCaptureKit start/discovery times out after permission preflight passes)

## Why this matters

The locked product target is not only "stream without raw copies." It is
simultaneous 4K30 local recording plus platform-safe 1080p streaming through
separate output targets and separate VideoToolbox encoders. The current backend
uses one `output.video` profile for the whole session and blocks 4K whenever
streaming is enabled. This plan adds the real split-output media mode and gates
it with evidence instead of intent.

## Current state

Relevant files:

- `crates/videorc-backend/src/recording.rs` - validates output policy and builds
  one bridge/FFmpeg output graph.
- `crates/videorc-backend/src/encoder_bridge.rs` - owns VideoToolbox frame
  submission, FIFO writing, and zero-copy/raw-copy diagnostics.
- `crates/videorc-backend/src/compositor.rs` - owns scene render output. Touch
  this only if separate stream scaling cannot be done safely elsewhere.
- `crates/videorc-backend/src/diagnostics.rs` and `protocol.rs` - expose proof
  fields to scripts/UI.
- `apps/desktop/src/renderer/src/lib/capture.ts` - already carries
  `streaming.defaultOutputPreset` and `defaultBitrateKbps`.
- `scripts/lib/media-quality-mode.mjs` - already has a
  `record-stream-split-output` mode but requires `separateOutputEncoders`.

Locked target:

```md
<!-- docs/native-4k-media-engine-refactor.md:31 -->
- 4K30 local recording is required.
- Livestreaming is platform-safe 1080p for v1.
- 4K recording plus 1080p streaming must work simultaneously through separate Metal output targets and separate VideoToolbox encoders.
```

Current validation blocks 4K whenever streaming is enabled:

```rust
// crates/videorc-backend/src/recording.rs:4825
if params.output.stream_enabled {
    if video.width > 1920 || video.height > 1080 {
        bail!(
            "4K livestreaming is not enabled for v1. Disable streaming for 4K local recording or select a stream-safe 1080p profile."
        );
    }
```

Current bridge args accept only one `video_output` and one video profile:

```rust
// crates/videorc-backend/src/recording.rs:3560
let input_layout =
    append_bridge_recording_input_args(&mut args, capture, params, fifo_path, video_output);
...
append_audio_encoding_args(
    &mut args,
    &input_layout,
    &params.audio,
    !stream_targets.is_empty(),
);
```

The media-quality classifier already knows the final mode shape:

```js
// scripts/lib/media-quality-mode.mjs:63
const splitOutput =
  zeroCopyRecording &&
  streamEnabled &&
  separateOutputEncoders &&
  outputLooks1080p(input.streamOutput)
```

The renderer-side streaming model already has a stream output preset:

```ts
// apps/desktop/src/renderer/src/lib/capture.ts:551
const defaultOutputPreset: VideoPreset =
  typeof candidate.defaultOutputPreset === 'string' &&
  candidate.defaultOutputPreset in videoPresets
    ? (candidate.defaultOutputPreset as VideoPreset)
    : 'tutorial-1080p30'
```

Repo conventions:

- Acceptance modes must be evidence-based. Do not set
  `separateOutputEncoders: true` unless diagnostics prove separate encoders.
- Raw-YUV copies fail 4K acceptance.
- Prefer small pure helpers with tests before changing session orchestration.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust targeted tests | `cargo test -p videorc-backend split_output` | new split-output tests pass |
| Rust full tests | `cargo test -p videorc-backend` | all non-ignored tests pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |
| TS tests | `pnpm --filter @videorc/desktop test` | all Vitest tests pass |
| Script tests | `pnpm test:scripts` | all Node tests pass |
| 4K A/V gate | `pnpm baseline:real-source:4k30:av-sync -- --gate` | exits 0 on local macOS with permissions |
| Stream A/V gate | `pnpm baseline:stream:av-sync -- --gate` | exits 0 on local macOS with permissions |

## Scope

**In scope**:

- `crates/videorc-backend/src/recording.rs`
- `crates/videorc-backend/src/encoder_bridge.rs`
- `crates/videorc-backend/src/compositor.rs` only if required for safe 4K to
  1080p scaling/output targets
- `crates/videorc-backend/src/diagnostics.rs`
- `crates/videorc-backend/src/protocol.rs`
- `apps/desktop/src/renderer/src/lib/capture.ts`
- `apps/desktop/src/renderer/src/lib/capture.test.ts`
- `scripts/lib/media-quality-mode.mjs`
- `scripts/lib/media-quality-mode.test.mjs`
- `scripts/stream-av-sync-baseline.mjs`
- `scripts/real-source-baseline-app.mjs`
- `docs/native-4k-media-engine-refactor.md`

**Out of scope**:

- New streaming providers.
- UI redesign beyond selecting/explaining existing record and stream profiles.
- Electron packaging.
- Changing the preview window contract.

## Git workflow

- Branch: `codex/006-record-stream-split-output`
- Commit style: small logical commits; do not land a giant unreviewable diff.
- Do not push unless instructed.

## Steps

### Step 1: Add a pure stream-output profile resolver

Create or extract a backend helper that resolves the stream output profile from
`StreamingSettings.default_output_preset` and `default_bitrate_kbps`.

Rules:

- If streaming is disabled, no stream output profile exists.
- If streaming is enabled and local recording is 4K, stream output must be
  capped to 1920x1080 and 6000 kbps or lower.
- If streaming is enabled and the chosen stream preset is larger than 1080p or
  above 6000 kbps, return a clear validation error.
- Recording `output.video` remains the recording profile.

Add Rust unit tests for:

- 4K record + 1080p stream resolves two profiles.
- 4K record + stream preset above 1080p fails.
- 4K record + stream bitrate above 6000 fails.
- 1080p stream-only still resolves one stream-safe profile.

**Verify**: `cargo test -p videorc-backend split_output` exits 0.

### Step 2: Add diagnostics for separate outputs and encoders

Add protocol/diagnostic fields that prove, not merely claim:

- recording output width/height/fps/bitrate
- stream output width/height/fps/bitrate
- number of active VideoToolbox output encoders
- recording VideoToolbox output frames/bytes
- stream VideoToolbox output frames/bytes
- raw-video copied frames remain zero
- a boolean or enum that says whether separate output encoders were active

Keep field names explicit and mirrored in Rust protocol, shared TS types, and
script evidence parsing. Follow the existing diagnostic naming style such as
`encoder_bridge_raw_video_copied_frames`.

**Verify**: `cargo test -p videorc-backend diagnostics` and `pnpm typecheck`
exit 0.

### Step 3: Extend the encoder bridge for two VideoToolbox outputs

Extend the bridge so a record+stream session can submit each compositor frame to
two VideoToolbox output encoders:

- recording encoder: recording profile, e.g. 3840x2160@30, 30000 kbps
- stream encoder: stream-safe profile, e.g. 1920x1080@30, 6000 kbps

Each output needs its own encoded FIFO or mux path so a stream target cannot
stall the local recording. The final FFmpeg process may still do muxing/tee
work, but it must not receive rawvideo for the product path.

If the existing compositor frame cannot be scaled/downsampled for the stream
encoder without a CPU raw-video copy, STOP and report. The acceptable choices
are:

- add a second Metal/compositor output target at stream resolution, or
- use a VideoToolbox/Metal-compatible path that preserves zero-copy evidence.

Do not use FFmpeg filters as the product stream scaler.

**Verify**: `cargo test -p videorc-backend split_output` exits 0 and includes
tests that both output FIFOs/mux legs are present.

### Step 4: Relax the 4K-with-stream validation only for proved split output

Update `validate_video_profile_policy` so 4K local recording plus streaming is
allowed only when the split-output resolver succeeds and the stream output is
platform-safe. Keep stream-only 4K blocked for v1.

The old error message should still appear when the user is trying to stream 4K
itself. The new allowed case is specifically 4K local recording plus 1080p
stream.

**Verify**: `cargo test -p videorc-backend video_profile_policy` exits 0.

### Step 5: Wire scripts and quality mode to the proof fields

Update `scripts/lib/media-quality-mode.mjs` and tests so
`record-stream-split-output` is returned only when:

- stream is enabled
- zero-copy recording criteria pass
- raw copied frames are zero
- diagnostics prove separate output encoders
- stream output dimensions are <= 1920x1080

Update `scripts/stream-av-sync-baseline.mjs` to record the split-output proof
fields in `stream-av-sync-evidence.json`.

If `scripts/real-source-baseline-app.mjs` summarizes media quality, make it
pass the new split-output evidence when stream is enabled.

**Verify**: `pnpm test:scripts` exits 0.

### Step 6: Run local acceptance on real sources

On a local macOS machine with required screen/microphone permissions:

```sh
pnpm baseline:real-source:4k30:av-sync -- --gate
pnpm baseline:stream:av-sync -- --gate
```

Expected:

- 4K record-only still passes.
- Record+stream evidence shows recording output at 4K and stream output at
  1080p or lower.
- Raw-video copied frames are zero.
- The quality mode reaches `record-stream-split-output`.
- A/V sync gate passes for the local MKV and received FLV.

## Test plan

- Rust unit tests:
  - stream profile resolver
  - validation policy for 4K record+1080p stream
  - validation policy still blocks 4K stream-only
  - FFmpeg/mux args contain separate record and stream encoded inputs
  - diagnostics accumulate separate output counters
- Node tests:
  - media quality mode requires separate encoder proof
  - copied raw frames keep mode at fallback/native-preview-only
  - stream output above 1080p prevents split-output classification
- Manual/local gates:
  - 4K record-only A/V sync
  - record+stream A/V sync against local RTMP sink

## Done criteria

- [ ] 4K30 local recording plus 1080p streaming is allowed by validation.
- [ ] The stream output profile is independent from the recording profile.
- [ ] Diagnostics prove two active VideoToolbox output encoders for
      record+stream.
- [ ] Product record+stream path reports zero raw-video copied frames.
- [ ] `record-stream-split-output` quality mode is reached only from evidence.
- [ ] `cargo test -p videorc-backend`, `cargo clippy -p videorc-backend -- -D warnings`,
      `pnpm --filter @videorc/desktop test`, and `pnpm test:scripts` pass.
- [ ] Local macOS stream A/V sync gate passes or the exact device/permission
      blocker is recorded.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- The only way to produce the 1080p stream is an FFmpeg filter/rawvideo product
  path.
- Two VideoToolbox sessions cause backpressure that stalls recording.
- Diagnostics cannot distinguish one shared encoder from two separate encoders.
- Validation changes would let users stream actual 4K to a platform in v1.
- The implementation requires large UI restructuring. Keep UI changes minimal
  and report the needed follow-up.

## Maintenance notes

This is the core OBS-class media-engine slice. Reviewers should scrutinize
backpressure, timestamp ownership, and whether evidence fields are truly
proof-based. Future provider work must not bypass the split-output constraints.
