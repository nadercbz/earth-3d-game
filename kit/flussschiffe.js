// Ausflugsschiffe auf Flüssen und Kanälen (Wunsch Nr. 106, 18.11.2026, Nader: "dass Schiffe darunter auch herfahren können"). Seit dem festen Pegel
// (kit/ort.js pegelBauen) liegt das Wasser tief im Bett und jede Brücke hat Luft darunter. Hier fahren flache Fahrgastschiffe, wie sie auf Spree und
// Landwehrkanal unterwegs sind, die Mittellinie des Gewässers entlang und unter den Brücken durch.
// Feste Regeln: ein Schiff fährt nur, wo es passt. Je Lauf wird geprüft: Wasser mit festem Pegel unter dem ganzen Rumpf, Abstand zu jedem Pfeiler,
// Luft unter jedem Bauwerk (BrueckenFeld.unterkante) mindestens Schiffshöhe plus 15 cm. Wo es nicht passt, endet der Lauf. Rechtsverkehr: jede
// Richtung hat ihre Seite. Am Ende des Laufs taucht das Schiff am Anfang wieder auf (Enden liegen am Rand des Ausschnitts).
// Keine Menschen an Bord (Menschen kommen nur aus den Higgsfield Figuren), keine echten Reedereien.
import * as THREE from 'three';

const LANG = 25, BREIT = 5.0, HOCH = 2.2, TEMPO = 2.7, SCHRITT = 4;   // Maße über Wasser in Metern, Tempo in m/s (rund 10 km/h)

let GEO = null, MAT = null;
// Rumpf als Prisma aus dem Decksumriss (spitzer Bug, runder Spiegel), Salon mit Fensterband, Steuerhaus, flaches Sonnendeck. Farben je Ecke
function schiffGeo() {
  if (GEO) return GEO;
  const pos = [], nor = [], col = [], F = { weiss: [0.74, 0.74, 0.71], blau: [0.05, 0.11, 0.23], glas: [0.05, 0.08, 0.11], deck: [0.4, 0.31, 0.2], dach: [0.58, 0.6, 0.6], rot: [0.55, 0.1, 0.08] };
  const quad = (a, b, c, d, f) => { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2]; let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (const q of [a, b, c, a, c, d]) { pos.push(q[0], q[1], q[2]); nor.push(nx, ny, nz); col.push(f[0], f[1], f[2]); } };
  const kasten = (x0, x1, y0, y1, z0, z1, f, oben = f) => { quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], f); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], f); quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], f); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], f); quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], oben); };
  // Umriss: z nach vorn (Bug bei +LANG/2), halbe Breite je Station
  const U = [[-LANG / 2, 1.9], [-LANG / 2 + 0.8, 2.4], [-LANG / 2 + 2.5, BREIT / 2], [LANG / 2 - 7, BREIT / 2], [LANG / 2 - 3.5, 1.9], [LANG / 2 - 1.2, 0.9], [LANG / 2, 0.12]];
  const yU = -0.45, yW = 0.22, yD = 0.8;   // Kiel, Farbkante über der Wasserlinie, Deck
  for (let i = 1; i < U.length; i++) { const [z0, h0] = U[i - 1], [z1, h1] = U[i];
    for (const s of [1, -1]) { const a = [s * h0 * 0.86, yU, z0], b = [s * h1 * 0.86, yU, z1], c = [s * h1, yW, z1], d = [s * h0, yW, z0], e = [s * h1, yD, z1], f = [s * h0, yD, z0];
      if (s < 0) { quad(a, b, c, d, F.blau); quad(d, c, e, f, F.weiss); } else { quad(b, a, d, c, F.blau); quad(c, d, f, e, F.weiss); } }   // Flächen zeigen nach außen
    quad([-h1, yD, z1], [h1, yD, z1], [h0, yD, z0], [-h0, yD, z0], F.deck); }
  { const [z0, h0] = U[0]; quad([h0 * 0.86, yU, z0], [-h0 * 0.86, yU, z0], [-h0, yD, z0], [h0, yD, z0], F.weiss); }   // Spiegel
  // Schanzkleid am Bug, Salon, Fensterband, Dach, Steuerhaus
  const sA = -LANG / 2 + 3, sB = LANG / 2 - 9.5, hb = BREIT / 2 - 0.45;
  kasten(-hb, hb, yD, 1.98, sA, sB, F.weiss, F.dach);
  for (const s of [1, -1]) kasten(s > 0 ? hb : -hb - 0.03, s > 0 ? hb + 0.03 : -hb, 1.12, 1.78, sA + 0.6, sB - 0.6, F.glas);
  kasten(-hb + 0.3, hb - 0.3, 1.12, 1.78, sB, sB + 0.03, F.glas); kasten(-hb + 0.3, hb - 0.3, 1.12, 1.78, sA - 0.03, sA, F.glas);
  kasten(-hb - 0.12, hb + 0.12, 1.98, 2.06, sA - 0.4, sB + 0.5, F.weiss, F.dach); kasten(-hb + 0.5, hb - 0.5, 2.06, 2.08, sA + 0.3, sB - 0.4, F.deck);   // Sonnendeck mit Holzbelag
  kasten(-1.25, 1.25, yD, HOCH - 0.06, sB + 1.2, sB + 3.4, F.weiss, F.dach); kasten(-1.28, 1.28, 1.25, 1.95, sB + 3.4, sB + 3.43, F.glas);
  for (const s of [1, -1]) kasten(s > 0 ? 1.25 : -1.28, s > 0 ? 1.28 : -1.25, 1.25, 1.95, sB + 1.5, sB + 3.2, F.glas);
  kasten(-1.35, 1.35, HOCH - 0.06, HOCH, sB + 1.0, sB + 3.6, F.dach);
  kasten(-BREIT / 2 + 0.05, BREIT / 2 - 0.05, yD + 0.02, yD + 0.1, -LANG / 2 + 0.3, sA - 0.3, F.deck);   // Achterdeck
  for (const s of [1, -1]) kasten(s > 0 ? hb + 0.04 : -hb - 0.1, s > 0 ? hb + 0.1 : -hb - 0.04, yD, yD + 0.28, sA, sB, F.rot);   // Scheuerleiste
  GEO = new THREE.BufferGeometry(); GEO.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); GEO.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); GEO.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); GEO.computeBoundingSphere();
  return GEO;
}

