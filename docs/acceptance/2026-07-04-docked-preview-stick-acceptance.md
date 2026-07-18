# Docked ("stick") preview — acceptance (2026-07-04)

Feature: the detached native preview can be docked into the Studio preview
slot ("Stick to app") and moves together with the app window; floating stays
the default and unchanged. Plan: vault
`plans/planned/2026-07-04 - Videorc Docked Preview Stick To Studio Plan.md`.
Commits: `0c111b01` (main placement model) → `a10bf862` (renderer slot
pipeline + UI) → `35ffafee` (probe scenario + smoke commands) → `1744a9e9`
(gate fold).

## Design contract under test

- Main process is the only placement authority. The renderer reports the slot
  rect in WINDOW-RELATIVE CSS px (unchanged during app drags); main composes
  screen bounds from its own move/resize events; the docked preview window is
  an AppKit child of the main window. The renderer is never in the movement
  path — the 2026-06-09 glue attempt (`9f815a23`) failed exactly there.
- Dock/undock is placement-only: same surface session, same supervisor
  generation, first-frame contract untouched.
- Every docked hide has a stated reason (`dockHiddenReason`) surfaced in the
  slot UI; docked surfaces are never `elevated`.

## Automated results (this machine, 2026-07-04)

| Gate                                                                                                                                                                                                                                   | Result                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `pnpm --filter @videorc/desktop test` (377 tests incl. new preview-dock + dock-slot suites)                                                                                                                                            | PASS                        |
| `pnpm typecheck`, `pnpm lint`, prettier on touched files                                                                                                                                                                               | PASS                        |
| `pnpm test:scripts`                                                                                                                                                                                                                    | PASS                        |
| `pnpm probe:preview-window` — floating open/move/resize/close/reopen                                                                                                                                                                   | PASS                        |
| `pnpm probe:preview-window` — **dock**: surface covers the live Studio slot rect (real renderer reporter, launch dialog dismissed)                                                                                                     | PASS                        |
| `pnpm probe:preview-window` — **dock-move / dock-storm**: surface follows main-window moves and rapid mutations with no new slot report                                                                                                | PASS                        |
| `pnpm probe:preview-window` — **dock-stale-report**: stale-epoch slot reports dropped                                                                                                                                                  | PASS                        |
| `pnpm probe:preview-window` — **dock-overlay / dock-scroll**: hides with stated reasons, returns on clear                                                                                                                              | PASS                        |
| `pnpm probe:preview-window` — **undock**: floating frame restored, surface back at window rect                                                                                                                                         | PASS                        |
| `pnpm probe:preview-lifecycle` (100 open/close cycles)                                                                                                                                                                                 | PASS                        |
| `pnpm smoke:recording-studio` — unit, Rust, smoke:dev, smoke:screens, real-launch first-frame contract, layout-source-loop, scene-commit, pump-diagnostics, click-focus, lifecycle probe, preview-surface reattach, notes invisibility | PASS                        |
| `pnpm smoke:recording-studio` — `smoke:screen-recording-real`                                                                                                                                                                          | **BLOCKED (environmental)** |

`smoke:screen-recording-real` failed at its own pre-recording baseline: the
freshly launched frontmost Chromium stimulus window is not visible in the
captured display ("missing required stimulus color signature"), i.e. the
physical display was not showing new frontmost windows during this unattended
run (display asleep/locked or foreground contention). The check fails before
any Videorc capture behavior runs, and no docked window exists in that smoke
(isolated smoke profile ⇒ floating default, auto-open disabled). Re-run
`pnpm smoke:screen-recording-real` with the owner at the machine.

## Owner by-eye checklist (pending)

Per [[videorc-preview-smoothness-is-perceptual]] the glue is judged by eye:

1. Open preview (⌘P) → "Stick to app" → drag the app window around
   vigorously: the preview must read as one window with the app (surface may
   trail at most as much as today's floating window trails its own drag).
2. Resize the app continuously; docked surface tracks the slot.
3. Switch tabs away/back; scroll the Studio page; preview hides with the
   stated reason and returns.
4. Open Settings/any dialog over the slot → "Preview paused behind dialog";
   closes → returns. Open a Quick Settings select that overlaps the slot →
   same; one that doesn't overlap → preview stays.
5. Minimize/restore the app; hide (⌘H)/reactivate.
6. Enter macOS fullscreen → preview hides with "hidden in fullscreen" +
   Pop out affordance; leave fullscreen → returns docked (v1 ships
   hide-with-reason, not auto-float).
7. Drag the app to a second display (scaleFactor change) if available.
8. Start/stop a recording while docked; 10-minute docked soak.
9. Pop out ↔ stick 10×; quit while docked; relaunch → reopens docked into
   the slot.

Sign-off: _pending owner pass_
