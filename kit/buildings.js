// Gebäude Generator: aus jedem Grundriss (Polygon in Metern) und einer Höhe ein Haus im Stil des Spiels.
// Später kommen Grundriss und Höhe aus OpenFreeMap (render_height), die Art aus Landnutzung, POI und Region.
// Typen nach Naders Vorlage (moodboard/01_gebaeude): weißes Raster, Lochfassade, schwarzes Glas, Kupfer,
// Bürohaus mit Fensterbändern, dazu Altbau, Ziegel und Wohnturm für die Straßenebene.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Bau, offsetRing, edgeNormal, orient, inside, edgeDist, rng } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

// Rahmen einer Fassade: u entlang der Wand (von außen gesehen nach rechts), v Höhe, w nach außen
export class Fassade {
  constructor(bau, a, b) {
    this.bau = bau; this.L = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const nn = edgeNormal(a, b);
    this.n = new THREE.Vector3(nn[0], 0, nn[1]);
    this.r = new THREE.Vector3((a[0] - b[0]) / this.L, 0, (a[1] - b[1]) / this.L);
    this.o = new THREE.Vector3(b[0], 0, b[1]);
    this.i = bau.pts ? bau.pts.indexOf(a) : -1;   // Kantenindex im Grundriss (u = 0 bei b, u = L bei a); -1 für Kronen und Ringe
  }
  P(u, v, w = 0) {
    return new THREE.Vector3(this.o.x + this.r.x * u + this.n.x * w, v, this.o.z + this.r.z * u + this.n.z * w);
  }
  // Öffnung für das Innere merken (Fenster, Glaswände, Lobbyglas): u0 u1 v0 v1 an der Kante i, Glas d Meter hinter der Fassade
  merke(u0, u1, v0, v1, d) {
    if (!this.bau.oeffnungen || this.i < 0) return;
    const a = Math.max(0, u0), b = Math.min(this.L, u1); if (b - a < 0.2) return;
    this.bau.oeffnungen.push({ i: this.i, u0: a, u1: b, v0, v1, d });
  }
  wall(key, u0, u1, v0, v1, w = 0, merken = true) {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
    if (merken && key.startsWith('glas') && key !== 'glasGelaender') this.merke(u0, u1, v0, v1, -w);
    this.bau.face(key, this.P(u0, v0, w), this.P(u1, v0, w), this.P(u1, v1, w), this.P(u0, v1, w), this.n);
  }
  box(key, u0, u1, v0, v1, w0, w1, skip) {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3 || Math.abs(w1 - w0) < 1e-4) return;
    this.bau.hexa(key, [this.P(u0, v0, w0), this.P(u1, v0, w0), this.P(u1, v0, w1), this.P(u0, v0, w1),
      this.P(u0, v1, w0), this.P(u1, v1, w0), this.P(u1, v1, w1), this.P(u0, v1, w1)], skip);
  }
  // Schmale Leiste (Pfosten, Riegel): nur Vorderseite und zwei Seiten, halb so viele Dreiecke wie ein Quader
  leiste(key, u0, u1, v0, v1, w0, w1, quer = false) {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
    const B = this.bau;
    B.face(key, this.P(u0, v0, w1), this.P(u1, v0, w1), this.P(u1, v1, w1), this.P(u0, v1, w1), this.n);
    if (!quer) {
      B.face(key, this.P(u0, v0, w0), this.P(u0, v0, w1), this.P(u0, v1, w1), this.P(u0, v1, w0), this.r.clone().negate());
      B.face(key, this.P(u1, v0, w0), this.P(u1, v0, w1), this.P(u1, v1, w1), this.P(u1, v1, w0), this.r);
    } else {
      B.face(key, this.P(u0, v1, w0), this.P(u1, v1, w0), this.P(u1, v1, w1), this.P(u0, v1, w1), UP);
      B.face(key, this.P(u0, v0, w0), this.P(u1, v0, w0), this.P(u1, v0, w1), this.P(u0, v0, w1), DOWN);
    }
  }
  // Rahmenleiste im Fensterloch: sichtbar sind nur die Vorderseite und die Seite zur Öffnung hin (4 statt 12 Dreiecke je Leiste,
  // seit 28.10.2026 für das Budget auf Augenhöhe: die Rahmen waren der größte Posten im Bild)
  rahmen(key, u0, u1, v0, v1, w0, w1, seite) {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
    const B = this.bau;
    B.face(key, this.P(u0, v0, w1), this.P(u1, v0, w1), this.P(u1, v1, w1), this.P(u0, v1, w1), this.n);
    if (seite === 'oben') B.face(key, this.P(u0, v1, w0), this.P(u1, v1, w0), this.P(u1, v1, w1), this.P(u0, v1, w1), UP);
    else if (seite === 'unten') B.face(key, this.P(u0, v0, w0), this.P(u1, v0, w0), this.P(u1, v0, w1), this.P(u0, v0, w1), DOWN);
    else if (seite === 'rechts') B.face(key, this.P(u1, v0, w0), this.P(u1, v0, w1), this.P(u1, v1, w1), this.P(u1, v1, w0), this.r);
    else B.face(key, this.P(u0, v0, w0), this.P(u0, v0, w1), this.P(u0, v1, w1), this.P(u0, v1, w0), this.r.clone().negate());
  }
  // Wandband mit Öffnungen: jede Öffnung {u0, u1, v0, v1}, darunter und darüber Wand, dazwischen Pfeiler
  band(key, v0, v1, ops, w = 0, uS = 0, uE = this.L) {
    ops = ops.slice().sort((p, q) => p.u0 - q.u0);
    let prev = uS;
    for (const o of ops) {
      this.wall(key, prev, o.u0, v0, v1, w);
      this.wall(key, o.u0, o.u1, v0, o.v0, w);
      this.wall(key, o.u0, o.u1, o.v1, v1, w);
      prev = o.u1;
    }
    this.wall(key, prev, uE, v0, v1, w);
  }
  // Öffnung mit Laibung (in Wandmaterial), Glas, schlanken Rahmen, Sprossen, Bank, Faschen
  fenster(o, s) {
    const d = s.tiefe ?? 0.2, R = s.rahmen || 'rahmen', B = this.bau, L = s.laibung || 'stein';
    const { u0, u1, v0, v1 } = o;
    if (!o.tuer) this.merke(u0, u1, v0, v1, s.flach ? 0.03 : d - 0.02);   // die Haustür merkt sich laeden() selbst
    if (s.flach) { if (!o.tuer) this.wall(o.glas || s.glasKey || 'glas', u0, u1, v0, v1, -0.03, false); return; }   // leichte Fassung ohne Laibung (Handy)
    B.face(L, this.P(u0, v0, 0), this.P(u0, v0, -d), this.P(u0, v1, -d), this.P(u0, v1, 0), this.r);
    B.face(L, this.P(u1, v0, 0), this.P(u1, v0, -d), this.P(u1, v1, -d), this.P(u1, v1, 0), this.r.clone().negate());
    B.face(L, this.P(u0, v1, 0), this.P(u1, v1, 0), this.P(u1, v1, -d), this.P(u0, v1, -d), DOWN);
    B.face(s.bankInnen || L, this.P(u0, v0, 0), this.P(u1, v0, 0), this.P(u1, v0, -d), this.P(u0, v0, -d), UP);
    if (!o.tuer) this.wall(o.glas || s.glasKey || 'glas', u0, u1, v0, v1, -d + 0.02, false);   // Haustür: kein Glas, das Türblatt kommt als eigenes Mesh (tuerBlatt)
    if (s.ohneRahmen) return;
    const f = s.rahmenBreite ?? 0.05, w0 = -d + 0.02, w1 = -d + 0.06;
    this.rahmen(R, u0, u1, v0, v0 + f, w0, w1, 'oben'); this.rahmen(R, u0, u1, v1 - f, v1, w0, w1, 'unten');
    this.rahmen(R, u0, u0 + f, v0 + f, v1 - f, w0, w1, 'rechts'); this.rahmen(R, u1 - f, u1, v0 + f, v1 - f, w0, w1, 'links');
    if (s.sprossen && u1 - u0 > 0.9) { const m = (u0 + u1) / 2; this.leiste(R, m - 0.025, m + 0.025, v0 + f, v1 - f, w0, w1 - 0.01); }
    if (s.kaempfer) { const k = v0 + (v1 - v0) * 0.72; this.leiste(R, u0 + f, u1 - f, k - 0.025, k + 0.025, w0, w1 - 0.01, true); }
    if (s.bank) this.box(s.bankKey || 'stein', u0 - 0.06, u1 + 0.06, v0 - 0.06, v0, 0, 0.06);
    if (s.faschen) {
      const b = 0.12;
      this.box(s.faschen, u0 - b, u0, v0, v1, 0, 0.03); this.box(s.faschen, u1, u1 + b, v0, v1, 0, 0.03);
      this.box(s.faschen, u0 - b, u1 + b, v1, v1 + b, 0, 0.03);
      if (s.verdachung) this.box(s.faschen, u0 - b - 0.05, u1 + b + 0.05, v1 + b, v1 + b + 0.08, 0, 0.1);
    }
    if (s.sturz) this.box('stein', u0 - 0.07, u1 + 0.07, v1, v1 + 0.2, 0, 0.035);
    if (o.gitter) {
      const top = v0 + 0.95;
      this.leiste('rahmenDunkel', u0, u1, top - 0.03, top, 0.02, 0.06, true);
      for (let x = u0 + 0.06; x < u1 - 0.03; x += 0.12) this.leiste('rahmenDunkel', x - 0.01, x + 0.01, v0 + 0.02, top, 0.035, 0.05);
    }
  }
}

