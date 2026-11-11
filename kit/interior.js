// Innenräume (seit 28.10.2026 nachts, Naders Wunsch Nr. 27: "jedes Gebäude begehen, Räume, Treppen"). Regeln in 04_REGELWERK.md Teil 2.
// Aus Grundriss, Höhe, Typ und Seed entsteht das Innere eines Hauses: gleicher Seed, gleiches Haus, auch innen.
//   Rahmen: Haustür (aus dem Fassadenlauf, buildings.js) in der Mitte der Straßenkante. Achse p läuft entlang der längeren Ausdehnung,
//   q quer dazu. Modus "flur": Flur 1,8 m in der Mitte, Räume beidseitig in Scheiben von rund 4,6 m, Eingangshalle an der Tür.
//   Modus "reihe" (flache Häuser unter 7,5 m Tiefe): Räume in einer Reihe mit Türen in den Zwischenwänden.
//   Kern: Treppenhaus 7 m lang, bis 2,8 m breit: Ankunftszone 0 bis 1,4 m, zwei Läufe (Streifen +1 hinauf, Streifen -1 weiter hinauf)
//   bis 5,6 m, Podest bis 7 m. Geschosse wie außen (Erdgeschoss und Geschosshöhe je Typ), Decken 0,22 m, Innenhülle mit denselben
//   Fensteröffnungen wie die Fassade (durch die Fenster sieht man die Straße), Möbel je Typ als leichte Kästen, nachts Deckenleuchten.
//   Gebaut wird je Geschoss erst, wenn der Spieler im Haus ist (Innenwelt), höchstens 3 Geschosse zugleich.
import * as THREE from 'three';
import { Bau, offsetRing, edgeNormal, orient, inside, rng } from './geo.js';
import { Fassade, hausPlan, tuerBlatt } from './buildings.js';

const GESCHOSS = { altbau: [4.4, 3.3, 1], ziegel: [4.0, 3.1, 1], wohnturm: [5.0, 3.2, 3], raster: [7.0, 3.75, 3], lochfassade: [6.0, 3.3, 3], glasturm: [7.5, 3.8, 3], kupfer: [6.5, 3.6, 3], band: [4.8, 3.6, 1] };
// Wohnhäuser (Wohnungen statt Büros): auch die Bauweisen aus kit/stile.js und kit/bauwerke.js (Gründerzeit, Platte, Neubau, Einfamilienhaus ...)
const WOHNEN = new Set(['altbau', 'ziegel', 'wohnturm', 'gruenderzeit', 'platte', 'neubau', 'nachkrieg', 'efh', 'reihenhaus', 'fachwerk', 'vorstadt', 'brownstone', 'kykladen', 'skandi', 'kolonial', 'haveli', 'sahel', 'riad', 'machiya', 'favela', 'haussmann', 'palazzo', 'china', 'tokio', 'golf', 'shophouse']);
// Geschossböden aus den Fensterreihen der Fassade (Nr. 96): Fenster bis 2,05 m hoch haben die Brüstung 0,9 m über dem Boden, höhere sind Fenstertüren
// am Boden. Je Gruppe (0,6 m) ein Boden, nur über 2 m (das Erdgeschoss liegt bei 0) und mit 2,3 bis 5,5 m Abstand. So passen Fenster und Decken
// innen zur Fassade, auch bei Bauweisen ohne Eintrag in GESCHOSS. Ohne brauchbare Fenster: null (dann GESCHOSS)
function geschosseAusFenstern(ops, h) {
  const kand = [], echt = (ops || []).filter(o => o.b != null);   // Fenster mit bekanntem Geschossboden (kit/bauwerke.js reihe) gehen vor
  if (echt.length) { for (const o of echt) if (o.b > 2.0 && o.b < h - 2.2) kand.push(o.b); }
  else for (const o of ops || []) { const hoch = o.v1 - o.v0; if (hoch < 0.6 || hoch > 3.6) continue; const b = hoch > 2.05 ? o.v0 - 0.05 : o.v0 - 0.9; if (b > 2.0 && b < h - 2.2) kand.push(b); }
  if (!kand.length) return null;
  kand.sort((a, b) => a - b);
  const gruppen = []; for (const b of kand) { const g = gruppen[gruppen.length - 1]; if (g && b - g[g.length - 1] < 0.6) g.push(b); else gruppen.push([b]); }
  const boeden = []; for (const g of gruppen) { const b = g[Math.floor(g.length / 2)]; if (!boeden.length || b - boeden[boeden.length - 1] >= 2.3) boeden.push(Math.round(b * 100) / 100); }
  if (boeden[0] < 2.3 || boeden[0] > 8) return null;
  const abst = boeden.slice(1).map((b, i) => b - boeden[i]); if (abst.some(a => a > 5.5)) return null;
  const fH = abst.length ? abst.slice().sort((a, b) => a - b)[Math.floor(abst.length / 2)] : Math.min(3.6, boeden[0]);
  return { boeden, fH };
}
const K = { lang: 7.0, zone: 1.4, lauf: 4.2, breite: 2.8 };   // Treppenhaus
const WAND = 0.12, HUELLE = 0.3, RADIUS = 0.27;                 // Zwischenwand, Außenwand innen, Spielerradius
// Drehung für Bau.box (kit/geo.js), damit die erste Ausdehnung (sx) entlang (ax, az) liegt. Bis 10.11.2026 stand hier atan2(ax, az): das legte
// sx quer, alle Treppenstufen, Möbel, Türpfosten und Stürze lagen um 90 Grad verdreht (Stufen 1,36 m lang und 32 cm breit, Nr. 96)
const DREH = (ax, az) => Math.atan2(-az, ax);

// Ring mit je Kante eigenem Versatz nach innen (Schnitt der verschobenen Nachbarkanten)
function ringVar(P, d) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], n1 = edgeNormal(p0, p1), n2 = edgeNormal(p1, p2), d1 = d[(i - 1 + n) % n], d2 = d[i];
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    if (Math.abs(det) < 0.05) { out.push([p1[0] - n2[0] * d2, p1[1] - n2[1] * d2]); continue; }
    const c1 = n1[0] * p1[0] + n1[1] * p1[1] - d1, c2 = n2[0] * p1[0] + n2[1] * p1[1] - d2;
    out.push([(c1 * n2[1] - c2 * n1[1]) / det, (n1[0] * c2 - n2[0] * c1) / det]);
  }
  return out;
}
// Strahl von (x, z) in Richtung (dx, dz) gegen die Kanten eines Rings: Abstand bis zur ersten Kante (oder max)
function strahl(ring, x, z, dx, dz, max = 200) {
  let best = max;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - x) * ez - (a[1] - z) * ex) / den, s = ((a[0] - x) * dz - (a[1] - z) * dx) / den;
    if (t > 1e-6 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return best;
}
function segAbstand(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return [Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z), t];
}
function polyLoch(bau, key, aussen, loch, y, down) {   // Fläche mit einem rechteckigen Loch
  const k = aussen.map(([x, z]) => new THREE.Vector2(x, z)), h = loch ? [loch.map(([x, z]) => new THREE.Vector2(x, z))] : [];
  const tris = THREE.ShapeUtils.triangulateShape(k, h), alle = [...k, ...h.flat()], n = new THREE.Vector3(0, down ? -1 : 1, 0);
  for (const [a, b, c] of tris) {
    const A = new THREE.Vector3(alle[a].x, y, alle[a].y), B = new THREE.Vector3(alle[b].x, y, alle[b].y), C = new THREE.Vector3(alle[c].x, y, alle[c].y);
    const ny = (B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z);
    if ((ny >= 0) === !down) bau.tri(key, A, B, C, n); else bau.tri(key, A, C, B, n);
  }
}

// Einrichtung (Nr. 96, 10.11.2026): alle Möbel eines Geschosses in zwei Meshes mit Farben je Ecke (matt und glänzend) statt je Farbe ein Material.
// So bleiben es zwei Zeichenaufrufe je Geschoss, egal wie viele Bücher, Stühle und Pflanzen darin stehen.
let EIN_MAT = null;
const einMat = () => EIN_MAT ??= [new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.6 })];
const _c = new THREE.Color(), _m4 = new THREE.Matrix4();
class Einrichtung {
  constructor() { this.t = [{ pos: [], nor: [], col: [] }, { pos: [], nor: [], col: [] }]; }
  // Kasten wie Bau.box (kit/geo.js): Mitte (cx, cz), Boden cy, sx entlang (cos rot, -sin rot), sz entlang (sin rot, cos rot)
  box(glanz, farbe, cx, cy, cz, sx, sy, sz, rot = 0) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const T = this.t[glanz ? 1 : 0]; _c.set(farbe); const co = Math.cos(rot), si = Math.sin(rot), hx = sx / 2, hz = sz / 2;
    const P = (x, yy, z) => [cx + x * co + z * si, cy + yy, cz - x * si + z * co], ax = [co, 0, -si], az = [si, 0, co];
    const quad = (a, b, c, d, n) => { for (const v of [a, b, c, a, c, d]) { T.pos.push(v[0], v[1], v[2]); T.nor.push(n[0], n[1], n[2]); T.col.push(_c.r, _c.g, _c.b); } };
    const A = P(-hx, 0, -hz), B = P(hx, 0, -hz), C = P(hx, 0, hz), D = P(-hx, 0, hz), E = P(-hx, sy, -hz), F = P(hx, sy, -hz), G = P(hx, sy, hz), H = P(-hx, sy, hz);
    quad(E, H, G, F, [0, 1, 0]); quad(A, B, C, D, [0, -1, 0]); quad(D, C, G, H, az); quad(B, A, E, F, [-az[0], 0, -az[2]]); quad(C, B, F, G, ax); quad(A, D, H, E, [-ax[0], 0, -ax[2]]);
  }
  geo(glanz, farbe, g, matrix) {
    const T = this.t[glanz ? 1 : 0]; _c.set(farbe);
    const ng = g.index ? g.toNonIndexed() : g; ng.applyMatrix4(matrix); ng.computeVertexNormals();
    const p = ng.attributes.position.array, n = ng.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) { T.pos.push(p[i], p[i + 1], p[i + 2]); T.nor.push(n[i], n[i + 1], n[i + 2]); T.col.push(_c.r, _c.g, _c.b); }
    g.dispose(); if (ng !== g) ng.dispose();
  }
  build() {
    const out = [];
    this.t.forEach((T, i) => {
      if (!T.pos.length) return;
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(T.pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(T.nor, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(T.col, 3));
      bg.computeBoundingSphere();
      const m = new THREE.Mesh(bg, einMat()[i]); m.name = i ? 'einrichtungGlanz' : 'einrichtung'; out.push(m);
    });
    return out;
  }
}

export class Innen {
  // haus: { id, pts (Welt, Meter), y0, h, typ, variant, seed, laeden, eingang (Kantenindex) }
  constructor(mats, haus) {
    this.mats = mats; this.haus = haus; this.id = haus.id; this.y0 = haus.y0 || 0; this.ok = false; this.geschosse = new Map();
    const plan = this.plan = hausPlan({ pts: haus.pts, height: haus.h, type: haus.typ, variant: haus.variant, seed: haus.seed, laeden: haus.laeden, eingang: haus.eingang });
    if (!plan.tuer) return;
    const P = this.P = plan.pts, t = plan.tuer, n = P.length;
    const fb = GESCHOSS[haus.typ] ? null : geschosseAusFenstern(plan.oeffnungen, haus.h);   // die alten Typen aus kit/buildings.js haben feste Maße
    if (fb) { this.boden = [0, ...fb.boeden]; this.N = fb.boeden.length; this.fH = fb.fH; this.gH = fb.boeden[0]; }
    else {
      const [gH, fH, minN] = GESCHOSS[haus.typ] || [4.0, 3.2, 1];
      this.N = Math.max(minN, Math.round((haus.h - gH) / fH)); this.fH = fH; this.gH = gH;
      this.boden = [0]; for (let k = 1; k <= this.N; k++) this.boden.push(gH + (k - 1) * fH);
    }
    this.dachUnten = Math.min(plan.top, this.boden[this.N] + this.fH) - 0.3;
    this.R = rng(haus.seed * 7 + 3); this.K = { ...K };
    // Rahmen an der Haustür
    const a = P[t.i], b = P[(t.i + 1) % n], L = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const r = [(a[0] - b[0]) / L, (a[1] - b[1]) / L], nn = edgeNormal(a, b), m = [-nn[0], -nn[1]];
    this.tuer = { ...t, L, o: b, r, n: nn, m, mitte: [b[0] + r[0] * (t.u0 + t.u1) / 2, b[1] + r[1] * (t.u0 + t.u1) / 2] };
    const c = this.tuer.mitte, lok = P.map(p => [(p[0] - c[0]) * r[0] + (p[1] - c[1]) * r[1], (p[0] - c[0]) * m[0] + (p[1] - c[1]) * m[1]]);
    const uMin = Math.min(...lok.map(p => p[0])), uMax = Math.max(...lok.map(p => p[0])), vMax = Math.max(...lok.map(p => p[1]));
    if (uMax - uMin >= vMax) { this.pAx = r; this.qAx = m; this.langs = true; } else { this.pAx = m; this.qAx = r; this.langs = false; }
    this.c = c;
    this.lokal = P.map(p => this.zuLokal(p[0], p[1]));
    this.pMin = Math.min(...this.lokal.map(p => p[0])); this.pMax = Math.max(...this.lokal.map(p => p[0]));
    this.qMin = Math.min(...this.lokal.map(p => p[1])); this.qMax = Math.max(...this.lokal.map(p => p[1]));
    // Innenhülle je Geschoss: Außenwand 0,3 m, an Lobbys tiefer (Glas steht zurück)
    this.ringe = []; this.tiefen = [];
    for (let k = 0; k <= this.N; k++) {
      const y0 = this.boden[k], y1 = k < this.N ? this.boden[k + 1] : this.dachUnten + 0.3, d = [];
      for (let i = 0; i < n; i++) {
        let md = 0;
        for (const o of plan.oeffnungen) if (o.i === i && o.v1 > y0 + 0.05 && o.v0 < y1 - 0.05) md = Math.max(md, o.d);
        if (k === 0 && i === t.i) md = Math.max(md, t.d);
        d.push(Math.max(HUELLE, md + (md > 0.6 ? 0.3 : 0.08)));
      }
      this.tiefen.push(d); this.ringe.push(ringVar(P, d));
    }
    this.grundriss();
    this.geschosse = new Map(); this.ok = true;
  }
  zuLokal(x, z) { const dx = x - this.c[0], dz = z - this.c[1]; return [dx * this.pAx[0] + dz * this.pAx[1], dx * this.qAx[0] + dz * this.qAx[1]]; }
  zuWelt(p, q) { return [this.c[0] + this.pAx[0] * p + this.qAx[0] * q, this.c[1] + this.pAx[1] * p + this.qAx[1] * q]; }
  ringLokal(k) { return this.ringe[k].map(p => this.zuLokal(p[0], p[1])); }

