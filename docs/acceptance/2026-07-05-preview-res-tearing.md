# Acceptance — Preview resolution + camera tearing fixes (PT1–PT5)

Date: 2026-07-05 · Branch: main (356957c1 → 5e827619)

## What shipped

- **PT1** (`356957c1`, `e1a1b2ae`): change-triggered sizing diagnostics.
  `[videorc-native-preview-sizing]` (helper stderr lane: bounds pts, scale,
  drawable px) and `[videorc-capture-sizing]` (backend: native vs requested
  capture dims per screen source).
- **PT2** (`5333be90`): window captures convert `SCWindow.frame` POINTS to
  real pixels via the containing display's scale — window sources on Retina
  captured at half resolution before this, recordings included.
- **PT3** (`b166b83d`): the compositor target is a 3-slot IOSurface ring; the
  helper process never presents a surface the next render writes into
  (cross-process queues have no ordering — the single reused target tore
  moving content, i.e. the camera circle).
- **PT4** (`89b1af36`): dock probe asserts drawable == slot pts × display
  scale and helper scale == display scale on the real launch path.
- **PT5** (`5e827619`): helper caches one imported texture per ring slot
  (single-slot cache re-imported every frame after PT3).

## Gate evidence (this machine, 2026-07-05)

| Gate | Result |
| --- | --- |
| `cargo test -p videorc-backend` | PASS (723; new ring + points→pixels tests) |
| `cargo clippy -D warnings`, `cargo fmt --check` | PASS |
| `pnpm typecheck` / `lint` / `format:check` | PASS |
| Desktop unit tests | PASS (412) |
| `pnpm smoke:recording-studio` | PASS (post-ring) |
| `pnpm probe:preview-lifecycle` | PASS ×2 (post-PT1, post-PT3), exit 0 |
| Dock probe (`preview-window-probe`) | PASS incl. 3 new dock-drawable asserts |
| Helper present benchmark | 240/240 frames, 120.1 fps, p95 9.3 ms |
| `pnpm smoke:screen-recording-real` | ENV-BLOCKED (known since 0.9.4): stimulus window loses the captured display's foreground on an in-use machine; one contended run also read preview 30 fps — the isolated present benchmark (120 fps) and recording-studio PASS supersede that reading. Re-run unattended. |

Sizing line captured live (docked, this machine):
`bounds_pts=960x540 scale=2.00 drawable_px=1920x1080` — surface lane healthy;
the drawable-size "fix" a first-pass investigation suggested was wrong
(drawableSize is documented in pixels) and was NOT applied.

## Owner by-eye checklist (pending)

- [ ] Camera circle, docked + detached, 60 s with motion in frame: zero torn
      frames (this was the screenshot symptom — the ring is the fix).
- [ ] Window capture on the Retina panel: on-screen text in the captured
      window is sharp in preview AND in a recording (PT2; was half-res).
- [ ] Display capture unchanged (was already pixel-correct).
- [ ] Second monitor / mixed-DPI: drag the app across displays; preview stays
      sharp (the dock probe asserts scale correctness on one display only).
- [ ] One real recording inspected frame-by-frame around motion: no tearing
      (VideoToolbox adopts ring slots now; window widened 1→3 frames).
- [ ] `smoke:screen-recording-real` once while the display is unattended.