// Ringband zwischen Profilpunkten (Versatz o, Höhe dy) rund um den Grundriss
export function profilRing(bau, key, pts, prof, y0) {
  const rings = prof.map(([o, dy]) => ({ r: offsetRing(pts, o), y: y0 + dy, o }));
  for (let k = 0; k < rings.length - 1; k++) {
    const A = rings[k], B = rings[k + 1];
    const dO = B.o - A.o, dY = B.y - A.y;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length, en = edgeNormal(pts[i], pts[j]);
      const want = new THREE.Vector3(en[0] * dY, -dO, en[1] * dY);
      bau.face(key, new THREE.Vector3(A.r[i][0], A.y, A.r[i][1]), new THREE.Vector3(A.r[j][0], A.y, A.r[j][1]),
        new THREE.Vector3(B.r[j][0], B.y, B.r[j][1]), new THREE.Vector3(B.r[i][0], B.y, B.r[i][1]), want);
    }
  }
}

// Brüstung auf dem Flachdach plus Dachfläche, optional Geländer
export function dach(bau, pts, H, wallKey, hoehe = 0.9, dicke = 0.3, kappe = 'stein') {
  const innen = offsetRing(pts, -dicke);
  profilRing(bau, wallKey, pts, [[0, 0], [0, hoehe]], H);
  profilRing(bau, kappe, pts, [[0.03, hoehe], [0.03, hoehe + 0.07], [-dicke - 0.03, hoehe + 0.07]], H);
  profilRing(bau, wallKey, innen, [[0, hoehe], [0, 0]], H);
  bau.poly('dach', innen, H + 0.02);
  return innen;
}

