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
  lieferung: { a: 1.3, b: 2.2, T: 1.5, s0: 2.4, tempo: 0.96 }, bus: { a: 0.9, b: 1.7, T: 1.7, s0: 3.0, tempo: 0.9 },
};
const NOTBREMSE = 7.5;
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _r = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// ---------- Geometrie ----------
function laengen(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
// Linie nach rechts versetzen (Gehrung an Knicken, begrenzt)
function versetzt(pts, off) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    let d1x = b[0] - a[0], d1z = b[1] - a[1], d2x = c[0] - b[0], d2z = c[1] - b[1];
    const l1 = Math.hypot(d1x, d1z) || 1, l2 = Math.hypot(d2x, d2z) || 1; d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    if (i === 0) { d1x = d2x; d1z = d2z; } if (i === n - 1) { d2x = d1x; d2z = d1z; }
    let mx = -(d1z + d2z), mz = d1x + d2x; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = Math.min(2.5, 1 / Math.max(0.4, mx * -d1z + mz * d1x));   // Gehrungsfaktor, begrenzt
    out.push([b[0] + mx * off * k, b[1] + mz * off * k]);
  }
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
export function baueNetz(verkehr, { ueberwege = [], halte = [], parkenSeed = 3, links = false, hoehe = null } = {}) {
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
      const basis = e.einbahn ? -e.w / 2 + (e.w - n * lw) / 2 - (park ? park / 2 : 0) + n * lw : mitte / 2 + n * lw;   // rechte Kante der Spuren
      const r = { id: R.length, kante: e, ei, vor, von: vor ? e.a : e.b, nach: vor ? e.b : e.a, pts, cum: laengen(pts), n, lw, basis, park, rang: e.rang ?? 2,
        tempo: (e.tempo || 50) / 3.6, turn: vor ? e.turnV : e.turnZ, schild: vor ? e.schildV : e.schildZ, gruppe: e.gruppe || null, halt: e.halt, name: e.name, bus: e.bus, spuren: [], nachbarn: new Set() };
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
    if (k.art === 'knick') return andere.some(x => x.n !== r.n || Math.abs(x.lw - r.lw) > 0.3) ? 1.5 : 0;
    if (k.art === 'sackgasse') return 1.0;
    if (k.art === 'rand' || k.art === 'portal' || k.art === 'frei') return 0;
    return k.r + Math.max(3, ...andere.map(x => x.kante.w / 2)) + 2.0;
  };
  for (const r of R) {
    const s0 = schnittAn(K[r.von], r), s1 = schnittAn(K[r.nach], r);
    const platz = r.len - s0 - s1 < 2 ? (r.len - 2) / Math.max(1e-6, s0 + s1) : 1;   // sehr kurze Kanten: Rückschnitt anteilig
    for (let k = 0; k < r.n; k++) {
      const off = r.basis - (k + 0.5) * r.lw;
      const linie = versetzt(r.pts, off * SEITE), cum = laengen(linie);
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
  // Spuren verschiedener Straßen, die auf ihrer Länge näher als 2,6 m nebeneinander laufen (getrennt kartierte Abbiegespuren,
  // ungenaue Linien): die kürzere so weit zur Seite schieben, dass zwei Autos nebeneinander passen
  for (let i = 0; i < alleSpuren.length; i++) for (let j = i + 1; j < alleSpuren.length; j++) {
    const a = alleSpuren[i], b = alleSpuren[j];
    if (a.r.kante === b.r.kante) continue;
    const [kurz, lang] = a.len <= b.len ? [a, b] : [b, a];
    let dMin = Infinity, seite = 0;
    for (const p of kurz.pts) {
      for (let q = 1; q < lang.pts.length; q++) {
        const A = lang.pts[q - 1], B = lang.pts[q], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l2)), fx = A[0] + dx * t - p[0], fz = A[1] + dz * t - p[1], d = Math.hypot(fx, fz);
        if (d < dMin) { dMin = d; seite = Math.sign(-dz * (p[0] - A[0]) + dx * (p[1] - A[1])) || 1; }   // Seite der kurzen Spur relativ zur langen
      }
    }
    if (dMin >= 2.6 || dMin < 0.001) continue;
    kurz.pts = versetzt(kurz.pts, seite * (2.6 - dMin)); kurz.cum = laengen(kurz.pts); kurz.len = kurz.cum[kurz.cum.length - 1]; kurz.vmax = kurz.kurvenTempo();
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
    const tok = r.turn && r.turn.length === r.n ? r.turn[r.n - 1 - k] : null;
    if (tok != null) {
      const ok = turn === 'links' ? /left/.test(tok) : turn === 'rechts' ? /right/.test(tok) : (/through|none|merge/.test(tok) || tok === '');
      if (ok) return true;
      if (hatTurn[turn]) return false;   // eine andere Spur darf diese Richtung: hier nicht
    }
    if (r.n === 1) return true;
    return turn === 'links' ? k === r.n - 1 : turn === 'rechts' ? k === 0 : true;
  };
  const verbinde = (sp, ziel, turn, k, rin, rout) => {
    const P0 = sp.pts[sp.pts.length - 1], P3 = ziel.pts[0], t0 = richtung(sp.pts, true), t1 = richtung(ziel.pts, false);
    const dist = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]), wenden = turn === 'wenden';
    const pts = wenden ? kurve(P0, t0, P3, t1, 1.6, 18) : dist < 0.05 ? [P0, P3] : kurve(P0, t0, P3, t1, turn === 'gerade' ? 0.3 : 0.45, Math.max(4, Math.min(22, Math.round(dist / 1.4))));
    const v = new Stueck('verbindung', pts, Math.min(rin.tempo, rout.tempo));
    v.von = sp; v.nach = ziel; v.turn = turn; v.kreuzung = k; v.rin = rin; v.rout = rout; v.gruppe = rin.gruppe; v.konflikte = []; v.id = V.length;
    sp.aus.push(v); V.push(v); rin.nachbarn.add(rout);
    return v;
  };
  for (const k of K) {
    for (const rin of k.an) for (const rout of k.ab) {
      const wenden = rout.kante === rin.kante;
      if (wenden && k.art !== 'sackgasse') continue;
      if (k.art === 'sackgasse' && !wenden) continue;
      const d0 = rin.dirEnde, d1 = rout.dirStart, cross = d0[0] * d1[1] - d0[1] * d1[0], dot = d0[0] * d1[0] + d0[1] * d1[1];
      const turn = wenden ? 'wenden' : dot > 0.82 ? 'gerade' : cross * SEITE > 0 ? 'rechts' : 'links';   // rechts heißt: Abbiegen ohne Gegenverkehr (im Linksverkehr nach links)
      const hatTurn = {};
      if (rin.turn && rin.turn.length === rin.n) for (const t of rin.turn) { if (/left/.test(t)) hatTurn.links = true; if (/right/.test(t)) hatTurn.rechts = true; if (/through|none|merge/.test(t) || t === '') hatTurn.gerade = true; }
      const ein = rin.spuren.filter(sp => erlaubt(rin, sp.k, turn, hatTurn));
      if (!ein.length) continue;
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
    // Konfliktflächen: Verbindungen derselben Kreuzung, die sich näher als 2,4 m kommen (kreuzen oder zusammenführen),
    // mit dem Konfliktpunkt (Meter ab Anfang) auf beiden Verbindungen für die Lückenprüfung nach Zeit
    const hier = V.filter(v => v.kreuzung === k);
    for (let i = 0; i < hier.length; i++) for (let j = i + 1; j < hier.length; j++) {
      const a = hier[i], b = hier[j];
      if (a.von === b.von) continue;
      // erster und letzter Punkt, an dem sich die Kurven näher als 2,8 m kommen (Bus 2,55 m breit plus Luft)
      let sa = -1, sb = -1, ea = -1, eb = -1;
      for (let p = 0; p < a.pts.length; p++) for (let q = 0; q < b.pts.length; q++) if (Math.hypot(a.pts[p][0] - b.pts[q][0], a.pts[p][1] - b.pts[q][1]) < 2.8) {
        if (sa < 0) { sa = a.cum[p]; sb = b.cum[q]; }
        ea = Math.max(ea, a.cum[p]); eb = Math.max(eb, b.cum[q]);
      }
      if (sa < 0) continue;
      // Zusammenführen in dieselbe Spur (Konflikt erst am Ende beider Kurven): Reißverschluss über den Vordermann, kein Warten davor
      if (a.nach === b.nach && sa > a.len - 4 && sb > b.len - 4) { (a.mergeMit ??= new Set()).add(b); (b.mergeMit ??= new Set()).add(a); continue; }
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
  for (const [ji, k] of K.entries()) {
    if (!k.signal || k.an.some(r => r.gruppe) || k.an.length < 2) continue;
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
    for (let s = 6; s < sp.len - 12; s += 6.3) {
      if (Rz() > 0.58) continue;
      if (sp.querungen.some(q => Math.abs(q - s) < 5) || sp.halte.some(h => Math.abs(h - s) < 15)) continue;
      const a = sp.bei(s - 2.5, new THREE.Vector3()), b = sp.bei(s + 2.5, new THREE.Vector3()), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const off = r.lw / 2 + r.park / 2 + 0.05;
      parkplaetze.push({ x: (a.x + b.x) / 2 - dz / l * off * SEITE, z: (a.z + b.z) / 2 + dx / l * off * SEITE, w: Math.atan2(dx / l, dz / l), r });
    }
  }
  return { K, R, V, spuren: alleSpuren, anlagen, parkplaetze, seite: SEITE, links, hoehe: hoehe || (() => 0) };
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
  constructor(anlagen, seed = 4, fallback = null) {
    const Rz = rng(seed);
    this.anlagen = anlagen.map(a => {
      const z = [];
      for (const g of a.gruppen) z.push(['gruen', g.key, g.dauer], ['gelb', g.key, 3], ['rot', null, 2]);
      const lang = z.reduce((s, p) => s + p[2], 0);
      return { ...a, zyklus: z, lang, t: Rz() * lang };
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
  // Fußgänger: Überweg über die Fahrbahn einer Gruppe ist frei, solange diese Gruppe Rot hat und noch mindestens 4 s Rot bleibt
  fussgaengerGruen(key) {
    if (!key) return true;
    if (key.startsWith('x:')) { const g = key.slice(2); return this.farbe(g) === 'rot' && this.bisGruen(g) > 4; }
    if (this.fallback) return this.fallback.fussgaengerGruen(key);
    return true;
  }
  update(dt) {
    for (const a of this.anlagen) a.t += dt;
    if (this.fallback) this.fallback.update(dt);
    if (this.koepfe) this.koepfe.update(this);
  }
}

// Signalköpfe für echte Orte: ein Mast je ankommendem Arm an der Haltelinie, drei Lampen je Kopf als Instanzen mit eigener Farbe
export function baueSignalkoepfe(netz, mats) {
  const koepfe = [];
  for (const a of netz.anlagen) for (const g of a.gruppen) for (const r of netz.R.filter(r => r.gruppe === g.key)) {
    const sp = r.spuren[0], P = sp.pts[sp.pts.length - 1], d = richtung(sp.pts, true), off = (r.lw / 2 + 0.9) * (netz.seite || 1);
    koepfe.push({ x: P[0] - d[1] * off + d[0] * 0.6, z: P[1] + d[0] * off + d[1] * 0.6, ry: Math.atan2(-d[0], -d[1]), key: g.key });
  }
  const gruppe = new THREE.Group(); if (!koepfe.length) return { gruppe, update() {} };
  const mast = new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8); mast.translate(0, 2.2, 0);
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
    for (const r of netz.R) { if (!r.gruppe) continue; for (const sp of r.spuren) { const [, d] = naechste(sp, mx, mz); if (d < bd) { bd = d; best = r; } } }
    if (!best) {   // nur abgehende Spuren getroffen (Einbahn): Gruppe des Arms, der geradeaus hineinführt
      for (const r of netz.R) { if (r.gruppe) continue; for (const sp of r.spuren) { const [, d] = naechste(sp, mx, mz); if (d < bd) { bd = d; best = r; } } }
      if (best) { const k = netz.K[best.von]; const g = k.an.find(x => x.gruppe && x.dirEnde[0] * best.dirStart[0] + x.dirEnde[1] * best.dirStart[1] > 0.5); best = g || null; }
    }
    if (best) { e[3] = 'x:' + best.gruppe; zugeordnet++; }
  }
  return zugeordnet;
}

// ---------- Verkehr ----------
export class Verkehr {
  // netz aus baueNetz, flotte zeichnet (kit/vehicles.js Flotte), signale mit farbe(gruppe), menge liefert Fußgänger
  // fokus: Punkt, um den die Blase liegt (Blickpunkt der Kamera bei Übersichten), sonst die Kamera selbst
  constructor({ netz, flotte, typen, signale, menge = null, kamera, fokus = null, anzahl = 12, seed = 21, mobil = false, blase = null, parken = true }) {
    this.netz = netz; this.flotte = flotte; this.typen = typen; this.signale = signale; this.menge = menge; this.kamera = kamera; this.fokus = fokus || kamera.position;
    this.anzahl = anzahl; this.R = rng(seed); this.mobil = mobil; this.blase = blase; this.alle = []; this.t = 0; this.naechsteId = 1;
    this.routen = new Map(); this.statistik = { eingefahren: 0, rotVerstoesse: 0, konflikte: 0, ueberlappungen: 0, maxWarte: 0, wendungen: 0 };
    // Ziele: Fahrtrichtungen, die an einem Rand oder Portal enden; Einfahrten: Fahrtrichtungen, die dort beginnen
    this.ausfahrten = netz.R.filter(r => ['rand', 'portal'].includes(netz.K[r.nach].art));
    this.einfahrten = netz.R.filter(r => ['rand', 'portal'].includes(netz.K[r.von].art));
    this.anteile = typen.map(t => t.def.anteil);
    this.geparkt = parken ? this.parken() : [];
    for (let i = 0; i < anzahl; i++) this.neu(true);
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
      for (const x of vor[u]) { const nd = d + x.len + 6; if (nd < D[x.id]) { D[x.id] = nd; W[x.id] = u; heap.push([nd, x.id]); hoch(heap.length - 1); } }
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
      if (this.route(z).D[r.id] < Infinity) return z;
    }
    return null;
  }
  // Spur auf r, die die nächste Abbiegung erlaubt
  passendeSpur(r, ziel) {
    const nr = ziel ? this.naechsteR(r, ziel) : null;
    const gut = r.spuren.filter(sp => !nr || sp.aus.some(v => v.rout === nr));
    const liste = gut.length ? gut : r.spuren;
    return liste[Math.floor(this.R() * liste.length)];
  }

  // Neues Fahrzeug an einer Einfahrt (am Start: irgendwo auf dem Netz, außer in Kamera Nähe bei großer Blase)
  neu(start = false) {
    const cam = this.fokus, sicht = this.blase ? (this.mobil ? 55 : 90) : 0;
    let sp = null, s = 0;
    for (let t = 0; t < 40 && !sp; t++) {
      let r;
      if (this.blase) { r = this.netz.R[Math.floor(this.R() * this.netz.R.length)]; }
      else r = start ? this.netz.R[Math.floor(this.R() * this.netz.R.length)] : this.einfahrten[Math.floor(this.R() * this.einfahrten.length)];
      if (!r || !r.spuren.length) continue;
      const kand = this.passendeSpur(r, null);
      const s0 = start || this.blase ? 6 + this.R() * Math.max(0, kand.len - 24) : 0.5;   // nie in den letzten Metern vor der Haltelinie
      if (kand.len < 24) continue;
      const P = kand.bei(s0, _p);
      const d = Math.hypot(P.x - cam.x, P.z - cam.z);
      if (this.blase && (d > this.blase.radius || (!start && d < sicht))) continue;
      if (!this.blase && !start && this.einfahrten.length && d < 1e9) { /* Kreuzung: Einfahrt am Rand, Kamera sieht sie ohnehin */ }
      sp = kand; s = s0;
    }
    if (!sp) return null;
    const typ = this.waehleTyp(), T = this.typen[typ], L = T.def.laenge;
    const ziel = this.neuesZiel(sp.r);
    const besser = this.passendeSpur(sp.r, ziel); if (besser.len > s + L + 4) sp = besser;   // Spur, die zur nächsten Abbiegung passt
    if (!this.frei(sp, s + L, L + 6)) return null;
    const K = KLASSEN[T.def.klasse] || KLASSEN.pkw;
    const fz = { id: this.naechsteId++, typ, def: T.def, K, L, B: T.def.breite, stueck: sp, s: Math.min(sp.len - 0.5, s + L), v: start && sp.len - s > 40 ? sp.tempo * 0.5 : 0, a: 0, ziel, lat: 0, latV: 0,
      hist: [], wahlen: new Map(), warte: 0, gestoppt: false, halt: null, haltZeit: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), spin: 0, lenk: 0, nick: 0, neigung: 0, stufe: -1, gesamt: 0 };
    fz.tempoFaktor = K.tempo * (0.92 + this.R() * 0.16);
    sp.fahrzeuge.push(fz); this.alle.push(fz);
    this.setzePosition(fz);
    return fz;
  }
  frei(sp, s, laenge) {   // ist die Spur um s (nach hinten laenge) frei?
    for (const o of sp.fahrzeuge) if (o.s > s - laenge - o.L - 1 && o.s - o.L < s + 1) return false;
    return true;
  }
  entferne(fz) {
    const i = fz.stueck.fahrzeuge.indexOf(fz); if (i >= 0) fz.stueck.fahrzeuge.splice(i, 1);
    const j = this.alle.indexOf(fz); if (j >= 0) this.alle.splice(j, 1);
  }

  // Geparkte Autos auf den Parkstreifen (nur Pkw und Taxis, ein Teil Lieferwagen)
  parken() {
    const out = [];
    for (const [i, p] of this.netz.parkplaetze.entries()) {
      if (this.mobil && i % 2) continue;   // Handy: jeder zweite Parkplatz (Dreiecksbudget)
      const typ = this.R() < 0.08 ? this.typen.findIndex(t => t.def.klasse === 'lieferung') : this.waehleTyp(true);
      if (typ < 0) continue;
      const T = this.typen[typ]; if (!T) continue;
      const pos = new THREE.Vector3(p.x, this.netz.hoehe(p.x, p.z), p.z), dir = new THREE.Vector3(Math.sin(p.w), 0, Math.cos(p.w));
      out.push({ typ, def: T.def, L: T.def.laenge, B: T.def.breite, pos, dir, spin: this.R() * 6, lenk: 0, nick: 0, neigung: 0, geparkt: true, stufe: -1 });
    }
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
    const lat = fz.lat * (this.netz.seite || 1), px = vorn.x - fz.dir.x * fz.L * 0.5 - fz.dir.z * lat, pz = vorn.z - fz.dir.z * fz.L * 0.5 + fz.dir.x * lat;
    const H = this.netz.hoehe, hv = H(vorn.x, vorn.z), hh = H(hinten.x, hinten.z);
    fz.pos.set(px, (hv + hh) / 2, pz); fz.hang = -Math.atan2(hv - hh, fz.L * 0.82);   // Gelände: Höhe und Steigung zwischen den Achsen
  }

  // Fahrzeuge voraus auf dem eigenen Weg bis weit Meter: [Abstand Stoßstange zu Heck, Fahrzeug]
  vordermann(fz, weit) {
    let st = fz.stueck, basis = -fz.s, sMin = fz.s;   // basis: Abstand vom eigenen Bug zum Anfang des Stücks
    for (let tiefe = 0; tiefe < 6; tiefe++) {
      let best = null, bestS = Infinity;
      for (const o of st.fahrzeuge) if (o !== fz && o.s > sMin && o.s < bestS) { best = o; bestS = o.s; }
      // Verbindungen derselben Spur teilen sich die ersten Meter: wer dort auf einer Schwesterverbindung steht, ist auch Vordermann
      if (st.art === 'verbindung') for (const g of st.von.aus) {
        if (g === st) continue;
        for (const o of g.fahrzeuge) {
          if (o === fz || o.s <= sMin || o.s >= bestS) continue;
          const a = st.bei(Math.min(st.len, o.s), _p), b = g.bei(o.s, _q);
          if (Math.hypot(a.x - b.x, a.z - b.z) < 2.2) { best = o; bestS = o.s; }
        }
      }
      // Reißverschluss: wer auf einer Kurve in dieselbe Spur dem Ende näher ist als wir, ist Vordermann (Abstand über die Restwege gerechnet)
      if (st.art === 'verbindung' && st.mergeMit) for (const g of st.mergeMit) for (const o of g.fahrzeuge) {
        if (o === fz) continue;
        const restO = g.len - o.s, restMe = st.len - Math.max(sMin, 0);
        if (restO < restMe) { const sAls = st.len - restO; if (sAls < bestS && sAls > sMin) { best = o; bestS = sAls; } }
      }
      if (best) return [Math.max(0, basis + bestS - best.L), best];
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
    const L = this.fussgaenger; if (!L.length) return [Infinity, 0];
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
  darfEinfahren(fz, v, dHalt) {
    const S = this.signale, f = S ? S.farbe(v.gruppe) : null;
    this.grund = f;
    if (f === 'rot') return false;
    if (f === 'gelb' && dHalt > fz.v * fz.v / (2 * 3.2) + 1) return false;   // Gelb: anhalten, wenn es noch geht
    this.grund = 'stop'; if (v.von.schild === 'stop' && !fz.gestoppt) return false;
    // dahinter Platz? (Kreuzung freihalten)
    const nach = v.nach; let ersterRueck = Infinity;
    for (const o of nach.fahrzeuge) ersterRueck = Math.min(ersterRueck, o.s - o.L);
    this.grund = 'platz'; if (ersterRueck < fz.L + 1.5) return false;
    // mit Ampel und Platz vor der Konfliktfläche: einfahren und dort warten (konfliktFrei prüft es am Wartepunkt)
    this.grund = 'schlange';
    if (v.wartepunkt !== null && v.wartepunkt > fz.L + 1.0) { let letzter = Infinity; for (const o of v.fahrzeuge) letzter = Math.min(letzter, o.s - o.L); return letzter > fz.L + 1.0 || letzter === Infinity; }
    this.grund = 'konflikt';
    return this.konfliktFrei(fz, v, Math.max(0, dHalt + 0.4));
  }
  // Konfliktflächen der Verbindung v: niemand fährt gerade durch den Konfliktpunkt, und wer Vorrang hat, kommt dort erst an,
  // wenn wir ihn samt Fahrzeuglänge schon verlassen haben (Lücke nach Zeit, nicht nach Abstand). dBis: Meter bis zum Anfang von v.
  konfliktFrei(fz, v, dBis = 0) {
    const S = this.signale, f = S ? S.farbe(v.gruppe) : null, warteLang = fz.warte > 7;
    const vAb = Math.max(fz.v, 2.5);   // beim Anfahren rechnet man mit rund 2,5 m/s
    for (const k of v.konflikte) {
      const kf = S ? S.farbe(k.gruppe) : null, sv = v.konfliktS.get(k), sk = k.konfliktS.get(v);
      const dMe = dBis + sv - (fz.stueck === v ? fz.s : 0), tFrei = (dMe + fz.L + 2.6) / vAb;   // bis unser Heck hinter dem Konfliktpunkt ist
      for (const o of k.fahrzeuge) {
        if (o === fz) continue;
        if (o.s - o.L > k.konfliktEnde.get(v) + 1.0) continue;                               // schon vorbei (Heck hinter dem letzten nahen Punkt)
        const wartet = k.wartepunkt !== null && o.s < k.wartepunkt + 0.3 && o.v < 0.3;   // steht in der Kreuzung vor seiner Konfliktfläche
        if (!wartet) return false;                                                          // fährt auf den Konfliktpunkt zu
        if (this.vorfahrt(k, v, kf) && !(warteLang && o.warte < fz.warte)) return false;   // er ist dran und wartet selbst noch
      }
      if (this.vorfahrt(v, k, f)) continue;
      if (kf === 'rot') continue;   // seine Zufahrt hat Rot, von dort kommt niemand
      for (const o of k.von.fahrzeuge) {
        if (o === fz) continue;
        const d = k.von.len - o.s;
        if (d > 60) continue;
        const ow = o.wahlen.get(k.von); if (ow && ow !== k) continue;
        if (o.v < 0.15 && d > 3) { if (d < 12 && o.warte > fz.warte && !(warteLang && o.warte < fz.warte)) return false; continue; }
        const tO = (d + sk) / Math.max(o.v, 0.8);
        if (tO < tFrei + 1.2) { if (!(warteLang && o.v < 0.1 && o.warte < fz.warte)) return false; }
      }
    }
    return true;
  }
  // hat Verbindung a Vorrang vor b?
  vorfahrt(a, b, farbeA) {
    const S = this.signale;
    if (S && a.gruppe && b.gruppe) {
      if (a.gruppe !== b.gruppe) return S.farbe(a.gruppe) === 'gruen' || S.farbe(a.gruppe) === 'gelb';
      if (a.turn === 'links' && b.turn !== 'links') return false;
      if (b.turn === 'links' && a.turn !== 'links') return true;
      return a.id < b.id;
    }
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
    if (sp.aus.some(v => v.rout === nr)) return;
    const rest = sp.len - fz.s; if (rest < 10 || rest > 120) return;
    for (const dk of [1, -1]) {
      const z = sp.r.spuren[sp.k + dk]; if (!z) continue;
      const naeher = z.aus.some(v => v.rout === nr) || (sp.k + 2 * dk >= 0 && sp.k + 2 * dk < sp.r.n && sp.r.spuren[sp.k + 2 * dk].aus.some(v => v.rout === nr));
      if (!naeher) continue;
      const sz = fz.s / sp.len * z.len;
      let ok = true;
      for (const o of z.fahrzeuge) {
        if (o.s > sz) { if (o.s - o.L - sz < fz.K.s0 + fz.v * 0.9) ok = false; }
        else if (sz - fz.L - o.s < o.K.s0 + o.v * 1.1) ok = false;
      }
      if (!ok) continue;
      const i = sp.fahrzeuge.indexOf(fz); sp.fahrzeuge.splice(i, 1); z.fahrzeuge.push(fz);
      fz.stueck = z; fz.s = sz; fz.lat = sp.r.lw * dk; fz.wahlen.clear();   // seitlich noch auf der alten Spur, gleitet in 2,5 s hinüber
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
    const [dL, leader] = this.vordermann(fz, 80);
    if (leader) { gap = dL; dv = fz.v - leader.v; }
    let halt = Infinity;
    // Haltelinien voraus (auch hinter der nächsten Kreuzung, wenn die Spur dazwischen kurz ist): die erste, an der man nicht weiterdarf
    { let basis = -fz.s, stp = st, tiefe = 0;
      while (stp && basis + stp.len < 75 && tiefe++ < 4) {
        if (stp.art === 'spur' && stp.aus.length) {
          const dHalt = basis + stp.len - 0.4, v = this.verbindungWahl(fz, stp), hier = stp === st;
          if (hier && v.von.schild === 'stop' && dHalt < 1.2 && fz.v < 0.25) fz.gestoppt = true;
          const frei = this.darfEinfahren(fz, v, dHalt);
          if (!frei) { halt = Math.min(halt, dHalt); fz.grund = this.grund; if (dHalt < 2.5 && fz.v < 0.15) fz.warte += dt; break; }   // Wartezeit zählt auch vor einer Linie hinter der Kreuzung (kurze Spur)
          if (hier) fz.warte = 0;
          if (v.von.schild && dHalt < 16) v0 = Math.min(v0, v.von.schild === 'stop' ? 3.5 : 4.5);   // Vorfahrt achten: langsam heran
        } else if (stp.art === 'spur' && !stp.aus.length) { if (stp.ende !== 'rand' && stp.ende !== 'portal') halt = Math.min(halt, basis + stp.len - 0.3); break; }   // Ende ohne Anschluss (am Rand und Portal fährt man hinaus)
        basis += stp.len; stp = this.naechstesStueck(fz, stp);
      } }
    if (st.art === 'verbindung' && st.wartepunkt !== null && fz.s < st.wartepunkt + 0.3) {   // in der Kreuzung vor der Konfliktfläche: auf die Lücke warten
      const dW = st.wartepunkt - fz.s;
      if (!this.konfliktFrei(fz, st)) { halt = Math.min(halt, dW); fz.grund = 'wartepunkt'; if (dW < 2.5 && fz.v < 0.15) fz.warte += dt; }
      else fz.warte = 0;
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
    if (halt + K.s0 - 0.8 < gap) { gap = Math.max(0, halt + K.s0 - 0.8); dv = fz.v - hv; }   // vor Linien und Fußgängern 0,8 m Abstand statt des Stillstandsabstands zu Autos
    // Intelligent Driver Model
    const sStern = K.s0 + Math.max(0, fz.v * K.T + fz.v * dv / (2 * Math.sqrt(K.a * b)));
    let a = K.a * (1 - Math.pow(fz.v / Math.max(0.5, v0), 4) - (gap < Infinity ? Math.pow(sStern / Math.max(0.05, gap), 2) : 0));
    a = Math.max(-NOTBREMSE, Math.min(K.a, a));
    if (gap < 0.25 && fz.v < 0.3) { fz.v = 0; a = 0; }
    fz.a = a;
    fz.v = Math.max(0, fz.v + a * dt);
    const ds = fz.v * dt; fz.s += ds; fz.spin += ds; fz.gesamt += ds;
    if (fz.lat !== 0) { const d = Math.sign(fz.lat) * Math.min(Math.abs(fz.lat), dt * 1.3); fz.lat -= d; if (Math.abs(fz.lat) < 0.02) fz.lat = 0; }
    if (fz.v > 0.3) fz.gestoppt = false;
    // Übergänge: Spur -> Verbindung -> Spur
    let runden = 0;
    while (fz.s > fz.stueck.len && runden++ < 4) {
      const cur = fz.stueck;
      if (cur.art === 'spur' && !cur.aus.length) { this.entferne(fz); this.neu(); return; }   // Ausfahrt am Rand oder Portal
      const n = cur.art === 'spur' ? this.verbindungWahl(fz, cur) : cur.nach;
      if (!n) { this.entferne(fz); this.neu(); return; }
      if (cur.art === 'spur') { this.statistik.eingefahren++; if (this.signale && this.signale.farbe(n.gruppe) === 'rot') this.statistik.rotVerstoesse++; if (n.turn === 'wenden') this.statistik.wendungen++; }
      const i = cur.fahrzeuge.indexOf(fz); if (i >= 0) cur.fahrzeuge.splice(i, 1);
      fz.hist.push(cur); if (fz.hist.length > 4) fz.hist.shift();
      fz.s -= cur.len; fz.stueck = n; n.fahrzeuge.push(fz); fz.wahlen.delete(cur); fz.gestoppt = false; fz.warte = 0;
    }
    if (fz.stueck.art === 'spur' && fz.ziel && !fz.stueck.aus.some(v => v.rout === this.naechsteR(fz.stueck.r, fz.ziel)) && fz.stueck.r.n > 1) this.spurwechsel(fz);
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
    this.fussgaenger = this.menge ? this.menge.alle.filter(p => p.kante && p.kante.art === 'ueberweg' && p.zustand === 'gehen' && !p.statisch) : [];
    const sp = this.spieler;
    if (sp && sp.pos) {
      if (sp.L) {   // Spielerauto: Heck, Mitte und Bug als Hindernisse, damit auch ein querendes Auto gesehen wird
        for (const k of [-0.5, 0, 0.5]) this.fussgaenger.push({ pos: { x: sp.pos.x + sp.dir.x * sp.L * k, z: sp.pos.z + sp.dir.z * sp.L * k }, breite: 2.3 + sp.B / 2, v: Math.max(0, sp.vLong) });
      } else if (sp.pos.y - this.netz.hoehe(sp.pos.x, sp.pos.z) < 0.06) this.fussgaenger.push({ pos: sp.pos, breite: 2.1, v: 0 });
    }
    const schritte = Math.max(1, Math.ceil(dt / (1 / 30))), h = dt / schritte;
    for (let k = 0; k < schritte; k++) {
      for (const st of this.netz.spuren) if (st.fahrzeuge.length > 1) st.fahrzeuge.sort((a, b) => a.s - b.s);
      for (const v of this.netz.V) if (v.fahrzeuge.length > 1) v.fahrzeuge.sort((a, b) => a.s - b.s);
      for (const fz of this.alle.slice()) this.schritt(fz, h);
    }
    for (const fz of this.alle) this.statistik.maxWarte = Math.max(this.statistik.maxWarte, fz.warte);
    // Blase: wer weit weg ist oder sein Ziel erreicht hat, verschwindet und kommt woanders wieder
    if (this.blase) {
      const cam = this.fokus, r = this.blase.radius * 1.35;
      for (const fz of this.alle.slice()) if (Math.hypot(fz.pos.x - cam.x, fz.pos.z - cam.z) > r) { this.entferne(fz); this.neu(); }
    }
    while (this.alle.length < this.anzahl) { if (!this.neu()) break; }
    this.zeichnen();
  }

  zeichnen() {
    const F = this.flotte; if (!F) return;
    const cam = this.kamera.position;
    F.beginnen();
    for (const fz of this.alle) F.setze(fz, cam);
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
    const am = (v, k) => { const s = v.konfliktS.get(k); return v.fahrzeuge.some(o => o.s > s - 1 && o.s < s + o.L + 1); };
    for (const v of this.netz.V) for (const k of v.konflikte) if (k.id > v.id && am(v, k) && am(k, v)) konflikte++;
    const langsam = L.slice().sort((a, b) => b.warte - a.warte)[0];
    const S = this.signale, grund = langsam ? `${langsam.def.id}#${langsam.id} ${langsam.grund || ''} ${langsam.stueck.art} s ${langsam.s.toFixed(1)}/${langsam.stueck.len.toFixed(1)} ${langsam.stueck.r ? langsam.stueck.r.name || '' : langsam.stueck.turn} ${S && langsam.stueck.gruppe ? S.farbe(langsam.stueck.gruppe) : ''}` : '';
    return { fahrzeuge: L.length, ueberlappungen, falscheSpur, konflikte, bewegt, beispiele, warten: L.filter(f => f.v < 0.1).length, maxWarte: Math.max(0, ...L.map(f => f.warte)), langsam: grund };
  }
}
// gedrehte Rechtecke zweier Fahrzeuge: überlappen sie sich? (Trennachsen)
export function ueberlappt(a, b) {
  const ecken = f => { const hx = f.dir.x * f.L / 2, hz = f.dir.z * f.L / 2, nx = -f.dir.z * f.B / 2, nz = f.dir.x * f.B / 2; return [[f.pos.x + hx + nx, f.pos.z + hz + nz], [f.pos.x + hx - nx, f.pos.z + hz - nz], [f.pos.x - hx - nx, f.pos.z - hz - nz], [f.pos.x - hx + nx, f.pos.z - hz + nz]]; };
  const A = ecken(a), B = ecken(b);
  for (const [ax, az] of [[a.dir.x, a.dir.z], [-a.dir.z, a.dir.x], [b.dir.x, b.dir.z], [-b.dir.z, b.dir.x]]) {
    const pa = A.map(p => p[0] * ax + p[1] * az), pb = B.map(p => p[0] * ax + p[1] * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
