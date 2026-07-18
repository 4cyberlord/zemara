# Plan 029: X Livestream user OAuth (3-legged OAuth 1.0a)

> **Executor instructions**: This plan makes Plan 028's native X Livestream
> integration work for every user, not just the owner. The X Livestream
> management endpoints only accept OAuth 1.0a user-context signatures; Plan 028
> shipped reading the whole credential set — including the owner's personal
> access token — from env vars. This plan splits the model: the app-level
> consumer pair ships with the build, and each user mints their own access
> token through an in-app browser authorization.

## Status

- **Priority**: P0 - without it, native X live works only on machines with the
  owner's env credentials.
- **Effort**: M.
- **Risk**: MEDIUM-HIGH - OAuth 1.0a request signing for the token dance,
  shared loopback callback handling, secret storage, release gating.
- **Depends on**: Plan 028 (branch `codex/x-livestream-api`).
- **Category**: provider integration, OAuth, secrets, release gates.
- **Planned at**: 2026-07-08 on branch `codex/x-livestream-api`.
- **Execution**: EXECUTED 2026-07-08 in the same session that wrote this plan
  (design-of-record + implementation landed together).

## Credential model

Two halves, mirroring how X's docs describe access:

1. **Consumer pair (app-level, allow-listed)** — `option_env!` baked at release
   build time from `~/.videorc-release.env`
   (`VIDEORC_BUNDLED_X_OAUTH1_CONSUMER_KEY` / `_SECRET`), exactly like the
   bundled YouTube client secret. Runtime overrides
   `VIDEORC_X_OAUTH1_CONSUMER_KEY` / `_SECRET` serve self-hosted apps; a
   partial env pair is a hard error, not a silent fallback.
2. **User access token (per-user)** — minted by the in-app **Authorize X
   Live** flow (Streaming tab): `POST /oauth/request_token` (signed with the
   consumer pair + `oauth_callback`) → browser opens
   `/oauth/authorize?oauth_token=…` → loopback callback delivers
   `oauth_token` + `oauth_verifier` (no `state` — the request token is the
   correlation key) → `POST /oauth/access_token` → token pair stored at
   `platform:x:oauth1:access-token` / `token-secret` (+ `handle` for display)
   in the backend secret store. The numeric user id needed for
   `/2/users/:user_id/...` paths is the access token's prefix.

Precedence when signing Livestream calls: env token set
(`VIDEORC_X_OAUTH1_ACCESS_TOKEN*`, for smokes/self-host) → stored
user-authorized token. Disconnecting the X account deletes the stored trio.

## Slices (all landed)

1. **Backend flow** — `crates/videorc-backend/src/x_oauth1.rs`: pending-map
   sessions (10-min TTL, single-use, `denied` handling), form-encoded response
   parsing, callback-confirmed check with a portal-registration hint.
   Generalized signer `oauth1_signed_header` in `x_live.rs` (no-token +
   extra-oauth-params support); existing header builder delegates to it.
2. **Credential resolution** — `x_live::x_livestream_credentials[_with]`
   replaces `x_livestream_credentials_from_env`; capability gains
   `needs-authorization` state (consumer present, no user token) distinct from
   `missing-credentials` (no consumer in this build). Account-mismatch keeps
   comparing the connected OAuth2 account id against the token's user id.
3. **Wiring** — `/oauth/callback` branches on `state` (OAuth2) vs
   `oauth_token`/`oauth_verifier`/`denied` (OAuth 1.0a); result rides the
   existing `platformAccounts.oauth.callback` event. New RPC
   `streamTargets.x.startLiveAuthorization`. X disconnect deletes the OAuth1
   secrets.
4. **Renderer** — `needs-authorization` badge + **Authorize X Live** button in
   the Streaming tab X panel (also shown for account-mismatch re-auth);
   capability auto-refreshes when the callback event reports a stored X token.
5. **Release gate** — `release:validate:macos` fails closed unless the release
   backend binary embeds both halves of the exact release-env consumer pair
   (`bundledXOauth1ConsumerCheckTargets`), replacing the retired YouTube baked
   secret gate's role.
6. **Docs** — `docs/distribution.md` credential model,
   `docs/oauth-live-smoke.md` acceptance steps (authorize in-app; env values
   are the smoke override), release skill prerequisites.

## Owner actions (external, cannot be done from the repo)

- Add `VIDEORC_BUNDLED_X_OAUTH1_CONSUMER_KEY` / `_SECRET` (the allow-listed X
  app's API key pair from the X developer portal, "Consumer Keys" section) to
  `~/.videorc-release.env` before the next release build.
- Confirm the X developer app has **3-legged OAuth** user authentication
  enabled and the three loopback callback URLs registered
  (`http://127.0.0.1:{17995,27995,37995}/oauth/callback`) — the same list the
  OAuth2 flow already uses.
- By-eye acceptance: fresh profile → Connect X → Authorize X Live → Go Live on
  X natively; then disconnect X and confirm capability returns to
  `needs-authorization`.

## Verification

- `cargo test -p videorc-backend` (three-legged stub-server tests, signer
  parity tests, capability states), `cargo clippy -- -D warnings`,
  `cargo fmt --check --all`.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm --filter @videorc/desktop test`, `pnpm test:scripts`.
- Real-account smoke: `docs/oauth-live-smoke.md` X acceptance section.
