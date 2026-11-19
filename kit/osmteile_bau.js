// Bau der OSM Gebäudeteile (Wunsch Nr. 83, kit/osmteile.js): Wände mit der Bauweise des Teils (ohne eigenes Dach), darauf das Dach in der
// Form aus OSM: Kuppel, Zwiebel, Kegel, Pyramide, Sattel, Walm, Tonne oder flach. Glaskuppeln (Reichstag) bekommen Rippen und Ringe aus Stahl.
// Lage: der Teil steht auf basis + Mindesthöhe, die Wände reichen bis Höhe minus Dachhöhe, das Dach darüber bis zur Höhe.
import * as THREE from 'three';
import { Bau } from './geo.js';
import { buildBuilding } from './buildings.js';
import { teilTyp, wandMaterial, hochStil } from './osmteile.js';

const UP = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _n = new THREE.Vector3();
// Glaskuppeln: helles, halb durchsichtiges Glas (das Glas der Fassaden spiegelt den Himmel dunkelblau, die Reichstagskuppel wirkt in echt hell und licht)
let _kuppelGlas = null;
function kuppelGlas() { return _kuppelGlas ||= new THREE.MeshStandardMaterial({ color: 0xc9d4da, roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.1 }); }

// Dachmaterial aus Farbe und Material (kit/materials.js)
function dachMaterial(t) {
  const md = String(t.md || '').toLowerCase(), f = t.fd;
  if (md.includes('glass')) return 'kuppelGlas';
  if (md.includes('copper')) return 'kupferGruen';
  if (md.includes('gold')) return 'gold';
  if (md.includes('slate')) return 'dachSchiefer';
  if (md.includes('tile')) return 'dachZiegel';
  if (md.includes('grass')) return 'dach';
  if (f) {
    const [r, g, b] = f, mx = Math.max(r, g, b), mn = Math.min(r, g, b), hell = (r + g + b) / 3;
    if (g > r * 1.08 && g >= b * 0.92 && mx - mn > 0.08) return 'kupferGruen';   // Kupfer, Grünspan
    if (r > 0.6 && g > 0.45 && b < 0.32 && r > b * 2) return 'gold';
    if (r > g * 1.3 && r > b * 1.4) return 'dachZiegel';
    if (hell < 0.33) return 'dachSchiefer';
    if (b > r * 1.1 && hell < 0.5) return 'glasBlau';
    return t.f === 'flat' ? 'dach' : 'dachGrau';
  }
  return { dome: 'kupferGruen', onion: 'kupferGruen', cone: 'dachSchiefer', pyramidal: 'dachSchiefer', gabled: 'dachZiegel', hipped: 'dachZiegel', round: 'kupferGruen' }[t.f] || 'dach';
}

// Dreieck mit eigener Normale je Ecke (glatte Kuppeln), UV wie Bau.tri (Projektion), Wicklung nach außen (want)
function dreieck(bau, key, A, B, C, nA, nB, nC, want) {
  _e1.subVectors(B, A); _e2.subVectors(C, A); _n.crossVectors(_e1, _e2);
  if (_n.lengthSq() < 1e-10) return;
  if (want && _n.dot(want) < 0) { let t = B; B = C; C = t; t = nB; nB = nC; nC = t; }
  const p = bau.part(key); _n.copy(nA).add(nB).add(nC).normalize(); const flach = Math.abs(_n.y) > 0.7;
  if (!flach) _t.crossVectors(UP, _n).normalize();
  for (const [v, n] of [[A, nA], [B, nB], [C, nC]]) {
    if (!Number.isFinite(v.x + v.y + v.z)) return;
    p.pos.push(v.x, v.y, v.z); p.nor.push(n.x, n.y, n.z);
    if (flach) p.uv.push(v.x, -v.z); else p.uv.push(v.x * _t.x + v.z * _t.z, v.y);
  }
}

