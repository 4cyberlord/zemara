# Native Preview First-Frame Contract — Acceptance (2026-07-01)

Scope: the Native Preview Definitive Fix Plan (Obsidian, 2026-07-01) executed on
main — diagnosis, isolation root fix, first-frame contract + healing ladder,
reality gate. Commits: `c8bd0832` (real-launch smoke, red), `8740237f`
(backend-state isolation), `c0fdd3b8` (contract + ladder + truthful waiting UI),
`3cf72b65` (gates fold).

## Diagnosis result (Phase 0)

- Fresh isolated launch met the first-frame contract in ~1.3s — core pipeline
  healthy (branch A/B/C ruled out).
- The user-visible breakage ("Waiting for preview" + blue moving vertical bars,
  dev, from launch) was **foreign smoke state**: `smoke:dev`/`smoke:screens`
  backends shared the REAL user profile (Electron userData was isolated; the
  backend's sqlite + secrets were not), writing test-pattern record sessions
  into the user's DB while their app ran. Witnesses in the user profile:
  `sessions` rows with `videorc-dev-smoke-*` / `videorc-screens-smoke` output
  dirs and sources all-null + `testPattern: true`; `last_capture_session`
  matching. The user's renderer captureConfig (localStorage) was intact with
  real sources.

## Automated verification (all green on this host)

- `pnpm smoke:preview-real-launch` — PASS ×3 (contract met in 878–1294 ms;
  isolation guard confirms the backend DB lives inside the smoke dir).
- Profile-pollution proof: real profile byte-identical (1484 sessions,
  unchanged max `started_at`) across a full `pnpm smoke:screens` run.
- `pnpm smoke:preview-surface` (relaxed local floors) — PASS incl. the
  fallback-warning output guard.
- `pnpm smoke:preview-pump-diagnostics` — PASS (the watchdog does not mask
  injected mismatch diagnostics).
- Desktop unit tests 304/304 (incl. 10 first-frame ladder tests, 4
  backend-isolation tests); scripts suite 320/320; typecheck, lint, build green.
- `pnpm smoke:preview-scene-commit` — FAIL on this host both with and without
  the changes (`Layout preset screen-camera is disabled`; camera held by the
  user's live app). Environmental, pre-existing; not a regression.

## Manual verification (owner)

- [ ] Quit the currently-running dev app (its live compositor may still hold the
      smoke's test-pattern scene from before the fix) and relaunch `pnpm dev`.
- [ ] Preview shows the REAL scene natively at launch (badge "Native preview",
      no bars) within ~3s — or the waiting hint names a concrete blocked link.
- [ ] Layout switches, click/drag/close/reopen of the preview window keep
      frames advancing.
- [ ] Perceptual smoothness by eye on moving content (fps counters are blind to
      judder — see memory note).

## Known follow-ups (recorded in the vault plan)

- Watchdog is launch-scoped; extend the contract to mid-session stalls
  (helper-crash probe + auto re-arm after fallback).
- Stale-handoff (>250ms Metal target age) injection gate.
- Proof-path fps floor when fallback is legitimately declared.
- Optional cleanup: the user profile retains historical smoke session rows
  (cosmetic; deletable via the Library UI or left as-is).

Verdict: **PASS (automated)** — manual/perceptual boxes pending owner
confirmation after an app restart.
