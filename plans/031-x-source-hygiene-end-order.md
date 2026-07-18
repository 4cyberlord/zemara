# Plan 031: X source hygiene — fresh source per session, END before encoder stop

> **Executor instructions**: This plan operationalizes the owner's correction
> to plan 030's theory. The working broadcast (`1DGleeNQBpVJL`, 2026-07-08
> 08:39Z) was watchable **from the first second** — so X playback
> provisioning is NOT slow on clean state, and duration was never the causal
> variable. The real discriminator across all evidence: the working broadcast
> was the **first ever stream on a freshly created source**; all three
> spinner broadcasts **reused** that source after Videorc's teardown had
> dirtied it.
>
> **The our-side defects found**:
> 1. **Teardown order violates X's documented lifecycle.** X's docs (End
>    section): "After ending, stop your encoder." Videorc did the opposite —
>    `session.stop` first (killing FFmpeg), THEN `streamTargets.x.end`. X
>    saw the encoder die mid-RUNNING like a crash, then a posthumous END on
>    a feedless broadcast.
> 2. **The kill is hard.** Session logs show every record+stream session
>    ended `quit → 3s → SIGTERM → 3s → SIGKILL` — the tee/fifo RTMP leg
>    never got to close the connection; X's edge got a dead socket, not an
>    RTMP-level goodbye.
> 3. **Source reuse after dirty teardown.** Broadcasts created on the reused
>    source went RUNNING (control plane fine) but X measured their
>    `stream_attributes` as all zeros and never provisioned playback — the
>    ingest bytes were seemingly never attributed to the new broadcast.
>
> Fix: make every session look like the first one, and stop dirtying
> sources. The plan-030 probe (shipped in 0.9.21) is the measurement layer
> that proves whether this works.
>
> **Drift check (run first)**: `git status --short --branch`; inspect
> `crates/videorc-backend/src/x_live.rs` (prepare selection),
> `crates/videorc-backend/src/recording.rs` (`stop_fallback`,
> `STOP_TERM_DELAY*`), `apps/desktop/src/renderer/src/hooks/use-studio.tsx`
> (`stopSession`, `endPreparedXBroadcasts`,
> `completePreparedPlatformBroadcasts`). Baseline commit `08b6380b`.

## Status

- **Priority**: P0 — follows the 0.9.21 spinner recurrence; targets 0.9.22.
- **Effort**: S-M.
- **Risk**: MEDIUM — touches session stop ordering and source lifecycle;
  needs the oauth-guards smoke and real-session acceptance.
- **Depends on**: Plan 030 (probe = measurement), plans 028/029.
- **Category**: provider integration, session lifecycle.
- **Planned at**: 2026-07-08, executed same session.

## Slices (all landed together)

### S1 — END before encoder stop (docs-order compliance)

`stopSession` now runs `endPreparedXBroadcasts` (bounded, 4 s per target)
BEFORE `session.stop`, so X receives END while the feed is still alive —
the documented lifecycle and what X Producer does. On END timeout the
target stays `live` and the existing post-stop cleanup pass retries; a
slow END can never hold the encoder stop hostage. The post-stop pass
receives the patched streaming settings so no broadcast is ENDed twice.
`streamTargets.x.end` now carries the sessionId for lifecycle logging.

### S2 — Fresh source per session

`prepare_x_stream_source` now CREATES a source every session (the only
condition that has ever produced instant playback), with:
- env override (`VIDEORC_X_LIVESTREAM_SOURCE_ID`) unchanged for smoke rigs;
- fallback to a non-retired name+region match only when create fails
  (e.g. per-user source quota), surfaced as `reused-name-match`;
- quota hygiene: after a successful create, idle Videorc-named sources
  from previous sessions and retired ids are deleted best-effort (never
  the fresh source, never one actively receiving, never foreign-named
  sources like Media Studio or StreamYard ones) — net source count stays
  flat.

### S3 — Graceful RTMP teardown

Sessions with a stream leg get a longer quit grace (`quit → 8s → SIGTERM
→ 5s → SIGKILL`, vs 3s/3s for record-only) so the tee/fifo leg can drain
and close the RTMP connection; `STOP_FINALIZE_TIMEOUT` raised 12s → 20s to
match. The user-forced double-stop path keeps the fast 3s escalation.
Success criterion: no more "sending SIGKILL" lines in record+stream
session logs.

## Acceptance (owner, on 0.9.22)

The theory predicts a fresh source plays like the first time. Run TWO
consecutive real X sessions (~2 min each is enough now):
1. Both should log `x-source-prepared … (Created)` with a NEW source id
   each time, and `x-playback-verified` within seconds (the 0.9.21 probe
   prints time-to-playable).
2. Session logs should show no SIGTERM/SIGKILL escalation on stop, and
   `x-broadcast-ended` BEFORE `recording-stop-requested`'s finalize.
3. If a fresh source still never verifies → the fresh-source theory is
   dead too; escalate to the X partner manager with the full evidence
   pack (plans 030+031 findings + probe timings).

## Verification

- `cargo fmt --check --all`, `cargo clippy -p videorc-backend -- -D warnings`,
  `cargo test -p videorc-backend` (new: source-cleanup reaping rules).
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm --filter @videorc/desktop test`.
- `pnpm smoke:oauth-guards`, `pnpm smoke:platform-lifecycle` (stop/lifecycle
  paths touched).
- Live acceptance above — the probe makes short sessions sufficient.
