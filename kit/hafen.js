// Häfen (06.11.2026, Nader: "alles, was in der echten Welt ..."): Containerbrücken an den echten Kaimauern der Karte (lange gerade Ufer vor Industrieflächen), Containerlager mit Portalkränen, Schiffe am Kai, Fähren auf den echten Fährlinien (OpenStreetMap über OpenMapTiles). Maßstab 1 zu 1.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { NACHT } from './materials.js';

const BASIS = new URL('../assets/technik/', import.meta.url); const _gl = new Map();
function entpacken(g, m) {
  const G = new THREE.BufferGeometry(), p = g.attributes.position, n = g.attributes.normal, P = new Float32Array(p.count * 3), N = n ? new Float32Array(n.count * 3) : null, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; if (N) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; } }
  G.setAttribute('position', new THREE.BufferAttribute(P, 3)); if (N) G.setAttribute('normal', new THREE.BufferAttribute(N, 3)); else G.computeVertexNormals();
  const c = g.attributes.color; if (c) { const C = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { C[i * 3] = c.getX(i); C[i * 3 + 1] = c.getY(i); C[i * 3 + 2] = c.getZ(i); } G.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
  if (g.index) G.setIndex(g.index.clone()); return G;
}
// Lädt ein Modell aus assets/technik: { lack, farbe, glas, licht, teil } als Geometrien in echten Metern
export function technikLaden(n) {
  if (_gl.has(n)) return _gl.get(n);
  const p = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL(n + '.glb', BASIS).href).then(g => { const t = {}; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) t[o.material.name] = entpacken(o.geometry, o.matrixWorld); }); return t; }); _gl.set(n, p); return p;
}
let _m = null;
export function technikMaterial() { return _m || (_m = { lack: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.2 }), farbe: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }), teil: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }), glas: new THREE.MeshStandardMaterial({ color: 0x8ea4ae, roughness: 0.1, metalness: 0.6 }), licht: new THREE.MeshBasicMaterial({ vertexColors: true }) }); }
const CF = [[0.48, 0.12, 0.09], [0.09, 0.2, 0.38], [0.52, 0.33, 0.08], [0.08, 0.26, 0.16], [0.62, 0.62, 0.6], [0.26, 0.26, 0.28], [0.34, 0.16, 0.07], [0.08, 0.3, 0.36]];
let _rille = null;
function rillenBild() { if (_rille) return _rille; const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 32); for (let i = 0; i < 128; i += 4) { g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(i, 0, 2, 32); } g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 30, 128, 2); _rille = new THREE.CanvasTexture(c); _rille.colorSpace = THREE.SRGBColorSpace; _rille.anisotropy = 4; return _rille; }
const _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _Q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0), _f = new THREE.Color();

export class Hafen {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'hafen'; this.teile = []; this.mats = []; this.D = ort.daten.hafen; this.t = 0; this.tAlt = performance.now(); this.schiffe = []; this.faehren = []; this.bereit = false;
    this.R = (() => { let s = (Math.abs(Math.round((ort.daten.meta?.lat || 0) * 773) * 41 + Math.round((ort.daten.meta?.lon || 0) * 701)) >>> 0) || 3; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    Promise.all([technikLaden('sts'), technikLaden('rtg')]).then(([sts, rtg]) => { if (this.weg) return; this.bauen(sts, rtg); this.bereit = true; }).catch(e => console.warn('Hafen', e));
  }
  inst(geo, mat, N, schatten = true) { const im = new THREE.InstancedMesh(geo, mat, N); im.frustumCulled = false; im.castShadow = schatten && !this.mobil; im.receiveShadow = true; im.userData.geteilt = true; this.gruppe.add(im); this.teile.push(im); return im; }
  bauen(sts, rtg) {
    const D = this.D, H = this.ort.H, Mt = technikMaterial(), kr = [], lk = [], tint = CF[Math.floor(this.R() * 5)] || CF[1], kranF = [[0.12, 0.28, 0.58], [0.72, 0.16, 0.12], [0.86, 0.86, 0.84], [0.78, 0.56, 0.1]][Math.floor(this.R() * 4)];
    for (const k of D.kais || []) { const dx = k.bx - k.ax, dz = k.bz - k.az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, n = Math.min(8, Math.floor((L - 60) / 105)); for (let i = 0; i < n; i++) { const s = (L - (n - 1) * 105) / 2 + i * 105, x = k.ax + ux * s + k.nx * 18, z = k.az + uz * s + k.nz * 18; kr.push({ x, y: H(x, z) + 0.12, z, ry: Math.atan2(-k.nx, -k.nz), w: [-k.nx, -k.nz], ph: this.R() * 6.28 }); } }
    this.kraene = kr;
    if (kr.length) { const a = this.inst(sts.lack, Mt.lack, kr.length), b = this.inst(sts.farbe, Mt.farbe, kr.length), c = this.katzen = this.inst(sts.teil, Mt.teil, kr.length, false); kr.forEach((q, i) => { _M.compose(_p.set(q.x, q.y, q.z), _Q.setFromAxisAngle(_Y, q.ry), _s.set(1, 1, 1)); a.setMatrixAt(i, _M); b.setMatrixAt(i, _M); c.setMatrixAt(i, _M); b.setColorAt(i, _f.setRGB(kranF[0], kranF[1], kranF[2])); }); }
    // Containerlager
    const B = D.bloecke || []; let zahl = 0; const liste = []; for (const bl of B) { const qx = -bl.uz, qz = bl.ux; for (let a = 0; a < 18; a++) for (let r = 0; r < 6; r++) { const hoch = Math.floor(this.R() * this.R() * 5) + (this.R() < 0.9 ? 1 : 0); for (let e = 0; e < hoch; e++) { if (zahl >= (this.mobil ? 1200 : 5200)) break; const sx = (a - 8.5) * 12.5, sq = (r - 2.5) * 2.75, x = bl.x + bl.ux * sx + qx * sq, z = bl.z + bl.uz * sx + qz * sq; liste.push({ x, y: H(bl.x, bl.z) + 0.12 + 1.3 + e * 2.6, z, ry: Math.atan2(bl.ux, bl.uz) + Math.PI / 2 }); zahl++; } } }
    if (liste.length) { const mC = new THREE.MeshLambertMaterial({ map: rillenBild() }); this.mats.push(mC); const g = new THREE.BoxGeometry(2.44, 2.6, 12.2), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i)); const im = this.inst(g, mC, liste.length); im.userData.geteilt = false; liste.forEach((q, i) => { _M.compose(_p.set(q.x, q.y, q.z), _Q.setFromAxisAngle(_Y, q.ry - Math.PI / 2), _s.set(1, 1, 1)); im.setMatrixAt(i, _M); const c = CF[Math.floor(this.R() * CF.length)], l = 0.8 + this.R() * 0.3; im.setColorAt(i, _f.setRGB(c[0] * l, c[1] * l, c[2] * l)); }); }
    // Portalkräne über den Blöcken
    const rt = B.filter((_, i) => i % 2 === 0).map(bl => ({ ...bl, ph: this.R() * 6.28 })); this.rtgL = rt;
    if (rt.length) { const a = this.inst(rtg.lack, Mt.lack, rt.length), b = this.rtgA = this.inst(rtg.farbe, Mt.farbe, rt.length), c = this.rtgK = this.inst(rtg.teil, Mt.teil, rt.length, false), d = this.rtgB = a; this.rtgLack = a; rt.forEach((q, i) => b.setColorAt(i, _f.setRGB(0.1, 0.32, 0.55))); }
    this.fertigSetzen(0);
    // Fähren: auf den Linien der Karte
    for (const f of D.faehren || []) { let L = 0; const P = f.p, S = [0]; for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); S.push(L); } if (L > 130) this.faehren.push({ P, S, L, s: this.R() * L, dir: 1, warte: 0, schiff: null, v: 5 + this.R() * 2 }); }
  }
  fertigSetzen(dt) {
    this.t += dt; const H = this.ort.H;
    if (this.katzen) { const P = this.kraene; P.forEach((q, i) => { const t = 18 + 30 * (0.5 + 0.5 * Math.sin(this.t * 0.12 + q.ph)); _M.compose(_p.set(q.x + q.w[0] * t, q.y, q.z + q.w[1] * t), _Q.setFromAxisAngle(_Y, q.ry), _s.set(1, 1, 1)); this.katzen.setMatrixAt(i, _M); }); this.katzen.instanceMatrix.needsUpdate = true; }
    if (this.rtgL?.length) { this.rtgL.forEach((q, i) => { const s = Math.sin(this.t * 0.05 + q.ph) * 70, x = q.x + q.ux * s, z = q.z + q.uz * s, ry = Math.atan2(q.ux, q.uz), y = H(q.x, q.z) + 0.12; _M.compose(_p.set(x, y, z), _Q.setFromAxisAngle(_Y, ry), _s.set(1, 1, 1)); this.rtgLack.setMatrixAt(i, _M); this.rtgA.setMatrixAt(i, _M); const qx = -q.uz, qz = q.ux, k = Math.sin(this.t * 0.2 + q.ph) * 7; _M.compose(_p.set(x + qx * k, y, z + qz * k), _Q, _s); this.rtgK.setMatrixAt(i, _M); }); this.rtgLack.instanceMatrix.needsUpdate = this.rtgA.instanceMatrix.needsUpdate = this.rtgK.instanceMatrix.needsUpdate = true; }
  }
  // Schiffe laufen über kit/schiffe.js: Wellen, Spiegelung und Kielwasser kommen von dort
  update(cam, schiffe, zuGeo) {
    const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - this.tAlt) / 1000); this.tAlt = jetzt; if (!this.bereit) return; this.fertigSetzen(dt);
    if (schiffe && !this.schiffeDa && this.ort.daten.meta?.amMeer) { this.schiffeDa = true; this.sch = schiffe;
      for (const k of (this.D.kais || []).slice(0, 3)) { const L = Math.hypot(k.bx - k.ax, k.bz - k.az), id = L > 345 ? 'container' : L > 262 ? 'tanker' : L > 180 ? 'frachter' : null; if (!id) continue; const B = id === 'container' ? 48 : 40, mx = (k.ax + k.bx) / 2 - k.nx * (B / 2 + 5), mz = (k.az + k.bz) / 2 - k.nz * (B / 2 + 5), g = zuGeo(mx, mz), s = schiffe.setze(id, g.lat, g.lon, Math.atan2(k.bx - k.ax, -(k.bz - k.az)) * 180 / Math.PI, 0); if (s) { s.fest = true; this.schiffe.push(s); } }
    }
    if (schiffe && this.ort.daten.meta?.amMeer) for (const f of this.faehren) {
      if (!f.schiff) { const g = zuGeo(f.P[0][0], f.P[0][1]); const Er = schiffe.welt.erde, cl = Math.cos(g.lat * Math.PI / 180), breit = m => { for (let i = 0; i < 8; i++) { const w = i / 8 * 6.283; if (Er.meerBei(g.lat + Math.sin(w) * m / 111000, g.lon + Math.cos(w) * m / (111000 * cl)) < 0.6) return false; } return true; }; f.schiff = schiffe.setze(f.L > 400 && breit(600) ? 'faehre' : breit(80) ? 'kutter' : 'boot', g.lat, g.lon, 0, 0); if (f.schiff) { f.schiff.fest = true; this.schiffe.push(f.schiff); } }
      if (f.warte > 0) { f.warte -= dt; if (f.schiff) f.schiff.v = 0; continue; }
      f.s += f.dir * f.v * dt; if (f.s > f.L - 4 || f.s < 4) { f.s = THREE.MathUtils.clamp(f.s, 4, f.L - 4); f.dir *= -1; f.warte = 18 + this.R() * 25; }
      let i = 0; while (i < f.P.length - 2 && f.S[i + 1] < f.s) i++; const a = f.P[i], b = f.P[i + 1], t = (f.s - f.S[i]) / (f.S[i + 1] - f.S[i] || 1), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, g = zuGeo(x, z), dx = (b[0] - a[0]) * f.dir, dz = (b[1] - a[1]) * f.dir;
      if (f.schiff) { f.schiff.lat = g.lat; f.schiff.lon = g.lon; const ku = Math.atan2(dx, -dz); let d = ku - f.schiff.kurs; d = Math.atan2(Math.sin(d), Math.cos(d)); f.schiff.kurs += d * Math.min(1, dt * 0.5); f.schiff.ziel = f.schiff.kurs; f.schiff.v = f.v; }
    }
  }
  entsorgen() { this.weg = true; if (this.sch) for (const s of this.schiffe) this.sch.weg(s); for (const m of this.teile) { if (!m.userData.geteilt) m.geometry?.dispose(); m.dispose(); } for (const m of this.mats) m.dispose(); }
}

