// Werbeflächen der Erde (Wunsch Nr. 59, 06.11.2026, Nader: "überall auch Litfaßsäulen, Plakate, Werbeflächen, die noch frei sind ... Die Locations, die natürlich am attraktivsten sind, in Großstädte ... sollen natürlich mehr kosten und die müssen auch kategorisiert werden, dass wir eine komplette Registerübersicht haben").
import { T } from './sprache.js';
// Diese Datei gilt für alles: Ortsbau im Worker (kit/ortbau.js), Spiel (kit/werbung.js, dashboard/spiel.js) und Register (dashboard/register.js). Keine Abhängigkeiten, läuft auch in Node.
// Jede Fläche hat eine feste Kennung aus Art und Lage auf der Erde: dieselbe Stelle ergibt auf jedem Gerät dieselbe Nummer, auch ohne Server.
// Preise stehen nur in daten/werbung/preise.json, Buchungen nur in daten/werbung/buchungen.json.

export const WF_ARTEN = {
  clp: { kurz: 'CL', name: 'City Light Poster', mehr: 'City Light Poster', info: 'Beleuchtetes Plakat am Gehweg, beidseitig', b: 1.19, h: 1.75 },
  litfass: { kurz: 'LS', name: 'Litfaßsäule', mehr: 'Litfaßsäulen', info: 'Runde Säule, 2 Plakate', b: 3.9, h: 2.4 },
  plakat: { kurz: 'PL', name: 'Plakatwand', mehr: 'Plakatwände', info: 'Großfläche an der Straße', b: 3.56, h: 2.52 },
  dach: { kurz: 'DA', name: 'Dachwerbung', mehr: 'Dachwerbung', info: 'Tafel auf dem Dach, von weitem sichtbar' },
  banner: { kurz: 'FB', name: 'Fassadenbanner', mehr: 'Fassadenbanner', info: 'Riesenposter an der Hauswand' },
  pylon: { kurz: 'GB', name: 'Großbildwand', mehr: 'Großbildwände', info: 'Leuchtwand auf eigenem Mast, beidseitig', b: 12, h: 7 },
  wahrzeichen: { kurz: 'WZ', name: 'Banner am Wahrzeichen', mehr: 'Banner an Wahrzeichen', info: 'Einzelstück direkt am Wahrzeichen' },
};

// Fahrzeuge und Stadien (07.11.2026): keine festen Stellen, je Stadt gebucht. Preis: Grundpreis der Stufe mal Faktor aus daten/werbung/preise.json (zusatz)
export const WF_ZUSATZ = { bus: { name: 'Busse einer Stadt', info: 'Seitenband auf allen Bussen der Stadt' }, taxi: { name: 'Taxis einer Stadt', info: 'Dachschild auf allen Taxis der Stadt' }, stadion: { name: 'Stadion', info: 'Bande rund ums Spielfeld' } };
export const wfWunschMail = (mail, { adresse = '', art = '', lage = '' }) => `mailto:${mail || ''}?subject=${encodeURIComponent(T('Wunschfläche im Spiel EARTH'))}&body=${encodeURIComponent(T(`Hallo Nader,\n\nich möchte eine Werbefläche an dieser Stelle im Spiel EARTH:\n\nAdresse oder Ort: ${adresse}\nArt: ${art}\nLage: ${lage}\n\nMein Unternehmen:\nLink, zu dem die Werbung führen soll:\nGewünschter Start:\n\nViele Grüße\n`))}`;
// Schätzung der Flächen einer Stadt (Register und Excel): gemessen am 06.11.2026 in 11 Orten, 60 bis 110 Flächen je 1,44 km² im Stadtkern, grob 2.500 Menschen je km² im Schnitt einer Stadt
export const WF_SCHAETZUNG = { menschenJeFlaeche: 55, anteil: { clp: 0.3, litfass: 0.22, plakat: 0.2, dach: 0.08, banner: 0.2 } };
export const WF_STUFEN = [
  { id: 'S', name: 'Weltstadt', regel: 'ab 3 Mio. Menschen, oder Hauptstadt ab 1 Mio.' },
  { id: 'A', name: 'Metropole', regel: 'ab 1 Mio. Menschen' },
  { id: 'B', name: 'Großstadt', regel: 'ab 250.000 Menschen' },
  { id: 'C', name: 'Stadt', regel: 'ab 50.000 Menschen' },
  { id: 'D', name: 'Kleinstadt', regel: 'ab 5.000 Menschen' },
  { id: 'E', name: 'Land', regel: 'alles darunter und abseits' },
];

