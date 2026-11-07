// Lernseite "Tiere der Erde" (Wunsch Nr. 69, 06.11.2026, Nader: "lernen, was für Tiere es wo gibt. Es ist auch eine Lernseite"). Daten nur aus daten/heute/tierlexikon.json, Land aus daten/heute/ctry_2048.bin, Fotos aus dem Album des Spiels im selben Browser.
import { LOCALE, lexikonEN } from '../kit/sprache.js';
const $ = id => document.getElementById(id), ESC = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const D = await fetch('../daten/heute/tierlexikon.json').then(r => r.json()).then(d => lexikonEN(d, '../daten/heute/tierlexikon_en.json')), A = D.arten, GR = D.gruppen, FARBE = g => getComputedStyle(document.documentElement).getPropertyValue('--' + g).trim();
let album = {}; try { album = JSON.parse(localStorage.getItem('earth3d_tieralbum') || '{}') || {}; } catch (e) { album = {}; }
const spielLink = e => `./#spiel@${e.o[0]},${e.o[1]},${encodeURIComponent(e.o[2].replace(/,/g, ' '))};tier=${e.id}`;
$('hinweis').textContent = D.hinweis;
const inAlbum = A.filter(e => album[e.id]).length, bedroht = A.filter(e => /stark gefährdet|Aussterben/.test(e.s) && !/Haustier/.test(e.s)).length;
$('zahlen').innerHTML = [[A.length, 'Arten im Spiel'], [Object.keys(GR).length, 'Gruppen'], [bedroht, 'stark gefährdet oder vom Aussterben bedroht'], [inAlbum, 'in deinem Album']].map(([z, t]) => `<div><b>${z}</b>${t}</div>`).join('');
$('leg').innerHTML = Object.entries(GR).map(([k, v]) => `<span><i style="background:var(--${k})"></i>${ESC(v)}</span>`).join('');
// ---------- Karte: Land als Punktraster, darauf die echten Orte der Arten ----------
const LAT0 = 82, LAT1 = -74, cv = $('welt'), zuX = lo => (lo + 180) / 360, zuY = la => (LAT0 - la) / (LAT0 - LAT1);
let land = null, sichtbar = A;
(async () => { try { const bin = await fetch('../daten/heute/ctry_2048.bin').then(r => r.arrayBuffer()), ds = new DecompressionStream('deflate'), w = ds.writable.getWriter(); w.write(new Uint8Array(bin)); w.close(); land = new Uint16Array(await new Response(ds.readable).arrayBuffer()); malen(); } catch (e) { console.warn('Karte', e); } })();
function malen(aktiv = null) {
  const W = cv.width, H = cv.height, c = cv.getContext('2d'); c.clearRect(0, 0, W, H);
  if (land) { const s = 10, kr = (lo, la) => { const x = Math.floor((((lo + 169) % 360 + 360) % 360) / 360 * 2048), y = Math.min(1023, Math.max(0, Math.floor((90 - la) / 180 * 1024))); return land[y * 2048 + x]; }; c.fillStyle = '#c9c0a8'; for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) { const lo = x / W * 360 - 180, la = LAT0 - y / H * (LAT0 - LAT1); if (kr(lo, la)) { c.beginPath(); c.arc(x, y, 3.1, 0, 6.283); c.fill(); } } }
  const k = W / (cv.clientWidth || W);   // Punkte in gleicher Größe auf dem Schirm, am Handy wie am Rechner
  for (const e of sichtbar) { const x = zuX(e.o[1]) * W, y = zuY(e.o[0]) * H, g = e === aktiv; c.beginPath(); c.arc(x, y, (g ? 7.5 : 4.2) * k, 0, 6.283); c.fillStyle = FARBE(e.g); c.fill(); c.lineWidth = (g ? 2 : 1) * k; c.strokeStyle = '#f8f4ea'; c.stroke(); }
}
malen();
function amPunkt(ev, toll) { const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top; let b = null, bd = toll; for (const e of sichtbar) { const d = Math.hypot(zuX(e.o[1]) * r.width - px, zuY(e.o[0]) * r.height - py); if (d < bd) { bd = d; b = e; } } return b; }
let hAlt = null; cv.addEventListener('pointermove', ev => { if (ev.pointerType === 'touch') return; const e = amPunkt(ev, 18), n = $('kname'); if (e !== hAlt) { hAlt = e; malen(e); } if (e) { const r = cv.getBoundingClientRect(), o = cv.parentElement.getBoundingClientRect(); n.textContent = e.n; n.style.left = Math.min(r.width - 40, Math.max(40, zuX(e.o[1]) * r.width)) + (r.left - o.left) + 'px'; n.style.top = zuY(e.o[0]) * r.height + (r.top - o.top) + 'px'; n.style.opacity = 1; } else n.style.opacity = 0; });
cv.addEventListener('pointerleave', () => { $('kname').style.opacity = 0; if (hAlt) { hAlt = null; malen(); } });
cv.addEventListener('click', ev => { const e = amPunkt(ev, 28); if (e) zeigen(e); });
// ---------- Liste und Suche ----------
const F = { q: '', g: 'alle' };
$('chips').innerHTML = [['alle', 'Alle'], ...Object.entries(GR), ['album', 'Mein Album']].map(([k, v]) => `<button type="button" data-g="${k}" aria-pressed="${k === 'alle'}">${ESC(v)}</button>`).join('');
$('chips').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; F.g = b.dataset.g; for (const x of $('chips').children) x.setAttribute('aria-pressed', x === b); filtern(); });
let tq = 0; $('such').addEventListener('input', ev => { clearTimeout(tq); tq = setTimeout(() => { F.q = ev.target.value.trim().toLowerCase(); filtern(); }, 110); });
function filtern() {
  sichtbar = A.filter(e => (F.g === 'album' ? album[e.id] : F.g === 'alle' || e.g === F.g) && (!F.q || `${e.n} ${e.l} ${e.wo} ${e.r} ${e.o[2]} ${e.e} ${GR[e.g]}`.toLowerCase().includes(F.q)));
  $('treffer').textContent = `${sichtbar.length} ${sichtbar.length === 1 ? 'Art' : 'Arten'}`; malen();
  const L = $('liste'); L.textContent = ''; if (!sichtbar.length) { const p = document.createElement('p'); p.className = 'leer'; p.textContent = F.g === 'album' ? 'Noch keine Fotos. Im Spiel Taste P drücken oder den Knopf Foto, wenn ein Tier im Bild ist.' : 'Kein Tier gefunden.'; L.appendChild(p); return; }
  for (const e of sichtbar) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tier'; b.style.setProperty('--c', `var(--${e.g})`); const f = album[e.id]?.bild; b.innerHTML = `<div class="band">${f ? `<img src="${f}" alt="" loading="lazy">` : `<em aria-hidden="true">${ESC(e.n[0])}</em>`}<span>${ESC(GR[e.g])}</span></div><div class="text"><h3>${ESC(e.n)}</h3><p class="la">${ESC(e.l)}</p><p class="wo">${ESC(e.wo)}</p></div>`; b.onclick = () => zeigen(e); L.appendChild(b); }
}
// ---------- Steckbrief ----------
function zeigen(e) {
  const d = $('steckbrief'), f = album[e.id], z = (k, v) => `<tr><td>${k}</td><td>${ESC(v)}</td></tr>`; d.style.setProperty('--c', `var(--${e.g})`);
  d.innerHTML = `<div class="dk"><button class="zu" type="button" aria-label="Schließen">×</button><span class="dg">${ESC(GR[e.g])}</span><h2>${ESC(e.n)}</h2><p>${ESC(e.l)}</p></div><div class="db">${f?.bild ? `<img src="${f.bild}" alt="${ESC(e.n)}, dein Foto aus dem Spiel">` : ''}<p class="fakt">${ESC(e.f)}</p><table>${z('Lebensraum', e.r)}${z('Wo auf der Erde', e.wo)}${z('Größe', e.m)}${z('Nahrung', e.e)}${z('Gefährdung', e.s)}${f ? z('Dein Foto', `${new Date(f.t).toLocaleDateString(LOCALE)}${f.ort ? `, ${f.ort}` : ''}`) : ''}</table><a class="los" href="${spielLink(e)}">Im Spiel ansehen: ${ESC(e.o[2])}</a></div>`;
  d.querySelector('.zu').onclick = () => d.close(); d.showModal(); malen(e);
}
$('steckbrief').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); }); $('steckbrief').addEventListener('close', () => malen());
filtern(); addEventListener('resize', () => malen());
{ const h = location.hash.slice(1), e = h && A.find(x => x.id === h); if (e) zeigen(e); }
