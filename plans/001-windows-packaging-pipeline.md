# Plan 001: Make `pnpm package` work on a Windows box (electron-builder resources, backend path, ffmpeg fetch)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f0b88e5c..HEAD -- apps/desktop/electron-builder.yml package.json scripts/ .gitignore`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (macOS packaging must stay byte-identical in behavior; every step verifies that)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f0b88e5c`, 2026-06-12

## Why this matters

The repo is being ported to Windows 11 (see `docs/windows-port-plan.md`). The
`win:` section added to `apps/desktop/electron-builder.yml` in commit
`f0b88e5c` is broken three ways, and the first `pnpm package` attempt on a
Windows machine will fail before anything else in the port can be validated:

1. electron-builder **concatenates** top-level `extraResources` with the
   platform section's — it does not replace them. Verified in the installed
   app-builder-lib source: `getFileMatchers()` calls `addPatterns(config[name])`
   (global) and then `addPatterns(options.customBuildOptions[name])` (platform)
   — both lists apply. So a Windows build also tries to copy the macOS-only
   paths `../../target/release/videorc-backend` (extensionless Unix binary)
   and `../../vendor/ffmpeg/current` (a macOS-build symlink, gitignored, never
   present on a Windows clone).
2. The `win:` backend entry points at
   `../../target/x86_64-pc-windows-msvc/release/videorc-backend.exe`, but the
   repo's build script (`package:backend` = `cargo build --release -p
   videorc-backend`) builds the **host** target, which on a Windows box lands
   in `../../target/release/videorc-backend.exe`. The configured path only
   exists under an explicit `--target` flag nobody passes.
3. The packaging entry points (`package:desktop`, `dist:desktop`) hard-run
   `ffmpeg:build:macos`, and `scripts/build-ffmpeg-macos.sh` exits 1 on
   non-Darwin. There is no way to obtain a Windows ffmpeg at all — the plan of
   record (docs/windows-port-plan.md, Phase 0) is to fetch a pinned prebuilt
   LGPL win64 build, and that fetch script does not exist yet.

After this plan: macOS packaging is unchanged; a Windows box can run
`pnpm package:desktop:windows` and get a packaged app containing
`videorc-backend.exe` and `ffmpeg.exe`; and missing inputs fail loudly via a
preflight check instead of silently shipping a broken app.

## Current state

- `apps/desktop/electron-builder.yml` — the whole packaging config. Today
  (written at `f0b88e5c`):

  ```yaml
  # lines 16-30 (top level — apply to EVERY platform, including win):
  extraResources:
    - from: ../../target/release/videorc-backend
      to: videorc-backend
      filter:
        - videorc-backend
    - from: src/renderer/src/assets/videorc-logo.png
      to: videorc-logo.png
    - from: ../../vendor/ffmpeg/current
      to: ffmpeg
      filter:
        - bin/ffmpeg
        - NOTICE.txt
        - SOURCE.txt
        - BUILD-CONFIG.txt
        - licenses/**/*

  # lines 54-66 (win section, added for the port; backend path is wrong):
  win:
    icon: build-resources/icon.ico
    extraResources:
      - from: ../../target/x86_64-pc-windows-msvc/release/videorc-backend.exe
        to: videorc-backend.exe
      - from: src/renderer/src/assets/videorc-logo.png
        to: videorc-logo.png
      - from: ../../vendor/ffmpeg/windows-x64
        to: ffmpeg
        filter:
          - bin/ffmpeg.exe
          - NOTICE.txt
          - SOURCE.txt
          - BUILD-CONFIG.txt
          - licenses/**/*
  ```

- `package.json` (repo root) — relevant scripts today:

  ```json
  "ffmpeg:build:macos": "bash scripts/build-ffmpeg-macos.sh",
  "package:backend": "cargo build --release -p videorc-backend",
  "package:desktop": "pnpm package:backend && pnpm ffmpeg:build:macos && pnpm --filter @videorc/desktop package",
  "dist:desktop": "pnpm package:backend && pnpm ffmpeg:build:macos && pnpm --filter @videorc/desktop dist",
  ```

- `scripts/build-ffmpeg-macos.sh` — exits 1 unless `uname -s` is `Darwin`
  (lines 16-19). Installs into `vendor/ffmpeg/macos-$ARCH` and symlinks
  `vendor/ffmpeg/current`.
- `.gitignore` — already ignores `vendor/ffmpeg/_build/`, `vendor/ffmpeg/_src/`,
  `vendor/ffmpeg/current/`, `vendor/ffmpeg/macos-*/`. There is no entry for a
  Windows ffmpeg dir yet.
- `vendor/ffmpeg/README.md` is the only tracked file under `vendor/`.
- Repo conventions: utility scripts are Node ESM (`.mjs`) in `scripts/`
  (see `scripts/analyze-recording.mjs` for arg parsing + logging style);
  scripts are wired as root `package.json` entries; everything is verified by
  local gates, not CI (the GitHub Actions budget is exhausted — do not add CI).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install deps | `pnpm install` | exit 0 |
| Parse-check the yml | `node -e "const y=require('js-yaml');const fs=require('fs');console.log(JSON.stringify(Object.keys(y.load(fs.readFileSync('apps/desktop/electron-builder.yml','utf8')))))"` | prints top-level keys, exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Prettier | `npx prettier --check package.json` | "All matched files use Prettier code style!" |
| macOS package (regression gate) | `pnpm package:desktop` | exit 0; `apps/desktop/release/mac-arm64/Videorc.app/Contents/Resources/videorc-backend` and `.../Resources/ffmpeg/bin/ffmpeg` exist |
| Fetch script smoke (runs on macOS too) | `node scripts/fetch-ffmpeg-windows.mjs` | exit 0; `vendor/ffmpeg/windows-x64/bin/ffmpeg.exe` exists |

`js-yaml` is available transitively via electron-builder's dependency tree; if
`require('js-yaml')` fails, run the check with
`node -e "..."` from inside `apps/desktop/` where app-builder-lib's copy
resolves, or simply skip the parse-check — `pnpm package:desktop` exercises the
yml anyway.

## Scope

**In scope** (the only files you should modify/create):
- `apps/desktop/electron-builder.yml`
- `package.json` (root — scripts section only)
- `scripts/fetch-ffmpeg-windows.mjs` (create)
- `scripts/preflight-windows-package.mjs` (create)
- `.gitignore` (one line)
- `vendor/ffmpeg/windows-pin.json` (create — the pinned URL + sha256)

**Out of scope** (do NOT touch):
- `scripts/build-ffmpeg-macos.sh` — the macOS build flow is working and frozen.
- `apps/desktop/package.json` — the inner `package`/`dist` scripts stay as-is.
- Anything under `crates/` — no backend changes belong in this plan.
- Code signing (`dist:signed`, CSC vars) — explicitly Phase 5 of the port plan.
- `mac:` section contents other than relocating the `extraResources` list into it.

## Git workflow

- Work directly on `main` (repo owner's convention: commit + push after each
  verified slice; imperative commit subjects — see `git log --oneline -10`).
- One commit for the whole plan is fine. End the message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Push after the done criteria pass.

## Steps

### Step 1: Scope the macOS-only resources to the `mac:` section

In `apps/desktop/electron-builder.yml`:

1. Replace the top-level `extraResources:` block (lines 16-30 in the excerpt
   above) with ONLY the shared entry:

   ```yaml
   # Shared across platforms. Platform-specific resources live under mac:/win:
   # because electron-builder CONCATENATES global + platform extraResources
   # (it does not override) — a global entry with a mac-only path breaks the
   # Windows build and vice versa.
   extraResources:
     - from: src/renderer/src/assets/videorc-logo.png
       to: videorc-logo.png
   ```

2. Add the two mac-only entries under the existing `mac:` key (same
   indentation level as `category:`):

   ```yaml
   mac:
     category: public.app-category.video
     # ... existing keys unchanged ...
     extraResources:
       - from: ../../target/release/videorc-backend
         to: videorc-backend
         filter:
           - videorc-backend
       - from: ../../vendor/ffmpeg/current
         to: ffmpeg
         filter:
           - bin/ffmpeg
           - NOTICE.txt
           - SOURCE.txt
           - BUILD-CONFIG.txt
           - licenses/**/*
   ```

3. In the `win:` section: delete the duplicated `videorc-logo.png` entry (it
   now comes from the global list), fix the backend path, and align the ffmpeg
   filter with what the fetch script produces (step 2):

   ```yaml
   win:
     icon: build-resources/icon.ico
     extraResources:
       # Host-target build: `pnpm package:backend` on the Windows box puts the
       # exe in target/release/, not target/<triple>/release/.
       - from: ../../target/release/videorc-backend.exe
         to: videorc-backend.exe
       - from: ../../vendor/ffmpeg/windows-x64
         to: ffmpeg
         filter:
           - bin/ffmpeg.exe
           - LICENSE.txt
           - SOURCE.txt
   ```

**Verify**: `pnpm package:desktop` → exit 0, and both
`apps/desktop/release/mac-arm64/Videorc.app/Contents/Resources/videorc-backend`
and `.../Resources/ffmpeg/bin/ffmpeg` exist (macOS output unchanged by the
relocation). Also confirm `.../Resources/videorc-logo.png` still exists.

### Step 2: Create `scripts/fetch-ffmpeg-windows.mjs`

A Node ESM script (match the style of `scripts/analyze-recording.mjs`:
plain `node:` imports, small helpers, loud errors) that:

1. Reads `vendor/ffmpeg/windows-pin.json` with shape:
   ```json
   { "url": "<https URL of a BtbN win64 LGPL zip>", "sha256": "<hex>" }
   ```
2. Downloads the zip to `vendor/ffmpeg/_build/windows-download.zip` (use
   `fetch()` — Node ≥ 20 has it; stream to disk).
3. Computes sha256 (`node:crypto createHash`) and compares to the pin —
   mismatch is a fatal error mentioning both hashes.
4. Extracts it (shell out to `unzip -o` on POSIX / `tar -xf` works on Windows
   10+ for zips via bsdtar — use
   `process.platform === 'win32' ? 'tar' : 'unzip'`) into
   `vendor/ffmpeg/_build/windows-extract/`.
5. Locates the single top-level `ffmpeg-*` dir inside, then assembles
   `vendor/ffmpeg/windows-x64/` as:
   - `bin/ffmpeg.exe` (from the zip's `bin/ffmpeg.exe`)
   - `LICENSE.txt` (from the zip's `LICENSE.txt`)
   - `SOURCE.txt` (write it: the pinned URL + sha256 + fetch date — this is
     the LGPL source-offer breadcrumb, mirroring what
     `build-ffmpeg-macos.sh` records for mac builds)
6. Exits non-zero with a clear message if `bin/ffmpeg.exe` is missing at the
   end.
7. Skips the download when `vendor/ffmpeg/windows-x64/bin/ffmpeg.exe` already
   exists AND `SOURCE.txt` contains the pinned sha256 (idempotent re-runs);
   `--force` re-fetches.

To create the pin file: resolve the latest **LGPL win64** release asset from
`https://github.com/BtbN/FFmpeg-Builds/releases` — pick the **dated autobuild
tag** (NOT the floating `latest` tag) and the asset named like
`ffmpeg-n7.1-latest-win64-lgpl-7.1.zip` or `ffmpeg-N-…-win64-lgpl.zip`
(must contain `win64` and `lgpl`, must NOT contain `gpl` alone or `shared`).
Download it once, compute its sha256, and write both into
`vendor/ffmpeg/windows-pin.json` (this file IS committed).

**Verify**: `node scripts/fetch-ffmpeg-windows.mjs` on the Mac → exit 0,
`vendor/ffmpeg/windows-x64/bin/ffmpeg.exe` exists and is > 50 MB,
`vendor/ffmpeg/windows-x64/SOURCE.txt` contains the pinned URL. Run it a second
time → completes fast with a "already pinned, skipping download" message.

### Step 3: Create `scripts/preflight-windows-package.mjs`

A tiny script that asserts, with one clear error line per missing item:
- `target/release/videorc-backend.exe` exists (relative to repo root)
- `vendor/ffmpeg/windows-x64/bin/ffmpeg.exe` exists

Exit 0 when both exist; exit 1 listing every missing path and the command
that produces it (`pnpm package:backend` / `pnpm ffmpeg:fetch:windows`).
This exists because electron-builder's behavior on missing `from:` sources is
not a reliable loud failure — the preflight makes it deterministic.

**Verify**: on the Mac, `node scripts/preflight-windows-package.mjs` → exit 1
(no `.exe` here) and the output names BOTH missing paths and their commands.

### Step 4: Wire the scripts into root `package.json`

Add to `scripts` (keep alphabetical-ish grouping near the existing
`package:*`/`ffmpeg:*` entries):

```json
"ffmpeg:fetch:windows": "node scripts/fetch-ffmpeg-windows.mjs",
"package:preflight:windows": "node scripts/preflight-windows-package.mjs",
"package:desktop:windows": "pnpm package:backend && pnpm ffmpeg:fetch:windows && pnpm package:preflight:windows && pnpm --filter @videorc/desktop package",
"dist:desktop:windows": "pnpm package:backend && pnpm ffmpeg:fetch:windows && pnpm package:preflight:windows && pnpm --filter @videorc/desktop dist"
```

