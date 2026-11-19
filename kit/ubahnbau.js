// U-Bahn Eingänge im Ortsworker (Wunsch Nr. 94, 09.11.2026): echte Lage aus daten/berlin_ubahn.json (OSM railway=subway_entrance), freier Platz
// auf dem Gehweg, die offene Treppe als Loch im Boden. Das Treppenhaus baut kit/ubahn_eingang.js im Hauptfaden. Ohne THREE (läuft im Worker).
// Feste Regeln: die Treppe läuft zum Bahnhof hin (sonst in 30 Grad Schritten gedreht), bis 4,5 m von der echten Stelle verschoben, nie auf Fahrbahn,
// Gleis, Wasser, Trog oder in einem Haus, mindestens 7 m Abstand zum nächsten Eingang. Passt kein Platz, entfällt der Eingang (gezählt).

export const B = 3.0, W = 0.25, LAUF = 3.0, PODEST = 1.5, STUFE = 0.17, AUFTRITT = 0.3, N = 10, TIEF = 2 * N * STUFE;   // 3,4 m tief
export const OFFEN = 2 * LAUF + PODEST, LANG = OFFEN + 3.4;   // 7,5 m offene Treppe, dann 3,4 m Gang unter dem Gehweg

// U: Inhalt von daten/berlin_ubahn.json. istFrei(x, z): Gehweg oder Platz, kein Haus, keine Fahrbahn, kein Gleis, kein Wasser
export function eingaengeImOrt(U, { lat, lon, K_LAT, K_LON, halb, istFrei }) {
  const aus = [], zahl = { gesetzt: 0, verschoben: 0, entfallen: 0 }; if (!U?.eingaenge?.length) return { liste: aus, zahl };
  const wl = (x, z, lx, lz, ry) => { const c = Math.cos(ry), s = Math.sin(ry); return [x + lx * c + lz * s, z - lx * s + lz * c]; };   // lokal nach Ort (wie rotation.y)
  // Proben: offene Treppe mit Brüstung und 0,6 m Rand, Zugang vor der Treppe, Säule
  const proben = []; for (let lz = -1.6; lz <= OFFEN + 0.9; lz += 0.75) for (const lx of [-(B / 2 + W + 0.6), -B / 4, 0, B / 4, B / 2 + W + 0.6]) proben.push([lx, lz]); proben.push([-(B / 2 + W + 0.45), -0.4]);
  for (const e of U.eingaenge) {
    const x0 = (e.lo - lon) * K_LON, z0 = -(e.la - lat) * K_LAT; if (Math.abs(x0) > halb - 16 || Math.abs(z0) > halb - 16) continue;
    const st = U.bahnhoefe[e.b]; if (!st) continue;
    const sx = (st.lo - lon) * K_LON, sz = -(st.la - lat) * K_LAT, w0 = Math.hypot(sx - x0, sz - z0) > 2 ? Math.atan2(sx - x0, sz - z0) : 0;
    let best = null;
    suche: for (const r of [0, 1.5, 3, 4.5]) for (let a = 0; a < (r ? 8 : 1); a++) {
      const px = x0 + Math.cos(a / 8 * Math.PI * 2) * r, pz = z0 + Math.sin(a / 8 * Math.PI * 2) * r;
      if (aus.some(q => Math.hypot(q.x - px, q.z - pz) < 7)) continue;
      for (let k = 0; k < 12; k++) { const ry = w0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6;
        if (proben.every(([lx, lz]) => { const [qx, qz] = wl(px, pz, lx, lz, ry); return Math.abs(qx) < halb - 4 && Math.abs(qz) < halb - 4 && istFrei(qx, qz); })) { best = { x: px, z: pz, ry }; break suche; } }
    }
    if (!best) { zahl.entfallen++; continue; }
    zahl.gesetzt++; if (Math.hypot(best.x - x0, best.z - z0) > 0.1 || Math.abs(best.ry - w0) > 0.01) zahl.verschoben++;
    const r2 = v => Math.round(v * 100) / 100, ecke = (lx, lz) => wl(best.x, best.z, lx, lz, best.ry).map(r2);
    const lin = st.linien || [];
    aus.push({ x: r2(best.x), z: r2(best.z), ry: Math.round(best.ry * 1000) / 1000, b: e.b, sla: st.la, slo: st.lo, n: (st.n || e.n || '').replace(/^(S\+U|U|S)\s+/, ''), farbe: lin[0]?.[1] ? (String(lin[0][1]).startsWith('#') ? lin[0][1] : '#' + lin[0][1]) : '#1d5fae', linien: lin.map(l => l[0]).slice(0, 6),
      poly: [ecke(-(B / 2 + W), 0), ecke(B / 2 + W, 0), ecke(B / 2 + W, OFFEN + W), ecke(-(B / 2 + W), OFFEN + W)] });
  }
  return { liste: aus, zahl };
}