// Dachtechnik: Treppenhaus, Aufzugsüberfahrt, Kühltürme, Klimageräte, Oberlichter, Solar, Lüfter, Antennen, Wassertank
export function dachTechnik(bau, innen, H, R, { tank = false, viel = 1, solar = false, penthouse = false } = {}) {
  const belegt = [];
  const frei = (x, z, r) => inside(innen, x, z) && edgeDist(innen, x, z) > r + 0.5 && belegt.every(b => Math.hypot(b[0] - x, b[1] - z) > b[2] + r + 0.4);
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  innen.forEach(([x, z]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); });
  const setze = (r, n, f) => {
    for (let t = 0; t < n * 14 && n > 0; t++) {
      const x = minX + R() * (maxX - minX), z = minZ + R() * (maxZ - minZ);
      if (frei(x, z, r)) { belegt.push([x, z, r]); f(x, z); n--; }
    }
  };
  const M = new THREE.Matrix4();
  if (penthouse) {   // zurückgesetzter Technikaufbau mit Lamellen
    const w = Math.min(maxX - minX, maxZ - minZ) * 0.45;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    bau.box('technikDunkel', cx, H, cz, w, 3.6, w * 0.8);
    for (let i = -w / 2 + 0.3; i < w / 2; i += 0.45) bau.box('technik', cx + i, H + 0.3, cz + w * 0.4 + 0.08, 0.08, 3.1, 0.12);
    belegt.push([cx, cz, w * 0.7]);
  }
  setze(2.3, 1, (x, z) => { const ry = Math.round(R() * 2) * Math.PI / 2; bau.box('beton', x, H, z, 3.2, 3.0, 4.4, ry); bau.box('rahmenDunkel', x, H, z, 3.3, 0.12, 4.5, ry); });
  if (tank) setze(1.6, 1, (x, z) => {
    bau.geo('holz', new THREE.CylinderGeometry(1.35, 1.35, 2.6, 20, 1, false), M.makeTranslation(x, H + 3.3, z));
    bau.geo('rahmenDunkel', new THREE.ConeGeometry(1.45, 0.8, 20), M.makeTranslation(x, H + 5.0, z));
    for (const [a, b] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]]) bau.box('metall', x + a, H, z + b, 0.12, 2.0, 0.12);
  });
  setze(1.4, Math.round((1 + R() * 2) * viel), (x, z) => {   // Kühlturm mit Lüfterkranz
    bau.box('technik', x, H, z, 2.4, 1.8, 2.4);
    bau.geo('technikDunkel', new THREE.CylinderGeometry(0.85, 0.85, 0.25, 18), M.makeTranslation(x, H + 1.9, z));
  });
  setze(0.8, Math.round((3 + R() * 5) * viel), (x, z) => {
    const ry = R() * 0.2;
    bau.box('technik', x, H, z, 1.3, 0.95, 0.9, ry);
    bau.box('technikDunkel', x, H + 0.95, z, 0.8, 0.04, 0.6, ry);
  });
  setze(1.2, Math.round(2 * viel), (x, z) => {   // Oberlicht
    bau.box('rahmenDunkel', x, H, z, 2.2, 0.35, 1.6);
    bau.box('glasHell', x, H + 0.35, z, 2.0, 0.08, 1.4);
  });
  if (solar) setze(2.6, Math.round(2 * viel), (x, z) => {
    for (let i = -1; i <= 1; i++) {
      const g = new THREE.BoxGeometry(4.2, 0.05, 1.1); g.rotateX(-0.35);
      bau.geo('glasDunkel', g, M.makeTranslation(x, H + 0.5, z + i * 1.6));
      bau.box('metall', x, H, z + i * 1.6, 4.0, 0.3, 0.06);
    }
  });
  setze(0.3, Math.round(4 * viel), (x, z) => bau.geo('metall', new THREE.CylinderGeometry(0.15, 0.15, 0.9, 10), M.makeTranslation(x, H + 0.45, z)));
  if (R() < 0.5 * viel) setze(0.4, 1, (x, z) => bau.geo('metall', new THREE.CylinderGeometry(0.05, 0.08, 6, 6), M.makeTranslation(x, H + 3, z)));
}

export function fassadenRaster(L, breite, rand = 0.8) {
  if (L < breite * 0.9) return { mitten: null, bw: 0 };
  const n = Math.max(1, Math.floor((L - 2 * rand) / breite)), bw = (L - 2 * rand) / n, out = [];
  for (let i = 0; i < n; i++) out.push(rand + bw * (i + 0.5));
  return { mitten: out, bw };
}

// Grenzen eines gleichmäßigen Rasters über die ganze Fassade (für Lamellen und Pfosten)
export function teilung(L, schritt) {
  const n = Math.max(1, Math.round(L / schritt)), out = [];
  for (let i = 0; i <= n; i++) out.push(L * i / n);
  return out;
}

// Erdgeschoss mit Läden, Eingängen und Markisen
export function laeden(f, gH, R, s) {
  const r = fassadenRaster(f.L, 4.2, 0.6), eingang = f.bau.eingang === f.i;
  if (!r.mitten) {   // schmale Fassade: Wand, mit Eingang eine Tür in der Mitte
    if (!eingang || f.L < 2.4) { f.wall(s.sockel, 0, f.L, 0, gH); return; }
    const m = f.L / 2, op = { u0: m - 0.75, u1: m + 0.75, v0: 0.02, v1: Math.min(gH - 0.4, 2.6), glas: 'glas', tuer: true };
    f.band(s.sockel, 0, gH, [op]); f.fenster(op, { tiefe: 0.28, rahmen: s.ladenRahmen || 'rahmenDunkel', rahmenBreite: 0.07, kaempfer: true, laibung: s.sockel });
    f.bau.tuer = { i: f.i, u0: op.u0, u1: op.u1, v1: op.v1, d: 0.26, glas: true };
    return;
  }
  const ops = [];
  // Eingang (kit/interior.js): die Öffnung in der Mitte wird die Haustür, sonst jede dritte
  const mitte = eingang ? r.mitten.reduce((b, m, i) => Math.abs(m - f.L / 2) < Math.abs(r.mitten[b] - f.L / 2) ? i : b, 0) : -1;
  r.mitten.forEach((m, i) => {
    const tuer = i === mitte || (mitte < 0 && i % 3 === 1), w = tuer ? 1.5 : r.bw * 0.78;
    ops.push({ u0: m - w / 2, u1: m + w / 2, v0: tuer ? 0.02 : 0.45, v1: gH - 0.75, glas: 'glas', tuer, markise: !tuer && R() < s.markisen });
    if (i === mitte) f.bau.tuer = { i: f.i, u0: m - w / 2, u1: m + w / 2, v1: gH - 0.75, d: 0.26, glas: true };
  });
  f.band(s.sockel, 0, gH, ops);
  for (const o of ops) {
    f.fenster(o, { tiefe: 0.28, rahmen: s.ladenRahmen || 'rahmenDunkel', rahmenBreite: 0.07, sprossen: !o.tuer, kaempfer: true, laibung: s.sockel });
    if (o.markise) {
      const top = gH - 0.6, a = f.P(o.u0 - 0.1, top, 0.02), b = f.P(o.u1 + 0.1, top, 0.02), c = f.P(o.u1 + 0.1, top - 0.55, 1.3), d = f.P(o.u0 - 0.1, top - 0.55, 1.3);
      f.bau.face('markise', a, b, c, d, f.n.clone().add(UP));
      f.box('rahmenDunkel', o.u0 - 0.1, o.u1 + 0.1, top - 0.58, top - 0.52, 1.28, 1.34);
    }
  }
  if (s.schild) f.box('rahmenDunkel', 0.3, f.L - 0.3, gH - 0.7, gH - 0.25, 0, 0.06);
}

