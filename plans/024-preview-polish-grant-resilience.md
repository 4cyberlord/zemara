# Plan 024: Grant-toast stack, blind support bundle, preview start-stretch + click-flash hint

> **Executor instructions**: Sources = one external tester (Robin) support
> bundle `videorc-support-bundle-20260707-122837Z.json` + owner-reproduced
> preview issues. Every root cause below was independently verified against the
> code; three CONFIRMED, one REVISED (S3 — the compositor does **not**
> lag-then-catch-up; it composes at a frozen create-time size — use the
> corrected mechanism, not the original draft's).
>
> **Order is load-bearing.** S1 (P0 grant-toast stack) leads — it is a scary
> wall of red for an *expected* restart. S2 (P1 blind bundle) comes **second
> and before all preview work** because until it lands, every future support
> bundle is version-blind and un-triageable — it gates our ability to diagnose
> S3/S4/S5 on real machines. Native-preview slices (S3, S4) need the preview
> probes, **not typecheck alone**. Backend slices (S2, S3) need `cargo`.
>
> **Drift check (run first)**: `git status --short --branch`. Re-read these
> exact seams if anything moved since `cf9c9c7a`:
> `apps/desktop/src/renderer/src/hooks/use-studio.tsx` (`reportError` ~1315,
> `refreshBackend` ~2650, `wsStatusRef` ~836), `apps/desktop/src/main/index.ts`
> (`updatePreviewWindowWaitDetail` ~409, PREVIEW_WINDOW_HTML `.hint` ~2184,
> focus→placement ~2274 / ~1925), `crates/videorc-backend/src/support_bundle.rs`
> (`SupportBundleApp.version` ~178, params ~21), `crates/videorc-backend/src/
> metal_compositor.rs` (`encode_texture_present` ~1408, `present_latest_to_layer`
> ~735), and `crates/videorc-backend/src/compositor.rs`
> (`run_synthetic_compositor_loop` ~1149). If line numbers drifted, re-grep for
> the named function — the seam is the function, not the number.

## Status

- **Priority**: P0 (S1) → P1 (S2) → P2 preview polish (S3, S4) → P1/P2 bundle-signal follow-ups (S5, S6)
- **Effort**: M–L (S3 has a native compositor-sizing decision; the rest are scoped)
- **Depends on**: nothing external; S3/S4 by-eye need a real camera (Cam Link 4K reproduces best)
- **Category**: renderer resilience, diagnostics, native preview
- **Planned at**: commit `cf9c9c7a`, 2026-07-07
- **Execution**: EXECUTED 2026-07-07 (S1 `052964af`, S2 `e221b275`, S4
  `9091486d`, S3 `07f8c84b`, S5 `7c271796` on main, pushed per slice). S6 =
  owner-triage list (no code). Chosen open-decision answers: S1 suppress
  transient toasts while `wsStatus !== connected` + keyed id for connected
  blips; S2 overwrite the bundle's `health.version` copy (not the shared
  `backend_health()`), schema bumped 1→2, `commit`-SHA injection (build.rs)
  DEFERRED to the Release owner (`commit` stays null); S3 shipped the
  letterbox present (option A) — the deeper compose-at-output seam is a
  follow-up if the transient bars are visible by-eye. Each root cause was
  adversarially verified before coding (the workflow refuted the original
  watchdog-repaint and compositor-lag theories). Gates PASS per slice
  (desktop unit tests, cargo, probe:preview-lifecycle). PENDING owner by-eye:
  (1) first-ever grant → calm badge, no red stack; (2) export a bundle on
  0.9.16 → app.version + health.version both 0.9.16, schemaVersion 2;
  (3) Cam Link preview → no start-stretch; (4) click a live preview → no
  flashing text; (5) Cam Link camera → the 4K@25 shortfall warning.

## Reports + evidence (verified)

1. **P0 — First-ever capture-permission grant paints a STACK of identical red
   "Backend WebSocket is not connected." toasts** (screenshot showed 3).
   CONFIRMED. A fresh grant intentionally restarts the backend
   (`media-access.ts:56`, FX1), dropping the WS for ~1s. Multiple auto-firing
   renderer paths call `client.request(...)` into the non-OPEN socket; each
   rejects with the exact string minted at `backendClient.ts:56`; they all
   funnel into `reportError` (`use-studio.tsx:1315`) whose last line is an
   **unkeyed** `toast.error(message)` (1322), and sonner does not de-dupe
   unkeyed toasts. The Session badge already narrates the same window
   ("Connecting…" / "Backend offline"), so the toasts are pure redundant noise.

