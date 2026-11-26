// Kreuzer AURORA, begehbar (05.11.2026, Nader: "extrem detailliert ... mit Räumlichkeiten", "als Mensch raufgehen ... die Reise mit antreten", "ganz vielen Räumen und maßstabsgetreu wie ein echter Kreuzer").
// Modelle aus tools/blender/kreuzer_innen.py: je Deck ein Modell mit gebackenem Licht, Kabinen als Module, Plan mit Kollision, Treppen, Räumen und Wegen.
// Die Figur läuft im Rahmen des Schiffs (Kind des Modells): x links, y oben, z vorn. Kamera ebenfalls dort, dadurch fährt man ruckfrei mit. Decks erst laden, wenn man an Bord ist.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Figur } from './player.js';
import { spawn } from './people.js';

const BASIS = new URL('../assets/ships/kreuzer/', import.meta.url);
export const Z = d => 6 + 3 * (d - 4);
const DMIN = 4, DMAX = 16, TUERME = [-72, 22, 72], RUN = 2.8, LAND = 1.6, HB = 2.05, RADIUS = 0.27, KAB_TUER = 0.75;
const DECKNAMEN = { 4: 'Einschiffung, Kabinen, Krankenstation', 5: 'Atrium, Geschäfte, Restaurant', 6: 'Theater, Casino, Restaurant', 7: 'Promenade, Bibliothek, Nachtclub, Kino', 8: 'Kinderclub, Konferenz, Kapelle', 9: 'Kabinen', 10: 'Kabinen', 11: 'Kabinen', 12: 'Kabinen', 13: 'Kabinen', 14: 'Kabinen, Brücke', 15: 'Pooldeck, Spa, Buffet', 16: 'Sonnendeck, Aussichtslounge' };
const MAT = { teppich_flur: [1.6], teppich_lounge: [2.4], teppich_casino: [1.3], teppich_theater: [2.0], teppich_kabine: [1.0], marmor: [4.0, 0.62], parkett: [2.0, 0.4], teak: [2.0], fliese: [0.6, 0.6], mosaik: [0.4, 0.3], holz: [2.4, 0.12], holz_hell: [2.4, 0.12], wand: [1.2], decke: [1.2], stoff: [0.5], metall: [1.0, 0.5], leder: [0.5, 0.2], buecher: [1.2], kunst: [1.0] };
const _lader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), _tex = new THREE.TextureLoader();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _i = new THREE.Matrix4(), _o = new THREE.Vector3();

const VS = `varying vec2 vUv; varying vec3 vC, vL, vN; uniform mat4 uZuSchiff;
  void main() { vUv = uv; vC = color.rgb; vec4 p = vec4(position, 1.0); vec3 n = normal;
    #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
    #endif
    vec4 w = modelMatrix * p; vL = (uZuSchiff * w).xyz; vN = mat3(uZuSchiff) * mat3(modelMatrix) * n; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `varying vec2 vUv; varying vec3 vC, vL, vN; uniform sampler2D map; uniform float uTile, uGlanz, uHell; uniform vec3 uKamL;
  void main() {
    vec3 alb = texture2D(map, vUv / uTile).rgb, licht = vC * vC * 2.0, c = alb * licht * uHell;
    if (uGlanz > 0.0) {   // Glanz: Decke und Leuchten spiegeln sich im polierten Boden
      vec3 N = normalize(vN), V = normalize(uKamL - vL), R = reflect(-V, N); float nv = clamp(dot(N, V), 0.0, 1.0), F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
      if (N.y > 0.7 && R.y > 0.05) { vec2 h = vL.xz + R.xz * (2.5 / R.y), q = fract(h / 2.6) - 0.5; float sp = smoothstep(0.3, 0.03, length(q)) * smoothstep(0.5, 0.75, uGlanz); c = mix(c, licht * uHell * (0.5 + 0.7 * sp), F * uGlanz); }
      else if (abs(N.y) < 0.5) c += licht * uHell * F * 0.35 * uGlanz;
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const FS_LEUCHTE = `varying vec3 vC; uniform float uHell; void main() { vec3 t = vC * vC * 2.0; gl_FragColor = vec4(t * 3.2 * uHell, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const FS_GLAS = `varying vec3 vL, vN; uniform vec3 uKamL; uniform float uHell; void main() { vec3 N = normalize(vN), V = normalize(uKamL - vL); float nv = abs(dot(N, V)), F = 0.05 + 0.95 * pow(1.0 - nv, 5.0); gl_FragColor = vec4(mix(vec3(0.02, 0.03, 0.035), vec3(0.9, 0.95, 1.0) * uHell, F), 0.07 + 0.75 * F);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Kollision und Höhen eines Decks: Segmente in einem Raster aus 2 m Zellen
class Deckplan {
  constructor(p, mod) {
    this.p = p; const liste = []; for (let i = 0; i < p.segs.length; i += 4) liste.push(p.segs[i], p.segs[i + 1], p.segs[i + 2], p.segs[i + 3]);
    this.kabinen = (p.kabinen || []).map(([typ, x, z, sg]) => ({ typ, x, z, sg, tx: x, tz: z - KAB_TUER, offen: 0 }));
    for (const k of this.kabinen) { const m = mod[`kabine_${k.typ}`]; if (!m) continue; const S = m.segs; for (let i = 0; i < S.length; i += 2) { liste.push(k.x + k.sg * S[i], k.z + S[i + 1]); } }
    this.segs = new Float32Array(liste); this.raster = new Map();
    for (let i = 0; i < this.segs.length; i += 4) { const a = this.segs[i], b = this.segs[i + 1], c = this.segs[i + 2], d = this.segs[i + 3], x0 = Math.floor((Math.min(a, c) - 0.5) / 2), x1 = Math.floor((Math.max(a, c) + 0.5) / 2), z0 = Math.floor((Math.min(b, d) - 0.5) / 2), z1 = Math.floor((Math.max(b, d) + 0.5) / 2); for (let X = x0; X <= x1; X++) for (let Y = z0; Y <= z1; Y++) { const k = X * 4096 + Y, L = this.raster.get(k); if (L) L.push(i); else this.raster.set(k, [i]); } }
    this.raeume = p.raeume || []; this.rampen = p.rampen || []; this.wege = p.wege || [];
    // Wege als Graph (Punkte in der Nähe zusammen)
    const K = this.knoten = [], finde = (x, z) => { for (let i = 0; i < K.length; i++) if (Math.hypot(K[i].x - x, K[i].z - z) < 0.9) return i; K.push({ x, z, n: [] }); return K.length - 1; };
    for (const w of this.wege) { let v = -1; for (const [x, z] of w) { const i = finde(x, z); if (v >= 0 && v !== i) { if (!K[v].n.includes(i)) K[v].n.push(i); if (!K[i].n.includes(v)) K[i].n.push(v); } v = i; } }
  }
  raum(x, z) { for (const r of this.raeume) if (x >= r[1] && x <= r[3] && z >= r[2] && z <= r[4]) return r[0]; return null; }
}
export class BordKollision {
  constructor() { this.plaene = {}; this.deck = 4; this.h = Z(4); this.imSchacht = false; this.beiDeck = null; }
  get plan() { return this.plaene[this.deck]; }
  setze(deck, h = null) { this.deck = deck; this.h = h ?? Z(deck); this.imSchacht = false; }
  schritt(x, z, nx, nz) {
    const P = this.plan; if (!P) return [nx, nz]; let px = nx, pz = nz; const S = P.segs, r = RADIUS;
    for (let it = 0; it < 3; it++) {
      const X0 = Math.floor((px - r) / 2), X1 = Math.floor((px + r) / 2), Y0 = Math.floor((pz - r) / 2), Y1 = Math.floor((pz + r) / 2); let bewegt = false;
      for (let X = X0; X <= X1; X++) for (let Y = Y0; Y <= Y1; Y++) { const L = P.raster.get(X * 4096 + Y); if (!L) continue;
        for (const i of L) { const a = S[i], b = S[i + 1], c = S[i + 2], d = S[i + 3], dx = c - a, dz = d - b, l2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((px - a) * dx + (pz - b) * dz) / l2)), qx = a + dx * t, qz = b + dz * t, ex = px - qx, ez = pz - qz, e2 = ex * ex + ez * ez; if (e2 < r * r && e2 > 1e-9) { const e = Math.sqrt(e2), k = (r - e) / e; px += ex * k; pz += ez * k; bewegt = true; } } }
      if (!bewegt) break;
    }
    return [px, pz];
  }
  hoehe(x, z) {
    const y = -z;
    if (Math.abs(x) < HB) for (const yt of TUERME) { const ya = yt - 1, y1 = ya + RUN, y2 = y1 + LAND; if (y > ya && y < y2) {
      let best = this.h, bd = 1e9, dk = this.deck;
      for (let n = DMIN; n < DMAX; n++) { const b = Z(n), h = y >= y1 ? b + 1.5 : x >= 0 ? b + 1.5 * (y - ya) / RUN : b + 3 - 1.5 * (y - ya) / RUN, d = Math.abs(h - this.h); if (d < bd) { bd = d; best = h; dk = n; } }
      this.h = best; this.imSchacht = true; if (dk !== this.deck) { this.deck = dk; this.beiDeck?.(dk); } return best;
    } }
    if (this.imSchacht) { this.imSchacht = false; const d = Math.max(DMIN, Math.min(DMAX, Math.round((this.h - 6) / 3) + 4)); if (d !== this.deck) { this.deck = d; this.beiDeck?.(d); } }
    let h = Z(this.deck); const P = this.plan;
    if (P) for (const r of P.rampen) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) { h = r[4] + (r[5] - r[4]) * (z - r[1]) / Math.max(1e-3, r[3] - r[1]); break; }
    this.h = h; return h;
  }
  sicht(x0, z0, x1, z1) {
    const P = this.plan; if (!P) return 1; const S = P.segs, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / 1.5)); let t = 1; const ges = new Set();
    for (let k = 0; k <= n; k++) { const X = Math.floor((x0 + dx * k / n) / 2), Y = Math.floor((z0 + dz * k / n) / 2); for (const q of P.raster.get(X * 4096 + Y) || []) { if (ges.has(q)) continue; ges.add(q); const a = S[q], b = S[q + 1], ex = S[q + 2] - a, ez = S[q + 3] - b, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue; const u = ((a - x0) * ez - (b - z0) * ex) / den, v = ((a - x0) * dz - (b - z0) * dx) / den; if (u > 0 && u < t && v >= -0.02 && v <= 1.02) t = u; } }
    return t;
  }
  frei(x, z) { return true; }
}