// Lobby: zurückgesetztes Glas mit Stützen und Untersicht
// Zurückgesetzte Glaslobby unter dem Haus. Mit pts und i endet das Glas genau am eingerückten Ring (konvexe Ecken kürzer,
// konkave länger), sonst ragen Glas und Untersicht an konvexen Ecken um die Lobbytiefe aus dem Haus.
export function lobby(f, gH, tiefe, stuetze, glas = 'glasDunkel', pts = null, i = 0) {
  let u0 = -tiefe, u1 = f.L + tiefe;
  if (pts) {
    const ring = offsetRing(pts, -tiefe), n = pts.length, B = ring[(i + 1) % n], A = ring[i];
    const u = q => (q[0] - f.o.x) * f.r.x + (q[1] - f.o.z) * f.r.z;
    u0 = u(B); u1 = u(A);
    if (u1 < u0) u0 = u1 = (u0 + u1) / 2;   // kurze Kanten an runden Ecken
  }
  const m = f.L / 2, tuer = f.bau.eingang === f.i && u1 - u0 > 2.0 && !(f.bau.tuer);
  if (tuer) f.band(glas, 0, gH, [{ u0: m - 0.79, u1: m + 0.79, v0: 0, v1: 2.44 }], -tiefe, u0, u1); else f.wall(glas, u0, u1, 0, gH, -tiefe);   // Tür aus dem Glas geschnitten
  f.bau.face(stuetze, f.P(0, gH, 0), f.P(f.L, gH, 0), f.P(u1, gH, -tiefe), f.P(u0, gH, -tiefe), DOWN);
  teilung(f.L, 7.5).forEach((u, k, a) => { if (k > 0 && k < a.length - 1) f.box(stuetze, u - 0.35, u + 0.35, 0, gH, -tiefe + 0.2, -0.1); });
  for (let u = Math.max(1.5, u0 + 0.5); u < Math.min(f.L - 1, u1 - 0.5); u += 1.5) { if (tuer && Math.abs(u - m) < 1.1) continue; f.leiste('rahmenDunkel', u - 0.03, u + 0.03, 0, gH, -tiefe, -tiefe + 0.08); }
  if (tuer) {   // Eingang (kit/interior.js): Tür im Lobbyglas, kräftiger Rahmen
    for (const u of [m - 0.85, m + 0.79]) f.leiste('rahmenDunkel', u, u + 0.06, 0, 2.5, -tiefe - 0.02, -tiefe + 0.1);
    f.leiste('rahmenDunkel', m - 0.85, m + 0.85, 2.44, 2.5, -tiefe - 0.02, -tiefe + 0.1, true);
    f.bau.tuer = { i: f.i, u0: m - 0.79, u1: m + 0.79, v1: 2.44, d: tiefe, glas: true };
  }
}

// Ecken runden: jede konvexe Ecke wird ein Bogen aus 4 Stücken (quadratische Kurve über die Ecke)
export function fase(pts, c) {
  if (!c) return pts;
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p = pts[i], p1 = pts[(i + 1) % n];
    const a = [p0[0] - p[0], p0[1] - p[1]], b = [p1[0] - p[0], p1[1] - p[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b), cc = Math.min(c, la * 0.35, lb * 0.35);
    if (a[0] * b[1] - a[1] * b[0] >= 0) { out.push(p); continue; }   // nur konvexe Ecken
    const A = [p[0] + a[0] / la * cc, p[1] + a[1] / la * cc], B = [p[0] + b[0] / lb * cc, p[1] + b[1] / lb * cc];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, q = (1 - t) * (1 - t), m = 2 * (1 - t) * t, e = t * t;
      out.push([q * A[0] + m * p[0] + e * B[0], q * A[1] + m * p[1] + e * B[1]]);
    }
  }
  return out;
}

