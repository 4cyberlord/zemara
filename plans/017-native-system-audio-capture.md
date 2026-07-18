# Plan 017: Add native system audio capture and a mixed audio graph

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 0ea3c66c..HEAD -- docs/system-audio-capture-plan.md crates/videorc-backend/src/protocol.rs crates/videorc-backend/src/devices.rs crates/videorc-backend/src/audio.rs crates/videorc-backend/src/recording.rs crates/videorc-backend/src/diagnostics.rs apps/desktop/src/shared/backend.ts apps/desktop/src/renderer/src/lib/capture.ts apps/desktop/src/renderer/src/components/tabs/sources-tab.tsx`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code before proceeding. On mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 006, 007, and 014
- **Category**: direction, perf, tests
- **Planned at**: commit `0ea3c66c`, 2026-06-13

## Why this matters

Creators expect desktop/game audio without installing a virtual audio device.
The repo already has a system-audio placeholder and a follow-up design doc, but
there is no selectable source, mixer, recording graph, or diagnostics. This
plan promotes that placeholder into a real macOS-first native audio graph while
keeping it unavailable until the full path is proven.

## Current state

Relevant files:

- `docs/system-audio-capture-plan.md` - feature design.
- `crates/videorc-backend/src/devices.rs` - always appends a system-audio
  placeholder.
- `crates/videorc-backend/src/audio.rs` - CoreAudio microphone capture and
  reusable `AudioFrame`.
- `crates/videorc-backend/src/protocol.rs` and `apps/desktop/src/shared/backend.ts`
  - protocol mirrors.
- `crates/videorc-backend/src/recording.rs` - session audio input setup.
- `apps/desktop/src/renderer/src/components/tabs/sources-tab.tsx` - source/mixer UI.

System audio currently appears only as a placeholder:

```rust
// crates/videorc-backend/src/devices.rs:139
devices.extend(native_microphones);
devices.push(system_audio_placeholder());
```

Shared TS knows the device kind but audio tracks do not:

```ts
// apps/desktop/src/shared/backend.ts:22
export type DeviceKind = 'screen' | 'window' | 'camera' | 'microphone' | 'system-audio'

// apps/desktop/src/shared/backend.ts:54
export type AudioTrackSource = 'microphone' | 'test-tone'
```

The backend already has a reusable frame shape:

```rust
// crates/videorc-backend/src/audio.rs:46
pub struct AudioFrame {
    pub timestamp_micros: u64,
    pub sample_rate: u32,
    pub channels: u16,
    pub samples: Vec<f32>,
}
```

Repo conventions:

- Native sources should emit 48 kHz stereo float frames.
- Keep FFmpeg downstream-first; do not grow ad hoc filter graphs for every
  source combination.
- Surface permission/API failure as device status and health events.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust audio tests | `cargo test -p videorc-backend audio` | mixer tests pass |
| Rust device tests | `cargo test -p videorc-backend system_audio` | new tests pass |
| Rust full | `cargo test -p videorc-backend` | all pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exits 0 |
| Desktop tests | `pnpm --filter @videorc/desktop test` | all pass |
| TypeScript | `pnpm typecheck` | exits 0 |
| Real smoke | manual system-audio acceptance | passes on macOS hardware |

## Scope

**In scope**:

- protocol fields for system-audio selection and track source
- native audio mixer
- macOS system-audio adapter
- recording/stream session integration
- Sources tab UI state
- diagnostics and acceptance docs

**Out of scope**:

- Windows WASAPI loopback.
- Audio monitoring.
- Echo cancellation.
- Live hot-swapping system audio while a session is active.
- Replacing Plan 014 microphone calibration.

## Git workflow

- Branch: `codex/017-native-system-audio`
- Commit style: protocol, mixer, adapter, recording integration, UI, docs.
- Do not push unless instructed.

## Steps

### Step 1: Add protocol and stored selection fields

Add system-audio fields to `SourceSelection` in Rust and TypeScript mirrors:

- `systemAudioId`
- `systemAudioName`

Add `AudioTrackSource::SystemAudio` and the TS mirror. Normalize old configs so
missing fields remain `undefined`.

**Verify**:

```sh
cargo test -p videorc-backend protocol
pnpm --filter @videorc/desktop test -- capture
pnpm typecheck
```

### Step 2: Introduce a native audio mixer

In `audio.rs` or a new module, introduce a mixer that accepts one or more
`AudioFrame` sources and writes one 48 kHz stereo f32 stream:

- per-source gain/mute
- sample clamping to `[-1.0, 1.0]`
- pre-roll trim aligned to the video epoch
- per-source captured/dropped frames
- clipping counters

Keep microphone-only output behavior compatible.

**Verify**: `cargo test -p videorc-backend audio_mixer` exits 0.

### Step 3: Add the macOS system-audio adapter

Create a macOS-only adapter, for example `system_audio_capture.rs`, that:

- discovers availability independently from screen/window permission
- converts platform sample buffers into `AudioFrame`
- reports permission/API failures as `DeviceStatus`
- keeps system audio unavailable on unsupported macOS versions

Keep pure conversion and error mapping testable without real capture.

**Verify**: `cargo test -p videorc-backend system_audio` exits 0.

### Step 4: Wire recording and stream sessions

Extend session setup so selected audio sources feed the mixer:

- microphone only
- system audio only
- microphone plus system audio
- no real audio -> existing test-tone fallback where still required

Emit health events if a selected source cannot start. Recording status should
list all active audio tracks.

**Verify**:

```sh
cargo test -p videorc-backend recording_audio
cargo test -p videorc-backend
cargo clippy -p videorc-backend -- -D warnings
```

### Step 5: Expose honest UI controls

Add a System Audio row to Sources:

- available, permission needed, or unavailable from backend status
- enable/select control only when supported
- gain/mute controls if mixer supports them
- disabled live switching until a later warm-swap plan

Do not present system audio as available before adapter and recording path pass.

**Verify**:

```sh
pnpm --filter @videorc/desktop test
pnpm typecheck
pnpm lint
```

### Step 6: Add real-device acceptance

Create a dated manual acceptance checklist under `docs/acceptance/` covering:

- system-only recording
- mic-only recording
- mixed mic+system recording
- record+stream with system audio
- packaged app behavior
- sync, clipping, echo/feedback, and diagnostics

**Verify**: run the checklist on a macOS machine with the needed permissions and
record the result.

## Test plan

- Protocol serde round trips.
- TS capture normalization.
- Audio mixer pure tests for gain, mute, clipping, and trim.
- Adapter conversion/error tests.
- Recording session tests for track lists and fallback behavior.
- Manual macOS acceptance in dev and packaged builds.

## Done criteria

- [ ] System-audio selection exists in Rust and TS mirrors.
- [ ] `AudioTrackSource` supports system audio.
- [ ] Native mixer handles microphone, system audio, and mixed sessions.
- [ ] System audio remains unavailable when adapter/permission is unavailable.
- [ ] Selected system audio reaches local recording and stream output.
- [ ] Diagnostics include system-audio source health and mixer clipping.
- [ ] Manual acceptance passes in dev and packaged builds.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- macOS system audio requires a platform permission or API path not compatible
  with the product target.
- microphone and system-audio clocks drift beyond fixed correction.
- The implementation needs live device switching.
- The UI would need to claim system audio is available before recording proves
  it.

## Maintenance notes

This plan is intentionally macOS-first. Windows loopback belongs to Plan 019 or
a later Windows-specific slice after the macOS graph is proven.
