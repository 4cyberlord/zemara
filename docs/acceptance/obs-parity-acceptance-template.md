# YYYY-MM-DD OBS Parity Acceptance

This is a template for the Plan 013 human OBS side-by-side pass. Rename the copy
to a dated file after running the automated gates and manual comparison. Do not
mark PASS unless both automated and human evidence are present.

## Setup

- Commit:
- Operator:
- Machine / macOS:
- Videorc command:
- OBS version:
- OBS profile:
- OBS scene:
- Harness manifest:
- Stimulus: motion / av-sync
- Output directory:

## Comparable Settings

- Videorc resolution/FPS/bitrate:
- OBS base resolution:
- OBS output resolution:
- OBS FPS:
- OBS scale/color settings:
- Screen/window source:
- Camera source:
- Microphone source:
- Microphone sync offset:

## Automated Gates

- `pnpm baseline:real-source:4k30 -- --gate`: PASS / FAIL / BLOCKED
- `pnpm baseline:real-source:4k30:av-sync -- --gate`: PASS / FAIL / BLOCKED
- `pnpm baseline:stream:av-sync -- --gate`: PASS / FAIL / BLOCKED
- Native preview CAMetalLayer evidence: PASS / FAIL / BLOCKED
- Zero copied raw/Metal frames: PASS / FAIL / BLOCKED
- 4K recording accepted: PASS / FAIL / BLOCKED
- Record+stream split output accepted: PASS / FAIL / BLOCKED
- Evidence paths:

## Manual OBS Side-By-Side

Each item must have PASS, FAIL, or BLOCKED plus notes.

| Item | Verdict | Notes |
|---|---|---|
| Preview sharpness: screen text is as readable in Videorc preview as in OBS. |  |  |
| Preview hand latency: fast motion stays current with no rubber-banding. |  |  |
| Screen scroll smoothness: fast page scrolling has no visible stutter versus OBS. |  |  |
| Cursor freshness: cursor position is current in the Videorc preview. |  |  |
| Camera quality: detail, crop, mirror, and edges match OBS at the same size. |  |  |
| Color: camera and screen colors are not visibly worse than OBS. |  |  |
| Overlay interaction: moving/resizing the camera overlay during recording does not stutter. |  |  |
| Final recording smoothness: Videorc is as smooth as OBS for the same scene. |  |  |
| Voice/mouth sync: mouth and voice stay aligned through the full clip. |  |  |
| Audio continuity: no voice gaps, skips, or dropouts. |  |  |
| Original failure pattern no longer reproduces. |  |  |

## Failure Triage

Use one owner bucket per failed item.

- Preview currentness/latency:
- Final recording stutter:
- Stream-only lag:
- Mouth/voice lag:
- Source selection/control:
- Packaging/signing:
- External/hardware blocker:

## Verdict

- Overall OBS parity verdict: PASS / FAIL / BLOCKED
- Owner plan or issue for failures:
- Non-code blocker, if any:
- Follow-up:
