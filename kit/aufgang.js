// Treppen zu hochgelegenen Bahnsteigen (Wunsch Nr. 106, 18.11.2026, Nader: "auch bei S-Bahnhöfen, dass man die Treppen hoch und dann einsteigen
// kann in die Züge"). Bis dahin sprang der Boden unter jedem Bahnsteig der Hochbahn und der Stadtbahn einfach auf Bahnsteighöhe (wer darunter stand,
// stand plötzlich oben, Autos darunter hingen an einer 14 m Stufe). Jetzt führt an jedem Bahnsteig, der mehr als 2,2 m über dem Boden liegt, eine
// Treppe hinauf: zwei Läufe nebeneinander (je 1,4 m breit, Stufen 17 cm hoch und 31 cm tief), Podest auf halber Höhe, oben ein Absatz auf
// Bahnsteighöhe an der Außenkante des Bahnsteigs. Lage: kit/bahn.js sucht entlang des Bahnsteigs den ersten freien Platz (kein Haus, keine Fahrbahn,
// kein Gleis, kein Wasser).
// Gehen: Höhe als gleichmäßige Rampe je Lauf (kein Ruckeln auf den Stufen). Kollision: wer auf der Treppe ist, bleibt zwischen den Geländern, wer unten
// steht, geht unter dem oberen Lauf durch (ab 2,2 m Kopfhöhe), sonst ist das Bauwerk fest.
// Lokale Lage: t entlang des Gleises, n nach außen (vom Gleis weg). Aufgang: { x, z, tx, tz, nx, nz, yOben, yUnten }, (x, z) = Ecke am Bahnsteigrand
// Stirntreppe (stirn: true, 19.11.2026, U Möckernbrücke: neben dem Bahnsteig liegen Kanal und Straße): dieselbe Treppe in der Flucht des Bahnsteigs
// hinter seinem Ende, t zeigt vom Bahnsteig weg. Der Absatz oben öffnet sich dann an der Stirnseite (t < 0) zum Bahnsteigende, die Seite zum Gleis
// hat ein Geländer.
import * as THREE from 'three';

export const STUFE = 0.17, AUFTRITT = 0.31, LAUF_B = 1.4, ABSATZ = 1.6, BREIT = 3.1;
const STEIG = STUFE / AUFTRITT;

