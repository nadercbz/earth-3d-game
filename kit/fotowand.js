// Fotofassaden der nahen Häuser (Wunsch Nr. 105, 17.11.2026, Nader: "Weiter ja" auf "Soll ich die Fotofassaden auch auf die nahen Häuser bringen?").
// Die Wand zeigt dasselbe Higgsfield Foto wie die Ferne (Texturfeld tFass aus kit/fassaden.js, Material fotoWand), die Fensterlöcher sitzen genau dort,
// wo das Foto Fenster hat (Rechtecke je Zelle aus kit/fassaden_daten.js). Jede Wand bekommt eine ganze Zahl Achsen (das Foto wird waagrecht leicht
// gestreckt), die Geschosse haben die Höhe aus dem Foto. In den Löchern Laibung, Glas mit Räumen dahinter und Rahmen wie bisher (Fassade.fenster),
// Stuck, Faschen und Verdachungen kommen aus dem Foto. Nur Berliner Bauarten mit Fernnummer (kit/kieze.js fernBerlin), sonst bleibt der Generator.
// UV des Materials: x = Stück waagrecht plus 16 mal (Ton + 1), y = Stück senkrecht plus 16 mal Schicht. Je Viereck um ganze Stücke verschoben,
// so bleiben die Zahlen klein (genau) und der Shader liest Ton und Schicht ohne eigenes Attribut.
import { FASSADEN } from './fassaden_daten.js';

const NAMEN = new Map(FASSADEN.schichten.map((e, i) => [e.name, i]));
const ZELLEN = new Map();
// Vergleich: ?fotonah=0 schaltet nur die nahen Fotowände ab, ?fassaden=0 nah und fern
export const FOTO_NAH = !(typeof location !== 'undefined' && /[?&](fassaden|fotonah)=0/.test(location.search));

// Zelle einer Schicht: Achsbreite aW, Geschosshöhe fH, Löcher in Bruchteilen der Zelle (u von links, v von unten). Die Mitte aller Löcher liegt in
// der Mitte der Zelle, psi und phi sind der Versatz ins Foto in Zellen (Fenster, die im Foto über den Zellrand laufen, liegen so ganz in einer Achse)
function zelle(i) {
  let z = ZELLEN.get(i); if (z) return z;
  const e = FASSADEN.schichten[i], [zx, zy] = e.zellen || e.fenster, L = e.loecher || [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of L) { x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[1]); y0 = Math.min(y0, r[2]); y1 = Math.max(y1, r[3]); }
  const xc = L.length ? (x0 + x1) / 2 : 0.5, yc = L.length ? (y0 + y1) / 2 : 0.5, mod1 = x => ((x % 1) + 1) % 1;
  const psi = mod1(xc - 0.5), phi = mod1(-0.5 - yc), Kx = Math.round(0.5 - xc + psi), Ky = Math.round(0.5 + phi + yc);
  const loecher = L.map(r => ({ u0: r[0] - psi + Kx, u1: r[1] - psi + Kx, v0: Ky - phi - r[3], v1: Ky - phi - r[2] }));
  z = { zx, zy, aW: e.meter[0] / zx, fH: e.meter[1] / zy, psi, phi, loecher };
  ZELLEN.set(i, z); return z;
}

// Schicht für ein Haus: name aus kit/fassaden_daten.js, W Wandmaterial (faN: Kiez Ton N, sonst die Farbe aus dem Foto), versatz: ganze Zellen ins Foto
export function fotoSchicht(name, W = null, versatz = 0) {
  if (!FOTO_NAH) return null;
  const i = NAMEN.get(name); if (i == null) return null;
  const m = /^fa(\d+)$/.exec(W || '');
  return { i, z: zelle(i), tk: m ? +m[1] + 1 : 0, versatz };
}
// Berliner Fernnummer (kit/kieze.js fernBerlin) zur Schicht: Gründerzeit reich, mittel, schlicht (mit Graffiti plus 10), Platte, Nachkrieg
export function fotoName(fern, hausZ = 0.3) {
  if ([10, 11, 12, 20, 21, 22].includes(fern)) return ['gz_stuck', 'gz_mittel', 'gz_schlicht'][fern % 10];
  if (fern === 13) return hausZ < 0.5 ? 'platte_saniert' : 'platte_grau';   // wie die Ferne (kit/city.js): Zufall je Haus unter 0,5 saniert
  if (fern === 14) return 'nachkrieg';
  return null;
}

// Viereck der Fotowand (u0..u1, v0..v1 auf der Fassade f), lange Stücke in Teile von höchstens einem Stück Breite
function stueck(f, F, u0, u1, v0, v1, map, modU) {
  if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
  if (u1 - u0 > modU) { for (let s = u0; s < u1 - 1e-6; s += modU) stueck(f, F, s, Math.min(u1, s + modU), v0, v1, map, modU * 2); return; }
  const a = map(u0, v0), b = map(u1, v1), ox = Math.floor(a[0]) - 1 - 16 * F.tk, oy = Math.floor(a[1]) - 1 - 16 * F.i;
  const x0 = a[0] - ox, x1 = b[0] - ox, y0 = a[1] - oy, y1 = b[1] - oy;
  f.bau.quadUV('fotoWand', f.P(u0, v0), f.P(u1, v0), f.P(u1, v1), f.P(u0, v1), f.n, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}
// Wandband eines Geschosses mit beliebigen Löchern: senkrechte Streifen zwischen allen Lochkanten, in jedem Streifen Wand zwischen den Löchern
function band(f, F, v0, v1, ops, map, modU) {
  const xs = [0, f.L]; for (const o of ops) xs.push(o.u0, o.u1);
  xs.sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1]; if (b - a < 1e-3) continue;
    const m = (a + b) / 2, drin = ops.filter(o => o.u0 <= m && o.u1 >= m).sort((p, q) => p.v0 - q.v0);
    let v = v0;
    for (const o of drin) { stueck(f, F, a, b, v, o.v0, map, modU); v = Math.max(v, o.v1); }
    stueck(f, F, a, b, v, v1, map, modU);
  }
}

