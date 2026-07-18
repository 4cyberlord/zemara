# Plan 019: Finish Windows v1 capture and package acceptance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 0ea3c66c..HEAD -- docs/windows-port-plan.md package.json apps/desktop/electron-builder.yml scripts/fetch-ffmpeg-windows.mjs scripts/preflight-windows-package.mjs crates/videorc-backend/src/capture_input.rs crates/videorc-backend/src/fifo.rs crates/videorc-backend/src/audio.rs crates/videorc-backend/src/screen_capture.rs crates/videorc-backend/src/camera_capture.rs apps/desktop/src/main/index.ts`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code before proceeding. On mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: Plans 001, 002, 003, 006, and 012
- **Category**: migration, tests, direction
- **Planned at**: commit `0ea3c66c`, 2026-06-13
- **Execution**: IN PROGRESS - Steps 1 and 2 landed on 2026-06-13.
  Mac-verifiable Step 3 slices landed on 2026-07-08: Windows ffmpeg input
  builders, selected-source ID parsing, DXGI display discovery, MediaFoundation
  camera/microphone discovery, Windows device-list exposure, and recording
  primary-input layout tests now cover display, camera, and microphone variants.
  A backend Job Object wrapper now owns capture and media-maintenance
  FFmpeg/FFprobe children on Windows, and signing status is documented as
  unsigned internal builds until Windows acceptance passes. Windows FFmpeg
  preview runners now publish raw BGRA frames into the existing preview frame
  stores; the Windows local gate now writes a JSON run manifest into the
  acceptance artifact directory and records the strict support-bundle verifier
  command. Recording FFmpeg args now select the platform H.264 encoder, so
  Windows requests MediaFoundation `h264_mf` instead of the macOS
  `h264_videotoolbox` literal. On-box package/recording evidence,
  first-frame/smoothness proof, process-tree cleanup proof, support-bundle
  verification, encoder probing, and signing implementation remain pending.

## Why this matters

Windows is not blocking the macOS-first v1, but the repo already contains a
Windows plan and packaging slices. Leaving Windows half-planned creates false
confidence: packaging is not the same as capture parity. This plan defines the
remaining Windows v1 work as an explicit follow-through track after the macOS
media path is stable.

## Current state

Relevant files:

- `docs/windows-port-plan.md` - full Windows direction.
- `package.json` - Windows check/package scripts.
- `apps/desktop/electron-builder.yml` - Windows packaging target.
- `scripts/fetch-ffmpeg-windows.mjs` and `preflight-windows-package.mjs` -
  resource setup.
- `crates/videorc-backend/src/capture_input.rs` and `fifo.rs` - platform seams.
- `crates/videorc-backend/src/audio.rs`, `screen_capture.rs`,
  `camera_capture.rs` - native capture modules.

Windows packaging scripts exist:

```json
// package.json:24
"package:desktop:windows": "pnpm package:backend && pnpm ffmpeg:fetch:windows && pnpm package:preflight:windows && pnpm --filter @videorc/desktop package"
```

Electron Builder has an unsigned Windows target:

```yaml
# apps/desktop/electron-builder.yml:58
# Windows 11 x64. Unsigned for now (internal testing); Authenticode signing is
# Phase 5.
```

The Windows port plan states capture work remains:

```md
<!-- docs/windows-port-plan.md:233 -->

## Phase 5 - Packaging, signing, verification harness
```

Repo conventions:

- Windows v1 floor is Windows 11.
- Use the `windows` crate for Win32/WinRT/COM work.
- Keep platform seams tested before adding platform arms.

## Commands you will need

| Purpose         | Command                                          | Expected on success          |
| --------------- | ------------------------------------------------ | ---------------------------- |
| Cross-check     | `pnpm check:windows`                             | exits 0 on macOS cross setup |
| Windows package | `pnpm package:desktop:windows`                   | exits 0 on Windows box       |
| Desktop tests   | `pnpm --filter @videorc/desktop test`            | all pass                     |
| Rust tests      | `cargo test -p videorc-backend`                  | all pass                     |
| Rust lint       | `cargo clippy -p videorc-backend -- -D warnings` | exits 0                      |

## Scope

**In scope**:

- Windows capture source enumeration and selected-source recording path
- Windows FIFO/named-pipe implementation if needed
- Windows microphone capture via dshow or WASAPI MVP
- Windows package smoke script
- Windows release docs and acceptance note

**Out of scope**:

- Making Windows block macOS v1 release.
- Windows system audio before macOS Plan 017 is proven.
- DirectComposition native preview parity unless scoped as a later plan.
- Authenticode purchase decisions beyond documenting options.

## Git workflow

- Branch: `codex/019-windows-v1-follow-through`
- Commit style: one platform seam per commit, then packaging/smoke/docs.
- Do not push unless instructed.

## Steps

### Step 1: Reconcile Windows plan status

Update `docs/windows-port-plan.md` with what is already done:

- cross-check
- packaging resources
- window chrome fixes
- seam tests

Leave unfinished phases explicit. Do not mark capture done without a Windows
recording artifact.

**Verify**: docs list current commit/evidence for completed slices.

### Step 2: Add a Windows local gate script

Create `smoke:local-gates:windows` that runs on a Windows box:

- package preflight
- backend tests or targeted tests feasible on Windows
- owned-process lifecycle cleanup smoke
- app package build
- packaged boot smoke
- short test-pattern recording

Keep it separate from macOS `smoke:local-gates`.

