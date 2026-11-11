// Bauweise je Region (08_WELTBAU.md Phase 3, seit 29.10.2026): welches Land, welche Region, welche Gebäudetypen aus kit/buildings.js
// und kit/stile.js, Straßenbreiten, Gehwege, Parzellengrößen, Straßenbäume, Baumarten, Fahrseite. Läuft im Worker (keine Abhängigkeiten).
// Land aus dem Raster daten/heute/ctry_2048.bin (2048 × 1024, 16 Bit, Länge ab -169 Grad), Region aus ISO Code oder UN Unterregion.

const REGION_ISO = {
  DE: 'mitte', AT: 'mitte', CH: 'mitte', LU: 'mitte', FR: 'mitte', SI: 'mitte', LI: 'mitte', MC: 'sued',
  NL: 'nordsee', BE: 'nordsee', GB: 'nordsee', IE: 'nordsee', DK: 'nordsee',
  SE: 'skandi', NO: 'skandi', FI: 'skandi', IS: 'skandi',
  PL: 'ost', CZ: 'ost', SK: 'ost', HU: 'ost', EE: 'ost', LV: 'ost', LT: 'ost', RU: 'ost', UA: 'ost', BY: 'ost', MD: 'ost', RO: 'ost', BG: 'ost',
  RS: 'ost', BA: 'ost', MK: 'ost', XK: 'ost', KZ: 'ost', UZ: 'ost', KG: 'ost', TJ: 'ost', TM: 'ost', MN: 'ost', GE: 'ost', AM: 'ost', AZ: 'ost',
  ES: 'sued', PT: 'sued', IT: 'sued', SM: 'sued', VA: 'sued', AD: 'sued',
  GR: 'mittelmeer', CY: 'mittelmeer', MT: 'mittelmeer', HR: 'mittelmeer', ME: 'mittelmeer', AL: 'mittelmeer',
  TR: 'nahost', IQ: 'nahost', JO: 'nahost', SY: 'nahost', LB: 'nahost', IL: 'nahost', PS: 'nahost', IR: 'nahost', AF: 'nahost',
  MA: 'maghreb', DZ: 'maghreb', TN: 'maghreb', LY: 'nahost', EG: 'nahost', EH: 'maghreb', MR: 'maghreb',
  AE: 'golf', SA: 'golf', QA: 'golf', KW: 'golf', BH: 'golf', OM: 'golf', YE: 'golf',
  JP: 'japan', CN: 'china', TW: 'china', HK: 'china', MO: 'china', KR: 'korea', KP: 'korea',
  IN: 'indien', PK: 'indien', BD: 'indien', NP: 'indien', LK: 'indien', BT: 'indien',
  TH: 'suedostasien', VN: 'suedostasien', MY: 'suedostasien', SG: 'suedostasien', ID: 'suedostasien', PH: 'suedostasien', KH: 'suedostasien', LA: 'suedostasien', MM: 'suedostasien', BN: 'suedostasien', TL: 'suedostasien',
  US: 'usa', CA: 'usa', AU: 'usa', NZ: 'usa',
};
const REGION_SUB = {
  'Western Europe': 'mitte', 'Northern Europe': 'nordsee', 'Eastern Europe': 'ost', 'Southern Europe': 'sued', 'Central Asia': 'ost',
  'Northern Africa': 'maghreb', 'Western Asia': 'nahost', 'Southern Asia': 'indien', 'Eastern Asia': 'china', 'South-Eastern Asia': 'suedostasien',
  'Northern America': 'usa', 'Australia and New Zealand': 'usa', 'Central America': 'latam', 'South America': 'latam', 'Caribbean': 'latam',
  'Western Africa': 'afrika', 'Middle Africa': 'afrika', 'Eastern Africa': 'afrika', 'Southern Africa': 'afrika',
  'Melanesia': 'suedostasien', 'Micronesia': 'suedostasien', 'Polynesia': 'suedostasien', 'Antarctica': 'skandi',
};
// Linksverkehr (Stand 2026)
const LINKS = new Set('GB IE MT CY JP IN PK BD NP BT LK TH MY SG ID TL BN AU NZ PG FJ SB TO WS KI TV NR ZA NA BW ZW ZM MW MZ TZ KE UG SZ LS MU SC JM TT BB BS GY SR HK MO KN LC VC AG DM GD VG AI MS KY TC BM FK'.split(' '));

