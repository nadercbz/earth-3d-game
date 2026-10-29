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
  MA: 'maghreb', DZ: 'maghreb', TN: 'maghreb', LY: 'maghreb', EG: 'maghreb', EH: 'maghreb', MR: 'maghreb',
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
  nahost:       { f: 0.95, neben: 6.0, gehweg: 1.5, parzelle: 400, minB: 7, baeume: 0.3, arten: [2, 1, 3, 3], hoehe: 9, tempo: 50, nebenTempo: 30, parken: true },
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
  return { key, links: LINKS.has(land.iso2), ...KENN[key] };
}

// ---------- Gebäudetyp je Region ----------
// g: { h (Höhe über min), flaeche, nutzung ('wohnen'|'handel'|'industrie'|null), laden, farbe }, R: fester Zufall (Seed), reg: region()
// liefert { typ, variant, fern } (fern: Fassade der Kiste im Shader: 0 Raster, 1 Glas, 2 Loch, 3 Kupfer, 4 Band, 5 schlicht, 6 Putz warm, 7 Putz weiß, 8 Holz dunkel, 9 Ziegel)
const wahl = (R, liste) => { const s = liste.reduce((a, x) => a + x[0], 0); let r = R() * s; for (const x of liste) { r -= x[0]; if (r <= 0) return x; } return liste[liste.length - 1]; };
const eins = (R, a) => a[Math.floor(R() * a.length) % a.length];
const FERN = { glasturm: 1, raster: 0, kupfer: 3, band: 4, lochfassade: 2, altbau: 2, ziegel: 9, wohnturm: 2, riad: 6, golf: 6, machiya: 8, tokio: 4, vorstadt: 7, brownstone: 9, kykladen: 7, skandi: 8, kolonial: 6, haveli: 6, sahel: 6, china: 2, platte: 2 };

function turm(R) { return wahl(R, [[5, 'glasturm', R() < 0.4 ? 'kante' : ''], [3, 'raster', R() < 0.3 ? 'kupfer' : ''], [1.5, 'kupfer', '']]); }
function hochGewerbe(R) { return wahl(R, [[3, 'lochfassade', eins(R, ['', 'grau', 'stein'])], [3, 'band', eins(R, ['weiss', 'grau'])], [2, 'raster', '']]); }

