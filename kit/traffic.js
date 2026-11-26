// Verkehr: Fahrsystem nach Regelwerk Teil 1.3 (04_REGELWERK.md), seit 28.10.2026 abends auf Naders Wunsch
// ("Fahrphysik perfekt, verkehrsmäßig handeln, Ampeln rot und grün, in beiden Karten").
//
// Aufbau: aus dem Straßennetz (Knoten, Kanten mit Spuren je Richtung) entsteht ein Spurgraph: jede Spur eine versetzte Linie,
// an Kreuzungen zurückgeschnitten bis zur Haltelinie (vor dem Überweg), dazwischen Abbiegeverbindungen als Kurven mit
// Konfliktflächen. Autos fahren mit dem Intelligent Driver Model (Treiber, Hennecke, Helbing 2000): weiches Anfahren,
// Abstand nach Geschwindigkeit, komfortables Bremsen, Notbremse nur im Notfall. Regeln: eigene Spur, Tempo nach Klasse,
// Bremsen vor Kurven, Ampeln (Gelb nur durchfahren, wenn Anhalten nicht mehr geht), Vorfahrt nach Schild, Straßenklasse,
// rechts vor links, Linksabbieger warten auf den Gegenverkehr, Kreuzung nur frei befahren (Reservierung je Konfliktfläche,
// Kreuzung freihalten, wenn dahinter kein Platz ist), Fußgänger auf Überwegen haben Vorrang, Spurwechsel für das Abbiegen,
// Busse halten an Haltestellen, Parkstreifen mit geparkten Autos, Wenden nur in Sackgassen. Wer sehr lange festhängt, fährt
// als Erster, wenn alle anderen auch stehen (gegen Verklemmen).
// Rechtsverkehr. Koordinaten: x nach Osten, z nach Süden, rechts von der Fahrtrichtung (dx, dz) ist (-dz, dx).
import * as THREE from 'three';
import { rng } from './geo.js';

const A_QUER = 2.3;                        // m/s² zulässige Querbeschleunigung (Tempo in Kurven)
const KLASSEN = {                          // Fahrmodell je Fahrzeugklasse: a Anfahren, b komfortables Bremsen, T Zeitlücke, s0 Stillstandsabstand
  pkw: { a: 1.7, b: 2.4, T: 1.25, s0: 2.0, tempo: 1.0 }, taxi: { a: 1.9, b: 2.6, T: 1.1, s0: 1.9, tempo: 1.04 },
  lieferung: { a: 1.3, b: 2.2, T: 1.5, s0: 2.4, tempo: 0.96 }, bus: { a: 0.9, b: 1.7, T: 1.7, s0: 3.0, tempo: 0.9 }, lkw: { a: 0.7, b: 1.6, T: 2.0, s0: 3.5, tempo: 0.82 }, traktor: { a: 0.6, b: 1.5, T: 2.0, s0: 3.0, tempo: 0.42 },
};
const NOTBREMSE = 7.5;
const SICHT_H = 1.25, SICHT_N = 36;        // Fahren auf Sicht: Abstand der Bahnpunkte in Metern, Punkte je Fahrzeug
// zwei gedrehte Rechtecke (Mitte, Richtung, halbe Länge, halbe Breite): überlappen sie sich? (Trennachsen)
function boxenUeber(ax, az, adx, adz, al, ab, bx, bz, bdx, bdz, bl, bb) {
  const tx = bx - ax, tz = bz - az, c = Math.abs(adx * bdx + adz * bdz), s = Math.abs(adx * bdz - adz * bdx);
  if (Math.abs(tx * adx + tz * adz) > al + bl * c + bb * s) return false;
  if (Math.abs(tz * adx - tx * adz) > ab + bl * s + bb * c) return false;
  if (Math.abs(tx * bdx + tz * bdz) > bl + al * c + ab * s) return false;
  if (Math.abs(tz * bdx - tx * bdz) > bb + al * s + ab * c) return false;
  return true;
}
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _s2 = new THREE.Vector3();
const _nah = [];

// ---------- Geometrie ----------
function laengen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
// Linie nach rechts versetzen (Gehrung an Knicken, begrenzt). off: Meter, oder ein Feld mit einem Wert je Punkt
function versetzt(pts, off) {
  const n = pts.length, out = [], fest = typeof off === 'number';
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    let d1x = b[0] - a[0], d1z = b[1] - a[1], d2x = c[0] - b[0], d2z = c[1] - b[1];
    const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1; d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    if (i === 0) { d1x = d2x; d1z = d2z; } if (i === n - 1) { d2x = d1x; d2z = d1z; }
    let mx = -(d1z + d2z), mz = d1x + d2x; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = Math.min(2.5, 1 / Math.max(0.4, mx * -d1z + mz * d1x));   // Gehrungsfaktor, begrenzt
    const o = fest ? off : off[i];
    out.push([b[0] + mx * o * k, b[1] + mz * o * k]);
  }
  return out;
}
// Linie mit Punkten höchstens alle d Meter (für stufenlosen Versatz)
function verfeinert(pts, d) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / d)); for (let k = 1; k <= n; k++) out.push(k === n ? b : [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  return out;
}
// Teilstück einer Linie von s0 bis s1 (Meter entlang der Linie)
function teil(pts, cum, s0, s1) {
  const out = [], L = cum[cum.length - 1]; s0 = Math.max(0, Math.min(s0, L)); s1 = Math.max(s0 + 0.5, Math.min(s1, L));
  const at = s => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; };
  out.push(at(s0));
  for (let i = 0; i < pts.length; i++) if (cum[i] > s0 + 0.01 && cum[i] < s1 - 0.01) out.push(pts[i]);
  out.push(at(s1));
  return out;
}
function richtung(pts, amEnde) {
  const i = amEnde ? pts.length - 1 : 1, a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}
// Kubische Bezierkurve zwischen zwei Spurenden mit Tangenten
function kurve(P0, t0, P3, t1, faktor = 0.42, n = 14) {
  const d = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]) * faktor;
  const P1 = [P0[0] + t0[0] * d, P0[1] + t0[1] * d], P2 = [P3[0] - t1[0] * d, P3[1] - t1[1] * d], out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0], u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1]]);
  }
  return out;
}
function kleinsterAbstand(A, B) {
  let m = Infinity;
  for (const a of A) for (const b of B) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < m) m = d; }
  return m;
}
function punktAbstand(p, B) { let m = Infinity; for (const b of B) { const d = Math.hypot(p[0] - b[0], p[1] - b[1]); if (d < m) m = d; } return m; }
// Schnittpunkt Strecke (a, b) mit Linie pts: Meter entlang der Linie oder -1
function schnitt(pts, cum, a, b) {
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], r = [q[0] - p[0], q[1] - p[1]], s = [b[0] - a[0], b[1] - a[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / den, u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return cum[i - 1] + t * (cum[i] - cum[i - 1]);
  }
  return -1;
}

// Ein Stück Fahrweg: Spur (zwischen zwei Knoten) oder Verbindung (durch eine Kreuzung)
class Stueck {
  constructor(art, pts, tempo) {
    this.art = art; this.pts = pts; this.cum = laengen(pts); this.len = Math.max(0.01, this.cum[this.cum.length - 1]); this.tempo = tempo;
    this.fahrzeuge = []; this.aus = []; this.vmax = this.kurvenTempo();
  }
  kurvenTempo() {
    const p = this.pts, v = new Float32Array(p.length).fill(this.tempo);
    for (let i = 1; i < p.length - 1; i++) {
      const d1 = [p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]], d2 = [p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]];
      const l1 = Math.hypot(...d1) || 1e-6, l2 = Math.hypot(...d2) || 1e-6;
      const cos = Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2))), w = Math.acos(cos);
      const kappa = w / Math.max(0.3, (l1 + l2) / 2);
      if (kappa > 1e-4) v[i] = Math.min(this.tempo, Math.sqrt(A_QUER / kappa));
    }
    return v;
  }
  // Punkt und Richtung bei s
  bei(s, out) {
    const c = this.cum, p = this.pts; let i = 1; while (i < c.length - 1 && c[i] < s) i++;
    const t = Math.max(0, Math.min(1, (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1])));
    out.x = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t; out.z = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
    return out;
  }
  // zulässiges Tempo ab s bis s + weit, als Grenze für die aktuelle Geschwindigkeit (mit Bremsweg)
  tempoVoraus(s, b, weit) {
    let grenze = this.tempo;
    for (let i = 1; i < this.pts.length; i++) {
      const d = this.cum[i] - s; if (d < 0) continue; if (d > weit) break;
      grenze = Math.min(grenze, Math.sqrt(this.vmax[i] * this.vmax[i] + 2 * b * d));
    }
    return grenze;
  }
}

