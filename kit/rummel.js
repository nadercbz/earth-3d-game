// Freizeitparks und Golfplätze (07.11.2026, Karte Freizeitparks, Nader: "alles, was in der echten Welt will ich da auch haben"). Lage aus den Kartendaten (landuse theme_park, landcover golf_course, kit/ortbau.js), die Fahrgeschäfte sind frei gestaltet, ohne Marken, in echten Metern.
// Achterbahn mit Lifthügel und Zug auf Schienen (Tempo aus der Höhe), Kettenkarussell, Freifallturm, Buden. Golf: Flaggen auf den Grüns (die Grüns und Bunker zeichnet kit/ort.js als Flächen).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const std = (c, r = 0.55, m = 0.15) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const FARBE = [0xd8342c, 0x1e6fc0, 0xe0a51a, 0x1f9a62, 0xc2387e, 0xe8681a];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _e = new THREE.Euler();
const faerben = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const nurIndex = g => g.index ? g.toNonIndexed() : g;
const box = (w, h, d, x, y, z, hex) => faerben(nurIndex(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), hex);
const zyl = (r0, r1, h, x, y, z, hex, n = 8) => faerben(nurIndex(new THREE.CylinderGeometry(r0, r1, h, n).translate(x, y, z)), hex);
const LACK = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12 });

