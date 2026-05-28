import * as THREE from 'three';
import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
import { FontLoader }          from 'three/addons/loaders/FontLoader.js';
import { TextGeometry }        from 'three/addons/geometries/TextGeometry.js';
import { STLExporter }         from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries }     from 'three/addons/utils/BufferGeometryUtils.js';

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
let plateMesh = null;
let textMesh  = null;
let rebuildTimer = null;

// ── Parameter reader ──────────────────────────────────────────────────────────
function readParams() {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  return {
    length:     clamp(parseFloat(document.getElementById('length').value)    || 100, 1,  500),
    width:      clamp(parseFloat(document.getElementById('width').value)     || 50,  1,  500),
    thickness:  clamp(parseFloat(document.getElementById('thickness').value) || 5,   0.5, 50),
    radius:     clamp(parseFloat(document.getElementById('radius').value)    || 5,   0,   100),
    text:       document.getElementById('text').value,
    fontUrl:    document.getElementById('font').value,
    fontSize:   clamp(parseFloat(document.getElementById('fontSize').value)  || 8,  1, 100),
    raise:      clamp(parseFloat(document.getElementById('raise').value)     || 1.5, 0.1, 20),
    plateColor: document.getElementById('plateColor').value,
    textColor:  document.getElementById('textColor').value,
  };
}

// ── Plate geometry (rounded-rectangle extrusion) ─────────────────────────────
// Uses ExtrudeGeometry so the top/bottom faces stay flat while the vertical
// edges get rounded corners.  Rotation + translation match BoxGeometry's
// default orientation: plate flat in XZ plane, thickness along Y, centered
// at origin.
function createPlateGeometry(length, width, thickness, radius, highDetail) {
  const r  = Math.max(0, Math.min(radius, length / 2 - 0.01, width / 2 - 0.01));
  const hw = length / 2;
  const hh = width  / 2;
  const shape = new THREE.Shape();

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
function buildTextGeometry(text, font, fontSize, raise, thickness, highDetail) {
  const geo = new TextGeometry(text, {
    font,
    size:          fontSize,
    depth:         raise,
    curveSegments: highDetail ? 12 : 5,
    bevelEnabled:  false,
  });

  geo.computeBoundingBox();
  const bb   = geo.boundingBox;
  const tw   = bb.max.x - bb.min.x;
  const tyMid = (bb.min.y + bb.max.y) / 2;  // pre-rotation Y centre → post-rotation -Z centre

  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

  geo.applyMatrix4(new THREE.Matrix4().makeTranslation(
    -(bb.min.x + tw / 2),  // centre on X
    thickness / 2,         // sit on plate top face
    tyMid                  // centre on Z (cancels the -Y offset from rotation)
  ));

  return geo;
}

// ── Scene rebuild ─────────────────────────────────────────────────────────────
function rebuildScene() {
  const p = readParams();

  if (plateMesh) { scene.remove(plateMesh); plateMesh.geometry.dispose(); plateMesh.material.dispose(); plateMesh = null; }
  if (textMesh)  { scene.remove(textMesh);  textMesh.geometry.dispose();  textMesh.material.dispose();  textMesh  = null; }

  // Plate
  plateMesh = new THREE.Mesh(
    createPlateGeometry(p.length, p.width, p.thickness, p.radius, false),
    new THREE.MeshStandardMaterial({ color: p.plateColor, roughness: 0.45, metalness: 0.15 })
  );
  plateMesh.castShadow = plateMesh.receiveShadow = true;
  scene.add(plateMesh);

  // Text
  if (p.text.trim().length > 0) {
    const font = loadedFonts.get(p.fontUrl);
    if (!font) return;

    const tg = buildTextGeometry(p.text, font, p.fontSize, p.raise, p.thickness, false);
    textMesh = new THREE.Mesh(
      tg,
      new THREE.MeshStandardMaterial({ color: p.textColor, roughness: 0.3, metalness: 0.1 })
    );
    textMesh.castShadow = true;
    scene.add(textMesh);
  }
}

// ── Camera fit ────────────────────────────────────────────────────────────────
function fitCamera() {
  const p = readParams();
  const halfL = p.length / 2;
  const halfW = p.width  / 2;
  const halfT = (p.thickness + p.raise) / 2;
  const sphere = new THREE.Box3(
    new THREE.Vector3(-halfL, -halfT, -halfW),
    new THREE.Vector3( halfL,  halfT,  halfW)
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
const PERSISTED_IDS = ['length','width','thickness','radius','text','font','fontSize','raise','plateColor','textColor'];

function saveToStorage() {
  const data = {};
  PERSISTED_IDS.forEach(id => { data[id] = document.getElementById(id).value; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data) return;
    PERSISTED_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && data[id] !== undefined) el.value = data[id];
    });
    // Keep hex text fields in sync with restored colour picker values.
    document.getElementById('plateColorHex').value = document.getElementById('plateColor').value;
    document.getElementById('textColorHex').value  = document.getElementById('textColor').value;
  } catch (_) { /* corrupt storage — ignore */ }
}

