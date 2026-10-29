// Baustile der Welt für das EARTH 3D GAME: zusätzliche Gebäudetypen im selben Detailgrad wie kit/buildings.js.
// Jeder Stil meldet sich mit registriereTyp an. STILE ist die Galerie für das Dashboard (Bereich "Baustile").
// Eintrag: { id, name, region, type, variant, pts: [[x, z], ...] in Metern, height, seed, ecken, info }
//
// Konventionen wie in buildings.js: Fassade u entlang der Wand, v Höhe, w nach außen, Laibungen im Wandmaterial,
// nichts schwebt, alles steht auf dem Boden oder auf einer Platte. Die Straßenseite ist die Kante, deren Normale
// am weitesten nach +z zeigt (im Spiel dreht die Stadt den Grundriss so, dass die Straße dort liegt).
// variant ist ein Text mit Schaltern, zum Beispiel "rosa minarett" oder "walm rot".
import * as THREE from 'three';
import { registriereTyp, Fassade, profilRing, dach, dachTechnik, fassadenRaster, teilung } from './buildings.js';
import { Bau, offsetRing, edgeNormal, inside, area } from './geo.js';

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = new THREE.Matrix4();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wahl = (R, a) => a[Math.min(a.length - 1, Math.floor(R() * a.length))];
const achsen = (L, b, rand = 0.8) => fassadenRaster(L, b, rand).mitten || [];
const schalter = v => new Set(String(v || '').split(/[\s,]+/).filter(Boolean));
const rechteckU = o => [[o.u0, o.v0], [o.u1, o.v0], [o.u1, o.v1], [o.u0, o.v1]];

// ---------------------------------------------------------------------------------------------
// Geometrie Helfer

// Dreieck, Wicklung zur gewünschten Normale
function dreieck(bau, key, a, b, c, want) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (n.lengthSq() < 1e-12) return;
  if (want && n.dot(want) < 0) { const t = b; b = c; c = t; n.negate(); }
  bau.tri(key, a, b, c, n.normalize());
}

// Dreieck mit eigenen Normalen je Ecke (weich schattiert, zum Beispiel Hohlziegel)
function dreieckN(bau, key, a, b, c, na, nb, nc) {
  const p = bau.part(key), g = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  if (g.lengthSq() < 1e-14) return;
  if (g.dot(V(na.x + nb.x + nc.x, na.y + nb.y + nc.y, na.z + nb.z + nc.z)) < 0) { let t = b; b = c; c = t; t = nb; nb = nc; nc = t; }
  for (const [v, n] of [[a, na], [b, nb], [c, nc]]) { p.pos.push(v.x, v.y, v.z); p.nor.push(n.x, n.y, n.z); p.uv.push(v.x * 0.5, v.y * 0.5); }
}

// Ebene Fläche in einer Fassade: Umriss und Löcher in (u, v), trianguliert (keine doppelten Endpunkte)
function flaeche(f, key, rand, loecher = [], w = 0, want = f.n) {
  const v2 = l => l.map(p => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(v2(rand), loecher.map(v2));
  const alle = rand.concat(...loecher);
  for (const t of tris) dreieck(f.bau, key, f.P(alle[t[0]][0], alle[t[0]][1], w), f.P(alle[t[1]][0], alle[t[1]][1], w), f.P(alle[t[2]][0], alle[t[2]][1], w), want);
}

// Wandband u0..u1, v0..v1 mit beliebigen Öffnungen (Umrisse in u, v)
function wand(f, key, u0, u1, v0, v1, umrisse = [], w = 0) {
  if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
  if (!umrisse.length) { f.wall(key, u0, u1, v0, v1, w); return; }
  flaeche(f, key, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], umrisse, w);
}

// Laibung entlang eines Umrisses (Flächen zeigen in die Öffnung hinein)
function laibung(f, key, umriss, tiefe, w0 = 0, ohneUnten = false) {
  const n = umriss.length; let cu = 0, cv = 0;
  for (const p of umriss) { cu += p[0]; cv += p[1]; }
  cu /= n; cv /= n;
  for (let i = 0; i < n; i++) {
    if (ohneUnten && i === 0) continue;
    const p = umriss[i], q = umriss[(i + 1) % n];
    let nu = -(q[1] - p[1]), nv = q[0] - p[0];
    if (nu * ((p[0] + q[0]) / 2 - cu) + nv * ((p[1] + q[1]) / 2 - cv) > 0) { nu = -nu; nv = -nv; }
    const want = f.r.clone().multiplyScalar(nu); want.y += nv;
    f.bau.face(key, f.P(p[0], p[1], w0), f.P(q[0], q[1], w0), f.P(q[0], q[1], w0 - tiefe), f.P(p[0], p[1], w0 - tiefe), want);
  }
}

// Außenkanten einer erhabenen Platte (Rechteck u0..u1, v0..v1 von w0 bis w1), Flächen zeigen nach außen
function plattenRand(f, key, u0, u1, v0, v1, w0, w1, unten = true) {
  const B = f.bau, rr = f.r.clone().negate();
  B.face(key, f.P(u0, v0, w0), f.P(u0, v1, w0), f.P(u0, v1, w1), f.P(u0, v0, w1), rr);
  B.face(key, f.P(u1, v0, w0), f.P(u1, v1, w0), f.P(u1, v1, w1), f.P(u1, v0, w1), f.r);
  B.face(key, f.P(u0, v1, w0), f.P(u1, v1, w0), f.P(u1, v1, w1), f.P(u0, v1, w1), UP);
  if (unten) B.face(key, f.P(u0, v0, w0), f.P(u1, v0, w0), f.P(u1, v0, w1), f.P(u0, v0, w1), DOWN);
}

// Umriss einer Bogenöffnung: Breite u0..u1, Fuß v0, Kämpfer vk. Arten: rund, hufeisen, spitz, zack (gelappt), flach
function bogenUmriss(u0, u1, v0, vk, art = 'rund', n = 10) {
  const m = (u0 + u1) / 2, b = (u1 - u0) / 2, out = [[u0, v0], [u1, v0]];
  if (art === 'hufeisen') {
    const r = b * 1.16, a0 = -Math.acos(b / r), vc = vk - r * Math.sin(a0);
    for (let i = 0; i <= n + 2; i++) { const a = a0 + (Math.PI - 2 * a0) * i / (n + 2); out.push([m + r * Math.cos(a), vc + r * Math.sin(a)]); }
  } else if (art === 'spitz' || art === 'zack') {
    const e = b * 0.55, Rr = b + e, amax = Math.acos(e / Rr), k = art === 'zack' ? 14 : n;
    const pts = [];
    for (let i = 0; i <= k; i++) { const a = amax * i / k; pts.push([m - e + Rr * Math.cos(a), vk + Rr * Math.sin(a)]); }
    const halb = pts.map(p => p.slice());
    if (art === 'zack') halb.forEach((p, i) => { const t = i / k, z = Math.abs(Math.sin(t * Math.PI * 3)) * b * 0.09; const du = m - p[0], dv = vk + b * 0.4 - p[1], l = Math.hypot(du, dv) || 1; p[0] += du / l * z; p[1] += dv / l * z; });
    out.push(...halb);
    for (let i = k - 1; i >= 0; i--) out.push([2 * m - halb[i][0], halb[i][1]]);
  } else if (art === 'flach') {
    const h = b * 0.32, r = (b * b + h * h) / (2 * h), vc = vk + h - r, a0 = Math.asin((vk - vc) / r);
    for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI - 2 * a0) * i / n; out.push([m + r * Math.cos(a), vc + r * Math.sin(a)]); }
  } else {
    for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; out.push([m + b * Math.cos(a), vk + b * Math.sin(a)]); }
  }
  // doppelte Punkte am Kämpfer entfernen
  return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-4);
}
const bogenScheitel = u => Math.max(...u.map(p => p[1]));
const bogenBreite = u => { const xs = u.map(p => p[0]); return [Math.min(...xs), Math.max(...xs)]; };

// Öffnung mit Laibung und Füllung in der Tiefe, optional Rahmen
function oeffnung(f, umriss, s = {}) {
  const d = s.tiefe ?? 0.25, w0 = s.w ?? 0;
  laibung(f, s.laibung || 'stein', umriss, d, w0);
  flaeche(f, s.fuellung || 'glas', umriss, [], w0 - d + 0.01);
  if (s.rahmen && !s.leicht) {
    const innen = offsetRing(umriss, -(s.rahmenBreite ?? 0.06));
    flaeche(f, s.rahmen, umriss, [innen], w0 - d + 0.05);
    laibung(f, s.rahmen, innen, 0.04, w0 - d + 0.05);
  }
}

// Balken entlang einer Strecke im Raum (Firste, Grate, Ortgang), b quer, h hoch, unten = Anteil unter der Linie
function stab(bau, key, A, B, b, h, unten = 0.35) {
  const d = B.clone().sub(A); if (d.lengthSq() < 1e-8) return; d.normalize();
  const side = new THREE.Vector3().crossVectors(d, UP); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const c = (P, sx, sy) => P.clone().addScaledVector(side, sx).addScaledVector(up, sy);
  const lo = -h * unten, hi = h * (1 - unten);
  bau.hexa(key, [c(A, -b / 2, lo), c(B, -b / 2, lo), c(B, b / 2, lo), c(A, b / 2, lo), c(A, -b / 2, hi), c(B, -b / 2, hi), c(B, b / 2, hi), c(A, b / 2, hi)]);
}

function zylinder(bau, key, x, y, z, r0, r1, h, n = 12) { bau.geo(key, new THREE.CylinderGeometry(r1, r0, h, n), M.makeTranslation(x, y + h / 2, z)); }
function kugel(bau, key, x, y, z, r, n = 10) { bau.geo(key, new THREE.SphereGeometry(r, n, Math.max(4, n - 3)), M.makeTranslation(x, y, z)); }

// Ausrichtung: Rahmen entlang einer Richtung (Standard längste Kante)
function rahmen(pts, dir) {
  if (!dir) {
    let best = 0;
    pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > best) { best = l; dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; } });
  }
  const ax = dir, az = [-ax[1], ax[0]];
  let u0 = 1e9, u1 = -1e9, t0 = 1e9, t1 = -1e9;
  for (const p of pts) { const u = p[0] * ax[0] + p[1] * ax[1], t = p[0] * az[0] + p[1] * az[1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  const L = u1 - u0, B = t1 - t0;
  return { ax, az, u0, u1, t0, t1, L, B, rechteck: pts.length === 4 && Math.abs(area(pts)) > L * B * 0.97, W: (u, t) => [ax[0] * u + az[0] * t, ax[1] * u + az[1] * t] };
}

// Straßenseite: Kante mit der Normale am weitesten nach +z (bei Gleichstand die längere)
let frontRichtung = null;   // echte Orte: Richtung zur Straße (Normale der Eingangskante), sonst +z
function frontKante(pts) {
  let best = -9, bi = 0; const fr = frontRichtung || [0, 1];
  pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], n = edgeNormal(a, b), l = Math.hypot(b[0] - a[0], b[1] - a[1]); const sc = n[0] * fr[0] + n[1] * fr[1] + Math.min(l, 30) * 0.003; if (l > 1.5 && sc > best) { best = sc; bi = i; } });
  return bi;
}
const kanten = (bau, pts) => pts.map((a, i) => new Fassade(bau, a, pts[(i + 1) % pts.length]));

// Grundriss vereinfachen: kurze Kanten (runde Ecken aus fase) fallen weg, die langen Kanten werden bis zum Schnittpunkt verlängert.
// Für innere Ringe, Dächer und die Aufteilung, damit Einrückungen an runden Ecken nicht umklappen.
function vereinfache(pts, minL = 1.0) {
  const n = pts.length, lang = [];
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= minL) lang.push([a, b]); }
  if (lang.length < 3 || lang.length === n) return pts;
  const out = [];
  for (let k = 0; k < lang.length; k++) {
    const [a, b] = lang[k], [c, d] = lang[(k + 1) % lang.length];
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-6) { out.push(b); continue; }
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
    out.push([a[0] + r[0] * t, a[1] + r[1] * t]);
  }
  return orientiere(out);
}

// Budget: über 40.000 Dreiecke baut der Typ noch einmal in der leichten Fassung. Die Zufallszahlen des ersten Laufs
// werden wiederholt, so bleibt gleicher Seed gleiches Haus.
const dreiecke = b => { let n = 0; for (const p of b.parts.values()) n += p.pos.length / 9; return n; };
function mitBudget(fn, grenze = 40000) {
  return (bau, pts, H, R, v, o) => {
    frontRichtung = o.front || null;
    const werte = [], probe = new Bau();
    let info = fn(probe, pts, H, () => { const x = R(); werte.push(x); return x; }, v, o), ziel = probe;
    if (!o.leicht && dreiecke(probe) > grenze) {
      let i = 0; ziel = new Bau();
      info = fn(ziel, pts, H, () => (i < werte.length ? werte[i++] : R()), v, { ...o, leicht: true });
    }
    for (const [k, p] of ziel.parts) bau.parts.set(k, p);
    return info;
  };
}
const stil = (name, fn, info) => registriereTyp(name, mitBudget(fn), info);
const orientiere = ring => area(ring) < 0 ? ring.slice().reverse() : ring;

// ---------------------------------------------------------------------------------------------
// Dächer

// Hohlziegel: halbrunde Rippe von A nach B auf der Dachfläche (weiche Normalen), Kappe an der Traufe
function hohlziegel(bau, key, A, B, quer, nrm, b, h) {
  const seg = 4, dir = B.clone().sub(A), bog = [];
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI * i / seg, x = -Math.cos(a) * b / 2, y = Math.sin(a) * h;
    bog.push({ p: A.clone().addScaledVector(quer, x).addScaledVector(nrm, y), n: quer.clone().multiplyScalar(-Math.cos(a)).addScaledVector(nrm, Math.sin(a) + 0.15).normalize() });
  }
  for (let i = 0; i < seg; i++) {
    const a0 = bog[i].p, a1 = bog[i + 1].p, b0 = a0.clone().add(dir), b1 = a1.clone().add(dir);
    dreieckN(bau, key, a0, b0, b1, bog[i].n, bog[i].n, bog[i + 1].n);
    dreieckN(bau, key, a0, b1, a1, bog[i].n, bog[i + 1].n, bog[i + 1].n);
  }
  const back = dir.clone().normalize().negate();
  for (let i = 1; i < seg - 1; i++) dreieck(bau, key, bog[0].p, bog[i].p, bog[i + 1].p, back);
  dreieck(bau, key, bog[0].p, bog[seg - 1].p, bog[seg].p, back);
}

// Eine Dachfläche: konvexes Polygon im Grundriss, Traufkante A nach B, Traufhöhe yT, Steigung tan.
// Oberseite dk über der Ebene, Unterseite in der Ebene. rillen: 'laengs' (Hohlziegel) oder 'quer' (Schindel, Schiefer, Blech)
function dachflaeche(bau, s, poly, A, B, yT, tan) {
  const dk = s.dicke ?? 0.14;
  const ex = B[0] - A[0], ez = B[1] - A[1], Le = Math.hypot(ex, ez); if (Le < 1e-4) return;
  const e = [ex / Le, ez / Le];
  let nIn = [-e[1], e[0]], cx = 0, cz = 0;
  poly.forEach(p => { cx += p[0]; cz += p[1]; }); cx /= poly.length; cz /= poly.length;
  if ((cx - A[0]) * nIn[0] + (cz - A[1]) * nIn[1] < 0) nIn = [-nIn[0], -nIn[1]];
  const nrm = V(-nIn[0] * tan, 1, -nIn[1] * tan).normalize();
  const loc = p => [(p[0] - A[0]) * e[0] + (p[1] - A[1]) * e[1], (p[0] - A[0]) * nIn[0] + (p[1] - A[1]) * nIn[1]];
  const pos = (sv, tv, hub = 0) => V(A[0] + e[0] * sv + nIn[0] * tv, yT + tv * tan + hub, A[1] + e[1] * sv + nIn[1] * tv);
  const lp = poly.map(loc);
  const top = lp.map(([a, b]) => pos(a, b, dk)), unt = lp.map(([a, b]) => pos(a, b, 0)), nu = nrm.clone().negate();
  for (let i = 1; i < lp.length - 1; i++) {
    dreieck(bau, s.key, top[0], top[i], top[i + 1], nrm);
    if (!s.ohneUnterseite) dreieck(bau, s.unterseite || s.key, unt[0], unt[i], unt[i + 1], nu);
  }
  if (s.leicht || !s.rillen) return;
  const sp = s.abstand ?? 0.3;
  const schnitt = (ach, c) => {
    const out = [];
    for (let i = 0; i < lp.length; i++) {
      const p = lp[i], q = lp[(i + 1) % lp.length], a = p[ach] - c, b = q[ach] - c;
      if ((a <= 0 && b > 0) || (a > 0 && b <= 0)) out.push(p[1 - ach] + (q[1 - ach] - p[1 - ach]) * (a / (a - b)));
    }
    return out.length >= 2 ? [Math.min(...out), Math.max(...out)] : null;
  };
  let s0 = Infinity, s1 = -Infinity, t1 = 0;
  lp.forEach(p => { s0 = Math.min(s0, p[0]); s1 = Math.max(s1, p[0]); t1 = Math.max(t1, p[1]); });
  const slope = pos(0, 1).sub(pos(0, 0)).normalize(), quer = V(e[0], 0, e[1]), key = s.rippe || s.key;
  if (s.rillen === 'laengs' || s.rillen === 'ziegel') {
    const n = Math.max(1, Math.round((s1 - s0) / sp));
    for (let k = 0; k < n; k++) {
      const sv = s0 + (k + 0.5) * (s1 - s0) / n, r = schnitt(0, sv);
      if (!r || r[1] - r[0] < 0.15) continue;
      hohlziegel(bau, key, pos(sv, r[0] + 0.01, dk), pos(sv, r[1] - 0.04, dk), quer, nrm, sp * 0.6, s.rippenHoehe ?? sp * 0.3);
    }
  }
  if (s.rillen === 'quer' || s.rillen === 'ziegel') {
    const h = s.kantenHoehe ?? (s.rillen === 'ziegel' ? 0.025 : 0.03), sq = s.rillen === 'ziegel' ? (s.reihe ?? 0.32) : sp;
    for (let tv = sq * 0.75; tv < t1 - 0.08; tv += sq) {
      const r = schnitt(1, tv); if (!r || r[1] - r[0] < 0.1) continue;
      const a = pos(r[0] + 0.01, tv, dk), b = pos(r[1] - 0.01, tv, dk);
      const a2 = a.clone().addScaledVector(nrm, h), b2 = b.clone().addScaledVector(nrm, h), w = sq * 0.42;
      bau.face(key, a, b, b2, a2, slope.clone().negate());
      bau.face(key, a2, b2, b.clone().addScaledVector(slope, w), a.clone().addScaledVector(slope, w), nrm);
    }
  }
}

// Größte sichere Einrücktiefe für ein Walmdach (der innere Ring darf nicht umklappen)
function sichereTiefe(pts) {
  const r = rahmen(pts); let d = r.B / 2 - 0.03;
  if (r.rechteck) return d;
  for (; d > 0.3; d -= 0.15) {
    const inn = offsetRing(pts, -d); let ok = area(inn) > 0;
    for (let i = 0; ok && i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      if ((pts[j][0] - pts[i][0]) * (inn[j][0] - inn[i][0]) + (pts[j][1] - pts[i][1]) * (inn[j][1] - inn[i][1]) < 0) ok = false;
    }
    if (ok) return d;
  }
  return 0.3;
}

// First entlang der oberen Fläche eines Walmdachs: schmaler Streifen ergibt eine Firstlinie, sonst Kanten rundherum
function firstLinien(bau, key, inn, y, b, h) {
  const r = rahmen(inn);
  if (r.B < 0.35) {
    if (r.L < 0.1) return null;
    const tm = (r.t0 + r.t1) / 2, A = r.W(r.u0, tm), B = r.W(r.u1, tm);
    stab(bau, key, V(A[0], y, A[1]), V(B[0], y, B[1]), b, h);
    return [V(A[0], y, A[1]), V(B[0], y, B[1])];
  }
  const fertig = [];
  inn.forEach((a, i) => {
    const c = inn[(i + 1) % inn.length]; if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 0.4) return;
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    if (fertig.some(q => Math.hypot(q[0] - m[0], q[1] - m[1]) < 0.4)) return;
    fertig.push(m); stab(bau, key, V(a[0], y, a[1]), V(c[0], y, c[1]), b, h);
  });
  return null;
}

// Walmdach für jeden Grundriss (bei Rechtecken mit Firstlinie)
function walmdach(bau, pts0, y0, s) {
  const pts = vereinfache(pts0);
  const tan = Math.tan(s.neigung ?? 0.5), ue = s.ueberstand ?? 0.6, dk = s.dicke ?? 0.14;
  const d = Math.min(s.maxTiefe ?? 1e9, sichereTiefe(pts));
  const aus = offsetRing(pts, ue), inn = offsetRing(pts, -d), n = pts.length;
  const yT = y0 - ue * tan, yF = y0 + d * tan;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; dachflaeche(bau, s, [aus[i], aus[j], inn[j], inn[i]], aus[i], aus[j], yT, tan); }
  if (Math.abs(area(inn)) > 0.05) bau.poly(s.key, inn, yF + dk);
  const fk = s.first || s.key, fb = s.firstBreite ?? 0.26, fh = s.firstHoehe ?? 0.2;
  for (let i = 0; i < n; i++) stab(bau, s.grat || fk, V(aus[i][0], yT + dk, aus[i][1]), V(inn[i][0], yF + dk, inn[i][1]), fb * 0.85, fh * 0.8);
  const firstEnden = firstLinien(bau, fk, inn, yF + dk, fb, fh);
  if (s.traufe !== false) profilRing(bau, s.traufe || s.key, pts, [[ue, -ue * tan - 0.07], [ue, -ue * tan + dk + 0.02]], y0);
  return { yF: yF + dk, inn, d, yT, firstEnden };
}

// Satteldach über einem Rechteck (sonst Walmdach). richtung: 'lang' (Standard), 'quer', 'front' (First parallel zur Straße), 'tiefe' (Giebel zur Straße)
function satteldach(bau, pts0, y0, s) {
  const pts = vereinfache(pts0), r0 = rahmen(pts);
  let dir = r0.ax;
  if (s.richtung === 'quer') dir = r0.az;
  else if (s.richtung === 'front' || s.richtung === 'tiefe') {
    const fi = frontKante(pts), a = pts[fi], b = pts[(fi + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), e = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    dir = s.richtung === 'front' ? e : [-e[1], e[0]];
  }
  const r = rahmen(pts, dir);
  if (!r.rechteck) return { ...walmdach(bau, pts, y0, s), giebel: [] };
  const tan = Math.tan(s.neigung ?? 0.6), ue = s.ueberstand ?? 0.5, ug = s.ortgang ?? 0.35, dk = s.dicke ?? 0.14;
  const hb = r.B / 2, tc = (r.t0 + r.t1) / 2, yR = y0 + hb * tan, yT = y0 - ue * tan;
  const W3 = (u, t, y) => { const p = r.W(u, t); return V(p[0], y, p[1]); };
  const a0 = r.u0 - ug, a1 = r.u1 + ug, ok = s.ortgangKey || s.traufe || s.key;
  for (const sg of [1, -1]) {
    const te = tc + sg * (hb + ue);
    dachflaeche(bau, s, [r.W(a0, te), r.W(a1, te), r.W(a1, tc), r.W(a0, tc)], r.W(a0, te), r.W(a1, te), yT, tan);
    for (const a of [a0, a1]) stab(bau, ok, W3(a, te, yT + dk), W3(a, tc, yR + dk), 0.09, s.ortgangHoehe ?? 0.3, 0.78);
    if (s.traufe !== false) stab(bau, s.traufe || s.key, W3(a0, te, yT + dk * 0.5), W3(a1, te, yT + dk * 0.5), 0.07, dk + 0.12, 0.5);
  }
  const fA = W3(a0 - 0.02, tc, yR + dk), fB = W3(a1 + 0.02, tc, yR + dk);
  stab(bau, s.first || s.key, fA, fB, s.firstBreite ?? 0.26, s.firstHoehe ?? 0.22);
  const giebel = [];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % 4], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(((b[0] - a[0]) * dir[0] + (b[1] - a[1]) * dir[1]) / l) > 0.2) return;
    const f = new Fassade(bau, a, b); giebel.push(f);
    const loch = s.giebelLoch ? s.giebelLoch(f, y0, yR) : [];
    flaeche(f, s.giebelKey || s.wand || 'putz', [[0, y0], [f.L, y0], [f.L / 2, yR]], loch);
    if (s.giebelDeko) s.giebelDeko(f, y0, yR);
  });
  return { yF: yR + dk, yR, yT, giebel, r, tan, hb, firstEnden: [fA, fB] };
}

