// Geschichten der Menschen (07.11.2026, Wunsch Nr. 76, Nader: "jeder Mensch eine eigene Geschichte ..., die auch zu der Regierung, zu der politischen Lage jetzt gerade passt,
// und dass jeder eine andere über sich erzählt, wenn man sie anspricht, wenn man vor ihnen steht und E klickt, sodass man das dann als Sprechblase lesen kann").
// Jede Figur bekommt beim ersten Ansprechen eine feste Geschichte. Bausteine: ihr Aussehen (Alter, Frau oder Mann, eingewandert und woher, kit/voelker.js), das Land aus
// der Erddatenbank (Staatsform, nächste Wahl, Bündnisse, Freiheit, Wirtschaft, Altersstruktur, Wanderung, laufende Konflikte, Spannungen: daten/heute/countries.json und
// groups.json, Stand 26.10.2026), der Ort, das heutige Datum und was die Figur gerade tut (Joggen, Telefonieren, zu zweit, in einer Gruppe). Vornamen aus names.json.
// Feste Regeln: keine echten Namen von Politikern oder Parteien, keine Gewalt, keine Opfer, keine Schlagzeilen, nie gegen Menschen wegen Herkunft oder Religion.
// Meinungen gemischt (zufrieden, unzufrieden, gleichgültig, hoffnungsvoll), wo man frei reden kann. Wo das Land wenig Freiheit hat, reden die Menschen vorsichtig.
// Sprache wie im Spiel (Englisch Standard, Deutsch wählbar), Zahlen als Ziffern, keine Gedankenstriche. Prüfung: node tools/geschichten_test.mjs
import { istEN } from './sprache.js';
import { voelkerLaden } from './voelker.js';

let DB = null, NAMEN = null, laden = null;
const GENUTZT = new Set();   // jede Geschichte nur einmal je Sitzung

// Daten laden (im Spiel), oder für den Prüfstand direkt setzen
export function geschichtenLaden(basis) {
  return laden ??= Promise.all([voelkerLaden(basis), fetch(new URL('daten/heute/names.json', basis)).then(r => r.json())]).then(([db, n]) => { DB = db; NAMEN = n; return !!db; })
    .catch(e => { console.warn('Geschichten', e); laden = null; return false; });
}
export function geschichtenDaten({ countries, groups, names }) {
  DB = { iso2: new Map(), iso3: new Map(), g: groups.countries, konflikte: countries.conflicts || [], beziehungen: countries.relations || [] };
  for (const x of countries.countries) { DB.iso2.set(x.iso2, x); DB.iso3.set(x.iso3, x); }
  NAMEN = names;
}
export const geschichtenBereit = () => !!(DB && NAMEN);

const zufall = seed => { let h = (seed >>> 0) || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; };
const eins = (R, a) => a[Math.floor(R() * a.length) % a.length];
const wahl = (R, L) => { let s = 0; for (const x of L) s += Math.max(0, x[1]); let r = R() * s; for (const x of L) { r -= Math.max(0, x[1]); if (r <= 0) return x[0]; } return L[L.length - 1][0]; };
const kl = (v, a, b) => Math.max(a, Math.min(b, v));

// Gruß in der Sprache der Figur (nach ihrer Namensgruppe), der Rest in der Sprache des Spielers
const GRUSS = { de: ['Hallo!', 'Moin!', 'Servus!', 'Hi!'], en_us: ['Hey!', 'Hi there!', 'Hello!'], en_gb: ['Hiya!', 'Hello!', 'Morning!'], fr: ['Bonjour!', 'Salut!'], fr_af: ['Bonjour!', 'Salut!'], es: ['¡Hola!', '¡Buenas!'], es_la: ['¡Hola!', '¡Qué tal!'], pt_br: ['Oi!', 'Olá!'], it: ['Ciao!', 'Salve!'], pl: ['Cześć!', 'Dzień dobry!'], ru: ['Privet!', 'Zdravstvuyte!'], uk: ['Pryvit!', 'Dobryi den!'], tr: ['Merhaba!', 'Selam!'], ar: ['Marhaba!', 'Salam!'], fa: ['Salam!'], ur: ['Salam!', 'Adaab!'], hi: ['Namaste!'], bn: ['Nomoskar!'], zh: ['Nǐ hǎo!'], ja: ['Konnichiwa!'], ko: ['Annyeong!'], vi: ['Xin chào!'], th: ['Sawasdee!'], id: ['Halo!', 'Selamat siang!'], sw: ['Jambo!', 'Habari!'], yo: ['Bawo ni!'], am: ['Selam!'], wo: ['Bonjour!', 'Salut!'], zu: ['Sawubona!'], nl: ['Hoi!', 'Hallo!'], sv: ['Hej!', 'Tjena!'], el: ['Geia sou!'], he: ['Shalom!'], amz: ['Azul!'] };

// Gruß je Land, wo die Namensgruppe nur verwandt ist (Myanmar nutzt thailändische Namen, viele Länder Westafrikas die Gruppe Wolof)
const GRUSS_LAND = { MM: ['Mingalaba!'], KH: ['Suosdei!'], LA: ['Sabaidee!'], PH: ['Kumusta!', 'Hello!'], LK: ['Ayubowan!'], MN: ['Sain baina uu!'], KZ: ['Salem!', 'Privet!'], UZ: ['Salom!'], KG: ['Salam!'], TJ: ['Salom!'], TM: ['Salam!'], AZ: ['Salam!'], GE: ['Gamarjoba!'], AM: ['Barev!'],
  HU: ['Szia!'], CZ: ['Ahoj!'], SK: ['Ahoj!'], RO: ['Salut!', 'Bună!'], MD: ['Salut!', 'Bună!'], FI: ['Moi!', 'Hei!'], EE: ['Tere!'], LV: ['Sveiki!'], LT: ['Labas!'], DK: ['Hej!'], NO: ['Hei!'], IS: ['Halló!'], HR: ['Bok!', 'Zdravo!'], RS: ['Zdravo!'], BA: ['Zdravo!'], ME: ['Zdravo!'], SI: ['Živjo!'], MK: ['Zdravo!'], BG: ['Zdravei!'],
  AL: ['Përshëndetje!'], XK: ['Përshëndetje!'], MT: ['Bongu!'], HK: ['Nei hou!'], SN: ['Na nga def!', 'Salut!'], GM: ['Na nga def!', 'Hello!'], GH: ['Akwaaba!', 'Hello!'], ET: ['Selam!'], ER: ['Selam!'], SO: ['Salaan!'], MG: ['Salama!'], RW: ['Muraho!'], NP: ['Namaste!'], AF: ['Salam!'], PK: ['Salam!'], IR: ['Salam!'], BR: ['Oi!', 'Olá!'], PT: ['Olá!', 'Bom dia!'], MA: ['Salam!', 'Azul!'], DZ: ['Salam!', 'Azul!'] };

// Länder mit Artikel: "aus der Türkei", "mit den USA" (Dativ) und "from the Netherlands"
const DATIV = { TR: 'der Türkei', CH: 'der Schweiz', UA: 'der Ukraine', SK: 'der Slowakei', MN: 'der Mongolei', DO: 'der Dominikanischen Republik', CF: 'der Zentralafrikanischen Republik', CD: 'der Demokratischen Republik Kongo', CG: 'der Republik Kongo', CI: 'der Elfenbeinküste', EH: 'der Westsahara', VA: 'der Vatikanstadt',
  IQ: 'dem Irak', IR: 'dem Iran', YE: 'dem Jemen', LB: 'dem Libanon', SD: 'dem Sudan', SS: 'dem Südsudan', TD: 'dem Tschad', NE: 'dem Niger', OM: 'dem Oman', SN: 'dem Senegal', XK: 'dem Kosovo', GB: 'dem Vereinigten Königreich',
  US: 'den Vereinigten Staaten', NL: 'den Niederlanden', AE: 'den Vereinigten Arabischen Emiraten', PH: 'den Philippinen', MV: 'den Malediven', SC: 'den Seychellen', KM: 'den Komoren', BS: 'den Bahamas', SB: 'den Salomonen', MH: 'den Marshallinseln' };
const MIT_THE = new Set(['US', 'NL', 'AE', 'PH', 'MV', 'SC', 'KM', 'BS', 'SB', 'MH', 'GB', 'CD', 'CG', 'CF', 'DO', 'GM']);
const landDat = c => DATIV[c.iso2] || c.de;   // nach "aus" und "mit"
const landEn = c => (MIT_THE.has(c.iso2) ? 'the ' : '') + c.en;

const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Berufe: Mann, Frau, englisch, Gewicht je Wohlstand [arm, mittel, reich], wo (deutsch), wo (englisch), als Ausbildung möglich
const BERUFE = [
  ['Pfleger', 'Pflegerin', 'a nurse', [1, 1, 1.3], 'im Krankenhaus hier in der Nähe', 'at the hospital nearby', true],
  ['Lehrer', 'Lehrerin', 'a teacher', [1, 1, 1], 'an einer Grundschule', 'at a primary school', false],
  ['Busfahrer', 'Busfahrerin', 'a bus driver', [0.8, 1, 0.9], 'auf der Linie durch die Innenstadt', 'on the route through the city centre', false],
  ['Taxifahrer', 'Taxifahrerin', 'a taxi driver', [1.1, 1, 0.6], 'meistens nachts', 'mostly at night', false],
  ['Bäcker', 'Bäckerin', 'a baker', [1, 1, 0.8], 'und stehe jeden Tag um 3 Uhr auf', 'and get up at 3 every morning', true],
  ['Koch', 'Köchin', 'a cook', [1, 1, 1], 'in einem kleinen Restaurant', 'in a small restaurant', true],
  ['Kellner', 'Kellnerin', 'a waiter', [0.8, 1, 1], 'in einem Café am Platz', 'in a café on the square', true],
  ['Verkäufer', 'Verkäuferin', 'a shop assistant', [1, 1, 1], 'in einem Schuhladen', 'in a shoe shop', true],
  ['Elektriker', 'Elektrikerin', 'an electrician', [0.7, 1, 1], 'und baue gerade viele Solaranlagen auf Dächer', 'and these days I put a lot of solar panels on roofs', true],
  ['Tischler', 'Tischlerin', 'a carpenter', [0.8, 1, 0.8], 'in einer kleinen Werkstatt', 'in a small workshop', true],
  ['Bauarbeiter', 'Bauarbeiterin', 'a construction worker', [1.3, 1.1, 0.7], 'auf der großen Baustelle am Bahnhof', 'on the big building site by the station', true],
  ['Mechaniker', 'Mechanikerin', 'a mechanic', [1, 1, 0.8], 'in einer Autowerkstatt', 'in a car repair shop', true],
  ['Softwareentwickler', 'Softwareentwicklerin', 'a software developer', [0.2, 0.6, 1.4], 'meistens von zu Hause aus', 'mostly from home', true],
  ['Ingenieur', 'Ingenieurin', 'an engineer', [0.4, 0.8, 1.1], 'bei einer Firma, die Brücken baut', 'at a company that builds bridges', false],
  ['Arzt', 'Ärztin', 'a doctor', [0.5, 0.7, 0.8], 'in einer Praxis um die Ecke', 'at a practice around the corner', false],
  ['Apotheker', 'Apothekerin', 'a pharmacist', [0.3, 0.6, 0.7], 'in der Apotheke am Markt', 'at the pharmacy by the market', true],
  ['Buchhalter', 'Buchhalterin', 'an accountant', [0.4, 0.8, 1], 'in einem Büro im Zentrum', 'in an office downtown', true],
  ['Architekt', 'Architektin', 'an architect', [0.2, 0.5, 0.7], 'und plane gerade eine Schule', 'and I am designing a school right now', false],
  ['Grafikdesigner', 'Grafikdesignerin', 'a graphic designer', [0.2, 0.6, 0.9], 'für kleine Firmen', 'for small businesses', true],
  ['Fotograf', 'Fotografin', 'a photographer', [0.3, 0.6, 0.7], 'vor allem auf Hochzeiten', 'mostly at weddings', true],
  ['Friseur', 'Friseurin', 'a hairdresser', [1, 1, 0.9], 'im Salon meiner Tante', 'in my aunt’s salon', true],
  ['Händler', 'Händlerin', 'a market trader', [1.7, 0.9, 0.3], 'und verkaufe Obst und Gemüse auf dem Markt', 'selling fruit and vegetables at the market', false],
  ['Bauer', 'Bäuerin', 'a farmer', [1.8, 0.8, 0.3], 'draußen vor der Stadt', 'just outside the city', false],
  ['Kurier', 'Kurierin', 'a courier', [0.8, 1, 1], 'mit dem Fahrrad', 'on my bike', false],
  ['Sozialarbeiter', 'Sozialarbeiterin', 'a social worker', [0.3, 0.7, 1], 'in einem Jugendzentrum', 'at a youth centre', false],
  ['Erzieher', 'Erzieherin', 'a nursery teacher', [0.6, 0.9, 1], 'in einer Kita', 'at a daycare centre', true],
  ['Musiker', 'Musikerin', 'a musician', [0.6, 0.7, 0.7], 'und spiele abends in Bars', 'and I play in bars at night', false],
  ['Schneider', 'Schneiderin', 'a tailor', [1.4, 0.8, 0.3], 'mit eigener kleiner Werkstatt', 'with my own little workshop', true],
  ['Fabrikarbeiter', 'Fabrikarbeiterin', 'a factory worker', [1.2, 1.2, 0.6], 'am Fließband', 'on the assembly line', false],
  ['Lagerarbeiter', 'Lagerarbeiterin', 'a warehouse worker', [0.8, 1, 1], 'bei einem großen Versandhändler', 'for a big online retailer', true],
  ['Kassierer', 'Kassiererin', 'a cashier', [1, 1, 1], 'im Supermarkt gegenüber', 'at the supermarket across the street', true],
  ['Journalist', 'Journalistin', 'a journalist', [0.3, 0.6, 0.7], 'bei der Lokalzeitung', 'for the local paper', false],
];
const FAECHER = [['Medizin', 'medicine'], ['Informatik', 'computer science'], ['Jura', 'law'], ['BWL', 'business'], ['Architektur', 'architecture'], ['Lehramt', 'teaching'], ['Maschinenbau', 'mechanical engineering'], ['Psychologie', 'psychology'], ['Biologie', 'biology'], ['Kunst', 'art'], ['Musik', 'music'], ['Wirtschaft', 'economics'], ['Physik', 'physics'], ['Pflege', 'nursing']];
const HOBBYS = [['spiele ich Gitarre', 'play guitar'], ['koche ich für Freunde', 'cook for friends'], ['male ich', 'paint'], ['gehe ich klettern', 'go climbing'], ['spiele ich Schach im Park', 'play chess in the park'], ['tanze ich Salsa', 'dance salsa'], ['repariere ich alte Fahrräder', 'fix up old bikes'], ['fotografiere ich die Stadt', 'take photos of the city'], ['lese ich Krimis', 'read crime novels'], ['ziehe ich Tomaten auf dem Balkon', 'grow tomatoes on my balcony'], ['schaue ich mit Freunden Fußball', 'watch football with friends'], ['programmiere ich kleine Spiele', 'code little games'], ['laufe ich Halbmarathon', 'run half marathons'], ['singe ich im Chor', 'sing in a choir'], ['backe ich Brot', 'bake bread'], ['lerne ich Japanisch', 'learn Japanese'], ['gehe ich angeln', 'go fishing'], ['spiele ich Basketball', 'play basketball'], ['mache ich Yoga', 'do yoga'], ['schreibe ich Gedichte', 'write poems'], ['baue ich Modellflugzeuge', 'build model planes'], ['spiele ich Theater', 'act in a small theatre group']];
const REISEN = [['Japan', 'Japan'], ['Italien', 'Italy'], ['Brasilien', 'Brazil'], ['Marokko', 'Morocco'], ['Kanada', 'Canada'], ['Thailand', 'Thailand'], ['Island', 'Iceland'], ['Ägypten', 'Egypt'], ['Mexiko', 'Mexico'], ['Neuseeland', 'New Zealand'], ['Peru', 'Peru'], ['Vietnam', 'Vietnam']];
const HUNDE = ['Bello', 'Luna', 'Rocky', 'Mila', 'Simba', 'Nala', 'Charlie', 'Kiwi', 'Pepe', 'Lola'];