// ---------- Spurgraph ----------
// links: Linksverkehr (Spuren links der Mitte, Abbiegen und Vorrang gespiegelt, seit 29.10.2026 für den Weltbau), hoehe(x, z): Gelände
// welt: Weltlage der Ortsmitte in Metern [GX, GZ] (Erde, Kachelraster): Parkplätze, geparkte Autos und Ampelumläufe hängen dann an der Erde,
// zwei Orte mit derselben Straße haben dieselben Autos an denselben Stellen (Wunsch Nr. 36)
const hashXZ = (x, z) => ((Math.round(x) * 73856093) ^ (Math.round(z) * 19349663)) >>> 0 || 1;
function weltStellen(pts, sp, off, GX, GZ) {   // wie kit/ortbau.js: Bogenlängen dort, wo die Weltlage ein Vielfaches von sp kreuzt
  const out = []; let cum = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) continue;
    const aufX = Math.abs(bx - ax) >= Math.abs(bz - az), wa = aufX ? ax + GX : az + GZ, wb = aufX ? bx + GX : bz + GZ, lo = Math.min(wa, wb), hi = Math.max(wa, wb);
    for (let k = Math.ceil((lo - off) / sp); k * sp + off < hi; k++) out.push(cum + (k * sp + off - wa) / (wb - wa) * L);
    cum += L;
  }
  return out;
}
export function baueNetz(verkehr, { ueberwege = [], halte = [], parkenSeed = 3, links = false, hoehe = null, welt = null, stellen = [] } = {}) {
  const SEITE = links ? -1 : 1;
  const K = verkehr.knoten.map(k => ({ x: k[0], z: k[1], art: k[2], signal: !!k[3], r: k[4] || 0, an: [], ab: [] }));   // r: Radius zusammengezogener Kreuzungen
  const R = [];   // Fahrtrichtungen: eine je Kante und Richtung mit Spuren
  verkehr.kanten.forEach((e, ei) => {
    const mitte = e.mitte || 0;
    const mach = (vor) => {
      const n = vor ? e.vor : e.zur; if (!n) return;
      const pts = vor ? e.p : e.p.slice().reverse(), lw = e.lw;
      const rand = vor ? (e.randR || 0) : (e.randL || 0);
      const rest = e.einbahn ? (e.w - n * lw) / 2 : e.w / 2 - mitte / 2 - n * lw - rand;   // Platz rechts neben den Spuren (Parkstreifen)
      const park = (vor ? e.parkR : e.parkL) && rest >= 1.9 ? Math.min(2.3, rest) : 0;
      const basis = e.einbahn ? -e.w / 2 + (e.w - n * lw) / 2 - (park ? park / 2 : 0) - (e.stand || 0) / 2 + n * lw : mitte / 2 + n * lw;   // rechte Kante der Spuren
      const r = { id: R.length, kante: e, ei, vor, von: vor ? e.a : e.b, nach: vor ? e.b : e.a, pts, cum: laengen(pts), n, lw, basis, park, rang: e.rang ?? 2,
        tempo: (e.tempo || 50) / 3.6, turn: vor ? e.turnV : e.turnZ, schild: vor ? e.schildV : e.schildZ, gruppe: e.gruppe || null, halt: e.halt, name: e.name, bus: e.bus, kreis: !!e.kreis, spuren: [], nachbarn: new Set() };
      r.len = r.cum[r.cum.length - 1];
      r.dirStart = richtung(pts, false); r.dirEnde = richtung(pts, true);
      R.push(r); K[r.von].ab.push(r); K[r.nach].an.push(r);
    };
    mach(true); mach(false);
  });
  // Rückschnitt an jedem Knoten: bis zur Haltelinie (vor der Querstraße), an Knicken nichts
  const schnittAn = (k, r) => {
    const andere = [...k.an, ...k.ab].filter(x => x.kante !== r.kante);
    if (r.halt) return r.halt;
    // Spurzahl ändert sich (echte Spuren aus OSM: 2 auf 1): 8 m Rückschnitt, damit die Einfädelkurve lang genug für den Reißverschluss ist
    // (vorher 3 m lang, zwei Autos fuhren nebeneinander in dieselbe Spur, Hermannplatz 07.11.2026)
    if (k.art === 'knick') return andere.some(x => x.n !== r.n) ? 8 : andere.some(x => Math.abs(x.lw - r.lw) > 0.3) ? 1.5 : 0;
    if (k.art === 'sackgasse') return 1.0;
    if (k.art === 'rand' || k.art === 'portal' || k.art === 'frei') return 0;
    return k.r + Math.max(3, ...andere.map(x => x.kante.w / 2)) + 2.0;
  };
  // Fahrbahnpaare (07.11.2026, Wunsch Nr. 77, tools/spuren_pruefen.mjs): zweibahnige Straßen sind als zwei Einbahnlinien kartiert, oft nur 4 bis 9 m
  // auseinander, geschätzt wird die Breite aber je Fahrbahn. Die inneren Spuren beider Richtungen lagen dann übereinander (Ebertstraße am Potsdamer
  // Platz 0,02 m, Autos fuhren durcheinander). Jetzt rücken die Spuren einer Einbahnlinie dort, wo die Gegenfahrbahn auf der Innenseite zu nah liegt,
  // stufenlos nach außen, bis zwischen den inneren Spuren 4 m sind (Mitte zu Mitte), höchstens bis zum Fahrbahnrand. Reicht das nicht, fällt je Richtung eine Spur weg.
  { const einb = R.filter(r => r.kante.einbahn && r.n >= 1);
    for (const r of einb) { r.pts = verfeinert(r.pts, 4); r.cum = laengen(r.pts); }
    const kastenR = r => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const q of r.pts) { if (q[0] < a) a = q[0]; if (q[0] > b) b = q[0]; if (q[1] < c) c = q[1]; if (q[1] > d) d = q[1]; } return [a, b, c, d]; };
    const KB = new Map(einb.map(r => [r, kastenR(r)])), innen = r => r.basis - (r.n - 0.5) * r.lw;   // Lage der inneren Spur (positiv: außen)
    const rand = r => r.kante.w / 2 - r.basis;   // Platz nach außen bis zum Fahrbahnrand
    const basisFuer = (r, n) => -r.kante.w / 2 + (r.kante.w - n * r.lw) / 2 - (r.park ? r.park / 2 : 0) - (r.kante.stand || 0) / 2 + n * r.lw;
    const bedarf = r => {   // nötiger Versatz je Punkt (ohne Grenze), nur auf dem Stück, das Spur wird (ohne Rückschnitt an den Knoten)
      const kb = KB.get(r), partner = einb.filter(o => o.kante !== r.kante && (() => { const ko = KB.get(o); return !(ko[0] > kb[1] + 12 || kb[0] > ko[1] + 12 || ko[2] > kb[3] + 12 || kb[2] > ko[3] + 12); })());
      const n = r.pts.length, roh = new Float32Array(n); if (!partner.length) return roh;
      const s0 = schnittAn(K[r.von], r), s1 = r.len - schnittAn(K[r.nach], r);
      for (let i = 0; i < n; i++) {
        const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / tl, tz = (b[1] - a[1]) / tl, P = r.pts[i];
        for (const o of partner) {
          for (let q = 1; q < o.pts.length; q++) {
            const A = o.pts[q - 1], B = o.pts[q], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz; if (l2 < 1e-6) continue;
            const l = Math.sqrt(l2); if ((tx * dx + tz * dz) / l > -0.8) continue;   // nur Gegenrichtung
            const t = Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dz) / l2)), fx = A[0] + dx * t - P[0], fz = A[1] + dz * t - P[1], d = Math.hypot(fx, fz);
            if (d > 12 || (-tz * fx + tx * fz) * SEITE > 0) continue;   // zu weit oder nicht auf der Innenseite
            const fehl = 4.0 - (d + innen(r) + innen(o));
            if (fehl > 0 && r.cum[i] > s0 - 2 && r.cum[i] < s1 + 2) roh[i] = Math.max(roh[i], fehl / 2);
          }
        }
      }
      return roh;
    };
    // Reicht der Platz bis zum Fahrbahnrand nicht (beide Linien fast deckungsgleich, Ebertstraße), fällt je Richtung eine Spur weg
    const weniger = einb.filter(r => r.n >= 2 && Math.max(...bedarf(r)) > rand(r) + 0.25);
    for (const r of weniger) { r.n -= 1; r.basis = basisFuer(r, r.n); r.turn = null; }
    for (const r of einb) {
      const roh = bedarf(r), n = roh.length, grenze = Math.max(0, rand(r));
      for (let i = 0; i < n; i++) roh[i] = Math.min(grenze, roh[i]);
      if (!roh.some(v => v > 0.05)) continue;
      const glatt = new Float32Array(n);   // erst Maximum über 8 m, dann Mittel über 8 m: keine Knicke
      const mx = roh.map((v, i) => Math.max(...roh.slice(Math.max(0, i - 2), Math.min(n, i + 3))));
      for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { s += mx[k]; c++; } glatt[i] = s / c; }
      r.aussen = glatt;
    }
  }
  for (const r of R) {
    const s0 = schnittAn(K[r.von], r), s1 = schnittAn(K[r.nach], r);
    const platz = r.len - s0 - s1 < 2 ? (r.len - 2) / Math.max(1e-6, s0 + s1) : 1;   // sehr kurze Kanten: Rückschnitt anteilig
    for (let k = 0; k < r.n; k++) {
      const off = r.basis - (k + 0.5) * r.lw;
      const linie = versetzt(r.pts, r.aussen ? Array.from(r.aussen, v => (off + v) * SEITE) : off * SEITE), cum = laengen(linie);
      const sp = new Stueck('spur', teil(linie, cum, s0 * platz, cum[cum.length - 1] - s1 * platz), r.tempo);
      sp.r = r; sp.k = k; sp.kreuzung = K[r.nach]; sp.ende = K[r.nach].art; sp.gruppe = r.gruppe; sp.schild = r.schild; sp.halte = []; sp.querungen = []; sp.id = r.id * 8 + k;
      r.spuren.push(sp);
    }
  }
  const alleSpuren = R.flatMap(r => r.spuren);
  // Wo zwei Fahrbahnen einer Straße an einer Kreuzung zusammenlaufen (Einbahnpaare), liegen Spurende und Spuranfang verschiedener
  // Straßen manchmal unter 2,6 m auseinander: beide so weit zurückschneiden, bis ein wartendes und ein abfahrendes Auto nebeneinander passen
  const kuerze = (sp, vorn, um) => { um = Math.min(um, sp.len - 1.0); if (um <= 0.05) return; sp.pts = teil(sp.pts, sp.cum, vorn ? um : 0, vorn ? sp.len : sp.len - um); sp.cum = laengen(sp.pts); sp.len = sp.cum[sp.cum.length - 1]; sp.vmax = sp.kurvenTempo(); };
  for (const k of K) for (let runde = 0; runde < 5; runde++) {
    let eng = false;
    const enden = k.an.flatMap(r => r.spuren.map(sp => ({ sp, r, vorn: false, p: sp.pts[sp.pts.length - 1] })));
    const anfaenge = k.ab.flatMap(r => r.spuren.map(sp => ({ sp, r, vorn: true, p: sp.pts[0] })));
    const alle = [...enden, ...anfaenge];
    for (let i = 0; i < alle.length; i++) for (let j = i + 1; j < alle.length; j++) {
      const a = alle[i], b = alle[j];
      if (a.r.kante === b.r.kante) continue;   // zwei Richtungen derselben Straße liegen bewusst nebeneinander
      if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 2.6) { kuerze(a.sp, a.vorn, 2); kuerze(b.sp, b.vorn, 2); a.p = a.vorn ? a.sp.pts[0] : a.sp.pts[a.sp.pts.length - 1]; b.p = b.vorn ? b.sp.pts[0] : b.sp.pts[b.sp.pts.length - 1]; eng = true; }
    }
    if (!eng) break;
  }
  // Spuren, die schräg in denselben Knoten hineinlaufen (oder schräg aus ihm heraus), lagen vor der Haltelinie teils übereinander, obwohl ihre Enden
  // weiter als 2,6 m auseinander sind (07.11.2026, Alexanderplatz: zwei Einbahnarme einer Hauptstraße, 0,95 m, wartende Autos ineinander):
  // beide weiter zurückschneiden, bis die letzten 25 m beider Spuren mindestens 2,4 m Abstand haben (je Runde 1,5 m, mindestens 7 m Spur bleiben).
  { const abstandZu = (p, pts) => { let m = Infinity; for (let q = 1; q < pts.length; q++) { const A = pts[q - 1], B = pts[q], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2)); m = Math.min(m, Math.hypot(A[0] + dx * t - p[0], A[1] + dz * t - p[1])); } return m; };
    const ende = (sp, vorn) => vorn ? teil(sp.pts, sp.cum, 0, Math.min(25, sp.len)) : teil(sp.pts, sp.cum, Math.max(0, sp.len - 25), sp.len);
    const abstand = (a, b) => { const A = ende(a.sp, a.vorn), B = ende(b.sp, b.vorn), c = laengen(A), L = c[c.length - 1]; let m = Infinity; for (let s = 0; s <= L; s += 1) { let i = 1; while (i < c.length - 1 && c[i] < s) i++; const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]); m = Math.min(m, abstandZu([A[i - 1][0] + (A[i][0] - A[i - 1][0]) * t, A[i - 1][1] + (A[i][1] - A[i - 1][1]) * t], B)); } return m; };
    for (const k of K) for (const gruppe of [k.an.flatMap(r => r.spuren.map(sp => ({ sp, r, vorn: false }))), k.ab.flatMap(r => r.spuren.map(sp => ({ sp, r, vorn: true })))]) {
      for (let i = 0; i < gruppe.length; i++) for (let j = i + 1; j < gruppe.length; j++) {
        const a = gruppe[i], b = gruppe[j]; if (a.r.kante === b.r.kante) continue;
        for (let runde = 0; runde < 12 && a.sp.len > 8.5 && b.sp.len > 8.5 && abstand(a, b) < 2.4; runde++) { kuerze(a.sp, a.vorn, 1.5); kuerze(b.sp, b.vorn, 1.5); }
      }
    }
  }
  // Spuren verschiedener Straßen, die auf ihrer Länge näher als 2,6 m nebeneinander laufen (getrennt kartierte Abbiegespuren,
  // ungenaue Linien): die kürzere so weit zur Seite schieben, dass zwei Autos nebeneinander passen.
  // 07.11.2026 (Wunsch Nr. 77, tools/berlin_verkehr.mjs): gemessen wird nur im Mittelteil der kürzeren Spur und nur, wo beide fast parallel laufen
  // (vorher zählte der kleinste Abstand irgendwo, meist am Spurende an der Kreuzung, und die ganze Spur rückte zur Seite). Geschoben wird von der
  // anderen Spur weg, auch wenn sie in Gegenrichtung läuft (vorher dann auf sie drauf: Gegenspuren lagen übereinander, Autos fuhren durcheinander).
  // Nie in eine Spur derselben Straße hinein.
  const naechster = (p, sp) => { let dm = Infinity, bx = 0, bz = 0, tx = 0, tz = 0; for (let q = 1; q < sp.pts.length; q++) { const A = sp.pts[q - 1], B = sp.pts[q], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2)), fx = A[0] + dx * t, fz = A[1] + dz * t, d = Math.hypot(fx - p[0], fz - p[1]); if (d < dm) { dm = d; bx = fx; bz = fz; const l = Math.sqrt(l2); tx = dx / l; tz = dz / l; } } return { d: dm, x: bx, z: bz, tx, tz }; };
  const mittelProben = sp => { const L = sp.len, out = []; if (L < 8) return out; for (let s = Math.max(3, L * 0.2); s <= L - Math.max(3, L * 0.2) + 0.01; s += Math.max(2, (L * 0.6) / 8)) { let i = 1; while (i < sp.cum.length - 1 && sp.cum[i] < s) i++; const A = sp.pts[i - 1], B = sp.pts[i], t = (s - sp.cum[i - 1]) / Math.max(1e-6, sp.cum[i] - sp.cum[i - 1]), l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; out.push({ p: [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], tx: (B[0] - A[0]) / l, tz: (B[1] - A[1]) / l }); } return out; };
  const geschwister = new Map(); for (const r of R) for (const sp of r.spuren) geschwister.set(sp, R.filter(x => x.kante === r.kante).flatMap(x => x.spuren).filter(o => o !== sp));
  const kasten = sp => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of sp.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } return [x0, x1, z0, z1]; };
  for (let i = 0; i < alleSpuren.length; i++) for (let j = i + 1; j < alleSpuren.length; j++) {
    const a = alleSpuren[i], b = alleSpuren[j];
    if (a.r.kante === b.r.kante) continue;
    const ka = kasten(a), kb = kasten(b); if (ka[0] > kb[1] + 3 || kb[0] > ka[1] + 3 || ka[2] > kb[3] + 3 || kb[2] > ka[3] + 3) continue;   // weit auseinander
    const [kurz, lang] = a.len <= b.len ? [a, b] : [b, a];
    const proben = mittelProben(kurz); if (proben.length < 3) continue;
    let nah = 0, summe = 0, seiteS = 0;
    for (const pr of proben) { const n = naechster(pr.p, lang); if (n.d >= 2.6 || Math.abs(pr.tx * n.tx + pr.tz * n.tz) < 0.9) continue; nah++; summe += n.d; seiteS += Math.sign(-pr.tz * (n.x - pr.p[0]) + pr.tx * (n.z - pr.p[1])); }   // Seite der langen Spur, aus Sicht der kurzen
    if (nah < proben.length * 0.6) continue;
    const dM = summe / nah; if (dM < 0.001) continue;
    const weg = -(Math.sign(seiteS) || 1) * (2.6 - dM), neu = versetzt(kurz.pts, weg);   // von der langen Spur weg
    const alt = kurz.pts; kurz.pts = neu; kurz.cum = laengen(neu); kurz.len = kurz.cum[kurz.cum.length - 1];
    if (geschwister.get(kurz).some(o => mittelProben(kurz).some(pr => naechster(pr.p, o).d < 2.4))) { kurz.pts = alt; kurz.cum = laengen(alt); kurz.len = kurz.cum[kurz.cum.length - 1]; continue; }   // nicht in die eigene Straße schieben
    kurz.vmax = kurz.kurvenTempo();
  }
  // Haltelinie vor dem Überweg: Spurende vor jede Querung ziehen, die in den letzten 14 m liegt
  for (const q of ueberwege) {
    const [a, b] = q.p, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, ax = [a[0] - dx / l, a[1] - dz / l], bx = [b[0] + dx / l, b[1] + dz / l];
    for (const sp of alleSpuren) {
      const s = schnitt(sp.pts, sp.cum, ax, bx);
      if (s < 0) continue;
      if (sp.len - s < 14 && sp.ende === 'kreuzung' && s > 3) { sp.pts = teil(sp.pts, sp.cum, 0, s - 1.2); sp.cum = laengen(sp.pts); sp.len = sp.cum[sp.cum.length - 1]; sp.vmax = sp.kurvenTempo(); }
      else sp.querungen.push(s);
    }
  }
  // Verbindungen an jedem Knoten
  const V = [];
  const erlaubt = (r, k, turn, hatTurn) => {
    if (turn === 'wenden') return k === r.n - 1;
    // Kurzes Stück zwischen zwei Knoten (unter 26 m, ohne Spurpfeile aus OSM): dort kann niemand mehr die Spur wechseln, also darf jede Spur in
    // jede Richtung (19.11.2026: um eine Verkehrsinsel am Potsdamer Platz konnte die linke Spur nur links, die Autos fuhren im Kreis und kamen nie heraus)
    if (r.len < 26 && !(r.turn && r.turn.length === r.n)) return true;
    const tok = r.turn && r.turn.length === r.n ? r.turn[r.n - 1 - k] : null;
    if (tok != null) {
      const ok = turn === 'links' ? /left/.test(tok) : turn === 'rechts' ? /right/.test(tok) : (/through|none|merge/.test(tok) || tok === '');
      if (ok) return true;
      if (hatTurn[turn]) return false;   // eine andere Spur darf diese Richtung: hier nicht
    }
    if (r.n === 1) return true;
    return turn === 'links' ? k === r.n - 1 : turn === 'rechts' ? k === 0 : true;
  };
  const kurveVon = (sp, ziel, turn) => {
    const P0 = sp.pts[sp.pts.length - 1], P3 = ziel.pts[0], t0 = richtung(sp.pts, true), t1 = richtung(ziel.pts, false);
    const dist = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]), wenden = turn === 'wenden';
    return wenden ? kurve(P0, t0, P3, t1, 1.6, 18) : dist < 0.05 ? [P0, P3] : kurve(P0, t0, P3, t1, turn === 'gerade' ? 0.3 : 0.45, Math.max(4, Math.min(22, Math.round(dist / 1.4))));
  };
  const verbinde = (sp, ziel, turn, k, rin, rout) => {
    const pts = kurveVon(sp, ziel, turn);
    const v = new Stueck('verbindung', pts, Math.min(rin.tempo, rout.tempo));
    v.von = sp; v.nach = ziel; v.turn = turn; v.kreuzung = k; v.rin = rin; v.rout = rout; v.gruppe = rin.gruppe; v.konflikte = []; v.id = V.length;
    sp.aus.push(v); (ziel.ein ??= []).push(v); V.push(v); rin.nachbarn.add(rout);
    return v;
  };
  for (const k of K) {
    // Mehrere Ausfahrten derselben Art (zweimal geradeaus, zwei Rechtsabbieger): die Spuren werden von links nach rechts auf die Ausfahrten
    // verteilt, statt jede Spur mit jeder Ausfahrt zu verbinden (sonst kreuzten sich die Kurven, Ernst-Reuter-Platz mit echten Spuren, 07.11.2026)
    const artVon = (rin, rout) => { const wenden = rout.kante === rin.kante, d0 = rin.dirEnde, d1 = rout.dirStart, cross = d0[0] * d1[1] - d0[1] * d1[0], dot = d0[0] * d1[0] + d0[1] * d1[1]; return { turn: wenden ? 'wenden' : dot > 0.82 ? 'gerade' : cross * SEITE > 0 ? 'rechts' : 'links', winkel: Math.atan2(cross * SEITE, dot) }; };
    for (const rin of k.an) for (const rout of k.ab) {
      const wenden = rout.kante === rin.kante;
      if (wenden && k.art !== 'sackgasse') continue;
      if (k.art === 'sackgasse' && !wenden) continue;
      const { turn, winkel } = artVon(rin, rout);   // rechts heißt: Abbiegen ohne Gegenverkehr (im Linksverkehr nach links)
      const hatTurn = {};
      if (rin.turn && rin.turn.length === rin.n) for (const t of rin.turn) { if (/left/.test(t)) hatTurn.links = true; if (/right/.test(t)) hatTurn.rechts = true; if (/through|none|merge/.test(t) || t === '') hatTurn.gerade = true; }
      let ein = rin.spuren.filter(sp => erlaubt(rin, sp.k, turn, hatTurn));
      if (!ein.length) continue;
      if (turn !== 'wenden' && ein.length > 1) {   // Geschwister: andere Ausfahrten derselben Art an diesem Knoten, nach Winkel von links (klein) nach rechts (groß)
        const gleiche = k.ab.filter(o => o.kante !== rin.kante && artVon(rin, o).turn === turn).sort((a, b) => artVon(rin, a).winkel - artVon(rin, b).winkel);
        if (gleiche.length > 1) {
          const t = gleiche.indexOf(rout), m = gleiche.length, E = ein.length, links = [...ein].sort((a, b) => b.k - a.k);   // k groß ist links
          const von = Math.floor(t * E / m), bis = Math.max(von + 1, Math.floor((t + 1) * E / m));
          ein = links.slice(Math.min(von, E - 1), Math.min(E, bis)).sort((a, b) => a.k - b.k);
        }
      }
      ein.forEach((sp, j) => {
        const kOut = turn === 'rechts' ? Math.min(j, rout.n - 1) : turn === 'links' || turn === 'wenden' ? Math.max(0, rout.n - 1 - (ein.length - 1 - j)) : Math.min(sp.k, rout.n - 1);
        verbinde(sp, rout.spuren[kOut], turn, k, rin, rout);
      });
    }
    // Spuren ohne Verbindung (Spurpfeile ohne passende Straße, zum Beispiel Linksabbieger in einen Tunnel): an die Ziele der
    // Nachbarspur anschließen (Zusammenführen). Führt am Knoten gar nichts weiter, fahren die Autos dort hinaus wie an einem Portal.
    for (const rin of k.an) for (const sp of rin.spuren) {
      if (sp.aus.length) continue;
      const nachbar = rin.spuren.filter(o => o.aus.length).sort((a, b) => Math.abs(a.k - sp.k) - Math.abs(b.k - sp.k))[0];
      if (!nachbar) { if (k.art !== 'sackgasse' && k.art !== 'frei') sp.ende = 'portal'; continue; }
      for (const v of nachbar.aus) verbinde(sp, v.nach, v.turn, k, rin, v.rout);
    }
    // Haltelinien zurücksetzen (19.11.2026, Wunsch Nr. 106, tools/verkehr_labor.mjs): ein Bus (13,7 m, als starres Rechteck von Bug bis Heck auf
    // der Spur) schwenkt beim Abbiegen mit der Mitte über die Ecke der Kreuzung. Dort stehen die wartenden Autos des Nachbararms: fast alle
    // restlichen Fälle von Fahrzeugen ineinander waren Busse und Lastwagen an solchen Stellen. Wie in echt rückt die Haltelinie dieser Spur
    // zurück, bis ein wartendes Auto frei steht (in Schritten von 1,5 m, höchstens 6 m, die Spur bleibt mindestens 9 m lang)
    if (k.art === 'kreuzung' && !verkehr.ohneRueck) {
      const LB = 13.73, cB = LB * 0.82, hbB = 2.55 / 2 + 0.15, LA = 4.8, hbA = 1.85 / 2;
      const punkt = (pts, cum, s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = Math.max(0, Math.min(1, (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]))); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; };
      const posen = [];   // Rechtecke des Busses auf jeder Abbiegekurve dieses Knotens: [Mitte x, z, Richtung x, z, Verbindung]
      for (const v of V) {
        if (v.kreuzung !== k || v.nach.len < 3) continue;
        const a = teil(v.von.pts, v.von.cum, Math.max(0, v.von.len - cB - 0.5), v.von.len), b = teil(v.nach.pts, v.nach.cum, 0, Math.min(v.nach.len, LB + 1));
        const weg = a.concat(v.pts.slice(1), b.slice(1)), cw = laengen(weg), s0 = laengen(a).at(-1), s1 = Math.min(cw.at(-1), s0 + v.len + LB * 0.6);
        for (let f = s0 + 1; f <= s1; f += 1) { const F = punkt(weg, cw, f), H = punkt(weg, cw, Math.max(0, f - cB)); let dx = F[0] - H[0], dz = F[1] - H[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; posen.push([F[0] - dx * LB / 2, F[1] - dz * LB / 2, dx, dz, v]); }
      }
      if (posen.length) for (const rin of k.an) for (const sp of rin.spuren) {
        if (sp.len < 10.5 || !sp.aus.length) continue;
        const trifft = d => { const sF = sp.len - 1.2 - d, F = punkt(sp.pts, sp.cum, sF), H = punkt(sp.pts, sp.cum, Math.max(0, sF - 4)); let dx = F[0] - H[0], dz = F[1] - H[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const cx = F[0] - dx * LA / 2, cz = F[1] - dz * LA / 2;
          for (const q of posen) { if (q[4].von === sp) continue; if ((q[0] - cx) * (q[0] - cx) + (q[1] - cz) * (q[1] - cz) > 100) continue; if (boxenUeber(q[0], q[1], q[2], q[3], LB / 2, hbB, cx, cz, dx, dz, LA / 2, hbA)) return true; } return false; };
        if (!trifft(0)) continue;
        let um = 0; for (const d of [1.5, 3, 4.5, 6]) { if (sp.len - d < 9) break; if (!trifft(d)) { um = d; break; } }
        if (!um) continue;   // auch 6 m weiter hinten nicht frei (Spuren laufen dort nebeneinander): bleibt
        kuerze(sp, false, um); sp.rueck = um;
        for (const v2 of sp.aus) { v2.pts = kurveVon(sp, v2.nach, v2.turn); v2.cum = laengen(v2.pts); v2.len = Math.max(0.01, v2.cum[v2.cum.length - 1]); v2.vmax = v2.kurvenTempo(); }
      }
    }
    // Konfliktflächen: Verbindungen derselben Kreuzung, die sich näher als 2,4 m kommen (kreuzen oder zusammenführen),
    // mit dem Konfliktpunkt (Meter ab Anfang) auf beiden Verbindungen für die Lückenprüfung nach Zeit
    const hier = V.filter(v => v.kreuzung === k);
    for (let i = 0; i < hier.length; i++) for (let j = i + 1; j < hier.length; j++) {
      const a = hier[i], b = hier[j];
      if (a.von === b.von) continue;
      // erster und letzter Punkt, an dem sich die Kurven näher als 2,8 m kommen (Bus 2,55 m breit plus Luft)
      let sa = -1, sb = -1, ea = -1, eb = -1;
      for (let p = 0; p < a.pts.length; p++) for (let q = 0; q < b.pts.length; q++) if (Math.hypot(a.pts[p][0] - b.pts[q][0], a.pts[p][1] - b.pts[q][1]) < 2.8) {
        if (sa < 0) sa = a.cum[p];
        sb = sb < 0 ? b.cum[q] : Math.min(sb, b.cum[q]);   // 19.11.2026: vorher der Punkt auf b, der zum ersten nahen Punkt von a gehörte. Der Konflikt begann für b dadurch oft zu spät, sein Wartepunkt lag mitten in der Bahn von a (wartende und kreuzende Autos standen ineinander)
        ea = Math.max(ea, a.cum[p]); eb = Math.max(eb, b.cum[q]);
      }
      if (sa < 0) continue;
      // Zusammenführen in dieselbe Spur (Konflikt erst am Ende beider Kurven): Reißverschluss über den Vordermann, kein Warten davor
      // 19.11.2026: der Reißverschluss gilt für alle Kurven in dieselbe Spur (vorher nur, wenn sie erst am Ende zusammenliefen: bei längerem
      // gemeinsamem Stück kamen zwei nebeneinander an und standen in der Schlange ineinander), die Vorfahrt beim Einfahren bleibt
      if (a.nach === b.nach) { (a.mergeMit ??= new Set()).add(b); (b.mergeMit ??= new Set()).add(a); if (sa > a.len - 4 && sb > b.len - 4) continue; }
      a.konflikte.push(b); b.konflikte.push(a); (a.konfliktS ??= new Map()).set(b, sa); (b.konfliktS ??= new Map()).set(a, sb);
      (a.konfliktEnde ??= new Map()).set(b, ea); (b.konfliktEnde ??= new Map()).set(a, eb);
    }
    // Wartepunkt in der Kreuzung (nur mit Ampel): bis hierhin darf man bei Grün einfahren und auf die Lücke im Gegenverkehr warten,
    // wie ein Linksabbieger im echten Verkehr, der die Kreuzung dann in der Räumzeit verlässt
    for (const v of hier) {
      v.wartepunkt = null;
      if (!k.signal || !v.konflikte.length) continue;
      v.wartepunkt = Math.max(0, Math.min(...v.konflikte.map(c => v.konfliktS.get(c))) - 1.6);
    }
  }
  // Ampelgruppen an Kreuzungen mit Signal (wenn die Kanten keine Gruppe mitbringen): gegenüberliegende Arme teilen eine Gruppe.
  // Bis vier Arme: nach Winkel sortiert abwechselnd zwei Gruppen (bei einer T Kreuzung die durchgehende Straße gegen den Abzweig),
  // mehr Arme: Paare mit dem größten Gegenwinkel. Nie mehr als drei Gruppen, sonst wird die Rotzeit länger als 90 s.
  const anlagen = [];
  // Verbund (19.11.2026, Wunsch Nr. 106, tools/verkehr_labor.mjs): eine Kreuzung mit Mittelstreifen besteht in den Daten aus mehreren Knoten,
  // 14 bis 34 m auseinander. Jeder Knoten hatte seine eigene Anlage mit eigenem Takt: wer die erste Linie bei Grün überfuhr, stand an der zweiten
  // bei Rot, auf einem 2 bis 4 m kurzen Stück mit dem Heck in der Kreuzung, und ganze Zufahrten kamen über Minuten nicht durch (an sechs Berliner
  // Kreuzungen stand ein Fünftel der Fahrzeuge länger als 60 s). Jetzt bilden Ampelknoten, die über Kanten bis 34 m verbunden sind, eine Anlage:
  // Gruppen nach der Achse der Zufahrten von außen (bis 38 Grad Abweichung eine Gruppe, höchstens drei), die Stücke im Inneren haben keine
  // Haltelinie mit Ampel. Wer drin ist, räumt die Kreuzung nach den Vorfahrtsregeln (vorfahrt: Grün geht vor)
  const mitAmpel = k => k.signal && !k.an.some(r => r.gruppe && !r.verbund), eltern = K.map((_, i) => i);
  const wurzel = i => { while (eltern[i] !== i) { eltern[i] = eltern[eltern[i]]; i = eltern[i]; } return i; };
  for (const r of R) if (r.len <= 34 && mitAmpel(K[r.von]) && mitAmpel(K[r.nach])) { const a = wurzel(r.von), b = wurzel(r.nach); if (a !== b) eltern[Math.max(a, b)] = Math.min(a, b); }
  const verbund = new Map(); K.forEach((k, i) => { if (!mitAmpel(k)) return; const w = wurzel(i); (verbund.get(w) || verbund.set(w, []).get(w)).push(i); });
  for (const knoten of verbund.values()) {
    if (knoten.length < 2) continue;
    const drin = new Set(knoten), arme = [];
    for (const i of knoten) { K[i].verbund = knoten; for (const r of K[i].an) if (!drin.has(r.von)) arme.push(r); }
    if (arme.length < 2) continue;
    const achse = r => { const a = Math.atan2(r.dirEnde[1], r.dirEnde[0]); return ((a % Math.PI) + Math.PI) % Math.PI; };
    const abw = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
    const gruppen = [];
    for (const r of [...arme].sort((a, b) => b.rang - a.rang || b.n - a.n || a.id - b.id)) {
      const w = achse(r); let best = null, bd = 0.66;
      for (const g of gruppen) { const d = abw(w, g.w); if (d < bd) { bd = d; best = g; } }
      if (!best && gruppen.length >= 3) { bd = Infinity; for (const g of gruppen) { const d = abw(w, g.w); if (d < bd) { bd = d; best = g; } } }
      if (best) best.r.push(r); else gruppen.push({ w, r: [r] });
    }
    gruppen.sort((a, b) => a.w - b.w);   // feste Reihenfolge: derselbe Verbund schaltet in zwei Orten gleich
    const ji = knoten.reduce((m, i) => K[i].x < K[m].x - 0.01 || (Math.abs(K[i].x - K[m].x) <= 0.01 && K[i].z < K[m].z) ? i : m, knoten[0]);
    gruppen.forEach((g, gi) => { const key = `${ji}:${gi}`; for (const r of g.r) { r.gruppe = key; r.verbund = true; for (const sp of r.spuren) { sp.gruppe = key; for (const v of sp.aus) v.gruppe = key; } } });
    anlagen.push({ j: ji, knoten, gruppen: gruppen.map((g, gi) => ({ key: `${ji}:${gi}`, dauer: Math.max(...g.r.map(r => r.rang)) >= 4 ? 17 : 11 })) });
  }
  for (const [ji, k] of K.entries()) {
    if (!k.signal || k.verbund || k.an.some(r => r.gruppe) || k.an.length < 2) continue;
    const arme = k.an.map(r => ({ r, w: Math.atan2(r.dirEnde[1], r.dirEnde[0]) })).sort((a, b) => a.w - b.w), gruppen = [];
    if (arme.length <= 4) { gruppen.push(arme.filter((_, i) => i % 2 === 0).map(a => a.r)); const u = arme.filter((_, i) => i % 2 === 1).map(a => a.r); if (u.length) gruppen.push(u); }
    else {
      const frei = new Set(arme);
      for (const a of arme) {
        if (!frei.has(a)) continue; frei.delete(a);
        let partner = null, best = 0;
        for (const b of frei) { const d = Math.abs(Math.atan2(Math.sin(a.w - b.w), Math.cos(a.w - b.w))); if (d > 1.9 && d > best) { best = d; partner = b; } }
        if (partner) frei.delete(partner);
        gruppen.push([a.r, ...(partner ? [partner.r] : [])]);
      }
      while (gruppen.length > 3) { const kl = gruppen.pop(); gruppen.sort((a, b) => a.length - b.length)[0].push(...kl); }
    }
    gruppen.forEach((g, gi) => { const key = `${ji}:${gi}`; for (const r of g) { r.gruppe = key; for (const sp of r.spuren) { sp.gruppe = key; for (const v of sp.aus) v.gruppe = key; } } });
    anlagen.push({ j: ji, gruppen: gruppen.map((g, gi) => ({ key: `${ji}:${gi}`, dauer: Math.max(...g.map(r => r.rang)) >= 4 ? 17 : 11 })) });
  }
  // Haltestellen an die rechte Spur
  for (const h of halte) {
    let best = null, bd = 7;
    for (const r of R) { const sp = r.spuren[0]; if (!sp) continue; const [s, d] = naechste(sp, h[0], h[1]); if (d < bd && s > 6 && s < sp.len - 6) { bd = d; best = { sp, s }; } }
    if (best) best.sp.halte.push(best.s);
  }
  // Parkstreifen: Plätze rechts neben der rechten Spur, nicht an Kreuzungen, Überwegen und Haltestellen
  const Rz = rng(parkenSeed), parkplaetze = [];
  for (const r of R) {
    if (!r.park) continue;
    const sp = r.spuren[0];
    const stellen = []; if (welt) { for (const s of weltStellen(sp.pts, 6.3, 0, welt[0], welt[1])) if (s >= 6 && s < sp.len - 12) stellen.push(s); } else for (let s = 6; s < sp.len - 12; s += 6.3) stellen.push(s);
    for (const s of stellen) {
      const mitte = sp.bei(s, new THREE.Vector3()), seed = welt ? hashXZ((mitte.x + welt[0]) * 0.5, (mitte.z + welt[1]) * 0.5) : 0;   // ohne Welt wie bisher: Zufallsfolge unverändert
      if (welt ? rng(seed)() > 0.78 : Rz() > 0.58) continue;   // Parkstreifen in der Stadt fast voll (Nr. 92, vorher 58 %)
      if (sp.querungen.some(q => Math.abs(q - s) < 5) || sp.halte.some(h => Math.abs(h - s) < 15)) continue;
      const a = sp.bei(s - 2.5, new THREE.Vector3()), b = sp.bei(s + 2.5, new THREE.Vector3()), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const off = r.lw / 2 + r.park / 2 + 0.05;
      parkplaetze.push({ x: (a.x + b.x) / 2 - dz / l * off * SEITE, z: (a.z + b.z) / 2 + dx / l * off * SEITE, w: Math.atan2(dx / l, dz / l), r, seed });
    }
  }
  for (const q of stellen) parkplaetze.push({ x: q[0], z: q[1], w: q[2], r: null, seed: q[3] });   // Stellplätze auf Parkplätzen (kit/ortbau.js)
  return { K, R, V, spuren: alleSpuren, anlagen, parkplaetze, seite: SEITE, links, hoehe: hoehe || (() => 0), welt };
}
// nächste Stelle auf einer Spur zu einem Punkt: [s, Abstand]
function naechste(sp, x, z) {
  let bs = 0, bd = Infinity;
  for (let i = 1; i < sp.pts.length; i++) {
    const p = sp.pts[i - 1], q = sp.pts[i], dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2)), d = Math.hypot(p[0] + dx * t - x, p[1] + dz * t - z);
    if (d < bd) { bd = d; bs = sp.cum[i - 1] + t * (sp.cum[i] - sp.cum[i - 1]); }
  }
  return [bs, bd];
}