export const TYPEN = {
  // Wohn und Geschäftshaus: Läden, Gesims, Fenster mit Faschen, Balkone, Mansarddach mit Gauben
  altbau(bau, pts, H, R, v, o) {
    const wand = ['putz', 'putzSand', 'putzGrau'][Math.floor(R() * 3)];
    const gH = 4.4, fH = 3.3, N = Math.max(1, Math.round((H - gH) / fH)), top = gH + N * fH;
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      if (o.ohneLaden) f.wall('sandstein', 0, f.L, 0, gH); else laeden(f, gH, R, { sockel: 'sandstein', markisen: 0.5 });
      const r = fassadenRaster(f.L, 2.5);
      const mitte = r.mitten ? Math.floor(r.mitten.length / 2) : -1;
      for (let k = 0; k < N; k++) {
        const vv = gH + k * fH, oben = k === N - 1;
        const ops = (r.mitten || []).map(m => ({ u0: m - 0.6, u1: m + 0.6, v0: vv + 0.85, v1: vv + (oben ? 2.5 : 2.72), gitter: !o.leicht && k === 0 && R() < 0.5 }));
        f.band(wand, vv, vv + fH, ops);
        ops.forEach(op => f.fenster(op, { tiefe: 0.24, laibung: wand, sprossen: true, kaempfer: true, bank: true, faschen: 'stein', verdachung: k === 0, ohneRahmen: o.leicht }));
        if (k > 0 && k < N - 1 && r.mitten && r.mitten.length >= 3) {   // Balkon in der Mittelachse
          const m = r.mitten[mitte], u0 = m - 1.3, u1 = m + 1.3;
          f.box('stein', u0, u1, vv + 0.65, vv + 0.85, 0, 1.1);
          f.box('rahmenDunkel', u0, u1, vv + 1.82, vv + 1.86, 1.02, 1.1);
          if (o.leicht) f.wall('glasGelaender', u0, u1, vv + 0.85, vv + 1.82, 1.06);
          else for (let x = u0 + 0.06; x < u1; x += 0.13) f.leiste('rahmenDunkel', x - 0.01, x + 0.01, vv + 0.85, vv + 1.82, 1.04, 1.07);
          for (const x of [u0, u1 - 0.03]) f.box('rahmenDunkel', x, x + 0.03, vv + 0.85, vv + 1.86, 0.02, 1.1);
        }
      }
    });
    profilRing(bau, 'stein', pts, [[0, 0], [0.1, 0.08], [0.1, 0.2], [0, 0.3]], gH - 0.15);
    profilRing(bau, 'stein', pts, [[0, 0], [0.12, 0.1], [0.12, 0.2], [0.42, 0.42], [0.48, 0.6], [0, 0.6]], top - 0.5);
    // Mansarddach mit Gauben
    const md = 1.5, mh = 3.4;
    profilRing(bau, 'schiefer', pts, [[0.15, 0.1], [-md, mh], [-md - 0.2, mh + 0.15]], top);
    const innen = offsetRing(pts, -md - 0.2);
    bau.poly('dach', innen, top + mh + 0.15);
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      const r = fassadenRaster(f.L, 2.5);
      (r.mitten || []).forEach((m, j) => {
        if (j % 2) return;
        const u0 = m - 0.55, u1 = m + 0.55, v0 = top + 0.5, v1 = top + 2.1, w = -0.55;
        f.box(wand, u0 - 0.12, u1 + 0.12, v0, v1, w - 1.2, w, { oben: true });
        f.wall('glas', u0, u1, v0 + 0.15, v1 - 0.1, w + 0.01);
        f.box('rahmen', u0, u1, v0 + 0.15, v0 + 0.2, w, w + 0.04); f.box('rahmen', u0, u1, v1 - 0.15, v1 - 0.1, w, w + 0.04);
        f.box('schiefer', u0 - 0.2, u1 + 0.2, v1, v1 + 0.12, w - 1.3, w + 0.12);
      });
    });
    dachTechnik(bau, offsetRing(innen, -0.3), top + mh + 0.15, R, { viel: 0.5 });
    return { floors: N + 2, top: top + mh };
  },

  // Mietshaus aus Ziegel mit hellen Fenstern und Steinstürzen
  ziegel(bau, pts, H, R, v, o) {
    const gH = 4.0, fH = 3.1, N = Math.max(1, Math.round((H - gH) / fH)), top = gH + N * fH;
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      if (o.ohneLaden) f.wall('granit', 0, f.L, 0, gH); else laeden(f, gH, R, { sockel: 'granit', markisen: 0.3, schild: true });
      const r = fassadenRaster(f.L, 2.2);
      for (let k = 0; k < N; k++) {
        const vv = gH + k * fH;
        const ops = (r.mitten || []).map(m => ({ u0: m - 0.55, u1: m + 0.55, v0: vv + 0.9, v1: vv + 2.6 }));
        f.band('ziegel', vv, vv + fH, ops);
        ops.forEach(op => f.fenster(op, { tiefe: 0.22, laibung: 'ziegel', kaempfer: true, bank: true, sturz: true, ohneRahmen: o.leicht }));
      }
    });
    profilRing(bau, 'rahmenDunkel', pts, [[0, 0], [0.35, 0.2], [0.35, 0.5], [0, 0.55]], top - 0.2);
    dachTechnik(bau, dach(bau, pts, top + 0.3, 'ziegel', 0.6), top + 0.3, R, { tank: R() < 0.6 });
    return { floors: N + 1, top };
  },

  // Wohnturm mit tiefen Balkonen, Holz, Glasgeländern, Pflanzkübeln und warmem Licht
  wohnturm(bau, pts, H, R, v, o) {
    const gH = 5.0, fH = 3.2, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH;
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      if (o.ohneLaden) lobby(f, gH, 1.2, 'stein', 'glas', pts, i); else laeden(f, gH, R, { sockel: 'sandstein', ladenRahmen: 'holz', markisen: 0.2 });
      const r = fassadenRaster(f.L, 3.4, 0.3);
      if (!r.mitten) { f.wall('putzSand', 0, f.L, gH, top); return; }
      for (let k = 0; k < N; k++) {
        const vv = gH + k * fH;
        const ops = r.mitten.map(m => ({ u0: m - r.bw / 2 + 0.2, u1: m + r.bw / 2 - 0.2, v0: vv + 0.05, v1: vv + fH - 0.35 }));
        f.band('putzSand', vv, vv + fH, ops, -0.4, -0.4, f.L + 0.4);
        ops.forEach(op => {
          f.wall('glas', op.u0, op.u1, op.v0, op.v1, -0.42);
          f.box('holz', op.u0, op.u1, op.v1 - 0.06, op.v1, -0.42, -0.36);
          for (let x = op.u0 + 1.1; x < op.u1 - 0.3; x += 1.1) f.leiste('holz', x - 0.03, x + 0.03, op.v0, op.v1, -0.42, -0.37);
          if (R() < 0.4) {   // Pflanzkübel auf der Balkonplatte
            const x = op.u0 + 0.6 + R() * (op.u1 - op.u0 - 1.2);
            f.box('erdeTopf', x - 0.28, x + 0.28, vv + 0.02, vv + 0.5, 0.75, 1.25);
            const c = f.P(x, vv + 0.8, 1.0);
            bau.geo('pflanze', new THREE.IcosahedronGeometry(0.42, 1), new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
          }
        });
        f.box('stein', 0.02, f.L - 0.02, vv - 0.22, vv + 0.02, -0.4, 1.55);
        f.box('holz', 0.02, f.L - 0.02, vv - 0.24, vv - 0.21, -0.4, 1.5);
        f.wall('glasGelaender', 0.1, f.L - 0.1, vv + 0.02, vv + 1.05, 1.5);
        f.box('metall', 0.1, f.L - 0.1, vv + 1.02, vv + 1.07, 1.47, 1.53);
      }
      [0, ...r.mitten.map(m => m + r.bw / 2)].forEach((u, j) => {
        if (j % 2 === 0 || u > f.L - 0.5) f.box('stein', Math.max(0, u - 0.18), Math.min(f.L, u + 0.18), gH, top, -0.4, 1.55);
      });
    });
    profilRing(bau, 'stein', pts, [[1.55, 0], [1.55, 0.6], [0, 0.6]], top - 0.2);
    dachTechnik(bau, dach(bau, pts, top + 0.4, 'putzSand', 1.1), top + 0.4, R, { viel: 1.3, solar: true });
    return { floors: N + 1, top };
  },

  // Büroturm mit feinem, tiefem weißen Raster und Krone (Vorlage: die weißen Türme)
  raster(bau, pts, H, R, v, o) {
    const gH = 7.0, fH = 3.75, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH;
    const K = v === 'kupfer' ? 'kupfer' : 'beton', tiefe = 0.62, krone = 4.5;
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      f.wall('glasDunkel', -tiefe, f.L + tiefe, gH, top, -tiefe);
      const us = teilung(f.L, 1.25);
      us.forEach((u, j) => {
        const b = j % 4 === 0 ? 0.22 : 0.13;   // jede vierte Lamelle kräftiger
        f.leiste(K, Math.max(0, u - b), Math.min(f.L, u + b), gH, top + krone, -tiefe, 0.04);   // Rückseite liegt am Glas: Vorderseite und zwei Seiten reichen
      });
      for (let k = 0; k <= N; k++) { const y = gH + k * fH; f.leiste(K, 0, f.L, y - (k % 3 === 0 ? 0.32 : 0.2), y + 0.2, -tiefe, 0.0, true); }
      f.box(K, 0, f.L, top + krone - 0.4, top + krone, -tiefe, 0.06);
      if (o.ohneLaden) f.wall(K, 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: K, ladenRahmen: 'rahmenDunkel', markisen: 0.18, schild: true }); else lobby(f, gH, 2.2, K, 'glasDunkel', pts, i);
    });
    dachTechnik(bau, dach(bau, pts, top, K, 1.2, tiefe + 0.3), top, R, { viel: 1.6, penthouse: true });
    return { floors: N + 1, top: top + krone };
  },

  // Weißer Turm mit tiefen Lochfenstern (Vorlage: der helle Turm in der Mitte)
  lochfassade(bau, pts, H, R, v, o) {
    const gH = 6.0, fH = 3.3, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH;
    const W = v === 'grau' ? 'platten' : v === 'ziegel' ? 'ziegel' : v === 'stein' ? 'sandstein' : 'weiss';   // ziegel und stein für echte Orte (Backstein, Naturstein)
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      const r = fassadenRaster(f.L, 1.6, 0.7);
      for (let k = 0; k < N; k++) {
        const vv = gH + k * fH;
        const ops = (r.mitten || []).map(m => ({ u0: m - 0.5, u1: m + 0.5, v0: vv + 0.9, v1: vv + 2.75 }));
        f.band(W, vv, vv + fH, ops);
        ops.forEach(op => f.fenster(op, { tiefe: 0.42, laibung: W, ohneRahmen: true, glasKey: 'glasDunkel', flach: o.leicht }));
      }
      if (o.ohneLaden) f.wall(W, 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: W, ladenRahmen: 'rahmenDunkel', markisen: 0.18, schild: true }); else lobby(f, gH, 1.8, W, 'glasDunkel', pts, i);
      f.box(W, 0, f.L, top, top + 2.2, -0.2, 0.15);
    });
    dachTechnik(bau, dach(bau, pts, top + 2.2, W, 0.6, 0.5), top + 2.2, R, { viel: 1.4, penthouse: true });
    return { floors: N + 1, top: top + 2.2 };
  },

  // Schwarzer Spiegelglasturm, feine Pfosten, optional weiße Kante, zurückgesetzte Krone
  glasturm(bau, pts, H, R, v, o) {
    const gH = 7.5, fH = 3.8, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH;
    const kroneH = 2 * fH, kante = v === 'kante';
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      f.wall('glasDunkel', 0, f.L, gH, top - kroneH);
      teilung(f.L, 1.5).forEach(u => f.leiste('rahmenDunkel', Math.max(0, u - 0.04), Math.min(f.L, u + 0.04), gH, top - kroneH, 0, 0.12));
      for (let k = 0; k <= N - 2; k++) { const y = gH + k * fH; f.leiste('rahmenDunkel', 0, f.L, y - 0.05, y + 0.05, 0, 0.1, true); }
      if (kante) f.box('weiss', 0, 0.9, gH, top + 1.5, -0.1, 0.5);
      if (o.ohneLaden) f.wall('glasDunkel', 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: 'granit', ladenRahmen: 'rahmenDunkel', markisen: 0.18, schild: true }); else lobby(f, gH, 1.4, 'stein', 'glas', pts, i);
    });
    // Krone: zwei Geschosse zurückgesetzt, Glas mit dichteren Lamellen
    const kr = offsetRing(pts, -1.4);
    profilRing(bau, 'technikDunkel', pts, [[0, 0], [-1.4, 0]], top - kroneH);
    kr.forEach((a, i) => {
      const f = new Fassade(bau, a, kr[(i + 1) % kr.length]);
      f.wall('glasDunkel', 0, f.L, top - kroneH, top);
      teilung(f.L, o.leicht ? 1.5 : 0.75).forEach(u => f.leiste('rahmenDunkel', Math.max(0, u - 0.05), Math.min(f.L, u + 0.05), top - kroneH, top + 1.2, 0, 0.35));
    });
    dachTechnik(bau, dach(bau, kr, top, 'technikDunkel', 1.2, 0.35, 'rahmenDunkel'), top, R, { viel: 0.8 });
    return { floors: N + 1, top: top + 1.2 };
  },

  // Kupferturm: kräftige Brüstungsbänder und Lamellen in Kupfer, Glas dazwischen
  kupfer(bau, pts, H, R, v, o) {
    const gH = 6.5, fH = 3.6, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH;
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      f.wall('glas', -0.5, f.L + 0.5, gH, top, -0.5);
      for (let k = 0; k < N; k++) { const y = gH + k * fH; f.leiste('kupfer', 0, f.L, y, y + 1.05, -0.5, 0.05, true); }
      teilung(f.L, 1.8).forEach(u => f.leiste('kupfer', Math.max(0, u - 0.09), Math.min(f.L, u + 0.09), gH, top + 1.2, -0.5, 0.25));
      if (o.ohneLaden) f.wall('kupfer', 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: 'technikDunkel', ladenRahmen: 'rahmenDunkel', markisen: 0.18, schild: true }); else lobby(f, gH, 1.6, 'technikDunkel', 'glasDunkel', pts, i);
    });
    dachTechnik(bau, dach(bau, pts, top, 'kupfer', 1.2, 0.55), top, R, { viel: 1.2, penthouse: true });
    return { floors: N + 1, top: top + 1.2 };
  },

  // Bürohaus mit Fensterbändern und dichter Dachtechnik (Sockel, Blockrand, Füller)
  band(bau, pts, H, R, v, o) {
    const gH = 4.8, fH = 3.6, N = Math.max(1, Math.round((H - gH) / fH)), top = gH + N * fH;
    const W = v === 'kupfer' ? 'kupfer' : v === 'grau' ? 'platten' : v === 'ziegel' ? 'ziegel' : 'weiss';
    pts.forEach((a, i) => {
      const f = new Fassade(bau, a, pts[(i + 1) % pts.length]);
      for (let k = 0; k < N; k++) {
        const y = gH + k * fH;
        f.box(W, 0, f.L, y, y + 1.15, 0, 0.12);
        f.wall('glas', 0, f.L, y + 1.15, y + fH, -0.12);
        // Pfosten nur als Vorderseite (2 Dreiecke): der häufigste Typ, die Pfosten waren 27 % aller Dreiecke am Potsdamer Platz; leicht ohne Pfosten
        if (!o.leicht) teilung(f.L, 1.5).forEach(u => f.wall('rahmenDunkel', Math.max(0, u - 0.03), Math.min(f.L, u + 0.03), y + 1.15, y + fH, -0.06));
      }
      if (o.ohneLaden) f.wall(W, 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: W, ladenRahmen: 'rahmenDunkel', markisen: 0.18, schild: true }); else lobby(f, gH, 1.0, W, 'glas', pts, i);
    });
    dachTechnik(bau, dach(bau, pts, top, W, 0.9, 0.35), top, R, { viel: 2.0, solar: R() < 0.5 });
    return { floors: N + 1, top };
  },
};

