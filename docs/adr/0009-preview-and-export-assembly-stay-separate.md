# ADR-0009: Preview and export assembly stay separate; only the text gate is shared

## Status

Accepted

## Context

Two loops walk the **Spec**'s labels and pair a **Plate** with optional **Text**:

- `rebuildScene` in `main.js` — builds low-detail geometry, wraps each part in a
  `THREE.Mesh` with a material, positions it, adds it to the scene, and *keeps*
  it in `labelMeshes` until the next rebuild.
- `buildLabelModel` in `label-model.js` — builds high-detail geometry, bakes each
  part for export (ADR-0004), and hands it to a caller that disposes it
  immediately (ADR-0008's sibling contract, `disposeLabelModel`).

They are structurally similar: map over `spec.texts`, take `placements[i]`, build
a plate, decide whether the label gets text, return `{ plate, text }`. An
architecture review proposed collapsing them into one
`assembleLabels(spec, font, placements, ops)` with each caller injecting ops for
its own sink — and gated its own recommendation on a condition: *only worth it if
the gate actually drifts*.

It had not. Both loops spelled the condition `txt.trim().length > 0 && font`,
character for character. Everything that legitimately differs was already in the
right place:

| Difference | Where it lives |
|---|---|
| detail level (low vs high poly) | the `ops` (`false` vs `true`) |
| sink (scene vs merge/serialize) | the caller |
| lifetime (retained vs disposed) | the caller |

## Decision

Share the **decision**, not the **loop**. `wantsText(txt, font)` in
`label-model.js` is the single home of "does this label get text at all," and
both loops call it. Everything else stays where it is.

Unifying the loops was rejected. Doing it would make the shared function's return
type depend on which ops it was handed — `BufferGeometry` for export, `Mesh` for
preview — so `{ plate, text }` would no longer describe anything specific. That
weakens `buildLabelModel`'s contract to buy the deduplication of about five lines
of loop skeleton, of which exactly one is a shared decision. It would also blur
**Label model**, defined in `CONTEXT.md` as *export-ready geometry*, into a term
that also covers scene meshes, and it would put a `scene.add()` side effect into
the `ops` object beside otherwise value-returning operations.

## Consequences

- **The gate cannot desync.** A preview that shows text where the export omits it
  (or the reverse) is the specific bug this class of duplication produces, and it
  is now impossible without changing one function. `label-model.test.js` pins the
  truth table.
- **`wantsText` returns a real boolean.** The inlined form evaluated to the font
  *object* when true — fine inside an `if`, wrong the moment a caller stores or
  compares the result. Extracting it normalized a latent trap.
- **The loop skeleton is still written twice.** `map` over texts, index into
  `placements`, pair into `{ plate, text }`. If a *second* shared decision appears
  — a per-label skip rule, a placement adjustment both must honour — that is the
  signal to revisit, because at two shared decisions the balance shifts.
- **The two paths can still drift in ways nothing catches.** Nothing mechanically
  keeps `rebuildScene` iterating the same labels in the same order as
  `buildLabelModel`; they agree because both consume `layoutLabels`
  ([ADR-0003](0003-layout-single-source-of-truth.md)) and now the same gate. That
  is a convention backed by two single-source-of-truth modules, not a guarantee.
- **A rejected alternative is recorded, not just skipped.** The review recommends
  the unification; without this ADR the next reader would implement it and quietly
  weaken two contracts. The condition for reversing this decision is written above.
