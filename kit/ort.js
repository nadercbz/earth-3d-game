// Echter Ort aus OpenStreetMap (Daten aus tools/ort_bauen.py, erster Test 28.10.2026: Potsdamer Platz, 1 km²).
// Boden mit Fahrbahn, Gehwegblöcken mit Bordstein, Plätzen, Grün, Pfaden, Radwegen und Wasser, dazu Markierungen, Überwege,
// Ampeln, Laternen, Bäume (nah volle Bäume, fern einfache) und Stelen. Gebäude in Kacheln von 125 m: fern Kisten mit
// Fassaden aus dem Shader (fernMaterial), nah der Gebäude Generator, Haus für Haus nachgebaut, solange die Kamera nah ist.
import { Militaer } from './militaer.js';
import { osmTeilBauen } from './osmteile_bau.js';
import { fotoMaterial } from './ortfoto.js';
import { Gras } from './gras.js';
import { Bahn } from './bahn.js';
import { Flughafen } from './flughafen.js';
import { Hafen, Baukraene } from './hafen.js';
import { Wildtiere } from './wildtiere.js';
import { Rummel } from './rummel.js';
import { Mauer, mauerNah } from './mauer.js';
import { LAUB, saisonFarbe, istKahl, monatJetzt } from './waldarten.js';
import { strassenbild } from './strassenbild.js';
import { fernTon } from './regionen.js';
import './bauwerke.js';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBuilding, echteDeckung } from './buildings.js';
import { orient, area, edgeNormal, inside, rng } from './geo.js';
import { fernMaterial } from './city.js';
import { Freizeit } from './freizeit.js';
import { Werbung } from './werbung.js';
import { Kleintiere } from './kleintiere.js';
import { Waldleben } from './waldleben.js';
import { Wildnis } from './wildnis.js';
import { BrueckenFeld, brueckenBauen } from './bruecke.js';
import { stuetzenRegel } from './stuetzen.js';
import { TunnelFeld, tunnelBauen } from './tunnel.js';
import { eingaengeBauen } from './ubahn_eingang.js';
import { steildach } from './regionen.js';
import { texMat, NACHT } from './materials.js';
import { BAEUME, vorlage, blattMitInstanzen } from './trees.js';
import { eingangKante } from './interior.js';
import { einfrieren } from './statisch.js';
import { fleckMaterial, lichtFleck } from './nachtlicht.js';

export const BORD = 0.12;          // Gehweg über der Fahrbahn
const KACHEL = 125, UNTEN = -0.3, WASSER = -0.45;

export async function ladeOrt(name) {
  const r = await fetch(new URL(`../assets/orte/${name}.json`, import.meta.url));
  if (!r.ok) throw new Error(`Ort ${name} fehlt`);
  return r.json();
}

// ---------- Zuordnung: OSM Merkmale -> Gebäudetyp des Generators und Fassade für die Ferne ----------
function farbe(f) {
  if (!f) return null;
  const namen = { white: '#f0f0f0', beige: '#d8c8a8', ivory: '#eee8d8', cream: '#eadfc6', grey: '#909090', gray: '#909090', lightgrey: '#c0c0c0', lightgray: '#c0c0c0',
    silver: '#c0c0c0', darkgrey: '#505050', darkgray: '#505050', black: '#202020', brown: '#6b4a32', red: '#9a3a2a', maroon: '#6a2a20', yellow: '#d8c060', sand: '#c8b088' };
  const hex = (namen[f.toLowerCase()] || f).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return { hell: 0.2126 * r + 0.7152 * g + 0.0722 * b, warm: r - b };
}

export function zuordnung(g) {
  if (g.typ) return { typ: g.typ, variant: g.variant, fern: g.fern ?? 2 };   // Orte aus Kacheln (kit/ortbau.js): Typ kommt aus der Bauweise der Region
  const h = g.h - (g.m || 0), b = g.b || 'yes', mat = g.mat, f = farbe(g.farbe), hell = f ? f.hell > 0.5 : null;
  if (b === 'denkmal') return { schlicht: 'denkmal', fern: 5 };
  if (b === 'roof' || b === 'carport') return { schlicht: 'dach', fern: 5 };
  if (h < 4 || ['shed', 'kiosk', 'toilets', 'garage', 'garages', 'hut', 'service', 'transformer_tower'].includes(b)) return { schlicht: 'klein', fern: 5 };
  const wohnen = ['apartments', 'residential', 'house', 'dormitory', 'terrace'].includes(b);
  if (g.jahr && g.jahr < 1945) return h > 26 ? { typ: 'lochfassade', fern: 2 } : { typ: 'altbau', fern: 2 };
  if (mat === 'brick') return h > 20 ? { typ: 'lochfassade', variant: 'ziegel', fern: 3 } : { typ: 'ziegel', fern: 3 };   // Backstein: Lochfassade in Ziegel (Kollhoff Tower)
  if (mat === 'glass') return h > 30 ? { typ: 'glasturm', variant: hell ? 'kante' : undefined, fern: 1 } : { typ: 'band', variant: 'grau', fern: 4 };
  if (mat === 'metal') return hell === false || /gold|bronze|brown|copper/i.test(g.farbe || '') ? { typ: 'kupfer', fern: 3 } : { typ: 'band', variant: 'weiss', fern: 4 };
  if (mat === 'sandstone' || mat === 'stone' || (f && hell && f.warm > 0.12)) return { typ: 'lochfassade', variant: 'stein', fern: 2 };
  if (wohnen) return h > 35 ? { typ: 'wohnturm', fern: 2 } : { typ: 'lochfassade', fern: 2 };
  if (h > 45) return hell === false ? { typ: 'glasturm', fern: 1 } : { typ: 'raster', fern: 0 };
  return hell === false ? { typ: 'band', variant: 'grau', fern: 4 } : { typ: 'band', variant: 'weiss', fern: 4 };
}

// ---------- Geometrie Helfer ----------
function dreieckeOben(pts2, y, pos, uv, idx) {   // Fläche mit Löchern auf Höhe y, Normale nach oben, UV in Metern
  const [aussen, ...loecher] = pts2;
  const k = aussen.map(([x, z]) => new THREE.Vector2(x, z)), h = loecher.map(l => l.map(([x, z]) => new THREE.Vector2(x, z)));
  const tris = THREE.ShapeUtils.triangulateShape(k, h), alle = [...k, ...h.flat()], base = pos.length / 3;
  for (const v of alle) { pos.push(v.x, y, v.y); uv.push(v.x, -v.y); }
  for (const [a, b, c] of tris) {
    const A = alle[a], B = alle[b], C = alle[c], ny = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y);
    if (ny >= 0) idx.push(base + a, base + b, base + c); else idx.push(base + a, base + c, base + b);
  }
}
function flaeche(polys, y) {
  const pos = [], uv = [], idx = [];
  for (const p of polys) if (p[0].length >= 3) dreieckeOben(p, y, pos, uv, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// senkrechtes Rechteck an der Kante a-b von y0 bis y1, Normale n
function wand(pos, nor, uv, a, b, y0, y1, n) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const P = [[a[0], y0, a[1], 0, y0], [b[0], y0, b[1], L, y0], [b[0], y1, b[1], L, y1], [a[0], y1, a[1], 0, y1]];
  const e1 = [b[0] - a[0], 0, b[1] - a[1]], e2 = [0, y1 - y0, 0], cx = e1[1] * e2[2] - e1[2] * e2[1], cz = e1[0] * e2[1] - e1[1] * e2[0];
  const order = cx * n[0] + cz * n[1] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const i of order) { pos.push(P[i][0], P[i][1], P[i][2]); nor.push(n[0], 0, n[1]); uv.push(P[i][3], P[i][4]); }
}
function geoAus(pos, nor, uv, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const k in extra || {}) g.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], 1));
  return g;
}
function mitVersatz(m, f) { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = f; return m; }

// Gelände (Orte aus Kacheln, kit/ortbau.js): Höhenraster { x0, z0, s, nx, nz, h } relativ zur Mitte, bilinear. Ohne Raster flach.
export function gelaendeFunktion(g) {
  if (!g || !g.h || !g.nx) return () => 0;
  const { x0, z0, s, nx, nz, h } = g;
  return (x, z) => {
    const fx = (x - x0) / s, fz = (z - z0) / s, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j)), o = j * nx + i;
    return (h[o] * (1 - tx) + h[o + 1] * tx) * (1 - tz) + (h[o + nx] * (1 - tx) + h[o + nx + 1] * tx) * tz;
  };
}
// Fläche aufs Gelände legen: Dreiecke an der längsten Kante teilen, bis das Gelände zwischen den Ecken höchstens fehler Meter von der
// Ebene abweicht (geprüft an Kantenmitte und Schwerpunkt) oder keine Kante länger als minL ist, nie länger als maxL. Dann y += H(x, z).
// Seit 29.10.2026 nach Fehler statt fest alle 12 m: am flachen Potsdamer Platz 177.000 statt 30.000 Dreiecke für die Gehwege.
function drapiere(geo, H, maxL = 40, minL = 6, fehler = 0.03) {
  const P = geo.attributes.position, I = geo.index ? geo.index.array : null, n = I ? I.length : P.count, out = [], m2 = maxL * maxL, n2 = minL * minL;
  const teile = (a, b, c, tiefe) => {
    const ab = (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2, bc = (b[0] - c[0]) ** 2 + (b[2] - c[2]) ** 2, ca = (c[0] - a[0]) ** 2 + (c[2] - a[2]) ** 2, mx = Math.max(ab, bc, ca);
    if (mx <= n2 || tiefe > 16) { out.push(a, b, c); return; }
    if (mx <= m2) {
      const ha = H(a[0], a[2]), hb = H(b[0], b[2]), hc = H(c[0], c[2]);
      const [p, q, hp, hq] = mx === ab ? [a, b, ha, hb] : mx === bc ? [b, c, hb, hc] : [c, a, hc, ha];
      const eKante = Math.abs(H((p[0] + q[0]) / 2, (p[2] + q[2]) / 2) - (hp + hq) / 2), eMitte = Math.abs(H((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3) - (ha + hb + hc) / 3);
      if (eKante <= fehler && eMitte <= fehler) { out.push(a, b, c); return; }
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    if (mx === ab) { const m = mid(a, b); teile(a, m, c, tiefe + 1); teile(m, b, c, tiefe + 1); }
    else if (mx === bc) { const m = mid(b, c); teile(a, b, m, tiefe + 1); teile(a, m, c, tiefe + 1); }
    else { const m = mid(c, a); teile(a, b, m, tiefe + 1); teile(m, b, c, tiefe + 1); }
  };
  for (let k = 0; k < n; k += 3) { const v = j => { const i = I ? I[k + j] : k + j; return [P.getX(i), P.getY(i), P.getZ(i)]; }; teile(v(0), v(1), v(2), 0); }
  const pos = new Float32Array(out.length * 3), uv = new Float32Array(out.length * 2);
  out.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1] + H(p[0], p[2]); pos[i * 3 + 2] = p[2]; uv[i * 2] = p[0]; uv[i * 2 + 1] = -p[2]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // Glatte Normalen aus dem Gelände (06.11.2026): Flächennormalen zeigten am Ufer und an Hängen jede Dreieckskante als Facette. Auf ebenem Grund einfach nach oben, das spart die Abfragen
  { const nor = new Float32Array(pos.length), C = new Map(), e = 5, nv = (x, z) => { const k = Math.round(x * 4) * 1000003 + Math.round(z * 4); let q = C.get(k); if (!q) { const dx = (H(x + e, z) - H(x - e, z)) / (2 * e), dz = (H(x, z + e) - H(x, z - e)) / (2 * e), l = Math.hypot(dx, 1, dz); q = [-dx / l, 1 / l, -dz / l]; C.set(k, q); } return q; };
    for (let t = 0; t < out.length; t += 3) { const a = t * 3, ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2], fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx, fl = Math.hypot(fx, fy, fz) || 1, eben = Math.abs(fy) / fl > 0.9996; for (let j = 0; j < 3; j++) { const o = a + j * 3; if (eben) { nor[o + 1] = 1; } else { const q = nv(pos[o], pos[o + 2]); nor[o] = q[0]; nor[o + 1] = q[1]; nor[o + 2] = q[2]; } } }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); }
  return g;
}
const hebe = (arr, H) => { for (let i = 0; i < arr.length; i += 3) arr[i + 1] += H(arr[i], arr[i + 2]); return arr; };

