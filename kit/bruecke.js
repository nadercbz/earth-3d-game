// Brücken über Wasser als Bauwerke (06.11.2026, Nader: "alles, was in der echten Welt will ich da auch haben", "maßstabsgetreu"). Vorher lag die Fahrbahn flach auf dem Gelände, über Flüssen also unter dem Wasser.
// Lage und Breite aus den Kacheln (brunnel=bridge über Wasser, kit/ortbau.js). Höhe nach Länge und Ufer, Rampen mit höchstens 5,5 % Steigung. Drei Bauarten: Steinbogen in alten Städten, Balken auf Pfeilern, Schrägseil ab 520 m.
// Autos, Fußgänger und Spieler fahren oben: das Höhenfeld dieser Klasse ersetzt ort.H. Unter der Brücke bleibt das Gelände (ort.Hz entscheidet nach der letzten Höhe, Uferstraßen fahren unten durch). Keine Marken, nur Bauart.
import * as THREE from 'three';

const ZELLE = 16;
const glatt = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export class BrueckenFeld {
  constructor(liste, Hg, halb, { altStadt = false } = {}) {
    this.Hg = Hg; this.ketten = []; this.zellen = new Map(); this.altStadt = altStadt;
    for (const b of liste) { const k = this.kette(b, halb); if (k) this.ketten.push(k); }
    for (const k of this.ketten) for (let i = 1; i < k.x.length; i++) { const seg = { k, i }, r = k.halb + 0.5, x0 = Math.floor((Math.min(k.x[i - 1], k.x[i]) - r) / ZELLE), x1 = Math.floor((Math.max(k.x[i - 1], k.x[i]) + r) / ZELLE), z0 = Math.floor((Math.min(k.z[i - 1], k.z[i]) - r) / ZELLE), z1 = Math.floor((Math.max(k.z[i - 1], k.z[i]) + r) / ZELLE); for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) { const s = a * 100003 + c; (this.zellen.get(s) || this.zellen.set(s, []).get(s)).push(seg); } }
    // ort.H: oben, wo eine Brücke ist. ort.Hz: mit der letzten Höhe, wer unten ist, bleibt unten
    this.H = (x, z) => { const g = Hg(x, z), d = this.deck(x, z); return d === null ? g : Math.max(g, d); };
    this.Hz = (x, z, yAlt) => { const g = Hg(x, z), d = this.deck(x, z); if (d === null) return g; if (yAlt === undefined) return Math.max(g, d); return yAlt > d - 3.2 ? Math.max(g, d) : g; };
  }
  deck(x, z) {
    const l = this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)); if (!l) return null; let best = null;
    for (const { k, i } of l) { const ax = k.x[i - 1], az = k.z[i - 1], dx = k.x[i] - ax, dz = k.z[i] - az, q = dx * dx + dz * dz, t = q > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / q)) : 0, px = ax + dx * t - x, pz = az + dz * t - z; if (px * px + pz * pz > k.halb * k.halb) continue; const y = k.y[i - 1] + (k.y[i] - k.y[i - 1]) * t; if (best === null || y > best) best = y; }
    return best;
  }
  // Linie alle 5 m abtasten, Höhe festlegen
  kette(b, halb) {
    const X = [], Z = []; for (let i = 1; i < b.p.length; i++) { const [ax, az] = b.p[i - 1], [bx, bz] = b.p[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 5)); for (let j = i === 1 ? 0 : 1; j <= n; j++) { X.push(ax + (bx - ax) * j / n); Z.push(az + (bz - az) * j / n); } }
    if (X.length < 3) return null; const N = X.length, S = new Float64Array(N); for (let i = 1; i < N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); const L = S[N - 1]; if (L < 10) return null;
    const G = Array.from({ length: N }, (_, i) => this.Hg(X[i], Z[i])), tief = Math.min(...G), fuss = b.hw === 'fuss', steig = fuss ? 0.075 : 0.055, rand = (x, z) => Math.abs(x) > halb - 1 || Math.abs(z) > halb - 1, aR = rand(X[0], Z[0]), bR = rand(X[N - 1], Z[N - 1]), yA = aR ? null : G[0], yB = bR ? null : G[N - 1];
    let yD = Math.max(tief + (fuss ? THREE.MathUtils.clamp(1.8 + L * 0.02, 2.6, 8) : THREE.MathUtils.clamp(3 + L * 0.035, 5, 24)), Math.max(yA ?? -1e9, yB ?? -1e9) + Math.min(1.5, L * 0.012));
    if (yA !== null && yB !== null) yD = Math.max(Math.max(yA, yB) + 0.25, Math.min(yD, (0.62 * L * steig + yA + yB) / 2)); else if (yA !== null || yB !== null) { const e = yA ?? yB; yD = Math.max(e + 0.25, Math.min(yD, e + 0.62 * L * steig)); }
    const ra = yA === null ? 0 : (yD - yA) / steig * 1.45, rb = yB === null ? 0 : (yD - yB) / steig * 1.45, Y = new Float32Array(N);
    for (let i = 0; i < N; i++) { const s = S[i]; let y = yD; if (ra > 0 && s < ra) y = yA + (yD - yA) * glatt(s / ra); if (rb > 0 && L - s < rb) y = Math.min(y, yB + (yD - yB) * glatt((L - s) / rb)); Y[i] = y; }
    const w = Math.max(fuss ? 3.2 : 5, b.w), geh = fuss ? 0 : w >= 7 ? 1.9 : 1.1, h = (Math.imul(Math.round(X[0] * 3), 73856093) ^ Math.imul(Math.round(Z[0] * 3), 19349663)) >>> 0, z01 = (h % 1000) / 1000;
    const art = !fuss && L > 520 && w >= 7 ? 'seil' : L < 300 && (this.altStadt ? z01 < 0.72 : z01 < 0.1) ? 'stein' : 'balken';
    return { x: X, z: Z, y: Y, s: S, g: G, L, w, geh, halb: w / 2 + geh + 0.2, fuss, art, aussen: w / 2 + geh };
  }
}

