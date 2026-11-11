// Echte Verkehrsdaten für Berlin (Wunsch Nr. 77 und 78, 07.11.2026): Spurzahl je Richtung, Abbiegespuren, Tempo, Ampeln und Zebrastreifen
// aus dem OpenStreetMap Auszug (© OpenStreetMap contributors, ODbL), umgewandelt mit tools/osm_verkehr.py nach daten/berlin_osm (Kacheln der
// Stufe 14 wie die Vektorkacheln). Die Vektorkacheln tragen diese Angaben nicht: jede Straße des Ortes sucht sich die OSM Straße, die in
// derselben Richtung auf ihr liegt (kit/ortbau.js), und Kreuzungen bekommen Ampeln dort, wo OSM Ampeln kennt (statt nach Faustregel).

// Kacheln (O_*.json) in Metern um die Ortsmitte. Straßen, die in mehreren Kacheln liegen, nur einmal
export function osmInOrt(kacheln, lat, lon, K_LAT, K_LON) {
  const wege = [], ampeln = [], fussAmpeln = [], zebras = [], gesehen = new Set();
  for (const d of kacheln || []) {
    if (!d?.w) continue;
    const zuM = (dla, dlo) => [(d.lon0 + dlo * 1e-7 - lon) * K_LON, -(d.lat0 + dla * 1e-7 - lat) * K_LAT];
    for (const w of d.w) {
      const p = []; for (let i = 0; i + 1 < w.p.length; i += 2) p.push(zuM(w.p[i], w.p[i + 1]));
      if (p.length < 2) continue;
      const a = p[0], b = p[p.length - 1], key = `${Math.round(a[0] * 10)},${Math.round(a[1] * 10)},${Math.round(b[0] * 10)},${Math.round(b[1] * 10)},${p.length}`;
      if (gesehen.has(key)) continue; gesehen.add(key);
      wege.push({ ...w, p });
    }
    for (const [ziel, art] of [[ampeln, 's'], [fussAmpeln, 'f'], [zebras, 'z']]) for (const [dla, dlo, r] of d[art] || []) { const q = zuM(dla, dlo); ziel.push([q[0], q[1], r]); }
  }
  return { wege, ampeln, fussAmpeln, zebras };
}

// Spuren je Richtung einer OSM Straße relativ zur Zeichenrichtung der Linie im Ort (gleich: true, wenn beide gleich laufen)
// Höchstens 3 Spuren je Richtung, im Kreisverkehr 2: das Kreuzungsmodell (kit/traffic.js) verbindet sonst zu viele Spuren in einer Kreuzung,
// Autos fuhren ineinander (Ernst-Reuter-Platz mit 5 Spuren im Kreis, 07.11.2026). Die Fahrbahn bleibt so breit wie in echt.
function spurenVon(w, gleich, einbahn) {
  const t = s => s ? String(s).split('|').map(x => x.trim()) : null, max = w.r ? 2 : 3, cap = n => n ? Math.min(max, n) : n;
  const r = spurenRoh(w, gleich, einbahn, t); if (!r) return null;
  const vor = cap(r.vor), zur = cap(r.zur);
  return { vor, zur, turnV: r.turnV?.length === vor ? r.turnV : null, turnZ: r.turnZ?.length === zur ? r.turnZ : null };
}
function spurenRoh(w, gleich, einbahn, t) {
  if (einbahn) { const n = w.lf || w.l; return n ? { vor: n, zur: 0, turnV: t(w.tf || w.t), turnZ: null } : null; }
  let f = w.lf, b = w.lb;
  if (!f && !b) { if (!(w.l >= 2)) return null; f = Math.ceil(w.l / 2); b = Math.floor(w.l / 2); }
  else if (f && !b) b = w.l ? Math.max(1, w.l - f) : 1;
  else if (b && !f) f = w.l ? Math.max(1, w.l - b) : 1;
  const tf = t(w.tf), tb = t(w.tb);
  return gleich ? { vor: f, zur: b, turnV: tf, turnZ: tb } : { vor: b, zur: f, turnV: tb, turnZ: tf };
}

