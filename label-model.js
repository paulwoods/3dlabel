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
// every `plate` and `text` it receives once it is done (after merge / serialize),
// by calling disposeLabelModel below (ADR-0004).
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

// Every geometry in a model as one flat list — plate then text per label, in
// label order — with text-less labels contributing only their plate. This order
// is what STL merges in, so it decides the exported byte layout.
export function labelParts(model) {
  return model.flatMap(l => l.text ? [l.plate, l.text] : [l.plate]);
}

// The ownership contract from buildLabelModel's header, in one place: release
// every geometry the model holds. Both exporters call this once they are done.
//
// Disposing from the *model* rather than from some list derived along the way
// is the point. STL used to dispose the array it had flattened for the merge —
// correct only for as long as those two lists stay identical. Anything that
// later narrowed the merge input (skipping an empty part, say) would silently
// narrow the dispose list with it and leak the difference.
//
// Only the exporters share this. The preview keeps its own teardown: its labels
// hold Meshes, not geometries, and it must also release materials and remove
// each mesh from the scene — a different contract that happens to iterate a
// similarly-shaped list.
export function disposeLabelModel(model) {
  for (const geo of labelParts(model)) geo.dispose();
}

// True when nothing needs the font yet, or the selected font is already loaded.
// Lets export handlers decide whether to alert the user, keeping the alert (a UI
// concern) out of the model.
export function isFontReady(spec, fonts) {
  return !spec.texts.some(t => t.trim()) || fonts.has(spec.fontUrl);
}
