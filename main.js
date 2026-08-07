import * as THREE from 'three';
import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
import { FontLoader }          from 'three/addons/loaders/FontLoader.js';
import { TextGeometry }        from 'three/addons/geometries/TextGeometry.js';
import { STLExporter }         from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries }     from 'three/addons/utils/BufferGeometryUtils.js';
import { layoutLabels }        from './layout.js';
import { buildLabelModel, isFontReady } from './label-model.js';
import { build3mf }            from './threemf.js';
import { normalizeSpec }       from './spec.js';

// ── Font catalogue ────────────────────────────────────────────────────────────
const FONT_BASE = 'https://cdn.jsdelivr.net/npm/three@0.184.0/examples/fonts/';
const FONT_DEFS = [
  { label: 'Helvetiker Regular',   url: FONT_BASE + 'helvetiker_regular.typeface.json' },
  { label: 'Helvetiker Bold',      url: FONT_BASE + 'helvetiker_bold.typeface.json' },
  { label: 'Optimer Regular',      url: FONT_BASE + 'optimer_regular.typeface.json' },
  { label: 'Optimer Bold',         url: FONT_BASE + 'optimer_bold.typeface.json' },
  { label: 'Gentilis Regular',     url: FONT_BASE + 'gentilis_regular.typeface.json' },
  { label: 'Gentilis Bold',        url: FONT_BASE + 'gentilis_bold.typeface.json' },
  { label: 'Droid Sans Regular',   url: FONT_BASE + 'droid/droid_sans_regular.typeface.json' },
  { label: 'Droid Sans Bold',      url: FONT_BASE + 'droid/droid_sans_bold.typeface.json' },
  { label: 'Droid Serif Regular',  url: FONT_BASE + 'droid/droid_serif_regular.typeface.json' },
  { label: 'Droid Serif Bold',     url: FONT_BASE + 'droid/droid_serif_bold.typeface.json' },
  { label: 'Droid Sans Mono',      url: FONT_BASE + 'droid/droid_sans_mono_regular.typeface.json' },
];
const loadedFonts = new Map();

// ── Renderer / Scene / Camera ─────────────────────────────────────────────────
const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d1a);
scene.fog = new THREE.FogExp2(0x0d0d1a, 0.002);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 5;
controls.maxDistance = 3000;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.4);
sunLight.position.set(100, 200, 150);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 1000;
sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -300;
sunLight.shadow.camera.right = sunLight.shadow.camera.top = 300;
scene.add(sunLight);

const rimLight = new THREE.DirectionalLight(0x6666ff, 0.35);
rimLight.position.set(-150, 80, -200);
scene.add(rimLight);

// Floor grid
const grid = new THREE.GridHelper(800, 32, 0x1e1e3e, 0x191930);
grid.position.y = -40;
grid.material.transparent = true;
grid.material.opacity = 0.6;
scene.add(grid);

// Resize
const resizeObs = new ResizeObserver(() => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});
resizeObs.observe(container);

// Render loop
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

// ── State ─────────────────────────────────────────────────────────────────────
let labelMeshes = [];
let rebuildTimer = null;

// ── Parameter reader ──────────────────────────────────────────────────────────
// Thin DOM adapter: gathers raw form values (as strings) and hands them to the
// pure, headlessly-tested normalizeSpec in spec.js. The clamps, defaults, and
// mode → texts expansion live there — one tested seam between the DOM and the
// rest of the app. An instance of the pure-core pattern (ADR-0002).
function readParams() {
  return normalizeSpec({
    length:      document.getElementById('length').value,
    width:       document.getElementById('width').value,
    thickness:   document.getElementById('thickness').value,
    radius:      document.getElementById('radius').value,
    plateShape:  document.getElementById('plateShape').value,
    text:        document.getElementById('text').value,
    textMulti:   document.getElementById('textMulti').value,
    mode:        document.querySelector('input[name="mode"]:checked').value,
    fontUrl:     document.getElementById('font').value,
    fontSize:    document.getElementById('fontSize').value,
    raise:       document.getElementById('raise').value,
    lineSpacing: document.getElementById('lineSpacing').value,
    textStyle:   document.querySelector('input[name="textStyle"]:checked').value,
    plateColor:  document.getElementById('plateColor').value,
    textColor:   document.getElementById('textColor').value,
  });
}

// ── Plate geometry (rounded-rectangle extrusion) ─────────────────────────────
// Uses ExtrudeGeometry so the top/bottom faces stay flat while the vertical
// edges get rounded corners.  Rotation + translation match BoxGeometry's
// default orientation: plate flat in XZ plane, thickness along Y, centered
// at origin.
function createPlateGeometry(length, width, thickness, radius, highDetail, plateShape = 'roundedRect') {
  const hw = length / 2;
  const hh = width  / 2;
  const shape = new THREE.Shape();

  if (plateShape === 'circle' || plateShape === 'ellipse') {
    // Circle uses the smaller dimension as its diameter; ellipse uses both axes.
    const rx = plateShape === 'circle' ? Math.min(hw, hh) : hw;
    const ry = plateShape === 'circle' ? Math.min(hw, hh) : hh;
    shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  } else {
    // Rounded rectangle when radius > 0 (clamped to fit), plain rectangle otherwise.
    const r = plateShape === 'rectangle'
      ? 0
      : Math.max(0, Math.min(radius, length / 2 - 0.01, width / 2 - 0.01));
    if (r <= 0) {
      shape.moveTo(-hw, -hh);
      shape.lineTo( hw, -hh);
      shape.lineTo( hw,  hh);
      shape.lineTo(-hw,  hh);
      shape.closePath();
    } else {
      shape.moveTo(-hw + r, -hh);
      shape.lineTo( hw - r, -hh);
      shape.absarc( hw - r, -hh + r, r, -Math.PI / 2, 0,           false);
      shape.lineTo( hw,      hh - r);
      shape.absarc( hw - r,  hh - r, r, 0,           Math.PI / 2,  false);
      shape.lineTo(-hw + r,  hh);
      shape.absarc(-hw + r,  hh - r, r, Math.PI / 2, Math.PI,      false);
      shape.lineTo(-hw,     -hh + r);
      shape.absarc(-hw + r, -hh + r, r, Math.PI,     Math.PI * 1.5, false);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth:         thickness,
    bevelEnabled:  false,
    curveSegments: highDetail ? 16 : 8,
  });

  // ExtrudeGeometry puts the shape in XY, extrudes +Z.
  // Rx(-90°) → shape lies in XZ, extrusion goes +Y.
  // Then shift down by thickness/2 to center on Y axis.
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -thickness / 2, 0));
  return geo;
}

// ── Text geometry (used by both preview and export) ───────────────────────────
// Returns a positioned, non-indexed BufferGeometry ready for merging/rendering.
//
// Coordinate logic:
//   TextGeometry is raw in XY plane, extruded +Z.
//   Rx(-PI/2) transforms: (x,y,z) → (x, z, -y)
//     • old Z (extrusion) → new +Y  (raised text faces up)
//     • old Y (glyph height) → new -Z  (glyph depth on plate, in -Z half)
//   Translation then centers X/Z and lifts onto plate top face.
function buildTextGeometry(text, font, fontSize, raise, thickness, highDetail, lineSpacing = 1.3, textStyle = 'raised') {
  // Engraved text extrudes *down* into the plate; clamp its depth so it never
  // pokes through the bottom face.
  const effRaise = textStyle === 'engraved' ? Math.min(raise, thickness) : raise;

  // Build one TextGeometry per line in the pre-rotation XY plane. Each line is
  // centred on X; successive lines step downward in glyph-space (pre-rotation
  // -Y), which becomes the +Z depth axis after the Rx(-90°) below — so lines
  // stack front-to-back on the plate in natural reading order.
  const lines = text.split('\n');
  const lineGeos = [];
  lines.forEach((line, i) => {
    if (line.trim().length === 0) return;  // blank line still advances the row index
    const g = new TextGeometry(line, {
      font,
      size:          fontSize,
      depth:         effRaise,
      curveSegments: highDetail ? 12 : 5,
      bevelEnabled:  false,
    });
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const lw = bb.max.x - bb.min.x;
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(
      -(bb.min.x + lw / 2),            // centre this line on X
      -i * fontSize * lineSpacing,     // stack downward in glyph-space
      0
    ));
    lineGeos.push(g);
  });

  if (lineGeos.length === 0) return null;

  const geo = lineGeos.length === 1 ? lineGeos[0] : mergeGeometries(lineGeos);
  if (lineGeos.length > 1) lineGeos.forEach(g => g.dispose());

  // Centre the whole block on Z and lift/recess onto the plate top face.
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const tyMid = (bb.min.y + bb.max.y) / 2;

  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

  // raised  → text bottom sits on the top face (y = thickness/2)
  // engraved → text top sits flush with the top face, body recessed into plate
  const yOffset = textStyle === 'engraved' ? thickness / 2 - effRaise : thickness / 2;
  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, yOffset, tyMid));

  return geo;
}