2. **P1 — Support bundle is version-blind**: `app.version` = `"0.9.0"`,
   `commit: null`, while the shipped app is `0.9.16`. CONFIRMED.
   `SupportBundleApp.version = env!("CARGO_PKG_VERSION")` reads the **backend
   crate** version (`Cargo.toml:3` = `0.9.0`), never the Electron app version
   (`package.json:3` = `0.9.16`). `commit` is `null` because no build step
   injects any git SHA. A second blind field, `health.version`
   (`main.rs:3276`), reads the same crate version. Every remote report is
   un-triageable by build.

3. **P2 — Native preview is briefly (~3%) horizontally stretched for the first
   frames, then settles** (owner; Cam Link 4K 3840x2160@25, camera-only scene).
   **REVISED** (see S3). The present is a stretch-to-fill blit
   (`encode_texture_present`, `metal_compositor.rs:1423`) with no aspect
   preservation. The verifier **refuted the original "compositor lags then
   catches up on next compose" mechanism**: the synthetic preview compositor
   composes at a **fixed width/height captured once at surface-create time**
   (`compositor.rs:1149→1236→2668`) and never adopts later bounds —
   `update_compositor_surface_size` only mutates a cosmetic status struct
   (`compositor.rs:684`) and is a no-op for compositing. The real mismatch is
   (live drawable aspect, which tracks every bounds update) vs (compositor's
   **frozen** create-time aspect); it "settles" when the drawable **conforms
   back** to the create aspect (`index.ts:2267` resize handler), not because the
   compositor moves.

4. **P2 — Clicking a HEALTHY live preview flashes "Waiting for preview" text on,
   then off**. CONFIRMED. The `.hint` fallback HTML is **permanently in the
   preview-window DOM** (`index.ts:2192-2194`) and is only ever *occluded*, not
   hidden — `updatePreviewWindowWaitDetail` (`index.ts:409`) edits only its
   textContent, never its visibility. The native video is a **separate helper
   NSWindow** kept above the preview via per-command `orderAboveWindowId`
   (`index.ts:3640`), **not** an AppKit child (`setParentWindow` is used only
   for docked chrome / main window, `index.ts:2348`). A click raises the preview
   window above the order-above helper, uncovering the hint; the two async
   focus→placement re-kicks (`index.ts:2274` and `index.ts:1925`) re-cover it one
   IPC hop later. The pointer's original "watchdog repaints the hint" framing was
   **refuted**: no focus/click path calls `updatePreviewWindowWaitDetail` or
   `setFirstFrameStatus('pending')` — those live only in the watchdog ticks.

5. **P1/P2/P3 — Extra bundle signals** (Cam Link locked to 4K@25 single format;
   preview-source 1963 dropped frames with `transport: unavailable`; AirPods as
   default mic over a wired Shure; plaintext secret store; and others). Folded
   into S5 (the P1 degenerate-format one, actionable) and the **"Also noticed"**
   list — owner decides scope. None are silently dropped.

---

## S1 — Grant-toast stack: one seam, suppress-while-not-connected (P0)

**Root cause (CONFIRMED).** A fresh grant restarts the backend; during the
~1s `closed → connecting → connected` window, auto-firing paths reject with the
transient string and each paints its own unkeyed card. The multi-firing is real:
`refreshBackend` (`use-studio.tsx:2650`) is gated **only** by `if (!client)`
(2651) — never by `wsStatus` — and is wired to **two independent** window
`focus` listeners that both fire on TCC-prompt focus-return
(`permissions-onboarding-dialog.tsx:57` and `settings-tab.tsx:112`). At
close-time `client` is still the **old** object (`setClient(null)` is deferred to
the effect cleanup at 2558), so `if (!client)` passes and its `Promise.all` of
~13 requests all hit the CLOSED socket. The verifier added that the vulnerable
window is **broader** than "client still old": after the new connection arrives
the effect runs `setClient(nextClient)` (2238) then `setWsStatus('connecting')`
(2239) **before** `connect()` resolves — so a focus→refreshBackend during
`connecting` also rejects on the new client's not-yet-OPEN ws. This is exactly
why the guard must be `wsStatus !== 'connected'`, not `!client`.

**Exact fix seam (single edit covers all paths).** `reportError` in
`apps/desktop/src/renderer/src/hooks/use-studio.tsx` (1315-1323) — every
auto-firing toast path funnels here (`refreshBackend` catch 2714-2715, the
reloadScene 250ms timer `.catch(reportError)` 2732, the connect() catch
2528-2529).

