# Plan 030: X native playback verification + source health

> **Executor instructions**: This plan hardens the native X Livestream path
> against the failure observed on 2026-07-08: the whole Videorc pipeline
> worked (OAuth, prepare, create, publish, tweet, RTMP push at 6 Mbps for
> 108 s, END), X reported the broadcast `RUNNING` with a viewer attached —
> and that viewer saw an infinite spinner. Videorc gave the broadcaster no
> signal that anything was wrong.
>
> We cannot fix X's transcoder. What we CAN do: **wait for playback to be
> real before announcing the broadcast**, **detect unwatchable broadcasts
> within seconds and say so**, **track source health**, and **make every X
> lifecycle step observable** so the next support bundle answers these
> questions on its own.
>
> **Incident evidence (signed X API reads, 2026-07-08) — read carefully,
> an earlier theory was falsified**:
> - Source `pb3wpieksw1x` ("Videorc Primary Encoder", eu-west-3) was created
>   BY VIDEORC'S API at 08:39:51Z, at the start of a 6m52s session whose
>   broadcast (`1DGleeNQBpVJL`) was **watchable**: 19 concurrent / 117 total
>   viewers arrived via the announce post, `available_for_replay: true`.
> - The SAME source, SAME broadcast parameters, SAME encoder output and
>   media code path at 10:20:00Z produced broadcast `1RJjppqYzvoKw`:
>   `RUNNING` for 108 s, 1 viewer who saw only a spinner,
>   `available_for_replay: false`, internal `version` 16 (vs 49 on the good
>   one). A retry shortly after behaved the same. The source's
>   `stream_attributes` later measured all zeros.
> - **Falsified**: "the API-created source is broken" — the working session
>   created and used that very source. **Do not** retire sources on a
>   single bad probe; the working source would have been wrongly executed.
> - **Leading hypothesis**: X's playback/transcode provisioning can take
>   minutes (or fail) after publish; the working broadcast ran ~7 minutes,
>   the broken ones under 2. Whether the good broadcast's early viewers
>   also spun is unknown — nobody was measuring. The probe below measures.
> - `available_for_replay` is an OUTCOME (X transcoded something), not a
>   request parameter. Do not chase a "replay flag".
>
> **Drift check (run first)**: `git status --short --branch`; inspect
> `crates/videorc-backend/src/x_live.rs`, `src/x_oauth1.rs`, `src/main.rs`
> (x handlers ~line 1690+), `src/live_chat.rs`,
> `apps/desktop/src/renderer/src/hooks/use-studio.tsx`
> (`activatePreparedXBroadcasts`, `prepareOauthTargetsForGoLive`),
> `apps/desktop/src/renderer/src/components/tabs/streaming-tab.tsx`, and
> `docs/live-chat-live-smoke-checklist.md`. Baseline commit `eef5cb0c`.

## Status

- **Priority**: P0 — native X live ships in 0.9.20 and can silently stream
  to nobody; the flagship partnership feature looks broken to affected
  users. Target release: **0.9.21**.
- **Effort**: M-L.
- **Risk**: MEDIUM — publish-flow change (pre-publish playback wait) plus
  new X API calls; needs the recording-studio gates.
- **Depends on**: Plans 028/029 (shipped in 0.9.20). Plan 026 (A/V desync)
  is INDEPENDENT — do not conflate; desync exists even on watchable
  broadcasts.
- **Category**: provider integration, diagnostics, go-live UX.
- **Planned at**: commit `eef5cb0c`, 2026-07-08; evidence corrected same
  day after the source theory was falsified.

## Goal

A Videorc user going live on X either (a) has playback verified before or
shortly after the announce post goes out, or (b) is told loudly,
in-session, that viewers cannot see them yet — with objective
time-to-playable numbers recorded per session. Every X lifecycle step lands
in the session log and support bundle.

## Non-goals

- Fixing X-side provisioning (partner-manager escalation is an owner
  action, fed by the timing evidence this plan produces).
- Same-session automatic re-publish onto a new source.
- Plan 026's encoder-bridge timeline fix.

## Slices

### S1 — X lifecycle events in session logs (observability foundation)

The 10:20Z incident bundle contained ZERO X lifecycle information: the
backend logs nothing for prepare/create/publish/end, and FFmpeg progress
lines (logged at `warn`) flushed the 200-entry ring buffer in ~60 s.

- Backend: emit session log entries (the store the bundle exports per
  session) for every X lifecycle step, success AND failure:
  `x-source-prepared` (source id, region, reused-vs-created-vs-adopted),
  `x-broadcast-created`, `x-broadcast-published` (share URL, tweet
  outcome), `x-playback-*` (S2), `x-broadcast-ended`, and `x-*-failed`
  with the API error detail. `streamTargets.x.publish` gains an optional
  `sessionId` param (the renderer already has it when activating).
  Prepare runs before a session exists — log it to the global log.
- Demote FFmpeg progress/stat lines (`frame=`, `bitrate=`, `out_time=`,
  `speed=`, `progress=`, `dup_frames=`, `total_size=`, `stream_*_q=`,
  `fps=`…) to `debug` tracing only; real FFmpeg warnings/errors keep
  `warn`. The ring buffer must survive a 2-hour session with its useful
  content intact.

**Done when**: a record+stream X session's support bundle shows the full X
lifecycle in `sessions[].sessionLogs`, and a 5-minute session no longer
evicts non-FFmpeg entries from `logs`.

### S2 — Playback verification: publish-gate + continuous probe (the fix)

The Create Broadcast response includes `video_access.hls_url` — playback
URLs exist BEFORE publish. A transcoding broadcast serves an HLS playlist
with media segments; the broken ones serve nothing usable, which is exactly
what viewers' spinners meant.

