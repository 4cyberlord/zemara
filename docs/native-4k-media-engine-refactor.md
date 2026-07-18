# Native 4K Media Engine Refactor

Status: active media-engine plan.

The active product direction is the native 4K OBS-class media engine refactor described in the Obsidian plan:

```text
/Users/orcdev/Documents/Obsidian Vault/plans/planned/2026-06-08 - Videorc Native 4K OBS Class Media Engine Refactor Plan.md
```

The execution slices live in:

```text
/Users/orcdev/Documents/Obsidian Vault/plans/planned/2026-06-08 - Videorc Native 4K OBS Class Media Engine Refactor Slices.md
```

A priority insertion from 2026-06-09 live usage (stream A/V sync fix, detached preview window, left-sidebar studio shell, live layout switching — pulls forward master Phases 7/10/12) lives in:

```text
/Users/orcdev/Documents/Obsidian Vault/plans/planned/2026-06-09 - Videorc Studio Shell And Live Control Plan.md
```

A second insertion from the first real multi-destination livestream on 2026-06-10 (stream latency, capture completeness, Twitch chat, live device switching — pulls master Phase 10 device switching forward) lives in:

```text
/Users/orcdev/Documents/Obsidian Vault/plans/planned/2026-06-10 - Videorc Live Operations Round 2 Plan.md
```

## Locked Product Target

- 4K30 local recording is required.
- Livestreaming is platform-safe 1080p for v1.
- 4K recording plus 1080p streaming must work simultaneously through separate Metal output targets and separate VideoToolbox encoders.
- Preview optimizes for currentness: p95 source-to-present under 50 ms and p99 under 100 ms.
- No user-facing legacy media fallback.
- Custom engine only; do not use libobs or fork OBS.
- macOS is first; Windows is planned but not blocking.
- Final acceptance requires dev build, packaged clean-machine build, automated gates, and user by-eye OBS comparison.

## Feature Freeze

Non-media feature work is frozen while this plan is active. Work should either:

- prove the current media path,
- diagnose a media-path failure,
- move the product toward the native media engine target, or
- explicitly port or cut a committed v1 feature from the new engine surface.

## Staged Media Allowance Registry

Plan 010 owns reconciliation of broad Rust `dead_code` allowances in staged
media modules. Destructive cleanup waits on Plan 006 acceptance because the
final record/stream split-output engine decides which planned modules are
promoted, retained, or retired. Current local Plan 006 evidence is blocked by a
non-4K built-in display (`3024x1964`) and a post-permission ScreenCaptureKit
start timeout on forced screen-only runs.

| Module | Current classification | Acceptance condition |
|---|---|---|
| `streaming.rs` | Retain planned. Core settings are wired into session start, preflight, storage, renderer protocol, and FFmpeg tee fan-out; provider/platform metadata and future target status fields remain staged. | Narrow or remove the broad allow after Plan 006 is accepted and multi-target live status semantics are fixed. |
| `live_scene.rs` | Retain planned until the accepted split-output engine proves whether this scene revision model is still the right live-edit contract. | Wire the public pieces into the live session path or retire the module after Plan 006 acceptance. |
| `live_render.rs` | Retain planned until compared with the accepted Metal compositor/output-target architecture. | Promote only if it matches the accepted live render path; otherwise delete it with its obsolete tests. |
| `live_pipeline.rs` | Retain planned until compared with the accepted split-output engine. | Delete if it remains an obsolete rawvideo/FFmpeg-filter experiment; otherwise narrow allowances while wiring retained pieces. |
| `repair.rs` | Retain planned as a future recording quality/repair maintenance slice. | Wire it into post-recording gates or retire it in a dedicated repair-plan slice; do not change recording repair behavior during the media blocker. |

## Legacy Fallback Policy

Raw-YUV, image-polling, FFmpeg-filter, and other legacy media paths may remain only as explicit developer/debug fallbacks while the refactor is underway. Raw-YUV encoder copies must fail 4K acceptance; they cannot be product evidence after the VideoToolbox path is default.

Status 2026-06-13: macOS stream-enabled sessions now select the production-shaped
`VideoToolboxH264AnnexB` bridge output by default. Raw-YUV streaming is retained
only through an explicit `VIDEORC_ENCODER_BRIDGE_VIDEO_OUTPUT=raw-yuv420p`
developer override.

## Media Quality Modes

Diagnostics and acceptance reports use this shared vocabulary for the strongest media path a run actually proves:

| Mode | Meaning |
|---|---|
| `fallback-baseline` | Legacy, copied, blocked, or otherwise fallback media path. Useful for measurement, not a product-accepted mode. |
| `native-preview-only` | Native CAMetalLayer preview evidence exists, but recording still lacks zero-copy output proof. |
| `zero-copy-recording` | Recording used the Metal-to-VideoToolbox zero-copy path without raw-video or copied Metal target frames. |
| `record-stream-split-output` | Recording and streaming are both active through separate output targets/encoders. |
| `4k-accepted` | A 4K30 local recording path passed acceptance with native preview and zero-copy recording evidence. |

For now the mode is computed by `scripts/lib/media-quality-mode.mjs` from summarized run diagnostics and printed by `pnpm baseline:real-source` reports. It is diagnostics/reporting vocabulary only; Studio UI health remains the separate Ready/Live/Degraded/Blocked signal until the native-preview UI slices promote this vocabulary deliberately.

## 4K Measurement Commands

Named Phase 1 commands replace env-var memory for the required 4K baseline:

```sh
pnpm baseline:real-source:4k30 -- --gate
pnpm baseline:evidence:4k30 -- <output-dir>/latest-real-source-evidence.json
pnpm baseline:real-source:4k30:av-sync -- --gate
pnpm baseline:real-source:4k30:endurance -- --gate
pnpm baseline:evidence:4k30:endurance -- <output-dir>/latest-real-source-evidence.json
```

The motion and endurance commands request real sources at `3840x2160`, `30fps`, `30000kbps`, and launch the screen motion stimulus so freeze/repeated-frame gates measure moving content. The A/V-sync command uses the same 4K30 output request with the flash/click stimulus; pass `latest-real-source-evidence.json` directly to `pnpm measure:av-sync`.
Each successful or blocked real-source run writes a sibling `.evidence.json` manifest plus `latest-real-source-evidence.json` in the output directory, with the recording path, baseline report, analyzer reports, startup report, gate verdict, selected sources, and zero-copy/native-preview counters.

The stream-leg A/V sync gate (Studio Shell And Live Control Plan, slice A1) runs two sessions — record-only, then record+stream against a local `ffmpeg -listen` RTMP sink — and measures the flash/click offset on the record-only MKV, the record+stream MKV leg, and the RTMP-received FLV (the platform's view), with drift fitting and H1/H2/H3 hypothesis classification in `stream-av-sync-evidence.json`:

```sh
pnpm baseline:stream:av-sync -- --gate
pnpm baseline:stream:av-sync:endurance -- --gate
```

## Native Preview Placement Contract

**Default since the UI rewrite (2026-06-10, slices U1–U4): the live preview is a detached OS window.** Main owns the window and is the placement and existence authority — it applies the window's content rect to both surface hosts directly on every move/resize/visibility event (no renderer round trip), tears the session down on close (frame polling suppressed, hosts destroyed, only `destroy` commands pass while closed), and restores frame/open-state/always-on-top across launches. The placement gate is `node scripts/preview-window-probe.mjs`.

The legacy in-page glued contract and its embedded-mode flag were deleted after the detached preview window became the only supported preview UI path. Do not reintroduce renderer slot tracking; new placement work belongs to the preview-window contract above.

## Output Profiles

Phase 2 introduces first-class profile IDs for the committed recording/streaming surface:

| Profile | Size | FPS | Bitrate | Intent |
|---|---:|---:|---:|---|
| `record-4k30` | 3840x2160 | 30 | 30000kbps | Required local recording target. |
| `stream-safe-1080p30` | 1920x1080 | 30 | 6000kbps | v1 platform-safe livestream target. |
| `stream-safe-1080p60` | 1920x1080 | 60 | 6000kbps | Optional safe stream target when 60fps is explicitly allowed. |
| `record-4k60-experimental` | 3840x2160 | 60 | 50000kbps | Experimental only, not a v1 acceptance requirement. |

Existing `tutorial-1080p30`, `tutorial-1440p30`, `stream-1080p60`, and `custom` presets remain for compatibility until later policy slices decide which product paths stay visible.

## First Internal Gate

The first internal checkpoint is:

```text
4K30 screen + camera + mic
  -> Metal compositor
  -> native CAMetalLayer preview
  -> VideoToolbox H.264 encode
  -> local MKV recording
  -> optional MP4 remux
```

Passing that checkpoint is not product completion. The product is not fixed until the full committed v1 proof passes.
