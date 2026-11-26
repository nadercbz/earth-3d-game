// Flughäfen (06.11.2026, Nader: "alles, was in der echten Welt ..."): Pisten, Rollwege, Vorfelder und Gates aus den echten Daten der Karte (OpenStreetMap über OpenMapTiles). Parkende Flugzeuge an den Gates, rollende Flugzeuge auf den Rollwegen,
// Starts und Landungen auf den echten Pisten mit 3 Grad Gleitweg. Erfundene Gesellschaften, keine Marken. Maßstab 1 zu 1.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { NACHT } from './materials.js';
import { geoZusammen } from './bahn.js';

const BASIS = new URL('../assets/flugzeuge/', import.meta.url), MASSE = { narrow: { L: 37.6, S: 36 }, wide: { L: 63.5, S: 66 }, regional: { L: 27.2, S: 27 }, klein: { L: 8.3, S: 11 } };
export const FLIEGER_FARBEN = [[0.08, 0.18, 0.5], [0.62, 0.08, 0.1], [0.05, 0.42, 0.42], [0.86, 0.46, 0.06], [0.16, 0.42, 0.18], [0.36, 0.14, 0.5], [0.1, 0.1, 0.12], [0.86, 0.68, 0.08]];
let _modelle = null, _mat = null;
function entpacken(g, m) {
  const G = new THREE.BufferGeometry(), p = g.attributes.position, n = g.attributes.normal, P = new Float32Array(p.count * 3), N = n ? new Float32Array(n.count * 3) : null, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; if (N) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; } }
  G.setAttribute('position', new THREE.BufferAttribute(P, 3)); if (N) G.setAttribute('normal', new THREE.BufferAttribute(N, 3)); else G.computeVertexNormals();
  const c = g.attributes.color; if (c) { const C = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { C[i * 3] = c.getX(i); C[i * 3 + 1] = c.getY(i); C[i * 3 + 2] = c.getZ(i); } G.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
  if (g.index) G.setIndex(g.index.clone()); return G;
}
export function fliegerLaden() { return laden(); }
function laden() {
  if (_modelle) return _modelle;
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), M = {};
  _modelle = Promise.all(Object.keys(MASSE).map(n => L.loadAsync(new URL(n + '.glb', BASIS).href).then(g => { const t = {}; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) t[o.material.name] = entpacken(o.geometry, o.matrixWorld); }); M[n] = t; }))).then(() => M);
  return _modelle;
}
export function fliegerMaterial() { return materialien(); }
function materialien() {
  if (_mat) return _mat;
  return (_mat = { lack: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.14 }), farbe: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.1 }), glas: new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 0.07, metalness: 0.85, emissive: new THREE.Color(1, 0.84, 0.6), emissiveIntensity: 0 }), licht: new THREE.MeshBasicMaterial({ color: 0xffffff }), teil: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }) });
}
// Bild der Piste: Asphalt mit Querfugen, Maßstab: Breite 1 = ganze Breite der Piste, v wiederholt je 30 m
let _piste = null, _roll = null;
function pistenBild() {
  if (_piste) return _piste;
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let s = 21; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#3e3e3f'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16000; i++) { const l = 42 + r() * 40; g.fillStyle = `rgba(${l},${l},${l},0.5)`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  // Bremsspuren in der Mitte
  for (let i = 0; i < 38; i++) { g.fillStyle = `rgba(14,14,15,${0.05 + r() * 0.12})`; const x = W * (0.44 + r() * 0.12); g.fillRect(x, 0, 2 + r() * 6, H); }
  // Randstreifen und Mittellinie (30 m Strich, 20 m Lücke auf 60 m Bild gekürzt: hier 30 m Bild, Strich 18 m)
  g.fillStyle = '#d9d7cf'; g.fillRect(W * 0.012, 0, W * 0.016, H); g.fillRect(W * 0.972, 0, W * 0.016, H); g.fillRect(W * 0.494, 0, W * 0.012, H * 0.6);
  _piste = new THREE.CanvasTexture(c); _piste.colorSpace = THREE.SRGBColorSpace; _piste.wrapS = THREE.ClampToEdgeWrapping; _piste.wrapT = THREE.RepeatWrapping; _piste.anisotropy = 8;
  return _piste;
}
function rollBild() {
  if (_roll) return _roll;
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let s = 13; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#454546'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6000; i++) { const l = 50 + r() * 34; g.fillStyle = `rgba(${l},${l},${l},0.5)`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  g.fillStyle = '#c9a42a'; g.fillRect(W * 0.494, 0, W * 0.012, H); g.fillStyle = '#b9962a'; g.fillRect(W * 0.03, 0, W * 0.012, H); g.fillRect(W * 0.958, 0, W * 0.012, H);
  _roll = new THREE.CanvasTexture(c); _roll.colorSpace = THREE.SRGBColorSpace; _roll.wrapS = THREE.ClampToEdgeWrapping; _roll.wrapT = THREE.RepeatWrapping; _roll.anisotropy = 8;
  return _roll;
}
function dichter(p, schritt) { const a = [p[0].slice()]; for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1], d = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(d / schritt)); for (let k = 1; k <= n; k++) a.push([p[i - 1][0] + dx * k / n, p[i - 1][1] + dz * k / n]); } return a; }
function band(P, breite, y0, V, vL, H) {
  const o = V.pos.length / 3; let s = 0;
  for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1, nx = -dz / d, nz = dx / d; if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); const x = P[i][0], z = P[i][1]; for (const q of [-1, 1]) { const xx = x + nx * q * breite / 2, zz = z + nz * q * breite / 2; V.pos.push(xx, H(xx, zz) + y0, zz); V.uv.push((q + 1) / 2, s / vL); } }
  for (let i = 0; i < P.length - 1; i++) { const a = o + i * 2, b = a + 1, c = a + 2, d = a + 3; V.idx.push(a, b, c, b, d, c); }
}
function geo(V) { for (let i = 0; i < V.pos.length; i++) if (!Number.isFinite(V.pos[i])) V.pos[i] = 0; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(V.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(V.uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(V.pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(V.idx); return g; }
const _M = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Color(), _Q = new THREE.Quaternion(), _s = new THREE.Vector3();

export class Flughafen {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'flughafen'; this.teile = []; this.mats = []; this.flieger = []; this.R = (() => { let s = (Math.abs(Math.round((ort.daten.meta?.lat || 0) * 997) * 37 + Math.round((ort.daten.meta?.lon || 0) * 991)) >>> 0) || 5; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })(); this.tAlt = performance.now(); this.bereit = false; this.tStart = 12 + this.R() * 25; this.tRoll = 6;
    const D = ort.daten.flughafen; this.D = D; this.flaechenBauen(D); this.rollRouten(D);
    laden().then(M => { if (this.weg) return; this.M = M; this.flotte(); this.parken(D); this.bereit = true; }).catch(e => console.warn('Flugzeuge', e));
  }
  flaechenBauen(D) {
    const H = this.ort.H, p = neuV(), r = neuV(), hart = this.ort.halb + 30, mP = new THREE.MeshStandardMaterial({ map: pistenBild(), roughness: 0.88 }), mR = new THREE.MeshStandardMaterial({ map: rollBild(), roughness: 0.9 }); mP.polygonOffset = true; mP.polygonOffsetFactor = -5; mP.polygonOffsetUnits = -5; mR.polygonOffset = true; mR.polygonOffsetFactor = -4; mR.polygonOffsetUnits = -4; this.mats.push(mP, mR);
    this.pisten = [];
    for (const q of D.pisten || []) {
      band(dichter(q.p, 40), q.w, 0.16, p, 30, H); const a = q.voll[0], b = q.voll[1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      this.pisten.push({ ...q, a, b, dx: dx / l, dz: dz / l, len: l, y: H((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + 0.2 });
      // Schwellen: Klaviertasten, Nummer als Striche, nur wenn das Ende im Ort liegt
      for (const [e, sg] of [[a, 1], [b, -1]]) { if (Math.max(Math.abs(e[0]), Math.abs(e[1])) > this.ort.halb - 8) continue; const qx = -dz / l, qz = dx / l, ux = sg * dx / l, uz = sg * dz / l; const T = neuV2(this); for (let i = -7; i <= 7; i++) { if (i === 0) continue; const m = i * q.w / 15.5; T.quad(e[0] + qx * m + ux * 22, e[1] + qz * m + uz * 22, ux, uz, qx, qz, 15, q.w / 34, H, 0.2); } for (const off of [300, 450, 600]) for (const si of [-1, 1]) for (const k of [0.13, 0.2, 0.27]) { const m = si * k * q.w; T.quad(e[0] + qx * m + ux * off, e[1] + qz * m + uz * off, ux, uz, qx, qz, 22, q.w * 0.022, H, 0.2); } T.fertig(); }
    }
    for (const q of D.rollwege || []) band(dichter(q.p, 10), q.w, 0.14, r, 12, H);
    if (p.idx.length) { const m = new THREE.Mesh(geo(p), mP); m.receiveShadow = true; m.name = 'piste'; this.gruppe.add(m); this.teile.push(m); }
    if (r.idx.length) { const m = new THREE.Mesh(geo(r), mR); m.receiveShadow = true; m.name = 'rollwege'; this.gruppe.add(m); this.teile.push(m); }
    // Lichter der Pisten (nachts hell, am Tag aus)
    const L = []; for (const q of this.pisten) { const nx = -q.dz, nz = q.dx; for (let s = 0; s < q.len; s += 60) { const x = q.a[0] + q.dx * s, z = q.a[1] + q.dz * s; if (Math.max(Math.abs(x), Math.abs(z)) > hart) continue; for (const sg of [-1, 1]) L.push([x + nx * sg * (q.w / 2 + 1), H(x, z) + 0.45, z + nz * sg * (q.w / 2 + 1)]); } } for (const q of D.rollwege || []) { const P = dichter(q.p, 40); for (const pt of P) L.push([pt[0], H(pt[0], pt[1]) + 0.32, pt[1]]); }
    if (L.length) { const mL = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) }); this.lichtMat = mL; this.mats.push(mL); const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mL, L.length), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1); L.forEach(([x, y, z], i) => im.setMatrixAt(i, _M.compose(_p.set(x, y, z), Q, S))); im.frustumCulled = false; this.gruppe.add(im); this.teile.push(im); }
  }
  // Rollwege zu Routen: an Kreuzungen möglichst geradeaus (wie kit/bahn.js)
  rollRouten(D) {
    const K = [], Kn = [], zell = new Map(); const kn = (x, z) => { const ix = Math.round(x / 5), iz = Math.round(z / 5); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = zell.get((ix + a) + ',' + (iz + b)); if (L) for (const k of L) if (Math.hypot(Kn[k].x - x, Kn[k].z - z) < 5) return k; } const k = Kn.length; Kn.push({ x, z, kanten: [] }); const key = ix + ',' + iz; if (!zell.has(key)) zell.set(key, []); zell.get(key).push(k); return k; };
    for (const q of D.rollwege || []) { const P = dichter(q.p, 8); if (P.length < 2) continue; const a = kn(...P[0]), b = kn(...P[P.length - 1]); let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); const e = { P, a, b, len, i: K.length }; K.push(e); Kn[a].kanten.push(e.i); Kn[b].kanten.push(e.i); }
    const ri = (e, amA) => { const P = e.P, q = amA ? [P[0], P[Math.min(3, P.length - 1)]] : [P[P.length - 1], P[Math.max(0, P.length - 4)]], dx = q[1][0] - q[0][0], dz = q[1][1] - q[0][1], d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };
    const routen = [];
    for (let v = 0; v < Kn.length; v++) { const k = Kn[v]; if (k.kanten.length !== 1) continue; let e = K[k.kanten[0]], vor = e.a === v; const genutzt = new Set([e.i]), liste = [{ e, vor }]; let knoten = vor ? e.b : e.a, len = e.len;
      for (let t = 0; t < 120; t++) { const r0 = ri(e, !vor); let best = null, bw = -0.3; for (const i of Kn[knoten].kanten) { if (genutzt.has(i)) continue; const f = K[i], amA = f.a === knoten, r1 = ri(f, amA), d = r0[0] * r1[0] + r0[1] * r1[1]; if (d < bw) { bw = d; best = { f, amA }; } } if (!best) break; genutzt.add(best.f.i); liste.push({ e: best.f, vor: best.amA }); e = best.f; vor = best.amA; knoten = vor ? e.b : e.a; len += e.len; }
      if (len > 280) routen.push({ liste, len }); }
    routen.sort((a, b) => b.len - a.len);
    this.rollRoutenL = routen.slice(0, 10).map(r => { const pts = []; for (const { e, vor } of r.liste) { const P = vor ? e.P : e.P.slice().reverse(); for (let i = pts.length ? 1 : 0; i < P.length; i++) pts.push(P[i]); } const Q = pts.map((p, i) => { if (i === 0 || i === pts.length - 1) return p; const a = pts[i - 1], b = pts[i + 1]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; }), S = new Float64Array(Q.length); for (let i = 1; i < Q.length; i++) S[i] = S[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]); return { P: Q, S, len: S[S.length - 1] }; });
  }
  flotte() {
    const mats = materialien(), M = this.M; this.typ = {};
    const cap = { narrow: 36, wide: 18, regional: 14, klein: 22 };
    for (const n of Object.keys(M)) { const e = { n: 0 }; for (const part of ['lack', 'farbe', 'glas', 'licht', 'teil']) { if (!M[n][part]) continue; const im = new THREE.InstancedMesh(M[n][part], mats[part], cap[n]); im.count = 0; im.frustumCulled = false; im.castShadow = part !== 'glas' && part !== 'licht' && !this.mobil; im.receiveShadow = part === 'lack'; im.name = 'flieger ' + n; this.gruppe.add(im); e[part] = im; } this.typ[n] = e; }
    // Festplätze zuerst im Puffer, danach bewegliche
    this.festN = {};
  }
  // ---------- Parken: Flugzeug steht mit der Nase zum Terminal am Gate, sonst in Reihen auf dem Vorfeld ----------
  parken(D) {
    const H = this.ort.H, fest = this.fest = [], belegt = [], frei = (x, z, r) => { for (const b of belegt) if (Math.hypot(b[0] - x, b[1] - z) < b[2] + r) return false; return true; };
    const dazu = (n, x, z, ry, tint) => { const m = MASSE[n], r = m.S * 0.52; if (!frei(x, z, r)) return false; belegt.push([x, z, r]); fest.push({ n, x, z, y: H(x, z) + 0.2, ry, f: tint }); return true; };
    const gaenge = [];
    for (const g of D.gates || []) {
      const dx = g.nx, dz = g.nz; if (dx === undefined) continue; const q = this.R(), n = g.gross ? (q < 0.32 ? 'wide' : 'narrow') : q < 0.8 ? 'narrow' : 'regional', m = MASSE[n], x = g.x + dx * (m.L / 2 + 7), z = g.z + dz * (m.L / 2 + 7);
      if (dazu(n, x, z, Math.atan2(-dx, -dz), FLIEGER_FARBEN[Math.floor(this.R() * FLIEGER_FARBEN.length)])) { fest[fest.length - 1].g = g; gaenge.push({ g, n, x, z, dx, dz }); }
    }
    // Vorfeld ohne Gates: Rasterplätze in den Polygonen
    if (fest.length < 3) for (const P of D.stellplaetze || []) { const q = this.R(), n = P.klein ? 'klein' : q < 0.5 ? 'regional' : q < 0.85 ? 'klein' : 'narrow'; dazu(n, P.x, P.z, P.ry + (this.R() - 0.5) * 0.3, FLIEGER_FARBEN[Math.floor(this.R() * FLIEGER_FARBEN.length)]); if (fest.length > 16) break; }
    this.gaengeBauen(gaenge);
    for (const f of fest) { f.idx = this.typ[f.n] ? this.typ[f.n].n : -1; this.setze(f.n, f.x, f.y, f.z, f.ry, f.f, 1, true); }
    for (const n in this.typ) { this.festN[n] = this.typ[n].n; }
    this.fertigSetzen();
  }
  // Mitfliegen (Wunsch Nr. 63): geparktes Flugzeug in der Nähe, und sein festes Modell ausblenden, solange man drinsitzt
  fliegerNah(x, z, r = 34) { if (!this.fest) return null; let b = null, bd = r; for (const f of this.fest) { if (f.n === 'klein') continue; const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; b = f; } } return b; }
  versteckeFest(f, an) { const e = this.typ?.[f.n]; if (!e || this.weg || f.idx === undefined || f.idx < 0) return; if (an) _M.makeScale(0.0001, 0.0001, 0.0001); else { _Q.setFromEuler(_E.set(0, f.ry, 0, 'YXZ')); _M.compose(_p.set(f.x, f.y, f.z), _Q, _s.set(1, 1, 1)); } for (const p of ['lack', 'farbe', 'glas', 'licht', 'teil']) if (e[p]) { e[p].setMatrixAt(f.idx, _M); e[p].instanceMatrix.needsUpdate = true; } }
  // Fluggastbrücken vom Terminal zur vorderen Tür, Schlepper und Gepäckwagen an jedem Flugzeug
  gaengeBauen(L) {
    if (!L.length) return; const H = this.ort.H, B = [], S = [], W = []; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), Sc = new THREE.Vector3();
    for (const { g, n, x, z, dx, dz } of L) {
      const m = MASSE[n], zc = n === 'wide' ? 5.8 : n === 'narrow' ? 3.72 : 2.55, R = n === 'wide' ? 2.96 : n === 'narrow' ? 1.98 : 1.42, qx = -dz, qz = dx, tuerS = m.L / 2 - (n === 'wide' ? 9.2 : 6.2), tx = x - dx * tuerS + qx * (R + 0.3), tz = z - dz * tuerS + qz * (R + 0.3), fx = g.x + qx * 6, fz = g.z + qz * 6, h = H(tx, tz) + zc - 0.2 + 0.2, ax = tx - fx, az = tz - fz, l = Math.hypot(ax, az) || 1;
      if (l > 42 || n === 'klein') continue; B.push([(tx + fx) / 2, h + 1, (tz + fz) / 2, l, Math.atan2(ax, az), tx - ax / l * 3, H(tx, tz), tz - az / l * 3, h - 1]);
      const yb = H(x, z) + 0.2; S.push([x - dx * m.L * 0.42 + qx * 0.0, yb, z - dz * m.L * 0.42, Math.atan2(dx, dz)]); W.push([x + dx * m.L * 0.14 - qx * (R + 2.8), yb, z + dz * m.L * 0.14 - qz * (R + 2.8), Math.atan2(dx, dz)]);
    }
    const mG = new THREE.MeshStandardMaterial({ color: 0xc9cbcd, roughness: 0.45, metalness: 0.3 }), mD = new THREE.MeshStandardMaterial({ color: 0x53585e, roughness: 0.6, metalness: 0.4 }), mY = new THREE.MeshStandardMaterial({ color: 0xe0a910, roughness: 0.55 }); this.mats.push(mG, mD, mY);
    const add = (geo, mat, N, setz) => { if (!N) return; const im = new THREE.InstancedMesh(geo, mat, N); for (let i = 0; i < N; i++) { setz(i); im.setMatrixAt(i, M); } im.frustumCulled = false; im.castShadow = !this.mobil; im.receiveShadow = true; this.gruppe.add(im); this.teile.push(im); };
    add(new THREE.BoxGeometry(2.8, 2.9, 1), mG, B.length, i => { const b = B[i]; M.compose(P.set(b[0], b[1], b[2]), Q.setFromAxisAngle(Y, b[4]), Sc.set(1, 1, b[3])); });
    add(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), mD, B.length, i => { const b = B[i]; M.compose(P.set(b[5], b[6], b[7]), Q.identity(), Sc.set(1, b[8] - b[6], 1)); });
    add(geoZusammen([new THREE.BoxGeometry(2.0, 1.1, 3.6).translate(0, 0.75, 0), new THREE.BoxGeometry(1.7, 0.8, 1.2).translate(0, 1.7, -0.8), new THREE.CylinderGeometry(0.42, 0.42, 2.3, 10).rotateZ(Math.PI / 2).translate(0, 0.42, 1.2), new THREE.CylinderGeometry(0.42, 0.42, 2.3, 10).rotateZ(Math.PI / 2).translate(0, 0.42, -1.2)]), mY, S.length, i => { const b = S[i]; M.compose(P.set(b[0], b[1], b[2]), Q.setFromAxisAngle(Y, b[3]), Sc.set(1, 1, 1)); });
    add(geoZusammen([new THREE.BoxGeometry(1.6, 0.25, 8).rotateX(-0.28).translate(0, 2.0, 0), new THREE.BoxGeometry(1.9, 1.0, 5).translate(0, 0.72, -0.5), new THREE.CylinderGeometry(0.34, 0.34, 2.0, 10).rotateZ(Math.PI / 2).translate(0, 0.34, 1.4), new THREE.CylinderGeometry(0.34, 0.34, 2.0, 10).rotateZ(Math.PI / 2).translate(0, 0.34, -2.4)]), mD, W.length, i => { const b = W[i]; M.compose(P.set(b[0], b[1], b[2]), Q.setFromAxisAngle(Y, b[3]), Sc.set(1, 1, 1)); });
  }
  setze(n, x, y, z, ry, f, fw = 1, vorn = true, nick = 0, roll = 0) {
    const e = this.typ[n]; if (!e) return; const i = e.n; if (i >= e.lack.instanceMatrix.count) return; e.n++;
    _Q.setFromEuler(_E.set(nick, ry, roll, 'YXZ')); _M.compose(_p.set(x, y, z), _Q, _s.set(1, 1, 1));
    e.lack.setMatrixAt(i, _M); e.glas?.setMatrixAt(i, _M); e.licht?.setMatrixAt(i, _M); e.farbe?.setMatrixAt(i, _M);
    if (e.farbe) { _f.setRGB(f[0], f[1], f[2]); e.farbe.setColorAt(i, _f); }
    if (e.teil) { if (fw > 0.01) e.teil.setMatrixAt(i, _M); else { _M.compose(_p, _Q, _s.set(0.001, 0.001, 0.001)); e.teil.setMatrixAt(i, _M); } }
    if (e.licht) { _f.setRGB(4.2, 4.2, 3.9); e.licht.setColorAt(i, _f); }
  }
  fertigSetzen() { for (const n in this.typ) { const e = this.typ[n]; for (const p of ['lack', 'farbe', 'glas', 'licht', 'teil']) { const m = e[p]; if (!m) continue; m.count = e.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } } }
  // ---------- Bewegung ----------
  update(cam, verkehr = null) {
    const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - this.tAlt) / 1000); this.tAlt = jetzt; if (this.lichtMat) { const n = NACHT.value; this.lichtMat.color.setRGB(3.2 * n, 2.9 * n, 2.2 * n); } if (!this.bereit) return;
    materialien().glas.emissiveIntensity = 0.5 * NACHT.value;
    for (const n in this.typ) this.typ[n].n = this.festN[n] || 0;
    // Start und Landung auf einer Piste: abwechselnd
    if (this.pisten.length && (this.tStart -= dt) <= 0 && this.flieger.length < 6) { this.tStart = 40 + this.R() * 55; const q = this.pisten[Math.floor(this.R() * this.pisten.length)], gross = q.w >= 40, ra = this.R(); const n = gross ? (ra < 0.26 ? 'wide' : ra < 0.86 ? 'narrow' : 'regional') : ra < 0.5 ? 'regional' : 'klein', richt = this.R() < 0.5 ? 1 : -1, F = FLIEGER_FARBEN[Math.floor(this.R() * FLIEGER_FARBEN.length)]; this.flieger.push(this.R() < 0.55 ? { art: 'landen', n, q, richt, s: -6500, v: n === 'klein' ? 36 : 72, f: F, y: 0, nick: 0.05 } : { art: 'starten', n, q, richt, s: 0, v: 0, f: F, y: 0, nick: 0, warte: 2 }); }
    if (this.rollRoutenL?.length && (this.tRoll -= dt) <= 0 && this.flieger.filter(f => f.art === 'rollen').length < 4) { this.tRoll = 18 + this.R() * 30; const R = this.rollRoutenL[Math.floor(this.R() * this.rollRoutenL.length)], ra = this.R(), n = ra < 0.2 ? 'wide' : ra < 0.8 ? 'narrow' : 'regional', ok = !this.flieger.some(f => f.R === R && f.s < 90); if (ok) this.flieger.push({ art: 'rollen', R, n, s: 0, v: 7 + this.R() * 4, hint: 0, f: FLIEGER_FARBEN[Math.floor(this.R() * FLIEGER_FARBEN.length)] }); }
    const H = this.ort.H;
    for (let i = this.flieger.length - 1; i >= 0; i--) {
      const a = this.flieger[i], m = MASSE[a.n];
      if (a.art === 'rollen') {
        a.s += a.v * dt; if (a.s > a.R.len - 3) { this.flieger.splice(i, 1); continue; }
        const P = this.rollAn(a.R, a.s + m.L * 0.25, a), Q = this.rollAn(a.R, Math.max(0, a.s - m.L * 0.25), a); const dx = P[0] - Q[0], dz = P[1] - Q[1], ry = Math.atan2(dx, dz), x = (P[0] + Q[0]) / 2, z = (P[1] + Q[1]) / 2;
        this.setze(a.n, x, H(x, z) + 0.22, z, ry, a.f, 1);
        if (verkehr) a._p = { x, z };
        continue;
      }
      const q = a.q, ux = q.dx * a.richt, uz = q.dz * a.richt, ry = Math.atan2(ux, uz), start = a.richt > 0 ? q.a : q.b, lang = q.len, y0 = q.y;
      if (a.art === 'landen') {
        // Aufsetzen 350 m hinter der Schwelle. Bis dahin 3 Grad Gleitweg, dann bremsen, verlassen am Ende
        const sT = 350, d = sT - a.s; let fw = d < 3200 ? 1 : 0;
        if (d > 0) { a.y = y0 + d * Math.tan(3 * Math.PI / 180); a.nick = -0.055; const sFern = d > 120 ? 0 : 1 - d / 120; a.y = Math.max(y0, a.y - 0); a.nick = -0.05 - 0.07 * sFern; a.v = Math.max(a.n === 'klein' ? 30 : 68, a.v - 0.04); }
        else { a.y = y0; a.nick = Math.max(-0.1, -0.1 * (1 + d / 90)); if (d < -90) a.nick = 0; a.v = Math.max(16, a.v - (a.n === 'klein' ? 3 : 2.1) * dt); fw = 1; }
        a.s += a.v * dt;
        if (a.s > lang - 40 || (d < -1600)) { this.flieger.splice(i, 1); continue; }
        this.setze(a.n, start[0] + ux * a.s, a.y, start[1] + uz * a.s, ry, a.f, fw, true, a.nick);
      } else {
        if ((a.warte -= dt) > 0) { this.setze(a.n, start[0] + ux * a.s, y0, start[1] + uz * a.s, ry, a.f, 1); continue; }
        const vr = a.n === 'klein' ? 30 : a.n === 'regional' ? 58 : 76; a.v += (a.n === 'klein' ? 2.4 : 2.0) * dt; a.s += a.v * dt;
        if (a.v > vr) { a.h = (a.h || 0) + a.v * Math.sin(0.14) * dt * Math.min(1, (a.v - vr) / 6); a.nick = -Math.min(0.2, (a.v - vr) * 0.03); }
        const fw = (a.h || 0) < 40 ? 1 : 0; if ((a.h || 0) > 1500) { this.flieger.splice(i, 1); continue; }
        this.setze(a.n, start[0] + ux * a.s, y0 + (a.h || 0), start[1] + uz * a.s, ry, a.f, fw, true, a.nick || 0);
      }
    }
    this.fertigSetzen();
  }
  rollAn(R, s, a) { const S = R.S, P = R.P, n = S.length; let i = 0; if (a.hint === undefined) a.hint = 0; i = a.hint; while (i > 0 && S[i] > s) i--; while (i < n - 2 && S[i + 1] < s) i++; const L = S[i + 1] - S[i] || 1, t = Math.max(0, Math.min(1, (s - S[i]) / L)); return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t]; }
  entsorgen() { this.weg = true; for (const m of this.teile) { m.geometry?.dispose(); if (m.isInstancedMesh) m.dispose(); } if (this.typ) for (const n in this.typ) for (const p of ['lack', 'farbe', 'glas', 'licht', 'teil']) this.typ[n][p]?.dispose(); for (const m of this.mats) m.dispose(); }
}
const _E = new THREE.Euler();
const neuV = () => ({ pos: [], uv: [], idx: [] });
// Weiße Markierungen als Rechtecke
function neuV2(F) { const V = neuV(); return { quad(cx, cz, ux, uz, qx, qz, lang, breit, H, y) { const o = V.pos.length / 3, a = lang / 2, b = breit / 2, P = [[cx - ux * a - qx * b, cz - uz * a - qz * b], [cx + ux * a - qx * b, cz + uz * a - qz * b], [cx + ux * a + qx * b, cz + uz * a + qz * b], [cx - ux * a + qx * b, cz - uz * a + qz * b]]; for (const [x, z] of P) { V.pos.push(x, H(x, z) + y, z); V.uv.push(0, 0); } const s = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]); if (s > 0) V.idx.push(o, o + 2, o + 1, o, o + 3, o + 2); else V.idx.push(o, o + 1, o + 2, o, o + 2, o + 3); }, fertig() { if (!V.idx.length) return; if (!F.mMark) { F.mMark = new THREE.MeshStandardMaterial({ color: 0xcfcdc4, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }); F.mats.push(F.mMark); } const m = new THREE.Mesh(geo(V), F.mMark); m.receiveShadow = true; F.gruppe.add(m); F.teile.push(m); } }; }