// Ringe eines Drehkörpers über dem Grundriss: je Stufe Maßstab zur Mitte und Höhe; glatt: Normalen gemittelt, sonst je Fläche
function profilDach(bau, key, ring, c, profil, glatt, rippen = 0) {
  const n = ring.length, R = profil.map(([s, y]) => ring.map(([x, z]) => new THREE.Vector3(c[0] + (x - c[0]) * s, y, c[1] + (z - c[1]) * s)));
  const N = R.map(r => r.map(() => new THREE.Vector3()));
  const flaeche = (k, i) => { const a = R[k][i], b = R[k][(i + 1) % n], d = R[k + 1][i]; _e1.subVectors(b, a); _e2.subVectors(d, a); const m = new THREE.Vector3().crossVectors(_e1, _e2); const aus = new THREE.Vector3(a.x - c[0], 0, a.z - c[1]).add(new THREE.Vector3(0, 0.3, 0)); if (m.dot(aus) < 0) m.negate(); return m.normalize(); };
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < n; i++) { const f = flaeche(k, i); N[k][i].add(f); N[k][(i + 1) % n].add(f); N[k + 1][i].add(f); N[k + 1][(i + 1) % n].add(f); }
  for (const r of N) for (const v of r) { if (v.lengthSq() < 1e-9) v.copy(UP); v.normalize(); }
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = R[k][i], b = R[k][j], d = R[k + 1][j], e = R[k + 1][i], want = new THREE.Vector3((a.x + b.x) / 2 - c[0], 0.4, (a.z + b.z) / 2 - c[1]);
    if (glatt) { dreieck(bau, key, a, b, d, N[k][i], N[k][j], N[k + 1][j], want); dreieck(bau, key, a, d, e, N[k][i], N[k + 1][j], N[k + 1][i], want); }
    else { const f = flaeche(k, i); dreieck(bau, key, a, b, d, f, f, f, want); dreieck(bau, key, a, d, e, f, f, f, want); }
  }
  // Rippen aus Stahl (Glaskuppeln): schmale Bänder auf jedem soundsovielten Meridian und jedem zweiten Ring, leicht über der Fläche
  if (rippen) {
    const schritt = Math.max(1, Math.round(n / rippen)), b = 0.16, aus = 0.06;
    const band = (P, Q, nP, nQ) => { const d = new THREE.Vector3().subVectors(Q, P), s = new THREE.Vector3().crossVectors(d, nP).normalize().multiplyScalar(b);
      const p0 = P.clone().addScaledVector(nP, aus).sub(s), p1 = P.clone().addScaledVector(nP, aus).add(s), q1 = Q.clone().addScaledVector(nQ, aus).add(s), q0 = Q.clone().addScaledVector(nQ, aus).sub(s);
      dreieck(bau, 'technikDunkel', p0, p1, q1, nP, nP, nQ, nP); dreieck(bau, 'technikDunkel', p0, q1, q0, nP, nQ, nQ, nP); };
    for (let i = 0; i < n; i += schritt) for (let k = 0; k < R.length - 1; k++) band(R[k][i], R[k + 1][i], N[k][i], N[k + 1][i]);
    for (let k = 1; k < R.length - 1; k += 2) for (let i = 0; i < n; i++) band(R[k][i], R[k][(i + 1) % n], N[k][i], N[k][(i + 1) % n]);
  }
}

// kleinstes umschließendes Rechteck (für Sattel, Walm, Tonne): Achse, Länge, Breite, Mitte
function rechteck(ring) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
    const ux = dx / L, uz = dz / L; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) { const u = x * ux + z * uz, v = -x * uz + z * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
  }
  return best;
}
const flaecheRing = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

