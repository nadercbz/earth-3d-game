// Worker: Kachel wird Ort (08_WELTBAU.md Phase 3, seit 29.10.2026). Lädt OpenFreeMap Vektorkacheln und AWS Terrarium Höhen (Stufe 14),
// erkennt Land und Region (daten/heute/ctry_2048.bin), baut mit kit/ortbau.js die Ortsdaten und schickt sie an die Seite.
// Nachrichten: { auftrag: 'ort', id, lat, lon, halb, seed, name } -> { id, daten } oder { id, fehler }
import { leseKachel } from './mvt.js';
import { baueOrt } from './ortbau.js';
import { landAn, region, gebaeudeTyp } from './regionen.js';
import earcut from '../node_modules/three/src/extras/lib/earcut.js';

const VEKTOR = 'https://tiles.openfreemap.org/planet/20261025_080012_pt/{z}/{x}/{y}.pbf';
const HOEHE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const SCHICHTEN = new Set(['building', 'transportation', 'water', 'waterway', 'landcover', 'landuse', 'poi', 'park', 'aeroway']);
const Z = 14;
let CL = null, laender = null, raster = null;
const cacheV = new Map(), cacheH = new Map();

async function clipper() {
  if (CL) return CL;
  const code = await (await fetch(new URL('../node_modules/clipper-lib/clipper.js', import.meta.url))).text();
  const modul = { exports: {} };
  new Function('module', 'exports', code)(modul, modul.exports);   // klassisches Skript, liefert ClipperLib über module.exports
  return (CL = modul.exports);
}
async function entpacke(buf) { const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter(); w.write(new Uint8Array(buf)); w.close(); return new Response(ds.readable).arrayBuffer(); }
async function laenderLaden() {
  if (laender) return;
  const [c, r] = await Promise.all([fetch(new URL('../daten/heute/countries.json', import.meta.url)).then(x => x.json()), fetch(new URL('../daten/heute/ctry_2048.bin', import.meta.url)).then(x => x.arrayBuffer())]);
  raster = new Uint16Array(await entpacke(r)); laender = new Map(c.countries.map(l => [l.id, l]));
}
// Minimum oder Maximum im Fenster (2r+1)² über ein quadratisches Raster, getrennt nach Zeilen und Spalten
function fenster(a, n, r, max) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length), f = max ? Math.max : Math.min;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let v = a[j * n + i]; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) v = f(v, a[j * n + k]); t[j * n + i] = v; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let v = t[j * n + i]; for (let k = Math.max(0, j - r); k <= Math.min(n - 1, j + r); k++) v = f(v, t[k * n + i]); o[j * n + i] = v; }
  return o;
}
function weich(a, n, r) {   // Kastenfilter mit Radius r, zweimal angewandt fast wie Gauß
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, i - r); k <= Math.min(n - 1, i + r); k++) { s += a[j * n + k]; c++; } t[j * n + i] = s / c; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = Math.max(0, j - r); k <= Math.min(n - 1, j + r); k++) { s += t[k * n + i]; c++; } o[j * n + i] = s / c; }
  return o;
}
// Öffnung mit Kappe nach Hang (wie bodenGekappt in kit/erde.js): Häuser auf flachem Grund fallen weg, Berggrate bleiben (höchstens 25 m tiefer)
function gekappt(roh, n, r, pxm) {
  const o = fenster(fenster(roh, n, r, false), n, r, true), out = new Float32Array(roh.length), b = Math.max(1, r);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - b), i1 = Math.min(n - 1, i + b), j0 = Math.max(0, j - b), j1 = Math.min(n - 1, j + b);
    const hang = Math.hypot((o[j * n + i1] - o[j * n + i0]) / ((i1 - i0) * pxm || 1), (o[j1 * n + i] - o[j0 * n + i]) / ((j1 - j0) * pxm || 1));
    const t = Math.min(1, Math.max(0, (hang - 0.05) / 0.15)), s = t * t * (3 - 2 * t), kappe = 400 * (1 - s) + 25 * s;
    out[j * n + i] = Math.max(o[j * n + i], roh[j * n + i] - kappe);
  }
  return out;
}
export function bodenFilter(roh, n, r = 10, rw = 3, pxm = 250 / Math.max(1, r)) { return weich(weich(gekappt(roh, n, r, pxm), n, rw), n, rw); }

function merke(cache, key, wert, max = 48) { cache.set(key, wert); if (cache.size > max) cache.delete(cache.keys().next().value); return wert; }
async function vektor(x, y, z = Z) {
  const key = `${z}/${x}/${y}`; if (cacheV.has(key)) return cacheV.get(key);
  const r = await fetch(VEKTOR.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  if (r.status === 204 || r.status === 404) return merke(cacheV, key, {});   // leere Kachel (offenes Meer)
  if (!r.ok) throw new Error(`Kachel ${key}: ${r.status}`);
  return merke(cacheV, key, leseKachel(new Uint8Array(await r.arrayBuffer()), SCHICHTEN));
}
async function hoehen(x, y) {   // Terrarium: Höhe = R · 256 + G + B / 256 - 32768
  const key = `${x}/${y}`; if (cacheH.has(key)) return cacheH.get(key);
  try {
    const r = await fetch(HOEHE.replace('{z}', Z).replace('{x}', x).replace('{y}', y)); if (!r.ok) throw new Error(r.status);
    const bmp = await createImageBitmap(await r.blob()), c = new OffscreenCanvas(256, 256), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0); bmp.close(); const d = g.getImageData(0, 0, 256, 256).data, h = new Float32Array(256 * 256);
    for (let i = 0; i < h.length; i++) h[i] = Math.max(-5, d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768);
    return merke(cacheH, key, h, 32);
  } catch (e) { return merke(cacheH, key, null, 32); }
}

