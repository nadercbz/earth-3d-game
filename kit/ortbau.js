// Kachel wird Ort (08_WELTBAU.md Phase 3, seit 29.10.2026): aus OpenFreeMap Vektorkacheln (OpenMapTiles, ODbL) entsteht für jede Stelle
// der Erde dasselbe Datenformat wie tools/ort_bauen.py aus dem OSM Auszug am Potsdamer Platz. So laufen kit/ort.js (Boden, Gebäude, Bäume),
// kit/traffic.js (Verkehr), kit/crowd.js (Menschen) und kit/interior.js (Innenräume) überall unverändert.
// Was die Kacheln nicht haben, kommt per Regel (04_REGELWERK.md, kit/regionen.js):
//   Häuser: die Kacheln fassen aneinander gebaute Häuser gleicher Höhe zu einem Umriss zusammen (Potsdamer Platz 155 statt rund 1.500).
//           Parzellenteilung zerlegt sie wieder (Schnitt quer zur langen Achse, durch Innenhöfe, bis zur Parzellengröße der Region).
//   Straßen: keine Breite und keine Spuren. Breite nach Klasse und Region, begrenzt durch den Abstand der Fassaden (Gehweg bleibt frei).
//   Ampeln, Überwege: an Kreuzungen nach Straßenrang. Bäume, Laternen: entlang der Straßen nach Region.
// Läuft im Worker (kit/ortbau.worker.js) und in Node (tools/ortbau_test.mjs). Clipper (clipper-lib, Boost Lizenz) kommt als Argument.
import { gebaeudeTyp, baumArt } from './regionen.js';

