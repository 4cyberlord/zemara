# Plan 027: Make automatic source fallbacks silent product-wide

> **Executor instructions**: This is a product polish and trust slice, not a
> dev-mode preference. Do not weaken source reconciliation. The app should still
> recover when a saved display, camera, or microphone is gone; it just must not
> announce successful recovery as warning UI. Keep the explanation in
> diagnostics/support evidence so support can ask for a bundle when someone has
> a real problem.
>
> **Drift check (run first)**: `git status --short --branch`; inspect
> `apps/desktop/src/renderer/src/lib/capture.ts`,
> `apps/desktop/src/renderer/src/hooks/use-studio.tsx`,
> `apps/desktop/src/renderer/src/components/tabs/sources-tab.tsx`,
> `apps/desktop/src/renderer/src/components/tabs/diagnostics-tab.tsx`, and the
> support-bundle export path around `diagnostics.supportBundle.export`. If the
> source reconciliation messages moved since `5910ad4e`, re-map the current
> equivalent before editing.

## Status

- **Priority**: P1 - startup currently looks like the app failed even when it
  recovered correctly.
- **Effort**: S-M.
- **Depends on**: Plan 018 support bundle diagnostics.
- **Category**: product polish, capture source selection, diagnostics.
- **Planned at**: commit `5910ad4e`, 2026-07-07.
- **Execution**: DONE 2026-07-07 on branch `codex/silent-source-fallbacks`.
  Startup/idle automatic fallback UI was removed product-wide; fallback
  selection remains intact; renderer fallback events are exported through the
  redacted support bundle. Gates passed: `pnpm --filter @videorc/desktop test`,
  `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:scripts`,
  `cargo test -p videorc-backend support_bundle`, `cargo fmt --check --all`.
  `pnpm smoke:recording-studio` was not run because the final code slice only
  removes source-fallback notification UI and adds diagnostics/support-bundle
  evidence; it does not change capture/session params, preview, recording
  output, encoding, or audio paths.

## Why this matters

When Videorc starts and a remembered device is unavailable, it currently shows
large warning toasts such as:

- `Capture source "Display 2" is unavailable, so Videorc selected "Display 1".`
- `Camera "Cam Link 4K" is unavailable, so Videorc selected "MacBook Pro Camera".`
- `Microphone "Shure MV7+" is unavailable, so Videorc selected "Fallback - MacBook Pro Microphone".`

Those messages are technically accurate but product-hostile. They describe an
implementation detail after the app has already self-healed. A normal launch
should feel calm: show the sources currently in use, warn only when the user has
an action to take, and keep the forensic trail in diagnostics.

## Current behavior

- `reconcileSourceSelection` in `capture.ts` correctly chooses a renderable
  fallback when remembered sources are missing.
- `sourceSelectionChangeMessages` builds user-facing strings for each automatic
  fallback.
- `use-studio.tsx` collects those messages in `sourceReconciliationMessages`,
  shows each one as a 10 second `toast.warning`, and stores them in
  `sourceFallbackNotices`.
- `sources-tab.tsx` renders the same messages again as a persistent yellow
  alert: `Videorc changed a capture source automatically.`
- Diagnostics/support export exists, but the automatic fallback history is not
  clearly owned as diagnostic evidence.

## Product rule

Automatic source recovery is not a warning.

User-facing UI should only warn when there is an actionable problem:

- no usable capture source exists
- camera, microphone, or screen permissions are missing
- the user explicitly picked a device and that action failed
- a source disappears during an active recording or stream and the recorded/live
  output may have changed

Startup and idle-session fallback should be silent product-wide. No dev-only
flag, no startup warning stack, no persistent yellow fallback alert.

## Slices

### S1 - Remove automatic fallback toasts

In `use-studio.tsx`, stop calling `toast.warning` for automatic reconciliation
messages produced while applying `reconcileSourceSelection`.

Keep the source selection state update exactly as-is. The app must still pick
the best available display/camera/microphone. Only the notification behavior
changes.

**Done when**: launching with missing saved devices produces no source-fallback
toast, and the selected source state still resolves to available devices.

### S2 - Remove the persistent Sources-tab fallback alert

Remove the public `sourceFallbackNotices` alert from `sources-tab.tsx`, along
with now-unused context values and dismiss callbacks if they no longer serve a
diagnostic purpose.

The Sources tab should show the current selected devices inline. It should not
keep a yellow "Videorc changed a capture source automatically" banner after a
successful self-heal.

**Done when**: the Sources tab shows the actual current capture/camera/mic
selection, with no automatic fallback alert for a recovered startup.

### S3 - Preserve fallback history as diagnostics

Keep an internal, redacted event record for automatic source fallback, for
example:

```json
{
  "kind": "automatic-source-fallback",
  "sourceKind": "camera",
  "previousName": "Cam Link 4K",
  "nextName": "MacBook Pro Camera",
  "sessionState": "idle",
  "occurredAt": "2026-07-07T21:01:33.000Z"
}
```

Route this into diagnostics/support bundle evidence rather than normal UI. The
executor should verify the current support-bundle ownership first; if the
backend export does not know renderer-only reconciliation events, pass a
redacted recent-event snapshot through the export request or add the nearest
existing diagnostics channel.

**Done when**: a support bundle can answer "why did Videorc pick this source?"
without showing startup warnings to every user.

### S4 - Keep actionable warnings, rewrite any remaining fallback copy

Inventory remaining warning paths around devices and source switching. Keep
warnings for failures the user can act on, but make them shorter and calmer:

- Good: `Camera permission needed.`
- Good: `No microphone is available.`
- Good: `Source changed while recording. Check the output before continuing.`
- Avoid: `"X" is unavailable, so Videorc selected "Y".`

If an active recording/stream source swap still needs a warning, make it
session-scoped and high-signal. Do not reuse startup fallback copy.

**Done when**: all product-visible source warnings are either permission/no
device/manual-action/live-session warnings, not automatic-startup fallback
notices.

### S5 - Add regression coverage

Keep existing tests that prove `reconcileSourceSelection` falls back correctly.
Add or update focused tests proving the product contract:

- automatic fallback still changes the selection to an available device
- idle/startup fallback does not enqueue a toast
- the Sources tab does not render the automatic fallback alert
- diagnostics/support evidence contains the fallback event

Use the smallest available test layer. If a hook-level toast test is awkward,
extract a pure helper that classifies reconciliation events into
`diagnostic-only` vs `user-visible`.

**Done when**: a future change cannot reintroduce startup warning stacks without
breaking tests.

### S6 - By-eye acceptance

Manually launch with stale saved devices:

- saved screen/display unavailable
- saved camera unavailable
- saved microphone unavailable

Expected product behavior:

- no startup fallback toasts
- no persistent fallback alert on Sources
- current selected devices are visible inline
- start/preview behavior still uses available devices
- support bundle or diagnostics contains the automatic fallback history

## Verification

Minimum deterministic gates:

```sh
pnpm --filter @videorc/desktop test
pnpm typecheck
pnpm lint
```

Because this touches capture source selection UI, run the relevant recording
studio gate before handoff unless the final code slice proves it only removed UI
notifications and did not alter capture/session params:

```sh
pnpm smoke:recording-studio
```

If the full recording-studio smoke is blocked locally, state the exact blocker
and run the closest focused source/preview smoke plus the desktop tests above.

## Non-negotiables

- Do not make this dev-only. The quieter behavior is the product behavior.
- Do not remove automatic fallback selection.
- Do not hide permission, no-device, manual-action, or live-session failures.
- Do not lose support evidence; fallback explanations belong in diagnostics.
- Do not show large yellow startup stacks for successful recovery.
