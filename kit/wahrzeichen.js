// Wahrzeichen der Welt in echter Größe (06.11.2026, Nader: "alles, was in der echten Welt will ich da auch haben", "Alles soll immer in der Welt maßstabsgetreu sein"). Frei nachgebaut (tools/blender/wahrzeichen.py), Lage und Richtung aus kit/wahrzeichen_liste.js. Sichtbar bis zum Horizont, Häuser aus der Karte entfallen an der Stelle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { technikMaterial } from './hafen.js';
import { enu } from './erde.js';
import { WAHRZEICHEN, RAEDER } from './wahrzeichen_liste.js';
import { freizeitLaden } from './freizeit.js';
import { wahrzeichenBanner } from './werbung.js';

const BASIS = new URL('../assets/wahrzeichen/', import.meta.url), D2R = Math.PI / 180, _gl = new Map();
function entpacken(g, m) {
  const G = new THREE.BufferGeometry(), p = g.attributes.position, n = g.attributes.normal, P = new Float32Array(p.count * 3), N = n ? new Float32Array(n.count * 3) : null, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; if (N) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; } }
  G.setAttribute('position', new THREE.BufferAttribute(P, 3)); if (N) G.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  const c = g.attributes.color; if (c) { const C = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { C[i * 3] = c.getX(i); C[i * 3 + 1] = c.getY(i); C[i * 3 + 2] = c.getZ(i); } G.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
  if (g.index) G.setIndex(g.index.clone()); return G;
}
function laden(id) { if (_gl.has(id)) return _gl.get(id); const p = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL(id + '.glb', BASIS).href).then(g => { const t = {}; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) t[o.material.name] = entpacken(o.geometry, o.matrixWorld); }); return t; }); _gl.set(id, p); return p; }
// Beidseitig: viele Flächen sind offene Schalen (Kuppeln, Segel, Ränge)
let _mb = null; function beidseitig() { if (_mb) return _mb; const M = technikMaterial(); _mb = {}; for (const k in M) { _mb[k] = M[k].clone(); _mb[k].side = THREE.DoubleSide; } return _mb; }
const _p2 = new THREE.Vector3(), _qI = new THREE.Quaternion(), _M = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _X = new THREE.Vector3(), _b = new THREE.Matrix4(), _Y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

