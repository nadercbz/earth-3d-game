// Skyline ohne Laden (Wunsch Nr. 56, 06.11.2026, Nader: "Die Weitsicht sollte auch sehr, sehr gut sein. Also vieles sollte schon zu sehen sein von weiter weg und nicht immer erst nach dem Laden").
// Daten: daten/heute/hochbauten.bin (Wikidata, CC0, Abruf 06.11.2026): 5.250 Hochhäuser und Türme weltweit ab rund 50 m mit Lage und Höhe, ohne Abfrage zur Laufzeit. Je Eintrag 10 Bytes (lat, lon als Float32, Höhe als Uint16).
// Instanzen um einen Bezugspunkt (Float32 reicht so bis 120 km auf Zentimeter), Stil wie die Gebäudekisten. Wo die echten Kisten schon stehen (kit/erdwelt.js, Umkreis kistenFern), bleibt der Platz frei.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fernMaterial } from './city.js';
import { enu, geoZuSzene } from './erde.js';

const D2R = Math.PI / 180, _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _b = new THREE.Matrix4(), _x = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _w = new THREE.Vector3();
const TYPEN = [1, 4, 0];   // Fassaden aus kit/city.js (fernMaterial): schwarzes Glas, Bänder, helles Raster
function koerper(typ) {
  const teil = (b, y0, y1, t) => { const g = new THREE.BoxGeometry(b, y1 - y0, t).translate(0, (y0 + y1) / 2, 0); return g.toNonIndexed(); };
  const G = mergeGeometries([teil(1, 0, 0.66, 1), teil(0.76, 0.66, 0.9, 0.76), teil(0.44, 0.9, 1, 0.44)]); G.deleteAttribute('uv'); const n = G.attributes.position.count, A = new Float32Array(n); A.fill(typ + 0.2); G.setAttribute('aTyp', new THREE.BufferAttribute(A, 1)); return G;
}
export class Skyline {
  constructor(szene, { mobil = false } = {}) {
    this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'skyline'; szene.add(this.gruppe); this.max = mobil ? 220 : 900; this.R = mobil ? 55000 : 120000; this.t = 0; this.bezug = new THREE.Vector3(); this.L = null; this.teile = [];
    fetch(new URL('../daten/heute/hochbauten.bin', import.meta.url)).then(r => r.arrayBuffer()).then(b => { const v = new DataView(b), n = b.byteLength / 10, L = []; for (let i = 0; i < n; i++) L.push({ lat: v.getFloat32(i * 10, true), lon: v.getFloat32(i * 10 + 4, true), h: v.getUint16(i * 10 + 8, true), i }); this.L = L; }).catch(e => console.warn('Skyline', e));
    this.mat = fernMaterial({ instanziert: true, lokal: false, licht: 1.1 });
    for (const typ of TYPEN) { const m = new THREE.InstancedMesh(koerper(typ), this.mat, Math.ceil(this.max / TYPEN.length)); m.count = 0; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; this.gruppe.add(m); this.teile.push(m); }
  }
  // blick: Bodenpunkt unter der Kamera. innen: dort stehen schon die echten Kisten, hA: Höhe über Grund
  update(dt, W, blick, hA, innen, boden) {
    if (!this.L) return; const zeigt = hA < 180000; this.gruppe.visible = zeigt; if (!zeigt) return;
    this.gruppe.quaternion.copy(W.zuLokal); W.weltZuLokal(this.bezug, this.gruppe.position);
    if ((this.t -= dt) > 0 && Math.abs(blick.lat - (this.la ?? 999)) < 0.012 && Math.abs(blick.lon - (this.lo ?? 999)) < 0.018 && Math.abs(innen - (this.innenAlt ?? -1)) < 1) return;
    this.t = 1.5; this.la = blick.lat; this.lo = blick.lon; this.innenAlt = innen; const cl = Math.max(0.1, Math.cos(blick.lat * D2R)), dLa = this.R / 111132, dLo = this.R / (111320 * cl), wahl = [];
    for (const e of this.L) { const a = e.lat - blick.lat; if (a > dLa || a < -dLa) continue; const o = e.lon - blick.lon; if (o > dLo || o < -dLo) continue; const d = Math.hypot(a * 111132, o * 111320 * cl); if (d > this.R || d < innen) continue; wahl.push({ e, d, w: e.h * e.h / Math.max(800, d) }); }
    wahl.sort((a, b) => b.w - a.w); wahl.length = Math.min(wahl.length, this.max);
    geoZuSzene(blick.lat, blick.lon, 0, this.bezug); W.weltZuLokal(this.bezug, this.gruppe.position); const n = [0, 0, 0];
    for (const { e } of wahl) { const k = e.i % TYPEN.length, m = this.teile[k], hg = Math.max(-5, boden?.(e.lat, e.lon) ?? 0) - 25; geoZuSzene(e.lat, e.lon, hg, _w).sub(this.bezug); const u = enu(e.lat, e.lon); _x.crossVectors(u.oben, u.nord).normalize(); _b.makeBasis(_x, u.oben, u.nord); _q.setFromRotationMatrix(_b); _q2.setFromAxisAngle(_Y, (e.i * 2.399) % 3.1416); _q.multiply(_q2); const br = Math.max(16, Math.min(62, e.h * (0.15 + ((e.i * 7) % 11) * 0.012))), ti = br * (0.72 + ((e.i * 13) % 9) * 0.04); _s.set(br, e.h + 25, ti); _M.compose(_p.copy(_w), _q, _s); if (n[k] < m.instanceMatrix.count) m.setMatrixAt(n[k]++, _M); }
    this.teile.forEach((m, k) => { m.count = n[k]; m.instanceMatrix.needsUpdate = true; });
  }
}
