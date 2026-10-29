// Spieler zu Fuß in Third Person und die Verfolgerkamera (06_STEUERUNG.md, Skills camera-systems, input-systems, game-feel).
// Figur: Richtung aus der Eingabe relativ zur Kamera, weiches Beschleunigen (Rate 9) und Stoppen (Rate 12), dreht mit Rate 14
// in die Laufrichtung, Gehen 1,5 m/s, Rennen 4 m/s, Animation im passenden Takt, Bordstein als Stufe, Gebäude undurchdringlich
// (achsweise gleiten), nie durch einen Menschen (Abstand 0,62 m). Fester Schritt 1/60 s.
// Verfolger: Orbit um einen Punkt über der Figur (oder hinter dem Auto), Ziehen dreht, rückt vor Wände, schwenkt sanft hinter
// den Spieler, folgt bildratenunabhängig (1 - exp(-rate * dt)), Zittern nach Stößen als abklingendes Trauma (quadratisch, weich).
import * as THREE from 'three';
import { spawn } from './people.js';

const TEMPO = { gehen: 1.15, joggen: 2.9 };
const GEHEN = 1.5, RENNEN = 4.0, ABSTAND = 0.62;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _a = new THREE.Vector2(), _z = new THREE.Vector3(), _o = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Figur {
  constructor({ quelle, bewegungen, kollision, start, menge = null }) {
    this.f = spawn(quelle, bewegungen); this.obj = this.f.obj; this.obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    this.kollision = kollision; this.menge = menge; this.def = quelle.def;
    this.pos = new THREE.Vector3(start.x, kollision.hoehe(start.x, start.z), start.z); this.bildPos = this.obj.position;   // Physik und gezeigte Lage getrennt (Interpolation)
    this.ry = start.ry || 0; this.obj.rotation.y = this.ry; this.v = 0; this.clip = null; this.akku = 0; this.dir = new THREE.Vector3(Math.sin(this.ry), 0, Math.cos(this.ry));
    this.vy = 0; this.luft = false; this.hoeheUeberBoden = 0; this.sprungPuffer = 0; this.coyote = 0; this.gelandet = 0; this.sprungHoehe = 0;
    this.f.play('stehen', 0);
    this.alt = { pos: new THREE.Vector3(), ry: 0 }; this.bildSetzen();
  }
  // Interpolation wie beim Auto (kit/drive.js): fester Schritt 1/60 s, gezeigt wird zwischen den letzten zwei Schritten, sonst springt die
  // Figur auf einem 120 Hz Bildschirm abwechselnd 0 und 1 Schritt je Bild
  merken() { this.alt.pos.copy(this.pos); this.alt.ry = this.ry; }
  bildSetzen() { this.boden = undefined; this.merken(); this.akku = 0; this.zeigen(1); }
  zeigen(k) { this.bildPos.lerpVectors(this.alt.pos, this.pos, k); let d = this.ry - this.alt.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); this.obj.rotation.y = this.alt.ry + d * k; }
  // achse: Vector2 (x rechts, y vor) aus der Eingabe, camYaw: Blickrichtung der Kamera auf dem Boden, rennen: Shift, springen: Flanke der Leertaste
  update(dt, achse, camYaw, rennen, springen = false) {
    if (springen) this.sprungPuffer = 0.12;   // Eingabepuffer: ein Druck kurz vor der Landung springt trotzdem
    this.akku += dt; const h = 1 / 60; let n = 0;
    while (this.akku >= h && n++ < 8) { this.merken(); this.schritt(h, achse, camYaw, rennen); this.akku -= h; }
    if (this.akku >= h) this.akku = 0;
    this.zeigen(this.akku / h);
    // Animation nach Tempo, in der Luft eingefroren
    const name = this.v < 0.15 ? 'stehen' : this.v < 2.3 ? 'gehen' : 'joggen';
    if (name !== this.clip) { this.clip = name; this.f.play(name, 0.25); }
    if (name !== 'stehen') this.f.setSpeed(this.luft ? 0.15 : Math.max(0.4, this.v / TEMPO[name]));
    this.f.mixer.update(dt);
  }
  schritt(h, achse, camYaw, rennen) {
    // Springen: Puffer 0,12 s und Coyote 0,1 s (input-systems), Absprung 4,4 m/s, Schwerkraft 12 m/s² (knackig, rund 0,8 m hoch), halbe Steuerung in der Luft
    this.sprungPuffer -= h; this.coyote = this.luft ? this.coyote - h : 0.1; this.gelandet = Math.max(0, this.gelandet - h);
    if (this.sprungPuffer > 0 && this.coyote > 0) { this.vy = 4.4; this.luft = true; this.sprungPuffer = 0; this.coyote = 0; this.sprungHoehe = 0; }
    if (this.luft) { this.vy -= 12 * h; this.hoeheUeberBoden += this.vy * h; this.sprungHoehe = Math.max(this.sprungHoehe, this.hoeheUeberBoden); if (this.hoeheUeberBoden <= 0) { this.hoeheUeberBoden = 0; this.vy = 0; this.luft = false; this.gelandet = 0.15; } }
    _f.set(Math.sin(camYaw), 0, Math.cos(camYaw)); _r.crossVectors(_f, UP);   // Kamera vor und rechts auf dem Boden
    const wunsch = _z.set(0, 0, 0).addScaledVector(_f, achse.y).addScaledVector(_r, achse.x), staerke = Math.min(1, wunsch.length());
    const vZiel = staerke * (rennen ? RENNEN : GEHEN), rate = this.luft ? 2.5 : (vZiel > this.v ? 9 : 12);
    this.v += (vZiel - this.v) * (1 - Math.exp(-rate * h));
    if (staerke > 0.01) {   // in Laufrichtung drehen (kürzester Weg), weich aber schnell, in der Luft träger
      const ziel = Math.atan2(wunsch.x, wunsch.z); let d = ziel - this.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ry += d * (1 - Math.exp(-(this.luft ? 4 : 14) * h));
    }
    this.dir.set(Math.sin(this.ry), 0, Math.cos(this.ry));
    if (this.v > 0.01) {
      const [nx, nz] = this.kollision.schritt(this.pos.x, this.pos.z, this.pos.x + this.dir.x * this.v * h, this.pos.z + this.dir.z * this.v * h);
      this.pos.x = nx; this.pos.z = nz;
    }
    // nicht durch Menschen gehen: harter Abstand, die Figur weicht zur Seite, der Mensch bekommt einen kleinen Schubs
    if (this.menge) for (const p of this.menge.alle) {
      const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < ABSTAND && d > 1e-4) { const t = (ABSTAND - d), nx = dx / d, nz = dz / d; const [ax, az] = this.kollision.schritt(this.pos.x, this.pos.z, this.pos.x + nx * t * 0.7, this.pos.z + nz * t * 0.7); this.pos.x = ax; this.pos.z = az; p.push.x -= nx * t * 0.3; p.push.z -= nz * t * 0.3; }
    }
    const yZiel = this.kollision.hoehe(this.pos.x, this.pos.z);
    this.boden = (this.boden ?? yZiel) + (yZiel - (this.boden ?? yZiel)) * (1 - Math.exp(-20 * h));
    this.pos.y = this.boden + this.hoeheUeberBoden;
  }
  entfernen() { this.obj.parent?.remove(this.obj); }
}

