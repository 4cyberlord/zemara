# Plan 020: Remediate leaked Google OAuth desktop client secret

> **Executor instructions**: Treat this as a credential incident. Do not print,
> paste, commit, or screenshot the secret value. Use fingerprints, creation
> times, and redacted output only. Rotate first; rewrite history only after the
> rotated release path is working and push coordination is explicit.
>
> **Drift check (run first)**:
> `git status --short --branch`
> `git show -s --format='%H %ad %s' --date=iso-strict HEAD`
> `git log --all --oneline -G'GOC''SPX-' -- crates/videorc-backend/src/oauth.rs`
> If `crates/videorc-backend/src/oauth.rs`, `scripts/lib/macos-release-artifact-validation.mjs`,
> or `docs/releases/release-runbook.md` changed since this plan was written,
> inspect current code before executing any slice.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: Google Cloud Console access for the OrcDev OAuth client,
  release signing/notarization access, and R2 upload access
- **Category**: security, release, operations
- **Planned at**: commit `9a4f6805`, 2026-07-06
- **Execution**: IN PROGRESS - release env rotated by user and verified locally;
  release-validation hardening committed; rotated release `0.9.12-beta.1` built,
  signed, notarized, validated (exact-secret gate PASS), uploaded, and feed
  verified 2026-07-06; OAuth smokes PASS. Remaining (Phase 4): owner verifies
  YouTube connect/refresh on the rotated build, then disables/deletes the old
  secret in Google Cloud Console and marks the GitGuardian alert
  remediated as rotated/revoked.

## Alert

GitGuardian reported a Google OAuth2 key exposure for `TheOrcDev/videorc` with
push time `2026-07-06 14:59:05 UTC`.

## Investigation Findings

The exact secret value is intentionally not recorded here.

- Leaked secret fingerprint: SHA-256 prefix `4438a0e55576d983`.
- Introduced in `e7576750` (`2026-06-10T15:10:56+02:00`), subject:
  `Bundle the new YouTube Desktop OAuth client, secret included`.
- Removed from current source in `9b306049` (`2026-07-06T13:27:03+02:00`),
  subject: `OAuth: YouTube client secret leaves source - build-time injection`.
- Last reachable commit with the exact leaked value in `oauth.rs`:
  `ac10d8ce` (`2026-07-06T13:06:41+02:00`).
- Exact leaked value exists in 533 reachable commits in local history.
- No tags contain `e7576750`.
- Refs containing the leaked-history commit:
  - `main`
  - `origin/main`
  - `origin/HEAD`
  - `codex/execute-plan-slices`
  - `origin/codex/execute-plan-slices`
  - `claude/interesting-carson-c0ef36`
- Current `HEAD` no longer contains the exact leaked value in source.
- Initial investigation found `~/.videorc-release.env` still contained the same
  secret fingerprint. After rotation, the local release env now has SHA-256
  prefix `863ff076810bc055` and no longer matches the leaked fingerprint.
- Current docs/scripts still contain the Google secret prefix marker string for
  release validation. That is not the exact leaked value, but it is noisy for
  scanners and weaker than verifying the exact build-time secret.

## External Guidance

- Google supports OAuth client secret rotation by adding a new secret, updating
  the app, monitoring rollout, disabling the old secret, then deleting it:
  <https://support.google.com/cloud/answer/15549257?hl=en>
- Google Workspace credential docs also describe resetting a client secret and
  updating the application with the new value:
  <https://developers.google.com/workspace/guides/manage-credentials>
- GitGuardian's generic remediation guidance for Google OAuth2 leaks recommends
  moving secrets out of code, rotating/revoking exposed credentials, and
  monitoring usage:
  <https://www.gitguardian.com/remediation/google-oauth2-key>

## Decisions

1. Rotate the secret on the existing Google OAuth client if the console allows
   it. Do not create/delete a new client ID unless rotation is unavailable:
   deleting a client ID breaks existing access and refresh tokens for that
   client.
2. Use a two-secret migration window if Google shows both the old and new
   secrets as enabled. Ship the new secret first, confirm the updated build,
   then disable the old secret as soon as possible.
3. Ship a new macOS release immediately after updating the build secret. Existing
   shipped builds embed the old secret and may fail YouTube OAuth/refresh after
   the old secret is disabled.
4. Replace the committed prefix-based binary check with an exact env-secret
   check. The release gate should verify the built backend contains the
   `VIDEORC_BUNDLED_YOUTUBE_CLIENT_SECRET` value from the release environment
   without printing it.
5. Treat history rewriting as a separate, coordinated cleanup. Rotation fixes
   the credential risk; rewriting public `main` is disruptive and should happen
   only after the release path is safe and collaborators are warned.

## Phase 1: Rotate And Preserve Service

