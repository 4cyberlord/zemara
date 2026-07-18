# Plan 014: Add guided audio sync calibration and drift gates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 0ea3c66c..HEAD -- apps/desktop/src/renderer/src/lib/capture.ts apps/desktop/src/renderer/src/lib/capture.test.ts apps/desktop/src/renderer/src/hooks/use-studio.tsx apps/desktop/src/renderer/src/components/tabs/sources-tab.tsx crates/videorc-backend/src/protocol.rs crates/videorc-backend/src/audio.rs scripts/measure-av-sync.mjs scripts/stream-av-sync-baseline.mjs scripts/lib/av-sync.mjs docs/obs-acceptance-checklist.md`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code before proceeding. On mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 006 and 007
- **Category**: bug, tests, direction
- **Planned at**: commit `0ea3c66c`, 2026-06-13
- **Current status**: IN PROGRESS, 2026-06-13. Step 1 landed as a
  script-only slice: `measure-av-sync` now supports `--json` and emits a stable
  recommendation report with measured lag, current offset, recommended offset,
  thresholds, pass/fail, and sample counts. Step 2 renderer helpers now format
  measured lag, decide apply/reset state, and preserve explicit user-set sync
  offsets. Step 3 added the Sources-tab import/apply/reset flow for measurement
  JSON without auto-recording. Step 4 evidence shaping now records stream sync
  classification plus MKV/FLV drift slopes and 30-minute estimates. Real
  long-session media gate evidence remains pending.

## Why this matters

The user already found that recording video looks good but audio can be late.
The backend now treats structural A/V alignment as the default and exposes a
manual sync trim, but calibration is still an expert workflow: run a script,
read a measurement, type milliseconds manually. This plan makes sync correction
repeatable, testable, and safe for long sessions instead of depending on a
remembered magic offset.

## Current state

Relevant files:

- `apps/desktop/src/renderer/src/lib/capture.ts` - sync offset normalization and
  parsing.
- `crates/videorc-backend/src/protocol.rs` - `AudioSettings` protocol field.
- `scripts/measure-av-sync.mjs` - measures flash/click offset.
- `scripts/stream-av-sync-baseline.mjs` - measures record-only, record+stream,
  and received FLV sync.
- `docs/obs-acceptance-checklist.md` - current A/V target.

The UI config supports exact millisecond values:

```ts
// apps/desktop/src/renderer/src/lib/capture.ts:349
export function normalizeAudioSettings(audio: unknown): AudioSettings {
  const offsetUserSet = candidate.microphoneSyncOffsetUserSet === true
```

The backend default is intentionally zero, not a hidden calibration constant:

```rust
// crates/videorc-backend/src/protocol.rs:609
fn default_microphone_sync_offset_ms() -> i32 {
    // Audio/video alignment is structural now...
    0
}
```

The acceptance note records a successful manual calibration:

```md
<!-- docs/acceptance/2026-06-07-obs-parity-acceptance.md:52 -->
`pnpm measure:av-sync <recording> --current-offset-ms -120 --require-target`
```

Repo conventions:

- Keep audio alignment structural; do not hide pipeline bugs behind a new
  default offset.
- Prefer pure helpers with unit tests for behavior that reaches UI controls.
- Treat A/V sync evidence as measured, not subjective.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Desktop tests | `pnpm --filter @videorc/desktop test -- capture` | sync tests pass |
| Script tests | `pnpm test:scripts` | all pass |
| TypeScript | `pnpm typecheck` | exits 0 |
| Rust tests | `cargo test -p videorc-backend audio` | audio tests pass |
| Real sync gate | `pnpm baseline:real-source:4k30:av-sync -- --gate` | exits 0 with permissions |
| Stream sync gate | `pnpm baseline:stream:av-sync -- --gate` | exits 0 after Plan 006 |

## Scope

**In scope**:

- sync offset parsing/normalization helpers and tests
- a guided UI affordance in Sources or Diagnostics
- scripts that output machine-readable recommended offsets
- docs and acceptance instructions
- drift threshold checks for long sessions

**Out of scope**:

- Replacing the CoreAudio capture implementation.
- Implementing system audio. Plan 017 owns that.
- Adding audio monitoring.
- Setting a non-zero default offset for every user.

## Git workflow

- Branch: `codex/014-guided-audio-sync`
- Commit style: script output first, pure UI helpers second, UI/docs last.
- Do not push unless instructed.

## Steps

### Step 1: Make sync measurement emit a stable recommendation

Update `scripts/measure-av-sync.mjs` and related pure helpers so every
successful run can output JSON with:

- measured median lag
- current offset
- recommended next offset
- target threshold
- pass/fail
- sample count

The recommendation rule must be pure and unit-tested. It should clamp to
`MICROPHONE_SYNC_OFFSET_MIN_MS` and `MICROPHONE_SYNC_OFFSET_MAX_MS`.

**Verify**: `pnpm test:scripts` exits 0 and `measure-av-sync` can print JSON for
a fixture.

### Step 2: Add calibration state helpers to the renderer

Add pure helpers in `apps/desktop/src/renderer/src/lib/` for:

- formatting measured lag
- deciding whether an offset recommendation is applyable
- preserving `microphoneSyncOffsetUserSet`
- explaining when calibration is not available

Use `capture.test.ts` style. Do not add a broad React test harness.

**Verify**: `pnpm --filter @videorc/desktop test -- capture` exits 0.

### Step 3: Add a guided UI flow

In the Sources tab or Diagnostics tab, add a compact calibration section:

- current sync offset input remains editable
- "Open sync stimulus" launches the existing flash/click fixture or instructions
- "Apply measured offset" accepts a measurement JSON file or latest evidence if
  already available
- applied offsets set `microphoneSyncOffsetUserSet: true`
- reset returns to structural default `0`

Do not auto-record the user's screen/camera without explicit start.

**Verify**: `pnpm typecheck`, `pnpm lint`, and desktop tests pass.

### Step 4: Add long-session drift reporting

Extend `scripts/stream-av-sync-baseline.mjs` evidence so endurance runs record:

- slope in ms/minute for local MKV
- slope in ms/minute for received FLV
- estimated 30-minute drift
- classification: fixed offset, drift, or stream-leg divergence

Gate only when there is enough sample span. Do not fail short runs on drift.

**Verify**:

```sh
pnpm test:scripts
pnpm baseline:stream:av-sync -- --gate
```

### Step 5: Update acceptance docs

Update `docs/obs-acceptance-checklist.md` with the guided calibration flow:

- how to create the flash/click recording
- how to apply the measured recommendation
- when to re-run after changing microphones
- what drift threshold blocks release

**Verify**: `pnpm format:check` exits 0.

## Test plan

- Unit tests for offset recommendation and clamping.
- Unit tests for renderer calibration helper states.
- `pnpm test:scripts`.
- `pnpm --filter @videorc/desktop test`.
- Real local A/V sync gate after applying a measured offset.
- Endurance stream A/V sync when hardware is available.

## Done criteria

- [x] `measure-av-sync` emits a stable machine-readable recommendation.
- [x] UI can apply/reset measured sync offsets without crashing or disappearing.
- [x] Calibration never changes the default offset unless the user applies it.
- [x] Stream A/V evidence reports fixed offset vs drift vs stream divergence.
- [x] Docs explain the operator flow.
- [ ] TS, script, and relevant Rust gates pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Long-session evidence shows clock drift that cannot be corrected by one fixed
  offset.
- Applying offsets requires changing the backend timestamp model.
- UI calibration would need to start a recording without explicit user action.
- The fix starts overlapping with system audio capture.

## Maintenance notes

Revisit this plan after Plan 017. Mixing microphone plus system audio may expose
clock drift that fixed microphone calibration cannot solve.
