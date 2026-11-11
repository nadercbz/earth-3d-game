// Licht in der Nacht (02.11.2026, Wunsch Nr. 37 "weiter verbessern": nachts war die Stadt schwarz). Ohne echte Lichtquellen je Laterne
// und Auto (Hunderte Lichter kosten zu viel): Lichtflecken auf dem Boden als additive Flächen und leuchtende Punkte für Scheinwerfer und
// Rücklichter. Alles wird mit der Nacht (NACHT aus kit/materials.js) eingeblendet.
import * as THREE from 'three';
import { NACHT } from './materials.js';

let _tex = null;
// weicher runder Fleck (Mitte hell, Rand null), einmal gezeichnet
export function lichtFleck() {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), v = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.35, 'rgba(255,255,255,0.55)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, 64, 64);
  _tex = new THREE.CanvasTexture(c); _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}
// Lichtkegel eines Scheinwerfers auf der Straße: vorn schmal und hell, nach hinten breiter und schwächer (v 0 am Auto, 1 weit vorn), kein Oval um den Wagen
let _kegel = null;
function kegelBild() {
  if (_kegel) return _kegel;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'), d = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) { const v = 1 - y / 127, u = Math.abs(x / 63 - 0.5) * 2, breite = 0.28 + 0.72 * Math.pow(v, 0.8), a = Math.max(0, 1 - u / breite); const k = Math.pow(a, 1.6) * Math.min(1, v * 7) * Math.pow(1 - v, 1.3) * 1.6, i = Math.min(255, k * 255); const o = (y * 64 + x) * 4; d.data[o] = i; d.data[o + 1] = i; d.data[o + 2] = i; d.data[o + 3] = 255; }
  g.putImageData(d, 0, 0); _kegel = new THREE.CanvasTexture(c); _kegel.colorSpace = THREE.SRGBColorSpace; return _kegel;
}
// Material für Lichtflecken am Boden: additiv, schreibt keine Tiefe, liegt über Straße und Gehweg, Stärke mit der Nacht
export function fleckMaterial(farbe, staerke) {
  const m = new THREE.MeshBasicMaterial({ map: lichtFleck(), color: farbe, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNacht = NACHT; sh.uniforms.uStaerke = { value: staerke };
    sh.fragmentShader = 'uniform float uNacht, uStaerke;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= uNacht * uStaerke;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'lichtfleck' + staerke;
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
// Scheinwerfer und Rücklichter aller fahrenden Autos plus Lichtkegel vor jedem Auto. update(autos): [{ pos (Boden, Mitte), dir, L, B }]
export class Scheinwerfer {
  constructor({ max = 200, mobil = false } = {}) {
    this.max = max; this.gruppe = new THREE.Group(); this.gruppe.name = 'scheinwerfer'; this.gruppe.frustumCulled = false;
    const kegel = new THREE.PlaneGeometry(1, 1); kegel.rotateX(-Math.PI / 2);
    const km = fleckMaterial(0xfff1d6, mobil ? 0.5 : 0.55); km.map = kegelBild();
    this.kegel = new THREE.InstancedMesh(kegel, km, max); this.kegel.frustumCulled = false; this.kegel.count = 0;
    const punkte = (farbe, groesse) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3));
      const m = new THREE.PointsMaterial({ map: lichtFleck(), color: farbe, size: groesse, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
      m.onBeforeCompile = sh => { sh.uniforms.uNacht = NACHT; sh.fragmentShader = 'uniform float uNacht;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= uNacht * 2.2;\n#include <opaque_fragment>'); };
      m.customProgramCacheKey = () => 'autolicht' + farbe;
      const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
    };
    this.vorn = punkte(0xfff6e8, 0.62); this.hinten = punkte(0xff2a18, 0.42);
    this.gruppe.add(this.kegel, this.vorn, this.hinten);
    // Bremslichter: auch bei Tag, solange gebremst wird
    { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3)); const m = new THREE.PointsMaterial({ map: lichtFleck(), color: 0xff1a10, size: 0.8, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); this.brems = new THREE.Points(g, m); this.brems.frustumCulled = false; this.brems.name = 'bremslichter'; }
  }
  update(autos, nacht) {
    if (this.brems && !this.brems.parent) this.gruppe.parent?.add(this.brems);
    { const B = this.brems.geometry.attributes.position; let n = 0; for (const a of autos) { if (!a.bremst || n >= this.max) continue; const p = a.pos, d = a.dir, L = a.L || 4.4, W = a.B || 1.8, sx = -d.z, sz = d.x; for (const [k, s] of [[0, 1], [1, -1]]) B.setXYZ(n * 2 + k, p.x - d.x * L * 0.5 + sx * s * W * 0.38, p.y + 0.88, p.z - d.z * L * 0.5 + sz * s * W * 0.38); n++; } B.needsUpdate = true; this.brems.geometry.setDrawRange(0, n * 2); this.brems.visible = n > 0; }
    const an = nacht > 0.05; this.gruppe.visible = an; if (!an) return;
    const V = this.vorn.geometry.attributes.position, H = this.hinten.geometry.attributes.position;
    let n = 0;
    for (const a of autos) {
      if (n >= this.max) break;
      const p = a.pos, d = a.dir, L = a.L || 4.4, B = a.B || 1.8, sx = -d.z, sz = d.x, y = p.y;
      for (const [k, s] of [[0, 1], [1, -1]]) {
        V.setXYZ(n * 2 + k, p.x + d.x * L * 0.49 + sx * s * B * 0.36, y + 0.68, p.z + d.z * L * 0.49 + sz * s * B * 0.36);
        H.setXYZ(n * 2 + k, p.x - d.x * L * 0.5 + sx * s * B * 0.38, y + 0.85, p.z - d.z * L * 0.5 + sz * s * B * 0.38);
      }
      // Lichtkegel: 24 m lang, 9 m breit, beginnt an der Front (das eigene Auto hat dafür einen echten Scheinwerfer: dort nur schwach)
      _p.set(p.x + d.x * (L * 0.5 + 12), y + 0.06, p.z + d.z * (L * 0.5 + 12));
      _q.setFromAxisAngle(_Y, Math.atan2(d.x, d.z) + Math.PI); const f = a.spieler ? 0.0001 : 1; _s.set(9 * f, 1, 24 * f);
      this.kegel.setMatrixAt(n, _m.compose(_p, _q, _s));
      n++;
    }
    V.needsUpdate = H.needsUpdate = true;
    this.vorn.geometry.setDrawRange(0, n * 2); this.hinten.geometry.setDrawRange(0, n * 2);
    this.kegel.count = n; this.kegel.instanceMatrix.needsUpdate = true;
  }
  entsorgen() { this.gruppe.removeFromParent(); for (const o of [this.kegel, this.vorn, this.hinten]) { o.geometry.dispose(); o.material.dispose(); } }
}

