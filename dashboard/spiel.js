// Spielgerüst über dem Dashboard (05.11.2026, Nader: "wie ein perfektes Spiel", "wie GTA 6"): Titelbild, Spielanzeige ohne Entwickler Fenster, Pausemenü, Einstellungen, Reisepass, Garage, Erfolge,
// Tageszeit und Wetter laufen von selbst. Das Dashboard bleibt für die Entwicklung erreichbar (#erde und die anderen Ansichten). Spielstand nur im Browser (kit/spielstand.js).
import { SPRACHE, LOCALE, spracheSetzen, T } from '../kit/sprache.js';
import { laden, speichern, hatStand, zuruecksetzen, ERFOLGE } from '../kit/spielstand.js';
import { WF_ARTEN, wfCodeText } from '../kit/werbeflaechen.js';

const STAEDTE = [['Berlin', 52.5200, 13.4050], ['New York', 40.7580, -73.9855], ['Paris', 48.8606, 2.3376], ['Tokio', 35.6595, 139.7005], ['London', 51.5080, -0.1280], ['Rio de Janeiro', -22.9711, -43.1822], ['Dubai', 25.2048, 55.2708], ['Marrakesch', 31.6258, -7.9892], ['Sydney', -33.8688, 151.2093], ['San Francisco', 37.7879, -122.4074], ['Istanbul', 41.0082, 28.9784], ['Mumbai', 19.0176, 72.8562]];
const PREISE = { kompakt: 0, limousine: 300, kombi: 300, suv: 500, taxi: 400, transporter: 400, bus: 800 };
const fmtG = n => Math.round(n).toLocaleString(LOCALE) + ' €';
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; };

