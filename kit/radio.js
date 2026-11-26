// Autoradio (05.11.2026, "wie GTA 6"): vier Sender, alles im Browser erzeugt, keine Dateien, keine Rechte Dritter, nichts zu bezahlen. Jeder Sender ist ein kleiner Sequenzer mit Vorlauf: Noten werden 0,25 s im Voraus
// auf die Uhr des AudioContext gelegt. Ein Sender spielt nur im Auto, beim Aussteigen blendet er aus. Akkorde und Melodien wechseln per Zufall in festen Tonleitern, damit es nie schief klingt und nie gleich bleibt.
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const zuf = a => a[Math.floor(Math.random() * a.length)];

export const SENDER = [
  { id: 'aus', name: 'Radio aus' },
  { id: 'stadt', name: 'Stadtfunk', info: 'Lo-Fi', bpm: 78, swing: 0.16 },
  { id: 'neon', name: 'Neon 88', info: 'Synthwave', bpm: 104, swing: 0 },
  { id: 'atlas', name: 'Radio Atlas', info: 'Gnawa Beats', bpm: 96, swing: 0.08 },
  { id: 'nacht', name: 'Nachtwelle', info: 'Ambient', bpm: 60, swing: 0 },
];
// Akkordfolgen als Grundton plus Intervalle (MIDI)
const STADT = [[[57, 60, 64, 67], [53, 57, 60, 64], [60, 64, 67, 71], [55, 59, 62, 69]], [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [52, 55, 59, 62]], [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65]]];
const NEON = [[[45, 57, 60, 64], [41, 57, 60, 65], [48, 55, 60, 64], [43, 55, 59, 62]], [[45, 57, 60, 64], [43, 55, 59, 62], [41, 57, 60, 65], [40, 55, 59, 64]]];
const NACHT = [[[45, 57, 64, 69], [41, 57, 60, 65], [48, 60, 64, 67], [43, 59, 62, 67]]];
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76];   // A Moll Pentatonik

