// Kachel wird Ort (08_WELTBAU.md Phase 3, seit 29.10.2026): aus OpenFreeMap Vektorkacheln (OpenMapTiles, ODbL) entsteht für jede Stelle
// der Erde dasselbe Datenformat wie tools/ort_bauen.py aus dem OSM Auszug am Potsdamer Platz. So laufen kit/ort.js (Boden, Gebäude, Bäume),
// kit/traffic.js (Verkehr), kit/crowd.js (Menschen) und kit/interior.js (Innenräume) überall unverändert.
// Was die Kacheln nicht haben, kommt per Regel (04_REGELWERK.md, kit/regionen.js):
//   Häuser: die Kacheln fassen aneinander gebaute Häuser gleicher Höhe zu einem Umriss zusammen (Potsdamer Platz 155 statt rund 1.500).
//           Parzellenteilung zerlegt sie wieder (Schnitt quer zur langen Achse, durch Innenhöfe, bis zur Parzellengröße der Region).
//   Straßen: keine Breite und keine Spuren. Breite nach Klasse und Region, begrenzt durch den Abstand der Fassaden (Gehweg bleibt frei).
//   Ampeln, Überwege: an Kreuzungen nach Straßenrang. Bäume, Laternen: entlang der Straßen nach Region.
// Läuft im Worker (kit/ortbau.worker.js) und in Node (tools/ortbau_test.mjs). Clipper (clipper-lib, Boost Lizenz) kommt als Argument.
import { gebaeudeTyp, baumArt, fuellTyp, hoeheUnbekannt, hoeheSchaetzen, DichteRaster, ortsDeckel, hausKennung } from './regionen.js';
import { WALD_ARTEN, waldArt } from './waldarten.js';
import { inWahrzeichen } from './wahrzeichen_liste.js';
import { lod2InOrt, lod2Hoehe, lod2Art, lod2DachZuschneiden } from './lod2.js';
import { osmInOrt, osmZuordnen, osmAmpelKnoten } from './osmverkehr.js';
import { teileInOrt, teilFern, hochStil } from './osmteile.js';
import { berlinTyp, kiezeDa, kiezBei, streckung, dachRotBei, sonderZone } from './kieze.js';
import { WF_PREMIUM, WF_RASTER, wfRasterLon, wfZelle, wfCode } from './werbeflaechen.js';
import { tunnelSammeln } from './tunnelbau.js';
import { brueckenSammeln } from './brueckenbau.js';
import { eingaengeImOrt } from './ubahnbau.js';

const S = 100;   // Clipper rechnet in Zentimetern
const r2 = v => Math.round(v * 100) / 100;
const hash = t => { let h = 7; for (let i = 0; i < t.length; i++) h = Math.imul(h, 31) + t.charCodeAt(i) | 0; return h; };
function rng(seed) { let s = Math.imul((seed >>> 0) ^ 0x5bd1e995, 0x2c1b3c6d); s ^= s >>> 15; s = Math.imul(s, 0x297a2d39); s = ((s ^ (s >>> 15)) >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------- Geometrie ----------
const flaecheRing = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2; };
function innenRing(r, x, z) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const innenPoly = (P, x, z) => innenRing(P[0], x, z) && !P.slice(1).some(h => innenRing(h, x, z));
function laenge(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }
// Fehlende Knoten im Straßennetz ergänzen (Wunsch Nr. 77). L: Linien { p, hw, ebene } in Metern um die Mitte, H: halbe Ortskante.
// 1. Schnitt zweier Linien auf gleicher Ebene: beide bekommen den Schnittpunkt (liegt er bis 2,5 m vor einem Linienende, endet die Linie dort,
//    statt einen Stummel zu behalten). Nie an Autobahnen und nie fast parallel (unter 6 Grad, dort laufen Fahrbahnpaare zusammen).
// 2. Linienende bis 1,5 m neben einer anderen Linie: ist es frei (kein Punkt einer anderen Linie im Umkreis von 0,7 m), rückt es auf die Linie,
//    bis 3 m, wenn es quer (ab 35 Grad) auf sie zuläuft. Ist es schon eine Kreuzung anderer Linien, läuft die nahe Linie durch diesen Knoten.
//    Ränder des Ortes bleiben frei.
function knotenErgaenzen(L, H) {
  const Z = 30, kz = (i, j) => i * 100003 + j, ebene = e => e.ebene || 0, autobahn = e => e.hw === 'motorway';
  const raster = () => { const m = new Map(); L.forEach((e, li) => { for (let i = 1; i < e.p.length; i++) { const A = e.p[i - 1], B = e.p[i]; for (let x = Math.floor(Math.min(A[0], B[0]) / Z) - 1; x <= Math.floor(Math.max(A[0], B[0]) / Z) + 1; x++) for (let z = Math.floor(Math.min(A[1], B[1]) / Z) - 1; z <= Math.floor(Math.max(A[1], B[1]) / Z) + 1; z++) { const k = kz(x, z); (m.get(k) || m.set(k, []).get(k)).push(li * 100000 + i); } } }); return m; };
  const r2 = v => Math.round(v * 100) / 100;
  const anwenden = schnitte => {   // schnitte: Map li -> [{ i, t, P, ende }]
    for (const [li, liste] of schnitte) {
      const e = L[li], proSeg = new Map(); for (const c of liste) (proSeg.get(c.i) || proSeg.set(c.i, []).get(c.i)).push(c);
      let neu = [e.p[0]]; for (let i = 1; i < e.p.length; i++) { for (const c of (proSeg.get(i) || []).sort((a, b) => a.t - b.t)) neu.push(c.P); neu.push(e.p[i]); }
      for (const c of liste) { if (!c.ende) continue; const k = neu.indexOf(c.P); if (k < 0) continue; neu = c.ende === 'start' ? neu.slice(k) : neu.slice(0, k + 1); }
      const sauber = [neu[0]]; for (let i = 1; i < neu.length; i++) if (Math.hypot(neu[i][0] - sauber[sauber.length - 1][0], neu[i][1] - sauber[sauber.length - 1][1]) > 0.05) sauber.push(neu[i]);
      if (sauber.length >= 2) e.p = sauber;
    }
  };
  const nahePunkt = (e, P, r) => { for (const q of e.p) if (Math.hypot(q[0] - P[0], q[1] - P[1]) < r) return q; return null; };
  const entlang = (e, i, t) => { let s = 0; for (let k = 1; k < i; k++) s += Math.hypot(e.p[k][0] - e.p[k - 1][0], e.p[k][1] - e.p[k - 1][1]); s += t * Math.hypot(e.p[i][0] - e.p[i - 1][0], e.p[i][1] - e.p[i - 1][1]); return s; };
  // 0. Zwei Linien knicken an einer Kreuzung, ihre Knickpunkte liegen aber 0,7 bis 2 m auseinander (Kreuzung als zwei Linien kartiert, die sich nur
  //    berühren): beide Punkte auf ihre Mitte legen. Nicht, wenn die Linien in der Nähe (15 m) schon einen gemeinsamen Punkt haben (Gabelung).
  { const ZP = 4, pk = new Map(), pkey = (x, z) => kz(Math.floor(x / ZP), Math.floor(z / ZP)), fertig = new Set();
    L.forEach((e, li) => e.p.forEach((q, qi) => { const k = pkey(q[0], q[1]); (pk.get(k) || pk.set(k, []).get(k)).push([li, qi]); }));
    const gemeinsam = (a, b, um) => L[a].p.some(q => Math.hypot(q[0] - um[0], q[1] - um[1]) < 15 && L[b].p.some(w => Math.hypot(w[0] - q[0], w[1] - q[1]) < 0.7));
    L.forEach((e, li) => e.p.forEach((v, vi) => {
      if (fertig.has(li + ':' + vi) || autobahn(e)) return;
      const gx = Math.floor(v[0] / ZP), gz = Math.floor(v[1] / ZP); let best = null;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [lj, wj] of pk.get(kz(gx + a, gz + b)) || []) {
        if (lj === li || fertig.has(lj + ':' + wj)) continue; const f = L[lj], w = f.p[wj]; if (ebene(f) !== ebene(e) || autobahn(f)) continue;
        const d = Math.hypot(w[0] - v[0], w[1] - v[1]); if (d <= 0.7 || d > 2.0 || (best && d >= best.d)) continue;
        best = { d, lj, wj, w };
      }
      if (!best || gemeinsam(li, best.lj, v)) return;
      const mx = r2((v[0] + best.w[0]) / 2), mz = r2((v[1] + best.w[1]) / 2); v[0] = mx; v[1] = mz; best.w[0] = mx; best.w[1] = mz;
      fertig.add(li + ':' + vi); fertig.add(best.lj + ':' + best.wj);
    })); }
  // 1. Schnitte
  { const m = raster(), gesehen = new Set(), schnitte = new Map(), dazu = (li, c) => (schnitte.get(li) || schnitte.set(li, []).get(li)).push(c);
    for (const zelle of m.values()) for (let a = 0; a < zelle.length; a++) for (let b = a + 1; b < zelle.length; b++) {
      const sa = zelle[a], sb = zelle[b], la = Math.floor(sa / 100000), lb = Math.floor(sb / 100000); if (la === lb) continue;
      const key = sa < sb ? sa + ':' + sb : sb + ':' + sa; if (gesehen.has(key)) continue; gesehen.add(key);
      const ea = L[la], eb = L[lb]; if (ebene(ea) !== ebene(eb) || autobahn(ea) || autobahn(eb)) continue;
      const ia = sa % 100000, ib = sb % 100000, A = ea.p[ia - 1], B = ea.p[ia], C = eb.p[ib - 1], D = eb.p[ib];
      const rx = B[0] - A[0], rz = B[1] - A[1], sx = D[0] - C[0], sz = D[1] - C[1], den = rx * sz - rz * sx, lr = Math.hypot(rx, rz), ls = Math.hypot(sx, sz);
      if (Math.abs(den) < 0.105 * lr * ls) continue;   // fast parallel
      const t = ((C[0] - A[0]) * sz - (C[1] - A[1]) * sx) / den, u = ((C[0] - A[0]) * rz - (C[1] - A[1]) * rx) / den;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue;
      let P = [r2(A[0] + rx * t), r2(A[1] + rz * t)];
      const va = nahePunkt(ea, P, 0.6), vb = nahePunkt(eb, P, 0.6);
      if (va && vb) continue;   // beide haben dort schon einen Punkt: das Fangen auf 0,7 m verbindet sie
      if (va) P = va.slice(); else if (vb) P = vb.slice();
      for (const [li, e, i, tt, v] of [[la, ea, ia, t, va], [lb, eb, ib, u, vb]]) {
        if (v) continue;
        const s = entlang(e, i, tt), Lg = entlang(e, e.p.length - 1, 1);
        dazu(li, { i, t: tt, P, ende: s < 2.5 ? 'start' : Lg - s < 2.5 ? 'ende' : null });
      }
    }
    anwenden(schnitte); }
  // 2. freie Enden anschließen
  { const m = raster(), schnitte = new Map(), dazu = (li, c) => (schnitte.get(li) || schnitte.set(li, []).get(li)).push(c);
    L.forEach((e, li) => {
      for (const ende of [0, 1]) {
        const Q = ende ? e.p[e.p.length - 1] : e.p[0], R = ende ? e.p[e.p.length - 2] : e.p[1];
        if (Math.max(Math.abs(Q[0]), Math.abs(Q[1])) >= H - 1) continue;
        const kand = m.get(kz(Math.floor(Q[0] / Z), Math.floor(Q[1] / Z))) || [];
        const amKnoten = new Set(kand.map(sg => Math.floor(sg / 100000)).filter(lj => lj !== li && L[lj].p.some(q => Math.hypot(q[0] - Q[0], q[1] - Q[1]) < 0.7)));
        const dl = Math.hypot(Q[0] - R[0], Q[1] - R[1]) || 1, dx = (Q[0] - R[0]) / dl, dz = (Q[1] - R[1]) / dl;
        let best = null;
        for (const sg of kand) {
          const lj = Math.floor(sg / 100000); if (lj === li || amKnoten.has(lj)) continue; const f = L[lj]; if (ebene(f) !== ebene(e) || autobahn(f)) continue;
          const i = sg % 100000, A = f.p[i - 1], B = f.p[i], ax = B[0] - A[0], az = B[1] - A[1], l2 = ax * ax + az * az || 1e-9, t = Math.max(0, Math.min(1, ((Q[0] - A[0]) * ax + (Q[1] - A[1]) * az) / l2));
          const P = [A[0] + ax * t, A[1] + az * t], d = Math.hypot(P[0] - Q[0], P[1] - Q[1]), quer = Math.abs(dx * az - dz * ax) / Math.sqrt(l2);
          if (d > (amKnoten.size ? 1.5 : quer >= 0.57 ? 3 : 1.5)) continue;
          if (!best || d < best.d) best = { d, lj, i, t, P, A, B, l: Math.sqrt(l2) };
        }
        if (!best) continue;
        // Ende an einer Kreuzung anderer Linien: die nahe Linie läuft durch diesen Knoten (bis 1,5 m verbogen), sonst verlören die anderen ihren Anschluss.
        // Freies Ende: es rückt auf die nahe Linie (an ihren Punkt, wenn einer bis 0,7 m nah ist).
        if (amKnoten.size) { if (best.t * best.l >= 0.7 && (1 - best.t) * best.l >= 0.7) dazu(best.lj, { i: best.i, t: best.t, P: [Q[0], Q[1]], ende: null }); continue; }
        let P;
        if (best.t * best.l < 0.7) P = best.A.slice(); else if ((1 - best.t) * best.l < 0.7) P = best.B.slice();
        else { P = [r2(best.P[0]), r2(best.P[1])]; dazu(best.lj, { i: best.i, t: best.t, P, ende: null }); }
        if (ende) e.p[e.p.length - 1] = P.slice(); else e.p[0] = P.slice();
      }
    });
    anwenden(schnitte); }
}
function punktBei(pts, s) {   // Punkt und Richtung bei Bogenlänge s
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= l || i === pts.length - 1) { const t = l > 1e-9 ? Math.min(1, s / l) : 0; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / (l || 1), dz: (b[1] - a[1]) / (l || 1) }; }
    s -= l;
  }
  return null;
}
// feste Stellen der Erde entlang einer Linie (Kachelraster, Wunsch Nr. 36): dort, wo die Weltlage auf der Hauptachse des Abschnitts ein
// Vielfaches von sp plus off kreuzt. Zwei Orte, die dieselbe Straße enthalten, setzen Bäume und Laternen so an genau dieselben Stellen
// (vorher hing der Abstand am Anfang der beim Ort abgeschnittenen Linie, jeder Ortswechsel verteilte sie neu). Ergebnis: Bogenlängen
function weltStellen(l, sp, off, GX, GZ) {
  const out = []; let cum = 0;
  for (let i = 1; i < l.length; i++) {
    const [ax, az] = l[i - 1], [bx, bz] = l[i], L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) continue;
    const aufX = Math.abs(bx - ax) >= Math.abs(bz - az), wa = aufX ? ax + GX : az + GZ, wb = aufX ? bx + GX : bz + GZ, lo = Math.min(wa, wb), hi = Math.max(wa, wb);
    for (let k = Math.ceil((lo - off) / sp); k * sp + off < hi; k++) out.push(cum + (k * sp + off - wa) / (wb - wa) * L);
    cum += L;
  }
  return out;
}
const hashXZ = (x, z) => ((Math.round(x) * 73856093) ^ (Math.round(z) * 19349663)) >>> 0 || 1;
const hashText = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0 || 1; };
function dichter(pts, maxL, zu = false) {   // Linie oder Ring auf höchstens maxL lange Stücke teilen
  const out = [], n = pts.length, m = zu ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(l / maxL));
    for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
  }
  if (!zu) out.push(pts[n - 1]);
  return out;
}
// Linie seitlich versetzen (positiv = rechts von der Laufrichtung, rechts von (dx, dz) ist (-dz, dx)), Gehrung begrenzt
function versetzt(pts, d) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    let n1x = 0, n1z = 0, n2x = 0, n2z = 0;
    if (i > 0) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; n1x = -(b[1] - a[1]) / l; n1z = (b[0] - a[0]) / l; }
    if (i < pts.length - 1) { const l = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1; n2x = -(c[1] - b[1]) / l; n2z = (c[0] - b[0]) / l; }
    if (i === 0) { n1x = n2x; n1z = n2z; } if (i === pts.length - 1) { n2x = n1x; n2z = n1z; }
    let mx = n1x + n2x, mz = n1z + n2z; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = d / Math.max(0.5, mx * n1x + mz * n1z);
    out.push([b[0] + mx * k, b[1] + mz * k]);
  }
  return out;
}
// Linie an einem Rechteck schneiden (Liang Barsky je Stück), liefert Teilstücke
function linieImRechteck(pts, x0, z0, x1, z1) {
  const out = []; let cur = null;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p; if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok) { if (cur) { out.push(cur); cur = null; } continue; }
    const A = [ax + dx * t0, az + dz * t0], B = [ax + dx * t1, az + dz * t1];
    if (!cur) cur = [A]; else if (t0 > 1e-9) { out.push(cur); cur = [A]; }
    cur.push(B);
    if (t1 < 1 - 1e-9) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter(l => l.length >= 2 && laenge(l) > 0.2);
}
// kleinstes umschließendes Rechteck (über die Kanten der konvexen Hülle)
function huelle(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), kreuz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && kreuz(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (hi.length >= 2 && kreuz(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function minRechteck(ring) {
  const h = huelle(ring); let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
  }
  if (!best) return null;
  if (best.u1 - best.u0 < best.v1 - best.v0) {   // lange Achse nach u
    const { ux, uz, u0, u1, v0, v1 } = best; best = { A: best.A, ux: -uz, uz: ux, u0: v0, u1: v1, v0: -u1, v1: -u0 };
  }
  best.L = best.u1 - best.u0; best.B = best.v1 - best.v0;
  return best;
}
// Grundriss säubern wie in tools/ort_bauen.py: Kanten unter 0,5 m, Nadelspitzen, Punkte auf einer Geraden
function saeubern(pts) {
  pts = pts.slice();
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  let geaendert = true;
  while (geaendert && pts.length > 3) {
    geaendert = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
      if (ab < 0.5 || bc < 1e-6) { pts.splice(i, 1); geaendert = true; break; }
      const cosw = ((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / (ab * bc);
      if (cosw > Math.cos(15 * Math.PI / 180) || cosw < Math.cos(177 * Math.PI / 180)) { pts.splice(i, 1); geaendert = true; break; }
    }
  }
  return pts;
}

// ---------- Raster Indizes für schnelle Abfragen ----------
const ZK = (a, b) => (a + 50000) * 100000 + (b + 50000);   // Rasterschlüssel als Zahl (schneller als Text)
export class FlaechenIndex {   // Punkt in vielen Polygonen [[aussen, ...loecher], ...] (auch für tools/kreuzung_pruefen.mjs)
  constructor(polys, zelle = 25) {
    this.polys = polys; this.zelle = zelle; this.g = new Map();
    polys.forEach((P, i) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of P[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
      for (let a = Math.floor(x0 / zelle); a <= Math.floor(x1 / zelle); a++) for (let b = Math.floor(z0 / zelle); b <= Math.floor(z1 / zelle); b++) { const k = ZK(a, b); (this.g.get(k) || this.g.set(k, []).get(k)).push(i); } });
  }
  enthaelt(x, z) { const l = this.g.get(ZK(Math.floor(x / this.zelle), Math.floor(z / this.zelle))); if (!l) return -1; for (const i of l) if (innenPoly(this.polys[i], x, z)) return i; return -1; }
}
class StreckenIndex {   // nächste Strecke zu einem Punkt; seit 29.10.2026 mit Stempeln statt Set je Abfrage (Tokio: Millionen Abfragen)
  constructor(zelle = 12) { this.zelle = zelle; this.g = new Map(); this.s = []; this.stempel = new Int32Array(4096); this.lauf = 0; }
  add(a, b, daten) {
    const i = this.s.length; this.s.push({ a, b, daten }); const z = this.zelle;
    if (i >= this.stempel.length) { const n = new Int32Array(this.stempel.length * 2); n.set(this.stempel); this.stempel = n; }
    for (let x = Math.floor(Math.min(a[0], b[0]) / z); x <= Math.floor(Math.max(a[0], b[0]) / z); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / z); y <= Math.floor(Math.max(a[1], b[1]) / z); y++) { const k = ZK(x, y); (this.g.get(k) || this.g.set(k, []).get(k)).push(i); }
  }
  naechste(x, z, maxD, filter) {
    const r = Math.ceil(maxD / this.zelle), cx = Math.floor(x / this.zelle), cz = Math.floor(z / this.zelle); let best = null, bd = maxD;
    const st = ++this.lauf, S = this.stempel;
    for (let a = cx - r; a <= cx + r; a++) for (let b = cz - r; b <= cz + r; b++) { const l = this.g.get(ZK(a, b)); if (!l) continue; for (const i of l) {
      if (S[i] === st) continue; S[i] = st; const s = this.s[i]; if (filter && !filter(s)) continue;
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2));
      const px = s.a[0] + dx * t, pz = s.a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { d, t, x: px, z: pz, s, i }; }
    } }
    return best;
  }
  // Abstand entlang eines Strahls bis zur ersten Strecke (Fassaden für die Straßenbreite, Ränder für Überwege)
  strahl(x, z, dx, dz, maxD) {
    const z0 = this.zelle, x1 = x + dx * maxD, zz1 = z + dz * maxD; let best = maxD; const st = ++this.lauf, S = this.stempel;
    for (let a = Math.floor(Math.min(x, x1) / z0); a <= Math.floor(Math.max(x, x1) / z0); a++) for (let b = Math.floor(Math.min(z, zz1) / z0); b <= Math.floor(Math.max(z, zz1) / z0); b++) { const l = this.g.get(ZK(a, b)); if (!l) continue; for (const i of l) {
      if (S[i] === st) continue; S[i] = st; const s = this.s[i], ex = s.b[0] - s.a[0], ez = s.b[1] - s.a[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((s.a[0] - x) * ez - (s.a[1] - z) * ex) / den, u = ((s.a[0] - x) * dz - (s.a[1] - z) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    } }
    return best;
  }
}

// ---------- Clipper ----------
// Clipper 6.4.2 (JS) fügt lokale Minima und Scanlinien sortiert in einfach verkettete Listen ein, das ist quadratisch: bei Tokio
// (Vereinigung von tausenden Straßenstücken und Häusern) 3,5 von 6 Sekunden. Seit 29.10.2026: Minima sammeln und einmal sortieren,
// Scanlinien als binärer Heap (größtes Y zuerst, Doppelte beim Herausnehmen übersprungen). Ergebnis wie vorher, nur schneller.
function beschleunige(CL) {
  if (CL._schnell) return; CL._schnell = true;
  const B = {};   // ClipperLib.Inherit kopiert die Methoden der Basis in Clipper.prototype, darum unten in beide schreiben
  B.InsertLocalMinima = function (lm) { (this._lm || (this._lm = [])).push(lm); };
  B._lmListe = function () {
    if (!this._lm || !this._lm.length) return;
    const arr = this._lm; this._lm = [];
    for (let l = this.m_MinimaList; l !== null; l = l.Next) arr.push(l);
    arr.sort((a, b) => b.Y - a.Y);
    for (let i = 0; i < arr.length; i++) arr[i].Next = i + 1 < arr.length ? arr[i + 1] : null;
    this.m_MinimaList = arr[0];
  };
  B.DisposeLocalMinimaList = function () { this._lm = []; this.m_MinimaList = null; this.m_CurrentLM = null; };
  const reset = CL.ClipperBase.prototype.Reset;
  B.Reset = function () { this._lmListe(); this._sb = []; return reset.call(this); };
  B.InsertScanbeam = function (Y) {
    const h = this._sb || (this._sb = []); h.push(Y); let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p] >= h[i]) break; const t = h[p]; h[p] = h[i]; h[i] = t; i = p; }
  };
  const raus = h => {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l] > h[m]) m = l; if (r < h.length && h[r] > h[m]) m = r; if (m === i) break; const t = h[m]; h[m] = h[i]; h[i] = t; i = m; } }
    return top;
  };
  B.PopScanbeam = function (Y) { const h = this._sb; if (!h || !h.length) { Y.v = 0; return false; } const v = raus(h); while (h.length && h[0] === v) raus(h); Y.v = v; return true; };
  for (const P of [CL.ClipperBase.prototype, CL.Clipper.prototype]) Object.assign(P, B);
}
function clipperHelfer(CL) {
  beschleunige(CL);
  const zuC = ring => ring.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }));
  const vonC = p => p.map(q => [q.X / S, q.Y / S]);
  const polysZuC = polys => polys.flatMap(P => P.map(zuC));
  function ausfuehren(typ, subj, clip, { offen = false, baum = true, fuellung = CL.PolyFillType.pftNonZero } = {}) {
    const c = new CL.Clipper();
    if (subj.length) c.AddPaths(subj, CL.PolyType.ptSubject, !offen);
    if (clip && clip.length) c.AddPaths(clip, CL.PolyType.ptClip, true);
    if (offen) { const t = new CL.PolyTree(); c.Execute(typ, t, fuellung, fuellung); return CL.Clipper.OpenPathsFromPolyTree(t); }
    if (baum) { const t = new CL.PolyTree(); c.Execute(typ, t, fuellung, fuellung); return t; }
    const out = new CL.Paths(); c.Execute(typ, out, fuellung, fuellung); return out;
  }
  // PolyTree -> [[aussen, ...loecher], ...] in Metern
  function polys(baum, minA = 0.5) {
    const out = [];
    const geh = n => { for (const k of n.Childs()) { if (!k.IsHole()) { const P = [vonC(k.Contour())]; for (const h of k.Childs()) if (h.IsHole()) { P.push(vonC(h.Contour())); geh(h); } if (Math.abs(flaecheRing(P[0])) >= minA) out.push(P); } } };
    geh(baum); return out;
  }
  const H = {
    zuC, vonC, polysZuC, polys,
    vereinige: (paths, gerade = false) => ausfuehren(CL.ClipType.ctUnion, paths, null, { baum: false, fuellung: gerade ? CL.PolyFillType.pftEvenOdd : CL.PolyFillType.pftNonZero }),
    // Polygone (als Pfade) mit Löchern sauber machen: einzelnes Merkmal mit gerade/ungerade Regel
    normal: paths => ausfuehren(CL.ClipType.ctUnion, paths, null, { baum: false, fuellung: CL.PolyFillType.pftEvenOdd }),
    schneide: (a, b) => ausfuehren(CL.ClipType.ctIntersection, a, b, { baum: false }),
    ohne: (a, b) => ausfuehren(CL.ClipType.ctDifference, a, b, { baum: false }),
    schneideBaum: (a, b) => ausfuehren(CL.ClipType.ctIntersection, a, b),
    ohneBaum: (a, b) => ausfuehren(CL.ClipType.ctDifference, a, b),
    baum: paths => ausfuehren(CL.ClipType.ctUnion, paths, null),
    // Linien in einer Fläche. Eigene Prüfung statt Clipper mit offenen Pfaden (04.11.2026): die Bibliothek lief bei ungünstiger Geometrie in eine
    // Endlosschleife, bis der Speicher voll war und die Seite abstürzte (San Francisco, Fußwege). Abtasten alle 1,2 m, Kanten durch Halbieren
    linienIn(linien, flaeche) {
      const idx = new FlaechenIndex(polys(ausfuehren(CL.ClipType.ctUnion, flaeche, null), 0.01), 25), drin = (x, z) => idx.enthaelt(x, z) >= 0, out = [];
      for (const pfad of linien) {
        const pts = vonC(pfad); let akt = null;
        const schliesse = () => { if (akt && akt.length >= 2) out.push(zuC(akt)); akt = null; };
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 1.2));
          let war = drin(ax, az), tAlt = 0;
          if (war && !akt) akt = [[ax, az]];
          for (let k = 1; k <= n; k++) {
            const t = k / n, ist = drin(ax + (bx - ax) * t, az + (bz - az) * t);
            if (ist !== war) {
              let lo = tAlt, hi = t;
              for (let q = 0; q < 6; q++) { const m = (lo + hi) / 2; if (drin(ax + (bx - ax) * m, az + (bz - az) * m) === war) lo = m; else hi = m; }
              const K = [ax + (bx - ax) * hi, az + (bz - az) * hi];
              if (war) { akt.push(K); schliesse(); } else akt = [K];
              war = ist;
            }
            tAlt = t;
          }
          if (war && akt) akt.push([bx, bz]);
        }
        schliesse();
      }
      return out;
    },
    versatz(paths, d, { offen = false, rund = true, butt = false } = {}) {
      if (!paths.length) return [];
      const co = new CL.ClipperOffset(2, 20);
      co.AddPaths(paths, rund ? CL.JoinType.jtRound : CL.JoinType.jtMiter, offen ? (butt ? CL.EndType.etOpenButt : CL.EndType.etOpenRound) : CL.EndType.etClosedPolygon);
      const out = new CL.Paths(); co.Execute(out, d * S); return out;
    },
    flaeche: paths => paths.reduce((a, p) => a + CL.Clipper.Area(p), 0) / (S * S),
  };
  return H;
}