1. Add a pure predicate `isTransientBackendError(message: string): boolean` that
   matches **exactly** the three strings `BackendClient` can mint:
   `'Backend WebSocket is not connected.'` (`backendClient.ts:56`),
   `'Backend connection closed.'` (`backendClient.ts:40`), and
   `'Could not connect to the Rust backend.'` (`backendClient.ts:36`). Keep it a
   standalone exported helper in a decision-core module so it is unit-testable
   without React. Do **not** match the different `'Backend socket is not
   connected.'` pre-check guard string (that one is a user-gesture guard, a
   separate concern).
2. In `reportError`: always `setLastError(message)` (preserve the diagnostic
   record). But when `isTransientBackendError(message)` **and**
   `wsStatusRef.current !== 'connected'` (`wsStatusRef` is already maintained at
   `use-studio.tsx:836`, in scope, adds no deps), **skip the toast entirely** —
   the `data-videorc-session-status` badge already renders "Connecting…" /
   "Backend offline" for that window (`studio-session-view.ts:80-89`).
3. Belt-and-suspenders for a genuine *connected-state* transport blip: route any
   transient message that DOES toast through a single keyed id,
   `toast.error(message, { id: 'backend-transport' })`, so even a connected-state
   flap collapses to one card instead of stacking. (Keyed-id alone is
   insufficient as the whole fix — it would still flash a spurious red card while
   the badge already says "connecting"; suppression-while-not-connected is the
   primary behavior.)
4. Optional hardening (recommended, low-risk): add a `wsStatusRef.current ===
   'connected'` short-circuit at the top of `refreshBackend` (2651) so it does
   not fan out 13 doomed requests during the restart window at all. Do **not**
   change the `focus` listeners' existence — S1 must not regress the plan-021
   focus-re-kick recovery behavior.

**Decision-core unit-test invariant (required).**
`pnpm --filter @videorc/desktop test`, new test on `isTransientBackendError` +
the suppression predicate:
- All three mintable strings classify transient; a genuine RPC error message
  (e.g. `'Scene apply failed: …'`) classifies non-transient.
- Invariant: `shouldToast(message, wsStatus)` returns **false** for every
  transient string while `wsStatus !== 'connected'`, and **true** for a
  non-transient message at any `wsStatus`, and **true** for a transient string
  while `wsStatus === 'connected'` (the connected-state blip still toasts, once,
  keyed).

**Done when.** A first-ever camera/mic grant that restarts the backend shows **at
most** the calm badge state ("Connecting…" → "Backend offline"), **never** a
stack of red toasts. A genuine mid-session backend failure (`wsStatus ===
'connected'`) still surfaces exactly one keyed toast. Unit test green.

**Verification gate.** `pnpm --filter @videorc/desktop test` (decision-core
invariant) + `pnpm typecheck && pnpm lint && pnpm format:check`. Owner by-eye:
grant a permission for the first time on a fresh profile, watch for the calm
badge with no red stack.

---

## S2 — Support bundle reports the real app version + commit (P1, blocks triage)

**Root cause (CONFIRMED).** `SupportBundleApp.version = env!("CARGO_PKG_VERSION")`
(`support_bundle.rs:178`) resolves to the backend **crate** version pinned at
`crates/videorc-backend/Cargo.toml:3` = `"0.9.0"`, decoupled from the Electron
app version (`apps/desktop/package.json:3` = `"0.9.16"`, surfaced via
`app.getVersion()` in `runtime-info.ts:69`). `commit` is `null` because
`support_bundle_commit()` (`support_bundle.rs:370-375`) reads three `option_env!`
SHAs that no build step sets (no `build.rs` in the crate; grep of `scripts/`
finds only unrelated smoke `git rev-parse` calls). A second blind field,
`health.version` (`main.rs:3276`), uses the same `env!` and is threaded into the
bundle at `main.rs:3319`.

**Do NOT stamp main-side.** The export goes renderer→backend over a **direct**
`ws://` (`backendClient.ts:52`); the backend writes the JSON to disk and returns
only `{ path, includedSections, redactionSummary }` (`support_bundle.rs:28-32`),
so main is not in the body path and would have to re-read/patch/rewrite the file
— racy. Thread the value through the export IPC instead.

**Exact fix seam.**
1. Add `app_version: Option<String>` to `SupportBundleExportParams`
   (`support_bundle.rs:21`) and `app_version: Option<String>` to
   `SupportBundleExportInput` (`support_bundle.rs:35`).
