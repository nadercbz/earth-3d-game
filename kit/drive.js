// Spieler fährt, Fassung 2 (28.10.2026 nachts, Naders Kritik "wie in einem neuesten GTA Spiel"). Vorbild: das Handling Modell von
// GTA V (Werte in g: Antriebskraft, Bremskraft, Haftkurve Max, Min und Schräglaufwinkel, Lenkeinschlag im Stand, Gänge 3,33 bis
// 0,9, Luftwiderstand quadratisch) und das Zweispurmodell nach Marco Monster (Schräglaufwinkel je Achse, Seitenkraft aus der
// Haftkurve, Reibkreis, Gewichtsverlagerung beim Bremsen und Beschleunigen, Giermoment aus beiden Achsen).
// Alles in Beschleunigungen (m/s²), die Masse kürzt sich heraus. Fester Schritt 1/120 s. Unter 3 m/s blendet das Modell in die
// Kinematik (Gierrate v tan δ / Radstand), sonst explodieren die Schräglaufwinkel. Lenkassistenz wie in Arcade Spielen:
// das Lenkrad wird bei Tempo kleiner, und beim Driften lenkt das Auto von selbst ein Stück gegen.
// Seit 29.10.2026 (Naders Kritik "vibriert, zittert"): gezeigt wird zwischen den letzten zwei Physikschritten interpoliert (bildPos, bildPsi),
// sonst springt das Auto je Bild 0, 1 oder 2 Schritte (gemessen 2,6 Pixel Ruck im Mittel, Spitzen 19 Pixel bei 70 km/h).
import * as THREE from 'three';
import { setzeFahrzeug } from './vehicles.js';
import { ueberlappt } from './traffic.js';