// Sattel (Grat entlang der langen Seite, ri 'q' quer), Walm (Grat kürzer) oder Tonne über einem Rechteck; y0 Traufe, rh Dachhöhe
function rechteckDach(bau, key, wandKey, rr, form, rh, quer) {
  let { ux, uz, u0, u1, v0, v1 } = rr; if (((u1 - u0) < (v1 - v0)) !== !!quer) { const t = ux; ux = -uz; uz = t; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }
  const W = (u, v, y) => new THREE.Vector3(u * ux - v * uz, y, u * uz + v * ux), vm = (v0 + v1) / 2, um = (u0 + u1) / 2, breit = v1 - v0, mitte = W(um, vm, 0);
  const aussen = (P) => new THREE.Vector3(P.x - mitte.x, 0.5, P.z - mitte.z);
  if (form === 'round') {   // Tonne: Halbkreis über die Breite
    const S = 8; let prev = null;
    for (let s = 0; s <= S; s++) { const w = Math.PI * s / S, v = vm - Math.cos(w) * breit / 2, y = Math.sin(w) * rh, A = W(u0, v, y), B = W(u1, v, y); if (prev) { const nn = new THREE.Vector3(-Math.cos(w) * 0 , 1, 0); bau.face(key, prev[0], prev[1], B, A, aussen(new THREE.Vector3((prev[0].x + B.x) / 2, 0, (prev[0].z + B.z) / 2))); } prev = [A, B]; }
    for (const u of [u0, u1]) { const pts = []; for (let s = 0; s <= S; s++) { const w = Math.PI * s / S; pts.push(W(u, vm - Math.cos(w) * breit / 2, Math.sin(w) * rh)); } const m = W(u, vm, 0); for (let s = 0; s < S; s++) bau.face(wandKey, m, pts[s], pts[s + 1], pts[s + 1], new THREE.Vector3(u === u0 ? -ux : ux, 0, u === u0 ? -uz : uz)); }
    return;
  }
  const ein = form === 'hipped' ? Math.min(breit / 2, (u1 - u0) / 2 - 0.1) : 0, F0 = W(u0 + ein, vm, rh), F1 = W(u1 - ein, vm, rh);
  const a = W(u0, v0, 0), b = W(u1, v0, 0), c = W(u1, v1, 0), d = W(u0, v1, 0);
  bau.face(key, a, b, F1, F0, aussen(W(um, v0, 0))); bau.face(key, c, d, F0, F1, aussen(W(um, v1, 0)));
  if (form === 'hipped') { bau.face(key, b, c, F1, F1, aussen(W(u1, vm, 0))); bau.face(key, d, a, F0, F0, aussen(W(u0, vm, 0))); }
  else { bau.face(wandKey, b, c, F1, F1, aussen(W(u1, vm, 0))); bau.face(wandKey, d, a, F0, F0, aussen(W(u0, vm, 0))); }   // Giebel in der Wandfarbe
}

