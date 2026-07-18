# Plan 013: Close OBS parity acceptance with evidence and triage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 0ea3c66c..HEAD -- docs/obs-acceptance-checklist.md docs/acceptance/2026-06-07-obs-parity-acceptance.md scripts/obs-side-by-side-acceptance.mjs scripts/lib/visual-parity.mjs scripts/lib/preview-recording-parity.mjs package.json`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code before proceeding. On mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: Plan 006
- **Category**: tests, docs, direction
- **Planned at**: commit `0ea3c66c`, 2026-06-13
- **Current status**: IN PROGRESS, 2026-06-13. Step 1 landed: the OBS
  side-by-side harness writes `obs-side-by-side-manifest.json` with Videorc
  commit, command, requested output settings, OBS scene/settings summary, output
  directory, and launch-only/no-mutation automation status. Step 2 template
  landed at `docs/acceptance/obs-parity-acceptance-template.md`. Automated
  media gates and human OBS visual evidence remain pending.

## Why this matters

The app can pass many automated media gates, but the product promise is
OBS-class smoothness. The current acceptance note explicitly says the human OBS
side-by-side visual pass is still pending. This plan turns that human-only pass
into a repeatable evidence flow and a fail-fast triage decision, so "looks like
crap" becomes a concrete owner instead of another vague media panic.

## Current state

Relevant files:

- `docs/obs-acceptance-checklist.md` - final acceptance criteria.
- `docs/acceptance/2026-06-07-obs-parity-acceptance.md` - current evidence note.
- `scripts/obs-side-by-side-acceptance.mjs` - manual harness.
- `scripts/lib/visual-parity.mjs` and `preview-recording-parity.mjs` - pure
  evidence helpers.

The current evidence note is not closed:

```md
<!-- docs/acceptance/2026-06-07-obs-parity-acceptance.md:3 -->
The automated half is now covered by real-source recordings and strict
analyzers. The human OBS side-by-side visual pass is still pending.
```

The pending checklist is visual and human-owned:

```md
<!-- docs/acceptance/2026-06-07-obs-parity-acceptance.md:100 -->
- [ ] Preview sharpness: screen text is as readable in Videorc preview as in OBS.
- [ ] Preview hand latency: fast hand motion stays current, with no rubber-banding.
- [ ] Screen scroll smoothness: fast page scrolling has no visible stutter versus OBS.
```

The acceptance decision is currently blocked on that human judgment:

```md
<!-- docs/acceptance/2026-06-07-obs-parity-acceptance.md:117 -->
- Automated acceptance: PASS for supported selected sources.
- Manual acceptance: PENDING human OBS side-by-side.
- Overall OBS parity signoff: PENDING manual visual/currentness acceptance.
```

Repo conventions:

- Automated gates measure the real recorded artifact and live diagnostics.
- Manual OBS comparison is allowed to be human-only; do not fake it with weak
  automation.
- If acceptance fails, record the owner and next plan instead of burying the
  result.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Script tests | `pnpm test:scripts` | all pass |
| OBS harness motion | `pnpm acceptance:obs-side-by-side -- --stimulus=motion` | harness starts and prints checklist |
| OBS harness A/V | `pnpm acceptance:obs-side-by-side -- --stimulus=av-sync` | harness starts and prints checklist |
| 4K gate | `pnpm baseline:real-source:4k30 -- --gate` | exits 0 on local macOS with permissions |
| Stream gate | `pnpm baseline:stream:av-sync -- --gate` | exits 0 after Plan 006 |

## Scope

**In scope**:

- `scripts/obs-side-by-side-acceptance.mjs`
- `docs/obs-acceptance-checklist.md`
- new dated acceptance note under `docs/acceptance/`
- package script aliases only if they make the flow easier

**Out of scope**:

- Fixing media quality failures discovered by the pass.
- Changing OBS settings automatically.
- Adding OBS websocket as a dependency.
- Changing Plan 006 split-output behavior.

## Git workflow

