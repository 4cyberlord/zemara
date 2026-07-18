# Post-0.9.4 UI fix batch — acceptance (2026-07-05)

Eleven owner by-eye findings on 0.9.4, fixed as slices F1–F8. Plan: vault
`plans/planned/2026-07-04 - Videorc Post-0.9.4 UI Fix Batch Plan.md`.
Commits: `2e6f44be` (F1) → `fe59407c` (F4) → `b59198e2` (F8+F2) →
`6fb1d9c9` (F3) → `5f8afd82` (F5+F6) → `c319a6d7` (F7).

## What shipped

- **F1 — docked preview leaves the screen with its tab** (items 1+2): the
  hide path pushes placement explicitly instead of relying on the child
  window's 'hide' event (the native helper NSWindow used to stay painted over
  the next tab). Probe gained a tab-switch step asserting the NATIVE window
  layer via CGWindowList. The closed placeholder now occupies the same
  output-aspect rect as the open/docked preview.
- **F4 — imported backgrounds no longer say "Missing"** (items 5+6): imported
  absolute paths serve through the scoped `videorc-asset://` protocol
  (file:// subresources are blocked from the dev origin — the file was never
  missing). Live-probed: serves managed files, 404s unknown names, blocks
  traversal. "Missing" now requires a confirmed filesystem miss.
- **F8 — no more yellow banner on Studio** (item 11): blocked reasons render
  as a quiet inline line + jump link inside Session controls, next to the
  buttons they explain. BlockingBanner removed (no consumers left).
- **F2 — captions card goes quiet** (item 3): the "Start recording or go
  live…" instruction is gone once captions are on (Streaming tab + Studio
  quick settings).
- **F3 — the stage IS the source list** (items 4+9): "Scene sources" panel
  removed; visibility moved into the Inspector; full-canvas sources get a
  compact inspector instead of a grid of dead nudge arrows; the doubled
  Background section deduped.
- **F5 — Library issues as a badge** (item 7): quality problems are a compact
  "N issues" badge with the reason list in the hover tooltip.
- **F6 — sidebar update chip** (item 8): appears above the account row only
  when an update is available/downloading/downloaded; installs when safe,
  otherwise jumps to Settings → About. Phase mapping unit-tested.
- **F7 — live mixer** (item 10): during sessions the mic meter animates from
  a live level the backend derives from frames it already captures (1Hz
  diagnostics stream, no extra device open); idle stays on-demand (each
  sample opens the device for 700ms — a poll loop is not physically viable).

## Automated results (2026-07-05)

| Gate                                                                                  | Result                        |
| ------------------------------------------------------------------------------------- | ----------------------------- |
| `pnpm --filter @videorc/desktop test` (388 incl. new updateChip + display-url suites) | PASS                          |
| `pnpm typecheck`, `pnpm lint`, prettier per slice                                     | PASS                          |
| `cargo test -p videorc-backend` (702 incl. live-meter mapping asserts), fmt, clippy   | PASS                          |
| `pnpm probe:preview-window` incl. NEW dock-tab-switch native-layer assert             | PASS                          |
| `videorc-asset://` live probe (serve / 404 / traversal)                               | PASS                          |
| `node scripts/perf-idle-probe.mjs` after F7                                           | PASS                          |
| `pnpm smoke:recording-studio` (full bundle)                                           | run at batch close — see note |

## Owner by-eye checklist (pending)

1. Dock the preview, then ⌘1–⌘9 through every tab — nothing may remain on
   screen off-Studio; return to Studio brings it back.
2. Closed/open/docked preview all occupy the same rect (no layout jump).
3. Captions on → no instructional sentence anywhere.
4. Scene tab: no "Scene sources" panel; screen capture click → compact
   inspector (no arrows); camera nudge + visibility switches work; one
   Background section.
5. Upload a background → thumbnail immediately, no "Missing"; apply to scene;
   record with it.
6. Library: session with issues shows the badge; hover reveals reasons.
7. Update chip: visible on an update-staged build above the account row.
8. Record or stream and watch the mixer move while speaking; it stops (not
   freezes) at session end. Studio top has no yellow banner; blocked reasons
   sit under Session controls with working jump links.

Sign-off: _pending owner pass_