// Pultdach an einer Fassade (Vordach, Hisashi, Ladendach): Traufe in Tiefe tiefe auf Höhe v, steigt zur Wand um hoch
function vordach(f, u0, u1, v, tiefe, hoch, s) {
  const Pw = (u, w) => { const p = f.P(u, 0, w); return [p.x, p.z]; };
  const tan = hoch / tiefe, dk = s.dicke ?? 0.1;
  dachflaeche(f.bau, { ...s, dicke: dk }, [Pw(u0, tiefe), Pw(u1, tiefe), Pw(u1, 0), Pw(u0, 0)], Pw(u0, tiefe), Pw(u1, tiefe), v, tan);
  for (const u of [u0, u1]) stab(f.bau, s.ortgangKey || s.traufe || s.key, f.P(u, v + dk, tiefe), f.P(u, v + hoch + dk, 0), 0.06, dk + 0.1, 0.8);
  if (s.traufe !== false) f.box(s.traufe || s.key, u0, u1, v - 0.06, v + dk + 0.02, tiefe - 0.05, tiefe + 0.02);
}

// Traufband rundherum (glasierte Ziegel unter der Brüstung, japanisches Mokoshi): Traufe auf Höhe y, Tiefe ue
function traufband(bau, pts, y, ue, tan, s) {
  const aus = offsetRing(pts, ue);
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; dachflaeche(bau, s, [aus[i], aus[j], pts[j], pts[i]], aus[i], aus[j], y, tan); }
  const dk = s.dicke ?? 0.12;
  profilRing(bau, s.traufe || s.key, pts, [[ue, -0.06], [ue, dk + 0.02]], y);
  for (let i = 0; i < pts.length; i++) stab(bau, s.key, V(aus[i][0], y + dk, aus[i][1]), V(pts[i][0], y + ue * tan + dk, pts[i][1]), 0.14, 0.1);
}

// Brüstung mit Kappe, darauf gestufte Zinnen (Marokko) oder Dreieckszinnen (Golf)
function zinnen(f, y, dicke, s) {
  const sp = s.abstand ?? 0.8, n = Math.floor((f.L - 0.3) / sp); if (n < 1) return;
  const rand = (f.L - n * sp) / 2;
  for (let k = 0; k < n; k++) {
    const m = rand + (k + 0.5) * sp, b = sp * 0.55;
    if (s.art === 'dreieck') {
      const B = f.bau, a = f.P(m - b / 2, y, 0), c = f.P(m + b / 2, y, 0), t = f.P(m, y + b * 0.8, 0), a2 = f.P(m - b / 2, y, -dicke), c2 = f.P(m + b / 2, y, -dicke), t2 = f.P(m, y + b * 0.8, -dicke);
      dreieck(B, s.key, a, c, t, f.n); dreieck(B, s.key, a2, c2, t2, f.n.clone().negate());
      B.face(s.key, a, t, t2, a2, f.r.clone().negate().add(UP)); B.face(s.key, c, t, t2, c2, f.r.clone().add(UP));
    } else {
      const h = s.hoehe ?? 0.42;
      f.box(s.key, m - b / 2, m + b / 2, y, y + h, -dicke, 0, { unten: true });
      f.box(s.key, m - b * 0.32, m + b * 0.32, y + h, y + h * 1.45, -dicke + 0.04, -0.04, { unten: true });
      if (!s.leicht) f.box(s.key, m - b * 0.14, m + b * 0.14, y + h * 1.45, y + h * 1.75, -dicke + 0.08, -0.08, { unten: true });
    }
  }
}

