# Plan 009: Harden stream/OAuth secret storage and legacy key migration

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- crates/videorc-backend/src/secrets.rs crates/videorc-backend/src/storage.rs crates/videorc-backend/src/streaming.rs crates/videorc-backend/src/recording.rs crates/videorc-backend/src/main.rs apps/desktop/src/renderer/src/lib/capture.ts apps/desktop/src/renderer/src/lib/capture.test.ts apps/desktop/src/renderer/src/hooks/use-studio.tsx docs/distribution.md`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security, migration
- **Planned at**: commit `3d217933`, 2026-06-13

## Why this matters

The current local secret store is an intentional owner-only JSON file. That is
fine for a technical spike, but paid livestreaming means users will store stream
keys and OAuth refresh tokens. The app needs an explicit credential posture:
prefer OS-backed storage for packaged macOS builds if it is stable, keep a
documented JSON fallback for development/self-hosting, and migrate old
localStorage stream keys out of renderer persistence.

## Current state

Relevant files:

- `crates/videorc-backend/src/secrets.rs` - JSON owner-only secret store.
- `crates/videorc-backend/src/storage.rs` - stores secret refs in SQLite and
  deletes refs on account disconnect.
- `crates/videorc-backend/src/streaming.rs` - manual stream key refs and hints.
- `crates/videorc-backend/src/recording.rs` - hydrates stream keys from secret
  refs when starting a session.
- `apps/desktop/src/renderer/src/lib/capture.ts` - loads and persists capture
  config, including legacy stream-key migration.
- `apps/desktop/src/renderer/src/hooks/use-studio.tsx` - saves manual stream
  keys through backend and persists capture config.

Current secret-store decision:

```rust
// crates/videorc-backend/src/secrets.rs:1
//! OBS-style local secret store (owner decision 2026-06-11).
//!
//! Secrets (stream keys, OAuth tokens) live in a 0600-permission JSON file next
//! to the app database instead of the macOS keychain.
```

Current JSON store path and writes:

```rust
// crates/videorc-backend/src/secrets.rs:36
fn secrets_path() -> PathBuf {
    if let Some(custom) = std::env::var_os("VIDEORC_SECRETS_PATH") {
        return PathBuf::from(custom);
    }
    crate::storage::default_database_path()
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("videorc-secrets.json")
}

