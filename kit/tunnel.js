// Straßentunnel im Spiel (Wunsch Nr. 98, 09.11.2026): offene Tröge mit Stützwänden und Röhren mit Decke und Lichtband, befahrbar.
// Lage aus dem Ortsworker (kit/tunnelbau.js, daten.tunnel), Höhen hier aus dem Gelände: in der Stadt liegt die Fahrbahn der Röhre TIEFE unter dem
// Gelände, der Trog führt vom Gelände zum Portal hinunter. Im Berg (Gelände über dem Tunnel deutlich höher als die Portale) verläuft die Röhre gerade
// zwischen den Portalen und braucht keinen Trog.
// Höhe: im Trog ersetzt der Trogboden das Gelände (H). In der Röhre gilt Hz mit der letzten Höhe wie bei Brücken: wer unten ist, bleibt unten.
// Kollision: unten zählt nur der Korridor des Tunnels (Häuser darüber sind keine Wände), am Trog hält oben ein Geländer.
import * as THREE from 'three';
import { TIEFE } from './tunnelbau.js';

const ZELLE = 16, LICHT = 5.0, GELAENDER = 0.95;
const glatt = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

export class TunnelFeld {
  constructor(liste, Hg, halb = 600) {
    this.Hg = (x, z) => { const h = Hg(x, z); return Number.isFinite(h) ? h : 0; }; this.ketten = []; this.zellen = new Map(); this.halbOrt = halb;
    const roehren = [], troege = [];
    for (const t of liste) { const k = this.abtasten(t); if (k) (t.offen ? troege : roehren).push(k); }
    for (const k of roehren) {   // Röhre: Stadt (TIEFE unter dem geglätteten Gelände) oder Berg (gerade zwischen den Portalen)
      const n = k.x.length, gA = k.g[0], gB = k.g[n - 1]; let ueber = 0; for (let i = 0; i < n; i++) ueber = Math.max(ueber, k.g[i] - (gA + (gB - gA) * k.s[i] / k.L)); k.berg = ueber > 15;
      for (let i = 0; i < n; i++) {
        if (k.berg) { k.y[i] = gA + (gB - gA) * k.s[i] / k.L; continue; }
        let s = 0, c = 0; for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) { s += k.g[j]; c++; }
        k.y[i] = (i === 0 || i === n - 1 ? k.g[i] : s / c) - TIEFE;
      }
      this.ketten.push(k);
    }
    for (const k of troege) {   // Trog: Punkt 0 am Portal (unten), letzter Punkt auf Geländehöhe
      const n = k.x.length, r = roehren.find(q => Math.hypot(q.x[0] - k.x[0], q.z[0] - k.z[0]) < 6 || Math.hypot(q.x[q.x.length - 1] - k.x[0], q.z[q.z.length - 1] - k.z[0]) < 6);
      k.berg = !!r?.berg; const y0 = k.berg ? k.g[0] : k.g[0] - TIEFE, yN = k.g[n - 1], a = Math.min(1, Math.max(0, (k.L - 30) / 40));   // kurze Tröge gerade (glatt hat in der Mitte das 1,5 fache Gefälle)
      for (let i = 0; i < n; i++) { const t = k.s[i] / k.L; k.y[i] = Math.min(k.g[i], y0 + (yN - y0) * ((1 - a) * t + a * glatt(t))); }
      this.ketten.push(k);
    }
    for (const k of this.ketten) for (let i = 1; i < k.x.length; i++) {
      const r = k.halb + 7, x0 = Math.floor((Math.min(k.x[i - 1], k.x[i]) - r) / ZELLE), x1 = Math.floor((Math.max(k.x[i - 1], k.x[i]) + r) / ZELLE), z0 = Math.floor((Math.min(k.z[i - 1], k.z[i]) - r) / ZELLE), z1 = Math.floor((Math.max(k.z[i - 1], k.z[i]) + r) / ZELLE);
      for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) { const key = a * 100003 + c; (this.zellen.get(key) || this.zellen.set(key, []).get(key)).push({ k, i }); }
    }
    this.n = this.ketten.length;
  }
  // Linie alle 4 m abtasten: x, z, Abstand s, Gelände g, Fahrbahnhöhe y, halbe Breite (Fahrbahn plus Schulter)
  abtasten(t) {
    const X = [], Z = []; for (let i = 1; i < t.p.length; i++) { const [ax, az] = t.p[i - 1], [bx, bz] = t.p[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 4)); for (let j = i === 1 ? 0 : 1; j <= n; j++) { X.push(ax + (bx - ax) * j / n); Z.push(az + (bz - az) * j / n); } }
    if (X.length < 2) return null; const N = X.length, S = new Float64Array(N); for (let i = 1; i < N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); if (S[N - 1] < 4) return null;
    return { x: X, z: Z, s: S, L: S[N - 1], g: X.map((x, i) => this.Hg(x, Z[i])), y: new Float64Array(N), halb: Math.max(2.6, (t.w || 6) / 2 + 0.6), offen: !!t.offen, hw: t.hw };
  }
  // nächstes Stück des Korridors bei x, z (Abstand zur Mittellinie bis halb + rand): { k, d, y }
  // mit yRef (letzte Höhe): unter mehreren Stücken das, dessen Boden am besten zur letzten Höhe passt (zwei Röhren dicht nebeneinander, Abzweige)
  bei(x, z, rand = 0, yRef) {
    const l = this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)); if (!l) return null; let best = null, bw = Infinity;
    for (const { k, i } of l) {
      const ax = k.x[i - 1], az = k.z[i - 1], dx = k.x[i] - ax, dz = k.z[i] - az, q = dx * dx + dz * dz, t = q > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / q)) : 0, d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d > k.halb + rand) continue; const y = k.y[i - 1] + (k.y[i] - k.y[i - 1]) * t, w = yRef === undefined ? d : Math.abs(y - yRef) * 3 + d;
      if (w < bw) { bw = w; best = { k, d, y }; }
    }
    return best;
  }
  // H: im offenen Trog gibt es kein Gelände, dort gilt der Trogboden
  H(x, z, H0) { const b = this.bei(x, z); return b && b.k.offen ? b.y : H0(x, z); }
  // Hz: im Trog der Boden, in der Röhre nur, wer schon unten ist (letzte Höhe weit unter der Oberfläche und nahe am Röhrenboden)
  Hz(x, z, yAlt, Hz0) {
    const b = this.bei(x, z, 0, yAlt); if (!b) return Hz0(x, z, yAlt); if (b.k.offen) return b.y;
    const oben = Hz0(x, z, yAlt); if (yAlt !== undefined && yAlt < oben - 2.5 && Math.abs(yAlt - b.y) < 3.5) return b.y; return oben;
  }
  // Kollision (kit/collision.js): null = normale Regeln, true = frei (im Korridor unten), false = Wand oder Geländer
  unten(x, z, yAkt) {
    if (yAkt === undefined) return null;
    const b = this.bei(x, z, 0, yAkt), g = this.Hg(x, z);
    if (b) { if (b.k.offen && yAkt > b.y + 1.2) return false; if (yAkt < g - 2.5) return true; return null; }   // Geländer am Trog, unten frei
    if (yAkt < g - 2.5 && this.bei(x, z, 8)) return false;   // unten neben dem Korridor: Tunnelwand
    return null;
  }
}

