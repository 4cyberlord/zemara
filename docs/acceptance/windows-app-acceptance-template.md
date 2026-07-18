# YYYY-MM-DD Windows App Acceptance

This is the evidence template for the Windows app track. Copy it to a dated
file after running the Windows gates on a real Windows 11 x64 machine. Keep
recordings, screenshots, package logs, support bundles, stream keys, local
tokens, and generated media out of git; store them under the ignored artifact
directory and reference paths here.

## Scope

- Milestone: Functional Alpha / Public Beta / Mirror App
- Commit:
- Operator:
- Windows machine:
- GPU(s):
- Camera:
- Microphone:
- Remote access mode: local / Parsec / RDP / SSH + screenshots / other
- Artifact directory:
- `VIDEORC_WINDOWS_ACCEPTANCE_DIR`, if set:
- Known hardware or permission blockers:

## Lab Setup

- Windows version/build:
- Architecture:
- Power mode:
- Display count/resolution/scale:
- Git version:
- Node version:
- pnpm version:
- Rust toolchain:
- Visual Studio Build Tools:
- FFmpeg source:

## Build And Static Gates

- `pnpm install`: PASS / FAIL / BLOCKED
- `pnpm check:windows`: PASS / FAIL / BLOCKED
- `pnpm --filter @videorc/desktop test`: PASS / FAIL / BLOCKED
- `cargo test -p videorc-backend capture_input`: PASS / FAIL / BLOCKED
- `cargo test -p videorc-backend fifo`: PASS / FAIL / BLOCKED
- `pnpm ffmpeg:fetch:windows`: PASS / FAIL / BLOCKED
- `pnpm package:preflight:windows`: PASS / FAIL / BLOCKED
- `pnpm package:desktop:windows`: PASS / FAIL / BLOCKED
- `pnpm smoke:local-gates:windows`: PASS / FAIL / BLOCKED
- Windows local-gates manifest:
- Gate logs:

## Packaged App

- Package type: win-unpacked / NSIS installer / other
- Installer path:
- Packaged executable:
- Bundled backend path:
- Bundled FFmpeg path:
- Launches from a clean user profile: PASS / FAIL / BLOCKED
- Backend reports READY: PASS / FAIL / BLOCKED
- App quit leaves no owned backend/FFmpeg children: PASS / FAIL / BLOCKED
- Force-close leaves no owned backend/FFmpeg children: PASS / FAIL / BLOCKED
- Process proof path:

## Sources

| Source         | Expected | Observed | Stable ID | Verdict               | Notes |
| -------------- | -------: | -------- | --------- | --------------------- | ----- |
| Screen/display |      yes |          |           | PASS / FAIL / BLOCKED |       |
| Camera         |      yes |          |           | PASS / FAIL / BLOCKED |       |
| Microphone     |      yes |          |           | PASS / FAIL / BLOCKED |       |

- Selection persistence after restart: PASS / FAIL / BLOCKED
- Selection reconciliation after device removal: PASS / FAIL / BLOCKED
- Windows permission/settings links: PASS / FAIL / BLOCKED

## Recording And Streaming Evidence

Every finished artifact must be inspected with ffprobe/ffmpeg-based analysis.
File-size-only evidence is not enough.

| Scenario                   | Artifact path | Analyzer JSON/path | Preview verdict       | Final-file verdict    | A/V verdict           | Notes |
| -------------------------- | ------------- | ------------------ | --------------------- | --------------------- | --------------------- | ----- |
| Test pattern               |               |                    | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED |       |
| Screen only                |               |                    | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED |       |
| Camera only                |               |                    | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED |       |
| Screen + camera + mic      |               |                    | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED |       |
| RTMP/multistream test sink |               |                    | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED | PASS / FAIL / BLOCKED |       |

- Decoder/encoder selected:
- Encoder fallback reason, if any:
- RTMP sink:
- Dropped frames/repeated frames:
- Audio gaps:
- A/V skew:

## Preview Decision Evidence

- Portable polling preview under moving screen content: PASS / FAIL / BLOCKED
- Portable polling preview under camera motion: PASS / FAIL / BLOCKED
- Preview while recording: PASS / FAIL / BLOCKED
- Preview while streaming: PASS / FAIL / BLOCKED
- CPU/GPU observations:
- By-eye smoothness verdict:
- Native preview required before public Windows: YES / NO / UNKNOWN
- Evidence paths/screenshots/video:

## Windows UX

- Native chrome/snap/maximize/restore/drag: PASS / FAIL / BLOCKED
- Dark theme: PASS / FAIL / BLOCKED
- Light theme: PASS / FAIL / BLOCKED
- Command palette: PASS / FAIL / BLOCKED
- `Ctrl` keyboard hints: PASS / FAIL / BLOCKED
- Notes window: PASS / FAIL / BLOCKED
- Comments window: PASS / FAIL / BLOCKED
- Detached Preview window: PASS / FAIL / BLOCKED
- Narrow window text overflow check: PASS / FAIL / BLOCKED
- Multi-monitor behavior: PASS / FAIL / BLOCKED
- Screenshot sweep path:

## Signing, Installer, And Updates

- Signing mode: unsigned internal / Azure Trusted Signing / OV-EV Authenticode
- Signing blocker:
- NSIS installer launches app: PASS / FAIL / BLOCKED
- Uninstall behavior: PASS / FAIL / BLOCKED
- SmartScreen experience:
- Update feed strategy:
- FFmpeg LGPL notices present in package: PASS / FAIL / BLOCKED

## Support Bundle

- Support bundle path:
- Verifier command: `pnpm support-bundle:verify -- <support-bundle.json> --windows-acceptance`
- Verifier verdict: PASS / FAIL / BLOCKED
- Windows OS build included: PASS / FAIL / BLOCKED (`rendererDiagnostics.runtimeInfo.osRelease`)
- GPU adapter(s) included: PASS / FAIL / BLOCKED (`rendererDiagnostics.runtimeInfo.gpuDevices`)
- Selected encoder included: PASS / FAIL / BLOCKED
- Capture backend/fallback reason included: PASS / FAIL / BLOCKED
- Device IDs redacted: PASS / FAIL / BLOCKED
- Packaged runtime included: PASS / FAIL / BLOCKED
- Authenticode signing status checked outside bundle: PASS / FAIL / BLOCKED
- No secrets/tokens/recordings/stream keys included: PASS / FAIL / BLOCKED

## Failures And Follow-Up

- Product failures:
- Host/hardware blockers:
- Signing/business blockers:
- Owner decisions needed:
- Follow-up plan/issue:

## Verdict

- Milestone A verdict: PASS / FAIL / BLOCKED
- Milestone B verdict: PASS / FAIL / BLOCKED
- Milestone C verdict: PASS / FAIL / BLOCKED
- Overall Windows app verdict: PASS / FAIL / BLOCKED
- Notes:
