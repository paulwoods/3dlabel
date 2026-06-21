# ADR-0002: Pure, import-free cores tested headlessly via injected ops

## Status

Accepted

## Context

The geometry and export logic originally lived inline in `main.js`, entangled
with Three.js: the per-label placement loop, the text/no-text decision, the 3MF
document assembly, and the STL merge all called `THREE.*` directly. None of it
could run outside a browser with a WebGL context, so none of it was unit-tested —
yet the real bugs live exactly there (a label placed correctly in the preview but
offset in the export; an orientation fix applied to STL but not 3MF).

[ADR-0001](0001-no-build-step-cdn-importmap.md) rules out a bundler, so there is
no jsdom/webpack harness that could resolve `import 'three'` in a test. We want
fast, deterministic unit tests with no `npm install`.

The forces: the *decisions* in this code (which geometry to build, where to place
it, how to assemble the document) are pure and worth testing; the *leaf
operations* (actually constructing a `BufferGeometry`) are irreducibly
Three.js-bound and not worth testing.

## Decision

Separate the two. Extract the decision-making logic into **pure modules that
import nothing** — `layout.js`, `label-model.js`, `threemf.js`. Every
Three.js-bound leaf operation is **injected** as an `ops` object:

```js
buildLabelModel(spec, font, placements, ops)
// ops = { buildPlate, buildText, bakeForExport }
```

The real `ops` (`exportOps` in `main.js`) carry all the `THREE` usage; tests pass
fakes. `threemf.js` goes further — it touches geometry only through the read-only
`position` accessor (`count` / `getX/Y/Z`), so a test can hand it a tiny plain
object instead of a `BufferGeometry`.

Tests run on **Node's built-in runner** (`node --test`) — no framework, no
install. `package.json` stays config-only.

## Consequences

- **The interface is the test surface.** `label-model.test.js`,
  `layout.test.js`, and `threemf.test.js` exercise the per-label loop, the
  text/no-text branch, placement pairing, and the full 3MF document assembly with
  zero browser. The leaf ops that *can't* be tested headlessly are also the ones
  not worth testing.
- **The cores are deep and relocatable** — zero dependencies, reasoned about in
  isolation, no hidden coupling to scene state.
- **Indirection cost.** Reading `buildLabelModel`, you must look up what
  `buildPlate`/`bakeForExport` actually do in `main.js`'s `exportOps`. The
  injection that buys testability also spreads one operation across two files.
- **A discipline, not a guarantee.** Nothing mechanically prevents a future edit
  from adding `import * as THREE from 'three'` to a core; doing so would break
  `node --test`. The rule "cores import nothing" has to be held by convention
  (and is documented in `CONTEXT.md` and each file's header).
- Instances of this pattern: [ADR-0004](0004-one-bake-for-export-recipe.md) (the
  `bakeForExport` op) and [ADR-0006](0006-hand-rolled-3mf.md) (the entirely pure
  3MF module).
