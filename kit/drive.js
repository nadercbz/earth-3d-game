// Spieler fährt, Fassung 4 (09.11.2026, Wunsch Nr. 100, Nader: "Fahrphysik noch besser machen wie in einem richtigen AAA Game wo man
// Auto fährt wie bei GTA"). Simcade Modell nach dem Vorbild von GTA V und Forza Horizon, Konzept und Recherche in 06_STEUERUNG.md:
//  - jedes Rad einzeln: Last aus dem Fahrwerk, Schräglaufwinkel und Schlupf im Radkoordinatensystem, Reifenkurve nach Pacejka (Höchstwert bei
//    rund 9 Grad, danach sanft auf rund 75 Prozent), Längs und Querkraft teilen sich die Haftung (normierter Schlupf, Reibkreis), Last senkt
//    den Reibwert leicht, Raddrehzahl je Rad (Durchdrehen, Blockieren, beides sichtbar und hörbar)
//  - Fahrwerk als Feder Dämpfer: Hub, Nicken und Wanken des Aufbaus auf je einer Feder je Rad, Stabilisatoren, Rollzentrum. Die Radlasten
//    kommen aus den Federn (Gewicht wandert), jedes Rad tastet den Boden selbst ab (Hang, Bordstein), die Räder federn sichtbar ein
//  - Motor mit Drehmomentkurve, Automatik mit weicher Übergabe des Moments (nie ohne Kraft, Regel aus Nr. 81), Begrenzer, Motorbremse
//  - Hilfen: Lenkung begrenzt auf den besten Schräglaufwinkel (wie Forza Horizon "normal"), Gegenlenkhilfe, ABS, Traktionshilfe, Stabilität
//  - Kollision mit Stoß und Drehimpuls an der Ecke, die trifft
// Bremsen geht weiter stetig in Rückwärts über und umgekehrt (Nr. 81). Fester Schritt 1/120 s, gezeigt wird zwischen den letzten zwei
// Schritten interpoliert (bildPos, bildPsi, seit 29.10.2026). Alles in SI Einheiten. Fassung 3 (Arcade, 08.11.2026) liegt in
// artifacts/fahrphysik/alt/drive_fassung3.js.
import * as THREE from 'three';
import { setzeFahrzeug, spielerTeile, sattelTrennen } from './vehicles.js';
import { ueberlappt } from './traffic.js';

const G = 9.81, H = 1 / 120, UP = new THREE.Vector3(0, 1, 0), RAD = Math.PI / 180;
const SCHALT = 0.25;   // s: Dauer eines Gangwechsels, das Moment sinkt dabei weich auf 70 Prozent (nie ohne Kraft, Regel aus Nr. 81)
const VEPS = 3;   // m/s: Nenner für Schlupf und Schräglauf bei kleinem Tempo (stabil bei 120 Hz, kein Zittern beim Rangieren)
const clamp = THREE.MathUtils.clamp, sm = THREE.MathUtils.smoothstep;

// Reifenkurve, normiert: Höchstwert 1 bei s = 1 (s = Schlupf geteilt durch den Schlupf des Höchstwerts), danach sanft fallend (s = 3: 0,89,
// s = 10: 0,77, Grenzwert 0,71). Magic Formula sin(C atan(B s minus E (B s minus atan B s))) mit C 1,5 und E 0,2, B so, dass der Gipfel bei 1 liegt
const PC = 1.5, PE = 0.2, PB = (() => { const ziel = Math.tan(Math.PI / (2 * PC)); let a = 0.5, b = 6; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; (m - PE * (m - Math.atan(m)) < ziel ? (a = m) : (b = m)); } return (a + b) / 2; })();
const kurve = s => { const b = PB * s; return Math.sin(PC * Math.atan(b - PE * (b - Math.atan(b)))); };
const STEIL = PB * PC;   // Anstieg bei s = 0 (f(s) / s für s gegen 0)
// Kräfte eines Reifens aus normiertem Längsschlupf sx und Querschlupf sy: [Fx vorwärts, Fw zur rechten Radseite]
// Beim Rutschen (s über 1) dreht die Kraft weich in die echte Rutschrichtung (Längsschlupf kappa und tan alpha, nicht normiert): ein blockiertes
// Rad reibt genau gegen seine Bewegung, sonst hätte es quer zu wenig Halt (kP und tP: Schlupf und tan Winkel des Höchstwerts)
function reifen(sx, sy, F, out, kP = 0.11, tP = 0.15) {
  const s = Math.hypot(sx, sy); if (s < 1e-5) { out[0] = F * STEIL * sx; out[1] = -F * STEIL * sy; return out; }
  const mag = F * kurve(s), w = s > 1 ? sm(s, 1, 3) : 0; let dx = sx / s, dy = sy / s;
  if (w > 0) { const px = sx * kP, py = sy * tP, pl = Math.hypot(px, py) || 1; dx += (px / pl - dx) * w; dy += (py / pl - dy) * w; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
  out[0] = mag * dx; out[1] = -mag * dy; return out;
}
// Drehmomentkurve über der Drehzahl (Anteil am Höchstwert über Anteil an der roten Drehzahl)
const MOMENT = [[0, 0.55], [0.13, 0.62], [0.3, 0.88], [0.45, 1], [0.7, 1], [0.85, 0.93], [1, 0.8], [1.2, 0.6]];
function momentKurve(x) { for (let i = 1; i < MOMENT.length; i++) if (x <= MOMENT[i][0]) { const [a, fa] = MOMENT[i - 1], [b, fb] = MOMENT[i]; return fa + (fb - fa) * (x - a) / (b - a); } return 0.6; }

// Werte je Klasse und Fahrzeug (Fassung 4). masse kg, moment Nm (Motor), rot Drehzahl am Begrenzer, gaenge, v1 km/h am Begrenzer im ersten Gang,
// vmax km/h, cwA m² (Luftwiderstand), vorn Anteil des Gewichts vorn, hinten Anteil des Antriebs hinten (0 Front, 1 Heck), hS Schwerpunkthöhe m,
// mu Reibwert, alphaP Grad (Höchstwert der Querkraft), kappaP Längsschlupf des Höchstwerts, feder Hz, daempf (Anteil der kritischen Dämpfung),
// wank und nick Grad je g, rz Rollzentrum m, stabiVorn (Anteil vorn an der Wanksteifigkeit, mehr vorn ist gutmütiger), bremse g, vorderBremse
// Anteil, lenk Grad im Stand, vRueck km/h, traeg Radträgheit kg m² je Rad, cs Gegenlenkhilfe (Anteil des Schwimmwinkels)
export const AUTO = {
  pkw: { masse: 1380, moment: 300, rot: 6600, leer: 850, gaenge: 6, v1: 58, vmax: 205, cwA: 0.66, vorn: 0.59, hinten: 0.45, muHinten: 1.06, hS: 0.53, mu: 1.12, alphaP: 8.5, kappaP: 0.11, feder: 1.55, daempf: 0.48, wank: 3.8, nick: 1.9, rz: 0.1, stabiVorn: 0.66, bremse: 1.3, vorderBremse: 0.7, lenk: 36, vRueck: 32, traeg: 1.1, cs: 0.75 },
  taxi: { masse: 1720, moment: 400, rot: 6200, leer: 800, gaenge: 6, v1: 58, vmax: 210, cwA: 0.66, vorn: 0.54, hinten: 1, muHinten: 1.06, hS: 0.55, mu: 1.08, alphaP: 8.5, kappaP: 0.11, feder: 1.45, daempf: 0.4, wank: 4.4, nick: 2.3, rz: 0.1, stabiVorn: 0.64, bremse: 1.28, vorderBremse: 0.68, lenk: 36, vRueck: 32, traeg: 1.2, cs: 0.75 },
  lieferung: { masse: 2600, moment: 430, rot: 4600, leer: 800, gaenge: 6, v1: 42, vmax: 158, cwA: 1.9, vorn: 0.55, hinten: 1, muHinten: 1.06, hS: 0.88, mu: 1.0, alphaP: 10, kappaP: 0.12, feder: 1.4, daempf: 0.4, wank: 6.0, nick: 3.0, rz: 0.15, stabiVorn: 0.62, bremse: 1.1, vorderBremse: 0.68, lenk: 38, vRueck: 26, traeg: 1.8, cs: 0.65 },
  bus: { masse: 14500, moment: 1900, rot: 2400, leer: 600, gaenge: 6, v1: 22, vmax: 90, cwA: 7.5, vorn: 0.35, hinten: 1, muHinten: 1.0, hS: 1.3, mu: 0.74, alphaP: 11, kappaP: 0.13, feder: 1.2, daempf: 0.38, wank: 7, nick: 2.0, rz: 0.4, stabiVorn: 0.55, bremse: 0.75, vorderBremse: 0.55, lenk: 42, vRueck: 18, traeg: 14, cs: 0.5 },
  lkw: { masse: 11000, moment: 1500, rot: 2500, leer: 600, gaenge: 8, v1: 20, vmax: 95, cwA: 6.5, vorn: 0.42, hinten: 1, muHinten: 1.0, hS: 1.25, mu: 0.78, alphaP: 11, kappaP: 0.13, feder: 1.25, daempf: 0.38, wank: 4.8, nick: 2.2, rz: 0.4, stabiVorn: 0.55, bremse: 0.75, vorderBremse: 0.55, lenk: 40, vRueck: 16, traeg: 12, cs: 0.5 },
  traktor: { masse: 4800, moment: 600, rot: 2300, leer: 700, gaenge: 6, v1: 9, vmax: 40, cwA: 3.2, vorn: 0.42, hinten: 1, muHinten: 1.0, hS: 1.0, mu: 0.82, alphaP: 11, kappaP: 0.14, feder: 1.6, daempf: 0.5, wank: 3.0, nick: 2.0, rz: 0.3, stabiVorn: 0.5, bremse: 0.7, vorderBremse: 0.5, lenk: 40, vRueck: 14, traeg: 6, cs: 0.4 },
};
// Charakter je Fahrzeug (Abweichungen von der Klasse): Kompakt hecklastiger Allrad, Limousine Heckantrieb, Kombi Allrad, SUV hoch und weich
const PRO_ID = {
  limousine: { masse: 1620, moment: 400, rot: 6800, v1: 62, vmax: 235, cwA: 0.62, vorn: 0.53, hinten: 1, hS: 0.5, wank: 3.7, nick: 2.0, mu: 1.14, alphaP: 8 },
  kombi: { masse: 1680, moment: 380, rot: 6500, vmax: 222, cwA: 0.68, vorn: 0.56, hinten: 0.55, hS: 0.56, wank: 4.4 },
  suv: { masse: 1820, moment: 420, rot: 6200, vmax: 205, cwA: 0.86, vorn: 0.56, hinten: 0.5, hS: 0.68, mu: 1.05, alphaP: 9.5, wank: 5.4, nick: 2.7, feder: 1.4 },
  verteiler: { masse: 9000 }, muell: { masse: 15000, hS: 1.45, vmax: 85, wank: 5.4 }, sattel: { masse: 14000, gaenge: 12, vmax: 90 },
};
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3(), _k = [0, 0], _k2 = [0, 0];
const ECKEN = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const RICHT = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);