// Kennzahlen je Region: Straßenfaktor, Breite der Nebenstraßen, Gehweg mindestens, Parzelle (m²), kleinste Parzellenbreite, Straßenbäume (Anteil),
// Baumarten (esche, eiche, espe, kiefer), Höhe ohne Angabe, Tempo innerorts, Parkstreifen
const KENN = {
  mitte:        { f: 1.00, neben: 7.0, gehweg: 2.2, parzelle: 420, minB: 7, baeume: 0.75, arten: [4, 3, 2, 1], hoehe: 12, tempo: 50, nebenTempo: 30, parken: true },
  nordsee:      { f: 0.95, neben: 6.5, gehweg: 2.0, parzelle: 260, minB: 5.5, baeume: 0.55, arten: [3, 4, 2, 1], hoehe: 9, tempo: 48, nebenTempo: 32, parken: true },
  skandi:       { f: 1.00, neben: 7.0, gehweg: 2.0, parzelle: 380, minB: 7, baeume: 0.5, arten: [2, 1, 4, 4], hoehe: 8, tempo: 50, nebenTempo: 30, parken: true },
  ost:          { f: 1.10, neben: 7.5, gehweg: 2.5, parzelle: 900, minB: 9, baeume: 0.6, arten: [3, 2, 4, 2], hoehe: 12, tempo: 60, nebenTempo: 40, parken: true },
  sued:         { f: 0.90, neben: 6.0, gehweg: 1.8, parzelle: 380, minB: 6.5, baeume: 0.5, arten: [3, 2, 3, 3], hoehe: 12, tempo: 50, nebenTempo: 30, parken: true },
  mittelmeer:   { f: 0.75, neben: 5.0, gehweg: 1.2, parzelle: 160, minB: 5, baeume: 0.3, arten: [1, 2, 3, 4], hoehe: 7, tempo: 50, nebenTempo: 30, parken: false },
  maghreb:      { f: 0.80, neben: 4.5, gehweg: 1.0, parzelle: 220, minB: 5, baeume: 0.2, arten: [1, 1, 4, 3], hoehe: 8, tempo: 50, nebenTempo: 30, parken: false },
  golf:         { f: 1.25, neben: 8.0, gehweg: 2.0, parzelle: 650, minB: 9, baeume: 0.25, arten: [1, 1, 4, 2], hoehe: 8, tempo: 60, nebenTempo: 40, parken: true },
  nahost:       { f: 0.95, neben: 6.0, gehweg: 1.5, parzelle: 300, minB: 7, baeume: 0.3, arten: [2, 1, 3, 3], hoehe: 13, tempo: 50, nebenTempo: 30, parken: true },
  japan:        { f: 0.75, neben: 5.0, gehweg: 0.9, parzelle: 140, minB: 4.5, baeume: 0.25, arten: [2, 3, 3, 2], hoehe: 7, tempo: 40, nebenTempo: 30, parken: false },
  china:        { f: 1.15, neben: 7.0, gehweg: 2.5, parzelle: 1400, minB: 10, baeume: 0.6, arten: [3, 3, 3, 1], hoehe: 15, tempo: 50, nebenTempo: 30, parken: false },
  korea:        { f: 1.00, neben: 6.0, gehweg: 2.0, parzelle: 900, minB: 8, baeume: 0.5, arten: [3, 3, 3, 2], hoehe: 12, tempo: 50, nebenTempo: 30, parken: false },
  indien:       { f: 0.90, neben: 5.5, gehweg: 1.0, parzelle: 220, minB: 5, baeume: 0.35, arten: [2, 4, 3, 0], hoehe: 9, tempo: 40, nebenTempo: 25, parken: false },
  suedostasien: { f: 0.90, neben: 6.0, gehweg: 1.2, parzelle: 260, minB: 4.5, baeume: 0.5, arten: [2, 4, 3, 0], hoehe: 9, tempo: 50, nebenTempo: 30, parken: false },
  usa:          { f: 1.30, neben: 9.5, gehweg: 1.8, parzelle: 520, minB: 8, baeume: 0.6, arten: [3, 4, 2, 2], hoehe: 7, tempo: 56, nebenTempo: 40, parken: true },
  latam:        { f: 1.00, neben: 7.0, gehweg: 1.6, parzelle: 300, minB: 6, baeume: 0.45, arten: [3, 4, 3, 1], hoehe: 7, tempo: 50, nebenTempo: 30, parken: true },
  afrika:       { f: 0.95, neben: 6.0, gehweg: 0.8, parzelle: 260, minB: 6, baeume: 0.35, arten: [2, 4, 3, 1], hoehe: 5, tempo: 50, nebenTempo: 30, parken: false },
};

// Land aus dem Raster: { iso2, sub, de, region, links }. raster: Uint16Array (2048 × 1024), laender: Map id -> Land aus countries.json
export function landAn(lat, lon, raster, laender, W = 2048, H = 1024, lon0 = -169) {
  const x0 = Math.floor((((lon - lon0) % 360) + 360) % 360 / 360 * W), y0 = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H)));
  let id = raster[y0 * W + x0];
  for (let r = 1; !id && r <= 4; r++) {   // Küstenstädte liegen oft in einer Meereszelle (19,6 km): nächste Landzelle
    for (let dy = -r; dy <= r && !id; dy++) for (let dx = -r; dx <= r && !id; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const y = y0 + dy, x = (x0 + dx + W) % W; if (y < 0 || y >= H) continue;
      id = raster[y * W + x];
    }
  }
  const c = laender.get(id);
  return c ? { iso2: c.iso2, sub: c.sub, de: c.de, en: c.en, id } : { iso2: null, sub: null, de: null, en: null, id: 0 };
}