// Echtes Dach in der Fernsicht (Wunsch Nr. 82, 08.11.2026, Nader: "die Gebäude ändern sich dann auch vom Stil"): Häuser mit Kataster Dach bekommen
// in der Kiste dieselben Dachflächen wie nah (kit/buildings.js echtesDach) und Wände bis unter das Dach, die Höhe kommt je Kantenstück aus der
// Dachfläche darüber (so sind die Giebel zu). Vorher standen dort flache graue Kisten, beim Herankommen sprang jedes Haus auf Steildach.
// Flächen: [x, y, z, ...] mit y über dem Hausboden (kit/lod2.js). tDach: Typ mit Steildach Kennung (+10, Shader kit/city.js), flache Flächen ohne
function echtesFernDach(pts, y0, basis, traufeY, flaechen, pos, nor, typ, tWand, tDach) {
  const F = [];
  for (const a of flaechen) {
    const v = []; for (let i = 0; i + 2 < a.length; i += 3) v.push([a[i], basis + a[i + 1], a[i + 2]]);
    if (v.length < 3) continue;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < v.length; i++) { const p = v[i], q = v[(i + 1) % v.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
    const l = Math.hypot(nx, ny, nz); if (l < 1e-8 || Math.abs(ny) / l < 0.02) continue;   // senkrecht: keine Dachfläche
    nx /= l; ny /= l; nz /= l; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of v) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2]; }
    F.push({ v, nx, ny, nz, box: [x0, x1, z0, z1] });
  }
  if (!F.length) return false;
  const hoehe = (f, x, z) => f.v[0][1] - (f.nx * (x - f.v[0][0]) + f.nz * (z - f.v[0][2])) / f.ny;
  const drin = (f, x, z) => { if (x < f.box[0] || x > f.box[1] || z < f.box[2] || z > f.box[3]) return false; let c = false; const v = f.v; for (let i = 0, j = v.length - 1; i < v.length; j = i++) if ((v[i][2] > z) !== (v[j][2] > z) && x < (v[j][0] - v[i][0]) * (z - v[i][2]) / (v[j][2] - v[i][2]) + v[i][0]) c = !c; return c; };
  const dachY = (x, z) => { let y = null; for (const f of F) if (drin(f, x, z)) { const h = hoehe(f, x, z); if (y === null || h > y) y = h; } return y; };
  for (const f of F) {   // Dachflächen, Umlauf mit der Normale nach oben
    const t = f.ny > 0.975 ? tWand : tDach;   // fast flach: Dachpappe wie nah (key 'dach'), sonst Deckung
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(f.v.map(p => new THREE.Vector2(p[0], p[2])), [])) {
      let A = f.v[a], B = f.v[b], C = f.v[c];
      if ((B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]) < 0) { const q = B; B = C; C = q; }
      pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); for (let k = 0; k < 3; k++) { nor.push(f.nx, f.ny, f.nz); typ.push(t); }
    }
  }
  for (let i = 0; i < pts.length; i++) {   // Wände: je Kante Stücke bis 3 m, oben die Dachhöhe knapp innen über der Kante, sonst die Traufe
    const a = pts[i], b = pts[(i + 1) % pts.length], n = edgeNormal(a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
    const m = Math.max(1, Math.ceil(L / 3)), oben = [];
    for (let k = 0; k <= m; k++) { const x = a[0] + (b[0] - a[0]) * k / m - n[0] * 0.2, z = a[1] + (b[1] - a[1]) * k / m - n[1] * 0.2; oben.push(Math.max(y0 + 0.5, dachY(x, z) ?? traufeY)); }
    for (let k = 0; k < m; k++) {
      const ax = a[0] + (b[0] - a[0]) * k / m, az = a[1] + (b[1] - a[1]) * k / m, bx = a[0] + (b[0] - a[0]) * (k + 1) / m, bz = a[1] + (b[1] - a[1]) * (k + 1) / m;
      const P = [[ax, y0, az], [bx, y0, bz], [bx, oben[k + 1], bz], [ax, oben[k], az]];
      const crossX = -(bz - az), crossZ = bx - ax;   // Normale der Fläche (a nach b, dann hoch) zeigt nach (-e1z, e1x), wie wand()
      const order = crossX * n[0] + crossZ * n[1] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const j of order) { pos.push(P[j][0], P[j][1], P[j][2]); nor.push(n[0], 0, n[1]); typ.push(tWand); }
    }
  }
  return true;
}

// Kisten mit Fassade aus dem Shader: Wände plus Dach je Grundriss, Typ als Attribut
function fernGeo(liste, regKey = null) {
  const pos = [], nor = [], typ = [];
  for (const { pts, y0, y1, t, dach = null } of liste) {
    const n0 = pos.length, t0 = typ.length, zufall = (Math.abs(pts[0][0] * 12.9898 + pts[0][1] * 78.233) * 43.7585) % 1;
    // Nachkommastellen: Zufall je Haus für den Shader. Mit echtem Dach legt er die Deckung fest wie nah (Shader: unter 0,55 Ziegel, über 0,8 Anthrazit)
    const hausZ = 0.45 * (dach ? (dach.deckung === 'dachZiegel' ? 0.08 + 0.42 * zufall : 0.82 + 0.16 * zufall) : zufall);
    if (dach && echtesFernDach(pts, y0, dach.basis, dach.traufeY, dach.flaechen, pos, nor, typ, t, t + 10)) { for (let k = t0; k < typ.length; k++) typ[k] += hausZ; continue; }
    // Kleine Wohnhäuser auch aus der Luft mit Steildach wie die Kisten ringsum (sonst Flachdächer mitten in den Alpen)
    let traufe = null; if (regKey && y1 - y0 <= 16.5 && pts.length <= 13) { let fl = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) fl += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); fl = Math.abs(fl) / 2; if (fl >= 40 && fl <= 450) { let s = (hausZ * 1e6) >>> 0 || 1; traufe = steildach([...pts, pts[0]], y1, regKey, t, () => { s = Math.imul(s, 48271) >>> 0; return s / 4294967296; }, pos, nor, typ); } }
    const yW = traufe ?? y1;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; wand(pos, nor, [], a, b, y0, yW, edgeNormal(a, b)); }
    if (traufe === null) { const p2 = [], u2 = [], i2 = []; dreieckeOben([pts], y1, p2, u2, i2); for (const k of i2) { pos.push(p2[k * 3], p2[k * 3 + 1], p2[k * 3 + 2]); nor.push(0, 1, 0); } }
    while (typ.length < pos.length / 3) typ.push(t);
    for (let k = t0; k < typ.length; k++) typ[k] += hausZ;
  }
  return geoAus(pos, nor, null, { aTyp: typ });
}

// je Material eine Geometrie (wie vereine in app.js), Glas und Kleinteile ohne Schatten
// Häuser zu wenigen Meshes je Material. In Schritten nutzbar (03.11.2026): zusammenSammeln je Haus, zusammenMesh je Material, zusammenTueren am
// Ende. Vorher geschah alles in einem Bild, wenn ein Viertel fertig war (gemessen bis 85 ms beim Fahren)
// Materialien, die sich nur in der Farbe unterscheiden, zu einem mit Farbe je Punkt zusammenlegen (06.11.2026, Karte Weniger Zeichenaufrufe): in Paris waren das 40 Prozent aller Aufrufe der Häuser
const _TINT = new Map(), _FN = new Map();
function tintVon(m) {
  if (!m.isMeshStandardMaterial || m.transparent || m.alphaTest > 0 || m.vertexColors || m.emissiveMap || m.alphaMap || m.lightMap || m.aoMap || m.displacementMap || m.userData?.fest) return null; if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0) return null;
  const eigen = m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile; if (eigen && !m.userData?.staerke) return null;
  const k = [m.side, m.roughness.toFixed(2), m.metalness.toFixed(2), (m.envMapIntensity ?? 1).toFixed(2), m.flatShading ? 1 : 0, m.polygonOffset ? m.polygonOffsetFactor : '', m.map?.uuid || '', m.normalMap?.uuid || '', m.roughnessMap?.uuid || '', m.normalScale?.x?.toFixed(2) || '', m.userData?.staerke?.value ?? ''].join('|'); let t = _TINT.get(k);
  if (!t) { t = m.clone(); t.color.set(0xffffff); t.vertexColors = true; t.name = 'farbe je punkt'; if (eigen) { t.onBeforeCompile = m.onBeforeCompile; t.customProgramCacheKey = m.customProgramCacheKey; t.userData.staerke = m.userData.staerke; } _TINT.set(k, t); }
  return t;
}
// fest (Zwischenstufe): Map Hauskennung -> Teile des Türblatts im verschmolzenen Mesh { zm (Material), start (Ecke), n }. kit/interior.js blendet das
// feste Blatt am aktiven Haus aus und setzt ein bewegliches ein (Ort.festeTuer, Nr. 96): so geht die Haustür auch auf dem Handy auf
function zusammenSammeln(h, jeMat, blaetter, tueren, fest = null) {
  h.updateMatrixWorld(true);
  const t = tueren ? h.getObjectByName('tuerblatt') : null;
  const t0 = !t && fest ? h.getObjectByName('tuerblatt') : null;
  if (t) { t.userData.id = h.userData.id; blaetter.push(t); }
  h.traverse(o => {
    if (!o.isMesh) return;
    if (t) { let p = o; while (p && p !== h) { if (p === t) return; p = p.parent; } }   // Haustür bleibt ein eigenes Objekt (dreht sich, kit/interior.js)
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const g2 = geo.index ? geo.toNonIndexed() : geo, ti = tintVon(o.material), zm = ti || o.material; if (ti) { const c = o.material.color, n = g2.attributes.position.count, F = new Float32Array(n * 3); for (let i = 0; i < n; i++) { F[i * 3] = c.r; F[i * 3 + 1] = c.g; F[i * 3 + 2] = c.b; } g2.setAttribute('color', new THREE.BufferAttribute(F, 3)); }
    if (!jeMat.has(zm)) jeMat.set(zm, []);
    const liste = jeMat.get(zm);
    if (t0 && h.userData.id) { let q = o; while (q && q !== h && q !== t0) q = q.parent; if (q === t0) { let start = 0; for (const x of liste) start += x.attributes.position.count; (fest.get(h.userData.id) || fest.set(h.userData.id, []).get(h.userData.id)).push({ zm, start, n: g2.attributes.position.count }); } }
    liste.push(g2);
  });
}
function zusammenMesh(mat, geos, waende) {
  const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
  m.castShadow = !!waende && (waende.has(mat) || !!mat.userData?.wand); m.receiveShadow = true;   // nur Wände werfen Schatten, wie in der Stadt (Handy: keine)
  geos.forEach(x => x.dispose());
  return m;
}
function zusammenTueren(g, blaetter, tueren) {
  g.userData.tueren = [];
  for (const t of blaetter) { const M = t.matrixWorld.clone(); g.add(t); M.decompose(t.position, t.quaternion, t.scale); t.userData.beweglich = true; tueren.set(t.userData.id, t); g.userData.tueren.push(t.userData.id); }
}
function zusammen(gruppen, waende, tueren = null) {
  const jeMat = new Map(), blaetter = [];
  for (const h of gruppen) zusammenSammeln(h, jeMat, blaetter, tueren);
  const g = new THREE.Group();
  for (const [mat, geos] of jeMat) g.add(zusammenMesh(mat, geos, waende));
  zusammenTueren(g, blaetter, tueren);
  return g;
}

// einfacher Baum für die Ferne: Stamm und Krone, Höhe 1, Farben als Vertexfarben
function fernBaum(nadel) {
  const stamm = new THREE.CylinderGeometry(0.025, 0.04, 0.4, 5); stamm.translate(0, 0.2, 0);
  // Krone mit 20 Flächen, aber weich schattiert (gemeinsame Punkte), damit sie aus der Ferne rund wirkt
  let krone = nadel ? new THREE.ConeGeometry(0.2, 0.75, 7) : new THREE.IcosahedronGeometry(0.3, 0);
  if (!nadel) { krone.deleteAttribute('uv'); krone = mergeVertices(krone); krone.scale(1, 1.1, 1); }
  krone.computeVertexNormals(); krone.translate(0, nadel ? 0.6 : 0.64, 0);
  const farbig = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  stamm.deleteAttribute('uv'); krone.deleteAttribute('uv');
  const g = mergeGeometries([farbig(stamm, 0x4a3b2c), farbig(krone, nadel ? 0x2f4632 : 0x48603a)]);
  return g;
}

