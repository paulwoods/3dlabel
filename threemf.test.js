import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build3mf, buildModelXML, _crc32, _buildMeshXML } from './threemf.js';

// Minimal fake geometry: one triangle, exposing only the read-only position
// accessor that _buildMeshXML uses (count / getX / getY / getZ). No THREE.
function fakeTriangle(offset = 0) {
  const v = [0, 0, 0, 1, 0, 0, 0, 1, 0].map((n, i) => (i % 3 === 0 ? n + offset : n));
  return {
    attributes: {
      position: {
        count: 3,
        getX: (i) => v[i * 3],
        getY: (i) => v[i * 3 + 1],
        getZ: (i) => v[i * 3 + 2],
      },
    },
  };
}

const colors = { plateColor: '#2255aa', textColor: '#f5c842' };

test('_crc32 — known vector', () => {
  const data = new TextEncoder().encode('123456789');
  assert.equal(_crc32(data), 0xCBF43926);
});

test('_buildMeshXML — emits one object with 3 vertices and 1 triangle', () => {
  const xml = _buildMeshXML(fakeTriangle(), 7);
  assert.match(xml, /<object id="7" type="model">/);
  assert.equal((xml.match(/<vertex /g) || []).length, 3);
  assert.equal((xml.match(/<triangle /g) || []).length, 1);
});

test('multicolor=true → separate items, plate colorid=1, text colorid=2, no components', () => {
  const xml = buildModelXML({
    labels: [{ plate: fakeTriangle(), text: fakeTriangle(5) }],
    ...colors, multicolor: true,
  });
  assert.match(xml, /<object id="1" m:colorid="1"/);
  assert.match(xml, /<object id="2" m:colorid="2"/);
  assert.equal((xml.match(/<item objectid=/g) || []).length, 2);
  assert.doesNotMatch(xml, /<components>/);
});

test('multicolor=false → plate+text nested in one component, single item', () => {
  const xml = buildModelXML({
    labels: [{ plate: fakeTriangle(), text: fakeTriangle(5) }],
    ...colors, multicolor: false,
  });
  assert.match(xml, /<components><component objectid="1"\/><component objectid="2"\/><\/components>/);
  assert.equal((xml.match(/<item objectid=/g) || []).length, 1);
});

test('text-less label → single plate item, no text object', () => {
  const xml = buildModelXML({
    labels: [{ plate: fakeTriangle(), text: null }],
    ...colors, multicolor: true,
  });
  assert.equal((xml.match(/<item objectid=/g) || []).length, 1);
  assert.doesNotMatch(xml, /m:colorid="2"/);
});

test('build3mf → PK-headed ZIP containing the three OPC parts', () => {
  const bytes = build3mf({
    labels: [{ plate: fakeTriangle(), text: fakeTriangle(5) }],
    ...colors, multicolor: true,
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('[Content_Types].xml'));
  assert.ok(text.includes('_rels/.rels'));
  assert.ok(text.includes('3D/3dmodel.model'));
});