// Achterbahn: geschlossene Kurve aus Grundriss und Höhen, in Metern, x längs, z quer
function bahnKurve(L, B, sk) {
  const P = [[-0.48, 0, 0.1], [-0.3, 0.02, 0.34], [-0.14, 0.05, 1], [0.0, 0.3, 0.28], [0.2, 0.46, 0.64], [0.4, 0.3, 0.18], [0.48, 0, 0.46], [0.4, -0.3, 0.12], [0.22, -0.46, 0.42], [0.04, -0.4, 0.1], [-0.2, -0.46, 0.3], [-0.42, -0.34, 0.1]];
  return new THREE.CatmullRomCurve3(P.map(([u, v, h]) => new THREE.Vector3(u * L, 2 + h * sk, v * B)), true, 'centripetal');
}
function achterbahn(q) {
  const L = q.L, B = q.B, sk = Math.min(34, L * 0.32), kurve = bahnKurve(L, B, sk), N = 420, TS = [], g = new THREE.Group(); g.name = 'achterbahn'; const up = new THREE.Vector3(0, 1, 0), hexS = FARBE[Math.abs(Math.round(q.x * 7 + q.z * 3)) % FARBE.length];
  // Punkte gleichmäßig über die Länge mit Rahmen
  const len = kurve.getLength(); for (let i = 0; i <= N; i++) { const s = i / N, p = kurve.getPointAt(s % 1), t = kurve.getTangentAt(s % 1), r = new THREE.Vector3().crossVectors(t, up).normalize(); TS.push({ p, t, r }); }
  const rohr = (off, y0, rd, hex) => { const P = TS.slice(0, N).map(f => f.p.clone().addScaledVector(f.r, off).add(new THREE.Vector3(0, y0, 0))); return faerben(nurIndex(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(P, true), N, rd, 5, true)), hex); };
  const T = [rohr(0.55, 0, 0.055, 0xcfd2d6), rohr(-0.55, 0, 0.055, 0xcfd2d6), rohr(0, -0.42, 0.16, hexS)];
  for (let i = 0; i < N; i += 7) { const f = TS[i]; if (f.p.y < 3.4) continue; const h = f.p.y - 0.45; const st = zyl(0.14, 0.2, h, f.p.x, h / 2, f.p.z, hexS, 6); T.push(st); }
  for (let i = 0; i < N; i += 3) { const f = TS[i], b = new THREE.BoxGeometry(1.25, 0.06, 0.12); _m.lookAt(new THREE.Vector3(), f.t, up); _m.setPosition(f.p.x, f.p.y - 0.06, f.p.z); b.applyMatrix4(_m); T.push(faerben(nurIndex(b), 0x8b8f94)); }
  // Station
  const f0 = TS[2]; T.push(box(16, 0.3, 5.2, f0.p.x - 2, 1.5, f0.p.z, 0x6b6f75), box(16.6, 0.25, 5.8, f0.p.x - 2, 5.2, f0.p.z, hexS)); for (const a of [-9, 5]) for (const b of [-2.4, 2.4]) T.push(zyl(0.12, 0.12, 5.2, f0.p.x + a, 2.6, f0.p.z + b, 0xdddddd, 6));
  const netz = new THREE.Mesh(mergeGeometries(T), LACK()); netz.castShadow = true; netz.receiveShadow = true; g.add(netz);
  // Zug: Wagen als Instanzen, Tempo aus der Energie, Lifthügel mit fester Geschwindigkeit
  const wagen = mergeGeometries([box(1.5, 0.55, 2.0, 0, 0.32, 0, 0xc92a2a), box(1.3, 0.5, 0.18, 0, 0.72, -0.85, 0x1a1a1e), box(1.3, 0.5, 0.18, 0, 0.72, 0.1, 0x1a1a1e), box(1.42, 0.06, 2.0, 0, 0.06, 0, 0x3a3a40)]), zug = new THREE.InstancedMesh(wagen, LACK(), 6); zug.frustumCulled = false; zug.castShadow = true; g.add(zug);
  let hMax = 0, iMax = 0; for (let i = 0; i < N; i++) if (TS[i].p.y > hMax) { hMax = TS[i].p.y; iMax = i; }
  const Z = { s: Math.random(), v: 3 }, FR = i => TS[((i % N) + N) % N];
  const tick = dt => { const i = Z.s * N, f = FR(Math.floor(i)), lift = i < iMax && i > 8; const vS = lift ? 3.6 : Math.max(6, Math.sqrt(Math.max(1, 2 * 9.81 * (hMax - f.p.y + 0.8)))); Z.v += (vS - Z.v) * Math.min(1, dt * (lift ? 2 : 3.5)); Z.s = (Z.s + Z.v * dt / len + 1) % 1; for (let k = 0; k < 6; k++) { const a = Z.s * N - k * (2.4 / len * N), a0 = Math.floor(a), F = FR(a0), G = FR(a0 + 1), w = a - a0; _p.lerpVectors(F.p, G.p, w); _t.lerpVectors(F.t, G.t, w).normalize(); _r.crossVectors(_t, up).normalize(); _u.crossVectors(_r, _t); _m.makeBasis(_r, _u, _t); _m.setPosition(_p); zug.setMatrixAt(k, _m); } zug.instanceMatrix.needsUpdate = true; };
  return { g, tick };
}
function kettenkarussell() {
  const g = new THREE.Group(); g.name = 'karussell'; const H = 13, Rd = 5.4, n = 16, SK = FARBE;
  const fest = mergeGeometries([zyl(0.5, 0.75, H, 0, H / 2, 0, 0xd8c9a0, 10), zyl(3.6, 3.9, 0.5, 0, 0.25, 0, 0xb9b3a5, 16)]), mF = new THREE.Mesh(fest, LACK()); mF.castShadow = true; g.add(mF);
  const dreh = new THREE.Group(); dreh.position.y = H - 0.6; g.add(dreh); const T = []; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, geo = nurIndex(new THREE.ConeGeometry(Rd + 0.9, 2.6, 3, 1, true, a0, a1 - a0).translate(0, 1.1, 0)); T.push(faerben(geo, i % 2 ? 0xf2efe6 : SK[i % SK.length])); } T.push(zyl(Rd + 0.9, Rd + 0.9, 0.5, 0, -0.1, 0, 0xe6c35a, 24)); const dach = new THREE.Mesh(mergeGeometries(T), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide })); dach.castShadow = true; dreh.add(dach);
  const sitz = mergeGeometries([box(0.55, 0.08, 0.55, 0, -3.9, 0, 0xc92a2a), box(0.55, 0.5, 0.08, 0, -3.65, -0.24, 0xc92a2a), zyl(0.012, 0.012, 3.9, 0, -1.95, 0, 0x9a9a9a, 4)]), sz = new THREE.InstancedMesh(sitz, LACK(), n); sz.frustumCulled = false; dreh.add(sz);
  let w = Math.random() * 6, om = 0, tP = 0, an = true;
  const tick = dt => { tP -= dt; if (tP <= 0) { an = !an; tP = an ? 34 : 11; } om += ((an ? 1.45 : 0) - om) * Math.min(1, dt * 0.45); w += om * dt; dreh.rotation.y = w; const kipp = Math.atan(om * om * (Rd + 1) / 9.81) * 0.95; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = Math.cos(a) * Rd, z = Math.sin(a) * Rd; _e.set(0, -a + Math.PI / 2, 0); _q.setFromEuler(_e); const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -kipp); _q.multiply(qq); _m.compose(_p.set(x, 0, z), _q, _s); sz.setMatrixAt(i, _m); } sz.instanceMatrix.needsUpdate = true; };
  return { g, tick };
}
function freifallturm() {
  const g = new THREE.Group(); g.name = 'freifall'; const H = 46; const T = [zyl(0.9, 1.3, H, 0, H / 2, 0, 0xd8342c, 10), zyl(3.4, 3.8, 0.6, 0, 0.3, 0, 0xb9b3a5, 14), zyl(1.4, 1, 1.6, 0, H + 0.6, 0, 0xe0a51a, 10)]; for (let y = 5; y < H; y += 5) T.push(zyl(1.25 - y * 0.008, 1.25 - y * 0.008, 0.16, 0, y, 0, 0xeeeeee, 12)); const m = new THREE.Mesh(mergeGeometries(T), LACK()); m.castShadow = true; g.add(m);
  const G = [zyl(2.5, 2.5, 0.5, 0, 0, 0, 0x1e6fc0, 16)]; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; G.push(box(0.56, 1.1, 0.5, Math.cos(a) * 2.9, -0.2, Math.sin(a) * 2.9, 0x1a1a1e)); } const gondel = new THREE.Mesh(mergeGeometries(G), LACK()); gondel.castShadow = true; g.add(gondel);
  let ph = 'unten', y = 1.8, tP = 4, v = 0; gondel.position.y = y;
  const tick = dt => { if (ph === 'unten') { tP -= dt; if (tP <= 0) ph = 'hoch'; } else if (ph === 'hoch') { y += 3 * dt; if (y >= H - 3) { ph = 'oben'; tP = 3 + Math.random() * 3; } } else if (ph === 'oben') { tP -= dt; if (tP <= 0) { ph = 'fall'; v = 0; } } else if (ph === 'fall') { if (y > 14) { v = Math.min(v + 9.81 * dt, 30); y -= v * dt; } else { v *= Math.max(0, 1 - dt * 2.4); y = Math.max(1.8, y - Math.max(v, 1.2) * dt); if (y <= 1.81) { ph = 'unten'; tP = 7; } } } gondel.position.y = y; };
  return { g, tick };
}
function buden(R, n) {
  const T = []; let z = R(); for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, r = 4 + R() * 26, x = Math.cos(a) * r, y = Math.sin(a) * r, w = 3 + R() * 1.5, hex = FARBE[Math.floor(R() * FARBE.length)], ry = R() * 3.14; const q = [box(w, 2.3, 2.4, 0, 1.15, 0, 0xe9e4d4), box(w + 0.8, 0.14, 3.2, 0, 2.5, 0.2, hex), box(w - 0.5, 0.9, 0.06, 0, 1.0, 1.23, 0x20242a)]; for (const b of q) { b.rotateY(ry); b.translate(x, 0, y); T.push(b); } z += 1; }
  return T.length ? new THREE.Mesh(mergeGeometries(T), LACK()) : null;
}