// Brüstung um ein Flachdach mit optionalem Hof (Loch im Dach). Gibt den inneren Ring zurück.
function flachdach(bau, pts, H, wandKey, hoehe, dicke, kappe, hof = null, bodenKey = 'dach') {
  profilRing(bau, wandKey, pts, [[0, 0], [0, hoehe]], H);
  profilRing(bau, kappe, pts, [[0.03, hoehe], [0.03, hoehe + 0.06], [-dicke - 0.03, hoehe + 0.06], [-dicke - 0.03, hoehe]], H);
  const innen = offsetRing(pts, -dicke);
  profilRing(bau, wandKey, innen, [[0, hoehe], [0, 0]], H);
  if (!hof) { bau.poly(bodenKey, innen, H + 0.02); return innen; }
  const hr = hof.slice().reverse();   // Hofwände zeigen in den Hof
  profilRing(bau, wandKey, hr, [[0, 0], [0, hoehe]], H);
  profilRing(bau, kappe, hr, [[0.03, hoehe], [0.03, hoehe + 0.06], [-dicke - 0.03, hoehe + 0.06], [-dicke - 0.03, hoehe]], H);
  const hofAussen = offsetRing(hof, dicke);
  profilRing(bau, wandKey, offsetRing(hr, -dicke), [[0, hoehe], [0, 0]], H);
  const v2 = l => l.map(p => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(v2(innen), [v2(hofAussen)]), alle = innen.concat(hofAussen);
  for (const t of tris) dreieck(bau, bodenKey, V(alle[t[0]][0], H + 0.02, alle[t[0]][1]), V(alle[t[1]][0], H + 0.02, alle[t[1]][1]), V(alle[t[2]][0], H + 0.02, alle[t[2]][1]), UP);
  return innen;
}

// Freie Plätze auf einem Flachdach (nicht im Hof, nicht im Turm, Abstand zum Rand)
function dachPlaetze(innen, sperre, R, anzahl, r) {
  const rr = rahmen(innen), out = [];
  for (let t = 0; t < anzahl * 30 && out.length < anzahl; t++) {
    const p = rr.W(rr.u0 + R() * rr.L, rr.t0 + R() * rr.B);
    if (!inside(innen, p[0], p[1])) continue;
    let ok = true;
    for (let i = 0; i < innen.length && ok; i++) { const a = innen[i], b = innen[(i + 1) % innen.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, k = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2, 0, 1); if (Math.hypot(a[0] + dx * k - p[0], a[1] + dz * k - p[1]) < r + 0.3) ok = false; }
    if (ok && sperre.some(s => s(p[0], p[1], r))) ok = false;
    if (ok && out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < r * 2 + 0.5)) ok = false;
    if (ok) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fassadenteile

// Eisengitter vor einer Öffnung (ganz), verankert in der Wand
function gitter(f, o, abst = 0.12, key = 'rahmenDunkel') {
  for (const v of [o.v0 + 0.1, (o.v0 + o.v1) / 2, o.v1 - 0.1]) f.box(key, o.u0 - 0.06, o.u1 + 0.06, v - 0.015, v + 0.015, 0, 0.055);
  const n = Math.max(2, Math.round((o.u1 - o.u0) / abst));
  for (let k = 1; k < n; k++) { const u = o.u0 + (o.u1 - o.u0) * k / n; f.box(key, u - 0.012, u + 0.012, o.v0, o.v1, 0.018, 0.042); }
}

// Holzgitter Erker (Maschrabiya): Kasten vor der Wand mit dunkler Rückwand und feinem Gitter, optional auf Konsolen mit Dach
function mashrabiya(f, u0, u1, v0, v1, s = {}) {
  const t = s.tiefe ?? 0.42, H = s.holz || 'holzDunkel', sp = s.raster ?? 0.1;
  f.box(H, u0 - 0.06, u1 + 0.06, v0 - 0.14, v0, 0, t + 0.07);
  f.box(H, u0 - 0.08, u1 + 0.08, v1, v1 + 0.16, 0, t + 0.1);
  f.wall('schiefer', u0, u1, v0, v1, t - 0.05);
  f.bau.face('schiefer', f.P(u0, v0, 0), f.P(u0, v0, t - 0.05), f.P(u0, v1, t - 0.05), f.P(u0, v1, 0), f.r.clone().negate());
  f.bau.face('schiefer', f.P(u1, v0, 0), f.P(u1, v0, t - 0.05), f.P(u1, v1, t - 0.05), f.P(u1, v1, 0), f.r);
  f.box(H, u0 - 0.05, u0, v0, v1, 0, t); f.box(H, u1, u1 + 0.05, v0, v1, 0, t);
  if (s.leicht) return;
  const nu = Math.max(2, Math.round((u1 - u0) / sp)), nv = Math.max(2, Math.round((v1 - v0) / sp));
  for (let k = 1; k < nu; k++) { const u = u0 + (u1 - u0) * k / nu; f.leiste(H, u - 0.014, u + 0.014, v0, v1, t - 0.05, t - 0.01); }
  for (let k = 1; k < nv; k++) { const v = v0 + (v1 - v0) * k / nv; f.leiste(H, u0, u1, v - 0.014, v + 0.014, t - 0.05, t - 0.01, true); }
  const mitte = (v0 + v1) / 2; f.box(H, u0, u1, mitte - 0.03, mitte + 0.03, t - 0.06, t + 0.01);
  for (const u of [u0 - 0.025, u1 + 0.025]) for (const v of [v0 + (v1 - v0) * 0.33, v0 + (v1 - v0) * 0.66]) {   // Seitengitter
    const B = f.bau, rr = u < u0 ? f.r.clone().negate() : f.r;
    B.face(H, f.P(u, v - 0.015, 0.02), f.P(u, v - 0.015, t - 0.04), f.P(u, v + 0.015, t - 0.04), f.P(u, v + 0.015, 0.02), rr);
  }
}

// Konsolen unter einem Erker oder Balkon: gestufte Holz oder Steinklötze
function konsolen(f, u0, u1, v, tiefe, key, anzahl) {
  const n = anzahl ?? Math.max(2, Math.round((u1 - u0) / 0.7) + 1);
  for (let k = 0; k < n; k++) {
    const u = u0 + (u1 - u0) * (n === 1 ? 0.5 : k / (n - 1));
    f.box(key, u - 0.07, u + 0.07, v - 0.18, v, 0, tiefe);
    f.box(key, u - 0.06, u + 0.06, v - 0.36, v - 0.18, 0, tiefe * 0.6);
    f.box(key, u - 0.05, u + 0.05, v - 0.5, v - 0.36, 0, tiefe * 0.3);
  }
}

// Fensterläden links und rechts einer Öffnung, mit Lamellen
function fensterlaeden(f, o, key, leicht) {
  const b = (o.u1 - o.u0) / 2;
  for (const [a, c] of [[o.u0 - b - 0.02, o.u0 - 0.02], [o.u1 + 0.02, o.u1 + b + 0.02]]) {
    f.box(key, a, c, o.v0, o.v1, 0, 0.04);
    if (leicht) continue;
    for (let v = o.v0 + 0.1; v < o.v1 - 0.08; v += 0.09) f.leiste(key, a + 0.04, c - 0.04, v - 0.012, v + 0.012, 0.04, 0.055, true);
  }
}

// Klimagerät an der Wand auf Konsolen
function klimageraet(f, u, v, key = 'technik') {
  f.box(key, u - 0.42, u + 0.42, v, v + 0.58, 0.04, 0.34);
  f.box('technikDunkel', u - 0.3, u + 0.15, v + 0.08, v + 0.5, 0.34, 0.35);
  for (const x of [u - 0.32, u + 0.32]) f.box('rahmenDunkel', x - 0.02, x + 0.02, v - 0.06, v, 0, 0.36);
}

// Band rund ums Haus (Sockel, Gesims, Balken): jede Fassade verlängert sich am Ende u = L um ihre Tiefe, so deckt genau eine die Ecke
function umlauf(f, key, v0, v1, w0, w1) { f.box(key, 0, f.L + w1, v0, v1, w0, w1); }

// ---------------------------------------------------------------------------------------------
// 1 Marokko: Riad Haus der Medina, optional mit Minarett

stil('riad', (bau, pts, H, R, v, o) => {
  const op = schalter(v);
  const W = op.has('ocker') ? 'putzOcker' : op.has('rosa') ? 'putzRosa' : op.has('terrakotta') ? 'putzTerrakotta' : wahl(R, ['putzOcker', 'putzTerrakotta', 'putzRosa']);
  const tuerKey = op.has('gruen') ? 'gruenTuer' : wahl(R, ['holzDunkel', 'gruenTuer', 'blauTuer']);
  const fH = 3.3, N = clamp(Math.round(H / fH), 1, 4), top = N * fH, PH = 1.0, dicke = 0.35;
  const r = rahmen(vereinfache(pts)), fi = frontKante(pts);
  // Minarett an der hinteren Ecke, 0,35 m vor den Wänden (keine gemeinsamen Flächen)
  let turm = null;
  if (op.has('minarett')) {
    const s = clamp(Math.min(r.L, r.B) * 0.32, 3.4, 5.2), p = 0.35;
    const ecken = [[r.u0, r.t0], [r.u1, r.t0], [r.u1, r.t1], [r.u0, r.t1]];
    let best = null; ecken.forEach(([u, t]) => { const w = r.W(u, t), sc = w[1] + w[0] * 0.5; if (!best || sc < best.sc) best = { u, t, sc }; });
    const su = best.u === r.u0 ? 1 : -1, st = best.t === r.t0 ? 1 : -1;
    const ua = best.u - su * p, ub = best.u + su * (s - p), ta = best.t - st * p, tb = best.t + st * (s - p);
    const ring = orientiere([r.W(ua, ta), r.W(ub, ta), r.W(ub, tb), r.W(ua, tb)]);
    turm = { s, ring, gross: offsetRing(ring, 0.25), H: Math.max(top * 2.5, top + 13) };
  }
  // Innenhof mit Brunnen, wenn der Grundriss groß genug ist
  let hof = null;
  if (!op.has('ohnehof') && r.rechteck && Math.min(r.L, r.B) >= 11) {
    const k = clamp(Math.min(r.L, r.B) * 0.3, turm ? turm.s + 0.3 : 3.2, 5.5);
    if (Math.min(r.L, r.B) - 2 * k >= 3.5 && pts.length === 4) hof = offsetRing(pts, -k);
  }
  const imTurm = (f, u0, u1) => turm && [u0, (u0 + u1) / 2, u1].some(u => { const p = f.P(u, 1, 0.05); return inside(turm.gross, p.x, p.z); });

  const fassade = (f, vorne, hofSeite) => {
    if (f.L < 1.2) { f.wall(W, 0, f.L, 0, top); return; }
    // Erdgeschoss: Tür (Straßenseite), kleine vergitterte Fenster, Sockel
    const ops = [], deko = [];
    let tuerU = null;
    if (vorne && f.L > 3) {
      tuerU = clamp(f.L * (0.35 + R() * 0.3), 1.6, f.L - 1.6);
      if (imTurm(f, tuerU - 1.2, tuerU + 1.2)) tuerU = f.L - tuerU;
      if (imTurm(f, tuerU - 1.2, tuerU + 1.2)) tuerU = null;
    }
    if (tuerU !== null) {
      const b = 0.65, um = bogenUmriss(tuerU - b, tuerU + b, 0.03, 1.95, 'hufeisen', 12);
      ops.push(um); deko.push(() => {
        const [ua, ub] = bogenBreite(um), sch = bogenScheitel(um), ru = ua - 0.32, rv = ub + 0.32, rt = sch + 0.32;
        flaeche(f, 'zellige', [[ru, 0], [rv, 0], [rv, rt], [ru, rt]], [um], 0.05);
        plattenRand(f, 'zellige', ru, rv, 0, rt, 0, 0.05, false);
        f.box(W, ru - 0.08, rv + 0.08, rt, rt + 0.1, 0, 0.09);
        laibung(f, W, um, 0.47, 0.05, true);
        flaeche(f, tuerKey, um, [], -0.41);
        f.box(tuerKey === 'holzDunkel' ? 'rahmenDunkel' : 'holzDunkel', tuerU - 0.025, tuerU + 0.025, 0.03, 1.95 + 0.6, -0.41, -0.38);
        if (!o.leicht) for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) for (const sg of [-1, 1]) f.box('metall', tuerU + sg * (0.16 + i * 0.16) - 0.02, tuerU + sg * (0.16 + i * 0.16) + 0.02, 0.35 + j * 0.38, 0.39 + j * 0.38, -0.41, -0.385);
        f.box('metall', tuerU + 0.12, tuerU + 0.16, 1.05, 1.25, -0.41, -0.36);   // Klopfer
        vordach(f, ru - 0.15, rv + 0.15, rt + 0.22, 0.6, 0.32, { key: 'ziegelGruen', rillen: 'laengs', abstand: 0.22, leicht: o.leicht, traufe: 'holzDunkel', unterseite: 'holzDunkel' });
        konsolen(f, ru - 0.05, rv + 0.05, rt + 0.2, 0.5, 'holzDunkel', 3);
      });
    }
    achsen(f.L, 3.0, 1.0).forEach(m => {
      if (tuerU !== null && Math.abs(m - tuerU) < 1.6) return;
      if (R() < 0.45 || imTurm(f, m - 0.5, m + 0.5)) return;
      const ow = { u0: m - 0.3, u1: m + 0.3, v0: 1.95, v1: 2.7 };
      ops.push(rechteckU(ow));
      deko.push(() => { f.fenster(ow, { tiefe: 0.3, laibung: W, ohneRahmen: true, glasKey: 'glasDunkel', flach: o.leicht }); if (!o.leicht) gitter(f, ow, 0.1); });
    });
    wand(f, W, 0, f.L, 0, fH, ops);
    deko.forEach(d => d());
    // Sockel aus dunklerem Lehmputz, an der Tür unterbrochen
    const sockel = tuerU === null ? [[0, f.L]] : [[0, tuerU - 0.95], [tuerU + 0.95, f.L]];
    sockel.forEach(([a, b]) => { if (b - a > 0.05) f.box('lehm', a, b, 0, 0.55, 0, 0.04, { unten: true }); });
    // Obergeschosse: wenige kleine Fenster, Maschrabiya, Läden oder Gitter
    let erker = vorne && N >= 2 && f.L >= 7 && !op.has('ohneerker');
    for (let k = 1; k < N; k++) {
      const vv = k * fH, ops2 = [], deko2 = [];
      if (erker && k === 1) {
        let m = tuerU !== null ? (tuerU < f.L / 2 ? tuerU + 2.6 : tuerU - 2.6) : f.L / 2;
        m = clamp(m, 1.4, f.L - 1.4);
        if (!imTurm(f, m - 1.2, m + 1.2)) deko2.push(() => {
          mashrabiya(f, m - 0.85, m + 0.85, vv + 0.55, vv + 2.35, { tiefe: 0.7, raster: 0.11, leicht: o.leicht });
          konsolen(f, m - 0.85, m + 0.85, vv + 0.41, 0.66, 'holzDunkel', 3);
          vordach(f, m - 1.05, m + 1.05, vv + 2.48, 0.92, 0.38, { key: 'ziegelGruen', rillen: 'laengs', abstand: 0.22, leicht: o.leicht, traufe: 'holzDunkel', unterseite: 'holzDunkel' });
        });
        erker = { m };
      }
      achsen(f.L, 2.7, 1.0).forEach(m => {
        if (erker && erker.m !== undefined && k === 1 && Math.abs(m - erker.m) < 1.9) return;
        if (tuerU !== null && k === 1 && Math.abs(m - tuerU) < 1.1) return;
        if (R() < 0.42 || imTurm(f, m - 0.6, m + 0.6)) return;
        const ow = { u0: m - 0.36, u1: m + 0.36, v0: vv + 0.95, v1: vv + 2.05 }, art = R();
        if (art < 0.32) { deko2.push(() => mashrabiya(f, ow.u0 - 0.1, ow.u1 + 0.1, ow.v0 - 0.05, ow.v1 + 0.1, { leicht: o.leicht })); return; }
        ops2.push(rechteckU(ow));
        deko2.push(() => {
          f.fenster(ow, { tiefe: 0.3, laibung: W, rahmen: 'holzDunkel', glasKey: 'glasDunkel', kaempfer: true, flach: o.leicht, ohneRahmen: o.leicht });
          if (art < 0.66) fensterlaeden(f, ow, tuerKey === 'holzDunkel' ? 'gruenTuer' : tuerKey, o.leicht); else if (!o.leicht) gitter(f, ow, 0.11);
        });
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops2);
      deko2.forEach(d => d());
    }
    // Ziegelband und Holzkonsolen unter der Brüstung
    if (!hofSeite) for (let u = 0.45; u < f.L - 0.3; u += 0.62) if (!imTurm(f, u - 0.1, u + 0.1)) f.box('holzDunkel', u - 0.05, u + 0.05, top - 0.72, top - 0.52, 0, 0.5);
  };

  kanten(bau, pts).forEach((f, i) => fassade(f, i === fi, false));
  traufband(bau, pts, top - 0.52, 0.62, 0.62, { key: 'ziegelGruen', rillen: 'laengs', abstand: 0.24, leicht: o.leicht, traufe: 'holzDunkel', unterseite: 'holzDunkel', dicke: 0.1 });
  const innen = flachdach(bau, pts, top, W, PH, dicke, W, hof, 'bodenTerrakotta');
  kanten(bau, pts).forEach(f => zinnen(f, top + PH + 0.06, dicke, { key: W, abstand: 0.78, leicht: o.leicht }));

  if (hof) {
    const hr = hof.slice().reverse();
    kanten(bau, hr).forEach(f => {
      // Hofseite: Erdgeschoss mit großen Hufeisenbögen (Holztüren mit Glas), oben Maschrabiya
      const ops = [], deko = [];
      achsen(f.L, 2.6, 0.9).forEach(m => {
        const um = bogenUmriss(m - 0.7, m + 0.7, 0.03, 1.9, R() < 0.5 ? 'hufeisen' : 'zack', 12);
        ops.push(um);
        deko.push(() => oeffnung(f, um, { tiefe: 0.35, laibung: W, fuellung: 'holzHell' }));
      });
      wand(f, W, 0, f.L, 0, fH, ops.filter(u => bogenScheitel(u) < fH - 0.05));
      deko.forEach(d => d());
      // Zellige Sockel zwischen den Bögen
      let prev = 0;
      [...ops.map(bogenBreite), [f.L + 0.05, f.L + 0.05]].forEach(([a, b]) => { if (a - 0.05 - prev > 0.1) f.box('zellige', prev, a - 0.05, 0, 0.85, 0, 0.025, { unten: true }); prev = b + 0.05; });
      for (let k = 1; k < N; k++) {
        const vv = k * fH; f.wall(W, 0, f.L, vv, vv + fH);
        achsen(f.L, 2.6, 0.9).forEach(m => { if (R() < 0.75) mashrabiya(f, m - 0.5, m + 0.5, vv + 0.7, vv + 2.1, { leicht: o.leicht, tiefe: 0.35 }); });
      }
      zinnen(f, top + PH + 0.06, dicke, { key: W, abstand: 0.78, leicht: o.leicht });
    });
    traufband(bau, hr, top - 0.5, 0.55, 0.6, { key: 'ziegelGruen', rillen: 'laengs', abstand: 0.24, leicht: o.leicht, traufe: 'holzDunkel', unterseite: 'holzDunkel', dicke: 0.1 });
    // Hofboden aus Zellige, Brunnen, Orangenbäume
    bau.poly('zellige', hof, 0.03);
    const hc = hof.reduce((a, p) => [a[0] + p[0] / hof.length, a[1] + p[1] / hof.length], [0, 0]);
    zylinder(bau, 'zellige', hc[0], 0.03, hc[1], 1.05, 1.0, 0.45, 8);
    zylinder(bau, 'wasser', hc[0], 0.03, hc[1], 0.88, 0.88, 0.44, 8);
    zylinder(bau, 'kalk', hc[0], 0.47, hc[1], 0.16, 0.12, 0.55, 10);
    zylinder(bau, 'zellige', hc[0], 1.02, hc[1], 0.1, 0.38, 0.14, 10);
    const hr2 = rahmen(hof);
    [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].forEach(([a, b]) => {
      const p = hr2.W(hr2.u0 + hr2.L * a, hr2.t0 + hr2.B * b);
      if (Math.hypot(p[0] - hc[0], p[1] - hc[1]) < 1.7) return;
      zylinder(bau, 'bodenTerrakotta', p[0], 0.03, p[1], 0.45, 0.45, 0.3, 8);
      zylinder(bau, 'holzDunkel', p[0], 0.3, p[1], 0.09, 0.07, 1.3, 6);
      bau.geo('pflanze', new THREE.IcosahedronGeometry(0.85, 1), M.makeTranslation(p[0], 2.15, p[1]));
    });
  }

  // Dachterrasse: Treppenhaus mit Zinnen, Satellitenschüssel, Wassertank
  const sperre = [(x, z, rr) => hof && (inside(offsetRing(hof, 0.6 + rr), x, z)), (x, z, rr) => turm && inside(offsetRing(turm.ring, 0.4 + rr), x, z)];
  const plaetze = dachPlaetze(innen, sperre, R, 3, 1.3);
  if (plaetze[0]) {
    const [x, z] = plaetze[0];
    const tp = [[-1.1, -1.2], [1.1, -1.2], [1.1, 1.2], [-1.1, 1.2]].map(([a, b]) => [x + a * r.ax[0] + b * r.az[0], z + a * r.ax[1] + b * r.az[1]]);
    const ring = orientiere(tp);
    kanten(bau, ring).forEach((f, i) => { f.wall(W, 0, f.L, top, top + 2.5); if (i === 0) { f.wall(tuerKey, f.L / 2 - 0.45, f.L / 2 + 0.45, top + 0.02, top + 2.0, 0.02); } });
    bau.poly(W, ring, top + 2.5);
    kanten(bau, ring).forEach(f => zinnen(f, top + 2.5, 0.25, { key: W, abstand: 0.7, hoehe: 0.3, leicht: true }));
  }
  if (plaetze[1]) {
    const [x, z] = plaetze[1];
    zylinder(bau, 'metall', x, top, z, 0.04, 0.04, 1.2, 6);
    const g = new THREE.CylinderGeometry(0.55, 0.42, 0.1, 14); g.rotateX(-1.0);
    bau.geo('weiss', g, M.makeTranslation(x, top + 1.3, z - 0.15));
  }
  if (plaetze[2]) { const [x, z] = plaetze[2]; zylinder(bau, 'weiss', x, top, z, 0.5, 0.5, 1.1, 12); }

  // Minarett
  if (turm) {
    const T = turm.H;
    kanten(bau, turm.ring).forEach((f, i) => {
      const L = f.L, ops = [], deko = [];
      // Schlitzfenster unten, zwei Blendbögen und Sebka Gitter oben, Zellige Band
      const vS = top + 1.2;
      [top * 0.45, vS + 0.4].forEach(v0 => { const o2 = { u0: L / 2 - 0.16, u1: L / 2 + 0.16, v0, v1: v0 + 0.9 }; ops.push(rechteckU(o2)); deko.push(() => f.fenster(o2, { tiefe: 0.4, laibung: W, ohneRahmen: true, glasKey: 'schiefer', flach: o.leicht })); });
      const pa = 0.5, pb = L - 0.5, pv0 = vS + 2.0, pv1 = T - 3.2;
      if (pv1 - pv0 > 4) {
        const bm = pv0 + (pv1 - pv0) * 0.42;
        [[pa + 0.2, L / 2 - 0.25], [L / 2 + 0.25, pb - 0.2]].forEach(([a, b]) => { const um = bogenUmriss(a, b, pv0, bm, i % 2 ? 'zack' : 'hufeisen', 10); ops.push(um); deko.push(() => oeffnung(f, um, { tiefe: 0.35, laibung: W, fuellung: 'schiefer' })); });
        deko.push(() => {   // Sebka: Rautennetz als Relief
          const v0 = bm + (pb - pa) * 0.42, v1 = pv1, sp = (pb - pa) / 3, h = v1 - v0;
          f.box(W, pa - 0.1, pb + 0.1, v0 - 0.12, v0, 0, 0.08); f.box(W, pa - 0.1, pb + 0.1, v1, v1 + 0.12, 0, 0.08);
          f.box(W, pa - 0.1, pa, v0, v1, 0, 0.08); f.box(W, pb, pb + 0.1, v0, v1, 0, 0.08);
          if (o.leicht) return;
          for (let k = -6; k <= 6; k++) for (const sg of [1, -1]) {
            let ua = pa + k * sp, va = v0, ub = ua + sg * h * 0.5, vb = v1;
            const lim = (u, vv, ux, vx) => { if (u < pa) { const t = (pa - u) / (ux - u); return [pa, vv + (vx - vv) * t]; } if (u > pb) { const t = (u - pb) / (u - ux); return [pb, vv + (vx - vv) * t]; } return [u, vv]; };
            if ((ua < pa && ub < pa) || (ua > pb && ub > pb)) continue;
            [ua, va] = lim(ua, va, ub, vb); [ub, vb] = lim(ub, vb, ua, va);
            if (Math.hypot(ub - ua, vb - va) < 0.3) continue;
            stab(bau, W, f.P(ua, va, 0.04), f.P(ub, vb, 0.04), 0.08, 0.09, 0.5);
          }
        });
      }
      wand(f, W, 0, L, 0, T, ops);
      deko.forEach(d => d());
      f.box('zellige', 0.0, L, T - 1.6, T - 0.7, 0, 0.04, { unten: true });
      f.box(W, -0.06, L + 0.06, T - 0.7, T - 0.5, 0, 0.12);
    });
    const tIn = flachdach(bau, turm.ring, T, W, 0.9, 0.3, W, null, 'bodenTerrakotta');
    kanten(bau, turm.ring).forEach(f => zinnen(f, T + 0.96, 0.3, { key: W, abstand: Math.min(0.85, f.L / 5), hoehe: 0.45, leicht: o.leicht }));
    // Laterne mit Bogenfenster, Zellige, grünem Pyramidendach und drei goldenen Kugeln
    const lr = offsetRing(turm.ring, -turm.s * 0.29), LH = 3.4;
    kanten(bau, lr).forEach(f => {
      const um = bogenUmriss(f.L / 2 - 0.35, f.L / 2 + 0.35, T + 0.4, T + 1.6, 'hufeisen', 10);
      wand(f, W, 0, f.L, T, T + LH, [um]);
      oeffnung(f, um, { tiefe: 0.3, laibung: W, fuellung: 'schiefer' });
      f.box('zellige', 0, f.L, T + LH - 0.9, T + LH - 0.35, 0, 0.03, { unten: true });
      f.box(W, -0.05, f.L + 0.05, T + LH - 0.35, T + LH - 0.2, 0, 0.1);
    });
    const dInfo = walmdach(bau, lr, T + LH, { key: 'ziegelGruen', rillen: 'laengs', abstand: 0.2, neigung: 0.95, ueberstand: 0.25, dicke: 0.08, first: 'ziegelGruen', firstBreite: 0.14, firstHoehe: 0.12, traufe: 'holzDunkel', leicht: o.leicht });
    const lc = lr.reduce((a, p) => [a[0] + p[0] / lr.length, a[1] + p[1] / lr.length], [0, 0]);
    zylinder(bau, 'gold', lc[0], dInfo.yF - 0.1, lc[1], 0.04, 0.04, 2.1, 6);
    [[0.32, 0.6], [0.25, 1.15], [0.18, 1.6]].forEach(([rr, y]) => kugel(bau, 'gold', lc[0], dInfo.yF + y, lc[1], rr, 10));
    return { floors: N, top: dInfo.yF + 1.9 };
  }
  return { floors: N, top: top + PH + 0.8 };
}, 'Riad Haus der Medina: Putz in Ocker, Terrakotta oder Rosa, wenige kleine Fenster mit Gittern, Läden und Maschrabiya, Hufeisenbogen mit Zellige Rahmen und grünem Ziegeldach, glasierte grüne Ziegeltraufe auf Holzkonsolen, gestufte Zinnen, Dachterrasse, bei großem Grundriss Innenhof mit Brunnen und Orangenbäumen');

// ---------------------------------------------------------------------------------------------
// 3 Japan traditionell: Machiya mit Holzgittern, weißen Wänden, Hisashi und dunklem Ziegeldach

stil('machiya', (bau, pts, H, R, v, o) => {
  const op = schalter(v), walm = op.has('walm');
  const N = H > 6 ? 2 : 1, g1 = 3.1, g2 = 2.6, top = N === 2 ? g1 + g2 : g1 + 0.5;
  const fi = frontKante(pts), gk = op.has('rot') ? 'holzRot' : 'holzDunkel', HD = 'holzDunkel';
  const fs = kanten(bau, pts);
  fs.forEach((f, i) => {
    const vorne = i === fi, ps = teilung(f.L, 1.82);
    // Steinsockel
    umlauf(f, 'granit', 0, 0.3, vorne ? -0.32 : 0, 0.07);
    if (vorne) {
      // zurückgesetzte Erdgeschossfront: Holzgitter (Koshi) vor Papier, Eingang mit Noren
      f.wall(HD, 0, f.L, 0.3, g1, -0.32);
      f.bau.face('holzHell', f.P(0, g1, 0), f.P(f.L, g1, 0), f.P(f.L, g1, -0.32), f.P(0, g1, -0.32), DOWN);
      const ein = Math.max(1, Math.floor((ps.length - 1) / 2));
      for (let k = 0; k < ps.length - 1; k++) {
        const a = ps[k] + 0.08, b = ps[k + 1] - 0.08;
        f.box(gk, a, b, g1 - 0.42, g1 - 0.28, -0.32, -0.16);
        if (k === ein) {
          f.wall('glas', a, b, 0.3, g1 - 0.42, -0.3);
          for (const u of [a + 0.03, (a + b) / 2, b - 0.03]) f.box(gk, u - 0.03, u + 0.03, 0.3, g1 - 0.42, -0.3, -0.25);
          f.box(gk, a, b, 1.1, 1.15, -0.3, -0.26);
          const nb = (b - a) / 3;
          for (let j = 0; j < 3; j++) f.box('noren', a + j * nb + 0.02, a + (j + 1) * nb - 0.02, g1 - 1.25, g1 - 0.45, -0.12, -0.1);
          f.box(gk, a - 0.05, b + 0.05, g1 - 0.45, g1 - 0.4, -0.13, -0.08);
        } else {
          f.wall('papier', a, b, 0.75, g1 - 0.42, -0.3);
          f.box(gk, a, b, 0.3, 0.75, -0.32, -0.2);
          if (o.leicht) { f.wall(gk, a, b, 0.75, g1 - 0.42, -0.2); continue; }
          const n = Math.round((b - a) / 0.085);
          for (let j = 0; j <= n; j++) { const u = a + (b - a) * j / n; f.leiste(gk, u - 0.019, u + 0.019, 0.75, g1 - 0.42, -0.29, -0.2); }
          f.box(gk, a, b, 1.55, 1.6, -0.3, -0.18);
        }
      }
      ps.forEach((u, k) => f.box(HD, k === 0 ? -0.07 : u - 0.09, k === ps.length - 1 ? f.L + 0.07 : u + 0.09, 0.3, g1, -0.32, 0.07));
      umlauf(f, HD, g1 - 0.28, g1 + 0.08, -0.32, 0.07);
    } else {
      // Seiten und Rückseite: schwarze Bretter (Yakisugi), wenige Gitterfenster
      const ops = [], deko = [];
      achsen(f.L, 3.6, 1.2).forEach(m => {
        if (R() < 0.5) return;
        const ow = { u0: m - 0.45, u1: m + 0.45, v0: 1.2, v1: 2.2 }; ops.push(rechteckU(ow));
        deko.push(() => { f.fenster(ow, { tiefe: 0.15, laibung: HD, ohneRahmen: true, glasKey: 'papier' }); if (!o.leicht) for (let u = ow.u0 + 0.09; u < ow.u1 - 0.04; u += 0.09) f.box(gk, u - 0.018, u + 0.018, ow.v0, ow.v1, 0, 0.04); f.box(gk, ow.u0 - 0.05, ow.u1 + 0.05, ow.v0 - 0.05, ow.v0, 0, 0.06); f.box(gk, ow.u0 - 0.05, ow.u1 + 0.05, ow.v1, ow.v1 + 0.05, 0, 0.06); });
      });
      wand(f, 'brettSchwarz', 0, f.L, 0.3, g1, ops);
      deko.forEach(d => d());
      ps.forEach(u => f.box(HD, Math.max(0, u - 0.08), Math.min(f.L, u + 0.08), 0.3, g1, 0, 0.04));
      umlauf(f, HD, g1 - 0.18, g1 + 0.06, 0, 0.05);
    }
    // Obergeschoss: weißer Lehmputz, dunkle Pfosten, Mushiko Fenster (vorne) oder kleine Gitterfenster
    const oben = N === 2 ? [g1, top] : [g1, top];
    const ops = [], deko = [];
    if (N === 2) {
      if (vorne && f.L > 3.5) {
        const n = f.L > 7 ? 2 : 1;
        for (let j = 0; j < n; j++) {
          const m = f.L * (j + 1) / (n + 1), wB = Math.min(1.6, f.L / (n + 1) - 0.5), ow = { u0: m - wB / 2, u1: m + wB / 2, v0: g1 + 0.95, v1: g1 + 1.8 };
          ops.push(rechteckU(ow));
          deko.push(() => { laibung(f, 'kalk', rechteckU(ow), 0.14); f.wall('schiefer', ow.u0, ow.u1, ow.v0, ow.v1, -0.13); for (let u = ow.u0 + 0.1; u < ow.u1 - 0.05; u += 0.16) f.box('kalk', u - 0.045, u + 0.045, ow.v0, ow.v1, -0.13, -0.01); });
        }
      } else if (f.L > 3) achsen(f.L, 3.6, 1.2).forEach(m => {
        if (R() < 0.5) return;
        const ow = { u0: m - 0.4, u1: m + 0.4, v0: g1 + 0.9, v1: g1 + 1.75 }; ops.push(rechteckU(ow));
        deko.push(() => { f.fenster(ow, { tiefe: 0.12, laibung: 'kalk', ohneRahmen: true, glasKey: 'papier' }); if (!o.leicht) for (let u = ow.u0 + 0.1; u < ow.u1 - 0.05; u += 0.1) f.box(gk, u - 0.018, u + 0.018, ow.v0, ow.v1, 0, 0.035); });
      });
    }
    wand(f, 'kalk', 0, f.L, oben[0], oben[1], ops);
    deko.forEach(d => d());
    ps.forEach(u => f.box(HD, Math.max(0, u - 0.08), Math.min(f.L, u + 0.08), oben[0], oben[1], 0, 0.035));
    umlauf(f, HD, oben[1] - 0.24, oben[1], 0, 0.045);
    if (N === 2) umlauf(f, HD, g1 + 0.6, g1 + 0.72, 0, 0.04);
  });
  // Hisashi: Pultdach zwischen den Geschossen an Straßen und Rückseite, Sparren darunter
  if (N === 2) fs.forEach((f, i) => {
    if (i !== fi && Math.abs(f.n.dot(fs[fi].n) + 1) > 0.05) return;
    const t = 0.9, hy = g1 + 0.58, tanH = Math.tan(0.42);
    vordach(f, 0, f.L, hy - t * tanH, t, t * tanH, { key: 'kawara', rillen: 'ziegel', abstand: 0.26, leicht: o.leicht, traufe: HD, unterseite: 'holzHell', dicke: 0.12 });
    if (!o.leicht) for (let u = 0.25; u < f.L - 0.1; u += 0.45) stab(bau, HD, f.P(u, hy - 0.02, 0), f.P(u, hy - t * tanH - 0.02, t - 0.06), 0.06, 0.09, 1);
  });
  // Hauptdach: Kawara mit Hohlziegeln, schwerer First mit weißer Linie, Onigawara an den Enden
  const sd = { key: 'kawara', rillen: 'ziegel', abstand: 0.27, neigung: 0.47, ueberstand: 0.95, ortgang: 0.6, dicke: 0.16, first: 'kawara', firstBreite: 0.38, firstHoehe: 0.42, traufe: HD, unterseite: 'holzHell', wand: 'kalk', richtung: 'front', leicht: o.leicht,
    giebelDeko: (f, y0, yR) => {
      const h = yR - y0; f.box(HD, f.L / 2 - 0.08, f.L / 2 + 0.08, y0, yR - 0.15, 0, 0.04);
      const hy = h * 0.4, hw = f.L / 2 * (1 - hy / h) - 0.12; f.box(HD, f.L / 2 - hw, f.L / 2 + hw, y0 + hy, y0 + hy + 0.16, 0, 0.04);
      f.box(HD, 0.05, f.L - 0.05, y0 - 0.02, y0 + 0.18, 0, 0.05);
    } };
  const d = walm ? walmdach(bau, pts, top, sd) : satteldach(bau, pts, top, sd);
  if (d.firstEnden) {
    const [A, B] = d.firstEnden;
    stab(bau, 'kalk', A, B, 0.42, 0.12, 0.6);
    for (const P of [A, B]) {
      const dir = (P === A ? A.clone().sub(B) : B.clone().sub(A)).normalize().multiplyScalar(0.12);
      stab(bau, 'kawara', P.clone().sub(dir), P.clone().add(dir), 0.56, 0.5, 0.25);
    }
  }
  return { floors: N, top: d.yF + 0.4 };
}, 'Machiya: zurückgesetzte Erdgeschossfront mit dichten Holzgittern vor Papier, Eingang mit Noren, Hisashi Vordach mit Hohlziegeln und Sparren, Obergeschoss aus weißem Lehmputz mit Mushiko Fenstern und Holzpfosten, Kawara Dach mit schwerem First und Onigawara');

// ---------------------------------------------------------------------------------------------
// Weitere Helfer für die übrigen Stile

// Rechteck vor Ort: a entlang der Straßenseite (0..L), s von der Straße nach hinten (0..B)
function vorOrt(pts0) {
  const pts = vereinfache(pts0), fi = frontKante(pts), a = pts[fi], b = pts[(fi + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const e = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], nf = edgeNormal(a, b), r = rahmen(pts, e);
  const vorn = nf[0] * r.az[0] + nf[1] * r.az[1] > 0 ? r.t1 : r.t0, sg = vorn === r.t1 ? -1 : 1;
  const P = (aa, ss) => r.W(r.u0 + aa, vorn + sg * ss);
  return { ...r, fi, nf, P, ring: (a0, a1, s0, s1) => orientiere([P(a0, s0), P(a1, s0), P(a1, s1), P(a0, s1)]), vorne: f => f.n.x * nf[0] + f.n.z * nf[1] > 0.9 };
}

// Quader als Ring mit Wänden und Deckel (Schornstein, Treppenhaus, Tank)
function kiste(bau, key, ring, y0, y1, deckel = key) {
  profilRing(bau, key, ring, [[0, 0], [0, y1 - y0]], y0);
  if (deckel) bau.poly(deckel, ring, y1);
}
function quadrat(cx, cz, ax, a, b = a) {
  const az = [-ax[1], ax[0]];
  return orientiere([[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, t]) => [cx + u * ax[0] + t * az[0], cz + u * ax[1] + t * az[1]]));
}
function schornstein(bau, cx, cz, ax, y0, y1, key = 'ziegel', a = 0.45, b = 0.32) {
  kiste(bau, key, quadrat(cx, cz, ax, a, b), y0, y1);
  kiste(bau, 'beton', quadrat(cx, cz, ax, a + 0.06, b + 0.06), y1, y1 + 0.12);
  zylinder(bau, 'technikDunkel', cx, y1 + 0.12, cz, 0.1, 0.1, 0.35, 8);
}

// Stange (Rohr, Geländer, Holzbalken) als Zylinder von A nach B
function stange(bau, key, A, B, r, n = 6) {
  const d = B.clone().sub(A), L = d.length(); if (L < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  bau.geo(key, new THREE.CylinderGeometry(r, r, L, n, 1, false), new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

// Schild als Box mit eigener UV (Textur genau einmal je Fläche): senkrecht zur Fassade oder quer als Band
function schild(bau, key, f, u0, u1, v0, v1, w0, w1, quer = false) {
  const g = new THREE.BoxGeometry(u1 - u0, v1 - v0, w1 - w0);
  if (quer) {   // Band: Textur um 90 Grad gedreht und entlang der Länge wiederholt
    const uv = g.attributes.uv, rep = Math.max(1, Math.round((u1 - u0) / ((v1 - v0) * 4)));
    for (let i = 0; i < uv.count; i++) { const x = uv.getX(i), y = uv.getY(i); uv.setXY(i, y, x * rep); }
  }
  const m = new THREE.Matrix4().makeBasis(f.r, UP, f.n).setPosition(f.P((u0 + u1) / 2, (v0 + v1) / 2, (w0 + w1) / 2));
  bau.geo(key, g, m);
}

// Geländer: Handlauf, Fußleiste und Stäbe zwischen u0 und u1 in Tiefe w
function gelaender(f, key, u0, u1, v0, h, w, abst = 0.12, leicht = false) {
  f.box(key, u0, u1, v0 + h - 0.05, v0 + h, w - 0.03, w + 0.03);
  f.box(key, u0, u1, v0 + 0.08, v0 + 0.12, w - 0.02, w + 0.02);
  if (leicht) { f.wall('glasGelaender', u0, u1, v0 + 0.12, v0 + h - 0.05, w); return; }
  const n = Math.max(1, Math.round((u1 - u0) / abst));
  for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n; f.box(key, u - 0.012, u + 0.012, v0 + 0.12, v0 + h - 0.05, w - 0.012, w + 0.012); }
}

// Gerundete Brüstung (Kykladen, Sahel) mit Dachboden
function rundBruestung(bau, key, pts, y, h = 0.75, d = 0.3, boden = key) {
  const r = d / 2, prof = [[0, 0], [0, h - r]];
  for (let i = 1; i < 6; i++) { const a = Math.PI * i / 6; prof.push([-r + r * Math.cos(a), h - r + r * Math.sin(a)]); }
  prof.push([-d, h - r], [-d, 0]);
  profilRing(bau, key, pts, prof, y);
  const inn = offsetRing(pts, -d); bau.poly(boden, inn, y + 0.02);
  return inn;
}

// Tonne entlang u (Gewölbe, Bangaldar Dach): Mitte wc in der Tiefe, Kämpfer vc, Radius R, flach skaliert die Höhe
function tonne(f, key, u0, u1, wc, vc, R, flach = 1, n = 8) {
  const B = f.bau, ring = [];
  for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; ring.push({ w: wc + R * Math.cos(a), v: vc + R * flach * Math.sin(a), n: f.n.clone().multiplyScalar(Math.cos(a) * flach).addScaledVector(UP, Math.sin(a)).normalize() }); }
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[i + 1];
    dreieckN(B, key, f.P(u0, p.v, p.w), f.P(u1, p.v, p.w), f.P(u1, q.v, q.w), p.n, p.n, q.n);
    dreieckN(B, key, f.P(u0, p.v, p.w), f.P(u1, q.v, q.w), f.P(u0, q.v, q.w), p.n, q.n, q.n);
  }
  for (const [u, nn] of [[u0, f.r.clone().negate()], [u1, f.r]]) for (let i = 0; i < n; i++) dreieck(B, key, f.P(u, vc, wc), f.P(u, ring[i].v, ring[i].w), f.P(u, ring[i + 1].v, ring[i + 1].w), nn);
}

// Kuppel (Halbkugel) mit Spitze
function kuppel(bau, key, x, y, z, r, hoch = 1, spitze = null) {
  const g = new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, hoch, 1);
  bau.geo(key, g, M.makeTranslation(x, y, z));
  if (spitze) { zylinder(bau, spitze, x, y + r * hoch - 0.02, z, 0.03, 0.03, 0.35, 6); kugel(bau, spitze, x, y + r * hoch + 0.38, z, 0.08, 8); }
}

// Loggia: Bogenreihe in der Fassade mit Raum dahinter (Rückwand mit Türen, Boden, Decke, Seiten), optional Brüstung
function loggia(f, u0, u1, v0, h, W, s = {}) {
  const T = s.tiefe ?? 1.8, d = s.wand ?? 0.35, n = Math.max(2, Math.round((u1 - u0) / (s.feld ?? 2.3))), bw = (u1 - u0) / n, pf = s.pfeiler ?? 0.4;
  const holes = [];
  for (let k = 0; k < n; k++) {
    const a = u0 + k * bw + pf / 2, b = u0 + (k + 1) * bw - pf / 2, vk = v0 + Math.min(h * 0.55, h - (b - a) * 0.95 - 0.25);
    holes.push(bogenUmriss(a, b, v0 + 0.03, vk, s.art || 'spitz', 10));
  }
  wand(f, W, 0, f.L, v0, v0 + h, holes);
  holes.forEach(um => laibung(f, W, um, d, 0, false));
  const dk = Math.max(...holes.map(bogenScheitel)) + 0.08;
  f.wall(W, u0 + 0.02, u1 - 0.02, v0, dk, -T);
  f.bau.face(s.boden || 'bodenTerrakotta', f.P(u0, v0 + 0.03, -d), f.P(u1, v0 + 0.03, -d), f.P(u1, v0 + 0.03, -T), f.P(u0, v0 + 0.03, -T), UP);
  f.bau.face(s.decke || 'holzDunkel', f.P(u0, dk, -d), f.P(u1, dk, -d), f.P(u1, dk, -T), f.P(u0, dk, -T), DOWN);
  f.bau.face(W, f.P(u0 + 0.02, v0, -d), f.P(u0 + 0.02, dk, -d), f.P(u0 + 0.02, dk, -T), f.P(u0 + 0.02, v0, -T), f.r);
  f.bau.face(W, f.P(u1 - 0.02, v0, -d), f.P(u1 - 0.02, dk, -d), f.P(u1 - 0.02, dk, -T), f.P(u1 - 0.02, v0, -T), f.r.clone().negate());
  for (let k = 0; k < n; k++) {   // Türen in der Rückwand, Balken unter der Decke
    const m = u0 + (k + 0.5) * bw;
    f.box(s.tuer || 'holzDunkel', m - 0.5, m + 0.5, v0 + 0.03, v0 + 2.3, -T, -T + 0.06);
    if (!s.leicht) for (let x = u0 + 0.4; x < u1 - 0.2; x += 0.6) f.box('holzDunkel', x - 0.05, x + 0.05, dk - 0.14, dk, -T, -d);
  }
  if (s.bruestung) holes.forEach(um => { const [a, b] = bogenBreite(um); gelaender(f, s.bruestung, a + 0.02, b - 0.02, v0, 0.95, -0.12, 0.1, s.leicht); });
  return holes;
}

// Lobby: zurückgesetztes Glas auf dem inneren Ring (richtige Ecken bei jedem Grundriss), Untersicht, Eckstützen und Pfosten
function lobbyRing(bau, pts, gH, t, stuetze, glas = 'glasDunkel') {
  profilRing(bau, glas, pts, [[-t, 0], [-t, gH]], 0);
  profilRing(bau, stuetze, pts, [[-t, gH], [0, gH]], 0);
  kanten(bau, offsetRing(pts, -t)).forEach(f => teilung(f.L, 1.5).forEach(u => f.leiste('rahmenDunkel', Math.max(0, u - 0.03), Math.min(f.L, u + 0.03), 0, gH, 0, 0.07)));
  kanten(bau, pts).forEach(f => {
    f.box(stuetze, f.L - 0.55, f.L, 0, gH, -0.55, 0);
    teilung(f.L, 6.5).forEach((u, i, a) => { if (i > 0 && i < a.length - 1) f.box(stuetze, u - 0.3, u + 0.3, 0, gH, -t + 0.15, -0.05); });
  });
}

// Fenster Helfer: Fenster mit weißem Rahmen, Sprossen, Faschen (Nordamerika, Skandinavien)
function sprossenFenster(f, ow, s = {}) {
  const R2 = s.rahmen || 'lack', d = s.tiefe ?? 0.12;
  f.fenster(ow, { tiefe: d, laibung: s.laibung || R2, rahmen: R2, rahmenBreite: 0.06, faschen: s.faschen === false ? null : (s.faschen || R2), bank: true, bankKey: R2, flach: s.leicht, ohneRahmen: s.leicht });
  if (s.leicht) return;
  const w0 = -d + 0.02, w1 = -d + 0.05, vm = s.mitte ?? (ow.v0 + ow.v1) / 2;
  f.box(R2, ow.u0, ow.u1, vm - 0.03, vm + 0.03, w0, w1 + 0.01);
  const nu = s.spalten ?? 2, nv = s.zeilen ?? 1;
  for (let k = 1; k < nu; k++) { const u = ow.u0 + (ow.u1 - ow.u0) * k / nu; f.box(R2, u - 0.014, u + 0.014, ow.v0, ow.v1, w0, w1); }
  for (const [a, b] of [[ow.v0, vm], [vm, ow.v1]]) for (let k = 1; k <= nv; k++) { const v = a + (b - a) * k / (nv + 1); f.box(R2, ow.u0, ow.u1, v - 0.014, v + 0.014, w0, w1); }
}

// ---------------------------------------------------------------------------------------------
// 2 Arabischer Golf: traditionell (Windturm, Loggia, Maschrabiya) und modern (Gitterschirme vor Glas)

function windturm(bau, cx, cz, ax, s, yB, W, leicht) {
  const ring = quadrat(cx, cz, ax, s / 2), hu = 2.2, ho = 2.8, yo = yB + hu, yc = yo + ho;
  const fs = kanten(bau, ring);
  fs.forEach(f => {
    f.wall(W, 0, f.L, yB, yo);
    f.box(W, f.L - 0.32, f.L, yo, yc, -0.32, 0);
    for (const m of [f.L / 3, 2 * f.L / 3]) f.box(W, m - 0.07, m + 0.07, yo, yc, -0.22, 0);
    f.box(W, -0.04, f.L + 0.04, yo - 0.14, yo, 0, 0.06);
    for (const u of [f.L * 0.25, f.L * 0.75]) for (const y of [yo - 0.55, yc + 0.22]) stange(bau, 'holzDunkel', f.P(u, y, -0.2), f.P(u, y, 0.42), 0.045, 6);
  });
  bau.poly('schiefer', ring, yo + 0.01);
  const c = ring;
  stab(bau, W, V(c[0][0], yo, c[0][1]), V(c[2][0], yo, c[2][1]), 0.1, ho, 0);
  stab(bau, W, V(c[1][0], yo, c[1][1]), V(c[3][0], yo, c[3][1]), 0.1, ho, 0);
  const cap = offsetRing(ring, 0.08);
  profilRing(bau, W, cap, [[0, 0], [0, 0.42]], yc);
  bau.poly(W, cap, yc + 0.42); bau.poly(W, cap, yc, true);
  kanten(bau, cap).forEach(f => zinnen(f, yc + 0.42, 0.16, { key: W, art: 'dreieck', abstand: 0.42, leicht }));
  return yc + 0.42;
}

function golfAlt(bau, pts, H, R, op, o) {
  const W = op.has('weiss') ? 'kalk' : 'putzGolf', fH = 3.5, N = clamp(Math.round(H / fH), 1, 3), top = N * fH, PH = 0.9, dicke = 0.3;
  const fi = frontKante(pts), r = rahmen(pts);
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi;
    umlauf(f, 'sandsteinGelb', 0, 0.45, 0, 0.04);
    for (let k = 0; k < N; k++) {
      const vv = k * fH;
      if (vorne && k === N - 1 && N >= 2 && f.L >= 8) {
        const a = clamp(f.L * 0.18, 1.2, 3), holes = loggia(f, a, f.L - a, vv, fH, W, { art: 'spitz', tiefe: 2.0, feld: 2.2, bruestung: 'holzDunkel', leicht: o.leicht, tuer: 'holzDunkel' });
        continue;
      }
      const ax = achsen(f.L, k === 0 ? 3.0 : 2.6, 1.0), ops = [], deko = [], mitte = Math.floor(ax.length / 2);
      ax.forEach((m, j) => {
        if (k === 0 && vorne && j === mitte) {
          const um = bogenUmriss(m - 0.7, m + 0.7, 0.03, 2.05, 'spitz', 10); ops.push(um);
          deko.push(() => {
            laibung(f, W, um, 0.45, 0, true); flaeche(f, 'holzDunkel', um, [], -0.44);
            f.box('rahmenDunkel', m - 0.02, m + 0.02, 0.03, 2.6, -0.44, -0.4);
            if (!o.leicht) for (let y = 0.4; y < 2.3; y += 0.35) for (const sg of [-1, 1]) for (const x of [0.2, 0.45]) f.box('metall', m + sg * x - 0.025, m + sg * x + 0.025, y, y + 0.05, -0.44, -0.415);
            const [x0, x1] = bogenBreite(um), sch = bogenScheitel(um);
            flaeche(f, 'sandsteinGelb', [[x0 - 0.22, 0], [x1 + 0.22, 0], [x1 + 0.22, sch + 0.2], [x0 - 0.22, sch + 0.2]], [um], 0.05);
            plattenRand(f, 'sandsteinGelb', x0 - 0.22, x1 + 0.22, 0, sch + 0.2, 0, 0.05, false);
          });
          return;
        }
        if (k === 0) {
          if (j % 2) {   // flache Spitzbogennische mit Lüftungsdreiecken
            const um = bogenUmriss(m - 0.42, m + 0.42, 0.7, 2.3, 'spitz', 8); ops.push(um);
            deko.push(() => oeffnung(f, um, { tiefe: 0.14, laibung: W, fuellung: W }));
          } else {
            const ow = { u0: m - 0.35, u1: m + 0.35, v0: 1.4, v1: 2.4 }; ops.push(rechteckU(ow));
            deko.push(() => { f.fenster(ow, { tiefe: 0.3, laibung: W, ohneRahmen: true, glasKey: 'holzDunkel', flach: o.leicht }); if (!o.leicht) gitter(f, ow, 0.11); });
          }
          return;
        }
        if (R() < 0.38) { deko.push(() => { mashrabiya(f, m - 0.6, m + 0.6, vv + 0.75, vv + 2.5, { tiefe: 0.55, leicht: o.leicht }); konsolen(f, m - 0.6, m + 0.6, vv + 0.61, 0.5, 'holzDunkel', 2); }); return; }
        const ow = { u0: m - 0.45, u1: m + 0.45, v0: vv + 0.9, v1: vv + 2.3 }; ops.push(rechteckU(ow));
        const tri = [[m - 0.38, vv + 2.55], [m - 0.16, vv + 2.55], [m - 0.27, vv + 2.85]], tri2 = tri.map(([x, y]) => [x + 0.54, y]), tri3 = tri.map(([x, y]) => [x + 0.27, y]);
        ops.push(tri, tri2, tri3);
        deko.push(() => { f.fenster(ow, { tiefe: 0.3, laibung: W, rahmen: 'holzDunkel', kaempfer: true, glasKey: 'glasDunkel', flach: o.leicht, ohneRahmen: o.leicht }); fensterlaeden(f, ow, 'holzDunkel', o.leicht); [tri, tri2, tri3].forEach(t => oeffnung(f, t, { tiefe: 0.2, laibung: W, fuellung: 'schiefer' })); });
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
      if (k > 0) umlauf(f, W, vv - 0.1, vv + 0.08, 0, 0.07);
    }
  });
  const innen = flachdach(bau, pts, top, W, PH, dicke, W);
  kanten(bau, pts).forEach(f => zinnen(f, top + PH + 0.06, dicke, { key: W, art: 'dreieck', abstand: 0.55, leicht: o.leicht }));
  const plaetze = dachPlaetze(innen, [], R, r.L > 13 ? 2 : 1, 1.9);
  let hoch = top + PH;
  plaetze.forEach(([x, z]) => { hoch = Math.max(hoch, windturm(bau, x, z, r.ax, 2.8, top, W, o.leicht)); });
  return { floors: N, top: hoch + 0.3 };
}

function golfModern(bau, pts, H, R, op, o) {
  const W = 'weiss', S = 'putzGolf', gH = 4.4, fH = 3.4, N = Math.max(2, Math.round((H - gH) / fH)), top = gH + N * fH;
  const fi = frontKante(pts), r = rahmen(pts);
  if (!o.ohneLaden) lobbyRing(bau, pts, gH, 1.6, S);
  kanten(bau, pts).forEach((f, i) => {
    if (o.ohneLaden) f.wall(S, 0, f.L, 0, gH);
    const bays = teilung(f.L, 2.7);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, ops = [], deko = [];
      for (let j = 0; j < bays.length - 1; j++) {
        const a = bays[j], b = bays[j + 1], m = (a + b) / 2, schirm = (j + k + (i % 2)) % 2 === 0 && b - a > 1.6;
        if (schirm) {
          const ow = { u0: a + 0.15, u1: b - 0.15, v0: vv + 0.1, v1: vv + fH - 0.25 }; ops.push(rechteckU(ow));
          deko.push(() => {
            laibung(f, S, rechteckU(ow), 0.2); f.wall('glasDunkel', ow.u0, ow.u1, ow.v0, ow.v1, -0.19);
            const w = 0.45, u0 = ow.u0 + 0.05, u1 = ow.u1 - 0.05, v0 = ow.v0 + 0.05, v1 = ow.v1 - 0.05;
            f.box(W, u0 - 0.05, u1 + 0.05, v0 - 0.05, v0, 0, w); f.box(W, u0 - 0.05, u1 + 0.05, v1, v1 + 0.05, 0, w);
            f.box(W, u0 - 0.05, u0, v0, v1, 0, w); f.box(W, u1, u1 + 0.05, v0, v1, 0, w);
            if (o.leicht) return;
            const sp = (u1 - u0) / 3, hh = v1 - v0;
            for (let q = -4; q <= 6; q++) for (const sg of [1, -1]) {
              const ua = u0 + q * sp, ub = ua + sg * hh * 0.45;
              const lo = Math.min(ua, ub), hi = Math.max(ua, ub);
              if (hi < u0 || lo > u1) continue;
              const tA = ua < u0 ? (u0 - ua) / (ub - ua) : ua > u1 ? (u1 - ua) / (ub - ua) : 0;
              const tB = ub < u0 ? (u0 - ua) / (ub - ua) : ub > u1 ? (u1 - ua) / (ub - ua) : 1;
              if (tB - tA < 0.08) continue;
              stab(bau, W, f.P(ua + (ub - ua) * tA, v0 + hh * tA, w - 0.04), f.P(ua + (ub - ua) * tB, v0 + hh * tB, w - 0.04), 0.05, 0.06, 0.5);
            }
          });
        } else {
          const ow = { u0: m - 0.22, u1: m + 0.22, v0: vv + 0.4, v1: vv + fH - 0.5 }; ops.push(rechteckU(ow));
          deko.push(() => f.fenster(ow, { tiefe: 0.35, laibung: S, ohneRahmen: true, glasKey: 'glasDunkel', flach: o.leicht }));
        }
      }
      wand(f, S, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
      umlauf(f, W, vv + fH - 0.25, vv + fH, 0, 0.12);
    }
  });
  const innen = dach(bau, pts, top, S, 1.1, 0.3, W);
  // Dachterrasse: Pergola aus weißen Lamellen und schlanker Treppenturm mit Schlitzen (Windturm modern)
  const pl = dachPlaetze(innen, [], R, 2, 2.2);
  let hoch = top + 1.1;
  if (pl[0]) {
    const [x, z] = pl[0], ring = quadrat(x, z, r.ax, 1.6, 1.6);
    kanten(bau, ring).forEach(f => { f.wall(W, 0, f.L, top, top + 5.2); if (!o.leicht) for (let u = 0.5; u < f.L - 0.4; u += 0.45) f.box('glasDunkel', u - 0.08, u + 0.08, top + 2.6, top + 4.8, -0.06, 0.01); });
    bau.poly(W, ring, top + 5.2); hoch = top + 5.2;
  }
  if (pl[1]) {
    const [x, z] = pl[1], ring = quadrat(x, z, r.ax, 2.0, 1.6);
    ring.forEach(([px, pz]) => zylinder(bau, W, px, top, pz, 0.08, 0.08, 2.7, 8));
    const g = rahmen(ring, r.ax);
    for (let u = 0.1; u < g.L; u += 0.35) { const A = g.W(g.u0 + u, g.t0), B = g.W(g.u0 + u, g.t1); stab(bau, W, V(A[0], top + 2.7, A[1]), V(B[0], top + 2.7, B[1]), 0.06, 0.18, 0); }
  }
  return { floors: N + 1, top: hoch };
}

stil('golf', (bau, pts, H, R, v, o) => {
  const op = schalter(v);
  return op.has('modern') ? golfModern(bau, pts, H, R, op, o) : golfAlt(bau, pts, H, R, op, o);
}, 'Arabischer Golf: traditionell mit Sandputz, Windturm (Barjeel) mit offenen Schlitzen, Kreuzwänden und Holzstangen, Spitzbogenloggia, Maschrabiya, Läden, Lüftungsdreiecke, Dreieckszinnen. Modern mit Glas hinter weißen Gitterschirmen, Lobby und Dachterrasse');

// ---------------------------------------------------------------------------------------------
// 4 Japan modern: schmales Haus in Tokio mit Laden, Balkonen, Klimageräten und senkrechten Leuchtschildern

stil('tokio', (bau, pts, H, R, v, o) => {
  const op = schalter(v), wohnen = op.has('wohnen');
  const F = op.has('beton') ? 'sichtbeton' : op.has('weiss') ? 'kachelWeiss' : op.has('braun') ? 'kachelBraun' : op.has('beige') ? 'kachelBeige' : wahl(R, ['kachelBeige', 'kachelWeiss', 'kachelBraun', 'sichtbeton']);
  const gH = 3.8, fH = 3.0, N = Math.max(2, Math.round((H - gH) / fH)), top = gH + N * fH;
  const fi = frontKante(pts), r = rahmen(pts), SCH = ['schildRot', 'schildGelb', 'schildBlau', 'schildWeiss', 'schildGruen'];
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi, hinten = !vorne && f.n.dot(new Fassade(bau, pts[fi], pts[(fi + 1) % pts.length]).n) < -0.9;
    if (vorne) {
      if (o.ohneLaden) f.wall(F, 0, f.L, 0, gH);
      else {
        const lo = { u0: 0.35, u1: f.L - 0.35, v0: 0.02, v1: gH - 1.05 };
        wand(f, F, 0, f.L, 0, gH, [rechteckU(lo)]);
        laibung(f, F, rechteckU(lo), 0.35, 0, true);
        f.bau.face('granit', f.P(lo.u0, 0.02, 0), f.P(lo.u1, 0.02, 0), f.P(lo.u1, 0.02, -0.35), f.P(lo.u0, 0.02, -0.35), UP);
        f.wall('glas', lo.u0, lo.u1, lo.v0, lo.v1, -0.34);
        teilung(lo.u1 - lo.u0, 1.1).forEach(u => f.leiste('metall', lo.u0 + Math.max(0, u - 0.03), lo.u0 + Math.min(lo.u1 - lo.u0, u + 0.03), lo.v0, lo.v1, -0.34, -0.29));
        f.leiste('metall', lo.u0, lo.u1, 2.1, 2.15, -0.34, -0.29, true);
        f.box('technik', lo.u0, lo.u1, lo.v1 - 0.3, lo.v1, -0.34, -0.12);   // Rollladenkasten
        schild(bau, SCH[Math.floor(R() * 5)], f, 0.3, f.L - 0.3, gH - 0.95, gH - 0.2, 0, 0.16, true);
        f.box('metall', 0.2, f.L - 0.2, lo.v1 + 0.02, lo.v1 + 0.08, 0, 0.85);
      }
      for (let k = 0; k < N; k++) {
        const vv = gH + k * fH;
        if (wohnen) {
          const ow = { u0: 0.5, u1: f.L - 0.5, v0: vv + 0.05, v1: vv + 2.25 };
          wand(f, F, 0, f.L, vv, vv + fH, [rechteckU(ow)]);
          f.fenster(ow, { tiefe: 0.18, laibung: F, rahmen: 'metall', rahmenBreite: 0.06, sprossen: true, flach: o.leicht, ohneRahmen: o.leicht });
          f.box('sichtbeton', 0, f.L, vv - 0.18, vv + 0.04, 0, 1.0);
          f.box('sichtbeton', 0, f.L, vv + 0.04, vv + 0.5, 0.88, 1.0);
          if (o.leicht) f.wall('glasGelaender', 0.05, f.L - 0.05, vv + 0.5, vv + 1.1, 0.94);
          else { f.box('metall', 0.05, f.L - 0.05, vv + 1.06, vv + 1.12, 0.9, 0.98); for (let u = 0.15; u < f.L - 0.1; u += 0.13) f.box('metall', u - 0.012, u + 0.012, vv + 0.5, vv + 1.06, 0.93, 0.955); }
          for (const sg of [0, 1]) f.box('sichtbeton', sg ? f.L - 0.12 : 0, sg ? f.L : 0.12, vv + 0.04, vv + 1.12, 0, 0.88);
          const ku = R() < 0.5 ? 0.85 : f.L - 0.85;
          f.box('technik', ku - 0.4, ku + 0.4, vv + 0.06, vv + 0.64, 0.25, 0.55); f.box('technikDunkel', ku - 0.28, ku + 0.12, vv + 0.14, vv + 0.56, 0.55, 0.56);
          if (!o.leicht && R() < 0.6) stange(bau, 'metall', f.P(0.15, vv + 1.9, 0.7), f.P(f.L - 0.15, vv + 1.9, 0.7), 0.02, 5);
        } else {
          const ow = { u0: 0.45, u1: f.L - 0.45, v0: vv + 0.75, v1: vv + 2.45 };
          wand(f, F, 0, f.L, vv, vv + fH, [rechteckU(ow)]);
          f.fenster(ow, { tiefe: 0.16, laibung: F, rahmen: 'metall', rahmenBreite: 0.05, kaempfer: true, flach: o.leicht, ohneRahmen: o.leicht, glasKey: k < 2 ? 'glasHell' : 'glas' });
          if (!o.leicht) teilung(ow.u1 - ow.u0, 1.0).forEach((u, j, a) => { if (j > 0 && j < a.length - 1) f.box('metall', ow.u0 + u - 0.025, ow.u0 + u + 0.025, ow.v0, ow.v1, -0.15, -0.1); });
          if (k < 2 && f.L > 4) schild(bau, SCH[(k + 2) % 5], f, ow.u0 + 0.2, ow.u0 + Math.min(2.6, (ow.u1 - ow.u0) * 0.5), ow.v0 + 0.1, ow.v0 + 0.6, -0.14, -0.1, true);
          umlauf(f, F, vv - 0.06, vv + 0.12, 0, 0.05);
        }
      }
      // senkrechtes Leuchtschild an der Ecke, je Geschoss ein Feld
      if (!wohnen || op.has('schild')) {
        const su = f.L * 0.9 > 4 ? 0.45 : f.L - 0.45, n = Math.min(N, 6);
        for (let k = 0; k < n; k++) {
          const v0 = gH + 0.2 + k * fH;
          schild(bau, SCH[(k * 3 + Math.floor(R() * 5)) % 5], f, su - 0.08, su + 0.08, v0, v0 + fH - 0.25, 0.2, 1.15);
        }
        f.box('rahmenDunkel', su - 0.05, su + 0.05, gH + 0.1, gH + n * fH, 0.02, 0.22);
        for (let k = 0; k <= n; k++) f.box('rahmenDunkel', su - 0.03, su + 0.03, gH + k * fH + 0.02, gH + k * fH + 0.12, 0, 1.2);
      }
    } else {
      // Seiten und Rückseite: kleine Fenster mit Gittern, Klimageräte auf Konsolen, Fallrohr
      const ax = achsen(f.L, 3.2, 1.2);
      for (let k = -1; k < N; k++) {
        const vv = k < 0 ? 0 : gH + k * fH, vh = k < 0 ? gH : fH, ops = [], deko = [];
        ax.forEach(m => {
          if ((!hinten && R() < 0.55) || (k < 0 && !hinten)) return;
          const ow = k < 0 ? { u0: m - 0.45, u1: m + 0.45, v0: 0.02, v1: 2.1 } : { u0: m - 0.4, u1: m + 0.4, v0: vv + 1.0, v1: vv + 2.1 };
          ops.push(rechteckU(ow));
          deko.push(() => {
            if (k < 0) { laibung(f, F, rechteckU(ow), 0.1, 0, true); f.wall('ladenSchwarz', ow.u0, ow.u1, ow.v0, ow.v1, -0.09); return; }
            f.fenster(ow, { tiefe: 0.1, laibung: F, rahmen: 'metall', rahmenBreite: 0.05, glasKey: 'glasHell', flach: o.leicht, ohneRahmen: o.leicht });
            if (!o.leicht && R() < 0.6) gitter(f, ow, 0.1, 'metall');
            if (R() < 0.5) klimageraet(f, m + (R() < 0.5 ? -0.9 : 0.9), vv + 0.25);
          });
        });
        wand(f, F, 0, f.L, vv, vv + vh, ops);
        deko.forEach(d => d());
      }
      if (hinten || R() < 0.5) stange(bau, 'technik', f.P(0.3, 0, 0.1), f.P(0.3, top + 0.4, 0.1), 0.06, 8);
    }
  });
  const innen = dach(bau, pts, top, F, 0.9, 0.22, 'metall');
  // Dach: Treppenhaus, Wassertank auf Stahlgestell, bei Läden eine Werbetafel
  const pl = dachPlaetze(innen, [], R, 2, 1.2);
  if (pl[0]) { const [x, z] = pl[0], ring = quadrat(x, z, r.ax, 1.2, 1.4); kiste(bau, F, ring, top, top + 2.6); kanten(bau, ring).forEach((f, j) => { if (j === 0) f.wall('metall', f.L / 2 - 0.45, f.L / 2 + 0.45, top + 0.02, top + 2.05, 0.02); }); }
  if (pl[1]) {
    const [x, z] = pl[1];
    for (const [a, b] of [[-0.8, -0.6], [0.8, -0.6], [0.8, 0.6], [-0.8, 0.6]]) { const p = [x + a * r.ax[0] - b * r.ax[1], z + a * r.ax[1] + b * r.ax[0]]; zylinder(bau, 'rahmenDunkel', p[0], top, p[1], 0.05, 0.05, 1.2, 6); }
    kiste(bau, 'kachelWeiss', quadrat(x, z, r.ax, 0.95, 0.75), top + 1.2, top + 2.6, 'technik');
  }
  if (!wohnen && !o.leicht) {
    const fv = new Fassade(bau, pts[fi], pts[(fi + 1) % pts.length]);
    for (const u of [0.6, fv.L - 0.6]) fv.box('rahmenDunkel', u - 0.06, u + 0.06, top + 0.9, top + 4.2, -1.2, -1.08);
    schild(bau, SCH[Math.floor(R() * 5)], fv, 0.4, fv.L - 0.4, top + 1.8, top + 4.0, -1.08, -0.98, true);
  }
  return { floors: N + 1, top: top + (wohnen ? 2.6 : 4.2) };
}, 'Schmales Haus in Tokio: Fassade aus kleinen Fliesen oder Sichtbeton, Laden mit Glasfront, Rollladenkasten und Schildband, Büros mit Fensterbändern oder Wohnungen mit Balkonen, Klimageräte, Fallrohre, senkrechte Leuchtschilder, Wassertank und Werbetafel auf dem Dach');

