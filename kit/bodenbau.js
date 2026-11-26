// Boden im Ortsbau (Wunsch Nr. 107, Runde 2, 19.11.2026, Nader: "die Bodentexturen (Asphalt der Straße, Bürgersteig) sollen wirklich gut sein").
// Läuft im Worker (kit/ortbau.worker.js) und in Node, braucht nichts aus dem Hauptfaden.
// 1. Berliner Gehweg: die Zone zwischen Bordstein und Haus wird zu Dreiecken, dazu entsteht eine Karte mit dem Abstand jedes Punktes zum Bordstein.
//    Der Shader (kit/materials.js gehwegMat) legt daraus die Bänder: Bordstein, Mosaikpflaster, Gehbahn aus Granitplatten, zum Haus hin wieder Mosaikpflaster.
// 2. Abrieb in den Fahrspuren: je Fahrspur ein flaches Band auf der Fahrbahn, der Shader (kit/materials.js spurMat) legt darauf zwei weiche Radspuren.
import earcut from '../node_modules/three/src/extras/lib/earcut.js';

import { GEHWEG } from './bodenmass.js';

const flaecheRing = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2; };
// Strecken in einem Raster: nächster Punkt auf einer Bordsteinkante mit Lage entlang des Rings
class KantenRaster {
  constructor(zelle = 6) { this.z = zelle; this.g = new Map(); this.ax = []; this.az = []; this.bx = []; this.bz = []; this.s0 = []; this.len = []; this.stempel = new Int32Array(1024); this.lauf = 0; }
  add(ax, az, bx, bz, s0) {
    const i = this.ax.length, len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) return;
    this.ax.push(ax); this.az.push(az); this.bx.push(bx); this.bz.push(bz); this.s0.push(s0); this.len.push(len);
    if (i >= this.stempel.length) { const n = new Int32Array(this.stempel.length * 2); n.set(this.stempel); this.stempel = n; }
    const z = this.z;
    for (let x = Math.floor(Math.min(ax, bx) / z); x <= Math.floor(Math.max(ax, bx) / z); x++) for (let y = Math.floor(Math.min(az, bz) / z); y <= Math.floor(Math.max(az, bz) / z); y++) { const k = (x + 50000) * 100000 + (y + 50000); (this.g.get(k) || this.g.set(k, []).get(k)).push(i); }
  }
  // Ergebnis in this.r: d Abstand, s Lage entlang des Rings, fx fz Fußpunkt, tx tz Richtung der Kante. Liefert false, wenn nichts in Reichweite liegt
  naechste(x, z, maxD) {
    const Z = this.z, cx = Math.floor(x / Z), cz = Math.floor(z / Z), rMax = Math.ceil(maxD / Z), st = ++this.lauf, S = this.stempel; let bd = maxD, bi = -1, bt = 0;
    for (let ring = 0; ring <= rMax; ring++) {
      if (bi >= 0 && bd <= (ring - 1) * Z) break;   // alles weiter außen ist sicher weiter weg
      for (let a = cx - ring; a <= cx + ring; a++) for (let b = cz - ring; b <= cz + ring; b++) {
        if (Math.max(Math.abs(a - cx), Math.abs(b - cz)) !== ring) continue;
        const l = this.g.get((a + 50000) * 100000 + (b + 50000)); if (!l) continue;
        for (const i of l) { if (S[i] === st) continue; S[i] = st;
          const dx = this.bx[i] - this.ax[i], dz = this.bz[i] - this.az[i], L = this.len[i], t = Math.max(0, Math.min(1, ((x - this.ax[i]) * dx + (z - this.az[i]) * dz) / (L * L))), d = Math.hypot(this.ax[i] + dx * t - x, this.az[i] + dz * t - z);
          if (d < bd) { bd = d; bi = i; bt = t; } }
      }
    }
    if (bi < 0) return false;
    const dx = this.bx[bi] - this.ax[bi], dz = this.bz[bi] - this.az[bi], L = this.len[bi], r = this.r ||= {};
    r.d = bd; r.s = this.s0[bi] + bt * L; r.fx = this.ax[bi] + dx * bt; r.fz = this.az[bi] + dz * bt; r.tx = dx / L; r.tz = dz / L;
    return true;
  }
}