// Goldene Figur oben auf einer Säule (Siegessäule: Viktoria, 8,3 m): Gewand, Kopf, Flügel, erhobener Arm mit Kranz, Feldzeichen
function viktoria(bau, x, y, z) {
  // Feinere Viktoria (Nr. 85): 8,3 m, Blick nach Westen, Gewand als Drehkörper, Helm, Flügel mit Federkante schräg nach oben hinten,
  // rechter Arm hoch mit dem Lorbeerkranz, links der Stab mit Kreuz. Gebaut mit Front nach +z, dann nach Westen gedreht
  const dreh = new THREE.Matrix4().makeRotationY(-Math.PI / 2), basis = new THREE.Matrix4().makeTranslation(x, y, z).multiply(dreh), L = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  const g = (geo, px, py, pz, rx = 0, ry = 0, rz = 0, s = 1) => { L.compose(P.set(px, py, pz), Q.setFromEuler(E.set(rx, ry, rz)), S.setScalar(s)); bau.geo('gold', geo, basis.clone().multiply(L)); };
  const prof = [[0.0, 0], [1.02, 0.02], [0.98, 0.35], [0.86, 1.2], [0.72, 2.2], [0.6, 3.1], [0.46, 3.9], [0.44, 4.3], [0.52, 4.75], [0.56, 5.1], [0.5, 5.32], [0.2, 5.5], [0.16, 5.62]].map(([r, h]) => new THREE.Vector2(r, h));
  for (let i = 1; i < prof.length; i++) { const a = prof[i - 1], b = prof[i], hh = b.y - a.y; if (hh > 0.001) g(new THREE.CylinderGeometry(Math.max(0.01, b.x), Math.max(0.01, a.x), hh, 22, 1, true), 0, a.y + hh / 2, 0); }   // Gewand mit Saum, Taille, Brust, Schultern (Kegelstümpfe, Außenseite sicher vorn)
  g(new THREE.CircleGeometry(1.02, 22), 0, 0.02, 0, -Math.PI / 2);   // Boden
  for (const [px, pz, r] of [[0.45, 0.62, 0.16], [-0.35, 0.7, 0.14], [0.1, 0.85, 0.12]]) g(new THREE.CylinderGeometry(r * 0.4, r, 3.2, 8), px, 1.7, pz * 0.8, 0.12, 0, 0);   // Falten vorn
  g(new THREE.SphereGeometry(0.33, 16, 12), 0, 5.93, 0.04);                          // Kopf
  g(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 6.0, 0.0);   // Helm
  g(new THREE.BoxGeometry(0.08, 0.34, 0.6), 0, 6.33, -0.02);                         // Helmbusch
  g(new THREE.CylinderGeometry(0.11, 0.14, 1.95, 8), -0.62, 6.15, 0.25, 0.32, 0, 0.42);   // rechter Arm hoch (Front +z: rechts ist -x)
  g(new THREE.TorusGeometry(0.46, 0.085, 8, 24), -1.02, 7.15, 0.55, 0.2, 0, 0);     // Lorbeerkranz in der rechten Hand
  for (let i = 0; i < 12; i++) { const w = i / 12 * Math.PI * 2; g(new THREE.SphereGeometry(0.1, 6, 4), -1.02 + Math.cos(w) * 0.46, 7.15 + Math.sin(w) * 0.46, 0.55 + Math.sin(w) * 0.09, 0, 0, 0, 1); }   // Blätter am Kranz
  g(new THREE.CylinderGeometry(0.11, 0.13, 1.6, 8), 0.62, 4.75, 0.3, -0.5, 0, -0.25);   // linker Arm zum Stab
  g(new THREE.CylinderGeometry(0.05, 0.06, 7.0, 8), 0.82, 4.3, 0.62);                // Stab in der linken Hand
  g(new THREE.BoxGeometry(0.62, 0.12, 0.06), 0.82, 7.45, 0.62); g(new THREE.BoxGeometry(0.12, 0.62, 0.06), 0.82, 7.45, 0.62);   // Kreuz
  g(new THREE.SphereGeometry(0.16, 10, 6), 0.82, 7.9, 0.62);                         // kleiner Adler auf dem Stab (vereinfacht)
  // Flügel: Umriss mit Federkante, schräg nach oben hinten gespreizt
  const f = new THREE.Shape(); f.moveTo(0, 0); f.bezierCurveTo(0.6, 0.5, 1.9, 1.6, 2.7, 3.6); f.lineTo(2.35, 3.2); f.lineTo(2.3, 3.55); f.lineTo(1.95, 2.9); f.lineTo(1.85, 3.2); f.lineTo(1.5, 2.45); f.lineTo(1.35, 2.7); f.lineTo(1.05, 1.95); f.lineTo(0.85, 2.05); f.lineTo(0.55, 1.35); f.bezierCurveTo(0.3, 0.9, 0.1, 0.5, 0, 0);
  const fg = new THREE.ExtrudeGeometry(f, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 10 });
  g(fg, 0.22, 4.85, -0.42, 0.42, 0.5, -0.12); g(fg, -0.22, 4.85, -0.42, 0.42, Math.PI - 0.5, -0.12);
  g(fg, 0.2, 4.7, -0.5, 0.5, 0.35, -0.05, 0.8); g(fg, -0.2, 4.7, -0.5, 0.5, Math.PI - 0.35, -0.05, 0.8);   // zweite Federlage
}
// Zwei gegenläufige Wendelrampen innen an der Glaskuppel (Reichstag, Nr. 85): je 1,55 Umläufe vom Boden bis zur Aussichtsplattform,
// Lauffläche mit Unterseite und Stirn, gläserne Brüstung zur Mitte, oben ein Ring um den Spiegeltrichter
function rampen(bau, cx, cz, y0, Rm, rh) {
  const N = 140, W = 1.9, U = 1.55 * Math.PI * 2, hO = rh * 0.78, V = (x, yy, zz) => new THREE.Vector3(x, yy, zz), AUF = V(0, 1, 0), AB = V(0, -1, 0);
  const rAt = h => Rm * Math.sqrt(Math.max(0.03, 1 - (h / rh) ** 2)) - 1.0;   // etwas Abstand zur Glashaut
  for (const w0 of [0, Math.PI]) {
    let alt = null;
    for (let i = 0; i <= N; i++) {
      const s = i / N, w = w0 + s * U, h = 1.2 + s * (hO - 1.2), ra = rAt(h), ri = ra - W, c = Math.cos(w), sn = Math.sin(w);
      const p = { a: V(cx + c * ra, y0 + h, cz + sn * ra), i: V(cx + c * ri, y0 + h, cz + sn * ri), au: V(cx + c * ra, y0 + h - 0.32, cz + sn * ra), iu: V(cx + c * ri, y0 + h - 0.32, cz + sn * ri) };
      if (alt) {
        bau.face('metall', alt.a, p.a, p.i, alt.i, AUF); bau.face('metall', alt.au, p.au, p.iu, alt.iu, AB);
        bau.face('metall', alt.a, p.a, p.au, alt.au, V(c, 0, sn));
        bau.face('glasGelaender', alt.i, p.i, V(p.i.x, p.i.y + 1.1, p.i.z), V(alt.i.x, alt.i.y + 1.1, alt.i.z), V(-c, 0, -sn));
      }
      alt = p;
    }
  }
  const r0 = Rm * 0.36 + 0.3, r1 = rAt(hO) + 0.2, n = 36;
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, b = (k + 1) / n * Math.PI * 2, P = (r, w, yy) => V(cx + Math.cos(w) * r, y0 + yy, cz + Math.sin(w) * r);
    bau.face('metall', P(r0, a, hO), P(r1, a, hO), P(r1, b, hO), P(r0, b, hO), AUF); bau.face('metall', P(r0, a, hO - 0.35), P(r1, a, hO - 0.35), P(r1, b, hO - 0.35), P(r0, b, hO - 0.35), AB);
  }
}
// Säulenportal mit Giebel vor der Westseite (Reichstag: sechs Säulen, Fries mit der Inschrift DEM DEUTSCHEN VOLKE, Freitreppe)
function portikus(bau, ring, c, hoehe) {
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 20) continue;
    let nx = dz / L, nz = -dx / L; const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (nx * (mx - c[0]) + nz * (mz - c[1]) < 0) { nx = -nx; nz = -nz; }
    if (nx < -0.75 && (!best || L > best.L)) best = { a, b, L, nx, nz, mx, mz };
  }
  if (!best) return;
  const { L, nx, nz, mx, mz } = best, ux = -nz, uz = nx, breit = Math.min(L * 0.62, 40), tief = 9, hS = hoehe * 0.72, n = 6;
  const P = (u, y, t) => new THREE.Vector3(mx + ux * u + nx * t, y, mz + uz * u + nz * t), M = new THREE.Matrix4(), dreh = Math.atan2(nx, nz);
  const kasten = (key, u0, u1, y0, y1, t0, t1) => { const a = P(u0, y0, t0), b = P(u1, y0, t0), cc = P(u1, y0, t1), d = P(u0, y0, t1), e = P(u0, y1, t0), f = P(u1, y1, t0), g = P(u1, y1, t1), h = P(u0, y1, t1); bau.hexa(key, [a, b, cc, d, e, f, g, h]); };
  for (let k = 0; k < 4; k++) kasten('stein', -breit / 2 - 3 + k * 0.6, breit / 2 + 3 - k * 0.6, k * 0.5, (k + 1) * 0.5, -0.5, tief + 4 - k * 1.4);   // Freitreppe
  for (let i = 0; i < n; i++) { const u = -breit / 2 + 2 + i * (breit - 4) / (n - 1); M.makeTranslation(P(u, 2 + hS / 2, tief - 1.6).x, 2 + hS / 2, P(u, 0, tief - 1.6).z); bau.geo('stein', new THREE.CylinderGeometry(0.85, 0.95, hS, 16), M); kasten('stein', u - 1.1, u + 1.1, 2, 2.6, tief - 2.7, tief - 0.5); kasten('stein', u - 1.15, u + 1.15, 2 + hS - 0.6, 2 + hS, tief - 2.75, tief - 0.45); }
  const yG = 2 + hS; kasten('stein', -breit / 2, breit / 2, yG, yG + 1.2, -0.3, tief); kasten('steinBlock', -breit / 2 + 0.6, breit / 2 - 0.6, yG + 1.2, yG + 2.6, -0.3, tief + 0.06); kasten('stein', -breit / 2 - 0.3, breit / 2 + 0.3, yG + 2.6, yG + 3.4, -0.3, tief + 0.3);
  const yF = yG + 3.4, hF = Math.min(7, breit * 0.17), A = P(-breit / 2 - 0.3, yF, tief + 0.3), B = P(breit / 2 + 0.3, yF, tief + 0.3), F = P(0, yF + hF, tief + 0.3), A0 = P(-breit / 2 - 0.3, yF, -0.3), B0 = P(breit / 2 + 0.3, yF, -0.3), F0 = P(0, yF + hF, -0.3);
  bau.face('stein', A, B, F, F, new THREE.Vector3(nx, 0, nz)); bau.face('kupferGruen', A, F, F0, A0, new THREE.Vector3(-ux, 1, -uz)); bau.face('kupferGruen', F, B, B0, F0, new THREE.Vector3(ux, 1, uz));
  // Fries mit Schrift: dunkles Band mit hellen Buchstabenblöcken (aus der Ferne lesbar als Inschrift)
  const yS = yG + 1.55, z = tief + 0.1; kasten('technikDunkel', -breit * 0.36, breit * 0.36, yS, yS + 1.0, z - 0.02, z + 0.02);
  for (let k = 0; k < 17; k++) { if (k === 3 || k === 13) continue; const u = -breit * 0.34 + k * breit * 0.68 / 16; kasten('gold', u - 0.42, u + 0.42, yS + 0.18, yS + 0.82, z + 0.02, z + 0.07); }
}
// Standard Dachhöhe, wenn OSM keine nennt
function dachHoehe(t, Rm, rr) {
  const hoch = t.h - t.m, schmal = rr ? Math.min(rr.u1 - rr.u0, rr.v1 - rr.v0) : 2 * Rm;
  if (t.rh != null) return Math.min(hoch, Math.max(0, t.rh));
  switch (t.f) {
    case 'dome': return Math.min(hoch, Rm);
    case 'onion': return Math.min(hoch, 2.2 * Rm);
    // eigener Spitzenteil (hoch, schlank, ohne Angaben zur Wand) ganz als Spitze, sonst eine Haube auf dem Turm (Rotes Rathaus: Turm 30 bis 74 m mit Pyramidendach)
    case 'cone': case 'pyramidal': return hoch > 3 * Rm && !t.fa && !t.ma ? hoch : Math.min(hoch, 0.9 * Rm);
    case 'gabled': case 'hipped': return Math.min(hoch, schmal * 0.35);
    case 'round': return Math.min(hoch, schmal / 2);
    default: return 0;
  }
}

