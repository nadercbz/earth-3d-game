// Fotofassaden bekannter Gebäude (Wunsch Nr. 113, 26.11.2026, Nader: "alle Gebäude, die man auch wirklich hier kennt, sollen richtig dargestellt
// werden", freie Fotos mit Namensnennung erlaubt). Ein entzerrtes Foto der echten Fassade (Wikimedia Commons, Quelle je Bild in
// kit/fotofassaden_daten.js und in den Quellen der Seite) liegt als Vorsatzschale knapp vor jeder Hauskante, die auf der Fassadenlinie liegt.
// Die Linie a nach b (von außen gesehen links nach rechts) und die Höhen h0 bis h1 über dem Boden spannen das Foto auf: jede Kante zeigt
// genau ihren Ausschnitt, höhere und zurückgesetzte Teile (Ecktürme) ihren eigenen. Die Haustür bleibt frei. Daten nur über tools/fotofassade_bauen.py.
import * as THREE from 'three';
import { orient, edgeNormal } from './geo.js';
import { tuerRechteck } from './buildings.js';

const BASE = new URL('../assets/textures/fotofassaden/', import.meta.url), MATS = new Map();
const AB = 0.55;   // Abstand der Schale vor der Wand: verdeckt Gesimse und Fensterrahmen der Bauweise dahinter
function material(n, mobil) {
  let m = MATS.get(n); if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 }); m.name = 'foto_' + n; m.userData.fest = true;   // fest: bleibt beim Vereinen der Häuser ein eigenes Material (kit/ort.js tintVon)
  // Die Textur hängt sofort am Material (lädt nach): ohne map hielte das Vereinen der Häuser (kit/ort.js tintVon) die Schale für eine einfarbige Fläche
  const t = new THREE.TextureLoader().load(new URL(n + (mobil ? '_k' : '') + '.webp', BASE).href, undefined, undefined, () => { m.map = null; m.color.set(0xb9b2a4); m.needsUpdate = true; });
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = mobil ? 2 : 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; m.map = t;
  MATS.set(n, m); return m;
}
// Gebäude oder Teil mit Grundriss pts (Meter im Ort), Wand von yUnten (über dem Boden des Teils, Mindesthöhe) über wandH; gruppe steht schon auf yUnten.
// nurWeg: keine Schale, nur die Vorbauten der Bauweise vor der belegten Wand entfernen (die Schale baut der Ort einmal für alle Detailstufen).
// Rückgabe: Zahl der belegten Kanten
export function fotoVorsatz(gruppe, liste, pts, yUnten, wandH, eingang = null, mobil = false, nurWeg = false) {
  if (!liste?.length || wandH < 2 || pts.length < 3) return 0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  let P = null, zahl = 0; const weg = [];
  for (const f of liste) {
    if (x1 < f.box[0] || x0 > f.box[1] || z1 < f.box[2] || z0 > f.box[3]) continue;
    P ||= orient(pts); const n = P.length, tuer = eingang != null ? tuerRechteck(P, eingang) : null;
    const pos = [], nor = [], uv = [];
    const quad = (A, B, C, D, N) => { for (const q of [A, B, C, A, C, D]) { pos.push(q[0], q[1], q[2]); nor.push(N[0], 0, N[1]); uv.push(q[3], q[4]); } };
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.6) continue;
      const nn = edgeNormal(a, b); if (nn[0] * f.nx + nn[1] * f.nz < 0.94) continue;   // Kante parallel zur Fassade, Blick nach außen
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, d = (mx - f.ax) * f.nx + (mz - f.az) * f.nz; if (d > f.vor || d < -f.hinter) continue;
      const ta = ((a[0] - f.ax) * f.tx + (a[1] - f.az) * f.tz) / f.L, tb = ((b[0] - f.ax) * f.tx + (b[1] - f.az) * f.tz) / f.L; if (Math.max(ta, tb) < 0.002 || Math.min(ta, tb) > 0.998) continue;
      const yA = Math.max(0, f.h0 - yUnten), yB = f.zu ? wandH : Math.min(wandH, f.h1 - yUnten); if (yB - yA < 1) continue;   // zu: Schale bis zur Wandkrone, über dem Foto wiederholt sich seine oberste Zeile (Gesims)
      const V = y => Math.min(0.998, (yUnten + y - f.h0) / (f.h1 - f.h0)), ox = nn[0] * AB, oz = nn[1] * AB;
      // Punkt auf der Schale: s 0 bei a, 1 bei b
      const pt = (s, y, aus = 1) => [a[0] + (b[0] - a[0]) * s + ox * aus, y, a[1] + (b[1] - a[1]) * s + oz * aus, Math.min(1, Math.max(0, ta + (tb - ta) * s)), V(y)];
      const stueck = (s0, s1, y0, y1) => { if (s1 - s0 < 1e-4 || y1 - y0 < 0.05) return; quad(pt(s1, y0), pt(s0, y0), pt(s0, y1), pt(s1, y1), nn); };
      weg.push({ ax: a[0], az: a[1], ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, L, nx: nn[0], nz: nn[1], yA, yB, t0: tuer && tuer.i === i ? L - tuer.u1 - 0.6 : 1, t1: tuer && tuer.i === i ? L - tuer.u0 + 0.6 : 0, tv: tuer ? tuer.v1 + 0.6 : 0 });
      if (tuer && tuer.i === i) {   // Haustür frei: u läuft von b nach a (kit/buildings.js schneideTuer)
        const s1 = 1 - (tuer.u0 - 0.45) / L, s0 = 1 - (tuer.u1 + 0.45) / L, yT = Math.min(yB, tuer.v1 + 0.5 - 0);
        stueck(0, Math.max(0, s0), yA, yB); stueck(Math.min(1, s1), 1, yA, yB); stueck(Math.max(0, s0), Math.min(1, s1), Math.max(yA, yT), yB);
      } else stueck(0, 1, yA, yB);
      // Stirnseiten und Deckel schließen den Spalt zur Wand
      for (const s of [0, 1]) { const p0 = pt(s, yA), p1 = pt(s, yB), q0 = pt(s, yA, 0), q1 = pt(s, yB, 0), N = s ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [(a[0] - b[0]) / L, (a[1] - b[1]) / L]; if (s) quad(q0, p0, p1, q1, N); else quad(p0, q0, q1, p1, N); }
      { const p0 = pt(0, yB), p1 = pt(1, yB), q0 = pt(0, yB, 0), q1 = pt(1, yB, 0); for (const q of [p1, p0, q0, p1, q0, q1]) { pos.push(q[0], q[1], q[2]); nor.push(0, 1, 0); uv.push(q[3], q[4]); } }
      zahl++;
    }
    if (!pos.length || nurWeg) continue;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, material(f.n, mobil)); mesh.name = 'fotofassade'; mesh.castShadow = false; mesh.receiveShadow = true; gruppe.add(mesh);
  }
  if (weg.length) vorbauWeg(gruppe, weg);
  return zahl;
}
// Alles, was die Bauweise vor die belegte Wand setzt (Erker, Balkone, Markisen, Gesimse, Säulen), entfällt: es stieße durch das Foto.
// Dreiecke, deren Ecken alle vor der Wand, innerhalb der Kante und unter der Wandkrone liegen. Die Haustür und ihr Rahmen bleiben
function vorbauWeg(gruppe, weg) {
  let tuer = null; gruppe.traverse(o => { if (o.name === 'tuerblatt') tuer = o; });
  gruppe.traverse(o => {
    if (!o.isMesh || o.name === 'fotofassade' || !o.geometry?.attributes?.position) return;
    for (let q = o; q && q !== gruppe; q = q.parent) { if (q === tuer) return; if (q !== gruppe && q.matrix && !q.matrix.equals(EINS)) { q.updateMatrix(); if (!q.matrix.equals(EINS)) return; } }
    let geo = o.geometry; if (geo.index) geo = geo.toNonIndexed();
    const pos = geo.attributes.position.array, n = pos.length / 9, bleib = new Uint8Array(n); let raus = 0;
    for (let k = 0; k < n; k++) {
      let drin = false;
      for (const w of weg) {
        let alle = true;
        for (let e = 0; e < 3 && alle; e++) { const x = pos[k * 9 + e * 3], y = pos[k * 9 + e * 3 + 1], z = pos[k * 9 + e * 3 + 2], d = (x - w.ax) * w.nx + (z - w.az) * w.nz, t = (x - w.ax) * w.ux + (z - w.az) * w.uz;
          if (d < 0.04 || d > 6 || t < -0.8 || t > w.L + 0.8 || y < w.yA - 0.1 || y > w.yB + 0.25 || (t > w.t0 && t < w.t1 && y < w.tv)) alle = false; }
        if (alle) { drin = true; break; }
      }
      if (drin) raus++; else bleib[k] = 1;
    }
    if (!raus) return;
    const neu = new THREE.BufferGeometry();
    for (const [name, at] of Object.entries(geo.attributes)) { const sz = at.itemSize, A = new at.array.constructor((n - raus) * 3 * sz); let j = 0; for (let k = 0; k < n; k++) if (bleib[k]) { A.set(at.array.subarray(k * 3 * sz, (k + 1) * 3 * sz), j); j += 3 * sz; } neu.setAttribute(name, new THREE.BufferAttribute(A, sz, at.normalized)); }
    o.geometry.dispose(); o.geometry = neu;
  });
}
const EINS = new THREE.Matrix4();
