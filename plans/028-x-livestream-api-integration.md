# Plan 028: Add native X Livestream API integration

> **Executor instructions**: Treat this as the replacement for the old
> "partner API required" X blocker. The product goal is first-class native X
> livestreaming, not a nicer manual RTMP shortcut. Do not silently fall back to
> manual RTMP when the user chooses X OAuth/native. Keep manual RTMP available
> as an explicit destination mode only.
>
> **Source material**: `/Users/orcdev/Downloads/X_Livestream_API_-_Developer_Documentation.pdf`
> was reviewed on 2026-07-07. The user confirmed Videorc is officially cleared
> for X API access, so the old assumption in Plan 015 and `x_live.rs` is now
> stale.
>
> **Drift check (run first)**: `git status --short --branch`; inspect
> `crates/videorc-backend/src/x_live.rs`,
> `crates/videorc-backend/src/oauth.rs`,
> `crates/videorc-backend/src/x_chat.rs`,
> `crates/videorc-backend/src/live_chat.rs`,
> `apps/desktop/src/shared/backend.ts`,
> `apps/desktop/src/renderer/src/hooks/use-studio.tsx`,
> `apps/desktop/src/renderer/src/components/tabs/streaming-tab.tsx`,
> `scripts/smoke-oauth-guards-app.mjs`,
> `scripts/lib/provider-readiness.mjs`, `docs/oauth-live-smoke.md`, and
> `docs/distribution.md`. If these paths moved after `bf3954dd`, remap the
> equivalent code before editing.

## Status

- **Priority**: P1 - X was previously blocked by missing native API access; that
  blocker is now gone.
- **Effort**: L.
- **Risk**: HIGH - provider lifecycle, OAuth 1.0a signing, stream start/stop
  orchestration, secret handling, and live-account acceptance all change.
- **Depends on**: Plans 009, 015, 018, and existing recording/studio streaming
  lifecycle.
- **Category**: provider integration, OAuth, livestream lifecycle, live chat,
  diagnostics.
- **Planned at**: commit `bf3954dd`, 2026-07-07.
- **Execution**: IN PROGRESS on branch `codex/x-livestream-api` as of
  2026-07-07. Native source/broadcast lifecycle, read-only chat connector,
  renderer go-live/end wiring, docs, provider readiness, and OAuth guard smokes
  are implemented. Pending: real allow-listed X account acceptance and the
  unrelated 100-cycle preview lifecycle gate failure observed locally.

## Why this matters

Videorc currently tells users that native X livestreaming is blocked on partner
API access. That was honest when written, but it is now wrong. We have official
access and a private X Livestream API document with source, broadcast, publish,
end, and read-only chat flows.

The implementation should make X feel like YouTube and Twitch: connect an
account, enable the X destination, review the go-live confirmation, start the
stream, get a share URL, see status/viewer diagnostics, and end cleanly. Manual
RTMP stays available for users who choose it, but it must not be the hidden
fallback for failed native setup.

## API contract from the PDF

The Livestream management API uses `https://api.x.com` for most endpoints.
Chat token handoff uses legacy `https://api.twitter.com` and
`https://proxsee.pscp.tv`.

### Authentication

- Every Livestream management endpoint requires OAuth 1.0a, 3-legged user
  context, HMAC-SHA1.
- OAuth 2.0 Bearer tokens are explicitly not accepted for these endpoints.
- Required values are the consumer key, consumer secret, access token, and
  access token secret for the broadcasting account.
- The application must be allow-listed for Livestream API and have Read + Write
  or ReadWriteDm access.
- The numeric X user id from the OAuth 1.0a token must match `:user_id` in every
  path. A mismatch returns HTTP 400.
- `GET /2/users/me` with the same OAuth 1.0a credentials can provide the
  numeric user id. The token prefix before `-` is also the numeric id, but use a
  verified profile call when possible.
- The OAuth signature base string includes OAuth params and query params, but
  never JSON body fields.
- Strict RFC 3986 percent encoding is required. Escape `! * ' ( )` and encode
  spaces as `%20`, not `+`.

### Regions and sources

- `GET /2/region` returns HTTP 307 to a region recommendation host. Sign the
  initial request; the redirected host does not need the OAuth header.
- `POST /2/users/:user_id/sources` creates a persistent stream source with:

```json
{
  "name": "Videorc Primary Encoder",
  "region": "eu-central-1"
}
```