export function region(land, lat = 0) {
  let key = REGION_ISO[land.iso2] || REGION_SUB[land.sub] || 'mitte';
  if (land.iso2 === 'FR' && lat < 44.5) key = 'sued';      // Südfrankreich: Mittelmeer Bauweise
  if (land.iso2 === 'BR' || land.iso2 === 'MX') key = 'latam';
  return { key, iso2: land.iso2, links: LINKS.has(land.iso2), ...KENN[key] };
}

// ---------- Höhe ohne Angabe (05.11.2026) ----------
// OpenMapTiles liefert ohne Angabe pauschal 5 m. Mitten in Paris oder Rio standen darum Einfamilienhäuser. Jetzt zählt die Dichte: Grundfläche im Umkreis von rund 75 m im Verhältnis zur Fläche (Raster an der Welt, gleich in jedem Ort).
export const hoeheUnbekannt = (rh, m) => !(rh > 0) || (Math.abs(rh - 5) < 0.01 && !(m > 0));
export class DichteRaster {
  constructor(ox = 0, oz = 0, z = 50) { this.ox = ox; this.oz = oz; this.z = z; this.g = new Map(); }
  add(x, z, a) { const k = Math.floor((x + this.ox) / this.z) * 100003 + Math.floor((z + this.oz) / this.z); this.g.set(k, (this.g.get(k) || 0) + a); }
  bei(x, z) { const a = Math.floor((x + this.ox) / this.z), b = Math.floor((z + this.oz) / this.z); let s = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) s += this.g.get((a + i) * 100003 + (b + j)) || 0; return s / (9 * this.z * this.z); }
}
const STADT_HOCH = { latam: 1.7, china: 1.5, korea: 1.4, suedostasien: 1.25, indien: 1.2, nahost: 1.15, golf: 1.1, ost: 1.15, japan: 1.1 };
// Höchste geschätzte Höhe nach der Größe des Ortes (Schicht place der Karte): ein Dorf hat keine fünfstöckigen Klötze. Rückgabe Meter
export function ortsDeckel(places) { let stadt = false, kleinstadt = false, dorf = false; for (const p of places) { const c = p.class; if (c === 'city' || c === 'suburb' || c === 'quarter' || c === 'borough') stadt = true; else if (c === 'town') kleinstadt = true; else if (c === 'village' || c === 'hamlet' || c === 'isolated_dwelling') dorf = true; } return stadt ? 999 : kleinstadt ? 15 : dorf ? 9.6 : 999; }
export function hoeheSchaetzen(dichte, reg, wert, flaeche) {
  const f = dichte < 0.1 ? 0.55 : dichte < 0.18 ? 0.72 : dichte < 0.27 ? 1 : dichte < 0.37 ? 1.45 : 2;
  let h = reg.hoehe * f * (dichte >= 0.27 ? (STADT_HOCH[reg.key] || 1) : 1) * (0.82 + 0.36 * wert);
  if (flaeche < 40) h = Math.min(h, 5); else if (flaeche < 80) h = Math.min(h, 9); else if (flaeche < 130) h = Math.min(h, 15);
  return Math.max(3.2, h);
}

// ---------- Gebäudetyp je Region ----------
// g: { h (Höhe über min), flaeche, nutzung ('wohnen'|'handel'|'industrie'|null), laden, farbe }, R: fester Zufall (Seed), reg: region()
// liefert { typ, variant, fern } (fern: Fassade der Kiste im Shader: 0 Raster, 1 Glas, 2 Loch, 3 Kupfer, 4 Band, 5 schlicht, 6 Putz warm, 7 Putz weiß, 8 Holz dunkel, 9 Ziegel)
const wahl = (R, liste) => { const s = liste.reduce((a, x) => a + x[0], 0); let r = R() * s; for (const x of liste) { r -= x[0]; if (r <= 0) return x; } return liste[liste.length - 1]; };
const eins = (R, a) => a[Math.floor(R() * a.length) % a.length];
const FERN = { glasturm: 1, raster: 0, kupfer: 3, band: 4, lochfassade: 2, altbau: 2, ziegel: 9, wohnturm: 2, riad: 6, golf: 6, machiya: 8, tokio: 4, vorstadt: 7, brownstone: 9, kykladen: 7, skandi: 8, kolonial: 6, haveli: 6, sahel: 6, china: 2, platte: 2,
  haussmann: 2, palazzo: 6, gruenderzeit: 2, neubau: 7, nachkrieg: 2, efh: 7, fachwerk: 6, reihenhaus: 9, halle: 5, markt: 4, parkhaus: 4, tankstelle: 5, halleGlas: 5, kirche: 2, kirchturm: 2, moschee: 7, tempel: 8, schule: 4, museum: 2, hotel: 2, artdeco: 9, glasmodern: 1, betonturm: 2, shophouse: 6, favela: 9 };

