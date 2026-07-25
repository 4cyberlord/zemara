# Rhema (PewBeam) — Exhaustive Codebase Deep-Dive

**Source analyzed:** local clone of `https://github.com/appdever01/pewbeam` at `.reference/pewbeam` (read-only reference; all paths below are relative to it). Crates live under `src-tauri/crates/`, frontend under `src/`.

## 0. What Rhema Is

Rhema is a **Tauri 2 desktop app for live church verse projection**: it listens to a microphone, streams audio to Deepgram for speech-to-text, runs a three-tier verse-detection pipeline (direct reference parsing → quotation matching → local ONNX semantic search) on the transcript, queues detected verses, and projects them onto a second display or NDI stream with a fully themeable canvas renderer. The operator dashboard is a React/Vite SPA; a second Vite entry renders the broadcast output window.

| Layer | Tech |
|---|---|
| Shell | Tauri 2.10.3, multi-window (main dashboard + hidden/fullscreen broadcast windows) |
| Frontend | React 19, TypeScript, Vite (multi-entry), Tailwind 4 + shadcn/ui, zustand, Fabric.js (theme designer) |
| Backend | Rust workspace: app crate (`app_lib`) + 7 crates (`bible`, `detection`, `stt`, `audio`, `broadcast`, `api`, `notes`) under `src-tauri/crates/` |
| STT | Deepgram `nova-3` over WebSocket, REST batch fallback (`reqwest`) |
| Semantic | Qwen3-Embedding-0.6B ONNX (INT8 preferred) via `ort`, brute-force cosine over ~31 K KJV verses |
| Data | SQLite (`rusqlite` bundled), FTS5 verse index, flat f32/i64 embedding `.bin` files |
| Output | NDI via `libloading` FFI (`libndi.dylib` / `Processing.NDI.Lib.x64.dll` / `libndi.so`), canvas → BGRA frames |
| Scripts | Bun TypeScript + Python 3 (model export, embedding precompute, data download) |

---

## 1. Shell, Routing & Window Architecture

### 1.1 Frontend entries

Vite is configured with **two HTML entry points** (`vite.config.ts` `rollupOptions.input`):

- `index.html` → `src/main.tsx` → `src/App.tsx` — the operator dashboard. (Title tag still says "vite-app" — cosmetic dead string.)
- `broadcast-output.html` → `src/broadcast-output.tsx` — the NDI/display render surface. Reads `?output=main|alt` from its URL to know which output identity it serves.

There is **no router**: two roots, one window each. `App.tsx` composes the dashboard grid; `broadcast-output.tsx` is a standalone render loop.

### 1.2 Dashboard layout (`src/App.tsx`)

A fixed CSS grid:

- Row 1 (56 px): `TransportBar` — record/transcribe controls, connection status, session timer.
- Row 2: `TranscriptPanel` (320 px) | `PreviewPanel` | `LiveOutputPanel` | `QueuePanel` (320 px).
- Row 3: `SearchPanel` (2fr) | `DetectionsPanel` (1fr).

### 1.3 Tauri windows (`src-tauri/tauri.conf.json`, `src-tauri/src/commands/broadcast.rs`)

- `tauri.conf.json` declares only the **main window, 1280×800**. Broadcast windows are **not** in the config; they are created at runtime.
- `ensure_broadcast_window(output)` creates a **hidden 1920×1080, skip-taskbar** window labeled `broadcast` or `broadcast-alt` pointing at `broadcast-output.html?output=…`. Hidden because NDI pulls frames without an on-screen window.
- `open_broadcast_window(output, monitor)` re-parents/shows that window **fullscreen on a chosen monitor** for display output.
- `close_broadcast_window(output)` closes it.

### 1.4 Capabilities / CSP

`src-tauri/capabilities` (single default capability file) grants `core:default`, `store:default`, `global-shortcut:default` to all three window labels. **CSP is `null`.** The store plugin is registered in Rust (`src-tauri/src/lib.rs` plugin chain) but, notably, **never used from TypeScript** (see §5).

---

## 2. Frontend Components (every component, by directory)

All components live under `src/components/`, plus the two entry files. Custom shadcn primitives live in `src/components/ui/` (standard generated boilerplate — button, dialog, select, slider, input, scroll-area, separator, tabs, etc.; not enumerated individually).

### 2.1 `src/App.tsx` / `src/main.tsx` / `src/broadcast-output.tsx`

- `main.tsx`: mounts `App` inside `ThemeProvider` (`src/components/theme-provider.tsx` — light/dark UI theme, persisted to `localStorage["theme"]`; keyboard "d" toggles).
- `App.tsx`: the grid shell above; wires global listeners for backend events (`verse_detections`, `transcript_*`, `audio_level`, `stt_*`, `reading_mode_verse`, `translation_command`) into zustand stores on mount.
- `broadcast-output.tsx`: the projection surface. Owns a full-window `<canvas>` at `theme.resolution`, subscribes to `broadcast:verse-update`, runs the render/NDI push loop (detailed in §7).

