# Caption carry-over fix — acceptance (2026-07-04)

Bug: every new video with captions contained captions from the previous
video. Root cause + plan: vault
`plans/planned/2026-07-04 - Videorc Caption Carry-Over Fix Plan.md`.
Commits: `f4eb49a4` (C1 renderer per-session caption state) → `c65d88d1`
(C2 backend session-boundary guards).

## Root cause (one paragraph)

The live burn bar is renderer-driven: the driver pushes the newest
`captionLines` entry to `captions.overlay.set`. Session stop cleared the
overlay and the pushed-key, but `captionLines` survived (the caption session
and its `sessionClientId` outlive recordings) — so at the next session start
the driver saw the previous video's last line with a fresh null key and
re-pushed it, burning it into the new video until fresh speech replaced it.
Two auxiliary holes: late chunk-upload transcripts of previous-video audio
were still announced as `captions.update` (the capture-epoch filter guards
only the .srt/burn chunk buffer), and the app-global backend overlay slot was
never cleared at `start_session` (the renderer's stop-time clear is
fire-and-forget).

## The fix

- C1 (renderer): capture-session rising edge clears the strip/window buffer
  and records a **session floor** (last seq at the boundary); lines at or
  below the floor are never ingested or pushed. Overlay decision extracted to
  pure `decideOverlayPush` (captions-ui.ts) with a two-consecutive-sessions
  regression test.
- C2 (backend): `start_session` clears the caption overlay slot
  (authoritative boundary); the chunked uploader suppresses `captions.update`
  for chunks whose capture epoch is no longer current (the record still
  reaches the drain filter for correct attribution).
- Deliberately skipped (plan slice 3): `captureEpoch` in the update payload
  (redundant — the backend now suppresses stale updates itself) and per-epoch
  seq reset (would break the floor's monotonic-seq assumption).

## Automated results (2026-07-04)

| Gate                                                                                                                                                                                                                            | Result |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `pnpm --filter @videorc/desktop test` (383 tests; new floor + decideOverlayPush suites incl. the carry-over regression)                                                                                                         | PASS   |
| `pnpm typecheck`, `pnpm lint`, prettier on touched files                                                                                                                                                                        | PASS   |
| `cargo test -p videorc-backend` (702 tests), `cargo fmt --check`, `cargo clippy -D warnings`                                                                                                                                    | PASS   |
| `pnpm test:scripts` (342; incl. the recording-studio gate-plan test)                                                                                                                                                            | PASS   |
| `pnpm smoke:recording-studio` — full bundle (dev/screens recording, all preview smokes, lifecycle + docked-stick probe, surface reattach, real ScreenCaptureKit recording, notes invisibility) → `recording-studio-gates: PASS` | PASS   |

Note: the caption changes touch the recording output path (overlay leg), so
this bundle is the right gate; captions have no dedicated smoke. A stale
gate-plan assertion (`recording-studio-gates.test.mjs`, unrelated to captions
— it lagged the 0.9.4 docked-probe fold) surfaced during this run and was
fixed in `6bbe0505`; a flaky docked-probe scroll step was de-raced in
`7896f04f`.

## Owner by-eye checklist (pending)

With captions ON and burnTarget=Recording (then once with Both while
streaming):

1. Record video A and speak; stop.
2. Record video B and stay SILENT for the first ~15 seconds.
   - The live bar, Captions strip, and detached Captions window must show
     NOTHING until you speak in video B.
   - Video B's burned "(captioned)" copy must contain no caption before your
     first video-B words; its .srt must not contain video-A text.
3. Speak in video B — captions appear normally; stop and verify the burned
   copy + .srt contain only video-B lines at correct times.
4. Repeat A→B quickly (stop A, start B within ~2s) to exercise the
   late-upload suppression path.

Sign-off: _pending owner pass_
