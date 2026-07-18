# Plan 011: Sandbox the main Electron renderer without breaking preload APIs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts apps/desktop/src/shared/backend.ts apps/desktop/src/main/*.test.ts apps/desktop/src/renderer/src/**/*.ts apps/desktop/src/renderer/src/**/*.tsx`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 004
- **Category**: security
- **Planned at**: commit `3d217933`, 2026-06-13

## Why this matters

The main Studio renderer runs with `contextIsolation: true` and
`nodeIntegration: false`, but `sandbox: false`. Preview windows are already
sandboxed. For a desktop app that renders OAuth, streaming, chat, and local file
controls, sandboxing the main renderer reduces the blast radius of renderer XSS
or dependency compromise. The risk is real because preload currently reads
`process` and imports `shell`, so this must be a deliberate hardening slice with
smokes, not a drive-by toggle.

## Current state

Relevant files:

- `apps/desktop/src/main/index.ts` - creates windows and owns IPC handlers.
- `apps/desktop/src/preload/index.ts` - exposes `window.videorc`.
- `apps/desktop/src/shared/backend.ts` - shared preload API types.
- `apps/desktop/src/main/*.test.ts` - existing main-process unit-test style.

Main window is not sandboxed:

```ts
// apps/desktop/src/main/index.ts:317
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: false,
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false
}
```

Preview windows are already sandboxed:

```ts
// apps/desktop/src/main/index.ts:643
webPreferences: {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false
}
```

Preload currently uses `process` and `shell` directly:

```ts
// apps/desktop/src/preload/index.ts:1
import { contextBridge, ipcRenderer, shell } from 'electron'

// apps/desktop/src/preload/index.ts:21
async function openSystemPermissions(pane: SystemPermissionPane = 'privacy'): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('Permission shortcut is only available on macOS.')
  }

  await shell.openExternal(MACOS_PERMISSION_URLS[pane] ?? MACOS_PERMISSION_URLS.privacy)
}
```

Preload also computes runtime info from `process`:

```ts
// apps/desktop/src/preload/index.ts:39
function runtimeInfo(): RuntimeInfo {
  const targetPath = permissionTargetPath()
  const isPackaged = !targetPath.endsWith('/Electron.app')
```

Main already has some related IPC handlers:

```ts
// apps/desktop/src/main/index.ts:3834
ipcMain.handle('system:open-permissions', (_event, pane?: SystemPermissionPane) =>
  openSystemPermissions(pane)
)
ipcMain.handle('oauth:open-url', (_event, authUrl: string) => openOAuthUrl(authUrl))
```

But preload does not currently use `system:open-permissions`, and
`revealPermissionTarget` is exposed in shared types without a matching main
handler in the excerpt.

Repo conventions:

- Keep all privileged operations in main IPC.
- Validate URLs/paths in main before opening external resources.
- Existing preview-window sandbox behavior is the model.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Desktop tests | `pnpm --filter @videorc/desktop test` | all Vitest tests pass |
| TypeScript typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Smoke dev app | `pnpm smoke:dev` | exits 0 |
| OAuth smoke | `pnpm smoke:oauth-guards` | exits 0 |
| Preview smoke | `pnpm smoke:preview-surface` | exits 0 on local macOS with display |
| Packaged native preview | `pnpm smoke:packaged:native-preview` | exits 0 after Plan 004 |

## Scope

**In scope**:

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/shared/backend.ts`
- focused tests under `apps/desktop/src/main/` or `apps/desktop/src/preload/`
- smoke updates only if needed for sandboxed preload

**Out of scope**:

- Renderer UI redesign.
- Backend/media changes.
- Changing OAuth provider behavior beyond moving privileged open calls to main.
- Native preview protocol changes.

## Git workflow

- Branch: `codex/011-sandbox-main-window`
- Commit style: preload IPC move first, sandbox toggle second, smoke fixes third
  if needed.
- Do not push unless instructed.

## Steps

### Step 1: Move privileged preload work into main IPC

Make preload a thin IPC bridge:

- `openSystemPermissions` should call `ipcRenderer.invoke('system:open-permissions', pane)`.
- `revealPermissionTarget` should call a new main handler, for example
  `system:reveal-permission-target`.
- `getRuntimeInfo` should call a new main handler, for example
  `app:get-runtime-info`, instead of reading `process.env` and `process.execPath`
  in preload.

Move `permissionTargetPath()` and `runtimeInfo()` from preload to main, or share
pure helpers only if they do not require renderer `process`.

Keep URL validation for OAuth in main (`openOAuthUrl` already validates http/https).

**Verify**: `pnpm typecheck` exits 0.

### Step 2: Add tests for the IPC/runtime helpers

Add focused tests for any new pure helpers:

- packaged permission target path strips `.app/Contents/MacOS/...` to `.app`
- Electron dev path reports `permissionTargetName: Electron`
- runtime info reflects env flags from main process input
- non-mac permission open still rejects

If direct main IPC tests are awkward, test extracted pure helper functions and
keep IPC registration thin.

**Verify**: `pnpm --filter @videorc/desktop test` exits 0.

### Step 3: Enable `sandbox: true` for the main window

Change the main window `webPreferences` to:

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false
}
```

Do not change preview window preferences unless tests show a direct need.

**Verify**:

```sh
pnpm typecheck
pnpm lint
pnpm --filter @videorc/desktop test
```

### Step 4: Smoke privileged flows

Run:

```sh
pnpm smoke:dev
pnpm smoke:oauth-guards
```

On local macOS with display/permissions, also run:

```sh
pnpm smoke:preview-surface
```

After Plan 004 is done and the app is packaged:

```sh
pnpm smoke:packaged:native-preview
```

Expected:

- renderer still receives backend connection
- OAuth URL opening remains guarded
- system permission/reveal actions still work
- native preview bridge functions still exist
- preview transport/backing still prove native path when expected

## Test plan

- Unit tests:
  - runtime info helper
  - permission target helper
  - URL/permission IPC edge cases where pure functions exist
- Smokes:
  - dev app boot
  - OAuth guards
  - preview surface
  - packaged native preview after Plan 004

## Done criteria

- [ ] Main Studio BrowserWindow uses `sandbox: true`.
- [ ] Preload no longer depends on direct `shell` or renderer-side `process`
      for runtime info and system permission actions.
- [ ] Privileged actions are handled in main IPC.
- [ ] `pnpm typecheck`, `pnpm lint`, and
      `pnpm --filter @videorc/desktop test` pass.
- [ ] `pnpm smoke:dev` and `pnpm smoke:oauth-guards` pass.
- [ ] Native preview smokes pass or a precise local-permission blocker is
      recorded.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Sandboxing breaks native preview IPC in a way that requires protocol changes.
- Preload cannot expose required APIs without renderer `process`.
- OAuth/system permission flows require privileged renderer access.
- Fixing sandbox causes unrelated UI or media behavior changes.

## Maintenance notes

After this lands, new privileged desktop capabilities should be added as main
IPC handlers, not by giving the renderer more access. Reviewers should check
that preload remains a typed bridge and does not regain direct filesystem,
process, or shell behavior.
