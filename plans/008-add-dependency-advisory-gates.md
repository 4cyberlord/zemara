# Plan 008: Fix dependency advisory failures and add JS/Rust audit gates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- package.json apps/desktop/package.json pnpm-lock.yaml Cargo.lock .github/workflows/ci.yml .github/workflows/release-macos.yml`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: security, dependencies, dx
- **Planned at**: commit `3d217933`, 2026-06-13

## Why this matters

`pnpm audit --prod --audit-level high` currently fails on an `esbuild` advisory,
and there is no Rust advisory gate installed or wired into CI. This is a
desktop app with packaged builds, OAuth, streaming, SQLite, and networked Rust
dependencies; dependency advisory checks should be part of the normal release
surface. The goal is a clean, repeatable advisory baseline, not a one-off local
fix.

## Current state

Relevant files:

- `package.json` - root scripts and allowed built dependencies.
- `apps/desktop/package.json` - Vite/electron-vite/Vitest dependency versions.
- `pnpm-lock.yaml` - currently resolves vulnerable `esbuild` versions.
- `.github/workflows/ci.yml` - JS and Rust CI gates.
- `.github/workflows/release-macos.yml` - release verification.
- `Cargo.lock` - Rust dependency graph, but no advisory tool is wired.

Current dependency versions:

```json
// apps/desktop/package.json:37
"@vitejs/plugin-react": "^5.1.1",
"electron-vite": "^4.0.0",
"vite": "^7.2.7",
"vitest": "^3.2.0"
```

Current lockfile pulls vulnerable `esbuild`:

```yaml
# pnpm-lock.yaml:5371
electron-vite@4.0.1(...):
  dependencies:
    esbuild: 0.25.12

# pnpm-lock.yaml:6565
vite@7.3.3(...):
  dependencies:
    esbuild: 0.27.7
```

`pnpm audit --prod --audit-level high` currently reports:

```text
high esbuild: Missing binary integrity verification in Deno module enables remote code execution via NPM_CONFIG_REGISTRY
Vulnerable versions >=0.17.0 <0.28.1
Patched versions >=0.28.1
Path apps__desktop>@tailwindcss/vite>vite>esbuild
```

`cargo audit --deny warnings` currently fails because the command is missing:

```text
error: no such command: `audit`
```

CI currently runs Rust fmt/clippy/test and JS format/lint/typecheck/tests, but
not advisory checks:

```yaml
# .github/workflows/ci.yml:36
- name: Format check
  run: cargo fmt --check --all
- name: Clippy
  run: cargo clippy -p videorc-backend -- -D warnings
```

Repo conventions:

- Keep verification commands explicit in `AGENTS.md` and package scripts.
- Do not commit generated artifacts outside lockfiles/package metadata.
- Prefer the smallest dependency change that makes the audit clean and keeps
  build/test green.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install/lock verify | `pnpm install --frozen-lockfile` | exit 0 |
| JS audit | `pnpm audit --prod --audit-level high` | exit 0 |
| Rust audit | `cargo audit --deny warnings` | exit 0 after tool install |
| TypeScript typecheck | `pnpm typecheck` | exit 0 |
| Desktop tests | `pnpm --filter @videorc/desktop test` | all pass |
| Node script tests | `pnpm test:scripts` | all pass |
| Rust tests | `cargo test -p videorc-backend` | all pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `apps/desktop/package.json`
- `pnpm-lock.yaml`
- `Cargo.lock` only if Rust dependency updates are required
- `.github/workflows/ci.yml`
- `.github/workflows/release-macos.yml`
- Optional `docs/distribution.md` or `AGENTS.md` update if commands change

**Out of scope**:

- Runtime media changes.
- Electron major-version migration unless required by the advisory fix.
- Ignoring advisories without a documented, time-bounded reason.

## Git workflow

- Branch: `codex/008-dependency-advisory-gates`
- Commit style: one dependency/audit commit, one CI wiring commit if useful.
- Do not push unless instructed.