2. In `build_support_bundle` (`support_bundle.rs:177-182`) set
   `version: input.app_version.filter(|v| !v.is_empty()).unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())`
   — a missing/empty param degrades to the crate version rather than empty
   (guards the case where `runtimeInfo` is still `null` when the button is
   clicked).
3. In `export_support_bundle_for_state` (`main.rs:3316`) forward
   `app_version: params.app_version` into the input.
4. In the renderer, `exportSupportBundle` (`use-studio.tsx:4006-4011`) pass
   `appVersion: runtimeInfo?.version` alongside `ffmpegPath` (`runtimeInfo` is in
   scope at `use-studio.tsx:1212`).
5. **Fix the parallel blind field.** The cleanest single-point fix is to
   overwrite `input.health.version` inside `build_support_bundle` from the same
   resolved app version — the verifier flagged that piping `app_version` into
   `backend_health()` (`main.rs:3273`) is a **shared** builder used by the
   general health RPC too, so changing its signature touches all callers. Prefer
   overwriting the bundle copy in `build_support_bundle` over changing
   `backend_health()`. (See Open decision 2.)
6. **commit (SEPARATE, larger).** No git SHA exists anywhere in the JS or Rust
   build. Cleanest fix: add a `build.rs` to `crates/videorc-backend` that runs
   `git rev-parse --short HEAD` and emits
   `cargo:rustc-env=VIDEORC_GIT_SHA` (which `support_bundle_commit()` already
   reads at 370), wired into `dist:release`. This is a release-process change —
   see Open decision 3 (short vs full SHA; clean/tagged tree). If the owner defers
   this, ship steps 1-5 now and leave `commit: null` tracked.
7. Bump `SCHEMA_VERSION` (`support_bundle.rs:15`) from `1 → 2`: `app.version`
   semantics change from crate-version to app-version and remote triage keys off
   `schemaVersion`. (Confirm the report-intake side's parse strictness — Open
   decision, out of this repo.)

Redactor is safe: `redact_string` (`support_bundle.rs:225`) keys off
secret/token/path patterns; a semver or hex SHA matches none, so it will not
silently undo the fix — no redactor change needed.

**Done when.** A fresh bundle shows the packaged app version (`0.9.16`, not
`0.9.0`) in **both** `app.version` and `health.version`; `schemaVersion` is `2`;
and (if step 6 landed) `app.commit` is a real SHA. Falls back to the crate
version — never empty — if `runtimeInfo.version` is unset at click time.

**Verification gate.** `cargo test -p videorc-backend support_bundle`,
`cargo fmt --check --all`, `cargo clippy -p videorc-backend -- -D warnings`,
`pnpm typecheck` (renderer/IPC change). If a verifier script asserts bundle
shape, `pnpm test:scripts`. Owner by-eye: export a bundle on packaged 0.9.16 and
read the version + commit.

---

## S3 — Preview start-stretch: aspect-safe present + compose at output size (P2, native preview)

**Root cause (REVISED — use this, not the original draft).** The verifier
confirmed the *symptom amplifier* and *primary fix seam* but **refuted the
compositor-lag mechanism**:

- CONFIRMED: the present is pure stretch-to-fill — `encode_texture_present`
  (`metal_compositor.rs:1423`) renders `quad_vertices([0,0,1,1])` with
  `crop=[0;4]`; `FragParams.aspect=1.0` feeds only the circle mask, not the blit.
  `present_latest_to_layer` (`metal_compositor.rs:735`) presents with **zero**
  comparison of target aspect vs the layer drawable aspect. The drawable is
  resized **synchronously** on every bounds update
  (`native_preview_host.rs:330 setDrawableSize`), so it tracks the live
  preview-window/slot aspect frame-for-frame.
- REFUTED: the compositor does **not** rebuild its target "on the next compose"
  and catch up. `run_synthetic_compositor_loop` destructures `params.width/height`
  into **immutable** locals once (`compositor.rs:1149-1150`) and composes at that
  fixed size every tick (`compositor.rs:1236 → publish_auxiliary_compositor_frame
  2668`). `update_compositor_surface_size` (`compositor.rs:677-701`) only mutates
  a **cosmetic** `status` struct (684-685) + emits an event;
  `register_preview_surface_resize` (`preview_surface.rs:343`) only bumps a
  diagnostics counter. Neither restarts the loop, so `ensure_target_texture`'s
  resize branch (`metal_compositor.rs:771`) **never fires mid-run**. The
  compositor's composed aspect is **frozen at create time**.
