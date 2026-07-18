# Plan 010: Reconcile dead-code allowances and future media modules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the next
> step. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check (run first)**:
> `git diff --stat 3d217933..HEAD -- crates/videorc-backend/src/live_scene.rs crates/videorc-backend/src/live_render.rs crates/videorc-backend/src/live_pipeline.rs crates/videorc-backend/src/streaming.rs crates/videorc-backend/src/repair.rs crates/videorc-backend/src/main.rs crates/videorc-backend/src/recording.rs docs/native-4k-media-engine-refactor.md`
> If any in-scope file changed since this plan was written, compare the current
> excerpts below against live code. On mismatch, stop and report.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: Plans 005 and 006
- **Category**: tech-debt, docs
- **Planned at**: commit `3d217933`, 2026-06-13
- **Current status**: IN PROGRESS, 2026-06-13. The stale `streaming.rs`
  comment is corrected and the retained staged-media allowances are documented
  in `docs/native-4k-media-engine-refactor.md`. Destructive reconciliation of
  `live_scene.rs`, `live_render.rs`, `live_pipeline.rs`, and `repair.rs` waits
  for Plan 006 acceptance.

## Why this matters

Several Rust modules carry broad `#![allow(dead_code)]` because they were
introduced ahead of wiring. Some are probably still valuable architecture
pieces; others may now be obsolete because the product path moved to the
current compositor/VideoToolbox bridge. Broad dead-code allows make drift
invisible. This plan forces each future module to be promoted, retired, or
registered with a clear owner and expiry.

## Current state

Relevant files:

- `crates/videorc-backend/src/live_scene.rs` - active-session scene revision
  model, not wired to output.
- `crates/videorc-backend/src/live_render.rs` - live render consumer and
  compositor experiment.
- `crates/videorc-backend/src/live_pipeline.rs` - isolated threaded FFmpeg
  capture/composite/encode pipeline.
- `crates/videorc-backend/src/streaming.rs` - streaming target model; despite
  the old comment, many items are now consumed.
- `crates/videorc-backend/src/repair.rs` - recording quality analyzer and repair
  primitives.

Current broad allows:

```rust
// crates/videorc-backend/src/live_scene.rs:12
//! Introduced ahead of its protocol + state wiring, hence `allow(dead_code)`.
#![allow(dead_code)]
```

```rust
// crates/videorc-backend/src/live_render.rs:14
//! The real session pipeline wires this in next (LS3b); `allow(dead_code)` until then.
#![allow(dead_code)]
```

```rust
// crates/videorc-backend/src/live_pipeline.rs:9
//! This is the engine in isolation -- it is not yet wired into `start_session` / the
//! protocol (LS3b-3), and a single MKV is the only output ...
#![allow(dead_code)]
```

```rust
// crates/videorc-backend/src/streaming.rs:1
//! Multi-platform streaming target model (per-target). Mirrors the renderer's
//! `StreamingSettings`. Introduced in M1; wired into session start (M3) and the
//! FFmpeg `tee` fan-out (M4), so these items are intentionally not yet consumed
//! by the rest of the backend.
#![allow(dead_code)]
```

```rust
// crates/videorc-backend/src/repair.rs:8
//! post-recording gate, and the UI are later slices. Introduced ahead of its wiring,
//! hence `allow(dead_code)`.
#![allow(dead_code)]
```

Repo conventions:

- `cargo clippy -p videorc-backend -- -D warnings` is a required gate.
- Planned code should either move the native media engine forward or be cut.
- Do not remove useful tests just to make dead-code warnings disappear.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Search broad allows | `rg -n "#!\\[allow\\(dead_code\\)\\]|allow\\(dead_code\\)" crates/videorc-backend/src` | only intentional entries remain |
| Rust tests | `cargo test -p videorc-backend` | all non-ignored tests pass |
| Rust lint | `cargo clippy -p videorc-backend -- -D warnings` | exit 0 |
| Rust format | `cargo fmt --check --all` | exit 0 |

## Scope

**In scope**:

- Module-level dead-code allowances in backend Rust source
- Documentation/comments explaining retained planned code
- Targeted tests when promoting code
- Deleting obsolete planned modules only when tests and imports prove unused

**Out of scope**:

- Implementing true split-output streaming. That is Plan 006.
- Rewriting recording repair UI.
- Removing active streaming model code that is used by current product flows.

## Git workflow

- Branch: `codex/010-dead-code-reconciliation`
- Commit style: one module classification per commit if changes are non-trivial.
- Do not push unless instructed.

## Steps

### Step 1: Inventory all dead-code allowances

Run:

```sh
rg -n "#!\\[allow\\(dead_code\\)\\]|allow\\(dead_code\\)" crates/videorc-backend/src
```

Create a temporary local checklist while working. Classify each allowance:

- **Promote**: code is part of the current product path and should be wired or
  made reachable.
- **Retain planned**: code is intentionally staged for a named future plan.
- **Retire**: code is obsolete and should be deleted.

Do not commit the temporary checklist unless you turn it into maintained docs.

**Verify**: every allowance has a classification before code changes begin.

### Step 2: Fix stale comments first

`streaming.rs` is already consumed by session start, preflight, storage, and
renderer protocol paths. Its top comment saying items are not consumed is stale.

Update comments before deleting or moving anything. If removing
`#![allow(dead_code)]` from `streaming.rs` produces only a small number of
warnings, prefer targeted fixes or targeted `#[allow(dead_code)]` on genuinely
future items.

**Verify**:

```sh
cargo clippy -p videorc-backend -- -D warnings
```

### Step 3: Reconcile live-scene/live-render/live-pipeline against Plan 006

After Plan 006 is complete, compare these modules with the accepted split-output
engine:

- If the live pipeline is obsolete rawvideo/FFmpeg-filter architecture, delete
  it and its tests.
- If the scene revision model is still the right model for live layout/device
  edits, keep it but remove broad module-level allows by wiring the public
  pieces or narrowing allows.
- If any module remains planned, add a short maintained note in
  `docs/native-4k-media-engine-refactor.md` with:
  - owner plan number
  - why it is retained
  - what will cause deletion

**Verify**: `cargo test -p videorc-backend live_` exits 0 or, if tests were
deleted with obsolete code, `cargo test -p videorc-backend` exits 0.

### Step 4: Reconcile repair.rs

Decide whether `repair.rs` is active product code or a future maintenance slice:

- If active, wire enough of it into current post-recording gates or analyzer
  scripts so module-level dead-code allow can be removed.
- If future, retain it with a named plan/doc reference and narrow the allow to
  specific not-yet-wired public functions.
- If obsolete, delete it and remove imports/tests.

Do not change recording repair behavior in this plan unless the module is
already called from current code.

**Verify**: `cargo test -p videorc-backend repair` and full Rust tests pass.

### Step 5: Leave a maintained registry only if needed

If any broad or targeted dead-code allowances remain, document them in either:

- comments next to the specific item, or
- a small section in `docs/native-4k-media-engine-refactor.md`

Each retained item must have:

- reason retained
- plan or milestone that will wire/delete it
- acceptance condition

**Verify**:

```sh
rg -n "#!\\[allow\\(dead_code\\)\\]" crates/videorc-backend/src
```

Expected: no broad module-level allows remain, or every remaining broad allow is
documented with a specific active plan reference.

## Test plan

- Rust:
  - `cargo test -p videorc-backend`
  - targeted module filters for `live_`, `streaming`, and `repair`
  - `cargo clippy -p videorc-backend -- -D warnings`
- Search:
  - dead-code allowances reduced and documented

## Done criteria

- [x] Stale comments about consumed streaming code are corrected.
- [x] Each in-scope module-level dead-code allowance is promoted, retained with a plan reference, or
      retired.
- [ ] Broad module-level allows are removed where practical.
- [ ] No product-path code is deleted just to satisfy clippy.
- [ ] `cargo fmt --check --all`, `cargo test -p videorc-backend`, and
      `cargo clippy -p videorc-backend -- -D warnings` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Plan 006 has not landed and the live pipeline's future cannot be judged.
- Removing an allow reveals a large architecture dependency.
- Deleting code would remove tests for behavior still planned for the native
  media engine.
- The cleanup starts implementing new media behavior instead of reconciling
  planned code.

## Maintenance notes

Dead code is not automatically bad in a fast media-engine refactor, but hidden
dead code is expensive. The goal is to keep future architecture visible enough
that it can be reviewed, promoted, or cut deliberately.
