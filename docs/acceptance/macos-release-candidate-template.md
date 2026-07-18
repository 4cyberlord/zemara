# YYYY-MM-DD macOS Release Candidate Acceptance

This is a template for the clean-machine release-candidate pass. Rename the copy
to a dated file, fill in every section, and keep secrets, tokens, stream keys,
recordings, and generated media out of git.

## Artifact

- Commit/tag:
- Workflow run:
- DMG filename:
- DMG SHA256:
- App version:
- Architecture:
- macOS version:
- Machine/user cleanliness:

## Build-Machine Gates

- `pnpm smoke:local-gates`: PASS / FAIL / BLOCKED
- `pnpm dist:desktop:signed`: PASS / FAIL / BLOCKED
- `pnpm release:validate:macos`: PASS / FAIL / BLOCKED
- `pnpm release:manifest:macos`: PASS / FAIL / BLOCKED
- `pnpm release:upload:macos`: PASS / FAIL / BLOCKED
- Artifact upload/download path:
- Release metadata path:
- SHA256 sidecar path:

## Authenticated Web Download Gate

- Web repo commit:
- Private storage object key:
- `release.json` uploaded to private storage: PASS / FAIL / BLOCKED
- DMG uploaded to private storage: PASS / FAIL / BLOCKED
- Web download environment configured: PASS / FAIL / BLOCKED
- Anonymous request to `/api/downloads/macos/latest` is rejected: PASS / FAIL / BLOCKED
- Signed-in request redirects to a private presigned DMG URL: PASS / FAIL / BLOCKED
- Downloaded DMG SHA256 matches `release.json`: PASS / FAIL / BLOCKED

## Clean-Machine Gatekeeper

- `spctl --assess --type open --context context:primary-signature --verbose <dmg>`:
  PASS / FAIL / BLOCKED
- `xcrun stapler validate <dmg>`: PASS / FAIL / BLOCKED
- `hdiutil attach <dmg>`: PASS / FAIL / BLOCKED
- `spctl --assess --type execute --verbose <Videorc.app>`: PASS / FAIL / BLOCKED
- `xcrun stapler validate <Videorc.app>`: PASS / FAIL / BLOCKED
- First launch accepted without override: PASS / FAIL / BLOCKED

## Permissions

- Camera permission prompt and grant: PASS / FAIL / BLOCKED
- Microphone permission prompt and grant: PASS / FAIL / BLOCKED
- Screen Recording permission prompt and grant: PASS / FAIL / BLOCKED
- Relaunch after permission grant: PASS / FAIL / BLOCKED

## Packaged Smokes

- `VIDEORC_PACKAGED_APP_EXECUTABLE=... pnpm smoke:packaged:bundled`: PASS / FAIL / BLOCKED
- `VIDEORC_PACKAGED_APP_EXECUTABLE=... pnpm smoke:packaged:native-preview`:
  PASS / FAIL / BLOCKED
- Packaged backend reports `READY`: PASS / FAIL / BLOCKED
- Bundled FFmpeg used: PASS / FAIL / BLOCKED
- Native preview reports CAMetalLayer: PASS / FAIL / BLOCKED
- No production JPEG-polling fallback: PASS / FAIL / BLOCKED

## Manual Real-Source Recording

- Screen source:
- Camera source:
- Microphone source:
- Recording duration:
- Recording path:
- Analyzer/support bundle path, if generated:
- Playback smoothness: PASS / FAIL / BLOCKED
- Audio/video sync by eye: PASS / FAIL / BLOCKED
- Preview currentness by eye: PASS / FAIL / BLOCKED

## Failures And Follow-Up

- Failures:
- Owner plan or issue:
- Non-code blocker, if any:
- Evidence paths/screenshots:

## Verdict

- Overall release-candidate verdict: PASS / FAIL / BLOCKED
- Operator:
- Notes:
