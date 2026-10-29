// Wolkenberge (29.10.2026 abends, offener Punkt aus 09_GRAFIK.md): echte Haufenwolken mit Volumen am Rechner, als Durchgang nach dem
// Rendern (Strahlen in Viertelauflösung durch eine Schicht von 1,5 bis 6,5 km über dem Ellipsoid). Bedeckung aus derselben Wetterfunktion
// wie Decke und Schatten (WOLKEN_GLSL, als Wetterkarte 256 mal 256 über 120 km um die Kamera), Form: Türme je nach Bedeckung, Ränder aus
// periodischem Rauschen in ECEF (modulo PERIODE, keine Nähte beim Umsetzen des Ankers). Licht: Selbstschatten zur Sonne (5 Schritte),
// Puder an den Rändern, Vorwärtsstreuung im Gegenlicht, Himmelslicht, Luftperspektive. Gelände und Häuser verdecken über die Tiefe.
// Am Handy bleibt die flache Decke (kit/wolkendecke.js).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RAUSCHEN_GLSL, WOLKEN_GLSL, PERIODE } from './erde.js';

const S_KARTE = 120000, H0 = 1500, H1 = 6500;
// 3D Rauschen als Textur (64³, vier Kanäle mit Gitterperioden 4, 8, 16 und 32): kachelt nahtlos, über 4096 m gelegt sind das Merkmale von
// 1024, 512, 256 und 128 m, über 1024 m die feineren. Ein Texturzugriff ersetzt vier gerechnete Rauschoktaven (die Wolken kosteten sonst rund 7 ms)
function rauschTextur(n = 64) {
  const data = new Uint8Array(n * n * n * 4), q = t => t * t * t * (t * (t * 6 - 15) + 10);
  const hash = (x, y, z, c) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(c + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  [4, 8, 16, 32].forEach((P, c) => {
    const s = P / n, g = new Float32Array(P * P * P); for (let i = 0; i < g.length; i++) g[i] = hash(i % P, Math.floor(i / P) % P, Math.floor(i / (P * P)), c);
    const G = (x, y, z) => g[(x % P) + (y % P) * P + (z % P) * P * P];
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = x * s, fy = y * s, fz = z * s, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz), tx = q(fx - ix), ty = q(fy - iy), tz = q(fz - iz);
      const l = (a, b, t) => a + (b - a) * t;
      const v = l(l(l(G(ix, iy, iz), G(ix + 1, iy, iz), tx), l(G(ix, iy + 1, iz), G(ix + 1, iy + 1, iz), tx), ty), l(l(G(ix, iy, iz + 1), G(ix + 1, iy, iz + 1), tx), l(G(ix, iy + 1, iz + 1), G(ix + 1, iy + 1, iz + 1), tx), ty), tz);
      data[((z * n + y) * n + x) * 4 + c] = Math.round(v * 255);
    }
  });
  const t = new THREE.Data3DTexture(data, n, n, n); t.format = THREE.RGBAFormat; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

const WETTER_FS = `uniform vec3 uMitteK, uOst, uNord, uZentrum; uniform mat3 uZuWelt; varying vec2 vUv;
  ${RAUSCHEN_GLSL}
  ${WOLKEN_GLSL}
  void main() {
    vec3 p = uMitteK + uOst * (vUv.x - 0.5) * ${S_KARTE.toFixed(1)} + uNord * (vUv.y - 0.5) * ${S_KARTE.toFixed(1)};
    vec3 d = normalize(uZuWelt * normalize(p - uZentrum));
    gl_FragColor = vec4(wolkenDichte(d, 7.0), 0.0, 0.0, 1.0);
  }`;