export class AufgangFeld {
  constructor(liste) { this.liste = liste.map(a => { const h = a.yOben - a.yUnten, LA = h / 2 / STEIG; return { ...a, h, LA, T: 2 * ABSATZ + LA, r: Math.hypot(2 * ABSATZ + LA, BREIT) + 2 }; }); this.n = this.liste.length; }
  lokal(a, x, z) { const dx = x - a.x, dz = z - a.z; return [dx * a.tx + dz * a.tz, dx * a.nx + dz * a.nz]; }
  // Höhe der Lauffläche bei (t, n) innerhalb des Grundrisses
  flaeche(a, t, n) {
    const m = a.yOben - a.h / 2;
    if (n < LAUF_B + 0.15) return t <= ABSATZ ? a.yOben : t >= ABSATZ + a.LA ? m : a.yOben - (a.h / 2) * (t - ABSATZ) / a.LA;   // oberer Lauf am Bahnsteig
    return t >= ABSATZ + a.LA ? m : t <= ABSATZ ? a.yUnten : a.yUnten + (a.h / 2) * (t - ABSATZ) / a.LA;   // unterer Lauf außen
  }
  // Grundriss der Lauffläche: am Absatz oben 25 cm über die Kante zum Bahnsteig hinaus (seitlich, bei der Stirntreppe an der Stirnseite)
  drin(a, t, n) { return a.stirn ? t >= (n <= LAUF_B + 0.15 ? -0.25 : 0) && t <= a.T && n <= BREIT && n >= 0 : t >= 0 && t <= a.T && n <= BREIT && n >= (t <= ABSATZ ? -0.25 : 0); }
  // Bodenhöhe auf der Treppe, sonst null. yAlt: letzte Höhe der Füße
  hoehe(x, z, yAlt) {
    if (yAlt === undefined) return null;
    for (const a of this.liste) { if (Math.abs(x - a.x) > a.r || Math.abs(z - a.z) > a.r) continue; const [t, n] = this.lokal(a, x, z); if (!this.drin(a, t, n)) continue; const y = this.flaeche(a, t, n); if (Math.abs(y - yAlt) < 0.7) return y; }   // der Absatz oben greift 25 cm über die Bahnsteigkante (sonst lag dazwischen ein Spalt bis zum Boden)
    return null;
  }
  // Kollision: null = normale Regeln, true = frei (auf der Treppe), false = Bauwerk oder Geländer
  frei(x, z, y, boden) {
    if (y === undefined) return null;
    for (const a of this.liste) {
      if (Math.abs(x - a.x) > a.r || Math.abs(z - a.z) > a.r) continue; const [t, n] = this.lokal(a, x, z);
      if (this.drin(a, t, n)) {
        const d = this.flaeche(a, t, n) - y; if (Math.abs(d) < 0.7) { if (Math.abs(n - (LAUF_B + 0.1)) < 0.09 && t > ABSATZ && t < ABSATZ + a.LA) return false; return true; }   // Geländer zwischen den Läufen
        return d > 2.2 ? null : false;   // darunter durch, sonst festes Bauwerk (und Geländer für den, der vom Bahnsteig auf den tieferen Lauf treten will)
      }
      if (t >= -0.35 && t <= a.T + 0.35 && n >= -0.35 && n <= BREIT + 0.35) {   // Rand: Geländer für alle, die oben sind
        if ((a.stirn ? t < 0 && n >= -0.1 && n <= LAUF_B + 0.2 : n < 0 && t <= ABSATZ + 0.2) && Math.abs(y - a.yOben) < 1.0) return null;   // Absatz oben geht auf den Bahnsteig
        const g = boden ? boden(x, z) : a.yUnten; if (y > g + 0.9 && y < a.yOben + 1.2) return false;
      }
    }
    return null;
  }
}

