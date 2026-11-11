// Meer rund um die Kamera (05.11.2026, Nader: "Die Meere müssen auch richtig gut aussehen", "echte wellengänge und verhalten vor allem an buchten und wo das meer auf land stößt"):
// Netz aus Ringen mit echten Wellen, Küstenkarte aus den Kacheln der Kugel (Wasser, Farbe, Tiefe, Abstand zur Küste, Offenheit gegen den Seegang), Wellenzustand für Schiffe und Auftrieb.
// Der Shader liegt in kit/meer_glsl.js, die Kugel zeichnet weiter weg dasselbe ohne Hub.
import * as THREE from 'three';
import { MEER_U, MEER_GLSL, MEER_VS_GLSL, WELLEN, NW, meerDetailBacken } from './meer_glsl.js';
import { szeneZuGeo, enu, R as ERD_R } from './erde.js';

const TAU = Math.PI * 2, G = 9.81, WARP_PERIODE = 2 * Math.PI * 1e6;   // die Verwerfung hat lange Perioden: Rest der großen Ursprungszahl, auf dem Rechner und im Shader gleich
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _o = { x: 0, y: 0, z: 0 }, _ebene = { x: 0, z: 0 };

// Wellen auf der Rechnerseite: dieselbe Summe wie im Shader. Phasen laufen hier in Float64 und werden auf 0 bis 2 pi gewickelt
export class Wellen {
  constructor(richtung = 1.05) {
    this.richtung = richtung; this.zeit = Math.random() * 1000; this.offX = 0; this.offZ = 0; this.amp = 1; this.steil = 1; this.phase = MEER_U.uWellePhase.value;
    this.liste = WELLEN.map(([L, A, grad, Q], i) => ({ L, A, Q, A0: A, Q0: Q, grad, k: TAU / L, om: Math.sqrt(G * TAU / L), QA: Q / (TAU / L), seed: (i * 2.39) % TAU, dx: 0, dz: 0, gx: 0.55 * Math.cos(i * 2.39996), gz: 0.55 * Math.sin(i * 2.39996) })); this.richten(richtung); this.liste.forEach((w, i) => MEER_U.uWelleG.value[i].set(w.gx, w.gz));
    this.summeQ = this.liste.reduce((s, w) => s + w.Q, 0); this.restRechnen();
  }
  // Summe der Neigungen aller Wellen für den Shader (weit weg, wo keine Welle mehr aufgelöst ist): offene See, ruhiges Wasser im Land
  restRechnen() { let a = 0, b = 0; for (const w of this.liste) { const q = w.k * w.A, g = 0.3 * (1 - THREE.MathUtils.smoothstep(w.L, 8, 30)); a += 0.5 * q * q; b += 0.5 * q * q * g * g; } MEER_U.uRestAlle.value.set(a, b); }
  richten(r) { this.richtung = r; this.windX = Math.sin(r); this.windZ = Math.cos(r); this.liste.forEach((w, i) => { const h = r + w.grad * Math.PI / 180; w.dx = Math.sin(h); w.dz = Math.cos(h); MEER_U.uWelleDir.value[i].set(w.dx, w.dz, w.k, w.A); MEER_U.uWelleQ.value[i].set(w.QA, w.L); }); }
  // Spitze des Seegangs: Wellen weit über der Periode des Seegangs treten zurück (kurze Windsee hat keine langen Berge)
  periode(Lp) { const f = L => { const q = L / Math.max(20, Lp); return q > 1 ? Math.exp(-(q - 1) * 1.9) : 1; }; this.liste.forEach((w, i) => { const k = f(w.L); w.A = w.A0 * k; MEER_U.uWelleDir.value[i].w = w.A; }); this.restRechnen(); }
  hsEins() { let v = 0; for (const w of this.liste) v += w.A * w.A / 2; return Math.max(0.05, 4 * Math.sqrt(v)); }   // signifikante Wellenhöhe bei Stärke 1
  zustand(s) { this.amp = s; this.steil = Math.min(s, 0.93 / this.summeQ); }
  update(dt) { this.zeit += dt; this.liste.forEach((w, i) => { let ph = (w.k * (w.dx * this.offX + w.dz * this.offZ) - w.om * this.zeit + w.seed) % TAU; if (ph < 0) ph += TAU; this.phase[i] = ph; }); }
  hub(x0, z0, o = _o) { const qx = x0 + this.offX % WARP_PERIODE, qz = z0 + this.offZ % WARP_PERIODE, x = x0 + 17 * Math.sin(qz * 0.0031 + 1.3) + 10 * Math.sin(qx * 0.0058 + qz * 0.0041) + 6 * Math.sin(qz * 0.0137 - qx * 0.0093 + 0.7), z = z0 + 15 * Math.sin(qx * 0.0027 + 4.1) + 9 * Math.sin(qz * 0.0063 - qx * 0.0037) + 6 * Math.sin(qx * 0.0151 + qz * 0.0089 + 2.9); const g1 = Math.sin(qx * 0.0017 + 1.1) * Math.sin(qz * 0.0023 + 0.4) * 0.7 + 0.3 * Math.sin(qx * 0.0041 - qz * 0.0029 + 2.3), g2 = Math.sin(qx * 0.0029 + qz * 0.0011 + 3.7) * Math.sin(qz * 0.0019 - qx * 0.0013 + 0.9) * 0.7 + 0.3 * Math.sin(qz * 0.0047 + qx * 0.0037 + 5.1); let dx = 0, dy = 0, dz = 0; const a = this.amp, q = this.steil, L = this.liste; for (let i = 0; i < NW; i++) { const w = L[i], e = 1 + w.gx * g1 + w.gz * g2, th = w.k * (w.dx * x + w.dz * z) + this.phase[i], s = Math.sin(th), c = Math.cos(th); dy += w.A * a * e * s; dx += w.QA * q * e * w.dx * c; dz += w.QA * q * e * w.dz * c; } o.x = dx; o.y = dy; o.z = dz; return o; }
  // Wasserhöhe an (x, z) der Ebene: Gerstner schiebt Punkte seitlich, darum zuerst die Verschiebung umkehren
  hoehe(x, z, schritte = 3) { let px = x, pz = z; for (let i = 0; i < schritte; i++) { this.hub(px, pz); px = x - _o.x; pz = z - _o.z; } return this.hub(px, pz).y; }
}

