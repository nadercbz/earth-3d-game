// Hubschrauber über der ganzen Erde (05.11.2026, Nader: "auch ein helikopter modus ... landen"). Gleiche Schnittstelle wie der Jet (kit/jet.js), damit Kamera, Anzeigen, Karte und Ortsbau beide bedienen.
// Flugmodell wie ein gutes Actionspiel: Lage folgt der Eingabe (Nase runter heißt vorwärts), der Schub steht senkrecht zur Lage, ohne Eingabe schwebt er auf der Stelle und hält die Höhe. Alles in ECEF wie der Jet.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { geoZuSzene, szeneZuGeo, enu } from './erde.js';
import { luftDichte, schallTempo } from './jet.js';
import { Anzeigen, innenHaut } from './cockpit.js';

const G0 = 9.80665, D2R = Math.PI / 180, klemm = THREE.MathUtils.clamp, glatt = (a, b, x) => { const t = klemm((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _qi = new THREE.Quaternion();
export const HELI = { nickMax: 0.56, rollMax: 0.46, gierMax: 1.3, steigMax: 14, sinkMax: 11, kd: 5e-4, radHoehe: 1.86, hoeheMax: 6500 };

export class Heli {
  constructor() {
    this.art = 'heli'; this.p = new THREE.Vector3(); this.v = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();
    this.gas = 0.5; this.nach = 0; this.bremse = 0; this.geo = { lat: 0, lon: 0, h: 0 }; this.sigma = 1; this.mach = 0; this.alpha = 0; this.beta = 0; this.last = 1; this.lastSchnitt = 1; this.schub = 0; this.kmh = 0; this.steigen = 0; this.kurs = 0; this.neigung = 0; this.quer = 0; this.abriss = false; this.absturz = null;
    this.kursR = 0; this.nick = 0; this.roll = 0; this.gier = 0; this.amBoden = false; this.drehzahl = 1; this.agl = 1e4; this.fahrwerk = 1; this.radHoehe = HELI.radHoehe; this.keinPilot = false; this.motorAn = true;
  }
  setze(lat, lon, h, kurs, kmh = 0) {
    geoZuSzene(lat, lon, h, this.p); this.kursR = kurs * D2R; this.nick = 0; this.roll = 0; this.gier = 0; const e = enu(lat, lon); this.e = e; _a.copy(e.nord).multiplyScalar(Math.cos(this.kursR)).addScaledVector(e.ost, Math.sin(this.kursR)); this.v.copy(_a).multiplyScalar(kmh / 3.6); this.absturz = null; this.amBoden = false; this.lage(); this.aktualisiere();
  }
  achse(a, out) { return out.copy(a).applyQuaternion(this.q); }
  lage() {   // Quaternion aus Kurs, Nicken, Rollen im Rahmen der Erdoberfläche
    const e = this.e, f = _a.copy(e.nord).multiplyScalar(Math.cos(this.kursR)).addScaledVector(e.ost, Math.sin(this.kursR)), l = _b.crossVectors(e.oben, f).normalize();   // l: links
    const fw = _c.copy(f).multiplyScalar(Math.cos(this.nick)).addScaledVector(e.oben, -Math.sin(this.nick));   // Nick positiv: Nase runter
    const ob = new THREE.Vector3().crossVectors(fw, l).normalize(), li = l.clone().multiplyScalar(Math.cos(this.roll)).addScaledVector(ob, -Math.sin(this.roll)), ob2 = new THREE.Vector3().crossVectors(fw, li).normalize();   // Roll positiv: rechts runter
    this.q.setFromRotationMatrix(_m.makeBasis(li, ob2, fw));
  }
  aktualisiere() {
    const g = szeneZuGeo(this.p); this.geo = g; const e = this.e = enu(g.lat, g.lon), V = this.v.length();
    this.kmh = V * 3.6; this.steigen = this.v.dot(e.oben); this.mach = V / schallTempo(g.h); this.sigma = luftDichte(g.h); this.kurs = ((this.kursR / D2R) % 360 + 360) % 360; this.neigung = -this.nick / D2R; this.quer = this.roll / D2R;
  }
  // eing: vor -1..1 (vorwärts), seite (rechts), gier (rechts drehen), hoch (steigen)
  schritt(dt, eing) {
    if (this.absturz) return; const H = HELI, e = this.e;
    this.drehzahl += ((this.motorAn ? 1 : 0) - this.drehzahl) * (1 - Math.exp(-dt * (this.motorAn ? 0.9 : 0.35)));
    if (this.amBoden) {   // am Boden: steht, bis gestiegen wird (und der Rotor läuft)
      this.nick += (0 - this.nick) * (1 - Math.exp(-8 * dt)); this.roll += (0 - this.roll) * (1 - Math.exp(-8 * dt)); this.gier = 0; this.v.multiplyScalar(Math.exp(-6 * dt)); this.gas = 0.25;
      if (eing.hoch > 0.1 && this.drehzahl > 0.7) { this.amBoden = false; this.v.addScaledVector(e.oben, 2.2); this.p.addScaledVector(e.oben, 0.12); }
      this.lage(); return;
    }
    const V = this.v.length(), f = _a.copy(e.nord).multiplyScalar(Math.cos(this.kursR)).addScaledVector(e.ost, Math.sin(this.kursR)), vor = this.v.dot(f), schnell = klemm(Math.abs(vor) / 45, 0, 1);
    // Lage folgt der Eingabe, in schnellem Flug legt er sich in die Kurve
    const nZiel = eing.vor * H.nickMax, rZiel = klemm(eing.seite * H.rollMax + eing.gier * schnell * 0.45, -0.62, 0.62), rate = 1 - Math.exp(-2.8 * dt);
    this.nick += (nZiel - this.nick) * rate; this.roll += (rZiel - this.roll) * rate;
    this.gier += (eing.gier * H.gierMax * (1 - 0.3 * schnell) - this.gier) * (1 - Math.exp(-4 * dt)); this.kursR += this.gier * dt;
    this.w.set(-(nZiel - this.nick) * 1.8, this.gier * 0.8, (rZiel - this.roll) * 1.8);
    this.lage();
    // Höhe: Sollsteigen aus der Eingabe, ohne Eingabe hält er die Höhe; oben wird die Luft dünn
    const dünn = 1 - glatt(H.hoeheMax - 1800, H.hoeheMax, this.geo.h), vsSoll = (eing.hoch >= 0 ? eing.hoch * H.steigMax * dünn : Math.max(eing.hoch * H.sinkMax, -Math.max(1.5, this.agl * 0.5))) * this.drehzahl - (1 - this.drehzahl) * 8, vs = this.v.dot(e.oben);   // kurz über dem Boden fängt er das Sinken ab: Leertaste halten heißt sanft aufsetzen
    const aV = klemm((vsSoll - vs) * 1.9, -7, 7.5), ob = this.achse(new THREE.Vector3(0, 1, 0), _b), kipp = Math.max(0.55, ob.dot(e.oben)), T = (G0 + aV) / kipp;
    this.gas = klemm(T / (1.8 * G0), 0, 1); this.schub = T;
    // Schub, Schwerkraft, Widerstand (quadratisch), Bodeneffekt
    const boden = this.agl < 8 ? (1 - this.agl / 8) * 1.2 : 0, acc = _c.copy(ob).multiplyScalar(T + boden).addScaledVector(e.oben, -G0).addScaledVector(this.v, -H.kd * V - 0.05);
    this.v.addScaledVector(acc, dt); this.p.addScaledVector(this.v, dt);
    this.lastSchnitt = T / G0;
  }
}

// ---------- Modell ----------
const _lader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), BASIS = new URL('../assets/vehicles/', import.meta.url);
let _glb = null, _handy = false;
export function heliDateiLaden(handy = false) { _handy = handy; _glb ||= _lader.loadAsync(new URL((handy ? 'handy/' : '') + 'heli.glb', BASIS).href).catch(e => { console.warn('Heli Modell', e); return null; }); return _glb; }
function mitSpiegel(m, k) { m.onBeforeCompile = sh => { sh.uniforms.uSpiegel = { value: k }; sh.fragmentShader = 'uniform float uSpiegel;\n' + sh.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )\n radiance = mix( vec3( dot( radiance, vec3( 0.3, 0.55, 0.15 ) ) ), radiance, 0.5 ) * uSpiegel;\n iblIrradiance = mix( vec3( dot( iblIrradiance, vec3( 0.3, 0.55, 0.15 ) ) ), iblIrradiance, 0.45 ) * 1.2;\n#endif'); }; m.customProgramCacheKey = () => 'fliegerB' + k; }
function schrift(zeichne, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; zeichne(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; return t; }
// Rotorkreis: durchscheinende Scheibe, die die schnellen Blätter als Schleier zeigt
function rotorScheibe(r, achse) {
  const g = new THREE.CircleGeometry(r, 48); if (achse === 'y') g.rotateX(-Math.PI / 2); else g.rotateY(Math.PI / 2);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uStark: { value: 0 }, uR: { value: r } }, vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform float uStark, uR; void main() { float d = length(vP) / uR; float a = 0.5 + 0.5 * cos(atan(vP.z, vP.x + vP.y * 0.0001) * 4.0 + d * 1.4); float s = smoothstep(1.0, 0.975, d) * smoothstep(0.03, 0.09, d) * (0.16 + 0.12 * a * a) * uStark; if (s < 0.002) discard; gl_FragColor = vec4(vec3(0.05, 0.055, 0.06), s); }` });
  const k = new THREE.Mesh(g, m); k.renderOrder = 3; k.frustumCulled = false; return k;
}
export function baueHeli() {
  const gruppe = new THREE.Group(); gruppe.name = 'hubschrauber';
  gruppe.userData = { duesen: [], fluegelSpitzen: [], flammen: [] };
  return gruppe;
}
export async function heliEinsetzen(gruppe) {
  const g = await _glb, u = gruppe.userData; if (!g || u.echt) return false;
  const w = g.scene.clone(true); const T = u.teile = {}, mats = new Map(), piloten = [];
  w.traverse(o => {
    T[o.name] = o; if (/^pilot_/.test(o.name)) piloten.push(o); if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = !/^(scheiben|schrift|licht|blitz|beacon)/.test(o.name); o.receiveShadow = !_handy;
    const m0 = o.material; if (mats.has(m0)) { o.material = mats.get(m0); return; } let m = m0; const n = m0.name;
    if (n === 'lack') mitSpiegel(m, 1.7);
    else if (n === 'glas') { m = new THREE.MeshPhysicalMaterial({ color: 0x8fa0a8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }); mitSpiegel(m, 3.0); }
    else if (n === 'metall' || n === 'rahmen' || n === 'visier' || n === 'blatt') mitSpiegel(m, 1.6);
    else if (n === 'mfd') { u.anzeigen = new Anzeigen('heli'); u.anzeigen.zeichne({ neigung: 0, quer: 0, kmh: 0, agl: 0, geo: { h: 0, lon: 0 }, kurs: 0, gas: 0, nach: 0, fahrwerk: 1, steigen: 0, drehzahl: 0 }); m = u.anzeigen.mat; }
    else if (n === 'decal_heli') m = new THREE.MeshStandardMaterial({ map: schrift((c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(238,240,242,0.95)'; c.font = '700 120px Arial, Helvetica, sans-serif'; c.textBaseline = 'middle'; c.fillText('EARTH AIR', 14, H / 2 + 4); }, 1024, 170), transparent: true, alphaTest: 0.04, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mats.set(m0, m); o.material = m;
  });
  gruppe.add(w); u.echt = true; u.piloten = piloten; u.haube = T.scheiben; if (T.rumpf) u.innen = innenHaut(T.rumpf);
  if (T.rotor) { u.rotorS = rotorScheibe(5.3, 'y'); T.rotor.parent.add(u.rotorS); u.rotorS.position.copy(T.rotor.position); u.rotorS.position.y += 0.02; }
  if (T.heckrotor) { u.heckS = rotorScheibe(0.92, 'x'); T.heckrotor.parent.add(u.heckS); u.heckS.position.copy(T.heckrotor.position); }
  return true;
}
export function heliEffekte(modell, F, dt) {
  const u = modell.userData, T = u.teile; if (!T) return;
  const dz = F.drehzahl, wR = dz * 42, wH = dz * 150;   // Bogenmaß je Sekunde
  if (T.rotor) T.rotor.rotation.y += wR * dt; if (T.heckrotor) T.heckrotor.rotation.x += wH * dt;
  if (u.rotorS) u.rotorS.material.uniforms.uStark.value = glatt(0.25, 0.8, dz) * 1.0; if (u.heckS) u.heckS.material.uniforms.uStark.value = glatt(0.25, 0.8, dz) * 2.2;
  if (T.heckrotor) { const schnell = dz > 0.62; if (u._heckSchnell !== schnell) { u._heckSchnell = schnell; T.heckrotor.traverse(o => { if (o.isMesh && !/nabe/.test(o.name)) o.visible = !schnell; }); } }
  for (const p of u.piloten) p.visible = !F.keinPilot;
  const t = performance.now() / 1000, bl = (t % 1.1) < 0.09; if (T.beacon) T.beacon.visible = bl || (t % 1.1) > 0.55 && (t % 1.1) < 0.62; if (T.blitz) T.blitz.visible = bl;
}
// Rotorton: gehacktes Rauschen im Takt der Blätter, Turbine darüber
export class HeliTon {
  constructor() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)(); const n = C.sampleRate * 2, b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; l = 0.97 * l + 0.03 * w; d[i] = l * 2.4; }
    const s = C.createBufferSource(); s.buffer = b; s.loop = true; const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const chop = C.createGain(); chop.gain.value = 0.5; const lfo = C.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 15; const lg = C.createGain(); lg.gain.value = 0.46; lfo.connect(lg); lg.connect(chop.gain); s.connect(lp); lp.connect(chop);
    this.haupt = C.createGain(); this.haupt.gain.value = 0; const k = C.createDynamicsCompressor(); k.threshold.value = -16; k.ratio.value = 4; chop.connect(this.haupt); this.haupt.connect(k); k.connect(C.destination);
    const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700; const hp = C.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; this.turbine = C.createGain(); this.turbine.gain.value = 0; o.connect(hp); hp.connect(this.turbine); this.turbine.connect(this.haupt);
    s.start(); lfo.start(); o.start(); this.lfo = lfo; this.o = o; this.an = true; this.laut = 0.55;
  }
  setze(F) { const C = this.ctx, t = C.currentTime, dz = F.drehzahl; this.haupt.gain.setTargetAtTime(this.an ? this.laut * (0.1 + 0.9 * dz) * (0.75 + 0.5 * F.gas) : 0, t, 0.12); this.lfo.frequency.setTargetAtTime(4 + 13 * dz + F.gas * 2, t, 0.2); this.o.frequency.setTargetAtTime(600 + 1400 * dz, t, 0.2); this.turbine.gain.setTargetAtTime(0.03 * dz, t, 0.2); }
  knall(st = 1) { const C = this.ctx, t = C.currentTime, n = C.sampleRate * 0.9, b = C.createBuffer(1, n, C.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (C.sampleRate * 0.14)); const s = C.createBufferSource(); s.buffer = b; const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; const g = C.createGain(); g.gain.value = 1.5 * st; s.connect(f); f.connect(g); g.connect(this.haupt); s.start(t); }
  pause(an) { const st = this.ctx.state; if (an && st !== 'running') this.ctx.resume(); else if (!an && st === 'running') this.ctx.suspend(); }
}