export class Kreuzer {
  constructor({ renderer, mobil = false, hud = null, beiAussteigen = null, fahrplan = null, uhrWeiter = null }) {
    this.fahrplan = fahrplan; this.uhrWeiter = uhrWeiter; this.raffer = 1; this.renderer = renderer; this.mobil = mobil; this.hudApi = hud; this.beiAussteigen = beiAussteigen; this.schiff = null; this.an = false; this.decks = {}; this.laedt = {}; this.plan = null; this.bereit = null; this.kol = new BordKollision(); this.kol.beiDeck = d => this.deckGewechselt(d);
    this.U = { uHell: { value: 0.86 }, uKamL: { value: new THREE.Vector3() }, uZuSchiff: { value: new THREE.Matrix4() } }; this.mats = {}; this.tex = {};
    this.wurzel = new THREE.Group(); this.wurzel.name = 'kreuzer_innen'; this.drinnen = 1; this.yaw = 0; this.pitch = 0.12; this.dist = 3.0; this.distZiel = 3.0; this.ersteP = false; this.kamP = new THREE.Vector3(); this.kamZ = new THREE.Vector3(); this.frisch = true; this.tKab = 0; this.raumName = ''; this.menue = null; this.hinweis = ''; this.nah = null;
    this.instanzen = {}; this.tuerenMesh = null; this.leute = null; this.reiseText = '';
  }
  material(name) {
    if (this.mats[name]) return this.mats[name]; let m; const po = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
    if (name === 'leuchte') m = new THREE.ShaderMaterial({ uniforms: { uHell: this.U.uHell, uZuSchiff: this.U.uZuSchiff }, vertexShader: VS, fragmentShader: FS_LEUCHTE, vertexColors: true, ...po });
    else if (name === 'glas') m = new THREE.ShaderMaterial({ uniforms: { uHell: this.U.uHell, uKamL: this.U.uKamL, uZuSchiff: this.U.uZuSchiff }, vertexShader: VS, fragmentShader: FS_GLAS, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    else { const d = MAT[name] || [1], t = this.tex[name] ||= _tex.load(new URL(`${name}${this.mobil ? '_h' : ''}.webp`, BASIS).href, x => { x.needsUpdate = true; }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false;
      m = new THREE.ShaderMaterial({ uniforms: { map: { value: t }, uTile: { value: d[0] }, uGlanz: { value: d[1] || 0 }, uHell: this.U.uHell, uKamL: this.U.uKamL, uZuSchiff: this.U.uZuSchiff }, vertexShader: VS, fragmentShader: FS, vertexColors: true, ...po }); }
    m.name = name; return this.mats[name] = m;
  }
  laden() {
    return this.bereit ||= (async () => {
      this.plan = await (await fetch(new URL('plan.json', BASIS))).json();
      const mod = {}; for (const k of Object.keys(this.plan)) if (k.startsWith('kabine_')) mod[k] = { segs: this.plan[k].segs };
      // Segmente der Module als Paare in Schiffsrichtung: x nach außen, z entlang (bereits gespiegelt nach glTF)
      for (const k of Object.keys(this.plan)) if (k.startsWith('deck')) this.kol.plaene[+k.slice(4)] = new Deckplan(this.plan[k], mod);
      for (const typ of ['balkon', 'innen', 'luke']) await this.modulLaden(typ);
      this.tuerenBauen();
    })();
  }
  async modulLaden(typ) {
    const g = await _lader.loadAsync(new URL(`kabine_${typ}.glb`, BASIS).href); g.scene.updateMatrixWorld(true); const E = this.instanzen[typ] = { plus: [], minus: [] };
    g.scene.traverse(o => {
      if (!o.isMesh) return; const G = o.geometry, n = G.attributes.position.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(G.attributes.position, i).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; v.fromBufferAttribute(G.attributes.normal, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; }
      const baue = sg => { const H = new THREE.BufferGeometry(), Q = P.slice(), M = N.slice(); if (sg < 0) for (let i = 0; i < n; i++) { Q[i * 3] = -Q[i * 3]; M[i * 3] = -M[i * 3]; } H.setAttribute('position', new THREE.BufferAttribute(Q, 3)); H.setAttribute('normal', new THREE.BufferAttribute(M, 3)); H.setAttribute('uv', G.attributes.uv); H.setAttribute('color', G.attributes.color); const I = Array.from(G.index.array); if (sg < 0) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } H.setIndex(I); const IM = new THREE.InstancedMesh(H, this.material(o.material.name), 48); IM.frustumCulled = false; IM.count = 0; IM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.wurzel.add(IM); return IM; };
      E.plus.push(baue(1)); E.minus.push(baue(-1));
    });
  }
  tuerenBauen() {
    const G = new THREE.BoxGeometry(0.045, 2.04, 0.84); G.translate(0, 1.02, 0.42); const n = G.attributes.position.count, C = new Float32Array(n * 3); for (let i = 0; i < n; i++) { C[i * 3] = 0.42; C[i * 3 + 1] = 0.36; C[i * 3 + 2] = 0.3; } G.setAttribute('color', new THREE.BufferAttribute(C, 3));
    this.tuerenMesh = new THREE.InstancedMesh(G, this.material('holz'), 260); this.tuerenMesh.frustumCulled = false; this.tuerenMesh.count = 0; this.tuerenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.wurzel.add(this.tuerenMesh);
  }
  deckLaden(n) {
    if (this.decks[n]) return Promise.resolve(this.decks[n]); return this.laedt[n] ||= _lader.loadAsync(new URL(`deck${n}.glb`, BASIS).href).then(g => {
      g.scene.traverse(o => { if (o.isMesh) { o.material = this.material(o.material.name); o.frustumCulled = false; } }); g.scene.visible = false; this.wurzel.add(g.scene); this.decks[n] = g.scene; this.schiebeBauen(n); this.sichtbarkeit(); return g.scene;
    }).catch(e => { console.warn('Deck', n, e); return null; });
  }
  // Schiebetüren aus Glas nach draußen: öffnen sich, wenn jemand kommt
  schiebeBauen(n) {
    const p = this.plan[`deck${n}`], L = p?.tueren; if (!L?.length) return; const g = new THREE.Group(); g.name = 'schiebe' + n; const y = Z(n), gl = this.material('glas'), me = this.material('metall'); const mk = (x, z, sx, sz) => { const G = new THREE.BoxGeometry(sx, 2.3, sz); G.translate(0, 1.15, 0); const n_ = G.attributes.position.count; G.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n_ * 3).fill(0.6), 3)); const M = new THREE.Mesh(G, gl); M.position.set(x, y, z); M.frustumCulled = false; return M; }; this.schiebe ||= {}; const E = this.schiebe[n] = [];
    for (const [x, z, br, quer] of L) { const a = quer ? mk(x, z - br / 4, 0.03, br / 2) : mk(x - br / 4, z, br / 2, 0.03), b = quer ? mk(x, z + br / 4, 0.03, br / 2) : mk(x + br / 4, z, br / 2, 0.03); g.add(a, b); E.push({ x, z, br, quer, a, b, ax: a.position.clone(), bx: b.position.clone(), k: 0 }); } this.decks[n]?.add(g);
  }
  schiebeTick(dt) { const E = this.schiebe?.[this.kol.deck], F = this.figur; if (!E || !F) return; for (const t of E) { const nah = (t.x - F.pos.x) ** 2 + (t.z - F.pos.z) ** 2 < 11 ? 1 : 0; if (t.k === nah) continue; t.k += Math.sign(nah - t.k) * Math.min(Math.abs(nah - t.k), dt * 2.4); const s = t.k * t.br * 0.46; if (t.quer) { t.a.position.z = t.ax.z - s; t.b.position.z = t.bx.z + s; } else { t.a.position.x = t.ax.x - s; t.b.position.x = t.bx.x + s; } } }
  sichtbarkeit() { const d = this.kol.deck, at = d >= 5 && d <= 8; for (const k in this.decks) { const n = +k; this.decks[k].visible = Math.abs(n - d) <= 1 || (at && n >= 5 && n <= 8); } }
  deckGewechselt(d) { this.sichtbarkeit(); this.tuerenSetzen(); this.tKab = 0; this.leuteVerteilen(); }
  async betreten({ schiff, quelle, bewegungen, deck = 4, x = 12.5, z = 2, ry = 0 }) {
    await this.laden(); this.schiff = schiff; this.quelle = quelle; this.bewegungen = bewegungen; this.kol.setze(deck);
    await this.deckLaden(deck); for (const d of [deck - 1, deck + 1]) if (d >= DMIN && d <= DMAX) await this.deckLaden(d);
    schiff.modell.add(this.wurzel); this.wurzel.visible = true; this.an = true; schiff.anBord = true;
    this.figur = new Figur({ quelle, bewegungen, kollision: this.kol, start: { x, z, ry } }); this.wurzel.add(this.figur.obj); this.yaw = ry + Math.PI; this.pitch = 0.1; this.frisch = true; this.dist = this.distZiel = this.mobil ? 3.4 : 3.0;
    this.sichtbarkeit(); this.tuerenSetzen(); this.hudZeigen(true); this.tKab = 0;
    (async () => { for (let d = DMIN; d <= DMAX; d++) if (this.an) await this.deckLaden(d); })();
    this.leuteStarten();
  }
  verlassen() {
    if (!this.an) return; this.an = false; this.figur?.entfernen(); this.figur = null; this.leuteStoppen(); if (this.schiff) { this.schiff.modell.remove(this.wurzel); this.schiff.anBord = false; this.schiff = null; } this.hudZeigen(false); this.menueSchliessen();
  }
  figurWelt(out) { return this.figur ? out.copy(this.figur.bildPos).applyMatrix4(this.wurzel.matrixWorld) : out.set(0, 0, 0); }
  // Türen des Decks: alle zu, nahe öffnen sich zum Flur hin von selbst
  tuerenSetzen() {
    const P = this.kol.plan, I = this.tuerenMesh; if (!P || !I) return; let n = 0;
    for (const k of P.kabinen) { if (n >= 260) break; const y = Z(this.kol.deck); _e.set(0, (k.offen || 0) * 1.45 * k.sg, 0); _q.setFromEuler(_e); _m.compose(_a.set(k.x, y, k.tz + 0.43), _q, _s.set(1, 1, 1)); _m.multiply(_i.makeTranslation(0, 0, -0.84)); I.setMatrixAt(n++, _m); }
    I.count = n; I.instanceMatrix.needsUpdate = true;
  }
  kabinenSetzen() {
    const P = this.kol.plan, F = this.figur; if (!P || !F) return; const zaehl = {}; for (const t in this.instanzen) { zaehl[t] = { plus: 0, minus: 0 }; }
    const y = Z(this.kol.deck), R2 = 15 * 15; let tuerNeu = false;
    for (const k of P.kabinen) { const dx = k.x - F.pos.x, dz = k.z - F.pos.z; if (dx * dx + dz * dz > R2 * (Math.abs(dx) < 11 ? 1.3 : 1)) { continue; } const E = this.instanzen[k.typ]; if (!E) continue; const s = k.sg > 0 ? 'plus' : 'minus', c = zaehl[k.typ]; if (c[s] >= 48) continue; _m.makeTranslation(k.x, y, k.z); for (const IM of E[s]) IM.setMatrixAt(c[s], _m); c[s]++; }
    for (const t in this.instanzen) for (const s of ['plus', 'minus']) for (const IM of this.instanzen[t][s]) { IM.count = zaehl[t][s]; IM.visible = IM.count > 0; IM.instanceMatrix.needsUpdate = true; }
  }
  tick(dt, { achse, rennen, springen, b, e, kamera, zeit }) {
    const F = this.figur; if (!F || !this.an) return;
    // Zeitraffer: die Fahrt läuft schneller, kurz vor dem Hafen wieder normal
    if (zeit) this.rafferStufe();
    if (this.fahrplan && this.schiff?.plan && this.raffer > 1) { const st = this.schiff.fahrplan; let f = this.raffer; if (!st.liegt) { if (st.bisKm < 6) f = 1; else if (st.bisKm < 45) f = Math.min(f, 30); } else f = Math.min(f, 60); const adv = this.fahrplan.vorruecken(dt, f); if (adv) this.uhrWeiter?.(adv / 3600); if (st.bisKm < 6 && !st.liegt && this.raffer > 1) { this.raffer = 1; this.rafferText(); } }
    if (this.menue) { this.menueTick(e, achse, dt); achse = _achNull; springen = false; e = false; }
    if (b.x || b.y) { this.yaw -= b.x * 0.0045; this.pitch = THREE.MathUtils.clamp(this.pitch + b.y * 0.0045, -0.7, 1.15); }
    if (b.rad) this.distZiel = THREE.MathUtils.clamp(this.distZiel * (1 + b.rad * 0.0012), 1.4, 7);
    if (kamera) this.ersteP = !this.ersteP;
    F.update(dt, achse, this.yaw + Math.PI, rennen, springen);
    // Türen
    if ((this.tTuer = (this.tTuer || 0) - dt) < 0) { this.tTuer = 0.05; const P = this.kol.plan; let aend = false; if (P) for (const k of P.kabinen) { const dx = k.tx - F.pos.x, dz = k.tz - F.pos.z, nah = dx * dx + dz * dz < 2.9, z = nah ? 1 : 0; if (k.offen !== z) { const v = (k.offen || 0) + Math.sign(z - (k.offen || 0)) * 0.12; k.offen = Math.abs(v - z) < 0.13 ? z : v; aend = true; } } if (aend) this.tuerenSetzen(); }
    if ((this.tKab -= dt) <= 0) { this.tKab = 0.3; this.kabinenSetzen(); this.umgebung(); }
    // Bedienen
    if (e && this.nah) this.nah.tu();
    this.leuteTick(dt); this.schiebeTick(dt);
    this.drinnen += ((this.istDraussen(F.pos.x, F.pos.z) ? 0 : 1) - this.drinnen) * (1 - Math.exp(-dt * 4));
  }
  istDraussen(x, z) { const d = this.kol.deck, y = -z; if (d === 16) return !(Math.abs(x) < 10.8 && y > -84 && y < -34.5) && !(Math.abs(x) < 8.05 && ((y > 12 && y < 32) || (y > 62 && y < 82))); if (d === 15) return y > -30 && y < 58 && !(Math.abs(x) < 8.05 && y > 12 && y < 32); if (d === 7) return Math.abs(x) > 15.45; if (d >= 9 && d <= 14) return Math.abs(x) > 16.6; return false; }
  umgebung() {
    const F = this.figur, P = this.kol.plan; if (!P) return; const name = P.raum(F.pos.x, F.pos.z) || (this.kol.imSchacht ? 'Treppe' : (Math.abs(F.pos.x) > 15.45 && this.kol.deck === 7 ? 'Promenade' : (Math.abs(F.pos.x) > 9.7 ? 'Kabine' : (Math.abs(F.pos.x) < 8 ? 'Kabine' : 'Flur'))));
    if (name !== this.raumName || this.kol.deck !== this.deckAnz) { this.raumName = name; this.deckAnz = this.kol.deck; if (this.elDeck) this.elDeck.textContent = `Deck ${this.kol.deck} · ${name}`; }
    // Aufzug in der Nähe? Gangway?
    let nah = null; const y = -F.pos.z; if (!this.menue) {
      for (const yt of TUERME) { if (Math.abs(y - (yt - 1.6)) < 1.15) for (const xd of [3.6, 6.2, -3.6, -6.2]) if (Math.abs(F.pos.x - xd) < 0.95) { nah = { text: this.mobil ? 'Tippe Ein Aus: Aufzug' : 'E: Aufzug', tu: () => this.aufzugMenue(yt, xd) }; } }
      if (this.kol.deck === 4 && Math.abs(Math.abs(F.pos.x) - 17.2) < 1.6 && Math.abs(y + 2) < 1.6) { const sg = Math.sign(F.pos.x), halt = this.schiff?.fahrplan?.liegt; nah = { text: halt ? (this.mobil ? 'Tippe Ein Aus: Von Bord gehen' : 'E: Von Bord gehen') : 'Tür zur Gangway, nur im Hafen offen', tu: () => { if (halt) this.beiAussteigen?.(sg); } }; }
    }
    this.nah = nah; if (this.elHin) { const t = nah?.text || ''; if (t !== this.hinweis) { this.hinweis = t; this.elHin.textContent = t; this.elHin.style.opacity = t ? 1 : 0; } }
    if (this.elZeit) this.elZeit.style.display = this.schiff?.plan ? 'inline-block' : 'none';
    if (this.elReise && this.reiseText !== (this.schiff?.fahrplan?.text || '')) { this.reiseText = this.schiff?.fahrplan?.text || ''; this.elReise.textContent = this.reiseText; }
  }
  rafferStufe() { this.raffer = this.raffer === 1 ? 60 : this.raffer === 60 ? 600 : 1; this.rafferText(); }
  rafferText() { if (this.elZeit) this.elZeit.textContent = this.raffer === 1 ? 'Zeitraffer aus' : `Zeitraffer ${this.raffer} fach`; if (this.elZeit) this.elZeit.style.background = this.raffer === 1 ? '#0007' : '#2c6fd6'; }
  meldung(t) { if (!this.elHin) return; this.elHin.textContent = t; this.elHin.style.opacity = 1; this.hinweis = t; }
  // Kamera im Rahmen des Schiffs, unmittelbar vor dem Bild: Schiff und Figur stehen dann fest
  kameraSetzen(camera, dt) {
    const F = this.figur; if (!F || !this.an) return; this.wurzel.updateWorldMatrix(true, false); const M = this.wurzel.matrixWorld; this.U.uZuSchiff.value.copy(M).invert();
    const pz = F.bildPos, zx = pz.x + Math.cos(this.yaw) * (this.ersteP ? 0 : 0.34), zy = pz.y + (this.ersteP ? 1.62 : 1.45), zz = pz.z - Math.sin(this.yaw) * (this.ersteP ? 0 : 0.34), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); _o.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    this.dist += (this.distZiel - this.dist) * (1 - Math.exp(-8 * dt));
    let d = this.ersteP ? 0.02 : this.dist; const draussen = this.istDraussen(pz.x, pz.z), hochRaum = /Atrium|Theater|Restaurant|Pooldeck|Sonnendeck/.test(this.raumName);
    if (!this.ersteP) { const dPlan = d; const t = this.kol.sicht(zx, zz, zx + _o.x * dPlan, zz + _o.z * dPlan); if (t < 1) d = Math.max(0.05, dPlan * t - 0.22); }
    let cy = zy + _o.y * d; const decke = pz.y + (draussen || hochRaum ? 7 : 2.24), bod = pz.y + 0.25; if (cy > decke) cy = decke; if (cy < bod) cy = bod;
    const cx = zx + _o.x * d, cz = zz + _o.z * d; if (this.frisch) { this.kamP.set(cx, cy, cz); this.frisch = false; } else this.kamP.lerp(_a.set(cx, cy, cz), 1 - Math.exp(-dt * 22)); this.kamZ.set(zx, zy, zz);
    const nahFigur = this.kamP.distanceTo(this.kamZ) < 0.62; if (F.obj.visible === nahFigur) F.obj.visible = !nahFigur;
    this.U.uKamL.value.copy(this.kamP); camera.position.copy(this.kamP).applyMatrix4(M); _b.copy(this.kamZ); if (this.ersteP || nahFigur) { _b.copy(this.kamP).addScaledVector(_o, -1); } _b.applyMatrix4(M); camera.up.set(M.elements[4], M.elements[5], M.elements[6]).normalize(); camera.lookAt(_b); camera.updateMatrixWorld();
  }
  // Oberfläche an Bord
  hudZeigen(an) {
    if (!this.el) { const el = this.el = document.createElement('div'); el.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:40;text-align:center;color:#fff;font:600 14px/1.35 system-ui,sans-serif;text-shadow:0 1px 4px #000a;pointer-events:none;display:none'; el.innerHTML = '<div id="bdeck" style="font-size:15px;letter-spacing:.02em"></div><div id="breise" style="font-weight:500;font-size:12px;opacity:.9"></div><button id="bzeit" style="pointer-events:auto;margin-top:5px;border:0;color:#fff;background:#0007;border-radius:8px;font:600 12px system-ui,sans-serif;padding:4px 10px;cursor:pointer">Zeitraffer aus</button>'; document.body.appendChild(el); this.elDeck = el.querySelector('#bdeck'); this.elReise = el.querySelector('#breise'); this.elZeit = el.querySelector('#bzeit'); this.elZeit.addEventListener('click', e => { e.stopPropagation(); this.rafferStufe(); }); const h = this.elHin = document.createElement('div'); h.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:40;color:#fff;background:#0009;padding:7px 14px;border-radius:9px;font:600 14px system-ui,sans-serif;opacity:0;transition:opacity .15s;pointer-events:none'; document.body.appendChild(h); }
    this.el.style.display = an ? 'block' : 'none'; if (!an) { this.elHin.style.opacity = 0; this.hinweis = ''; this.raffer = 1; this.rafferText(); }
  }
  aufzugMenue(yt, xd) {
    this.menueSchliessen(); const m = this.menue = document.createElement('div'); m.style.cssText = 'position:fixed;right:24px;top:50%;transform:translateY(-50%);z-index:45;background:#0d1520ee;color:#fff;padding:14px;border-radius:14px;font:500 14px system-ui,sans-serif;width:330px;max-height:80vh;overflow:auto;box-shadow:0 12px 40px #0008;pointer-events:auto';
    this.menueWahl = this.kol.deck; let html = '<div style="font-weight:700;margin-bottom:8px">Aufzug</div>'; for (let d = DMAX; d >= DMIN; d--) html += `<div data-d="${d}" style="padding:7px 9px;border-radius:8px;cursor:pointer"><b>${d}</b>&nbsp;&nbsp;${DECKNAMEN[d]}</div>`; html += `<div style="opacity:.7;font-size:12px;margin-top:8px">${this.mobil ? 'Tippen zum Fahren' : 'W S wählen, E fahren, oder klicken'}</div>`; m.innerHTML = html; document.body.appendChild(m); this.menueYt = yt; this.menueX = xd;
    m.querySelectorAll('[data-d]').forEach(x => x.addEventListener('click', () => this.aufzugFahren(+x.dataset.d))); this.menueZeigen(); this.menueSperre = 0.25;
  }
  menueZeigen() { this.menue?.querySelectorAll('[data-d]').forEach(x => { x.style.background = +x.dataset.d === this.menueWahl ? '#2c6fd6' : 'transparent'; }); }
  menueTick(e, achse, dt) { this.menueSperre -= dt; if (this.menueSperre > 0) return; if (Math.abs(achse.y) > 0.5) { this.menueWahl = THREE.MathUtils.clamp(this.menueWahl + Math.sign(achse.y), DMIN, DMAX); this.menueSperre = 0.16; this.menueZeigen(); } if (e) this.aufzugFahren(this.menueWahl); const F = this.figur; if (F && Math.hypot(F.pos.x - this.menueX, -F.pos.z - (this.menueYt - 1.6)) > 2.2) this.menueSchliessen(); }
  menueSchliessen() { this.menue?.remove(); this.menue = null; }
  aufzugFahren(d) { this.menueSchliessen(); const F = this.figur; if (!F) return; if (d !== this.kol.deck) { this.ding?.(); this.kol.setze(d); this.deckLaden(d).then(() => this.sichtbarkeit()); F.pos.y = Z(d); F.boden = undefined; F.merken(); this.deckGewechselt(d); this.frisch = true; } }
  // Mitreisende: Figuren laufen die Wege des Decks ab, stehen in Gruppen. Nur auf dem eigenen Deck, die Hülle hält sie unsichtbar, wenn man weit weg ist
  leuteStarten() { this.leute = []; this.tLeute = 0; }
  leuteStoppen() { if (this.leute) for (const p of this.leute) p.f.obj.parent?.remove(p.f.obj); this.leute = null; }
  leuteVerteilen() { const P = this.kol.plan; if (!this.leute || !P) return; const K = P.knoten, y = Z(this.kol.deck); for (const p of this.leute) { if (!K.length) { p.f.obj.visible = false; continue; } const i = Math.floor(Math.random() * K.length), n = K[i]; p.von = i; p.nach = n.n.length ? n.n[Math.floor(Math.random() * n.n.length)] : i; p.t = Math.random(); p.warte = Math.random() < 0.3 ? 2 + Math.random() * 8 : 0; p.y = y; p.f.obj.visible = true; p.v = 1.05 + Math.random() * 0.4; } }
  leuteTick(dt) {
    if (!this.leute) return; const P = this.kol.plan, max = this.mobil ? 10 : 26;
    if (this.quellen && this.leute.length < max && (this.tLeute -= dt) <= 0) { this.tLeute = 0.12; const q = this.quellen[Math.floor(Math.random() * this.quellen.length)], f = spawn(q, this.bewegungen); f.obj.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } }); this.wurzel.add(f.obj); f.play('gehen', 0); const p = { f, von: 0, nach: 0, t: 0, warte: 0, y: Z(this.kol.deck), v: 1.2, clip: 'gehen' }; this.leute.push(p); if (P?.knoten.length) { const i = Math.floor(Math.random() * P.knoten.length), n = P.knoten[i]; p.von = i; p.nach = n.n.length ? n.n[Math.floor(Math.random() * n.n.length)] : i; p.t = Math.random(); p.warte = Math.random() < 0.3 ? 3 + Math.random() * 8 : 0; p.v = 1.05 + Math.random() * 0.4; } }
    if (!P) return; const K = P.knoten, F = this.figur;
    for (const p of this.leute) {
      const a = K[p.von], c = K[p.nach]; if (!a || !c) continue; let clip = 'gehen';
      if (p.warte > 0) { p.warte -= dt; clip = 'stehen'; }
      else { const L = Math.hypot(c.x - a.x, c.z - a.z) || 1; p.t += p.v * dt / L; if (p.t >= 1) { const n = K[p.nach], alt = p.von; p.von = p.nach; p.t = 0; const wahl = n.n.filter(i => i !== alt); p.nach = wahl.length ? wahl[Math.floor(Math.random() * wahl.length)] : (n.n[0] ?? p.von); if (Math.random() < 0.08) p.warte = 2 + Math.random() * 6; } }
      const a2 = K[p.von], c2 = K[p.nach], k = Math.min(1, p.t), x = a2.x + (c2.x - a2.x) * k + (p.vers ??= (Math.random() - 0.5) * 0.7), z = a2.z + (c2.z - a2.z) * k + (p.versZ ??= (Math.random() - 0.5) * 0.7), o = p.f.obj; let hN = Z(this.kol.deck); for (const r of P.rampen) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) { hN = r[4] + (r[5] - r[4]) * (z - r[1]) / Math.max(1e-3, r[3] - r[1]); break; } o.position.set(x, hN, z); const dx = c2.x - a2.x, dz = c2.z - a2.z; if (dx || dz) { const ziel = Math.atan2(dx, dz); let dd = ziel - o.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); o.rotation.y += dd * (1 - Math.exp(-dt * 6)); }
      if (clip !== p.clip) { p.clip = clip; p.f.play(clip, 0.3); } const nahDa = (x - F.pos.x) ** 2 + (z - F.pos.z) ** 2 < 900; if (nahDa || (p.tA = (p.tA || 0) - dt) < 0) { p.f.mixer.update(nahDa ? dt : 0.25); p.tA = 0.25; }
    }
  }
}
const _achNull = new THREE.Vector2();
