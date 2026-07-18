# Plan 015: Prove real provider livestreaming end to end

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 0ea3c66c..HEAD -- docs/oauth-live-smoke.md docs/distribution.md scripts/smoke-provider-readiness.mjs scripts/smoke-oauth-app.mjs scripts/smoke-oauth-guards-app.mjs scripts/smoke-multistream-app.mjs apps/desktop/src/renderer/src/components/tabs/streaming-tab.tsx apps/desktop/src/renderer/src/hooks/use-studio.tsx crates/videorc-backend/src/youtube.rs crates/videorc-backend/src/twitch.rs crates/videorc-backend/src/x_live.rs`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code before proceeding. On mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 006, 009, and 012
- **Category**: tests, direction, docs
- **Planned at**: commit `0ea3c66c`, 2026-06-13
- **Execution**: IN PROGRESS - Steps 1 and 2 landed on 2026-06-13.
  Provider assumptions are refreshed, and readiness evidence now reports
  credential source, required env var names, callback coverage, account flags,
  X native access, and run context without printing values. Packaged readiness
  and live tests remain blocked on Plans 006/012 and production provider
  credentials/accounts.

## Why this matters

Local RTMP smokes prove the fan-out machinery, but premium livestreaming is not
real until YouTube, Twitch, and any supported X path work with production
credentials in a packaged app. The current docs already say provider acceptance
requires external checks that local mocks cannot prove. This plan turns that
runbook into a repeatable release gate with redacted evidence and clear external
blockers.

## Current state

Relevant files:

- `docs/oauth-live-smoke.md` - provider runbook.
- `scripts/smoke-provider-readiness.mjs` - redacted readiness check.
- `scripts/smoke-multistream-app.mjs` - local RTMP fan-out proof.
- `apps/desktop/src/renderer/src/components/tabs/streaming-tab.tsx` - provider
  UI and runtime failure banner.
- `apps/desktop/src/renderer/src/hooks/use-studio.tsx` - Go Live preparation.
- `crates/videorc-backend/src/youtube.rs`, `twitch.rs`, `x_live.rs` - provider
  backend paths.

The runbook says local gates come first:

```md
<!-- docs/oauth-live-smoke.md:9 -->
pnpm smoke:local-gates
```

Provider readiness can be strict for release candidates:

```md
<!-- docs/oauth-live-smoke.md:42 -->
pnpm smoke:provider-readiness:strict
```

The Streaming tab already displays live destination failures:

```ts
// apps/desktop/src/renderer/src/components/tabs/streaming-tab.tsx:144
const problems = streamTargets.filter(
  (runtime) => runtime.state === 'failed' || runtime.state === 'not-configured'
)
```

Go Live preparation already handles partial provider setup:

```ts
// apps/desktop/src/renderer/src/hooks/use-studio.tsx:3584
const setup = await prepareOauthTargetsForGoLive()
if (setup.failures.length) {
```

Repo conventions:

- Redact stream keys, OAuth tokens, and client secrets.
- Do not silently treat X native live as ready by falling back to manual RTMP.
- Healthy streaming legs must continue when one destination fails.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Local gates | `pnpm smoke:local-gates` | exits 0 |
| Provider readiness | `pnpm smoke:provider-readiness:strict` | exits 0 with release credentials |
| OAuth smoke | `pnpm smoke:oauth` | exits 0 |
| OAuth guards | `pnpm smoke:oauth-guards` | exits 0 |
| Local multistream | `pnpm smoke:multistream` | exits 0 |
| Packaged bundled | `pnpm smoke:packaged:bundled` | exits 0 |

## Scope

**In scope**:

- readiness/evidence scripts
- provider runbook docs
- small provider status/UI fixes needed to make evidence honest
- dated provider acceptance note under `docs/acceptance/`

**Out of scope**:

- Building new provider APIs not already represented in the app.
- Hiding or bypassing provider eligibility limits.
- Storing provider secrets beyond Plan 009's model.
- Changing the media path. Plan 006 owns stream media quality.

## Git workflow

- Branch: `codex/015-real-provider-livestream`
- Commit style: readiness/evidence, provider status fixes, docs.
- Do not push unless instructed.

## Steps

### Step 1: Refresh provider-doc assumptions

Before touching code, verify current provider docs for YouTube, Twitch, and X
live requirements. Update `docs/oauth-live-smoke.md` only with stable facts and
the date checked. Do not paste secrets or private account details.

**Verify**: docs include the latest check date and no secret values.

### Step 2: Make readiness evidence release-grade

Extend `scripts/smoke-provider-readiness.mjs` if needed so the markdown output
includes, redacted:

- credential source per provider: bundled, environment, missing
- required env var names, not values
- account readiness flags
- callback URL coverage
- X native live access status
- packaged vs dev run context

**Verify**:

```sh
pnpm smoke:provider-readiness
pnpm smoke:provider-readiness:evidence
```

Both must avoid printing credential values.

### Step 3: Run packaged provider readiness

With a release candidate from Plan 012 and credentials from the release
environment, run:

```sh
pnpm smoke:packaged:bundled
pnpm smoke:provider-readiness:strict
```

Expected:

- packaged backend starts
- OAuth client IDs are bundled or intentionally supplied by env
- Twitch runtime client secret status is ready if Twitch is in release scope
- X native is either ready with evidence or explicitly blocked

### Step 4: Execute provider live tests

Follow `docs/oauth-live-smoke.md` for:

- YouTube OAuth, broadcast metadata, ingest, live transition, stop/complete
- Twitch OAuth, category/title/language update, ingest, stop
- X native live if and only if partner/API access is validated
- manual RTMP custom destination as fallback/manual path, not as fake X native

Record final URLs or broadcast IDs, not secrets.

**Verify**: create a dated note under `docs/acceptance/` with pass/fail/blocker
per provider.

### Step 5: Feed failures back into product state

If a provider fails for a code reason, add the smallest status/UI/backend fix
needed to make the failure explicit. Examples:

- missing credentials -> provider readiness blocked
- token expired -> reconnect required
- platform setup failed -> partial Go Live prompt
- X unavailable -> manual RTMP only, native blocked

Do not add broad new provider capabilities in this plan.

**Verify**:

```sh
pnpm smoke:oauth
pnpm smoke:oauth-guards
pnpm smoke:multistream
pnpm smoke:provider-readiness
```

## Test plan

- Local smokes: OAuth, OAuth guards, multistream, provider readiness.
- Packaged smoke: bundled FFmpeg/backend.
- Manual live tests: YouTube, Twitch, X if eligible.
- Evidence note with screenshots/log paths redacted.

## Done criteria

- [x] Provider-doc assumptions are refreshed with a date.
- [x] Readiness evidence is redacted and release-grade.
- [ ] Packaged release candidate passes provider readiness or records exact
      blockers.
- [ ] YouTube and Twitch live tests pass or have explicit non-code blockers.
- [ ] X native live is either proven or explicitly blocked without fallback
      pretending.
- [ ] Local OAuth/multistream smokes remain green.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Production provider credentials/accounts are unavailable.
- A provider changes API requirements in a way that needs a new design.
- Any evidence would reveal a stream key, OAuth token, or client secret.
- Stream quality failure points back to Plan 006 or Plan 014.

## Maintenance notes

Provider acceptance is partly external. A blocked result is acceptable only when
the app surfaces that blocker honestly and manual RTMP remains clearly manual.
