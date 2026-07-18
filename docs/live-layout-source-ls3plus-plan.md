# Live Layout & Source Changes — LS3b-3 → LS9 implementation plan

Execution plan for the remainder of the Live Layout/Source Changes track. LS0 → LS3b-2
are done and on `main` (the revision model, compositor, render consumer, and the
threaded `LiveSessionPipeline`), all proven with **synthetic (lavfi) sources** and
gated behind `allow(dead_code)`. This document decomposes the rest into safe,
independently-shippable slices.

## Where we are

| Done | What | Verified |
| --- | --- | --- |
| LS0 | audit + hot/warm/cold matrix (`docs/live-layout-source-ls0-audit.md`) | doc |
| LS1 | `live_scene.rs` — revision model, classify, conflict, `LiveEditEvent` timeline | unit |
| LS2 | `live_render.rs` — compositor + `LiveRenderConsumer` + render→encode proof | unit + `#[ignore]` |
| LS3a | real-pixel `composite_frames` + capture→composite→encode proof | unit + `#[ignore]` |
| LS3b-1 | `render_frames` + `capture_ffmpeg_args` / `render_encode_ffmpeg_args` | unit + `#[ignore]` |
| LS3b-2 | `live_pipeline.rs` — threaded `LiveSessionPipeline` (start/apply_edit/stop) | `#[ignore]` |

**The architecture gap:** today's real session (`recording.rs::start_session`) spawns
one FFmpeg that owns capture **and** render **and** encode via a frozen
`-filter_complex`; the scene graph only drives preview/UI. The proven path forward is
**FFmpeg-capture → Rust-composite → FFmpeg-encode**, which `LiveSessionPipeline`
implements — but only against lavfi inputs so far. The remaining work wires it into a
real session and onto real devices.

## Guiding decisions

1. **Additive, gated rollout — do not replace the proven path in place.** Introduce
   the render pipeline as an alternative session output behind a capability
   (`output.live_edit = true`, or "live edit mode"). The existing avfoundation+filter
   recorder stays the default until the render pipeline reaches parity (preview +
   record + stream, real capture, acceptable performance). Then flip the default.
2. **One composite, every consumer.** The render encoder fans the composited frame to
   recording + every stream target (the M4 `tee`) **and** the live preview (an mjpeg
   leg), so preview/record/stream are byte-identical by construction — satisfying the
   plan's "consume the same committed revision" rule.
3. **Never pretend live.** A control reaches the live output only once the render
   pipeline is the active output. Until a slice lands, the matching UI stays disabled
   or labelled `Applies next session` (LS0 rule).
4. **Honest verification split.** Everything composable from synthetic sources is
   green-gated here (unit + `#[ignore]` ffmpeg tests + smokes). Real screen/camera
   capture, live device switching, and live resolution/FPS need macOS
   permissions + hardware and are **verified by the user**; the agent ships the code +
   the headless-testable parts and a manual checklist.

## Concurrency note

`recording.rs`, `state.rs`, `main.rs`, and `protocol.rs` are being actively edited by
parallel work (e.g. `Remember selected sources`, `stream screen records`). Every slice
below lists the files it touches and flags the **(concurrent-hot)** ones. Sequence the
hot-file slices when those files are quiet, or land them as small, rebase-friendly
diffs.

---

## LS3b-3 — wire the pipeline into a real session (test-pattern first)

Goal: a real session can run on `LiveSessionPipeline` with the **test-pattern (lavfi)**
source path, so `scene.live.apply` genuinely changes the live recording/preview. No
real-device dependency yet — this is fully headless-verifiable.

### LS3b-3a — AppState slot + lifecycle
- Add an `Arc<Mutex<Option<LiveSessionPipeline>>>` (+ the `ActiveScene` it owns) to
  `AppState`; clear on stop/idle.
- Files: `state.rs` **(concurrent-hot)**, `live_pipeline.rs`.
- Tests: unit — slot set on start, cleared on stop.

### LS3b-3b — `start_session` branch
- When live-edit mode is on, build the `ActiveSceneState` from the start params
  (reuse `scene::scene_from_capture_config` → map into `ActiveSceneState`), spawn the
  pipeline with lavfi captures per source, and store it in `AppState`. Emit
  `recording.status` as today.