- Therefore the mismatch is (live drawable aspect) vs (frozen create-time
  compositor aspect). It "settles" when the drawable **conforms back** — the
  window-resize handler calls `conformPreviewWindowToAspect`
  (`index.ts:2267-2270`) which pulls a transient/squeezed window aspect back to
  the locked output aspect the compositor was created at — **not** because the
  compositor moves. Post-open bounds changes dispatch the `update` host command
  (`index.ts:3676`), never a compositor restart.

The original draft's "hold the surface hidden until drawable matches" and
"resize the compositor target before the drawable command" are **both wrong**:
the second relies on `update_compositor_surface_size` resizing the compose target,
which it does not (it is a no-op for compositing).

**Exact fix seam.**
- **Primary (kills the visible symptom regardless of the sizing bug).** Make the
  present aspect-safe at the single choke point where both sizes are known —
  `MetalSceneCompositor::present_latest_to_layer` (`metal_compositor.rs:735`) /
  `encode_texture_present` (`metal_compositor.rs:1408`). Pass the target dims
  (`self.target_width/height`) and the layer `drawableSize`, then either:
  - **(A) letterbox** — compute a fitted dest quad via `quad_vertices` instead of
    `[0,0,1,1]` so a transient mismatch shows as a correct letterbox, not a
    stretch (robust; also protects any future path where the two legitimately
    differ for a frame); or
  - **(B) skip-on-mismatch** — drop the present when
    `|target_aspect - drawable_aspect| > epsilon` until they agree (smallest
    correct fix, since by contract they must be equal).

  Ship (A) or (B) — this alone resolves the reported stretch.
- **Contributing seam (removes the mismatch at the source — CORRECTED).** Do
  **not** touch `update_preview_surface_bounds`'s `update_compositor_surface_size`
  ordering; it is cosmetic and changes nothing on screen. Instead **compose the
  preview at the FIXED output resolution/aspect** rather than the slot bounds:
  the slot and drawable are already output-aspect-locked
  (`preview-stage.tsx:89` `previewAspectRatio` from `captureConfig.video`;
  `preview-stage.tsx:138` dock slot output-locked), so composing at output dims
  makes `target_aspect == drawable_aspect` **by construction** and the blit
  becomes a lossless 1:1 scale — the transient vanishes regardless of bounds
  wobble. The compose size currently comes from surface **bounds (points)**
  (`preview_surface.rs:130/154`) and is then frozen; changing the create-time
  size source to the output resolution is the deeper fix. (Alternative: make
  `run_synthetic_compositor_loop` re-read `compositor.status.width/height` each
  tick and feed `ensure_target_texture` — larger, and unnecessary if compose-at-
  output lands.)

**Probe (required — closes the coverage hole that let this ship).**
`scripts/preview-window-probe.mjs` currently asserts only
`drawable_px == bounds_pts * scale` (a resolution check, ~197-213) and ingests
the sizing lines (~39-52). Add an assertion that the **compositor target aspect
equals the drawable aspect at present time**, across a source/output aspect
**mismatch** (e.g. a 15.5:9 window/slot transient → 16:9 output), for every
present in the first ~1s after open and after each resize. **Caveat carried from
the verifier**: the target-size log the probe reads must reflect the **composed**
size (fixed create-time dims), not `status.width` — else the probe reports a
false match. Add a compositor target-size log line if one does not already exist.

**Done when.** Opening the preview with a source/window aspect that differs from
the output shows **no stretch at any point** — the fallback→native hand-off is
aspect-stable. The probe asserts `|drawable_aspect - composed_target_aspect| <
0.5%` on every present. Owner by-eye on the Cam Link 4K (camera-only scene, the
exact repro).

**Verification gate.** `cargo test -p videorc-backend` + `cargo clippy` +
`cargo fmt --check --all` (compositor change) **and**
`pnpm probe:preview-lifecycle` + the extended `scripts/preview-window-probe.mjs`
(native-preview change — typecheck alone is insufficient per AGENTS.md). Note the
known env limitation: `smoke:screen-recording-real` may be blocked on an
unattended/in-use display; if so, state it and run the closest focused preview
probe.

---

## S4 — Click-flash "Waiting for preview" hint (P2, native preview)