- Capture `video_access` from the create-broadcast response
  (`XBroadcastEnvelope` currently drops it); carry `hls_url` through
  `XPublishResult`.
- Probe primitive in `x_live.rs`: fetch the playlist (text only, no media
  download); follow one level from a master playlist (`#EXT-X-STREAM-INF`)
  to a media playlist; "playable" = at least one `#EXTINF` segment.
- **Pre-publish gate**: after create + before the PUBLISH state call, probe
  for up to ~45 s (every ~5 s). If playable → publish (the announce post
  goes out pointing at working video). If not playable in the window →
  publish anyway (do not deadlock if X only provisions on publish) and
  remember `playableBeforePublish: false`.
- **Post-publish watch**: main.rs spawns a bounded task that keeps probing
  (every ~5 s, up to 5 min or session end) and emits:
  - first success → `x-playback-verified` session log + renderer event:
    "Viewers can watch your X broadcast." with time-to-playable ms;
  - not playable 90 s after publish → `x-playback-pending` WARNING
    ("X is still provisioning playback — viewers may see a loading
    spinner. Keep streaming; this can take a few minutes.") — keep
    probing;
  - never playable by task end → `x-playback-unavailable` ERROR ("X never
    produced playback for this broadcast — viewers saw a spinner. Your
    local recording is unaffected."), feeds S3 health.
- Record `xPlaybackVerified`, `xPlaybackMsAfterPublish`,
  `xPlayableBeforePublish` in session `finalDiagnostics`.
- Probe aborts cleanly when the session stops first; END still runs.

**Done when**: unit tests cover playlist parsing and verdicts against stub
HLS servers (master+media happy path, empty playlist, 4xx, master-only);
publish flow tests cover playable-before-publish and
not-playable-then-publish-anyway; a stub-backed session shows the session
log sequence created → published → playback-verified.

### S3 — Source health tracking + selection (softened)

`prepare_x_stream_source` trusts name+region match or creates a source, and
stores only the stream key. Health must be tracked, but the incident proved
a source can work one hour and not the next — so retirement is
conservative.

- Persist per-source playback outcomes keyed by source id (small JSON blob
  in the existing settings/kv store is fine): last verified at, consecutive
  failed sessions.
- S2 feeds it: verified resets the counter; `x-playback-unavailable`
  increments it. A source is retired only at **2+ consecutive** failed
  sessions.
- Selection ladder in prepare: 1) env override
  (`VIDEORC_X_LIVESTREAM_SOURCE_ID`); 2) non-retired name+region match
  (today's behavior); 3) any non-retired source in the region whose X-side
  `stream_attributes` show a real prior stream (nonzero `video_bitrate`) —
  adopts healthy Producer-created sources; 4) create fresh. Retired sources
  are skipped and deleted best-effort (`DELETE /sources/:id`, never while
  bound to an active broadcast), logged as `x-source-retired`.
- Surface X's `compatibility_info` errors/warnings for the chosen source in
  the session log once ingest is active (the `is_stream_active` poll
  already fetches the source — reuse the response).

**Done when**: unit tests cover the ladder (env, name-match, adopt-healthy,
create, retired-skip+delete) and the 2-strike retirement with injected
health state.

### S4 — In-session UX

- Streaming tab X target row while live: show the share URL (click to
  open) once published; playback states from S2 map to the row — verified
  (success tone), pending (warning + plain-language copy), unavailable
  (error tone). shadcn only; follow
  `.claude/skills/videorc-design/SKILL.md`.
- Keep toasts for state transitions (verified once; pending once;
  unavailable once) — no toast spam from repeated probes.

**Done when**: desktop unit tests cover the status mapping; by-eye on a
stub-backed session shows the chip + transitions.

### S5 — Owner acceptance: the long-session measurement (external)

1. On 0.9.21, run a **long** real X session (8–10 min), second account
   watching from t=0. The probe now reports exact time-to-playable in the
   session log; compare with what the viewer sees.
2. Expected outcomes:
   - playback verifies in ≤ ~2 min → provisioning is just slow; the
     publish-gate + pending copy already cover the UX, done;
   - a 10-minute broadcast never verifies → X-side fault; send the partner
     manager the evidence pack (source ids, broadcast ids `1DGleeNQBpVJL`
     good vs `1RJjppqYzvoKw` bad, timestamps, probe timings, the
     zeros-vs-healthy `stream_attributes` contrast).
3. Close plan 026's real-stream A/V check on the same session if watchable.

## Verification

- `cargo fmt --check --all`, `cargo clippy -p videorc-backend -- -D warnings`,
  `cargo test -p videorc-backend` (new: probe verdicts, publish gate,
  selection ladder, retirement, lifecycle logging, ffmpeg log filter).
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter @videorc/desktop test`.
- Recording-studio gate: `pnpm smoke:recording-studio` (go-live path
  touched); `pnpm smoke:oauth-guards` (X capability/preflight shapes).
- Support-bundle proof: bundle after a stub-backed X session contains the
  lifecycle + playback entries.
- Live acceptance: S5 — the only test that proves the outcome this plan
  exists for.

## Open questions (do not block S1–S4)

- Does X start transcoding at CREATE or only at PUBLISH? The pre-publish
  gate answers this empirically on the first S5 run (if playable before
  publish ever fires, it's CREATE).
- Why did `pb3wpieksw1x` report a 960x540/800 kbps
  `recommended_configuration` while the account's other sources get
  1280x720/4 Mbps? Partner-manager question, cosmetic for now.