export class Verfolger {
  constructor(camera, kollision) {
    this.camera = camera; this.kollision = kollision; this.yaw = 0; this.pitch = 0.32; this.dist = 4.2; this.distZiel = 4.2;
    this.ziel = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.trauma = 0; this.t = 0; this.ruhe = 0; this.frisch = true; this.fovBasis = camera.fov;
    this.yawVersatz = 0; this.pitchVersatz = 0;
  }
  // Ziehen (Pixel) und Mausrad
  eingabe(b, { zoom = [2, 8] }) {
    if (b.x || b.y) { this.yaw -= b.x * 0.0045; this.pitch = THREE.MathUtils.clamp(this.pitch + b.y * 0.0045, -0.35, 1.1); this.ruhe = 0; }
    if (b.rad) this.distZiel = THREE.MathUtils.clamp(this.distZiel * (1 + b.rad * 0.0012), zoom[0], zoom[1]);
  }
  stoss(st) { this.trauma = Math.min(1, this.trauma + st); }
  // ziel: Punkt, um den die Kamera kreist; heading: Richtung des Spielers (die Kamera schwenkt dahinter); bewegt: schwenkt nur in Bewegung
  update(dt, { ziel, heading, bewegt, rueckRate = 1.2, warte = 1.2, rate = 12, pitchStandard = null, fovPlus = 0, sofort = false, minAbstand = 1.2, heben = 0 }) {
    this.t += dt; this.ruhe += dt;
    if (this.ruhe > warte) {   // hinter den Spieler schwenken
      if (bewegt) { let d = heading + Math.PI - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-rueckRate * dt)); }
      if (pitchStandard !== null) this.pitch += (pitchStandard - this.pitch) * (1 - Math.exp(-rueckRate * dt));
    }
    this.dist += (this.distZiel - this.dist) * (1 - Math.exp(-8 * dt));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    _o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // Wand zwischen Ziel und Kamera: heranrücken (Abtastung 0,5 m), nie unter 1,2 m; im Haus höchstens 2,6 m und unter der Decke
    let d = this.dist;
    const innen = this.kollision?.innen && this.kollision.innen.drin(ziel.x, ziel.z);
    if (innen) d = Math.min(d, 2.6);
    if (this.kollision) { const t = this.kollision.sicht(ziel.x, ziel.z, ziel.x + _o.x * d, ziel.z + _o.z * d); if (t < 1) d = Math.max(innen ? 0.9 : minAbstand, d * t - 0.3); }
    _z.copy(ziel).addScaledVector(_o, d);
    if (heben > 0 && d < this.dist) _z.y += (this.dist - d) * heben;   // vor einer Wand höher statt näher (beim Fahren sonst im Autodach)
    if (innen) { const decke = this.kollision.decke(ziel.x, ziel.z) - 0.2; if (_z.y > decke) _z.y = decke; }
    if (sofort || this.frisch) { this.pos.copy(_z); this.ziel.copy(ziel); this.frisch = false; }
    else { this.pos.lerp(_z, 1 - Math.exp(-rate * dt)); this.ziel.lerp(ziel, 1 - Math.exp(-(rate + 2) * dt)); }
    if (this.pos.y < 0.6) this.pos.y = 0.6;
    if (innen) { const decke = this.kollision.decke(this.ziel.x, this.ziel.z) - 0.2; if (this.pos.y > decke) this.pos.y = decke; if (this.pos.y < ziel.y - 1.2) this.pos.y = ziel.y - 1.2; }
    // Zittern nach Stößen: Trauma klingt ab, Versatz quadratisch und weich (kein Rauschen je Bild)
    this.trauma = Math.max(0, this.trauma - 1.4 * dt);
    const s = this.trauma * this.trauma, sx = 0.28 * s * Math.sin(this.t * 31), sy = 0.2 * s * Math.sin(this.t * 23 + 1.3);
    this.camera.position.copy(this.pos);
    if (s > 0) { _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); this.camera.position.addScaledVector(_r, sx); this.camera.position.y += sy; }
    this.camera.lookAt(this.ziel);
    const fov = this.fovBasis + fovPlus; if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-4 * dt)); this.camera.updateProjectionMatrix(); }
  }
  zuruecksetzen() { if (Math.abs(this.camera.fov - this.fovBasis) > 0.01) { this.camera.fov = this.fovBasis; this.camera.updateProjectionMatrix(); } this.frisch = true; this.trauma = 0; }
}