// Halbe Gleitkommazahl (16 Bit) für die Abstandskarte: lineares Filtern ist dafür in WebGL 2 immer erlaubt
const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
function halb16(v) { _f32[0] = v; const x = _u32[0], s = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff; if (e <= 0) return e < -10 ? s : s | (((m | 0x800000) >> (1 - e)) + 0x1000 >> 13); return e >= 31 ? s | 0x7c00 : s | ((e << 10) + ((m + 0x1000) >> 13)); }

// Abstand mit Vorzeichen zu Ringen in ein Raster schreiben (innen negativ). innenLinks: das Innere liegt links jeder Kante. Liegt ein Punkt einer Ecke am
// nächsten, entscheidet die Ecke: an einer Ecke, die nach innen knickt (das Innere hat dort unter 180 Grad), ist der Keil davor außen, sonst innen. Die Seite
// einer einzelnen Kante gab dort einzelne Punkte mit falschem Vorzeichen (helle Bordsteinpunkte mitten im Gehweg, im Prüfbild gefunden)
function abstandsRaster(ringe, innenLinks, R, D, { n, s, x0, z0 }) {
  const li = innenLinks ? 1 : -1;
  for (const r of ringe) { const m = r.length, K = []; for (let i = 0; i < m; i++) { const a = r[i], b = r[(i + 1) % m], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l > 1e-4) K.push([a[0], a[1], dx, dz, l]); }
    for (let k = 0; k < K.length; k++) { const [ax, az, dx, dz, l] = K[k], V = K[(k + K.length - 1) % K.length], Nn = K[(k + 1) % K.length], l2 = l * l;
      const k0 = (V[2] * dz - V[3] * dx) / (V[4] * l) * li, k1 = (dx * Nn[3] - dz * Nn[2]) / (l * Nn[4]) * li;   // Knick am Anfang und am Ende: positiv, wenn das Innere dort unter 180 Grad hat
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + dx) - R - x0) / s)), i1 = Math.min(n - 1, Math.floor((Math.max(ax, ax + dx) + R - x0) / s)), j0 = Math.max(0, Math.floor((Math.min(az, az + dz) - R - z0) / s)), j1 = Math.min(n - 1, Math.floor((Math.max(az, az + dz) + R - z0) / s));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) { const x = x0 + (ii + 0.5) * s, z = z0 + (j + 0.5) * s, tr = ((x - ax) * dx + (z - az) * dz) / l2, t = tr < 0 ? 0 : tr > 1 ? 1 : tr, d = Math.hypot(ax + dx * t - x, az + dz * t - z), o = j * n + ii;
        if (d >= Math.abs(D[o])) continue;
        const kn = tr < 0 ? k0 : tr > 1 ? k1 : 0, innen = Math.abs(kn) > 0.02 ? kn < 0 : (dx * (z - az) - dz * (x - ax)) * li > 0;
        D[o] = innen ? -d : d; } } }
}