**Root cause (CONFIRMED).** The `.hint` block ("Waiting for preview" title +
`#videorc-wait-detail`) is **permanently in the DOM** (`index.ts:2192-2194`);
nothing sets `display:none`, so it is hidden ONLY by occlusion.
`updatePreviewWindowWaitDetail` (`index.ts:409`) edits only the element's
textContent — never `.hint` visibility. The native video is a **separate helper
NSWindow** (spawned child process, `native-preview-helper-process-driver.ts:372`)
kept above the preview via per-command imperative `orderAboveWindowId`
(`index.ts:3640`), **not** an AppKit child window (`setParentWindow` is docked-
chrome/main only, `index.ts:2348`). A click raises the preview window above the
order-above helper → the hint shows through ("appears"); the two async re-kicks —
the window's own `focus` → `pushPreviewWindowPlacement` (`index.ts:2274`) and app
`browser-window-focus` → `setNativePreviewSurfacesVisible(true)`
(`index.ts:1925`) — re-apply `orderAboveWindowId` one IPC hop later, re-covering
it ("disappears"). Occlusion geometry confirmed: the helper covers the region
below the 28px drag bar (`index.ts:2163`), exactly the flashing area.

**The watchdog is NOT involved** (verifier refuted the original framing): every
caller of `updatePreviewWindowWaitDetail` / `setFirstFrameStatus('pending')` is
inside the two watchdog ticks (`index.ts:504-525`, `549-567`) plus
`startFirstFrameWatchdog` (384), which runs **only** at preview-window open
(`index.ts:2339`). No focus/click/bounds path repaints the hint or flips the
contract. 'observing' ticks are silent (554-557); 'presenting' repaints only
`null`, deduped (411); 'heal'/'stalled' need 3 sustained broken ticks (~2.25s) a
one-frame focus flip cannot produce.

**Exact fix seam (two, in order of correctness).**
1. **PRIMARY — kill the visible symptom.** `updatePreviewWindowWaitDetail`
   (`index.ts:409`): in addition to editing the text, **toggle the `.hint`
   container's visibility** — hide `.hint` (`display:none` / `opacity:0`) when the
   text is `null` (contract met / recovered) and show it again when a real reason
   is painted. Then a z-order flash uncovers only the solid
   `DARK_WINDOW_PALETTE.base` surface, never the words. The initial open state
   stays correct: the HTML ships with `.hint` visible and `null` is passed only on
   'met'/'recovered'.
2. **ROBUST — remove the flash entirely (native, larger; optional).** Make the
   helper surface a **true child** of the preview window (`addChildWindow` /
   NSWindow child ordering in the helper driver, mirroring the `setParentWindow`
   pattern at `index.ts:2348`) so AppKit keeps it atomically above on raise with
   no async re-order gap. **Blocked-on caveat**: the exact stacking call lives in
   the **prebuilt** helper binary (no Swift/ObjC source in-repo); whether the
   helper protocol supports child ordering is unverifiable statically. Ship (1)
   now; scope (2) only if the helper source/protocol is available.

**Decision-core unit-test invariant (required).** Unit test on `assessPresenting`
/ the presenting-watch decision core: the sequence `met → (single broken tick
simulating a focus re-kick) → met` **never surfaces a non-empty wait-detail** —
'observing' stays silent, recovery paints only `null`, and only ≥3 sustained
broken ticks ('heal'/'stalled') produce a reason string.

**Regression guard (required).** The existing `exercise-preview-click-focus`
smoke (`index.ts:5953`, assertions ~5992-6001) only checks `state==live` / frames
advance / window open — it structurally cannot catch this flash. Extend it to
assert, after each click, that `#videorc-wait-detail` is **not** the front-most
pixels at the surface rect (CGWindowList z-order or a pixel probe), not merely
that frames keep advancing.

**Done when.** Clicking a live, healthy preview shows **no** flashing text
(seam 1). The decision-core unit test pins the presenting-watch hint invariant.
The click-focus smoke asserts the hint is never front-most. Owner by-eye.

**Verification gate.** `pnpm --filter @videorc/desktop test` (decision-core
invariant) + `pnpm probe:preview-lifecycle` + the extended
`exercise-preview-click-focus` smoke (native-preview change — not typecheck
alone) + `pnpm typecheck && pnpm lint`.

---

## S5 — Degenerate single-format camera guidance (P1 bundle signal)

**Signal (P1).** The active Cam Link 4K enumerated **exactly one** format —
`[{width:3840,height:2160,minFps:25,maxFps:25}]` — so it can never satisfy a
30fps or 1080p request: `previewCameraSelectedFormat*` = 3840x2160@25,
`previewCameraSourceFps=24.994`, status = *"Requested 1280x720@30 was not
available; selected native 3840x2160 at 25-25 fps"*. The Cam Link mirrors an HDMI
source feeding 4K/25p (PAL), so **every** capture/recording off it will be 25fps
and there is no in-app way to know why.

