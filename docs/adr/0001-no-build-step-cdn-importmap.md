# ADR-0001: No build step — single static page with a CDN importmap

## Status

Accepted

## Context

The 3D Label Designer is a small, single-purpose browser tool. Its only runtime
dependency is Three.js (plus a few `three/addons/` modules: `FontLoader`,
`TextGeometry`, `OrbitControls`, `BufferGeometryUtils`, `STLExporter`).

The conventional path would be a bundler (Vite, webpack, esbuild) with an `npm
install` step: it gives tree-shaking, minification, local dependency pinning, and
a test harness that can resolve bare imports. The cost is a toolchain — a
`node_modules`, a lockfile, a build command between editing a file and seeing it
in the browser, and a CI step before deploy.

For a tool of this size that does not need code-splitting or minification, that
toolchain is overhead that buys little.

## Decision

Ship with **no build step**. `index.html` is served as-is by any static file
server. Three.js and its add-ons are loaded from a CDN via an **importmap**
declared inline in `index.html`:

```html
<script type="importmap">
{ "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
}}
</script>
```

`main.js` and the cores import natively (`import { layoutLabels } from
'./layout.js'`). `package.json` is configuration only — `{"type":"module"}` so
Node treats the `.js` files as ES modules; there is nothing to `npm install`.

The importmap **must** stay in `index.html`: browsers process it at parse time,
before any module script runs, so it cannot be moved into `main.js`.

## Consequences

- **Edit → refresh is instant.** No watch process, no rebuild. Deployment is
  "copy the files behind a static server" — the `Dockerfile` is exactly that.
- **The Three.js version is pinned in the URL** (`three@0.184.0`). Upgrading
  means editing two URLs in `index.html`, not a lockfile bump.
- **Offline development needs the CDN** the first time (the browser caches
  thereafter). There is no vendored copy of Three.js.
- **No tree-shaking or minification.** Acceptable: the app is small and the
  heavy dependency is fetched from a cache-friendly CDN anyway.
- **Node cannot resolve `three` in tests** — there is no bundler to map the bare
  import. Rather than fight this, it is turned into a design constraint: the
  testable logic must not import Three.js at all. That constraint is the seed of
  [ADR-0002](0002-pure-cores-injected-ops.md).
