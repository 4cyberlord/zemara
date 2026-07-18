# Cut: Page Layout Redesign + Comments Window

Execution slices cut from `~/Documents/Obsidian Vault/plans/planned/2026-06-24 - Videorc Page Layout Redesign And Comments Window Plan.md` (auto-grilled, owner-confirmed).

**Locked decisions (from the Auto-Grill Verdict):** north star = focused creator tool (Riverside/Loom/Ecamm), NOT OBS density · layout = full pass, all pages, but calm/clarity not consistency-churn · Comments data = relay via main window (feed pauses if main window closes) · Comments UI = purpose-built `CommentsReader` (big text, minimal chrome), NOT the dense in-app panel · sequence = Comments window first, then layout.

**Per-slice gates (arm64 node — `/opt/homebrew/bin` — for vitest/build/lint):**
```bash
pnpm typecheck
PATH="/opt/homebrew/bin:$PATH" pnpm lint
PATH="/opt/homebrew/bin:$PATH" pnpm --filter @videorc/desktop test
pnpm format:check
PATH="/opt/homebrew/bin:$PATH" pnpm --filter @videorc/desktop build
```
Commit + push to main after each slice. New view logic → pure `lib/*` modules with vitest (repo convention: node-only test runner, no DOM).

**Reference (the pattern to copy):** Notes window in `apps/desktop/src/main/index.ts` (~899–990) + its IPC (~5349–5385) + preload (`apps/desktop/src/preload/index.ts` ~13–130) + `notes-window.json` prefs. Live chat: `liveChat.*` WS events → `use-studio.tsx` `liveChatSnapshot` (~775, 1853–1865); `components/live-chat-panel.tsx`, `live-chat-rail.tsx`; types in `apps/desktop/src/shared/backend.ts` (`LiveChatSnapshot/Message/ProviderState`).

---

## Battle order
```
C1 → C2 → C3 → C4 → C5   (Comments window — ships first)
L0 → {L1,L2,L3,L4,L5,L6,L7} → L8   (layout pass — each page depends only on L0)
```

---

## Slice C1 — Comments window shell + prefs (placeholder)
**Goal:** A real "Videorc Comments" `BrowserWindow` that opens/closes/toggles, persists frame + always-on-top, and shows a static placeholder — driven entirely by the same IPC shape as Notes.
**Depends on:** none
**Touches:** `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/backend.ts`, new `apps/desktop/scripts/comments-window-probe.mjs`.
**Steps:**
  1. In `main/index.ts`, copy the Notes-window block: add `commentsWindow`/`commentsWindowLastFrame`/`commentsWindowAlwaysOnTop`/`commentsWindowClosing` globals; `openCommentsWindow/closeCommentsWindow/toggleCommentsWindow/commentsWindowState/setCommentsWindowAlwaysOnTop`; lifecycle events (`move/resize/show/hide/minimize/restore/focus/close/closed`) that persist + broadcast `comments-window:state`.
  2. Window opts: `width 420, height 640, minWidth 320, minHeight 360, titleBarStyle 'hiddenInset' (mac), backgroundColor '#101012', preload, sandbox, contextIsolation, backgroundThrottling:false`. Load inline placeholder HTML for now ("Comments — coming online").
  3. Prefs file `comments-window.json` in `app.getPath('userData')` with `{frame, alwaysOnTop, open}`; auto-restore on launch if `open:true` (gate behind a `VIDEORC_COMMENTS_WINDOW` env like Notes).
  4. Register `ipcMain.handle('comments-window:open'|':close'|':toggle'|':get-state'|':set-always-on-top', …)` next to the Notes handlers.
  5. Preload: add `openCommentsWindow/closeCommentsWindow/toggleCommentsWindow/getCommentsWindowState/setCommentsWindowAlwaysOnTop/onCommentsWindowState`. Add `CommentsWindowState` type to `shared/backend.ts`.
  6. Write `scripts/comments-window-probe.mjs` (mirror `preview-window-probe.mjs`): launch, open → window exists, close → gone, reopen → frame restored, set-always-on-top persists.
