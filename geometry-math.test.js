import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitRadius, planTextPlacement, printMatrix } from './geometry-math.js';

// Apply a column-major 4x4 (THREE.Matrix4.elements order) to a point.
// Mirrors what THREE does internally so the assertions below describe the real
// transform, not a restatement of printMatrix's own arithmetic.
function applyToPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8]  * z + m[12],
    m[1] * x + m[5] * y + m[9]  * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

// ── fitRadius ─────────────────────────────────────────────────────────────────
test('a radius that fits is returned unchanged', () => {
  assert.equal(fitRadius(5, 100, 50, 'roundedRect'), 5);
});

test('radius is capped so opposing corner arcs cannot meet or cross', () => {
  // Half the shorter side is 5; the 0.01 epsilon keeps the arcs from touching,
  // which would produce a degenerate (self-intersecting) shape.
  assert.equal(fitRadius(50, 20, 10, 'roundedRect'), 4.99);
});

test('the cap uses whichever dimension is more constraining', () => {
  assert.equal(fitRadius(50, 10, 200, 'roundedRect'), 4.99);  // length constrains
  assert.equal(fitRadius(50, 200, 10, 'roundedRect'), 4.99);  // width constrains
});

test('a negative radius floors at 0 rather than inverting the corners', () => {
  assert.equal(fitRadius(-5, 100, 50, 'roundedRect'), 0);
});

test('radius 0 is preserved — this is the sharp-cornered rectangle path', () => {
  assert.equal(fitRadius(0, 100, 50, 'roundedRect'), 0);
});

test('the rectangle plate shape forces 0 regardless of the radius field', () => {
  assert.equal(fitRadius(20, 100, 50, 'rectangle'), 0);
});

// ── planTextPlacement ─────────────────────────────────────────────────────────
test('raised text extrudes by the full raise and sits on the top face', () => {
  const { effRaise, yOffset } = planTextPlacement(1.5, 5, 'raised');
  assert.equal(effRaise, 1.5);
  assert.equal(yOffset, 2.5);  // thickness/2 — the plate's top face
});

test('engraved text recesses so its top is flush with the plate top face', () => {
  const { effRaise, yOffset } = planTextPlacement(1.5, 5, 'engraved');
  assert.equal(effRaise, 1.5);
  assert.equal(yOffset, 1);  // 2.5 - 1.5: body sits below the top face
});

test('engraved depth is clamped to the plate thickness', () => {
  // Without the clamp a 10mm raise on a 5mm plate would cut clean through.
  const { effRaise } = planTextPlacement(10, 5, 'engraved');
  assert.equal(effRaise, 5);
});

test('raised text is NOT clamped — it may extend above the plate freely', () => {
  const { effRaise } = planTextPlacement(10, 5, 'raised');
  assert.equal(effRaise, 10);
});

// The physical invariant the clamp exists to guarantee: engraved glyphs must
// never break through the bottom face, or the printed plate has holes in it.
test('engraved text never breaks through the plate bottom, at any raise', () => {
  const thickness = 5;
  for (const raise of [0.1, 1, 4.9, 5, 20, 1000]) {
    const { effRaise, yOffset } = planTextPlacement(raise, thickness, 'engraved');
    // Glyph tops sit at yOffset + effRaise (flush with the top face); the recess
    // floor is yOffset itself. That floor is what must clear the bottom face.
    assert.equal(yOffset + effRaise, thickness / 2);
    assert.ok(
      yOffset >= -thickness / 2,
      `raise ${raise}: recess floor ${yOffset} is below plate bottom ${-thickness / 2}`,
    );
  }
});

// ── printMatrix (ADR-0005) ────────────────────────────────────────────────────
// Three.js is Y-up; slicers are Z-up. The matrix must rotate Y→Z *and* drop the
// plate onto the build platform. Asserted by transforming real points rather
// than by comparing element values, so the test states the intent.
test('the plate bottom lands exactly on the build platform (z = 0)', () => {
  const t = 5;
  const [x, y, z] = applyToPoint(printMatrix(t), [0, -t / 2, 0]);
  assert.deepEqual([x, y, z], [0, 0, 0]);
});

test('the plate top ends up one thickness above the platform', () => {
  const t = 5;
  const [, , z] = applyToPoint(printMatrix(t), [0, t / 2, 0]);
  assert.equal(z, t);
});

test('Three.js up (+Y) becomes slicer up (+Z)', () => {
  const t = 5;
  const origin = applyToPoint(printMatrix(t), [0, 0, 0]);
  const up     = applyToPoint(printMatrix(t), [0, 1, 0]);
  const delta  = up.map((v, i) => v - origin[i]);
  assert.deepEqual(delta, [0, 0, 1]);
});

test('X is untouched and plate depth (+Z) maps to -Y', () => {
  const t = 5;
  const origin = applyToPoint(printMatrix(t), [0, 0, 0]);
  const alongX = applyToPoint(printMatrix(t), [1, 0, 0]);
  const alongZ = applyToPoint(printMatrix(t), [0, 0, 1]);
  assert.deepEqual(alongX.map((v, i) => v - origin[i]), [1, 0, 0]);
  assert.deepEqual(alongZ.map((v, i) => v - origin[i]), [0, -1, 0]);
});

test('the matrix carries exact zeros, not trig epsilons', () => {
  // THREE.makeRotationX(PI/2) yields cos = 6.1e-17 rather than 0. Writing the
  // elements directly keeps the exported geometry free of that dust.
  for (const v of printMatrix(5)) {
    assert.ok(v === 0 || v === 1 || v === -1 || v === 2.5, `unexpected element ${v}`);
  }
});