export function osmTeilBauen(mats, g, pts, basis, leicht) {
  const t = g.osm, gruppe = new THREE.Group(), ring = pts.map(q => [q[0], q[1]]);
  let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z; } cx /= ring.length; cz /= ring.length;
  let Rm = 0; for (const [x, z] of ring) Rm += Math.hypot(x - cx, z - cz); Rm /= ring.length;
  const A = flaecheRing(ring), rr = ['gabled', 'hipped', 'round'].includes(t.f) ? rechteck(ring) : null, rechteckig = rr && A > rr.A * 0.86;
  const form = (t.f === 'gabled' || t.f === 'hipped' || t.f === 'round') && !rechteckig ? (t.f === 'round' ? 'dome' : 'walmRing') : t.f;
  const rh = dachHoehe({ ...t, h: g.h, m: g.m || 0 }, Rm, rr), wandH = Math.max(0, g.h - (g.m || 0) - rh);
  const vb = !t.kirche ? hochStil({ nm: t.nm || '' }) : null;   // Vorbild nach Namen (kit/osmteile.js, Nr. 85)
  const { typ, variant } = vb || teilTyp({ ...t, h: g.h, m: g.m || 0 }, { kirche: t.kirche }, A);
  // Wände: Bauweise ohne eigenes Dach, echtes Haus (keine erfundenen Türme)
  let wandKey = 'stein', schlicht = wandH > 0.05 && wandH < 2 && !t.nd;
  if (wandH >= 2 && !t.nd) {
    try {
      const b = buildBuilding(mats, { pts: ring, height: wandH, type: typ, variant, seed: (g.id || 1) % 9973, ohneLaden: true, leicht, spar: leicht, echt: true, keinDach: true, vorgabe: vb?.vg || null });
      // Niedrige Teile (Ringe, Gesimse, Trommeln einer Säule): manche Bauweisen bauen mindestens zwei Geschosse und überragen dann das Teil
      // (Siegessäule 08.11.2026: ein 3,6 m hoher Ring wuchs auf 7 m und verdeckte das Gewand der Viktoria). Dann schlichte Wände in echter Höhe
      if ((b.userData?.height ?? wandH) > wandH + 0.8) { b.traverse(o => o.geometry?.dispose?.()); schlicht = true; }
      else gruppe.add(b);
      let groesste = 0, haupt = null; for (const m of b.children) { if (!m.isMesh || /^(glas|rahmen|dach|stein$)/.test(m.name)) continue; const n = m.geometry.attributes.position.count; if (n > groesste) { groesste = n; wandKey = m.name; haupt = m; } }
      const wm = vb?.vg?.wand || wandMaterial(t); if (haupt && wm && mats[wm] && !vb?.vg?.glas) { haupt.material = mats[wm]; haupt.name = wm; wandKey = wm; }   // Farbe aus OSM statt Zufall der Bauweise
    } catch (e) { console.warn('OSM Teil', typ, e.message); }
  }
  // Dach
  const bau = new Bau(), key = dachMaterial(t), y0 = t.nd ? 0 : wandH, c = [cx, cz];
  if (schlicht) {   // schlichte Wände in echter Höhe, Material aus OSM
    const wk = vb?.vg?.wand || wandMaterial(t) || 'steinBlock'; wandKey = mats[wk] ? wk : 'steinBlock';
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b2 = ring[(i + 1) % ring.length], nx = b2[1] - a[1], nz = -(b2[0] - a[0]); let ox = (a[0] + b2[0]) / 2 - cx, oz = (a[1] + b2[1]) / 2 - cz; const raus = nx * ox + nz * oz >= 0 ? 1 : -1;
      bau.face(wandKey, new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b2[0], 0, b2[1]), new THREE.Vector3(b2[0], wandH, b2[1]), new THREE.Vector3(a[0], wandH, a[1]), new THREE.Vector3(nx * raus, 0, nz * raus)); }
  }
  const glas = /^glas|^kuppelGlas/.test(key);
  if (t.nd && rh < 0.3) {   // nur Dach (building:part=roof): Platte von der Mindesthöhe bis zur Höhe
    const d = Math.max(0.3, g.h - (g.m || 0)); bau.poly(key, ring, d); bau.poly(key, ring, 0, true);
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b2 = ring[(i + 1) % ring.length]; bau.face(key, new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b2[0], 0, b2[1]), new THREE.Vector3(b2[0], d, b2[1]), new THREE.Vector3(a[0], d, a[1]), new THREE.Vector3(a[0] - cx, 0, a[1] - cz)); }
  } else if (rh < 0.3 || form === 'flat') bau.poly(t.nd ? key : 'dach', ring, y0 + 0.02);
  else if (form === 'dome') { const S = 9, prof = []; for (let k = 0; k <= S; k++) { const w = k / S * Math.PI / 2; prof.push([Math.cos(w), y0 + Math.sin(w) * rh]); } prof[S][0] = 0; profilDach(bau, key, ring, c, prof, true, glas ? 24 : 0); }
  else if (form === 'onion') { const P = [[1, 0], [1.12, 0.1], [1.18, 0.24], [1.1, 0.4], [0.86, 0.55], [0.52, 0.7], [0.24, 0.83], [0.09, 0.93], [0.02, 1]]; profilDach(bau, key, ring, c, P.map(([s, y]) => [s, y0 + y * rh]), true); }
  else if (form === 'cone') profilDach(bau, key, ring, c, [[1, y0], [0.5, y0 + rh * 0.5], [0, y0 + rh]], ring.length > 6);
  else if (form === 'pyramidal') profilDach(bau, key, ring, c, [[1, y0], [0, y0 + rh]], false);
  else if (form === 'walmRing') { profilDach(bau, key, ring, c, [[1, y0], [0.18, y0 + rh]], false); bau.poly(key, ring.map(([x, z]) => [cx + (x - cx) * 0.18, cz + (z - cz) * 0.18]), y0 + rh); }
  else if (rechteckig) { const g2 = new Bau(); rechteckDach(g2, key, wandKey, rr, form, rh, t.ri === 'q'); for (const [k, p] of g2.parts) { const q = bau.part(k); for (let i = 0; i < p.pos.length; i += 3) { q.pos.push(p.pos[i], p.pos[i + 1] + y0, p.pos[i + 2]); q.nor.push(p.nor[i], p.nor[i + 1], p.nor[i + 2]); } for (const u of p.uv) q.uv.push(u); } }
  else bau.poly('dach', ring, y0 + 0.02);
  if (glas) {   // Boden unter der Glaskuppel, bei großen Kuppeln der Spiegeltrichter in der Mitte (Reichstag)
    bau.poly('technikDunkel', ring, y0 + 0.03);
    if (form === 'dome' && Rm > 8) { const M = new THREE.Matrix4().makeTranslation(cx, y0 + rh * 0.42, cz); bau.geo('glasSilber', new THREE.CylinderGeometry(Rm * 0.36, Rm * 0.07, rh * 0.84, 24, 1, true), M); if (/^Reichstag/.test(t.nm || '')) rampen(bau, cx, cz, y0, Rm, rh); }
  }
  if (t.oben && /Siegess/.test(t.nm || '')) viktoria(bau, cx, g.h - (g.m || 0), cz);   // oberster Teil der Siegessäule: die Viktoria
  if (t.haupt && /^Reichstag/.test(t.nm || '') && wandH > 15) portikus(bau, ring, c, wandH);   // Westportal des Reichstags
  const dach = bau.build(new Proxy(mats, { get: (o, k) => k === 'kuppelGlas' ? kuppelGlas() : o[k] })); gruppe.add(dach);
  for (const m of dach.children) if (m.name === 'kuppelGlas') { m.castShadow = false; m.renderOrder = 2; }
  gruppe.position.y = basis + (g.m || 0);
  gruppe.userData.id = g.id;
  return gruppe;
}
