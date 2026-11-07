// Kachelspeicher (Wunsch Nr. 56, 06.11.2026, Nader: "vieles sollte schon zu sehen sein von weiter weg und nicht immer erst nach dem Laden"). Karten, Höhen und Satellitenbilder bleiben im Browser des Spielers: der zweite Besuch einer Gegend lädt sofort.
// Karten: zuerst aus dem Speicher. Modelle, Texturen, Daten: sofort aus dem Speicher, im Hintergrund erneuern. Code und Seite gehen immer ans Netz (sonst käme ein Update nicht an). Beim Veröffentlichen ersetzt tools/buendeln.py den Namen von DINGE durch den Build Stempel: das macht diese Datei neu, der Browser tauscht den Service Worker und wirft den alten Speicher für Modelle und Daten weg. Für die Sekunden bis dahin leert kit/stand.js den alten Speicher schon beim Start der Seite, so sieht ein Rückkehrer gleich den neuen Stand. Es geht nichts an Dritte außer den Abrufen, die das Spiel ohnehin macht.
const KARTEN = 'erde-karten-1', DINGE = 'erde-dinge-202611071401', MAX = 14000;
const istKarte = u => /elevation-tiles-prod[^ ]*\/terrarium\/|tiles\.maps\.eox\.at\/wmts\/|tiles\.openfreemap\.org\/planet\/[^/]+\/\d|gibs\.earthdata\.nasa\.gov\//.test(u);
const istDing = u => { try { const p = new URL(u); return p.origin === self.location.origin && /\/(assets|daten)\//.test(p.pathname); } catch (e) { return false; } };
let neue = 0;
async function kuerzen(c) { const k = await c.keys(); if (k.length > MAX) for (const a of k.slice(0, k.length - Math.floor(MAX * 0.85))) await c.delete(a); }
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const n of await caches.keys()) if (n !== KARTEN && n !== DINGE) await caches.delete(n); await self.clients.claim(); })()));
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/daten/werbung/')) return;   // Buchungen und Preise immer frisch
  const r = e.request; if (r.method !== 'GET' || r.headers.has('range')) return;
  if (istKarte(r.url)) e.respondWith((async () => {
    const c = await caches.open(KARTEN), t = await c.match(r); if (t) return t;
    const n = await fetch(r); if (n.ok) { e.waitUntil(c.put(r, n.clone()).then(() => { if (++neue % 400 === 0) return kuerzen(c); }).catch(() => {})); } return n;
  })());
  else if (istDing(r.url)) e.respondWith((async () => {
    const c = await caches.open(DINGE), t = await c.match(r);
    const netz = fetch(r).then(n => { if (n.ok) e.waitUntil(c.put(r, n.clone()).catch(() => {})); return n; });
    if (t) { e.waitUntil(netz.catch(() => {})); return t; }
    return netz;
  })());
});
