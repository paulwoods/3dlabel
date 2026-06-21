# Domain language

The shared vocabulary for the 3D Label Designer. Use these terms in code, comments, commits, and design discussion so names stay consistent.

- **Label** — one **Plate** plus its **Text**. The unit the user creates; N labels can be designed at once.
- **Plate** — the base geometry a label is built on: a rounded rectangle, plain rectangle, ellipse, or circle, extruded to a thickness. Built by `createPlateGeometry`.
- **Text** — the raised or engraved glyphs sitting on the plate's top face. Built by `buildTextGeometry`. *Raised* text extrudes up; *engraved* text recesses into the plate (intended for multi-filament 3MF).
- **Spec** — the plain parameter object returned by `readParams()`: every value the geometry and export code needs, read once from the form. The seam between the DOM and the rest of the app.
- **Layout** — where N labels sit on the build plate. A square-ish grid (`cols = ⌈√n⌉`), centered on the origin in the XZ plane, with a partial last row left-aligned. Owned by `layoutLabels` in `layout.js` — the single source of truth that the preview, camera-fit, and both exporters consume, so they can never disagree.
- **Label model** — the export-ready geometry of N labels: per label, a baked plate plus optional baked text. Built by `buildLabelModel` in `label-model.js` from a **Spec**, a font, the **Layout** placements, and injected `ops`. Pure orchestration (imports nothing); the two exporters (STL, 3MF) consume it instead of each re-building geometry inline.
- **Bake for export** — the recipe that turns a freshly-built geometry into an export part: drop the index, translate it to its placement, then apply the print-orientation transform. Lives once in `exportOps.bakeForExport` (the THREE-bound op injected into the **Label model**), so STL and 3MF can't drift in how they orient parts.
- **Ops** — the THREE-bound operations (`buildPlate`, `buildText`, `bakeForExport`) injected into `buildLabelModel`. Real ops live in `main.js`; tests pass fakes, keeping `label-model.js` dependency-free.
- **Export** — turning the designed labels into a printable file. **STL** merges every plate and text into one geometry (single-material). **3MF** keeps plates and text as separate parts tagged with colors, so multi-filament slicers can assign filaments.
- **3MF document** — the deterministic assembly of a `.3mf` package from the **Label model** plus colors: id assignment, per-mesh XML with `m:colorid` tags, single- vs multi-filament grouping, the OPC parts, and the ZIP. Owned by `build3mf` in `threemf.js`, with `buildModelXML` as the internal seam its tests assert against. Pure and import-free.
- **Single- vs multi-filament** — the two 3MF groupings. *Multi-filament* (the wired path) emits plate and text as separate build items so a slicer can assign a filament per color. *Single-filament* nests them into one `<component>` object; preserved and tested but not currently wired to a button.
- **ZIP writer** — the minimal STORE (no-compression) ZIP encoder (`_makeZip` / `_crc32`) that packages the 3MF parts, with no external dependency. Lives in `threemf.js` under **3MF document**, its only caller.
- **Settings** — the serialized form state, persisted to `localStorage` and saveable/loadable as a `.json` file.
