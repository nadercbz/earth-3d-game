// Neue Gebäudemodelle (05.11.2026, Nader: "auch viel mehr modelle der gebäude etc erstellen", "so wird wie GTA6"): Gründerzeit mit Erkern, moderner Wohnbau, Nachkriegsblock,
// Einfamilienhaus, Fachwerk, Reihenhaus, Halle, Supermarkt, Parkhaus, Kirche, Moschee, Tempel, Schule, Krankenhaus, Hotel, Art Deco Hochhaus, moderne Glastürme, Betonturm,
// Shophouse, Favela, Bahnhofshalle, Tankstelle, Museum. Alle Maße in Metern, aus jedem Grundriss, gleiche Regeln wie kit/buildings.js und kit/stile.js. Galerie: Dashboard Baustile.
import * as THREE from 'three';
import { registriereTyp, Fassade, profilRing, dach, dachTechnik, teilung, laeden, lobby } from './buildings.js';
import { offsetRing } from './geo.js';
import { STILE, mitBudget, dreieck, flaeche, wand, laibung, bogenUmriss, oeffnung, stab, zylinder, kugel, rahmen, frontKante, vereinfache, satteldach, walmdach, vordach, klimageraet, kiste, quadrat, schornstein, schild, fensterlaeden, clamp, wahl, achsen, schalter, rechteckU, kanten } from './stile.js';

const UP = new THREE.Vector3(0, 1, 0), V = (x, y, z) => new THREE.Vector3(x, y, z), M = new THREE.Matrix4();
const stil = (name, fn, info) => registriereTyp(name, mitBudget(fn), info);
export const PUTZ_TOENE = ['fa0', 'fa1', 'fa2', 'fa3', 'fa4', 'fa5', 'fa6', 'fa7', 'fa8', 'fa9', 'fa10', 'fa11'];
const xz = (f, u, w = 0) => { const p = f.P(u, 0, w); return [p.x, p.z]; };
// Dreieck oben auf einem Fenster (Giebelverdachung), mit Tiefe
function giebelchen(f, key, u0, u1, y, h, t) {
  const m = (u0 + u1) / 2;
  flaeche(f, key, [[u0, y], [u1, y], [m, y + h]], [], t);
  const a = f.P(u0, y, t), b = f.P(u1, y, t), c = f.P(m, y + h, t), a0 = f.P(u0, y, 0), b0 = f.P(u1, y, 0), c0 = f.P(m, y + h, 0);
  f.bau.face(key, a0, a, c, c0, f.r.clone().negate().add(UP)); f.bau.face(key, b0, b, c, c0, f.r.clone().add(UP));
}
// Balkon mit Stabgeländer oder Glas
function balkon(f, u0, u1, v, tiefe, s = {}, leicht = false) {
  const P = s.platte || 'stein', G = s.gelaender || 'rahmenDunkel', hoch = s.hoch ?? 1.05;
  f.box(P, u0, u1, v - 0.18, v, 0, tiefe);
  if (s.glas || leicht) f.wall('glasGelaender', u0, u1, v, v + hoch, tiefe - 0.03, false);
  else if (f.bau.spar) f.gitter(u0, u1, v, v + hoch, tiefe - 0.03);
  else for (let x = u0 + 0.06; x < u1; x += 0.13) f.leiste(G, x - 0.01, x + 0.01, v, v + hoch, tiefe - 0.05, tiefe - 0.02);
  f.box(G, u0, u1, v + hoch - 0.04, v + hoch, tiefe - 0.07, tiefe);
  for (const x of [u0, u1 - 0.03]) f.box(G, x, x + 0.03, v, v + hoch, 0.02, tiefe);
}
// Fensterband eines Geschosses: Wandband plus Fenster, ax: Mitten, b: Breite, liefert die Öffnungen
function reihe(f, W, y0, y1, ax, b, vU, vO, st, wdh = null) {
  const ops = ax.map((m, j) => { const bb = wdh ? wdh(j, b) : b; return { u0: m - bb / 2, u1: m + bb / 2, v0: y0 + vU, v1: y0 + vO }; }).filter(o => o.u1 - o.u0 > 0.05);
  f.band(W, y0, y1, ops); ops.forEach(o => f.fenster(o, st)); return ops;
}
// Erker: Vorbau über mehrere Geschosse mit Fenstern auf drei Seiten, Konsole unten, Abschluss oben
function erker(f, m, v0, n, fH, b, t, W, D, leicht) {
  const u0 = m - b / 2, u1 = m + b / 2, q = [xz(f, u1), xz(f, u1, t), xz(f, u0, t), xz(f, u0)], v1 = v0 + n * fH;
  f.box(D, u0 - 0.06, u1 + 0.06, v0 - 0.32, v0, 0, t * 0.55);
  for (let i = 0; i < 3; i++) {
    const g = new Fassade(f.bau, q[i], q[i + 1]), ax = i === 1 ? achsen(g.L, 1.5, 0.25) : [g.L / 2], br = i === 1 ? 1.05 : Math.min(0.55, g.L * 0.6);
    for (let k = 0; k < n; k++) { const vv = v0 + k * fH; reihe(g, W, vv, vv + fH, ax, br, 0.85, 2.75, { tiefe: 0.14, laibung: W, kaempfer: true, ohneRahmen: leicht, bank: !leicht, bankKey: D }); if (!leicht && k > 0) g.box(D, 0, g.L, vv - 0.05, vv + 0.07, 0, 0.05); }
  }
  f.box(D, u0 - 0.1, u1 + 0.1, v1, v1 + 0.16, 0, t + 0.1);
}
// Dachgauben auf einer Dachfläche, geneigt nach hinten, Fenster mit kleinem Satteldach
function gaube(f, m, v0, w, W, DK) {
  const u0 = m - 0.55, u1 = m + 0.55, v1 = v0 + 1.45;
  f.box(W, u0 - 0.1, u1 + 0.1, v0, v1, w - 1.3, w, { oben: true });
  f.wall('glas', u0, u1, v0 + 0.15, v1 - 0.12, w + 0.01, false);
  f.box('rahmen', u0, u1, v0 + 0.15, v0 + 0.2, w, w + 0.04); f.box('rahmen', u0, u1, v1 - 0.17, v1 - 0.12, w, w + 0.04); f.box('rahmen', (u0 + u1) / 2 - 0.025, (u0 + u1) / 2 + 0.025, v0 + 0.15, v1 - 0.12, w, w + 0.03);
  f.box(DK, u0 - 0.22, u1 + 0.22, v1, v1 + 0.1, w - 1.4, w + 0.14);
}
// Mansarddach rundherum mit Gauben: zwei Neigungen, oben flach
function mansard(bau, pts, top, W, DK, R, leicht) {
  const md = 1.5, mh = 3.3;
  profilRing(bau, DK, pts, [[0.15, 0.1], [-md, mh], [-md - 0.2, mh + 0.15]], top);
  const innen = offsetRing(pts, -md - 0.2); bau.poly('dach', innen, top + mh + 0.15);
  if (!leicht) kanten(bau, pts).forEach(f => achsen(f.L, 2.7, 1.2).forEach((m, j) => { if (j % 2 === 0) gaube(f, m, top + 0.55, -0.6, W, DK); }));
  dachTechnik(bau, offsetRing(innen, -0.3), top + mh + 0.15, R, { viel: 0.4 });
  return top + mh;
}
// Steildach nur auf einfachen Grundrissen: sonst Flachdach (zerklüftete Umrisse ergaben schiefe Dachflächen und Überstände)
const einfach = pts => { const r = rahmen(pts); let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return pts.length <= 8 && Math.abs(a / 2) > r.L * r.B * 0.8; };
const dachText = (key, extra = {}) => ({ key, neigung: 0.72, ueberstand: 0.45, ortgang: 0.28, dicke: 0.16, first: 'rahmenDunkel', firstBreite: 0.22, firstHoehe: 0.12, traufe: 'lack', ortgangKey: 'lack', ...extra });

// ---------- Wohnen und Stadt ----------
stil('gruenderzeit', (bau, pts, H, R, v, o) => {
  const W = wahl(R, PUTZ_TOENE), D = wahl(R, ['stein', 'lack', 'stein']), SO = wahl(R, ['sandstein', 'steinBlock', 'steinGelb', 'granit']), DK = wahl(R, ['dachSchiefer', 'schiefer', 'dachGrau']);
  const gH = 4.5, fH = 3.55, N = Math.max(1, Math.round((H - gH) / fH)), top = gH + N * fH, fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    if (o.ohneLaden) f.wall(SO, 0, f.L, 0, gH); else laeden(f, gH, R, { sockel: SO, markisen: 0.35, schild: R() < 0.3 });
    if (!o.leicht) for (let y = 0.9; y < gH - 1.1; y += 0.72) if (o.ohneLaden) f.box(SO, 0, f.L, y, y + 0.05, -0.02, 0.012);   // Rustika Fugen
    const ax = achsen(f.L, 2.7, 0.9), m0 = Math.floor(ax.length / 2), mitErker = i === fi && f.L >= 11 && N >= 3 && R() < 0.75;
    const erkerAchse = mitErker ? [m0] : [];
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, oben = k === N - 1, vO = oben ? 2.55 : k === 0 ? 3.0 : 2.85;
      const liste = ax.filter((_, j) => !(erkerAchse.includes(j) && k < N - 1));
      const ops = reihe(f, W, vv, vv + fH, liste, 1.24, 0.9, vO, { tiefe: 0.26, laibung: W, sprossen: true, kaempfer: true, bank: !o.leicht, bankKey: D, faschen: o.leicht ? null : D, ohneRahmen: o.leicht });
      if (!o.leicht) {
        ops.forEach(op => { if (k === 0) giebelchen(f, D, op.u0 - 0.2, op.u1 + 0.2, op.v1 + 0.14, 0.42, 0.12); else if (k === 1) f.box(D, op.u0 - 0.2, op.u1 + 0.2, op.v1 + 0.14, op.v1 + 0.28, 0, 0.13); });
        f.box(D, 0, f.L, vv - 0.07, vv + 0.08, 0, 0.08);
        if (k === 0 && ax.length >= 3 && !mitErker) balkon(f, ax[m0] - 1.25, ax[m0] + 1.25, vv + 0.88, 1.0, { platte: D });
      }
    }
    if (mitErker) erker(f, ax[m0], gH + 0.5, N - 1, fH, 3.1, 0.9, W, D, o.leicht);
    if (!o.leicht && f.L > 8) { f.box(D, 0, 0.5, gH, top, 0, 0.05); f.box(D, f.L - 0.5, f.L, gH, top, 0, 0.05); }   // Eckquader
  });
  profilRing(bau, D, pts, [[0, 0], [0.1, 0.08], [0.1, 0.2], [0, 0.3]], gH - 0.15);
  profilRing(bau, D, pts, [[0, 0], [0.12, 0.1], [0.12, 0.22], [0.42, 0.46], [0.5, 0.64], [0, 0.64]], top - 0.5);
  const t2 = mansard(bau, pts, top, W, DK, R, o.leicht);
  return { floors: N + 2, top: t2 };
}, 'Gründerzeithaus mit Stuck, Erker und Mansarddach');

