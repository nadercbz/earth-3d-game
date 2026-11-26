// Feste Regel für Stützen von Brücken und Viadukten (Wunsch Nr. 98, 09.11.2026, Nader: "diese Brückenpfeiler, die einfach auf der Straße
// gebaut wurden. Können wir sowas nicht mit festen Regeln vermeiden, in Zukunft und überall?").
// Ein Pfeiler steht nie auf einer Fahrbahn, einem Radweg, einem Fußweg oder neben einem ebenerdigen Gleis (Lichtraum 1,9 m ab Gleismitte plus
// Pfeilerradius). Liegt die Regelstelle dort, rückt er entlang der Brücke zur nächsten freien Stelle (höchstens suche Meter), sonst entfällt er
// und die Spannweite wird größer. Erlaubt sind Gehwegblöcke, Grün, Plätze, Mittelstreifen, Ufer und Wasser (Flusspfeiler).
// Gilt überall auf der Welt, Prüfstand: tools/bauwerke_pruefen.mjs. Läuft auch ohne three.js.

const ZELLE = 32;
const inRing = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

// Polygone (Liste von Ringen [[x, z], ...], erster Ring außen, weitere Löcher) in einem Raster, drin(x, z) fragt schnell ab
export class FlaechenRaster {
  constructor(polys = []) {
    this.polys = []; this.zellen = new Map();
    for (const P of polys) {
      if (!P?.length || P[0].length < 3) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of P[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      const i = this.polys.length; this.polys.push({ P, box: [x0, x1, z0, z1] });
      for (let a = Math.floor(x0 / ZELLE); a <= Math.floor(x1 / ZELLE); a++) for (let b = Math.floor(z0 / ZELLE); b <= Math.floor(z1 / ZELLE); b++) { const k = a * 100003 + b; (this.zellen.get(k) || this.zellen.set(k, []).get(k)).push(i); }
    }
  }
  drin(x, z) {
    const L = this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)); if (!L) return false;
    for (const i of L) { const { P, box } = this.polys[i]; if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue; if (inRing(P[0], x, z) && !P.slice(1).some(r => inRing(r, x, z))) return true; }
    return false;
  }
}

// Linien ([[x, z], ...] oder [[x, y, z], ...]) als Strecken im Raster, naeher(x, z, d): liegt eine Strecke näher als d
export class LinienRaster {
  constructor(linien = []) {
    this.s = []; this.zellen = new Map();
    for (const l of linien) for (let i = 1; i < (l?.length || 0); i++) {
      const p = l[i - 1], q = l[i], ax = p[0], az = p.length > 2 ? p[2] : p[1], bx = q[0], bz = q.length > 2 ? q[2] : q[1], j = this.s.length; this.s.push([ax, az, bx, bz]);
      for (let a = Math.floor((Math.min(ax, bx) - 8) / ZELLE); a <= Math.floor((Math.max(ax, bx) + 8) / ZELLE); a++) for (let b = Math.floor((Math.min(az, bz) - 8) / ZELLE); b <= Math.floor((Math.max(az, bz) + 8) / ZELLE); b++) { const k = a * 100003 + b; (this.zellen.get(k) || this.zellen.set(k, []).get(k)).push(j); }
    }
  }
  naeher(x, z, d) {
    const L = this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)); if (!L) return false;
    for (const j of L) { const [ax, az, bx, bz] = this.s[j], dx = bx - ax, dz = bz - az, q = dx * dx + dz * dz, t = q > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / q)) : 0; if (Math.hypot(ax + dx * t - x, az + dz * t - z) < d) return true; }
    return false;
  }
}

// D: Daten des Ortes (strasse, radwege, pfade als Polygone), gleise: ebenerdige Gleise als Linien
export function stuetzenRegel(D, { gleise = [] } = {}) {
  const verboten = new FlaechenRaster([...(D?.strasse || []), ...(D?.radwege || []), ...(D?.pfade || [])]), gl = new LinienRaster(gleise), zahl = { gesetzt: 0, verschoben: 0, entfallen: 0 };
  if (globalThis.__ohneStuetzenRegel) return { frei: () => true, stelle: (P, i) => { zahl.gesetzt++; return { x: P[i][0], y: P[i][1], z: P[i][2], i }; }, zahl };   // nur für den Vergleich im Prüfstand (alter Stand)
  // frei: Kreis mit Radius r berührt keine verbotene Fläche und hält Abstand zu ebenerdigen Gleisen
  const frei = (x, z, r) => {
    if (gl.naeher(x, z, r + 1.9) || verboten.drin(x, z)) return false;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (verboten.drin(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false; }
    return true;
  };
  // stelle: auf der Linie P (Punkte [x, y, z]) ab Index i die nächste freie Stelle im Abstand bis suche Meter, sonst null. Liefert { x, y, z, i }
  const stelle = (P, i, r, suche = 12, seite = 2.4) => {
    const pkt = (j, t) => { const a = P[j], b = P[Math.min(P.length - 1, j + 1)]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, z: a[2] + (b[2] - a[2]) * t, i: j }; };
    // seitlich unter dem Deck (Mittelstreifen unter einer Hochbahn): quer zur Linie bis zu seite Meter
    const quer = (q, j) => { const a = P[Math.max(0, j - 1)], b2 = P[Math.min(P.length - 1, j + 1)], dx = b2[0] - a[0], dz = b2[2] - a[2], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L; for (const o of [0, 1.2, -1.2, 2.4, -2.4].filter(o => Math.abs(o) <= seite)) if (frei(q.x + nx * o, q.z + nz * o, r)) return { ...q, x: q.x + nx * o, z: q.z + nz * o }; return null; };
    { const q = quer(pkt(i, 0), i); if (q) { zahl.gesetzt++; if (q.x !== P[i][0] || q.z !== P[i][2]) zahl.verschoben++; return q; } }
    for (let d = 1; d <= suche; d += 1) for (const sg of [1, -1]) {   // entlang der Linie wandern, abwechselnd vor und zurück
      let rest = d, j = i;
      while (rest > 0) { const k = j + sg; if (k < 0 || k >= P.length) { j = -1; break; } const L = Math.hypot(P[k][0] - P[j][0], P[k][2] - P[j][2]); if (L >= rest) { const t = rest / Math.max(L, 1e-6), q0 = sg > 0 ? pkt(j, t) : pkt(k, 1 - t), q = quer(q0, q0.i); if (q) { zahl.gesetzt++; zahl.verschoben++; return q; } break; } rest -= L; j = k; }
    }
    zahl.entfallen++; return null;
  };
  return { frei, stelle, zahl };
}