### 2.2 `transport-bar.tsx`

Top bar: mic device status, transcription start/stop, STT connection badge (driven by `stt_connected`/`stt_disconnected`/`stt_error` events), live-pulse indicator (uses the `--live-pulse` design token), `SessionTimer` (see dead-code note: `seconds={0}` hardcoded), settings dialog trigger.

### 2.3 Panels (`src/components/panels/`)

Six panels, all thin views over zustand stores:

| Panel | Store(s) | Role |
|---|---|---|
| `TranscriptPanel` | transcript-store | Live partial/final transcript stream; **invokes `start_transcription`/`stop_transcription` directly** (the hook in `use-audio.ts` that would do this is dead — see §4). Shows audio level meter fed by `audio_level` events. |
| `PreviewPanel` | queue-store, broadcast-store | Next-up verse preview, rendered via shared `CanvasVerse` (canvas 2D, DPR-aware + ResizeObserver) using the active theme. |
| `LiveOutputPanel` | broadcast-store | What is currently on air; "take"/clear actions call `setLiveVerse`. |
| `QueuePanel` | queue-store | Ordered verse queue; manual add/remove/reorder buttons. Has a grip icon but **no drag-and-drop wired** despite `@dnd-kit/react` being a dependency. |
| `SearchPanel` | bible data via commands | Manual search: `search_verses` (FTS5), `semantic_search`, `quotation_search`; results can be pushed to queue/live. |
| `DetectionsPanel` | detections-store | Rolling list of AI detections with source badges (direct/contextual/quotation/semantic_local/semantic_cloud) and confidence coloring (`--confidence-high/mid/low` tokens); approve/dismiss actions. |

### 2.4 `settings-dialog.tsx` / `onboarding.tsx`

Four-section settings dialog (§5) plus a first-run onboarding flow gated on `settings-store.onboardingComplete` — which, being non-persisted, re-triggers every launch.

### 2.5 `src/components/broadcast/` — theme designer + output settings (8 files)

| File | Role |
|---|---|
| `theme-designer.tsx` | Fullscreen dialog, 260 px / 1fr / 320 px three-column layout: ThemeLibrary / DesignCanvas / PropertiesPanel. |
| `theme-library.tsx` | Search + tabs (all / pinned / custom). "New" duplicates an existing theme; **Import/Export buttons are dead** (no handlers). |
| `design-canvas.tsx` | Fabric.js editor: 1920×1080 workspace, pattern fill for image backgrounds, amber dashed hit-rectangles mapped to a `selectedElement` state, auto-zoom to fit. |
| `properties-panel.tsx` | Per-selected-element editors: Text tab (font family list, weight 100–900, size 8–200, line-height 0.5–3, letter-spacing −5…50, alignment, transform, decoration, 9-digit hex + opacity, shadow/outline for verse text only, uppercase + position for reference only); Background tab (solid / gradient / image via `URL.createObjectURL` file pick / transparent + textBox controls); Layout tab (% dims, padding, referenceGap 0–200, verse-number superscript toggle + size %). |
| `builtin-themes.ts` | The three built-in themes (§6.3). |
| `broadcast-settings.tsx` | Main/Alt output cards: **Display** (monitor list via `availableMonitors()`, open/close preview window) and **NDI** (source name, resolution r720p/r1080p/r4k, fps 24/30/60, alpha mode `noneOpaque`/`straightAlpha`/`premultipliedAlpha`). Start → `ensure_broadcast_window` + `start_ndi`, then emits `broadcast:ndi-config`. |
| `theme-provider.tsx` | (in components/) UI light/dark theme only — unrelated to BroadcastTheme. |
| `canvas-verse.tsx` | Shared canvas component wrapping `renderVerse` for preview/live panels. |

### 2.6 `src/lib/`

- `verse-renderer.ts` (822 lines): the single source of truth for theme rendering (§6.2).
- `context-search.ts`: search helpers.
- `utils.ts`: `cn()` etc.

---

## 3. Zustand Stores (all 7)

All under `src/stores/`, all **non-persisted** (no `persist` middleware anywhere; page reload = full state loss).

