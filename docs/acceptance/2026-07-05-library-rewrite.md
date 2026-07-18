# Acceptance — Library rewrite (L1–L6)

Date: 2026-07-05
Slices: L1 (data foundation) → L2 (posters) → L4 (table UI) → L3 (session ops)
→ L5 (Publish alignment) → L6 (gates). Commits on `main`:
73aab403 (L1), dde654d9 (L2), ae82ee4e (L4), 95a94fc6 (L3), 379e393f (L5),
plus the L6 gates commit.

## What shipped

- **Library tab is a recordings manager**: a table of every session — poster,
  name + date, scene chip, quality status, duration, real file size, format —
  with filter (All/Recordings/Streams), newest/oldest sort, title search, an
  Import button, and an honest storage footer (real recording totals + real
  free disk space, no invented quota).
- **Posters**: one 320px JPEG per session, extracted at finalize and lazily
  backfilled on demand (idle-aware via the ffmpeg maintenance permit), served
  over the backend's token-authenticated HTTP server
  (`/sessions/{id}/poster?token=`).
- **Session ops**: Rename (dialog, 1–120 chars), Duplicate (" (copy)" file +
  cloned row), Delete (single + bulk via the selection bar) and Import
  (mp4/mov/m4v/mkv/webm managed copy with probed duration + poster).
- **Delete = Trash, never unlink**: the renderer moves files to the system
  Trash first; only sessions whose files trashed cleanly lose their rows. The
  backend never unlinks a recording — asserted by the new smoke.
- **Publish alignment**: the Publish session rail reuses the Library's
  posters + scene labels so both surfaces read as one system.
- All pre-existing row actions preserved: Play, Open in Publish, Show in
  Finder, Export MP4, Open Comments, Check quality, Repair, Restore.

## Gates run (2026-07-05)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` / `pnpm lint` | PASS (per slice) |
| `pnpm --filter @videorc/desktop test` | PASS — 416 tests / 51 files |
| `cargo test -p videorc-backend` | PASS — 715 tests (L3) |
| `cargo clippy -p videorc-backend -- -D warnings` + `cargo fmt --check` | PASS |
| `pnpm smoke:session-ops` (NEW) | PASS — import→rename→duplicate→storage→delete over the real WS; files untouched by delete |
| `pnpm smoke:dev` (now with poster assert) | PASS — 2442-byte JPEG served after finalize |
| `pnpm smoke:recording-studio` | see checklist below |

New smoke: `scripts/smoke-session-ops.mjs` (`pnpm smoke:session-ops`, also in
`smoke:local-gates`) — spawns the debug backend with an isolated
`VIDEORC_DATABASE_PATH` and drives the session-ops RPCs end to end. The shared
recording smoke (`scripts/smoke-recording-session.mjs`) now asserts a servable
poster JPEG after finalize, which runs inside `smoke:dev` and the packaged
smoke.

## Owner by-eye checklist (pending)

- [ ] Real library: posters backfill as rows scroll into view; no fan spin at
      tab open (backfill is one lazy attempt per visible row).
- [ ] Sizes and the storage footer match Finder's numbers.
- [ ] Rename, Duplicate, Delete — confirm the deleted files are IN THE TRASH.
- [ ] Import a foreign MP4; row appears with duration + poster.
- [ ] Search/filter/sort; quality badge tooltip reads correctly.
- [ ] "Open in Publish" lands with the session preselected; rail shows the
      same poster + scene chip as the table.
