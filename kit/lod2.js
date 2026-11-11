// Echte Gebäude für Berlin (Wunsch Nr. 77 und 78, 07.11.2026): amtliche 3D Gebäudemodelle LoD2 (Geoportal Berlin,
// Datenlizenz Deutschland Zero 2.0, Stand 26.03.2026), umgewandelt mit tools/lod2_umwandeln.py nach daten/berlin_lod2.
// Je Gebäude oder Gebäudeteil: Grundriss aus dem Kataster, gemessene Höhe, Traufe, Dachform (AdV Schlüssel) und Nutzung
// (ALKIS Gebäudefunktion). Wo Kacheln vorliegen, ersetzen sie im Ort die Umrisse der Karte (kit/ortbau.js) und geben den
// Hauskisten in der Ferne ihre Höhe (kit/ortbau.worker.js), damit beim Näherkommen nichts springt.

// Flachdach, Pultdach, Mischform, Sonstiges: Höhe bis oben. Geneigte Dächer: bis knapp über die Traufe, die Bauweise setzt ihr Dach darauf
export const LOD2_FLACH = new Set(['1000', '2100', '5000', '9999', '']);
export function lod2Hoehe(hoehe, traufe, dach) {
  return Math.max(2.5, LOD2_FLACH.has(String(dach ?? '')) || !(traufe > 2) ? hoehe : traufe + (hoehe - traufe) * 0.35);
}
export const lod2Steil = dach => !LOD2_FLACH.has(String(dach ?? ''));

// ALKIS Gebäudefunktion ("31001_XXXX") in Sonderbau (art) und Nutzung wie die Flächen der Karte (wohnen, handel, industrie)
export function lod2Art(fn) {
  const c = +String(fn || '').split('_')[1] || 0;
  if (c >= 3040 && c <= 3048 && c !== 3044) return { art: 'gotteshaus' };
  if (c >= 3020 && c <= 3023) return { art: 'schule' };
  if (c >= 3051 && c <= 3053) return { art: 'krankenhaus' };
  if (c >= 2070 && c <= 2072) return { art: 'hotel', nutz: 'handel' };
  if ([3011, 3012, 3031, 3032, 3033, 3034, 3037, 3038].includes(c)) return { art: 'museum' };
  if (c >= 3090 && c <= 3098) return { art: 'bahnhof' };
  if (c >= 2051 && c <= 2053) return { art: 'markt', nutz: 'handel' };
  if (c === 2130) return { art: 'tankstelle' };
  if (c === 2461 || c === 2462) return { art: 'parkhaus' };
  if (c >= 1000 && c < 2000) return { nutz: 'wohnen', laden: c === 1120 || c === 1123 };
  if ((c >= 2000 && c < 2100) || c === 2310 || (c >= 3000 && c < 3100)) return { nutz: 'handel' };
  if (c >= 2100 && c < 3000) return { nutz: 'industrie' };
  return {};
}

// Kacheln der Übersicht (index.json), die ein Rechteck in Grad schneiden
export function lod2Kacheln(index, la0, la1, lo0, lo1) {
  if (!index?.kacheln) return [];
  const out = [];
  for (const [k, e] of Object.entries(index.kacheln)) {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [la, lo] of e) { a = Math.min(a, la); b = Math.max(b, la); c = Math.min(c, lo); d = Math.max(d, lo); }
    if (b >= la0 && a <= la1 && d >= lo0 && c <= lo1) out.push(k);
  }
  return out;
}

