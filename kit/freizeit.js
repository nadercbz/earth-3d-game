// Sport, Freizeit und Alltag aus den Kartendaten (06.11.2026, Nader: "alles, was in der echten Welt will ich da auch haben"): Sportplätze mit Linien, Toren und Flutlicht an den echten Plätzen, Spielplätze, Tankstellen, Ladesäulen, Campingplätze, Denkmäler, Brunnen, Telefonzellen, Schwimmbecken, Strandleben, Seilbahnen und Skilifte auf den echten Linien.
// Daten: daten.freizeit (kit/ortbau.js). Modelle: tools/blender/freizeit.py. Alles in echten Metern.
import * as THREE from 'three';
import { Stadien } from './stadion.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { technikMaterial } from './hafen.js';
import { monatJetzt } from './waldarten.js';

const BASIS = new URL('../assets/freizeit/', import.meta.url), _gl = new Map();
function entpacken(g, m) {
  const G = new THREE.BufferGeometry(), p = g.attributes.position, n = g.attributes.normal, P = new Float32Array(p.count * 3), N = n ? new Float32Array(n.count * 3) : null, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; if (N) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; } }
  G.setAttribute('position', new THREE.BufferAttribute(P, 3)); if (N) G.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  const c = g.attributes.color; if (c) { const C = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { C[i * 3] = c.getX(i); C[i * 3 + 1] = c.getY(i); C[i * 3 + 2] = c.getZ(i); } G.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
  if (g.index) G.setIndex(g.index.clone()); return G;
}
export function freizeitLaden(n) {
  if (_gl.has(n)) return _gl.get(n);
  const p = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL(n + '.glb', BASIS).href).then(g => { const t = {}; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) t[o.material.name] = entpacken(o.geometry, o.matrixWorld); }); return t; });
  _gl.set(n, p); return p;
}
const _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _Q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
const FARBEN = {
  roller: [[0.08, 0.62, 0.36], [0.88, 0.34, 0.06], [0.08, 0.36, 0.72], [0.1, 0.1, 0.12]], briefkasten: [[0.86, 0.66, 0.05], [0.08, 0.2, 0.58], [0.66, 0.08, 0.06]], kiosk: [[0.72, 0.14, 0.1], [0.1, 0.32, 0.56], [0.1, 0.42, 0.24], [0.8, 0.56, 0.06]], imbiss: [[0.8, 0.26, 0.08], [0.86, 0.84, 0.78], [0.1, 0.44, 0.5], [0.76, 0.56, 0.05]], werbetafel: [[0.72, 0.12, 0.1], [0.08, 0.24, 0.56], [0.08, 0.4, 0.3], [0.5, 0.12, 0.42], [0.12, 0.14, 0.18]],
  boot_liege: [[0.9, 0.9, 0.88], [0.84, 0.84, 0.82], [0.1, 0.2, 0.42], [0.6, 0.1, 0.08], [0.88, 0.86, 0.8], [0.06, 0.08, 0.1]],
  zelt: [[0.72, 0.28, 0.05], [0.05, 0.25, 0.55], [0.1, 0.42, 0.14], [0.78, 0.6, 0.05], [0.62, 0.08, 0.08], [0.6, 0.6, 0.58]], giebelzelt: [[0.5, 0.42, 0.26], [0.2, 0.3, 0.2], [0.68, 0.66, 0.6], [0.2, 0.32, 0.5]],
  schirm: [[0.75, 0.1, 0.08], [0.06, 0.28, 0.6], [0.85, 0.65, 0.05], [0.88, 0.87, 0.84], [0.08, 0.5, 0.4], [0.82, 0.32, 0.05]], liege: [[0.86, 0.86, 0.82], [0.1, 0.3, 0.6], [0.72, 0.2, 0.12], [0.1, 0.45, 0.42]],
  tankstelle: [[0.66, 0.06, 0.05], [0.06, 0.34, 0.16], [0.05, 0.16, 0.5], [0.8, 0.42, 0.03], [0.72, 0.6, 0.04]], wohnwagen: [[0.1, 0.3, 0.55], [0.55, 0.14, 0.1], [0.1, 0.4, 0.3], [0.45, 0.45, 0.45]], rettungsturm: [[0.65, 0.08, 0.05]],
  kabine: [[0.7, 0.08, 0.06], [0.05, 0.25, 0.55], [0.8, 0.62, 0.05]], gondel: [[0.08, 0.28, 0.6], [0.7, 0.1, 0.07], [0.1, 0.44, 0.26], [0.72, 0.72, 0.7]], sessel: [[0.08, 0.2, 0.5], [0.62, 0.08, 0.06], [0.2, 0.2, 0.22]],
};
const SCHATTEN = new Set(['kiosk', 'imbiss', 'litfass', 'werbetafel', 'wartehaeuschen', 'stromkasten', 'tankstelle', 'wohnwagen', 'zelt', 'giebelzelt', 'schirm', 'rettungsturm', 'klettern', 'denkmal', 'seilstation', 'seilmast', 'flutlicht', 'rutsche']);