function turm(R) { return wahl(R, [[4, 'glasturm', R() < 0.4 ? 'kante' : ''], [6, 'glasmodern', ''], [3, 'raster', R() < 0.3 ? 'kupfer' : ''], [1.5, 'kupfer', ''], [2.5, 'artdeco', ''], [1.5, 'betonturm', '']]); }
function hochGewerbe(R) { return wahl(R, [[3, 'lochfassade', eins(R, ['', 'grau', 'stein'])], [3, 'band', eins(R, ['weiss', 'grau'])], [2, 'raster', ''], [3, 'glasmodern', ''], [1.5, 'betonturm', ''], [1, 'hotel', '']]); }
// Niedrige Gewerbebauten: Hallen, Märkte, Bürohäuser
function gewerbeFlach(g, R) { return g.h < 16 ? (g.flaeche > 900 ? wahl(R, [[5, 'halle', ''], [1, 'band', 'grau']]) : wahl(R, [[4, 'halle', ''], [2, 'band', 'grau'], [1, 'ziegel', '']])) : wahl(R, [[3, 'band', 'grau'], [1, 'betonturm', '']]); }
// Kleine, niedrige Bauten im dichten Kern einer Großstadt (Kioske, Pavillons, Eingänge, Ladenzeilen): modern statt Einfamilien oder Fachwerkhaus (07.11.2026)
function kleinZentrum(g, R) { return wahl(R, [[3, 'band', 'weiss'], [2, 'halleGlas', ''], [2, 'lochfassade', 'grau'], [1, 'neubau', '']]); }
function handelFlach(g, R) { return g.h < 9 && g.flaeche > 500 ? wahl(R, [[4, 'markt', ''], [1, 'parkhaus', '']]) : null; }

