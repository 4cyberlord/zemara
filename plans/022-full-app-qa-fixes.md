# Plan 022: Full-app QA fix list (2026-07-06 sweep)

> **Executor instructions**: Findings come from an external full-app QA pass
> (static gates, smokes, probes, and dark/light screenshot sweeps — the QA
> note's "Scope Tested" lists the exact commands). P0/Q0 is a shipped
> user-facing crash; fix it first and ship the prevention with it. Q1/Q2 are
> owner-dependent host/provisioning work — do the agent-side parts, mark the
> rest. All UI slices (Q3–Q7) require reading
> `.claude/skills/videorc-design/SKILL.md` first and re-running the
> screenshot sweep (`node scripts/ui-theme-screens.mjs studio sources layout
> streaming recording library settings`) for by-eye comparison.
>
> **Drift check (run first)**: `git status --short --branch`; inspect
> `apps/desktop/src/renderer/comments/main.tsx`,
> `apps/desktop/tsconfig.web.json`, and the toast/source-reconciliation path
> if changed since `057a6cf4` (2026-07-06). The repo root `README.md` has an
> unrelated owner modification — never stage or revert it here.

## Status

- **Priority**: P0 (Q0) / P1 (Q1, Q2) / P2 (Q3–Q6) / P3 (Q7, Q8)
- **Effort**: M overall (Q0 S, Q1 S agent-side, Q2 S agent-side, Q3 M,
  Q4 S, Q5 M, Q6 M, Q7 S, Q8 S)
- **Depends on**: owner for Q1 (macOS TCC grants on this host) and Q2
  (smoke provider accounts/credentials)
- **Category**: renderer crash, QA infrastructure, UI polish, theming
- **Planned at**: commit `057a6cf4`, 2026-07-06
- **Execution**: EXECUTED 2026-07-06 (Q0 `5dd94a30`, Q1/Q2 agent side
  `d3f7f292`, Q3 `c45798c4`, Q4 `a683d0e2`, Q5 `caeb40cd`, Q6 `06046bd5`,
  Q7 `f69cd283`+`34f308a1`, Q8 `2ce03900` on main). Notes:
  - Q0: no latent errors surfaced by the widened typecheck include; the
    gate hole is proven closed (removed import fails `pnpm typecheck`).
  - Q1 owner-side still pending: today's attempt discovered sources but
    was env-blocked (camera TCC missing for the dev target; screen live
    frames=0 on the in-use display). RC gate sequence documented in the
    runbook.
  - Q2 owner-side still pending (provider accounts); strict-flag docs +
    runbook step landed.
  - Q7 follow-up from the screenshot sweep: qualityName gained a 2K tier
    and recordingQuality stops doubling the height ("1440p · 1440p30" →
    "2K · 1440p30").
  - Screenshot sweeps re-run after Q5 and Q7; light theme, System Access
    rows, selects, and compact labels verified in the captures — owner
    by-eye still owed.

## Verified Root Causes (2026-07-06, current main)

- **Q0** — `apps/desktop/src/renderer/comments/main.tsx:43` calls
  `useRef(0)` but line 1 imports only `useEffect, useState` → runtime
  `useRef is not defined`, the reader error-boundaries into "Something
  broke in the interface", `messageCount: 0`. **Why gates missed it**:
  `tsconfig.web.json` includes only `src/renderer/src/**` — the
  `src/renderer/comments/` AND `src/renderer/captions/` entrypoints are
  never typechecked. `pnpm probe:comments-window` currently FAILS and is
  the regression gate.
- **Q8** — verified verbatim: Vite warns `comment-highlight.ts` is
  dynamically imported by `caption-overlay.ts` but statically imported by
  `use-studio.tsx`, so the dynamic import never splits a chunk.
- Q1–Q7 evidence is from the QA note (smoke output + screenshots in
  `/tmp/videorc-ui-*.png`, regenerable with the sweep command).

## Slices

### Q0 — Comments reader crash + the gate hole that let it ship (P0)

1. Add `useRef` to the react import in `comments/main.tsx`.
2. Widen `tsconfig.web.json` include to cover ALL renderer entrypoints
   (`src/renderer/**/*.ts{,x}` or add `comments/` + `captions/`
   explicitly). Fix any latent errors this surfaces in those dirs — they
   have never been typechecked.
3. Re-run: `pnpm probe:comments-window` (must PASS end-to-end incl. the
   pushed-transcript reader state), `node
   scripts/smoke-live-chat-fake-providers.mjs`, `pnpm typecheck`,
   `pnpm lint`, `pnpm --filter @videorc/desktop test`.

**Done when**: the probe passes with a rendered transcript
(`messageCount > 0`); a deliberately-missing import in `comments/` or
`captions/` now fails `pnpm typecheck` (prove once locally, don't commit
the probe change).

### Q1 — Make the real-device screen gate repeatable on this host (P1, owner-dependent)

Owner: in System Settings → Privacy & Security → Screen Recording,
grant/reset the exact targets the smoke prints (dev Electron and
`target/debug/videorc-backend`) — the QA run's discovery failure was
"user declined TCCs for application, window, display capture".

Agent, after the grant: run in order `pnpm smoke:screen-recording-real` →
`pnpm smoke:notes-window-invisible` → `pnpm smoke:recording-studio:devices`.
If the motion-stimulus signature (cyan/magenta/yellow/white/dark) is still
missing from the captured display, fix the stimulus itself: place/foreground
the stimulus window on the SELECTED display (respect
`VIDEORC_SCREEN_MOTION_*` bounds) rather than loosening the assertion —
the signature check is what makes the capture proof real.

**Done when**: all three pass on this host in one sitting, and the
sequence is noted in `docs/releases/release-runbook.md` as the
release-candidate device gate.

### Q2 — Provider live readiness: provision + enforce for RC QA (P1, owner-dependent)

Owner: create smoke-only YouTube (Live-enabled channel), Twitch
(broadcaster), and X credentials; register the fixed loopback callbacks;
store them in the local test env (NEVER in the repo).

Agent: document the full env-key list the readiness smoke expects in
`docs/oauth-live-smoke.md` (most exist — verify against
`scripts/lib/provider-readiness.mjs`), and add a release-runbook step: RC
QA runs with `VIDEORC_SMOKE_REQUIRE_PROVIDER_READY=1` so missing
prerequisites FAIL instead of advising.

**Done when**: readiness passes strict mode on a provisioned host, or the
runbook documents exactly what the owner must provision (with the strict
flag wired into the RC checklist) if provisioning is deferred.

### Q3 — Source-fallback toast: stop covering the app (P2, UI)

The reconciliation toast ("Capture source X is unavailable, so Videorc
selected Y") persists across tabs and sits on the bottom-right command
bar. Fix as a policy, not a nudge:

1. Collapse repeated source-reconciliation toasts into one (same
   source+fallback = update, don't stack) with a normal (≤10s) lifetime.
2. The durable truth moves to health surfaces: a Sources/Studio health row
   (the `mic-silent`/health-event pattern from plan 021 F3) that persists
   until the source is back or re-picked.
3. Toast placement must never cover the bottom command bar — move the
   toaster anchor or inset it above the bar.

**Done when**: screenshot sweep shows no toast over the command bar in any
tab; a forced fallback shows one toast + a persistent health row.

### Q4 — Settings System Access rows: stop truncating the one thing that matters (P2, UI)

Detail/target text clips to "Captur…", "C…", "Voice a…" — the permission
TARGET is the actionable part (see Q1's TCC confusion). Widen the detail
column or wrap the target text; if the compact layout stays, add
tooltips with the full target. Re-check dark + light screenshots.

**Done when**: every System Access row's target/source reads in full (or
via tooltip) at the default window size in both themes.

### Q5 — Light theme contrast pass (P2, UI, tokens only)

Sidebar labels, secondary text, disabled controls, and card borders are
too faint on pale glass (Sources/Library/Settings worst). Per the design
skill: fix TOKENS in `styles.css`, not components — darken light-mode
secondary/tertiary text and inactive nav, raise border/control contrast
(the skill's light column: secondary `#6E6E73`, hairline black-8% are the
floors — tune upward from there). Keep dark mode untouched.

**Done when**: light sweep screenshots read at a glance (owner by-eye);
no component-level style overrides added; dark screenshots pixel-stable.

### Q6 — Fresh-profile selects must never render blank (P2, UI + state)

Screen/Camera selects can show only a chevron while device discovery is
pending or permission-blocked. Render an explicit label for EVERY state:
loading ("Finding devices…"), none found, permission denied (with the
jump to Settings), unavailable-fallback, and selected. Add a component
test for the loading/denied/empty states (fresh-profile shape).

**Done when**: no select in Sources/Studio can render an empty surface in
any state; component test pins the state labels.

### Q7 — Compact control labels: canonical short forms (P3, UI)

Studio compact controls truncate mid-value ("2K - 2560 x 14…",
"No screen - …"). Give compact controls short canonical labels ("2K ·
1440p30") with the full value in the dropdown/tooltip. Shared formatter in
`lib/format.ts` + unit test, so Studio and inspectors agree.

**Done when**: compact controls show the distinguishing part of the value
at default widths; formatter unit-tested.

### Q8 — comment-highlight import strategy (P3)

`use-studio.tsx` imports it statically, `caption-overlay.ts` dynamically —
the split never happens. The module is small and Studio always loads it:
make BOTH imports static and delete the dead `import()` (or justify lazy
and invert both). Build must come out warning-free for this module.

**Done when**: `pnpm build` emits no mixed-import warning for
`comment-highlight.ts`.

## Verification

- Q0: `pnpm probe:comments-window`, live-chat fake-provider smoke,
  typecheck/lint/desktop tests.
- Q1: the three device smokes in order, on the granted host.
- Q2: readiness smoke with `VIDEORC_SMOKE_REQUIRE_PROVIDER_READY=1`.
- Q3–Q7: `pnpm typecheck && pnpm lint && pnpm format:check`, desktop
  tests, then the full screenshot sweep in BOTH themes + owner by-eye.
- Q8: `pnpm build` clean of the warning.
- Batch close: `pnpm smoke:local-gates`.

## Acceptance Criteria

- Detached comments window renders pushed transcripts; the entrypoint
  typecheck hole is closed for good.
- The real-device gate sequence passes on this host and is a documented
  RC step; provider readiness is strict for RC QA (or its provisioning is
  a documented owner checklist).
- No toast ever covers the command bar; source-fallback truth lives in a
  health row.
- Settings permission targets are readable; light theme scans without
  effort; selects always say what state they're in; compact labels keep
  the distinguishing value.
- `pnpm build` has no mixed-import warning.