// Bilder der Spielfelder
const _bild = new Map();
function feldBild(art) {
  if (_bild.has(art)) return _bild.get(art);
  const W = art === 'fussball' || art === 'bolz' ? 1024 : 512, H = art === 'fussball' || art === 'bolz' ? 664 : 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.lineCap = 'butt';
  if (art === 'fussball' || art === 'bolz') {
    const n = 12; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#4d7a33' : '#44702d'; g.fillRect(i / n * W, 0, W / n + 1, H); }
    for (let k = 0; k < 2600; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,50,18' : '120,140,70'},${0.05 + Math.random() * 0.07})`; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 7, 2 + Math.random() * 7); }
    g.fillStyle = 'rgba(120,105,60,0.16)'; for (const x of [W * 0.07, W * 0.93]) { g.beginPath(); g.ellipse(x, H / 2, W * 0.05, H * 0.13, 0, 0, 6.283); g.fill(); }
    g.strokeStyle = 'rgba(235,238,230,0.95)'; g.lineWidth = 3.4; const m = 16; g.strokeRect(m, m, W - 2 * m, H - 2 * m); g.beginPath(); g.moveTo(W / 2, m); g.lineTo(W / 2, H - m); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, H * 0.135, 0, 6.283); g.stroke(); g.fillStyle = 'rgba(235,238,230,0.95)'; g.beginPath(); g.arc(W / 2, H / 2, 3.4, 0, 6.283); g.fill();
    for (const s of [0, 1]) { const x0 = s ? W - m : m, d = s ? -1 : 1; g.strokeRect(s ? x0 - W * 0.157 : x0, H / 2 - H * 0.3, W * 0.157, H * 0.6); g.strokeRect(s ? x0 - W * 0.052 : x0, H / 2 - H * 0.135, W * 0.052, H * 0.27); g.beginPath(); g.arc(x0 + d * W * 0.105, H / 2, 3, 0, 6.283); g.fill(); g.beginPath(); g.arc(x0 + d * W * 0.105, H / 2, H * 0.135, s ? Math.PI - 0.92 + Math.PI : -0.92, s ? Math.PI + 0.92 + Math.PI : 0.92); g.stroke(); }
  } else if (art === 'tennis') {
    const f = ['#a8542e', '#35639a', '#3f7a4a'][Math.floor(Math.random() * 3)]; g.fillStyle = f; g.fillRect(0, 0, W, H); for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + Math.random() * 0.03})`; g.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
    g.strokeStyle = '#ece9e0'; g.lineWidth = 3; const mx = W * 0.14, my = H * 0.16, L = W - 2 * mx, B = H - 2 * my; g.strokeRect(mx, my, L, B); const e = B * 0.125; g.beginPath(); g.moveTo(mx, my + e); g.lineTo(mx + L, my + e); g.moveTo(mx, my + B - e); g.lineTo(mx + L, my + B - e); g.moveTo(mx + L * 0.23, my + e); g.lineTo(mx + L * 0.23, my + B - e); g.moveTo(mx + L * 0.77, my + e); g.lineTo(mx + L * 0.77, my + B - e); g.moveTo(mx + L * 0.23, H / 2); g.lineTo(mx + L * 0.77, H / 2); g.stroke();
  } else {
    g.fillStyle = '#7d4a33'; g.fillRect(0, 0, W, H); g.fillStyle = '#39577d'; g.fillRect(W * 0.04, H * 0.07, W * 0.92, H * 0.86); g.strokeStyle = '#ece9e0'; g.lineWidth = 3; const mx = W * 0.04, my = H * 0.07, L = W * 0.92, B = H * 0.86; g.strokeRect(mx, my, L, B); g.beginPath(); g.moveTo(W / 2, my); g.lineTo(W / 2, my + B); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, H * 0.14, 0, 6.283); g.stroke(); for (const s of [0, 1]) { const x0 = s ? mx + L : mx, d = s ? -1 : 1; g.strokeRect(s ? x0 - L * 0.2 : x0, H / 2 - H * 0.16, L * 0.2, H * 0.32); g.beginPath(); g.arc(x0, H / 2, L * 0.24, s ? Math.PI / 2 : -Math.PI / 2, s ? 3 * Math.PI / 2 : Math.PI / 2); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; _bild.set(art, t); return t;
}

export class Freizeit {
  constructor(ort, { mobil = false, flaeche = null, drapiere = null } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'freizeit'; this.D = ort.daten.freizeit; this.mats = []; this.teile = []; this.bahnen = []; this.tA = performance.now(); this.t = 0;
    const lat = ort.daten.meta?.lat ?? 50, mo = monatJetzt(), sommer = lat >= 0 ? mo >= 4 && mo <= 9 : mo <= 3 || mo >= 10, warm = Math.abs(lat) < 28 || (Math.abs(lat) < 46 && sommer);   // am Strand liegt nur jemand, wenn es warm ist
    this.warm = warm;
    this.felder(); this.deko(); this.pools(flaeche, drapiere); this.lifte();
    if (this.D.stadien?.length) { this.stadien = new Stadien(ort, this.D.stadien, { mobil, leuchte: ort.mats._extra?.leuchte }); this.gruppe.add(this.stadien.gruppe); }
  }
  felder() {
    const nach = new Map(), H = this.ort.H, D = this.D.plaetze; if (!D?.length) return;
    for (const f of D) { (nach.get(f.art) || nach.set(f.art, []).get(f.art)).push(f); }
    for (const [art, liste] of nach) {
      const pos = [], uv = [], idx = []; let v0 = 0;
      for (const f of liste) { const ux = Math.sin(f.ry), uz = Math.cos(f.ry), vx = -uz, vz = ux, Nu = 8, Nv = 6; for (let j = 0; j <= Nv; j++) for (let i = 0; i <= Nu; i++) { const a = (i / Nu - 0.5) * f.L, b = (j / Nv - 0.5) * f.B, x = f.x + ux * a + vx * b, z = f.z + uz * a + vz * b; pos.push(x, H(x, z) + 0.09, z); uv.push(i / Nu, j / Nv); } for (let j = 0; j < Nv; j++) for (let i = 0; i < Nu; i++) { const q = v0 + j * (Nu + 1) + i; idx.push(q, q + Nu + 1, q + 1, q + 1, q + Nu + 1, q + Nu + 2); } v0 += (Nu + 1) * (Nv + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.MeshStandardMaterial({ map: feldBild(art), roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }); this.mats.push(m); const me = new THREE.Mesh(g, m); me.receiveShadow = true; me.renderOrder = 1; this.gruppe.add(me); this.teile.push(g);
    }
    // Tore, Flutlicht, Netze
    const tore = [], licht = [], kurz = [];
    for (const f of D) { const ux = Math.sin(f.ry), uz = Math.cos(f.ry), vx = -uz, vz = ux; if (f.art === 'fussball' || f.art === 'bolz') { const k = f.art === 'bolz' ? 0.6 : 1, a = f.L / 2 - f.L * 0.0241; for (const s of [-1, 1]) tore.push([f.x + ux * s * a, f.z + uz * s * a, f.ry + (s > 0 ? Math.PI : 0), k]); if (f.art === 'fussball' && f.L > 88 && !f.imStadion && (Math.abs(f.x * 7 + f.z) % 3) < 2) for (const s of [-1, 1]) for (const q of [-0.32, 0.32]) licht.push([f.x + ux * q * f.L + vx * s * (f.B / 2 + 4), f.z + uz * q * f.L + vz * s * (f.B / 2 + 4), f.ry + (s > 0 ? -Math.PI / 2 : Math.PI / 2), 1]); }
      if (f.art === 'tennis') { kurz.push(f); } }
    this.instanzen('tor', tore); this.instanzen('flutlicht', licht);
    if (kurz.length) { const G = new THREE.BoxGeometry(1, 1, 1), mN = new THREE.MeshStandardMaterial({ color: 0xc8c8c0, transparent: true, opacity: 0.72, roughness: 0.8 }), me = new THREE.InstancedMesh(G, mN, kurz.length); kurz.forEach((f, i) => { _Q.setFromAxisAngle(_Y, f.ry); _p.set(f.x, this.ort.H(f.x, f.z) + 0.55, f.z); _s.set(f.B * 0.78, 0.92, 0.04); me.setMatrixAt(i, _M.compose(_p, _Q, _s)); }); _s.set(1, 1, 1); this.gruppe.add(me); this.mats.push(mN); this.teile.push(G); }
  }
  deko() {
    const nach = new Map(), D = this.D.deko; if (!D?.length) return; const strand = new Set(['schirm', 'liege']);
    for (const [x, z, typ, ry] of D) { if (strand.has(typ) && !this.warm) continue; (nach.get(typ) || nach.set(typ, []).get(typ)).push([x, z, ry, 1]); }
    for (const [typ, l] of nach) this.instanzen(typ, l);
  }
  // l: [x, z, drehung, maßstab] je Stück. Die Modelle schauen nach +z
  instanzen(typ, l) {
    if (!l.length) return; const H = this.ort.H, Mt = technikMaterial(), meta = this.ort.daten.meta, wasserY = (x, z) => meta?.amMeer && meta.meerY != null ? meta.meerY : (this.ort.Hboden || H)(x, z) - 0.25;
    freizeitLaden(typ).then(g => { if (this.weg) return; const F = FARBEN[typ]; for (const part in g) { const mat = Mt[part] || Mt.lack, me = new THREE.InstancedMesh(g[part], mat, l.length); l.forEach((q, i) => { _Q.setFromAxisAngle(_Y, q[2]); _p.set(q[0], typ === 'steg' || typ === 'boot_liege' ? wasserY(q[0], q[1]) : H(q[0], q[1]), q[1]); const k = q[3] || 1; _s.set(k, k, k); me.setMatrixAt(i, _M.compose(_p, _Q, _s)); if (part === 'farbe' && F) { const f = F[(Math.abs(Math.round(q[0] * 3 + q[1] * 7))) % F.length]; me.setColorAt(i, _c.setRGB(f[0], f[1], f[2])); } }); _s.set(1, 1, 1); me.computeBoundingSphere(); me.castShadow = SCHATTEN.has(typ) && part !== 'glas' && part !== 'licht' && !this.mobil; me.receiveShadow = true; this.gruppe.add(me); this.teile.push(me); } }).catch(e => console.warn('Freizeit', typ, e.message));
  }
  pools(flaeche, drapiere) {
    const P = this.D.pools; if (!P?.length || !flaeche) return;
    const H = this.ort.H; let g = flaeche(P, 0.09); if (drapiere && this.ort.mitGelaende) { g = drapiere(g, H); }
    const m = new THREE.MeshStandardMaterial({ color: 0x35b8c8, roughness: 0.06, metalness: 0.02, emissive: 0x062a30, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }); this.mats.push(m); const me = new THREE.Mesh(g, m); me.renderOrder = 2; this.gruppe.add(me); this.teile.push(g);
    // Beckenrand: heller Streifen um jedes Becken
    const pos = []; for (const poly of P) { const r = poly[0], n = r.length; let fa = 0; for (let i = 0, j = n - 1; i < n; j = i++) fa += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); const sg = fa > 0 ? 1 : -1; for (let i = 0; i < n; i++) { const a = r[i], b = r[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l * sg * 0.42, nz = -dx / l * sg * 0.42, y0 = H(a[0], a[1]) + 0.14, y1 = H(b[0], b[1]) + 0.14; pos.push(a[0], y0, a[1], a[0] + nx, y0, a[1] + nz, b[0], y1, b[1], b[0], y1, b[1], a[0] + nx, y0, a[1] + nz, b[0] + nx, y1, b[1] + nz); } }
    const gr = new THREE.BufferGeometry(); gr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gr.computeVertexNormals(); const mr = new THREE.MeshStandardMaterial({ color: 0xc9c6bc, roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -12 }); this.mats.push(mr); const mg = new THREE.Mesh(gr, mr); mg.renderOrder = 2; this.gruppe.add(mg); this.teile.push(gr);
  }
  lifte() {
    const L = this.D.lifte; if (!L?.length) return; const H = this.ort.H, halb = this.ort.halb, masten = [], stationen = [], seile = [], STA = { kabine: 340, gondel: 110, sessel: 62 }, HT = { kabine: 30, gondel: 19, sessel: 11 }, MASZ = { kabine: 1.4, gondel: 0.95, sessel: 0.6 };
    for (const l of L) {
      const p = l.p, s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); const G = s[s.length - 1]; if (G < 40) continue;
      const lage = t => { let i = 1; while (i < s.length - 1 && s[i] < t) i++; const u = (t - s[i - 1]) / Math.max(s[i] - s[i - 1], 0.01), x = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, z = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u, dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1], dl = Math.hypot(dx, dz) || 1; return { x, z, ux: dx / dl, uz: dz / dl }; };
      const naheRand = q => Math.abs(q[0]) > halb - 3 || Math.abs(q[1]) > halb - 3;
      const hA = naheRand(p[0]) ? null : H(p[0][0], p[0][1]), hE = naheRand(p[p.length - 1]) ? null : H(p[p.length - 1][0], p[p.length - 1][1]);
      // Stützen und Seilhöhe: an jeder Stütze Gelände plus Höhe, dazwischen gerade mit leichtem Durchhang
      const n = Math.max(1, Math.round(G / STA[l.art])), stuetzen = []; for (let i = 0; i <= n; i++) { const t = i / n * G, q = lage(t), hS = i === 0 || i === n ? 6.2 : HT[l.art]; stuetzen.push({ t, y: H(q.x, q.z) + hS, ...q, ende: i === 0 || i === n }); }
      // Seil darf nicht durch einen Hang schneiden: Stützen anheben
      for (let k = 0; k < 3; k++) for (let i = 0; i < n; i++) { const a = stuetzen[i], b = stuetzen[i + 1]; for (let u = 0.2; u < 0.9; u += 0.2) { const q = lage(a.t + (b.t - a.t) * u), yS = a.y + (b.y - a.y) * u - 4 * u * (1 - u) * (b.t - a.t) * 0.012, boden = H(q.x, q.z) + 9; if (yS < boden) { const d = boden - yS; if (!a.ende) a.y += d; if (!b.ende) b.y += d; } } }
      for (const q of stuetzen) { if (q.ende) { const r = q.t < 1 ? 0 : 1, naheR = naheRand(r ? p[p.length - 1] : p[0]); if (!naheR) stationen.push([q.x, q.z, Math.atan2(q.ux, q.uz) + (r ? 0 : Math.PI), 1]); } else masten.push({ x: q.x, z: q.z, ry: Math.atan2(-q.uz, q.ux), h: q.y - H(q.x, q.z), m: MASZ[l.art] }); }
      const hoehe = t => { let i = 0; while (i < n - 1 && stuetzen[i + 1].t < t) i++; const a = stuetzen[i], b = stuetzen[i + 1], u = (t - a.t) / Math.max(b.t - a.t, 0.01); return a.y + (b.y - a.y) * u - 4 * u * (1 - u) * (b.t - a.t) * 0.012; };
      const seite = { kabine: 3.1, gondel: 2.9, sessel: 2.2 }[l.art]; for (const sg of [-1, 1]) { const schritt = Math.max(14, G / 60); let t0 = 0, A = lage(0), y0 = hoehe(0); for (let t = schritt; ; t += schritt) { const t1 = Math.min(G, t), B = lage(t1), y1 = hoehe(t1); const nx = -B.uz, nz = B.ux; seile.push([A.x + nx * sg * seite, y0, A.z + nz * sg * seite, B.x + nx * sg * seite, y1, B.z + nz * sg * seite]); A = B; y0 = y1; t0 = t1; if (t1 >= G) break; } }
      // Kabinen: Pendelbahn zwei Stück, die sich begegnen; Umlaufbahn viele im Abstand
      const anzahl = l.art === 'kabine' ? 2 : Math.max(2, Math.round(2 * G / { gondel: 95, sessel: 34 }[l.art]));
      this.bahnen.push({ art: l.art, G, lage, hoehe, seite, anzahl, geschw: { kabine: 8, gondel: 5, sessel: 2.4 }[l.art], ph: Math.abs(p[0][0] * 3.1 + p[0][1]) % 100 });
    }
    // Seile als dünne Balken (eine Zeichnung)
    if (seile.length) { const G = new THREE.BoxGeometry(1, 1, 1); G.translate(0, 0, 0.5); const m = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.5 }), me = new THREE.InstancedMesh(G, m, seile.length), a = new THREE.Vector3(), b = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1); seile.forEach((q, i) => { a.set(q[0], q[1], q[2]); b.set(q[3], q[4], q[5]); const l = a.distanceTo(b); _Q.setFromUnitVectors(Z, b.sub(a).normalize()); _s.set(0.06, 0.06, l); me.setMatrixAt(i, _M.compose(a, _Q, _s)); }); _s.set(1, 1, 1); me.frustumCulled = false; this.gruppe.add(me); this.mats.push(m); this.teile.push(G); }
    this.instanzen('seilstation', stationen);
    if (masten.length) freizeitLaden('seilmast').then(g => { if (this.weg) return; const Mt = technikMaterial(); for (const part in g) { const me = new THREE.InstancedMesh(g[part], Mt[part] || Mt.lack, masten.length); masten.forEach((q, i) => { _Q.setFromAxisAngle(_Y, q.ry); _p.set(q.x, H(q.x, q.z), q.z); const k = Math.max(0.25, q.h / 22); _s.set(q.m, k, q.m); me.setMatrixAt(i, _M.compose(_p, _Q, _s)); }); _s.set(1, 1, 1); me.computeBoundingSphere(); me.castShadow = !this.mobil; this.gruppe.add(me); this.teile.push(me); } }).catch(() => {});
    // Kabinen bewegen sich
    for (const b of this.bahnen) freizeitLaden(b.art).then(g => { if (this.weg) return; const Mt = technikMaterial(); b.teile = []; const F = FARBEN[b.art]; for (const part in g) { const me = new THREE.InstancedMesh(g[part], Mt[part] || Mt.lack, b.anzahl); me.frustumCulled = false; me.castShadow = !this.mobil && b.art !== 'sessel'; if (part === 'farbe') { for (let i = 0; i < b.anzahl; i++) { const f = F[(i + Math.floor(b.ph)) % F.length]; me.setColorAt(i, _c.setRGB(f[0], f[1], f[2])); } } this.gruppe.add(me); b.teile.push(me); this.teile.push(me); } }).catch(() => {});
  }
  update(cam) {
    const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - this.tA) / 1000); this.tA = jetzt; this.t += dt; if (!this.bahnen.length) return;
    for (const b of this.bahnen) { if (!b.teile) continue; const Weg = b.G * 2, tz = this.t * b.geschw + b.ph * 7;
      for (let i = 0; i < b.anzahl; i++) {
        let w, seite;
        if (b.art === 'kabine') { const halte = 14 * b.geschw, Z = Weg + 2 * halte, q = ((tz + i * Z / 2) % Z + Z) % Z; const hin = q < b.G + halte; w = hin ? Math.min(q, b.G) : Math.max(0, b.G - (q - b.G - halte)); seite = i === 0 ? 1 : -1; }
        else { const q = ((tz + i * Weg / b.anzahl) % Weg + Weg) % Weg; const hin = q < b.G; w = hin ? q : Weg - q; seite = hin ? 1 : -1; }
        const L = b.lage(Math.max(0, Math.min(b.G, w))), y = b.hoehe(Math.max(0, Math.min(b.G, w))); _p.set(L.x - L.uz * seite * b.seite, y, L.z + L.ux * seite * b.seite); _Q.setFromAxisAngle(_Y, Math.atan2(L.ux, L.uz) + (seite > 0 ? 0 : Math.PI)); _M.compose(_p, _Q, _s);
        for (const me of b.teile) me.setMatrixAt(i, _M);
      }
      for (const me of b.teile) me.instanceMatrix.needsUpdate = true;
    }
  }
  entsorgen() { this.stadien?.entsorgen(); this.weg = true; for (const m of this.mats) m.dispose(); for (const t of this.teile) { if (t.isInstancedMesh) t.dispose(); else t.dispose?.(); } this.gruppe.removeFromParent(); }
}
