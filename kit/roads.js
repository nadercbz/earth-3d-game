// Straßen Baukasten: Kreuzung nach Regelwerk Teil 1 (04_REGELWERK.md).
// Hauptstraße entlang x (2 Spuren je Richtung, Radstreifen), Querstraße entlang z (1 Spur je Richtung, Parkstreifen).
// Rechtsverkehr. Liefert neben dem Bild ein Wegenetz für Fußgänger, Ampelphasen, Baumscheiben und Baufelder.
import * as THREE from 'three';
import { Bau, orient, edgeNormal } from './geo.js';

export const STRASSE = {
  L: 70, spur: 3.25, rad: 1.6, mitte: 0.4, querSpur: 3.4, park: 2.3, radius: 8, bord: 0.15,
  gehwegH: 5.0, gehwegQ: 4.5,
};

export function buildIntersection(mats, opt = {}) {
  const S = { ...STRASSE, ...opt };
  const zc = S.mitte / 2 + 2 * S.spur + S.rad;     // halbe Breite Hauptstraße
  const xc = S.querSpur + S.park;                    // halbe Breite Querstraße
  const R = S.radius, L = S.L, H = S.bord;
  const bau = new Bau();
  const extra = makeExtraMats();

  // Fahrbahn
  bau.face('asphalt', new THREE.Vector3(-L, 0, -L), new THREE.Vector3(L, 0, -L), new THREE.Vector3(L, 0, L), new THREE.Vector3(-L, 0, L), new THREE.Vector3(0, 1, 0));

  // Gehwegblöcke mit runder Ecke und Bordstein
  const bloecke = [], wege = { knoten: [], kanten: [] }, baumScheiben = [], laternen = [], gehwege = [];
  const d = 2.3;                                       // Gehweg Mittellinie ab Bordstein
  const xcw = xc + R + 2.5, zcw = zc + R + 2.5;         // Mitte der Zebrastreifen
  const kn = (x, z, art) => { wege.knoten.push({ x, z, art }); return wege.knoten.length - 1; };
  const quad = {};
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const pts = [[L, zc], [xc + R, zc]];
    for (let k = 1; k < 10; k++) { const a = -Math.PI / 2 - (k / 10) * (Math.PI / 2); pts.push([xc + R + R * Math.cos(a), zc + R + R * Math.sin(a)]); }
    pts.push([xc, zc + R], [xc, L], [L, L]);
    const P = orient(pts.map(([x, z]) => [x * sx, z * sz]));
    bau.poly('gehweg', P, H); gehwege.push(P);
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], n = edgeNormal(a, b);
      bau.face('granit', new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1]), new THREE.Vector3(b[0], H, b[1]), new THREE.Vector3(a[0], H, a[1]), new THREE.Vector3(n[0], 0, n[1]));
      const amRand = Math.abs(Math.abs(a[0]) - L) < 0.01 && Math.abs(Math.abs(b[0]) - L) < 0.01 || Math.abs(Math.abs(a[1]) - L) < 0.01 && Math.abs(Math.abs(b[1]) - L) < 0.01;
      if (!amRand) {
        const w = 0.28, y = H + 0.004;
        bau.face('granit', new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1]), new THREE.Vector3(b[0] - n[0] * w, y, b[1] - n[1] * w), new THREE.Vector3(a[0] - n[0] * w, y, a[1] - n[1] * w), new THREE.Vector3(0, 1, 0));
      }
    }
    // Baufeld hinter dem Gehweg
    const gx = xc + S.gehwegQ, gz = zc + S.gehwegH;
    bloecke.push({ sx, sz, x0: gx * sx, x1: (L - 2) * sx, z0: gz * sz, z1: (L - 2) * sz, ecke: [gx * sx, gz * sz] });
    // Wegenetz auf dem Gehweg
    const ids = [];
    ids.push(kn((L - 3) * sx, (zc + d) * sz, 'ende'));
    ids.push(kn(xcw * sx, (zc + d) * sz, 'zebraH'));
    for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 - (k / 6) * (Math.PI / 2); ids.push(kn((xc + R + (R - d) * Math.cos(a)) * sx, (zc + R + (R - d) * Math.sin(a)) * sz, 'ecke')); }
    ids.push(kn((xc + d) * sx, zcw * sz, 'zebraQ'));
    ids.push(kn((xc + d) * sx, (L - 3) * sz, 'ende'));
    for (let i = 0; i < ids.length - 1; i++) wege.kanten.push([ids[i], ids[i + 1], 'gehweg']);
    quad[`${sx},${sz}`] = { zebraH: ids[1], zebraQ: ids[ids.length - 2] };
    // Baumscheiben und Laternen entlang der Bordsteinkante
    for (let x = xcw + 7; x < L - 4; x += 11) baumScheiben.push([x * sx, (zc + 1.1) * sz]);
    for (let z = zcw + 7; z < L - 4; z += 11) baumScheiben.push([(xc + 1.1) * sx, z * sz]);
    for (let x = xcw + 11.5; x < L - 4; x += 27) laternen.push({ x: x * sx, z: (zc + 0.55) * sz, ry: sz > 0 ? Math.PI : 0 });
    for (let z = zcw + 16; z < L - 4; z += 27) laternen.push({ x: (xc + 0.55) * sx, z: z * sz, ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  // Überwege verbinden die Blöcke, Phase sagt, wann Fußgänger dort Grün haben
  for (const sx of [1, -1]) wege.kanten.push([quad[`${sx},1`].zebraH, quad[`${sx},-1`].zebraH, 'ueberweg', 'Q']);
  for (const sz of [1, -1]) wege.kanten.push([quad[`1,${sz}`].zebraQ, quad[`-1,${sz}`].zebraQ, 'ueberweg', 'H']);

  // Baumscheiben (Granitrand, dunkle Erde)
  for (const [x, z] of baumScheiben) {
    bau.box('erde', x, H - 0.02, z, 1.5, 0.03, 1.5);
    for (const [ox, oz, sx2, sz2] of [[0, -0.72, 1.6, 0.08], [0, 0.72, 1.6, 0.08], [-0.72, 0, 0.08, 1.6], [0.72, 0, 0.08, 1.6]]) bau.box('granit', x + ox, H - 0.02, z + oz, sx2, 0.06, sz2);
  }

  // Markierungen
  const M = (x0, x1, z0, z1, key = 'markierung') => bau.face(key, new THREE.Vector3(x0, 0.012, z0), new THREE.Vector3(x1, 0.012, z0), new THREE.Vector3(x1, 0.012, z1), new THREE.Vector3(x0, 0.012, z1), new THREE.Vector3(0, 1, 0));
  const strich = 0.13;
  for (const sx of [1, -1]) {
    const a0 = xc + R + 5.6, a1 = L;           // Bereich der Hauptstraße hinter Haltelinie
    const span = (u0, u1) => [Math.min(u0 * sx, u1 * sx), Math.max(u0 * sx, u1 * sx)];
    // Doppelte Mittellinie
    for (const z of [-0.2, 0.2 - strich]) { const [x0, x1] = span(a0, a1); M(x0, x1, z, z + strich); }
    // Leitlinien zwischen den Spuren, Radstreifen
    for (const sz of [1, -1]) {
      const zl = sz * (S.mitte / 2 + S.spur);
      for (let u = a0 + 1; u < a1; u += 9) { const [x0, x1] = span(u, Math.min(u + 3, a1)); M(x0, x1, zl - strich / 2, zl + strich / 2); }
      const zr = sz * (zc - S.rad); { const [x0, x1] = span(xc + R, a1); M(x0, x1, zr - 0.13, zr + 0.13); }
      const zr2 = sz * (zc - S.rad / 2); for (let u = xc + R + 14; u < a1 - 3; u += 22) radSymbol(bau, u * sx, zr2, sx);
    }
    // Zebrastreifen über die ganze Fahrbahn
    { const [x0, x1] = span(xc + R + 0.5, xc + R + 4.5); for (let z = -zc + 0.3; z < zc - 0.3; z += 1.0) M(x0, x1, z, z + 0.5); }
    // Haltelinie auf den ankommenden Spuren (rechts der Fahrtrichtung: bei sx = 1 fährt man nach -x, also z < 0)
    { const [x0, x1] = span(xc + R + 5.1, xc + R + 5.6); const zs = -sx; M(x0, x1, Math.min(zs * 0.2, zs * (zc - S.rad)), Math.max(zs * 0.2, zs * (zc - S.rad))); }
    // Pfeile: linke Spur links und geradeaus, rechte Spur geradeaus und rechts
    const zs = -sx, uP = xc + R + 13;
    pfeil(bau, uP * sx, zs * (S.mitte / 2 + S.spur / 2), -sx, 'links');
    pfeil(bau, uP * sx, zs * (S.mitte / 2 + S.spur * 1.5), -sx, 'rechts');
  }
  for (const sz of [1, -1]) {
    const a0 = zc + R + 5.6, a1 = L;
    const span = (u0, u1) => [Math.min(u0 * sz, u1 * sz), Math.max(u0 * sz, u1 * sz)];
    for (let u = a0 + 1; u < a1; u += 6) { const [z0, z1] = span(u, Math.min(u + 3, a1)); M(-strich / 2, strich / 2, z0, z1); }
    for (const sx of [1, -1]) { const xp = sx * S.querSpur; const [z0, z1] = span(zc + R, a1); M(xp - 0.06, xp + 0.06, z0, z1); }
    { const [z0, z1] = span(zc + R + 0.5, zc + R + 4.5); for (let x = -xc + 0.3; x < xc - 0.3; x += 1.0) M(x, x + 0.5, z0, z1); }
    // ankommend bei sz = 1 heißt Fahrt nach -z, rechts davon ist +x
    { const [z0, z1] = span(zc + R + 5.1, zc + R + 5.6); const xs = sz; M(Math.min(0.1 * xs, xs * S.querSpur), Math.max(0.1 * xs, xs * S.querSpur), z0, z1); }
  }

  // Schachtdeckel
  for (const [x, z] of [[18, 3.5], [-26, -4.2], [3, 22], [-1.5, -31], [41, -2]]) {
    bau.geo('metall', new THREE.CylinderGeometry(0.33, 0.33, 0.02, 20), new THREE.Matrix4().makeTranslation(x, 0.01, z));
  }

  // Laternen
  for (const l of laternen) laterne(bau, l.x, H, l.z, l.ry);

  const group = bau.build({ ...mats, ...extra });
  // Ampeln (eigene Meshes, damit die Phasen schalten können)
  const ampeln = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const cx = (xc + R) - (R - 0.9) * Math.SQRT1_2, cz = (zc + R) - (R - 0.9) * Math.SQRT1_2;
    const a = ampel(extra, cx * sx, H, cz * sz, sx, sz);
    group.add(a.obj); ampeln.push(...a.koepfe);
  }
  // Straßennetz für die Fahrzeuge (kit/traffic.js): Mitte mit Ampel, vier Enden am Rand, je Arm eine Kante zur Mitte.
  // Hauptstraße 2 Spuren je Richtung mit Mittelstreifen (Radstreifen außen bleibt frei), Querstraße 1 Spur je Richtung mit Parkstreifen.
  // halt: Haltelinie ab der Mitte (wie die Markierung), gruppe: Ampelgruppe der Ampelsteuerung (H Hauptstraße, Q Querstraße).
  const haltH = xc + R + 5.35, haltQ = zc + R + 5.35;
  const verkehr = {
    knoten: [[0, 0, 'kreuzung', 1], [L, 0, 'rand', 0], [-L, 0, 'rand', 0], [0, L, 'rand', 0], [0, -L, 'rand', 0]],
    kanten: [
      { a: 1, b: 0, p: [[L, 0], [0, 0]], hw: 'primary', rang: 5, vor: 2, zur: 2, lw: S.spur, w: 2 * zc, mitte: S.mitte, randR: S.rad, tempo: 50, einbahn: false, halt: haltH, gruppe: 'H', name: 'Hauptstraße Ost' },
      { a: 2, b: 0, p: [[-L, 0], [0, 0]], hw: 'primary', rang: 5, vor: 2, zur: 2, lw: S.spur, w: 2 * zc, mitte: S.mitte, randR: S.rad, tempo: 50, einbahn: false, halt: haltH, gruppe: 'H', name: 'Hauptstraße West' },
      { a: 3, b: 0, p: [[0, L], [0, 0]], hw: 'residential', rang: 2, vor: 1, zur: 1, lw: S.querSpur, w: 2 * xc, tempo: 30, einbahn: false, parkR: true, parkL: true, halt: haltQ, gruppe: 'Q', name: 'Querstraße Süd' },
      { a: 4, b: 0, p: [[0, -L], [0, 0]], hw: 'residential', rang: 2, vor: 1, zur: 1, lw: S.querSpur, w: 2 * xc, tempo: 30, einbahn: false, parkR: true, parkL: true, halt: haltQ, gruppe: 'Q', name: 'Querstraße Nord' },
    ],
  };
  group.userData = { wege, baumScheiben, bloecke, ampeln, extra, laternen, S, zc, xc, verkehr, gehwege, H };
  return group;
}