- Branch: `codex/013-obs-parity-acceptance`
- Commit style: harness/report template first, evidence note second.
- Do not push unless instructed.

## Steps

### Step 1: Make the harness record comparable settings

Extend the OBS side-by-side harness so it prints and writes a small evidence
manifest with:

- Videorc commit, app mode, and command used
- selected stimulus
- requested Videorc width/height/fps/bitrate
- OBS path if detected
- OBS scene name if detected by existing local inspection
- whether OBS automation was used or intentionally unavailable
- output directory for screenshots/notes

Do not mutate OBS settings. If OBS settings cannot be read, write
`obsSettings: "manual-match-required"` and print the exact manual instruction.

**Verify**: run the harness with `--launch-obs=false --launch-videorc=false`
and confirm it writes the manifest without launching apps.

### Step 2: Add an acceptance-note template

Add a template section to `docs/obs-acceptance-checklist.md` or create a helper
that writes `docs/acceptance/YYYY-MM-DD-obs-parity-acceptance.md`.

The template must include:

- automated gate command results
- manual checklist with pass/fail/notes per item
- exact source setup
- OBS output settings
- Videorc output settings
- link/path to representative recordings
- final verdict: PASS, FAIL, or BLOCKED
- if FAIL: owner bucket and next plan number

**Verify**: generated note contains no absolute paths to secrets or app data
except allowed evidence file paths.

### Step 3: Run automated gates first

Run the strongest available media gates after Plan 006:

```sh
pnpm baseline:real-source:4k30 -- --gate
pnpm baseline:real-source:4k30:av-sync -- --gate
pnpm baseline:stream:av-sync -- --gate
```

Expected:

- native preview evidence uses CAMetalLayer
- raw copied frames are zero
- 4K local recording passes
- record+stream evidence proves 4K record plus 1080p stream split output
- A/V sync is within target

If local device permission blocks a run, record the exact blocker and evidence
path, then stop if the blocked run is required for the verdict.

### Step 4: Run the human OBS side-by-side pass

With the operator present, run:

```sh
pnpm acceptance:obs-side-by-side -- --stimulus=motion
pnpm acceptance:obs-side-by-side -- --stimulus=av-sync
```

The operator must match OBS and Videorc output settings before judging.

Record PASS/FAIL for each visual item. If an item fails, assign one owner:

- preview currentness/latency -> native preview/compositor
- final recording stutter -> encoder bridge/compositor
- stream-only lag -> split-output/RTMP path
- mouth/voice lag -> Plan 014 audio calibration
- source selection/control issue -> Plan 007 orchestration

**Verify**: a dated acceptance note is filled with the verdict.

### Step 5: Update the acceptance checklist

If PASS, mark OBS parity accepted in the new dated note and update the main
checklist's current status. If FAIL/BLOCKED, do not soften the result. Add the
owner bucket and the next plan to execute.

**Verify**: `pnpm format:check` and `pnpm test:scripts` exit 0.

## Test plan

- `pnpm test:scripts`
- harness dry-run with no OBS/Videorc launch
- full manual OBS side-by-side with motion stimulus
- full manual OBS side-by-side with A/V stimulus

## Done criteria

- [x] OBS side-by-side harness writes a comparable-settings manifest.
- [ ] Dated acceptance note exists with automated and manual evidence.
- [ ] Every manual checklist item has PASS/FAIL/BLOCKED plus notes.
- [ ] Overall OBS parity verdict is explicit.
- [ ] Failed items map to a concrete owner plan.
- [ ] `pnpm test:scripts` and `pnpm format:check` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Plan 006 has not landed and record+stream split output is required for the
  current verdict.
- The operator is not available for the human visual pass.
- OBS and Videorc cannot be configured to comparable output settings.
- The harness would need to mutate OBS settings or force-quit OBS to create
  evidence.

## Maintenance notes

Keep this as an acceptance plan, not a fix plan. A failed acceptance run is good
evidence if it points cleanly to the next engineering slice.
