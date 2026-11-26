// Spielstand im Browser (localStorage, nie auf einem Server): Geld, Lage, Figur, Fahrzeug, Reisepass (Länder und Städte), Erfolge, Einstellungen. Fehlt der Speicher (privates Fenster), läuft das Spiel trotzdem.
const SCHLUESSEL = 'earth3d_spielstand_v1';
const NEU = () => ({ v: 1, geld: 250, lage: null, figur: null, fahrzeug: null, lackWert: null, laender: {}, staedte: {}, statistik: { km: 0, auftraege: 0, einnahmen: 0, unfaelle: 0, rekord: {} }, erfolge: {}, einst: { laut: 0.8, empf: 1, grafik: 'auto', zeit: 'schnell', fps: false } });
export function laden() { try { const j = JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null'); if (j && j.v === 1) { const n = NEU(); return { ...n, ...j, statistik: { ...n.statistik, ...j.statistik }, einst: { ...n.einst, ...j.einst } }; } } catch { /* privates Fenster */ } return NEU(); }
export function speichern(s) { try { localStorage.setItem(SCHLUESSEL, JSON.stringify(s)); return true; } catch { return false; } }
export function hatStand() { try { return !!localStorage.getItem(SCHLUESSEL); } catch { return false; } }
export function zuruecksetzen() { try { localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ } }
export const ERFOLGE = [
  { id: 'erste_fahrt', name: 'Erste Fahrt', text: 'Einen Auftrag abgeschlossen', geld: 100, pruef: s => s.statistik.auftraege >= 1 },
  { id: 'taxi_10', name: 'Stadtbekannt', text: '10 Aufträge abgeschlossen', geld: 500, pruef: s => s.statistik.auftraege >= 10 },
  { id: 'km_100', name: 'Vielfahrer', text: '100 km gefahren', geld: 500, pruef: s => s.statistik.km >= 100 },
  { id: 'km_1000', name: 'Weltenbummler', text: '1.000 km gefahren', geld: 2500, pruef: s => s.statistik.km >= 1000 },
  { id: 'land_3', name: 'Reisepass', text: '3 Länder besucht', geld: 300, pruef: s => Object.keys(s.laender).length >= 3 },
  { id: 'land_10', name: 'Weltreisender', text: '10 Länder besucht', geld: 1500, pruef: s => Object.keys(s.laender).length >= 10 },
  { id: 'land_50', name: 'Kosmopolit', text: '50 Länder besucht', geld: 10000, pruef: s => Object.keys(s.laender).length >= 50 },
  { id: 'stadt_10', name: 'Städtereise', text: '10 Städte besucht', geld: 400, pruef: s => Object.keys(s.staedte).length >= 10 },
  { id: 'muenzen_10', name: 'Schatzsucher', text: '10 Münzen gefunden', geld: 250, pruef: s => Object.keys(s.muenzen || {}).length >= 10 },
  { id: 'muenzen_100', name: 'Goldrausch', text: '100 Münzen gefunden', geld: 3000, pruef: s => Object.keys(s.muenzen || {}).length >= 100 },
  { id: 'jet_erst', name: 'Abgehoben', text: 'Zum ersten Mal im Düsenjet', geld: 200, pruef: s => s.statistik.jet >= 1 },
  { id: 'heli_erst', name: 'Rotor frei', text: 'Zum ersten Mal im Hubschrauber', geld: 200, pruef: s => s.statistik.heli >= 1 },
  { id: 'landung_heli', name: 'Sanft aufgesetzt', text: 'Mit dem Hubschrauber gelandet', geld: 300, pruef: s => s.statistik.landungHeli >= 1 },
  { id: 'landung_jet', name: 'Butterweich', text: 'Mit dem Düsenjet gelandet', geld: 800, pruef: s => s.statistik.landungJet >= 1 },
  { id: 'geld_10k', name: 'Gut im Geschäft', text: '10.000 € verdient', geld: 1000, pruef: s => s.statistik.einnahmen >= 10000 },
];