// ---------- Tabellen (wie tools/ort_bauen.py) ----------
const FAHR = { motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, residential: 7, living_street: 5.5, service: 4.5, busway: 7,
  motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 7, tertiary_link: 6 };
const RANG = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 2, busway: 3, living_street: 1, service: 0,
  motorway_link: 6, trunk_link: 5, primary_link: 4, secondary_link: 3, tertiary_link: 2 };
const KLASSE_HW = { motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary', minor: 'residential', service: 'service', busway: 'busway' };
const LADEN = new Set(['shop', 'clothing_store', 'grocery', 'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream', 'bakery', 'butcher', 'alcohol_shop', 'books', 'jewelry',
  'mobile_phone', 'furniture', 'hairdresser', 'pharmacy', 'bank', 'laundry', 'florist', 'optician', 'shoes', 'electronics', 'gift', 'convenience', 'supermarket', 'deli', 'beer',
  'wine', 'music', 'toys', 'sports', 'beauty', 'cosmetics', 'chemist', 'department_store', 'mall', 'stationery', 'kiosk', 'hardware', 'doityourself', 'garden_centre', 'pet', 'bicycle', 'car', 'computer']);

// ---------- Hauptfunktion ----------
// kacheln: [{ z, x, y, schichten }] (kit/mvt.js), lat/lon: Mitte, halb: halbe Kantenlänge (Meter), reg: region(), land: landAn()
// hoehe(x, z): Gelände in Metern über der Mitte (0 ohne Gelände), seed: fester Zufall, stand: Kartenstand
// Häuserzeilen für Blöcke ohne kartierte Häuser. Ergebnis wie gebaeude (ohne typ): { p, h, m, teil, rand, b, id, gefuellt, A, nz }
const LINIE_BREITE = { motorway: 12, trunk: 10, primary: 8, secondary: 7, tertiary: 6, minor: 4.5, service: 3, path: 1.5, track: 2.5, rail: 3, transit: 3 };
export function lueckenFuellen({ C, bloeckeP, frei, gebaeude, nutzIdx, nutzungen, reg, im, GX, GZ, linien = [] }) {
  const out = [], bloecke = C.polys(C.baum(C.ohne(bloeckeP, frei)), 60);
  const hausIdx = new FlaechenIndex(gebaeude.map(g => [g.p]), 20), belegt = [], belegtIdx = new Map(), BZ = 16;
  const belegtAn = (x, z) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of belegtIdx.get(ZK(Math.floor(x / BZ) + a, Math.floor(z / BZ) + b)) || []) if (innenRing(q, x, z)) return true; return false; };
  const merke = q => { let cx = 0, cz = 0; for (const [x, z] of q) { cx += x; cz += z; } cx /= q.length; cz /= q.length; const k = ZK(Math.floor(cx / BZ), Math.floor(cz / BZ)); (belegtIdx.get(k) || belegtIdx.set(k, []).get(k)).push(q); };
  // nur wo im Umkreis von 250 m kaum Häuser kartiert sind (in Berlin standen sonst Häuser auf Brücken und Plätzen ohne Straßenfläche)
  const dichte = new Map(), DZ = 125; for (const g of gebaeude) { const [x, z] = g.p[0]; const k = ZK(Math.floor(x / DZ), Math.floor(z / DZ)); dichte.set(k, (dichte.get(k) || 0) + 1); }
  const kartiertUm = (x, z) => { let n = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) n += dichte.get(ZK(Math.floor(x / DZ) + a, Math.floor(z / DZ) + b)) || 0; return n; };
  // keine Ecke näher als die halbe Breite plus 1 m an einer Straße, Bahn oder einem Weg (auch Brücken und Linien ohne Fläche)
  const linIdx = new StreckenIndex(20); for (const { l, w } of linien) for (let i = 1; i < l.length; i++) linIdx.add(l[i - 1], l[i], w);
  const abstand = (s, x, z) => { const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / l2)); return Math.hypot(s.a[0] + dx * t - x, s.a[1] + dz * t - z); };
  const anLinie = (x, z) => !!linIdx.naechste(x, z, 9, sg => abstand(sg, x, z) < sg.daten / 2 + 0.3);
  const gehweg = Math.max(0.8, reg.gehweg * 0.7), tiefeMax = Math.max(9, Math.min(16, Math.sqrt(reg.parzelle) * 0.9)), breite = Math.max(6, Math.min(13, reg.minB * 1.6));
  for (const P of bloecke) {
    const aussen = P[0], A = Math.abs(flaecheRing(aussen)), ni = nutzIdx.enthaelt(aussen[0][0], aussen[0][1]), nz = ni >= 0 ? nutzungen[ni].nz : null;
    if (A < 90 || A > (nz ? 120000 : 22000)) continue;   // große Flächen zwischen Landstraßen sind Felder, kein Ort
    if (kartiertUm(aussen[0][0], aussen[0][1]) > 12) continue;
    // schon bebaut? Fläche der kartierten Häuser im Block (Stichprobe auf einem 6 m Raster)
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of aussen) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    let innen = 0, haus = 0; const st = Math.max(6, Math.sqrt(A) / 12);
    for (let x = x0 + st / 2; x < x1; x += st) for (let z = z0 + st / 2; z < z1; z += st) if (innenPoly(P, x, z)) { innen++; if (hausIdx.enthaelt(x, z) >= 0) haus++; }
    if (!innen || haus / innen > 0.08) continue;
    const flaeche = flaecheRing(aussen), orient = flaeche > 0 ? 1 : -1;
    const ring = aussen, n = ring.length;
    // kleiner Block: ein Haus über die ganze Fläche (mit Abstand zur Straße)
    if (A < 260) {
      const ein = C.polys(C.baum(C.versatz([C.zuC(ring)], -gehweg)), 30)[0]; if (!ein) continue;
      const q = ein[0]; let cx = 0, cz = 0; for (const [x, z] of q) { cx += x; cz += z; } cx /= q.length; cz /= q.length; if (!im(cx, cz, 2) || q.some(([x, z]) => anLinie(x, z))) continue;
      const Rb = rng(hashXZ((cx + GX) * 0.5, (cz + GZ) * 0.5)), ft = fuellTyp(reg, Rb, Math.abs(flaecheRing(q)));
      out.push({ p: q.map(([x, z]) => [r2(x), r2(z)]), h: r2(ft.h), typ: ft.typ, variant: ft.variant, fern: ft.fern, m: 0, teil: false, rand: false, b: 'yes', id: (hashXZ(cx + GX, cz + GZ) % 1e9) * 64 + 63, gefuellt: true, A: Math.abs(flaecheRing(q)), nz: nz || 'wohnen' });
      continue;
    }
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < breite * 0.8) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz * orient, nzv = ux * orient;   // Normale ins Blockinnere
      const schnitte = [0, ...weltStellen([a, b], breite, 3, GX, GZ).filter(d => d > 3 && d < L - 3), L];
      for (let k = 1; k < schnitte.length; k++) {
        let s0 = schnitte[k - 1], s1 = schnitte[k]; if (s1 - s0 < 4.5) continue;
        const mx = a[0] + ux * (s0 + s1) / 2, mz = a[1] + uz * (s0 + s1) / 2, Rb = rng(hashXZ((mx + GX) * 0.5, (mz + GZ) * 0.5));
        if (Rb() < 0.08) continue;   // hier und da eine Lücke (Einfahrt, Hof)
        const tiefe = tiefeMax * (0.7 + Rb() * 0.3);
        s0 += 0.3; s1 -= 0.3;
        const q = [[a[0] + ux * s0 + nx * gehweg, a[1] + uz * s0 + nzv * gehweg], [a[0] + ux * s1 + nx * gehweg, a[1] + uz * s1 + nzv * gehweg],
          [a[0] + ux * s1 + nx * (gehweg + tiefe), a[1] + uz * s1 + nzv * (gehweg + tiefe)], [a[0] + ux * s0 + nx * (gehweg + tiefe), a[1] + uz * s0 + nzv * (gehweg + tiefe)]];
        const mitte = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], pruef = [...q, mitte, [(q[0][0] + q[1][0]) / 2 + nx * 0.5, (q[0][1] + q[1][1]) / 2 + nzv * 0.5]];
        if (!im(mitte[0], mitte[1], 2) || pruef.some(([x, z]) => !innenPoly(P, x, z) || anLinie(x, z) || hausIdx.enthaelt(x, z) >= 0 || belegtAn(x, z))) continue;
        merke(q);
        const ft = fuellTyp(reg, Rb, (s1 - s0) * tiefe);
        out.push({ p: q.map(([x, z]) => [r2(x), r2(z)]), h: r2(ft.h), typ: ft.typ, variant: ft.variant, fern: ft.fern, m: 0, teil: false, rand: false, b: 'yes', id: (hashXZ(mitte[0] + GX, mitte[1] + GZ) % 1e9) * 64 + 62, gefuellt: true, A: (s1 - s0) * tiefe, nz: nz || 'wohnen' });
      }
    }
  }
  return out;
}