**Done when:** `node apps/desktop/scripts/comments-window-probe.mjs` passes; all five gates green; toggling via the preload API opens/closes the placeholder window and `comments-window.json` is written.
**Out of scope:** any chat data, the React reader, rail/Studio entry points.

## Slice C2 — Second renderer entry + CommentsReader
**Goal:** The Comments window renders a real React `CommentsReader` (lean, big-text, glass-themed) showing an empty/sample state — no live data yet.
**Depends on:** C1
**Touches:** `apps/desktop/electron.vite.config.ts`, new `apps/desktop/src/renderer/comments.html`, new `apps/desktop/src/renderer/comments/main.tsx`, new `apps/desktop/src/renderer/src/components/comments-reader.tsx`, `main/index.ts` (load the built entry instead of inline HTML).
**Steps:**
  1. Add a second rollup input to the `renderer` config (`rollupOptions.input` = `{ index: …/index.html, comments: …/comments.html }`).
  2. `comments.html` + `comments/main.tsx`: mount `<ThemeProvider><CommentsReader …/></ThemeProvider>`, import `styles.css` (inherits the glass tokens).
  3. Build `comments-reader.tsx`: props `{ snapshot, onClear }`; render a compact header (provider status dot + Clear) and a vertical feed of **large** message rows (platform badge + author + text, paid/system highlighted, deleted struck-through), auto-scroll with a "new messages" pill. Reuse `LiveChatMessage` types + `lib/live-chat-view` ordering; do NOT import `LiveChatPanel`. Seed with a sample/empty snapshot.
  4. In `main/index.ts`, point the Comments window at the built `comments.html` (dev: `${ELECTRON_RENDERER_URL}/comments.html`; prod: `loadFile(.../comments.html)`), matching how the main window is loaded.
**Done when:** `pnpm --filter @videorc/desktop build` emits a `comments` entry; opening the window shows the themed reader (sample/empty) on the dark glass; gates green.
**Out of scope:** wiring real chat data (C3), entry points (C4).

## Slice C3 — Chat data relay (main-renderer ⇄ main ⇄ window)
**Goal:** Live chat flows into the Comments window: the main renderer relays `liveChatSnapshot` through main to the window, and the window's Clear routes back to `liveChat.clearLocal`.
**Depends on:** C2
**Touches:** `apps/desktop/src/renderer/src/hooks/use-studio.tsx`, `main/index.ts`, `apps/desktop/src/preload/index.ts`, `comments/main.tsx`.
**Steps:**
  1. Preload (window side): `getCommentsSnapshot()` → `ipcRenderer.invoke('comments-window:get-snapshot')`; `onCommentsSnapshot(cb)` ← `'comments-window:snapshot'`; `clearComments()` → `invoke('comments-window:clear')`.
  2. Main: hold `latestCommentsSnapshot`; `comments-window:get-snapshot` returns it; `comments-window:clear` forwards to the main window (`mainWindow.webContents.send('comments-window:clear-request')`); on window open, request a fresh push from the main renderer.
  3. Main renderer (`use-studio.tsx`): on every `liveChatSnapshot` change, if the window is open, `window.videorc.pushCommentsSnapshot(snapshot)` → main → `commentsWindow.webContents.send('comments-window:snapshot', …)`; handle `comments-window:clear-request` → `clearLiveChat()`. Add the `push`/`clear-request` preload methods + IPC.
  4. `comments/main.tsx`: subscribe to `onCommentsSnapshot`, seed from `getCommentsSnapshot`, wire `onClear` → `clearComments`.
**Done when:** with `pnpm smoke:live-chat-fake-providers` (or a fake snapshot), messages appear in the Comments window and match the in-app rail; Clear empties both; gates green.
**Out of scope:** rail pop-out UX, off-air empty states (C5).

