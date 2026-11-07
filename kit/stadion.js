// Stadien (06.11.2026, Nader: "alles, was in der echten Welt will ich da auch haben"). Vorher wurde aus jedem Stadion ein Ring aus Bürohäusern (Wembley mit einer 130 m hohen Fensterwand). Lage, Größe und Richtung aus den Umrissen der Karte (kit/ortbau.js),
// die Form ist überall dieselbe Bauart: Schüssel als Superellipse, zwei Ränge mit Sitzreihen, Logenband, Dach, Fassade mit Rippen. Die Farbe wechselt je Stadion. Keine Marken, keine Vereinsnamen.
import * as THREE from 'three';
import { T } from './sprache.js';

export const stadionPunkt = (s, rx, rz, a) => { const c = Math.cos(a), si = Math.sin(a), n = 2 / 2.7, u = Math.sign(c) * Math.abs(c) ** n * rx, v = Math.sign(si) * Math.abs(si) ** n * rz, ca = Math.cos(s.ry), sa = Math.sin(s.ry); return [s.x + u * sa + v * -ca, s.z + u * ca + v * sa]; };   // u entlang der langen Achse (L), v quer (B)
// Grundriss für die Kollision und zum Freihalten
export function stadionUmriss(s, n = 40) { const P = []; for (let i = 0; i < n; i++) P.push(stadionPunkt(s, s.L / 2, s.B / 2, i / n * Math.PI * 2)); return P; }
export function imStadion(s, x, z, rand = 0) { const ca = Math.cos(s.ry), sa = Math.sin(s.ry), dx = x - s.x, dz = z - s.z, u = (dx * sa + dz * ca) / (s.L / 2 + rand), v = (-dx * ca + dz * sa) / (s.B / 2 + rand); return Math.abs(u) ** 2.7 + Math.abs(v) ** 2.7 < 1; }

