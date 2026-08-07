# ADR-0004: One "bake for export" recipe shared by STL and 3MF

## Status

Accepted

## Context

Both exporters turn a freshly built **Plate** or **Text** geometry into an
export-ready part with the *same* three-step recipe:

1. drop the index buffer (`toNonIndexed`) — exporters want flat triangle soup,
2. translate the part to its **Layout** placement,
3. apply the print-orientation transform (see
   [ADR-0005](0005-bake-print-orientation.md)).

Originally STL and 3MF each implemented this recipe inline. With the steps
duplicated, the two could **drift**: a fix to orientation or placement could land
in one exporter and silently miss the other, so an STL and a 3MF of the same
design would no longer be the same object.

## Decision

Centralize the recipe in **one operation**, `exportOps.bakeForExport(geo,
placement, thickness)` in `main.js`:

```js
bakeForExport: (geo, placement, thickness) => {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  if (ni !== geo) geo.dispose();
  ni.applyMatrix4(new THREE.Matrix4().makeTranslation(placement.x, 0, placement.z));
  applyPrintTransform(ni, thickness);
  return ni;
}
```

It is injected into `buildLabelModel` (per [ADR-0002](0002-pure-cores-injected-ops.md)),
which produces the **Label model** — one baked `{ plate, text|null }` per label.
Both exporters consume that model; neither re-implements the recipe. This is the
home of the "Bake for export" term in `CONTEXT.md`.

## Consequences

- **Locality.** Placement and orientation now live in one function. A fix can no
  longer apply to STL but not 3MF — they share the bytes.
- **`buildLabelModel` stays pure.** The recipe is `THREE`-bound, so it is
  injected rather than imported, keeping the model headlessly testable.
- **A shared ownership contract.** The model *creates* geometries and the caller
  must `dispose()` every `plate` and `text` it receives after merging /
  serializing. Both exporters are coupled to that contract; getting it wrong
  leaks GPU memory. It is documented in `label-model.js`'s header and satisfied
  by the one `disposeLabelModel(model)` there — stating a contract and leaving
  each caller to re-implement it was the gap, since STL disposed the list it had
  flattened *for the merge* rather than the model it owned. Those two lists were
  identical, so nothing leaked; but anything that later narrowed the merge input
  would have silently narrowed the dispose list with it.
- **A dispose bug here is invisible in the output.** THREE's `dispose()` releases
  GPU buffers, not the JS-side attribute arrays, so a mistimed or missing dispose
  still produces a byte-perfect STL or 3MF. Nothing about the exported file can
  catch it — which is why `label-model.test.js` asserts the contract directly
  (every part of a model is disposed) instead of relying on export assertions.
- Depends on [ADR-0005](0005-bake-print-orientation.md) for step 3 and
  [ADR-0002](0002-pure-cores-injected-ops.md) for the injection mechanism.
