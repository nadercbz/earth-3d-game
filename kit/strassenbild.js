// Straßenbild (05.11.2026, Nader: "mehr Modelle", "viel lebendiger"): Dinge, die eine Straße bewohnt wirken lassen, entlang der Bordsteine verteilt, an festen Stellen der Erde (gleich in jedem Ort,
// der die Stelle enthält): Hydranten, Stromkästen, Verkehrsschilder, Pflanzkübel, Fahrräder, E Roller, Mülltonnen, Litfaßsäulen, Café Tische vor Läden, Gullydeckel auf der Fahrbahn. Alle als Instanzen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { orient, edgeNormal, inside } from './geo.js';

const hash = (a, b) => { let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const C = new THREE.Color();
// Geometrie mit Farbe je Ecke (ein Material, ein Aufruf je Art)
function f(geo, hex) { const g = geo.index ? geo.toNonIndexed() : geo; C.set(hex); const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g; }
const box = (w, h, d, x, y, z, hex) => f(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const zyl = (r0, r1, h, x, y, z, hex, n = 8) => f(new THREE.CylinderGeometry(r1, r0, h, n).translate(x, y, z), hex);
const ring = (r, t, x, y, z, ry, hex) => { const g = new THREE.TorusGeometry(r, t, 4, 12); g.rotateY(ry); g.translate(x, y, z); return f(g, hex); };
const alle = (...t) => mergeGeometries(t.flat(), false);

function hydrant(rot) { const a = rot ? '#b02a24' : '#c9a227', d = rot ? '#8a2019' : '#a8841c'; return alle(zyl(0.09, 0.08, 0.55, 0, 0.28, 0, a), zyl(0.11, 0.11, 0.05, 0, 0.03, 0, d), zyl(0.1, 0.03, 0.1, 0, 0.6, 0, d), zyl(0.04, 0.04, 0.26, 0, 0.36, 0, d).rotateX(Math.PI / 2)); }
const stromkasten = () => alle(box(0.72, 1.22, 0.34, 0, 0.61, 0, '#8e908c'), box(0.3, 1.06, 0.01, -0.17, 0.62, 0.175, '#7c7e7a'), box(0.3, 1.06, 0.01, 0.17, 0.62, 0.175, '#7c7e7a'), box(0.78, 0.04, 0.4, 0, 1.24, 0, '#6a6c69'));
function schildGeo(art) {
  const stange = zyl(0.03, 0.03, 2.6, 0, 1.3, 0, '#8a8c8e', 6), s = [];
  if (art === 0) { s.push(f(new THREE.CircleGeometry(0.31, 16).translate(0, 2.35, 0.045), '#c02a24'), f(new THREE.CircleGeometry(0.24, 16).translate(0, 2.35, 0.05), '#f0efe9'), box(0.2, 0.03, 0.01, 0, 2.36, 0.055, '#16171a'), box(0.03, 0.14, 0.01, -0.05, 2.35, 0.055, '#16171a')); }   // Tempolimit
  else if (art === 1) { s.push(box(0.58, 0.58, 0.02, 0, 2.35, 0.04, '#2a56a0'), f(new THREE.PlaneGeometry(0.2, 0.34).translate(0, 2.35, 0.055), '#f0efe9')); }   // Parken
  else if (art === 2) { const t = new THREE.Shape(); t.moveTo(-0.3, 0); t.lineTo(0.3, 0); t.lineTo(0, 0.52); t.closePath(); s.push(f(new THREE.ShapeGeometry(t).rotateZ(Math.PI).translate(0, 2.6, 0.05), '#c02a24')); const t2 = new THREE.Shape(); t2.moveTo(-0.2, 0); t2.lineTo(0.2, 0); t2.lineTo(0, 0.35); t2.closePath(); s.push(f(new THREE.ShapeGeometry(t2).rotateZ(Math.PI).translate(0, 2.54, 0.055), '#f0efe9')); }   // Vorfahrt beachten
  else { s.push(f(new THREE.CircleGeometry(0.3, 16).translate(0, 2.35, 0.045), '#2a56a0'), box(0.42, 0.07, 0.01, 0, 2.35, 0.05, '#c02a24')); }   // Halteverbot
  return alle(stange, s, box(0.6, 0.6, 0.015, 0, 2.35, -0.0, '#9a9c9e'));
}
function kuebel() { const b = new THREE.IcosahedronGeometry(0.42, 1); b.scale(1, 0.85, 1); b.translate(0, 0.86, 0); return alle(box(0.72, 0.5, 0.72, 0, 0.25, 0, '#8d8a84'), f(b, '#4f7036'), box(0.6, 0.04, 0.6, 0, 0.5, 0, '#3f2f22')); }
function fahrrad(hex) { const r = 0.31, d = 1.02; const st = (ax, ay, bx, by, t = 0.016) => { const L = Math.hypot(bx - ax, by - ay), g = new THREE.CylinderGeometry(t, t, L, 5); g.rotateZ(Math.atan2(ax - bx, by - ay)); g.translate((ax + bx) / 2, (ay + by) / 2, 0); return f(g, hex); };
  return alle(ring(r, 0.016, -d / 2, r, 0, 0, '#17181a'), ring(r, 0.016, d / 2, r, 0, 0, '#17181a'), st(-d / 2, r, -0.08, r, 0.014), st(-0.08, r, -0.2, 0.86), st(-0.08, r, 0.32, 0.8), st(-0.2, 0.8, 0.32, 0.8), st(-d / 2, r, -0.2, 0.8, 0.012), st(d / 2, r, 0.32, 0.92), box(0.2, 0.04, 0.09, -0.22, 0.89, 0, '#1a1a1c'), box(0.03, 0.03, 0.44, 0.32, 0.95, 0, '#1a1a1c')); }
function roller(hex) { return alle(box(0.72, 0.06, 0.15, 0, 0.13, 0, hex), zyl(0.09, 0.09, 0.05, -0.38, 0.09, 0, '#17181a', 10).rotateX(Math.PI / 2), zyl(0.09, 0.09, 0.05, 0.38, 0.09, 0, '#17181a', 10).rotateX(Math.PI / 2), zyl(0.018, 0.018, 1.0, 0.36, 0.62, 0, hex, 6), box(0.03, 0.03, 0.44, 0.36, 1.12, 0, '#1a1a1c')); }
function tonne(hex) { return alle(box(0.56, 0.86, 0.6, 0, 0.51, 0, hex), box(0.6, 0.05, 0.68, 0, 0.97, 0, hex), zyl(0.08, 0.08, 0.05, -0.2, 0.08, -0.27, '#17181a', 8).rotateX(Math.PI / 2), zyl(0.08, 0.08, 0.05, 0.2, 0.08, -0.27, '#17181a', 8).rotateX(Math.PI / 2)); }
function litfass() { const p = []; p.push(zyl(0.62, 0.62, 2.7, 0, 1.35, 0, '#c8c2b4', 14), zyl(0.66, 0.68, 0.14, 0, 0.07, 0, '#5d5e5c', 14), zyl(0.68, 0.72, 0.16, 0, 2.77, 0, '#3f4a46', 14), zyl(0.72, 0.1, 0.42, 0, 3.04, 0, '#3f4a46', 14));
  const farben = ['#c02a24', '#2a56a0', '#d9a92c', '#1f4a3a', '#efe9dc', '#7a1f24', '#101214', '#e8604c']; farben.forEach((hx, i) => { const a = i / farben.length * 6.283, b = new THREE.BoxGeometry(0.42, 0.95 + (i % 3) * 0.25, 0.02); b.translate(0, 0, 0.625); b.rotateY(a); b.translate(0, 0.72 + (i % 2) * 1.1, 0); p.push(f(b, hx)); }); return alle(p); }
function cafeSet() { const stuhl = (x, z, ry) => { const g = alle(box(0.38, 0.04, 0.38, 0, 0.45, 0, '#6a4a30'), box(0.38, 0.4, 0.03, 0, 0.68, -0.18, '#6a4a30'), box(0.03, 0.45, 0.03, -0.16, 0.22, -0.16, '#2a2c2e'), box(0.03, 0.45, 0.03, 0.16, 0.22, -0.16, '#2a2c2e'), box(0.03, 0.45, 0.03, -0.16, 0.22, 0.16, '#2a2c2e'), box(0.03, 0.45, 0.03, 0.16, 0.22, 0.16, '#2a2c2e')); g.rotateY(ry); g.translate(x, 0, z); return g; };
  const schirm = new THREE.ConeGeometry(1.5, 0.5, 8); schirm.translate(0, 2.45, 0);
  return alle(zyl(0.32, 0.32, 0.03, 0, 0.74, 0, '#e8e4da', 12), zyl(0.03, 0.03, 2.3, 0, 1.15, 0, '#3a3c3e', 6), zyl(0.24, 0.24, 0.03, 0, 0.02, 0, '#2a2c2e', 10), stuhl(-0.62, 0, Math.PI / 2), stuhl(0.62, 0, -Math.PI / 2), f(schirm, '#c8c2b0')); }

export function strassenbild(ort, viele) {
  const D = ort.daten, m = D.meta || {}, phi = (m.lat || 0) * Math.PI / 180, ox = (m.lon || 0) * (111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)), oz = -(m.lat || 0) * (111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi));
  const reg = m.region || 'mitte', rotHydrant = /usa|latam|nordsee|japan|korea|china/.test(reg), pro = { hydrant: [], kasten: [], s0: [], s1: [], s2: [], s3: [], kuebel: [], rad0: [], rad1: [], roller: [], t0: [], t1: [], t2: [], litfass: [] };
  const budget = ort.mobil ? 0.4 : 1;
  for (const P of D.bloecke || []) {
    const r = orient(P[0]);
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 9) continue;
      const n = edgeNormal(a, b), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ry = Math.atan2(n[0], n[1]);
      for (let s = 5; s < L - 4; s += 9.5) {
        const x = a[0] + ux * s - n[0] * 0.8, z = a[1] + uz * s - n[1] * 0.8, h = hash(Math.round((x + ox) / 3), Math.round((z + oz) / 3)), h2 = hash(Math.round((x + ox) / 3) + 7, Math.round((z + oz) / 3) - 3);
        if (h2 > budget) continue;
        const pt = [x, z, ry];
        if (h < 0.06) pro.hydrant.push(pt); else if (h < 0.13) pro.kasten.push(pt);
        else if (h < 0.19) pro.s0.push(pt); else if (h < 0.25) pro.s1.push(pt); else if (h < 0.28) pro.s2.push(pt); else if (h < 0.32) pro.s3.push(pt);
        else if (h < 0.42) pro.kuebel.push([a[0] + ux * s - n[0] * 1.1, a[1] + uz * s - n[1] * 1.1, ry]);
        else if (h < 0.5) pro.rad0.push([x, z, ry + Math.PI / 2 + (h2 - 0.5) * 0.3]); else if (h < 0.56) pro.rad1.push([x, z, ry + Math.PI / 2 + (h2 - 0.5) * 0.3]);
        else if (h < 0.62) pro.roller.push([x, z, ry + Math.PI / 2 + (h2 - 0.5) * 0.8]);
        else if (h < 0.68) pro.t0.push(pt); else if (h < 0.72) pro.t1.push(pt); else if (h < 0.75) pro.t2.push(pt);
        // Litfaßsäulen kommen seit 06.11.2026 aus dem Werbesystem (kit/werbung.js), jede mit eigenem Code
      }
    }
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 }), schatten = !ort.mobil;
  const setze = (geo, pkt, rad, sch = schatten) => { if (pkt.length) viele(geo, mat, pkt, sch, rad); };
  setze(hydrant(rotHydrant), pro.hydrant, 80); setze(stromkasten(), pro.kasten, 110); setze(schildGeo(0), pro.s0, 140, false); setze(schildGeo(1), pro.s1, 140, false); setze(schildGeo(2), pro.s2, 140, false); setze(schildGeo(3), pro.s3, 140, false);
  setze(kuebel(), pro.kuebel, 130); setze(fahrrad('#2a56a0'), pro.rad0, 75, false); setze(fahrrad('#8a2c24'), pro.rad1, 75, false); setze(roller('#2f7d4f'), pro.roller, 70, false);
  setze(tonne('#2b3d33'), pro.t0, 80); setze(tonne('#2f3134'), pro.t1, 80); setze(tonne('#2a4a7a'), pro.t2, 80); setze(litfass(), pro.litfass, 220);
  // Café Tische vor Läden, wo der Gehweg breit genug ist
  const boxen = (D.bloecke || []).map(P => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const q of P[0]) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); } return { a, b, c, d, P }; });
  const imBlock = (x, z) => boxen.some(o => x > o.a && x < o.b && z > o.c && z < o.d && inside(o.P[0], x, z) && !o.P.slice(1).some(l => inside(l, x, z)));
  const cafe = []; const maxC = ort.mobil ? 20 : 70;
  for (const g of D.gebaeude || []) {
    if (!g.laden || g.rand || cafe.length >= maxC) continue;
    const r = orient(g.p);
    for (let i = 0; i < r.length && cafe.length < maxC; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 7) continue;
      const n = edgeNormal(a, b), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, h = hash(Math.round(mx + ox), Math.round(mz + oz)); if (h > 0.34) continue;
      if (!imBlock(mx + n[0] * 2.1, mz + n[1] * 2.1) || !imBlock(mx + n[0] * 3.4, mz + n[1] * 3.4)) continue;
      const nT = Math.min(3, Math.floor(L / 3.2)), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let k = 0; k < nT; k++) { const s = (k - (nT - 1) / 2) * 3; cafe.push([mx + ux * s + n[0] * 2.0, mz + uz * s + n[1] * 2.0, Math.atan2(ux, uz)]); }
    }
  }
  setze(cafeSet(), cafe, 90);
  // Gullydeckel und Flicken auf der Fahrbahn, in Fahrtrichtung verteilt
  const deckel = [], flicken = [];
  for (const l of D.linien || []) { let rest = 18; for (let i = 0; i < l.p.length - 1; i++) { const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue; const ux = (bx - ax) / L, uz = (bz - az) / L; while (rest < L) { const x = ax + ux * rest, z = az + uz * rest, h = hash(Math.round((x + ox) / 2), Math.round((z + oz) / 2)), seite = h < 0.5 ? 1 : -1; if (h < 0.5 || h > 0.8) deckel.push([x - uz * seite * 1.3, z + ux * seite * 1.3, h * 6.28]); else flicken.push([x - uz * seite * 1.4, z + ux * seite * 1.4, Math.atan2(ux, uz)]); rest += 28 + h * 30; } rest -= L; } }
  const dm = new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.55, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const dg = new THREE.CircleGeometry(0.36, 14); dg.rotateX(-Math.PI / 2); dg.translate(0, 0.016, 0);
  if (deckel.length) viele(dg, dm, deckel, false, 130, 0);
  // Flicken (Nr. 90): unregelmäßiger Umriss mit weichem Rand statt eines harten dunklen Rechtecks (Nader: "quadratische Markierungen")
  const fm = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.92, transparent: true, opacity: 0.22, alphaMap: flickBild(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const fg = new THREE.PlaneGeometry(1.6, 3.2); fg.rotateX(-Math.PI / 2); fg.translate(0, 0.014, 0);
  if (flicken.length) viele(fg, fm, flicken, false, 200, 0);
}
// Alphabild eines Flickens: Vieleck mit gezackten Kanten und weichem Rand, einmal gezeichnet (ohne Browser leer)
function flickBild() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; g.filter = 'blur(6px)'; g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, rr = 0.78 + r() * 0.2; const x = 64 + Math.cos(a) * 52 * rr, y = 128 + Math.sin(a) * 112 * rr; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath(); g.fill(); const t = new THREE.CanvasTexture(c); return t;
}