// Echte Lichter der nächsten Laternen (am Rechner, seit 04.11.2026): eine feste Zahl Punktlichter wandert mit dem Spieler von Laterne zu Laterne, weich ein und aus
// (feste Zahl, sonst würde jeder Shader neu übersetzt). So scheinen Laternen auf Autos, Wände und Menschen; die Flecken am Boden bleiben für alle ferneren.
export class LampenLichter {
  constructor(szene, { anzahl = 6, staerke = 150, reichweite = 36 } = {}) {
    this.L = Array.from({ length: anzahl }, () => { const l = new THREE.PointLight(0xffc98f, 0, reichweite, 1.9); l.castShadow = false; szene.add(l); return { l, lampe: null, an: 0 }; });
    this.staerke = staerke; this.t = 0; this.wahl = [];
  }
  // lampen: [[x, y, z], ...] im Rahmen der Szene oder null, nacht 0 bis 1, pos: Lage des Spielers oder der Kamera
  update(dt, lampen, pos, nacht) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.25; this.wahl.length = 0;
      if (lampen && nacht > 0.02) {
        let beste = []; for (const p of lampen) { const d = (p[0] - pos.x) ** 2 + (p[2] - pos.z) ** 2; if (d < 14000) beste.push([d, p]); }
        beste.sort((a, b) => a[0] - b[0]); this.wahl = beste.slice(0, this.L.length).map(x => x[1]);
      }
      // wer bleibt, bleibt; freie Lichter übernehmen neue Laternen, sobald sie aus sind
      const offen = this.wahl.filter(p => !this.L.some(e => e.lampe === p));
      for (const e of this.L) if (e.lampe && !this.wahl.includes(e.lampe)) e.raus = true; else e.raus = false;
      for (const e of this.L) if ((!e.lampe || (e.raus && e.an < 0.03)) && offen.length) { e.lampe = offen.shift(); e.raus = false; e.an = 0; e.l.position.set(e.lampe[0], e.lampe[1], e.lampe[2]); }
    }
    for (const e of this.L) {
      const ziel = e.lampe && !e.raus ? 1 : 0; e.an += (ziel - e.an) * (1 - Math.exp(-dt * 5));
      e.l.intensity = this.staerke * e.an * nacht;
    }
  }
}
