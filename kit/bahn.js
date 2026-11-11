// Bahn (06.11.2026, Nader: "alles, was in der echten Welt ... will ich da auch haben ... Und auch das funktioniert"): Gleise, Bahnhöfe, Züge und Schranken aus den echten Linien der Karte (OpenStreetMap über OpenMapTiles).
// Fernzüge, Regionalzüge, S Bahn, U Bahn auf Hochstrecken, Straßenbahn, Güterzüge. Züge folgen dem Gleis mit zwei Drehgestellen je Wagen, halten an echten Bahnhöfen, Schranken schließen, Autos warten. Alles in echten Metern.
import * as THREE from 'three';
import { ECHT } from './echtzeit.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { NACHT } from './materials.js';
import { stuetzenRegel } from './stuetzen.js';

const BASIS = new URL('../assets/zuege/', import.meta.url);
const LAENGE = { express_kopf: 26.8, express_mitte: 26.4, regio_kopf: 26, regio_mitte: 26, sbahn_kopf: 18.4, sbahn_mitte: 18.4, ubahn_kopf: 15.6, ubahn_mitte: 15.6, tram_kopf: 11.5, tram_mitte: 9, lok: 18.9, wagen_container0: 19.6, wagen_container1: 19.6, wagen_container2: 19.6, wagen_kessel: 16.2, wagen_schuett: 14 };
const DREH = { tram_kopf: 3.3, tram_mitte: 0.2, express_kopf: 9, express_mitte: 9.2, regio_kopf: 9, regio_mitte: 9, sbahn_kopf: 6, sbahn_mitte: 6, ubahn_kopf: 5.2, ubahn_mitte: 5.2, lok: 4.6, wagen_container0: 6.8, wagen_container1: 6.8, wagen_container2: 6.8, wagen_kessel: 5, wagen_schuett: 4 };   // halber Abstand der Drehgestelle
const FARBEN = { regio: [[0.72, 0.12, 0.14], [0.14, 0.3, 0.56], [0.16, 0.46, 0.3], [0.86, 0.62, 0.14], [0.88, 0.88, 0.9]], sbahn: [[0.74, 0.14, 0.16], [0.12, 0.38, 0.22], [0.14, 0.3, 0.6], [0.8, 0.5, 0.12]], tram: [[0.93, 0.8, 0.22], [0.92, 0.92, 0.92], [0.76, 0.16, 0.16], [0.16, 0.46, 0.6], [0.18, 0.5, 0.3]], ubahn: [[0.93, 0.76, 0.16], [0.86, 0.86, 0.86], [0.22, 0.36, 0.72]], lok: [[0.72, 0.1, 0.1], [0.12, 0.26, 0.5], [0.5, 0.52, 0.54], [0.16, 0.4, 0.26], [0.9, 0.55, 0.1]] };
const ZUGARTEN = {
  express: { w: () => ['express_kopf', ...Array(6).fill('express_mitte'), 'express_kopf!'], v: 54, a: 0.45, b: 0.7 },
  regio: { w: R => ['regio_kopf', ...(R() < 0.5 ? ['regio_mitte'] : ['regio_mitte', 'regio_mitte']), 'regio_kopf!'], v: 38, a: 0.7, b: 0.8, f: 'regio' },
  sbahn: { w: R => R() < 0.4 ? ['sbahn_kopf', 'sbahn_mitte', 'sbahn_mitte', 'sbahn_kopf!', 'sbahn_kopf', 'sbahn_mitte', 'sbahn_mitte', 'sbahn_kopf!'] : ['sbahn_kopf', 'sbahn_mitte', 'sbahn_mitte', 'sbahn_kopf!'], v: 26, a: 1.0, b: 1.0, f: 'sbahn' },
  ubahn: { w: () => ['ubahn_kopf', 'ubahn_mitte', 'ubahn_mitte', 'ubahn_mitte', 'ubahn_mitte', 'ubahn_kopf!'], v: 20, a: 1.1, b: 1.1, f: 'ubahn' },
  tram: { w: () => ['tram_kopf', 'tram_mitte', 'tram_mitte', 'tram_kopf!'], v: 12.5, a: 1.0, b: 1.2, f: 'tram', halt: 12 },
  gueter: { w: R => { const n = 9 + Math.floor(R() * 14), a = ['lok']; const typ = R(); for (let i = 0; i < n; i++) { const q = R(); a.push(typ < 0.5 ? 'wagen_container' + Math.floor(R() * 3) : typ < 0.75 ? 'wagen_kessel' : q < 0.8 ? 'wagen_schuett' : 'wagen_kessel'); } return a; }, v: 25, a: 0.25, b: 0.45 },
};
let _modelle = null, _mat = null;
function materialien() {
  if (_mat) return _mat;
  const lack = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12 });
  const glas = new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.08, metalness: 0.85, emissive: new THREE.Color(1.0, 0.8, 0.52), emissiveIntensity: 0 });
  const licht = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return (_mat = { lack, glas, licht });
}
// meshopt legt die Modelle quantisiert ab, die Skalierung steckt im Knoten: für Instanzen in echte Meter umrechnen
function entpacken(g, m) {
  const G = new THREE.BufferGeometry(), p = g.attributes.position, n = g.attributes.normal, P = new Float32Array(p.count * 3), N = n ? new Float32Array(n.count * 3) : null, v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; if (N) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; } }
  G.setAttribute('position', new THREE.BufferAttribute(P, 3)); if (N) G.setAttribute('normal', new THREE.BufferAttribute(N, 3)); else G.computeVertexNormals();
  const c = g.attributes.color; if (c) { const C = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { C[i * 3] = c.getX(i); C[i * 3 + 1] = c.getY(i); C[i * 3 + 2] = c.getZ(i); } G.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
  if (g.index) G.setIndex(g.index.clone()); return G;
}
export function zuegeLaden() {
  if (_modelle) return _modelle;
  const L = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), M = {};
  _modelle = Promise.all(Object.keys(LAENGE).map(n => L.loadAsync(new URL(n + '.glb', BASIS).href).then(g => { const t = {}; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh) t[o.material.name] = entpacken(o.geometry, o.matrixWorld); }); M[n] = t; }))).then(() => M);
  return _modelle;
}

