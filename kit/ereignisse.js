// Weltgeschehen (06.11.2026, Wunsch Nr. 52: "Ich möchte auch richtige Ereignisse, Events, wenn die gerade live sind, dort auch sehen, wenn irgendwo Demonstrationen sind ... auch Kriege, die gerade stattfinden ... Durch dann auch die ganzen Militärbasen").
// Die GitHub Action legt alle 10 Minuten ereignisse.json auf den Zweig live (tools/live/holen.py): Erdbeben (USGS), Brände, Stürme, Vulkane (NASA EONET), Katastrophen (GDACS), Demonstrationen und gemeldete Kämpfe (GDELT, nur Art, Ort, Zeit, keine Namen).
// Kriege: laufende Konflikte aus der Erddatenbank (countries.json). Militärbasen: Wikidata (CC0), daten/heute/basen.json. Keine Opfer, keine Gewalt im Bild, der Spieler kämpft nicht. Zeichen auf der Kugel, Rauchsäulen in der Welt.
import { LOCALE } from './sprache.js';
import * as THREE from 'three';
import { geoZuSzene } from './erde.js';
import { SZENE_EREIGNIS } from './szenen.js';

const LIVE = 'https://raw.githubusercontent.com/nadercbz/earth-3d-game/live/', DATEN = new URL('../daten/heute/', import.meta.url), D2R = Math.PI / 180, kl = THREE.MathUtils.clamp;
// Reihenfolge = Platz im Bildatlas
const ARTEN = { demo: { i: 0, name: 'Demonstration', f: '#d9981f', q: 'The GDELT Project' }, kampf: { i: 1, name: 'Gemeldete Kämpfe', f: '#cf3a33', q: 'The GDELT Project' }, beben: { i: 2, name: 'Erdbeben', f: '#d9772a', q: 'USGS' }, brand: { i: 3, name: 'Großbrand', f: '#e2531f', q: 'NASA EONET' }, sturm: { i: 4, name: 'Sturm', f: '#3f8ddc', q: 'NASA EONET' }, vulkan: { i: 5, name: 'Vulkan', f: '#a83b26', q: 'NASA EONET' }, flut: { i: 6, name: 'Überschwemmung', f: '#2a74c4', q: 'GDACS' }, duerre: { i: 7, name: 'Dürre', f: '#b58f25', q: 'GDACS' }, krieg: { i: 8, name: 'Krieg', f: '#a50f1a', q: 'Erddatenbank des Spiels' }, basis: { i: 9, name: 'Militärbasis', f: '#5f6b3c', q: 'Wikidata, CC0' }, staub: { i: 10, name: 'Staubsturm', f: '#b0894f', q: 'NASA EONET' }, rutsch: { i: 11, name: 'Erdrutsch', f: '#7b6042', q: 'NASA EONET' } };
export const EREIGNIS_ARTEN = ARTEN;
const BASIS_ART = ['Militärbasis', 'Luftwaffenbasis', 'Marinebasis', 'Kaserne'];
// Wo die Kriege sind: ungefähre Mitte der Kämpfe je Eintrag in countries.json
const KRIEG_ORT = { RUS: [48.3, 37.6, 'Ostukraine'], ISR: [31.42, 34.36, 'Gazastreifen'], SDN: [14.5, 30.0, 'Sudan'], MMR: [21.5, 96.0, 'Myanmar'], COD: [-1.6, 29.1, 'Ostkongo'], MLI: [16.5, -2.0, 'Mali'], BFA: [13.2, -1.4, 'Burkina Faso'], NER: [14.8, 2.5, 'Niger'], SOM: [2.6, 45.0, 'Somalia'], NGA: [11.6, 13.4, 'Nordostnigeria'], HTI: [18.55, -72.33, 'Port-au-Prince'] };
// Rauch im Gemeldeten nur, wo wirklich gekämpft wird (Moskau, Kiew, Washington melden GDELT auch, weil dort darüber gesprochen wird)
const FRONT = [[46, 51.6, 31, 40.5], [31.15, 31.65, 34.15, 34.65], [10, 20, 22, 37], [17, 27, 92, 100], [-5, 3, 27, 31], [13, 20, -6, 3], [10, 16, -3, 5], [-2, 10, 41, 49], [10, 14, 11, 15.5]];
const anFront = (la, lo) => FRONT.some(b => la > b[0] && la < b[1] && lo > b[2] && lo < b[3]);