// Berliner Gehweg. C: Clipper Helfer aus kit/ortbau.js, strasseHaupt: Fahrbahn ohne Zufahrten (Clipper Pfade), bloeckeP: Blockflächen, frei: alles, was
// über dem Gehweg liegt (Plätze, Grün, Sand, Radwege, Brückendecks), gebaeude für die Nähe zum Haus, blockIdx für die Inseln (Mittelstreifen und
// Verkehrsinseln ohne Haus sind ganz aus Mosaik), H: halbe Ortskante.
// Ergebnis: Dreiecke ohne Index, je Ecke Lage (x, z), Textur (u entlang des Bordsteins, w quer, in Metern) und Art (1 Gehweg, 0 Insel), dazu die
// Abstandskarte zum Bordstein (1 m je Punkt, halbe Gleitkommazahlen, negativ auf der Fahrbahn, genau bis kappe Meter). Die Bänder legt der Shader aus der
// Karte: so hängen sie nicht an den Dreiecken, die Plattenreihen laufen auch um Ecken und in Bögen ohne Versatz.
// Die Zone reicht überall bis fern. Wo kein Haus in der Nähe steht, werden die Ecken des äußeren Rands auf nah an den Bordstein zurückgezogen (statt die
// Häuser mit Clipper aufzuweiten, das kostete in Kreuzberg 180 ms): so endet der Gehweg an freien Stellen nach dem Oberstreifen und reicht vor Häusern bis zur Wand.
export function gehwegBauen({ C, strasseHaupt, bloeckeP, frei = [], rad = [], gebaeude = [], blockIdx = null, H }) {
  const G = GEHWEG; if (!strasseHaupt?.length || !bloeckeP?.length) return null;
  const Z = globalThis.__bodenZeit, t0 = Z ? Date.now() : 0, zm = n => { if (Z) Z[n] = Date.now() - t0; };
  const polys = C.polys(C.ohneBaum(C.schneide(C.versatz(strasseHaupt, G.fern, { rund: false }), bloeckeP), frei), 1.5);
  zm('flaeche'); if (!polys.length) return null;
  // Bordsteinkanten: Ränder der Fahrbahn, Lage s läuft je Ring durch. Hauswände für die Nähe zum Haus
  const K = new KantenRaster(6), HW = new KantenRaster(8), ringe = strasseHaupt.map(C.vonC).filter(r => Math.abs(flaecheRing(r)) >= 2);   // ohne Splitter aus dem Schließen der Ecken (sonst helle Bordsteinpunkte mitten im Gehweg)
  let gross = 0; for (const r of ringe) { const a = flaecheRing(r); if (Math.abs(a) > Math.abs(gross)) gross = a; }
  const fahrbahnLinks = gross > 0;   // der größte Ring ist ein Außenring: läuft er positiv um, liegt die Fahrbahn links jeder Kante (außen wie im Loch)
  for (const r of ringe) { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; K.add(a[0], a[1], b[0], b[1], s); s += Math.hypot(b[0] - a[0], b[1] - a[1]); } }
  for (const g of gebaeude) { if ((g.m || 0) > 3 || g.b === 'roof' || g.b === 'carport') continue; const r = g.p; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; HW.add(a[0], a[1], b[0], b[1], 0); } }
  const WEIT = G.fern + 3, dist = (x, z) => (K.naechste(x, z, WEIT) ? K.r.d : WEIT);
  // Inseln: Blöcke ohne Haus, klein oder schmal
  const insel = new Set();
  if (blockIdx) { const bebaut = new Set();
    for (const g of gebaeude) { let sx = 0, sz = 0; for (const q of g.p) { sx += q[0]; sz += q[1]; } const i = blockIdx.enthaelt(sx / g.p.length, sz / g.p.length); if (i >= 0) bebaut.add(i); }
    blockIdx.polys.forEach((P, i) => { if (bebaut.has(i)) return; const r = P[0], A = Math.abs(flaecheRing(r)); let U = 0; for (let k = 0, j = r.length - 1; k < r.length; j = k++) U += Math.hypot(r[k][0] - r[j][0], r[k][1] - r[j][1]); if (A < 900 || 2 * A / Math.max(1, U) < 7) insel.add(i); }); }
  zm('kanten'); const pos = [], uv = [], art = [];
  for (const P of polys) {
    // Insel: Stück liegt in einem Block ohne Haus, der klein oder schmal ist (Probe: Schwerpunkt dreier Ecken am Rand)
    let istInsel = false;
    if (insel.size) { const r = P[0]; for (let k = 0; k < Math.min(r.length, 6); k++) { const a = r[k], b = r[(k + 1) % r.length], c = r[(k + 2) % r.length], i = blockIdx.enthaelt((a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3); if (i >= 0) { istInsel = insel.has(i); break; } } }
    const flach = [], loecher = [];
    const setze = (x, z) => {   // Ecke am äußeren Rand ohne Haus in der Nähe: auf nah an den Bordstein zurück
      if (!istInsel && K.naechste(x, z, WEIT) && K.r.d > G.nah + 0.05 && !HW.naechste(x, z, G.haus)) { const k = G.nah / K.r.d; x = K.r.fx + (x - K.r.fx) * k; z = K.r.fz + (z - K.r.fz) * k; }
      flach.push(x, z); };
    for (let r = 0; r < P.length; r++) { if (r) loecher.push(flach.length / 2); const ring = P[r], n = ring.length, dv = istInsel ? null : ring.map(q => dist(q[0], q[1]));
      for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; setze(a[0], a[1]);
        if (!istInsel && dv[i] > G.nah - 0.3 && dv[(i + 1) % n] > G.nah - 0.3) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.ceil(L / 6); for (let k = 1; k < m; k++) setze(a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m); } } }
    const tri = earcut(flach, loecher.length ? loecher : null);
    for (let t = 0; t < tri.length; t += 3) { const a = tri[t] * 2, b = tri[t + 1] * 2, c = tri[t + 2] * 2, ax = flach[a], az = flach[a + 1]; let bx = flach[b], bz = flach[b + 1], cx = flach[c], cz = flach[c + 1];
      const kreuz = (bz - az) * (cx - ax) - (bx - ax) * (cz - az); if (Math.abs(kreuz) < 1e-4) continue;
      if (kreuz < 0) { const x = bx, z = bz; bx = cx; bz = cz; cx = x; cz = z; }   // Umlauf so, dass die Fläche nach oben schaut (wie dreieckeOben in kit/ort.js)
      // Rahmen am Fußpunkt des Schwerpunkts auf dem Bordstein: u läuft mit der Lage entlang des Rings (gerade Bordsteine ohne Naht), w quer dazu
      let tx = 1, tz = 0, fx = 0, fz = 0, s = 0;
      if (!istInsel && K.naechste((ax + bx + cx) / 3, (az + bz + cz) / 3, WEIT)) { const r = K.r; tx = r.tx; tz = r.tz; fx = r.fx; fz = r.fz; s = r.s; }
      for (const [x, z] of [[ax, az], [bx, bz], [cx, cz]]) { pos.push(x, z); uv.push(s + (x - fx) * tx + (z - fz) * tz, (x - fx) * -tz + (z - fz) * tx); art.push(istInsel ? 0 : 1); } }
  }
  zm('dreiecke'); if (!pos.length) return null;
  // Abstandskarte: je Punkt der Abstand zur nächsten Bordsteinkante, auf der Fahrbahn negativ. Nur bis kappe gerechnet (dahinter liegt überall Mosaik)
  const n = 1200, s = 2 * H / n, x0 = -H, z0 = -H, KAPPE = G.m2 + 1.6, D = new Float32Array(n * n).fill(KAPPE), raster = { n, s, x0, z0 };
  abstandsRaster(ringe, fahrbahnLinks, KAPPE, D, raster);
  // Radweg auf dem Gehweg: dahinter beginnt die Gehbahn neu (35 cm Mosaik, dann die Platten), statt dass der Radweg mitten durch die Plattenreihen läuft.
  // Im Radweg zählt der Abstand negativ: so verläuft der Wert über seinen Rand gerade und die Plattenkante steht ohne Zacken
  if (rad.length) { const AB = G.m1 - 0.35, R = KAPPE - AB, rr = rad.map(C.vonC).filter(r => Math.abs(flaecheRing(r)) >= 1), E = new Float32Array(n * n).fill(1e9);
    let gr = 0; for (const r of rr) { const a = flaecheRing(r); if (Math.abs(a) > Math.abs(gr)) gr = a; }
    abstandsRaster(rr, gr > 0, R, E, raster);
    for (let o = 0; o < D.length; o++) if (E[o] < R && D[o] > AB) { const v = Math.max(0.6, E[o] + AB); if (v < D[o]) D[o] = v; } }
  const D16 = new Uint16Array(n * n); for (let i = 0; i < D16.length; i++) D16[i] = halb16(D[i]);
  zm('karte');
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), art: new Float32Array(art), n: pos.length / 2, karte: { n, s, x0, z0, d: D16 } };
}

