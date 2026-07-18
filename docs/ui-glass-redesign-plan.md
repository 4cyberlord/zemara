# UI Glass Redesign Plan

Migrate the entire Videorc UI to the design language defined in `.claude/skills/videorc-design/SKILL.md` (the authority for every visual decision below): a Raycast-style dark translucent glass surface, monochrome chrome, three-tier typography on the system font, hairline structure, keyboard-first affordances, shadcn/ui components only.

## Goal & non-goals

**Goal.** Every window, tab, dialog, list, button, badge, and toast reads as one coherent glass command surface, matching the reference image: floating charcoal glass, white/gray/dim text tiers, white-8% hairlines and selection, vivid 24px rounded-square source icons as the only large color, kbd chips beside actions, footer action bars.

**Non-goals.**
- Removing light mode is explicitly NOT a goal: light mode stays as a first-class twin of the same language (owner decision 2026-06-12). Dark is the default and the reference expression; the theme toggle survives.
- No functional changes: every slice is restyle-only — handlers, hooks, IPC, and copy stay identical unless a pattern demands relocation (e.g. a button moving into a footer bar keeps its exact handler).
- No new libraries, fonts, or icon sets. shadcn/ui + Tailwind + Phosphor only.
- Windows/Linux polish is out of scope (vibrancy is macOS-only; the solid fallback color covers other platforms by definition).

## Current state (verified inventory)

- **Theme** ([styles.css](../apps/desktop/src/renderer/src/styles.css)): light-default with a `.dark` variant via `next-themes` + [theme-toggle.tsx](../apps/desktop/src/renderer/src/components/theme-toggle.tsx). **Green is the primary action accent** (`--primary: oklch(0.6 0.165 145)` — Record/Go Live buttons, active nav, sidebar accents, chart-1). This green-as-action is explicitly retired by this plan; per the skill, color is information only (live/error/status), never chrome.
- **Fonts**: Geist Variable + Geist Mono via `@fontsource-variable` imports and `--font-sans/--font-heading/--font-mono`. Retired: the target is the reference image's font — the macOS system stack (SF Pro / SF Mono).
- **shadcn**: properly initialized (`components.json`, style `radix-rhea`, base `stone`, Phosphor icons) with 25 primitives in `components/ui/` including `command.tsx`, `dialog.tsx`, `sonner.tsx`. The migration retunes their variants/tokens; it does not fork them.
- **Components**: `app-shell`, `sidebar`, `workspace-nav`, `command-palette`, `panel-section`, `preview-stage`, `inspector`, `live-chat-panel`, `status-badge`, `status-dot`, `blocking-banner`, `onboarding-dialog`, plus 10 tabs (`studio`, `streaming`, `sources`, `layout`, `screens`, `recording`, `library`, `ai`, `diagnostics`, `settings`).
- **Electron windows** ([main/index.ts](../apps/desktop/src/main/index.ts)): main window `backgroundColor: '#ffffff'`, default title bar; detached preview window `#09090b`, `hiddenInset`, with an inline-HTML drag bar; native preview helper draws the actual video in its own NSWindow above the preview window.

## Foundation decisions