// ---------- Fernbereich (08_WELTBAU.md Phase 4, seit 29.10.2026) ----------
// Karte einer Kugelkachel: Landbedeckung, Nutzung, Parks, Wasser, Häuser und Straßen aus der Vektorkachel derselben Stufe, von oben gemalt
// (Farben wie der gebaute Ort aus der Luft: Asphalt, Gehweg, Grün, Wasser). Liefert ein ImageBitmap (übertragbar).
const FARBE = {
  land: '#b4ae9b', farmland: '#b7b28a', grass: '#8b9f68', wood: '#5b7446', wetland: '#7c9070', sand: '#d9cca4', ice: '#edf1f3', rock: '#a39d92',
  wohnen: '#a7a196', gewerbe: '#a59f97', industrie: '#9c978f', friedhof: '#8c9d76', sport: '#8aa86a', bildung: '#b6afa3', militaer: '#a5a293',
  park: '#87a063', wasser: '#2c4b5e', meer: '#203f54', haus: '#8d857a', gehweg: '#a7a39a', asphalt: '#5c5c5a', pfad: '#b6ab99', gleis: '#6d6863', piste: '#666664',
};
const NUTZUNG = { residential: 'wohnen', suburb: 'wohnen', neighbourhood: 'wohnen', quarter: 'wohnen', commercial: 'gewerbe', retail: 'gewerbe', industrial: 'industrie', railway: 'industrie',
  garages: 'industrie', cemetery: 'friedhof', pitch: 'sport', playground: 'sport', stadium: 'sport', track: 'sport', school: 'bildung', university: 'bildung', college: 'bildung',
  hospital: 'bildung', kindergarten: 'bildung', military: 'militaer', quarry: 'rock', theme_park: 'park', zoo: 'park' };