  // ---------- Grundriss: Flur, Scheiben, Kern ----------
  // Der Flur liegt auf der Linie q = qc, die durch die Tür (p = 0) läuft und innerhalb der Hülle am längsten ist (bei U und L Formen
  // liegt die Mitte des q Bereichs im Hof). Scheiben nur entlang des Flurs; tiefe Räume (Flügel) bekommen eine Querwand mit Tür.
  grundriss() {
    const RL = this.ringLokal(Math.min(1, this.N)), qExt = this.qMax - this.qMin;   // Ring der Obergeschosse (0,3 m): kleine Lobbyhäuser haben im Erdgeschoss fast keine Fläche, der Kern darf dort in die Lobbyzone ragen
    const innen = (p, q) => inside(RL, p, q);
    const spanne = q => {   // alle Schnitte der Linie q mit der Hülle, Paare bilden, das Intervall nächst der Tür (p = 0) nehmen
      const xs = [];
      for (let i = 0; i < RL.length; i++) { const a = RL[i], b = RL[(i + 1) % RL.length]; if ((a[1] > q) !== (b[1] > q)) xs.push(a[0] + (b[0] - a[0]) * (q - a[1]) / (b[1] - a[1])); }
      xs.sort((x, y) => x - y); let best = null;
      for (let i = 0; i + 1 < xs.length; i += 2) { const d = xs[i] > 0 ? xs[i] : xs[i + 1] < 0 ? -xs[i + 1] : 0, L = xs[i + 1] - xs[i]; if (L < 3) continue; if (!best || d < best.d - 0.01 || (Math.abs(d - best.d) < 0.01 && L > best.L)) best = { d, L, sp: [xs[i] + 0.02, xs[i + 1] - 0.02] }; }
      return best;
    };
    this.modus = qExt >= 7.5 ? 'flur' : 'reihe';
    let best = null;
    if (this.modus === 'flur') {
      const qa = this.langs ? this.qMin + 3.2 : this.qMin + 2.6, qb = this.langs ? this.qMax - 3.2 : this.qMax - 2.6, qm = (this.qMin + this.qMax) / 2;
      for (let q = qa; q <= qb; q += 0.5) { const sp = spanne(q); if (!sp) continue; const wert = sp.L - sp.d * 1.5 - Math.abs(q - qm) * 0.15; if (!best || wert > best.wert) best = { q, sp: sp.sp, wert }; }
      if (!best) this.modus = 'reihe';
    }
    if (this.modus === 'flur') { this.qc = best.q; this.flur = [best.q - 0.9, best.q + 0.9]; this.pA = best.sp[0]; this.pB = best.sp[1]; }
    else {
      this.qc = (this.qMin + this.qMax) / 2; this.flur = null;
      const sp = spanne(this.qc); this.pA = sp ? sp.sp[0] : this.pMin + HUELLE; this.pB = sp ? sp.sp[1] : this.pMax - HUELLE;
    }
    const seiten = this.modus === 'flur' ? [{ s: +1, q0: this.qc + 0.9, raeume: [] }, { s: -1, q0: this.qc - 0.9, raeume: [] }] : [{ s: 0, q0: this.qc, raeume: [] }];
    const tiefe = (p, q, dq) => strahl(RL, p, q, 0, dq, 100);
    // Kern: 7,3 m lang, mindestens 2,4 m tief, Ecken in der Hülle, möglichst nah an der Halle
    const passt = (ps, s) => {
      const dq = s === 0 ? 1 : s;
      const qw = s === 0 ? this.qc - Math.min(...[ps + 0.3, ps + this.K.lang / 2, ps + this.K.lang - 0.2].map(pp => tiefe(pp, this.qc, -1))) + 0.1 : this.qc + s * 0.9;   // Reihe: an der nahen Hülle
      let d = Infinity; for (const pp of [ps + 0.3, ps + this.K.lang / 2, ps + this.K.lang - 0.2]) { if (!innen(pp, qw + dq * 0.05)) return null; d = Math.min(d, tiefe(pp, qw + dq * 0.05, dq)); }
      const across = Math.min(this.K.breite, d - 0.25); if (across < 2.4) return null;
      const q0 = s < 0 ? qw - across : qw, q1 = q0 + across;
      for (const [pp, qq] of [[ps + 0.05, q0 + 0.05], [ps + this.K.lang + 0.1, q0 + 0.05], [ps + 0.05, q1 - 0.05], [ps + this.K.lang + 0.1, q1 - 0.05]]) if (!innen(pp, qq)) return null;
      return { ps, s, q0, q1, across };
    };
    let kern = null;
    const hm = Math.max(this.pA + 2.1, Math.min(this.pB - 2.1, 0));   // Halle so nah wie möglich an der Tür, aber am Flur
    const halleP = this.langs || this.modus === 'reihe' ? [hm - 2.1, hm + 2.1] : null;
    for (const lauf of [4.2, 3.4]) {
      this.K.lauf = lauf; this.K.lang = 2 * this.K.zone + lauf;
      const kand = [];
      for (const s of (this.modus === 'flur' ? [+1, -1] : [0])) for (let ps = this.pA + 0.3; ps <= this.pB - this.K.lang - 0.4; ps += 0.7) {
        if (halleP && s === (this.langs ? -1 : 0) && ps < halleP[1] + 0.2 && ps + this.K.lang + 0.3 > halleP[0] - 0.2) continue;   // nicht in die Halle
        if (this.modus === 'reihe' && ps + this.K.lang + 0.3 < this.pB - 0.5 && ps > this.pA + 0.5) continue;                        // Reihe: Kern nur am Ende
        kand.push([Math.abs(ps + this.K.lang / 2 - hm) + (s === -1 ? 0.5 : 0), ps, s]);
      }
      kand.sort((x, y) => x[0] - y[0]);
      for (const [, ps, s] of kand) { kern = passt(ps, s); if (kern) break; }
      if (kern) break;
    }
    if (kern) { kern.art = 'u'; kern.pE = kern.ps + this.K.lang + 0.15; kern.p0 = kern.ps - 0.15; }
    else {   // kein Platz für zwei Läufe: Wendeltreppe 2,9 m × 2,9 m (Radius 1,15, 16 Stufen je Umlauf, Öffnung zum Flur)
      const kand = [];
      for (const s of (this.modus === 'flur' ? [+1, -1] : [0])) for (let cp = this.pA + 1.45; cp <= this.pB - 1.45; cp += 0.5) {
        if (halleP && s === (this.langs ? -1 : 0) && cp - 1.5 < halleP[1] && cp + 1.5 > halleP[0]) continue;
        kand.push([Math.abs(cp - hm) + (s === -1 ? 0.5 : 0), cp, s]);
      }
      kand.sort((x, y) => x[0] - y[0]);
      for (const [, cp, s] of kand) {
        const cq = s === 0 ? this.qc : this.qc + s * (0.9 + 1.32);   // Ring (Radius 1,3) direkt an der Flurwand, braucht 2,65 m Tiefe
        if ([[cp - 1.27, cq - 1.27], [cp + 1.27, cq - 1.27], [cp - 1.27, cq + 1.27], [cp + 1.27, cq + 1.27], [cp, cq], [cp, cq - 1.3], [cp, cq + 1.3], [cp - 1.3, cq], [cp + 1.3, cq]].every(([pp, qq]) => innen(pp, qq))) {
          const aE = s === 0 ? (cp > hm ? Math.PI : 0) : (s > 0 ? -Math.PI / 2 : Math.PI / 2);   // Eintritt: zum Flur hin (Reihe: zur Tür hin)
          kern = { art: 'wendel', s, cp, cq, r: 1.15, aE, ps: cp - 1.4, p0: cp - 1.4, pE: cp + 1.4, q0: cq - 1.4, q1: cq + 1.4, across: 2.8 }; break;
        }
      }
    }
    this.kern = kern;
    this.halle = halleP ? { s: this.langs ? -1 : 0, p0: halleP[0], p1: halleP[1] } : null;
    // Scheiben je Seite über die Länge des Flurs: feste Stücke (Halle, Kern), Rest in rund 4,6 m
    for (const S of seiten) {
      const fest = [];
      if (this.halle && this.halle.s === S.s) fest.push({ p0: this.halle.p0, p1: this.halle.p1, art: 'halle' });
      if (kern && kern.s === S.s) fest.push({ p0: kern.p0, p1: kern.pE, art: 'treppe' });
      fest.sort((x, y) => x.p0 - y.p0);
      const luecken = []; let p = this.pA;
      for (const f of fest) { if (f.p0 > p + 0.5) luecken.push([p, f.p0]); p = Math.max(p, f.p1); }
      if (this.pB > p + 0.5) luecken.push([p, this.pB]);
      const raeume = [...fest];
      for (const [x, y] of luecken) { const n = Math.max(1, Math.round((y - x) / 4.6)); for (let i = 0; i < n; i++) raeume.push({ p0: x + (y - x) * i / n, p1: x + (y - x) * (i + 1) / n, art: 'raum' }); }
      raeume.sort((x, y) => x.p0 - y.p0);
      S.raeume = raeume.filter(r => r.p1 - r.p0 > 1.2 || r.art !== 'raum');
      // Tiefe je Raum (an der Mitte gemessen), tiefe Räume bekommen eine Querwand mit Tür bei 4,6 m
      for (const r of S.raeume) { const pm = (r.p0 + r.p1) / 2; r.tiefe = S.s === 0 ? tiefe(pm, this.qc, -1) + tiefe(pm, this.qc, 1) : (innen(pm, S.q0 + S.s * 0.05) ? tiefe(pm, S.q0 + S.s * 0.05, S.s) : 0); r.quer = S.s !== 0 && r.art === 'raum' && r.tiefe > 7.5; }
    }
    this.seiten = seiten;
  }

  // ---------- Wände eines Geschosses (lokal), mit Türen als Lücken ----------
  waende(k) {
    const RL = this.ringLokal(k), W = [], kern = this.kern, seiten = this.seiten;
    const wand = (p0, q0, p1, q1, tueren = []) => { if (Math.hypot(p1 - p0, q1 - q0) > 0.15) W.push({ a: [p0, q0], b: [p1, q1], tueren }); };
    const innen = (p, q) => inside(RL, p, q);
    const clip = (p, q, dp, dq) => { if (!innen(p + dp * 0.05, q + dq * 0.05)) return 0; const d = strahl(RL, p, q, dp, dq, 100); return d >= 100 ? 0 : d; };
    if (this.modus === 'flur') {
      for (const S of seiten) {
        const qw = S.q0, pA = this.pA, pB = this.pB, L = pB - pA, t = p => (p - pA) / L, tueren = [];
        for (const r of S.raeume) {
          if (r.art === 'halle') tueren.push([t(r.p0 + 0.1), t(r.p1 - 0.1)]);
          else if (r.art === 'treppe') tueren.push(kern.art === 'wendel' ? [t(kern.cp - 0.6), t(kern.cp + 0.6)] : [t(kern.ps + 0.1), t(kern.ps + this.K.zone - 0.1)]);
          else if (r.tiefe > 1.6) { const m = (r.p0 + r.p1) / 2; tueren.push([t(m - 0.5), t(m + 0.5)]); }
        }
        wand(pA, qw, pB, qw, tueren);
        for (let i = 1; i < S.raeume.length; i++) { const p = S.raeume[i].p0, d = clip(p, qw, 0, S.s); wand(p, qw, p, qw + S.s * d); }   // Zwischenwände nach außen
        for (const r of S.raeume) if (r.quer) { const q = qw + S.s * 4.6, a = Math.max(r.p0 + 0.05, -clip(0, q, -1, 0)), b2 = r.p1 - 0.05, m = (r.p0 + r.p1) / 2; if (innen(m, q)) wand(r.p0, q, r.p1, q, [[(m - 0.5 - r.p0) / (r.p1 - r.p0), (m + 0.5 - r.p0) / (r.p1 - r.p0)]]); }
      }
    } else {
      for (let i = 1; i < seiten[0].raeume.length; i++) {
        const r = seiten[0].raeume[i], p = r.p0, dA = clip(p, this.qc, 0, -1), dB = clip(p, this.qc, 0, 1);
        const q0 = this.qc - dA, q1 = this.qc + dB, L = q1 - q0; if (L < 0.5) continue;
        const nachbarTreppe = kern && (r.art === 'treppe' || seiten[0].raeume[i - 1].art === 'treppe');
        const tm = nachbarTreppe ? (kern.art === 'wendel' ? kern.cq : (kern.q0 + Math.min(kern.q1, kern.q0 + 1.3)) / 2) : this.qc;
        wand(p, q0, p, q1, [[(tm - 0.5 - q0) / L, (tm + 0.5 - q0) / L]]);
      }
    }
    if (kern) {   // Kern: lange Seite innen (wenn nicht an der Hülle), Enden, Geländer zwischen den Läufen (Kollision; Geometrie in treppe())
      const aussenQ = kern.s >= 0 ? kern.q1 : kern.q0, dq = kern.s >= 0 ? 1 : -1;
      const rest = clip(kern.ps + 1, aussenQ, 0, dq);
      if (rest > 0.35) wand(kern.p0, aussenQ, kern.pE, aussenQ);
      if (kern.s === 0 && clip(kern.ps + 1, kern.q0, 0, -1) > 0.35) wand(kern.p0, kern.q0, kern.pE, kern.q0);   // Reihe: Kern sitzt an der Hülle des Erdgeschosses, oben bleibt ein Streifen
      if (this.modus === 'flur') { wand(kern.p0, kern.q0, kern.p0, kern.q1); wand(kern.pE, kern.q0, kern.pE, kern.q1); }
      if (kern.art === 'u') {
        const sm = (kern.q0 + kern.q1) / 2;
        wand(kern.ps + this.K.zone, sm, kern.ps + this.K.zone + this.K.lauf, sm);
        if (this.modus === 'reihe') { const qw = kern.q1, L = kern.pE - kern.p0; wand(kern.p0, qw, kern.pE, qw, [[(kern.ps + 0.1 - kern.p0) / L, (kern.ps + this.K.zone - 0.1 - kern.p0) / L]]); }
      }
    }
    return W;
  }

