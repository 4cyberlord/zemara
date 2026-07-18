# Cut: Studio Dashboard Rewrite (Phase 1)

Execution slices cut from `~/Documents/Obsidian Vault/plans/planned/2026-06-24 - Videorc Studio Dashboard Rewrite Plan.md` (auto-grilled, owner go-ahead).

**Locked decisions (Auto-Grill Verdict):** ship Phase 1 first (dashboard on existing state + honest placeholders) · Scenes = real layout-preset cards, NOT invented names, Add Scene disabled · Studio Mode dropped · Activity = client-side change log (not raw healthEvents) · rewrite the render but REUSE the logic (session handlers, PreviewStage, Go Live dialog, chat rail, aria-live) · Quick Settings call the existing `captureConfig` setters (one state) · no fake data anywhere.

**Per-slice gates (arm64 node — `/opt/homebrew/bin` — for vitest/build/lint):**
```bash
PATH="/opt/homebrew/bin:$PATH" pnpm --filter @videorc/desktop test
pnpm typecheck
PATH="/opt/homebrew/bin:$PATH" pnpm lint
pnpm format:check
PATH="/opt/homebrew/bin:$PATH" pnpm --filter @videorc/desktop build
pnpm smoke:start-labels   # transport regression
```
Commit + push to main after each slice. New view logic → pure `lib/*` modules with vitest (repo convention: node-only runner, no DOM).

**Target file:** `apps/desktop/src/renderer/src/components/tabs/studio-tab.tsx` (the rewrite), with new sub-components under `apps/desktop/src/renderer/src/components/studio/`. **Reuse unchanged:** `components/preview-stage.tsx`, `components/go-live-dialog.tsx`, `components/live-chat-rail.tsx`, `components/page.tsx` (PageHeader/PageStack/Gallery), `components/source-select.tsx`, `components/video-preset-select-items.tsx`, `components/list-row.tsx`, `components/panel-section.tsx`. **State:** `hooks/use-studio.tsx` (`recording`, `captureConfig`, `audioMeter`/`meterLevel`, `deviceList`, `previewWindow`, `togglePreviewWindow`, `healthEvents`, the session handlers).

---

## Battle order
```
SD0 → SD1 → SD2 → SD3 → SD4 → SD5     (Phase 1 — renderer only, ships standalone)
        then F1 → F2 / F3             (Phase 2 — backend sub-projects, own plans)
```
SD1–SD4 each depend only on SD0 (the shell) and can be built in any order; SD5 assembles + makes it responsive and depends on SD1–SD4.

---

## Slice SD0 — Dashboard shell + header + warning banner
**Goal:** `studio-tab.tsx` renders the new dashboard stack — title header with a Record split-button + Go Live, and the dismissible 4K warning banner — with transport behaviour identical to today.
**Depends on:** none
**Touches:** `components/tabs/studio-tab.tsx`, `components/page.tsx` (PageHeader/PageStack), `components/ui/dropdown-menu.tsx` (Record caret).
**Steps:**
  1. Restructure `StudioTab`'s return into a `PageStack`: header row, warning banner, then placeholder slots for SD1–SD4. Keep the `GoLiveConfirmationDialog` mount and the chat-rail mount unchanged.
  2. Header: `PageHeader` title "Studio" + description "Professional recording and streaming made simple."; right side = the transport. Keep the existing `StudioSessionModule` record/go-live/stop logic but present Record as a split-button (`Button` red + `DropdownMenu` caret: "Record only" / "Record + stream") and Go Live as outline. Reuse `handleRecord`/`handleLiveStream`/`stopSession`.
  3. Warning banner: render the existing `videoProfileCompatibility().blockingReason` / `liveStreamBlockedReason` as a dismissible `warning`-token strip (the exact "4K livestreaming…" text already exists).
**Done when:** `pnpm smoke:start-labels` passes; Record/Go Live/Stop start+stop sessions exactly as before; live state still announced (the `aria-live` region preserved); banner shows + dismisses; all gates green.
**Out of scope:** Session panel, Quick Settings, Scenes, Mixer, Activity (their own slices).

## Slice SD1 — Preview + Session panel
**Goal:** the 2-col Preview + Session row — the detached-preview card and the Session status rows + controls, all from existing state.
**Depends on:** SD0
**Touches:** `components/tabs/studio-tab.tsx`, new `components/studio/session-panel.tsx`, new `lib/studio-session-view.ts` (+ test); reuse `PreviewStage`, `ListRow`.
**Steps:**
  1. Preview: reuse `PreviewStage` inside a `PanelSection` ("Preview" + a Ready/status badge + pop-out / always-on-top icons via `previewWindow` + `togglePreviewWindow` / `setPreviewWindowAlwaysOnTop`).
  2. `lib/studio-session-view.ts`: pure derivations for the row strings — Mode ("Local Recording" / "Recording + streaming"), Recording Quality ("4K · 2160p30"), Output ("3840×2160 · 30fps") from `recording`/`captureConfig`. Unit-test it.
  3. Session `PanelSection`: a `ListRow` per fact — Status, Mode, Recording Quality, Streaming, Output — each deep-linking to its owner where sensible. **Omit the Storage row** (F1). A nested Session Controls card: Start Recording / Start Streaming (reuse handlers). **No Studio Mode.**
**Done when:** every row reflects live `recording`/`captureConfig`; quality/output strings match the session strip's; controls start/stop a session; `lib/studio-session-view` tests + all gates green.
**Out of scope:** Storage row (F1); Studio Mode; the other rows.

