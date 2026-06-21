# ADR-0006: Hand-roll the 3MF package instead of taking a dependency

## Status

Accepted

## Context

The 3MF export must emit a valid `.3mf` file: an **OPC package** (a ZIP with a
fixed part layout) containing a 3D model XML document. For multi-filament
printing each part also carries a color via the 3MF materials extension
(`m:colorid`), and plates and text must be separable build items so a slicer can
assign a filament per color.

Three.js ships a 3MF *loader* but no *exporter*, so it doesn't help here. The
library route would be a 3MF/OPC helper plus a ZIP library (e.g. JSZip) — but
[ADR-0001](0001-no-build-step-cdn-importmap.md) means no bundler and no
`npm install`, so every dependency is one more CDN URL to pin and trust, and the
testability discipline of [ADR-0002](0002-pure-cores-injected-ops.md) wants the
format logic to stay pure and `THREE`-free.

The 3MF this app emits is small and regular: a handful of meshes, two color
groups, simple build items. The full generality of a 3MF library is not needed.

## Decision

Assemble the whole package by hand in `threemf.js`, a pure, import-free module
(no `THREE`, no DOM):

- `buildModelXML({ labels, plateColor, textColor, multicolor })` — the model
  document: two `<m:colorgroup>`s, one `<object>` per mesh tagged with
  `m:colorid`, and the build items. It owns the **single- vs multi-filament**
  grouping (multi: separate `<item>`s; single: a nested `<component>` object).
- `_makeZip` / `_crc32` — a minimal **STORE** (no-compression) ZIP writer, enough
  to package the OPC parts with no dependency.
- `build3mf(...)` wraps `buildModelXML` with the OPC boilerplate
  (`[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model`) and zips it.

Geometry is read only through the `position` accessor, and `buildModelXML` is
exported as an **internal seam** so tests assert the document as a *string*
rather than decoding ZIP bytes.

## Consequences

- **Zero dependency**, consistent with the no-build-step model; one fewer CDN URL
  to pin.
- **The document assembly is unit-tested directly** (`threemf.test.js` asserts
  colorid tags, build items, and the single-/multi-filament grouping against the
  `buildModelXML` string).
- **Full control** over the exact bytes emitted — useful when chasing
  slicer-specific quirks.
- **We now own 3MF and ZIP correctness.** The ZIP writer is STORE-only (no
  compression, so larger files) and the OPC layout is the minimum that validates;
  anything a stricter consumer requires, we must add by hand.
- **More code lives in the repo** than a one-line library call would cost. The
  single-filament `<component>` grouping path is fully built and tested but is
  **not currently wired to a button** — preserved deliberately, not dead by
  accident.
- An instance of [ADR-0002](0002-pure-cores-injected-ops.md) taken to its limit:
  a format module with no injected ops at all, pure enough to test with fake
  geometries.