export class Radio {
  constructor(ton) { this.ton = ton; this.i = 0; this.an = false; this.schritt = 0; this.tNaechst = 0; this.takt = 0; this.folge = 0; this.bus = null; this.laut = 0.55; this.timer = null; this.imAuto = false; }
  // Bus anlegen, sobald der Ton läuft (nach der ersten Geste)
  bereit() {
    const T = this.ton; if (this.bus || !T.ctx) return !!this.bus;
    const c = T.ctx; this.bus = c.createGain(); this.bus.gain.value = 0; const fi = c.createBiquadFilter(); fi.type = 'lowshelf'; fi.frequency.value = 180; fi.gain.value = 2; this.bus.connect(fi); fi.connect(T.s.master); this.c = c;
    const n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.rausch = b;
    return true;
  }
  get sender() { return SENDER[this.i]; }
  setze(i) { this.i = (i + SENDER.length) % SENDER.length; this.schritt = 0; this.takt = 0; this.folge = Math.floor(Math.random() * 3); if (this.bereit() && this.c) this.tNaechst = this.c.currentTime + 0.12; this.pegel(); return this.sender; }
  weiter() { return this.setze(this.i + 1); }
  setzeLaut(v) { this.laut = v; this.pegel(); }
  pegel() { if (!this.bus) return; const ziel = this.imAuto && this.i > 0 ? this.laut : 0; this.bus.gain.setTargetAtTime(ziel, this.c.currentTime, 0.25); }
  // je Bild
  update(imAuto) {
    if (imAuto !== this.imAuto) { this.imAuto = imAuto; if (this.bereit()) { this.tNaechst = this.c.currentTime + 0.1; this.pegel(); } }
    if (!this.bus || !this.imAuto || this.i === 0 || this.ton.pausiert) return;
    const c = this.c, S = this.sender, sech = 60 / S.bpm / 4, t = c.currentTime; if (this.tNaechst < t) this.tNaechst = t + 0.03;
    while (this.tNaechst < t + 0.25) { const sw = this.schritt % 2 ? sech * (S.swing || 0) : 0; this.spiele(S.id, this.schritt, this.tNaechst + sw, sech); this.tNaechst += sech; this.schritt++; if (this.schritt % 16 === 0) { this.takt++; if (this.takt % 16 === 0) this.folge = Math.floor(Math.random() * 4); } }
  }
  // ---------- Bausteine ----------
  note(f, t, dauer, g, typ = 'triangle', cut = 2400, detune = 0) {
    const c = this.c, o = c.createOscillator(), a = c.createGain(), fi = c.createBiquadFilter(); o.type = typ; o.frequency.value = f; o.detune.value = detune; fi.type = 'lowpass'; fi.frequency.setValueAtTime(cut, t); fi.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.45), t + dauer);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(g, t + 0.012); a.gain.setTargetAtTime(g * 0.6, t + 0.05, 0.12); a.gain.setTargetAtTime(0.0001, t + dauer, 0.06);
    o.connect(fi); fi.connect(a); a.connect(this.bus); o.start(t); o.stop(t + dauer + 0.4);
  }
  pad(f, t, dauer, g, cut = 900) { for (const d of [-7, 6]) { const c = this.c, o = c.createOscillator(), a = c.createGain(), fi = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d; fi.type = 'lowpass'; fi.frequency.value = cut; a.gain.setValueAtTime(0.0001, t); a.gain.linearRampToValueAtTime(g, t + dauer * 0.3); a.gain.setValueAtTime(g, t + dauer * 0.7); a.gain.linearRampToValueAtTime(0.0001, t + dauer * 1.15); o.connect(fi); fi.connect(a); a.connect(this.bus); o.start(t); o.stop(t + dauer * 1.2); } }
  kick(t, g = 0.5) { const c = this.c, o = c.createOscillator(), a = c.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.09); a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0008, t + 0.26); o.connect(a); a.connect(this.bus); o.start(t); o.stop(t + 0.3); }
  rauschen(t, dauer, g, typ, f, Q = 0.8) { const c = this.c, q = c.createBufferSource(), fi = c.createBiquadFilter(), a = c.createGain(); q.buffer = this.rausch; fi.type = typ; fi.frequency.value = f; fi.Q.value = Q; a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(0.0006, t + dauer); q.connect(fi); fi.connect(a); a.connect(this.bus); q.start(t, Math.random() * 0.8, dauer + 0.05); }
  snare(t, g = 0.2) { this.rauschen(t, 0.17, g, 'bandpass', 1900, 0.7); this.note(190, t, 0.06, g * 0.5, 'triangle', 1200); }
  hat(t, g = 0.05, lang = 0.03) { this.rauschen(t, lang, g, 'highpass', 7600, 0.6); }
  // ---------- Sender ----------
  spiele(id, s, t, sech) {
    const sb = s % 16, tk = this.takt;
    if (id === 'stadt') {
      const F = STADT[this.folge % STADT.length], ak = F[tk % F.length];
      if (sb === 0) for (const n of ak) this.note(midi(n), t, sech * 11, 0.055, 'triangle', 1500, Math.random() * 8 - 4);
      if (sb === 10 && tk % 2) for (const n of ak.slice(1)) this.note(midi(n + 12), t, sech * 3, 0.018, 'sine', 2200);
      if (sb === 0 || sb === 10) this.note(midi(ak[0] - 12), t, sech * 4, 0.16, 'sine', 500);
      if (sb === 0 || sb === 7 || sb === 10) this.kick(t, 0.32);
      if (sb === 4 || sb === 12) this.snare(t, 0.1);
      if (sb % 2 === 0) this.hat(t, sb % 4 === 2 ? 0.028 : 0.016);
      if (sb === 0 && Math.random() < 0.3) this.rauschen(t, 0.5, 0.006, 'bandpass', 3200, 0.3);   // Knistern
      if (tk % 2 === 1 && sb % 3 === 0 && Math.random() < 0.45) this.note(midi(zuf(PENTA) + 12), t, sech * 2.5, 0.03, 'sine', 2600);
    } else if (id === 'neon') {
      const F = NEON[this.folge % NEON.length], ak = F[tk % F.length];
      if (sb === 0) for (const n of ak.slice(1)) this.pad(midi(n), t, sech * 16, 0.02, 1100);
      if (s % 2 === 0) this.note(midi(ak[0] + (s % 8 === 6 ? 12 : 0)), t, sech * 1.5, 0.11, 'sawtooth', 700);
      if (s % 2 === 1 && tk % 2) this.note(midi(ak[1 + (s >> 1) % 3] + 12), t, sech * 0.9, 0.022, 'square', 1800);
      if (sb % 4 === 0) this.kick(t, 0.38);
      if (sb === 4 || sb === 12) { this.snare(t, 0.13); this.rauschen(t, 0.34, 0.02, 'highpass', 2600); }
      if (sb % 2 === 0) this.hat(t, 0.018);
    } else if (id === 'atlas') {
      // Qraqeb Muster (Metall Klappern), Basslauf wie eine Guembri, kurze Melodie
      if ([0, 3, 6, 8, 11, 14].includes(sb)) this.rauschen(t, 0.045, sb === 0 || sb === 8 ? 0.05 : 0.028, 'bandpass', 5200, 1.6);
      const bass = [45, 45, 48, 50, 45, 52, 50, 48][(s >> 1) % 8]; if (sb % 2 === 0 && (sb % 4 !== 2 || tk % 2)) this.note(midi(bass), t, sech * 1.7, 0.17, 'triangle', 640);
      if (sb === 0 || sb === 8 || (sb === 11 && tk % 2)) this.kick(t, 0.26);
      if (sb === 4 || sb === 12) this.rauschen(t, 0.09, 0.05, 'bandpass', 640, 1.4);
      if (tk % 4 >= 2 && sb % 2 === 0 && Math.random() < 0.55) this.note(midi(zuf(PENTA) + 12), t, sech * 2.6, 0.035, 'sine', 3000, Math.random() * 6 - 3);
    } else if (id === 'nacht') {
      if (sb === 0 && tk % 2 === 0) { const ak = NACHT[0][(tk >> 1) % 4]; for (const n of ak) this.pad(midi(n), t, sech * 32, 0.045, 760); }
      if (s % 3 === 0 && Math.random() < 0.16) this.note(midi(zuf(PENTA) + 12), t, sech * 7, 0.07, 'sine', 1600);
    }
  }
}
