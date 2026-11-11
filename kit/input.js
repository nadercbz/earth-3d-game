// Eingabe: Aktionen statt Tasten (06_STEUERUNG.md). Tasten über den physischen Code (KeyW liegt auf QWERTZ und AZERTY an derselben
// Stelle), Pfeiltasten gleichwertig, Touch Joystick und Knöpfe speisen dieselben Aktionen. Maus oder Finger ziehen liefert Blickdeltas.
import * as THREE from 'three';

const BINDUNG = {
  vor: ['KeyW', 'ArrowUp'], zurueck: ['KeyS', 'ArrowDown'], links: ['KeyA', 'ArrowLeft'], rechts: ['KeyD', 'ArrowRight'],
  hoch: ['KeyQ', 'PageUp'], runter: ['KeyE', 'PageDown'], schnell: ['ShiftLeft', 'ShiftRight'], bremse: ['Space'], springen: ['Space'], ende: ['Escape'],
  // Düsenjet (09_GRAFIK.md): W S Schub, Pfeile hoch und runter die Nase (wie ein Steuerknüppel), A D und Pfeile links und rechts rollen, Q E Seitenruder
  gasPlus: ['KeyW'], gasMinus: ['KeyS'], naseRunter: ['ArrowUp'], naseHoch: ['ArrowDown'], rollLinks: ['KeyA', 'ArrowLeft'], rollRechts: ['KeyD', 'ArrowRight'],
  gierLinks: ['KeyQ'], gierRechts: ['KeyE'], kamera: ['KeyC'], ton: ['KeyM'],
  ziel: ['KeyN'],   // Navigation: Ziel eingeben (Wunsch Nr. 34)
  foto: ['KeyP'], lexikon: ['KeyL'],   // Tierlexikon (Wunsch Nr. 69)
  blinkL: ['Comma'], blinkR: ['Period'],   // Blinker im Auto
  werbung: ['KeyB'], zeit: ['KeyT'], einsteigen: ['KeyE', 'KeyF'], hupe: ['KeyH'], auftrag: ['KeyJ'], radio: ['KeyR'], fahrwerk: ['KeyG'],   // Spiel: Einsteigen und Aussteigen, Hupe, Auftrag annehmen
};