// ---------- Bilder ----------
let _schotter = null, _bahnsteig = null;
function schotterBild() {
  if (_schotter) return _schotter;
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let s = 9; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#6a655c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { const l = 70 + r() * 90, x = r() * W, y = r() * H, b = 1 + r() * 2.4; g.fillStyle = `rgb(${l},${l * 0.96},${l * 0.9})`; g.fillRect(x, y, b, b); }
  // Schwellen: vier je Bild (0,6 m Abstand bei 2,4 m Bildlänge), Beton oder Holz
  for (let i = 0; i < 4; i++) { const y = (i + 0.5) * H / 4; g.fillStyle = '#4a4744'; g.fillRect(W * 0.06, y - 15, W * 0.88, 30); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(W * 0.06, y - 15, W * 0.88, 5); }
  // Schienen (Spur 1,435 m auf 2,9 m Bildbreite)
  for (const x of [W * (0.5 - 1.435 / 2 / 2.9), W * (0.5 + 1.435 / 2 / 2.9)]) { g.fillStyle = '#2c2a28'; g.fillRect(x - 5, 0, 10, H); g.fillStyle = '#a8a6a2'; g.fillRect(x - 2.4, 0, 4.8, H); }
  _schotter = new THREE.CanvasTexture(c); _schotter.colorSpace = THREE.SRGBColorSpace; _schotter.wrapS = THREE.ClampToEdgeWrapping; _schotter.wrapT = THREE.RepeatWrapping; _schotter.anisotropy = 8;
  return _schotter;
}
function bahnsteigBild() {
  if (_bahnsteig) return _bahnsteig;
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#8c8a86'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const l = 128 + r() * 26; g.fillStyle = `rgb(${l},${l},${l * 0.97})`; g.fillRect(i * W / 4 + 1, j * H / 4 + 1, W / 4 - 2, H / 4 - 2); }
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.1})`; g.fillRect(r() * W, r() * H, 2, 2); }
  _bahnsteig = new THREE.CanvasTexture(c); _bahnsteig.colorSpace = THREE.SRGBColorSpace; _bahnsteig.wrapS = _bahnsteig.wrapT = THREE.RepeatWrapping; _bahnsteig.anisotropy = 8;
  return _bahnsteig;
}

// ---------- Geometrie ----------
function dichter(p, schritt) { const a = [p[0].slice()]; for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0], dz = p[i][1] - p[i - 1][1], d = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(d / schritt)); for (let k = 1; k <= n; k++) a.push([p[i - 1][0] + dx * k / n, p[i - 1][1] + dz * k / n]); } return a; }
function normalen(P) { const N = []; for (let i = 0; i < P.length; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dz = b[2] - a[2], d = Math.hypot(dx, dz) || 1; N.push([-dz / d, dx / d]); } return N; }
// Band quer zum Gleis: profil [[versatz, höhe, u], ...], v läuft mit dem Weg (Meter / vLaenge)
function band(P, profil, V, vLaenge, geb) {
  const N = normalen(P), n = profil.length; let s = 0; const o = V.pos.length / 3;
  for (let i = 0; i < P.length; i++) {
    if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]);
    for (const [q, h, u] of profil) { V.pos.push(P[i][0] + N[i][0] * q, P[i][1] + h, P[i][2] + N[i][1] * q); V.uv.push(u, s / vLaenge); }
  }
  for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < n - 1; j++) { const a = o + i * n + j, b = a + 1, c = a + n, d = c + 1; V.idx.push(a, b, c, b, d, c); }
}
const neuV = () => ({ pos: [], uv: [], idx: [] });
function zuGeo(V) { for (let i = 0; i < V.pos.length; i++) if (!Number.isFinite(V.pos[i])) V.pos[i] = 0; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(V.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(V.uv, 2)); g.setIndex(V.idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }

export class Bahn {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'bahn'; this.zuege = []; this.routen = []; this.kreuz = []; this.sperren = []; this.t = 0; this.tAlt = performance.now(); this.bereit = false; this.nah = { d: 1e9, v: 0 }; this.teile = []; this.R = (() => { let s = (Math.abs(Math.round((ort.daten.meta?.lat || 0) * 1000) * 31 + Math.round((ort.daten.meta?.lon || 0) * 1000)) >>> 0) || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    this.gleiseLesen(); if (!this.kanten.length) return; this.gleiseBauen(); this.routenBauen(); this.bahnhoefeBauen(); this.schrankenBauen();
    if (this.routen.length) zuegeLaden().then(M => { if (this.weg) return; this.M = M; this.flotteBauen(); this.bereit = true; }).catch(e => console.warn('Züge', e));
  }
  // ---------- Daten: Kanten mit Knoten (Enden auf 2,5 m zusammengezogen, an Kachelgrenzen sind die Linien geschnitten), Höhen mit Rampen zu den Brücken ----------
  gleiseLesen() {
    const G = this.ort.daten.gleise || [], H = (x, z) => { const h = (this.ort.Hboden || this.ort.H)(x, z); return Number.isFinite(h) ? h : 0; }, zell = new Map(), knoten = [];
    const knotenAn = (x, z) => { const ix = Math.round(x / 3), iz = Math.round(z / 3); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = zell.get((ix + a) + ',' + (iz + b)); if (L) for (const k of L) if (Math.hypot(knoten[k].x - x, knoten[k].z - z) < 2.6) return k; } const k = knoten.length; knoten.push({ x, z, kanten: [], y: -1e9 }); const key = ix + ',' + iz; if (!zell.has(key)) zell.set(key, []); zell.get(key).push(k); return k; };
    this.kanten = [];
    for (const g of G) {
      if (g.art === 'seil' || g.art === 'mono') continue;
      const P = dichter(g.p, g.art === 'tram' ? 7 : 9), a = knotenAn(P[0][0], P[0][1]), b = knotenAn(P[P.length - 1][0], P[P.length - 1][1]); if (a === b && P.length < 6) continue;
      const pts = P.map(([x, z]) => { const h = H(x, z); return [x, h + (g.br ? 6.4 * g.br : g.art === 'tram' ? 0.02 : 0.3), z]; });
      const e = { a, b, P: pts, art: g.art, br: g.br || 0, sp: !!g.sp, neben: !!g.nb, i: this.kanten.length }; let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); e.len = L; this.kanten.push(e); knoten[a].kanten.push(e.i); knoten[b].kanten.push(e.i);
    }
    this.knoten = knoten;
    // Höhen: nie steiler als 2,5 %, Brückenhöhe zieht das Gleis davor und dahinter hoch (Damm). Dreimal über das Netz
    knoten.forEach((k, i) => { k.i = i; });
    for (let r = 0; r < 3; r++) {
      for (const k of knoten) { k.y = -1e9; for (const i of k.kanten) { const e = this.kanten[i]; k.y = Math.max(k.y, e.a === k.i ? e.P[0][1] : e.P[e.P.length - 1][1]); } }
      for (const e of this.kanten) { const P = e.P, n = P.length; P[0][1] = Math.max(P[0][1], knoten[e.a].y); P[n - 1][1] = Math.max(P[n - 1][1], knoten[e.b].y); for (let d = 0; d < 2; d++) { const st = d ? -1 : 1; for (let i = d ? n - 2 : 1; i >= 0 && i < n; i += st) { const q = P[i - st], ds = Math.hypot(P[i][0] - q[0], P[i][2] - q[2]); if (P[i][1] < q[1] - 0.025 * ds) P[i][1] = q[1] - 0.025 * ds; } } }
    }
  }
  // ---------- Gleise als Netze ----------
  gleiseBauen() {
    const schotter = neuV(), deck = neuV(), mats = materialien(); const pfeiler = [], masten = [], draehte = [], W = 2.9 / 2, Sx = 0.76;
    const nah = new Map(), H = this.ort.Hboden || this.ort.H, keyN = (x, z) => Math.floor(x / 140) + ',' + Math.floor(z / 140);
    const regel = stuetzenRegel(this.ort.daten, { gleise: this.kanten.filter(k => !k.br).map(k => k.P) }); this.stuetzen = regel.zahl;   // Pfeiler nie auf Fahrbahn, Weg oder Gleis (kit/stuetzen.js, Nr. 98)
    for (const e of this.kanten) {
      const P = e.P;
      if (e.art === 'tram') {
        // Straßenbahn: Rille in der Fahrbahn, keine Schwellen
        for (const sg of [-Sx, Sx]) band(P, [[sg - 0.05, 0.0, 0.0], [sg - 0.05, 0.015, 0.0], [sg + 0.05, 0.015, 0.0], [sg + 0.05, 0.0, 0.0]], schieneV(nah, P, keyN), 3);
      } else {
        band(P, [[-W - 1.1, -0.34, 0.05], [-W, 0.0, 0.0], [W, 0.0, 1.0], [W + 1.1, -0.34, 0.95]], schotter, 2.4);
        // nah echte Schienen, in Stücken zu 140 m (nur nah sichtbar)
        let von = 0, kAlt = keyN(P[0][0], P[0][2]);
        for (let i = 1; i <= P.length; i++) { const k = i < P.length ? keyN(P[i][0], P[i][2]) : null; if (k !== kAlt) { const T = P.slice(von, Math.min(P.length, i + 1)); if (T.length > 1) { if (!nah.has(kAlt)) nah.set(kAlt, neuV()); const V = nah.get(kAlt); for (const sg of [-0.7175, 0.7175]) band(T, [[sg - 0.05, 0.04, 0], [sg - 0.035, 0.17, 0], [sg + 0.035, 0.17, 0], [sg + 0.05, 0.04, 0]], V, 3); } von = i; kAlt = k; } }
      }
      if (e.br) { band(P, [[-2.9, -1.1, 0], [-2.9, 0.82, 0], [-2.7, 0.82, 0], [-2.7, -0.05, 0], [2.7, -0.05, 0], [2.7, 0.82, 0], [2.9, 0.82, 0], [2.9, -1.1, 0], [-2.9, -1.1, 0]], deck, 4); for (let s = 0, i = 0; i < P.length; i++) { if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]); if (s > 24 && !e.sp) { s = 0; const g = H(P[i][0], P[i][2]), h = P[i][1] - 1.1 - g; if (h > 1.5) { const q = regel.stelle(P, i, 0.9); if (q) { const gq = H(q.x, q.z), hq = q.y - 1.1 - gq; if (hq > 1.5) pfeiler.push([q.x, gq, q.z, hq]); } } } } }
      // Oberleitung: Masten alle 50 m, Draht
      if (e.art !== 'schmal' && !e.neben) { const N = normalen(P); let s = 25; for (let i = 0; i < P.length; i++) { if (i) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]); const dr = P[i][1] + 5.55; if (i) { const q = P[i - 1]; draehte.push(q[0], q[1] + 5.55, q[2], P[i][0], dr, P[i][2]); } if (s > (e.art === 'tram' ? 38 : 52) && e.art !== 'tram' && !e.br) { s = 0; masten.push([P[i][0] + N[i][0] * 3.0, P[i][1] - 0.25, P[i][2] + N[i][1] * 3.0, Math.atan2(-N[i][0], -N[i][1])]); } } }
    }
    const mS = new THREE.MeshStandardMaterial({ map: schotterBild(), roughness: 0.96 }), mD = new THREE.MeshStandardMaterial({ color: 0x8c8983, roughness: 0.9, flatShading: true }), mR = new THREE.MeshStandardMaterial({ color: 0x77726d, roughness: 0.34, metalness: 0.75 }); mS.polygonOffset = true; mS.polygonOffsetFactor = -2; mS.polygonOffsetUnits = -2;
    this.mats = [mS, mD, mR];
    if (schotter.idx.length) { const m = new THREE.Mesh(zuGeo(schotter), mS); m.receiveShadow = true; m.name = 'schotter'; this.gruppe.add(m); this.teile.push(m); }
    if (deck.idx.length) { const m = new THREE.Mesh(zuGeo(deck), mD); m.receiveShadow = true; m.castShadow = true; m.name = 'hochbahn'; this.gruppe.add(m); this.teile.push(m); }
    this.nahTeile = []; for (const [k, V] of nah) { const m = new THREE.Mesh(zuGeo(V), mR); const [a, b] = k.split(',').map(Number); m.userData.x = (a + 0.5) * 140; m.userData.z = (b + 0.5) * 140; m.visible = false; m.name = 'schienen'; this.gruppe.add(m); this.nahTeile.push(m); this.teile.push(m); }
    if (pfeiler.length) { const g = new THREE.CylinderGeometry(0.62, 0.72, 1, 10).translate(0, 0.5, 0), im = new THREE.InstancedMesh(g, mD, pfeiler.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(); pfeiler.forEach(([x, y, z, h], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, h, 1)))); im.name = 'viaduktpfeiler'; im.userData.liste = pfeiler.map(p => [p[0], p[2], 0.72]); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; this.gruppe.add(im); this.teile.push(im); }
    if (masten.length && !this.mobil) { const a = new THREE.BoxGeometry(0.2, 7.0, 0.2).translate(0, 3.5, 0), b = new THREE.BoxGeometry(0.07, 0.1, 3.2).translate(0, 6.2, 1.5), c = new THREE.BoxGeometry(0.05, 0.05, 2.6).translate(0, 5.7, 1.5); const g = geoZusammen([a, b, c]), mM = new THREE.MeshStandardMaterial({ color: 0x5c6063, roughness: 0.6, metalness: 0.5 }); this.mats.push(mM); const im = new THREE.InstancedMesh(g, mM, masten.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(1, 1, 1); masten.forEach(([x, y, z, ry], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(Y, ry), S))); im.castShadow = true; im.frustumCulled = false; this.gruppe.add(im); this.teile.push(im); }
    if (draehte.length && !this.mobil) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(draehte, 3)); const mL = new THREE.LineBasicMaterial({ color: 0x24262a, transparent: true, opacity: 0.55 }); this.mats.push(mL); const l = new THREE.LineSegments(g, mL); l.frustumCulled = false; l.name = 'draht'; this.gruppe.add(l); this.teile.push(l); }
  }
  // ---------- Routen: von einem Ende bis zum nächsten, an Weichen möglichst geradeaus ----------
  routenBauen() {
    const K = this.kanten, Kn = this.knoten, ri = (e, amA) => { const P = e.P, q = amA ? [P[0], P[Math.min(3, P.length - 1)]] : [P[P.length - 1], P[Math.max(0, P.length - 4)]]; const dx = q[1][0] - q[0][0], dz = q[1][2] - q[0][2], d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d]; };
    const gehen = (start, vonA) => {
      const liste = [{ e: start, vor: vonA }], genutzt = new Set([start.i]); let e = start, vor = vonA, knoten = vor ? e.b : e.a, laenge = e.len;
      for (let t = 0; t < 400; t++) {
        const r0 = ri(e, !vor); let best = null, bw = -0.72;   // weiter nur fast geradeaus: r0 zeigt zurück ins Gleis, r1 voraus
        for (const i of Kn[knoten].kanten) { if (genutzt.has(i)) continue; const f = K[i]; if (f.neben || (f.art === 'tram') !== (start.art === 'tram')) continue; const amA = f.a === knoten, r1 = ri(f, amA), d = r0[0] * r1[0] + r0[1] * r1[1]; if (d < bw) { bw = d; best = { f, amA }; } }
        if (!best) break; genutzt.add(best.f.i); liste.push({ e: best.f, vor: best.amA }); e = best.f; vor = best.amA; knoten = vor ? e.b : e.a; laenge += e.len;
      }
      return { liste, laenge, genutzt };
    };
    const ends = []; for (const k of Kn) { const haupt = k.kanten.filter(i => !K[i].neben); if (haupt.length === 1) ends.push({ k, e: K[haupt[0]] }); }
    const roh = []; for (const { k, e } of ends) { if (e.neben) continue; roh.push(gehen(e, e.a === k.i)); }
    roh.sort((a, b) => b.laenge - a.laenge);
    const belegt = new Map(), max = this.mobil ? 8 : 18; this.routen = [];
    for (const r of roh) {
      const art = r.liste[0].e.art, minL = art === 'tram' ? 110 : 180; if (r.laenge < minL) continue;
      let geteilt = 0; for (const i of r.genutzt) if (belegt.has(i)) geteilt += K[i].len; if (geteilt > r.laenge * 0.4) continue;
      for (const i of r.genutzt) belegt.set(i, 1);
      this.routen.push(this.routeAus(r, art)); if (this.routen.length >= max) break;
    }
  }
  routeAus(r, art) {
    const pts = []; for (const { e, vor } of r.liste) { const P = vor ? e.P : e.P.slice().reverse(); for (let i = pts.length ? 1 : 0; i < P.length; i++) pts.push(P[i]); }
    // leicht glätten: Knicke an Kanten
    const Q = pts.map((p, i) => { if (i === 0 || i === pts.length - 1) return p; const a = pts[i - 1], b = pts[i + 1]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4, (a[2] + 2 * p[2] + b[2]) / 4]; });
    const S = new Float64Array(Q.length); for (let i = 1; i < Q.length; i++) S[i] = S[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1], Q[i][2] - Q[i - 1][2]);
    return { P: Q, S, len: S[S.length - 1], art, halte: [], kreuz: [], tNeu: 10 + this.R() * 110, kanten: r.genutzt };
  }
  an(R, s, out, hint) {   // Punkt auf der Route bei Weg s, liefert Index als Hinweis
    const S = R.S, P = R.P; let i = hint || 0, n = S.length;
    while (i > 0 && S[i] > s) i--; while (i < n - 2 && S[i + 1] < s) i++;
    const a = P[i], b = P[Math.min(i + 1, n - 1)], L = S[Math.min(i + 1, n - 1)] - S[i] || 1, t = (s - S[i]) / L;
    out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); return i;
  }
  // ---------- Bahnhöfe: Bahnsteige an den echten Stationen, Züge halten dort ----------
  bahnhoefeBauen() {
    const St = this.ort.daten.stationen || []; if (!St.length) return; const platte = neuV(), kante = neuV(), linie = neuV(), dach = [], mast = [], sitz = [];
    const naechst = (R, x, z) => { let m = 1e9, ms = 0, mi = 0; const P = R.P; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2)), d = Math.hypot(x - a[0] - dx * t, z - a[2] - dz * t); if (d < m) { m = d; mi = i; ms = R.S[i] + t * (R.S[i + 1] - R.S[i]); } } return [m, ms, mi]; };
    const gebaut = new Set();
    for (const st of St) {
      for (const R of this.routen) {
        const art = R.art, tramSt = st.sub === 'tram_stop', ubSt = st.sub === 'subway'; if ((art === 'tram') !== tramSt && !(art === 'tram' && st.sub === 'halt')) continue; if (ubSt && art !== 'ubahn') continue;
        const [d, s] = naechst(R, st.x, st.z); if (d > (art === 'tram' ? 26 : 70)) continue;
        const lang = art === 'tram' ? 34 : art === 'ubahn' ? 104 : art === 'sbahn' ? 150 : st.sub === 'station' ? 210 : 130; if (s < lang / 2 + 15 || s > R.len - lang / 2 - 15) continue;
        if (/betriebsbahnhof|güterbahnhof|gueterbahnhof|rangierbahnhof|\bdepot\b|\byard\b|abstell/i.test(st.name || '')) continue;   // dort steigt niemand ein
        if (R.halte.some(h => Math.abs(h.s - s) < lang * 0.7 || (h.name === st.name && Math.abs(h.s - s) < 600))) continue;   // ein Bahnhof mit mehreren Punkten in der Karte ist ein Halt
        R.halte.push({ s, name: st.name, lang }); if (art === 'tram') continue;
        // Bahnsteig neben dem Gleis, auf der Seite ohne Nachbargleis
        const key = Math.round(s / 30) + ':' + this.routen.indexOf(R); if (gebaut.has(key)) { R.halte.pop(); continue; } gebaut.add(key);
        const von = s - lang / 2, bis = s + lang / 2, T = []; for (let i = 0; i < R.P.length; i++) if (R.S[i] >= von && R.S[i] <= bis) T.push(R.P[i]); if (T.length < 3) { R.halte.pop(); continue; }
        const N = normalen(T); let seite = 0; const frei = sg => { for (let i = 0; i < T.length; i += 3) { const x = T[i][0] + N[i][0] * sg * 6, z = T[i][2] + N[i][1] * sg * 6; for (const e of this.kanten) { if (R.kanten.has(e.i)) continue; for (let j = 0; j < e.P.length; j += 2) if (Math.hypot(e.P[j][0] - x, e.P[j][2] - z) < 3.6) return false; } } return true; };
        seite = frei(1) ? 1 : frei(-1) ? -1 : 0; if (!seite) { R.halte.pop(); continue; } { const hh = R.halte[R.halte.length - 1]; hh.seite = seite; }   // ohne Platz für einen Bahnsteig kein Halt
        this.steigDazu(T, N, Math.min(seite * 1.72, seite * 5.4), Math.max(seite * 1.72, seite * 5.4), 0.76);
        const q0 = seite * 1.72, q1 = seite * 5.4, h = 0.76, Pf = [[q0, h, 0], [q1, h, 3.7 / 4]], sortiert = seite > 0 ? Pf : Pf.slice().reverse().map(([a, b, c]) => [a, b, c]);
        band(T, sortiert, platte, 4);
        band(T, seite > 0 ? [[q0 + 0.25, h + 0.004, 0], [q0 + 0.34, h + 0.004, 0]] : [[q0 - 0.34, h + 0.004, 0], [q0 - 0.25, h + 0.004, 0]], linie, 4);
        band(T, seite > 0 ? [[q0, -0.3, 0], [q0, h, 0]] : [[q0, h, 0], [q0, -0.3, 0]], kante, 4);
        band(T, seite > 0 ? [[q1, h, 0], [q1, -0.3, 0]] : [[q1, -0.3, 0], [q1, h, 0]], kante, 4);
        let dd = 8; for (let i = 0; i < T.length; i++) { if (i) dd += Math.hypot(T[i][0] - T[i - 1][0], T[i][2] - T[i - 1][2]); const mitte = seite * 3.56, x = T[i][0] + N[i][0] * mitte, z = T[i][2] + N[i][1] * mitte, ry = Math.atan2(N[i][0], N[i][1]); if (dd > 14) { dd = 0; mast.push([x, T[i][1] + h, z, ry]); if (Math.abs((i / T.length) - 0.5) < 0.3) { dach.push([x, T[i][1] + h, z, ry]); sitz.push([x + N[i][0] * seite * 0.9, T[i][1] + h, z + N[i][1] * seite * 0.9, ry]); } } }
      }
    }
    this.gebaut = gebaut;
    const m0 = new THREE.MeshStandardMaterial({ map: bahnsteigBild(), roughness: 0.92 }), m1 = new THREE.MeshStandardMaterial({ color: 0x6f6d69, roughness: 0.92 }), m2 = new THREE.MeshBasicMaterial({ color: 0xe9e4d4 }); this.mats.push(m0, m1, m2);
    if (platte.idx.length) { const a = new THREE.Mesh(zuGeo(platte), m0); a.receiveShadow = true; a.castShadow = false; a.name = 'bahnsteig'; const b = new THREE.Mesh(zuGeo(kante), m1); b.receiveShadow = true; const c = new THREE.Mesh(zuGeo(linie), m2); m0.side = m1.side = m2.side = THREE.DoubleSide; this.gruppe.add(a, b, c); this.teile.push(a, b, c); }
    const inst = (geo, mat, L, schatten = true) => { if (!L.length) return; const im = new THREE.InstancedMesh(geo, mat, L.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(1, 1, 1); L.forEach(([x, y, z, ry], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(Y, ry), S))); im.castShadow = schatten; im.receiveShadow = true; im.frustumCulled = false; this.gruppe.add(im); this.teile.push(im); };
    const mM = new THREE.MeshStandardMaterial({ color: 0x31363b, roughness: 0.5, metalness: 0.5 }), mG = new THREE.MeshStandardMaterial({ color: 0x9fb4bd, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.55 }), mB = new THREE.MeshStandardMaterial({ color: 0x7b4d2c, roughness: 0.7 }), mLa = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffe2b0, emissiveIntensity: 1.5 }); this.mats.push(mM, mG, mB, mLa); this.lampenMat = mLa;
    const mastG = geoZusammen([new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8).translate(0, 1.8, 0), new THREE.BoxGeometry(0.7, 0.07, 0.14).translate(0, 3.6, 0)]); inst(mastG, mM, mast);
    inst(new THREE.BoxGeometry(0.55, 0.05, 0.16).translate(0, 3.54, 0), mLa, mast, false);
    inst(geoZusammen([new THREE.BoxGeometry(3.2, 0.12, 13).translate(0, 3.25, 0), new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8).translate(0, 1.6, -5), new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8).translate(0, 1.6, 5)]), mM, dach);
    inst(geoZusammen([new THREE.BoxGeometry(0.46, 0.05, 1.7).translate(0, 0.46, 0), new THREE.BoxGeometry(0.05, 0.42, 1.7).translate(0.22, 0.7, 0), new THREE.BoxGeometry(0.06, 0.46, 0.06).translate(0, 0.23, -0.7), new THREE.BoxGeometry(0.06, 0.46, 0.06).translate(0, 0.23, 0.7)]), mB, sitz);
    for (const R of this.routen) R.halte.sort((a, b) => a.s - b.s);
  }
  // ---------- Schranken an Bahnübergängen: Lage aus der Karte, Autos warten (kit/traffic.js) ----------
  schrankenBauen() {
    const U = this.ort.daten.uebergaenge || []; if (!U.length) return; const H = this.ort.Hboden || this.ort.H;
    for (const u of U) {
      for (const R of this.routen) { if (R.art === 'tram') continue; let m = 1e9, ms = 0; const P = R.P; for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i][0] - u.x, P[i][2] - u.z); if (d < m) { m = d; ms = R.S[i]; } } if (m < 14) R.kreuz.push({ s: ms, k: this.kreuz.length }); }
      this.kreuz.push({ x: u.x, z: u.z, y: H(u.x, u.z), rx: u.rx, rz: u.rz, w: u.w || 7, zu: 0, soll: 0 });
    }
    if (!this.kreuz.length) return;
    const n = this.kreuz.length * 2, mP = new THREE.MeshStandardMaterial({ color: 0xc0c3c6, roughness: 0.6, metalness: 0.3 }), mA = new THREE.MeshStandardMaterial({ color: 0xd8d8d6, roughness: 0.5 }), mL = new THREE.MeshBasicMaterial({ color: 0xff2a14 }); this.mats.push(mP, mA, mL);
    this.posten = new THREE.InstancedMesh(geoZusammen([new THREE.CylinderGeometry(0.08, 0.1, 2.6, 8).translate(0, 1.3, 0), new THREE.BoxGeometry(0.34, 0.5, 0.22).translate(0, 1.95, 0)]), mP, n);
    this.arme = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.06).translate(0.5, 0, 0), mA, n);
    this.lampen = new THREE.InstancedMesh(new THREE.CircleGeometry(0.13, 12), mL, n * 2);
    for (const m of [this.posten, this.arme, this.lampen]) { m.frustumCulled = false; m.castShadow = m !== this.lampen; this.gruppe.add(m); this.teile.push(m); }
    this.armeSetzen(true);
  }
  armeSetzen(alle = false) {
    if (!this.arme) return; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), P = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Vector3(1, 1, 1), blink = Math.floor(this.t * 2) % 2;
    this.kreuz.forEach((k, i) => {
      // zwei Posten, je einer rechts vor dem Gleis. rx, rz: Richtung der Straße
      for (let j = 0; j < 2; j++) {
        const sg = j ? -1 : 1, qx = -k.rz, qz = k.rx, x = k.x + sg * k.rx * 7 + sg * qx * (k.w / 2 + 0.9), z = k.z + sg * k.rz * 7 + sg * qz * (k.w / 2 + 0.9), ry = Math.atan2(k.rx, k.rz) + (j ? Math.PI : 0);
        P.set(x, k.y, z); Q.setFromAxisAngle(Y, ry); if (alle) this.posten.setMatrixAt(i * 2 + j, M.compose(P, Q, E));
        const a = (1 - k.zu) * 1.45; Q2.setFromAxisAngle(Z, a); Q.setFromAxisAngle(Y, Math.atan2(k.rx * 0 + qz * sg, qx * sg) * -1); P.set(x, k.y + 1.05, z); S.set(k.w / 2 + 1, 1, 1); M.compose(P, Q.clone().multiply(Q2), S); this.arme.setMatrixAt(i * 2 + j, M);
        for (const e of [0, 1]) { const an = k.soll > 0 && (blink === e); P.set(x + k.rx * sg * -0.14 + (e ? 0.22 : -0.22) * qx, k.y + 2.0, z + k.rz * sg * -0.14 + (e ? 0.22 : -0.22) * qz); Q.setFromAxisAngle(Y, Math.atan2(-sg * k.rx, -sg * k.rz)); S.setScalar(an ? 1 : 0.001); this.lampen.setMatrixAt(i * 4 + j * 2 + e, M.compose(P, Q, S)); }
      }
    });
    this.arme.instanceMatrix.needsUpdate = true; this.lampen.instanceMatrix.needsUpdate = true; if (alle) this.posten.instanceMatrix.needsUpdate = true;
  }
  // ---------- Züge ----------
  flotteBauen() {
    const M = this.M, mats = materialien(), je = this.flotte = {};
    const cap = { express_kopf: 8, express_mitte: 24, regio_kopf: 12, regio_mitte: 12, sbahn_kopf: 24, sbahn_mitte: 24, ubahn_kopf: 8, ubahn_mitte: 16, tram_kopf: 24, tram_mitte: 24, lok: 6, wagen_container0: 24, wagen_container1: 24, wagen_container2: 24, wagen_kessel: 30, wagen_schuett: 30 };
    for (const n of Object.keys(M)) { const t = M[n], e = { n: 0 }; for (const part of ['lack', 'glas', 'licht']) { if (!t[part]) continue; const im = new THREE.InstancedMesh(t[part], mats[part], cap[n]); im.count = 0; im.frustumCulled = false; im.castShadow = part === 'lack' && !this.mobil; im.receiveShadow = part === 'lack'; im.name = 'zug ' + n; im.userData.geteilt = true; if (part !== 'glas') im.setColorAt(0, new THREE.Color(1, 1, 1)); this.gruppe.add(im); e[part] = im; } je[n] = e; }
    // ein paar Züge fahren schon, wenn der Ort fertig ist
    this.echtAbgleich(); if (!this.echtAn) for (const R of this.routen) if (this.R() < 0.55) this.zugStarten(R, this.R() * R.len);
  }
  zugStarten(R, s = null, artZwang = null) {
    if (this.zuege.length >= (this.mobil ? 4 : 11)) return null;
    const a = R.art, q = this.R(), art = artZwang ? artZwang : a === 'tram' ? 'tram' : a === 'ubahn' ? 'ubahn' : a === 'sbahn' ? 'sbahn' : a === 'schmal' ? 'sbahn' : (q < 0.26 && R.len > 500 ? 'express' : q < 0.62 ? 'regio' : q < 0.8 ? 'sbahn' : 'gueter'), Z = ZUGARTEN[art], wagen = Z.w(this.R); let L = 0; const liste = wagen.map(n => { const umg = n.endsWith('!'), nm = umg ? n.slice(0, -1) : n, l = LAENGE[nm], d = { n: nm, umg, off: L + l / 2, l, dr: DREH[nm] || l * 0.3 }; L += l + (art === 'tram' ? 0.15 : 0.5); return d; });
    const fa = Z.f ? FARBEN[Z.f][Math.floor(this.R() * FARBEN[Z.f].length)] : art === 'gueter' ? null : [0.96, 0.96, 0.97], lokF = FARBEN.lok[Math.floor(this.R() * FARBEN.lok.length)];
    const zug = { R, art, Z, wagen: liste, L, s: s === null ? -8 : s + L * 0.5, v: s === null ? Z.v * 0.8 : Z.v * 0.7, fa, lokF, halt: 0, naechster: 0, hints: liste.map(() => [0, 0]) };
    if (art === 'express' || art === 'gueter') zug.ohneHalt = art === 'gueter' || this.R() < 0.6;
    this.zuege.push(zug); return zug;
  }
  // ---------- Echte Züge: Lage aus der Quelle auf das nächste passende Gleis legen. Gegen die Richtung der Route fährt der Zug auf ihrer Umkehrung ----------
  echtAbgleich() {
    const Q = ECHT.q, m = this.ort.daten?.meta; if (!Q || !m || !this.routen.length) { this.echtAn = false; return; }
    const an = Q.zuegeLeben(m.lat, m.lon); if (!an) { if (this.echtAn) for (const z of this.zuege) z.echt = null; this.echtAn = false; return; } this.echtAn = true;
    const phi = m.lat * Math.PI / 180, K_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), K_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi), hb = (m.groesse || 1200) / 2 + 60, jetzt = performance.now(), o = {};
    const passt = (a, r) => a === 'tram' ? r === 'tram' : a === 'ubahn' ? r === 'ubahn' : r !== 'tram' && r !== 'ubahn';
    const aktiv = new Map(); for (const z of this.zuege) if (z.echt) aktiv.set(z.echt.id, z);
    for (const r of Q.zuegeBei(m.lat, m.lon, hb * 1.5)) {
      Q.zugLage(r, o); const x = (o.lon - m.lon) * K_LON, zz = (m.lat - o.lat) * K_LAT, zug = aktiv.get(r.id);
      if (zug) { const n = this.routeNah(zug.R, x, zz); if (n.d > 120) { zug.echt = null; continue; } zug.echt.s = n.s + zug.L * 0.5; zug.echt.v = r.v || 0; zug.echt.t = jetzt; continue; }
      if (Math.abs(x) > hb || Math.abs(zz) > hb || r.kurs == null) continue;
      let beste = null, bn = null; for (const R of this.routen) { if (!passt(r.art, R.art)) continue; const n = this.routeNah(R, x, zz); if (n.d < 70 && (!bn || n.d < bn.d)) { bn = n; beste = R; } } if (!beste) continue;
      let R = beste, s = bn.s; if (Math.sin(r.kurs) * bn.tx - Math.cos(r.kurs) * bn.tz < 0) { R = this.gegenRoute(beste); s = R.len - s; }
      const zg = this.zugStarten(R, s, r.art); if (!zg) continue; zg.ohneHalt = true; zg.v = r.v || 0; zg.echt = { id: r.id, s: zg.s, v: r.v || 0, t: jetzt };
    }
    for (const z of this.zuege) if (z.echt && jetzt - z.echt.t > 60000) z.echt = null;
  }
  routeNah(R, x, z) { const P = R.P, S = R.S; let best = 1e12, bs = 0, tx = 0, tz = 1; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz || 1e-6, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / l2)), qx = a[0] + dx * t - x, qz = a[2] + dz * t - z, d = qx * qx + qz * qz; if (d < best) { best = d; bs = S[i] + (S[i + 1] - S[i]) * t; const l = Math.sqrt(l2); tx = dx / l; tz = dz / l; } } return { d: Math.sqrt(best), s: bs, tx, tz }; }
  // Bahnsteige sind begehbar: Höhe je Punkt über ein grobes Raster (Wunsch Nr. 63, zum Zug hinlaufen und einsteigen)
  steigDazu(T, N, qa, qb, h) { const Z = this.steigZellen ||= new Map(); for (let i = 0; i < T.length - 1; i++) { const a = T[i], b = T[i + 1], L2 = (b[0] - a[0]) ** 2 + (b[2] - a[2]) ** 2 || 1, e = { ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], nx: N[i][0], nz: N[i][1], L2, qa, qb, h }, x0 = Math.floor((Math.min(a[0], b[0]) - 6) / 24), x1 = Math.floor((Math.max(a[0], b[0]) + 6) / 24), z0 = Math.floor((Math.min(a[2], b[2]) - 6) / 24), z1 = Math.floor((Math.max(a[2], b[2]) + 6) / 24); for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = ix + ':' + iz; let L = Z.get(k); if (!L) Z.set(k, L = []); L.push(e); } } }
  steigHoehe(x, z) { const L = this.steigZellen?.get(Math.floor(x / 24) + ':' + Math.floor(z / 24)); if (!L) return null; let y = null; for (const e of L) { const dx = x - e.ax, dz = z - e.az, t = (dx * (e.bx - e.ax) + dz * (e.bz - e.az)) / e.L2; if (t < -0.03 || t > 1.03) continue; const q = dx * e.nx + dz * e.nz; if (q < e.qa || q > e.qb) continue; const yy = e.ay + (e.by - e.ay) * t + e.h; if (y === null || yy > y) y = yy; } return y; }
  // Stehender Zug für Fahrgäste nah bei x, z: { zug, w, name }
  zugNah(x, z, r = 5.5) { let b = null, bd = r; for (const q of this.zuege) { if (q.art === 'gueter' || q.v > 0.7) continue; for (let w = 0; w < q.wagen.length; w++) { const c = q.wagen[w]; if (c.px === undefined) continue; const rx = x - c.px, rz = z - c.pz, l = rx * c.dx + rz * c.dz, d = Math.hypot(rx - c.dx * l, rz - c.dz * l); if (Math.abs(l) < c.l / 2 + 1 && d < bd) { bd = d; b = { zug: q, w }; } } } return b; }
  gegenRoute(R) { if (R.gegen) return R.gegen; const Q = R.P.slice().reverse(), S = new Float64Array(Q.length); for (let i = 1; i < Q.length; i++) S[i] = S[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1], Q[i][2] - Q[i - 1][2]); const G = { P: Q, S, len: S[S.length - 1], art: R.art, halte: R.halte.map(h => ({ ...h, s: R.len - h.s, seite: h.seite ? -h.seite : 0 })).sort((a, b) => a.s - b.s), kreuz: R.kreuz.map(q => ({ ...q, s: R.len - q.s })), tNeu: 1e9, kanten: R.kanten, gegen: R }; R.gegen = G; return G; }
  update(cam, verkehr = null, ton = null) {
    const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - this.tAlt) / 1000); this.tAlt = jetzt; this.t += dt;
    if (this.nahTeile) for (const m of this.nahTeile) m.visible = Math.hypot(m.userData.x - cam.x, m.userData.z - cam.z) < 300 && cam.y < 400;
    if (this.lampenMat) this.lampenMat.emissiveIntensity = 0.2 + 2.6 * NACHT.value;
    if (!this.bereit) return;
    materialien().glas.emissiveIntensity = 0.75 * NACHT.value;
    const F = this.flotte; for (const n in F) F[n].n = 0;
    // Echte Züge (kit/echtzeit.js): wo es eine offene Quelle gibt, fährt nur noch, was wirklich fährt
    if ((this.tEcht = (this.tEcht ?? 2) - dt) <= 0) { this.tEcht = 2; this.echtAbgleich(); }
    // neue Züge
    if (!this.echtAn) for (const R of this.routen) { if ((R.tNeu -= dt) <= 0) { R.tNeu = (R.art === 'tram' ? 70 : R.art === 'sbahn' || R.art === 'ubahn' ? 110 : 170) * (0.7 + this.R() * 0.8); const belegt = this.zuege.some(z => z.R === R && z.s < z.L + 260); if (!belegt) this.zugStarten(R); } }
    for (const k of this.kreuz) k.soll = 0;
    let nahD = 1e9, nahV = 0; this.sperren.length = 0; const A = _a, B = _b, Mx = _m, X = _x, Y = _y, Z = _z, gl = _c;
    for (let i = this.zuege.length - 1; i >= 0; i--) {
      const z = this.zuege[i], R = z.R, zz = z.Z; let vZiel = zz.v;
      // Halten: Zugmitte am Bahnsteig
      if (!z.ohneHalt) { while (z.naechster < R.halte.length && z.s - z.L / 2 > R.halte[z.naechster].s + 3) z.naechster++; const h = R.halte[z.naechster]; if (h) { const ziel = h.s + z.L / 2, d = ziel - z.s; if (z.halt > 0) { vZiel = 0; if ((z.halt -= dt) <= 0) { z.naechster++; z.halt = 0; } } else if (d < 0.8) { z.halt = (zz.halt || 26) * (0.8 + this.R() * 0.4) * (z.fg !== undefined ? 0.6 : 1); vZiel = 0; } else vZiel = Math.min(vZiel, Math.sqrt(2 * zz.b * Math.max(0, d - 0.5)) + 0.3); } }
      if (z.echt) { const E = z.echt; E.s += E.v * dt; vZiel = THREE.MathUtils.clamp(E.v + (E.s - z.s) * 0.3, 0, zz.v * 1.4); }
      // Abstand zum Vordermann auf derselben Route
      for (const o of this.zuege) if (o !== z && o.R === R && o.s > z.s) { const lueck = o.s - o.L - z.s - 25; vZiel = Math.min(vZiel, Math.max(0, Math.sqrt(2 * zz.b * Math.max(0, lueck)) + o.v * 0.8)); }
      if (z.fg !== undefined) { const rest = R.len - (z.s - z.wagen[z.fg].off) - 8; if (rest < 400) vZiel = Math.min(vZiel, Math.sqrt(2 * zz.b * Math.max(0, rest))); }   // mit Fahrgast: am Ende der Strecke warten, bis der nächste Ort steht
      z.v += THREE.MathUtils.clamp(vZiel - z.v, -zz.b * dt * 1.4, zz.a * dt); if (z.v < 0.01 && vZiel < 0.01) z.v = 0; z.s += z.v * dt;   // nur im Stand auf null: bei 120 Bildern je Sekunde ist ein Anfahrschritt kleiner als 0,01, sonst kam ein Zug nie mehr los
      if (z.s - z.L > R.len + 5 && z.fg === undefined) { this.zuege.splice(i, 1); continue; }
      for (const q of R.kreuz) { const d = q.s - z.s; if (d < z.v * 15 + 50 && d > -z.L - 12) this.kreuz[q.k].soll = 1; }
      for (let w = 0; w < z.wagen.length; w++) {
        const c = z.wagen[w], sc = z.s - c.off; if (sc < 2 || sc > R.len - 2) continue; const e = F[c.n]; if (!e) continue;
        const h = z.hints[w]; h[0] = this.an(R, Math.max(0, sc + c.dr), A, h[0]); h[1] = this.an(R, Math.max(0, sc - c.dr), B, h[1]);
        Z.subVectors(A, B); const lz = Z.length() || 1; Z.divideScalar(lz); if (c.umg) Z.negate(); X.set(Z.z, 0, -Z.x).normalize(); Y.crossVectors(Z, X); Mx.makeBasis(X, Y, Z); gl.addVectors(A, B).multiplyScalar(0.5); Mx.setPosition(gl);
        const dc = Math.hypot(gl.x - cam.x, gl.z - cam.z); if (dc < nahD) { nahD = dc; nahV = z.v; }
        c.px = gl.x; c.py = gl.y; c.pz = gl.z; c.dx = Z.x; c.dz = Z.z; if (z.fg === w) { (z.fgM ||= new THREE.Matrix4()).copy(Mx); continue; }   // in diesem Wagen sitzt der Spieler: den zeigt kit/mitfahrt.js von innen
        if (e.n >= e.lack.instanceMatrix.count) continue; const idx = e.n++; e.lack.setMatrixAt(idx, Mx); e.glas?.setMatrixAt(idx, Mx); e.licht?.setMatrixAt(idx, Mx);
        const f = c.n === 'lok' ? z.lokF : z.fa; if (e.lack.instanceColor || f) { _farbe.setRGB(f ? f[0] : 1, f ? f[1] : 1, f ? f[2] : 1); e.lack.setColorAt(idx, _farbe); }
        if (e.licht) { const vorn = !c.umg; if (vorn) _farbe.setRGB(5, 4.7, 4.1); else _farbe.setRGB(3.6, 0.1, 0.06); e.licht.setColorAt(idx, _farbe); }
        if (R.art === 'tram' && verkehr) this.sperren.push({ pos: { x: gl.x, z: gl.z }, breite: 2.6, v: z.v });
      }
    }
    for (const n in F) { const e = F[n]; for (const p of ['lack', 'glas', 'licht']) { const m = e[p]; if (!m) continue; m.count = e.n; if (e.n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } } }
    // Schranken
    if (this.kreuz.length) { let neu = false; for (const k of this.kreuz) { const z0 = k.zu; k.zu = THREE.MathUtils.clamp(k.zu + (k.soll - k.zu > 0 ? dt / 6 : k.soll - k.zu < 0 ? -dt / 5 : 0), 0, 1); if (k.zu !== z0 || k.soll) neu = true; if (k.soll || k.zu > 0.02) this.sperren.push({ pos: { x: k.x, z: k.z }, breite: k.w / 2 + 3, v: 0 }); } if (neu) this.armeSetzen(); }
    if (verkehr) verkehr.sperren = this.sperren;
    this.nah.d = nahD; this.nah.v = nahV; if (ton?.zug) ton.zug(nahD, nahV, dt);
  }
  entsorgen() {
    this.weg = true;
    for (const m of this.teile) { m.geometry?.dispose(); if (m.isInstancedMesh) m.dispose(); }
    if (this.flotte) for (const n in this.flotte) for (const p of ['lack', 'glas', 'licht']) this.flotte[n][p]?.dispose();
    for (const m of this.mats || []) m.dispose();
  }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _farbe = new THREE.Color();
function schieneV(nah, P, keyN) { const k = keyN(P[0][0], P[0][2]); if (!nah.has(k)) nah.set(k, neuV()); return nah.get(k); }
export function geoZusammen(L) { const pos = [], nor = [], idx = []; let o = 0; for (const g0 of L) { const g = g0.index ? g0 : g0; const p = g.attributes.position, n = g.attributes.normal, ii = g.index; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } if (ii) for (let i = 0; i < ii.count; i++) idx.push(ii.getX(i) + o); else for (let i = 0; i < p.count; i++) idx.push(i + o); o += p.count; } const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); G.setIndex(idx); return G; }