// ---------------------------------------------------------------------------------------------
// 5 USA Vorstadthaus: Holzschalung, Satteldach mit Schindeln, Veranda mit Säulen, Schornstein, Garage

stil('vorstadt', (bau, pts, H, R, v, o) => {
  const op = schalter(v), farben = ['sidingWeiss', 'sidingBlau', 'sidingGelb', 'sidingGruen', 'sidingGrau', 'sidingRot'];
  const W = farben.find(k => op.has(k.slice(6).toLowerCase())) || wahl(R, farben);
  const LA = op.has('schwarz') ? 'ladenSchwarz' : wahl(R, ['ladenSchwarz', 'ladenGruen', 'blauTuer']);
  const TK = wahl(R, ['holzRot', 'blauTuer', 'ladenSchwarz', 'ladenGruen']);
  const lo = vorOrt(pts), N = H > 5.5 ? 2 : 1, so = 0.55, fH = 2.85, wt = so + N * fH, sprossen = R() < 0.6;
  const dachS = { key: 'schindel', rillen: 'quer', abstand: 0.24, neigung: 0.6, ueberstand: 0.42, ortgang: 0.3, dicke: 0.14, first: 'schindel', firstBreite: 0.3, firstHoehe: 0.12, traufe: 'lack', ortgangKey: 'lack', unterseite: 'lack', wand: W, leicht: o.leicht };
  const fensterW = (f, ow) => {
    sprossenFenster(f, ow, { spalten: sprossen ? 3 : 1, zeilen: sprossen ? 1 : 0, leicht: o.leicht });
    if (R() < 0.75) fensterlaeden(f, ow, LA, o.leicht);
  };
  const gr = !op.has('ohnegarage') && lo.rechteck && lo.L >= 13;
  const gw = gr ? (lo.L >= 17 ? 6.4 : 3.9) : 0, gl = R() < 0.5;
  const ha0 = gr && gl ? gw : 0, ha1 = gr && !gl ? lo.L - gw : lo.L;
  const pd = lo.rechteck && lo.B >= 8.5 ? Math.min(2.4, lo.B * 0.24) : 0;
  const haus = lo.rechteck ? lo.ring(ha0, ha1, pd, lo.B) : pts;
  let fv = null;
  kanten(bau, haus).forEach(f => {
    const vorne = lo.vorne(f);
    if (vorne) fv = f;
    umlauf(f, 'beton', 0, so, 0, 0.03);
    const ax = achsen(f.L, 2.5, 1.0), mitte = Math.floor(ax.length / 2);
    for (let k = 0; k < N; k++) {
      const vv = so + k * fH, ops = [], deko = [];
      ax.forEach((m, j) => {
        if (vorne && k === 0 && j === mitte) {
          const ow = { u0: m - 0.5, u1: m + 0.5, v0: so + 0.02, v1: so + 2.15 }; ops.push(rechteckU(ow));
          deko.push(() => {
            laibung(f, 'lack', rechteckU(ow), 0.12, 0, true); f.wall(TK, ow.u0, ow.u1, ow.v0, ow.v1, -0.11);
            if (!o.leicht) { for (const [a, b] of [[0.3, 1.0], [1.15, 1.85]]) for (const sg of [-1, 1]) f.box(TK, m + sg * 0.22 - 0.16, m + sg * 0.22 + 0.16, so + a, so + b, -0.11, -0.08); f.box('glas', m - 0.32, m + 0.32, so + 1.9, so + 2.05, -0.11, -0.085); }
            f.box('lack', ow.u0 - 0.14, ow.u0, ow.v0, ow.v1 + 0.14, 0, 0.04); f.box('lack', ow.u1, ow.u1 + 0.14, ow.v0, ow.v1 + 0.14, 0, 0.04);
            f.box('lack', ow.u0 - 0.2, ow.u1 + 0.2, ow.v1 + 0.14, ow.v1 + 0.3, 0, 0.08);
            f.box('metall', m + 0.32, m + 0.36, so + 1.0, so + 1.08, -0.11, -0.04);
          });
          return;
        }
        if (!vorne && R() < 0.3) return;
        const ow = { u0: m - 0.45, u1: m + 0.45, v0: vv + 0.85, v1: vv + 2.3 }; ops.push(rechteckU(ow));
        deko.push(() => fensterW(f, ow));
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
    }
    f.box('lack', 0, 0.16, so, wt, 0, 0.035); f.box('lack', f.L - 0.16, f.L + 0.035, so, wt, 0, 0.035);
    umlauf(f, 'lack', wt - 0.22, wt, 0, 0.03);
  });
  // Veranda mit Säulen, Geländer, Treppe und Pultdach
  if (pd > 0 && fv) {
    const L = fv.L, m = achsen(L, 2.5, 1.0)[Math.floor(achsen(L, 2.5, 1.0).length / 2)] ?? L / 2, dh = so - 0.05;
    const t0 = m - 0.75, t1 = m + 0.75;
    fv.box('holzHell', 0, L, 0, dh, 0, pd - 0.62);
    fv.box('holzHell', 0, t0, 0, dh, pd - 0.62, pd); fv.box('holzHell', t1, L, 0, dh, pd - 0.62, pd);
    fv.box('beton', t0, t1, 0, dh / 3, pd - 0.62, pd); fv.box('beton', t0, t1, dh / 3, dh * 2 / 3, pd - 0.62, pd - 0.31); fv.box('beton', t0, t1, dh * 2 / 3, dh, pd - 0.62, pd - 0.6);
    const eave = N === 2 ? so + 2.7 : wt - 0.7, tiefe = pd + 0.3, hoch = Math.min(tiefe * 0.3, (N === 2 ? so + fH + 0.7 : wt) - eave);
    const saeulen = teilung(L - 0.4, 2.6).map(u => u + 0.2);
    saeulen.forEach(u => { fv.box('lack', u - 0.11, u + 0.11, dh, dh + 0.12, pd - 0.37, pd - 0.13); fv.box('lack', u - 0.08, u + 0.08, dh + 0.12, eave - 0.12, pd - 0.34, pd - 0.16); });
    fv.box('lack', 0, L, eave - 0.12, eave + 0.15, pd - 0.38, pd - 0.12);
    for (let k = 0; k < saeulen.length - 1; k++) {
      const a = saeulen[k] + 0.09, b = saeulen[k + 1] - 0.09;
      for (const [x0, x1] of [[a, Math.min(b, t0)], [Math.max(a, t1), b]]) if (x1 - x0 > 0.3) gelaender(fv, 'lack', x0, x1, dh, 0.9, pd - 0.25, 0.13, o.leicht);
    }
    vordach(fv, -0.05, L + 0.05, eave, tiefe, hoch, { ...dachS, traufe: 'lack', unterseite: 'lack', dicke: 0.12 });
  }
  const d = satteldach(bau, haus, wt, { ...dachS, richtung: 'front',
    giebelLoch: (f, y0, yR) => (yR - y0 > 2 && f.L > 4) ? [rechteckU({ u0: f.L / 2 - 0.4, u1: f.L / 2 + 0.4, v0: y0 + 0.5, v1: y0 + 1.4 })] : [],
    giebelDeko: (f, y0, yR) => { if (yR - y0 > 2 && f.L > 4) sprossenFenster(f, { u0: f.L / 2 - 0.4, u1: f.L / 2 + 0.4, v0: y0 + 0.5, v1: y0 + 1.4 }, { spalten: 2, zeilen: 0, leicht: o.leicht }); f.box('lack', 0, f.L, y0 - 0.02, y0 + 0.14, 0, 0.04); } });
  // Schornstein aus Ziegel am Giebelende, auf dem First
  if (lo.rechteck && d.r) {
    const hr = rahmen(haus, d.r.ax), tc = (hr.t0 + hr.t1) / 2, ua = R() < 0.5 ? hr.u0 + 1.0 : hr.u1 - 1.0, p = hr.W(ua, tc + 0.5);
    schornstein(bau, p[0], p[1], d.r.ax, wt, (d.yR ?? wt + 3) + 0.9, 'ziegel', 0.42, 0.36);
  }
  // Garage mit Sektionaltor und eigenem Satteldach (Giebel zur Straße)
  if (gr) {
    const gd = Math.min(lo.B, 7.2), ring = lo.ring(gl ? 0 : lo.L - gw, gl ? gw : lo.L, 0, gd), gh = 2.95;
    kanten(bau, ring).forEach(f => {
      umlauf(f, 'beton', 0, 0.2, 0, 0.03);
      if (lo.vorne(f)) {
        const n = f.L > 5.5 ? 2 : 1, ops = [], tore = [];
        for (let k = 0; k < n; k++) { const m = f.L * (k + 0.5) / n, b = Math.min(1.25, f.L / n / 2 - 0.35); tore.push({ u0: m - b, u1: m + b, v0: 0.02, v1: 2.25 }); }
        tore.forEach(t => ops.push(rechteckU(t)));
        wand(f, W, 0, f.L, 0, gh, ops);
        tore.forEach(t => {
          laibung(f, 'lack', rechteckU(t), 0.12, 0, true); f.wall('lack', t.u0, t.u1, t.v0, t.v1, -0.11);
          if (!o.leicht) for (let y = t.v0 + 0.55; y < t.v1 - 0.1; y += 0.55) f.leiste('rahmen', t.u0, t.u1, y - 0.015, y + 0.015, -0.11, -0.09, true);
          for (let x = t.u0 + 0.25; x < t.u1 - 0.2; x += 0.5) f.box('glasDunkel', x - 0.17, x + 0.17, t.v1 - 0.45, t.v1 - 0.2, -0.11, -0.095);
          f.box('lack', t.u0 - 0.12, t.u1 + 0.12, t.v1, t.v1 + 0.12, 0, 0.04);
        });
      } else {
        const ops = [], ow = { u0: f.L / 2 - 0.4, u1: f.L / 2 + 0.4, v0: 1.0, v1: 2.0 };
        if (f.L > 3 && R() < 0.6) ops.push(rechteckU(ow));
        wand(f, W, 0, f.L, 0, gh, ops);
        if (ops.length) sprossenFenster(f, ow, { spalten: 2, zeilen: 0, leicht: o.leicht });
      }
      f.box('lack', 0, 0.14, 0.2, gh, 0, 0.035); f.box('lack', f.L - 0.14, f.L + 0.035, 0.2, gh, 0, 0.035);
    });
    satteldach(bau, ring, gh, { ...dachS, neigung: 0.5, richtung: 'tiefe', ueberstand: 0.35 });
  }
  return { floors: N, top: d.yF };
}, 'Vorstadthaus in Nordamerika: Holzschalung in Farbe, weiße Eckbretter und Faschen, Schiebefenster mit Sprossen und Klappläden, Veranda mit Säulen, Geländer und Treppe, Satteldach mit Schindeln, Ziegelschornstein, Garage mit Sektionaltor');

// ---------------------------------------------------------------------------------------------
// 6 USA Brownstone: Reihenhäuser in New York mit Stoop, Erker, Gesims mit Konsolen

stil('brownstone', (bau, pts, H, R, v, o) => {
  const lo = vorOrt(pts), g0 = 2.4, p1 = g0 + 3.7, fH = 3.2, N = clamp(Math.round((H - p1 - 1.0) / fH), 1, 4), top = p1 + N * fH;
  const sb = lo.rechteck && lo.B >= 11 ? Math.min(3.8, lo.B * 0.25) : 0;
  const body = lo.rechteck ? lo.ring(0, lo.L, sb, lo.B) : pts;
  const fs = kanten(bau, body), fv = fs.find(lo.vorne) || fs[frontKante(body)];
  const n = Math.max(1, Math.round(fv.L / 6.2)), uw = fv.L / n;
  const SM = 'brownstone';
  // Seiten und Rückseite: Ziegel mit einfachen Fenstern hinten
  fs.forEach(f => {
    if (f === fv) return;
    const hinten = f.n.dot(fv.n) < -0.9, ops = [], deko = [];
    if (hinten) for (let k = 0; k <= N + 1; k++) {
      const vv = k === 0 ? 0 : k === 1 ? g0 : p1 + (k - 2) * fH;
      achsen(f.L, 2.4, 1.0).forEach(m => { const ow = { u0: m - 0.45, u1: m + 0.45, v0: vv + 0.8, v1: vv + 2.3 }; ops.push(rechteckU(ow)); deko.push(() => f.fenster(ow, { tiefe: 0.22, laibung: 'ziegel', kaempfer: true, bank: true, sturz: true, flach: o.leicht, ohneRahmen: o.leicht })); });
    }
    wand(f, 'ziegel', 0, f.L, 0, top, ops);
    deko.forEach(d => d());
  });
  for (let e = 0; e < n; e++) {
    const u0 = e * uw, u1 = (e + 1) * uw, T = R() < 0.72 ? SM : 'ziegel', links = R() < 0.5, erker = R() < 0.65 && uw >= 5.4;
    const du = links ? u1 - 1.35 : u0 + 1.35, zone = links ? [u0 + 0.4, u1 - 2.7] : [u0 + 2.7, u1 - 0.4], bu = (zone[0] + zone[1]) / 2;
    const CK = wahl(R, ['ladenSchwarz', 'ladenSchwarz', SM, 'holzDunkel']);
    const ebenen = [[0, g0], [g0, p1], ...Array.from({ length: N }, (_, k) => [p1 + k * fH, p1 + (k + 1) * fH])];
    ebenen.forEach(([v0, v1], k) => {
      const ops = [], deko = [];
      const fensterIn = (m, h0, h1, kopf) => { const ow = { u0: m - 0.5, u1: m + 0.5, v0: v0 + h0, v1: v0 + h1 }; ops.push(rechteckU(ow)); deko.push(() => { f2(ow, kopf); }); };
      const f2 = (ow, kopf) => {
        fv.fenster(ow, { tiefe: 0.26, laibung: T, rahmen: 'holzDunkel', kaempfer: true, bank: true, bankKey: SM, flach: o.leicht, ohneRahmen: o.leicht });
        if (kopf) { fv.box(SM, ow.u0 - 0.12, ow.u1 + 0.12, ow.v1, ow.v1 + 0.28, 0, 0.1); fv.box(SM, ow.u0 - 0.18, ow.u1 + 0.18, ow.v1 + 0.28, ow.v1 + 0.38, 0, 0.18); }
        else fv.box(SM, ow.u0 - 0.08, ow.u1 + 0.08, ow.v1, ow.v1 + 0.22, 0, 0.05);
        if (k === 0 && !o.leicht) gitter(fv, ow, 0.11);
      };
      if (k === 0) {   // Gartengeschoss: Tür unter der Treppe, Fenster mit Gittern
        const ow = { u0: du - 0.45, u1: du + 0.45, v0: 0.02, v1: 2.0 }; ops.push(rechteckU(ow));
        deko.push(() => { laibung(fv, T, rechteckU(ow), 0.2, 0, true); fv.wall('ladenSchwarz', ow.u0, ow.u1, ow.v0, ow.v1, -0.19); });
        if (!erker) [zone[0] + 0.7, zone[1] - 0.7].forEach(m => fensterIn(m, 0.7, 2.0, false));
      } else if (k === 1) {   // Hochparterre: Tür mit Verdachung, hohe Fenster
        const ow = { u0: du - 0.62, u1: du + 0.62, v0: v0 + 0.05, v1: v0 + 3.0 }; ops.push(rechteckU(ow));
        deko.push(() => {
          laibung(fv, SM, rechteckU(ow), 0.4, 0, true); fv.wall('holzDunkel', ow.u0, ow.u1, ow.v0, ow.v1 - 0.6, -0.39); fv.wall('glas', ow.u0, ow.u1, ow.v1 - 0.55, ow.v1, -0.39);
          fv.box('holzDunkel', ow.u0, ow.u1, ow.v1 - 0.6, ow.v1 - 0.55, -0.39, -0.35); fv.box('rahmenDunkel', du - 0.02, du + 0.02, ow.v0, ow.v1 - 0.6, -0.39, -0.36);
          fv.box(SM, ow.u0 - 0.35, ow.u1 + 0.35, ow.v1 + 0.15, ow.v1 + 0.45, 0, 0.42); fv.box(SM, ow.u0 - 0.45, ow.u1 + 0.45, ow.v1 + 0.45, ow.v1 + 0.6, 0, 0.55);
          konsolen(fv, ow.u0 - 0.22, ow.u1 + 0.22, ow.v1 + 0.15, 0.36, SM, 2);
          fv.box(SM, ow.u0 - 0.2, ow.u0, ow.v0, ow.v1 + 0.15, 0, 0.08); fv.box(SM, ow.u1, ow.u1 + 0.2, ow.v0, ow.v1 + 0.15, 0, 0.08);
        });
        if (!erker) [zone[0] + 0.7, zone[1] - 0.7].forEach(m => fensterIn(m, 0.45, 2.95, true));
      } else {
        fensterIn(du, 0.8, 2.6, false);
        if (!erker) [zone[0] + 0.7, zone[1] - 0.7].forEach(m => fensterIn(m, 0.8, 2.6, false));
      }
      wand(fv, T, u0, u1, v0, v1, ops);
      deko.forEach(d => d());
    });
    fv.box(SM, u0, u1, g0 - 0.15, g0 + 0.05, 0, 0.1);   // Wasserschlag über dem Gartengeschoss
    // Erker über alle Geschosse
    if (erker) {
      const A = fv.P(bu + 1.45, 0, 0), B = fv.P(bu + 0.78, 0, 0.82), C = fv.P(bu - 0.78, 0, 0.82), D = fv.P(bu - 1.45, 0, 0), et = top - 0.15;
      const P2 = p => [p.x, p.z];
      [[A, B], [B, C], [C, D]].forEach(([a, b], j) => {
        const f = new Fassade(bau, P2(a), P2(b)), ops = [], deko = [];
        ebenen.forEach(([v0, v1], k) => {
          const h0 = k === 0 ? 0.75 : k === 1 ? 0.45 : 0.8, h1 = k === 0 ? 2.0 : k === 1 ? 2.95 : 2.6, b2 = j === 1 ? 0.55 : 0.33;
          const ow = { u0: f.L / 2 - b2, u1: f.L / 2 + b2, v0: v0 + h0, v1: v0 + h1 }; ops.push(rechteckU(ow));
          deko.push(() => { f.fenster(ow, { tiefe: 0.22, laibung: T, rahmen: 'holzDunkel', kaempfer: true, bank: true, bankKey: SM, flach: o.leicht, ohneRahmen: o.leicht }); f.box(SM, ow.u0 - 0.08, ow.u1 + 0.08, ow.v1, ow.v1 + 0.2, 0, 0.05); if (k === 0 && !o.leicht) gitter(f, ow, 0.11); });
        });
        wand(f, T, 0, f.L, 0, et, ops);
        deko.forEach(d => d());
        f.box(SM, 0, f.L, et - 0.3, et, 0, 0.12);
        f.box(SM, 0, f.L, g0 - 0.15, g0 + 0.05, 0, 0.1);
      });
      const er = orientiere([P2(A), P2(B), P2(C), P2(D)]);
      bau.poly(SM, er, et);
    }
    // Gesims mit Fries und Konsolen
    fv.box(CK, u0, u1, top, top + 0.38, 0, 0.12);
    fv.box(CK, u0, u1, top + 0.38, top + 0.56, 0, 0.42);
    fv.box(CK, u0, u1, top + 0.56, top + 0.82, 0, 0.78);
    for (let u = u0 + 0.3; u < u1 - 0.2; u += 0.55) fv.box(CK, u - 0.07, u + 0.07, top + 0.2, top + 0.56, 0.12, 0.7);
    fv.box(SM, u0, u1, top - 0.25, top, 0, 0.06);
    // Stoop: Treppe vom Gehweg zur Tür im Hochparterre, Wangen mit Eisengeländer
    if (sb > 0) {
      const steigung = g0 + 0.05, stufen = Math.round(steigung / 0.19), podest = 0.9, lauf = sb - 0.2 - podest, tritt = lauf / stufen, sh = steigung / stufen;
      const a = du - 0.8, b = du + 0.8;
      fv.box(SM, a, b, 0, steigung, 0, podest);
      for (let k = 0; k < stufen; k++) { const w1 = sb - 0.2 - k * tritt, w0 = w1 - tritt; fv.box(SM, a, b, 0, (k + 1) * sh, w0, w1); }
      for (const [x0, x1] of [[a - 0.22, a], [b, b + 0.22]]) {
        const c = (u, v, w) => fv.P(u, v, w);
        bau.hexa(SM, [c(x0, 0, 0), c(x1, 0, 0), c(x1, 0, sb - 0.1), c(x0, 0, sb - 0.1), c(x0, steigung + 0.55, 0), c(x1, steigung + 0.55, 0), c(x1, 0.9, sb - 0.1), c(x0, 0.9, sb - 0.1)]);
        const xm = (x0 + x1) / 2;
        stange(bau, 'rahmenDunkel', c(xm, steigung + 1.4, 0.3), c(xm, 1.75, sb - 0.3), 0.03, 6);
        if (!o.leicht) for (let t = 0.15; t < 0.95; t += 0.1) { const w = 0.3 + (sb - 0.6) * t, y0 = steigung + 0.55 + (0.9 - steigung - 0.55) * (w / (sb - 0.1)); stange(bau, 'rahmenDunkel', c(xm, y0, w), c(xm, y0 + 0.85, w), 0.012, 4); }
        zylinder(bau, 'rahmenDunkel', c(xm, 0.9, sb - 0.25).x, 0.9, c(xm, 0.9, sb - 0.25).z, 0.05, 0.04, 0.9, 8);
        kugel(bau, 'rahmenDunkel', c(xm, 0, sb - 0.25).x, 1.85, c(xm, 0, sb - 0.25).z, 0.07, 8);
      }
      // Zaun am Vorgarten
      const fw = sb - 0.08;
      for (const [x0, x1] of [[u0 + 0.05, a - 0.25], [b + 0.25, u1 - 0.05]]) {
        if (x1 - x0 < 0.3) continue;
        fv.box('granit', x0, x1, 0, 0.25, fw - 0.12, fw + 0.06);
        gelaender(fv, 'rahmenDunkel', x0, x1, 0.25, 0.95, fw - 0.03, 0.12, o.leicht);
      }
    }
  }
  const innen = dach(bau, body, top, 'ziegel', 0.85, 0.3, 'stein');
  for (let e = 0; e <= n; e++) {   // Schornsteine auf den Brandwänden
    if (R() < 0.35) continue;
    const g = rahmen(body, lo.ax), u = g.u0 + Math.min(g.L - 0.6, Math.max(0.6, e * uw)), t = g.t0 + g.B * (0.3 + R() * 0.4), p = g.W(u, t);
    if (inside(innen, p[0], p[1])) schornstein(bau, p[0], p[1], lo.ax, top, top + 2.0, 'ziegel', 0.35, 0.6);
  }
  return { floors: N + 2, top: top + 2.0 };
}, 'Brownstone Reihenhäuser in New York: braune Sandsteinfassaden oder Ziegel, Stoop mit Wangen und Eisengeländern, Gartengeschoss mit Gittern, Hochparterre mit Türverdachung auf Konsolen, dreiseitige Erker, schweres Gesims mit Fries und Konsolen, Vorgartenzaun, Ziegelschornsteine');

// ---------------------------------------------------------------------------------------------
// 7 Mittelmeer: weiße Kuben der Kykladen, blaue Türen und Läden, runde Brüstungen, Terrasse, Gewölbe

function gewoelbe(bau, pts, r, y0, stich, key) {
  const n = 10, hb = r.B / 2, tc = (r.t0 + r.t1) / 2, R0 = (hb * hb + stich * stich) / (2 * stich), yc = y0 + stich - R0, th = Math.asin(hb / R0);
  const bogen = [];
  for (let i = 0; i <= n; i++) {
    const a = -th + 2 * th * i / n, t = tc + R0 * Math.sin(a), y = yc + R0 * Math.cos(a);
    bogen.push({ t, y, n: V(r.az[0] * Math.sin(a), Math.cos(a), r.az[1] * Math.sin(a)) });
  }
  const W3 = (u, b) => { const p = r.W(u, b.t); return V(p[0], b.y, p[1]); };
  for (let i = 0; i < n; i++) {
    const p = bogen[i], q = bogen[i + 1];
    dreieckN(bau, key, W3(r.u0, p), W3(r.u1, p), W3(r.u1, q), p.n, p.n, q.n);
    dreieckN(bau, key, W3(r.u0, p), W3(r.u1, q), W3(r.u0, q), p.n, q.n, q.n);
  }
  pts.forEach((a, i) => {   // Stirnwände
    const b = pts[(i + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (Math.abs(((b[0] - a[0]) * r.ax[0] + (b[1] - a[1]) * r.ax[1]) / l) > 0.2) return;
    const f = new Fassade(bau, a, b), u = P => (P.x - f.o.x) * f.r.x + (P.z - f.o.z) * f.r.z;
    const ua = a[0] * r.ax[0] + a[1] * r.ax[1], um = bogen.map(bb => { const p2 = r.W(ua, bb.t); return [u(V(p2[0], 0, p2[1])), bb.y]; });
    const rand = [[0, y0], [f.L, y0]].concat(um.filter(p => p[1] > y0 + 0.01).sort((p, q) => q[0] - p[0]));
    flaeche(f, key, rand);
  });
  for (const sg of [0, 1]) { const b = bogen[sg ? n : 0]; stab(bau, key, W3(r.u0, b), W3(r.u1, b), 0.16, 0.12, 0.3); }
}

stil('kykladen', (bau, pts, H, R, v, o) => {
  const op = schalter(v), K = 'kalk', B = op.has('gruen') ? 'gruenTuer' : 'blauTuer', lo = vorOrt(pts), h1 = 3.2, h2 = 2.9;
  const gw = op.has('gewoelbe') && lo.rechteck;
  const fassade = (f, v0, v1, vorne, tuer) => {
    if (f.L < 1.2) { f.wall(K, 0, f.L, v0, v1); return; }
    const ax = achsen(f.L, 2.4, 0.9), ops = [], deko = [], mitte = tuer ? Math.min(ax.length - 1, Math.floor(ax.length / 2)) : -1;
    ax.forEach((m, j) => {
      if (j === mitte) {
        const ow = { u0: m - 0.5, u1: m + 0.5, v0: v0 + 0.02, v1: v0 + 2.2 }; ops.push(rechteckU(ow));
        deko.push(() => {
          laibung(f, K, rechteckU(ow), 0.3, 0, true); f.wall(B, ow.u0, ow.u1, ow.v0, ow.v1 - 0.45, -0.29); f.wall('glas', ow.u0, ow.u1, ow.v1 - 0.4, ow.v1, -0.29);
          f.box(B, ow.u0, ow.u1, ow.v1 - 0.45, ow.v1 - 0.4, -0.29, -0.25); f.box(B, m - 0.02, m + 0.02, ow.v1 - 0.4, ow.v1, -0.29, -0.25);
          if (!o.leicht) for (let y = ow.v0 + 0.3; y < ow.v1 - 0.6; y += 0.32) f.leiste(B, ow.u0 + 0.06, ow.u1 - 0.06, y - 0.015, y + 0.015, -0.29, -0.27, true);
          f.box(K, ow.u0 - 0.06, ow.u1 + 0.06, v0, v0 + 0.06, 0, 0.35);   // Schwelle
        });
        return;
      }
      if (R() < (vorne ? 0.25 : 0.5)) return;
      const ow = { u0: m - 0.38, u1: m + 0.38, v0: v0 + 0.95, v1: v0 + 1.9 }; ops.push(rechteckU(ow));
      deko.push(() => {
        f.fenster(ow, { tiefe: 0.32, laibung: K, rahmen: B, rahmenBreite: 0.06, sprossen: false, kaempfer: true, glasKey: 'glasDunkel', flach: o.leicht, ohneRahmen: o.leicht });
        if (R() < 0.6) fensterlaeden(f, ow, B, o.leicht);
        f.box(K, ow.u0 - 0.05, ow.u1 + 0.05, ow.v0 - 0.06, ow.v0, 0, 0.06);
      });
    });
    wand(f, K, 0, f.L, v0, v1, ops);
    deko.forEach(d => d());
  };
  kanten(bau, pts).forEach(f => fassade(f, 0, h1, lo.vorne(f), lo.vorne(f)));
  kanten(bau, pts).forEach(f => umlauf(f, 'kalk', 0, 0.25, 0, 0.06));
  let hoch = h1 + 0.8;
  if (gw) {
    gewoelbe(bau, pts, lo, h1, Math.min(1.4, lo.B * 0.22), K);
    hoch = h1 + Math.min(1.4, lo.B * 0.22);
    const p = lo.P(lo.L * 0.82, lo.B * 0.3);
    schornstein(bau, p[0], p[1], lo.ax, h1 + 0.5, hoch + 0.9, K, 0.3, 0.3);
    // kleiner Glockengiebel über der Tür
    const fv = kanten(bau, pts).find(lo.vorne);
    if (fv) {
      const axg = achsen(fv.L, 2.4, 0.9), m = clamp(axg[Math.min(axg.length - 1, Math.floor(axg.length / 2))] ?? fv.L / 2, 0.9, fv.L - 0.9), um = bogenUmriss(m - 0.32, m + 0.32, h1 + 0.35, h1 + 0.9, 'rund', 8), y1 = h1 + 1.55, ya = y1 + 0.35, v0g = h1 - 0.02;
      const rand = [[m - 0.75, v0g], [m + 0.75, v0g], [m + 0.75, y1], [m, ya], [m - 0.75, y1]];
      flaeche(fv, K, rand, [um], 0.25); flaeche(fv, K, rand, [um], 0, fv.n.clone().negate());
      laibung(fv, K, um, 0.25, 0.25);
      const Bg = fv.bau, sd = (u0, v0, u1, v1, nn) => Bg.face(K, fv.P(u0, v0, 0), fv.P(u1, v1, 0), fv.P(u1, v1, 0.25), fv.P(u0, v0, 0.25), nn);
      sd(m - 0.75, v0g, m - 0.75, y1, fv.r.clone().negate()); sd(m + 0.75, v0g, m + 0.75, y1, fv.r);
      sd(m - 0.75, y1, m, ya, fv.r.clone().negate().add(UP)); sd(m + 0.75, y1, m, ya, fv.r.clone().add(UP)); sd(m - 0.75, v0g, m + 0.75, v0g, DOWN);
      const c = fv.P(m, h1 + 0.95, 0.12); kugel(bau, 'gold', c.x, c.y - 0.15, c.z, 0.16, 10);
      const k = fv.P(m, ya, 0.12); stange(bau, 'metall', k, k.clone().add(V(0, 0.5, 0)), 0.025, 5); stange(bau, 'metall', k.clone().add(V(0, 0.38, 0)).addScaledVector(fv.r, -0.15), k.clone().add(V(0, 0.38, 0)).addScaledVector(fv.r, 0.15), 0.02, 5);
    }
  } else {
    rundBruestung(bau, K, pts, h1, 0.8, 0.3, K);
    if (lo.rechteck && lo.L >= 5.5 && lo.B >= 5 && H > 4.5) {
      const ow = lo.L * (0.48 + R() * 0.14), od = Math.min(lo.B - 2.6, lo.B * (0.5 + R() * 0.1)), links = R() < 0.5;
      const a0 = links ? 0.35 : lo.L - 0.35 - ow, a1 = a0 + ow, s1 = lo.B - 0.35, s0 = s1 - od;
      const ring = lo.ring(a0, a1, s0, s1);
      kanten(bau, ring).forEach(f => fassade(f, h1 + 0.02, h1 + h2, lo.vorne(f), lo.vorne(f)));
      rundBruestung(bau, K, ring, h1 + h2, 0.6, 0.25, K);
      hoch = h1 + h2 + 0.6;
      // Pergola vor der oberen Tür
      const pa0 = a0 + 0.3, pa1 = a1 - 0.3, ps0 = Math.max(0.6, s0 - 2.3), ps1 = s0;
      if (ps1 - ps0 > 1.2) {
        const P3 = (a, s, y) => { const p = lo.P(a, s); return V(p[0], y, p[1]); };
        [[pa0, ps0], [pa1, ps0]].forEach(([a, s]) => { const p = lo.P(a, s); zylinder(bau, K, p[0], h1, p[1], 0.13, 0.11, 2.45, 10); });
        stab(bau, 'holzHell', P3(pa0 - 0.2, ps0, h1 + 2.45), P3(pa1 + 0.2, ps0, h1 + 2.45), 0.14, 0.18, 0);
        for (let a = pa0; a <= pa1 + 1e-6; a += (pa1 - pa0) / Math.max(1, Math.round((pa1 - pa0) / 0.45))) stab(bau, 'holzHell', P3(a, ps0 - 0.25, h1 + 2.63), P3(a, ps1, h1 + 2.63), 0.07, 0.1, 0);
        for (let k = 0; k < 6; k++) { const a = pa0 + R() * (pa1 - pa0 - 0.9), s2 = ps0 + R() * (ps1 - ps0 - 0.7); kiste(bau, 'pflanze', orientiere([lo.P(a, s2), lo.P(a + 0.6 + R() * 0.4, s2), lo.P(a + 0.6 + R() * 0.4, s2 + 0.5 + R() * 0.3), lo.P(a, s2 + 0.5 + R() * 0.3)]), h1 + 2.68, h1 + 2.74); }
      }
      // Treppe aus Mauerwerk von der Terrasse aufs obere Dach, an der freien Seite des Kubus
      const sa = links ? a1 : a0 - 0.9, sw = 0.9;
      if (sa > 0.4 && sa + sw < lo.L - 0.4) {
        const c = (a, s, y) => { const p = lo.P(a, s); return V(p[0], y, p[1]); };
        const top2 = h1 + h2 + 0.02, run = od - 0.7, s0t = s0 + 0.35, n = Math.round((top2 - h1) / 0.22);
        bau.hexa(K, [c(sa, s0t, h1), c(sa + sw, s0t, h1), c(sa + sw, s0t + run, h1), c(sa, s0t + run, h1), c(sa, s0t, h1 + 0.15), c(sa + sw, s0t, h1 + 0.15), c(sa + sw, s0t + run, top2 - 0.15), c(sa, s0t + run, top2 - 0.15)]);
        for (let k = 0; k < n; k++) {
          const sA = s0t + run * k / n, sB = s0t + run * (k + 1) / n, y = h1 + (top2 - h1) * (k + 1) / n;
          const ring2 = orientiere([lo.P(sa, sA), lo.P(sa + sw, sA), lo.P(sa + sw, sB), lo.P(sa, sB)]);
          kiste(bau, K, ring2, h1 + (top2 - h1) * k / n - 0.12, y);
        }
      }
      const p = lo.P(links ? a0 + 0.6 : a1 - 0.6, s1 - 0.6);
      schornstein(bau, p[0], p[1], lo.ax, h1 + h2, h1 + h2 + 1.4, K, 0.28, 0.28);
    }
  }
  // Bougainvillea: dichte Ranke neben und über der Tür, Stamm im weißen Topf
  const fv = kanten(bau, pts).find(lo.vorne);
  if (fv && fv.L > 3) {
    const ax = achsen(fv.L, 2.4, 0.9), mt = ax[Math.min(ax.length - 1, Math.floor(ax.length / 2))] ?? fv.L / 2, u = mt + (mt > fv.L / 2 ? -0.95 : 0.95);
    const c = fv.P(u, 0, 0.32); zylinder(bau, 'kalk', c.x, 0, c.z, 0.28, 0.24, 0.42, 10);
    stange(bau, 'holzDunkel', fv.P(u, 0.4, 0.3), fv.P(u, 2.2, 0.12), 0.04, 5);
    for (let k = 0; k < (o.leicht ? 24 : 60); k++) {
      const oben = k >= (o.leicht ? 14 : 34), uu = oben ? u + (mt - u) * R() * 1.15 : u + (R() - 0.5) * 0.75, vv = oben ? 2.35 + R() * 0.5 : 0.75 + R() * 1.9;
      const p = fv.P(uu, vv, 0.06 + R() * 0.2);
      bau.geo(k % 5 === 0 ? 'pflanze' : 'bluete', new THREE.IcosahedronGeometry(0.1 + R() * 0.08, 0), M.makeTranslation(p.x, p.y, p.z));
    }
  }
  return { floors: hoch > 5 ? 2 : 1, top: hoch };
}, 'Weiße Kuben der Kykladen: Kalkputz, blaue Türen, Fensterrahmen und Klappläden, gerundete Brüstungen, Dachterrasse mit oberem Kubus, Pergola mit Wein und gemauerter Treppe, wahlweise Tonnengewölbe mit Glockengiebel, Bougainvillea');

// ---------------------------------------------------------------------------------------------
// 8 Skandinavien: bunte Holzhäuser mit Deckleistenschalung, weißen Fenstern und steilem Dach

stil('skandi', (bau, pts, H, R, v, o) => {
  const op = schalter(v), farben = ['brettRot', 'brettOcker', 'brettWeiss', 'brettBlau', 'brettGruen', 'brettGrau'];
  const W = farben.find(k => op.has(k.slice(5).toLowerCase())) || wahl(R, farben), rot = op.has('ziegel') || (!op.has('schwarz') && R() < 0.4);
  const giebel = op.has('giebel'), N = H > 6.5 ? 2 : 1, so = 0.5, fH = 2.75, wt = so + N * fH, fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi;
    umlauf(f, 'granit', 0, so, 0, 0.05);
    const ax = achsen(f.L, 2.1, 0.9), mitte = Math.floor(ax.length / 2);
    for (let k = 0; k < N; k++) {
      const vv = so + k * fH, ops = [], deko = [];
      ax.forEach((m, j) => {
        if (vorne && k === 0 && j === mitte) {
          const ow = { u0: m - 0.48, u1: m + 0.48, v0: so + 0.02, v1: so + 2.1 }; ops.push(rechteckU(ow));
          deko.push(() => {
            laibung(f, 'lack', rechteckU(ow), 0.12, 0, true); f.wall('lack', ow.u0, ow.u1, ow.v0, ow.v1, -0.11);
            f.box('glas', m - 0.25, m + 0.25, so + 1.3, so + 1.9, -0.11, -0.09);
            if (!o.leicht) for (const y of [so + 0.3, so + 0.75]) f.box('rahmen', m - 0.32, m + 0.32, y, y + 0.35, -0.11, -0.09);
            f.box('lack', ow.u0 - 0.13, ow.u0, ow.v0, ow.v1 + 0.13, 0, 0.04); f.box('lack', ow.u1, ow.u1 + 0.13, ow.v0, ow.v1 + 0.13, 0, 0.04); f.box('lack', ow.u0 - 0.18, ow.u1 + 0.18, ow.v1 + 0.13, ow.v1 + 0.26, 0, 0.07);
            vordach(f, m - 0.85, m + 0.85, so + 2.55, 0.85, 0.3, { key: rot ? 'ziegelDach' : 'dachSchwarz', traufe: 'lack', unterseite: 'lack', dicke: 0.08 });
            for (const x of [m - 0.75, m + 0.75]) stab(bau, 'lack', f.P(x, so + 1.9, 0), f.P(x, so + 2.5, 0.75), 0.07, 0.07, 0.5);
            f.box('granit', m - 0.7, m + 0.7, 0, so - 0.15, 0, 0.45); f.box('granit', m - 0.7, m + 0.7, so - 0.15, so, 0, 0.25);
          });
          return;
        }
        if (!vorne && R() < 0.3) return;
        const ow = { u0: m - 0.42, u1: m + 0.42, v0: vv + 0.8, v1: vv + 2.15 }; ops.push(rechteckU(ow));
        deko.push(() => sprossenFenster(f, ow, { spalten: 2, zeilen: 1, mitte: ow.v0 + (ow.v1 - ow.v0) * 0.62, leicht: o.leicht }));
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
    }
    f.box('lack', 0, 0.15, so, wt, 0, 0.035); f.box('lack', f.L - 0.15, f.L + 0.035, so, wt, 0, 0.035);
    umlauf(f, 'lack', wt - 0.2, wt, 0, 0.03);
  });
  const d = satteldach(bau, pts, wt, { key: rot ? 'ziegelDach' : 'dachSchwarz', rillen: rot ? 'ziegel' : 'quer', abstand: rot ? 0.28 : 0.34, kantenHoehe: 0.025, neigung: giebel ? 0.9 : 0.8, ueberstand: 0.4, ortgang: 0.32, dicke: 0.14,
    first: rot ? 'ziegelDach' : 'dachSchwarz', firstBreite: 0.3, firstHoehe: 0.2, traufe: 'lack', ortgangKey: 'lack', unterseite: W, wand: W, richtung: giebel ? 'tiefe' : 'front', leicht: o.leicht,
    giebelLoch: (f, y0, yR) => {
      if (yR - y0 < 2.2 || f.L < 3.5) return [];
      const n = f.L > 7 ? 2 : 1, out = [];
      for (let k = 0; k < n; k++) { const m = f.L / 2 + (n === 2 ? (k ? 0.8 : -0.8) : 0); out.push(rechteckU({ u0: m - 0.36, u1: m + 0.36, v0: y0 + 0.6, v1: y0 + 1.75 })); }
      return out;
    },
    giebelDeko: (f, y0, yR) => {
      f.box('lack', 0, f.L, y0 - 0.02, y0 + 0.16, 0, 0.05);
      if (yR - y0 < 2.2 || f.L < 3.5) return;
      const n = f.L > 7 ? 2 : 1;
      for (let k = 0; k < n; k++) { const m = f.L / 2 + (n === 2 ? (k ? 0.8 : -0.8) : 0); sprossenFenster(f, { u0: m - 0.36, u1: m + 0.36, v0: y0 + 0.6, v1: y0 + 1.75 }, { spalten: 2, zeilen: 1, leicht: o.leicht }); }
    } });
  if (d.r) {
    const g = rahmen(pts, d.r.ax), tc = (g.t0 + g.t1) / 2, p = g.W(g.u0 + g.L * (0.3 + R() * 0.4), tc);
    schornstein(bau, p[0], p[1], d.r.ax, wt, d.yR + 0.8, R() < 0.5 ? 'kalk' : 'ziegel', 0.35, 0.35);
  }
  return { floors: N + 1, top: d.yF + 0.6 };
}, 'Skandinavisches Holzhaus: Deckleistenschalung in Falunrot, Ocker, Weiß, Blau oder Grün, weiße Eckbretter, Sprossenfenster mit Faschen, Haustür mit kleinem Vordach, Steinsockel, steiles Satteldach aus schwarzem Blech oder roten Ziegeln, Giebelfenster, Schornstein');

// ---------------------------------------------------------------------------------------------
// 9 Lateinamerika Kolonial: bunte Putzfassaden, Holzbalkone, Fenstergitter, Ziegeldach

stil('kolonial', (bau, pts, H, R, v, o) => {
  const op = schalter(v), farben = ['putzKoralle', 'putzMais', 'putzTuerkis', 'putzKobalt', 'putzFlieder', 'putzLimette', 'putzPink'];
  const W = farben.find(k => op.has(k.slice(4).toLowerCase())) || wahl(R, farben);
  const Z = op.has('sockelblau') ? 'putzKobalt' : wahl(R, farben.filter(k => k !== W)), flach = op.has('flach');
  const fH = 3.9, N = H > 5.5 ? 2 : 1, top = N * fH, fi = frontKante(pts), HZ = 'holzDunkel';
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi;
    if (f.L < 1.2) { f.wall(W, 0, f.L, 0, top); return; }
    const ax = achsen(f.L, 2.7, 1.1), mitte = Math.floor(ax.length / 2), luecken = [];
    for (let k = 0; k < N; k++) {
      const vv = k * fH, ops = [], deko = [];
      ax.forEach((m, j) => {
        if (k === 0 && vorne && j === mitte) {
          const um = bogenUmriss(m - 0.8, m + 0.8, 0.03, 2.3, 'rund', 12); ops.push(um); luecken.push([m - 1.1, m + 1.1]);
          deko.push(() => {
            laibung(f, 'sandsteinGelb', um, 0.45, 0.06, true); flaeche(f, HZ, um, [], -0.38);
            f.box('rahmenDunkel', m - 0.02, m + 0.02, 0.03, 3.1, -0.38, -0.35);
            if (!o.leicht) for (let y = 0.35; y < 2.3; y += 0.4) for (const sg of [-1, 1]) for (const x of [0.2, 0.5]) f.box('metall', m + sg * x - 0.025, m + sg * x + 0.025, y, y + 0.05, -0.38, -0.355);
            const [x0, x1] = bogenBreite(um), sch = bogenScheitel(um);
            flaeche(f, 'sandsteinGelb', [[x0 - 0.3, 0], [x1 + 0.3, 0], [x1 + 0.3, sch + 0.3], [x0 - 0.3, sch + 0.3]], [um], 0.06);
            plattenRand(f, 'sandsteinGelb', x0 - 0.3, x1 + 0.3, 0, sch + 0.3, 0, 0.06, false);
            f.box('sandsteinGelb', x0 - 0.4, x1 + 0.4, sch + 0.3, sch + 0.45, 0, 0.14);
          });
          return;
        }
        if (k === 0) {
          const ow = { u0: m - 0.55, u1: m + 0.55, v0: 0.75, v1: 3.0 }; ops.push(rechteckU(ow));
          deko.push(() => {
            f.fenster(ow, { tiefe: 0.35, laibung: W, rahmen: HZ, rahmenBreite: 0.07, sprossen: true, kaempfer: true, flach: o.leicht, ohneRahmen: o.leicht, glasKey: 'glas' });
            // vorstehendes Fenstergitter (Reja) mit Dach
            const g = 0.28, k2 = 'rahmenDunkel';
            f.box(W, ow.u0 - 0.15, ow.u1 + 0.15, ow.v0 - 0.12, ow.v0, 0, g + 0.06);
            f.box(k2, ow.u0 - 0.12, ow.u1 + 0.12, ow.v1 + 0.02, ow.v1 + 0.08, 0, g + 0.04);
            f.box('ziegelDach', ow.u0 - 0.2, ow.u1 + 0.2, ow.v1 + 0.08, ow.v1 + 0.16, 0, g + 0.14);
            if (o.leicht) return;
            for (let x = ow.u0 - 0.08; x <= ow.u1 + 0.081; x += (ow.u1 - ow.u0 + 0.16) / 9) f.box(k2, x - 0.012, x + 0.012, ow.v0, ow.v1 + 0.02, g - 0.01, g + 0.012);
            for (const y of [ow.v0 + 0.25, (ow.v0 + ow.v1) / 2, ow.v1 - 0.25]) f.box(k2, ow.u0 - 0.12, ow.u1 + 0.12, y - 0.015, y + 0.015, 0, g + 0.012);
            for (const x of [ow.u0 - 0.12, ow.u1 + 0.09]) f.box(k2, x, x + 0.03, ow.v0, ow.v1 + 0.02, 0, g + 0.012);
          });
          luecken.push([m - 0.72, m + 0.72]);
          return;
        }
        // Obergeschoss: Balkontüren mit Läden
        const ow = { u0: m - 0.5, u1: m + 0.5, v0: vv + 0.05, v1: vv + 2.75 }; ops.push(rechteckU(ow));
        deko.push(() => {
          f.fenster(ow, { tiefe: 0.3, laibung: W, rahmen: HZ, rahmenBreite: 0.07, sprossen: true, kaempfer: true, flach: o.leicht, ohneRahmen: o.leicht, glasKey: 'glasDunkel' });
          f.box('kalk', ow.u0 - 0.12, ow.u1 + 0.12, ow.v1, ow.v1 + 0.18, 0, 0.06);
          if (R() < 0.5) fensterlaeden(f, ow, HZ, o.leicht);
        });
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
    }
    // Sockel (Zócalo) zwischen den Öffnungen, Ecklisenen, Gesims
    let prev = 0;
    [...luecken.sort((a, b) => a[0] - b[0]), [f.L, f.L]].forEach(([a, b]) => { if (a - prev > 0.05) f.box(Z, prev, a, 0, 0.9, 0, 0.03, { unten: true }); prev = Math.max(prev, b); });
    f.box('kalk', 0, 0.32, 0, top, 0, 0.06); f.box('kalk', f.L - 0.32, f.L + 0.06, 0, top, 0, 0.06);
    if (N === 2) umlauf(f, 'kalk', fH - 0.12, fH + 0.1, 0, 0.1);
    umlauf(f, 'kalk', top - 0.38, top, 0, 0.16);
    // Holzbalkon im Obergeschoss über mehrere Öffnungen (Lima, Cartagena) mit eigenem Ziegeldach
    if (N === 2 && vorne && ax.length >= 2) {
      const a = ax[0] - 0.85, b = ax[Math.min(ax.length - 1, 2)] + 0.85, vv = fH, t = 0.95;
      f.box(HZ, a, b, vv - 0.12, vv + 0.05, 0, t);
      konsolen(f, a + 0.1, b - 0.1, vv - 0.12, t * 0.9, HZ);
      gelaender(f, HZ, a + 0.05, b - 0.05, vv + 0.05, 1.0, t - 0.06, 0.11, o.leicht);
      for (const x of [a, b - 0.04]) f.box(HZ, x, x + 0.04, vv + 0.05, vv + 1.05, 0, t);
      const pf = teilung(b - a - 0.2, 1.4).map(u => a + 0.1 + u);
      pf.forEach(u => f.box(HZ, u - 0.06, u + 0.06, vv + 0.05, vv + 2.95, t - 0.14, t - 0.02));
      f.box(HZ, a, b, vv + 2.85, vv + 3.0, t - 0.16, t);
      vordach(f, a - 0.1, b + 0.1, vv + 3.0, t + 0.2, 0.42, { key: 'ziegelDach', rillen: 'ziegel', abstand: 0.24, leicht: o.leicht, traufe: HZ, unterseite: HZ, dicke: 0.08 });
    }
  });
  if (flach) {
    const innen = flachdach(bau, pts, top, W, 0.7, 0.3, 'kalk');
    traufband(bau, pts, top + 0.45, 0.4, 0.6, { key: 'ziegelDach', rillen: 'ziegel', abstand: 0.25, leicht: o.leicht, traufe: 'kalk', unterseite: 'kalk', dicke: 0.08 });
    void innen;
    return { floors: N, top: top + 0.9 };
  }
  const ue = 0.85, tan = Math.tan(0.42);
  const d = walmdach(bau, pts, top, { key: 'ziegelDach', rillen: 'ziegel', abstand: 0.27, neigung: 0.42, ueberstand: ue, dicke: 0.12, first: 'ziegelDach', firstBreite: 0.3, firstHoehe: 0.22, traufe: HZ, unterseite: 'holzHell', leicht: o.leicht });
  if (!o.leicht) kanten(bau, pts).forEach(f => { for (let u = 0.3; u < f.L - 0.2; u += 0.62) stab(bau, HZ, f.P(u, top - 0.02, 0), f.P(u, top - 0.02 - (ue - 0.08) * tan, ue - 0.08), 0.08, 0.13, 1); });
  return { floors: N, top: d.yF };
}, 'Kolonialhaus in Lateinamerika: bunter Kalkputz mit farbigem Sockel, weiße Lisenen und Gesimse, Rundbogenportal aus Sandstein mit beschlagener Holztür, vorstehende Fenstergitter mit Ziegeldach, Holzbalkon auf Konsolen mit eigenem Ziegeldach, Walmdach aus Hohlziegeln mit sichtbaren Sparren oder Flachdach mit Ziegelkante');

// ---------------------------------------------------------------------------------------------
// 10 Indien: Haveli mit Jharokhas, Chhajjas und Chhatris, oder Stadthaus mit Balkonen und Wassertank

function jharokha(f, m, v0, s) {
  const b = s.breite ?? 1.5, t = s.tiefe ?? 0.75, h = s.hoehe ?? 1.8, S = s.stein, L = s.leicht;
  f.box(S, m - b / 2 - 0.1, m + b / 2 + 0.1, v0 - 0.22, v0, 0, t + 0.1);
  konsolen(f, m - b / 2 + 0.05, m + b / 2 - 0.05, v0 - 0.22, t * 0.95, S, 3);
  const A = f.P(m + b / 2, 0, 0), B = f.P(m + b / 2, 0, t), C = f.P(m - b / 2, 0, t), D = f.P(m - b / 2, 0, 0), P2 = p => [p.x, p.z];
  [[A, B], [B, C], [C, D]].forEach(([a, c], j) => {
    const g = new Fassade(f.bau, P2(a), P2(c)), n = j === 1 && b > 1.3 ? 3 : 1, bw = g.L / n, ops = [];
    for (let k = 0; k < n; k++) { const x0 = k * bw + 0.1, x1 = (k + 1) * bw - 0.1; if (x1 - x0 > 0.2) ops.push(bogenUmriss(x0, x1, v0 + 0.55, v0 + h - (x1 - x0) * 0.7 - 0.12, 'zack', 10)); }
    wand(g, S, 0, g.L, v0, v0 + h, ops);
    ops.forEach(um => { oeffnung(g, um, { tiefe: 0.08, laibung: S, fuellung: 'schiefer' }); if (!L) { const [x0, x1] = bogenBreite(um); for (let x = x0 + 0.08; x < x1 - 0.04; x += 0.09) g.box(S, x - 0.012, x + 0.012, v0 + 0.55, v0 + 0.55 + (bogenScheitel(um) - v0 - 0.55) * 0.55, -0.05, -0.02); } });
    g.box(S, -0.02, g.L + 0.02, v0 + 0.42, v0 + 0.5, 0, 0.05);
  });
  f.box(S, m - b / 2 - 0.15, m + b / 2 + 0.15, v0 + h, v0 + h + 0.12, -0.05, t + 0.15);
  tonne(f, S, m - b / 2 - 0.1, m + b / 2 + 0.1, t / 2, v0 + h + 0.12, t / 2 + 0.12, 0.9, 8);
  const c = f.P(m, v0 + h + 0.12 + (t / 2 + 0.12) * 0.9, t / 2);
  zylinder(f.bau, S, c.x, c.y - 0.02, c.z, 0.05, 0.05, 0.22, 6); kugel(f.bau, s.spitze || S, c.x, c.y + 0.28, c.z, 0.09, 8);
}

function chhatri(bau, x, z, ax, s, y, S, spitze) {
  kiste(bau, S, quadrat(x, z, ax, s / 2 + 0.12), y, y + 0.25);
  quadrat(x, z, ax, s / 2 - 0.08).forEach(([px, pz]) => zylinder(bau, S, px, y + 0.25, pz, 0.08, 0.07, 1.45, 8));
  kiste(bau, S, quadrat(x, z, ax, s / 2 + 0.1), y + 1.7, y + 1.86);
  kuppel(bau, S, x, y + 1.86, z, s * 0.42, 1.05, spitze);
}

function haveliStadt(bau, pts, H, R, op, o) {
  const farben = ['putzPink', 'putzTuerkis', 'putzMais', 'putzIndigo', 'putzLimette', 'putzKoralle'];
  const W = farben.find(k => op.has(k.slice(4).toLowerCase())) || wahl(R, farben);
  const gH = 3.4, fH = 3.1, N = clamp(Math.round((H - gH) / fH), 1, 8), top = gH + N * fH, fi = frontKante(pts), r = rahmen(pts);
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi;
    if (vorne && !o.ohneLaden) {   // Läden mit Rolltoren
      const n = Math.max(1, Math.round(f.L / 3.2)), bw = f.L / n, ops = [];
      for (let k = 0; k < n; k++) ops.push({ u0: k * bw + 0.3, u1: (k + 1) * bw - 0.3, v0: 0.02, v1: gH - 0.6 });
      wand(f, W, 0, f.L, 0, gH, ops.map(rechteckU));
      ops.forEach((ow, k) => {
        laibung(f, W, rechteckU(ow), 0.25, 0, true);
        if (k % 2) f.wall('glas', ow.u0, ow.u1, ow.v0, ow.v1, -0.24);
        else { f.wall('metall', ow.u0, ow.u1, ow.v0, ow.v1, -0.24); if (!o.leicht) for (let y = ow.v0 + 0.12; y < ow.v1; y += 0.12) f.leiste('technik', ow.u0, ow.u1, y - 0.01, y + 0.01, -0.24, -0.225, true); }
        schild(bau, ['schildRot', 'schildGelb', 'schildBlau', 'schildGruen'][k % 4], f, ow.u0, ow.u1, gH - 0.55, gH - 0.1, 0, 0.1, true);
      });
    } else f.wall(W, 0, f.L, 0, gH);
    const ax = achsen(f.L, 3.0, 1.0);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, ops = [], deko = [];
      ax.forEach(m => {
        if (!vorne && R() < 0.4) return;
        const ow = { u0: m - 0.6, u1: m + 0.6, v0: vv + 0.75, v1: vv + 2.2 }; ops.push(rechteckU(ow));
        deko.push(() => {
          f.fenster(ow, { tiefe: 0.2, laibung: W, rahmen: 'metall', rahmenBreite: 0.05, sprossen: true, flach: o.leicht, ohneRahmen: o.leicht, glasKey: 'glasDunkel' });
          if (!o.leicht) gitter(f, ow, 0.1, 'ladenGruen');
          f.box('beton', ow.u0 - 0.25, ow.u1 + 0.25, ow.v1 + 0.18, ow.v1 + 0.26, 0, 0.55);   // Chhajja aus Beton
          if (R() < 0.35) klimageraet(f, m + 1.0 > f.L - 0.5 ? m - 1.05 : m + 1.05, vv + 0.4);
        });
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
      if (vorne) {   // Balkon über die ganze Front
        f.box('beton', 0.1, f.L - 0.1, vv - 0.16, vv + 0.04, 0, 1.0);
        gelaender(f, 'ladenGruen', 0.15, f.L - 0.15, vv + 0.04, 1.0, 0.95, 0.11, o.leicht);
        for (const x of [0.12, f.L - 0.16]) f.box('ladenGruen', x, x + 0.04, vv + 0.04, vv + 1.04, 0, 0.98);
      }
      umlauf(f, 'beton', vv - 0.16, vv + 0.02, 0, 0.04);
    }
  });
  const innen = dach(bau, pts, top, W, 1.0, 0.22, 'beton');
  const pl = dachPlaetze(innen, [], R, 3, 1.1);
  if (pl[0]) { const [x, z] = pl[0], ring = quadrat(x, z, r.ax, 1.3, 1.4); kiste(bau, W, ring, top, top + 2.6, 'beton'); kanten(bau, ring).forEach((f, j) => { if (j === 0) f.wall('ladenGruen', f.L / 2 - 0.45, f.L / 2 + 0.45, top + 0.02, top + 2.05, 0.02); }); }
  pl.slice(1).forEach(([x, z]) => {   // schwarze Wassertanks auf Stahlgestell
    kiste(bau, 'rahmenDunkel', quadrat(x, z, r.ax, 0.75), top + 0.9, top + 0.98);
    quadrat(x, z, r.ax, 0.7).forEach(([px, pz]) => zylinder(bau, 'rahmenDunkel', px, top, pz, 0.04, 0.04, 0.9, 5));
    zylinder(bau, 'tankSchwarz', x, top + 0.98, z, 0.6, 0.55, 1.15, 14); zylinder(bau, 'tankSchwarz', x, top + 2.13, z, 0.55, 0.2, 0.18, 14);
  });
  if (!o.leicht) innen.forEach(([x, z], k) => { if (k % 2 === 0) for (const d of [-0.06, 0.06]) zylinder(bau, 'rahmenDunkel', x + d, top + 1.0, z, 0.012, 0.012, 1.2, 4); });   // Bewehrung für ein späteres Geschoss
  return { floors: N + 1, top: top + 2.6 };
}

stil('haveli', (bau, pts, H, R, v, o) => {
  const op = schalter(v);
  if (op.has('stadt')) return haveliStadt(bau, pts, H, R, op, o);
  const mt = { rot: 'sandsteinRot', gelb: 'sandsteinGelb', blau: 'putzIndigo', rosa: 'putzPink', ocker: 'putzOcker' };
  const W = Object.entries(mt).find(([k]) => op.has(k))?.[1] || wahl(R, Object.values(mt));
  const S = W.startsWith('sandstein') ? W : 'sandsteinGelb', fH = 3.4, N = clamp(Math.round(H / fH), 2, 6), top = N * fH, fi = frontKante(pts), r = rahmen(pts);
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi;
    if (f.L < 1.2) { f.wall(W, 0, f.L, 0, top); return; }
    umlauf(f, S, 0, 0.6, 0, 0.06);
    const ax = achsen(f.L, 2.9, 1.0), mitte = Math.floor(ax.length / 2);
    for (let k = 0; k < N; k++) {
      const vv = k * fH, ops = [], deko = [];
      ax.forEach((m, j) => {
        if (k === 0 && vorne && j === mitte) {   // Tor mit gelapptem Bogen
          const um = bogenUmriss(m - 0.95, m + 0.95, 0.03, 1.85, 'zack', 14); ops.push(um);
          deko.push(() => {
            laibung(f, S, um, 0.5, 0.06, true); flaeche(f, 'holzDunkel', um, [], -0.43);
            f.box('rahmenDunkel', m - 0.02, m + 0.02, 0.03, 2.9, -0.43, -0.4);
            if (!o.leicht) for (let y = 0.3; y < 2.0; y += 0.32) for (const sg of [-1, 1]) for (const x of [0.25, 0.6]) zylinder(bau, 'metall', f.P(m + sg * x, y, -0.42).x, y, f.P(m + sg * x, y, -0.42).z, 0.03, 0.03, 0.06, 6);
            const [x0, x1] = bogenBreite(um), sch = bogenScheitel(um);
            flaeche(f, S, [[x0 - 0.35, 0], [x1 + 0.35, 0], [x1 + 0.35, sch + 0.35], [x0 - 0.35, sch + 0.35]], [um], 0.06);
            plattenRand(f, S, x0 - 0.35, x1 + 0.35, 0, sch + 0.35, 0, 0.06, false);
          });
          return;
        }
        if (k >= 1 && vorne && (j + k) % 2 === 0 && f.L >= 4) { deko.push(() => jharokha(f, m, vv + 0.45, { stein: S, leicht: o.leicht, spitze: S, breite: 1.5 })); return; }
        if (k === 0) {
          const ow = { u0: m - 0.32, u1: m + 0.32, v0: 1.3, v1: 2.3 }; ops.push(rechteckU(ow));
          deko.push(() => { f.fenster(ow, { tiefe: 0.3, laibung: S, ohneRahmen: true, glasKey: 'schiefer', flach: o.leicht }); if (!o.leicht) gitter(f, ow, 0.09, S); });
          return;
        }
        if (!vorne && R() < 0.35) return;
        const um = bogenUmriss(m - 0.42, m + 0.42, vv + 0.75, vv + 1.85, 'zack', 10); ops.push(um);
        deko.push(() => {
          oeffnung(f, um, { tiefe: 0.3, laibung: S, fuellung: 'glasDunkel', rahmen: 'holzDunkel', rahmenBreite: 0.05, leicht: o.leicht });
          const [x0, x1] = bogenBreite(um); f.box(S, x0 - 0.1, x1 + 0.1, vv + 0.63, vv + 0.75, 0, 0.1);
          if (R() < 0.5) fensterlaeden(f, { u0: x0, u1: x1, v0: vv + 0.75, v1: vv + 1.85 }, 'gruenTuer', o.leicht);
        });
      });
      wand(f, W, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
      // Chhajja: dünnes Steinvordach auf Konsolen über jedem Geschoss
      const vy = vv + fH - 0.32, sperr = [];
      if (vorne && k === 0) sperr.push([ax[mitte] - 1.45, ax[mitte] + 1.45]);
      if (vorne && k + 1 < N && f.L >= 4) ax.forEach((m, j) => { if ((j + k + 1) % 2 === 0) sperr.push([m - 0.95, m + 0.95]); });
      let prev = -0.05;
      [...sperr.sort((a, b) => a[0] - b[0]), [f.L + 0.05, f.L + 0.05]].forEach(([a, b]) => {
        if (a - prev > 0.4) {
          vordach(f, prev, a, vy, 0.62, 0.16, { key: S, traufe: S, unterseite: S, ortgangKey: S, dicke: 0.07 });
          if (!o.leicht) for (let u = prev + 0.3; u < a - 0.2; u += 0.85) { f.box(S, u - 0.05, u + 0.05, vy - 0.28, vy - 0.02, 0, 0.36); f.box(S, u - 0.04, u + 0.04, vy - 0.42, vy - 0.28, 0, 0.16); }
        }
        prev = Math.max(prev, b);
      });
    }
  });
  const innen = flachdach(bau, pts, top, W, 0.9, 0.3, S);
  kanten(bau, pts).forEach(f => zinnen(f, top + 0.96, 0.3, { key: S, abstand: 0.6, hoehe: 0.28, leicht: true }));
  const ec = offsetRing(pts, -1.2);
  if (r.rechteck && r.L > 7 && r.B > 6) ec.forEach(([x, z], k) => { if (k % 2 === 0 || r.L > 11) chhatri(bau, x, z, r.ax, 1.5, top, S, 'gold'); });
  void innen;
  return { floors: N, top: top + 2.6 };
}, 'Indisches Haus: Haveli aus rotem oder gelbem Sandstein oder in Indigo und Rosa, Tor mit gelapptem Bogen und beschlagener Tür, Jharokhas auf Konsolen mit Jali und Bangaldar Dach, Chhajjas über jedem Geschoss, Dachterrasse mit Zinnen und Chhatris. Variante Stadthaus mit Läden, Balkonen, Gittern, Klimageräten und schwarzen Wassertanks');

// ---------------------------------------------------------------------------------------------
// Westafrika (Sahel): Lehmbau mit Pfeilern, Zinnen, Holzstangen (Toron)

stil('sahel', (bau, pts, H, R, v, o) => {
  const K = 'lehm', fH = 3.2, N = clamp(Math.round(H / fH), 1, 3), top = N * fH, PH = 1.0, fi = frontKante(pts);
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi;
    if (f.L < 1.5) { f.wall(K, 0, f.L, 0, top); return; }
    const pf = teilung(f.L, 1.9).filter(u => u > 0.5 && u < f.L - 0.5);
    const fel = [0, ...pf, f.L];
    for (let k = 0; k < N; k++) {
      const vv = k * fH, ops = [], deko = [];
      for (let j = 0; j < fel.length - 1; j++) {
        const m = (fel[j] + fel[j + 1]) / 2;
        if (vorne && k === 0 && j === Math.floor((fel.length - 1) / 2)) {
          const ow = { u0: m - 0.55, u1: m + 0.55, v0: 0.02, v1: 2.2 }; ops.push(rechteckU(ow));
          deko.push(() => { laibung(f, K, rechteckU(ow), 0.45, 0, true); f.wall('holzDunkel', ow.u0, ow.u1, ow.v0, ow.v1, -0.44); if (!o.leicht) for (let x = ow.u0 + 0.12; x < ow.u1; x += 0.18) f.box('holzHell', x - 0.03, x + 0.03, ow.v0, ow.v1, -0.44, -0.41); f.box('holzDunkel', ow.u0 - 0.1, ow.u1 + 0.1, ow.v1, ow.v1 + 0.12, -0.1, 0.05); });
          continue;
        }
        if (R() < 0.45) continue;
        const ow = { u0: m - 0.28, u1: m + 0.28, v0: vv + 1.4, v1: vv + 2.1 }; ops.push(rechteckU(ow));
        deko.push(() => { laibung(f, K, rechteckU(ow), 0.4, 0, false); f.wall('holzDunkel', ow.u0, ow.u1, ow.v0, ow.v1, -0.39); f.box('holzDunkel', ow.u0 - 0.06, ow.u1 + 0.06, ow.v1, ow.v1 + 0.07, 0, 0.06); });
      }
      wand(f, K, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
    }
    // Pfeiler mit Spitzen über die Brüstung, Toron Stangen in Reihen
    pf.forEach(u => {
      const B = bau, c = (du, v, w) => f.P(u + du, v, w), y1 = top + PH + 1.0;
      B.hexa(K, [c(-0.26, 0, 0), c(0.26, 0, 0), c(0.26, 0, 0.42), c(-0.26, 0, 0.42), c(-0.17, y1, 0), c(0.17, y1, 0), c(0.17, y1, 0.22), c(-0.17, y1, 0.22)]);
      const s = c(0, y1, 0.1); B.geo(K, new THREE.ConeGeometry(0.19, 0.6, 8), M.makeTranslation(s.x, y1 + 0.3, s.z));
    });
    for (const vy of [top * 0.33, top * 0.66, top - 0.3]) for (let u = 0.6; u < f.L - 0.4; u += 0.75) {
      if (pf.some(p => Math.abs(p - u) < 0.4)) continue;
      stange(bau, 'holzDunkel', f.P(u, vy, -0.2), f.P(u, vy - 0.03, 0.55), 0.045, 5);
    }
  });
  const innen = rundBruestung(bau, K, pts, top, PH, 0.35, 'lehm');
  kanten(bau, pts).forEach(f => { const n = Math.floor(f.L / 0.7); for (let k = 1; k < n; k++) { const u = f.L * k / n, c = f.P(u, top + PH - 0.05, -0.17); bau.geo(K, new THREE.ConeGeometry(0.13, 0.42, 6), M.makeTranslation(c.x, c.y + 0.21, c.z)); } });
  void innen;
  return { floors: N, top: top + PH + 1.6 };
}, 'Lehmbau im Sahel nach dem Vorbild von Djenné und Timbuktu: gerundete Kanten, Pfeiler mit kegelförmigen Spitzen über der Brüstung, Reihen von Holzstangen (Toron), kleine tiefe Fenster, Holztür, gerundete Brüstung mit kleinen Spitzen');

// ---------------------------------------------------------------------------------------------
// China: Wohnhochhaus mit Fliesen, Erkerfenstern, Glasbalkonen, Klimakäfigen und Dachkrone

stil('china', (bau, pts, H, R, v, o) => {
  const op = schalter(v), F = op.has('beige') ? 'kachelBeige' : 'kachelWeiss', A = 'kachelBraun';
  const gH = 4.6, fH = 2.95, N = Math.max(6, Math.round((H - gH - 4) / fH)), top = gH + N * fH, fi = frontKante(pts);
  if (!o.ohneLaden) lobbyRing(bau, pts, gH, 1.5, 'granit', 'glas');
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi, lang = f.L > 12;
    if (o.ohneLaden) f.wall('granit', 0, f.L, 0, gH);
    const einheiten = teilung(f.L, lang ? 6.2 : 4.8);
    for (let k = 0; k < N; k++) {
      const vv = gH + k * fH, ops = [], deko = [];
      for (let j = 0; j < einheiten.length - 1; j++) {
        const a = einheiten[j], b = einheiten[j + 1], w = b - a;
        if (w < 2.2) continue;
        if (lang && j % 2 === 0) {   // Glasbalkon (verglaste Loggia)
          const ow = { u0: a + 0.45, u1: b - 1.25, v0: vv + 0.02, v1: vv + fH - 0.32 };
          ops.push(rechteckU(ow));
          deko.push(() => {
            laibung(f, F, rechteckU(ow), 0.6, 0, true);
            f.bau.face('beton', f.P(ow.u0, ow.v0, 0), f.P(ow.u1, ow.v0, 0), f.P(ow.u1, ow.v0, -0.6), f.P(ow.u0, ow.v0, -0.6), UP);
            f.wall('glasDunkel', ow.u0, ow.u1, ow.v0, ow.v1, -0.59);
            f.box('weiss', ow.u0, ow.u1, ow.v0, ow.v0 + 0.95, -0.12, -0.04);
            f.wall('glasHell', ow.u0, ow.u1, ow.v0 + 0.95, ow.v1, -0.1);
            if (!o.leicht) teilung(ow.u1 - ow.u0, 0.9).forEach(u => f.leiste('weiss', ow.u0 + Math.max(0, u - 0.025), ow.u0 + Math.min(ow.u1 - ow.u0, u + 0.025), ow.v0 + 0.95, ow.v1, -0.11, -0.07));
          });
          deko.push(() => {   // Klimakäfig neben dem Balkon
            const u = b - 0.82; f.box('weiss', u - 0.45, u + 0.45, vv + 0.25, vv + 0.31, 0, 0.55);
            f.box('technik', u - 0.38, u + 0.38, vv + 0.31, vv + 0.86, 0.06, 0.4);
            if (!o.leicht) for (let y = vv + 0.36; y < vv + 1.1; y += 0.09) f.leiste('weiss', u - 0.45, u + 0.45, y - 0.012, y + 0.012, 0.5, 0.55, true);
            f.box('weiss', u - 0.45, u + 0.45, vv + 1.1, vv + 1.15, 0, 0.55);
          });
        } else {   // Erkerfenster aus der Fassade
          const m = (a + b) / 2, bw = Math.min(2.4, w - 1.2), ow = { u0: m - bw / 2, u1: m + bw / 2, v0: vv + 0.55, v1: vv + 2.35 };
          deko.push(() => {
            f.box(F, ow.u0 - 0.12, ow.u1 + 0.12, ow.v0 - 0.12, ow.v0, 0, 0.55); f.box(F, ow.u0 - 0.12, ow.u1 + 0.12, ow.v1, ow.v1 + 0.12, 0, 0.55);
            f.wall('glas', ow.u0, ow.u1, ow.v0, ow.v1, 0.5);
            f.bau.face('glas', f.P(ow.u0, ow.v0, 0), f.P(ow.u0, ow.v0, 0.5), f.P(ow.u0, ow.v1, 0.5), f.P(ow.u0, ow.v1, 0), f.r.clone().negate());
            f.bau.face('glas', f.P(ow.u1, ow.v0, 0), f.P(ow.u1, ow.v0, 0.5), f.P(ow.u1, ow.v1, 0.5), f.P(ow.u1, ow.v1, 0), f.r);
            if (!o.leicht) { for (const u of [ow.u0, ow.u0 + bw / 2, ow.u1]) f.box('weiss', u - 0.03, u + 0.03, ow.v0, ow.v1, 0.47, 0.53); f.box('weiss', ow.u0, ow.u1, ow.v0 + 1.3, ow.v0 + 1.35, 0.47, 0.53); }
          });
          if (w - bw > 1.6 && !lang) deko.push(() => { const u = b - 0.55; f.box('weiss', u - 0.42, u + 0.42, vv + 0.25, vv + 0.31, 0, 0.5); f.box('technik', u - 0.35, u + 0.35, vv + 0.31, vv + 0.82, 0.06, 0.38); if (!o.leicht) for (let y = vv + 0.36; y < vv + 1.0; y += 0.09) f.leiste('weiss', u - 0.42, u + 0.42, y - 0.012, y + 0.012, 0.45, 0.5, true); });
        }
      }
      wand(f, F, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
    }
    einheiten.forEach((u, j) => { if (j > 0 && j < einheiten.length - 1) f.box(A, u - 0.3, u + 0.3, gH, top + 1.4, 0, 0.12); });
    f.box(A, 0, f.L + 0.12, gH - 0.2, gH + 0.1, 0, 0.12);
  });
  // Dachkrone: zurückgesetztes Technikgeschoss mit Walmdach und offenem Rahmen
  const innen = dach(bau, pts, top, F, 1.4, 0.3, 'weiss');
  const kr = offsetRing(vereinfache(pts), -1.8);
  kanten(bau, kr).forEach(f => { f.wall(F, 0, f.L, top, top + 3.2); teilung(f.L, 1.6).forEach(u => f.box(A, Math.max(0, u - 0.12), Math.min(f.L, u + 0.12), top, top + 3.2, 0, 0.08)); });
  const d = walmdach(bau, kr, top + 3.2, { key: 'dachSchwarz', rillen: 'quer', abstand: 0.45, neigung: 0.55, ueberstand: 0.5, dicke: 0.15, first: 'dachSchwarz', traufe: 'weiss', leicht: o.leicht });
  void innen;
  return { floors: N + 1, top: d.yF };
}, 'Chinesisches Wohnhochhaus: weiße oder beige Fliesen mit braunen Lisenen, Erkerfenster, verglaste Balkone, Klimageräte in weißen Lamellenkäfigen, Lobby aus Granit, Dachkrone mit Technikgeschoss und dunklem Walmdach');