// Impostor: der volle EZ-Tree wird einmal von der Seite in ein Bild gerendert (nur Umgebungslicht, also seine echte Farbe),
// in der Ferne stehen zwei gekreuzte Flächen mit diesem Bild. Sieht aus wie der Baum, kostet 4 Dreiecke.
const IMPOSTOR = new Map();   // je Baumart einmal gerendert (seit 29.10.2026: jeder neue Ort kostete sonst rund 100 ms)
// Baumbild aus zwei Ansichten: seitlich und von oben (05.11.2026). Zwei senkrechte Flächen und eine waagrechte auf Kronenhöhe, 6 Dreiecke. Von oben sieht man so eine volle Krone statt eines Kreuzes.
// Normalen zeigen nach oben und außen: das Licht fällt wie auf eine Krone, nicht wie auf ein Brett, und von hinten gleich
export function impostorPatch(sh) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;').replace('#include <opaque_fragment>', '{ float blL = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)); outgoingLight = mix(vec3(blL), outgoingLight, 0.72) * vec3(1.04, 0.98, 0.94); }\n#include <opaque_fragment>');
  // Blickwinkel: von der Seite verschwindet die waagrechte Fläche (sonst dunkle Striche), von oben die senkrechten
  sh.vertexShader = 'attribute float aOben;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    { mat4 _m = modelMatrix; 
      #ifdef USE_INSTANCING
      _m = modelMatrix * instanceMatrix;
      #endif
      vec3 _w = (_m * vec4(position, 1.0)).xyz, _u = normalize((_m * vec4(0.0, 1.0, 0.0, 0.0)).xyz); float _s = abs(dot(normalize(cameraPosition - _w), _u));
      if (aOben > 0.5) transformed.xz *= smoothstep(0.26, 0.5, _s); else transformed.xz *= 1.0 - smoothstep(0.86, 0.98, _s); }`);
}
function impostorBaum(renderer, v, n, art = null, kahl = false) {
  const fertig = art && IMPOSTOR.get(art);
  if (fertig) { const im = new THREE.InstancedMesh(fertig.geo, fertig.mat, n); im.userData.impostor = fertig.hoehe; im.userData.geteilt = true; return im; }
  const box = new THREE.Box3().setFromObject(v.tree), gr = box.getSize(new THREE.Vector3());
  const breite = Math.max(gr.x, gr.z), hoehe = gr.y, B = MOBIL_IMP ? 256 : 384;
  const rt = new THREE.WebGLRenderTarget(B * 2, B, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, samples: 0 });
  const szene = new THREE.Scene();
  szene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.85), new THREE.DirectionalLight(0xfff4e0, 1.2).translateX(3).translateY(6).translateZ(8));
  // Stamm im Bild dunkler: das Bild kennt nur das helle Umgebungslicht, nahe Stämme stehen im Schatten der Krone (Stämme in der Ferne waren sonst cremefarben)
  { const am = v.tree.branchesMesh.material.clone(); am.onBeforeCompile = () => {}; am.customProgramCacheKey = () => 'rindebild'; if (am.color) am.color.multiplyScalar(kahl ? 0.75 : 0.3); szene.add(new THREE.Mesh(v.tree.branchesMesh.geometry, am)); if (!kahl) szene.add(new THREE.Mesh(v.tree.leavesMesh.geometry, v.tree.leavesMesh.material)); }
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const cam = new THREE.OrthographicCamera(-breite / 2, breite / 2, hoehe, 0, -200, 200); cam.position.set(cx, box.min.y, 50); cam.lookAt(cx, box.min.y, 0);
  const oben = new THREE.OrthographicCamera(-breite / 2, breite / 2, breite / 2, -breite / 2, -200, 400); oben.position.set(cx, box.max.y + 20, cz); oben.up.set(0, 0, -1); oben.lookAt(cx, box.min.y, cz);
  const malen = () => {
  const alt = renderer.getRenderTarget(), farbe = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha(), schere = renderer.getScissorTest();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.setScissorTest(true);
  rt.viewport.set(0, 0, B, B); rt.scissor.set(0, 0, B, B); renderer.setRenderTarget(rt); renderer.render(szene, cam);
  rt.viewport.set(B, 0, B, B); rt.scissor.set(B, 0, B, B); renderer.setRenderTarget(rt); const ac = renderer.autoClear; renderer.autoClear = false; renderer.render(szene, oben); renderer.autoClear = ac;
  rt.viewport.set(0, 0, B * 2, B); rt.scissor.set(0, 0, B * 2, B); renderer.setRenderTarget(alt); renderer.setScissorTest(schere); renderer.setClearColor(farbe, alpha);
  };
  malen();
  // Die Bilder von Blättern und Rinde kommen im Hintergrund (kit/bildlader.js). War das Bild beim ersten Malen noch nicht da, standen ferne Bäume für die ganze Sitzung als schwarze kahle Gerippe da (07.11.2026). Also noch einmal malen, sobald sie da sind
  { const tex = [v.tree.leavesMesh.material.map, v.tree.branchesMesh.material.map].filter(Boolean), offen = () => tex.some(t => !t.image || t.version === 0); if (offen()) { let n = 0; const warte = () => { if (offen()) { if (++n < 3600) requestAnimationFrame(warte); return; } requestAnimationFrame(malen); }; requestAnimationFrame(warte); } }
  const pos = [], nor = [], uv = [], ob = [], quad = (P, U, o = 0) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...P[i]); uv.push(...U[i]); ob.push(o); const p = P[i], w = breite * 0.5, l = Math.hypot(p[0], p[2]) / w; const nx = p[0] / w * 0.55, ny = 0.62 + 0.3 * (p[1] / hoehe), nz = p[2] / w * 0.55, q = Math.hypot(nx, ny, nz); nor.push(nx / q, ny / q, nz / q); } };
  const w = breite / 2, uS = [[0, 0], [0.5, 0], [0.5, 1], [0, 1]]; quad([[-w, 0, 0], [w, 0, 0], [w, hoehe, 0], [-w, hoehe, 0]], uS); quad([[0, 0, w], [0, 0, -w], [0, hoehe, -w], [0, hoehe, w]], uS);
  const yK = hoehe * 0.68; quad([[-w, yK, w], [w, yK, w], [w, yK, -w], [-w, yK, -w]], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]], 1);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('aOben', new THREE.Float32BufferAttribute(ob, 1)); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.38, side: THREE.DoubleSide, alphaToCoverage: !MOBIL_IMP });   // Lambert: ohne Glanz, im Gegenlicht sonst bleich wie Geister
  mat.onBeforeCompile = impostorPatch; mat.customProgramCacheKey = () => 'baumbild4';
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.userData.impostor = hoehe;   // Skalierung je Baum: gewünschte Höhe / Höhe der Vorlage
  if (art) { IMPOSTOR.set(art, { geo, mat, hoehe, rt }); im.userData.geteilt = true; } else im.userData.rt = rt;   // geteilt: bleibt für den nächsten Ort
  return im;
}
import { MOBIL as MOBIL_IMP } from './geraet.js';
// Wandhöhe für den Hausbau: mit echtem Dach (LoD2, Berlin) nur bis zur Traufe, das Dach kommt aus dem Kataster (kit/buildings.js echtesDach)
const wandHoehe = g => g.dachFl ? Math.max(2.5, g.traufe - (g.m || 0)) : g.h - (g.m || 0);

// Baumbilder für die Erde außerhalb gebauter Orte (kit/erdwelt.js, Bäume der Kisten Kacheln): dieselben Bilder wie die fernen Bäume im Ort, dunkler
export function baumImpostor(renderer, id, n, kahl = false) {
  const key = id + ':erde' + (kahl ? ':kahl' : ''), def = BAEUME.find(b => b.id === id), v = IMPOSTOR.has(key) ? null : vorlage(def, def.seed, true);
  const im = impostorBaum(renderer, v, n, key, kahl);
  if (im.material.isMeshLambertMaterial) im.material.color.setRGB(0.78, 0.86, 0.72);
  return im;
}

// Farbe je Baum aus dem Bildpunkt des Satellitenbilds darunter: so passt der Wald aus der Luft zum Foto und jede Krone ist etwas anders
const _baumC = new THREE.Color();
export function waldTon(t, c) { const K = THREE.MathUtils.clamp, r = (t >> 16 & 255) / 255, g = (t >> 8 & 255) / 255, b = (t & 255) / 255, l = 0.3 * r + 0.59 * g + 0.11 * b, h = K(l / 0.15, 0.82, 1.14), f = Math.max(l, 0.02); return c.setRGB(K(r / f * 0.72, 0.8, 1.22) * h, K(g / f * 0.86, 0.88, 1.16) * h, K(b / f * 0.62, 0.72, 1.06) * h); }   // nur leichte Abweichung je Baum, ein heller Bildpunkt (Lichtung, Weg) macht keinen Geisterbaum
// Farbe je Baum: aus dem Bild und der Jahreszeit
const _sz = new THREE.Color();
export function baumFarbe(ton, id, lat, z, c) { if (ton !== undefined) waldTon(ton, c); else c.setRGB(1, 1, 1); if (LAUB.has(id)) { const f = saisonFarbe(lat, z); if (f) c.setRGB(c.r * f[0], c.g * f[1], c.b * f[2]); } return c; }

// Länder mit rot eingefärbten Radwegen (Niederlande, Deutschland, Belgien, Luxemburg, Österreich, Polen, Spanien, Portugal). Anderswo sind sie grau wie die Straße
const RAD_ROT = new Set(['NL', 'DE', 'BE', 'LU', 'AT', 'PL', 'ES', 'PT']);
export class Ort {
  constructor(daten, mats, { mobil = false, renderer = null, tief = null, spaeter = false, wasserMat = null, foto = null } = {}) {
    this.daten = daten; this.mats = mats; this.mobil = mobil; this.renderer = renderer;
    this.Hboden = gelaendeFunktion(daten.gelaende); this.H = this.Hboden; this.mitGelaende = !!(daten.gelaende && daten.gelaende.nx) && ((daten.meta.relief || 0) > 0.15 || !!daten.bruecken?.length || !!daten.tunnel?.length);
    if (daten.bruecken?.length) { this.brueckenFeld = new BrueckenFeld(daten.bruecken, this.Hboden, daten.meta.groesse / 2, { altStadt: ['mittel', 'mitte', 'mittelmeer', 'nordsee', 'ost', 'sued', 'skandi', 'west'].includes(daten.meta?.region) }); this.H = this.brueckenFeld.H; this.Hz = this.brueckenFeld.Hz; }   // Brücken über Wasser (kit/bruecke.js): oben fahren, unten bleibt das Gelände
    if (daten.tunnel?.length) { const TF = this.tunnelFeld = new TunnelFeld(daten.tunnel, this.Hboden, daten.meta.groesse / 2), H0 = this.H, Hz0 = this.Hz || ((x, z) => H0(x, z)); this.H = (x, z) => TF.H(x, z, H0); this.Hz = (x, z, yAlt) => TF.Hz(x, z, yAlt, Hz0); }   // Straßentunnel (kit/tunnel.js, Nr. 98): im Trog der Trogboden, in der Röhre bleibt unten, wer unten ist
    this.gruppe = new THREE.Group();
    this.nahVoll = mobil ? 0 : 105;        // bis hier (Abstand zum Viertel) Häuser in voller Tiefe (Laibungen, Rahmen, Sprossen) wie an der Kreuzung
    this.nahMittel = mobil ? 95 : 300;   // bis hier die leichte Fassung des Generators, dahinter Kisten mit Shader Fassade (03.11.2026 weiter: der Wechsel zur Kiste fiel beim Fahren auf, Nader "Die Gebäude verändern sich")
    this.waende = new Set(['putz', 'putzSand', 'putzGrau', 'sandstein', 'ziegel', 'beton', 'platten', 'kupfer', 'weiss', 'glasDunkel', 'granit', 'schiefer', 'technikDunkel', 'sichtbeton'].map(k => mats[k]).filter(Boolean));

    this.baumNah = mobil ? 40 : 70;       // bis hier volle Bäume (Abstand mit Höhe), dahinter Impostor (seit 28.10.2026 nachts enger: 160 m kosteten 160.000 Dreiecke)
    this.instanzen = [];                  // Stadtmöbel, Laternen, Ampeln, Baumscheiben: Instanzen nur im Umkreis (instanzenVerteilen)
    this.halb = daten.meta.groesse / 2;
    this.unten = this.mitGelaende ? Math.min(UNTEN, (daten.gelaende?.hMin ?? 0) - 0.6) : UNTEN;   // Höhe der Bodenplatte unter dem Ort (ortSzene)
    if (tief) this.unten = Math.min(this.unten, (daten.gelaende?.hMin ?? 0) - tief);   // auf der Kugel: Schürze bis tief unter den Rand, gegen Spalten zum Gelände
    const M = this.m = {
      strasse: mats.asphalt, block: mats.gehweg, bord: mats.granit,
      platz: mitVersatz(Math.abs(Math.round((daten.meta?.lat || 0) * 7) + Math.round((daten.meta?.lon || 0) * 3)) % 3 === 2 ? texMat('pflaster_fisch', { tint: 0xa8a297, normal: 0.8, staerke: 0.65 }) : texMat('pflaster_rechteck', { tint: 0xb4afa5, normal: 0.7, staerke: 0.6 }), -1),   // Plätze: Natursteinplatten oder Fischgrät je Gegend (vorher Bruchstein, wirkte wie ein Mosaik)
      gruen: mitVersatz(texMat('rasen', { tint: 0x5f7040, normal: 0.9, staerke: 0.95, flecken: 0.6 }), -1),   // Rasen statt grüner Kies
      sand: mitVersatz(texMat('sand_fein', { tint: 0xd9c49a, normal: 0.6, staerke: 0.7 }), -1),
      pfad: mitVersatz(daten.gebaeude.length < 80 ? texMat('erde_park', { tint: 0x9c8664, normal: 0.8, staerke: 0.7 }) : texMat('gehweg_platten', { tint: 0x9d978d, normal: 0.6, staerke: 0.5 }), -2),   // auf dem Land Erdwege statt Gehwegplatten
      rad: mitVersatz(texMat('asphalt', { tint: RAD_ROT.has(daten.meta?.iso) ? 0x86493d : 0x74726d, normal: 0.6, staerke: 0.45 }), -2),   // rot nur, wo Radwege in echt rot sind, sonst heller Asphalt (07.11.2026: in Paris lagen rote Bänder über der Straße)
      wasser: wasserMat || new THREE.MeshStandardMaterial({ color: 0x08202a, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.3 }),   // auf der Erde der Shader des Meeres (kit/erde.js wasserMaterial), sonst dunkel mit Spiegelung
      stele: new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 0.9 }),
      mast: mats.technikDunkel,
      beton: mats.sichtbeton || mats.beton, dach: mats.technik,
    };
    // Erde: Grün, Sand, Plätze und die Flächen zwischen den Straßen zeigen das Satellitenbild (kit/ortfoto.js), Straßen und Wege bleiben gebaut
    // Gehwege und Blockflächen je Region: warme Regionen nicht grau gepflastert
    { const reg = daten.meta?.region, B = { maghreb: ['gehweg_platten', 0xc2a079], golf: ['gehweg_platten', 0xc9b48f], nahost: ['gehweg_platten', 0xb8a68a], afrika: ['erde_park', 0xa5845f], indien: ['gehweg_platten', 0x9e8c76], latam: ['gehweg_platten', 0xa89d8c], mittelmeer: ['gehweg_platten', 0xc6baa3], suedostasien: ['gehweg_platten', 0x9f978a] }[reg]; const landlich = (daten.meta?.kleinort || (daten.gebaeude?.length || 0) / (((daten.meta?.groesse || 1200) / 1000) ** 2) < 480) && (daten.waldKarte?.g || daten.waldKarte?.d); this.istWildnis = !!foto && !daten.strasse?.length && (daten.gebaeude?.length || 0) < 5; if (foto) M.block = this.istWildnis ? texMat('sand_fein', { tint: 0xffffff, normal: 1, staerke: 0.9 }) : landlich ? texMat('rasen_duenn', { tint: 0x6e7650, normal: 0.8, staerke: 0.8 }) : B ? texMat(B[0], { tint: B[1], normal: 0.7, staerke: 0.6 }) : texMat('beton_platz', { tint: 0x9a9791, normal: 0.75, staerke: 0.75 }); this.landlich = !!landlich; }   // Dorf und Land: zwischen den Häusern Wiese, nicht Betonplatten
    this.fotoMats = foto ? [M.block = this.istWildnis ? fotoMaterial(M.block, foto, 0.95, 1, false, true) : fotoMaterial(M.block, foto, this.landlich ? 0.86 : 0.78, this.landlich ? 0.5 : 0.15, !this.landlich), M.gruen = fotoMaterial(M.gruen, foto, 0.92, 0.5), M.sand = fotoMaterial(M.sand, foto, 0.85, 0.3), M.platz = fotoMaterial(M.platz, foto, 0.4, 0.1),
      M.pfad = fotoMaterial(M.pfad, foto, 0.55, 0.15)] : [];   // Feld und Waldwege halb Foto (vorher hell wie Kreidestriche)
    this.zeiten = {}; this.fotoU = foto;
    if (!spaeter) { const z = this.zeiten; let t = performance.now(); const mess = (name, f) => { f(); const j = performance.now(); z[name] = Math.round(j - t); t = j; };
      mess('boden', () => this.boden()); mess('markierungen', () => this.markierungen()); mess('stelen', () => this.stelen());
      mess('ausstattung', () => this.ausstattung()); mess('baeume', () => this.baeume()); mess('gebaeude', () => this.gebaeude()); }
  }
  // in Scheiben bauen (Erde): nach jedem Schritt und alle paar hundert Häuser eine Pause (warte), Zeiten ohne Pausen
  async bauen(warte) {
    const z = this.zeiten; let t = performance.now();
    const log = (n, a) => { if (globalThis.__messen) (globalThis.__bauLog ||= []).push([n, Math.round(a), Math.round(performance.now() - a)]); };   // Messprotokoll der Scheiben (tools/fahr_weit.mjs)
    const schritt = async (name, f) => { const a = performance.now(); f(); z[name] = (z[name] || 0) + Math.round(performance.now() - a); log(name, a); await warte(); };
    for (let i = 0, gen = this.bodenSchritte(); ; i++) { const a = performance.now(), r = gen.next(); z.boden = (z.boden || 0) + Math.round(performance.now() - a); log('boden' + i, a); if (r.done) break; await warte(); }
    await schritt('markierungen', () => { this.markierungen(); this.stelen(); });
    await schritt('ausstattung', () => this.ausstattung()); await schritt('baeume', () => this.baeume()); await schritt('bahn', () => this.bahnBauen());
    const gen = this.gebaeudeSchritte(); let fertig = false;
    while (!fertig) { const a = performance.now(); fertig = gen.next().done; z.gebaeude = (z.gebaeude || 0) + Math.round(performance.now() - a); log('gebaeude', a); if (!fertig) await warte(); }
    return this;
  }

  // Ort freigeben (Erde Ansicht, Ortswechsel): Geometrien, Instanzpuffer, Bilder der Baum Impostoren. Gemeinsame Materialien bleiben.
  bahnBauen() { if (this.tunnelFeld?.n) { this.tunnelGruppe = tunnelBauen(this.tunnelFeld, { fahr: this.m.strasse, beton: this.mats.sichtbeton || this.mats.beton, licht: this.tunnelLicht ||= new THREE.MeshBasicMaterial({ color: 0xffe2b0 }), mark: this.mats.markierung }); this.gruppe.add(this.tunnelGruppe); }   // Tunnel (Nr. 98)
    if (this.daten.ubahn?.length) { const U = eingaengeBauen(this.daten.ubahn, this.Hboden); this.gruppe.add(U.gruppe); this.ubahnGruppe = U.gruppe; this.ubahnFeld = U.feld; }   // U-Bahn Eingänge (Nr. 94)
    if (this.brueckenFeld) { const m = this.mats, B = brueckenBauen(this.brueckenFeld, { fahr: this.m.strasse, geh: this.m.platz || m.beton, beton: m.sichtbeton || m.beton, stein: m.sandstein || m.beton, stahl: m.technikDunkel, seil: m.technik || m.technikDunkel, mark: m.markierung }, { mobil: this.mobil, regel: this.stuetzenRegel = stuetzenRegel(this.daten, { gleise: (this.daten.gleise || []).filter(g => !g.br).map(g => g.p) }) }); this.gruppe.add(B.gruppe); this.brueckenRails = B.rails; this.brueckenGruppe = B.gruppe; } if (this.istWildnis) { this.wildnis = new Wildnis(this, this.fotoU, { mobil: this.mobil }); this.gruppe.add(this.wildnis.gruppe); } if (this.fotoMats.length) { this.waldleben = new Waldleben(this, { mobil: this.mobil }); this.gruppe.add(this.waldleben.gruppe); } if (this.fotoMats.length && this.daten.freizeit) { this.freizeit = new Freizeit(this, { mobil: this.mobil, flaeche, drapiere }); try { this.werbung = new Werbung(this, { mobil: this.mobil }); this.gruppe.add(this.werbung.gruppe); if (this.daten.freizeit?.militaer) { this.militaer = new Militaer(this, this.daten.freizeit.militaer, { mobil: this.mobil }); this.gruppe.add(this.militaer.gruppe); } this.kleintiere = new Kleintiere(this, { mobil: this.mobil }); this.gruppe.add(this.kleintiere.gruppe); } catch (e) { console.warn('Werbung', e); } this.gruppe.add(this.freizeit.gruppe); } if (this.fotoMats.length && this.daten.gleise?.length) { this.bahn = new Bahn(this, { mobil: this.mobil }); this.gruppe.add(this.bahn.gruppe); } if (this.fotoMats.length && this.daten.flughafen) { this.flughafen = new Flughafen(this, { mobil: this.mobil }); this.gruppe.add(this.flughafen.gruppe); } if (this.fotoMats.length && this.daten.hafen) { this.hafen = new Hafen(this, { mobil: this.mobil }); this.gruppe.add(this.hafen.gruppe); } if (this.daten.meta?.lat != null && mauerNah(this.daten.meta.lat, this.daten.meta.lon)) { this.mauer = new Mauer(this, { mobil: this.mobil }); this.gruppe.add(this.mauer.gruppe); } if (this.daten.freizeit?.rummel || this.daten.freizeit?.golf) { this.rummel = new Rummel(this, { mobil: this.mobil }); this.gruppe.add(this.rummel.gruppe); } if (this.fotoMats.length && (this.daten.waldKarte || this.istWildnis)) { this.wild = new Wildtiere(this, { mobil: this.mobil }); this.gruppe.add(this.wild.gruppe); } if (this.fotoMats.length && this.daten.baukraene?.length) { this.kraene = new Baukraene(this, { mobil: this.mobil }); this.gruppe.add(this.kraene.gruppe); } }
  entsorgen() {
    this.kraene?.entsorgen();
    this.mauer?.entsorgen(); this.rummel?.entsorgen(); this.bahn?.entsorgen(); this.flughafen?.entsorgen(); this.hafen?.entsorgen(); this.wild?.entsorgen(); this.freizeit?.entsorgen(); this.werbung?.entsorgen(); this.militaer?.entsorgen(); this.kleintiere?.entsorgen(); this.waldleben?.entsorgen(); this.wildnis?.entsorgen(); this.brueckenGruppe?.traverse(o => o.geometry?.dispose());
    this.gras?.entsorgen();
    this.gruppe.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !o.userData.geteilt) o.geometry.dispose();
      if (o.userData.rt) { o.userData.rt.dispose(); o.material.dispose(); }
    });
    this.gruppe.removeFromParent(); this.kacheln?.clear?.(); this.warteschlange = [];
    for (const m of this.fotoMats) m.dispose();
  }

  // ---------- Boden ----------
  boden() { for (const _ of this.bodenSchritte()); }
  *bodenSchritte() {   // Haltepunkte zwischen den Flächen (Bau in Scheiben, Tokio: Boden in einem Stück 110 ms)
    const D = this.daten, M = this.m, H = this.halb, ist = (x) => Math.abs(Math.abs(x) - H) < 0.05;
    const add = (geo, mat, schatten = true) => { if (this.mitGelaende && !geo.userData.gehoben) geo = drapiere(geo, this.Hboden); const m = new THREE.Mesh(geo, mat); m.receiveShadow = schatten; this.gruppe.add(m); return m; };
    add(flaeche(D.strasse, 0), M.strasse); yield;
    add(flaeche(D.bloecke, BORD), M.block); yield;
    add(flaeche(D.plaetze, BORD), M.platz);
    add(flaeche(D.gruen, BORD), M.gruen);
    if (D.sand?.length) add(flaeche(D.sand, BORD), M.sand);
    if (D.freizeit?.golf) { M.golfRasen ||= mitVersatz(texMat('sand_fein', { tint: 0x5f8f3e, normal: 0.25, staerke: 0.3 }), -1); add(flaeche(D.freizeit.golf.gruene, BORD), M.golfRasen); add(flaeche(D.freizeit.golf.sande, BORD), M.sand); }
    add(flaeche(D.pfade, BORD), M.pfad);
    add(flaeche(D.radwege, BORD), M.rad);
    if (D.vorfeld?.length) { M.vorfeld ||= mitVersatz(texMat('beton_platz', { tint: 0x87857e, normal: 0.7, staerke: 0.65 }), -3); add(flaeche(D.vorfeld, BORD + 0.02), M.vorfeld); }   // Vorfelder der Flughäfen
    const amMeer = !!D.meta?.amMeer && !!this.mitGelaende;
    if (D.wasser.length) { const gw = flaeche(D.wasser, amMeer ? D.meta.meerY - 0.8 : WASSER); if (amMeer) gw.userData.gehoben = true; this.wasserMesh = add(gw, M.wasser, false); }   // am Meer liegt die Fläche als Rückfall unter dem Wellennetz (kit/meer.js)
    yield;
    // Bordsteine, Kaimauern am Wasser, Schürze am Rand des Ausschnitts
    const wasserIn = (x, z) => D.wasser.some(w => inside(w[0], x, z) && !w.slice(1).some(l => inside(l, x, z)));
    const pos = [], nor = [], uv = [], oben = [], onor = [], ouv = [], rpos = [], rnor = [], ruv = [];
    const SOCKEL = -1000;   // Schürze am Rand: unten bis zur Bodenplatte (mit Gelände tiefer als der tiefste Punkt), oben aufs Gelände
    let tS = performance.now();   // Bau in Scheiben: spätestens nach 10 ms eine Pause (Bordsteine einer großen Stadt brauchten 53 ms am Stück)
    const ringe = function* (polys, istBlock) {
      for (const [aussen, ...loecher] of polys) {
        if (performance.now() - tS > 10) { yield; tS = performance.now(); }
        for (const r of [orient(aussen), ...loecher.map(l => orient(l).reverse())]) {
          for (let i = 0; i < r.length; i++) {
            const a = r[i], b = r[(i + 1) % r.length], n = edgeNormal(a, b);
            const randX = ist(a[0]) && ist(b[0]) && Math.abs(a[0] - b[0]) < 0.05, randZ = ist(a[1]) && ist(b[1]) && Math.abs(a[1] - b[1]) < 0.05;
            const y1 = istBlock ? BORD : 0;
            if (randX || randZ) { wand(rpos, rnor, ruv, a, b, SOCKEL, y1, n); continue; }
            if (!istBlock) continue;
            const mx = (a[0] + b[0]) / 2 + n[0] * 0.6, mz = (a[1] + b[1]) / 2 + n[1] * 0.6;
            if (D.wasser.length && wasserIn(mx, mz)) { wand(pos, nor, uv, a, b, amMeer ? -4 : WASSER - 0.2, BORD, n); continue; }
            wand(pos, nor, uv, a, b, 0, BORD, n);
            // Bordsteinkante oben: 25 cm Granit
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (L > 0.3) {
              const ai = [a[0] - n[0] * 0.25, a[1] - n[1] * 0.25], bi = [b[0] - n[0] * 0.25, b[1] - n[1] * 0.25];
              for (const q of [a, b, bi, a, bi, ai]) { oben.push(q[0], BORD + 0.002, q[1]); onor.push(0, 1, 0); ouv.push(q[0], q[1]); }
            }
          }
        }
      }
    };
    yield* ringe(D.bloecke, true); yield* ringe(D.strasse, false);
    yield;
    if (this.mitGelaende) { hebe(pos, this.Hboden); yield; hebe(oben, this.Hboden); }
    for (let i = 0; i < rpos.length; i += 3) { const x = rpos[i], z = rpos[i + 2]; rpos[i + 1] = rpos[i + 1] < SOCKEL + 1 ? this.unten : rpos[i + 1] + (this.mitGelaende ? this.Hboden(x, z) : 0); }
    if (pos.length) { const bordGeo = geoAus(pos, nor, uv); bordGeo.userData.gehoben = true; add(bordGeo, M.bord); }
    // Schürze am Rand wie der Boden selbst (Foto, Normale nach oben): sonst läuft aus der Luft eine dunkle Linie um jeden Ort
    if (rpos.length) { for (let i = 0; i < rnor.length; i += 3) { rnor[i] = 0; rnor[i + 1] = 1; rnor[i + 2] = 0; } const randGeo = geoAus(rpos, rnor, ruv); randGeo.userData.gehoben = true; add(randGeo, M.block, false); }
    if (amMeer && D.wasser.length && this.mats._strandMat) {   // Streifen auf dem Land am Wasser: auflaufende Zunge und nasser Sand (kit/meer_glsl.js)
      const P = [], Q = [], I = []; const reihen = [0, 1.5, 3, 5, 7.5, 11, 15, 20];
      for (const [aussen, ...loecher] of D.wasser) for (const ring of [orient(aussen), ...loecher.map(l => orient(l).reverse())]) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2 || (ist(a[0]) && ist(b[0])) || (ist(a[1]) && ist(b[1]))) continue;
        const n = edgeNormal(a, b), teile = Math.max(1, Math.min(16, Math.ceil(L / 4.5)));
        if (this.H((a[0] + b[0]) / 2 + n[0] * 4, (a[1] + b[1]) / 2 + n[1] * 4) > D.meta.meerY + 1.2) continue;   // Kaimauer: kein Spülsaum
        for (let t = 0; t < teile; t++) { const t0 = t / teile, t1 = (t + 1) / teile, base = P.length / 3; for (let r = 0; r < reihen.length; r++) for (const tt of [t0, t1]) { const x = a[0] + (b[0] - a[0]) * tt + n[0] * reihen[r], z = a[1] + (b[1] - a[1]) * tt + n[1] * reihen[r]; P.push(x, this.H(x, z) + BORD + 0.09, z); Q.push(reihen[r]); } for (let r = 0; r < reihen.length - 1; r++) { const o = base + r * 2; I.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); } }
      }
      if (P.length) { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g2.setAttribute('aInl', new THREE.Float32BufferAttribute(Q, 1)); g2.setIndex(I); const m2 = new THREE.Mesh(g2, this.mats._strandMat); m2.renderOrder = 2; m2.frustumCulled = false; this.gruppe.add(m2); }
    }
    const kante = geoAus(oben, onor, ouv); kante.userData.gehoben = true;
    // Dreiecke der Kante nach oben drehen
    const p = kante.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      const ny = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i]) - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]);
      if (ny < 0) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
    add(kante, mitVersatz(texMat('granit', { tint: 0x96938d, normal: 0.6, staerke: 0.5 }), -3));
    if (!this.mobil && this.fotoMats.length && (D.gruen?.length || D.waldKarte)) { this.gras = new Gras(this, D.gruen || []); this.gruppe.add(this.gras.mesh); }   // Gras in 3D um die Kamera (Erde, Rechner)
  }

  // ---------- Markierungen: Leitlinien 3 m Strich, 6 m Lücke; Zebrastreifen; Furten an Ampeln ----------
  markierungen() {
    const D = this.daten, pos = [], y = 0.013;
    const quad = (cx, cz, ux, uz, l, b) => {   // Rechteck mit Mitte, Richtung u, Länge l, Breite b
      const vx = -uz, vz = ux, A = [cx - ux * l / 2 - vx * b / 2, cz - uz * l / 2 - vz * b / 2], B = [cx + ux * l / 2 - vx * b / 2, cz + uz * l / 2 - vz * b / 2],
        C = [cx + ux * l / 2 + vx * b / 2, cz + uz * l / 2 + vz * b / 2], Dd = [cx - ux * l / 2 + vx * b / 2, cz - uz * l / 2 + vz * b / 2];
      for (const q of [A, C, B, A, Dd, C]) pos.push(q[0], y, q[1]);
    };
    for (const l of D.linien) {
      let rest = 0, an = true;   // Strich und Lücke laufen über Knicke weiter
      for (let i = 0; i < l.p.length - 1; i++) {
        const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        let s = 0;
        while (s < L) {
          const lang = (an ? 3 : 6) - rest, e = Math.min(L, s + lang);
          if (an && e - s > 0.2) quad(ax + ux * (s + e) / 2, az + uz * (s + e) / 2, ux, uz, e - s, l.art === 'mitte' ? 0.15 : 0.12);
          if (e - s < lang) { rest += e - s; break; }
          rest = 0; an = !an; s = e;
        }
      }
    }
    for (const q of D.querungen) {
      const [[ax, az], [bx, bz]] = q.p, L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, vx = -uz, vz = ux;
      if (q.art === 'zebra') for (let s = 0.6; s < L - 0.3; s += 1.0) quad(ax + ux * s, az + uz * s, vx, vz, 4, 0.5);
      else for (const o of [-2, 2]) for (let s = 0.4; s < L - 0.2; s += 0.75) quad(ax + ux * s + vx * o, az + uz * s + vz * o, ux, uz, 0.5, 0.12);
    }
    if (this.mitGelaende) hebe(pos, this.H);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const m = new THREE.Mesh(g, this.mats.markierung); m.receiveShadow = true; this.gruppe.add(m);
  }

  // ---------- Stelen: schlichte Betonblöcke wie im Original (Maße und Höhe aus den Daten) ----------
  stelen() {
    const S = this.daten.stelen; if (!S.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, this.m.stele, S.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    S.forEach(([x, z, l, b, a, h], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, BORD, z), Q.setFromAxisAngle(Y, -a), new THREE.Vector3(l, h, b))));
    im.castShadow = !this.mobil; im.receiveShadow = true; im.computeBoundingSphere();
    this.gruppe.add(im);
  }

  // ---------- Laternen (nachts hell) und Ampeln ----------
  ausstattung() {
    const D = this.daten, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), E = new THREE.Vector3(1, 1, 1);
    const mast = new THREE.CylinderGeometry(0.06, 0.09, 6, 6); mast.translate(0, 3, 0);
    const kopf = new THREE.CylinderGeometry(0.28, 0.12, 0.25, 8); kopf.translate(0, 6.05, 0);
    const licht = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 0 });
    licht.onBeforeCompile = sh => { sh.uniforms.uNacht = NACHT; sh.fragmentShader = 'uniform float uNacht;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3( 1.0, 0.85, 0.62 ) * uNacht * 3.0;'); };
    licht.customProgramCacheKey = () => 'laterne';
    // radius: nur Instanzen im Umkreis der Kamera werden gesetzt (instanzenVerteilen), so zählen 1.000 Radbügel nicht im ganzen Bild
    const f = this.mobil ? 0.62 : 1;
    const viele = (geo, mat, punkte, schatten, radius = 320, yBasis = BORD) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, punkte.length));
      punkte.forEach(([x, z, ry = 0], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, yBasis, z), Q.setFromAxisAngle(Y, ry), E)));
      im.castShadow = schatten; im.computeBoundingSphere(); im.frustumCulled = false; this.gruppe.add(im);
      this.instanzen.push({ im, punkte, r2: (radius * f) ** 2, y: yBasis });
      return im;
    };
    viele(mast, this.m.mast, D.laternen, !this.mobil, 320);
    viele(kopf, licht, D.laternen, false, 320);
    // nachts ein warmer Lichtfleck unter jeder Laterne (kit/nachtlicht.js, 02.11.2026: vorher blieb die Straße nachts schwarz)
    const fleck = new THREE.PlaneGeometry(24, 24); fleck.rotateX(-Math.PI / 2); fleck.translate(0, 0.06, 0);
    viele(fleck, fleckMaterial(0xffc58a, 0.2), D.laternen, false, 320);
    // Lichthöfe der Lampen: ein Aufruf für alle, reichen weit in den Abend (im Rahmen des Ortes; Gelände bekommt instanzenVerteilen nicht, darum hier die Höhe)
    if (D.laternen.length) {
      const pos = new Float32Array(D.laternen.length * 3); D.laternen.forEach(([x, z], i) => { pos[i * 3] = x; pos[i * 3 + 1] = BORD + this.H(x, z) + 6.1; pos[i * 3 + 2] = z; });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ map: lichtFleck(), color: 0xffd9a8, size: 1.5, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
      m.onBeforeCompile = sh => { sh.uniforms.uNacht = NACHT; sh.fragmentShader = 'uniform float uNacht;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= uNacht * 1.15;\n#include <opaque_fragment>'); };
      m.customProgramCacheKey = () => 'lampenhof';
      const hof = new THREE.Points(g, m); hof.frustumCulled = false; hof.renderOrder = 3; this.gruppe.add(hof); this.lampenHof = hof;
      this.lampen = D.laternen.map(([x, z]) => [x, BORD + this.H(x, z) + 5.7, z]);
    }
    const amast = new THREE.CylinderGeometry(0.07, 0.08, 3.4, 6); amast.translate(0, 1.7, 0);
    const akopf = new THREE.BoxGeometry(0.32, 0.9, 0.24); akopf.translate(0, 2.75, 0.16);
    viele(mergeGeometries([amast.toNonIndexed(), akopf.toNonIndexed()]), this.m.mast, D.ampeln, !this.mobil, 220);
    this.moebel(viele);
    if (this.fotoMats.length) strassenbild(this, viele);   // Erde: Hydranten, Schilder, Fahrräder, Café Tische, Gullydeckel (kit/strassenbild.js)
  }
  // Instanzen im Umkreis der Kamera neu setzen (alle 6 m Kamerabewegung): Reihenfolge der Punkte bleibt, nur die Anzahl ändert sich
  instanzenVerteilen(cam) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), E = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
    for (const e of this.instanzen) {
      let n = 0;
      for (const p of e.punkte) {
        if ((p[0] - cam.x) ** 2 + (p[1] - cam.z) ** 2 > e.r2) continue;
        if (e.matrix) e.matrix(p, M); else M.compose(P.set(p[0], e.y + this.H(p[0], p[1]), p[1]), Q.setFromAxisAngle(Y, p[2] || 0), E);
        e.im.setMatrixAt(n++, M);
      }
      e.im.count = n; e.im.visible = n > 0; e.im.instanceMatrix.needsUpdate = true;
    }
  }

  // Stadtmöbel aus den Daten: Bänke (Holz auf Metall), Radbügel (vier je Punkt, entlang des Bordsteins), Papierkörbe,
  // Haltestellen (Mast mit Schild), Poller. Lokal +z zeigt zur Fahrbahn.
  moebel(viele) {
    const D = this.daten.moebel || []; if (!D.length) return;
    const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b.toNonIndexed(); };
    const zyl = (r0, r1, h, x, y, z, n = 8) => { const c = new THREE.CylinderGeometry(r0, r1, h, n); c.translate(x, y, z); return c.toNonIndexed(); };
    const holz = this.mats.holz || this.m.dach, metall = this.mats.metall || this.m.mast, dunkel = this.m.mast;
    const art = t => D.filter(m => m[2] === t).map(([x, z, , ry]) => [x, z, ry]);
    const bank = art('bank');
    viele(mergeGeometries([box(1.8, 0.05, 0.42, 0, 0.45, 0.02), box(1.8, 0.36, 0.04, 0, 0.76, -0.2)]), holz, bank, !this.mobil, 120);
    viele(mergeGeometries([box(0.06, 0.45, 0.46, -0.75, 0.225, 0), box(0.06, 0.45, 0.46, 0.75, 0.225, 0), box(0.05, 0.42, 0.05, -0.75, 0.66, -0.2), box(0.05, 0.42, 0.05, 0.75, 0.66, -0.2)]), dunkel, bank, false, 120);
    const buegel = [];
    for (const k of [-1.5, -0.5, 0.5, 1.5]) buegel.push(zyl(0.025, 0.025, 0.8, k - 0.33, 0.4, 0, 6), zyl(0.025, 0.025, 0.8, k + 0.33, 0.4, 0, 6), box(0.71, 0.05, 0.05, k, 0.8, 0));
    viele(mergeGeometries(buegel), metall, art('rad'), false, 90);
    viele(mergeGeometries([zyl(0.04, 0.04, 0.9, 0, 0.45, -0.25, 6), zyl(0.22, 0.2, 0.62, 0, 0.62, 0, 10)]), dunkel, art('korb'), false, 70);
    viele(zyl(0.08, 0.09, 0.9, 0, 0.45, 0, 8), dunkel, art('poller'), false, 70);
    const schild = new THREE.MeshStandardMaterial({ color: 0xd8b224, roughness: 0.5 });
    const halt = art('halt');
    viele(zyl(0.04, 0.04, 2.6, 0, 1.3, 0, 8), metall, halt, !this.mobil, 220);
    viele(mergeGeometries([new THREE.CircleGeometry(0.24, 18).translate(0, 2.45, 0.05).toNonIndexed(), new THREE.CircleGeometry(0.24, 18).rotateY(Math.PI).translate(0, 2.45, 0.03).toNonIndexed()]), schild, halt, false, 220);
  }

  // ---------- Bäume: nah volle EZ-Tree Bäume als Instanzen, fern einfache Bäume ----------
  baeume() {
    const arten = ['esche', 'eiche', 'espe', 'kiefer', 'palme', 'busch', 'regenwald', 'urwaldriese', 'akazie', 'fichte'].filter(a => !['regenwald', 'urwaldriese', 'akazie', 'fichte'].includes(a) || this.daten.baeume.some(b => b[3] === a)).filter(a => a !== 'palme' || this.daten.baeume.some(b => b[3] === 'palme')).filter(a => a !== 'busch' || this.daten.baeume.some(b => b[3] === 'busch'));
    this.baumListe = this.daten.baeume.map(([x, z, h, typ, , ton], i) => ({ x, z, h, typ: arten.includes(typ) ? typ : 'esche', ry: (i * 2.399) % 6.283, ton }));
    this.baumArten = arten.map(id => {
      const def = BAEUME.find(b => b.id === id), v = vorlage(def, def.seed, true);
      const n = this.baumListe.filter(b => b.typ === id).length || 1;
      const ast = new THREE.InstancedMesh(v.tree.branchesMesh.geometry, v.tree.branchesMesh.material, n);
      const blatt = new THREE.InstancedMesh(v.tree.leavesMesh.geometry, blattMitInstanzen(v.tree.leavesMesh.material), n);
      const erde = this.fotoMats.length > 0, breite = this.daten.meta?.lat ?? 50, kahl = erde && LAUB.has(id) && istKahl(breite), fern = this.renderer ? impostorBaum(this.renderer, v, n, (erde ? id + ':erde' : id) + (kahl ? ':kahl' : ''), kahl) : new THREE.InstancedMesh(fernBaum(id === 'kiefer'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), n);
      // Erde: ferne Bäume dunkler (Kronendach von oben wie im Satellitenbild: gemessen leuchtete ein Wald im Ort 13 mal heller als der Fotowald daneben)
      if (erde && fern.material.isMeshLambertMaterial) fern.material.color.setRGB(0.78, 0.86, 0.72);
      ast.userData.geteilt = blatt.userData.geteilt = true;   // Netze der Vorlage gehören allen Orten
      ast.castShadow = !this.mobil; blatt.castShadow = false; fern.castShadow = false;
      for (const m of [ast, blatt, fern]) { m.receiveShadow = true; m.count = 0; m.frustumCulled = false; this.gruppe.add(m); }
      return { id, def, v, ast, blatt, fern, kahl, laub: LAUB.has(id) };
    });
    this.baumStand = null; this.kronenBauen();
    // Baumscheiben: dunkle Erde mit Granitrand um jeden Straßenbaum auf dem Gehweg (wie an der Kreuzung)
    const mitScheibe = this.daten.baeume.filter(t => t[4] === 1);
    if (mitScheibe.length) {
      const erde = new THREE.PlaneGeometry(1.5, 1.5); erde.rotateX(-Math.PI / 2); erde.translate(0, 0.004, 0);
      const teile = [[0, 0.82, 1.76, 0.12], [0, -0.82, 1.76, 0.12], [0.82, 0, 0.12, 1.52], [-0.82, 0, 0.12, 1.52]].map(([x, z, w, d]) => { const b = new THREE.BoxGeometry(w, 0.07, d); b.translate(x, 0.035, z); return b.toNonIndexed(); });
      const punkte = mitScheibe.map(([x, z], i) => [x, z, (i * 0.7) % 1.57]);
      for (const [geo, mat] of [[erde, mitVersatz(new THREE.MeshStandardMaterial({ color: 0x3b2f25, roughness: 0.98 }), -3)], [mergeGeometries(teile), this.mats.granit]]) {
        const im = new THREE.InstancedMesh(geo, mat, mitScheibe.length);
        im.receiveShadow = true; im.frustumCulled = false; im.count = 0; this.gruppe.add(im);
        this.instanzen.push({ im, punkte, r2: ((this.mobil ? 55 : 90)) ** 2, y: BORD });   // nur im Umkreis (1.000 Scheiben kosteten 48.000 Dreiecke im ganzen Bild)
      }
    }
  }
  // Schatten der Kronen (06.11.2026, Nader "richtig schöne echte Wälder"): die Blätter werfen aus Kostengründen keinen Schatten, ohne das lag der Waldboden in voller Sonne mit Strichen der Stämme.
  // Unsichtbare Kugeln nur für den Schattendurchgang (Ebene 1), mit Löchern im Schatten wie zwischen Blättern: gefleckte Sonne auf dem Boden, 20 Dreiecke je Baum
  kronenBauen() {
    if (this.mobil || !this.fotoMats.length || !this.daten.baeume.length) return;
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), tiefe = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    tiefe.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vKw;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vKw = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vKw;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  { vec3 p = vKw; float n1 = sin(p.x * 1.3 + sin(p.z * 0.9) * 1.7) + sin(p.y * 1.7 + sin(p.x * 1.1) * 1.3) + sin(p.z * 1.5 + sin(p.y * 1.2) * 1.1), n2 = sin(p.x * 4.3 + sin(p.z * 3.1) * 1.7) + sin(p.y * 5.1 + sin(p.x * 3.7) * 1.3) + sin(p.z * 4.7 + sin(p.y * 3.3) * 1.1), n3 = sin(p.x * 11.0 + p.y * 7.0) * sin(p.z * 9.0 - p.y * 6.0); if (n1 * 0.42 + n2 * 0.62 + n3 * 0.7 > 0.32) discard; }`);   // drei Größen (4 m, 1,3 m, 60 cm): gefleckte Sonne statt eines schwarzen Kleckses mit zwei großen Löchern
    };
    tiefe.customProgramCacheKey = () => 'kronenschatten3';
    this.kronen = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, 2600); this.kronen.name = 'kronenschatten'; this.kronen.customDepthMaterial = tiefe; this.kronen.castShadow = true; this.kronen.receiveShadow = false; this.kronen.layers.set(1); this.kronen.frustumCulled = false; this.kronen.count = 0; this.gruppe.add(this.kronen);
  }
  kronenVerteilen(cam) {
    const K = this.kronen; if (!K) return; const hoch = cam.y - this.H(cam.x, cam.z); if (hoch > 170) { K.count = 0; return; }
    const R2 = 170 * 170, M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(); let n = 0; const art = this.kronenArt || (this.kronenArt = Object.fromEntries(this.baumArten.map(a => [a.id, a])));
    for (const b of this.baumListe) { if ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 > R2) continue; if (art[b.typ]?.kahl) continue; const h = b.h, t = b.typ, nadel = t === 'fichte' || t === 'kiefer', palme = t === 'palme', rxz = nadel ? h * 0.15 : palme ? h * 0.3 : t === 'busch' ? h * 0.55 : t === 'akazie' ? h * 0.55 : h * 0.3, ry = nadel ? h * 0.42 : palme ? h * 0.1 : t === 'akazie' ? h * 0.12 : t === 'busch' ? h * 0.5 : h * 0.28, cy = nadel ? h * 0.58 : palme ? h * 0.94 : t === 'akazie' ? h * 0.82 : t === 'busch' ? h * 0.5 : h * 0.68;
      M.compose(P.set(b.x, BORD + this.H(b.x, b.z) + cy, b.z), Q, S.set(rxz, ry, rxz)); K.setMatrixAt(n++, M); if (n >= 2600) break; }
    K.count = n; K.instanceMatrix.needsUpdate = true;
  }
  baeumeVerteilen(cam) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3();
    if (this.baumDichte === undefined) { const H_ = (this.daten.meta?.groesse || 1200); this.baumDichte = this.baumListe.length / (H_ * H_); this.baumNah = Math.min(this.baumNah, Math.max(24, Math.sqrt((this.mobil ? 14 : 55) / (Math.PI * Math.max(1e-6, this.baumDichte))))); }
    const r2 = this.baumNah * this.baumNah;
    // Erde: von oben zeigt das Satellitenbild den Wald, die fernen Baumbilder schrumpfen zwischen 250 und 380 m Kamerahöhe weich weg
    // (sonst leuchtete der Wald im Ort heller als der Fotowald ringsum)
    const kFern = this.fotoMats.length ? THREE.MathUtils.smoothstep(2600 - (cam.y - this.H(cam.x, cam.z)), 0, 900) : 1;
    for (const a of this.baumArten) { a.n = 0; a.f = 0; }
    const art = Object.fromEntries(this.baumArten.map(a => [a.id, a]));
    for (const b of this.baumListe) {
      const a = art[b.typ], nah = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 + (cam.y - 8) ** 2 < r2;
      P.set(b.x, BORD + this.H(b.x, b.z), b.z); Q.setFromAxisAngle(Y, b.ry);
      const z = b.z0 ?? (b.z0 = (Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233)) * 43758.5453) % 1), breite = this.daten.meta?.lat ?? 50, faerben = this.fotoMats.length > 0;
      if (nah) { const s = a.v.scale * b.h / a.def.hoehe; M.compose(P, Q, S.setScalar(s)); a.ast.setMatrixAt(a.n, M); a.blatt.setMatrixAt(a.n, M); if (faerben) a.blatt.setColorAt(a.n, baumFarbe(b.ton, b.typ, breite, z, _baumC)); a.n++; }
      else if (kFern > 0.02) { const s = a.fern.userData.impostor ? b.h / a.fern.userData.impostor * kFern : null; M.compose(P, Q, s ? S.setScalar(s) : S.set(b.h * 0.95 * kFern, b.h * kFern, b.h * 0.95 * kFern)); a.fern.setMatrixAt(a.f, M); if (b.ton !== undefined || faerben) a.fern.setColorAt(a.f, baumFarbe(b.ton, b.typ, breite, z, _baumC)); a.f++; }
    }
    for (const a of this.baumArten) {
      a.ast.count = a.n; a.blatt.count = a.kahl ? 0 : a.n; a.fern.count = a.f;
      for (const m of [a.ast, a.blatt, a.fern]) m.instanceMatrix.needsUpdate = true;
      if (a.fern.instanceColor) a.fern.instanceColor.needsUpdate = true;
      if (a.blatt.instanceColor) a.blatt.instanceColor.needsUpdate = true;
    }
    this.kronenVerteilen(cam);
  }

  // ---------- Gebäude in Kacheln ----------
  gebaeude() { for (const _ of this.gebaeudeSchritte()); }
  *gebaeudeSchritte() {
    this.kacheln = new Map(); this.warteschlange = []; this.haeuser = []; this.tueren = new Map(); this.festeTueren = new Map();
    const fernMat = this.fernMat = fernMaterial({ instanziert: false, licht: 0.7 }), V = KACHEL / 2;
    // Kachel 125 m: Kiste und Schattenproxy. Nahstufen (voll, leicht) je Viertel von 62,5 m (seit 28.10.2026 nachts), damit die volle
    // Stufe nicht bis in die ferne Ecke einer Kachel reicht: halbiert die Dreiecke der vollen Häuser auf Augenhöhe.
    let schritt = 0, tS = performance.now();
    for (const g of this.daten.gebaeude) {
      if (++schritt % 25 === 0 && performance.now() - tS > 10) { yield; tS = performance.now(); }   // Haltepunkt für den Bau in Scheiben (nach Zeit, höchstens rund 10 ms je Bild)
      const pts = orient(g.p); if (Math.abs(area(pts)) < 2) continue;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const i = Math.floor(cx / KACHEL), j = Math.floor(cz / KACHEL), key = `${i},${j}`;
      if (!this.kacheln.has(key)) {
        const k = { key, x0: i * KACHEL, z0: j * KACHEL, liste: [], kern: false, h: 0, viertel: [] };
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) k.viertel.push({ kachel: k, x0: k.x0 + a * V, z0: k.z0 + b * V, liste: [], stufen: { voll: null, mittel: null }, will: 'fern', h: 0, abstand: 0, fernSeit: 0 });
        this.kacheln.set(key, k);
      }
      // Gelände: Haus steht auf der mittleren Bodenhöhe seines Grundrisses, ein Sockel reicht bis zur tiefsten Ecke
      let basis = 0, tief = 0; if (this.mitGelaende) { const hs = pts.map(([x, zz]) => this.H(x, zz)); basis = hs.reduce((a, b) => a + b, 0) / hs.length; tief = Math.min(...hs); }
      const k = this.kacheln.get(key), z = zuordnung(g), e = { g, pts, z, eingang: null, basis, tief };
      const v = k.viertel[(cx >= k.x0 + V ? 2 : 0) + (cz >= k.z0 + V ? 1 : 0)];
      e.v = v; k.liste.push(e); v.liste.push(e); k.h = Math.max(k.h, g.h); v.h = Math.max(v.h, g.h);
      if (!g.rand) k.kern = true;
      // begehbar (kit/interior.js): Häuser im Kern mit Erdgeschoss bekommen eine Haustür an der Straßenkante
      if (!g.rand && !z.schlicht && !g.osm && (g.m || 0) < 0.5 && g.h >= 4 && g.id) {   // bekannte Gebäude aus OSM Teilen haben noch keine Haustür (sonst ging man durch die Wand, Nr. 96)
        e.eingang = eingangKante(pts, this.daten.bloecke);
        if (e.eingang >= 0) this.haeuser.push({ id: g.id, pts, y0: basis + (g.m || 0), h: wandHoehe(g), typ: z.typ, variant: z.variant, seed: (g.id || 1) % 9973, laeden: !!g.laden, eingang: e.eingang });
        else e.eingang = null;
      }
    }
    let anzahl = 0;
    const schattenMat = new THREE.MeshBasicMaterial();
    for (const k of this.kacheln.values()) {
      if (++schritt % 4 === 0 && performance.now() - tS > 10) { yield; tS = performance.now(); }
      const geo = fernGeo(k.liste.map(({ g, pts, z, basis = 0, tief = 0 }) => ({ pts, y0: z.schlicht === 'dach' ? basis + Math.max(g.m || 0, g.h - 0.5) : (g.m || 0) > 0.5 ? basis + g.m : Math.min(tief, basis) + (g.rand ? UNTEN : -0.3 * (basis - tief > 0.05)), y1: basis + g.h, t: z.fern + 100 * ((g.ton ?? fernTon(z.typ, rng((g.id || 1) % 9973)())) + 1), dach: g.dachFl && !z.schlicht ? { flaechen: g.dachFl, basis, traufeY: basis + g.traufe, deckung: echteDeckung(z.typ, g.traufe, (g.id || 1) % 9973, g.rot) } : null })), this.daten.meta?.region);   // echte Dächer auch in der Kiste (Nr. 82)
      k.fern = new THREE.Mesh(geo, fernMat); k.fern.castShadow = false; k.fern.receiveShadow = true;
      // Schattenproxy (seit 28.10.2026 nachts): die Baumasse jeder Kachel wirft den Schatten, egal welche Stufe sichtbar ist. Liegt auf
      // Ebene 1, die nur die Schattenkamera sieht (app.js). So zählt der Schattendurchgang 12 Dreiecke je Haus statt der vollen Fassade.
      k.schatten = new THREE.Mesh(geo, schattenMat); k.schatten.castShadow = true; k.schatten.layers.set(1);
      this.gruppe.add(k.fern, k.schatten); einfrieren(k.fern); einfrieren(k.schatten); anzahl += k.liste.length;
    }
    this.anzahl = anzahl;
  }

  // Festes Türblatt der Zwischenstufe aus (aus = true: Ecken auf einen Punkt) oder wieder ein. kit/interior.js setzt am aktiven Haus ein bewegliches
  // Blatt ein (Nr. 96). Nach dem Vereinen der Kachel teilen Viertel und Kachel denselben Puffer (drawRange), die Änderung gilt für beide
  festeTuer(id, aus) {
    const g = this.festeTueren.get(id); if (!g) return false;
    for (const e of g.userData.fest.get(id) || []) {
      const m = g.children.find(c => c.isMesh && c.material === e.zm); if (!m) continue;
      const a = m.geometry.attributes.position, s0 = (m.geometry.drawRange.start || 0) + e.start;
      if (aus) { if (e.alt) continue; e.alt = a.array.slice(s0 * 3, (s0 + e.n) * 3); const x = a.array[s0 * 3], y = a.array[s0 * 3 + 1], z = a.array[s0 * 3 + 2]; for (let i = s0; i < s0 + e.n; i++) { a.array[i * 3] = x; a.array[i * 3 + 1] = y; a.array[i * 3 + 2] = z; } }
      else { if (!e.alt) continue; a.array.set(e.alt, s0 * 3); e.alt = null; }
      a.addUpdateRange(s0 * 3, e.n * 3); a.needsUpdate = true;
    }
    return true;
  }
  // ein Haus mit dem Generator (oder schlicht, wenn es kein Haus mit Fenstern ist)
  haus({ g, pts, z, eingang = null, basis = 0, tief = 0 }, leicht) {
    if (g.osm) { try { return osmTeilBauen(this.mats, g, pts, basis, leicht || !!g.hinten); } catch (e) { console.warn('OSM Teil', e.message); } }   // bekannte Gebäude aus OSM Teilen (Wunsch Nr. 83)
    const h = wandHoehe(g);
    if (z.schlicht) {
      const y0 = z.schlicht === 'dach' ? Math.max(g.m || 0, g.h - 0.5) : (g.m || 0);
      const mesh = new THREE.Mesh(fernGeoSchlicht(pts, basis + y0, basis + g.h), z.schlicht === 'dach' ? this.m.dach : this.m.beton);
      return mesh;
    }
    const seed = (g.id || 1) % 9973;
    let b;
    try { b = buildBuilding(this.mats, { pts, height: h, type: z.typ, variant: z.variant, seed, ohneLaden: (g.m || 0) > 0.5, laeden: !!g.laden, leicht: !!g.hinten, spar: leicht || !!g.hinten, eingang, dachEcht: g.dachFl ? { flaechen: g.dachFl, traufe: g.traufe, seed, rot: g.rot } : null, echt: !!g.echt, vorgabe: g.vg || null, kiez: g.kiez || null }); }   // hinten: Hinterhaus ohne Straßenfront (kit/ortbau.js), dachEcht: Dach aus dem Kataster
    catch (e) { console.warn('Haus', z.typ, e.message); return new THREE.Mesh(fernGeoSchlicht(pts, g.m || 0, g.h), this.mats.putzGrau || this.m.beton); }   // ein Fehler im Generator darf nie den Ort kosten
    b.userData.id = g.id;
    let kaputt = false;
    b.traverse(o => { if (o.isMesh && !kaputt) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (!Number.isFinite(a[i] + a[i + 1] + a[i + 2])) { kaputt = true; break; } } });
    if (kaputt) return new THREE.Mesh(fernGeoSchlicht(pts, g.m || 0, g.h), this.mats.putzGrau || this.m.beton);   // Grundriss, mit dem der Generator nicht klarkommt
    b.position.y = basis + (g.m || 0);
    if (basis - tief > 0.2 && (g.m || 0) < 0.5) { const sockel = new THREE.Mesh(fernGeoSchlicht(pts, tief - basis - 0.3, 0.02), this.mats.sandstein || this.m.beton); sockel.name = 'sockel'; b.add(sockel); }   // Hanglage: Sockel bis zur tiefsten Ecke
    return b;
  }

  // Kacheln nach Abstand zur Kamera in drei Stufen (voll, mittel, fern) umschalten und nahe Kacheln Haus für Haus bauen
  // (höchstens rund 8 ms je Bild). Solange eine Stufe noch gebaut wird, bleibt die nächstbeste sichtbar, damit nichts aufploppt.
  update(cam, budget = 8) {   // budget: ms je Aufruf für den Hausbau (Vorbau vor dem Ortstausch nutzt weniger, dashboard/app.js)
    this.gras?.update(cam.position, this.H);
    if (!this.baumStand || this.baumStand.distanceToSquared(cam.position) > 36) { this.baumStand = cam.position.clone(); this.baeumeVerteilen(cam.position); this.instanzenVerteilen(cam.position); }
    const p = cam.position, N = this.nahVoll, M = this.nahMittel, V = KACHEL / 2, jetzt = performance.now();
    for (const k of this.kacheln.values()) {
      if (!k.kern) continue;
      let nah = false;
      for (const v of k.viertel) {
        const dx = Math.max(v.x0 - p.x, 0, p.x - (v.x0 + V)), dz = Math.max(v.z0 - p.z, 0, p.z - (v.z0 + V)), dy = Math.max(0, p.y - v.h);
        const d = v.abstand = Math.hypot(dx, dz, dy);
        let will = d < N ? 'voll' : d < M ? 'mittel' : 'fern';
        if (v.will === 'voll' && will !== 'voll' && d < N + 25) will = 'voll';          // erst 25 m weiter zurückschalten
        if (v.will === 'mittel' && will === 'fern' && d < M + 25) will = 'mittel';
        v.will = will; if (will !== 'fern') nah = true;
      }
      // ist ein Viertel nah, bekommt die ganze Kachel mindestens die leichte Stufe (die Kiste gilt nur für die ganze Kachel)
      if (nah) for (const v of k.viertel) if (v.will === 'fern') v.will = 'mittel';
      for (const v of k.viertel) {
        if (v.will !== 'fern') {
          v.fernSeit = 0;
          if (!v.stufen[v.will] && v.liste.length && !this.warteschlange.some(w => w.v === v && w.stufe === v.will)) this.warteschlange.push({ v, stufe: v.will, i: 0 });
        } else if (v.stufen.voll || v.stufen.mittel) {   // lange fern: Stufen freigeben (Speicher, wichtig für den Globus)
          v.fernSeit ||= jetzt;
          if (jetzt - v.fernSeit > 45000) for (const s of ['voll', 'mittel']) { const g = v.stufen[s]; if (!g) continue; g.traverse(o => o.geometry?.dispose()); this.gruppe.remove(g); v.stufen[s] = null; if (s === 'mittel' && k.ganz) { k.ganz.traverse(o => o.geometry?.dispose()); this.gruppe.remove(k.ganz); k.ganz = null; k.ganzAn = false; } if (s === 'mittel') { k.ganzFertig = false; k.verein = null; } for (const id of g.userData.tueren || []) this.tueren.delete(id); for (const id of g.userData.fest?.keys() || []) if (this.festeTueren.get(id) === g) this.festeTueren.delete(id); }
        }
      }
      this.zeige(k);
    }
    this.warteschlange = this.warteschlange.filter(w => w.v.will !== 'fern' && !(w.stufe === 'voll' && w.v.will !== 'voll'));
    if (!this.warteschlange.length) { const t1 = performance.now(); for (const k of this.kacheln.values()) { if (!k.kern || k.ganzFertig || !k.viertel.some(v => v.will !== 'fern')) continue; const L = k.viertel.filter(v => v.liste.length); if (L.length < 2 || !L.every(v => v.stufen.mittel)) continue; this.vereinen(k); if (performance.now() - t1 > 2.5) break; } return; }
    this.warteschlange.sort((a, b) => a.v.abstand - b.v.abstand);
    const t0 = performance.now();
    while (this.warteschlange.length && performance.now() - t0 < budget) {
      const w = this.warteschlange[0];
      const tueren = w.stufe === 'voll' ? this.tueren : null;   // Haustüren nur in der vollen Stufe beweglich; Schatten kommt vom Proxy der Kachel
      if (w.i < w.v.liste.length) { w.jeMat ||= new Map(); w.blaetter ||= []; zusammenSammeln(this.haus(w.v.liste[w.i], w.stufe === 'mittel'), w.jeMat, w.blaetter, tueren, tueren ? null : (w.fest ||= new Map())); w.i++; continue; }
      if (!w.g) { w.g = new THREE.Group(); w.mats = [...(w.jeMat || new Map()).entries()]; continue; }
      if (w.mats.length) { const [mat, geos] = w.mats.shift(); w.g.add(zusammenMesh(mat, geos, null)); continue; }   // ein Material je Schritt
      const g = w.g; zusammenTueren(g, w.blaetter || [], tueren);
      if (w.fest?.size) { g.userData.fest = w.fest; for (const id of w.fest.keys()) this.festeTueren.set(id, g); }   // feste Türblätter der Zwischenstufe (Nr. 96)
      w.v.stufen[w.stufe] = g; g.visible = false; this.gruppe.add(g); einfrieren(g); this.warteschlange.shift(); this.zeige(w.v.kachel);
    }
  }
  // Kachel vereinen (06.11.2026, Karte Weniger Zeichenaufrufe): steht die ganze Kachel in der leichten Stufe, reicht je Material ein Aufruf statt vier. Die Viertel behalten eine Ansicht auf dieselben Puffer (drawRange), das kostet keinen Speicher. Ein Material je Schritt, damit kein Bild hängt
  vereinen(k) {
    if (!k.verein) { const jeMat = new Map(); for (const v of k.viertel) { if (!v.stufen.mittel) continue; v.stufen.mittel.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; let L = jeMat.get(o.material); if (!L) jeMat.set(o.material, L = []); L.push(o); }); } k.verein = { offen: [...jeMat.entries()], G: new THREE.Group() }; k.verein.G.name = 'kachel ganz'; }
    const V = k.verein, e = V.offen.shift();
    if (e) { const [mat, L] = e; let n = 0; for (const m of L) n += m.geometry.attributes.position.count; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = L[0].geometry.attributes.color ? new Float32Array(n * 3) : null; let o = 0; const aP = new THREE.BufferAttribute(P, 3), aN = new THREE.BufferAttribute(N, 3), aU = new THREE.BufferAttribute(U, 2), aC = C ? new THREE.BufferAttribute(C, 3) : null;
      for (const m of L) { const g = m.geometry, c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); if (C) C.set(g.attributes.color.array, o * 3); if (!g.boundingSphere) g.computeBoundingSphere(); const b = new THREE.BufferGeometry(); b.setAttribute('position', aP); b.setAttribute('normal', aN); b.setAttribute('uv', aU); if (aC) b.setAttribute('color', aC); b.setDrawRange(o, c); b.boundingSphere = g.boundingSphere; g.dispose(); m.geometry = b; o += c; }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', aP); gg.setAttribute('normal', aN); gg.setAttribute('uv', aU); if (aC) gg.setAttribute('color', aC); gg.computeBoundingSphere(); const me = new THREE.Mesh(gg, mat); me.castShadow = L[0].castShadow; me.receiveShadow = L[0].receiveShadow; V.G.add(me); }
    if (!V.offen.length) { V.G.visible = false; this.gruppe.add(V.G); einfrieren(V.G); k.ganz = V.G; k.ganzFertig = true; k.verein = null; this.zeige(k); }
  }
  // Kiste bleibt sichtbar, bis jedes Viertel mit Häusern eine Stufe hat (sonst stünden Kiste und Haus übereinander)
  zeige(k) {
    const alleFern = k.viertel.every(v => v.will === 'fern');
    const fertig = !alleFern && k.viertel.every(v => !v.liste.length || v.stufen.voll || v.stufen.mittel);
    const ganz = !!k.ganz && fertig && k.viertel.every(v => !v.liste.length || (v.will !== 'voll' && v.stufen.mittel)); if (k.ganz) k.ganz.visible = ganz; k.ganzAn = ganz;
    for (const v of k.viertel) {
      const vo = v.stufen.voll, mi = v.stufen.mittel;
      const sicht = !fertig ? null : v.will === 'voll' ? (vo || mi) : (mi || vo);
      if (vo) vo.visible = sicht === vo;
      if (mi) mi.visible = !ganz && sicht === mi;
    }
    k.fern.visible = !fertig;
  }

  // Landen und Stehen auf allen Gebäuden (Wunsch Nr. 57, 06.11.2026, Nader: "auf Dächern landen ... und stehen können, natürlich auf allen Gebäuden")
  // Haus unter einem Punkt des Ortes (Raster 40 m, einmal gebaut)
  hausAm(x, z) {
    if (!this.kacheln) return null;
    if (!this.hausRasterE) { const R = this.hausRasterE = new Map(); for (const k of this.kacheln.values()) for (const e of k.liste) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [px, pz] of e.pts) { if (px < x0) x0 = px; if (pz < z0) z0 = pz; if (px > x1) x1 = px; if (pz > z1) z1 = pz; } const h = { e, x0, z0, x1, z1 }; for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) { const c = i * 65536 + j, L = R.get(c); if (L) L.push(h); else R.set(c, [h]); } } }
    const L = this.hausRasterE.get(Math.floor(x / 40) * 65536 + Math.floor(z / 40)); if (!L) return null;
    for (const h of L) { if (x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1) continue; if (inside(h.e.pts, x, z)) return h; }
    return null;
  }
  // Nach oben zeigende Dreiecke der sichtbaren Stufe eines Viertels, Raster 4 m. Einmal je Stufe gebaut, die Abfrage ist dann billig genug für jeden Physikschritt
  dachFeld(v) {
    const q = v?.stufen.voll?.visible ? v.stufen.voll : v?.stufen.mittel?.visible || (v?.stufen.mittel && v.kachel?.ganzAn) ? v.stufen.mittel : null; if (!q) return null;
    if (v._df?.q === q) return v._df;
    const D = [], zellen = new Map(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    q.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; const P = o.geometry.attributes.position, I = o.geometry.index, dr = o.geometry.drawRange, n = Math.min(I ? I.count : P.count, dr.start + dr.count);
      for (let t = dr.start; t < n; t += 3) { const a = I ? I.getX(t) : t, b = I ? I.getX(t + 1) : t + 1, c = I ? I.getX(t + 2) : t + 2; A.fromBufferAttribute(P, a); B.fromBufferAttribute(P, b); C.fromBufferAttribute(P, c);
        const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, wx = C.x - A.x, wy = C.y - A.y, wz = C.z - A.z, ny = uz * wx - ux * wz, nx = uy * wz - uz * wy, nz = ux * wy - uy * wx, L2 = nx * nx + ny * ny + nz * nz; if (L2 < 1e-5 || ny * ny < 0.06 * L2) continue;   // nur Flächen, die zum Himmel oder zum Boden zeigen (mehr als 14 Grad aus der Senkrechten)
        const i = D.length; D.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
        const x0 = Math.floor(Math.min(A.x, B.x, C.x) / 4), x1 = Math.floor(Math.max(A.x, B.x, C.x) / 4), z0 = Math.floor(Math.min(A.z, B.z, C.z) / 4), z1 = Math.floor(Math.max(A.z, B.z, C.z) / 4);
        if ((x1 - x0 + 1) * (z1 - z0 + 1) > 2500) continue;
        for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const k = cx * 65536 + cz, L = zellen.get(k); if (L) L.push(i); else zellen.set(k, [i]); } } });
    return v._df = { q, D: new Float32Array(D), zellen };
  }
  // Höhe der Dachfläche über dem Punkt (Rahmen des Ortes), null: dort steht kein Haus. Aus der sichtbaren Stufe, also auch auf Steildächern und Brüstungen richtig; solange nur die Kiste steht, deren Deckel
  dachBei(x, z) {
    const h = this.hausAm(x, z); if (!h) return null;
    const e = h.e, kiste = e.basis + e.g.h, F = this.dachFeld(e.v); if (!F) return kiste;
    const L = F.zellen.get(Math.floor(x / 4) * 65536 + Math.floor(z / 4)); if (!L) return kiste;
    let y = -Infinity; const D = F.D;
    for (const i of L) { const ax = D[i], az = D[i + 2], bx = D[i + 3], bz = D[i + 5], cx = D[i + 6], cz = D[i + 8], det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-6) continue; const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, w = 1 - u - v; if (u < -1e-3 || v < -1e-3 || w < -1e-3) continue; const yy = u * D[i + 1] + v * D[i + 4] + w * D[i + 7]; if (yy > y) y = yy; }
    return y < e.basis + (e.g.m || 0) + 1 ? kiste : y;
  }

  // steht der Punkt in einem Gebäude? (für Kamerapunkte auf Augenhöhe)
  frei(x, z) { return !this.daten.gebaeude.some(g => !g.rand && g.m < 2 && g.b !== 'roof' && g.b !== 'carport' && inside(g.p, x, z)); }   // unter Dächern kann man stehen

  info() {
    const D = this.daten, kern = D.gebaeude.filter(g => !g.rand).length;
    return { gebaeude: kern, rand: D.gebaeude.length - kern, stelen: D.stelen.length, baeume: D.baeume.length, laternen: D.laternen.length, ampeln: D.ampeln.length,
      querungen: D.querungen.length, wegeKnoten: D.wege.knoten.length, moebel: (D.moebel || []).length, laeden: D.gebaeude.filter(g => g.laden).length,
      vollViertel: [...this.kacheln.values()].flatMap(k => k.viertel).filter(v => v.stufen.voll?.visible).length, leichtViertel: [...this.kacheln.values()].flatMap(k => k.viertel).filter(v => v.stufen.mittel?.visible).length };
  }
}

function fernGeoSchlicht(pts, y0, y1) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; wand(pos, nor, uv, a, b, y0, y1, edgeNormal(a, b)); }
  const p2 = [], u2 = [], i2 = [];
  dreieckeOben([pts], y1, p2, u2, i2);
  for (const k of i2) { pos.push(p2[k * 3], p2[k * 3 + 1], p2[k * 3 + 2]); nor.push(0, 1, 0); uv.push(u2[k * 2], u2[k * 2 + 1]); }
  return geoAus(pos, nor, uv);
}