// crates/videorc-backend/src/secrets.rs:72
fn write_all(path: &PathBuf, secrets: &BTreeMap<String, String>) -> Result<()> {
```

Current secret API stores raw values:

```rust
// crates/videorc-backend/src/secrets.rs:91
pub fn put_secret(secret_ref: &str, value: &str) -> Result<()> {
    ...
    secrets.insert(secret_ref.to_string(), value.to_string());
```

Manual stream-key refs are target-scoped and tested:

```rust
// crates/videorc-backend/src/streaming.rs:146
pub fn manual_stream_key_secret_ref(target_id: &str) -> Result<String> {
    if target_id.trim().is_empty()
        || !target_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
```

OAuth/stream-key refs are deleted on disconnect:

```rust
// crates/videorc-backend/src/storage.rs:499
for secret_ref in refs.into_iter().flatten() {
    delete_secret(&secret_ref)?;
}
```

Legacy capture config may load plaintext stream keys:

```ts
// apps/desktop/src/renderer/src/lib/capture.ts:308
export function loadCaptureConfig(): CaptureConfig {
  const loaded = loadJson(STORAGE_KEYS.captureConfig, defaultCaptureConfig) as Partial<CaptureConfig>
  ...
  streamKey: loaded.streamKey ?? defaultCaptureConfig.streamKey,
  streaming: migrateStreamingSettings(loaded)
```

Persisting clears keys only after secret refs/OAuth exist:

```ts
// apps/desktop/src/renderer/src/lib/capture.ts:658
export function persistableCaptureConfig(config: CaptureConfig): CaptureConfig {
  const targets = config.streaming.targets.map((target) => {
    if (!target.streamKeySecretRef && target.authMode !== 'oauth') {
      return target
    }
```

Repo conventions:

- Never reproduce secret values in logs, tests, plans, or docs.
- Tests may use fake secret values only inside fixtures.
- Prefer explicit status/diagnostics over silent fallbacks.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust targeted tests | `cargo test -p videorc-backend secret` | relevant tests pass |
| Rust full tests | `cargo test -p videorc-backend` | all non-ignored tests pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |
| Desktop tests | `pnpm --filter @videorc/desktop test` | all Vitest tests pass |
| TypeScript typecheck | `pnpm typecheck` | exit 0 |
| Streaming secrets smoke | `pnpm smoke:streaming-secrets` | exits 0 |

## Scope

**In scope**:

- Secret-store abstraction and tests
- macOS packaged keychain-backed implementation if stable
- JSON fallback with explicit diagnostics/status
- Legacy localStorage stream-key migration to backend secret refs
- Documentation of credential model

**Out of scope**:

- Adding new OAuth providers.
- Storing provider client secrets in the repo.
- Rewriting platform account schema except where needed for secret refs.
- Changing stream key values in docs or logs.

## Git workflow

- Branch: `codex/009-secret-storage-hardening`
- Commit style: split backend store abstraction, renderer migration, docs.
- Do not push unless instructed.

## Steps

### Step 1: Introduce a testable secret-store backend abstraction

Refactor `secrets.rs` so public functions keep their existing call sites:

- `put_secret`
- `get_secret`
- `try_get_secret`
- `delete_secret`

Behind them, introduce a backend interface with at least:

- `JsonFileSecretStore`
- `KeychainSecretStore` on macOS packaged builds, if implemented in this plan
- `MemorySecretStore` or fake only for unit tests

Expose a non-secret diagnostic such as backend kind: `json-file`, `macos-keychain`,
or `memory-test`.

**Verify**: existing `cargo test -p videorc-backend secret` tests still pass.

### Step 2: Add packaged macOS Keychain support or make JSON fallback explicit

Preferred premium path:

- Add a macOS-only Keychain implementation using a maintained Rust crate or a
  tiny FFI wrapper.
- Service name: `dev.theorcdev.videorc` or the app id already used for the app.
- Account/key: the existing `secret_ref`.
- Value: the secret string.
- Packaged macOS default: Keychain.
- Development default: JSON file, unless `VIDEORC_SECRET_STORE=keychain`.
- Fallback override: `VIDEORC_SECRET_STORE=json`.

If Keychain prompts on every packaged launch or cannot be made stable with the
signed identity, STOP and report. In that case, do not force Keychain; instead
land an explicit JSON-file credential model with a user-visible export/delete
story and revisit Keychain later.

**Verify**:

```sh
cargo test -p videorc-backend secret
cargo clippy -p videorc-backend -- -D warnings
```

### Step 3: Migrate old renderer-persisted stream keys

Add a renderer/backend migration that detects capture config keys loaded from
localStorage when no secret ref exists:

- legacy top-level `streamKey`
- per-target `streamKey`

On backend connection, store each key through `streamTargets.manualKey.store`,
then update capture config with `streamKey: ''`, `streamKeySecretRef`, and
`streamKeyPresent: true`.

Do not upload, log, toast, or write the plaintext key anywhere else. If a store
fails, keep the key in memory for the current session but do not keep writing it
back to localStorage without a clear warning.

Add tests in `capture.test.ts` for:

- `persistableCaptureConfig` clears secret-ref keys
- legacy key migration produces a target needing backend store
- after store result, persisted config has no plaintext `streamKey`

**Verify**: `pnpm --filter @videorc/desktop test -- capture` exits 0.

### Step 4: Preserve deletion and restore semantics

Keep existing behavior:

- disconnecting a platform account deletes its access/refresh/stream-key refs
- manual stream-key restore swaps current and previous slots
- stream-key hints reveal only masked tails

Add tests if the backend abstraction makes these paths less direct.

**Verify**:

```sh
cargo test -p videorc-backend platform_accounts
cargo test -p videorc-backend manual_stream_key
pnpm smoke:streaming-secrets
```

### Step 5: Document the credential model

Update `docs/distribution.md` with:

- where secrets live in dev
- where secrets live in packaged macOS
- how to force JSON fallback
- how to delete all local credentials
- that no secret values are committed or printed

Do not include real tokens, keys, or screenshots of secret values.

**Verify**: `pnpm format:check` exits 0.

## Test plan

- Rust tests:
  - JSON file roundtrip and 0600 permissions
  - Keychain fake/trait tests without requiring real user keychain
  - delete semantics for platform accounts
  - manual key store/restore/hints
- TS tests:
  - plaintext legacy key migration decision
  - persistable config redaction
- Smoke:
  - `pnpm smoke:streaming-secrets`

## Done criteria

- [ ] Secret backend is explicit and testable.
- [ ] Packaged macOS either uses stable Keychain storage or documents JSON
      owner-only fallback as an explicit release decision.
- [ ] Legacy localStorage stream keys migrate to backend secret refs and stop
      being persisted as plaintext.
- [ ] Stream key hints remain masked.
- [ ] Disconnect/delete flows remove associated secrets.
- [ ] `cargo test -p videorc-backend`, `cargo clippy -p videorc-backend -- -D warnings`,
      `pnpm --filter @videorc/desktop test`, `pnpm typecheck`, and
      `pnpm smoke:streaming-secrets` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Keychain prompts on every dev or packaged launch.
- Migrating legacy keys risks losing a user's only stream key.
- Any log, test snapshot, fixture, or doc would include a real secret value.
- The fix requires changing OAuth provider flows beyond secret storage.

## Maintenance notes

This plan is about trust as much as code. A JSON store can be acceptable only if
it is an explicit product/security decision; it should not be an accidental
artifact of the spike once premium livestreaming ships.
