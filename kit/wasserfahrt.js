// Auf und unter dem Wasser (06.11.2026, Wunsch Nr. 64: "Ich möchte auch schwimmen können, auch unter Wasser ... mit den richtigen Tiefen ... U-Boot ... Speedboat, Jet Ski"). Physik und Modelle von Speedboot, Jetski, U-Boot und Schwimmer. Lage in Grad und Metern über dem Meer, wie die Flieger (kit/jet.js), darum kommen sie überall auf der Erde hin. Modelle frei erfunden, keine Marken, Maßstab 1 zu 1.
import * as THREE from 'three';
import { geoZuSzene, enu } from './erde.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const D2R = Math.PI / 180, R2D = 180 / Math.PI, kl = THREE.MathUtils.clamp, G = 9.81;
export const WASSER_ARTEN = {
  speedboot: { name: 'Speedboot', vMax: 30, a: 6.2, lenk: 0.72, L: 8.4, kam: [13, 3.9], roll: 0.32, gleit: 0.12, tiefgang: 0.22 },
  jetski: { name: 'Jetski', vMax: 32, a: 9.5, lenk: 1.45, L: 3.3, kam: [6.8, 2.5], roll: 0.62, gleit: 0.09, tiefgang: 0.16 },
  uboot: { name: 'U-Boot', vMax: 11, a: 1.8, lenk: 0.42, L: 7.6, kam: [15, 4.2], tauch: true, vz: 5, roll: 0.14, tiefgang: 0.55 },
  schwimmer: { name: 'Schwimmen', vMax: 1.5, a: 1.7, lenk: 2.4, L: 1.8, kam: [5.4, 2.1], tauch: true, vz: 1.2, roll: 0, tiefgang: 0 },
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

export class Wasserfz {
  // hilfe: welle(lat, lon) Höhe der Oberfläche, boden(lat, lon) Meeresboden (negativ), wasser(lat, lon) ist hier Wasser
  constructor(art, hilfe) { this.art = art; this.d = WASSER_ARTEN[art]; this.hilfe = hilfe; this.geo = { lat: 0, lon: 0, h: 0 }; this.kursR = 0; this.kurs = 0; this.vF = 0; this.vZ = 0; this.nick = 0; this.rollW = 0; this.hub = 0; this.vHub = 0; this.lenkS = 0; this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.kmh = 0; this.agl = 0; this.amBoden = true; this.absturz = false; this.nach = 0; this.gas = 0; this.motor = 0; this.tiefeBoden = 0; this.tauchen = false; this.sigma = 1; this.mach = 0; }
  setze(lat, lon, h, kursGrad, v = 0) { this.geo.lat = lat; this.geo.lon = lon; this.geo.h = h; this.kursR = kursGrad * D2R; this.vF = v; this.vZ = 0; this.hub = h; this.aktualisiere(); }
  get unter() { return this.geo.h < -this.d.L * 0.08 - 0.15; }
  schritt(dt, e) {
    const d = this.d, H = this.hilfe, g = this.geo, cl = Math.max(0.05, Math.cos(g.lat * D2R)); this.gas = e.gas; this.motor += (Math.abs(e.gas) - this.motor) * Math.min(1, dt * 2.5);
    const bodenH = H.boden(g.lat, g.lon); this.tiefeBoden = bodenH; const tief = Math.max(0, -g.h);
    // Tempo: unter Wasser mit Shift sehr viel schneller, je tiefer desto mehr, sonst dauert der Weg zum Marianengraben Stunden (rund 11 km)
    let vMax = d.vMax, vzMax = d.vz || 0, a = d.a; if (d.tauch && e.schnell) { const f = 1 + Math.min(tief, 11000) / (this.art === 'uboot' ? 90 : 60); vMax = (this.art === 'uboot' ? 26 : 3.2) * Math.min(f, 16); vzMax = (this.art === 'uboot' ? 12 : 3) * Math.min(f, 20); a *= 2.4 + Math.min(f, 12); } else if (e.schnell) vMax *= 1.14;
    const ziel = e.gas >= 0 ? e.gas * vMax : e.gas * vMax * (d.tauch ? 0.4 : 0.25); let dv = ziel - this.vF; const br = this.vF * e.gas < 0 ? 2.2 : 1; this.vF += kl(dv, -a * br * dt, a * dt);
    if (Math.abs(e.gas) < 0.03) this.vF *= Math.exp(-dt * (d.tauch ? 0.5 : 0.35));
    const wirk = kl(Math.abs(this.vF) / (this.art === 'schwimmer' ? 0.2 : 5), this.art === 'schwimmer' ? 0.65 : 0.12, 1); this.lenkS += (e.lenk - this.lenkS) * Math.min(1, dt * 5); this.kursR += this.lenkS * d.lenk * wirk * Math.sign(this.vF || 1) * dt;
    const s = this.vF * dt, la2 = g.lat + Math.cos(this.kursR) * s / 111195, lo2 = g.lon + Math.sin(this.kursR) * s / (111195 * cl);
    if (!d.tauch || tief < 2) { const prL = g.lat + Math.cos(this.kursR) * Math.sign(this.vF || 1) * (d.L * 0.5 + Math.abs(this.vF) * 0.25) / 111195, prO = g.lon + Math.sin(this.kursR) * Math.sign(this.vF || 1) * (d.L * 0.5 + Math.abs(this.vF) * 0.25) / (111195 * cl); if (this.art !== 'schwimmer' && !H.wasser(prL, prO)) { this.vF *= -0.28; this.aufLand = 0.4; } else { g.lat = la2; g.lon = lo2; } }
    else { g.lat = la2; g.lon = lo2; }
    g.lon = ((g.lon + 540) % 360) - 180;
    if (d.tauch) {
      // Auftauchen und Abtauchen; an der Oberfläche liegt man in den Wellen
      const w = H.welle(g.lat, g.lon), vzZ = e.auf * vzMax; this.vZ += kl(vzZ - this.vZ, -a * dt * 1.2, a * dt * 1.2); g.h += this.vZ * dt; const obenMax = w - d.tiefgang;
      if (g.h >= obenMax || (e.auf >= 0 && g.h > obenMax - 0.5 && this.vZ > -0.2)) { g.h += (obenMax - g.h) * Math.min(1, dt * 4); if (this.vZ > 0) this.vZ = 0; }   // liegt in den Wellen, geht mit ihnen auf und ab
      const bH = Math.min(bodenH + (this.art === 'uboot' ? 2.2 : 1), obenMax); if (g.h < bH) { g.h = bH; if (this.vZ < 0) this.vZ = 0; }
      this.tauchen = g.h < -1.2;
      const gamma = Math.atan2(this.vZ, Math.max(0.6, Math.abs(this.vF))); this.nick += (kl(gamma, -1.05, 1.05) - this.nick) * Math.min(1, dt * 2.2); const rollZiel = -this.lenkS * d.roll * Math.min(1, Math.abs(this.vF) / 4); this.rollW += (rollZiel - this.rollW) * Math.min(1, dt * 2.5);
    } else {
      // Rumpf auf den Wellen: vier Punkte fragen, weich folgen. Aus schneller Fahrt hebt er auf Wellenbergen ab und fällt zurück
      const f = [Math.sin(this.kursR), Math.cos(this.kursR)], Lh = d.L * 0.42, Bh = d.L * 0.13, H0 = H.welle(g.lat, g.lon), V = H.welle(g.lat + f[1] * Lh / 111195, g.lon + f[0] * Lh / (111195 * cl)), Hi = H.welle(g.lat - f[1] * Lh / 111195, g.lon - f[0] * Lh / (111195 * cl)), Li = H.welle(g.lat + f[0] * Bh / 111195, g.lon - f[1] * Bh / (111195 * cl)), Re = H.welle(g.lat - f[0] * Bh / 111195, g.lon + f[1] * Bh / (111195 * cl));
      const wM = (H0 * 2 + V + Hi + Li + Re) / 6, vK = Math.abs(this.vF), gl = kl((vK - 4) / 9, 0, 1) * (1 - kl((vK - 18) / 14, 0, 0.55)), hebt = gl * 0.2 + kl(vK / d.vMax, 0, 1) * 0.15, ziel0 = wM - d.tiefgang + hebt;
      if (this.hub <= ziel0 + 0.05) { this.vHub += (70 * (ziel0 - this.hub) - 9 * this.vHub) * dt; this.imWasser = true; } else { this.vHub -= G * dt * 1.15; this.imWasser = false; }
      this.hub += this.vHub * dt; if (this.hub < ziel0 - 0.7) { this.hub = ziel0 - 0.7; this.vHub = Math.max(this.vHub, 0); } g.h = this.hub;
      const nickW = Math.atan2(V - Hi, Lh * 2), rollW = Math.atan2(Li - Re, Bh * 2) * 0.5, nZ = nickW * (this.imWasser ? 0.8 : 0.3) + (d.gleit || 0) * gl, rZ = -this.lenkS * d.roll * kl(vK / 14, 0, 1) + rollW * 0.7; this.nick += (nZ - this.nick) * Math.min(1, dt * 3.4); this.rollW += (rZ - this.rollW) * Math.min(1, dt * 3.2);
    }
  }
  aktualisiere() {
    const g = this.geo; this.kurs = ((this.kursR * R2D) % 360 + 360) % 360; this.kmh = Math.abs(this.vF) * 3.6; geoZuSzene(g.lat, g.lon, g.h, this.p); this.agl = g.h - this.tiefeBoden; const e = enu(g.lat, g.lon), ck = Math.cos(this.kursR), sk = Math.sin(this.kursR);
    _a.copy(e.nord).multiplyScalar(ck).addScaledVector(e.ost, sk); const cn = Math.cos(this.nick), sn = Math.sin(this.nick); _b.copy(_a).multiplyScalar(cn).addScaledVector(e.oben, sn); _c.crossVectors(e.oben, _b).normalize(); const up = new THREE.Vector3().crossVectors(_b, _c).normalize();
    _q.setFromRotationMatrix(_m.makeBasis(_c, up, _b)); this.q.copy(_q).multiply(_rz.setFromAxisAngle(_Z, this.rollW)); this.v.copy(_a).multiplyScalar(this.vF).addScaledVector(e.oben, this.vZ);
  }
}
const _rz = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1);