export class Wahrzeichen {
  constructor(szene, { mobil = false } = {}) { this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'wahrzeichen'; szene.add(this.gruppe); this.teile = new Map(); this.tSuche = 0; this.nah = []; }
  update(dt, welt, blick, hA, boden, ort) {
    if ((this.tSuche -= dt) <= 0) {
      this.tSuche = 1.5; const cl = Math.cos(blick.lat * D2R), sicht = Math.sqrt(Math.max(1, hA) * 12.74e6), nah = [];
      for (const w of WAHRZEICHEN) { const d = Math.hypot((w.lat - blick.lat) * 111132, (w.lon - blick.lon) * 111320 * cl), R = Math.min(this.mobil ? 26000 : 90000, sicht + Math.sqrt(w.hoch * 12.74e6) + 2000); if (d < R) nah.push(w); }
      for (const w of nah) if (!this.teile.has(w.id)) { const G = new THREE.Group(); G.name = w.id; G.visible = false; this.teile.set(w.id, G); this.gruppe.add(G); const M = beidseitig(); laden(w.id).then(g => { for (const part in g) { const m = new THREE.Mesh(g[part], M[part] || M.lack); m.castShadow = part !== 'glas' && part !== 'licht' && !this.mobil; m.receiveShadow = true; G.add(m); } G.userData.da = true; wahrzeichenBanner(G, w.id); }).catch(e => console.warn('Wahrzeichen', w.id, e.message)); }
      for (const [id, G] of this.teile) G.visible = false;
      this.nah = nah;
    }
    const zeigt = hA < 400000; this.gruppe.visible = zeigt; if (!zeigt) return;
    for (const w of this.nah) {
      const G = this.teile.get(w.id); if (!G?.userData.da) continue; G.visible = true;
      if ((w._t = (w._t || 0) - dt) <= 0) { w._t = 2; w.h = Math.max(0, boden(w.lat, w.lon) || 0); }
      welt.geoZuLokal(w.lat, w.lon, w.h ?? 0, _p); const e = enu(w.lat, w.lon); _X.crossVectors(e.oben, e.nord).normalize(); _b.makeBasis(_X, e.oben, e.nord); _q.setFromRotationMatrix(_b).premultiply(welt.zuLokal); _q2.setFromAxisAngle(_Y, -w.kurs * D2R); _q.multiply(_q2);
      // Im gebauten Ort auf dessen Boden stellen
      if (ort?.szene?.ort?.H) { const S = ort.szene.ort; _v.copy(_p); ort.gruppe.worldToLocal(_v); if (Math.abs(_v.x) < ort.halb && Math.abs(_v.z) < ort.halb) { _v.y = S.H(_v.x, _v.z); ort.gruppe.localToWorld(_v); _p.copy(_v); } }
      G.position.copy(_p); G.quaternion.copy(_q);
    }
  }
  // Riesenräder: Bock fest, Rad dreht um die Achse, Gondeln hängen immer senkrecht. s Maßstab gegen das Modell (Durchmesser 100 m)
  raeder(dt, welt, blick, hA, boden, ort) {
    this.tR = (this.tR ?? 0) - dt; this.t = (this.t || 0) + dt;
    if (this.tR <= 0) { this.tR = 2; const cl = Math.cos(blick.lat * D2R), sicht = Math.min(this.mobil ? 18000 : 60000, Math.sqrt(Math.max(1, hA) * 12.74e6) + 40000); this.nahR = RAEDER.filter(r => Math.hypot((r[1] - blick.lat) * 111132, (r[2] - blick.lon) * 111320 * cl) < sicht);
      for (const r of this.nahR) if (!r.G) { r.G = new THREE.Group(); r.G.name = 'riesenrad'; r.G.visible = false; this.gruppe.add(r.G); const s = r[4] / 100, M = beidseitig(); Promise.all([freizeitLaden('riesenrad_bock'), freizeitLaden('riesenrad_rad'), freizeitLaden('riesenrad_gondel')]).then(([b, ra, go]) => { for (const part in b) { const m = new THREE.Mesh(b[part], M[part] || M.lack); m.scale.setScalar(s); m.castShadow = !this.mobil; r.G.add(m); } r.rad = new THREE.Group(); r.rad.position.y = 53 * s; r.rad.scale.setScalar(s); r.G.add(r.rad); for (const part in ra) { const m = new THREE.Mesh(ra[part], M[part] || M.lack); m.castShadow = !this.mobil; r.rad.add(m); } const n = r[4] > 90 ? 32 : 24, k = Math.min(2.4, Math.max(1, s * 1.6)); r.go = []; const kl = [[0.72, 0.1, 0.08], [0.9, 0.9, 0.88], [0.06, 0.28, 0.58], [0.9, 0.9, 0.88]]; for (const part in go) { const im = new THREE.InstancedMesh(go[part], M[part] || M.lack, n); im.frustumCulled = false; im.userData.part = part; if (part === 'farbe') for (let i = 0; i < n; i++) { const f = kl[i % 4]; im.setColorAt(i, _c.setRGB(f[0], f[1], f[2])); } r.G.add(im); r.go.push(im); } r.n = n; r.kG = k; r.da = true; }).catch(e => console.warn('Riesenrad', e.message)); }
      for (const r of RAEDER) if (r.G) r.G.visible = false;
    }
    if (hA > 400000 || !this.nahR) return;
    for (const r of this.nahR) { if (!r.da) continue; r.G.visible = true; if ((r.tH = (r.tH || 0) - dt) <= 0) { r.tH = 2; r.h = Math.max(0, boden(r[1], r[2]) || 0); }
      welt.geoZuLokal(r[1], r[2], r.h ?? 0, _p); const e = enu(r[1], r[2]); _X.crossVectors(e.oben, e.nord).normalize(); _b.makeBasis(_X, e.oben, e.nord); _q.setFromRotationMatrix(_b).premultiply(welt.zuLokal); _q2.setFromAxisAngle(_Y, -r[3] * D2R); _q.multiply(_q2);
      if (ort?.szene?.ort?.H) { const S = ort.szene.ort; _v.copy(_p); ort.gruppe.worldToLocal(_v); if (Math.abs(_v.x) < ort.halb && Math.abs(_v.z) < ort.halb) { _v.y = S.H(_v.x, _v.z); ort.gruppe.localToWorld(_v); _p.copy(_v); } }
      r.G.position.copy(_p); r.G.quaternion.copy(_q);
      const s = r[4] / 100, w = this.t * 0.28 / (50 * s); r.rad.rotation.x = w; for (let i = 0; i < r.n; i++) { const a = i / r.n * 6.283 + w, y = 53 * s + 50 * s * Math.sin(a), z = 50 * s * Math.cos(a); _p2.set(0, y, z); _M.compose(_p2, _qI, _s.setScalar(r.kG)); for (const im of r.go) im.setMatrixAt(i, _M); } for (const im of r.go) im.instanceMatrix.needsUpdate = true; }
  }
  entsorgen() { this.gruppe.removeFromParent(); }
}