// ---------------------------------------------------------------------------------------------
// Osteuropa: Plattenbau mit Fugen, Loggien und farbigen Brüstungen

stil('platte', (bau, pts, H, R, v, o) => {
  const op = schalter(v), fH = 2.8, N = clamp(Math.round((H - 0.6) / fH), 3, 16), so = 0.6, top = so + N * fH, fi = frontKante(pts);
  const bunt = ['putzKoralle', 'putzMais', 'putzTuerkis', 'putzLimette', 'putzKobalt'], P = op.has('platten') ? 'platten' : 'sichtbeton';
  kanten(bau, pts).forEach((f, i) => {
    const vorne = i === fi, hinten = f.n.dot(new Fassade(bau, pts[fi], pts[(fi + 1) % pts.length]).n) < -0.9;
    umlauf(f, 'granit', 0, so, 0, 0.04);
    const felder = teilung(f.L, 3.6);
    for (let k = 0; k < N; k++) {
      const vv = so + k * fH, ops = [], deko = [];
      for (let j = 0; j < felder.length - 1; j++) {
        const a = felder[j], b = felder[j + 1], m = (a + b) / 2;
        if (b - a < 2.5) continue;
        if (vorne && k === 0 && Math.abs(m - f.L / 2) < (b - a) / 2 + 0.9) continue;
        if ((vorne || hinten) && j % 3 === 1) {   // Loggia mit farbiger Brüstung
          const ow = { u0: a + 0.15, u1: b - 0.15, v0: vv + 0.02, v1: vv + fH - 0.25 }; ops.push(rechteckU(ow));
          const fk = bunt[(j + (vorne ? 0 : 2)) % bunt.length];
          deko.push(() => {
            laibung(f, P, rechteckU(ow), 1.2, 0, true);
            f.bau.face('beton', f.P(ow.u0, ow.v0, 0), f.P(ow.u1, ow.v0, 0), f.P(ow.u1, ow.v0, -1.2), f.P(ow.u0, ow.v0, -1.2), UP);
            f.wall(P, ow.u0, ow.u1, ow.v0, ow.v1, -1.2);
            f.wall('glas', m - 1.1, m + 0.2, ow.v0 + 0.05, ow.v1 - 0.25, -1.19); f.wall('holzHell', m + 0.35, m + 1.1, ow.v0 + 0.05, ow.v1 - 0.25, -1.19);
            f.box(fk, ow.u0, ow.u1, ow.v0, ow.v0 + 1.0, -0.12, 0.02);
          });
        } else {
          const ow = { u0: m - 0.75, u1: m + 0.75, v0: vv + 0.85, v1: vv + 2.3 }; ops.push(rechteckU(ow));
          deko.push(() => f.fenster(ow, { tiefe: 0.18, laibung: P, rahmen: 'rahmen', rahmenBreite: 0.06, sprossen: true, kaempfer: true, flach: o.leicht, ohneRahmen: o.leicht }));
        }
      }
      wand(f, P, 0, f.L, vv, vv + fH, ops);
      deko.forEach(d => d());
      if (!o.leicht) f.leiste('technikDunkel', 0, f.L, vv - 0.015, vv + 0.015, 0, 0.012, true);
    }
    if (!o.leicht) felder.forEach(u => f.leiste('technikDunkel', Math.max(0, u - 0.015), Math.min(f.L, u + 0.015), so, top, 0, 0.012));
    if (vorne) {   // Hauseingang mit Vordach
      const m = f.L / 2, ow = { u0: m - 0.8, u1: m + 0.8, v0: so + 0.02, v1: so + 2.3 };
      f.box('sichtbeton', m - 1.6, m + 1.6, so + 2.5, so + 2.7, 0, 1.6);
      f.box('granit', m - 1.2, m + 1.2, 0, so, 0, 1.4);
      f.box('ladenSchwarz', ow.u0, ow.u1, ow.v0, ow.v1, 0, 0.05); f.box('glas', ow.u0 + 0.12, ow.u1 - 0.12, ow.v0 + 0.9, ow.v1 - 0.12, 0.05, 0.06);
    }
  });
  const innen = dach(bau, pts, top, P, 0.5, 0.25, 'technikDunkel');
  dachTechnik(bau, offsetRing(innen, -0.4), top, R, { viel: 0.6 });
  return { floors: N, top: top + 3.6 };
}, 'Plattenbau aus Großtafeln: sichtbare Fugen, Fenster mit Kämpfer, Loggien mit farbigen Brüstungen, Hauseingang mit Betonvordach, Flachdach mit Aufzugsüberfahrt und Antennen');