const imViereck = (v, x, z) => { let c = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) { const a = v[i], b = v[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

// Kacheln (L_*.json) in Metern um die Ortsmitte: Häuser mit Ringen (erster außen, dann Höfe) und die Abdeckung
export function lod2InOrt(kacheln, lat, lon, K_LAT, K_LON) {
  const haeuser = [], vierecke = [];
  for (const d of kacheln || []) {
    if (!d?.g) continue;
    const la0 = d.lat0, lo0 = d.lon0, zuM = (dla, dlo) => [(lo0 + dlo * 1e-7 - lon) * K_LON, -(la0 + dla * 1e-7 - lat) * K_LAT];
    vierecke.push(d.ecken.map(([la, lo]) => [(lo - lon) * K_LON, -(la - lat) * K_LAT]));
    for (const e of d.g) {
      const [id, von, fn, dach, h, , traufe, grund, daecher] = e;
      // Dachflächen: je Fläche [x, y, z, ...] mit y = Höhe über dem Boden des Hauses (Meter)
      const dachFl = (daecher || []).map(r => { const o = []; for (let i = 0; i + 2 < r.length; i += 3) { const [x, z] = zuM(r[i], r[i + 1]); o.push(x, r[i + 2] / 10, z); } return o; }).filter(o => o.length >= 9);
      let ringe = null;
      for (const r of grund) {
        const loch = r[0] === -1, ring = [];
        for (let i = loch ? 1 : 0; i + 1 < r.length; i += 2) ring.push(zuM(r[i], r[i + 1]));
        if (ring.length < 3) continue;
        if (!loch) { if (ringe) haeuser.push({ id, von, fn, dach: dach || '', h: h / 10, traufe: traufe / 10, ringe, dachFl }); ringe = [ring]; }
        else if (ringe) ringe.push(ring);
      }
      if (ringe) haeuser.push({ id, von, fn, dach: dach || '', h: h / 10, traufe: traufe / 10, ringe, dachFl });
    }
  }
  return { haeuser, vierecke, abgedeckt: (x, z) => vierecke.some(v => imViereck(v, x, z)) };
}

// Höhenindex (H_*.json) für die Hauskisten einer Kachel: Raster mit Schwerpunkt, Höhe, Traufe, Dachform in Metern um (latC, lonC)
export function lod2Hoehenraster(hKacheln, latC, lonC, K_LAT, K_LON) {
  const Z = 30, raster = new Map(), vierecke = [], key = (a, b) => a * 100003 + b;
  for (const d of hKacheln || []) {
    if (!d?.h) continue;
    if (d.ecken) vierecke.push(d.ecken.map(([la, lo]) => [(lo - lonC) * K_LON, -(la - latC) * K_LAT]));
    for (const [dla, dlo, h, traufe, dach] of d.h) {
      const x = (d.lon0 + dlo * 1e-7 - lonC) * K_LON, z = -(d.lat0 + dla * 1e-7 - latC) * K_LAT, k = key(Math.floor(x / Z), Math.floor(z / Z));
      (raster.get(k) || raster.set(k, []).get(k)).push({ x, z, h: h / 10, traufe: traufe / 10, dach: String(dach || '') });
    }
  }
  return {
    leer: raster.size === 0,
    abgedeckt: (x, z) => vierecke.some(v => imViereck(v, x, z)),
    // höchstes echtes Haus, dessen Schwerpunkt im Ring liegt
    imRing(ring) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      let best = null;
      for (let a = Math.floor(x0 / Z); a <= Math.floor(x1 / Z); a++) for (let b = Math.floor(z0 / Z); b <= Math.floor(z1 / Z); b++) for (const q of raster.get(key(a, b)) || []) {
        if (q.x < x0 || q.x > x1 || q.z < z0 || q.z > z1 || !imViereck(ring, q.x, q.z)) continue;
        if (!best || q.h > best.h) best = q;
      }
      return best;
    },
  };
}

// Dachflächen auf einen Grundriss zuschneiden (Haus mit Hof wird durch den Hof geteilt): in der Draufsicht schneiden, Höhe aus der Ebene der Fläche
export function lod2DachZuschneiden(C, dachFl, ring) {
  const out = [];
  for (const f of dachFl || []) {
    const pts = []; for (let i = 0; i + 2 < f.length; i += 3) pts.push([f[i], f[i + 1], f[i + 2]]);
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    if (Math.abs(ny) < 1e-6) continue;   // senkrecht: keine Dachfläche
    const p0 = pts[0], y = (x, z) => p0[1] - (nx * (x - p0[0]) + nz * (z - p0[2])) / ny;
    for (const t of C.schneide([C.zuC(pts.map(q => [q[0], q[2]]))], [C.zuC(ring)])) {
      const r = C.vonC(t); if (r.length < 3) continue;
      const o = []; for (const [x, z] of r) o.push(x, y(x, z), z); out.push(o);
    }
  }
  return out;
}