Do NOT modify the existing mac `package:desktop`/`dist:desktop` entries.

**Verify**: `npx prettier --check package.json` → clean;
`pnpm run` (no args) lists the four new scripts.

### Step 5: Gitignore the fetched payload

Add to `.gitignore`, next to the existing `vendor/ffmpeg/macos-*/` line:

```
vendor/ffmpeg/windows-x64/
```

(`vendor/ffmpeg/_build/` is already ignored. `vendor/ffmpeg/windows-pin.json`
stays tracked — it is the reproducibility pin.)

**Verify**: `git status --porcelain | grep windows-x64` → no output after the
fetch script has run; `git status --porcelain | grep windows-pin` → shows the
new pin file as untracked/added.

## Test plan

No unit-test framework covers `scripts/` (existing `scripts/lib/*.test.mjs`
pattern exists via `node --test` — see `package.json` `test:scripts`). Add
`scripts/lib/fetch-ffmpeg-windows-layout.test.mjs` ONLY IF you can factor the
zip-layout-normalization into a pure function in `scripts/lib/` without
touching the network; otherwise the verification commands in steps 2-3 are the
test plan (they exercise download, checksum, layout, idempotency, and the
preflight failure mode), and that is acceptable here.

## Done criteria

ALL must hold:

- [ ] `pnpm package:desktop` (macOS) exits 0 and the app bundle contains
      `videorc-backend`, `ffmpeg/bin/ffmpeg`, and `videorc-logo.png` under
      `Contents/Resources/` — unchanged from before this plan.
