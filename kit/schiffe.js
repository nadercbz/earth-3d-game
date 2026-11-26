// Schiffe und Boote auf allen Meeren (05.11.2026, Nader: "Boote, große Containerschiffe, die über die Meere fahren ... überall", "verschiedene Boote, Schiffe", "sehr authentisch"). Modelle aus Blender (tools/blender/schiffe.py), gemeinsamer Atlas für Aufbauten und Container.
// Große Schiffe fahren auf den echten Seewegen (Ärmelkanal, Gibraltar, Suez, Malakka, Panama ...), abseits davon seltener. Dicht an der Küste Kutter, Yachten, Segler, Motorboote, Schlepper und Fähren. Sie weichen Land aus, reiten auf den Wellen des Meeres und ziehen ein Kielwasser.
import * as THREE from 'three';
import { ECHT } from './echtzeit.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MEER_U } from './meer_glsl.js';
import { enu, geoZuSzene, R as ERD_R } from './erde.js';
import { Kreuzfahrt } from './kreuzfahrt.js';

export const SCHIFFE = {
  container: { L: 330, B: 48, v: 11, gross: true, name: 'EARTH LINE', klein: 'ATLAS STAR' }, tanker: { L: 250, B: 44, v: 7.5, gross: true, name: 'NORDSTERN', klein: 'NORDSTERN' }, kreuz: { L: 290, B: 36, v: 10, gross: true, name: 'AURORA', klein: 'AURORA' },
  faehre: { L: 170, B: 28, v: 9.5, gross: false, name: 'SEELINIE', klein: 'SEELINIE' }, frachter: { L: 182, B: 30, v: 7, gross: true, name: 'MERIDIAN', klein: 'MERIDIAN' }, schlepper: { L: 32, B: 11.5, v: 5.5, gross: false, name: 'HERKULES', klein: 'HERKULES' },
  kutter: { L: 27, B: 7.8, v: 4.2, gross: false, name: 'MÖWE', klein: 'MÖWE' }, yacht: { L: 46, B: 9, v: 8, gross: false, name: 'SIRENE', klein: 'SIRENE' }, segler: { L: 17, B: 4.9, v: 3.4, gross: false }, boot: { L: 8.4, B: 2.9, v: 9, gross: false },
};
const GROSSE = ['container', 'container', 'container', 'tanker', 'tanker', 'frachter', 'frachter', 'frachter', 'faehre'], KLEINE = ['kutter', 'kutter', 'yacht', 'segler', 'segler', 'segler', 'boot', 'boot', 'boot', 'schlepper', 'faehre'];
// Seewege (Breite, Länge): Hauptrouten der Welt, grob entlang der echten Fahrwasser. Schiffe in ihrer Nähe fahren in ihrer Richtung, die Dichte ist dort höher
const SEEWEGE = [
  [[51.0, 1.6], [50.2, -0.8], [49.5, -5], [48, -8], [43.5, -11], [37, -10], [36, -6], [36.2, -2], [37.3, 7], [37.2, 11], [34.8, 19], [32, 30], [31.5, 32.3], [29.9, 32.55], [27.5, 34], [20, 38], [14, 42.2], [12.5, 44], [13, 50], [11.5, 60], [8, 75], [6.3, 80], [6, 92], [5.7, 96], [3.5, 100], [1.5, 103.4], [1.2, 104.2], [4, 106], [10, 111], [20, 116], [22, 114.5], [25, 120], [30.5, 123], [31.2, 122.5]],
  [[51.0, 1.6], [53.5, 4.5], [54, 7.6], [53.9, 8.8], [56, 8], [57.8, 10.6], [56, 12.2], [55, 13], [54.8, 18], [57, 19.5], [59.6, 23], [60, 27]], [[51, 1.6], [49.8, -3], [49.5, -8], [46, -30], [41, -55], [40.4, -73.5]], [[49.5, -8], [52, -30], [50, -50], [46, -60]],
  [[36, -6], [28, -16], [15, -18], [0, -8], [-20, 3], [-34.5, 17], [-35, 20], [-33, 35], [-22, 50], [-5, 60], [6, 78]], [[40.4, -73.5], [32, -76], [25, -77], [20, -73], [14, -77], [9.5, -79.7], [8.8, -79.6], [5, -82], [10, -100], [20, -110], [33.5, -118.5]], [[33.5, -118.5], [30, -140], [32, -160], [35, 170], [35, 150], [34.5, 139.5], [33.5, 135], [31.5, 128], [31.2, 122.5]],
  [[1.2, 104.2], [-5, 107], [-8, 115.7], [-12, 122], [-20, 113], [-33, 114], [-35.2, 137], [-38.5, 145], [-34, 152], [-20, 155], [-5, 148], [8, 125], [14, 120], [22, 118]], [[9.5, -79.7], [-5, -82], [-12, -78], [-33, -72]], [[40.4, -73.5], [25, -66], [10, -55], [-5, -35], [-23, -42], [-34.5, -52]], [[-34.5, 17], [-30, -5], [-23, -42]],
  [[12.5, 44], [24, 58], [26, 56.5], [27, 51]], [[36.2, -2], [40.5, 5], [43.2, 5.3]], [[37.3, 7], [41, 2.2]], [[37.2, 11], [40.5, 14], [44, 9]], [[34.8, 19], [37.8, 23.8], [40.3, 26.5], [41.1, 29], [43, 30], [44.5, 33.5]], [[34.8, 19], [40, 19], [45.3, 13]], [[20, 116], [35, 121], [38.5, 120], [37.5, 125], [35, 129]],
  [[49.3, -123.5], [40, -125], [33.5, -118.5]], [[49.3, -123.5], [48, -150], [45, 170], [35, 150]], [[60, 27], [59, 19]], [[-33, 114], [-10, 80], [6, 78]],
];
const D2R = Math.PI / 180, R2D = 180 / Math.PI, kl = THREE.MathUtils.clamp, TAU = Math.PI * 2;
const hash = (a, b) => { let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
const zufall = s => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// nächster Abschnitt eines Seewegs: Abstand (km) und Richtung (Grad von Nord)
function seeweg(lat, lon) {
  let best = 1e9, kurs = 0; const cl = Math.cos(lat * D2R);
  for (const W of SEEWEGE) for (let i = 0; i < W.length - 1; i++) {
    const [a0, o0] = W[i], [a1, o1] = W[i + 1]; let dO = o1 - o0; if (dO > 180) dO -= 360; if (dO < -180) dO += 360; const dx = dO * cl, dy = a1 - a0, l2 = dx * dx + dy * dy || 1e-6; let rO = lon - o0; if (rO > 180) rO -= 360; if (rO < -180) rO += 360; const px = rO * cl, py = lat - a0, t = kl((px * dx + py * dy) / l2, 0, 1), d = Math.hypot(px - dx * t, py - dy * t) * 111;
    if (d < best) { best = d; kurs = Math.atan2(dx, dy) * R2D; }
  }
  return { d: best, kurs };
}

const _lader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), BASIS = new URL('../assets/ships/', import.meta.url), _texL = new THREE.TextureLoader();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
function schrift(text, w, h, farbe, groesse) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.clearRect(0, 0, w, h); g.fillStyle = farbe; g.font = `800 ${groesse}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + groesse * 0.04); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; return t; }

const SPUR_VS = 'attribute vec4 aS; attribute float aK; varying vec4 vS; varying float vK; void main() { vS = aS; vK = aK; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }';
const SPUR_FS = `varying vec4 vS; varying float vK; // a Abstand hinter dem Bug, q seitlich (m), L, B
  void main() {
    float uStark = vK;
    float a = vS.x, d = abs(vS.y), L = vS.z, B = vS.w, as = a - L, las = max(as, 0.0);
    float armX = B * 0.42 + a * 0.35, w = max(0.45, B * 0.07) + a * 0.022, q1 = (d - armX) / w, arm = exp(-q1 * q1) * exp(-a / (L * 3.4 + 50.0)) * smoothstep(0.0, L * 0.06 + 1.0, a);
    float q2 = (d - (B * 0.5 + las * 0.3)) / (1.0 + las * 0.03), armS = exp(-q2 * q2) * exp(-las / (L * 1.5 + 30.0)) * smoothstep(-L * 0.04, L * 0.05, as) * 0.6;
    float ww = B * 0.38 + las * 0.04, wash = exp(-(d / ww) * (d / ww)) * exp(-las / (L * 1.3 + 40.0)) * smoothstep(-L * 0.12, 0.0, as) * (0.72 + 0.28 * sin(as * 0.23 + d * 0.3));
    float q3 = d / (ww * 1.6 + 2.0), glatt = exp(-q3 * q3) * exp(-las / (L * 5.0 + 200.0)) * smoothstep(-L * 0.1, L * 0.03, as);
    float inner = smoothstep(armX + w * 2.0, armX - w, d) * smoothstep(0.0, L * 0.12 + 4.0, a), kh = sin((a * 0.5 - d * 0.9) * 2.2 / (1.0 + L * 0.01)) * inner * exp(-a / (L * 2.0 + 120.0)) * 0.35 + sin((a - d * 1.6) * 1.8 / (1.0 + L * 0.01)) * arm * 0.4;
    float seite = exp(-pow((d - B * 0.5) / (1.0 + B * 0.09), 2.0)) * step(a, L * 1.02) * (0.28 + 0.5 * exp(-a / (L * 0.12 + 1.0)));   // Gischt am Rumpf, an der Bugwelle am stärksten
    gl_FragColor = vec4(max(max(arm, armS) * 0.9, seite) * uStark, wash * uStark, glatt * uStark, 0.5 + 0.5 * clamp(kh * uStark, -1.0, 1.0));
  }`;

const _el = {};
// AIS Schiffstyp und Länge auf unsere Modelle
function echtesModell(r) { const t = r.typ, L = r.L || 0; if (t >= 60 && t < 70) return L > 220 ? 'kreuz' : 'faehre'; if (t >= 40 && t < 50) return 'faehre'; if (t >= 80 && t < 90) return 'tanker'; if (t >= 70 && t < 80) return L > 260 ? 'container' : 'frachter'; if (t === 30) return 'kutter'; if (t === 31 || t === 32 || t === 52) return 'schlepper'; if (t === 36) return 'segler'; if (t === 37) return L > 25 ? 'yacht' : 'boot'; return L > 60 ? 'frachter' : L > 22 ? 'schlepper' : L > 0 ? 'boot' : 'kutter'; }

const _f2 = new THREE.Vector3(), _l2 = new THREE.Vector3();
export class Schiffe {
  constructor({ renderer, welt, gruppe, meer, mobil = false, effekte = null, ton = null }) {
    this.renderer = renderer; this.welt = welt; this.meer = meer; this.mobil = mobil; this.gruppe = gruppe; this.effekte = effekte; this.ton = ton; this.liste = []; this.modelle = new Map(); this.laedt = new Map(); this.zellen = new Map(); this.tSuche = 0; this.t = 0; this.nacht = 0; this.an = true; this.fahrplan = new Kreuzfahrt(); this.tPlan = 0; this.planSchiffe = new Map();
    this.maxGross = mobil ? 3 : 7; this.maxKlein = mobil ? 6 : 16;
    const P = mobil ? 'handy/' : '', tex = (n, sr) => { const t = _texL.load(new URL(`${P}trim_${n}.webp`, BASIS).href); t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = sr ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 6; return t; };
    const orm = tex('orm', false);
    this.matTrim = new THREE.MeshStandardMaterial({ map: tex('farbe', true), normalMap: tex('normal', false), roughnessMap: orm, metalnessMap: orm, emissiveMap: tex('leucht', true), emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 1, metalness: 1 }); this.matTrim.name = 'trim';
    this.matLichter = [];
    // Kielwasser: zwei Karten von oben (nah fein, fern grob), Bänder der Schiffe mit Maximum geblendet
    const G = mobil ? 512 : 1024, op = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace };
    this.rtN = new THREE.WebGLRenderTarget(G, G, op); this.rtF = new THREE.WebGLRenderTarget(G, G, op); MEER_U.tSpurN.value = this.rtN.texture; MEER_U.tSpurF.value = this.rtF.texture;
    if (!mobil) { this.rtS = new THREE.WebGLRenderTarget(960, 540, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, colorSpace: THREE.NoColorSpace }); MEER_U.tSpiegel.value = this.rtS.texture; this.camS = new THREE.PerspectiveCamera(); this.camS.layers.set(5); }
    this.spurSz = new THREE.Scene(); this.spurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4e5); this.spurCam.up.set(0, 0, -1);
    this.spurMat = new THREE.ShaderMaterial({ uniforms: {}, vertexShader: SPUR_VS, fragmentShader: SPUR_FS, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide, toneMapped: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.MaxEquation });
  }
  lade(id) {
    if (this.modelle.has(id)) return Promise.resolve(this.modelle.get(id)); if (this.laedt.has(id)) return this.laedt.get(id);
    const p = _lader.loadAsync(new URL(`${this.mobil ? 'handy/' : ''}${id}.glb`, BASIS).href).then(g => {
      const d = SCHIFFE[id];
      g.scene.traverse(o => {
        if (!o.isMesh) return; o.frustumCulled = true; o.layers.enable(5); const n = o.material.name; o.castShadow = !/^(decal|licht|segel)/.test(n) && !this.mobil; o.receiveShadow = false;
        if (n === 'trim') o.material = this.matTrim;
        else if (n === 'rumpf') { o.material.envMapIntensity = 1.4; o.material.roughness = 1; }
        else if (n === 'segel') { o.material.side = THREE.DoubleSide; o.material.roughness = 0.85; }
        else if (n === 'aussen_teak') { const t = _texL.load(new URL('kreuzer/teak' + (this.mobil ? '_h' : '') + '.webp', BASIS).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; o.material = new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0 }); o.castShadow = false; o.receiveShadow = true; }
        else if (n === 'poolwasser') { o.material = new THREE.MeshStandardMaterial({ color: 0x1398b8, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.2 }); o.castShadow = false; }
        else if (n === 'aussen_glas') { o.material = new THREE.MeshStandardMaterial({ color: 0xa8d0d8, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }); o.castShadow = false; }
        else if (n === 'decal_name' || n === 'decal_klein') { const klein = n === 'decal_klein', hell = !['kreuz', 'yacht', 'segler', 'boot', 'faehre'].includes(id); const text = (klein ? d.klein : d.name) || ''; o.material = new THREE.MeshStandardMaterial({ map: schrift(text, 2048, klein ? 256 : 400, hell ? 'rgba(236,238,240,0.96)' : 'rgba(14,30,66,0.95)', klein ? 180 : 300), transparent: true, alphaTest: 0.03, roughness: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); o.castShadow = false; }
        else if (/^licht/.test(n)) { o.material.emissiveIntensity = 2; this.matLichter.push(o.material); }
      });
      this.modelle.set(id, g.scene); return g.scene;
    }).catch(e => { console.warn('Schiff', id, e); return null; });
    this.laedt.set(id, p); return p;
  }
  // Ein Schiff ins Meer setzen (auch Prüfstand)
  setze(id, lat, lon, kursGrad, tempoF = 1) {
    const d = SCHIFFE[id]; if (!d) return null;
    const s = { id, d, lat, lon, kurs: kursGrad * D2R, ziel: kursGrad * D2R, v: d.v * tempoF, vZiel: d.v * tempoF, modell: null, heave: 0, vHeave: 0, pitch: 0, vPitch: 0, roll: 0, vRoll: 0, tProbe: Math.random() * 3, spur: [], seit: 1e9, rauchT: Math.random(), band: null, geo: new THREE.Vector3(), hupT: 20 + Math.random() * 40 };
    this.liste.push(s); this.lade(id).then(m => { if (!m || !this.liste.includes(s)) return; s.modell = m.clone(true); if (s.skala) s.modell.scale.setScalar(s.skala); s.teile = {}; s.modell.traverse(o => { if (o.name === 'radar') s.teile.radar = o; if (o.name === 'rauch') s.rauch = o; }); s.modell.visible = false; this.gruppe.add(s.modell); });
    return s;
  }
  weg(s) { if (s.plan) this.planSchiffe.delete(s.plan.k); const i = this.liste.indexOf(s); if (i >= 0) this.liste.splice(i, 1); if (s.modell) this.gruppe.remove(s.modell); if (s.band) { this.spurSz.remove(s.band); s.band.geometry.dispose(); } }
  // Echte Schiffe (kit/echtzeit.js): wo AIS offen ist, fahren nur noch die echten großen Schiffe, kleine Boote bleiben gewürfelt. Fällt die Quelle aus, läuft alles wie vorher
  echtAbgleich(blick, hA) {
    const Q = ECHT.q, an = !!Q?.schiffeLeben(blick.lat, blick.lon);
    if (!an) { if (this.echtAn) for (const s of this.liste.slice()) if (s.echt) this.weg(s); this.echtAn = false; return; }
    if (!this.echtAn) for (const s of this.liste.slice()) if (s.d.gross && !s.plan && !s.anBord && !s.fest) this.weg(s);
    this.echtAn = true; const L = Q.schiffeBei(blick.lat, blick.lon, hA > 4000 ? 90000 : 42000, this.maxGross + 6), da = new Map(); for (const s of this.liste) if (s.echt) da.set(s.echt.mmsi, s);
    const halten = new Set(); for (const r of L) { halten.add(r.mmsi); const s = da.get(r.mmsi); if (s) { s.echt = r; continue; } const id = echtesModell(r), D = SCHIFFE[id], o = Q.schiffLage(r, {}), n = this.setze(id, o.lat, o.lon, r.kurs / D2R, 1); if (!n) continue; n.echt = r; n.fest = true; n.v = n.vZiel = r.v; n.ziel = n.kurs = r.kurs; if (r.L > 4) n.skala = kl(r.L / D.L, 0.4, 1.2); }
    for (const s of this.liste.slice()) if (s.echt && !halten.has(s.echt.mmsi)) this.weg(s);
  }
  // Zellen um die Kamera einmal auswürfeln: große Schiffe auf offener See und den Seewegen, kleine an den Küsten
  suchen(lat, lon, hA) {
    const Er = this.welt.erde, cl = Math.max(0.15, Math.cos(lat * D2R)), jetzt = this.t;
    // Genug Wasser ringsum für dieses Schiff? Sonst liegt eine 170 m Fähre in der Themse an der Waterloo Bridge
    const breit = (la, lo, m) => { for (let i = 0; i < 8; i++) { const w = i / 8 * TAU; if (Er.meerBei(la + Math.sin(w) * m / 111000, lo + Math.cos(w) * m / (111000 * cl)) < 0.6) return false; } return true; };
    const pruefe = (groesse, radius, gross) => {
      const dLa = groesse / 111, dLo = dLa / cl, i0 = Math.floor(lat / dLa), j0 = Math.floor(lon / dLo), rr = Math.ceil(radius / groesse);
      for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
        const ia = i0 + a, jb = j0 + b, key = `${gross ? 'g' : 'k'}${ia}:${jb}`; if (this.zellen.has(key)) continue; const R = zufall(hash(ia * (gross ? 1 : 3) + 11, jb * 7 + 3)), la = (ia + R()) * dLa, lo = (jb + R()) * dLo;
        const wahr = R(), wahl = R(), ku = R() * 360;
        if (Math.hypot(a, b) * groesse > radius) continue;
        if (Er.meerBei(la, lo) < 0.9) { this.zellen.set(key, jetzt); continue; }
        this.zellen.set(key, jetzt);
        if (gross) {
          const W = seeweg(la, lo), nahe = Math.exp(-W.d / 90), p = 0.1 + 0.85 * nahe; if (wahr > p) continue; if (this.liste.filter(s => s.d.gross).length >= this.maxGross) continue;
          const id = GROSSE[Math.floor(wahl * GROSSE.length)], rueck = ((hash(ia, jb) >> 3) & 1) ? 180 : 0; const kk = W.d < 200 ? W.kurs + rueck + (R() - 0.5) * 8 : ku; if (!breit(la, lo, 1600)) continue; this.setze(id, la, lo, kk, 0.8 + R() * 0.25);
        } else {
          // an der Küste? In einem Umkreis von 6 km liegt Land
          let kueste = false; for (let i = 0; i < 8 && !kueste; i++) { const w = i / 8 * TAU; if (Er.meerBei(la + Math.sin(w) * 0.055, lo + Math.cos(w) * 0.055 / cl) < 0.5) kueste = true; }
          const p = kueste ? 0.62 : 0.05; if (wahr > p) continue; if (this.liste.filter(s => !s.d.gross).length >= this.maxKlein) continue;
          let id = KLEINE[Math.floor(wahl * KLEINE.length)]; if (!breit(la, lo, Math.max(70, SCHIFFE[id].L * 3))) { if (SCHIFFE[id].L > 12 && breit(la, lo, 55)) id = 'boot'; else continue; } this.setze(id, la, lo, ku, 0.55 + R() * 0.5);
        }
      }
    };
    if (!this.echtAn) pruefe(32, hA > 4000 ? 90 : 42, true); if (hA < 4000) pruefe(3.5, 9.5, false);
    if (this.zellen.size > 2500) { let n = 0; for (const [k, t] of this.zellen) if (jetzt - t > 200 && n++ < 800) this.zellen.delete(k); }
  }
  update(dt, { camera, hA, nacht = 0, blick, wind = 5 }) {
    const W = this.welt, M = this.meer, Er = W.erde; this.t += dt; this.nacht = nacht;
    this.matTrim.emissiveIntensity = nacht * 1.5; for (const m of this.matLichter) m.emissiveIntensity = 0.8 + nacht * 4;
    const sichtbar = this.an && hA < 60000;
    if (!sichtbar) { for (const s of this.liste.slice()) if (!s.anBord) this.weg(s); MEER_U.uSpurN.value.w = 0; MEER_U.uSpurF.value.w = 0; return; }
    if ((this.tEcht = (this.tEcht ?? 1) - dt) <= 0) { this.tEcht = 3; this.echtAbgleich(blick, hA); }
    if ((this.tSuche -= dt) <= 0) { this.tSuche = 1.2; this.suchen(blick.lat, blick.lon, hA); }
    if ((this.tPlan -= dt) <= 0 && this.fahrplan.bereit && !this.ohneFahrplan) { this.tPlan = 1.5; const R = hA > 4000 ? 125000 : 58000, cl0 = Math.cos(blick.lat * D2R), st = {}; for (let r = 0; r < this.fahrplan.routen.length; r++) for (let j = 0; j < 2; j++) { const k = r * 2 + j; if (this.planSchiffe.has(k)) continue; this.fahrplan.zustand(r, j, st); if (Math.hypot((st.lat - blick.lat) * 111000, (st.lon - blick.lon) * 111000 * cl0) < R) { const s = this.setze('kreuz', st.lat, st.lon, st.kurs, 1); s.plan = { r, j, k }; s.fahrplan = {}; this.planSchiffe.set(k, s); } } }
    const radius = hA > 4000 ? 130000 : 62000, clk = Math.cos(blick.lat * D2R), amMeer = MEER_U.uMeerNah.value.w > 0.5;
    for (const s of this.liste.slice()) {
      const d = s.d; if (s.echt) { const q = ECHT.q?.schiffLage(s.echt, _el); if (q) { const f = 1 - Math.exp(-dt / 6); s.lat += (q.lat - s.lat) * f; s.lon += (q.lon - s.lon) * f; s.ziel = s.echt.kurs; s.v = s.vZiel = s.echt.v; s.tProbe = 9; } }
      if (s.plan) { this.fahrplan.zustand(s.plan.r, s.plan.j, s.fahrplan); s.lat = s.fahrplan.lat; s.lon = s.fahrplan.lon; s.kurs = s.ziel = s.fahrplan.kurs * D2R; s.v = s.vZiel = Math.min(s.fahrplan.v, d.v * 1.2); s.tProbe = 9; }
      if (s.fest) { s.tProbe = 9; s.vZiel = s.v; }   // liegt am Kai oder fährt fest vorgegeben (kit/hafen.js)
      const dLa = (s.lat - blick.lat) * 111000, dLo = (s.lon - blick.lon) * 111000 * clk, weit = Math.hypot(dLa, dLo); if (!s.anBord && !s.fest && (weit > radius || (!d.gross && weit > 16000))) { this.weg(s); continue; }
      // Fahren und Land ausweichen
      s.tProbe -= dt; if (s.tProbe <= 0) { s.tProbe = 2.5 + Math.random() * 2; const vor = Math.max(d.L * 5, d.gross ? 2600 : 320), cl = Math.cos(s.lat * D2R), frei = k => { for (const f of [0.5, 1]) if (Er.meerBei(s.lat + Math.cos(k) * vor * f / 111000, s.lon + Math.sin(k) * vor * f / (111000 * cl)) < 0.6) return false; return true; }; if (!frei(s.kurs)) { let beste = null; for (const a of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.8]) if (frei(s.kurs + a)) { beste = s.kurs + a; break; } s.ziel = beste ?? s.kurs + 3.0; s.vZiel = d.v * 0.5; } else { s.vZiel = d.v * 0.9; if (d.gross) { const Wg = seeweg(s.lat, s.lon); if (Wg.d < 60 && Math.random() < 0.3) { let dk = Wg.kurs * D2R - s.kurs; dk = Math.atan2(Math.sin(dk), Math.cos(dk)); if (Math.abs(dk) > Math.PI / 2) dk = Math.atan2(Math.sin(dk + Math.PI), Math.cos(dk + Math.PI)); s.ziel = s.kurs + dk; } } else if (Math.random() < 0.05) s.ziel = s.kurs + (Math.random() - 0.5) * 1.2; } }
      let dk = s.ziel - s.kurs; dk = Math.atan2(Math.sin(dk), Math.cos(dk)); const dreh = (d.gross ? 0.012 : d.L < 12 ? 0.3 : 0.08) * Math.sign(dk) * Math.min(1, Math.abs(dk) * 4); s.kurs += dreh * dt; s.v += (s.vZiel - s.v) * (1 - Math.exp(-dt * (d.gross ? 0.03 : 0.3)));
      if (!s.plan && !s.fest) { s.lat += Math.cos(s.kurs) * s.v * dt / 111000; s.lon += Math.sin(s.kurs) * s.v * dt / (111000 * Math.cos(s.lat * D2R)); }
      if (!s.modell) continue;
      // Lage: auf der Meeresfläche, Wellen geben Hub, Nicken und Rollen
      const e = enu(s.lat, s.lon), f = _v.copy(e.nord).multiplyScalar(Math.cos(s.kurs)).addScaledVector(e.ost, Math.sin(s.kurs)); const l = W.geoZuLokal(s.lat, s.lon, 0, s.modell.position);
      const nah = weit < 9000, wv = M.wellen;
      if (nah) {
        const fL = _w.copy(f).applyQuaternion(W.zuLokal), sx = fL.z, sz = -fL.x, Lh = d.L * 0.42, Bh = d.B * 0.42, H = (ax, az) => M.hoeheBei(_p.set(l.x + ax, l.y, l.z + az)), h0 = H(0, 0), hB = H(fL.x * Lh, fL.z * Lh), hH = H(-fL.x * Lh, -fL.z * Lh), hL = H(sx * Bh, sz * Bh), hR = H(-sx * Bh, -sz * Bh);
        const k = d.L > 100 ? 0.45 : d.L > 30 ? 0.75 : 1, zH = (h0 * 2 + hB + hH + hL + hR) / 6 * k - 0.0, zP = Math.atan2(hB - hH, Lh * 2) * (d.L > 100 ? 0.8 : 0.9), zR = Math.atan2(hL - hR, Bh * 2) * (d.L > 100 ? 0.5 : 0.65), kk = d.L > 100 ? 0.45 : 3.6, cc = d.L > 100 ? 1.1 : 2.8;
        s.vHeave += (kk * (zH - s.heave) - cc * s.vHeave) * dt; s.heave += s.vHeave * dt; s.vPitch += (kk * (zP - s.pitch) - cc * s.vPitch) * dt; s.pitch += s.vPitch * dt; s.vRoll += (kk * 0.7 * (zR - s.roll) - cc * 0.7 * s.vRoll) * dt; s.roll += s.vRoll * dt;
      }
      const lin = new THREE.Vector3().crossVectors(e.oben, f).normalize(), qE = _q.setFromRotationMatrix(_m.makeBasis(lin, e.oben, f));
      s.modell.quaternion.copy(W.zuLokal).multiply(qE).multiply(_qr.setFromEuler(_e.set(-s.pitch, 0, s.roll - dreh * (d.gross ? 3 : 0.8), 'XYZ')));
      s.modell.position.addScaledVector(_w.copy(e.oben).applyQuaternion(W.zuLokal), s.heave); s.modell.visible = weit < (hA > 4000 ? 130000 : 62000); s.modell.updateMatrixWorld();
      if (s.teile.radar) s.teile.radar.rotation.y += dt * 2.4;
      // Rauch
      if (s.rauch && weit < 5000 && this.effekte && (s.rauchT -= dt) < 0) { s.rauchT = 0.34; s.rauch.getWorldPosition(_p); const lw = _w.copy(f).applyQuaternion(W.zuLokal); this.effekte.qualm(_p.x, _p.y, _p.z, lw.x * s.v * 0.75, lw.z * s.v * 0.75, 0.2, d.L > 100 ? 2.4 : 0.8, true); }
      // Spur: alle paar Meter ein Punkt in ECEF
      s.seit += s.v * dt; const schritt = kl(d.L / 6, 3, 42);
      if (!s.spur.length) { const cl = Math.cos(s.lat * D2R); for (let i = 0; i < 46; i++) { const a = i * schritt; s.spur.push(geoZuSzene(s.lat - Math.cos(s.kurs) * a / 111000, s.lon - Math.sin(s.kurs) * a / (111000 * cl), 0, new THREE.Vector3())); } }
      if (s.seit > schritt) { s.seit = 0; const q = geoZuSzene(s.lat, s.lon, 0, new THREE.Vector3()); s.spur.unshift(q); if (s.spur.length > 46) s.spur.pop(); }
      this.spurBand(s, l, f);
    }
    this.spielerSpur(dt);
    this.spurenZeichnen(camera, hA, amMeer, blick);
  }
  // Kielwasser des eigenen Boots (Wunsch Nr. 64): wie ein kleines Schiff, gleiche Spur und gleiches Band. boot.F ist das Fahrzeug aus kit/wasserfahrt.js oder null
  spielerSpur(dt) {
    const B = this.boot; if (!B) return; const s = B.s; if (!B.F) { if (s.band) s.band.visible = false; s.spur.length = 0; s.v = 0; return; }
    const F = B.F, g = F.geo, e = enu(g.lat, g.lon), f = _f2.copy(e.nord).multiplyScalar(Math.cos(F.kursR)).addScaledVector(e.ost, Math.sin(F.kursR)), l = this.welt.geoZuLokal(g.lat, g.lon, g.h, _l2);
    s.d = F.d.spurD ||= { L: F.d.L * 1.3, B: F.d.L * 0.32, v: F.d.vMax * 0.55 }; s.v = Math.abs(F.vF); s.seit += s.v * dt; const schritt = kl(s.d.L / 2, 1.5, 8), q = geoZuSzene(g.lat, g.lon, 0, new THREE.Vector3());
    if (!s.spur.length) s.spur.push(q); else if (s.seit > schritt) { s.seit = 0; s.spur.unshift(q); if (s.spur.length > 46) s.spur.pop(); }
    this.spurBand(s, l, f);
  }
  // Band entlang des Weges: Vorn der Bug, dann die Mitte, dann die gemerkten Punkte. Breite wächst mit dem Keil
  spurBand(s, l, f) {
    const W = this.welt, d = s.d, N = 48;
    if (!s.band) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array((N + 1) * 2 * 4), 4)); g.setAttribute('aK', new THREE.BufferAttribute(new Float32Array((N + 1) * 2), 1)); const idx = []; for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx); s.band = new THREE.Mesh(g, this.spurMat); s.band.frustumCulled = false; this.spurSz.add(s.band); }
    const P = s.band.geometry.attributes.position, A = s.band.geometry.attributes.aS; const fL = _w.copy(f).applyQuaternion(W.zuLokal), fx = fL.x, fz = fL.z; const fn = Math.hypot(fx, fz) || 1;
    const bug = [l.x + fx / fn * d.L * 0.5, l.z + fz / fn * d.L * 0.5]; const pts = [bug, [l.x + fx / fn * d.L * 0.1, l.z + fz / fn * d.L * 0.1]]; for (const q of s.spur) { const v = W.weltZuLokal(q, _p); pts.push([v.x, v.z]); } let n = Math.min(N + 1, pts.length); if (n < 2) return;
    let a = 0, nx = 0, nz = 1; const stark = kl(s.v / d.v, 0, 1) * 1;
    for (let i = 0; i < N + 1; i++) {
      const k = Math.min(i, n - 1), p = pts[k], q = pts[Math.min(k + 1, n - 1)], o = pts[Math.max(k - 1, 0)]; let dx = q[0] - o[0], dz = q[1] - o[1], ll = Math.hypot(dx, dz); if (ll > 1e-3) { nx = -dz / ll; nz = dx / ll; }
      if (i > 0 && i < n) a += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); const breit = d.B * 0.65 + a * 0.42 + 6;
      P.setXYZ(i * 2, p[0] + nx * breit, l.y, p[1] + nz * breit); P.setXYZ(i * 2 + 1, p[0] - nx * breit, l.y, p[1] - nz * breit); A.setXYZW(i * 2, a, breit, d.L, d.B); A.setXYZW(i * 2 + 1, a, -breit, d.L, d.B);
    }
    const AK = s.band.geometry.attributes.aK; AK.array.fill(stark); AK.needsUpdate = true; P.needsUpdate = true; A.needsUpdate = true; s.band.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6)); s.band.visible = stark > 0.02;
  }
  spurenZeichnen(camera, hA, amMeer, blick) {
    const r = this.renderer, u = MEER_U, H = 3000; if (!this.liste.length && !this.boot?.F) { u.uSpurN.value.w = 0; u.uSpurF.value.w = 0; return; }
    const alt = r.getRenderTarget(), autoC = r.autoClear, col = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(); r.autoClear = true; r.setClearColor(0x000000, 0.5);
    const zeichne = (rt, hb, cx, cy, cz) => { const c = this.spurCam; c.position.set(cx, cy + 2e5, cz); c.lookAt(cx, cy, cz); c.left = -hb; c.right = hb; c.top = hb; c.bottom = -hb; c.updateProjectionMatrix(); c.updateMatrixWorld(); r.setRenderTarget(rt); r.setClearColor(0x000000, 0.5); r.clear(); r.render(this.spurSz, c); };
    const c = camera.position, sn = 3, rn = this.rtN.width, hN = kl(hA * 6, 220, 1400), hF = kl(hA * 6, 3000, 40000), sx = hN * 2 / rn, cx = Math.round(c.x / sx) * sx, cz = Math.round(c.z / sx) * sx, sf = hF * 2 / rn, fx = Math.round(c.x / sf) * sf, fz = Math.round(c.z / sf) * sf;
    zeichne(this.rtN, hN, cx, c.y, cz); u.uSpurN.value.set(cx, cz, 1 / (2 * hN), 1);
    zeichne(this.rtF, hF, fx, c.y, fz); u.uSpurF.value.set(fx, fz, 1 / (2 * hF), 1);
    r.setRenderTarget(alt); r.autoClear = autoC; r.setClearColor(col, ca);
  }
  // Spiegelbild der nahen Schiffe, unmittelbar vor dem Bild: Kamera an der Wasserfläche gespiegelt, alles unter Wasser abgeschnitten (schräge Nahebene nach Lengyel), halbe Auflösung
  spiegelRendern(scene, camera, hA) {
    const u = MEER_U; u.uSpiegelAn.value = 0; if (!this.rtS || !this.an || hA > 500 || !u.tMeerDetail.value) return;
    let nah = false; const cp = camera.position; for (const s of this.liste) if (s.modell?.visible && s.modell.position.distanceToSquared(cp) < 9e6) { nah = true; break; } if (!nah) return;
    const M = u.uMeerMitte.value, n = this.meer.U.uMeerUp.value, v = this.camS, sp = (a, out) => out.copy(a).addScaledVector(n, -2 * a.dot(n));
    const d = _a.copy(cp).sub(M).dot(n); v.position.copy(cp).addScaledVector(n, -2 * d);
    camera.getWorldDirection(_b); sp(_b, _c); _d.setFromMatrixColumn(camera.matrixWorld, 1); sp(_d, v.up); v.lookAt(_a.copy(v.position).add(_c)); v.updateMatrixWorld(true); v.matrixWorldInverse.copy(v.matrixWorld).invert();
    v.projectionMatrix.copy(camera.projectionMatrix); v.projectionMatrixInverse.copy(camera.projectionMatrixInverse); v.near = camera.near; v.far = camera.far;
    u.uSpiegelVP.value.multiplyMatrices(v.projectionMatrix, v.matrixWorldInverse);
    // Nahebene auf die Wasserfläche legen
    _pl.setFromNormalAndCoplanarPoint(n, M).applyMatrix4(v.matrixWorldInverse); const c = _v4.set(_pl.normal.x, _pl.normal.y, _pl.normal.z, _pl.constant), P = v.projectionMatrix.elements;
    _q4.x = (Math.sign(c.x) + P[8]) / P[0]; _q4.y = (Math.sign(c.y) + P[9]) / P[5]; _q4.z = -1; _q4.w = (1 + P[10]) / P[14]; c.multiplyScalar(2 / c.dot(_q4)); P[2] = c.x; P[6] = c.y; P[10] = c.z + 1 - 0.003; P[14] = c.w;
    const r = this.renderer, alt = r.getRenderTarget(), auto = r.shadowMap.autoUpdate, cc = r.getClearColor(_cf), ca = r.getClearAlpha(), bg = scene.background, autoC = r.autoClear, rw = Math.round(540 * camera.aspect);
    if (this.rtS.width !== rw) this.rtS.setSize(rw, 540);
    r.shadowMap.autoUpdate = false; r.setRenderTarget(this.rtS); r.setClearColor(0x000000, 0); r.autoClear = true; scene.background = null; r.clear(); r.render(scene, v);
    scene.background = bg; r.setRenderTarget(alt); r.setClearColor(cc, ca); r.autoClear = autoC; r.shadowMap.autoUpdate = auto; u.uSpiegelAn.value = 1;
  }
  // Gangway eines liegenden Kreuzers: überdachte Brücke von der Tür auf Deck 4 zum Kai. Seite aus der Lage der Küste
  kaiSeite(s) { const h = s.fahrplan?.hafen; if (!h?.land) return 1; const k = s.kurs, lx = -Math.cos(k), ly = Math.sin(k), d = h.land[0] * lx + h.land[1] * ly; return d >= 0 ? 1 : -1; }
  gangwaySetzen(s, an, hKai = 2.5) {
    if (!an) { if (s.gang) s.gang.visible = false; return; }
    const sg = this.kaiSeite(s); if (!s.gang || s.gangSg !== sg) { if (s.gang) s.modell.remove(s.gang); const g = s.gang = new THREE.Group(); s.gangSg = sg; const ab = s.abGemessen || s.fahrplan?.hafen?.ab || 26, LA = Math.max(8, ab + 5.5 - 18.2), x0 = sg * 18.2, x1 = sg * (18.2 + LA), z = 2, y0 = 6.0, y1 = hKai + 0.2, mat = new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.5, metalness: 0.3 }), dach = new THREE.MeshStandardMaterial({ color: 0x24527a, roughness: 0.6 }), glas = new THREE.MeshStandardMaterial({ color: 0x9fc4d4, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), box = (sy, sz, m, oy, oz = 0) => { const M = new THREE.Mesh(new THREE.BoxGeometry(L, sy, sz), m); M.position.set((x0 + x1) / 2, (y0 + y1) / 2 + oy, z + oz); M.rotation.z = Math.atan2(dy, dx); M.castShadow = m !== glas; g.add(M); return M; }; box(0.14, 2.4, mat, 0); box(0.1, 2.5, dach, 2.5); box(2.4, 0.03, glas, 1.25, 1.2); box(2.4, 0.03, glas, 1.25, -1.2); box(0.1, 0.06, mat, 1.1, 1.2); box(0.1, 0.06, mat, 1.1, -1.2);
      for (const k of [0.33, 0.66]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1, 10), mat); const yy = y0 + dy * k, x = x0 + dx * k; st.scale.y = yy + 0.5; st.position.set(x, (yy - 0.5) / 2, z); g.add(st); } s.modell.add(g); }
    s.gang.visible = true;
  }
  gangFuss(s, out = {}) { const sg = s.gangSg ?? this.kaiSeite(s), x = sg * ((s.abGemessen || s.fahrplan?.hafen?.ab || 26) + 8), z = 2, k = s.kurs, f = [Math.sin(k), Math.cos(k)], l = [-Math.cos(k), Math.sin(k)], o = l[0] * x + f[0] * z, n = l[1] * x + f[1] * z; out.lat = s.lat + n / 111320; out.lon = s.lon + o / (111320 * Math.cos(s.lat * D2R)); out.sg = sg; return out; }
  info() { return this.liste.map(s => `${s.id}${s.modell ? '' : '…'}`).join(' '); }
}
const _p = new THREE.Vector3(), _qr = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _pl = new THREE.Plane(), _v4 = new THREE.Vector4(), _q4 = new THREE.Vector4(), _cf = new THREE.Color();
