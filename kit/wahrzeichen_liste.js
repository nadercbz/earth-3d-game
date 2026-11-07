// Wahrzeichen der Welt: Lage (öffentliche Angaben), Richtung (Grad im Uhrzeigersinn von Nord, wohin das Modell nach vorn schaut), Freifläche (dort entfallen die Häuser aus der Karte), Kreise für die Kollision in Modellkoordinaten (x, z, Radius; x nach links, z nach vorn). Nur diese Datei gilt, Worker und Hauptfaden lesen sie.
export const WAHRZEICHEN = [
  { id: 'eiffelturm', name: 'Eiffelturm', lat: 48.85826, lon: 2.2945, kurs: 43.6, frei: 82, kreise: [[52, 52, 15], [-52, 52, 15], [52, -52, 15], [-52, -52, 15]], hoch: 330 },
  { id: 'cheops', name: 'Cheops Pyramide', lat: 29.97917, lon: 31.13417, kurs: 0, frei: 125, kreise: [[0, 0, 130]], hoch: 139 },
  { id: 'chephren', name: 'Chephren Pyramide', lat: 29.97611, lon: 31.13083, kurs: 0, frei: 115, kreise: [[0, 0, 122]], hoch: 136 },
  { id: 'mykerinos', name: 'Mykerinos Pyramide', lat: 29.9725, lon: 31.12778, kurs: 0, frei: 60, kreise: [[0, 0, 58]], hoch: 65 },
  { id: 'sphinx', name: 'Sphinx', lat: 29.97528, lon: 31.1375, kurs: 90, frei: 45, kreise: [[0, 0, 12], [0, -18, 12], [0, 18, 10]], hoch: 22 },
  { id: 'kolosseum', name: 'Kolosseum', lat: 41.89021, lon: 12.49223, kurs: 75, frei: 110, kreise: [[0, 0, 88]], hoch: 49, querachse: true },
  { id: 'parthenon', name: 'Parthenon', lat: 37.97153, lon: 23.72669, kurs: 80, frei: 44, kreise: [[0, 22, 17], [0, 0, 17], [0, -22, 17]], hoch: 18 },
  { id: 'bigben', name: 'Big Ben', lat: 51.50073, lon: -0.12463, kurs: 0, frei: 13, kreise: [[0, 0, 8]], hoch: 96 },
  { id: 'brandenburg', name: 'Brandenburger Tor', lat: 52.51627, lon: 13.37769, kurs: 90, frei: 40, kreise: [[-13.7, 0, 3], [-9, 0, 2.5], [-4.5, 0, 2.5], [4.5, 0, 2.5], [9, 0, 2.5], [13.7, 0, 3], [-24, 0, 8], [24, 0, 8]], hoch: 26 },
  { id: 'freiheit', name: 'Freiheitsstatue', lat: 40.68925, lon: -74.0445, kurs: 145, frei: 80, kreise: [[0, 0, 62]], hoch: 93 },
  { id: 'cristo', name: 'Cristo Redentor', lat: -22.95192, lon: -43.21049, kurs: 110, frei: 14, kreise: [[0, 0, 8]], hoch: 38 },
  { id: 'taj', name: 'Taj Mahal', lat: 27.175, lon: 78.0421, kurs: 180, frei: 72, kreise: [[0, 0, 62]], hoch: 73 },
  { id: 'burj', name: 'Burj Khalifa', lat: 25.1972, lon: 55.2744, kurs: 0, frei: 80, kreise: [[0, 0, 55]], hoch: 828 },
  { id: 'fernsehturm', name: 'Berliner Fernsehturm', lat: 52.52082, lon: 13.40945, kurs: 0, frei: 36, kreise: [[0, 0, 22]], hoch: 368 },
  { id: 'cntower', name: 'CN Tower', lat: 43.64257, lon: -79.38706, kurs: 0, frei: 32, kreise: [[0, 0, 24]], hoch: 553 },
  { id: 'spaceneedle', name: 'Space Needle', lat: 47.62051, lon: -122.3493, kurs: 0, frei: 25, kreise: [[0, 0, 12]], hoch: 184 },
  { id: 'skytree', name: 'Tokyo Skytree', lat: 35.71006, lon: 139.8107, kurs: 0, frei: 48, kreise: [[0, 0, 38]], hoch: 634 },
  { id: 'pisa', name: 'Schiefer Turm von Pisa', lat: 43.72299, lon: 10.39659, kurs: 180, frei: 11, kreise: [[0, 0, 9]], hoch: 56 },
  { id: 'atomium', name: 'Atomium', lat: 50.89495, lon: 4.34153, kurs: 0, frei: 32, kreise: [[0, 0, 16]], hoch: 102 },
  { id: 'oper', name: 'Oper von Sydney', lat: -33.85678, lon: 151.2153, kurs: 30, frei: 100, kreise: [[0, -25, 66], [0, -90, 40]], hoch: 67 },
  { id: 'goldengate', name: 'Golden Gate Bridge', lat: 37.8197, lon: -122.4786, kurs: -8, frei: 0, kreise: [], hoch: 227 },
  { id: 'harbour', name: 'Sydney Harbour Bridge', lat: -33.85215, lon: 151.2101, kurs: 25, frei: 0, kreise: [], hoch: 134 },
  { id: 'towerbridge', name: 'Tower Bridge', lat: 51.50546, lon: -0.07536, kurs: 5, frei: 70, kreise: [], hoch: 72 },
  { id: 'chichen', name: 'Chichén Itzá', lat: 20.68285, lon: -88.56867, kurs: 20, frei: 34, kreise: [[0, 0, 30]], hoch: 30 },
  { id: 'stonehenge', name: 'Stonehenge', lat: 51.17887, lon: -1.8262, kurs: 0, frei: 28, kreise: [], hoch: 7 },
  { id: 'dom', name: 'Kölner Dom', lat: 50.94133, lon: 6.95831, kurs: 270, frei: 88, kreise: [[0, 0, 32], [0, 38, 32], [0, -38, 34], [42, 10, 14], [-42, 10, 14]], hoch: 157 },
  { id: 'arc', name: 'Arc de Triomphe', lat: 48.87378, lon: 2.29504, kurs: 298, frei: 34, kreise: [[-15.4, 0, 10], [15.4, 0, 10]], hoch: 50 },
  { id: 'notredame', name: 'Notre-Dame de Paris', lat: 48.85297, lon: 2.34988, kurs: 280, frei: 75, kreise: [[0, -30, 22], [0, 10, 24], [0, 50, 22]], hoch: 96 },
  { id: 'louvre', name: 'Louvre Pyramide', lat: 48.86099, lon: 2.33572, kurs: 30, frei: 32, kreise: [[0, 0, 19]], hoch: 22 },
  { id: 'sagrada', name: 'Sagrada Família', lat: 41.40363, lon: 2.17435, kurs: 225, frei: 72, kreise: [[0, -20, 28], [0, 20, 30]], hoch: 172 },
  { id: 'petersdom', name: 'Petersdom', lat: 41.90223, lon: 12.45333, kurs: 90, frei: 120, kreise: [[0, -50, 40], [0, 20, 62], [0, 90, 40]], hoch: 136 },
  { id: 'hagia', name: 'Hagia Sophia', lat: 41.00858, lon: 28.97993, kurs: 40, frei: 62, kreise: [[0, 0, 48]], hoch: 60 },
  { id: 'blaue_moschee', name: 'Blaue Moschee', lat: 41.00541, lon: 28.97682, kurs: 320, frei: 80, kreise: [[0, 30, 40], [0, -25, 38]], hoch: 64 },
  { id: 'basilius', name: 'Basilius Kathedrale', lat: 55.75253, lon: 37.62308, kurs: 0, frei: 32, kreise: [[0, 0, 26]], hoch: 65 },
  { id: 'neuschwanstein', name: 'Schloss Neuschwanstein', lat: 47.55758, lon: 10.74978, kurs: 40, frei: 66, kreise: [[0, 0, 40]], hoch: 80 },
  { id: 'angkor', name: 'Angkor Wat', lat: 13.41253, lon: 103.86698, kurs: 270, frei: 120, kreise: [[0, 0, 70]], hoch: 65 },
  { id: 'machu', name: 'Machu Picchu', lat: -13.16314, lon: -72.54497, kurs: 180, frei: 150, kreise: [], hoch: 30 },
  { id: 'empire', name: 'Empire State Building', lat: 40.74844, lon: -73.98566, kurs: 28, frei: 66, kreise: [[0, 0, 42]], hoch: 443 },
  { id: 'chrysler', name: 'Chrysler Building', lat: 40.75162, lon: -73.97547, kurs: 28, frei: 36, kreise: [[0, 0, 33]], hoch: 319 },
  { id: 'shard', name: 'The Shard', lat: 51.50446, lon: -0.08646, kurs: 10, frei: 32, kreise: [[0, 0, 27]], hoch: 310 },
  { id: 'tokyotower', name: 'Tokyo Tower', lat: 35.65858, lon: 139.74543, kurs: 0, frei: 42, kreise: [[-30, -30, 8], [30, -30, 8], [-30, 30, 8], [30, 30, 8]], hoch: 333 },
  { id: 'gatewayarch', name: 'Gateway Arch', lat: 38.62464, lon: -90.18478, kurs: 0, frei: 20, kreise: [[-96, 0, 7], [96, 0, 7]], hoch: 192 },
  { id: 'moai', name: 'Ahu Tongariki', lat: -27.12577, lon: -109.27696, kurs: 300, frei: 55, kreise: [[-40, 0, 5], [-20, 0, 5], [0, 0, 5], [20, 0, 5], [40, 0, 5]], hoch: 12 },
  { id: 'petra', name: 'Petra Al Khazneh', lat: 30.32224, lon: 35.45157, kurs: 30, frei: 45, kreise: [[0, 16, 28]], hoch: 60 },
  { id: 'pantheon', name: 'Pantheon', lat: 41.89861, lon: 12.47687, kurs: 0, frei: 48, kreise: [[0, 12, 30], [0, -30, 18]], hoch: 44 },
  { id: 'verbotene', name: 'Verbotene Stadt', lat: 39.91628, lon: 116.39715, kurs: 180, frei: 105, kreise: [[0, 0, 62]], hoch: 40 },
  { id: 'petronas', name: 'Petronas Towers', lat: 3.15785, lon: 101.71165, kurs: 320, frei: 72, kreise: [[40, 0, 26], [-40, 0, 26]], hoch: 452 },
];
// Riesenräder: [Name, lat, lon, Blickrichtung Grad, Durchmesser m]
export const RAEDER = [['London Eye', 51.5033, -0.1196, 40, 120], ['Wiener Riesenrad', 48.2166, 16.3958, 20, 61], ['Singapore Flyer', 1.2893, 103.8631, 30, 150], ['Ain Dubai', 25.08, 55.12, 60, 250], ['High Roller', 36.1175, -115.1681, 10, 158], ['Tianjin Eye', 39.156, 117.181, 80, 110], ['Melbourne Star', -37.8115, 144.9374, 15, 120], ['Daikanransha', 35.6265, 139.781, 45, 100], ['Navy Pier', 41.8917, -87.605, 90, 61], ['Seattle Great Wheel', 47.6061, -122.3425, 110, 53], ['Roue Paris', 48.8655, 2.3212, 0, 60], ['Munich Wheel', 48.1315, 11.5497, 30, 50], ['Texas Star', 32.7789, -96.7599, 0, 65], ['Redhorse Osaka', 34.8067, 135.5356, 20, 123], ['Bahia de Barcelona Tibidabo', 41.4225, 2.1188, 0, 30]];
// Sperrzonen ohne Häuser aus der Karte oder Füllung: [lat, lon, Radius m]
const SPERRZONEN = [[29.9755, 31.132, 1250], [51.1789, -1.8262, 220], [20.6829, -88.5687, 260], [37.9715, 23.7263, 170]];
const D2R = Math.PI / 180;
// Liegt der Punkt auf der Freifläche eines Wahrzeichens?
export function inWahrzeichen(lat, lon) { for (const z of SPERRZONEN) { const dy = (lat - z[0]) * 111132; if (Math.abs(dy) > z[2]) continue; const dx = (lon - z[1]) * 111320 * Math.cos(lat * D2R); if (dx * dx + dy * dy < z[2] * z[2]) return z; } for (const r of RAEDER) { const dy = (lat - r[1]) * 111132; if (Math.abs(dy) > r[4] * 0.4 + 4) continue; const dx = (lon - r[2]) * 111320 * Math.cos(lat * D2R), q = r[4] * 0.4 + 4; if (dx * dx + dy * dy < q * q) return r; } for (const w of WAHRZEICHEN) { if (!w.frei) continue; const dy = (lat - w.lat) * 111132; if (Math.abs(dy) > w.frei) continue; const dx = (lon - w.lon) * 111320 * Math.cos(lat * D2R); if (dx * dx + dy * dy < w.frei * w.frei) return w; } return null; }
// Kollision: Vielecke in den Koordinaten eines Ortes (x nach Osten, z nach Süden) für alle Wahrzeichen im Rahmen
export function wahrzeichenPolys(lat0, lon0, halb) {
  const out = [], kLat = 111132, kLon = 111320 * Math.cos(lat0 * D2R);
  for (const w of WAHRZEICHEN) { const ox = (w.lon - lon0) * kLon, oz = (lat0 - w.lat) * kLat; if (Math.abs(ox) > halb + 200 || Math.abs(oz) > halb + 200) continue; const h = w.kurs * D2R, s = Math.sin(h), c = Math.cos(h); for (const [mx, mz, r] of w.kreise) { const ost = -mx * c + mz * s, nord = mx * s + mz * c, x = ox + ost, z = oz - nord, P = []; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; P.push([x + r * Math.cos(a), z + r * Math.sin(a)]); } out.push(P); } }
  return out;
}