function atlasBauen() {
  const G = 128, N = 4, c = document.createElement('canvas'); c.width = G * N; c.height = G * 3; const g = c.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  const bild = (art, fn) => { const i = art.i, x = (i % N) * G + G / 2, y = Math.floor(i / N) * G + G / 2, r = G * 0.44; g.save(); g.translate(x, y); g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fillStyle = art.f; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke(); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 8; fn(r); g.restore(); };
  const stern = (r0, r1, n) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const w = i / (n * 2) * 6.2832 - 1.5708, q = i % 2 ? r1 : r0; g[i ? 'lineTo' : 'moveTo'](Math.cos(w) * q, Math.sin(w) * q); } g.closePath(); };
  bild(ARTEN.demo, r => { g.fillRect(-r * 0.46, -r * 0.62, r * 0.92, r * 0.6); g.fillRect(-r * 0.07, -r * 0.1, r * 0.14, r * 0.8); });   // Schild am Stab, leer: keine Parolen
  bild(ARTEN.kampf, r => { stern(r * 0.7, r * 0.3, 8); g.fill(); });
  bild(ARTEN.beben, r => { g.beginPath(); const P = [[-0.72, 0], [-0.42, 0], [-0.26, -0.48], [-0.06, 0.52], [0.14, -0.62], [0.32, 0.3], [0.44, 0], [0.72, 0]]; P.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0] * r, p[1] * r)); g.stroke(); });
  bild(ARTEN.brand, r => { g.beginPath(); g.moveTo(0, -r * 0.72); g.bezierCurveTo(r * 0.62, -r * 0.14, r * 0.58, r * 0.66, 0, r * 0.66); g.bezierCurveTo(-r * 0.58, r * 0.66, -r * 0.56, r * 0.06, -r * 0.2, -r * 0.2); g.bezierCurveTo(-r * 0.16, -r * 0.02, -r * 0.08, r * 0.02, -r * 0.02, -r * 0.1); g.bezierCurveTo(r * 0.04, -r * 0.3, -r * 0.02, -r * 0.5, 0, -r * 0.72); g.fill(); });
  bild(ARTEN.sturm, r => { g.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60, w = t * 9.5, q = r * (0.08 + t * 0.62); g[i ? 'lineTo' : 'moveTo'](Math.cos(w) * q, Math.sin(w) * q); } g.stroke(); });
  bild(ARTEN.vulkan, r => { g.beginPath(); g.moveTo(-r * 0.68, r * 0.55); g.lineTo(-r * 0.16, -r * 0.2); g.lineTo(r * 0.16, -r * 0.2); g.lineTo(r * 0.68, r * 0.55); g.closePath(); g.fill(); g.beginPath(); g.moveTo(0, -r * 0.3); g.quadraticCurveTo(r * 0.28, -r * 0.5, 0, -r * 0.72); g.stroke(); });
  bild(ARTEN.flut, r => { for (const y of [-0.34, 0.08, 0.5]) { g.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24, x = (t - 0.5) * 1.44 * r; g[i ? 'lineTo' : 'moveTo'](x, y * r + Math.sin(t * 12.5) * r * 0.1); } g.stroke(); } });
  bild(ARTEN.duerre, r => { g.beginPath(); g.arc(0, 0, r * 0.3, 0, 6.2832); g.fill(); for (let i = 0; i < 8; i++) { const w = i / 8 * 6.2832; g.beginPath(); g.moveTo(Math.cos(w) * r * 0.44, Math.sin(w) * r * 0.44); g.lineTo(Math.cos(w) * r * 0.7, Math.sin(w) * r * 0.7); g.stroke(); } });
  bild(ARTEN.krieg, r => { stern(r * 0.78, r * 0.34, 6); g.fill(); g.fillStyle = ARTEN.krieg.f; g.beginPath(); g.arc(0, 0, r * 0.2, 0, 6.2832); g.fill(); });
  bild(ARTEN.basis, r => { g.lineWidth = 11; for (const y of [-0.1, 0.32]) { g.beginPath(); g.moveTo(-r * 0.5, y * r + r * 0.12); g.lineTo(0, y * r - r * 0.26); g.lineTo(r * 0.5, y * r + r * 0.12); g.stroke(); } });
  bild(ARTEN.staub, r => { for (const [y, l] of [[-0.36, 0.5], [-0.08, 0.68], [0.2, 0.4], [0.48, 0.56]]) { g.beginPath(); g.moveTo(-l * r, y * r); g.lineTo(l * r, y * r); g.stroke(); } });
  bild(ARTEN.rutsch, r => { g.beginPath(); g.moveTo(-r * 0.66, r * 0.5); g.lineTo(-r * 0.4, -r * 0.5); g.lineTo(r * 0.66, r * 0.5); g.closePath(); g.fill(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; return t;
}

const _p = new THREE.Vector3(), _w = new THREE.Vector3(), _v = new THREE.Vector3();
const zeitText = s => s < 3600 ? `vor ${Math.max(1, Math.round(s / 60))} Min.` : s < 86400 * 2 ? `vor ${Math.round(s / 3600)} Std.` : `vor ${Math.round(s / 86400)} Tagen`;

export class Ereignisse {
  constructor(szene, { mobil = false } = {}) {
    SZENE_EREIGNIS.q = this; this.szene = szene; this.mobil = mobil; this.an = true; this.L = []; this.basen = []; this.kriege = []; this.t = 0; this.stand = 0; this.tH = 0; this.fehler = 0; this.zeit = { value: 0 };
    this.ecef = new THREE.Group(); this.ecef.name = 'weltgeschehen'; this.ecef.visible = false; szene.add(this.ecef);
    const geo = () => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; };
    const tex = atlasBauen(); this.uM = { tAtlas: { value: tex }, uPx: { value: 0.02 }, uA: { value: 1 }, uZeit: this.zeit };
    const mat = uni => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, uniforms: uni,
      vertexShader: `attribute vec3 aP; attribute vec4 aD; uniform float uPx, uZeit; varying vec2 vU, vQ; varying float vPuls, vAlpha;
        void main() { vec4 mv = modelViewMatrix * vec4(aP, 1.0); float gr = aD.y * (1.0 + aD.w * 0.9); mv.xy += position.xy * gr * uPx * (-mv.z); gl_Position = projectionMatrix * mv; vQ = position.xy * (1.0 + aD.w * 0.9) * 2.0; float i = aD.x; float q2 = 1.0 + aD.w * 0.9; vU = vec2((mod(i, 4.0) + position.x * q2 + 0.5) / 4.0, 1.0 - (floor(i / 4.0) + 0.5 - position.y * q2) / 3.0); vPuls = aD.w; vAlpha = aD.z; }`,
      fragmentShader: `uniform sampler2D tAtlas; uniform float uA, uZeit; varying vec2 vU, vQ; varying float vPuls, vAlpha;
        void main() { float r = length(vQ); vec4 c = r < 1.0 ? texture2D(tAtlas, vU) : vec4(0.0); float a = c.a; vec3 f = c.rgb;
          if (vPuls > 0.01) { float w = fract(uZeit * 0.45), ring = smoothstep(0.1, 0.0, abs(r - (0.9 + w * 0.95))) * (1.0 - w); f = mix(vec3(1.0, 0.9, 0.75), f, a); a = max(a, ring * vPuls); }
          if (a < 0.02) discard; gl_FragColor = vec4(f, a * uA * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const mesh = (cap, uni) => { const g = geo(), aP = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3), aD = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); g.setAttribute('aP', aP); g.setAttribute('aD', aD); g.instanceCount = 0; const m = new THREE.Mesh(g, mat(uni)); m.frustumCulled = false; m.renderOrder = 4; m.G = g; m.aP = aP; m.aD = aD; this.ecef.add(m); return m; };
    this.marken = mesh(2000, this.uM); this.uB = { tAtlas: this.uM.tAtlas, uPx: { value: 0.012 }, uA: { value: 0 }, uZeit: this.zeit }; this.basenM = mesh(7000, this.uB);
    this.daten();
    // Rauchsäulen: Billboards um die Hochachse, Rauch aus Rauschen im Shader
    this.saeulen = []; this.uS = { uZeit: this.zeit, uSonne: { value: new THREE.Vector3(0, 1, 0) }, uTag: { value: 1 }, uNacht: { value: 0 } }; const N = 12, sg = geo(); this.saeuleP = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); this.saeuleD = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.saeuleUp = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); for (const a of [this.saeuleP, this.saeuleD, this.saeuleUp]) a.setUsage(THREE.DynamicDrawUsage); sg.setAttribute('aP', this.saeuleP); sg.setAttribute('aD', this.saeuleD); sg.setAttribute('aUp', this.saeuleUp); sg.instanceCount = 0;
    this.rauch = new THREE.Mesh(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: this.uS,
      vertexShader: `attribute vec3 aP, aUp; attribute vec4 aD; varying vec2 vQ; varying vec4 vD; varying vec3 vL; uniform vec3 uSonne;
        void main() { vec3 up = aUp, z = normalize(cameraPosition - aP), r = normalize(cross(up, z)); vec2 q = position.xy + vec2(0.0, 0.5); float h = aD.x, br = aD.y; vec3 w = aP + r * q.x * br + up * q.y * h; vQ = q; vD = aD; vL = vec3(dot(r, uSonne), dot(up, uSonne), 0.0); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform float uZeit, uTag, uNacht; varying vec2 vQ; varying vec4 vD; varying vec3 vL;
        float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = 0.0; for (int z = 0; z < 2; z++) { float x0 = fract(sin(dot(i + vec3(0.0, 0.0, float(z)), vec3(127.1, 311.7, 74.7))) * 43758.5453), x1 = fract(sin(dot(i + vec3(1.0, 0.0, float(z)), vec3(127.1, 311.7, 74.7))) * 43758.5453), x2 = fract(sin(dot(i + vec3(0.0, 1.0, float(z)), vec3(127.1, 311.7, 74.7))) * 43758.5453), x3 = fract(sin(dot(i + vec3(1.0, 1.0, float(z)), vec3(127.1, 311.7, 74.7))) * 43758.5453); float v = mix(mix(x0, x1, f.x), mix(x2, x3, f.x), f.y); a = z == 0 ? v : mix(a, v, f.z); } return a; }
        float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
        void main() { float y = vQ.y, sp = vD.z; vec2 q = vec2(vQ.x, y); float wind = y * y * 0.34; q.x -= wind; float t = uZeit * 0.05 + sp; float br = 0.05 + 0.3 * pow(y, 0.72); float d = abs(q.x) / br; vec3 P = vec3(q.x * 6.0, y * 6.5 - t * 3.2, sp * 7.0);
          float n = fbm(P), n2 = fbm(P * 2.6 + 4.0); float kante = 1.0 - smoothstep(0.32 + n * 0.7, 1.05 + n * 0.25, d); float dicht = kante * smoothstep(0.0, 0.015, y) * (1.0 - smoothstep(0.62, 1.0, y)) * smoothstep(0.22, 0.62, n + 0.28);
          if (dicht < 0.01) discard; float licht = 0.5 + 0.5 * clamp(vL.x * (q.x / br) + vL.y * 0.6, -1.0, 1.0), grau = mix(0.05, 0.42, smoothstep(0.0, 0.7, y)) * (0.6 + 0.8 * n2); vec3 c = vec3(grau) * (0.25 + 1.5 * licht * uTag) + vec3(0.03, 0.035, 0.05) * (1.0 - uTag);
          float glut = vD.w * smoothstep(0.075, 0.0, y) * kante; c += vec3(2.6, 0.9, 0.18) * glut * (0.5 + n2) * (0.5 + 1.2 * uNacht); gl_FragColor = vec4(c, dicht * 0.92);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` })); this.rauch.frustumCulled = false; this.rauch.renderOrder = 2; this.rauch.visible = false; this.rauch.name = 'rauchsäulen'; szene.add(this.rauch);
  }
  async daten() {
    try { const d = await (await fetch(new URL('countries.json', DATEN))).json(), K = d.conflicts || []; this.kriege = K.map(k => { const o = KRIEG_ORT[k.a]; return o ? { a: 'krieg', la: o[0], lo: o[1], o: o[2], text: k.de, seit: k.since } : null; }).filter(Boolean); } catch (e) { /* ohne Kriege */ }
    try { this.basen = await (await fetch(new URL('basen.json', DATEN))).json(); this.basenZeichnen(); } catch (e) { /* ohne Basen */ }
    this.markenZeichnen();
  }
  async holen() {
    try { const r = await fetch(LIVE + 'ereignisse.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); const d = await r.json(); const jetzt = Date.now() / 1000; this.L = (d.e || []).filter(e => ARTEN[e.a] && (e.a === 'demo' ? e.n >= 3 : e.a === 'kampf' ? e.n >= 6 : true) && !(e.a === 'beben' && jetzt - e.t > 7 * 86400)); this.stand = d.t; this.fehler = 0; this.markenZeichnen(); } catch (e) { this.fehler++; }
  }
  alle() { return [...this.kriege, ...this.L]; }
  // Für kit/szenen.js: eine gemeldete Demonstration nahe dieser Stelle (Nachrichten nennen nur die Stadt, darum 3,5 km und die Stadtmitte)
  demoBei(la, lo) { const c = Math.cos(la * D2R); for (const e of this.L) if (e.a === 'demo' && Math.hypot((e.la - la) * 111, (e.lo - lo) * 111 * c) < 3.5) return e; return null; }
  markenZeichnen() {
    const A = this.alle(), M = this.marken, P = M.aP.array, D = M.aD.array, jetzt = Date.now() / 1000; let n = 0;
    for (const e of A) { if (n >= M.aP.count) break; geoZuSzene(e.la, e.lo, 200, _p); const j = n * 3, k = n * 4, alt = jetzt - (e.t || jetzt), mag = e.a === 'beben' ? kl((e.m - 4) * 0.5, 0, 1.6) : e.a === 'krieg' ? 1.4 : e.a === 'demo' || e.a === 'kampf' ? kl(Math.log10(e.n || 1) * 0.5, 0, 1) : e.stufe === 'Red' ? 1 : 0.5; P[j] = _p.x; P[j + 1] = _p.y; P[j + 2] = _p.z; D[k] = ARTEN[e.a].i; D[k + 1] = 0.72 + mag * 0.34; D[k + 2] = e.a === 'krieg' ? 1 : kl(1.05 - alt / (e.a === 'beben' ? 8 * 86400 : 30 * 86400), 0.55, 1); D[k + 3] = e.a === 'krieg' || (alt < 86400 && e.a !== 'duerre') ? 1 : 0; e.nr = n; n++; }
    M.G.instanceCount = n; M.aP.needsUpdate = true; M.aD.needsUpdate = true; this.saeulenWahl = null;
  }
  basenZeichnen() { const M = this.basenM, P = M.aP.array, D = M.aD.array; let n = 0; for (const b of this.basen) { if (n >= M.aP.count) break; geoZuSzene(b[0], b[1], 150, _p); const j = n * 3, k = n * 4; P[j] = _p.x; P[j + 1] = _p.y; P[j + 2] = _p.z; D[k] = ARTEN.basis.i; D[k + 1] = b[2] === 3 ? 0.68 : 0.9; D[k + 2] = 1; D[k + 3] = 0; n++; } M.G.instanceCount = n; M.aP.needsUpdate = true; M.aD.needsUpdate = true; }
  zeigen(an) { this.ecef.visible = an && this.an; if (!an) this.rauch.visible = false; }
  update(dt, { camera, welt: W, blick, hA, sonne, nacht = 0, tag = 1, boden, an = true }) {
    const sicht = an && this.an; if (!sicht) { this.zeigen(false); return; } this.zeit.value += dt;
    if ((this.tH -= dt) <= 0) { this.tH = this.fehler ? Math.min(900, 120 * (1 + this.fehler)) : 300; this.holen(); }
    this.ecef.visible = true; this.ecef.quaternion.copy(W.zuLokal); this.ecef.position.copy(W.ursprung).negate().applyQuaternion(W.zuLokal); this.ecef.updateMatrixWorld(true);
    const lh = Math.log10(Math.max(hA, 100)), H = innerHeight || 800, ta = 2 * Math.tan(camera.fov * 0.5 * D2R) / H, kl2 = this.mobil ? 1.25 : 1;
    this.uM.uPx.value = ta * kl(30 - (lh - 4) * 4.4, 15, 30) * kl2; this.uM.uA.value = THREE.MathUtils.smoothstep(hA, 2500, 9000);
    this.uB.uPx.value = ta * 15 * kl2; this.uB.uA.value = THREE.MathUtils.smoothstep(hA, 2500, 9000) * (1 - THREE.MathUtils.smoothstep(hA, 1500000, 3500000));
    this.marken.visible = this.uM.uA.value > 0.002; this.basenM.visible = this.uB.uA.value > 0.002;   // unsichtbare Marken nicht zeichnen (Nr. 87)
    this.saeulenZeichnen(dt, W, blick, hA, sonne, nacht, tag, boden, camera);
  }
  // Nah: Rauch über gemeldeten Bränden, Vulkanen und an der Front. Die Säule steht, auch wenn man aus 200 km kommt
  saeulenZeichnen(dt, W, blick, hA, sonne, nacht, tag, boden) {
    if (hA > 400000) { this.rauch.visible = false; return; }
    if ((this.tS = (this.tS ?? 0) - dt) <= 0 || !this.saeulenWahl) { this.tS = 3; const cl = Math.cos(blick.lat * D2R), L = []; for (const e of this.alle()) { if (!(e.a === 'brand' || e.a === 'vulkan' || ((e.a === 'kampf' || e.a === 'krieg') && anFront(e.la, e.lo)))) continue; const d = Math.hypot((e.la - blick.lat) * 111, (e.lo - blick.lon) * 111 * cl); if (d < 450) L.push([d, e]); } L.sort((a, b) => a[0] - b[0]); this.saeulenWahl = L.slice(0, this.mobil ? 6 : 12).map(x => x[1]); }
    const P = this.saeuleP, D = this.saeuleD, U = this.saeuleUp; let n = 0;
    for (const e of this.saeulenWahl) {
      // Mehrere Herde je Ereignis: fest aus dem Ort gewürfelt, nur der erste hat die volle Größe
      const sp = (Math.abs(e.la * 91.7 + e.lo * 13.3) % 1), acres = e.e === 'acres' ? e.m : 0, h = e.a === 'vulkan' ? 7000 : e.a === 'brand' ? kl(1400 + Math.sqrt(acres) * 32, 1400, 6000) : 1500, b = boden ? boden(e.la, e.lo) : 0; W.geoZuLokal(e.la, e.lo, b, _p); const up = _w.copy(geoZuSzene(e.la, e.lo, 0, _v)).normalize().applyQuaternion(W.zuLokal);
      P.setXYZ(n, _p.x, _p.y, _p.z); U.setXYZ(n, up.x, up.y, up.z); D.setXYZ(n, h, h * 0.92, sp * 40, e.a === 'kampf' || e.a === 'krieg' ? 0.5 : 1); n++;
    }
    this.rauch.geometry.instanceCount = n; P.needsUpdate = U.needsUpdate = D.needsUpdate = true; this.rauch.visible = n > 0; this.uS.uSonne.value.copy(sonne); this.uS.uTag.value = tag; this.uS.uNacht.value = nacht;
  }
  // ---------- Klick und Liste ----------
  treffer(nx, ny, camera, W, hA) {
    if (hA < 2500) return null; const asp = camera.aspect, grenze = this.mobil ? 0.07 : 0.035; let beste = null, bd = grenze; W.lokalZuWelt(camera.position, _w); const cw = _w.clone();
    const pr = (la, lo) => { geoZuSzene(la, lo, 150, _p); if (_p.dot(cw) < _p.lengthSq() - 1) return null; W.weltZuLokal(_p, _v).project(camera); if (_v.z > 1 || _v.z < -1) return null; return Math.hypot((_v.x - nx) * asp, _v.y - ny); };
    for (const e of this.alle()) { const d = pr(e.la, e.lo); if (d !== null && d < bd) { bd = d; beste = { art: 'ereignis', e }; } }
    if (hA < 2500000) for (const b of this.basen) { const d = pr(b[0], b[1]); if (d !== null && d < bd * 0.8) { bd = d / 0.8; beste = { art: 'basis', b }; } }
    return beste;
  }
  info(t) {
    if (t.art === 'basis') { const b = t.b; return { art: 'Militärbasis', titel: b[3] || BASIS_ART[b[2]], status: 'Karte', text: 'Standort aus Wikidata. Das Spiel zeigt ihn wie jeden anderen Ort, hier passiert nichts.', zeilen: [['Art', BASIS_ART[b[2]]], ['Lage', `${b[0].toFixed(3).replace('.', ',')}°, ${b[1].toFixed(3).replace('.', ',')}°`]], quelle: ARTEN.basis.q, ziel: { lat: b[0], lon: b[1], dist: 6000, neigung: 50 } }; }
    const e = t.e, A = ARTEN[e.a], alt = Date.now() / 1000 - (e.t || 0), z = [['Ort', e.o]]; let text = '', titel = A.name;
    if (e.a === 'krieg') { titel = `Krieg: ${e.o}`; text = e.text; z.push(['Seit', String(e.seit).slice(0, 4)]); }
    else if (e.a === 'demo') { text = 'In den letzten 48 Stunden berichteten Nachrichten von einer Demonstration an diesem Ort. Automatisch aus Nachrichten gelesen, ungeprüft.'; z.push(['Artikel', e.n], ['Zuletzt gemeldet', zeitText(alt)]); }
    else if (e.a === 'kampf') { text = 'Nachrichten melden Kämpfe an diesem Ort oder sprechen von hier aus darüber. Automatisch aus Nachrichten gelesen, ungeprüft.'; z.push(['Artikel', e.n], ['Zuletzt gemeldet', zeitText(alt)]); }
    else if (e.a === 'beben') { titel = `Erdbeben, Stärke ${String(e.m).replace('.', ',')}`; text = 'Gemessen vom US Geological Survey.'; z.push(['Stärke', String(e.m).replace('.', ',')], ['Tiefe', `${e.tief} km`], ['Zeit', zeitText(alt)]); }
    else { if (/^prescribed/i.test(e.o)) titel = 'Kontrolliertes Feuer'; text = e.q === 'GDACS' ? `Warnstufe ${e.stufe === 'Red' ? 'Rot' : 'Orange'} des globalen Katastrophenwarnsystems.` : 'Von der NASA aus Satellitendaten und Meldungen erfasst.'; if (e.m) z.push(['Stärke', e.e === 'acres' ? `${Math.round(e.m * 0.4047).toLocaleString(LOCALE)} Hektar` : e.e === 'kts' ? `${Math.round(e.m * 1.852)} km/h Wind` : `${e.m} ${e.e || ''}`]); z.push(['Stand', zeitText(alt)]); }
    return { art: A.name, titel, status: e.a === 'krieg' ? 'Andauernd' : 'Live', text, zeilen: z, quelle: e.q || A.q, ziel: { lat: e.la, lon: e.lo, dist: e.a === 'beben' || e.a === 'duerre' || e.a === 'krieg' ? 90000 : e.a === 'sturm' ? 600000 : 7000, neigung: 55 } };
  }
  // für das Fenster Weltgeschehen: nach Art, Wichtigstes zuerst
  liste() { const G = new Map(); for (const e of this.alle()) { if (!G.has(e.a)) G.set(e.a, []); G.get(e.a).push(e); } const wert = e => e.a === 'beben' ? e.m : e.n || e.t || 0, reihe = ['krieg', 'kampf', 'demo', 'sturm', 'brand', 'vulkan', 'flut', 'beben', 'duerre', 'staub', 'rutsch']; return reihe.filter(a => G.has(a)).map(a => ({ a, name: ARTEN[a].name, farbe: ARTEN[a].f, n: G.get(a).length, L: G.get(a).sort((x, y) => wert(y) - wert(x)).slice(0, 8) })); }
  statusStand() { return this.stand ? zeitText(Date.now() / 1000 - this.stand) : ''; }
}
