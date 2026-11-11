// Unter Wasser (06.11.2026, Wunsch Nr. 64: "auch unter Wasser ... mit den richtigen Tiefen ... alles auch schwimmbar"). Meeresboden überall auf der Erde aus den echten Tiefen der AWS Terrain Tiles (Terrarium, enthält die Meere, ETOPO1 und GMRT, Marianengraben rund 10.900 m), Schnee im Wasser, Fischschwärme, große Tiere nach Tiefe und Breite, Riffe und Seegras in flachem Wasser, Wracks an echter Stelle. Farbe, Sichtweite, Oberfläche von unten, Sonnenstrahlen und Lampe rechnet AtmosPass (kit/atmos.js).
import * as THREE from 'three';
import { geoZuSzene, enu } from './erde.js';
import { tierLaden, TIERWUNSCH } from './wildtiere.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const URL0 = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/', D2R = Math.PI / 180, kl = THREE.MathUtils.clamp, TAU = Math.PI * 2;
const STUFEN = [10, 8, 6, 4, 2], SCHLUESSEL = (z, x, y) => z * 1e10 + x * 1e5 + y;
// Tiefen aus den Terrarium Kacheln: Stufe 10 (rund 150 m je Bildpunkt am Äquator), gröbere Stufen als Rückfall, bis die feine da ist
const SEE_WUNSCH = new Set(['hai', 'mantarochen', 'meeresschildkroete', 'delfin', 'thunfisch', 'krake', 'qualle', 'seekuh', 'robbe', 'wal', 'walross', 'orca', 'pottwal']);   // Lernseite: das gesuchte Tier zeigt sich zuerst
export class Tiefenkarte {
  constructor() { this.k = new Map(); this.lauf = 0; this.c = null; }
  anfordern(z, x, y) {
    const key = SCHLUESSEL(z, x, y); if (this.k.has(key) || this.lauf >= 6) return; this.k.set(key, null); this.lauf++;
    fetch(`${URL0}${z}/${x}/${y}.png`).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })).then(bmp => {
      this.c ||= new OffscreenCanvas(256, 256).getContext('2d', { willReadFrequently: true }); this.c.clearRect(0, 0, 256, 256); this.c.drawImage(bmp, 0, 0); bmp.close();
      const d = this.c.getImageData(0, 0, 256, 256).data, f = new Float32Array(65536); for (let i = 0; i < 65536; i++) { const v = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768; f[i] = v < -11500 ? -6000 : v; } this.k.set(key, f);
      if (this.k.size > 140) this.k.delete(this.k.keys().next().value);
    }).catch(() => { setTimeout(() => this.k.delete(key), 15000); }).finally(() => { this.lauf--; });
  }
  // Ist die feine Stufe für diese Stelle schon da?
  bereit(lat, lon) { const la = kl(lat, -85.05, 85.05) * D2R, u = (lon + 180) / 360, v = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2, n = 1024; this.tiefe(lat, lon); return !!this.k.get(SCHLUESSEL(10, Math.floor(u * n), Math.floor(v * n))); }
  tiefe(lat, lon) {
    const la = kl(lat, -85.05, 85.05) * D2R, u = (lon + 180) / 360, v = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2;
    for (const z of STUFEN) {
      const n = 2 ** z, px = u * n * 256 - 0.5, py = v * n * 256 - 0.5, i0 = Math.floor(px), j0 = Math.floor(py), fx = px - i0, fy = py - j0, N = n * 256;
      if (z === 10 || z === 6) this.anfordern(z, Math.floor(u * n), Math.floor(v * n));
      const wert = (i, j) => { const ii = ((i % N) + N) % N, jj = kl(j, 0, N - 1), tx = ii >> 8, ty = jj >> 8, f = this.k.get(SCHLUESSEL(z, tx, ty)); return f ? f[((jj & 255) << 8) + (ii & 255)] : null; }, a = wert(i0, j0); if (a === null) continue;
      const b = wert(i0 + 1, j0) ?? a, c = wert(i0, j0 + 1) ?? a, d = wert(i0 + 1, j0 + 1) ?? a; return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
    return -200;   // noch nichts da
  }
}