stil('neubau', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['stuckWeiss', 'putzBeige', 'betonPlatte', 'ziegelHell', 'fa7', 'fa3', 'fa1', 'putzRau']), A = wahl(R, ['ziegelRot', 'holzWand', 'betonWand', 'betonPlatte', 'fa9', 'fa5', 'granit']);
  const gH = o.laeden ? 4.2 : 3.4, fH = 3.05, N0 = Math.max(1, Math.round((H - gH) / fH)), staffel = N0 >= 4 && R() < 0.7, N = staffel ? N0 - 1 : N0, top = gH + N * fH;
  const balkone = R() < 0.75, rhythmus = 2 + Math.floor(R() * 2), glas = R() < 0.6;
  kanten(bau, pts).forEach((f, i) => {
    if (o.ohneLaden) f.wall(A, 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: A, ladenRahmen: 'rahmenDunkel', markisen: 0.12, schild: R() < 0.5 }); else lobby(f, gH, 0.6, A, 'glas', pts, i);
    const ax = achsen(f.L, 3.1, 0.7);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH;
      const ops = reihe(f, W, vv, vv + fH, ax, 1, 0.12, 2.62, { tiefe: 0.16, laibung: W, rahmen: 'rahmenDunkel', rahmenBreite: 0.05, ohneRahmen: o.leicht, kaempfer: false }, (j) => j % rhythmus === 0 ? 1.9 : 1.05);
      if (balkone && f.L > 7 && !o.leicht) ops.forEach((op, j) => { if (j % rhythmus === 0) balkon(f, op.u0 - 0.3, op.u1 + 0.3, vv + 0.12, 1.3, { platte: 'beton', glas, hoch: 1.0 }); });
      if (!o.leicht) ops.forEach((op, j) => { if (j % rhythmus === 1) f.box(A, op.u1 + 0.04, op.u1 + 0.5, vv + 0.12, vv + 2.62, 0, 0.03); });
    }
    f.box('beton', 0, f.L, gH - 0.2, gH, 0, 0.06);
  });
  let dachH = top;
  if (staffel) {
    const inn = offsetRing(pts, -1.9); profilRing(bau, 'beton', pts, [[0, 0], [0, 0.3]], top); bau.poly('dach', pts, top + 0.02);
    kanten(bau, pts).forEach(f => { if (o.leicht) f.wall('glasGelaender', 0, f.L, top + 0.3, top + 1.2, -0.05, false); else { f.wall('glasGelaender', 0, f.L, top + 0.3, top + 1.2, -0.05, false); f.box('rahmenDunkel', 0, f.L, top + 1.18, top + 1.22, -0.08, -0.02); } });
    kanten(bau, inn).forEach(f => reihe(f, 'stuckWeiss', top, top + fH, achsen(f.L, 2.4, 0.5), 1.8, 0.1, 2.65, { tiefe: 0.1, laibung: 'stuckWeiss', ohneRahmen: o.leicht }));
    dachH = top + fH; dachTechnik(bau, dach(bau, inn, dachH, 'stuckWeiss', 0.4, 0.25), dachH, R, { viel: 0.7, solar: true });
  } else dachTechnik(bau, dach(bau, pts, top, W, 0.7, 0.3, 'beton'), top, R, { viel: 0.9, solar: R() < 0.7 });
  return { floors: N0 + 1, top: dachH };
}, 'Moderner Wohnbau mit großen Fenstern, Balkonen und Staffelgeschoss');

stil('nachkrieg', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['fa0', 'fa1', 'fa4', 'fa5', 'fa8', 'fa10', 'putzGrau', 'putzRau']), B = wahl(R, ['fa2', 'fa6', 'fa9', 'beton', 'weiss']);
  const so = o.laeden ? 3.8 : 0.9, fH = 2.85, N = Math.max(1, Math.round((H - so) / fH)), top = so + N * fH, schraeg = R() < 0.45 && einfach(vereinfache(pts));
  kanten(bau, pts).forEach((f, i) => {
    if (o.laeden) laeden(f, so, R, { sockel: 'putzGrau', markisen: 0.25, schild: true }); else f.wall('putzGrau', 0, f.L, 0, so);
    const ax = achsen(f.L, 2.5, 0.8), vorn = i === frontKante(pts);
    for (let k = 0; k < N; k++) {
      const vv = so + k * fH;
      const ops = reihe(f, W, vv, vv + fH, ax, 1.3, 0.85, 2.3, { tiefe: 0.14, laibung: W, kaempfer: !o.leicht, bank: !o.leicht, ohneRahmen: o.leicht, rahmen: 'rahmen' });
      if (vorn && ax.length >= 4 && !o.leicht) { const j0 = 1 + (ax.length % 2); ops.forEach((op, j) => { if ((j + j0) % 3 === 0) { f.box('beton', op.u0 - 0.4, op.u1 + 0.4, vv + 0.08, vv + 0.26, 0, 1.15); f.box(B, op.u0 - 0.4, op.u1 + 0.4, vv + 0.26, vv + 1.2, 1.1, 1.15); for (const x of [op.u0 - 0.4, op.u1 + 0.35]) f.box(B, x, x + 0.05, vv + 0.26, vv + 1.2, 0.02, 1.1); } }); }
    }
  });
  if (schraeg) { walmdach(bau, pts, top, dachText(wahl(R, ['dachGrau', 'dachZiegel']), { neigung: 0.32, ueberstand: 0.4 })); kanten(bau, pts).forEach(f => f.wall(W, 0, f.L, top, top + 0.1)); }
  else dachTechnik(bau, dach(bau, pts, top, W, 0.45, 0.25, 'technik'), top, R, { viel: 0.5 });
  return { floors: N + 1, top: top + (schraeg ? 2 : 0.5) };
}, 'Nachkriegsblock mit schlichtem Putz, einfachen Fenstern und Loggien');

stil('efh', (bau, pts0, H, R, v, o) => {
  const op = schalter(v), pts = vereinfache(pts0), W = wahl(R, op.has('sued') ? ['fa2', 'fa3', 'fa6', 'fa8', 'stuckWeiss'] : ['stuckWeiss', 'fa0', 'fa1', 'fa4', 'fa7', 'putzRau', 'ziegelHell', 'holzWand']);
  const so = 0.45, fH = 2.75, N = H > 6.4 ? 2 : 1, wt = so + N * fH, fi = frontKante(pts), mitLaden = op.has('sued') || R() < 0.25, LA = wahl(R, ['ladenGruen', 'blauTuer', 'ladenSchwarz', 'holzRot']);
  const DK = wahl(R, op.has('sued') ? ['dachKeramik', 'dachZiegel'] : ['dachZiegel', 'dachZiegel', 'dachSchiefer', 'dachGrau', 'dachKeramik']);
  kanten(bau, pts).forEach((f, i) => {
    f.box('beton', -0.02, f.L + 0.02, 0, so, 0, 0.04);
    const ax = achsen(f.L, 2.9, 0.9), m0 = Math.floor(ax.length / 2), vorn = i === fi;
    for (let k = 0; k < N; k++) {
      const vv = so + k * fH, ops = [], tuer = vorn && k === 0;
      ax.forEach((m, j) => { if (!vorn && R() < 0.3) return; if (tuer && j === m0) { ops.push({ u0: m - 0.5, u1: m + 0.5, v0: so + 0.02, v1: so + 2.15, tuer: true }); return; } ops.push({ u0: m - 0.6, u1: m + 0.6, v0: vv + 0.8, v1: vv + 2.2 }); });
      f.band(W, vv, vv + fH, ops);
      ops.forEach(o2 => { f.fenster(o2, { tiefe: 0.16, laibung: W, sprossen: !o2.tuer && !o.leicht, kaempfer: !o2.tuer && !o.leicht, bank: !o2.tuer && !o.leicht, ohneRahmen: o.leicht, rahmen: 'rahmen' }); if (o2.tuer) f.wall(wahl(R, ['holzRot', 'blauTuer', 'gruenTuer', 'ladenSchwarz']), o2.u0, o2.u1, o2.v0, o2.v1, -0.14, false); else if (mitLaden && !o.leicht) fensterlaeden(f, o2, LA, false); });
      if (tuer && ax.length && !o.leicht) { const m = ax[m0]; f.box('beton', m - 0.8, m + 0.8, so - 0.3, so - 0.12, 0, 0.9); f.box('beton', m - 0.95, m + 0.95, 0, so - 0.3, 0, 1.25); f.box('technikDunkel', m - 0.9, m + 0.9, so + 2.35, so + 2.45, 0, 1.0); }
    }
  });
  if (!einfach(pts)) { const k = dach(bau, pts, wt, W, 0.5, 0.2, 'lack'); dachTechnik(bau, k, wt, R, { viel: 0.3 }); return { floors: N + 1, top: wt + 0.5 }; }
  const d = satteldach(bau, pts, wt, dachText(DK, { neigung: op.has('sued') ? 0.42 : 0.72, richtung: R() < 0.7 ? 'front' : 'tiefe', wand: W, giebelKey: W, unterseite: 'lack',
    giebelLoch: (f, y0, yR) => (yR - y0 > 2.2 && f.L > 3) ? [[[f.L / 2 - 0.45, y0 + 0.4], [f.L / 2 + 0.45, y0 + 0.4], [f.L / 2 + 0.45, y0 + 1.5], [f.L / 2 - 0.45, y0 + 1.5]]] : [],
    giebelDeko: (f, y0, yR) => { if (yR - y0 > 2.2 && f.L > 3) { const u0 = f.L / 2 - 0.45, u1 = f.L / 2 + 0.45; laibung(f, W, rechteckU({ u0, u1, v0: y0 + 0.4, v1: y0 + 1.5 }), 0.1); f.wall('glas', u0, u1, y0 + 0.4, y0 + 1.5, -0.09, false); } } }));
  const r = rahmen(pts), c = r.W((r.u0 + r.u1) / 2 + r.L * 0.2 * (R() < 0.5 ? 1 : -1), (r.t0 + r.t1) / 2 + r.B * 0.12);
  schornstein(bau, c[0], c[1], r.ax, wt, (d.yF ?? wt + 2) + 0.7, wahl(R, ['ziegelRot', 'ziegel']));
  return { floors: N + 1, top: d.yF ?? wt + 2 };
}, 'Einfamilienhaus mit Satteldach, Schornstein und Fensterläden');