// ---------- Modelle: Rumpf aus Spanten (je Spant z, halbe Breite b, Kiel unter der Wasserlinie d, Bordwand oben h) ----------
function rumpf(S, farbe, deck = true) {
  const P = [], C = [], I = [], Q = 7; let v = 0;
  for (const s of S) for (let k = 0; k <= Q; k++) { const t = k / Q * 2 - 1, a = Math.abs(t), chine = 0.72, x = a < chine ? (a / chine) * s.b * 0.86 : (0.86 + (a - chine) / (1 - chine) * 0.14) * s.b, y = a < chine ? -s.d * (1 - a / chine) - s.d * 0.14 * (a / chine) : -s.d * 0.14 + (a - chine) / (1 - chine) * (s.h + s.d * 0.14); P.push(Math.sign(t) * x, y, s.z); const f = farbe(y, s.z, t); C.push(f[0], f[1], f[2]); }
  const n = Q + 1; for (let i = 0; i < S.length - 1; i++) for (let k = 0; k < Q; k++) { const a = i * n + k, b = a + 1, c = a + n, d = c + 1; I.push(a, b, c, b, d, c); } v = S.length * n;
  if (deck) { for (const s of S) { for (const q of [-1, 0, 1]) { P.push(q * s.b, s.h + (q === 0 ? s.b * 0.04 : 0), s.z); const f = farbe(99, s.z, q); C.push(f[0], f[1], f[2]); } } for (let i = 0; i < S.length - 1; i++) for (let k = 0; k < 2; k++) { const a = v + i * 3 + k, b = a + 1, c = a + 3, d = c + 1; I.push(a, c, b, b, c, d); } }
  // Heckspiegel: Fläche über den ersten Spant, sonst sieht man von hinten in den Rumpf
  { const s = S[0], m = P.length / 3; P.push(0, (s.h - s.d) * 0.5, s.z); const f0 = farbe(s.h * 0.7, s.z, 0); C.push(f0[0], f0[1], f0[2]); for (let k = 0; k <= Q; k++) { P.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); C.push(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]); } for (let k = 0; k < Q; k++) I.push(m, m + k + 1, m + k + 2); const m2 = P.length / 3; P.push(-s.b, s.h, s.z, s.b, s.h, s.z); C.push(f0[0], f0[1], f0[2], f0[0], f0[1], f0[2]); I.push(m, m + 1, m2, m, m2 + 1, m + Q + 1, m, m2, m2 + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
const lack = (c, r = 0.32, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }), M = { dunkel: lack(0x15171a, 0.55), grau: lack(0x70757b, 0.45, 0.5), metall: lack(0xb7bcc2, 0.28, 0.9), weiss: lack(0xeeeeea, 0.3), glas: new THREE.MeshStandardMaterial({ color: 0x9fc5d4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), polster: lack(0xd8cfbb, 0.75), gummi: lack(0x202224, 0.85) };
const box = (w, h, d, x, y, z, m, ry = 0, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.castShadow = true; return o; };
const rbox = (w, h, d, x, y, z, m, r = 0.06, rx = 0, ry = 0) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * 0.49, h * 0.49, d * 0.49)), m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.castShadow = true; return o; };
let _teak = null; const teakMat = () => { if (_teak) return _teak; const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { const h = 28 + (i * 37 % 12); g.fillStyle = `rgb(${132 + h},${92 + h * 0.7},${58 + h * 0.3})`; g.fillRect(i * 8, 0, 8, 256); for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(60,36,18,${0.05 + (k % 5) * 0.03})`; g.fillRect(i * 8 + (k * 13 % 8), (k * 53 + i * 91) % 256, 1, 36); } g.fillStyle = '#14100c'; g.fillRect(i * 8 + 7, 0, 1, 256); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.4, 1.6); t.anisotropy = 4; return _teak = new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 }); };
const zyl = (r0, r1, l, x, y, z, m, achse = 'z', n = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, l, n), m); o.position.set(x, y, z); if (achse === 'z') o.rotation.x = Math.PI / 2; else if (achse === 'x') o.rotation.z = Math.PI / 2; o.castShadow = true; return o; };

export function wasserModell(art) {
  const G0 = new THREE.Group(); G0.name = art; const hull = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.08, side: THREE.DoubleSide }); const add = (...o) => { for (const q of o) G0.add(q); };
  if (art === 'speedboot') {
    const S = [[-4.2, 1.24, 0.42, 0.62], [-3.2, 1.3, 0.46, 0.66], [-1.6, 1.32, 0.52, 0.7], [0, 1.26, 0.56, 0.76], [1.5, 1.06, 0.58, 0.84], [2.8, 0.72, 0.5, 0.94], [3.7, 0.36, 0.3, 1.02], [4.25, 0.04, 0.05, 1.08]].map(([z, b, d, h]) => ({ z, b, d, h }));
    const m = new THREE.Mesh(rumpf(S, (y, z) => y > 90 ? (z > 1.1 ? [0.92, 0.92, 0.9] : [0.72, 0.68, 0.6]) : y < 0.02 ? [0.05, 0.08, 0.13] : y > 0.5 ? [0.93, 0.93, 0.91] : [0.72, 0.09, 0.07]), hull); m.castShadow = true; add(m);
    // Cockpit vertieft mit Teakboden, gerundete Polster, Armaturenbrett, gebogene Scheibe, zwei Außenborder, Badeplattform, Reling. Maßstab 8,4 m
    const teak = teakMat(), pol = M.polster, nah = lack(0x3a342c, 0.8), weiss = lack(0xf2f1ec, 0.26, 0.05);
    add(rbox(2.14, 0.34, 3.7, 0, 0.72, -1.3, weiss, 0.06)); add(rbox(1.92, 0.05, 3.42, 0, 0.9, -1.3, teak, 0.02));
    add(rbox(2.3, 0.05, 1.05, 0, 0.5, -4.68, teak, 0.02), box(2.3, 0.05, 0.05, 0, 0.47, -5.2, M.metall));
    // Vordersitze mit Lehne, Fuß und Naht, Rückbank
    for (const x of [-0.5, 0.5]) { add(zyl(0.05, 0.08, 0.3, x, 0.98, -0.9, M.metall, 'y', 10), rbox(0.6, 0.15, 0.58, x, 1.14, -0.9, pol, 0.06), rbox(0.56, 0.62, 0.13, x, 1.48, -1.18, pol, 0.055, -0.15), box(0.58, 0.012, 0.6, x, 1.215, -0.9, nah), rbox(0.3, 0.14, 0.1, x, 1.86, -1.25, pol, 0.04, -0.15)); }
    add(rbox(1.96, 0.2, 0.62, 0, 1.03, -3.0, pol, 0.07), rbox(1.96, 0.52, 0.13, 0, 1.33, -3.34, pol, 0.055, -0.14), box(1.92, 0.012, 0.03, 0, 1.135, -3.0, nah));
    // Armaturen: Pult, Lenkrad, zwei Anzeigen, Gashebel
    add(rbox(1.92, 0.5, 0.5, 0, 1.12, 0.4, weiss, 0.08), rbox(1.2, 0.18, 0.05, 0, 1.36, 0.14, M.dunkel, 0.02, -0.55), zyl(0.05, 0.05, 0.05, 0.12, 1.37, 0.12, M.metall, 'z', 12), zyl(0.05, 0.05, 0.05, 0.3, 1.37, 0.12, M.metall, 'z', 12));
    const rad = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 24), M.gummi); rad.position.set(-0.5, 1.42, 0.06); rad.rotation.x = 0.62; add(rad); add(zyl(0.018, 0.018, 0.22, -0.5, 1.34, 0.14, M.metall, 'z', 8), box(0.05, 0.14, 0.05, 0.62, 1.42, 0.18, M.metall, 0, -0.4), zyl(0.035, 0.035, 0.06, 0.62, 1.5, 0.15, M.dunkel, 'y', 8));
    // Scheibe gebogen mit Rahmen
    { const P = [], I = [], n = 12; for (let i = 0; i <= n; i++) { const t = i / n * 2 - 1, x = t * 1.13, ku = t * t; P.push(x, 1.28, 0.74 - ku * 0.42, x * 0.88, 1.92, 0.12 - ku * 0.2); if (i < n) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } } const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setIndex(I); sg.computeVertexNormals(); add(new THREE.Mesh(sg, M.glas)); const li = new THREE.CatmullRomCurve3(Array.from({ length: n + 1 }, (_, i) => { const t = i / n * 2 - 1, ku = t * t; return new THREE.Vector3(t * 1.13 * 0.88, 1.92, 0.12 - ku * 0.2); })); const ro = new THREE.Mesh(new THREE.TubeGeometry(li, 22, 0.02, 6), M.metall); add(ro); }
    // Bugkissen und Reling
    add(rbox(1.5, 0.1, 1.2, 0, 0.96, 1.5, pol, 0.045), box(0.03, 0.03, 1.4, 0, 1.03, 2.78, M.metall));
    for (const q of [-1, 1]) { const li = new THREE.CatmullRomCurve3([new THREE.Vector3(q * 1.02, 1.12, 1.0), new THREE.Vector3(q * 0.86, 1.2, 2.0), new THREE.Vector3(q * 0.52, 1.22, 3.1), new THREE.Vector3(q * 0.1, 1.22, 3.72)]); add(new THREE.Mesh(new THREE.TubeGeometry(li, 16, 0.014, 6), M.metall)); for (const [x, z] of [[1.0, 1.05], [0.72, 2.45], [0.32, 3.4]]) add(box(0.02, 0.26, 0.02, q * x, 1.05, z, M.metall)); }
    // Zwei Außenborder: gerundete Haube, Zierstreifen, Schaft, Schraube
    for (const x of [-0.5, 0.5]) { add(rbox(0.36, 0.56, 0.5, x, 1.0, -4.5, M.dunkel, 0.1), box(0.37, 0.05, 0.51, x, 0.9, -4.5, lack(0xc92a22, 0.35)), rbox(0.2, 0.16, 0.3, x, 0.66, -4.46, M.grau, 0.04), box(0.1, 0.72, 0.2, x, 0.24, -4.5, M.dunkel), box(0.3, 0.03, 0.26, x, -0.08, -4.5, M.grau)); const sr = zyl(0.05, 0.05, 0.14, x, -0.2, -4.56, M.metall, 'z', 8); add(sr); for (let b = 0; b < 3; b++) { const bl = box(0.2, 0.012, 0.09, x, -0.2, -4.62, M.metall); bl.rotation.z = b * 2.094; add(bl); } }
    // Klampen, Fahnenstock
    for (const q of [-1, 1]) add(box(0.14, 0.03, 0.04, q * 1.06, 0.96, -3.4, M.metall)); { const st = zyl(0.012, 0.012, 0.7, 0.9, 1.24, -4.9, M.metall, 'y', 6); st.rotation.x = -0.25; add(st); }
    G0.userData.sitz = { x: -0.5, y: 1.2, z: -0.86, ry: 0 };
  } else if (art === 'jetski') {
    const S = [[-1.6, 0.56, 0.22, 0.32], [-1.1, 0.6, 0.26, 0.36], [-0.2, 0.62, 0.3, 0.4], [0.7, 0.54, 0.32, 0.46], [1.3, 0.34, 0.28, 0.52], [1.72, 0.04, 0.05, 0.58]].map(([z, b, d, h]) => ({ z, b, d, h }));
    const m = new THREE.Mesh(rumpf(S, (y, z) => y > 90 ? [0.07, 0.08, 0.09] : y < 0.08 ? [0.05, 0.06, 0.08] : z > 0.5 ? [0.1, 0.72, 0.42] : [0.92, 0.93, 0.92]), hull); m.castShadow = true; add(m);
    const hg = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 10).scale(0.95, 0.66, 1.75), lack(0x14b86b, 0.24, 0.1)); hg.position.set(0, 0.62, 0.72); hg.castShadow = true; add(hg);
    add(box(0.58, 0.22, 1.5, 0, 0.62, -0.6, M.dunkel), box(0.5, 0.12, 1.4, 0, 0.76, -0.62, lack(0x2b2d31, 0.8)));
    add(zyl(0.05, 0.06, 0.62, 0, 0.92, 0.28, M.dunkel, 'y'), zyl(0.025, 0.025, 0.92, 0, 1.2, 0.2, M.metall, 'x'), box(0.16, 0.06, 0.06, 0.44, 1.2, 0.2, M.gummi), box(0.16, 0.06, 0.06, -0.44, 1.2, 0.2, M.gummi));
    add(zyl(0.1, 0.14, 0.4, 0, 0.06, -1.76, M.metall, 'z', 12), box(1.1, 0.04, 1.0, 0, 0.42, -0.5, M.gummi));
    G0.userData.sitz = { x: 0, y: 0.72, z: -0.45, ry: 0 };
  } else if (art === 'uboot') {
    // Forschungstauchboot, rund 7,6 m lang: gelber Druckkörper, Kuppel aus Acryl, Rahmen mit Kufen, Ballasttanks, vier Schubgondeln mit drehenden Schrauben, Leitwerk, Lampenträger, Greifarm. Frei erfunden
    const K = lack(0xeab312, 0.46, 0), KD = lack(0x9a7410, 0.6), Wei = lack(0xe6e6e0, 0.5), Rot = lack(0xb8281f, 0.5), kap = (r, l, x, y, z, m) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 18).rotateX(Math.PI / 2), m); o.position.set(x, y, z); o.castShadow = true; return o; }, ring = (r, d, x, y, z, m, n = 26) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, d, 8, n), m); o.position.set(x, y, z); o.castShadow = true; return o; };
    add(zyl(1.12, 1.12, 4.1, 0, 0, -0.65, K, 'z', 30)); { const hk = new THREE.Mesh(new THREE.SphereGeometry(1.12, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 1.3), K); hk.position.z = -2.7; hk.castShadow = true; add(hk); }
    for (const z of [1.28, 0.3, -1.0, -2.45]) add(ring(1.135, 0.035, 0, 0, z, KD, 34));
    // Kuppel vorn: dicke Acrylkugel mit Metallring, darin Pult
    { const ku = new THREE.Mesh(new THREE.SphereGeometry(1.2, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(Math.PI / 2), M.glas); ku.position.z = 1.32; add(ku); add(ring(1.2, 0.085, 0, 0, 1.42, M.grau, 36), ring(1.08, 0.03, 0, 0, 1.46, M.metall, 34)); add(rbox(1.2, 0.36, 0.34, 0, -0.32, 1.72, M.dunkel, 0.05), rbox(1.7, 0.12, 1.3, 0, -0.74, 1.1, M.dunkel, 0.04), box(0.5, 0.02, 0.12, 0, -0.12, 1.7, lack(0x2a6f7f, 0.25, 0.1), 0, -0.6)); }
    // Deck mit Gitterrost, Einstieg, Reling, Mast
    add(box(1.5, 0.06, 3.3, 0, 1.17, -0.9, M.dunkel), box(0.05, 0.06, 3.3, -0.75, 1.2, -0.9, Wei), box(0.05, 0.06, 3.3, 0.75, 1.2, -0.9, Wei), zyl(0.5, 0.56, 0.5, 0, 1.42, -0.3, K, 'y', 22), zyl(0.54, 0.54, 0.09, 0, 1.7, -0.3, M.grau, 'y', 22), box(0.05, 0.62, 0.05, 0.28, 2.04, -0.46, M.metall), zyl(0.05, 0.05, 0.14, 0.28, 2.38, -0.46, Rot, 'y', 8));
    for (const q of [-1, 1]) { const li = new THREE.CatmullRomCurve3([new THREE.Vector3(q * 0.74, 1.2, 0.72), new THREE.Vector3(q * 0.74, 1.56, 0.5), new THREE.Vector3(q * 0.74, 1.56, -1.9), new THREE.Vector3(q * 0.74, 1.2, -2.2)]); add(new THREE.Mesh(new THREE.TubeGeometry(li, 14, 0.024, 6), M.metall)); }
    // Ballasttanks mit Marke, Rahmen, Kufen
    for (const q of [-1, 1]) { add(kap(0.36, 3.6, q * 1.34, -0.72, -0.8, Wei), ring(0.365, 0.02, q * 1.34, -0.72, 0.5, Rot, 20), ring(0.365, 0.02, q * 1.34, -0.72, -2.1, Rot, 20), box(0.14, 0.12, 4.9, q * 0.98, -1.62, -0.75, M.grau)); for (const z of [0.8, -0.6, -2.0]) add(box(0.09, 0.82, 0.09, q * 0.98, -1.22, z, M.grau), box(0.5, 0.08, 0.08, q * 1.16, -0.94, z, M.grau)); const nase = zyl(0.05, 0.1, 0.5, q * 0.98, -1.5, 1.86, M.grau, 'z', 8); nase.rotation.x = Math.PI / 2 + 0.5; add(nase); }
    // Schub: Hauptschraube im Mantel hinten, zwei seitlich, Leitwerk
    const schr = G0.userData.schrauben = [], schraube = (x, y, z, r) => { const g = new THREE.Group(); g.position.set(x, y, z); for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.92, 0.03), M.grau); bl.position.y = r * 0.48; const pv = new THREE.Group(); pv.rotation.z = i * Math.PI / 2; bl.rotation.y = 0.5; pv.add(bl); g.add(pv); } add(g); schr.push(g); add(zyl(r * 0.18, r * 0.24, 0.4, x, y, z + 0.14, M.dunkel, 'z', 12)); };
    add(zyl(0.3, 0.46, 0.8, 0, 0, -4.1, K, 'z', 18), ring(0.74, 0.08, 0, 0, -4.62, KD, 34), ring(0.74, 0.08, 0, 0, -4.26, KD, 34)); { const ma = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.36, 30, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6b10, roughness: 0.6, side: THREE.DoubleSide })); ma.position.z = -4.44; add(ma); } schraube(0, 0, -4.48, 0.66); for (const a of [0, 1, 2, 3]) { const st = box(0.05, 0.42, 0.14, Math.sin(a * Math.PI / 2 + 0.78) * 0.52, Math.cos(a * Math.PI / 2 + 0.78) * 0.52, -4.5, KD); st.rotation.z = -(a * Math.PI / 2 + 0.78); add(st); }
    for (const q of [-1, 1]) { add(ring(0.34, 0.05, q * 2.0, 0.28, -1.9, M.dunkel, 22), ring(0.34, 0.05, q * 2.0, 0.28, -1.6, M.dunkel, 22), box(0.86, 0.09, 0.32, q * 1.42, 0.28, -1.76, M.dunkel)); schraube(q * 2.0, 0.28, -1.82, 0.3); }
    add(box(0.07, 1.5, 0.74, 0, 1.2, -3.55, K), box(0.07, 0.8, 0.5, 0, -1.02, -3.6, K), box(2.5, 0.07, 0.56, 0, 0.1, -3.6, K));
    // Lampenträger über und unter der Kuppel
    const lampe = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 4.4) }); add(box(2.9, 0.07, 0.07, 0, 1.28, 1.2, M.grau), box(2.5, 0.07, 0.07, 0, -1.26, 1.5, M.grau)); for (const [x, y, z] of [[-1.34, 1.2, 1.3], [-0.5, 1.2, 1.36], [0.5, 1.2, 1.36], [1.34, 1.2, 1.3], [-1.1, -1.18, 1.6], [1.1, -1.18, 1.6]]) { const l = zyl(0.11, 0.11, 0.03, x, y, z + 0.13, lampe, 'z', 12); l.castShadow = false; add(l, zyl(0.14, 0.15, 0.24, x, y, z, M.dunkel, 'z', 12)); }
    // Greifarm rechts
    add(zyl(0.09, 0.09, 0.2, 1.32, -0.62, 1.1, M.grau, 'y', 10), box(0.11, 0.11, 0.9, 1.32, -0.62, 1.55, M.grau, 0.16), box(0.09, 0.09, 0.7, 1.42, -0.86, 2.1, M.grau, 0, 0.6), box(0.03, 0.04, 0.26, 1.46, -1.12, 2.46, M.metall, 0.35, 0.6), box(0.03, 0.04, 0.26, 1.38, -1.12, 2.46, M.metall, -0.35, 0.6));
    G0.userData.sitz = { x: 0, y: -0.78, z: 0.62, ry: 0 };
    // Lichtkegel im Wasser
    const kg = new THREE.ConeGeometry(16, 60, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 31); const km = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uK: { value: 0 } }, vertexShader: 'varying float vZ; varying vec3 vN, vV; void main() { vZ = position.z / 62.0; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }', fragmentShader: 'uniform float uK; varying float vZ; varying vec3 vN, vV; void main() { float f = pow(abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(vec3(0.5, 0.75, 0.8) * uK * f * pow(max(1.0 - vZ, 0.0), 2.2) * 0.22, 1.0); }' }); const kegel = new THREE.Mesh(kg, km); kegel.position.set(0, 0, 1.2); kegel.name = 'lichtkegel'; kegel.frustumCulled = false; kegel.visible = false; add(kegel); G0.userData.kegel = kegel;
    G0.userData.lampeAb = 1.4;
  }
  return G0;
}
const x_ = v => v;
