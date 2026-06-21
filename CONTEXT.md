# Domain language

The shared vocabulary for the 3D Label Designer. Use these terms in code, comments, commits, and design discussion so names stay consistent.

- **Label** — one **Plate** plus its **Text**. The unit the user creates; N labels can be designed at once.
- **Plate** — the base geometry a label is built on: a rounded rectangle, plain rectangle, ellipse, or circle, extruded to a thickness. Built by `createPlateGeometry`.
- **Text** — the raised or engraved glyphs sitting on the plate's top face. Built by `buildTextGeometry`. *Raised* text extrudes up; *engraved* text recesses into the plate (intended for multi-filament 3MF).
- **Spec** — the plain parameter object returned by `readParams()`: every value the geometry and export code needs, read once from the form. The seam between the DOM and the rest of the app.
- **Layout** — where N labels sit on the build plate. A square-ish grid (`cols = ⌈√n⌉`), centered on the origin in the XZ plane, with a partial last row left-aligned. Owned by `layoutLabels` in `layout.js` — the single source of truth that the preview, camera-fit, and both exporters consume, so they can never disagree.
- **Export** — turning the designed labels into a printable file. **STL** merges every plate and text into one geometry (single-material). **3MF** keeps plates and text as separate parts tagged with colors, so multi-filament slicers can assign filaments.
- **Settings** — the serialized form state, persisted to `localStorage` and saveable/loadable as a `.json` file.