const BREITE_M = { motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9, minor: 7, service: 4.5, busway: 7, raceway: 10, track: 3, path: 2, rail: 3, transit: 3 };
async function karte({ z, x, y, groesse = 512 }) {
  const t = await vektor(x, y, z), G = groesse, c = new OffscreenCanvas(G, G), g = c.getContext('2d');
  const n = 2 ** z, latM = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n))), mpp = 40075016 * Math.cos(latM) / n / G;
  g.clearRect(0, 0, G, G);   // durchsichtig: wo nichts gemalt ist, bleibt auf der Kugel das Satellitenbild (seit 29.10.2026 abends)
  const flaeche = (schicht, farbeVon, alpha = 1) => {
    g.globalAlpha = alpha;
    const L = t[schicht]; if (!L) return; const s = G / L.extent;
    for (const f of L.merkmale) {
      if (f.typ !== 3) continue; const fb = farbeVon(f.p); if (!fb) continue;
      g.beginPath(); for (const r of f.g) { g.moveTo(r[0][0] * s, r[0][1] * s); for (let i = 1; i < r.length; i++) g.lineTo(r[i][0] * s, r[i][1] * s); g.closePath(); }
      g.fillStyle = fb; g.fill('evenodd');
    }
    g.globalAlpha = 1;
  };
  const linie = (schicht, stil) => {
    const L = t[schicht]; if (!L) return; const s = G / L.extent;
    for (const f of L.merkmale) {
      if (f.typ !== 2) continue; const st = stil(f.p); if (!st) continue;
      g.beginPath(); for (const r of f.g) { g.moveTo(r[0][0] * s, r[0][1] * s); for (let i = 1; i < r.length; i++) g.lineTo(r[i][0] * s, r[i][1] * s); }
      g.strokeStyle = st[0]; g.lineWidth = Math.max(st[2] || 0.5, st[1] / mpp); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    }
  };
  // Über dem Satellitenbild (seit 29.10.2026, Wunsch Nr. 33): keine Flächen für Natur und Nutzung (das Foto ist echter), nur Ufer leicht
  // nachgezogen und Straßen scharf in Asphaltfarbe, ohne helle Ränder (die wirkten wie eine Straßenkarte)
  flaeche('water', p => p.class === 'ocean' || p.brunnel === 'tunnel' ? null : FARBE.wasser, 0.35);   // Meer malt der Shader der Kugel (Wellen, Spiegelung)
  g.globalAlpha = 0.5; linie('waterway', p => p.brunnel === 'tunnel' ? null : [FARBE.wasser, p.class === 'river' ? 18 : p.class === 'canal' ? 12 : 3, 0.6]);
  g.globalAlpha = 0.85; linie('aeroway', p => p.class === 'runway' ? [FARBE.piste, 45, 1] : p.class === 'taxiway' ? [FARBE.piste, 18, 0.6] : null);
  const strassen = p => p.brunnel !== 'tunnel' && BREITE_M[p.class] && !['path', 'track', 'rail', 'transit'].includes(p.class);
  g.globalAlpha = 0.35; linie('transportation', p => p.brunnel !== 'tunnel' && (p.class === 'rail' || p.class === 'transit') ? [FARBE.gleis, 3, 0.5] : null);
  g.globalAlpha = 0.8; linie('transportation', p => strassen(p) ? [FARBE.asphalt, BREITE_M[p.class], p.class === 'minor' || p.class === 'service' ? 0.4 : 0.9] : null);
  g.globalAlpha = 1;
  // Häuser: leicht unterschiedliche Töne je Haus, dunkler Rand (Schatten der Kante)
  const B = t.building;
  if (B) {
    const s = G / B.extent;
    for (const f of B.merkmale) {
      if (f.typ !== 3) continue; const v = ((f.id ?? 7) * 2654435761 >>> 0) / 4294967296;
      g.beginPath(); for (const r of f.g) { g.moveTo(r[0][0] * s, r[0][1] * s); for (let i = 1; i < r.length; i++) g.lineTo(r[i][0] * s, r[i][1] * s); g.closePath(); }
      const h = 128 + Math.round((v - 0.5) * 26); g.globalAlpha = 0.28; g.fillStyle = `rgb(${h + 13},${h + 5},${h - 6})`; g.fill('evenodd'); g.globalAlpha = 1;
      if (mpp < 6) { g.strokeStyle = 'rgba(40,36,32,0.35)'; g.lineWidth = 1; g.stroke(); }
    }
  }
  // Wassermaske (Meer, Seen, Flüsse) für den Shader der Kugel: genaue Küsten statt Schätzung aus Höhe und Foto
  const MG = G / 4, mc = new OffscreenCanvas(MG, MG), mg = mc.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, MG, MG); mg.fillStyle = '#fff'; mg.strokeStyle = '#fff';
  const W = t.water; if (W) { const s = MG / W.extent; for (const f of W.merkmale) { if (f.typ !== 3 || f.p.brunnel === 'tunnel') continue; mg.beginPath(); for (const r of f.g) { mg.moveTo(r[0][0] * s, r[0][1] * s); for (let i = 1; i < r.length; i++) mg.lineTo(r[i][0] * s, r[i][1] * s); mg.closePath(); } mg.fill('evenodd'); } }
  const WW = t.waterway; if (WW) { const s = MG / WW.extent; for (const f of WW.merkmale) { if (f.typ !== 2 || f.p.brunnel === 'tunnel' || (f.p.class !== 'river' && f.p.class !== 'canal')) continue; mg.beginPath(); for (const r of f.g) { mg.moveTo(r[0][0] * s, r[0][1] * s); for (let i = 1; i < r.length; i++) mg.lineTo(r[i][0] * s, r[i][1] * s); } mg.lineWidth = Math.max(1, (f.p.class === 'river' ? 18 : 12) / (mpp * 4)); mg.stroke(); } }
  // ohne Vormultiplikation, damit der Shader Farbe und Deckkraft getrennt bekommt (mix mit dem Satellitenbild)
  const [bild, maske] = await Promise.all([createImageBitmap(g.getImageData(0, 0, G, G), { premultiplyAlpha: 'none' }), createImageBitmap(mc)]);
  return { bild, maske };
}

// Minikarte (Wunsch Nr. 34, 29.10.2026): dunkler Kartenstil wie in GTA aus derselben Vektorkachel. deckend: mit Grund (nah), sonst nur
// Wasser und Straßen durchsichtig (über dem Satellitenbild, weit draußen). Straßen in echter Breite, weit draußen mit Mindestbreite in Pixeln.
const MK = { grund: '#2a3037', stadt: '#2f353d', gruen: '#2c4135', wald: '#27392e', sand: '#4a4636', eis: '#59636b', wasser: '#33617f', haus: '#3b4149', hausRand: '#464d56',
  gold: '#e3b04f', hell: '#e4e7ea', mittel: '#bfc4ca', klein: '#8c939b', weg: '#5d646c', gleis: '#545a62', piste: '#4d535a' };
