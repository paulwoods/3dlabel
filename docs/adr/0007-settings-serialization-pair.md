# ADR-0007: One settings serialization pair; localStorage and file are adapters

## Status

Accepted

## Context

The form state (**Settings**) must round-trip to two destinations:

- **localStorage** — saved on every change, restored on load, so a returning user
  keeps their design (key `3dlabel_v1`);
- a **`.json` file** — explicit Save / Load buttons for sharing or backup.

When the form-to-data and data-to-form serialization was written separately in
each path, the two could **drift**: add a new field (e.g. `lineSpacing`) and it
might be persisted to localStorage but omitted from the file, or restored by one
path and ignored by the other.

## Decision

Make serialization a single pair of DOM-bound functions in `main.js`:

- `readSettings()` — form → plain object,
- `applySettings(data)` — object → form.

localStorage and the `.json` file are **two thin adapters** over that pair; each
just chooses a transport (localStorage string vs. file Blob) and calls the pair.
Crucially, `applySettings` **writes the DOM only** — it does not re-save or
rebuild. The caller decides what happens next: the init-time restore applies
without re-saving (no echo), while a file Load applies *and then* triggers a save
and a scene rebuild.

This is the "two adapters = a real seam" rule in practice: the pair exists
because two independent callers need exactly it.

## Consequences

- **A new field is one edit.** Add it to `readSettings`/`applySettings` and both
  adapters inherit it; they can no longer disagree about what a setting is. Since
  [ADR-0008](0008-one-field-manifest.md) the pair iterates the `FIELDS` manifest,
  so it is not even that edit — the hand-maintained `PERSISTED_IDS` list is gone.
- **The seam is earned, not speculative.** Two concrete adapters justify it; it
  isn't an abstraction added "just in case."
- **`applySettings`'s no-side-effect contract is subtle.** Because it only writes
  the DOM, a caller that forgets to rebuild afterward will leave the preview
  stale. The contract is deliberate (it's what lets the init restore avoid a
  redundant save) but it must be remembered — it's documented in the function's
  header and in `CONTEXT.md`.
- Shares the single-source-of-truth discipline of
  [ADR-0003](0003-layout-single-source-of-truth.md), applied to form state
  instead of geometry placement.