const S = 100;   // Clipper rechnet in Zentimetern
const r2 = v => Math.round(v * 100) / 100;
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- Geometrie ----------
const flaecheRing = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2; };
function innenRing(r, x, z) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const innenPoly = (P, x, z) => innenRing(P[0], x, z) && !P.slice(1).some(h => innenRing(h, x, z));
function laenge(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }
function punktBei(pts, s) {   // Punkt und Richtung bei Bogenlänge s
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === pts.length - 1) { const t = l > 1e-9 ? Math.min(1, s / l) : 0; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / (l || 1), dz: (b[1] - a[1]) / (l || 1) }; }
    s -= l;
  }
  return null;
}
function dichter(pts, maxL, zu = false) {   // Linie oder Ring auf höchstens maxL lange Stücke teilen
  const out = [], n = pts.length, m = zu ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(l / maxL));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  if (!zu) out.push(pts[n - 1]);
  return out;
}
// Linie seitlich versetzen (positiv = rechts von der Laufrichtung, rechts von (dx, dz) ist (-dz, dx)), Gehrung begrenzt
function versetzt(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    let n1x = 0, n1z = 0, n2x = 0, n2z = 0;
    if (i > 0) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; n1x = -(b[1] - a[1]) / l; n1z = (b[0] - a[0]) / l; }
    if (i < pts.length - 1) { const l = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1; n2x = -(c[1] - b[1]) / l; n2z = (c[0] - b[0]) / l; }
    if (i === 0) { n1x = n2x; n1z = n2z; } if (i === pts.length - 1) { n2x = n1x; n2z = n1z; }
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = d / Math.max(0.5, mx * n1x + mz * n1z);
    out.push([b[0] + mx * k, b[1] + mz * k]);
  }
  return out;
}
// Linie an einem Rechteck schneiden (Liang Barsky je Stück), liefert Teilstücke
function linieImRechteck(pts, x0, z0, x1, z1) {
  const out = []; let cur = null;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p; if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok) { if (cur) { out.push(cur); cur = null; } continue; }
    const A = [ax + dx * t0, az + dz * t0], B = [ax + dx * t1, az + dz * t1];
    if (!cur) cur = [A]; else if (t0 > 1e-9) { out.push(cur); cur = [A]; }
    cur.push(B);
    if (t1 < 1 - 1e-9) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter(l => l.length >= 2 && laenge(l) > 0.2);
}
// kleinstes umschließendes Rechteck (über die Kanten der konvexen Hülle)
function huelle(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), kreuz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && kreuz(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (hi.length >= 2 && kreuz(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function minRechteck(ring) {
  const h = huelle(ring); let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  if (best.u1 - best.u0 < best.v1 - best.v0) {   // lange Achse nach u
    const { ux, uz, u0, u1, v0, v1 } = best; best = { A: best.A, ux: -uz, uz: ux, u0: v0, u1: v1, v0: -u1, v1: -u0 };
  }
  best.L = best.u1 - best.u0; best.B = best.v1 - best.v0;
  return best;
}
// Grundriss säubern wie in tools/ort_bauen.py: Kanten unter 0,5 m, Nadelspitzen, Punkte auf einer Geraden
function saeubern(pts) {
  pts = pts.slice();
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  let geaendert = true;
  while (geaendert && pts.length > 3) {
    geaendert = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (ab < 0.5 || bc < 1e-6) { pts.splice(i, 1); geaendert = true; break; }
      const cosw = ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / (ab * bc);
      if (cosw > Math.cos(15 * Math.PI / 180) || cosw < Math.cos(177 * Math.PI / 180)) { pts.splice(i, 1); geaendert = true; break; }
    }
  }
  return pts;
}

// ---------- Raster Indizes für schnelle Abfragen ----------
const ZK = (a, b) => (a + 50000) * 100000 + (b + 50000);   // Rasterschlüssel als Zahl (schneller als Text)
class FlaechenIndex {   // Punkt in vielen Polygonen [[aussen, ...loecher], ...]
  constructor(polys, zelle = 25) {
    this.polys = polys; this.zelle = zelle; this.g = new Map();
    polys.forEach((P, i) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of P[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      for (let a = Math.floor(x0 / zelle); a <= Math.floor(x1 / zelle); a++) for (let b = Math.floor(z0 / zelle); b <= Math.floor(z1 / zelle); b++) { const k = ZK(a, b); (this.g.get(k) || this.g.set(k, []).get(k)).push(i); } });
  }
  enthaelt(x, z) { const l = this.g.get(ZK(Math.floor(x / this.zelle), Math.floor(z / this.zelle))); if (!l) return -1; for (const i of l) if (innenPoly(this.polys[i], x, z)) return i; return -1; }
}
class StreckenIndex {   // nächste Strecke zu einem Punkt; seit 29.10.2026 mit Stempeln statt Set je Abfrage (Tokio: Millionen Abfragen)
  constructor(zelle = 12) { this.zelle = zelle; this.g = new Map(); this.s = []; this.stempel = new Int32Array(4096); this.lauf = 0; }
  add(a, b, daten) {
    const i = this.s.length; this.s.push({ a, b, daten }); const z = this.zelle;
    if (i >= this.stempel.length) { const n = new Int32Array(this.stempel.length * 2); n.set(this.stempel); this.stempel = n; }
    for (let x = Math.floor(Math.min(a[0], b[0]) / z); x <= Math.floor(Math.max(a[0], b[0]) / z); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / z); y <= Math.floor(Math.max(a[1], b[1]) / z); y++) { const k = ZK(x, y); (this.g.get(k) || this.g.set(k, []).get(k)).push(i); }
  }
  naechste(x, z, maxD, filter) {
    const r = Math.ceil(maxD / this.zelle), cx = Math.floor(x / this.zelle), cz = Math.floor(z / this.zelle); let best = null, bd = maxD;
    const st = ++this.lauf, S = this.stempel;
    for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) { const l = this.g.get(ZK(a, b)); if (!l) continue; for (const i of l) {
      if (S[i] === st) continue; S[i] = st; const s = this.s[i]; if (filter && !filter(s)) continue;
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2));
      const px = s.a[0] + dx * t, pz = s.a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { d, t, x: px, z: pz, s, i }; }
    } }
    return best;
  }
  // Abstand entlang eines Strahls bis zur ersten Strecke (Fassaden für die Straßenbreite, Ränder für Überwege)
  strahl(x, z, dx, dz, maxD) {
    const z0 = this.zelle, x1 = x + dx * maxD, zz1 = z + dz * maxD; let best = maxD; const st = ++this.lauf, S = this.stempel;
    for (let a = Math.floor(Math.min(x, x1) / z0); a <= Math.floor(Math.max(x, x1) / z0); a++) for (let b = Math.floor(Math.min(z, zz1) / z0); b <= Math.floor(Math.max(z, zz1) / z0); b++) { const l = this.g.get(ZK(a, b)); if (!l) continue; for (const i of l) {
      if (S[i] === st) continue; S[i] = st; const s = this.s[i], ex = s.b[0] - s.a[0], ez = s.b[1] - s.a[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((s.a[0] - x) * ez - (s.a[1] - z) * ex) / den, u = ((s.a[0] - x) * dz - (s.a[1] - z) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    } }
    return best;
  }
}

// ---------- Clipper ----------
// Clipper 6.4.2 (JS) fügt lokale Minima und Scanlinien sortiert in einfach verkettete Listen ein, das ist quadratisch: bei Tokio
// (Vereinigung von tausenden Straßenstücken und Häusern) 3,5 von 6 Sekunden. Seit 29.10.2026: Minima sammeln und einmal sortieren,
// Scanlinien als binärer Heap (größtes Y zuerst, Doppelte beim Herausnehmen übersprungen). Ergebnis wie vorher, nur schneller.
function beschleunige(CL) {
  if (CL._schnell) return; CL._schnell = true;
  const B = {};   // ClipperLib.Inherit kopiert die Methoden der Basis in Clipper.prototype, darum unten in beide schreiben
  B.InsertLocalMinima = function (lm) { (this._lm || (this._lm = [])).push(lm); };
  B._lmListe = function () {
    if (!this._lm || !this._lm.length) return;
    const arr = this._lm; this._lm = [];
    for (let l = this.m_MinimaList; l !== null; l = l.Next) arr.push(l);
    arr.sort((a, b) => b.Y - a.Y);
    for (let i = 0; i < arr.length; i++) arr[i].Next = i + 1 < arr.length ? arr[i + 1] : null;
    this.m_MinimaList = arr[0];
  };
  B.DisposeLocalMinimaList = function () { this._lm = []; this.m_MinimaList = null; this.m_CurrentLM = null; };
  const reset = CL.ClipperBase.prototype.Reset;
  B.Reset = function () { this._lmListe(); this._sb = []; return reset.call(this); };
  B.InsertScanbeam = function (Y) {
    const h = this._sb || (this._sb = []); h.push(Y); let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p] >= h[i]) break; const t = h[p]; h[p] = h[i]; h[i] = t; i = p; }
  };
  const raus = h => {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l] > h[m]) m = l; if (r < h.length && h[r] > h[m]) m = r; if (m === i) break; const t = h[m]; h[m] = h[i]; h[i] = t; i = m; } }
    return top;
  };
  B.PopScanbeam = function (Y) { const h = this._sb; if (!h || !h.length) { Y.v = 0; return false; } const v = raus(h); while (h.length && h[0] === v) raus(h); Y.v = v; return true; };
  for (const P of [CL.ClipperBase.prototype, CL.Clipper.prototype]) Object.assign(P, B);
}
function clipperHelfer(CL) {
  beschleunige(CL);
  const zuC = ring => ring.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }));
  const vonC = p => p.map(q => [q.X / S, q.Y / S]);
  const polysZuC = polys => polys.flatMap(P => P.map(zuC));
  function ausfuehren(typ, subj, clip, { offen = false, baum = true, fuellung = CL.PolyFillType.pftNonZero } = {}) {
    const c = new CL.Clipper();
    if (subj.length) c.AddPaths(subj, CL.PolyType.ptSubject, !offen);
    if (clip && clip.length) c.AddPaths(clip, CL.PolyType.ptClip, true);
    if (offen) { const t = new CL.PolyTree(); c.Execute(typ, t, fuellung, fuellung); return CL.Clipper.OpenPathsFromPolyTree(t); }
    if (baum) { const t = new CL.PolyTree(); c.Execute(typ, t, fuellung, fuellung); return t; }
    const out = new CL.Paths(); c.Execute(typ, out, fuellung, fuellung); return out;
  }
  // PolyTree -> [[aussen, ...loecher], ...] in Metern
  function polys(baum, minA = 0.5) {
    const out = [];
    const geh = n => { for (const k of n.Childs()) { if (!k.IsHole()) { const P = [vonC(k.Contour())]; for (const h of k.Childs()) if (h.IsHole()) { P.push(vonC(h.Contour())); geh(h); } if (Math.abs(flaecheRing(P[0])) >= minA) out.push(P); } } };
    geh(baum); return out;
  }
  const H = {
    zuC, vonC, polysZuC, polys,
    vereinige: (paths, gerade = false) => ausfuehren(CL.ClipType.ctUnion, paths, null, { baum: false, fuellung: gerade ? CL.PolyFillType.pftEvenOdd : CL.PolyFillType.pftNonZero }),
    // Polygone (als Pfade) mit Löchern sauber machen: einzelnes Merkmal mit gerade/ungerade Regel
    normal: paths => ausfuehren(CL.ClipType.ctUnion, paths, null, { baum: false, fuellung: CL.PolyFillType.pftEvenOdd }),
    schneide: (a, b) => ausfuehren(CL.ClipType.ctIntersection, a, b, { baum: false }),
    ohne: (a, b) => ausfuehren(CL.ClipType.ctDifference, a, b, { baum: false }),
    schneideBaum: (a, b) => ausfuehren(CL.ClipType.ctIntersection, a, b),
    ohneBaum: (a, b) => ausfuehren(CL.ClipType.ctDifference, a, b),
    baum: paths => ausfuehren(CL.ClipType.ctUnion, paths, null),
    linienIn: (linien, flaeche) => ausfuehren(CL.ClipType.ctIntersection, linien, flaeche, { offen: true }),
    versatz(paths, d, { offen = false, rund = true, butt = false } = {}) {
      if (!paths.length) return [];
      const co = new CL.ClipperOffset(2, 20);
      co.AddPaths(paths, rund ? CL.JoinType.jtRound : CL.JoinType.jtMiter, offen ? (butt ? CL.EndType.etOpenButt : CL.EndType.etOpenRound) : CL.EndType.etClosedPolygon);
      const out = new CL.Paths(); co.Execute(out, d * S); return out;
    },
    flaeche: paths => paths.reduce((a, p) => a + CL.Clipper.Area(p), 0) / (S * S),
  };
  return H;
}

// ---------- Tabellen (wie tools/ort_bauen.py) ----------
const FAHR = { motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, residential: 7, living_street: 5.5, service: 4.5, busway: 7,
  motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6 };
const RANG = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 2, busway: 3, living_street: 1, service: 0,
  motorway_link: 6, trunk_link: 5, primary_link: 4, secondary_link: 3, tertiary_link: 2 };