- A stream source returns `id`, `rtmps_url`, `rtmp_url`, `rtmp_stream_key`,
  `rtmp_region`, `recommended_configuration`, `is_stream_active`,
  `stream_attributes`, and `compatibility_info`.
- Use `rtmps_url` in production. Do not derive or hardcode ingest hostnames from
  region names.
- `rtmp_stream_key == id`.
- Reuse sources across broadcasts. One source per account/region/encoder setup
  is the default model.
- `owner_id` is returned as a JSON number and can be precision-unsafe. Do not
  rely on it; keep our authenticated numeric user id as a string.

### Broadcast lifecycle

- `POST /2/users/:user_id/broadcasts` creates a broadcast bound to an active
  source:

```json
{
  "source_id": "6ep48v6ar5q4",
  "region": "eu-central-1",
  "is_low_latency": true
}
```

- The selected source must already be receiving RTMP/RTMPS and have
  `is_stream_active: true` before creating a broadcast. Otherwise X returns a
  generic 404.
- The broadcast starts as `NOT_STARTED`.
- Important returned fields:
  - `id` / `broadcast_id` - broadcast room and API id.
  - `media_key` - required for chat token access.
  - `media_id` - media id.
  - `share_url` - public viewer link.
  - `twitter_user_id` - numeric X user id as a string.
  - `state` - lifecycle state.
  - `video_access` - HLS playback URLs.
- Publish uses `PUT /2/users/:user_id/broadcasts/:broadcast_id/state`:

```json
{
  "state": "PUBLISH",
  "title": "Live from Videorc",
  "should_not_tweet": false,
  "locale": "en",
  "chat_option": 2
}
```

- `chat_option` values:
  - `0` none/no option set
  - `1` disabled
  - `2` everyone
  - `3` verified accounts
  - `4` accounts the broadcaster follows
  - `5` subscribers
- If omitted, X has been observed to default chat to verified accounts.
- `tweet_id` is usually not in the publish response. Re-fetch the broadcast.
- `tweet_error` may be absent; empty means post success, non-empty means the
  announcement post failed but the broadcast can still be live.
- End uses the same state endpoint, but the body must be exactly:

```json
{ "state": "END" }
```

- Do not include title, locale, `should_not_tweet`, or `chat_option` in the END
  body. X rejects extra fields with HTTP 400.

### Live chat

X chat in this API is read-only.

1. After publish, fetch a chat token:

```txt
GET https://api.twitter.com/1.1/live_video_stream/status/{mediaKey}
x-periscope-user-agent: Twitter/m5
```

2. Exchange it for chat access:

```txt
POST https://proxsee.pscp.tv/api/v2/accessChatPublic
content-type: application/json
x-periscope-user-agent: Twitter/m5
x-idempotence: <nonce-or-timestamp>
x-attempt: 1
```

```json
{ "chat_token": "<chatToken>" }
```

3. Convert the returned endpoint to:

```txt
wss://<returned-host>/chatapi/v1/chatnow
```

4. Send a kind `3` auth frame with the returned access token, then a kind `2`
   subscribe frame for room `broadcast_id`. Incoming kind `1` frames contain
   double-JSON-encoded chat messages.

## Current repo state to replace

- `crates/videorc-backend/src/x_live.rs` has one state,
  `partner-api-required`, always returns `native_available: false`, and tells
  users to switch to manual RTMP.
- `streamTargets.x.prepare` only checks that negative capability and returns
  `x-native-live-unavailable`.
- `apps/desktop/src/shared/backend.ts` mirrors the single
  `partner-api-required` state.
- `apps/desktop/src/renderer/src/components/tabs/streaming-tab.tsx` renders a
  `Partner API required` badge and manual RTMP helper copy.
- `apps/desktop/src/renderer/src/hooks/use-studio.tsx` prepares YouTube and
  Twitch native targets, but X currently only calls the blocker command.
- `crates/videorc-backend/src/oauth.rs` uses OAuth 2.0/PKCE for X account
  connection. That is still useful for profile/login surfaces, but it is not
  sufficient for Livestream management.
- `crates/videorc-backend/src/x_chat.rs` and `live_chat.rs` intentionally keep
  X comments unsupported pending verified API access. The PDF now supplies the
  read-only chat path, so this gate can be replaced by a real connector.