// ---------- Ampeln für echte Orte: je Kreuzung ein Umlauf über ihre Gruppen ----------
export class Signalanlagen {
  // netz mit welt (Erde): Versatz je Kreuzung aus ihrer Weltlage, Zeit von einer gemeinsamen Uhr. So zeigt dieselbe Ampel in zwei
  // Orten dieselbe Farbe, der Ortswechsel schaltet keine Ampel um (Wunsch Nr. 36)
  constructor(anlagen, seed = 4, fallback = null, netz = null) {
    const Rz = rng(seed), W = netz?.welt;
    this.uhr = W ? () => performance.now() / 1000 : null;
    this.anlagen = anlagen.map(a => {
      const z = [];
      for (const g of a.gruppen) z.push(['gruen', g.key, g.dauer], ['gelb', g.key, 3], ['rot', null, 2]);
      const lang = z.reduce((s, p) => s + p[2], 0), k = W && netz.K[a.j];
      const off = k ? rng(hashXZ((k.x + W[0]) / 4, (k.z + W[1]) / 4))() * lang : Rz() * lang;
      return { ...a, zyklus: z, lang, off, t: this.uhr ? this.uhr() + off : off };
    });
    this.je = new Map(); for (const a of this.anlagen) for (const g of a.gruppen) this.je.set(g.key, a);
    this.fallback = fallback;   // Ampelsteuerung der Kreuzung (Gruppen H und Q) für Überwege ohne zugeordnete Kreuzung
    this.koepfe = null;
  }
  phase(a) { let t = a.t % a.lang; for (const p of a.zyklus) { if (t < p[2]) return [p, p[2] - t]; t -= p[2]; } return [a.zyklus[0], 0]; }
  farbe(key) {
    if (!key) return null;
    const a = this.je.get(key);
    if (!a) return this.fallback ? (() => { const [r, f] = this.fallback.phase(); return r === key ? f : 'rot'; })() : null;
    const [[f, g]] = this.phase(a);
    return g === key ? f : 'rot';
  }
  // bis die Gruppe wieder Grün bekommt (Sekunden)
  bisGruen(key) {
    const a = this.je.get(key); if (!a) return 0;
    let t = a.t % a.lang, rest = 0;
    for (let runde = 0; runde < 2; runde++) for (const p of a.zyklus) { if (t > 0) { if (t < p[2]) { rest += p[2] - t; t = 0; if (p[0] === 'gruen' && p[1] === key) return 0; } else { t -= p[2]; } continue; } if (p[0] === 'gruen' && p[1] === key) return rest; rest += p[2]; }
    return rest;
  }
  // wie lange die Gruppe noch Grün zeigt (Sekunden, 0 wenn sie gerade nicht Grün hat, ohne Anlage unbegrenzt)
  gruenRest(key) { const a = this.je.get(key); if (!a) return Infinity; const [[f, g], rest] = this.phase(a); return f === 'gruen' && g === key ? rest : 0; }
  // Fußgänger: Überweg über die Fahrbahn einer Gruppe ist frei, solange diese Gruppe Rot hat und noch mindestens 4 s Rot bleibt
  fussgaengerGruen(key) {
    if (!key) return true;
    if (key.startsWith('x:')) { const g = key.slice(2); return this.farbe(g) === 'rot' && this.bisGruen(g) > 4; }
    if (this.fallback) return this.fallback.fussgaengerGruen(key);
    return true;
  }
  update(dt) {
    if (this.uhr) { const t = this.uhr(); for (const a of this.anlagen) a.t = t + a.off; }
    else for (const a of this.anlagen) a.t += dt;
    if (this.fallback) this.fallback.update(dt);
    if (this.koepfe) this.koepfe.update(this);
  }
}

