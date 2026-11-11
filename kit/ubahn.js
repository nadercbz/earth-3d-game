// U-Bahn der ganzen Welt (06.11.2026, Wunsch Nr. 63: "komplette U-Bahn- und Subway-Netze ... eins zu eins ... einsteigen ... Türen ... reingelaufen ... losfährt. Innen muss alles ausgebaut sein").
// 16.618 Stationen in 259 Netzen aus Wikidata (CC0, daten/heute/metro.json, tools/metro/bauen.py): Lage, Name, Linien, Linienfarbe, Nachbarn sind echt. Grundriss und Tunnelverlauf sind frei erfunden (frei verfügbare Daten kennen sie nicht), Fahrzeit nach echter Entfernung, längstens 50 s.
// Eigene Szene und Kamera (das Haupt Bild zeichnet nur diese Szene, die Erde lädt oben weiter mit): Bahnhof, Zug, Tunnel. Fährt man mit, stehen Zug und Figur still und die Welt zieht vorbei: kein Zittern, keine großen Zahlen.
import { T } from './sprache.js';
import * as THREE from 'three';
import { Figur } from './player.js';
import { spawn, aktionBereit } from './people.js';

const kl = THREE.MathUtils.clamp, D2R = Math.PI / 180;
// Maße in Metern. Bahnsteig in der Mitte, Gleise außen. Fußboden des Zugs in Höhe des Bahnsteigs
const PB = 4, TX = 5.5, WX = 7.45, DECKE = 4.4, BETT = -1.2, HL = 62, TZ0 = 14, TZ1 = 21.2, TB = 1.7, OY = 4.56, MZ0 = 21.2, MZ1 = 38, MX = 7, OH = 3.1;
const WAGEN = 18, NW = 4, ZL = WAGEN * NW, ZB = 1.38, ZI = 1.22, TUEREN = [-6, 0, 6], TUER_B = 0.72, RAD = 0.26, ZUG_H = 2.62, VMAX = 22, ABR = 1.15, ANF = 1.05;
const tuerZ = []; for (let w = 0; w < NW; w++) for (const d of TUEREN) tuerZ.push((w - (NW - 1) / 2) * WAGEN + d);

// ---------- Daten ----------
export class MetroDaten {
  constructor(url) { this.url = url; this.d = null; this.gitter = new Map(); this.p = null; }
  laden() { return this.p ||= fetch(this.url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => { this.d = d; d.stationen.forEach((s, i) => { const k = Math.round(s[0] * 50) * 100000 + Math.round(s[1] * 50), L = this.gitter.get(k); if (L) L.push(i); else this.gitter.set(k, [i]); }); return d; }); }
  // Stationen im Umkreis von r Metern, die nächste zuerst
  nahe(lat, lon, r) {
    if (!this.d) return []; const cl = Math.max(0.05, Math.cos(lat * D2R)), nLa = Math.ceil(r / 111195 * 50), nLo = Math.ceil(r / (111195 * cl) * 50), la0 = Math.round(lat * 50), lo0 = Math.round(lon * 50), A = [];
    for (let a = -nLa; a <= nLa; a++) for (let b = -nLo; b <= nLo; b++) { const L = this.gitter.get((la0 + a) * 100000 + lo0 + b); if (!L) continue; for (const i of L) { const s = this.d.stationen[i], d = Math.hypot((s[0] - lat) * 111195, (s[1] - lon) * 111195 * cl); if (d <= r) A.push({ i, d }); } }
    return A.sort((x, y) => x.d - y.d);
  }
  s(i) { return this.d.stationen[i]; }
  weg(a, b) { const A = this.s(a), B = this.s(b); return Math.hypot((A[0] - B[0]) * 111195, (A[1] - B[1]) * 111195 * Math.cos(A[0] * D2R)); }
  linie(l) { return this.d.linien[l]; }
  gemeinsam(a, b) { const LB = this.s(b)[4]; for (const l of this.s(a)[4]) if (LB.includes(l)) return l; return -1; }
  // Farbe einer Linie, sonst eine feste aus dem Namen des Netzes
  farbe(l, netz = -1) { const f = l >= 0 ? this.linie(l)[1] : ''; if (f && /^[0-9a-f]{6}$/i.test(f)) return '#' + f; const P = ['#1f5fbf', '#c8312b', '#1b8a5a', '#e08a12', '#6a3fb0', '#0f8fa8', '#b0307a']; return P[Math.abs(l >= 0 ? l : netz + 7) % P.length]; }
  // Kurzname der Linie für Schilder: "U2", "Line 4"
  kurz(l) { if (l < 0) return ''; const n = this.linie(l)[0]; const m = n.match(/\b(U\d+[A-Z]?|S\d+|M\d+|[A-Z]{1,2}\d{0,2}|Line \w+|Linie \w+)\b/); return (m ? m[1] : n).slice(0, 22); }
  // Bis zum Ende der Linie laufen (für "Richtung ..."): Reihe der Stationen ab von über nach
  reihe(von, nach, l, max = 60) {
    const R = [nach]; let vor = von, jetzt = nach; for (let n = 0; n < max; n++) { const N = this.s(jetzt)[5].filter(x => x !== vor && !R.includes(x) && x !== von); if (!N.length) break; const m = (l >= 0 ? N.filter(x => this.s(x)[4].includes(l)) : N); if (!m.length || (m.length !== 1 && l < 0)) break; const pv = this.s(vor), pj = this.s(jetzt), dx = pj[1] - pv[1], dy = pj[0] - pv[0]; let w = m[0], bs = -2; for (const x of m) { const q = this.s(x), ex = q[1] - pj[1], ey = q[0] - pj[0], c = (dx * ex + dy * ey) / ((Math.hypot(dx, dy) * Math.hypot(ex, ey)) || 1); if (c > bs) { bs = c; w = x; } } R.push(w); vor = jetzt; jetzt = w; }
    return R;
  }
  // Die Linie l rund um Station i: Stationen davor, i, Stationen danach. n je Richtung
  linienStueck(i, l, n) { const N = this.s(i)[5].filter(x => l < 0 || this.s(x)[4].includes(l)), a = N[0] !== undefined ? this.reihe(i, N[0], l, n) : [], w = N.slice(1).find(x => !a.includes(x)), b = w !== undefined ? this.reihe(i, w, l, n) : []; return [...b.slice().reverse(), i, ...a]; }
  // Mögliche Ziele der Züge an einer Station: mit gemeinsamer Linie zuerst
  ziele(i) { const N = this.s(i)[5].slice(); return N.sort((a, b) => (this.gemeinsam(i, b) >= 0) - (this.gemeinsam(i, a) >= 0)); }
}