const PALETTE = {
  // Frankreich: in der Stadt das Pariser Stadthaus, sonst wie Mitteleuropa
  frankreich(g, R) {
    if (g.h > 60) return turm(R);
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    if (g.h > 34) return g.nutzung === 'wohnen' ? wahl(R, [[3, 'wohnturm', ''], [2, 'betonturm', ''], [2, 'neubau', '']]) : hochGewerbe(R);
    const hf = g.nutzung === 'handel' ? handelFlach(g, R) : null; if (hf) return hf;
    if (g.zentrum && g.h < 13 && !g.laden && g.flaeche <= 400) return kleinZentrum(g, R);
    if (g.h < 9 && !g.laden) return g.flaeche > 400 ? wahl(R, [[3, 'halle', ''], [2, 'band', 'weiss']]) : wahl(R, [[7, 'efh', ''], [1, 'nachkrieg', '']]);
    if (g.h < 13 && !g.laden && g.flaeche < 170) return wahl(R, [[3, 'efh', ''], [3, 'gruenderzeit', '']]);
    return wahl(R, [[10, 'haussmann', ''], [1.2, 'gruenderzeit', ''], [1, 'neubau', ''], [1, 'nachkrieg', ''], [0.6, 'lochfassade', 'stein']]);
  },
  mitte(g, R) {
    if (g.h > 60) return turm(R);
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    if (g.h > 28) return g.nutzung === 'wohnen' ? wahl(R, [[3, 'wohnturm', ''], [2, 'lochfassade', 'grau'], [2, 'betonturm', ''], [2, 'neubau', '']]) : hochGewerbe(R);
    const hf = g.nutzung === 'handel' ? handelFlach(g, R) : null; if (hf) return hf;
    if (g.nutzung === 'handel' && g.h > 9) return wahl(R, [[3, 'band', 'weiss'], [2, 'lochfassade', eins(R, ['', 'stein'])], [1, 'altbau', ''], [2, 'neubau', ''], [2, 'gruenderzeit', '']]);
    if (g.zentrum && g.h < 13 && !g.laden && g.flaeche <= 400) return kleinZentrum(g, R);
    if (g.flaeche > 1200 && g.h >= 9) return wahl(R, [[3, 'neubau', ''], [3, 'nachkrieg', ''], [2, 'band', eins(R, ['weiss', 'grau'])], [2, 'lochfassade', 'grau']]);   // großer Baukörper in einem Stück (Plattenbau, Bürohaus): keine Gründerzeit oder Altbaufassade über 100 m (Nr. 77)
    if (g.h < 9 && !g.laden) return g.flaeche > 400 ? wahl(R, [[3, 'halle', ''], [2, 'band', 'weiss']]) : wahl(R, [[7, 'efh', ''], [1.2, 'fachwerk', ''], [1, 'nachkrieg', '']]);
    if (g.h < 13 && !g.laden && g.flaeche < 170) return wahl(R, [[3, 'efh', ''], [2, 'fachwerk', ''], [3, 'gruenderzeit', '']]);
    return wahl(R, [[5, 'gruenderzeit', ''], [3, 'altbau', ''], [3, 'neubau', ''], [3, 'nachkrieg', ''], [1.5, 'ziegel', ''], [1, 'lochfassade', 'stein']]);
  },
  nordsee(g, R) {
    if (g.h > 60) return turm(R);
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    if (g.h > 26) return wahl(R, [[3, 'lochfassade', 'ziegel'], [2, 'band', 'grau'], [1, 'raster', ''], [2, 'glasmodern', ''], [2, 'neubau', '']]);
    const hf = g.nutzung === 'handel' ? handelFlach(g, R) : null; if (hf) return hf;
    if (g.h < 11 && !g.laden) return wahl(R, [[7, 'reihenhaus', ''], [2, 'efh', ''], [1, 'ziegel', '']]);
    return wahl(R, [[4, 'ziegel', ''], [2, 'gruenderzeit', ''], [2, 'altbau', ''], [2, 'neubau', ''], [1, 'lochfassade', 'ziegel'], [1, 'nachkrieg', '']]);
  },
  skandi(g, R) {
    if (g.h > 50) return turm(R);
    if (g.h < 10 && g.nutzung !== 'handel') return [1, 'skandi', eins(R, ['rot schwarz', 'ocker giebel ziegel', 'weiss', 'gelb giebel', 'blau', 'gruen schwarz', 'grau giebel'])];
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    return wahl(R, [[3, 'altbau', ''], [3, 'gruenderzeit', ''], [3, 'neubau', ''], [2, 'ziegel', ''], [2, 'lochfassade', eins(R, ['stein', 'grau'])]]);
  },
  ost(g, R) {
    if (g.h > 75) return turm(R);
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    if (g.h >= 12 && g.nutzung !== 'handel' && g.flaeche > 300) return wahl(R, [[5, 'platte', eins(R, ['', 'platten'])], [2, 'altbau', ''], [2, 'nachkrieg', ''], [1, 'betonturm', ''], [1, 'lochfassade', 'grau']]);
    if (g.zentrum && g.h < 13 && !g.laden && g.flaeche <= 400) return kleinZentrum(g, R);
    if (g.h < 9 && !g.laden) return wahl(R, [[5, 'efh', ''], [2, 'nachkrieg', '']]);
    return wahl(R, [[4, 'altbau', ''], [3, 'gruenderzeit', ''], [3, 'nachkrieg', ''], [2, 'ziegel', ''], [1, 'band', 'grau']]);
  },
  sued(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 8 && g.nutzung !== 'handel') return wahl(R, [[4, 'efh', 'sued'], [3, 'kykladen', ''], [2, 'kolonial', eins(R, ['mais flach', 'koralle flach', 'weiss flach'])]]);
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    return wahl(R, [[8, 'palazzo', ''], [2, 'altbau', ''], [2, 'gruenderzeit', ''], [2, 'neubau', ''], [1, 'lochfassade', 'stein'], [0.6, 'band', 'weiss']]);
  },
  mittelmeer(g, R) {
    if (g.h > 50) return turm(R);
    if (g.h < 10) return wahl(R, [[6, 'kykladen', R() < 0.08 ? 'gewoelbe' : ''], [1, 'kykladen', 'gruen'], [2, 'efh', 'sued']]);
    return wahl(R, [[4, 'palazzo', ''], [2, 'lochfassade', eins(R, ['', 'stein'])], [2, 'altbau', ''], [2, 'neubau', ''], [0.6, 'band', 'weiss'], [2, 'nachkrieg', '']]);
  },
  maghreb(g, R) {
    if (g.h > 55) return turm(R);
    if (g.h < 13) return wahl(R, [[7, 'riad', eins(R, ['terrakotta', 'ocker', 'rosa', 'ocker', 'terrakotta gruen']) + (R() < 0.03 ? ' minarett' : '') + (g.flaeche < 110 ? ' ohnehof' : '')], [1.5, 'nachkrieg', ''], [1, 'shophouse', ''], [g.flaeche < 150 ? 1 : 0, 'favela', '']]);
    return wahl(R, [[4, 'golf', 'modern ' + eins(R, ['beige', 'weiss', 'braun'])], [2, 'lochfassade', 'stein'], [2, 'nachkrieg', ''], [1, 'hotel', ''], [1, 'neubau', '']]);
  },
  golf(g, R) {
    if (g.h > 45) return turm(R);
    if (g.h < 10) return [1, 'golf', 'traditionell ' + eins(R, ['beige', 'weiss', 'braun'])];
    return wahl(R, [[5, 'golf', 'modern ' + eins(R, ['beige', 'weiss', 'beton', 'braun']) + (g.laden ? ' schild' : '') + (g.nutzung === 'wohnen' ? ' wohnen' : '')], [2, 'raster', '']]);
  },
  nahost(g, R) {
    if (g.h > 55) return turm(R);
    if (g.h < 9) return wahl(R, [[3, 'golf', 'traditionell ' + eins(R, ['beige', 'weiss'])], [2, 'riad', eins(R, ['ocker', 'rosa'])], [3, 'favela', ''], [2, 'shophouse', '']]);
    return wahl(R, [[4, 'golf', 'modern ' + eins(R, ['beige', 'beton', 'weiss'])], [3, 'lochfassade', 'stein'], [3, 'nachkrieg', ''], [3, 'ziegel', ''], [2, 'shophouse', ''], [1.5, 'gruenderzeit', '']]);
  },
  japan(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 9 && g.nutzung !== 'handel' && !g.laden) return [1, 'machiya', eins(R, ['', 'rot', 'walm', '', 'walm rot'])];
    return [1, 'tokio', eins(R, ['beige', 'weiss', 'braun', 'beton']) + (g.nutzung === 'wohnen' && !g.laden ? ' wohnen' : '') + (g.laden || R() < 0.4 ? ' schild' : '')];
  },
  china(g, R) {
    if (g.h > 90) return turm(R);
    if (g.h > 28 && g.nutzung !== 'handel') return [1, 'china', eins(R, ['', 'beige'])];
    if (g.h > 28) return hochGewerbe(R);
    return wahl(R, [[3, 'tokio', eins(R, ['beige', 'beton', 'braun', 'weiss']) + (g.laden ? ' schild' : '')], [2, 'band', 'grau']]);
  },
  korea(g, R) {
    if (g.h > 80) return turm(R);
    if (g.h > 25 && g.nutzung !== 'handel') return [1, 'china', eins(R, ['', 'beige'])];
    return [1, 'tokio', eins(R, ['beige', 'weiss', 'beton']) + (g.laden ? ' schild' : '')];
  },
  indien(g, R) {
    if (g.h > 55) return turm(R);
    if (g.h < 20) return wahl(R, [[5, 'haveli', eins(R, ['stadt pink', 'stadt', 'rot', 'stadt gelb', 'stadt blau'])], [2.5, 'nachkrieg', ''], [2.5, 'shophouse', ''], [g.flaeche < 150 ? 2 : 0.5, 'favela', '']]);
    return wahl(R, [[3, 'band', eins(R, ['weiss', 'grau'])], [2, 'lochfassade', '']]);
  },
  suedostasien(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 8 && g.nutzung === 'wohnen') return [1, 'kolonial', eins(R, ['tuerkis flach', 'mais flach', 'koralle flach', 'weiss flach'])];
    if (g.h < 20) return wahl(R, [[6, 'shophouse', ''], [3, 'tokio', eins(R, ['beige', 'weiss', 'beton']) + (g.laden || R() < 0.5 ? ' schild' : '')], [1, 'favela', '']]);
    if (g.h < 28) return [1, 'tokio', eins(R, ['beige', 'weiss', 'beton']) + (g.laden || R() < 0.5 ? ' schild' : '')];
    return wahl(R, [[3, 'china', ''], [2, 'band', 'weiss'], [2, 'hotel', ''], [2, 'betonturm', '']]);
  },
  usa(g, R) {
    if (g.h > 55) return turm(R);
    if (g.nutzung === 'industrie') return gewerbeFlach(g, R);
    { const hf = g.nutzung === 'handel' ? handelFlach(g, R) : null; if (hf) return hf; }
    if (g.h < 9 && g.nutzung !== 'handel' && !g.laden) return [1, 'vorstadt', eins(R, ['blau', 'weiss', 'gelb ohnegarage', 'grau', 'rot', 'gruen ohnegarage', 'weiss schwarz'])];
    if (g.h < 22 && g.nutzung !== 'handel' && !g.laden) return wahl(R, [[4, 'brownstone', ''], [2, 'ziegel', ''], [2, 'neubau', '']]);
    if (g.h < 12) return wahl(R, [[3, 'band', 'weiss'], [2, 'markt', ''], [1, 'ziegel', '']]);
    if (R() < 0.35) return wahl(R, [[1, 'artdeco', ''], [1, 'neubau', '']]);
    return hochGewerbe(R);
  },
  latam(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 9) return wahl(R, [[5, 'kolonial', eins(R, ['mais sockelblau', 'tuerkis flach', 'koralle', 'kobalt flach', 'flieder', 'limette flach', 'pink', 'weiss'])], [g.flaeche < 140 ? 4 : 0.5, 'favela', '']]);
    if (g.h > 24 && g.nutzung !== 'handel') return wahl(R, [[4, 'wohnturm', ''], [2, 'lochfassade', ''], [2, 'betonturm', '']]);
    return wahl(R, [[3, 'band', 'weiss'], [2, 'kolonial', eins(R, ['mais', 'koralle', 'weiss'])], [1, 'lochfassade', 'stein']]);
  },
  afrika(g, R) {
    if (g.h > 50) return turm(R);
    if (g.h < 7) return wahl(R, [[3, 'sahel', eins(R, ['', 'beige'])], [2, 'kolonial', eins(R, ['weiss flach', 'mais flach', 'koralle flach'])], [2, 'favela', '']]);
    return wahl(R, [[3, 'band', eins(R, ['weiss', 'grau'])], [2, 'lochfassade', ''], [2, 'nachkrieg', ''], [1, 'favela', '']]);
  },
};
// Sonderbauten aus den Punkten der Karte (POI im Grundriss): Gotteshaus je Region, Schule, Krankenhaus, Hotel, Museum, Bahnhof, Markt, Tankstelle, Parkhaus
const ISLAM = new Set(['maghreb', 'nahost', 'golf']), OSTASIEN = new Set(['japan', 'china', 'korea', 'suedostasien']);
function sonderbau(g, R, reg) {
  const a = g.art, A = g.flaeche;
  if (a === 'turm') return [1, 'kirchturm', ''];
  if (a === 'gotteshaus') { if (A < 70) return null; if (ISLAM.has(reg.key) || (reg.key === 'indien' && R() < 0.3) || (reg.key === 'afrika' && R() < 0.4)) return [1, 'moschee', '']; if (OSTASIEN.has(reg.key)) return [1, 'tempel', '']; return [1, 'kirche', reg.key === 'nordsee' || reg.key === 'ost' ? (R() < 0.5 ? 'ziegel' : '') : reg.key === 'latam' || reg.key === 'sued' ? (R() < 0.5 ? 'putz' : '') : '']; }
  if (a === 'schule' && A > 200) return [1, 'schule', ''];
  if (a === 'krankenhaus' && A > 300) return [1, 'schule', 'krankenhaus'];
  if (a === 'hotel' && g.h > 12) return [1, 'hotel', ''];
  if (a === 'museum' && A > 300 && g.h < 45) return [1, 'museum', ''];
  if (a === 'bahnhof' && A > 500) return [1, 'halleGlas', ''];
  if (a === 'markt' && A > 250 && g.h < 14) return [1, 'markt', ''];
  if (a === 'tankstelle' && A < 600 && g.h < 9) return [1, 'tankstelle', ''];
  if (a === 'parkhaus' && g.h > 6) return [1, 'parkhaus', ''];
  return null;
}
// Wandfarbe der Fernsicht passend zum Nahmodell (aTyp = Fassade + 100 mal (Ton + 1), Liste in kit/city.js FS_TOENE): sonst wechselte ein Haus beim Herankommen die Farbe.
// Der erste Zufallswert eines Typs wählt seine Wand aus (kit/bauwerke.js), darum genügt hier der erste Wert des Generators.
const TON_REIHE = { haussmann: [0, 23, 13, 0], palazzo: [11, 6, 2, 8], gruenderzeit: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], neubau: [12, 13, 14, 15, 7, 3, 1, 18], nachkrieg: [0, 1, 4, 5, 8, 10, 25, 18], efh: [12, 0, 1, 4, 7, 18, 15, 27], fachwerk: [0, 12, 8, 1], reihenhaus: [16, 17, 15, 16], halle: [28, 29, 30, 31, 14], markt: [12, 14, 31, 7], kirche: [22, 20, 21, 16, 12], moschee: [12, 20, 21, 8], museum: [22, 21, 20, 12], hotel: [12, 13, 8, 14], artdeco: [20, 21, 15, 0, 16], betonturm: [19, 19, 14, 25], shophouse: [2, 3, 6, 8, 10, 12, 11], schule: [16, 7, 1, 13, 15], altbau: [23, 24, 25] };
// Kennung eines Hauses aus seiner Lage: die Merkmale der Kacheln tragen oft dieselbe Nummer (Mallorca: 637 Häuser, 72 Nummern), dann sahen ganze Viertel gleich aus. Ort und Kisten rechnen sie gleich, damit ein Haus beim Herankommen seine Farbe behält
export const hausKennung = (lat, lon) => ((Math.imul(Math.round(lat * 9000), 73856093) ^ Math.imul(Math.round(lon * 9000), 19349663)) >>> 0) || 1;
export function fernTon(typ, ersterWert) { const r = TON_REIHE[typ]; return r ? r[Math.min(r.length - 1, Math.floor(ersterWert * r.length))] : -1; }
export function gebaeudeTyp(g, R, reg) {
  // Kirchturm und alte Türme: in der Karte oft ein eigener schmaler Umriss ohne Punkt (vorher wurde daraus ein Bürohaus mit Fensterbändern direkt an der Kirche). Über 90 m ist so ein Umriss fast immer ein Teil eines Hochhauses: in Manhattan standen 227 Hochhausteile als gestreifte Kirchtürme ohne Stockwerke
  // Im Stadtkern und bei Gebäudeteilen (Umriss mit Mindesthöhe) ist so ein Umriss ein Hochhausteil: am Potsdamer Platz standen Kollhoff Tower, Bahntower
  // und 18 weitere Teile als grüne Turmspitzen mit Kreuz (07.11.2026, Nr. 77). Echte Kirchtürme dort kommen über das Gotteshaus daneben (art 'turm')
  const schlank = !g.zentrum && !g.teil && g.h > 28 && g.h < 90 && g.flaeche > 12 && g.flaeche < 240 && g.h / Math.sqrt(g.flaeche) > 3.4 && !OSTASIEN.has(reg.key);
  const x = (g.art && sonderbau(g, R, reg)) || (schlank ? [1, 'kirchturm', ''] : null) || ((reg.iso2 === 'FR' || reg.iso2 === 'MC' || reg.iso2 === 'LU') && reg.key !== 'sued' ? PALETTE.frankreich : PALETTE[reg.key] || PALETTE.mitte)(g, R), typ = x[1];
  return { typ, variant: x[2] || undefined, fern: FERN[typ] ?? 2 };
}