**Verify**: script exits 0 on the Windows box, or records exact missing hardware
blockers. The script also writes `windows-local-gates.manifest.json` beside the
acceptance artifacts so a failed run still has host, command, error, and evidence
path context. The manifest includes
`pnpm support-bundle:verify -- <support-bundle.json> --windows-acceptance` so the
Windows support bundle is checked for schema v2, Windows 11 runtime/GPU/package
metadata, device backend proof, encoder diagnostics, and redaction.

### Step 3: Implement Windows source capture MVP

Following `docs/windows-port-plan.md`, add the minimal v1 capture path:

- display capture for the primary display
- camera capture through dshow or native API
- microphone capture
- selected-source metadata mapped to capture inputs

Prefer the existing platform seam files. Do not fork recording policy.

**2026-07-08 progress**: The recording input seam now has Windows variants for
display (`ddagrab` with `gdigrab` fallback), camera (`dshow`), and microphone
(`dshow`) argument builders. Windows DXGI screen IDs and dshow camera/microphone
IDs also resolve into those primary capture inputs, with tests proving primary
screen/camera input layout and microphone channel metadata. Windows display
source enumeration has a first native DXGI implementation behind
`screen_capture.rs`, with a gdigrab desktop fallback if DXGI cannot enumerate
attached outputs. Windows camera enumeration has a first MediaFoundation
implementation behind `camera_capture.rs`, emitting dshow-compatible camera IDs
for the existing recording input builders. Windows microphone enumeration has a
first MediaFoundation implementation behind `audio.rs`, emitting
dshow-compatible microphone IDs, and `devices.rs` now exposes the Windows-native
display/camera/microphone rows instead of the old unsupported-platform list. The
renderer now treats DXGI and gdigrab screen IDs as selectable native screen
sources. Backend Job Object wrappers now own the FFmpeg/FFprobe children used by
recording capture, live preview, remux, poster extraction, import duration
probes, screen-image optimization, repair analysis, health checks, and
AI/audio extraction. Preview source selection now recognizes Windows DXGI,
gdigrab, and dshow IDs instead of misclassifying them as absent macOS-native
sources, preview start commands now carry the configured FFmpeg path, and the
Windows preview runners now spawn FFmpeg to publish raw BGRA frames into the
existing frame stores. Recording FFmpeg args now use a platform encoder helper:
macOS keeps VideoToolbox, Windows uses MediaFoundation `h264_mf`, and fallback
builds use software x264. Dshow symbolic-link behavior, selection from real
Windows device rows, first-frame/smoothness proof, process-tree cleanup proof,
and encoder probe proof still need the Windows box slice before this step is
done.

**2026-07-08 progress (second batch)**: The FIFO output transport is ported —
`fifo.rs` gained a Windows named-pipe arm behind the existing
create/open_writer/cleanup contract, unblocking the encoder-bridge FIFO,
per-leg stream FIFOs, and the screen-overlay FIFO at session start. The
backend now exits when the Electron supervisor dies on Windows (process-handle
watchdog on `VIDEORC_SUPERVISOR_PID`), and `OwnedProcessRegistry.reapStale`
reaps stale ledger PIDs on win32 with a single hard kill. The dshow microphone
honours gain/mute via a `volume=` filter leg (native CoreAudio path
unchanged). `ffprobe.exe` is fetched and bundled next to the Windows ffmpeg,
and the package preflight fails closed on the Windows host unless the bundled
ffmpeg exposes rtmp/rtmps/tls and h264_mf/aac (the 0.9.23 TLS lesson).
On-box proof for all of it (pipe write→ffmpeg read, crash-orphan teardown,
mic mute artifact, capability probe run) still needs the Windows box.

**Verify**:

```sh
cargo test -p videorc-backend capture_input
cargo test -p videorc-backend fifo
pnpm check:windows
```

### Step 4: Package and record on Windows

On a Windows 11 x64 machine:

```sh
pnpm install
pnpm package:desktop:windows
```

Launch the packaged app and record:

- test pattern
- screen-only
- camera-only
- screen+camera+mic

Record the artifacts and analyzer output in a dated acceptance note.

**Verify**: Windows app records usable MKV/MP4 outputs and closes child
processes cleanly.

### Step 5: Decide signing path

Document whether Windows distribution stays internal unsigned or moves to:

- Azure Trusted Signing
- OV/EV Authenticode cert

Do not implement paid signing in this plan unless credentials are available.

**2026-07-08 decision**: keep Windows builds unsigned for internal testing until
the Windows 11 package/capture acceptance run passes. Public distribution stays
blocked on a later Azure Trusted Signing vs OV/EV Authenticode decision.

**Verify**: docs state exact release blocker/status.

## Test plan

- Cross-check on macOS setup.
- Targeted seam tests.
- Windows package build.
- Windows packaged boot/record smoke.
- Manual Windows recording acceptance.

## Done criteria

- [x] Windows plan status is current.
- [x] `smoke:local-gates:windows` exists.
- [ ] Windows package builds on a Windows 11 box.
- [ ] Packaged Windows app records test pattern and at least one real source
      scenario.
- [ ] Child processes are owned and cleaned without broad process scans.
- [x] Signing status is documented.
- [x] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- No Windows 11 box is available for acceptance.
- Capture implementation requires a major architecture fork from macOS.
- Windows native preview parity becomes a blocker for this MVP.
- Signing credentials/cost decisions are needed.

## Maintenance notes

Do not let Windows work destabilize macOS v1. Keep this track explicit and
evidence-driven so "Windows packaging works" is not mistaken for "Windows
capture is product-ready."