| Store | Shape (key fields) | Key actions | Notes |
|---|---|---|---|
| `settings-store.ts` | `deepgramApiKey`, `openaiApiKey`, `claudeApiKey`, `activeTranslationId=1`, `audioDeviceId`, `gain=1.0`, `autoMode=false`, `confidenceThreshold=0.8`, `cooldownMs=2500`, `onboardingComplete=false` | plain setters | `openaiApiKey`/`claudeApiKey` have **no UI**; nothing persists. |
| `transcript-store.ts` | partial + final segments, STT status, audio level | append/update/clear | Fed by `transcript_partial`/`transcript_final`/`audio_level` events. |
| `detections-store.ts` | detection list (reference, text, confidence, source, auto_queued) | add/dismiss/clear | TS `DetectionResult.source` union is **stale: 3 values** vs the 5 the backend actually emits. |
| `queue-store.ts` | ordered verse queue | enqueue/dequeue/reorder/clear | Manual + auto-queue (≥0.80 conf via merger) targets. |
| `broadcast-store.ts` | `liveVerse`, `activeTheme`, per-output NDI/display config | `setLiveVerse`, `setActiveTheme`, NDI config setters | **Side-effect hub:** `setLiveVerse`/`setActiveTheme` call `emitTo("broadcast"│"broadcast-alt", "broadcast:verse-update", {theme, verse})`. |
| `bible-store.ts` | translations, books, active translation, chapter cache | load via commands | Backs SearchPanel + translation picker. |
| `search-store.ts` | query, results, mode | set/search/clear | — |

Each store has colocated tests (`*.test.ts`) — plain zustand action tests, no backend mocks.

**Cross-store flow:** detection event → detections-store → (auto? queue-store) → operator take → broadcast-store.setLiveVerse → Tauri event to broadcast window.

---

## 4. Hooks & the End-to-End Live Pipeline

### 4.1 Hooks (`src/hooks/`)

- `use-audio.ts` — **dead code**: invokes `start_capture`/`stop_capture`/`set_gain`, commands that **do not exist** in the Rust handler list (`lib.rs:25-53`). TranscriptPanel bypasses it and calls `start_transcription` directly.
- `use-transcription.ts` — also effectively unused; calls `start_transcription` **without the args the real command requires**.
- `use-bible.ts`, `use-search.ts`, etc. — thin command wrappers used by panels.

### 4.2 The live pipeline (Rust side, `src-tauri/src/commands/stt.rs`, 770 lines)

This is the heart of the app. `start_transcription(api_key?, device_id?, gain?)`:

1. **Key resolution:** explicit `api_key` param → falls back to env (`dotenvy`, `DEEPGRAM_API_KEY`).
2. **Audio fan-out thread:** cpal captures 16 kHz mono f32; RMS level computed every 4th frame (≈15 Hz) → emits `audio_level`; samples go over a `crossbeam-channel` to the Deepgram task; `gain` clamped to 0.0–2.0.
3. **Deepgram WS:** `nova-3`, keyterms (≤100), `endpointing=300`, `utterance_end_ms=1000`; up to 5 reconnects, then a **REST hybrid fallback** batches 5 s flushes (`stt` crate `rest.rs`, default feature `rest-fallback`). Emits `stt_connected`/`stt_disconnected`/`stt_error`/`speech_started`.
4. **Per final transcript event** → emits `transcript_final`, then in order:
   - `check_translation_command` (voice table, e.g. "switch to NIV" → `translation_command` event),
   - `run_direct_detection` (stt.rs:369) — a **separate managed `DirectDetector`+`Merger`** instance; returns true if any hit ≥ 0.90 (stt.rs:388),
   - `check_reading_mode` (stt.rs:512) — may advance reading mode; `verse N`/`next`/`previous` commands handled here,
   - **if no direct hit:** `quotation_tx.try_send(transcript)` (channel cap 8) and feed a `SentenceBuffer` whose complete sentences go to `semantic_tx.try_send(...)` (cap 4; **drops silently when busy**). `speech_final`/`UtteranceEnd` `force_flush` the buffer (stt.rs:324-338).
5. **Semantic worker task:** `process_semantic` + `SermonContext` boost (+0.05 same book / +0.10 same chapter, 180 s window), then emits `verse_detections` to the frontend. Quotation worker similarly emits; **quotation matching is suppressed while reading mode is active**.

Gains/params flow: `SettingsDialog` → settings-store → `start_transcription` args. `stop_transcription` tears down threads/tasks and emits status.

---

## 5. Settings Surface (complete map)

Every user-facing setting, where it lives, and what it does:

| Setting | UI location | Store field (default) | Backend effect |
|---|---|---|---|
| Deepgram API key | SettingsDialog → API Keys | `deepgramApiKey` (null) | `start_transcription(api_key)` param; env fallback |
| OpenAI API key | **none** | `openaiApiKey` (null) | unused (CloudBooster is a stub) |
| Claude API key | **none** | `claudeApiKey` (null) | unused |
| Audio input device | SettingsDialog → Audio | `audioDeviceId` (null) | cpal device selection |
| Mic gain | SettingsDialog → Audio (slider 0–100 %) | `gain` (1.0) | mapped to 0.0–2.0, clamped in capture |
| Bible translation | SettingsDialog → Bible (grouped English/other) | `activeTranslationId` (1) | `set_active_translation` command |
| Display mode | SettingsDialog → Display Mode (auto/manual radio) | `autoMode` (false) | auto-queue gating in UI |
| Confidence threshold | SettingsDialog (slider 35–100 %, **only when autoMode**) | `confidenceThreshold` (0.8) | UI-side auto-queue gate (mirrors merger 0.80) |
| Cooldown | not exposed | `cooldownMs` (2500) | mirrors merger `cooldown_ms` |
| Onboarding done | onboarding flow | `onboardingComplete` (false) | gates onboarding dialog |
| UI light/dark | "d" key / ThemeProvider | `localStorage["theme"]` | cosmetic only |
| NDI/display output config | BroadcastSettings cards | broadcast-store | §7 |

