// Bezirkscharakter Berlin (Wunsch Nr. 86, 08.11.2026, Nader: "Auch die Gebäude in den verschiedenen Bezirken sollen so aussehen, wie sie dort
// aussehen. In Kreuzberg sieht es anders aus, in Charlottenburg anders, sodass man das auch erkennt"). Ortsteile aus dem OSM Auszug
// (daten/berlin_kieze.json, tools/berlin_kieze.py, © OpenStreetMap contributors, ODbL), Profile nach öffentlich bekanntem Stadtbild.
// Die Bauart eines Katasterhauses folgt seiner Form (LoD2: Dach, Traufe, Grundriss), der Bezirk entscheidet Stuck, Farben, Graffiti und
// den Anteil von Altbau, Plattenbau, Nachkriegsbau und Villen. Läuft auch im Ortsworker (ohne three.js).

// Profile: alt (Anteil Altbau bei passender Form), stuck (Stuck: reich, mittel, schlicht als Gewichte), putz (Farbtöne fa0 bis fa11, wie FS_TOENE
// in kit/city.js, damit die Ferne dieselbe Farbe zeigt), graffiti (Anteil Häuser mit Tags im Erdgeschoss), zeile (lange Flachdachbauten),
// hoch (Wohnhochhäuser), klein (kleine Häuser), rot (Anteil roter Ziegel auf echten Steildächern: Altbau und große Häuser, kleine Häuser; Nr. 87)
const P = {
  edel: { rot: [0.2, 0.55], alt: 0.95, stuck: [6, 3, 1], putz: [7, 7, 0, 0, 5, 1, 1, 8], graffiti: 0.03, zeile: [[3, 'nachkrieg', ''], [2, 'neubau', '']], hoch: [[2, 'wohnturm', ''], [2, 'neubau', '']], klein: [[6, 'efh', ''], [1, 'nachkrieg', '']] },
  kreuzberg: { rot: [0.12, 0.45], alt: 0.9, stuck: [1, 3, 6], putz: [1, 11, 6, 2, 5, 8, 0, 9, 3, 1, 11], graffiti: 0.55, zeile: [[3, 'nachkrieg', ''], [2, 'neubau', ''], [1, 'betonturm', '']], hoch: [[3, 'betonturm', ''], [2, 'wohnturm', '']], klein: [[3, 'nachkrieg', ''], [2, 'efh', '']] },
  wedding: { rot: [0.18, 0.5], alt: 0.85, stuck: [1, 3, 5], putz: [0, 1, 5, 11, 2, 7, 8], graffiti: 0.35, zeile: [[4, 'nachkrieg', ''], [2, 'neubau', '']], hoch: [[3, 'wohnturm', ''], [2, 'betonturm', '']], klein: [[3, 'nachkrieg', ''], [2, 'efh', '']] },
  prenzlberg: { rot: [0.15, 0.45], alt: 0.95, stuck: [3, 5, 2], putz: [8, 9, 4, 3, 7, 0, 10, 1], graffiti: 0.15, zeile: [[2, 'platte', ''], [2, 'neubau', '']], hoch: [[3, 'platte', ''], [1, 'neubau', '']], klein: [[3, 'neubau', ''], [2, 'efh', '']] },
  friedrichshain: { rot: [0.15, 0.45], alt: 0.85, stuck: [1, 4, 5], putz: [1, 8, 2, 5, 11, 0, 6, 9], graffiti: 0.45, zeile: [[4, 'platte', ''], [1, 'neubau', '']], hoch: [[4, 'platte', ''], [1, 'neubau', '']], klein: [[2, 'neubau', ''], [2, 'efh', '']] },
  mitte: { rot: [0.12, 0.4], alt: 0.9, stuck: [3, 5, 2], putz: [7, 0, 1, 8, 5, 3, 9], graffiti: 0.1, zeile: [[3, 'platte', ''], [2, 'neubau', '']], hoch: [[4, 'platte', ''], [1, 'neubau', '']], klein: [[3, 'neubau', ''], [1, 'efh', '']] },
  ostplatte: { rot: [0.35, 0.55], mittel: [[3, 'platte', ''], [2, 'nachkrieg', ''], [1, 'efh', '']], alt: 0.35, stuck: [1, 3, 4], putz: [0, 5, 1, 7, 8], graffiti: 0.08, zeile: [[8, 'platte', ''], [1, 'neubau', '']], hoch: [[8, 'platte', ''], [1, 'wohnturm', '']], klein: [[5, 'efh', ''], [1, 'nachkrieg', '']] },
  westsiedlung: { rot: [0.6, 0.7], alt: 0.6, stuck: [1, 4, 4], putz: [7, 0, 5, 1, 3], graffiti: 0.06, zeile: [[4, 'nachkrieg', ''], [2, 'neubau', '']], hoch: [[3, 'wohnturm', ''], [3, 'betonturm', ''], [1, 'neubau', '']], klein: [[4, 'efh', ''], [2, 'reihenhaus', '']] },
  villen: { rot: [0.7, 0.75], mittel: [[5, 'efh', ''], [2, 'nachkrieg', ''], [1, 'neubau', '']], alt: 0.7, stuck: [5, 4, 1], putz: [7, 0, 1, 5, 8, 3], graffiti: 0.01, zeile: [[3, 'nachkrieg', ''], [2, 'neubau', '']], hoch: [[2, 'wohnturm', ''], [2, 'neubau', '']], klein: [[8, 'efh', '']] },
  vorstadt: { rot: [0.55, 0.65], alt: 0.7, stuck: [2, 5, 3], putz: [0, 7, 1, 5, 8, 2, 3], graffiti: 0.05, zeile: [[3, 'nachkrieg', ''], [2, 'neubau', '']], hoch: [[2, 'wohnturm', ''], [2, 'neubau', '']], klein: [[6, 'efh', ''], [2, 'reihenhaus', '']] },
};
// Ortsteile zu Profilen (alle 96 Berliner Ortsteile, Rest: vorstadt)
const MITTEL = [[3, 'nachkrieg', ''], [2, 'neubau', ''], [1, 'efh', '']], LADEN = [[3, 'nachkrieg', ''], [2, 'neubau', ''], [1, 'band', 'weiss']];
const ORTSTEIL = {
  Charlottenburg: 'edel', Wilmersdorf: 'edel', Halensee: 'edel', Schöneberg: 'edel', Friedenau: 'edel', Westend: 'villen', Grunewald: 'villen', Schmargendorf: 'edel',
  Kreuzberg: 'kreuzberg', Neukölln: 'kreuzberg', Wedding: 'wedding', Gesundbrunnen: 'wedding', Moabit: 'wedding', Tiergarten: 'mitte', Hansaviertel: 'westsiedlung',
  'Prenzlauer Berg': 'prenzlberg', Friedrichshain: 'friedrichshain', Mitte: 'mitte', 'Alt-Treptow': 'friedrichshain', Rummelsburg: 'friedrichshain', Pankow: 'prenzlberg', Weißensee: 'prenzlberg',
  Marzahn: 'ostplatte', Hellersdorf: 'ostplatte', 'Neu-Hohenschönhausen': 'ostplatte', Fennpfuhl: 'ostplatte', Friedrichsfelde: 'ostplatte', Lichtenberg: 'ostplatte', 'Alt-Hohenschönhausen': 'ostplatte', Buch: 'ostplatte',
  Gropiusstadt: 'westsiedlung', 'Märkisches Viertel': 'westsiedlung', 'Falkenhagener Feld': 'westsiedlung', Staaken: 'westsiedlung', 'Charlottenburg-Nord': 'westsiedlung', Siemensstadt: 'westsiedlung', Haselhorst: 'westsiedlung',
  Lichterfelde: 'villen', Oberschöneweide: 'wedding', Niederschöneweide: 'wedding', Britz: 'westsiedlung', Steglitz: 'vorstadt', Spandau: 'wedding',
  Dahlem: 'villen', Zehlendorf: 'villen', Nikolassee: 'villen', Wannsee: 'villen', Schlachtensee: 'villen', Frohnau: 'villen', Hermsdorf: 'villen', Kladow: 'villen', Gatow: 'villen', Karlshorst: 'villen', Grünau: 'villen', Müggelheim: 'villen', Rahnsdorf: 'villen', Schmöckwitz: 'villen',
};
// Zonen mit eigener Bauart: Karl-Marx-Allee zwischen Strausberger Platz und Frankfurter Tor (Zuckerbäckerstil mit Keramikfassade)
const ZONEN = [{ name: 'Karl-Marx-Allee', typ: 'lochfassade', variant: 'stein', vg: { wand: 'steinGelb' }, ton: 20, pfad: [[52.51862, 13.42985], [52.51722, 13.44103], [52.51577, 13.45300]], breite: 75 },
  // Neubau der Gedächtniskirche (Eiermann 1961: Achteck, Glockenturm, Kapelle, Foyer): Betonwaben mit blauem Glas, von außen dunkel blaugrau (Nr. 87)
  { name: 'Gedächtniskirche Neubau', typ: 'glasmodern', variant: '', vg: { glas: 'glasBlau', rahmen: 'rahmenDunkel' }, ton: 29, pfad: [[52.50483, 13.33505]], breite: 60, hmin: 4, hmax: 60 }];