function makeExtraMats() {
  const lamp = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 });
  return {
    erde: new THREE.MeshStandardMaterial({ color: 0x4a3d31, roughness: 1 }),
    mast: new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.5, metalness: 0.6 }),
    leuchte: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }),
    rot: lamp(0xff2a1a), gelb: lamp(0xffb21a), gruen: lamp(0x2aff7a),
  };
}

// Fahrradsymbol (vereinfacht: zwei Ringe und Rahmen)
function radSymbol(bau, x, z, dir) {
  const M = new THREE.Matrix4();
  for (const o of [-0.55, 0.55]) {
    const g = new THREE.RingGeometry(0.3, 0.38, 20); g.rotateX(-Math.PI / 2);
    bau.geo('markierung', g, M.makeTranslation(x + o * dir, 0.013, z));
  }
  bau.box('markierung', x, 0.012, z, 1.1, 0.002, 0.09);
}

// Richtungspfeil als flache Form, dir = Fahrtrichtung entlang x (+1 oder -1)
function pfeil(bau, x, z, dir, art) {
  const s = new THREE.Shape();
  s.moveTo(-0.12, -3.0); s.lineTo(0.12, -3.0); s.lineTo(0.12, 0); s.lineTo(0.45, 0); s.lineTo(0, 1.2); s.lineTo(-0.45, 0); s.lineTo(-0.12, 0); s.closePath();
  const geos = [new THREE.ShapeGeometry(s)];
  const seite = new THREE.Shape(), sg = art === 'links' ? 1 : -1;
  seite.moveTo(0, -1.9); seite.lineTo(0, -1.65); seite.lineTo(0.75 * -sg, -1.15); seite.lineTo(0.75 * -sg, -0.75); seite.lineTo(1.35 * -sg, -1.35); seite.lineTo(0.75 * -sg, -1.95); seite.lineTo(0.75 * -sg, -1.55); seite.lineTo(0.0, -2.15); seite.closePath();
  geos.push(new THREE.ShapeGeometry(seite));
  for (const g of geos) {
    g.rotateX(-Math.PI / 2);                    // Form y wird -z
    g.rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);   // Spitze in Fahrtrichtung
    bau.geo('markierung', g, new THREE.Matrix4().makeTranslation(x, 0.013, z));
  }
}

