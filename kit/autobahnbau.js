// Ausstattung der Autobahn (Wunsch Nr. 111, 26.11.2026, Nader: "Alle Autobahnen richtig bauen. Realistisch wie Autobahnen aussehen").
// Daten aus kit/ortbau.js (daten.autobahn): planken (Linien 0,8 m neben dem Fahrbahnrand), pfosten (Leitpfosten rechts, alle 50 m),
// schilder (Schilderbrücken über einer Richtungsfahrbahn). Alles wird je Ort zu wenigen Netzen verschmolzen (ein Aufruf je Material).
// Maße: Schutzplanke Oberkante 0,75 m, Pfosten alle 4 m; Leitpfosten 1 m hoch, 12 cm breit, schwarzes Band mit Rückstrahler;
// Schilderbrücke lichte Höhe 5,4 m, Tafel 2,4 m hoch in Autobahnblau mit weißem Rand, Pfeile über den Spuren.
import * as THREE from 'three';

const STAHL = new THREE.MeshStandardMaterial({ color: 0x9aa0a3, metalness: 0.72, roughness: 0.44, side: THREE.DoubleSide });
const PFOSTEN = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
const MAST = new THREE.MeshStandardMaterial({ color: 0x7d8387, metalness: 0.6, roughness: 0.5 });
const TAFELN = new Map();   // Tafeltexturen, höchstens 24 (älteste fliegt raus)

// Ziele auf den Tafeln in Berlin: Fernziel nach Himmelsrichtung, davor der Bezirk, der in Fahrtrichtung liegt
const FERN = ['Hamburg', 'Stettin', 'Frankfurt (Oder)', 'Dresden', 'Leipzig', 'Magdeburg', 'Hannover', 'Rostock'];   // ab Nord im Uhrzeigersinn, je 45 Grad
const BEZIRKE = [['Wedding', 52.550, 13.355], ['Charlottenburg', 52.516, 13.300], ['Wilmersdorf', 52.487, 13.318], ['Schöneberg', 52.482, 13.355], ['Tempelhof', 52.466, 13.386],
  ['Neukölln', 52.478, 13.438], ['Treptow', 52.490, 13.472], ['Steglitz', 52.456, 13.322], ['Zehlendorf', 52.433, 13.258], ['Spandau', 52.535, 13.200], ['Tegel', 52.588, 13.283],
  ['Pankow', 52.569, 13.402], ['Adlershof', 52.435, 13.540], ['Schönefeld', 52.385, 13.520], ['Köpenick', 52.445, 13.575], ['Reinickendorf', 52.575, 13.333], ['Marzahn', 52.545, 13.560]];

function ziele(lat, lon, dx, dz) {   // dx nach Osten, dz nach Süden
  const kurs = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, fern = FERN[Math.round(kurs / 45) % 8];
  let best = null; for (const [name, bl, bo] of BEZIRKE) { const ox = (bo - lon) * 67.6, on = (bl - lat) * 111.2, d = Math.hypot(ox, on); if (d < 1.8 || d > 14) continue; const w = (ox * dx - on * dz) / d; if (w > 0.75 && (!best || d < best.d)) best = { name, d }; }
  return best ? [fern, best.name] : [fern];
}

function tafelTextur(zeilen, spuren, farbe) {
  const key = zeilen.join('|') + ':' + spuren + ':' + farbe; let t = TAFELN.get(key); if (t) { TAFELN.delete(key); TAFELN.set(key, t); return t; }
  const c = document.createElement('canvas'); c.width = 768; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 768, 256); g.fillStyle = farbe; const r = 22, x0 = 10, y0 = 10, w = 748, h = 236;
  g.beginPath(); g.moveTo(x0 + r, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, r); g.arcTo(x0 + w, y0 + h, x0, y0 + h, r); g.arcTo(x0, y0 + h, x0, y0, r); g.arcTo(x0, y0, x0 + w, y0, r); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  zeilen.forEach((z, i) => { g.font = `600 ${i ? 58 : 66}px "Helvetica Neue", Arial, sans-serif`; g.fillText(z, 384, zeilen.length > 1 ? 56 + i * 66 : 84, 700); });
  for (let i = 0; i < spuren; i++) {   // Pfeil nach unten über jeder Spur
    const x = 384 + (i - (spuren - 1) / 2) * (640 / Math.max(spuren, 2)), y = zeilen.length ? 196 : 128, s = zeilen.length ? 1 : 1.9;
    g.beginPath(); g.moveTo(x - 9 * s, y - 34 * s); g.lineTo(x + 9 * s, y - 34 * s); g.lineTo(x + 9 * s, y + 4 * s); g.lineTo(x + 26 * s, y + 4 * s); g.lineTo(x, y + 36 * s); g.lineTo(x - 26 * s, y + 4 * s); g.lineTo(x - 9 * s, y + 4 * s); g.closePath(); g.fill();
  }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TAFELN.set(key, t);
  if (TAFELN.size > 24) { const [alt, at] = TAFELN.entries().next().value; at.dispose(); TAFELN.delete(alt); }
  return t;
}

