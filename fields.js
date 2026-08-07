// ── Field manifest ────────────────────────────────────────────────────────────
// The one declaration of what parameters the app has. Four things used to keep
// their own hand-maintained copy of this list — the Spec clamps, the DOM reader,
// the persisted-settings id list, and the change-listener wiring — so adding a
// parameter meant four edits and forgetting one failed *silently* (the field
// just never persisted, or never triggered a rebuild). All four now derive from
// here; adding a field is one entry plus the markup.
//
// Pure data: no THREE, no DOM, no imports (ADR-0002). `id` is a DOM id, but it
// is only ever a string here — main.js is what looks anything up.
//
// Each entry:
//   key   — the Spec / readParams name. What geometry and export consumers read.
//   id    — the DOM id, and the key used in saved settings JSON. Usually the
//           same as `key`; `fontUrl`/`font` differ, and changing that would
//           orphan the `font` key in every settings file already saved.
//   kind  — how the value is read and validated:
//             number  clamped to def/min/max by normalizeSpec
//             text    passthrough (a text input or textarea)
//             select  passthrough (a <select>)
//             color   passthrough (an <input type=color>)
//             radio   passthrough; `id` is the group's shared `name` attribute,
//                     not an element id — there is no single element to read
//   spec  — omit for normal fields. `false` means the field feeds the Spec
//           indirectly: `text` and `textMulti` are collapsed into `texts` by
//           normalizeSpec according to `mode`, so neither appears in the Spec.
//   def/min/max — numeric fields only. These are also written into index.html's
//           value/min/max attributes (so the form is right before JS runs);
//           fields.test.js asserts the two agree.
//
// Order is the Spec's key order and the saved-settings key order. Both are
// cosmetic, but keeping it stable keeps settings-file diffs readable.
export const FIELDS = [
  { key: 'length',      id: 'length',      kind: 'number', def: 100, min: 1,   max: 500 },
  { key: 'width',       id: 'width',       kind: 'number', def: 50,  min: 1,   max: 500 },
  { key: 'thickness',   id: 'thickness',   kind: 'number', def: 5,   min: 0.5, max: 50  },
  { key: 'radius',      id: 'radius',      kind: 'number', def: 5,   min: 0,   max: 100 },
  { key: 'plateShape',  id: 'plateShape',  kind: 'select' },
  { key: 'text',        id: 'text',        kind: 'text',   spec: false },
  { key: 'textMulti',   id: 'textMulti',   kind: 'text',   spec: false },
  { key: 'mode',        id: 'mode',        kind: 'radio'  },
  { key: 'fontUrl',     id: 'font',        kind: 'select' },
  { key: 'fontSize',    id: 'fontSize',    kind: 'number', def: 8,   min: 1,   max: 100 },
  { key: 'raise',       id: 'raise',       kind: 'number', def: 1.5, min: 0.1, max: 20  },
  { key: 'lineSpacing', id: 'lineSpacing', kind: 'number', def: 1.3, min: 0.8, max: 3   },
  { key: 'textStyle',   id: 'textStyle',   kind: 'radio'  },
  { key: 'plateColor',  id: 'plateColor',  kind: 'color'  },
  { key: 'textColor',   id: 'textColor',   kind: 'color'  },
];
