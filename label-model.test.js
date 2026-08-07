import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLabelModel, isFontReady, labelParts, disposeLabelModel } from './label-model.js';

// Fake ops: return tagged sentinels instead of THREE geometry, and record how
// bakeForExport was called so the orchestration can be asserted without THREE.
function fakeOps() {
  const bakeCalls = [];
  return {
    bakeCalls,
    buildPlate: (spec) => ({ tag: 'plate', shape: spec.plateShape }),
    buildText:  (spec, txt) => ({ tag: 'text', txt }),
    bakeForExport: (geo, placement, thickness) => {
      bakeCalls.push({ geo, placement, thickness });
      return { ...geo, baked: true, placement };
    },
  };
}

const spec = (texts) => ({
  texts, thickness: 5, plateShape: 'roundedRect', fontUrl: 'helvetiker',
});

test('one entry per label, each with a baked plate', () => {
  const placements = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
  const model = buildLabelModel(spec(['A', 'B', 'C']), {}, placements, fakeOps());
  assert.equal(model.length, 3);
  for (const label of model) {
    assert.equal(label.plate.tag, 'plate');
    assert.equal(label.plate.baked, true);
  }
});

test('text is null for empty / whitespace-only labels', () => {
  const placements = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }];
  const model = buildLabelModel(spec(['Hello', '', '   ']), {}, placements, fakeOps());
  assert.equal(model[0].text.tag, 'text');
  assert.equal(model[1].text, null);
  assert.equal(model[2].text, null);
});

test('text is null when no font is supplied, even with non-empty text', () => {
  const model = buildLabelModel(spec(['Hello']), null, [{ x: 0, z: 0 }], fakeOps());
  assert.equal(model[0].text, null);
});

test('each geometry is baked with its own placement and the spec thickness', () => {
  const placements = [{ x: -5, z: -5 }, { x: 5, z: 5 }];
  const ops = fakeOps();
  buildLabelModel(spec(['A', 'B']), {}, placements, ops);
  // 2 plates + 2 texts = 4 bake calls, each carrying thickness 5
  assert.equal(ops.bakeCalls.length, 4);
  assert.ok(ops.bakeCalls.every(c => c.thickness === 5));
  // plate of label 1 baked at placement 1
  assert.deepEqual(ops.bakeCalls[0].placement, { x: -5, z: -5 });
  assert.deepEqual(ops.bakeCalls[2].placement, { x: 5, z: 5 });
});

// ── labelParts / disposeLabelModel ────────────────────────────────────────────
// A geometry is anything with dispose(); these fakes record that it was called,
// the same duck-typing threemf.js's tests use for the position accessor.
const geo = name => ({ name, disposed: false, dispose() { this.disposed = true; } });

test('labelParts flattens to plate-then-text per label, skipping absent text', () => {
  // Order is the order STL merges in, so it decides the exported byte layout.
  const model = [
    { plate: geo('p0'), text: geo('t0') },
    { plate: geo('p1'), text: null      },
    { plate: geo('p2'), text: geo('t2') },
  ];
  assert.deepEqual(labelParts(model).map(g => g.name), ['p0', 't0', 'p1', 'p2', 't2']);
});

test('labelParts on an empty model is an empty list, not a crash', () => {
  assert.deepEqual(labelParts([]), []);
});

test('disposeLabelModel disposes every geometry the model holds', () => {
  // The whole ownership contract in one assertion: after the caller is done,
  // nothing buildLabelModel created is still alive.
  const model = [
    { plate: geo('p0'), text: geo('t0') },
    { plate: geo('p1'), text: null      },
  ];
  disposeLabelModel(model);
  assert.ok(labelParts(model).every(g => g.disposed), 'every part must be disposed');
});

test('disposeLabelModel disposes text-less labels without touching null', () => {
  const model = [{ plate: geo('p0'), text: null }];
  disposeLabelModel(model);   // must not throw on the null text
  assert.equal(model[0].plate.disposed, true);
});

test('isFontReady — truth table', () => {
  const loaded = new Map([['helvetiker', {}]]);
  // no label needs text → ready regardless of cache
  assert.equal(isFontReady(spec(['', '  ']), new Map()), true);
  // text present but font absent → not ready
  assert.equal(isFontReady(spec(['Hi']), new Map()), false);
  // text present and font loaded → ready
  assert.equal(isFontReady(spec(['Hi']), loaded), true);
});
