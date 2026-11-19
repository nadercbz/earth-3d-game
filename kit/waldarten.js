// Baumarten der Wälder (05.11.2026, Nader: "Amazones stehen nur paar bäume ... eigentlich ein Dschungel", "überall viel mehr Vegetation wie in der echten Welt"). Ohne Abhängigkeiten, gilt im Worker und im Hauptfaden.
// Dichte aus dem Satellitenbild, Art aus Breite, Höhe und Helligkeit. Höhen in Metern wie in echten Wäldern.
export const WALD_ARTEN = ['eiche', 'kiefer', 'esche', 'espe', 'regenwald', 'urwaldriese', 'palme', 'akazie', 'fichte', 'busch'];
export const WI = Object.fromEntries(WALD_ARTEN.map((a, i) => [a, i]));
// Wie sehr sieht ein Bildpunkt (sRGB 0 bis 255) nach Baumkronen aus (06.11.2026 an 26 Orten der Erde geeicht): dunkel, Grün über Rot, Blau nicht weit über Grün. Nadelwald ist im Bild dunkel und bläulich (Harz 17, 30, 34), Regenwald etwas heller (Kongo 30, 49, 49), Äcker und Wiesen deutlich heller
const kl = v => v < 0 ? 0 : v > 1 ? 1 : v;
export function waldWert(r, g, b) { const R = r / 255, G = g / 255, B = b / 255, lum = 0.3 * R + 0.59 * G + 0.11 * B; return kl((G / Math.max(R, 0.004) - 1.12) / 0.22) * kl((1.5 - B / Math.max(G, 0.004)) / 0.2) * kl((0.235 - lum) / 0.05); }
// Offenes Land mit Bewuchs: Wiese, Steppe, Savanne. Sand und rote Wüste haben viel weniger Grün als Rot oder sind fast weiß
export function grasWert(r, g, b) { const R = r / 255, G = g / 255, B = b / 255, lum = 0.3 * R + 0.59 * G + 0.11 * B; return kl((G / Math.max(R, 0.004) - 0.78) / 0.1) * kl((0.62 - lum) / 0.14) * kl((1.12 - B / Math.max(G, 0.004)) / 0.12); }
// Trocken: Grün nicht über Rot und nicht dunkel (Savanne, Steppe, Trockenwald). Anteil über eine ganze Kachel, jeder 16. Bildpunkt reicht
export function trockenWert(foto) { let t = 0, n = 0; for (let j = 2; j < 256; j += 4) for (let i = 2; i < 256; i += 4) { const q = (j * 256 + i) * 4, r = foto[q], g = foto[q + 1], b = foto[q + 2], lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255; n++; if (g < r * 1.04 && lum > 0.2 && b < g) t++; } return t / n; }
// Nadelwald oder Laubwald am Bildpunkt: dunkel und bläulich heißt Nadeln
export function nadelWert(r, g, b) { const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255; return kl((b / Math.max(g, 1) - 0.9) / 0.18) * kl((0.17 - lum) / 0.05); }
// Art und Höhe je Baum: R Zufall, lat Breite, hm Höhe über dem Meer, lum Helligkeit im Bild, trocken Anteil der Kachel, nadel aus dem Bildpunkt. Rückgabe null oberhalb der Baumgrenze
export function waldArt(R, lat, hm, lum, trocken = 0, nadel = 0) {
  if (lat > 71 || lat < -56) return null;   // Baumgrenze: darüber nur Tundra und Eis
  const a = Math.abs(lat), grenze = Math.max(500, 4300 - 62 * Math.max(0, a - 15)); if (hm > grenze) return null; const q = R();
  if (hm > grenze - 700 && a > 18) return q < 0.86 ? [WI.fichte, 9 + R() * 11] : [WI.kiefer, 7 + R() * 9];
  if (trocken > 0.3 && a <= 36) return q < 0.62 ? [WI.akazie, 5 + R() * 8] : q < 0.82 ? [WI.esche, 7 + R() * 7] : [WI.busch, 2.5 + R() * 3];   // Savanne und Trockenwald
  if (a <= 14 || (a <= 24 && lum < 0.17)) return q < 0.07 ? [WI.urwaldriese, 40 + R() * 14] : q < 0.74 ? [WI.regenwald, 24 + R() * 12] : q < 0.88 ? [WI.palme, 14 + R() * 9] : [WI.busch, 4 + R() * 5];
  if (a <= 32) return lum > 0.2 ? [WI.akazie, 6 + R() * 6] : q < 0.55 ? [WI.esche, 10 + R() * 9] : q < 0.8 ? [WI.kiefer, 10 + R() * 9] : [WI.palme, 9 + R() * 7];
  const pN = a <= 49 ? 0.1 + 0.82 * nadel : a <= 58 ? 0.3 + 0.66 * nadel : 0.72 + 0.26 * nadel;   // Anteil Nadelbäume
  if (q < pN) return R() < (a <= 49 ? 0.7 : 0.66) ? [WI.fichte, (a > 58 ? 10 : 18) + R() * (a > 58 ? 10 : 15)] : [WI.kiefer, (a > 58 ? 9 : 15) + R() * 11];
  const l = R(); return l < 0.42 ? [WI.eiche, 15 + R() * 13] : l < 0.76 ? [WI.esche, 15 + R() * 13] : l < 0.93 ? [WI.espe, 12 + R() * 10] : [WI.busch, 2.5 + R() * 2.5];
}

// Jahreszeit wie draußen (06.11.2026): Laubbäume nach Monat und Halbkugel, Nadelbäume und Tropen bleiben grün. Rückgabe Farbfaktor [r, g, b] oder null (sommergrün). z: Zufall je Baum 0 bis 1
export const LAUB = new Set(['eiche', 'esche', 'espe', 'busch']);
export function monatJetzt() { return (typeof globalThis !== 'undefined' && globalThis.__MONAT) || new Date().getMonth() + 1; }
const mHalb = (lat, m) => lat >= 0 ? m : ((m + 5) % 12) + 1;
export function istKahl(lat, m = monatJetzt()) { const a = Math.abs(lat); if (a < 34) return false; const q = mHalb(lat, m); return q === 12 || q === 1 || q === 2 || (q === 3 && a > 46); }
export function saisonFarbe(lat, z, m = monatJetzt()) {
  const a = Math.abs(lat); if (a < 24) return null; const q = mHalb(lat, m), mild = a < 34;
  if (q >= 6 && q <= 8) return null;
  if (q === 9) return z < 0.3 ? [1.25, 1.06, 0.62] : null;
  if (q === 10 || q === 11) { if (mild) return z < 0.3 ? [1.3, 1.08, 0.6] : null; const s = q === 10 ? 0 : 0.14; return z < 0.22 - s ? null : z < 0.46 - s ? [1.32, 1.12, 0.56] : z < 0.74 - s ? [1.5, 1.0, 0.46] : z < 0.9 ? [1.45, 0.78, 0.4] : [1.1, 0.72, 0.42]; }
  if (q === 3 || q === 4) return q === 3 ? [0.8, 0.82, 0.55] : [1.12, 1.22, 0.72];
  if (q === 5) return [1.04, 1.14, 0.8];
  return mild ? [0.82, 0.84, 0.62] : [0.72, 0.62, 0.46];
}