stil('fachwerk', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), W = wahl(R, ['fa0', 'stuckWeiss', 'fa8', 'fa1']), B = wahl(R, ['holzDunkel', 'holzRot', 'holzDunkel']), so = 0.5, fH = 2.7, N = Math.max(1, Math.round((H - so) / fH) - 0), wt = so + N * fH;
  kanten(bau, pts).forEach((f, i) => {
    f.box('steinBlock', -0.02, f.L + 0.02, 0, so, 0, 0.05);
    const ax = achsen(f.L, 2.4, 0.7), vorn = i === frontKante(pts);
    for (let k = 0; k < N; k++) {
      const vv = so + k * fH, ops = [], t = k > 0 ? 0.04 : 0;
      ax.forEach((m, j) => ops.push(vorn && k === 0 && j === Math.floor(ax.length / 2) ? { u0: m - 0.5, u1: m + 0.5, v0: so + 0.02, v1: so + 2.1, tuer: true } : { u0: m - 0.45, u1: m + 0.45, v0: vv + 0.85, v1: vv + 2.1 }));
      f.band(W, vv, vv + fH, ops); ops.forEach(o2 => { f.fenster(o2, { tiefe: 0.1, laibung: W, sprossen: !o2.tuer && !o.leicht, kaempfer: !o2.tuer && !o.leicht, ohneRahmen: o.leicht, rahmen: 'rahmen' }); if (o2.tuer) f.wall('holzDunkel', o2.u0, o2.u1, o2.v0, o2.v1, -0.09, false); });
      // Balken: Schwelle, Rähm, Ständer, Streben
      f.box(B, 0, f.L, vv, vv + 0.2, 0, 0.06 + t); f.box(B, 0, f.L, vv + fH - 0.2, vv + fH, 0, 0.06 + t);
      if (!o.leicht) {
        f.box(B, 0, f.L, vv + 0.72, vv + 0.82, 0, 0.05); f.box(B, 0, f.L, vv + 2.14, vv + 2.22, 0, 0.05);
        teilung(f.L, 1.2).forEach(u => { if (!ops.some(p => u > p.u0 - 0.05 && u < p.u1 + 0.05)) f.box(B, u - 0.09, u + 0.09, vv + 0.2, vv + fH - 0.2, 0, 0.05); });
        ax.forEach((m, j) => { if (j % 2) return; const a = m + 0.62, b = Math.min(f.L, m + 1.15); stab(f.bau, B, f.P(a, vv + 0.2, 0.03), f.P(b, vv + 0.72, 0.03), 0.1, 0.05, 0.5); stab(f.bau, B, f.P(b, vv + 0.2, 0.03), f.P(a, vv + 0.72, 0.03), 0.1, 0.05, 0.5); });
      }
    }
    f.box(B, 0, 0.2, so, wt, 0, 0.07); f.box(B, f.L - 0.2, f.L, so, wt, 0, 0.07);
  });
  if (!einfach(pts)) { dach(bau, pts, wt, W, 0.5, 0.2, B); return { floors: N + 1, top: wt + 0.5 }; }
  const d = satteldach(bau, pts, wt, dachText(wahl(R, ['dachZiegel', 'dachKeramik']), { neigung: 0.92, ueberstand: 0.55, ortgang: 0.35, richtung: R() < 0.5 ? 'front' : 'tiefe', wand: W, giebelKey: W, traufe: B, ortgangKey: B, unterseite: B,
    giebelDeko: (f, y0, yR) => { stab(f.bau, B, f.P(f.L / 2, y0, 0.04), f.P(f.L / 2, yR - 0.1, 0.04), 0.14, 0.06, 0.5); if (!o.leicht) { stab(f.bau, B, f.P(0.3, y0 + 0.1, 0.04), f.P(f.L / 2, y0 + (yR - y0) * 0.6, 0.04), 0.1, 0.05, 0.5); stab(f.bau, B, f.P(f.L - 0.3, y0 + 0.1, 0.04), f.P(f.L / 2, y0 + (yR - y0) * 0.6, 0.04), 0.1, 0.05, 0.5); } } }));
  return { floors: N + 1, top: d.yF ?? wt + 3 };
}, 'Fachwerkhaus mit Balken, Streben und steilem Ziegeldach');

stil('reihenhaus', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), W = wahl(R, ['ziegelRot', 'ziegelAlt', 'ziegelHell', 'ziegel']), so = 0.4, fH = 2.95, N = Math.max(1, Math.round((H - so - 1.5) / fH)), wt = so + N * fH, TK = ['holzRot', 'blauTuer', 'gruenTuer', 'ladenSchwarz', 'bluete'];
  const fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    const vorn = i === fi;
    if (vorn && f.L >= 4.8) {
      const nE = Math.max(1, Math.round(f.L / 5.4)), bE = f.L / nE;
      for (let e = 0; e < nE; e++) {
        const u0 = e * bE, u1 = u0 + bE, mT = u0 + 0.9, mF = u0 + bE * 0.64;
        for (let k = 0; k < N; k++) {
          const vv = so + k * fH, ops = k === 0 ? [{ u0: mT - 0.5, u1: mT + 0.5, v0: so + 0.02, v1: so + 2.2, tuer: true }, { u0: mF - 0.95, u1: mF + 0.95, v0: vv + 0.75, v1: vv + 2.4 }] : [{ u0: mF - 1.0, u1: mF - 0.1, v0: vv + 0.8, v1: vv + 2.45 }, { u0: mF + 0.1, u1: mF + 1.0, v0: vv + 0.8, v1: vv + 2.45 }];
          f.band(W, vv, vv + fH, ops, 0, u0, u1); ops.forEach(o2 => { f.fenster(o2, { tiefe: 0.14, laibung: W, kaempfer: !o.leicht, sprossen: !o2.tuer && !o.leicht, sturz: !o.leicht, bank: !o2.tuer && !o.leicht, bankKey: 'lack', ohneRahmen: o.leicht, rahmen: 'lack' }); if (o2.tuer) f.wall(wahl(R, TK), o2.u0, o2.u1, o2.v0, o2.v1, -0.13, false); });
        }
        f.box('lack', u0, u1, 0, so, 0, 0.03);
        if (!o.leicht) { f.box('beton', mT - 0.75, mT + 0.75, 0, so * 0.5, 0, 0.8); f.box('beton', mT - 0.75, mT + 0.75, so * 0.5, so - 0.02, 0, 0.45); f.box('lack', mT - 0.72, mT + 0.72, so + 2.3, so + 2.42, 0, 0.26); }
      }
    } else { const ax = achsen(f.L, 3.2, 1); for (let k = 0; k < N; k++) { const vv = so + k * fH; reihe(f, W, vv, vv + fH, ax, 0.95, 0.85, 2.4, { tiefe: 0.14, laibung: W, ohneRahmen: o.leicht, rahmen: 'lack', kaempfer: !o.leicht }); } f.box('beton', 0, f.L, 0, so, 0, 0.03); }
  });
  if (!einfach(pts)) { dach(bau, pts, wt, W, 0.5, 0.2, 'lack'); return { floors: N + 1, top: wt + 0.5 }; }
  const d = satteldach(bau, pts, wt, dachText(wahl(R, ['dachSchiefer', 'dachSchiefer', 'dachZiegel']), { neigung: 0.68, ueberstand: 0.25, ortgang: 0.08, richtung: 'front', wand: W, giebelKey: W, traufe: 'lack', ortgangKey: W, unterseite: 'lack' }));
  const r = rahmen(pts), tm = (r.t0 + r.t1) / 2, nS = Math.max(1, Math.round(r.L / 11));
  for (let i = 0; i <= nS; i++) { const c = r.W(r.u0 + (i + 0.0001) * r.L / Math.max(1, nS), tm); schornstein(bau, clamp(c[0], c[0], c[0]), c[1], r.ax, wt, (d.yF ?? wt + 2) + 0.9, W, 0.7, 0.35); }
  return { floors: N + 1, top: d.yF ?? wt + 2 };
}, 'Reihenhäuser aus Backstein mit Stufen, bunten Türen und Schornsteinen');

// ---------- Gewerbe ----------
stil('halle', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), W = wahl(R, ['wellblech', 'wellblechBlau', 'wellblechRot', 'wellblechWeiss', 'betonPlatte']), top = Math.max(5.5, H), so = 1.0, fi = frontKante(pts), r = rahmen(pts);
  kanten(bau, pts).forEach((f, i) => {
    f.box('betonWand', 0, f.L, 0, so, 0, 0.02);
    const tore = i === fi || (i === (fi + 2) % pts.length && R() < 0.5), ops = [];
    if (tore) { const n = Math.max(1, Math.floor(f.L / 11)); for (let k = 0; k < n; k++) { const m = (k + 0.5) * f.L / n; ops.push({ u0: m - 2.2, u1: m + 2.2, v0: 0.02, v1: Math.min(top - 1.4, 4.6) }); } }
    f.band(W, 0, top, ops);
    ops.forEach(p => { laibung(f, 'technikDunkel', rechteckU(p), 0.12, 0, true); f.wall('tor', p.u0, p.u1, p.v0, p.v1, -0.11, false); f.box('metall', p.u0 - 0.15, p.u1 + 0.15, p.v1, p.v1 + 0.25, 0, 0.12); if (!o.leicht) { f.box('gelb', p.u0 - 0.5, p.u0 - 0.2, 0, 1.1, 0.05, 0.3); f.box('gelb', p.u1 + 0.2, p.u1 + 0.5, 0, 1.1, 0.05, 0.3); } });
    if (!o.leicht && top > 7 && f.L > 6) f.wall('glasHell', 0.6, f.L - 0.6, top - 1.7, top - 0.7, 0.03, false);
    f.box('technikDunkel', 0, f.L, top - 0.18, top, 0, 0.1);
    if (!o.leicht && i === fi && R() < 0.8) schild(bau, wahl(R, ['schildBlau', 'schildRot', 'schildWeiss', 'schildGruen']), f, f.L * 0.35, f.L * 0.65, top - 1.5, top - 0.5, 0.03, 0.08, true);
  });
  // Sheddach über großen Rechtecken, sonst Flachdach
  if (r.rechteck && r.L > 22 && r.B > 12 && R() < 0.65) {
    bau.poly('dach', pts, top + 0.02);
    const n = Math.floor(r.L / 7.5), sh = 2.2;
    for (let k = 0; k < n; k++) {
      const a = r.u0 + k * r.L / n + 0.1, b = a + r.L / n - 0.2;
      const A0 = r.W(a, r.t0 + 0.3), A1 = r.W(a, r.t1 - 0.3), B0 = r.W(b, r.t0 + 0.3), B1 = r.W(b, r.t1 - 0.3), y1 = top + sh;
      const p = (q, y) => V(q[0], y, q[1]);
      bau.face('wellblechWeiss', p(A0, y1), p(A1, y1), p(B1, top), p(B0, top), V(r.ax[0] * sh, r.L / n, r.ax[1] * sh));
      bau.face('glasHell', p(A0, top), p(A1, top), p(A1, y1), p(A0, y1), V(-r.ax[0], 0, -r.ax[1]));
      for (const [Q, W2] of [[[A0, B0], r.az], [[A1, B1], [-r.az[0], -r.az[1]]]]) dreieck(bau, 'technik', p(Q[0], top), p(Q[1], top), p(Q[0], y1), V(-W2[0], 0, -W2[1]));
    }
    return { floors: 1, top: top + sh };
  }
  dachTechnik(bau, dach(bau, pts, top, W, 0.5, 0.2, 'technikDunkel'), top, R, { viel: 1.6, solar: R() < 0.5 });
  return { floors: 1, top };
}, 'Gewerbehalle aus Wellblech mit Rolltoren, Rammschutz und Sheddach');

stil('markt', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), top = Math.max(5, Math.min(H, 8)), W = wahl(R, ['stuckWeiss', 'betonPlatte', 'wellblechWeiss', 'fa7']), S = wahl(R, ['schildRot', 'schildBlau', 'schildGelb', 'schildGruen']), fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    if (i === fi) {
      const m = f.L / 2, bG = Math.min(f.L - 1.5, Math.max(6, f.L * 0.75)), u0 = m - bG / 2, u1 = m + bG / 2, gO = top - 1.8;
      f.wall(W, 0, u0, 0, top); f.wall(W, u1, f.L, 0, top); f.wall(W, u0, u1, gO, top);
      f.wall('glas', u0, u1, 0.05, gO, -0.12);
      laibung(f, W, rechteckU({ u0, u1, v0: 0.05, v1: gO }), 0.12, 0, true);
      teilung(u1 - u0, 2.4).forEach(x => f.leiste('rahmenDunkel', u0 + x - 0.05, u0 + x + 0.05, 0.05, gO, -0.12, 0.02));
      f.leiste('rahmenDunkel', u0, u1, 2.5, 2.58, -0.12, 0, true);
      f.box('technikDunkel', 0.3, f.L - 0.3, gO + 0.05, gO + 0.3, 0, 2.2);   // Vordach
      for (const u of teilung(f.L - 1, 7)) f.box('rahmenDunkel', 0.5 + u - 0.07, 0.5 + u + 0.07, 0, gO + 0.05, 2.0, 2.14);
      schild(bau, S, f, m - Math.min(bG * 0.4, 7), m + Math.min(bG * 0.4, 7), top - 1.35, top - 0.2, 0.02, 0.1, true);
    } else { f.wall(W, 0, f.L, 0, top); f.box('betonWand', 0, f.L, 0, 0.6, 0, 0.02); }
    f.box('technikDunkel', 0, f.L, top - 0.1, top + 0.1, 0, 0.06);
  });
  dachTechnik(bau, dach(bau, pts, top, W, 0.4, 0.2, 'technikDunkel'), top, R, { viel: 2.5 });
  return { floors: 1, top };
}, 'Supermarkt mit Glasfront, Vordach und Leuchtschild');

