// Mitfahren in der echten Welt (06.11.2026, Wunsch Nr. 63: "in die S-Bahnen und Ringbahnen ... einsteigen ... Auch in alle anderen, wie Flugzeuge am Airport, will ich einsteigen und mitfliegen können, dort sitzen").
// Innenraum hängt am Fahrzeug, draußen zieht die echte Welt vorbei. Die Figur läuft im Rahmen des Fahrzeugs (wie an Bord des Kreuzers), darum zittert nichts.
// Lage immer in Weltkoordinaten (ECEF, doppelte Genauigkeit), jedes Bild neu in den lokalen Rahmen: so überlebt sie Ankerwechsel und Ortswechsel.
// Quellen: Züge aus kit/bahn.js auf den echten Gleisen über Ortsgrenzen hinweg, oder ein Flug zwischen echten Flughäfen (OurAirports, gemeinfrei) mit Gate, Rollen, Start, Reise im Zeitraffer, Anflug und Landung.
import * as THREE from 'three';
import { Figur } from './player.js';
import { spawn, aktionBereit } from './people.js';
import { zugBauen, Bau, raumMat, leucht, weissBereit, TEX } from './ubahn.js';
import { geoZuSzene, szeneZuGeo, enu } from './erde.js';
import { fliegerLaden, fliegerMaterial } from './flughafen.js';

const kl = THREE.MathUtils.clamp, D2R = Math.PI / 180, ERDE = 6371000, ZI = 1.22, ZB = 1.38, RAD = 0.26, TUEREN = [-6, 0, 6];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _o = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s1 = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 1), _x = new THREE.Vector3(1, 0, 0), _y = new THREE.Vector3(0, 1, 0), _eu = new THREE.Euler();
const wrap = w => Math.atan2(Math.sin(w), Math.cos(w));
const zuEinheit = (lat, lon, o = new THREE.Vector3()) => { const c = Math.cos(lat * D2R); return o.set(c * Math.cos(lon * D2R), c * Math.sin(lon * D2R), Math.sin(lat * D2R)); };
const vonEinheit = u => ({ lat: Math.asin(kl(u.z, -1, 1)) / D2R, lon: Math.atan2(u.y, u.x) / D2R });

// ---------- Flugplan: alle Flughäfen mit Linienverkehr ----------
let _fl = null;
export function flughaefenLaden(url) { return _fl ||= fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => d.flughaefen.map(a => ({ c: a[0], name: a[1], n: a[2] || a[1], iso: a[3], lat: a[4], lon: a[5], h: a[6], rw: a[7], gross: a[8] }))).catch(e => { _fl = null; throw e; }); }

