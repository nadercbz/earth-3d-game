// Gelände ohne Straßen (06.11.2026, offener Punkt "Wüsten zu Fuß"): Sahara, Eis, Tundra und Hochgebirge haben jetzt einen Ort aus reinem Gelände, man kann überall aussteigen. Felsen und trockene Büsche nach festem Zufall je Stelle,
// Farbe aus dem Satellitenbild unter dem Fels. Auf Schnee und Eis bleibt fast nichts stehen.
import * as THREE from 'three';
import { fotoMaterial } from './ortfoto.js';

const rng = seed => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
// Fels: Kugel, von Ebenen gekappt: klare Bruchflächen statt Klumpen
function felsGeo(detail, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, R = rng(seed), v = new THREE.Vector3();
  const ebenen = Array.from({ length: 9 }, () => ({ n: new THREE.Vector3(R() - 0.5, R() * 0.9 - 0.25, R() - 0.5).normalize(), d: 0.48 + R() * 0.38 }));
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); for (const e of ebenen) { const h = v.dot(e.n); if (h > e.d) v.addScaledVector(e.n, e.d - h); } p.setXYZ(i, v.x * 1.12, v.y * (v.y < 0 ? 0.55 : 0.8), v.z); }
  g.computeVertexNormals(); return g;
}
// Busch: niedrig, zerzaust, aus wenigen Flächen
function buschGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, R = rng(seed), v = new THREE.Vector3(); const f = new Map();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`; if (!f.has(k)) f.set(k, 0.55 + R() * 0.75); const s = f.get(k); p.setXYZ(i, v.x * s, Math.max(v.y, -0.15) * s * 0.7 + 0.1, v.z * s); }
  g.computeVertexNormals(); return g;
}

export class Wildnis {
  constructor(ort, foto, { mobil = false } = {}) {
    this.gruppe = new THREE.Group(); this.gruppe.name = 'wildnis'; this.teile = [];
    const H = ort.H, halb = ort.halb - 6, m = ort.daten.meta, R = rng((Math.imul(Math.round(m.lat * 1000), 73856093) ^ Math.imul(Math.round(m.lon * 1000), 19349663)) >>> 0);
    const stein = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.96, metalness: 0 }), matF = foto ? fotoMaterial(stein, foto, 0, 1) : stein, matB = new THREE.MeshStandardMaterial({ color: 0x5f5a36, roughness: 1, metalness: 0 });
    // Gruppen: Felsen liegen in Feldern, nicht gleichmäßig. Dazu wenige einzelne
    const felder = Array.from({ length: 34 }, () => ({ x: (R() * 2 - 1) * halb, z: (R() * 2 - 1) * halb, r: 25 + R() * 110 }));
    const ort2 = () => { if (R() < 0.3) return [(R() * 2 - 1) * halb, (R() * 2 - 1) * halb]; const f = felder[Math.floor(R() * felder.length)], a = R() * 6.2832, d = Math.sqrt(R()) * f.r; return [THREE.MathUtils.clamp(f.x + Math.cos(a) * d, -halb, halb), THREE.MathUtils.clamp(f.z + Math.sin(a) * d, -halb, halb)]; };
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), E = new THREE.Euler();
    const legen = (geo, mat, n, s0, s1, schatten, tief) => { const im = new THREE.InstancedMesh(geo, mat, n); for (let i = 0; i < n; i++) { const [x, z] = ort2(), s = s0 + (s1 - s0) * R() * R(); E.set((R() - 0.5) * 0.5, R() * 6.2832, (R() - 0.5) * 0.5); Q.setFromEuler(E); S.set(s * (0.75 + R() * 0.6), s * (0.6 + R() * 0.5), s * (0.75 + R() * 0.6)); P.set(x, H(x, z) - s * tief, z); im.setMatrixAt(i, M.compose(P, Q, S)); } im.castShadow = schatten; im.receiveShadow = true; im.frustumCulled = false; im.computeBoundingSphere(); this.gruppe.add(im); this.teile.push(im); return im; };
    this.felsen = [legen(felsGeo(0, 11), matF, mobil ? 200 : 900, 0.12, 0.6, false, 0.2), legen(felsGeo(1, 23), matF, mobil ? 60 : 280, 0.4, 1.5, !mobil, 0.25), legen(felsGeo(2, 37), matF, mobil ? 12 : 54, 1.3, 5.5, !mobil, 0.3)];
    this.buesche = legen(buschGeo(5), matB, mobil ? 80 : 340, 0.22, 0.75, false, 0.05);
    this.mats = [stein, matF, matB]; this.foto = foto;
    if (foto?.mittel) this.fotoDa(foto.mittel); else if (foto) foto.beiFoto = m => this.fotoDa(m);
  }
  // Farbe des Bilds im Mittel (sRGB 0 bis 1): Schnee und Eis fast ohne Felsen und ohne Büsche, Sand mit wenigen, grauer Fels mit vielen
  fotoDa([r, g, b]) {
    const l = 0.3 * r + 0.59 * g + 0.11 * b, schnee = l > 0.62 && Math.max(r, g, b) - Math.min(r, g, b) < 0.09, k = schnee ? 0.04 : 1;
    this.buesche.count = schnee ? 0 : Math.round(this.buesche.count * (r > g * 1.02 ? 1 : 0.6));
    for (const f of this.felsen) f.count = Math.round(f.count * k);
  }
  entsorgen() { if (this.foto) this.foto.beiFoto = null; for (const t of this.teile) { t.geometry.dispose(); t.dispose(); } for (const m of this.mats) m.dispose(); this.gruppe.removeFromParent(); }
}