function laterne(bau, x, y, z, ry) {
  const M = new THREE.Matrix4();
  bau.geo('mast', new THREE.CylinderGeometry(0.07, 0.11, 7.2, 10), M.makeTranslation(x, y + 3.6, z));
  const dx = Math.sin(ry) * 1.3, dz = Math.cos(ry) * 1.3;
  bau.box('mast', x + dx * 0.5, y + 7.0, z + dz * 0.5, 0.08, 0.08, 1.3, ry);
  bau.box('mast', x + dx, y + 6.86, z + dz, 0.32, 0.16, 0.7, ry);
  bau.box('leuchte', x + dx, y + 6.83, z + dz, 0.26, 0.03, 0.6, ry);
}

// Ampelmast mit zwei Köpfen: einer für die Hauptstraße, einer für die Querstraße
function ampel(extra, x, y, z, sx, sz) {
  const obj = new THREE.Group(); obj.position.set(x, y, z);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 4.3, 10), extra.mast); mast.position.y = 2.15; mast.castShadow = true; obj.add(mast);
  const koepfe = [];
  // Kopf H schaut zur ankommenden Hauptstraßenspur (von +x kommend bei sx = 1 also Blick nach +x)
  for (const [richtung, rot] of [['H', sx > 0 ? Math.PI / 2 : -Math.PI / 2], ['Q', sz > 0 ? 0 : Math.PI]]) {
    const k = new THREE.Group(); k.rotation.y = rot; k.position.y = richtung === 'H' ? 3.15 : 2.15;
    const gehaeuse = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.98, 0.26), extra.mast); gehaeuse.castShadow = true; k.add(gehaeuse);
    const lichter = {};
    [['rot', 0.31], ['gelb', 0], ['gruen', -0.31]].forEach(([farbe, yy]) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), extra[farbe].clone()); m.position.set(0, yy, 0.135); k.add(m); lichter[farbe] = m.material;
    });
    obj.add(k); koepfe.push({ richtung, lichter });
  }
  return { obj, koepfe };
}