// Sorgen, die zur Lage des Landes passen: Schlüssel, Gegenstand nach "um" (deutsch), nach "about" (englisch), Sätze
const SORGEN = {
  preise: ['die Preise', 'prices', [['Alles wird teurer, der Einkauf kostet fast doppelt so viel wie früher.', 'Everything keeps getting more expensive, groceries cost almost twice as much as they used to.'], ['Mein Lohn steigt langsamer als die Preise.', 'My wages rise slower than prices.']]],
  mieten: ['die Mieten', 'rents', [['Die Mieten hier sind verrückt, ich suche seit einem Jahr eine größere Wohnung.', 'Rents here are crazy, I have been looking for a bigger flat for a year.'], ['Für meine kleine Wohnung zahle ich die Hälfte meines Lohns.', 'Half my wages go on rent for my small flat.', 'erw']]],
  arbeit: ['Arbeitsplätze', 'jobs', [['Gute Arbeit zu finden ist schwer, viele meiner Freunde suchen noch.', 'Finding a good job is hard, many of my friends are still looking.'], ['Ich habe 2 Jobs, sonst reicht das Geld nicht.', 'I have 2 jobs, otherwise the money is not enough.', 'erw']]],
  rente: ['die Renten', 'pensions', [['Ich frage mich, ob meine Rente später reicht.', 'I wonder if my pension will be enough one day.', 'vorRente'], ['Meine Rente reicht gerade so, zum Glück hilft meine Familie.', 'My pension barely covers it, luckily my family helps.', 'rentner']]],
  klima: ['das Klima', 'the climate', [['Die Sommer werden jedes Jahr heißer, das merkt man richtig.', 'Summers get hotter every year, you can really feel it.'], ['Bei uns regnet es entweder gar nicht oder viel zu viel.', 'Here it either does not rain at all or far too much.']]],
  gesundheit: ['die Krankenhäuser', 'hospitals', [['Auf einen Termin beim Facharzt wartet man ewig.', 'You wait forever for an appointment with a specialist.']]],
  schule: ['die Schulen', 'schools', [['In den Schulen fehlen Lehrer, die Klassen sind riesig.', 'Schools are short of teachers, the classes are huge.']]],
  jugend: ['die jungen Leute', 'young people', [['So viele junge Leute gehen ins Ausland, mein Bruder arbeitet auch woanders und schickt Geld nach Hause.', 'So many young people move abroad, my brother works elsewhere too and sends money home.']]],
  energie: ['die Energiepreise', 'energy prices', [['Die Stromrechnung ist im Winter echt hart.', 'The electricity bill is really tough in winter.']]],
  verkehr: ['den Verkehr', 'traffic', [['Morgens stehe ich jeden Tag im Stau.', 'I am stuck in traffic every morning.']]],
};

// Jugendliche unter 18: dieselben Sorgen, aus ihrer Sicht
const KIND_SORGEN = { preise: ['Meine Eltern sagen, alles wird teurer.', 'My parents say everything keeps getting more expensive.'], mieten: ['Meine Eltern suchen eine größere Wohnung, aber alles ist so teuer.', 'My parents are looking for a bigger flat, but everything is so expensive.'],
  arbeit: ['Mein großer Bruder sucht seit Monaten Arbeit.', 'My big brother has been looking for work for months.'], rente: ['Meine Oma sagt, ihre Rente reicht gerade so.', 'My grandma says her pension barely covers it.'], klima: ['In der Schule machen wir viel zum Klimaschutz.', 'At school we do a lot for the climate.'],
  gesundheit: ['Meine Oma wartet ewig auf einen Termin beim Arzt.', 'My grandma waits forever for a doctor’s appointment.'], schule: ['In meiner Schule fehlen Lehrer, manche Stunden fallen aus.', 'My school is short of teachers, some lessons get cancelled.'], jugend: ['Viele aus meiner Klasse wollen später ins Ausland.', 'Lots of people in my class want to move abroad later.'],
  energie: ['Zu Hause sollen wir immer das Licht ausmachen, Strom ist teuer.', 'At home we always have to switch off the lights, electricity is expensive.'], verkehr: ['Mit dem Bus brauche ich ewig zur Schule.', 'The bus to school takes forever.'] };

