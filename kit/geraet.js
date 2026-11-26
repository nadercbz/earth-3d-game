// Was für ein Gerät? (06.11.2026, Wunsch Nr. 66 und 67) MOBIL heißt: Handy oder Tablet, also Touch als Hauptbedienung. Vorher zählte auch jedes Rechnerfenster unter 820 px und jeder Rechner mit Touchscreen als Handy: nur 4 von 7 Fahrzeugen, weniger Grafik, kleinerer Ort. Das Layout richtet sich weiter nach der Breite (dashboard/style.css).
export const MOBIL = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse) and (hover: none)').matches;

// Sparmodus (Nr. 110, 25.11.2026, Nader: "Auf dem Handy stürzt es auch immer ab"). Gemessen im Handyformat: die Seite belegte 1,0 bis 1,5 GB, ein Handy
// beendet sie dann ohne Meldung und lädt neu. SPAR heißt: wenig Arbeitsspeicher (Android meldet ihn über deviceMemory), ausdrücklich gewünscht (?spar=1,
// aus mit ?spar=0) oder die letzte Sitzung endete ohne Abschied (pagehide kam nicht: die Seite wurde beendet). Dann kleinere Texturen, kleinerer Ort, weniger Verkehr.
// Im Worker gibt es weder matchMedia noch sessionStorage: dort kommt die Angabe über die Nachricht { auftrag: 'geraet' } (kit/ortdienst.js).
const _im = typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
function sparLesen() {
  if (!_im) return false;
  let abgestuerzt = false, wunsch = null;
  try { const q = new URLSearchParams(location.search).get('spar'); if (q !== null) { wunsch = q !== '0'; sessionStorage.setItem('e3d-spar', wunsch ? '1' : '0'); } else { const s = sessionStorage.getItem('e3d-spar'); if (s !== null) wunsch = s === '1'; } } catch (_) { /* Speicher gesperrt */ }
  try {
    abgestuerzt = sessionStorage.getItem('e3d-laeuft') === '1';   // die letzte Sitzung in diesem Tab hat sich nicht abgemeldet
    sessionStorage.setItem('e3d-laeuft', '1');
    addEventListener('pagehide', () => { try { sessionStorage.removeItem('e3d-laeuft'); } catch (_) { /* egal */ } });
    addEventListener('pageshow', () => { try { sessionStorage.setItem('e3d-laeuft', '1'); } catch (_) { /* egal */ } });
    if (abgestuerzt) sessionStorage.setItem('e3d-spar', '1');   // bleibt für diesen Tab an
  } catch (_) { /* Speicher gesperrt */ }
  if (wunsch !== null && !abgestuerzt) return wunsch;
  return abgestuerzt || (MOBIL && typeof navigator !== 'undefined' && navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
}
export const ABSTURZ = _im && (() => { try { return sessionStorage.getItem('e3d-laeuft') === '1'; } catch (_) { return false; } })();   // vor sparLesen gelesen: die letzte Sitzung wurde beendet
export const SPAR = sparLesen();
// Größte Kantenlänge einer Textur im Grafikspeicher: Rechner unbegrenzt, Handy 1024 (Kugel) und 512 (alles andere), Sparmodus 512 und 256
export const TEX_MAX = !MOBIL ? Infinity : SPAR ? 256 : 512, TEX_MAX_GROSS = !MOBIL ? Infinity : SPAR ? 1024 : 2048;