## Slice SD2 — Quick Settings row
**Goal:** the 4-up Source / Mic / Layout / Output quick-edit cards, each editing the same `captureConfig` the owning page does.
**Depends on:** SD0
**Touches:** `components/tabs/studio-tab.tsx`, new `components/studio/quick-settings.tsx`; reuse `SourceSelect`, `VideoPresetSelectItems`, the layout-preset popover from `session-strip.tsx`.
**Steps:**
  1. Build `QuickSettings`: four compact cards — Source (`SourceSelect` on screen/window + camera), Mic (`SourceSelect` on microphone + a mini level from `meterLevel`), Layout (the existing layout-preset popover applying `captureConfig.layout`), Output (`VideoPresetSelectItems` applying the video preset).
  2. Every card writes through the EXISTING setters (`setCaptureConfig` / `applyVideoPreset` / the layout apply) — never a local copy.
  3. Each card gets a small deep-link affordance to its full page (Sources / Scene / Output).
**Done when:** changing any quick setting changes the identical state seen on the owning page (verify by switching pages); the mic mini-level moves on sound; gates green.
**Out of scope:** building new pickers (reuse only); Scenes/Mixer/Activity.

## Slice SD3 — Scenes gallery (preset-backed, honest)
**Goal:** a Scenes gallery wired to the REAL layout presets (no invented names), with Add Scene disabled.
**Depends on:** SD0
**Touches:** `components/tabs/studio-tab.tsx`, new `components/studio/scenes-gallery.tsx`; reuse `Gallery`, the `LAYOUT_PRESETS` + `applyCameraPreset` from `layout-tab.tsx`/useStudio.
**Steps:**
  1. Render the existing layout presets (Screen+Cam / Screen / Camera / Side-by-side) as `Gallery` cards; the active preset (`captureConfig.layout.layoutPreset`) shows selected; clicking applies it live.
  2. An "Add scene" card rendered visibly disabled with "Saved scenes coming soon".
  3. Honest labels only — the real preset names, NOT "Main Camera / Presentation / Interview".
**Done when:** selecting a card applies the preset live (matches the Layout page); Add Scene is disabled; no fabricated scene names anywhere; gates green.
**Out of scope:** real named-scene CRUD (F2).

## Slice SD4 — Audio Mixer + Activity feed
**Goal:** the Audio Mixer (real mic meter, honest system-audio) and a client-side Activity log.
**Depends on:** SD0
**Touches:** `components/tabs/studio-tab.tsx`, new `components/studio/audio-mixer.tsx`, new `components/studio/activity-feed.tsx`, new `lib/studio-activity.ts` (+ test); reuse `audioMeter`/`meterLevel`, `deviceList`, `recording`.
**Steps:**
  1. Audio Mixer: a Mic row with the real `audioMeter` VU + dB + a `⋮` menu (mute/gain → deep-link to Sources audio); a System Audio row in its existing "Unavailable — pending native adapter" state (honest, from the placeholder device).
  2. `lib/studio-activity.ts`: a pure reducer turning observable transitions (`recording.state` changes, device connect/disconnect from `deviceList`, `captureConfig` changes) into a bounded `{label, at}[]`. The renderer keeps a small ring buffer via an effect and renders the recent N with relative timestamps + "View all activity" → Health (⌘K). Unit-test the reducer.
  3. No backend.
**Done when:** the mic meter moves on sound; System Audio reads unavailable honestly; the activity list shows real recent transitions (start recording → "Recording started"; plug a mic → "Microphone connected"); the reducer tests + all gates green.
**Out of scope:** real system-audio capture/meter (F3); any backend activity stream.

## Slice SD5 — Assemble + responsive + polish
**Goal:** the full dashboard assembled, responsive, dark + light, chat rail intact. Phase 1 complete.
**Depends on:** SD1, SD2, SD3, SD4
**Touches:** `components/tabs/studio-tab.tsx`.
**Steps:**
  1. Assemble the stack: header → banner → Preview+Session (2-col at `lg`) → Quick Settings (4-up, collapses) → Scenes + Mixer + Activity (3-col at `lg`) → footer; preserve the chat-rail aside when streaming.
  2. One breakpoint set (`lg`) for the multi-col rows; collapse to single column below; ensure nothing overflows (truncate long device names — the device-id lesson from the layout fix).
  3. Verify dark + light; `aria-live` state; ⌘P / ⌘J / ⌘⇧J unaffected.
**Done when:** the page matches the mockup structure; usable at a narrow window in dark **and** light; `smoke:start-labels` + all gates green. **Phase 1 (the dashboard) complete.**
**Out of scope:** F1 / F2 / F3.

---

## Deferred — Phase 2 (backend sub-projects; NOT sliced here)
Each needs its own grill + cut before execution.

- **F1 — Disk-free space (small).** Backend: stat the output dir (statvfs on macOS, GetDiskFreeSpaceEx on Windows) into the health snapshot; shared type; renderer fills the Session "Storage" row. Cross-platform + path-change handling.
- **F2 — Multi-scene CRUD (large; the big one).** Backend scene collection: `scenes.create/list/rename/switch/delete/duplicate` + persistence + the mid-recording-switch lifecycle decision; renderer replaces the SD3 preset stub with real named scenes. **Own grill required** (lifecycle + persistence are non-trivial).
- **F3 — System-audio capture + meter (large; macOS).** Implement the native system-audio adapter (the current placeholder device), plumb a second meter, render the real System Audio row. macOS-only.