function sorgeWahl(R, c, g, alter, kinder) {
  const reich = c?.gdppc || 8000, arm = g?.poverty ?? 0.2, urban = c?.urban ?? 0.5, med = g?.median ?? 30, mig = g?.netMig ?? 0;
  if (alter < 18) return wahl(R, [['schule', 2], ['klima', 1.8], ['preise', 1], ['verkehr', urban > 0.6 ? 1 : 0.3], ['jugend', mig < -1 ? 1.5 : 0.2], ['arbeit', reich < 8000 ? 1 : 0.3], ['energie', 0.4], ['mieten', 0.3]]);   // Jugendliche: Schule und Klima zuerst
  return wahl(R, [['preise', 2 + (arm > 0.2 ? 1 : 0)], ['mieten', urban > 0.6 && reich > 12000 ? 2.4 : 0.3], ['arbeit', reich < 8000 || arm > 0.25 ? 2.2 : 0.4], ['rente', (med > 40 ? 1.6 : 0.4) + (alter > 50 ? 1 : 0)],
    ['klima', 1], ['gesundheit', 0.8], ['schule', kinder ? 1.6 : 0.3], ['jugend', mig < -1 ? 2 : 0], ['energie', c?.cont === 'Europe' ? 1 : 0.2], ['verkehr', urban > 0.7 ? 0.8 : 0.2]]);
}

// Gesprochenes Englisch: Kurzformen mit typografischem Apostroph
const KURZ = [[/\bI am\b/g, 'I’m'], [/\bI will\b/g, 'I’ll'], [/\bI have (been|lived)\b/g, 'I’ve $1'], [/\bwe have been\b/g, 'we’ve been'], [/\bI would\b/g, 'I’d'], [/\bI’d not\b/g, 'I wouldn’t'], [/\bdo not\b/g, 'don’t'], [/\bdoes not\b/g, 'doesn’t'], [/\bis not\b/g, 'isn’t'], [/\bLet us\b/g, 'Let’s'], [/\bIt is\b/g, 'It’s'], [/\bThere is\b/g, 'There’s'], [/\bThat is\b/g, 'That’s'], [/\bthat is\b/g, 'that’s']];
const kurzform = t => KURZ.reduce((a, [re, z]) => a.replace(re, z), t);

// Die eigentliche Geschichte. look: { frau, alter, migrant, herkunft (iso2) }, iso2: Land des Ortes, ort: Name des Ortes, typ: Art der Figur in der Menge,
// partnerName: Name der Begleitung, gruppe: steht in einer Gruppe, live: { demo, sturm } aus dem Weltgeschehen, datum: heute (Date), en: Sprache erzwingen
export function geschichte({ seed = 1, look = {}, iso2 = 'DE', ort = '', typ = 'einzeln', partnerName = null, gruppe = false, hund = false, live = null, datum = new Date(), en = istEN } = {}) {
  let g = null;
  for (let v = 0; v < 8; v++) { g = bauen(seed + v * 7919, { look, iso2, ort, typ, partnerName, gruppe, hund, live, datum, en }); if (!GENUTZT.has(g.schluessel)) break; }
  GENUTZT.add(g.schluessel);
  return { name: g.name, alter: g.alter, frau: g.frau, text: g.text, kopf: `${g.name}, ${g.alter}` };
}

