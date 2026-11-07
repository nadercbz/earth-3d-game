// Ortsdienst (08_WELTBAU.md): bestellt Orte und den Fernbereich bei kit/ortbau.worker.js. Jede Stelle der Erde wird so wie der Potsdamer Platz gebaut.
// Ein Worker baut Orte (dauert Sekunden). Karten und Gebäudekisten laufen über einen kleinen Pool (Rechner 3, Handy 2) mit Vorrang:
// je Worker ein Auftrag zugleich, als Nächstes immer der mit dem kleinsten Vorrangwert (seit 29.10.2026 abends: vorher arbeitete ein
// einziger Worker alles der Reihe nach ab, beim Anflug kamen die Karten am Ziel erst nach Sekunden).
import { MOBIL } from './geraet.js';
let naechste = 1;
const offen = new Map();
function neuerWorker() {
  const x = new Worker(new URL('./ortbau.worker.js', import.meta.url), { type: 'module' });
  x.onmessage = ev => { if (ev.data.pong) { x.letzterPong = performance.now(); return; } const { id, daten, fehler } = ev.data, p = offen.get(id); if (!p) return; offen.delete(id); x.belegt = false; fehler ? p.nein(new Error(fehler)) : p.ja(daten); pumpe(); };
  x.onerror = ev => { for (const [id, p] of offen) if (p.w === x) { p.nein(new Error(ev.message || 'Worker Fehler')); offen.delete(id); } x.belegt = false; pumpe(); };
  return x;
}
let ortWorker = null;
const pool = [], warte = [];
function pumpe() {
  if (!pool.length) for (let i = 0; i < (MOBIL ? 2 : 3); i++) pool.push(neuerWorker());
  for (const w of pool) {
    if (w.belegt || !warte.length) continue;
    let bi = 0; for (let i = 1; i < warte.length; i++) if (warte[i].vorrang() < warte[bi].vorrang()) bi = i;
    const a = warte.splice(bi, 1)[0];
    if (a.abgesagt && a.abgesagt()) { a.nein(new Error('abgesagt')); continue; }
    w.belegt = true; offen.set(a.id, { ja: a.ja, nein: a.nein, w }); w.postMessage(a.nachricht);
  }
}
function fern(nachricht, vorrang = () => 0, abgesagt = null) {
  const id = naechste++;
  return new Promise((ja, nein) => { warte.push({ id, nachricht: { ...nachricht, id }, vorrang, abgesagt, ja, nein }); pumpe(); });
}
// Wächter (04.11.2026): antwortet der Ortsworker lange nicht, hängt er in einer Rechnung (läuft sonst bis der Speicher voll ist und reißt die Seite
// mit). Dann wird er beendet, seine Aufträge schlagen mit hängt = true fehl (dort bleibt die Kugel), der nächste Auftrag startet einen neuen Worker
let waechterAn = false;
function waechter() {
  if (waechterAn) return; waechterAn = true;
  setInterval(() => {
    const w = ortWorker; if (!w) return;
    const laeuft = [...offen.values()].some(p => p.w === w);
    if (!laeuft) { w.letzterPong = performance.now(); return; }
    if (document.visibilityState === 'visible' && performance.now() - w.letzterPong > (MOBIL ? 30000 : 18000)) {
      w.terminate(); ortWorker = null;
      const stellen = []; for (const [id, p] of offen) if (p.w === w) { stellen.push(`${p.lat},${p.lon}`); const e = new Error('Ortsbau hängt'); e.haengt = true; p.nein(e); offen.delete(id); }
      console.warn('Ortsworker hing und wurde neu gestartet: ' + stellen.join(' '));
    } else w.postMessage({ auftrag: 'ping' });
  }, 1000);
}
// lat, lon: Mitte; halb: halbe Kantenlänge in Metern; liefert Ortsdaten (wie assets/orte/potsdamer_platz.json, dazu gelaende und meta.h0)
export function ortBestellen(lat, lon, { halb = 600, seed = 7, name = '' } = {}) {
  if (!ortWorker) { ortWorker = neuerWorker(); ortWorker.letzterPong = performance.now(); waechter(); }
  const id = naechste++;
  return new Promise((ja, nein) => { offen.set(id, { ja, nein, w: ortWorker, lat, lon }); ortWorker.postMessage({ auftrag: 'ort', id, lat, lon, halb, seed, name }); });
}
// Karte einer Kugelkachel als ImageBitmap (Straßen, Wasser, Grün, Häuser von oben); vorrang(): kleiner = früher, abgesagt(): nicht mehr nötig
export function karteBestellen(z, x, y, groesse = 512, vorrang, abgesagt) {
  return fern({ auftrag: 'karte', z, x, y, groesse }, vorrang, abgesagt);
}
// Kachel der Minikarte (Wunsch Nr. 34) als ImageBitmap im dunklen Kartenstil; deckend: mit Grund, sonst nur Wasser und Straßen
export function miniKarteBestellen(z, x, y, groesse = 256, deckend = true, vorrang, abgesagt) {
  return fern({ auftrag: 'minikarte', z, x, y, groesse, deckend }, vorrang, abgesagt);
}
// Gebäudekisten einer Kachel der Stufe 14 im lokalen Rahmen der Kachelmitte; ohne: { lat, lon, halb } (gebauter Ort, dort keine Kisten)
export function kistenBestellen(x, y, ohne = null, budget = 60000, vorrang, abgesagt, baumBudget = 0, z = 14) {
  return fern({ auftrag: 'kisten', x, y, z, ohne, budget, baumBudget }, vorrang, abgesagt);
}