  // ---------- Kollision ----------
  drin(x, z) { return inside(this.P, x, z); }
  tuerZone(x, z) {
    const t = this.tuer, dx = x - t.o[0], dz = z - t.o[1], u = dx * t.r[0] + dz * t.r[1], w = dx * t.n[0] + dz * t.n[1];
    return u > t.u0 - 0.2 && u < t.u1 + 0.2 && w > -(t.d + 1.0) && w < 0.9;
  }
  // Haustür (Nr. 96): Streifen um das Türblatt. Ist sie zu (offen unter 0,55), sperrt er; davor (Nische, Gehweg) und dahinter (Halle) bleibt frei
  imStreifen(x, z, rand = 0) {
    const t = this.tuer, dx = x - t.o[0], dz = z - t.o[1], u = dx * t.r[0] + dz * t.r[1], w = dx * t.n[0] + dz * t.n[1];
    return u > t.u0 - 0.2 - rand && u < t.u1 + 0.2 + rand && w < -(t.d - RADIUS - 0.05 - rand) && w > -(t.d + RADIUS + 0.12 + rand);
  }
  tuerFrei(x, z) { return (this.offen ?? 1) > 0.55 || !this.imStreifen(x, z); }
  kernRect() { const k = this.kern; return [[k.p0, k.q0], [k.pE, k.q0], [k.pE, k.q1], [k.p0, k.q1]]; }
  kernLokal(p, q) {   // u entlang des Kerns ab ps, s quer (0 .. across); null außerhalb. Wendel: r und Winkel rel zur Öffnung
    const k = this.kern; if (!k) return null;
    if (k.art === 'wendel') { const dp = p - k.cp, dq = q - k.cq, r = Math.hypot(dp, dq); if (r > k.r + 0.3) return null; let rel = Math.atan2(dq, dp) - k.aE; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); return { wendel: true, r, rel }; }
    const u = p - k.ps, s = k.s >= 0 ? q - k.q0 : k.q1 - q;
    if (u < 0 || u > this.K.lang || s < 0 || s > k.across) return null;
    return { u, s, streifen: s < k.across / 2 ? 1 : -1 };
  }
  frei(x, z, Z) {
    const e = Math.min(Z.etage, this.N), [p, q] = this.zuLokal(x, z);
    if (!inside(this.ringLokal(e), p, q) && !(this.kern && inside(this.kernRect(), p, q))) return false;   // Kern zählt immer als innen (Erdgeschoss mit Lobbyzone)
    const W = this.wandCache?.[e] || ((this.wandCache ??= [])[e] = this.waende(e));
    for (const w of W) {
      const [d, t] = segAbstand(p, q, w.a, w.b);
      if (d < RADIUS + WAND / 2 && !w.tueren.some(([t0, t1]) => t > t0 && t < t1)) return false;
    }
    for (const r of this.moebelSperren?.[e] || []) { if (Z.sicht && (r[4] ?? 2) < 1.6) continue; if (p > r[0] - RADIUS && p < r[2] + RADIUS && q > r[1] - RADIUS && q < r[3] + RADIUS) return false; }   // Kamera sieht über niedrige Möbel (Nr. 96)
    const kl = this.kernLokal(p, q);
    if (kl && kl.wendel) {
      if (kl.r < 0.24) return false;                                               // Säule
      if (kl.r > this.kern.r && Math.abs(kl.rel) > 0.62) return false;             // Brüstungsring, Öffnung 70 Grad
      return true;
    }
    if (kl) {
      if (kl.u > this.K.zone - 0.05 && Z.kSeg === null) {   // von der Zone aus auf die Läufe: Streifen +1 hinauf, -1 hinunter
        if (kl.streifen > 0 && e >= this.N) return false;
        if (kl.streifen < 0 && e === 0) return false;
      }
    }
    return true;
  }
  hoehe(x, z, Z) {
    const e = Math.min(Z.etage, this.N), [p, q] = this.zuLokal(x, z), kl = this.kernLokal(p, q);
    if (this.kern?.art === 'wendel') {   // Wendel: Winkel fortlaufend zählen, ein Umlauf je Geschoss, hinauf gegen den Uhrzeigersinn
      if (!kl || kl.r > this.kern.r) { if (Z.kSeg !== null) { Z.etage = Math.max(0, Math.min(this.N, Math.round(Z.kSeg + Z.wink / (2 * Math.PI)))); Z.kSeg = null; Z.wink = null; } return this.boden[Math.min(Z.etage, this.N)]; }
      if (Z.kSeg === null) { Z.kSeg = e; Z.wink = 0; Z.letzt = kl.rel; }
      let d = kl.rel - Z.letzt; d = Math.atan2(Math.sin(d), Math.cos(d)); Z.wink += d; Z.letzt = kl.rel;
      const f = Math.max(0, Math.min(this.N, Z.kSeg + Z.wink / (2 * Math.PI))), k0 = Math.min(this.N - 1, Math.floor(f)), fr = f - k0;
      return this.boden[k0] + fr * (this.boden[k0 + 1] - this.boden[k0]);
    }
    if (!kl || kl.u < this.K.zone) { if (Z.kSeg !== null) { Z.etage = Z.kSeg + (Z.auf ? 1 : 0); Z.kSeg = null; } return this.boden[Math.min(Z.etage, this.N)]; }
    if (Z.kSeg === null) { if (kl.streifen > 0) { if (e >= this.N) return this.boden[e]; Z.kSeg = e; Z.auf = true; } else { if (e === 0) return this.boden[e]; Z.kSeg = e - 1; Z.auf = false; } }
    const kS = Z.kSeg, f = Math.max(0, Math.min(1, (kl.u - this.K.zone) / this.K.lauf));
    let t;
    if (kl.u >= this.K.zone + this.K.lauf) t = 0.5; else t = kl.streifen > 0 ? 0.5 * f : 1 - 0.5 * f;
    // auf/ab merken für den Ausstieg: Streifen +1 bei u < Zone heißt zurück auf kSeg, Streifen -1 heißt kSeg + 1
    Z.auf = kl.streifen < 0;
    return this.boden[kS] + t * (this.boden[kS + 1] - this.boden[kS]);
  }
  decke(x, z, Z) { const e = Math.min(Z.etage, this.N); const [p, q] = this.zuLokal(x, z); const kl = this.kernLokal(p, q); if (kl && Z.kSeg !== null) return this.boden[Math.min(this.N, Z.kSeg + 1)] + (Z.kSeg + 1 < this.N ? this.fH : 0) - 0.3; return e < this.N ? this.boden[e + 1] - 0.22 : this.dachUnten; }

  // ---------- Geometrie eines Geschosses ----------
  geschoss(k) {
    if (this.geschosse.has(k)) return this.geschosse.get(k);
    const bau = new Bau(), E = new Einrichtung(), M = this.mats, y0 = this.boden[k], y1 = k < this.N ? this.boden[k + 1] : this.dachUnten + 0.22, hoch = y1 - 0.22 - y0;
    const RL = this.ringLokal(k), RW = this.ringe[k], kern = this.kern, wohnen = WOHNEN.has(this.haus.typ), laden = k === 0 && this.haus.laeden;
    const bodenKey = laden ? 'kachelWeiss' : wohnen ? 'parkett' : k === 0 ? 'kachelBeige' : 'teppich';
    const kreis = kern && kern.art === 'wendel' ? Array.from({ length: 16 }, (_, i) => [kern.cp + Math.cos(i / 16 * Math.PI * 2) * 1.38, kern.cq + Math.sin(i / 16 * Math.PI * 2) * 1.38]) : null;
    const lochL = kern && k > 0 ? (kreis || [[kern.ps + this.K.zone, kern.q0], [kern.ps + this.K.lang, kern.q0], [kern.ps + this.K.lang, kern.q1], [kern.ps + this.K.zone, kern.q1]]) : null;
    const lochW = lochL ? lochL.map(([p, q]) => this.zuWelt(p, q)) : null;
    const deckeLoch = kern && k < this.N ? lochW : null;
    polyLoch(bau, bodenKey, RW, lochW, y0 + 0.01, false);
    polyLoch(bau, 'decke', RW, deckeLoch, y1 - 0.22, true);
    if (kern && k === 0 && !this.kernRect().every(([pp, qq]) => inside(RL, pp, qq))) { const KW = this.kernRect().map(([pp, qq]) => this.zuWelt(pp, qq)); polyLoch(bau, bodenKey, KW, null, y0 + 0.012, false); polyLoch(bau, 'decke', KW, deckeLoch && kern.art === 'u' ? null : null, y1 - 0.222, true); }
    if (lochW) { for (let i = 0; i < lochW.length; i++) { const a = lochW[i], b = lochW[(i + 1) % lochW.length]; this.wandStueck(bau, 'wandInnen', a, b, y0 - 0.22, y0 + 0.01, true); } }   // Deckenkante am Treppenloch
    // Innenhülle je Kante mit Fensteröffnungen (Fassade von innen), Laibungen bis zum Glas
    const P = this.P, n = P.length, ops = this.plan.oeffnungen, T = this.tiefen[k];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], ra = RW[i], rb = RW[(i + 1) % n];
      const F = new Fassade(bau, rb, ra);   // Normale nach innen, u = 0 bei ra (Ecke a), wächst Richtung b (bau ohne pts: nichts wird gemerkt)
      const L0 = Math.hypot(a[0] - b[0], a[1] - b[1]), ex = (b[0] - a[0]) / L0, ez = (b[1] - a[1]) / L0, delta = (ra[0] - a[0]) * ex + (ra[1] - a[1]) * ez;
      const liste = [];
      for (const o of ops) {
        if (o.i !== i || o.v1 <= y0 + 0.05 || o.v0 >= y1 - 0.25) continue;
        liste.push({ u0: L0 - o.u1 - delta, u1: L0 - o.u0 - delta, v0: Math.max(o.v0, y0), v1: Math.min(o.v1, y1 - 0.22), d: o.d });
      }
      if (k === 0 && i === this.tuer.i) { const t = this.tuer; liste.push({ u0: L0 - t.u1 - delta, u1: L0 - t.u0 - delta, v0: y0, v1: Math.min(t.v1, y1 - 0.25), d: t.d, tuer: true }); }
      const ok = liste.filter(o => o.u1 > 0.05 && o.u0 < F.L - 0.05 && o.v1 - o.v0 > 0.1).map(o => ({ ...o, u0: Math.max(0.02, o.u0), u1: Math.min(F.L - 0.02, o.u1) }));
      F.band('wandInnen', y0, y1 - 0.22, ok, 0);
      { // Fußleiste innen an der Außenwand (nicht bei Glas bis zum Boden), Heizkörper unter den Fenstern (Nr. 96)
        const dr = DREH(F.r.x, F.r.z);
        if (!ok.some(o => o.v0 < y0 + 0.15) && !(laden && k === 0) && F.L > 0.3) { const c = F.P(F.L / 2, 0, 0.009); E.box(0, 0xefede6, c.x, y0 + 0.01, c.z, F.L - 0.04, 0.075, 0.018, dr); }
        if (!(laden && k === 0)) for (const o of ok) {
          if (o.tuer || o.v0 - y0 < 0.6 || o.v0 - y0 > 1.4 || o.u1 - o.u0 < 0.5) continue;
          const b = Math.min(1.1, o.u1 - o.u0 - 0.1), top = Math.min(o.v0 - 0.1, y0 + 0.72); if (top - y0 < 0.35) continue;
          const c = F.P((o.u0 + o.u1) / 2, 0, 0.075); E.box(0, 0xf1f0ec, c.x, y0 + 0.13, c.z, b, top - y0 - 0.15, 0.08, dr); E.box(0, 0xd6d4ce, c.x, top - 0.02, c.z, b - 0.02, 0.02, 0.07, dr);
          const v = F.P((o.u0 + o.u1) / 2 + b / 2 - 0.04, 0, 0.075); E.box(1, 0xc8ccd0, v.x, y0 + 0.06, v.z, 0.03, 0.08, 0.03, dr);
        }
      }
      for (const o of ok) {   // Laibung vom Glas bis zur Innenwand (Tiefe der Hülle T minus Lage des Glases)
        const d = T[i] - o.d; if (d < 0.03) continue;
        const B = bau, P4 = (u, v, w) => F.P(u, v, -w);
        B.face('wandInnen', P4(o.u0, o.v0, 0), P4(o.u0, o.v0, d), P4(o.u0, o.v1, d), P4(o.u0, o.v1, 0), F.r);
        B.face('wandInnen', P4(o.u1, o.v0, 0), P4(o.u1, o.v0, d), P4(o.u1, o.v1, d), P4(o.u1, o.v1, 0), F.r.clone().negate());
        B.face('wandInnen', P4(o.u0, o.v1, 0), P4(o.u1, o.v1, 0), P4(o.u1, o.v1, d), P4(o.u0, o.v1, d), new THREE.Vector3(0, -1, 0));
        if (!o.tuer) B.face('stein', P4(o.u0, o.v0, 0), P4(o.u1, o.v0, 0), P4(o.u1, o.v0, d), P4(o.u0, o.v0, d), new THREE.Vector3(0, 1, 0));
      }
    }
    // Zwischenwände mit Türrahmen und offenen Türblättern
    for (const w of this.waende(k)) {
      const a = this.zuWelt(...w.a), b = this.zuWelt(...w.b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const segs = [], ts = w.tueren.slice().sort((x, y) => x[0] - y[0]); let t0 = 0;
      for (const [d0, d1] of ts) { segs.push([t0, d0]); t0 = d1; } segs.push([t0, 1]);
      for (const [s0, s1] of segs) if (s1 - s0 > 1e-3) this.wandStueck(bau, 'wandInnen', [a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0], [a[0] + (b[0] - a[0]) * s1, a[1] + (b[1] - a[1]) * s1], y0, y1 - 0.22);
      if (L > 0.2) { const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, dr = DREH(ux, uz); for (const [s0, s1] of segs) { const l = (s1 - s0) * L; if (l < 0.15) continue; const mx = a[0] + (b[0] - a[0]) * (s0 + s1) / 2, mz = a[1] + (b[1] - a[1]) * (s0 + s1) / 2; for (const sg of [-1, 1]) E.box(0, 0xefede6, mx - uz * sg * (WAND / 2 + 0.009), y0 + 0.01, mz + ux * sg * (WAND / 2 + 0.009), l, 0.075, 0.018, dr); } }   // Fußleisten beidseitig (Nr. 96)
      for (const [d0, d1] of ts) {   // Sturz über der Tür (2,1 m), Rahmen, Blatt 80 Grad offen (nicht bei Halle und Treppe: Durchgang)
        const breit = (d1 - d0) * L; if (breit > 1.6) continue;
        const A = [a[0] + (b[0] - a[0]) * d0, a[1] + (b[1] - a[1]) * d0], Bp = [a[0] + (b[0] - a[0]) * d1, a[1] + (b[1] - a[1]) * d1];
        this.wandStueck(bau, 'wandInnen', A, Bp, y0 + 2.1, y1 - 0.22);
        const ux = (Bp[0] - A[0]) / breit, uz = (Bp[1] - A[1]) / breit, nx = -uz, nz = ux;
        for (const [px, pz] of [A, Bp]) bau.box('tuerHolz', px + ux * 0.04 * (px === A[0] ? 1 : -1), y0, pz + uz * 0.04 * (px === A[0] ? 1 : -1), 0.08, 2.1, WAND + 0.04, DREH(ux, uz));
        bau.box('tuerHolz', (A[0] + Bp[0]) / 2, y0 + 2.06, (A[1] + Bp[1]) / 2, breit, 0.06, WAND + 0.04, DREH(ux, uz));
        const w0 = 0.8, cx = A[0] + ux * 0.05 + nx * (w0 / 2 + 0.06), cz = A[1] + uz * 0.05 + nz * (w0 / 2 + 0.06);   // Blatt steht in den Raum
        bau.box('tuerHolz', cx, y0 + 0.01, cz, 0.04, 2.02, w0, Math.atan2(ux, uz) + Math.PI / 2 + 0.17);
      }
    }
    if (kern && k < this.N) { if (kern.art === 'wendel') this.wendel(bau, k); else this.treppe(bau, k, E); }
    this.moebel(bau, k, wohnen, laden, E);
    const g = bau.build(M, { shadow: false });
    for (const m of E.build()) g.add(m);   // Einrichtung: zwei Zeichenaufrufe je Geschoss (Nr. 96)
    g.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } });
    g.position.y = this.y0;
    this.geschosse.set(k, g);
    return g;
  }
  // senkrechtes Wandstück zwischen zwei Weltpunkten, beidseitig sichtbar (zwei Flächen) mit Dicke WAND
  wandStueck(bau, key, a, b, yA, yB, duenn = false) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.02) return;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nz = ux, h = duenn ? 0.01 : WAND / 2;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    bau.face(key, V(a[0] + nx * h, yA, a[1] + nz * h), V(b[0] + nx * h, yA, b[1] + nz * h), V(b[0] + nx * h, yB, b[1] + nz * h), V(a[0] + nx * h, yB, a[1] + nz * h), V(nx, 0, nz));
    bau.face(key, V(a[0] - nx * h, yA, a[1] - nz * h), V(b[0] - nx * h, yA, b[1] - nz * h), V(b[0] - nx * h, yB, b[1] - nz * h), V(a[0] - nx * h, yB, a[1] - nz * h), V(-nx, 0, -nz));
    if (!duenn) {   // Stirnseiten
      for (const [p, s] of [[a, -1], [b, 1]]) bau.face(key, V(p[0] + nx * h, yA, p[1] + nz * h), V(p[0] - nx * h, yA, p[1] - nz * h), V(p[0] - nx * h, yB, p[1] - nz * h), V(p[0] + nx * h, yB, p[1] + nz * h), V(ux * s, 0, uz * s));
      bau.face(key, V(a[0] + nx * h, yB, a[1] + nz * h), V(b[0] + nx * h, yB, b[1] + nz * h), V(b[0] - nx * h, yB, b[1] - nz * h), V(a[0] - nx * h, yB, a[1] - nz * h), V(0, 1, 0));
    }
  }
  // Treppe von Geschoss k nach k + 1: zwei Läufe als Stufenblöcke, Podest, Geländer, Deckenkante
  treppe(bau, k, E = null) {
    const kern = this.kern, y0 = this.boden[k], y1 = this.boden[k + 1], halb = (y1 - y0) / 2, nSt = Math.max(6, Math.round(halb / 0.17)), run = this.K.lauf / nSt;
    const sw = kern.across / 2, rot = DREH(this.pAx[0], this.pAx[1]);
    const sMitte = s => kern.s >= 0 ? kern.q0 + s : kern.q1 - s;   // Streifenmitte quer (lokal q)
    const box = (key, p, q, sp, sq, yA, yB) => { const [x, z] = this.zuWelt(p, q); bau.box(key, x, yA, z, sp, yB - yA, sq, rot); };
    const wohnen = WOHNEN.has(this.haus.typ), SK = wohnen ? 'parkett' : 'stufe';   // Altbau und Wohnhaus: Holzstufen
    for (let i = 0; i < nSt; i++) {
      const u = kern.ps + this.K.zone + run * (i + 0.5);
      // Stufen hohl mit getreppter Unterseite (Laufplatte 0,2 m): bis 10.11.2026 massive Klötze vom Geschossboden, die Treppe des nächsten
      // Geschosses stand so als Block im Kopfraum des Laufs darunter (Nr. 96)
      const tA = y0 + halb * (i + 1) / nSt, tB = y0 + halb + halb * (nSt - i) / nSt, st = halb / nSt + 0.2;
      box(SK, u, sMitte(sw / 2), run, sw - 0.04, Math.max(y0, tA - st), tA);                  // Lauf A (Streifen +1) hinauf
      box(SK, u, sMitte(sw * 1.5), run, sw - 0.04, Math.max(y0 + halb - 0.2, tB - st), tB);   // Lauf B (Streifen -1) weiter hinauf
    }
    box(SK, kern.ps + this.K.zone + this.K.lauf + this.K.zone / 2, sMitte(sw), this.K.zone, kern.across - 0.04, y0 + halb - 0.2, y0 + halb);   // Podest als Platte
    // Geländer: schräge Bänder über den Stufen auf der Innenseite der Läufe, Handlauf oben
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const band = (p0, p1, ya, yb, q, nq) => {
      const A = this.zuWelt(p0, q), B = this.zuWelt(p1, q), [nx, nz] = [this.qAx[0] * nq, this.qAx[1] * nq];
      for (const s of [1, -1]) bau.face('gelaender', V(A[0], ya + 0.02, A[1]), V(B[0], yb + 0.02, B[1]), V(B[0], yb + 0.95, B[1]), V(A[0], ya + 0.95, A[1]), V(nx * s, 0, nz * s));
    };
    const qm = sMitte(sw), pA = kern.ps + this.K.zone, pB = pA + this.K.lauf;
    // Wohnhaus: Stabgeländer mit Holzhandlauf (Nr. 96), sonst Brüstung mit Handlauf
    const handlauf = (ya, yb) => { if (!E) return; const A = this.zuWelt(pA, qm), B = this.zuWelt(pB, qm), Lh = Math.hypot(this.K.lauf, yb - ya); _m4.compose(new THREE.Vector3((A[0] + B[0]) / 2, (ya + yb) / 2 + 0.95, (A[1] + B[1]) / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, DREH(this.pAx[0], this.pAx[1]), Math.atan2(yb - ya, this.K.lauf), 'YZX')), new THREE.Vector3(1, 1, 1)); E.geo(0, wohnen ? 0x6b4a32 : 0x3a3c40, new THREE.BoxGeometry(Lh, 0.05, 0.07), _m4); };
    const staebe = (ya, yb) => { if (!E) return; for (let t = 0.06; t < 1; t += 0.24 / this.K.lauf) { const [x, z] = this.zuWelt(pA + t * this.K.lauf, qm); E.box(1, 0x2a2b2e, x, ya + (yb - ya) * t, z, 0.018, 0.93, 0.018, rot); } };
    if (wohnen && E) { staebe(y0, y0 + halb); staebe(y1, y0 + halb); }
    else { band(pA, pB, y0, y0 + halb, qm, 1); band(pA, pB, y1, y0 + halb, qm, 1); }
    handlauf(y0, y0 + halb); handlauf(y1, y0 + halb);
    if (k > 0) {   // Absturzsicherung am Treppenloch des Geschosses: Rand der Zone zu den Läufen hin gehört zur Treppe (frei), Rest hat Wände
    }
  }
  // Wendeltreppe von k nach k + 1: 16 Trittstufen um eine Säule, Brüstungsring mit Öffnung zum Flur, Handlauf
  wendel(bau, k) {
    const kern = this.kern, y0 = this.boden[k], y1 = this.boden[k + 1], n = 16, rise = (y1 - y0) / n;
    const [cx, cz] = this.zuWelt(kern.cp, kern.cq);
    bau.geo('gelaender', new THREE.CylinderGeometry(0.2, 0.2, y1 - y0 + 0.3, 10), new THREE.Matrix4().makeTranslation(cx, (y0 + y1) / 2, cz));
    for (let i = 0; i < n; i++) {
      const a = kern.aE + (i + 0.5) / n * Math.PI * 2, pm = kern.cp + Math.cos(a) * 0.68, qm = kern.cq + Math.sin(a) * 0.68, [x, z] = this.zuWelt(pm, qm);
      // Trittstufe als Kasten 0,95 radial × 0,42 tangential, Drehung: lokaler Winkel a plus Drehung des Rahmens
      bau.box('stufe', x, y0 + rise * (i + 1) - 0.06, z, 0.95, 0.06, 0.42, DREH(this.pAx[0] * Math.cos(a) + this.qAx[0] * Math.sin(a), this.pAx[1] * Math.cos(a) + this.qAx[1] * Math.sin(a)));
    }
    // Brüstung: Ringsegmente (16) von Boden bis Decke, Öffnung 70 Grad um aE, beidseitig sichtbar
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, mitte = (a0 + a1) / 2;
      let rel = mitte - kern.aE; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); if (Math.abs(rel) < 0.62) continue;
      const A = this.zuWelt(kern.cp + Math.cos(a0) * 1.3, kern.cq + Math.sin(a0) * 1.3), B = this.zuWelt(kern.cp + Math.cos(a1) * 1.3, kern.cq + Math.sin(a1) * 1.3);
      const nx = B[1] - A[1], nz = -(B[0] - A[0]);
      for (const sgn of [1, -1]) bau.face('wandInnen', V(A[0], y0, A[1]), V(B[0], y0, B[1]), V(B[0], y1 - 0.22, B[1]), V(A[0], y1 - 0.22, A[1]), V(nx * sgn, 0, nz * sgn));
    }
  }
  // Einrichtung je Raum (Nr. 96, 10.11.2026): Möbel aus mehreren Teilen in echten Maßen. Wohnen: Schlafzimmer (Bett mit Kopfteil, Kissen und
  // Nachttischen, Kleiderschrank), Wohnzimmer (Sofa mit Lehnen und Polstern, Couchtisch, Fernsehbank, Regal mit Büchern, Stehlampe), Küche
  // (Zeile mit Fronten, Spüle, Kochfeld, Haube, Oberschränken, Kühlschrank, Esstisch mit Stühlen), kleine Räume als Bad (Wanne, WC,
  // Waschtisch, Spiegel, Fliesen). Büro: Schreibtische mit Bildschirm, Tastatur und Drehstuhl, Ordnerregal, Tafel, große Räume mit Besprechungstisch.
  // Laden: Regale mit Waren, Theke mit Kasse. Halle: Briefkästen oder Empfang. Dazu Teppiche, Pflanzen, Bilder und Lampen. Die Tür jedes
  // Raums liegt mittig an der Flurwand (f = 0): davor bleibt ein Gang von 1,3 m frei. Alles Sichtbare in der Einrichtung E (zwei
  // Zeichenaufrufe), leuchtende Teile im Bau. Sperren: [p0, q0, p1, q1, Höhe] für Kollision und Kamera (kit/collision.js)
  moebel(bau, k, wohnen, laden, E) {
    const RL = this.ringLokal(k), y = this.boden[k] + 0.012, yD = (k < this.N ? this.boden[k + 1] : this.dachUnten + 0.22) - 0.26, R = rng(this.haus.seed * 13 + k * 7 + 1);
    const rot = DREH(this.pAx[0], this.pAx[1]), handy = !!this.mobil;
    const sperren = (this.moebelSperren ??= [])[k] = [];
    const wahl = a => a[Math.floor(R() * a.length)];
    const RH = rng(this.haus.seed * 31 + 5), wahlH = a => a[Math.floor(RH() * a.length)];   // Farben je Haus
    const HOLZ = wahlH([0x8c6a4b, 0xa98458, 0x5e4330, 0xc9a77c, 0x46403b]), STOFF = wahlH([0x4e5f78, 0x9a6b55, 0x6b7355, 0x8a8f96, 0x3d3f45, 0xb59a7a, 0x7a3b3b]);
    const WEISS = 0xe6e4de, SCHWARZ = 0x1c1d20, METALL = 0x9ea2a6, FRONT = wahlH([0xe8e5de, 0x2e3a46, 0x7d8a6f, 0xd9cfc0, 0x3a3836]), PLATTE = wahlH([0x5f5b56, 0xd8d4cc, 0x8a6a4b, 0x2b2b2d]);
    const AKZENT = [0xb5473a, 0xd9a441, 0x3e6e8e, 0x2f6b4f, 0xc77d5a, 0x6d4a7a], BUCH = [0x7a2e2a, 0x2d4a6b, 0xc9b68a, 0x3f5a3a, 0x8a6a3a, 0xd8d0c0, 0x2a2a2e, 0x9c3f4f, 0x5b4a7a];
    const SCHIRM = wahlH([SCHWARZ, 0xece6da, 0xb48a3c]);
    let qAt = f => f, raum = [];
    const pq = (W, x, z) => [W.p(x, z), qAt(W.f(x, z))];
    const teil = (W, farbe, x0, x1, z0, z1, y0, y1, glanz = 0) => {
      const [pa, qa] = pq(W, x0, z0), [pb, qb] = pq(W, x1, z1), [wx, wz] = this.zuWelt((pa + pb) / 2, (qa + qb) / 2);
      E.box(glanz, farbe, wx, y + y0, wz, Math.abs(pb - pa), y1 - y0, Math.abs(qb - qa), rot);
    };
    const rund = (W, farbe, x, z, r0, r1, y0, y1, n = 10, glanz = 0) => { const [p, q] = pq(W, x, z), [wx, wz] = this.zuWelt(p, q); E.geo(glanz, farbe, new THREE.CylinderGeometry(r1, r0, y1 - y0, n), _m4.makeTranslation(wx, y + (y0 + y1) / 2, wz)); };
    const kugel = (W, farbe, x, z, r, yM) => { const [p, q] = pq(W, x, z), [wx, wz] = this.zuWelt(p, q); E.geo(0, farbe, new THREE.IcosahedronGeometry(r, handy ? 0 : 1), _m4.makeTranslation(wx, y + yM, wz)); };
    const rechteck = (W, x0, x1, z0, z1) => { const [pa, qa] = pq(W, x0, z0), [pb, qb] = pq(W, x1, z1); return [Math.min(pa, pb), Math.min(qa, qb), Math.max(pa, pb), Math.max(qa, qb)]; };
    // frei: ganz im Raum (Hülle des Geschosses) und ohne Überschneidung mit schon gestellten Möbeln dieses Raums
    const frei = (W, x0, x1, z0, z1) => { if (![[x0, z0], [x1, z0], [x1, z1], [x0, z1]].every(([x, z]) => inside(RL, ...pq(W, x, z)))) return false; const [a, b, c, d] = rechteck(W, x0, x1, z0, z1); return !raum.some(r => a < r[2] - 0.02 && c > r[0] + 0.02 && b < r[3] - 0.02 && d > r[1] + 0.02); };
    const sperre = (W, x0, x1, z0, z1, h = 1) => { const r = [...rechteck(W, x0, x1, z0, z1), h]; sperren.push(r); raum.push(r); };
    // ---------- Möbel (Rahmen W: x entlang der Wand, z von der Wand in den Raum, Höhen ab Boden) ----------
    const bett = (W, x, b, l = 2.0, mitTisch = true) => {
      if (!frei(W, x - b / 2, x + b / 2, 0, l)) return false;
      teil(W, HOLZ, x - b / 2, x + b / 2, 0, 0.07, 0, 1.0); teil(W, HOLZ, x - b / 2, x + b / 2, 0.07, l, 0.1, 0.32);
      for (const [a, c] of [[x - b / 2, 0.1], [x + b / 2 - 0.06, 0.1], [x - b / 2, l - 0.06], [x + b / 2 - 0.06, l - 0.06]]) teil(W, HOLZ, a, a + 0.06, c, c + 0.06, 0, 0.1);
      teil(W, 0xeceae4, x - b / 2 + 0.03, x + b / 2 - 0.03, 0.08, l - 0.03, 0.32, 0.52);
      teil(W, STOFF, x - b / 2 + 0.01, x + b / 2 - 0.01, 0.66, l - 0.01, 0.5, 0.59);
      for (const s of [-1, 1]) teil(W, 0xf3f1ec, x + s * b / 4 - b / 4 + 0.07, x + s * b / 4 + b / 4 - 0.07, 0.12, 0.52, 0.52, 0.66);
      sperre(W, x - b / 2, x + b / 2, 0, l, 0.6);
      if (mitTisch) for (const s of [-1, 1]) {
        const a = s < 0 ? x - b / 2 - 0.5 : x + b / 2 + 0.05, c = a + 0.45; if (!frei(W, a, c, 0.02, 0.44)) continue;
        teil(W, HOLZ, a, c, 0.02, 0.44, 0.04, 0.52); teil(W, 0x2a2b2e, a + 0.02, c - 0.02, 0.43, 0.445, 0.3, 0.32);
        const m = (a + c) / 2; rund(W, 0xb48a3c, m, 0.2, 0.06, 0.06, 0.52, 0.54, 10, 1); rund(W, 0xb48a3c, m, 0.2, 0.008, 0.008, 0.54, 0.8, 5, 1); rund(W, 0xece4d2, m, 0.2, 0.13, 0.09, 0.76, 0.95, 12);
        sperre(W, a, c, 0.02, 0.44, 0.5);
      }
      return true;
    };
    const sofa = (W, x, b, t = 0.92, z0 = 0.1) => {
      if (b < 1.5 || !frei(W, x - b / 2, x + b / 2, z0, z0 + t)) return false;
      const a0 = x - b / 2, a1 = x + b / 2, z1 = z0 + t;
      teil(W, STOFF, a0, a1, z0, z1, 0.1, 0.42); teil(W, STOFF, a0, a0 + 0.2, z0, z1, 0.1, 0.64); teil(W, STOFF, a1 - 0.2, a1, z0, z1, 0.1, 0.64);
      teil(W, STOFF, a0 + 0.2, a1 - 0.2, z0, z0 + 0.24, 0.42, 0.86);
      const n = b > 2.0 ? 3 : 2, w = (b - 0.4) / n;
      for (let i = 0; i < n; i++) { const c0 = a0 + 0.2 + i * w + 0.012, c1 = a0 + 0.2 + (i + 1) * w - 0.012; teil(W, STOFF, c0, c1, z0 + 0.24, z1 - 0.02, 0.42, 0.54); teil(W, STOFF, c0, c1, z0 + 0.22, z0 + 0.4, 0.5, 0.82); }
      teil(W, wahl(AKZENT), a0 + 0.24, a0 + 0.66, z0 + 0.36, z0 + 0.5, 0.54, 0.8); teil(W, wahl(AKZENT), a1 - 0.66, a1 - 0.24, z0 + 0.36, z0 + 0.5, 0.54, 0.8);
      for (const [a, c] of [[a0 + 0.05, z0 + 0.05], [a1 - 0.09, z0 + 0.05], [a0 + 0.05, z1 - 0.09], [a1 - 0.09, z1 - 0.09]]) teil(W, SCHWARZ, a, a + 0.04, c, c + 0.04, 0, 0.1);
      sperre(W, a0, a1, z0, z1, 0.86); return true;
    };
    const tisch = (W, x, z, b, t, h = 0.74, farbe = HOLZ, beine = HOLZ) => {
      if (!frei(W, x - b / 2, x + b / 2, z - t / 2, z + t / 2)) return false;
      teil(W, farbe, x - b / 2, x + b / 2, z - t / 2, z + t / 2, h - 0.04, h);
      for (const [a, c] of [[x - b / 2 + 0.05, z - t / 2 + 0.05], [x + b / 2 - 0.1, z - t / 2 + 0.05], [x - b / 2 + 0.05, z + t / 2 - 0.1], [x + b / 2 - 0.1, z + t / 2 - 0.1]]) teil(W, beine, a, a + 0.05, c, c + 0.05, 0, h - 0.04, beine === METALL ? 1 : 0);
      sperre(W, x - b / 2, x + b / 2, z - t / 2, z + t / 2, h); return true;
    };
    const stuhl = (W, x, z, s) => {   // s: Lehne auf der Seite +z (1) oder -z (-1)
      if (!frei(W, x - 0.22, x + 0.22, z - 0.22, z + 0.22)) return;
      teil(W, HOLZ, x - 0.21, x + 0.21, z - 0.21, z + 0.21, 0.44, 0.48);
      for (const [a, c] of [[x - 0.2, z - 0.2], [x + 0.17, z - 0.2], [x - 0.2, z + 0.17], [x + 0.17, z + 0.17]]) teil(W, HOLZ, a, a + 0.03, c, c + 0.03, 0, 0.44);
      const zb = z + s * 0.2; teil(W, HOLZ, x - 0.2, x + 0.2, Math.min(zb, zb - s * 0.03), Math.max(zb, zb - s * 0.03), 0.48, 0.9);
      sperre(W, x - 0.22, x + 0.22, z - 0.22, z + 0.22, 0.9);
    };
    const drehstuhl = (W, x, z) => {
      if (!frei(W, x - 0.3, x + 0.3, z - 0.3, z + 0.3)) return;
      teil(W, SCHWARZ, x - 0.3, x + 0.3, z - 0.025, z + 0.025, 0.05, 0.08); teil(W, SCHWARZ, x - 0.025, x + 0.025, z - 0.3, z + 0.3, 0.05, 0.08);
      rund(W, METALL, x, z, 0.025, 0.025, 0.08, 0.45, 8, 1);
      teil(W, 0x2e3136, x - 0.25, x + 0.25, z - 0.24, z + 0.24, 0.45, 0.53); teil(W, 0x2e3136, x - 0.23, x + 0.23, z + 0.2, z + 0.27, 0.56, 1.05);
      sperre(W, x - 0.3, x + 0.3, z - 0.3, z + 0.3, 1.05);
    };
    const regal = (W, x, b, h = 1.95, t = 0.32, mitBuechern = true, ordner = false) => {
      if (!frei(W, x - b / 2, x + b / 2, 0, t)) return false;
      const a0 = x - b / 2, a1 = x + b / 2, fach = 5;
      teil(W, HOLZ, a0, a0 + 0.025, 0, t, 0, h); teil(W, HOLZ, a1 - 0.025, a1, 0, t, 0, h); teil(W, HOLZ, a0, a1, 0, 0.012, 0, h);
      for (let i = 0; i <= fach; i++) { const yy = 0.04 + i * (h - 0.065) / fach; teil(W, HOLZ, a0 + 0.025, a1 - 0.025, 0.012, t, yy, yy + 0.025); }
      if (mitBuechern) for (let i = 0; i < fach; i++) {
        const yy = 0.065 + i * (h - 0.065) / fach, frei0 = (h - 0.065) / fach - 0.06;
        if (handy && i % 2) continue;
        let cx = a0 + 0.035;
        while (cx < a1 - 0.08) {
          if (R() < 0.07) { cx += 0.08 + R() * 0.12; continue; }
          const bw = ordner ? 0.075 : 0.022 + R() * 0.035, bh = Math.min(frei0, ordner ? 0.31 : 0.17 + R() * 0.11);
          teil(W, ordner ? wahl([0x2d4a6b, 0x7a2e2a, 0x3f5a3a, 0xd9a441, 0x2a2a2e]) : wahl(BUCH), cx, Math.min(a1 - 0.03, cx + bw), 0.03, t - 0.02 - R() * 0.04, yy, yy + bh);
          cx += bw + 0.004;
        }
      }
      sperre(W, a0, a1, 0, t, h); return true;
    };
    const schrank = (W, x, b, h = 2.15, t = 0.6, farbe = WEISS) => {
      if (b < 0.8 || !frei(W, x - b / 2, x + b / 2, 0, t)) return false;
      teil(W, farbe, x - b / 2, x + b / 2, 0, t, 0.05, h); teil(W, SCHWARZ, x - b / 2 + 0.02, x + b / 2 - 0.02, 0.03, t - 0.03, 0, 0.05);
      const n = Math.max(2, Math.round(b / 0.5));
      for (let i = 1; i < n; i++) { const u = x - b / 2 + b * i / n; teil(W, 0x55575a, u - 0.004, u + 0.004, t, t + 0.004, 0.08, h - 0.04); if (i % 2) for (const s of [-1, 1]) teil(W, METALL, u + s * 0.04 - 0.008, u + s * 0.04 + 0.008, t, t + 0.025, 0.95, 1.25, 1); }
      sperre(W, x - b / 2, x + b / 2, 0, t, h); return true;
    };
    const pflanze = (W, x, z, g = 1) => {
      if (!frei(W, x - 0.22 * g, x + 0.22 * g, z - 0.22 * g, z + 0.22 * g)) return;
      rund(W, wahl([0x9a5a3c, 0xd8d4cc, 0x3a3c40]), x, z, 0.14 * g, 0.18 * g, 0, 0.36 * g, 10); rund(W, 0x3a2c22, x, z, 0.16 * g, 0.16 * g, 0.36 * g - 0.03, 0.36 * g - 0.01, 10);
      const gr = wahl([0x3f6b35, 0x4f7d3a, 0x2f5a2e]);
      kugel(W, gr, x, z, 0.3 * g, 0.36 * g + 0.3 * g); kugel(W, gr, x + 0.12 * g, z + 0.06 * g, 0.22 * g, 0.36 * g + 0.58 * g); if (!handy) kugel(W, gr, x - 0.1 * g, z - 0.07 * g, 0.2 * g, 0.36 * g + 0.5 * g);
      sperre(W, x - 0.2 * g, x + 0.2 * g, z - 0.2 * g, z + 0.2 * g, 1.2 * g);
    };
    const stehlampe = (W, x, z) => {
      if (!frei(W, x - 0.16, x + 0.16, z - 0.16, z + 0.16)) return;
      rund(W, SCHWARZ, x, z, 0.15, 0.15, 0, 0.03, 12); rund(W, SCHWARZ, x, z, 0.012, 0.012, 0.03, 1.48, 6); rund(W, 0xece4d2, x, z, 0.23, 0.17, 1.42, 1.72, 14);
      sperre(W, x - 0.15, x + 0.15, z - 0.15, z + 0.15, 1.7);
    };
    const teppich = (W, x0, x1, z0, z1, farbe = wahl(AKZENT)) => { if (frei(W, x0, x1, z0, z1) || true) teil(W, farbe, x0, x1, z0, z1, -0.008, 0.004); };
    const bild = (W, x, yM, b = 0.7, h = 0.5) => {
      const r = wahl([0x2b2622, HOLZ, 0xd8d4cc]);
      teil(W, r, x - b / 2, x + b / 2, 0.004, 0.03, yM - h / 2, yM + h / 2);
      teil(W, wahl(AKZENT), x - b / 2 + 0.05, x + b / 2 - 0.05, 0.03, 0.034, yM - h / 2 + 0.05, yM + h / 2 - 0.05);
      teil(W, wahl([0xece6da, 0x3e6e8e, 0xd9a441, 0x2f6b4f]), x - b / 2 + 0.05, x + (R() - 0.5) * b * 0.4, 0.034, 0.037, yM - h / 2 + 0.05, yM + (R() - 0.3) * h * 0.4);
    };
    const lampe = (p, q, haengend) => {
      if (!inside(RL, p, q)) return; const [x, z] = this.zuWelt(p, q);
      if (!haengend) { bau.box('leuchte', x, yD, z, 0.6, 0.04, 0.6, rot); bau.box('schirm', x, yD + 0.04, z, 0.64, 0.03, 0.64, rot); return; }
      const oben = yD + 0.04, s = oben - 0.62;   // Pendelleuchte: Kabel 0,45 m, Schirm 0,2 m, Glühbirne darunter
      E.geo(0, SCHWARZ, new THREE.CylinderGeometry(0.005, 0.005, oben - s - 0.2, 4), _m4.makeTranslation(x, s + 0.2 + (oben - s - 0.2) / 2, z));
      E.geo(SCHIRM === 0xb48a3c ? 1 : 0, SCHIRM, new THREE.CylinderGeometry(0.06, 0.22, 0.2, 16), _m4.makeTranslation(x, s + 0.1, z));
      bau.box('leuchte', x, s - 0.02, z, 0.11, 0.1, 0.11, rot);
    };
    // ---------- Räume ----------
    for (const S of this.seiten) for (const r of S.raeume) {
      raum = [];
      const pm = (r.p0 + r.p1) / 2, breite = r.p1 - r.p0;
      const q0 = S.s === 0 ? this.qc - strahl(RL, pm, this.qc, 0, -1) : S.q0;
      const tiefe = Math.min(r.quer ? 4.6 : 100, S.s === 0 ? strahl(RL, pm, this.qc, 0, -1) + strahl(RL, pm, this.qc, 0, 1) : strahl(RL, pm, S.q0 + S.s * 0.02, 0, S.s));
      const dir = S.s === 0 ? 1 : S.s; qAt = f => q0 + dir * f;
      const aussen = pc => ({ p: x => pc + x, f: (x, z) => tiefe - z }), flur = pc => ({ p: x => pc + x, f: (x, z) => z });
      const links = fc => ({ p: (x, z) => r.p0 + z, f: x => fc + x }), rechts = fc => ({ p: (x, z) => r.p1 - z, f: x => fc + x });
      const M0 = flur(0);   // frei im Raum: x = p - 0, z = Abstand von der Flurwand
      const M = { p: x => x, f: (x, z) => z };
      if (S.s !== 0 && r.art === 'raum') sperre(M, pm - 0.65, pm + 0.65, 0, 1.35, 0);   // Gang vor der Tür bleibt frei (Höhe 0: keine Kollision)
      sperren.pop();   // nur für die Belegung des Raums, nicht für die Kollision
      if (r.art === 'treppe') { lampe(pm, qAt(tiefe / 2), false); continue; }
      if (r.art === 'halle') {
        lampe(pm, qAt(tiefe / 2), false);
        if (wohnen) {   // Briefkastenanlage an der Seitenwand, je Wohnung ein Kasten
          const n = Math.min(16, Math.max(4, 2 * this.N)), sp = 4, zl = Math.ceil(n / sp), W = links(Math.min(tiefe - 0.9, Math.max(0.9, tiefe / 2)));
          if (frei(W, -0.66, 0.66, 0, 0.14)) { for (let i = 0; i < n; i++) { const c = i % sp, z0 = Math.floor(i / sp), x0 = -0.64 + c * 0.32, y0 = 1.0 + z0 * 0.17; teil(W, 0x8e9396, x0, x0 + 0.31, 0, 0.12, y0, y0 + 0.16, 1); teil(W, 0x2a2b2e, x0 + 0.05, x0 + 0.26, 0.12, 0.124, y0 + 0.1, y0 + 0.115); teil(W, 0xece8dc, x0 + 0.05, x0 + 0.16, 0.12, 0.123, y0 + 0.03, y0 + 0.06); } sperre(W, -0.66, 0.66, 0, 0.14, 0.4); }
          pflanze(rechts(Math.min(tiefe - 0.4, 1.8)), 0, 0.35, 1);
        } else {   // Empfang: Theke mit Holzplatte, Bildschirm, Pflanze
          const b = Math.min(1.8, breite - 2.6);
          if (b > 0.9 && tiefe > 3) { const z = tiefe * 0.5; if (frei(M0, pm - b / 2, pm + b / 2, z - 0.35, z + 0.35)) { teil(M0, WEISS, pm - b / 2, pm + b / 2, z - 0.3, z + 0.3, 0, 1.02); teil(M0, HOLZ, pm - b / 2 - 0.03, pm + b / 2 + 0.03, z - 0.35, z + 0.35, 1.02, 1.07); teil(M0, SCHWARZ, pm - 0.25, pm + 0.25, z + 0.05, z + 0.08, 1.12, 1.45, 1); sperre(M0, pm - b / 2, pm + b / 2, z - 0.35, z + 0.35, 1.07); } }
          pflanze(aussen(r.p0 + 0.45), 0, 0.4, 1.3);
        }
        continue;
      }
      if (tiefe < 2.6 || breite < 2.2) { lampe(pm, qAt(tiefe / 2), false); continue; }
      if (S.s === 0) {   // Reihe: Durchgang entlang der Mittellinie, Möbel an der nahen und fernen Wand
        lampe(pm, qAt(tiefe / 2), wohnen);
        if (wohnen) { sofa(flur(pm), 0, Math.min(2.2, breite - 1.4), 0.9, 0.12); regal(aussen(pm), 0, Math.min(1.8, breite - 1.4)); }
        else { tisch(flur(pm), 0, 0.55, Math.min(1.8, breite - 1.4), 0.75, 0.74, WEISS, METALL); regal(aussen(pm), 0, Math.min(1.6, breite - 1.4), 1.9, 0.35, true, true); }
        continue;
      }
      if (laden) {   // Regale längs zum Gang, Theke neben der Tür
        lampe(pm, qAt(tiefe / 2), false);
        for (const s of [-1, 1]) {
          const px = pm + s * Math.min(1.5, breite / 2 - 0.7); if (Math.abs(px - pm) < 0.9) continue;
          const W = { p: (x, z) => px + z - 0.25, f: x => 1.3 + x }, L = tiefe - 2.2; if (L < 1) continue;
          if (!frei(W, 0, L, 0, 0.5)) continue;
          teil(W, METALL, 0, L, 0.22, 0.28, 0, 1.8, 1);
          for (let e = 0; e < 4; e++) { const yy = 0.1 + e * 0.45; teil(W, WEISS, 0, L, 0, 0.5, yy, yy + 0.03); const st = handy ? 0.42 : 0.13; for (let x = 0.04; x < L - 0.1; x += st + R() * 0.05) for (const zz of [0.04, 0.3]) { const hh = 0.12 + R() * 0.2; teil(W, wahl([...AKZENT, ...BUCH, WEISS]), x, x + st - 0.04 + R() * 0.03, zz, zz + 0.16, yy + 0.03, yy + 0.03 + hh); } }   // Handy: breitere Warengruppen statt einzelner Packungen
          sperre(W, 0, L, 0, 0.5, 1.8);
        }
        if (breite > 4.2) { const W = flur(r.p0 + 1.0); if (frei(W, -0.6, 0.6, 0.4, 1.0)) { teil(W, WEISS, -0.6, 0.6, 0.4, 1.0, 0, 1.0); teil(W, HOLZ, -0.62, 0.62, 0.38, 1.02, 1.0, 1.04); teil(W, SCHWARZ, -0.2, 0.2, 0.6, 0.85, 1.04, 1.2, 1); sperre(W, -0.6, 0.6, 0.4, 1.0, 1.04); } }
        continue;
      }
      if (!wohnen) {   // Büro
        lampe(pm, qAt(tiefe / 2), false);
        if (breite >= 5.5 && tiefe >= 5) {   // Besprechung
          const b = Math.min(3.2, breite - 2.4), t = 1.1, z = tiefe * 0.55;
          if (tisch(M0, pm, z, b, t, 0.74, HOLZ, METALL)) for (let i = 0; i < Math.floor(b / 0.7); i++) { const x = pm - b / 2 + 0.35 + i * 0.7; drehstuhl(M0, x, z - t / 2 - 0.35); drehstuhl(M0, x, z + t / 2 + 0.35); }
        } else for (const s of [-1, 1]) {
          if (breite < 4.4 && s > 0) break;
          const px = pm + s * Math.min(1.45, breite / 2 - 0.9), W = aussen(px);
          if (!tisch(W, 0, 0.8, 1.5, 0.8, 0.74, WEISS, METALL)) continue;
          teil(W, SCHWARZ, -0.3, 0.3, 0.5, 0.53, 0.95, 1.3, 1); teil(W, 0x2a2b2e, -0.03, 0.03, 0.53, 0.58, 0.74, 0.95); teil(W, 0x2a2b2e, -0.12, 0.12, 0.5, 0.66, 0.74, 0.755);
          teil(W, 0x2e3136, -0.22, 0.22, 0.86, 1.0, 0.74, 0.76); teil(W, 0x2e3136, 0.3, 0.38, 0.9, 1.0, 0.74, 0.755);
          drehstuhl(W, 0, 1.55);
        }
        regal(rechts(Math.max(1.4, tiefe - 1.2)), 0, Math.min(1.6, tiefe - 2.0), 1.9, 0.38, true, true);
        { const W = links(tiefe * 0.5), b = Math.min(1.8, tiefe - 2.0); if (b > 0.8) { teil(W, METALL, -b / 2, b / 2, 0.005, 0.02, 0.95, 2.0, 1); teil(W, 0xf4f4f2, -b / 2 + 0.03, b / 2 - 0.03, 0.02, 0.025, 0.98, 1.97, 1); } }
        pflanze(aussen(r.p0 + 0.4), 0, 0.4, 1.4);
        continue;
      }
      // Wohnung: Bad in kleinen Räumen, sonst Schlafzimmer, Wohnzimmer oder Küche
      const art = breite < 3.0 && tiefe < 5.5 ? 3 : Math.floor(R() * 3);
      if (art === 0) {   // Schlafzimmer
        lampe(pm, qAt(tiefe / 2), true);
        const b = breite >= 3.0 ? 1.6 : 1.2;
        if (tiefe >= 3.8) { if (bett(aussen(pm), 0, b, 2.0, breite >= b + 1.2)) teppich(aussen(pm), -b / 2 - 0.3, b / 2 + 0.3, 0.9, 2.6); }
        else bett(links(Math.max(0.9, tiefe - 1.0)), 0, b, 2.0, false);
        const fB = Math.min(tiefe - 2.2, 2.1); if (fB > 0.9) schrank(rechts(0.12 + fB / 2), 0, fB, 2.15, 0.6, wahl([WEISS, HOLZ, FRONT]));
        bild(links(tiefe * 0.45), 0, 1.55, 0.8, 0.55);
        pflanze(aussen(r.p0 + 0.35), 0, 0.35, 1);
      } else if (art === 1) {   // Wohnzimmer
        lampe(pm, qAt(tiefe / 2), true);
        const fc = Math.max(1.9, tiefe * 0.56);
        if (breite >= 3.4) {
          const W1 = links(fc), W2 = rechts(fc), b = Math.min(2.4, tiefe - 1.6);
          if (sofa(W1, 0, b, 0.92, 0.08)) { bild(W1, 0, 1.6, Math.min(1.2, b - 0.4), 0.6); stehlampe(W1, b / 2 + 0.3, 0.3); }
          if (frei(W2, -0.8, 0.8, 0, 0.42)) { teil(W2, wahl([WEISS, HOLZ, SCHWARZ]), -0.8, 0.8, 0.0, 0.42, 0.06, 0.5); teil(W2, SCHWARZ, -0.78, 0.78, 0.0, 0.42, 0, 0.06); teil(W2, 0x55575a, -0.004, 0.004, 0.42, 0.424, 0.08, 0.48); teil(W2, 0x111214, -0.62, 0.62, 0.12, 0.16, 0.62, 1.34, 1); teil(W2, 0x2a2b2e, -0.15, 0.15, 0.08, 0.24, 0.5, 0.52); sperre(W2, -0.8, 0.8, 0, 0.42, 1.34); }
          const zt = 0.08 + 0.92 + 0.55; tisch(W1, 0, zt, 1.1, 0.6, 0.42); teil(W1, wahl(AKZENT), -0.15, 0.15, zt - 0.1, zt + 0.12, 0.42, 0.45);
          teppich(W1, -1.2, 1.2, 0.7, zt + 0.7);
        } else { if (sofa(aussen(pm), 0, Math.min(2.2, breite - 0.8), 0.92, 0.12)) tisch(aussen(pm), 0, 1.65, 1.0, 0.55, 0.42); }
        const rb = Math.min(1.8, pm - 0.75 - r.p0 - 0.15); if (rb > 0.7) regal(flur(r.p0 + 0.1 + rb / 2), 0, rb);
        pflanze(aussen(r.p1 - 0.38), 0, 0.38, 1.2);
      } else if (art === 2) {   // Küche mit Esstisch
        const langs = tiefe >= breite, L = Math.min(4.2, (langs ? tiefe : breite) - 0.4);
        const K = langs ? rechts(0.15 + L / 2) : aussen(pm);
        if (L >= 1.8 && frei(K, -L / 2, L / 2, 0, 0.64)) {
          const a0 = -L / 2, a1 = L / 2, kuehl = L > 3.0, b1 = kuehl ? a1 - 0.64 : a1;
          teil(K, 0x2a2b2e, a0, b1, 0.05, 0.55, 0, 0.1); teil(K, FRONT, a0, b1, 0, 0.58, 0.1, 0.86); teil(K, PLATTE, a0 - 0.01, b1 + 0.01, 0, 0.62, 0.86, 0.9);
          for (let u = a0 + 0.6; u < b1 - 0.1; u += 0.6) teil(K, 0x55575a, u - 0.003, u + 0.003, 0.58, 0.584, 0.12, 0.84);
          for (let u = a0 + 0.3; u < b1; u += 0.6) teil(K, METALL, u - 0.13, u + 0.13, 0.58, 0.6, 0.78, 0.8, 1);
          const xs = a0 + Math.min(0.9, (b1 - a0) * 0.3), xh = b1 - Math.min(0.9, (b1 - a0) * 0.3);
          teil(K, METALL, xs - 0.38, xs + 0.38, 0.1, 0.52, 0.9, 0.905, 1); teil(K, 0x6a6e72, xs - 0.32, xs + 0.32, 0.15, 0.47, 0.905, 0.909, 1);
          teil(K, METALL, xs - 0.015, xs + 0.015, 0.05, 0.08, 0.9, 1.2, 1); teil(K, METALL, xs - 0.015, xs + 0.015, 0.05, 0.26, 1.17, 1.2, 1);
          if (xh - xs > 0.9) { teil(K, 0x111214, xh - 0.3, xh + 0.3, 0.06, 0.56, 0.9, 0.906, 1); for (const [dx, dz] of [[-0.14, 0.18], [0.14, 0.18], [-0.14, 0.42], [0.14, 0.42]]) rund(K, 0x4a2c26, xh + dx, dz, 0.08, 0.08, 0.906, 0.909, 14); teil(K, METALL, xh - 0.3, xh + 0.3, 0, 0.5, 1.55, 1.62, 1); teil(K, METALL, xh - 0.13, xh + 0.13, 0, 0.26, 1.62, Math.min(2.45, yD - y - 0.05), 1); }
          for (const [c0, c1] of xh - xs > 0.9 ? [[a0, xh - 0.32], [xh + 0.32, b1]] : [[a0, b1]]) if (c1 - c0 > 0.3) { teil(K, FRONT, c0, c1, 0, 0.35, 1.45, 2.15); for (let u = c0 + 0.6; u < c1 - 0.1; u += 0.6) teil(K, 0x55575a, u - 0.003, u + 0.003, 0.35, 0.354, 1.47, 2.13); }
          if (kuehl) { teil(K, 0xe9e8e4, a1 - 0.62, a1, 0, 0.65, 0, 2.0); teil(K, 0x55575a, a1 - 0.62, a1, 0.65, 0.654, 1.2, 1.206); teil(K, METALL, a1 - 0.08, a1 - 0.05, 0.65, 0.68, 1.3, 1.7, 1); }
          sperre(K, a0, a1, 0, 0.64, 2.0);
        }
        // Esstisch mit Stühlen im freien Teil, Pendelleuchte darüber
        const W = langs ? links(Math.max(1.9, tiefe * 0.58)) : flur(pm), tz = langs ? 0.95 : Math.max(1.9, (tiefe - 0.64) * 0.6), tb = 1.3, tt = 0.85;
        if (tisch(W, 0, tz, tb, tt, 0.75)) { for (const s of [-1, 1]) for (const xx of [-tb / 4, tb / 4]) stuhl(W, xx, tz + s * (tt / 2 + 0.25), s); const [p, q] = pq(W, 0, tz); lampe(p, q, true); }
        else lampe(pm, qAt(tiefe / 2), true);
      } else {   // Bad
        lampe(pm, qAt(tiefe / 2), false);
        teil(M0, 0xcfd3d2, r.p0 + 0.02, r.p1 - 0.02, 0.02, tiefe - 0.02, -0.006, 0.004);   // Fliesen am Boden
        for (const W of [links(tiefe / 2), rechts(tiefe / 2)]) teil(W, 0xdfe3e2, -tiefe / 2 + 0.04, tiefe / 2 - 0.04, 0, 0.012, 0, 1.4);   // Fliesen an den Seitenwänden
        const wb = Math.min(1.7, breite - 0.2);
        if (wb >= 1.4 && frei(aussen(pm), -wb / 2, wb / 2, 0.02, 0.78)) { const A = aussen(pm); teil(A, 0xf2f2ef, -wb / 2, wb / 2, 0.02, 0.78, 0, 0.56, 1); teil(A, 0xc9d3d6, -wb / 2 + 0.07, wb / 2 - 0.07, 0.09, 0.71, 0.56, 0.565, 1); teil(A, METALL, wb / 2 - 0.2, wb / 2 - 0.17, 0.03, 0.08, 0.56, 0.75, 1); sperre(A, -wb / 2, wb / 2, 0.02, 0.78, 0.56); }
        { const W = links(Math.max(0.6, tiefe - 1.3)); if (frei(W, -0.2, 0.2, 0, 0.66)) { teil(W, 0xf2f2ef, -0.18, 0.18, 0, 0.18, 0.36, 0.78, 1); teil(W, 0xf2f2ef, -0.17, 0.17, 0.12, 0.62, 0, 0.4, 1); teil(W, 0xe8e8e4, -0.19, 0.19, 0.12, 0.66, 0.4, 0.43, 1); sperre(W, -0.2, 0.2, 0, 0.66, 0.78); } }
        { const W = rechts(Math.max(0.6, tiefe * 0.45)); if (frei(W, -0.32, 0.32, 0, 0.48)) { teil(W, FRONT, -0.3, 0.3, 0, 0.45, 0.2, 0.8); teil(W, 0xf2f2ef, -0.32, 0.32, 0, 0.48, 0.8, 0.88, 1); teil(W, METALL, -0.015, 0.015, 0.03, 0.06, 0.88, 1.05, 1); teil(W, 0xb9c4c8, -0.3, 0.3, 0.012, 0.02, 1.15, 1.85, 1); teil(W, wahl(AKZENT), 0.36, 0.5, 0.0, 0.05, 0.9, 1.4); sperre(W, -0.32, 0.32, 0, 0.48, 0.88); } }
      }
    }
  }
  entsorgen() { for (const g of this.geschosse.values()) { g.traverse(o => o.geometry?.dispose()); g.parent?.remove(g); } this.geschosse.clear(); }
}