stil('parkhaus', (bau, pts, H, R, v, o) => {
  const fH = 2.95, N = Math.max(2, Math.round(H / fH)), top = N * fH, K = wahl(R, ['betonWand', 'betonPlatte', 'sichtbeton']), fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    f.wall('technikDunkel', 0, f.L, 0, top, -2.2, false);
    for (let k = 0; k <= N; k++) { const y = k * fH; f.box(K, 0, f.L, y - 0.55, y + 0.5, 0, 0.14); bau.face('estrich', f.P(0, y - 0.54, -2.2), f.P(f.L, y - 0.54, -2.2), f.P(f.L, y - 0.54, 0), f.P(0, y - 0.54, 0), V(0, -1, 0)); }
    teilung(f.L, 8).forEach(u => f.box(K, Math.max(0, u - 0.35), Math.min(f.L, u + 0.35), 0, top, -0.45, 0.02));
    if (!o.leicht && i === fi) { schild(bau, 'schildBlau', f, f.L * 0.08, f.L * 0.08 + 2.2, top - 1.6, top + 1.4, 0.15, 0.3); }
  });
  const r = rahmen(pts), c = r.W(r.u0 + 3, r.t0 + 3);
  kiste(bau, K, quadrat(c[0], c[1], r.ax, 2.6), 0, top + 3.2);
  dach(bau, pts, top, K, 0.6, 0.25, K);
  return { floors: N, top: top + 3.2 };
}, 'Parkhaus mit offenen Decks, Betonbändern und Treppenturm');

stil('tankstelle', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), top = Math.max(3.6, Math.min(H, 5)), i0 = Math.floor(R() * 4), S = ['schildGelb', 'schildRot', 'schildBlau', 'schildGruen'][i0], F2 = ['gelb', 'farbRot', 'farbBlau', 'farbGruen'][i0], fi = frontKante(pts);
  let fv = null;
  kanten(bau, pts).forEach((f, i) => { if (i === fi) { fv = f; f.wall('stuckWeiss', 0, f.L, top - 0.9, top); f.wall('glas', 0.2, f.L - 0.2, 0.3, top - 0.9, -0.08); f.wall('stuckWeiss', 0, 0.2, 0, top - 0.9); f.wall('stuckWeiss', f.L - 0.2, f.L, 0, top - 0.9); f.wall('technikDunkel', 0.2, f.L - 0.2, 0, 0.3); schild(bau, S, f, 0.4, f.L - 0.4, top - 0.8, top - 0.1, 0.02, 0.08, true); } else f.wall('stuckWeiss', 0, f.L, 0, top); });
  bau.poly('dach', pts, top + 0.02);
  if (fv) {   // Dach über den Säulen, Zapfsäulen darunter
    const b = Math.min(14, fv.L + 3), m = fv.L / 2, w0 = 4, w1 = 11, y = 5.0;
    fv.box('lack', m - b / 2, m + b / 2, y, y + 0.55, w0, w1); fv.box(F2, m - b / 2 - 0.03, m + b / 2 + 0.03, y + 0.55, y + 0.85, w0 - 0.03, w1 + 0.03);
    for (const u of [m - b / 2 + 1.5, m + b / 2 - 1.5]) for (const w of [w0 + 1.6, w1 - 1.6]) fv.box('lack', u - 0.2, u + 0.2, 0, y, w - 0.2, w + 0.2);
    for (const u of [m - 2.6, m + 2.6]) { const w = (w0 + w1) / 2; fv.box('beton', u - 0.8, u + 0.8, 0, 0.14, w - 0.5, w + 0.5); fv.box('stuckWeiss', u - 0.32, u + 0.32, 0.14, 1.75, w - 0.22, w + 0.22); fv.box('technikDunkel', u - 0.26, u + 0.26, 1.1, 1.55, w + 0.2, w + 0.23); }
  }
  return { floors: 1, top: 5.8 };
}, 'Tankstelle mit Shop, Dach auf Säulen und Zapfsäulen');

stil('halleGlas', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), r = rahmen(pts), wandH = clamp(H * 0.55, 6, 16), W = wahl(R, ['ziegelRot', 'steinGelb', 'sandstein', 'ziegelAlt']);
  kanten(bau, pts).forEach(f => {
    const ax = achsen(f.L, 6, 1.5), um = ax.map(m => bogenUmriss(m - 2, m + 2, 1.2, wandH - 3, 'rund', 8));
    wand(f, W, 0, f.L, 0, wandH, um); um.forEach(u => oeffnung(f, u, { tiefe: 0.4, laibung: W, fuellung: 'glasHell', leicht: o.leicht }));
    f.box('stein', 0, f.L, wandH - 0.5, wandH, 0, 0.25); f.box('stein', 0, f.L, 0, 0.5, 0, 0.1);
    if (!o.leicht) teilung(f.L, 6).forEach(u => f.box(W, Math.max(0, u - 0.3), Math.min(f.L, u + 0.3), 0, wandH, 0, 0.25));
  });
  // Tonnendach aus Glas mit Bögen entlang der langen Achse
  const hb = r.B / 2, tc = (r.t0 + r.t1) / 2, seg = o.leicht ? 8 : 14, bogen = hb * 0.72, Pk = (u, a) => { const q = r.W(u, tc + Math.cos(a) * hb); return V(q[0], wandH + Math.sin(a) * bogen, q[1]); };
  for (let k = 0; k < seg; k++) { const a0 = Math.PI * k / seg, a1 = Math.PI * (k + 1) / seg, want = V(r.az[0] * Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), r.az[1] * Math.cos((a0 + a1) / 2)); bau.face('glasHell', Pk(r.u0, a0), Pk(r.u1, a0), Pk(r.u1, a1), Pk(r.u0, a1), want); }
  for (const u of teilung(r.L, o.leicht ? 12 : 6)) for (let k = 0; k < seg; k++) stab(bau, 'technikDunkel', Pk(r.u0 + u, Math.PI * k / seg), Pk(r.u0 + u, Math.PI * (k + 1) / seg), 0.28, 0.4);
  for (const u of [r.u0, r.u1]) { const f = new Fassade(bau, [r.W(u, r.t0)[0], r.W(u, r.t0)[1]], [r.W(u, r.t1)[0], r.W(u, r.t1)[1]]); const rand = []; for (let k = 0; k <= seg; k++) rand.push([hb + Math.cos(Math.PI * k / seg) * hb * (f.L / (2 * hb)) , wandH + Math.sin(Math.PI * k / seg) * bogen]); try { flaeche(f, 'glasHell', rand, []); flaeche(new Fassade(bau, [r.W(u, r.t1)[0], r.W(u, r.t1)[1]], [r.W(u, r.t0)[0], r.W(u, r.t0)[1]]), 'glasHell', rand, []); } catch { /* unregelmäßig: ohne Stirn */ } }
  return { floors: 1, top: wandH + bogen };
}, 'Bahnhofshalle oder Markthalle mit Tonnendach aus Glas');