const LABEL_GAP = 5;

// ── Scene rebuild ─────────────────────────────────────────────────────────────
function rebuildScene() {
  const p = readParams();

  for (const { plate, text } of labelMeshes) {
    scene.remove(plate); plate.geometry.dispose(); plate.material.dispose();
    if (text) { scene.remove(text); text.geometry.dispose(); text.material.dispose(); }
  }
  labelMeshes = [];

  const { placements } = layoutLabels(p.texts.length, p.length, p.width, LABEL_GAP);
  const font = loadedFonts.get(p.fontUrl);

  p.texts.forEach((txt, i) => {
    const { x: xOffset, z: zOffset } = placements[i];

    const plate = new THREE.Mesh(
      createPlateGeometry(p.length, p.width, p.thickness, p.radius, false, p.plateShape),
      new THREE.MeshStandardMaterial({ color: p.plateColor, roughness: 0.45, metalness: 0.15 })
    );
    plate.position.x = xOffset;
    plate.position.z = zOffset;
    plate.castShadow = plate.receiveShadow = true;
    scene.add(plate);

    let textObj = null;
    if (txt.trim().length > 0 && font) {
      const tg = buildTextGeometry(txt, font, p.fontSize, p.raise, p.thickness, false, p.lineSpacing, p.textStyle);
      if (tg) {
        textObj = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: p.textColor, roughness: 0.3, metalness: 0.1 }));
        textObj.position.x = xOffset;
        textObj.position.z = zOffset;
        textObj.castShadow = true;
        scene.add(textObj);
      }
    }

    labelMeshes.push({ plate, text: textObj });
  });
}

// ── Camera fit ────────────────────────────────────────────────────────────────
function fitCamera() {
  const p = readParams();
  const { totalLength, totalDepth } = layoutLabels(p.texts.length, p.length, p.width, LABEL_GAP);
  const halfL = totalLength / 2;
  const halfD = totalDepth  / 2;
  const halfT = (p.thickness + p.raise) / 2;
  const sphere = new THREE.Box3(
    new THREE.Vector3(-halfL, -halfT, -halfD),
    new THREE.Vector3( halfL,  halfT,  halfD)
  ).getBoundingSphere(new THREE.Sphere());
  const fovRad = camera.fov * Math.PI / 180;
  const dist   = (sphere.radius / Math.sin(fovRad / 2)) * 1.6;
  camera.position.set(dist * 0.45, dist * 0.5, dist);
  controls.target.copy(sphere.center);
  camera.near = dist * 0.001;
  camera.far  = dist * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

// ── Debounced rebuild wiring ──────────────────────────────────────────────────
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildScene, 80);
}

// ── LocalStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = '3dlabel_v1';
const PERSISTED_IDS = ['length','width','thickness','radius','plateShape','text','font','fontSize','raise','lineSpacing','plateColor','textColor','textMulti'];

// ── Settings (form ↔ plain object) ────────────────────────────────────────────
// One pair of functions is the single source of truth for serialising the form.
// localStorage and the settings file are two adapters over them. applySettings
// only writes the DOM — callers decide whether to re-save / rebuild afterwards.
function readSettings() {
  const data = {};
  PERSISTED_IDS.forEach(id => { data[id] = document.getElementById(id).value; });
  data.mode = document.querySelector('input[name="mode"]:checked').value;
  data.textStyle = document.querySelector('input[name="textStyle"]:checked').value;
  return data;
}

