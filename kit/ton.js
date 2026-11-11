// Ton (05.11.2026): alles wird im Browser erzeugt, keine Dateien, nichts zu bezahlen. Motor aus drei Oszillatoren nach Drehzahl und Gas, Reifenquietschen, Fahrtwind, Stadt (Rauschen, ferne Hupen, Vögel, nachts Grillen),
// Regen, Schritte, Crash, Hupe, Knöpfe und Jingles. Startet erst nach der ersten Geste (Browser Regel). Lautstärke 0 bis 1, M schaltet stumm.
export class Ton {
  constructor() { this.ctx = null; this.laut = 0.8; this.stumm = false; this.s = {}; this.schrittPhase = 0; this.tStadt = 2; this.an = false; const lo = () => this.starten(); addEventListener('pointerdown', lo, { passive: true }); addEventListener('keydown', lo); addEventListener('touchend', lo, { passive: true }); }
  starten() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.pausiert) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(), S = this.s;
    S.master = c.createGain(); S.master.gain.value = 0; const komp = c.createDynamicsCompressor(); komp.threshold.value = -14; komp.ratio.value = 5; S.dumpf = c.createBiquadFilter(); S.dumpf.type = 'lowpass'; S.dumpf.frequency.value = 20000; S.dumpf.Q.value = 0.4; S.master.connect(S.dumpf); S.dumpf.connect(komp); komp.connect(c.destination);
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; l = 0.985 * l + 0.015 * w; d[i] = w * 0.5 + l * 2.4; } this.rausch = b;
    const quelle = () => { const q = c.createBufferSource(); q.buffer = b; q.loop = true; q.start(); return q; };
    const kette = (q, typ, f, Q, g = 0) => { const fi = c.createBiquadFilter(); fi.type = typ; fi.frequency.value = f; fi.Q.value = Q; const ga = c.createGain(); ga.gain.value = g; q.connect(fi); fi.connect(ga); ga.connect(S.master); return { fi, ga }; };
    // Motor
    const form = c.createWaveShaper(); const k = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 2.2); } form.curve = k; form.oversample = '2x';
    S.mFi = c.createBiquadFilter(); S.mFi.type = 'lowpass'; S.mFi.frequency.value = 500; S.mFi.Q.value = 0.9; S.mGa = c.createGain(); S.mGa.gain.value = 0; form.connect(S.mFi); S.mFi.connect(S.mGa); S.mGa.connect(S.master);
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
    this.an = true; this.pegel();
  }
  pegel() { if (!this.ctx) return; this.s.master.gain.setTargetAtTime(this.stumm ? 0 : this.laut, this.ctx.currentTime, 0.08); }
  setzeLaut(v) { this.laut = v; this.pegel(); } umschalten() { this.stumm = !this.stumm; this.pegel(); }
  unterWasser(an) { const S = this.s; if (!this.ctx || !S.dumpf || this.dumpfAn === an) return; this.dumpfAn = an; S.dumpf.frequency.setTargetAtTime(an ? 360 : 20000, this.ctx.currentTime, an ? 0.08 : 0.2); }   // unter Wasser nur noch das Tiefe
  pause(an) { this.pausiert = an; if (!this.ctx) return; an ? this.ctx.suspend() : this.ctx.resume(); }
  // je Bild: modus 'fahren'|'fuss'|'frei', kmh, drehzahl 0 bis 1, gas 0 bis 1, schlupf 0 bis 1, klasse, tag, regen, v (zu Fuß), hupe
  update(dt, o) {
    if (!this.an) return; const S = this.s, t = this.ctx.currentTime, zu = (p, w, tau = 0.06) => p.setTargetAtTime(w, t, tau);
    const fahren = o.modus === 'fahren';
    if (fahren && o.rpm) {   // echte Drehzahl und Last (kit/drive.js Fassung 4): Zündfrequenz eines Vierzylinders, Diesel der großen Wagen tiefer
      const gross = o.klasse === 'bus' || o.klasse === 'lkw' || o.klasse === 'traktor', f0 = Math.max(16, o.rpm / 60 * 2) * (gross ? 0.75 : o.klasse === 'lieferung' ? 0.85 : 1);
      const last = Math.max(-0.2, Math.min(1, o.last ?? o.gas ?? 0)), lp = Math.max(0, last), dz = Math.min(1.05, o.drehzahl || 0);
      for (const m of S.mOsc) zu(m.o.frequency, f0 * m.v, 0.02);
      zu(S.mFi.frequency, 160 + f0 * (4 + 8 * lp) + 300 * dz, 0.035); zu(S.mGa.gain, 0.05 + 0.13 * lp + 0.05 * dz + (last < 0 ? 0.015 : 0), 0.035);
      zu(S.rasp.fi.frequency, f0 * 3, 0.03); zu(S.rasp.ga.gain, lp * (0.02 + 0.05 * dz), 0.04);
    } else if (fahren) {
      const rpm = Math.min(1.1, 0.14 + 0.9 * (o.drehzahl || 0)), tief = o.klasse === 'bus' ? 0.55 : o.klasse === 'lieferung' ? 0.75 : 1, f = (34 + 165 * rpm) * tief;
      for (const m of S.mOsc) zu(m.o.frequency, f * m.v, 0.03);
      zu(S.mFi.frequency, 260 + (1500 + 1400 * (o.gas || 0)) * rpm, 0.05); zu(S.mGa.gain, 0.055 + 0.13 * (o.gas || 0) + 0.04 * rpm, 0.05);
    } else { zu(S.mGa.gain, 0, 0.15); zu(S.rasp.ga.gain, 0, 0.15); }
    { const sl = fahren ? (o.schlupf || 0) : 0; zu(S.qGa.gain, sl * sl * 0.09, 0.05); zu(S.qO.frequency, 700 + 480 * sl + 35 * Math.sin(t * 7.3), 0.04); }
    zu(S.reifen.ga.gain, fahren ? Math.min(0.32, (o.schlupf || 0) * 0.34) : 0, 0.05); zu(S.reifen.fi.frequency, 1100 + (o.schlupf || 0) * 900, 0.1);
    const v = fahren ? (o.kmh || 0) : o.modus === 'jet' ? 0 : 0;
    zu(S.wind.ga.gain, Math.min(0.32, (v / 190) ** 2 * 0.34), 0.2); zu(S.wind.fi.frequency, 300 + v * 9, 0.2);
    const nah = o.boden !== false;
    const stadtA = o.stadtAnteil ?? 1, wald = o.wald || 0, kueste = o.kueste || 0, tropen = o.tropen || 0, tagW = o.tag ?? 1;
    zu(S.laub.ga.gain, nah ? wald * (0.03 + 0.018 * Math.sin(t * 0.37) + 0.012 * Math.sin(t * 1.13)) : 0, 0.6); zu(S.brandung.ga.gain, nah ? kueste * (0.1 + 0.055 * Math.sin(t * 0.42)) : 0, 0.7); zu(S.inGa.gain, nah ? tropen * wald * (0.007 + 0.006 * (1 - tagW)) : 0, 1);
    if (nah && (this.tNatur = (this.tNatur ?? 3) - dt) < 0) { this.tNatur = 1.5 + Math.random() * (wald > 0.3 ? 5 : 10); if (kueste > 0.25 && tagW > 0.3 && Math.random() < 0.6) this.moewe(); else if (wald > 0.25 && tagW > 0.3) { if (tropen > 0.5 && Math.random() < 0.45) this.papagei(); else this.vogel(); } else if (tropen > 0.4 && tagW < 0.3 && Math.random() < 0.7) this.frosch(); }
    zu(S.stadt.ga.gain, nah ? (0.09 + 0.05 * (o.verkehr || 0)) * stadtA : 0, 0.5); zu(S.regen.ga.gain, nah ? (o.regen || 0) * 0.13 : 0, 0.8); zu(S.grGa.gain, nah ? (1 - (o.tag ?? 1)) * 0.012 : 0, 1);
    zu(S.hGa.gain, o.hupe ? 0.2 : 0, 0.012);
    if (o.modus === 'fuss' && (o.vFuss || 0) > 0.4 && !o.luft) { this.schrittPhase += o.vFuss * dt / 0.72; if (this.schrittPhase >= 1) { this.schrittPhase -= 1; this.knall(0.05 + 0.03 * Math.min(1, o.vFuss / 4), 900 + Math.random() * 300, 0.07); } }
    // Stadtleben: ferne Hupen, Vögel bei Tag
    if (nah && (this.tStadt -= dt) < 0) { this.tStadt = 2 + Math.random() * 7; const r = Math.random(); if (r < 0.35) { if (stadtA > 0.4) this.ferneHupe(); } else if ((o.tag ?? 1) > 0.4 && !(o.regen > 0.3)) this.vogel(); }
  }
  donner(d = 3000) { if (!this.an || !this.ctx) return; const c = this.ctx, t = c.currentTime, nah = 1 - Math.min(1, d / 11000), q = c.createBufferSource(); q.buffer = this.rausch; q.loop = true; const fi = c.createBiquadFilter(); fi.type = 'lowpass'; fi.frequency.setValueAtTime(120 + 700 * nah, t); fi.frequency.exponentialRampToValueAtTime(70, t + 4); const g = c.createGain(), L = 0.1 + 0.42 * nah; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(L, t + 0.05 + 0.5 * (1 - nah)); g.gain.setTargetAtTime(L * 0.55, t + 0.5, 0.5); g.gain.setTargetAtTime(0.0001, t + 1.5, 1.3); q.connect(fi); fi.connect(g); g.connect(this.s.master); q.start(t, Math.random()); q.stop(t + 6.5); }
  knall(g, f, dauer) { if (!this.an) return; const c = this.ctx, q = c.createBufferSource(); q.buffer = this.rausch; q.loop = true; const fi = c.createBiquadFilter(); fi.type = 'lowpass'; fi.frequency.value = f; const ga = c.createGain(), t = c.currentTime; ga.gain.setValueAtTime(g, t); ga.gain.exponentialRampToValueAtTime(0.0008, t + dauer); q.connect(fi); fi.connect(ga); ga.connect(this.s.master); q.start(t, Math.random()); q.stop(t + dauer + 0.02); }
  ton(f0, f1, g, dauer, typ = 'sine', start = 0) { if (!this.an) return; const c = this.ctx, o = c.createOscillator(), ga = c.createGain(), t = c.currentTime + start; o.type = typ; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer); ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(g, t + 0.012); ga.gain.exponentialRampToValueAtTime(0.0008, t + dauer); o.connect(ga); ga.connect(this.s.master); o.start(t); o.stop(t + dauer + 0.02); }
  stoss(st) { const k = Math.min(1, st); this.knall(0.5 * k + 0.1, 500 + 1800 * k, 0.28 + 0.2 * k); this.ton(110, 40, 0.55 * k + 0.12, 0.26); if (k > 0.5) { this.knall(0.14, 7000, 0.5); } }
  ferneHupe() { const f = 300 + Math.random() * 180, g = 0.012 + Math.random() * 0.012; this.ton(f, f, g, 0.35, 'square'); if (Math.random() < 0.4) this.ton(f, f, g, 0.5, 'square', 0.45); }
  vogel() { const n = 2 + Math.floor(Math.random() * 4), f = 2600 + Math.random() * 1600; for (let i = 0; i < n; i++) this.ton(f * (1 + Math.random() * 0.2), f * 0.82, 0.012, 0.09, 'sine', i * (0.12 + Math.random() * 0.06)); }
  moewe() { const f = 1500 + Math.random() * 500, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) this.ton(f, f * 0.72, 0.012, 0.26, 'triangle', i * 0.3); }
  papagei() { const f = 1100 + Math.random() * 900; this.ton(f, f * 1.5, 0.012, 0.09, 'sawtooth'); this.ton(f * 1.4, f * 0.8, 0.012, 0.16, 'sawtooth', 0.11); }
  frosch() { const f = 380 + Math.random() * 200, n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) this.ton(f, f * 1.3, 0.014, 0.08, 'square', i * 0.17); }
  naheHupe() { const f = 340 + Math.random() * 120, n = Math.random() < 0.5 ? 1 : 2; for (let i = 0; i < n; i++) { this.ton(f, f, 0.05, 0.22, 'sawtooth', i * 0.3); this.ton(f * 1.26, f * 1.26, 0.035, 0.22, 'sawtooth', i * 0.3); } }
  // Sirene: zwei Töne im Wechsel, Stärke 0 bis 1 nach Abstand
  sirene(g, dt) { if (!this.an) return; const S = this.s, c = this.ctx; if (!S.siGa) { if (g <= 0) return; S.siGa = c.createGain(); S.siGa.gain.value = 0; const fi = c.createBiquadFilter(); fi.type = 'bandpass'; fi.frequency.value = 1050; fi.Q.value = 0.55; fi.connect(S.siGa); S.siGa.connect(S.master); S.siO = [['sawtooth', 1], ['square', 1.004]].map(([t, v]) => { const o = c.createOscillator(); o.type = t; o.frequency.value = 440 * v; const a = c.createGain(); a.gain.value = t === 'square' ? 0.35 : 0.7; o.connect(a); a.connect(fi); o.start(); o.v = v; return o; }); this.siT = 0; }
    this.siT += dt; const f = Math.floor(this.siT / 0.62) % 2 === 0 ? 590 : 442; for (const o of S.siO) o.frequency.setTargetAtTime(f * o.v, c.currentTime, 0.018); S.siGa.gain.setTargetAtTime(g * 0.075, c.currentTime, 0.12); }
  // Zug in der Nähe (kit/bahn.js): Rollen tief, Rattern der Räder im Takt der Schienenstöße, ab und zu ein Signal
  zug(d, v, dt) {
    if (!this.an || !this.ctx) return; const S = this.s, c = this.ctx;
    if (!S.zugTief) { const mach = (typ, f, Q) => { const q = c.createBufferSource(); q.buffer = this.rausch; q.loop = true; q.start(); const fi = c.createBiquadFilter(); fi.type = typ; fi.frequency.value = f; fi.Q.value = Q; const ga = c.createGain(); ga.gain.value = 0; q.connect(fi); fi.connect(ga); ga.connect(S.master); return ga; }; S.zugTief = mach('lowpass', 150, 0.7); S.zugHoch = mach('bandpass', 1500, 0.9); S.zugT = 0; S.zugH = 10; }
    const nah = v > 0.5 ? Math.max(0, 1 - d / 420) ** 2.2 : 0, k = Math.min(1, v / 30), t = c.currentTime; S.zugTief.gain.setTargetAtTime(nah * (0.08 + 0.42 * k), t, 0.25);
    S.zugT += dt * (0.5 + v / 12); const takt = S.zugT % 1, klack = takt < 0.1 || (takt > 0.22 && takt < 0.3) ? 1 : 0.35; S.zugHoch.gain.setTargetAtTime(nah * (0.012 + 0.08 * k) * klack, t, 0.012);
    if ((S.zugH -= dt) < 0 && nah > 0.12) { S.zugH = 22 + Math.random() * 40; const g = 0.03 + 0.1 * nah; this.ton(392, 392, g, 0.7, 'sawtooth'); this.ton(494, 494, g * 0.8, 0.7, 'sawtooth'); this.ton(587, 587, g * 0.5, 0.7, 'sawtooth'); }
  }
  // Tierlaute aus Oszillatoren
  tierlaut(art, d) { if (!this.an) return; const g = 0.05 * Math.max(0.1, 1 - d / 90); if (/kuh|gnu/.test(art)) { this.ton(150, 118, g * 1.4, 1.1, 'sawtooth'); this.ton(300, 236, g * 0.5, 1.1, 'triangle'); } else if (/schaf/.test(art)) { for (let i = 0; i < 5; i++) this.ton(420 + (i % 2) * 40, 400, g, 0.09, 'sawtooth', i * 0.09); } else if (/pferd|zebra/.test(art)) { for (let i = 0; i < 7; i++) this.ton(760 - i * 70, 700 - i * 70, g * 0.8, 0.1, 'sawtooth', i * 0.09); } else if (/elefant/.test(art)) { this.ton(420, 720, g * 1.6, 1.2, 'sawtooth'); } else if (/loewe|baer/.test(art)) { this.ton(90, 60, g * 2.4, 1.4, 'sawtooth'); } else if (/reh|hirsch/.test(art)) { this.ton(240, 180, g, 0.5, 'sawtooth'); } }
  klick() { this.ton(900, 500, 0.06, 0.05); }
  muenze() { this.ton(1320, 1320, 0.08, 0.1, 'triangle'); this.ton(1760, 1760, 0.09, 0.28, 'triangle', 0.08); }
  erfolg() { [523, 659, 784, 1047].forEach((f, i) => this.ton(f, f, 0.09, 0.26, 'triangle', i * 0.11)); }
  fehler() { this.ton(220, 140, 0.12, 0.4, 'sawtooth'); }
  tuer() { this.knall(0.22, 500, 0.12); this.ton(90, 60, 0.15, 0.1, 'sine', 0.02); }
  anlassen() { this.ton(60, 180, 0.09, 0.5, 'sawtooth'); }
}