const _bilder = new Map();
function rangBild(farbe, frei) {
  const k = farbe.join() + frei; if (_bilder.has(k)) return _bilder.get(k);
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#26272b'; g.fillRect(0, 0, W, H);
  let s = 11; const R = () => (s = (s * 16807) % 2147483647) / 2147483647, BUNT = ['#c9c4b8', '#23262b', '#b03a2e', '#2d4a78', '#d8d6cf', '#3a3f35', '#8a6f4d', '#d2a52c'];
  for (let y = 0; y < 16; y++) { const yy = y * H / 16; g.fillStyle = '#17181b'; g.fillRect(0, yy + H / 16 - 3, W, 3); for (let x = 0; x < 42; x++) { const xx = x * W / 42; g.fillStyle = R() < frei ? `rgb(${farbe[0] + (R() * 22 - 11) | 0},${farbe[1] + (R() * 22 - 11) | 0},${farbe[2] + (R() * 22 - 11) | 0})` : BUNT[Math.floor(R() * BUNT.length)]; g.fillRect(xx + 1, yy + 2, W / 42 - 2, H / 16 - 6); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; _bilder.set(k, t); return t;
}
function fassadeBild() {
  if (_bilder.has('f')) return _bilder.get('f'); const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#c9ccce'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < 8; x++) { const xx = x * W / 8; g.fillStyle = '#8c9094'; g.fillRect(xx, 0, 4, H); g.fillStyle = '#e2e4e4'; g.fillRect(xx + 4, 0, 3, H); }
  g.fillStyle = '#1e262e'; g.fillRect(0, 96, W, 34); g.fillStyle = '#51616e'; for (let x = 0; x < 16; x++) g.fillRect(x * W / 16 + 2, 98, W / 16 - 4, 30); g.fillStyle = '#6f7478'; g.fillRect(0, 0, W, 8); g.fillRect(0, 186, W, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; _bilder.set('f', t); return t;
}
const FARBEN = [[172, 42, 38], [40, 74, 138], [214, 214, 208], [36, 104, 66], [204, 160, 38], [60, 64, 72]];

// Bande mit Werbung rund ums Spielfeld (07.11.2026): noch frei, buchbar je Stadion (dashboard/register.html)
function bandeBild() { const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#F26A21'; g.fillRect(0, 0, 1024, 64); g.fillStyle = '#FEFEFE'; g.font = '800 44px system-ui, -apple-system, Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(T('Hier kann deine Werbung hängen'), 24, 34); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export class Stadien {
  constructor(ort, liste, { mobil = false, leuchte = null } = {}) {
    this.gruppe = new THREE.Group(); this.gruppe.name = 'stadien'; this.mats = []; this.geos = []; const H = ort.H;
    for (const s of liste) {
      const y0 = H(s.x, s.z), N = mobil ? 56 : 96, rO = [s.L / 2 - 0.5, s.B / 2 - 0.5], d = THREE.MathUtils.clamp(Math.min(rO[0] - 57, rO[1] - 38), 11, 48), hoch = s.h, f = FARBEN[Math.abs(Math.round(s.x * 3 + s.z * 5)) % FARBEN.length];
      // Querschnitt der Ränge von innen nach außen: [Abstand vom inneren Rand, Höhe]
      const Q = [[0, 0.2], [0, 2.8], [d * 0.46, 2.8 + (hoch - 3) * 0.34], [d * 0.54, 2.8 + (hoch - 3) * 0.34], [d * 0.54, 2.8 + (hoch - 3) * 0.34 + 3.2], [d * 0.56, 2.8 + (hoch - 3) * 0.34 + 3.2], [d, hoch]];
      const stoffe = [null, 'rang', 'beton', 'band', 'beton', 'rang'];
      const bau = { rang: { pos: [], uv: [], idx: [] }, beton: { pos: [], uv: [], idx: [] }, werbe: { pos: [], uv: [], idx: [] }, band: { pos: [], uv: [], idx: [] }, fassade: { pos: [], uv: [], idx: [] }, dach: { pos: [], uv: [], idx: [] }, licht: { pos: [], uv: [], idx: [] } };
      const ringPkt = (dI, y, a) => { const p = stadionPunkt(s, rO[0] - d + dI, rO[1] - d + dI, a); return [p[0], y0 + y, p[1]]; };
      const band = (b, q0, q1, uS, vS) => { const v0 = b.pos.length / 3; for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2, p0 = ringPkt(q0[0], q0[1], a), p1 = ringPkt(q1[0], q1[1], a); b.pos.push(...p0, ...p1); const u = i / N * uS; b.uv.push(u, 0, u, vS); } for (let i = 0; i < N; i++) { const a = v0 + i * 2; b.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } };
      const umfang = 2 * Math.PI * Math.sqrt((rO[0] * rO[0] + rO[1] * rO[1]) / 2);
      band(bau.beton, Q[0], Q[1], umfang / 8, 1);          // Bande
      band(bau.werbe, [-0.35, 0.2], [-0.35, 1.15], Math.round(umfang / 22), 1);   // Werbung davor
      band(bau.rang, Q[1], Q[2], Math.round(umfang / 22), 1.6);   // Unterrang
      band(bau.beton, Q[2], Q[3], umfang / 8, 1);          // Umgang
      band(bau.band, Q[3], Q[4], Math.round(umfang / 18), 1);     // Logen
      band(bau.beton, Q[4], Q[5], umfang / 8, 1);
      band(bau.rang, Q[5], Q[6], Math.round(umfang / 22), 1.9);   // Oberrang
      // Fassade außen (nach außen gewendet), Rand oben, Dach
      band(bau.fassade, [d, hoch + 3], [d, 0], Math.round(umfang / 26), Math.max(1, Math.round((hoch + 3) / 13)));
      band(bau.beton, [d, hoch], [d, hoch + 3], umfang / 8, 1);
      const dachI = d * 0.34, dachH = hoch + 9;
      band(bau.dach, [d + 0.8, hoch + 3], [dachI, dachH], 40, 2);
      // Lichtband unter der Dachkante
      band(bau.licht, [dachI + 0.4, dachH - 0.7], [dachI + 0.4, dachH - 0.15], 40, 1);
      const zuGeo = b => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setIndex(b.idx); g.computeVertexNormals(); return g; };
      const mk = (b, m, schatten) => { const g = zuGeo(b), me = new THREE.Mesh(g, m); me.castShadow = schatten && !mobil; me.receiveShadow = true; this.gruppe.add(me); this.geos.push(g); };
      const mR = new THREE.MeshStandardMaterial({ map: rangBild(f, 0.45), roughness: 0.82, metalness: 0, side: THREE.DoubleSide }), mB = new THREE.MeshStandardMaterial({ color: 0x9a9c9a, roughness: 0.9, side: THREE.DoubleSide }), mL = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.25, metalness: 0.4, side: THREE.DoubleSide }), mF = new THREE.MeshStandardMaterial({ map: fassadeBild(), roughness: 0.72, metalness: 0.12, side: THREE.DoubleSide }), mD = new THREE.MeshStandardMaterial({ color: 0xcfd2d2, roughness: 0.48, metalness: 0.35, side: THREE.DoubleSide });
      const mW = new THREE.MeshBasicMaterial({ map: bandeBild(), side: THREE.DoubleSide, toneMapped: true }); this.mats.push(mR, mB, mL, mF, mD, mW); mk(bau.werbe, mW, false);
      mk(bau.rang, mR, false); mk(bau.beton, mB, true); mk(bau.band, mL, false); mk(bau.fassade, mF, true); mk(bau.dach, mD, true); mk(bau.licht, leuchte || mB, false);
    }
  }
  entsorgen() { for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); this.gruppe.removeFromParent(); }
}