function applySettings(data) {
  PERSISTED_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el && data[id] !== undefined) el.value = data[id];
  });
  if (data.mode) {
    const radio = document.querySelector(`input[name="mode"][value="${data.mode}"]`);
    if (radio) { radio.checked = true; applyModeUI(data.mode); }
  }
  if (data.textStyle) {
    const styleRadio = document.querySelector(`input[name="textStyle"][value="${data.textStyle}"]`);
    if (styleRadio) styleRadio.checked = true;
  }
  // Keep hex text fields in sync with restored colour picker values.
  document.getElementById('plateColorHex').value = document.getElementById('plateColor').value;
  document.getElementById('textColorHex').value  = document.getElementById('textColor').value;
  applyShapeUI();
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readSettings()));
}

function loadFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data) applySettings(data);
  } catch (_) { /* corrupt storage — ignore */ }
}

['length','width','thickness','radius','text','fontSize','raise','lineSpacing'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => { saveToStorage(); scheduleRebuild(); })
);
document.getElementById('font').addEventListener('change', () => { saveToStorage(); scheduleRebuild(); });
document.getElementById('textMulti').addEventListener('input', () => { saveToStorage(); scheduleRebuild(); });

document.getElementById('plateShape').addEventListener('change', () => {
  applyShapeUI();
  saveToStorage();
  scheduleRebuild();
});

document.querySelectorAll('input[name="textStyle"]').forEach(radio =>
  radio.addEventListener('change', () => { saveToStorage(); scheduleRebuild(); })
);

function applyModeUI(mode) {
  document.getElementById('fieldTextSingle').style.display   = mode === 'single'   ? '' : 'none';
  document.getElementById('fieldTextMultiple').style.display = mode === 'multiple' ? '' : 'none';
}

// Corner radius only applies to the rounded-rectangle shape — disable it otherwise.
function applyShapeUI() {
  const isRounded = document.getElementById('plateShape').value === 'roundedRect';
  document.getElementById('radius').disabled = !isRounded;
}

document.querySelectorAll('input[name="mode"]').forEach(radio =>
  radio.addEventListener('change', e => {
    applyModeUI(e.target.value);
    saveToStorage();
    scheduleRebuild();
  })
);

// Sync colour pickers ↔ hex text fields
function syncColor(pickerId, hexId) {
  document.getElementById(pickerId).addEventListener('input', e => {
    document.getElementById(hexId).value = e.target.value;
    saveToStorage();
    scheduleRebuild();
  });
  document.getElementById(hexId).addEventListener('input', e => {
    if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
      document.getElementById(pickerId).value = e.target.value;
      saveToStorage();
      scheduleRebuild();
    }
  });
}
syncColor('plateColor', 'plateColorHex');
syncColor('textColor',  'textColorHex');

document.getElementById('btnResetCamera').addEventListener('click', fitCamera);

// ── Settings file save / load ─────────────────────────────────────────────────
document.getElementById('btnSaveSettings').addEventListener('click', () => {
  const name = prompt('Save settings as:', '3dlabel-settings');
  if (name === null) return;
  const filename = (name.trim() || '3dlabel-settings').replace(/\.json$/i, '') + '.json';
  triggerDownload(
    new Blob([JSON.stringify(readSettings(), null, 2)], { type: 'application/json' }),
    filename
  );
});

