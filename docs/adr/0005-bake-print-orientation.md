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
([ADR-0004](0004-one-bake-for-export-recipe.md)):

```js
const R = new THREE.Matrix4().makeRotationX(Math.PI / 2); // Y → Z
const T = new THREE.Matrix4().makeTranslation(0, 0, thickness / 2);
geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, R));
```

`Rx(+90°)` maps Three.js Y → slicer Z; the translate lifts the plate so its
bottom (`y = −thickness/2` before rotation) lands at slicer **Z = 0**. The preview
scene is never transformed.

## Consequences

- **Models drop onto the build plate correctly with no manual step.** The most
  common per-print chore is eliminated.
- **Preview math stays Three.js-natural.** Cameras, controls, and the
  `BoxGeometry`-style centering conventions all keep working in Y-up.
- **Two coordinate frames coexist.** Preview geometry is Y-up; exported geometry
  is Z-up. Anything that reads or reasons about *exported* coordinates (e.g. the
  3MF vertex emitter) must remember the transform has been applied. This is a
  real but contained cost, paid only inside `bakeForExport` and the exporters
  downstream of it.