## Slice C4 — Rail handoff + entry points
**Goal:** The user can detach comments into the window from the rail header, Studio, the command palette, and ⌘⇧J; while the window is open the in-Studio rail shows a "open in window" placeholder (one live feed).
**Depends on:** C3
**Touches:** `components/live-chat-rail.tsx`, `components/tabs/studio-tab.tsx`, `components/command-palette.tsx`, `main/index.ts` (menu accelerator or renderer key handler for ⌘⇧J), `hooks/use-studio.tsx` (expose comments-window open state + actions).
**Steps:**
  1. Surface comments-window state + `openCommentsWindow/closeCommentsWindow/toggleCommentsWindow` through `use-studio` (subscribe to `onCommentsWindowState`).
  2. Rail header: add a "pop out" icon button (`ArrowSquareOut`, aria-label "Open comments in a window"). When the window is open, the rail body renders a compact placeholder ("Comments open in a separate window — bring back") instead of the live feed.
  3. Command palette: add "Open Comments window" / "Close Comments window" items (Session group) with a `⌘⇧J` `CommandShortcut`.
  4. ⌘⇧J global toggle (mirror the ⌘J rail toggle pattern; ⌘J stays the in-page rail).
**Done when:** opening from any entry point detaches the feed and shows the rail placeholder; closing reattaches; never two live feeds; `smoke:start-labels` + gates green.
**Out of scope:** off-air states, always-on-top UI (C5).

