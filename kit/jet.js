// Düsenjet über der ganzen Erde (09_GRAFIK.md Abschnitt 7, Naders Wunsch Nr. 33 vom 29.10.2026): "ein Düsenjet fliegen können mit der
// perfekten Steuerung über die ganze Erde ... hochfliegen, wie ich möchte, und runterfliegen, wie ich möchte ... mit 4000 km/h mit dem extra Schub."
// Lage, Tempo und Drehung in ECEF Szene (Float64, wie kit/erde.js), Körperachsen x links, y oben, z vorn (rechtshändig, wie ein three.js
// Modell, das nach +z schaut; x rechts mit z vorn wäre linkshändig und gibt keine gültige Drehung). Flugmodell wie ein gutes Actionspiel
// mit echter Physik im Kern: Schub, Widerstand (mit Schallmauer), Auftrieb aus dem Anstellwinkel (die Bahn folgt der Nase), Schwerkraft zur
// Erdmitte, dünne Luft in der Höhe (weniger Auftrieb und Widerstand, im All bleibt ein Raumschub), Strömungsabriss bei Langsamflug.
// Steuerung als Drehraten (Fly by Wire) mit Grenzen für Lastvielfaches und Anstellwinkel; Maus Zielen lenkt die Flugbahn wie ein Instruktor.
import * as THREE from 'three';
import { geoZuSzene, szeneZuGeo, enu } from './erde.js';

