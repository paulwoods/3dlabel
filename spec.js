// ── Spec normalization ───────────────────────────────────────────────────────
// Pure, dependency-free normalization of raw form values into a validated
// **Spec** — the plain parameter object every geometry and export consumer reads
// (layout, buildLabelModel, the STL and 3MF handlers, camera-fit).
//
// Which fields exist, and each numeric field's default and range, come from the
// FIELDS manifest in fields.js — the single declaration the DOM reader, the
// settings serialiser, and the listener wiring in main.js also derive from. This
// module owns only the *rules*: how a raw value becomes a validated one, and the
// mode → texts expansion. Both imports and this module are pure — no THREE, no
// DOM — so all of it runs headlessly (spec.test.js) under ADR-0002.
//
//   normalizeSpec(raw) → Spec
//
// `raw` is a flat object of form values as strings (what element.value gives),
// keyed by the manifest's `key`. Numeric fields fall back to their default and
// are clamped to range; every other kind is carried through unchanged.
//
// A field falls back to its default only when it does not parse to a finite
// number (missing, empty, or junk). An explicit "0" is a real value and is kept,
// then clamped like any other — so `radius: 0` reaches the sharp-cornered
// rectangle path in createPlateGeometry, and `length: 0` clamps up to its
// minimum of 1. Note this cannot be written `parseFloat(v) ?? def`: parseFloat
// returns NaN (not null/undefined) for junk, which `??` passes straight through.
import { FIELDS } from './fields.js';

export function normalizeSpec(raw) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, def, lo, hi) => {
    const n = parseFloat(v);
    return clamp(Number.isFinite(n) ? n : def, lo, hi);
  };

  const spec = {};
  for (const f of FIELDS) {
    if (f.spec === false) continue;   // text / textMulti — folded into `texts` below
    spec[f.key] = f.kind === 'number'
      ? num(raw[f.key], f.def, f.min, f.max)
      : raw[f.key];
  }

  // The two text fields collapse into one list of labels, chosen by mode:
  // multiple mode splits on newlines, trimming and dropping blanks, and never
  // yields an empty list — zero labels would render nothing at all.
  if (spec.mode === 'multiple') {
    const lines = raw.textMulti.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    spec.texts = lines.length > 0 ? lines : [''];
  } else {
    spec.texts = [raw.text];
  }

  return spec;
}
