# ADR-0005: Bake the Y-up → Z-up print orientation into exported geometry

## Status

Accepted

## Context

Three.js uses a **Y-up** coordinate system; consumer slicers (Bambu Studio,
PrusaSlicer) use **Z-up**. Exported as-is, a label arrives in the slicer rotated
onto its side — the slicer lays the wrong face on the build plate, and the user
must manually rotate it before every print.

Options considered:

1. **Document it** — tell users to rotate in the slicer. Pushes a chore onto
   every export and invites mistakes.
2. **Rotate the whole scene to Z-up** — makes preview math fight Three.js's
   natural Y-up conventions (cameras, `OrbitControls`, `BoxGeometry`).
3. **Bake the rotation into the exported geometry only** — the preview stays
   Y-up; the file is born print-oriented.

## Decision

Option 3. `applyPrintTransform(geo, thickness)` bakes the correction into export
geometry as part of the "Bake for export" recipe
([ADR-0004](0004-one-bake-for-export-recipe.md)).

The matrix itself is `printMatrix(thickness)` in `geometry-math.js` — a pure
function returning the 16 elements in `THREE.Matrix4`'s column-major order, so
the orientation rule can be tested headlessly ([ADR-0002](0002-pure-cores-injected-ops.md)):

```js
// geometry-math.js — Rx(+90°) then lift by thickness/2 along the new Z
[1, 0, 0, 0,  0, 0, 1, 0,  0, -1, 0, 0,  0, 0, thickness / 2, 1]

// main.js — the THREE-bound application
geo.applyMatrix4(new THREE.Matrix4().fromArray(printMatrix(thickness)));
```

`Rx(+90°)` maps Three.js Y → slicer Z; the translate lifts the plate so its
bottom (`y = −thickness/2` before rotation) lands at slicer **Z = 0**. The preview
scene is never transformed.

The elements are written out rather than composed from `makeRotationX(π/2)`
because `cos(π/2)` is `6.1e-17` in floating point, which would otherwise scatter
trig dust through every exported vertex.

## Consequences

- **Models drop onto the build plate correctly with no manual step.** The most
  common per-print chore is eliminated.
- **The orientation rule is executable.** `geometry-math.test.js` asserts the
  invariants directly — plate bottom lands at `z = 0`, `+Y` becomes `+Z`, `X` is
  untouched — by transforming points, not by restating the element values. A
  regression here would silently ship sideways models to every user.
- **Preview math stays Three.js-natural.** Cameras, controls, and the
  `BoxGeometry`-style centering conventions all keep working in Y-up.
- **Two coordinate frames coexist.** Preview geometry is Y-up; exported geometry
  is Z-up. Anything that reads or reasons about *exported* coordinates (e.g. the
  3MF vertex emitter) must remember the transform has been applied. This is a
  real but contained cost, paid only inside `bakeForExport` and the exporters
  downstream of it.
