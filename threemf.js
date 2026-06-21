// ── 3MF document ────────────────────────────────────────────────────────────
// The whole 3MF format concern: turn the per-label baked geometries (from
// buildLabelModel) plus plate/text colors into the bytes of a .3mf package.
// Pure and import-free — no THREE, no DOM. Geometry is touched only through the
// read-only `position` accessor (count / getX / getY / getZ), so tests pass tiny
// fake geometries and never need THREE.
//
// build3mf(...) is the interface the app uses; buildModelXML(...) is an internal
// seam exported so tests can assert the (intricate) document assembly as a
// string instead of decoding ZIP bytes.

// ── Minimal STORE (no-compression) ZIP writer ─────────────────────────────────
const _CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

export function _crc32(data) {
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

export function _makeZip(files) {
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

// ── Mesh → 3MF <object> XML ───────────────────────────────────────────────────
export function _buildMeshXML(geometry, objectId) {
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

// ── 3MF model document ────────────────────────────────────────────────────────
// labels: [ { plate, text|null }, … ] — each value is a geometry with a position
//   attribute (real BufferGeometry in the app, a fake in tests).
// multicolor=false → plate + text nested in one <component> object (single-filament).
// multicolor=true  → plate and text as separate build items (multi-filament).
export function buildModelXML({ labels, plateColor, textColor, multicolor }) {
  const matNS = 'xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"';
  const colorGroups = `
  <m:colorgroup id="1"><m:color color="${plateColor}"/></m:colorgroup>
  <m:colorgroup id="2"><m:color color="${textColor}"/></m:colorgroup>`;

  let meshObjectsXML = '';
  let componentObjectsXML = '';
  let buildItems = '';
  let nextId = 1;

  for (const { plate, text } of labels) {
    const plateId = nextId++;
    meshObjectsXML += _buildMeshXML(plate, plateId)
      .replace(`<object id="${plateId}"`, `<object id="${plateId}" m:colorid="1"`);

    let textId = null;
    if (text) {
      textId = nextId++;
      meshObjectsXML += _buildMeshXML(text, textId)
        .replace(`<object id="${textId}"`, `<object id="${textId}" m:colorid="2"`);
    }

    if (multicolor) {
      buildItems += `<item objectid="${plateId}"/>`;
      if (textId !== null) buildItems += `<item objectid="${textId}"/>`;
    } else if (textId !== null) {
      const compId = nextId++;
      componentObjectsXML += `<object id="${compId}" type="model"><components><component objectid="${plateId}"/><component objectid="${textId}"/></components></object>`;
      buildItems += `<item objectid="${compId}"/>`;
    } else {
      buildItems += `<item objectid="${plateId}"/>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  ${matNS}>
<resources>
  ${colorGroups}
  ${meshObjectsXML}
  ${componentObjectsXML}
</resources>
<build>${buildItems}</build>
</model>`;
}

// ── 3MF package (OPC zip) ─────────────────────────────────────────────────────
export function build3mf({ labels, plateColor, textColor, multicolor }) {
  const modelXML = buildModelXML({ labels, plateColor, textColor, multicolor });
  const enc = new TextEncoder();
  return _makeZip([
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
}