// ---------- Texturen (einmal gezeichnet) ----------
function leinwand(w, h, f, wieder = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (wieder) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
let _h = 4711; const zf = () => { _h ^= _h << 13; _h >>>= 0; _h ^= _h >> 17; _h ^= _h << 5; _h >>>= 0; return _h / 4294967296; };
export const TEX = {
  get kachel() { return this._k ||= leinwand(512, 512, (g, w, h) => { g.fillStyle = '#cfcbc2'; g.fillRect(0, 0, w, h); const a = 64, b = 32; for (let y = 0; y < h; y += b) for (let x = (y / b % 2) * a / 2 - a; x < w; x += a) { const k = 228 + zf() * 22; g.fillStyle = `rgb(${k},${k},${k - 3})`; g.fillRect(x + 1.5, y + 1.5, a - 3, b - 3); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 3, y + 3, a - 7, 3); } }); },
  get boden() { return this._b ||= leinwand(1024, 1024, (g, w, h) => { g.fillStyle = '#a9a69e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 26000; i++) { const k = zf(); g.fillStyle = k < 0.45 ? `rgba(70,68,64,${0.2 + zf() * 0.5})` : k < 0.9 ? `rgba(225,222,214,${0.2 + zf() * 0.5})` : `rgba(150,110,80,${0.3})`; const s = 1 + zf() * 3.4; g.fillRect(zf() * w, zf() * h, s, s); } g.strokeStyle = 'rgba(50,48,44,0.5)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } }); },
  get decke() { return this._d ||= leinwand(256, 256, (g, w, h) => { g.fillStyle = '#9b9d9f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(40,40,44,${zf() * 0.35})`; g.fillRect(zf() * w, zf() * h, 2, 2); } g.fillStyle = '#3a3b3e'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h); }); },
  get beton() { return this._e ||= leinwand(512, 512, (g, w, h) => { g.fillStyle = '#6f6c66'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { const k = 60 + zf() * 110; g.fillStyle = `rgba(${k},${k},${k - 6},${0.05 + zf() * 0.22})`; g.fillRect(zf() * w, zf() * h, 1 + zf() * 14, 1 + zf() * 5); } for (let i = 0; i < 60; i++) { const x = zf() * w, y = zf() * h, l = 20 + zf() * 120; const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(20,18,16,0.3)'); gr.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + zf() * 6, l); } g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 254, w, 3); }); },
  get schotter() { return this._s ||= leinwand(512, 512, (g, w, h) => { g.fillStyle = '#35332f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5200; i++) { const k = 30 + zf() * 90; g.fillStyle = `rgb(${k},${k - 2},${k - 6})`; const s = 3 + zf() * 8; g.fillRect(zf() * w, zf() * h, s, s * (0.6 + zf() * 0.5)); } }); },
  get sitz() { return this._p ||= leinwand(256, 256, (g, w, h) => { g.fillStyle = '#233a64'; g.fillRect(0, 0, w, h); const F = ['#8c7a3e', '#7c4a4a', '#3f6f80', '#16284d', '#2e4a7c']; for (let i = 0; i < 1400; i++) { g.fillStyle = F[Math.floor(zf() * 5)]; g.fillRect(zf() * w, zf() * h, 2 + zf() * 3, 2); } }); },
  get weiss() { return this._w ||= new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); },
};
export function weissBereit() { const t = TEX.weiss; t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; return t; }

// ---------- Material: Licht aus langen Leuchtbändern, im Shader gerechnet. Kein einziges echtes Licht, darum auch am Handy schnell ----------
const VS = `varying vec2 vUv; varying vec3 vP, vN; void main() { vUv = uv; vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `varying vec2 vUv; varying vec3 vP, vN; uniform sampler2D map; uniform vec3 uFarbe, uKam, uBand; uniform float uGlanz, uH, uI, uAmb, uRaster;
  void main() {
    vec3 N = normalize(vN), alb = texture2D(map, vUv).rgb * uFarbe, e = vec3(0.0); if (!gl_FrontFacing) N = -N;
    for (int i = 0; i < 3; i++) { float xs = uBand[i]; if (xs > 900.0) continue; vec3 L = vec3(xs - vP.x, uH - vP.y, 0.0); float d2 = dot(L, L) + 0.5; L /= sqrt(d2); e += (max(dot(N, L), 0.0) * 0.85 + 0.15) / d2; }
    float bo = smoothstep(-0.1, 0.5, abs(vP.y - floor(vP.y / 100.0))) ; vec3 c = alb * (uAmb + e * uI);
    if (uGlanz > 0.001) {   // glatter Boden und Kacheln spiegeln die Leuchtbänder
      vec3 V = normalize(uKam - vP), R = reflect(-V, N); float nv = clamp(dot(N, V), 0.0, 1.0), F = 0.04 + 0.96 * pow(1.0 - nv, 5.0), sp = 0.0;
      if (R.y > 0.04) { float t = (uH - vP.y) / R.y; vec2 h = vP.xz + R.xz * t; for (int i = 0; i < 3; i++) { float xs = uBand[i]; if (xs > 900.0) continue; float q = abs(h.x - xs), seg = smoothstep(0.5, 0.42, abs(fract(h.y / uRaster) - 0.5)); sp += smoothstep(0.34 + t * 0.02, 0.05, q) * seg; } }
      c = mix(c, vec3(0.58, 0.6, 0.62) * (0.22 + 1.5 * sp), F * uGlanz);
    }
    gl_FragColor = vec4(c, 1.0);
  }`;
export function raumMat(map, { farbe = [1, 1, 1], glanz = 0, geteilt }) { return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, uniforms: { map: { value: map }, uFarbe: { value: new THREE.Color(...farbe) }, uGlanz: { value: glanz }, uKam: geteilt.uKam, uBand: geteilt.uBand, uH: geteilt.uH, uI: geteilt.uI, uAmb: geteilt.uAmb, uRaster: geteilt.uRaster } }); }
export const leucht = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

// ---------- Baukasten: alle Teile je Material in einem Netz, Koordinaten direkt im Rahmen des Bahnhofs oder Zugs ----------
export class Bau {
  constructor(skala = {}) { this.t = {}; this.skala = skala; }
  _a(k) { return this.t[k] ||= { p: [], n: [], u: [], i: [] }; }
  quad(k, a, b, c, d, n, uv) { const T = this._a(k), s = T.p.length / 3; for (const q of [a, b, c, d]) T.p.push(q[0], q[1], q[2]); for (let i = 0; i < 4; i++) T.n.push(n[0], n[1], n[2]); for (const q of uv) T.u.push(q[0], q[1]); T.i.push(s, s + 1, s + 2, s, s + 2, s + 3); }
  // Quader von x0 bis x1 usw. Texturmaßstab je Material in Metern
  box(k, x0, x1, y0, y1, z0, z1) {
    const s = this.skala[k] || 1;
    this.quad(k, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 / s, y0 / s], [x1 / s, y0 / s], [x1 / s, y1 / s], [x0 / s, y1 / s]]);
    this.quad(k, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[x1 / s, y0 / s], [x0 / s, y0 / s], [x0 / s, y1 / s], [x1 / s, y1 / s]]);
    this.quad(k, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[z1 / s, y0 / s], [z0 / s, y0 / s], [z0 / s, y1 / s], [z1 / s, y1 / s]]);
    this.quad(k, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 / s, y0 / s], [z1 / s, y0 / s], [z1 / s, y1 / s], [z0 / s, y1 / s]]);
    this.quad(k, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s], [x0 / s, z0 / s]]);
    this.quad(k, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 / s, z0 / s], [x1 / s, z0 / s], [x1 / s, z1 / s], [x0 / s, z1 / s]]);
  }
  // Fläche längs z aus einem Linienzug in x und y (gewölbte Decke, Schürze)
  prisma(k, prof, z0, z1) { const s = this.skala[k] || 1; let l = 0; for (let i = 0; i < prof.length - 1; i++) { const a = prof[i], b = prof[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, n = [dy / m, -dx / m, 0]; this.quad(k, [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], n, [[l / s, z0 / s], [(l + m) / s, z0 / s], [(l + m) / s, z1 / s], [l / s, z1 / s]]); l += m; } }
  // Zylinder (Haltestangen) entlang y oder z
  zyl(k, x, y0, y1, z, r, n = 8) { for (let i = 0; i < n; i++) { const a = i / n * 6.2832, b = (i + 1) / n * 6.2832, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b); this.quad(k, [x + ca * r, y0, z + sa * r], [x + cb * r, y0, z + sb * r], [x + cb * r, y1, z + sb * r], [x + ca * r, y1, z + sa * r], [(ca + cb) / 2, 0, (sa + sb) / 2], [[0, 0], [1, 0], [1, 1], [0, 1]]); } }
  zylZ(k, x, y, z0, z1, r, n = 8) { for (let i = 0; i < n; i++) { const a = i / n * 6.2832, b = (i + 1) / n * 6.2832, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b); this.quad(k, [x + ca * r, y + sa * r, z0], [x + cb * r, y + sb * r, z0], [x + cb * r, y + sb * r, z1], [x + ca * r, y + sa * r, z1], [(ca + cb) / 2, (sa + sb) / 2, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); } }
  fertig(mats, gruppe) { for (const k in this.t) { const T = this.t[k], g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(T.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(T.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(T.u, 2)); g.setIndex(T.i); if (!mats[k]) throw new Error('Material fehlt ' + k); const m = new THREE.Mesh(g, mats[k]); m.frustumCulled = false; m.name = k; gruppe.add(m); } return gruppe; }
}
function schildFlaeche(tex, w, h, x, y, z, ry = 0, mat = null) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat || new THREE.MeshBasicMaterial({ map: tex })); m.position.set(x, y, z); m.rotation.y = ry; return m; }
// Zwei Flächen Rücken an Rücken: von hinten nicht spiegelverkehrt
function doppel(par, mat, w, h, x, y, z, ry = 0) { const m0 = mat.clone(); m0.side = THREE.FrontSide; for (const d of [0, Math.PI]) { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m0); o.position.set(x, y, z); o.rotation.y = ry + d; par.add(o); } }
function anpassen(g, t, maxB, gr, schrift = '600') { let s = gr; g.font = `${schrift} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`; while (g.measureText(t).width > maxB && s > 12) { s -= 2; g.font = `${schrift} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`; } }

// ---------- Bahnhof ----------
// Wandfarbe je Station verschieden, aber immer aus der Linie. Gibt die Gruppe plus alles, was man später wegräumen muss
function bahnhofBauen(D, i, farbeLinie, { mobil }) {
  const S = D.s(i), name = S[2], G = new THREE.Group(); G.name = 'bahnhof ' + name; let h = (i * 2654435761) >>> 0; const R = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const fL = new THREE.Color(farbeLinie), pal = [[0.97, 0.96, 0.92], [0.86, 0.91, 0.95], [0.95, 0.9, 0.78], [0.82, 0.92, 0.84], [0.72, 0.74, 0.76], [0.94, 0.84, 0.8]], w = pal[Math.floor(R() * pal.length)];
  const geteilt = { uKam: { value: new THREE.Vector3() }, uBand: { value: new THREE.Vector3(-WX + 1.4, 0, WX - 1.4) }, uH: { value: DECKE - 0.05 }, uI: { value: 1.05 }, uAmb: { value: 0.27 }, uRaster: { value: 5 } };
  const m = (t, o = {}) => raumMat(t, { ...o, geteilt }), weiss = weissBereit();
  const mats = { wand: m(TEX.kachel, { farbe: w, glanz: 0.42 }), band: m(TEX.kachel, { farbe: [fL.r * 1.05, fL.g * 1.05, fL.b * 1.05], glanz: 0.42 }), boden: m(TEX.boden, { glanz: 0.62 }), decke: m(TEX.decke, { farbe: [0.95, 0.95, 0.95] }), beton: m(TEX.beton, { farbe: [0.8, 0.8, 0.78] }), schotter: m(TEX.schotter), gelb: m(weiss, { farbe: [0.86, 0.66, 0.1], glanz: 0.1 }), stahl: m(weiss, { farbe: [0.34, 0.35, 0.37], glanz: 0.5 }), dunkel: m(weiss, { farbe: [0.06, 0.06, 0.07], glanz: 0.2 }), holz: m(weiss, { farbe: [0.42, 0.28, 0.17], glanz: 0.12 }), kasten: m(weiss, { farbe: [0.82, 0.83, 0.84], glanz: 0.3 }), weiss: m(weiss, { farbe: [0.9, 0.9, 0.88], glanz: 0.2 }), licht: leucht(3.4, 3.3, 3.05), bild: leucht(0.7, 1.0, 1.3), tag: leucht(2.2, 2.2, 2.1) };
  const B = new Bau({ wand: 1.2, band: 1.2, boden: 4, decke: 1.2, beton: 3, schotter: 2.2 }), ohneSaeulen = R() < 0.3, saeuleB = 0.32 + R() * 0.22;
  // Boden des Bahnsteigs mit Kante, weißer Linie, Leitstreifen
  B.box('boden', -PB, PB, -0.3, 0, -HL, HL); for (const q of [-1, 1]) { const a = q < 0 ? -PB : PB - 0.08, b = q < 0 ? -PB + 0.08 : PB; B.box('weiss', a, b, 0, 0.004, -HL, HL); B.box('gelb', q < 0 ? -PB + 0.58 : PB - 0.88, q < 0 ? -PB + 0.88 : PB - 0.58, 0, 0.012, -HL, HL); B.box('dunkel', q < 0 ? -PB - 0.02 : PB - 0.02, q < 0 ? -PB + 0.02 : PB + 0.02, -1.2, 0, -HL, HL); }
  // Gleisbett, Schwellen, Schienen, Stromschiene. Wand vom Bett bis zur Decke mit Band, Sockel, Kacheln
  for (const q of [-1, 1]) { const x = q * TX; B.box('schotter', q < 0 ? -WX : PB, q < 0 ? -PB : WX, BETT - 0.2, BETT, -HL - 14, HL + 14); for (let z = -HL - 14; z < HL + 14; z += 0.75) B.box('holz', x - 1.15, x + 1.15, BETT, BETT + 0.1, z, z + 0.26); for (const e of [-0.72, 0.72]) { B.box('stahl', x + e - 0.04, x + e + 0.04, BETT + 0.1, BETT + 0.26, -HL - 14, HL + 14); } B.box('kasten', x + q * 1.1, x + q * 1.2, BETT + 0.2, BETT + 0.3, -HL - 14, HL + 14);
    const wx0 = q < 0 ? -WX - 0.4 : WX, wx1 = q < 0 ? -WX : WX + 0.4; B.box('wand', wx0, wx1, BETT, DECKE, -HL, HL); const ix = q < 0 ? -WX : WX - 0.02, ax = q < 0 ? -WX + 0.02 : WX; B.box('dunkel', ix, ax, BETT, 0.5, -HL, HL); B.box('band', ix, ax, 2.75, 3.2, -HL, HL); }
  // Stirnwände mit Tunnelöffnung
  for (const s of [-1, 1]) { const z0 = s < 0 ? -HL - 0.4 : HL, z1 = s < 0 ? -HL : HL + 0.4; B.box('wand', -PB, PB, BETT, DECKE, z0, z1); for (const q of [-1, 1]) { const a = q < 0 ? -WX : PB, b = q < 0 ? -PB : WX; B.box('wand', a, b, 3.5, DECKE, z0, z1); } }
  // Decke mit Öffnung für die Treppe, Leuchtbänder
  B.box('decke', -WX, WX, DECKE, DECKE + 0.16, -HL, TZ0); B.box('decke', -WX, WX, DECKE, DECKE + 0.16, MZ0 + 0.3, HL); B.box('decke', -WX, -TB - 0.2, DECKE, DECKE + 0.16, TZ0, MZ0 + 0.3); B.box('decke', TB + 0.2, WX, DECKE, DECKE + 0.16, TZ0, MZ0 + 0.3);
  for (const x of [-WX + 1.4, 0, WX - 1.4]) for (let z = -HL + 1; z < HL - 1; z += 5) { if (x === 0 && z + 3.8 > TZ0 - 1 && z < MZ0 + 1) continue; B.box('licht', x - 0.13, x + 0.13, DECKE - 0.05, DECKE, z, z + 3.8); B.box('dunkel', x - 0.17, x + 0.17, DECKE - 0.02, DECKE, z - 0.05, z + 3.85); }
  // Säulen
  if (!ohneSaeulen) for (let z = -HL + 7; z < HL - 3; z += 10) { if (z > TZ0 - 3 && z < MZ0 + 1) continue; B.box('wand', -saeuleB, saeuleB, 0, DECKE, z - saeuleB, z + saeuleB); B.box('band', -saeuleB - 0.01, saeuleB + 0.01, 2.75, 3.2, z - saeuleB - 0.01, z + saeuleB + 0.01); }
  // Bänke, Abfall, Info
  const hindernisse = []; const hin = (x0, x1, z0, z1, eb = 0) => hindernisse.push([x0 - RAD, x1 + RAD, z0 - RAD, z1 + RAD, eb]);
  if (!ohneSaeulen) for (let z = -HL + 7; z < HL - 3; z += 10) { if (z > TZ0 - 3 && z < MZ0 + 1) continue; hin(-saeuleB, saeuleB, z - saeuleB, z + saeuleB); }
  const bank = (x, z) => { B.box('stahl', x - 0.26, x + 0.26, 0, 0.42, z - 0.04, z + 0.04); B.box('stahl', x - 0.26, x + 0.26, 0, 0.42, z + 1.76, z + 1.84); B.box('holz', x - 0.27, x + 0.27, 0.42, 0.47, z - 0.06, z + 1.86); B.box('holz', x - 0.05 + (x < 0 ? -0.24 : 0.24), x + 0.05 + (x < 0 ? -0.24 : 0.24), 0.5, 0.95, z - 0.06, z + 1.86); hin(x - 0.27, x + 0.27, z - 0.06, z + 1.86); };
  for (let z = -HL + 12; z < HL - 8; z += 20) { if (z > TZ0 - 6 && z < MZ0 + 2) continue; bank(-1.6, z); bank(1.6, z + 6); }
  for (let z = -HL + 19; z < HL - 8; z += 40) { if (z > TZ0 - 3 && z < MZ0 + 2) continue; B.box('kasten', 1.0, 1.42, 0, 0.9, z, z + 0.42); hin(1, 1.42, z, z + 0.42); }
  // Treppe: Wände außen, Stufen, Handlauf, Schacht nach oben
  for (const q of [-1, 1]) { const a = q < 0 ? -TB - 0.2 : TB, b = q < 0 ? -TB : TB + 0.2; B.box('wand', a, b, 0, DECKE, TZ0, MZ0 + 0.3); B.box('wand', a, b, DECKE, OY + OH, TZ0, MZ0); B.box('band', q < 0 ? a - 0.01 : b, q < 0 ? a : b + 0.01, 2.75, 3.2, TZ0, MZ0 + 0.3); hin(a, b, TZ0, MZ0 + 0.3); for (let k = 0; k < 2; k++) { const xh = q * (TB - 0.05); } }
  B.box('wand', -TB - 0.2, TB + 0.2, 0, DECKE, MZ0, MZ0 + 0.3); hindernisse.push([-TB - 0.2 - RAD, TB + 0.2 + RAD, MZ0 - RAD * 0.2, MZ0 + 0.3 + RAD, 0]);
  B.box('wand', -TB - 0.2, TB + 0.2, DECKE, OY + OH, TZ0 - 0.2, TZ0); B.box('decke', -TB - 0.2, TB + 0.2, OY + OH, OY + OH + 0.15, TZ0 - 0.2, MZ0);
  { const ST = 24, ru = (TZ1 - TZ0) / ST, ri = OY / ST; for (let k = 0; k < ST; k++) { const z = TZ0 + k * ru; B.box('boden', -TB, TB, 0, (k + 1) * ri, z, z + ru); B.box('gelb', -TB, TB, (k + 1) * ri, (k + 1) * ri + 0.004, z, z + 0.05); } for (const q of [-1, 1]) { const x = q * (TB - 0.04); for (let k = 0; k <= 6; k++) { const z = TZ0 + k * (TZ1 - TZ0) / 6, y = OY * k / 6; B.zyl('stahl', x, y, y + 0.92, z, 0.018, 6); } const P = []; for (let k = 0; k < 6; k++) { const z0 = TZ0 + k * (TZ1 - TZ0) / 6, z1 = TZ0 + (k + 1) * (TZ1 - TZ0) / 6, y0 = OY * k / 6 + 0.92, y1 = OY * (k + 1) / 6 + 0.92; B.quad('stahl', [x - 0.025, y0, z0], [x + 0.025, y0, z0], [x + 0.025, y1, z1], [x - 0.025, y1, z1], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); } } for (let z = TZ0 + 1; z < MZ0 - 0.5; z += 3) B.box('licht', -0.12, 0.12, OY + OH - 0.04, OY + OH, z, z + 2); }
  // Zwischengeschoss: Boden, Wände, Decke, Automaten, Sperren, Ausgang
  B.box('boden', -MX, MX, OY - 0.14, OY, MZ0, MZ1); B.box('decke', -MX, MX, OY + OH, OY + OH + 0.15, MZ0, MZ1); for (const q of [-1, 1]) { const a = q < 0 ? -MX - 0.2 : MX, b = q < 0 ? -MX : MX + 0.2; B.box('wand', a, b, OY, OY + OH, MZ0, MZ1); const ix = q < 0 ? -MX : MX - 0.02, ax = q < 0 ? -MX + 0.02 : MX; B.box('band', ix, ax, OY + 1.9, OY + 2.2, MZ0, MZ1); B.box('dunkel', ix, ax, OY, OY + 0.14, MZ0, MZ1); }
  B.box('wand', -MX, -TB - 0.2, OY, OY + OH, MZ0 - 0.2, MZ0); B.box('wand', TB + 0.2, MX, OY, OY + OH, MZ0 - 0.2, MZ0);
  B.box('wand', -MX, -2.6, OY, OY + OH, MZ1, MZ1 + 0.2); B.box('wand', 2.6, MX, OY, OY + OH, MZ1, MZ1 + 0.2); B.box('wand', -2.6, 2.6, OY + 2.6, OY + OH, MZ1, MZ1 + 0.2); B.box('tag', -2.6, 2.6, OY, OY + 2.6, MZ1 + 0.05, MZ1 + 0.1);
  for (const x of [-4.2, 0, 4.2]) for (let z = MZ0 + 1.2; z < MZ1 - 1; z += 4.4) B.box('licht', x - 0.5, x + 0.5, OY + OH - 0.04, OY + OH, z, z + 2.6);
  // Fahrkartenautomaten an der Wand (frei erfunden), Bildschirm leuchtet
  for (const q of [-1, 1]) for (const z of [MZ0 + 2.5, MZ0 + 4.4]) { const a = q * (MX - 0.32); B.box('kasten', a - 0.3, a + 0.3, OY, OY + 1.82, z, z + 0.9); B.box('dunkel', q < 0 ? a + 0.29 : a - 0.3, q < 0 ? a + 0.31 : a - 0.29, OY + 1.0, OY + 1.55, z + 0.15, z + 0.75); B.box('bild', q < 0 ? a + 0.31 : a - 0.31, q < 0 ? a + 0.315 : a - 0.3, OY + 1.05, OY + 1.5, z + 0.2, z + 0.7); B.box('band', a - 0.31, a + 0.31, OY + 1.66, OY + 1.82, z - 0.005, z + 0.905); hin(a - 0.3, a + 0.3, z, z + 0.9, 1); }
  // Sperren: fünf Durchgänge
  { const zs = MZ0 + 8; for (let k = -3; k <= 3; k++) { const x = k * 1.25; if (k === 0) { B.box('kasten', x - 0.14, x + 0.14, OY, OY + 1, zs, zs + 1.3); hin(x - 0.14, x + 0.14, zs, zs + 1.3, 1); continue; } B.box('kasten', x - 0.14, x + 0.14, OY, OY + 1, zs, zs + 1.3); B.box('dunkel', x - 0.15, x + 0.15, OY + 1, OY + 1.02, zs + 0.1, zs + 1.2); B.box('bild', x - 0.1, x + 0.1, OY + 1.02, OY + 1.03, zs + 0.5, zs + 0.8); hin(x - 0.14, x + 0.14, zs, zs + 1.3, 1); } for (const a of [-MX, 3.75 + 0.14]) B.box('kasten', a, a + (MX - 3.75 - 0.14), OY, OY + 1.05, zs + 0.5, zs + 0.7); hin(-MX, -3.75 - 0.14, zs + 0.5, zs + 0.7, 1); hin(3.75 + 0.14, MX, zs + 0.5, zs + 0.7, 1); }
  B.fertig(mats, G);
  // Schilder mit dem echten Namen, Band in Linienfarbe
  const schild = leinwand(1024, 128, (g, w2, h2) => { g.fillStyle = '#10151c'; g.fillRect(0, 0, w2, h2); g.fillStyle = farbeLinie; g.fillRect(0, 0, 22, h2); g.fillRect(w2 - 22, 0, 22, h2); g.fillStyle = '#fbfaf5'; anpassen(g, name, w2 - 90, 78); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w2 / 2, h2 / 2 + 4); }, false), mS = new THREE.MeshBasicMaterial({ map: schild, color: new THREE.Color(1.15, 1.15, 1.15) });
  for (let z = -HL + 6; z < HL - 4; z += 17) for (const q of [-1, 1]) G.add(schildFlaeche(null, 3.8, 0.47, q * (WX - 0.05), 2.2, z, q < 0 ? Math.PI / 2 : -Math.PI / 2, mS));
  if (!ohneSaeulen) for (let z = -HL + 17; z < HL - 3; z += 20) { if (z > TZ0 - 3 && z < MZ0 + 1) continue; for (const q of [-1, 1]) G.add(schildFlaeche(null, 1.7, 0.21, q * (saeuleB + 0.01), 2.25, z, q < 0 ? -Math.PI / 2 : Math.PI / 2, mS)); }
  G.add(schildFlaeche(null, 3.4, 0.42, 0, 3.55, TZ0 - 0.21, Math.PI, mS)); G.add(schildFlaeche(null, 4.2, 0.52, -MX + 0.03, OY + 2.5, MZ0 + 8, Math.PI / 2, mS)); G.add(schildFlaeche(null, 4.2, 0.52, MX - 0.03, OY + 2.5, MZ0 + 8, -Math.PI / 2, mS));
  // Ausgang, Wegweiser
  const aus = leinwand(512, 128, (g, w2, h2) => { g.fillStyle = '#0e6a3a'; g.fillRect(0, 0, w2, h2); g.fillStyle = '#fff'; g.font = '700 72px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(T('Ausgang') + ' →', w2 / 2, h2 / 2 + 3); }, false), mAus = new THREE.MeshBasicMaterial({ map: aus, color: new THREE.Color(1.4, 1.4, 1.4) });
  { const a = schildFlaeche(null, 1.7, 0.42, 0, 3.05, TZ0 - 0.215, Math.PI, mAus); G.add(a); doppel(G, mAus, 1.9, 0.48, 0, OY + 2.8, MZ0 + 7); const c = schildFlaeche(null, 2.4, 0.5, 0, OY + 2.85, MZ1 - 0.04, Math.PI, mAus); G.add(c); }
  // Werbung: Leuchtkästen mit Zahlencode, frei für Kunden
  const code = `UB ${String(i).padStart(5, '0')}`, wb = leinwand(1024, 512, (g, w2, h2) => { const gr = g.createLinearGradient(0, 0, w2, h2); gr.addColorStop(0, '#f6efe0'); gr.addColorStop(1, '#e5d9c0'); g.fillStyle = gr; g.fillRect(0, 0, w2, h2); g.fillStyle = '#17120c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 84px system-ui, sans-serif'; g.fillText(T('Hier kann deine'), w2 / 2, 170); g.fillText(T('Werbung hängen'), w2 / 2, 268); g.font = '600 40px system-ui, sans-serif'; g.fillText(`${T('Fläche')} ${code}`, w2 / 2, 380); }, false), mW = new THREE.MeshBasicMaterial({ map: wb, color: new THREE.Color(1.25, 1.25, 1.25) });
  for (let z = -HL + 14; z < HL - 6; z += 17) for (const q of [-1, 1]) { const f = schildFlaeche(null, 3, 1.5, q * (WX - 0.04), 1.05, z, q < 0 ? Math.PI / 2 : -Math.PI / 2, mW); G.add(f); }
  // Linienplan mit den echten Stationen der Linie
  const plan = planZeichnen(D, i, farbeLinie), mP = new THREE.MeshBasicMaterial({ map: plan, color: new THREE.Color(1.15, 1.15, 1.15) });
  G.add(schildFlaeche(null, 3.2, 1.2, TB + 0.21, 1.75, TZ0 + 3.4, Math.PI / 2, mP)); G.add(schildFlaeche(null, 3.2, 1.2, -TB - 0.21, 1.75, TZ0 + 3.4, -Math.PI / 2, mP)); G.add(schildFlaeche(null, 3.6, 1.35, -MX + 0.03, OY + 1.45, MZ0 + 9.6, Math.PI / 2, mP));
  // Anzeigetafeln von der Decke
  const tafel = document.createElement('canvas'); tafel.width = 768; tafel.height = 128; const tTex = new THREE.CanvasTexture(tafel); tTex.colorSpace = THREE.SRGBColorSpace; const mT = new THREE.MeshBasicMaterial({ map: tTex, side: THREE.DoubleSide, color: new THREE.Color(1.6, 1.6, 1.6) }); for (const z of [-40, -14, 6, 40]) { for (const q of [-1, 1]) doppel(G, mT, 2.4, 0.4, q * 2.5, 3.2, z); const dr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 0.03), new THREE.MeshBasicMaterial({ color: 0x222222 })); dr.position.set(-2.5, 3.8, z); G.add(dr); const dr2 = dr.clone(); dr2.position.x = 2.5; G.add(dr2); }
  return { gruppe: G, geteilt, hindernisse, tafel, tTex, mats, name, i, entsorgen() { G.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map?.isCanvasTexture && o.material.map !== TEX._k && o.material.map.dispose(); o.material.dispose(); } }); } };
}
function planZeichnen(D, i, farbe) {
  const S = D.s(i), l = (S[4][0] ?? -1), R = D.linienStueck(i, l, 12), n = R.length;
  return leinwand(1280, 480, (g, w, h) => { g.fillStyle = '#f7f5ef'; g.fillRect(0, 0, w, h); g.fillStyle = '#10151c'; g.font = '700 38px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(`${l >= 0 ? D.kurz(l) : (D.d.netze[S[3]] || 'Linie')}`, 40, 58); g.fillStyle = '#5b5f66'; g.font = '500 24px system-ui, sans-serif'; if (S[3] >= 0) g.fillText(D.d.netze[S[3]] || '', 40, 92);
    const y = 300, x0 = 70, x1 = w - 70, dx = n > 1 ? (x1 - x0) / (n - 1) : 0; g.strokeStyle = farbe; g.lineWidth = 12; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    R.forEach((st, k) => { const x = x0 + k * dx, e = st === i; g.beginPath(); g.arc(x, y, e ? 17 : 11, 0, 7); g.fillStyle = e ? farbe : '#fff'; g.fill(); g.lineWidth = 5; g.strokeStyle = e ? '#10151c' : farbe; g.stroke(); g.save(); g.translate(x + 4, y - 26); g.rotate(-0.72); g.fillStyle = e ? '#10151c' : '#3a3f47'; g.font = `${e ? 700 : 500} ${n > 16 ? 19 : 23}px system-ui, sans-serif`; g.textAlign = 'left'; const t = D.s(st)[2]; g.fillText(t.length > 22 ? t.slice(0, 21) + '…' : t, 0, 0); g.restore(); }); }, false);
}

// ---------- Zug ----------
export function zugBauen(mobil, NW2 = NW) {
  const ZL2 = WAGEN * NW2, tuerZ2 = []; for (let w = 0; w < NW2; w++) for (const d of TUEREN) tuerZ2.push((w - (NW2 - 1) / 2) * WAGEN + d);
  const G = new THREE.Group(); G.name = 'ubahnzug'; const geteilt = { uKam: { value: new THREE.Vector3() }, uBand: { value: new THREE.Vector3(-0.62, 0.62, 1000) }, uH: { value: 2.3 }, uI: { value: 0.3 }, uAmb: { value: 0.33 }, uRaster: { value: 4.2 } }, weiss = weissBereit(), m = (t, o = {}) => raumMat(t, { ...o, geteilt });
  const mats = { lack: m(weiss, { farbe: [0.82, 0.83, 0.84], glanz: 0.45 }), streifen: m(weiss, { farbe: [0.1, 0.35, 0.8], glanz: 0.35 }), dunkel: m(weiss, { farbe: [0.05, 0.05, 0.06], glanz: 0.2 }), innen: m(weiss, { farbe: [0.74, 0.75, 0.73], glanz: 0.12 }), boden: m(TEX.boden, { farbe: [0.56, 0.58, 0.62], glanz: 0.22 }), sitz: m(TEX.sitz), griff: m(weiss, { farbe: [0.9, 0.72, 0.1], glanz: 0.6 }), stahl: m(weiss, { farbe: [0.5, 0.52, 0.55], glanz: 0.5 }), licht: leucht(3, 2.95, 2.8), rot: leucht(8, 0.3, 0.2), scheinwerfer: leucht(14, 13, 11) };
  const B = new Bau({ boden: 2, sitz: 0.42 }), glas = new THREE.MeshStandardMaterial({ color: 0x8fb4c4, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.2 }), L2 = ZL2 / 2;
  // Boden, Decke, Dach mit Rundung, Schürze unten
  B.box('boden', -ZI - 0.1, ZI + 0.1, -0.1, 0, -L2, L2);
  B.prisma('innen', [[-ZI, 2.14], [-0.92, 2.28], [-0.5, 2.34], [0.5, 2.34], [0.92, 2.28], [ZI, 2.14]], -L2, L2);
  B.prisma('lack', [[-ZB, 2.46], [-1.15, 2.6], [-0.7, 2.7], [0.7, 2.7], [1.15, 2.6], [ZB, 2.46]], -L2, L2);
  for (const q of [-1, 1]) { B.prisma('lack', q < 0 ? [[-ZB, -0.55], [-ZB + 0.07, -0.92]] : [[ZB - 0.07, -0.92], [ZB, -0.55]], -L2, L2); }
  B.box('dunkel', -ZB + 0.15, ZB - 0.15, -0.95, -0.1, -L2, L2);
  // Drehgestelle
  for (let w = 0; w < NW2; w++) for (const s of [-1, 1]) { const z = (w - (NW2 - 1) / 2) * WAGEN + s * 6.3; B.box('dunkel', -1.08, 1.08, -1.12, -0.72, z - 1.25, z + 1.25); for (const e of [-0.9, 0.9]) { B.zylZ('dunkel', -0.72, -0.78, z + e - 0.05, z + e + 0.05, 0.36, 10); B.zylZ('dunkel', 0.72, -0.78, z + e - 0.05, z + e + 0.05, 0.36, 10); } }
  // Lichtbänder, Haltestangen, Griffe
  B.box('licht', -0.72, -0.5, 2.24, 2.28, -L2 + 0.4, L2 - 0.4); B.box('licht', 0.5, 0.72, 2.24, 2.28, -L2 + 0.4, L2 - 0.4);
  for (const q of [-1, 1]) B.zylZ('griff', q * 0.72, 2.0, -L2 + 0.4, L2 - 0.4, 0.016, 6);
  // Seitenwände: Fenster und Türen wechseln sich ab
  const hindernisse = [], fenster = [], leistenK = ZB - 0.02;
  for (let w = 0; w < NW2; w++) { const cz = (w - (NW2 - 1) / 2) * WAGEN, gr = [cz - WAGEN / 2, cz - 6 - TUER_B, cz - 6 + TUER_B, cz - TUER_B, cz + TUER_B, cz + 6 - TUER_B, cz + 6 + TUER_B, cz + WAGEN / 2];
    for (const q of [-1, 1]) { const xa = q < 0 ? -ZB : ZI, xb = q < 0 ? -ZI : ZB;
      for (let k = 0; k < gr.length - 1; k += 2) { const z0 = gr[k], z1 = gr[k + 1]; // Wandstück mit Fenster
        B.box('lack', xa, xb, -0.55, 0.94, z0, z1); B.box('lack', xa, xb, 2.1, 2.46, z0, z1); B.box('streifen', q < 0 ? -ZB - 0.008 : ZB, q < 0 ? -ZB : ZB + 0.008, 0.42, 0.72, z0, z1); B.box('streifen', q < 0 ? -ZB - 0.008 : ZB, q < 0 ? -ZB : ZB + 0.008, 2.1, 2.18, z0, z1);
        B.box('innen', q < 0 ? -ZI : ZI - 0.005, q < 0 ? -ZI + 0.005 : ZI, 0, 0.94, z0, z1); B.box('innen', q < 0 ? -ZI : ZI - 0.005, q < 0 ? -ZI + 0.005 : ZI, 2.1, 2.2, z0, z1);
        const fz0 = z0 + 0.2, fz1 = z1 - 0.2; if (fz1 > fz0) { fenster.push([q, fz0, fz1]); B.box('dunkel', xa, xb, 0.94, 2.1, z0, fz0); B.box('dunkel', xa, xb, 0.94, 2.1, fz1, z1); }
        // Sitzbank längs, Lehne an der Wand, Stange am Ende
        const s0 = z0 + (k === 0 ? 0.5 : 0.15), s1 = z1 - (k === gr.length - 2 ? 0.5 : 0.15); if (s1 - s0 > 1) { const sx0 = q < 0 ? -ZI : ZI - 0.48, sx1 = q < 0 ? -ZI + 0.48 : ZI; B.box('sitz', sx0, sx1, 0.42, 0.5, s0, s1); B.box('stahl', q < 0 ? sx0 + 0.05 : sx1 - 0.36, q < 0 ? sx0 + 0.36 : sx1 - 0.05, 0.1, 0.42, s0 + 0.05, s1 - 0.05); B.box('sitz', q < 0 ? -ZI : ZI - 0.08, q < 0 ? -ZI + 0.08 : ZI, 0.5, 1.0, s0, s1); hindernisse.push([q < 0 ? -ZI - 0.1 : ZI - 0.5 - RAD, q < 0 ? -ZI + 0.5 + RAD : ZI + 0.1, s0 - RAD, s1 + RAD, s0, s1, q]); }
      }
      // Türrahmen und Trittkante
      for (const d of TUEREN) { const z = cz + d; B.box('dunkel', xa, xb, 2.1, 2.14, z - TUER_B - 0.03, z + TUER_B + 0.03); B.box('gelb' in mats ? 'gelb' : 'griff', q < 0 ? -ZB : ZI, q < 0 ? -ZI : ZB, 0, 0.02, z - TUER_B, z + TUER_B); B.zyl('griff', q * 0.42, 0, 2.28, z, 0.018, 8); }
    }
    // Gang zwischen den Wagen
    if (w < NW2 - 1) { const z = cz + WAGEN / 2; for (const q of [-1, 1]) { const xa = q < 0 ? -ZI - 0.02 : ZI - 0.1, xb = q < 0 ? -ZI + 0.1 : ZI + 0.02; B.box('dunkel', xa, xb, 0, 2.2, z - 0.42, z + 0.42); B.box('dunkel', q < 0 ? -ZB : ZB - 0.05, q < 0 ? -ZB + 0.05 : ZB, -0.5, 2.5, z - 0.3, z + 0.3); } B.box('dunkel', -ZI, ZI, 2.14, 2.34, z - 0.42, z + 0.42); }
  }
  // Stirnseiten: Führerstand mit Scheibe, Scheinwerfer, Schlusslicht, Zielanzeige
  for (const s of [-1, 1]) { const z = s * L2, a = s < 0 ? z - 0.08 : z, b = s < 0 ? z : z + 0.08; B.box('lack', -ZB, ZB, -0.92, 0.95, a, b); B.box('lack', -ZB, ZB, 2.05, 2.7, a, b); B.box('lack', -ZB, -ZB + 0.3, 0.95, 2.05, a, b); B.box('lack', ZB - 0.3, ZB, 0.95, 2.05, a, b); B.box('streifen', -ZB, ZB, 0.18, 0.72, s < 0 ? a - 0.008 : b, s < 0 ? a : b + 0.008); B.box('innen', -ZI, ZI, 0, 2.3, s < 0 ? z + 0.5 : z - 0.52, s < 0 ? z + 0.52 : z - 0.5); B.box('dunkel', -ZB + 0.3, ZB - 0.3, 0.95, 2.05, s < 0 ? z - 0.02 : z, s < 0 ? z : z + 0.02); for (const q of [-1, 1]) { B.box(s > 0 ? 'scheinwerfer' : 'rot', q * 0.98 - 0.11, q * 0.98 + 0.11, 0.3, 0.46, s < 0 ? a - 0.012 : b, s < 0 ? a : b + 0.012); } }
  B.fertig(mats, G);
  // Fenster als ein Netz
  { const P = [], I = []; for (const [q, z0, z1] of fenster) { const s = P.length / 3, x = q * (ZB - 0.02); P.push(x, 0.94, z0, x, 0.94, z1, x, 2.1, z1, x, 2.1, z0); I.push(s, s + 1, s + 2, s, s + 2, s + 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); const f = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xa8c4d0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); f.frustumCulled = false; f.renderOrder = 3; G.add(f); }
  // Türflügel: ein Netz je Flügel als Instanzen, Fenster im Flügel
  const n = tuerZ2.length * 2 * 2, T = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 2.1, TUER_B), new THREE.MeshBasicMaterial({ color: 0x9aa0a6 }), n); T.frustumCulled = false; G.add(T); T.material = new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, uniforms: { uF: mats.streifen.uniforms.uFarbe }, vertexShader: 'varying vec3 vP; varying vec3 vN; void main() { vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }', fragmentShader: 'varying vec3 vP; varying vec3 vN; uniform vec3 uF; void main() { float f = step(abs(vP.z), 0.27) * step(-0.12, vP.y) * step(vP.y, 0.86); vec3 c = vec3(0.6, 0.61, 0.62); float b = step(-0.68, vP.y) * step(vP.y, -0.34); c = mix(c, uF, b); c *= 0.72 + 0.28 * max(0.0, normalize(vN).y + 0.5); float rand = step(0.335, abs(vP.z)); c *= 1.0 - 0.3 * rand * step(abs(vP.x), 0.02); gl_FragColor = vec4(mix(c, vec3(0.42, 0.56, 0.62), f), mix(1.0, 0.24, f)); }' });
  const tuerSetzen = (seite, offen) => { const M = new THREE.Matrix4(); let k = 0; for (const q of [-1, 1]) for (const z of tuerZ2) { const o = q === seite ? offen * (TUER_B - 0.04) : 0; for (const s of [-1, 1]) { M.makeTranslation(q * (ZB - 0.025), 1.05, z + s * (TUER_B / 2 + o)); T.setMatrixAt(k++, M); } } T.instanceMatrix.needsUpdate = true; };
  tuerSetzen(-1, 0);
  // Anzeigen im Wagen
  const anz = document.createElement('canvas'); anz.width = 512; anz.height = 64; const aTex = new THREE.CanvasTexture(anz); aTex.colorSpace = THREE.SRGBColorSpace; const mA = new THREE.MeshBasicMaterial({ map: aTex, color: new THREE.Color(1.5, 1.5, 1.5), side: THREE.DoubleSide }); for (const z of tuerZ2) doppel(G, mA, 0.92, 0.115, 0, 2.2, z);
  const zlt = document.createElement('canvas'); zlt.width = 512; zlt.height = 64; const zTex = new THREE.CanvasTexture(zlt); zTex.colorSpace = THREE.SRGBColorSpace; const mZ = new THREE.MeshBasicMaterial({ map: zTex, color: new THREE.Color(1.8, 1.4, 0.5), side: THREE.DoubleSide }); for (const s of [-1, 1]) { const a = schildFlaeche(null, 1.4, 0.18, 0, 2.28, s * (L2 + 0.03), s < 0 ? Math.PI : 0, mZ); G.add(a); }
  return { gruppe: G, geteilt, mats, tuerSetzen, anz, aTex, zlt, zTex, hindernisse };
}

// ---------- Tunnel ----------
const TUNNEL_VS = `attribute float aL; varying vec2 vUv; varying vec3 vP, vN; varying float vL; void main() { vUv = uv; vP = position; vN = normal; vL = aL; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const TUNNEL_FS = `varying vec2 vUv; varying vec3 vP, vN; varying float vL; uniform sampler2D map; uniform float uHell; void main() { vec3 c = texture2D(map, vUv).rgb; float e = exp(-abs(vP.z) * 0.32) * 1.6 + 0.08; if (vL > 0.5) { gl_FragColor = vec4(vec3(9.0, 8.6, 7.6), 1.0); return; } gl_FragColor = vec4(c * e * uHell, 1.0); }`;
function tunnelBauen() {
  const LS = 12, A = 2.75, Tu = 3.65, B = BETT - 0.2, P = [], N = [], U = [], Lf = [], I = [], q = (a, b, c, d, n, sk = 3, l = 0) => { const s = P.length / 3; for (const v of [a, b, c, d]) P.push(v[0], v[1], v[2]); for (let i = 0; i < 4; i++) { N.push(n[0], n[1], n[2]); Lf.push(l); } const h1 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / sk, h2 = Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]) / sk; U.push(0, 0, h1, 0, h1, h2, 0, h2); I.push(s, s + 1, s + 2, s, s + 2, s + 3); }, z0 = -LS / 2, z1 = LS / 2;
  q([-A, B, z1], [-A, B, z0], [-A, Tu, z0], [-A, Tu, z1], [1, 0, 0]); q([A, B, z0], [A, B, z1], [A, Tu, z1], [A, Tu, z0], [-1, 0, 0]); q([-A, Tu, z0], [A, Tu, z0], [A, Tu, z1], [-A, Tu, z1], [0, -1, 0]); q([-A, B, z1], [A, B, z1], [A, B, z0], [-A, B, z0], [0, 1, 0]);
  // Kabelkanal an der Wand, Lampe, Schienen
  const box = (x0, x1, y0, y1, a, b, l = 0) => { q([x0, y0, b], [x1, y0, b], [x1, y1, b], [x0, y1, b], [0, 0, 1], 3, l); q([x1, y0, a], [x0, y0, a], [x0, y1, a], [x1, y1, a], [0, 0, -1], 3, l); q([x1, y0, b], [x1, y0, a], [x1, y1, a], [x1, y1, b], [1, 0, 0], 3, l); q([x0, y0, a], [x0, y0, b], [x0, y1, b], [x0, y1, a], [-1, 0, 0], 3, l); q([x0, y1, b], [x1, y1, b], [x1, y1, a], [x0, y1, a], [0, 1, 0], 3, l); q([x0, y0, a], [x1, y0, a], [x1, y0, b], [x0, y0, b], [0, -1, 0], 3, l); };
  for (const y of [0.6, 0.85, 1.1]) box(-A + 0.02, -A + 0.09, y, y + 0.06, z0, z1); box(A - 0.09, A - 0.02, 0.6, 0.66, z0, z1); box(-A + 0.02, -A + 0.09, 2.4, 2.6, -0.5, 0.5, 1); box(A - 0.1, A - 0.02, 2.4, 2.46, -0.9, 0.9, 1); for (const e of [-0.72, 0.72]) box(e - 0.04, e + 0.04, BETT + 0.1, BETT + 0.26, z0, z1); for (let z = z0; z < z1; z += 0.75) box(-1.15, 1.15, BETT, BETT + 0.1, z, z + 0.26);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('aL', new THREE.Float32BufferAttribute(Lf, 1)); g.setIndex(I);
  const m = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ vertexShader: TUNNEL_VS, fragmentShader: TUNNEL_FS, side: THREE.DoubleSide, uniforms: { map: { value: TEX.beton }, uHell: { value: 1 } } }), 90); m.frustumCulled = false; m.count = 0; m.name = 'tunnel'; return { mesh: m, LS };
}

// ---------- Kollision: begehbare Rechtecke je Ebene, Hindernisse, Treppe ----------
class UKollision {
  constructor(sys) { this.sys = sys; this.ebene = 0; this.yAkt = undefined; }
  drin(R, x, z) { return x >= R[0] && x <= R[1] && z >= R[2] && z <= R[3]; }
  aufTreppe(x, z) { return Math.abs(x) < TB && z >= TZ0 && z <= TZ1; }
  punktFrei(x, z) {
    const S = this.sys;
    if (S.mitZugBegehbar()) { // im Zug
      const zx = x - S.zug.gleis * TX; if (Math.abs(zx) <= ZI && Math.abs(z) <= ZL / 2 - 0.55) { for (const h of S.zugTeile.hindernisse) if (zx > h[0] && zx < h[1] && z > h[2] && z < h[3]) return false; return true; }
      if (S.zug.tuerOffen > 0.55 && !S.imFahren()) { const ax = S.zug.gleis > 0 ? PB - 0.05 : -ZI - TX, bx = S.zug.gleis > 0 ? TX - ZI + 0.05 : -PB + 0.05; if (x >= Math.min(ax, -PB + 0.05) && x <= Math.max(bx, PB - 0.05) && Math.abs(x) >= PB - 0.1 && Math.abs(x) <= TX - ZI + 0.1) for (const t of tuerZ) if (Math.abs(z - t) < TUER_B - 0.28) return true; }
    }
    if (S.imFahren()) return false;
    const eb = this.ebene;
    if (this.aufTreppe(x, z)) return true;
    if (eb === 0) { if (Math.abs(x) > PB - 0.02 || Math.abs(z) > HL - 0.3) return false; } else { if (Math.abs(x) > MX - 0.02 || z < MZ0 + 0.0 || z > MZ1 - 0.12) return false; }
    for (const h of S.station.hindernisse) if (h[4] === eb && x > h[0] + RAD * 0.7 && x < h[1] - RAD * 0.7 && z > h[2] + RAD * 0.7 && z < h[3] - RAD * 0.7) return false;
    return true;
  }
  frei(x, z) { const r = RAD; return this.punktFrei(x - r, z - r) && this.punktFrei(x + r, z - r) && this.punktFrei(x - r, z + r) && this.punktFrei(x + r, z + r); }
  schritt(x, z, nx, nz) { if (this.frei(nx, nz)) return [nx, nz]; if (this.frei(nx, z)) return [nx, z]; if (this.frei(x, nz)) return [x, nz]; return [x, z]; }
  hoehe(x, z) {
    if (this.aufTreppe(x, z)) { this.ebene = z > (TZ0 + TZ1) / 2 ? 1 : 0; return kl((z - TZ0) / (TZ1 - TZ0), 0, 1) * OY; }
    return this.ebene === 1 ? OY : 0;
  }
  sicht(x0, z0, x1, z1) { const n = 8; for (let i = 1; i <= n; i++) { const t = i / n; if (!this.punktFrei(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return (i - 1) / n; } return 1; }
}

// ---------- Das System ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _o = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
export class UBahn {
  constructor({ mobil = false, renderer, daten, beiAusgang, ton, welt, boden }) {
    this.mobil = mobil; this.renderer = renderer; this.D = daten; this.beiAusgang = beiAusgang; this.ton = ton; this.welt = welt; this.bodenGeo = boden; this.an = false;
    this.szene = new THREE.Scene(); this.szene.background = new THREE.Color(0x020203); this.szene.name = 'ubahn'; this.kamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.06, 1400);
    this.szene.add(new THREE.HemisphereLight(0xf4f4f0, 0x6e6a62, 1.9)); const dl = new THREE.DirectionalLight(0xfff6e8, 0.9); dl.position.set(0.3, 1, 0.2); this.szene.add(dl);
    this.zugTeile = zugBauen(mobil); this.tunnel = tunnelBauen(); this.szene.add(this.zugTeile.gruppe, this.tunnel.mesh); this.kol = new UKollision(this); this.station = null; this.naechste = null; this.schiff = { lat: 0, lon: 0 }; this.yaw = 0; this.pitch = 0.12; this.dist = 3.2; this.distZiel = 3.2; this.kamP = new THREE.Vector3(); this.kamZ = new THREE.Vector3(); this.frisch = true; this.ersteP = false; this.figur = null; this.nah = null; this.t = 0; this.sitzt = null; this.leute = []; this.fahrgaeste = [];
    this.zug = { gleis: -1, dir: 1, s: -9999, v: 0, phase: 'pause', t: 6, tuerOffen: 0, ziel: -1, linie: -1, farbe: '#1f5fbf', richtung: '', an: false, D: 0, vonI: -1, bord: false, prev: -1, nZug: 0 }; this.bauHud();
  }
  mitZugBegehbar() { const Z = this.zug; return Z.bord || (Z.phase === 'halt' && Math.abs(Z.s) < 0.01); }
  imFahren() { return this.zug.bord && this.zug.phase !== 'halt'; }
  async betreten({ i, quelle, bewegungen, quellen }) {
    await this.D.laden(); this.quellen = quellen || []; this.bewegungen = bewegungen; this.quelle = quelle; this.an = true; this.iJetzt = i; this.prev = -1; this.bahnhofSetzen(i);
    this.kol.ebene = 1; this.figur = new Figur({ quelle, bewegungen, kollision: this.kol, start: { x: 0, z: MZ1 - 3, ry: Math.PI } }); this.figur.pos.y = OY; this.figur.boden = OY; this.figur.bildSetzen(); this.szene.add(this.figur.obj); this.yaw = 0; this.pitch = 0.12; this.frisch = true; this.sitzt = null;
    const Z = this.zug; Z.bord = false; Z.phase = 'pause'; Z.t = 5 + Math.random() * 4; Z.an = false; Z.s = -9999; Z.tuerOffen = 0; Z.nZug = 0; this.zugTeile.gruppe.visible = false; const S = this.D.s(i); this.schiff.lat = S[0]; this.schiff.lon = S[1];
    this.hud(true); this.planHud(); this.melde(`${S[2]}${S[3] >= 0 ? ' · ' + (this.D.d.netze[S[3]] || '') : ''}`, 5); this.leuteStart(); this.fahrgaesteStart();
  }
  verlassen() { if (!this.an) return; this.an = false; this.figur?.entfernen(); this.figur = null; this.leuteWeg(); this.hud(false); if (this.station) { this.szene.remove(this.station.gruppe); this.station.entsorgen(); this.station = null; } if (this.naechste) { this.szene.remove(this.naechste.gruppe); this.naechste.entsorgen(); this.naechste = null; } this.zugTeile.gruppe.visible = false; this.zug.an = false; this.zug.bord = false; this.ton?.zug?.(9999, 0, 0.016); }
  figurWelt(out) { return this.welt ? out.copy(this.welt.geoZuLokal(this.schiff.lat, this.schiff.lon, this.bodenGeo(this.schiff.lat, this.schiff.lon) + 1.6, _a)) : out.set(0, 0, 0); }
  bahnhofSetzen(i) { const fb = this.farbeVon(i), b = bahnhofBauen(this.D, i, fb, { mobil: this.mobil }); this.szene.add(b.gruppe); this.station = b; this.iJetzt = i; this.linieJetzt = this.D.s(i)[4][0] ?? -1; return b; }
  farbeVon(i) { const S = this.D.s(i); return this.D.farbe(S[4][0] ?? -1, S[3]); }
  // Nächster Zug: Gleis wechselt, ein Ziel je Gleis; ohne Vorgänger zuerst das erste Ziel
  zugPlanen() {
    const Z = this.zug, i = this.iJetzt, L = this.D.ziele(i); Z.nZug++; let gleis = Z.nZug % 2 ? -1 : 1, ziel = -1;
    if (!L.length) { Z.phase = 'keine'; return; }
    if (Z.bord) { gleis = Z.gleis; const prev = this.prev, l0 = this.linieJetzt; const N = L.filter(x => x !== prev), m = N.filter(x => this.D.s(x)[4].includes(l0)); ziel = (m[0] ?? N[0]) ?? prev; }
    else { const P = this.prev >= 0 && L.includes(this.prev) ? this.prev : null, A = L.filter(x => x !== P); if (gleis === 1 && P !== null) ziel = P; else if (gleis === -1 || P !== null) ziel = A[(Z.nZug >> 1) % Math.max(1, A.length)] ?? P; else ziel = A[((Z.nZug >> 1) + 1) % A.length] ?? A[0]; }
    Z.gleis = gleis; Z.dir = gleis < 0 ? 1 : -1; Z.ziel = ziel; Z.linie = this.D.gemeinsam(i, ziel); if (Z.linie < 0) Z.linie = this.D.s(i)[4][0] ?? -1; const R = this.D.reihe(i, ziel, Z.linie); Z.richtung = this.D.s(R[R.length - 1])[2]; Z.farbe = this.D.farbe(Z.linie, this.D.s(i)[3]); this.zugFarbe(Z.farbe);
    const zt = this.zugTeile, g = zt.zlt.getContext('2d'); g.fillStyle = '#060606'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#ffc940'; anpassen(g, `${this.D.kurz(Z.linie)} ${Z.richtung}`, 490, 42, '700'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${this.D.kurz(Z.linie)} ${Z.richtung}`, 256, 34); zt.zTex.needsUpdate = true;
  }
  zugFarbe(f) { const c = new THREE.Color(f); this.zugTeile.mats.streifen.uniforms.uFarbe.value.copy(c); }
  // Takt: Physik des Zugs, Türen, Fahrt zwischen den Stationen
  zugTick(dt) {
    const Z = this.zug, G = this.zugTeile.gruppe; Z.t -= dt; const F = this.figur;
    if (Z.phase === 'pause' && Z.t <= 0) { this.zugPlanen(); if (Z.phase === 'keine') return; Z.phase = 'ein'; Z.s = -Z.dir * 340; Z.v = VMAX * 0.8; Z.an = true; G.visible = true; G.position.x = Z.gleis * TX; this.zugTeile.tuerSetzen(Z.gleis > 0 ? -1 : 1, 0); this.fahrgaesteStellen(); }
    if (Z.phase === 'ein') { const rest = Math.abs(Z.s), vz = Math.min(VMAX, Math.sqrt(2 * ABR * Math.max(rest, 0.01))); Z.v += kl(vz - Z.v, -ABR * 2 * dt, ANF * dt); Z.s += Z.dir * Z.v * dt; if (rest < 0.03 || Math.sign(Z.s) === Z.dir) { Z.s = 0; Z.v = 0; Z.phase = 'halt'; Z.t = this.prevAussteigen ? 16 : 18; this.gong(); this.leuteZugDa(); } }
    if (Z.phase === 'halt') { const zu = Z.t < 2.2; Z.tuerOffen = kl(Z.tuerOffen + (zu ? -1 : 1) * dt / 1.5, 0, 1); this.zugTeile.tuerSetzen(Z.gleis > 0 ? -1 : 1, THREE.MathUtils.smoothstep(Z.tuerOffen, 0, 1)); if (Z.t < 2.3 && !Z.warn) { Z.warn = true; this.piep(); this.melde('Bitte einsteigen. Türen schließen', 2.5); } if (Z.t < 0.9 && F) this.spaltPruefen(); if (Z.t <= 0) { Z.warn = false; Z.tuerOffen = 0; this.zugTeile.tuerSetzen(Z.gleis > 0 ? -1 : 1, 0); this.abfahren(); } }
    if (Z.phase === 'aus') { Z.v = Math.min(VMAX, Z.v + ANF * dt); Z.s += Z.dir * Z.v * dt; if (Math.abs(Z.s) > 360) { Z.phase = 'pause'; Z.t = 7 + Math.random() * 7; Z.an = false; G.visible = false; Z.s = -9999; } }
    if (Z.phase === 'fahrt') this.fahrtTick(dt);
    // Rahmen: fährt man mit, steht der Zug
    const st = this.station; if (Z.bord) { G.position.set(Z.gleis * TX, 0, 0); if (st) st.gruppe.position.z = -Z.s; if (this.naechste) this.naechste.gruppe.position.z = Z.dir * Z.D - Z.s; } else { G.position.set(Z.gleis * TX, 0, Z.s); if (st) st.gruppe.position.z = 0; }
    this.tunnelSetzen();
    const dHoer = Z.bord ? 40 : Math.abs(Z.s) + 8; if (Z.an && this.ton?.zug) this.ton.zug(dHoer, Math.abs(Z.v), dt); else if (this.ton?.zug) this.ton.zug(9999, 0, dt);
  }
  // Abfahrt: fährt die Figur mit, wird aus dem Halt eine Fahrt zur nächsten Station
  abfahren() {
    const Z = this.zug, F = this.figur, imZug = F && Math.abs(F.pos.x - Z.gleis * TX) <= ZI + 0.02;
    if (imZug) { Z.bord = true; Z.phase = 'fahrt'; const d = this.D.weg(this.iJetzt, Z.ziel); Z.dReal = d; Z.D = kl(d * 0.55, 320, 980); Z.s = 0; Z.vonI = this.iJetzt; Z.v = 0; Z.neuGebaut = false; this.melde(`Nächster Halt: ${this.D.s(Z.ziel)[2]}`, 5); this.leuteWeg(); this.planHud(); }
    else { Z.phase = 'aus'; Z.v = 0; }
  }
  fahrtTick(dt) {
    const Z = this.zug, rest = Z.D - Math.abs(Z.s), vz = Math.min(VMAX, Math.sqrt(2 * ABR * Math.max(rest, 0.01))); Z.v += kl(vz - Z.v, -ABR * 2 * dt, ANF * dt); Z.s += Z.dir * Z.v * dt;
    // Lage auf der Erde wandert mit (Karte, Laden des Ortes am Ziel)
    const A = this.D.s(Z.vonI), Bb = this.D.s(Z.ziel), k = kl(Math.abs(Z.s) / Z.D, 0, 1); this.schiff.lat = A[0] + (Bb[0] - A[0]) * k; this.schiff.lon = A[1] + (Bb[1] - A[1]) * k;
    if (!Z.neuGebaut && rest < 420) { Z.neuGebaut = true; this.naechste = bahnhofBauen(this.D, Z.ziel, this.farbeVon(Z.ziel), { mobil: this.mobil }); this.naechste.gruppe.position.z = Z.dir * Z.D - Z.s; this.szene.add(this.naechste.gruppe); this.melde(`Nächster Halt: ${Bb[2]}`, 6); }
    if (this.station && Math.abs(Z.s) > HL + ZL / 2 + 60) { this.szene.remove(this.station.gruppe); this.station.entsorgen(); this.station = null; }
    if (rest < 0.03) {   // Ankunft
      if (this.station) { this.szene.remove(this.station.gruppe); this.station.entsorgen(); } this.station = this.naechste; this.naechste = null; this.station.gruppe.position.z = 0; this.prev = Z.vonI; this.iJetzt = Z.ziel; Z.s = 0; Z.v = 0; this.schiff.lat = Bb[0]; this.schiff.lon = Bb[1]; this.linieJetzt = Z.linie >= 0 ? Z.linie : (Bb[4][0] ?? -1);
      Z.phase = 'halt'; Z.t = 18; Z.tuerOffen = 0; this.gong(); this.melde(`${Bb[2]}. Ausstieg links`, 5); const eb = Z.nZug; this.zugPlanen(); Z.nZug = eb; this.planHud(); this.leuteStart(); this.bordAus = true;
    }
  }
  // Wer beim Schließen in der Tür steht, wird in den Zug geschoben
  spaltPruefen() { const F = this.figur, Z = this.zug, x = Math.abs(F.pos.x); if (x > PB - 0.1 && x < TX - ZI + 0.1) { F.pos.x = Math.sign(F.pos.x) * (TX - ZI + 0.32); F.bildSetzen(); } }
  gong() { const T = this.ton; if (T?.ton && T.an) { T.ton(660, 660, 0.05, 0.5, 'sine'); T.ton(528, 528, 0.05, 0.7, 'sine', 0.42); } }
  piep() { const T = this.ton; if (T?.ton && T.an) for (let i = 0; i < 4; i++) T.ton(1046, 1046, 0.022, 0.14, 'square', i * 0.32); }
  tunnelSetzen() {
    const Z = this.zug, T = this.tunnel, LS = T.LS, m = T.mesh; let n = 0; const setze = (x, z) => { if (n >= 90) return; _m.makeTranslation(x, 0, z); m.setMatrixAt(n++, _m); };
    if (Z.bord) { const x = Z.gleis * TX, off = ((Z.s % LS) + LS) % LS; for (let k = -22; k <= 22; k++) { const z = k * LS - off; const inA = this.station && Math.abs(z + Z.s) < HL + LS / 2 - 0.1, inB = this.naechste && Math.abs(z + Z.s - Z.dir * Z.D) < HL + LS / 2 - 0.1; if (!inA && !inB) setze(x, z); } }
    else for (const q of [-1, 1]) for (const s of [-1, 1]) for (let k = 0; k < 5; k++) setze(q * TX, s * (HL + LS / 2 + k * LS));
    m.count = n; m.instanceMatrix.needsUpdate = true;
  }
  // Tafeln am Bahnsteig, Anzeige im Wagen, Oberfläche
  anzeigen() {
    const Z = this.zug, st = this.station; if (st?.tafel) { const g = st.tafel.getContext('2d'), w = 768, h = 128; g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb82e'; g.textBaseline = 'middle'; g.textAlign = 'left'; let t = '', re = ''; if (Z.phase === 'pause') { t = 'Nächster Zug'; re = `${Math.max(1, Math.ceil(Z.t + 18))} s`; } else if (Z.phase === 'ein') { t = `${this.D.kurz(Z.linie)} ${Z.richtung}`; re = `${Math.ceil(Math.abs(Z.s) / Math.max(Z.v, 6))} s`; } else if (Z.phase === 'halt') { t = `${this.D.kurz(Z.linie)} ${Z.richtung}`; re = 'jetzt'; } else t = 'Bitte zurücktreten'; anpassen(g, t, 560, 62, '700'); g.fillText(t, 22, h / 2 + 3); g.textAlign = 'right'; g.font = '700 62px system-ui, sans-serif'; g.fillText(re, w - 22, h / 2 + 3); st.tTex.needsUpdate = true; }
    const zt = this.zugTeile, g = zt.anz.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 64); g.fillStyle = '#ff9a2e'; g.textBaseline = 'middle'; g.textAlign = 'center'; const tx = Z.phase === 'fahrt' ? `Nächster Halt: ${this.D.s(Z.ziel)[2]}` : Z.phase === 'halt' ? this.D.s(this.iJetzt)[2] : `${this.D.kurz(Z.linie)} ${Z.richtung}`; anpassen(g, tx, 490, 40, '700'); g.fillText(tx, 256, 33); zt.aTex.needsUpdate = true;
    // Oberfläche
    let a = this.D.s(this.iJetzt)[2], b = ''; if (Z.phase === 'fahrt') { a = `Nächster Halt: ${this.D.s(Z.ziel)[2]}`; b = `${this.D.kurz(Z.linie)} Richtung ${Z.richtung} · noch ${Math.ceil((Z.D - Math.abs(Z.s)) / Math.max(Z.v, 8))} s`; } else if (Z.phase === 'halt') { b = `${this.D.kurz(Z.linie)} Richtung ${Z.richtung} · Türen offen · Abfahrt in ${Math.ceil(Z.t)} s`; } else if (Z.phase === 'ein') { b = `${this.D.kurz(Z.linie)} Richtung ${Z.richtung} fährt ein`; } else if (Z.phase === 'pause') { b = `Nächster Zug in ${Math.ceil(Z.t + 18)} s`; } else if (Z.phase === 'aus') b = 'Zug fährt ab'; else if (Z.phase === 'keine') b = 'Hier fährt gerade nichts. Zum Ausgang'; if (this.elA.textContent !== a) this.elA.textContent = a; if (this.elB.textContent !== b) this.elB.textContent = b;
  }
  planHud() { const i = this.iJetzt, Z = this.zug, p = this.elPlan; if (!p) return; const zi = Z.bord && Z.ziel >= 0 ? Z.ziel : null, L = zi !== null ? Z.linie : (this.linieJetzt ?? this.D.s(i)[4][0] ?? -1), S0 = this.D.linienStueck(i, L, this.mobil ? 2 : 3), m0 = S0.indexOf(i), R = S0.slice(Math.max(0, m0 - (this.mobil ? 1 : 2)), m0 + (this.mobil ? 2 : 5)), f = this.D.farbe(L, this.D.s(i)[3]); p.innerHTML = `<i style="background:${f}"></i>` + R.map(s => `<span class="${s === i ? 'jetzt' : ''}"><b style="border-color:${f}${s === i ? `;background:${f}` : ''}"></b><em>${this.D.s(s)[2]}</em></span>`).join(''); }
  bauHud() {
    if (this.el || typeof document === 'undefined') return; const s = document.createElement('style'); s.textContent = '#ubahud{position:fixed;left:50%;top:62px;transform:translateX(-50%);z-index:40;display:none;text-align:center;color:#fff;font:600 15px/1.3 system-ui,sans-serif;text-shadow:0 1px 5px #000c;pointer-events:none;max-width:92vw}#ubahud .ua{font-size:19px;font-weight:700}#ubahud .ub{font-weight:500;font-size:13px;opacity:.92;margin-top:2px}#ubahud .uh{margin-top:9px;font-size:14px;background:#0009;display:inline-block;padding:5px 11px;border-radius:9px;opacity:0;transition:opacity .2s}#uplan{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:39;display:none;gap:0;align-items:flex-start;pointer-events:none;background:#0a0d12c9;padding:9px 16px 7px;border-radius:14px;max-width:min(94vw,880px);overflow:hidden}#uplan>i{position:absolute;left:18px;right:18px;top:15px;height:4px}#uplan span{position:relative;display:flex;flex-direction:column;align-items:center;width:112px;color:#d9dde2;font:500 11.5px/1.15 system-ui,sans-serif;text-align:center}#uplan span b{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #fff;margin-bottom:5px;box-sizing:border-box}#uplan span em{font-style:normal;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;padding:0 3px}#uplan span.jetzt{color:#fff;font-weight:700}#uplan span.jetzt b{width:15px;height:15px;margin-top:-1px}@media (max-width:820px){#ubahud{top:150px}#uplan span{width:96px;font-size:10px}#uplan{bottom:calc(12px + env(safe-area-inset-bottom));padding:8px 8px 6px}}';
    document.head.appendChild(s); const el = this.el = document.createElement('div'); el.id = 'ubahud'; el.innerHTML = '<div class="ua"></div><div class="ub"></div><div class="uh"></div>'; document.body.appendChild(el); this.elA = el.children[0]; this.elB = el.children[1]; this.elH = el.children[2]; const p = this.elPlan = document.createElement('div'); p.id = 'uplan'; document.body.appendChild(p);
  }
  hud(an) { if (this.el) { this.el.style.display = an ? 'block' : 'none'; this.elPlan.style.display = an ? 'flex' : 'none'; } }
  melde(t, s = 3) { if (!this.elH) return; this.meldT = s; this.elH.textContent = t; this.elH.style.opacity = t ? 1 : 0; this.hinw = null; }
  hinweis(t) { if (this.meldT > 0 || this.hinw === t) return; this.hinw = t; this.elH.textContent = t; this.elH.style.opacity = t ? 1 : 0; }
  // Menschen am Bahnsteig und im Zug
  leuteWeg() { for (const p of this.leute) { p.f.obj.parent?.remove(p.f.obj); } this.leute.length = 0; }
  leuteStart() { this.leuteWeg(); if (!this.quellen?.length) return; this.leuteZiel = this.mobil ? 6 : 16; this.tLeute = 0.1; }
  leuteTick(dt) {
    if (this.leute.length < (this.leuteZiel || 0) && (this.tLeute -= dt) <= 0 && !this.zug.bord || (this.leute.length < (this.leuteZiel || 0) && this.zug.bord && this.zug.phase === 'halt' && (this.tLeute -= dt) <= 0)) { this.tLeute = 0.16; const q = this.quellen[Math.floor(Math.random() * this.quellen.length)], f = spawn(q, this.bewegungen); f.obj.traverse(o => { if (o.isMesh) o.frustumCulled = false; }); let x, z, n = 0; do { x = (Math.random() < 0.5 ? -1 : 1) * (1.0 + Math.random() * 2.4); z = -HL + 4 + Math.random() * (2 * HL - 8); n++; } while (n < 8 && z > TZ0 - 2 && z < MZ0 + 2 && Math.abs(x) < 2.2); const p = { f, x, z, ry: Math.abs(x) > 2 ? (x > 0 ? Math.PI / 2 : -Math.PI / 2) : Math.random() * 6.28, zu: 'steht', t: 3 + Math.random() * 16, vx: 0, vz: 0 }; f.obj.position.set(x, 0, z); f.obj.rotation.y = p.ry; f.play('stehen', 0); f.mixer.setTime(Math.random() * 3); this.station?.gruppe.add(f.obj); this.leute.push(p); }
    const Z = this.zug, kp = this.kamP; for (let i = this.leute.length - 1; i >= 0; i--) { const p = this.leute[i]; p.t -= dt;
      if (p.zu === 'steht' && p.t <= 0) { p.zu = 'geht'; const nz = kl(p.z + (Math.random() - 0.5) * 34, -HL + 3, HL - 3), nx = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2.2); p.zx = nx; p.zz = (nz > TZ0 - 2 && nz < MZ0 + 2) ? TZ0 - 4 : nz; p.f.play('gehen', 0.3); }
      if (p.zu === 'geht' || p.zu === 'einstieg') { const dx = p.zx - p.x, dz = p.zz - p.z, d = Math.hypot(dx, dz), v = 1.32 * dt; if (d < 0.2) { if (p.zu === 'einstieg') { p.f.obj.parent?.remove(p.f.obj); this.leute.splice(i, 1); continue; } p.zu = 'steht'; p.t = 4 + Math.random() * 14; p.f.play('stehen', 0.3); } else { p.x += dx / d * v; p.z += dz / d * v; p.ry = Math.atan2(dx, dz); p.f.obj.position.set(p.x, 0, p.z); p.f.obj.rotation.y = p.ry; } }
      if (Math.abs(p.z - (this.figur?.pos.z ?? 0)) < 60) p.f.mixer.update(dt);
    }
  }
  leuteZugDa() { const Z = this.zug; for (const p of this.leute) if (Math.random() < 0.4 && p.zu !== 'einstieg') { let bt = tuerZ[0], bd = 1e9; for (const t of tuerZ) { const d = Math.abs(t - p.z); if (d < bd) { bd = d; bt = t; } } if (bd < 26) { p.zu = 'einstieg'; p.zx = Z.gleis * (PB + 0.5); p.zz = bt; p.f.play('gehen', 0.3); } } this.tLeute = 2; }
  fahrgaesteStart() { for (const p of this.fahrgaeste) p.f.obj.parent?.remove(p.f.obj); this.fahrgaeste.length = 0; if (!this.quellen?.length) return; this.fahrgaesteZiel = this.mobil ? 4 : 11; }
  fahrgaesteStellen() {
    const H = this.zugTeile.hindernisse; while (this.fahrgaeste.length < (this.fahrgaesteZiel || 0)) { const q = this.quellen[Math.floor(Math.random() * this.quellen.length)], f = spawn(q, this.bewegungen); f.obj.traverse(o => { if (o.isMesh) o.frustumCulled = false; }); const b = H[Math.floor(Math.random() * H.length)], z = b[4] + 0.35 + Math.random() * Math.max(0.1, b[5] - b[4] - 0.7), s = b[6]; f.obj.position.set(s * (ZI - 0.32), 0.0, z); f.obj.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; aktionBereit(f, 'sitzen'); f.play(f.acts.sitzen ? 'sitzen' : 'stehen', 0); f.mixer.update(Math.random() * 2); this.zugTeile.gruppe.add(f.obj); this.fahrgaeste.push({ f }); }
  }
  // Eingaben
  tick(dt, { achse, rennen, springen, b, e, kamera }) {
    const F = this.figur; if (!F || !this.an) return; this.t += dt; if (this.meldT > 0 && (this.meldT -= dt) <= 0) { this.elH.style.opacity = 0; this.hinw = null; }
    if (b.x || b.y) { this.yaw -= b.x * 0.0045; this.pitch = kl(this.pitch + b.y * 0.0045, -0.6, 1.1); }
    if (b.rad) this.distZiel = kl(this.distZiel * (1 + b.rad * 0.0012), 1.2, 6);
    if (kamera) this.ersteP = !this.ersteP;
    this.zugTick(dt);
    if (this.sitzt) {   // Sitzen: Bewegung oder E steht auf
      if (Math.hypot(achse.x, achse.y) > 0.2 || e) { const si = this.sitzt; this.sitzt = null; F.pos.x = si.x0; F.pos.z = si.z0; F.pos.y = 0; F.boden = 0; F.bildSetzen(); F.clip = null; e = false; } else F.f.mixer.update(dt);
    } else F.update(dt, achse, this.yaw + Math.PI, rennen, false);
    this.leuteTick(dt); if ((this.tAnz = (this.tAnz || 0) - dt) < 0) { this.tAnz = 0.4; this.anzeigen(); }
    for (const q of this.fahrgaeste) if (Math.abs(q.f.obj.position.z - F.pos.z) < 30) q.f.mixer.update(dt);
    // Was kann man hier tun?
    const Z = this.zug; let nah = null; const px = F.pos.x, pz = F.pos.z;
    if (this.kol.ebene === 1 && pz > MZ1 - 4 && Math.abs(px) < 3.2) nah = { t: this.mobil ? 'Ein Aus: nach oben' : 'E: nach oben', tu: () => this.beiAusgang?.(this.iJetzt) };
    else if (!this.sitzt && Z.gleis && Math.abs(px - Z.gleis * TX) <= ZI + 0.02 && this.mitZugBegehbar()) { const zx = px - Z.gleis * TX; for (const h of this.zugTeile.hindernisse) if (Math.abs(zx - h[6] * ZI) < 1.05 && pz > h[4] - 0.3 && pz < h[5] + 0.3) { nah = { t: this.mobil ? 'Ein Aus: hinsetzen' : 'E: hinsetzen', tu: () => this.setzen(h) }; break; } }
    if (this.sitzt) nah = { t: this.mobil ? 'Stick: aufstehen' : 'W: aufstehen', tu: () => {} };
    this.nah = nah; this.hinweis(nah?.t || ''); if (e && nah) nah.tu();
    if (Z.phase === 'pause' && this.kol.ebene === 1 && !this.schonGesagt) { this.schonGesagt = true; this.melde('Treppe runter zum Bahnsteig', 5); }
  }
  setzen(h) { const F = this.figur, Z = this.zug; aktionBereit(F.f, 'sitzen'); const z = kl(F.pos.z, h[4] + 0.3, h[5] - 0.3), x = Z.gleis * TX + h[6] * (ZI - 0.32); this.sitzt = { x0: F.pos.x, z0: F.pos.z }; F.pos.set(x, 0, z); F.ry = h[6] > 0 ? -Math.PI / 2 : Math.PI / 2; F.bildSetzen(); F.obj.rotation.y = F.ry; F.f.play(F.f.acts.sitzen ? 'sitzen' : 'stehen', 0.2); F.clip = 'sitzen'; }
  // Kamera wie an Bord des Schiffs. Die Hauptkamera bleibt an der Lage auf der Erde, damit oben alles weiterlädt
  kameraSetzen(camera, dt) {
    const F = this.figur; if (!F || !this.an) return; if (this.kamera.aspect !== innerWidth / innerHeight) { this.kamera.aspect = innerWidth / innerHeight; this.kamera.updateProjectionMatrix(); }
    const pz = F.bildPos, im = this.mitZugBegehbar() && Math.abs(pz.x - this.zug.gleis * TX) <= ZI + 0.1, zx = pz.x + Math.cos(this.yaw) * (this.ersteP ? 0 : 0.3), zy = pz.y + (this.ersteP ? 1.6 : 1.45), zz = pz.z - Math.sin(this.yaw) * (this.ersteP ? 0 : 0.3), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); _o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.dist += (this.distZiel - this.dist) * (1 - Math.exp(-8 * dt)); let d = this.ersteP ? 0.02 : Math.min(this.dist, im ? 2.2 : 9); if (!this.ersteP) { const t = this.kol.sicht(zx, zz, zx + _o.x * d, zz + _o.z * d); if (t < 1) d = Math.max(0.05, d * t - 0.2); }
    const decke = im ? 2.16 : this.kol.ebene === 1 ? OY + OH - 0.2 : this.kol.aufTreppe(pz.x, pz.z) ? OY + OH - 0.3 : DECKE - 0.15; let cy = zy + _o.y * d; if (cy > decke) cy = decke; if (cy < pz.y + 0.25) cy = pz.y + 0.25;
    const cx = zx + _o.x * d, cz = zz + _o.z * d; if (Math.abs(cx) < TB + 0.1 && cz >= TZ0 - 0.1 && cz <= TZ1 + 0.1) { const yS = kl((cz - TZ0) / (TZ1 - TZ0), 0, 1) * OY + 0.55; if (cy < yS) cy = yS; }
    if (this.frisch) { this.kamP.set(cx, cy, cz); this.frisch = false; } else this.kamP.lerp(_a.set(cx, cy, cz), 1 - Math.exp(-dt * 20)); this.kamZ.set(zx, zy, zz);
    const nahFigur = this.kamP.distanceTo(this.kamZ) < 0.6; if (F.obj.visible === nahFigur) F.obj.visible = !nahFigur;
    this.kamera.position.copy(this.kamP); _b.copy(this.kamZ); if (this.ersteP || nahFigur) _b.copy(this.kamP).addScaledVector(_o, -1); this.kamera.lookAt(_b); this.kamera.updateMatrixWorld();
    // Licht und Glanz rechnen im Rahmen von Bahnhof und Zug
    const st = this.station; if (st) st.geteilt.uKam.value.copy(this.kamP).sub(st.gruppe.position); if (this.naechste) this.naechste.geteilt.uKam.value.copy(this.kamP).sub(this.naechste.gruppe.position); this.zugTeile.geteilt.uKam.value.copy(this.kamP).sub(this.zugTeile.gruppe.position);
    // Hauptkamera oben
    if (this.welt) { const b = this.bodenGeo(this.schiff.lat, this.schiff.lon); this.welt.geoZuLokal(this.schiff.lat, this.schiff.lon, b + 1.7, camera.position); camera.updateMatrixWorld(); }
  }
}
// Abgang im Ort: flaches Stück mit eingerechnetem Treppenschacht (Innenraum im Shader, der Boden des Ortes bleibt ganz)
const EG_VS = `varying vec3 vL; varying vec3 vK; void main() { vL = position; vK = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const EG_FS = `varying vec3 vL; varying vec3 vK; uniform vec2 uG; uniform vec3 uF; void main() { vec3 d = normalize(vL - vK), p = vL; float B = uG.x, T = uG.y, k = 3.0 / T; float t = 1e9; int was = 0;
  { float q = (d.x > 0.0 ? B - p.x : -B - p.x) / (abs(d.x) < 1e-4 ? 1e-4 : d.x); if (q > 0.0 && q < t) { t = q; was = 1; } }
  { float q = (T - p.z) / (abs(d.z) < 1e-4 ? 1e-4 : d.z); if (d.z > 0.0 && q < t) { t = q; was = 2; } }
  { float q = (-0.001 - p.z) / (abs(d.z) < 1e-4 ? -1e-4 : d.z); if (d.z < 0.0 && q < t) { t = q; was = 3; } }
  { float den = d.y + k * d.z; if (abs(den) > 1e-4) { float q = (-k * p.z - p.y) / den; if (q > 0.0 && q < t) { t = q; was = 4; } } }
  vec3 h = p + d * t; vec3 c; float tiefe = clamp(-h.y / 3.0, 0.0, 1.0);
  if (was == 4) { float st = fract(h.z / 0.3); c = mix(vec3(0.34), vec3(0.62), smoothstep(0.86, 0.9, st)) * (1.0 - tiefe * 0.25); }
  else if (was == 1 || was == 3) { vec2 q = was == 1 ? vec2(h.z, h.y) : vec2(h.x, h.y); float fu = step(0.92, fract(q.x / 0.3)) + step(0.9, fract(q.y / 0.15)); c = mix(vec3(0.74, 0.74, 0.7), vec3(0.3), clamp(fu, 0.0, 1.0)); if (h.y < -0.5 && h.y > -0.95) c = uF; }
  else { c = vec3(0.02, 0.022, 0.03); if (h.y < -1.4) c = vec3(0.7, 0.72, 0.68) * 1.6; }
  c *= 1.0 - tiefe * 0.62; gl_FragColor = vec4(c, 1.0); }`;
export function eingangBauen(name, farbe, buchstabe) {
  const G = new THREE.Group(), B0 = 1.35, T = 5.6, f = new THREE.Color(farbe), wand = new THREE.MeshStandardMaterial({ color: 0x8b8d90, roughness: 0.75 }), stahl = new THREE.MeshStandardMaterial({ color: 0x4d5155, roughness: 0.35, metalness: 0.7 });
  const pl = new THREE.PlaneGeometry(B0 * 2 + 0.02, T + 0.02).rotateX(-Math.PI / 2).translate(0, 0.16, T / 2), sch = new THREE.Mesh(pl, new THREE.ShaderMaterial({ vertexShader: EG_VS, fragmentShader: EG_FS, uniforms: { uG: { value: new THREE.Vector2(B0, T) }, uF: { value: f } } })); sch.renderOrder = 2; G.add(sch);
  const box = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; G.add(o); return o; };
  for (const q of [-1, 1]) { box(0.16, 0.4, T + 0.3, q * (B0 + 0.08), 0.2, T / 2, wand); box(0.04, 0.72, T, q * (B0 + 0.08), 0.76, T / 2, new THREE.MeshStandardMaterial({ color: 0xa8c4cf, roughness: 0.1, transparent: true, opacity: 0.3 })); box(0.07, 0.05, T + 0.3, q * (B0 + 0.08), 1.14, T / 2, stahl); for (let z = 0; z <= T; z += T / 3) box(0.05, 0.75, 0.05, q * (B0 + 0.08), 0.75, z, stahl); }
  box(B0 * 2 + 0.32, 0.4, 0.16, 0, 0.2, T + 0.08, wand); box(B0 * 2, 0.72, 0.04, 0, 0.76, T + 0.08, new THREE.MeshStandardMaterial({ color: 0xa8c4cf, roughness: 0.1, transparent: true, opacity: 0.3 })); box(B0 * 2 + 0.2, 0.05, 0.07, 0, 1.14, T + 0.08, stahl);
  // Säule mit Zeichen und Name
  box(0.14, 3.6, 0.14, -B0 - 0.5, 1.8, -0.2, stahl); const te = leinwand(256, 256, (g, w, h) => { g.fillStyle = farbe; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 190px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(buchstabe, w / 2, h / 2 + 12); }, false), kub = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.72), new THREE.MeshBasicMaterial({ map: te, color: new THREE.Color(1.25, 1.25, 1.25) })); kub.position.set(-B0 - 0.5, 3.82, -0.2); G.add(kub);
  const tn = leinwand(1024, 160, (g, w, h) => { g.fillStyle = '#10151c'; g.fillRect(0, 0, w, h); g.fillStyle = farbe; g.fillRect(0, h - 14, w, 14); g.fillStyle = '#fbfaf5'; g.textAlign = 'center'; g.textBaseline = 'middle'; anpassen(g, name, w - 50, 96); g.fillText(name, w / 2, h / 2 - 3); }, false), mNm = new THREE.MeshBasicMaterial({ map: tn }); doppel(G, mNm, 2.7, 0.42, 0.2, 2.2, -0.2, Math.PI); box(2.8, 0.05, 0.06, 0.2, 2.44, -0.2, stahl); box(0.06, 2.44, 0.06, 1.5, 1.22, -0.2, stahl);
  return G;
}