**Scope.** Detect the degenerate single-format (or "no format matched the
requested fps") case and surface **actionable** guidance rather than a silent
fallback: e.g. "This camera only offers 4K@25 — set the connected HDMI camera to
1080p30/60 (NTSC)," plus a warning that the running framerate (25) does not match
the requested (30). This is a scoped renderer/status-copy change (UI taste →
consult `.claude/skills/videorc-design/SKILL.md`; shadcn-only). **Owner decides**
whether it ships in this plan or splits out.

**Done when.** A camera whose only enumerated format cannot meet the requested
resolution/fps shows an explicit, actionable message naming the mismatch (not a
generic fallback line). **Verification gate.** `pnpm --filter @videorc/desktop
test` (pure detection helper unit test) + `pnpm typecheck && pnpm lint`; owner
by-eye on the Cam Link.

---

## S6 — Also noticed in the support bundle (owner triage; do NOT drop)

None of these are silently dropped — the owner decides scope. Severity carried
from the analysis.

| # | Severity | Signal | Recommendation / seam pointer |
|---|----------|--------|-------------------------------|
| 1 | **P2** | Preview source dropped **1963** frames with `previewSourcePixelsPresent=false`, `previewTransport='unavailable'`, `previewSurfaceBacking='none'` — yet camera (24.99fps) and screen (30fps) sources are `live`. | Distinct from S3's stretch (that state is `transport=unavailable` + `backing=none`). Likely an idle/detached-surface snapshot (`compositorBackend=null`), but the drop counter is high enough to be a real delivery stall. Investigate whether the per-source preview present path is actually attached when idle. **Diagnose route** if it reproduces during a real recording. |
| 2 | **P2** | Default mic is **Bluetooth AirPods** while a wired **Shure MV7** (`microphone:coreaudio:134`) is connected. | AirPods force HFP/SCO (~16kHz) and, per this project's mic-silent history, BT inputs are most prone to TCC silent-zero frames. Warn when the selected/default input is a BT headset while a wired studio mic is available; suggest the Shure. |
| 3 | **P2** | Secret store backend is `json-file`, not Keychain (`health.secretStoreBackend='json-file'`). | OAuth tokens + RTMP stream keys persisted to on-disk JSON. **Confirm this is an intended fallback and not a signed-build entitlement/packaging regression.** If a fallback, treat an unexpected `json-file` backend as a security signal worth surfacing (keys readable at rest). |
| 4 | **P3** | `entitlements.source='local-default'`, tier `basic`, cloud-AI + multistreaming disabled. | No account entitlement hydrated (user likely not signed in this session; OAuth listener at 17995 never completed). Benign if genuinely basic; rule out given the entitlement-hydration history. |
| 5 | **P3** | Native AVFoundation enumeration **drops the iPhone Desk View camera** the FFmpeg fallback path sees (9 fallback vs 8 native). | Align the two enumerators so a device isn't visible on one path but not the other. |
| 6 | **P3** | Videorc's own windows are **not excluded** from screen capture (`previewScreenMessage: '… Videorc windows excluded no'`). | Full-screen recording/stream will contain the app window + live preview → hall-of-mirrors risk. Default self-exclusion on, or expose it clearly. |
| 7 | **P3** | Occasional camera capture hitch — one ~69ms gap vs 40ms cadence (`previewCameraCaptureGapMaxMs=68.796`). | Isolated dropped/late frame → momentary judder. Low priority; watch if it grows under recording load. |
| 8 | **P3** | Capability probe vs live preview request **different resolutions** for the same device (1080p30 vs 720p30). | Harmless here (both fall back to the only format) but confusing in logs. Unify the requested-format source of truth. |
| 9 | **P3** | `app.commit=null`. | Covered by **S2 step 6** (build-time SHA injection). Listed here for completeness. |

**Benign (no action, logged for the record):** screen capture queue depth seeded
at 3 with 0 drops (normal buffered pipeline); system-audio `unavailable` (known
native-adapter gap); no audio-meter/mic metrics (no session ran, `recording:idle`);
Continuity Camera at 640x480 (not fully negotiated, not the active source);
devices duplicated across native + FFmpeg-fallback paths (by design;
`duplicateCaptureSources=[]`).

---

## S7 — Gates + acceptance (close-out)

- **Per-slice gates** (as stated above): S1 → desktop unit test; S2 → cargo
  (`test`/`fmt`/`clippy`) + typecheck; S3 → cargo + `probe:preview-lifecycle` +
  extended preview-window-probe; S4 → desktop unit test +
  `probe:preview-lifecycle` + extended click-focus smoke; S5 → desktop unit test.
- **Close-out**: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
  `pnpm --filter @videorc/desktop test`, `cargo test -p videorc-backend`,
  `cargo clippy -p videorc-backend -- -D warnings`, `cargo fmt --check --all`,
  `pnpm probe:preview-lifecycle`, `pnpm smoke:recording-studio`,
  `pnpm smoke:local-gates`. Record any env-blocked gate
  (`smoke:screen-recording-real` on an in-use display) with the reason + the
  closest focused gate that ran.
- **Owner by-eye acceptance**:
  1. Grant camera/mic for the first time on a fresh profile → calm badge, **no**
     red toast stack (S1).
  2. Export a support bundle on packaged 0.9.16 → `app.version` and
     `health.version` both `0.9.16`, `schemaVersion` `2`, `commit` non-null if S2
     step 6 landed (S2).
  3. Open the preview on the Cam Link 4K → **no** start-stretch at any point (S3).
  4. Click a live, healthy preview → **no** flashing "Waiting for preview" text
     (S4).
  5. (If S5 shipped) The Cam Link shows explicit 4K@25 guidance, not a silent
     25fps fallback.

## Non-negotiables

- An EXPECTED backend restart **never** renders as stacked error toasts. The
  `data-videorc-session-status` badge is the single source of truth for
  connection state; the fix is **suppress-while-not-connected**, with a keyed id
  only as belt-and-suspenders for genuine connected-state blips.
- The support bundle must **always** identify the shipped app version in **both**
  `app.version` and `health.version` — remote triage depends on it (this plan
  nearly mis-triaged on "0.9.0"). Missing runtime info degrades to the crate
  version, never empty.
- No preview frame is ever presented with `drawable_aspect !=
  compositor_target_aspect` — the present must letterbox or skip, and the fix must
  **not** rely on `update_compositor_surface_size` (a cosmetic no-op).
- The preview window's `.hint` fallback must be **hidden** (not merely re-covered)
  whenever the contract is met — occlusion is not a substitute for `display:none`.
- Native-preview slices (S3, S4) are **not** done on typecheck/lint alone — the
  preview probes must run; backend slices (S2, S3) must pass cargo.

## Open decisions (kickoff)

1. **S1 toast policy.** Suppress the transient toast **entirely** while
   `wsStatus !== 'connected'` (badge covers it) vs one keyed "Reconnecting…"
   toast. **Recommend: suppress**, with the keyed id reserved for connected-state
   blips — the badge already narrates the restart window.
2. **S2 health.version fix shape.** Overwrite `input.health.version` inside
   `build_support_bundle` vs change the shared `backend_health()` signature
   (touches all callers incl. the general health RPC). **Recommend: overwrite the
   bundle copy** — smaller blast radius.
3. **S2 commit injection.** Ship S2 steps 1-5 now and defer `commit` (build.rs +
   `dist:release` SHA injection) as a release-process change, vs land it in this
   plan. Sub-decisions if landing: short vs full SHA; whether `dist:release` runs
   from a clean/tagged tree. **Recommend: land steps 1-5 + the schema bump now;
   scope the build.rs with the Release owner** (`.claude/skills/videorc-release`).
4. **S2 schema-intake coupling.** Confirm the videorc-web report-intake side
   parses `schemaVersion` loosely before shipping the `1 → 2` bump (out of this
   repo). If it parses strictly, coordinate the intake update first.
5. **S3 depth of fix.** Ship only the aspect-safe present (A letterbox or B skip),
   vs also compose the preview at fixed output resolution (removes the mismatch at
   the source). **Recommend: both** — the present fix is the guard, compose-at-
   output is the real fix and makes the blit lossless 1:1.
6. **S4 robust fix.** Ship seam 1 (hide `.hint`) only, vs also make the helper a
   true child window (seam 2). **Recommend: seam 1 now**; scope seam 2 only if the
   prebuilt helper protocol supports child ordering (currently unverifiable
   in-repo).
7. **S5 scope.** Ship degenerate-format guidance in this plan vs split it out.
   **Recommend: owner call** — it is a clean P1 UX win but independent of the
   preview/toast/ bundle core.
