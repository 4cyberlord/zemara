# Multistreaming — M0 Audit (Phase M0)

Date: 2026-06-02

Scope: audit the current single-target streaming model and map it to the
per-target model before writing M1 code. Companion to
`plans/.../2026-06-02 - Videorc Multi Platform Streaming Plan.md`.

## Current single-target model (what exists today)

Streaming is a single RTMP destination end-to-end:

| Layer | Field(s) | Location |
| --- | --- | --- |
| Renderer config | `streamEnabled`, `rtmpPreset`, `rtmpServerUrl`, `streamKey` | `renderer/src/lib/capture.ts` (`CaptureConfig`) |
| Renderer defaults | `rtmpDefaults` (youtube/twitch server URLs) | `renderer/src/lib/capture.ts` |
| Renderer → backend | `output.streamEnabled`, `output.rtmp = { preset, serverUrl, streamKey }` | `hooks/use-studio.tsx` (`sessionParams`) |
| Backend protocol | `OutputSettings.stream_enabled`, `OutputSettings.rtmp: RtmpSettings { preset, server_url, stream_key }` | `crates/videorc-backend/src/protocol.rs` |
| Backend target | `build_stream_url(&params.output.rtmp) -> StreamTarget { url, redacted_url }` (one URL) | `recording.rs` |
| Backend output | `tee` with `[f=matroska:onfail=abort]<file> \| [f=flv:onfail=ignore:flvflags=no_duration_filesize]<url>` — MKV + **one** RTMP leg; stream-only is a single `flv` | `recording.rs` (`ffmpeg_args`) |
| Session metadata | `stream_preset` (preset name only) | `protocol.rs` (`SessionSummary`) |
| Platform special-case | `x-rtmp-access` health event when preset = X | `recording.rs` |

**The bug:** because there is exactly one `rtmpPreset`/`rtmpServerUrl`/`streamKey`,
switching platforms in the UI mutates the same fields — a YouTube key overwrites
the Twitch key. There is no per-platform storage anywhere in the stack.

## Mapping to the new per-target model

| Old (single) | New (per-target) |
| --- | --- |
| `streamEnabled` | `StreamingSettings.enabled` |
| `rtmpPreset` | identifies which `StreamTargetSettings` the legacy server/key belong to |
| `rtmpServerUrl` | the matching target's `serverUrl` |
| `streamKey` | the matching target's `streamKey` (transitional; → `streamKeySecretRef` in M1b) |
| — | `targets[]`: one built-in target per platform (YouTube, Twitch, X) + one Custom |
| — | per-target `enabled`, `status`, `streamKeyPresent`, `urlMode`, `authMode` |
| — | `enabledTargetIds`, `defaultOutputPreset`, `defaultBitrateKbps` |
| one `tee` RTMP leg | one FLV/RTMP `tee` leg **per enabled target** (M4) |

Migration rule (M1): the legacy key/server move **only** into the target whose
platform matches `rtmpPreset`. The other three targets stay empty, so the
overwrite can no longer happen.

## Multistream-safe output preset

Named preset for v1 three-platform streaming (per plan "Common-Safe Output Presets"):

- **`tutorial-1080p30`** already encodes the spec: H.264, 1920×1080, 30 FPS, **6000 kbps** video. Audio target is **128 kbps** AAC-LC (handled in the audio encode args).
- Justification: it is the strictest-common-denominator that all three platforms
  accept (notably Twitch's ~6000 kbps ceiling). All `tee` legs share one encode in
  v1, so the encode must satisfy the lowest common platform. `stream-1080p60`
  (9000 kbps) is **not** multistream-safe because it exceeds Twitch.
- The M1 model defaults `defaultOutputPreset = 'tutorial-1080p30'`,
  `defaultBitrateKbps = 6000`. A distinct "Multistream Safe" label can be added
  later; the values are already correct.

## FFmpeg tee syntax (from the working command, to extend in M4)

Reference: <https://ffmpeg.org/ffmpeg-formats.html#tee> (re-verify `onfail`,
`use_fifo`, and slave-URL escaping before M4).

- Slave outputs are separated by `|`.
- Per-output options go in `[key=value:key=value]` immediately before the URL/path.
- `onfail=abort` kills the session if that leg fails; `onfail=ignore` keeps the
  session alive. v1: local MKV = `abort`, every remote RTMP leg = `ignore`.