export class SpielShell {
  // api: { MOBIL, ton, navi, erdZiel, warteAufOrt, spielStarten, spielBeenden, einsteigen, aussteigen, modus, auto, figur, spielerGeo, ortName, land, setWetter, uhrWeiter, ALLE_FAHRZEUGE, ALLE_MENSCHEN, auftraege, grafik }
  constructor(api) {
    this.api = api; this.stand = laden(); this.aktiv = false; this.pausiert = false; this.tSpeicher = 0; this.tTipp = 0; this.letzterOrt = ''; this.tWetter = 180 + Math.random() * 300; this.wegM = 0; this.letzteGeo = null; this.tOrt = 0;
    api.ton.laut = this.stand.einst.laut; this.stand.muenzen ||= {};
    api.radio.setze(this.stand.einst.radio ?? 1); api.radio.laut = this.stand.einst.radioLaut ?? 0.5;
    this.bauen();
    addEventListener('keydown', e => { if (e.code === 'Escape' && this.aktiv && this.pausiert && e.target.tagName !== 'INPUT') { e.preventDefault(); this.pause(false); } });
    this._uhr = 0;
  }
  bauen() {
    const H = this.hud = el('div', 'shud', `<div class="sgeld" id="sgeld"></div><div class="swetter" id="swetter"></div><div class="ssterne" id="ssterne"></div><div class="sauftrag" id="sauftrag"></div><div class="sortname" id="sortname"></div><div class="stempo" id="stempo"><b id="stZahl">0</b><span>km/h</span><i id="stGang"></i><div class="sdreh"><u id="stDreh"></u></div><div class="sschaden" id="stSchadenBox"><u id="stSchaden"></u></div></div><div class="stipp" id="stipp"></div><button class="swerbe" id="swerbe" type="button"></button><div class="shinweis" id="shinweis"></div><div class="sgewinn" id="sgewinn"></div>`);
    document.body.appendChild(H); this.$ = id => document.getElementById(id);
    this.$('swerbe').addEventListener('click', () => { if (this._wf && !this.pausiert) this.werbeKarte(this._wf); });
    this.menue = el('div', 'smenue'); document.body.appendChild(this.menue);
    this.spielMenu = this.menue;
    this.$('stempo').addEventListener('pointerdown', () => { const r = this.api.radio.weiter(); this.stand.einst.radio = this.api.radio.i; this.tipp(r.info ? `${r.name} · ${r.info}` : r.name, 2.5); });
    this.auftragHud = { tipp: (t, s) => this.tipp(t, s), auftrag: a => this.auftragZeile(a) };
  }
  // ---------- Titel ----------
  titel() {
    document.body.classList.add('titel'); this.api.titelBlick?.(!this.titelDa); this.titelDa = true;   // beim ersten Mal ohne Flug: die Erde steht gleich richtig (der Test für ruhende Gamepads misst sonst den Flug)
    const st = this.stand, weiter = hatStand() && st.lage;
    this.menue.className = 'smenue an titelbild';
    this.menue.innerHTML = `<div class="stitel"><h1>EARTH</h1><p>Die ganze Erde. Eins zu eins. Jede Stadt, jede Straße.</p>
      <div class="sknoepfe">${weiter ? `<button data-k="weiter" class="haupt">Weiterspielen <small>${st.lage.name || ''}</small></button>` : ''}<button data-k="neu" class="${weiter ? '' : 'haupt'}">${weiter ? 'Neuer Start' : 'Spielen'}</button><button data-k="frei">Erde frei erkunden</button><button data-k="einst">Einstellungen</button><a class="swflink" href="register.html" target="_blank" rel="noopener">Werbefläche buchen</a></div>
      <small class="squelle">${document.querySelector('.quellen')?.textContent || ''}</small><div class="ssprache" aria-label="Language"><button data-s="en" class="${SPRACHE === 'en' ? 'an' : ''}">English</button><button data-s="de" class="${SPRACHE === 'de' ? 'an' : ''}">Deutsch</button></div></div>`;
    this.menue.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => { if (b.dataset.s !== SPRACHE) spracheSetzen(b.dataset.s); });
    this.menue.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => { this.api.ton.klick(); const k = b.dataset.k; if (k === 'weiter') this.los(st.lage); else if (k === 'neu') this.stadtWahl(); else if (k === 'frei') this.frei(); else this.einstellungen(() => this.titel()); });
  }
  stadtWahl() {
    this.menue.className = 'smenue an titelbild';
    this.menue.innerHTML = `<div class="stitel klein"><h2>Wo willst du anfangen?</h2><div class="sstaedte">${STAEDTE.map((s, i) => `<button data-i="${i}">${s[0]}</button>`).join('')}</div>
      <div class="ssuche"><input id="sstadtfeld" type="search" placeholder="Oder jeden Ort der Erde suchen" autocomplete="off"><div id="sstadtliste" class="sstadtliste"></div></div><div class="sknoepfe"><button data-z="1">Zurück</button></div></div>`;
    this.menue.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { const s = STAEDTE[+b.dataset.i]; this.api.ton.klick(); this.los({ name: s[0], lat: s[1], lon: s[2] }); });
    this.menue.querySelector('button[data-z]').onclick = () => this.titel();
    const f = this.$('sstadtfeld'), L = this.$('sstadtliste');
    f.oninput = () => { const t = f.value.trim().toLowerCase(); L.innerHTML = ''; if (t.length < 2) return; for (const o of this.api.suche(t).slice(0, 6)) { const b = el('button', '', `${o.name}<small>${o.land || ''}</small>`); b.onclick = () => this.los({ name: o.name, lat: o.lat, lon: o.lon }); L.appendChild(b); } };
  }
  async los(ziel) {
    const A = this.api; this.menue.className = 'smenue an titelbild'; this.menue.innerHTML = `<div class="stitel klein"><h2>${ziel.name || 'Unterwegs'}</h2><p id="sladetext">Die Stadt wird gebaut, gleich geht es los</p><div class="sladen"><u></u></div></div>`;
    document.body.classList.remove('titel'); document.body.classList.add('game'); this.aktiv = true; this.reise = true;
    A.utc(this.stand.utc ?? ((10 - ziel.lon / 15) % 24 + 24) % 24);   // erster Start am Vormittag vor Ort, danach die gespeicherte Uhr
    A.erdZiel({ lat: ziel.lat, lon: ziel.lon, dist: 700, neigung: 70, kurs: 30, boden: true });
    try { await A.warteAufOrt(); } catch { /* weiter, Ort kommt noch */ }
    const fig = A.ALLE_MENSCHEN().find(d => d.id === this.stand.figur) || A.ALLE_MENSCHEN()[0];
    await A.spielStarten('fuss', fig); if (!ziel.amKai) A.figurZumAuto?.();
    this.reise = false; this.menue.className = 'smenue'; this.menue.innerHTML = ''; this.tipp(A.MOBIL ? 'Geh zu einem Auto und tippe Ein Aus · Menü oben rechts im Knopf' : 'E: in ein Auto steigen · J: Auftrag annehmen · Esc: Menü', 9);
    this.geldZeigen(); this.stand.lage = { name: ziel.name, lat: ziel.lat, lon: ziel.lon }; speichern(this.stand);
  }
  // Direktlink zu einem Meerestier: gleich im Boot oder im Wasser
  async aufWasser(ziel, art) { const A = this.api; this.menue.className = 'smenue'; this.menue.innerHTML = ''; document.body.classList.remove('titel'); document.body.classList.add('game'); this.aktiv = true; A.utc(this.stand.utc ?? ((10 - ziel.lon / 15) % 24 + 24) % 24); await A.wasserBei(art, ziel); this.geldZeigen(); }
  frei() { this.menue.className = 'smenue'; this.menue.innerHTML = ''; document.body.classList.remove('titel', 'game'); this.aktiv = false; }
  // ---------- Pause ----------
  pause(an = !this.pausiert) {
    if (!this.aktiv) return; this.pausiert = an; this.api.ton.pause(an);
    this.api.eingabeLeeren?.();
    if (!an) { this.menue.className = 'smenue'; this.menue.innerHTML = ''; return; }
    this.pauseMenue();
  }
  pauseMenue() {
    const a = this.api.auftraege()?.aktiv, w = this.api.auto()?.schaden, preis = w ? Math.round((40 + 260 * w.wert) / 10) * 10 : 0;
    this.menue.className = 'smenue an pause';
    this.menue.innerHTML = `<div class="sfenster"><h2>Pause</h2><div class="sknoepfe spalte"><button data-k="weiter" class="haupt">Weiter</button><button data-k="schaden">Schadensmodell: ${this.stand.einst?.schaden ? 'An' : 'Aus'}</button>${a ? '<button data-k="abbruch">Auftrag abbrechen</button>' : '<button data-k="auftrag">Auftrag suchen</button>'}${this.api.jetAn?.() ? `<button data-k="landen">Sofort absetzen</button>${this.api.flugArt?.() === 'heli' ? '<button data-k="jet">Zum Düsenjet wechseln</button>' : '<button data-k="heli">Zum Hubschrauber wechseln</button>'}` : '<button data-k="welt">Weltgeschehen</button><button data-k="kreuz">Kreuzfahrt</button><button data-k="jet">Düsenjet fliegen</button><button data-k="heli">Hubschrauber fliegen</button>'}<button data-k="wunsch">Wunschfläche hier</button><button data-k="lex">Tierlexikon</button><button data-k="flugwahl">Mitfliegen</button><button data-k="w_speedboot">Speedboot</button><button data-k="w_jetski">Jetski</button><button data-k="w_uboot">U-Boot</button><button data-k="w_schwimmer">Schwimmen und tauchen</button>${w && w.wert > 0.02 ? `<button data-k="repariere" ${this.stand.geld < preis ? 'disabled' : ''}>Auto reparieren <small>${fmtG(preis)}</small></button>` : ''}${this.api.auto()?.obj.userData.lackU ? '<button data-k="lack">Lackieren <small>100 €</small></button>' : ''}<button data-k="reise">Schnellreise</button><button data-k="garage">Garage</button><button data-k="figur">Figur wählen</button><button data-k="pass">Reisepass und Erfolge</button><button data-k="einst">Einstellungen</button><button data-k="hilfe">Steuerung</button><button data-k="haupt">Hauptmenü</button></div><small class="squelle">${document.querySelector('.quellen')?.textContent || ''}</small></div>`;
    this.menue.querySelectorAll('button[data-k]').forEach(b => b.onclick = () => { this.api.ton.pause(false); this.api.ton.klick(); const k = b.dataset.k;
      if (k === 'weiter') this.pause(false);
      else if (k === 'schaden') { const E = this.stand.einst; E.schaden = !E.schaden; speichern(this.stand); this.api.schadenModus?.(E.schaden); this.tipp(E.schaden ? 'Schadensmodell an: Unfälle hinterlassen Beulen' : 'Schadensmodell aus: Autos bleiben heil', 4); this.pauseMenue(); }   // Wunsch Nr. 97
      else if (k === 'abbruch') { this.api.auftraege().abbrechen('Auftrag abgebrochen'); this.pause(false); }
      else if (k === 'auftrag') { this.pause(false); this.auftragWahl(); }
      else if (k === 'jet') { this.pause(false); this.api.auftraege()?.abbrechen(); this.api.jetStarten('jet'); this.tipp(this.api.MOBIL ? 'Stick lenkt · Nachbrenner · Bremse' : 'Klick ins Bild: Maus zielt · W S Schub · Shift Nachbrenner · G Fahrwerk · Leertaste Bremse', 8); }
      else if (k === 'heli') { this.pause(false); this.api.auftraege()?.abbrechen(); this.api.jetStarten('heli'); this.tipp(this.api.MOBIL ? 'Stick vor und drehen · Hoch · Runter' : 'W S vor und zurück · A D drehen · Shift hoch · Leertaste runter · Q E seitlich', 8); }
      else if (k === 'lex') this.tierlexikon(() => this.pauseMenue());
      else if (k === 'wunsch') this.api.wunschHier?.();
      else if (k === 'flugwahl') { this.pause(false); this.api.auftraege()?.abbrechen(); this.api.flugWahl(); }
      else if (k.startsWith('w_')) { this.pause(false); this.api.auftraege()?.abbrechen(); this.api.wasserStarten(k.slice(2)); }
      else if (k === 'landen') { const p = this.api.spielerGeo(); if (!p || !this.api.ortName(p)) { this.pause(false); this.tipp('Hier ist nichts zum Landen. Flieg näher an einen Ort', 5); return; } this.pausiert = false; this.api.spielBeenden(); this.los({ name: this.api.ortName(p), lat: p.lat, lon: p.lon }); }
      else if (k === 'repariere') { this.stand.geld -= preis; this.api.reparieren(); this.geldZeigen(); speichern(this.stand); this.pause(false); this.tipp('Wieder wie neu', 3); this.api.ton.anlassen(); }
      else if (k === 'lack') this.lackMenue();
      else if (k === 'kreuz') this.kreuzMenue();
      else if (k === 'welt') this.weltgeschehen(() => this.pauseMenue()); else if (k === 'reise') this.reiseMenue(); else if (k === 'garage') this.garage(); else if (k === 'figur') this.figurWahl(); else if (k === 'pass') this.reisepass(); else if (k === 'einst') this.einstellungen(() => this.pauseMenue()); else if (k === 'hilfe') this.steuerung();
      else if (k === 'haupt') { this.pause(false); speichern(this.stand); this.api.spielBeenden(); this.aktiv = false; document.body.classList.remove('game'); this.titel(); } });
  }
  // Karte einer Werbefläche: Code, Lage, Größe, Stufe, Startpreis, Status. Rechnen tut kit/werbeflaechen.js über die Schnittstelle, hier steht nur die Darstellung
  // Echtes angeklickt (kit/echtzeit.js): was es wirklich ist, beim Flugzeug Mitfliegen
  echtKarte(I) {
    const A = this.api, spielt = this.aktiv; if (spielt) { this.pausiert = true; A.ton.pause(true); } A.eingabeLeeren?.(); const zu = () => { if (spielt) this.pause(false); else { this.menue.className = 'smenue'; this.menue.innerHTML = ''; } };
    const knopf = I.mit !== undefined ? '<div class="sknoepfe"><button data-k="mit" class="haupt">Mitfliegen</button></div>' : I.ziel ? '<div class="sknoepfe"><button data-k="hin" class="haupt">Hinfliegen</button></div>' : '';
    this.fenster(I.titel, `<div class="swf"><div class="swfkopf"><span class="swfstatus echt">${I.status || 'Echt'}</span><span class="swfstufe">${I.art}</span></div><p class="stext">${I.text}</p>${knopf}<table class="stab">${I.zeilen.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table><p class="ssmall">Quelle: ${I.quelle}</p></div>`, zu);
    const los = fn => () => { A.ton.klick(); this.menue.className = 'smenue'; this.menue.innerHTML = ''; if (spielt) { this.pausiert = false; A.ton.pause(false); } fn(); };
    const b = this.menue.querySelector('button[data-k="mit"]'); if (b) b.onclick = los(() => A.mitfliegen(I.mit)); const h = this.menue.querySelector('button[data-k="hin"]'); if (h) h.onclick = los(() => A.erdZiel({ ...I.ziel, kurs: 0 }));
  }
  // Tierlexikon (Wunsch Nr. 69): Lernseite im Spiel. Suchen, wo welche Art lebt, Steckbrief lesen, hinfliegen, fotografieren, sammeln
  tierKnopf() { if (document.getElementById('stierknopf')) return; const b = document.createElement('button'); b.id = 'stierknopf'; b.textContent = 'Tierlexikon'; b.onclick = () => this.tierlexikon(); document.body.appendChild(b); }
  async tierlexikon(zurueck = null, start = { q: '', g: 'alle' }) {
    const A = this.api; let L; try { L = await A.lexLaden(); } catch (e) { this.tipp('Tierlexikon nicht erreichbar', 3); return; } const spielt = this.aktiv; if (spielt) { this.pausiert = true; A.ton.pause(true); } A.eingabeLeeren?.();
    const zu = zurueck || (() => { if (spielt) this.pause(false); else { this.menue.className = 'smenue'; this.menue.innerHTML = ''; } }), alb = A.album(), gr = L.stand.gruppen, nF = [...L.keys()].filter(k => alb[k]).length, zustand = { ...start };
    this.fenster('Tierlexikon', `<div class="slex"><p class="stext">${nF} von ${L.size} Arten im Album. Im Spiel: Tier anklicken zeigt den Steckbrief, ${this.api.MOBIL ? 'der Knopf Foto' : 'Taste P'} macht ein Foto. Suche nach Tier, Land oder Lebensraum.</p><input class="slexsuche" type="search" placeholder="Zum Beispiel Löwe, Afrika, Regenwald" autocomplete="off"><div class="slexfilter"><button data-g="alle">Alle</button>${Object.entries(gr).map(([k, v]) => `<button data-g="${k}">${v}</button>`).join('')}<button data-g="album">Mein Album</button></div><div class="slexliste"></div><p class="ssmall">${L.stand.hinweis} <a href="tiere.html" target="_blank" rel="noopener">Als Lernseite öffnen</a></p></div>`, zu);
    const li = this.menue.querySelector('.slexliste'), su = this.menue.querySelector('.slexsuche'), fi = [...this.menue.querySelectorAll('.slexfilter button')]; su.value = zustand.q;
    const zeigen = () => { const q = su.value.trim().toLowerCase(); zustand.q = su.value; li.textContent = ''; for (const b of fi) b.classList.toggle('an', b.dataset.g === zustand.g); for (const e of L.values()) { if (zustand.g === 'album' ? !alb[e.id] : zustand.g !== 'alle' && e.g !== zustand.g) continue; if (q && !`${e.n} ${e.l} ${e.wo} ${e.r} ${e.o[2]} ${gr[e.g]}`.toLowerCase().includes(q)) continue; const b = document.createElement('button'); b.className = 'slextier'; b.type = 'button'; const f = alb[e.id]?.bild, bi = document.createElement('span'); bi.className = 'slexbild'; if (f) { const im = document.createElement('img'); im.src = f; im.alt = e.n; im.loading = 'lazy'; bi.appendChild(im); } else { const i = document.createElement('i'); i.textContent = e.n[0]; bi.appendChild(i); } const na = document.createElement('b'), wo = document.createElement('small'); na.textContent = e.n; wo.textContent = e.wo; b.append(bi, na, wo); b.onclick = () => { A.ton.klick?.(); this.tierKarte(e.id, () => this.tierlexikon(zurueck, zustand)); }; li.appendChild(b); } if (!li.children.length) { const p = document.createElement('p'); p.className = 'stext'; p.textContent = zustand.g === 'album' ? 'Noch keine Fotos. Geh zu einem Tier und mach eins.' : 'Kein Tier gefunden.'; li.appendChild(p); } };
    su.oninput = zeigen; for (const b of fi) b.onclick = () => { zustand.g = b.dataset.g; zeigen(); }; zeigen();
  }
  async tierKarte(id, zurueck = null, ausWelt = false) {
    const A = this.api; let L; try { L = await A.lexLaden(); } catch (e) { return; } const e = L.get(id); if (!e) return; const spielt = this.aktiv; if (spielt) { this.pausiert = true; A.ton.pause(true); } A.eingabeLeeren?.();
    const zu = zurueck || (() => { if (spielt) this.pause(false); else { this.menue.className = 'smenue'; this.menue.innerHTML = ''; } }), f = A.album()[id], zeile = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    this.fenster(e.n, `<div class="slex" style="overflow-y:auto">${f?.bild ? `<img class="slexfoto" src="${f.bild}" alt="${e.n}">` : ''}<p class="slexlatein">${e.l}</p><p class="stext">${e.f}</p><table class="stab">${zeile('Lebensraum', e.r)}${zeile('Wo auf der Erde', e.wo)}${zeile('Größe', e.m)}${zeile('Nahrung', e.e)}${zeile('Gefährdung', e.s)}${zeile('Gruppe', L.stand.gruppen[e.g])}${f ? zeile('Dein Foto', `${new Date(f.t).toLocaleDateString(LOCALE)}${f.ort ? `, ${f.ort}` : ''}`) : ''}</table><div class="sknoepfe" style="margin-top:12px">${ausWelt ? '<button data-k="foto" class="haupt">Foto machen</button>' : ''}<button data-k="hin"${ausWelt ? '' : ' class="haupt"'}>Hinfliegen: ${e.o[2]}</button><button data-k="lex">Tierlexikon</button></div></div>`, zu);
    const los = fn => () => { A.ton.klick?.(); this.menue.className = 'smenue'; this.menue.innerHTML = ''; if (spielt) { this.pausiert = false; A.ton.pause(false); } fn(); };
    const q = k => this.menue.querySelector(`button[data-k="${k}"]`); if (q('foto')) q('foto').onclick = los(() => A.fotoMachen()); q('hin').onclick = los(() => A.tierHin(id)); q('lex').onclick = () => { A.ton.klick?.(); this.tierlexikon(zurueck); };
  }
  // Weltgeschehen: alles, was gerade auf der Erde los ist, nach Art. Klick fliegt hin
  weltgeschehenKnopf() { if (document.getElementById('sweltknopf')) return; const b = document.createElement('button'); b.id = 'sweltknopf'; b.textContent = 'Weltgeschehen'; b.onclick = () => this.weltgeschehen(); document.body.appendChild(b); }
  weltgeschehen(zurueck = null) {
    const A = this.api, W = A.weltgeschehen?.(); if (!W) return; const spielt = this.aktiv; if (spielt) { this.pausiert = true; A.ton.pause(true); } A.eingabeLeeren?.();
    const zu = zurueck || (() => { if (spielt) this.pause(false); else { this.menue.className = 'smenue'; this.menue.innerHTML = ''; } }), G = W.liste(), alle = new Map(); let nr = 0;
    const html = G.map(g => `<h3 class="sweltart"><i style="background:${g.farbe}"></i>${g.name} <small>${g.n}</small></h3><div class="sweltliste">${g.L.map(e => { const k = nr++; alle.set(String(k), e); return `<button data-e="${k}">${e.o || g.name}</button>`; }).join('')}</div>`).join('');
    this.fenster('Weltgeschehen', `<div class="swelt"><p class="stext">Was gerade auf der Erde passiert. Auch als Zeichen auf der Kugel: Erde weit herauszoomen und anklicken. Klick hier fliegt hin.</p>${html || '<p class="stext">Noch keine Daten.</p>'}<p class="ssmall">Stand ${W.statusStand()}. Quellen: USGS, NASA EONET, GDACS, The GDELT Project. Demonstrationen und Kämpfe automatisch aus Nachrichten gelesen, ungeprüft.</p></div>`, zu);
    for (const b of this.menue.querySelectorAll('button[data-e]')) b.onclick = () => { A.ton.klick?.(); this.echtKarte(W.info({ art: 'ereignis', e: alle.get(b.dataset.e) })); };
  }
  folgeChip(L) {
    let c = document.getElementById('sfolge'); if (!L) { c?.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'sfolge'; c.innerHTML = '<span class="sfolgetext"></span><button>Aussteigen</button>'; document.body.appendChild(c); c.querySelector('button').onclick = () => { this.api.ton.klick?.(); this.api.mitfliegenEnde(); }; }
    c.querySelector('.sfolgetext').textContent = `Du fliegst mit ${L.name}${L.typ && L.typ !== L.name ? `, ${L.typ}` : ''}, ${Math.round(Math.round(L.h / 50) * 50).toLocaleString(LOCALE)} m, ${Math.round(L.tempo * 3.6).toLocaleString(LOCALE)} km/h`;
  }
  async werbeKarte(e) {
    const A = this.api, I = await A.werbeInfo(e), spielt = this.aktiv; if (spielt) { this.pausiert = true; A.ton.pause(true); } A.eingabeLeeren?.();
    const zeile = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`, B = e.buchung;
    this.fenster(I.titel, `<div class="swf"><div class="swfkopf"><span class="swfstatus ${B ? 'gebucht' : ''}">${B ? 'Gebucht' : 'Frei'}</span><span class="swfstufe">Stufe ${I.stufe}</span></div>${I.motiv ? `<a class="swfmotiv" ${I.link ? `href="${I.link}" target="_blank" rel="noopener sponsored"` : ''}><img src="${I.motiv}" alt="Werbung von ${B.kunde}"></a>` : ''}${B ? `<p class="stext">Hier wirbt <b>${B.kunde}</b>.</p>` : `<p class="stext">Hier kann deine Werbung hängen. Unternehmen, Künstler, Gastro, jeder kann diesen Platz buchen. Dein Code: <b>${I.code}</b></p>`}
      <div class="sknoepfe">${I.link ? `<a class="swflink haupt" href="${I.link}" target="_blank" rel="noopener sponsored">Zur Website von ${B.kunde}</a>` : !B ? `<a class="swflink haupt" href="${I.mail}">Mail schreiben und Platz anfragen</a>` : ''}<a class="swflink" href="${I.register}" target="_blank" rel="noopener">Im Register öffnen</a></div>
      <table class="stab">${zeile('Code', `<code>${I.code}</code>`)}${zeile('Ort', I.ort)}${zeile('Art', I.art)}${zeile('Größe', I.groesse)}${zeile('Preisstufe', `${I.stufe}, ${I.stufeName}`)}${!B && I.start ? zeile('Startpreis', `${I.start} im Monat`) : ''}</table></div>`, () => { if (spielt) this.pause(false); else { this.menue.className = 'smenue'; this.menue.innerHTML = ''; } });
  }
  zurueck() { return `<div class="sknoepfe"><button data-z="1" class="haupt">Zurück</button></div>`; }
  fenster(titel, inhalt, zurueck = () => this.pauseMenue()) { this.menue.className = 'smenue an pause'; this.menue.innerHTML = `<div class="sfenster breit"><h2>${titel}</h2>${inhalt}${this.zurueck()}</div>`; this.menue.querySelector('button[data-z]').onclick = () => { this.api.ton.klick(); zurueck(); }; }
  steuerung() { this.fenster('Steuerung', `<table class="stab"><tr><td>W A S D, Pfeile</td><td>Laufen, Fahren</td></tr><tr><td>E</td><td>Einsteigen, Aussteigen, auch aus Jet und Hubschrauber am Boden</td></tr><tr><td>G</td><td>Fahrwerk im Jet</td></tr><tr><td>Shift</td><td>Rennen</td></tr><tr><td>Leertaste</td><td>Springen, Handbremse</td></tr><tr><td>H</td><td>Hupe</td></tr><tr><td>J</td><td>Auftrag annehmen</td></tr><tr><td>R</td><td>Radio umschalten</td></tr><tr><td>N</td><td>Ziel für die Navigation</td></tr><tr><td>M</td><td>Ton an oder aus</td></tr><tr><td>Maus ziehen, Rad</td><td>Umschauen, Abstand</td></tr><tr><td>Esc</td><td>Menü</td></tr></table>`); }
  lackMenue() { const F = [['Weiß', [0.98, 0.98, 0.96]], ['Schwarz', [0.05, 0.05, 0.055]], ['Silber', [0.72, 0.73, 0.75]], ['Grau', [0.36, 0.37, 0.39]], ['Rot', [0.62, 0.05, 0.04]], ['Blau', [0.09, 0.16, 0.5]], ['Grün', [0.06, 0.3, 0.16]], ['Gelb', [0.85, 0.62, 0.06]], ['Orange', [0.8, 0.28, 0.04]], ['Türkis', [0.08, 0.5, 0.56]], ['Violett', [0.26, 0.08, 0.42]], ['Pink', [0.85, 0.16, 0.4]]];
    this.fenster('Lackieren', `<p class="stext">100 € für einen neuen Lack. Du hast ${fmtG(this.stand.geld)}.</p><div class="sliste">${F.map((f, i) => `<button data-i="${i}" ${this.stand.geld < 100 ? 'disabled' : ''}><b><i class="sfarbe" style="background:rgb(${f[1].map(x => Math.round(Math.pow(x, 1 / 2.2) * 255)).join(',')})"></i>${f[0]}</b></button>`).join('')}</div>`);
    this.menue.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { const f = F[+b.dataset.i]; if (this.api.lackieren(f[1])) { this.stand.geld -= 100; this.geldZeigen(); speichern(this.stand); this.api.ton.anlassen(); this.pause(false); this.tipp('Frisch lackiert', 3); } }); }
  // Kreuzfahrten: Hafen wählen, das Schiff liegt dort am Kai, die Gangway führt an Bord
  kreuzMenue() { const F = this.api.kreuzfahrt?.(); if (!F?.bereit) { this.tipp('Fahrpläne werden geladen', 2); return; }
    this.fenster('Kreuzfahrt mit der AURORA', `<p class="stext">Wähle einen Hafen. Das Schiff liegt dort am Kai, über die Gangway kommst du an Bord (Taste E) und fährst mit. 290 m lang, 13 Decks, über 1.000 Kabinen, Theater, Casino, Pools.</p>${F.routen.map((R, r) => `<h3 style="margin:10px 0 4px;font-size:14px">${R.name}</h3><div class="sstaedte">${R.haefen.map((H, h) => `<button data-r="${r}" data-h="${h}">${H.name}</button>`).join('')}</div>`).join('')}`);
    this.menue.querySelectorAll('button[data-r]').forEach(b => b.onclick = () => { const z = this.api.kreuzfahrtFuss(+b.dataset.r, +b.dataset.h); if (!z) return; this.pausiert = false; this.api.ton.pause(false); this.api.auftraege()?.abbrechen(); this.api.spielBeenden(); z.amKai = true; this.los(z).then(() => this.tipp(this.api.MOBIL ? 'Geh zur Gangway und tippe Ein Aus' : 'Geh zur Gangway und drück E', 9)); }); }
  reiseMenue() { this.fenster('Schnellreise', `<div class="sstaedte">${STAEDTE.map((s, i) => `<button data-i="${i}">${s[0]}</button>`).join('')}</div><div class="ssuche"><input id="sstadtfeld" type="search" placeholder="Jeden Ort der Erde suchen" autocomplete="off"><div id="sstadtliste" class="sstadtliste"></div></div>`);
    const hin = z => { this.pausiert = false; this.api.ton.pause(false); this.api.auftraege()?.abbrechen(); this.api.spielBeenden(); this.los(z); };
    this.menue.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => { const s = STAEDTE[+b.dataset.i]; hin({ name: s[0], lat: s[1], lon: s[2] }); });
    const f = this.$('sstadtfeld'), L = this.$('sstadtliste'); f.oninput = () => { const t = f.value.trim().toLowerCase(); L.innerHTML = ''; if (t.length < 2) return; for (const o of this.api.suche(t).slice(0, 6)) { const b = el('button', '', `${o.name}<small>${o.land || ''}</small>`); b.onclick = () => hin({ name: o.name, lat: o.lat, lon: o.lon }); L.appendChild(b); } };
  }
  garage() { const liste = this.api.ALLE_FAHRZEUGE(); this.fenster('Garage', `<p class="stext">Lass dir einen Wagen an die nächste Straße bringen. Du hast ${fmtG(this.stand.geld)}.</p><div class="sliste">${liste.map((d, i) => `<button data-i="${i}" ${PREISE[d.id] > this.stand.geld ? 'disabled' : ''}><b>${d.name}</b><small>${PREISE[d.id] ? fmtG(PREISE[d.id]) : 'kostenlos'}</small></button>`).join('')}</div>`);
    this.menue.querySelectorAll('button[data-i]').forEach(b => b.onclick = async () => { const d = liste[+b.dataset.i]; this.stand.geld -= PREISE[d.id] || 0; this.geldZeigen(); this.pausiert = false; this.api.ton.pause(false); this.menue.className = 'smenue'; this.menue.innerHTML = ''; await this.api.spielStarten('fahren', d); this.api.ton.anlassen(); speichern(this.stand); }); }
  figurWahl() { const liste = this.api.ALLE_MENSCHEN().filter(d => !d.basis).concat(this.api.ALLE_MENSCHEN().filter(d => d.basis).slice(0, 12)); this.fenster('Figur wählen', `<div class="sliste">${liste.map((d, i) => `<button data-i="${i}"><b>${(d.name || d.id).replace(' (Higgsfield)', '')}</b></button>`).join('')}</div>`);
    this.menue.querySelectorAll('button[data-i]').forEach(b => b.onclick = async () => { const d = liste[+b.dataset.i]; this.stand.figur = d.id; speichern(this.stand); this.pausiert = false; this.api.ton.pause(false); this.menue.className = 'smenue'; this.menue.innerHTML = ''; await this.api.spielStarten('fuss', d); }); }
  reisepass() { const S = this.stand, l = Object.keys(S.laender), st = Object.keys(S.staedte), E = S.erfolge; this.fenster('Reisepass', `<div class="szahlen"><div><b>${fmtG(S.geld)}</b><small>Konto</small></div><div><b>${l.length}</b><small>Länder</small></div><div><b>${st.length}</b><small>Orte</small></div><div><b>${Math.round(S.statistik.km)}</b><small>km gefahren</small></div><div><b>${S.statistik.auftraege}</b><small>Aufträge</small></div></div>
    <p class="stext">${l.length ? l.join(' · ') : 'Noch kein Stempel. Fahr los.'}</p><h3>Erfolge</h3><div class="serfolge">${ERFOLGE.map(e => `<div class="${E[e.id] ? 'erreicht' : ''}"><b>${e.name}</b><small>${e.text} · ${fmtG(e.geld)}</small></div>`).join('')}</div>`); }
  einstellungen(zurueck) { const E = this.stand.einst; this.fenster('Einstellungen', `<div class="swahl"><span>Sprache / Language</span><button data-s="en" class="${SPRACHE === 'en' ? 'an' : ''}">English</button><button data-s="de" class="${SPRACHE === 'de' ? 'an' : ''}">Deutsch</button></div><label class="sregler">Wetter <select id="eWetter">${[['live', 'Live, wie gerade in der echten Welt'], ...Object.entries(this.api.WETTER || {}).map(([k, v]) => [k, v.name])].map(([k, n]) => `<option value="${k}" ${(this.api.wetterWahl?.() || 'live') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label class="sregler">Lautstärke <input id="eLaut" type="range" min="0" max="1" step="0.05" value="${E.laut}"></label><label class="sregler">Kamera Empfindlichkeit <input id="eEmpf" type="range" min="0.4" max="2" step="0.1" value="${E.empf}"></label>
    <div class="swahl"><span>Grafik</span>${[['auto', 'Automatisch'], ['hoch', 'Hoch\u200b'], ['mittel', 'Mittel'], ['niedrig', 'Niedrig']].map(([k, n]) => `<button data-g="${k}" class="${E.grafik === k ? 'an' : ''}">${n}</button>`).join('')}</div>
    <div class="swahl"><span>Tageszeit</span>${[['schnell', '1 Stunde in 2 Minuten'], ['langsam', '1 Stunde in 10 Minuten'], ['fest', 'Fest']].map(([k, n]) => `<button data-z2="${k}" class="${E.zeit === k ? 'an' : ''}">${n}</button>`).join('')}</div>
    <label class="sregler">Radio Lautstärke <input id="eRadioL" type="range" min="0" max="1" step="0.05" value="${E.radioLaut ?? 0.5}"></label>
    <div class="swahl"><span>Radio</span>${this.api.SENDER.map((r, i) => `<button data-r="${i}" class="${(E.radio ?? 1) === i ? 'an' : ''}">${r.name}</button>`).join('')}</div>
    <div class="swahl"><span>Bewegungsunschärfe</span><button data-blur="1" class="${E.blur !== false ? 'an' : ''}">${E.blur !== false ? 'An' : 'Aus'}</button></div>
    <div class="swahl"><span>Schadensmodell</span><button data-schaden="1" class="${E.schaden ? 'an' : ''}">${E.schaden ? 'An' : 'Aus'}</button></div>
    <div class="swahl"><span>Bilder je Sekunde</span><button data-fps="1" class="${E.fps ? 'an' : ''}">${E.fps ? 'An' : 'Aus'}</button></div>
    <div class="swahl"><span>Spielstand</span><button data-loesch="1">Löschen</button></div>`, zurueck);
    this.menue.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => { if (b.dataset.s !== SPRACHE) { speichern(this.stand); spracheSetzen(b.dataset.s); } });
    if (this.$('eWetter')) this.$('eWetter').onchange = e => { this.api.setWetter?.(e.target.value); E.wetter = e.target.value; speichern(this.stand); };
    this.$('eLaut').oninput = e => { E.laut = +e.target.value; this.api.ton.setzeLaut(E.laut); speichern(this.stand); };
    this.$('eEmpf').oninput = e => { E.empf = +e.target.value; this.api.empfindlichkeit?.(E.empf); speichern(this.stand); };
    this.$('eRadioL').oninput = e => { E.radioLaut = +e.target.value; this.api.radio.setzeLaut(E.radioLaut); speichern(this.stand); };
    this.menue.querySelectorAll('button[data-r]').forEach(b => b.onclick = () => { E.radio = +b.dataset.r; this.api.radio.setze(E.radio); speichern(this.stand); this.einstellungen(zurueck); });
    this.menue.querySelector('button[data-blur]').onclick = () => { E.blur = E.blur === false; speichern(this.stand); this.einstellungen(zurueck); };
    this.menue.querySelector('button[data-schaden]').onclick = () => { E.schaden = !E.schaden; speichern(this.stand); this.api.schadenModus?.(E.schaden); this.einstellungen(zurueck); };   // Wunsch Nr. 97
    this.menue.querySelectorAll('button[data-g]').forEach(b => b.onclick = () => { E.grafik = b.dataset.g; this.api.grafik(E.grafik); speichern(this.stand); this.einstellungen(zurueck); });
    this.menue.querySelectorAll('button[data-z2]').forEach(b => b.onclick = () => { E.zeit = b.dataset.z2; speichern(this.stand); this.einstellungen(zurueck); });
    this.menue.querySelector('button[data-fps]').onclick = () => { E.fps = !E.fps; document.body.classList.toggle('sfps', E.fps); speichern(this.stand); this.einstellungen(zurueck); };
    this.menue.querySelector('button[data-loesch]').onclick = () => { zuruecksetzen(); this.stand = laden(); this.einstellungen(zurueck); this.geldZeigen(); };
  }
  auftragWahl() { const A = this.api.auftraege(); if (this.api.modus() !== 'fahren') { this.tipp('Erst in ein Auto steigen (E), dann gibt es Aufträge'); return; } if (A.angebot && A.starten(A.angebot.art)) return; const arten = ['taxi', 'lieferung', 'rennen'].sort(() => Math.random() - 0.5); for (const art of arten) if (A.starten(art)) return; }
  // ---------- Anzeige ----------
  landung(art) { const S = this.stand; if (art === 'heli') S.statistik.landungHeli = (S.statistik.landungHeli || 0) + 1; else S.statistik.landungJet = (S.statistik.landungJet || 0) + 1; this.erfolgePruefen(); }
  tipp(t, s = 4) { const e = this.$('stipp'); e.textContent = t; e.classList.add('an'); this.tTipp = s; }
  auftragZeile(a) { const e = this.$('sauftrag'); if (!a) { e.classList.remove('an'); return; } e.classList.add('an'); e.innerHTML = `<b>${a.titel}</b><span>${a.zeile}</span>${a.zeit ? `<i class="${a.knapp ? 'knapp' : ''}">${a.zeit}</i>` : ''}`; }
  sterne(n, blink) { if (n === this._st && blink === this._bl) return; this._st = n; this._bl = blink; const e = this.$('ssterne'); e.innerHTML = n ? '<b>★</b>'.repeat(n) + '<i>★</i>'.repeat(3 - n) : ''; e.classList.toggle('blink', !!(n && blink)); }
  geldZeigen() { this.$('sgeld').textContent = fmtG(this.stand.geld); }
  zahlen(betrag, grund) { const S = this.stand; S.geld += betrag; S.statistik.auftraege += grund?.startsWith('Erfolg') || grund?.startsWith('Neues') || grund?.startsWith('Münze') ? 0 : 1; S.statistik.einnahmen += betrag; this.geldZeigen(); const g = this.$('sgewinn'); g.innerHTML = `<b>+${fmtG(betrag)}</b><span>${grund || ''}</span>`; g.classList.remove('an'); void g.offsetWidth; g.classList.add('an'); this.api.ton.erfolg(); this.erfolgePruefen(); speichern(S); }
  erfolgePruefen() { const S = this.stand; for (const e of ERFOLGE) if (!S.erfolge[e.id] && e.pruef(S)) { S.erfolge[e.id] = Date.now(); S.geld += e.geld; S.statistik.einnahmen += e.geld; this.geldZeigen(); setTimeout(() => { const g = this.$('sgewinn'); g.innerHTML = `<b>Erfolg: ${e.name}</b><span>${e.text}, +${fmtG(e.geld)}</span>`; g.classList.remove('an'); void g.offsetWidth; g.classList.add('an'); this.api.ton.erfolg(); }, 2600); } }
  ortBanner(t, u) { const e = this.$('sortname'); e.innerHTML = `<b>${t}</b>${u ? `<span>${u}</span>` : ''}`; e.classList.remove('an'); void e.offsetWidth; e.classList.add('an'); }
  // ---------- je Bild ----------
  update(dt) {
    if ((this.tWetterT = (this.tWetterT || 0) - dt) < 0) { this.tWetterT = 2; const e = this.$('swetter'), t = this.api.wetterText?.() || ''; if (e && e._t !== t) { e._t = t; e.textContent = t; } }
    if (!this.aktiv || this.pausiert) return;
    const A = this.api, W = A.auto(), F = A.figur(), m = A.modus(), S = this.stand;
    if (this.tTipp > 0 && (this.tTipp -= dt) <= 0) this.$('stipp').classList.remove('an');
    // Werbefläche in der Nähe (Wunsch Nr. 59): Hinweis, B oder Tippen öffnet die Karte
    if ((this.tWf = (this.tWf || 0) - dt) < 0) { this.tWf = 0.35; const w = m === 'fuss' || m === 'fahren' ? A.werbeNah?.() : null; if (w !== this._wf) { this._wf = w; const e = this.$('swerbe'); if (w) e.innerHTML = `<b>${w.buchung ? 'Gebucht' : 'Fläche frei'}</b> ${w.buchung ? w.buchung.kunde : `${w.name || WF_ARTEN[w.art]?.name || 'Werbefläche'}, Code ${wfCodeText(w.id)}`}${A.MOBIL ? '' : ' <kbd>B</kbd>'}`; e.classList.toggle('an', !!w); e.classList.toggle('gebucht', !!w?.buchung); } }
    if ((this.tNah = (this.tNah || 0) - dt) < 0) { this.tNah = 0.25; const nah = m === 'fuss' && A.autoInReichweite?.(); if (nah !== this._nah) { this._nah = nah; const h = this.$('shinweis'); if (nah) h.textContent = A.MOBIL ? `Tippe Ein Aus: ${nah}` : `E ${T(nah)}`; h.classList.toggle('an', !!nah); } }
    const zeigeTempo = m === 'fahren' && W; this.$('stempo').classList.toggle('an', !!zeigeTempo);
    if (zeigeTempo) { const k = Math.round(W.kmh); if (k !== this._k) { this._k = k; this.$('stZahl').textContent = k; } const g = W.rueckwaerts && W.vLong < -0.2 ? 'R' : `${W.gang + 1}`; if (g !== this._g) { this._g = g; this.$('stGang').textContent = g; } this.$('stDreh').style.transform = `scaleX(${Math.min(1, W.drehzahl || 0).toFixed(3)})`; const sw = W.schaden?.wert || 0; if (sw !== this._sw) { this._sw = sw; this.$('stSchadenBox').classList.toggle('an', sw > 0.02); this.$('stSchaden').style.transform = `scaleX(${(1 - sw).toFixed(3)})`; this.$('stSchaden').classList.toggle('kritisch', sw > 0.65); } }
    // Strecke und Reisepass
    const p = A.spielerGeo();
    if (p) { if (this.letzteGeo && m === 'fahren') { const dx = (p.lat - this.letzteGeo.lat) * 111320, dz = (p.lon - this.letzteGeo.lon) * 111320 * Math.cos(p.lat * 0.01745), d = Math.hypot(dx, dz); if (d < 200) { this.wegM += d; if (this.wegM > 200) { S.statistik.km += this.wegM / 1000; this.wegM = 0; this.erfolgePruefen(); } } } this.letzteGeo = p; }
    if ((this.tOrt -= dt) < 0) { this.tOrt = 3; const n = A.ortName(p), land = A.land(); if (n && n !== this.letzterOrt) { this.letzterOrt = n; this.ortBanner(n, land || ''); if (!S.staedte[n]) { S.staedte[n] = Date.now(); } } if (land && !S.laender[land]) { const erstes = !Object.keys(S.laender).length; S.laender[land] = Date.now(); if (!erstes) this.zahlen(250, `Neues Land: ${land}`); else speichern(S); this.erfolgePruefen(); } }
    // Tageszeit und Wetter laufen
    const z = S.einst.zeit; if (z !== 'fest') { this._uhr += dt; if (this._uhr > 0.4) { A.uhrWeiter(this._uhr / (z === 'schnell' ? 120 : 600)); this._uhr = 0; } }
    if ((this.tWetter -= dt) < 0) { this.tWetter = 240 + Math.random() * 480; const r = Math.random(); A.setWetter(r < 0.58 ? 'klar' : r < 0.86 ? 'wolkig' : 'regen'); }
    // regelmäßig sichern
    if ((this.tSpeicher += dt) > 20 && p) { this.tSpeicher = 0; S.lage = { name: this.letzterOrt || S.lage?.name, lat: p.lat, lon: p.lon }; S.utc = A.utc(); speichern(S); }
  }
}
