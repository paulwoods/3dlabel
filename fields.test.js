import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELDS } from './fields.js';

const KINDS = ['number', 'text', 'select', 'radio', 'color'];

// ── Manifest self-consistency ─────────────────────────────────────────────────
// These are the invariants every consumer (normalizeSpec, readParams,
// readSettings, applySettings, the listener loop) silently assumes.

test('every kind is one the consumers actually handle', () => {
  // A typo'd kind is the dangerous failure: normalizeSpec branches on
  // `kind === 'number'`, so `numbre` would pass the field through unclamped as
  // a string and NaN would reach the geometry with no error anywhere.
  for (const f of FIELDS) {
    assert.ok(KINDS.includes(f.kind), `${f.key}: unknown kind ${JSON.stringify(f.kind)}`);
  }
});

test('numeric fields carry a full clamp range, and no others do', () => {
  for (const f of FIELDS) {
    const hasRange = ['def', 'min', 'max'].filter(k => f[k] !== undefined);
    assert.equal(
      hasRange.length, f.kind === 'number' ? 3 : 0,
      `${f.key}: ${f.kind} field has ${hasRange.length} of def/min/max (${hasRange})`,
    );
  }
});

test('every default sits inside its own range', () => {
  // A default outside its range is never actually the default — it is clamped
  // to the bound on the way out, so the declared value is a lie.
  for (const f of FIELDS.filter(f => f.kind === 'number')) {
    assert.ok(f.min <= f.def && f.def <= f.max, `${f.key}: default ${f.def} outside ${f.min}–${f.max}`);
  }
});

test('keys and ids are each unique', () => {
  // A duplicate key would shadow in the Spec; a duplicate id would shadow in
  // the settings object and wire two fields to one element.
  for (const prop of ['key', 'id']) {
    const seen = FIELDS.map(f => f[prop]);
    assert.equal(new Set(seen).size, seen.length, `duplicate ${prop} in FIELDS`);
  }
});

// ── Parity with the real form ─────────────────────────────────────────────────
// The one thing a pure manifest cannot check about itself: that its DOM ids and
// clamp ranges match index.html. Read the markup as text so `node --test` catches
// a drift that would otherwise only show up as a blank page in a browser.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// Find the tag declaring the given attribute/value pair, then read one of its
// other attributes out. The closing quote anchors the match, so looking up
// `text` does not also hit `textMulti` or `textColor`.
function tagAttr(matchAttr, matchValue, wanted) {
  const tag = html.match(new RegExp(`<[^>]*\\b${matchAttr}=["']${matchValue}["'][^>]*>`));
  if (!tag) return undefined;
  const m = tag[0].match(new RegExp(`\\b${wanted}=["']([^"']*)["']`));
  return m ? m[1] : undefined;
}

test('every field in the manifest exists in index.html', () => {
  for (const f of FIELDS) {
    // A radio field's `id` is the group's shared `name`, not an element id.
    const [attr, kindDesc] = f.kind === 'radio' ? ['name', 'radio group'] : ['id', 'element'];
    assert.ok(
      new RegExp(`\\b${attr}=["']${f.id}["']`).test(html),
      `${f.key}: no ${kindDesc} with ${attr}="${f.id}" in index.html`,
    );
  }
});

test('the HTML input attributes match the manifest clamps', () => {
  // index.html carries value/min/max so the fields render correctly before any
  // JS runs — a fifth copy of the range that has to agree with this one. If it
  // drifts, the spinner arrows stop somewhere normalizeSpec does not.
  for (const f of FIELDS.filter(f => f.kind === 'number')) {
    assert.equal(Number(tagAttr('id', f.id, 'value')), f.def, `${f.id}: HTML value ≠ default`);
    assert.equal(Number(tagAttr('id', f.id, 'min')),   f.min, `${f.id}: HTML min ≠ manifest min`);
    assert.equal(Number(tagAttr('id', f.id, 'max')),   f.max, `${f.id}: HTML max ≠ manifest max`);
  }
});