const G = 9.81, H = 1 / 120, UP = new THREE.Vector3(0, 1, 0), RAD = Math.PI / 180;
// je Klasse: antrieb (g, Kraft am Rad im ersten Gang), vmax km/h, bremse (g), lenk (Grad im Stand), haftMax, haftMin (g), schraeg (Grad bis zur vollen Seitenkraft), gaenge
export const AUTO = {
  pkw: { antrieb: 0.52, vmax: 190, bremse: 1.05, lenk: 38, haftMax: 1.55, haftMin: 1.05, schraeg: 11, gaenge: 5, hinten: 0.6 },
  taxi: { antrieb: 0.5, vmax: 185, bremse: 1.05, lenk: 38, haftMax: 1.5, haftMin: 1.02, schraeg: 11, gaenge: 5, hinten: 0.6 },
  lieferung: { antrieb: 0.3, vmax: 140, bremse: 0.9, lenk: 40, haftMax: 1.25, haftMin: 0.9, schraeg: 10, gaenge: 5, hinten: 0.7 },
  bus: { antrieb: 0.2, vmax: 90, bremse: 0.7, lenk: 45, haftMax: 1.1, haftMin: 0.85, schraeg: 9, gaenge: 4, hinten: 0.8 },
};
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export class Fahrer {
  constructor({ quelle, kollision, start, verkehr = null, menge = null }) {
    const s = setzeFahrzeug(quelle); this.obj = s.obj; this.raeder = s.raeder; this.radius = quelle.radius; this.def = quelle.def; this.quelle = quelle;
    this.vorn = s.raeder.filter(w => /^rad_v/.test(w.name)); for (const w of this.vorn) w.rotation.order = 'YXZ';
    this.obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.K = AUTO[this.def.klasse] || AUTO.pkw; this.L = this.def.laenge; this.B = this.def.breite; this.radstand = this.L * 0.6;
    this.a = this.radstand * 0.47; this.b = this.radstand * 0.53;            // Schwerpunkt bis Vorder und Hinterachse
    this.hS = 0.5 + 0.12 * (this.def.hoehe - 1.5);                              // Schwerpunkthöhe
    this.traegheit = (this.L * this.L + this.B * this.B) / 12;                  // Gierträgheit je Masse
    // Gänge geometrisch von 3,33 bis 0,9 (wie GTA), Tempo je Gang über die Höchstgeschwindigkeit
    const n = this.K.gaenge; this.ratio = Array.from({ length: n }, (_, i) => 3.33 * Math.pow(0.9 / 3.33, i / (n - 1)));
    this.vmax = this.K.vmax / 3.6; this.vGang = this.ratio.map(r => this.vmax * 0.9 / r);
    this.luft = this.K.antrieb * G * Math.pow(this.ratio[n - 1] / 3.33, 0.75) * 0.6 / (this.vmax * this.vmax);   // Luftwiderstand so, dass oben Antrieb und Luft gleich sind
    this.kollision = kollision; this.verkehr = verkehr; this.menge = menge;
    this.start = { ...start };
    this.pos = new THREE.Vector3(start.x, kollision.hoehe(start.x, start.z), start.z); this.psi = start.ry || 0; this.dir = new THREE.Vector3(Math.sin(this.psi), 0, Math.cos(this.psi));
    this.vLong = 0; this.vLat = 0; this.omega = 0; this.delta = 0; this.lenkEingabe = 0; this.gang = 0; this.schaltZeit = 0; this.drehzahl = 0;
    this.aLong = 0; this.aLat = 0; this.spin = 0; this.spinSchlupf = 0; this.akku = 0; this.nick = 0; this.neigung = 0; this.stoesse = []; this.kmh = 0; this.maxSchritt = 0;
    this.schlupfVorn = 0; this.schlupfHinten = 0; this.driftet = false; this.rueckwaerts = false;
    this.bildPos = new THREE.Vector3(); this.bildDir = new THREE.Vector3(); this.alt = { pos: new THREE.Vector3(), psi: 0, nick: 0, neigung: 0, spin: 0, delta: 0 };
    this.bildSetzen();
  }
  // Zustand vor einem Physikschritt merken (für die Interpolation)
  merken() { const a = this.alt; a.pos.copy(this.pos); a.psi = this.psi; a.nick = this.nick; a.neigung = this.neigung; a.spin = this.spin; a.delta = this.delta; }
  // nach einem Umsetzen (Start, Ortswechsel, Prüfstand): ohne Zwischenstand zeigen
  bildSetzen() { this.merken(); this.akku = 0; this.zeigen(1); }
  update(dt, achse, handbremse) {
    this.akku += dt; let n = 0;
    while (this.akku >= H && n++ < 16) { this.merken(); this.schritt(H, achse, handbremse); this.akku -= H; }
    if (this.akku >= H) this.akku = 0;   // nach einem langen Stocken nicht nachholen
    this.zeigen(this.akku / H);
    this.kmh = Math.abs(this.vLong) * 3.6;
    const st = this.stoesse.reduce((s, x) => s + x, 0); this.stoesse.length = 0; return st;
  }
  // gezeigte Lage: Anteil k zwischen dem vorigen und dem letzten Physikschritt (bildratenunabhängig glatt, höchstens 1/120 s hinterher)
  zeigen(k) {
    const a = this.alt, l = (x, y) => x + (y - x) * k;
    this.bildPos.lerpVectors(a.pos, this.pos, k);
    let dp = this.psi - a.psi; dp = Math.atan2(Math.sin(dp), Math.cos(dp)); this.bildPsi = a.psi + dp * k;
    this.bildDir.set(Math.sin(this.bildPsi), 0, Math.cos(this.bildPsi));
    this.obj.position.copy(this.bildPos); this.obj.rotation.set(l(a.nick, this.nick), this.bildPsi, l(a.neigung, this.neigung), 'YXZ');
    const spin = l(a.spin, this.spin), delta = l(a.delta, this.delta);
    for (const w of this.raeder) w.rotation.x = spin / this.radius;
    for (const w of this.vorn) w.rotation.y = -delta;   // positives rotation.y dreht nach links, delta positiv ist rechts
  }
  // Haftkurve: Seitenkraft in g über dem Schräglaufwinkel, linear bis zum Spitzenwinkel, dahinter Abfall auf haftMin (GTA Max und Min)
  haft(alpha, max, min, schraeg) {
    const a = Math.abs(alpha), p = schraeg * RAD;
    if (a <= p) return max * (a / p);
    return max + (min - max) * clamp((a - p) / (1.5 * p), 0, 1);
  }
  schritt(h, achse, handbremse) {
    const K = this.K, v = this.vLong, av = Math.abs(v);
    const gas = Math.max(0, achse.y), bremse = Math.max(0, -achse.y);
    // Lenkung: Eingabe weich (Rampe 0,12 s hin, 0,08 s zurück), Einschlag nimmt mit dem Tempo ab (38 Grad im Stand, rund 11 Grad bei 160 km/h)
    const rampe = Math.abs(achse.x) > Math.abs(this.lenkEingabe) ? 1 / 0.12 : 1 / 0.08;
    this.lenkEingabe += clamp(achse.x - this.lenkEingabe, -rampe * h, rampe * h);
    const lock = K.lenk * RAD * (1 - 0.72 * THREE.MathUtils.smoothstep(av, 2, 45));
    let dZiel = this.lenkEingabe * lock;
    // Gegenlenkhilfe beim Driften: ein Teil des Schwimmwinkels wird automatisch gegengelenkt, so bleibt ein Drift fahrbar
    const beta = av > 3 ? Math.atan2(this.vLat, av) : 0;
    if (Math.abs(beta) > 3 * RAD) dZiel += clamp(0.55 * beta, -0.35, 0.35) * Math.sign(v);
    this.delta += clamp(dZiel - this.delta, -8 * h, 8 * h);
    // Gänge: Drehzahl aus dem Tempo im Gang, hoch bei 92 Prozent, runter bei 45 Prozent, Schalten 0,22 s ohne Kraft
    const gangV = this.vGang[this.gang]; this.drehzahl = clamp(av / gangV, 0, 1);
    if (this.schaltZeit > 0) this.schaltZeit -= h;
    else if (this.drehzahl > 0.92 && this.gang < this.ratio.length - 1 && v > 0) { this.gang++; this.schaltZeit = 0.22; }
    else if (this.gang > 0 && av / this.vGang[this.gang - 1] < 0.45) { this.gang--; this.schaltZeit = 0.1; }
    // Antrieb: flach bis 80 Prozent Drehzahl, dann auf 60 Prozent, Kraft je Gang geometrisch, Rückwärtsgang im Stand mit S
    let kurve = this.drehzahl < 0.8 ? 1 : 1 - 0.4 * (this.drehzahl - 0.8) / 0.2;
    const kraft = K.antrieb * G * Math.pow(this.ratio[this.gang] / 3.33, 0.75) * kurve;
    let aAntrieb = 0, aBrems = 0;
    this.rueckwaerts = v < -0.2 || (av < 0.2 && bremse > 0 && gas === 0);
    if (this.rueckwaerts) { if (bremse > 0 && v > -7) aAntrieb = -0.35 * K.antrieb * G * bremse; if (gas > 0) aBrems = K.bremse * G * gas; }
    else { if (gas > 0 && this.schaltZeit <= 0) aAntrieb = kraft * gas; if (bremse > 0) aBrems = K.bremse * G * bremse; }
    if (gas === 0 && bremse === 0 && av > 0.3) aBrems += 0.45;                  // Motorbremse
    const aLuft = this.luft * v * v + 0.3;                                          // Luft (quadratisch) und Rollen
    // Achslasten mit Gewichtsverlagerung aus der letzten Längsbeschleunigung (Bremsen lädt vorn, Gas hinten)
    const Lw = this.radstand, nV = clamp(G * this.b / Lw - this.hS / Lw * this.aLong, 0.15 * G, 0.85 * G), nH = G - nV;
    // Haftung der Achsen: Handbremse blockiert hinten, blockierte oder durchdrehende Räder fallen auf haftMin
    let haftMaxH = K.haftMax, haftMinH = K.haftMin, haftMaxV = K.haftMax, haftMinV = K.haftMin;
    let aBremsV = aBrems * 0.62, aBremsH = aBrems * 0.38;
    if (handbremse && av > 0.5) { aBremsH += K.bremse * G * 0.9; haftMaxH = K.haftMin * 0.55; haftMinH = K.haftMin * 0.45; }
    // Schräglaufwinkel (Zweispurmodell), unter 3 m/s kinematisch
    let Fv = 0, Fh = 0, aLat = 0, domega = 0;
    if (av > 3) {
      const sv = Math.sign(v);
      const alphaV = Math.atan2(this.vLat + this.omega * this.a * sv, av) - this.delta * sv;
      const alphaH = Math.atan2(this.vLat - this.omega * this.b * sv, av);
      this.schlupfVorn = alphaV; this.schlupfHinten = alphaH;
      // Reibkreis je Achse: was die Längskraft (Antrieb hinten, Bremse) verbraucht, fehlt seitlich; zu viel Längskraft heißt Schlupf (Wheelspin, blockiert)
      const grenzeH = haftMaxH * nH, grenzeV = haftMaxV * nV;
      let langH = aBremsH * Math.sign(v) * -1 + aAntrieb * K.hinten, langV = aBremsV * Math.sign(v) * -1 + aAntrieb * (1 - K.hinten);
      let spinH = false, spinV = false;
      if (Math.abs(langH) > grenzeH * 0.95) { spinH = true; langH = Math.sign(langH) * grenzeH * 0.85; haftMaxH = haftMinH; }
      if (Math.abs(langV) > grenzeV * 0.95) { spinV = true; langV = Math.sign(langV) * grenzeV * 0.85; haftMaxV = haftMinV; }
      const restH = Math.sqrt(Math.max(0, grenzeH * grenzeH - langH * langH)), restV = Math.sqrt(Math.max(0, grenzeV * grenzeV - langV * langV));
      Fv = -Math.sign(alphaV) * Math.min(this.haft(alphaV, haftMaxV, haftMinV, K.schraeg) * nV, restV);
      Fh = -Math.sign(alphaH) * Math.min(this.haft(alphaH, haftMaxH, haftMinH, K.schraeg) * nH, restH);
      this.aLong = (langH + langV) - Math.sign(v) * aLuft; if (av < 0.3 && gas === 0 && aAntrieb === 0) this.aLong = 0;
      aLat = Fv * Math.cos(this.delta) + Fh;
      domega = (this.a * Fv * Math.cos(this.delta) - this.b * Fh) / this.traegheit;
      this.spinSchlupf = spinH || spinV ? 1 : 0; this.driftet = Math.abs(alphaH) > K.schraeg * RAD * 1.2;
      this.vLong += (this.aLong + this.vLat * this.omega) * h;   // Körperkoordinaten: Fliehkraft koppelt die Achsen
      this.vLat += (aLat - this.vLong * this.omega) * h;
      this.omega += domega * h;
    } else {
      // Kinematik: Gierrate aus dem Einschlag, Querbewegung klingt schnell ab (kein Schwimmen im Stand)
      const kraftLong = aAntrieb - Math.sign(v) * Math.min(aBrems + aLuft, av / h + 0.001);
      this.aLong = kraftLong; this.vLong += kraftLong * h;
      const omegaZiel = this.vLong * Math.tan(this.delta) / Lw;
      this.omega += (omegaZiel - this.omega) * (1 - Math.exp(-12 * h));
      this.vLat *= Math.exp(-10 * h);
      this.schlupfVorn = this.schlupfHinten = 0; this.spinSchlupf = 0; this.driftet = false;
      if (gas === 0 && bremse === 0 && !handbremse && Math.abs(this.vLong) < 0.08) { this.vLong = 0; this.omega = 0; }
      if (handbremse && Math.abs(this.vLong) < 0.3) { this.vLong = 0; this.omega = 0; }
    }
    this.aLat = aLat;
    const psiAlt = this.psi;
    this.psi -= this.omega * h;                                                   // delta positiv dreht nach rechts, psi nimmt ab
    // Bewegung in Weltkoordinaten
    _f.set(Math.sin(this.psi), 0, Math.cos(this.psi)); _r.crossVectors(_f, UP);
    // Kollision robust (29.10.2026 spät, Naders Kritik "Auto geht kaputt"): dreht sich eine Ecke in die Wand, wird die Drehung zurückgenommen;
    // steckt das Auto schon (nach einem Ortswechsel oder beim Start), wird es zur nächsten freien Stelle geschoben, sonst fährt es hinaus.
    // Vorher konnte es dauerhaft in einer Hauswand hängen und zitterte (jeder Schritt ein Rückprall mit Stoß)
    this.geist = false;
    if (!this.eckenFrei(this.pos.x, this.pos.z)) {
      this.psi = psiAlt; _f.set(Math.sin(this.psi), 0, Math.cos(this.psi)); _r.crossVectors(_f, UP);
      if (this.eckenFrei(this.pos.x, this.pos.z)) this.omega *= 0.2; else if (!this.befreien()) this.geist = true;
    }
    const dx = (_f.x * this.vLong + _r.x * this.vLat) * h, dz = (_f.z * this.vLong + _r.z * this.vLat) * h;
    this.maxSchritt = Math.max(this.maxSchritt, Math.hypot(dx, dz));
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (this.geist || this.eckenFrei(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
    else {
      const wucht = Math.hypot(this.vLong, this.vLat);
      // streifend: an der Wand entlang gleiten (eine Achse frei), etwas Reibung; frontal: Rückprall, kleine Tempi bleiben stehen
      const gx = this.eckenFrei(nx, this.pos.z), gz = !gx && this.eckenFrei(this.pos.x, nz);
      if ((gx || gz) && wucht > 0.5) {
        if (gx) this.pos.x = nx; else this.pos.z = nz;
        this.vLong *= 0.96; this.vLat *= 0.8; this.omega *= 0.7;
        if (wucht > 6 && !this.kratzt) this.stoesse.push(Math.min(0.25, wucht / 50)); this.kratzt = true;
      } else {
        if (wucht > 1.5) this.stoesse.push(Math.min(0.7, wucht / 12));
        this.vLong = Math.abs(this.vLong) > 3 ? this.vLong * -0.22 : 0; this.vLat *= -0.2; this.omega *= 0.3;
        const bx = this.pos.x - dx, bz = this.pos.z - dz; if (this.eckenFrei(bx, bz)) { this.pos.x = bx; this.pos.z = bz; }
      }
    }
    if (this.eckenFrei(nx, nz)) this.kratzt = false;
    this.dir.copy(_f);
    // KI Autos: gedrehte Rechtecke, auseinanderschieben, halbes Tempo
    if (this.verkehr) for (const o of this.verkehr.alle) {
      if (o.pos.distanceToSquared(this.pos) > 400) continue;
      if (ueberlappt(this, o)) {
        _n.subVectors(this.pos, o.pos); _n.y = 0; if (_n.lengthSq() < 1e-6) _n.copy(_r); _n.normalize();
        const px = this.pos.x + _n.x * 0.25, pz = this.pos.z + _n.z * 0.25; if (this.eckenFrei(px, pz)) { this.pos.x = px; this.pos.z = pz; }
        if (Math.abs(this.vLong) > 1.5) this.stoesse.push(Math.min(0.5, Math.abs(this.vLong - o.v) / 14));
        this.vLong *= 0.5; this.vLat *= 0.5; this.omega *= 0.5;
      }
    }
    // Menschen: wer im Rechteck steht, wird zur Seite geschoben
    if (this.menge) for (const p of this.menge.alle) {
      const rx = p.pos.x - this.pos.x, rz = p.pos.z - this.pos.z;
      const l = rx * _f.x + rz * _f.z, q = rx * _r.x + rz * _r.z;
      if (Math.abs(l) < this.L / 2 + 0.4 && Math.abs(q) < this.B / 2 + 0.4) { const s = Math.sign(q) || 1, weg = (this.B / 2 + 0.45 - Math.abs(q)); p.pos.x += _r.x * s * weg; p.pos.z += _r.z * s * weg; p.push.x += _r.x * s * 0.4; p.push.z += _r.z * s * 0.4; }
    }
    // Boden (Bordstein als Stufe), Räder (bei Schlupf drehen sie schneller), Nicken und Wanken aus den Beschleunigungen
    const yZiel = this.kollision.hoehe(this.pos.x, this.pos.z); this.pos.y += (yZiel - this.pos.y) * (1 - Math.exp(-18 * h));
    this.spin += (this.vLong + (this.spinSchlupf ? Math.sign(this.vLong || 1) * 6 : 0)) * h;
    this.nick += (clamp(-this.aLong * 0.004, -0.03, 0.03) - this.nick) * (1 - Math.exp(-6 * h));
    this.neigung += (clamp(-this.aLat * 0.0045, -0.05, 0.05) - this.neigung) * (1 - Math.exp(-6 * h));
  }
  // nächste freie Stelle im Umkreis von 8 m (Ringe, je 16 Richtungen); die gezeigte Lage springt mit (keine Schliere)
  befreien() {
    for (const r of [0.25, 0.5, 0.9, 1.4, 2, 3, 4.5, 6, 8]) for (let k = 0; k < 16; k++) {
      const w = k / 16 * Math.PI * 2, x = this.pos.x + Math.cos(w) * r, z = this.pos.z + Math.sin(w) * r;
      if (this.eckenFrei(x, z)) { this.alt.pos.x += x - this.pos.x; this.alt.pos.z += z - this.pos.z; this.pos.x = x; this.pos.z = z; return true; }
    }
    return false;
  }
  eckenFrei(x, z) {
    const hl = this.L / 2, hb = this.B / 2;
    for (const [sl, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (!this.kollision.frei(x + _f.x * hl * sl + _r.x * hb * sb, z + _f.z * hl * sl + _r.z * hb * sb)) return false;
    return true;
  }
  get v() { return this.vLong; }
  entfernen() { this.obj.parent?.remove(this.obj); }
}