class Teil { constructor() { this.pos = []; this.nor = []; }
  quad(a, b, c, d) { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2]; let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (const q of [a, b, c, a, c, d]) { this.pos.push(q[0], q[1], q[2]); this.nor.push(nx, ny, nz); } }
  // Quader zwischen zwei Punkten in lokaler Lage (t0, y0, n0) bis (t1, y1, n1), beide Seiten sichtbar über sechs Flächen
  kasten(P, t0, t1, y0, y1, n0, n1) { const e = [P(t0, y0, n0), P(t1, y0, n0), P(t1, y0, n1), P(t0, y0, n1), P(t0, y1, n0), P(t1, y1, n0), P(t1, y1, n1), P(t0, y1, n1)]; for (const [a, b, c, d] of [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) { this.quad(e[a], e[b], e[c], e[d]); this.quad(e[d], e[c], e[b], e[a]); } }
  geo() { if (!this.pos.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.computeBoundingSphere(); return g; }
}

// Netze aller Treppen eines Ortes: Stufen und Absätze aus Beton, Wangen, Stützen und Geländer aus Stahl
export function aufgaengeBauen(feld, { beton, stahl }) {
  const B = new Teil(), S = new Teil();
  for (const a of feld.liste) {
    const P = (t, y, n) => [a.x + a.tx * t + a.nx * n, y, a.z + a.tz * t + a.nz * n], m = a.yOben - a.h / 2, nS = Math.max(2, Math.round(a.h / 2 / STUFE)), dT = a.LA / nS, dY = a.h / 2 / nS;
    B.kasten(P, 0, ABSATZ, a.yOben - 0.18, a.yOben, 0, LAUF_B);   // Absatz oben am Bahnsteig
    B.kasten(P, ABSATZ + a.LA, a.T, m - 0.18, m, 0, BREIT);   // Podest auf halber Höhe
    for (let i = 0; i < nS; i++) {   // Stufen: oberer Lauf fällt mit t, unterer steigt mit t
      const t0 = ABSATZ + i * dT, yA = a.yOben - (i + 1) * dY, yB = a.yUnten + i * dY;
      B.kasten(P, t0, t0 + dT + 0.02, yA - 0.14, yA, 0.05, LAUF_B); B.kasten(P, t0, t0 + dT + 0.02, yB - 0.14 + dY, yB + dY, LAUF_B + 0.2, BREIT - 0.05);
    }
    // Stützen unter Absatz und Podest, Geländer: Handlauf und Knieleiste an allen offenen Seiten, Pfosten alle 1,5 m
    for (const [t, n] of [[0.2, 0.2], [ABSATZ - 0.2, LAUF_B - 0.2]]) S.kasten(P, t - 0.09, t + 0.09, a.yUnten - 0.5, a.yOben - 0.18, n - 0.09, n + 0.09);
    for (const [t, n] of [[ABSATZ + a.LA + 0.25, 0.25], [a.T - 0.25, 0.25], [ABSATZ + a.LA + 0.25, BREIT - 0.25], [a.T - 0.25, BREIT - 0.25]]) S.kasten(P, t - 0.1, t + 0.1, a.yUnten - 0.5, m - 0.18, n - 0.1, n + 0.1);
    const lauf = (t0, y0, t1, y1, n) => { const L = Math.hypot(t1 - t0, y1 - y0), k = Math.max(1, Math.round(L / 1.5)); for (const hR of [1.0, 0.5]) { const e = [P(t0, y0 + hR - 0.025, n - 0.025), P(t1, y1 + hR - 0.025, n - 0.025), P(t1, y1 + hR + 0.025, n - 0.025), P(t0, y0 + hR + 0.025, n - 0.025)], f = [P(t0, y0 + hR - 0.025, n + 0.025), P(t1, y1 + hR - 0.025, n + 0.025), P(t1, y1 + hR + 0.025, n + 0.025), P(t0, y0 + hR + 0.025, n + 0.025)]; S.quad(e[0], e[1], e[2], e[3]); S.quad(e[3], e[2], e[1], e[0]); S.quad(f[0], f[1], f[2], f[3]); S.quad(f[3], f[2], f[1], f[0]); S.quad(e[3], e[2], f[2], f[3]); S.quad(f[0], f[1], e[1], e[0]); }
      for (let i = 0; i <= k; i++) { const t = t0 + (t1 - t0) * i / k, y = y0 + (y1 - y0) * i / k; S.kasten(P, t - 0.025, t + 0.025, y, y + 1.0, n - 0.025, n + 0.025); } };
    const tA = ABSATZ, tB = ABSATZ + a.LA, mitte = LAUF_B + 0.1;
    lauf(0, a.yOben, tA, a.yOben, LAUF_B);
    if (a.stirn) lauf(0, a.yOben, tA, a.yOben, 0.02);   // Stirntreppe: Geländer zum Gleis, die Stirnseite ist der Zugang vom Bahnsteig
    else { lauf(0, a.yOben, 0, a.yOben, 0.02); S.kasten(P, -0.025, 0.025, a.yOben + 0.475, a.yOben + 1.025, 0, LAUF_B); }   // Absatz oben: außen und Stirnseite
    lauf(tA, a.yOben, tB, m, 0.02); lauf(tA, a.yOben, tB, m, mitte);   // oberer Lauf: zum Bahnsteig hin und zur Mitte
    lauf(tA, a.yUnten, tB, m, mitte + 0.02); lauf(tA, a.yUnten, tB, m, BREIT - 0.02);   // unterer Lauf
    lauf(tB, m, a.T, m, 0.02); lauf(tB, m, a.T, m, BREIT - 0.02); S.kasten(P, a.T - 0.025, a.T + 0.025, m + 0.475, m + 1.025, 0, BREIT);   // Podest
  }
  const G = new THREE.Group(); G.name = 'aufgaenge';
  for (const [t, mat] of [[B, beton], [S, stahl]]) { const g = t.geo(); if (!g) continue; const me = new THREE.Mesh(g, mat); me.castShadow = true; me.receiveShadow = true; G.add(me); }
  return G;
}