// Stufe einer Stadt aus Einwohnern und Großraum
export function wfStadtStufe(pop = 0, metro = 0, hauptstadt = false) {
  const g = Math.max(pop, metro); let s = g >= 3e6 ? 0 : g >= 1e6 ? 1 : g >= 2.5e5 ? 2 : g >= 5e4 ? 3 : g >= 5e3 ? 4 : 5;
  if (hauptstadt && s > 0) s = g >= 1e6 ? 0 : s - 1;
  return s;
}
// Halbmesser des teuren Kerns in km: Berlin rund 5, eine Stadt mit 100.000 rund 1,6
export const wfKern = (pop = 0, metro = 0) => 0.8 + 0.8 * Math.sqrt(Math.max(pop, metro, 1000) / 1e5) ** 0.75 * 1.0;
// Stufe an einer Stelle: im Kern die Stufe der Stadt, weiter draußen eine oder zwei Stufen darunter. Wahrzeichen und benannte Lagen sind immer die höchste Stufe ihrer Stadt
export function wfStufeHier({ pop = 0, metro = 0, hauptstadt = false, km = 0, premium = false } = {}) {
  const s = wfStadtStufe(pop, metro, hauptstadt); if (premium) return s;
  const r = wfKern(pop, metro); return Math.min(5, s + (km <= r ? 0 : km <= r * 2.5 ? 1 : 2));
}
// Kaufkraft: eine Fläche in Lagos kostet nicht dasselbe wie in Zürich. Aus dem BIP je Kopf (daten/heute/countries.json), begrenzt. Werte aus der Preisliste
export const wfKaufkraft = (gdppc, P) => { const K = P?.kaufkraft || {}; return Math.max(K.min ?? 0.15, Math.min(K.max ?? 1.4, (gdppc || 12000) / (K.ref ?? 40000))); };
const rundeWf = x => { const r = x >= 1000 ? 100 : x >= 100 ? 10 : 1; return Math.round(x / r) * r; };
function wfRoh(P, art, stufe, gdppc, flaeche) { const basis = P.basisProMonat[WF_STUFEN[stufe]?.id] ?? 1, f = P.faktorArt[art] ?? 1, ref = P.referenzQm?.[art], gross = flaeche && ref ? Math.max(0.6, Math.min(3, Math.sqrt(flaeche / ref))) : 1; return basis * f * gross * wfKaufkraft(gdppc, P); }
// Zielpreis im Monat und Startpreis (Pionierpreis, solange wenige Spieler da sind). Gleiche Formeln wie das Blatt Preisliste in 13_WERBUNG/Werbeflaechen_Register.xlsx. P: daten/werbung/preise.json
export function wfPreis(P, art, stufe, gdppc, flaeche = 0) { return P ? Math.max(P.mindestens ?? 1, rundeWf(wfRoh(P, art, stufe, gdppc, flaeche))) : null; }
export function wfStartPreis(P, art, stufe, gdppc, flaeche = 0) { return P ? Math.max(P.mindestStart ?? 9, rundeWf(wfRoh(P, art, stufe, gdppc, flaeche) * (P.startFaktor ?? 0.5))) : null; }

