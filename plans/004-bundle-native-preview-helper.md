# Plan 004: Bundle the native CAMetalLayer helper and gate packaged preview

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- package.json apps/desktop/electron-builder.yml scripts/smoke-packaged-app.mjs scripts/smoke-preview-surface-app.mjs docs/distribution.md docs/preview-recording-parity-slices.md crates/videorc-backend/src/bin/native_preview_host_helper.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, tests, dx
- **Planned at**: commit `3d217933`, 2026-06-13

## Why this matters

The packaged macOS app expects a real native preview helper binary at
`Resources/native_preview_host_helper`, but the current packaging config only
copies the backend binary and FFmpeg. That means the signed app can pass release
smokes while production preview falls back or reports that CAMetalLayer is not
available. The product contract says production preview is the detached native
CAMetalLayer path, so the packaged build must bundle the helper and the smoke
suite must fail when it is absent.

## Current state

Relevant files:

- `apps/desktop/src/main/index.ts` - resolves the helper path in packaged mode.
- `apps/desktop/electron-builder.yml` - declares packaged resources.
- `package.json` - builds the backend before packaging but does not explicitly
  build or preflight the helper.
- `scripts/smoke-packaged-app.mjs` - packaged smoke launches the `.app` and
  records a backend test-pattern session only.
- `scripts/smoke-preview-surface-app.mjs` - already knows how to require native
  Metal preview, but launches `pnpm dev`.
- `docs/distribution.md` and `docs/preview-recording-parity-slices.md` - release
  docs claim packaged native preview support.

Current packaged helper lookup:

```ts
// apps/desktop/src/main/index.ts:2361
if (app.isPackaged) {
  const helperPath = join(process.resourcesPath, 'native_preview_host_helper')
  if (!existsSync(helperPath)) {
    return {
      driver: null,
      unavailableReason: `Real CAMetalLayer IOSurface helper was not found at ${helperPath}`
    }
  }
```

Current macOS resources omit the helper:

```yaml
# apps/desktop/electron-builder.yml:24
mac:
  category: public.app-category.video
  extraResources:
    - from: ../../target/release/videorc-backend
      to: videorc-backend
```

The helper is a real binary and already has self-test modes:

```rust
// crates/videorc-backend/src/bin/native_preview_host_helper.rs:150
pub fn run() -> Result<()> {
    if std::env::args().any(|arg| arg == "--self-test") {
        return self_test();
    }
    if std::env::args().any(|arg| arg == "--lifecycle-smoke") {
        return lifecycle_smoke();
    }
```

The packaged smoke does not inspect preview:

```js
// scripts/smoke-packaged-app.mjs:34
const connection = await launchAndReadConnection()
await runBackendRecordingSmoke({
  connection,
  ffmpegPath,
  outputDirectory,
```

The preview surface smoke can require native Metal, but currently launches dev:

```js
// scripts/smoke-preview-surface-app.mjs:19
const expectedSurfaceTransport =
  process.env.VIDEORC_EXPECT_NATIVE_METAL_PREVIEW === '1' ? 'native-surface' : 'electron-proof-surface'

// scripts/smoke-preview-surface-app.mjs:398
appProcess = spawn('pnpm', ['dev'], {
```

Docs already claim packaged helper bundling:

```md
<!-- docs/preview-recording-parity-slices.md:40 -->
default on macOS with **no env flags**: it auto-spawns the Rust `native_preview_host_helper`
(dev: `cargo run ... --bin native_preview_host_helper`; packaged: bundled binary).
```

Repo conventions:

- Use explicit package preflight scripts when electron-builder resource behavior
  can hide missing inputs. Model the new macOS preflight after
  `scripts/preflight-windows-package.mjs`.
- Do not silently downgrade native preview. If native CAMetalLayer cannot run,
  status/diagnostics must say why.
- Do not use broad process scans such as `pgrep -f`; only app-owned PIDs may be
  reaped.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| TypeScript typecheck | `pnpm typecheck` | exit 0, no TS errors |
| Desktop tests | `pnpm --filter @videorc/desktop test` | all Vitest tests pass |
| Node script tests | `pnpm test:scripts` | all Node tests pass |
| Rust tests | `cargo test -p videorc-backend` | all non-ignored tests pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0, no warnings |
| Package macOS app | `pnpm package:desktop` | exit 0 and `apps/desktop/release/mac-arm64/Videorc.app` exists |
| Packaged smoke | `pnpm smoke:packaged:bundled` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `apps/desktop/electron-builder.yml`
- `scripts/preflight-macos-package.mjs` (create)
- `scripts/smoke-packaged-app.mjs`
- `scripts/smoke-preview-surface-app.mjs` only if sharing preview assertions or
  launch code is the cleanest route
- `scripts/lib/*` only for shared smoke launch/assert helpers
- `docs/distribution.md`
- `docs/preview-recording-parity-slices.md`

**Out of scope**:

- Native helper protocol internals.
- Preview window placement, z-order, and movement behavior.
- Streaming or recording encoder changes.
- Any broad process cleanup logic.

## Git workflow

- Branch: `codex/004-bundle-native-preview-helper`
- Commit style: imperative/slice-oriented, matching recent commits such as
  `Mark all eight UX/IA slices done`.
- Do not push unless the operator explicitly asks.

## Steps

### Step 1: Make macOS packaging build and preflight both Rust binaries

Add a macOS-specific backend packaging script in `package.json`, for example:

```json
"package:backend:macos": "cargo build --release -p videorc-backend --bin videorc-backend --bin native_preview_host_helper"
```

Update macOS package/dist scripts to use it:

- `package:desktop`
- `dist:desktop`
- `dist:desktop:signed`

Keep Windows scripts on the existing host backend path unless you also prove the
Windows package still works.

Create `scripts/preflight-macos-package.mjs`, modeled after
`scripts/preflight-windows-package.mjs`, and require these inputs:

- `target/release/videorc-backend`
- `target/release/native_preview_host_helper`
- `vendor/ffmpeg/current/bin/ffmpeg`

Wire `pnpm package:preflight:macos` into the macOS package/dist scripts after
`pnpm ffmpeg:build:macos` and before electron-builder.

**Verify**: `pnpm package:preflight:macos` should fail before the binaries are
built and pass after `pnpm package:backend:macos && pnpm ffmpeg:build:macos`.

### Step 2: Copy the helper into the packaged app resources

In `apps/desktop/electron-builder.yml`, add a macOS `extraResources` entry:

```yaml
- from: ../../target/release/native_preview_host_helper
  to: native_preview_host_helper
  filter:
    - native_preview_host_helper
```

Keep it under `mac.extraResources`, not top-level `extraResources`, because this
repo intentionally avoids global platform-specific resources.

**Verify**: `pnpm package:desktop` exits 0, then:

```sh
test -x apps/desktop/release/mac-arm64/Videorc.app/Contents/Resources/native_preview_host_helper
```

Expected: exit 0. If the output folder is `mac` instead of `mac-arm64` on the
executor machine, adjust only the verification path, not the packaged resource
name.

### Step 3: Add a packaged native-preview smoke

Either extend `scripts/smoke-packaged-app.mjs` behind an env flag or create
`scripts/smoke-packaged-native-preview-app.mjs`. The smoke must:

1. Launch the packaged app executable, as `smoke-packaged-app.mjs` already does.
2. Set `VIDEORC_NATIVE_PREVIEW_SURFACE=1`,
   `VIDEORC_EXPECT_NATIVE_METAL_PREVIEW=1`, and
   `VIDEORC_SMOKE_PREVIEW_MOTION=1`.
3. Wait for both backend and smoke command-server connection markers.
4. Run the same preview assertions as `scripts/smoke-preview-surface-app.mjs`:
   native bootstrap exists, diagnostics report `previewTransport:
   native-surface`, diagnostics report `previewSurfaceBacking: cametal-layer`,
   preview FPS meets the configured floor, and image-poll counts remain zero.

If you share code, prefer a small helper under `scripts/lib/` over copy-pasting
the entire smoke. If sharing becomes invasive, STOP and report.

Add root scripts:

```json
"smoke:packaged:native-preview": "VIDEORC_EXPECT_NATIVE_METAL_PREVIEW=1 node scripts/smoke-packaged-native-preview-app.mjs",
"smoke:packaged:release": "pnpm smoke:packaged:bundled && pnpm smoke:packaged:native-preview"
```

**Verify**: after `pnpm package:desktop`,
`pnpm smoke:packaged:native-preview` exits 0 and logs native transport/backing.

### Step 4: Update release and distribution docs

Update `docs/distribution.md` so the local packaging section says both Rust
binaries are built and packaged. Add the packaged native-preview smoke to the
release checklist.

Update `docs/preview-recording-parity-slices.md` only if its helper path or
acceptance wording becomes stale.

**Verify**: `pnpm format:check` exits 0.

## Test plan

- New Node preflight behavior:
  - Missing helper causes `pnpm package:preflight:macos` to exit 1 with a clear
    remedy.
  - Present backend/helper/FFmpeg causes it to exit 0.
- Packaged app resource behavior:
  - `native_preview_host_helper` exists under app `Contents/Resources`.
  - Packaged app native-preview smoke proves `native-surface` and
    `cametal-layer`.
- Existing smoke behavior:
  - `pnpm smoke:packaged:bundled` still records through bundled FFmpeg.

## Done criteria

- [ ] `package.json` has an explicit macOS backend/helper build path.
- [ ] `apps/desktop/electron-builder.yml` bundles
      `native_preview_host_helper` under macOS resources.
- [ ] A macOS preflight fails loudly when helper/backend/FFmpeg inputs are
      absent.
- [ ] `pnpm package:desktop` produces a packaged helper at
      `Contents/Resources/native_preview_host_helper`.
- [ ] `pnpm smoke:packaged:native-preview` proves `native-surface` plus
      `cametal-layer`.
- [ ] `pnpm typecheck`, `pnpm --filter @videorc/desktop test`,
      `pnpm test:scripts`, `cargo test -p videorc-backend`, and
      `cargo clippy -p videorc-backend -- -D warnings` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- `target/release/native_preview_host_helper` cannot be built on macOS with the
  backend package.
- The packaged app cannot start the helper because of signing, quarantine,
  executable-bit, or hardened-runtime failures.
- The preview smoke needs camera/screen TCC prompts to prove helper transport;
  the smoke must use the existing test/smoke paths rather than relying on a
  real device.
- The fix appears to require changing native helper protocol or preview
  placement behavior.

## Maintenance notes

Keep the app's production promise strict: a packaged release that claims native
preview should fail release verification if the helper is absent or diagnostics
show JPEG/MJPEG/image-poll transport. Future packaging changes must preserve the
macOS-only resource split so Windows packaging does not inherit macOS paths.
