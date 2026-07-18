# Plan 002: Fix the two Windows window-chrome bugs (preview window frame, theme-toggle base color)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat f0b88e5c..HEAD -- apps/desktop/src/main/index.ts`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (both fixes are platform-gated additions; macOS code paths are untouched and verified by smoke)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f0b88e5c`, 2026-06-12

## Why this matters

Commit `f0b88e5c` made the MAIN window's chrome platform-aware
(`platformWindowChromeOptions()`), but two spots were missed:

1. The **detached preview window** still hardcodes
   `titleBarStyle: 'hiddenInset'` — a macOS-only style. On Windows, Electron
   treats hidden-style title bars as frameless; the renderer has no
   `-webkit-app-region: drag` regions, so the preview window would render
   without a usable title bar and be effectively unmovable.
2. The **theme-toggle IPC handler** updates the window's solid background
   only when `!glassVibrancyEnabled`. That flag comes from the
   `VIDEORC_GLASS_VIBRANCY` env var and defaults to TRUE on every platform —
   but on Windows the window is ALWAYS painted as a solid themed base
   (vibrancy is mac-only). Result on Windows: toggling to the light theme
   leaves the window's base `#1C1C1F` (dark). The renderer's 75%-alpha light
   tokens then composite over a dark base — the light theme reads muddy, and
   resize flashes show dark.

Both are one-condition fixes that keep macOS byte-identical.

## Current state

All in `apps/desktop/src/main/index.ts` (line numbers at commit `f0b88e5c`):

- Line ~90: platform consts added by the port work — use these, don't
  re-derive `process.platform`:

  ```ts
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  ```

- Line ~246: `platformWindowChromeOptions()` — the main window's per-platform
  chrome helper. Its non-mac branch returns
  `{ backgroundColor: nativeTheme.shouldUseDarkColors ? '#1C1C1F' : '#F5F5F7' }`.
  This is the pattern to match.

- Lines ~626-646 — the detached preview window (inside
  `createPreviewWindow()`-ish flow; search for `title: 'Videorc Preview'`):

  ```ts
  const window = new BrowserWindow({
    width: frame?.width ?? 960,
    height: frame?.height ?? 568,
    ...(frame ? { x: frame.x, y: frame.y } : {}),
    minWidth: 320,
    minHeight: 208,
    title: 'Videorc Preview',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    show: true,
    ...appWindowIconOptions(),
    ...
  ```

- Lines ~3843-3849 — the theme IPC handler:

  ```ts
  ipcMain.handle('app:set-native-theme', (_event, theme: string) => {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
    // The solid-fallback base must follow the theme too (vibrancy ignores it).
    if (!glassVibrancyEnabled) {
      mainWindow?.setBackgroundColor(theme === 'light' ? '#F5F5F7' : '#1C1C1F')
    }
  })
  ```

- Repo conventions: comments state constraints, not narration; prettier +
  eslint enforced (`pnpm lint`, prettier config at repo root); the local
  verification gate for main-process changes is `pnpm typecheck && pnpm build`
  plus `node scripts/smoke-dev-app.mjs`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Format check | `npx prettier --check apps/desktop/src/main/index.ts` | clean |
| Build | `pnpm build` | exit 0 |
| Smoke (launch+record on macOS) | `node scripts/smoke-dev-app.mjs` | ends with "recording created: …" |

Smoke pitfall: if it fails immediately with "Dev app exited before smoke test
completed: code=0", a stale Videorc Electron instance holds the
single-instance lock. Kill stale instances first:
`pkill -f "electron-vite"; pkill -f "Electron .$"` and any
`target/debug/videorc-backend` processes, then re-run.

## Scope

**In scope**:
- `apps/desktop/src/main/index.ts` (two localized edits)

**Out of scope** (do NOT touch):
- `platformWindowChromeOptions()` itself — the main-window chrome is correct.
- The `nativePreviewSurfaceWindow` (frameless+transparent proof surface) —
  frameless is intentional and cross-platform there.