function bauen(seed, { look, iso2, ort, typ, partnerName, gruppe, hund, live, datum, en }) {
  const R = zufall(seed * 2654435761 + 12345), S = (de, e) => en ? e : de;
  if (iso2 === 'VA') iso2 = 'IT';   // im Vatikan sind die Menschen auf der Straße Römer und Besucher
  const c = DB?.iso2.get(iso2) || null, gl = c ? DB.g?.[c.iso3] : null;
  let herk = look.migrant && look.herkunft && look.herkunft !== iso2 ? DB?.iso2.get(look.herkunft) || null : null;
  if (herk && c && (DB.konflikte || []).some(k => (k.a === c.iso3 && k.b === herk.iso3) || (k.b === c.iso3 && k.a === herk.iso3))) herk = null;   // Herkunft aus einem Land, mit dem Krieg ist: erzählt wie Einheimische, ohne aufgeladene Sätze
  const frau = look.frau ?? R() < 0.5;
  const alter = Math.round(kl((look.alter ?? (22 + R() * 40)) + (R() - 0.5) * 3, 13, 92));
  // Name: Eingewanderte meist mit einem Namen aus dem Herkunftsland
  const gruppeN = (herk && R() < 0.85 ? herk.names : c?.names) || 'en_us', NG = NAMEN?.groups?.[gruppeN] || NAMEN?.groups?.en_us;
  const name = NG ? eins(R, frau ? NG.female : NG.male) : (frau ? 'Anna' : 'Max');
  const reich = c?.gdppc || 8000, stufe = reich < 6000 ? 0 : reich < 25000 ? 1 : 2;
  const streng = c?.gov === 'theocracy' && (c.free ?? 50) < 10;   // sehr strenge Regeln (Afghanistan): keine Musik und Tanz in der Freizeit, Frauen nur in wenigen Berufen, Mädchen ab 12 nicht in der Schule
  const FRAU_STRENG = new Set(['a nurse', 'a doctor', 'a tailor', 'a teacher', 'a farmer']), HOBBY_STRENG = /Gitarre|Salsa|Chor|Theater|Gedichte|Basketball|Yoga/;
  const teile = [];
  // Gruß
  const grussG = herk && R() < 0.5 ? herk.names : c?.names, grussL = herk && grussG === herk.names ? herk.iso2 : iso2; teile.push(eins(R, GRUSS_LAND[grussL] || GRUSS[grussG] || GRUSS[c?.names] || ['Hello!']));
  const nTeile = teile.length;   // danach ein Einstieg je nach Tätigkeit, falls einer kommt
  if (typ === 'jogger' && streng && frau) teile.push(S('Ich bin gerade auf dem Weg nach Hause.', 'I am just on my way home.'));
  else if (typ === 'jogger') teile.push(alter > 64 ? S('Ich laufe jeden Tag meine Runde, das hält jung.', 'I run my lap every day, it keeps me young.') : eins(R, [S('Puh, kurz Pause.', 'Phew, quick break.'), S('Gerade 8 Kilometer gelaufen.', 'Just ran 8 kilometres.')]));
  else if (typ === 'handy' && R() < 0.7) teile.push(S('Moment, ich rufe gleich zurück. So.', 'Hang on, I will call you back. Okay.'));
  else if (gruppe && R() < 0.6) teile.push(S('Wir treffen uns hier oft nach der Arbeit.', 'We often meet here after work.'));
  const iEin = teile.length > nTeile ? nTeile : -1;
  // Wer bin ich: Schule, Studium, Ausbildung, Beruf, Rente
  let beruf = null, rolleKey = '';
  if (alter < 18 && streng && frau && alter >= 12) { teile.push(S('Ich lerne zu Hause, meine Mutter bringt mir viel bei.', 'I study at home, my mother teaches me a lot.')); rolleKey = 'zuhause'; }
  else if (alter < 18) {
    const k = kl(alter - 6, 5, 12), tr = eins(R, [['Ärztin werden', 'Arzt werden', 'become a doctor'], ['Spiele entwickeln', 'Spiele entwickeln', 'make video games'], ['Profi im Fußball werden', 'Profi im Fußball werden', 'play football professionally'], ['die Welt bereisen', 'die Welt bereisen', 'travel the world'], ['ein eigenes Café aufmachen', 'ein eigenes Café aufmachen', 'open my own café'], ['Pilotin werden', 'Pilot werden', 'become a pilot'], ['Musik machen', 'Musik machen', 'make music']]);
    teile.push(S(`Ich gehe in die ${k}. Klasse und will später ${frau ? tr[0] : tr[1]}.`, `I am in grade ${k} and later I want to ${tr[2]}.`)); rolleKey = 'schule' + k + tr[2];
  } else if (alter < 26 && reich > 3000 && !(streng && frau) && R() < 0.55) {
    const f = eins(R, FAECHER); teile.push(S(`Ich studiere ${f[0]}${ort ? ' hier in ' + ort : ''}${R() < 0.5 ? ' und jobbe nebenbei in einem Café' : ''}.`, `I study ${f[1]}${ort ? ' here in ' + ort : ''}${R() < 0.5 ? ' and work part time in a café' : ''}.`)); rolleKey = 'studium' + f[1];
  } else {
    const L = BERUFE.filter(b => (b[2] !== 'a journalist' || (c?.free ?? 50) >= 50) && (!streng || !frau || FRAU_STRENG.has(b[2]))).map(b => [b, b[3][stufe]]); beruf = wahl(R, L); rolleKey = beruf[2];
    if (alter < 22 && beruf[6] && R() < 0.6) teile.push(S(`Ich mache eine Ausbildung ${frau ? 'zur ' + beruf[1] : 'zum ' + beruf[0]}.`, `I am training to be ${beruf[2]}.`));
    else if (alter >= 66) { const n = Math.max(1, alter - 64); teile.push(S(`Früher war ich ${frau ? beruf[1] : beruf[0]}, seit ${n} ${n === 1 ? 'Jahr' : 'Jahren'} bin ich in Rente.`, `I used to be ${beruf[2]}, I have been retired for ${n} ${n === 1 ? 'year' : 'years'}.`)); }
    else teile.push(S(`Ich arbeite als ${frau ? beruf[1] : beruf[0]} ${beruf[4]}.`, `I work as ${beruf[2]} ${beruf[5]}.`));
  }
  // Etwas Persönliches: Familie, Herkunft, Hobby, Pläne, der Ort, ein Tier, der Moment
  let kinder = false; const det = [];
  if (partnerName) { const n = kl(Math.round((alter - 18) / 3 + R() * 4), 1, 50); det.push(['partner', 5, () => S(`Das ist ${partnerName}, wir sind seit ${n} ${n === 1 ? 'Jahr' : 'Jahren'} zusammen.`, `This is ${partnerName}, we have been together for ${n} ${n === 1 ? 'year' : 'years'}.`)]); }
  if (herk) { const n = kl(Math.round(R() * (alter - 16)), 1, 60), sp = herk.langDe && herk.langDe !== c?.langDe; det.push(['herkunft', 5, () => eins(R, [
    S(`Ich bin vor ${n} ${n === 1 ? 'Jahr' : 'Jahren'} aus ${landDat(herk)} hergekommen.`, `I came here from ${landEn(herk)} ${n} ${n === 1 ? 'year' : 'years'} ago.`),
    S(`Meine Eltern kommen aus ${landDat(herk)}, ich bin hier aufgewachsen.`, `My parents are from ${landEn(herk)}, I grew up here.`)]) + (sp && R() < 0.6 ? ' ' + S(`Zu Hause sprechen wir noch ${herk.langDe}.`, `At home we still speak ${herk.langEn}.`) : R() < 0.4 ? ' ' + S('Das Essen von zu Hause vermisse ich am meisten.', 'What I miss most is the food from back home.') : '')]); }
  if (alter >= 28 && alter <= 55 && R() < 0.6) { kinder = true; const k = 1 + Math.floor(R() * 3); det.push(['kinder' + k, 2.2, () => k === 1 ? eins(R, [S('Meine Tochter kommt nächstes Jahr in die Schule.', 'My daughter starts school next year.'), S('Mein Sohn will unbedingt einen Hund.', 'My son really wants a dog.'), S('Meine Tochter lernt gerade Fahrrad fahren.', 'My daughter is just learning to ride a bike.')]) : eins(R, [S(`Ich habe ${k} Kinder, am Wochenende ist bei uns immer Chaos.`, `I have ${k} kids, weekends at our place are always chaos.`), streng ? S(`Ich habe ${k} Kinder, am Wochenende ist bei uns immer Chaos.`, `I have ${k} kids, weekends at our place are always chaos.`) : S(`Meine ${k} Kinder spielen ${k === 2 ? 'beide' : 'alle'} Fußball, ich bin quasi ${frau ? 'Taxifahrerin' : 'Taxifahrer'}.`, `${k === 2 ? 'Both my kids play' : 'All ' + k + ' of my kids play'} football, so I am basically a taxi driver.`)])]); }
  if (alter >= 62) det.push(['enkel', 2, () => { const n = 1 + Math.floor(R() * 5); return S(`Am Wochenende ${n === 1 ? 'kommt mein Enkel' : 'kommen meine ' + n + ' Enkel'} zu Besuch.`, `My ${n === 1 ? 'grandchild visits' : n + ' grandchildren visit'} on weekends.`); }]);
  if (alter >= 18 && alter <= 30) det.push(['jung', 1.2, () => eins(R, [S('Ich wohne noch bei meinen Eltern, eine eigene Wohnung ist zu teuer.', 'I still live with my parents, my own place is too expensive.'), S('Ich bin gerade erst hergezogen und kenne noch kaum jemanden.', 'I just moved here and hardly know anyone yet.')])]);
  det.push(['hobby', 2, () => { const h = eins(R, streng ? HOBBYS.filter(x => !HOBBY_STRENG.test(x[0])) : HOBBYS); return S(`In meiner Freizeit ${h[0]}.`, `In my free time I ${h[1]}.`); }]);
  if (alter >= 18) det.push(['sparen', 1.2, () => { const r = eins(R, REISEN.filter(x => x[1] !== c?.en)), z = eins(R, [['eine eigene Wohnung', 'my own flat'], ['ein Motorrad', 'a motorbike'], [`eine Reise nach ${r[0]}`, `a trip to ${r[1]}`], ['meinen eigenen Laden', 'my own shop'], ['ein Auto', 'a car'], [`eine Reise nach ${r[0]}`, `a trip to ${r[1]}`]]); return S(`Ich spare gerade für ${z[0]}.`, `I am saving up for ${z[1]}.`); }]);
  det.push(['ort', 1, () => { const n = kl(Math.round(3 + R() * Math.min(alter - 5, 32)), 2, 35); return ort ? S(`Ich wohne seit ${n} Jahren in ${ort} und will hier nie wieder weg.`, `I have lived in ${ort} for ${n} years and never want to leave.`) : S(`Ich wohne seit ${n} Jahren hier und kenne jede Ecke.`, `I have lived here for ${n} years and know every corner.`); }]);
  if (hund) { const h = eins(R, HUNDE); det.push(['hund', 7, () => eins(R, [S(`Das ist mein Hund ${h}, wir gehen jeden Tag zweimal raus.`, `This is my dog ${h}, we go out twice a day.`), S(`Das ist ${h}. Eigentlich führt ${h} mich spazieren, nicht umgekehrt.`, `This is ${h}. Honestly, ${h} walks me, not the other way round.`)])]); }   // führt einen Hund an der Leine (kit/tiere.js)
  else if (!streng) det.push(['tier', 0.8, () => S(`Zu Hause wartet mein Hund ${eins(R, HUNDE)}.`, `My dog ${eins(R, HUNDE)} is waiting for me at home.`)]);
  if (alter >= 20 && alter <= 45 && !beruf) det.push(['termin', 0.8, () => S('Ich bin auf dem Weg zu einem Vorstellungsgespräch, drück mir die Daumen!', 'I am on my way to a job interview, wish me luck!')]);
  det.push(['moment', 0.6, () => eins(R, [S('Heute ist mein Geburtstag, heute Abend feiern wir.', 'It is my birthday today, we are celebrating tonight.'), S('Ich suche ein Geschenk für meine Mutter, hast du eine Idee?', 'I am looking for a present for my mother, any ideas?')])]);
  const d1 = wahl(R, det.map(d => [d, d[1]])); teile.push(d1[2]());
  let detailKey = d1[0];
  // Die Lage im Land
  const sorge = sorgeWahl(R, c, gl, alter, kinder), So = SORGEN[sorge];
  const pol = politik(R, { c, gl, sorge: So, sk: sorge, live, datum, en, alter });
  const iPol2 = pol.saetze.length > 1 ? teile.length + 1 : -1; teile.push(...pol.saetze);
  // zum Schluss
  if (typ === 'jogger' && !(streng && frau)) teile.push(S('So, weiter geht es, sonst werde ich kalt!', 'Right, back to it before I cool down!'));
  else if (R() < 0.5) teile.push(eins(R, [S('Schönen Tag noch!', 'Have a nice day!'), ort ? S(`Viel Spaß in ${ort}!`, `Enjoy ${ort}!`) : S('Viel Spaß hier!', 'Enjoy your time here!'), S('Pass auf dich auf!', 'Take care!'), S('War nett, dich kennenzulernen!', 'Nice to meet you!')]));
  // Länge: höchstens rund 320 Zeichen (Sprechblase). Zuerst fällt der Schluss, dann der zweite Satz zur Lage, dann der Einstieg (Joggen, Telefon, Gruppe)
  const iSchluss = teile.length - 1, hatSchluss = teile[iSchluss] !== pol.saetze[pol.saetze.length - 1];
  const weg = new Set(), laenge = () => teile.filter((_, i) => !weg.has(i)).join(' ').length;
  if (laenge() > 320 && hatSchluss) weg.add(iSchluss);
  if (laenge() > 320 && iPol2 > 0) weg.add(iPol2);
  if (laenge() > 320 && iEin > 0) weg.add(iEin);
  let text = teile.filter((_, i) => !weg.has(i)).join(' ');
  if (en) text = kurzform(text);
  return { name, alter, frau, text, schluessel: `${name}|${alter}|${rolleKey}|${detailKey}|${pol.key}` };
}