**Critical caveat for the port:** the settings store is **never persisted** — no zustand `persist`, no Tauri plugin-store calls from TS (the plugin is registered in Rust but unused). Every launch resets API key, device, gain, thresholds, and onboarding. The settings-store excerpt (`src/stores/settings-store.ts:28-48`):

```ts
deepgramApiKey: null,
activeTranslationId: 1,
audioDeviceId: null,
gain: 1.0,
autoMode: false,
confidenceThreshold: 0.8,
cooldownMs: 2500,
onboardingComplete: false,
setDeepgramApiKey: (deepgramApiKey) => set({ deepgramApiKey }),
setGain: (gain) => set({ gain }),
setAutoMode: (autoMode) => set({ autoMode }),
setConfidenceThreshold: (confidenceThreshold) => set({ confidenceThreshold }),
```

---

## 6. Theme Designer & the Broadcast Theme Model

### 6.1 Data model (`src/types/broadcast.ts:24-113`)

`BroadcastTheme` is the whole contract between designer, preview, and output. Verified fields:

```ts
export interface BroadcastTheme {
  id: string; name: string; builtin?: boolean; pinned?: boolean
  resolution: { width: number; height: number }
  background: { type: "solid"|"gradient"|"image"|"transparent"
    color?: string; gradient?: {...}; imageUrl?: string
    imageFit?: "cover"|"contain"|"stretch"; blur?: number; brightness?: number; tint?: {...} }
  textBox: { color: string; opacity: number; cornerRadius: number; padding: {...} }
  verseText: { fontFamily, fontWeight, fontSize, lineHeight, letterSpacing,
               color, align, transform, decoration, shadow?, outline? }
  verseNumbers: { enabled: boolean; sizePercent: number }        // superscript
  reference: { ...same text props..., position: "above"|"below"|"inline" }
  layout: { anchor: "top-left"|"top-center"|...|"bottom-center" (7 values),
            widthPercent, heightPercent, offsetXPercent, offsetYPercent,
            referenceGap: number }
  transition: { type, durationMs }   // ⚠ never rendered/animated anywhere
}
```

### 6.2 Renderer (`src/lib/verse-renderer.ts`, 822 lines)

`renderVerse(ctx, theme, verse, {scale, opacity, offsetX, offsetY, imageCache}) → metrics | null`. Pipeline: scale theme → compute anchor box → `wrapText` → justify → per line: shadow → outline → fill → decoration lines → verse-number superscripts → reference (above/below/inline) → background (solid/gradient/image with cover/contain/stretch, `ctx.filter` blur/brightness, tint overlay) → `roundRect` textBox. Shared unchanged by `CanvasVerse`, Fabric `DesignCanvas` (via pattern fills + hit rects), and the broadcast-output canvas — one renderer, three hosts.

### 6.3 Built-in themes (`src/components/broadcast/builtin-themes.ts`)

1. **classic-dark** — dark solid, serif, centered.
2. **modern-light** — light card look.
3. **broadcast-overlay** — **transparent background**, textBox opacity 0.7, anchor `bottom-center`, reference `below` in amber `#fbbf24`. This is the OBS/vMix key-fill style preset.

**Themes are not persisted**: `loadThemes` resets to the three builtins; `saveDraft` on a builtin forks it into a `"(Custom)"` copy that lives only in memory.

---

## 7. Broadcast Output (window display + NDI)

### 7.1 Delivery wiring

- Dashboard: `broadcast-store.setLiveVerse` / `setActiveTheme` → `emitTo("broadcast"│"broadcast-alt", "broadcast:verse-update", { theme, verse })`.
- `broadcast-output.tsx`: listens, draws to canvas at `theme.resolution` (rescales the canvas if theme dims change), then — if NDI is running for its output id — pushes the frame:

```tsx
// src/broadcast-output.tsx:134-144
const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight)
const rgbaBase64 = uint8ToBase64(imageData.data)   // 32KB chunks
const request = { outputId, width: sourceWidth, height: sourceHeight, rgbaBase64 }
await invoke("push_ndi_frame", { request })
```

- Frame pacing: **burst of 3 frames at 0/150/300 ms** per verse update, then a **2 s keepalive** re-push so receivers hold the frame. On mount it calls `get_ndi_status` and `emitTo("main", "broadcast:output-ready")` (broadcast-output.tsx:211).