- `scripts/smoke-oauth-guards-app.mjs`, `scripts/lib/provider-readiness.mjs`,
  `docs/oauth-live-smoke.md`, and `docs/distribution.md` encode the old
  "partner/API access" readiness flag and must be updated.

## Product rule

Native X means Videorc owns the full source and broadcast lifecycle:

1. Select an X account with valid OAuth 1.0a Livestream credentials.
2. Ensure/reuse an X stream source.
3. Start Videorc's encoder/fan-out to the returned `rtmps_url` and
   `rtmp_stream_key`.
4. Poll X source status until `is_stream_active`.
5. Create the broadcast.
6. Publish it.
7. Poll while live.
8. End it with a strict END request.
9. Preserve a redacted diagnostic trail.

If any native step fails, the native X destination should fail with a clear
runtime status. It should not mutate into manual RTMP.

## Target architecture

### Backend modules

Add or evolve backend modules around these responsibilities:

- `x_oauth1.rs` or an `oauth::oauth1` submodule:
  - strict percent encoding
  - normalized query/OAuth param collection
  - HMAC-SHA1 signature generation
  - Authorization header assembly
  - fixtures for query params, JSON body exclusion, and special characters
- `x_livestream.rs` or expanded `x_live.rs`:
  - typed request/response models
  - Livestream client with injectable base URLs and `reqwest::Client`
  - source CRUD
  - region lookup with 307 handling
  - broadcast create/get/list/publish/end/delete
  - error classification for 400/401/403/404/412/429/5xx
  - redaction-safe diagnostics
- `x_chat.rs`:
  - replace the static unsupported gate with the documented read-only connector
  - chat token fetch
  - `accessChatPublic` exchange
  - WebSocket auth/subscribe frames
  - double-JSON message parser

The backend already has `reqwest`, `base64`, `tokio-tungstenite`, and secret
refs. Add the smallest Rust crypto dependency set needed for OAuth 1.0a
HMAC-SHA1, for example `hmac` plus `sha1`, unless the executor finds an
approved existing helper already present.

### Secret and account model

Do not reuse the X OAuth2 access token as if it were valid for Livestream API.
The management API needs an OAuth 1.0a token secret.

Add an explicit X Livestream credential path:

- consumer key
- consumer secret
- OAuth 1.0a access token
- OAuth 1.0a access token secret
- numeric X user id
- account label/handle/avatar, if available
- credential source: bundled/env/imported/connect-flow, redacted

Recommended first production slice:

- support environment/imported OAuth 1.0a credentials for the allow-listed X
  app/account to unblock API validation
- store access token and token secret through the existing secure secret
  backend, not in SQLite/plain renderer state
- expose only booleans, account labels, and redacted evidence to the renderer

Then add a polished OAuth 1.0a connect flow if X allows our desktop app to
obtain user token secrets directly in a user-friendly way. If X's current
developer portal makes OAuth 1.0a desktop login awkward, keep the initial
import/admin path explicit and labeled for release operations.

Secret refs must be deleted on disconnect. Support bundles, logs, errors, and
diagnostics must redact:

- consumer secret
- access token
- token secret
- RTMP stream key
- signed OAuth Authorization header
- chat token
- chat access token

### Data model

Add typed internal models for:

- X Livestream account readiness:
  - `missing-credentials`
  - `oauth1-ready`
  - `account-not-live-eligible`
  - `api-denied`
  - `rate-limited`
  - `api-error`
- X source:
  - `source_id`
  - `name`
  - `region`
  - `rtmps_url`
  - `rtmp_stream_key_secret_ref`
  - `is_stream_active`
  - `recommended_configuration`
  - `compatibility_info`
  - `last_checked_at`
- X prepared broadcast:
  - `broadcast_id`
  - `media_key`
  - `share_url`
  - `state`
  - `tweet_id`
  - `tweet_error`
  - `chat_option`
  - `is_low_latency`
  - `created_at_ms`
  - `started_at_ms`
  - `ended_at_ms`

Persist only what must survive app restarts. Keep stream keys and tokens in
secret storage. IDs are strings. Do not deserialize precision-risk IDs as JS
numbers.

## Go-live lifecycle

Videorc's current OAuth preparation model prepares YouTube/Twitch before
`session.start`. X needs a two-phase lifecycle because X requires active RTMPS
ingest before broadcast creation.

Implement this shape:

1. `streamTargets.x.capability`
   - verifies account and OAuth 1.0a credential readiness
   - optionally calls `/2/users/me` and `/2/region`
   - reports source availability and redacted evidence