document.getElementById('btnLoadSettings').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      applySettings(JSON.parse(ev.target.result));
      saveToStorage();
      scheduleRebuild();
    } catch (_) { alert('Invalid settings file.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── Print-orientation transform ───────────────────────────────────────────────
// Three.js is Y-up; slicers (Bambu Studio, PrusaSlicer) are Z-up.
// Without correction the model exports sideways and slicers lay the wrong face
// on the build plate.  This bakes the correct orientation into the geometry:
//   Rx(+90°) maps Three.js Y → slicer Z, then translate so the plate bottom
//   (y = -thickness/2) lands at slicer Z = 0.
function applyPrintTransform(geo, thickness) {
  const R = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const T = new THREE.Matrix4().makeTranslation(0, 0, thickness / 2);
  geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(T, R));
}

// ── Export ops (the THREE-bound leaves injected into buildLabelModel) ──────────
// Kept here so label-model.js stays import-free and Node-testable. bakeForExport
// is the single home of the non-index → translate → print-transform recipe that
// STL and 3MF used to each re-implement.
const exportOps = {
  buildPlate: (s) =>
    createPlateGeometry(s.length, s.width, s.thickness, s.radius, true, s.plateShape),
  buildText: (s, txt, font) =>
    buildTextGeometry(txt, font, s.fontSize, s.raise, s.thickness, true, s.lineSpacing, s.textStyle),
  bakeForExport: (geo, placement, thickness) => {
    const ni = geo.index ? geo.toNonIndexed() : geo;
    if (ni !== geo) geo.dispose();
    ni.applyMatrix4(new THREE.Matrix4().makeTranslation(placement.x, 0, placement.z));
    applyPrintTransform(ni, thickness);
    return ni;
  },
};

// ── Download helper ───────────────────────────────────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── STL export ────────────────────────────────────────────────────────────────
document.getElementById('btnSTL').addEventListener('click', () => {
  const name = prompt('Save STL as:', 'label');
  if (name === null) return;
  const filename = (name.trim() || 'label').replace(/\.stl$/i, '') + '.stl';
  const p = readParams();
  if (!isFontReady(p, loadedFonts)) { alert('Fonts still loading — please try again in a moment.'); return; }

  const font = loadedFonts.get(p.fontUrl);
  const { placements } = layoutLabels(p.texts.length, p.length, p.width, LABEL_GAP);
  const model = buildLabelModel(p, font, placements, exportOps);
  // Geometry is already export-baked (placed + print-transformed) per part.
  const geosToMerge = model.flatMap(l => l.text ? [l.plate, l.text] : [l.plate]);

  const exportGeo = mergeGeometries(geosToMerge);
  geosToMerge.forEach(g => g.dispose());
  if (!exportGeo) { console.error('mergeGeometries returned null'); alert('Export failed.'); return; }

  const tmpScene = new THREE.Scene();
  tmpScene.add(new THREE.Mesh(exportGeo, new THREE.MeshStandardMaterial()));
  tmpScene.updateMatrixWorld(true);

  const stl = new STLExporter().parse(tmpScene, { binary: true });
  triggerDownload(new Blob([stl], { type: 'application/octet-stream' }), filename);
  exportGeo.dispose();
});

// ── 3MF export ────────────────────────────────────────────────────────────────
// Geometry orchestration + side effects only; the deterministic XML/ZIP assembly
// (including the multicolor single-/multi-filament grouping) lives in threemf.js.
function _make3mfBlob(p, multicolor) {
  if (!isFontReady(p, loadedFonts)) { alert('Fonts still loading — please try again in a moment.'); return null; }

  const font = loadedFonts.get(p.fontUrl);
  const { placements } = layoutLabels(p.texts.length, p.length, p.width, LABEL_GAP);
  const model = buildLabelModel(p, font, placements, exportOps);

  const bytes = build3mf({
    labels: model, plateColor: p.plateColor, textColor: p.textColor, multicolor,
  });

  model.forEach(({ plate, text }) => { plate.dispose(); if (text) text.dispose(); });
  return new Blob([bytes], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+zip' });
}

document.getElementById('btn3MFMulti').addEventListener('click', () => {
  const name = prompt('Save 3MF as:', 'label_multicolor');
  if (name === null) return;
  const filename = (name.trim() || 'label_multicolor').replace(/\.3mf$/i, '') + '.3mf';
  const blob = _make3mfBlob(readParams(), true);
  if (blob) triggerDownload(blob, filename);
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Populate font dropdown
  const sel = document.getElementById('font');
  FONT_DEFS.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.url;
    opt.textContent = f.label;
    sel.appendChild(opt);
  });

  // Restore saved values (must happen after options are in the DOM).
  loadFromStorage();
  applyShapeUI();

  // Load all fonts in parallel
  const loader = new FontLoader();
  const loadingEl = document.querySelector('.loading-text');
  let done = 0;

  await Promise.all(FONT_DEFS.map(f =>
    loader.loadAsync(f.url).then(font => {
      loadedFonts.set(f.url, font);
      done++;
      loadingEl.textContent = `Loading fonts (${done}/${FONT_DEFS.length})…`;
    })
  ));

  document.getElementById('loading-overlay').style.display = 'none';

  rebuildScene();
  fitCamera();
}

init();