- [ ] `node scripts/fetch-ffmpeg-windows.mjs` exits 0 twice in a row (second
      run skips the download) and produces
      `vendor/ffmpeg/windows-x64/{bin/ffmpeg.exe,LICENSE.txt,SOURCE.txt}`.
- [ ] `node scripts/preflight-windows-package.mjs` exits 1 on the Mac and
      names both missing inputs with their remedy commands.
- [ ] `apps/desktop/electron-builder.yml` has NO top-level extraResources
      entry pointing at `target/` or `vendor/ffmpeg/` (only the logo is
      global): `grep -n "target/release\|vendor/ffmpeg" apps/desktop/electron-builder.yml`
      shows those paths ONLY inside the `mac:` and `win:` sections.
- [ ] `pnpm lint` and `npx prettier --check package.json` pass.
- [ ] `git status` shows no modified files outside the in-scope list.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The `mac:`/`win:`/top-level structure of `electron-builder.yml` no longer
  matches the "Current state" excerpt (drift since `f0b88e5c`).
- `pnpm package:desktop` fails on macOS **before** your changes (pre-existing
  breakage — e.g. `vendor/ffmpeg/current` missing because the mac ffmpeg was
  never built on this machine; report, don't try to build ffmpeg).
- No BtbN release asset matches `win64` + `lgpl` zip naming — the upstream
  layout changed; report the actual asset list instead of guessing.
- The downloaded zip lacks `bin/ffmpeg.exe` — layout drift; report.

## Maintenance notes

- When the Windows box arrives, the on-box gate is
  `pnpm package:desktop:windows` — its first run validates this whole plan
  end-to-end (Phase 1 gate in `docs/windows-port-plan.md`).
- Bumping the ffmpeg version = editing `vendor/ffmpeg/windows-pin.json`
  (URL + sha256) and re-running with `--force`. Keep LGPL-only (`--disable-gpl`
  parity with the mac build): never pin an asset whose name lacks `lgpl`.
- `build-resources/icon.ico` is a single-entry 256px PNG-compressed ICO —
  fine on Win10+/NSIS, but small taskbar/explorer sizes are downscaled by the
  OS. If the icon looks soft at 16/32px, generate a proper multi-size ICO and
  replace the file (no config change needed). Deferred from this plan.
- Reviewer should scrutinize: that the mac `extraResources` relocation did not
  drop the `filter:` lists (they control which license files ship — LGPL
  compliance), and that no global entry references a platform path.
