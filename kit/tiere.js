// Tiere auf der Straße (05.11.2026, Nader: "auch tiere wie vögel", "mehr leben"): Tauben in Gruppen auf Gehwegen und Plätzen (picken, trippeln, fliegen auf, wenn jemand kommt, und landen woanders)
// und Hunde, die mit Fußgängern an der Leine laufen. Modelle aus wenigen Flächen, Flügel und Beine bewegen sich im Vertex Shader. Rechner und Handy, am Handy weniger.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
function teil(geo, hex, wert = 0) { const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new Float32Array(n * 3), a = new Float32Array(n).fill(wert); C.set(hex); for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aTeil', new THREE.BufferAttribute(a, 1)); g.deleteAttribute('uv'); return g; }

function taubeGeo() {
  const kugel = (r, sx, sy, sz, x, y, z) => { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
  const fl = (sg) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([sg * 0.03, 0.15, 0.06, sg * 0.03, 0.15, -0.09, sg * 0.28, 0.15, -0.05, sg * 0.03, 0.15, 0.06, sg * 0.28, 0.15, -0.05, sg * 0.24, 0.15, 0.05], 3)); g.computeVertexNormals(); return g; };
  return mergeGeometries([teil(kugel(0.1, 0.72, 0.72, 1.25, 0, 0.14, 0), '#8a8e96'), teil(kugel(0.055, 1, 1, 1, 0, 0.23, 0.12), '#5f6f78'), teil(new THREE.ConeGeometry(0.014, 0.05, 4).rotateX(Math.PI / 2).translate(0, 0.225, 0.18), '#3a3430'), teil(new THREE.BoxGeometry(0.08, 0.015, 0.14).translate(0, 0.13, -0.16), '#5a5e66'), teil(fl(1), '#7c8088', 1), teil(fl(-1), '#7c8088', -1), teil(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4).translate(0.03, 0.04, 0), '#b05a48'), teil(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4).translate(-0.03, 0.04, 0), '#b05a48')], false);
}
function hundGeo() {
  const b = (x, y, z, w, h, d, hex, t = 0) => teil(new THREE.BoxGeometry(w, h, d, 1, 1, 1).translate(x, y, z), hex, t), r = (rad, l, x, y, z, hex, t = 0) => teil(new THREE.CylinderGeometry(rad, rad * 0.9, l, 7).rotateX(Math.PI / 2).translate(x, y, z), hex, t);
  const fell = '#ffffff', dunkel = '#2a2522';
  return mergeGeometries([r(0.125, 0.62, 0, 0.44, 0, fell), teil(new THREE.IcosahedronGeometry(0.13, 1).scale(1, 1, 1.05).translate(0, 0.44, 0.3), fell), teil(new THREE.IcosahedronGeometry(0.13, 1).translate(0, 0.44, -0.3), fell), b(0, 0.54, 0.4, 0.1, 0.15, 0.12, fell), teil(new THREE.IcosahedronGeometry(0.1, 1).scale(1, 0.95, 1.1).translate(0, 0.66, 0.48), fell), b(0, 0.63, 0.6, 0.075, 0.065, 0.14, fell), b(0, 0.645, 0.675, 0.04, 0.035, 0.02, dunkel), b(0.07, 0.75, 0.43, 0.03, 0.09, 0.06, fell), b(-0.07, 0.75, 0.43, 0.03, 0.09, 0.06, fell), teil(new THREE.IcosahedronGeometry(0.014, 0).translate(0.055, 0.69, 0.57), dunkel), teil(new THREE.IcosahedronGeometry(0.014, 0).translate(-0.055, 0.69, 0.57), dunkel),
    b(0.075, 0.17, 0.25, 0.06, 0.34, 0.06, fell, 1), b(-0.075, 0.17, 0.25, 0.06, 0.34, 0.06, fell, 2), b(0.075, 0.17, -0.27, 0.06, 0.34, 0.07, fell, 3), b(-0.075, 0.17, -0.27, 0.06, 0.34, 0.07, fell, 4), b(0, 0.55, -0.44, 0.035, 0.035, 0.24, fell, 5)], false);
}

// Tauben: mehrere Gruppen um die Kamera
class Tauben {
  constructor(szene, n) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.zeit = { value: 0 };
    mat.onBeforeCompile = sh => {
      sh.uniforms.uZeit = this.zeit;
      sh.vertexShader = 'attribute float aTeil; attribute float aFlug; uniform float uZeit;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float tf = sin(uZeit * 19.0 + float(gl_InstanceID) * 2.1) * 0.9 * aFlug;
  if (abs(aTeil) > 0.5) { float w = abs(transformed.x); transformed.y += w * (tf * 1.35 - 0.35 * (1.0 - aFlug) - 0.05); if (aFlug < 0.5) transformed.x *= 0.45; }`);
    };
    mat.customProgramCacheKey = () => 'taube';
    const g = taubeGeo(); this.flug = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); this.flug.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aFlug', this.flug);
    this.im = new THREE.InstancedMesh(g, mat, n); this.im.frustumCulled = false; this.im.castShadow = false; this.im.name = 'tauben'; this.im.count = 0;
    C.set(0xffffff); for (let i = 0; i < n; i++) { const t = i % 7; this.im.setColorAt(i, C.setRGB(...(t === 0 ? [1.25, 1.2, 1.15] : t === 1 ? [0.6, 0.55, 0.52] : t === 2 ? [1.05, 0.95, 0.85] : [1, 1, 1]))); }
    szene.add(this.im);
    this.gruppen = []; const G = Math.ceil(n / 11); let j = 0;
    for (let k = 0; k < G; k++) { const v = []; for (let i = 0; i < 11 && j < n; i++, j++) v.push({ x: 0, y: 0, z: 0, ry: Math.random() * 6.28, vy: 0, vx: 0, vz: 0, t: Math.random() * 3, pick: 0, schritt: 0, ziel: null }); this.gruppen.push({ v, aktiv: false, cx: 0, cz: 0, flug: 0 }); }
    this.n = n;
  }
  // knoten: Wegenetz des Ortes [[x, z, y, art], ...], stoer: [{pos, r}], H: Bodenhöhe
  update(dt, cam, knoten, stoer, H, tag) {
    this.zeit.value += dt;
    const sichtbar = tag > 0.2 && cam.y - H(cam.x, cam.z) < 120; this.im.visible = sichtbar; if (!sichtbar) return;
    let idx = 0;
    for (const g of this.gruppen) {
      const dk = Math.hypot(g.cx - cam.x, g.cz - cam.z);
      if ((!g.aktiv || dk > 110) && knoten?.length && Math.random() < dt * 2) {   // neu um die Kamera setzen, außerhalb der engen Sicht
        for (let v = 0; v < 8; v++) {
          const k = knoten[Math.floor(Math.random() * knoten.length)], d = Math.hypot(k[0] - cam.x, k[1] - cam.z);
          if (d > 22 && d < 85) { g.cx = k[0]; g.cz = k[1]; g.aktiv = true; for (const b of g.v) { const a = Math.random() * 6.28, r = Math.random() * 3.2; b.x = g.cx + Math.cos(a) * r; b.z = g.cz + Math.sin(a) * r; b.y = H(b.x, b.z) + 0.13; b.vy = b.vx = b.vz = 0; b.ziel = null; } g.flug = 0; break; }
        }
      }
      if (!g.aktiv) continue;
      // jemand kommt zu nah: aufliegen und woanders landen
      if (g.flug <= 0) for (const s of stoer) if (Math.hypot(s.pos.x - g.cx, s.pos.z - g.cz) < s.r) { g.flug = 4 + Math.random() * 2; const k = knoten?.[Math.floor(Math.random() * knoten.length)], a = k ? Math.atan2(k[1] - g.cz, k[0] - g.cx) : Math.random() * 6.28, zx = k ? k[0] : g.cx + Math.cos(a) * 30, zz = k ? k[1] : g.cz + Math.sin(a) * 30; g.zx = zx; g.zz = zz; for (const b of g.v) { b.vy = 2.6 + Math.random() * 1.6; b.ziel = { x: zx + (Math.random() - 0.5) * 6, z: zz + (Math.random() - 0.5) * 6 }; b.vx = (b.x - s.pos.x) * 0.5; b.vz = (b.z - s.pos.z) * 0.5; } g.cx = zx; g.cz = zz; break; }
      g.flug -= dt;
      for (const b of g.v) {
        let fliegt = 0, nick = 0;
        if (b.ziel) {
          fliegt = 1; const dx = b.ziel.x - b.x, dz = b.ziel.z - b.z, d = Math.hypot(dx, dz) || 1, bo = H(b.x, b.z) + 0.13, soll = d < 6 ? bo + d * 0.3 : bo + 9;
          b.vx += (dx / d * 7.5 - b.vx) * Math.min(1, dt * 1.6); b.vz += (dz / d * 7.5 - b.vz) * Math.min(1, dt * 1.6); b.vy += (Math.max(-3, Math.min(3.4, (soll - b.y) * 1.3)) - b.vy) * Math.min(1, dt * 2.2);
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.ry = Math.atan2(b.vx, b.vz);
          if (d < 0.6 && b.y < bo + 0.25) { b.ziel = null; b.y = bo; b.vx = b.vy = b.vz = 0; b.t = Math.random() * 2; }
        } else {
          b.t -= dt;
          if (b.t < 0) { const w = Math.random(); if (w < 0.45) { b.pick = 0.5; b.t = 0.5 + Math.random() * 1.2; } else if (w < 0.85) { b.ry += (Math.random() - 0.5) * 2; b.schritt = 0.4 + Math.random() * 0.7; b.t = b.schritt; } else b.t = 0.6 + Math.random(); }
          if (b.schritt > 0) { b.schritt -= dt; const v = 0.32; b.x += Math.sin(b.ry) * v * dt; b.z += Math.cos(b.ry) * v * dt; b.y = H(b.x, b.z) + 0.13 + Math.abs(Math.sin(b.schritt * 16)) * 0.012; }
          if (b.pick > 0) { b.pick -= dt; nick = Math.sin((0.5 - b.pick) * 12.5) * 0.5 + 0.1; }
        }
        _q.setFromEuler(_e.set(nick + (fliegt ? -0.2 : 0), b.ry, 0, 'YXZ')); _m.compose(_p.set(b.x, b.y - 0.13 + (fliegt ? 0 : 0), b.z), _q, _s.set(1.35, 1.35, 1.35));
        this.im.setMatrixAt(idx, _m); this.flug.array[idx] = fliegt; idx++;
      }
    }
    this.im.count = idx; this.im.instanceMatrix.needsUpdate = true; this.flug.needsUpdate = true;
  }
}

// Hunde: etwa jeder zwölfte Fußgänger in der Nähe führt einen an der Leine
const FELL = [[0.55, 0.37, 0.2], [0.09, 0.08, 0.08], [0.82, 0.78, 0.7], [0.72, 0.52, 0.26], [0.32, 0.26, 0.22], [0.55, 0.53, 0.5]];
class Hunde {
  constructor(szene, n) {
    this.max = n; this.zeit = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uZeit = this.zeit;
      sh.vertexShader = 'attribute float aTeil; attribute vec2 aGang;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  { float t = aTeil, ph = aGang.x, am = aGang.y; if (t > 0.5 && t < 4.5) { float o = t < 1.5 ? 0.0 : t < 2.5 ? 3.14 : t < 3.5 ? 1.57 : 4.71, w = sin(ph + o) * am * 0.5; transformed.z += w * (0.34 - transformed.y); transformed.y += max(0.0, cos(ph + o)) * am * 0.03; } else if (t > 4.5) { transformed.x += sin(ph * 1.5) * 0.09 * (-transformed.z - 0.32) * 4.0; transformed.y += 0.12 * (-transformed.z - 0.32); } else { transformed.y += sin(ph * 2.0) * am * 0.012; } }`);
    };
    mat.customProgramCacheKey = () => 'hund';
    const g = hundGeo(); this.gang = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); this.gang.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aGang', this.gang);
    this.im = new THREE.InstancedMesh(g, mat, n); this.im.frustumCulled = false; this.im.castShadow = true; this.im.count = 0; this.im.name = 'hunde';
    for (let i = 0; i < n; i++) this.im.setColorAt(i, C.setRGB(...FELL[i % FELL.length])); this.im.instanceColor.needsUpdate = true;
    const lg = new THREE.BufferGeometry(); this.leine = new THREE.BufferAttribute(new Float32Array(n * 6), 3); this.leine.setUsage(THREE.DynamicDrawUsage); lg.setAttribute('position', this.leine); this.linien = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1c1c20 })); this.linien.frustumCulled = false; this.linien.name = 'leinen';
    szene.add(this.im, this.linien); this.hunde = new Map();
  }
  update(dt, menge, cam, H) {
    this.zeit.value += dt;
    const L = menge?.alle; if (!L) { this.im.count = 0; this.linien.visible = false; return; }
    let n = 0;
    for (const p of L) {
      if (n >= this.max) break;
      if (p.hund === undefined) p.hund = !p.statisch && p.typ !== 'folger' && !p.partner && Math.random() < 0.085 ? { x: p.pos.x + 1, z: p.pos.z, ry: 0, ph: 0, gr: 0.72 + Math.random() * 0.5, c: Math.floor(Math.random() * 6) } : null;
      if (!p.hund || !p.f.obj.visible) continue;
      const d = (p.pos.x - cam.x) ** 2 + (p.pos.z - cam.z) ** 2; if (d > 8100) continue;
      const h = p.hund, ry = p.f.obj.rotation.y, sx = Math.sin(ry), sz = Math.cos(ry);
      const zx = p.pos.x + sx * 0.9 + sz * 0.75, zz = p.pos.z + sz * 0.9 - sx * 0.75, dx = zx - h.x, dz = zz - h.z, dist = Math.hypot(dx, dz);
      if (dist > 8 && !h.los && !h.fang) { h.x = zx; h.z = zz; }   // Sprung des Halters: Hund mit
      const v = h.los ? h.v : Math.min(5, dist * 2.4), bew = h.los ? h.v > 0.1 : dist > 0.12;
      if (h.los) { if (bew) h.ph += v * dt * 6.5; } else if (bew) { h.x += dx / (dist || 1) * v * dt; h.z += dz / (dist || 1) * v * dt; let w = Math.atan2(dx, dz) - h.ry; w = Math.atan2(Math.sin(w), Math.cos(w)); h.ry += w * Math.min(1, dt * 6); h.ph += v * dt * 6.5; }
      const y = H(h.x, h.z) + 0.02;
      _q.setFromAxisAngle(UP, h.ry); _m.compose(_p.set(h.x, y, h.z), _q, _s.setScalar(h.gr)); this.im.setMatrixAt(n, _m);
      this.gang.array[n * 2] = h.ph; this.gang.array[n * 2 + 1] = bew ? Math.min(1, v / 2) : 0;
      if (this.im.instanceColor) this.im.setColorAt(n, C.setRGB(...FELL[h.c]));
      const bx = h.los ? h.x : p.pos.x + sz * 0.26, bz = h.los ? h.z : p.pos.z - sx * 0.26, by = h.los ? y + 0.58 * h.gr : p.pos.y + 0.92;   // weggelaufen: keine Leine
      this.leine.setXYZ(n * 2, bx, by, bz); this.leine.setXYZ(n * 2 + 1, h.x + Math.sin(h.ry) * 0.42 * h.gr, y + 0.58 * h.gr, h.z + Math.cos(h.ry) * 0.42 * h.gr);
      n++;
    }
    this.im.count = n; this.im.instanceMatrix.needsUpdate = true; this.gang.needsUpdate = true; if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
    this.leine.needsUpdate = true; this.linien.geometry.setDrawRange(0, n * 2); this.linien.visible = n > 0;
  }
}

export class Tiere {
  constructor(szene, { mobil = false } = {}) { this.tauben = new Tauben(szene, mobil ? 44 : 110); this.hunde = new Hunde(szene, mobil ? 6 : 18); this.stoer = []; }
  update(dt, cam, { knoten, menge, H, tag, spieler = null, spielerR = 6, an = true }) {
    if (!an) { this.tauben.im.visible = false; this.hunde.im.visible = false; this.hunde.linien.visible = false; return; }
    this.hunde.im.visible = true;
    this.stoer.length = 0; if (spieler) this.stoer.push({ pos: spieler, r: spielerR });
    this.tauben.update(dt, cam, knoten, this.stoer, H, tag);
    this.hunde.update(dt, menge, cam, H);
  }
}
