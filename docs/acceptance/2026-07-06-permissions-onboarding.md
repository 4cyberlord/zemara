# Acceptance — Permissions-only onboarding (PO1–PO4)

Date: 2026-07-06 · Branch: main (0229eeda → this commit)

## What shipped

- **PO1** (`0229eeda`): `PermissionsOnboardingDialog` — the three System
  access rows (shared `systemAccessRows()` derivation, never guessed) with
  the grant action each permission supports: camera/mic fire the native
  macOS prompt in place via the new `system:request-media-access` IPC
  (grant restarts the capture backend, mirroring the grant watcher);
  Screen Recording deep-links System Settings. A fresh mic grant is proven
  by a user-initiated meter sample.
- **PO2** (`933cfb3b`, prettier follow-up `8337836d`): the gate is now
  permission state, not a version flag. Evaluated once per launch, only
  after the backend connects and real device enumeration arrives (no
  flash while everything reads first-use), via the unit-tested
  `shouldShowPermissionsOnboarding` helper. The localStorage key
  (`videorc.onboardingComplete`) survives as a snooze: ANY stored value
  suppresses (existing installs and seeded probes keep working); new
  dismissals write `permissions-v1`. Settings gains "Set up permissions"
  in System access (force-open); "Replay onboarding" is gone.
- **PO3** (`1582275e`): the 4-step tour is deleted — workflow chooser
  (which wrote captureConfig from onboarding), setup checklist, privacy
  checkbox, finish picker. Fresh installs get the shipped capture
  defaults.

## Gate evidence (this machine, 2026-07-06)

| Gate | Result |
| --- | --- |
| `pnpm typecheck` / `lint` / `format:check` | PASS |
| Desktop unit tests | PASS (417; new gate-matrix + row tests in `system-access.test.ts`) |
| `pnpm smoke:dev` | PASS (recording + quality + poster gates; no dialog interference) |
| `scripts/ui-vibrancy-proof.mjs` (seeds `creator-ux-v1`) | PASS — any-value snooze keeps seeded probes suppressed |

Not run: fresh-profile packaged pass (needs a machine/profile without TCC
grants — dev machine has everything granted, so the gate correctly never
fires here; that is itself the all-granted acceptance case).

## Owner by-eye checklist

- [ ] Fresh profile (or `localStorage.removeItem('videorc.onboardingComplete')`
      + revoke a grant in System Settings): dialog shows once after backend
      connect, listing honest chips.
- [ ] Camera/Microphone "Enable" fires the native prompt in place; grant
      flips the chip live (backend restarts); deny flips the row to
      Not granted with "Open settings".
- [ ] Screen Recording "Open settings" deep-links; granting flips the chip
      without app relaunch (grant watcher).
- [ ] "Continue (without granting)" → relaunch → no dialog; gaps still
      surface via Sources alerts + Settings chips.
- [ ] All-granted machine + cleared flag → dialog never mounts.
- [ ] Settings → System access → "Set up permissions" force-opens the
      dialog even when all granted.
- [ ] What's New still appears for existing users on update (flag present
      → onboarding closed).
