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
};

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
  // Bewegungsvektor (x rechts, y vor), Tasten voll, Joystick radial mit Totbereich 0,2
  achse(out) {
    let x = (this.an('rechts') ? 1 : 0) - (this.an('links') ? 1 : 0), y = (this.an('vor') ? 1 : 0) - (this.an('zurueck') ? 1 : 0);
    if (!x && !y && this.stickAktiv) {
      const m = this.stick.length();
      if (m > 0.2) { const k = Math.min(1, (m - 0.2) / 0.8); x = this.stick.x / m * k; y = -this.stick.y / m * k; }
    }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return out.set(x, y);
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