['length','width','thickness','radius','text','fontSize','raise'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => { saveToStorage(); scheduleRebuild(); })
);
document.getElementById('font').addEventListener('change', () => { saveToStorage(); scheduleRebuild(); });

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
  const p = readParams();

  // Both inputs must be non-indexed for mergeGeometries
  const plateNI = createPlateGeometry(p.length, p.width, p.thickness, p.radius, true).toNonIndexed();

  let exportGeo;
  if (p.text.trim().length > 0) {
    const font = loadedFonts.get(p.fontUrl);
    if (!font) { alert('Fonts still loading — please try again in a moment.'); return; }

    const textGeo  = buildTextGeometry(p.text, font, p.fontSize, p.raise, p.thickness, true);
    // TextGeometry is non-indexed; guard anyway
    const textNI   = textGeo.index ? textGeo.toNonIndexed() : textGeo;
    exportGeo = mergeGeometries([plateNI, textNI]);
    if (!exportGeo) { console.error('mergeGeometries returned null'); alert('Export failed.'); return; }
    textGeo.dispose();
    plateNI.dispose();
  } else {
    exportGeo = plateNI;
  }

  applyPrintTransform(exportGeo, p.thickness);

  const tmpScene = new THREE.Scene();
  tmpScene.add(new THREE.Mesh(exportGeo, new THREE.MeshStandardMaterial()));
  tmpScene.updateMatrixWorld(true);

  const stl = new STLExporter().parse(tmpScene, { binary: true });
  triggerDownload(new Blob([stl], { type: 'application/octet-stream' }), 'label.stl');
  exportGeo.dispose();
});

// ── 3MF export ────────────────────────────────────────────────────────────────
// Minimal ZIP (STORE, no compression) — avoids external dependency.

const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function _crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = _CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function _concat(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

function _makeZip(files) {
  // files: [ { name: string, data: Uint8Array } ]
  const enc = new TextEncoder();
  const locals = [];
  const cdParts = [];
  let localOffset = 0;

  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const crc = _crc32(data);

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0,  0x04034b50, true); // local sig
    lv.setUint16(4,  20, true);         // version needed
    lv.setUint16(6,  0,  true);         // flags
    lv.setUint16(8,  0,  true);         // STORE
    lv.setUint16(10, 0,  true);         // mod time
    lv.setUint16(12, 0,  true);         // mod date
    lv.setUint32(14, crc,         true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);          // extra len
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0,  0x02014b50, true); // central dir sig
    cv.setUint16(4,  20, true);
    cv.setUint16(6,  20, true);
    cv.setUint16(8,  0,  true);
    cv.setUint16(10, 0,  true);         // STORE
    cv.setUint16(12, 0,  true);
    cv.setUint16(14, 0,  true);
    cv.setUint32(16, crc,         true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    cd.set(nameBytes, 46);
    cdParts.push(cd);

    localOffset += local.length;
  }

  const cdData  = _concat(cdParts);
  const eocd    = new Uint8Array(22);
  const ev      = new DataView(eocd.buffer);
  ev.setUint32(0,  0x06054b50,   true);
  ev.setUint16(4,  0,            true);
  ev.setUint16(6,  0,            true);
  ev.setUint16(8,  files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdData.length, true);
  ev.setUint32(16, localOffset,  true);
  ev.setUint16(20, 0,            true);

  return _concat([...locals, cdData, eocd]);
}