// Ampelphasen: H grün (Autos auf der Hauptstraße, Fußgänger über die Querstraße), dann gelb, dann Q grün
export class Ampelsteuerung {
  constructor(koepfe) { this.koepfe = koepfe; this.t = 0; this.zyklus = [['H', 'gruen', 18], ['H', 'gelb', 3], ['alle', 'rot', 2], ['Q', 'gruen', 14], ['Q', 'gelb', 3], ['alle', 'rot', 2]]; this.lang = this.zyklus.reduce((s, p) => s + p[2], 0); }
  phase() {
    let t = this.t % this.lang;
    for (const p of this.zyklus) { if (t < p[2]) return p; t -= p[2]; }
    return this.zyklus[0];
  }
  // Überweg der Art 'Q' führt über die Hauptstraße und läuft mit der Phase der Querstraße (und umgekehrt)
  fussgaengerGruen(art) { const [r, f] = this.phase(); return f === 'gruen' && r === art; }
  update(dt) {
    this.t += dt;
    const [r, f] = this.phase();
    for (const k of this.koepfe) {
      const farbe = r === 'alle' ? 'rot' : (k.richtung === r ? f : 'rot');
      for (const n of ['rot', 'gelb', 'gruen']) k.lichter[n].emissiveIntensity = n === farbe ? 3.2 : 0;
    }
  }
}