1. **True glass via macOS vibrancy.** The reference blurs what is BEHIND the window. The main window gains `vibrancy: 'under-window'`, `visualEffectState: 'active'`, transparent background, `titleBarStyle: 'hiddenInset'` with tuned `trafficLightPosition`; `html, body` backgrounds become the translucent token instead of opaque. In-app layers (dialogs, popovers, toasts) use CSS `backdrop-blur` over app content. Non-macOS and blur-unavailable contexts get the solid fallback `#1C1C1F` automatically via token fallbacks.
2. **System font stack, exactly as the image.** `--font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif`; `--font-heading` same; `--font-mono: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace`. Remove both `@fontsource-variable` imports and dependencies.
3. **Glass tokens, both themes.** `:root` carries the LIGHT glass column and `.dark` the DARK glass column from the skill's token table (identical structure, inverted values); the theme toggle and provider stay, with **dark as the default theme**. Dark mapping (skill → shadcn vars):
   - `--background`: `rgba(24,24,27,0.75)` (over vibrancy) · solid fallback `#1C1C1F` for `--popover`/`--card` at `0.92`
   - `--foreground`: `#F4F4F5` · `--muted-foreground`: `#A1A1AA` · tertiary via `--muted-foreground/70` usage or a `--subtle` token `#71717A`
   - `--border` / `--input`: `rgba(255,255,255,0.08)` · `--ring`: `rgba(255,255,255,0.25)`
   - `--primary`: near-white (monochrome action) — **the green action accent is deleted**
   - `--accent` (hover/selected): `rgba(255,255,255,0.08)`
   - `--live` (red) stays; `--success/--warning/--info` survive ONLY for status dots/badges/toasts, never for buttons, nav, panels, or text emphasis
   - `--radius`: 0.625rem for rows/controls; panels/dialogs use a `rounded-2xl` tier; chips `rounded-md` (6px)
4. **Primary actions become text + kbd, not filled CTAs.** Record / Go Live / Confirm render as ghost buttons with key chips in footer action bars; the LIVE state communicates through the red status dot/badge, not button fill. (Destructive confirmations keep the red-text treatment.)
5. **Four new shared primitives** (each a thin composition of shadcn parts, built once in S2, reused everywhere): `Kbd`, `ListRow` (24px icon · title · inline context · alias chip · spring · status icons · meta label), `SectionHeader`, `FooterActionBar`.

## Slices

Each slice is restyle-only, independently shippable, leaves all gates green, and ends with commit+push. Verification baseline for every slice: `pnpm typecheck`, `pnpm exec vitest run`, eslint + prettier on touched files, plus the slice's own visual check (below).

- **S0 — Tokens + fonts, both themes.** Rewrite `styles.css` tokens per Foundation 2–3 (light glass in `:root`, dark glass in `.dark`); remove fontsource imports/deps; keep the theme toggle and provider, flipping the default to dark. The app will look half-migrated (old layouts, new skin) — acceptable, slices are additive. *Check:* screenshot every tab via the `capture-page` smoke command in BOTH themes; fonts render SF Pro; the old green action accent is gone from both columns.
- **S1 — Electron glass shell.** Main window vibrancy/transparency/hiddenInset per Foundation 1; preview window chrome (`PREVIEW_WINDOW_HTML` drag bar) restyled to the same hairline/glass tokens; body transparency. *Check:* screenshots show desktop blur-through; `perf-idle-probe` confirms presents ≈60/s and renderer/GPU CPU within current baseline (vibrancy + backdrop-filter cost measured here, budget: no process regresses >5% absolute); a short record+stop smoke passes.
- **S2 — Primitives + shadcn variant retune.** Build `Kbd`, `ListRow`, `SectionHeader`, `FooterActionBar`; retune `button` (ghost-first, no filled green), `badge` (monochrome + tiny status variants), `dialog` (glass panel: rounded-2xl, hairline ring, blur, fade+scale 0.98), `command`, `separator`, `input` (borderless-on-panel variant), `sonner` (glass toasts). *Check:* a temporary storybook-style smoke screen is NOT added — verify via the existing command-palette and one dialog screenshot.
- **S3 — App shell, sidebar, navigation.** `app-shell`, `sidebar`, `workspace-nav`, `blocking-banner`: sidebar items become `ListRow`s with white-8% selection (kill green active states), nav reads as sections, global footer action bar appears with real shortcuts (the keydown map in `use-studio` already exists — surface it). *Check:* screenshots; keyboard nav unchanged.
- **S4 — Studio tab.** `studio-tab`, `panel-section`, `preview-stage`, `status-badge`, `status-dot`, `inspector`: sections → glass sections with `SectionHeader`; Record/Go Live → footer bar actions with kbd chips; live state = red dot + monochrome label. *Check:* screenshots idle + while recording (smoke start/stop); Go Live dialog opens unaffected.
- **S5 — Streaming tab.** The closest match to the reference image: destinations become a sectioned `ListRow` list (platform icon 24px rounded-square — the colorful element; title; inline account context in secondary gray; right-aligned meta like "Connected" / "Manual RTMP"; status icons before meta). Stream-key fields adopt the borderless input pattern inside glass sections; key dialogs inherit S2 glass automatically. *Check:* screenshots of all destination states (connected/blocked/manual), key replace dialog, Go Live preflight rows as `ListRow`s.
- **S6 — Dialogs & overlays.** `go-live` confirmation, stream-key confirm/clear, `onboarding-dialog`, `command-palette` (becomes the literal reference: `CommandDialog` with search header + sectioned rows + footer bar), toasts. *Check:* screenshot each dialog; command palette opens via its shortcut.
- **S7 — Remaining tabs.** `sources`, `layout`, `screens`, `recording`, `library`, `ai`, `diagnostics`, `settings` — all icon+title+meta lists converge on `ListRow`; forms adopt glass sections; diagnostics tables keep `--font-mono` (SF Mono) for numbers. *Check:* screenshot sweep of all eight.
- **S8 — Color purge & cleanup.** Delete dead tokens (sidebar greens, chart palette if unused, `--font-heading` if redundant), remove Geist packages from `package.json`, grep-audit: no `--primary`-as-green usages, no `bg-green`/`success` styling outside status dots/badges/toasts, no `Card` opaque surfaces, no non-tier radii. *Check:* grep audit clean + full screenshot sweep.
- **S9 — Final acceptance.** Full local gates (`typecheck`, vitest, cargo untouched but run for safety, eslint, prettier), `perf-idle-probe` + `perf-memory-probe` against the pre-migration baseline (glass must not regress CPU/memory budgets), full-tab screenshot suite reviewed side-by-side against the reference image, and a perceptual pass of the live preview while recording (smoothness rule: judge by eye).

