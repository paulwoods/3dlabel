// ── Geometry math ─────────────────────────────────────────────────────────────
// The pure numeric decisions the geometry builders in main.js used to make
// inline, extracted so they can be exercised headlessly. Like spec.js /
// layout.js / label-model.js / threemf.js this module imports nothing — no
// THREE, no DOM (ADR-0002).
//
// These are *decisions*, not drawing: how large a corner radius the plate can
// hold, how deep text cuts and where it sits vertically, and how the finished
// model is oriented for a slicer. Actually constructing a BufferGeometry stays
// in main.js, which is irreducibly THREE-bound and not worth testing.
//
// Deliberately NOT extracted: the per-line X centering in buildTextGeometry.
// It needs a computed bounding box from THREE, and splitting the pure stacking
// step away from it would leave a trivial helper beside a thin shell.

// The largest corner radius this plate can actually hold.
//
// Opposing corner arcs must not meet: at exactly half the shorter side they
// touch and the extruded shape degenerates, so back off by a small epsilon.
// The `rectangle` plate shape has square corners by definition.
const CORNER_EPSILON = 0.01;

export function fitRadius(radius, length, width, plateShape) {
  if (plateShape === 'rectangle') return 0;
  return Math.max(0, Math.min(
    radius,
    length / 2 - CORNER_EPSILON,
    width  / 2 - CORNER_EPSILON,
  ));
}

// How deep the text cuts and where it sits on the plate's Y axis.
//
// The two values are returned together because they are one decision: yOffset
// is derived from the clamped depth, and computing them apart is how they drift.
//
//   raised   — extrudes upward from the top face; depth is unconstrained, since
//              text standing proud of the plate is the point.
//   engraved — recesses into the plate. Depth is clamped to the thickness so the
//              glyphs cannot break through the bottom face and hole the print,
//              and yOffset drops the body by that depth so the glyph *tops* end
//              up flush with the top face.
export function planTextPlacement(raise, thickness, textStyle) {
  const effRaise = textStyle === 'engraved' ? Math.min(raise, thickness) : raise;
  const yOffset  = textStyle === 'engraved' ? thickness / 2 - effRaise : thickness / 2;
  return { effRaise, yOffset };
}

// The print-orientation transform, as a column-major 4x4 in THREE.Matrix4's
// `elements` order — ready for `new THREE.Matrix4().fromArray(...)` (ADR-0005).
//
// Three.js is Y-up; slicers (Bambu Studio, PrusaSlicer) are Z-up. This is
// Rx(+90°) followed by a translation of +thickness/2 along the new Z, which
// maps (x, y, z) → (x, -z, y + thickness/2): Three.js up becomes slicer up, and
// the plate bottom at y = -thickness/2 lands exactly on the build platform.
//
// The elements are written out rather than composed from a rotation, because
// cos(PI/2) is 6.1e-17 in floating point — this keeps exact zeros in every
// exported vertex instead of scattering trig dust through the model.
export function printMatrix(thickness) {
  return [
    1, 0,  0, 0,
    0, 0,  1, 0,
    0, -1, 0, 0,
    0, 0,  thickness / 2, 1,
  ];
}
