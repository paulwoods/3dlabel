# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The domain terms used throughout this file — **Label**, **Plate**, **Text**, **Spec**, **Layout**, **Label model**, **Bake for export**, **Ops**, **3MF document**, **Settings** — are defined in [`CONTEXT.md`](../CONTEXT.md). Use those names in code, comments, and commits.

## Running the app

There is no build step. Serve `index.html` with any static file server:

```bash
python3 -m http.server 7788
```

Then open `http://localhost:7788` in a browser.

## Tests

The pure layout core has headless unit tests using Node's built-in runner (no npm install — `package.json` is config-only, just `{"type":"module"}`):

```bash
node --test
```

## Architecture

> **Why it's shaped this way:** the load-bearing decisions below (no build step, pure injected-ops cores, single sources of truth for placement and settings, the baked print transform, the hand-rolled 3MF) are recorded as ADRs in [`docs/adr/`](../docs/adr/README.md). This section describes *what* the architecture is; the ADRs record *why* and *what was traded away* — read them before reversing one of these decisions.

The project is seven files: `index.html` (markup + importmap), `style.css` (all styles), `main.js` (all browser logic), and four pure, dependency-free cores — `spec.js` (Spec normalization), `layout.js` (label placement), `label-model.js` (export-ready geometry orchestration), and `threemf.js` (3MF document + ZIP assembly). Three.js and its add-ons are loaded from CDN via an importmap in `index.html`; there are no local dependencies and no build step. `main.js` imports the cores natively (e.g. `import { layoutLabels } from './layout.js'`). The importmap must stay in `index.html` — browsers process it at parse time before any module scripts run.

**Spec module (`spec.js`):** `normalizeSpec(raw)` turns a flat bag of raw form values (strings, as `element.value` gives) into a validated **Spec** — every clamp, default, and the `mode → texts` expansion (split / trim / drop blank lines) lives here. `readParams()` in `main.js` is now a thin DOM adapter that only gathers values and calls it, so the validation rules are reachable without a browser and are pinned in `spec.test.js`. Note the preserved `parseFloat(v) || default` fallback: a field of `"0"` yields the default, **not** `0`. That quirk is inherited from the former inline `readParams` and is deliberately asserted by a test, so changing it to `??` shows up as a failing test rather than a silent behaviour change.

**Layout module (`layout.js`):** `layoutLabels(n, length, width, gap)` returns `{ placements: [{x, z}, …], totalLength, totalDepth }` — the single source of truth for where N labels sit on the build plate (square-ish grid, `cols = ⌈√n⌉`, centered on the origin, partial last row left-aligned). The preview (`rebuildScene`), camera-fit (`fitCamera`), STL export, and 3MF export all consume it, so they cannot disagree about placement. It has zero `THREE` dependency and is unit-tested headlessly in `layout.test.js` (`node --test`).

**Label model module (`label-model.js`):** `buildLabelModel(spec, font, placements, ops)` returns one `{ plate, text|null }` per label, each geometry already export-baked. It is pure orchestration and imports nothing — all `THREE` usage is injected via `ops` (`buildPlate`, `buildText`, `bakeForExport`), whose real implementations live in `main.js` as `exportOps`. `bakeForExport` is the single home of the non-index → translate → print-transform recipe that STL and 3MF used to each re-implement. `isFontReady(spec, fonts)` (same module) is the readiness predicate the export handlers check before alerting. Only the two exporters consume the model; the preview keeps its own indexed, mesh-positioned path. Tested headlessly with fake ops in `label-model.test.js`.

**Rendering pipeline:** Three.js WebGL scene with `OrbitControls`. Two meshes are maintained — `plateMesh` (rounded-rectangle extrusion) and `textMesh` (raised `TextGeometry`). Any parameter change triggers a debounced `rebuildScene()` that disposes and recreates both meshes.

**Geometry construction:**
- `createPlateGeometry(length, width, thickness, radius)` — builds a `THREE.Shape` with `absarc` corners, extrudes it with `ExtrudeGeometry`, then rotates/translates so the plate lies flat in the XZ plane centered at the origin (matching `BoxGeometry` convention).
- `buildTextGeometry(text, font, fontSize, raise, thickness)` — creates `TextGeometry` in XY, rotates it into XZ, then translates to center it on the plate top face.

**Coordinate system note:** Three.js is Y-up; slicers (Bambu Studio, PrusaSlicer) are Z-up. `applyPrintTransform()` bakes a `Rx(+90°)` rotation into exported geometry so models land correctly on the build plate without manual rotation in the slicer.

**Export formats:**
- **STL** — plate and text merged into a single `BufferGeometry` via `mergeGeometries`, exported binary.
- **3MF** — built by `threemf.js` (see below). Plate and text are separate `<object>` elements, each tagged with a color via the 3MF materials extension (`m:colorid`); in multi-filament mode both appear as separate build items so slicers can assign different filaments.

**3MF document module (`threemf.js`):** `build3mf({ labels, plateColor, textColor, multicolor }) → Uint8Array` turns the `buildLabelModel` output plus colors into the bytes of a `.3mf` package. Pure and import-free — no `THREE`, no DOM; geometry is touched only through the read-only `position` accessor, so tests pass fake geometries. `buildModelXML(...) → string` is an internal seam exported so `threemf.test.js` can assert the document assembly (colorid tags, build items, single- vs multi-filament `<component>` grouping) directly as a string; `build3mf` wraps it with the OPC parts and the STORE-zip writer (`_makeZip`/`_crc32`, also here). `main.js`'s `_make3mfBlob` is now just glue: produce the model, call `build3mf`, dispose geometries, wrap in a `Blob`. The single-filament (`multicolor=false`) component-grouping path is currently not wired to a button but is preserved and tested.

**Font loading:** All 11 fonts are fetched in parallel at startup via `FontLoader.loadAsync` and cached in a `Map<url, Font>`. The scene will not render text until the selected font is in the cache.

**Persistence / settings:** `readSettings()` (form → plain object) and `applySettings(data)` (object → form) are the single source of truth for serialising the form; both are DOM-bound and live in `main.js`. localStorage (key `3dlabel_v1`, saved on every change, restored on load) and the Save/Load settings `.json` file are two adapters over that pair. `applySettings` only writes the DOM — callers decide whether to re-save / rebuild afterwards (so the init-time restore doesn't re-save, but a file load does).