// Haustür (Wunsch Nr. 96, 10.11.2026): auf Tastendruck (E, Knopf am Handy) mit Animation. Die Klinke drückt, das Blatt schwingt nach innen auf
// (0,9 s, leicht über das Ziel hinaus und zurück), der Türschließer zieht es langsam zu (2 s), sobald der Spieler 3,5 s lang weiter als 2,6 m weg
// ist, nie solange er im Durchgang steht. Zu sperrt das Blatt den Durchgang (Innen.tuerFrei). Häuser ohne bewegliches Blatt bleiben offen.
const TUER_DAUER = { auf: 0.9, zu: 0.75, schliesser: 2.0 }, GRIFF = 0.35;
const zurueck = f => { const c1 = 1.15, c3 = c1 + 1, x = f - 1; return 1 + c3 * x * x * x + c1 * x * x; };   // über das Ziel hinaus und zurück
const weich = f => f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
const schliesser = f => f * f * (3 - 2 * f);

// Feines Türblatt (Nr. 96): nur am aktiven Haus (ein Blatt zugleich). Holztür: unten Füllung mit zwei Kassetten je Seite, Mittelriegel, oben Glas
// mit Sprossen, Klinke mit Rosette und Schild auf beiden Seiten (Gruppe "griffe", dreht beim Öffnen). Glastür: Stoßstange beidseitig.
// Daneben auf der Fassade ein Klingelbrett mit Sprechanlage, je Wohnung ein Knopf mit Namensschild (ohne Namen).
let FEIN = null;
function feinMats() {
  return FEIN ??= {
    messing: new THREE.MeshStandardMaterial({ color: 0xb48a3c, roughness: 0.32, metalness: 0.9 }), stahl: new THREE.MeshStandardMaterial({ color: 0xa9adb0, roughness: 0.28, metalness: 0.85 }),
    knopf: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.4, metalness: 0.4 }), schild: new THREE.MeshStandardMaterial({ color: 0xece8dc, roughness: 0.7 }),
    glas: new THREE.MeshStandardMaterial({ color: 0x55656e, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  };
}
function tuerFein(gr, I, mats) {
  if (gr.userData.fein) return; gr.userData.fein = true;
  const T = gr.userData.tuer, blatt = gr.getObjectByName('blatt'); if (!T || !blatt) return;
  const F = feinMats(), B = T.breite, H = T.hoehe, holz = mats.holzDunkel || mats.tuerHolz;
  const kasten = (m, x, y, z, sx, sy, sz, ziel = blatt) => { const g = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); g.position.set(x, y, z); g.castShadow = false; ziel.add(g); return g; };
  const rahmen = blatt.getObjectByName('rahmen'); if (rahmen) rahmen.geometry.setDrawRange(0, 144);   // der einfache Griff (fünfter Kasten) weicht der Klinke
  if (!T.glas) {
    const alt = blatt.getObjectByName('fuellung'); if (alt) alt.visible = false;
    const yR = H * 0.44, gH = H - yR - 0.1;
    kasten(holz, B / 2, yR / 2 + 0.03, 0, B - 0.1, yR - 0.04, 0.035);              // untere Füllung
    kasten(holz, B / 2, yR, 0, B - 0.08, 0.09, 0.06);                              // Mittelriegel
    for (const s of [-1, 1]) for (const k of [0, 1]) kasten(holz, B * (0.28 + 0.44 * k), yR * 0.5, s * 0.026, B * 0.34, yR * 0.66, 0.018);   // zwei Kassetten je Seite
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(B - 0.12, gH), F.glas); gl.position.set(B / 2, yR + 0.045 + gH / 2, 0); blatt.add(gl);
    for (const s of [-1, 1]) { kasten(holz, B / 2, yR + 0.045 + gH / 2, s * 0.012, 0.035, gH, 0.02); kasten(holz, B / 2, yR + 0.045 + gH * 0.6, s * 0.012, B - 0.1, 0.035, 0.02); }   // Sprossen
  }
  const griffe = new THREE.Group(); griffe.name = 'griffe'; griffe.position.set(B - 0.11, 1.05, 0); blatt.add(griffe);
  if (T.glas) {
    griffe.userData.stange = true;
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.9, 10), F.stahl); st.position.set(0, 0, s * 0.085); griffe.add(st); for (const y of [-0.38, 0.38]) kasten(F.stahl, 0, y, s * 0.05, 0.02, 0.02, 0.07, griffe); }
  } else for (const s of [-1, 1]) {
    const ros = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 14), F.messing); ros.rotation.x = Math.PI / 2; ros.position.set(0, 0, s * 0.036); griffe.add(ros);
    kasten(F.messing, -0.06, 0, s * 0.056, 0.13, 0.022, 0.024, griffe);   // Klinke, zeigt zur Angel
    kasten(F.messing, B - 0.11, 1.05 - 0.13, s * 0.034, 0.042, 0.19, 0.008);   // Schild mit Schlüsselloch
    kasten(F.knopf, B - 0.11, 1.05 - 0.17, s * 0.039, 0.012, 0.026, 0.004);
  }
  // Klingelbrett (lokal: x entlang der Öffnung, +z nach außen, die Fassade liegt bei z = d)
  const wohnen = WOHNEN.has(I.haus.typ) || !GESCHOSS[I.haus.typ], n = wohnen ? Math.min(12, Math.max(4, 2 * I.N)) : 3, hoch = 0.1 + n * 0.045;
  const kb = new THREE.Group(); kb.name = 'klingel'; kb.position.set(B + 0.32, 1.25 + hoch / 2, T.d + 0.008); gr.add(kb);
  kasten(F.stahl, 0, 0, 0, 0.14, hoch, 0.014, kb);
  kasten(F.knopf, 0, hoch / 2 - 0.05, 0.009, 0.09, 0.05, 0.006, kb);   // Sprechanlage
  for (let i = 0; i < n; i++) { const y = hoch / 2 - 0.105 - i * 0.045; kasten(F.schild, -0.016, y, 0.009, 0.075, 0.028, 0.004, kb); kasten(F.knopf, 0.047, y, 0.01, 0.02, 0.02, 0.008, kb); }
}

