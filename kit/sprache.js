// Sprache (07.11.2026, Projektregel: "Texte im Spiel Englisch Standard, Deutsch wählbar"). Die Quelltexte sind Deutsch. Auf Englisch übersetzt dieses Modul jeden sichtbaren Text beim Einfügen ins Dokument, aus daten/sprache/en.json (Texte gesammelt mit tools/sprache/sammeln.py, geprüft mit tools/sprache/pruefen.py). Für Bilder auf Leinwänden gibt es T(). Wahl: gespeicherte Einstellung, sonst Browsersprache, Deutsch nur bei deutschem Browser.
const KEY = 'earth3d_sprache';
function wahl() { try { const s = localStorage.getItem(KEY); if (s === 'de' || s === 'en') return s; } catch (e) { /* privat */ } const b = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en'; return b.toLowerCase().startsWith('de') ? 'de' : 'en'; }
export const SPRACHE = wahl(), istEN = SPRACHE === 'en', LOCALE = istEN ? 'en-US' : 'de-DE';
const EXAKT = new Map(), MUSTER = [], CACHE = new Map(), RX = /[.*+?^$()|[\]\\{}]/g, ATTR = ['placeholder', 'title', 'aria-label', 'alt'];
function musterBauen(k, v) { const T0 = k.split('{}'), lit = T0.reduce((a, b) => b.length > a.length ? b : a, ''); if (lit.replace(/[^A-Za-zÄÖÜäöüß]/g, '').length < 3) return null; return { re: new RegExp('^' + T0.map(x => x.replace(RX, '\\$&')).join('([\\s\\S]*?)') + '$'), v, lit, n: k.length }; }
// Nur im Dokument laden: ein Worker, der hier wartete, verlöre die Aufträge, die währenddessen ankommen (sein onmessage steht erst danach)
if (istEN && typeof document !== 'undefined') { try { const r = await fetch(new URL('../daten/sprache/en.json', import.meta.url)); if (r.ok) { const d = await r.json(); for (const [k, v] of Object.entries(d)) { if (k.includes('{}')) { const m = musterBauen(k, v); if (m) MUSTER.push(m); } else EXAKT.set(k, v); } MUSTER.sort((a, b) => b.n - a.n); } } catch (e) { console.warn('Sprache', e); } }
const TRENNER = /( · |^· |: | \| |, |\. |\n)/;
function roh(k, tiefe) {
  const e = EXAKT.get(k); if (e !== undefined) return e;
  for (const M of MUSTER) { if (!k.includes(M.lit)) continue; const m = M.re.exec(k); if (!m) continue; let i = 0; return M.v.replace(/\{(\d?)\}/g, (_, d) => { const x = m[d === '' ? ++i : +d + 1] ?? ''; return tiefe < 2 ? T(x, tiefe + 1) : x; }); }
  if (tiefe < 2 && TRENNER.test(k)) { const P = k.split(TRENNER); let geaendert = false; for (let i = 0; i < P.length; i += 2) { const q = P[i].trim(); if (!q) continue; const t = T(q, tiefe + 1); if (t !== q) { P[i] = P[i].replace(q, t); geaendert = true; } } if (geaendert) return P.join(''); }
  return k;
}
// Text übersetzen. Unbekanntes bleibt, wie es ist (Ortsnamen, Zahlen)
export function T(t, tiefe = 0) { if (!istEN || typeof t !== 'string' || !t) return t; const k = t.trim(); if (!k) return t; let e = CACHE.get(k); if (e === undefined) { e = roh(k, tiefe); if (CACHE.size > 4000) CACHE.clear(); CACHE.set(k, e); } return e === k ? t : t.replace(k, () => e); }
export const landName = c => (istEN ? c?.en || c?.de : c?.de || c?.en) || '';
export function spracheSetzen(s) { try { localStorage.setItem(KEY, s); } catch (e) { /* privat */ } location.reload(); }
// Tierlexikon und ähnliche Daten: englische Felder über die deutschen legen
export async function lexikonEN(d, url) { if (!istEN) return d; try { const r = await fetch(url); if (!r.ok) return d; const E = await r.json(); if (E.hinweis) d.hinweis = E.hinweis; Object.assign(d.gruppen, E.gruppen || {}); for (const a of d.arten) { const q = E.arten?.[a.id]; if (!q) continue; a.nDe = a.n; for (const f of ['n', 'r', 'wo', 'm', 'e', 's', 'f']) if (q[f]) a[f] = q[f]; if (q.ort && a.o) a.o = [a.o[0], a.o[1], q.ort]; } } catch (e) { console.warn('Lexikon en', e); } return d; }
// ---------- Dokument ----------
function knoten(n) { const t = n.nodeValue; if (!t || !/[A-Za-zÄÖÜäöü]{2}/.test(t)) return; const q = n.parentNode?.nodeName; if (q === 'SCRIPT' || q === 'STYLE' || q === 'TEXTAREA') return; const e = T(t); if (e !== t) n.nodeValue = e; }
function element(el) { for (const a of ATTR) { const v = el.getAttribute?.(a); if (v) { const e = T(v); if (e !== v) el.setAttribute(a, e); } } const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) knoten(n); else for (const a of ATTR) { const v = n.getAttribute(a); if (v) { const e = T(v); if (e !== v) n.setAttribute(a, e); } } } }
if (istEN && typeof document !== 'undefined') {
  document.documentElement.lang = 'en'; element(document.documentElement);
  new MutationObserver(L => { for (const m of L) { if (m.type === 'characterData') knoten(m.target); else if (m.type === 'childList') { for (const a of m.addedNodes) { if (a.nodeType === 3) knoten(a); else if (a.nodeType === 1) element(a); } } else { const v = m.target.getAttribute(m.attributeName); if (v) { const e = T(v); if (e !== v) m.target.setAttribute(m.attributeName, e); } } } }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
}