- Special characters in slave URLs (notably `|`, `[`, `]`, `:`, `\`) must be
  backslash-escaped inside the tee output string. Stream keys often contain `?`,
  `&`, `-` (safe) but YouTube/X full URLs can contain reserved chars — M4 must
  escape each leg.

M4 target shape:
`[f=matroska:onfail=abort]<file> | [f=flv:onfail=ignore]<yt> | [f=flv:onfail=ignore]<twitch> | [f=flv:onfail=ignore]<x>`

## Platform reference checkpoints (re-verify before M7)

Documented facts; re-check the live docs before real-platform acceptance (M7),
as platform requirements change.

- **YouTube** — RTMP ingest `rtmp://a.rtmp.youtube.com/live2` + stream key; managed
  broadcast still confirmed with "Go Live" in Studio. First-time channels need
  verification + ~24h activation. <https://developers.google.com/youtube/v3/live/docs/liveBroadcasts>
- **Twitch** — `rtmp://<ingest>/app` + stream key; ~6000 kbps practical ceiling;
  ingest-server list available without auth. <https://dev.twitch.tv/docs/video-broadcast/>
- **X / Twitter** — Media Studio Producer RTMP/RTMPS source with separate URL +
  key. **Account/source-access dependent** — Producer/live-source access is not
  guaranteed. If unavailable, the X card must render as unavailable with setup
  guidance (no silent failure). <https://help.x.com/en/using-x/how-to-use-live-producer>
- **FFmpeg tee** — see above.

## Deferred from M1 (explicitly, for safety/verifiability)

- **Secret storage (Keychain / Electron safeStorage).** Adds a Rust crate +
  cross-process IPC and cannot be verified headlessly; landing it unverified would
  not be a "safe slice." M1 keeps keys inline in the target (same posture as
  today's localStorage) with `streamKeyPresent`, and reserves `streamKeySecretRef`
  for the secret-storage slice (M1b).
- Streaming tab / Recording rename (M2), backend session wiring (M3), tee
  multi-output (M4) — per plan phase order.

## M6 verification — local RTMP smoke (proven)

The tee fan-out is now proven end to end by `pnpm smoke:multistream`
(`scripts/smoke-multistream-app.mjs`): it stands up one local `ffmpeg -listen 1`
RTMP server per destination, runs a real record + simulcast session through the
backend protocol, and asserts that bytes arrive at **every** target while the local
recording still finalizes. No Docker or external services; uses the test pattern,
so no camera/mic/screen permissions are required.

The first run surfaced a real bug that only the *executed* pipeline could catch
(the M4 tests only assert the command string): the tee's `matroska` slave failed
its header write — `Could not write header (incorrect codec parameters ?)` — because
one shared `h264_videotoolbox` encoder feeds all slaves and the matroska/flv muxers
need the H.264 SPS/PPS as **global** extradata. With `onfail=abort` on the matroska
leg, that took down the whole fan-out (0 frames, 293-byte MKV, nothing streamed).

**Fix:** force `-flags +global_header` on the session encode (`recording.rs`
`ffmpeg_args`). Re-run result: three RTMP targets each received an identical byte
count (~48 MB) fanned out from a single encode, and the local recording finalized
(~48 MB MP4). Regression is locked in by assertions in the M4 tee tests.

## M5 — diagnostics and failure handling

Per-target runtime status is emitted as a new `stream.targets` snapshot event
(`StreamTargetsSnapshot { sessionId, targets: StreamTargetRuntime[] }`). On session
start the backend partitions the enabled destinations with `resolve_stream_targets`
into **ready** (streamed, reported `live`) and **skipped** (enabled but incomplete
credentials, reported `not-configured` with the reason) and emits the initial
snapshot. The stderr reader parses FFmpeg `tee` per-slave drops
(`Slave muxer #N failed: …`), maps the slave index back to its target — accounting
for the MKV occupying slave `#0` when recording — marks that destination `failed`,
and re-emits the snapshot. `onfail=ignore` keeps every healthy leg running.

The renderer keys the snapshot by `targetId`, clears it when the session returns to
idle, and surfaces it three ways: per-destination badges in the Streaming tab
(On air / Skipped / Stopped), a non-blocking banner there (**Stop all** /
**Continue streaming**) when any leg is failed or skipped, and a cross-tab toast the
first time each destination drops.

**Verified** by seven `recording.rs` unit tests (resolver partition, tee-failure
parse, slave-index mapping incl. the recording offset, skipped→not-configured) and
by `pnpm smoke:multistream`, which now adds a deliberately-offline destination and
asserts the healthy legs keep receiving bytes while the snapshot reports the offline
leg `failed` and the rest `live`.

### Deferred to M5b

**Retry** (re-including a previously-failed destination) is intentionally not in this
slice: a single shared encoder feeds one fixed `tee`, so a leg cannot be re-added
without restarting FFmpeg — which interrupts every other platform and the local
recording. That restart-continuity behaviour needs its own UX decision (new
recording file? gap handling?), so M5 ships **Stop all** + **Continue streaming**
(dismiss) and leaves **Retry** for M5b.

## Real-platform hardening (M7 findings)

Two issues surfaced during real YouTube + Twitch go-lives and were fixed in the
shared encode / tee (`recording.rs` `ffmpeg_args`):

- **YouTube never went live (Twitch did).** The videotoolbox encode had no pinned
  GOP, so keyframes were irregular/long. YouTube refuses to ingest without a regular
  keyframe cadence; Twitch tolerates it. Fixed with `-g {2*fps}` +
  `-force_key_frames expr:gte(t,n_forced*2)` (verified: probed output carries
  keyframes at exactly 0,2,4,6…s on both the recording and the streamed legs).

- **Every platform was laggy when multistreaming.** The `tee` was synchronous, so
  the slowest/most-distant RTMP endpoint back-pressured the shared encoder and
  starved the others. Fixed by isolating each slave behind its own buffered thread
  (`-use_fifo 1 -fifo_options queue_size=512:drop_pkts_on_overflow=1`): a lagging
  platform drops packets to itself instead of stalling everyone, and the disk-backed
  recording leg never overflows in practice. Auto-recovery is intentionally **off**
  so a failed leg still emits `Slave muxer #N failed`, preserving the M5 per-target
  failure status.

Note the hard ceiling that no code can remove: one shared encode means the upload is
`bitrate × enabled platforms`, and the encode quality is capped by the strictest
platform (Twitch ≈ 1080p / 6000 kbps). Per-platform transcoding would require
multiple encodes and is out of scope for v1.