### 7.2 Rust NDI FFI (`src-tauri/crates/broadcast/src/ndi.rs`)

- Loads the NDI runtime with `libloading` from `sdk/ndi/{macos/libndi.dylib, windows/Processing.NDI.Lib.x64.dll, linux/libndi.so*}` (downloaded by `data/download-ndi-sdk.ts` from TrueLazer/KlakNDI GitHub mirrors).
- Symbols: `NDIlib_initialize/destroy/send_create/send_destroy/send_send_video_v2`.
- Sessions kept in a `HashMap<outputId, NdiSession>`.
- Frame path: base64 → RGBA bytes → **RGBA→BGRA swizzle** (the `premultipliedAlpha` mode is accepted but **does not actually premultiply**) → fourcc `BGRA`, `fps×1000/1001` rational, progressive, synthesized timecode.
- `push_ndi_frame` is deliberately "dumb": scaling to the configured NDI resolution happens on the JS canvas before encode.

**Display vs NDI:** display output = visible fullscreen window on a monitor (window owns its own rendering, no IPC frames); NDI output = hidden window + base64 frame pushing per update. Both are driven by the same `broadcast:verse-update` events.

---

## 8. Rust Crates & the Detection Pipeline in Depth

Workspace root `src-tauri/Cargo.toml`: app crate `app_lib` (staticlib/cdylib/rlib), tauri 2.10.3 + `log`/`store`/`global-shortcut` plugins, `dotenvy`, `base64`, `crossbeam-channel`. `build.rs` is the stock 3-line `tauri_build::build()`.

### 8.1 `bible` crate (`src-tauri/crates/bible/`)

- `db.rs`: opens `rhema.db` — `resource_dir()/rhema.db` in production, fallback `../data/rhema.db` relative to `CARGO_MANIFEST_DIR` (`src-tauri/src/lib.rs:58-65`).
- `lookup.rs`: translations/books/chapter/verse queries; `get_verse_by_id` used to hydrate semantic hits.
- `search.rs`: FTS5 MATCH over `verses_fts`, ranked.
- `crossref.rs`: **broken at runtime** — queries a `from_ref` **text** column formatted `"b:c:v"` (crossref.rs:13-17), but `data/schema.sql:36-48` defines `from_book/from_chapter/from_verse` **integer** columns and the builder inserts ints. The query can never match. (Port: fix or drop.)
- `models.rs`: serde DTOs shared with TS types.

### 8.2 `audio` crate

- `capture.rs`/`device.rs`: cpal 0.15 stream setup, 16 kHz mono f32, device enumeration, gain multiply.
- `meter.rs`: RMS level.
- `vad.rs` (328 lines): energy-based VAD state machine (Silence/Speech/Trailing) with `VadConfig` defaults explicitly copied from "Logos AI's extracted bytecode" (vad.rs:4,26-27) — ~750 ms silence to end, ~250 ms voice to start, 15 s max utterance, 250 ms pre-buffer. **Currently disabled/not wired** into the live path.
- `types.rs`/`error.rs`: `AudioFrame`, error enums.

### 8.3 `stt` crate

- `deepgram.rs`: WS client, nova-3 params, reconnect loop (5 attempts), speech/utterance events.
- `keyterms.rs`: ≤100 keyterm list (book names, theological terms).
- `rest.rs`: batch REST fallback behind default feature `rest-fallback` (reqwest).

### 8.4 `detection` crate (`src-tauri/crates/detection/`) — the core IP

**`merger.rs`**: merges direct+semantic+quotation results; confidence floor 0.45, **auto-queue ≥0.80**, per-reference **cooldown 2500 ms**, dedup prefers direct hits.

**Direct tier (`direct/`)**:

- `books.rs`: 66-book table with aliases.
- `automaton.rs`: Aho-Corasick over book names/aliases, word-boundary, longest-match.
- `fuzzy.rs`: Levenshtein fallback (distance ≤2, ≤3 if name >8 chars) over 1–4 token windows.
- `parser.rs`: patterns for `Book C:V`, "chapter N verse M", "N verse M", spoken compound numbers ("twenty two"), two-number bare forms, chapter-only. Incomplete refs held 5 s → chapter-only at 0.75 confidence. Confidence model: 0.90 base +0.04 exact book +0.04 colon pattern +0.02 bounded extras.
- `context.rs`: `recent_detections(5)` window powering "previous verse" commands.
- `detector.rs`: filler-phrase stripping ("um", "you know", …) before the automaton.

**Semantic tier (`semantic/`)**:

- `onnx_embedder.rs`: Qwen3-Embedding-0.6B via `ort` 2.0.0-rc.12 + `tokenizers` 0.22; **MAX_TOKENS 128**, mean-pool, L2-normalize, **no runtime prefix** (comment: documents get none); prefers `models/qwen3-embedding-0.6b-int8/model_quantized.onnx` over FP32 `model.onnx`.
- `hnsw_index.rs`: **misnamed** — the module docs admit it's *"Brute-force cosine-similarity vector index"* (hnsw_index.rs:1-3,146-161): flat f32 `.bin` + i64 ids `.bin`, exhaustive dot product over ~31 K × 1024 dims ("takes only a few [ms]"). No HNSW exists.
- `index.rs`/`cache.rs`/`chunker.rs`: index trait, **LRU 256** query cache, sentence chunking.
- `detector.rs`: threshold **0.50**, top-k **5**.
- `ensemble.rs`: used when `use_synonyms` is on. Weights/cutoffs are, by the code's own comment, extracted from Logos AI bytecode (ensemble.rs:9-20):

```rust
const ORIGINAL_WEIGHT: f64 = 0.7;   // direct embedding of input
const SYNONYM_WEIGHT: f64 = 0.2;    // synonym-expanded variants (weight split across them)
const CONCEPT_WEIGHT: f64 = 0.1;    // extracted concept keywords
const ORIGINAL_CUTOFF: f64 = 0.50;
const SYNONYM_CUTOFF: f64 = 0.50;
const CONCEPT_CUTOFF: f64 = 0.45;
const ENSEMBLE_THRESHOLD: f64 = 0.50;
```

- `synonyms.rs` (586 lines): `SynonymExpander`, **MAX_EXPANSIONS 3**, ~15 theological groups (Salvation, Faith, Love, Sin, Righteousness, Prayer, Kingdom, …), each group fully cross-mapped.
- `cloud.rs`: **stub** — `enabled: false`, `has_cloud` always false, comment *"actual HTTP call to OpenAI will be added when reqwest is integrated"* (cloud.rs:19,57). No cloud path exists despite `semantic_cloud` appearing as a source label.
- `precompute.rs` + `bin/precompute.rs`: CLI that embeds all verses and writes the raw `.bin` pair (native byte order; Python equivalents write little-endian explicitly).

**Quotation (`quotation.rs`)**: inverted word index with stop-word list; sliding windows [len, ≤15, ≤10]; overlap ≥0.50; `confidence = min(0.95, 0.75 + (overlap−0.5)×0.40)`; call site auto-queues ≥0.85.

**Reading mode (`reading_mode.rs`)**: auto-starts on a high-confidence direct hit (restart rules vary by same-book/confidence); 3-minute pause timeout; voice commands "verse N"/next/previous; overlap ≥0.40 gates current→next→skip advance; each advance emits `reading_mode_verse` plus a `verse_detections` entry with source `contextual`, `auto_queued: true`.

**`sentence_buffer.rs`**: accumulates STT finals into sentence-ish chunks for the semantic tier.

**`pipeline.rs` / `types.rs` / `error.rs` / `lib.rs` / `context.rs`**: orchestration, `DetectionResult` (5 sources: `direct`, `contextual`, `quotation`, `semantic_local`, `semantic_cloud`), errors, `SermonContext`.

### 8.5 `broadcast` crate

`lib.rs` + `ndi.rs` as covered in §7.2.

### 8.6 `api` and `notes` crates

Both `lib.rs` files are **one-line comment placeholders** — reserved, no code.

### 8.7 Stray data file

`src-tauri/ghs.json` (~85 KB, 3 630 lines): a hymn database (DCLM "GHS" hymn lyrics + MP3 URLs). **Nothing in the codebase references it** — dead data file sitting in the app crate root.

---

## 9. Tauri Command & Event Surface

### 9.1 Commands (27 registered, `src-tauri/src/lib.rs:25-53`)

| Domain | Command | Purpose |
|---|---|---|
| bible | `list_translations`, `list_books`, `get_chapter`, `get_verse`, `search_verses`, `get_translation_verses_for_search`, `get_cross_references`, `get_active_translation`, `set_active_translation` | DB reads + active translation state (cross-refs broken, §8.1) |
| detection | `detect_verses`, `detection_status`, `semantic_search`, `toggle_paraphrase_detection`, `quotation_search`, `reading_mode_status`, `stop_reading_mode` | Manual/ad-hoc detection + mode control |
| audio | `get_audio_devices` | cpal enumeration |
| stt | `start_transcription` (api_key?, device_id?, gain?), `stop_transcription` | §4.2 |
| broadcast | `list_monitors`, `ensure_broadcast_window`, `open_broadcast_window`, `close_broadcast_window`, `start_ndi`, `stop_ndi`, `get_ndi_status`, `push_ndi_frame` | §7 |

### 9.2 Events

