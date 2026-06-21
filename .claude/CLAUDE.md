# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

The project is four files: `index.html` (markup + importmap), `style.css` (all styles), `main.js` (all browser logic), and `layout.js` (the pure, dependency-free label-placement core). Three.js and its add-ons are loaded from CDN via an importmap in `index.html`; there are no local dependencies and no build step. `main.js` imports `layout.js` natively (`import { layoutLabels } from './layout.js'`). The importmap must stay in `index.html` — browsers process it at parse time before any module scripts run.

**Layout module (`layout.js`):** `layoutLabels(n, length, width, gap)` returns `{ placements: [{x, z}, …], totalLength, totalDepth }` — the single source of truth for where N labels sit on the build plate (square-ish grid, `cols = ⌈√n⌉`, centered on the origin, partial last row left-aligned). The preview (`rebuildScene`), camera-fit (`fitCamera`), STL export, and 3MF export all consume it, so they cannot disagree about placement. It has zero `THREE` dependency and is unit-tested headlessly in `layout.test.js` (`node --test`).

**Rendering pipeline:** Three.js WebGL scene with `OrbitControls`. Two meshes are maintained — `plateMesh` (rounded-rectangle extrusion) and `textMesh` (raised `TextGeometry`). Any parameter change triggers a debounced `rebuildScene()` that disposes and recreates both meshes.

**Geometry construction:**
- `createPlateGeometry(length, width, thickness, radius)` — builds a `THREE.Shape` with `absarc` corners, extrudes it with `ExtrudeGeometry`, then rotates/translates so the plate lies flat in the XZ plane centered at the origin (matching `BoxGeometry` convention).
- `buildTextGeometry(text, font, fontSize, raise, thickness)` — creates `TextGeometry` in XY, rotates it into XZ, then translates to center it on the plate top face.

**Coordinate system note:** Three.js is Y-up; slicers (Bambu Studio, PrusaSlicer) are Z-up. `applyPrintTransform()` bakes a `Rx(+90°)` rotation into exported geometry so models land correctly on the build plate without manual rotation in the slicer.

**Export formats:**
- **STL** — plate and text merged into a single `BufferGeometry` via `mergeGeometries`, exported binary.
- **3MF** — custom ZIP writer (`_makeZip`) with no external dependency. Plate and text are separate `<object>` elements, each tagged with a color via the 3MF materials extension (`m:colorid`). Both appear as separate build items so slicers can assign different filaments.

**Font loading:** All 11 fonts are fetched in parallel at startup via `FontLoader.loadAsync` and cached in a `Map<url, Font>`. The scene will not render text until the selected font is in the cache.

**Persistence:** `localStorage` under the key `3dlabel_v1` saves all input field values on every change and restores them on load.