// Raster auf der Erde: rund 67 m (Wunsch Nr. 61: "überall auf der Welt verteilt ganz viele"), jede Zeile (Breite) hat ihre eigene Teilung in Länge, unabhängig vom Ort. Eine Zelle trägt höchstens eine Fläche
export const WF_RASTER = 0.0006;
export const wfRasterLon = lat => WF_RASTER / Math.max(0.2, Math.cos(lat * Math.PI / 180));
export const wfZelle = (i, j) => (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x5bd1e995) >>> 0 || 1;
// Zahlencode (Wunsch Nr. 62, 06.11.2026, "Jeder Werbefläche ... soll einen Zahlencode haben, damit man das nachvollziehen kann"): 12 Ziffern aus der Rasterzelle. Er steht auf dem Plakat, in der Mail und im Register, und aus ihm lässt sich die Lage auf der Erde zurückrechnen, ganz ohne Server. Benannte Lagen haben 3 Ziffern (100, 101 ...)
export const wfCode = (i, j) => String(i + 150000).padStart(6, '0') + String(j + 300000).padStart(6, '0');
export const wfCodeText = c => String(c).replace(/(\d{3})(?=\d)/g, '$1 ');
export function wfCodeLage(code) {
  const c = String(code).replace(/\D/g, ''); if (c.length === 3) { const P = WF_PREMIUM.find(p => p.id === c); return P ? { lat: P.lat, lon: P.lon, premium: P } : null; }
  if (c.length !== 12) return null; const i = +c.slice(0, 6) - 150000, j = +c.slice(6) - 300000, lat = i * WF_RASTER, lon = j * wfRasterLon(lat); return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
// Fertige Mail (Wunsch Nr. 62): Klick auf die Fläche, Mail geht auf, Code und Lage stehen schon drin. Adresse aus daten/werbung/preise.json (kontaktMail)
export function wfMailLink(mail, { code, art, ort, groesse, stufe, start, register }) {
  const betreff = T(`Werbefläche ${wfCodeText(code)} anfragen`), text = T(`Hallo Nader,\n\nich möchte diese Werbefläche im Spiel EARTH buchen:\n\nCode: ${wfCodeText(code)}\nArt: ${art}\nOrt: ${ort}\nGröße: ${groesse}\nPreisstufe: ${stufe}\n${start ? `Startpreis: ${start} im Monat\n` : ''}${register ? `Im Register: ${register}\n` : ''}\nMein Unternehmen:\nLink, zu dem die Werbung führen soll:\nGewünschter Start:\n\nViele Grüße\n`);
  return `mailto:${mail || ''}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
}

// Benannte Lagen (Lage aus öffentlichen Angaben, gerundet). Eine Großbildwand sucht sich beim Ortsbau in der Nähe einen freien Platz, nie auf der Fahrbahn und nie im Haus.
// Am Wahrzeichen: Maße in Metern, Rahmen des Modells (x quer, y hoch, z nach vorn). Nur hier eintragen, der Rest folgt von selbst.
const G = (id, iso, name, stadt, lat, lon) => ({ id: `WF-${iso}-GB-${id}`, art: 'pylon', iso, name, stadt, lat, lon, b: 12, h: 7 });
export const WF_PREMIUM = [
  { id: 'WF-DE-WZ-BRANDENBURGER-TOR', art: 'wahrzeichen', iso: 'DE', name: 'Brandenburger Tor', stadt: 'Berlin', lat: 52.51627, lon: 13.37769, wz: 'brandenburg', b: 30.4, h: 2.72, platten: [{ x: 0, y: 14.96, z: 7.31, ry: 0 }, { x: 0, y: 14.96, z: -7.31, ry: Math.PI }] },
  G('POTSDAMER-PLATZ', 'DE', 'Potsdamer Platz', 'Berlin', 52.5096, 13.3759), G('ALEXANDERPLATZ', 'DE', 'Alexanderplatz', 'Berlin', 52.5219, 13.4132), G('BREITSCHEIDPLATZ', 'DE', 'Breitscheidplatz, Kurfürstendamm', 'Berlin', 52.5049, 13.3357), G('CHECKPOINT-CHARLIE', 'DE', 'Friedrichstraße, Checkpoint Charlie', 'Berlin', 52.5075, 13.3904), G('HACKESCHER-MARKT', 'DE', 'Hackescher Markt', 'Berlin', 52.5226, 13.4023), G('WARSCHAUER-STRASSE', 'DE', 'Warschauer Straße', 'Berlin', 52.5059, 13.4495), G('HAUPTBAHNHOF-BERLIN', 'DE', 'Hauptbahnhof', 'Berlin', 52.5251, 13.3694),
  G('JUNGFERNSTIEG', 'DE', 'Jungfernstieg', 'Hamburg', 53.5527, 9.9929), G('REEPERBAHN', 'DE', 'Reeperbahn', 'Hamburg', 53.5496, 9.9636), G('MARIENPLATZ', 'DE', 'Marienplatz', 'München', 48.1373, 11.5755), G('STACHUS', 'DE', 'Stachus', 'München', 48.139, 11.566), G('DOMPLATTE', 'DE', 'Domplatte', 'Köln', 50.9413, 6.9583), G('HAUPTWACHE', 'DE', 'Hauptwache', 'Frankfurt am Main', 50.114, 8.679), G('SCHLOSSPLATZ', 'DE', 'Schlossplatz', 'Stuttgart', 48.7785, 9.1799), G('KOENIGSALLEE', 'DE', 'Königsallee', 'Düsseldorf', 51.2238, 6.7793),
  G('TIMES-SQUARE', 'US', 'Times Square', 'New York', 40.758, -73.9855), G('HOLLYWOOD-BLVD', 'US', 'Hollywood Boulevard', 'Los Angeles', 34.1016, -118.334), G('LAS-VEGAS-STRIP', 'US', 'Las Vegas Strip', 'Las Vegas', 36.1147, -115.1728), G('MICHIGAN-AVENUE', 'US', 'Michigan Avenue', 'Chicago', 41.895, -87.624), G('YONGE-DUNDAS', 'CA', 'Yonge Dundas', 'Toronto', 43.656, -79.381),
  G('PICCADILLY-CIRCUS', 'GB', 'Piccadilly Circus', 'London', 51.5101, -0.134), G('CHAMPS-ELYSEES', 'FR', 'Champs Élysées', 'Paris', 48.87, 2.3075), G('GRAN-VIA', 'ES', 'Gran Vía', 'Madrid', 40.42, -3.706), G('PLACA-CATALUNYA', 'ES', 'Plaça de Catalunya', 'Barcelona', 41.387, 2.17), G('VIA-DEL-CORSO', 'IT', 'Via del Corso', 'Rom', 41.902, 12.479), G('DAM', 'NL', 'Dam', 'Amsterdam', 52.373, 4.893), G('STEPHANSPLATZ', 'AT', 'Stephansplatz', 'Wien', 48.2085, 16.373), G('BAHNHOFSTRASSE', 'CH', 'Bahnhofstrasse', 'Zürich', 47.373, 8.539), G('TAKSIM', 'TR', 'Taksim', 'Istanbul', 41.0369, 28.985),
  G('SHIBUYA', 'JP', 'Shibuya Crossing', 'Tokio', 35.6595, 139.7006), G('SHINJUKU', 'JP', 'Shinjuku', 'Tokio', 35.6938, 139.7034), G('GANGNAM', 'KR', 'Gangnam', 'Seoul', 37.4979, 127.0276), G('WANGFUJING', 'CN', 'Wangfujing', 'Peking', 39.914, 116.41), G('NANJING-ROAD', 'CN', 'Nanjing Road', 'Shanghai', 31.235, 121.477), G('CAUSEWAY-BAY', 'HK', 'Causeway Bay', 'Hongkong', 22.28, 114.184), G('ORCHARD-ROAD', 'SG', 'Orchard Road', 'Singapur', 1.304, 103.832), G('SIAM', 'TH', 'Siam', 'Bangkok', 13.7456, 100.534), G('CONNAUGHT-PLACE', 'IN', 'Connaught Place', 'Delhi', 28.6315, 77.2167), G('BANDRA', 'IN', 'Bandra', 'Mumbai', 19.0596, 72.8295), G('DOWNTOWN-DUBAI', 'AE', 'Downtown', 'Dubai', 25.197, 55.274),
  G('TAHRIR', 'EG', 'Tahrir', 'Kairo', 30.0444, 31.2357), G('JEMAA-EL-FNAA', 'MA', 'Jemaa el Fnaa', 'Marrakesch', 31.6258, -7.9892), G('CASABLANCA-CENTRE', 'MA', 'Maarif', 'Casablanca', 33.595, -7.619), G('VICTORIA-ISLAND', 'NG', 'Victoria Island', 'Lagos', 6.428, 3.422), G('SANDTON', 'ZA', 'Sandton', 'Johannesburg', -26.107, 28.056),
  G('PAULISTA', 'BR', 'Avenida Paulista', 'São Paulo', -23.5613, -46.6559), G('COPACABANA', 'BR', 'Copacabana', 'Rio de Janeiro', -22.97, -43.183), G('OBELISCO', 'AR', 'Obelisco', 'Buenos Aires', -34.6037, -58.3816), G('REFORMA', 'MX', 'Paseo de la Reforma', 'Mexiko Stadt', 19.427, -99.167), G('GEORGE-STREET', 'AU', 'George Street', 'Sydney', -33.87, 151.207),
];
// Code der benannten Lagen aus der Reihenfolge: neue Lagen nur hinten anfügen, sonst ändern sich Codes, die schon verkauft sind
WF_PREMIUM.forEach((p, i) => { p.slug = p.id; p.id = String(100 + i); });