export class Flussschiffe {
  // ort: kit/ort.js (pegel, wasserFest, brueckenFeld, brueckenGruppe.userData.pfeiler). linien: daten.flussLinien (Mittellinien, Meter im Ort)
  constructor(ort, linien, { mobil = false } = {}) {
    this.ort = ort; this.gruppe = new THREE.Group(); this.gruppe.name = 'flussschiffe'; this.schiffe = []; this.zahl = { laeufe: 0, schiffe: 0, zuNiedrig: 0, zuEng: 0 };
    const fest = (x, z) => ort.wasserFest(x, z), pfeiler = ort.brueckenGruppe?.userData?.pfeiler || [], B = ort.brueckenFeld, max = mobil ? 2 : 6;
    for (const l of linien || []) { if (this.schiffe.length >= max) break;
      // Linie alle SCHRITT Meter abtasten und glätten
      const P = []; for (let i = 1; i < l.length; i++) { const [ax, az] = l[i - 1], [bx, bz] = l[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / SCHRITT)); for (let j = i === 1 ? 0 : 1; j <= n; j++) P.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n]); }
      for (let d = 0; d < 3; d++) for (let i = 1; i < P.length - 1; i++) { P[i] = [(P[i - 1][0] + 2 * P[i][0] + P[i + 1][0]) / 4, (P[i - 1][1] + 2 * P[i][1] + P[i + 1][1]) / 4]; }
      const N = P.length; if (N < 30) continue; const T = P.map((_, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], q = Math.hypot(dx, dz) || 1; return [dx / q, dz / q]; });
      for (const richtung of [1, -1]) { if (this.schiffe.length >= max) break;
        // Rechtsverkehr: Versatz nach rechts in Fahrtrichtung. Begegnen können sich zwei Schiffe erst ab 3,5 m Versatz (5 m breit), darum zuerst die
        // breiten Versätze: der längste freie Lauf gewinnt, 4,5 m bei fast gleicher Länge. Nur wenn keiner passt (schmaler Kanal), fährt ein einzelnes
        // Schiff in einer Richtung in der Mitte
        const lauf = o => { const ok = new Uint8Array(N);
          for (let i = 0; i < N; i++) { const [tx, tz] = T[i], nx = tz * richtung, nz = -tx * richtung, x = P[i][0] + nx * o, z = P[i][1] + nz * o, r = BREIT / 2 + 0.9;   // rechts der Fahrtrichtung: (tz, -tx) mal Richtung
            if (!fest(x, z) || !fest(x + nx * r, z + nz * r) || !fest(x - nx * r, z - nz * r)) { this.zahl.zuEng++; continue; }
            if (pfeiler.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + BREIT / 2 + 0.8)) continue;
            const u = B ? B.unterkante(x, z) : null; if (u !== null && u - ort.pegel(x, z) < HOCH + 0.15) { this.zahl.zuNiedrig++; continue; }
            ok[i] = 1; }
          let a0 = -1, bestL = null; for (let i = 0; i <= N; i++) { if (i < N && ok[i]) { if (a0 < 0) a0 = i; } else if (a0 >= 0) { if (!bestL || i - a0 > bestL[1] - bestL[0]) bestL = [a0, i - 1]; a0 = -1; } }
          return bestL && (bestL[1] - bestL[0]) * SCHRITT >= 150 ? { a: bestL[0], b: bestL[1], o } : null; };
        let best = null;
        for (const o of [4.5, 3.5, 5.5, 6.5]) { const c = lauf(o); if (c && (!best || c.b - c.a > (best.b - best.a) * 1.2)) best = c; }
        if (!best && richtung > 0) for (const o of [1.2, 0]) { best = lauf(o); if (best) break; }
        if (!best) continue; this.zahl.laeufe++;
        const me = new THREE.Mesh(schiffGeo(), MAT ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 })); me.castShadow = !mobil; me.receiveShadow = false; me.name = 'ausflugsschiff';
        const n = best.b - best.a, s = { me, P, T, a: best.a, n, o: best.o, richtung, u: ((this.schiffe.length * 0.37 + 0.2) % 1) * n, ry: null, ph: this.schiffe.length * 1.7 };
        this.schiffe.push(s); this.gruppe.add(me); this.setze(s, 0); }
    }
    this.zahl.schiffe = this.schiffe.length;
  }
  setze(s, dt) {
    s.u += TEMPO * dt / SCHRITT; if (s.u >= s.n) { s.u -= s.n; s.ry = null; }
    const f = s.richtung > 0 ? s.a + s.u : s.a + s.n - s.u, i = Math.min(s.a + s.n - 1, Math.floor(f)), t = f - i, A = s.P[i], B = s.P[i + 1] || A, TA = s.T[i], TB = s.T[i + 1] || TA;
    let tx = TA[0] + (TB[0] - TA[0]) * t, tz = TA[1] + (TB[1] - TA[1]) * t; const q = Math.hypot(tx, tz) || 1; tx /= q; tz /= q;
    const nx = tz * s.richtung, nz = -tx * s.richtung, x = A[0] + (B[0] - A[0]) * t + nx * s.o, z = A[1] + (B[1] - A[1]) * t + nz * s.o, ziel = Math.atan2(tx * s.richtung, tz * s.richtung);
    if (s.ry === null) s.ry = ziel; else { let d = ziel - s.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); s.ry += d * Math.min(1, dt * 1.2); }
    s.ph += dt; s.me.position.set(x, this.ort.pegel(x, z) + Math.sin(s.ph * 0.9) * 0.025, z); s.me.rotation.set(Math.sin(s.ph * 0.7) * 0.006, s.ry, Math.sin(s.ph * 1.1) * 0.012);
  }
  update(dt) { if (!(dt > 0)) return; const d = Math.min(0.1, dt); for (const s of this.schiffe) this.setze(s, d); }
  entsorgen() { this.gruppe.removeFromParent(); this.schiffe.length = 0; }   // Geometrie und Material gelten für alle Orte
}