// Netze: Fahrbahn, Stützwände (Trog bis über das Gelände als Brüstung), Röhre mit Wänden, Decke, Lichtband, Portalwände, Leitlinie in der Mitte
export function tunnelBauen(feld, M) {
  const G = new THREE.Group(); G.name = 'tunnel';
  const neu = () => ({ pos: [], nor: [], uv: [] }), T = { fahr: neu(), wand: neu(), decke: neu(), licht: neu(), mark: neu() };
  const quad = (t, a, b, c, d, ua, ub, uc, ud) => { const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize(); for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { t.pos.push(...p); t.nor.push(n.x, n.y, n.z); t.uv.push(...u); } };
  for (const k of feld.ketten) {
    const n = k.x.length, tx = [], tz = [];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = k.x[b] - k.x[a], dz = k.z[b] - k.z[a], L = Math.hypot(dx, dz) || 1; tx.push(dx / L); tz.push(dz / L); }
    const P = (i, q, dy = 0) => [k.x[i] - tz[i] * q, k.y[i] + dy, k.z[i] + tx[i] * q], h = k.halb;
    for (let i = 1; i < n; i++) {
      const j = i - 1, v0 = k.s[j] / 4, v1 = k.s[i] / 4;
      quad(T.fahr, P(j, -h, 0.02), P(j, h, 0.02), P(i, h, 0.02), P(i, -h, 0.02), [0, v0], [h * 2 / 4, v0], [h * 2 / 4, v1], [0, v1]);   // Fahrbahn, Normale nach oben
      for (const sg of [-1, 1]) {   // Wände, Vorderseite zur Fahrbahn
        const top = i2 => k.offen ? Math.max(k.g[i2] + GELAENDER, k.y[i2] + 0.3) - k.y[i2] : LICHT;
        const a = P(j, sg * h), b = P(i, sg * h), c = P(i, sg * h, top(i)), d = P(j, sg * h, top(j));
        if (sg < 0) quad(T.wand, a, b, c, d, [v0, 0], [v1, 0], [v1, top(i) / 4], [v0, top(j) / 4]); else quad(T.wand, a, d, c, b, [v0, 0], [v0, top(j) / 4], [v1, top(i) / 4], [v1, 0]);
        if (k.offen) { const e = P(j, sg * (h + 0.35), top(j)), f = P(i, sg * (h + 0.35), top(i)); if (sg < 0) quad(T.wand, d, c, f, e, [0, 0], [1, 0], [1, 0.1], [0, 0.1]); else quad(T.wand, d, e, f, c, [0, 0], [0, 0.1], [1, 0.1], [1, 0]); }   // Brüstung oben
      }
      if (!k.offen) {
        quad(T.decke, P(j, -h, LICHT), P(i, -h, LICHT), P(i, h, LICHT), P(j, h, LICHT), [0, v0], [0, v1], [1, v1], [1, v0]);   // Decke, Normale nach unten
        quad(T.licht, P(j, -0.22, LICHT - 0.03), P(i, -0.22, LICHT - 0.03), P(i, 0.22, LICHT - 0.03), P(j, 0.22, LICHT - 0.03), [0, 0], [0, 1], [1, 1], [1, 0]);
      }
      if (h > 3.4) for (let a0 = Math.floor(k.s[j] / 9) * 9; a0 < k.s[i]; a0 += 9) { const s0 = Math.max(a0, k.s[j]), s1 = Math.min(a0 + 3, k.s[i]); if (s1 <= s0) continue; const f0 = (s0 - k.s[j]) / (k.s[i] - k.s[j]), f1 = (s1 - k.s[j]) / (k.s[i] - k.s[j]), L = (f, q) => { const A = P(j, q, 0.035), B = P(i, q, 0.035); return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]; }, m = 0.07; quad(T.mark, L(f0, -m), L(f0, m), L(f1, m), L(f1, -m), [0, 0], [1, 0], [1, 1], [0, 1]); }   // Leitlinie: 3 m Strich, 6 m Lücke
    }
    // Portalwand über der Öffnung der Röhre bis über das Gelände (nicht am Rand des Ortes, nicht im Berg)
    if (!k.offen && !k.berg) for (const i of [0, n - 1]) {
      if (Math.abs(k.x[i]) > feld.halbOrt - 3 || Math.abs(k.z[i]) > feld.halbOrt - 3) continue;
      const hoch = Math.max(LICHT + 0.6, k.g[i] + GELAENDER - k.y[i]), sg = i === 0 ? -1 : 1, a = P(i, -h - 0.4, LICHT), b = P(i, h + 0.4, LICHT), c = P(i, h + 0.4, hoch), d = P(i, -h - 0.4, hoch);
      if (sg < 0) quad(T.wand, a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1]); else quad(T.wand, a, d, c, b, [0, 0], [0, 1], [1, 1], [1, 0]);
    }
  }
  const mats = { fahr: M.fahr, wand: M.beton, decke: M.decke || M.beton, licht: M.licht, mark: M.mark };
  for (const [key, t] of Object.entries(T)) {
    if (!t.pos.length || !mats[key]) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(t.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(t.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(t.uv, 2)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mats[key]); m.name = 'tunnel ' + key; m.receiveShadow = key !== 'licht'; m.castShadow = key === 'decke' || key === 'wand'; G.add(m);
  }
  G.userData.zahl = { roehren: feld.ketten.filter(k => !k.offen).length, troege: feld.ketten.filter(k => k.offen).length, meter: Math.round(feld.ketten.reduce((a, k) => a + k.L, 0)) };
  return G;
}