## Steps

### Step 1: Fix the JS advisory cleanly

Run `pnpm why esbuild --recursive` and confirm whether the lock still resolves
`esbuild < 0.28.1`.

Preferred fix order:

1. Update direct packages (`vite`, `@vitejs/plugin-react`, `electron-vite`,
   `vitest`, `@tailwindcss/vite`) to versions whose resolved dependency is
   `esbuild >= 0.28.1`.
2. If upstream packages still lag but tests/build pass, add a targeted
   `pnpm.overrides.esbuild` entry to `package.json` with a short comment in the
   plan/status update explaining why.
3. Do not use a broad ignore unless no patched ecosystem path exists; if an
   ignore is unavoidable, STOP and ask for approval.

**Verify**:

```sh
pnpm install
pnpm why esbuild --recursive
pnpm audit --prod --audit-level high
```

Expected: all resolved `esbuild` versions are `>=0.28.1` and audit exits 0 for
high severity production advisories.

### Step 2: Add package scripts for advisory checks

Add root scripts:

```json
"audit:js": "pnpm audit --prod --audit-level high",
"audit:rust": "cargo audit --deny warnings",
"audit:deps": "pnpm audit:js && pnpm audit:rust"
```

If `cargo audit` is not installed locally, document the local install command in
the plan status or docs:

```sh
cargo install cargo-audit --locked
```

Do not make normal `pnpm install` run `cargo install`.

**Verify**: `pnpm audit:js` exits 0. `pnpm audit:rust` exits 0 after the tool is
installed.

### Step 3: Wire advisory checks into CI and release verification

In `.github/workflows/ci.yml`, add:

- a JS advisory step after `pnpm install --frozen-lockfile`
- a Rust advisory step after Rust setup/cache and before clippy/test

Use a maintained way to install/run `cargo-audit`. If using plain shell, keep it
explicit:

```yaml
- name: Install cargo-audit
  run: cargo install cargo-audit --locked
- name: Rust advisory audit
  run: cargo audit --deny warnings
```

In `.github/workflows/release-macos.yml`, either call `pnpm audit:deps` in
Verify or rely on CI being required before release tags. Prefer adding it to
release Verify if runtime is acceptable.

**Verify**: YAML format passes with `pnpm format:check`.

### Step 4: Run full repo gates

Run:

```sh
pnpm typecheck
pnpm --filter @videorc/desktop test
pnpm test:scripts
cargo test -p videorc-backend
cargo clippy -p videorc-backend -- -D warnings
```

Expected: all pass. If a package upgrade breaks build behavior, prefer updating
the smallest affected config over pinning back to a vulnerable version.

## Test plan

- Dependency checks:
  - `pnpm audit:js`
  - `pnpm audit:rust`
  - `pnpm audit:deps`
- Regression checks:
  - TS typecheck
  - desktop tests
  - Node script tests
  - Rust tests/clippy

## Done criteria

- [ ] `pnpm audit --prod --audit-level high` exits 0.
- [ ] `cargo audit --deny warnings` is available in CI and exits 0.
- [ ] Root scripts include JS, Rust, and combined advisory checks.
- [ ] CI runs advisory checks.
- [ ] Release verification runs advisory checks or clearly relies on required CI.
- [ ] Lockfile changes are limited to dependency/audit needs.
- [ ] Full TS/Rust test/lint gates pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Fixing `esbuild` requires an Electron/Vite major migration that breaks app
  boot or packaging.
- The only available path is ignoring the high advisory.
- Rust audit reports an advisory requiring a behavior-changing dependency
  migration.
- CI runtime for installing `cargo-audit` becomes unreasonable and needs a
  different action/cache choice.

## Maintenance notes

After this lands, advisory failures should be treated like lint failures. If an
advisory is accepted temporarily, it needs an explicit expiry and rationale, not
an invisible ignore.