- Files: `recording.rs::start_session` **(concurrent-hot)**, `state.rs`.
- Tests: extend a dev smoke — start a live-edit test-pattern session, stop, assert the
  MKV finalized.

### LS3b-3c — protocol commands
- `scene.live.get` → snapshot; `scene.live.apply` → `pipeline.apply_edit` (returns the
  `LiveEditDecision`); `scene.live.revert_last`. Emit `scene.live.changed` +
  `session.live_edit` events on commit.
- Files: `main.rs` handler **(concurrent-hot)**, `protocol.rs` **(concurrent-hot)**,
  `backend.ts` (mirror), `use-studio.tsx` (subscribe).
- Tests: Rust unit (dispatch + classification), smoke (apply over WS → recording
  reflects the edit by sampling output frames).

### LS3b-3d — preview parity
- Add an mjpeg preview leg to the render encoder (mirrors today's `-map [preview]`), so
  the live preview is the same composited frame as the recording.
- Files: `live_render.rs` (encoder args), `recording.rs`/`state.rs` (wire preview),
  `live_pipeline.rs`.
- Tests: smoke — preview frame changes after an edit.

**Acceptance:** a test-pattern session shows a camera drag/hide in the recording **and**
preview, same Session, no new file, no restart — all headless.

---

## LS3b-4 — tee fan-out to stream targets

Goal: a live-edit session can record **and** multistream.
- Extend the render encoder to `tee` (recording `onfail=abort` + flv stream legs
  `onfail=ignore`), reusing the proven M4 settings (`+global_header`, 2s keyframes,
  `use_fifo`). Factor the tee construction so `recording.rs` and `live_render.rs` share
  it.
- Files: `live_render.rs`, `recording.rs` (extract shared tee builder)
  **(concurrent-hot)**.
- Tests: extend `smoke:multistream` to drive the render pipeline → all local RTMP
  targets + the offline-leg resilience check still pass.

**Acceptance:** live edits reach every enabled stream target + the recording
identically (re-uses the M5/M6 smoke harness).

---

## LS3b-5 — real avfoundation capture into Rust *(user-verified)*

Goal: replace lavfi captures with real screen + camera.
- Map enumerated device ids (`screen_capture.rs` / `camera_capture.rs`) to avfoundation
  indices; build captures via `capture_ffmpeg_args(AvFoundationVideo)`. Surface
  permission failures as `SourceRuntimeState { state: permission-needed }` rather than
  crashing.
- Files: `recording.rs` (capture spec resolution), `screen_capture.rs` /
  `camera_capture.rs` (index mapping), `live_pipeline.rs`.
- Headless-verifiable: the index-mapping + arg-building unit tests.
- **User-verified:** real screen/camera capture (Screen-Recording + Camera
  permissions) and **realtime performance** at 1080p (capture + composite + encode).
  Manual checklist: record with real sources, drag the camera, confirm the file shows
  it; check Diagnostics encoder speed ≈ 1.0×.
- Risk: the per-pixel nearest-neighbour `composite_frames` may not hold 1080p30 on the
  main thread — measure first; if needed, parallelise rows (rayon) or move to a GPU/
  `wgpu` compositor. **Add an explicit perf measurement step before flipping the
  default.**

---

## LS4 — live layout preset changes

- Apply `layout.set_preset` to the `ActiveScene` (rebuild source set/visibility/regions
  per the preset) through the mutation path; hot when the needed sources are already
  live, warm (start a source first — depends on LS5) otherwise.
- Files: `live_scene.rs` (preset → scene rebuild), `protocol.rs`/`main.rs`
  **(concurrent-hot)**, `layout-tab.tsx` (enable presets live + impact label).
- Tests: unit (preset rebuilds the scene), smoke (preset change reflected in output).

## LS5 — live source switching *(user-verified)*

The warm-change machinery. A `SourceManager`:
- spawns a replacement capture, waits for its first frame, then atomically swaps the
  source's capture stream in the render loop and kills the old; keeps the old live
  until the new is ready; restores the old on failure and reports `failed`; per-source
  `SourceRuntimeState` (connecting/live/failed/permission-needed). Mic swap is atomic
  (no double audio).
- Files: `live_pipeline.rs` (SourceManager + swap), `recording.rs`
  **(concurrent-hot)**, `protocol.rs`/`main.rs` (`source.live.switch` /
  `source.live.status`) **(concurrent-hot)**, `sources-tab.tsx`.
- Headless: state-transition unit tests; an `#[ignore]` swap of one lavfi source
  mid-run (old→new, and a forced-failure restore).
- **User-verified:** real camera/window/mic switch while recording/streaming, picker
  snaps back on failure.

## LS6 — active session UI

- Layout: live edit mode during a session, Undo Last Live Edit. Sources: immediate
  switching with `switching…` rows. Studio: quick controls (show/hide camera, mute,
  camera corner, reset layout) — no source switching. Active-session badges
  (`Applies live` / `Reconnects source` / `Next session`); non-blocking failure banner.
- Files: `use-studio.tsx`, `layout-tab.tsx`, `sources-tab.tsx`, `studio-tab.tsx`,
  `backend.ts`.
- Tests: `typecheck` + `build`; browser interaction checks (`browser:control-in-app-browser`).

## LS7 — live output tuning *(user-verified)*

- **Bitrate** live (videotoolbox; may need an encoder-leg restart while capture + scene
  continue). **Resolution/FPS** live = reconfigure the render canvas + restart the
  encoder leg atomically (a warm output swap) — keep capture and the scene running.
  Codec + horizontal/vertical canvas stay **cold** (`Applies next session`). This is
  the slice that promotes `output.resolution.patch`/`output.fps.patch` from the
  LS1-cold classification to warm/hot.
- Files: `live_pipeline.rs` (output reconfiguration), `live_scene.rs` (reclassify),
  `recording.rs` **(concurrent-hot)**, `recording-tab.tsx`/`streaming-tab.tsx`.
- Headless: `#[ignore]` bitrate + resolution change mid-run → output continues.
- **User-verified:** quality/continuity on real hardware.

## LS8 — diagnostics, library, AI hints

- Live edit timeline + source-switch diagnostics in the Diagnostics tab; persist
  `LiveEditEvent`s in session metadata; Library shows sessions with live-edit history;
  AI workflow consumes live edit events as chapter/context hints.
- Files: `diagnostics-tab.tsx`, `library-tab.tsx`, `storage.rs` **(concurrent-hot)**,
  `ai.rs`, `backend.ts`.
- Tests: unit (event persistence), browser.

## LS9 — multistream & recording acceptance

- Verify live edits across record-only / stream-only / record+stream / multistream;
  every YouTube/Twitch/X/Custom target gets the same composition; recording matches the
  stream; no raw frames cross Electron IPC; during a multistream failure banner only
  emergency visibility/mute controls stay enabled.
- Files: smokes + a manual acceptance checklist (`docs/`).
- Tests: extend `smoke:multistream`; **user** real-platform acceptance.

---

## Per-slice verification gate

Every slice ends green on: `pnpm typecheck`, `pnpm build`, `cargo fmt --check --all`,
`cargo test`, `cargo clippy --all-targets -- -D warnings`. Slices with a runnable proof
add an `#[ignore]` ffmpeg test or extend a smoke. Real-device slices (LS3b-5, LS5, LS7)
additionally carry a **manual checklist** the user runs on their Mac.

## Risk register

- **Performance** — main-thread per-pixel compositing at 1080p30 is unproven; measure
  before defaulting (LS3b-5), parallelise or GPU-composite if needed.
- **Permissions** — avfoundation capture needs Screen-Recording + Camera grants;
  failures must be non-crashing + actionable (`permission-needed`).
- **Concurrent files** — `recording.rs`/`state.rs`/`main.rs`/`protocol.rs`/`storage.rs`
  are shared with parallel work; land hot-file slices small and rebase-friendly.
- **Don't-pretend** — keep render-pipeline controls disabled/labelled until the slice
  that makes them real lands and is verified.
- **Parity drift** — preview/record/stream must come from one composite (the encoder's
  fan-out), never recomputed per output.

## Suggested order

LS3b-3 → LS3b-4 → **(measure)** LS3b-5 → LS4 → LS5 → LS6 → LS7 → LS8 → LS9. LS3b-3/-4
are fully headless; LS3b-5 is the first real-device gate and the right moment to decide
whether the FFmpeg-capture→Rust-composite design holds at 1080p or needs a GPU
compositor before continuing.