**Global (emitted to main window):** `audio_level`, `transcript_partial`, `transcript_final`, `stt_connected`, `stt_disconnected`, `stt_error`, `speech_started`, `verse_detections`, `translation_command`, `reading_mode_verse`.
**Window-scoped:** `broadcast:verse-update` (main→broadcast/alt), `broadcast:ndi-config` (main→broadcast), `broadcast:output-ready` (broadcast→main).

---

## 10. Data Layer

### 10.1 SQLite schema (`data/schema.sql`)

- `translations` (id, abbrev, name, language), `books` (id, translation_id, number, name, chapters), `verses` (id, translation_id, book_id, book_name, chapter, verse, text) + 2 indexes, `cross_references` (from_book/from_chapter/from_verse/to_* ints, votes) + `idx_crossref_from`, `embedding_status`.
- **FTS5** `verses_fts` (unicode61, `content=verses`) is created by the builder, not schema.sql.

### 10.2 Builder (`data/build-bible-db.ts`, Bun + `bun:sqlite`)

- Reads scrollmapper-format JSON per translation from `data/sources/`, skips missing files. 10 translation metas hardcoded: **KJV, NIV, ESV, NASB, NKJV, NLT, AMP** (English) + **SpaRV** (Reina-Valera 1909), **FreJND** (Darby French), **PorBLivre** (Biblia Livre).
- Cross-refs from openbible TSV with an OSIS→book-number map (but see §8.1 mismatch).
- `translation_id = 1` is KJV — this matters because **embeddings are KJV-only**, so semantic detections hydrate verse text via `get_verse_by_id` and therefore **always display KJV text regardless of the active translation**.

### 10.3 Embedding binary format

`embeddings/kjv-qwen3-0.6b.bin` = flat little-endian f32 (`verses × dim`, dim from model, 1024) and `…-ids.bin` = flat LE i64 verse ids. Written by three interchangeable producers: Rust `precompute` bin (native endian), `data/precompute-embeddings.py` (sentence-transformers + MPS/CUDA), `data/precompute-embeddings-onnx.py` (same ONNX graph as runtime — uses the pre-pooled `sentence_embedding` output when present, feeds `position_ids` when the graph has them, MAX_LENGTH 128, batch 32, L2-normalized).

### 10.4 Model artifacts

`models/qwen3-embedding-0.6b/` (FP32) + `-int8/model_quantized.onnx` + `tokenizer.json`; produced by `data/download-model.ts` via `optimum-cli export onnx --task feature-extraction` then `optimum-cli onnxruntime quantize --arm64` (≈2.4 GB → 571 MB). Models, embeddings, NDI SDK, and `rhema.db` are all gitignored.

---

## 11. Scripts (`data/`, all runnable via bun/python)

| Script | Does |
|---|---|
| `download-sources.ts` | Fetches scrollmapper JSON (KJV/SpaRV/FreJND/PorBLivre) from GitHub + openbible cross-references zip → `data/sources/`, `data/cross-refs/`. Skips existing. |
| `download-biblegateway.py` | Uses the `meaningless` lib to pull **NIV/ESV/NASB/NKJV/NLT/AMP** from BibleGateway (monkey-patches `get_capped_integer` for long chapters), converts to scrollmapper JSON in `data/sources/`. |
| `bible_gateway.py` | Older/alternate version of the same downloader; writes per-translation SQL dumps too. Superseded but kept. |
| `build-bible-db.ts` | §10.2 — builds `rhema.db` from sources + cross-refs. |
| `compute-embeddings.ts` | Exports all KJV verses from `rhema.db` → `data/verses-for-embedding.json` for the embedders. |
| `download-model.ts` | §10.4 — ONNX export + INT8 quantize via optimum-cli. |
| `precompute-embeddings.py` / `precompute-embeddings-onnx.py` | §10.3 — write the `.bin` pair. |
| `download-ndi-sdk.ts` | Pulls NDI headers + per-OS runtime binaries from TrueLazer/KlakNDI mirrors into `sdk/ndi/`. |

Pipeline order: `download-sources` (+`download-biblegateway`) → `build-bible-db` → `download-model` → `compute-embeddings` → one of the precompute scripts.

---

## 12. Config Files

| File | Salient contents |
|---|---|
| `package.json` | Bun-oriented scripts for all data pipelines (`download:*`, `build:db`, `quantize:model`); deps incl. React 19, zustand, Fabric, @dnd-kit/react (unused), tailwind 4, shadcn; Tauri CLI. |
| `vite.config.ts` | Multi-entry input (`index.html`, `broadcast-output.html`), path alias `@→src`, Tauri dev-server wiring. |
| `src-tauri/tauri.conf.json` | Main window 1280×800 only; bundle resources exclude gitignored models/db (they ship separately); CSP null. |
| `src-tauri/capabilities/*.json` | `core:default` + `store:default` + `global-shortcut:default` for `main`, `broadcast`, `broadcast-alt`. |
| `src-tauri/Cargo.toml` | §8 header; `rhema-detection` features `onnx` + `vector-search` (`ort 2.0.0-rc.12`, `tokenizers 0.22`, `bytemuck`), `rhema-stt` default `rest-fallback` (reqwest), cpal 0.15, rusqlite 0.34 bundled, libloading 0.8, aho-corasick 1, lru 0.12. |
| `src/index.css` | Tailwind 4 theme: Geist/Inter/Source Serif 4 fonts; custom tokens `--ai-direct/semantic/cloud`, `--confidence-high/mid/low` (green/amber/red oklch), `--live-pulse`, `--surface-elevated/sunken`; full light + dark palettes. |
| `components.json`, `tsconfig*.json`, `eslint.config.js` | Standard shadcn/TS/ESLint scaffolding. |

