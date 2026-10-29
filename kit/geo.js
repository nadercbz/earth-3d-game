// Geometrie Sammler: Flächen je Material sammeln, am Ende ein Mesh je Material (wenige Zeichenaufrufe).
// UV in Metern per Projektion: waagrechte Flächen (x, z), senkrechte Flächen (entlang der Fläche, Höhe).
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();

export class Bau {
  constructor() { this.parts = new Map(); }

  part(key) {
    let p = this.parts.get(key);
    if (!p) { p = { pos: [], nor: [], uv: [] }; this.parts.set(key, p); }
    return p;
  }

  // Dreieck mit fester Normale und UV aus Projektion. leer: nichts speichern (Aufzeichnungslauf für Fensteröffnungen, kit/interior.js)
  tri(key, a, b, c, n) {
    if (this.leer) return;
    const p = this.part(key);
    const flat = Math.abs(n.y) > 0.7;
    if (!flat) _t.crossVectors(UP, n).normalize();
    for (const v of [a, b, c]) {
      p.pos.push(v.x, v.y, v.z); p.nor.push(n.x, n.y, n.z);
      if (flat) p.uv.push(v.x, -v.z); else p.uv.push(v.x * _t.x + v.z * _t.z, v.y);
    }
  }

  // Viereck a b c d, Wicklung wird automatisch zur gewünschten Normale gedreht
  face(key, a, b, c, d, want) {
    _a.subVectors(b, a); _b.subVectors(d, a); _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12) { _a.subVectors(c, b); _b.subVectors(a, b); _n.crossVectors(_a, _b); }
    if (want && _n.dot(want) < 0) { const t = b; b = d; d = t; _n.negate(); }
    const n = _n.clone().normalize();
    this.tri(key, a, b, c, n); this.tri(key, a, c, d, n);
  }

  // Quader aus 8 Ecken: unten (0 1 2 3), oben (4 5 6 7), jeweils im Kreis
  hexa(key, c, skip = {}) {
    const mid = new THREE.Vector3(); c.forEach(v => mid.add(v)); mid.multiplyScalar(1 / 8);
    const F = [[0, 1, 2, 3, 'unten'], [4, 5, 6, 7, 'oben'], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (const f of F) {
      if (f[4] && skip[f[4]]) continue;
      const a = c[f[0]], b = c[f[1]], cc = c[f[2]], d = c[f[3]];
      const fm = new THREE.Vector3().add(a).add(b).add(cc).add(d).multiplyScalar(0.25);
      this.face(key, a, b, cc, d, fm.sub(mid));
    }
  }

  // Achsparalleler Quader (in lokalen Koordinaten), optional um y gedreht
  box(key, cx, cy, cz, sx, sy, sz, rotY = 0) {
    const co = Math.cos(rotY), si = Math.sin(rotY);
    const P = (x, y, z) => new THREE.Vector3(cx + x * co + z * si, cy + y, cz - x * si + z * co);
    const hx = sx / 2, hz = sz / 2;
    this.hexa(key, [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz)]);
  }

  // Fläche aus Polygon [[x, z], ...] auf Höhe y (nach oben oder unten)
  poly(key, pts, y, down = false) {
    const v2 = pts.map(p => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    const n = new THREE.Vector3(0, down ? -1 : 1, 0);
    for (const t of tris) {
      const A = new THREE.Vector3(pts[t[0]][0], y, pts[t[0]][1]), B = new THREE.Vector3(pts[t[1]][0], y, pts[t[1]][1]), C = new THREE.Vector3(pts[t[2]][0], y, pts[t[2]][1]);
      _a.subVectors(B, A); _b.subVectors(C, A); _n.crossVectors(_a, _b);
      if (_n.y * n.y < 0) this.tri(key, A, C, B, n); else this.tri(key, A, B, C, n);
    }
  }

  // Beliebige Geometrie anhängen (Zylinder, Kegel ...), UV der Geometrie bleiben
  geo(key, g, matrix) {
    if (this.leer) return;
    const ng = g.index ? g.toNonIndexed() : g.clone();
    if (matrix) ng.applyMatrix4(matrix);
    const p = this.part(key), P = ng.attributes.position, N = ng.attributes.normal, U = ng.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      p.pos.push(P.getX(i), P.getY(i), P.getZ(i)); p.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      p.uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
  }

  build(mats, { shadow = true } = {}) {
    const g = new THREE.Group();
    for (const [key, p] of this.parts) {
      if (!p.pos.length) continue;
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      bg.computeBoundingSphere();
      const m = new THREE.Mesh(bg, mats[key] || mats.putz);
      m.name = key;
      m.castShadow = shadow && !key.startsWith('glas') && !key.startsWith('markierung');
      m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }
}

// Ring um ein Polygon nach außen versetzt (Gehrung an den Ecken), Punkte [[x, z]], gegen den Uhrzeigersinn von oben
export function offsetRing(pts, d) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const n1 = edgeNormal(p0, p1), n2 = edgeNormal(p1, p2);
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = d / Math.max(0.25, mx * n1[0] + mz * n1[1]);
    out.push([p1[0] + mx * k, p1[1] + mz * k]);
  }
  return out;
}

// Außennormale einer Kante (Polygon gegen den Uhrzeigersinn in x, z mit positiver Fläche)
export function edgeNormal(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dz / l, -dx / l];
}

export function area(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

export function orient(pts) { return area(pts) < 0 ? pts.slice().reverse() : pts.slice(); }

export function inside(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export function edgeDist(pts, x, z) {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    m = Math.min(m, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return m;
}

// Fester Zufall aus einem Seed
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