// Läufe (Nr. 105, Marzahn): das Kataster teilt gerade Fassaden oft in viele kurze Kanten, jede für sich fasste keine ganze Achse und blieb ohne
// Fenster. Aufeinanderfolgende Kanten in fast gleicher Richtung (unter 10 Grad) bekommen darum ein durchgehendes Raster: f.lauf = { off, L }
// (Länge des Laufs, Lage der Kante darin). u läuft von b nach a (kit/buildings.js Fassade), also gegen die Reihenfolge der Kanten
export function fotoLaeufe(fs) {
  const n = fs.length; if (!n) return fs;
  const gleich = (a, b) => a.r.x * b.r.x + a.r.z * b.r.z > 0.985;
  let s = fs.findIndex((f, i) => !gleich(fs[(i - 1 + n) % n], f)); if (s < 0) s = 0;
  for (let k = 0; k < n;) {
    const lauf = [fs[(s + k) % n]]; k++;
    while (k < n && gleich(fs[(s + k - 1) % n], fs[(s + k) % n])) { lauf.push(fs[(s + k) % n]); k++; }
    const L = lauf.reduce((a, f) => a + f.L, 0); let off = 0;
    for (let i = lauf.length - 1; i >= 0; i--) { lauf[i].lauf = { off, L }; off += lauf[i].L; }
  }
  return fs;
}
// Raster einer Kante: Achsbreite cw, Versatz im Lauf, Achsen ganz auf dieser Kante (j im Lauf, u Mitte auf der Kante)
export function fotoAchsen(f, F) {
  const lauf = f.lauf || { off: 0, L: f.L }, n = Math.round(lauf.L / F.z.aW);
  if (n < 1) return { n, cw: f.L, off: 0, mitten: [] };
  const cw = lauf.L / n, off = lauf.off, mitten = [];
  for (let j = Math.floor(off / cw); j * cw < off + f.L; j++) { const u = (j + 0.5) * cw - off; if (u - cw / 2 > -0.05 && u + cw / 2 < f.L + 0.05) mitten.push({ j, u }); }
  return { n, cw, off, mitten };
}

// Fotowand auf der Fassade f von v0 an, N Geschosse. st wie Fassade.fenster (tiefe, laibung, rahmen, sprossen, kaempfer, flach, ohneRahmen), dazu
// wand: Material für Läufe, die keine ganze Achse fassen, ohne(o, j, k): Loch weglassen (Erker, Hauseingang). Ein Loch über der Grenze zweier
// Kanten im selben Lauf wird geteilt, jede Kante baut ihren Teil ohne Laibung und Rahmen an der Grenze (offenU0, offenU1). An echten Ecken
// entfällt ein Loch, das über die Ecke liefe (dort bleibt das Fenster des Fotos flach). Liefert die Öffnungen je Geschoss
export function fotoFassade(f, F, v0, N, st) {
  const z = F.z, A = fotoAchsen(f, F), out = [];
  if (A.n < 1) { f.wall(st.wand || 'putz', 0, f.L, v0, v0 + N * z.fH); for (let k = 0; k < N; k++) out.push([]); return out; }
  const { cw, off } = A, ch = z.fH, jo = F.versatz || 0, modU = cw * z.zx, lauf = f.lauf || { off: 0, L: f.L }, weiter0 = off > 0.01, weiter1 = off + f.L < lauf.L - 0.01;
  const r0 = weiter0 ? 0 : 0.1, r1 = weiter1 ? 0 : 0.1;   // Abstand zur Kante: an einer Grenze im Lauf keiner
  const map = (u, v) => [((u + off) / cw + z.psi + jo) / z.zx, ((v - v0) / ch + z.phi) / z.zy];
  for (let k = 0; k < N; k++) {
    const vb = v0 + k * ch, ops = [];
    for (let j = Math.floor(off / cw) - 1; (j - 1) * cw < off + f.L; j++) for (const r of z.loecher) {
      const a = (j + r.u0) * cw - off, b = (j + r.u1) * cw - off;
      if (b <= 0.02 || a >= f.L - 0.02 || (!weiter0 && a < r0 - 0.15) || (!weiter1 && b > f.L - r1 + 0.15)) continue;
      const o = { u0: Math.max(r0, a), u1: Math.min(f.L - r1, b), v0: Math.max(vb + 0.05, vb + r.v0 * ch), v1: Math.min(vb + ch - 0.05, vb + r.v1 * ch) };
      if (weiter0 && a < 0) o.offenU0 = true; if (weiter1 && b > f.L) o.offenU1 = true;
      if (o.u1 - o.u0 > ((o.offenU0 || o.offenU1) ? 0.04 : 0.3) && o.v1 - o.v0 > 0.3 && !st.ohne?.(o, j, k)) ops.push(o);
    }
    band(f, F, vb, vb + ch, ops, map, modU);
    for (const o of ops) f.fenster({ ...o, boden: vb }, (o.offenU0 || o.offenU1) && st.sprossen ? { ...st, sprossen: false } : st);
    out.push(ops);
  }
  return out;
}