export function baueOrt({ CL, kacheln, lat, lon, halb = 600, reg, land = {}, hoehe = null, seed = 7, stand = '', name = '', wald = null, hoeheAbs = null, lod2 = null, osm = null, osmTeile = null, ubahn = null }) {
  const C = clipperHelfer(CL), R = rng(seed * 7919 + 13), T0 = Date.now(), zeit = {};
  const mark = n => { zeit[n] = Date.now() - T0; globalThis.__ortMark?.(n, zeit[n]); };
  const phi = lat * Math.PI / 180;
  const K_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), K_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  const xy = (lo, la) => [(lo - lon) * K_LON, -(la - lat) * K_LAT];
  const H = halb, KERN = [C.zuC([[-H, -H], [H, -H], [H, H], [-H, H]])];
  const im = (x, z, m = 0) => Math.abs(x) < H - m && Math.abs(z) < H - m;
  const hoeheAn = hoehe || (() => 0);

  // 1. Merkmale aller Kacheln in Meter, jede Kachel auf ihr eigenes Rechteck geschnitten (die Kacheln haben einen Rand, der sich überlappt)
  const L = { building: [], transportation: [], water: [], waterway: [], landcover: [], landuse: [], poi: [], park: [], aeroway: [], place: [] };
  for (const k of kacheln) {
    const n = 2 ** k.z, lonVon = px => (k.x + px) / n * 360 - 180, latVon = py => Math.atan(Math.sinh(Math.PI * (1 - 2 * (k.y + py) / n))) * 180 / Math.PI;
    const [xa, za] = xy(lonVon(0), latVon(0)), [xb, zb] = xy(lonVon(1), latVon(1));
    const rect = [C.zuC([[xa, za], [xb, za], [xb, zb], [xa, zb]])], x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    if (x1 < -H - 80 || x0 > H + 80 || z1 < -H - 80 || z0 > H + 80) continue;
    for (const name of Object.keys(L)) {
      const s = k.schichten[name]; if (!s) continue; const ext = s.extent;
      for (const f of s.merkmale) {
        const g = f.g.map(ring => ring.map(([px, py]) => xy(lonVon(px / ext), latVon(py / ext))));
        if (f.typ === 1) { const [x, z] = g[0][0]; if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && im(x, z, -40)) L[name].push({ id: f.id, p: f.p, punkt: [x, z] }); }
        else if (f.typ === 2) { const teile = g.flatMap(l => linieImRechteck(l, x0, z0, x1, z1)); if (teile.length) L[name].push({ id: f.id, p: f.p, linien: teile }); }
        else if (f.typ === 3) {
          const ringe = g.filter(r => r.length >= 4); if (!ringe.length) continue;
          let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity; for (const r of ringe) for (const [x, z] of r) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (z < b0) b0 = z; if (z > b1) b1 = z; }
          if (a1 < -H - 80 || a0 > H + 80 || b1 < -H - 80 || b0 > H + 80) continue;   // weit außerhalb des Ortes
          if (a0 > x0 + 0.01 && a1 < x1 - 0.01 && b0 > z0 + 0.01 && b1 < z1 - 0.01) { L[name].push({ id: f.id, p: f.p, paths: ringe.map(C.zuC) }); continue; }   // ganz in der Kachel: Ringe wie geliefert (außen und Löcher gegenläufig)
          const paths = C.normal(ringe.map(C.zuC)); const cut = C.schneide(paths, rect);
          if (cut.length) L[name].push({ id: f.id, p: f.p, paths: cut });
        }
      }
    }
  }
  mark('lesen');

  // 2. Gebäude: Umrisse (ohne hide_3d, die Teile kommen extra), Parzellen
  const haeuser = [], fassaden = new StreckenIndex(12), nutzungen = [];
  for (const f of L.landuse) {
    const c = f.p.class, nz = c === 'residential' ? 'wohnen' : (c === 'commercial' || c === 'retail') ? 'handel' : (c === 'industrial' || c === 'railway' || c === 'garages' || c === 'quarry') ? 'industrie' : null;
    if (nz) for (const P of C.polys(C.baum(f.paths))) nutzungen.push({ P, nz });
  }
  const nutzIdx = new FlaechenIndex(nutzungen.map(n => n.P), 40);
  const poiLaden = L.poi.filter(f => LADEN.has(f.p.class) || LADEN.has(f.p.subclass) || /shop|store/.test(f.p.class || '')).map(f => f.punkt);
  const ladenIdx = new StreckenIndex(10); poiLaden.forEach(p => ladenIdx.add(p, p, null));
  const umrisse = []; let stadienDrin = null; const THREE_clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // Echte Gebäude (LoD2, Berlin, kit/lod2.js): wo Kacheln vorliegen, ersetzen sie die Umrisse der Karte
  const L2 = lod2 ? lod2InOrt(lod2, lat, lon, K_LAT, K_LON) : null;
  // Bekannte Gebäude aus OSM Teilen (kit/osmteile.js, Wunsch Nr. 83): in ihrem Umriss entfallen Katasterhäuser und Umrisse der Karte
  const OT = osmTeile ? teileInOrt(osmTeile, lat, lon, K_LAT, K_LON, (la, lo) => inWahrzeichen(la, lo)) : null;   // eigener Name: baueOrt hat innen eine Funktion teile()
  for (const f of L.building) {
    if (f.p.hide_3d) continue;
    let h = +f.p.render_height || 0; const m = +f.p.render_min_height || 0;
    const unb = hoeheUnbekannt(h, m); if (unb) h = 5;   // Höhe kommt unten aus der Dichte
    if (h - m < 0.5) continue;
    for (const P of C.polys(C.baum(f.paths), 6)) {
      const [x, z] = P[0][0]; if (!im(x, z, -30)) continue;
      let mx = 0, mz = 0; for (const q of P[0]) { mx += q[0]; mz += q[1]; } mx /= P[0].length; mz /= P[0].length;
      if (inWahrzeichen(lat - mz / K_LAT, lon + mx / K_LON)) continue;   // dort steht das Wahrzeichen selbst (kit/wahrzeichen.js)
      if (L2 && L2.abgedeckt(mx, mz)) continue;   // hier stehen die echten Häuser
      if (OT && OT.drin(mx, mz)) continue;
      umrisse.push({ P, h, m, farbe: f.p.colour, id: hausKennung(lat - mz / K_LAT, lon + mx / K_LON), unb });
      for (const ring of P) for (let i = 0; i < ring.length; i++) fassaden.add(ring[i], ring[(i + 1) % ring.length], null);
    }
  }
  if (L2) for (const g of L2.haeuser) {
    for (const P of C.polys(C.baum(g.ringe.map(C.zuC)), 6)) {
      const [x, z] = P[0][0]; if (!im(x, z, -30)) continue;
      let mx = 0, mz = 0; for (const q of P[0]) { mx += q[0]; mz += q[1]; } mx /= P[0].length; mz /= P[0].length;
      if (inWahrzeichen(lat - mz / K_LAT, lon + mx / K_LON)) continue;
      if (OT && OT.drin(mx, mz)) continue;   // hier steht ein bekanntes Gebäude aus OSM Teilen
      const a = lod2Art(g.fn), A = Math.abs(flaecheRing(P[0]));
      let art = a.art || null;
      // Kirchen: Turmdach, Kegel oder Zelt auf einem schlanken Teil ist der Turm, kleine Teile sind Anbauten
      if (art === 'gotteshaus') art = (['4000', '3600', '3500'].includes(g.dach) && g.h >= 15) || (g.h >= 25 && g.h / Math.sqrt(A) > 2.2) ? 'turm' : A < 70 ? 'gotteshaus_teil' : 'gotteshaus';
      const hoch = OT && !/gotteshaus|turm/.test(art || '') ? OT.hochBei(mx, mz) : null;   // Hochhaus mit Vorbild oder OSM Material (Nr. 85)
      umrisse.push({ P, h: lod2Hoehe(g.h, g.traufe, g.dach), m: 0, id: hausKennung(lat - mz / K_LAT, lon + mx / K_LON), unb: false, art, nutz: a.nutz, laden: a.laden, lod2: { dach: g.dach, traufe: g.traufe, first: g.h, dachFl: g.dachFl }, hoch });
      for (const ring of P) for (let i = 0; i < ring.length; i++) fassaden.add(ring[i], ring[(i + 1) % ring.length], null);
    }
  }
  // OSM Teile der bekannten Gebäude: je Teil ein Umriss mit Höhe, Mindesthöhe und Dachform (gebaut in kit/osmteile_bau.js)
  if (OT) for (const G of OT.gebaeude) { const hMax = Math.max(...G.teile.map(t => t.h)), boden = G.teile.filter(t => t.m < 1), haupt = boden.length ? boden.reduce((x, y) => (x.ringe[0].length * 0 + flaecheRing(x.ringe[0]) >= flaecheRing(y.ringe[0]) ? x : y)) : null; for (const t of G.teile) {
    for (const P of C.polys(C.baum(t.ringe.map(C.zuC)), 1)) {
      const [x, z] = P[0][0]; if (!im(x, z, -30)) continue;
      let mx = 0, mz = 0; for (const q of P[0]) { mx += q[0]; mz += q[1]; } mx /= P[0].length; mz /= P[0].length;
      umrisse.push({ P, h: t.h, m: t.m, id: hausKennung(lat - mz / K_LAT, lon + mx / K_LON), unb: false, art: null, osm: { f: t.f, rh: t.rh ?? null, ri: t.ri ?? null, fa: t.fa || null, fd: t.fd || null, ma: t.ma || null, md: t.md || null, nd: t.nd || 0, kirche: G.kirche ? 1 : 0, nm: G.name.slice(0, 40), oben: t.h >= hMax - 0.01 ? 1 : 0, haupt: t === haupt ? 1 : 0, ...(t.russ ? { russ: 1 } : {}) } });
      for (const ring of P) for (let i = 0; i < ring.length; i++) fassaden.add(ring[i], ring[(i + 1) % ring.length], null);
    }
  } }
  // Häuser ohne Höhenangabe: Höhe aus der Dichte der Umgebung, je Haus fest (kit/regionen.js, an der Welt verankert: gleich in jedem Ort)
  {
    const dr = new DichteRaster(lon * K_LON, -lat * K_LAT);
    for (const u of umrisse) { const r = u.P[0]; let cx = 0, cz = 0; for (const q of r) { cx += q[0]; cz += q[1]; } u.cx = cx / r.length; u.cz = cz / r.length; u.A0 = Math.abs(flaecheRing(r)); dr.add(u.cx, u.cz, u.A0); }
    const deckel = ortsDeckel(L.place.map(f => f.p));
    // Stadtkern: Großstadt und dicht bebaut. Dort werden kleine, niedrige Bauten nie zu Einfamilien oder Fachwerkhäusern (07.11.2026, am Potsdamer Platz stand ein Fachwerkhaus zwischen den Glastürmen)
    // Zweites Merkmal: mittlere Höhe der Nachbarn mit bekannter Höhe (am Potsdamer Platz ist die Dichte wegen der großen Plätze gering, die Nachbarn sind aber Türme)
    const hA = new DichteRaster(lon * K_LON, -lat * K_LAT), hN = new DichteRaster(lon * K_LON, -lat * K_LAT);
    for (const u of umrisse) if (!u.unb) { hA.add(u.cx, u.cz, u.A0 * Math.max(0, u.h - u.m)); hN.add(u.cx, u.cz, u.A0); }
    for (const u of umrisse) { const n = hN.bei(u.cx, u.cz), mittel = n > 0 ? hA.bei(u.cx, u.cz) / n : 0; u.zentrum = deckel >= 999 && (dr.bei(u.cx, u.cz) >= 0.25 || mittel >= 14); }
    for (const u of umrisse) if (u.unb) u.h = Math.min(deckel * (0.72 + 0.28 * rng(((u.id ?? 0) % 2147483647) + 17)()), hoeheSchaetzen(dr.bei(u.cx, u.cz), reg, rng(((u.id ?? 0) % 2147483647) + 11)(), u.A0));
  }
  // Stadien (06.11.2026): Umrisse auf einer Stadionfläche oder Ringe um ein Spielfeld werden nicht zu Häusern, sondern zur Schüssel (kit/stadion.js). Größe und Richtung: kleinstes Rechteck um alle Teile
  const stadien = [];
  {
    const ringFl = r => Math.abs(flaecheRing(r)), inR = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const flaechen = L.landuse.filter(f => f.p.class === 'stadium' && f.paths).flatMap(f => C.polys(C.baum(C.vereinige(f.paths)), 6000));
    const felder = L.landuse.filter(f => f.p.class === 'pitch' && f.paths).flatMap(f => C.polys(C.baum(C.vereinige(f.paths)), 3500)).map(P => { let x = 0, z = 0; for (const q of P[0]) { x += q[0]; z += q[1]; } return [x / P[0].length, z / P[0].length]; });
    const gruppen = [];
    for (const P of flaechen) { const teile = umrisse.filter(u => u.A0 >= 450 && inR(P[0], u.cx, u.cz)); if (teile.reduce((a, u) => a + u.A0, 0) >= 3500) gruppen.push(teile); }
    for (const u of umrisse) { if (u.A0 < 9000 || u.P.length < 2 || gruppen.some(g => g.includes(u))) continue; const loch = u.P.slice(1).find(r => ringFl(r) > 2800); if (loch && (felder.some(q => inR(loch, q[0], q[1])) || ringFl(loch) > 5000)) gruppen.push([u]); }
    // ein großer Ring ohne Loch um ein Spielfeld (Umriss als Ganzes kartiert)
    for (const q of felder) { if (gruppen.some(g => g.some(u => inR(u.P[0], q[0], q[1])))) continue; const u = umrisse.find(v => v.A0 > 12000 && inR(v.P[0], q[0], q[1])); if (u) gruppen.push([u]); }
    // aus vielen Teilen kartiert (Wembley): Umrisse schließen sich zu mindestens 280 Grad um ein Spielfeld
    for (const q of felder) { if (gruppen.some(g => g.some(u => inR(u.P[0], q[0], q[1])))) continue; const nah = umrisse.filter(u => u.A0 >= 250 && Math.hypot(u.cx - q[0], u.cz - q[1]) < 190 && Math.hypot(u.cx - q[0], u.cz - q[1]) > 45); const B = new Uint8Array(36); for (const u of nah) { let ok = true; for (const c of u.P[0]) { const d = Math.hypot(c[0] - q[0], c[1] - q[1]); if (d > 215 || d < 34) { ok = false; break; } } if (!ok) continue; for (const c of u.P[0]) { B[Math.floor((Math.atan2(c[1] - q[1], c[0] - q[0]) + Math.PI) / (Math.PI * 2) * 36) % 36] = 1; } const r = u.P[0]; for (let i = 1; i < r.length; i++) for (let k = 1; k < 4; k++) { const mx = r[i - 1][0] + (r[i][0] - r[i - 1][0]) * k / 4, mz = r[i - 1][1] + (r[i][1] - r[i - 1][1]) * k / 4; B[Math.floor((Math.atan2(mz - q[1], mx - q[0]) + Math.PI) / (Math.PI * 2) * 36) % 36] = 1; } } if (B.reduce((a, b) => a + b, 0) >= 28) { const teile = nah.filter(u => u.P[0].every(c => { const d = Math.hypot(c[0] - q[0], c[1] - q[1]); return d <= 215 && d >= 34; })); if (teile.length) gruppen.push(teile); } }
    for (const g of gruppen) {
      const pts = g.flatMap(u => u.P[0]); let best = null; for (let a = 0; a < 180; a += 4) { const ux = Math.cos(a * Math.PI / 180), uz = Math.sin(a * Math.PI / 180); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const q of pts) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; } const fl = (u1 - u0) * (v1 - v0); if (!best || fl < best.fl) best = { fl, ux, uz, u0, u1, v0, v1 }; }
      let L0 = best.u1 - best.u0, B0 = best.v1 - best.v0, ux = best.ux, uz = best.uz, um = (best.u0 + best.u1) / 2, vm = (best.v0 + best.v1) / 2; if (B0 > L0) { const t = L0; L0 = B0; B0 = t; const nu = -uz, nz = ux; ux = nu; uz = nz; }
      if (L0 < 110 || B0 < 70 || L0 > 360 || B0 > 280) continue;
      const x = best.ux * um - best.uz * vm, z = best.uz * um + best.ux * vm, hs = g.map(u => u.h).filter(Number.isFinite).sort((a, b) => a - b), hM = hs[hs.length >> 1] ?? 25, h = THREE_clamp(hM > 60 ? 42 : hM, 14, 52);
      const s = { x: r2(x), z: r2(z), ry: Math.round(Math.atan2(ux, uz) * 1000) / 1000, L: r2(L0), B: r2(B0), h: r2(h) };
      if (stadien.some(o => Math.hypot(o.x - s.x, o.z - s.z) < 60)) continue; stadien.push(s);
    }
    if (stadien.length) { const drin = (x, z) => stadien.some(s => { const ca = Math.cos(s.ry), sa = Math.sin(s.ry), dx = x - s.x, dz = z - s.z, a = (dx * sa + dz * ca) / (s.L / 2 + 2), b = (-dx * ca + dz * sa) / (s.B / 2 + 2); return Math.abs(a) ** 2.7 + Math.abs(b) ** 2.7 < 1; }); for (let i = umrisse.length - 1; i >= 0; i--) if (drin(umrisse[i].cx, umrisse[i].cz) || gruppen.some(g => g.includes(umrisse[i]))) umrisse.splice(i, 1); stadienDrin = drin; }
  }
  // Sonderbauten: Punkte der Karte im Grundriss (Kirche, Schule, Krankenhaus, Hotel, Museum, Bahnhof, Markt, Tankstelle, Parkhaus): das ganze Haus wird ein Modell, ohne Parzellen
  const SONDER = { place_of_worship: 'gotteshaus', school: 'schule', college: 'schule', hospital: 'krankenhaus', lodging: 'hotel', hotel: 'hotel', museum: 'museum', town_hall: 'museum', railway: 'bahnhof', grocery: 'markt', supermarket: 'markt', mall: 'markt', department_store: 'markt', fuel: 'tankstelle', parking: 'parkhaus' };   // Einkaufszentren und Kaufhäuser (Nr. 77, das ALEXA war eine Altbauzeile)
  if (umrisse.length) {
    const uIdx = new FlaechenIndex(umrisse.map(u => u.P), 40);
    for (const f of L.poi) {
      const art = SONDER[f.p.subclass] || SONDER[f.p.class]; if (!art || !f.punkt) continue;
      if (f.p.subclass === 'halt' || f.p.subclass === 'tram_stop' || f.p.subclass === 'subway' || f.p.subclass === 'bus_stop') continue;
      const i = uIdx.enthaelt(f.punkt[0], f.punkt[1]); if (i >= 0 && !umrisse[i].art && !umrisse[i].lod2 && !umrisse[i].osm) umrisse[i].art = art;
    }
    // Turm neben dem Gotteshaus: kleiner Umriss, der die Kirche berührt, gehört zu ihr. Turm nur, wenn er deutlich höher ist als die Kirche
    // (ein Viertel und mindestens 6 m), und an höchstens zwei Stellen je Kirche, die höchsten (07.11.2026, Nr. 77: die Passionskirche am
    // Marheinekeplatz hatte 9 Turmspitzen, weil jedes Dachteil in Kirchenhöhe als Turm galt)
    const kirchen = umrisse.filter(u => u.art === 'gotteshaus'); for (const k of kirchen) {
      const r = k.P[0]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of r) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } const Ak = Math.abs(flaecheRing(r));
      const tuerme = [];
      for (const u of umrisse) { if (u === k || u.art || u.lod2 || u.osm) continue; const ru = u.P[0], Au = Math.abs(flaecheRing(ru)); if (Au > Ak * 0.5 || Au > 500) continue; let beruehrt = false; for (const q of ru) if (q[0] > x0 - 1.5 && q[0] < x1 + 1.5 && q[1] > z0 - 1.5 && q[1] < z1 + 1.5) { beruehrt = true; break; } if (!beruehrt) continue; u.art = 'gotteshaus_teil'; if (Au < 300 && u.h >= Math.max(k.h * 1.25, k.h + 6)) tuerme.push(u); }
      // Teile an derselben Stelle (bis 8 m) sind ein Turm aus gestapelten Teilen (Marienkirche: 3 Teile mit 50, 65 und 90 m)
      const mitte = u => { let x = 0, z = 0; for (const q of u.P[0]) { x += q[0]; z += q[1]; } return [x / u.P[0].length, z / u.P[0].length]; }, orte = [];
      tuerme.sort((a, b) => b.h - a.h);
      for (const u of tuerme) { const c = mitte(u); if (orte.some(o => Math.hypot(o[0] - c[0], o[1] - c[1]) < 8)) u.art = 'turm'; else if (orte.length < 2) { orte.push(c); u.art = 'turm'; } }
      globalThis.__ortDebug?.('kirche', { k, tuerme });
    }
  }
  // Fein kartiert (07.11.2026, Wunsch Nr. 77): wo ringsum viele einzelne Häuser kartiert sind (Berlin, fast ganz Europa), ist ein großer Umriss ohne Hof
  // ein großes Gebäude (Einkaufszentrum, Plattenbau, Bürohaus) und wird nicht mehr in kleine Parzellen mit eigenen Fassaden zerlegt.
  { const Z = 120, zellen = new Map(), k = (x, z) => `${Math.floor(x / Z)},${Math.floor(z / Z)}`; for (const u of umrisse) { const key = k(u.cx, u.cz); zellen.set(key, (zellen.get(key) || 0) + 1); }
    for (const u of umrisse) { let n = 0; const ix = Math.floor(u.cx / Z), iz = Math.floor(u.cz / Z); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += zellen.get(`${ix + a},${iz + b}`) || 0; u.fein = n >= 40 && u.P.length === 1; } }
  // Parzellenteilung: Schnitt quer zur langen Achse, durch Höfe, bis Fläche und Frontlänge passen
  const ziel = reg.parzelle, minB = reg.minB, maxFront = Math.sqrt(ziel) * 1.5;
  function teile(P, Rr, tiefe, out) {
    const A = Math.abs(flaecheRing(P[0])) - P.slice(1).reduce((a, h) => a + Math.abs(flaecheRing(h)), 0);
    if (A < 10) return;
    const mr = minRechteck(P[0]); if (!mr) return;
    const hof = P.length > 1;
    if (tiefe >= 10 || (!hof && ((A <= ziel * 1.6 && mr.L <= maxFront) || mr.L < 2 * minB))) { out.push(P[0]); return; }
    let s;   // Schnittposition entlang der langen Achse
    if (hof) { const h = P[1]; let cx = 0, cz = 0; for (const q of h) { cx += q[0]; cz += q[1]; } cx /= h.length; cz /= h.length; s = cx * mr.ux + cz * mr.uz; }
    else s = (mr.u0 + mr.u1) / 2 + (Rr() - 0.5) * 0.24 * mr.L;
    const vx = -mr.uz, vz = mr.ux, W = 1e4;
    const ebene = (u0, u1) => [C.zuC([[mr.ux * u0 + vx * -W, mr.uz * u0 + vz * -W], [mr.ux * u1 + vx * -W, mr.uz * u1 + vz * -W], [mr.ux * u1 + vx * W, mr.uz * u1 + vz * W], [mr.ux * u0 + vx * W, mr.uz * u0 + vz * W]])];
    const subj = C.polysZuC([P]), teileA = C.polys(C.schneideBaum(subj, ebene(-W, s)), 2), teileB = C.polys(C.schneideBaum(subj, ebene(s, W)), 2);
    if (!teileA.length || !teileB.length) { out.push(P[0]); return; }
    for (const Q of teileA.concat(teileB)) teile(Q, Rr, tiefe + 1, out);
  }
  // Echte Häuser (Kataster) werden nicht in Parzellen geteilt, nur Höfe werden durchschnitten (ein Haus ist hier ein Ring ohne Loch)
  function ohneLoch(P, out, tiefe = 0) {
    if (P.length === 1 || tiefe >= 6) { out.push(P[0]); return; }
    const mr = minRechteck(P[0]); if (!mr) { out.push(P[0]); return; }
    const h = P[1]; let cx = 0, cz = 0; for (const q of h) { cx += q[0]; cz += q[1]; } cx /= h.length; cz /= h.length;
    const s = cx * mr.ux + cz * mr.uz, vx = -mr.uz, vz = mr.ux, W = 1e4;
    const ebene = (u0, u1) => [C.zuC([[mr.ux * u0 + vx * -W, mr.uz * u0 + vz * -W], [mr.ux * u1 + vx * -W, mr.uz * u1 + vz * -W], [mr.ux * u1 + vx * W, mr.uz * u1 + vz * W], [mr.ux * u0 + vx * W, mr.uz * u0 + vz * W]])];
    const subj = C.polysZuC([P]), A = C.polys(C.schneideBaum(subj, ebene(-W, s)), 2), B = C.polys(C.schneideBaum(subj, ebene(s, W)), 2);
    if (!A.length || !B.length) { out.push(P[0]); return; }
    for (const Q of A.concat(B)) ohneLoch(Q, out, tiefe + 1);
  }
  for (const u of umrisse) {
    const lots = [], Rr = rng((u.id || 1) % 2147483647);
    if (u.lod2 || u.osm) ohneLoch(u.P, lots); else if (u.art || u.fein) lots.push(u.P[0]); else teile(u.P, Rr, 0, lots);
    lots.forEach((ring, k) => {
      const p = saeubern(ring.map(([x, z]) => [r2(x), r2(z)])); if (p.length < 3) return;
      const A = Math.abs(flaecheRing(p)); if (A < (u.osm ? 0.5 : 8)) return;   // OSM Teile dürfen klein sein (Säulen, Turmspitzen)
      let cx = 0, cz = 0; for (const q of p) { cx += q[0]; cz += q[1]; } cx /= p.length; cz /= p.length;
      if (!im(cx, cz, 2)) return;
      const lod2 = u.lod2 ? { ...u.lod2, dachFl: lots.length === 1 && u.P.length === 1 ? u.lod2.dachFl : lod2DachZuschneiden(C, u.lod2.dachFl, p) } : undefined;   // Dach je Teilstück (Hof geteilt)
      haeuser.push({ p, h: r2(u.h), m: r2(u.m), cx, cz, A, farbe: u.farbe, art: u.art, zentrum: u.zentrum, id: ((u.id || 0) % 1e9) * 64 + (k % 64), nutz: u.nutz, laden: u.laden, lod2, osm: u.osm, hoch: u.hoch });
    });
  }
  // Häuser in Häusern (05.11.2026, Nader: "manchmal sind gebäude dort komisch platziert"): in der Karte liegen oft ein niedriger Umriss und ein hoher Baukörper auf derselben Stelle. Beide gebaut
  // flackerten die Wände, und aus dem hohen Block ragte ein Giebeldach. Wer zu mehr als der Hälfte in einem höheren Haus steckt, entfällt; Reihenfolge: niedrig zuerst, bei gleicher Höhe das kleinere
  {
    const Z = 24, g = new Map(), key = (a, b) => a * 100003 + b;
    haeuser.forEach((a, i) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of a.p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < z0) z0 = q[1]; if (q[1] > z1) z1 = q[1]; } a._box = [x0, x1, z0, z1]; a._i = i; for (let x = Math.floor(x0 / Z); x <= Math.floor(x1 / Z); x++) for (let z = Math.floor(z0 / Z); z <= Math.floor(z1 / Z); z++) { const k = key(x, z); (g.get(k) || g.set(k, []).get(k)).push(a); } });
    const raus = new Set();
    for (const a of [...haeuser].sort((u, v) => u.h - v.h || u.A - v.A)) {
      if (a.osm) continue;   // OSM Teile sind gestapelt und gewollt (Kuppel über dem Baukörper)
      const [x0, x1, z0, z1] = a._box; let n = 0, drin = 0;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
        const x = x0 + (x1 - x0) * (i + 0.5) / 6, z = z0 + (z1 - z0) * (j + 0.5) / 6; if (!innenPoly([a.p], x, z)) continue; n++;
        for (const b of g.get(key(Math.floor(x / Z), Math.floor(z / Z))) || []) { if (b === a || raus.has(b)) continue; if (b.h < a.h - 0.01 || (b.h - a.h < 0.01 && b.A <= a.A && b._i <= a._i && b.A === a.A)) continue; if (b.h - a.h < 0.01 && b.A < a.A) continue; if ((b.m || 0) > (a.m || 0) + 1.5) continue; const bx = b._box; if (x < bx[0] || x > bx[1] || z < bx[2] || z > bx[3]) continue; if (innenPoly([b.p], x, z)) { drin++; break; } }
      }
      if (n && drin / n > 0.5) raus.add(a);
    }
    if (raus.size) { const bleib = haeuser.filter(a => !raus.has(a)); haeuser.length = 0; haeuser.push(...bleib); }
    zeit.ueberdeckt = raus.size;
  }
  mark('parzellen');

  // 3. Straßen: Breite nach Klasse und Region, begrenzt durch die Fassaden auf beiden Seiten
  const wege = [], strassenLinien = [];
  for (const f of L.transportation) {
    if (!f.linien) continue;
    const c = f.p.class, tunnel = f.p.brunnel === 'tunnel';
    if (c === 'path' || c === 'track') { if (!tunnel && !(f.p.level > 0 || f.p.indoor)) wege.push(f); continue; }
    const hw0 = KLASSE_HW[c]; if (!hw0) continue;
    const hw = f.p.ramp && FAHR[hw0 + '_link'] ? hw0 + '_link' : hw0;
    strassenLinien.push({ f, hw, tunnel, einbahn: f.p.oneway === 1 || f.p.oneway === -1, rueck: f.p.oneway === -1, privat: f.p.access === 'private' || f.p.access === 'no', service: f.p.service });
  }
  const minW = { motorway: 7, trunk: 6.5, primary: 6, secondary: 5.5, tertiary: 4.5, residential: 3.2, busway: 3.2, service: 2.6, living_street: 3 };
  // Echte Verkehrsdaten (OSM, Berlin, kit/osmverkehr.js): Spurzahl je Richtung, Abbiegespuren, Tempo, Ampeln
  const OSM = osm ? osmInOrt(osm, lat, lon, K_LAT, K_LON) : null;
  if (OSM) osmZuordnen(OSM, strassenLinien, punktBei, laenge);
  for (const s of strassenLinien) {
    let w0 = (s.hw === 'residential' ? reg.neben : s.hw === 'service' ? ({ driveway: 3.5, parking_aisle: 15.5 }[s.service] || 4.5) : FAHR[s.hw]) * (s.hw === 'residential' ? 1 : reg.f);
    if (s.einbahn && /motorway|trunk/.test(s.hw)) w0 *= 0.55;   // Richtungsfahrbahn
    if (s.osm?.vor) {   // echte Spurzahl: Einbahn (oft eine Hälfte einer zweibahnigen Straße) so breit wie ihre Spuren, Gegenverkehr mindestens so breit wie die Spuren
      const lwK = /primary|secondary|trunk|motorway/.test(s.hw) ? 3.25 : 3.0, n = s.osm.spurenEcht || s.osm.vor + (s.einbahn ? 0 : s.osm.zur || 0);   // echte Spurbreiten (3,4 m war im Test schlechter, 07.11.2026)
      w0 = s.einbahn ? n * lwK + (/residential|tertiary|unclassified|living_street/.test(s.hw) ? 2.3 : 0) : Math.max(w0, n * lwK);
    }
    const proben = [];
    for (const l of s.f.linien) {
      const Lg = laenge(l); for (let d = 4; d < Lg - 2; d += 9) {
        const q = punktBei(l, d); if (!q) continue; const nx = -q.dz, nz = q.dx;
        const a = fassaden.strahl(q.x, q.z, nx, nz, 35), b = fassaden.strahl(q.x, q.z, -nx, -nz, 35);
        if (a < 0.6 || b < 0.6) continue;   // Durchfahrt unter einem Haus
        proben.push(Math.min(a, 35) + Math.min(b, 35) - 2 * reg.gehweg);
      }
    }
    proben.sort((a, b) => a - b);
    const frei = proben.length ? proben[Math.floor(proben.length * 0.2)] : Infinity;
    s.w = Math.max(minW[s.hw] || 3, Math.min(w0, frei));
  }
  mark('strassenBreite');
  // Straßentunnel (Wunsch Nr. 98, kit/tunnelbau.js): Röhren und offene Tröge vor den Portalen. Tröge gelten danach wie Tunnel (keine Fahrbahn am Boden)
  const tunnelStuecke = tunnelSammeln(strassenLinien, { halb: H });
  // Parkdecks und Garagen (07.11.2026, Wunsch Nr. 77, Nader: "hier zum Beispiel sind Gebäude genau auf der Kreuzung"): Zufahrten und Parkplatzgassen auf
  // höheren Ebenen (layer ab 1, nicht als Brücke) oder großteils in einem Haus sind keine Fahrbahn am Boden. Vorher lagen sie bis 15,5 m breit als Asphalt
  // unter Parkhäusern und Einkaufszentren (Berlin: Warschauer Straße, Gesundbrunnen, Südkreuz; Prüfstand tools/berlin_pruefen.mjs)
  const hausRoh = new FlaechenIndex(haeuser.map(hs => [hs.p]), 20);
  for (const s of strassenLinien) {
    if (s.tunnel || s.hw !== 'service') continue;
    if ((+s.f.p.layer || 0) >= 1 && s.f.p.brunnel !== 'bridge') { s.oben = true; continue; }
    let n = 0, drin = 0; for (const l of s.f.linien) { const Lg = laenge(l); for (let d = 1; d < Lg; d += 3) { const q = punktBei(l, d); if (!q) continue; n++; if (hausRoh.enthaelt(q.x, q.z) >= 0) drin++; } }
    if (n && drin / n >= 0.35) s.oben = true;
  }
  globalThis.__ortDebug?.('strassenLinien', strassenLinien);   // Prüfstände (tools/stelle_pruefen.mjs) sehen die Linien mit ihrer Breite
  // Brücken über Wasser (06.11.2026): sie liegen nicht mehr als flache Straße auf dem Gelände (über Flüssen also unter dem Wasser), sondern kommen als Bauwerk (kit/bruecke.js). Maßgeblich: die Linie ist brunnel=bridge und ein gutes Stück davon liegt über Wasser
  const wasserRoh = (() => { let w = C.vereinige(L.water.filter(f => f.p.class !== 'swimming_pool').flatMap(f => f.paths)); const fl0 = L.waterway.filter(f => f.p.brunnel !== 'tunnel' && f.linien).flatMap(f => C.versatz(f.linien.map(C.zuC), ({ river: 14, canal: 9, stream: 2.5, drain: 1.5, ditch: 1.2 }[f.p.class] || 2) / 2, { offen: true })); if (fl0.length) w = C.vereinige(w.concat(fl0)); return C.polys(C.baum(w), 0.5); })();
  const inRing0 = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const imWasserRoh = (x, z) => wasserRoh.some(([a, ...h]) => inRing0(a, x, z) && !h.some(r => inRing0(r, x, z)));
  const ueberWasser = l => { const Lg = laenge(l); if (Lg < 12) return false; let n = 0, w = 0; for (let d = Lg * 0.08; d < Lg; d += Math.max(4, Lg / 26)) { const q = punktBei(l, d); if (!q) continue; n++; if (imWasserRoh(q.x, q.z)) w++; } return n > 0 && w / n >= 0.2; };
  const brueckenRoh = [], brueckeLinie = new Set();
  for (const s of strassenLinien) { if (s.tunnel || s.f.p.brunnel !== 'bridge') continue; for (const l of s.f.linien) if (ueberWasser(l)) { brueckeLinie.add(l); brueckenRoh.push({ p: l, w: s.w, hw: s.hw }); } }
  for (const f of wege) { if (f.p.brunnel !== 'bridge') continue; const bleibt = []; for (const l of f.linien) { if (ueberWasser(l)) brueckenRoh.push({ p: l, w: f.p.subclass === 'cycleway' ? 3.6 : 4.6, hw: 'fuss' }); else bleibt.push(l); } f.linien = bleibt; }
  // Brücken über Straßen, Gleise und Wege (Wunsch Nr. 95, kit/brueckenbau.js): Bauwerk mit Rampen auf den Zufahrten, darunter frei. Brücke und Rampen haben
  // keine Fahrbahn am Boden, die Linien bleiben im Verkehrsnetz
  const ueberVerkehr = brueckenSammeln(strassenLinien,
    L.transportation.filter(f => f.linien && (f.p.class === 'rail' || f.p.class === 'transit') && f.p.brunnel !== 'tunnel' && f.p.brunnel !== 'bridge' && !/disused|abandoned|razed/.test(f.p.subclass || '')).flatMap(f => f.linien.map(l => ({ l, art: f.p.subclass === 'tram' ? 'strasse' : 'bahn' }))),
    wege.filter(f => f.p.brunnel !== 'bridge' && f.linien).flatMap(f => f.linien), { bekannt: brueckeLinie, halb: H });
  for (const b of ueberVerkehr) for (const l of b.glieder) brueckeLinie.add(l);
  const nachBreite = new Map(), nachBreiteS = new Map();
  for (const s of strassenLinien) {
    if (s.tunnel || s.oben) continue;
    const M = s.hw === 'service' ? nachBreiteS : nachBreite, k = Math.round(s.w * 4) / 4; for (const l of s.f.linien) if (!brueckeLinie.has(l)) (M.get(k) || M.set(k, []).get(k)).push(C.zuC(l));
  }
  let strasse = [], strasseS = [];
  for (const [w, ls] of nachBreite) strasse = strasse.concat(C.versatz(ls, w / 2, { offen: true }));
  for (const [w, ls] of nachBreiteS) strasseS = strasseS.concat(C.versatz(ls, w / 2, { offen: true }));
  mark('strassenVersatz');
  strasse = C.vereinige(strasse);
  mark('strassenVereinigt');
  strasse = C.versatz(C.versatz(strasse, 3, { rund: false }), -3);   // Ecken schließen, Bordsteinradius rund 3 m (Aufweiten mit Gehrung: keine Bögen an den vielen konvexen Ecken, die Rundung der Bordsteinecken entsteht beim Schrumpfen)
  if (strasseS.length) strasse = C.vereinige(strasse.concat(C.ohne(C.vereinige(strasseS), C.vereinige(haeuser.map(hs => C.zuC(hs.p))))));
  // Echte Häuser (LoD2) stehen, wo sie stehen: die geschätzte Fahrbahn endet an ihren Wänden, statt das Haus wegzulassen
  if (L2 || OT) { const echt = haeuser.filter(hs => hs.lod2 || hs.osm).map(hs => C.zuC(hs.p)); if (echt.length) strasse = C.ohne(strasse, C.vereinige(echt)); }   // Zufahrten und Parkplatzgassen enden an der Hauswand (Wunsch Nr. 77)
  strasse = C.schneide(strasse, KERN);
  // Tröge (Nr. 98) sind eine Öffnung im Boden: keine Fahrbahn, kein Gehweg und kein Grün darüber, auch nicht von parallelen Straßen, deren geschätzte
  // Fläche den Trog überdeckt (Alexanderplatz, Prüfstand tools/trog_pruefen.mjs)
  const trogFl = (() => { const tr = tunnelStuecke.filter(t => t.offen && t.p.length > 1); return tr.length ? C.vereinige(tr.flatMap(t => C.versatz([C.zuC(t.p)], Math.max(2.6, (t.w || 6) / 2 + 0.6), { offen: true, butt: true }))) : []; })();
  if (trogFl.length) strasse = C.ohne(strasse, trogFl);
  mark('strassen');

  // 4. Wasser, Blöcke, Plätze, Grün
  let wasser = C.vereinige(L.water.filter(f => f.p.class !== 'swimming_pool').flatMap(f => f.paths));
  const flussB = { river: 14, canal: 9, stream: 2.5, drain: 1.5, ditch: 1.2 };
  const fl = L.waterway.filter(f => f.p.brunnel !== 'tunnel' && f.linien).flatMap(f => C.versatz(f.linien.map(C.zuC), (flussB[f.p.class] || 2) / 2, { offen: true }));
  if (fl.length) wasser = C.vereinige(wasser.concat(fl));
  wasser = C.schneide(wasser, KERN);
  // U-Bahn Eingänge (Nr. 94, kit/ubahnbau.js): an der echten Stelle auf dem Gehweg, die offene Treppe ist ein Loch im Boden
  let ubahnE = { liste: [], zahl: null };
  if (ubahn) {
    const strIdx0 = new FlaechenIndex(C.polys(C.baum(strasse)), 25), wasIdx0 = new FlaechenIndex(C.polys(C.baum(wasser)), 40), trogIdx0 = trogFl.length ? new FlaechenIndex(C.polys(C.baum(trogFl)), 20) : null, gl0 = new StreckenIndex(20);
    for (const f of L.transportation) if (f.linien && (f.p.class === 'rail' || f.p.class === 'transit') && f.p.brunnel !== 'tunnel') for (const l of f.linien) for (let i = 1; i < l.length; i++) gl0.add(l[i - 1], l[i], null);
    ubahnE = eingaengeImOrt(ubahn, { lat, lon, K_LAT, K_LON, halb: H, istFrei: (x, z) => strIdx0.enthaelt(x, z) < 0 && hausRoh.enthaelt(x, z) < 0 && wasIdx0.enthaelt(x, z) < 0 && (!trogIdx0 || trogIdx0.enthaelt(x, z) < 0) && !gl0.naechste(x, z, 3.2) });
  }
  const ubahnFl = ubahnE.liste.length ? C.vereinige(ubahnE.liste.map(e => C.zuC(e.poly))) : [];
  const bloeckeP = C.ohne(C.ohne(KERN, strasse), trogFl.length || ubahnFl.length ? C.vereinige(wasser.concat(trogFl, ubahnFl)) : wasser);
  const platzP = C.schneide(C.vereinige(L.transportation.filter(f => f.paths && f.p.class === 'path' && /pedestrian|footway/.test(f.p.subclass || '')).flatMap(f => f.paths)), bloeckeP);
  const gruenRoh = C.vereinige([
    ...L.landcover.filter(f => /grass|wood|wetland|farmland/.test(f.p.class || '') && f.paths).flatMap(f => f.paths),
    ...L.landuse.filter(f => /playground|pitch|cemetery|grave_yard|park/.test(f.p.class || '') && f.paths).flatMap(f => f.paths),
    ...L.aeroway.filter(f => f.p.class === 'aerodrome' && f.paths).flatMap(f => f.paths)]);
  const gruenP = C.ohne(C.schneide(gruenRoh, bloeckeP), platzP);
  const waldP = C.schneide(C.vereinige(L.landcover.filter(f => f.p.class === 'wood' && f.paths).flatMap(f => f.paths)), bloeckeP);
  // Sand (Strände, Dünen, seit 29.10.2026): eigene Fläche statt Gehweg, ohne Plätze und Grün
  const sandP = C.ohne(C.ohne(C.schneide(C.vereinige(L.landcover.filter(f => f.p.class === 'sand' && f.paths).flatMap(f => f.paths)), bloeckeP), platzP), gruenP);
  const fussLinien = wege.filter(f => !/steps|platform|corridor/.test(f.p.subclass || '') || f.p.subclass === 'steps');
  const pfadP = C.schneide(C.vereinige(C.versatz(fussLinien.filter(f => f.p.subclass !== 'cycleway').flatMap(f => f.linien.map(C.zuC)), 1.2, { offen: true })), gruenP);
  const radP = C.ohne(C.schneide(C.vereinige(C.versatz(wege.filter(f => f.p.subclass === 'cycleway').flatMap(f => f.linien.map(C.zuC)), 0.9, { offen: true, butt: true })), bloeckeP), platzP);
  mark('flaechen');

  // Häuser auf der Fahrbahn oder im Wasser (Breiten geschätzt) weglassen
  const strasseIdx = new FlaechenIndex(C.polys(C.baum(strasse)), 25), wasserIdx = new FlaechenIndex(C.polys(C.baum(wasser)), 40);
  const gebaeude = [];
  // Hinterhäuser (echte Häuser ohne Straßenfront: keine Ecke näher als 20 m an einer Straße) baut der Ort in der leichten Fassung (kit/ort.js),
  // man sieht sie von der Straße kaum, und mit den Daten des Katasters gibt es in Altbauvierteln dreimal so viele Häuser (Seitenflügel, Quergebäude)
  const strLinIdx = L2 ? new StreckenIndex(20) : null;
  if (strLinIdx) for (const s of strassenLinien) { if (s.tunnel || s.oben || s.hw === 'service') continue; for (const l of s.f.linien) for (let i = 1; i < l.length; i++) strLinIdx.add(l[i - 1], l[i], null); }
  for (const hs of haeuser) {
    if ((!hs.lod2 && !hs.osm && strasseIdx.enthaelt(hs.cx, hs.cz) >= 0) || wasserIdx.enthaelt(hs.cx, hs.cz) >= 0) continue;
    const ni = nutzIdx.enthaelt(hs.cx, hs.cz), nutzung = hs.nutz || (ni >= 0 ? nutzungen[ni].nz : null);
    let laden = !!hs.laden; if (!laden && hs.m < 1) { const q = ladenIdx.naechste(hs.cx, hs.cz, Math.sqrt(hs.A) * 0.7 + 4); laden = !!q; }
    const Rh = rng((hs.id % 2147483647) + 7), t = gebaeudeTyp({ h: hs.h - hs.m, flaeche: hs.A, nutzung, laden, farbe: hs.farbe, art: hs.art, zentrum: hs.zentrum, teil: hs.m > 0 }, Rh, reg);
    const e = { p: hs.p, h: hs.h, m: hs.m, teil: hs.m > 0, rand: false, b: 'yes', id: hs.id, typ: t.typ, fern: t.fern };
    if (t.variant) e.variant = t.variant; if (hs.farbe) e.farbe = hs.farbe; if (laden) e.laden = true;
    if (hs.lod2) { e.echt = 1; e.dach = hs.lod2.dach; e.traufe = r2(hs.lod2.traufe); e.first = r2(hs.lod2.first); if (!hs.p.some(q => strLinIdx.naechste(q[0], q[1], 20))) e.hinten = 1;   // amtliche Daten (Dachform, Traufe, First) für die Bauweisen
      // echtes Dach (kit/buildings.js echtesDach): Flächen aus dem Kataster, nur wo es nicht flach ist
      const fl = hs.lod2.dachFl; if (fl?.length && hs.lod2.dach !== '1000' && hs.lod2.first - hs.lod2.traufe > 0.3) e.dachFl = fl.map(a => a.map(v => Math.round(v * 100) / 100)); }
    if (!hs.osm && !hs.hoch && (!hs.art || sonderZone(lat - hs.cz / K_LAT, lon + hs.cx / K_LON)) && kiezeDa()) {   // Bezirkscharakter Berlin (kit/kieze.js, Nr. 86): Altbau, Platte, Villa, Farben und Stuck je Ortsteil
      const bt = berlinTyp({ h: hs.h - hs.m, flaeche: hs.A, nutzung, laden, dach: hs.lod2?.dach, traufe: hs.lod2 ? hs.lod2.traufe : hs.h - hs.m, ...streckung(hs.p), la: lat - hs.cz / K_LAT, lo: lon + hs.cx / K_LON }, rng(Math.floor(hs.id / 64) % 2147483647 + 23));
      if (bt) { e.typ = bt.typ; if (bt.variant) e.variant = bt.variant; else delete e.variant; if (bt.vg) e.vg = bt.vg; e.fern = bt.fern; if (bt.ton != null) e.ton = bt.ton; }
      if (laden) { const k = kiezBei(lat - hs.cz / K_LAT, lon + hs.cx / K_LON); if (k) e.kiez = k.pn; }   // Läden je Kiez (kit/schilder.js, Nr. 87)
      if (e.dachFl) { const r = dachRotBei(lat - hs.cz / K_LAT, lon + hs.cx / K_LON, e.typ === 'efh' || e.typ === 'reihenhaus' || hs.h - hs.m < 9.5); if (r != null) e.rot = r; }   // Dachdeckung je Bezirk (Nr. 87)
    }
    if (hs.hoch && !hs.osm) { const v = hochStil(hs.hoch); if (v) { e.typ = v.typ; if (v.variant) e.variant = v.variant; else delete e.variant; if (v.vg) e.vg = v.vg; e.fern = v.fern; e.ton = v.ton; e.hinten = 0; } }   // Fassade nach Vorbild (kit/osmteile.js hochStil)
    if (hs.osm) { e.echt = 1; e.osm = hs.osm; e.hinten = 0; const tf = teilFern({ ...hs.osm, h: hs.h, m: hs.m }, { kirche: hs.osm.kirche }, hs.A); e.typ = tf.typ; e.fern = tf.fern; e.ton = tf.ton; if (tf.variant) e.variant = tf.variant; else delete e.variant; }   // bekanntes Gebäude aus OSM Teilen (kit/osmteile_bau.js baut Wände und Dach)
    gebaeude.push(e);
  }
  // Lückenfüller (Wunsch Nr. 36, 02.11.2026, Nader: "Wo Gebäude eigentlich stehen müssten, wie in Ägypten"): in vielen Ländern sind die
  // Straßen kartiert, die Häuser nicht. Kleine Blöcke zwischen Straßen (oder Wohngebiet) mit kaum Häusern bekommen eine Häuserzeile entlang
  // ihrer Ränder: Parzellen an festen Stellen der Erde (gleich in jedem Ort, der den Block enthält), Tiefe und Höhe nach der Bauweise.
  const gleisFrei = L.transportation.filter(f => f.linien && (f.p.class === 'rail' || f.p.class === 'transit') && f.p.brunnel !== 'tunnel').flatMap(f => f.linien.map(C.zuC));
  const fuell = lueckenFuellen({ C, bloeckeP, frei: C.vereinige([...(L2 ? L2.vierecke.map(v => C.zuC(v)) : []), ...gruenP, ...waldP, ...platzP, ...sandP, ...(gleisFrei.length ? C.versatz(gleisFrei, 7, { offen: true }) : []), ...L.aeroway.filter(f => f.paths).flatMap(f => f.paths), ...(L.aeroway.some(f => f.linien) ? C.versatz(L.aeroway.filter(f => f.linien).flatMap(f => f.linien.map(C.zuC)), 40, { offen: true }) : []), ...L.park.filter(f => f.paths).flatMap(f => f.paths), ...L.landuse.filter(f => f.paths && /park|cemetery|grave_yard|pitch|playground|stadium|railway|military/.test(f.p.class || '')).flatMap(f => f.paths)]), gebaeude, nutzIdx, nutzungen, reg, im, GX: lon * K_LON, GZ: -lat * K_LAT,
    linien: L.transportation.filter(f => f.linien).flatMap(f => { const w = LINIE_BREITE[f.p.class] || 4; return f.linien.map(l => ({ l, w })); }) });
  for (const e of fuell) { if (!e.variant) delete e.variant; delete e.A; delete e.nz; gebaeude.push(e); }
  // Militärgelände (Wunsch Nr. 52): Hallen auf einem festen Raster der Erde, dieselben in jedem Ort, der die Stelle enthält. Sie sind echte Gebäude (begehbar, Dach, Kollision); Zaun, Türme und Lastwagen zeichnet kit/militaer.js
  let milDaten = null;
  { const milB = L.landuse.filter(f => f.p.class === 'military' && f.paths).flatMap(f => f.paths); if (milB.length) {
    const milP = C.polys(C.baum(C.vereinige(milB)), 1500); if (milP.length) { const milIdx = new FlaechenIndex(milP, 30), gIdx = new FlaechenIndex(gebaeude.map(g => [g.p]), 20), luft = L.aeroway.some(f => f.paths || f.linien) ? new FlaechenIndex(C.polys(C.baum(C.vereinige([...L.aeroway.filter(f => f.paths).flatMap(f => f.paths), ...(L.aeroway.some(f => f.linien) ? C.versatz(L.aeroway.filter(f => f.linien).flatMap(f => f.linien.map(C.zuC)), 60, { offen: true }) : [])])), 50), 40) : null;
      milDaten = { ringe: milP.map(P => P[0].map(q => [r2(q[0]), r2(q[1])])), laster: [] }; const RAST = 0.0009, i0 = Math.ceil((lat - H / K_LAT) / RAST), i1 = Math.floor((lat + H / K_LAT) / RAST); let hallen = 0;
      for (let i = i0; i <= i1 && hallen < 26; i++) { const dlo = RAST / Math.max(0.2, Math.cos(i * RAST * Math.PI / 180)), j0 = Math.ceil((lon - H / K_LON) / dlo), j1 = Math.floor((lon + H / K_LON) / dlo); for (let j = j0; j <= j1 && hallen < 26; j++) {
        const R = rng((i * 73856093) ^ (j * 19349663)), cx = (j * dlo - lon) * K_LON, cz = -(i * RAST - lat) * K_LAT; if (R() > 0.55) continue; const Lh = 34 + R() * 28, Bh = 18 + R() * 12, drehe = R() < 0.5 ? 0 : Math.PI / 2, ca = Math.cos(drehe), sa = Math.sin(drehe), ecke = (a, b) => [cx + a * ca - b * sa, cz + a * sa + b * ca], ring = [ecke(-Bh / 2, -Lh / 2), ecke(Bh / 2, -Lh / 2), ecke(Bh / 2, Lh / 2), ecke(-Bh / 2, Lh / 2)];
        if (![...ring, [cx, cz]].every(q => im(q[0], q[1], 6) && milIdx.enthaelt(q[0], q[1]) >= 0 && gIdx.enthaelt(q[0], q[1]) < 0 && strasseIdx.enthaelt(q[0], q[1]) < 0 && wasserIdx.enthaelt(q[0], q[1]) < 0 && !(luft && luft.enthaelt(q[0], q[1]) >= 0))) continue;
        const hh = 8 + R() * 5, A = Lh * Bh, Tm = gebaeudeTyp({ h: hh, flaeche: A, nutzung: 'industrie', laden: false, art: 'industrial' }, R, reg); const e = { p: ring.map(q => [r2(q[0]), r2(q[1])]), h: hh, m: 0, teil: false, rand: false, b: 'yes', id: 900000000 + hallen, typ: Tm.typ, fern: Tm.fern }; if (Tm.variant) e.variant = Tm.variant; gebaeude.push(e); hallen++;
        // zwei, drei Lastwagen vor der Halle
        if (R() < 0.7) { const nL = 1 + Math.floor(R() * 3), ab = Lh / 2 + 7; for (let k = 0; k < nL; k++) { const q = ecke((k - (nL - 1) / 2) * 4.2, ab); if (milIdx.enthaelt(q[0], q[1]) >= 0 && strasseIdx.enthaelt(q[0], q[1]) < 0 && gIdx.enthaelt(q[0], q[1]) < 0) milDaten.laster.push([r2(q[0]), r2(q[1]), Math.round(drehe * 1000) / 1000]); } }
      } } } } }
  zeit.gefuellt = fuell.length;
  if (kiezeDa()) for (const g of gebaeude) if (g.gefuellt && g.typ === 'fachwerk' && kiezBei(lat - g.p[0][1] / K_LAT, lon + g.p[0][0] / K_LON)) { g.typ = 'efh'; g.fern = 7; }   // Füllhäuser in Berlin nie als Fachwerk (Nr. 86)
  const hausUnion = C.vereinige(gebaeude.map(g => C.zuC(g.p)));
  mark('gebaeude');

  // 5. Straßennetz für Fahrzeuge (Port des Blocks verkehr aus tools/ort_bauen.py)
  const TEMPO = { motorway: 100, trunk: 70, motorway_link: 60, trunk_link: 50, living_street: 7, service: 15 };
  const tempo = hw => TEMPO[hw] || (/primary|secondary|tertiary/.test(hw) ? reg.tempo : reg.nebenTempo);
  function spuren(hw, w, einbahn) {
    if (einbahn) return [(/primary|secondary|trunk|motorway/.test(hw) && w >= 6.5) ? 2 : 1, 0];
    const n = (/primary|secondary|trunk|motorway/.test(hw) && w >= 12.5) ? 2 : 1; return [n, n];
  }
  const vkLinien = [], tunnelPkt = [];
  for (const s of strassenLinien) {
    if (s.tunnel) { for (const l of s.f.linien) for (const c of l) tunnelPkt.push(c); continue; }
    if (s.hw === 'service' || s.privat) continue;
    for (const l0 of s.f.linien) for (let l of linieImRechteck(l0, -H, -H, H, H)) {
      if (laenge(l) < 1) continue;
      if (s.rueck) l = l.slice().reverse();
      const o = s.osm, osmSp = o?.vor && (s.einbahn || o.zur > 0) ? [o.vor, s.einbahn ? 0 : o.zur] : null;   // echte Spurzahl (OSM), sonst nach Klasse und Breite
      const [vor, zur] = osmSp || spuren(s.hw, s.w, s.einbahn), lw = Math.min(3.5, Math.max(2.6, s.w / (vor + zur)));
      const park = reg.parken && (/residential|tertiary|secondary|unclassified/.test(s.hw) && s.w >= 9 || s.hw === 'primary' && s.w >= 12) && !brueckeLinie.has(l0);   // Hauptstraßen mit Platz auch (Nr. 92)
      const turnV = osmSp && o.turnV?.length === vor ? o.turnV : null, turnZ = osmSp && o.turnZ?.length === zur ? o.turnZ : null;
      const ebene = s.f.p.brunnel === 'bridge' ? Math.max(1, +s.f.p.layer || 1) : (+s.f.p.layer || 0);   // Brücken und andere Ebenen kreuzen nicht
      vkLinien.push({ p: l.map(([x, z]) => [r2(x), r2(z)]), hw: s.hw, rang: RANG[s.hw], vor, zur, lw: r2(lw), w: r2(s.w), tempo: o?.tempo || tempo(s.hw), einbahn: s.einbahn, turnV, turnZ, parkR: park, parkL: park && !s.einbahn, name: s.f.p.name || null, bus: s.hw === 'busway', ...(ebene ? { ebene } : {}) });
    }
  }
  // Fehlende Kreuzungspunkte (07.11.2026, Wunsch Nr. 77, gefunden mit tools/spuren_pruefen.mjs): die Vereinfachung der Kacheln entfernt den gemeinsamen
  // Punkt zweier Straßen oft aus einer geraden Linie. Seitenstraßen endeten deshalb als Sackgasse knapp vor der Hauptstraße (Autos wendeten quer
  // über deren Spuren), und Straßen kreuzten sich ohne Kreuzung (Autos fuhren durcheinander, keine Ampel, Beispiel Wilhelmstraße am Potsdamer Platz).
  knotenErgaenzen(vkLinien, H);
  // Knoten: Punkte auf 0,7 m zusammenfangen (Kachelgrenzen runden verschieden)
  const fang = new Map(), fangPunkte = [];
  const schluessel = c => {
    const gx = Math.round(c[0]), gz = Math.round(c[1]);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of fang.get((gx + a) + ':' + (gz + b)) || []) { const q = fangPunkte[i]; if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 0.7) return i; }
    const i = fangPunkte.length; fangPunkte.push([c[0], c[1]]); const k = gx + ':' + gz; (fang.get(k) || fang.set(k, []).get(k)).push(i); return i;
  };
  const zaehler = new Map(), plus = (k, n = 1) => zaehler.set(k, (zaehler.get(k) || 0) + n);
  for (const e of vkLinien) { e.keys = e.p.map(schluessel); for (const k of e.keys) plus(k); plus(e.keys[0]); plus(e.keys[e.keys.length - 1]); }
  const tunnelSet = new Set(tunnelPkt.map(schluessel));
  const vkKnoten = [], vkIndex = new Map(), knotenVon = k => { if (!vkIndex.has(k)) { vkIndex.set(k, vkKnoten.length); vkKnoten.push([r2(fangPunkte[k][0]), r2(fangPunkte[k][1])]); } return vkIndex.get(k); };
  let vkKanten = [];
  for (const e of vkLinien) {
    let start = 0;
    for (let i = 1; i < e.p.length; i++) {
      if (i === e.p.length - 1 || (zaehler.get(e.keys[i]) || 0) >= 2) {
        const stueck = e.p.slice(start, i + 1);
        if (laenge(stueck) > 0.5) { const { p, keys, ...rest } = e; vkKanten.push({ a: knotenVon(e.keys[start]), b: knotenVon(e.keys[i]), p: stueck.map(c => c.slice()), ...rest, turnV: i === e.p.length - 1 ? rest.turnV : null, turnZ: start === 0 ? rest.turnZ : null }); }   // Abbiegespuren (OSM) gelten am Ende der Linie in Fahrtrichtung
        start = i;
      }
    }
  }
  for (const k of vkKanten) { k.p[0] = vkKnoten[k.a].slice(); k.p[k.p.length - 1] = vkKnoten[k.b].slice(); }
  const GLEICH = ['hw', 'vor', 'zur', 'lw', 'einbahn', 'tempo', 'parkR', 'parkL'];
  const gradVon = () => { const g = new Map(); for (const k of vkKanten) { g.set(k.a, (g.get(k.a) || 0) + 1); g.set(k.b, (g.get(k.b) || 0) + 1); } return g; };
  let geaendert = true;
  while (geaendert) {   // Grad 2 Knoten derselben Straße zusammenziehen
    geaendert = false; const g = gradVon(), an = new Map();
    for (const k of vkKanten) { (an.get(k.a) || an.set(k.a, []).get(k.a)).push(k); (an.get(k.b) || an.set(k.b, []).get(k.b)).push(k); }
    for (const [n, gr] of g) {
      if (gr !== 2) continue; const [e1, e2] = an.get(n);
      if (e1 === e2 || e1.b !== n || e2.a !== n || GLEICH.some(x => e1[x] !== e2[x]) || e1.a === e2.b) continue;
      e1.p = e1.p.concat(e2.p.slice(1)); e1.b = e2.b; e1.name = e1.name || e2.name; e1.bus = e1.bus || e2.bus; e1.turnV = e2.turnV ?? null;   // vorwärts gelten die Abbieger am Ende (e2), rückwärts am Anfang (e1)
      vkKanten.splice(vkKanten.indexOf(e2), 1); geaendert = true; break;
    }
  }
  // enge Kreuzungen zu einer zusammenziehen (Kante unter 14 m an einer Kreuzung oder unter 6 m)
  const mitglieder = vkKnoten.map(c => [c.slice()]), ersatz = new Map();
  geaendert = true;
  while (geaendert) {
    geaendert = false; const g = gradVon();
    for (const k of vkKanten) {
      const a = k.a, b = k.b, l = laenge(k.p), ga = g.get(a) || 0, gb = g.get(b) || 0;
      if (a === b || Math.min(ga, gb) < 2 || !((Math.max(ga, gb) >= 3 && l <= 14) || l <= 6)) continue;
      const alle = mitglieder[a].concat(mitglieder[b]), mx = alle.reduce((s, c) => s + c[0], 0) / alle.length, mz = alle.reduce((s, c) => s + c[1], 0) / alle.length;
      vkKnoten[a] = [r2(mx), r2(mz)]; mitglieder[a] = alle; ersatz.set(b, a);
      for (const e of vkKanten) { if (e.a === b) e.a = a; if (e.b === b) e.b = a; if (e.a === a) e.p[0] = [r2(mx), r2(mz)]; if (e.b === a) e.p[e.p.length - 1] = [r2(mx), r2(mz)]; }
      vkKanten = vkKanten.filter(e => !(e.a === e.b && laenge(e.p) < 30));
      geaendert = true; break;
    }
  }
  { const seen = new Map(), einmal = [];   // doppelte Kanten
    for (const k of vkKanten) { const s = Math.min(k.a, k.b) + ':' + Math.max(k.a, k.b) + ':' + Math.round(laenge(k.p) / 3); if (seen.has(s)) { const alt = seen.get(s); if (!alt.einbahn || k.einbahn) continue; einmal.splice(einmal.indexOf(alt), 1); } seen.set(s, k); einmal.push(k); }
    vkKanten = einmal; }
  const radius = vkKnoten.map((c, i) => Math.max(...mitglieder[i].map(m => Math.hypot(m[0] - c[0], m[1] - c[1]))));
  let grad = gradVon();
  // Ampeln: wo es echte Daten gibt (OSM, Berlin), genau an den Kreuzungen mit Ampel. Sonst nach Regel: zwei größere Straßen treffen sich
  // (Rang 4 und 3, oder Rang 5 an einer Kreuzung mit vier Armen)
  const signal = OSM ? osmAmpelKnoten(OSM, vkKnoten, radius, grad) : new Set();
  if (!OSM) for (const [n, gr] of grad) {
    if (gr < 3) continue;
    const raenge = vkKanten.filter(k => k.a === n || k.b === n).map(k => k.rang).sort((a, b) => b - a);
    if (raenge[0] >= 7) continue;
    if ((raenge[0] >= 4 && raenge[1] >= 3) || (raenge[0] >= 5 && gr >= 4 && raenge[1] >= 2)) signal.add(n);
  }
  // Inseln: nur Kanten, die vom Rand oder Portal erreichbar sind und wieder hinausführen
  const hin = new Map(), her = new Map(), push = (m, a, b) => (m.get(a) || m.set(a, []).get(a)).push(b);
  for (const k of vkKanten) { push(hin, k.a, k.b); push(her, k.b, k.a); if (!k.einbahn) { push(hin, k.b, k.a); push(her, k.a, k.b); } }
  const erreichbar = (start, nach) => { const seen = new Set(start), st = start.slice(); while (st.length) { const u = st.pop(); for (const v of nach.get(u) || []) if (!seen.has(v)) { seen.add(v); st.push(v); } } return seen; };
  const portal = i => { const c = vkKnoten[i]; for (const k of tunnelSet) { const q = fangPunkte[k]; if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 1) return true; } return false; };
  const tore = vkKnoten.map((c, i) => i).filter(i => (grad.get(i) || 0) === 1 && (Math.max(Math.abs(vkKnoten[i][0]), Math.abs(vkKnoten[i][1])) >= H - 0.6 || portal(i)));
  const offen = new Set([...erreichbar(tore, hin)].filter(x => erreichbar(tore, her).has(x)));
  vkKanten = vkKanten.filter(k => offen.has(k.a) && offen.has(k.b));
  grad = gradVon();
  const knotenAus = vkKnoten.map(([x, z], i) => {
    const gr = grad.get(i) || 0, amRand = Math.max(Math.abs(x), Math.abs(z)) >= H - 0.6;
    const art = gr === 0 ? 'frei' : amRand && gr === 1 ? 'rand' : gr === 1 && portal(i) ? 'portal' : gr === 1 ? 'sackgasse' : gr >= 3 ? 'kreuzung' : 'knick';
    return [x, z, art, signal.has(i) && gr >= 3 ? 1 : 0, r2(radius[i] || 0)];
  });
  mark('netz');

  // Kreuzungsflächen (Wunsch Nr. 88, 09.11.2026, Regeln in 04_REGELWERK.md Teil Kreuzungen): um jeden Kreuzungsknoten der Knotenradius plus die halbe
  // Breite des breitesten Arms. Vorher galt für die Markierung ein fester Kreis von 11 m, der in breiten Kreuzungen viel zu klein war.
  const hbK = new Map(); for (const k of vkKanten) for (const e of [k.a, k.b]) hbK.set(e, Math.max(hbK.get(e) || 0, k.w / 2));
  const zone = i => (knotenAus[i][4] || 0) + (hbK.get(i) || 3) + 0.5;
  const kreuzIdx = knotenAus.map((k, i) => k[2] === 'kreuzung' ? i : -1).filter(i => i >= 0);
  const innenKante = k => knotenAus[k.a]?.[2] === 'kreuzung' && knotenAus[k.b]?.[2] === 'kreuzung' && laenge(k.p) < zone(k.a) + zone(k.b) + 4;   // Kante zwischen zwei Knoten derselben großen Kreuzung

  // 6. Markierungen: Leitlinien zwischen Spuren gleicher Richtung, Mittellinie ab Rang 3. Sie enden vor der Kreuzung (Kreuzungsfläche plus Überweg
  // plus 1 m bis zur Haltlinie) und laufen nie durch einen Überweg (unten nach Abschnitt 7 nachgeschnitten)
  const scheiben = C.vereinige(kreuzIdx.map(i => { const k = knotenAus[i], r = zone(i) + 5, P = []; for (let a = 0; a < 24; a++) P.push([k[0] + Math.cos(a / 24 * 6.283) * r, k[1] + Math.sin(a / 24 * 6.283) * r]); return C.zuC(P); }));
  const markier = C.ohne(C.versatz(strasse, -0.6), scheiben);
  const linien = [], jeArt = { mitte: [], spur: [] };
  for (const k of vkKanten) {
    if (k.hw === 'service' || k.p.length < 2 || innenKante(k)) continue;
    const n = k.vor + k.zur, versatzListe = [];
    // Lage wie die Spuren im Fahrsystem (kit/traffic.js baueNetz, rechts positiv): vorher lagen die Leitlinien auf Einbahnen am linken Rand statt
    // zwischen den Spuren, und auf Straßen mit ungleich vielen Spuren je Richtung spiegelbildlich falsch (07.11.2026, Wunsch Nr. 77)
    if (k.einbahn) { const rest = (k.w - k.vor * k.lw) / 2, park = k.parkR && rest >= 1.9 ? Math.min(2.3, rest) : 0, basis = -k.w / 2 + rest - park / 2 + k.vor * k.lw; for (let i = 1; i < k.vor; i++) versatzListe.push([basis - i * k.lw, 'spur']); }
    else { const m2 = (k.mitte || 0) / 2; if (k.rang >= 3) versatzListe.push([0, 'mitte']); for (let i = 1; i < k.vor; i++) versatzListe.push([m2 + i * k.lw, 'spur']); for (let i = 1; i < k.zur; i++) versatzListe.push([-(m2 + i * k.lw), 'spur']); }
    if (!versatzListe.length || n < 2 && k.rang < 3) continue;
    for (const [v, art] of versatzListe) jeArt[art].push(C.zuC(Math.abs(v) < 0.01 ? k.p : versetzt(k.p, v)));
  }
  for (const art of ['mitte', 'spur']) if (jeArt[art].length) for (const s of C.linienIn(jeArt[art], markier)) { const pts = C.vonC(s); if (laenge(pts) > 4) linien.push({ p: pts.map(([x, z]) => [r2(x), r2(z)]), art }); }
  mark('markierungen');

  // 7. Überwege an den Armen jeder Kreuzung, Ampelmasten an Furten. Regeln (Nr. 88): nur an äußeren Armen (nie auf den inneren Kanten einer großen
  // Kreuzung), beide Enden am Bordstein oder an einer Insel (vorher endete ein Überweg ohne Bordstein mitten auf der Fahrbahn), die Mitte außerhalb
  // jeder fremden Kreuzungsfläche, nie zwei Überwege übereinander oder dicht nebeneinander (Furt vor Zebra vor unmarkiert), Masten nur an den behaltenen Furten
  const querungen = [], querWege = [], ampeln = [];
  const strassePolys = C.polys(C.baum(strasse));
  const randIdx = new StreckenIndex(10); for (const P of strassePolys) for (const ring of P) for (let i = 0; i < ring.length; i++) randIdx.add(ring[i], ring[(i + 1) % ring.length], null);
  const kandidaten = [], QD = r => { const D = globalThis.__qDbg; if (D) D[r] = (D[r] || 0) + 1; };   // Gründe zählen (nur Prüfstand)
  for (const n of kreuzIdx) {
    const kn = knotenAus[n]; if (!im(kn[0], kn[1], 20)) continue;
    const arme = vkKanten.filter(k => k.a === n || k.b === n);
    const breitAndere = Math.max(...arme.map(k => k.w)) / 2;
    for (const k of arme) {
      if (k.rang < 1) { QD('rang'); continue; } if (innenKante(k)) { QD('innen'); continue; }
      const pts = k.a === n ? k.p : k.p.slice().reverse(), Lg = laenge(pts), s = Math.max(7, kn[4] + breitAndere + 2.5);
      if (Lg < s + 4) { QD('kurz'); continue; }
      // Lage: an der Kreuzung, sonst bis 6 m weiter im Arm, wo die Fahrbahn nach den Abbiegespuren wieder schmaler ist
      let gef = null, grund = 'keinBordstein';
      // große Kreuzung aus mehreren Knoten: erst hinter allen Kreuzungsflächen (vorher wurde der Überweg in der Fläche des Nachbarknotens verworfen)
      let s0 = s; const frei = sx => { const q = punktBei(pts, sx); return !kreuzIdx.some(jj => jj !== n && Math.hypot(knotenAus[jj][0] - q.x, knotenAus[jj][1] - q.z) < zone(jj) + 2); };
      while (s0 < Lg - 4 && s0 < s + 30 && !frei(s0)) s0 += 1;
      for (const sT of [s0, s0 + 3, s0 + 6]) {
        if (Lg < sT + 4) break;
        const q = punktBei(pts, sT); const nx = -q.dz, nz = q.dx, w = k.w / 2 + 7;   // bis 7 m über die halbe Breite: an Kreuzungen weitet sich die Fahrbahn für Abbiegespuren
        if (strasseIdx.enthaelt(q.x, q.z) < 0) { grund = 'nichtFahrbahn'; continue; }   // Mitte des Überwegs muss auf der Fahrbahn liegen
        if (kreuzIdx.some(jj => jj !== n && Math.hypot(knotenAus[jj][0] - q.x, knotenAus[jj][1] - q.z) < zone(jj) + 2)) { grund = 'fremdeZone'; continue; }   // Mitte in einer fremden Kreuzungsfläche
        const ta = randIdx.strahl(q.x, q.z, -nx, -nz, w), tb = randIdx.strahl(q.x, q.z, nx, nz, w);   // bis zum Bordstein auf beiden Seiten
        if (ta >= w - 0.05 || tb >= w - 0.05) { grund = 'keinBordstein'; continue; }   // ein Ende fände keinen Bordstein und läge auf der Fahrbahn
        const ql = ta + tb;
        if (ql < 1.5) { grund = 'winzig'; continue; }
        if (ql < k.w * 0.6 || ql > k.w + 12) { grund = 'breite'; continue; }
        gef = { a: [q.x - nx * ta, q.z - nz * ta], b: [q.x + nx * tb, q.z + nz * tb], ql }; break;
      }
      if (!gef) { QD(grund); continue; }
      const { a, b, ql } = gef;
      const art = kn[3] ? 'furt' : (k.rang >= 3 ? 'zebra' : null);
      kandidaten.push({ e: { p: [[r2(a[0]), r2(a[1])], [r2(b[0]), r2(b[1])]], art: art || 'ohne', signal: !!kn[3] }, art, prio: art === 'furt' ? 0 : art === 'zebra' ? 1 : 2, ql, a, b });
    }
  }
  // Überweg als Rechteck (Länge Bordstein zu Bordstein, 4 m breit). Überlappung über die Trennachsen, mit 1 m Rand: auch dicht nebeneinander zählt als doppelt
  const rechteck = (a, b, halb) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L; return { cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, ux, uz, hl: L / 2, hw: halb }; };
  const ueberlappen = (A, B) => { for (const [ax, az] of [[A.ux, A.uz], [-A.uz, A.ux], [B.ux, B.uz], [-B.uz, B.ux]]) { const d = Math.abs((B.cx - A.cx) * ax + (B.cz - A.cz) * az), ra = A.hl * Math.abs(A.ux * ax + A.uz * az) + A.hw * Math.abs(-A.uz * ax + A.ux * az), rb = B.hl * Math.abs(B.ux * ax + B.uz * az) + B.hw * Math.abs(-B.uz * ax + B.ux * az); if (d > ra + rb) return false; } return true; };
  kandidaten.sort((u, v) => u.prio - v.prio || u.ql - v.ql);
  const qBehalten = [];
  for (const c of kandidaten) { c.R = rechteck(c.a, c.b, 2 + 1); if (qBehalten.some(d => ueberlappen(d.R, c.R))) { QD('doppelt'); continue; } qBehalten.push(c); }
  for (const c of qBehalten) {
    querWege.push(c.e); if (c.art) querungen.push({ p: c.e.p, art: c.art });
    if (c.e.signal) { const [a, b] = [c.a, c.b], dx = b[0] - a[0], dz = b[1] - a[1], Lq = Math.hypot(dx, dz) || 1; for (const [qq, sg] of [[a, -1], [b, 1]]) ampeln.push([r2(qq[0] + dx / Lq * 0.7 * sg), r2(qq[1] + dz / Lq * 0.7 * sg), Math.round(Math.atan2(-dx * sg, -dz * sg) * 1000) / 1000]); }
  }
  // Markierungen enden 1 m vor jedem Überweg (Haltlinie), statt durch ihn hindurchzulaufen
  if (querungen.length && linien.length) {
    const bandP = C.vereinige(querungen.map(q => { const R = rechteck(q.p[0], q.p[1], 2 + 1); return C.zuC([[R.cx - R.ux * (R.hl + 1) + R.uz * R.hw, R.cz - R.uz * (R.hl + 1) - R.ux * R.hw], [R.cx + R.ux * (R.hl + 1) + R.uz * R.hw, R.cz + R.uz * (R.hl + 1) - R.ux * R.hw], [R.cx + R.ux * (R.hl + 1) - R.uz * R.hw, R.cz + R.uz * (R.hl + 1) + R.ux * R.hw], [R.cx - R.ux * (R.hl + 1) - R.uz * R.hw, R.cz - R.uz * (R.hl + 1) + R.ux * R.hw]]); }));
    const frei = C.ohne(markier, bandP), neuL = [];
    for (const art of ['mitte', 'spur']) { const L = linien.filter(l => l.art === art); if (!L.length) continue; for (const s of C.linienIn(L.map(l => C.zuC(l.p)), frei)) { const pts = C.vonC(s); if (laenge(pts) > 4) neuL.push({ p: pts.map(([x, z]) => [r2(x), r2(z)]), art }); } }
    linien.length = 0; linien.push(...neuL);
  }
  const ampelnEinmal = []; for (const a of ampeln) if (ampelnEinmal.every(b => Math.hypot(a[0] - b[0], a[1] - b[1]) > 4) && strasseIdx.enthaelt(a[0], a[1]) < 0) ampelnEinmal.push(a);
  mark('ueberwege');

  // 8. Wegenetz der Menschen: Gehweg 1,5 m neben dem Bordstein (wo kein Haus steht), Überwege, Fußwege aus den Daten
  const begehbar = C.ohne(C.ohne(bloeckeP, C.versatz(hausUnion, 0.35)), C.versatz(wasser, 0.5));
  const bordRinge = C.versatz(strasse, 1.5).map(p => p.concat([p[0]]));
  const gehLinien = C.linienIn(bordRinge, begehbar).map(C.vonC).filter(l => laenge(l) > 1.5);
  // Fußwege aus den Daten: auf begehbaren Flächen ganz, auf der Fahrbahn nur kurze Querungen (bis 18 m). Vorher liefen Menschen auf breiten
  // Straßen die Fahrbahn entlang, wo OpenStreetMap Gehwege als eigene Linien führt, die in unserer Fahrbahn liegen (29.10.2026, Straße des 17. Juni)
  const fussC = fussLinien.flatMap(f => f.linien.map(C.zuC));
  const datenWege = C.linienIn(fussC, begehbar).map(C.vonC).filter(l => laenge(l) > 2)
    .concat(C.linienIn(fussC, C.ohne(C.versatz(strasse, 0.01), begehbar)).map(C.vonC).filter(l => laenge(l) > 2 && laenge(l) < 18));
  const blockIdx = new FlaechenIndex(C.polys(C.baum(bloeckeP)), 25);
  const wk = [], wkIdx = new Map(), kantenW = [];
  const wKnoten = c => {
    const gx = Math.round(c[0] / 0.6), gz = Math.round(c[1] / 0.6);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const i = wkIdx.get((gx + a) + ':' + (gz + b)); if (i !== undefined && Math.hypot(wk[i][0] - c[0], wk[i][1] - c[1]) < 0.5) return i; }
    const i = wk.length; wk.push([r2(c[0]), r2(c[1])]); wkIdx.set(gx + ':' + gz, i); return i;
  };
  const amBord = new Set();   // Enden der Überwege liegen auf Fahrbahnhöhe (der Weg dorthin ist die Bordsteinkante)
  const kante = (a, b, art, phase, w) => { const ia = wKnoten(a), ib = wKnoten(b); if (ia === ib) return; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; kantenW.push([ia, ib, art, phase, Math.round(-dz / l * 1000) / 1000, Math.round(dx / l * 1000) / 1000, w]); };
  for (const l of gehLinien) { const d = dichter(l, 12); for (let i = 1; i < d.length; i++) kante(d[i - 1], d[i], 'gehweg', null, 2.4); }
  for (const l of datenWege) { const d = dichter(l, 12); for (let i = 1; i < d.length; i++) kante(d[i - 1], d[i], 'gehweg', null, 2.4); }
  // Überwege: Enden an den nächsten Gehweg anschließen (bis 4 m)
  const gehIdx = new StreckenIndex(10); kantenW.forEach((k, i) => gehIdx.add(wk[k[0]], wk[k[1]], i));
  const anschluss = (p) => {
    const q = gehIdx.naechste(p[0], p[1], 4.5); if (!q) return null;
    const k = kantenW[q.s.daten], A = wk[k[0]], B = wk[k[1]];
    if (q.t < 0.08) return A; if (q.t > 0.92) return B;
    const M = [q.x, q.z]; const iM = wKnoten(M), ib = k[1]; k[1] = iM; const dx = B[0] - M[0], dz = B[1] - M[1], l = Math.hypot(dx, dz) || 1;
    kantenW.push([iM, ib, k[2], k[3], Math.round(-dz / l * 1000) / 1000, Math.round(dx / l * 1000) / 1000, k[6]]); gehIdx.add(M, B, kantenW.length - 1);
    return M;
  };
  for (const q of querWege) {
    const [a, b] = q.p, A = anschluss(a), B = anschluss(b); if (!A || !B) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1], phase = q.signal ? (Math.abs(dx) > Math.abs(dz) ? 'Q' : 'H') : null;
    kante(A, a, 'gehweg', null, 2.4); kante(a, b, 'ueberweg', phase, q.art === 'furt' ? 4 : 3); kante(b, B, 'gehweg', null, 2.4); amBord.add(wKnoten(a)); amBord.add(wKnoten(b));
  }
  // Wege über große Plätze (Nr. 99, 10.11.2026): auf Fußgängerflächen ab 1.500 m² gab es kein Wegenetz, die Menschen liefen nur am Rand
  // (Alexanderplatz: rund 300 Menschen im Umkreis, keine Gehwegkante auf der Fläche; die Karte verschmilzt dort alles zu einer Fläche von
  // 148.000 m²). Je Fläche ein lockeres Gitter aus zwei Richtungen im Winkel von 62 Grad, Linien alle 26 m, Richtung fest aus der Lage der
  // Fläche (gleich bei jedem Besuch). Jede Linie zerfällt an den Rändern in Stücke ganz auf der Fläche, Kreuzungen teilen einen Knoten, die
  // Enden schließen bis 4,5 m an Gehwege an. Höchstens 15 km je Ort. Feste Regel in 15_FESTE_REGELN.md
  const platzWeg = [], platzAlt = new Set();   // platzAlt: Knoten auf Plätzen (kit/crowd.js gewichtet sie, Menschen verweilen dort)
  const tPlatz = performance.now();
  { const flaecheNetto = P => Math.abs(flaecheRing(P[0])) - P.slice(1).reduce((a, r) => a + Math.abs(flaecheRing(r)), 0);
    const PP = C.polys(C.baum(platzP)).filter(P => flaecheNetto(P) > 1500).sort((a, b) => flaecheNetto(b) - flaecheNetto(a));
    let gesamt = 0; const frei = (x, z) => hausRoh.enthaelt(x, z) < 0 && !inWahrzeichen(lat - z / K_LAT, lon + x / K_LON);   // nie durch Häuser, Brunnen oder Weltzeituhr
    for (const P of PP) {
      if (gesamt > 15000) break;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, cx = 0, cz = 0;
      for (const [x, z] of P[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; }
      cx /= P[0].length; cz /= P[0].length;
      const wx = lon + cx / K_LON, wz = lat - cz / K_LAT, th0 = ((Math.sin(wx * 12.9898 + wz * 78.233) * 43758.5453) % 1 + 1) % 1 * Math.PI;   // Richtung aus der Lage auf der Erde
      const fam = [];
      for (const th of [th0, th0 + 62 * Math.PI / 180]) {
        const ux = Math.cos(th), uz = Math.sin(th), nx = -uz, nz = ux, R0 = Math.hypot(x1 - x0, z1 - z0) / 2 + 2, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, stuecke = [];
        for (let o = -R0 + 13; o < R0; o += 26) {
          const ax = mx + nx * o - ux * R0, az = mz + nz * o - uz * R0, L = 2 * R0, ts = [];
          for (const ring of P) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {   // Schnitte der Linie mit allen Ringen (gerade-ungerade)
            const px = ring[j][0], pz = ring[j][1], qx = ring[i][0], qz = ring[i][1], ex = qx - px, ez = qz - pz, den = ux * L * ez - uz * L * ex; if (Math.abs(den) < 1e-9) continue;
            const t = ((px - ax) * ez - (pz - az) * ex) / den, s = ((px - ax) * uz * L - (pz - az) * ux * L) / den;
            if (t >= 0 && t <= 1 && s >= 0 && s < 1) ts.push(t);
          }
          ts.sort((a, b) => a - b);
          for (let k = 0; k + 1 < ts.length; k += 2) { const a0 = ts[k] * L + 1.5, a1 = ts[k + 1] * L - 1.5; if (a1 - a0 >= 12) stuecke.push({ ax: ax + ux * a0, az: az + uz * a0, ux, uz, L: a1 - a0, ts: [0, 1] }); }
        }
        fam.push(stuecke);
      }
      for (const A of fam[0]) for (const B of fam[1]) {   // Kreuzungen der beiden Richtungen
        const den = A.ux * B.uz - A.uz * B.ux; if (Math.abs(den) < 1e-6) continue;
        const dx = B.ax - A.ax, dz = B.az - A.az, ta = (dx * B.uz - dz * B.ux) / den, tb = (dx * A.uz - dz * A.ux) / den;
        if (ta > 0.5 && ta < A.L - 0.5 && tb > 0.5 && tb < B.L - 0.5) { A.ts.push(ta / A.L); B.ts.push(tb / B.L); }
      }
      for (const S of [...fam[0], ...fam[1]]) {
        if (gesamt > 15000) break;
        S.ts.sort((a, b) => a - b); const pts = [];
        for (let k = 1; k < S.ts.length; k++) { const t0 = S.ts[k - 1], t1 = S.ts[k], n = Math.max(1, Math.ceil((t1 - t0) * S.L / 12)); for (let s = 0; s < n; s++) pts.push(t0 + (t1 - t0) * s / n); }
        pts.push(1);
        const P2 = pts.map(t => [r2(S.ax + S.ux * S.L * t), r2(S.az + S.uz * S.L * t)]);
        const ok = P2.map(q => frei(q[0], q[1]));
        for (let k = 1; k < P2.length; k++) if (ok[k - 1] && ok[k] && frei((P2[k - 1][0] + P2[k][0]) / 2, (P2[k - 1][1] + P2[k][1]) / 2)) { kante(P2[k - 1], P2[k], 'gehweg', null, 4); platzAlt.add(wKnoten(P2[k - 1])); platzAlt.add(wKnoten(P2[k])); }
        for (const [end, o] of [[P2[0], ok[0]], [P2[P2.length - 1], ok[P2.length - 1]]]) { if (!o) continue; const A = anschluss(end); if (A && Math.hypot(A[0] - end[0], A[1] - end[1]) > 0.5) kante(A, end, 'gehweg', null, 2.4); }
        platzWeg.push(P2); gesamt += S.L;
      }
    }
  }
  globalThis.__ortDebug?.('platzWege', platzWeg); globalThis.__ortDebug?.('platzZeit', performance.now() - tPlatz);   // Prüfstand tools/platz_wege_pruefen.mjs
  // zusammenhängende Netze ab 30 Knoten (vorher nur das größte: wo ein Fluss oder eine Bahn den Ort teilt, fehlte die andere Hälfte samt Menschen)
  const nach = new Map(); for (const k of kantenW) { push(nach, k[0], k[1]); push(nach, k[1], k[0]); }
  let beste = [], gesehen = new Set();
  for (let s0 = 0; s0 < wk.length; s0++) { if (gesehen.has(s0) || !nach.has(s0)) continue; const teil = [], st = [s0]; gesehen.add(s0); while (st.length) { const u = st.pop(); teil.push(u); for (const v of nach.get(u)) if (!gesehen.has(v)) { gesehen.add(v); st.push(v); } } if (teil.length >= 30) beste = beste.concat(teil); }
  const behalten = new Set(beste), neu = new Map(); [...behalten].sort((a, b) => a - b).forEach((alt, i) => neu.set(alt, i));
  const kantenAus = kantenW.filter(k => behalten.has(k[0]) && behalten.has(k[1])).map(k => [neu.get(k[0]), neu.get(k[1]), ...k.slice(2)]);
  const gradW = new Map(); for (const k of kantenAus) { gradW.set(k[0], (gradW.get(k[0]) || 0) + 1); gradW.set(k[1], (gradW.get(k[1]) || 0) + 1); }
  const knotenW = [...behalten].sort((a, b) => a - b).map((alt) => {
    const [x, z] = wk[alt], i = neu.get(alt), g = gradW.get(i) || 0, amRand = Math.max(Math.abs(x), Math.abs(z)) > H - 25;
    const auf = !amBord.has(alt) && blockIdx.enthaelt(x, z) >= 0 ? 0.12 : 0;
    if (platzAlt.has(alt) && alt % 4 !== 0) return [x, z, r2(auf + hoeheAn(x, z)), 'weg'];   // Platzgitter: nur jede vierte Kreuzung ist ein Ziel (kit/crowd.js rechnet je Ziel einen Dijkstra, Nr. 99)
    return [x, z, r2(auf + hoeheAn(x, z)), g === 1 && amRand ? 'ende' : g >= 3 ? 'kreuzung' : g === 1 ? 'ziel' : 'weg'];
  });
  const platzKnoten = [...platzAlt].filter(i => behalten.has(i)).map(i => neu.get(i));
  mark('wege');

  // 9. Gruppen auf Plätzen, 2,5 m neben jedem Weg
  const wegeIdx = new StreckenIndex(10); for (const k of kantenAus) wegeIdx.add(knotenW[k[0]], knotenW[k[1]], null);
  const platzPolys = C.polys(C.baum(platzP)), platzIdx = new FlaechenIndex(platzPolys, 30), gruppen = [];
  // Gruppenplätze nach Fläche (Nr. 99, 10.11.2026): bis dahin zog jeder Versuch einen Platz zufällig, kleine Plätze bekamen so viele wie der
  // Alexanderplatz (dort 0 im Umkreis von 70 m). Jetzt nach Fläche gewichtet, je angefangene 2.500 m² ein Platz, höchstens 20 je Platz und 40 im Ort
  const flP = platzPolys.map(P => Math.max(0, Math.abs(flaecheRing(P[0])) - P.slice(1).reduce((a, r) => a + Math.abs(flaecheRing(r)), 0))), sumF = flP.reduce((a, b) => a + b, 0), jePlatz = new Map();
  if (platzPolys.length && sumF > 0) for (let v = 0; v < 6000 && gruppen.length < 40; v++) {
    let w = R() * sumF, k = 0; while (k < flP.length - 1 && w > flP[k]) { w -= flP[k]; k++; }
    if ((jePlatz.get(k) || 0) >= Math.min(20, Math.ceil(flP[k] / 2500))) continue;
    const P = platzPolys[k]; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of P[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    if (platzIdx.enthaelt(x, z) < 0 || wegeIdx.naechste(x, z, 2.5) || gruppen.some(g => Math.hypot(g[0] - x, g[1] - z) < 20)) continue;
    gruppen.push([r2(x), r2(z)]); jePlatz.set(k, (jePlatz.get(k) || 0) + 1);
  }

  // 10. Bäume (Straße, Park, Wald), Laternen, Stadtmöbel aus den Punkten
  const hausIdx = new FlaechenIndex(gebaeude.map(g => [g.p]), 20);
  const platzFrei = (x, z, hausAb, randAb) => blockIdx.enthaelt(x, z) >= 0 && hausIdx.enthaelt(x, z) < 0 && !fassaden.naechste(x, z, hausAb) && !randIdx.naechste(x, z, randAb);
  const baumFlaeche = { enthaelt: (x, z) => platzFrei(x, z, 2.2, 0.9) ? 0 : -1 }, laternFlaeche = { enthaelt: (x, z) => platzFrei(x, z, 0.8, 0.25) ? 0 : -1 };
  const kreuzPkt = knotenAus.filter(k => k[2] === 'kreuzung');
  const nahKreuzung = (x, z, plusR) => kreuzPkt.some(k => Math.hypot(k[0] - x, k[1] - z) < k[4] + plusR);
  const baeume = [], laternen = [], belegt = new StreckenIndex(8);
  const frei = (x, z, d) => !belegt.naechste(x, z, d);
  const linienMitBreite = strassenLinien.filter(s => !s.tunnel && s.hw !== 'service');
  const GX = lon * K_LON, GZ = -lat * K_LAT;   // Weltlage der Ortsmitte in Metern: Zufall an der Erde, nicht am Ort (Kachelraster, Wunsch Nr. 36)
  for (const s of linienMitBreite) {
    const rang = RANG[s.hw], baumKlasse = rang >= 1 && rang <= 5, nameH = hashText((s.f.p.name || '') + s.hw);
    for (const l of s.f.linien) {
      for (const seite of [1, -1]) {
        if (rang <= 2 && seite === -1 && s.w < 7) { /* Laternen schmaler Straßen nur auf einer Seite */ } else
        for (const d of weltStellen(l, rang >= 4 ? 34 : 30, seite > 0 ? 4 : 19, GX, GZ)) {   // Laternen am Bordstein
          const q = punktBei(l, d), x = q.x - q.dz * seite * (s.w / 2 + 0.55), z = q.z + q.dx * seite * (s.w / 2 + 0.55);
          if (!im(x, z, 3) || laternFlaeche.enthaelt(x, z) < 0 || !frei(x, z, 6)) continue;
          laternen.push([r2(x), r2(z)]); belegt.add([x, z], [x, z], 'l');
        }
        if (!baumKlasse) continue;
        const ab = s.w / 2 + Math.max(1.3, Math.min(2.2, reg.gehweg * 0.6));
        for (const d of weltStellen(l, 12.5, seite > 0 ? 2 : 8, GX, GZ)) {   // Straßenbäume: Abschnitte von 120 m mit oder ohne Bäume, fest je Stelle und Straße
          const q = punktBei(l, d), x = q.x - q.dz * seite * ab, z = q.z + q.dx * seite * ab;
          if (rng(hashXZ(Math.floor((x + GX) / 120), Math.floor((z + GZ) / 120)) ^ nameH)() >= 1.6 * reg.baeume) continue;
          if (!im(x, z, 4) || nahKreuzung(x, z, 10) || baumFlaeche.enthaelt(x, z) < 0 || !frei(x, z, 4)) continue;
          const Rb = rng(hashXZ((x + GX) * 2, (z + GZ) * 2));
          baeume.push([r2(x), r2(z), r2(9 + Rb() * 7), baumArt(Rb, reg, lat), 1]); belegt.add([x, z], [x, z], 'b');
        }
      }
    }
  }
  const gruenIdx0 = new FlaechenIndex(C.polys(C.baum(C.ohne(gruenP, C.versatz(pfadP, 1.5)))), 30);
  const gruenIdx = { enthaelt: (x, z) => gruenIdx0.enthaelt(x, z) >= 0 && hausIdx.enthaelt(x, z) < 0 && !fassaden.naechste(x, z, 2) ? 0 : -1 };
  const waldIdx = new FlaechenIndex(C.polys(C.baum(C.ohne(waldP, C.versatz(pfadP, 1.5)))), 30);
  // Wald und Grün auf einem Raster, das an der Erde hängt (nicht am Ort): Zufall je Rasterzelle aus ihrer Weltlage, so stehen dieselben Bäume
  // an derselben Stelle, wenn beim Fahren der nächste Ort gebaut wird (vorher sprangen sie bei jedem Ortswechsel)
  const x0 = Math.ceil((GX - H + 5) / 9) * 9 - GX, z0 = Math.ceil((GZ - H + 5) / 9) * 9 - GZ;
  for (let x = x0; x < H - 5; x += 9) for (let z = z0; z < H - 5; z += 9) {
    if (baeume.length > (wald ? 15000 : 2600)) break;
    const ix = Math.round((x + GX) / 9), iz = Math.round((z + GZ) / 9), Rz = rng(((ix * 73856093) ^ (iz * 19349663)) >>> 0 || 1);
    const px = x + (Rz() - 0.5) * 7, pz = z + (Rz() - 0.5) * 7;
    const wW = wald ? wald(px, pz) : null;
    if (wW && wW.d > 0.03 && hausIdx.enthaelt(px, pz) < 0 && !fassaden.naechste(px, pz, 2.2)) { if (Rz() < wW.d * 1.05) { const a = waldArt(Rz, lat, hoeheAbs ? hoeheAbs(px, pz) : 100, wW.lum, wW.trocken, gruenIdx.enthaelt(px, pz) >= 0 ? wW.nadel * 0.1 : wW.nadel);   /* Stadtpark ist Laubwald (Tiergarten), das dunkle Grün im Satellitenbild täuscht */ if (a) baeume.push([r2(px), r2(pz), r2(a[1]), WALD_ARTEN[a[0]], 0, wW.ton]); } continue; }
    // Einzelne Bäume im offenen Land: Schirmakazien in der Savanne in losen Gruppen, Solitäre auf Weiden
    if (wW && !wW.sperre && !wW.acker && wW.gras > 0.35 && hausIdx.enthaelt(px, pz) < 0 && !fassaden.naechste(px, pz, 2.2)) { const ins = Math.sin((x + GX) * 0.017 + 1.3) * Math.sin((z + GZ) * 0.013 + 0.7) + 0.5 * Math.sin((x + GX) * 0.047 + (z + GZ) * 0.036); if (Rz() < wW.gras * (wW.trocken > 0.3 ? 0.03 : 0.005) * Math.max(0, 0.35 + ins)) { const a = waldArt(Rz, lat, hoeheAbs ? hoeheAbs(px, pz) : 100, 0.3, wW.trocken, 0); if (a) baeume.push([r2(px), r2(pz), r2(a[1]), WALD_ARTEN[a[0]], 0, wW.ton]); } }
    if (waldIdx.enthaelt(px, pz) >= 0) { if (Rz() < 0.85) baeume.push([r2(px), r2(pz), r2(14 + Rz() * 10), baumArt(Rz, reg, lat), 0]); }
    else if (((ix + iz) & 1) === 0 && gruenIdx.enthaelt(px, pz) >= 0 && Rz() < 0.5 && frei(px, pz, 5)) baeume.push([r2(px), r2(pz), r2(10 + Rz() * 9), baumArt(Rz, reg, lat), 0]);
  }
  // Unterholz im Wald: Büsche und junge Bäume dicht am Boden, dazu die Karte für Gras und Farne
  let waldKarte = null;
  if (wald) { const N = 96, K = new Uint8Array(N * N), Gr = new Uint8Array(N * N), F = new Uint8Array(N * N * 4); let summe = 0, sGras = 0, sTr = 0; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const q = wald((i + 0.5) / N * 2 * H - H, (j + 0.5) / N * 2 * H - H), o = j * N + i, d = q ? q.d : 0, gr = q && !q.sperre ? q.gras * (1 - d) : 0; K[o] = Math.round(d * 255); Gr[o] = Math.round(gr * 255); summe += d; sGras += gr; sTr += q ? q.trocken : 0; if (q && !q.sperre) { F[o * 4] = q.ton >> 16 & 255; F[o * 4 + 1] = q.ton >> 8 & 255; F[o * 4 + 2] = q.ton & 255; } else { F[o * 4] = 70; F[o * 4 + 1] = 78; F[o * 4 + 2] = 52; } F[o * 4 + 3] = 255; } if (summe > N * N * 0.04 || sGras > N * N * 0.04) waldKarte = { n: N, d: K, g: Gr, f: F, trocken: sTr / (N * N), lat };
    if (waldKarte) { let zahl = 0; for (let ix = Math.ceil((-H + GX + 5) / 6.5); ix * 6.5 - GX < H - 5; ix++) for (let iz = Math.ceil((-H + GZ + 5) / 6.5); iz * 6.5 - GZ < H - 5; iz++) { if (zahl > 13000) break; const Rb = rng((Math.imul(ix, 83492791) ^ Math.imul(iz, 19349663)) >>> 0 || 3), px = ix * 6.5 - GX + (Rb() - 0.5) * 5.5, pz = iz * 6.5 - GZ + (Rb() - 0.5) * 5.5, q = wald(px, pz); if (!q || q.d < 0.35 || Rb() > q.d * 0.72) continue; if (hausIdx.enthaelt(px, pz) >= 0 || fassaden.naechste(px, pz, 2)) continue; const a = waldArt(Rb, lat, hoeheAbs ? hoeheAbs(px, pz) : 100, q.lum, q.trocken, q.nadel); if (!a) continue; const jung = Rb() < 0.3; baeume.push(jung ? [r2(px), r2(pz), r2(4 + Rb() * 6), WALD_ARTEN[a[0]] === 'urwaldriese' ? 'regenwald' : WALD_ARTEN[a[0]], 0, q.ton] : [r2(px), r2(pz), r2(1.3 + Rb() * 2.6), 'busch', 0, q.ton]); zahl++; } }
  }
  // In der Stadt sind Parks Laubwald (Tiergarten, Central Park), das dunkle Grün im Satellitenbild täuscht Nadelwald vor. Nur der hohe Norden behält seine Nadelbäume
  if (gebaeude.length > 250 && reg.key !== 'skandi') { const Rw = rng((Math.round(lat * 1000) * 31) ^ Math.round(lon * 1000)); for (const b of baeume) if ((b[3] === 'fichte' || b[3] === 'kiefer') && Rw() < 0.88) { b[3] = ['eiche', 'esche', 'eiche', 'espe'][Math.floor(Rw() * 4)]; b[2] = Math.min(b[2], 26); } }
  // Büsche in Parks und Grünflächen (05.11.2026): an der Welt verankert, wie die Bäume
  { const zahl0 = baeume.length; for (let ix = Math.floor((-H + GX) / 8); ix <= Math.floor((H + GX) / 8); ix++) for (let iz = Math.floor((-H + GZ) / 8); iz <= Math.floor((H + GZ) / 8); iz++) { if (baeume.length - zahl0 > 700) break; const Rb = rng((Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) >>> 0 || 1); Rb(); if (Rb() > 0.11) continue; const px = ix * 8 - GX + Rb() * 8, pz = iz * 8 - GZ + Rb() * 8; if (Math.abs(px) > H - 2 || Math.abs(pz) > H - 2 || gruenIdx.enthaelt(px, pz) < 0 || !frei(px, pz, 2)) continue; baeume.push([r2(px), r2(pz), r2(1.2 + Rb() * 1.5), 'busch', 0]); } }
  // Stadtmöbel: Punkte aus den Kacheln, an den Bordstein gesetzt, Blick zur Fahrbahn
  const MOEBEL = { bicycle_parking: 'rad', waste_basket: 'korb', bus_stop: 'halt', bollard: 'poller', bench: 'bank' }, grenze = { rad: 160, korb: 140, poller: 120, bank: 120, halt: 60 }, zahl = {};
  const moebel = [];
  for (const f of L.poi) {
    const typ = MOEBEL[f.p.subclass] || MOEBEL[f.p.class]; if (!typ) continue;
    let [x, z] = f.punkt; if (!im(x, z, 2)) continue;
    if ((zahl[typ] = (zahl[typ] || 0) + 1) > grenze[typ]) continue;
    const q = randIdx.naechste(x, z, 25);
    if (typ !== 'poller' && q && strasseIdx.enthaelt(x, z) >= 0) { const dx = q.x - x, dz = q.z - z, l = Math.hypot(dx, dz) || 1; x = q.x + dx / l * 0.7; z = q.z + dz / l * 0.7; }
    const q2 = randIdx.naechste(x, z, 30);
    moebel.push([r2(x), r2(z), typ, q2 ? Math.round(Math.atan2(q2.x - x, q2.z - z) * 1000) / 1000 : 0]);
  }
  mark('ausstattung');

  // Bahn (kit/bahn.js): Gleise ohne Tunnel, Stationen, Bahnübergänge (Gleis kreuzt Straße ohne Brücke)
  const gleise = [], stationen = [], uebergaenge = [];
  { const ART = { rail: 'rail', light_rail: 'sbahn', subway: 'ubahn', tram: 'tram', narrow_gauge: 'schmal', funicular: 'seil', monorail: 'mono', preserved: 'schmal', disused: null, abandoned: null };
    for (const f of L.transportation) { if (!f.linien) continue; const c = f.p.class; if (c !== 'rail' && c !== 'transit') continue; if (f.p.brunnel === 'tunnel') continue; const art = ART[f.p.subclass || 'rail']; if (!art) continue; for (const l0 of f.linien) for (const l of linieImRechteck(l0, -H, -H, H, H)) { if (l.length < 2) continue; gleise.push({ p: l.map(([x, z]) => [r2(x), r2(z)]), art, br: f.p.brunnel === 'bridge' ? Math.max(1, f.p.layer || 1) : 0, nb: f.p.service ? 1 : 0, la: +f.p.layer || 0 }); } }
    // Bahnhöfe auf dem Viadukt (Nr. 99, Alexanderplatz): die Gleise im Bahnhof tragen in OSM layer 1 ohne Brückenmarke und lagen deshalb am Boden, von den
    // Viadukten nur mit 2,5 % hochgezogen (in der Bahnhofsmitte 4,6 statt 6,4 m, Züge im Viadukt). Feste Regel: ein Gleis mit layer ab 1, das an beiden Enden
    // an eine Brücke oder an den Ortsrand stößt, liegt auf Brückenhöhe. Eigene Pfeiler bekommt es nicht (sp), das Bauwerk ist der Bahnhof
    { const ende = g => [g.p[0], g.p[g.p.length - 1]], nahE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 2.6, randE = q => Math.max(Math.abs(q[0]), Math.abs(q[1])) > H - 3;
      for (let r = 0; r < 4; r++) { let neu = 0; for (const g of gleise) { if (g.br || !(g.la >= 1)) continue; const ok = q => randE(q) || gleise.some(o => o !== g && o.br && ende(o).some(e => nahE(e, q))); const [a, b] = ende(g); if (ok(a) && ok(b) && !(randE(a) && randE(b))) { g.br = g.la; g.sp = 1; neu++; } } if (!neu) break; }
      for (const g of gleise) delete g.la; }
    for (const f of L.poi) { if (f.p.class !== 'railway' || !f.punkt || !['station', 'halt', 'tram_stop', 'subway'].includes(f.p.subclass)) continue; if (!im(f.punkt[0], f.punkt[1], -60)) continue; stationen.push({ x: r2(f.punkt[0]), z: r2(f.punkt[1]), sub: f.p.subclass, name: f.p['name:de'] || f.p.name || f.p['name:latin'] || '' }); }
    if (gleise.length) {
      const zellen = new Map(), Z = 40, kk = (x, z) => Math.floor(x / Z) + ',' + Math.floor(z / Z);
      for (const s of strassenLinien) { if (s.tunnel || s.oben || s.f.p.brunnel === 'bridge' || !s.f.linien) continue; for (const l of s.f.linien) for (let i = 1; i < l.length; i++) { const [ax, az] = l[i - 1], [bx, bz] = l[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / Z) + 1; const seen = new Set(); for (let t = 0; t <= n; t++) { const k = kk(ax + (bx - ax) * t / n, az + (bz - az) * t / n); if (seen.has(k)) continue; seen.add(k); if (!zellen.has(k)) zellen.set(k, []); zellen.get(k).push([ax, az, bx, bz, s.w || 7, s.hw]); } } }
      const treffer = new Map();
      for (const g of gleise) { if (g.br || g.art === 'tram' || g.nb) continue; for (let i = 1; i < g.p.length; i++) { const [ax, az] = g.p[i - 1], [bx, bz] = g.p[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / Z) + 1; const seen = new Set(); for (let t = 0; t <= n; t++) { const k = kk(ax + (bx - ax) * t / n, az + (bz - az) * t / n); if (seen.has(k)) continue; seen.add(k); for (const q of zellen.get(k) || []) { const d = (bx - ax) * (q[3] - q[1]) - (bz - az) * (q[2] - q[0]); if (Math.abs(d) < 1e-6) continue; const u = ((q[0] - ax) * (q[3] - q[1]) - (q[1] - az) * (q[2] - q[0])) / d, v = ((q[0] - ax) * (bz - az) - (q[1] - az) * (bx - ax)) / d; if (u < 0 || u > 1 || v < 0 || v > 1) continue; const x = ax + (bx - ax) * u, z = az + (bz - az) * u; if (!im(x, z, 20) || /motorway|trunk/.test(q[5])) continue; const key = Math.round(x / 14) + ',' + Math.round(z / 14); if (treffer.has(key)) continue; const l = Math.hypot(q[2] - q[0], q[3] - q[1]) || 1; treffer.set(key, { x: r2(x), z: r2(z), rx: r2((q[2] - q[0]) / l), rz: r2((q[3] - q[1]) / l), w: r2(q[4]) }); } } } }
      uebergaenge.push(...treffer.values());
    }
  }

  // Flughafen (kit/flughafen.js): Pisten, Rollwege, Vorfelder, Gates aus der Karte
  let flughafen = null, vorfeld = [];
  { const pl = L.aeroway.filter(f => f.linien && f.p.class === 'runway'), rl = L.aeroway.filter(f => f.linien && f.p.class === 'taxiway'), ap = L.aeroway.filter(f => f.paths && f.p.class === 'apron'), gt = L.aeroway.filter(f => f.punkt && f.p.class === 'gate');
    if (pl.length || rl.length || ap.length) {
      const pisten = []; const nachRef = new Map(); for (const f of pl) { const k = f.p.ref || f.id || Math.random(); if (!nachRef.has(k)) nachRef.set(k, []); nachRef.get(k).push(f); }
      for (const [ref, L2] of nachRef) { const P = L2.flatMap(f => f.linien.flat()); if (P.length < 2) continue; let bd = 0, A = P[0], B = P[1]; const a0 = P[0]; let fer = P[0], dm = 0; for (const q of P) { const d = (q[0] - a0[0]) ** 2 + (q[1] - a0[1]) ** 2; if (d > dm) { dm = d; fer = q; } } A = fer; dm = 0; for (const q of P) { const d = (q[0] - A[0]) ** 2 + (q[1] - A[1]) ** 2; if (d > dm) { dm = d; B = q; } } const lang = Math.sqrt(dm); if (lang < 150) continue; const teile = L2.flatMap(f => f.linien.flatMap(l => linieImRechteck(l, -H - 60, -H - 60, H + 60, H + 60))); if (!teile.length) continue; let clip = linieImRechteck([A, B], -H - 60, -H - 60, H + 60, H + 60)[0]; if (!clip || clip.length < 2) continue; pisten.push({ p: clip.map(([x, z]) => [r2(x), r2(z)]), voll: [[r2(A[0]), r2(A[1])], [r2(B[0]), r2(B[1])]], ref: String(ref), w: lang > 1500 ? 45 : lang > 800 ? 30 : 20 }); }
      const rollwege = []; for (const f of rl) for (const l0 of f.linien) for (const l of linieImRechteck(l0, -H - 60, -H - 60, H + 60, H + 60)) if (l.length >= 2) rollwege.push({ p: l.map(([x, z]) => [r2(x), r2(z)]), w: f.p.ref && /^[A-Z]/.test(f.p.ref) ? 23 : 18 });
      vorfeld = C.schneide(C.vereinige(ap.flatMap(f => f.paths)), KERN);
      const gates = []; for (const f of gt) { const [x, z] = f.punkt; if (!im(x, z, 10)) continue; let bb = 1e9, nx = 0, nz = 0, gB = null, wx = x, wz = z; for (const g of umrisse) { const r = g.P[0]; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), qx = a[0] + dx * t, qz = a[1] + dz * t, d = Math.hypot(x - qx, z - qz); if (d < bb) { bb = d; gB = r; wx = qx; wz = qz; if (d > 0.5) { nx = (x - qx) / d; nz = (z - qz) / d; } else { const l = Math.sqrt(l2); nx = dz / l; nz = -dx / l; } } } } if (bb > 70) continue; if (gB) { let drin = false; for (let i = 0, j = gB.length - 1; i < gB.length; j = i++) { if ((gB[i][1] > z) !== (gB[j][1] > z) && x < (gB[j][0] - gB[i][0]) * (z - gB[i][1]) / (gB[j][1] - gB[i][1]) + gB[i][0]) drin = !drin; } if (drin) { nx = -nx; nz = -nz; } } { const proben = [[nx, nz], [-nx, -nz], [-nz, nx], [nz, -nx]]; let wahl = null; for (const [ax, az] of proben) { let frei = true; for (const k of [12, 24, 36, 50, 62]) if (hausIdx.enthaelt(wx + ax * k, wz + az * k) >= 0) { frei = false; break; } if (frei) { wahl = [ax, az]; break; } } if (!wahl) continue; nx = wahl[0]; nz = wahl[1]; }
        gates.push({ x: r2(wx), z: r2(wz), nx: r2(nx), nz: r2(nz), ref: f.p.ref || '', gross: Math.abs(hash(f.p.ref || '')) % 3 === 0 }); }
      const stell = []; const vfP = C.polys(C.baum(vorfeld), 800); for (const P of vfP) { const r = P[0]; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } const raster = (x1 - x0) * (z1 - z0) > 40000 ? 48 : 22; let a0 = 0; { const a = r[0], b = r[1]; a0 = Math.atan2(b[0] - a[0], b[1] - a[1]); } for (let x = x0 + raster / 2; x < x1; x += raster) for (let z = z0 + raster / 2; z < z1; z += raster) { let drin = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) drin = !drin; } if (drin && im(x, z, 20)) stell.push({ x: r2(x), z: r2(z), ry: r2(a0), klein: raster < 30 }); } }
      flughafen = { pisten, rollwege, gates, stellplaetze: stell };
      // Häuser rund um die Gates sind Terminals und Hallen, keine Wohnhäuser mit Läden (06.11.2026)
      if (gates.length) for (const e of gebaeude) { let cx = 0, cz = 0; for (const q of e.p) { cx += q[0]; cz += q[1]; } cx /= e.p.length; cz /= e.p.length; let d = 1e9; for (const q of gates) { const dd = Math.hypot(q.x - cx, q.z - cz); if (dd < d) d = dd; } if (d > 220) continue; const A = Math.abs(flaecheRing(e.p)), Rh = rng((e.id % 2147483647) + 11), t = gebaeudeTyp({ h: e.h - e.m, flaeche: A, nutzung: 'industrie', laden: false, art: A > 500 ? 'bahnhof' : 'industrial' }, Rh, reg); e.typ = t.typ; e.fern = t.fern; if (t.variant) e.variant = t.variant; else delete e.variant; delete e.laden; delete e.farbe; }
    }
  }

  // Hafen (kit/hafen.js): lange gerade Ufer vor Industrieflächen sind Kaimauern, dahinter Containerlager. Fähren auf den Linien der Karte
  let hafen = null;
  { const kais = [], bloecke = [], faehren = [];
    for (const f of L.transportation) { if (f.p.class !== 'ferry' || !f.linien) continue; for (const l0 of f.linien) for (const l of linieImRechteck(l0, -H, -H, H, H)) if (l.length >= 2) faehren.push({ p: l.map(([x, z]) => [r2(x), r2(z)]) }); }
    const gruenPolys = new FlaechenIndex(C.polys(C.baum(gruenP), 400), 40), gruenIdx0Fn = (x, z) => gruenPolys.enthaelt(x, z) < 0;   // Ufer im Grünen ist kein Kai
    const wasserPolys = C.polys(C.baum(wasser), 3000), indu = i => i >= 0 && nutzungen[i]?.nz === 'industrie';
    for (const P of wasserPolys) for (const r of P) {
      let i = 0; const n = r.length;
      while (i < n) { let j = i + 1, L0 = 0; const a = r[i]; let dir = null; while (j < i + n) { const q = r[j % n], p0 = r[(j - 1) % n], dx = q[0] - p0[0], dz = q[1] - p0[1], l = Math.hypot(dx, dz); if (l < 0.01) { j++; continue; } if (!dir) dir = [dx / l, dz / l]; if (dir[0] * dx / l + dir[1] * dz / l < 0.995) break; L0 += l; j++; } const b = r[(j - 1) % n];
        if (L0 >= 170 && Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1])) < H - 2) { let nx = -dir[1], nz = dir[0]; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (wasserIdx.enthaelt(mx + nx * 25, mz + nz * 25) >= 0) { nx = -nx; nz = -nz; } const landOk = indu(nutzIdx.enthaelt(mx + nx * 60, mz + nz * 60)) || indu(nutzIdx.enthaelt(mx + nx * 120, mz + nz * 120)), wOk = wasserIdx.enthaelt(mx - nx * 50, mz - nz * 50) >= 0 && wasserIdx.enthaelt(mx - nx * 90, mz - nz * 90) >= 0; const nzL = nutzIdx.enthaelt(mx + nx * 60, mz + nz * 60), ohneNutz = nzL < 0 || !/wohnen|handel/.test(nutzungen[nzL]?.nz || ''), grosseFlaeche = L0 >= 300 && wasserIdx.enthaelt(mx - nx * 220, mz - nz * 220) >= 0 && ohneNutz && gruenIdx0Fn(mx + nx * 60, mz + nz * 60) && hausIdx.enthaelt(mx + nx * 40, mz + nz * 40) < 0; if ((landOk || grosseFlaeche) && wOk) kais.push({ ax: r2(a[0]), az: r2(a[1]), bx: r2(b[0]), bz: r2(b[1]), nx: r2(nx), nz: r2(nz) }); }
        i = Math.max(i + 1, j - 1); }
    }
    kais.sort((a, b) => Math.hypot(b.bx - b.ax, b.bz - b.az) - Math.hypot(a.bx - a.ax, a.bz - a.az));
    let frei2 = (x, z) => hausIdx.enthaelt(x, z) < 0 && strasseIdx.enthaelt(x, z) < 0 && wasserIdx.enthaelt(x, z) < 0 && im(x, z, 10);
    for (const k of kais.slice(0, 4)) { const dx = k.bx - k.ax, dz = k.bz - k.az, L2 = Math.hypot(dx, dz), ux = dx / L2, uz = dz / L2; for (let d = 72; d < 300; d += 36) for (let s = 90; s < L2 - 60; s += 240) { const x = k.ax + ux * s + k.nx * d, z = k.az + uz * s + k.nz * d; let ok = true; for (const [a, b] of [[0, 0], [-110, -10], [110, -10], [-110, 10], [110, 10]]) if (!frei2(x + ux * a + k.nx * b, z + uz * a + k.nz * b)) ok = false; if (ok) bloecke.push({ x: r2(x), z: r2(z), ux: r2(ux), uz: r2(uz) }); if (bloecke.length > 40) break; } }
    if (kais.length || faehren.length) hafen = { kais: kais.slice(0, 6), bloecke, faehren: faehren.slice(0, 8) };
  }

  // Baukräne in großen Städten: freie Stellen zwischen den Häusern
  const baukraene = [];
  if (gebaeude.length > 650) { const Rk = rng(((Math.round(lat * 100) * 31) ^ Math.round(lon * 100)) >>> 0 || 5); let v = 0; while (baukraene.length < Math.min(6, Math.floor(gebaeude.length / 300)) && v++ < 400) { const x = (Rk() * 2 - 1) * (H - 80), z = (Rk() * 2 - 1) * (H - 80); if (hausIdx.enthaelt(x, z) >= 0 || strasseIdx.enthaelt(x, z) >= 0 || wasserIdx.enthaelt(x, z) >= 0 || gruenIdx0.enthaelt(x, z) >= 0 || fassaden.naechste(x, z, 6)) continue; if (!fassaden.naechste(x, z, 30)) continue; baukraene.push([r2(x), r2(z)]); } }

  // Keine Bäume und Füllhäuser auf der Freifläche eines Wahrzeichens
  for (let i = baeume.length - 1; i >= 0; i--) if (inWahrzeichen(lat - baeume[i][1] / K_LAT, lon + baeume[i][0] / K_LON)) baeume.splice(i, 1);
  for (let i = gebaeude.length - 1; i >= 0; i--) { const g = gebaeude[i]; if (g.gefuellt && inWahrzeichen(lat - g.p[0][1] / K_LAT, lon + g.p[0][0] / K_LON)) gebaeude.splice(i, 1); }
  // Keine Bäume auf dem Flugplatz
  { const ae = L.aeroway.filter(f => f.p.class === 'aerodrome' && f.paths).flatMap(f => f.paths); if (ae.length) { const idx = new FlaechenIndex(C.polys(C.baum(C.vereinige(ae)), 50), 60); for (let i = baeume.length - 1; i >= 0; i--) if (idx.enthaelt(baeume[i][0], baeume[i][1]) >= 0) baeume.splice(i, 1); } }

  // Brücken: Stücke im Rechteck, gleiche Art an gemeinsamen Enden zu Ketten verbinden
  const bruecken = []; { const st = []; for (const b of brueckenRoh) for (const l of linieImRechteck(b.p, -H, -H, H, H)) if (laenge(l) > 6) st.push({ p: l.slice(), w: b.w, hw: b.hw }); let wieder = true; while (wieder) { wieder = false; for (let i = 0; i < st.length && !wieder; i++) for (let j = 0; j < st.length && !wieder; j++) { if (i === j || (st[i].hw === 'fuss') !== (st[j].hw === 'fuss') || Math.abs(st[i].w - st[j].w) > 2.5) continue; const a = st[i].p, b = st[j].p, e = a[a.length - 1], nah = (q, r) => Math.hypot(q[0] - r[0], q[1] - r[1]) < 1.6; if (nah(e, b[0])) { st[i].p = a.concat(b.slice(1)); st.splice(j, 1); wieder = true; } else if (nah(e, b[b.length - 1])) { st[i].p = a.concat(b.slice(0, -1).reverse()); st.splice(j, 1); wieder = true; } } } for (const b of st) bruecken.push({ p: b.p.map(([x, z]) => [r2(x), r2(z)]), w: r2(b.w), hw: b.hw }); }
  for (const b of ueberVerkehr) for (const l of linieImRechteck(b.p, -H, -H, H, H)) if (laenge(l) > 6) bruecken.push({ p: l.map(([x, z]) => [r2(x), r2(z)]), w: r2(b.w), hw: b.hw, ueber: b.ueber, e: b.e, x: b.x, k: b.k });   // Brücken über Verkehr (Nr. 95)
  const brueckePolys = bruecken.length ? C.polys(C.baum(C.vereinige(bruecken.flatMap(b => C.versatz([C.zuC(b.p)], b.w / 2 + 2.4, { offen: true })))), 0.5) : [];
  const nichtImWasser = q => !imWasserRoh(q[0], q[1]) || brueckePolys.some(([a, ...h]) => inRing0(a, q[0], q[1]) && !h.some(r => inRing0(r, q[0], q[1])));
  // unter dem Brückenteil einer Brücke über Verkehr (Nr. 95) keine Laternen, Bäume und Möbel: dort stünden sie am Boden und ragten durch das Deck
  const kernIdx = ueberVerkehr.length ? new FlaechenIndex(C.polys(C.baum(C.vereinige(ueberVerkehr.flatMap(b => C.versatz([C.zuC(b.kern)], b.w / 2 + 3, { offen: true })))), 0.5), 20) : null, unterBruecke0 = (x, z) => !!kernIdx && kernIdx.enthaelt(x, z) >= 0;
  const eingIdx = ubahnFl.length ? new FlaechenIndex(C.polys(C.baum(C.versatz(ubahnFl, 1.2))), 20) : null, unterBruecke = (x, z) => unterBruecke0(x, z) || (!!eingIdx && eingIdx.enthaelt(x, z) >= 0);   // auch nicht in U-Bahn Treppen (Nr. 94)
  const relief = (() => { let a = Infinity, b = -Infinity; for (let x = -H; x <= H; x += H / 4) for (let z = -H; z <= H; z += H / 4) { const h = hoeheAn(x, z); a = Math.min(a, h); b = Math.max(b, h); } return b - a; })();
  const aus = paths => C.polys(C.baum(paths), 0.5).map(P => P.map(ring => (relief > 1 ? dichter(ring, 8, true) : ring).map(([x, z]) => [r2(x), r2(z)])));
  // Sport, Freizeit, Alltag (kit/freizeit.js): Lage aus den Kartendaten
  const freizeit = { plaetze: [], deko: [], lifte: [], liftStationen: [], pools: [], stadien };
  // Freizeitparks (07.11.2026): Fahrgeschäfte auf freien Stellen der echten Parkfläche (landuse theme_park), frei gestaltet, kit/rummel.js. Die Stellen hängen an einem festen Raster der Erde: jeder Ort, der dieselbe Stelle zeigt, baut dasselbe
  { const frei = (x, z, r) => { if (Math.abs(x) > H - r - 6 || Math.abs(z) > H - r - 6) return false; for (let i = 0; i < 9; i++) { const w = i / 8 * 6.283, q = i === 8 ? 0 : r, px = x + Math.cos(w) * q, pz = z + Math.sin(w) * q; if (hausIdx.enthaelt(px, pz) >= 0 || strasseIdx.enthaelt(px, pz) >= 0 || wasserIdx.enthaelt(px, pz) >= 0) return false; } return true; }, polys = C.polys(C.baum(C.vereinige(L.landuse.filter(f => f.p.class === 'theme_park' && f.paths).flatMap(f => f.paths))), 3000); if (polys.length) { const idx = new FlaechenIndex(polys, 40), Z0 = 190, R = []; for (let gx = Math.floor((GX - H) / Z0); gx * Z0 < GX + H; gx++) for (let gz = Math.floor((GZ - H) / Z0); gz * Z0 < GZ + H; gz++) { const r1 = rng(hashXZ(gx, gz) ^ 0x7a11), x = (gx + 0.22 + r1() * 0.56) * Z0 - GX, z = (gz + 0.22 + r1() * 0.56) * Z0 - GZ, t = r1(), ry = Math.round(r1() * 628) / 100; if (idx.enthaelt(x, z) < 0 || R.length >= 10) continue; if (t < 0.36) { if (frei(x, z, 46)) R.push({ art: 'bahn', x: r2(x), z: r2(z), r: 46, ry, L: 86, B: 44 }); else if (frei(x, z, 30)) R.push({ art: 'bahn', x: r2(x), z: r2(z), r: 30, ry, L: 56, B: 30 }); } else if (t < 0.6) { if (frei(x, z, 9)) R.push({ art: 'karussell', x: r2(x), z: r2(z), r: 9, ry }); } else if (t < 0.8) { if (frei(x, z, 7)) R.push({ art: 'turm', x: r2(x), z: r2(z), r: 7, ry }); } else if (frei(x, z, 22)) R.push({ art: 'buden', x: r2(x), z: r2(z), r: 22, ry }); } if (R.length) { freizeit.rummel = R; for (let i = baeume.length - 1; i >= 0; i--) { const t = baeume[i]; for (const q of R) { const rr = q.r + 3; if ((t[0] - q.x) ** 2 + (t[1] - q.z) ** 2 < rr * rr) { baeume.splice(i, 1); break; } } } } } }
  // Golfplätze (07.11.2026): Grüns, Bunker und Flaggen auf der echten Fläche (landcover golf_course). Die Lage der einzelnen Bahnen steht nicht in den Karten, sie sind frei verteilt, auf einem festen Raster der Erde
  { const G = C.polys(C.baum(C.schneide(C.vereinige(L.landcover.filter(f => f.p.subclass === 'golf_course' && f.paths).flatMap(f => f.paths)), bloeckeP)), 4000); if (G.length) { const idx = new FlaechenIndex(G, 30), Z0 = 170, gruene = [], sande = [], fahnen = [], kreis = (x, z, rx, rz, a, n = 16) => { const P = []; for (let i = 0; i < n; i++) { const w = i / n * 6.283, k = 1 + 0.12 * Math.sin(w * 3 + a * 5), u = Math.cos(w) * rx * k, v = Math.sin(w) * rz * k; P.push([r2(x + u * Math.cos(a) - v * Math.sin(a)), r2(z + u * Math.sin(a) + v * Math.cos(a))]); } P.push(P[0].slice()); return [P]; }; for (let gx = Math.floor((GX - H) / Z0); gx * Z0 < GX + H; gx++) for (let gz = Math.floor((GZ - H) / Z0); gz * Z0 < GZ + H; gz++) { const r0 = rng(hashXZ(gx, gz) ^ 0x51ed27), x = (gx + 0.2 + r0() * 0.6) * Z0 - GX, z = (gz + 0.2 + r0() * 0.6) * Z0 - GZ; if (r0() > 0.62 || Math.abs(x) > H - 30 || Math.abs(z) > H - 30 || idx.enthaelt(x, z) < 0 || wasserIdx.enthaelt(x, z) >= 0 || hausIdx.enthaelt(x, z) >= 0 || strasseIdx.enthaelt(x, z) >= 0) continue; const rg = 11 + r0() * 7; fahnen.push([r2(x), r2(z)]); gruene.push(kreis(x, z, rg, rg * (0.75 + r0() * 0.25), r0() * 3)); for (let b = 0, nb = 1 + Math.floor(r0() * 3); b < nb; b++) { const a = r0() * 6.283, d = rg + 5 + r0() * 4; sande.push(kreis(x + Math.cos(a) * d, z + Math.sin(a) * d, 4 + r0() * 3.5, 2.6 + r0() * 2, a)); } } if (fahnen.length) { freizeit.golf = { fahnen, gruene, sande }; for (let i = baeume.length - 1; i >= 0; i--) { const t = baeume[i]; for (const f of fahnen) if ((t[0] - f[0]) ** 2 + (t[1] - f[1]) ** 2 < 900) { baeume.splice(i, 1); break; } } } } }
  if (milDaten) { freizeit.militaer = milDaten; zeit.militaer = milDaten.ringe.length; }
  {
    const Rf = rng(((Math.round(lat * 500) * 41) ^ Math.round(lon * 500)) >>> 0 || 7), frei3 = (x, z) => hausIdx.enthaelt(x, z) < 0 && strasseIdx.enthaelt(x, z) < 0 && wasserIdx.enthaelt(x, z) < 0 && im(x, z, 4);
    const zahl2 = {}, deko = (x, z, typ, ry, max = 60) => { if ((zahl2[typ] = (zahl2[typ] || 0) + 1) > max) return false; freizeit.deko.push([r2(x), r2(z), typ, Math.round(ry * 1000) / 1000]); return true; };
    const zurStrasse = (x, z) => { const q = randIdx.naechste(x, z, 50); return q ? Math.atan2(q.x - x, q.z - z) : Rf() * 6.283; };
    const rechteck = ring => { let best = null; const n = ring.length; for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez); if (l < 1.5) continue; const ux = ex / l, uz = ez / l; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of ring) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; } const fl = (u1 - u0) * (v1 - v0); if (!best || fl < best.fl) { const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2; best = { fl, x: mu * ux - mv * uz, z: mu * uz + mv * ux, ux, uz, L: u1 - u0, B: v1 - v0 }; } } if (!best) return null; if (best.B > best.L) { const t = best.L; best.L = best.B; best.B = t; const tu = best.ux; best.ux = -best.uz; best.uz = tu; } let fa = 0; for (let i = 0, j = n - 1; i < n; j = i++) fa += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); best.voll = Math.abs(fa) / 2 / best.fl; return best; };
    const imRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const poiSport = L.poi.filter(f => f.p.class === 'pitch' && f.punkt);
    // Sportplätze: je Fläche das kleinste Rechteck; Art aus dem Punkt der Karte, sonst aus der Größe
    for (const f of L.landuse) { if (f.p.class !== 'pitch' || !f.paths) continue; for (const P of C.polys(C.baum(C.vereinige(f.paths)), 60)) {
      const r = rechteck(P[0]); if (!r || r.voll < 0.72 || !im(r.x, r.z, 8) || freizeit.plaetze.length > 40) continue;
      let art = (poiSport.find(q => imRing(P[0], q.punkt[0], q.punkt[1]))?.p.subclass) || '';
      art = /soccer|football/.test(art) ? 'fussball' : /tennis/.test(art) ? 'tennis' : /basket/.test(art) ? 'basket' : art ? '' : r.L >= 80 && r.L <= 125 && r.B >= 45 && r.B <= 90 ? 'fussball' : r.L >= 21 && r.L <= 30 && r.B >= 9 && r.B <= 19 ? 'tennis' : r.L >= 26 && r.L <= 34 && r.B >= 12 && r.B <= 20 ? 'basket' : r.L >= 30 && r.L <= 70 && r.B >= 18 && r.B <= 45 ? 'bolz' : '';
      if (art) freizeit.plaetze.push({ x: r2(r.x), z: r2(r.z), ry: Math.round(Math.atan2(r.ux, r.uz) * 1000) / 1000, L: r2(r.L), B: r2(r.B), art, imStadion: !!stadienDrin?.(r.x, r.z) });
    } }
    // Straßenausstattung (06.11.2026, "alles, was in der echten Welt"): die Kacheln kennen fast keine Stadtmöbel, darum nach festen Regeln entlang der Gehwege, an der Erde verankert. Was schwer ist, kommt in die Kollision
    { const fest = freizeit.fest = [], EU = ['mitte', 'nordsee', 'ost', 'skandi', 'sued', 'mittelmeer'].includes(reg.key);
      const ARTEN = [['muelleimer', 62, 0.75, 0.82, 80, 1.1], ['hydrant', 92, 0.55, 0.7, 40, 1], ['stromkasten', 150, 1.2, 0.55, 30, 1.3], ['fahrrad', 74, 0.8, 0.5, 50, 1.2], ['roller', 118, 0.8, 0.45, 26, 1], ['kuebel', 96, 1.0, 0.36, 36, 1.3], ['briefkasten', 320, 0.9, 0.85, 12, 1.1], ['parkschild', 86, 0.42, 0.55, 40, 0.8], ['kiosk', 560, 1.9, 0.62, 8, 3.6], ['imbiss', 700, 1.3, 0.5, 6, 3.6]];
      for (const s of linienMitBreite) { if (!/primary|secondary|tertiary|residential|living_street/.test(s.hw) || brueckeLinie.has(s.f.linien[0])) continue; const rangK = /primary|secondary/.test(s.hw) ? 1 : /tertiary/.test(s.hw) ? 0.7 : 0.42;
        for (const l of s.f.linien) for (const seite of [1, -1]) for (let ai = 0; ai < ARTEN.length; ai++) { const [typ, ab, off, p, cap, platz] = ARTEN[ai]; if (typ === 'kiosk' || typ === 'imbiss') { if (rangK < 0.7) continue; }
          for (const d of weltStellen(l, ab, (seite > 0 ? 7 : 31) + ai * 5.3, GX, GZ)) { const q = punktBei(l, d); if (!q) continue; const a0 = s.w / 2 + off, x = q.x - q.dz * seite * a0, z = q.z + q.dx * seite * a0, Rs = rng(hashXZ((x + GX) * 1.7 + ai * 13, (z + GZ) * 1.3)); if (Rs() > p * rangK || !im(x, z, 4) || laternFlaeche.enthaelt(x, z) < 0 || nahKreuzung(x, z, typ === 'parkschild' ? 9 : 7) || !frei(x, z, platz) || hausIdx.enthaelt(x, z) >= 0 || fassaden.naechste(x, z, platz * 0.5)) continue;
            const ry = Math.atan2(-q.dz * seite, q.dx * seite) + Math.PI; if (!deko(x, z, typ, typ === 'fahrrad' || typ === 'imbiss' ? Math.atan2(q.dx, q.dz) + (typ === 'imbiss' && seite < 0 ? Math.PI : 0) : Math.atan2(q.dz * seite, -q.dx * seite), cap)) continue; belegt.add([x, z], [x, z], 'm');
            if (typ === 'kiosk' || typ === 'imbiss') { const r = typ === 'kiosk' ? 1.7 : 1.5, r2z = typ === 'imbiss' ? 2.8 : r; fest.push([[x - r, z - r2z], [x + r, z - r2z], [x + r, z + r2z], [x - r, z + r2z]]); } } } }
      // Wartehäuschen an den Haltestellen der Karte
      { let n = 0; for (const m of moebel) { if (m[2] !== 'halt' || n > 24) continue; const q = randIdx.naechste(m[0], m[1], 12); if (!q) continue; const dx = m[0] - q.x, dz = m[1] - q.z, l = Math.hypot(dx, dz) || 1, x = m[0] + dx / l * 0.2, z = m[1] + dz / l * 0.2; if (hausIdx.enthaelt(x + dx / l * 1.5, z + dz / l * 1.5) >= 0) continue; if (deko(x, z, 'wartehaeuschen', Math.atan2(-dx / l, -dz / l) , 26)) n++; } } }
    // Friedhöfe (06.11.2026): Grabreihen auf der Fläche der Karte, in islamisch geprägten Ländern flache Gräber
    { const islam = ['maghreb', 'golf', 'nahost'].includes(reg.key); let n = 0; for (const f of L.landuse) { if (!/cemetery|grave_yard/.test(f.p.class || '') || !f.paths) continue; for (const P of C.polys(C.baum(C.vereinige(f.paths)), 120)) { const r = rechteck(P[0]); if (!r) continue; const ry = Math.atan2(r.ux, r.uz); for (let a = -r.L / 2 + 1.5; a < r.L / 2 - 1; a += 3.1) for (let b = -r.B / 2 + 1.5; b < r.B / 2 - 1; b += 2.3) { if (n > 460) break; const j = (Math.floor(a / 3.1) * 7 + Math.floor(b / 2.3)) % 11 === 0; if (j) continue; const x = r.x + r.ux * a - r.uz * b, z = r.z + r.uz * a + r.ux * b; if (!imRing(P[0], x, z) || !frei3(x, z) || Rf() < 0.14) continue; if (deko(x, z, islam ? 'grabflach' : Rf() < 0.3 ? 'grabkreuz' : 'grabstein', ry, 480)) n++; } } } }
    // Weinberge: Zeilen nach der langen Achse; Obstgärten: Bäume im Raster
    { let n = 0; for (const f of L.landcover) { const sub = f.p.subclass || ''; if (!/vineyard|orchard/.test(sub) || !f.paths) continue; for (const P of C.polys(C.baum(C.vereinige(f.paths)), 150)) { const r = rechteck(P[0]); if (!r) continue; const ry = Math.atan2(r.ux, r.uz); if (sub === 'vineyard') { for (let b = -r.B / 2 + 1; b < r.B / 2; b += 2.3) for (let a = -r.L / 2 + 1; a < r.L / 2; a += 2.05) { if (n > 2400) break; const x = r.x + r.ux * a - r.uz * b, z = r.z + r.uz * a + r.ux * b; if (!imRing(P[0], x, z) || !frei3(x, z)) continue; if (deko(x, z, 'rebe', ry, 2500)) n++; } } else { for (let b = -r.B / 2 + 3; b < r.B / 2; b += 7.5) for (let a = -r.L / 2 + 3; a < r.L / 2; a += 7) { if (baeume.length > 16000) break; const x = r.x + r.ux * a - r.uz * b, z = r.z + r.uz * a + r.ux * b; if (imRing(P[0], x, z) && frei3(x, z)) baeume.push([r2(x), r2(z), r2(4 + Rf() * 2), baumArt(Rf, reg, lat), 0]); } } } } }
    // Yachthäfen: Stege ins Wasser, Boote zu beiden Seiten
    { const zaehl = { n: 0 }; for (const f of L.poi) { if (f.p.subclass !== 'marina' || !f.punkt || zaehl.n > 150) continue; const [px, pz] = f.punkt; if (!im(px, pz, 40)) continue; let best = null; for (let i = 0; i < 16; i++) { const w = i / 16 * 6.2832, ux = Math.sin(w), uz = Math.cos(w); let t = 0; for (let d = 10; d <= 170; d += 10) if (wasserIdx.enthaelt(px + ux * d, pz + uz * d) >= 0) t += 1; if (!best || t > best.t) best = { t, ux, uz, w }; } if (!best || best.t < 5) continue; const { ux, uz, w } = best, vx = uz, vz = -ux; for (let r = -44; r <= 44; r += 22) { let d0 = null; for (let d = 0; d <= 170; d += 5) if (wasserIdx.enthaelt(px + ux * d + vx * r, pz + uz * d + vz * r) >= 0) { d0 = d; break; } if (d0 === null) continue; for (let s = 5, k = 0; s < 110 && k < 12; s += 10, k++) { const x = px + ux * (d0 + s) + vx * r, z = pz + uz * (d0 + s) + vz * r; if (wasserIdx.enthaelt(x, z) < 0 || !im(x, z, 8)) break; deko(x, z, 'steg', w, 90); for (const si of [-1, 1]) for (const o of [-2.5, 2.5]) { if (Rf() < 0.16) continue; const bx = x + ux * o + vx * si * 6.6, bz = z + uz * o + vz * si * 6.6; if (wasserIdx.enthaelt(bx, bz) < 0) continue; if (deko(bx, bz, 'boot_liege', w + (si > 0 ? -Math.PI / 2 : Math.PI / 2), 170)) zaehl.n++; } } } } }
    // Parkplätze: Stellplätze quer zu den Gassen der Karte, ein Teil belegt, weiße Linien
    { const stellen = []; for (const s of strassenLinien) { if (s.service !== 'parking_aisle' || s.oben || stellen.length > 240 || brueckeLinie.has(s.f.linien[0])) continue; for (const l of s.f.linien) { const Lg = laenge(l); for (let d = 3; d < Lg - 2; d += 2.7) { const q = punktBei(l, d); if (!q) continue; const nx = -q.dz, nz = q.dx; for (const si of [-1, 1]) { const x = q.x + nx * si * 5.5, z = q.z + nz * si * 5.5; if (!im(x, z, 5) || hausIdx.enthaelt(x, z) >= 0 || wasserIdx.enthaelt(x, z) >= 0) continue; deko(q.x + q.dx * 1.35 + nx * si * 5.5, q.z + q.dz * 1.35 + nz * si * 5.5, 'parkstrich', Math.atan2(nx, nz), 520); const h = (Math.imul(Math.round((x + GX) * 2), 73856093) ^ Math.imul(Math.round((z + GZ) * 2), 19349663)) >>> 0; if (h % 100 < 62 && stellen.length < 260) stellen.push([r2(x), r2(z), Math.round(Math.atan2(nx * si, nz * si) * 1000) / 1000, h || 1]); } } } } freizeit.stellen = stellen; }
    // Spielplätze
    { let n = 0; for (const f of L.landuse) { if (f.p.class !== 'playground' || !f.paths || n > 14) continue; for (const P of C.polys(C.baum(C.vereinige(f.paths)), 30)) { const r = rechteck(P[0]); if (!r || !im(r.x, r.z, 8)) continue; n++; const ry = Math.atan2(r.ux, r.uz), an = (u, v) => [r.x + r.ux * u - r.uz * v, r.z + r.uz * u + r.ux * v]; const teile = [['schaukel', -0.26, -0.18], ['rutsche', 0.26, 0.15], ['klettern', 0.02, 0.2]]; for (const [typ, u, v] of teile) { const [x, z] = an(u * r.L, v * r.B); if (imRing(P[0], x, z) && hausIdx.enthaelt(x, z) < 0) deko(x, z, typ, ry); } } } }
    // Punkte der Karte
    for (const f of L.poi) { if (!f.punkt) continue; let [x, z] = f.punkt; if (!im(x, z, 6)) continue; const c = f.p.class, u = f.p.subclass;
      if (c === 'fuel' && u === 'charging_station') { if (strasseIdx.enthaelt(x, z) < 0 && hausIdx.enthaelt(x, z) < 0) deko(x, z, 'ladesaeule', zurStrasse(x, z), 30); }
      else if (c === 'fuel') { const ry = zurStrasse(x, z), sx = Math.sin(ry), cx = Math.cos(ry); let ok = false; for (const w of [0, -8, -14, -20, 8]) { const px = x + sx * w, pz = z + cx * w; let gut = im(px, pz, 28); for (const [a, b] of [[0, 0], [11, 6], [-11, 6], [11, -6], [-11, -6], [0, 15], [8, 19], [-8, 19], [8, 11], [-8, 11]]) { const qx = px + cx * a + sx * b, qz = pz - sx * a + cx * b; if (strasseIdx.enthaelt(qx, qz) >= 0 || hausIdx.enthaelt(qx, qz) >= 0 || wasserIdx.enthaelt(qx, qz) >= 0) { gut = false; break; } } if (gut) { x = px; z = pz; ok = true; break; } } if (ok && deko(x, z, 'tankstelle', ry, 5)) { const cs = Math.cos(ry), sn = Math.sin(ry); for (const [lx, lz, ha] of [[3.9, 0.7, 1], [9.1, -0.6, 2], [-3.9, -0.5, 3], [-9.1, 0.6, 4]]) { const h = (Math.imul(Math.round((x + GX) * 2) + ha, 73856093) ^ Math.imul(Math.round((z + GZ) * 2), 19349663)) >>> 0; if (h % 100 < 58) (freizeit.stellen ||= []).push([r2(x + lx * cs + lz * sn), r2(z - lx * sn + lz * cs), Math.round((ry + (lx > 0 ? 0 : Math.PI)) * 1000) / 1000, h || 1]); } } }
      else if (c === 'telephone') { if (frei3(x, z)) deko(x, z, 'telefon', zurStrasse(x, z), 8); }
      else if (c === 'drinking_water') { if (frei3(x, z)) deko(x, z, 'brunnen', Rf() * 6.283, 8); }
      else if (c === 'monument' || u === 'artwork' || (c === 'attraction' && /statue|memorial/.test(u || ''))) { if (frei3(x, z)) deko(x, z, 'denkmal', zurStrasse(x, z), 10); }
      else if (c === 'picnic_site' || u === 'bbq') { if (frei3(x, z)) deko(x, z, 'picknick', Rf() * 6.283, 14); }
      else if (c === 'aerialway' && u === 'station') freizeit.liftStationen.push({ x: r2(x), z: r2(z) });
      else if (c === 'campsite' && (zahl2.lager = (zahl2.lager || 0) + 1) <= 3) { const nz = 12 + Math.floor(Rf() * 18); for (let i = 0; i < nz * 3 && (zahl2.campNr = zahl2.campNr || 0) < 90; i++) { const a = Rf() * 6.283, d = 6 + Rf() * 80, qx = x + Math.cos(a) * d, qz = z + Math.sin(a) * d; if (!frei3(qx, qz)) continue; const wa = u === 'caravan_site' ? 0.9 : 0.4, ty = Rf() < wa ? 'wohnwagen' : Rf() < 0.6 ? 'zelt' : 'giebelzelt'; if (deko(qx, qz, ty, Rf() * 6.283, 90)) zahl2.campNr++; } }
    }
    // Seilbahnen und Lifte
    for (const f of L.transportation) { if (f.p.class !== 'aerialway' || !f.linien) continue; const art = f.p.subclass === 'gondola' ? 'gondel' : /chair/.test(f.p.subclass || '') ? 'sessel' : f.p.subclass === 'cable_car' ? 'kabine' : null; if (!art) continue; for (const l0 of f.linien) for (const l of linieImRechteck(l0, -H, -H, H, H)) { if (l.length >= 2) freizeit.lifte.push({ p: l.map(q => [r2(q[0]), r2(q[1])]), art }); } }
    // Schwimmbecken: Wasser der Karte, aber klein und türkis statt Fluss
    { const b = L.water.filter(f => f.p.class === 'swimming_pool' && f.paths).flatMap(f => f.paths); if (b.length) freizeit.pools = aus(C.vereinige(b)); }
    // Strandleben: Sand nah am Wasser, Schirme in Reihen, alle paar hundert Meter ein Turm der Rettungsschwimmer
    if (sandP.length) { const S = C.polys(C.baum(sandP), 200), Idx = new FlaechenIndex(S, 30); let tuerme = 0; for (let ix = -H + 6; ix < H - 6; ix += 8.5) for (let iz = -H + 6; iz < H - 6; iz += 8.5) { const qx = ix + (Rf() - 0.5) * 5, qz = iz + (Rf() - 0.5) * 5; if (Idx.enthaelt(qx, qz) < 0 || !frei3(qx, qz)) continue; let w = -1, wa = 0; for (let k = 0; k < 8 && w < 0; k++) { const a = k / 8 * 6.283; for (const d of [18, 36, 60]) if (wasserIdx.enthaelt(qx + Math.cos(a) * d, qz + Math.sin(a) * d) >= 0) { w = d; wa = a; break; } } if (w < 0) continue; const zuW = Math.atan2(Math.cos(wa), Math.sin(wa)), kk = Rf(); if (w >= 36 && tuerme < 6 && kk < 0.012) { tuerme++; deko(qx, qz, 'rettungsturm', zuW); continue; } if (kk < 0.5) { deko(qx, qz, 'schirm', Rf() * 6.283, 170); deko(qx + Math.cos(wa + 1.57) * 1.2, qz + Math.sin(wa + 1.57) * 1.2, 'liege', zuW + (Rf() - 0.5) * 0.5, 300); if (Rf() < 0.7) deko(qx - Math.cos(wa + 1.57) * 1.2, qz - Math.sin(wa + 1.57) * 1.2, 'liege', zuW + (Rf() - 0.5) * 0.5, 300); } } }
  }

  // 11. Ausgabe: Flächen mit dichteren Rändern (Gelände folgt den Punkten), Höhen relativ zur Mitte
  const daten = {
    meta: { name, lat, lon, groesse: 2 * H, rand: 0, kleinort: ortsDeckel(L.place.map(f => f.p)) < 999, blicke: [], land: land.de || null, iso: land.iso2 || null, region: reg.key, links: reg.links,
      quelle: 'Kartendaten © OpenStreetMap Mitwirkende, ODbL (openstreetmap.org/copyright) · © OpenMapTiles · OpenFreeMap', stand, relief: r2(relief), zeit, wegeLinear: true },
    gebaeude, stelen: [],
    strasse: aus(strasse), bloecke: aus(bloeckeP), plaetze: aus(platzP), gruen: aus(gruenP), sand: aus(sandP), pfade: aus(pfadP), radwege: aus(radP), wasser: aus(wasser),
    linien, querungen, ampeln: ampelnEinmal, tunnel: tunnelStuecke, ubahn: ubahnE.liste.map(({ poly, ...e }) => e), laternen: (bruecken.length || wasserRoh.length ? laternen.filter(nichtImWasser) : laternen).filter(q => !stadienDrin?.(q[0], q[1]) && !unterBruecke(q[0], q[1])), baeume: (wasserRoh.length ? baeume.filter(q => !imWasserRoh(q[0], q[1]) && !brueckePolys.some(([a, ...h]) => inRing0(a, q[0], q[1]) && !h.some(r => inRing0(r, q[0], q[1])))) : baeume).filter(q => !stadienDrin?.(q[0], q[1]) && !unterBruecke(q[0], q[1])), waldKarte, moebel: (wasserRoh.length ? moebel.filter(nichtImWasser) : moebel).filter(q => !stadienDrin?.(q[0], q[1]) && !unterBruecke(q[0], q[1])), bruecken, gleise, stationen, uebergaenge, flughafen, vorfeld: vorfeld.length ? aus(vorfeld) : [], hafen, baukraene, freizeit,
    wege: { knoten: knotenW, kanten: kantenAus, platz: platzKnoten }, gruppen, verkehr: { knoten: knotenAus, kanten: vkKanten },
  };
  // Keine Bäume und Büsche auf Fahrbahn, Plätzen und Sportplätzen (Wunsch Nr. 53, 06.11.2026): die Wälder kommen aus dem Satellitenbild und kannten weder Straßen noch Fußballfelder. Stamm 1,2 m Abstand zur Kante
  { const P = freizeit?.plaetze || [], aufPlatz = (x, z) => { for (const q of P) { const dx = x - q.x, dz = z - q.z, s = Math.sin(q.ry), c = Math.cos(q.ry); if (Math.abs(dx * s + dz * c) < q.L / 2 + 1.5 && Math.abs(dx * c - dz * s) < q.B / 2 + 1.5) return true; } return false; }, aufBahn = (x, z) => strasseIdx.enthaelt(x, z) >= 0 || platzIdx.enthaelt(x, z) >= 0;
    daten.baeume = daten.baeume.filter(q => { const x = q[0], z = q[1]; return !aufBahn(x, z) && !aufBahn(x + 1.2, z) && !aufBahn(x - 1.2, z) && !aufBahn(x, z + 1.2) && !aufBahn(x, z - 1.2) && !aufPlatz(x, z); }); }
  // Werbeflächen (Wunsch Nr. 59, 06.11.2026, "überall ... an verschiedensten Stellen, auf Gebäude"). Grundlage ist ein festes Raster auf der Erde (rund 100 m, kit/werbeflaechen.js), nicht der Ort: jede Rasterzelle entscheidet aus ihrer eigenen Nummer, ob und welche Fläche sie trägt.
  // So hat dieselbe Stelle in jedem überlappenden Ort dieselbe Fläche und dieselbe Kennung, auch nach einem Neuladen, auch auf einem anderen Gerät. Bäume, Laternen und Stadtmöbel weichen ihr.
  { const WL = freizeit.werbung = [], fest = freizeit.fest ||= [], sperre = [], EU = ['mitte', 'nordsee', 'ost', 'skandi', 'sued', 'mittelmeer'].includes(reg.key), pb = EU ? 3.56 : 5, sIdx = new StreckenIndex(40), wahr = new Set();
    for (const s of linienMitBreite) { if (!/motorway|primary|secondary|tertiary|trunk|residential|living_street|unclassified/.test(s.hw) || (typeof brueckeLinie !== 'undefined' && brueckeLinie.has(s.f.linien[0]))) continue; for (const l of s.f.linien) for (let k = 1; k < l.length; k++) sIdx.add(l[k - 1], l[k], s); }
    const i0 = Math.ceil((lat - H / K_LAT) / WF_RASTER), i1 = Math.floor((lat + H / K_LAT) / WF_RASTER);
    for (let i = i0; i <= i1; i++) { const la0 = i * WF_RASTER, dlo = wfRasterLon(la0), j0 = Math.ceil((lon - H / K_LON) / dlo), j1 = Math.floor((lon + H / K_LON) / dlo); for (let j = j0; j <= j1; j++) {
      const R = rng(wfZelle(i, j)), la = la0 + (R() - 0.5) * WF_RASTER * 0.7, lo = j * dlo + (R() - 0.5) * dlo * 0.7, [px, pz] = xy(lo, la); if (!im(px, pz, 16) || inWahrzeichen(la, lo)) continue;
      const q = sIdx.naechste(px, pz, 48); if (!q) continue; const s = q.s.daten, hw = s.hw, autobahn = /motorway/.test(hw), gross = /primary|secondary|trunk/.test(hw), mittel = /tertiary/.test(hw), ex = q.s.b[0] - q.s.a[0], ez = q.s.b[1] - q.s.a[1], eL = Math.hypot(ex, ez) || 1, ux = ex / eL, uz = ez / eL; let nx = px - q.x, nz = pz - q.z; { const d = Math.hypot(nx, nz); if (d < 0.5) { nx = -uz; nz = ux; } else { nx /= d; nz /= d; } const seite = nx * -uz + nz * ux >= 0 ? 1 : -1; nx = -uz * seite; nz = ux * seite; }
      // Art aus der Rasterzelle und dem Rang der Straße
      const r = R(), T = autobahn ? [['plakat', 0.4]] : gross ? [['plakat', 0.17], ['litfass', EU ? 0.15 : 0.08], ['clp', 0.2], ['banner', 0.28], ['dach', 0.2]] : mittel ? [['plakat', 0.12], ['litfass', EU ? 0.14 : 0.07], ['clp', 0.16], ['banner', 0.16], ['dach', 0.1]] : [['plakat', 0.03], ['litfass', EU ? 0.08 : 0.03], ['clp', 0.05], ['banner', 0.05], ['dach', 0.03]]; let art = null, su = 0; for (const [a, w] of T) { su += w; if (r < su) { art = a; break; } } if (!art) continue;
      const key = wfCode(i, j), blickStr = Math.atan2(-nx, -nz);
      if (art === 'banner' || art === 'dach') { const t = fassaden.strahl(q.x, q.z, nx, nz, 44); if (t >= 44) continue; const hx = q.x + nx * t, hz = q.z + nz * t, w0 = fassaden.naechste(hx, hz, 1.2); if (!w0) continue; const ax = w0.s.a[0], az = w0.s.a[1], bx = w0.s.b[0], bz = w0.s.b[1], L = Math.hypot(bx - ax, bz - az); if (L < 7) continue; const wx = (bx - ax) / L, wz = (bz - az) / L; let fx = wz, fz = -wx; if ((q.x - hx) * fx + (q.z - hz) * fz < 0) { fx = -fx; fz = -fz; } if (fx * -nx + fz * -nz < 0.72) continue;
        const gi = hausIdx.enthaelt(hx - fx * 1.2, hz - fz * 1.2); if (gi < 0 || wahr.has(gi)) continue; const g = gebaeude[gi]; if (!g || g.m > 2 || g.b === 'roof' || g.b === 'carport' || g.h < 9) continue;
        const u = Math.max(0, Math.min(L, (hx - ax) * wx + (hz - az) * wz)), B = Math.min(L * 0.84, art === 'dach' ? 20 : 28), uc = Math.max(B / 2 + 0.5, Math.min(L - B / 2 - 0.5, u)), cx = ax + wx * uc, cz = az + wz * uc; if (!im(cx, cz, 10) || hausIdx.enthaelt(cx + fx * 1.6, cz + fz * 1.6) >= 0) continue; const ry = Math.round(Math.atan2(fx, fz) * 1000) / 1000;
        if (art === 'dach') { const fl = Math.abs(flaecheRing(g.p)); if (!(g.h > 17 || fl > 470) || g.h > 90 || B < 6) continue; const x = cx - fx * 3.6, z = cz - fz * 3.6; if (!innenRing(g.p, x, z)) continue; wahr.add(gi); WL.push(['dach', r2(x), r2(z), ry, r2(B), r2(B / 3), r2(g.h + 0.4), -1, key]); continue; }
        if (g.h < 11) continue; const hV = Math.min(g.h - 5.5, 30); if (hV < 4.5 || B < 5.5) continue; let b, h; if (B / hV >= 1.2) { h = Math.min(hV, B / 2); b = h * 2; } else { b = Math.min(B, hV / 1.45); h = b * 1.45; } wahr.add(gi); WL.push(['banner', r2(cx + fx * 1.05), r2(cz + fz * 1.05), ry, r2(b), r2(h), r2(4.4 + Math.max(0, (hV - h) * 0.45)), -1, key]); continue; }
      // Am Gehweg: hinter dem Bordstein, nie auf Fahrbahn, Wasser oder im Haus
      const ab = s.w / 2 + (art === 'plakat' ? (autobahn ? 7 : 1.5) : art === 'litfass' ? 1.3 : 1.05), x = q.x + nx * ab, z = q.z + nz * ab, platz = art === 'plakat' ? 2.2 : 1.1; if (!im(x, z, 6) || (!autobahn && laternFlaeche.enthaelt(x, z) < 0) || nahKreuzung(x, z, 6) || hausIdx.enthaelt(x, z) >= 0 || fassaden.naechste(x, z, platz) || wasserIdx.enthaelt(x, z) >= 0 || strasseIdx.enthaelt(x, z) >= 0) continue;
      const ry = art === 'plakat' ? blickStr + (R() < 0.5 ? 0.5 : -0.5) : art === 'clp' ? Math.atan2(ux, uz) : blickStr; const pb2 = autobahn ? 8 : pb; WL.push([art, r2(x), r2(z), Math.round(ry * 1000) / 1000, art === 'plakat' ? pb2 : art === 'clp' ? 1.19 : 3.9, art === 'plakat' ? r2(pb2 * 0.708) : art === 'clp' ? 1.75 : 2.4, 0, -1, key]); sperre.push([x, z, art === 'plakat' ? 2.6 : 1.5]);
      { const rf = art === 'litfass' ? 0.72 : art === 'plakat' ? 0.3 : 0.55; fest.push([[x - rf, z - rf], [x + rf, z - rf], [x + rf, z + rf], [x - rf, z + rf]]); } } }
    // Benannte Lagen: am Wahrzeichen nur als Eintrag (das Banner hängt am Modell), Großbildwände suchen sich einen freien Platz nahe der genannten Stelle
    WF_PREMIUM.forEach((P, i) => { const [px, pz] = xy(P.lon, P.lat); if (!im(px, pz, P.art === 'pylon' ? 8 : 0)) return; if (P.art !== 'pylon') { WL.push([P.art, r2(px), r2(pz), 0, P.b, P.h, 0, i, '']); return; }
      const frei2 = (x, z) => im(x, z, 8) && hausIdx.enthaelt(x, z) < 0 && !fassaden.naechste(x, z, 7) && [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([a, b]) => strasseIdx.enthaelt(x + a, z + b) < 0 && wasserIdx.enthaelt(x + a, z + b) < 0);
      let X = null, Z = null; for (let r = 0; r <= 110 && X === null; r += 6) for (let a = 0, n = r ? Math.ceil(r / 2.5) : 1; a < n; a++) { const w = a / n * 6.2832, x = px + Math.sin(w) * r, z = pz + Math.cos(w) * r; if (frei2(x, z)) { X = x; Z = z; break; } } if (X === null) return;
      const k = randIdx.naechste(X, Z, 70), ry = k ? Math.atan2(k.s.b[0] - k.s.a[0], k.s.b[1] - k.s.a[1]) : 0; WL.push(['pylon', r2(X), r2(Z), Math.round(ry * 1000) / 1000, P.b, P.h, 0, i, '']); fest.push([[X - 1.6, Z - 1.6], [X + 1.6, Z - 1.6], [X + 1.6, Z + 1.6], [X - 1.6, Z + 1.6]]); sperre.push([X, Z, 7.5]); });
    for (const q of freizeit.deko) if (q[2] === 'wartehaeuschen' || q[2] === 'kiosk' || q[2] === 'imbiss') sperre.push([q[0], q[1], 3.2]);   // auch hier wuchsen Bäume durchs Dach
    // Was auf einer Fläche stünde, weicht: Bäume, Laternen, Stadtmöbel, Kleinkram
    if (sperre.length) { const S2 = new Map(), kz = (x, z) => Math.floor(x / 16) * 65536 + Math.floor(z / 16); for (const q of sperre) { const k = kz(q[0], q[1]); (S2.get(k) || S2.set(k, []).get(k)).push(q); } const frei3 = (x, z) => { const a = Math.floor(x / 16), b = Math.floor(z / 16); for (let u = a - 1; u <= a + 1; u++) for (let v = b - 1; v <= b + 1; v++) { const L = S2.get(u * 65536 + v); if (L) for (const q of L) if (Math.hypot(q[0] - x, q[1] - z) < q[2]) return false; } return true; };
      daten.baeume = daten.baeume.filter(q => frei3(q[0], q[1])); daten.laternen = daten.laternen.filter(q => frei3(q[0], q[1])); daten.moebel = daten.moebel.filter(q => frei3(q[0], q[1])); freizeit.deko = freizeit.deko.filter(q => q[2] === 'wartehaeuschen' || q[2] === 'kiosk' || q[2] === 'imbiss' || frei3(q[0], q[1])); } }
  mark('fertig');
  return daten;
}