## Slice C5 — Off-air states + always-on-top + clear polish
**Goal:** The window is a finished feature: opens anytime (off-air shows readiness/empty states), has an always-on-top toggle in its drag bar, a clear-local control, and a "reconnecting" state if the main window goes away.
**Depends on:** C4
**Touches:** `components/comments-reader.tsx`, `comments/main.tsx`, `main/index.ts` (drag bar chrome + always-on-top), `preload/index.ts`.
**Steps:**
  1. Reader off-air states: provider readiness pills + "Start a livestream to see comments here" (reuse the panel's copy); a "Reconnecting…" state when no snapshot has arrived and the main window is gone.
  2. Drag-bar chrome in the window: title, always-on-top toggle (wired to `setCommentsWindowAlwaysOnTop`), clear button.
  3. Persist `alwaysOnTop` in `comments-window.json`; restore on launch; `setAlwaysOnTop(…, 'floating')` like Notes.
**Done when:** window opens off-air with provider pills; always-on-top toggles + persists across relaunch; clear works; `smoke:live-chat-fake-providers` with the window open + gates green. **Comments window feature complete.**
**Out of scope:** own-WS decoupling (documented upgrade path, not built).

---

## Slice L0 — Layout system: archetype container conventions
**Goal:** A small, documented set of layout container utilities/components (max-width frame, gutters, the `lg` collapse, section gap, sticky helper) that the page slices consume — no page visually changes yet.
**Depends on:** none (but settle the "amplify glass" intensity first per the Verdict)
**Touches:** new `apps/desktop/src/renderer/src/components/page.tsx` (or `lib/layout.ts` conventions), `docs/` note, possibly `components/app-shell.tsx`.
**Steps:**
  1. Define `PageHeader` (title + description + primary affordance) and `PageGrid`/`PageStack` helpers encoding the archetype columns + `lg` breakpoint + section gap, reading from the existing tokens.
  2. Document the five archetypes (Stage, Bench, Config-grid, Gallery, Browse, Inspect) + when to use each, in a short `docs/` or code comment.
**Done when:** helpers exist + unit-tested where they carry logic; no page consumes them yet (no visual change); gates green.
**Out of scope:** changing any page.

## Slice L1 — Studio → Stage archetype
**Goal:** Studio reads as a stage: a clear transport/command band (Record/Go Live + elapsed + state, distinct from the ambient status dot), the preview status card as the hero, the session strip as one state-chip row.
**Depends on:** L0
**Touches:** `components/tabs/studio-tab.tsx`.
**Done when:** Record/Go Live is identifiable in <1s; preview is the visual hero; `smoke:start-labels` + gates green; live state still announced (aria-live preserved).
**Out of scope:** the chat rail internals (owned by C-phase); other tabs.

## Slice L2 — Sources → Config-grid archetype
**Goal:** Sources in three named groups in fixed order — Capture (screen/window + camera) · Audio (mic + meter + gain + sync) · Devices (forensic list, collapsed) — on a consistent grid.
**Depends on:** L0
**Touches:** `components/tabs/sources-tab.tsx`.
**Done when:** the three groups render in order, single-column below `lg`; `smoke:sources` + gates green; `role="meter"` preserved.
**Out of scope:** device-picker behaviour changes.

## Slice L3 — Layout → Bench (sticky preview)
**Goal:** Layout becomes an editing bench: preview pane sticky (never scrolls out of view) beside grouped controls (preset, camera position/size, background), scene-source list below.
**Depends on:** L0
**Touches:** `components/tabs/layout-tab.tsx`.
**Done when:** preview stays visible while scrolling controls; presets/live-switch still work; gates green.
**Out of scope:** preview-window internals.

## Slice L4 — Assets + Screens → Gallery archetype
**Goal:** Assets and Screens share one responsive card-grid (`auto-fit, minmax`) + a selected-item inspector; consistent thumbnail/status/empty state across both.
**Depends on:** L0
**Touches:** `components/tabs/assets-tab.tsx`, `components/tabs/screens-tab.tsx`.
**Done when:** both render the shared gallery; selection + import/rename/delete work; empty states intact; gates green.
**Out of scope:** asset import pipeline.

## Slice L5 — Streaming → Config-grid (pinned readiness)
**Goal:** Streaming reads ready→where→details: a readiness summary pinned at top (video + chat readiness, separate), then destination cards, then per-destination metadata/OAuth inside each card's disclosure.
**Depends on:** L0
**Touches:** `components/tabs/streaming-tab.tsx`.
**Done when:** readiness is visible without scrolling; destinations are the focus; `smoke:oauth` + gates green; no stream key rendered.
**Out of scope:** OAuth/metadata logic.

## Slice L6 — Recording + Settings → Config-grid
**Goal:** Recording grouped Output → Format → Quality (advanced collapsed); Settings grouped by domain (Storage & tools · Recording defaults · Appearance · System/permissions), consistent 2-col on `lg`.
**Depends on:** L0
**Touches:** `components/tabs/recording-tab.tsx`, `components/tabs/settings-tab.tsx`.
**Done when:** grouped sections render in order; defaults persist; gates green.
**Out of scope:** settings write-through logic.

## Slice L7 — Diagnostics → Inspect; Library/AI → Browse
**Goal:** Diagnostics normalised to `SectionHeader` + metric-row grids with a sticky log header; Library gets a header row with sort/filter/search affordances; AI expresses pick→run→result as visible stages.
**Depends on:** L0
**Touches:** `components/tabs/diagnostics-tab.tsx`, `components/tabs/library-tab.tsx`, `components/tabs/ai-tab.tsx`.
**Done when:** all three render; diagnostics counters/log + export work; library list + AI flows work; gates green.
**Out of scope:** diagnostics data collection; AI workflow logic.

## Slice L8 — Responsive + sticky cross-cutting pass
**Goal:** One breakpoint set applied across every archetype; sticky preview (L3) + sticky streaming readiness (L5) verified; nothing collapses below a usable size at small windows.
**Depends on:** L1–L7
**Touches:** the archetype helpers (`page.tsx`) + any page needing a breakpoint tweak.
**Done when:** every page usable + primary action/preview never below working size at a narrow window, in dark **and** light; gates green. **Layout pass complete.**
**Out of scope:** new features.