const KLASSE_HW = { motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', minor: 'residential', service: 'service', busway: 'busway' };
const LADEN = new Set(['shop', 'clothing_store', 'grocery', 'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream', 'bakery', 'butcher', 'alcohol_shop', 'books', 'jewelry',
  'mobile_phone', 'furniture', 'hairdresser', 'pharmacy', 'bank', 'laundry', 'florist', 'optician', 'shoes', 'electronics', 'gift', 'convenience', 'supermarket', 'deli', 'beer',
  'wine', 'music', 'toys', 'sports', 'beauty', 'cosmetics', 'chemist', 'department_store', 'mall', 'stationery', 'kiosk', 'hardware', 'doityourself', 'garden_centre', 'pet', 'bicycle', 'car', 'computer']);

// ---------- Hauptfunktion ----------
// kacheln: [{ z, x, y, schichten }] (kit/mvt.js), lat/lon: Mitte, halb: halbe Kantenlänge (Meter), reg: region(), land: landAn()
// hoehe(x, z): Gelände in Metern über der Mitte (0 ohne Gelände), seed: fester Zufall, stand: Kartenstand
export function baueOrt({ CL, kacheln, lat, lon, halb = 600, reg, land = {}, hoehe = null, seed = 7, stand = '', name = '' }) {
  const C = clipperHelfer(CL), R = rng(seed * 7919 + 13), T0 = Date.now(), zeit = {};
  const mark = n => { zeit[n] = Date.now() - T0; };
  const phi = lat * Math.PI / 180;
  const K_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), K_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  const xy = (lo, la) => [(lo - lon) * K_LON, -(la - lat) * K_LAT];
  const H = halb, KERN = [C.zuC([[-H, -H], [H, -H], [H, H], [-H, H]])];
  const im = (x, z, m = 0) => Math.abs(x) < H - m && Math.abs(z) < H - m;
  const hoeheAn = hoehe || (() => 0);

  // 1. Merkmale aller Kacheln in Meter, jede Kachel auf ihr eigenes Rechteck geschnitten (die Kacheln haben einen Rand, der sich überlappt)
  const L = { building: [], transportation: [], water: [], waterway: [], landcover: [], landuse: [], poi: [], park: [] };
  for (const k of kacheln) {
    const n = 2 ** k.z, lonVon = px => (k.x + px) / n * 360 - 180, latVon = py => Math.atan(Math.sinh(Math.PI * (1 - 2 * (k.y + py) / n))) * 180 / Math.PI;
    const [xa, za] = xy(lonVon(0), latVon(0)), [xb, zb] = xy(lonVon(1), latVon(1));
    const rect = [C.zuC([[xa, za], [xb, za], [xb, zb], [xa, zb]])], x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    if (x1 < -H - 80 || x0 > H + 80 || z1 < -H - 80 || z0 > H + 80) continue;
    for (const name of Object.keys(L)) {
      const s = k.schichten[name]; if (!s) continue; const ext = s.extent;
      for (const f of s.merkmale) {
        const g = f.g.map(ring => ring.map(([px, py]) => xy(lonVon(px / ext), latVon(py / ext))));
        if (f.typ === 1) { const [x, z] = g[0][0]; if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && im(x, z, -40)) L[name].push({ id: f.id, p: f.p, punkt: [x, z] }); }
        else if (f.typ === 2) { const teile = g.flatMap(l => linieImRechteck(l, x0, z0, x1, z1)); if (teile.length) L[name].push({ id: f.id, p: f.p, linien: teile }); }
        else if (f.typ === 3) {
          const ringe = g.filter(r => r.length >= 4); if (!ringe.length) continue;
          let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity; for (const r of ringe) for (const [x, z] of r) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (z < b0) b0 = z; if (z > b1) b1 = z; }
          if (a1 < -H - 80 || a0 > H + 80 || b1 < -H - 80 || b0 > H + 80) continue;   // weit außerhalb des Ortes
          if (a0 > x0 + 0.01 && a1 < x1 - 0.01 && b0 > z0 + 0.01 && b1 < z1 - 0.01) { L[name].push({ id: f.id, p: f.p, paths: ringe.map(C.zuC) }); continue; }   // ganz in der Kachel: Ringe wie geliefert (außen und Löcher gegenläufig)
          const paths = C.normal(ringe.map(C.zuC)); const cut = C.schneide(paths, rect);
          if (cut.length) L[name].push({ id: f.id, p: f.p, paths: cut });
        }
      }
    }
  }
  mark('lesen');

  // 2. Gebäude: Umrisse (ohne hide_3d, die Teile kommen extra), Parzellen
  const haeuser = [], fassaden = new StreckenIndex(12), nutzungen = [];
  for (const f of L.landuse) {
    const c = f.p.class, nz = c === 'residential' ? 'wohnen' : (c === 'commercial' || c === 'retail') ? 'handel' : (c === 'industrial' || c === 'railway' || c === 'garages' || c === 'quarry') ? 'industrie' : null;
    if (nz) for (const P of C.polys(C.baum(f.paths))) nutzungen.push({ P, nz });
  }
  const nutzIdx = new FlaechenIndex(nutzungen.map(n => n.P), 40);
  const poiLaden = L.poi.filter(f => LADEN.has(f.p.class) || LADEN.has(f.p.subclass) || /shop|store/.test(f.p.class || '')).map(f => f.punkt);
  const ladenIdx = new StreckenIndex(10); poiLaden.forEach(p => ladenIdx.add(p, p, null));
  const umrisse = [];
  for (const f of L.building) {
    if (f.p.hide_3d) continue;
    let h = +f.p.render_height || 0; const m = +f.p.render_min_height || 0;
    if (h <= 0.5) { const Rb = rng(((f.id ?? 0) % 2147483647) + 11); h = reg.hoehe * (0.8 + Rb() * 0.4); }   // je Haus fest (sonst änderten Häuser ohne Höhe bei jedem Ortswechsel ihre Höhe)
    if (h - m < 0.5) continue;
    for (const P of C.polys(C.baum(f.paths), 6)) {
      const [x, z] = P[0][0]; if (!im(x, z, -30)) continue;
      umrisse.push({ P, h, m, farbe: f.p.colour, id: f.id });
      for (const ring of P) for (let i = 0; i < ring.length; i++) fassaden.add(ring[i], ring[(i + 1) % ring.length], null);
    }
  }
  // Parzellenteilung: Schnitt quer zur langen Achse, durch Höfe, bis Fläche und Frontlänge passen
  const ziel = reg.parzelle, minB = reg.minB, maxFront = Math.sqrt(ziel) * 1.5;
  function teile(P, Rr, tiefe, out) {
    const A = Math.abs(flaecheRing(P[0])) - P.slice(1).reduce((a, h) => a + Math.abs(flaecheRing(h)), 0);
    if (A < 10) return;
    const mr = minRechteck(P[0]); if (!mr) return;
    const hof = P.length > 1;
    if (tiefe >= 10 || (!hof && ((A <= ziel * 1.6 && mr.L <= maxFront) || mr.L < 2 * minB))) { out.push(P[0]); return; }
    let s;   // Schnittposition entlang der langen Achse
    if (hof) { const h = P[1]; let cx = 0, cz = 0; for (const q of h) { cx += q[0]; cz += q[1]; } cx /= h.length; cz /= h.length; s = cx * mr.ux + cz * mr.uz; }
    else s = (mr.u0 + mr.u1) / 2 + (Rr() - 0.5) * 0.24 * mr.L;
    const vx = -mr.uz, vz = mr.ux, W = 1e4;
    const ebene = (u0, u1) => [C.zuC([[mr.ux * u0 + vx * -W, mr.uz * u0 + vz * -W], [mr.ux * u1 + vx * -W, mr.uz * u1 + vz * -W], [mr.ux * u1 + vx * W, mr.uz * u1 + vz * W], [mr.ux * u0 + vx * W, mr.uz * u0 + vz * W]])];
    const subj = C.polysZuC([P]), teileA = C.polys(C.schneideBaum(subj, ebene(-W, s)), 2), teileB = C.polys(C.schneideBaum(subj, ebene(s, W)), 2);
    if (!teileA.length || !teileB.length) { out.push(P[0]); return; }
    for (const Q of teileA.concat(teileB)) teile(Q, Rr, tiefe + 1, out);
  }
  for (const u of umrisse) {
    const lots = [], Rr = rng((u.id || 1) % 2147483647);
    teile(u.P, Rr, 0, lots);
    lots.forEach((ring, k) => {
      const p = saeubern(ring.map(([x, z]) => [r2(x), r2(z)])); if (p.length < 3) return;
      const A = Math.abs(flaecheRing(p)); if (A < 8) return;
      let cx = 0, cz = 0; for (const q of p) { cx += q[0]; cz += q[1]; } cx /= p.length; cz /= p.length;
      if (!im(cx, cz, 2)) return;
      haeuser.push({ p, h: r2(u.h), m: r2(u.m), cx, cz, A, farbe: u.farbe, id: ((u.id || 0) % 1e9) * 64 + (k % 64) });
    });
  }
  mark('parzellen');

  // 3. Straßen: Breite nach Klasse und Region, begrenzt durch die Fassaden auf beiden Seiten
  const wege = [], strassenLinien = [];
  for (const f of L.transportation) {
    if (!f.linien) continue;
    const c = f.p.class, tunnel = f.p.brunnel === 'tunnel';
    if (c === 'path' || c === 'track') { if (!tunnel && !(f.p.level > 0 || f.p.indoor)) wege.push(f); continue; }
    const hw0 = KLASSE_HW[c]; if (!hw0) continue;
    const hw = f.p.ramp && FAHR[hw0 + '_link'] ? hw0 + '_link' : hw0;
    strassenLinien.push({ f, hw, tunnel, einbahn: f.p.oneway === 1 || f.p.oneway === -1, rueck: f.p.oneway === -1, privat: f.p.access === 'private' || f.p.access === 'no', service: f.p.service });
  }
  const minW = { motorway: 7, trunk: 6.5, primary: 6, secondary: 5.5, tertiary: 4.5, residential: 3.2, busway: 3.2, service: 2.6, living_street: 3 };
  for (const s of strassenLinien) {
    let w0 = (s.hw === 'residential' ? reg.neben : s.hw === 'service' ? ({ driveway: 3.5, parking_aisle: 5.5 }[s.service] || 4.5) : FAHR[s.hw]) * (s.hw === 'residential' ? 1 : reg.f);
    if (s.einbahn && /motorway|trunk/.test(s.hw)) w0 *= 0.55;   // Richtungsfahrbahn
    const proben = [];
    for (const l of s.f.linien) {
      const Lg = laenge(l); for (let d = 4; d < Lg - 2; d += 9) {
        const q = punktBei(l, d); if (!q) continue; const nx = -q.dz, nz = q.dx;
        const a = fassaden.strahl(q.x, q.z, nx, nz, 35), b = fassaden.strahl(q.x, q.z, -nx, -nz, 35);
        if (a < 0.6 || b < 0.6) continue;   // Durchfahrt unter einem Haus
        proben.push(Math.min(a, 35) + Math.min(b, 35) - 2 * reg.gehweg);
      }
    }
    proben.sort((a, b) => a - b);
    const frei = proben.length ? proben[Math.floor(proben.length * 0.2)] : Infinity;
    s.w = Math.max(minW[s.hw] || 3, Math.min(w0, frei));
  }
  mark('strassenBreite');
  const nachBreite = new Map();
  for (const s of strassenLinien) {
    if (s.tunnel) continue;
    const k = Math.round(s.w * 4) / 4; for (const l of s.f.linien) (nachBreite.get(k) || nachBreite.set(k, []).get(k)).push(C.zuC(l));
  }
  let strasse = [];
  for (const [w, ls] of nachBreite) strasse = strasse.concat(C.versatz(ls, w / 2, { offen: true }));
  mark('strassenVersatz');
  strasse = C.vereinige(strasse);
  mark('strassenVereinigt');
  strasse = C.versatz(C.versatz(strasse, 3, { rund: false }), -3);   // Ecken schließen, Bordsteinradius rund 3 m (Aufweiten mit Gehrung: keine Bögen an den vielen konvexen Ecken, die Rundung der Bordsteinecken entsteht beim Schrumpfen)
  strasse = C.schneide(strasse, KERN);
  mark('strassen');

  // 4. Wasser, Blöcke, Plätze, Grün
  let wasser = C.vereinige(L.water.flatMap(f => f.paths));
  const flussB = { river: 14, canal: 9, stream: 2.5, drain: 1.5, ditch: 1.2 };
  const fl = L.waterway.filter(f => f.p.brunnel !== 'tunnel' && f.linien).flatMap(f => C.versatz(f.linien.map(C.zuC), (flussB[f.p.class] || 2) / 2, { offen: true }));
  if (fl.length) wasser = C.vereinige(wasser.concat(fl));
  wasser = C.schneide(wasser, KERN);
  const bloeckeP = C.ohne(C.ohne(KERN, strasse), wasser);
  const platzP = C.schneide(C.vereinige(L.transportation.filter(f => f.paths && f.p.class === 'path' && /pedestrian|footway/.test(f.p.subclass || '')).flatMap(f => f.paths)), bloeckeP);
  const gruenRoh = C.vereinige([
    ...L.landcover.filter(f => /grass|wood|wetland|farmland/.test(f.p.class || '') && f.paths).flatMap(f => f.paths),
    ...L.landuse.filter(f => /playground|pitch|cemetery|grave_yard|park/.test(f.p.class || '') && f.paths).flatMap(f => f.paths)]);
  const gruenP = C.ohne(C.schneide(gruenRoh, bloeckeP), platzP);
  const waldP = C.schneide(C.vereinige(L.landcover.filter(f => f.p.class === 'wood' && f.paths).flatMap(f => f.paths)), bloeckeP);
  // Sand (Strände, Dünen, seit 29.10.2026): eigene Fläche statt Gehweg, ohne Plätze und Grün
  const sandP = C.ohne(C.ohne(C.schneide(C.vereinige(L.landcover.filter(f => f.p.class === 'sand' && f.paths).flatMap(f => f.paths)), bloeckeP), platzP), gruenP);
  const fussLinien = wege.filter(f => !/steps|platform|corridor/.test(f.p.subclass || '') || f.p.subclass === 'steps');
  const pfadP = C.schneide(C.vereinige(C.versatz(fussLinien.filter(f => f.p.subclass !== 'cycleway').flatMap(f => f.linien.map(C.zuC)), 1.2, { offen: true })), gruenP);
  const radP = C.ohne(C.schneide(C.vereinige(C.versatz(wege.filter(f => f.p.subclass === 'cycleway').flatMap(f => f.linien.map(C.zuC)), 0.9, { offen: true, butt: true })), bloeckeP), platzP);
  mark('flaechen');

  // Häuser auf der Fahrbahn oder im Wasser (Breiten geschätzt) weglassen
  const strasseIdx = new FlaechenIndex(C.polys(C.baum(strasse)), 25), wasserIdx = new FlaechenIndex(C.polys(C.baum(wasser)), 40);
  const gebaeude = [];
  for (const hs of haeuser) {
    if (strasseIdx.enthaelt(hs.cx, hs.cz) >= 0 || wasserIdx.enthaelt(hs.cx, hs.cz) >= 0) continue;
    const ni = nutzIdx.enthaelt(hs.cx, hs.cz), nutzung = ni >= 0 ? nutzungen[ni].nz : null;
    let laden = false; if (hs.m < 1) { const q = ladenIdx.naechste(hs.cx, hs.cz, Math.sqrt(hs.A) * 0.7 + 4); laden = !!q; }
    const Rh = rng((hs.id % 2147483647) + 7), t = gebaeudeTyp({ h: hs.h - hs.m, flaeche: hs.A, nutzung, laden, farbe: hs.farbe }, Rh, reg);
    const e = { p: hs.p, h: hs.h, m: hs.m, teil: hs.m > 0, rand: false, b: 'yes', id: hs.id, typ: t.typ, fern: t.fern };
    if (t.variant) e.variant = t.variant; if (hs.farbe) e.farbe = hs.farbe; if (laden) e.laden = true;
    gebaeude.push(e);
  }
  const hausUnion = C.vereinige(gebaeude.map(g => C.zuC(g.p)));
  mark('gebaeude');

  // 5. Straßennetz für Fahrzeuge (Port des Blocks verkehr aus tools/ort_bauen.py)
  const TEMPO = { motorway: 100, trunk: 70, motorway_link: 60, trunk_link: 50, living_street: 7, service: 15 };
  const tempo = hw => TEMPO[hw] || (/primary|secondary|tertiary/.test(hw) ? reg.tempo : reg.nebenTempo);
  function spuren(hw, w, einbahn) {
    if (einbahn) return [(/primary|secondary|trunk|motorway/.test(hw) && w >= 6.5) ? 2 : 1, 0];
    const n = (/primary|secondary|trunk|motorway/.test(hw) && w >= 12.5) ? 2 : 1; return [n, n];
  }
  const vkLinien = [], tunnelPkt = [];
  for (const s of strassenLinien) {
    if (s.tunnel) { for (const l of s.f.linien) for (const c of l) tunnelPkt.push(c); continue; }
    if (s.hw === 'service' || s.privat) continue;
    for (const l0 of s.f.linien) for (let l of linieImRechteck(l0, -H, -H, H, H)) {
      if (laenge(l) < 1) continue;
      if (s.rueck) l = l.slice().reverse();
      const [vor, zur] = spuren(s.hw, s.w, s.einbahn), lw = Math.min(3.5, Math.max(2.6, s.w / (vor + zur)));
      const park = reg.parken && /residential|tertiary|secondary/.test(s.hw) && s.w >= 9;
      vkLinien.push({ p: l.map(([x, z]) => [r2(x), r2(z)]), hw: s.hw, rang: RANG[s.hw], vor, zur, lw: r2(lw), w: r2(s.w), tempo: tempo(s.hw), einbahn: s.einbahn, turnV: null, turnZ: null, parkR: park, parkL: park && !s.einbahn, name: s.f.p.name || null, bus: s.hw === 'busway' });
    }
  }
  // Knoten: Punkte auf 0,7 m zusammenfangen (Kachelgrenzen runden verschieden)
  const fang = new Map(), fangPunkte = [];
  const schluessel = c => {
    const gx = Math.round(c[0]), gz = Math.round(c[1]);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of fang.get((gx + a) + ':' + (gz + b)) || []) { const q = fangPunkte[i]; if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 0.7) return i; }
    const i = fangPunkte.length; fangPunkte.push([c[0], c[1]]); const k = gx + ':' + gz; (fang.get(k) || fang.set(k, []).get(k)).push(i); return i;
  };
  const zaehler = new Map(), plus = (k, n = 1) => zaehler.set(k, (zaehler.get(k) || 0) + n);
  for (const e of vkLinien) { e.keys = e.p.map(schluessel); for (const k of e.keys) plus(k); plus(e.keys[0]); plus(e.keys[e.keys.length - 1]); }
  const tunnelSet = new Set(tunnelPkt.map(schluessel));
  const vkKnoten = [], vkIndex = new Map(), knotenVon = k => { if (!vkIndex.has(k)) { vkIndex.set(k, vkKnoten.length); vkKnoten.push([r2(fangPunkte[k][0]), r2(fangPunkte[k][1])]); } return vkIndex.get(k); };
  let vkKanten = [];
  for (const e of vkLinien) {
    let start = 0;
    for (let i = 1; i < e.p.length; i++) {
      if (i === e.p.length - 1 || (zaehler.get(e.keys[i]) || 0) >= 2) {
        const stueck = e.p.slice(start, i + 1);
        if (laenge(stueck) > 0.5) { const { p, keys, ...rest } = e; vkKanten.push({ a: knotenVon(e.keys[start]), b: knotenVon(e.keys[i]), p: stueck.map(c => c.slice()), ...rest }); }
        start = i;
      }
    }
  }
  for (const k of vkKanten) { k.p[0] = vkKnoten[k.a].slice(); k.p[k.p.length - 1] = vkKnoten[k.b].slice(); }
  const GLEICH = ['hw', 'vor', 'zur', 'lw', 'einbahn', 'tempo', 'parkR', 'parkL'];
  const gradVon = () => { const g = new Map(); for (const k of vkKanten) { g.set(k.a, (g.get(k.a) || 0) + 1); g.set(k.b, (g.get(k.b) || 0) + 1); } return g; };
  let geaendert = true;
  while (geaendert) {   // Grad 2 Knoten derselben Straße zusammenziehen
    geaendert = false; const g = gradVon(), an = new Map();
    for (const k of vkKanten) { (an.get(k.a) || an.set(k.a, []).get(k.a)).push(k); (an.get(k.b) || an.set(k.b, []).get(k.b)).push(k); }
    for (const [n, gr] of g) {
      if (gr !== 2) continue; const [e1, e2] = an.get(n);
      if (e1 === e2 || e1.b !== n || e2.a !== n || GLEICH.some(x => e1[x] !== e2[x]) || e1.a === e2.b) continue;
      e1.p = e1.p.concat(e2.p.slice(1)); e1.b = e2.b; e1.name = e1.name || e2.name; e1.bus = e1.bus || e2.bus;
      vkKanten.splice(vkKanten.indexOf(e2), 1); geaendert = true; break;
    }
  }
  // enge Kreuzungen zu einer zusammenziehen (Kante unter 14 m an einer Kreuzung oder unter 6 m)
  const mitglieder = vkKnoten.map(c => [c.slice()]), ersatz = new Map();
  geaendert = true;
  while (geaendert) {
    geaendert = false; const g = gradVon();
    for (const k of vkKanten) {
      const a = k.a, b = k.b, l = laenge(k.p), ga = g.get(a) || 0, gb = g.get(b) || 0;
      if (a === b || Math.min(ga, gb) < 2 || !((Math.max(ga, gb) >= 3 && l <= 14) || l <= 6)) continue;
      const alle = mitglieder[a].concat(mitglieder[b]), mx = alle.reduce((s, c) => s + c[0], 0) / alle.length, mz = alle.reduce((s, c) => s + c[1], 0) / alle.length;
      vkKnoten[a] = [r2(mx), r2(mz)]; mitglieder[a] = alle; ersatz.set(b, a);
      for (const e of vkKanten) { if (e.a === b) e.a = a; if (e.b === b) e.b = a; if (e.a === a) e.p[0] = [r2(mx), r2(mz)]; if (e.b === a) e.p[e.p.length - 1] = [r2(mx), r2(mz)]; }
      vkKanten = vkKanten.filter(e => !(e.a === e.b && laenge(e.p) < 30));
      geaendert = true; break;
    }
  }
  { const seen = new Map(), einmal = [];   // doppelte Kanten
    for (const k of vkKanten) { const s = Math.min(k.a, k.b) + ':' + Math.max(k.a, k.b) + ':' + Math.round(laenge(k.p) / 3); if (seen.has(s)) { const alt = seen.get(s); if (!alt.einbahn || k.einbahn) continue; einmal.splice(einmal.indexOf(alt), 1); } seen.set(s, k); einmal.push(k); }
    vkKanten = einmal; }
  const radius = vkKnoten.map((c, i) => Math.max(...mitglieder[i].map(m => Math.hypot(m[0] - c[0], m[1] - c[1]))));
  let grad = gradVon();
  // Ampeln nach Regel: zwei größere Straßen treffen sich (Rang 4 und 3, oder Rang 5 an einer Kreuzung mit vier Armen)
  const signal = new Set();
  for (const [n, gr] of grad) {
    if (gr < 3) continue;
    const raenge = vkKanten.filter(k => k.a === n || k.b === n).map(k => k.rang).sort((a, b) => b - a);
    if (raenge[0] >= 7) continue;
    if ((raenge[0] >= 4 && raenge[1] >= 3) || (raenge[0] >= 5 && gr >= 4 && raenge[1] >= 2)) signal.add(n);
  }
  // Inseln: nur Kanten, die vom Rand oder Portal erreichbar sind und wieder hinausführen
  const hin = new Map(), her = new Map(), push = (m, a, b) => (m.get(a) || m.set(a, []).get(a)).push(b);
  for (const k of vkKanten) { push(hin, k.a, k.b); push(her, k.b, k.a); if (!k.einbahn) { push(hin, k.b, k.a); push(her, k.a, k.b); } }
  const erreichbar = (start, nach) => { const seen = new Set(start), st = start.slice(); while (st.length) { const u = st.pop(); for (const v of nach.get(u) || []) if (!seen.has(v)) { seen.add(v); st.push(v); } } return seen; };
  const portal = i => { const c = vkKnoten[i]; for (const k of tunnelSet) { const q = fangPunkte[k]; if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 1) return true; } return false; };
  const tore = vkKnoten.map((c, i) => i).filter(i => (grad.get(i) || 0) === 1 && (Math.max(Math.abs(vkKnoten[i][0]), Math.abs(vkKnoten[i][1])) >= H - 0.6 || portal(i)));
  const offen = new Set([...erreichbar(tore, hin)].filter(x => erreichbar(tore, her).has(x)));
  vkKanten = vkKanten.filter(k => offen.has(k.a) && offen.has(k.b));
  grad = gradVon();
  const knotenAus = vkKnoten.map(([x, z], i) => {
    const gr = grad.get(i) || 0, amRand = Math.max(Math.abs(x), Math.abs(z)) >= H - 0.6;
    const art = gr === 0 ? 'frei' : amRand && gr === 1 ? 'rand' : gr === 1 && portal(i) ? 'portal' : gr === 1 ? 'sackgasse' : gr >= 3 ? 'kreuzung' : 'knick';
    return [x, z, art, signal.has(i) && gr >= 3 ? 1 : 0, r2(radius[i] || 0)];
  });
  mark('netz');

  // 6. Markierungen: Leitlinien zwischen Spuren gleicher Richtung, Mittellinie ab Rang 3
  const scheiben = C.vereinige(knotenAus.map((k, i) => [k, i]).filter(([k]) => k[2] === 'kreuzung').map(([k]) => { const r = k[4] + 11, P = []; for (let a = 0; a < 16; a++) P.push([k[0] + Math.cos(a / 16 * 6.283) * r, k[1] + Math.sin(a / 16 * 6.283) * r]); return C.zuC(P); }));
  const markier = C.ohne(C.versatz(strasse, -0.6), scheiben);
  const linien = [], jeArt = { mitte: [], spur: [] };
  for (const k of vkKanten) {
    if (k.hw === 'service' || k.p.length < 2) continue;
    const n = k.vor + k.zur, versatzListe = [];
    if (k.einbahn) for (let i = 1; i < k.vor; i++) versatzListe.push([-k.w / 2 + i * k.lw, 'spur']);
    else { if (k.rang >= 3) versatzListe.push([0, 'mitte']); for (let i = 1; i < k.vor; i++) versatzListe.push([i * k.lw, 'spur'], [-i * k.lw, 'spur']); }
    if (!versatzListe.length || n < 2 && k.rang < 3) continue;
    for (const [v, art] of versatzListe) jeArt[art].push(C.zuC(Math.abs(v) < 0.01 ? k.p : versetzt(k.p, v)));
  }
  for (const art of ['mitte', 'spur']) if (jeArt[art].length) for (const s of C.linienIn(jeArt[art], markier)) { const pts = C.vonC(s); if (laenge(pts) > 4) linien.push({ p: pts.map(([x, z]) => [r2(x), r2(z)]), art }); }
  mark('markierungen');

  // 7. Überwege an den Armen jeder Kreuzung, Ampelmasten an Furten
  const querungen = [], querWege = [], ampeln = [];
  const strassePolys = C.polys(C.baum(strasse));
  const randIdx = new StreckenIndex(10); for (const P of strassePolys) for (const ring of P) for (let i = 0; i < ring.length; i++) randIdx.add(ring[i], ring[(i + 1) % ring.length], null);
  for (let n = 0; n < knotenAus.length; n++) {
    const kn = knotenAus[n]; if (kn[2] !== 'kreuzung' || !im(kn[0], kn[1], 20)) continue;
    const arme = vkKanten.filter(k => k.a === n || k.b === n);
    const breitAndere = Math.max(...arme.map(k => k.w)) / 2;
    for (const k of arme) {
      if (k.rang < 1) continue;
      const pts = k.a === n ? k.p : k.p.slice().reverse(), Lg = laenge(pts), s = Math.max(7, kn[4] + breitAndere + 2.5);
      if (Lg < s + 4) continue;
      const q = punktBei(pts, s); const nx = -q.dz, nz = q.dx, w = k.w / 2 + 1.5;
      if (strasseIdx.enthaelt(q.x, q.z) < 0) continue;   // Mitte des Überwegs muss auf der Fahrbahn liegen
      const ta = randIdx.strahl(q.x, q.z, -nx, -nz, w), tb = randIdx.strahl(q.x, q.z, nx, nz, w);   // bis zum Bordstein auf beiden Seiten
      const a = [q.x - nx * ta, q.z - nz * ta], b = [q.x + nx * tb, q.z + nz * tb], ql = ta + tb;
      if (ql < 1.5) continue;
      if (ql < k.w * 0.6 || ql > k.w + 3.5) continue;
      const art = kn[3] ? 'furt' : (k.rang >= 3 ? 'zebra' : null), e = { p: [[r2(a[0]), r2(a[1])], [r2(b[0]), r2(b[1])]], art: art || 'ohne', signal: !!kn[3] };
      querWege.push(e); if (art) querungen.push({ p: e.p, art });
      if (kn[3]) { const dx = b[0] - a[0], dz = b[1] - a[1], Lq = Math.hypot(dx, dz) || 1; for (const [qq, sg] of [[a, -1], [b, 1]]) ampeln.push([r2(qq[0] + dx / Lq * 0.7 * sg), r2(qq[1] + dz / Lq * 0.7 * sg), Math.round(Math.atan2(-dx * sg, -dz * sg) * 1000) / 1000]); }
    }
  }
  const ampelnEinmal = []; for (const a of ampeln) if (ampelnEinmal.every(b => Math.hypot(a[0] - b[0], a[1] - b[1]) > 4) && strasseIdx.enthaelt(a[0], a[1]) < 0) ampelnEinmal.push(a);
  mark('ueberwege');

  // 8. Wegenetz der Menschen: Gehweg 1,5 m neben dem Bordstein (wo kein Haus steht), Überwege, Fußwege aus den Daten
  const begehbar = C.ohne(C.ohne(bloeckeP, C.versatz(hausUnion, 0.35)), C.versatz(wasser, 0.5));
  const bordRinge = C.versatz(strasse, 1.5).map(p => p.concat([p[0]]));
  const gehLinien = C.linienIn(bordRinge, begehbar).map(C.vonC).filter(l => laenge(l) > 1.5);
  // Fußwege aus den Daten: auf begehbaren Flächen ganz, auf der Fahrbahn nur kurze Querungen (bis 18 m). Vorher liefen Menschen auf breiten
  // Straßen die Fahrbahn entlang, wo OpenStreetMap Gehwege als eigene Linien führt, die in unserer Fahrbahn liegen (29.10.2026, Straße des 17. Juni)
  const fussC = fussLinien.flatMap(f => f.linien.map(C.zuC));
  const datenWege = C.linienIn(fussC, begehbar).map(C.vonC).filter(l => laenge(l) > 2)
    .concat(C.linienIn(fussC, C.ohne(C.versatz(strasse, 0.01), begehbar)).map(C.vonC).filter(l => laenge(l) > 2 && laenge(l) < 18));
  const blockIdx = new FlaechenIndex(C.polys(C.baum(bloeckeP)), 25);
  const wk = [], wkIdx = new Map(), kantenW = [];
  const wKnoten = c => {
    const gx = Math.round(c[0] / 0.6), gz = Math.round(c[1] / 0.6);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = wkIdx.get((gx + a) + ':' + (gz + b)); if (i !== undefined && Math.hypot(wk[i][0] - c[0], wk[i][1] - c[1]) < 0.5) return i; }
    const i = wk.length; wk.push([r2(c[0]), r2(c[1])]); wkIdx.set(gx + ':' + gz, i); return i;
  };
  const amBord = new Set();   // Enden der Überwege liegen auf Fahrbahnhöhe (der Weg dorthin ist die Bordsteinkante)
  const kante = (a, b, art, phase, w) => { const ia = wKnoten(a), ib = wKnoten(b); if (ia === ib) return; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; kantenW.push([ia, ib, art, phase, Math.round(-dz / l * 1000) / 1000, Math.round(dx / l * 1000) / 1000, w]); };
  for (const l of gehLinien) { const d = dichter(l, 12); for (let i = 1; i < d.length; i++) kante(d[i - 1], d[i], 'gehweg', null, 2.4); }
  for (const l of datenWege) { const d = dichter(l, 12); for (let i = 1; i < d.length; i++) kante(d[i - 1], d[i], 'gehweg', null, 2.4); }
  // Überwege: Enden an den nächsten Gehweg anschließen (bis 4 m)
  const gehIdx = new StreckenIndex(10); kantenW.forEach((k, i) => gehIdx.add(wk[k[0]], wk[k[1]], i));
  const anschluss = (p) => {
    const q = gehIdx.naechste(p[0], p[1], 4.5); if (!q) return null;
    const k = kantenW[q.s.daten], A = wk[k[0]], B = wk[k[1]];
    if (q.t < 0.08) return A; if (q.t > 0.92) return B;
    const M = [q.x, q.z]; const iM = wKnoten(M), ib = k[1]; k[1] = iM; const dx = B[0] - M[0], dz = B[1] - M[1], l = Math.hypot(dx, dz) || 1;
    kantenW.push([iM, ib, k[2], k[3], Math.round(-dz / l * 1000) / 1000, Math.round(dx / l * 1000) / 1000, k[6]]); gehIdx.add(M, B, kantenW.length - 1);
    return M;
  };
  for (const q of querWege) {
    const [a, b] = q.p, A = anschluss(a), B = anschluss(b); if (!A || !B) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1], phase = q.signal ? (Math.abs(dx) > Math.abs(dz) ? 'Q' : 'H') : null;
    kante(A, a, 'gehweg', null, 2.4); kante(a, b, 'ueberweg', phase, q.art === 'furt' ? 4 : 3); kante(b, B, 'gehweg', null, 2.4); amBord.add(wKnoten(a)); amBord.add(wKnoten(b));
  }
  // größtes zusammenhängendes Netz
  const nach = new Map(); for (const k of kantenW) { push(nach, k[0], k[1]); push(nach, k[1], k[0]); }
  let beste = [], gesehen = new Set();
  for (let s0 = 0; s0 < wk.length; s0++) { if (gesehen.has(s0) || !nach.has(s0)) continue; const teil = [], st = [s0]; gesehen.add(s0); while (st.length) { const u = st.pop(); teil.push(u); for (const v of nach.get(u)) if (!gesehen.has(v)) { gesehen.add(v); st.push(v); } } if (teil.length > beste.length) beste = teil; }
  const behalten = new Set(beste), neu = new Map(); [...behalten].sort((a, b) => a - b).forEach((alt, i) => neu.set(alt, i));
  const kantenAus = kantenW.filter(k => behalten.has(k[0]) && behalten.has(k[1])).map(k => [neu.get(k[0]), neu.get(k[1]), ...k.slice(2)]);
  const gradW = new Map(); for (const k of kantenAus) { gradW.set(k[0], (gradW.get(k[0]) || 0) + 1); gradW.set(k[1], (gradW.get(k[1]) || 0) + 1); }
  const knotenW = [...behalten].sort((a, b) => a - b).map((alt) => {
    const [x, z] = wk[alt], i = neu.get(alt), g = gradW.get(i) || 0, amRand = Math.max(Math.abs(x), Math.abs(z)) > H - 25;
    const auf = !amBord.has(alt) && blockIdx.enthaelt(x, z) >= 0 ? 0.12 : 0;
    return [x, z, r2(auf + hoeheAn(x, z)), g === 1 && amRand ? 'ende' : g >= 3 ? 'kreuzung' : g === 1 ? 'ziel' : 'weg'];
  });
  mark('wege');

  // 9. Gruppen auf Plätzen, 2,5 m neben jedem Weg
  const wegeIdx = new StreckenIndex(10); for (const k of kantenAus) wegeIdx.add(knotenW[k[0]], knotenW[k[1]], null);
  const platzPolys = C.polys(C.baum(platzP)), platzIdx = new FlaechenIndex(platzPolys, 30), gruppen = [];
  if (platzPolys.length) for (let v = 0; v < 3000 && gruppen.length < 14; v++) {
    const P = platzPolys[Math.floor(R() * platzPolys.length)]; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of P[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    if (platzIdx.enthaelt(x, z) < 0 || wegeIdx.naechste(x, z, 2.5) || gruppen.some(g => Math.hypot(g[0] - x, g[1] - z) < 25)) continue;
    gruppen.push([r2(x), r2(z)]);
  }

  // 10. Bäume (Straße, Park, Wald), Laternen, Stadtmöbel aus den Punkten
  const hausIdx = new FlaechenIndex(gebaeude.map(g => [g.p]), 20);
  const platzFrei = (x, z, hausAb, randAb) => blockIdx.enthaelt(x, z) >= 0 && hausIdx.enthaelt(x, z) < 0 && !fassaden.naechste(x, z, hausAb) && !randIdx.naechste(x, z, randAb);
  const baumFlaeche = { enthaelt: (x, z) => platzFrei(x, z, 2.2, 0.9) ? 0 : -1 }, laternFlaeche = { enthaelt: (x, z) => platzFrei(x, z, 0.8, 0.25) ? 0 : -1 };
  const kreuzPkt = knotenAus.filter(k => k[2] === 'kreuzung');
  const nahKreuzung = (x, z, plusR) => kreuzPkt.some(k => Math.hypot(k[0] - x, k[1] - z) < k[4] + plusR);
  const baeume = [], laternen = [], belegt = new StreckenIndex(8);
  const frei = (x, z, d) => !belegt.naechste(x, z, d);
  const linienMitBreite = strassenLinien.filter(s => !s.tunnel && s.hw !== 'service');
  for (const s of linienMitBreite) {
    const rang = RANG[s.hw], baumAn = rang >= 1 && rang <= 5 && R() < 1.6 * reg.baeume;
    for (const l of s.f.linien) {
      const Lg = laenge(l);
      for (const seite of [1, -1]) {
        if (rang <= 2 && seite === -1 && s.w < 7) { /* Laternen schmaler Straßen nur auf einer Seite */ } else
        for (let d = 8 + R() * 6; d < Lg - 4; d += rang >= 4 ? 34 : 30) {   // Laternen am Bordstein
          const q = punktBei(l, d), x = q.x - q.dz * seite * (s.w / 2 + 0.55), z = q.z + q.dx * seite * (s.w / 2 + 0.55);
          if (!im(x, z, 3) || laternFlaeche.enthaelt(x, z) < 0 || !frei(x, z, 6)) continue;
          laternen.push([r2(x), r2(z)]); belegt.add([x, z], [x, z], 'l');
        }
        if (!baumAn) continue;
        const ab = s.w / 2 + Math.max(1.3, Math.min(2.2, reg.gehweg * 0.6));
        for (let d = 6 + R() * 6; d < Lg - 3; d += 11 + R() * 3) {   // Straßenbäume
          const q = punktBei(l, d), x = q.x - q.dz * seite * ab, z = q.z + q.dx * seite * ab;
          if (!im(x, z, 4) || nahKreuzung(x, z, 10) || baumFlaeche.enthaelt(x, z) < 0 || !frei(x, z, 4)) continue;
          baeume.push([r2(x), r2(z), r2(9 + R() * 7), baumArt(R, reg), 1]); belegt.add([x, z], [x, z], 'b');
        }
      }
    }
  }
  const gruenIdx0 = new FlaechenIndex(C.polys(C.baum(C.ohne(gruenP, C.versatz(pfadP, 1.5)))), 30);
  const gruenIdx = { enthaelt: (x, z) => gruenIdx0.enthaelt(x, z) >= 0 && hausIdx.enthaelt(x, z) < 0 && !fassaden.naechste(x, z, 2) ? 0 : -1 };
  const waldIdx = new FlaechenIndex(C.polys(C.baum(C.ohne(waldP, C.versatz(pfadP, 1.5)))), 30);
  // Wald und Grün auf einem Raster, das an der Erde hängt (nicht am Ort): Zufall je Rasterzelle aus ihrer Weltlage, so stehen dieselben Bäume
  // an derselben Stelle, wenn beim Fahren der nächste Ort gebaut wird (vorher sprangen sie bei jedem Ortswechsel)
  const GX = lon * K_LON, GZ = -lat * K_LAT, x0 = Math.ceil((GX - H + 5) / 9) * 9 - GX, z0 = Math.ceil((GZ - H + 5) / 9) * 9 - GZ;
  for (let x = x0; x < H - 5; x += 9) for (let z = z0; z < H - 5; z += 9) {
    if (baeume.length > 2600) break;
    const ix = Math.round((x + GX) / 9), iz = Math.round((z + GZ) / 9), Rz = rng(((ix * 73856093) ^ (iz * 19349663)) >>> 0 || 1);
    const px = x + (Rz() - 0.5) * 7, pz = z + (Rz() - 0.5) * 7;
    if (waldIdx.enthaelt(px, pz) >= 0) { if (Rz() < 0.85) baeume.push([r2(px), r2(pz), r2(14 + Rz() * 10), baumArt(Rz, reg), 0]); }
    else if (((ix + iz) & 1) === 0 && gruenIdx.enthaelt(px, pz) >= 0 && Rz() < 0.5 && frei(px, pz, 5)) baeume.push([r2(px), r2(pz), r2(10 + Rz() * 9), baumArt(Rz, reg), 0]);
  }
  // Stadtmöbel: Punkte aus den Kacheln, an den Bordstein gesetzt, Blick zur Fahrbahn
  const MOEBEL = { bicycle_parking: 'rad', waste_basket: 'korb', bus_stop: 'halt', bollard: 'poller', bench: 'bank' }, grenze = { rad: 160, korb: 140, poller: 120, bank: 120, halt: 60 }, zahl = {};
  const moebel = [];
  for (const f of L.poi) {
    const typ = MOEBEL[f.p.subclass] || MOEBEL[f.p.class]; if (!typ) continue;
    let [x, z] = f.punkt; if (!im(x, z, 2)) continue;
    if ((zahl[typ] = (zahl[typ] || 0) + 1) > grenze[typ]) continue;
    const q = randIdx.naechste(x, z, 25);
    if (typ !== 'poller' && q && strasseIdx.enthaelt(x, z) >= 0) { const dx = q.x - x, dz = q.z - z, l = Math.hypot(dx, dz) || 1; x = q.x + dx / l * 0.7; z = q.z + dz / l * 0.7; }
    const q2 = randIdx.naechste(x, z, 30);
    moebel.push([r2(x), r2(z), typ, q2 ? Math.round(Math.atan2(q2.x - x, q2.z - z) * 1000) / 1000 : 0]);
  }
  mark('ausstattung');

  // 11. Ausgabe: Flächen mit dichteren Rändern (Gelände folgt den Punkten), Höhen relativ zur Mitte
  const relief = (() => { let a = Infinity, b = -Infinity; for (let x = -H; x <= H; x += H / 4) for (let z = -H; z <= H; z += H / 4) { const h = hoeheAn(x, z); a = Math.min(a, h); b = Math.max(b, h); } return b - a; })();
  const aus = paths => C.polys(C.baum(paths), 0.5).map(P => P.map(ring => (relief > 1 ? dichter(ring, 8, true) : ring).map(([x, z]) => [r2(x), r2(z)])));
  const daten = {
    meta: { name, lat, lon, groesse: 2 * H, rand: 0, blicke: [], land: land.de || null, iso: land.iso2 || null, region: reg.key, links: reg.links,
      quelle: 'Kartendaten © OpenStreetMap Mitwirkende, ODbL (openstreetmap.org/copyright) · © OpenMapTiles · OpenFreeMap', stand, relief: r2(relief), zeit, wegeLinear: true },
    gebaeude, stelen: [],
    strasse: aus(strasse), bloecke: aus(bloeckeP), plaetze: aus(platzP), gruen: aus(gruenP), sand: aus(sandP), pfade: aus(pfadP), radwege: aus(radP), wasser: aus(wasser),
    linien, querungen, ampeln: ampelnEinmal, laternen, baeume, moebel,
    wege: { knoten: knotenW, kanten: kantenAus }, gruppen, verkehr: { knoten: knotenAus, kanten: vkKanten },
  };
  mark('fertig');
  return daten;
}