1. Open the Google Auth Platform Clients page for the OrcDev project.
2. Find the YouTube Desktop OAuth client whose client ID matches the bundled
   client ID in `crates/videorc-backend/src/oauth.rs`.
3. Add a new client secret, or reset the client secret if add-secret is not
   available for this client type.
4. Copy the new secret into the local release env:
   `/Users/orcdev/.videorc-release.env`
5. Confirm by fingerprint only with a one-off local command that prints only:

- whether `VIDEORC_BUNDLED_YOUTUBE_CLIENT_SECRET` exists
- whether its SHA-256 prefix differs from `4438a0e55576d983`

**STOP condition**: Do not disable the old secret until the new build has been
created and validated, unless Google or GitGuardian has already disabled the old
secret for us.

## Phase 2: Harden Release Validation

Change the release validation so it checks the exact env-provided secret, not a
committed prefix marker:

- `scripts/lib/macos-release-artifact-validation.mjs`
  - Require `VIDEORC_BUNDLED_YOUTUBE_CLIENT_SECRET` for release validation.
  - Fail with redacted copy if the env var is missing.
  - Check the packaged `videorc-backend` binary contains that exact value.
  - Never print the value on pass or failure.
- `scripts/lib/macos-release-artifact-validation.test.mjs`
  - Use fake non-Google test values.
  - Prove missing env fails.
  - Prove mismatched binary fails.
  - Prove matched binary passes.
- `docs/releases/release-runbook.md`
  - Replace the committed Google secret-prefix marker with wording that says
    "the exact build-time secret from the release environment".
- `docs/releases/0.9.9.md`
  - Replace the committed marker in historical release notes with redacted
    wording.

Verification:

```bash
pnpm test:scripts
pnpm format:check
pnpm lint
```

Security check:

```bash
git grep -I -n -E 'GOC''SPX-[A-Za-z0-9_-]{8,}|client_secret.*GOC''SPX' HEAD -- .
```

Expected result: no output.

## Phase 3: Build And Ship A Rotated Release

1. Bump the desktop version and changelog for the rotated-secret release
   (`0.9.12` if no newer release exists).
2. Build with the updated release environment loaded.
3. Run:

```bash
pnpm release:preflight:macos
pnpm dist:desktop:release
pnpm release:validate:macos
pnpm smoke:oauth
pnpm smoke:oauth-guards
```

4. If local macOS permissions are available, run the nearest packaged OAuth/live
   smoke from `docs/oauth-live-smoke.md` against the new build.
5. Upload the release and verify the updater feed.
6. Confirm an installed app updates to the rotated build.

**STOP condition**: If `release:validate:macos` cannot prove the new secret is
embedded, do not upload the release.

## Phase 4: Disable Old Secret And Close The Alert

1. In Google Cloud Console, disable the old secret by creation time.
2. Monitor YouTube OAuth connect/refresh on the rotated build.
3. If the rotated build works, delete the disabled old secret.
4. In GitGuardian, mark the alert remediated as revoked/rotated. Do not mark it
   false positive.
5. Keep the secret fingerprint and alert ID in private incident notes, not in the
   public repo.

Verification:

```bash
pnpm smoke:oauth
pnpm smoke:oauth-guards
```

Manual verification:

- Existing connected YouTube account can refresh or reconnect on the rotated
  build.
- New YouTube account can connect on the rotated build.

## Phase 5: Optional History Rewrite

Only do this after Phase 4 succeeds and after announcing a push freeze.

1. Make a mirror backup:

```bash
git clone --mirror git@github.com:TheOrcDev/videorc.git videorc-security-backup.git
```

2. In a fresh working clone, create a `git-filter-repo` replacement file that
   maps only the exact leaked secret to `REDACTED_GOOGLE_OAUTH_CLIENT_SECRET`.
   Do not commit the replacement file.
3. Rewrite all affected refs:

```bash
git filter-repo --replace-text /path/to/private-replacements.txt
```

4. Verify no exact leaked value remains using the private fingerprint command.
5. Force-push the rewritten `main` and affected branches.
6. Delete or recreate stale remote branches that still point at old history.
7. Ask collaborators and agents to reclone or hard-reset knowingly.
8. Ask GitHub/GitGuardian for a rescan and cached-view cleanup if needed.

**STOP condition**: If any contributor, release process, or open PR still relies
on old history, stop and keep rotation-only remediation.

## Acceptance Criteria

- Google old secret is disabled/deleted.
- `/Users/orcdev/.videorc-release.env` no longer matches fingerprint
  `4438a0e55576d983`.
- Current `HEAD` has no exact leaked value and no committed Google secret-prefix
  detector string.
- A new signed/notarized macOS release has been validated and uploaded with the
  rotated secret.
- OAuth smoke and OAuth guard smoke pass.
- GitGuardian alert is marked remediated as rotated/revoked.
- Optional: public history is rewritten only if deliberately accepted as worth
  the disruption.