const BODEN_VS = `varying vec3 vW; varying vec2 vP; varying float vT, vD; attribute float aTiefe; attribute vec2 aP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vT = aTiefe; vP = aP; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const BODEN_FS = `varying vec3 vW; varying vec2 vP; varying float vT, vD; uniform vec3 uSonne; uniform float uZeit; uniform vec4 uN; uniform vec2 uLi;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  float kaustik(vec2 p, float t) { float s = 0.0; vec2 q = p; for (int i = 0; i < 3; i++) { q = vec2(q.x + sin(q.y * 1.3 + t) * 0.7, q.y + cos(q.x * 1.1 - t * 0.8) * 0.7); s += 1.0 / (1.0 + 18.0 * abs(sin(q.x) * cos(q.y))); q *= 1.7; } return s / 3.0; }
  void main() {
    vec3 N0 = normalize(cross(dFdx(vW), dFdy(vW))); if (N0.y < 0.0) N0 = -N0;
    float g = fbm(vP * 0.018), f = fbm(vP * 0.16), kk = fbm(vP * 1.1), wel = sin(vP.x * 0.9 + vP.y * 0.45 + f * 6.0) * 0.5 + 0.5, steil = smoothstep(0.1, 0.34, 1.0 - N0.y + (g - 0.5) * 0.14), flach = 1.0 - smoothstep(25.0, 150.0, vT);
    vec3 sand = mix(vec3(0.74, 0.67, 0.5), vec3(0.6, 0.54, 0.4), f), schlamm = mix(vec3(0.5, 0.47, 0.42), vec3(0.34, 0.33, 0.31), g), fels = mix(vec3(0.27, 0.26, 0.25), vec3(0.14, 0.14, 0.15), kk);
    vec3 c = mix(schlamm, sand, flach); c *= 0.8 + 0.42 * kk; c *= 1.0 - 0.14 * wel * flach; c = mix(c, fels, steil);
    float diff = 0.46 + 0.62 * max(dot(N0, uSonne), 0.0); float kaF = 1.0 - smoothstep(5.0, 38.0, vT); if (kaF > 0.01) { float ka = kaustik(vP * 0.55, uZeit * 0.9); c *= 1.0 + kaF * (ka * 1.7 - 0.32); }
    c *= diff; if (uN.w > 0.0) { c *= uLi.x + uLi.y * exp(-vD * 0.06); c = mix(c, uN.rgb, 1.0 - exp(-vD * uN.w)); }   // Handy: Dunst hier, am Rechner im AtmosPass
    gl_FragColor = vec4(c, 1.0);
  }`;

// Berühmte Wracks an echter Stelle: Name, Breite, Länge, Länge des Schiffs in Metern
export const WRACKS = [
  { name: 'Titanic', lat: 41.7258, lon: -49.9486, L: 269, tief: 3800 }, { name: 'Bismarck', lat: 48.1667, lon: -16.2, L: 251, tief: 4790 }, { name: 'Lusitania', lat: 51.4097, lon: -8.5497, L: 240, tief: 93 }, { name: 'USS Arizona', lat: 21.3649, lon: -157.9501, L: 185, tief: 12 },
  { name: 'Andrea Doria', lat: 40.4917, lon: -69.85, L: 213, tief: 73 }, { name: 'Yamato', lat: 30.7167, lon: 128.0667, L: 263, tief: 340 }, { name: 'Wilhelm Gustloff', lat: 55.0733, lon: 17.4208, L: 208, tief: 44 }, { name: 'SS Thistlegorm', lat: 27.8139, lon: 33.9206, L: 126, tief: 30 },
];
export const TIEFSTELLEN = [{ name: 'Marianengraben', lat: 11.35, lon: 142.2 }, { name: 'Tongagraben', lat: -23.25, lon: -174.73 }, { name: 'Puerto-Rico-Graben', lat: 19.8, lon: -67.3 }];
// Rost: helle Rinnen, Rostfahnen, Fensterreihen. Einmal gezeichnet, von allen Wracks geteilt
let _rost = null; function rostTextur() {
  if (_rost) return _rost; const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'); let h = 987; const R = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  g.fillStyle = '#7f6250'; g.fillRect(0, 0, 1024, 256); for (let i = 0; i < 2600; i++) { const a = R(), f = a < 0.5 ? `rgba(120,70,36,${0.05 + R() * 0.16})` : a < 0.8 ? `rgba(30,24,20,${0.05 + R() * 0.22})` : `rgba(170,120,80,${0.04 + R() * 0.1})`; g.fillStyle = f; g.fillRect(R() * 1024, R() * 256, 2 + R() * 26, 1 + R() * 9); }
  for (let i = 0; i < 520; i++) { const x = R() * 1024, y = R() * 256, l = 8 + R() * 70; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(190,120,70,0.42)'); gr.addColorStop(1, 'rgba(120,70,40,0)'); g.fillStyle = gr; g.fillRect(x, y, 1 + R() * 3.5, l); }
  g.fillStyle = 'rgba(18,14,12,0.85)'; for (let r = 0; r < 3; r++) for (let x = 6; x < 1024; x += 13) if (R() > 0.2) g.fillRect(x, 60 + r * 28, 4.5, 6);
  g.strokeStyle = 'rgba(20,16,14,0.3)'; for (let x = 0; x < 1024; x += 42) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); } for (let y = 0; y < 256; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return _rost = t;
}
function wrackBauen(L) {
  // Rumpf in zwei Teilen wie nach dem Bruch, darum Trümmerfeld, zerdrückte Aufbauten, Schornsteinstümpfe. Nur die Form, keine Einzelheiten echter Schiffe. Länge wie das echte Schiff
  const B = L * 0.052, H = L * 0.07, mat = new THREE.MeshStandardMaterial({ map: rostTextur(), roughness: 0.96, side: THREE.DoubleSide, color: new THREE.Color(1.5, 1.45, 1.4) }); let h = 12345; const R = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }, G = new THREE.Group();
  const teil = (t0, t1, spitzVorn, spitzHinten) => {
    const P = [], U = [], I = [], S = 26, Q = 14;
    for (let i = 0; i <= S; i++) { const t = t0 + (t1 - t0) * (i / S), z = (t - 0.5) * L, sp = Math.min(1, Math.min(spitzHinten ? t * 6 : 1, spitzVorn ? (1 - t) * 6 : 1)), b = B * (0.22 + 0.78 * Math.pow(sp, 0.55)); const riss = (i === 0 && !spitzHinten) || (i === S && !spitzVorn); for (let k = 0; k <= Q; k++) { const w = k / Q, a = Math.PI * w, x = Math.cos(a) * b, y0 = -Math.sin(a) * H * 0.72 + H * 0.28, n = (R() - 0.5) * L * 0.0035, y = y0 + n + (riss ? (R() - 0.5) * H * 0.26 : 0), z2 = z + (riss ? (R() - 0.5) * H * 0.3 : 0); P.push(x + n * 0.6, y, z2); U.push(t * 6, w * 1.4); } }
    const n = Q + 1; for (let i = 0; i < S; i++) for (let k = 0; k < Q; k++) { const a = i * n + k, b = a + 1, c = a + n, d = c + 1; I.push(a, c, b, b, c, d); }
    const v0 = P.length / 3; for (let i = 0; i <= S; i++) { const t = t0 + (t1 - t0) * (i / S), z = (t - 0.5) * L, sp = Math.min(1, Math.min(spitzHinten ? t * 6 : 1, spitzVorn ? (1 - t) * 6 : 1)), b = B * (0.22 + 0.78 * Math.pow(sp, 0.55)); for (const q of [-1, 1]) { P.push(q * b, H * 0.28 + (R() - 0.5) * 0.5, z); U.push(t * 6, q * 0.5 + 0.5); } }
    for (let i = 0; i < S; i++) { const a = v0 + i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); return new THREE.Mesh(g, mat);
  };
  const vorn = teil(0.4, 1, true, false), hinten = teil(0, 0.34, false, false); vorn.rotation.z = 0.12; hinten.position.set(L * 0.05, -H * 0.1, -L * 0.14); hinten.rotation.set(0.05, 0.42, -0.22); G.add(vorn, hinten);
  const stahl = new THREE.MeshStandardMaterial({ map: rostTextur(), roughness: 1, color: new THREE.Color(1.25, 1.15, 1.05) }), box = (par, w, hh, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, hh, d); const o = new THREE.Mesh(g, stahl); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); par.add(o); return o; };
  // Aufbauten, leicht zerdrückt, Schornsteinstumpf, Masten am Boden
  box(vorn, B * 1.45, H * 0.26, L * 0.2, 0, H * 0.42, L * 0.02, 0.01, 0, 0.02); box(vorn, B * 1.1, H * 0.2, L * 0.1, 0, H * 0.62, L * 0.0, 0, 0.02, -0.03); box(vorn, B * 0.9, H * 0.16, L * 0.05, 0, H * 0.46, L * 0.2, 0, 0, 0.04); { const sch = new THREE.Mesh(new THREE.CylinderGeometry(B * 0.26, B * 0.3, H * 0.34, 14, 1, true), stahl); sch.position.set(0, H * 0.82, L * 0.03); sch.rotation.z = 0.28; vorn.add(sch); } box(hinten, B * 1.3, H * 0.3, L * 0.13, 0, H * 0.38, 0, 0.1, 0.1, 0.12);
  // Trümmerfeld: Platten und Kesselstücke ringsum
  const n = 160, gT = new THREE.BoxGeometry(1, 1, 1), T = new THREE.InstancedMesh(gT, stahl, n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(); for (let i = 0; i < n; i++) { const z = (R() - 0.5) * L * 1.2, x = (R() - 0.5) * (L * 0.34 + Math.abs(z) * 0.2), gr = 0.5 + R() * R() * 6; p.set(x + L * 0.04, -H * 0.42 + R() * 0.3, z - L * 0.1); q.setFromEuler(e.set(R() * 0.8, R() * 6.28, R() * 0.8)); s.set(gr * (0.5 + R()), gr * 0.14 + R() * gr * 0.3, gr * (0.5 + R())); M.compose(p, q, s); T.setMatrixAt(i, M); } T.frustumCulled = false; G.add(T);
  return G;
}

const N_RING = 32, N_SEG = 56, _o = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
export class Unterwasser {
  constructor(szene, { mobil = false } = {}) {
    this.szene = szene; this.mobil = mobil; this.karte = new Tiefenkarte(); this.gruppe = new THREE.Group(); this.gruppe.name = 'unterwasser'; this.gruppe.visible = false; szene.add(this.gruppe); this.t = 0; this.an = false; this.zuletzt = null; this.tief = 0; this.seaY = 0; this.tagK = 1; this.tB = 0;
    const nR = mobil ? 26 : N_RING, nS = mobil ? 34 : N_SEG, nV = nR * nS + 1, I = []; this.nR = nR; this.nS = nS;
    for (let r = 0; r < nR - 1; r++) for (let s = 0; s < nS; s++) { const a = 1 + r * nS + s, b = 1 + r * nS + ((s + 1) % nS), c = a + nS, d = b + nS; I.push(a, c, b, b, c, d); } for (let s = 0; s < nS; s++) I.push(0, 1 + s, 1 + ((s + 1) % nS));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nV * 3), 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aTiefe', new THREE.BufferAttribute(new Float32Array(nV), 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(nV * 2), 2).setUsage(THREE.DynamicDrawUsage)); g.setIndex(I);
    this.bodenU = { uSonne: { value: new THREE.Vector3(0, 1, 0) }, uZeit: { value: 0 }, uN: { value: new THREE.Vector4(0, 0, 0, 0) }, uLi: { value: new THREE.Vector2(1, 0) } }; this.nebelFarbe = new THREE.Color(0x06222e); this.kQ = null; this.kLo = 1; this.kLa = 110946;
    this.boden = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: BODEN_VS, fragmentShader: BODEN_FS, uniforms: this.bodenU, side: THREE.DoubleSide })); this.boden.frustumCulled = false; this.boden.name = 'meeresboden'; this.gruppe.add(this.boden);
    // Schnee im Wasser: treibt langsam, wandert mit der Kamera
    const nP = mobil ? 500 : 1800, PP = new Float32Array(nP * 3); for (let i = 0; i < nP * 3; i++) PP[i] = Math.random(); const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.BufferAttribute(PP, 3)); this.schneeU = { uK: { value: new THREE.Vector3() }, uZeit: { value: 0 }, uPr: { value: Math.min(2, devicePixelRatio || 1) } };
    this.schnee = new THREE.Points(gp, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: this.schneeU, vertexShader: 'uniform vec3 uK; uniform float uZeit, uPr; varying float vA; void main() { const float B = 34.0; vec3 q = position * B + vec3(sin(position.y * 40.0 + uZeit * 0.21) * 0.8, -uZeit * (0.1 + position.x * 0.14), cos(position.x * 37.0 + uZeit * 0.17) * 0.8); vec3 w = uK + mod(q - uK + B * 0.5, B) - B * 0.5; vec4 mv = viewMatrix * vec4(w, 1.0); float d = -mv.z; vA = smoothstep(0.3, 2.0, d) * (1.0 - smoothstep(10.0, 17.0, d)); gl_PointSize = uPr * clamp(9.0 / max(d, 0.5), 0.8, 5.0); gl_Position = projectionMatrix * mv; }', fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.05, dot(q, q)) * vA * 0.5; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.8, 0.92, 0.96), a); }' })); this.schnee.frustumCulled = false; this.gruppe.add(this.schnee);
    // Fischschwärme im Shader: jeder Fisch folgt dem Weg seines Schwarms mit eigenem Versatz
    const NF = mobil ? 500 : 1800, f = new THREE.InstancedBufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.045, 0.02, 0.1, 0, 0.11, 0.05, 0, 0, 0.5, 0, 0.11, 0.05, -0.045, 0.02, 0.1, 0.045, 0.02, 0.1, 0, -0.09, 0.06, 0, 0, 0.5, -0.045, 0.02, 0.1, 0, 0, 0.5, 0, -0.09, 0.06, 0.045, 0.02, 0.1, 0, 0.11, 0.05, 0, 0, -0.34, 0.045, 0.02, 0.1, 0, 0, -0.34, 0, -0.09, 0.06, -0.045, 0.02, 0.1, 0, 0, -0.34, 0, 0.11, 0.05, -0.045, 0.02, 0.1, 0, -0.09, 0.06, 0, 0, -0.34, 0, 0, -0.3, 0, 0.13, -0.56, 0, -0.13, -0.56], 3)); const O = new Float32Array(NF * 4); for (let i = 0; i < NF; i++) { const r = Math.cbrt(Math.random()), u = Math.random() * 2 - 1, w = Math.random() * TAU, s = Math.sqrt(1 - u * u); O[i * 4] = s * Math.cos(w) * r; O[i * 4 + 1] = u * r * 0.42; O[i * 4 + 2] = s * Math.sin(w) * r; O[i * 4 + 3] = (i % 3) + Math.random() * 0.98; } f.setAttribute('aO', new THREE.InstancedBufferAttribute(O, 4)); f.instanceCount = NF; this.fischU = { uZeit: { value: 0 }, uM: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uN: this.bodenU.uN, uLi: this.bodenU.uLi, uBunt: { value: 0 } };
    this.fische = new THREE.Mesh(f, new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: this.fischU, vertexShader: `attribute vec4 aO; uniform float uZeit; uniform vec4 uM[3]; uniform float uBunt; varying vec3 vC; varying float vD; void main() { int s = int(floor(aO.w)); float ph = fract(aO.w) * 40.0; vec4 M = uM[s]; float g = 0.42 + fract(aO.w * 7.0) * 0.5; vec3 rel = aO.xyz * M.w; float tt = uZeit * 0.09 * g + ph; rel += vec3(sin(tt + aO.y * 3.0), sin(tt * 1.3 + aO.x * 4.0) * 0.28, cos(tt * 0.8 + aO.z * 3.0)) * M.w * 0.16; vec3 tan0 = normalize(vec3(cos(uZeit * 0.13 + float(s) * 2.0), sin(uZeit * 0.21 + float(s)) * 0.14, -sin(uZeit * 0.13 + float(s) * 2.0))); vec3 x = normalize(cross(vec3(0.0, 1.0, 0.0), tan0)), y = cross(tan0, x); vec3 p = position * g * 1.1; p.x += sin(uZeit * (9.0 + ph * 0.1) + position.z * 5.0 + ph) * 0.06 * smoothstep(0.2, -0.6, position.z); vec3 w = M.xyz + rel + x * p.x + y * p.y + tan0 * p.z; vC = mix(vec3(0.72, 0.8, 0.86), vec3(0.2, 0.3, 0.38), smoothstep(0.0, 0.1, position.y)) * (0.8 + fract(aO.w * 11.0) * 0.4); if (s == 2) vC *= vec3(1.15, 0.92, 0.5); if (uBunt > 0.01) { float hu = fract(aO.w * 23.0); vec3 bu = hu < 0.3 ? vec3(1.5, 1.05, 0.2) : hu < 0.55 ? vec3(0.25, 0.7, 1.6) : hu < 0.8 ? vec3(1.6, 0.55, 0.2) : vec3(1.3, 1.3, 1.3); vC = mix(vC, vC * bu * 1.3, uBunt); } vec4 mv = viewMatrix * vec4(w, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`, fragmentShader: 'varying vec3 vC; varying float vD; uniform vec4 uN; uniform vec2 uLi; void main() { vec3 c = vC; if (uN.w > 0.0) { c *= uLi.x + uLi.y * exp(-vD * 0.06); c = mix(c, uN.rgb, 1.0 - exp(-vD * uN.w)); } gl_FragColor = vec4(c, 1.0); }' })); this.fische.frustumCulled = false; this.fische.name = 'fischschwaerme'; this.gruppe.add(this.fische); this.schwarm = [0, 1, 2].map(i => ({ w: null, r: 8 + i * 5 }));
    // Große Tiere
    this.tiere = []; this.mesh = {}; this.tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 }); this.tTier = 0;
    // Riff, Felsen, Seegras
    this.riffM = this.riffBauen(); this.tRiff = 0; this.riffStand = new THREE.Vector3(1e9, 0, 0);
    this.wrack = null; this.tWrack = 0;
    // Handy: kein AtmosPass, darum Oberfläche als helle Fläche im Nebel und Materialien nach der Tiefe abgedunkelt
    if (mobil) { this.deckel = new THREE.Mesh(new THREE.CircleGeometry(160, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.92, 1.0), side: THREE.DoubleSide })); this.deckel.frustumCulled = false; this.gruppe.add(this.deckel); this.dimm = [[this.tMat, new THREE.Color(0xffffff)], [this.riffM.kor.material, new THREE.Color(0xffffff)], [this.riffM.fels.material, this.riffM.fels.material.color.clone()], [this.riffM.gras.material, this.riffM.gras.material.color.clone()]]; }
  }
  // Grund an einer Stelle der Erde, mit denselben Buckeln wie das Netz (für Fahrzeug und Kamera). Das Muster hängt nur vom Ort ab: es darf beim Fahren nicht mitwandern
  musterKo(lat) { const q = Math.round(lat * 2) / 2; if (q !== this.kQ) { this.kQ = q; this.kLo = Math.max(1000, 111412.84 * Math.cos(q * D2R)); } return this.kLo; }
  tiefeHier(lat, lon) { let t = this.karte.tiefe(lat, lon); for (const w of WRACKS) { const dLa = (w.lat - lat) * 111000; if (Math.abs(dLa) > 1500) continue; const d = Math.hypot(dLa, (w.lon - lon) * 111000 * Math.cos(lat * D2R)); if (d < 1500) { const k = THREE.MathUtils.smoothstep(1500 - d, 0, 1100); t = t * (1 - k) + Math.min(t, -w.tief) * k; } } return t; }
  bodenWert(t0, xW, zW, spiegel) { const t1 = Math.min(t0, spiegel - 2.5), am = Math.min(6, 0.25 + Math.max(0, -t1) * 0.004); return t1 + (Math.sin(xW * 0.021 + zW * 0.013) + Math.sin(xW * 0.057 - zW * 0.041) * 0.5 + Math.sin(xW * 0.17 + zW * 0.13) * 0.2) * am; }
  bodenBei(lat, lon, spiegel = 0) { const K = this.musterKo(lat); return this.bodenWert(this.tiefeHier(lat, lon), (lon * K) % 20000, (lat * this.kLa) % 20000, spiegel); }
  riffBauen() {
    const n = this.mobil ? 150 : 560, inst = (geo, m) => { const q = new THREE.InstancedMesh(geo, m, n); q.count = 0; q.frustumCulled = false; this.gruppe.add(q); return q; };
    // Knollen aus der Ikosaederkugel: Punkte zusammenlegen, sonst bleiben die Flächen hart (sah aus wie Eisberge). f liefert Faktor und Helligkeit
    const knolle = (det, f, unten = -0.35) => { let g = new THREE.IcosahedronGeometry(1, det); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4); const P = g.attributes.position, C = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), [k, h] = f(x, y, z); P.setXYZ(i, x * k, Math.max(y * k, unten), z * k); C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = h; } g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.computeVertexNormals(); return g; };
    const farbe = (g, h = 1) => { const C = new Float32Array(g.attributes.position.count * 3).fill(h); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); return g; };
    const fels = knolle(4, (x, y, z) => { const a = Math.sin(x * 3.1 + y * 2.3 + 0.7) * Math.cos(z * 2.7), b = Math.sin(x * 7.3 + z * 5.1 + 1) * Math.sin(y * 6.2), c = Math.sin(x * 15 + y * 13) * Math.cos(z * 17), d = a * 0.26 + b * 0.13 + c * 0.05; return [1 + d, 0.68 + d * 1.1]; });
    const hirn = knolle(5, (x, y, z) => { const w = Math.sin(x * 11 + Math.sin(z * 7) * 2.2) * Math.sin(z * 11 + Math.sin(y * 7) * 2.2), d = Math.abs(w); return [1 + d * 0.05 + Math.sin(x * 2.3 + z * 1.9) * 0.1, 0.55 + d * 0.5]; }, -0.15);
    // Geweihkoralle: Äste mit Verzweigung
    const zweige = []; { let h = 77; const R = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }, ast = (p, d, l, r, tiefe) => { const g = new THREE.CylinderGeometry(r * 0.62, r, l, 5, 1); g.deleteAttribute('uv'); g.translate(0, l / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); g.translate(p.x, p.y, p.z); zweige.push(farbe(g, 0.7 + (3 - tiefe) * 0.16)); if (tiefe <= 0) return; const e = p.clone().addScaledVector(d, l); for (let i = 0, m = tiefe > 1 ? 3 : 2; i < m; i++) { const a = R() * 6.28, b = 0.4 + R() * 0.45, q = new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)).add(d.clone().multiplyScalar(0.5)).normalize(); ast(e, q, l * (0.62 + R() * 0.2), r * 0.66, tiefe - 1); } }; for (let i = 0; i < 6; i++) { const a = i * 1.05 + R(), b = 0.15 + R() * 0.55; ast(new THREE.Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), new THREE.Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)).normalize(), 0.42, 0.075, 2); } }
    const geweih = mergeGeometries(zweige); geweih.computeVertexNormals();
    const tisch = mergeGeometries([farbe(new THREE.CylinderGeometry(1, 0.1, 0.13, 18, 2).toNonIndexed()), farbe(new THREE.CylinderGeometry(0.12, 0.2, 0.55, 8).translate(0, -0.3, 0).toNonIndexed(), 0.6)]); tisch.translate(0, 0.6, 0); tisch.computeVertexNormals(); tisch.deleteAttribute('uv');
    const schwamm = farbe(new THREE.CylinderGeometry(0.42, 0.26, 1, 12, 3, true).translate(0, 0.5, 0)); schwamm.deleteAttribute('uv');
    const korM = new THREE.MeshStandardMaterial({ roughness: 0.84, vertexColors: true, side: THREE.DoubleSide }); korM.onBeforeCompile = sh => { sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = position;'); sh.fragmentShader = 'varying vec3 vOP;\nfloat koN(vec3 p) { return abs(sin(p.x * 21.0 + sin(p.z * 15.0) * 2.1) * sin(p.z * 23.0 + sin(p.y * 17.0) * 2.1)); }\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n float koP = koN(vOP), koQ = fract(sin(dot(floor(vOP * 46.0), vec3(12.9, 78.2, 37.7))) * 43758.5); diffuseColor.rgb *= (0.58 + 0.62 * koP) * (0.88 + 0.24 * koQ);'); }; const felsM = new THREE.MeshStandardMaterial({ color: 0x8c877d, roughness: 0.97, vertexColors: true });
    const gras = (() => { const A = [], s = 7; for (let b = 0; b < 3; b++) { const w = b * 2.1, cx = Math.cos(w) * 0.1, cz = Math.sin(w) * 0.1; for (let i = 0; i < s; i++) { const t0 = i / s, t1 = (i + 1) / s, b0 = 0.05 * (1 - t0 * 0.7), b1 = 0.05 * (1 - t1 * 0.7); A.push(cx - b0, t0, cz, cx + b0, t0, cz, cx + b1, t1, cz, cx - b0, t0, cz, cx + b1, t1, cz, cx - b1, t1, cz); } } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A, 3)); g.computeVertexNormals(); return g; })(), grasM = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.7, side: THREE.DoubleSide }); this.grasZeit = { value: 0 }; grasM.onBeforeCompile = sh => { sh.uniforms.uZeit = this.grasZeit; sh.vertexShader = 'uniform float uZeit;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float q = position.y * position.y; vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); transformed.x += sin(uZeit * 0.9 + iw.x * 0.3 + position.y * 3.0) * q * 0.32; transformed.z += cos(uZeit * 0.7 + iw.z * 0.3 + position.y * 2.0) * q * 0.32;'); };
    return { kor: inst(hirn, korM), geweih: inst(geweih, korM), tisch: inst(tisch, korM), schwamm: inst(schwamm, korM), fels: inst(fels, felsM), gras: inst(gras, grasM) };
  }
  riffSetzen(W, lat, lon, K_LA, K_LO) {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color(), R = this.riffM, warm = Math.abs(lat) < 31, ZS = 5, RAD = this.mobil ? 60 : 110, zLa = ZS / K_LA, zLo = ZS / K_LO, i0 = Math.floor(lat / zLa), j0 = Math.floor(lon / zLo), r = Math.ceil(RAD / ZS), cap = R.kor.instanceMatrix.count, N = { kor: 0, geweih: 0, tisch: 0, schwamm: 0, fels: 0, gras: 0 };
    const FA = [[0.66, 0.15, 0.34], [0.86, 0.42, 0.12], [0.62, 0.66, 0.2], [0.12, 0.5, 0.48], [0.42, 0.2, 0.56], [0.72, 0.5, 0.2], [0.72, 0.14, 0.12], [0.8, 0.68, 0.5]];
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (a * a + b * b > r * r) continue; const ii = i0 + a, jj = j0 + b; let h = (Math.imul(ii, 73856093) ^ Math.imul(jj, 19349663)) >>> 0; h = h || 1; const Z = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }, la = (ii + Z()) * zLa, lo = (jj + Z()) * zLo, t = this.tiefeHier(la, lo), w = Z(); if (t > -0.6) continue; const tief = -t;
      // Bänke: dort, wo das großräumige Muster es will, wachsen Korallen dicht, dazwischen Sand mit Seegras. Sonst sähe alles gleich aus
      const bank = Math.sin(ii * 0.17 + Math.sin(jj * 0.11) * 2) * Math.sin(jj * 0.19 + Math.sin(ii * 0.13) * 2);
      let art = '';
      if (tief < 42) { if (warm) { if (bank > -0.1) art = w < 0.2 ? 'kor' : w < 0.42 ? 'geweih' : w < 0.54 ? 'tisch' : w < 0.62 ? 'schwamm' : w < 0.72 ? 'fels' : w < 0.8 ? 'gras' : ''; else art = w < 0.34 ? 'gras' : w < 0.4 ? 'fels' : ''; } else art = w < 0.5 ? 'gras' : w < 0.62 ? 'fels' : ''; }
      else if (tief < 200) art = w < 0.1 ? 'fels' : w < 0.13 ? 'schwamm' : ''; else art = w < 0.035 ? 'fels' : '';
      if (!art || N[art] >= cap) continue; geoZuSzene(la, lo, t, p); W.weltZuLokal(p, p); q.setFromAxisAngle(Y, Z() * TAU); let g;
      if (art === 'fels') { g = 0.4 + Z() * Z() * (tief > 200 ? 9 : 3.6); s.set(g * (0.7 + Z() * 0.7), g * (0.45 + Z() * 0.5), g * (0.7 + Z() * 0.7)); }
      else if (art === 'gras') { g = warm ? 0.7 + Z() * 0.8 : 2.4 + Z() * 7; s.set(g * 0.7 + 0.4, g, g * 0.7 + 0.4); }
      else if (art === 'kor') { g = 0.22 + Z() * Z() * 1.1; s.set(g * (0.8 + Z() * 0.5), g * (0.55 + Z() * 0.4), g * (0.8 + Z() * 0.5)); }
      else if (art === 'geweih') { g = 0.55 + Z() * 1.05; s.set(g, g * (0.8 + Z() * 0.5), g); }
      else if (art === 'tisch') { g = 0.35 + Z() * 0.95; s.set(g, 0.5 + Z() * 0.4, g); }
      else { g = 0.28 + Z() * 0.5; s.set(g, g * (1 + Z() * 1.1), g); }
      M.compose(p, q, s); const m = R[art], k = N[art]++; m.setMatrixAt(k, M);
      if (art !== 'fels' && art !== 'gras') { const f = FA[Math.floor(Z() * FA.length)], hell = tief > 42 ? 0.55 : 1; m.setColorAt(k, c.setRGB(f[0] * hell, f[1] * hell, f[2] * hell)); }
    }
    for (const n in N) { const m = R[n]; m.count = N[n]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  bodenAufbau(W, cam, lat, lon, K_LA, K_LO, spiegel = 0) {
    const nR = this.nR, nS = this.nS, g = this.boden.geometry, P = g.attributes.position, T = g.attributes.aTiefe, A = g.attributes.aP, q = _o; this.boden.position.set(cam.x, 0, cam.z); this.boden.updateMatrixWorld();
    const KM = this.musterKo(lat), setze = (o, la, lo) => { const xW = (lo * KM) % 20000, zW = (la * this.kLa) % 20000, t = this.bodenWert(this.tiefeHier(la, lo), xW, zW, spiegel); geoZuSzene(la, lo, t, q); W.weltZuLokal(q, q); P.setXYZ(o, q.x - cam.x, q.y, q.z - cam.z); T.setX(o, -t); A.setXY(o, xW, zW); };
    setze(0, lat, lon);
    for (let r = 0; r < nR; r++) { const R = 3 * (Math.exp(r * 0.158) - 1) + 3; for (let s = 0; s < nS; s++) { const w = (s + (r % 2) * 0.5) / nS * TAU; setze(1 + r * nS + s, lat - Math.sin(w) * R / K_LA, lon + Math.cos(w) * R / K_LO); } }
    P.needsUpdate = T.needsUpdate = A.needsUpdate = true;
  }
  // Je Bild, solange ein Wasserfahrzeug oder Schwimmer unterwegs ist. spiegel: Wasserfläche an der Kamera (Meter über dem Meer), wellen: Wellenhöhe dort. Liefert true, wenn die Kamera unter Wasser ist
  update(dt, { camera, W, lat, lon, h, spiegel = 0, wellen = 0, sonne, lampe = 0, lampeP = null, lampeD = null, pass = null }) {
    geoZuSzene(lat, lon, spiegel, _o); W.weltZuLokal(_o, _o); this.seaY = _o.y + wellen; const tief = spiegel + wellen - h; this.tief = tief; const an = tief > 0.05; this.t += dt;
    if (an !== this.an) { this.an = an; this.gruppe.visible = an; if (!an) pass?.unterwasser(null); else { this.zuletzt = null; this.riffStand.set(1e9, 0, 0); } }
    this.karte.tiefe(lat, lon); if (!an) return false;
    const c = camera.position, phi = lat * D2R, K_LA = 111132.954 - 559.822 * Math.cos(2 * phi), K_LO = Math.max(1000, 111412.84 * Math.cos(phi)); this.tagK = THREE.MathUtils.smoothstep(sonne.y, -0.08, 0.2) * 0.97 + 0.03;
    const ueberGrund = h - this.bodenBei(lat, lon, spiegel);
    if (!this.zuletzt || this.zuletzt.distanceTo(c) > kl(ueberGrund * 0.1, 5, 60) || (this.tB -= dt) < 0) { this.tB = 1.4; (this.zuletzt ||= new THREE.Vector3()).copy(c); this.bodenAufbau(W, c, lat, lon, K_LA, K_LO, spiegel); }
    if (this.riffStand.distanceTo(c) > 18 || (this.tRiff -= dt) < 0) { this.tRiff = 3; this.riffStand.copy(c); this.riffSetzen(W, lat, lon, K_LA, K_LO); }
    this.bodenU.uSonne.value.copy(sonne); this.bodenU.uZeit.value = this.t; this.grasZeit.value = this.t; this.schneeU.uK.value.copy(c); this.schneeU.uZeit.value = this.t;
    // Schwärme: nur im Licht, um die Kamera herum, langsam wandernd
    this.fische.visible = tief < 500; if (this.fische.visible) { this.fischU.uZeit.value = this.t; this.fischU.uBunt.value = Math.abs(lat) < 31 && tief < 45 ? 1 : 0; this.schwarm.forEach((S, i) => { const M = this.fischU.uM.value[i]; if (!S.w || S.w.distanceTo(c) > 100) { const a = Math.random() * TAU, r = 22 + Math.random() * 30; S.w = new THREE.Vector3(c.x + Math.cos(a) * r, Math.min(c.y + (Math.random() - 0.5) * 18, this.seaY - 4), c.z + Math.sin(a) * r); } S.w.x += Math.cos(this.t * 0.13 + i * 2) * dt; S.w.z -= Math.sin(this.t * 0.13 + i * 2) * dt; S.w.y = Math.min(S.w.y, this.seaY - 2); M.set(S.w.x, S.w.y, S.w.z, S.r); }); }
    this.grosseTiere(dt, lat, tief, c); this.wrackPruefen(dt, W, lat, lon);
    pass?.unterwasser({ seaY: this.seaY, tag: this.tagK, zeit: this.t, tief, lampe, lampeP, lampeD });
    if (this.mobil) { const so = kl(sonne.y, 0, 1), f = (0.45 + 1.7 * so) * this.tagK, li = Math.max(0.015, Math.exp(-tief * 0.03) * this.tagK); this.nebelFarbe.setRGB(0.012 * Math.exp(-0.26 * tief) * f + 0.002, 0.085 * Math.exp(-0.05 * tief) * f + 0.002, 0.125 * Math.exp(-0.024 * tief) * f + 0.003); this.bodenU.uN.value.set(this.nebelFarbe.r, this.nebelFarbe.g, this.nebelFarbe.b, 0.05); this.bodenU.uLi.value.set(li, lampe * 0.9); for (const [m, b] of this.dimm) m.color.copy(b).multiplyScalar(Math.min(1, li + lampe * 0.5)); this.deckel.position.set(c.x, this.seaY, c.z); this.deckel.visible = tief < 90; this.deckel.material.color.setRGB(0.62 * this.tagK, 0.92 * this.tagK, this.tagK); }
    return true;
  }
  aus(pass) { this.an = false; this.gruppe.visible = false; pass?.unterwasser(null); }
  grosseTiere(dt, lat, tief, c) {
    this.tTier -= dt; const a = Math.abs(lat), max = this.mobil ? 4 : 11;
    const arten = tief < 180 ? (a < 32 ? ['hai', 'hai', 'mantarochen', 'meeresschildkroete', 'meeresschildkroete', 'delfin', 'thunfisch', 'krake', 'qualle', 'seekuh'] : a < 55 ? ['delfin', 'hai', 'robbe', 'thunfisch', 'wal', 'krake', 'qualle', 'qualle'] : ['robbe', 'walross', 'orca', 'wal', 'qualle']) : tief < 1400 ? ['pottwal', 'wal', 'hai'] : ['pottwal'];
    if (this.tTier <= 0 && this.tiere.length < max && tief < 2200) { this.tTier = 2.4; let art = arten[Math.floor(Math.random() * arten.length)]; const wu = TIERWUNSCH.art; if (SEE_WUNSCH.has(wu) && this.tiere.filter(t => t.art === wu).length < 3) art = wu; if (this.mesh[art] === undefined) { this.mesh[art] = null; tierLaden(art).then(g => { const q = new THREE.InstancedMesh(g, this.tMat, 8); q.count = 0; q.frustumCulled = false; q.name = 'meer ' + art; this.gruppe.add(q); this.mesh[art] = q; }).catch(() => { this.mesh[art] = false; }); } else if (this.mesh[art]) { const nah = art === 'krake' || art === 'qualle' || art === wu, w = Math.random() * TAU, r = nah ? 14 + Math.random() * 22 : 60 + Math.random() * 70, y = Math.min(c.y + (Math.random() - 0.5) * (nah ? 8 : 30), this.seaY - 3); this.tiere.push({ art, x: c.x + Math.cos(w) * r, y, z: c.z + Math.sin(w) * r, k: w + Math.PI + (Math.random() - 0.5) * 1.4, v: art === 'wal' || art === 'pottwal' ? 2.2 : art === 'meeresschildkroete' ? 0.8 : art === 'mantarochen' ? 1.4 : art === 'krake' ? 0.25 : art === 'qualle' ? 0.12 : art === 'seekuh' ? 0.5 : 2.0 + Math.random() * 2, ph: Math.random() * 9 }); } }
    for (const n in this.mesh) if (this.mesh[n]) this.mesh[n].count = 0;
    for (let i = this.tiere.length - 1; i >= 0; i--) { const t = this.tiere[i]; t.ph += dt; t.k += Math.sin(t.ph * 0.31) * 0.05 * dt; t.x += Math.sin(t.k) * t.v * dt; t.z += Math.cos(t.k) * t.v * dt; t.y += Math.sin(t.ph * 0.5) * 0.2 * dt; if (Math.hypot(t.x - c.x, t.z - c.z) > 220) { this.tiere.splice(i, 1); continue; } const m = this.mesh[t.art]; if (!m || m.count >= 8) continue; _q.setFromEuler(_e.set(0, t.k, Math.sin(t.ph * 1.3) * 0.06, 'YXZ')); _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(1, 1, 1)); m.setMatrixAt(m.count++, _m); }
    for (const n in this.mesh) if (this.mesh[n]) this.mesh[n].instanceMatrix.needsUpdate = true;
  }
  wrackPruefen(dt, W, lat, lon) {
    if (this.wrack) { const d = this.wrack; W.geoZuLokal(d.lat, d.lon, d.y, _p); d.g.position.copy(_p); d.g.quaternion.copy(W.zuLokal).multiply(d.q); if (Math.hypot((d.lat - lat) * 111000, (d.lon - lon) * 111000 * Math.cos(lat * D2R)) > 6000) { this.gruppe.remove(d.g); d.g.traverse(o => { o.geometry?.dispose(); }); this.wrack = null; } return; }
    if ((this.tWrack -= dt) > 0) return; this.tWrack = 2;
    for (const w of WRACKS) { if (Math.hypot((w.lat - lat) * 111000, (w.lon - lon) * 111000 * Math.cos(lat * D2R)) > 5000) continue; const y = this.bodenBei(w.lat, w.lon), g = wrackBauen(w.L); this.gruppe.add(g); const e = enu(w.lat, w.lon), k = (w.kurs ?? 40) * D2R, vor = new THREE.Vector3().addScaledVector(e.nord, Math.cos(k)).addScaledVector(e.ost, Math.sin(k)), li = new THREE.Vector3().crossVectors(e.oben, vor).normalize(), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(li, e.oben, vor)); this.wrack = { g, lat: w.lat, lon: w.lon, y: y + w.L * 0.035, q, name: w.name, L: w.L }; break; }
  }
}