const NETZ_VS = `
  uniform vec2 uRing, uMeerC; uniform vec3 uMeerUp; uniform sampler2D tKarteB, tKarteT; uniform float uRand;
  attribute float aRing;
  varying vec3 vW; varying vec2 vBase; varying vec2 vKL; varying float vR;
  void main() {
    float r = uRing.x * (exp(uRing.y * aRing) - 1.0), masche = uRing.y * (r + uRing.x);
    vec2 g = position.xz * r, base = g + uMeerC;
    vec3 m0 = uMeerMitte + uMeerEx * base.x + uMeerEz * base.y;
    vec4 b = textureLod(tKarteB, karteUV(m0.xz), 0.0);
    float rand = 1.0 - smoothstep(uRand * 0.62, uRand * 0.88, r), dK = b.r;
    vec3 d = meerHub(base, masche * 1.2, meerAmp(dK, b.g)) * rand;
    if (dK < uBrand.w && masche < 9.0) { float hB = brandHoehe(max(dK, 0.0), b.g, base) * brandKamm(brandPhase(max(dK, 0.0), base)) * (1.0 - smoothstep(4.0, 9.0, masche)); d.y += hB; d.x -= b.b * hB * 0.7; d.z += b.a * hB * 0.7; }
    d.y *= smoothstep(-1.0, 4.0, dK);   // am Ufer läuft alles auf die mittlere Höhe aus
    float drop = dot(g, g) / ${(2 * ERD_R).toFixed(1)};
    // Flüsse und Seen liegen über Meereshöhe: das Netz folgt dem Gelände aus der Küstenkarte und bleibt knapp darüber (Themse in London, Wunsch Nr. 66)
    float hW = textureLod(tKarteT, karteUV(m0.xz), 0.0).g * 70.0; hW = hW > 0.02 ? hW + 0.45 : 0.0;
    vec3 w = uMeerMitte + uMeerEx * (base.x + d.x) + uMeerUp * (d.y - drop + hW) + uMeerEz * (base.y + d.z);
    vBase = base; vW = w; vKL = m0.xz; vR = r;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const NETZ_FS = `
  uniform vec4 uOrt; uniform vec2 uOrtX, uOrtZ, uNebel; uniform sampler2D tKarteA; uniform vec3 uMeerUp, uDunst, uNebelFarbe; uniform float uRand, uOrtFrei;
  varying vec3 vW; varying vec2 vBase; varying vec2 vKL; varying float vR;
  void main() {
    if (uOrt.y > 0.5 && uOrtFrei < 0.5) { vec2 dO = vW.xz - uOrt.zw; if (abs(dot(dO, uOrtX)) < uOrt.x && abs(dot(dO, uOrtZ)) < uOrt.x) discard; }
    vec2 kuv = karteUV(vKL); vec4 A = texture2D(tKarteA, kuv), Bk = texture2D(tKarteB, kuv);
    float alpha = smoothstep(0.0, 2.2, Bk.r) * (1.0 - smoothstep(uRand * 0.86, uRand * 0.97, vR));
    if (alpha < 0.004) discard;
    vec2 dpx = dFdx(vBase), dpy = dFdy(vBase); vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
    // Schmales Wasser (Flüsse, Kanäle) überall dieselbe Farbe: Tiefe und Foto sprangen sonst an jeder Kachelgrenze, die Themse hatte Bänder mit geraden Kanten (Wunsch Nr. 66)
    float tiefK = texture2D(tKarteT, kuv).r, schmal = 1.0 - smoothstep(350.0, 1100.0, Bk.r), flach = mix(max(1.0 - tiefK, (1.0 - smoothstep(6.0, 70.0, Bk.r)) * 0.7), 1.0, schmal);
    vec3 c = meerFarbe(vBase, dpx, dpy, uMeerUp, V, dist, flach, mix(A.rgb * A.rgb, vec3(0.029, 0.073, 0.084), schmal), 1.0, 0.0, Bk, meerSpur(vKL));
    float sG = dot(uMeerUp, uSonneH), weg = min(dist, 20000.0 / max(dot(uMeerUp, V), 0.03)), dunst = 1.0 - exp(-weg / 150000.0);
    c = mix(c, uDunst * (0.2 + 0.8 * clamp(sG * 1.2 + 0.1, 0.0, 1.0)), dunst * 0.72);
    c = mix(c, uNebelFarbe, smoothstep(uNebel.x, uNebel.y, dist));
    gl_FragColor = vec4(c, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const Q_OPT = { vertexShader: QUAD_VS, depthTest: false, depthWrite: false, toneMapped: false };

export class Meer {
  constructor({ renderer, welt, gruppe, mobil = false, atmos }) {
    this.renderer = renderer; this.welt = welt; this.mobil = mobil; this.atmos = atmos; this.wellen = new Wellen();
    MEER_U.tMeerDetail.value = meerDetailBacken(renderer);
    this.ex = new THREE.Vector3(); this.ez = new THREE.Vector3(); this.up = new THREE.Vector3(); this.planC = new THREE.Vector2(); this.c = new THREE.Vector2(); this.camW0 = null; this.seeIst = 1;
    this.t = 0; this.tProbe = 0; this.nah = false; this.seegang = { hoehe: null, periode: null, richtung: null, wind: null, windRichtung: null };
    this.karteMitteW = new THREE.Vector3(); this.neuMitteW = new THREE.Vector3(); this.karteAlter = 1e9; this.karteHalb = 0; this.neuHalb = 0; this.karteGeladen = -1; this.karteSchritt = 0; this.karteGut = false;
    const gA = mobil ? 512 : 1024, gB = mobil ? 256 : 1024, gT = mobil ? 256 : 512;
    const op8 = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace };
    const opF = { ...op8, type: THREE.HalfFloatType }, opJ = { ...opF, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.rtA = [new THREE.WebGLRenderTarget(gA, gA, op8), new THREE.WebGLRenderTarget(gA, gA, op8)]; this.rtT = [new THREE.WebGLRenderTarget(gT, gT, op8), new THREE.WebGLRenderTarget(gT, gT, op8)];
    this.rtB = [new THREE.WebGLRenderTarget(gB, gB, opF), new THREE.WebGLRenderTarget(gB, gB, opF)]; this.rtJ = [new THREE.WebGLRenderTarget(gB, gB, opJ), new THREE.WebGLRenderTarget(gB, gB, opJ)]; this.rtO = new THREE.WebGLRenderTarget(256, 256, op8); this.gB = gB;
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4e5); this.ortho.layers.set(3); this.ortho.up.set(0, 0, -1);
    this.qSz = new THREE.Scene(); this.q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.q.frustumCulled = false; this.qSz.add(this.q); this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mSaat = new THREE.ShaderMaterial({ ...Q_OPT, uniforms: { tA: { value: null }, uS: { value: 1 / gB } }, fragmentShader: `varying vec2 vUv; uniform sampler2D tA; uniform float uS;
      void main() { float a = step(0.5, texture2D(tA, vUv).a); bool r = step(0.5, texture2D(tA, vUv + vec2(uS, 0.0)).a) != a || step(0.5, texture2D(tA, vUv - vec2(uS, 0.0)).a) != a || step(0.5, texture2D(tA, vUv + vec2(0.0, uS)).a) != a || step(0.5, texture2D(tA, vUv - vec2(0.0, uS)).a) != a; gl_FragColor = r ? vec4(vUv, 1.0, 1.0) : vec4(0.0, 0.0, 0.0, 1.0); }` });
    this.mJfa = new THREE.ShaderMaterial({ ...Q_OPT, uniforms: { t: { value: null }, uK: { value: 1 }, uS: { value: 1 / gB } }, fragmentShader: `varying vec2 vUv; uniform sampler2D t; uniform float uK, uS;
      void main() { vec4 best = texture2D(t, vUv); float bd = best.z > 0.5 ? distance(best.xy, vUv) : 1e9; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { if (x == 0 && y == 0) continue; vec4 s = texture2D(t, vUv + vec2(float(x), float(y)) * uK * uS); if (s.z > 0.5) { float d = distance(s.xy, vUv); if (d < bd) { bd = d; best = s; } } } gl_FragColor = best; }` });
    // Offenheit: vom Punkt gegen die Laufrichtung der Wellen schauen (drei Strahlen, bis rund 40 Prozent der Karte). Liegt Land davor, ist es dort ruhig
    this.mOffen = new THREE.ShaderMaterial({ ...Q_OPT, uniforms: { tA: { value: null }, uR: { value: new THREE.Vector2(0, 1) } }, fragmentShader: `varying vec2 vUv; uniform sampler2D tA; uniform vec2 uR;
      void main() { float s = 0.0, w = 0.0; for (int k = -1; k <= 1; k++) { float a = float(k) * 0.42, c = cos(a), sn = sin(a); vec2 r = vec2(uR.x * c - uR.y * sn, uR.x * sn + uR.y * c), u = vUv; float o = 1.0; for (int i = 1; i <= 14; i++) { float t = float(i) / 14.0; u = vUv - r * t * 0.42; if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) break; if (texture2D(tA, u).a < 0.5) { o = mix(0.0, 0.85, t * t); break; } } float g = k == 0 ? 2.0 : 1.0; s += o * g; w += g; } gl_FragColor = vec4(s / w); }` });
    // Endbild: R Abstand in Metern (an Land negativ), G Offenheit, B und A Richtung vom Ufer weg (Karte: x, -z). Leicht geglättet, damit die Kämme in Buchten keinen Knick haben
    this.mEnde = new THREE.ShaderMaterial({ ...Q_OPT, uniforms: { tJ: { value: null }, tA: { value: null }, tO: { value: null }, uKante: { value: 1 }, uS: { value: 1 / gB } }, fragmentShader: `varying vec2 vUv; uniform sampler2D tJ, tA, tO; uniform float uKante, uS;
      vec3 feld(vec2 u) { vec4 s = texture2D(tJ, u); float sg = texture2D(tA, u).a > 0.5 ? 1.0 : -1.0; if (s.z < 0.5) return vec3(uKante * sg, 0.0, 0.0); vec2 v = u - s.xy; float l = length(v); return vec3(l * uKante * sg, l > 1e-6 ? v / l * sg : vec2(0.0)); }
      void main() { vec3 m = feld(vUv) * 0.28; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { if (x == 0 && y == 0) continue; m += feld(vUv + vec2(float(x), float(y)) * uS * 2.0) * 0.09; } vec2 n = length(m.yz) > 1e-4 ? normalize(m.yz) : vec2(0.0); gl_FragColor = vec4(m.x, texture2D(tO, vUv).r, n); }` });
    // Netz: Ringe als Einheitskreis, der Radius kommt im Shader aus dem Ringindex (je nach Höhe der Kamera engere oder weitere Maschen)
    const RINGE = mobil ? 110 : 230, SEG = mobil ? 170 : 400, n = 1 + RINGE * SEG, pos = new Float32Array(n * 3), ring = new Float32Array(n), idx = [];
    for (let i = 1; i <= RINGE; i++) for (let j = 0; j < SEG; j++) { const o = 1 + (i - 1) * SEG + j, a = j / SEG * TAU; pos[o * 3] = Math.cos(a); pos[o * 3 + 2] = Math.sin(a); ring[o] = i; }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + (j + 1) % SEG, 1 + j);
    for (let i = 1; i < RINGE; i++) { const a = 1 + (i - 1) * SEG, b = 1 + i * SEG; for (let j = 0; j < SEG; j++) { const h = (j + 1) % SEG; idx.push(a + j, a + h, b + j, a + h, b + h, b + j); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRing', new THREE.BufferAttribute(ring, 1)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.RINGE = RINGE;
    const U = welt.erde.mat.uniforms;
    this.U = { ...MEER_U, uRing: { value: new THREE.Vector2(8, 0.03) }, uMeerC: { value: new THREE.Vector2() }, uMeerUp: { value: new THREE.Vector3(0, 1, 0) }, tKarteT: { value: this.rtT[0].texture }, uRand: { value: 8000 }, uOrtFrei: { value: 0 }, uOrt: U.uOrt, uOrtX: U.uOrtX, uOrtZ: U.uOrtZ, uNebel: U.uNebel, uDunst: U.uDunst, uNebelFarbe: U.uNebelFarbe };
    MEER_U.tKarteA.value = this.rtA[0].texture; MEER_U.tKarteB.value = this.rtB[0].texture;
    this.mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: MEER_VS_GLSL + NETZ_VS, fragmentShader: '#define MEER_NETZ\nuniform sampler2D tKarteT;\n' + MEER_GLSL + NETZ_FS, transparent: true, depthWrite: true, side: THREE.FrontSide, toneMapped: true });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -1; this.mesh.visible = false; this.mesh.name = 'meer'; gruppe.add(this.mesh);
  }
  // Punkt der Wellenebene aus einem lokalen Punkt (für Schiffe)
  ebene(lokal, out = { x: 0, z: 0 }) { const m = MEER_U.uMeerMitte.value; const dx = lokal.x - m.x, dy = lokal.y - m.y, dz = lokal.z - m.z, ex = MEER_U.uMeerEx.value, ez = MEER_U.uMeerEz.value; out.x = dx * ex.x + dy * ex.y + dz * ex.z; out.z = dx * ez.x + dy * ez.y + dz * ez.z; return out; }
  // Wasserhöhe am lokalen Punkt über der mittleren Fläche
  hoeheBei(lokal) { const e = this.ebene(lokal, _ebene); return this.wellen.hoehe(e.x, e.z); }

  update(dt, { camera, hA, sonne, nacht = 0, wetter = 0, regen = 0, mond = null, ort = null }) {
    const W = this.welt, Er = W.erde; this.ort = ort; this.U.uOrtFrei.value = ort?.daten.meta.amMeer ? 1 : 0;
    this.t += dt; const camW = W.lokalZuWelt(camera.position, _a), g = szeneZuGeo(camW), e = enu(g.lat, g.lon), up = e.oben;
    // Achsen der Ebene: parallel mitgeführt, Lage der Kamera aufsummiert (Float64)
    if (!this.camW0) { this.camW0 = camW.clone(); this.ex.copy(e.ost); this.ez.crossVectors(this.ex, up); }
    const d = _b.subVectors(camW, this.camW0); this.planC.x += d.dot(this.ex); this.planC.y += d.dot(this.ez); this.camW0.copy(camW);
    this.ex.addScaledVector(up, -this.ex.dot(up)).normalize(); this.ez.crossVectors(this.ex, up);
    const raster = hA < 200 ? 1 : 8, Sx = Math.round(this.planC.x / raster) * raster, Sz = Math.round(this.planC.y / raster) * raster; this.c.set(this.planC.x - Sx, this.planC.y - Sz);
    // Seegang: gemessen (Live Wetter), sonst aus Wolken und Regen. Höhe des Spektrums bei Stärke 1 rund 3 m (signifikant)
    const w = this.wellen, S = this.seegang;
    if (S.periode != null && S.periode !== this._pAlt) { this._pAlt = S.periode; w.periode(G * S.periode * S.periode / TAU); }   // Länge der längsten Wellen aus der gemessenen Periode
    if (S.richtung != null) {   // Richtung: aus der die Wellen kommen (Grad von Nord). Große Wechsel: Wellen kurz ausblenden, drehen, wieder einblenden
      const b = (S.richtung + 180) * Math.PI / 180, vx = _b.copy(e.ost).multiplyScalar(Math.sin(b)).addScaledVector(e.nord, Math.cos(b)), h = Math.atan2(vx.dot(this.ex), vx.dot(this.ez)), dr = Math.atan2(Math.sin(h - w.richtung), Math.cos(h - w.richtung));
      if (Math.abs(dr) > 0.3) { this.fade = Math.max(0.12, (this.fade ?? 1) - dt / 2.2); if (this.fade <= 0.121) w.richten(h); } else this.fade = Math.min(1, (this.fade ?? 1) + dt / 3);
    } else this.fade = Math.min(1, (this.fade ?? 1) + dt / 3);
    const Hs0 = w.hsEins(), seeZiel = S.hoehe != null ? THREE.MathUtils.clamp(S.hoehe / Hs0, 0.06, 3) : 0.62 + 0.75 * wetter + 0.5 * regen; this.seeIst += (seeZiel - this.seeIst) * (1 - Math.exp(-dt * 0.15)); w.offX = Sx; w.offZ = Sz; w.zustand(this.seeIst * this.fade); w.update(dt);
    const u = MEER_U, q = W.zuLokal, eL = u.uMeerEx.value.copy(this.ex).applyQuaternion(q), zL = u.uMeerEz.value.copy(this.ez).applyQuaternion(q), upL = this.U.uMeerUp.value.copy(up).applyQuaternion(q);
    // Punkt der Wellenebene mit c = 0: auf Meereshöhe unter der Kamera, um c zurück
    const unter = W.weltZuLokal(_c.copy(camW).addScaledVector(up, -g.h), u.uMeerMitte.value); unter.addScaledVector(eL, -this.c.x).addScaledVector(zL, -this.c.y);
    this.up.copy(upL);
    u.uMeerTief.value = (7 + 6 * this.seeIst) / Math.max(g.h, 0.3); u.uSeeA.value = w.amp; u.uSeeQ.value = w.steil; u.uAnkerH.value = W.anker.h; u.uWarp.value.set(Sx % WARP_PERIODE, Sz % WARP_PERIODE, 0, 0);
    const ox = Sx, oz = Sz, f = v => v - Math.floor(v), t = this.t;
    u.uDetA.value.set(f(ox / 19 + t * 0.021 * w.windX), f(oz / 19 + t * 0.021 * w.windZ)); u.uDetB.value.set(f(oz / 7.3 + t * 0.043), f(-ox / 7.3 - t * 0.017));
    u.uFoamA.value.set(f(ox / 9 + t * 0.004), f(oz / 9 + t * 0.003)); u.uFoamB.value.set(f(ox / 3.3 - t * 0.009), f(oz / 3.3 + t * 0.006)); u.uWindA.value.set(f(ox / 1900 + t * 0.0006 * w.windX), f(oz / 1900 + t * 0.0006 * w.windZ));
    u.uMeerT.value = t % 3600;
    // Rauheit nach dem Wind (Cox und Munk), Anteil der Schaumkronen nach dem Seegang
    const wind = S.wind != null ? S.wind : 4.5 + 11 * wetter + 6 * regen; u.uMeerSigma.value = 0.003 + 0.00512 * wind * 0.72; u.uSchaum.value = Math.min(0.09, 0.0006 * wind * wind);
    // Brandung: Periode des Seegangs, Höhe nach dem Seegang, Brechpunkt dort, wo die Tiefe rund die Wellenhöhe erreicht (Grund steigt 1 zu 28)
    const T = S.periode != null ? Math.min(16, Math.max(4, S.periode)) : 7.5 + 2 * wetter, om = TAU / T, Hb = Math.max(0.22, Math.min(3.4, this.seeIst * w.hsEins() * 0.72 + 0.12)), bet = 0.036, DBr = 460;
    u.uBrand.value.set(2 * om / Math.sqrt(G * bet), ((-(this.t * om)) % TAU), Hb, DBr); u.uBrandDb.value = Math.max(7, Hb / 0.78 / bet * 0.9);
    // Licht: Sonne, nachts der Mond. Himmel aus der Atmosphäre, ab einiger Höhe die berechnete Farbe in Meereshöhe
    const A = this.atmos, tag = THREE.MathUtils.smoothstep(sonne.y, -0.04, 0.03);
    if (tag > 0.02 || !mond) { u.uLichtDir.value.copy(sonne); const st = (A.sonneStaerke ?? 1) * 40; u.uLichtE.value.set(A.sonneFarbe.r * st, A.sonneFarbe.g * st, A.sonneFarbe.b * st); }
    else { u.uLichtDir.value.copy(mond); u.uLichtE.value.set(0.42, 0.5, 0.66); }
    const hi = A.himmelFarbe; u.uMeerAmb.value.set(hi.r, hi.g, hi.b); u.uLutEin.value = 1 - THREE.MathUtils.smoothstep(hA, 6000, 16000);
    const hor = A.horizont; u.uHimmelH.value.set(hor.r, hor.g, hor.b); u.uHimmelO.value.set(hi.r * 0.62, hi.g * 0.74, hi.b * 0.98);
    // Netz nur tief genug und wenn Wasser in der Nähe liegt
    const ziel = THREE.MathUtils.clamp(hA * 8, 3200, 14000);
    this.tProbe -= dt;
    if (this.tProbe <= 0) { this.tProbe = 0.7; this.nah = false; if (hA < 2800) { const lo = g.lat, lg = g.lon, k = ziel / 111000, kl = k / Math.max(0.1, Math.cos(lo * Math.PI / 180)); if (Er.wasserBei(lo, lg) > 0.2) this.nah = true; else for (let i = 0; i < 16 && !this.nah; i++) { const a = i / 16 * TAU, r = i % 2 ? 0.45 : 0.95; if (Er.wasserBei(lo + Math.sin(a) * k * r, lg + Math.cos(a) * kl * r) > 0.2) this.nah = true; } } }
    const an = this.nah && hA < 2800;
    if (!an) { this.mesh.visible = false; u.uMeerNah.value.set(0, 0, 0, 0); u.uKarte.value.w = 0; return; }
    // Maschen: engste am Fuß nach der Höhe, außen bis zum Rand
    const eng = THREE.MathUtils.clamp(hA * 0.012, 0.3, 14); let b = 0.03; for (let i = 0; i < 8; i++) { const v = eng / b * (Math.exp(b * this.RINGE) - 1) - ziel, dv = eng / b * (this.RINGE * Math.exp(b * this.RINGE)) - eng / (b * b) * (Math.exp(b * this.RINGE) - 1); b = Math.max(0.002, b - v / dv); } this.U.uRing.value.set(eng / b, b); this.U.uRand.value = ziel;
    this.karte(camW, ziel);
    if (!this.karteGut) { this.mesh.visible = false; u.uMeerNah.value.set(0, 0, 0, 0); return; }
    this.mesh.visible = true;
    const cl = _d.copy(unter).addScaledVector(eL, this.c.x).addScaledVector(zL, this.c.y); u.uMeerNah.value.set(cl.x, cl.z, ziel * 0.95, 1);
    this.U.uMeerC.value.copy(this.c);
    const lk = W.weltZuLokal(this.karteMitteW, _e); u.uKarte.value.set(lk.x, lk.z, 1 / (2 * this.karteHalb), 1);
  }
  // Küstenkarte in mehreren Bildern: 1 Farbe und Wasser, 2 Tiefe, 3 Abstand zur Küste und Offenheit, dann tauschen
  karte(camW, ziel) {
    const W = this.welt, Er = W.erde; this.karteAlter += 1 / 60;
    if (!this.karteSchritt) {
      const weg = this.karteHalb ? _b.subVectors(camW, this.karteMitteW).length() : 1e9, halb = ziel * 1.1, neu = weg > halb * 0.14 || Math.abs(this.karteHalb - halb) > halb * 0.2 || (this.karteAlter > 1.2 && Er.geladen !== this.karteGeladen) || this.karteAlter > 5;
      if (!neu) return;
      this.neuMitteW.copy(camW); this.neuHalb = halb; this.karteGeladen = Er.geladen;
    }
    const r = this.renderer, alt = r.getRenderTarget(), autoC = r.autoClear, altClear = r.getClearColor(new THREE.Color()), altA = r.getClearAlpha(); r.autoClear = false; r.setClearColor(0x000000, 0);
    const halb = this.neuHalb;
    if (this.karteSchritt === 0) {
      const m = W.weltZuLokal(this.neuMitteW, _c), cam = this.ortho; cam.position.set(m.x, m.y + 2e5, m.z); cam.lookAt(m.x, m.y, m.z); cam.left = -halb; cam.right = halb; cam.top = halb; cam.bottom = -halb; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      this.karteZeichnen(1, this.rtA[1]); this.karteSchritt = 1;
    } else if (this.karteSchritt === 1) {
      this.karteZeichnen(2, this.rtT[1]); this.karteSchritt = 2;
    } else {
      const zeichne = (m, ziel) => { this.q.material = m; r.setRenderTarget(ziel); r.render(this.qSz, this.qCam); };
      this.mSaat.uniforms.tA.value = this.rtA[1].texture; zeichne(this.mSaat, this.rtJ[0]);
      let a = 0; for (let k = this.gB >> 1; k >= 1; k >>= 1) { this.mJfa.uniforms.t.value = this.rtJ[a].texture; this.mJfa.uniforms.uK.value = k; zeichne(this.mJfa, this.rtJ[1 - a]); a = 1 - a; }
      // Laufrichtung der Wellen auf der Karte (x, -z), Strahlen zeigen dagegen. Länge in Karten Einheiten fest im Shader
      const ww = this.wellen, zL = MEER_U.uMeerEz.value, eL = MEER_U.uMeerEx.value, lx = eL.x * ww.windX + zL.x * ww.windZ, lz = eL.z * ww.windX + zL.z * ww.windZ, ll = Math.hypot(lx, lz) || 1;
      this.mOffen.uniforms.tA.value = this.rtA[1].texture; this.mOffen.uniforms.uR.value.set(lx / ll, -lz / ll); zeichne(this.mOffen, this.rtO);
      const E = this.mEnde.uniforms; E.tJ.value = this.rtJ[a].texture; E.tA.value = this.rtA[1].texture; E.tO.value = this.rtO.texture; E.uKante.value = 2 * halb; zeichne(this.mEnde, this.rtB[1]);
      // tauschen
      [this.rtA[0], this.rtA[1]] = [this.rtA[1], this.rtA[0]]; [this.rtT[0], this.rtT[1]] = [this.rtT[1], this.rtT[0]]; [this.rtB[0], this.rtB[1]] = [this.rtB[1], this.rtB[0]];
      MEER_U.tKarteA.value = this.rtA[0].texture; MEER_U.tKarteB.value = this.rtB[0].texture; this.U.tKarteT.value = this.rtT[0].texture;
      this.karteMitteW.copy(this.neuMitteW); this.karteHalb = halb; this.karteAlter = 0; this.karteSchritt = 0; this.karteGut = true;
    }
    r.setRenderTarget(alt); r.autoClear = autoC; r.setClearColor(altClear, altA);
  }
  karteZeichnen(art, rt) {
    const W = this.welt, Er = W.erde, r = this.renderer, u = MEER_U.uNurMaske, liste = [], kamW = this.neuMitteW, weit = this.neuHalb * 1.5;
    for (const k of Er.kacheln.values()) { if (!k.mesh) continue; k._sicht = k.mesh.visible; k.mesh.visible = false; k.mesh.layers.enable(3); if (kamW.distanceTo(k.mitte) < weit + k.radius) { if (k.karteWunsch && k.z <= 12 && !Er.imFlug) Er.karteHolen(k); if (k.maskeTex || k.z < Er.karteAb) liste.push(k); } }   // Kacheln ohne Wasserkarte (außerhalb des Blicks) lassen die der gröberen Stufe stehen, sonst fehlte dort das Wasser: Lücken im Fluss (Wunsch Nr. 66)
    liste.sort((a, b) => a.z - b.z); liste.forEach((k, i) => { k.mesh.visible = true; k.mesh.renderOrder = i; });
    u.value = art; r.setRenderTarget(rt); r.clear(); r.render(W.erdGruppe, this.ortho); u.value = 0;
    // Im Ort am Meer zählen seine eigenen Polygone (genauer als die Karte der Kugel, passen zum Boden): erst alles Land, dann sein Wasser
    const O = this.ort, wm = O?.szene.ort.wasserMesh;
    // Im Ort am Meer liegt das Wasser auf Meereshöhe (kuesteFormen in kit/ortbau.worker.js), nicht auf den Höhen der Kugel: Grün der Tiefenkarte dort auf 0
    if (art === 2 && O?.daten.meta.amMeer && this.qOrt) {
      this.mOhneH ??= new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, depthTest: false, depthWrite: false, toneMapped: false });
      O.gruppe.updateMatrixWorld(true); this.qOrt.matrixWorld.copy(O.gruppe.matrixWorld).scale(_e.set(O.halb * 2, 1, O.halb * 2)); this.qOrt.material = this.mOhneH; r.render(this.qOrt, this.ortho); this.qOrt.material = this.mLand;
    }
    if (art === 1 && O?.daten.meta.amMeer && wm) {
      this.mLand ??= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false });
      this.mWasserK ??= new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(0.17, 0.27, 0.29, 1.0); }', depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
      if (!this.qOrt) { this.qOrt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mLand); this.qOrt.frustumCulled = false; this.qOrt.matrixAutoUpdate = false; this.qOrt.matrixWorldAutoUpdate = false; this.qOrt.layers.enable(3); }
      O.gruppe.updateMatrixWorld(true); this.qOrt.matrixWorld.copy(O.gruppe.matrixWorld).scale(_e.set(O.halb * 2, 1, O.halb * 2)); r.render(this.qOrt, this.ortho);
      const mAlt = wm.material, fr = wm.frustumCulled; wm.material = this.mWasserK; wm.layers.enable(3); wm.frustumCulled = false; const vis = wm.parent.visible; r.render(wm, this.ortho); wm.material = mAlt; wm.frustumCulled = fr; wm.parent.visible = vis;
    }
    for (const k of Er.kacheln.values()) if (k.mesh) { k.mesh.visible = k._sicht; k.mesh.renderOrder = 0; }
  }
}