async function minikarte({ z, x, y, groesse = 256, deckend = true }) {
  const t = await vektor(x, y, z), G = groesse, c = new OffscreenCanvas(G, G), g = c.getContext('2d');
  const n = 2 ** z, latM = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n))), mpp = 40075016 * Math.cos(latM) / n / G;
  if (deckend) { g.fillStyle = MK.grund; g.fillRect(0, 0, G, G); } else g.clearRect(0, 0, G, G);
  const pfad = (f, s, zu) => { g.beginPath(); for (const r of f.g) { g.moveTo(r[0][0] * s, r[0][1] * s); for (let i = 1; i < r.length; i++) g.lineTo(r[i][0] * s, r[i][1] * s); if (zu) g.closePath(); } };
  const flaeche = (schicht, farbeVon) => { const L = t[schicht]; if (!L) return; const s = G / L.extent; for (const f of L.merkmale) { if (f.typ !== 3) continue; const fb = farbeVon(f.p); if (!fb) continue; pfad(f, s, true); g.fillStyle = fb; g.fill('evenodd'); } };
  const linie = (schicht, stil) => { const L = t[schicht]; if (!L) return; const s = G / L.extent; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const f of L.merkmale) { if (f.typ !== 2) continue; const st = stil(f.p); if (!st) continue; pfad(f, s, false); g.strokeStyle = st[0]; g.lineWidth = Math.max(st[2], st[1] / mpp); g.stroke(); } };
  if (deckend) {
    flaeche('landuse', p => NUTZUNG[p.class] === 'wohnen' || NUTZUNG[p.class] === 'gewerbe' || NUTZUNG[p.class] === 'industrie' ? MK.stadt : null);
    flaeche('landcover', p => p.class === 'wood' ? MK.wald : p.class === 'grass' || p.class === 'wetland' ? MK.gruen : p.class === 'sand' ? MK.sand : p.class === 'ice' || p.class === 'glacier' ? MK.eis : null);
    flaeche('park', () => MK.gruen);
    flaeche('landuse', p => ['cemetery', 'pitch', 'playground', 'stadium', 'zoo', 'theme_park'].includes(p.class) ? MK.gruen : null);
  }
  flaeche('water', p => p.brunnel === 'tunnel' ? null : MK.wasser);
  linie('waterway', p => p.brunnel === 'tunnel' ? null : [MK.wasser, p.class === 'river' ? 22 : p.class === 'canal' ? 14 : 5, p.class === 'river' ? 1.6 : 0.8]);
  if (deckend) linie('aeroway', p => p.class === 'runway' ? [MK.piste, 50, 2] : p.class === 'taxiway' ? [MK.piste, 20, 1] : null);
  if (deckend && mpp < 3.5) {   // Häuser erst nah (sonst nur Rauschen)
    const B = t.building; if (B) { const s = G / B.extent; g.lineWidth = 1; for (const f of B.merkmale) { if (f.typ !== 3) continue; pfad(f, s, true); g.fillStyle = MK.haus; g.fill('evenodd'); if (mpp < 1.6) { g.strokeStyle = MK.hausRand; g.stroke(); } } }
  }
  const tunnel = p => p.brunnel === 'tunnel';
  if (deckend) linie('transportation', p => !tunnel(p) && (p.class === 'rail' || p.class === 'transit') ? [MK.gleis, 4, 0.8] : null);
  if (deckend && mpp < 2.5) linie('transportation', p => !tunnel(p) && (p.class === 'path' || p.class === 'track') ? [MK.weg, 2.5, 0.8] : null);
  const fahrbahn = { motorway: [MK.gold, 22, 2.6], trunk: [MK.gold, 18, 2.4], primary: [MK.hell, 15, 2.2], secondary: [MK.mittel, 12, 1.8], tertiary: [MK.mittel, 10, 1.5], minor: [MK.klein, 7, 1.1], service: [MK.klein, 4.5, 0.7], busway: [MK.klein, 6, 0.9] };
  for (const stufe of [['minor', 'service', 'busway'], ['tertiary', 'secondary'], ['primary'], ['trunk', 'motorway']]) {   // kleine zuerst, große obenauf
    linie('transportation', p => !tunnel(p) && stufe.includes(p.class) && fahrbahn[p.class] && (deckend || mpp > 1.2 || p.class !== 'service') ? fahrbahn[p.class] : null);
  }
  return createImageBitmap(c);
}

