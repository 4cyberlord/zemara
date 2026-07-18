# Plan 003: Pin the new platform seams (fifo.rs, capture_input.rs) with unit tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f0b88e5c..HEAD -- crates/videorc-backend/src/fifo.rs crates/videorc-backend/src/capture_input.rs`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW (additive test-only change; no production code may be modified)
- **Depends on**: none (but should land before the Windows capture arms — Phase 2 of docs/windows-port-plan.md — extend these files)
- **Category**: tests
- **Planned at**: commit `f0b88e5c`, 2026-06-12

## Why this matters

Commits `d5a478d5` and `4f0c82e6` extracted two new modules that are the
designated seams for the Windows port:

- `crates/videorc-backend/src/fifo.rs` — the only place that touches Unix
  FIFOs (`mkfifo`, non-blocking writer open). Windows named pipes will be
  added here (port plan Phase 3).
- `crates/videorc-backend/src/capture_input.rs` — the only place that maps
  devices to ffmpeg input arguments. Windows `ddagrab`/`dshow` arms land here
  (port plan Phase 2).

Today neither has a single direct test: their behavior is pinned only
indirectly through `recording.rs` integration tests. When the Windows arms
are added, the author will be editing exactly these files — direct unit tests
both protect the macOS arg strings from accidental drift and serve as API
documentation showing the new arms what "correct" looks like.

## Current state

- `crates/videorc-backend/src/fifo.rs` (94 lines, no `#[cfg(test)]` block).
  Public API:

  ```rust
  #[cfg(unix)]
  pub fn create(path: &Path) -> io::Result<()>          // mkfifo, mode 0600
  #[cfg(unix)]
  pub fn open_writer(
      path: &Path,
      stop: &AtomicBool,
      retry: Duration,
      clear_nonblock: bool,
      stopped_message: &str,
  ) -> io::Result<File>
  // #[cfg(not(unix))] twins return io::ErrorKind::Unsupported.
  ```

  `create` does NOT remove an existing file first (callers do); `mkfifo` on an
  existing path fails with EEXIST. `open_writer` retries opening
  O_WRONLY|O_NONBLOCK every `retry` until a reader attaches or `stop` flips
  (then `ErrorKind::Interrupted` with `stopped_message`); `clear_nonblock`
  controls whether O_NONBLOCK is removed via fcntl after a successful open.

- `crates/videorc-backend/src/capture_input.rs` (~143 lines, no test block).
  Public API: `VideoInput` / `MicrophoneInput` enums,
  `AVFOUNDATION_VIDEO_PIXEL_FORMAT` (= `"nv12"`), and three builders:

  ```rust
  pub fn append_avfoundation_video_input(args: &mut Vec<String>, device_index: usize, fps: u32, capture_cursor: bool)
  pub fn append_microphone_input(args: &mut Vec<String>, microphone: Option<&MicrophoneInput>, next_input_index: &mut usize) -> bool
  pub fn microphone_channels(microphone: Option<&MicrophoneInput>) -> u16
  pub fn append_live_avfoundation_video_input(args: &mut Vec<String>, device_index: usize, fps: u32)
  ```

  Exact behavior to pin (read the file to confirm before writing asserts):
  - `append_avfoundation_video_input(args, 3, 30, true)` appends, in order:
    `-fflags nobuffer -flags low_delay -probesize 32 -analyzeduration 0
    -thread_queue_size 16 -f avfoundation -pixel_format nv12 -framerate 30
    -capture_cursor 1 -i 3:none` (the `-capture_cursor 1` pair is present
    only when `capture_cursor` is true).
  - `append_microphone_input` with `MicrophoneInput::CoreAudio { fifo_path:
    Some(p), .. }` appends `-f f32le -ar 48000 -ac 2 -thread_queue_size 1024
    -i <p>`, increments `next_input_index`, returns `true`; with
    `fifo_path: None` returns `false` and appends nothing; with
    `MicrophoneInput::AvFoundation { index: 2 }` appends `-f avfoundation
    -thread_queue_size 512 -i :2`, increments, returns `true`; with `None`
    returns `false`.
  - `microphone_channels`: CoreAudio → 2, AvFoundation → 1, None → 0.
  - `append_live_avfoundation_video_input(args, 0, 30)` appends `-f
    avfoundation -framerate 30 -i 0:none` (no low-latency tuning — that's
    intentional, see the doc comment).

- Conventions: tests are inline `#[cfg(test)] mod tests { use super::*; ... }`
  at the bottom of the module — see `crates/videorc-backend/src/secrets.rs`
  (lines ~140-200) for the structural pattern, including the
  temp-dir-with-pid trick for filesystem tests.

- The constants 48000 / 2 / 1024 come from `crate::audio::{
  NATIVE_AUDIO_SAMPLE_RATE, NATIVE_AUDIO_CHANNELS,
  NATIVE_AUDIO_FFMPEG_QUEUE_SIZE }` — assert against the constants, not bare
  literals, so a deliberate constant change doesn't break these tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run just the new tests | `cargo test -p videorc-backend capture_input:: fifo::` | all new tests pass |
| Full backend suite | `cargo test -p videorc-backend` | 577+ tests pass (540 + 36 + 1 today, plus yours) |
| Format | `cargo fmt -p videorc-backend && cargo fmt --check -p videorc-backend` | exit 0 |
| Clippy (the repo gate) | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |
| Windows cross-check | `pnpm check:windows` | "Finished" with no errors |

Note: `cargo clippy --tests` has ~9 PRE-EXISTING failures unrelated to this
plan (verified at `f0b88e5c`). The repo gate runs clippy WITHOUT `--tests`.
Do not fix those pre-existing test lints — out of scope. Your new test code
should still compile warning-free under `cargo test`.