// Abrieb in den Fahrspuren. kanten: Verkehrskanten (kit/ortbau.js vkKanten), knoten: Knoten mit Art, kreise: Kreuzungsflächen [x, z, Radius im Quadrat],
// versetzt und innenKante aus dem Ortsbau. Die Spurmitten liegen wie im Fahrsystem (kit/traffic.js baueNetz). Brücken und andere Ebenen bleiben weg
// (sonst lägen ihre Spuren quer auf der Straße darunter).
// Ergebnis: je Fahrspur ein Band von 2,6 m Breite als Dreiecke mit Index. Je Ecke Lage (x, z), Lage quer zur Spurmitte in Metern und Stärke (0 bis 1).
// An Kreuzungen und Sackgassen läuft die Stärke über 9 m aus, am Rand des Ortes nicht (dort geht die Spur im Nachbarort weiter). Kein hartes Ende, kein Rechteck
export function radspurenBauen({ kanten, knoten, kreise = [], innenKante, versetzt, H, links = false }) {
  if (!kanten?.length) return null;
  // Kreuzungsflächen im Raster (20 m), damit die Probe je Punkt nur wenige Kreise ansieht
  const KZ = 20, KG = new Map(); for (const q of kreise) { const r = Math.sqrt(q[2]); for (let a = Math.floor((q[0] - r) / KZ); a <= Math.floor((q[0] + r) / KZ); a++) for (let b = Math.floor((q[1] - r) / KZ); b <= Math.floor((q[1] + r) / KZ); b++) { const k = (a + 5000) * 10000 + b + 5000; (KG.get(k) || KG.set(k, []).get(k)).push(q); } }
  const drin = (x, z) => { if (Math.abs(x) > H - 0.05 || Math.abs(z) > H - 0.05) return false; const l = KG.get((Math.floor(x / KZ) + 5000) * 10000 + Math.floor(z / KZ) + 5000); if (l) for (const q of l) if ((x - q[0]) ** 2 + (z - q[1]) ** 2 < q[2]) return false; return true; };
  const SEITE = links ? -1 : 1, HALB = 1.3, stufe = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Linie auf die Fläche zuschneiden (wie linienIn im Ortsbau: abtasten alle 1,2 m, Kanten durch Halbieren)
  const stuecke = pts => { const out = []; let akt = null; const zu = () => { if (akt && akt.length >= 2) out.push(akt); akt = null; };
    for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 1.2)); let war = drin(ax, az), tAlt = 0; if (war && !akt) akt = [[ax, az]];
      for (let k = 1; k <= m; k++) { const t = k / m, ist = drin(ax + (bx - ax) * t, az + (bz - az) * t);
        if (ist !== war) { let lo = tAlt, hi = t; for (let q = 0; q < 6; q++) { const mi = (lo + hi) / 2; if (drin(ax + (bx - ax) * mi, az + (bz - az) * mi) === war) lo = mi; else hi = mi; } const P = [ax + (bx - ax) * hi, az + (bz - az) * hi]; if (war) { akt.push(P); zu(); } else akt = [P]; war = ist; }
        tAlt = t; }
      if (war && akt) akt.push([bx, bz]); }
    zu(); return out; };
  const pos = [], quer = [], st = [], idx = [];
  for (const k of kanten) {
    if (k.hw === 'service' || k.ebene || k.p.length < 2 || innenKante(k)) continue;
    const mitten = [], m2 = (k.mitte || 0) / 2;
    if (k.einbahn) { const rest = (k.w - k.vor * k.lw) / 2, park = k.parkR && rest >= 1.9 ? Math.min(2.3, rest) : 0, basis = -k.w / 2 + rest - park / 2 - (k.stand || 0) / 2 + k.vor * k.lw; for (let i = 0; i < k.vor; i++) mitten.push(basis - (i + 0.5) * k.lw); }
    else { for (let i = 0; i < k.vor; i++) mitten.push(m2 + (i + 0.5) * k.lw); for (let i = 0; i < k.zur; i++) mitten.push(-(m2 + (i + 0.5) * k.lw)); }
    const gew = k.rang >= 4 ? 1 : k.rang === 3 ? 0.85 : k.rang === 2 ? 0.62 : 0.4, endeA = /kreuzung|sackgasse/.test(knoten[k.a]?.[2] || ''), endeB = /kreuzung|sackgasse/.test(knoten[k.b]?.[2] || '');
    for (const v of mitten) { const linie = Math.abs(v) < 0.01 ? k.p : versetzt(k.p, v * SEITE), A = linie[0], B = linie[linie.length - 1];
      for (const p of stuecke(linie)) {
        const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); const L = cum[cum.length - 1]; if (L < 6) continue;
        // Ende mit Auslauf: vom Zuschnitt (Kreuzungsfläche) oder an Kreuzung und Sackgasse. Kein Auslauf am Rand des Ortes und an Knicken
        const amRand = q => Math.abs(q[0]) > H - 2.5 || Math.abs(q[1]) > H - 2.5, nah = (q, w) => Math.hypot(q[0] - w[0], q[1] - w[1]) < 0.9;
        const e0 = p[0], e1 = p[p.length - 1], aus0 = !amRand(e0) && (nah(e0, A) ? endeA : nah(e0, B) ? endeB : true), aus1 = !amRand(e1) && (nah(e1, B) ? endeB : nah(e1, A) ? endeA : true);
        // Stützstellen: die Punkte der Linie, höchstens 12 m Abstand, im Auslauf dichter (die Stärke läuft zwischen den Stellen gerade)
        const lagen = new Set(cum.map(c => Math.round(c * 100) / 100)); for (let c = 12; c < L; c += 12) lagen.add(c);
        for (const c of [1.5, 3.2, 5, 7, 9]) { if (aus0 && c < L / 2) lagen.add(c); if (aus1 && c < L / 2) lagen.add(Math.round((L - c) * 100) / 100); }
        const sorte = [...lagen].sort((a, b) => a - b), mitte = [], stark = []; let seg = 1, zuletzt = -1;
        for (const c of sorte) { if (c - zuletzt < 0.4 && c < L) continue; while (seg < p.length - 1 && cum[seg] < c) seg++; const l = cum[seg] - cum[seg - 1] || 1, t = Math.max(0, Math.min(1, (c - cum[seg - 1]) / l));
          mitte.push([p[seg - 1][0] + (p[seg][0] - p[seg - 1][0]) * t, p[seg - 1][1] + (p[seg][1] - p[seg - 1][1]) * t]); stark.push(gew * stufe(1.5, 9, Math.min(aus0 ? c : 1e9, aus1 ? L - c : 1e9))); zuletzt = c; }
        if (mitte.length < 2) continue;
        const li = versetzt(mitte, -HALB), re = versetzt(mitte, HALB), basis = pos.length / 2;
        for (let i = 0; i < mitte.length; i++) { pos.push(li[i][0], li[i][1], re[i][0], re[i][1]); quer.push(-HALB, HALB); st.push(stark[i], stark[i]); }
        for (let i = 0; i < mitte.length - 1; i++) { const a = basis + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      } }
  }
  return idx.length ? { pos: new Float32Array(pos), quer: new Float32Array(quer), staerke: new Float32Array(st), index: new Uint32Array(idx) } : null;
}