// Gebäudekisten einer Kachel (Stufe 14) für die Umgebung des gebauten Ortes: Wände und Dach je Grundriss im lokalen Rahmen der Kachelmitte
// (x Osten, y oben, z Süden, Meter), Höhe aus render_height, Boden aus dem gefilterten Gelände, Fassade nach der Bauweise der Region.
// ohne: { lat, lon, halb } Häuser mit Schwerpunkt im gebauten Ort fehlen (der Ort hat eigene).
function vereinfache(r, tol) {   // Douglas Peucker auf einem geschlossenen Ring
  if (r.length < 5) return r;
  const keep = new Uint8Array(r.length); keep[0] = keep[r.length - 1] = 1;
  const stapel = [[0, r.length - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop(); let best = -1, bd = tol * tol;
    const ax = r[a][0], az = r[a][1], dx = r[b][0] - ax, dz = r[b][1] - az, L2 = dx * dx + dz * dz || 1e-9;
    for (let i = a + 1; i < b; i++) { const t = Math.max(0, Math.min(1, ((r[i][0] - ax) * dx + (r[i][1] - az) * dz) / L2)), ex = ax + dx * t - r[i][0], ez = az + dz * t - r[i][1], d = ex * ex + ez * ez; if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; stapel.push([a, best], [best, b]); }
  }
  return r.filter((_, i) => keep[i]);
}
// Steildach einer Kiste (29.10.2026 abends, offener Punkt "Dachformen"): Sattel oder Walm über dem kleinsten umschließenden Rechteck des
// Grundrisses, Neigung je Region (Mitteleuropa 38 Grad, Nordsee 45, Mittelmeer 22), nur für kleine Wohnhäuser mit fast rechteckigem Grundriss.
// Dachflächen bekommen typ + 10 (Shader: Ziegel oder Anthrazit je Haus), Giebel die Fassade. Liefert die Traufhöhe oder null.
const NEIGUNG = { mitte: 38, nordsee: 45, skandi: 40, ost: 35, sued: 28, mittelmeer: 22, usa: 30, latam: 22, japan: 26, china: 26, korea: 26 };
function steildach(r, y1, regKey, art, R, pos, nor, typ) {
  const grad = NEIGUNG[regKey]; if (!grad || ![2, 6, 7, 8, 9].includes(art)) return null;
  const pts = r.slice(0, -1); if (pts.length < 4 || pts.length > 14) return null;
  let flaeche = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) flaeche += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]); flaeche = Math.abs(flaeche) / 2;
  let best = null;   // kleinstes umschließendes Rechteck über die Kantenrichtungen
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [px, pz] of pts) { const u = px * ux + pz * uz, v = -px * uz + pz * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const a = (u1 - u0) * (v1 - v0); if (!best || a < best.a) best = { a, ux, uz, u0, u1, v0, v1 };
  }
  if (!best || flaeche / best.a < 0.82) return null;   // L Formen und Höfe behalten das Flachdach
  let { ux, uz, u0, u1, v0, v1 } = best;
  if (v1 - v0 > u1 - u0) { [ux, uz] = [-uz, ux]; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }   // First entlang der langen Seite
  const W = (v1 - v0) / 2, Lg = u1 - u0, hr = Math.min(6, W * Math.tan(grad * Math.PI / 180)), traufe = y1 - hr * 0.45, first = traufe + hr, vm = (v0 + v1) / 2;
  const zuXZ = (u, v) => [u * ux - v * uz, u * uz + v * ux];
  const walm = Lg < 2 * W * 1.35 || regKey === 'japan' || regKey === 'china' || regKey === 'korea' || R() < 0.25;   // fast quadratisch: Walmdach
  const fa = Math.min(W, Lg / 2) * (walm ? 1 : 0);
  const E = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [...zuXZ(u, v)]), F0 = zuXZ(u0 + fa, vm), F1 = zuXZ(u1 - fa, vm);
  const dreieck = (A, B, C, t) => {   // Vorderseite nach außen und oben: Normale aus dem Kreuzprodukt, bei Bedarf Reihenfolge tauschen
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map(q => q / l);
    const mx = (A[0] + B[0] + C[0]) / 3, mz = (A[2] + B[2] + C[2]) / 3, cx = (E[0][0] + E[2][0]) / 2, cz = (E[0][1] + E[2][1]) / 2;
    const aussen = n[1] > 0.05 || (Math.abs(n[1]) <= 0.05 && n[0] * (mx - cx) + n[2] * (mz - cz) > 0);
    const o = aussen ? [A, B, C] : [A, C, B], s = aussen ? 1 : -1;
    for (const q of o) { pos.push(q[0], q[1], q[2]); nor.push(n[0] * s, n[1] * s, n[2] * s); typ.push(t); }
  };
  const e = i => [E[i][0], traufe, E[i][1]], f0 = [F0[0], first, F0[1]], f1 = [F1[0], first, F1[1]];
  dreieck(e(0), e(1), f1, art + 10); dreieck(e(0), f1, f0, art + 10);   // Seite v0
  dreieck(e(2), e(3), f0, art + 10); dreieck(e(2), f0, f1, art + 10);   // Seite v1
  if (walm) { dreieck(e(3), e(0), f0, art + 10); dreieck(e(1), e(2), f1, art + 10); }   // Walmflächen
  else { dreieck(e(3), e(0), f0, art); dreieck(e(1), e(2), f1, art); }                    // Giebel in der Fassade
  return traufe;
}
// Bäume außerhalb des Ortes (29.10.2026 spät, Nader: "Die Welt sieht viel zu leer aus"): Wald dicht, Parks locker, Wiesen vereinzelt, je Kachel
// höchstens baumBudget, fester Zufall je Kachel (dieselben Bäume bei jedem Laden). Liefert [x, y, z, Höhe, Art] im Rahmen der Kachelmitte (Art 0 Laub, 1 Nadel)
function baeumeDerKachel(t, x, y, n, zuM, hAn, lonC, latC, K_LON, K_LAT, ohne, regKey, budget) {
  const raus = []; if (!budget) return raus;
  const R = (() => { let s = (x * 2654435761 ^ y * 40503) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
  const nadel = ['skandi', 'ost', 'nordsee'].includes(regKey) ? 0.55 : regKey === 'mittelmeer' || regKey === 'sued' ? 0.35 : 0.25;
  const flaechen = [];
  const sammle = (L, dichte, hoch) => { if (!L) return; for (const f of L.merkmale) { if (f.typ !== 3) continue; const d = dichte(f.p); if (d) flaechen.push({ f, e: L.extent, d, hoch }); } };
  sammle(t.landcover, p => p.class === 'wood' ? 1 / 170 : p.class === 'grass' ? 1 / 2600 : null, [13, 11]);
  sammle(t.park, () => 1 / 650, [10, 9]);
  sammle(t.landuse, p => p.class === 'cemetery' ? 1 / 500 : null, [10, 8]);
  const ox = ohne ? (ohne.lon - lonC) * K_LON : 0, oz = ohne ? (latC - ohne.lat) * K_LAT : 0;
  for (const { f, e, d, hoch } of flaechen) {
    const ringe = f.g.map(r => r.map(([px, py]) => zuM(px, py)));
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, A = 0;
    for (const r of ringe) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); x0 = Math.min(x0, r[i][0]); x1 = Math.max(x1, r[i][0]); z0 = Math.min(z0, r[i][1]); z1 = Math.max(z1, r[i][1]); } A += a / 2; }
    const ziel = Math.min(Math.round(Math.abs(A) * d), budget - raus.length / 5); if (ziel < 1) continue;
    const drin = (px, pz) => { let c = false; for (const r of ringe) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c; } return c; };
    for (let k = 0, gesetzt = 0; k < ziel * 3 && gesetzt < ziel; k++) {
      const px = x0 + R() * (x1 - x0), pz = z0 + R() * (z1 - z0);
      if (!drin(px, pz)) continue;
      if (ohne && Math.abs(px - ox) < ohne.halb && Math.abs(pz - oz) < ohne.halb) continue;   // im gebauten Ort stehen seine eigenen Bäume
      const ppx = ((px / K_LON + lonC) + 180) / 360 * n, phi = (latC - pz / K_LAT) * Math.PI / 180, ppy = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * n;
      raus.push(Math.round(px * 10) / 10, hAn((ppx - x) * 256, (ppy - y) * 256), Math.round(pz * 10) / 10, hoch[0] + R() * hoch[1], R() < nadel ? 1 : 0); gesetzt++;
    }
    if (raus.length / 5 >= budget) break;
  }
  return raus;
}
async function kisten({ x, y, ohne = null, budget = 60000, baumBudget = 0 }) {
  await laenderLaden();
  const z = 14, n = 2 ** z, t = await vektor(x, y, z), B = t.building;
  const lonC = (x + 0.5) / n * 360 - 180, latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n))) * 180 / Math.PI;
  const phi = latC * Math.PI / 180, K_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), K_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
  // Gelände der Kachel: Terrarium, Öffnung und Weichzeichnen wie im Ort, relativ zur Höhe der Kachelmitte
  const roh = await hoehen(x, y), feld = roh ? bodenFilter(roh, 256, Math.round(250 / (40075016 * Math.cos(latC * Math.PI / 180) / 2 ** 14 / 256)), 4) : null, hc = feld ? feld[128 * 256 + 128] : 0;   // 250 m Fenster wie Kugel und Ort
  const hAn = (px, py) => feld ? feld[Math.max(0, Math.min(255, Math.round(py))) * 256 + Math.max(0, Math.min(255, Math.round(px)))] - hc : 0;
  const land = landAn(latC, lonC, raster, laender), reg = region(land, latC);
  const pos = [], nor = [], typ = [], kandidaten = [];
  let anzahl = 0;
  if (B) {
    const e = B.extent, zuM = (px, py) => { const lon = (x + px / e) / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + py / e) / n))) * 180 / Math.PI; return [(lon - lonC) * K_LON, (latC - lat) * K_LAT]; };
    const R = (() => { let s = (x * 73856093 ^ y * 19349663) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    for (const f of B.merkmale) {
      if (f.typ !== 3 || f.p.hide_3d) continue;
      // Ringe: erster ist außen, Ringe mit anderem Drehsinn sind Löcher (MVT), ein neuer Außenring beginnt ein neues Polygon
      const ringe = f.g.map(r => r.map(([px, py]) => zuM(px, py))), polys = [];
      for (const r of ringe) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); if (Math.abs(a) < 2) continue; if (a > 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r); }
      const h = Math.max(3, +f.p.render_height || reg.hoehe * (0.8 + R() * 0.4)), m = Math.max(0, +f.p.render_min_height || 0);
      for (const P of polys) {
        const aussen = P[0]; let cx = 0, cz = 0; for (const [px, pz] of aussen) { cx += px; cz += pz; } cx /= aussen.length; cz /= aussen.length;
        if (ohne) { const ox = (ohne.lon - lonC) * K_LON, oz = (latC - ohne.lat) * K_LAT; if (Math.abs(cx - ox) < ohne.halb && Math.abs(cz - oz) < ohne.halb) continue; }
        let flaeche = 0; for (let i = 0, j = aussen.length - 1; i < aussen.length; j = i++) flaeche += (aussen[j][0] - aussen[i][0]) * (aussen[j][1] + aussen[i][1]); flaeche = Math.abs(flaeche) / 2;
        if (flaeche < 12) continue;
        const art = gebaeudeTyp({ h, flaeche, nutzung: '', laden: false, farbe: f.p.colour }, R, reg).fern;
        if (h < 6 && flaeche < 50) continue;   // Schuppen und Garagen sieht man aus der Ferne nicht
        const ppx = (cx / K_LON + lonC + 180) / 360 * n, ppy = (1 - Math.log(Math.tan((latC - cz / K_LAT) * Math.PI / 180) + 1 / Math.cos((latC - cz / K_LAT) * Math.PI / 180)) / Math.PI) / 2 * n;
        const basis = hAn((ppx - x) * 256, (ppy - y) * 256), y0 = basis + (m > 0 ? m : -2.5), y1 = basis + h;   // ohne Mindesthöhe 2,5 m in den Boden, gegen Schweben am Hang
        const rs = P.map(r => vereinfache(r, 0.8)).filter(r => r.length >= 4);
        if (!rs.length) continue;
        const kosten = rs.reduce((a, r) => a + (r.length - 1) * 3, 0);
        kandidaten.push({ rs, y0, y1, art, wert: h * Math.sqrt(flaeche), kosten, steil: rs.length === 1 && h - m <= 16 && flaeche >= 40 && flaeche <= 450 });
      }
    }
    kandidaten.sort((a, b) => b.wert - a.wert);
    let summe = 0;
    for (const { rs, y0, y1: y1voll, art, kosten, steil } of kandidaten) {
      if (summe + kosten > budget) break; summe += kosten;
      {
        const traufe = steil ? steildach(rs[0], y1voll, reg.key, art, R, pos, nor, typ) : null, y1 = traufe ?? y1voll;   // Steildach: Wände bis zur Traufe
        // Wände (Ringe geschlossen: letzter Punkt gleich erstem), Normale nach außen über den Drehsinn
        for (let ri = 0; ri < rs.length; ri++) {
          const r = rs[ri]; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
          const aussenRing = ri === 0, sgn = (a > 0) === aussenRing ? 1 : -1;
          for (let i = 0; i < r.length - 1; i++) {
            const [ax, az] = r[i], [bx, bz] = r[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
            let nx = (bz - az) / L * sgn, nz = -(bx - ax) / L * sgn;
            const quad = [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y0, az], [bx, y1, bz], [ax, y1, az]];
            // Drehsinn so, dass die Vorderseite nach außen zeigt
            const e1 = [bx - ax, 0, bz - az], e2 = [0, y1 - y0, 0], cxp = e1[1] * e2[2] - e1[2] * e2[1], czp = e1[0] * e2[1] - e1[1] * e2[0];
            const ord = cxp * nx + czp * nz >= 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
            for (const k of ord) { pos.push(quad[k][0], quad[k][1], quad[k][2]); nor.push(nx, 0, nz); typ.push(art); }
          }
        }
        // Dach mit Löchern (earcut), Normale nach oben (nicht unter einem Steildach)
        if (traufe !== null) { anzahl++; continue; }
        const flach = [], loecher = []; for (let ri = 0; ri < rs.length; ri++) { if (ri) loecher.push(flach.length / 2); for (let i = 0; i < rs[ri].length - 1; i++) flach.push(rs[ri][i][0], rs[ri][i][1]); }
        const tri = earcut(flach, loecher.length ? loecher : null);
        for (let i = 0; i < tri.length; i += 3) {
          const A = tri[i], Bv = tri[i + 1], C = tri[i + 2], ax = flach[A * 2], az = flach[A * 2 + 1], bx = flach[Bv * 2], bz = flach[Bv * 2 + 1], cx2 = flach[C * 2], cz2 = flach[C * 2 + 1];
          const ny = (bz - az) * (cx2 - ax) - (bx - ax) * (cz2 - az), o = ny >= 0 ? [A, Bv, C] : [A, C, Bv];
          for (const k of o) { pos.push(flach[k * 2], y1, flach[k * 2 + 1]); nor.push(0, 1, 0); typ.push(art); }
        }
        anzahl++;
      }
    }
  }
  const P = new Float32Array(pos), N = new Float32Array(nor), T = new Float32Array(typ);
  const e0 = B ? B.extent : 4096, zuM0 = (px, py) => { const lon = (x + px / e0) / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + py / e0) / n))) * 180 / Math.PI; return [(lon - lonC) * K_LON, (latC - lat) * K_LAT]; };
  const BA = new Float32Array(baeumeDerKachel(t, x, y, n, zuM0, hAn, lonC, latC, K_LON, K_LAT, ohne, reg.key, baumBudget));
  return { lat: latC, lon: lonC, h: hc, anzahl, pos: P, nor: N, typ: T, baeume: BA, transfer: [P.buffer, N.buffer, T.buffer, BA.buffer] };
}