export class Fahrer {
  constructor({ quelle, kollision, start, verkehr = null, menge = null }) {
    const s = setzeFahrzeug(quelle); this.obj = s.obj; this.raeder = s.raeder; this.radius = quelle.radius; this.def = quelle.def; this.quelle = quelle;
    this.fassung = 4;
    this.vorn = s.raeder.filter(w => /^rad_v/.test(w.name)); for (const w of this.raeder) w.rotation.order = 'YXZ';
    this.obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.K = { ...(AUTO[this.def.klasse] || AUTO.pkw), ...(PRO_ID[this.def.id] || {}) };
    const K = this.K; this.L = this.def.laenge; this.B = this.def.breite;
    this.masse = K.masse; this.hS = K.hS;
    // Räder aus dem Modell: Lage (x links positiv, z vorn positiv) und Radius (Radmitte liegt in Ruhe auf Radiushöhe)
    this.rad = this.raeder.map(w => ({ w, x: w.position.x, y0: w.position.y, z: w.position.z, r: Math.max(0.2, w.position.y || this.radius || 0.34), vorn: /^rad_v/.test(w.name),
      om: 0, phi: 0, phiA: 0, g: 0, gA: 0, gRoh: 0, c: 0, Fz: 0, F0: 0, k: 0, d: 0, sx: 0, sy: 0, rutscht: 0, kontakt: true, welt: new THREE.Vector3(), weltY: 0 }));
    if (!this.rad.length) this.rad = [[0.8, 1.3, true], [-0.8, 1.3, true], [0.8, -1.3, false], [-0.8, -1.3, false]].map(([x, z, vorn]) => ({ w: null, x, y0: 0.34, z, r: 0.34, vorn, om: 0, phi: 0, phiA: 0, g: 0, gA: 0, gRoh: 0, c: 0, Fz: 0, F0: 0, k: 0, d: 0, sx: 0, sy: 0, rutscht: 0, kontakt: true, welt: new THREE.Vector3(), weltY: 0 }));
    // für die Physik spiegelgleich: Räder einer Achse (gleiches vorn und Lage auf 0,3 m) bekommen dieselbe Längslage und den mittleren Abstand zur
    // Mitte (die generierten Modelle hatten links und rechts bis 1,5 cm Versatz, das Auto zog um 0,3 Grad). Die Knoten im Bild bleiben, wo sie sind
    for (const r of this.rad) { const achse = this.rad.filter(q => q.vorn === r.vorn && Math.abs(q.z - r.z) < 0.3), gl = achse.filter(q => Math.abs(Math.abs(q.x) - Math.abs(r.x)) < 0.15);
      r.zP = achse.reduce((a, q) => a + q.z, 0) / achse.length; r.xP = Math.sign(r.x || 1) * gl.reduce((a, q) => a + Math.abs(q.x), 0) / gl.length; }
    for (const r of this.rad) { r.z = r.zP; r.x = r.xP; }
    const RV = this.rad.filter(r => r.vorn), RH = this.rad.filter(r => !r.vorn);
    const zV = RV.reduce((a, r) => a + r.z, 0) / Math.max(1, RV.length), zH = RH.reduce((a, r) => a + r.z, 0) / Math.max(1, RH.length);
    this.radstand = Math.max(1.5, zV - zH); this.spur = Math.max(1.2, RV.reduce((a, r) => Math.max(a, Math.abs(r.x)), 0) * 2);
    // statische Lasten, Federn und Dämpfer je Rad (Eigenfrequenz feder Hz, Dämpfung daempf der kritischen), ungefederte Masse 4 Prozent
    const m = this.masse, mU = m * 0.04 / this.rad.length;
    for (const r of this.rad) { const anteil = r.vorn ? K.vorn / Math.max(1, RV.length) : (1 - K.vorn) / Math.max(1, RH.length); r.F0 = m * G * anteil - mU * G; const me = r.F0 / G; r.k = me * (2 * Math.PI * K.feder) ** 2; r.d = 2 * K.daempf * Math.sqrt(r.k * me); r.mU = mU; }
    this.mS = m - mU * this.rad.length;   // gefederte Masse
    const L = this.L, Bb = this.B, Hh = this.def.hoehe || 1.5;
    const zA = zH + K.vorn * (zV - zH);   // Schwerpunkt längs: Anteil vorn ist b durch Radstand, also näher an der schwereren Achse
    this.zV = zV - zA; this.zH = zH - zA;   // Vorder und Hinterachse relativ zum Schwerpunkt
    this.zS = zA;   // vLong und vLat sind die Geschwindigkeit des Schwerpunkts, pos ist die Mitte des Modells (Kollision, Verkehr, Kamera)
    this.Iz = m * (L * L + Bb * Bb) / 12 * 0.9;                 // Gieren
    this.Ix = this.mS * (L * L + Hh * Hh) / 12 * 0.85;          // Nicken
    this.Iw = this.mS * (Bb * Bb + Hh * Hh) / 12 * 0.8;         // Wanken
    // Nicken: Hebel so, dass 1 g Längsbeschleunigung nick Grad ergibt; Wanken: Stabilisatoren ergänzen die Federn bis wank Grad je g
    const kNick = this.rad.reduce((a, r) => a + r.k * (r.z - zA) ** 2, 0); this.hNick = K.nick * RAD * kNick / (this.mS * G);
    const kWankFedern = this.rad.reduce((a, r) => a + r.k * r.x * r.x, 0), kWank = this.mS * G * Math.max(0.05, this.hS - K.rz) / (K.wank * RAD);
    const kStabi = Math.max(0, kWank - kWankFedern); this.stabi = { vorn: kStabi * K.stabiVorn / this.spur ** 2, hinten: kStabi * (1 - K.stabiVorn) / this.spur ** 2 };   // Kraft je Seite = Steifigkeit mal Unterschied der Einfederung links und rechts
    this.hWank = Math.max(0.05, this.hS - K.rz);
    // Getriebe: Tempo am Begrenzer je Gang geometrisch von v1 bis knapp über vmax, Übersetzung gesamt (Motor zu Rad)
    const rR = this.rad.find(r => !r.vorn)?.r || this.rad[0].r; this.rAntrieb = rR;
    const vTop = K.vmax * 1.05 / 3.6, v1 = K.v1 / 3.6, n = K.gaenge;
    this.vGang = Array.from({ length: n }, (_, i) => v1 * Math.pow(vTop / v1, n > 1 ? i / (n - 1) : 0));
    this.ratio = this.vGang.map(v => (K.rot * 2 * Math.PI / 60) * rR / v);
    this.rueckRatio = this.ratio[0] * 1.05;
    this.vmax = K.vmax / 3.6;
    this.kollision = kollision; this.verkehr = verkehr; this.menge = menge;
    this.start = { ...start };
    this.pos = new THREE.Vector3(start.x, kollision.hoehe(start.x, start.z), start.z); this.psi = start.ry || 0; this.dir = new THREE.Vector3(Math.sin(this.psi), 0, Math.cos(this.psi));
    // Aufbau: alles außer den Rädern hängt an einem Drehpunkt in Schwerpunkthöhe, damit Nicken und Wanken um die richtige Stelle drehen
    this.aufbau = new THREE.Group(); this.aufbau.name = 'aufbau'; this.aufbau.position.set(0, this.hS, zA); this.aufbau.rotation.order = 'YXZ';
    for (const c of this.obj.children.slice()) if (!/^rad_/.test(c.name)) { c.position.sub(this.aufbau.position); this.aufbau.add(c); }
    this.obj.add(this.aufbau);
    spielerTeile(this.obj);   // eigene Materialkopien (Lichter), bei eigenen Pkw durchsichtiges Glas und Innenraum (kit/vehicles.js)
    this.sattelDreiecke = sattelTrennen(this.obj);   // Bremssättel drehen nicht mit (Knoten rad_sattel, zurückgedreht in zeigen)
    this.zuruecksetzen(0);
    this.stoesse = []; this.treffer = []; this.motor = 1; this.maxSchritt = 0; this.kmh = 0; this.griff = 1;   // griff: Faktor auf den Reibwert (Regen, von app.js gesetzt)
    this.bildPos = new THREE.Vector3(); this.bildDir = new THREE.Vector3(); this.alt = { pos: new THREE.Vector3(), psi: 0, yRel: 0, nick: 0, wank: 0, delta: 0 };
    this.bildSetzen();
  }
  // Fahrzustand neu (Start, Prüfstand, Respawn): Tempo v0 geradeaus, Fahrwerk in Ruhe, passender Gang
  zuruecksetzen(v0 = 0) {
    this.vLong = v0; this.vLat = 0; this.omega = 0; this.delta = 0; this.lenkEingabe = 0; this.gasR = 0; this.bremsR = 0; this.drift = 0;
    this.yRel = 0; this.vy = 0; this.nick = 0; this.vNick = 0; this.neigung = 0; this.vWank = 0; this.aLong = 0; this.aLat = 0; this.aLongG = 0; this.aLatG = 0;
    this.gang = 0; while (this.gang < this.ratio.length - 1 && Math.abs(v0) > this.vGang[this.gang] * 0.8) this.gang++;
    this.schalt = 0; this.gangAlt = this.gang; this.seitSchalt = 9; this.rpm = this.K.leer; this.drehzahl = this.rpm / this.K.rot; this.last = 0;
    this.rueckwaerts = false; this.driftet = false; this.schlupfTon = 0; this.schlupfVorn = 0; this.schlupfHinten = 0; this.spinSchlupf = 0; this.bremsLicht = false; this.handbremse = false;
    this.akku = this.akku || 0; this.geist = false; this.kratzt = false;
    for (const r of this.rad) { r.om = v0 / r.r; r.g = 0; r.gA = 0; r.c = 0; r.Fz = r.F0 + r.mU * G; r.rutscht = 0; r.kontakt = true; }
    this.bodenNeu = true;
  }
  // Zustand vor einem Physikschritt merken (für die Interpolation)
  merken() { const a = this.alt; a.pos.copy(this.pos); a.psi = this.psi; a.yRel = this.yRel; a.nick = this.nick; a.wank = this.neigung; a.delta = this.delta; for (const r of this.rad) { r.phiA = r.phi; r.gA = r.g; } }
  // nach einem Umsetzen (Start, Ortswechsel, Prüfstand): ohne Zwischenstand zeigen, die Räder drehen dann mit dem Tempo
  bildSetzen() { if (this.alt && this.alt.pos.distanceToSquared(this.pos) > 4) this.bodenNeu = true; if (this.bodenNeu) { for (const r of this.rad) r.om = this.vLong / r.r; this.bodenAbtasten(true); } this.merken(); this.akku = 0; this.zeigen(1); }
  update(dt, achse, handbremse) {
    this.akku += dt; let n = 0;
    while (this.akku >= H && n++ < 16) { this.merken(); this.schritt(H, achse, handbremse); this.akku -= H; }
    if (this.akku >= H) this.akku = 0;   // nach einem langen Stocken nicht nachholen
    this.zeigen(this.akku / H);
    this.kmh = Math.abs(this.vLong) * 3.6;
    this.lichter();
    const st = this.stoesse.reduce((s, x) => s + x, 0); this.stoesse.length = 0; return st;
  }
  // gezeigte Lage: Anteil k zwischen dem vorigen und dem letzten Physikschritt. Wurzel: Lage und Gieren, Aufbau: Hub, Nicken, Wanken, Räder: Federweg, Drehung, Einschlag
  zeigen(k) {
    const a = this.alt, l = (x, y) => x + (y - x) * k;
    this.bildPos.lerpVectors(a.pos, this.pos, k);
    let dp = this.psi - a.psi; dp = Math.atan2(Math.sin(dp), Math.cos(dp)); this.bildPsi = a.psi + dp * k;
    this.bildDir.set(Math.sin(this.bildPsi), 0, Math.cos(this.bildPsi));
    this.obj.position.copy(this.bildPos); this.obj.rotation.set(0, this.bildPsi, 0, 'YXZ');
    const yRel = l(a.yRel, this.yRel), nk = l(a.nick, this.nick), wk = l(a.wank, this.neigung), delta = l(a.delta, this.delta);
    this.aufbau.position.y = this.hS + yRel; this.aufbau.rotation.set(nk, 0, wk, 'YXZ');
    for (const r of this.rad) {
      if (!r.w) continue;
      const Y = yRel - nk * (r.z - this.aufbau.position.z) + wk * r.x, g = l(r.gA, r.g);
      r.w.position.y = r.y0 + Math.min(Y + 0.1, Math.max(g, Y - 0.15));   // auf dem Boden, höchstens ganz ausgefedert unter dem Aufbau
      r.w.rotation.x = l(r.phiA, r.phi);
      if (r.vorn) r.w.rotation.y = -delta;   // positives rotation.y dreht nach links, delta positiv ist rechts
      const sat = r.w.userData.sattel; if (sat) sat.rotation.x = -r.w.rotation.x;   // Sattel steht still, lenkt aber mit
    }
  }
  // Boden unter jedem Rad (relativ zur Wurzel). Die Wurzel folgt dem mittleren Boden; was sie sich bewegt, wird vom Aufbau und den Rädern
  // abgezogen, damit der Aufbau dadurch nicht springt
  bodenAbtasten(sofort = false, h = H) {
    _f.set(Math.sin(this.psi), 0, Math.cos(this.psi)); _r.crossVectors(_f, UP);
    this.kollision.yAkt = this.pos.y;   // Höhe des Autos für Tunnel und Dächer (kit/collision.js)
    const gM = this.kollision.hoehe(this.pos.x, this.pos.z, this.pos.y);
    let summe = 0;
    for (const r of this.rad) {
      const wx = this.pos.x + _f.x * r.z - _r.x * r.x, wz = this.pos.z + _f.z * r.z - _r.z * r.x;   // x links positiv, _r zeigt nach rechts
      r.welt.set(wx, 0, wz);
      let g = this.kollision.hoehe(wx, wz, this.bodenNeu || sofort ? gM : this.pos.y + r.g);   // Hinweis relativ zur Wurzel (gilt auch nach einem Ortswechsel)
      if (!Number.isFinite(g) || Math.abs(g - gM) > 0.7) g = gM;   // Dach, Deck oder Tunnelrand unter einem einzelnen Rad: nicht ernst nehmen
      r.weltY = g; r.welt.y = g; summe += g;
    }
    const mittel = summe / this.rad.length;
    const yNeu = sofort ? mittel : this.pos.y + (mittel - this.pos.y) * (1 - Math.exp(-25 * h)), dy = yNeu - this.pos.y;
    this.pos.y = yNeu;
    if (sofort) { this.yRel = 0; this.vy = 0; for (const r of this.rad) { r.gRoh = r.weltY - yNeu; r.g = r.gRoh; } }
    else { this.yRel -= dy; for (const r of this.rad) { r.g -= dy; r.gRoh = r.weltY - yNeu; r.g += (r.gRoh - r.g) * (1 - Math.exp(-45 * h)); } }   // Reifen glätten Stufen etwas (Bordstein)
    this.bodenNeu = false;
  }
  schritt(h, achse, handbremse) {
    const K = this.K, m = this.masse, gas = Math.max(0, achse.y), bremse = Math.max(0, -achse.y);
    this.handbremse = !!handbremse; this.uhr = (this.uhr || 0) + h;
    // Pedale als kurze Rampe (Gas 0,1 s, Bremse 0,08 s, loslassen 0,06 s): kein Sprung der Kraft, trotzdem direkt
    this.gasR += clamp(gas - this.gasR, -h / (bremse > 0 ? 0.03 : 0.1), h / 0.1); this.bremsR += clamp(bremse - this.bremsR, -h / 0.06, h / 0.08);   // Gas loslassen 0,1 s (Motorbremse setzt weich ein)
    const v = this.vLong, av = Math.abs(v), gR = this.gasR, bR = this.bremsR;
    // W bremst ein rückwärts rollendes Auto und geht stetig in den Vortrieb über, S bremst ein vorwärts fahrendes und geht stetig ins
    // Rückwärtsfahren über (unter 2,5 m/s, bei Stillstand derselbe Wert wie vorher in Fassung 3)
    const vorBremse = gR * sm(-v, 0.3, 1.8), vorGas = gR - vorBremse;           // W: rollt rückwärts, also erst bremsen
    const rueckBremse = bR * sm(v, 0.3, 1.8), rueckGas = bR - rueckBremse;           // S: fährt vorwärts, also erst bremsen
    const bremsWunsch = Math.max(vorBremse, rueckBremse);
    this.rueckwaerts = v < -0.2 || (av < 0.3 && bremse > 0 && gas === 0);
    this.bremsLicht = bremsWunsch > 0.05;
    // ---------- Boden und Fahrwerk ----------
    this.bodenAbtasten(false, h);
    const zA = this.aufbau.position.z;
    let fSumme = 0, mNick = 0, mWank = 0;
    for (const r of this.rad) {
      const Y = this.yRel - this.nick * (r.z - zA) + this.neigung * r.x;           // Aufbau über dem Rad (Nase runter: nick positiv, links hoch: neigung positiv)
      const c = r.g - Y, dc = (c - r.c) / h; r.c = c;                               // Einfederung und ihre Geschwindigkeit
      let F = r.k * c + clamp(r.d * dc, -1.4 * r.F0, 1.4 * r.F0);
      if (c > 0.1) F += r.k * 9 * (c - 0.1);                                       // Anschlag
      r.kontakt = c > -0.15;
      r.Fs = F;
    }
    // Stabilisatoren je Achse: Unterschied der Einfederung links und rechts
    for (const [liste, kS] of [[this.rad.filter(r => r.vorn), this.stabi.vorn], [this.rad.filter(r => !r.vorn), this.stabi.hinten]]) {
      const L = liste.filter(r => r.x > 0), R = liste.filter(r => r.x <= 0); if (!L.length || !R.length) continue;
      const cl = L.reduce((a, r) => a + r.c, 0) / L.length, cr = R.reduce((a, r) => a + r.c, 0) / R.length, F = kS * (cl - cr);
      for (const r of L) r.Fs += F / L.length; for (const r of R) r.Fs -= F / R.length;
    }
    for (const r of this.rad) {
      const Fb = r.kontakt ? Math.max(0, r.F0 + r.Fs) : 0;
      fSumme += Fb - r.F0; mNick += -(Fb - r.F0) * (r.z - zA); mWank += (Fb - r.F0) * r.x;
      // Last am Reifen: Feder plus Rollzentrum (der geometrische Anteil der Querverlagerung wirkt sofort)
      r.Fz = r.kontakt ? Math.max(0, Fb + r.mU * G) : 0;
    }
    // geometrische Lastverlagerung (Rollzentrum, Antriebs und Bremsabstützung) sofort, der Rest über die Federn
    for (const r of this.rad) if (r.Fz > 0) r.Fz = Math.max(0, r.Fz + (r.x > 0 ? 1 : -1) * this.mS * this.aLat * K.rz / this.spur / (this.rad.length / 2));   // Rechtskurve: links (außen) mehr Last
    this.vy += (fSumme / this.mS) * h; this.yRel += this.vy * h;
    this.vNick += ((mNick - this.mS * this.aLong * this.hNick) / this.Ix) * h; this.nick += this.vNick * h;   // bremsen (aLong negativ) drückt die Nase runter
    this.vWank += ((mWank - this.mS * this.aLat * this.hWank) / this.Iw) * h; this.neigung += this.vWank * h;   // Rechtskurve (aLat positiv) drückt die linke Seite runter
    this.nick = clamp(this.nick, -0.12, 0.12); this.neigung = clamp(this.neigung, -0.14, 0.14);
    // ---------- Lenkung ----------
    // Eingabe als Rampe (schneller im Stand, ruhiger bei Tempo), größter Einschlag schrumpft mit dem Tempo auf den Winkel, der vorn den besten
    // Schräglauf ergibt (voller Einschlag ist Kurve am Limit, kein Schieben). Gegenlenkhilfe: die Vorderräder zeigen anteilig in die Richtung,
    // in die das Auto wirklich fährt (fängt das Heck ab, hält einen Drift)
    const rate = (Math.abs(achse.x) > Math.abs(this.lenkEingabe) && Math.sign(achse.x) === Math.sign(this.lenkEingabe || achse.x)) ? 1 / (0.09 + 0.2 * sm(av, 5, 38)) : 1 / (0.07 + 0.06 * sm(av, 5, 38));
    this.lenkEingabe += clamp(achse.x - this.lenkEingabe, -rate * h, rate * h);
    const vges = Math.hypot(this.vLong, this.vLat);   // Gesamttempo: beim Querrutschen ist vLong klein, die Hilfen müssen dann aber gerade wirken
    const lock = K.lenk * RAD, lockV = lock * (1 - 0.82 * sm(av, 3, 28));   // Grundabbildung: Einschlag nimmt mit dem Tempo ab
    const beta = av > 1 ? Math.atan2(this.vLat, Math.max(av, VEPS)) : 0;
    // Gegenlenkhilfe aus dem Schräglauf der Hinterachse (2 Grad Totzone, beim normalen Fahren greift sie nicht): rutscht das Heck, zeigen die
    // Vorderräder dorthin, wo das Auto wirklich hinfährt, wie beim Loslassen des Lenkrads im Drift
    const alphaH = av > 2 ? Math.atan2(this.vLat + this.omega * this.zH, Math.max(av, VEPS)) : 0;
    const hilfe = vges > 2 && v > -1 ? K.cs * Math.sign(alphaH) * Math.max(0, Math.abs(alphaH) - 2 * RAD) * sm(vges, 3, 10) : 0;
    let deltaZiel = this.lenkEingabe * lockV + hilfe;
    // Haftgrenze vorn (wie Forza Horizon "normal"): die Vorderräder stehen höchstens alphaP mal 1,1 gegen die Bewegung der Vorderachse.
    // Voller Einschlag auf der Tastatur heißt Kurve am Limit, nicht Schieben über die Vorderräder
    if (vges > 4 && v > 0) { const thetaV = Math.atan2(this.vLat + this.omega * this.zV, Math.max(av, VEPS)), g = K.alphaP * RAD * 1.1; deltaZiel += (clamp(deltaZiel, thetaV - g, thetaV + g) - deltaZiel) * sm(vges, 4, 9); }
    deltaZiel = clamp(deltaZiel, -lock, lock);
    this.delta += clamp(deltaZiel - this.delta, -7 * h, 7 * h);
    // ---------- Motor und Getriebe ----------
    // Drehzahl aus den angetriebenen Rädern, Automatik nach Gas und Drehzahl, Schalten in 0,25 s (SCHALT) mit weicher Übergabe (Moment nie unter 70 Prozent)
    const RA = this.rad.filter(r => K.hinten >= 0.5 ? !r.vorn : r.vorn);
    const omA = RA.reduce((a, r) => a + r.om, 0) / Math.max(1, RA.length);
    const rueck = rueckGas > 0.02 && v < 2.5;
    const ratioGang = i => rueck ? this.rueckRatio : this.ratio[i];
    this.seitSchalt += h;
    if (!rueck && this.schalt <= 0 && this.seitSchalt > 0.45) {
      const rpmJetzt = Math.abs(omA) * this.ratio[this.gang] * 60 / (2 * Math.PI);
      if (this.gang < this.ratio.length - 1 && rpmJetzt > K.rot * (0.6 + 0.35 * gR)) { this.gangAlt = this.gang; this.gang++; this.schalt = SCHALT; this.seitSchalt = 0; }
      else if (this.gang > 0 && rpmJetzt < K.rot * (0.28 + 0.3 * gR) && Math.abs(omA) * this.ratio[this.gang - 1] * 60 / (2 * Math.PI) < K.rot * 0.92) { this.gangAlt = this.gang; this.gang--; this.schalt = SCHALT; this.seitSchalt = 0; }
    }
    if (rueck) this.gang = 0;
    let uebergabe = 1, ratio = ratioGang(this.gang);
    if (this.schalt > 0) { this.schalt -= h; const p = 1 - Math.max(0, this.schalt) / SCHALT; uebergabe = 1 - 0.3 * Math.sin(Math.PI * p) ** 2; ratio = this.ratio[this.gangAlt] + (this.ratio[this.gang] - this.ratio[this.gangAlt]) * sm(p, 0.3, 0.7); }
    const rpmRad = Math.abs(omA) * ratio * 60 / (2 * Math.PI), gasMotor = rueck ? rueckGas : vorGas;
    const anfahren = this.gang === 0 || rueck ? K.leer + gasMotor * K.rot * 0.32 * (1 - sm(Math.abs(omA) * ratio * 60 / (2 * Math.PI), K.rot * 0.25, K.rot * 0.4)) : 0;   // Kupplung schleift beim Anfahren
    const rpmZiel = Math.max(K.leer, rpmRad, anfahren);
    this.rpm += (rpmZiel - this.rpm) * (1 - Math.exp(-28 * h));
    const x = this.rpm / K.rot, begrenzer = 1 - sm(x, 0.985, 1.02);
    let Tm = K.moment * momentKurve(x) * gasMotor * begrenzer * this.motor;
    const vRueckMax = K.vRueck / 3.6; if (rueck) Tm *= Math.max(0, 1 - (Math.max(0, -v) / vRueckMax) ** 3);
    if (gasMotor < 0.05 && av > 1 && !rueck) Tm -= K.moment * 0.12 * Math.min(1, x * 1.2);   // Motorbremse
    this.last = clamp(Tm / K.moment, -0.2, 1);
    const TRad = Tm * ratio * 0.9 * uebergabe * (rueck ? -1 : 1);
    this.drehzahl = clamp(this.rpm / K.rot, 0, 1.05);
    // ---------- Reifen ----------
    const kurveP = Math.tan(K.alphaP * RAD), drift = this.drift;
    let Fx = 0, Fy = 0, Mz = 0, rutschV = 0, rutschH = 0, spin = 0;
    // Traktionshilfe: Antrieb höchstens knapp unter dem, was der Reifen längs noch übertragen kann (so kann das Rad nicht durchgehen und es pendelt
    // nichts). Im absichtlichen Drift (Handbremse oder Schwimmwinkel mit Gas) darf es deutlich mehr: die Räder drehen durch, das Heck bleibt draußen
    const absAn = 1, tcs = handbremse || drift > 0.4 ? 1.7 : 0.98;
    const bremsMax = K.bremse * m * G;
    for (const r of this.rad) {
      const yRechts = -r.x, zR = r.z - this.zS;   // Hebel um den Schwerpunkt (liegt zS vor der Mitte des Modells)
      const vl = this.vLong - this.omega * yRechts, vq = this.vLat + this.omega * zR;   // Geschwindigkeit am Rad im Aufbau
      const d = r.vorn ? this.delta : 0, cd = Math.cos(d), sd = Math.sin(d);
      const u = vl * cd + vq * sd, w = -vl * sd + vq * cd;                              // im Rad: rollen und quer
      const nen = Math.max(Math.abs(u), VEPS);
      const mu = K.mu * this.griff * (r.vorn ? 1 : K.muHinten) * clamp(1 - 0.16 * (r.Fz / Math.max(1, r.F0 + r.mU * G) - 1), 0.74, 1.18);   // Last senkt den Reibwert je Newton (Lastabhängigkeit)
      const Fmax = mu * r.Fz, sy = (w / nen) / kurveP;
      // Antrieb und Bremse an diesem Rad
      const angetrieben = r.vorn ? 1 - K.hinten : K.hinten, nA = this.rad.filter(q => q.vorn === r.vorn).length;
      let Td = TRad * angetrieben / Math.max(1, nA);
      let Tb = bremsWunsch * bremsMax * (r.vorn ? K.vorderBremse : 1 - K.vorderBremse) / Math.max(1, nA) * r.r;
      const hand = handbremse && !r.vorn;
      // ABS und Traktionshilfe: höchstens so viel, wie der Reifen längs noch übertragen kann (Querschlupf zählt mit), die Handbremse blockiert
      const laengsFrei = Fmax * Math.sqrt(Math.max(0.06, 1 - Math.min(1, Math.abs(sy)) ** 2)) * r.r;
      if (absAn && !hand) Tb = Math.min(Tb, laengsFrei * 0.98);
      if (Td > 0) Td = Math.min(Td, laengsFrei * tcs + (Tb > 0 ? 0 : 0)); else if (Td < 0) Td = Math.max(Td, -laengsFrei * tcs);
      if (hand) Tb += m * G * r.r * 0.9;
      // Raddrehzahl implizit (stabil auch bei kleinem Tempo): Steigung der Längskraft über dem Raddrehen
      const kap = om => (om * r.r - u) / nen / K.kappaP;
      const fx0 = reifen(kap(r.om), sy, Fmax, _k, K.kappaP, kurveP)[0], eps = 0.02, fx1 = reifen(kap(r.om + eps), sy, Fmax, _k2, K.kappaP, kurveP)[0];
      const D = Math.max(0, (fx1 - fx0) / eps) * r.r;
      const rollW = 0.012 * r.Fz * r.r * Math.sign(r.om) * Math.min(1, Math.abs(r.om) * r.r / 0.5);
      const I = K.traeg * (r.r / 0.33) ** 2, nenner = I + h * D;
      let om = r.om + h * (Td - fx0 * r.r - rollW) / nenner;
      const bImpuls = h * Tb / nenner;
      if (Math.abs(om) <= bImpuls) om = 0; else om -= Math.sign(om) * bImpuls;   // Bremse dreht das Rad nie rückwärts, sie hält es höchstens fest
      r.om = om;
      reifen(kap(om), sy, Fmax, _k, K.kappaP, kurveP); const fxR = _k[0], fwR = _k[1];
      r.sx = kap(om); r.sy = sy;
      // wie stark der Reifen rutscht (für Spuren, Qualm, Ton): über dem Höchstwert des normierten Schlupfs
      const sGes = Math.hypot(r.sx, r.sy); r.rutscht = r.Fz > 0 ? sm(sGes, 1.3, 3.2) * Math.min(1, Math.hypot(u, w) / 4) : 0;
      if (r.vorn) rutschV = Math.max(rutschV, r.rutscht); else rutschH = Math.max(rutschH, r.rutscht);
      if (Math.abs(r.sx) > 2 && Td !== 0) spin = Math.max(spin, sm(Math.abs(r.sx), 2, 5));
      const fbx = fxR * cd - fwR * sd, fby = fxR * sd + fwR * cd;                      // zurück in den Aufbau
      Fx += fbx; Fy += fby; Mz += zR * fby - yRechts * fbx;
      r.phi += om * h;
    }
    // Luft, Hang
    const luft = 0.5 * 1.2 * K.cwA * v * Math.abs(v);
    const vorneY = this.rad.filter(r => r.vorn).reduce((a, r) => a + r.weltY, 0) / Math.max(1, this.rad.filter(r => r.vorn).length), hintenY = this.rad.filter(r => !r.vorn).reduce((a, r) => a + r.weltY, 0) / Math.max(1, this.rad.filter(r => !r.vorn).length);
    const hang = clamp((vorneY - hintenY) / this.radstand, -0.4, 0.4);
    Fx -= luft + m * G * hang * 0.9;
    // ---------- Bewegung (Körperkoordinaten, omega positiv dreht nach rechts) ----------
    const ax = Fx / m, ay = Fy / m;
    let dOm = Mz / this.Iz;
    // Stabilität: dreht sich das Heck über 28 Grad weg (ohne Handbremse), fängt das Auto es selbst ab; bei Absicht (Vollgas, Gegenlenken) erst ab 45 Grad
    const absicht = gR > 0.6 && this.drift > 0.3;
    // Mit Handbremse ab 42 Grad und kräftiger: so dreht sich das Auto im Handbremsdrift auch bei vollem Einschlag nicht weg (rund 55 Grad statt 77)
    const betaGrenze = (handbremse ? 42 : absicht ? 45 : 28) * RAD;
    if (vges > 4 && Math.abs(beta) > betaGrenze) dOm += (handbremse ? 20 : 7) * (Math.abs(beta) - betaGrenze) * Math.sign(beta) * sm(vges, 4, 9);
    this.vLong += (ax + this.vLat * this.omega) * h;
    this.vLat += (ay - this.vLong * this.omega) * h;
    this.omega += dOm * h;
    // Unter 4,5 m/s gleitet das Modell in die reine Geometrie über (Rangieren ohne Zittern, Wendekreis wie in echt)
    const kin = 1 - sm(Math.hypot(this.vLong, this.vLat), 1.2, 4.5);   // nach dem Gesamttempo: beim Querrutschen ist vLong klein, das Auto aber schnell
    if (kin > 0) {
      const omKin = this.vLong * Math.tan(this.delta) / this.radstand, rueckAchse = this.zS - this.rad.filter(r => !r.vorn).reduce((a, r) => a + r.z, 0) / Math.max(1, this.rad.filter(r => !r.vorn).length);
      const kk = 1 - Math.exp(-22 * kin * h);
      this.omega += (omKin - this.omega) * kk; this.vLat += (this.omega * rueckAchse - this.vLat) * kk;
    }
    // Stillstand: steht das Auto ohne Pedal, bleibt es stehen (Feststellbremse, auch am Hang)
    if (gas === 0 && bremse === 0 && Math.abs(this.vLong) < 0.25 && Math.abs(this.vLat) < 0.25) { this.vLong *= 0.5; this.vLat *= 0.5; this.omega *= 0.5; if (Math.abs(this.vLong) < 0.03) { this.vLong = 0; this.vLat = 0; this.omega = 0; for (const r of this.rad) r.om = 0; } }
    if (handbremse && Math.abs(this.vLong) < 0.3 && gas === 0) { this.vLong = 0; this.omega = 0; this.vLat *= 0.5; }
    this.aLong = ax; this.aLat = ay;
    this.aLongG = this.aLongG + (ax - this.aLongG) * (1 - Math.exp(-12 * h)); this.aLatG = this.aLatG + (ay - this.aLatG) * (1 - Math.exp(-12 * h));
    // Drift: Handbremse lädt ihn auf, mit Gas und Einschlag hält er, ohne klingt er ab (nur für Anzeige, Hilfen und Effekte)
    const betaJetzt = av > 1 ? Math.atan2(this.vLat, av) : 0;
    const driftZiel = handbremse && av > 4 ? 1 : (Math.abs(betaJetzt) > 10 * RAD && gR > 0.5 && av > 8 ? 0.7 : 0);
    this.drift += (driftZiel - this.drift) * (1 - Math.exp(-(driftZiel > this.drift ? 7 : 1.8) * h));
    this.schlupfVorn = rutschV; this.schlupfHinten = rutschH; this.spinSchlupf = spin > 0.3 ? 1 : 0;
    this.driftet = this.drift > 0.35 || Math.abs(betaJetzt) > 9 * RAD;
    this.schlupfTon = clamp(Math.max(rutschV, rutschH) * 1.1, 0, 1);
    // ---------- Weg in der Welt und Kollision ----------
    const psiAlt = this.psi;
    this.psi -= this.omega * h;                                                   // delta positiv dreht nach rechts, psi nimmt ab
    _f.set(Math.sin(this.psi), 0, Math.cos(this.psi)); _r.crossVectors(_f, UP);
    // Kollision robust (seit 29.10.2026): dreht sich eine Ecke in die Wand, wird die Drehung zurückgenommen; steckt das Auto schon, wird es zur
    // nächsten freien Stelle geschoben, sonst fährt es hinaus
    this.geist = false;
    if (!this.eckenFrei(this.pos.x, this.pos.z)) {
      this.psi = psiAlt; _f.set(Math.sin(this.psi), 0, Math.cos(this.psi)); _r.crossVectors(_f, UP);
      if (this.eckenFrei(this.pos.x, this.pos.z)) this.omega *= 0.2; else if (!this.befreien()) this.geist = true;
    }
    const vMitte = this.vLat - this.omega * this.zS;   // die Mitte liegt zS hinter dem Schwerpunkt
    const dx = (_f.x * this.vLong + _r.x * vMitte) * h, dz = (_f.z * this.vLong + _r.z * vMitte) * h;
    this.maxSchritt = Math.max(this.maxSchritt, Math.hypot(dx, dz));
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (this.geist || this.eckenFrei(nx, nz)) { this.pos.x = nx; this.pos.z = nz; this.kratzt = false; }
    else this.wandStoss(nx, nz, dx, dz);
    this.dir.copy(_f);
    this.fremdeStoesse(h);
  }
  // Stoß gegen eine Wand: Normale aus dem Raster an der Ecke, die trifft, Stoß mit Rückprall und Reibung an der Kontaktstelle (daraus Drehung)
  wandStoss(nx, nz, dx, dz) {
    const hl = this.L / 2, hb = this.B / 2; let cx = 0, cz = 0, n = 0;
    for (const [a, b] of ECKEN) { const ex = nx + _f.x * hl * a + _r.x * hb * b, ez = nz + _f.z * hl * a + _r.z * hb * b; if (!this.kollision.frei(ex, ez)) { cx += ex; cz += ez; n++; } }
    if (!n) { cx = nx + _f.x * hl * Math.sign(this.vLong || 1); cz = nz + _f.z * hl * Math.sign(this.vLong || 1); n = 1; } else { cx /= n; cz /= n; }
    // Normale: Richtungen, in denen um die Kontaktstelle frei ist
    let mx = 0, mz = 0; for (const [ux, uz] of RICHT) if (this.kollision.frei(cx + ux * 0.45, cz + uz * 0.45)) { mx += ux; mz += uz; }
    let ln = Math.hypot(mx, mz); if (ln < 1e-3) { mx = -dx; mz = -dz; ln = Math.hypot(mx, mz) || 1; } mx /= ln; mz /= ln;
    // Geschwindigkeit in der Welt und an der Kontaktstelle (Drehung um die Hochachse: psi nimmt mit omega ab)
    let vx = _f.x * this.vLong + _r.x * this.vLat, vz = _f.z * this.vLong + _r.z * this.vLat;
    const rx = cx - this.pos.x, rz = cz - this.pos.z, Om = -this.omega;
    const vcx = vx + Om * rz, vcz = vz - Om * rx, vn = vcx * mx + vcz * mz;
    const wucht = Math.hypot(this.vLong, this.vLat);
    if (vn < 0) {
      const e = 0.28 * sm(-vn, 1, 6), rn = rz * mx - rx * mz, m = this.masse, I = this.Iz;
      const j = -(1 + e) * vn / (1 / m + rn * rn / I);
      vx += j * mx / m; vz += j * mz / m; let Om2 = Om + rn * j / I;
      // Reibung an der Wand (streifen bremst und dreht)
      const tx = vcx - vn * mx, tz = vcz - vn * mz, tl = Math.hypot(tx, tz);
      if (tl > 1e-3) { const ux = tx / tl, uz = tz / tl, rt = rz * ux - rx * uz, jt = -Math.min(0.35 * j, tl / (1 / m + rt * rt / I)); vx += jt * ux / m; vz += jt * uz / m; Om2 += rt * jt / I; }
      this.omega = clamp(-Om2, -4, 4);
      this.vLong = vx * _f.x + vz * _f.z; this.vLat = vx * _r.x + vz * _r.z;
      // Stoß und Beule höchstens alle 0,3 s (beim Entlangschrammen wechseln Kontakt und frei, vorher zählte jeder Wechsel als neuer Stoß), ein neuer
      // stärkerer Stoß zählt sofort
      const stossV = -vn, jetzt = this.uhr || 0, frei = jetzt - (this.tWand ?? -9) > 0.3;
      if (stossV > 1.5 && (frei || stossV > (this.vWand || 0) + 2)) { const st = Math.min(0.7, stossV / 12); this.stoesse.push(st); this.wandTreffer(nx, nz, Math.min(1, stossV / 22)); this.tWand = jetzt; this.vWand = stossV; }
      else if (wucht > 6 && !this.kratzt && frei) { const st = Math.min(0.25, wucht / 50); this.stoesse.push(st); this.wandTreffer(nx, nz, st); this.tWand = jetzt; this.vWand = 0; }
      this.kratzt = true;
      for (const r of this.rad) r.om = (this.vLong * Math.cos(r.vorn ? this.delta : 0)) / r.r * 0.6 + r.om * 0.4;
    }
    // Lage: entlang der Wand gleiten, sonst stehen bleiben (nie in die Wand)
    const dn = dx * mx + dz * mz, gx = this.pos.x + dx - Math.min(0, dn) * mx, gz = this.pos.z + dz - Math.min(0, dn) * mz;
    if (this.eckenFrei(gx, gz)) { this.pos.x = gx; this.pos.z = gz; }
    else { const px = this.pos.x + mx * 0.05, pz = this.pos.z + mz * 0.05; if (this.eckenFrei(px, pz)) { this.pos.x = px; this.pos.z = pz; } }
  }
  // KI Autos, geparkte Autos, gelandete Flieger und Menschen
  fremdeStoesse(h) {
    // KI Autos: gedrehte Rechtecke, auseinanderschieben; Stoß an der Kontaktstelle wie gegen eine fahrende Wand (dreht das Auto, wie bei GTA)
    if (this.verkehr) for (const o of this.verkehr.alle) {
      if (o.pos.distanceToSquared(this.pos) > 400) continue;
      if (ueberlappt(this, o)) {
        _n.subVectors(this.pos, o.pos); _n.y = 0; if (_n.lengthSq() < 1e-6) _n.copy(_r); _n.normalize();
        const px = this.pos.x + _n.x * 0.25, pz = this.pos.z + _n.z * 0.25; if (this.eckenFrei(px, pz)) { this.pos.x = px; this.pos.z = pz; }
        const ovx = (o.dir?.x || 0) * (o.v || 0), ovz = (o.dir?.z || 0) * (o.v || 0);
        this.fremdStoss(o.pos.x + _n.x * (o.B || 1.8) * 0.5, o.pos.z + _n.z * (o.B || 1.8) * 0.5, _n.x, _n.z, ovx, ovz, this.weich ? 0.15 : 0.6);
        if (Math.abs(this.vLong) > 1.5 || Math.abs(this.vLat) > 1.5) { const st = Math.min(0.5, Math.abs(this.vLong - (o.v || 0)) / 14); this.stoesse.push(st); this.kiStoss = (this.kiStoss || 0) + st; const rx = o.pos.x - this.pos.x, rz = o.pos.z - this.pos.z; this.treffer.push({ l: rx * _f.x + rz * _f.z, q: rx * _r.x + rz * _r.z, st: st * 1.2 }); }
        if (!this.weich) { this.vLong *= 0.82; this.vLat *= 0.82; }
      }
    }
    // Geparkte Autos: hartes Hindernis, das sich wegschieben lässt (rollt aus, dreht sich leicht)
    if (this.verkehr?.geparkt) { for (const o of this.verkehr.geparkt) {
      if (o.pos.distanceToSquared(this.pos) > 256) continue;
      if (ueberlappt(this, o)) {
        _n.subVectors(this.pos, o.pos); _n.y = 0; if (_n.lengthSq() < 1e-6) _n.copy(_r); _n.normalize();
        const wucht = Math.hypot(this.vLong, this.vLat), px = this.pos.x + _n.x * 0.1, pz = this.pos.z + _n.z * 0.1; if (this.eckenFrei(px, pz)) { this.pos.x = px; this.pos.z = pz; }
        o.vx = (o.vx || 0) - _n.x * Math.min(wucht, 16) * 0.05; o.vz = (o.vz || 0) - _n.z * Math.min(wucht, 16) * 0.05; o.dreh = THREE.MathUtils.clamp((o.dreh || 0) + (o.dir.x * _n.z - o.dir.z * _n.x) * Math.min(wucht, 14) * 0.012, -1.2, 1.2);
        if (wucht > 1.5 && this.uhr - (o.tStoss ?? -9) > 0.5) { o.tStoss = this.uhr; const st = Math.min(0.6, wucht / 15), rx = o.pos.x - this.pos.x, rz = o.pos.z - this.pos.z; this.stoesse.push(st); this.kiStoss = (this.kiStoss || 0) + st * 0.3; this.treffer.push({ l: rx * _f.x + rz * _f.z, q: rx * _r.x + rz * _r.z, st }); this.fremdStoss(o.pos.x + _n.x * 0.9, o.pos.z + _n.z * 0.9, _n.x, _n.z, 0, 0, 0.35); }
        const w = this.weich ? 0.985 : 0.965; this.vLong *= w; this.vLat *= w;
      }
    } }
    // Gelandete Flieger: stehen fest wie eine Wand
    if (this.verkehr?.flieger) for (const o of this.verkehr.flieger) {
      if (o.pos.distanceToSquared(this.pos) > 400 || !ueberlappt(this, o)) continue;
      _n.subVectors(this.pos, o.pos); _n.y = 0; const l = _n.x * o.dir.x + _n.z * o.dir.z; _n.addScaledVector(o.dir, -l); if (_n.lengthSq() < 1e-6) _n.copy(_r); _n.normalize();
      const wucht = Math.hypot(this.vLong, this.vLat), px = this.pos.x + _n.x * 0.14, pz = this.pos.z + _n.z * 0.14; if (this.eckenFrei(px, pz)) { this.pos.x = px; this.pos.z = pz; }
      if (wucht > 1.5) { const st = Math.min(0.7, wucht / 12); this.stoesse.push(st); this.wandTreffer(_n.x, _n.z, Math.min(1, wucht / 22)); }
      this.vLong *= 0.8; this.vLat *= 0.8; this.omega *= 0.7;
    }
    // Menschen: wer im Rechteck steht, wird zur Seite geschoben
    if (this.menge) for (const p of this.menge.alle) {
      const rx = p.pos.x - this.pos.x, rz = p.pos.z - this.pos.z;
      const l = rx * _f.x + rz * _f.z, q = rx * _r.x + rz * _r.z;
      if (Math.abs(l) < this.L / 2 + 0.4 && Math.abs(q) < this.B / 2 + 0.4) { const s = Math.sign(q) || 1, weg = (this.B / 2 + 0.45 - Math.abs(q)), av = Math.abs(this.vLong); p.pos.x += _r.x * s * weg; p.pos.z += _r.z * s * weg; p.push.x += _r.x * s * 0.4; p.push.z += _r.z * s * 0.4; if (av > 4 && !this.keinSturz && p.flucht?.art !== 'sturz') { const sg = Math.sign(this.vLong) || 1; this.menge.umgestossen?.(p, _f.x * sg, _f.z * sg, _r.x * s, _r.z * s, av); } }
    }
  }
  // Stoß an der Stelle (cx, cz) mit Normale (mx, mz) gegen etwas, das sich mit (ovx, ovz) bewegt; e Rückprall. Das andere zählt als sehr schwer
  fremdStoss(cx, cz, mx, mz, ovx, ovz, staerke) {
    let vx = _f.x * this.vLong + _r.x * this.vLat - ovx, vz = _f.z * this.vLong + _r.z * this.vLat - ovz;
    const rx = cx - this.pos.x, rz = cz - this.pos.z, Om = -this.omega, vcx = vx + Om * rz, vcz = vz - Om * rx, vn = vcx * mx + vcz * mz;
    if (vn >= 0) return;
    const m = this.masse, I = this.Iz, rn = rz * mx - rx * mz, j = -(1 + 0.2) * vn / (1 / m + rn * rn / I) * staerke;
    vx += j * mx / m + ovx; vz += j * mz / m + ovz; this.omega = clamp(-(Om + rn * j / I), -4, 4);
    this.vLong = vx * _f.x + vz * _f.z; this.vLat = vx * _r.x + vz * _r.z;
  }
  // nächste freie Stelle im Umkreis von 8 m (Ringe, je 16 Richtungen); die gezeigte Lage springt mit (keine Schliere)
  befreien() {
    for (const r of [0.25, 0.5, 0.9, 1.4, 2, 3, 4.5, 6, 8]) for (let k = 0; k < 16; k++) {
      const w = k / 16 * Math.PI * 2, x = this.pos.x + Math.cos(w) * r, z = this.pos.z + Math.sin(w) * r;
      if (this.eckenFrei(x, z)) { this.alt.pos.x += x - this.pos.x; this.alt.pos.z += z - this.pos.z; this.pos.x = x; this.pos.z = z; return true; }
    }
    return false;
  }
  // Welche Ecke steht beim Schritt nach (nx, nz) in der Wand? Mitte, wenn beide vorderen oder beide hinteren Ecken anstoßen
  wandTreffer(nx, nz, st) {
    const hl = this.L / 2, hb = this.B / 2; let sl = 0, sb = 0, n = 0;
    for (const [a, b] of ECKEN) if (!this.kollision.frei(nx + _f.x * hl * a + _r.x * hb * b, nz + _f.z * hl * a + _r.z * hb * b)) { sl += a; sb += b; n++; }
    if (!n) { sl = Math.sign(this.vLong) || 1; n = 1; }
    this.treffer.push({ l: sl / n * hl, q: sb / n * hb, st });
  }
  eckenFrei(x, z) {
    const hl = this.L / 2, hb = this.B / 2;
    for (const [sl, sb] of ECKEN) if (!this.kollision.frei(x + _f.x * hl * sl + _r.x * hb * sb, z + _f.z * hl * sl + _r.z * hb * sb)) return false;
    return true;
  }
  // Reifen, die rutschen, mit Lage in der Welt (für Bremsspuren, Qualm und Ton in kit/effekte.js)
  rutschende(out = []) { out.length = 0; for (const r of this.rad) if (r.rutscht > 0.05 && r.kontakt) out.push(r); return out; }
  // Leuchtmaske der eigenen Pkw: Bremslicht, Rückfahrlicht, nachts Scheinwerfer und Rücklicht (nacht setzt dashboard/app.js). Die Materialien
  // werden je Bild gesucht, weil Lackieren (lackSetzen) und Schaden sie nach dem Bau noch einmal kopieren
  lichter() {
    const R = this.bremsLicht ? 1.6 : this.nacht ? 0.65 : 0.08, Gs = this.nacht ? 2.2 : 0.1, B = this.rueckwaerts && this.vLong < -0.1 ? 1.8 : 0;   // höher wird Rot durch die Tonwertkurve orange
    this.obj.traverse(o => { const L = o.isMesh && !Array.isArray(o.material) ? o.material.userData?.licht : null; if (L?.R) { L.R.value = R; L.G.value = Gs; L.B.value = B; } });
  }
  get v() { return this.vLong; }
  entfernen() { this.obj.parent?.remove(this.obj); }
}