let _daten = null, _kieze = null;
// Ortsteile aus daten/berlin_kieze.json (einmal geladen): Ringe in Grad, Kasten zum Vorfiltern
export function kiezeSetzen(d) {
  _daten = d; _kieze = [];
  for (const e of d?.kieze || []) {
    const ringe = e.r.map(r => { const o = []; for (let i = 0; i + 1 < r.length; i += 2) o.push([d.lat0 + r[i] * 1e-5, d.lon0 + r[i + 1] * 1e-5]); return o; });
    let a = 90, b = -90, c = 180, f = -180; for (const r of ringe) for (const [la, lo] of r) { if (la < a) a = la; if (la > b) b = la; if (lo < c) c = lo; if (lo > f) f = lo; }
    _kieze.push({ n: e.n, b: e.b, ringe, box: [a, b, c, f], p: P[ORTSTEIL[e.n] || 'vorstadt'], pn: ORTSTEIL[e.n] || 'vorstadt' });
  }
}
export const kiezeDa = () => !!_kieze?.length;
const innen = (r, la, lo) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const A = r[i], B = r[j]; if ((A[0] > la) !== (B[0] > la) && lo < (B[1] - A[1]) * (la - A[0]) / (B[0] - A[0]) + A[1]) c = !c; } return c; };
// Ortsteil an einer Stelle (oder null außerhalb Berlins)
export function kiezBei(la, lo) {
  if (!_kieze) return null;
  for (const k of _kieze) { const q = k.box; if (la < q[0] || la > q[1] || lo < q[2] || lo > q[3]) continue; if (k.ringe.some(r => innen(r, la, lo))) return k; }
  return null;
}
function zoneBei(la, lo) {
  const kl = Math.cos(la * Math.PI / 180) * 111320;
  for (const z of ZONEN) for (let i = Math.min(1, z.pfad.length - 1); i < z.pfad.length; i++) {   // ein Punkt: Kreis mit Radius breite
    const [a0, o0] = z.pfad[Math.max(0, i - 1)], [a1, o1] = z.pfad[i], ax = (o1 - o0) * kl, az = (a1 - a0) * 111132, px = (lo - o0) * kl, pz = (la - a0) * 111132;
    const L2 = ax * ax + az * az, t = L2 > 0 ? Math.max(0, Math.min(1, (px * ax + pz * az) / L2)) : 0, d = Math.hypot(px - ax * t, pz - az * t);
    if (d < z.breite) return z;
  }
  return null;
}
const FERN_K = { gruenderzeit: 2, platte: 2, nachkrieg: 2, neubau: 7, efh: 7, reihenhaus: 9, betonturm: 2, wohnturm: 2, lochfassade: 2, glasturm: 1, glasmodern: 1, raster: 0, band: 4 };
// Hochhäuser über 60 m ohne Vorbild und ohne Angaben in OSM (Nr. 87): Beton, blaugraues Glas, weißes Raster und Bänder wie Steglitzer Kreisel,
// Charité oder Park Inn, nie Kupfer und kein Art déco (die bekannten Türme kommen über VORBILDER in kit/osmteile.js)
const TURM = [[4, 'betonturm', ''], [4, 'glasmodern', ''], [3, 'raster', ''], [2, 'band', 'weiss'], [1, 'glasturm', '']];
// Länge und Seitenverhältnis des kleinsten umschließenden Rechtecks über die Kantenrichtungen (lange Zeilen und Platten erkennen)
export function streckung(p) {
  let best = null;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 1) continue;
    const ux = dx / L, uz = dz / L; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, l: Math.max(u1 - u0, v1 - v0), b: Math.max(0.5, Math.min(u1 - u0, v1 - v0)) };
  }
  return best ? { laenge: best.l, lang: best.l / best.b } : { laenge: 0, lang: 1 };
}
const wahl = (R, L) => { let s = 0; for (const x of L) s += x[0]; let r = R() * s; for (const x of L) { r -= x[0]; if (r <= 0) return x; } return L[L.length - 1]; };
const STEIL = new Set(['3100', '3200', '3300', '3400', '3500', '5000', '2100']);
// Bauart eines Berliner Hauses: g { h, flaeche, nutzung, laden, dach, traufe, lang (Seitenverhältnis), laenge, la, lo }, R Zufall je Haus.
// Liefert { typ, variant, vg, ton, fern? } oder null (dann bleibt die allgemeine Wahl). fern setzt der Aufrufer über FERN aus kit/regionen.js
export function berlinTyp(g, R) {
  const x = berlinTyp0(g, R); if (x) x.fern = FERN_K[x.typ] ?? 2; return x;
}
function berlinTyp0(g, R) {
  const z = zoneBei(g.la, g.lo); if (z && g.h >= (z.hmin ?? 12) && g.h < (z.hmax ?? 45)) { R(); return { typ: z.typ, variant: z.variant, vg: z.vg, ton: z.ton }; }
  const k = kiezBei(g.la, g.lo); if (!k) return null;
  const p = k.p, r1 = R(), r2 = R(), r3 = R(), r4 = R();   // feste Zahl an Zufallsaufrufen, damit Nachbarn gleich bleiben
  if (g.nutzung === 'industrie') return null;
  if (g.h > 60) { const x = wahl(() => r1, TURM); return { typ: x[1], variant: x[2], vg: null, ton: null }; }
  const putz = p.putz[Math.floor(r2 * p.putz.length)], vgPutz = { putz: 'fa' + putz, wand: 'fa' + putz };   // Gründerzeit und Nachkrieg lesen putz, Neubau und Betonturm wand
  // Mit Kataster (Innenstadt im S-Bahn Ring): Altbau an steilem Dach und Traufe erkennen. Ohne Kataster (Umrisse der Karte draußen): nur Höhe und Grundriss
  const dachBekannt = g.dach != null && g.dach !== '', lang = g.lang > 3 && g.laenge > 45;
  const altbauForm = dachBekannt ? STEIL.has(String(g.dach)) && g.traufe >= 11 && g.traufe <= 25 && !(g.lang > 4 && g.laenge > 70) : g.h >= 12 && g.h <= 24 && !lang && g.flaeche < 1500;
  const altAnteil = dachBekannt ? p.alt : p.alt * 0.7;
  if (g.h > 28) { const x = wahl(() => r1, p.hoch); return { typ: x[1], variant: x[2], vg: x[1] === 'platte' ? null : vgPutz, ton: x[1] === 'platte' ? null : putz }; }
  if (altbauForm && r3 < altAnteil && g.h >= 9) {
    const st = wahl(() => r1, [[p.stuck[0], 'reich'], [p.stuck[1], ''], [p.stuck[2], 'schlicht']])[1];
    const gr = r4 < p.graffiti ? 'graffiti' : '';
    return { typ: 'gruenderzeit', variant: [st, gr].filter(Boolean).join(' '), vg: vgPutz, ton: putz };
  }
  const laden = g.nutzung === 'handel';   // kleine Läden und Bürohäuser: nachkriegszeitlich oder modern, nie Fachwerk (große Märkte und Hallen wählt die allgemeine Palette)
  if (laden && g.h < 13 && g.flaeche > 500) return null;
  if (g.h < 9.5 && g.flaeche < 400) { const x = wahl(() => r1, laden ? LADEN : p.klein); return { typ: x[1], variant: x[2], vg: x[1] === 'efh' || x[1] === 'reihenhaus' ? null : vgPutz, ton: x[1] === 'nachkrieg' || x[1] === 'neubau' ? putz : null }; }
  if (g.h < 13) { const x = wahl(() => r1, laden ? LADEN : p.mittel || MITTEL); return { typ: x[1], variant: x[2], vg: x[1] === 'efh' || x[1] === 'reihenhaus' || x[1] === 'platte' || x[1] === 'band' ? null : vgPutz, ton: x[1] === 'nachkrieg' || x[1] === 'neubau' ? putz : null }; }   // 3 bis 4 Geschosse: nie Fachwerk in Berlin
  if ((!dachBekannt || String(g.dach) === '1000') && g.h >= 9 && (g.lang > 2.6 || g.flaeche > 900)) { const x = wahl(() => r1, p.zeile); return { typ: x[1], variant: x[2], vg: x[1] === 'platte' ? null : vgPutz, ton: x[1] === 'platte' ? null : putz }; }
  return null;
}
export const kiezName = (la, lo) => kiezBei(la, lo)?.n || null;
export const sonderZone = (la, lo) => zoneBei(la, lo);   // eigene Bauart an der Stelle (auch für Kirchen und Sonderbauten der Karte)
// Dachdeckung je Bezirk (Wunsch Nr. 87, 08.11.2026): die Innenstadt ist von oben überwiegend grau (Zink, Schiefer, Pappe), Villenviertel und die
// Siedlungen der Zwanziger tragen meist rote Ziegel. dachRotBei: Anteil roter Ziegel an einer Stelle (null außerhalb Berlins), klein für Einfamilien und Reihenhäuser
export function dachRotBei(la, lo, klein = false) { const k = kiezBei(la, lo); return k ? k.p.rot[klein ? 1 : 0] : null; }
// Deckung eines echten Daches aus Bauweise, Traufe und Hauskennung, ohne Zufallsfolge der Bauweise (nah, Ortsferne und Kisten wählen gleich).
// Moderne Bauweisen und hohe Häuser grau (Blech), keine roten Ziegel auf Hochhäusern. rot: Anteil roter Ziegel (Bezirk), sonst halb und halb
export function deckungWahl(typ = '', traufe = 0, seed = 1, rot = null) {
  const modern = /glas|beton|turm|raster|band|neubau|halle|hotel|markt|park|schule|kupfer/.test(typ);
  return modern || traufe > 22 ? 'dachGrau' : ((Math.imul(seed | 0, 2654435761) >>> 0) % 10000) / 10000 < (rot ?? 0.5) ? 'dachZiegel' : 'dachGrau';
}
