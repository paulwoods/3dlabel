# ADR-0008: One field manifest drives validation, reading, persistence, and wiring

## Status

Accepted

## Context

A parameter — say `lineSpacing` — had to be declared in four independent places
before it worked:

| Place | What it declared |
|---|---|
| `normalizeSpec` in `spec.js` | its default and clamp range |
| `readParams()` in `main.js` | which DOM element supplies its value |
| `PERSISTED_IDS` in `main.js` | that it belongs in saved **Settings** |
| the listener list in `main.js` | that changing it saves and rebuilds |

Plus a fifth, in `index.html`: the `value`/`min`/`max` attributes, which must
match the clamps so the form is correct before any JS runs.

[ADR-0007](0007-settings-serialization-pair.md) already removed the *serialization*
drift, but it did so by unifying two functions over a hand-maintained id list — it
did not remove the list. The remaining failure mode is that **every one of these
omissions is silent**. Miss `PERSISTED_IDS` and the field simply never persists.
Miss the listener and the preview never updates for it. Nothing throws, no test
fails, and the bug surfaces later as "my setting didn't save."

The lists also key off *different* identifiers, which is why keeping them in step
by eye is harder than it looks: the Spec calls the font field `fontUrl`, the DOM
and every saved settings file call it `font`.

## Decision

One `FIELDS` manifest in `fields.js` — pure data, no imports — declaring each
parameter once:

```js
{ key: 'lineSpacing', id: 'lineSpacing', kind: 'number', def: 1.3, min: 0.8, max: 3 }
```

`key` is the **Spec** name, `id` is the DOM id *and* the saved-settings key, and
`kind` says how the value is read and validated. All four consumers derive from
it: `normalizeSpec` clamps numeric fields by `def`/`min`/`max`, and `readParams`,
`readSettings`/`applySettings`, and the change-listener loop iterate it through
three small DOM accessors in `main.js` (`readField`, `writeField`,
`fieldElements`). Adding a parameter is one manifest entry plus the markup.

`key` and `id` stay separate rather than being collapsed. Re-keying settings to
the Spec name would orphan the `font` value in every settings file already saved.

The `index.html` copy stays where it is — the attributes have to be in the markup
to be right before JS runs — but `fields.test.js` reads the HTML as text and
asserts that every manifest id exists and every `value`/`min`/`max` matches. That
closes the one drift the manifest cannot close by construction.

## Consequences

- **A silent four-way drift becomes a single declaration.** The failure mode this
  removes was not "hard to change" but "changed wrongly without telling anyone."
- **The event wiring is derived, not enumerated.** `<select>` and radio groups
  need `change`, typed and picked inputs need `input`. That rule is now stated
  once in `fieldEvent` instead of being re-decided per field.
- **A pure module now holds DOM ids.** `fields.js` never *uses* them — they are
  strings it hands to `main.js` — but a reader will reasonably ask why the
  manifest isn't split into a pure half and a DOM half. It isn't, because
  splitting it would recreate exactly the drift it exists to remove: the clamp
  and the element it belongs to are one fact.
- **`spec.js` imports another module.** [ADR-0002](0002-pure-cores-injected-ops.md)
  said cores "import nothing"; a core may now import another pure core. The rule
  that mattered — no THREE, no DOM, so `node --test` can run it — is unchanged.
- **The manifest can express less than free-form code could.** Two fields already
  need an escape hatch: `text` and `textMulti` carry `spec: false` because they
  collapse into the Spec's `texts` rather than appearing in it. A future parameter
  that resists the `key`/`id`/`kind` shape will either widen the schema for
  everyone or need a special case beside the loop. This is the standing cost, and
  the point at which to reconsider is when the special cases outnumber the
  regular entries — not at the first one.
- **UI side effects stay out of the manifest.** `applyShapeUI` and `applyModeUI`
  are attached as their own listeners in `main.js` rather than declared as
  manifest callbacks. They are DOM behaviour, and putting function references in
  the data would make `fields.js` impure for the sake of two fields.
- Extends [ADR-0007](0007-settings-serialization-pair.md)'s single-source-of-truth
  discipline from the serialization pair to the field list the pair iterates.