// ---------- Kabine: Gang, drei und drei Sitze, Fenster mit runden Ecken, Gepäckfächer, Bildschirme, Tragfläche draußen ----------
function flugKarteMalen(g, w, h, o) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b2a4a'); gr.addColorStop(1, '#071a2e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,190,240,0.16)'; g.lineWidth = 1; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h * 0.68); g.stroke(); } for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * h * 0.17); g.lineTo(w, i * h * 0.17); g.stroke(); }
  const xa = w * 0.14, xb = w * 0.86, ya = h * 0.42, yb = h * 0.42, tp = kl(o.anteil ?? 0, 0, 1), y = t => ya + (yb - ya) * t - Math.sin(t * Math.PI) * h * 0.22, x = t => xa + (xb - xa) * t;
  g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 3; g.setLineDash([9, 8]); g.beginPath(); for (let i = 0; i <= 40; i++) g[i ? 'lineTo' : 'moveTo'](x(i / 40), y(i / 40)); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#f7c948'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40 * tp; g[i ? 'lineTo' : 'moveTo'](x(t), y(t)); } g.stroke();
  g.fillStyle = '#fff'; g.font = '700 20px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(o.von || '', xa, ya + 34); g.fillText(o.nach || '', xb, yb + 34); g.beginPath(); g.arc(xa, ya, 5, 0, 7); g.arc(xb, yb, 5, 0, 7); g.fill();
  g.save(); g.translate(x(tp), y(tp)); g.fillStyle = '#f7c948'; g.beginPath(); g.moveTo(14, 0); g.lineTo(-10, -9); g.lineTo(-5, 0); g.lineTo(-10, 9); g.closePath(); g.fill(); g.restore();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h * 0.7, w, h * 0.3); g.fillStyle = '#fff'; g.font = '600 21px system-ui,sans-serif'; g.textAlign = 'left'; g.fillText(o.z1 || '', 18, h * 0.81); g.fillText(o.z2 || '', 18, h * 0.93);
}
export function kabineBauen(mobil = false) {
  const G = new THREE.Group(); G.name = 'kabine'; const geteilt = { uKam: { value: new THREE.Vector3() }, uBand: { value: new THREE.Vector3(-0.62, 0.62, 1000) }, uH: { value: 2.16 }, uI: { value: 0.26 }, uAmb: { value: 0.5 }, uRaster: { value: 2.6 } }, weiss = weissBereit(), m = (t, o = {}) => raumMat(t, { ...o, geteilt });
  const mc = document.createElement('canvas'); mc.width = 512; mc.height = 288; const karteTex = new THREE.CanvasTexture(mc); karteTex.colorSpace = THREE.SRGBColorSpace; karteTex.anisotropy = 4;
  const ec = document.createElement('canvas'); ec.width = 128; ec.height = 48; { const g = ec.getContext('2d'); g.fillStyle = '#0b6e3a'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#eafff0'; g.font = '800 34px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', 64, 25); } const exitTex = new THREE.CanvasTexture(ec); exitTex.colorSpace = THREE.SRGBColorSpace;
  const fensterBild = (lb, lh, rad, grund, kante) => { const c = document.createElement('canvas'); c.width = 430; c.height = 320; const g = c.getContext('2d'), k = 500, cx = 215, cy = 320 - 0.30 * k, rr = (w, h, r) => { g.beginPath(); g.roundRect(cx - w * k / 2, cy - h * k / 2, w * k, h * k, r * k); }; g.fillStyle = grund; g.fillRect(0, 0, 430, 320); for (let i = 5; i > 0; i--) { g.fillStyle = `rgba(${kante},${0.05 + 0.03 * (5 - i)})`; rr(lb + i * 0.012, lh + i * 0.012, rad + i * 0.006); g.fill(); } g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; rr(lb, lh, rad); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const lochMat = (t, farbe) => { const x = m(t, { farbe }); x.fragmentShader = x.fragmentShader.replace('vec3 N = normalize(vN),', 'if (texture2D(map, vUv).a < 0.5) discard; vec3 N = normalize(vN),'); return x; };
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; { const g = sc.getContext('2d'); g.fillStyle = '#1b2a4b'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 1800; i++) { const v = Math.random(); g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.05)'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } } const sitzT = new THREE.CanvasTexture(sc); sitzT.colorSpace = THREE.SRGBColorSpace; sitzT.wrapS = sitzT.wrapT = THREE.RepeatWrapping;
  const mats = { fenster: lochMat(fensterBild(0.3, 0.44, 0.13, '#e6e6e1', '40,42,46'), [0.95, 0.95, 0.93]), rahmen: lochMat(fensterBild(0.235, 0.36, 0.105, '#b8b9b6', '20,20,22'), [0.72, 0.72, 0.7]), wand: m(weiss, { farbe: [0.86, 0.87, 0.85], glanz: 0.08 }), teppich: m(TEX.boden, { farbe: [0.3, 0.34, 0.46] }), gang: m(TEX.boden, { farbe: [0.42, 0.42, 0.46] }), sitz: m(sitzT), kopf: m(weiss, { farbe: [0.74, 0.76, 0.8] }), dunkel: m(weiss, { farbe: [0.06, 0.06, 0.07] }), grau: m(weiss, { farbe: [0.32, 0.33, 0.36] }), fach: m(weiss, { farbe: [0.9, 0.9, 0.88], glanz: 0.12 }), rollo: m(weiss, { farbe: [0.82, 0.82, 0.8] }), licht: leucht(3.1, 3.05, 3.2), blau: leucht(0.42, 0.62, 1.4), lese: leucht(1.8, 1.7, 1.3), monitor: new THREE.MeshBasicMaterial({ map: karteTex, toneMapped: false }), exit: new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false }) };
  const B = new Bau({ teppich: 2, gang: 2, sitz: 0.5 }), Z0 = -16, Z1 = 16, X = 2.02, hind = [], rows = [];
  B.box('gang', -0.36, 0.36, -0.08, 0, Z0, Z1); for (const q of [-1, 1]) B.box('teppich', q < 0 ? -X : 0.36, q < 0 ? -0.36 : X, -0.08, 0, Z0, Z1);
  // Wand: unten schräg, darüber eine Verkleidung mit echten Fensteröffnungen, dahinter der tiefe Rahmen, die Scheibe und einige Rollos halb unten
  let R0 = 1; const zufall = () => (R0 = (R0 * 16807) % 2147483647) / 2147483647, Fz = 0.86, Y0 = 0.92, Y1 = 1.56, rollos = new Set();
  for (const q of [-1, 1]) {
    B.prisma('wand', q < 0 ? [[-1.86, 0], [-X, 0.5], [-X, Y0]] : [[X, Y0], [X, 0.5], [1.86, 0]], Z0, Z1);
    for (let z = Z0; z < Z1 - 0.01; z += Fz) {
      for (const [k, x] of [['fenster', q * X], ['rahmen', q * (X + 0.075)]]) B.quad(k, [x, Y0, z], [x, Y0, z + Fz], [x, Y1, z + Fz], [x, Y1, z], [-q, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      if (zufall() < 0.16) { const u = 1.46 - 0.12 - zufall() * 0.26, zc = z + Fz / 2; rollos.add(q + ':' + Math.round(zc * 100)); B.box('rollo', q < 0 ? -X - 0.045 : X + 0.04, q < 0 ? -X - 0.04 : X + 0.045, u, 1.5, zc - 0.17, zc + 0.17); }
    }
  }
  // Fächer, Decke, Lichtband, Stimmungslicht, Leselichter
  for (const q of [-1, 1]) {
    B.prisma('fach', q < 0 ? [[-X, 1.5], [-1.04, 1.74], [-0.94, 1.76], [-0.84, 2.1]] : [[0.84, 2.1], [0.94, 1.76], [1.04, 1.74], [X, 1.5]], Z0, Z1);
    for (let z = Z0; z < Z1; z += 1.72) { const a1 = [q * 0.94, 1.76, z], a2 = [q * 0.84, 2.1, z]; B.quad('dunkel', a1, [a1[0], a1[1], z + 0.014], [a2[0], a2[1], z + 0.014], a2, [q, 0, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]); B.box('grau', q * 0.905 - 0.012, q * 0.905 + 0.012, 1.86, 1.91, z + 0.7, z + 1.02); }
    B.box('blau', q * 0.98 - 0.012, q * 0.98 + 0.012, 1.72, 1.74, Z0, Z1);
    B.box('licht', q * 0.62 - 0.05, q * 0.62 + 0.05, 2.15, 2.17, Z0, Z1);
  }
  B.prisma('wand', [[-0.84, 2.1], [-0.46, 2.19], [0.46, 2.19], [0.84, 2.1]], Z0, Z1);
  // Stirnwände mit Vorhang und Notausgang
  for (const s of [-1, 1]) { const z0 = s < 0 ? Z0 - 0.1 : Z1, z1 = s < 0 ? Z0 : Z1 + 0.1; B.box('wand', -X - 0.1, X + 0.1, 0, 2.3, z0, z1); const zf = s < 0 ? Z0 + 0.012 : Z1 - 0.012; B.box('dunkel', -0.5, 0.5, 0, 1.96, Math.min(zf, zf + s * 0.01), Math.max(zf, zf + s * 0.01)); const zs = s < 0 ? Z0 + 0.03 : Z1 - 0.03; B.quad('exit', s < 0 ? [-0.2, 1.98, zs] : [0.2, 1.98, zs], s < 0 ? [0.2, 1.98, zs] : [-0.2, 1.98, zs], s < 0 ? [0.2, 2.1, zs] : [-0.2, 2.1, zs], s < 0 ? [-0.2, 2.1, zs] : [0.2, 2.1, zs], [0, 0, -s], [[1, 0], [0, 0], [0, 1], [1, 1]]); }
  // Sitze: Polster, Lehne, Kopfstütze, Armlehnen, Füße, Bildschirm in der Lehne davor, Leselicht darüber
  const seatZ = []; for (let z = Z0 + 1.2; z < Z1 - 1.1; z += 0.86) seatZ.push(z);
  for (let r = 0; r < seatZ.length; r++) {
    const z = seatZ[r], rs = { z, s: [] }; rows.push(rs);
    for (const q of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = q * (0.62 + i * 0.5); B.box('sitz', x - 0.23, x + 0.23, 0.42, 0.53, z - 0.02, z + 0.46); B.box('sitz', x - 0.23, x + 0.23, 0.53, 1.12, z - 0.08, z); B.box('kopf', x - 0.17, x + 0.17, 1.12, 1.3, z - 0.085, z + 0.005); B.box('grau', x - 0.232, x + 0.232, 0.5, 1.13, z - 0.1, z - 0.08);
        if (!mobil) { B.box('grau', x + 0.23, x + 0.26, 0.6, 0.65, z - 0.04, z + 0.36); if (i === 2 && q > 0) B.box('grau', x - 0.26, x - 0.23, 0.6, 0.65, z - 0.04, z + 0.36); if (i === 0 && q < 0) B.box('grau', x - 0.26, x - 0.23, 0.6, 0.65, z - 0.04, z + 0.36); B.box('dunkel', x - 0.015, x + 0.015, 0, 0.42, z + 0.1, z + 0.14); B.box('lese', x - 0.025, x + 0.025, 1.6 + i * 0.03, 1.61 + i * 0.03, z + 0.22, z + 0.26); }
        if (r < seatZ.length - 1) { const zb = seatZ[r + 1] - 0.102, w = 0.105, y0 = 0.88, y1 = 1.03; B.quad('monitor', [x + w, y0, zb], [x - w, y0, zb], [x - w, y1, zb], [x + w, y1, zb], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
        rs.s.push({ x, z: z + 0.2, q, fz: Z0 + Fz / 2 + Math.round((z + 0.2 - Z0 - Fz / 2) / Fz) * Fz });
      }
      hind.push(q < 0 ? [-X, -0.36, z - 0.1, z + 0.46] : [0.36, X, z - 0.1, z + 0.46]);
    }
  }
  B.fertig(mats, G);
  // Scheiben
  { const P = [], I = []; for (const q of [-1, 1]) for (let z = Z0; z < Z1 - 0.01; z += Fz) { const zc = z + Fz / 2, s = P.length / 3, x = q * (X + 0.08); P.push(x, 1.0, zc - 0.15, x, 1.0, zc + 0.15, x, 1.44, zc + 0.15, x, 1.44, zc - 0.15); I.push(s, s + 1, s + 2, s, s + 2, s + 3); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); const f = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xbcd0da, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })); f.frustumCulled = false; f.renderOrder = 3; G.add(f); }
  // Draußen: Tragfläche und Triebwerk im Licht der Welt
  const au = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }), tw = new THREE.MeshStandardMaterial({ color: 0x8e9398, roughness: 0.4, metalness: 0.6 }), W = new THREE.BufferGeometry();
  const wc = document.createElement('canvas'); wc.width = 1024; wc.height = 256; { const g = wc.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8d9297'); gr.addColorStop(0.1, '#d6d9dc'); gr.addColorStop(0.72, '#cdd0d4'); gr.addColorStop(0.73, '#b9bdc2'); gr.addColorStop(1, '#a9adb2'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 256); g.strokeStyle = 'rgba(60,64,70,0.5)'; g.lineWidth = 1.5; for (let i = 1; i < 12; i++) { const x = i * 1024 / 12; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); } for (const y of [28, 92, 184, 186]) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); } g.strokeStyle = 'rgba(30,32,36,0.8)'; g.lineWidth = 3; for (const [a, b] of [[60, 420], [440, 760], [780, 980]]) g.strokeRect(a, 186, b - a, 66); g.fillStyle = '#2d3136'; for (let x = 120; x < 1000; x += 170) g.fillRect(x, 60, 26, 7); g.fillStyle = 'rgba(190,60,40,0.8)'; g.fillRect(36, 92, 340, 4); } const wT = new THREE.CanvasTexture(wc); wT.colorSpace = THREE.SRGBColorSpace; wT.anisotropy = 8; const mW = new THREE.MeshStandardMaterial({ map: wT, roughness: 0.42, metalness: 0.35, side: THREE.DoubleSide });
  { const P = [], U = [], I = []; for (const q of [-1, 1]) { const s = P.length / 3; P.push(q * 2.05, -0.5, 4.6, q * 2.05, -0.5, -3.8, q * 17.6, 0.72, -5.2, q * 17.6, 0.72, -3.6); U.push(0, 1, 0, 0, 1, 0, 1, 1); I.push(s, s + 1, s + 2, s, s + 2, s + 3); } W.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); W.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); W.setIndex(I); W.computeVertexNormals(); }
  const fl = new THREE.Mesh(W, mW); fl.frustumCulled = false; G.add(fl);
  for (const q of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 3.4, 22).rotateX(Math.PI / 2), tw); e.position.set(q * 6.4, -1.2, 1.2); G.add(e); const r = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.08, 8, 22), au); r.position.set(q * 6.4, -1.2, 2.9); G.add(r); const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.5, 0.9), au); w2.position.set(q * 17.6, 1.4, -4.8); G.add(w2); }
  // Rumpf nach unten und oben von innen dicht
  { const u = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 33).translate(0, -0.14, 0), new THREE.MeshBasicMaterial({ color: 0x15161a })); G.add(u); const o = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 33).translate(0, 2.32, 0), new THREE.MeshBasicMaterial({ color: 0xe9e9e6 })); G.add(o); }
  const sitze = rows.flatMap(r => r.s); for (const s of sitze) s.rollo = rollos.has(s.q + ':' + Math.round(s.fz * 100));
  const anzeige = o => { flugKarteMalen(mc.getContext('2d'), 512, 288, o); karteTex.needsUpdate = true; };
  return { gruppe: G, geteilt, rechteck: [-0.34, 0.34, Z0 + 0.5, Z1 - 0.5], hindernisse: [], decke: 2.05, sitze, start: { x: 0, z: 0, ry: 0 }, mats, anzeige };
}
// Wagen von innen: ein Wagen der U-Bahn, die Außenhaut ersetzt das Modell des Zugs, solange man drin ist
function wagenBauen(mobil) {
  const Z = zugBauen(mobil, 1), hind = Z.hindernisse.map(h => [h[0], h[1], h[2], h[3]]), sitze = []; for (const h of Z.hindernisse) { for (let z = h[4] + 0.3; z < h[5] - 0.2; z += 0.56) sitze.push({ x: h[6] * (ZI - 0.32), z, q: h[6], quer: true }); }
  return { gruppe: Z.gruppe, geteilt: Z.geteilt, rechteck: [-ZI, ZI, -8.6, 8.6], hindernisse: hind, decke: 2.16, sitze, start: { x: 0, z: 0, ry: 0 }, mats: Z.mats, zug: Z };
}
class ZKollision {
  constructor(I) { this.I = I; this.yAkt = undefined; this.offen = 0; }
  // Türen offen: auf dieser Seite darf man durch die Türöffnung nach draußen laufen
  tuerFrei(x, z) { if (!this.offen || Math.sign(x) !== this.offen || Math.abs(x) > ZB + 0.55) return false; for (const t of TUEREN) if (Math.abs(z - t) < 0.62) return true; return false; }
  punktFrei(x, z) { const R = this.I.rechteck; if (x < R[0] || x > R[1] || z < R[2] || z > R[3]) return this.tuerFrei(x, z); for (const h of this.I.hindernisse) if (x > h[0] && x < h[1] && z > h[2] && z < h[3]) return false; return true; }
  frei(x, z) { const r = RAD * 0.7; return this.punktFrei(x - r, z - r) && this.punktFrei(x + r, z - r) && this.punktFrei(x - r, z + r) && this.punktFrei(x + r, z + r); }
  schritt(x, z, nx, nz) { if (this.frei(nx, nz)) return [nx, nz]; if (this.frei(nx, z)) return [nx, z]; if (this.frei(x, nz)) return [x, nz]; return [x, z]; }
  hoehe() { return 0; }
  sicht(x0, z0, x1, z1) { for (let i = 1; i <= 6; i++) { const t = i / 6; if (!this.punktFrei(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return (i - 1) / 6; } return 1; }
}

// ---------- Lage aus einem Zug auf den Gleisen des Ortes ----------
export class ZugQuelle {
  constructor(ortFn, zug, w) {
    this.ortFn = ortFn; this.zug = zug; this.w = w; this.bahn = ortFn()?.szene?.ort?.bahn; this.art = zug.art; this.name = zug.art === 'tram' ? 'Straßenbahn' : zug.art === 'ubahn' ? 'Hochbahn' : zug.art === 'regio' ? 'Regionalbahn' : zug.art === 'express' ? 'Fernzug' : 'S-Bahn'; this.fa = zug.fa; this.lokF = zug.lokF;
    this.lageW = new THREE.Vector3(); this.qW = new THREE.Quaternion(); this.lageAnz = new THREE.Vector3(); this.qAnz = new THREE.Quaternion(); this.dirW = new THREE.Vector3(0, 0, 1); this.querW = new THREE.Vector3(1, 0, 0); this.obenW = new THREE.Vector3(0, 1, 0); this.versatz = new THREE.Vector3();
    this.v = zug.v; this.halt = true; this.frei = false; this.t0 = true; this.wartet = 0; this.suche = 0; this.endT = 0; this.umg = zug.wagen[w].umg; zug.fg = w; zug.echt = null; zug.ohneHalt = false; zug.halt = Math.max(zug.halt, 13);
  }
  update(dt, W) {
    const Ort = this.ortFn(), B = Ort?.szene?.ort?.bahn;
    if (B && B !== this.bahn) { this.bahn = B; this.zug = null; this.suche = 0; }
    if (!this.zug && B && B.bereit && !B.weg && (this.suche -= dt) <= 0) { this.suche = 0.4; this.umsteigen(B, W); }
    const z = this.zug; this.frei = true;
    if (z && z.fgM && B && !B.weg && z.R) {
      B.gruppe.updateWorldMatrix(true, false); _m.multiplyMatrices(B.gruppe.matrixWorld, z.fgM); _p.setFromMatrixPosition(_m); _q.setFromRotationMatrix(_m);
      W.lokalZuWelt(_p, _a); this.qW.copy(W.zuWelt).multiply(_q); this.obenW.copy(_y).applyQuaternion(this.qW); this.querW.copy(_x).applyQuaternion(this.qW); this.dirW.copy(_z).applyQuaternion(this.qW); if (z.wagen[z.fg].umg) this.dirW.negate();
      _a.addScaledVector(this.obenW, 1.02);
      if (this.sprung) { this.sprung = false; this.versatz.copy(this.lageW).add(this.versatz).sub(_a); if (this.versatz.length() > 80) this.versatz.set(0, 0, 0); }
      this.lageW.copy(_a); this.v = z.v; this.frei = false; this.endT = 0;
      // Ende der Strecke im Ort ohne Anschluss: nach einer Weile Endstation, der Zug wendet
      const rest = z.R.len - (z.s - z.wagen[z.fg].off); if (z.v < 0.05 && rest < 30) { this.wartet += dt; if (this.wartet > 12) { this.wartet = 0; this.wenden(B); } } else this.wartet = 0;
    } else {
      // kein Gleis unter uns: auslaufen, bis der nächste Ort steht
      this.v = Math.max(0, this.v - dt * 0.9); this.lageW.addScaledVector(this.dirW, this.v * dt); this.endT = this.v < 0.1 ? this.endT + dt : 0;
    }
    this.halt = this.v < 0.25; this.versatz.multiplyScalar(Math.exp(-dt * 2.2)); this.lageAnz.copy(this.lageW).add(this.versatz);
    if (this.t0) { this.t0 = false; this.qAnz.copy(this.qW); } else this.qAnz.slerp(this.qW, 1 - Math.exp(-dt * 7));
  }
  neuerZug(B, R, s, umg) {
    if (B.zuege.length >= (B.mobil ? 4 : 11)) { const i = B.zuege.findIndex(q => q !== this.zug); if (i >= 0) B.zuege.splice(i, 1); }
    const z = B.zugStarten(R, s, this.art && this.art !== 'gueter' ? this.art : 'sbahn'); if (!z) return null; const w = Math.floor(z.wagen.length / 2); z.s = s + z.wagen[w].off; z.v = this.v; z.fg = w; z.ohneHalt = false; z.naechster = 0; z.echt = null; z.halt = 0; if (this.fa) z.fa = this.fa; if (this.lokF) z.lokF = this.lokF; z.wagen[w].umg = umg; this.zug = z; this.w = w; this.sprung = true; return z;
  }
  // Neuer Ort: Gleis in Fahrtrichtung finden, gleicher Zug läuft dort weiter (Maßstab und echte Strecke bleiben)
  umsteigen(B, W) {
    if (!B.routen?.length) return false; B.gruppe.updateWorldMatrix(true, false); _p.copy(this.lageW).addScaledVector(this.obenW, -1.02); W.weltZuLokal(_p, _a); B.gruppe.worldToLocal(_a); _b.copy(this.dirW).applyQuaternion(W.zuLokal); _q.setFromRotationMatrix(B.gruppe.matrixWorld).invert(); _b.applyQuaternion(_q);
    let best = null, bn = null, bw = 1e9; for (const R of B.routen) { if ((R.art === 'tram') !== (this.art === 'tram')) continue; const n = B.routeNah(R, _a.x, _a.z), d = Math.abs(_b.x * n.tx + _b.z * n.tz); if (n.d > 45 || d < 0.55) continue; const w2 = n.d + (1 - d) * 60 + (R.art === this.art ? 0 : 8); if (w2 < bw) { bw = w2; bn = n; best = R; } } if (!best) return false;
    let R = best, s = bn.s; if (_b.x * bn.tx + _b.z * bn.tz < 0) { R = B.gegenRoute(best); s = R.len - s; } return !!this.neuerZug(B, R, s, this.umg);
  }
  // Endstation: gleicher Wagen, andere Richtung (der Wagen dreht sich nicht, er fährt rückwärts los wie ein echter Wendezug)
  wenden(B) { const z = this.zug, R = z.R, off = z.wagen[z.fg].off, sc = z.s - off, G = B.gegenRoute(R); this.umg = !z.wagen[z.fg].umg; const i = B.zuege.indexOf(z); if (i >= 0) B.zuege.splice(i, 1); this.v = 0; this.neuerZug(B, G, G.len - sc, this.umg); this.sprung = false; if (this.zug) this.zug.halt = 0; this.gewendet = true; }
  // Punkt voraus für den nächsten Ort
  voraus() { const d = kl(this.v * 14, 120, 320); _c.copy(this.lageW).addScaledVector(this.dirW, d); const g = szeneZuGeo(_c); return { lat: g.lat, lon: g.lon }; }
  info() {
    const z = this.zug, h = z && !this.bahn?.weg ? z.R.halte[z.naechster] : null, stehtAm = !!(h && z.halt > 0 && z.v < 0.2), um = z ? (z.wagen[z.fg]?.umg ? -1 : 1) : 1, seite = h?.seite ? -h.seite * um : 1, ende = this.endT > 6 || !!(z && this.wartet > 2);
    return { a: stehtAm ? h.name : h ? `Nächster Halt: ${h.name}` : ende ? 'Endstation' : this.name, b: `${this.name}${this.halt ? (stehtAm && z.halt < 3 ? ' · Türen schließen' : ' · hält') : ` · ${Math.round(this.v * 3.6)} km/h`}`, halt: this.halt, seite, farbe: z?.fa, an: stehtAm ? h.name : ende ? 'Endstation' : null, offen: (stehtAm && z.halt > 2.4) || ende, anzeige: h?.name || this.name };
  }
  ende() { if (this.zug) { this.zug.fg = undefined; this.zug.fgM = null; } }
}

// ---------- Lage aus einem Flug: Gate, Rollen, Start, Steigen, Reise im Zeitraffer, Anflug auf die echte Piste, Landung, Gate am Ziel ----------
const BODEN_HOCH = 3.6;   // Fußboden der Kabine über dem Vorfeld
export class FlugQuelle {
  constructor({ ab, nach, boden, W, ortFn, ortBereit, gate = null }) {
    this.a = ab; this.b = nach; this.boden = boden; this.W = W; this.ortFn = ortFn; this.ortBereit = ortBereit; this.gate = gate;
    this.lageW = new THREE.Vector3(); this.qW = new THREE.Quaternion(); this.lageAnz = this.lageW; this.qAnz = this.qW; this.dirW = new THREE.Vector3(0, 0, 1); this.querW = new THREE.Vector3(1, 0, 0);
    this.bahnBauen(); this.s = 0; this.v = 0; this.raffer = 1; this.zeitraffer = true; this.t = 0; this.tPh = 0; this.nick = 0; this.roll = 0; this.halt = true; this.fertig = false; this.reiseH = this.S0 < 400000 ? 7000 : 11000; this.hA = (ab.h || 0) + BODEN_HOCH; this.hB = (nach.h || 0) + BODEN_HOCH; this.h = this.hA; this.boF = null; this.hint = 0; this.kurs = this.kursAn(0); this.rMax = Math.max(2, this.S0 / (230 * 42)); this.blende = null;
    this.phase = gate ? 'gate' : 'piste'; this.warte = gate ? 9 : 5; if (gate) { gate.fh.versteckeFest(gate.f, true); this.gatePose(gate); } else this.setzeAufBahn(0);
  }
  bahnBauen() {
    const a = this.a, b = this.b, A = zuEinheit(a.lat, a.lon), Bz = zuEinheit(b.lat, b.lon), tang = (P, Q) => Q.clone().addScaledVector(P, -P.dot(Q)).normalize();
    const piste = (f, wunsch) => { if (f.rw) { let p = zuEinheit(f.rw[0], f.rw[1]), q = zuEinheit(f.rw[2], f.rw[3]); let t = tang(p, q); if (t.dot(wunsch) < 0) { [p, q] = [q, p]; t = tang(p, q); } return { p, q, t, L: f.rw[4] || 3000 }; } const m = zuEinheit(f.lat, f.lon), t = wunsch.clone(), p = m.clone().addScaledVector(t, -1400 / ERDE).normalize(), q = m.clone().addScaledVector(t, 1400 / ERDE).normalize(); return { p, q, t: tang(p, q), L: 2800 }; };
    const Ra = piste(a, tang(A, Bz)), Rb = piste(b, tang(Bz, A).negate());
    const pts = [], add = v => { const n = pts.length; if (n && pts[n - 1].distanceToSquared(_o.copy(v).normalize()) < 1e-14) return; pts.push(v.clone().normalize()); };
    const linie = (p, q, schritt) => { const n = Math.max(1, Math.ceil(p.angleTo(q) * ERDE / schritt)); for (let i = 0; i <= n; i++) add(_c.copy(p).lerp(q, i / n)); };
    const bez = (p0, t0, p3, t3, L, schritt) => { const c1 = p0.clone().addScaledVector(t0, L / ERDE), c2 = p3.clone().addScaledVector(t3, -L / ERDE), n = Math.max(6, Math.ceil(p0.angleTo(p3) * ERDE / schritt)); for (let i = 1; i <= n; i++) { const u = i / n, m = 1 - u; add(_c.set(0, 0, 0).addScaledVector(p0, m * m * m).addScaledVector(c1, 3 * m * m * u).addScaledVector(c2, 3 * m * u * u).addScaledVector(p3, u * u * u)); } };
    const Dx = Ra.q.clone().addScaledVector(Ra.t, 6000 / ERDE).normalize(), Q0 = Rb.p.clone().addScaledVector(Rb.t, -26000 / ERDE).normalize();
    linie(Ra.p, Ra.q, 150); linie(Ra.q, Dx, 400); const gd = Dx.angleTo(Q0) * ERDE;
    if (gd > 1200000) { const om = Dx.angleTo(Q0), sl = d => { const f = d / gd, s = Math.sin(om); return Dx.clone().multiplyScalar(Math.sin((1 - f) * om) / s).addScaledVector(Q0, Math.sin(f * om) / s).normalize(); }, G1 = sl(320000), G2 = sl(gd - 320000), gt = tang(G1, G2), gt2 = tang(G2, G1).negate(); bez(Dx, Ra.t, G1, gt, 120000, 3000); const n = Math.ceil(G1.angleTo(G2) * ERDE / 30000), o2 = G1.angleTo(G2), s2 = Math.sin(o2); for (let i = 1; i <= n; i++) { const f = i / n; add(_c.copy(G1).multiplyScalar(Math.sin((1 - f) * o2) / s2).addScaledVector(G2, Math.sin(f * o2) / s2)); } bez(G2, gt2, Q0, Rb.t, 120000, 3000); }
    else bez(Dx, Ra.t, Q0, Rb.t, Math.max(4000, gd / 3), 1200);
    linie(Q0, Rb.p, 500); linie(Rb.p, Rb.q, 100);
    const n = pts.length, P = this.P = pts, S = this.Sb = new Float64Array(n); for (let i = 1; i < n; i++) S[i] = S[i - 1] + P[i - 1].angleTo(P[i]) * ERDE;
    this.S0 = S[n - 1]; this.sSchwelle = this.S0 - P[n - 1].angleTo(Rb.p) * ERDE; this.sTd = this.sSchwelle + 380; this.sEnde = this.S0 - 30; this.Rb = Rb; this.zielOrt = vonEinheit(Rb.p.clone().addScaledVector(Rb.t, 700 / ERDE).normalize());
  }
  anP(s, o) { const S = this.Sb, n = S.length; let i = Math.min(this.hint || 0, n - 2); while (i > 0 && S[i] > s) i--; while (i < n - 2 && S[i + 1] < s) i++; this.hint = i; const L = S[i + 1] - S[i] || 1, t = kl((s - S[i]) / L, 0, 1); return o.copy(this.P[i]).lerp(this.P[i + 1], t).normalize(); }
  kursAn(s, vor = 120) { const hint = this.hint, p = this.anP(s, new THREE.Vector3()), q = this.anP(Math.min(this.S0, s + vor), new THREE.Vector3()); this.hint = hint; const g = vonEinheit(p), ca = Math.cos(g.lat * D2R), sa = Math.sin(g.lat * D2R), co = Math.cos(g.lon * D2R), so = Math.sin(g.lon * D2R), t = q.sub(p), ost = -so * t.x + co * t.y, nord = -sa * co * t.x - sa * so * t.y + ca * t.z; return Math.atan2(ost, nord); }
  setzePose(lat, lon, h, kurs, nick, roll) {
    geoZuSzene(lat, lon, h, this.lageW); const e = enu(lat, lon); this.dirW.copy(e.nord).multiplyScalar(Math.cos(kurs)).addScaledVector(e.ost, Math.sin(kurs));
    const vor = _a.copy(this.dirW).multiplyScalar(Math.cos(nick)).addScaledVector(e.oben, Math.sin(nick)).normalize(), li = _b.crossVectors(e.oben, vor).normalize(), up = _c.crossVectors(vor, li).normalize(), lx = _o.copy(li).multiplyScalar(Math.cos(roll)).addScaledVector(up, Math.sin(roll)), uy = _p.copy(up).multiplyScalar(Math.cos(roll)).addScaledVector(li, -Math.sin(roll));
    _m.makeBasis(lx, uy, vor); this.qW.setFromRotationMatrix(_m); this.querW.copy(lx);
  }
  setzeAufBahn(dt) { const g = vonEinheit(this.anP(this.s, new THREE.Vector3())), bo = this.boden(g.lat, g.lon); this.boF = this.boF === null ? bo : this.boF + (bo - this.boF) * (1 - Math.exp(-dt * 3)); this.kurs = this.kursAn(this.s, 400); this.h = this.boF + BODEN_HOCH; this.setzePose(g.lat, g.lon, this.h, this.kurs, this.nick, 0); }
  gatePose(G) { const fh = G.fh, f = G.f; fh.gruppe.updateWorldMatrix(true, false); _p.set(f.x, f.y - 0.2 + BODEN_HOCH, f.z); fh.gruppe.localToWorld(_p); this.W.lokalZuWelt(_p, this.lageW); _q.setFromRotationMatrix(fh.gruppe.matrixWorld); _q2.setFromEuler(_eu.set(0, f.ry, 0, 'YXZ')); this.qW.copy(this.W.zuWelt).multiply(_q).multiply(_q2); this.dirW.copy(_z).applyQuaternion(this.qW); this.querW.copy(_x).applyQuaternion(this.qW); this.gateWelt = true; }
  rollPose(R) { const fh = this.gate.fh, H = fh.ort.H, a = this.rollA, P = fh.rollAn(R, this.rollS + 12, a), Q = fh.rollAn(R, Math.max(0, this.rollS - 12), a), x = (P[0] + Q[0]) / 2, z = (P[1] + Q[1]) / 2, ry = Math.atan2(P[0] - Q[0], P[1] - Q[1]); _p.set(x, H(x, z) + BODEN_HOCH, z); fh.gruppe.updateWorldMatrix(true, false); fh.gruppe.localToWorld(_p); this.W.lokalZuWelt(_p, this.lageW); _q.setFromRotationMatrix(fh.gruppe.matrixWorld); _q2.setFromEuler(_eu.set(0, ry, 0, 'YXZ')); this.qW.copy(this.W.zuWelt).multiply(_q).multiply(_q2); this.dirW.copy(_z).applyQuaternion(this.qW); this.querW.copy(_x).applyQuaternion(this.qW); }
  zuPiste() { this.phase = 'piste'; this.tPh = 0; this.warte = 5; this.v = 0; this.s = 0; this.nick = 0; this.boF = null; this.hint = 0; this.gateWelt = false; if (this.gate) { this.gate.fh.versteckeFest(this.gate.f, false); this.gate = null; } this.setzeAufBahn(0); this.melde?.('Startbahn erreicht, Startfreigabe folgt'); }
  update(dt, W) {
    this.W = W; this.t += dt; this.tPh += dt; if (this.blendeHalt) return;
    if (this.phase === 'gate') { this.v = 0; this.halt = true; if ((this.warte -= dt) <= 0) { this.melde?.('Türen geschlossen, wir rollen zur Startbahn'); const fh = this.gate.fh, rl = fh.rollRoutenL; let bR = null, bS = 0, bd = 1e9; if (rl?.length && !fh.weg) for (const R of rl) { for (let i = 0; i < R.P.length; i += 3) { const d = Math.hypot(R.P[i][0] - this.gate.f.x, R.P[i][1] - this.gate.f.z); if (d < bd && R.len - R.S[i] > 200) { bd = d; bR = R; bS = R.S[i]; } } } this.phase = 'wechsel'; if (bR && bd < 900) this.blende = { tu: () => { this.phase = 'rollen'; this.tPh = 0; this.rollR = bR; this.rollS = bS; this.rollA = { hint: 0 }; this.gate.fh.versteckeFest(this.gate.f, false); this.rollPose(bR); } }; else this.blende = { tu: () => this.zuPiste() }; } return; }
    if (this.phase === 'wechsel') return;
    if (this.phase === 'rollen') { const fh = this.gate?.fh; if (!fh || fh.weg) { this.zuPiste(); return; } this.v = Math.min(9, this.v + dt * 1.1); this.rollS += this.v * dt; this.halt = false; if (this.tPh > 20 || this.rollS > this.rollR.len - 20) { this.phase = 'wechsel'; this.blende = { tu: () => this.zuPiste() }; return; } this.rollPose(this.rollR); return; }
    if (this.phase === 'piste') { this.v = 0; this.halt = true; this.setzeAufBahn(dt); if ((this.warte -= dt) <= 0) { const g = vonEinheit(this.anP(0, new THREE.Vector3())); if (this.tPh > 22 || this.ortBereit?.(g.lat, g.lon)) { this.phase = 'start'; this.tPh = 0; this.melde?.('Startfreigabe erteilt'); } } return; }
    if (this.phase === 'start') { this.v += 2.3 * dt; this.s += this.v * dt; this.halt = false; this.nick += ((this.v > 72 ? 0.17 : 0) - this.nick) * (1 - Math.exp(-dt * 1.3)); this.setzeAufBahn(dt); if (this.v > 82) { this.phase = 'flug'; this.tPh = 0; this.sL = this.s; this.hA = this.h; this.kursF = this.kurs; } return; }
    if (this.phase === 'flug') {
      const r = this.sTd - this.s, sv = this.s - this.sL, hK = this.h - Math.min(this.hA, this.hB);
      const vZiel = r < 12000 ? 70 + kl((r - 1500) / 10500, 0, 1) * 34 : r < 70000 ? 104 + (r - 12000) / 58000 * 46 : hK < 3000 ? 110 + hK * 0.03 : 200 + kl((hK - 3000) / 8000, 0, 1) * 40;
      this.v += (vZiel - this.v) * (1 - Math.exp(-dt * 0.35 * Math.sqrt(Math.max(1, this.raffer))));
      const auf = Math.max(1, sv / (this.v * 12)), ab = Math.max(1, r / (this.v * 11)); this.raffer = this.zeitraffer ? Math.min(this.rMax, auf, ab) : 1;
      this.s += this.v * this.raffer * dt; this.halt = false; const g = vonEinheit(this.anP(this.s, new THREE.Vector3()));
      const hStieg = this.hA + Math.min(this.reiseH, sv * 0.14), rr = Math.max(0, r), hSink = this.hB + rr * Math.tan(3 * D2R), hFlare = rr < 280 ? this.hB + 14.7 * Math.pow(rr / 280, 1.6) : hSink; let hZ = Math.min(hStieg, hFlare, Math.max(this.hA, this.hB) + this.reiseH);
      if (r < 40000 && r > 0) { const bB = this.boden(this.zielOrt.lat, this.zielOrt.lon); this.hB += (bB + BODEN_HOCH - this.hB) * (1 - Math.exp(-dt * 0.8)); }
      if (sv > 1500 && r > 5000 && this.raffer < 40) { const bo = this.boden(g.lat, g.lon); if (Number.isFinite(bo)) hZ = Math.max(hZ, bo + 260); }
      const hAlt = this.h; this.h += (hZ - this.h) * (1 - Math.exp(-dt * (this.raffer > 2 ? 3.5 : 2.2)));
      const k = this.kursAn(this.s, 600 + this.v * this.raffer * 1.5), kA = this.kursF, rate = 1 - Math.exp(-dt * Math.max(0.5, 1.2 * Math.sqrt(this.raffer))); this.kursF = kA + wrap(k - kA) * rate; const om = wrap(this.kursF - kA) / Math.max(dt, 1e-3) / this.raffer, rollZ = kl(Math.atan(this.v * om / 9.81), -0.45, 0.45);
      this.roll += (rollZ - this.roll) * (1 - Math.exp(-dt * 1.2)); const steig = kl((this.h - hAlt) / Math.max(this.v * this.raffer * dt, 0.1), -0.08, 0.2), nZ = steig + (rr < 280 ? 0.09 : r < 12000 ? 0.05 : 0.035); this.nick += (nZ - this.nick) * (1 - Math.exp(-dt * 1.3));
      this.kurs = this.kursF; this.setzePose(g.lat, g.lon, this.h, this.kursF, this.nick, this.roll);
      if (r <= 0 || (r < 300 && this.h - this.boden(g.lat, g.lon) - BODEN_HOCH < 0.3)) { this.phase = 'ausrollen'; this.tPh = 0; this.raffer = 1; this.boF = this.h - BODEN_HOCH; this.melde?.(`Willkommen in ${this.b.n}`); }
      return;
    }
    if (this.phase === 'ausrollen') { this.v = Math.max(0, this.v - (this.v > 30 ? 2.5 : 1.5) * dt); this.s = Math.min(this.sEnde, this.s + this.v * dt); this.nick += (0 - this.nick) * (1 - Math.exp(-dt * 1.6)); this.roll *= Math.exp(-dt * 3); this.setzeAufBahn(dt); this.halt = this.v < 0.2; if (this.v < 14 || this.s >= this.sEnde) { const n = this.gateIn(W, this.lageW); this.phase = 'wechsel'; if (n) this.blende = { tu: () => this.anGate(n) }; else this.blende = { tu: () => { this.phase = 'zumgate'; this.tPh = 0; this.v = 0; }, warte: () => this.phase !== 'zumgate' }; } return; }
    if (this.phase === 'zumgate') { this.v = 0; this.halt = true; const b = this.b, fh = this.ortFn?.()?.szene?.ort?.flughafen, da = this.ortBereit?.(b.lat, b.lon); if (da && fh?.bereit) { const n = this.gateIn(W, null); if (n) { this.anGate(n); return; } } if (this.tPh > 16 || (da && !fh)) { this.phase = 'ziel'; this.fertig = true; this.setzeAufBahn(dt); this.melde?.(`Willkommen in ${b.n}`); } return; }
    if (this.phase === 'ziel') { this.v = 0; this.halt = true; this.fertig = true; if (!this.gateWelt) this.setzeAufBahn(dt); }
  }
  // Nächstes echtes Gate im Ort (kit/flughafen.js), wenn es eins gibt
  gateIn(W, lage) { const fh = this.ortFn?.()?.szene?.ort?.flughafen; if (!fh?.fest?.length || fh.weg) return null; let f = null, bd = lage ? 4000 : 1e9; if (lage) { fh.gruppe.updateWorldMatrix(true, false); W.weltZuLokal(lage, _p); fh.gruppe.worldToLocal(_p); } else _p.set(0, 0, 0); for (const q of fh.fest) { if (q.n === 'klein' || !q.g) continue; const d = Math.hypot(q.x - _p.x, q.z - _p.z); if (d < bd) { bd = d; f = q; } } return f ? { fh, f } : null; }
  anGate(n) { this.gate = n; n.fh.versteckeFest(n.f, true); this.gatePose(n); this.phase = 'ziel'; this.v = 0; this.halt = true; this.fertig = true; this.zielG = n.f; this.melde?.(`Ankunft am Gate, ${this.b.n}`); }
  get ortErlaubt() { return this.phase === 'piste' || this.phase === 'ausrollen' || this.phase === 'ziel' || this.phase === 'zumgate' || (this.phase === 'flug' && this.sTd - this.s < 70000); }
  voraus() { if (this.phase === 'zumgate') return { lat: this.b.lat, lon: this.b.lon }; if (this.phase === 'piste') { const g = vonEinheit(this.anP(0, new THREE.Vector3())); return { lat: g.lat, lon: g.lon }; } if ((this.phase === 'flug' && this.sTd - this.s < 70000) || this.phase === 'ausrollen') return this.zielOrt; return null; }
  get anteil() { return kl(this.s / this.S0, 0, 1); }
  get anschnallen() { return ['wechsel', 'rollen', 'piste', 'start', 'ausrollen', 'zumgate'].includes(this.phase) || (this.phase === 'flug' && (this.h - this.hA < 1500 || this.sTd - this.s < 40000)); }
  info() {
    const b = this.b, zl = `Flug nach ${b.n} (${b.c})`, kmh = Math.round(this.v * 3.6), hk = (this.h / 1000).toFixed(1).replace('.', ',');
    if (this.fertig) return { a: `Angekommen in ${b.n}`, b: 'Aussteigen mit E', halt: true, an: b.n, seite: 1 };
    if (this.phase === 'gate') return { a: zl, b: 'Boarding läuft, bitte anschnallen', halt: true };
    if (this.phase === 'rollen') return { a: zl, b: `Rollen zur Startbahn · ${kmh} km/h`, halt: false };
    if (this.phase === 'piste') return { a: zl, b: `Auf der Startbahn von ${this.a.n}`, halt: true };
    if (this.phase === 'start') return { a: zl, b: `Startlauf · ${kmh} km/h`, halt: false };
    if (this.phase === 'ausrollen') return { a: `Gelandet in ${b.n}`, b: `Ausrollen · ${kmh} km/h`, halt: this.halt };
    if (this.phase === 'wechsel') return { a: zl, b: '', halt: true };
    if (this.phase === 'zumgate') return { a: `Gelandet in ${b.n}`, b: 'Rollen zum Gate', halt: true };
    const rest = Math.max(0, this.sTd - this.s), minuten = Math.round(rest / 235 / 60), zeit = minuten >= 60 ? `${Math.floor(minuten / 60)} h ${minuten % 60} min` : `${minuten} min`; return { a: zl, b: `${hk} km hoch · ${kmh} km/h · noch ${zeit}${this.raffer > 1.2 ? ` · Zeitraffer ${Math.round(this.raffer)}x` : ''}`, halt: false };
  }
  ende() { if (this.gate && !this.gate.fh.weg) this.gate.fh.versteckeFest(this.gate.f, false); }
}

// ---------- Mitfahrt: gemeinsamer Teil von Zug und Flugzeug ----------
export class Mitfahrt {
  constructor({ mobil = false, szene, welt, ton, beiEnde, ortFn }) { this.mobil = mobil; this.szene = null; this.hauptSzene = szene; this.welt = welt; this.ton = ton; this.beiEnde = beiEnde; this.ortFn = ortFn; this.an = false; this.wurzel = new THREE.Group(); this.wurzel.matrixAutoUpdate = false; this.wurzel.name = 'mitfahrt'; this.schiff = { lat: 0, lon: 0, kurs: 0, v: 0 }; this.yaw = 0; this.pitch = 0.05; this.dist = 2.4; this.distZiel = 2.4; this.kamP = new THREE.Vector3(); this.kamZ = new THREE.Vector3(); this.frisch = true; this.gaeste = []; this.haltAlt = true; this.innenCache = {}; this.hudBauen(); this.sicht = 1; this.tuer = 0; this.kn = {}; this.tKarte = 0; }
  innenFuer(art) { return this.innenCache[art] ||= art === 'flug' ? kabineBauen(this.mobil) : wagenBauen(this.mobil); }
  get imOrt() { return this.art === 'zug'; }
  get ortErlaubt() { return this.q?.ortErlaubt !== false; }
  get ortVoraus() { return this.q?.voraus?.() ?? null; }
  betreten({ art, quelle, figurQuelle, bewegungen, quellen, tuerZ = 0, seite = 1 }) {
    this.art = art; this.q = quelle; this.bewegungen = bewegungen; this.quellen = quellen || []; const I = this.I = this.innenFuer(art); for (const k of Object.keys(this.innenCache)) this.innenCache[k].gruppe.visible = k === art; if (!I.gruppe.parent) this.wurzel.add(I.gruppe); this.hauptSzene.add(this.wurzel); this.an = true; this.kol = new ZKollision(I); quelle.melde = t => this.melde(t, 4);
    this.figur = new Figur({ quelle: figurQuelle, bewegungen, kollision: this.kol, start: I.start }); this.wurzel.add(this.figur.obj); this.frisch = true; this.sitzt = null; this.haltAlt = true; this.pitch = 0.04; this.gaesteSetzen(); this.hud(true); this.elZ.style.display = art === 'flug' ? '' : 'none'; this.elS.style.display = ''; this.anzeigeAlt = null; this.bl = null;
    if (art === 'flug') { const s = I.sitze.filter(q => Math.abs(q.x) > 1.5 && q.z < -0.6 && q.z > -4.4 && !q.rollo && !this.gaeste.some(g => g.s === q))[0] || I.sitze[0]; this.setzen(s); this.sicht = 0; this.yaw = s.q > 0 ? -Math.PI / 2 - 0.1 : Math.PI / 2 + 0.1; this.pitch = 0.04; if (!this.aussenM) fliegerLaden().then(M => { if (!this.aussenM) this.aussenBauen(M); }).catch(() => {}); this.melde('Willkommen an Bord', 4); }
    else { this.sicht = 1; const z = TUEREN.reduce((b, t) => Math.abs(t - tuerZ) < Math.abs(b - tuerZ) ? t : b, 0); this.figur.pos.set(seite * (ZI - 0.1), 0, z); this.figur.ry = -seite * Math.PI / 2; this.figur.bildSetzen(); this.yaw = seite * Math.PI / 2; this.tuer = 1; if (quelle.fa && I.mats.streifen?.uniforms?.uFarbe) I.mats.streifen.uniforms.uFarbe.value.setRGB(...quelle.fa); I.zug.tuerSetzen(seite, 1); this.kol.offen = seite; }
    this.ansichtSetzen(); this.schwarz(1, 0, 0.5); quelle.update(0, this.welt); this.lageSetzen();
  }
  aussenBauen(M) { const G = this.aussenM = new THREE.Group(), mats = fliegerMaterial(), T = M.narrow; for (const p of ['lack', 'farbe', 'glas', 'licht', 'teil']) { if (!T[p]) continue; const mat = p === 'farbe' ? mats.farbe.clone() : mats[p]; if (p === 'farbe') mat.color.setRGB(0.08, 0.18, 0.5); const me = new THREE.Mesh(T[p], mat); me.frustumCulled = false; me.castShadow = true; G.add(me); } G.position.y = -BODEN_HOCH; G.visible = false; this.wurzel.add(G); }
  gaesteSetzen() { for (const p of this.gaeste) p.f.obj.parent?.remove(p.f.obj); this.gaeste.length = 0; if (!this.quellen.length) return; const I = this.I, n = this.mobil ? 5 : this.art === 'flug' ? 28 : 10; for (let i = 0; i < n; i++) { const s = I.sitze[Math.floor(Math.random() * I.sitze.length)]; if (this.gaeste.some(g => Math.abs(g.s.x - s.x) + Math.abs(g.s.z - s.z) < 0.4)) continue; const q = this.quellen[Math.floor(Math.random() * this.quellen.length)], f = spawn(q, this.bewegungen); f.obj.traverse(o => { if (o.isMesh) o.frustumCulled = false; }); f.obj.position.set(s.x, 0, s.z); f.obj.rotation.y = s.quer ? (s.q > 0 ? -Math.PI / 2 : Math.PI / 2) : 0; aktionBereit(f, 'sitzen'); f.play(f.acts.sitzen ? 'sitzen' : 'stehen', 0); f.mixer.update(Math.random() * 2); this.wurzel.add(f.obj); this.gaeste.push({ f, s }); } }
  setzen(s) { const F = this.figur; aktionBereit(F.f, 'sitzen'); this.sitzt = { x0: F.pos.x, z0: F.pos.z, s }; F.pos.set(s.x, 0, s.z); F.ry = s.quer ? (s.q > 0 ? -Math.PI / 2 : Math.PI / 2) : 0; F.bildSetzen(); F.obj.rotation.y = F.ry; F.f.play(F.f.acts.sitzen ? 'sitzen' : 'stehen', 0.2); F.clip = 'sitzen'; }
  verlassen() { if (!this.an) return; this.an = false; this.q?.ende?.(); this.figur?.entfernen(); this.figur = null; for (const p of this.gaeste) p.f.obj.parent?.remove(p.f.obj); this.gaeste.length = 0; this.hauptSzene.remove(this.wurzel); this.hud(false); this.ton?.zug?.(9999, 0, 0.016); this.q = null; this.bl = null; this.fade = null; this.schwarzSetzen(0); if (this.aussenM) this.aussenM.visible = false; }
  figurWelt(out) { return out.copy(this.figur ? this.figur.bildPos : _a.set(0, 0, 0)).applyMatrix4(this.wurzel.matrixWorld); }
  lageSetzen() { const W = this.welt, Q = this.q; W.weltZuLokal(Q.lageAnz, _b); _q.copy(W.zuLokal).multiply(Q.qAnz); this.wurzel.matrix.compose(_b, _q, _s1); this.wurzel.matrixWorldNeedsUpdate = true; this.wurzel.updateMatrixWorld(true); }
  tick(dt, { achse, rennen, b, e, kamera, zeit }) {
    const F = this.figur, Q = this.q; if (!F || !this.an) return; if (this.meldT > 0 && (this.meldT -= dt) <= 0) { this.elH.style.opacity = 0; this.hinw = null; }
    if (this.kn.sicht) { kamera = true; this.kn.sicht = false; } if (this.kn.zeit) { zeit = true; this.kn.zeit = false; }
    if (b.x || b.y) { this.yaw -= b.x * 0.0045; this.pitch = kl(this.pitch + b.y * 0.0045, -0.8, 1.1); } if (b.rad) this.distZiel = kl(this.distZiel * (1 + b.rad * 0.0012), 1.2, 4); if (kamera) { const n = this.art === 'flug' && this.aussenM ? 3 : 2; this.sicht = (this.sicht + 1) % n; this.frisch = true; this.ansichtSetzen(); }
    if (zeit && this.art === 'flug') { Q.zeitraffer = !Q.zeitraffer; this.melde(Q.zeitraffer ? 'Zeitraffer an' : 'Echtzeit: der Flug dauert so lange wie in echt', 3); }
    if (Q.blende && !this.bl) { this.bl = { t: 0, f: Q.blende.tu, warte: Q.blende.warte }; Q.blende = null; Q.blendeHalt = true; } if (this.bl) { const B = this.bl; B.t += dt; if (B.t < 0.55) this.schwarzSetzen(B.t / 0.55); else if (B.f) { const f = B.f; B.f = null; f(); Q.blendeHalt = false; this.schwarzSetzen(1); } else if (B.warte && !B.warte()) { B.t = 0.56; this.schwarzSetzen(1); } else if (B.t < 1.3) this.schwarzSetzen(kl(1 - (B.t - 0.75) / 0.55, 0, 1)); else { this.schwarzSetzen(0); this.bl = null; } }
    if (this.fade) { const f = this.fade; f.t += dt; this.schwarzSetzen(kl(f.a + (f.b - f.a) * f.t / f.d, 0, 1)); if (f.t >= f.d) this.fade = null; }
    Q.update(dt, this.welt); const g = szeneZuGeo(Q.lageAnz); this.schiff.lat = g.lat; this.schiff.lon = g.lon; this.schiff.v = Q.v; { const en = enu(g.lat, g.lon); this.schiff.kurs = Math.atan2(Q.dirW.dot(en.ost), Q.dirW.dot(en.nord)); }
    const inf = Q.info();
    if (this.sitzt) { if (Math.hypot(achse.x, achse.y) > 0.25 && !(this.art === 'flug' && Q.anschnallen)) { const s = this.sitzt; this.sitzt = null; F.pos.x = this.art === 'flug' ? 0 : s.x0; F.pos.z = this.art === 'flug' ? s.s.z - 0.2 + 0.36 : s.z0; F.boden = 0; F.pos.y = 0; F.bildSetzen(); F.clip = null; } else F.f.mixer.update(dt); } else F.update(dt, achse, this.yaw + Math.PI, rennen, false);
    for (const p of this.gaeste) if (Math.abs(p.s.z - F.pos.z) < 7) p.f.mixer.update(dt);
    if (inf.a !== this.tA) { this.tA = inf.a; this.elA.textContent = inf.a; } if ((this.tB = (this.tB || 0) - dt) < 0) { this.tB = 0.3; this.elB.textContent = inf.b; }
    // Türen im Zug, Durchsage am Halt, durch die offene Tür nach draußen
    if (this.I.zug) {
      const offen = !!inf.offen; this.tuer = kl((this.tuer || 0) + (offen ? 1 : -1) * dt / 1.3, 0, 1); this.kol.offen = this.tuer > 0.8 ? inf.seite : 0; this.I.zug.tuerSetzen(inf.seite < 0 ? -1 : 1, THREE.MathUtils.smoothstep(this.tuer, 0, 1));
      if (Q.halt !== this.haltAlt) { this.haltAlt = Q.halt; const T = this.ton; if (Q.halt && inf.an && T?.ton && T.an) { T.ton(660, 660, 0.05, 0.5, 'sine'); T.ton(528, 528, 0.05, 0.7, 'sine', 0.42); } if (Q.halt && inf.an) this.melde(inf.an, 4); }
      if (Math.abs(F.pos.x) > ZB + 0.12 && this.kol.offen) { this.aussteigen(); return; }
    } else if ((this.tKarte -= dt) <= 0 && this.I.anzeige) { this.tKarte = 1; const rest = Math.max(0, Q.sTd - Q.s), m = Math.round(rest / 235 / 60); this.I.anzeige({ anteil: Q.anteil, von: Q.a.c, nach: Q.b.c, z1: `${(Q.h / 1000).toFixed(1).replace('.', ',')} km · ${Math.round(Q.v * 3.6)} km/h`, z2: `Noch ${m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`} bis ${Q.b.n}` }); }
    // Fahrgeräusch
    if (this.ton?.zug) { if (this.art === 'flug') this.ton.zug(30, kl(Q.phase === 'gate' || Q.phase === 'ziel' ? 2 : 9 + Q.v / 18, 0, 22), dt); else this.ton.zug(45, Q.v, dt); }
    // Was kann man tun?
    let nah = null; const px = F.pos.x, pz = F.pos.z;
    if (inf.an && (Q.halt || Q.fertig)) nah = { t: this.mobil ? 'Ein Aus: aussteigen' : 'E: aussteigen', tu: () => this.aussteigen() };
    else if (this.sitzt) nah = this.art === 'flug' && Q.anschnallen ? { t: 'Bitte angeschnallt bleiben', tu: () => {} } : { t: this.mobil ? 'Stick: aufstehen' : 'W: aufstehen', tu: () => {} };
    else { let bs = null, bd = 1.5; for (const s of this.I.sitze) { const d = Math.hypot(s.x - px, s.z - pz); if (d < bd && !this.gaeste.some(g2 => g2.s === s)) { bd = d; bs = s; } } if (bs) nah = { t: this.mobil ? 'Ein Aus: hinsetzen' : 'E: hinsetzen', tu: () => this.setzen(bs) }; }
    this.nah = nah; const t = nah?.t || ''; if (!(this.meldT > 0) && this.hinw !== t) { this.hinw = t; this.elH.textContent = t; this.elH.style.opacity = t ? 1 : 0; } if (e && nah) nah.tu();
  }
  ansichtSetzen() { const au = this.sicht === 2; this.I.gruppe.visible = !au; if (this.aussenM) this.aussenM.visible = au; if (this.figur) this.figur.obj.visible = !au; for (const p of this.gaeste) p.f.obj.visible = !au; }
  aussteigen() { const Q = this.q, F = this.figur, g = szeneZuGeo(Q.lageAnz), inf = Q.info(); this.beiEnde?.({ lat: g.lat, lon: g.lon, art: this.art, seite: inf.seite || 1, lageW: Q.lageAnz.clone(), querW: Q.querW.clone(), dirW: Q.dirW.clone(), zLok: F?.pos.z || 0, zielG: Q.zielG || null }); }
  kameraSetzen(camera, dt) {
    const F = this.figur; if (!F || !this.an || !this.q) return; const I = this.I; this.lageSetzen(); const M = this.wurzel.matrixWorld;
    if (this.sicht === 2) { const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); _o.set(Math.sin(this.yaw) * cp, Math.max(0.03, sp + 0.12), Math.cos(this.yaw) * cp); this.kamP.copy(_o).multiplyScalar(58 * (this.distZiel / 2.4)); this.kamP.y -= 1.5; camera.position.copy(this.kamP).applyMatrix4(M); _b.set(0, -0.5, 0).applyMatrix4(M); camera.up.copy(this.q.lageAnz).normalize().applyQuaternion(this.welt.zuLokal); camera.lookAt(_b); camera.updateMatrixWorld(); return; }
    if (this.sicht === 1 && this.sitzt && this.art === 'flug') { const s = this.sitzt.s, sw = Math.sin(this.yaw * 0.5) * 0.25; this.kamP.set(s.q * -0.08, 1.64, s.z - 1.75 + 0); I.geteilt.uKam.value.copy(this.kamP); camera.position.copy(this.kamP).applyMatrix4(M); _b.set(s.x - s.q * 0.12 + sw, 0.95 + this.pitch * 0.5, s.z + 0.35).applyMatrix4(M); camera.up.set(M.elements[4], M.elements[5], M.elements[6]).normalize(); camera.lookAt(_b); camera.updateMatrixWorld(); if (!F.obj.visible) F.obj.visible = true; return; }
    const ich = this.sicht === 0, imFlugSitz = ich && this.sitzt && this.art === 'flug', pz = F.bildPos, zx = pz.x + (imFlugSitz ? this.sitzt.s.q * 0.13 : Math.cos(this.yaw) * (ich ? 0 : 0.26)), zy = pz.y + (ich ? (this.sitzt ? 1.2 : 1.6) : (this.sitzt ? 1.0 : 1.42)), zz = imFlugSitz ? this.sitzt.s.fz : pz.z - Math.sin(this.yaw) * (ich ? 0 : 0.26), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); _o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.dist += (this.distZiel - this.dist) * (1 - Math.exp(-8 * dt)); let d = ich ? 0.02 : this.dist; if (!ich && !this.sitzt) { const t = this.kol.sicht(zx, zz, zx + _o.x * d, zz + _o.z * d); if (t < 1) d = Math.max(0.05, d * t - 0.2); } else if (!ich) d = Math.min(d, 1.1);
    let cy = zy + _o.y * d; if (cy > I.decke) cy = I.decke; if (cy < pz.y + 0.25) cy = pz.y + 0.25; const cx = zx + _o.x * d, cz = zz + _o.z * d; if (this.frisch) { this.kamP.set(cx, cy, cz); this.frisch = false; } else this.kamP.lerp(_a.set(cx, cy, cz), 1 - Math.exp(-dt * 20)); this.kamZ.set(zx, zy, zz);
    const nahF = this.kamP.distanceTo(this.kamZ) < 0.55; if (F.obj.visible === nahF) F.obj.visible = !nahF;
    I.geteilt.uKam.value.copy(this.kamP); camera.position.copy(this.kamP).applyMatrix4(M); _b.copy(this.kamZ); if (ich || nahF) _b.copy(this.kamP).addScaledVector(_o, -1); _b.applyMatrix4(M); camera.up.set(M.elements[4], M.elements[5], M.elements[6]).normalize(); camera.lookAt(_b); camera.updateMatrixWorld();
  }
  hudBauen() {
    if (this.el || typeof document === 'undefined') return; const el = this.el = document.createElement('div'); el.style.cssText = 'position:fixed;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);z-index:40;display:none;text-align:center;color:#fff;font:600 15px/1.3 system-ui,sans-serif;text-shadow:0 1px 5px #000c;pointer-events:none;width:min(92vw,620px)';
    el.innerHTML = '<div style="font-size:19px;font-weight:700"></div><div style="font-weight:500;font-size:13px;opacity:.92;margin-top:2px"></div><div style="margin-top:9px;font-size:14px;background:#0009;display:inline-block;padding:5px 11px;border-radius:9px;opacity:0;transition:opacity .2s"></div><div style="margin-top:9px;display:flex;gap:6px;justify-content:center"><button type="button" style="all:unset;pointer-events:auto;cursor:pointer;font-size:13px;background:#0008;padding:6px 12px;border-radius:999px">Sicht wechseln (C)</button><button type="button" style="all:unset;pointer-events:auto;cursor:pointer;font-size:13px;background:#0008;padding:6px 12px;border-radius:999px">Zeitraffer (T)</button></div>'; document.body.appendChild(el); this.elA = el.children[0]; this.elB = el.children[1]; this.elH = el.children[2]; this.elS = el.children[3].children[0]; this.elZ = el.children[3].children[1]; this.elS.onclick = () => { this.kn.sicht = true; }; this.elZ.onclick = () => { this.kn.zeit = true; };
    const b2 = this.elB2 = document.createElement('div'); b2.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:39'; document.body.appendChild(b2);
  }
  hud(an) { if (this.el) this.el.style.display = an ? 'block' : 'none'; }
  schwarzSetzen(o) { if (this.elB2) this.elB2.style.opacity = o; }
  schwarz(a, b, d) { this.fade = { a, b, d, t: 0 }; this.schwarzSetzen(a); }
  melde(t, s = 3) { if (!this.elH) return; this.meldT = s; this.elH.textContent = t; this.elH.style.opacity = t ? 1 : 0; this.hinw = null; }
}
