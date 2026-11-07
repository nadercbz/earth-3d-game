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
import { Fassade, hausPlan } from './buildings.js';

const GESCHOSS = { altbau: [4.4, 3.3, 1], ziegel: [4.0, 3.1, 1], wohnturm: [5.0, 3.2, 3], raster: [7.0, 3.75, 3], lochfassade: [6.0, 3.3, 3], glasturm: [7.5, 3.8, 3], kupfer: [6.5, 3.6, 3], band: [4.8, 3.6, 1] };
const WOHNEN = new Set(['altbau', 'ziegel', 'wohnturm']);
const K = { lang: 7.0, zone: 1.4, lauf: 4.2, breite: 2.8 };   // Treppenhaus
const WAND = 0.12, HUELLE = 0.3, RADIUS = 0.27;                 // Zwischenwand, Außenwand innen, Spielerradius

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

export class Innen {
  // haus: { id, pts (Welt, Meter), y0, h, typ, variant, seed, laeden, eingang (Kantenindex) }
  constructor(mats, haus) {
    this.mats = mats; this.haus = haus; this.id = haus.id; this.y0 = haus.y0 || 0; this.ok = false; this.geschosse = new Map();
    const plan = this.plan = hausPlan({ pts: haus.pts, height: haus.h, type: haus.typ, variant: haus.variant, seed: haus.seed, laeden: haus.laeden, eingang: haus.eingang });
    if (!plan.tuer) return;
    const P = this.P = plan.pts, t = plan.tuer, n = P.length;
    const [gH, fH, minN] = GESCHOSS[haus.typ] || [4.0, 3.2, 1];
    this.N = Math.max(minN, Math.round((haus.h - gH) / fH)); this.fH = fH; this.gH = gH;
    this.boden = [0]; for (let k = 1; k <= this.N; k++) this.boden.push(gH + (k - 1) * fH);
    this.dachUnten = Math.min(plan.top, this.boden[this.N] + fH) - 0.3;
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
    for (const r of this.moebelSperren?.[e] || []) if (p > r[0] - RADIUS && p < r[2] + RADIUS && q > r[1] - RADIUS && q < r[3] + RADIUS) return false;
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
    const bau = new Bau(), M = this.mats, y0 = this.boden[k], y1 = k < this.N ? this.boden[k + 1] : this.dachUnten + 0.22, hoch = y1 - 0.22 - y0;
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
      for (const [d0, d1] of ts) {   // Sturz über der Tür (2,1 m), Rahmen, Blatt 80 Grad offen (nicht bei Halle und Treppe: Durchgang)
        const breit = (d1 - d0) * L; if (breit > 1.6) continue;
        const A = [a[0] + (b[0] - a[0]) * d0, a[1] + (b[1] - a[1]) * d0], Bp = [a[0] + (b[0] - a[0]) * d1, a[1] + (b[1] - a[1]) * d1];
        this.wandStueck(bau, 'wandInnen', A, Bp, y0 + 2.1, y1 - 0.22);
        const ux = (Bp[0] - A[0]) / breit, uz = (Bp[1] - A[1]) / breit, nx = -uz, nz = ux;
        for (const [px, pz] of [A, Bp]) bau.box('tuerHolz', px + ux * 0.04 * (px === A[0] ? 1 : -1), y0, pz + uz * 0.04 * (px === A[0] ? 1 : -1), 0.08, 2.1, WAND + 0.04, Math.atan2(ux, uz));
        bau.box('tuerHolz', (A[0] + Bp[0]) / 2, y0 + 2.06, (A[1] + Bp[1]) / 2, breit, 0.06, WAND + 0.04, Math.atan2(ux, uz));
        const w0 = 0.8, cx = A[0] + ux * 0.05 + nx * (w0 / 2 + 0.06), cz = A[1] + uz * 0.05 + nz * (w0 / 2 + 0.06);   // Blatt steht in den Raum
        bau.box('tuerHolz', cx, y0 + 0.01, cz, 0.04, 2.02, w0, Math.atan2(ux, uz) + Math.PI / 2 + 0.17);
      }
    }
    if (kern && k < this.N) { if (kern.art === 'wendel') this.wendel(bau, k); else this.treppe(bau, k); }
    this.moebel(bau, k, wohnen, laden);
    const g = bau.build(M, { shadow: false });
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
  treppe(bau, k) {
    const kern = this.kern, y0 = this.boden[k], y1 = this.boden[k + 1], halb = (y1 - y0) / 2, nSt = Math.max(6, Math.round(halb / 0.17)), run = this.K.lauf / nSt;
    const sw = kern.across / 2, rot = Math.atan2(this.pAx[0], this.pAx[1]);
    const sMitte = s => kern.s >= 0 ? kern.q0 + s : kern.q1 - s;   // Streifenmitte quer (lokal q)
    const box = (key, p, q, sp, sq, yA, yB) => { const [x, z] = this.zuWelt(p, q); bau.box(key, x, yA, z, sp, yB - yA, sq, rot); };
    for (let i = 0; i < nSt; i++) {
      const u = kern.ps + this.K.zone + run * (i + 0.5);
      box('stufe', u, sMitte(sw / 2), run, sw - 0.04, y0, y0 + halb * (i + 1) / nSt);                  // Lauf A (Streifen +1) hinauf
      box('stufe', u, sMitte(sw * 1.5), run, sw - 0.04, y0, y0 + halb + halb * (nSt - i) / nSt);        // Lauf B (Streifen -1) weiter hinauf
    }
    box('stufe', kern.ps + this.K.zone + this.K.lauf + this.K.zone / 2, sMitte(sw), this.K.zone, kern.across - 0.04, y0, y0 + halb);   // Podest
    // Geländer: schräge Bänder über den Stufen auf der Innenseite der Läufe, Handlauf oben
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const band = (p0, p1, ya, yb, q, nq) => {
      const A = this.zuWelt(p0, q), B = this.zuWelt(p1, q), [nx, nz] = [this.qAx[0] * nq, this.qAx[1] * nq];
      for (const s of [1, -1]) bau.face('gelaender', V(A[0], ya + 0.02, A[1]), V(B[0], yb + 0.02, B[1]), V(B[0], yb + 0.95, B[1]), V(A[0], ya + 0.95, A[1]), V(nx * s, 0, nz * s));
    };
    const qm = sMitte(sw);
    band(kern.ps + this.K.zone, kern.ps + this.K.zone + this.K.lauf, y0, y0 + halb, qm, 1);
    band(kern.ps + this.K.zone, kern.ps + this.K.zone + this.K.lauf, y1, y0 + halb, qm, 1);
    if (k > 0) {   // Absturzsicherung am Treppenloch des Geschosses: Rand der Zone zu den Läufen hin gehört zur Treppe (frei), Rest hat Wände
    }
  }
  // Wendeltreppe von k nach k + 1: 16 Trittstufen um eine Säule, Brüstungsring mit Öffnung zum Flur, Handlauf
  wendel(bau, k) {
    const kern = this.kern, y0 = this.boden[k], y1 = this.boden[k + 1], n = 16, rise = (y1 - y0) / n;
    const rotP = Math.atan2(this.pAx[0], this.pAx[1]);
    const [cx, cz] = this.zuWelt(kern.cp, kern.cq);
    bau.geo('gelaender', new THREE.CylinderGeometry(0.2, 0.2, y1 - y0 + 0.3, 10), new THREE.Matrix4().makeTranslation(cx, (y0 + y1) / 2, cz));
    for (let i = 0; i < n; i++) {
      const a = kern.aE + (i + 0.5) / n * Math.PI * 2, pm = kern.cp + Math.cos(a) * 0.68, qm = kern.cq + Math.sin(a) * 0.68, [x, z] = this.zuWelt(pm, qm);
      // Trittstufe als Kasten 0,95 radial × 0,42 tangential, Drehung: lokaler Winkel a plus Drehung des Rahmens
      bau.box('stufe', x, y0 + rise * (i + 1) - 0.06, z, 0.95, 0.06, 0.42, rotP - a);
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
  // Möbel je Raum als leichte Kästen (Büro: Tische und Stühle; Wohnen: Bett, Sofa, Küche; Laden: Regale, Theke), dazu Deckenleuchte
  moebel(bau, k, wohnen, laden) {
    const RL = this.ringLokal(k), y = this.boden[k] + 0.012, yD = (k < this.N ? this.boden[k + 1] : this.dachUnten + 0.22) - 0.26, R = rng(this.haus.seed * 13 + k * 7 + 1);
    const rot = Math.atan2(this.pAx[0], this.pAx[1]);
    const sperren = (this.moebelSperren ??= [])[k] = [];
    const box = (key, p, q, sp, sq, h, yA = y, extra = 0) => { if (!inside(RL, p, q)) return; const [x, z] = this.zuWelt(p, q); bau.box(key, x, yA, z, sp, h, sq, rot + extra); if (h > 0.3) sperren.push([p - sp / 2, q - sq / 2, p + sp / 2, q + sq / 2]); };
    const lampe = (p, q) => { if (!inside(RL, p, q)) return; const [x, z] = this.zuWelt(p, q); bau.box('leuchte', x, yD, z, 0.6, 0.04, 0.6, rot); bau.box('schirm', x, yD + 0.04, z, 0.64, 0.03, 0.64, rot); };
    for (const S of this.seiten) for (const r of S.raeume) {
      const pm = (r.p0 + r.p1) / 2, breite = r.p1 - r.p0;
      const q0 = S.s === 0 ? this.qc - strahl(RL, pm, this.qc, 0, -1) : S.q0;
      const tiefe = Math.min(r.quer ? 4.6 : 100, S.s === 0 ? strahl(RL, pm, this.qc, 0, -1) + strahl(RL, pm, this.qc, 0, 1) : strahl(RL, pm, S.q0 + S.s * 0.02, 0, S.s));
      const dir = S.s === 0 ? 1 : S.s, qAt = f => q0 + dir * f;   // f: Abstand von der Flurwand nach außen
      lampe(pm, qAt(tiefe / 2));
      if (r.art === 'treppe') continue;
      if (r.art === 'halle') { if (tiefe > 3 && breite > 3.6) box('moebelWeiss', pm, qAt(tiefe * 0.5), Math.min(1.6, breite - 2.6), 0.7, 1.05); continue; }   // Empfang in der Mitte, je Seite mindestens 1,3 m Durchgang
      if (tiefe < 2.6 || breite < 2.4) continue;
      if (S.s === 0) {   // Reihe: Durchgang entlang der Mittellinie (Türen in den Zwischenwänden), Möbel nur an der nahen und fernen Wand
        box(wohnen ? 'stoffWarm' : 'moebelWeiss', pm, qAt(0.55), Math.min(2.2, breite - 1.6), 0.7, wohnen ? 0.8 : 0.74);
        if (tiefe > 4.4) box('moebelHolz', pm, qAt(tiefe - 0.3), Math.min(2.4, breite - 1.6), 0.4, 1.9);
        continue;
      }
      // Türen liegen in der Raummitte (p = pm) an der Flurwand: dort bleibt ein Gang von 1,2 m frei, Möbel stehen seitlich und hinten
      if (laden) {   // Regalreihen längs (parallel zum Gang), Theke seitlich neben der Tür
        for (const s of [-1, 1]) { const px = pm + s * Math.min(1.5, breite / 2 - 0.7); if (Math.abs(px - pm) > 0.9) box('moebelHolz', px, qAt(1.3 + (tiefe - 2.2) / 2), 0.5, tiefe - 2.2, 1.8); }
        if (breite > 4.2) box('moebelWeiss', r.p0 + 1.0, qAt(0.7), 1.2, 0.6, 1.0);
      } else if (wohnen) {
        const art = Math.floor(R() * 3);
        if (art === 0) { box('stoff', r.p0 + 1.3, qAt(tiefe - 1.3), 1.6, 2.0, 0.5); box('moebelHolz', r.p0 + 1.3, qAt(tiefe - 0.35), 1.7, 0.1, 1.0); box('moebelHolz', r.p1 - 0.6, qAt(tiefe - 0.5), 0.5, 0.5, 0.6); }
        else if (art === 1) { box('stoffWarm', pm, qAt(tiefe - 0.75), Math.min(2.4, breite - 1), 0.85, 0.8); box('moebelHolz', pm, qAt(tiefe - 1.9), 1.1, 0.6, 0.42); box('moebelHolz', r.p1 - 0.35, qAt(1.6), 0.4, Math.min(2.2, tiefe - 2.2), 1.9); }
        else { box('moebelWeiss', pm, qAt(tiefe - 0.35), Math.min(3.0, breite - 0.8), 0.62, 0.9); box('moebelHolz', r.p0 + 1.1, qAt(tiefe / 2), 1.2, 0.8, 0.75); for (const s of [-1, 1]) box('moebelHolz', r.p0 + 1.1, qAt(tiefe / 2 + s * 0.75), 0.42, 0.42, 0.45); }
      } else {   // Büro: zwei Tische mit Stühlen seitlich, Regal an der Zwischenwand
        for (const s of [-1, 1]) {
          if (breite < 4.4 && s > 0) break;
          const px = pm + s * Math.min(1.45, breite / 2 - 0.9);
          box('moebelWeiss', px, qAt(tiefe - 1.2), 1.5, 0.8, 0.74); box('moebelHolz', px, qAt(tiefe - 1.2), 0.1, 0.78, 0.72);
          box('stoff', px, qAt(tiefe - 2.1), 0.5, 0.5, 0.46); box('stoff', px, qAt(tiefe - 2.33), 0.5, 0.06, 0.95);
        }
        box('moebelHolz', r.p1 - 0.3, qAt(1.5), 0.35, Math.min(1.8, tiefe - 2.6), 2.0);
      }
    }
  }
  entsorgen() { for (const g of this.geschosse.values()) { g.traverse(o => o.geometry?.dispose()); g.parent?.remove(g); } this.geschosse.clear(); }
}

// Verwaltet die Innenräume eines Ortes: welches Haus steht an, Haustür auf und zu, Geschosse um den Spieler, Licht
export class Innenwelt {
  // haeuser: Liste wie oben, findeTuer(id): Gruppe "tuerblatt" aus der Außenstufe (oder null)
  constructor({ mats, gruppe, kollision, haeuser, findeTuer }) {
    this.mats = mats; this.gruppe = gruppe; this.kollision = kollision; this.haeuser = haeuser; this.findeTuer = findeTuer;
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
  innen(h) {
    if (!this.cache.has(h.id)) {
      const I = new Innen(this.mats, h); this.cache.set(h.id, I);
      if (this.cache.size > 6) { const alt = this.cache.keys().next().value; const I2 = this.cache.get(alt); if (I2 !== this.aktiv) { I2.entsorgen(); this.cache.delete(alt); } }
    }
    return this.cache.get(h.id);
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
    }
    if (!I) { this.licht.visible = false; for (const [id, o] of this.tuerOffen) this.tuere(id, o, false, dt); return; }
    // Geschosse um den Spieler
    const Z = this.kollision.zustand, e = Math.min(Z.etage, I.N), will = new Set([e]); if (e > 0) will.add(e - 1); if (e < I.N) will.add(e + 1); if (Z.kSeg !== null) { will.add(Z.kSeg); will.add(Math.min(I.N, Z.kSeg + 1)); }
    for (const k of will) { const g = I.geschoss(k); if (!g.parent) this.gruppe.add(g); g.visible = true; }
    for (const [k, g] of I.geschosse) if (!will.has(k)) g.visible = false;
    const drin = I.drin(pos.x, pos.z);
    this.licht.visible = drin; if (drin) { this.licht.position.set(pos.x, pos.y + 2.0, pos.z); this.licht.intensity = 9; }
    const t = this.findeTuer(aktiv.id); if (t) t.getObjectByName('hinten').visible = false;
    // Haustür: auf, wenn der Spieler näher als 2,2 m ist (beide Seiten), sonst zu
    const d = Math.hypot(I.tuer.mitte[0] - pos.x, I.tuer.mitte[1] - pos.z);
    this.tuere(aktiv.id, this.tuerOffen.get(aktiv.id) || { w: 0 }, d < 2.2, dt);
  }
  tuere(id, o, auf, dt) {
    const ziel = auf ? 1 : 0; o.w += (ziel - o.w) * (1 - Math.exp(-5 * dt));
    if (Math.abs(o.w - ziel) < 0.003) o.w = ziel;
    this.tuerOffen.set(id, o);
    const t = this.findeTuer(id); if (t) t.getObjectByName('blatt').rotation.y = o.w * 1.5;   // nach innen (lokal +z ist außen)
    if (o.w === 0 && !auf) this.tuerOffen.delete(id);
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