// ---------- Öffentliche Bauten ----------
stil('kirche', (bau, pts0, H, R, v, o) => {
  const op = schalter(v), pts = vereinfache(pts0), W = op.has('ziegel') ? 'ziegelRot' : op.has('putz') ? 'stuckWeiss' : wahl(R, ['steinBlock', 'steinGelb', 'sandstein', 'ziegelRot', 'stuckWeiss']);
  const r = rahmen(pts), wandH = clamp(H * 0.5, 7, 19), DK = wahl(R, ['dachSchiefer', 'schiefer', 'dachZiegel']);
  kanten(bau, pts).forEach(f => {
    const ax = achsen(f.L, 4.2, 1.4), um = ax.map(m => bogenUmriss(m - 0.8, m + 0.8, 2.4, Math.max(3.6, wandH - 3), 'spitz', 6));
    wand(f, W, 0, f.L, 0, wandH, um); um.forEach(u => oeffnung(f, u, { tiefe: 0.35, laibung: W, fuellung: 'glasBunt', leicht: o.leicht }));
    f.box('stein', 0, f.L, 0, 0.7, 0, 0.12); f.box('stein', 0, f.L, wandH - 0.35, wandH, 0, 0.18);
    if (!o.leicht && ax.length > 1) ax.slice(0, -1).forEach((m, j) => { const x = (m + ax[j + 1]) / 2; f.box(W, x - 0.32, x + 0.32, 0, wandH * 0.72, 0, 0.75); f.box('stein', x - 0.36, x + 0.36, wandH * 0.72, wandH * 0.72 + 0.14, 0, 0.8); f.box(W, x - 0.28, x + 0.28, wandH * 0.72 + 0.14, wandH * 0.88, 0, 0.4); });
  });
  if (!einfach(pts)) { const k = dach(bau, pts, wandH, W, 0.7, 0.3, 'stein'); bau.poly(DK, k, wandH + 0.4); } else satteldach(bau, pts, wandH, dachText(DK, { neigung: 0.95, ueberstand: 0.25, ortgang: 0.1, wand: W, giebelKey: W, traufe: 'stein', ortgangKey: 'stein', first: 'schiefer', richtung: 'lang', unterseite: 'stein' }));
  // Turm am Ende der langen Achse, das näher an der Straße liegt
  const a = clamp(Math.min(r.L, r.B) * 0.26, 2.4, 5.4), fi = frontKante(pts), fa = pts[fi], fb = pts[(fi + 1) % pts.length], fmU = (fa[0] + fb[0]) / 2 * r.ax[0] + (fa[1] + fb[1]) / 2 * r.ax[1], am = fmU < (r.u0 + r.u1) / 2 ? r.u0 + a : r.u1 - a, c = r.W(am, (r.t0 + r.t1) / 2);
  const hT = Math.max(H * 1.15, wandH + 14), ring = quadrat(c[0], c[1], r.ax, a), obenS = hT - 5;
  kanten(bau, ring).forEach(f => {
    const m = f.L / 2, tuerB = 1.3, um = [bogenUmriss(m - tuerB, m + tuerB, 0.05, 3, 'spitz', 6)], fen = bogenUmriss(m - 0.45, m + 0.45, wandH * 0.55, wandH * 0.55 + 2.2, 'spitz', 5), sch = bogenUmriss(m - 0.9, m + 0.9, obenS, obenS + 2.4, 'spitz', 6);
    wand(f, W, 0, f.L, 0, hT, [um[0], fen, sch]);
    oeffnung(f, um[0], { tiefe: 0.6, laibung: 'stein', fuellung: 'holzDunkel', leicht: o.leicht }); oeffnung(f, fen, { tiefe: 0.4, laibung: W, fuellung: 'glasBunt', leicht: o.leicht }); oeffnung(f, sch, { tiefe: 0.5, laibung: 'stein', fuellung: 'technikDunkel', leicht: o.leicht });
    f.box('stein', 0, f.L, 0, 0.8, 0, 0.14); f.box('stein', 0, f.L, wandH, wandH + 0.3, 0, 0.14); f.box('stein', 0, f.L, obenS - 0.3, obenS, 0, 0.14); f.box('stein', 0, f.L, hT - 0.3, hT + 0.1, 0, 0.3);
    if (!o.leicht) { zylinderUhr(f, m, obenS - 1.6); }
  });
  // Spitze: vierseitig, Kreuz
  const hS = Math.max(a * 3.2, H * 0.5), spitz = new THREE.ConeGeometry(a * 1.42, hS, 4); spitz.rotateY(Math.PI / 4 + Math.atan2(r.ax[0], r.ax[1]));
  bau.geo(wahl(R, ['kupferGruen', 'schiefer', 'kupferGruen']), spitz, M.makeTranslation(c[0], hT + 0.1 + hS / 2, c[1]));
  const yK = hT + hS; bau.box('gold', c[0], yK, c[1], 0.1, 1.6, 0.1); bau.box('gold', c[0], yK + 0.95, c[1], 0.8, 0.1, 0.1, Math.atan2(r.ax[1], r.ax[0]));
  return { floors: 2, top: yK + 1.6 };
}, 'Kirche mit Spitzbogenfenstern, Strebepfeilern, Turm, Uhr und Kreuz');
// Eigener Turm aus dem Umriss (Kirchturm, Rathausturm): Stein oder Ziegel, Gesimse, Schallöffnungen, Uhr, Spitze. Auch für alte schlanke Türme ohne Kirche in der Karte.
stil('kirchturm', (bau, pts0, H, R, v, o) => {
  const W = wahl(R, ['steinBlock', 'steinGelb', 'sandstein', 'ziegelRot', 'ziegelAlt']), pts = vereinfache(pts0), r = rahmen(pts), hS = clamp(H * 0.26, 5, 34), hT = Math.max(7, H - hS), obenS = hT - clamp(H * 0.08, 2.6, 5);
  kanten(bau, pts).forEach(f => {
    if (f.L < 2.4) { wand(f, W, 0, f.L, 0, hT, []); return; }   // kurze Kante eines verwinkelten Grundrisses: glatte Wand, sonst rechnet der Bogen mit Wurzeln aus negativen Zahlen
    const m = f.L / 2, b = clamp(f.L * 0.22, 0.45, 1.3), sch = bogenUmriss(m - b, m + b, obenS, obenS + clamp(H * 0.06, 1.8, 4), 'spitz', 6), fen = bogenUmriss(m - b * 0.5, m + b * 0.5, hT * 0.42, hT * 0.42 + clamp(H * 0.05, 1.6, 3), 'spitz', 5);
    wand(f, W, 0, f.L, 0, hT, [sch, fen]);
    oeffnung(f, sch, { tiefe: 0.5, laibung: 'stein', fuellung: 'technikDunkel', leicht: o.leicht }); oeffnung(f, fen, { tiefe: 0.35, laibung: W, fuellung: 'glasBunt', leicht: o.leicht });
    f.box('stein', 0, f.L, 0, 0.8, 0, 0.14); for (const y of [hT * 0.3, hT * 0.62, obenS - 0.4]) f.box('stein', 0, f.L, y, y + 0.3, 0, 0.13); f.box('stein', 0, f.L, hT - 0.3, hT + 0.1, 0, 0.3);
    if (!o.leicht) zylinderUhr(f, m, obenS - 1.5);
  });
  const c = r.W((r.u0 + r.u1) / 2, (r.t0 + r.t1) / 2), rr = Math.min(r.L, r.B) * 0.72, sp = new THREE.ConeGeometry(rr, hS, 8); sp.rotateY(Math.PI / 8 + Math.atan2(r.ax[0], r.ax[1]));
  bau.poly('dach', offsetRing(pts, -0.02), hT + 0.02);
  bau.geo(wahl(R, ['kupferGruen', 'schiefer', 'kupferGruen']), sp, M.makeTranslation(c[0], hT + hS / 2, c[1]));
  const yK = hT + hS; bau.box('gold', c[0], yK, c[1], 0.1, 1.4, 0.1); bau.box('gold', c[0], yK + 0.85, c[1], 0.7, 0.09, 0.09, Math.atan2(r.ax[1], r.ax[0]));
  return { floors: 2, top: yK + 1.4 };
}, 'Turm aus eigenem Umriss mit Schallöffnungen, Uhr und Spitze');
function zylinderUhr(f, m, y) { const p = f.P(m, y, 0.03); const g = new THREE.CircleGeometry(0.75, 16); const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), f.n); M.compose(p, q, V(1, 1, 1)); f.bau.geo('uhr', g, M); const h = f.P(m, y, 0.05); f.bau.box('rahmenDunkel', h.x, h.y, h.z, 0.05, 0.5, 0.05); }

stil('moschee', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), W = wahl(R, ['stuckWeiss', 'steinGelb', 'sandstein', 'fa8']), K = wahl(R, ['kuppelBlau', 'kupferGruen', 'gold', 'stuckWeiss', 'ziegelGruen']), r = rahmen(pts), wandH = clamp(H * 0.45, 6, 14);
  kanten(bau, pts).forEach(f => {
    const ax = achsen(f.L, 3.6, 1.2), um = ax.map(m => bogenUmriss(m - 1, m + 1, 1, Math.max(2.4, wandH - 2.6), 'spitz', 6));
    wand(f, W, 0, f.L, 0, wandH, um); um.forEach(u => oeffnung(f, u, { tiefe: 0.45, laibung: W, fuellung: 'glasBunt', leicht: o.leicht }));
    f.box('stein', 0, f.L, wandH - 0.4, wandH, 0, 0.16);
    if (!o.leicht) { const n = Math.floor(f.L / 1.3); for (let k = 0; k < n; k++) { const u = (k + 0.5) * f.L / n; dreieckBox(f, W, u, wandH, 0.42, 0.7); } }
  });
  bau.poly('dach', offsetRing(pts, -0.05), wandH + 0.02);
  // Hauptkuppel auf Trommel, kleine Kuppeln an den Ecken
  const c = r.W((r.u0 + r.u1) / 2, (r.t0 + r.t1) / 2), rK = clamp(Math.min(r.L, r.B) * 0.34, 2.6, 13), hTr = rK * 0.32, seg = o.leicht ? 14 : 24;
  zylinder(bau, W, c[0], wandH, c[1], rK * 1.04, rK * 1.04, hTr, seg);
  const fen = o.leicht ? 0 : 12; for (let i = 0; i < fen; i++) { const a = i / fen * Math.PI * 2; bau.box('glasDunkel', c[0] + Math.cos(a) * rK * 1.05, wandH + hTr * 0.25, c[1] + Math.sin(a) * rK * 1.05, 0.5, hTr * 0.55, 0.5, -a); }
  bau.geo(K, new THREE.SphereGeometry(rK, seg, Math.round(seg / 3), 0, Math.PI * 2, 0, Math.PI / 2), M.makeTranslation(c[0], wandH + hTr, c[1]));
  zylinder(bau, 'gold', c[0], wandH + hTr + rK, c[1], 0.1, 0.03, rK * 0.32, 6); kugel(bau, 'gold', c[0], wandH + hTr + rK + rK * 0.2, c[1], Math.max(0.14, rK * 0.05), 8);
  if (r.L > 16 && r.B > 12) for (const [su, st] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const q = r.W((r.u0 + r.u1) / 2 + su * r.L * 0.33, (r.t0 + r.t1) / 2 + st * r.B * 0.33), rk = Math.min(rK * 0.34, 3); bau.geo(K, new THREE.SphereGeometry(rk, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.makeTranslation(q[0], wandH, q[1])); }
  // Minarette: rund mit Balkon und Spitze
  const nM = r.L > 24 ? 2 : 1, hM = Math.max(H * 1.5, wandH + rK * 2 + 10);
  for (let i = 0; i < nM; i++) {
    const q = r.W(i ? r.u1 - 1.5 : r.u0 + 1.5, r.t1 - 1.5), rm = clamp(hM * 0.035, 0.8, 1.6);
    zylinder(bau, W, q[0], 0, q[1], rm, rm * 0.86, hM, 12);
    for (const t of [0.72, 0.9]) { zylinder(bau, 'stein', q[0], hM * t, q[1], rm * 1.5, rm * 1.1, 0.5, 12); zylinder(bau, 'stein', q[0], hM * t + 0.5, q[1], rm * 1.5, rm * 1.5, 0.8, 12); }
    zylinder(bau, K, q[0], hM, q[1], rm * 0.95, 0.02, rm * 3.2, 12); zylinder(bau, 'gold', q[0], hM + rm * 3.1, q[1], 0.05, 0.03, 0.8, 5);
  }
  return { floors: 2, top: hM + 4 };
}, 'Moschee mit Spitzbögen, Hauptkuppel auf Trommel, Nebenkuppeln und Minarett');
function dreieckBox(f, key, u, y, b, h) { const a = f.P(u - b / 2, y, 0.05), c = f.P(u + b / 2, y, 0.05), t = f.P(u, y + h, 0.05); dreieck(f.bau, key, a, c, t, f.n); }

stil('tempel', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), S = wahl(R, ['holzRot', 'holzDunkel', 'holzRot']), W = wahl(R, ['fa0', 'stuckWeiss', 'fa8']), so = 0.9, DK = 'kawara', stufen = H > 16 ? 3 : 2, fH = clamp((H - so - 2) / stufen, 3, 7);
  kanten(bau, pts).forEach(f => { f.box('steinBlock', -0.5, f.L + 0.5, 0, so, 0, 0.6); });
  let ring = pts, y = so;
  for (let s = 0; s < stufen; s++) {
    kanten(bau, ring).forEach(f => {
      const ax = teilung(f.L, 2.8);
      f.wall(W, 0, f.L, y, y + fH);
      ax.forEach(u => f.box(S, Math.max(0, u - 0.17), Math.min(f.L, u + 0.17), y, y + fH, 0, 0.22));
      if (!o.leicht) { f.box(S, 0, f.L, y + fH - 0.5, y + fH, 0, 0.26); f.box(S, 0, f.L, y + fH * 0.42, y + fH * 0.42 + 0.12, 0, 0.14); ax.slice(0, -1).forEach((u, j) => { const m = (u + ax[j + 1]) / 2; f.wall('papier', m - 0.8, m + 0.8, y + 0.8, y + fH * 0.42 - 0.1, 0.02, false); }); }
    });
    y += fH;
    const letzte = s === stufen - 1, ue = letzte ? 1.7 : 1.5;
    if (letzte) walmdach(bau, ring, y, { key: DK, neigung: 0.56, ueberstand: ue, dicke: 0.22, first: 'schiefer', firstBreite: 0.42, firstHoehe: 0.4, traufe: 'holzDunkel', unterseite: S });
    else { const inn = offsetRing(ring, -1.6), aus = offsetRing(ring, ue); for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length; bau.face(DK, V(aus[i][0], y - 0.4, aus[i][1]), V(aus[j][0], y - 0.4, aus[j][1]), V(inn[j][0], y + 1.0, inn[j][1]), V(inn[i][0], y + 1.0, inn[i][1]), UP); bau.face(S, V(aus[i][0], y - 0.4, aus[i][1]), V(aus[j][0], y - 0.4, aus[j][1]), V(ring[j][0], y, ring[j][1]), V(ring[i][0], y, ring[i][1]), V(0, -1, 0)); } profilRing(bau, 'holzDunkel', ring, [[ue, -0.55], [ue, -0.3]], y); ring = inn; y += 0.6; }
  }
  return { floors: stufen, top: y + 3 };
}, 'Tempel oder Pagode mit Holzstützen, Papierfenstern und geschwungenen Stufendächern');