// Häuser des Lückenfüllers (Orte ohne kartierte Häuser, Wunsch Nr. 36, 02.11.2026): Etagen und Typen je Region, damit eine ganze Stadt nicht
// aus einem Haustyp besteht (Zefta war nur Riads mit 1 bis 3 Etagen). In Ägypten und dem Maghreb dominieren mehrstöckige Wohnblöcke aus
// Backstein und Beton, dazwischen verputzte Häuser. Liefert { h, typ, variant, fern }
const FUELL = {
  maghreb: { e: [2, 6], t: (R, n) => wahl(R, [[4, 'ziegel', ''], [n <= 4 ? 3 : 0, 'riad', eins(R, ['ocker', 'terrakotta', 'rosa', 'ocker']) + ' ohnehof'], [3, 'golf', 'modern ' + eins(R, ['beige', 'weiss', 'braun', 'beton']) + ' wohnen'], [1, 'lochfassade', 'stein']]) },
  nahost: { e: [2, 6], t: (R) => wahl(R, [[4, 'golf', 'modern ' + eins(R, ['beige', 'beton', 'weiss']) + ' wohnen'], [2, 'lochfassade', 'stein'], [1, 'ziegel', '']]) },
  golf: { e: [1, 4], t: (R, n) => n <= 2 ? [1, 'golf', 'traditionell ' + eins(R, ['beige', 'weiss', 'braun'])] : [1, 'golf', 'modern ' + eins(R, ['beige', 'weiss', 'beton', 'braun']) + ' wohnen'] },
  indien: { e: [2, 5], t: (R) => wahl(R, [[4, 'haveli', eins(R, ['stadt pink', 'stadt', 'stadt gelb', 'stadt blau', 'rot'])], [2, 'ziegel', ''], [1, 'lochfassade', '']]) },
  afrika: { e: [1, 3], t: (R, n) => n <= 1 ? wahl(R, [[3, 'sahel', eins(R, ['', 'beige'])], [2, 'kolonial', eins(R, ['weiss flach', 'mais flach', 'koralle flach'])], [1, 'ziegel', '']]) : wahl(R, [[2, 'ziegel', ''], [2, 'kolonial', eins(R, ['mais', 'koralle', 'weiss'])], [1, 'band', 'weiss']]) },
};
export function fuellTyp(reg, R, flaeche = 120) {
  const f = FUELL[reg.key];
  if (!f) { const n = Math.max(1, Math.round(reg.hoehe / 3.1 * (0.55 + R() * 0.8))), h = n * 3.1 + 0.4, t = gebaeudeTyp({ h, flaeche, nutzung: 'wohnen', laden: false }, R, reg); return { h, ...t }; }
  const n = f.e[0] + Math.floor(Math.pow(R(), 1.4) * (f.e[1] - f.e[0] + 1)), x = f.t(R, n), typ = x[1];
  return { h: n * 3.1 + 0.4, typ, variant: x[2] || undefined, fern: FERN[typ] ?? 2 };
}

// Baumart nach Region (Gewichte esche, eiche, espe, kiefer)
const ARTEN = ['esche', 'eiche', 'espe', 'kiefer'];
// Palmen in warmen Regionen: Anteil an den Straßenbäumen
const PALMEN = { maghreb: 0.55, golf: 0.8, nahost: 0.3, suedostasien: 0.5, indien: 0.3, latam: 0.25, afrika: 0.3, mittelmeer: 0.1, sued: 0.08, usa: 0.03 };
export function baumArt(R, reg, lat = 45) { const pa = PALMEN[reg.key] || 0, warm = Math.abs(lat) < 38 ? 1 : 0.2; if (pa && R() < pa * warm) return 'palme'; const w = reg.arten; let s = w.reduce((a, b) => a + b, 0), r = R() * s; for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return ARTEN[i]; } return 'esche'; }

// Steildach einer Kiste (29.10.2026 abends, offener Punkt "Dachformen"): Sattel oder Walm über dem kleinsten umschließenden Rechteck des
// Grundrisses, Neigung je Region (Mitteleuropa 38 Grad, Nordsee 45, Mittelmeer 22), nur für kleine Wohnhäuser mit fast rechteckigem Grundriss.
// Dachflächen bekommen typ + 10 (Shader: Ziegel oder Anthrazit je Haus), Giebel die Fassade. Liefert die Traufhöhe oder null.
const NEIGUNG = { mitte: 38, nordsee: 45, skandi: 40, ost: 35, sued: 28, mittelmeer: 22, usa: 30, latam: 22, japan: 26, china: 26, korea: 26 };
export function steildach(r, y1, regKey, art, R, pos, nor, typ) {
  const grad = NEIGUNG[regKey]; if (!grad || ![2, 6, 7, 8, 9].includes(art % 100)) return null;
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