export const TYPEN_INFO = {
  altbau: 'Wohn und Geschäftshaus aus Sandstein und Putz, Läden mit Markisen, Gesimse, Fenster mit Faschen, Balkone in der Mittelachse, Mansarddach mit Gauben',
  ziegel: 'Mietshaus aus Ziegel, helle Sprossenfenster, Steinstürze, Ladenzeile mit Schildband, Wassertank auf dem Dach',
  wohnturm: 'Wohnturm mit tiefen Balkonen, Holzrahmen, Glasgeländern, Pflanzkübeln und warmem Licht',
  raster: 'Büroturm mit feinem tiefen Raster, jede vierte Lamelle kräftiger, Krone über dem Dach, Lobby mit Stützen',
  lochfassade: 'Weißer Turm mit tiefen Lochfenstern, zurückgesetzte Lobby, Attika und Technikaufbau',
  glasturm: 'Schwarzer Spiegelglasturm mit feinen Pfosten, zurückgesetzter Krone, wahlweise mit weißer Kante',
  kupfer: 'Turm mit Brüstungsbändern und Lamellen in Kupfer, Glas dazwischen',
  band: 'Bürohaus mit Fensterbändern, dichter Dachtechnik, Oberlichtern und Solar, auch als Blockrand mit Innenhof',
};