stil('schule', (bau, pts, H, R, v, o) => {
  const op = schalter(v), kh = op.has('krankenhaus'), W = kh ? 'stuckWeiss' : wahl(R, ['ziegelRot', 'fa7', 'fa1', 'putzBeige', 'ziegelHell']), A = kh ? 'fa10' : wahl(R, ['fa2', 'fa6', 'fa9', 'fa3']), gH = 4.0, fH = kh ? 3.5 : 3.7, N = Math.max(1, Math.round((H - gH) / fH)), top = gH + N * fH, fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    const m = f.L / 2, ax = achsen(f.L, 3.0, 0.7);
    if (i === fi && f.L > 10) {
      const b = Math.min(7, f.L * 0.35); f.band(W, 0, gH, ax.filter(x => Math.abs(x - m) > b / 2 + 1.5).map(x => ({ u0: x - 1.1, u1: x + 1.1, v0: 0.85, v1: 3.2 })).concat([{ u0: m - b / 2, u1: m + b / 2, v0: 0.03, v1: gH - 0.5 }]));
      f.wall('glasHell', m - b / 2, m + b / 2, 0.03, gH - 0.5, -0.1); teilung(b, 1.4).forEach(x => f.leiste('rahmenDunkel', m - b / 2 + x - 0.03, m - b / 2 + x + 0.03, 0.03, gH - 0.5, -0.1, 0));
      ax.filter(x => Math.abs(x - m) > b / 2 + 1.5).forEach(x => { const q = { u0: x - 1.1, u1: x + 1.1, v0: 0.85, v1: 3.2 }; f.fenster(q, { tiefe: 0.16, laibung: W, ohneRahmen: o.leicht, kaempfer: !o.leicht, rahmen: 'rahmen' }); });
      f.box('beton', m - b / 2 - 1, m + b / 2 + 1, gH - 0.42, gH - 0.15, 0, 2.6); for (const x of [m - b / 2 - 0.7, m + b / 2 + 0.7]) f.box('rahmenDunkel', x - 0.08, x + 0.08, 0, gH - 0.42, 2.3, 2.46);
      if (kh) { schild(bau, 'schildRot', f, m - 1.4, m + 1.4, top - 2.6, top - 0.2, 0.03, 0.1, true); }
    } else reihe(f, W, 0, gH, ax, 2.2, 0.85, 3.2, { tiefe: 0.16, laibung: W, ohneRahmen: o.leicht, kaempfer: !o.leicht, rahmen: 'rahmen' });
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, ops = reihe(f, W, vv, vv + fH, ax, 2.2, 0.9, fH - 0.42, { tiefe: 0.16, laibung: W, ohneRahmen: o.leicht, kaempfer: !o.leicht, rahmen: 'rahmen' });
      if (!o.leicht) { f.box(A, 0, f.L, vv + 0.42, vv + 0.86, 0, 0.03); ops.forEach(p => { f.box('rahmenDunkel', p.u0, p.u1, p.v1 + 0.02, p.v1 + 0.3, 0, 0.1); }); }
    }
  });
  dachTechnik(bau, dach(bau, pts, top, W, 0.6, 0.25, 'beton'), top, R, { viel: kh ? 2.4 : 1, solar: !kh && R() < 0.5 });
  return { floors: N + 1, top };
}, 'Schule oder Krankenhaus: lange Fensterbänder, Eingang unter Vordach');

stil('museum', (bau, pts0, H, R, v, o) => {
  const pts = vereinfache(pts0), W = wahl(R, ['steinBlock', 'sandstein', 'steinGelb', 'stuckWeiss']), top = clamp(H, 9, 28), fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    const ax = achsen(f.L, 4.2, 1.4);
    reihe(f, W, 0, top * 0.5, ax, 1.5, 1.4, top * 0.5 - 0.9, { tiefe: 0.4, laibung: W, ohneRahmen: o.leicht, sprossen: !o.leicht, kaempfer: !o.leicht, faschen: o.leicht ? null : 'stein', verdachung: true });
    reihe(f, W, top * 0.5, top, ax, 1.5, 0.9, top * 0.5 - 1.1, { tiefe: 0.4, laibung: W, ohneRahmen: o.leicht, sprossen: !o.leicht, kaempfer: !o.leicht, faschen: o.leicht ? null : 'stein' });
    f.box('stein', 0, f.L, top * 0.5 - 0.25, top * 0.5 + 0.1, 0, 0.2); f.box('stein', 0, f.L, 0, 1.0, 0, 0.2);
    if (i === fi && f.L > 12) {
      const b = Math.min(f.L - 2, Math.max(10, f.L * 0.6)), m = f.L / 2, u0 = m - b / 2, u1 = m + b / 2, t = 4.5, nS = Math.max(4, Math.round(b / 3)) & ~1;
      f.box('steinBlock', u0 - 1, u1 + 1, 0, 0.5, 0, t + 2.4); f.box('steinBlock', u0 - 0.5, u1 + 0.5, 0.5, 1, 0, t + 1.4); f.box('steinBlock', u0, u1, 1, 1.5, 0, t + 0.4);
      for (let k = 0; k < nS; k++) { const u = u0 + 0.6 + k * (b - 1.2) / (nS - 1), p = f.P(u, 0, t - 0.2); zylinder(bau, 'stein', p.x, 1.5, p.z, 0.52, 0.45, top - 3.1, o.leicht ? 8 : 14); if (!o.leicht) { bau.box('stein', p.x, 1.5, p.z, 1.2, 0.3, 1.2); bau.box('stein', p.x, top - 1.9, p.z, 1.15, 0.3, 1.15); } }
      f.box('stein', u0 - 0.3, u1 + 0.3, top - 1.6, top, 0, t + 0.5);   // Gebälk
      giebelchen(f, 'stein', u0 - 0.3, u1 + 0.3, top, Math.min(b * 0.16, 4), t + 0.5); bau.face('dach', f.P(u0 - 0.3, top, t + 0.5), f.P(u1 + 0.3, top, t + 0.5), f.P(u1 + 0.3, top, 0), f.P(u0 - 0.3, top, 0), UP);
    }
  });
  profilRing(bau, 'stein', pts, [[0, 0], [0.2, 0.15], [0.2, 0.4], [0.5, 0.7], [0, 0.7]], top - 0.4);
  dachTechnik(bau, dach(bau, pts, top + 0.3, W, 1.0, 0.3, 'stein'), top + 0.3, R, { viel: 0.4 });
  return { floors: 2, top: top + 1 };
}, 'Museum oder Rathaus: Säulenportal, Giebel, breite Freitreppe');

// ---------- Hochhäuser ----------
stil('hotel', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['stuckWeiss', 'putzBeige', 'fa8', 'betonPlatte']), gH = 6, fH = 3.15, N = Math.max(2, Math.round((H - gH) / fH)), top = gH + N * fH, fi = frontKante(pts), S = wahl(R, ['schildBlau', 'schildRot', 'schildWeiss']);
  kanten(bau, pts).forEach((f, i) => {
    if (o.ohneLaden) f.wall('granit', 0, f.L, 0, gH); else lobby(f, gH, 1.2, 'granit', 'glasDunkel', pts, i);
    const ax = achsen(f.L, 3.6, 0.6);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, ops = reihe(f, W, vv, vv + fH, ax, 2.1, 0.1, 2.55, { tiefe: 0.2, laibung: W, ohneRahmen: o.leicht, rahmen: 'rahmenDunkel', kaempfer: false });
      if (!o.leicht) ops.forEach(p => balkon(f, p.u0 - 0.15, p.u1 + 0.15, vv + 0.1, 1.15, { platte: 'beton', glas: true, hoch: 1.05 }));
    }
    if (i === fi) { f.box('technikDunkel', f.L * 0.2, f.L * 0.8, gH - 1.6, gH - 1.2, 0, 5); if (!o.leicht) for (const u of [f.L * 0.24, f.L * 0.76]) f.box('rahmenDunkel', u - 0.12, u + 0.12, 0, gH - 1.6, 4.5, 4.75); schild(bau, S, f, f.L * 0.2, f.L * 0.8, top + 0.6, top + 3.2, 0.02, 0.3, true); }
  });
  dachTechnik(bau, dach(bau, pts, top, W, 1, 0.3, 'beton'), top, R, { viel: 1.5, penthouse: true });
  return { floors: N + 1, top: top + 3.2 };
}, 'Hotel mit Balkonen, Vorfahrt und Schild auf dem Dach');

stil('artdeco', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['steinGelb', 'sandstein', 'ziegelHell', 'fa0', 'ziegel']), gH = 8, fH = 3.8, stufen = [[0, 1], [0.58, 0.82], [0.78, 0.62], [0.92, 0.42]];
  const r = rahmen(pts), Hs = Math.max(H, gH + 6 * fH); let ring = pts, y0 = 0;
  stufen.forEach(([ant], s) => {
    const yE = s === stufen.length - 1 ? Hs : Hs * stufen[s + 1][0];
    if (s > 0) { const d = Math.min(r.B * 0.14, 5.5), neu = offsetRing(ring, -d); if (neu.some((p, i) => { const a = ring[i], b = ring[(i + 1) % ring.length], c = neu[(i + 1) % ring.length]; return (b[0] - a[0]) * (c[0] - p[0]) + (b[1] - a[1]) * (c[1] - p[1]) < 0; })) return; profilRing(bau, 'stein', ring, [[0.1, 0], [0.1, 0.8], [-d, 0.8]], y0 - 0.8); ring = neu; }
    kanten(bau, ring).forEach((f, i) => {
      const y1 = s === 0 ? gH : y0; if (s === 0) { if (o.ohneLaden) f.wall('granit', 0, f.L, 0, gH); else lobby(f, gH, 1.4, 'granit', 'glasDunkel', pts, i); f.box('gold', 0, f.L, gH - 0.35, gH - 0.15, 0, 0.12); }
      f.wall('glasHell', 0, f.L, y1, yE, -0.35);
      teilung(f.L, o.leicht ? 3.6 : 1.8).forEach((u, j) => { const bb = j % 4 === 0 ? 0.5 : 0.22; f.leiste(W, Math.max(0, u - bb), Math.min(f.L, u + bb), y1, yE + (j % 4 === 0 ? 1.4 : 0), -0.35, j % 4 === 0 ? 0.18 : 0.02); });
      for (let y = y1; y < yE; y += fH) f.leiste('stein', 0, f.L, y + 0.05, y + 1.25, -0.35, -0.12, true);   // Brüstung je Stockwerk in hellem Stein: vorher dunkel wie das Glas, aus der Ferne sah der Turm wie lange Streifen ohne Etagen aus
      f.box(W, 0, f.L, yE, yE + 1.2, -0.1, 0.12);
    });
    y0 = yE;
  });
  dach(bau, ring, Hs + 1.2, W, 0.8, 0.3, 'stein');
  const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]), hs = Math.max(8, Hs * 0.12);
  for (let k = 0; k < 3; k++) { const a = Math.max(1.2, (3 - k) * 1.6), y = Hs + 2 + k * 2.4; kiste(bau, W, quadrat(c[0], c[1], r.ax, a), y, y + 2.4); }
  zylinder(bau, 'metall', c[0], Hs + 9.2, c[1], 0.32, 0.03, hs, 8);
  return { floors: Math.round(Hs / fH), top: Hs + 9 + hs };
}, 'Art Deco Hochhaus mit Rücksprüngen, Pfeilern, Goldband und Spitze');