const WOLKEN_FS = `uniform sampler2D tTiefe, tWetter; uniform highp sampler3D tRausch; uniform mat4 uProjInv, uKamWelt; uniform vec3 uKam, uZentrum, uMitteK, uOst, uNord, uSonne, uDunst, uUrsprungMod;
  uniform mat3 uZuWelt; uniform float uR, uNah, uFern, uHell, uZeit, uMenge; uniform vec2 uAufl; varying vec2 vUv;
  ${RAUSCHEN_GLSL}
  float tiefeZuAbstand(float d, vec3 dirV) { float z = (2.0 * uNah * uFern) / (uFern + uNah - (2.0 * d - 1.0) * (uFern - uNah)); return z / max(-dirV.z, 1e-4); }
  vec2 kugel(vec3 o, vec3 d, float r) { vec3 oc = o - uZentrum; float b = dot(oc, d), c = dot(oc, oc) - r * r, h = b * b - c; if (h < 0.0) return vec2(1e30, -1e30); h = sqrt(h); return vec2(-b - h, -b + h); }
  // Dichte (Verfahren wie Nubis, Horizon Zero Dawn): Grundrauschen wird an der Bedeckung abgeschnitten (getrennte Ballen mit Lücken),
  // nach oben schmaler (Blumenkohl), Türme höher bei mehr Bedeckung, Ränder fein angefressen. fein: mit Rändern (sonst für den Schatten)
  float rm(float v, float a, float b) { return clamp((v - a) / max(b - a, 1e-4), 0.0, 1.0); }
  float dichte(vec3 p, bool fein, out float hn) {
    vec3 rel = p - uZentrum; float r = length(rel), h = r - uR; hn = (h - ${H0.toFixed(1)}) / ${(H1 - H0).toFixed(1)};
    if (hn < 0.0 || hn > 1.0) return 0.0;
    vec3 q = p - uMitteK; vec2 uv = vec2(dot(q, uOst), dot(q, uNord)) / ${S_KARTE.toFixed(1)} + 0.5;
    float cov = smoothstep(0.0, 0.42, texture2D(tWetter, uv).r * uMenge);
    cov *= smoothstep(0.5, 0.42, abs(uv.x - 0.5)) * smoothstep(0.5, 0.42, abs(uv.y - 0.5));   // am Rand der Karte weich aus
    if (cov < 0.03) return 0.0;
    float top = 0.22 + 0.78 * cov * cov;
    if (hn > top) return 0.0;
    float profil = smoothstep(0.0, 0.06, hn) * smoothstep(top, top * 0.55, hn);
    vec3 e = uUrsprungMod + uZuWelt * p + vec3(uZeit * 4.0, 0.0, uZeit * 1.5);   // ECEF modulo PERIODE, langsame Drift
    vec4 r1 = texture(tRausch, e / ${PERIODE.toFixed(1)});                       // Merkmale 1024, 512, 256 und 128 m
    float n = r1.r * 0.55 + r1.g * 0.3 + r1.b * 0.15;
    float grund = rm(n, 1.0 - cov * 0.62, 1.0) * profil;                    // Ballen: nur wo das Rauschen über der Schwelle liegt
    grund = rm(grund, hn / top * 0.45, 1.0);                                // nach oben schmaler
    if (!fein || grund <= 0.0) return grund;
    vec4 r2 = texture(tRausch, e / ${(PERIODE / 4).toFixed(1)});                 // 256, 128, 64 und 32 m
    float d = r1.a * 0.4 + r2.b * 0.4 + r2.a * 0.2;
    return rm(grund, d * 0.32, 1.0);                                         // Ränder angefressen
  }
  float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5) * 0.25; }
  void main() {
    vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 dirV = normalize(v.xyz / v.w), dir = normalize(mat3(uKamWelt) * dirV);
    float tz = texture2D(tTiefe, vUv).x, szene = tz >= 0.99999 ? 1e30 : tiefeZuAbstand(tz, dirV);
    vec2 a = kugel(uKam, dir, uR + ${H1.toFixed(1)}), b = kugel(uKam, dir, uR + ${H0.toFixed(1)});
    float hk = length(uKam - uZentrum) - uR, t0, t1;
    if (a.y < 0.0 || a.x > a.y) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    if (hk < ${H0.toFixed(1)}) { t0 = b.y; t1 = a.y; }                                        // darunter: von der Unterseite bis oben raus
    else if (hk < ${H1.toFixed(1)}) { t0 = 0.0; t1 = b.x > 0.0 ? b.x : a.y; }                 // mittendrin
    else { t0 = max(a.x, 0.0); t1 = b.x > 0.0 ? b.x : a.y; }                                  // darüber: oben rein, unten oder seitlich raus
    t1 = min(t1, min(szene, t0 + 90000.0));
    if (t1 <= t0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float L = t1 - t0, zit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uZeit * 7.0) * 43758.5453);
    vec3 col = vec3(0.0); float T = 1.0;
    // Licht: Sonne warm am Horizont, Himmel bläulich, nachts fast nichts; Streuung vorwärts (Gegenlicht leuchtet) und etwas rückwärts
    vec3 oben = normalize(uKam - uZentrum); float el = dot(oben, uSonne), tag = smoothstep(-0.06, 0.1, el);
    vec3 sonneF = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.35, el)) * 1.7 * tag;
    vec3 himmelF = mix(vec3(0.05, 0.06, 0.09), vec3(0.46, 0.53, 0.64), smoothstep(-0.1, 0.25, el)) * 0.7;
    float cth = dot(dir, uSonne), phase = mix(hg(cth, -0.25), hg(cth, 0.65), 0.7) * 4.0 * 3.14159;
    const int N = 36;
    float tPrev = t0;
    for (int i = 0; i < N; i++) {
      float f = (float(i) + zit) / float(N), t = t0 + L * f * f, dt = max(t - tPrev, 1.0); tPrev = t;
      vec3 p = uKam + dir * t; float hn;
      float rho = dichte(p, true, hn);
      if (rho > 0.003) {
        float sig = rho * 0.0075;
        // Selbstschatten: 4 Schritte zur Sonne (60, 144, 346, 829 m)
        float od = 0.0, s = 60.0; vec3 q = p;
        for (int j = 0; j < 4; j++) { q += uSonne * s; float hq; od += dichte(q, false, hq) * s; s *= 2.4; }
        // Mehrfachstreuung genähert (drei Oktaven, je schwächer und weiter): Licht dringt tiefer ein, Schattenseiten bleiben hell wie echte Wolken
        float Tl = (exp(-0.0075 * od) + 0.5 * exp(-0.0019 * od) + 0.25 * exp(-0.0005 * od)) / 1.75, puder = 1.0 - exp(-0.015 * od - 0.3);
        vec3 S = sonneF * Tl * mix(phase, 1.0, 0.35) * mix(1.0, puder, 0.4) + himmelF * (0.62 + 0.38 * hn) + vec3(0.07, 0.075, 0.07) * tag * (1.0 - hn);   // Himmel, Bodenlicht von unten
        float tr = exp(-sig * dt);
        col += T * S * (1.0 - tr); T *= tr;
        if (T < 0.03) break;
      }
    }
    float weit = 1.0 - exp(-(t0 + L * 0.25) / 75000.0);
    col = mix(col, uDunst * (0.35 + 0.75 * tag) * (1.0 - T), weit * 0.55);   // Luftperspektive
    gl_FragColor = vec4(col * uHell * 0.69, T);
  }`;