// Weitere Typen (zum Beispiel Baustile in kit/stile.js) melden sich hier an: fn(bau, pts, H, R, variant, o) gibt { floors, top } zurück
export function registriereTyp(name, fn, info) { TYPEN[name] = fn; TYPEN_INFO[name] = info; }

// laeden: Erdgeschoss mit Schaufenstern statt Lobby (echte Orte: Gebäude mit Geschäften laut OSM)
// eingang: Kantenindex des Grundrisses mit der Haustür (kit/interior.js); das Türblatt wird ein eigenes Mesh "tuerblatt" (dreht sich beim Öffnen),
// userData.oeffnungen hält alle Fenster und Glaswände je Kante für die Innenhülle, userData.tuer die Haustür
export function buildBuilding(mats, { pts, height, type = 'altbau', seed = 1, variant, ecken = 0, ohneLaden = false, leicht = false, laeden = false, eingang = null } = {}) {
  const P = fase(orient(pts), ecken), bau = new Bau(), R = rng(seed);
  bau.pts = P; bau.eingang = eingang; bau.oeffnungen = [];
  const info = TYPEN[type](bau, P, height, R, variant, { ohneLaden, leicht, laeden, front: eingang != null ? edgeNormal(P[eingang], P[(eingang + 1) % P.length]) : null });
  if (eingang != null && !bau.tuer && !ohneLaden) { bau.tuer = tuerRechteck(P, eingang); if (bau.tuer) schneideTuer(bau, P, bau.tuer); }   // Typen ohne eigene Tür (Baustile der Welt): Türloch in die Fassade
  const g = bau.build(mats);
  if (bau.tuer) g.add(tuerBlatt(mats, bau.tuer, P));
  let tris = 0; g.traverse(o => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  g.userData = { type, variant, floors: info.floors, height: +(info.top).toFixed(1), tris, drawCalls: g.children.length, oeffnungen: bau.oeffnungen, tuer: bau.tuer, pts: P };
  return g;
}

// Nur die Öffnungen und die Tür eines Hauses (ohne Geometrie): derselbe Lauf wie buildBuilding mit leerem Bau, für das Innere
export function hausPlan(opts) {
  const { pts, height, type = 'altbau', seed = 1, variant, ecken = 0, ohneLaden = false, laeden = false, eingang = null } = opts;
  const P = fase(orient(pts), ecken), bau = new Bau(), R = rng(seed);
  bau.leer = true; bau.pts = P; bau.eingang = eingang; bau.oeffnungen = [];
  const info = TYPEN[type](bau, P, height, R, variant, { ohneLaden, leicht: false, laeden, front: eingang != null ? edgeNormal(P[eingang], P[(eingang + 1) % P.length]) : null });
  if (eingang != null && !bau.tuer && !ohneLaden) bau.tuer = tuerRechteck(P, eingang);
  return { pts: P, oeffnungen: bau.oeffnungen, tuer: bau.tuer, floors: info.floors, top: info.top };
}

// Haustür für Typen ohne eigene Tür (seit 29.10.2026, Naders Regel: alle Gebäude der Welt begehbar): 1,1 m × 2,25 m in der Mitte der Straßenkante
// (zu kurze Kante: die längste), Türblatt 12 cm hinter der Fassade
export function tuerRechteck(P, i) {
  const n = P.length, L = k => Math.hypot(P[(k + 1) % n][0] - P[k][0], P[(k + 1) % n][1] - P[k][1]);
  if (L(i) < 2.2) { let b = 0; for (let k = 1; k < n; k++) if (L(k) > L(b)) b = k; i = b; }
  const l = L(i); if (l < 1.8) return null;
  return { i, u0: l / 2 - 0.55, u1: l / 2 + 0.55, v1: 2.25, d: 0.12, glas: false };
}
// Türloch in die fertige Fassade schneiden: Dreiecke nahe der Fassadenebene verlieren den Teil im Türquader (u0..u1, unter v1),
// dazu Laibung (0,3 m tief, bis zur Innenhülle aus kit/interior.js), Sturz und Schwelle. Funktioniert mit jedem Typ, auch mit Baustilen.
export function schneideTuer(bau, P, t) {
  const n = P.length, a = P[t.i], b = P[(t.i + 1) % n], L = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rx = (a[0] - b[0]) / L, rz = (a[1] - b[1]) / L, nn = edgeNormal(a, b), ox = b[0], oz = b[1];
  const U = v => (v[0] - ox) * rx + (v[2] - oz) * rz, W = v => (v[0] - ox) * nn[0] + (v[2] - oz) * nn[1];
  const flaecheJe = new Map();
  const schnitt = (poly, f) => {   // Sutherland Hodgman an einer Ebene f(v) >= 0
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length], fa = f(A), fb = f(B);
      if (fa >= 0) out.push(A);
      if ((fa >= 0) !== (fb >= 0)) { const s = fa / (fa - fb); out.push([A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s]); }
    }
    return out;
  };
  for (const [key, p] of bau.parts) {
    const pos = p.pos, nor = p.nor, np = [], nnor = [], nuv = [];
    let geaendert = false;
    for (let k = 0; k < pos.length; k += 9) {
      const T = [[pos[k], pos[k + 1], pos[k + 2]], [pos[k + 3], pos[k + 4], pos[k + 5]], [pos[k + 6], pos[k + 7], pos[k + 8]]];
      const us = T.map(U), ws = T.map(W), ys = T.map(v => v[1]);
      const nah = ws.every(w => Math.abs(w) < 0.48), drin = Math.max(...us) > t.u0 && Math.min(...us) < t.u1 && Math.min(...ys) < t.v1;
      const N = [nor[k], nor[k + 1], nor[k + 2]];
      const auf = (poly) => {   // Polygon als Fächer zurück, UV wie Bau.tri (Projektion)
        const flach = Math.abs(N[1]) > 0.7, tx = flach ? 0 : -N[2], tz = flach ? 0 : N[0], tl = Math.hypot(tx, tz) || 1;
        for (let j = 1; j + 1 < poly.length; j++) for (const v of [poly[0], poly[j], poly[j + 1]]) { np.push(v[0], v[1], v[2]); nnor.push(N[0], N[1], N[2]); nuv.push(flach ? v[0] : (v[0] * tx + v[2] * tz) / tl, flach ? -v[2] : v[1]); }
      };
      if (!nah || !drin) { auf(T); continue; }
      geaendert = true;
      const rest = [schnitt(T, v => t.u0 - U(v)), schnitt(T, v => U(v) - t.u1), schnitt(schnitt(schnitt(T, v => U(v) - t.u0), v => t.u1 - U(v)), v => v[1] - t.v1)];
      for (const r of rest) if (r.length >= 3) auf(r);
      const ab = [T[1][0] - T[0][0], T[1][1] - T[0][1], T[1][2] - T[0][2]], ac = [T[2][0] - T[0][0], T[2][1] - T[0][1], T[2][2] - T[0][2]];
      flaecheJe.set(key, (flaecheJe.get(key) || 0) + Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2);
    }
    if (geaendert) { p.pos = np; p.nor = nnor; p.uv = nuv; }
  }
  if (bau.leer) return;
  let wand = 'stein', bf = 0; for (const [k, f] of flaecheJe) if (f > bf && !k.startsWith('glas') && !k.startsWith('rahmen')) { bf = f; wand = k; }
  const f = new Fassade(bau, a, b), d = 0.3;
  bau.face(wand, f.P(t.u0, 0, 0), f.P(t.u0, 0, -d), f.P(t.u0, t.v1, -d), f.P(t.u0, t.v1, 0), f.r);
  bau.face(wand, f.P(t.u1, 0, 0), f.P(t.u1, 0, -d), f.P(t.u1, t.v1, -d), f.P(t.u1, t.v1, 0), f.r.clone().negate());
  bau.face(wand, f.P(t.u0, t.v1, 0), f.P(t.u1, t.v1, 0), f.P(t.u1, t.v1, -d), f.P(t.u0, t.v1, -d), DOWN);
  bau.face('stein', f.P(t.u0, 0.02, 0.05), f.P(t.u1, 0.02, 0.05), f.P(t.u1, 0.02, -d), f.P(t.u0, 0.02, -d), UP);
  f.box('rahmenDunkel', t.u0 - 0.07, t.u0, 0, t.v1 + 0.07, -0.02, 0.05); f.box('rahmenDunkel', t.u1, t.u1 + 0.07, 0, t.v1 + 0.07, -0.02, 0.05); f.box('rahmenDunkel', t.u0, t.u1, t.v1, t.v1 + 0.07, -0.02, 0.05);
}

