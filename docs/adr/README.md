# Architecture Decision Records

This directory records the **load-bearing architectural decisions** behind the 3D
Label Designer — the choices that shaped the codebase and that a future change
should understand before reversing.

Each ADR follows the lightweight [Michael Nygard
format](https://github.com/joelparkerhenderson/architecture-decision-record):

- **Status** — Proposed / Accepted / Superseded.
- **Context** — the forces in play: what made a decision necessary, the
  alternatives, the constraints.
- **Decision** — what we chose, stated in the active voice.
- **Consequences** — what becomes easier *and* what we now pay for it. The costs
  are not an afterthought; they are the point of writing it down.

These ADRs were recorded retroactively (2026-06-20) from the codebase and its git
history, so each describes a decision already in force. They use the architecture
vocabulary (**module**, **seam**, **adapter**, **depth**, **locality**,
**leverage**) and the domain language from [`CONTEXT.md`](../../CONTEXT.md)
(**Label**, **Plate**, **Text**, **Spec**, **Layout**, **Label model**, **Bake
for export**, **Ops**, **3MF document**, **Settings**).

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-no-build-step-cdn-importmap.md) | No build step — single static page with a CDN importmap | Accepted |
| [0002](0002-pure-cores-injected-ops.md) | Pure, import-free cores tested headlessly via injected ops | Accepted |
| [0003](0003-layout-single-source-of-truth.md) | `layoutLabels` is the single source of truth for placement | Accepted |
| [0004](0004-one-bake-for-export-recipe.md) | One "bake for export" recipe shared by STL and 3MF | Accepted |
| [0005](0005-bake-print-orientation.md) | Bake the Y-up → Z-up print orientation into exported geometry | Accepted |
| [0006](0006-hand-rolled-3mf.md) | Hand-roll the 3MF package instead of taking a dependency | Accepted |
| [0007](0007-settings-serialization-pair.md) | One settings serialization pair; localStorage and file are adapters | Accepted |

## Relationships

```
0001 (no build step)
  └─ enables ──> 0002 (pure cores + injected ops, node --test)
                   ├─ instance ──> 0004 (bakeForExport recipe)
                   │                  └─ applies ──> 0005 (print transform)
                   └─ instance ──> 0006 (hand-rolled 3MF document)
0003 (layout SSOT) ── same SSOT discipline as ──> 0007 (settings pair)
```