// Ein oder zwei Sätze zur Lage: Wahl, Regierung, Sorge, Staatsform, Bündnis, Konflikt, Spannung, heute in der Stadt
function politik(R, { c, gl, sorge: So, sk, live, datum, en, alter }) {
  const S = (de, e) => en ? e : de, um = So[0], about = So[1], kind = alter < 18;
  const sorgeSatz = () => { if (kind) return S(...(KIND_SORGEN[sk] || KIND_SORGEN.klima)); const L = So[2].filter(x => !x[2] || (x[2] === 'erw' && alter >= 18 && alter < 66) || (x[2] === 'rentner' && alter >= 62) || (x[2] === 'vorRente' && alter < 62)); const z = eins(R, L.length ? L : So[2]); return S(z[0], z[1]); };
  if (!c) return { key: 'sorge', saetze: [sorgeSatz()] };
  const frei = c.free ?? 50, gov = c.gov || 'parl_rep';
  const offen = ['parl_rep', 'pres_rep', 'const_mon', 'semi_pres'].includes(gov) && frei >= 50, vorsichtig = frei < 30 || (['one_party', 'abs_mon', 'military', 'theocracy'].includes(gov) && frei < 40);
  const haltung = offen ? wahl(R, [['zufrieden', 1], ['unzufrieden', 1.2], ['gleich', 0.8], ['hoffnung', 0.9]]) : vorsichtig ? wahl(R, [['vorsicht', 2], ['gleich', 1], ['hoffnung', 0.6]]) : wahl(R, [['zufrieden', 1], ['unzufrieden', 0.6], ['gleich', 1], ['vorsicht', 0.8], ['hoffnung', 0.8]]);
  // Wahl: genaues Datum (gerade vorbei oder bald) oder nur das Jahr
  let w = null; const ne = String(c.nextElection || '');
  if (ne && (offen || (!vorsichtig && frei >= 35))) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(ne)) { const t = new Date(ne + 'T12:00:00Z'), tage = (t - datum) / 86400000, dat = S(`${t.getUTCDate()}. ${MONAT[t.getUTCMonth()]}`, `${MONTH[t.getUTCMonth()]} ${t.getUTCDate()}`);
      if (tage < 0 && tage > -75) w = { art: 'vorbei', s: S(`Die Wahl am ${dat} ist gerade vorbei.`, `The election on ${dat} just took place.`) };
      else if (tage >= 0 && tage < 150) w = { art: 'bald', s: S(`Am ${dat} wird gewählt.`, `There is an election on ${dat}.`) };
      else if (tage >= 150) w = { art: 'jahr', jahr: t.getUTCFullYear(), s: S(`Die nächste Wahl ist ${t.getUTCFullYear()}.`, `The next election is in ${t.getUTCFullYear()}.`) }; }
    else if (/^\d{4}$/.test(ne)) { const y = +ne, jetzt = datum.getUTCFullYear(); if (y > jetzt) w = { art: 'jahr', jahr: y, s: S(`Die nächste Wahl ist ${y}.`, `The next election is in ${y}.`) }; else if (y === jetzt) w = { art: 'bald', s: S(`Die Wahl ${y} ist überall Thema.`, `The ${y} election is the talk of the town.`) }; }
  }
  const WAHL = {
    vorbei: { zufrieden: S('Jetzt bin ich gespannt, ob sie halten, was sie versprochen haben.', 'Now I am curious whether they keep their promises.'), unzufrieden: S(`Ich hoffe, die Gewählten kümmern sich endlich um ${um}.`, `I hope the winners finally do something about ${about}.`), gleich: S('Ich bin froh, dass die Plakate wieder weg sind.', 'I am glad the posters are gone again.'), hoffnung: S(`Jetzt hoffe ich, dass sie sich wirklich um ${um} kümmern.`, `Now I hope they really do something about ${about}.`), vorsicht: S('Mal sehen, was sich jetzt ändert.', 'Let us see what changes now.') },
    bald: { zufrieden: S('Ich gehe auf jeden Fall hin, Wählen ist mir wichtig.', 'I am definitely going, voting matters to me.'), unzufrieden: S(`Ich gehe hin, auch wenn mich keiner richtig überzeugt. Hauptsache, jemand kümmert sich um ${um}.`, `I will go, even if nobody really convinces me. As long as someone does something about ${about}.`), gleich: S('Ich weiß noch nicht mal, ob ich hingehe.', 'I do not even know if I will go.'), hoffnung: S(`Ich gehe wählen und hoffe, dass sich danach jemand um ${um} kümmert.`, `I will vote and hope someone does something about ${about} afterwards.`), vorsicht: S('Ich gehe wählen, mehr sage ich dazu nicht.', 'I will vote, that is all I will say.') },
    jahr: { zufrieden: S('Bis dahin dürfen sie ruhig so weitermachen.', 'Until then they can carry on like this.'), unzufrieden: S(`Bis dahin sollten sie sich dringend um ${um} kümmern.`, `Until then they urgently need to do something about ${about}.`), gleich: S('Bis dahin hat man eh wieder alles vergessen.', 'By then everyone will have forgotten everything anyway.'), hoffnung: S(`Ich hoffe, bis dahin kümmern sie sich um ${um}.`, `I hope they do something about ${about} by then.`), vorsicht: S('Bis dahin ist noch viel Zeit.', 'That is still a long way off.') },
  };
  const REG = {
    zufrieden: [S('Viele meckern über die Regierung, ich finde, sie macht das ganz ordentlich.', 'Lots of people grumble about the government, but I think it is doing a decent job.'), S('Ich finde, die Regierung macht gerade vieles richtig.', 'I think the government is getting a lot right at the moment.')],
    unzufrieden: [S(`Mit der Regierung bin ich nicht zufrieden, um ${um} kümmert sich kaum jemand.`, `I am not happy with the government, hardly anyone does anything about ${about}.`), S(`Die Regierung redet viel, aber um ${um} kümmert sie sich zu wenig.`, `The government talks a lot, but it does not do enough about ${about}.`)],
    gleich: [S('Politik interessiert mich ehrlich gesagt kaum, ich habe genug mit meinem Alltag zu tun.', 'Honestly, politics hardly interests me, I have enough on my plate.'), S('Nachrichten schaue ich kaum noch, das macht nur schlechte Laune.', 'I hardly watch the news anymore, it only puts me in a bad mood.')],
    hoffnung: [S(`Ich hoffe, die Regierung kümmert sich bald um ${um}.`, `I hope the government does something about ${about} soon.`)],
    vorsicht: [S('Über Politik rede ich nicht so gern mit Fremden. Lass uns lieber über Fußball reden.', 'I would rather not talk politics with strangers. Let us talk football instead.'), S('Politik überlasse ich anderen, ich kümmere mich um meine Familie.', 'I leave politics to others, I take care of my family.'), S('Über Politik spricht man hier lieber zu Hause als auf der Straße.', 'People here prefer to talk politics at home rather than in the street.')],
  };
  // Staatsform, wo sie den Alltag prägt
  const herrscher = { King: ['der König', 'the King'], Sultan: ['der Sultan', 'the Sultan'], Emir: ['der Emir', 'the Emir'] }[c.head];
  let form = null;
  if (gov === 'const_mon') form = c.iso2 === 'JP' ? S('Das Kaiserhaus mögen hier viele, regiert wird aber vom Parlament.', 'Many people here like the imperial family, but parliament runs the country.')
    : (c.allies || []).includes('CW') && c.iso2 !== 'GB' ? S('Offiziell ist der britische König auch unser Staatsoberhaupt, im Alltag merkt man davon wenig.', 'Officially the British King is our head of state too, but you hardly notice it in daily life.')
    : S('Das Königshaus mögen hier viele, regiert wird aber vom Parlament.', 'Many people here like the royal family, but parliament runs the country.');
  else if (gov === 'semi_mon') form = S('Das Königshaus hat bei uns noch viel zu sagen, das Parlament etwas weniger.', 'The royal family still has a big say here, parliament a bit less.');
  else if (gov === 'abs_mon') form = S(`Bei uns entscheidet ${herrscher ? herrscher[0] : 'das Königshaus'}. Vielen ist das recht, manche Junge wünschen sich mehr Mitsprache.`, `Here ${herrscher ? herrscher[1] : 'the royal family'} decides. Many are fine with that, some young people would like more say.`);
  else if (gov === 'one_party') form = S('Hier regiert seit Jahrzehnten dieselbe Partei. Ich kümmere mich lieber um meine Arbeit.', 'The same party has governed here for decades. I would rather focus on my work.');
  else if (gov === 'military') form = S('Seit die Armee regiert, warten viele darauf, dass wieder gewählt wird.', 'Since the army took over, many people are waiting for elections again.');
  else if (gov === 'transition') form = S('Das Land ist im Umbruch, alle warten gespannt, wie es weitergeht.', 'The country is in transition, everyone is waiting to see what happens next.');
  else if (gov === 'theocracy') form = S('Religion und Staat sind hier eng verbunden, darüber denkt jeder anders.', 'Religion and state are closely linked here, and everyone sees that differently.');
  else if (gov === 'auth_rep' && frei < 40) form = S('Die Regierung ist hier schon sehr lange im Amt.', 'The same leadership has been in power here for a very long time.');
  // Bündnisse
  const A = c.allies || []; let bund = null;
  if (A.includes('EU')) bund = haltung === 'unzufrieden' ? (A.includes('EURO') ? S('Manchmal entscheidet Brüssel mir zu viel, aber den Euro will ich nicht mehr hergeben.', 'Sometimes Brussels decides too much for my taste, but I would not give up the euro.') : S('Manchmal entscheidet Brüssel mir zu viel.', 'Sometimes Brussels decides too much for my taste.'))
    : A.includes('SCHENGEN') ? S('Ich finde es super, dass ich ohne Grenzkontrollen durch halb Europa reisen kann.', 'I love that I can travel through half of Europe without border checks.') : S('Mit dem Zug bin ich schnell in einem anderen Land, das mag ich an Europa.', 'By train I am quickly in another country, that is what I like about Europe.');
  else if (A.includes('ASEAN')) bund = S('Ich mag, dass man in Südostasien so leicht in die Nachbarländer reisen kann.', 'I like how easy it is to travel to neighbouring countries in Southeast Asia.');
  else if (A.includes('MERCOSUR')) bund = S('Viele Waren hier kommen aus den Nachbarländern, der Handel in Südamerika ist wichtig für uns.', 'Lots of goods here come from neighbouring countries, trade in South America matters to us.');
  else if (A.includes('GCC')) bund = S('Am Wochenende fahren wir manchmal in die Nachbarländer am Golf, das geht ganz einfach.', 'At weekends we sometimes drive to the neighbouring Gulf states, it is really easy.');
  else if (A.includes('AU')) bund = S('Ich hoffe, Afrika arbeitet noch enger zusammen, dann wird der Handel zwischen unseren Ländern leichter.', 'I hope Africa works together even more closely, that would make trade between our countries easier.');
  // Konflikt (nur der Wunsch nach Frieden, keine Gewalt) und Spannungen mit einem anderen Land
  const krieg = (DB.konflikte || []).some(k => k.a === c.iso3 || k.b === c.iso3);
  const gegner = new Set((DB.konflikte || []).flatMap(k => k.a === c.iso3 ? [k.b] : k.b === c.iso3 ? [k.a] : []));
  const span = (DB.beziehungen || []).filter(b => (b[0] === c.iso3 || b[1] === c.iso3) && b[2] <= -40).map(b => DB.iso3.get(b[0] === c.iso3 ? b[1] : b[0])).filter(o => o && !gegner.has(o.iso3));   // mit Kriegsgegnern keine "Spannungen", dort nur der Wunsch nach Frieden
  // Auswahl: ein Thema, manchmal ein zweites kurzes
  const themen = [];
  if (live?.demo) themen.push(['demo', 4, () => eins(R, [S('Heute ist eine Demo in der Stadt. Ich überlege noch, ob ich hingehe.', 'There is a demonstration in town today. I am still thinking about going.'), S('Heute ist eine Demo, deshalb fahren die Busse anders.', 'There is a demonstration today, so the buses are running differently.')])]);
  if (live?.sturm) themen.push(['sturm', 3, () => S('Heute soll ein Sturm kommen, ich will schnell nach Hause.', 'A storm is supposed to hit today, I want to get home quickly.')]);
  if (krieg) themen.push(['frieden', 4, () => eins(R, [S('Ich wünsche mir einfach Frieden, für alle hier.', 'I just wish for peace, for everyone here.'), S('Wie alle hier hoffe ich, dass bald wieder Ruhe einkehrt.', 'Like everyone here, I hope things calm down soon.'), S('Wir versuchen, so normal wie möglich weiterzuleben. Heute koche ich für meine Nachbarn.', 'We try to live as normally as we can. Today I am cooking for my neighbours.')])]);
  if (w && kind) { const y = w.jahr || datum.getUTCFullYear(), erst = y - datum.getUTCFullYear() + alter >= 18; themen.push(['wahl_kind' + erst, 3, () => w.s + ' ' + (erst ? S('Dann darf ich zum ersten Mal wählen!', 'That will be my first time voting!') : S(`Ich darf noch nicht wählen, aber ich würde mich zuerst um ${um} kümmern.`, `I can’t vote yet, but I’d do something about ${about} first.`))]); }
  else if (w) themen.push(['wahl_' + w.art + haltung, 3.2, () => w.s + ' ' + (WAHL[w.art][haltung] || WAHL[w.art].gleich)]);
  if (kind) themen.push(['reg_kind' + haltung, 2, () => haltung === 'vorsicht' ? S('Über Politik reden bei uns nur die Erwachsenen.', 'At home only the grown ups talk politics.') : haltung === 'unzufrieden' || haltung === 'hoffnung' ? S(`Ich wünsche mir, dass sich die Regierung mehr um ${um} kümmert.`, `I wish the government did more about ${about}.`) : S('Politik finde ich ehrlich gesagt noch langweilig.', 'Honestly, I still find politics boring.')]);
  else themen.push(['reg_' + haltung, offen ? 3 : vorsichtig ? 2.6 : 1.6, () => eins(R, REG[haltung] || REG.gleich)]);
  themen.push(['sorge', 2.2, sorgeSatz]);
  if (form) themen.push(['form', vorsichtig ? 1 : 1.6, () => form]);
  if (bund) themen.push(['bund', 1.2, () => bund]);
  if (span.length) { const o = eins(R, span); themen.push(['span' + o.iso2, 0.8, () => S(`Die Spannungen mit ${landDat(o)} sind ständig in den Nachrichten. Ich hoffe, sie reden mehr miteinander.`, `The tensions with ${landEn(o)} are always in the news. I hope they talk to each other more.`)]); }
  const t1 = wahl(R, themen.map(t => [t, t[1]])), saetze = [t1[2]()];
  let key = t1[0];
  if (R() < 0.35) { const rest = themen.filter(t => t !== t1 && t[0] !== 'sorge' && !(t1[0].startsWith('wahl') && t[0].startsWith('reg')) && !(t1[0].startsWith('reg') && t[0].startsWith('wahl'))); if (rest.length) { const t2 = wahl(R, rest.map(t => [t, t[1]])); const s2 = t2[2](); if (saetze[0].length + s2.length < 190) { saetze.push(s2); key += '+' + t2[0]; } } }
  return { key, saetze };
}