// Signalköpfe (Wunsch Nr. 88, 09.11.2026, Nader: "da stehen auch Ampeln mitten auf der Straße in der Kreuzung"): ein Kopf je ankommender
// Signalgruppe, aber nur an einem Mast neben der Fahrbahn. Masten sind die Fußgängerampeln des Ortes (kit/ortbau.js Abschnitt 7: je Überweg an
// beiden Bordsteinen 0,7 m auf dem Gehweg oder der Insel, nie auf der Fahrbahn). Gewählt wird der Mast rechts der Spuren dieser Gruppe nahe der
// Haltelinie (10 m davor bis 8 m dahinter, seitlich bis 12 m hinter der äußeren Spur). Ohne passenden Mast kein Kopf. Vorher stand der Mast neben
// der ersten Spur und damit bei mehreren Spuren zwischen ihnen, in großen Kreuzungen mitten auf der Kreuzung (Potsdamer Platz).
export function signalkopfStellen(netz, { masten = [] } = {}) {
  const S = netz.seite || 1, out = [], belegt = masten.map(() => []);
  for (const a of netz.anlagen) for (const g of a.gruppen) for (const r of netz.R.filter(r => r.gruppe === g.key)) {
    if (!r.spuren?.length) continue;
    let px = 0, pz = 0; for (const sp of r.spuren) { const P = sp.pts[sp.pts.length - 1]; px += P[0]; pz += P[1]; } px /= r.spuren.length; pz /= r.spuren.length;
    const d = richtung(r.spuren[0].pts, true), nx = -d[1] * S, nz = d[0] * S, breit = r.spuren.length * (r.lw || 3.2) / 2, ry = Math.atan2(-d[0], -d[1]);
    let best = -1, bk = Infinity;
    for (let i = 0; i < masten.length; i++) {
      const m = masten[i], rx = m[0] - px, rz = m[1] - pz, vor = rx * d[0] + rz * d[1], seit = rx * nx + rz * nz;
      if (vor < -10 || vor > 8 || seit < breit - 0.5 || seit > breit + 12) continue;
      if (belegt[i].some(w => Math.abs(Math.atan2(Math.sin(w - ry), Math.cos(w - ry))) < 0.5)) continue;   // gleiche Blickrichtung schon belegt
      const k = Math.abs(vor - 1) + Math.abs(seit - breit - 2) * 0.6; if (k < bk) { bk = k; best = i; }
    }
    if (best < 0) continue;
    belegt[best].push(ry); out.push({ x: masten[best][0], z: masten[best][1], ry, key: g.key, mast: best });
  }
  return out;
}
// Signalköpfe zeichnen: der Fußgängermast des Ortes (3,4 m) wird nach oben verlängert, darauf der Kopf für die Fahrbahn mit drei Lampen als Instanzen
export function baueSignalkoepfe(netz, mats, { masten: mastListe = [] } = {}) {
  const koepfe = signalkopfStellen(netz, { masten: mastListe });
  const gruppe = new THREE.Group(); if (!koepfe.length) return { gruppe, update() {} };
  const mast = new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8); mast.translate(0, 3.75, 0);   // Verlängerung des Fußgängermasts (3,2 bis 4,3 m)
  const geh = new THREE.BoxGeometry(0.34, 0.98, 0.26); geh.translate(0, 3.6, -0.02);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  const masten = new THREE.InstancedMesh(mergeGeos([mast, geh]), mats.mast, koepfe.length);
  const lampe = new THREE.InstancedMesh(new THREE.CircleGeometry(0.1, 14), lampenMaterial(), koepfe.length * 3);
  koepfe.forEach((k, i) => {
    const hy = netz.hoehe ? netz.hoehe(k.x, k.z) : 0;
    masten.setMatrixAt(i, M.compose(new THREE.Vector3(k.x, 0.12 + hy, k.z), Q.setFromAxisAngle(Y, k.ry), _s));
    [0.31, 0, -0.31].forEach((yy, j) => {
      const lx = k.x + Math.sin(k.ry) * 0.135, lz = k.z + Math.cos(k.ry) * 0.135;
      lampe.setMatrixAt(i * 3 + j, M.compose(new THREE.Vector3(lx, 0.12 + hy + 3.6 + yy, lz), Q.setFromAxisAngle(Y, k.ry), _s));
      lampe.setColorAt(i * 3 + j, new THREE.Color(0x050505));
    });
  });
  masten.castShadow = true; masten.computeBoundingSphere(); lampe.computeBoundingSphere();
  gruppe.add(masten, lampe);
  const farben = { rot: [new THREE.Color(0xff2a1a), null, null], gelb: [null, new THREE.Color(0xffb21a), null], gruen: [null, null, new THREE.Color(0x2aff7a)] }, aus = new THREE.Color(0x050505);
  return { gruppe, update(anlagen) {
    koepfe.forEach((k, i) => { const f = farben[anlagen.farbe(k.key)] || farben.rot; for (let j = 0; j < 3; j++) lampe.setColorAt(i * 3 + j, f[j] || aus); });
    lampe.instanceColor.needsUpdate = true;
  } };
}
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g of list) { const ng = g.toNonIndexed(); pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
function lampenMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 3.2 });
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= vColor.rgb;'); };
  m.customProgramCacheKey = () => 'ampellampe';
  return m;
}

// Überwege der Menschen den Ampelgruppen zuordnen: Schlüssel x:<gruppe> der Fahrbahn, die der Überweg quert
export function ueberwegePhasen(wege, netz) {
  const N = wege.knoten.map(k => Array.isArray(k) ? [k[0], k[1]] : [k.x, k.z]);
  let zugeordnet = 0;
  for (const e of wege.kanten) {
    if (e[2] !== 'ueberweg' || !e[3]) continue;
    const a = N[e[0]], b = N[e[1]], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    let best = null, bd = 9;
    for (const r of netz.R) { if (!r.gruppe) continue; for (const sp of r.spuren) { if (sp.ende !== 'kreuzung') continue; const [, d] = naechste(sp, mx, mz); if (d < bd) { bd = d; best = r; } } }   // nur ankommende Spuren: die abgehende trägt sonst die Gruppe der nächsten Ampel (Prüfung Nr. 103)
    if (!best) for (const r of netz.R) { if (!r.gruppe) continue; for (const sp of r.spuren) { const [, d] = naechste(sp, mx, mz); if (d < bd) { bd = d; best = r; } } }
    if (!best) {   // nur abgehende Spuren getroffen (Einbahn): Gruppe des Arms, der geradeaus hineinführt
      for (const r of netz.R) { if (r.gruppe) continue; for (const sp of r.spuren) { const [, d] = naechste(sp, mx, mz); if (d < bd) { bd = d; best = r; } } }
      if (best) { const k = netz.K[best.von]; const g = k.an.find(x => x.gruppe && x.dirEnde[0] * best.dirStart[0] + x.dirEnde[1] * best.dirStart[1] > 0.5); best = g || null; }
    }
    if (best) { e[3] = 'x:' + best.gruppe; zugeordnet++; }
  }
  return zugeordnet;
}

// Verkehr gehört auf die Hauptstraßen (19.11.2026, tools/verkehr_labor.mjs): jedes Fahrzeug startete irgendwo und fuhr auf dem kürzesten Weg zu
// irgendeiner Ausfahrt, also quer durch die Wohnstraßen. Dort stauten sich die Schlangen über mehrere Kreuzungen zurück, einzelne warteten über
// 2 Minuten. Jetzt kostet ein Meter Wohnstraße in der Route mehr als ein Meter Hauptstraße, und Start und Ziel liegen meist an großen Straßen
const WEG_FAKTOR = r => r.rang >= 5 ? 0.85 : r.rang === 4 ? 1 : r.rang === 3 ? 1.35 : 2.2;
const ANTEIL_RANG = r => r.rang >= 5 ? 1 : r.rang === 4 ? 0.85 : r.rang === 3 ? 0.5 : 0.22;
const K_ART = (netz, sp) => netz.K[sp.r.von].art === 'kreuzung' && netz.K[sp.r.nach].art === 'kreuzung';   // Spur zwischen zwei Kreuzungsknoten
// ---------- Verkehr ----------
export class Verkehr {
  // netz aus baueNetz, flotte zeichnet (kit/vehicles.js Flotte), signale mit farbe(gruppe), menge liefert Fußgänger
  // fokus: Punkt, um den die Blase liegt (Blickpunkt der Kamera bei Übersichten), sonst die Kamera selbst
  // Dichte (Nr. 111, 26.11.2026, Nader: "Verkehr nicht zu dicht, sodass man noch durchfahren kann"): die Zahl der Fahrzeuge folgt der Länge der
  // Fahrspuren im Umkreis (dichte = Fahrzeuge je Kilometer Fahrspur), höchstens anzahlMax. Vorher fuhren immer gleich viele: 17 bis 20 je
  // Spurkilometer in der Innenstadt, 52 an einer Autobahn mit wenig Straßen ringsum (Stau). Alle 2 s neu gerechnet
  dichteSetzen() {
    this.dichteT = 2; if (!this.dichte || !this.blase || !this.fokus) return;
    const c = this.fokus, rr = this.blase.radius; let m = 0;
    for (const r of this.netz.R) { const q = r.pts[r.pts.length >> 1]; if (Math.hypot(q[0] - c.x, q[1] - c.z) < rr) m += r.len * r.n; }
    this.anzahl = Math.max(Math.min(8, this.anzahlMax), Math.min(this.anzahlMax, Math.round(m / 1000 * this.dichte)));
  }
  constructor({ netz, flotte, typen, signale, menge = null, kamera, fokus = null, anzahl = 12, seed = 21, mobil = false, blase = null, parken = true, land = false, dichte = 0 }) {
    this.netz = netz; this.flotte = flotte; this.typen = typen; this.signale = signale; this.menge = menge; this.kamera = kamera; this.fokus = fokus || kamera.position;
    this.anzahl = anzahl; this.anzahlMax = anzahl; this.dichte = dichte; this.R = rng(seed); this.mobil = mobil; this.blase = blase; this.alle = []; this.anhaenger = []; this.t = 0; this.naechsteId = 1;
    this.routen = new Map(); this.statistik = { eingefahren: 0, rotVerstoesse: 0, konflikte: 0, ueberlappungen: 0, maxWarte: 0, wendungen: 0 };
    // Ziele: Fahrtrichtungen, die an einem Rand oder Portal enden; Einfahrten: Fahrtrichtungen, die dort beginnen
    this.ausfahrten = netz.R.filter(r => ['rand', 'portal'].includes(netz.K[r.nach].art));
    this.einfahrten = netz.R.filter(r => ['rand', 'portal'].includes(netz.K[r.von].art));
    this.anteile = typen.map(t => (land && t.def.anteilLand) || (!land && t.def.anteilStadt) || t.def.anteil);   // Traktoren nur auf dem Land, Sattelzüge in der Stadt selten
    this.geparkt = parken ? this.parken() : [];
    this.dichteSetzen(); for (let i = 0; i < this.anzahl; i++) this.neu(true);
  }