self.onmessage = async (ev) => {
  const { auftrag, id, lat, lon, halb = 600, seed = 7, name = '' } = ev.data;
  if (auftrag === 'minikarte') { try { const b = await minikarte(ev.data); self.postMessage({ id, daten: b }, [b]); } catch (e) { self.postMessage({ id, fehler: String(e && e.message || e) }); } return; }
  if (auftrag === 'karte') { try { const d = await karte(ev.data); self.postMessage({ id, daten: d }, [d.bild, d.maske]); } catch (e) { self.postMessage({ id, fehler: String(e && e.message || e) }); } return; }
  if (auftrag === 'kisten') { try { const k = await kisten(ev.data); const tr = k.transfer; delete k.transfer; self.postMessage({ id, daten: k }, tr); } catch (e) { self.postMessage({ id, fehler: String(e && e.stack || e) }); } return; }
  if (auftrag !== 'ort') return;
  try {
    const t0 = performance.now();
    await Promise.all([clipper(), laenderLaden()]);
    const n = 2 ** Z, phi = lat * Math.PI / 180, K_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), K_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
    const kachelVon = (la, lo) => ({ x: Math.floor((lo + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(la * Math.PI / 180) + 1 / Math.cos(la * Math.PI / 180)) / Math.PI) / 2 * n) });
    const rand = halb + 60, a = kachelVon(lat + rand / K_LAT, lon - rand / K_LON), b = kachelVon(lat - rand / K_LAT, lon + rand / K_LON);
    const liste = []; for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) liste.push({ x, y });
    const [vk, hk] = await Promise.all([Promise.all(liste.map(k => vektor(k.x, k.y))), Promise.all(liste.map(k => hoehen(k.x, k.y)))]);
    const kacheln = liste.map((k, i) => ({ z: Z, x: k.x, y: k.y, schichten: vk[i] }));
    const tLaden = performance.now() - t0;
    // Gelände: absolute Höhe an (x, z) in Metern um die Mitte, bilinear aus den Terrarium Pixeln
    const hoeheAbs = (x, z) => {
      const lo = lon + x / K_LON, la = lat - z / K_LAT, fx = (lo + 180) / 360 * n, la2 = la * Math.PI / 180, fy = (1 - Math.log(Math.tan(la2) + 1 / Math.cos(la2)) / Math.PI) / 2 * n;
      const tx = Math.floor(fx), ty = Math.floor(fy), i = liste.findIndex(k => k.x === tx && k.y === ty), h = i >= 0 ? hk[i] : null; if (!h) return 0;
      const px = Math.min(254.999, Math.max(0, (fx - tx) * 256 - 0.5)), py = Math.min(254.999, Math.max(0, (fy - ty) * 256 - 0.5)), ix = Math.floor(px), iy = Math.floor(py), sx = px - ix, sy = py - iy, o = iy * 256 + ix;
      return (h[o] * (1 - sx) + h[o + 1] * sx) * (1 - sy) + (h[o + 256] * (1 - sx) + h[o + 257] * sx) * sy;
    };
    // Terrarium ist in Städten ein Oberflächenmodell (SRTM): Häuser und Bäume heben den Boden um bis zu 25 m (Potsdamer Platz roh 27,5 bis 59,8 m,
    // echt rund 34 m). Bodenfilter (seit 29.10.2026): Öffnung (Minimum, dann Maximum) mit 250 m Radius entfernt alles, was schmaler als 500 m ist
    // (auch große Baublöcke), schiefe Ebenen und Stufen (Küste, Hang) bleiben, danach zweimal weichzeichnen. Raster mit 272 m Rand, damit der
    // Rand stimmt. Dasselbe Fenster nutzen die Kugelkacheln (kit/erde.js) und die Kisten, sonst passen Ort, Kisten und Kugel nicht aufeinander.
    const s = 8, x0 = -halb - 16, nx = Math.ceil((2 * halb + 32) / s) + 1, RAND = 34, NX = nx + 2 * RAND, roh = new Float32Array(NX * NX);
    for (let j = 0; j < NX; j++) for (let i = 0; i < NX; i++) roh[j * NX + i] = hoeheAbs(x0 + (i - RAND) * s, x0 + (j - RAND) * s);
    const boden = bodenFilter(roh, NX, 31, 4), h0 = boden[(RAND + Math.round(-x0 / s)) * NX + RAND + Math.round(-x0 / s)], gh = new Float32Array(nx * nx);
    let hMin = Infinity;
    for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const v = boden[(j + RAND) * NX + i + RAND] - h0; gh[j * nx + i] = v; if (v < hMin) hMin = v; }
    const gelaende = { x0, z0: x0, s, nx, nz: nx, h: gh, hMin: Math.round(hMin * 100) / 100 };
    const G = (x, z) => { const fx = (x - x0) / s, fz = (z - x0) / s, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nx - 2, Math.floor(fz))), tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j)), o = j * nx + i; return (gh[o] * (1 - tx) + gh[o + 1] * tx) * (1 - tz) + (gh[o + nx] * (1 - tx) + gh[o + nx + 1] * tx) * tz; };
    const land = landAn(lat, lon, raster, laender), reg = region(land, lat);
    const daten = baueOrt({ CL, kacheln, lat, lon, halb, reg, land, hoehe: G, seed, stand: '25.10.2026', name });
    daten.gelaende = gelaende; daten.meta.h0 = Math.round(h0 * 10) / 10; daten.meta.zeit.laden = Math.round(tLaden); daten.meta.zeit.gesamt = Math.round(performance.now() - t0);
    self.postMessage({ id, daten }, [gh.buffer]);
  } catch (e) { self.postMessage({ id, fehler: String(e && e.stack || e) }); }
};