---

## Appendix A — Discrepancies, Dead Code & Port Traps (verified)

1. **Nothing persists.** Settings store has no `persist`; Tauri store plugin registered but unused; themes reset to builtins every launch; API key re-entered every run. The port needs a real persistence design from scratch.
2. **`use-audio.ts` invokes non-existent commands** (`start_capture`/`stop_capture`/`set_gain`); `use-transcription.ts` calls `start_transcription` with wrong arity. Both dead — TranscriptPanel calls the real command.
3. **Cross-references broken at runtime:** `crossref.rs:13-17` queries text column `from_ref`; schema/builder use integer `from_book/from_chapter/from_verse` (`data/schema.sql:36-48`).
4. **`HnswVectorIndex` is brute force**, not HNSW (`hnsw_index.rs:1-3`) — fine at 31 K verses, but don't port the name's assumption.
5. **`CloudBooster` is a stub** (`cloud.rs:19,57`) — `has_cloud` always false, no HTTP. `semantic_cloud` source label is aspirational; OpenAI/Claude key fields in the settings store are dead weight.
6. **Semantic hits always render KJV text** (embeddings are `translation_id=1` only; hydration via `get_verse_by_id` ignores active translation).
7. **`premultipliedAlpha` NDI mode never actually premultiplies** — RGBA→BGRA swizzle only.
8. **`BroadcastTheme.transition` is modeled but never rendered/animated.**
9. **TS `DetectionResult.source` union is stale** (3 values vs 5 emitted: `direct|contextual|quotation|semantic_local|semantic_cloud`).
10. **Quotation is suppressed during reading mode; semantic channel (cap 4) silently drops when busy; direct detection runs on a separate Merger instance from the manual `detect_verses` command** — subtle behaviors worth preserving deliberately or fixing deliberately.
11. Small stuff: `QueuePanel` grip icon but no DnD (dep installed); `SessionTimer` hardcoded `seconds={0}`; `index.html` title "vite-app"; ThemeLibrary Import/Export buttons dead; `vad.rs` (a full VAD) compiled but unwired; `ghs.json` hymn DB unreferenced; `api`/`notes` crates are 1-line placeholders.

## Appendix B — Port-Relevance Notes for Videorc

- The **detection crate is cleanly separable**: it has no Tauri dependencies (pure Rust + ort/tokenizers), so it can be lifted wholesale or behind a trait. Its IPC contract is just `DetectionResult` + the §9.2 events.
- The **single-renderer discipline** (`verse-renderer.ts` shared by preview/designer/output) is the right pattern to copy; the Fabric.js designer is the heavy dependency to reconsider.
- The **NDI path's frame format** (JS canvas → base64 → Rust FFI → BGRA fourcc) is simple but expensive (base64 + getImageData copies); a Videorc port could swap in its existing native capture/transport for a zero-copy path while keeping the `push_ndi_frame` contract.
- The **live-pipeline gating logic in `stt.rs`** (direct-first, quotation/semantic only when no direct hit, reading-mode suppression, channel capacities, force-flush points) is the subtlest part of the app and the highest-value logic to replicate faithfully — it's where all the "feels magical in a live service" behavior lives.
- Persistence, cross-references, and the settings-to-backend wiring (gain/device/thresholds) are the three areas where Rhema is visibly unfinished; the port should treat them as new design, not parity work.

---

**Coverage statement:** every directory in the repo was read directly — all frontend source (entries, types, 7 stores + tests, hooks, dashboard, 6 panels, settings, all 8 broadcast/theme-designer files, verse-renderer 822 lines, builtin themes, ui primitives), all Rust (app crate `lib/state/events/main`, all 5 command modules incl. 770-line `stt.rs`, and every `.rs` in `bible`/`detection`/`stt`/`audio`/`broadcast`/`api`/`notes`), all 8 `data/` scripts, `schema.sql`, CSS tokens, `tauri.conf.json`, capabilities, Cargo manifests, `build.rs`. The only files intentionally skimmed were generated shadcn `ui/*` boilerplate, parser.rs test bodies, and the tail of static lookup tables (`synonyms.rs` groups, `keyterms.rs`), whose structure is characterized above.
