// Ton (Nr. 107, 18.11.2026): die Klangwelt kommt aus echten Aufnahmen statt nur aus Oszillatoren. Die Dateien liegen in assets/ton (MP3, Quellen und Lizenzen in
// assets/ton/quellen.json, gebaut mit tools/ton_bauen.py): Kulisse als Schleifen (dichter Verkehr vom S Bahnhof Greifswalder Straße, ruhige Straße, Görlitzer Park,
// Vögel, Nacht, Regen, Wind, Laub, Ufer, Stimmen, Grillen), eigenes Fahrzeug (Leerlauf in drei Oktavschichten, Abrollen, Fahrtwind, Quietschen, Hupe, Anlasser, Tür),
// Schritte auf Beton, Einzelklänge (Hupen, Amsel, Spatz, Krähe, Möwe, Martinshorn, Donner, Zug, Klingel, Hund, Glocke) und Fahrzeuge im Raum (ton.raum, PannerNode).
// Der erzeugte Klang von vorher (05.11.2026) bleibt als Rückfall: er läuft, bis eine Aufnahme geladen und dekodiert ist, und dort, wo eine Datei fehlt. Nichts wirft.
// Startet erst nach der ersten Geste (Browser Regel), lädt danach im Hintergrund nach. Lautstärke 0 bis 1, M schaltet stumm.
// Runde 2 (19.11.2026): auch die letzten erzeugten Klänge kommen aus Aufnahmen. Aufprall in drei Stärken (crash_1 bis crash_3) und der dumpfe Schlag (ton.stoss),
// das Blindensignal der Fußgängerampel (ton.ereignis 'ampel' und 'ampel_frei') und der Motor des Benziners ab rund 1150 Umdrehungen: Aufnahmen eines Vierzylinders
// vom Rollenprüfstand bei 2500 und 6300 Umdrehungen, je unter voller Last und ohne Last, überblendet nach Drehzahl und Last (MOTOR). Erzeugt bleiben der kleine
// Anteil im Leerlauf, der Diesel der großen Wagen (Hybrid wie bisher) und alles als Rückfall. Zum Vergleich im Spiel: ?motor=alt schaltet den Motor von vorher ein.
import { MOBIL } from './geraet.js';

const ORT = new URL('../assets/ton/', import.meta.url);
// Jede Schleife trägt vorn und hinten RAND Sekunden von sich selbst (tools/ton_bauen.py). Gespielt wird das Fenster ab RAND / 2 mit genau der Schleifenlänge:
// das bleibt nahtlos, egal wie viele Millisekunden Stille der MP3 Dekoder des Browsers vorn anhängt oder abschneidet.
const RAND = 0.1, MAX = MOBIL ? 16 : 24, LEER = [];
// Name: [Schleifenlänge in s (0 heißt Einzelklang), 1 heißt auch am Handy laden]. Die Reihenfolge ist die Ladereihenfolge: zuerst, was man sofort hört.
export const TON_DATEIEN = {
  stadt_dicht: [26, 1], stadt_ruhig: [26, 1], schritt_1: [0, 1], schritt_2: [0, 1], schritt_3: [0, 1], motor_leer: [2.95891, 1], rollen: [8, 1], v_pkw: [3, 1], park: [26, 1],
  motor_mitte: [2.39485, 1], motor_hoch: [1.06254, 1], crash_2: [0, 1], crash_1: [0, 1],
  hupe_halten: [0.89823, 1], hupe_1: [0, 1], tuer_zu: [0, 1], anlasser: [0, 1], quietschen: [1.05, 1], regen: [20, 1], amsel_1: [0, 1], spatz_1: [0, 1], v_bus: [3.08449, 1],
  diesel_leer: [2.94723, 1], sirene: [2.92746, 1], donner_1: [0, 1], klingel_1: [0, 1], zug: [5, 1], crash_3: [0, 1], schlag: [0, 1], ampel: [0, 1], ampel_frei: [0, 1],
  motor_mitte_frei: [2.42084, 0], motor_hoch_frei: [1.27757, 0],
  nacht: [24, 0], voegel: [24, 0], wind: [20, 0], laub: [20, 0], ufer: [24, 0], stimmen: [24, 0], grillen: [12, 0], v_lkw: [2.1, 0], v_tram: [4, 0], v_rad: [5, 0],
  schritt_4: [0, 0], schritt_5: [0, 0], schritt_6: [0, 0], hupe_2: [0, 0], hupe_3: [0, 0], hupe_bus: [0, 0], hupe_lkw: [0, 0], bremse: [0, 0], tuer_auf: [0, 0],
  amsel_2: [0, 0], amsel_3: [0, 0], rotkehlchen: [0, 0], spatz_2: [0, 0], kraehe: [0, 0], moewe_1: [0, 0], moewe_2: [0, 0], moewe_3: [0, 0], donner_2: [0, 0], donner_3: [0, 0],
  zug_horn: [0, 0], sbahn_tuer: [0, 0], klingel_2: [0, 0], hund_1: [0, 0], hund_2: [0, 0], glocke: [0, 0], kuh: [0, 0], schaf: [0, 0], pferd: [0, 0],
};
// Fahrzeuge im Raum: [Schleife, Pegel bei 8 m, Anteil im Stand, Tonhöhe im Stand, Zuwachs der Tonhöhe bis rund 50 km/h, Ersatz wenn die Schleife fehlt]
const RAUM_ART = { pkw: ['v_pkw', 1.6, 0.08, 0.8, 0.3, ''], bus: ['v_bus', 2.0, 0.45, 0.85, 0.5, 'v_pkw'], lkw: ['v_lkw', 2.4, 0.15, 0.72, 0.3, 'v_bus'], tram: ['v_tram', 2.2, 0.03, 0.8, 0.25, ''], rad: ['v_rad', 0.5, 0, 0.75, 0.45, ''] };
// die Klassen aus kit/vehicles.js gelten auch als Art: so kann das Spiel seine Verkehrsliste unverändert übergeben
RAUM_ART.taxi = RAUM_ART.pkw; RAUM_ART.lieferung = ['v_pkw', 1.9, 0.12, 0.7, 0.28, '']; RAUM_ART.traktor = RAUM_ART.lkw;
// Motor vom Rollenprüfstand (Runde 2): Zündfolge der fertigen Schleifen in Hz, gemessen mit artifacts/ton_nr107/motor_probe.py messen. Die Abspielrate ist immer
// Zündfolge im Spiel durch diesen Wert: so sitzt jeder Teilton der Aufnahme auf der Drehzahl des Wagens. ML und MF: Pegel unter voller Last und ohne Last.
const MOTOR = { mitte: 85.17, mitteFrei: 80.92, hoch: 207.62, hochFrei: 209.7 }, ML = 1.22, MF = 0.58;
const SCHRITT = ['schritt_1', 'schritt_2', 'schritt_3', 'schritt_4', 'schritt_5', 'schritt_6'], HUPEN = ['hupe_1', 'hupe_2', 'hupe_3'], MOEWEN = ['moewe_1', 'moewe_2', 'moewe_3'];
const VOEGEL = ['amsel_1', 'amsel_2', 'amsel_3', 'rotkehlchen', 'spatz_1', 'spatz_2', 'amsel_1', 'spatz_1'];
// ton.ereignis(art, x, y, z): [Aufnahmen, Pegel in 5 m Abstand]. Laute Quellen (Hupe, Glocke, Donner) tragen weit, darum der hohe Pegel.
const EREIGNIS = {
  hupe: [HUPEN, 2.2], hupe_bus: [['hupe_bus'], 2.4], hupe_lkw: [['hupe_lkw'], 2.6], klingel: [['klingel_1', 'klingel_2'], 1], hund: [['hund_1', 'hund_2'], 1.5], glocke: [['glocke'], 7],
  vogel: [VOEGEL, 0.9], amsel: [['amsel_1', 'amsel_2', 'amsel_3'], 0.9], spatz: [['spatz_1', 'spatz_2'], 0.9], kraehe: [['kraehe'], 1.2], moewe: [MOEWEN, 1.2], bremse: [['bremse'], 1.3],
  tuer: [['tuer_zu'], 0.9], tuer_auf: [['tuer_auf'], 0.9], anlasser: [['anlasser'], 1], zug_horn: [['zug_horn'], 5], sbahn_tuer: [['sbahn_tuer'], 1.2], donner: [['donner_1', 'donner_2'], 8],
  schritt: [SCHRITT, 0.5], kuh: [['kuh'], 1.6], schaf: [['schaf'], 1.4], pferd: [['pferd'], 1.6],
  stoss_leicht: [['crash_1'], 1.8], stoss: [['crash_2'], 2.2], stoss_schwer: [['crash_3'], 2.6], schlag: [['schlag'], 1.6],
};
const stufe = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const setzeOrt = (p, x, y, z) => { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); };

