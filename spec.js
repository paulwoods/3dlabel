// ── Spec normalization ───────────────────────────────────────────────────────
// Pure, dependency-free normalization of raw form values into a validated
// **Spec** — the plain parameter object every geometry and export consumer reads
// (layout, buildLabelModel, the STL and 3MF handlers, camera-fit).
//
// Like layout.js / label-model.js / threemf.js this module imports nothing, so
// the clamps, defaults, and mode → texts expansion can be exercised headlessly
// with plain JS objects (spec.test.js). It is an instance of the pure-core
// pattern (ADR-0002): the DOM-bound `readParams` in main.js is now a thin
// adapter that gathers raw form values and calls this.
//
//   normalizeSpec(raw) → Spec
//
// `raw` is a flat object of form values as strings (what element.value gives).
// A missing / empty / unparseable field falls back to its default, then is
// clamped to range. Passthrough string fields (plateShape, fontUrl, the
// colors, mode, textStyle) are carried through unchanged.
//
// A field falls back to its default only when it does not parse to a finite
// number (missing, empty, or junk). An explicit "0" is a real value and is kept,
// then clamped like any other — so `radius: 0` reaches the sharp-cornered
// rectangle path in createPlateGeometry, and `length: 0` clamps up to its
// minimum of 1. Note this cannot be written `parseFloat(v) ?? def`: parseFloat
// returns NaN (not null/undefined) for junk, which `??` passes straight through.
export function normalizeSpec(raw) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, def, lo, hi) => {
    const n = parseFloat(v);
    return clamp(Number.isFinite(n) ? n : def, lo, hi);
  };

  const mode = raw.mode;
  let texts;
  if (mode === 'multiple') {
    texts = raw.textMulti.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (texts.length === 0) texts = [''];
  } else {
    texts = [raw.text];
  }

  return {
    length:      num(raw.length,      100, 1,   500),
    width:       num(raw.width,        50, 1,   500),
    thickness:   num(raw.thickness,     5, 0.5,  50),
    radius:      num(raw.radius,        5, 0,   100),
    plateShape:  raw.plateShape,
    texts,
    mode,
    fontUrl:     raw.fontUrl,
    fontSize:    num(raw.fontSize,      8, 1,   100),
    raise:       num(raw.raise,       1.5, 0.1,  20),
    lineSpacing: num(raw.lineSpacing, 1.3, 0.8,   3),
    textStyle:   raw.textStyle,
    plateColor:  raw.plateColor,
    textColor:   raw.textColor,
  };
}