export class Rummel {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'rummel'; this.teile = []; const D = ort.daten.freizeit || {}, H = ort.H, seed = Math.abs(Math.round((ort.daten.meta?.lat || 0) * 997 + (ort.daten.meta?.lon || 0) * 613)) + 3; let s = seed; const R = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    for (const q of D.rummel || []) { const g0 = new THREE.Group(); g0.position.set(q.x, H(q.x, q.z), q.z); g0.rotation.y = q.ry || 0; const T = q.art === 'bahn' ? achterbahn(q) : q.art === 'karussell' ? kettenkarussell() : q.art === 'turm' ? freifallturm() : null; if (q.art === 'buden') { const m = buden(R, mobil ? 6 : 14); if (m) { m.castShadow = true; m.receiveShadow = true; g0.add(m); } } if (T) { g0.add(T.g); this.teile.push({ x: q.x, z: q.z, tick: T.tick }); } this.gruppe.add(g0); }
    // Golf: Flaggen auf den Grüns
    const F = D.golf?.fahnen || []; if (F.length) { const G = mergeGeometries([zyl(0.012, 0.012, 2.2, 0, 1.1, 0, 0xf2f2ee, 5), box(0.5, 0.3, 0.012, 0.25, 2.05, 0, 0xd8342c)]), im = new THREE.InstancedMesh(G, LACK(), F.length); F.forEach((f, i) => { _m.compose(_p.set(f[0], H(f[0], f[1]), f[1]), _q.identity(), _s); im.setMatrixAt(i, _m); }); im.name = 'golf fahnen'; im.frustumCulled = false; this.gruppe.add(im); }
  }
  update(dt, cam) { for (const t of this.teile) if ((t.x - cam.x) ** 2 + (t.z - cam.z) ** 2 < 640000) t.tick(Math.min(dt, 0.05)); }
  entsorgen() { this.gruppe.traverse(o => { o.geometry?.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }); this.gruppe.removeFromParent(); }
}