export class Ton {
  constructor() {
    this.ctx = null; this.laut = 0.8; this.stumm = false; this.s = {}; this.schrittPhase = 0; this.tStadt = 2; this.an = false;
    // Nr. 107: b sind die dekodierten Aufnahmen, bn die Schleifenbahnen, stimmen zählt alle laufenden Quellen (Grenze MAX), hx bis hz ist der Hörer aus ton.raum
    this.b = {}; this.bn = null; this.mb = null; this.ev = null; this.rv = null; this.stimmen = 0; this.schrittAlt = -1; this.hx = 0; this.hy = 0; this.hz = 0; this.hoert = false; this.rT = 0; this.mBusZ = 1;
    // Runde 2: synA ist der Anteil des erzeugten Motors (1 ohne Prüfstandaufnahmen), motorAlt schaltet zum Vergleich den Motor von vorher ein (?motor=alt)
    this.synA = 1; this.tStoss = -9; this.ampelT = null; this.motorAlt = typeof location !== 'undefined' && /[?&]motor=alt\b/.test(location.search || '');
    const lo = () => this.starten(); addEventListener('pointerdown', lo, { passive: true }); addEventListener('keydown', lo); addEventListener('touchend', lo, { passive: true });
  }
  starten() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.pausiert) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(), S = this.s;
    S.master = c.createGain(); S.master.gain.value = 0; const komp = c.createDynamicsCompressor(); komp.threshold.value = -14; komp.ratio.value = 5; S.dumpf = c.createBiquadFilter(); S.dumpf.type = 'lowpass'; S.dumpf.frequency.value = 20000; S.dumpf.Q.value = 0.4; S.master.connect(S.dumpf); S.dumpf.connect(komp); komp.connect(c.destination);
    // Sammelschienen (Nr. 107): alles mündet in master, damit stumm, laut, pause und der Tiefpass unter Wasser für jede Quelle gelten
    const schiene = g => { const n = c.createGain(); n.gain.value = g; n.connect(S.master); return n; };
    S.kulisse = schiene(1); S.fahr = schiene(1); S.raum = schiene(0); S.fx = schiene(1); S.mBus = schiene(1);
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; l = 0.985 * l + 0.015 * w; d[i] = w * 0.5 + l * 2.4; } this.rausch = b;
    const quelle = () => { const q = c.createBufferSource(); q.buffer = b; q.loop = true; q.start(); return q; };
    const kette = (q, typ, f, Q, g = 0) => { const fi = c.createBiquadFilter(); fi.type = typ; fi.frequency.value = f; fi.Q.value = Q; const ga = c.createGain(); ga.gain.value = g; q.connect(fi); fi.connect(ga); ga.connect(S.master); return { fi, ga }; };
    // Motor (erzeugt): bleibt als Lastanteil unter den echten Schichten und als Rückfall
    const form = c.createWaveShaper(); const k = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 2.2); } form.curve = k; form.oversample = '2x';
    S.mFi = c.createBiquadFilter(); S.mFi.type = 'lowpass'; S.mFi.frequency.value = 500; S.mFi.Q.value = 0.9; S.mGa = c.createGain(); S.mGa.gain.value = 0; form.connect(S.mFi); S.mFi.connect(S.mGa); S.mGa.connect(S.mBus);
    S.mOsc = [['sawtooth', 1, 0.5], ['sawtooth', 1.012, 0.42], ['square', 0.5, 0.34], ['sawtooth', 2.01, 0.12]].map(([t, v, g]) => { const o = c.createOscillator(); o.type = t; const ga = c.createGain(); ga.gain.value = g; o.connect(ga); ga.connect(form); o.start(); return { o, v }; });
    S.reifen = kette(quelle(), 'bandpass', 1400, 2.2); S.wind = kette(quelle(), 'lowpass', 500, 0.3);
    // Fahrphysik Fassung 4 (Nr. 100): Ansaug und Auspuffrauschen nach Last (Bandpass auf der dritten Ordnung), Reifenquietschen mit tonalem Anteil
    S.rasp = kette(quelle(), 'bandpass', 300, 1.4); S.qGa = c.createGain(); S.qGa.gain.value = 0; const qF = c.createBiquadFilter(); qF.type = 'bandpass'; qF.frequency.value = 950; qF.Q.value = 3; S.qO = c.createOscillator(); S.qO.type = 'triangle'; S.qO.frequency.value = 800; S.qO.connect(qF); qF.connect(S.qGa); S.qGa.connect(S.master); S.qO.start(); S.stadt = kette(quelle(), 'lowpass', 420, 0.2); S.regen = kette(quelle(), 'highpass', 2400, 0.3);
    // Hupe
    S.hGa = c.createGain(); S.hGa.gain.value = 0; const hF = c.createBiquadFilter(); hF.type = 'bandpass'; hF.frequency.value = 900; hF.Q.value = 0.7; hF.connect(S.hGa); S.hGa.connect(S.master); for (const f of [415, 523]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hF); o.start(); }
    // Grillen: hohe Töne, am Pulsieren erkennbar
    S.grGa = c.createGain(); S.grGa.gain.value = 0; const gr = c.createOscillator(); gr.frequency.value = 4300; const grAm = c.createGain(); grAm.gain.value = 0; const lfo = c.createOscillator(); lfo.frequency.value = 22; const lfoG = c.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(grAm.gain); gr.connect(grAm); grAm.connect(S.grGa); S.grGa.connect(S.master); gr.start(); lfo.start();
    // Natur: Laub im Wind, Brandung, Insekten der Tropen (zwei pulsierende Töne)
    S.laub = kette(quelle(), 'bandpass', 3000, 0.5); S.brandung = kette(quelle(), 'lowpass', 620, 0.4);
    S.inGa = c.createGain(); S.inGa.gain.value = 0; for (const [f, r] of [[5200, 38], [6400, 27]]) { const os = c.createOscillator(); os.frequency.value = f; const am = c.createGain(); am.gain.value = 0; const lf = c.createOscillator(); lf.frequency.value = r; const lg = c.createGain(); lg.gain.value = 0.5; lf.connect(lg); lg.connect(am.gain); os.connect(am); am.connect(S.inGa); os.start(); lf.start(); } S.inGa.connect(S.master);
    try { this.echtAufbau(); } catch (e) { this.bn = null; }
    this.an = true; this.pegel(); this.laden();
  }
  // Nr. 107: feste Bahnen und Plätze für die Aufnahmen. Hier entsteht alles einmal, im Spiel kommen nur noch die Quellen selbst hinzu.
  echtAufbau() {
    const c = this.ctx, S = this.s;
    // Bahn: eine Schleife mit eigenem Pegel. Ihre Quelle entsteht erst, wenn sie hörbar wird, und endet kurz nach dem Verstummen: nie mehr Stimmen als nötig.
    const bahn = (p, ziel, tief = 0, vor = 0) => { const ga = c.createGain(); ga.gain.value = 0; ga.connect(ziel); let ein = ga, fi = null; if (tief) { fi = c.createBiquadFilter(); fi.type = 'lowpass'; fi.frequency.value = tief; fi.Q.value = 0.3; fi.connect(ga); ein = fi; } return { p, ga, ein, fi, vor, q: null, g: 0, r: 1, f: tief, aus: 0 }; };
    const B = {}; for (const n of ['stadt_dicht', 'stadt_ruhig', 'nacht', 'park', 'voegel', 'laub', 'wind', 'regen', 'ufer', 'stimmen', 'grillen']) B[n] = bahn(n, S.kulisse);
    B.m0 = bahn('motor_leer', S.fahr, 0, 1); B.m1 = bahn('motor_leer', S.fahr, 0, 1); B.m2 = bahn('motor_leer', S.fahr, 0, 1); B.rollen = bahn('rollen', S.fahr, 0, 1); B.fahrtwind = bahn('wind', S.fahr, 500);
    B.mM = bahn('motor_mitte', S.fahr, 0, 1); B.mH = bahn('motor_hoch', S.fahr, 0, 1); B.mMf = bahn('motor_mitte_frei', S.fahr, 0, 1); B.mHf = bahn('motor_hoch_frei', S.fahr, 0, 1);
    B.quietschen = bahn('quietschen', S.fahr, 0, 1); B.hupe = bahn('hupe_halten', S.fahr, 0, 1); B.sirene = bahn('sirene', S.fx, 0, 1); B.zug = bahn('zug', S.fx);
    const pan = (ref, ziel) => { const p = c.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 10000; p.connect(ziel); return p; };
    const tief = () => { const fi = c.createBiquadFilter(); fi.type = 'lowpass'; fi.frequency.value = 18000; fi.Q.value = 0.3; return fi; };
    // Plätze für Einzelklänge an einer Stelle der Welt: Abstand macht leiser (PannerNode) und dumpfer (Tiefpass)
    const ev = []; for (let i = 0; i < (MOBIL ? 3 : 6); i++) { const p = pan(5, S.fx), fi = tief(); fi.connect(p); ev.push({ pan: p, fi, ein: fi, frei: 0 }); }
    // Stimmen für Fahrzeuge im Raum: bis rund 60 m deutlich (8 m Bezug, umgekehrt zum Abstand), ab 75 m blendet ton.raum sie bis 120 m ganz aus
    const rv = []; for (let i = 0; i < (MOBIL ? 4 : 8); i++) { const p = pan(8, S.raum), ga = c.createGain(), fi = MOBIL ? null : tief(); ga.gain.value = 0; ga.connect(p); if (fi) fi.connect(ga); rv.push({ id: null, art: '', q: null, pan: p, ga, fi, ein: fi || ga, g: 0, r: 1, f: 18000, d: -1, dop: 1, frei: 0, da: false }); }
    this.rI = new Int32Array(rv.length); this.rD = new Float32Array(rv.length); this.rZ = new Int8Array(rv.length);
    this.ev = ev; this.rv = rv; this.mb = [B.m0, B.m1, B.m2]; this.bn = B;
  }
  // Aufnahmen nachladen, zwei zugleich, ohne den Start zu bremsen. Was fehlt oder sich nicht dekodieren lässt, bleibt einfach beim erzeugten Klang.
  async laden() {
    if (this.laedt || !this.bn) return; this.laedt = true; const c = this.ctx, namen = Object.keys(TON_DATEIEN).filter(n => !MOBIL || TON_DATEIEN[n][1]); let i = 0;
    const einer = async () => {
      while (i < namen.length) {
        const n = namen[i++];
        try {
          const r = await fetch(new URL(n + '.mp3', ORT)); if (!r.ok) continue; const roh = await r.arrayBuffer();
          let p = await new Promise((ja, nein) => { const v = c.decodeAudioData(roh, ja, nein); if (v && v.catch) v.catch(() => {}); });
          // Handy: Stereo zu Mono, das halbiert den Speicher der langen Schleifen
          if (MOBIL && p.numberOfChannels > 1) { const m = c.createBuffer(1, p.length, p.sampleRate), z = m.getChannelData(0), li = p.getChannelData(0), re = p.getChannelData(1); for (let j = 0; j < z.length; j++) z[j] = (li[j] + re[j]) * 0.5; p = m; }
          this.b[n] = p;
        } catch (e) {}
      }
    };
    try { await Promise.all([einer(), einer()]); } catch (e) {}
    this.geladen = true;
  }
  // Schleife auf Pegel g (und Tonhöhe rate) ziehen. Sie startet erst über 0.015 und endet kurz nachdem sie unter 0.008 fällt: was man ohnehin nicht hört, belegt
  // keine Stimme. Das eigene Fahrzeug hat Vorrang (b.vor), die übrigen Schleifen lassen zwei Stimmen frei.
  setze(b, g, tau = 0.5, rate = 0) {
    const c = this.ctx, t = c.currentTime;
    if (g > 0.015 && !b.q) {
      const p = this.b[b.p]; if (!p || this.stimmen >= (b.vor ? MAX : MAX - 2)) return;
      const q = c.createBufferSource(), l = TON_DATEIEN[b.p][0]; q.buffer = p; q.loop = true; q.loopStart = RAND / 2; q.loopEnd = RAND / 2 + l; if (rate) q.playbackRate.value = rate;
      q.connect(b.ein); q.start(t, RAND / 2 + Math.random() * l * 0.98); b.q = q; b.g = 0; b.r = rate || 1; b.aus = 0; b.ga.gain.cancelScheduledValues(t); b.ga.gain.setValueAtTime(0, t); this.stimmen++;
    }
    if (!b.q) return;
    if (g > 0.008) { b.aus = 0; if (Math.abs(g - b.g) > 0.003 + b.g * 0.02) { b.ga.gain.setTargetAtTime(g, t, tau); b.g = g; } }
    else { if (b.g !== 0) { b.ga.gain.setTargetAtTime(0, t, tau); b.g = 0; } if (!b.aus) b.aus = t + 1 + tau * 5; else if (t > b.aus) this.halt(b); }
    if (rate && b.q && Math.abs(rate - b.r) > 0.003) { b.q.playbackRate.setTargetAtTime(rate, t, 0.05); b.r = rate; }
  }
  halt(b) { if (!b.q) return; try { b.q.stop(); } catch (e) {} b.q.disconnect(); b.q = null; b.g = 0; b.aus = 0; this.stimmen--; }
  // Einzelklang aus dem Vorrat. Liefert false, wenn die Aufnahme (noch) fehlt: dann spielt der Aufrufer den erzeugten Klang. tief: Tiefpass in Hz für Fernes.
  klang(name, g = 1, rate = 1, ziel = null, start = 0, tief = 0) {
    const p = this.b[name]; if (!this.an || !p) return false; if (this.stimmen >= MAX) return true;
    const c = this.ctx, q = c.createBufferSource(), ga = c.createGain(); q.buffer = p; q.playbackRate.value = rate; ga.gain.value = g; let aus = ga;
    if (tief) { aus = c.createBiquadFilter(); aus.type = 'lowpass'; aus.frequency.value = tief; aus.Q.value = 0.3; ga.connect(aus); }
    q.connect(ga); aus.connect(ziel || this.s.fx); this.stimmen++; q.onended = () => { this.stimmen--; aus.disconnect(); }; q.start(c.currentTime + start); return true;
  }
  // Freien Platz an die Stelle (dx, dy, dz) relativ zum Hörer legen
  platz(dx, dy, dz, dauer = 1.5) {
    const E = this.ev; let sl = E[0]; for (let i = 1; i < E.length; i++) if (E[i].frei < sl.frei) sl = E[i];
    setzeOrt(sl.pan, dx, dy, dz); sl.fi.frequency.value = Math.min(18000, Math.max(700, 18000 / (1 + Math.hypot(dx, dy, dz) / 45))); sl.frei = this.ctx.currentTime + dauer; return sl;
  }
  // Einzelklang irgendwo um den Hörer herum, zwischen von und bis Metern entfernt
  fern(name, g, von, bis, rate = 1) {
    const p = this.b[name]; if (!this.an || !p || !this.ev) return false; if (this.stimmen >= MAX - 4) return true;
    const a = Math.random() * 6.2832, d = von + Math.random() * (bis - von); return this.klang(name, g, rate, this.platz(Math.sin(a) * d, 1.5 + Math.random() * 5, Math.cos(a) * d, p.duration / rate).ein);
  }
  pegel() { if (!this.ctx) return; this.s.master.gain.setTargetAtTime(this.stumm ? 0 : this.laut, this.ctx.currentTime, 0.08); }
  setzeLaut(v) { this.laut = v; this.pegel(); } umschalten() { this.stumm = !this.stumm; this.pegel(); }
  // unter Wasser nur noch das Tiefe
  unterWasser(an) { const S = this.s; if (!this.ctx || !S.dumpf || this.dumpfAn === an) return; this.dumpfAn = an; S.dumpf.frequency.setTargetAtTime(an ? 360 : 20000, this.ctx.currentTime, an ? 0.08 : 0.2); }
  pause(an) { this.pausiert = an; if (!this.ctx) return; an ? this.ctx.suspend() : this.ctx.resume(); }
  // je Bild: modus 'fahren'|'fuss'|'frei', kmh, drehzahl 0 bis 1, rpm, last, gas 0 bis 1, schlupf 0 bis 1, klasse, tag, regen, vFuss, luft, hupe, boden, verkehr, stadtAnteil,
  // wald, kueste, tropen. Neu und freiwillig (Nr. 107): platz 0 bis 1 für Stimmengewirr (belebter Platz), sonst gilt ein leiser Grundwert.
  update(dt, o) {
    if (!this.an) return; const S = this.s, t = this.ctx.currentTime, zu = (p, w, tau = 0.06) => p.setTargetAtTime(w, t, tau), B = this.bn, da = B ? this.b : LEER;
    const fahren = o.modus === 'fahren', kl = o.klasse, gross = kl === 'bus' || kl === 'lkw' || kl === 'traktor', diesel = gross || kl === 'lieferung';
    // fR: Zündfolge für die echten Schichten in Hz, lp: Last 0 bis 1
    let fR = 0, lp = 0;
    if (fahren && o.rpm) {   // echte Drehzahl und Last (kit/drive.js Fassung 4): Zündfrequenz eines Vierzylinders, Diesel der großen Wagen tiefer
      const f0 = Math.max(16, o.rpm / 60 * 2) * (gross ? 0.75 : kl === 'lieferung' ? 0.85 : 1);
      const last = Math.max(-0.2, Math.min(1, o.last ?? o.gas ?? 0)), dz = Math.min(1.05, o.drehzahl || 0); lp = Math.max(0, last); fR = f0 * (gross ? 2 : 1);
      for (const m of S.mOsc) zu(m.o.frequency, f0 * m.v, 0.02);
      zu(S.mFi.frequency, 160 + f0 * (4 + 8 * lp) + 300 * dz, 0.035); zu(S.mGa.gain, 0.05 + 0.13 * lp + 0.05 * dz + (last < 0 ? 0.015 : 0), 0.035);
      zu(S.rasp.fi.frequency, f0 * 3, 0.03); zu(S.rasp.ga.gain, lp * (0.02 + 0.05 * dz) * this.synA, 0.04);
    } else if (fahren) {
      const rpm = Math.min(1.1, 0.14 + 0.9 * (o.drehzahl || 0)), tief = kl === 'bus' ? 0.55 : kl === 'lieferung' ? 0.75 : 1, f = (34 + 165 * rpm) * tief; lp = o.gas || 0; fR = f * 0.5;
      for (const m of S.mOsc) zu(m.o.frequency, f * m.v, 0.03);
      zu(S.mFi.frequency, 260 + (1500 + 1400 * (o.gas || 0)) * rpm, 0.05); zu(S.mGa.gain, 0.055 + 0.13 * (o.gas || 0) + 0.04 * rpm, 0.05);
    } else { zu(S.mGa.gain, 0, 0.15); zu(S.rasp.ga.gain, 0, 0.15); }
    const sl = fahren ? (o.schlupf || 0) : 0, v = fahren ? (o.kmh || 0) : 0, strasse = fahren && !!kl;
    if (B) {
      // Motor aus der Leerlaufaufnahme in drei Schichten, je eine Oktave höher gestimmt: so muss keine Schicht weiter als rund eine Oktave verstimmt werden,
      // und alle Teiltöne bleiben auf der Zündfolge. Der erzeugte Motor liefert darunter den Anteil, der mit der Last wächst.
      const mp = diesel ? 'diesel_leer' : 'motor_leer', ref = diesel ? 28.3 : 29.3, mG = fR > 0 ? 0.55 * (0.6 + 0.4 * lp) : 0, M = this.mb;
      // Runde 2: beim Benziner übernehmen über dem Leerlauf die Aufnahmen vom Rollenprüfstand (pruef). oben ist ihr Anteil nach Drehzahl: 0 bis rund 1150 Umdrehungen,
      // 1 ab rund 1700. Darunter bleibt die Leerlaufaufnahme (Schicht 0), die beiden hochgestimmten Schichten und der erzeugte Motor laufen dann nicht mehr mit.
      const pruef = !diesel && !this.motorAlt && !!da.motor_mitte && !!da.motor_hoch, oben = pruef ? stufe(1.3, 1.9, fR / ref) : 0;
      for (let k = 0; k < 3; k++) {
        const b = M[k]; if (b.p !== mp) { this.halt(b); b.p = mp; }
        const r = fR / (ref * (1 << k)), ein = k ? stufe(0.65, 0.95, r) : 1, raus = k < 2 ? 1 - stufe(1.3, 1.9, r) : 1;
        this.setze(b, pruef && k ? 0 : Math.sqrt(ein * raus) * mG, 0.06, Math.min(2.4, Math.max(0.55, r)));
      }
      if (pruef || B.mM.q || B.mH.q || B.mMf.q || B.mHf.q) {
        // hoch: Anteil der Aufnahme bei 6300 Umdrehungen (0 bis 3150, 1 ab 4950), zug: Anteil der Aufnahmen unter Last. Alle Anteile gleiten, und jede Schleife
        // läuft mit Zündfolge durch ihre eigene Zündfolge: beim Gangwechsel und beim Gaswegnehmen springt weder Tonhöhe noch Klang. 0.8 und 1.08 gleichen aus,
        // dass die mittlere Aufnahme meist höher und die hohe meist tiefer gestimmt läuft: so bleibt die Lautheit je Drehzahl und Last wie beim Motor von vorher.
        const an = pruef && fR > 0 ? oben : 0, hoch = stufe(105, 165, fR), zug = stufe(0.03, 0.4, lp), gM = Math.sqrt(an * (1 - hoch)) * 0.8, gH = Math.sqrt(an * hoch) * 1.08;
        // ohne die Aufnahmen ohne Last (Handy) spielen die unter Last auch den Schub, nur leiser
        const frei = !!da.motor_mitte_frei && !!da.motor_hoch_frei, gL = ML * (0.5 + 0.5 * lp), pL = frei ? Math.sqrt(zug) * gL : MF + (gL - MF) * zug, pF = frei ? Math.sqrt(1 - zug) * MF : 0;
        this.setze(B.mM, gM * pL, 0.06, Math.min(2.3, Math.max(0.4, fR / MOTOR.mitte))); this.setze(B.mH, gH * pL, 0.06, Math.min(1.3, Math.max(0.45, fR / MOTOR.hoch)));
        this.setze(B.mMf, gM * pF, 0.06, Math.min(2.3, Math.max(0.4, fR / MOTOR.mitteFrei))); this.setze(B.mHf, gH * pF, 0.06, Math.min(1.3, Math.max(0.45, fR / MOTOR.hochFrei)));
      }
      // der erzeugte Motor: 0.55 neben der Leerlaufaufnahme, voll als Rückfall, und er geht mit dem Anteil der Prüfstandaufnahmen auf null
      const synA = 1 - oben, mZ = (da[mp] ? 0.55 : 1) * synA; this.synA = synA;
      if (mZ !== this.mBusZ && (Math.abs(mZ - this.mBusZ) > 0.01 || synA === 0 || synA === 1)) { this.mBusZ = mZ; zu(S.mBus.gain, mZ, 0.08); }
      this.setze(B.rollen, strasse ? Math.min(0.55, Math.pow(v / 100, 1.2) * 0.5) : 0, 0.25, 0.62 + 0.55 * Math.min(1.5, v / 90));
      this.setze(B.quietschen, strasse ? sl * sl * 0.6 : 0, 0.05, 0.92 + 0.2 * sl);
      this.setze(B.hupe, o.hupe ? 0.5 : 0, 0.012);
      const wG = Math.min(0.5, (v / 170) ** 2 * 0.6), wF = 350 + v * 11, bw = B.fahrtwind; this.setze(bw, wG, 0.2); if (bw.q && Math.abs(wF - bw.f) > bw.f * 0.05) { bw.f = wF; zu(bw.fi.frequency, wF, 0.2); }
    }
    { const e = da.quietschen ? 0 : 1; zu(S.qGa.gain, sl * sl * 0.09 * e, 0.05); zu(S.qO.frequency, 700 + 480 * sl + 35 * Math.sin(t * 7.3), 0.04); zu(S.reifen.ga.gain, e * Math.min(0.32, sl * 0.34), 0.05); zu(S.reifen.fi.frequency, 1100 + sl * 900, 0.1); }
    zu(S.wind.ga.gain, da.wind ? 0 : Math.min(0.32, (v / 190) ** 2 * 0.34), 0.2); zu(S.wind.fi.frequency, 300 + v * 9, 0.2);
    const nah = o.boden !== false;
    const stadtA = o.stadtAnteil ?? 1, wald = o.wald || 0, kueste = o.kueste || 0, tropen = o.tropen || 0, tagW = o.tag ?? 1, reg = o.regen || 0, verk = o.verkehr || 0;
    if (B) {
      // Kulisse: jede Schleife bekommt ihren Anteil aus Stadt, Verkehr, Tageszeit, Wetter und Landschaft. Alles gleitet, nichts schaltet.
      const E = nah ? 1 : 0, dicht = stufe(0.12, 0.65, verk), trocken = 1 - Math.min(1, reg * 2.5), boe = 0.75 + 0.25 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1.3);
      this.setze(B.stadt_dicht, E * stadtA * dicht * (0.4 + 0.45 * tagW), 0.9);
      this.setze(B.stadt_ruhig, E * stadtA * (1 - 0.7 * dicht) * (da.nacht ? tagW : 0.55 + 0.45 * tagW) * 0.55, 0.9);
      this.setze(B.nacht, E * stadtA * (1 - tagW) * 0.6, 1.2);
      this.setze(B.park, E * wald * Math.min(1, 0.25 + stadtA * 1.5) * (0.35 + 0.4 * tagW), 0.9);
      this.setze(B.voegel, E * Math.max(wald, 0.3 * stadtA * (1 - dicht)) * tagW * trocken * 0.5, 1.2);
      this.setze(B.laub, E * wald * (0.3 + 0.3 * reg) * boe, 0.8);
      this.setze(B.wind, E * (0.1 + 0.3 * reg + 0.25 * kueste + 0.1 * (1 - stadtA)) * boe, 0.8);
      this.setze(B.regen, E * Math.pow(reg, 0.7) * 0.85, 0.8);
      this.setze(B.ufer, E * kueste * 0.8, 0.9);
      this.setze(B.stimmen, E * stadtA * tagW * trocken * (o.platz ?? (o.modus === 'fuss' ? 0.3 : 0.12)) * 0.6, 1);
      this.setze(B.grillen, E * (1 - tagW) * (1 - 0.85 * stadtA) * trocken * (0.25 + 0.35 * tropen), 1.2);
      // im fahrenden Wagen tritt die Kulisse zurück, Fahrzeuge im Raum verstummen in der Höhe und wenn ton.raum nicht mehr gerufen wird
      const kZ = fahren ? 1 - 0.4 * Math.min(1, v / 90) : 1; if (Math.abs(kZ - (this.kZ ?? 1)) > 0.02) { this.kZ = kZ; zu(S.kulisse.gain, kZ, 0.4); }
      const rZ = nah && t - this.rT < 0.6 ? 1 : 0; if (rZ !== this.rBusZ) { this.rBusZ = rZ; zu(S.raum.gain, rZ, 0.25); }
      if (!rZ && this.rT && t - this.rT > 3) { this.rT = 0; for (const s of this.rv) { s.id = null; this.rAus(s); } }
    }
    zu(S.laub.ga.gain, nah && !da.laub ? wald * (0.03 + 0.018 * Math.sin(t * 0.37) + 0.012 * Math.sin(t * 1.13)) : 0, 0.6); zu(S.brandung.ga.gain, nah && !da.ufer ? kueste * (0.1 + 0.055 * Math.sin(t * 0.42)) : 0, 0.7); zu(S.inGa.gain, nah ? tropen * wald * (0.007 + 0.006 * (1 - tagW)) : 0, 1);
    if (nah && (this.tNatur = (this.tNatur ?? 3) - dt) < 0) { this.tNatur = 1.5 + Math.random() * (wald > 0.3 ? 5 : 10); if (kueste > 0.25 && tagW > 0.3 && Math.random() < 0.6) this.moewe(); else if (wald > 0.25 && tagW > 0.3) { if (tropen > 0.5 && Math.random() < 0.45) this.papagei(); else this.vogel(); } else if (tropen > 0.4 && tagW < 0.3 && Math.random() < 0.7) this.frosch(); }
    zu(S.stadt.ga.gain, nah && !da.stadt_dicht && !da.stadt_ruhig ? (0.09 + 0.05 * verk) * stadtA : 0, 0.5); zu(S.regen.ga.gain, nah && !da.regen ? reg * 0.13 : 0, 0.8); zu(S.grGa.gain, nah && !da.grillen ? (1 - tagW) * 0.012 : 0, 1);
    zu(S.hGa.gain, o.hupe && !da.hupe_halten ? 0.2 : 0, 0.012);
    // Schritte: sechs echte Tritte auf Beton, nie zweimal derselbe hintereinander, Tonhöhe leicht gestreut
    if (o.modus === 'fuss' && (o.vFuss || 0) > 0.4 && !o.luft) {
      this.schrittPhase += o.vFuss * dt / 0.72;
      if (this.schrittPhase >= 1) {
        this.schrittPhase -= 1; const k = Math.min(1, o.vFuss / 4), n = MOBIL ? 3 : 6; let i = Math.floor(Math.random() * n); if (i === this.schrittAlt) i = (i + 1) % n; this.schrittAlt = i;
        if (!this.klang(SCHRITT[i], 0.3 + 0.3 * k, 0.94 + Math.random() * 0.12)) this.knall(0.05 + 0.03 * k, 900 + Math.random() * 300, 0.07);
      }
    }
    // Stadtleben: ferne Hupen, Vögel bei Tag, dazu Krähe, Hund, Fahrradklingel, selten eine Kirchenglocke oder ein fernes Martinshorn
    if (nah && (this.tStadt -= dt) < 0) {
      this.tStadt = 1.5 + Math.random() * 6; const r = Math.random(), hell = tagW > 0.4, mild = reg < 0.3;
      if (r < 0.3) { if (stadtA > 0.4 && Math.random() < 0.35 + 0.65 * verk) this.ferneHupe(); }
      else if (r < 0.62) { if (hell && mild) this.vogel(); }
      else if (r < 0.68) { if (hell && stadtA > 0.2) this.fern('kraehe', 1.2, 15, 60); }
      else if (r < 0.73) { if (stadtA > 0.2) this.fern(Math.random() < 0.5 ? 'hund_1' : 'hund_2', 1.5, 30, 90); }
      else if (r < 0.79) { if (hell && mild && stadtA > 0.5) this.fern(Math.random() < 0.5 ? 'klingel_1' : 'klingel_2', 1, 8, 30); }
      else if (r < 0.805) { if (hell && stadtA > 0.3) this.fern('glocke', 7, 150, 400); }
      else if (r < 0.82) { if (stadtA > 0.6) this.ferneSirene(); }
    }
  }
  // Klang im Raum (Nr. 107), je Bild: hoerer { x, y, z, ry } mit Blickrichtung (sin ry, 0, cos ry) wie figur.ry, quellen [{ id, art, x, y, z, v }] mit art 'pkw' | 'bus' | 'lkw' |
  // 'tram' | 'rad' und v in m/s. Statt x, y, z geht auch pos (Vector3), statt art auch def.klasse: die Fahrzeuge aus kit/traffic.js passen also, wie sie sind.
  // Die nächsten Quellen (8, am Handy 4) bekommen eine Fahrschleife über einen PannerNode. Der Hörer bleibt im Ursprung, die Quellen
  // stehen relativ zu ihm: so stören weder große Weltkoordinaten noch ein Ursprung, der wandert. Im Betrieb entsteht hier kein neues Objekt, außer wenn eine
  // Stimme eine andere Fahrzeugart übernimmt (dann eine neue Quelle).
  raum(o) {
    if (!this.an || !this.rv || !o) return;
    const c = this.ctx, t = c.currentTime, H = o.hoerer, V = this.rv, n = V.length, nI = this.rI, nD = this.rD, nZ = this.rZ, Q = o.quellen || LEER, da = this.b, dtR = Math.min(0.25, Math.max(0.004, t - (this.rT || t)));
    this.rT = t;
    if (H) {
      this.hx = H.x; this.hy = H.y; this.hz = H.z; this.hoert = true; const fx = Math.sin(H.ry || 0), fz = Math.cos(H.ry || 0), L = c.listener;
      if (fx !== this.hfx || fz !== this.hfz) { this.hfx = fx; this.hfz = fz; if (L.forwardX) { L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else L.setOrientation(fx, 0, fz, 0, 1, 0); }
    }
    const hx = this.hx, hy = this.hy, hz = this.hz; let k = 0;
    // die n nächsten Quellen in zwei festen Feldern sammeln, nach Abstand sortiert
    for (let i = 0; i < Q.length; i++) {
      const q = Q[i], A = RAUM_ART[q.art || q.def?.klasse]; if (!A || !(da[A[0]] || da[A[5]])) continue;
      const P = q.pos || q, dx = P.x - hx, dy = P.y - hy, dz = P.z - hz, d2 = dx * dx + dy * dy + dz * dz; if (d2 > 15600 || (k === n && d2 >= nD[n - 1])) continue;
      let j = k < n ? k++ : n - 1; while (j > 0 && nD[j - 1] > d2) { nD[j] = nD[j - 1]; nI[j] = nI[j - 1]; j--; } nD[j] = d2; nI[j] = i;
    }
    // Stimmen behalten ihre Quelle, solange sie unter den nächsten bleibt (sonst knackt es beim Umsortieren)
    for (let i = 0; i < n; i++) V[i].da = false;
    for (let m = 0; m < k; m++) { const id = Q[nI[m]].id ?? nI[m]; nZ[m] = -1; for (let i = 0; i < n; i++) if (V[i].id !== null && V[i].id === id) { nZ[m] = i; V[i].da = true; break; } }
    for (let i = 0; i < n; i++) { const s = V[i]; if (s.id !== null && !s.da) { s.id = null; s.frei = t + 0.3; s.g = 0; s.ga.gain.setTargetAtTime(0, t, 0.07); } else if (s.id === null && s.q && t > s.frei + 1.5) this.rAus(s); }
    for (let m = 0; m < k; m++) { if (nZ[m] >= 0) continue; for (let i = 0; i < n; i++) { const s = V[i]; if (s.id === null && t >= s.frei) { nZ[m] = i; s.id = Q[nI[m]].id ?? nI[m]; s.d = -1; s.dop = 1; break; } } }
    for (let m = 0; m < k; m++) {
      if (nZ[m] < 0) continue; const s = V[nZ[m]], q = Q[nI[m]], P = q.pos || q, A = RAUM_ART[q.art || q.def?.klasse], name = da[A[0]] ? A[0] : A[5];
      if (s.art !== name || !s.q) {
        this.rAus(s); if (this.stimmen >= MAX - 3) { s.id = null; continue; }
        const x = c.createBufferSource(), l = TON_DATEIEN[name][0]; x.buffer = da[name]; x.loop = true; x.loopStart = RAND / 2; x.loopEnd = RAND / 2 + l; x.connect(s.ein); x.start(t, RAND / 2 + Math.random() * l * 0.98);
        s.q = x; s.art = name; s.r = 1; s.g = 0; this.stimmen++;
      }
      const d = Math.sqrt(nD[m]), tempo = Math.abs(q.v || 0); setzeOrt(s.pan, P.x - hx, P.y - hy, P.z - hz);
      const g = A[1] * (A[2] + (1 - A[2]) * Math.min(1, tempo / 9)) * (1 - stufe(75, 120, d)); if (Math.abs(g - s.g) > 0.02) { s.ga.gain.setTargetAtTime(g, t, 0.12); s.g = g; }
      // Tonhöhe leicht nach Tempo, dazu der Dopplereffekt aus der Änderung des Abstands (gedeckelt und geglättet)
      if (s.d >= 0) s.dop += (Math.min(1.07, Math.max(0.93, 343 / (343 + (d - s.d) / dtR))) - s.dop) * 0.15;
      s.d = d; const r = (A[3] + A[4] * Math.min(1.6, tempo / 14)) * s.dop; if (Math.abs(r - s.r) > 0.004) { s.q.playbackRate.setTargetAtTime(r, t, 0.08); s.r = r; }
      if (s.fi) { const f = 1500 + 14500 * (1 - Math.min(1, d / 110)) ** 2; if (Math.abs(f - s.f) > s.f * 0.06) { s.fi.frequency.setTargetAtTime(f, t, 0.15); s.f = f; } }
    }
  }
  rAus(s) { if (!s.q) return; try { s.q.stop(); } catch (e) {} s.q.disconnect(); s.q = null; s.art = ''; s.g = 0; this.stimmen--; }
  // Einzelklang an einer Stelle der Welt (Nr. 107), Koordinaten wie bei ton.raum. Arten: hupe, hupe_bus, hupe_lkw, klingel, hund, glocke, vogel, amsel, spatz, kraehe, moewe,
  // bremse, tuer, tuer_auf, anlasser, zug_horn, sbahn_tuer, donner, schritt, kuh, schaf, pferd, seit Runde 2 auch aus Aufnahmen: stoss_leicht, stoss, stoss_schwer
  // (Aufprall in drei Stärken), schlag (dumpf, ohne Blech), ampel (ein Tack des Blindensignals bei Rot, rund 1,2 mal je Sekunde rufen) und ampel_frei (zehn schnelle
  // Tacks bei Grün, einmal je Sekunde rufen: der nächste Ruf schließt im Takt an). Ohne ton.raum vorher klingt es aus der Mitte.
  ereignis(art, x = 0, y = 0, z = 0) {
    if (!this.an || !this.ev) return false; const dx = this.hoert ? x - this.hx : 0, dy = this.hoert ? y - this.hy : 0, dz = this.hoert ? z - this.hz : -4;
    if (dx * dx + dy * dy + dz * dz > 360000) return false;
    if (art === 'ampel' || art === 'ampel_frei') {
      if (this.b[art]) {
        // Aufnahme einer Fußgängerampel (Runde 2). Die zehn schnellen Tacks dauern mit Rate 1.0202 genau eine Sekunde. Jeder Ruf startet 60 ms später, der nächste
        // an derselben Ampel genau eine Sekunde nach dem letzten: so bleibt der Takt gleichmäßig, auch wenn der Ruf ein paar Bilder zu früh oder zu spät kommt.
        const t = this.ctx.currentTime, frei = art === 'ampel_frei'; let start = 0;
        if (frei) { const T = this.ampelT || (this.ampelT = new Map()), ort = Math.round(x) * 8191 + Math.round(z), soll = T.get(ort) || 0; start = soll > t - 0.03 && soll < t + 0.4 ? Math.max(0, soll - t) : 0.06; if (T.size > 48) T.clear(); T.set(ort, t + start + 1); }
        return this.klang(art, 1.1 * Math.min(1, Math.max(0.45, Math.hypot(dx, dy, dz) / 12)), frei ? 1.0202 : 1, this.platz(dx, dy, dz, frei ? 1.1 + start : 0.3).ein, start);
      }
      const sl = this.platz(dx, dy, dz, 1), n = art === 'ampel' ? 1 : 4; for (let i = 0; i < n; i++) { this.ton(880, 860, 0.3, 0.05, 'square', i * 0.25, sl.ein); this.ton(2600, 1800, 0.15, 0.012, 'triangle', i * 0.25, sl.ein); } return true;
    }
    // Aufprall: fehlt die passende Stärke (am Handy, oder noch nicht geladen), gilt die mittlere, fehlt auch sie, klingt es erzeugt wie bisher
    if ((art === 'stoss_leicht' && !this.b.crash_1) || (art === 'stoss_schwer' && !this.b.crash_3)) art = 'stoss';
    if (art === 'stoss' && !this.b.crash_2) { const sl = this.platz(dx, dy, dz, 0.6); this.knall(1.6, 1400, 0.3, sl.ein); this.ton(110, 40, 1.4, 0.26, 'sine', 0, sl.ein); return true; }
    const E = EREIGNIS[art]; if (!E) return false; const L = E[0]; let name = L[Math.floor(Math.random() * L.length)]; if (!this.b[name]) name = L[0];
    const p = this.b[name];
    if (!p) { if (art.startsWith('hupe')) { const f = 340 + Math.random() * 120, sl = this.platz(dx, dy, dz, 0.5); this.ton(f, f, 0.5, 0.3, 'sawtooth', 0, sl.ein); this.ton(f * 1.26, f * 1.26, 0.35, 0.3, 'sawtooth', 0, sl.ein); return true; } return false; }
    // ganz nah nicht lauter als in 12 m: der PannerNode dämpft unter 5 m nicht weiter, eine Hupe am Ohr würde sonst übersteuern
    const rate = 0.95 + Math.random() * 0.1, nahG = Math.min(1, Math.max(0.45, Math.hypot(dx, dy, dz) / 12)); return this.klang(name, E[1] * nahG, rate, this.platz(dx, dy, dz, p.duration / rate).ein);
  }
  donner(d = 3000) {
    if (!this.an || !this.ctx) return; const c = this.ctx, t = c.currentTime, nah = 1 - Math.min(1, d / 11000);
    // echter Donner: nah der kurze Schlag, fern das lange Grollen, mit dem Abstand leiser und dumpfer
    if (this.klang(nah > 0.72 ? 'donner_1' : nah > 0.4 ? 'donner_2' : 'donner_3', 0.25 + 0.75 * nah, 0.92 + Math.random() * 0.12, null, 0, 500 + 14000 * nah * nah) || this.klang('donner_1', 0.2 + 0.6 * nah, 0.8 + 0.2 * nah, null, 0, 400 + 14000 * nah * nah)) return;
    const q = c.createBufferSource(); q.buffer = this.rausch; q.loop = true; const fi = c.createBiquadFilter(); fi.type = 'lowpass'; fi.frequency.setValueAtTime(120 + 700 * nah, t); fi.frequency.exponentialRampToValueAtTime(70, t + 4); const g = c.createGain(), L = 0.1 + 0.42 * nah; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(L, t + 0.05 + 0.5 * (1 - nah)); g.gain.setTargetAtTime(L * 0.55, t + 0.5, 0.5); g.gain.setTargetAtTime(0.0001, t + 1.5, 1.3); q.connect(fi); fi.connect(g); g.connect(this.s.master); q.start(t, Math.random()); q.stop(t + 6.5);
  }
  // Rauschstoß und Ton aus Oszillatoren (Knöpfe, Jingles, Rückfall). ziel ist freiwillig (Nr. 107): ein Platz im Raum statt der Mitte.
  knall(g, f, dauer, ziel = null) { if (!this.an) return; const c = this.ctx, q = c.createBufferSource(); q.buffer = this.rausch; q.loop = true; const fi = c.createBiquadFilter(); fi.type = 'lowpass'; fi.frequency.value = f; const ga = c.createGain(), t = c.currentTime; ga.gain.setValueAtTime(g, t); ga.gain.exponentialRampToValueAtTime(0.0008, t + dauer); q.connect(fi); fi.connect(ga); ga.connect(ziel || this.s.master); q.start(t, Math.random()); q.stop(t + dauer + 0.02); }
  ton(f0, f1, g, dauer, typ = 'sine', start = 0, ziel = null) { if (!this.an) return; const c = this.ctx, o = c.createOscillator(), ga = c.createGain(), t = c.currentTime + start; o.type = typ; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer); ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(g, t + Math.min(0.012, dauer * 0.3)); ga.gain.exponentialRampToValueAtTime(0.0008, t + dauer); o.connect(ga); ga.connect(ziel || this.s.master); o.start(t); o.stop(t + dauer + 0.02); }
  // Aufprall des eigenen Wagens (Runde 2): Aufnahmen in drei Stärken nach der Wucht st aus kit/drive.js (0.12 ist ein Rempler mit 5 km/h, 0.7 eine Wand mit 30 km/h
  // und mehr): leicht (Schlag und schrammendes Blech), mittel (Blech), schwer (Blech, Glas, Trümmer). weich: nur der dumpfe Schlag, für den Stoß gegen einen Menschen.
  // Der schwere Klang dauert 3 s und kommt darum höchstens alle 1,2 s, dazwischen gilt der mittlere. Fehlt eine Aufnahme, klingt es erzeugt wie bisher.
  stoss(st, weich = false) {
    if (!this.an) return; const k = Math.min(1, st), r = 0.93 + Math.random() * 0.14, t = this.ctx.currentTime, schwer = !weich && k >= 0.45 && t - this.tStoss > 1.2 && !!this.b.crash_3;
    if (schwer) this.tStoss = t;
    if (weich ? this.klang('schlag', 0.5 + 1.2 * k, r) : schwer ? this.klang('crash_3', 0.75 + 0.6 * k, r) : k < 0.22 ? this.klang('crash_1', 0.7 + 2 * k, r) : this.klang('crash_2', 0.5 + 1.1 * Math.min(0.6, k), r * (k < 0.45 ? 1 : 0.88))) return;
    this.knall(0.5 * k + 0.1, 500 + 1800 * k, 0.28 + 0.2 * k); this.ton(110, 40, 0.55 * k + 0.12, 0.26); if (k > 0.5) { this.knall(0.14, 7000, 0.5); }
  }
  // Hupen anderer: echte Aufnahmen, fern rundum und gedämpft, nah direkt am Hörer. Ab und zu hupt ein Bus oder Lkw.
  ferneHupe() { const r = Math.random(), n = r < 0.08 ? 'hupe_bus' : r < 0.15 ? 'hupe_lkw' : HUPEN[Math.floor(Math.random() * 3)]; if (this.fern(this.b[n] ? n : 'hupe_1', 2.4, 45, 140, 0.92 + Math.random() * 0.16)) return; const f = 300 + Math.random() * 180, g = 0.012 + Math.random() * 0.012; this.ton(f, f, g, 0.35, 'square'); if (Math.random() < 0.4) this.ton(f, f, g, 0.5, 'square', 0.45); }
  naheHupe() { const n = HUPEN[Math.floor(Math.random() * 3)]; if (this.fern(this.b[n] ? n : 'hupe_1', 1.4, 7, 18, 0.95 + Math.random() * 0.1)) return; const f = 340 + Math.random() * 120, k = Math.random() < 0.5 ? 1 : 2; for (let i = 0; i < k; i++) { this.ton(f, f, 0.05, 0.22, 'sawtooth', i * 0.3); this.ton(f * 1.26, f * 1.26, 0.035, 0.22, 'sawtooth', i * 0.3); } }
  vogel() { const v = VOEGEL[Math.floor(Math.random() * VOEGEL.length)]; if (this.fern(this.b[v] ? v : 'amsel_1', 0.9, 6, 35, 0.96 + Math.random() * 0.08)) return; const n = 2 + Math.floor(Math.random() * 4), f = 2600 + Math.random() * 1600; for (let i = 0; i < n; i++) this.ton(f * (1 + Math.random() * 0.2), f * 0.82, 0.012, 0.09, 'sine', i * (0.12 + Math.random() * 0.06)); }
  moewe() { if (this.fern(MOEWEN[Math.floor(Math.random() * 3)], 1.2, 12, 70, 0.95 + Math.random() * 0.1)) return; const f = 1500 + Math.random() * 500, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) this.ton(f, f * 0.72, 0.012, 0.26, 'triangle', i * 0.3); }
  papagei() { const f = 1100 + Math.random() * 900; this.ton(f, f * 1.5, 0.012, 0.09, 'sawtooth'); this.ton(f * 1.4, f * 0.8, 0.012, 0.16, 'sawtooth', 0.11); }
  frosch() { const f = 380 + Math.random() * 200, n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) this.ton(f, f * 1.3, 0.014, 0.08, 'square', i * 0.17); }
  // fernes Martinshorn, das anschwillt und wieder vergeht (nur Stimmung, das der Polizei im Spiel steuert sirene)
  ferneSirene() {
    const p = this.b.sirene; if (!p || !this.ev || this.stimmen >= MAX - 4) return; const c = this.ctx, t = c.currentTime, a = Math.random() * 6.2832, d = 160 + Math.random() * 250, sl = this.platz(Math.sin(a) * d, 3, Math.cos(a) * d, 9.2);
    const q = c.createBufferSource(), ga = c.createGain(), l = TON_DATEIEN.sirene[0]; q.buffer = p; q.loop = true; q.loopStart = RAND / 2; q.loopEnd = RAND / 2 + l; q.playbackRate.value = 0.97 + Math.random() * 0.06;
    ga.gain.setValueAtTime(0.0001, t); ga.gain.linearRampToValueAtTime(12, t + 2.5); ga.gain.setValueAtTime(12, t + 5.5); ga.gain.linearRampToValueAtTime(0.0001, t + 8.8);
    q.connect(ga); ga.connect(sl.ein); this.stimmen++; q.onended = () => { this.stimmen--; ga.disconnect(); }; q.start(t, RAND / 2); q.stop(t + 9);
  }
  // Sirene: echtes Martinshorn (Tatü Tata, 457 und 607 Hz) als Schleife, Stärke 0 bis 1 nach Abstand. Rückfall: zwei Töne im Wechsel.
  sirene(g, dt) {
    if (!this.an) return; const S = this.s, c = this.ctx;
    if (this.bn && this.b.sirene) { this.setze(this.bn.sirene, g * 0.55, 0.12); if (S.siGa) S.siGa.gain.setTargetAtTime(0, c.currentTime, 0.1); return; }
    if (!S.siGa) { if (g <= 0) return; S.siGa = c.createGain(); S.siGa.gain.value = 0; const fi = c.createBiquadFilter(); fi.type = 'bandpass'; fi.frequency.value = 1050; fi.Q.value = 0.55; fi.connect(S.siGa); S.siGa.connect(S.master); S.siO = [['sawtooth', 1], ['square', 1.004]].map(([t, v]) => { const o = c.createOscillator(); o.type = t; o.frequency.value = 440 * v; const a = c.createGain(); a.gain.value = t === 'square' ? 0.35 : 0.7; o.connect(a); a.connect(fi); o.start(); o.v = v; return o; }); this.siT = 0; }
    this.siT += dt; const f = Math.floor(this.siT / 0.62) % 2 === 0 ? 590 : 442; for (const o of S.siO) o.frequency.setTargetAtTime(f * o.v, c.currentTime, 0.018); S.siGa.gain.setTargetAtTime(g * 0.075, c.currentTime, 0.12);
  }
  // Zug in der Nähe (kit/bahn.js): echte Vorbeifahrt als Schleife, lauter und höher mit dem Tempo, ab und zu ein echtes Signalhorn.
  // Rückfall: Rollen tief, Rattern der Räder im Takt der Schienenstöße, Signal aus drei Tönen.
  zug(d, v, dt) {
    if (!this.an || !this.ctx) return; const S = this.s, c = this.ctx, nah = v > 0.5 ? Math.max(0, 1 - d / 420) ** 2.2 : 0, k = Math.min(1, v / 30), t = c.currentTime;
    if (this.bn && this.b.zug) {
      this.setze(this.bn.zug, nah * (0.25 + 0.75 * k) * 1.3, 0.25, 0.72 + 0.5 * k); if (S.zugTief) { S.zugTief.gain.setTargetAtTime(0, t, 0.2); S.zugHoch.gain.setTargetAtTime(0, t, 0.05); }
      if ((this.zugH = (this.zugH ?? 10) - dt) < 0 && nah > 0.12) { this.zugH = 22 + Math.random() * 40; if (!this.klang('zug_horn', 0.08 + 0.3 * nah)) { const g = 0.03 + 0.1 * nah; this.ton(392, 392, g, 0.7, 'sawtooth'); this.ton(494, 494, g * 0.8, 0.7, 'sawtooth'); } }
      return;
    }
    if (!S.zugTief) { const mach = (typ, f, Q) => { const q = c.createBufferSource(); q.buffer = this.rausch; q.loop = true; q.start(); const fi = c.createBiquadFilter(); fi.type = typ; fi.frequency.value = f; fi.Q.value = Q; const ga = c.createGain(); ga.gain.value = 0; q.connect(fi); fi.connect(ga); ga.connect(S.master); return ga; }; S.zugTief = mach('lowpass', 150, 0.7); S.zugHoch = mach('bandpass', 1500, 0.9); S.zugT = 0; S.zugH = 10; }
    S.zugTief.gain.setTargetAtTime(nah * (0.08 + 0.42 * k), t, 0.25);
    S.zugT += dt * (0.5 + v / 12); const takt = S.zugT % 1, klack = takt < 0.1 || (takt > 0.22 && takt < 0.3) ? 1 : 0.35; S.zugHoch.gain.setTargetAtTime(nah * (0.012 + 0.08 * k) * klack, t, 0.012);
    if ((S.zugH -= dt) < 0 && nah > 0.12) { S.zugH = 22 + Math.random() * 40; const g = 0.03 + 0.1 * nah; this.ton(392, 392, g, 0.7, 'sawtooth'); this.ton(494, 494, g * 0.8, 0.7, 'sawtooth'); this.ton(587, 587, g * 0.5, 0.7, 'sawtooth'); }
  }
  // Tierlaute: Kuh, Schaf und Pferd echt und am Abstand d verortet, der Rest aus Oszillatoren
  tierlaut(art, d) {
    if (!this.an) return; const echt = /kuh|gnu/.test(art) ? 'kuh' : /schaf/.test(art) ? 'schaf' : /pferd|zebra/.test(art) ? 'pferd' : '';
    if (echt && this.fern(echt, 1.6, Math.max(4, d), Math.max(4, d), 0.94 + Math.random() * 0.12)) return;
    const g = 0.05 * Math.max(0.1, 1 - d / 90); if (/kuh|gnu/.test(art)) { this.ton(150, 118, g * 1.4, 1.1, 'sawtooth'); this.ton(300, 236, g * 0.5, 1.1, 'triangle'); } else if (/schaf/.test(art)) { for (let i = 0; i < 5; i++) this.ton(420 + (i % 2) * 40, 400, g, 0.09, 'sawtooth', i * 0.09); } else if (/pferd|zebra/.test(art)) { for (let i = 0; i < 7; i++) this.ton(760 - i * 70, 700 - i * 70, g * 0.8, 0.1, 'sawtooth', i * 0.09); } else if (/elefant/.test(art)) { this.ton(420, 720, g * 1.6, 1.2, 'sawtooth'); } else if (/loewe|baer/.test(art)) { this.ton(90, 60, g * 2.4, 1.4, 'sawtooth'); } else if (/reh|hirsch/.test(art)) { this.ton(240, 180, g, 0.5, 'sawtooth'); }
  }
  klick() { this.ton(900, 500, 0.06, 0.05); }
  muenze() { this.ton(1320, 1320, 0.08, 0.1, 'triangle'); this.ton(1760, 1760, 0.09, 0.28, 'triangle', 0.08); }
  erfolg() { [523, 659, 784, 1047].forEach((f, i) => this.ton(f, f, 0.09, 0.26, 'triangle', i * 0.11)); }
  fehler() { this.ton(220, 140, 0.12, 0.4, 'sawtooth'); }
  // Autotür und Anlasser echt (Peugeot 107), sonst wie bisher erzeugt
  tuer() { if (this.klang('tuer_zu', 0.7, 0.95 + Math.random() * 0.1)) return; this.knall(0.22, 500, 0.12); this.ton(90, 60, 0.15, 0.1, 'sine', 0.02); }
  anlassen() { if (this.klang('anlasser', 0.55)) return; this.ton(60, 180, 0.09, 0.5, 'sawtooth'); }
}