stil('glasmodern', (bau, pts, H, R, v, o) => {
  const G = wahl(R, ['glasBlau', 'glasGruen', 'glasSilber', 'glasDunkel', 'glasBlau']), Ra = wahl(R, ['metall', 'rahmenDunkel', 'lack']), gH = 7.5, fH = 3.9, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH, art = Math.floor(R() * 3);
  kanten(bau, pts).forEach((f, i) => {
    f.wall(G, 0, f.L, gH, top);
    if (!o.leicht) teilung(f.L, 1.5).forEach((u, j) => f.wall(Ra, Math.max(0, u - 0.035), Math.min(f.L, u + 0.035), gH, top, 0.04, false));
    for (let k = 0; k <= N; k++) { const y = gH + k * fH; if (art === 1 && k % 6 === 0) f.box(Ra, 0, f.L, y - 0.8, y + 0.3, 0, 0.3); else if (!o.leicht) f.wall(Ra, 0, f.L, y - 0.05, y + 0.05, 0.04, false); }
    if (art === 2 && !o.leicht) teilung(f.L, 4.5).forEach(u => f.leiste(Ra, Math.max(0, u - 0.12), Math.min(f.L, u + 0.12), gH, top + 2, 0, 0.7));
    if (o.ohneLaden) f.wall('granit', 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: 'granit', ladenRahmen: 'rahmenDunkel', markisen: 0.1, schild: true }); else lobby(f, gH, 1.6, 'granit', 'glasDunkel', pts, i);
  });
  // Krone: schräg zurückgesetzt oder Technikkasten, dazu Hubschrauberplatz oder Antenne
  const d = Math.min(rahmen(pts).B * 0.2, 7), inn = offsetRing(pts, -d), hK = 3.2 * fH; let ok = true;
  inn.forEach((p, i) => { const a = pts[i], b = pts[(i + 1) % pts.length], c = inn[(i + 1) % pts.length]; if ((b[0] - a[0]) * (c[0] - p[0]) + (b[1] - a[1]) * (c[1] - p[1]) < 0) ok = false; });
  if (ok && R() < 0.75) {
    for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; bau.face(G, V(pts[i][0], top, pts[i][1]), V(pts[j][0], top, pts[j][1]), V(inn[j][0], top + hK, inn[j][1]), V(inn[i][0], top + hK, inn[i][1]), V(edgeN(pts[i], pts[j])[0] * hK, d, edgeN(pts[i], pts[j])[1] * hK)); stab(bau, Ra, V(pts[i][0], top, pts[i][1]), V(inn[i][0], top + hK, inn[i][1]), 0.2, 0.2); }
    bau.poly('dach', inn, top + hK); return { floors: N + 3, top: top + hK };
  }
  dachTechnik(bau, dach(bau, pts, top, Ra === 'lack' ? 'stuckWeiss' : 'technikDunkel', 1.4, 0.4, Ra), top, R, { viel: 1.4, penthouse: true });
  return { floors: N + 1, top: top + 1.4 };
}, 'Moderner Glasturm in Blau, Grün oder Silber mit schräger Krone');
const edgeN = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; };

stil('betonturm', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['betonWand', 'sichtbeton', 'betonPlatte', 'platten']), gH = 5, fH = 3, N = Math.max(3, Math.round((H - gH) / fH)), top = gH + N * fH, tief = R() < 0.5;
  kanten(bau, pts).forEach((f, i) => {
    if (o.ohneLaden) f.wall(W, 0, f.L, 0, gH); else if (o.laeden) laeden(f, gH, R, { sockel: W, ladenRahmen: 'rahmenDunkel', markisen: 0.15, schild: true }); else lobby(f, gH, 1.5, W, 'glasDunkel', pts, i);
    const ax = achsen(f.L, 2.8, 0.7);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH; reihe(f, W, vv, vv + fH, ax, 1.9, 0.75, 2.5, { tiefe: tief ? 0.6 : 0.25, laibung: W, ohneRahmen: true, glasKey: 'glas', flach: o.leicht });
      if (!o.leicht && tief) f.box(W, 0, f.L, vv + 0.5, vv + 0.72, 0, 0.3);
    }
    if (!o.leicht && ax.length > 2) f.box(W, ax[Math.floor(ax.length / 2)] - 1.3, ax[Math.floor(ax.length / 2)] + 1.3, gH, top + 3, 0, 0.5);   // Treppenhaus Lisene
  });
  dachTechnik(bau, dach(bau, pts, top, W, 1, 0.3, W), top, R, { viel: 1.4, tank: R() < 0.5, penthouse: true });
  return { floors: N + 1, top: top + 3 };
}, 'Betonturm mit tiefen Fensternischen und Treppenhaus Lisene');

// ---------- Warme Regionen ----------
stil('shophouse', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['fa2', 'fa3', 'fa6', 'fa8', 'fa10', 'stuckWeiss', 'fa11']), Ls = wahl(R, ['ladenGruen', 'blauTuer', 'holzRot', 'ladenSchwarz']), gH = 4, fH = 3.3, N = Math.max(1, Math.round((H - gH) / fH)), top = gH + N * fH, S = wahl(R, ['schildRot', 'schildGelb', 'schildBlau', 'schildGruen', 'schildWeiss']), fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    if (o.ohneLaden) f.wall(W, 0, f.L, 0, gH); else laeden(f, gH, R, { sockel: W, ladenRahmen: 'rahmenDunkel', markisen: 0.5, schild: true });
    const ax = achsen(f.L, 2.5, 0.5);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, ops = reihe(f, W, vv, vv + fH, ax, 1.3, 0.55, 2.8, { tiefe: 0.2, laibung: W, ohneRahmen: o.leicht, rahmen: Ls, kaempfer: !o.leicht });
      if (!o.leicht) { ops.forEach(p => fensterlaeden(f, p, Ls, false)); f.box('stein', 0, f.L, vv - 0.1, vv + 0.08, 0, 0.14); }
    }
    if (i === fi && !o.leicht && f.L > 3) schild(bau, S, f, 0.25, 0.95, gH + 0.5, Math.min(top - 0.6, gH + 4.5), 0.05, 1.0);   // senkrechtes Schild
    f.box(W, 0, f.L, top, top + 1.2, -0.12, 0.05); f.box('stein', 0, f.L, top + 1.1, top + 1.3, -0.15, 0.12);
    if (!o.leicht) achsen(f.L, 2.2, 0.6).forEach(m => f.box('stein', m - 0.22, m + 0.22, top + 0.3, top + 0.9, 0.02, 0.08));
  });
  const k = dach(bau, pts, top + 0.1, W, 0.2, 0.2, W); dachTechnik(bau, k, top + 0.1, R, { viel: 1.2, tank: R() < 0.7 });
  return { floors: N + 1, top: top + 1.3 };
}, 'Shophouse: Läden mit Markisen, Fensterläden, senkrechtes Schild');

stil('favela', (bau, pts, H, R, v, o) => {
  const roh = R() < 0.45, W = roh ? wahl(R, ['ziegelAlt', 'ziegelRot', 'ziegelHell']) : wahl(R, ['fa2', 'fa3', 'fa6', 'fa9', 'fa10', 'fa11', 'putzRau']), fH = 2.7, N = Math.max(1, Math.round(H / fH)), top = N * fH;
  kanten(bau, pts).forEach((f, i) => {
    const ax = achsen(f.L, 2.9, 0.8), vorn = i === frontKante(pts);
    for (let k = 0; k < N; k++) {
      const vv = k * fH, ops = [];
      ax.forEach((m, j) => { if (R() < 0.3 && !(vorn && k === 0)) return; if (vorn && k === 0 && j === 0) { ops.push({ u0: m - 0.45, u1: m + 0.45, v0: vv + 0.02, v1: vv + 2.05, tuer: true }); return; } const b = 0.45 + R() * 0.45; ops.push({ u0: m - b, u1: m + b, v0: vv + 0.9, v1: vv + 2.1 }); });
      f.band(W, vv, vv + fH, ops);
      ops.forEach(p => { f.fenster(p, { tiefe: 0.1, laibung: W, ohneRahmen: true, glasKey: 'glas', flach: o.leicht }); if (p.tuer) f.wall(wahl(R, ['blauTuer', 'gruenTuer', 'holzRot', 'technik']), p.u0, p.u1, p.v0, p.v1, -0.09, false); else if (!o.leicht && R() < 0.6) { for (let x = p.u0 + 0.12; x < p.u1; x += 0.22) f.leiste('rahmenDunkel', x - 0.012, x + 0.012, p.v0, p.v1, 0, 0.03); } });
      if (!o.leicht) f.box('beton', 0, f.L, vv + fH - 0.14, vv + fH, 0, 0.06);
    }
    if (!o.leicht && R() < 0.5 && ax.length) f.box('technik', ax[0] - 0.4, ax[0] + 0.4, top - 1.1, top - 0.5, 0, 0.45);
  });
  const k = dach(bau, pts, top, 'beton', 0.35, 0.12, 'beton');
  const r = rahmen(pts), c = r.W(r.u0 + r.L * 0.3, r.t0 + r.B * 0.4);
  if (!o.leicht && r.L > 4) { zylinder(bau, 'tankBlau', c[0], top, c[1], 0.62, 0.62, 1.05, 10); kugel(bau, 'tankBlau', c[0], top + 1.05, c[1], 0.3, 6); for (let i = 0; i < 4; i++) { const q = r.W(r.u0 + 0.3 + i * (r.L - 0.6) / 3, r.t0 + 0.3); bau.box('rahmenDunkel', q[0], top + 0.3, q[1], 0.03, 0.9, 0.03); } }   // Wassertank, Bewehrung steht aus dem Dach
  return { floors: N, top: top + 1.3 };
}, 'Selbstgebautes Haus: roher Backstein oder bunter Putz, Gitter, Wassertank');