// A: daten.autobahn, H: Geländehöhe (x, z), opt: { mobil, berlin, gruen (Tafeln grün statt blau), lat, lon, kLat, kLon, sockel (Höhe der Blockfläche über der Fahrbahn) }
export function autobahnBauen(A, H, { mobil = false, berlin = false, gruen = false, lat = 0, lon = 0, sockel = 0.1 } = {}) {
  const gruppe = new THREE.Group(), rails = [], pos = [], schritt = 4;
  const viereck = (a, b, c, d) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]); };
  // Schutzplanke: Doppelwelle (zwei Wulste) auf beiden Seiten der Pfosten, am Handy eine Welle in der Mitte
  const PROFIL = [[0.42, 0], [0.49, 0.06], [0.56, 0.02], [0.63, 0.06], [0.70, 0]], lagen = mobil ? [[0, 1]] : [[0.07, 1], [-0.07, -1]];
  for (const l of A.planken || []) {
    const P = []; let cum = 0;   // gleichmäßig alle 4 m, Enden bleiben
    for (let i = 1; i < l.length; i++) { const [ax, az] = l[i - 1], [bx, bz] = l[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue; if (!P.length) P.push([ax, az]); const n = Math.max(1, Math.round(L / schritt)); for (let k = 1; k <= n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); cum += L; }
    if (P.length < 2) continue;
    const Q = P.map(([x, z], i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x, z, y: H(x, z) + sockel, nx: -(b[1] - a[1]) / L, nz: (b[0] - a[0]) / L, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L }; });
    for (let i = 1; i < Q.length; i++) {
      const a = Q[i - 1], b = Q[i];
      for (const [ab, sinn] of lagen) for (let k = 1; k < PROFIL.length; k++) {
        const [y0, t0] = PROFIL[k - 1], [y1, t1] = PROFIL[k], o0 = ab + sinn * t0, o1 = ab + sinn * t1;
        viereck([a.x + a.nx * o0, a.y + y0, a.z + a.nz * o0], [b.x + b.nx * o0, b.y + y0, b.z + b.nz * o0], [b.x + b.nx * o1, b.y + y1, b.z + b.nz * o1], [a.x + a.nx * o1, a.y + y1, a.z + a.nz * o1]);
      }
      rails.push([[a.x + a.nx * 0.16, a.z + a.nz * 0.16], [b.x + b.nx * 0.16, b.z + b.nz * 0.16], [b.x - b.nx * 0.16, b.z - b.nz * 0.16], [a.x - a.nx * 0.16, a.z - a.nz * 0.16]]);
    }
    for (let i = 0; i < Q.length; i += mobil ? 2 : 1) {   // Pfosten: zwei gekreuzte Flächen (Sigma Pfosten aus der Ferne)
      const q = Q[i], h = 0.66, b = 0.05;
      viereck([q.x - q.nx * b, q.y - 0.15, q.z - q.nz * b], [q.x + q.nx * b, q.y - 0.15, q.z + q.nz * b], [q.x + q.nx * b, q.y + h, q.z + q.nz * b], [q.x - q.nx * b, q.y + h, q.z - q.nz * b]);
      if (!mobil) viereck([q.x - q.ux * b, q.y - 0.15, q.z - q.uz * b], [q.x + q.ux * b, q.y - 0.15, q.z + q.uz * b], [q.x + q.ux * b, q.y + h, q.z + q.uz * b], [q.x - q.ux * b, q.y + h, q.z - q.uz * b]);
    }
  }
  if (pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, STAHL); m.receiveShadow = true; m.castShadow = !mobil; m.name = 'schutzplanken'; gruppe.add(m); }

  // Leitpfosten: weißer Pfosten, schwarzes Band, Rückstrahler zur Fahrtrichtung hin
  if (A.pfosten?.length) {
    const p2 = [], col = [];
    const kasten = (cx, cy, cz, ux, uz, bx, hy, tz, f) => {   // Mitte, Richtung u (längs), Breite quer, Höhe, Tiefe längs, Farbe
      const nx = -uz, nz = ux, E = (a, y, t) => [cx + nx * a * bx / 2 + ux * t * tz / 2, cy + y * hy / 2, cz + nz * a * bx / 2 + uz * t * tz / 2];
      const F = [[[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]], [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]];
      for (const q of F) { const [a, b, c, d] = q.map(e => E(...e)); for (const v of [a, b, c, a, c, d]) { p2.push(v[0], v[1], v[2]); col.push(f[0], f[1], f[2]); } }
    };
    for (const [x, z, ry] of A.pfosten) {
      const y = H(x, z) + sockel, ux = Math.sin(ry), uz = Math.cos(ry);
      kasten(x, y + 0.5, z, ux, uz, 0.12, 1.0, 0.05, [0.9, 0.9, 0.88]); kasten(x, y + 0.78, z, ux, uz, 0.125, 0.22, 0.056, [0.03, 0.03, 0.03]);
      kasten(x - ux * 0.03, y + 0.78, z - uz * 0.03, ux, uz, 0.045, 0.16, 0.012, [1.0, 0.86, 0.62]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, PFOSTEN); m.name = 'leitpfosten'; gruppe.add(m);
  }

  // Schilderbrücken: zwei Stiele, ein Riegel, eine Tafel gegen die Fahrtrichtung
  for (const [x, z, ry, w, spuren] of A.schilder || []) {
    const G = new THREE.Group(), ux = Math.sin(ry), uz = Math.cos(ry), a = w / 2 + 1.7, yb = Math.min(H(x - uz * a, z + ux * a), H(x + uz * a, z - ux * a)) + sockel, yf = H(x, z);
    const hoch = Math.max(6.9, yf - yb + 6.9), teile = [];
    for (const s of [-1, 1]) { const st = new THREE.BoxGeometry(0.3, hoch, 0.3); st.translate(s * a, hoch / 2, 0); teile.push(st); }
    for (const yy of [hoch - 0.12, hoch - 0.92]) { const rg = new THREE.BoxGeometry(2 * a + 0.3, 0.14, 0.34); rg.translate(0, yy, 0); teile.push(rg); }
    if (!mobil) for (let k = -Math.floor(a / 1.4); k <= Math.floor(a / 1.4); k++) { const sp = new THREE.BoxGeometry(0.07, 0.8, 0.07); sp.translate(k * 1.4, hoch - 0.52, 0.12); teile.push(sp); }
    for (const t of teile) { const m = new THREE.Mesh(t, MAST); m.castShadow = !mobil; G.add(m); }
    const tb = Math.min(w - 1.2, spuren * 3.5 + 1), dz = -uz, zl = berlin ? ziele(lat, lon, ux, dz) : [];
    const tafel = new THREE.Mesh(new THREE.PlaneGeometry(tb, tb / 3), new THREE.MeshStandardMaterial({ map: tafelTextur(zl, spuren, gruen ? '#0b6b3a' : '#17479e'), roughness: 0.55, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0 }));
    tafel.position.set(0, hoch - 0.5 + 0.15, -0.2); tafel.rotation.y = Math.PI; G.add(tafel);
    const rueck = new THREE.Mesh(new THREE.PlaneGeometry(tb, tb / 3), MAST); rueck.position.set(0, hoch - 0.35, -0.18); G.add(rueck);
    G.position.set(x, yb, z); G.rotation.y = ry; G.name = 'schilderbruecke'; gruppe.add(G);
    for (const s of [-1, 1]) { const px = x + uz * s * a, pz = z - ux * s * a; rails.push([[px - 0.25, pz - 0.25], [px + 0.25, pz - 0.25], [px + 0.25, pz + 0.25], [px - 0.25, pz + 0.25]]); }
  }
  gruppe.name = 'autobahn';
  return { gruppe, rails };
}