2. `streamTargets.x.prepareSource`
   - selects/reuses an X source or creates one for the recommended region
   - returns `serverUrl: rtmps_url` and `streamKeySecretRef`
   - patches the X stream target to a ready-to-encode RTMPS destination
3. `session.start`
   - starts the existing encoder/fan-out to every ready target, including the X
     RTMPS source
4. `streamTargets.x.waitForIngestAndPublish`
   - polls `GET /sources/:source_id` until `is_stream_active` or timeout
   - creates broadcast
   - publishes broadcast with title, locale, chat option, and tweet toggle
   - patches runtime target status with `broadcast_id`, `media_key`, and
     `share_url`
5. while live
   - poll `GET /broadcasts/:broadcast_id`
   - surface state, viewer counts, `tweet_id`, `tweet_error`, and compatibility
     warnings
   - start X chat read connector once `media_key` is live
6. stop
   - call strict END for running/not-started X broadcasts as part of stop
     orchestration
   - do not include publish-only fields in the END body
   - treat 2xx as success without relying on a body shape
   - if the encoder already stopped, still call END best-effort and report the
     result in diagnostics
7. recovery
   - on app startup or next provider refresh, detect owned RUNNING broadcasts
     from the last session and offer/attempt cleanup rather than leaving hidden
     live broadcasts

The executor should choose the exact command names after inspecting the current
go-live state machine. The important boundary is that source preparation happens
before encoder start, while broadcast create/publish happens after ingest is
active.

## Streaming UI

Keep this inside the existing dense Videorc command-surface design:

- Replace the `Partner API required` badge with states like `X API ready`,
  `Credentials needed`, `Live access denied`, `Waiting for ingest`, and `Live`.
- Remove old copy that says the public X API lacks source/broadcast endpoints.
- Keep `Switch to Manual RTMP` only as an explicit user action, not as the
  explanation for native readiness failure.
- Add X destination settings where useful:
  - X account
  - source mode: auto/reuse selected source/create new
  - source region: auto recommended by `/2/region`, with advanced override only
    if needed
  - low latency toggle
  - announcement post toggle (`should_not_tweet`)
  - chat participation option
  - locale
- Map stream metadata:
  - title -> X publish `title`
  - X visibility/privacy -> currently only publish/tweet/chat semantics; do not
    pretend X has YouTube-style private/unlisted if the API does not support it
  - description is not a broadcast body field unless X later documents one
- Go Live confirmation should show X preparation stages:
  - source ready
  - ingest waiting
  - broadcast created
  - published
  - share URL
- Runtime rows should show failures per destination and leave other streaming
  legs running.

Use existing shadcn/ui components and Phosphor icons. No large hero panels, no
nested cards, no decorative color wash.

## Diagnostics and support bundle

Add a redacted X lifecycle evidence block:

```json
{
  "platform": "x",
  "accountId": "172483972",
  "credentialSource": "env",
  "sourceId": "6ep48v6ar5q4",
  "sourceRegion": "eu-central-1",
  "sourceActive": true,
  "broadcastId": "1AxRnanzLOrxl",
  "mediaKeyPresent": true,
  "shareUrl": "https://x.com/i/broadcasts/1AxRnanzLOrxl",
  "state": "RUNNING",
  "lastApiStatus": 200,
  "tweetIdPresent": true,
  "tweetError": null,
  "compatibilityWarnings": [],
  "redactions": [
    "oauth1-consumer-secret",
    "oauth1-access-token",
    "oauth1-token-secret",
    "rtmp-stream-key",
    "chat-token"
  ]
}
```

No raw secrets, keys, OAuth headers, chat tokens, or signed URLs beyond public
viewer/share URLs.

Recommended runtime status labels:

- `checking-credentials`
- `source-ready`
- `waiting-for-ingest`
- `broadcast-created`
- `publishing`
- `live`
- `tweet-warning`
- `compatibility-warning`
- `ending`
- `ended`
- `failed`

## Slices

### S0 - Refresh docs and assumptions

Update Plan 015 references, `docs/oauth-live-smoke.md`, and `docs/distribution.md`
to say X native live is now an allow-listed API path requiring OAuth 1.0a
credentials. Do not commit the PDF. Keep any private account details out of docs.

**Done when**: no product/runbook copy claims X source/broadcast creation is
undocumented or unavailable.

**Verify**:

```sh
rg -n "partner API required|public X API.*does not expose|manual RTMP fallback" docs plans crates apps scripts
```

### S1 - Add OAuth 1.0a signer and credential readiness

Implement strict OAuth 1.0a signing in backend-only Rust. Add X Livestream
credential status separate from the existing OAuth2/PKCE account status.

**Done when**: backend can build a valid signed request header from redacted
test credentials, includes query params, excludes JSON bodies, and rejects
missing token secrets.

**Verify**:

```sh
cargo test -p videorc-backend oauth1
cargo test -p videorc-backend x_livestream_credentials
cargo fmt --check --all
```

### S2 - Add the typed X Livestream API client

Build a client around `/2/region`, `/sources*`, and `/broadcasts*` with mockable
base URLs and redacted error messages.

**Done when**: unit tests cover source create/list/get/update/delete, region
redirect handling, broadcast create/get/list/publish/end/delete, rate-limit
headers, and common error classification.

**Verify**:

```sh
cargo test -p videorc-backend x_livestream
cargo clippy -p videorc-backend -- -D warnings
```

### S3 - Replace X capability and source readiness

Replace the static `partner-api-required` capability with real states. Add
source selection/reuse/create behavior and return `rtmps_url` plus a secret ref
for the stream key to the existing streaming target model.

**Done when**: X OAuth/native can be marked ready only when OAuth 1.0a
Livestream credentials and account identity are valid; manual RTMP remains
explicitly selectable.

**Verify**:

```sh
cargo test -p videorc-backend x_live
pnpm --filter @videorc/desktop test
pnpm typecheck
```

### S4 - Integrate X with the go-live lifecycle

Patch `prepareOauthTargetsForGoLive` and backend commands so X source
preparation happens before `session.start`, while broadcast creation/publish
happens only after active ingest is observed.

**Done when**: an X target can become a real RTMPS output leg, wait for
`is_stream_active`, create/publish a broadcast, and surface the `share_url`
without blocking healthy YouTube/Twitch/manual legs when X fails.

**Verify**:

```sh
pnpm --filter @videorc/desktop test
pnpm typecheck
pnpm lint
cargo test -p videorc-backend x_live
pnpm smoke:multistream
```

### S5 - Add end/cleanup/recovery

Add strict END handling, app shutdown/session stop cleanup, and recovery for
last-known X broadcasts that may still be running after a crash or force quit.

**Done when**: stopping a session sends `{ "state": "END" }` exactly once per
running X broadcast when possible, records failures redacted, and can identify
or clean up stale running broadcasts on the next launch.

**Verify**:

```sh
cargo test -p videorc-backend x_broadcast_end
pnpm --filter @videorc/desktop test
pnpm smoke:recording-studio
```

### S6 - Add X live status and diagnostics

Poll broadcast/source status while live, expose viewer counts and post status
where available, and add support-bundle evidence.

**Done when**: diagnostics explain X setup/live/end failures without exposing
tokens, stream keys, OAuth headers, chat tokens, or private secrets.

**Verify**:

```sh
cargo test -p videorc-backend support_bundle x_live
pnpm test:scripts
pnpm smoke:oauth-guards
pnpm smoke:provider-readiness
```

### S7 - Add read-only X live chat

Replace the X comments unsupported gate with the documented read-only chat
handoff and WebSocket connector.

**Done when**: X live chat can read messages for a running broadcast, reports
unsupported send behavior honestly, retries token availability after publish,
and parses double-JSON frames into Videorc's existing live chat message model.

**Verify**:

```sh
cargo test -p videorc-backend x_chat
cargo test -p videorc-backend live_chat
pnpm --filter @videorc/desktop test
```

### S8 - Update Streaming UI

Update shared TS types and the Streaming tab to reflect real X states, source
settings, low-latency/chat/tweet controls, runtime status, and share URL.

**Done when**: the UI no longer shows `Partner API required`; the native X path
is understandable, dense, and consistent with the Videorc design language; and
manual RTMP remains an explicit alternate mode.

**Verify**:

```sh
pnpm --filter @videorc/desktop test
pnpm typecheck
pnpm lint
pnpm format:check
```

### S9 - Live-account acceptance

Run against a dedicated allow-listed X account with broadcast privileges.

**Done when**:

- credentials are loaded through the intended secure path
- `/2/users/me` confirms numeric user id
- `/2/region` succeeds
- source create/reuse works
- Videorc starts RTMPS ingest
- `is_stream_active` flips true
- broadcast create succeeds
- publish succeeds and returns a live `share_url`
- chat read connector receives messages, if chat is enabled and test messages
  exist
- stop sends END and X reports `ENDED`
- test broadcasts/sources are cleaned up or intentionally retained for reuse
- acceptance note is added under `docs/acceptance/`

**Verify**:

```sh
pnpm smoke:local-gates
pnpm smoke:provider-readiness:strict
pnpm smoke:oauth-guards
pnpm smoke:multistream
pnpm smoke:recording-studio
```

Add a one-off/live acceptance command only if it can run safely without printing
secrets and can be skipped when credentials are absent.

## Tests to add or update

- OAuth 1.0a signer:
  - strict percent encoding
  - query params included
  - JSON body excluded
  - stable sorted params
  - Authorization header redaction
- X Livestream client:
  - `/2/region` 307
  - source CRUD
  - create-broadcast 404 treated as source-not-active retry hint
  - publish payload includes only publish fields
  - END payload is exactly `{ "state": "END" }`
  - `owner_id` precision is ignored
  - IDs remain strings
- Go-live lifecycle:
  - X source prepare before encoder start
  - create/publish after `is_stream_active`
  - partial failure disables/fails only X target
  - stop calls END
  - stale running broadcast cleanup
- Chat:
  - media-key token fetch retry
  - accessChatPublic request headers/body
  - WebSocket auth and subscribe frames
  - double-JSON message parse
  - read-only send status
- UI:
  - capability badges/states
  - no old partner-required copy
  - controls serialize to backend params
  - runtime X share URL/status rendering
- Scripts/docs:
  - provider readiness no longer treats X as a purely manual partner gate
  - OAuth guard smoke can test both missing OAuth1 credentials and mocked ready
    credentials

## Verification gate matrix

Use the smallest gate per slice, then the broader gates before handoff:

```sh
cargo fmt --check --all
cargo test -p videorc-backend
cargo clippy -p videorc-backend -- -D warnings
pnpm --filter @videorc/desktop test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:scripts
pnpm smoke:oauth-guards
pnpm smoke:provider-readiness
pnpm smoke:multistream
pnpm smoke:recording-studio
```

For live-account work, also run the dedicated X acceptance steps with the
allow-listed account. If credentials are absent, state that live acceptance is
blocked and run the mock/client lifecycle tests instead.

## Open decisions

- **Credential UX**: Can Videorc obtain OAuth 1.0a token secrets through a
  clean desktop connect flow, or should the first version use an explicit
  release/admin credential import for the allow-listed account?
- **Source reuse**: default to one reusable source per account/region, but decide
  whether the UI exposes multiple named sources in v1.
- **Default region**: use `/2/region` automatically; only expose manual region
  override if real testing shows a need.
- **Default low latency**: likely on for chatty streams, but confirm against X
  quality behavior and Videorc's default output presets.
- **Default chat option**: choose an explicit product default instead of relying
  on X's observed default. Recommended: `Everyone` for public streams, unless
  user/account policy suggests `Verified`.
- **Announcement post**: default to sending the X post (`should_not_tweet:
  false`) but expose a clear toggle.
- **Stop ordering**: the PDF workflow says stop encoder then END, while the END
  section says after ending stop your encoder. Videorc should call END as part
  of controlled stop while enough session context still exists, then stop or
  complete the encoder shutdown. If the encoder already stopped, still call END
  best-effort.
- **Privacy semantics**: the current X metadata draft has `x_visibility`.
  Re-evaluate it against actual X publish fields so the UI does not promise
  private/unlisted behavior the API does not provide.
- **Chat send**: this API is read-only. Keep send disabled/unsupported unless X
  documents a separate approved send flow.

## STOP conditions

Stop and report rather than improvising if:

- OAuth 1.0a token secret cannot be obtained or stored securely.
- X app/account access is not actually allow-listed in the live environment.
- The broadcasting account is protected/private or otherwise cannot create
  broadcasts.
- X returns undocumented required fields or state constraints that change the
  lifecycle.
- Any test, log, support bundle, or UI path would expose OAuth secrets, stream
  keys, chat tokens, or Authorization headers.
- Implementing X requires changing the core media path beyond adding an RTMPS
  output leg. Route media-quality or muxing issues back to Plans 006, 014, and
  023 instead of hiding them inside this provider slice.
