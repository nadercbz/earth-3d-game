// Vektorkacheln lesen (Mapbox Vector Tile 2.1, seit 29.10.2026 für den Weltbau): eigene kleine Fassung des Lesers aus
// @mapbox/vector-tile, weil Worker keine Import Maps kennen (dort hängt der Leser an einem nackten Modulnamen). Nur pbf (BSD) wird gebraucht.
// Ergebnis: { schicht: { extent, merkmale: [{ id, typ (1 Punkt, 2 Linie, 3 Fläche), p (Eigenschaften), g: [[[x, y], ...], ...] }] } }
import { PbfReader } from '../node_modules/pbf/index.js';

function wert(pbf) {
  const ende = pbf.readVarint() + pbf.pos; let v = null;
  while (pbf.pos < ende) {
    const tag = pbf.readVarint() >> 3;
    v = tag === 1 ? pbf.readString() : tag === 2 ? pbf.readFloat() : tag === 3 ? pbf.readDouble() : tag === 4 ? pbf.readVarint64() : tag === 5 ? pbf.readVarint() : tag === 6 ? pbf.readSVarint() : tag === 7 ? pbf.readBoolean() : null;
  }
  return v;
}
function geometrie(pbf, ende) {
  const linien = []; let linie = null, cmd = 1, n = 0, x = 0, y = 0;
  while (pbf.pos < ende) {
    if (n <= 0) { const c = pbf.readVarint(); cmd = c & 7; n = c >> 3; if (!n && cmd !== 7) continue; }
    if (cmd === 1) { x += pbf.readSVarint(); y += pbf.readSVarint(); if (linie) linien.push(linie); linie = [[x, y]]; n--; }
    else if (cmd === 2) { x += pbf.readSVarint(); y += pbf.readSVarint(); if (linie) linie.push([x, y]); n--; }
    else if (cmd === 7) { if (linie && linie.length) linie.push([linie[0][0], linie[0][1]]); n = 0; }
    else break;
  }
  if (linie) linien.push(linie);
  return linien;
}
function schicht(pbf, ende, nur) {
  let name = '', extent = 4096; const keys = [], values = [], roh = [];
  while (pbf.pos < ende) {
    const t = pbf.readVarint(), tag = t >> 3;
    if (tag === 1) name = pbf.readString();
    else if (tag === 2) { const l = pbf.readVarint(); roh.push([pbf.pos, pbf.pos + l]); pbf.pos += l; }
    else if (tag === 3) keys.push(pbf.readString());
    else if (tag === 4) values.push(wert(pbf));
    else if (tag === 5) extent = pbf.readVarint();
    else pbf.skip(t);
  }
  if (nur && !nur.has(name)) return null;
  const merkmale = [];
  for (const [a, b] of roh) {
    pbf.pos = a; const f = { id: null, typ: 0, p: {}, g: null };
    while (pbf.pos < b) {
      const t = pbf.readVarint(), tag = t >> 3;
      if (tag === 1) f.id = pbf.readVarint();
      else if (tag === 2) { const e = pbf.readVarint() + pbf.pos; while (pbf.pos < e) { const k = keys[pbf.readVarint()], v = values[pbf.readVarint()]; f.p[k] = v; } }
      else if (tag === 3) f.typ = pbf.readVarint();
      else if (tag === 4) { const e = pbf.readVarint() + pbf.pos; f.g = geometrie(pbf, e); pbf.pos = e; }
      else pbf.skip(t);
    }
    if (f.g) merkmale.push(f);
  }
  return { name, extent, merkmale };
}
// buf: Uint8Array, nur: Set der gewünschten Schichten (oder null für alle)
export function leseKachel(buf, nur = null) {
  const pbf = new PbfReader(buf), out = {};
  while (pbf.pos < pbf.length) {
    const t = pbf.readVarint(), tag = t >> 3;
    if (tag === 3) { const l = pbf.readVarint(), e = pbf.pos + l; const s = schicht(pbf, e, nur); if (s) out[s.name] = s; pbf.pos = e; }
    else pbf.skip(t);
  }
  return out;
}