// ---------------------------------------------------------------------------------------------
// Galerie (Reihenfolge der Regionen = Reihen im Dashboard). Straßenseite jeweils nach +z.

const RE = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];

export const STILE = [
  { id: 'riad_hof', name: 'Riad mit Innenhof', region: 'Marokko', type: 'riad', variant: 'terrakotta', pts: RE(15, 13), height: 7, seed: 3,
    info: 'Medina Haus in Marrakesch Rot: Hufeisenbogen mit Zellige Rahmen und grünem Ziegeldach, kleine vergitterte Fenster, Maschrabiya Erker auf Konsolen, glasierte grüne Traufe, gestufte Zinnen, Innenhof mit Brunnen und Orangenbäumen.' },
  { id: 'riad_minarett', name: 'Haus mit Minarett', region: 'Marokko', type: 'riad', variant: 'ocker minarett', pts: RE(16, 14), height: 7, seed: 11,
    info: 'Ockerfarbene Anlage mit quadratischem Minarett: Blendbögen, Sebka Rautennetz, Zellige Band, Zinnen, Laterne mit grünem Pyramidendach und drei goldenen Kugeln. Innenhof mit Brunnen.' },
  { id: 'golf_alt', name: 'Haus mit Windturm', region: 'Arabischer Golf', type: 'golf', variant: 'traditionell', pts: RE(15, 12), height: 7, seed: 4,
    info: 'Traditionelles Haus am Golf: Sandputz, zwei Windtürme (Barjeel) mit offenen Schlitzen, Kreuzwänden und Holzstangen, Spitzbogenloggia mit Holzbrüstung, Maschrabiya, Läden, Lüftungsdreiecke und Dreieckszinnen.' },
  { id: 'golf_modern', name: 'Wohnhaus modern', region: 'Arabischer Golf', type: 'golf', variant: 'modern', pts: RE(16, 14), height: 19, seed: 6,
    info: 'Zeitgenössisches Wohnhaus am Golf: Sandputz, Glasfelder hinter weißen Gitterschirmen im Rautenmuster, schmale Schlitzfenster, Lobby, Dachterrasse mit Pergola und schlankem Treppenturm wie ein moderner Windturm.' },
  { id: 'machiya', name: 'Machiya', region: 'Japan traditionell', type: 'machiya', variant: 'rot', pts: RE(7.5, 12), height: 7, seed: 5,
    info: 'Stadthaus aus Kyoto: rote Bengara Holzgitter vor Papier, Noren am Eingang, Hisashi Vordach mit Sparren, weißer Lehmputz mit Mushiko Fenstern, Kawara Satteldach mit First parallel zur Straße.' },
  { id: 'minka_walm', name: 'Wohnhaus mit Walmdach', region: 'Japan traditionell', type: 'machiya', variant: 'walm', pts: RE(12, 9), height: 7, seed: 8,
    info: 'Zweigeschossiges Haus mit Walmdach aus dunklen Kawara Ziegeln, tiefen Traufen, Holzpfosten, Yakisugi Brettern und Gitterfenstern.' },
  { id: 'tokio_misch', name: 'Geschäftshaus Tokio', region: 'Japan modern', type: 'tokio', variant: 'beige', pts: RE(6.5, 13), height: 22, seed: 9,
    info: 'Schmales Geschäftshaus: beige Fliesen, Laden mit Glasfront und Schildband, Büros mit Fensterbändern und Schriftschildern, senkrechtes Leuchtschild über alle Geschosse, Klimageräte an der Seite, Werbetafel und Wassertank auf dem Dach.' },
  { id: 'tokio_wohnen', name: 'Wohnhaus Tokio', region: 'Japan modern', type: 'tokio', variant: 'wohnen beton', pts: RE(8, 12), height: 16, seed: 12,
    info: 'Kleines Mansion aus Sichtbeton: Balkone mit Stabgeländer, Schiebetüren, Klimageräte auf den Balkonen, Wäschestangen, Laden im Erdgeschoss.' },
  { id: 'vorstadt', name: 'Vorstadthaus mit Garage', region: 'USA Vorstadt', type: 'vorstadt', variant: 'blau', pts: RE(18, 11), height: 7, seed: 14,
    info: 'Zweigeschossiges Haus mit blauer Stülpschalung, weißen Eckbrettern und Schiebefenstern mit Sprossen und Klappläden, Veranda mit Säulen und Geländer, Schindeldach, Ziegelschornstein, Doppelgarage mit Sektionaltoren.' },
  { id: 'vorstadt_klein', name: 'Bungalow', region: 'USA Vorstadt', type: 'vorstadt', variant: 'gelb ohnegarage', pts: RE(12, 10), height: 4.5, seed: 21,
    info: 'Eingeschossiges Haus mit gelber Schalung, Veranda über die ganze Front, Satteldach mit Schindeln und Giebelfenster.' },
  { id: 'brownstone', name: 'Brownstone Reihe', region: 'USA Brownstone', type: 'brownstone', variant: '', pts: RE(19, 15), height: 15, seed: 7,
    info: 'Drei Reihenhäuser in Brooklyn: Stoops mit Eisengeländern, Erker über alle Geschosse, Türverdachungen auf Konsolen, Fenster mit Steinköpfen, schwere Gesimse, Vorgartenzaun, Ziegelschornsteine auf den Brandwänden.' },
  { id: 'kykladen', name: 'Kykladenhaus', region: 'Mittelmeer', type: 'kykladen', variant: '', pts: RE(10, 8.5), height: 6.5, seed: 2,
    info: 'Zwei weiße Kuben mit gerundeten Brüstungen, blaue Tür, blaue Fensterrahmen und Läden, Dachterrasse mit Pergola und Wein, gemauerte Treppe aufs obere Dach, weißer Schornstein, Bougainvillea.' },
  { id: 'kykladen_kapelle', name: 'Kapelle mit Tonnengewölbe', region: 'Mittelmeer', type: 'kykladen', variant: 'gewoelbe', pts: RE(8, 5.5), height: 4.5, seed: 13,
    info: 'Kleine weiße Kapelle: Tonnengewölbe, blaue Tür, Glockengiebel mit Glocke und Kreuz, weißer Schornstein.' },
  { id: 'skandi_rot', name: 'Falunrotes Holzhaus', region: 'Skandinavien', type: 'skandi', variant: 'rot schwarz', pts: RE(12, 8), height: 7, seed: 15,
    info: 'Schwedisches Haus in Falunrot: Deckleistenschalung, weiße Eckbretter und Sprossenfenster, Haustür mit Vordach, Steinsockel, steiles schwarzes Blechdach, Giebelfenster, Schornstein.' },
  { id: 'skandi_giebel', name: 'Giebelhaus am Hafen', region: 'Skandinavien', type: 'skandi', variant: 'ocker giebel ziegel', pts: RE(7, 10), height: 8, seed: 16,
    info: 'Schmales ockerfarbenes Haus mit dem Giebel zur Straße wie in Nyhavn oder Bergen, rotes Ziegeldach, zwei Giebelfenster.' },
  { id: 'kolonial', name: 'Kolonialhaus', region: 'Lateinamerika Kolonial', type: 'kolonial', variant: 'mais sockelblau', pts: RE(16, 12), height: 8, seed: 17,
    info: 'Zweigeschossiges Haus wie in Cartagena oder Lima: maisgelber Putz mit blauem Sockel, Sandsteinportal, vorstehende Fenstergitter, langer Holzbalkon mit eigenem Ziegeldach, Walmdach aus Hohlziegeln mit Sparren.' },
  { id: 'kolonial_flach', name: 'Eingeschossiges Haus', region: 'Lateinamerika Kolonial', type: 'kolonial', variant: 'tuerkis flach', pts: RE(12, 10), height: 4.5, seed: 18,
    info: 'Türkises Haus mit Flachdach, Ziegelkante über der Brüstung, Rundbogenportal und vergitterten Fenstern.' },
  { id: 'haveli', name: 'Haveli', region: 'Indien', type: 'haveli', variant: 'rot', pts: RE(14, 12), height: 13, seed: 19,
    info: 'Haveli aus rotem Sandstein wie in Jaipur: Tor mit gelapptem Bogen, Jharokhas mit Jali und Bangaldar Dach, Chhajjas auf Konsolen über jedem Geschoss, Dachterrasse mit Zinnen und Chhatris mit goldenen Spitzen.' },
  { id: 'indien_stadt', name: 'Stadthaus', region: 'Indien', type: 'haveli', variant: 'stadt pink', pts: RE(9, 12), height: 13, seed: 20,
    info: 'Indisches Stadthaus: rosa Putz, Läden mit Rolltoren und Schildern, Balkone mit grünen Gittern, Betonvordächer, Klimageräte, schwarze Wassertanks und Bewehrung für ein späteres Geschoss auf dem Dach.' },
  { id: 'sahel', name: 'Lehmbau', region: 'Westafrika', type: 'sahel', variant: '', pts: RE(14, 11), height: 7, seed: 22, ecken: 0.7,
    info: 'Lehmbau nach dem Vorbild von Djenné: gerundete Kanten, Pfeiler mit Spitzen über der Brüstung, Reihen von Holzstangen (Toron), kleine tiefe Fenster, Holztür.' },
  { id: 'china', name: 'Wohnhochhaus', region: 'China', type: 'china', variant: '', pts: RE(24, 14), height: 60, seed: 23,
    info: 'Wohnhochhaus mit weißen Fliesen und braunen Lisenen, Erkerfenstern, verglasten Balkonen, Klimakäfigen und Dachkrone mit dunklem Walmdach.' },
  { id: 'platte', name: 'Plattenbau', region: 'Osteuropa', type: 'platte', variant: '', pts: RE(30, 12), height: 15, seed: 24,
    info: 'Fünfgeschossiger Plattenbau: Großtafeln mit Fugen, Loggien mit farbigen Brüstungen, Hauseingang mit Betonvordach, Aufzugsüberfahrt und Antennen.' },
];