function _buildMeshXML(geometry, objectId) {
  // Deduplicate vertices with 3-decimal precision for compact output.
  const pos = geometry.attributes.position;
  const vMap = new Map();
  const vList = [];
  const tris  = [];

  for (let i = 0; i < pos.count; i += 3) {
    const idx = [];
    for (let j = 0; j < 3; j++) {
      const x = pos.getX(i + j).toFixed(3);
      const y = pos.getY(i + j).toFixed(3);
      const z = pos.getZ(i + j).toFixed(3);
      const k = `${x},${y},${z}`;
      if (!vMap.has(k)) { vMap.set(k, vList.length); vList.push([x, y, z]); }
      idx.push(vMap.get(k));
    }
    tris.push(idx);
  }

  const parts = [`<object id="${objectId}" type="model"><mesh><vertices>`];
  for (const [x, y, z] of vList) parts.push(`<vertex x="${x}" y="${y}" z="${z}"/>`);
  parts.push('</vertices><triangles>');
  for (const [v1, v2, v3] of tris) parts.push(`<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`);
  parts.push('</triangles></mesh></object>');
  return parts.join('');
}

// ── 3MF shared builder ────────────────────────────────────────────────────────
// multicolor=false → plate + text merged as one component (single-filament).
// multicolor=true  → plate and text as separate build items (multi-filament).
function _make3mfBlob(p, multicolor) {
  const plateGeoNI = createPlateGeometry(p.length, p.width, p.thickness, p.radius, true).toNonIndexed();

  let textGeoNI = null;
  const hasText = p.text.trim().length > 0;
  if (hasText) {
    const font = loadedFonts.get(p.fontUrl);
    if (!font) { alert('Fonts still loading — please try again in a moment.'); return null; }
    const tg = buildTextGeometry(p.text, font, p.fontSize, p.raise, p.thickness, true);
    textGeoNI = tg.index ? tg.toNonIndexed() : tg;
  }

  applyPrintTransform(plateGeoNI, p.thickness);
  if (textGeoNI) applyPrintTransform(textGeoNI, p.thickness);

  const matNS = 'xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"';

  // Always embed colors via the materials extension.
  const colorGroups = `
  <m:colorgroup id="10"><m:color color="${p.plateColor}"/></m:colorgroup>
  <m:colorgroup id="11"><m:color color="${p.textColor}"/></m:colorgroup>`;

  const plateMeshXML = _buildMeshXML(plateGeoNI, 1)
    .replace('<object id="1"', '<object id="1" m:colorid="10"');
  const textMeshXML = hasText
    ? _buildMeshXML(textGeoNI, 2).replace('<object id="2"', '<object id="2" m:colorid="11"')
    : '';

  let resourcesExtra = '';
  let buildItems = '';

  if (multicolor) {
    // Two separate build items — each gets its own filament in the slicer.
    buildItems = hasText
      ? '<item objectid="1"/><item objectid="2"/>'
      : '<item objectid="1"/>';
  } else {
    // Single component wrapping both — one printable body.
    if (hasText) {
      resourcesExtra = `
  <object id="3" type="model"><components>
    <component objectid="1"/>
    <component objectid="2"/>
  </components></object>`;
      buildItems = '<item objectid="3"/>';
    } else {
      buildItems = '<item objectid="1"/>';
    }
  }

  const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  ${matNS}>
<resources>
  ${colorGroups}
  ${plateMeshXML}
  ${textMeshXML}
  ${resourcesExtra}
</resources>
<build>${buildItems}</build>
</model>`;

  const enc = new TextEncoder();
  const zip = _makeZip([
    { name: '[Content_Types].xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`) },
    { name: '_rels/.rels', data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Target="/3D/3dmodel.model"
    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`) },
    { name: '3D/3dmodel.model', data: enc.encode(modelXML) },
  ]);

  plateGeoNI.dispose();
  if (textGeoNI) textGeoNI.dispose();

  return new Blob([zip], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+zip' });
}

document.getElementById('btn3MFMulti').addEventListener('click', () => {
  const blob = _make3mfBlob(readParams(), true);
  if (blob) triggerDownload(blob, 'label_multicolor.3mf');
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
