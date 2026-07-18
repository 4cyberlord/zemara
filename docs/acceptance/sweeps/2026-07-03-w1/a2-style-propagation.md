# A2 — background style propagation (2026-07-03)

Question from launch QA: do Assets style changes reach the live backend scene?

Verified WORKING via ui-driver against the isolated dev app:
1. Tile click applied "Code Demo" → backend `scene.get` returned the background
   (`assetId builtin-bg-01`, `fit fill`, `visibilityPercent 20`).
2. "Adjust style" popover → Fit changed to "Fit" → backend `scene.get` echoed
   `"fit": "fit"` within one commit cycle.

No fix required — the registry → effectiveSceneBackground → scene commit path
was always live; the pre-A1 UI just gave the change no visible consequence.