// Straßenlinien des Ortes (strassenLinien in kit/ortbau.js) mit den OSM Straßen verbinden: Proben alle 8 m, die nächste OSM Strecke bis 6 m
// Abstand, die fast parallel läuft (Tunnel nie). Gewinnt eine OSM Straße mindestens die Hälfte der Proben, bekommt die Linie s.osm:
// { vor, zur, turnV, turnZ, tempo } in ihrer Zeichenrichtung (bei Einbahn in Fahrtrichtung)
export function osmZuordnen(O, strassenLinien, punktBei, laenge) {
  if (!O?.wege?.length) return 0;
  const Z = 30, raster = new Map(), key = (a, b) => a * 100003 + b;
  O.wege.forEach((w, wi) => { if (w.u) return; for (let i = 1; i < w.p.length; i++) { const A = w.p[i - 1], B = w.p[i]; for (let x = Math.floor(Math.min(A[0], B[0]) / Z); x <= Math.floor(Math.max(A[0], B[0]) / Z); x++) for (let z = Math.floor(Math.min(A[1], B[1]) / Z); z <= Math.floor(Math.max(A[1], B[1]) / Z); z++) { const k = key(x, z); (raster.get(k) || raster.set(k, []).get(k)).push(wi * 10000 + i); } } });
  let n = 0;
  for (const s of strassenLinien) {
    if (s.tunnel || s.hw === 'service') continue;
    const stimmen = new Map(); let proben = 0;
    for (const l of s.f.linien) {
      const Lg = laenge(l), schritte = [];
      for (let d = Math.min(4, Lg / 2); d < Lg - 3; d += 8) schritte.push(d);
      if (!schritte.length) schritte.push(Lg / 2);
      for (const d of schritte) {
        const q = punktBei(l, d); if (!q) continue; proben++;
        let best = null;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const c of raster.get(key(Math.floor(q.x / Z) + a, Math.floor(q.z / Z) + b)) || []) {
          const wi = Math.floor(c / 10000), i = c % 10000, w = O.wege[wi], A = w.p[i - 1], B = w.p[i], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz; if (l2 < 0.01) continue;
          const t = Math.max(0, Math.min(1, ((q.x - A[0]) * dx + (q.z - A[1]) * dz) / l2)), ab = Math.hypot(A[0] + dx * t - q.x, A[1] + dz * t - q.z);
          if (ab > 6 || (best && ab >= best.ab)) continue;
          const dot = (q.dx * dx + q.dz * dz) / Math.sqrt(l2); if (Math.abs(dot) < 0.85) continue;
          best = { ab, wi, gleich: dot > 0 };
        }
        if (best) { const k = best.wi * 2 + (best.gleich ? 1 : 0); stimmen.set(k, (stimmen.get(k) || 0) + 1); }
      }
    }
    let top = null; for (const [k, v] of stimmen) if (!top || v > top.v) top = { k, v };
    if (!top || top.v < Math.max(1, proben * 0.5)) continue;
    const w = O.wege[Math.floor(top.k / 2)], gleich = top.k % 2 === 1;
    // Einbahn: Fahrtrichtung der Linie (s.rueck: gegen die Zeichenrichtung). OSM ist auf Fahrtrichtung gedreht (tools/osm_verkehr.py)
    // Stadtautobahn und Rampen: Spurzahl bleibt nach Klasse, bis Autobahn und Brücken echte Ebenen haben (mit 3 Spuren aus OSM lagen die Rampen
    // dicht neben den Fahrspuren, 960 statt 707 Stellen im Berlin Scan). Tempo nimmt sie trotzdem aus OSM
    const autobahn = /motorway/.test(s.hw);
    const sp = autobahn ? null : spurenVon(w, gleich, s.einbahn), roh = autobahn ? null : spurenRoh(w, gleich, s.einbahn, x => x);
    s.osm = { ...(sp || {}), spurenEcht: roh ? roh.vor + (s.einbahn ? 0 : roh.zur || 0) : 0, tempo: w.v || null, hwOsm: w.h };
    n++;
  }
  return n;
}

// Kreuzungen mit Ampel: Knoten mit mindestens drei Armen, bei denen eine OSM Ampel (oder Fußgängerampel) im Umkreis liegt
export function osmAmpelKnoten(O, knoten, radius, grad) {
  const Z = 40, raster = new Map(), key = (a, b) => a * 100003 + b;
  for (const [x, z] of [...O.ampeln, ...O.fussAmpeln]) { const k = key(Math.floor(x / Z), Math.floor(z / Z)); (raster.get(k) || raster.set(k, []).get(k)).push([x, z]); }
  const out = new Set();
  knoten.forEach((c, i) => {
    if ((grad.get(i) || 0) < 3) return;
    const r = (radius[i] || 0) + 18, ix = Math.floor(c[0] / Z), iz = Math.floor(c[1] / Z);
    for (let a = -1; a <= 1 && !out.has(i); a++) for (let b = -1; b <= 1; b++) { if ((raster.get(key(ix + a, iz + b)) || []).some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < r)) { out.add(i); break; } }
  });
  return out;
}
