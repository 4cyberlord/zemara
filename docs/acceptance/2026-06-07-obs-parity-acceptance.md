# 2026-06-07 OBS Parity Acceptance

This note records the current local evidence for the OBS parity polish plan. The automated
half is now covered by real-source recordings and strict analyzers. The human OBS
side-by-side visual pass is still pending.

## Automated Evidence

### 1080p30 Motion Gate

- Status: PASS
- Report:
  `/var/folders/5b/08_snhzs2xb559qf1j6dth2r0000gn/T/videorc-real-source-baseline-1780792948903/videorc-session-20260607-004236.baseline.md`
- Evidence: real screen/camera/mic, native `CAMetalLayer`, zero image polling, Metal
  compositor, VideoToolbox zero-copy output, startup PASS, final-file PASS, encoder
  bridge repeats `0`.

### 1440p30 Motion Gate

- Status: PASS
- Report:
  `/var/folders/5b/08_snhzs2xb559qf1j6dth2r0000gn/T/videorc-real-source-baseline-1780793237944/videorc-session-20260607-004722.baseline.md`
- Evidence: 2560x1440 @ 30fps, real screen/camera/mic plus motion stimulus, native
  preview `104.0fps`, interval p95 `17ms`, source-to-present p95/p99 `23/26ms`, image
  polls `0`, raw/Metal copied `0/0`, zero-copy `1752`, VT output `1752`, final-file
  PASS, startup PASS.

### 10-Minute Motion Endurance

- Status: PASS
- Report:
  `/var/folders/5b/08_snhzs2xb559qf1j6dth2r0000gn/T/videorc-real-source-baseline-1780793397213/videorc-session-20260607-005001.baseline.md`
- Evidence: 600s real-source motion run, native preview `100.6fps`, interval p95 `18ms`,
  source-to-present p95/p99 `25/28ms`, image polls `0`, mic dropped `0`, raw/Metal copied
  `0/0`, zero-copy `18002`, VT output `18002`, final-file PASS, startup PASS.

### 1080p60 Conditional Gate

- Status: Not applicable for selected source set
- Evidence directory:
  `/var/folders/5b/08_snhzs2xb559qf1j6dth2r0000gn/T/videorc-real-source-baseline-1780794317959/`
- Reason: the selected MacBook Pro Camera reports only 15/30fps modes; FFmpeg rejected
  `60fps` before producing a recording artifact.

### Lip-Sync Gate

- Status: PASS with explicit mic calibration
- Baseline report:
  `/var/folders/5b/08_snhzs2xb559qf1j6dth2r0000gn/T/videorc-real-source-baseline-1780795444655/videorc-session-20260607-012409.baseline.md`
- Recording:
  `/var/folders/5b/08_snhzs2xb559qf1j6dth2r0000gn/T/videorc-real-source-baseline-1780795444655/videorc-session-20260607-012409.mp4`
- Command:
  `pnpm measure:av-sync <recording> --current-offset-ms -120 --require-target`
- Result: `+46ms` median audio lag, `31` pairs, max `49ms`, PASS.
- Note: the Sources tab Sync control now supports exact millisecond entry, so measured
  offsets can be applied directly.

## Manual OBS Side-By-Side

Run OBS and Videorc side by side with the same screen/window, camera, microphone, output
resolution, and FPS. Use the calibrated microphone sync offset from the lip-sync gate.

Repeatable local harness:

```sh
pnpm acceptance:obs-side-by-side -- --stimulus=motion
```

For mouth/voice sync:

```sh
pnpm acceptance:obs-side-by-side -- --stimulus=av-sync
```

Notes from local OBS inspection on 2026-06-07:

- OBS is installed at `/Applications/OBS.app`.
- OBS websocket is installed but disabled, so this pass is intentionally manual and does
  not mutate the OBS profile.
- OBS CLI exposes `--startrecording` but no matching stop-recording command in the local
  help output. Because websocket is disabled, no automated OBS recording was attempted;
  force-quitting OBS during MP4 recording would be weak evidence and could corrupt output.
- The local OBS profile currently reports 3840x2160 at 24 NTSC. Match OBS and Videorc
  output resolution/FPS before judging preview quality or recording smoothness.
- The harness defaults to the OBS `Long` scene because it has visible screen/window and
  camera sources. It prints the visible OBS sources and warns when the chosen scene is
  camera-only; for example, `talking head` is not valid for motion/scroll parity because
  it has no visible screen/window source.
- The harness lifecycle was smoke-tested without opening OBS/Videorc:
  `pnpm acceptance:obs-side-by-side -- --stimulus=motion --launch-obs=false --launch-videorc=false --duration-ms=1500`
  and
  `pnpm acceptance:obs-side-by-side -- --stimulus=av-sync --launch-obs=false --launch-videorc=false --duration-ms=1500`
  both exited `0` and left no `videorc-screen-motion-*` or `videorc-av-sync-*` processes
  or temp directories.
- The Videorc-launch path was smoke-tested with
  `pnpm acceptance:obs-side-by-side -- --stimulus=none --launch-obs=false --launch-videorc=true --duration-ms=8000`.
  The wrapper exited `0`; the inner dev command reported the expected `SIGTERM` from
  auto-stop, and no Videorc/backend dev processes or port `5173` listener remained.

- [ ] Preview sharpness: screen text is as readable in Videorc preview as in OBS.
- [ ] Preview hand latency: fast hand motion stays current, with no rubber-banding.
- [ ] Screen scroll smoothness: fast page scrolling has no visible stutter versus OBS.
- [ ] Cursor freshness: cursor position is current in the Videorc preview.
- [ ] Camera quality: camera detail, crop, mirror, and edges match OBS at the same size.
- [ ] Color: camera and screen colors are not visibly worse than OBS.
- [ ] Overlay interaction: moving/resizing the camera overlay during recording does not
  introduce visible recording stutter.
- [ ] Final recording smoothness: a two-minute Videorc recording is as smooth as the OBS
  recording of the same scene.
- [ ] Voice/mouth sync: mouth and voice stay aligned through the full clip.
- [ ] Audio continuity: no voice gaps, skips, or dropouts.
- [ ] Original failure pattern no longer reproduces: laggy/soft preview, startup
  resolution glitch, and desynced/glitchy recording are gone in normal use.

## Decision

- Automated acceptance: PASS for supported selected sources.
- Manual acceptance: PENDING human OBS side-by-side.
- Overall OBS parity signoff: PENDING manual visual/currentness acceptance.
- Agent status: BLOCKED on the human-only side-by-side judgment. The remaining checklist
  items require someone to watch OBS and Videorc side by side with matched output
  settings and decide whether the preview/recording is visually indistinguishable in
  sharpness, currentness, smoothness, and mouth/voice sync.
