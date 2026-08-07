import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from './spec.js';

// A full bag of raw form values (the DOM gives strings). Tests override one
// field at a time to assert the contract that readParams used to carry inline.
// All values are strings, mirroring what element.value returns.
const base = () => ({
  length:      '100',
  width:       '50',
  thickness:   '5',
  radius:      '5',
  plateShape:  'roundedRect',
  text:        'Hello World',
  textMulti:   'A\nB\nC',
  mode:        'single',
  fontUrl:     'helvetiker_regular.typeface.json',
  fontSize:    '8',
  raise:       '1.5',
  lineSpacing: '1.3',
  textStyle:   'raised',
  plateColor:  '#2255aa',
  textColor:   '#f5c842',
});

// ── Clamps ────────────────────────────────────────────────────────────────────
test('length clamps to 1–500', () => {
  assert.equal(normalizeSpec({ ...base(), length: '1000' }).length, 500);
  assert.equal(normalizeSpec({ ...base(), length: '-5'   }).length, 1);
});

test('thickness clamps to 0.5–50', () => {
  assert.equal(normalizeSpec({ ...base(), thickness: '0.1'  }).thickness, 0.5);
  assert.equal(normalizeSpec({ ...base(), thickness: '1000' }).thickness, 50);
});

test('radius clamps to 0–100', () => {
  assert.equal(normalizeSpec({ ...base(), radius: '-5'   }).radius, 0);
  assert.equal(normalizeSpec({ ...base(), radius: '1000' }).radius, 100);
});

test('lineSpacing clamps to 0.8–3', () => {
  assert.equal(normalizeSpec({ ...base(), lineSpacing: '0.5' }).lineSpacing, 0.8);
  assert.equal(normalizeSpec({ ...base(), lineSpacing: '10'  }).lineSpacing, 3);
});

// ── Defaults (missing / empty / unparseable) ──────────────────────────────────
test('missing field falls back to its default', () => {
  const r = base(); delete r.length;
  assert.equal(normalizeSpec(r).length, 100);
});

test('empty string falls back to default', () => {
  assert.equal(normalizeSpec({ ...base(), width: '' }).width, 50);
});

test('unparseable string falls back to default', () => {
  assert.equal(normalizeSpec({ ...base(), fontSize: 'abc' }).fontSize, 8);
});

test('every numeric field has its default when omitted', () => {
  const r = {};
  const s = normalizeSpec(r);
  assert.equal(s.length, 100);
  assert.equal(s.width, 50);
  assert.equal(s.thickness, 5);
  assert.equal(s.radius, 5);
  assert.equal(s.fontSize, 8);
  assert.equal(s.raise, 1.5);
  assert.equal(s.lineSpacing, 1.3);
});

// ── An explicit "0" is a real value, not a missing one ───────────────────────
// A falsy-check fallback (`parseFloat(v) || default`) would treat "0" as absent
// and substitute the default. It is a real value: kept, then clamped normally.
test('radius "0" is honoured — this is how a plain rectangle is requested', () => {
  // radius has a minimum of 0, so 0 survives the clamp and reaches the
  // sharp-cornered `r <= 0` branch of createPlateGeometry.
  assert.equal(normalizeSpec({ ...base(), radius: '0' }).radius, 0);
});

test('"0" on a field with a positive minimum clamps up, it does not default', () => {
  assert.equal(normalizeSpec({ ...base(), length: '0'      }).length, 1);
  assert.equal(normalizeSpec({ ...base(), fontSize: '0'    }).fontSize, 1);
  assert.equal(normalizeSpec({ ...base(), thickness: '0'   }).thickness, 0.5);
  assert.equal(normalizeSpec({ ...base(), lineSpacing: '0' }).lineSpacing, 0.8);
});

// NaN must never escape into geometry — a NaN dimension yields an invisible or
// corrupt mesh with no error. This is why the fallback tests a finite number
// rather than using `??`, which would pass parseFloat's NaN straight through.
test('unparseable input never yields NaN', () => {
  for (const v of ['abc', '', undefined, null, {}]) {
    const s = normalizeSpec({ ...base(), radius: v });
    assert.ok(Number.isFinite(s.radius), `radius from ${JSON.stringify(v)} must be finite`);
    assert.equal(s.radius, 5);
  }
});

// ── mode → texts ──────────────────────────────────────────────────────────────
test('single mode wraps the text field in a one-element array', () => {
  assert.deepEqual(normalizeSpec({ ...base(), mode: 'single', text: 'Hi' }).texts, ['Hi']);
});

test('multiple mode splits, trims, and filters blank lines', () => {
  assert.deepEqual(
    normalizeSpec({ ...base(), mode: 'multiple', textMulti: 'a\n b \n\nc\n' }).texts,
    ['a', 'b', 'c'],
  );
});

test('multiple mode with only blank lines falls back to a single empty label', () => {
  assert.deepEqual(
    normalizeSpec({ ...base(), mode: 'multiple', textMulti: '  \n\n \n' }).texts,
    [''],
  );
});

// ── Passthrough string fields ─────────────────────────────────────────────────
test('passthrough fields are carried through unchanged', () => {
  const s = normalizeSpec({
    ...base(),
    plateShape: 'circle',
    fontUrl: 'optimer_bold.typeface.json',
    textStyle: 'engraved',
    plateColor: '#000000',
    textColor: '#ffffff',
  });
  assert.equal(s.plateShape, 'circle');
  assert.equal(s.fontUrl, 'optimer_bold.typeface.json');
  assert.equal(s.textStyle, 'engraved');
  assert.equal(s.plateColor, '#000000');
  assert.equal(s.textColor, '#ffffff');
});

// ── Shape ─────────────────────────────────────────────────────────────────────
test('the returned Spec carries every field a consumer reads', () => {
  const s = normalizeSpec(base());
  assert.deepEqual(
    Object.keys(s).sort(),
    ['fontUrl', 'length', 'lineSpacing', 'mode', 'plateColor', 'plateShape',
     'raise', 'radius', 'textColor', 'textStyle', 'texts', 'thickness', 'width', 'fontSize'].sort(),
  );
});