  // Routen: nächster Schritt je Fahrtrichtung zu einem Ziel (Dijkstra vom Ziel aus über die Verbindungen)
  route(ziel) {
    let r = this.routen.get(ziel); if (r) return r;
    const R = this.netz.R, n = R.length, D = new Float64Array(n).fill(Infinity), W = new Int32Array(n).fill(-1);
    const vor = R.map(() => []); for (const x of R) for (const y of x.nachbarn) vor[y.id].push(x);
    const heap = [[0, ziel.id]]; D[ziel.id] = 0; W[ziel.id] = ziel.id;
    const hoch = i => { while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const runter = i => { for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } };
    while (heap.length) {
      const [d, u] = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; runter(0); }
      if (d > D[u]) continue;
      for (const x of vor[u]) { const nd = d + x.len * WEG_FAKTOR(x) + 6; if (nd < D[x.id]) { D[x.id] = nd; W[x.id] = u; heap.push([nd, x.id]); hoch(heap.length - 1); } }
    }
    r = { D, W }; if (this.routen.size > 120) this.routen.delete(this.routen.keys().next().value); this.routen.set(ziel, r);
    return r;
  }
  naechsteR(r, ziel) { const w = this.route(ziel).W[r.id]; return w < 0 || w === r.id ? null : this.netz.R[w]; }

  waehleTyp(nurPkw = false) {
    let s = 0; const g = this.anteile.map((a, i) => { const d = this.typen[i].def; return nurPkw && d.klasse !== 'pkw' && d.klasse !== 'taxi' ? 0 : a; }), sum = g.reduce((a, b) => a + b, 0);
    const z = this.R() * sum; for (let i = 0; i < g.length; i++) { s += g[i]; if (z <= s) return i; }
    return 0;
  }

  // Ziel: eine Ausfahrt, die erreichbar ist und nicht die eigene Straße
  neuesZiel(r) {
    for (let t = 0; t < 30; t++) {
      const z = this.ausfahrten[Math.floor(this.R() * this.ausfahrten.length)];
      if (!z || z.kante === r.kante) continue;
      if (t < 20 && this.R() > ANTEIL_RANG(z)) continue;   // Ziele liegen meist an Hauptstraßen
      if (this.route(z).D[r.id] < Infinity) return z;
    }
    return null;
  }
  // Spur auf r, die die nächste Abbiegung erlaubt. Große Fahrzeuge (Lkw, Bus) halten sich rechts (08.11.2026: sie waren an den meisten
  // Überlappungen beteiligt, mit echten Spuren aus OSM gibt es viel mehr mehrspurige Straßen)
  // Führt die Spur zur nächsten Straße der Route, und geht es von einem kurzen Stück dahinter (unter 30 m, kein Spurwechsel mehr) auch weiter?
  spurPasst(sp, ziel, weit = true) {
    const nr = ziel ? this.naechsteR(sp.r, ziel) : null; if (!nr) return true;
    for (const v of sp.aus) {
      if (v.rout !== nr) continue;
      const z = v.nach; if (!weit || z.len >= 30 || !z.aus.length) return true;
      const nr2 = this.naechsteR(nr, ziel); if (!nr2 || z.aus.some(w => w.rout === nr2)) return true;
    }
    return false;
  }
  passendeSpur(r, ziel, gross = false) {
    let gut = r.spuren.filter(sp => this.spurPasst(sp, ziel)); if (!gut.length) gut = r.spuren.filter(sp => this.spurPasst(sp, ziel, false));
    const liste = gut.length ? gut : r.spuren;
    return gross ? liste.reduce((a, b) => b.k < a.k ? b : a) : liste[Math.floor(this.R() * liste.length)];
  }

  // Sattelzug mit Gelenk (19.11.2026, Wunsch Nr. 106): Zugmaschine und Auflieger sind zwei Fahrzeugtypen (kit/vehicles.js, gelenk: { anh, zapfen,
  // anhVorn, anhAchse }). Die Zugmaschine ist das Fahrzeug (fz.L ihre Länge, fz.pos ihr Rechteck), der Auflieger hängt als fz.anh daran: sein
  // Königszapfen liegt zapfen Meter hinter dem Bug auf der Spur, seine Achsmitte anhAchse Meter dahinter. fz.LG ist die Länge des ganzen Zugs auf
  // der Spur (für Abstand, Platz, Vordermann). Vorher war der Sattelzug ein starres Rechteck von 16,5 m und schwenkte beim Abbiegen über die
  // wartenden Autos am Nachbararm
  gesamtLaenge(def) {
    const g = def.gelenk, ti = g ? this.typen.findIndex(t => t?.def.id === g.anh) : -1;
    return ti < 0 ? def.laenge : Math.max(def.laenge, g.zapfen - g.anhVorn + this.typen[ti].def.laenge);
  }
  anhaengen(fz) {
    fz.LG = fz.L; const g = fz.def.gelenk; if (!g) return;
    const ti = this.typen.findIndex(t => t?.def.id === g.anh); if (ti < 0) return;
    const d = this.typen[ti].def;
    fz.anh = { typ: ti, def: d, L: d.laenge, B: d.breite, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), spin: 0, lenk: 0, nick: 0, neigung: 0, hang: 0, stufe: -1, v: 0, zug: fz, farbWert: (fz.id * 0.61803) % 1 };
    fz.LG = this.gesamtLaenge(fz.def); fz.heck = fz.anh; this.anhaenger.push(fz.anh);   // heck: Rück und Bremslichter sitzen am Auflieger (kit/nachtlicht.js)
  }
  // Neues Fahrzeug an einer Einfahrt (am Start: irgendwo auf dem Netz, außer in Kamera Nähe bei großer Blase)
  neu(start = false) {
    const cam = this.fokus, sicht = this.blase ? (this.mobil ? 55 : 90) : 0;
    let sp = null, s = 0;
    for (let t = 0; t < 80 && !sp; t++) {
      let r;
      if (this.blase) { r = this.netz.R[Math.floor(this.R() * this.netz.R.length)]; if (r && this.R() > ANTEIL_RANG(r)) continue; }   // große Straßen öfter (Nader 02.11.2026: "so wenig Verkehr" auf der Hauptstraße)
      else r = start ? this.netz.R[Math.floor(this.R() * this.netz.R.length)] : this.einfahrten[Math.floor(this.R() * this.einfahrten.length)];
      if (!r || !r.spuren.length) continue;
      const kand = this.passendeSpur(r, null);
      const s0 = start || this.blase ? 6 + this.R() * Math.max(0, kand.len - 24) : 0.5;   // nie in den letzten Metern vor der Haltelinie
      if (kand.len < 24) continue;
      const P = kand.bei(s0, _p);
      const spl = this.spieler; if (spl?.pos && Math.hypot(P.x - spl.pos.x, P.z - spl.pos.z) < 16) continue;   // nie im oder am Spieler einsetzen (08.11.2026: in der Szene erschien ein KI Auto mitten im stehenden Spielerauto an einer Einfahrt)
      const d = Math.hypot(P.x - cam.x, P.z - cam.z);
      if (this.blase && (d > this.blase.radius || (!start && d < sicht))) continue;
      if (!this.blase && !start && this.einfahrten.length && d < 1e9) { /* Kreuzung: Einfahrt am Rand, Kamera sieht sie ohnehin */ }
      sp = kand; s = s0;
    }
    if (!sp) return null;
    let typ = this.waehleTyp(); if (this.typen[typ].def.nurBreit && !(sp.r.spuren?.length >= 2 || sp.r.tempo > 16)) typ = this.waehleTyp(true);   // Sattelzüge nur auf großen Straßen
    const T = this.typen[typ], L = this.gesamtLaenge(T.def);
    const ziel = this.neuesZiel(sp.r);
    const besser = this.passendeSpur(sp.r, ziel, T.def.klasse === 'lkw' || T.def.klasse === 'bus'); if (besser.len > s + L + 4) sp = besser;   // Spur, die zur nächsten Abbiegung passt
    if (!this.frei(sp, s + L, L + 6, 4)) return null;
    // 19.11.2026: nie dicht vor ein Fahrzeug setzen, das gerade aus der Kreuzung dahinter kommt (es braucht seinen Bremsweg bis zum neuen Heck),
    // und nur so schnell starten, wie die Luft bis zum Vordermann erlaubt (vorher halbes Tempo mit 1 m Abstand)
    if (s < 45 && sp.ein) for (const e of sp.ein) {
      for (const o of e.fahrzeuge) if (e.len - o.s + s < o.v * o.v / 4 + 7) return null;
      for (const o of e.von.fahrzeuge) if (e.von.len - o.s + e.len + s < o.v * o.v / 4 + 7) return null;
    }
    let luft = Infinity; for (const o of sp.fahrzeuge) if (o.s > s + L) luft = Math.min(luft, o.s - o.LG - s - L);
    const K = KLASSEN[T.def.klasse] || KLASSEN.pkw;
    const fz = { id: this.naechsteId++, typ, def: T.def, K, L: T.def.laenge, B: T.def.breite, stueck: sp, s: Math.min(sp.len - 0.5, s + L), v: start && sp.len - s > 40 ? Math.min(sp.tempo * 0.5, Math.sqrt(4 * Math.max(0, luft - 3))) : 0, a: 0, ziel, lat: 0, latV: 0,
      hist: [], wahlen: new Map(), warte: 0, gestoppt: false, halt: null, haltZeit: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), spin: 0, lenk: 0, nick: 0, neigung: 0, stufe: -1, gesamt: 0 };
    fz.tempoFaktor = K.tempo * (0.92 + this.R() * 0.16); this.anhaengen(fz);
    sp.fahrzeuge.push(fz); this.alle.push(fz);
    this.setzePosition(fz);
    return fz;
  }
  // Ortswechsel auf der Erde (Kachelraster, Wunsch Nr. 36): fahrende Autos des alten Ortes übernehmen, statt neue zu setzen. liste: [{ typ,
  // pos (Mitte), dir, v, tempoFaktor }] schon im Rahmen dieses Netzes. Jedes kommt auf die nächste Spur mit gleicher Richtung (höchstens
  // 2,6 m daneben), mit Typ und Tempo von vorher. Die beim Bau gesetzten Autos verschwinden vorher, die übrigen füllt update außer Sicht auf.
  uebernehmen(liste) {
    for (const fz of this.alle.slice()) this.entferne(fz);
    let n = 0; const gitter = new Map();   // Spuren im 30 m Raster (vorher jedes Auto gegen alle Spuren)
    for (const sp of this.netz.spuren) { const seen = new Set(); for (let i = 0; i < sp.pts.length; i++) { const p = sp.pts[i], q = sp.pts[Math.min(i + 1, sp.pts.length - 1)], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n2 = Math.max(1, Math.ceil(L / 15));
      for (let k = 0; k <= n2; k++) { const x = p[0] + (q[0] - p[0]) * k / n2, z = p[1] + (q[1] - p[1]) * k / n2, key = Math.floor(x / 30) * 100003 + Math.floor(z / 30); if (seen.has(key)) continue; seen.add(key); (gitter.get(key) || gitter.set(key, []).get(key)).push(sp); } } }
    for (const o of liste) {
      const T = this.typen[o.typ]; if (!T) continue;
      const L = T.def.laenge, fx = o.pos.x + o.dir.x * L * 0.5, fzz = o.pos.z + o.dir.z * L * 0.5;
      let best = null, bs = 0, bd = 2.6; const kand = new Set();
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const sp of gitter.get((Math.floor(fx / 30) + a) * 100003 + Math.floor(fzz / 30) + b) || []) kand.add(sp);
      for (const sp of kand) {
        if (sp.len < 6) continue;
        const [s, d] = naechste(sp, fx, fzz); if (d >= bd || s < 0.5 || s > sp.len - 0.3) continue;
        const a = sp.bei(Math.max(0, s - 1), _p), ax = a.x, az = a.z, b = sp.bei(Math.min(sp.len, s + 1), _q), tx = b.x - ax, tz = b.z - az, tl = Math.hypot(tx, tz) || 1;
        if ((tx * o.dir.x + tz * o.dir.z) / tl < 0.82) continue;
        best = sp; bs = s; bd = d;
      }
      if (!best || !this.frei(best, bs, L + 1)) continue;
      const K = KLASSEN[T.def.klasse] || KLASSEN.pkw;
      const fz = { id: this.naechsteId++, typ: o.typ, def: T.def, K, L, B: T.def.breite, stueck: best, s: bs, farbe: o.farbe, v: Math.min(o.v || 0, best.tempo * 1.1), a: 0, ziel: null,   /* Ziel erst später (Route kostete beim Wechsel zu viel), bis dahin freie Wahl an Kreuzungen */ lat: 0, latV: 0,
        hist: [], wahlen: new Map(), warte: 0, gestoppt: false, halt: null, haltZeit: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), spin: o.spin || 0, lenk: 0, nick: 0, neigung: 0, stufe: -1, gesamt: 0 };
      fz.tempoFaktor = o.tempoFaktor || K.tempo; this.anhaengen(fz);
      best.fahrzeuge.push(fz); best.fahrzeuge.sort((x, y) => x.s - y.s); this.alle.push(fz); this.setzePosition(fz); n++;
    }
    return n;
  }
  frei(sp, s, laenge, vorn = 1) {   // ist die Spur um s (nach hinten laenge, nach vorn vorn) frei?
    for (const o of sp.fahrzeuge) if (o.s > s - laenge - o.LG - 1 && o.s - o.LG < s + vorn) return false;
    return true;
  }
  entferne(fz) {
    this.freigeben(fz);
    if (fz.anh) { const a = this.anhaenger.indexOf(fz.anh); if (a >= 0) this.anhaenger.splice(a, 1); }
    const i = fz.stueck.fahrzeuge.indexOf(fz); if (i >= 0) fz.stueck.fahrzeuge.splice(i, 1);
    const j = this.alle.indexOf(fz); if (j >= 0) this.alle.splice(j, 1);
  }

  // Geparkte Autos auf den Parkstreifen (nur Pkw und Taxis, ein Teil Lieferwagen)
  parken() {
    const out = [];
    const R0 = this.R;
    for (const [i, p] of this.netz.parkplaetze.entries()) {
      if (this.mobil && (p.seed ? (p.seed >>> 3) & 1 : i % 2)) continue;   // Handy: jeder zweite Parkplatz (Dreiecksbudget)
      if (p.seed) { const Rp = rng(p.seed ^ 0x5bd1e995); Rp(); this.R = Rp; }   // Typ und Farbe fest je Stelle der Erde
      const typ = this.R() < 0.08 ? this.typen.findIndex(t => t.def.klasse === 'lieferung') : this.waehleTyp(true);
      if (typ < 0) continue;
      const T = this.typen[typ]; if (!T) continue;
      const pos = new THREE.Vector3(p.x, this.netz.hoehe(p.x, p.z), p.z), dir = new THREE.Vector3(Math.sin(p.w), 0, Math.cos(p.w));
      out.push({ typ, def: T.def, L: T.def.laenge, B: T.def.breite, pos, dir, spin: this.R() * 6, lenk: 0, nick: 0, neigung: 0, geparkt: true, stufe: -1, farbWert: this.R() });
    }
    this.R = R0;
    return out;
  }

  // Position aus dem Weg: vorderer Punkt bei s, hinterer Punkt 0,82 L weiter hinten (folgt der Spur wie ein Zweiachser)
  punktZurueck(fz, d, out) {
    let st = fz.stueck, s = fz.s - d, i = fz.hist.length - 1;
    while (s < 0 && i >= 0) { st = fz.hist[i--]; s += st.len; }
    if (s < 0) { st.bei(0, out); const t = richtung(st.pts, false); out.x += t[0] * s; out.z += t[1] * s; return out; }
    return st.bei(s, out);
  }
  setzePosition(fz) {
    const vorn = fz.stueck.bei(fz.s, _p), hinten = this.punktZurueck(fz, fz.L * 0.82, _q);
    fz.dir.set(vorn.x - hinten.x, 0, vorn.z - hinten.z);
    if (fz.dir.lengthSq() < 1e-6) fz.dir.set(0, 0, 1); else fz.dir.normalize();
    const lat = (fz.lat + (fz.gasse || 0)) * (this.netz.seite || 1), px = vorn.x - fz.dir.x * fz.L * 0.5 - fz.dir.z * lat, pz = vorn.z - fz.dir.z * fz.L * 0.5 + fz.dir.x * lat;
    const H = this.netz.hoehe, y0 = fz.hOk ? fz.pos.y : undefined, hv = H(vorn.x, vorn.z, y0), hh = H(hinten.x, hinten.z, y0); fz.hOk = true;   // mit der letzten Höhe: Uferstraßen bleiben unter der Brücke (kit/bruecke.js)
    fz.pos.set(px, (hv + hh) / 2, pz); fz.hang = -Math.atan2(hv - hh, fz.L * 0.82);   // Gelände: Höhe und Steigung zwischen den Achsen
    if (fz.anh) {   // Auflieger: Königszapfen und Achsmitte liegen auf der Spur
      const A = fz.anh, g = fz.def.gelenk, kz = this.punktZurueck(fz, g.zapfen, _p), kx = kz.x, kzz = kz.z, ac = this.punktZurueck(fz, g.zapfen + g.anhAchse, _q);
      A.dir.set(kx - ac.x, 0, kzz - ac.z); if (A.dir.lengthSq() < 1e-6) A.dir.copy(fz.dir); else A.dir.normalize();
      const m = g.anhVorn - A.L / 2, ax = kx + A.dir.x * m - fz.dir.z * lat, az = kzz + A.dir.z * m + fz.dir.x * lat, hk = H(kx, kzz, y0), ha = H(ac.x, ac.z, y0);
      A.pos.set(ax, (hk + ha) / 2, az); A.hang = -Math.atan2(hk - ha, g.anhAchse); A.spin = fz.spin; A.v = fz.v;
    }
  }

  // ---------- Fahren auf Sicht (19.11.2026, Wunsch Nr. 106) ----------
  // Die Regeln oben kennen nur den eigenen Fahrweg: Vordermann, Haltelinie, Konfliktfläche. Was daneben in den Weg ragt, sahen die Autos nicht:
  // das Heck eines Busses, der hinter der Kreuzung warten muss, ein Auto auf einer Spur, die zu dicht an der eigenen liegt, einen Lastwagen,
  // der beim Abbiegen ausschert. Dort fuhren sie ineinander. Jetzt prüft jedes Fahrzeug zehnmal je Sekunde seine eigene Bahn: es stellt sein
  // Rechteck alle 1,25 m auf den Weg, den es fahren wird (bis Bremsweg plus 6 m, höchstens 24 m), und sucht das erste Rechteck eines anderen,
  // das es dort treffen würde. Es weicht nur, wenn der andere nicht selbst auf es zufährt (sonst entscheidet die Vorfahrt wie bisher), bei zwei
  // Fahrzeugen in gleicher Richtung weicht das hintere. Schneller Querverkehr zählt nicht (dafür gibt es die Konfliktflächen), Gegenverkehr auch
  // nicht. Wer so 20 s festsitzt, fährt 6 s ohne diese Regel weiter (gegen Verklemmen).
  bahn(fz) {
    const c = fz.anh ? fz.def.gelenk.zapfen + fz.def.gelenk.anhAchse : fz.L * 0.82, n = Math.min(SICHT_N, Math.ceil((c + fz.sichtWeit) / SICHT_H) + 2); fz.bc = c;
    const X = fz.bx || (fz.bx = new Float32Array(SICHT_N)), Z = fz.bz || (fz.bz = new Float32Array(SICHT_N));
    let vor = fz.stueck, weg = 0, m = 0;
    for (let i = 0; i < n; i++) {
      const u = i * SICHT_H - c;
      if (u <= 0) this.punktZurueck(fz, -u, _p);
      else {
        let s = fz.s + u - weg;
        while (vor && s > vor.len) { weg += vor.len; s -= vor.len; vor = this.naechstesStueck(fz, vor); }
        if (!vor) break;
        vor.bei(s, _p);
      }
      X[i] = _p.x; Z[i] = _p.z; m++;
    }
    fz.bn = m;
  }
  // Meter, die a noch fahren kann, bis sein Rechteck das von b (so wie b jetzt steht) berührt. -1: sie überlappen schon, Infinity: nie
  streift(a, b) {
    const d = this.streiftKasten(a, b), d2 = b.anh ? this.streiftKasten(a, b.anh) : Infinity;
    return d === -1 || d2 === -1 ? -1 : Math.min(d, d2);
  }
  // a (Zugmaschine und, wenn vorhanden, Auflieger) gegen ein Rechteck b
  streiftKasten(a, b) {
    const bl = b.L / 2, bb = b.B / 2, bx = b.pos.x, bz = b.pos.z, bdx = b.dir.x, bdz = b.dir.z, A = a.anh;
    if (boxenUeber(a.pos.x, a.pos.z, a.dir.x, a.dir.z, a.L / 2, a.B / 2, bx, bz, bdx, bdz, bl, bb)) return -1;
    if (A && boxenUeber(A.pos.x, A.pos.z, A.dir.x, A.dir.z, A.L / 2, A.B / 2, bx, bz, bdx, bdz, bl, bb)) return -1;
    if (!a.bn) this.bahn(a);
    const X = a.bx, Z = a.bz, m = a.bn, c = a.bc, kV = c / SICHT_H, kH = (c - a.L * 0.82) / SICHT_H, al = a.L / 2 + 0.15, ab = a.B / 2 + 0.1, r2 = (al + bl + ab + bb) * (al + bl + ab + bb);
    const g = A ? a.def.gelenk : null, kZ = g ? (c - g.zapfen) / SICHT_H : 0, Al = A ? A.L / 2 + 0.15 : 0, Ab = A ? A.B / 2 + 0.1 : 0, R2 = (Al + bl + Ab + bb) * (Al + bl + Ab + bb);
    const px = f => { const i = Math.floor(f); return X[i] + (X[i + 1] - X[i]) * (f - i); }, pz = f => { const i = Math.floor(f); return Z[i] + (Z[i + 1] - Z[i]) * (f - i); };
    for (let j = 1; ; j++) {
      if (Math.floor(j + kV) + 1 >= m) break;
      const fx = px(j + kV), fzz = pz(j + kV); let dx = fx - px(j + kH), dz = fzz - pz(j + kH); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const cx = fx - dx * a.L / 2, cz = fzz - dz * a.L / 2;
      if ((cx - bx) * (cx - bx) + (cz - bz) * (cz - bz) <= r2 && boxenUeber(cx, cz, dx, dz, al, ab, bx, bz, bdx, bdz, bl, bb)) return (j - 1) * SICHT_H;
      if (A) {   // Auflieger an derselben Stelle der Bahn: Zapfen und Achsmitte
        const zx = px(j + kZ), zz = pz(j + kZ); let ex = zx - X[j], ez = zz - Z[j]; const le = Math.hypot(ex, ez) || 1; ex /= le; ez /= le;
        const mx = zx + ex * (g.anhVorn - A.L / 2), mz = zz + ez * (g.anhVorn - A.L / 2);
        if ((mx - bx) * (mx - bx) + (mz - bz) * (mz - bz) <= R2 && boxenUeber(mx, mz, ex, ez, Al, Ab, bx, bz, bdx, bdz, bl, bb)) return (j - 1) * SICHT_H;
      }
    }
    return Infinity;
  }
  sicht() {
    const A = this.alle, Zg = 45, gitter = this._sichtGitter || (this._sichtGitter = new Map()); gitter.clear();
    for (const f of A) {
      f.sichtD = Infinity; f.sichtV = 0; f.sichtWer = null; f.bn = 0; f.sichtWeit = Math.min(24, f.v * f.v / (2 * f.K.b) + 6);
      const key = Math.floor(f.pos.x / Zg) * 100003 + Math.floor(f.pos.z / Zg); f.sichtZelle = key;
      const z = gitter.get(key); if (z) z.push(f); else gitter.set(key, [f]);
    }
    const weicht = (f, g, d, dot) => {
      if (f.vorn === g || g.vorn === f || !(dot > 0.5 || g.v < 2.0) || d >= f.sichtD) return;   // nie für den eigenen Hintermann halten
      f.sichtD = d; f.sichtV = dot > 0.5 ? g.v * dot : 0; f.sichtWer = g;
    };
    const kannFahren = f => !f.grund || f.grund === 'konflikt' || f.grund === 'wartepunkt' || f.grund === 'sicht';   // steht nicht wegen Rot, Platz oder Fußgängern
    for (const a of A) {
      const ix = Math.floor(a.pos.x / Zg), iz = Math.floor(a.pos.z / Zg);
      for (let p = -1; p <= 1; p++) for (let q = -1; q <= 1; q++) {
        const z = gitter.get((ix + p) * 100003 + iz + q); if (!z) continue;
        for (const b of z) {
          if (b.id <= a.id) continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, r = Math.max(a.sichtWeit, b.sichtWeit) + (a.LG + b.LG) / 2 + 1.5;
          if (dx * dx + dz * dz > r * r) continue;
          const dot = a.dir.x * b.dir.x + a.dir.z * b.dir.z; if (dot < -0.5) continue;
          const dA = this.streift(a, b);
          if (dot > 0.3) {   // gleiche Richtung (nebeneinander, Einmündung): nur der Hintere weicht, nie der Vordere (er würde dem Hinteren vor die Haube bremsen)
            // Meter, die der Bug von b vor dem Bug von a liegt (19.11.2026: vorher von Mitte zu Mitte gerechnet. Ein Bus, dessen Bug vorn lag,
            // galt gegenüber einem Pkw als der Hintere, hielt für ihn an, und der Pkw wartete auf den Bus als seinen Vordermann). Gleichauf: die höhere Nummer weicht
            const vorn = ((dx + b.dir.x * b.L / 2 - a.dir.x * a.L / 2) * (a.dir.x + b.dir.x) + (dz + b.dir.z * b.L / 2 - a.dir.z * a.L / 2) * (a.dir.z + b.dir.z)) / (1 + dot);
            const hinten = vorn > 0.6 || (vorn >= -0.6 && a.id > b.id) ? a : b, vorder = hinten === a ? b : a;
            if (dA === -1) weicht(hinten, vorder, 0, dot);   // stecken schon ineinander: der Hintere wartet, bis der Vordere weg ist
            else weicht(hinten, vorder, hinten === a ? dA : this.streift(b, a), dot);
            continue;
          }
          if (dA === -1) continue;
          const dB = this.streift(b, a);
          if (dA < Infinity && dB === Infinity) weicht(a, b, dA, dot);
          else if (dB < Infinity && dA === Infinity) weicht(b, a, dB, dot);
          else if (dA < Infinity) {   // beide stehen einander im Weg: wer rollt, hält für den, der steht und fahren könnte (der fährt dann zuerst, konfliktFrei)
            if (a.v >= 0.3 && b.v < 0.3 && kannFahren(b)) weicht(a, b, dA, dot);
            else if (b.v >= 0.3 && a.v < 0.3 && kannFahren(a)) weicht(b, a, dB, dot);
          }
        }
      }
    }
  }

  // Fahrzeuge voraus auf dem eigenen Weg bis weit Meter: [Abstand Stoßstange zu Heck, Fahrzeug]
  vordermann(fz, weit) {
    let st = fz.stueck, basis = -fz.s, sMin = fz.s, vorSt = null, vorBasis = 0;   // basis: Abstand vom eigenen Bug zum Anfang des Stücks
    for (let tiefe = 0; tiefe < 6; tiefe++) {
      let best = null, bestS = Infinity;
      for (const o of st.fahrzeuge) if (o !== fz && o.s > sMin && o.s < bestS) { best = o; bestS = o.s; }
      // Spurwechsel (08.11.2026): wer gerade hinübergleitet, steht noch halb auf der alten Spur. Er zählt dort als Vordermann, bis er drüben ist,
      // und sieht selbst noch den Vordermann der alten Spur. Vorher fuhren die Autos dahinter auf ihn auf (mit echten Spuren aus OSM viel öfter)
      if (st.art === 'spur' && st.r?.n > 1) {
        const halb = o => Math.abs(o.lat) > 0.6;
        for (const dk of [-1, 1]) {
          const z = st.r.spuren[st.k + dk]; if (!z) continue;
          for (const o of z.fahrzeuge) {
            if (o === fz || !o.lat || !halb(o) || o.stueck.k - Math.sign(o.lat) !== st.k) continue;   // gleitet von dieser Spur hinüber
            const sAls = o.s / Math.max(0.01, z.len) * st.len; if (sAls > sMin && sAls < bestS) { best = o; bestS = sAls; }
          }
        }
        if (tiefe === 0 && fz.lat && halb(fz)) {   // selbst im Wechsel: Vordermann der alten Spur
          const alt = st.r.spuren[st.k - Math.sign(fz.lat)];
          if (alt) for (const o of alt.fahrzeuge) { const sAls = o.s / Math.max(0.01, alt.len) * st.len; if (o !== fz && sAls > sMin && sAls < bestS) { best = o; bestS = sAls; } }
        }
      }
      // Verbindungen derselben Spur teilen sich die ersten Meter: wer dort auf einer Schwesterverbindung steht, ist auch Vordermann
      if (st.art === 'verbindung') for (const g of st.von.aus) {
        if (g === st) continue;
        for (const o of g.fahrzeuge) {
          if (o === fz || o.s <= sMin || o.s >= bestS) continue;
          // am Heck des anderen messen (dort laufen die Kurven noch dichter zusammen als an seinem Bug): vorher fuhr man ihm hinten auf, wenn
          // er abbog und man selbst geradeaus wollte (Kottbusser Tor 07.11.2026)
          const sh = Math.max(0, o.s - o.LG), a = st.bei(Math.min(st.len, sh), _p), b = g.bei(sh, _q), a2 = st.bei(Math.min(st.len, o.s), _r), b2 = g.bei(o.s, _s2);
          if (Math.min(Math.hypot(a.x - b.x, a.z - b.z), Math.hypot(a2.x - b2.x, a2.z - b2.z)) < 2.4) { best = o; bestS = o.s; }
        }
      }
      // Reißverschluss: wer auf einer Kurve in dieselbe Spur dem Ende näher ist als wir, ist Vordermann (Abstand über die Restwege gerechnet)
      if (st.art === 'verbindung' && st.mergeMit) for (const g of st.mergeMit) for (const o of g.fahrzeuge) {
        if (o === fz) continue;
        const restO = g.len - o.s, restMe = st.len - Math.max(sMin, 0);
        if (restO < restMe - 1e-6 || (restO < restMe + 1e-6 && o.id < fz.id)) { const sAls = st.len - restO; if (sAls < bestS && sAls > sMin) { best = o; bestS = sAls; } }
      }
      // Einfädeln hinter einem langen Fahrzeug (19.11.2026): der Vordermann kam über eine andere Kurve in diese Spur und sein Heck hängt noch
      // in der Kreuzung. Entlang der Spur gemessen ist dahinter Platz, daneben aber nicht: wer jetzt in seine eigene Kurve fährt, steht neben dem
      // Heck, wo beide Kurven zusammenlaufen (Lastwagen und Busse standen so in den Autos der Nachbarspur). Also vor der eigenen Kurve warten
      if (best && st.art === 'spur' && vorSt && vorSt.mergeMit && best.stueck === st && bestS - best.LG < 0 && best.hist[best.hist.length - 1] !== vorSt) return [Math.max(0, Math.min(vorBasis - 0.6, basis + bestS - best.LG)), best];
      if (best) return [Math.max(0, basis + bestS - best.LG), best];
      vorSt = st; vorBasis = basis;
      basis += st.len; if (basis > weit) break;
      const n = this.naechstesStueck(fz, st); if (!n) break;
      st = n; sMin = -1;
    }
    return [Infinity, null];
  }
  // das Stück, das auf st folgt (für das Fahrzeug: nach seiner Route)
  naechstesStueck(fz, st) {
    if (st.art === 'verbindung') return st.nach;
    return this.verbindungWahl(fz, st);
  }
  verbindungWahl(fz, sp) {
    if (!sp.aus.length) return null;
    let v = fz.wahlen.get(sp); if (v) return v;
    const nr = fz.ziel ? this.naechsteR(sp.r, fz.ziel) : null;
    let liste = nr ? sp.aus.filter(x => x.rout === nr) : [];
    if (!liste.length) liste = sp.aus;
    v = liste[Math.floor(this.R() * liste.length)];
    fz.wahlen.set(sp, v);
    return v;
  }

  // Hindernisse auf der Fahrbahn vor dem Fahrzeug: Fußgänger auf Überwegen und der Spieler (zu Fuß auf der Fahrbahn oder im Auto,
  // Regelwerk 1.9). Liefert [Abstand, Tempo des Hindernisses] oder [Infinity, 0]
  fussgaengerVoraus(fz, weit) {
    const alle = this.fussgaenger; if (!alle.length) return [Infinity, 0];
    // nur Hindernisse im Umkreis (19.11.2026, tools/verkehr_kosten.mjs: jedes Auto rechnete jeden Fußgänger auf einem Überweg gegen vier Wegstücke,
    // bei 23 Fußgängern 1,9 ms je Bild)
    const L = _nah; L.length = 0; const r2 = (weit + fz.LG + 4) * (weit + fz.LG + 4);
    for (const p of alle) { const dx = p.pos.x - fz.pos.x, dz = p.pos.z - fz.pos.z; if (dx * dx + dz * dz < r2) L.push(p); }
    if (!L.length) return [Infinity, 0];
    let st = fz.stueck, basis = -fz.s, min = Infinity, hv = 0;
    for (let tiefe = 0; tiefe < 4 && basis < weit; tiefe++) {
      for (const p of L) {
        const [s, d] = naechste(st, p.pos.x, p.pos.z);
        if (d > (p.breite || 2.1)) continue;
        const dist = basis + s; if (dist < -1 || dist > weit) continue;
        if (dist < min) { min = dist; hv = p.v || 0; }
      }
      basis += st.len; const n = this.naechstesStueck(fz, st); if (!n) break; st = n;
    }
    return [min, hv];
  }

  // Darf das Fahrzeug von seiner Spur in die Verbindung v einfahren?
  darfEinfahren(fz, v, dHalt, tiefe = 0, vorweg = 0, nurPlatz = false) {
    const S = this.signale, f = S ? S.farbe(v.gruppe) : null;
    this.grund = f;
    if (f === 'rot') return false;
    if (f === 'gelb' && (fz.v < 2 || dHalt > fz.v * fz.v / (2 * 3.2) + 1)) return false;   // Gelb: anhalten, wenn es noch geht. Aus dem Stand nie bei Gelb losfahren (Prüfung Nr. 103)
    this.grund = 'stop'; if (!tiefe && v.von.schild === 'stop' && !fz.gestoppt) return false;
    // dahinter Platz? (Kreuzung freihalten)
    const nach = v.nach; let ersterRueck = Infinity, letzter = null;
    for (const o of nach.fahrzeuge) if (o.s - o.LG < ersterRueck) { ersterRueck = o.s - o.LG; letzter = o; }
    this.grund = 'platz'; if (ersterRueck < fz.LG + 1.5) return false;
    // Wer schon auf einer Kurve in diese Spur unterwegs ist, braucht dort auch Platz (19.11.2026: zwei fuhren auf dieselbe Lücke zu, der zweite
    // blieb in der Kreuzung stehen und sperrte die Querrichtung, im Kreisverkehr bis zum Stillstand). Gezählt wird, wenn sich die Spur staut oder
    // leer ist (dann zählt ihre Länge), im fließenden Verkehr reicht der Abstand zum Letzten. Ausfahrten am Rand nehmen jeden auf
    const kurz = nach.len < fz.LG + 2 && nach.aus.length > 0, senke = !nach.aus.length && (nach.ende === 'rand' || nach.ende === 'portal');
    const streng = !letzter || letzter.v < 2 || nach.len < 30 || tiefe > 0;   // im fließenden Verkehr zählen nur Vormerkungen über ein kurzes Stück hinweg (resKette): die können nicht mehr anhalten
    let unterwegs = vorweg; if (nach.res) for (const o of nach.res) { if (o === fz) break; if (streng || o.resKette) unterwegs += o.LG + o.K.s0; }   // Vormerkungen (reservieren): wer vor uns über seine Linie gefahren ist und hier ankommen wird
    if (!kurz && !senke && (letzter ? ersterRueck : nach.len) - unterwegs < fz.LG + 1.5) return false;
    // Nächste Spur kürzer als das Fahrzeug (zwei Kreuzungen dicht hintereinander, Mittelstreifen): wer dort halten muss, steht mit dem Heck in
    // dieser Kreuzung (19.11.2026, Prüfstand ohne Browser: daher kamen die meisten Überlappungen, fast immer Busse und Lastwagen auf 2 bis 4 m
    // kurzen Stücken). Darum nur einfahren, wenn es dahinter gleich weitergeht: die nächste Ampel zeigt Grün und bleibt es, bis man dort ist,
    // und die nächste Kreuzung lässt einen hinein (Platz, Vorfahrt), bis zu drei Kreuzungen weit. Sonst wartet man vor der ersten Linie
    if (nach.len < fz.LG + 2 && nach.aus.length && tiefe < 3) {
      const v2 = this.verbindungWahl(fz, nach), weg = Math.max(0, dHalt) + v.len + nach.len, f2 = S ? S.farbe(v2.gruppe) : null;
      if (f2 && (f2 !== 'gruen' || (S.gruenRest ? S.gruenRest(v2.gruppe) : 99) < weg / Math.max(fz.v, 3.5) + 1.5)) { this.grund = 'platz'; return false; }
      if (!this.darfEinfahren(fz, v2, weg, tiefe + 1, 0, nurPlatz)) { this.grund = 'platz'; return false; }
    }
    if (nurPlatz) return true;   // vom Wartepunkt aus (schritt): nur Ampel und Platz dahinter, die Vorfahrt klärt sich an der nächsten Linie
    // mit Ampel und Platz vor der Konfliktfläche: einfahren und dort warten (konfliktFrei prüft es am Wartepunkt)
    this.grund = 'schlange';
    // 19.11.2026: nach 6 s Warten auch, wenn der Wartepunkt näher als eine Fahrzeuglänge hinter der Linie liegt (das Heck steht dann noch auf der
    // eigenen Spur). Vorher blieb der Abbieger an der Linie, bekam im dichten Gegenverkehr nie eine Lücke und bei Gelb durfte er nicht mehr los:
    // einzelne warteten über 2 Minuten. Vom Wartepunkt aus räumt er, sobald der Gegenverkehr bei Gelb und Rot steht
    if (v.wartepunkt !== null && (v.wartepunkt > fz.LG + 1.0 || (fz.warte > 6 && v.wartepunkt > 1.5 && f === 'gruen'))) { let letzter = Infinity; for (const o of v.fahrzeuge) letzter = Math.min(letzter, o.s - o.LG); return letzter > fz.LG + 1.0 || letzter === Infinity; }
    this.grund = 'konflikt';
    return this.konfliktFrei(fz, v, Math.max(0, dHalt + 0.4), tiefe > 0);
  }
  // Vormerken (19.11.2026): wer über seine Linie in die Kreuzung fährt, merkt sich den Platz auf der Spur vor, auf der er wieder ganz steht
  // (bei kurzen Stücken dahinter die übernächste). Andere zählen diese Vormerkung beim Einfahren mit, bis er dort angekommen ist. Vorher nahm
  // ein Fahrzeug aus der Seitenstraße einem Bus den Platz weg, der schon zwei Knoten vorher losgefahren war: der Bus blieb in der Kreuzung stehen
  reservieren(fz, v) {
    this.freigeben(fz);
    let sp = v.nach, n = 0;
    while (sp.len < fz.LG + 2 && sp.aus.length && n++ < 3) sp = this.verbindungWahl(fz, sp).nach;
    if (sp.len < fz.LG + 2 && sp.aus.length) return;   // nur kurze Stücke hintereinander: keine Vormerkung (sie würde sich im Kreis sperren)
    (sp.res || (sp.res = [])).push(fz); fz.reserviert = sp; fz.resKette = sp !== v.nach;
  }
  freigeben(fz) { const sp = fz.reserviert; if (!sp) return; const i = sp.res.indexOf(fz); if (i >= 0) sp.res.splice(i, 1); fz.reserviert = null; }
  // Konfliktflächen der Verbindung v: niemand fährt gerade durch den Konfliktpunkt, und wer Vorrang hat, kommt dort erst an,
  // wenn wir ihn samt Fahrzeuglänge schon verlassen haben (Lücke nach Zeit, nicht nach Abstand). dBis: Meter bis zum Anfang von v.
  konfliktFrei(fz, v, dBis = 0, voraus = false) {
    const S = this.signale, f = S ? S.farbe(v.gruppe) : null, warteLang = fz.warte > 7;
    const vAb = Math.max(fz.v, 2.5);   // beim Anfahren rechnet man mit rund 2,5 m/s
    for (const k of v.konflikte) {
      // Zwei Spuren derselben Straße laufen in eine Spur zusammen (drei Spuren fahren in einen zweispurigen Kreisverkehr): Reißverschluss über den
      // Vordermann (vordermann, mergeMit), keine feste Vorfahrt. Vorher wartete die linke Spur auf jedes Auto der Nachbarspur, am
      // Ernst-Reuter-Platz 168 s lang (19.11.2026)
      if (k.nach === v.nach && k.rin === v.rin) continue;
      const kf = S ? S.farbe(k.gruppe) : null, sv = v.konfliktS.get(k), sk = k.konfliktS.get(v);
      const dMe = dBis + sv - (fz.stueck === v ? fz.s : 0), tFrei = (dMe + fz.LG + 2.6) / vAb;   // bis unser Heck hinter dem Konfliktpunkt ist (19.11.2026 geprüft: mit der echten Beschleunigung gerechnet und kleinerer Reserve kamen mehr durch, aber doppelt so viele trafen sich auf der Konfliktfläche)
      for (const o of k.fahrzeuge) {
        if (o === fz) continue;
        if (o.s - o.LG > k.konfliktEnde.get(v) + 1.0) continue;                               // schon vorbei (Heck hinter dem letzten nahen Punkt)
        if (o.sichtWer === fz && o.v < 0.5 && o.sichtD < 4) continue;                       // er hält auf Sicht für uns (Fahren auf Sicht): wir fahren zuerst
        const wartet = k.wartepunkt !== null && o.s < k.wartepunkt + 0.3 && o.v < 0.3;   // steht in der Kreuzung vor seiner Konfliktfläche
        if (!wartet) {                                                                      // fährt auf den Konfliktpunkt zu
          if (voraus && o.v > 1.5 && (k.konfliktEnde.get(v) + 1.0 - (o.s - o.LG)) / o.v < dMe / vAb - 0.5) continue;   // Blick auf die übernächste Kreuzung: er ist weg, bevor wir dort sind
          return false;
        }
        if (this.vorfahrt(k, v, kf) && !(warteLang && (fz.warte > o.warte + 1e-6 || (fz.warte > o.warte - 1e-6 && fz.id < o.id)))) return false;   // er ist dran und wartet selbst noch
      }
      if (this.vorfahrt(v, k, f)) continue;
      if (kf === 'rot') continue;   // seine Zufahrt hat Rot, von dort kommt niemand
      // Zufahrt des anderen: seine Spur, und wenn die kürzer ist als ein Auto, auch die Kurven, die in sie führen (wer dort fährt, hält nicht mehr)
      let zufahrt = k.von.fahrzeuge;
      if (k.von.len < 7 && k.von.ein) { zufahrt = zufahrt.slice(); for (const e of k.von.ein) for (const o of e.fahrzeuge) if (this.verbindungWahl(o, k.von) === k) zufahrt.push(o); }
      for (const o of zufahrt) {
        if (o === fz) continue;
        const d = o.stueck === k.von ? k.von.len - o.s : k.von.len + o.stueck.len - o.s;
        if (d > 60) continue;
        const ow = o.wahlen.get(k.von); if (ow && ow !== k) continue;
        const laenger = fz.warte > o.warte + 1e-6 || (fz.warte > o.warte - 1e-6 && fz.id < o.id);   // wir warten länger (bei Gleichstand entscheidet die Nummer, sonst wartet jeder auf jeden)
        if (o.v < 0.15 && d > 3) { if (d < 12 && o.warte > fz.warte && !(warteLang && laenger)) return false; continue; }
        if (o.v < 0.15) {   // er steht an seiner Linie und hat Vorrang: er fährt zuerst, außer er kommt selbst nicht weg oder wir warten schon länger als er (19.11.2026: vorher entschied die Lage der Kurven, beide fuhren los oder keiner)
          if (o.grund === 'platz' || o.grund === 'fussgaenger' || o.grund === 'stop' || o.grund === 'gelb' || o.grund === 'rot') continue;
          if (!(warteLang && laenger)) return false;
          continue;
        }
        const tO = (d + sk) / Math.max(o.v, 0.8);
        if (tO < tFrei + 1.2) {
          if (fz.warte > 4 && o.v < 3.5 && d > o.v * o.v / 4 + 2.5) continue;   // zäher Verkehr: Reißverschluss, er kann vor seiner Linie noch halten
          if (!(warteLang && o.v < 0.1 && laenger)) return false;
        }
      }
    }
    return true;
  }
  // hat Verbindung a Vorrang vor b?
  vorfahrt(a, b, farbeA) {
    const S = this.signale;
    // Wer auf einem Stück steht, das kürzer ist als ein Auto (Mittelstreifen zwischen zwei Knoten einer Kreuzung), ist schon in der Kreuzung
    // und räumt sie zuerst (19.11.2026: dort wartende Fahrzeuge standen den Abbiegern im Weg)
    const ia = a.von.len < 7 && a.von.r && K_ART(this.netz, a.von), ib = b.von.len < 7 && b.von.r && K_ART(this.netz, b.von); if (ia !== ib) return !!ia;
    if (S && a.gruppe && b.gruppe) {
      if (a.gruppe !== b.gruppe) return S.farbe(a.gruppe) === 'gruen' || S.farbe(a.gruppe) === 'gelb';
      if (a.turn === 'links' && b.turn !== 'links') return false;
      if (b.turn === 'links' && a.turn !== 'links') return true;
      return a.id < b.id;
    }
    // genau eine Seite hat eine Ampel (die andere kommt von einem Stück im Inneren einer großen Kreuzung): Grün geht vor, bei Rot der andere
    if (S && (a.gruppe || b.gruppe)) { const fg = S.farbe(a.gruppe || b.gruppe); if (fg) { const faehrt = fg === 'gruen' || fg === 'gelb'; return a.gruppe ? faehrt : !faehrt; } }
    if (a.rin.kreis !== b.rin.kreis) return a.rin.kreis;   // Kreisverkehr: wer im Ring fährt, hat Vorfahrt vor dem, der einfährt (19.11.2026, vorher ging es nach Straßenklasse: der Ring stand, der Platz lief voll)
    const sa = a.von.schild, sb = b.von.schild;
    if (sa && !sb) return false; if (sb && !sa) return true;
    if (a.rin.rang !== b.rin.rang) return a.rin.rang > b.rin.rang;
    const da = a.rin.dirEnde, db = b.rin.dirEnde, dot = da[0] * db[0] + da[1] * db[1];
    if (dot < -0.5) { if (a.turn === 'links' && b.turn !== 'links') return false; if (b.turn === 'links' && a.turn !== 'links') return true; return a.id < b.id; }
    const Pb = b.von.pts[b.von.pts.length - 1], J = a.kreuzung, cross = da[0] * (Pb[1] - J.z) - da[1] * (Pb[0] - J.x);
    return cross * (this.netz.seite || 1) <= 0;   // rechts vor links (im Linksverkehr links vor rechts): wer von der Seite der Fahrspur kommt, fährt zuerst
  }

  // Spurwechsel, wenn die Spur die nächste Abbiegung nicht erlaubt (nur mit Lücke, nie direkt vor der Kreuzung)
  spurwechsel(fz) {
    const sp = fz.stueck; if (sp.art !== 'spur' || sp.r.n < 2 || fz.lat !== 0) return;
    const nr = fz.ziel ? this.naechsteR(sp.r, fz.ziel) : null; if (!nr) return;
    const weit = sp.r.spuren.some(o => this.spurPasst(o, fz.ziel));   // gibt es eine Spur, die auch über das kurze Stück dahinter passt? Sonst zählt nur die nächste Kreuzung
    if (this.spurPasst(sp, fz.ziel, weit)) return;
    const rest = sp.len - fz.s; if (rest < 10 || rest > 120) return;
    for (const dk of [1, -1]) {
      const z = sp.r.spuren[sp.k + dk]; if (!z) continue;
      const naeher = this.spurPasst(z, fz.ziel, weit) || (sp.k + 2 * dk >= 0 && sp.k + 2 * dk < sp.r.n && this.spurPasst(sp.r.spuren[sp.k + 2 * dk], fz.ziel, weit));
      if (!naeher) continue;
      const sz = fz.s / sp.len * z.len;
      let ok = true;
      for (const o of z.fahrzeuge) {
        if (o.s > sz) { if (o.s - o.LG - sz < fz.K.s0 + fz.v * 0.9) ok = false; }
        else if (sz - fz.LG - o.s < o.K.s0 + o.v * 1.1) ok = false;
      }
      if (!ok) continue;
      const i = sp.fahrzeuge.indexOf(fz); sp.fahrzeuge.splice(i, 1); z.fahrzeuge.push(fz);
      fz.stueck = z; fz.s = sz; fz.lat = sp.r.lw * dk; fz.wahlen.clear(); if (fz.hist) fz.hist.length = 0;   // seitlich noch auf der alten Spur, gleitet in 2,5 s hinüber. Verlauf leeren: das Heck folgt sonst der alten Spur (Prüfung Nr. 103)
      return;
    }
  }

  schritt(fz, dt) {
    const K = fz.K, st = fz.stueck, b = K.b;
    let v0 = st.tempo * fz.tempoFaktor;
    // Tempo vor Kurven, auch auf den nächsten Stücken
    const weit = fz.v * fz.v / (2 * b) + 18;
    v0 = Math.min(v0, st.tempoVoraus(fz.s, b, weit));
    { let n = this.naechstesStueck(fz, st), basis = st.len - fz.s, tiefe = 0;
      while (n && basis < weit && tiefe++ < 3) { v0 = Math.min(v0, Math.sqrt(Math.max(0, Math.pow(n.tempoVoraus(0, b, weit - basis), 2) + 2 * b * basis)), Math.sqrt(n.vmax[0] * n.vmax[0] + 2 * b * basis)); basis += n.len; n = this.naechstesStueck(fz, n); } }
    // Hindernisse: Vordermann, Haltelinie, Fußgänger, Haltestelle
    let gap = Infinity, dv = 0;
    const [dL, leader] = this.vordermann(fz, 80); fz.vorn = leader;
    if (leader) { gap = dL; dv = fz.v - leader.v; }
    let halt = Infinity;
    // Haltelinien voraus (auch hinter der nächsten Kreuzung, wenn die Spur dazwischen kurz ist): die erste, an der man nicht weiterdarf
    { let basis = -fz.s, stp = st, tiefe = 0;
      while (stp && basis + stp.len < 75 && tiefe++ < 4) {
        if (stp.art === 'spur' && stp.aus.length) {
          const dHalt = basis + stp.len - 0.4, v = this.verbindungWahl(fz, stp), hier = stp === st;
          if (hier && v.von.schild === 'stop' && dHalt < 1.2 && fz.v < 0.25) fz.gestoppt = true;
          // Räumen (19.11.2026): wer schon in der Kreuzung ist und nur noch ein Stück vor sich hat, das kürzer ist als ein Auto (Mittelstreifen),
          // hält dort nicht mehr an einer Linie, er fährt durch. Geprüft wurde vor der ersten Linie (darfEinfahren, Kette), die anderen sehen
          // ihn kommen (konfliktFrei) und er hat Vorfahrt. Vorher blieben dort zwei stehen und sperrten sich gegenseitig für Minuten
          const drin = stp.len < 7 && (hier || (st.art === 'verbindung' && st.nach === stp)) && K_ART(this.netz, stp);
          const frei = drin || this.darfEinfahren(fz, v, dHalt);
          if (!frei) { halt = Math.min(halt, dHalt); fz.grund = this.grund; if (dHalt < 2.5 && fz.v < 0.15) fz.warte += dt; break; }   // Wartezeit zählt auch vor einer Linie hinter der Kreuzung (kurze Spur)
          if (hier) { fz.grund = ''; if (fz.v > 1.2) fz.warte = 0; }   // Wartezeit bleibt, bis man wirklich rollt (vorher löschte ein einziger freier Augenblick sie: wer am längsten wartet, kam nie dran)
          if (v.von.schild && dHalt < 16) v0 = Math.min(v0, v.von.schild === 'stop' ? 3.5 : 4.5);   // Vorfahrt achten: langsam heran
        } else if (stp.art === 'spur' && !stp.aus.length) { if (stp.ende !== 'rand' && stp.ende !== 'portal') halt = Math.min(halt, basis + stp.len - 0.3); break; }   // Ende ohne Anschluss (am Rand und Portal fährt man hinaus)
        basis += stp.len; stp = this.naechstesStueck(fz, stp);
      } }
    if (st.art === 'verbindung' && st.wartepunkt !== null && fz.s < st.wartepunkt + 0.3) {   // in der Kreuzung vor der Konfliktfläche: auf die Lücke warten
      const dW = st.wartepunkt - fz.s;
      // Vom Wartepunkt nur los, wenn hinter der Kreuzung noch Platz ist (19.11.2026, Hermannplatz im Prüfstand): beim Einfahren war die Spur frei,
      // während des Wartens lief sie voll. Wer dann losfuhr, blieb auf der Konfliktfläche stehen und sperrte die Querrichtung für Minuten.
      // Kurze Stücke dahinter prüft die Kette beim Einfahren (darfEinfahren), dort gilt Räumen
      const nach = st.nach; let rueck = Infinity, vor = 0; for (const o of nach.fahrzeuge) if (o.s - o.LG < rueck) rueck = o.s - o.LG; for (const o of st.fahrzeuge) if (o.s > fz.s) vor += o.LG + 2;
      // Ist das Stück dahinter kürzer als das Fahrzeug, gilt die Kette wie beim Einfahren: los nur, wenn es auch an der nächsten Kreuzung weitergeht
      const kurzN = nach.len < fz.LG + 2 && nach.aus.length > 0;
      const stufe = this.warteStufe ?? [25, 55], eng = kurzN ? !this.ohneWarteplatz && fz.warte < stufe[1] && !this.darfEinfahren(fz, this.verbindungWahl(fz, nach), st.len - fz.s + nach.len, 1, 0, fz.warte >= stufe[0]) : (nach.aus.length || (nach.ende !== 'rand' && nach.ende !== 'portal')) && (rueck === Infinity ? nach.len : rueck) - vor < fz.LG + 1.5;
      if (eng && !this.ohneWarteplatz) { halt = Math.min(halt, dW); fz.grund = 'platz'; if (dW < 2.5 && fz.v < 0.15) fz.warte += dt; }
      else if (!this.konfliktFrei(fz, st)) { halt = Math.min(halt, dW); fz.grund = 'wartepunkt'; if (dW < 2.5 && fz.v < 0.15) fz.warte += dt; }
      else if (fz.v > 1.2) fz.warte = 0;
    }
    if (fz.def.klasse === 'bus' && st.art === 'spur' && st.halte.length) {
      for (const h of st.halte) {
        if (fz.halt === h) { if (fz.haltZeit > 0) { halt = Math.min(halt, h - fz.s + 0.3); } }
        else if (h > fz.s - 0.5 && h - fz.s < 60 && fz.letzterHalt !== h) { halt = Math.min(halt, h - fz.s); if (h - fz.s < 1.0 && fz.v < 0.1) { fz.halt = h; fz.haltZeit = 7 + this.R() * 5; fz.letzterHalt = h; } }
      }
      if (fz.halt !== null) { fz.haltZeit -= dt; if (fz.haltZeit <= 0) { fz.halt = null; } }
    }
    let hv = 0;
    const [dF, fv] = this.fussgaengerVoraus(fz, 40); if (dF < Infinity && dF - 2.2 < halt) { halt = dF - 2.2; hv = fv; fz.grund = 'fussgaenger'; }
    // Fahren auf Sicht: stehendes oder querendes Hindernis wie eine Haltelinie, ein Fahrzeug in gleicher Richtung wie ein Vordermann
    if (fz.sichtAus > 0) fz.sichtAus -= dt;
    else if (fz.sichtD < 1e9) {
      if (fz.sichtV < 0.5) { if (fz.sichtD - 0.2 < halt) { halt = fz.sichtD - 0.2; hv = 0; fz.grund = 'sicht'; } }
      else if (fz.sichtD < gap) { gap = fz.sichtD; dv = fz.v - fz.sichtV; }
      if (fz.v < 0.15 && fz.sichtD < 2.5) { fz.sichtWarte = (fz.sichtWarte || 0) + dt; if (fz.sichtWarte > 20) { fz.sichtAus = 6; fz.sichtWarte = 0; } }
    }
    if (fz.v > 1.2) fz.sichtWarte = 0;
    if (halt + K.s0 - 0.8 < gap) { gap = Math.max(0, halt + K.s0 - 0.8); dv = fz.v - hv; }   // vor Linien und Fußgängern 0,8 m Abstand statt des Stillstandsabstands zu Autos
    // Intelligent Driver Model
    const sStern = K.s0 + Math.max(0, fz.v * K.T + fz.v * dv / (2 * Math.sqrt(K.a * b)));
    let a = K.a * (1 - Math.pow(fz.v / Math.max(0.5, v0), 4) - (gap < Infinity ? Math.pow(sStern / Math.max(0.05, gap), 2) : 0));
    a = Math.max(-NOTBREMSE, Math.min(K.a, a));
    if (gap < 0.25 && fz.v < 0.3) { fz.v = 0; a = 0; }
    fz.a = a;
    fz.v = Math.max(0, fz.v + a * dt);
    const ds = fz.v * dt; fz.s += ds; fz.spin += ds; fz.gesamt += ds;
    if (fz.sichtD < 1e9) fz.sichtD = Math.max(0, fz.sichtD - ds);
    if (fz.lat !== 0) { const d = Math.sign(fz.lat) * Math.min(Math.abs(fz.lat), dt * 1.3); fz.lat -= d; if (Math.abs(fz.lat) < 0.02) fz.lat = 0; }
    if (fz.v > 0.3) fz.gestoppt = false;
    fz.steh = fz.v < 0.2 ? (fz.steh || 0) + dt : 0;
    // Übergänge: Spur -> Verbindung -> Spur
    let runden = 0;
    while (fz.s > fz.stueck.len && runden++ < 4) {
      const cur = fz.stueck;
      if (cur.art === 'spur' && !cur.aus.length) { this.entferne(fz); this.neu(); return; }   // Ausfahrt am Rand oder Portal
      const n = cur.art === 'spur' ? this.verbindungWahl(fz, cur) : cur.nach;
      if (!n) { this.entferne(fz); this.neu(); return; }
      if (cur.art === 'spur') { this.statistik.eingefahren++; if (this.signale && this.signale.farbe(n.gruppe) === 'rot' && !(cur.len < 7 && K_ART(this.netz, cur))) { this.statistik.rotVerstoesse++; this.rotLog?.push(`${fz.def.id}#${fz.id} v ${fz.v.toFixed(1)} a ${fz.a.toFixed(1)} Spur ${cur.len.toFixed(1)} m ${cur.r.kante.hw} rueck ${cur.rueck || 0} ${n.turn} grund ${fz.grund || '-'} sicht ${fz.sichtD === undefined || fz.sichtD > 1e8 ? '-' : fz.sichtD.toFixed(1)} t ${this.t.toFixed(1)}`); } if (n.turn === 'wenden') this.statistik.wendungen++; }
      const i = cur.fahrzeuge.indexOf(fz); if (i >= 0) cur.fahrzeuge.splice(i, 1);
      fz.hist.push(cur); if (fz.hist.length > 4) fz.hist.shift();
      if (cur.art === 'spur') this.reservieren(fz, n);
      fz.s -= cur.len; fz.stueck = n; n.fahrzeuge.push(fz); fz.wahlen.delete(cur); fz.gestoppt = false; fz.warte = 0;
      if (n.art === 'spur' && fz.reserviert && (n === fz.reserviert || n.len >= fz.LG + 2)) this.freigeben(fz);
    }
    if (fz.stueck.art === 'spur' && fz.ziel && fz.stueck.r.n > 1 && fz.lat === 0 && !this.spurPasst(fz.stueck, fz.ziel)) this.spurwechsel(fz);
    this.setzePosition(fz);
    // Lenkung (Vorderräder) aus der Krümmung, Nicken beim Bremsen, Neigung in Kurven
    const k2 = fz.stueck.bei(Math.min(fz.stueck.len, fz.s + 1.2), _p), k1 = fz.stueck.bei(Math.max(0, fz.s - 1.2), _r);
    const tx = k2.x - k1.x, tz = k2.z - k1.z, tl = Math.hypot(tx, tz) || 1;
    const lenkZiel = Math.atan2(fz.dir.x * tz / tl - fz.dir.z * tx / tl, fz.dir.x * tx / tl + fz.dir.z * tz / tl) * 1.6;
    fz.lenk += (Math.max(-0.55, Math.min(0.55, lenkZiel)) - fz.lenk) * Math.min(1, dt * 7);
    fz.nick += (Math.max(-0.028, Math.min(0.028, -a * 0.011)) - fz.nick) * Math.min(1, dt * 4);
    fz.neigung += (Math.max(-0.035, Math.min(0.035, -fz.lenk * fz.v * 0.012)) - fz.neigung) * Math.min(1, dt * 4);
  }

  update(dt) {
    this.t += dt;
    // Fußgänger auf Überwegen (vom Gehweg aus beginnt niemand auf der Fahrbahn) und der Spieler (Figur auf der Fahrbahn, Auto am Heck)
    this.fussgaenger = this.menge ? this.menge.alle.filter(p => p.kante && p.kante.art === 'ueberweg' && !p.statisch) : [];   // auch wer auf dem Überweg steht (Prüfung Nr. 103: Autos fuhren durch Stehende)
    const sp = this.spieler;
    if (sp && sp.pos) {
      if (sp.L) {   // Spielerauto: Heck, Mitte und Bug als Hindernisse, damit auch ein querendes Auto gesehen wird
        for (const k of [-0.5, 0, 0.5]) this.fussgaenger.push({ pos: { x: sp.pos.x + sp.dir.x * sp.L * k, z: sp.pos.z + sp.dir.z * sp.L * k }, breite: 2.3 + sp.B / 2, v: Math.max(0, sp.vLong) });
        if (sp.anh) { const o = sp.anh; for (const k of [-0.5, -0.17, 0.17, 0.5]) this.fussgaenger.push({ pos: { x: o.pos.x + o.dir.x * o.L * k, z: o.pos.z + o.dir.z * o.L * k }, breite: 2.3 + o.B / 2, v: Math.max(0, sp.vLong) }); }   // Auflieger am Spielerauto
      } else if (sp.pos.y - this.netz.hoehe(sp.pos.x, sp.pos.z) < 0.06) this.fussgaenger.push({ pos: sp.pos, breite: 2.1, v: 0 });
    }
    if (this.sperren?.length) this.fussgaenger.push(...this.sperren);   // geschlossene Schranken und Straßenbahnen (kit/bahn.js)
    if (this.weitere) for (const o of this.weitere) for (const k of [-0.5, 0, 0.5]) this.fussgaenger.push({ pos: { x: o.pos.x + o.dir.x * o.L * k, z: o.pos.z + o.dir.z * o.L * k }, breite: 2.3 + o.B / 2, v: Math.max(0, o.vLong) });   // Streifenwagen (kit/polizei.js)
    if (this.flieger) for (const o of this.flieger) for (const k of [-0.5, -0.17, 0.17, 0.5]) this.fussgaenger.push({ pos: { x: o.pos.x + o.dir.x * o.L * k, z: o.pos.z + o.dir.z * o.L * k }, breite: 2.3 + o.B / 2, v: 0 });   // gelandeter Jet oder Hubschrauber
    // angefahrene geparkte Autos rollen aus (kit/drive.js gibt ihnen den Schub)
    for (const o of this.geparkt) if (o.vx || o.vz) { o.pos.x += o.vx * dt; o.pos.z += o.vz * dt; const k = Math.exp(-2.4 * dt); o.vx *= k; o.vz *= k; if (o.dreh) { const a = o.dreh * dt, c = Math.cos(a), s = Math.sin(a), dx = o.dir.x, dz = o.dir.z; o.dir.x = dx * c + dz * s; o.dir.z = -dx * s + dz * c; o.dreh *= k; } o.spin += Math.hypot(o.vx, o.vz) * dt * 3; o.pos.y = this.netz.hoehe(o.pos.x, o.pos.z); if (Math.abs(o.vx) + Math.abs(o.vz) < 0.04) { o.vx = 0; o.vz = 0; o.dreh = 0; } }
    const schritte = Math.max(1, Math.ceil(dt / (1 / 30))), h = dt / schritte;
    this.sichtT = (this.sichtT || 0) + dt; if (this.sichtT >= 0.1 && !this.ohneSicht) { this.sichtT = 0; this.sicht(); }
    for (let k = 0; k < schritte; k++) {
      for (const st of this.netz.spuren) if (st.fahrzeuge.length > 1) st.fahrzeuge.sort((a, b) => a.s - b.s);
      for (const v of this.netz.V) if (v.fahrzeuge.length > 1) v.fahrzeuge.sort((a, b) => a.s - b.s);
      for (const fz of this.alle.slice()) this.schritt(fz, h);
    }
    for (const fz of this.alle) this.statistik.maxWarte = Math.max(this.statistik.maxWarte, fz.warte);
    // Blase: wer weit weg ist oder sein Ziel erreicht hat, verschwindet und kommt woanders wieder
    if (this.blase) {
      if (this.dichte && (this.dichteT -= dt) <= 0) this.dichteSetzen();
      const cam = this.fokus, r = this.blase.radius * 1.35;
      const fernSteh = this.mobil ? 115 : 170; let zuViel = Math.min(2, this.alle.length - this.anzahl);   // nach einem Ortswechsel mit weniger Fahrspuren: je Bild höchstens 2 ferne Fahrzeuge auflösen   // wer weit weg vom Blick länger als 80 s steht, löst sich auf und kommt woanders wieder (Stau, den niemand sieht, staut sonst bis in die Sicht zurück)
      for (const fz of this.alle.slice()) { const dC = Math.hypot(fz.pos.x - cam.x, fz.pos.z - cam.z); if (dC > r || (fz.steh > 80 && dC > fernSteh) || (zuViel > 0 && dC > fernSteh && zuViel--)) { this.entferne(fz); if (this.alle.length < this.anzahl) this.neu(); } }
    }
    while (this.alle.length < this.anzahl) { if (!this.neu()) break; }
    this.zeichnen();
  }

  zeichnen() {
    const F = this.flotte; if (!F) return;
    const cam = this.kamera.position;
    F.beginnen();
    for (const fz of this.alle) { F.setze(fz, cam); if (fz.anh) F.setze(fz.anh, cam); }
    for (const fz of this.geparkt) F.setze(fz, cam);
    F.fertig();
  }

  // Prüfwerte nach Regelwerk 1.3 (für tools/verkehr_test.mjs)
  pruefe() {
    const L = this.alle; let ueberlappungen = 0, falscheSpur = 0, bewegt = 0, konflikte = 0; const beispiele = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.v > 0.5) bewegt++;
      const Pa = a.stueck.bei(a.s, new THREE.Vector3()); if (Math.hypot(Pa.x - (a.pos.x + a.dir.x * a.L / 2), Pa.z - (a.pos.z + a.dir.z * a.L / 2)) > Math.abs(a.lat) + 0.6) falscheSpur++;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (a.pos.distanceToSquared(b.pos) > 400) continue;
        if (ueberlappt(a, b)) { ueberlappungen++; if (beispiele.length < 5) { const t = f => `${f.def.id}#${f.id} ${f.grund || ''} ${f.stueck.art} s ${f.s.toFixed(1)}/${f.stueck.len.toFixed(1)} w ${f.stueck.wartepunkt == null ? '-' : f.stueck.wartepunkt.toFixed(1)} v ${f.v.toFixed(1)}`; beispiele.push(`${t(a)} + ${t(b)}`); } }
      }
    }
    // zwei Fahrzeuge gleichzeitig am selben Konfliktpunkt (Bug innerhalb einer Fahrzeuglänge um den Punkt)
    const am = (v, k) => { const s = v.konfliktS.get(k); return v.fahrzeuge.some(o => o.s > s - 1 && o.s < s + o.LG + 1); };
    for (const v of this.netz.V) for (const k of v.konflikte) if (k.id > v.id && !(k.nach === v.nach && k.rin === v.rin) && am(v, k) && am(k, v)) konflikte++;
    const langsam = L.slice().sort((a, b) => b.warte - a.warte)[0];
    const S = this.signale, grund = langsam ? `${langsam.def.id}#${langsam.id} ${langsam.grund || ''} ${langsam.stueck.art} s ${langsam.s.toFixed(1)}/${langsam.stueck.len.toFixed(1)} ${langsam.stueck.r ? langsam.stueck.r.name || '' : langsam.stueck.turn} ${S && langsam.stueck.gruppe ? S.farbe(langsam.stueck.gruppe) : ''}` : '';
    return { fahrzeuge: L.length, ueberlappungen, falscheSpur, konflikte, bewegt, beispiele, warten: L.filter(f => f.v < 0.1).length, maxWarte: Math.max(0, ...L.map(f => f.warte)), langsam: grund };
  }
}
// gedrehte Rechtecke zweier Fahrzeuge: überlappen sie sich? (Trennachsen)
export function ueberlappt(a, b) {
  return kastenUeber(a, b) || (!!a.anh && kastenUeber(a.anh, b)) || (!!b.anh && (kastenUeber(a, b.anh) || (!!a.anh && kastenUeber(a.anh, b.anh))));
}
export function kastenUeber(a, b) {
  const ecken = f => { const hx = f.dir.x * f.L / 2, hz = f.dir.z * f.L / 2, nx = -f.dir.z * f.B / 2, nz = f.dir.x * f.B / 2; return [[f.pos.x + hx + nx, f.pos.z + hz + nz], [f.pos.x + hx - nx, f.pos.z + hz - nz], [f.pos.x - hx - nx, f.pos.z - hz - nz], [f.pos.x - hx + nx, f.pos.z - hz + nz]]; };
  const A = ecken(a), B = ecken(b);
  for (const [ax, az] of [[a.dir.x, a.dir.z], [-a.dir.z, a.dir.x], [b.dir.x, b.dir.z], [-b.dir.z, b.dir.x]]) {
    const pa = A.map(p => p[0] * ax + p[1] * az), pb = B.map(p => p[0] * ax + p[1] * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