const PALETTE = {
  mitte(g, R) {
    if (g.h > 60) return turm(R);
    if (g.nutzung === 'industrie') return [1, 'band', 'grau'];
    if (g.h > 28) return g.nutzung === 'wohnen' ? wahl(R, [[3, 'wohnturm', ''], [2, 'lochfassade', 'grau']]) : hochGewerbe(R);
    if (g.nutzung === 'handel' && g.h > 9) return wahl(R, [[3, 'band', 'weiss'], [2, 'lochfassade', eins(R, ['', 'stein'])], [1, 'altbau', '']]);
    return wahl(R, [[6, 'altbau', ''], [2, 'ziegel', ''], [1, 'lochfassade', 'stein']]);
  },
  nordsee(g, R) {
    if (g.h > 60) return turm(R);
    if (g.nutzung === 'industrie') return [1, 'band', 'grau'];
    if (g.h > 26) return wahl(R, [[3, 'lochfassade', 'ziegel'], [2, 'band', 'grau'], [1, 'raster', '']]);
    return wahl(R, [[6, 'ziegel', ''], [2, 'altbau', ''], [1, 'lochfassade', 'ziegel']]);
  },
  skandi(g, R) {
    if (g.h > 50) return turm(R);
    if (g.h < 10 && g.nutzung !== 'handel') return [1, 'skandi', eins(R, ['rot schwarz', 'ocker giebel ziegel', 'weiss', 'gelb giebel', 'blau', 'gruen schwarz', 'grau giebel'])];
    if (g.nutzung === 'industrie') return [1, 'band', 'grau'];
    return wahl(R, [[4, 'altbau', ''], [3, 'ziegel', ''], [2, 'lochfassade', eins(R, ['stein', 'grau'])]]);
  },
  ost(g, R) {
    if (g.h > 75) return turm(R);
    if (g.nutzung === 'industrie') return [1, 'band', 'grau'];
    if (g.h >= 12 && g.nutzung !== 'handel' && g.flaeche > 300) return wahl(R, [[5, 'platte', eins(R, ['', 'platten'])], [2, 'altbau', ''], [1, 'lochfassade', 'grau']]);
    return wahl(R, [[5, 'altbau', ''], [2, 'ziegel', ''], [1, 'band', 'grau']]);
  },
  sued(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 8 && g.nutzung !== 'handel') return wahl(R, [[3, 'kykladen', ''], [2, 'kolonial', eins(R, ['mais flach', 'koralle flach', 'weiss flach'])]]);
    if (g.nutzung === 'industrie') return [1, 'band', 'grau'];
    return wahl(R, [[6, 'altbau', ''], [2, 'lochfassade', 'stein'], [1, 'band', 'weiss']]);
  },
  mittelmeer(g, R) {
    if (g.h > 50) return turm(R);
    if (g.h < 10) return wahl(R, [[6, 'kykladen', R() < 0.08 ? 'gewoelbe' : ''], [1, 'kykladen', 'gruen']]);
    return wahl(R, [[3, 'lochfassade', eins(R, ['', 'stein'])], [3, 'altbau', ''], [1, 'band', 'weiss']]);
  },
  maghreb(g, R) {
    if (g.h > 55) return turm(R);
    if (g.h < 13) return [1, 'riad', eins(R, ['terrakotta', 'ocker', 'rosa', 'ocker', 'terrakotta gruen']) + (R() < 0.03 ? ' minarett' : '') + (g.flaeche < 110 ? ' ohnehof' : '')];
    return wahl(R, [[4, 'golf', 'modern ' + eins(R, ['beige', 'weiss', 'braun'])], [2, 'lochfassade', 'stein']]);
  },
  golf(g, R) {
    if (g.h > 45) return turm(R);
    if (g.h < 10) return [1, 'golf', 'traditionell ' + eins(R, ['beige', 'weiss', 'braun'])];
    return wahl(R, [[5, 'golf', 'modern ' + eins(R, ['beige', 'weiss', 'beton', 'braun']) + (g.laden ? ' schild' : '') + (g.nutzung === 'wohnen' ? ' wohnen' : '')], [2, 'raster', '']]);
  },
  nahost(g, R) {
    if (g.h > 55) return turm(R);
    if (g.h < 9) return wahl(R, [[3, 'golf', 'traditionell ' + eins(R, ['beige', 'weiss'])], [2, 'riad', eins(R, ['ocker', 'rosa'])]]);
    return wahl(R, [[4, 'golf', 'modern ' + eins(R, ['beige', 'beton', 'weiss'])], [3, 'lochfassade', 'stein']]);
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
    if (g.h < 20) return [1, 'haveli', eins(R, ['stadt pink', 'stadt', 'rot', 'stadt gelb', 'stadt blau'])];
    return wahl(R, [[3, 'band', eins(R, ['weiss', 'grau'])], [2, 'lochfassade', '']]);
  },
  suedostasien(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 8 && g.nutzung === 'wohnen') return [1, 'kolonial', eins(R, ['tuerkis flach', 'mais flach', 'koralle flach', 'weiss flach'])];
    if (g.h < 28) return [1, 'tokio', eins(R, ['beige', 'weiss', 'beton']) + (g.laden || R() < 0.5 ? ' schild' : '')];
    return wahl(R, [[3, 'china', ''], [2, 'band', 'weiss']]);
  },
  usa(g, R) {
    if (g.h > 55) return turm(R);
    if (g.nutzung === 'industrie') return [1, 'band', 'grau'];
    if (g.h < 9 && g.nutzung !== 'handel' && !g.laden) return [1, 'vorstadt', eins(R, ['blau', 'weiss', 'gelb ohnegarage', 'grau', 'rot', 'gruen ohnegarage', 'weiss schwarz'])];
    if (g.h < 22 && g.nutzung !== 'handel' && !g.laden) return [1, 'brownstone', ''];
    if (g.h < 12) return wahl(R, [[3, 'band', 'weiss'], [1, 'ziegel', '']]);
    return hochGewerbe(R);
  },
  latam(g, R) {
    if (g.h > 60) return turm(R);
    if (g.h < 9) return [1, 'kolonial', eins(R, ['mais sockelblau', 'tuerkis flach', 'koralle', 'kobalt flach', 'flieder', 'limette flach', 'pink', 'weiss'])];
    if (g.h > 24 && g.nutzung !== 'handel') return wahl(R, [[4, 'wohnturm', ''], [2, 'lochfassade', '']]);
    return wahl(R, [[3, 'band', 'weiss'], [2, 'kolonial', eins(R, ['mais', 'koralle', 'weiss'])], [1, 'lochfassade', 'stein']]);
  },
  afrika(g, R) {
    if (g.h > 50) return turm(R);
    if (g.h < 7) return wahl(R, [[3, 'sahel', eins(R, ['', 'beige'])], [2, 'kolonial', eins(R, ['weiss flach', 'mais flach', 'koralle flach'])]]);
    return wahl(R, [[3, 'band', eins(R, ['weiss', 'grau'])], [2, 'lochfassade', '']]);
  },
};
export function gebaeudeTyp(g, R, reg) {
  const x = (PALETTE[reg.key] || PALETTE.mitte)(g, R), typ = x[1];
  return { typ, variant: x[2] || undefined, fern: FERN[typ] ?? 2 };
}

// Baumart nach Region (Gewichte esche, eiche, espe, kiefer)
const ARTEN = ['esche', 'eiche', 'espe', 'kiefer'];
export function baumArt(R, reg) { const w = reg.arten; let s = w.reduce((a, b) => a + b, 0), r = R() * s; for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return ARTEN[i]; } return 'esche'; }