## Scope

**In scope**:
- `crates/videorc-backend/src/fifo.rs` — append a `#[cfg(test)] mod tests` only.
- `crates/videorc-backend/src/capture_input.rs` — append a `#[cfg(test)] mod tests` only.

**Out of scope** (do NOT touch):
- Any non-test code in those two files (if a test reveals a bug, STOP and
  report — do not fix production code under this plan).
- `recording.rs`, `audio.rs`, `live_render.rs` and their existing tests.
- The pre-existing `clippy --tests` failures elsewhere in the crate.

## Git workflow

- Work directly on `main` (owner convention: commit + push after each
  verified slice; imperative subjects). One commit. End the message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Steps

### Step 1: capture_input.rs tests (pure, no I/O — write these first)

Append a test module pinning every behavior listed in "Current state".
Suggested test names (one assert-cluster each):

- `session_video_input_args_for_screen_include_cursor_capture`
- `session_video_input_args_for_camera_omit_cursor_capture`
- `native_fifo_microphone_args_use_native_audio_constants`
- `coreaudio_microphone_without_fifo_appends_nothing`
- `avfoundation_microphone_fallback_args`
- `absent_microphone_appends_nothing`
- `microphone_channels_per_variant`
- `live_video_input_args_are_plain`

Assert full arg vectors with `assert_eq!(args, vec![...])` (order is the
contract — ffmpeg input flags must precede their `-i`), building expected
values from the `NATIVE_AUDIO_*` constants where applicable. Also assert the
`next_input_index` increments and the bool returns.

**Verify**: `cargo test -p videorc-backend capture_input::` → all listed
tests pass.

### Step 2: fifo.rs tests (Unix file-system behavior)

Append a test module (these run on the macOS dev box; gate the whole mod
`#[cfg(all(test, unix))]` — see STOP conditions before deviating). Use a
temp path like `std::env::temp_dir().join(format!("videorc-fifo-test-{}", std::process::id()))`
(pattern: `secrets.rs` tests). Cases:

- `create_makes_a_fifo_with_owner_only_mode`: `create()` succeeds; via
  `std::os::unix::fs::FileTypeExt`, `metadata.file_type().is_fifo()` is true;
  via `PermissionsExt`, `mode & 0o777 == 0o600`.
- `create_fails_on_existing_path`: second `create()` on the same path errors
  (EEXIST — assert `.is_err()`; do not assert the exact errno text).
- `open_writer_returns_interrupted_when_stopped`: with `stop` already `true`,
  returns `ErrorKind::Interrupted` and the error message equals the
  `stopped_message` you passed.
- `open_writer_connects_once_a_reader_attaches`: spawn a thread that opens
  the FIFO for reading (`std::fs::File::open`), call `open_writer` with
  `retry = Duration::from_millis(5)`, `clear_nonblock = true` → returns Ok;
  write a few bytes; join the reader. Clean up the temp dir at the end.
- (Optional, only if trivial with the existing `libc` dep:)
  `clear_nonblock_controls_the_flag`: after open with `clear_nonblock=false`,
  `libc::fcntl(fd, F_GETFL)` has `O_NONBLOCK` set; with `true` it doesn't.
  Skip this case if it turns flaky — the two cases above are the contract.

**Verify**: `cargo test -p videorc-backend fifo::` → all pass; run it twice
to confirm no temp-dir collision flakes.

### Step 3: full gates

**Verify**, in order:
1. `cargo test -p videorc-backend` → everything passes (old + new).
2. `cargo fmt -p videorc-backend && cargo fmt --check -p videorc-backend` → exit 0.
3. `cargo clippy -p videorc-backend -- -D warnings` → exit 0.
4. `pnpm check:windows` → finishes with no errors (the new `#[cfg(all(test,
   unix))]` module must not break the Windows cross-check).

## Test plan

This plan IS the test plan. Coverage delivered: 8 capture_input cases +
4-5 fifo cases, all listed in Steps 1-2 with their assertions.

## Done criteria

ALL must hold:

- [ ] `cargo test -p videorc-backend` passes with ≥ 12 new tests
      (`capture_input::tests::*` + `fifo::tests::*` all green).
- [ ] `cargo fmt --check -p videorc-backend` and
      `cargo clippy -p videorc-backend -- -D warnings` exit 0.
- [ ] `pnpm check:windows` still green.
- [ ] `git diff --stat` shows ONLY the two in-scope files changed, and only
      below their production code (test modules appended).
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The public signatures in "Current state" don't match the live files
  (drift — e.g. Phase 2 Windows arms already landed and changed the API).
- A test you wrote per the pinned behaviors FAILS — that means the excerpted
  contract and the code disagree. Do not "fix" either side; report the
  mismatch (this is the plan's most valuable possible outcome).
- `pnpm check:windows` breaks and the cause is the test module gating —
  report rather than restructuring the module's cfg attributes beyond
  `#[cfg(all(test, unix))]`.
- FIFO tests deadlock or hang in CI-like environments (`open` blocking
  forever): cap the reader-thread join with a timeout pattern and report if
  it trips twice.

## Maintenance notes

- Phase 2 of `docs/windows-port-plan.md` adds `ddagrab`/`dshow` arms to
  `capture_input.rs`: every new arm gets the same exact-arg-vector test
  treatment — these tests are the template.
- Phase 3 adds the named-pipe twin to `fifo.rs`; the Unix test cases here
  define the behavioral contract the Windows implementation must match
  (create → open_writer(retry/stop) → write).
- Reviewer should check: asserts reference the `NATIVE_AUDIO_*` constants
  (not literals), and no production lines changed in the diff.
