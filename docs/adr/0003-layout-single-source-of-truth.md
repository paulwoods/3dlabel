# ADR-0003: `layoutLabels` is the single source of truth for placement

## Status

Accepted

## Context

When the user designs N labels (Multiple mode), four parts of the app need to
agree on **where each label sits** on the build plate:

1. the live preview (`rebuildScene`) — positions the meshes,
2. camera-fit (`fitCamera`) — needs the overall footprint,
3. STL export — bakes each part at its placement,
4. 3MF export — same.

When each of these computed its own grid inline, they could **drift**: a label
centered in the preview but offset in the export, or a camera framing a footprint
that didn't match the geometry. The grid rule (square-ish, origin-centered) was
re-derived in four places that had no reason to stay in sync.

## Decision

Make placement a single pure module. `layoutLabels(n, length, width, gap)` in
`layout.js` returns everything the four consumers need and nothing more:

```js
{ placements: [{ x, z }, …],  // one per label
  totalLength,                // footprint along X
  totalDepth }                // footprint along Z
```

The grid rule lives *only* here: `cols = ⌈√n⌉`, centered on the origin in the XZ
plane, partial last row left-aligned. `cols`/`rows` are deliberately **not
exposed** — callers learn four numbers and get correct placements; the rule stays
hidden behind the seam. All four consumers read this one function.

## Consequences

- **Preview and exports cannot disagree** — they consume the same placements by
  construction. This is the whole point: the class of "looks right, prints wrong"
  bug is designed out.
- **The grid rule changes in one place.** Switching to, say, a fixed-column
  layout touches `layoutLabels` and nothing else.
- **Unit-tested** in `layout.test.js` with no Three.js (it has zero `THREE`
  dependency — an instance of [ADR-0002](0002-pure-cores-injected-ops.md)).
- **Local placement tweaks must go through the module.** A consumer can't nudge
  one label without changing the shared rule. This is intended — the inability to
  drift is the feature — but it means per-consumer placement variation (if ever
  wanted) needs a new parameter on the seam, not a local hack.
