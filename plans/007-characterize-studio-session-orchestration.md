# Plan 007: Characterize Studio and session orchestration before refactoring

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- apps/desktop/src/renderer/src/hooks/use-studio.tsx apps/desktop/src/renderer/src/lib/capture.ts apps/desktop/src/renderer/src/lib/capture.test.ts apps/desktop/src/shared/native-preview-latest-wins.ts apps/desktop/src/shared/native-preview-latest-wins.test.ts crates/videorc-backend/src/recording.rs apps/desktop/src/main/index.ts`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tests, tech-debt
- **Planned at**: commit `3d217933`, 2026-06-13

## Why this matters

The most fragile product behavior lives in huge orchestration files:
`recording.rs` is 8099 lines, `use-studio.tsx` is 4372 lines, and Electron
main is 3926 lines. Preview pumping, Go Live, stream setup, capture persistence,
and recording state transitions are coupled in places that are hard to test
without launching the whole app. This plan adds characterization seams and pure
tests first, so future refactors can move behavior without changing it.

## Current state

Relevant files:

- `apps/desktop/src/renderer/src/hooks/use-studio.tsx` - Studio provider,
  preview pump, persistence, Go Live.
- `apps/desktop/src/renderer/src/lib/capture.ts` - existing pure capture
  normalization helpers and tests.
- `apps/desktop/src/shared/native-preview-latest-wins.ts` - existing shared
  pure helper pattern for preview update policy.
- `crates/videorc-backend/src/recording.rs` - session start and recording policy.
- `apps/desktop/src/main/index.ts` - main-window/preview-window/native-preview
  orchestration.

Current `use-studio.tsx` has large state clusters:

```ts
// apps/desktop/src/renderer/src/hooks/use-studio.tsx:560
const [goLivePreflight, setGoLivePreflight] = useState<GoLivePreflight | null>(null)
const [goLiveConfirmationOpen, setGoLiveConfirmationOpen] = useState(false)
const [goLiveConfirmationPending, setGoLiveConfirmationPending] = useState(false)
const [goLivePartialSetup, setGoLivePartialSetup] = useState<GoLivePartialSetup | null>(null)
```

Session params are built inline inside the provider:

```ts
// apps/desktop/src/renderer/src/hooks/use-studio.tsx:676
const sessionParams = useMemo<StartSessionParams>(
  () => ({
    sources: captureConfig.sources,
    layout: captureConfig.layout,
    scene: scene ?? undefined,
```

Native preview present queue is also inline:

```ts
// apps/desktop/src/renderer/src/hooks/use-studio.tsx:900
const queueNativePreviewCompositorPresent = useCallback(
  (activeClient: BackendClient, status: CompositorStatus) => {
    const updateCompositor =
      typeof window === 'undefined'
        ? undefined
        : window.videorc?.updateNativePreviewSurfaceCompositor
```

Persistence writes directly from provider effects:

```ts
// apps/desktop/src/renderer/src/hooks/use-studio.tsx:1414
useEffect(() => {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
}, [settings])

useEffect(() => {
  localStorage.setItem(
    STORAGE_KEYS.captureConfig,
    JSON.stringify(persistableCaptureConfig(captureConfig))
  )
}, [captureConfig])
```

Go Live start/partial setup is inline:

```ts
// apps/desktop/src/renderer/src/hooks/use-studio.tsx:3539
const confirmGoLive = useCallback(async () => {
  if (!client || goLiveConfirmationPending || startRequestPending) {
    return
  }
```

`recording.rs` session start is a broad orchestration function:

```rust
// crates/videorc-backend/src/recording.rs:282
pub async fn start_session(
    state: AppState,
    mut params: StartSessionParams,
) -> Result<RecordingStatus> {
    if state.recording.lock().await.is_some() {
        bail!("A capture session is already running");
```

Existing test shape:

- Renderer lib tests exist in `apps/desktop/src/renderer/src/lib/*.test.ts`.
- Shared preview policy tests exist in `apps/desktop/src/shared/*.test.ts`.
- There is no direct `use-studio` test.

Repo conventions:

- Prefer small pure helpers for behavior that needs tests.
- Keep frontend controls dense and work-focused; do not redesign UI here.
- Avoid broad refactors until behavior is pinned.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Desktop tests | `pnpm --filter @videorc/desktop test` | all Vitest tests pass |
| TypeScript typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Rust tests | `cargo test -p videorc-backend` | all non-ignored tests pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |

## Scope

**In scope**:

- New pure renderer helpers under `apps/desktop/src/renderer/src/lib/`
- New tests under `apps/desktop/src/renderer/src/lib/*.test.ts`
- Small imports/call-site changes in `use-studio.tsx` to delegate to helpers
- Backend characterization tests inside `crates/videorc-backend/src/recording.rs`
  only if they pin existing behavior

**Out of scope**:

- Changing user-visible Studio behavior.
- Moving large chunks of `use-studio.tsx` into new React providers.
- Splitting `recording.rs` into modules.
- Changing media encoder behavior. That belongs to Plans 005 and 006.
- Changing Electron window sandboxing. That is Plan 011.

## Git workflow

- Branch: `codex/007-characterize-studio-session`
- Commit style: behavior-preserving, test-first commits.
- Do not push unless instructed.

## Steps

### Step 1: Extract and test session-param construction

Create `apps/desktop/src/renderer/src/lib/session-params.ts` with a pure helper:

```ts
export function buildStartSessionParams(input: {
  captureConfig: CaptureConfig
  scene: Scene | null
  settings: SettingsState
}): StartSessionParams
```

Move the object construction from `use-studio.tsx` into this helper without
changing field names or trimming behavior.

Add `session-params.test.ts` covering:

- blank output directory and FFmpeg path become `undefined`
- stream key is trimmed
- `scene: null` becomes `undefined`
- `streaming` is passed through unchanged
- record/stream booleans match capture config

Use `capture.test.ts` as the test style pattern.

**Verify**: `pnpm --filter @videorc/desktop test -- session-params` exits 0.

### Step 2: Extract and test Go Live flow decisions

Create `apps/desktop/src/renderer/src/lib/go-live-flow.ts` for pure decisions
only. Do not move network calls into the helper.

At minimum, model:

- whether `startSession` should open confirmation or directly start
- how partial setup changes confirmation state
- cancel behavior when partial setup exists
- continue-with-ready-destinations behavior

The helper can be a reducer or named decision functions. Keep it small enough
that `confirmGoLive` still reads clearly in `use-studio.tsx`.

Add `go-live-flow.test.ts` covering:

- non-stream session starts directly
- stream session opens confirmation
- invalid preflight blocks start
- partial setup keeps confirmation open and stores ready streaming snapshot
- continue consumes partial setup and starts with ready snapshot

**Verify**: `pnpm --filter @videorc/desktop test -- go-live-flow` exits 0.

### Step 3: Extract and test native preview present policy

Create `apps/desktop/src/renderer/src/lib/native-preview-present-policy.ts` or
extend the existing shared preview helper if that is cleaner.

Pin pure decisions from `queueNativePreviewCompositorPresent`, including:

- suppress presents while recording state is `starting`
- suppress frame polling during active recording states
- latest compositor status wins when a newer pending status supersedes an older
  one
- dropped-frame accounting includes locally suppressed presents

Do not move the actual async IPC loop unless the pure helper makes it trivial.

Add tests modeled after `apps/desktop/src/shared/native-preview-latest-wins.test.ts`.

**Verify**: `pnpm --filter @videorc/desktop test -- native-preview` exits 0.

### Step 4: Add backend characterization tests before any recording split

Inside `recording.rs`, add small tests for behavior that future media work must
not break:

- `validate_video_profile_policy` still blocks stream-only 4K before Plan 006
  lands.
- stream bitrate above 6000 still errors.
- 4K record-only is allowed.
- explicit raw encoder output override still selects raw.

If Plans 005 or 006 have already changed these expectations, update tests to
the new accepted behavior and reference those plan numbers in test comments.

**Verify**: `cargo test -p videorc-backend video_profile_policy` exits 0.

## Test plan

- New TS tests:
  - `session-params.test.ts`
  - `go-live-flow.test.ts`
  - `native-preview-present-policy.test.ts`
- Existing TS tests:
  - `capture.test.ts`
  - `native-preview-latest-wins.test.ts`
- Rust characterization tests in `recording.rs`.

## Done criteria

- [ ] Session-param construction is in a pure helper with tests.
- [ ] Go Live flow decisions are in a pure helper with tests.
- [ ] Native preview present policy has pure tests.
- [ ] `use-studio.tsx` behavior is unchanged except delegating to helpers.
- [ ] No large provider split or UI redesign was performed.
- [ ] `pnpm --filter @videorc/desktop test`, `pnpm typecheck`, `pnpm lint`,
      `cargo test -p videorc-backend`, and
      `cargo clippy -p videorc-backend -- -D warnings` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- A helper extraction changes runtime behavior or requires mocking the whole
  provider.
- The Go Live flow cannot be characterized without changing network ordering.
- Preview present policy needs native window changes.
- The plan starts becoming a broad `use-studio.tsx` rewrite.

## Maintenance notes

This plan deliberately does not make the big files small. It creates safe
behavior pins so later executors can split them with confidence. Reviewers
should reject incidental UI changes in this slice.