// Türblatt als eigenes Mesh mit dem Drehpunkt an der Angel (lokal: Blatt entlang +x, Außenseite +z). kit/interior.js dreht es auf.
let tuerGlasMat = null, tuerRahmenMat = null;
export function tuerBlatt(mats, t, P) {
  const a = P[t.i], b = P[(t.i + 1) % P.length], f = new Fassade({ pts: P }, a, b);
  const breite = t.u1 - t.u0 - 0.05, hoehe = t.v1 - 0.04;
  tuerGlasMat ??= new THREE.MeshStandardMaterial({ color: 0x5f7079, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  tuerRahmenMat ??= new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.4, metalness: 0.6 });
  const g = new THREE.Group(); g.name = 'tuerblatt';
  // Blatt (dreht um die Angel bei lokal x = 0): Rahmen, Griff, Scheibe; dazu "hinten", eine dunkle Rückwand 0,7 m im Haus, damit man bei
  // geschlossenem Inneren nicht durch das Haus hindurchsieht (kit/interior.js blendet sie aus, sobald das Innere steht)
  const rahmen = [[breite / 2, hoehe - 0.03, 0, breite, 0.06, 0.06], [breite / 2, 0.03, 0, breite, 0.06, 0.06], [0.03, hoehe / 2, 0, 0.06, hoehe, 0.06], [breite - 0.03, hoehe / 2, 0, 0.06, hoehe, 0.06], [breite - 0.12, 1.05, 0.05, 0.03, 0.3, 0.04]];
  const geos = rahmen.map(([x, y, z, sx, sy, sz]) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); return b.toNonIndexed(); });
  const blatt = new THREE.Group(); blatt.name = 'blatt';
  const rahmenMesh = new THREE.Mesh(mergeGeometries(geos, false), tuerRahmenMat); rahmenMesh.castShadow = false;
  const scheibe = new THREE.PlaneGeometry(breite - 0.12, hoehe - 0.12); scheibe.translate(breite / 2, hoehe / 2, 0);
  const fuellung = new THREE.Mesh(scheibe, t.glas ? tuerGlasMat : (mats.holzDunkel || mats.holz)); if (!t.glas) fuellung.material = fuellung.material.clone(), fuellung.material.side = THREE.DoubleSide;
  blatt.add(rahmenMesh, fuellung);
  const hinten = new THREE.Mesh(new THREE.PlaneGeometry(breite + 0.4, hoehe + 0.3).translate(breite / 2, hoehe / 2, -0.7), tuerRahmenMat); hinten.name = 'hinten';
  g.add(blatt, hinten);
  // Angel am linken Rand (u0), Blatt liegt in der Ebene der Scheibe (w = -d)
  const h = f.P(t.u0 + 0.02, 0.02, -t.d);
  g.position.copy(h);
  g.rotation.y = Math.atan2(-f.r.z, f.r.x);   // lokal +x zeigt entlang der Fassade in Richtung u (zur anderen Seite der Öffnung), +z nach außen
  g.userData.tuer = { ...t, breite, hoehe, angel: [h.x, h.z], richtung: [f.r.x, f.r.z], normale: [f.n.x, f.n.z] };
  return g;
}