const G0 = 9.80665, RE = 6371000, D2R = Math.PI / 180;
const klemm = THREE.MathUtils.clamp, glatt = (a, b, x) => { const t = klemm((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- Atmosphäre (Normatmosphäre, darüber exponentiell) ----------
export function luftDichte(h) {   // Verhältnis zur Dichte am Meer
  if (h < 11000) return Math.pow(Math.max(0, 1 - 2.25577e-5 * Math.max(-500, h)), 4.2559);
  if (h < 50000) return 0.2971 * Math.exp(-(h - 11000) / 6341.6);
  if (h < 120000) return 0.2971 * Math.exp(-39000 / 6341.6) * Math.exp(-(h - 50000) / 7500);
  return 0;
}
export function schallTempo(h) {
  const T = h < 11000 ? 288.15 - 0.0065 * h : h < 20000 ? 216.65 : Math.min(270.65, 216.65 + 0.001 * (h - 20000) + (h > 32000 ? 0.0018 * (h - 32000) : 0));
  return 20.046 * Math.sqrt(T);
}

// ---------- Werte des Flugmodells (je Kilogramm, Meter und Sekunden) ----------
// Abgestimmt mit tools/jet_test.mjs: normal bis rund 1.300 km/h am Boden, mit Nachbrenner von 1.300 auf 4.000 km/h in rund 14 s,
// höchstens rund 4.150 km/h am Boden; in dünner Luft schneller, im All nur noch der Raumschub (Nachbrenner 1,4 g).
export const JET = {
  aTrocken: 28,          // Schub bei Vollgas ohne Nachbrenner am Meer (m/s²)
  aNach: 92,             // zusätzlicher Schub des Nachbrenners am Meer
  kStau: 1.15e-4,        // Stauschub des Nachbrenners (wächst mit Dichte mal Tempo²: je schneller, desto mehr)
  cw: 1.85e-4,           // Widerstand Rumpf (mal Dichte mal Tempo²)
  cwBremse: 3.2e-4,      // Luftbremse
  kInduziert: 70,        // induzierter Widerstand (Kurven kosten Tempo)
  kAuftrieb: 0.00264,    // Auftrieb: bei 220 km/h und vollem Anstellwinkel trägt er 1 g
  kSeite: 0.0008,        // Seitenkraft aus dem Schiebewinkel
  alphaMax: 0.42,        // Anstellwinkel des Abrisses (24 Grad)
  raumTrocken: 3, raumNach: 14,   // Raumschub (m/s²): im luftleeren Raum bleibt ein Rest, damit man frei steigen und lenken kann
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Jet {
  constructor() {
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();   // w: Drehraten (x Nicken hoch, y Gieren rechts, z Rollen rechts), positiv im Sinn des Piloten
    this.gas = 0.75; this.nach = 0; this.bremse = 0;   // Gashebel, Nachbrenner (0 bis 1, weich), Luftbremse
    this.geo = { lat: 0, lon: 0, h: 0 }; this.boden = 0; this.sigma = 1; this.mach = 0; this.alpha = 0; this.beta = 0; this.last = 1; this.schub = 0;
    this.kmh = 0; this.steigen = 0; this.kurs = 0; this.neigung = 0; this.quer = 0; this.abriss = false; this.absturz = null;
    this.zielRichtung = null;   // Maus Zielen: Richtung in ECEF (Einheitsvektor) oder null
    this.cmd = new THREE.Vector3();
  }
  // Start: an lat, lon in Höhe h (über dem Meer), Kurs in Grad (0 Nord, 90 Ost), Tempo in km/h, waagrecht
  setze(lat, lon, h, kurs, kmh, nicken = 0) {
    geoZuSzene(lat, lon, h, this.p);
    const e = enu(lat, lon), k = kurs * D2R, n = nicken * D2R;
    const vor = new THREE.Vector3().addScaledVector(e.nord, Math.cos(k)).addScaledVector(e.ost, Math.sin(k));
    const fwd = vor.clone().multiplyScalar(Math.cos(n)).addScaledVector(e.oben, Math.sin(n)).normalize();
    const links = new THREE.Vector3().crossVectors(e.oben, fwd).normalize(), oben = new THREE.Vector3().crossVectors(fwd, links);
    this.q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(links, oben, fwd));
    this.v.copy(fwd).multiplyScalar(kmh / 3.6); this.w.set(0, 0, 0); this.absturz = null; this.nach = 0; this.bremse = 0;
    this.aktualisiere();
  }
  achse(a, out) { return out.copy(a).applyQuaternion(this.q); }
  // abgeleitete Werte für Anzeige, Kamera und Bau (je Bild)
  aktualisiere() {
    const g = szeneZuGeo(this.p); this.geo = g;
    const e = enu(g.lat, g.lon), fwd = this.achse(Z, _a), V = this.v.length();
    this.kmh = V * 3.6; this.steigen = this.v.dot(e.oben); this.mach = V / schallTempo(g.h); this.sigma = luftDichte(g.h);
    this.kurs = (Math.atan2(fwd.dot(e.ost), fwd.dot(e.nord)) / D2R + 360) % 360; this.neigung = Math.asin(klemm(fwd.dot(e.oben), -1, 1)) / D2R;
    const ob = _w.copy(e.oben).applyQuaternion(_qi.copy(this.q).invert());   // Oben der Erde im Körper
    this.quer = Math.atan2(ob.x, ob.y) / D2R;   // Querlage, rechts positiv (rechter Flügel unten: das Oben der Erde liegt links)
    this.e = e;
  }
  // ein Schritt der Physik (dt klein, 1/120 s); eing: Steuerbefehle -1..1 (nase hoch, rollen rechts, gieren rechts), nach, bremse
  schritt(dt, eing) {
    if (this.absturz) return;
    const J = JET, V = Math.max(1e-3, this.v.length()), h = this.geo.h, sig = luftDichte(h), a = schallTempo(h), M = V / a;
    const qi = _qi.copy(this.q).invert(), vb = _v.copy(this.v).applyQuaternion(qi);   // Tempo im Körper
    const alpha = Math.atan2(-vb.y, vb.z), beta = Math.atan2(-vb.x, Math.hypot(vb.y, vb.z));   // beta positiv: Bahn rechts der Nase
    this.alpha = alpha; this.beta = beta;
    const staudruck = sig * V * V, autoritaet = klemm(staudruck / (150 * 150), 0, 1);   // Ruderwirkung: voll ab 540 km/h am Boden
    const gGrenze = 9 + 9 * glatt(400, 1100, V);   // Lastvielfaches (im Hyperschall großzügiger, sonst würde der Jet bei 4.000 km/h wie ein Zug fahren)
    // ---- Drehung: Befehle sind Drehraten, Grenzen nach Auftrieb, Abriss und Autorität ----
    const auftriebMax = Math.min(J.kAuftrieb * staudruck, gGrenze * G0);
    const nickMax = THREE.MathUtils.lerp(0.6, klemm(1.2 * auftriebMax / Math.max(V, 40), 0.3, 1.4), autoritaet);
    const rollMax = THREE.MathUtils.lerp(1.2, 3.4, autoritaet), gierMax = 0.35;
    let nick = eing.nase * nickMax, roll = eing.rollen * rollMax, gier = eing.gieren * gierMax;
    // Anstellwinkel begrenzen (kein Trudeln beim harten Ziehen), nach dem Abriss senkt sich die Nase
    if (nick > 0) nick *= klemm((J.alphaMax - alpha) / 0.12, 0, 1);
    if (nick < 0) nick *= klemm((alpha + J.alphaMax * 0.5) / 0.1, 0, 1);
    if (alpha > J.alphaMax) nick -= (alpha - J.alphaMax) * 2.5 * Math.max(0.3, autoritaet);
    gier += beta * 2.2 * autoritaet;   // Windfahne: die Nase dreht in den Fahrtwind
    this.abriss = alpha > J.alphaMax * 0.92 && sig > 0.05;
    if (this.abriss) roll += Math.sin(performance.now() * 0.011) * 0.25;   // Rütteln im Abriss
    const k = THREE.MathUtils.lerp(3, 9, autoritaet), f = 1 - Math.exp(-k * dt);
    this.w.x += (nick - this.w.x) * f; this.w.y += (gier - this.w.y) * f; this.w.z += (roll - this.w.z) * f;
    // Lage drehen (x links): Nicken hoch ist Drehung um -x, Gieren rechts um -y, Rollen rechts um +z
    const om = _w.set(-this.w.x, -this.w.y, this.w.z), ang = om.length() * dt;
    if (ang > 1e-9) { _q.setFromAxisAngle(om.normalize(), ang); this.q.multiply(_q).normalize(); }
    // ---- Kräfte (je Kilogramm) ----
    const fwd = this.achse(Z, new THREE.Vector3()), oben = this.achse(Y, new THREE.Vector3()), links = this.achse(X, new THREE.Vector3());
    const vh = this.v.clone().divideScalar(V);
    // Auftrieb aus dem Anstellwinkel, quer zur Bahn in Richtung Körper oben
    let cl = Math.abs(alpha) <= J.alphaMax ? alpha / J.alphaMax : Math.sign(alpha) * (1 - 0.5 * glatt(J.alphaMax, 1.2, Math.abs(alpha)));
    let aL = J.kAuftrieb * staudruck * cl;
    aL = klemm(aL, -0.45 * gGrenze * G0, gGrenze * G0);
    const lDir = oben.clone().addScaledVector(vh, -oben.dot(vh)); if (lDir.lengthSq() > 1e-9) lDir.normalize();
    const sDir = links.clone().addScaledVector(vh, -links.dot(vh)); if (sDir.lengthSq() > 1e-9) sDir.normalize();
    const aS = J.kSeite * staudruck * beta;   // Bahn rechts der Nase: Kraft nach links
    // Schub: Trocken und Nachbrenner mit Dichte; Stauschub mit Dichte mal Tempo²; im All ein Rest (Raumschub)
    this.nach += ((eing.nach ? 1 : 0) - this.nach) * (1 - Math.exp(-(eing.nach ? 5 : 3) * dt));
    this.bremse += ((eing.bremse ? 1 : 0) - this.bremse) * (1 - Math.exp(-6 * dt));
    const lap = Math.pow(sig, 0.75);
    let T = J.aTrocken * this.gas * lap + this.nach * (J.aNach * lap + J.kStau * sig * V * V);
    T = Math.max(T, J.raumTrocken * this.gas + J.raumNach * this.nach);
    this.schub = T;
    // Widerstand: Rumpf mit Schallmauer, Luftbremse, induziert
    const welle = 0.2 * glatt(0.85, 1.05, M) * (1 - 0.5 * glatt(1.2, 3.0, M));
    const D = staudruck * (J.cw * (1 + welle) + J.cwBremse * this.bremse) + J.kInduziert * aL * aL / Math.max(staudruck, 50);
    // Schwerkraft zur Erdmitte, nimmt mit der Höhe ab
    const r = this.p.length(), g = G0 * (RE / r) * (RE / r);
    const acc = new THREE.Vector3().addScaledVector(fwd, T).addScaledVector(vh, -D).addScaledVector(lDir, aL).addScaledVector(sDir, aS).addScaledVector(this.p, -g / r);
    this.last = (aL + G0 * 0) / G0;   // Lastvielfaches aus dem Auftrieb (für Anzeige und Effekte)
    this.lastSchnitt = acc.clone().addScaledVector(this.p, g / r).dot(oben) / G0;
    this.v.addScaledVector(acc, dt); this.p.addScaledVector(this.v, dt);
  }
  // Maus Zielen wie ein Instruktor: Befehle so, dass die Flugbahn zum Ziel dreht (in dünner Luft die Nase), mit Querlage in Kurven,
  // kleine Abweichungen ohne Querlage (Flügel waagrecht), leicht unter der Bahn drücken statt auf den Rücken zu rollen
  instruktor(ziel, out) {
    const V = this.v.length(), sig = luftDichte(this.geo.h), aut = klemm(sig * V * V / (150 * 150), 0, 1);
    const fwd = this.achse(Z, new THREE.Vector3()), vh = V > 1 ? this.v.clone().divideScalar(V) : fwd.clone();
    const bahn = fwd.clone().lerp(vh, aut * 0.85).normalize();
    const cosA = klemm(bahn.dot(ziel), -1, 1), ang = Math.acos(cosA);
    const qi = _qi.copy(this.q).invert();
    const quer = ziel.clone().addScaledVector(bahn, -cosA), qb = quer.clone().applyQuaternion(qi);   // Abweichung quer zur Bahn im Körper
    const achse = new THREE.Vector3().crossVectors(bahn, ziel).applyQuaternion(qi);   // Drehachse Bahn -> Ziel im Körper
    const ob = new THREE.Vector3().copy(this.e?.oben || this.p).normalize().applyQuaternion(qi), quer0 = Math.atan2(ob.x, ob.y);
    let rollZiel = Math.atan2(-qb.x, qb.y);   // x ist links: rechts der Bahn heißt -x
    if (qb.y < 0 && ang < 0.26) rollZiel = Math.atan2(qb.x, -qb.y);   // leicht unter der Bahn: drücken
    if (ang > 2.6 && this._rollVorz !== undefined && Math.abs(rollZiel) > 2.7) rollZiel = Math.abs(rollZiel) * this._rollVorz;   // Ziel genau hinten: Richtung halten
    this._rollVorz = Math.sign(rollZiel) || 1;
    // kleine Abweichungen: leichte Querlage nach der seitlichen Abweichung (koordinierte Kurve), sonst Flügel waagrecht
    const w = glatt(0.035, 0.14, ang), querKlein = klemm(-qb.x * 9, -0.55, 0.55);
    let rollFehler = w * rollZiel + (1 - w) * (querKlein - quer0);
    rollFehler = Math.atan2(Math.sin(rollFehler), Math.cos(rollFehler));
    const nickMax = Math.max(0.3, 1.2 * Math.min(JET.kAuftrieb * sig * V * V, 9 * G0) / Math.max(V, 40));
    const s = Math.max(1e-6, Math.sin(ang)), ax = achse.x / s, ay = achse.y / s;   // Drehachse normiert (Nicken hoch = Drehung um -x, Gieren rechts um -y)
    out.x = klemm(-ax * Math.min(ang, 1.2) / (nickMax * 0.7), -1, 1);
    out.y = klemm(-ay * Math.min(ang, 0.4) * 2.0 * (1 - 0.6 * w), -1, 1);
    out.z = klemm(rollFehler * 2.2 - this.w.z * 0.3, -1, 1);
    if (ang > 1.2) out.x = Math.max(out.x, 0.8 * Math.max(0, Math.cos(rollFehler)));   // weit hinten: kräftig ziehen, sobald gerollt
    return ang;
  }
}

// ---------- Modell (prozedural, rund 15,5 m lang, 10,4 m Spannweite) ----------
function panelTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#8a9299'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) { const x = Math.random() * 512, y = Math.random() * 512, r = 6 + Math.random() * 30, s = 128 + (Math.random() - 0.5) * 16; g.fillStyle = `rgba(${s},${s + 4},${s + 8},0.12)`; g.fillRect(x, y, r * 2.2, r); }
  g.strokeStyle = 'rgba(40,46,52,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); }
  for (let j = 0; j < 8; j++) for (let i = 0; i <= 6; i++) { const x = i * 85 + (j % 2) * 40; g.beginPath(); g.moveTo(x, j * 64); g.lineTo(x, j * 64 + 64); g.stroke(); }
  g.fillStyle = 'rgba(30,34,38,0.6)'; for (let i = 0; i < 260; i++) { g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 0.9, 0, 6.3); g.fill(); }   // Nieten
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function flaecheGeo(punkte, dicke) {   // Grundriss in (x, z), nach oben und unten gleich dick, Kanten abgerundet
  const s = new THREE.Shape(); punkte.forEach(([x, z], i) => i ? s.lineTo(x, z) : s.moveTo(x, z)); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: dicke, bevelEnabled: true, bevelThickness: dicke * 0.45, bevelSize: Math.min(0.12, dicke * 0.6), bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2); g.translate(0, dicke / 2, 0);   // Shape liegt in x, y: y wird zu z
  g.computeVertexNormals(); return g;
}
function spiegeln(geo) {   // an x spiegeln und den Drehsinn der Dreiecke umkehren (auch ohne Index, wie ExtrudeGeometry)
  const g = geo.clone(); g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  else for (const a of Object.values(g.attributes)) { const n = a.itemSize, arr = a.array; for (let i = 0; i < a.count; i += 3) for (let c = 0; c < n; c++) { const t = arr[(i + 1) * n + c]; arr[(i + 1) * n + c] = arr[(i + 2) * n + c]; arr[(i + 2) * n + c] = t; } }
  g.computeVertexNormals(); return g;
}

export function baueJet() {
  const gruppe = new THREE.Group(); gruppe.name = 'duesenjet';
  const tex = panelTextur();
  const lack = new THREE.MeshStandardMaterial({ color: 0x7f8890, map: tex, roughness: 0.5, metalness: 0.4, envMapIntensity: 1.0 });
  const dunkel = new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: 0.55, metalness: 0.35 });
  const nase = new THREE.MeshStandardMaterial({ color: 0x6b737b, roughness: 0.4, metalness: 0.3, emissive: new THREE.Color(1, 0.35, 0.08), emissiveIntensity: 0 });
  const duese = new THREE.MeshStandardMaterial({ color: 0x2c2b2a, roughness: 0.32, metalness: 0.9 });
  const glas = new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.05, metalness: 0.95, envMapIntensity: 1.8 });
  // Rumpf: Drehkörper entlang z, Nase vorn spitz, hinten zwei Düsen; leicht flach (Mischform)
  const profil = [[0, 7.9], [0.12, 7.6], [0.32, 7.0], [0.52, 6.0], [0.66, 5.0], [0.78, 3.8], [0.9, 2.4], [1.0, 0.8], [1.04, -1.0], [1.02, -3.0], [0.95, -5.0], [0.82, -6.4], [0.74, -7.2]];
  const lathe = new THREE.LatheGeometry(profil.map(([r, z]) => new THREE.Vector2(r, z)), 40);
  lathe.rotateX(Math.PI / 2); lathe.rotateX(Math.PI); lathe.scale(1.12, 0.82, 1); lathe.computeVertexNormals();   // Drehachse y wird z, Spitze nach +z
  const rumpf = new THREE.Mesh(lathe, lack); gruppe.add(rumpf);
  const spitze = new THREE.Mesh(new THREE.ConeGeometry(0.33, 1.3, 24, 1, true), nase);   // offen: sonst sah man im Cockpit den Boden des Kegels als Scheibe spitze.rotation.x = Math.PI / 2; spitze.position.z = 7.4; spitze.scale.set(1.1, 0.85, 1); gruppe.add(spitze);
  // Haube
  const haube = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glas); haube.scale.set(0.52, 0.5, 1.75); haube.position.set(0, 0.5, 3.6); haube.name = 'haube'; gruppe.add(haube);
  // Lufteinläufe seitlich
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 3.6), lack); e.position.set(s * 1.12, -0.12, 1.2); gruppe.add(e);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), dunkel); m.position.set(s * 1.12, -0.12, 3.0); gruppe.add(m);
  }
  // Flügel (Pfeilform), Höhenleitwerk, zwei schräge Seitenleitwerke
  const fluegel = flaecheGeo([[0.9, 2.2], [5.3, -2.6], [5.3, -3.5], [0.9, -4.0]], 0.16);
  const hl = flaecheGeo([[0.8, -5.0], [3.1, -6.7], [3.1, -7.3], [0.8, -7.0]], 0.1);
  for (const g of [fluegel, hl]) { gruppe.add(new THREE.Mesh(g, lack)); gruppe.add(new THREE.Mesh(spiegeln(g), lack)); }
  // Seitenleitwerke: Grundriss in (Höhe, z), um z aufgestellt (Höhe zeigt nach oben), je Seite 16 Grad nach außen geneigt
  const sl = flaecheGeo([[0, -4.4], [2.15, -6.2], [2.15, -6.95], [0, -7.0]], 0.09); sl.rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(sl, lack); m.rotation.z = -s * 0.28; m.position.set(s * 0.78, 0.5, 0); gruppe.add(m); }
  // Düsen mit Ring, innen dunkel
  const duesen = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.52, 1.1, 28, 1, true), duese); d.rotation.x = Math.PI / 2; d.position.set(s * 0.46, -0.05, -7.6); gruppe.add(d);
    const innen = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x150c06 })); innen.rotation.y = Math.PI; innen.position.set(s * 0.46, -0.05, -7.3); gruppe.add(innen);
    duesen.push(new THREE.Vector3(s * 0.46, -0.05, -8.15));
  }
  // Staurohr
  const rohr = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), duese); rohr.rotation.x = Math.PI / 2; rohr.position.z = 8.4; gruppe.add(rohr);
  gruppe.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  // Nachbrennerflamme: zwei Kegel je Düse (außen orange, innen hell), additiv, mit Flackern und Stoßringen
  const flammeMat = new THREE.ShaderMaterial({
    uniforms: { uStaerke: { value: 0 }, uNach: { value: 0 }, uZeit: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uStaerke, uNach, uZeit; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() { float t = 1.0 - vUv.y;   // 1 an der Düse, 0 am Ende
        float rand = pow(abs(dot(vN, vV)), 1.4);
        float ringe = uNach * smoothstep(0.82, 1.0, sin((1.0 - t) * 30.0 - uZeit * 3.0) * 0.5 + 0.5) * smoothstep(0.35, 0.8, t) * rand;
        float fl = 0.85 + 0.15 * sin(uZeit * 61.0 + t * 9.0) * sin(uZeit * 23.0);
        vec3 kalt = vec3(0.35, 0.55, 1.0), heiss = vec3(1.0, 0.55, 0.18), kern = vec3(1.0, 0.92, 0.75);
        vec3 c = mix(kalt * 0.5, mix(heiss * vec3(1.0, 0.8, 0.7), kern, smoothstep(0.78, 1.0, t)), uNach) * (t * t * t) * rand * fl * uStaerke * 1.35 + kern * ringe * 0.45 * uStaerke;
        gl_FragColor = vec4(c, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flammen = [];
  for (const p of duesen) {
    const g = new THREE.ConeGeometry(0.4, 1, 20, 1, true); g.translate(0, 0.5, 0); g.rotateX(-Math.PI / 2);   // Basis an der Düse (z 0), Spitze 1 m dahinter (z -1)
    // uv.y: 0 an der Basis (Düse), 1 an der Spitze
    const f = new THREE.Mesh(g, flammeMat); f.position.copy(p); f.frustumCulled = false; f.renderOrder = 5; gruppe.add(f); flammen.push(f);
  }
  // Überschallkegel (Dampf bei Mach 1 in feuchter Luft)
  const kegelMat = new THREE.ShaderMaterial({
    uniforms: { uStaerke: { value: 0 }, uZeit: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uStaerke, uZeit; varying vec2 vUv; varying vec3 vP;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() { float a = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y)); float n = h(floor(vec2(atan(vP.x, vP.y) * 9.0, vP.z * 6.0 + uZeit * 40.0)));
        gl_FragColor = vec4(vec3(0.95), a * (0.35 + 0.65 * n) * uStaerke * 0.55); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const kg = new THREE.CylinderGeometry(3.4, 1.0, 4.5, 32, 1, true); kg.rotateX(-Math.PI / 2);   // hinten weit, vorn eng
  const kegel = new THREE.Mesh(kg, kegelMat); kegel.position.z = -1.2; kegel.visible = false; kegel.renderOrder = 4; gruppe.add(kegel);
  gruppe.userData = { flammen, flammeMat, kegel, kegelMat, nase, lack, duesen, haube, fluegelSpitzen: [new THREE.Vector3(-5.3, 0.1, -3.1), new THREE.Vector3(5.3, 0.1, -3.1)] };
  return gruppe;
}
// Flamme, Kegel und Hitze je Bild nach dem Zustand des Jets
export function jetEffekte(modell, jet, zeit) {
  const u = modell.userData, nb = jet.nach, st = 0.35 + 0.65 * jet.gas;
  u.flammeMat.uniforms.uStaerke.value = jet.absturz ? 0 : st * 0.8 + nb * 0.6; u.flammeMat.uniforms.uNach.value = nb; u.flammeMat.uniforms.uZeit.value = zeit;
  const laenge = 1.0 + jet.gas * 1.5 + nb * (4.0 + 0.6 * Math.sin(zeit * 37)), breite = 0.8 + nb * 0.2;
  for (const f of u.flammen) { f.scale.set(breite, breite, laenge); f.visible = !jet.absturz && (jet.gas > 0.05 || nb > 0.02); }
  const kegel = Math.max(0, 1 - Math.abs(jet.mach - 1) / 0.06) * glatt(9000, 2000, jet.geo.h);
  u.kegel.visible = kegel > 0.02; u.kegelMat.uniforms.uStaerke.value = kegel; u.kegelMat.uniforms.uZeit.value = zeit;
  u.nase.emissiveIntensity = glatt(850, 1150, jet.v.length()) * glatt(0.002, 0.05, jet.sigma) * 2.2;   // Hitze an der Nase im Hyperschall
}

// ---------- Kondensstreifen und Wirbelschleppen (Punkte in ECEF, gezeichnet relativ zum Anker) ----------
export class Streifen {
  constructor(max = 700) {
    this.max = max; this.n = 0; this.kopf = 0; this.ecef = new Float64Array(max * 3); this.alter = new Float32Array(max); this.dauer = new Float32Array(max); this.groesse = new Float32Array(max);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3)); g.setAttribute('aAlter', new THREE.BufferAttribute(new Float32Array(max), 1)); g.setAttribute('aGr', new THREE.BufferAttribute(new Float32Array(max), 1));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uHoehe: { value: 900 } },
      vertexShader: `attribute float aAlter; attribute float aGr; uniform float uHoehe; varying float vA; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlter * smoothstep(25.0, 90.0, -mv.z);
        gl_PointSize = clamp(aGr * uHoehe / max(1.0, -mv.z), 0.0, 256.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA; if (a < 0.004) discard; gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a * 0.5);
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
  }
  neu(p, dauer, gr) { const i = this.kopf; this.ecef[i * 3] = p.x; this.ecef[i * 3 + 1] = p.y; this.ecef[i * 3 + 2] = p.z; this.alter[i] = 0; this.dauer[i] = dauer; this.groesse[i] = gr; this.kopf = (i + 1) % this.max; this.n = Math.min(this.max, this.n + 1); }
  update(dt, welt, hoehePx) {
    const g = this.mesh.geometry, pos = g.attributes.position.array, al = g.attributes.aAlter.array, gr = g.attributes.aGr.array, w = new THREE.Vector3(), l = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      this.alter[i] += dt; const t = this.alter[i] / this.dauer[i]; if (t >= 1) continue;
      w.set(this.ecef[i * 3], this.ecef[i * 3 + 1], this.ecef[i * 3 + 2]); welt.weltZuLokal(w, l);
      pos[k * 3] = l.x; pos[k * 3 + 1] = l.y; pos[k * 3 + 2] = l.z; al[k] = (1 - t) * Math.min(1, this.alter[i] * 4); gr[k] = this.groesse[i] * (1 + t * 3); k++;
    }
    g.setDrawRange(0, k); g.attributes.position.needsUpdate = true; g.attributes.aAlter.needsUpdate = true; g.attributes.aGr.needsUpdate = true;
    this.mesh.material.uniforms.uHoehe.value = hoehePx;
  }
  leeren() { this.n = 0; this.kopf = 0; this.mesh.geometry.setDrawRange(0, 0); }
}

// ---------- Ton (Web Audio, startet nach einer Geste) ----------
export class JetTon {
  constructor() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = C.sampleRate * 2, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.6 + b * 3.5; }
    const quelle = () => { const s = C.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
    this.haupt = C.createGain(); this.haupt.gain.value = 0.0;
    const komp = C.createDynamicsCompressor(); komp.threshold.value = -16; komp.ratio.value = 4; this.haupt.connect(komp); komp.connect(C.destination);
    const kette = (filterTyp, f, q) => { const s = quelle(), fi = C.createBiquadFilter(); fi.type = filterTyp; fi.frequency.value = f; fi.Q.value = q; const g = C.createGain(); g.gain.value = 0; s.connect(fi); fi.connect(g); g.connect(this.haupt); return { fi, g }; };
    this.grollen = kette('lowpass', 160, 0.7); this.brausen = kette('bandpass', 900, 0.6); this.nachbrenner = kette('lowpass', 420, 0.9); this.wind = kette('bandpass', 500, 0.8);
    const o1 = C.createOscillator(), o2 = C.createOscillator(); o1.type = 'sawtooth'; o2.type = 'triangle'; this.pfeifen = C.createGain(); this.pfeifen.gain.value = 0;
    const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; o1.connect(hp); o2.connect(hp); hp.connect(this.pfeifen); this.pfeifen.connect(this.haupt); o1.start(); o2.start(); this.o1 = o1; this.o2 = o2;
    this.machAlt = 0; this.an = true; this.laut = 0.55;
  }
  setze(jet, dt) {
    const C = this.ctx, t = C.currentTime, gas = jet.absturz ? 0 : jet.gas, nb = jet.absturz ? 0 : jet.nach, V = jet.v.length(), sig = luftDichte(jet.geo.h), luft = Math.min(1, sig * 2 + 0.05);
    const r = (p, v, z = 0.08) => p.setTargetAtTime(v, t, z);
    r(this.haupt.gain, this.an ? this.laut : 0, 0.15);
    r(this.grollen.g.gain, (0.35 + 0.65 * gas) * 0.5 * luft); r(this.grollen.fi.frequency, 110 + gas * 120);
    r(this.brausen.g.gain, (0.15 + gas * 0.5) * 0.35 * luft); r(this.brausen.fi.frequency, 500 + gas * 1400);
    r(this.nachbrenner.g.gain, nb * 1.1 * luft); r(this.nachbrenner.fi.frequency, 260 + nb * 380);
    r(this.wind.g.gain, Math.min(0.5, (V / 400) ** 2 * 0.35) * luft); r(this.wind.fi.frequency, 300 + Math.min(2500, V * 2.2));
    r(this.pfeifen.gain, (0.02 + gas * 0.05) * luft); r(this.o1.frequency, 1300 + gas * 1600); r(this.o2.frequency, 1950 + gas * 2300);
    if (this.machAlt < 1 && jet.mach >= 1 && sig > 0.1) this.knall();
    this.machAlt = jet.mach;
  }
  knall(staerke = 1) {   // Überschallknall oder Absturz: Rauschstoß mit tiefem Schlag
    const C = this.ctx, t = C.currentTime, len = C.sampleRate * 0.9, buf = C.createBuffer(1, len, C.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const e = Math.exp(-i / (C.sampleRate * 0.12)); d[i] = (Math.random() * 2 - 1) * e; }
    const s = C.createBufferSource(); s.buffer = buf; const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; const g = C.createGain(); g.gain.value = 1.6 * staerke;
    s.connect(f); f.connect(g); g.connect(this.haupt); s.start(t);
    const o = C.createOscillator(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5); const og = C.createGain(); og.gain.setValueAtTime(0.9 * staerke, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(og); og.connect(this.haupt); o.start(t); o.stop(t + 0.7);
  }
  pause(an) { const st = this.ctx.state; if (an && st !== 'running') this.ctx.resume(); else if (!an && st === 'running') this.ctx.suspend(); }
  ende() { try { this.ctx.close(); } catch (e) { /* schon zu */ } }
}