// Verwaltet die Innenräume eines Ortes: welches Haus steht an, Haustür auf und zu, Geschosse um den Spieler, Licht
export class Innenwelt {
  // haeuser: Liste wie oben, findeTuer(id): Gruppe "tuerblatt" aus der Außenstufe (oder null), klang(art): Geräusch "griff", "auf", "zu"
  // festeTuer(id, aus): festes Türblatt der Zwischenstufe aus oder ein (kit/ort.js). Dann setzt die Innenwelt ein eigenes bewegliches Blatt ein (Handy)
  constructor({ mats, gruppe, kollision, haeuser, findeTuer, festeTuer = null, klang = null, mobil = false }) {
    this.mats = mats; this.gruppe = gruppe; this.kollision = kollision; this.haeuser = haeuser; this.klang = klang; this.mobil = mobil; this.festeTuer = festeTuer; this.eigene = null;
    this.findeTuer = hid => findeTuer(hid) || (this.eigene && this.eigene.id === hid ? this.eigene.g : null); this.findeOrt = findeTuer;
    this.cache = new Map(); this.aktiv = null; this.tuerOffen = new Map(); this.gezeigt = new Set();
    this.licht = new THREE.PointLight(0xffe2c0, 0, 16, 1.4); this.licht.visible = false; gruppe.add(this.licht);
    this.zelle = new Map();   // 50 m Zellen mit Hausindizes (Türsuche)
    // jedes Haus in allen Zellen, die sein Kasten plus 14 m berührt (große Häuser fielen sonst aus der Suche, sobald man weit von der Mitte stand)
    haeuser.forEach((h, i) => {
      const cx = h.pts.reduce((s, p) => s + p[0], 0) / h.pts.length, cz = h.pts.reduce((s, p) => s + p[1], 0) / h.pts.length; h.mitte = [cx, cz]; h.radius = Math.max(...h.pts.map(p => Math.hypot(p[0] - cx, p[1] - cz)));
      const xs = h.pts.map(p => p[0]), zs = h.pts.map(p => p[1]);
      for (let a = Math.floor((Math.min(...xs) - 14) / 50); a <= Math.floor((Math.max(...xs) + 14) / 50); a++) for (let b = Math.floor((Math.min(...zs) - 14) / 50); b <= Math.floor((Math.max(...zs) + 14) / 50); b++) { const key = a + ':' + b; (this.zelle.get(key) || this.zelle.set(key, []).get(key)).push(i); }
    });
  }
  // Speicher der Innenräume: zuletzt benutzte bleiben (bis 24), das aktive Haus fliegt nie raus. Bis 10.11.2026 hielt er 6 und verglich beim
  // Rauswerfen ein Innen mit einem Haus (nie gleich): das aktive Haus wurde neu gebaut, die Kollision hielt das alte (Tür blieb für sie zu, Nr. 96),
  // und zwischen vielen Häusern wurde jedes Bild ein Plan neu gerechnet
  innen(h) {
    let I = this.cache.get(h.id);
    if (I) { this.cache.delete(h.id); this.cache.set(h.id, I); return I; }
    I = new Innen(this.mats, h); I.mobil = this.mobil; this.cache.set(h.id, I);
    if (this.cache.size > 24) for (const [id, alt] of this.cache) { if (id === this.aktiv?.id || alt === I) continue; alt.entsorgen(); this.cache.delete(id); break; }
    return I;
  }
  nahe(x, z) {
    const out = [];
    for (const i of this.zelle.get(Math.floor(x / 50) + ':' + Math.floor(z / 50)) || []) { const h = this.haeuser[i]; if (Math.hypot(h.mitte[0] - x, h.mitte[1] - z) < h.radius + 14) out.push(h); }
    return out;
  }
  // pos: Spielerposition zu Fuß oder null (anderer Modus): Türen schließen, Innenräume bleiben kurz
  update(dt, pos) {
    let aktiv = null;
    if (pos) {
      const nah = this.nahe(pos.x, pos.z);
      for (const h of nah) if (inside(h.pts, pos.x, pos.z)) { aktiv = h; break; }
      if (!aktiv) { let bd = 12; for (const h of nah) { const I = this.innen(h); if (!I.ok) continue; const d = Math.hypot(I.tuer.mitte[0] - pos.x, I.tuer.mitte[1] - pos.z); if (d < bd) { bd = d; aktiv = h; } } }
      if (aktiv && !this.innen(aktiv).ok) aktiv = null;
    }
    const I = aktiv ? this.innen(aktiv) : null;
    if (aktiv !== this.aktiv) {
      if (this.aktiv) { const alt = this.innen(this.aktiv); for (const g of alt.geschosse.values()) g.visible = false; const t = this.findeTuer(this.aktiv.id); if (t) t.getObjectByName('hinten').visible = true; }
      this.aktiv = aktiv; this.kollision.innen = I; this.kollision.zustand.etage = 0; this.kollision.zustand.kSeg = null;
      if (I) { this.eigeneTuer(aktiv.id, I); const t = this.findeTuer(aktiv.id); if (t) tuerFein(t, I, this.mats); }
    }
    if (this.kollision.innen !== I) this.kollision.innen = I;   // immer dasselbe Objekt wie die Innenwelt (Tür, Geschosse)
    this.tuerenTick(dt, pos, I);
    if (!I) { this.licht.visible = false; return; }
    // Geschosse um den Spieler
    const Z = this.kollision.zustand, e = Math.min(Z.etage, I.N), will = new Set([e]); if (!this.mobil) { if (e > 0) will.add(e - 1); if (e < I.N) will.add(e + 1); } if (Z.kSeg !== null) { will.add(Z.kSeg); will.add(Math.min(I.N, Z.kSeg + 1)); }   // Handy: Nachbargeschosse nur auf der Treppe (Nr. 96)
    for (const k of will) { const g = I.geschoss(k); if (!g.parent) this.gruppe.add(g); g.visible = true; }
    for (const [k, g] of I.geschosse) if (!will.has(k)) g.visible = false;
    const drin = I.drin(pos.x, pos.z);
    this.licht.visible = drin; if (drin) { this.licht.position.set(pos.x, pos.y + 2.0, pos.z); this.licht.intensity = 9; }
    const t = this.findeTuer(aktiv.id); if (t) t.getObjectByName('hinten').visible = false;
  }
  // Haustür in Reichweite (von außen und von innen): { offen, I } oder null. Offen im Durchgang: null (zumachen geht dort nicht)
  tuerNah(pos) {
    const h = this.aktiv; if (!h || !pos) return null;
    const I = this.innen(h); if (!I.ok || !this.findeTuer(h.id)) return null;
    const t = I.tuer, dx = pos.x - t.o[0], dz = pos.z - t.o[1], u = dx * t.r[0] + dz * t.r[1], w = dx * t.n[0] + dz * t.n[1];
    if (u < t.u0 - 0.9 || u > t.u1 + 0.9 || w > 1.7 || w < -(t.d + 1.8)) return null;
    const o = this.tuerOffen.get(h.id), offen = !!o && o.ziel === 1;
    if (offen && I.imStreifen(pos.x, pos.z, 0.15)) return null;
    return { offen, I };
  }
  // Taste E oder Knopf: Tür auf oder zu
  umschalten(pos) {
    const n = this.tuerNah(pos); if (!n) return false;
    let o = this.tuerOffen.get(n.I.id);
    if (!o) { o = { w: 0, ziel: 0, von: 0, t: 0, dauer: 1, art: 'zu', griff: 0, weg: 0, knall: true }; this.tuerOffen.set(n.I.id, o); }
    if (o.ziel === 1) this.bewege(o, 0, 'zu'); else { this.bewege(o, 1, 'auf'); o.griff = GRIFF; this.klang?.('griff'); }
    return true;
  }
  bewege(o, ziel, art) {
    if (o.ziel === ziel) return;
    o.von = o.w; o.ziel = ziel; o.art = art; o.dauer = TUER_DAUER[art]; o.t = art === 'auf' ? -0.16 : 0; o.weg = 0; o.knall = ziel === 1;
    if (art === 'auf') this.klang?.('auf');
  }
  // Eigenes bewegliches Türblatt für ein Haus der Zwischenstufe (Handy): das feste Blatt im verschmolzenen Mesh verschwindet, ein Blatt aus dem
  // Innenplan (gleiche Maße wie die Fassade) kommt an seine Stelle. Nur eins zugleich; das alte geht, sobald seine Tür zu ist
  eigeneTuer(id, I) {
    if (this.findeOrt(id) || !this.festeTuer || !I.plan?.tuer) return;
    if (this.eigene) this.eigeneWeg(true);
    if (!this.festeTuer(id, true)) return;
    const g = tuerBlatt(this.mats, I.plan.tuer, I.plan.pts); g.position.y += I.y0; g.userData.id = id; this.gruppe.add(g);
    this.eigene = { id, g };
  }
  eigeneWeg(sofort = false) {
    const E = this.eigene; if (!E) return;
    if (!sofort && this.tuerOffen.has(E.id)) return;
    this.tuerOffen.delete(E.id); this.gruppe.remove(E.g); E.g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); this.festeTuer?.(E.id, false); this.eigene = null;
  }
  tuerenTick(dt, pos, I) {
    const aktivId = I ? I.id : null;
    if (I) {
      const o = this.tuerOffen.get(aktivId);
      if (o && o.ziel === 1) {   // Türschließer
        const d = pos ? Math.hypot(I.tuer.mitte[0] - pos.x, I.tuer.mitte[1] - pos.z) : 99;
        o.weg = d > 2.6 ? o.weg + dt : 0;
        if (o.weg > 3.5 && !(pos && I.imStreifen(pos.x, pos.z, 0.3))) this.bewege(o, 0, 'schliesser');
      }
    }
    for (const [id, o] of this.tuerOffen) {
      if (id !== aktivId && o.ziel === 1) this.bewege(o, 0, 'schliesser');
      o.t += dt;
      const f = Math.max(0, Math.min(1, o.t / o.dauer)), e = o.art === 'auf' ? zurueck(f) : o.art === 'zu' ? weich(f) : schliesser(f);
      o.w = o.von + (o.ziel - o.von) * e;
      if (f >= 1) { o.w = o.ziel; if (o.ziel === 0 && !o.knall) { o.knall = true; this.klang?.('zu'); } }
      if (o.griff > 0) o.griff = Math.max(0, o.griff - dt);
      const t = this.findeTuer(id);
      if (t) {
        t.getObjectByName('blatt').rotation.y = o.w * 1.5;   // nach innen (lokal +z ist außen)
        const g = t.getObjectByName('griffe'); if (g && !g.userData.stange) g.rotation.z = o.griff > 0 ? 0.6 * Math.sin(Math.PI * (1 - o.griff / GRIFF)) : 0;
      }
      if (f >= 1 && o.ziel === 0 && o.griff === 0) this.tuerOffen.delete(id);
    }
    if (I) { const o = this.tuerOffen.get(aktivId); I.offen = this.findeTuer(aktivId) ? (o ? o.w : 0) : 1; }   // ohne bewegliches Blatt bleibt der Durchgang offen
    if (this.eigene && this.eigene.id !== aktivId) this.eigeneWeg();   // eigenes Blatt eines anderen Hauses: weg, sobald zu
  }
}

// Straßenkante eines Grundrisses: die längste Kante, deren Außenpunkt (1,5 m vor der Mitte) auf einem Gehwegblock liegt, sonst die längste
export function eingangKante(pts, bloecke) {
  const P = orient(pts), n = P.length; let best = -1, bl = -1, bestFrei = -1, blFrei = -1;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], L = Math.hypot(a[0] - b[0], a[1] - b[1]); if (L < 2.2) continue;
    const nn = edgeNormal(a, b), mx = (a[0] + b[0]) / 2 + nn[0] * 1.5, mz = (a[1] + b[1]) / 2 + nn[1] * 1.5;
    if (L > bl) { bl = L; best = i; }
    if (bloecke && bloecke.some(bk => inside(bk[0], mx, mz) && !bk.slice(1).some(h => inside(h, mx, mz)))) { if (L > blFrei) { blFrei = L; bestFrei = i; } }
  }
  return bestFrei >= 0 ? bestFrei : best;
}
