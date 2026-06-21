// ── Label layout ──────────────────────────────────────────────────────────────
// Pure, dependency-free placement of N labels on the build plate. This is the
// single source of truth for the grid — the preview, camera-fit, STL export and
// 3MF export all consume its output, so they can never disagree about where a
// label sits.
//
// The grid is square-ish (cols = ⌈√n⌉) and centered on the origin in the XZ
// plane (x = along length, z = along width/depth), matching the Three.js Y-up
// scene. A partially-filled last row is left-aligned.
//
//   layoutLabels(n, length, width, gap)
//     → { placements: [{ x, z }, …],   // one per label, length-many
//         totalLength,                  // overall footprint along X
//         totalDepth }                  // overall footprint along Z
//
// cols/rows are deliberately not exposed — callers learn four numbers and get
// correct placements; the grid rule stays hidden here.
export function layoutLabels(n, length, width, gap) {
  if (n <= 0) return { placements: [], totalLength: 0, totalDepth: 0 };

  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const totalLength = cols * length + (cols - 1) * gap;
  const totalDepth  = rows * width  + (rows - 1) * gap;

  const placements = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    placements.push({
      x: -totalLength / 2 + col * (length + gap) + length / 2,
      z: -totalDepth  / 2 + row * (width  + gap) + width  / 2,
    });
  }

  return { placements, totalLength, totalDepth };
}