// Sammler je Material
class Teil { constructor() { this.pos = []; this.nor = []; this.uv = []; }
  quad(a, b, c, d, ua, ub, uc, ud) { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2]; let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (const [q, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { this.pos.push(q[0], q[1], q[2]); this.nor.push(nx, ny, nz); this.uv.push(u[0], u[1]); } }
  geo() { if (!this.pos.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); return g; }
}
const uvXZ = p => [p[0], p[2]];
// Baut alle Brücken eines Ortes: Fahrbahn, Gehwege, Geländer, Pfeiler. M: Materialien des Ortes, rails kommt in die Kollision
export function brueckenBauen(feld, M, { mobil = false } = {}) {
  const T = { fahr: new Teil(), geh: new Teil(), beton: new Teil(), stein: new Teil(), stahl: new Teil(), seil: new Teil() }, rails = [], Hg = feld.Hg;
  for (const k of feld.ketten) {
    const N = k.x.length, tx = new Float32Array(N), tz = new Float32Array(N); for (let i = 0; i < N; i++) { const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), dx = k.x[b] - k.x[a], dz = k.z[b] - k.z[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
    const P = (i, o, dy = 0) => [k.x[i] - tz[i] * o, k.y[i] + dy, k.z[i] + tx[i] * o];   // o: seitlich, positiv links der Fahrtrichtung
    const hw = k.w / 2, au = k.aussen, dicke = k.art === 'stein' ? 0.9 : k.fuss ? 0.7 : Math.min(2.4, 1.1 + k.L * 0.0035), hoch = i => k.y[i] - k.g[i];
    for (let i = 1; i < N; i++) {
      const a = i - 1, b = i, sa = k.s[a], sb = k.s[b];
      // Fahrbahn (oder Gehfläche), Gehwege mit Bordstein
      if (k.fuss) { const p = [P(a, -hw, 0.02), P(b, -hw, 0.02), P(b, hw, 0.02), P(a, hw, 0.02)]; T.geh.quad(p[0], p[3], p[2], p[1], uvXZ(p[0]), uvXZ(p[3]), uvXZ(p[2]), uvXZ(p[1])); }
      else {
        const p = [P(a, -hw, 0.02), P(b, -hw, 0.02), P(b, hw, 0.02), P(a, hw, 0.02)]; T.fahr.quad(p[0], p[3], p[2], p[1], uvXZ(p[0]), uvXZ(p[3]), uvXZ(p[2]), uvXZ(p[1]));
        for (const s of [-1, 1]) { const o0 = s * hw, o1 = s * au, q = [P(a, o0, 0.17), P(b, o0, 0.17), P(b, o1, 0.17), P(a, o1, 0.17)]; if (s > 0) T.geh.quad(q[0], q[3], q[2], q[1], uvXZ(q[0]), uvXZ(q[3]), uvXZ(q[2]), uvXZ(q[1])); else T.geh.quad(q[0], q[1], q[2], q[3], uvXZ(q[0]), uvXZ(q[1]), uvXZ(q[2]), uvXZ(q[3]));
          const c = [P(a, o0, 0.02), P(b, o0, 0.02), P(b, o0, 0.17), P(a, o0, 0.17)]; if (s > 0) T.geh.quad(c[0], c[1], c[2], c[3], [sa, 0], [sb, 0], [sb, 0.15], [sa, 0.15]); else T.geh.quad(c[0], c[3], c[2], c[1], [sa, 0], [sa, 0.15], [sb, 0.15], [sb, 0]); }
      }
      const obenY = k.fuss ? 0.02 : 0.17, hoehe = Math.min(hoch(a), hoch(b)), stoff = k.art === 'stein' ? T.stein : T.beton;
      // Seiten und Unterseite (Steinbögen legt die Spannweite unten eigene Flächen an)
      if (k.art !== 'stein') { for (const s of [-1, 1]) { const o = s * au, q = [P(a, o, -dicke), P(b, o, -dicke), P(b, o, obenY), P(a, o, obenY)]; if (s < 0) stoff.quad(q[0], q[3], q[2], q[1], [sa, 0], [sa, dicke], [sb, dicke], [sb, 0]); else stoff.quad(q[0], q[1], q[2], q[3], [sa, 0], [sb, 0], [sb, dicke], [sa, dicke]); }
        const u = [P(a, -au, -dicke), P(b, -au, -dicke), P(b, au, -dicke), P(a, au, -dicke)]; stoff.quad(u[0], u[1], u[2], u[3], uvXZ(u[0]), uvXZ(u[1]), uvXZ(u[2]), uvXZ(u[3])); }
      // Geländer, wo es hinunter geht
      if (hoehe > 0.9) for (const s of [-1, 1]) {
        const o = s * (au - 0.04);
        if (k.art === 'stein') { const d = 0.28, i0 = o - s * d, q1 = [P(a, o, obenY), P(b, o, obenY), P(b, o, 1.05), P(a, o, 1.05)], q2 = [P(a, i0, obenY), P(b, i0, obenY), P(b, i0, 1.05), P(a, i0, 1.05)], q3 = [P(a, i0, 1.05), P(b, i0, 1.05), P(b, o, 1.05), P(a, o, 1.05)];
          if (s > 0) { T.stein.quad(q1[0], q1[1], q1[2], q1[3], [sa, 0], [sb, 0], [sb, 1], [sa, 1]); T.stein.quad(q2[0], q2[3], q2[2], q2[1], [sa, 0], [sa, 1], [sb, 1], [sb, 0]); T.stein.quad(q3[0], q3[3], q3[2], q3[1], [sa, 0], [sa, 0.3], [sb, 0.3], [sb, 0]); } else { T.stein.quad(q1[0], q1[3], q1[2], q1[1], [sa, 0], [sa, 1], [sb, 1], [sb, 0]); T.stein.quad(q2[0], q2[1], q2[2], q2[3], [sa, 0], [sb, 0], [sb, 1], [sa, 1]); T.stein.quad(q3[0], q3[1], q3[2], q3[3], [sa, 0], [sb, 0], [sb, 0.3], [sa, 0.3]); } }
        else { // Handlauf und Stäbe
          for (const hR of [1.08, 0.62]) { const r = 0.035; for (const [d1, d2] of [[0, r], [r, 0]]) { const q = [P(a, o - s * d1, obenY + hR - d2), P(b, o - s * d1, obenY + hR - d2), P(b, o + s * d1, obenY + hR + d2), P(a, o + s * d1, obenY + hR + d2)]; T.stahl.quad(q[0], q[1], q[2], q[3], [0, 0], [1, 0], [1, 1], [0, 1]); T.stahl.quad(q[0], q[3], q[2], q[1], [0, 0], [0, 1], [1, 1], [1, 0]); } }
          if (!mobil) for (let j = 0; j < 2; j++) { const f = j / 2, x = k.x[a] + (k.x[b] - k.x[a]) * f - tz[a] * o, z = k.z[a] + (k.z[b] - k.z[a]) * f + tx[a] * o, y = k.y[a] + (k.y[b] - k.y[a]) * f + obenY, r = 0.03; T.stahl.quad([x - tx[a] * r, y, z - tz[a] * r], [x + tx[a] * r, y, z + tz[a] * r], [x + tx[a] * r, y + 1.08, z + tz[a] * r], [x - tx[a] * r, y + 1.08, z - tz[a] * r], [0, 0], [1, 0], [1, 1], [0, 1]); T.stahl.quad([x - tx[a] * r, y, z - tz[a] * r], [x - tx[a] * r, y + 1.08, z - tz[a] * r], [x + tx[a] * r, y + 1.08, z + tz[a] * r], [x + tx[a] * r, y, z + tz[a] * r], [0, 0], [0, 1], [1, 1], [1, 0]); }
        }
        // Kollision: dünner Streifen, nicht hinunterfallen
        if ((i - 1) % 2 === 0) { const e = Math.min(N - 1, i + 1), a0 = P(a, o), b0 = P(e, o), a1 = P(a, o + s * 0.45), b1 = P(e, o + s * 0.45); rails.push([[a0[0], a0[2]], [b0[0], b0[2]], [b1[0], b1[2]], [a1[0], a1[2]]]); }
      }
    }
    // Pfeiler
    const prisma = (t, x, z, ax, az, halbQ, halbL, y0, y1, spitz) => { // ax, az: Richtung quer zur Brücke (entlang der Pfeilerwand); Grundriss als Sechseck mit Spitzen quer zum Wasser
      const lx = az, lz = -ax, ring = spitz > 0 ? [[-halbQ - spitz, 0], [-halbQ, -halbL], [halbQ, -halbL], [halbQ + spitz, 0], [halbQ, halbL], [-halbQ, halbL]] : [[-halbQ, -halbL], [halbQ, -halbL], [halbQ, halbL], [-halbQ, halbL]], n = ring.length, W = ring.map(([q, l]) => [x + ax * q + lx * l, z + az * q + lz * l]);
      for (let i = 0; i < n; i++) { const a = W[i], b = W[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); t.quad([a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], [0, y0], [0, y1], [L, y1], [L, y0]); }
      t.quad([W[0][0], y1, W[0][1]], [W[n - 1][0], y1, W[n - 1][1]], [W[n >> 1][0], y1, W[n >> 1][1]], [W[1][0], y1, W[1][1]], [0, 0], [1, 0], [1, 1], [0, 1]);
    };
    const span = k.art === 'stein' ? THREE.MathUtils.clamp(k.L / 5, 14, 34) : k.fuss ? 30 : THREE.MathUtils.clamp(k.L / 6, 34, 72), nS = Math.max(1, Math.round(k.L / span)), iBei = s => { let i = 0; while (i < N - 1 && k.s[i] < s) i++; return i; }, piers = [];
    for (let j = 1; j < nS; j++) piers.push(iBei(j * k.L / nS));
    if (k.art === 'seil') { /* Pylone weiter unten */ }
    for (const i of piers) { const y1 = k.y[i] - dicke, g0 = Hg(k.x[i], k.z[i]), y0 = g0 - 4; if (y1 - g0 < 1.3) continue; const ax = -tz[i], az = tx[i], x = k.x[i], z = k.z[i];
      if (k.art === 'stein') prisma(T.stein, x, z, ax, az, au * 0.98, Math.max(1.1, span * 0.075), y0, y1 - Math.min(1.5, (y1 - g0) * 0.2), 1.9);
      else if (au > 5.5) { for (const s of [-1, 1]) prisma(T.beton, x + ax * s * au * 0.55, z + az * s * au * 0.55, ax, az, 1.05, 1.05, y0, y1 - 0.9, 0.5); prisma(T.beton, x, z, ax, az, au * 0.95, 0.85, y1 - 1.1, y1, 0); }
      else prisma(T.beton, x, z, ax, az, au * 0.85, 0.65, y0, y1, 0.6);
    }
    // Steinbögen: Wand bis zum Bogen, Bogenunterseite
    if (k.art === 'stein') { const grenzen = [0, ...piers.map(i => k.s[i]), k.L]; for (let j = 1; j < grenzen.length; j++) { const s0 = grenzen[j - 1], s1 = grenzen[j], sp = s1 - s0; if (sp < 4) continue; const steps = 12; let vA = null; for (let q = 0; q <= steps; q++) { const u = q / steps, s = s0 + sp * u, i = Math.min(N - 2, Math.max(0, iBei(s) - 1)), f = THREE.MathUtils.clamp((s - k.s[i]) / Math.max(0.01, k.s[i + 1] - k.s[i]), 0, 1), x = k.x[i] + (k.x[i + 1] - k.x[i]) * f, z = k.z[i] + (k.z[i + 1] - k.z[i]) * f, y = k.y[i] + (k.y[i + 1] - k.y[i]) * f, g = k.g[i] + (k.g[i + 1] - k.g[i]) * f, frei = Math.max(0.4, y - g - dicke), rise = Math.min(frei * 0.9, sp * 0.42), ya = y - dicke - rise + rise * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), nx = -tz[i], nz = tx[i], w = { x, z, y, ya, nx, nz, s }; if (vA) { for (const si of [-1, 1]) { const o = si * au, a1 = [vA.x + vA.nx * o, vA.ya, vA.z + vA.nz * o], b1 = [w.x + w.nx * o, w.ya, w.z + w.nz * o], b2 = [w.x + w.nx * o, w.y + 0.02, w.z + w.nz * o], a2 = [vA.x + vA.nx * o, vA.y + 0.02, vA.z + vA.nz * o]; if (si < 0) T.stein.quad(a1, a2, b2, b1, [vA.s, a1[1]], [vA.s, a2[1]], [w.s, b2[1]], [w.s, b1[1]]); else T.stein.quad(a1, b1, b2, a2, [vA.s, a1[1]], [w.s, b1[1]], [w.s, b2[1]], [vA.s, a2[1]]); } const a3 = [vA.x - vA.nx * au, vA.ya, vA.z - vA.nz * au], b3 = [w.x - w.nx * au, w.ya, w.z - w.nz * au], b4 = [w.x + w.nx * au, w.ya, w.z + w.nz * au], a4 = [vA.x + vA.nx * au, vA.ya, vA.z + vA.nz * au]; T.stein.quad(a3, b3, b4, a4, [vA.s, -au], [w.s, -au], [w.s, au], [vA.s, au]); } vA = w; } } }
    // Schrägseil: zwei Pylone, je Seite und Richtung 10 Seile
    if (k.art === 'seil') { const hP = Math.min(95, 24 + k.L * 0.06), seil = (a, b, r = 0.12) => { for (const [dx, dz] of [[r, 0], [0, r]]) { T.seil.quad([a[0] - dx, a[1], a[2] - dz], [b[0] - dx, b[1], b[2] - dz], [b[0] + dx, b[1], b[2] + dz], [a[0] + dx, a[1], a[2] + dz], [0, 0], [1, 0], [1, 1], [0, 1]); T.seil.quad([a[0] - dx, a[1], a[2] - dz], [a[0] + dx, a[1], a[2] + dz], [b[0] + dx, b[1], b[2] + dz], [b[0] - dx, b[1], b[2] - dz], [0, 0], [0, 1], [1, 1], [1, 0]); } };
      for (const f of [0.34, 0.66]) { const i = iBei(k.L * f), x = k.x[i], z = k.z[i], y = k.y[i], ax = -tz[i], az = tx[i], g0 = Hg(x, z), o = au + 1.3; for (const s of [-1, 1]) prisma(T.beton, x + ax * s * o, z + az * s * o, ax, az, 1.2, 1.7, g0 - 4, y + hP, 0); prisma(T.beton, x, z, ax, az, o + 1.2, 1.4, y - dicke - 2.2, y - dicke, 0); prisma(T.beton, x, z, ax, az, o + 1.2, 1.2, y + hP - 5, y + hP - 2.4, 0);
        for (const s of [-1, 1]) for (const dir of [-1, 1]) for (let c = 1; c <= (mobil ? 5 : 10); c++) { const d = c * (k.L * 0.15) / (mobil ? 5 : 10), iC = iBei(k.s[i] + dir * d); if (iC <= 0 || iC >= N - 1) continue; const q = P(iC, s * (au - 0.1), 0.1), oben = [x + ax * s * o, y + hP - 6 - c * 1.4, z + az * s * o]; seil(oben, q); } } }
  }
  const G = new THREE.Group(); G.name = 'bruecken'; const baue = (t, m, schatten) => { const g = t.geo(); if (!g || !m) return; const h = new THREE.Mesh(g, m); h.castShadow = schatten && !mobil; h.receiveShadow = true; h.frustumCulled = false; G.add(h); };
  baue(T.fahr, M.fahr, false); baue(T.geh, M.geh, false); baue(T.beton, M.beton, true); baue(T.stein, M.stein, true); baue(T.stahl, M.stahl, false); baue(T.seil, M.seil, false);
  return { gruppe: G, rails };
}
