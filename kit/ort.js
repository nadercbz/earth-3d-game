// Echter Ort aus OpenStreetMap (Daten aus tools/ort_bauen.py, erster Test 28.10.2026: Potsdamer Platz, 1 km²).
// Boden mit Fahrbahn, Gehwegblöcken mit Bordstein, Plätzen, Grün, Pfaden, Radwegen und Wasser, dazu Markierungen, Überwege,
// Ampeln, Laternen, Bäume (nah volle Bäume, fern einfache) und Stelen. Gebäude in Kacheln von 125 m: fern Kisten mit
// Fassaden aus dem Shader (fernMaterial), nah der Gebäude Generator, Haus für Haus nachgebaut, solange die Kamera nah ist.
import { Militaer } from './militaer.js';
import { osmTeilBauen, osmTeilPlan } from './osmteile_bau.js';
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
import { autobahnBauen } from './autobahnbau.js';
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
import { Flussschiffe } from './flussschiffe.js';
import { stuetzenRegel } from './stuetzen.js';
import { TunnelFeld, tunnelBauen } from './tunnel.js';
import { eingaengeBauen } from './ubahn_eingang.js';
import { steildach, STEIL_PLUS } from './regionen.js';
import { texMat, NACHT, gehwegMat, spurMat, BODEN107 } from './materials.js';
import { BAEUME, vorlage, blattMitInstanzen } from './trees.js';
import { eingangKante } from './interior.js';
import { fotoVorsatz } from './fotofassade.js';
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
  const X = geo.attributes.aArt || null, U = X ? geo.attributes.uv : null;   // Berliner Gehweg (Nr. 107): eigene UV und die Art je Ecke wandern beim Teilen mit, sonst kommt die UV aus der Lage
  const teile = (a, b, c, tiefe) => {
    const ab = (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2, bc = (b[0] - c[0]) ** 2 + (b[2] - c[2]) ** 2, ca = (c[0] - a[0]) ** 2 + (c[2] - a[2]) ** 2, mx = Math.max(ab, bc, ca);
    if (mx <= n2 || tiefe > 16) { out.push(a, b, c); return; }
    if (mx <= m2) {
      const ha = H(a[0], a[2]), hb = H(b[0], b[2]), hc = H(c[0], c[2]);
      const [p, q, hp, hq] = mx === ab ? [a, b, ha, hb] : mx === bc ? [b, c, hb, hc] : [c, a, hc, ha];
      const eKante = Math.abs(H((p[0] + q[0]) / 2, (p[2] + q[2]) / 2) - (hp + hq) / 2), eMitte = Math.abs(H((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3) - (ha + hb + hc) / 3);
      if (eKante <= fehler && eMitte <= fehler) { out.push(a, b, c); return; }
    }
    const mid = X ? (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, (p[3] + q[3]) / 2, (p[4] + q[4]) / 2, p[5]] : (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    if (mx === ab) { const m = mid(a, b); teile(a, m, c, tiefe + 1); teile(m, b, c, tiefe + 1); }
    else if (mx === bc) { const m = mid(b, c); teile(a, b, m, tiefe + 1); teile(a, m, c, tiefe + 1); }
    else { const m = mid(c, a); teile(a, b, m, tiefe + 1); teile(m, b, c, tiefe + 1); }
  };
  for (let k = 0; k < n; k += 3) { const v = j => { const i = I ? I[k + j] : k + j; return X ? [P.getX(i), P.getY(i), P.getZ(i), U.getX(i), U.getY(i), X.getX(i)] : [P.getX(i), P.getY(i), P.getZ(i)]; }; teile(v(0), v(1), v(2), 0); }
  const pos = new Float32Array(out.length * 3), uv = new Float32Array(out.length * 2);
  out.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1] + H(p[0], p[2]); pos[i * 3 + 2] = p[2]; uv[i * 2] = X ? p[3] : p[0]; uv[i * 2 + 1] = X ? p[4] : -p[2]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (X) { const art = new Float32Array(out.length); out.forEach((p, i) => { art[i] = p[5]; }); g.setAttribute('aArt', new THREE.BufferAttribute(art, 1)); }
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
    if (dach && echtesFernDach(pts, y0, dach.basis, dach.traufeY, dach.flaechen, pos, nor, typ, t, t + STEIL_PLUS)) { for (let k = t0; k < typ.length; k++) typ[k] += hausZ; continue; }
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
    this.pegelBauen();   // fester Wasserspiegel je Gewässer (Nr. 106), vor den Brücken: ihr Boden ist über Wasser der Pegel
    // Einschnitt (Nr. 112 Runde 3, kit/brueckenbau.js): unter Brücken, die nicht steigen können, liegt das Gelände entlang des Gleises oder der unteren
    // Straße tiefer. Volle Tiefe unter der Brücke (pl), davor und dahinter eine Rampe (rl), seitlich eine Böschung von 5 m. Alles, was auf dem
    // Gelände steht (Gleise, Fahrbahn, Boden), folgt von selbst, die Brücke rechnet ihre Durchfahrt über dem abgesenkten Boden und bleibt oben
    if (daten.einschnitte?.length && !globalThis.__ohneEinschnitt) { const Z = 32, BANK = 4, G = new Map(), H0 = this.Hboden, GS = new Map();
      for (const o of daten.einschnittSchutz || []) for (let i = 1; i < o.p.length; i++) { const ax = o.p[i - 1][0], az = o.p[i - 1][1], dx = o.p[i][0] - ax, dz = o.p[i][1] - az, q = dx * dx + dz * dz; if (q < 1e-4) continue; const g = { ax, az, dx, dz, q, w: o.w }, r = o.w + 3; for (let a = Math.floor((Math.min(ax, o.p[i][0]) - r) / Z); a <= Math.floor((Math.max(ax, o.p[i][0]) + r) / Z); a++) for (let c = Math.floor((Math.min(az, o.p[i][1]) - r) / Z); c <= Math.floor((Math.max(az, o.p[i][1]) + r) / Z); c++) { const k = a * 100003 + c; (GS.get(k) || GS.set(k, []).get(k)).push(g); } } const KO = []; for (const e of daten.einschnitte) for (const k of e.ko || []) if (!KO.some(q => Math.hypot(q[0] - k[0], q[1] - k[1]) < 1)) KO.push(k);
      for (const e of daten.einschnitte) { const P = e.p; let s = 0, bd = Infinity; e.s0 = 0;
        for (let i = 1; i < P.length; i++) { const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, q = dx * dx + dz * dz, l = Math.sqrt(q); if (l < 0.01) continue; const t = Math.min(1, Math.max(0, ((e.m[0] - ax) * dx + (e.m[1] - az) * dz) / q)), d = Math.hypot(ax + dx * t - e.m[0], az + dz * t - e.m[1]); if (d < bd) { bd = d; e.s0 = s + t * l; }
          const g = { e, ax, az, dx, dz, q, l, s }, r = e.hb + BANK; for (let a = Math.floor((Math.min(ax, P[i][0]) - r) / Z); a <= Math.floor((Math.max(ax, P[i][0]) + r) / Z); a++) for (let c = Math.floor((Math.min(az, P[i][1]) - r) / Z); c <= Math.floor((Math.max(az, P[i][1]) + r) / Z); c++) { const k = a * 100003 + c; (G.get(k) || G.set(k, []).get(k)).push(g); } s += l; } }
      this.einschnittTiefe = (x, z) => { const L = G.get(Math.floor(x / Z) * 100003 + Math.floor(z / Z)); if (!L) return 0; let tief = 0;
        for (const g of L) { const e = g.e, t = Math.min(1, Math.max(0, ((x - g.ax) * g.dx + (z - g.az) * g.dz) / g.q)), d = Math.hypot(g.ax + g.dx * t - x, g.az + g.dz * t - z); if (d >= e.hb + BANK) continue;
          const sd = g.s + t * g.l - e.s0, a = Math.abs(sd) - e.pl, rl = sd < 0 ? e.ra : e.rb; if (a >= rl) continue; let f = a <= 0 ? 1 : 1 - a / rl; if (d > e.hb) { const u = 1 - (d - e.hb) / BANK; f *= u * u * (3 - 2 * u); } if (f * e.t > tief) tief = f * e.t; }
        // Widerlager: hinter dem Brückenende (in Richtung der Zufahrt) bleibt das Gelände auf Straßenhöhe, davor fällt es auf 4 m in den Einschnitt
        if (tief > 0) for (const k of KO) { const dx = x - k[0], dz = z - k[1], laengs = dx * k[2] + dz * k[3]; if (laengs < -4 || laengs > 45) continue; const quer = Math.abs(dx * k[3] - dz * k[2]); if (quer > k[4] + 4) continue; const u = Math.max(Math.min(1, Math.max(0, -laengs / 4)), Math.min(1, Math.max(0, (quer - k[4]) / 4))); tief *= u * u * (3 - 2 * u); if (tief <= 0) return 0; }
        if (tief > 0 && this.wasserFest(x, z)) return 0;   // Gewässer mit festem Pegel behalten ihr Bett
        if (tief > 0) { const S = GS.get(Math.floor(x / Z) * 100003 + Math.floor(z / Z)); if (S) for (const g of S) { const t = Math.min(1, Math.max(0, ((x - g.ax) * g.dx + (z - g.az) * g.dz) / g.q)), d = Math.hypot(g.ax + g.dx * t - x, g.az + g.dz * t - z); if (d < g.w + 2.5) { if (d <= g.w) return 0; const u = (d - g.w) / 2.5; tief *= u * u * (3 - 2 * u); } } }   // Straßen am Boden daneben: Stützmauer
        return tief; };
      this.Hboden = (x, z) => H0(x, z) - this.einschnittTiefe(x, z); this.H = this.Hboden; }
    if (daten.bruecken?.length) { this.brueckenFeld = new BrueckenFeld(daten.bruecken, (x, z) => (this.wasserFest(x, z) ? this.pegel(x, z) : this.Hboden(x, z)), daten.meta.groesse / 2, { land: this.Hboden, wasser: (x, z) => this.wasserFest(x, z), altStadt: ['mittel', 'mitte', 'mittelmeer', 'nordsee', 'ost', 'sued', 'skandi', 'west'].includes(daten.meta?.region) }); this.H = this.brueckenFeld.H; this.Hz = this.brueckenFeld.Hz;   // Brücken über Wasser (kit/bruecke.js): oben fahren, unten bleibt das Gelände
      // Gelände an den Brückenköpfen auf die Höhe der Brücke (Nr. 106, BrueckenFeld.koepfe): gewichtetes Mittel, wenn mehrere Köpfe nah beieinander liegen
      const KO = this.brueckenFeld.koepfe(); if (KO.length && this.mitGelaende) { const H0 = this.Hboden, Z = 48, G = new Map(); for (const k of KO) for (let a = Math.floor((k.x - k.r1) / Z); a <= Math.floor((k.x + k.r1) / Z); a++) for (let c = Math.floor((k.z - k.r1) / Z); c <= Math.floor((k.z + k.r1) / Z); c++) { const q = a * 100003 + c; (G.get(q) || G.set(q, []).get(q)).push(k); }
        this.Hboden = (x, z) => { const h = H0(x, z), L = G.get(Math.floor(x / Z) * 100003 + Math.floor(z / Z)); if (!L) return h; let sw = 0, sy = 0, wm = 0; for (const k of L) { const d = Math.hypot(x - k.x, z - k.z); if (d >= k.r1) continue; const u = d <= k.r0 ? 1 : 1 - (d - k.r0) / (k.r1 - k.r0), w = u * u * (3 - 2 * u), wi = w / (d * d + 4); sw += wi; sy += wi * k.y; if (w > wm) wm = w; } return sw > 0 ? h + (sy / sw - h) * wm : h; }; if (this.H === H0) this.H = this.Hboden; } }   // nach Abstand gewichtet: nah am Kopf gilt seine Höhe (mehrere Köpfe im Umkreis mittelten sich sonst zu einer Höhe, die zu keinem passt)
    if (daten.tunnel?.length) { const TF = this.tunnelFeld = new TunnelFeld(daten.tunnel, this.Hboden, daten.meta.groesse / 2), H0 = this.H, Hz0 = this.Hz || ((x, z) => H0(x, z)); this.H = (x, z) => TF.H(x, z, H0); this.Hz = (x, z, yAlt) => TF.Hz(x, z, yAlt, Hz0); }   // Straßentunnel (kit/tunnel.js, Nr. 98): im Trog der Trogboden, in der Röhre bleibt unten, wer unten ist
    this.gruppe = new THREE.Group();
    this.nahVoll = mobil ? 0 : 105;        // bis hier (Abstand zum Viertel) Häuser in voller Tiefe (Laibungen, Rahmen, Sprossen) wie an der Kreuzung
    this.nahMittel = mobil ? 95 : 300;   // bis hier die leichte Fassung des Generators, dahinter Kisten mit Shader Fassade (03.11.2026 weiter: der Wechsel zur Kiste fiel beim Fahren auf, Nader "Die Gebäude verändern sich")
    this.waende = new Set(['putz', 'putzSand', 'putzGrau', 'sandstein', 'ziegel', 'beton', 'platten', 'kupfer', 'weiss', 'glasDunkel', 'granit', 'schiefer', 'technikDunkel', 'sichtbeton'].map(k => mats[k]).filter(Boolean));

    this.baumNah = mobil ? 40 : 110;       // Nr. 103: am Rechner bis 110 m echte Bäume (vorher 70: aus 40 m Höhe sah man fast nur flache Kreuzkarten). Bis hier volle Bäume (Abstand mit Höhe), dahinter Impostor (seit 28.10.2026 nachts enger: 160 m kosteten 160.000 Dreiecke)
    this.instanzen = [];                  // Stadtmöbel, Laternen, Ampeln, Baumscheiben: Instanzen nur im Umkreis (instanzenVerteilen)
    this.halb = daten.meta.groesse / 2;
    this.unten = this.mitGelaende ? Math.min(UNTEN, (daten.gelaende?.hMin ?? 0) - 0.6) : UNTEN;   // Höhe der Bodenplatte unter dem Ort (ortSzene)
    if (tief) this.unten = Math.min(this.unten, (daten.gelaende?.hMin ?? 0) - tief);   // auf der Kugel: Schürze bis tief unter den Rand, gegen Spalten zum Gelände
    if (this.pegelMin < this.unten + 1.6) this.unten = this.pegelMin - 1.6;   // Bodenplatte unter das tiefste Wasser (Nr. 106)
    const M = this.m = {
      strasse: mats.asphalt, block: mats.gehweg, bord: mats.granit,
      platz: mitVersatz(Math.abs(Math.round((daten.meta?.lat || 0) * 7) + Math.round((daten.meta?.lon || 0) * 3)) % 3 === 2 ? texMat('pflaster_fisch', { tint: 0xa8a297, normal: 0.8, staerke: 0.65, korn: 0.5 }) : texMat('pflaster_rechteck', { tint: 0xb4afa5, normal: 0.7, staerke: 0.6, korn: 0.5 }), -1),   // Plätze: Natursteinplatten oder Fischgrät je Gegend (vorher Bruchstein, wirkte wie ein Mosaik)
      gruen: mitVersatz(texMat('rasen', { tint: 0x5f7040, normal: 0.9, staerke: 0.95, flecken: 0.6 }), -1.5),   // über dem Platz (Beete liegen seit Nr. 103 auf geschlossenen Plätzen), unter den Wegen (-2)
        // Rasen statt grüner Kies
      sand: mitVersatz(texMat('sand_fein', { tint: 0xd9c49a, normal: 0.6, staerke: 0.7 }), -1),
      pfad: mitVersatz(daten.gebaeude.length < 80 ? texMat('erde_park', { tint: 0x9c8664, normal: 0.8, staerke: 0.7 }) : texMat('gehweg_platten', { tint: 0x9d978d, normal: 0.6, staerke: 0.5 }), -2),   // auf dem Land Erdwege statt Gehwegplatten
      rad: mitVersatz(texMat('asphalt', { tint: RAD_ROT.has(daten.meta?.iso) ? 0x86493d : 0x74726d, normal: 0.6, staerke: 0.45 }), -2),   // rot nur, wo Radwege in echt rot sind, sonst heller Asphalt (07.11.2026: in Paris lagen rote Bänder über der Straße)
      wasser: wasserMat || new THREE.MeshStandardMaterial({ color: 0x08202a, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.3 }),   // auf der Erde der Shader des Meeres (kit/erde.js wasserMaterial), sonst dunkel mit Spiegelung
      stele: new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 0.9 }),
      mast: mats.technikDunkel,
      beton: mats.sichtbeton || mats.beton, dach: mats.technik,
    };
    // Berliner Gehweg (Wunsch Nr. 107, Runde 2, kit/bodenbau.js): ein Material für Bordstein, Mosaik und Platten, die Bänder kommen aus der Abstandskarte des Ortes
    if (BODEN107 && daten.gehweg?.karte) { const k = daten.gehweg.karte, bt = new THREE.DataTexture(k.d, k.n, k.n, THREE.RedFormat, THREE.HalfFloatType); bt.magFilter = bt.minFilter = THREE.LinearFilter; bt.needsUpdate = true; this.bordTex = bt; M.gehweg = mitVersatz(gehwegMat({ tex: bt, lage: new THREE.Vector3(k.x0, k.z0, 1 / (k.n * k.s)) }), -3); }
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
    if (this.brueckenFeld) { const m = this.mats, B = brueckenBauen(this.brueckenFeld, { fahr: this.m.strasse, geh: this.m.platz || m.beton, beton: m.sichtbeton || m.beton, stein: m.sandstein || m.beton, stahl: m.technikDunkel, seil: m.technik || m.technikDunkel, mark: m.markierung }, { mobil: this.mobil, regel: this.stuetzenRegel = stuetzenRegel(this.daten, { gleise: (this.daten.gleise || []).filter(g => !g.br).map(g => g.p) }) }); this.gruppe.add(B.gruppe); this.brueckenRails = B.rails; this.brueckenGruppe = B.gruppe; } if (this.daten.flussLinien?.length && this.pegelFluss?.some(Boolean)) { this.flussschiffe = new Flussschiffe(this, this.daten.flussLinien, { mobil: this.mobil }); if (this.flussschiffe.schiffe.length) this.gruppe.add(this.flussschiffe.gruppe); } if (this.istWildnis) { this.wildnis = new Wildnis(this, this.fotoU, { mobil: this.mobil }); this.gruppe.add(this.wildnis.gruppe); } if (this.fotoMats.length) { this.waldleben = new Waldleben(this, { mobil: this.mobil }); this.gruppe.add(this.waldleben.gruppe); } if (this.fotoMats.length && this.daten.freizeit) { this.freizeit = new Freizeit(this, { mobil: this.mobil, flaeche, drapiere }); try { this.werbung = new Werbung(this, { mobil: this.mobil }); this.gruppe.add(this.werbung.gruppe); if (this.daten.freizeit?.militaer) { this.militaer = new Militaer(this, this.daten.freizeit.militaer, { mobil: this.mobil }); this.gruppe.add(this.militaer.gruppe); } this.kleintiere = new Kleintiere(this, { mobil: this.mobil }); this.gruppe.add(this.kleintiere.gruppe); } catch (e) { console.warn('Werbung', e); } this.gruppe.add(this.freizeit.gruppe); } if (this.fotoMats.length && this.daten.gleise?.length) { this.bahn = new Bahn(this, { mobil: this.mobil }); this.gruppe.add(this.bahn.gruppe); } if (this.fotoMats.length && this.daten.flughafen) { this.flughafen = new Flughafen(this, { mobil: this.mobil }); this.gruppe.add(this.flughafen.gruppe); } if (this.fotoMats.length && this.daten.hafen) { this.hafen = new Hafen(this, { mobil: this.mobil }); this.gruppe.add(this.hafen.gruppe); } if (this.daten.meta?.lat != null && mauerNah(this.daten.meta.lat, this.daten.meta.lon)) { this.mauer = new Mauer(this, { mobil: this.mobil }); this.gruppe.add(this.mauer.gruppe); } if (this.daten.freizeit?.rummel || this.daten.freizeit?.golf) { this.rummel = new Rummel(this, { mobil: this.mobil }); this.gruppe.add(this.rummel.gruppe); } if (this.fotoMats.length && (this.daten.waldKarte || this.istWildnis)) { this.wild = new Wildtiere(this, { mobil: this.mobil }); this.gruppe.add(this.wild.gruppe); } if (this.fotoMats.length && this.daten.baukraene?.length) { this.kraene = new Baukraene(this, { mobil: this.mobil }); this.gruppe.add(this.kraene.gruppe); } }
  entsorgen() {
    this.kraene?.entsorgen();
    this.mauer?.entsorgen(); this.rummel?.entsorgen(); this.bahn?.entsorgen(); this.flussschiffe?.entsorgen(); this.flughafen?.entsorgen(); this.hafen?.entsorgen(); this.wild?.entsorgen(); this.freizeit?.entsorgen(); this.werbung?.entsorgen(); this.militaer?.entsorgen(); this.kleintiere?.entsorgen(); this.waldleben?.entsorgen(); this.wildnis?.entsorgen(); this.brueckenGruppe?.traverse(o => o.geometry?.dispose()); this.autobahnGruppe?.traverse(o => { o.geometry?.dispose(); if (o.material?.map) o.material.dispose(); });
    this.gras?.entsorgen(); this.bordTex?.dispose(); this.m.gehweg?.dispose();
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
    // Abrieb in den Fahrspuren (Nr. 107, Runde 2): Bänder aus dem Ortsbau, knapp über der Fahrbahn. Am Handy nur, wo der Berliner Gehweg dafür Aufrufe spart
    // Am Handy keine Radspurbänder: durchsichtige Flächen über jeder Fahrspur kosten dort Füllrate, am echten Gerät nicht gemessen
    if (BODEN107 && D.radspuren && !this.mobil) { const R = D.radspuren, nR = R.pos.length / 2, rp = new Float32Array(nR * 3), Hb = this.mitGelaende ? this.Hboden : null;
      for (let i = 0; i < nR; i++) { const x = R.pos[i * 2], z = R.pos[i * 2 + 1]; rp[i * 3] = x; rp[i * 3 + 1] = 0.02 + (Hb ? Hb(x, z) : 0); rp[i * 3 + 2] = z; }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aQuer', new THREE.BufferAttribute(R.quer, 1)); rg.setAttribute('aStark', new THREE.BufferAttribute(R.staerke, 1)); rg.setIndex(new THREE.BufferAttribute(R.index, 1));
      const rm = new THREE.Mesh(rg, spurMat()); rm.name = 'radspuren'; rm.renderOrder = 1; this.gruppe.add(rm); }
    add(flaeche(D.bloecke, BORD), M.block); yield;
    add(flaeche(D.plaetze, BORD), M.platz);
    add(flaeche(D.gruen, BORD), M.gruen);
    if (D.sand?.length) add(flaeche(D.sand, BORD), M.sand);
    if (D.freizeit?.golf) { M.golfRasen ||= mitVersatz(texMat('sand_fein', { tint: 0x5f8f3e, normal: 0.25, staerke: 0.3 }), -1); add(flaeche(D.freizeit.golf.gruene, BORD), M.golfRasen); add(flaeche(D.freizeit.golf.sande, BORD), M.sand); }
    add(flaeche(D.pfade, BORD), M.pfad);
    add(flaeche(D.radwege, BORD), M.rad);
    if (D.vorfeld?.length) { M.vorfeld ||= mitVersatz(texMat('beton_platz', { tint: 0x87857e, normal: 0.7, staerke: 0.65 }), -3); add(flaeche(D.vorfeld, BORD + 0.02), M.vorfeld); }   // Vorfelder der Flughäfen
    const amMeer = !!D.meta?.amMeer && !!this.mitGelaende;
    if (D.wasser.length) {
      const frei = D.wasser.filter((w, i) => this.pegelStand[i] == null), fest = D.wasser.map((w, i) => [w, this.pegelStand[i]]).filter(q => q[1] != null);
      if (frei.length) { const gw = flaeche(frei, amMeer ? D.meta.meerY - 0.8 : WASSER); if (amMeer) gw.userData.gehoben = true; this.wasserMesh = add(gw, M.wasser, false); }   // am Meer liegt die Fläche als Rückfall unter dem Wellennetz (kit/meer.js)
      if (fest.length) {   // Pegel (Nr. 106): ebene Fläche je Gewässer, Kaimauer vom Wasser bis zur Uferkante
        const pos = [], uv = [], idx = []; for (const [w, y] of fest) if (w[0].length >= 3) dreieckeOben(w, y, pos, uv, idx);
        const gw = new THREE.BufferGeometry(); gw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gw.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gw.setIndex(idx); gw.computeVertexNormals(); gw.userData.gehoben = true;
        const wm = add(gw, M.wasser, false); this.wasserMesh ||= wm;
        const kp = [], kn = [], ku = [], hG = (x, z) => this.mitGelaende ? this.Hboden(x, z) : 0;
        for (const [w, y] of fest) for (const ring of [orient(w[0]), ...w.slice(1).map(l => orient(l).reverse())]) { let lauf = 0;
          for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
            if ((ist(a[0]) && ist(b[0]) && Math.abs(a[0] - b[0]) < 0.05) || (ist(a[1]) && ist(b[1]) && Math.abs(a[1] - b[1]) < 0.05)) { lauf += L; continue; }   // Rand des Ausschnitts: dort geht das Wasser weiter
            const ya = hG(a[0], a[1]) + BORD + 0.01, yb = hG(b[0], b[1]) + BORD + 0.01, y0 = y - 1.2; if (Math.max(ya, yb) - y < 0.06) { lauf += L; continue; }
            const n = edgeNormal(a, b), nx = -n[0], nz = -n[1];   // Mauer schaut ins Wasser
            const P = [[a, y0, 0], [b, y0, L], [b, yb, L], [a, ya, 0]], hW = Math.max(0.1, ya - y0), cx = -(b[1] - a[1]) * hW, cz = (b[0] - a[0]) * hW;   // Wicklung zur Normale wie wand()
            for (const j of cx * nx + cz * nz >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { const q = P[j]; kp.push(q[0][0], q[1], q[0][1]); kn.push(nx, 0, nz); ku.push(lauf + q[2], q[1]); }
            lauf += L; } }
        if (kp.length) { const kg = geoAus(kp, kn, ku); kg.userData.gehoben = true; const km = add(kg, this.mats.steinBlock || this.mats.sandstein || M.bord); km.name = 'kaimauer'; }
      }
    }
    yield;
    // Bordsteine, Kaimauern am Wasser, Schürze am Rand des Ausschnitts
    const wasserIn = (x, z) => D.wasser.some(w => inside(w[0], x, z) && !w.slice(1).some(l => inside(l, x, z)));
    const pos = [], nor = [], uv = [], oben = [], onor = [], ouv = [], rpos = [], rnor = [], ruv = [];
    // Berliner Gehweg: Bordstein oben, Stirnseite und Ufermauern liegen mit der Gehwegfläche in einem Mesh (ein Zeichenaufruf statt drei)
    const GB = !!M.gehweg, gP = [], gN = [], gU = [], gA = [];
    const wandG = (a, b, y0, y1, n, lauf, art) => { const i0 = gU.length; wand(gP, gN, gU, a, b, y0, y1, n); for (let k = i0; k < gU.length; k += 2) gU[k] += lauf; for (let k = 0; k < 6; k++) gA.push(art); };
    const SOCKEL = -1000;   // Schürze am Rand: unten bis zur Bodenplatte (mit Gelände tiefer als der tiefste Punkt), oben aufs Gelände
    let tS = performance.now();   // Bau in Scheiben: spätestens nach 10 ms eine Pause (Bordsteine einer großen Stadt brauchten 53 ms am Stück)
    // Autobahn (Nr. 111): am Rand der Autobahn liegt kein Granitbordstein, das Grün beginnt an der Fahrbahn
    const abZ = (D.autobahn?.zone || []).map(P => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of P[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return { P, x0, z0, x1, z1 }; });
    const abDrin = abZ.length ? (x, z) => abZ.some(q => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inside(q.P[0], x, z) && !q.P.slice(1).some(r => inside(r, x, z))) : null;
    const ringe = function* (polys, istBlock) {
      for (const [aussen, ...loecher] of polys) {
        if (performance.now() - tS > 10) { yield; tS = performance.now(); }
        for (const r of [orient(aussen), ...loecher.map(l => orient(l).reverse())]) {
          let lauf = 0;   // Lage entlang des Rings: die Bordsteine des Berliner Gehwegs laufen damit durch
          for (let i = 0; i < r.length; i++) {
            const a = r[i], b = r[(i + 1) % r.length], n = edgeNormal(a, b), L = Math.hypot(b[0] - a[0], b[1] - a[1]), l0 = lauf; lauf += L;
            const randX = ist(a[0]) && ist(b[0]) && Math.abs(a[0] - b[0]) < 0.05, randZ = ist(a[1]) && ist(b[1]) && Math.abs(a[1] - b[1]) < 0.05;
            const y1 = istBlock ? BORD : 0;
            if (randX || randZ) { wand(rpos, rnor, ruv, a, b, SOCKEL, y1, n); continue; }
            if (!istBlock) continue;
            const mx = (a[0] + b[0]) / 2 + n[0] * 0.6, mz = (a[1] + b[1]) / 2 + n[1] * 0.6;
            if (D.wasser.length && wasserIn(mx, mz)) { if (GB) wandG(a, b, amMeer ? -4 : WASSER - 0.2, BORD, n, l0, -2); else wand(pos, nor, uv, a, b, amMeer ? -4 : WASSER - 0.2, BORD, n); continue; }
            if (GB) wandG(a, b, 0, BORD, n, l0, -1); else wand(pos, nor, uv, a, b, 0, BORD, n);
            // Bordsteinkante oben: 25 cm Granit
            if (L > 0.3 && !(abDrin && abDrin((a[0] + b[0]) / 2 - n[0] * 0.9, (a[1] + b[1]) / 2 - n[1] * 0.9))) {
              const ai = [a[0] - n[0] * 0.25, a[1] - n[1] * 0.25], bi = [b[0] - n[0] * 0.25, b[1] - n[1] * 0.25];
              if (GB) { const Q = [[a, l0, 0], [b, l0 + L, 0], [bi, l0 + L, 0.25], [ai, l0, 0.25]], hoch = (b[1] - a[1]) * (bi[0] - a[0]) - (b[0] - a[0]) * (bi[1] - a[1]) >= 0;   // Umlauf nach oben, UV entlang und quer zum Bordstein
                for (const j of hoch ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]) { const q = Q[j]; gP.push(q[0][0], BORD + 0.002, q[0][1]); gN.push(0, 1, 0); gU.push(q[1], q[2]); gA.push(-1); } }
              else for (const q of [a, b, bi, a, bi, ai]) { oben.push(q[0], BORD + 0.002, q[1]); onor.push(0, 1, 0); ouv.push(q[0], q[1]); }
            }
          }
        }
      }
    };
    yield* ringe(D.bloecke, true); yield* ringe(D.strasse, false);
    yield;
    if (this.mitGelaende) { hebe(pos, this.Hboden); yield; hebe(oben, this.Hboden); hebe(gP, this.Hboden); }
    if (GB) {   // Gehwegfläche aus dem Ortsbau (aufs Gelände gelegt) und die Bordsteine dazu
      const Z = D.gehweg, zp = new Float32Array(Z.n * 3); for (let i = 0; i < Z.n; i++) { zp[i * 3] = Z.pos[i * 2]; zp[i * 3 + 1] = BORD; zp[i * 3 + 2] = Z.pos[i * 2 + 1]; }
      let zg = new THREE.BufferGeometry(); zg.setAttribute('position', new THREE.BufferAttribute(zp, 3)); zg.setAttribute('uv', new THREE.BufferAttribute(Z.uv, 2)); zg.setAttribute('aArt', new THREE.BufferAttribute(Z.art, 1));
      if (this.mitGelaende) { zg = drapiere(zg, this.Hboden); yield; }
      const zP = zg.attributes.position.array, zU = zg.attributes.uv.array, zA = zg.attributes.aArt.array, zN = zg.attributes.normal?.array, nz = zP.length / 3, ng = gP.length / 3;
      const P2 = new Float32Array((nz + ng) * 3), N2 = new Float32Array((nz + ng) * 3), U2 = new Float32Array((nz + ng) * 2), A2 = new Float32Array(nz + ng);
      P2.set(zP); P2.set(gP, nz * 3); U2.set(zU); U2.set(gU, nz * 2); A2.set(zA); A2.set(gA, nz); if (zN) N2.set(zN); else for (let i = 0; i < nz; i++) N2[i * 3 + 1] = 1; N2.set(gN, nz * 3);
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(P2, 3)); gg.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); gg.setAttribute('uv', new THREE.BufferAttribute(U2, 2)); gg.setAttribute('aArt', new THREE.BufferAttribute(A2, 1)); gg.userData.gehoben = true;
      add(gg, M.gehweg).name = 'gehweg'; yield;
    }
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
    if (oben.length) {   // mit Berliner Gehweg liegt der Bordstein schon in dessen Mesh
    const kante = geoAus(oben, onor, ouv); kante.userData.gehoben = true;
    // Dreiecke der Kante nach oben drehen
    const p = kante.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      const ny = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i]) - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]);
      if (ny < 0) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
    add(kante, mitVersatz(texMat('granit', { tint: 0x96938d, normal: 0.6, staerke: 0.5 }), -3));
    }
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
      if (l.art === 'rand') { for (let i = 0; i < l.p.length - 1; i++) { const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L > 0.01) quad((ax + bx) / 2, (az + bz) / 2, (bx - ax) / L, (bz - az) / L, L + 0.06, 0.3); } continue; }   // Autobahn: Randlinie durchgezogen, 30 cm (Nr. 111)
      const stA = l.art === 'spurA' ? 6 : 3, luA = l.art === 'spurA' ? 12 : 6;
      let rest = 0, an = true;   // Strich und Lücke laufen über Knicke weiter
      for (let i = 0; i < l.p.length - 1; i++) {
        const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        let s = 0;
        while (s < L) {
          const lang = (an ? stA : luA) - rest, e = Math.min(L, s + lang);
          if (an && e - s > 0.2) quad(ax + ux * (s + e) / 2, az + uz * (s + e) / 2, ux, uz, e - s, l.art === 'mitte' || l.art === 'spurA' ? 0.15 : 0.12);
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
    viele(fleck, fleckMaterial(0xffc58a, 0.2), D.laternen, false, 320); this.lampenFleck = this.instanzen[this.instanzen.length - 1].im;   // bei Tag ausgeblendet (update), sonst kosteten die Flecken Füllrate (Prüfung Nr. 103)
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
    if (D.autobahn && (D.autobahn.planken.length || D.autobahn.schilder.length)) { const B = autobahnBauen(D.autobahn, (x, z) => this.H(x, z), { mobil: this.mobil, berlin: Math.abs(D.meta.lat - 52.5) < 0.2 && Math.abs(D.meta.lon - 13.4) < 0.4, gruen: /usa|latam|japan|china|korea/.test(D.meta.region || ''), lat: D.meta.lat, lon: D.meta.lon, sockel: BORD }); this.gruppe.add(B.gruppe); this.autobahnGruppe = B.gruppe; this.autobahnRails = B.rails; }   // Schutzplanken, Leitpfosten, Schilderbrücken (Nr. 111)
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
    // Feste Stände auf großen Plätzen (Nr. 99 und 103): Imbiss mit Markise und dunkler Theke, Blumenstand mit Eimern voller Farben und Schirm. Theke zeigt nach +z (zum Weg)
    { const farbig = (g, f) => { const c = new Float32Array(g.attributes.position.count * 3); for (let k = 0; k < c.length; k += 3) c.set(f, k); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
      const I = art('imbiss'), B = art('blumen'), Mf = this.mats.stand ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
      if (I.length) { const t = [farbig(box(2.8, 2.35, 2.0, 0, 1.175, 0), [0.86, 0.83, 0.76]), farbig(box(3.3, 0.14, 2.6, 0, 2.42, 0.1), [0.3, 0.31, 0.33]), farbig(box(2.4, 0.95, 0.04, 0, 1.45, 1.02), [0.05, 0.06, 0.07]), farbig(box(2.6, 0.08, 0.5, 0, 1.0, 1.2), [0.62, 0.6, 0.56]), farbig(box(1.4, 0.32, 0.05, 0, 2.15, 1.32), [0.72, 0.12, 0.08])];
        for (let k = 0; k < 6; k++) { const m = box(0.5, 0.04, 0.95, -1.25 + k * 0.5, 2.05, 1.38); m.rotateX(0); t.push(farbig(m, k % 2 ? [0.92, 0.9, 0.86] : [0.7, 0.1, 0.07])); }
        viele(mergeGeometries(t), Mf, I, !this.mobil, 160); }
      if (B.length) { const t = [farbig(box(2.2, 0.75, 0.9, 0, 0.375, 0), [0.42, 0.28, 0.16]), farbig(zyl(0.03, 0.03, 2.4, 0.9, 1.2, -0.3, 6), [0.25, 0.25, 0.26])], F = [[0.85, 0.1, 0.12], [0.95, 0.75, 0.1], [0.9, 0.45, 0.65], [0.95, 0.94, 0.9], [0.5, 0.22, 0.62], [0.95, 0.45, 0.1]];
        for (let k = 0; k < 12; k++) { const x = -0.9 + (k % 6) * 0.36, z = (Math.floor(k / 6) - 0.5) * 0.38; t.push(farbig(zyl(0.13, 0.11, 0.26, x, 0.88, z, 8), [0.2, 0.22, 0.24]), farbig(zyl(0.17, 0.12, 0.16, x, 1.08, z, 8), F[(k * 5) % 6])); }
        const schirm = new THREE.ConeGeometry(1.4, 0.45, 8); schirm.translate(0.9, 2.45, -0.3); t.push(farbig(schirm.toNonIndexed(), [0.2, 0.42, 0.28]));
        viele(mergeGeometries(t), Mf, B, !this.mobil, 160); } }
    // Mülltonnen im Hof (Nr. 103): drei 240 Liter Tonnen an der Hauswand, Körper anthrazit, Deckel blau (Papier), gelb (Verpackung) und schwarz (Rest)
    { const T = art('tonne'); if (T.length) { const koerper = [], deckel = [], F = [[0.1, 0.24, 0.55], [0.8, 0.62, 0.08], [0.06, 0.06, 0.07]];
      for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.66; koerper.push(box(0.56, 0.96, 0.7, x, 0.5, 0.02), box(0.05, 0.12, 0.12, x - 0.22, 0.06, -0.3), box(0.05, 0.12, 0.12, x + 0.22, 0.06, -0.3)); const d = box(0.6, 0.06, 0.76, x, 1.01, 0.02), c = new Float32Array(d.attributes.position.count * 3); for (let k = 0; k < c.length; k += 3) c.set(F[i], k); d.setAttribute('color', new THREE.BufferAttribute(c, 3)); deckel.push(d); }
      viele(mergeGeometries(koerper), this.mats.tonne ||= new THREE.MeshStandardMaterial({ color: 0x2c3033, roughness: 0.72 }), T, !this.mobil, 70);
      viele(mergeGeometries(deckel), this.mats.tonneDeckel ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), T, false, 70); } }
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
    if (this.baumDichte === undefined) { const H_ = (this.daten.meta?.groesse || 1200); this.baumDichte = this.baumListe.length / (H_ * H_); this.baumNah = Math.min(this.baumNah, Math.max(this.mobil ? 24 : 40, Math.sqrt((this.mobil ? 14 : 90) / (Math.PI * Math.max(1e-6, this.baumDichte))))); }   // Rechner: rund 90 echte Bäume (je rund 2.300 Dreiecke)
    const r2 = this.baumNah * this.baumNah;
    // Erde: von oben zeigt das Satellitenbild den Wald, die fernen Baumbilder schrumpfen zwischen 250 und 380 m Kamerahöhe weich weg
    // (sonst leuchtete der Wald im Ort heller als der Fotowald ringsum)
    const kFern = this.fotoMats.length ? THREE.MathUtils.smoothstep(2600 - (cam.y - this.H(cam.x, cam.z)), 0, 900) : 1;
    for (const a of this.baumArten) { a.n = 0; a.f = 0; }
    const art = Object.fromEntries(this.baumArten.map(a => [a.id, a]));
    for (const b of this.baumListe) {
      const a = art[b.typ], nah = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 + (cam.y - 8) ** 2 * 0.35 < r2;   // Höhe zählt nur zu gut einem Drittel: von oben bleiben die nahen Bäume echt
      if (b.y0 === undefined) { b.y0 = BORD + this.H(b.x, b.z); const z = (Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233)) * 43758.5453) % 1; b.farbe = baumFarbe(b.ton, b.typ, this.daten.meta?.lat ?? 50, z, new THREE.Color()); }   // Höhe und Farbe einmal je Baum, nicht bei jeder Verteilung (Prüfung Nr. 103)
      P.set(b.x, b.y0, b.z); Q.setFromAxisAngle(Y, b.ry);
      const faerben = this.fotoMats.length > 0;
      if (nah) { const s = a.v.scale * b.h / a.def.hoehe; M.compose(P, Q, S.setScalar(s)); a.ast.setMatrixAt(a.n, M); a.blatt.setMatrixAt(a.n, M); if (faerben) a.blatt.setColorAt(a.n, b.farbe); a.n++; }
      else if (kFern > 0.02) { const s = a.fern.userData.impostor ? b.h / a.fern.userData.impostor * kFern : null; M.compose(P, Q, s ? S.setScalar(s) : S.set(b.h * 0.95 * kFern, b.h * kFern, b.h * 0.95 * kFern)); a.fern.setMatrixAt(a.f, M); if (b.ton !== undefined || faerben) a.fern.setColorAt(a.f, b.farbe); a.f++; }
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
        if (e.eingang >= 0) this.haeuser.push({ id: g.id, pts, y0: basis + (g.m || 0), h: wandHoehe(g), typ: z.typ, variant: z.variant, seed: (g.id || 1) % 9973, laeden: !!g.laden, eingang: e.eingang, fern: z.fern ?? null, vg: g.vg || null });
        else e.eingang = null;
      } else if (!g.rand && g.osm && (g.m || 0) < 0.5 && g.id && !globalThis.__ohneOsmTuer) {
        // Bekannte Gebäude (Nr. 112, 26.11.2026, Nader: "man kann in jedes Gebäude rein"): Teile am Boden ab 120 m² und 8 m Wandhöhe bekommen eine Haustür
        // an der Straßenkante, Bauweise und Höhe wie die Fassade des Teils (osmTeilPlan). Niedrige Teile bauen schlichte Wände ohne Tür
        const P = osmTeilPlan(g, pts);
        if (P.wandH >= 8 && P.A >= 120 && !P.nd) { const ke = eingangKante(pts, this.daten.bloecke); if (ke >= 0) { e.eingang = ke; this.haeuser.push({ id: g.id, pts, y0: basis + (g.m || 0), h: P.wandH, typ: P.typ, variant: P.variant, seed: (g.id || 1) % 9973, laeden: false, eingang: ke, fern: null, vg: P.vg }); } }
      }
    }
    // Fotofassaden bekannter Gebäude (kit/fotofassade.js, Nr. 113): die Schalen stehen einmal je Ort und sind in jeder Detailstufe zu sehen,
    // auch vor den Hauskisten der Ferne (am Handy schon ab 95 m). Die nahen Stufen entfernen nur die Vorbauten dahinter (haus)
    if (this.daten.fotofassaden?.length) { const FG = new THREE.Group(); FG.name = 'fotofassaden';
      for (const k of this.kacheln.values()) for (const e of k.liste) { const g = e.g; if (e.z.schlicht || g.osm?.nd) continue; const wH = g.osm ? osmTeilPlan(g, e.pts).wandH : wandHoehe(g); const sub = new THREE.Group(); sub.position.y = e.basis + (g.m || 0);
        if (fotoVorsatz(sub, this.daten.fotofassaden, e.pts, g.m || 0, wH, e.eingang, this.mobil)) { sub.updateMatrix(); sub.matrixAutoUpdate = false; FG.add(sub); } }
      if (FG.children.length) this.gruppe.add(FG); }
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
  // Pegel (Wunsch Nr. 106, 18.11.2026, Nader: "Fast alle Brücken sind immer noch kaputt", "dass Schiffe darunter auch herfahren können",
  // "Manchmal fährt man dadurch Wasser"). Vorher lag jede Wasserfläche 0,45 m unter dem Gelände und folgte dessen Rauschen: das Wasser stand auf
  // Straßenhöhe, 141 von 148 Berliner Brücken hatten unter 2 m Luft, manche lagen unter dem Wasserspiegel. Jetzt hat jedes Gewässer ohne Gefälle
  // einen festen, ebenen Pegel aus seinem Ufer: Flüsse, Kanäle und Hafenbecken (D.wasserFluss) 3,6 m unter der Uferkante (Spree: rund 3,4 m),
  // Seen und Teiche 0,4 m. Gewässer mit Gefälle (Bergflüsse, mehr als 7 m entlang des Ufers) bleiben auf dem Gelände.
  // pegel(x, z): Wasserspiegel an der Stelle. wasserFest(x, z): Fläche mit festem Pegel (Kollision: Autos und Figuren bleiben an der Kante)
  pegelBauen() {
    const D = this.daten, W = D.wasser || [], H = this.Hboden, halb = D.meta.groesse / 2, hG = (x, z) => (this.mitGelaende ? H(x, z) : 0);
    this.pegelStand = W.map(() => null); this.pegelFluss = W.map(() => false); this.pegelMin = Infinity; this.pegel = (x, z) => hG(x, z) + WASSER; this.wasserFest = () => false;
    if (!W.length || D.meta?.amMeer) return;
    const drin = (P, x, z) => inside(P[0], x, z) && !P.slice(1).some(l => inside(l, x, z)), F = D.wasserFluss || [], amRand = q => Math.abs(Math.abs(q[0]) - halb) < 0.05 || Math.abs(Math.abs(q[1]) - halb) < 0.05;
    // Je Gewässerfläche: Höhen entlang des Ufers, Anteil Fluss oder Kanal
    const T = W.map((P, i) => { const ufer = []; let nK = 0, nF = 0, k4 = 0;
      for (const ring of P) for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05 || (amRand(a) && amRand(b))) continue;
        const m = Math.max(1, Math.round(L / 8)), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let j = 0; j < m; j++) { const x = a[0] + (b[0] - a[0]) * j / m, z = a[1] + (b[1] - a[1]) * j / m; ufer.push(hG(x, z));
          if (F.length && k4++ % 4 === 0) for (const sgn of [2.5, -2.5]) { const px = x + nx * sgn, pz = z + nz * sgn; if (drin(P, px, pz)) { nK++; if (F.some(Q => drin(Q, px, pz))) nF++; break; } } } }
      if (ufer.length < 4) for (const ring of P) for (const v of ring) ufer.push(hG(v[0], v[1]));   // kleines Stück am Rand des Ausschnitts: alle Ecken
      return { ufer, nK, nF }; });
    // Raster 2 m über den Ausschnitt: Nummer der Gewässerfläche (0: keine). Zeilenweise füllen (gerade ungerade über alle Ringe)
    const Z = 2, n = Math.ceil(2 * halb / Z), R = new Uint16Array(n * n);
    for (let i = 0; i < W.length; i++) { let z0 = Infinity, z1 = -Infinity; for (const q of W[i][0]) { z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
      for (let j = Math.max(0, Math.floor((z0 + halb) / Z)); j <= Math.min(n - 1, Math.floor((z1 + halb) / Z)); j++) { const z = -halb + (j + 0.5) * Z, xs = [];
        for (const ring of W[i]) for (let k = 0, l = ring.length - 1; k < ring.length; l = k++) { const a = ring[k], b = ring[l]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])); }
        xs.sort((p, q) => p - q); for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] + halb) / Z - 0.5)), i1 = Math.min(n - 1, Math.floor((xs[k + 1] + halb) / Z - 0.5)); for (let c = i0; c <= i1; c++) R[j * n + c] = i + 1; } } }
    // Ein Gewässer, ein Pegel (18.11.2026): die Karte liefert Spree und Kanäle in Stücken (Kachelgrenzen, Brücken). Jedes Stück hatte seinen eigenen
    // Pegel aus seinen eigenen Ufern, an der Liebknechtbrücke lag ein Stück 2,8 m über dem nächsten (Wasserstufe, Brücke am Wasserspiegel). Stücke, die
    // sich im Raster berühren (bis 2 Zellen Abstand), sind ein Gewässer: Pegel aus allen Ufern zusammen
    const gr = W.map((_, i) => i), wurzel = i => { while (gr[i] !== i) i = gr[i] = gr[gr[i]]; return i; };
    for (let j = 0; j < n; j++) for (let c = 0; c < n; c++) { const a = R[j * n + c]; if (!a) continue;
      for (const [dc, dj] of [[1, 0], [2, 0], [0, 1], [0, 2], [1, 1], [-1, 1]]) { const cc = c + dc, jj = j + dj; if (cc < 0 || cc >= n || jj >= n) continue; const b = R[jj * n + cc]; if (b && b !== a) { const p = wurzel(a - 1), q = wurzel(b - 1); if (p !== q) gr[p] = q; } } }
    const gruppen = new Map(); for (let i = 0; i < W.length; i++) { const w = wurzel(i); (gruppen.get(w) || gruppen.set(w, []).get(w)).push(i); }
    for (const G of gruppen.values()) { const ufer = []; let nK = 0, nF = 0; for (const i of G) { for (const h of T[i].ufer) ufer.push(h); nK += T[i].nK; nF += T[i].nF; }
      if (!ufer.length) continue; ufer.sort((p, q) => p - q); const q = t => ufer[Math.min(ufer.length - 1, Math.floor(t * ufer.length))];
      if (q(0.5) - q(0.05) > 6.5) continue;   // Gefälle (Bergfluss): die untere Hälfte des Ufers streut stark. In der Stadt streut nur die obere Hälfte (das Höhenmodell enthält Häuser), die untere ist die Uferkante
      // Pegel: unter dem tiefsten Ufer (breite Flüsse löst das Höhenmodell auf, ihr tiefstes Ufer ist der echte Wasserspiegel) und bei Flüssen und
      // Kanälen mindestens 3,6 m unter der Uferkante (schmale Kanäle löst das Modell nicht auf, dort läge das Wasser sonst auf Straßenhöhe)
      const fluss = nK > 0 && nF / nK >= 0.5, stand = Math.min(q(0.02) - 0.3, q(0.15) - (fluss ? 3.6 : 0.4));
      for (const i of G) { this.pegelStand[i] = stand; this.pegelFluss[i] = fluss; } this.pegelMin = Math.min(this.pegelMin, stand); }
    if (!Number.isFinite(this.pegelMin)) return;
    for (let o = 0; o < R.length; o++) if (R[o] && this.pegelStand[R[o] - 1] == null) R[o] = 0;   // Flächen ohne festen Pegel liegen weiter auf dem Gelände
    const idx = (x, z) => { const c = Math.floor((x + halb) / Z), j = Math.floor((z + halb) / Z); return c < 0 || j < 0 || c >= n || j >= n ? 0 : R[j * n + c]; };
    this.pegel = (x, z) => { const k = idx(x, z); return k ? this.pegelStand[k - 1] : hG(x, z) + WASSER; };
    this.wasserFest = (x, z) => idx(x, z) > 0;
    // Uferanhebung: an Flüssen und Kanälen liegt jedes Ufer mindestens 3 m über dem Wasser. Das Höhenmodell verschmiert Fluss und Ufer, manche
    // Uferstraße lag darin auf Wasserhöhe (Brücken dort ohne Luft, Decks am Wasserspiegel). Raster 4 m: Abstand zum nächsten Flusswasser und dessen
    // Pegel (Ausbreitung in Ringen bis 60 m). Bis 20 m vom Wasser voll, dann auf 40 m verzogen. Nur anheben, nie absenken
    if (!this.mitGelaende || !this.pegelFluss.some(Boolean)) return;
    const U = 4, m = Math.ceil(2 * halb / U), dist = new Float32Array(m * m).fill(1e9), lvl = new Float32Array(m * m); let rand = [];
    for (let j = 0; j < m; j++) for (let c = 0; c < m; c++) { const k = idx(-halb + (c + 0.5) * U, -halb + (j + 0.5) * U); if (k && this.pegelFluss[k - 1]) { const o = j * m + c; dist[o] = 0; lvl[o] = this.pegelStand[k - 1]; rand.push(o); } }
    for (let d = U; d <= 60 && rand.length; d += U) { const neu = []; for (const o of rand) { const j = Math.floor(o / m), c = o - j * m; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const cc = c + a, jj = j + b; if (cc < 0 || jj < 0 || cc >= m || jj >= m) continue; const q = jj * m + cc; if (dist[q] > d) { dist[q] = d; lvl[q] = lvl[o]; neu.push(q); } } } rand = neu; }
    const H0 = this.Hboden; this.uferHeben = (x, z, h) => { const c = Math.floor((x + halb) / U), j = Math.floor((z + halb) / U); if (c < 0 || j < 0 || c >= m || j >= m) return h; const o = j * m + c, d = dist[o]; if (d <= 0 || d > 60) return h; const soll = lvl[o] + 3; if (h >= soll) return h; const u = d <= 20 ? 1 : 1 - (d - 20) / 40; return h + (soll - h) * u * u * (3 - 2 * u); };
    this.Hboden = (x, z) => this.uferHeben(x, z, H0(x, z)); this.H = this.Hboden;
  }
  // ein Haus mit dem Generator (oder schlicht, wenn es kein Haus mit Fenstern ist)
  haus({ g, pts, z, eingang = null, basis = 0, tief = 0 }, leicht) {
    if (g.osm) { try { const b = osmTeilBauen(this.mats, g, pts, basis, leicht || !!g.hinten, eingang); if (this.daten.fotofassaden?.length) fotoVorsatz(b, this.daten.fotofassaden, pts, g.m || 0, osmTeilPlan(g, pts).wandH, eingang, this.mobil, true); return b; } catch (e) { console.warn('OSM Teil', e.message); } }   // bekannte Gebäude aus OSM Teilen (Wunsch Nr. 83)
    const h = wandHoehe(g);
    if (z.schlicht) {
      const y0 = z.schlicht === 'dach' ? Math.max(g.m || 0, g.h - 0.5) : (g.m || 0);
      const mesh = new THREE.Mesh(fernGeoSchlicht(pts, basis + y0, basis + g.h), z.schlicht === 'dach' ? this.m.dach : this.m.beton);
      return mesh;
    }
    const seed = (g.id || 1) % 9973;
    let b;
    try { b = buildBuilding(this.mats, { pts, height: h, type: z.typ, variant: z.variant, seed, ohneLaden: (g.m || 0) > 0.5, laeden: !!g.laden, leicht: !!g.hinten, spar: leicht || !!g.hinten, eingang, dachEcht: g.dachFl ? { flaechen: g.dachFl, traufe: g.traufe, seed, rot: g.rot } : null, echt: !!g.echt, vorgabe: g.vg || null, kiez: g.kiez || null, fern: z.fern ?? null }); }   // hinten: Hinterhaus ohne Straßenfront (kit/ortbau.js), dachEcht: Dach aus dem Kataster
    catch (e) { console.warn('Haus', z.typ, e.message); return new THREE.Mesh(fernGeoSchlicht(pts, basis + (g.m || 0), basis + g.h), this.mats.putzGrau || this.m.beton); }   // ein Fehler im Generator darf nie den Ort kosten
    b.userData.id = g.id;
    let kaputt = false;
    b.traverse(o => { if (o.isMesh && !kaputt) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (!Number.isFinite(a[i] + a[i + 1] + a[i + 2])) { kaputt = true; break; } } });
    if (kaputt) return new THREE.Mesh(fernGeoSchlicht(pts, basis + (g.m || 0), basis + g.h), this.mats.putzGrau || this.m.beton);   // Höhe wie die Kiste (basis), sonst sprang das Haus am Hang (Prüfung Nr. 103)   // Grundriss, mit dem der Generator nicht klarkommt
    b.position.y = basis + (g.m || 0);
    if (this.daten.fotofassaden?.length) fotoVorsatz(b, this.daten.fotofassaden, pts, g.m || 0, h, eingang, this.mobil, true);   // Fotofassade bekannter Gebäude (Nr. 113)
    if (basis - tief > 0.2 && (g.m || 0) < 0.5) { const sockel = new THREE.Mesh(fernGeoSchlicht(pts, tief - basis - 0.3, 0.02), this.mats.sandstein || this.m.beton); sockel.name = 'sockel'; b.add(sockel); }   // Hanglage: Sockel bis zur tiefsten Ecke
    return b;
  }

  // Kacheln nach Abstand zur Kamera in drei Stufen (voll, mittel, fern) umschalten und nahe Kacheln Haus für Haus bauen
  // (höchstens rund 8 ms je Bild). Solange eine Stufe noch gebaut wird, bleibt die nächstbeste sichtbar, damit nichts aufploppt.
  update(cam, budget = 8) {   // budget: ms je Aufruf für den Hausbau (Vorbau vor dem Ortstausch nutzt weniger, dashboard/app.js)
    this.gras?.update(cam.position, this.H);
    { const an = NACHT.value > 0.01; if (this.lampenFleck) this.lampenFleck.visible = an; if (this.lampenHof) this.lampenHof.visible = an; }   // Laternenlicht nur in der Dämmerung und nachts zeichnen
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