const PAD_BELEGUNG = [[0, 'bremse'], [1, 'einsteigen'], [2, 'schnell'], [3, 'kamera'], [4, 'hupe'], [5, 'foto'], [9, 'ende'], [8, 'lexikon'], [12, 'auftrag'], [13, 'radio'], [14, 'blinkL'], [15, 'blinkR'], [11, 'zeit']], PAD_ALLE = [...PAD_BELEGUNG.map(q => q[1]), 'gasPlus', 'gasMinus'];
export class Eingabe {
  constructor(flaeche) {
    this.flaeche = flaeche; this.taste = new Set(); this.touch = {}; this.kanten = new Set(); this.gerade = new Set();
    this.blick = { x: 0, y: 0 }; this.rad = 0; this.geraet = 'tastatur'; this.aktiv = false; this.zieht = null;
    this.stick = new THREE.Vector2(); this.stickAktiv = false;
    addEventListener('keydown', e => { if (!this.aktiv || e.metaKey || e.ctrlKey || e.target.tagName === 'INPUT') return; if (!this.taste.has(e.code)) this.kanten.add(e.code); this.taste.add(e.code); this.geraet = 'tastatur'; if (this.gebunden(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => this.taste.delete(e.code));
    addEventListener('blur', () => { this.taste.clear(); this.zieht = null; });
    // Ziehen auf der Fläche: Maus oder ein Finger auf der rechten Hälfte dreht die Kamera, links liegt der Joystick (Touch)
    flaeche.addEventListener('pointerdown', e => {
      if (!this.aktiv) return;
      if (e.pointerType === 'touch') {
        this.geraet = 'touch';
        if (e.clientX < innerWidth * 0.45 && !this.stickAktiv) { this.stickAktiv = true; this.stickId = e.pointerId; this.stickUrsprung = [e.clientX, e.clientY]; this.stick.set(0, 0); this.zeigeStick(e.clientX, e.clientY); return; }
      }
      if (this.zieht === null) { this.zieht = e.pointerId; this.letzt = [e.clientX, e.clientY]; }
    });
    flaeche.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId && this.stickAktiv) {
        const dx = e.clientX - this.stickUrsprung[0], dy = e.clientY - this.stickUrsprung[1], r = 52, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / r);
        this.stick.set(dx / l * k, dy / l * k); this.zeigeStick(this.stickUrsprung[0] + dx / l * Math.min(l, r), this.stickUrsprung[1] + dy / l * Math.min(l, r));
        return;
      }
      if (e.pointerId !== this.zieht) return;
      this.blick.x += e.clientX - this.letzt[0]; this.blick.y += e.clientY - this.letzt[1]; this.letzt = [e.clientX, e.clientY];
    });
    const los = e => { if (e.pointerId === this.stickId) { this.stickAktiv = false; this.stickId = null; this.stick.set(0, 0); this.zeigeStick(null); } if (e.pointerId === this.zieht) this.zieht = null; };
    flaeche.addEventListener('pointerup', los); flaeche.addEventListener('pointercancel', los);
    flaeche.addEventListener('wheel', e => { if (this.aktiv) { this.rad += e.deltaY; e.preventDefault(); } }, { passive: false });
    this.stickEl = null;
  }
  gebunden(code) { return Object.values(BINDUNG).some(l => l.includes(code)); }
  an(aktion) { return BINDUNG[aktion].some(c => this.taste.has(c)) || !!this.touch[aktion]; }
  // Flanke: nur im ersten Bild nach dem Drücken wahr
  gedrueckt(aktion) { return BINDUNG[aktion].some(c => this.kanten.has(c)) || !!this.touchKante?.[aktion]; }
  // Bewegungsvektor (x rechts, y vor), Tasten voll, Joystick radial mit Totbereich 0,2. roh (Fahren, Nr. 100): Lenkung und Gas unabhängig, ohne
  // Normierung auf Länge 1 (sonst gaben W und D zusammen nur 71 Prozent Gas und 71 Prozent Einschlag)
  achse(out, roh = false) {
    let x = (this.an('rechts') ? 1 : 0) - (this.an('links') ? 1 : 0), y = (this.an('vor') ? 1 : 0) - (this.an('zurueck') ? 1 : 0);
    if (this.stickAktiv) {
      const m = this.stick.length();
      if (m > 0.2) { const k = Math.min(1, (m - 0.2) / 0.8); if (!x) x = this.stick.x / m * k; if (!y) y = -this.stick.y / m * k; }
    }
    if (this.padY) y = this.padY;   // Gamepad: die Schultertasten geben Gas und bremsen stufenlos
    const l = Math.hypot(x, y); if (l > 1 && !roh) { x /= l; y /= l; }
    return out.set(x, y);
  }
  // Gamepad (Karte Steuerung, Standardbelegung): linker Stick laufen und lenken, rechter Stick schauen, RT Gas, LT Bremse und rückwärts, A springen und bremsen, B ein und aussteigen, X rennen, Y Kamera, LB Hupe, RB Foto, Start Menü, Kreuz Blinker, Radio, Auftrag
  pollen(dt) {
    const P = navigator.getGamepads?.(); let g = null; if (P) for (const q of P) if (q?.connected && q.axes.length >= 2) { g = q; break; } if (!g) { if (this.padDa) { this.padDa = false; this.padY = 0; if (!this.touchStick) { this.stickAktiv = false; this.stick.set(0, 0); } for (const a of PAD_ALLE) this.setzeTouch(a, false); } this.padKenn = null; return; }
    // Ruhewerte (07.11.2026, Nader: "die erde dreht sich die ganze Zeit und der tag nacht wechsel hebel geht auch automatisch" auf einem anderen Rechner): manche Geräte melden in Ruhe
    // volle Ausschläge, Achsen auf -1 (Lenkräder, virtuelle Controller, 3D Mäuse) oder Schultertasten auf 0,5 bis zum ersten Drücken. Darum steuert ein Gamepad erst nach einem echten Knopfdruck,
    // Achsen und Schultertasten zählen nur als Abweichung von ihrem Ruhewert, Knöpfe, die beim Erkennen schon gedrückt sind, erst nach dem Loslassen. Prüfung: tools/gamepad_ruhe_test.mjs
    const kenn = g.index + '|' + g.id;
    if (this.padKenn !== kenn) { this.padKenn = kenn; this.padScharf = false; this.ruheA = Array.from(g.axes, v => (Math.abs(v) > 0.5 || g.mapping !== 'standard') ? (v || 0) : 0); this.ruheB = Array.from(g.buttons, q => q?.value || 0); this.sperre = new Set(); g.buttons.forEach((q, i) => { if (q?.pressed) this.sperre.add(i); }); }
    for (const i of this.sperre) if (!g.buttons[i]?.pressed) this.sperre.delete(i);
    g.buttons.forEach((q, i) => { const v = q?.value || 0; if (!(v >= this.ruheB[i])) this.ruheB[i] = v; });   // Schultertasten: der kleinste je gesehene Wert ist ihre Ruhe
    const kn = i => !this.sperre.has(i) && (!!g.buttons[i]?.pressed || (g.buttons[i]?.value ?? 0) - (this.ruheB[i] ?? 0) > 0.4);
    if (!this.padScharf) { if (!g.buttons.some((q, i) => kn(i))) return; this.padScharf = true; }
    if (!this.padDa) { this.padDa = true; this.geraet = 'gamepad'; } const tot = v => Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86, ax = i => tot(Math.max(-1, Math.min(1, (g.axes[i] ?? 0) - (this.ruheA[i] ?? 0)))), lx = ax(0), ly = ax(1), rx = ax(2), ry = ax(3), wert = i => { const r = this.ruheB[i] ?? 0; return r >= 1 ? 0 : Math.max(0, ((g.buttons[i]?.value ?? 0) - r) / (1 - r)); };
    this.stickAktiv = lx !== 0 || ly !== 0; if (this.stickAktiv) this.stick.set(lx, ly); else this.stick.set(0, 0); this.blick.x += rx * Math.abs(rx) * 900 * dt; this.blick.y += ry * Math.abs(ry) * 640 * dt; const rt = wert(7), lt = wert(6); this.padY = rt > 0.05 || lt > 0.05 ? rt - lt : 0;
    for (const [i, a] of PAD_BELEGUNG) this.setzeTouch(a, kn(i));
    this.setzeTouch('gasPlus', rt > 0.2); this.setzeTouch('gasMinus', lt > 0.2);
  }
  // am Ende jedes Bildes: Flanken und Blickdeltas verbrauchen
  bild() { this.kanten.clear(); this.touchKante = null; const b = { x: this.blick.x, y: this.blick.y, rad: this.rad }; this.blick.x = this.blick.y = 0; this.rad = 0; return b; }
  setzeTouch(aktion, an) { if (an && !this.touch[aktion]) (this.touchKante ??= {})[aktion] = true; this.touch[aktion] = an; if (aktion === 'bremse') this.setzeTouch('springen', an); }   // Knopf Bremse ist zu Fuß Springen
  zeigeStick(x, y) {
    if (!this.stickEl) return;
    if (x === null) { this.stickEl.style.display = 'none'; return; }
    this.stickEl.style.display = 'block'; this.stickEl.style.left = `${this.stickUrsprung[0]}px`; this.stickEl.style.top = `${this.stickUrsprung[1]}px`;
    this.stickEl.firstElementChild.style.transform = `translate(${x - this.stickUrsprung[0]}px, ${y - this.stickUrsprung[1]}px)`;
  }
}