// Mischen in voller Auflösung: was näher liegt als die Unterseite der Schicht (Kamera darunter), bekommt keine Wolke (sonst Säume aus der
// Viertelauflösung an Häusern und Bäumen vor dem Himmel)
const MISCH_FS = `uniform sampler2D tSzene, tWolken, tTiefe; uniform mat4 uProjInv, uKamWelt; uniform vec3 uKam, uZentrum; uniform float uR, uNah, uFern; varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tSzene, vUv), w = texture2D(tWolken, vUv);
    float hk = length(uKam - uZentrum) - uR;
    if (hk < ${H0.toFixed(1)}) {
      float d = texture2D(tTiefe, vUv).x;
      if (d < 0.99999) {
        vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 dirV = normalize(v.xyz / v.w), dir = normalize(mat3(uKamWelt) * dirV);
        float z = (2.0 * uNah * uFern) / (uFern + uNah - (2.0 * d - 1.0) * (uFern - uNah)), szene = z / max(-dirV.z, 1e-4);
        vec3 oc = uKam - uZentrum; float b = dot(oc, dir), c = dot(oc, oc) - (uR + ${H0.toFixed(1)}) * (uR + ${H0.toFixed(1)}), h = b * b - c;
        float tBasis = h > 0.0 ? -b + sqrt(h) : 1e30;
        if (szene < tBasis) w = vec4(0.0, 0.0, 0.0, 1.0);
      }
    }
    gl_FragColor = vec4(s.rgb * w.a + w.rgb, s.a);
  }`;
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class Wolkenberge extends Pass {
  constructor({ renderer, uWolken }) {
    super();
    this.renderer = renderer; this.needsSwap = true; this.enabled = false;
    this.wetterRT = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthBuffer: false });
    this.wetterRT.texture.minFilter = this.wetterRT.texture.magFilter = THREE.LinearFilter; this.wetterRT.texture.generateMipmaps = false;
    const gemeinsam = { uZentrum: { value: new THREE.Vector3() }, uMitteK: { value: new THREE.Vector3() }, uOst: { value: new THREE.Vector3(1, 0, 0) }, uNord: { value: new THREE.Vector3(0, 0, -1) }, uZuWelt: { value: new THREE.Matrix3() } };
    this.wetter = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...gemeinsam, uWolken }, vertexShader: VS, fragmentShader: WETTER_FS, depthTest: false, depthWrite: false }));
    this.halbRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.wolken = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...gemeinsam, tTiefe: { value: null }, tWetter: { value: this.wetterRT.texture }, tRausch: { value: rauschTextur() }, uProjInv: { value: new THREE.Matrix4() }, uKamWelt: { value: new THREE.Matrix4() },
      uKam: { value: new THREE.Vector3() }, uSonne: { value: new THREE.Vector3(0, 1, 0) }, uDunst: { value: new THREE.Color() }, uUrsprungMod: { value: new THREE.Vector3() }, uR: { value: 6371000 },
      uNah: { value: 1 }, uFern: { value: 1e5 }, uHell: { value: 1 }, uZeit: { value: 0 }, uMenge: { value: 1 }, uAufl: { value: new THREE.Vector2() } },
      vertexShader: VS, fragmentShader: WOLKEN_FS, depthTest: false, depthWrite: false }));
    const Wu = this.wolken.material.uniforms;
    this.misch = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tSzene: { value: null }, tWolken: { value: this.halbRT.texture }, tTiefe: Wu.tTiefe, uProjInv: Wu.uProjInv, uKamWelt: Wu.uKamWelt,
      uKam: Wu.uKam, uZentrum: Wu.uZentrum, uR: Wu.uR, uNah: Wu.uNah, uFern: Wu.uFern }, vertexShader: VS, fragmentShader: MISCH_FS, depthTest: false, depthWrite: false }));
    this.karteMitte = null; this.karteT = 99; this.zeit = 0;
  }
  setSize(w, h) { this.halbRT.setSize(Math.max(2, Math.ceil(w / 4)), Math.max(2, Math.ceil(h / 4))); this.wolken.material.uniforms.uAufl.value.set(w / 4, h / 4); }   // Viertelauflösung (Wolken sind weich)
  // je Bild: welt ErdWelt (Anker), kamHoehe über dem Meer, sonne lokal, an: zeigen (Rechner, Himmel sichtbar, unter rund 40 km)
  update(welt, camera, { kamHoehe, sonne, dunst, hell, dt, an, menge = 1 }) {
    this.enabled = an; if (!an) { this.karteMitte = null; return; }
    const W = this.wolken.material.uniforms, G = this.wetter.material.uniforms;
    welt.weltZuLokal(new THREE.Vector3(0, 0, 0), W.uZentrum.value);
    const oben = new THREE.Vector3().subVectors(camera.position, W.uZentrum.value), rK = oben.length(); oben.normalize();
    const R = rK - kamHoehe; W.uR.value = R;
    this.zeit += dt; W.uZeit.value = this.zeit; W.uMenge.value = menge;
    W.uKam.value.copy(camera.position); W.uSonne.value.copy(sonne).normalize(); W.uDunst.value.copy(dunst); W.uHell.value = hell;
    W.uProjInv.value.copy(camera.projectionMatrixInverse); W.uKamWelt.value.copy(camera.matrixWorld); W.uNah.value = camera.near; W.uFern.value = camera.far;
    W.uZuWelt.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(welt.zuWelt));
    const m = ((a) => ((a % PERIODE) + PERIODE) % PERIODE); W.uUrsprungMod.value.set(m(welt.ursprung.x), m(welt.ursprung.y), m(welt.ursprung.z));
    // Wetterkarte neu: wenn die Kamera ein Sechstel der Karte weiter ist, der Anker gewechselt hat oder alle 2 s (Drift)
    const nadir = W.uZentrum.value.clone().addScaledVector(oben, R);
    this.karteT += dt;
    const ankerNeu = !this.anker || this.anker.distanceToSquared(welt.ursprung) > 1;
    if (!this.karteMitte || ankerNeu || this.karteMitte.distanceTo(nadir) > S_KARTE / 6 || this.karteT > 2) {
      this.karteT = 0; this.anker = welt.ursprung.clone(); this.karteMitte = nadir.clone();
      const hilf = Math.abs(oben.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      W.uOst.value.crossVectors(hilf, oben).normalize(); W.uNord.value.crossVectors(oben, W.uOst.value).normalize(); W.uMitteK.value.copy(nadir);
      const r = this.renderer, alt = r.getRenderTarget(); r.setRenderTarget(this.wetterRT); this.wetter.render(r); r.setRenderTarget(alt);
    }
  }
  render(renderer, writeBuffer, readBuffer) {
    const W = this.wolken.material.uniforms; W.tTiefe.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.halbRT); this.wolken.render(renderer);
    this.misch.material.uniforms.tSzene.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.misch.render(renderer);
  }
  dispose() { this.wetterRT.dispose(); this.halbRT.dispose(); this.wetter.dispose(); this.wolken.dispose(); this.misch.dispose(); }
}
