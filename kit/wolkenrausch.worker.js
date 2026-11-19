// Rauschen für die Wolken (kit/wolkenberge.js), einmal beim Start im Hintergrund gerechnet: periodisches Perlin und Worley Rauschen wie bei Nubis (Horizon Zero Dawn).
// Form (64³): R Perlin-Worley (Grundform), G, B, A Worley in drei Größen. Detail (32³): R, G, B Worley fein, für angefressene Ränder.
function hash(x, y, z, c) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(c + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// Merkmalspunkte je Zelle, periodisch
function punkte(f, c) { const p = new Float32Array(f * f * f * 3); for (let z = 0, i = 0; z < f; z++) for (let y = 0; y < f; y++) for (let x = 0; x < f; x++, i += 3) { p[i] = x + hash(x, y, z, c); p[i + 1] = y + hash(x, y, z, c + 100); p[i + 2] = z + hash(x, y, z, c + 200); } return p; }
function worley(fx, fy, fz, f, P) {
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz); let m = 9;
  for (let dz = -1; dz <= 1; dz++) { const gz = iz + dz, wz = ((gz % f) + f) % f, oz = gz - wz; for (let dy = -1; dy <= 1; dy++) { const gy = iy + dy, wy = ((gy % f) + f) % f, oy = gy - wy; for (let dx = -1; dx <= 1; dx++) {
    const gx = ix + dx, wx = ((gx % f) + f) % f, ox = gx - wx, i = (wx + wy * f + wz * f * f) * 3, ax = P[i] + ox - fx, ay = P[i + 1] + oy - fy, az = P[i + 2] + oz - fz, d = ax * ax + ay * ay + az * az; if (d < m) m = d;
  } } }
  return 1 - Math.min(1, Math.sqrt(m));   // umgekehrt: Mitte hell, wie Ballen
}
function gradient(f, c) { const g = new Float32Array(f * f * f * 3); for (let i = 0; i < f * f * f; i++) { const z = hash(i, 1, 7, c) * 2 - 1, a = hash(i, 2, 9, c) * 6.2831853, r = Math.sqrt(1 - z * z); g[i * 3] = r * Math.cos(a); g[i * 3 + 1] = r * Math.sin(a); g[i * 3 + 2] = z; } return g; }
const q = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
function perlin(x, y, z, f, G) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), tx = x - ix, ty = y - iy, tz = z - iz, u = q(tx), v = q(ty), w = q(tz);
  const n = (a, b, c) => { const k = (((ix + a) % f + f) % f + ((iy + b) % f + f) % f * f + ((iz + c) % f + f) % f * f * f) * 3; return G[k] * (tx - a) + G[k + 1] * (ty - b) + G[k + 2] * (tz - c); };
  return lerp(lerp(lerp(n(0, 0, 0), n(1, 0, 0), u), lerp(n(0, 1, 0), n(1, 1, 0), u), v), lerp(lerp(n(0, 0, 1), n(1, 0, 1), u), lerp(n(0, 1, 1), n(1, 1, 1), u), v), w) * 0.5 + 0.5;
}
const rm = (v, a, b, c, d) => c + (v - a) / (b - a) * (d - c);
function fbmWorley(x, y, z, n, L) { return worley(x * L[0].f, y * L[0].f, z * L[0].f, L[0].f, L[0].P) * 0.625 + worley(x * L[1].f, y * L[1].f, z * L[1].f, L[1].f, L[1].P) * 0.25 + worley(x * L[2].f, y * L[2].f, z * L[2].f, L[2].f, L[2].P) * 0.125; }
const ebene = (f, c) => ({ f, P: punkte(f, c) });
// Kontrast: jeden Kanal nach Perzentilen auf den vollen Bereich strecken (sonst läge fast alles zwischen 0,6 und 0,8 und die Bedeckung ließe sich nicht regeln)
function strecken(d, roh, n = 4) {
  for (let c = 0; c < n; c++) {
    const v = new Float32Array(roh[c]); v.sort(); const a = v[Math.floor(v.length * 0.005)], b = v[Math.floor(v.length * 0.995)];
    for (let i = 0; i < roh[c].length; i++) d[i * 4 + c] = Math.max(0, Math.min(255, (roh[c][i] - a) / (b - a) * 255));
  }
}
self.onmessage = () => {
  const n = 64, form = new Uint8Array(n * n * n * 4), rohF = [0, 1, 2, 3].map(() => new Float32Array(n * n * n)), perl = [[4, gradient(4, 1)], [8, gradient(8, 2)], [16, gradient(16, 3)]];
  const W1 = [ebene(4, 11), ebene(8, 12), ebene(16, 13)], W2 = [ebene(8, 21), ebene(16, 22), ebene(32, 23)], W3 = [ebene(16, 31), ebene(32, 32), ebene(64, 33)];
  for (let z = 0, o = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++, o += 4) {
    const fx = x / n, fy = y / n, fz = z / n;
    const pf = perlin(fx * 4, fy * 4, fz * 4, 4, perl[0][1]) * 0.6 + perlin(fx * 8, fy * 8, fz * 8, 8, perl[1][1]) * 0.28 + perlin(fx * 16, fy * 16, fz * 16, 16, perl[2][1]) * 0.12;
    const w1 = fbmWorley(fx, fy, fz, 3, W1), w2 = fbmWorley(fx, fy, fz, 3, W2), w3 = fbmWorley(fx, fy, fz, 3, W3);
    const pg = Math.max(0, Math.min(1, (pf - 0.3) / 0.4));          // Perlin aufgespreizt
    const pw = rm(pg, 0, 1, Math.max(0, (w1 - 0.25) / 0.5), 1);       // Perlin an Worley: Ballen mit Blumenkohl statt Watte
    const i = o / 4; rohF[0][i] = pw; rohF[1][i] = w1; rohF[2][i] = w2; rohF[3][i] = w3;
  }
  strecken(form, rohF);
  const d = 32, det = new Uint8Array(d * d * d * 4), rohD = [0, 1, 2].map(() => new Float32Array(d * d * d)), D1 = [ebene(4, 41), ebene(8, 42), ebene(16, 43)], D2 = [ebene(8, 51), ebene(16, 52), ebene(32, 53)];
  for (let z = 0, o = 0; z < d; z++) for (let y = 0; y < d; y++) for (let x = 0; x < d; x++, o += 4) {
    const fx = x / d, fy = y / d, fz = z / d, i = o / 4; rohD[0][i] = fbmWorley(fx, fy, fz, 3, D1); rohD[1][i] = fbmWorley(fx, fy, fz, 3, D2); rohD[2][i] = worley(fx * 32, fy * 32, fz * 32, 32, D2[2].P); det[o + 3] = 255;
  }
  strecken(det, rohD, 3);
  self.postMessage({ form, n, det, d }, [form.buffer, det.buffer]);
};