// ---------- Galerie im Dashboard ----------
const RE = (a, b) => [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
const G = (id, name, type, variant, a, b, h, seed, info) => ({ id, name, region: 'Neue Modelle', type, variant, pts: RE(a, b), height: h, seed, ecken: 0, info });
// Pariser Stadthaus (Wunsch Nr. 70, Nader in Paris: "die Gebäude sehen so wenig detailliert aus"): Naturstein mit Fugen, hohes Erdgeschoss mit Läden oder Toren, durchgehende Balkone im zweiten und im obersten Stock auf Konsolen, vor jeder Fenstertür ein geschmiedetes Gitter, Rahmen und Verdachungen, kräftiges Hauptgesims, Mansarde aus Zink mit Gauben über jeder zweiten Achse, Reihen von Schornsteinen
stil('haussmann', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['kalkA', 'kalkB', 'kalkC', 'kalkA']), D = 'stein', gH = 4.7, fH = 3.3, N = clamp(Math.round((H - 3.1 - gH) / fH), 1, 8), top = gH + N * fH, spar = bau.spar;
  kanten(bau, pts).forEach(f => {
    if (o.ohneLaden) f.wall(W, 0, f.L, 0, gH); else laeden(f, gH, R, { sockel: W, markisen: 0.45, ladenRahmen: 'rahmenDunkel', schild: R() < 0.55 });
    // Fugen im Sockel und über dem Erdgeschoss ein Band
    for (let y = gH - 0.72; y > 3.5; y -= 0.48) f.box(W, 0, f.L, y, y + 0.05, -0.02, 0.015);
    f.box(D, 0, f.L, gH - 0.2, gH + 0.06, 0, 0.16);
    const ax = achsen(f.L, 2.75, 1.0);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, edel = k === 1 || N === 1, letzter = k === N - 1 && N >= 3, vO = edel ? 2.95 : k === 0 ? 2.55 : 2.72;
      const ops = reihe(f, W, vv, vv + fH, ax, 1.24, 0.2, vO, { tiefe: 0.26, laibung: W, rahmen: 'rahmen', rahmenBreite: 0.06, sprossen: true, kaempfer: true, faschen: D, verdachung: edel, bank: false });
      // Gesims je Stockwerk, im edlen Stock kräftiger
      f.box(D, 0, f.L, vv - 0.07, vv + 0.07, 0, edel ? 0.12 : 0.06);
      if (edel || letzter) {   // durchgehender Balkon auf Konsolen
        const u0 = 0.28, u1 = f.L - 0.28, t = edel ? 0.92 : 0.78, b0 = vv + 0.1;
        if (u1 - u0 > 1.5) { f.box(D, u0, u1, b0 - 0.1, b0 + 0.06, 0, t); f.box(D, u0 - 0.04, u1 + 0.04, b0 + 0.02, b0 + 0.08, t - 0.04, t + 0.03); f.gitter(u0 + 0.04, u1 - 0.04, b0 + 0.08, b0 + 1.1, t - 0.05); f.box('rahmenDunkel', u0 + 0.02, u1 - 0.02, b0 + 1.08, b0 + 1.13, t - 0.09, t - 0.02);
          for (const x of [u0 + 0.02, u1 - 0.05]) f.box('rahmenDunkel', x, x + 0.03, b0 + 0.08, b0 + 1.1, 0.02, t - 0.03);
          if (!spar) for (let u = u0 + 0.4; u < u1 - 0.2; u += 1.375) { f.box(D, u - 0.1, u + 0.1, b0 - 0.42, b0 - 0.1, 0, t * 0.55); f.box(D, u - 0.12, u + 0.12, b0 - 0.48, b0 - 0.42, 0, t * 0.3); } }
      } else ops.forEach(op => {   // Fenstertür mit Gitter davor
        f.box(D, op.u0 - 0.04, op.u1 + 0.04, op.v0 - 0.08, op.v0, 0, 0.1); f.gitter(op.u0 - 0.01, op.u1 + 0.01, op.v0 + 0.02, op.v0 + 0.88, 0.06); f.box('rahmenDunkel', op.u0 - 0.02, op.u1 + 0.02, op.v0 + 0.87, op.v0 + 0.91, 0.03, 0.08);
      });
      // Bekrönung im edlen Stock: kleiner Giebel im Wechsel mit gerader Verdachung
      if (edel && !o.leicht) ops.forEach((op, j) => { if (j % 2) giebelchen(f, D, op.u0 - 0.2, op.u1 + 0.2, op.v1 + 0.2, 0.34, 0.1); });
    }
    // Eckquader und Lisenen
    if (f.L > 7) { f.box(W, 0, 0.5, gH, top, 0, 0.05); f.box(W, f.L - 0.5, f.L, gH, top, 0, 0.05); }
  });
  // Hauptgesims
  profilRing(bau, D, pts, [[0, 0], [0.14, 0.1], [0.14, 0.26], [0.5, 0.52], [0.6, 0.76], [0, 0.76]], top - 0.56);
  // Mansarde aus Zink, leicht gerippt durch Gauben und Schornsteine
  const md = 1.45, mh = 3.25; profilRing(bau, 'zink', pts, [[0.15, 0.2], [-md, mh], [-md - 0.2, mh + 0.14]], top);
  const innen = offsetRing(pts, -md - 0.2); bau.poly('dach', innen, top + mh + 0.14);
  kanten(bau, pts).forEach(f => achsen(f.L, 2.75, 1.0).forEach((m, j) => { if (j % 2 === 0 || f.L < 12) gaube(f, m, top + 0.6, -0.62, W, 'zink'); }));
  { // Schornsteine in Reihen: auf dem First und an den Brandwänden
    const n = spar ? 2 : 3 + Math.floor(R() * 3), fi = frontKante(pts), A = pts[fi], B = pts[(fi + 1) % pts.length], ux = (B[0] - A[0]), uz = (B[1] - A[1]), l = Math.hypot(ux, uz) || 1;
    for (let k = 0; k < n; k++) { const q = innen[Math.floor(R() * innen.length)], cx = q[0] * 0.65 + innen.reduce((s, p) => s + p[0], 0) / innen.length * 0.35, cz = q[1] * 0.65 + innen.reduce((s, p) => s + p[1], 0) / innen.length * 0.35, by = top + mh; schornstein(bau, cx, cz, [ux / l, uz / l], by - 0.1, by + 1.3 + R() * 0.5, R() < 0.5 ? 'ziegel' : W, 0.75 + R() * 0.5, 0.3); }
  }
  return { floors: N + 2, top: top + mh + 1.2 };
}, 'Pariser Stadthaus: Naturstein, durchgehende Eisenbalkone, Mansarde aus Zink mit Gauben, Schornsteine');

// Stadthaus im Süden (Italien, Spanien, Portugal, Griechenland): warmer Putz, Sockel aus Stein, Klappläden, im ersten Stock Fenstertüren mit Eisengitter, breites Dachgesims, flaches Ziegeldach
stil('palazzo', (bau, pts, H, R, v, o) => {
  const W = wahl(R, ['putzOcker', 'putzTerrakotta', 'putzRosa', 'putzMais']), D = wahl(R, ['stein', 'lack']), So = wahl(R, ['steinBlock', 'sandstein', 'granit']), L = wahl(R, ['holzDunkel', 'rahmenDunkel', 'lack']), gH = 4.3, fH = 3.4, N = clamp(Math.round((H - 0.8 - gH) / fH), 1, 8), top = gH + N * fH;
  kanten(bau, pts).forEach(f => {
    if (o.ohneLaden) f.wall(So, 0, f.L, 0, gH); else laeden(f, gH, R, { sockel: So, markisen: 0.4, ladenRahmen: 'rahmenDunkel', schild: R() < 0.5 });
    f.box(D, 0, f.L, gH - 0.14, gH + 0.06, 0, 0.14);
    const ax = achsen(f.L, 2.9, 1.0);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, edel = k === 0, ob = k === N - 1, vU = edel ? 0.2 : 0.75, vO = edel ? 2.85 : ob ? 2.4 : 2.65;
      const ops = reihe(f, W, vv, vv + fH, ax, edel ? 1.3 : 1.14, vU, vO, { tiefe: 0.26, laibung: W, rahmen: 'rahmen', rahmenBreite: 0.06, sprossen: true, kaempfer: true, bank: !edel, bankKey: D, faschen: D, verdachung: edel });
      ops.forEach((op, j) => { fensterlaeden(f, op, L, !!o.leicht); if (edel) { f.box(D, op.u0 - 0.1, op.u1 + 0.1, vv + 0.02, vv + 0.18, 0, 0.42); f.gitter(op.u0 - 0.08, op.u1 + 0.08, vv + 0.18, vv + 1.12, 0.38); f.box('rahmenDunkel', op.u0 - 0.1, op.u1 + 0.1, vv + 1.1, vv + 1.14, 0.34, 0.41); } });
      if (k > 0) f.box(D, 0, f.L, vv - 0.04, vv + 0.05, 0, 0.05);
    }
    if (f.L > 7) { f.box(D, 0, 0.42, gH, top, 0, 0.04); f.box(D, f.L - 0.42, f.L, gH, top, 0, 0.04); }
  });
  profilRing(bau, D, pts, [[0, 0], [0.16, 0.1], [0.2, 0.22], [0.62, 0.36], [0.68, 0.52], [0, 0.52]], top - 0.3);
  let t2 = top + 0.3;
  if (einfach(pts)) { const d = walmdach(bau, pts, top + 0.2, { key: 'ziegelDach', rillen: 'ziegel', abstand: 0.27, neigung: 0.36, ueberstand: 0.55, dicke: 0.14, traufe: D, leicht: o.leicht }); t2 = d?.first ?? top + 2; } else dachTechnik(bau, dach(bau, pts, top + 0.2, W, 0.5, 0.3), top + 0.2, R, { viel: 0.5 });
  return { floors: N + 1, top: t2 };
}, 'Stadthaus im Süden: warmer Putz, Klappläden, Eisengitter, breites Gesims, Ziegeldach');

STILE.push(
  G('pz', 'Stadthaus im Süden', 'palazzo', '', 20, 13, 18, 31, 'Klappläden, Eisengitter, Ziegeldach'),
  G('hm', 'Pariser Stadthaus', 'haussmann', '', 24, 14, 22, 30, 'Naturstein, Eisenbalkone, Zinkdach'),
  G('gz', 'Gründerzeit', 'gruenderzeit', '', 22, 14, 20, 3, 'Stuck, Erker, Mansarddach'), G('nb', 'Neubau', 'neubau', '', 24, 13, 19, 8, 'Balkone, Staffelgeschoss'), G('nk', 'Nachkriegsblock', 'nachkrieg', '', 30, 11, 15, 5, 'Schlichter Putz, Loggien'),
  G('efh', 'Einfamilienhaus', 'efh', '', 11, 9, 7, 4, 'Satteldach, Schornstein'), G('fw', 'Fachwerkhaus', 'fachwerk', '', 11, 9, 8, 6, 'Balken und Streben'), G('rh', 'Reihenhäuser', 'reihenhaus', '', 22, 9, 9, 7, 'Backstein, bunte Türen'),
  G('ha', 'Gewerbehalle', 'halle', '', 42, 22, 9, 9, 'Wellblech, Sheddach'), G('ma', 'Supermarkt', 'markt', '', 34, 22, 6, 10, 'Glasfront, Schild'), G('ph', 'Parkhaus', 'parkhaus', '', 36, 22, 14, 11, 'Offene Decks'),
  G('ts', 'Tankstelle', 'tankstelle', '', 14, 8, 4, 12, 'Dach auf Säulen'), G('bh', 'Bahnhofshalle', 'halleGlas', '', 46, 22, 16, 13, 'Tonnendach aus Glas'), G('ki', 'Kirche', 'kirche', '', 32, 14, 22, 14, 'Turm mit Spitze'),
  G('mo', 'Moschee', 'moschee', '', 26, 22, 14, 15, 'Kuppel, Minarett'), G('te', 'Tempel', 'tempel', '', 20, 14, 15, 16, 'Stufendächer'), G('sc', 'Schule', 'schule', '', 40, 14, 12, 17, 'Fensterbänder'), G('kh', 'Krankenhaus', 'schule', 'krankenhaus', 36, 18, 22, 18, 'Weiß, rotes Schild'),
  G('mu', 'Museum', 'museum', '', 36, 22, 16, 19, 'Säulenportal'), G('ho', 'Hotel', 'hotel', '', 28, 16, 40, 20, 'Balkone, Schild'), G('ad', 'Art Deco Turm', 'artdeco', '', 30, 24, 120, 21, 'Rücksprünge, Spitze'), G('gm', 'Glasturm', 'glasmodern', '', 30, 24, 110, 22, 'Schräge Krone'),
  G('bt', 'Betonturm', 'betonturm', '', 26, 18, 60, 23, 'Tiefe Nischen'), G('sh', 'Shophouse', 'shophouse', '', 9, 14, 13, 24, 'Markisen, Schild'), G('fa', 'Selbstgebaut', 'favela', '', 8, 8, 8, 25, 'Wassertank'),
);