## Verification harness

- **Screenshots:** the smoke `capture-page` command renders any tab to PNG; each slice captures its surfaces to `VIDEORC_SMOKE_OUTPUT_DIR` and they get eyeballed against the reference. (Optional follow-up after migration: commit a `smoke:ui-screens` script that sweeps all tabs.)
- **Perf guard:** `scripts/perf-idle-probe.mjs` (presents/s, CPU per process) and `scripts/perf-memory-probe.mjs` (allocator growth) run at S1 and S9 — vibrancy and backdrop-filter are the two riskiest costs in this plan and they get measured, not assumed.
- **Behavioral gates:** existing vitest suites (78) + smoke gates stay green every slice; no `use-studio` logic changes are permitted in restyle commits.

## Risks & mitigations

1. **Vibrancy interactions with the native preview stack.** The helper NSWindow orders above the preview window; main-window transparency must not change z-ordering or compositor behavior. Mitigated by S1's perf-idle-probe gate (presents + transport unchanged) and a manual drag/record check.
2. **GPU cost of blur at 60fps.** `backdrop-filter` over animated content can be expensive; vibrancy is composited by the OS and is cheap, so prefer vibrancy for the window and reserve CSS blur for overlays. S1/S9 measure it.
3. **Readability of white-8% structure.** On very dark desktop wallpapers translucency can flatten; the `0.75` alpha floor plus hairline ring keeps panel edges legible — if screenshots disagree, raise alpha to `0.82` before fighting individual screens.
4. **Scope creep into behavior.** The "restyle-only" rule is the contract; anything functional discovered mid-slice becomes a separate task, never a rider.

## Execution order & cadence

S0 → S1 → S2 are strictly sequential (foundation). S3–S7 can proceed in any order afterwards but default to the listed order (shell first, then the two flagship tabs, then the rest). S8–S9 close. One slice = one commit+push to main, message stating the slice. Estimated shape: 11 commits.
