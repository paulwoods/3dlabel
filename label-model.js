// ── Label model ─────────────────────────────────────────────────────────────
// Pure orchestration for the export-ready geometry of N labels. Like layout.js
// it imports nothing: every THREE-bound operation is injected via `ops`, so the
// per-label loop, text/no-text decision, and placement pairing can be exercised
// headlessly with fakes. The real ops (built in main.js) carry all the THREE
// usage and the shared "bake for export" recipe (non-index → translate → print
// transform) that STL and 3MF would otherwise each re-implement.
//
//   buildLabelModel(spec, font, placements, ops)
//     → [ { plate: BufferGeometry, text: BufferGeometry | null }, … ]
//
// ops = {
//   buildPlate(spec)            → BufferGeometry            (one plate, origin-centered)
//   buildText(spec, txt, font)  → BufferGeometry | null     (one text block, or null)
//   bakeForExport(geo, place, t)→ BufferGeometry            (NI → translate(place) → print transform)
// }
//
// Geometry ownership: this function *creates* geometries; the caller disposes
// every `plate` and `text` it receives once it is done (after merge / serialize).
export function buildLabelModel(spec, font, placements, ops) {
  return spec.texts.map((txt, i) => {
    const placement = placements[i];
    const plate = ops.bakeForExport(ops.buildPlate(spec), placement, spec.thickness);

    let text = null;
    if (txt.trim().length > 0 && font) {
      const raw = ops.buildText(spec, txt, font);
      if (raw) text = ops.bakeForExport(raw, placement, spec.thickness);
    }

    return { plate, text };
  });
}

// True when nothing needs the font yet, or the selected font is already loaded.
// Lets export handlers decide whether to alert the user, keeping the alert (a UI
// concern) out of the model.
export function isFontReady(spec, fonts) {
  return !spec.texts.some(t => t.trim()) || fonts.has(spec.fontUrl);
}