- The renderer (`apps/desktop/src/renderer/**`) — no drag regions, no theme
  changes; the Windows frameless glass is Phase 4 of
  `docs/windows-port-plan.md`, not this plan.
- `VIDEORC_GLASS_*` env-flag semantics.

## Git workflow

- Work directly on `main` (owner convention: commit + push after each verified
  slice; imperative subjects). One commit. End the message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Steps

### Step 1: Gate the preview window's title-bar style to macOS

In the preview-window `new BrowserWindow({...})` (the one with
`title: 'Videorc Preview'`), replace the unconditional line

```ts
    titleBarStyle: 'hiddenInset',
```

with a platform-conditional spread (matching the main window's pattern of
mac-only chrome):

```ts
    // hiddenInset is macOS-only; off macOS the standard frame keeps the
    // preview window draggable without renderer drag regions (Phase 4 owns
    // the frameless Windows chrome).
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
```

**Verify**: `pnpm typecheck` → exit 0. `grep -n "titleBarStyle" apps/desktop/src/main/index.ts`
→ every remaining occurrence is either inside `platformWindowChromeOptions()`
or behind an `isMac` conditional.

### Step 2: Make the theme handler update the solid base whenever a solid base is in use

The solid base is in use when vibrancy is disabled OR the platform is not
macOS (the non-mac branch of `platformWindowChromeOptions()` always paints
solid). Change the handler condition to mirror that:

```ts
  ipcMain.handle('app:set-native-theme', (_event, theme: string) => {
    nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
    // The solid base must follow the theme wherever a solid base is painted:
    // always off macOS, and on macOS when vibrancy is opted out.
    if (!isMac || !glassVibrancyEnabled) {
      mainWindow?.setBackgroundColor(theme === 'light' ? '#F5F5F7' : '#1C1C1F')
    }
  })
```

**Verify**: `pnpm typecheck && pnpm lint` → exit 0.

### Step 3: Full gate

**Verify**:
1. `npx prettier --check apps/desktop/src/main/index.ts` → clean.
2. `pnpm build` → exit 0.
3. `node scripts/smoke-dev-app.mjs` → "recording created" (proves macOS
   behavior unchanged: on macOS `isMac` short-circuits both edits back to the
   pre-plan logic).

## Test plan

There is no unit harness for the Electron main process in this repo (main is
verified via typecheck/build/smokes). The two conditions are
platform-constant at runtime, so the meaningful checks are:

- macOS regression: the smoke run in Step 3 (covers window creation + IPC
  wiring end to end).
- Windows validation: deferred to the Windows box (Phase 1 gate). Add a line
  to your completion report noting that the preview window and theme toggle
  must be eyeballed on the box: open preview window → it has a native frame
  and is draggable; toggle D (theme) → base color follows.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck`, `pnpm lint`, prettier check, `pnpm build` all exit 0.
- [ ] `node scripts/smoke-dev-app.mjs` completes with a recording.
- [ ] `grep -c "titleBarStyle: 'hiddenInset'," apps/desktop/src/main/index.ts`
      returns 0 (the unconditional form is gone).
- [ ] The `app:set-native-theme` handler contains `!isMac ||
      !glassVibrancyEnabled`.
- [ ] No files outside `apps/desktop/src/main/index.ts` modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The excerpts in "Current state" don't match the live file (drift).
- `smoke-dev-app.mjs` fails for a reason other than the stale-instance
  pitfall documented above — do not chase unrelated smoke failures here.
- You find yourself wanting to add drag regions or renderer changes — that's
  Phase 4 scope; stop and report instead.

## Maintenance notes

- Phase 4 (Windows glass) will replace the non-mac native frame with a
  frameless/overlay design; when that lands, BOTH spots touched here must be
  revisited together with `platformWindowChromeOptions()` — consider
  centralizing all three windows' chrome at that point (deliberately not done
  now to keep this plan zero-risk).
- Reviewer should check: no behavior change on macOS (`isMac` short-circuits),
  and that the preview window edit kept the `as const` so TypeScript narrows
  the literal type.
