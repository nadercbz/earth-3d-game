// Menschen je Land (Wunsch Nr. 49, 06.11.2026, Nader: "die echten Bevölkerungsgruppen ... Marokkaner wie Marokkaner, auch vom Kleidungsstil ... wie hell, wie dunkelhäutig ... große Diversity").
// Grundlage: daten/heute/groups.json (Volksgruppen, Religionen, Alter, Migranten und ihre Herkunft je Land: CIA World Factbook, Weltbank, Pew) und countries.json (UN Unterregion).
// Daraus zieht looksFuer() für einen Ort eine Mischung wie in der echten Bevölkerung: Hautton, Haarfarbe, Größe, Bart, Alter, Kleidung und Tracht. Gezeichnet wird mit den Higgsfield Körpern (kit/people.js), der Shader färbt um.
// Das sind Durchschnitte und Anteile, keine Aussage über einzelne Menschen: in jedem Land tragen die meisten Alltagskleidung, die Tracht ist je Land ein kleiner oder großer Anteil.
const HAUT = [[244, 216, 196], [232, 190, 160], [214, 165, 128], [190, 136, 98], [150, 100, 68], [105, 68, 45], [66, 43, 30]];
const HAAR = { schwarz: [18, 14, 12], dunkel: [44, 30, 22], braun: [84, 58, 38], hell: [130, 95, 62], blond: [186, 152, 100], rot: [128, 62, 32], grau: [150, 148, 145], weiss: [212, 210, 206] };
const srgb = c => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f(c[0]), f(c[1]), f(c[2])]; };
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const hautAus = t => { const i = Math.max(0, Math.min(5, Math.floor(t))), f = Math.max(0, Math.min(1, t - i)), a = HAUT[i], b = HAUT[i + 1]; return srgb([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); };

// Aussehen: haut [von, bis] auf der Skala oben, haar Anteile, gm und gf mittlere Größe Männer und Frauen (m), bart Anteil der Männer, auge und nase und lippen für die gezeichneten Gesichtszüge, stil für die Kleidung
const A = {
  nord: { haut: [0.2, 1.3], haar: { blond: 0.38, hell: 0.3, braun: 0.26, rot: 0.06 }, gm: 1.81, gf: 1.67, bart: 0.3, stil: 'nord' },
  west: { haut: [0.5, 1.7], haar: { blond: 0.14, hell: 0.26, braun: 0.42, dunkel: 0.14, rot: 0.04 }, gm: 1.79, gf: 1.65, bart: 0.28, stil: 'west' },
  sued: { haut: [1.2, 2.5], haar: { braun: 0.3, dunkel: 0.5, schwarz: 0.2 }, gm: 1.75, gf: 1.62, bart: 0.32, stil: 'sued' },
  ost: { haut: [0.6, 1.7], haar: { blond: 0.14, hell: 0.34, braun: 0.38, dunkel: 0.14 }, gm: 1.78, gf: 1.66, bart: 0.25, stil: 'ost' },
  balkan: { haut: [1.0, 2.2], haar: { braun: 0.36, dunkel: 0.5, schwarz: 0.14 }, gm: 1.8, gf: 1.67, bart: 0.3, stil: 'ost' },
  kaukasus: { haut: [1.4, 2.6], haar: { dunkel: 0.5, schwarz: 0.45, braun: 0.05 }, gm: 1.74, gf: 1.62, bart: 0.45, stil: 'nahost' },
  tuerkei: { haut: [1.5, 2.8], haar: { dunkel: 0.55, schwarz: 0.35, braun: 0.1 }, gm: 1.75, gf: 1.62, bart: 0.42, stil: 'nahost' },
  arabisch: { haut: [2.0, 3.4], haar: { schwarz: 0.6, dunkel: 0.38, braun: 0.02 }, gm: 1.74, gf: 1.6, bart: 0.55, stil: 'nahost' },
  golf: { haut: [2.3, 3.7], haar: { schwarz: 0.85, dunkel: 0.15 }, gm: 1.72, gf: 1.58, bart: 0.7, stil: 'golf' },
  persisch: { haut: [1.8, 3.0], haar: { schwarz: 0.55, dunkel: 0.42, braun: 0.03 }, gm: 1.74, gf: 1.6, bart: 0.45, stil: 'nahost' },
  maghreb: { haut: [1.9, 3.6], haar: { schwarz: 0.6, dunkel: 0.36, braun: 0.04 }, gm: 1.74, gf: 1.6, bart: 0.42, stil: 'maghreb' },
  amazigh: { haut: [1.7, 3.3], haar: { dunkel: 0.5, schwarz: 0.42, braun: 0.08 }, gm: 1.74, gf: 1.6, bart: 0.45, stil: 'maghreb' },
  aegypten: { haut: [2.5, 3.9], haar: { schwarz: 0.75, dunkel: 0.25 }, gm: 1.7, gf: 1.58, bart: 0.45, stil: 'nahost' },
  sudan: { haut: [4.0, 5.2], haar: { schwarz: 1 }, gm: 1.72, gf: 1.6, bart: 0.4, stil: 'horn' },
  horn: { haut: [3.8, 5.0], haar: { schwarz: 1 }, gm: 1.72, gf: 1.6, bart: 0.35, stil: 'horn' },
  westafrika: { haut: [4.5, 5.8], haar: { schwarz: 1 }, gm: 1.7, gf: 1.6, bart: 0.25, lippen: 1.3, nase: 1.25, stil: 'westafrika' },
  zentralafrika: { haut: [4.6, 5.9], haar: { schwarz: 1 }, gm: 1.68, gf: 1.57, bart: 0.25, lippen: 1.3, nase: 1.25, stil: 'westafrika' },
  ostafrika: { haut: [4.3, 5.7], haar: { schwarz: 1 }, gm: 1.69, gf: 1.58, bart: 0.25, lippen: 1.25, nase: 1.2, stil: 'ostafrika' },
  suedafrika: { haut: [4.3, 5.7], haar: { schwarz: 1 }, gm: 1.69, gf: 1.59, bart: 0.25, lippen: 1.25, nase: 1.2, stil: 'latam' },
  afroamerika: { haut: [3.9, 5.4], haar: { schwarz: 1 }, gm: 1.76, gf: 1.63, bart: 0.4, lippen: 1.25, nase: 1.2, stil: 'usa' },
  afrolatein: { haut: [3.8, 5.3], haar: { schwarz: 1 }, gm: 1.72, gf: 1.6, bart: 0.3, lippen: 1.25, nase: 1.2, stil: 'latam' },
  mestizo: { haut: [2.2, 3.5], haar: { schwarz: 0.55, dunkel: 0.42, braun: 0.03 }, gm: 1.71, gf: 1.58, bart: 0.25, stil: 'latam' },
  indigen: { haut: [2.9, 4.0], haar: { schwarz: 1 }, gm: 1.63, gf: 1.51, bart: 0.05, stil: 'anden' },
  europaeischNeu: { haut: [0.5, 1.8], haar: { blond: 0.14, hell: 0.26, braun: 0.42, dunkel: 0.14, rot: 0.04 }, gm: 1.78, gf: 1.64, bart: 0.3, stil: 'usa' },
  zentralasien: { haut: [1.6, 2.8], haar: { schwarz: 0.75, dunkel: 0.25 }, gm: 1.72, gf: 1.59, bart: 0.3, auge: 0.82, stil: 'ost' },
  suedasienN: { haut: [2.6, 3.9], haar: { schwarz: 0.9, dunkel: 0.1 }, gm: 1.67, gf: 1.54, bart: 0.42, stil: 'suedasien' },
  suedasienS: { haut: [3.5, 4.9], haar: { schwarz: 1 }, gm: 1.65, gf: 1.53, bart: 0.45, stil: 'suedasien' },
  ostasien: { haut: [0.9, 1.9], haar: { schwarz: 0.9, dunkel: 0.1 }, gm: 1.72, gf: 1.6, bart: 0.05, auge: 0.72, nase: 0.9, stil: 'ostasien' },
  japan: { haut: [0.8, 1.7], haar: { schwarz: 0.8, dunkel: 0.2 }, gm: 1.71, gf: 1.58, bart: 0.06, auge: 0.74, nase: 0.9, stil: 'japan' },
  korea: { haut: [0.8, 1.6], haar: { schwarz: 0.85, dunkel: 0.15 }, gm: 1.74, gf: 1.62, bart: 0.04, auge: 0.72, nase: 0.9, stil: 'japan' },
  suedostasien: { haut: [2.4, 3.6], haar: { schwarz: 0.95, dunkel: 0.05 }, gm: 1.65, gf: 1.54, bart: 0.05, auge: 0.8, nase: 1.05, stil: 'suedostasien' },
  ozeanien: { haut: [2.9, 4.2], haar: { schwarz: 0.9, dunkel: 0.1 }, gm: 1.76, gf: 1.65, bart: 0.25, breit: 1.1, stil: 'suedostasien' },
  aborigines: { haut: [4.6, 5.7], haar: { schwarz: 0.7, dunkel: 0.3 }, gm: 1.72, gf: 1.6, bart: 0.4, stil: 'usa' },
};
// Aussehen der Mehrheit je UN Unterregion, einzelne Länder darüber
const JE_REGION = { 'Northern Europe': 'nord', 'Western Europe': 'west', 'Southern Europe': 'sued', 'Eastern Europe': 'ost', 'Central Asia': 'zentralasien', 'Western Asia': 'arabisch', 'Northern Africa': 'maghreb', 'Southern Asia': 'suedasienN', 'Eastern Asia': 'ostasien', 'South-Eastern Asia': 'suedostasien', 'Northern America': 'europaeischNeu', 'Australia and New Zealand': 'europaeischNeu', 'Central America': 'mestizo', 'South America': 'mestizo', 'Caribbean': 'afrolatein', 'Western Africa': 'westafrika', 'Middle Africa': 'zentralafrika', 'Eastern Africa': 'ostafrika', 'Southern Africa': 'suedafrika', 'Melanesia': 'ozeanien', 'Micronesia': 'ozeanien', 'Polynesia': 'ozeanien' };
const JE_LAND = { TR: 'tuerkei', IR: 'persisch', AF: 'persisch', AZ: 'kaukasus', AM: 'kaukasus', GE: 'kaukasus', SA: 'golf', AE: 'golf', QA: 'golf', KW: 'golf', BH: 'golf', OM: 'golf', YE: 'golf', EG: 'aegypten', SD: 'sudan', SS: 'sudan', ET: 'horn', ER: 'horn', SO: 'horn', DJ: 'horn', LY: 'arabisch', MR: 'maghreb', JP: 'japan', KR: 'korea', KP: 'korea', MN: 'zentralasien', IN: 'suedasienN', LK: 'suedasienS', BD: 'suedasienS', RS: 'balkan', HR: 'balkan', BA: 'balkan', ME: 'balkan', AL: 'balkan', MK: 'balkan', GR: 'sued', BO: 'indigen', GT: 'indigen', PE: 'mestizo', RU: 'ost', US: 'europaeischNeu', CA: 'europaeischNeu', AU: 'europaeischNeu', NZ: 'europaeischNeu', AR: 'europaeischNeu', UY: 'europaeischNeu', CL: 'mestizo', ZA: 'suedafrika', CV: 'afrolatein', MG: 'ostafrika', IL: 'sued', CY: 'sued', MT: 'sued', HT: 'afrolatein', JM: 'afrolatein', CU: 'mestizo', DO: 'mestizo', PR: 'mestizo' };
// Volksgruppe aus groups.json auf ein Aussehen abbilden (englische Bezeichnung), null: Mehrheit des Landes
const NAME_REGEL = [[/\b(black|african american|afro|bantu|mulatto|creole|zulu|xhosa|sotho|tswana|hausa|yoruba|igbo|fulani|akan|mandinka|wolof|shona)\b/i, 'westafrika'], [/\b(pardo|mestizo|hispanic|latino|amerindian.?mestizo|ladino)\b/i, 'mestizo'], [/\b(quechua|aymara|maya|indigenous|amerindian|native|first nations|inuit|guarani|mapuche)\b/i, 'indigen'], [/\b(maori|polynesian|samoan|tongan|melanesian|papuan|fijian|pacific)\b/i, 'ozeanien'], [/\baborigin/i, 'aborigines'], [/\b(amazigh|berber|kabyle|tuareg)\b/i, 'amazigh'], [/\b(arab|bedouin|syrian|iraqi|lebanese|palestinian|jordan|saudi)\b/i, 'arabisch'], [/\b(turk|turkish)\b/i, 'tuerkei'], [/\b(kurd|persian|iranian|pashtun|tajik|baloch|hazara)\b/i, 'persisch'], [/\b(uzbek|kazakh|kyrgyz|turkmen|uyghur|mongol|tatar)\b/i, 'zentralasien'], [/\b(han|chinese|asian|korean|hmong)\b/i, 'ostasien'], [/\bjapan/i, 'japan'], [/\b(thai|lao|vietnam|kinh|khmer|burman|javanese|malay|filipino|tagalog|indones|sundanese|bisaya|shan)\b/i, 'suedostasien'], [/\b(tamil|telugu|malayali|kannadiga|sinhal|bengali)\b/i, 'suedasienS'], [/\b(indian|hindi|punjabi|gujarati|marathi|odia|pakistani|sindhi|urdu|nepali|south asian|indo)\b/i, 'suedasienN'], [/\b(russian|ukrainian|polish|romanian|belarus|bulgarian|czech|slovak|hungarian|lithuanian|latvian|estonian)\b/i, 'ost'], [/\b(serb|croat|bosnia|albanian|macedonian|montenegr)\b/i, 'balkan'], [/\b(greek|italian|spanish|portuguese)\b/i, 'sued'], [/\b(white|european|caucasian|german|french|british|irish|dutch|english|scottish|afrikaner|swedish|norwegian|danish|finn)\b/i, 'west']];
const VON_ISO3 = iso3 => { const c = DB?.iso3.get(iso3); if (!c) return null; return JE_LAND[c.iso2] || JE_REGION[c.sub] || 'west'; };

// Alltagskleidung je Stil (Oberteile, Unterteile, sRGB). Echte Straßenbilder: viel Dunkel und Neutrales, je Weltgegend etwas andere Töne
const NEUTRAL_U = [0x20242c, 0x2c3440, 0x3a3f46, 0x1a1c20, 0x4a5462, 0x6d7480, 0x54493c];
const STIL = {
  nord: { o: [0x22262c, 0x39424c, 0x55606a, 0x7a838a, 0x8d4b3a, 0x2e4a5e, 0xc9c3b6, 0x455a48, 0x1c1c20], u: NEUTRAL_U },
  west: { o: [0x25282e, 0x3d4650, 0x7d868f, 0xcac4b6, 0x8e2f35, 0x2e4a6e, 0xb9914f, 0x4d5c46, 0xe7e2d7, 0x6b3f55], u: [...NEUTRAL_U, 0x8a7a64] },
  sued: { o: [0xe9e4d8, 0x2f3a4c, 0x9c3b2e, 0xb99452, 0x3e6a7a, 0x1f2126, 0xd9cfbd, 0x6d7a4a, 0x8a5a6a], u: [...NEUTRAL_U, 0xb8a98c, 0xd6cdbb] },
  ost: { o: [0x23262b, 0x40464e, 0x5a4a3e, 0x6c7178, 0x7b2d2d, 0x2f3f52, 0xb9b3a8, 0x3a4a3e], u: NEUTRAL_U },
  usa: { o: [0x25282e, 0x8e2f35, 0x2e4a6e, 0xd7d2c6, 0x5f7a8c, 0x3f5a3f, 0xc08a3e, 0x7d868f, 0x1b2a44], u: [0x24344e, 0x2b3f5e, 0x3a3f46, 0x8a7a64, 0xb8a98c, 0x1a1c20] },
  latam: { o: [0xe7e2d7, 0xd4553a, 0x2e7a8a, 0xe3b23c, 0x25282e, 0x3e8a5a, 0x8a3a6a, 0x4a6fa5, 0xf0ece2], u: [0x24344e, 0x2b3f5e, 0x3a3f46, 0x8a7a64, 0xb8a98c, 0x1a1c20] },
  anden: { o: [0x8e2f35, 0x2e6a8a, 0xc05a2e, 0x5a3a7a, 0xe3b23c, 0x2f6a4a, 0x25282e], u: [0x24344e, 0x3a3f46, 0x1a1c20, 0x54493c] },
  nahost: { o: [0x25282e, 0xdcd6c8, 0x3d4650, 0x8a7f6a, 0x5c6a72, 0xa9794a, 0x2f4a5a, 0xefece4, 0x6b5a46], u: [...NEUTRAL_U, 0x8a7a64] },
  maghreb: { o: [0xefe9dc, 0x2f4a6a, 0xc69a5a, 0x7a2f35, 0x3d4650, 0xd9cbb0, 0x25282e, 0x2f7a7a, 0x8a5a3a], u: [...NEUTRAL_U, 0xb8a98c] },
  golf: { o: [0xefece6, 0x25282e, 0x8a8478, 0x2f3f52, 0xd9d3c6], u: [...NEUTRAL_U, 0xcfc8b8] },
  horn: { o: [0xefece6, 0xd9a13c, 0x2e7a6a, 0x8a3a3a, 0x2f4a7a, 0x25282e, 0xb95a2e], u: [...NEUTRAL_U] },
  westafrika: { o: [0xe0a020, 0xc23b2e, 0x1f7a5a, 0x2a4f9a, 0xf0ece2, 0x7a2a7a, 0x25282e, 0xe06a2a, 0x3aa0a0], u: [0x24344e, 0x3a3f46, 0x1a1c20, 0x54493c, 0xcfc8b8, 0x7a2a3a] },
  ostafrika: { o: [0xd97a2e, 0x1f7a6a, 0x2a5f9a, 0xefece4, 0x9a2a3a, 0xd9b13c, 0x25282e, 0x5a7a3a], u: [0x24344e, 0x3a3f46, 0x1a1c20, 0x54493c, 0x8a7a64] },
  suedasien: { o: [0xf0ece2, 0x2a6f9a, 0xc03a5a, 0xe0a020, 0x3a8a6a, 0x25282e, 0xd96a2e, 0x7a5aa0, 0x6d7480], u: [0x2c3440, 0x3a3f46, 0x54493c, 0x8a7a64, 0xcfc8b8, 0x1a1c20] },
  ostasien: { o: [0x24262b, 0xe9e6de, 0x5f666e, 0x8a9096, 0x2f3f52, 0xc9b49a, 0x7b2d3a, 0x3f5a50, 0xd8d4ca], u: [...NEUTRAL_U, 0xb8a98c] },
  japan: { o: [0x1e2024, 0xe9e6de, 0x5f666e, 0x2c3a52, 0xcdb9a0, 0x7a8288, 0x3f4f45, 0xf2efe8], u: [0x1a1c20, 0x2c3440, 0x3a3f46, 0x54493c, 0xb8a98c] },
  suedostasien: { o: [0xefece4, 0x2a6f9a, 0xd9502e, 0x3a8a6a, 0xe0b030, 0x25282e, 0x8a4a8a, 0x5f7a8c], u: [0x24344e, 0x3a3f46, 0x1a1c20, 0x8a7a64, 0xcfc8b8] },
};
// Tracht: Anteil an den Menschen dieses Stils oder Landes (Männer m, Frauen f). Kleiderarten siehe KLEID
const TRACHT_STIL = { maghreb: { m: [['djellaba', 0.26]], f: [['djellaba_f', 0.2], ['tuch', 0.42]] }, nahost: { m: [['thobe', 0.04]], f: [['tuch', 0.42], ['abaya', 0.08]] }, golf: { m: [['thobe', 0.78]], f: [['abaya', 0.85]] }, horn: { m: [['kurta', 0.12]], f: [['tuch', 0.45], ['abaya', 0.3]] }, westafrika: { m: [['agbada', 0.24]], f: [['gele', 0.3]] }, ostafrika: { m: [['kurta', 0.06]], f: [['gele', 0.14], ['tuch', 0.12]] }, suedasien: { m: [['kurta', 0.32]], f: [['sari', 0.34], ['salwar', 0.36]] }, suedostasien: { m: [], f: [] }, anden: { m: [], f: [['pollera', 0.24]] } };
const TRACHT_LAND = { TR: { m: [], f: [['tuch', 0.3]] }, IR: { m: [], f: [['tuch', 0.72], ['abaya', 0.14]] }, IQ: { m: [['thobe', 0.14]], f: [['tuch', 0.5], ['abaya', 0.3]] }, AF: { m: [['kurta', 0.75]], f: [['abaya', 0.75], ['tuch', 0.2]] }, PK: { m: [['kurta', 0.8]], f: [['salwar', 0.75], ['abaya', 0.12]] }, BD: { m: [['kurta', 0.3]], f: [['sari', 0.36], ['salwar', 0.3], ['tuch', 0.2]] }, ID: { m: [], f: [['tuch', 0.5]] }, MY: { m: [], f: [['tuch', 0.5]] }, NG: { m: [['agbada', 0.3]], f: [['gele', 0.3], ['tuch', 0.2]] }, SN: { m: [['agbada', 0.35]], f: [['gele', 0.35]] }, ML: { m: [['agbada', 0.42]], f: [['gele', 0.3], ['tuch', 0.2]] }, EG: { m: [['thobe', 0.14]], f: [['tuch', 0.7], ['abaya', 0.14]] }, SA: { m: [['thobe', 0.82]], f: [['abaya', 0.92]] }, DZ: { m: [['djellaba', 0.1]], f: [['tuch', 0.45], ['djellaba_f', 0.1]] }, TN: { m: [['djellaba', 0.06]], f: [['tuch', 0.28]] }, VN: { m: [['kegelhut', 0.03]], f: [['kegelhut', 0.05]] }, BO: { m: [], f: [['pollera', 0.3]] }, PE: { m: [], f: [['pollera', 0.12]] }, EC: { m: [], f: [['pollera', 0.1]] }, GT: { m: [], f: [['pollera', 0.25]] }, TH: { m: [['moench', 0.012]], f: [] }, MM: { m: [['moench', 0.02]], f: [] }, LK: { m: [['moench', 0.01]], f: [['sari', 0.3]] }, KH: { m: [['moench', 0.012]], f: [] } };
// Kleiderart: Körper, langes Gewand (robe 0 bis 1), Teil am Kopf, Farben. haar: Farbe des Tuchs statt Haar
const KLEID = {
  djellaba: { basis: ['hf_mann_hoodie'], robe: 1, o: [0xd9cbb0, 0xefe9dc, 0x8a7a60, 0x6a6f76, 0x3a4a6a, 0x7a5a3a] },
  djellaba_f: { basis: ['hf_frau_kopftuch'], robe: 1, tuch: true, o: [0x2f7a7a, 0x7a2f4a, 0x3a4a7a, 0xd9c9b0, 0x5a7a5a, 0xa0506a, 0x25282e] },
  thobe: { basis: ['hf_mann_anzug', 'hf_mann_jacke'], robe: 1, o: [0xf2f0ea, 0xefece4, 0xe6e2d6], kopf: 'ghutra' },
  abaya: { basis: ['hf_frau_kopftuch'], robe: 1, tuch: true, o: [0x141417, 0x1a1a20, 0x20222a], tuchFarbe: [0x141417, 0x1c1c22, 0x2a2a30] },
  kurta: { basis: ['hf_mann_jacke', 'hf_mann_anzug'], robe: 0.78, o: [0xf0ece2, 0xdcd4c0, 0x9ab4c8, 0x8a9a7a, 0xc9b490, 0x6d7480] },
  agbada: { basis: ['hf_mann_jacke', 'hf_mann_hoodie'], robe: 1, breit: 1.12, o: [0xe0a020, 0x2a4f9a, 0xf0ece2, 0x1f7a5a, 0xc23b2e, 0x7a2a7a, 0x5ab0c0], kopf: 'kufi' },
  gele: { basis: ['hf_frau_locken'], robe: 1, o: [0xe0a020, 0xc23b2e, 0x1f7a5a, 0x2a4f9a, 0x7a2a7a, 0xe06a2a], kopf: 'gele' },
  sari: { basis: ['hf_frau_locken', 'hf_frau_cap'], robe: 1, o: [0xc0304a, 0xe0a020, 0x2a7a9a, 0x7a2a7a, 0xd9602e, 0x2f8a5a, 0xe8c0c8] },
  salwar: { basis: ['hf_frau_kopftuch'], robe: 0.72, tuch: true, o: [0xc0406a, 0x2a7a9a, 0xe0b030, 0x7a4aa0, 0x3a8a6a, 0xf0e6d6] },
  tuch: { basis: ['hf_frau_kopftuch'], robe: 0, tuch: true },
  pollera: { basis: ['hf_frau_locken', 'hf_frau_cap'], robe: 0.9, breit: 1.1, o: [0x8e2f35, 0x2e6a8a, 0x5a3a7a, 0xc05a2e, 0x2f6a4a], kopf: 'bowler' },
  kegelhut: { basis: ['hf_mann_jacke', 'hf_frau_locken'], robe: 0, kopf: 'kegelhut' },
  moench: { basis: ['hf_mann_jacke'], robe: 1, o: [0xc8641e, 0xb9571a, 0xa84e1c], kahl: true },
};
const TUECHER = [0x2a2c33, 0x5a6a7a, 0xd9cfc0, 0x7a2f4a, 0x2f5a6a, 0x8a7a60, 0x4a3a5a, 0xefe9dc, 0x3a6a5a, 0xa06a7a];
const MANN_ALLTAG = [['hf_mann_jacke', 0.42], ['hf_mann_hoodie', 0.3], ['hf_mann_anzug', 0.28]], FRAU_ALLTAG = [['hf_frau_locken', 0.46], ['hf_frau_cap', 0.3], ['hf_frau_mantel', 0.24]];

let DB = null, laden = null;
export function voelkerLaden(basis) {
  return laden ??= Promise.all([fetch(new URL('daten/heute/countries.json', basis)).then(r => r.json()), fetch(new URL('daten/heute/groups.json', basis)).then(r => r.json())]).then(([c, g]) => {
    DB = { iso2: new Map(), iso3: new Map(), g: g.countries, konflikte: c.conflicts || [], beziehungen: c.relations || [] }; for (const x of c.countries) { DB.iso2.set(x.iso2, x); DB.iso3.set(x.iso3, x); } return DB;   // Konflikte und Beziehungen für die Geschichten der Menschen (kit/geschichten.js)
  }).catch(e => { console.warn('Völker', e); laden = null; return null; });
}
function zufall(seed) { let h = (seed >>> 0) || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
const wahl = (R, L) => { let s = 0; for (const x of L) s += x[1]; let r = R() * s; for (const x of L) { r -= x[1]; if (r <= 0) return x[0]; } return L[L.length - 1][0]; };
const eins = (R, a) => a[Math.floor(R() * a.length) % a.length];
const norm = (R, m, s) => m + s * (R() + R() + R() - 1.5) * 1.15;

// Eine Person der Bevölkerung ziehen: Volksgruppe, Herkunft (Migranten), Alter, Geschlecht, Kleidung
function person(R, iso2, nurErwachsen = true) {
  const c = DB?.iso2.get(iso2), g = c ? DB.g[c.iso3] : null;
  let ausKey = c ? (JE_LAND[iso2] || JE_REGION[c.sub] || 'west') : 'west', landIso = iso2, migrant = false;
  if (g) {
    if (R() < (g.migrants || 0) && g.origins?.length) { const [iso3] = wahl(R, g.origins.map(o => [o, o[1]])), k = VON_ISO3(iso3); if (k) { ausKey = k; landIso = DB.iso3.get(iso3)?.iso2 || iso2; migrant = true; } }
    else if (g.ethnic?.length) { const e = wahl(R, g.ethnic.map(q => [q, q[2]])); for (const [re, key] of NAME_REGEL) if (re.test(e[1])) { const mehrheit = JE_LAND[iso2] || JE_REGION[c.sub]; if (mehrheit !== key && !(key === 'west' && ['nord', 'sued', 'ost', 'europaeischNeu', 'balkan'].includes(mehrheit)) && !(key === 'westafrika' && ['zentralafrika', 'ostafrika', 'suedafrika', 'afroamerika', 'afrolatein'].includes(mehrheit))) ausKey = key === 'westafrika' && (c.sub === 'Northern America') ? 'afroamerika' : key === 'westafrika' && /America|Caribbean/.test(c.sub) ? 'afrolatein' : key === 'west' && /America|Australia/.test(c.sub) ? 'europaeischNeu' : key; break; } }
  }
  const a = A[ausKey] || A.west, frau = R() < 0.5;
  // Alter aus der Altersstruktur (Kinder werden hier zu Jugendlichen: die Körper sind Erwachsene)
  const ag = g?.age || [0.2, 0.65, 0.15], r = R(), jung = r < ag[0] * 0.55, alt = r > 1 - ag[2], alter = jung ? 13 + R() * 7 : alt ? 65 + R() * 22 : 20 + R() * 45;
  // Kleidung: Tracht nach dem Herkunftsland, wer eingewandert ist, trägt sie seltener. Sikh Turban, Kopftuch nach Religion über die Tabellen
  const stil = a.stil, T = TRACHT_LAND[landIso] || TRACHT_STIL[stil] || { m: [], f: [] }, reg = migrant ? 0.5 : 1, liste = frau ? T.f : T.m;
  let kleid = null; { let s = R(); for (const [k, p] of liste) { const q = p * reg * (alt ? 1.35 : jung ? 0.6 : 1); if (s < q) { kleid = k; break; } s -= q; } }
  let sikh = false; if (!frau && !kleid && g?.rel?.sikh && R() < g.rel.sikh * 0.9 / Math.max(0.05, 0.5)) sikh = true;
  return { a, ausKey, stil, frau, alter, kleid, sikh, migrant, landIso };
}

// Eine Figur aus einer Person: Körper, Farben, Maße
function lookAus(p, R) {
  const { a, frau, alter, kleid } = p, S = STIL[p.stil] || STIL.west, K = kleid ? KLEID[kleid] : null;
  const hT = a.haut[0] + (a.haut[1] - a.haut[0]) * Math.pow((R() + R()) / 2, 1) * (frau ? 0.96 : 1), haut = hautAus(hT);
  const hN = alter > 62 ? (R() < 0.6 ? 'grau' : 'weiss') : alter > 48 && R() < 0.5 ? 'grau' : wahl(R, Object.entries(a.haar));
  let haar = srgb(HAAR[hN]);
  let basis, robe = 0, breit = (a.breit || 1) * norm(R, alter > 40 ? 1.05 : 0.99, 0.05), kopf = null, kopfFarbe = null;
  let oben = srgb(hex(eins(R, S.o))), unten = srgb(hex(eins(R, S.u)));
  if (K) {
    basis = eins(R, K.basis.filter(b => /frau/.test(b) === frau).length ? K.basis.filter(b => /frau/.test(b) === frau) : K.basis); robe = K.robe || 0; if (K.breit) breit *= K.breit; kopf = K.kopf || null;
    if (K.o) { oben = srgb(hex(eins(R, K.o))); if (robe > 0.5) unten = oben; }
    if (K.tuch) haar = srgb(hex(eins(R, K.tuchFarbe || TUECHER)));
    if (kopf === 'ghutra') kopfFarbe = R() < 0.72 ? 0xf2f0ea : 0xb5534a; else if (kopf === 'kufi') kopfFarbe = eins(R, [0xf0ece2, 0x7a2a3a, 0x2a4f9a, 0x25282e]); else if (kopf === 'gele') kopfFarbe = eins(R, K.o); else if (kopf === 'bowler') kopfFarbe = eins(R, [0x25282e, 0x3a2f2a, 0x54493c]); else if (kopf === 'kegelhut') kopfFarbe = 0xcdb98a;
    if (K.kahl) haar = haut;
  } else {
    const L = frau ? FRAU_ALLTAG : MANN_ALLTAG; let q = L.map(([b, w]) => [b, (alter > 55 && /mantel|anzug/.test(b) ? 2.6 : alter < 28 && /cap|hoodie/.test(b) ? 2 : 1) * w]); basis = wahl(R, q);
    if (basis === 'hf_mann_anzug') { unten = R() < 0.8 ? oben : unten; if (R() < 0.7) oben = unten = srgb(hex(eins(R, [0x1b2230, 0x22262e, 0x3a3f46, 0x2f3a4c, 0x4a4f58, 0x54493c]))); }   // Anzug: Jacke und Hose gehören zusammen
    if (p.sikh) { kopf = 'turban'; kopfFarbe = eins(R, [0x1f3a7a, 0xc0802a, 0x8e2f35, 0x25282e, 0xe9e4d8, 0xd9602e]); }
  }
  const groesse = (frau ? a.gf : a.gm) * norm(R, 1, 0.038) * (alter < 16 ? 0.92 : alter > 72 ? 0.97 : 1), bart = !frau && alter >= 18 && R() < a.bart ? 0.45 + R() * 0.55 : 0;
  return { basis, haut, haar, oben, unten, robe, breit: Math.max(0.9, Math.min(1.22, breit)), kopf, kopfFarbe, groesse, bart, auge: a.auge || 1, nase: a.nase || 1, lippen: a.lippen || 1, frau, alter, ausKey: p.ausKey, kleid: p.kleid || (p.sikh ? 'sikh' : null), migrant: p.migrant, herkunft: p.landIso };   // migrant, herkunft: für die Geschichte der Figur
}
// n Figuren für einen Ort (Land iso2, ohne Land Mischung Mitteleuropa). seed: fest je Land und Ort
export function looksFuer(iso2, n, seed = 7, nurBasen = null) {
  const R = zufall(seed * 2654435761 + 97), L = [];
  for (let i = 0, v = 0; i < n && v < n * 6; v++) { const q = lookAus(person(R, iso2 || 'DE'), R); if (nurBasen && !nurBasen.includes(q.basis)) continue; L.push(q); i++; }
  return L;
}
// Mitte des Gürtels je Volk für die Prüfung
export function aussehenInfo() { return Object.keys(A); }