// Baukräne in großen Städten: Lage aus freien Flächen zwischen den Häusern, der Ausleger dreht sich langsam
export class Baukraene {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.gruppe = new THREE.Group(); this.gruppe.name = 'baukraene'; this.L = ort.daten.baukraene || []; this.tAlt = performance.now(); this.t = 0;
    technikLaden('turmkran').then(g => { if (this.weg) return; const M = technikMaterial(), H = ort.H, n = this.L.length; this.a = new THREE.InstancedMesh(g.lack, M.lack, n); this.b = new THREE.InstancedMesh(g.teil, M.teil, n); for (const q of [this.a, this.b]) { q.frustumCulled = false; q.castShadow = !mobil; this.gruppe.add(q); } const Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1); this.L.forEach(([x, z], i) => { _M.compose(_p.set(x, H(x, z) + 0.12, z), Q, S); this.a.setMatrixAt(i, _M); }); this.a.instanceMatrix.needsUpdate = true; this.bereit = true; }).catch(() => {});
  }
  update() { if (!this.bereit) return; const j = performance.now(), dt = Math.min(0.1, (j - this.tAlt) / 1000); this.tAlt = j; this.t += dt; const H = this.ort.H; this.L.forEach(([x, z], i) => { _M.compose(_p.set(x, H(x, z) + 0.12, z), _Q.setFromAxisAngle(_Y, Math.sin(this.t * 0.035 + i * 2.1) * 2.2 + i), _s.set(1, 1, 1)); this.b.setMatrixAt(i, _M); }); this.b.instanceMatrix.needsUpdate = true; }
  entsorgen() { this.weg = true; this.a?.dispose(); this.b?.dispose(); }
}
