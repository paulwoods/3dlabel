import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutLabels } from './layout.js';

// length=100, width=50, gap=5 throughout — mirrors the app's defaults.
const L = 100, W = 50, G = 5;

test('n=1 → single label centered on the origin', () => {
  const { placements, totalLength, totalDepth } = layoutLabels(1, L, W, G);
  assert.equal(placements.length, 1);
  assert.deepEqual(placements[0], { x: 0, z: 0 });
  assert.equal(totalLength, 100);
  assert.equal(totalDepth, 50);
});

test('n=4 → 2×2 grid, symmetric about the origin', () => {
  const { placements, totalLength, totalDepth } = layoutLabels(4, L, W, G);
  // cols=2, rows=2 → footprint 2*100+5 by 2*50+5
  assert.equal(totalLength, 205);
  assert.equal(totalDepth, 105);
  assert.deepEqual(placements, [
    { x: -52.5, z: -27.5 }, // row 0
    { x:  52.5, z: -27.5 },
    { x: -52.5, z:  27.5 }, // row 1
    { x:  52.5, z:  27.5 },
  ]);
});

test('n=3 → 2×2 grid with a left-aligned last row (label 2 under label 0)', () => {
  const { placements, totalLength, totalDepth } = layoutLabels(3, L, W, G);
  // cols=2, rows=2 → same footprint as n=4
  assert.equal(totalLength, 205);
  assert.equal(totalDepth, 105);
  assert.equal(placements.length, 3);
  // label 2 sits in column 0 (left-aligned), sharing label 0's x.
  assert.deepEqual(placements[2], { x: -52.5, z: 27.5 });
  assert.equal(placements[2].x, placements[0].x);
});

test('n=0 → empty layout, no negative totals', () => {
  assert.deepEqual(layoutLabels(0, L, W, G), {
    placements: [], totalLength: 0, totalDepth: 0,
  });
});
