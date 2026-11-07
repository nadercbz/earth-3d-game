// Atmosphäre (04.11.2026, Nader: "der himmel soll besser sein ... wie die echte Welt", "Am besten wie GTA 6"). Drei Teile aus einer Quelle:
// 1. Himmel: Streuung nach Rayleigh und Mie mit Ozon, je Sonnenstand einmal in eine kleine Textur gerechnet (Sky View LUT nach Hillaire,
//    256 mal 128, Höhe in der Kamera), daraus Himmelskuppel, Umgebungslicht, Sonnen und Himmelsfarbe. Tiefes Blau oben, Dunst am Horizont, Abendrot.
// 2. Luftperspektive (Pass nach dem Rendern, nur am Rechner): Ausdünnung und Einstreuung je Pixel aus der Tiefe, zwei Schichten (Luft 8 km, Dunst 1,5 km),
//    Farbe aus derselben Textur Richtung Horizont. So geht die Stadt ohne Kante in den Himmel über, gegen die Sonne warm, sonst blau.
// 3. Kontaktschatten (Verdeckung aus der Tiefe in halber Auflösung): Häuser, Autos und Bäume stehen auf dem Boden statt zu schweben. Kostet keine zweite Szene.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Werte der Atmosphäre (Hillaire 2020, Mie etwas dunstiger als klare Luft)
const R = 6371000, RT = 6471000, BR = [5.802e-6, 13.558e-6, 33.1e-6], BO = [0.65e-6, 1.881e-6, 0.085e-6], HR = 8000, HM = 1200, SONNE = 20;
const BM_BASIS = 2.3e-6;

// Der Himmel in einer Richtung, gemeinsam für Textur und Prüfung
const STREUUNG_GLSL = `
  const float PI = 3.14159265, R_E = ${R.toFixed(1)}, R_T = ${RT.toFixed(1)};
  const vec3 BR = vec3(${BR.join(', ')}), BO = vec3(${BO.join(', ')});
  uniform float uBM;   // Mie Streuung (Dunst)
  vec2 kugelS(vec3 o, vec3 d, float r) { float b = dot(o, d), c = dot(o, o) - r * r, h = b * b - c; if (h < 0.0) return vec2(1e12, -1e12); h = sqrt(h); return vec2(-b - h, -b + h); }
  vec3 dichten(float h) { float oz = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0); return vec3(exp(-h / ${HR.toFixed(1)}), exp(-h / ${HM.toFixed(1)}), oz); }
  vec3 tiefeZurSonne(vec3 p, vec3 s) {
    vec2 g = kugelS(p, s, R_E); if (g.x > 0.0 && g.y > 0.0) return vec3(1e6);   // Erde dazwischen
    vec2 a = kugelS(p, s, R_T); float L = a.y; const int N = 6; float dt = L / float(N); vec3 od = vec3(0.0);
    for (int i = 0; i < N; i++) { vec3 q = p + s * (float(i) + 0.5) * dt; od += dichten(length(q) - R_E) * dt; }
    return od;
  }
  vec3 streuung(vec3 d, vec3 s, float hK) {
    vec3 o = vec3(0.0, R_E + hK, 0.0);
    vec2 a = kugelS(o, d, R_T), g = kugelS(o, d, R_E);
    float t0 = max(a.x, 0.0), t1 = a.y; if (g.x > 0.0 && g.x < t1) t1 = g.x; if (t1 <= t0) return vec3(0.0);
    const int N = 22; float dt = (t1 - t0) / float(N), c = dot(d, s), pR = 0.0596831 * (1.0 + c * c), gg = 0.8, pM = 0.0795775 * (1.0 - gg * gg) * (1.0 + c * c) / ((2.0 + gg * gg) * pow(1.0 + gg * gg - 2.0 * gg * c, 1.5));
    vec3 od = vec3(0.0), L = vec3(0.0), Ms = vec3(0.0); float bMe = uBM * 1.11;
    float sonneHoch = smoothstep(-0.16, 0.25, s.y);
    for (int i = 0; i < N; i++) {
      vec3 p = o + d * (t0 + (float(i) + 0.5) * dt); float h = length(p) - R_E; vec3 r = dichten(h); od += r * dt;
      vec3 Tv = exp(-(BR * od.x + vec3(bMe) * od.y + BO * od.z));
      vec3 odS = tiefeZurSonne(p, s), Ts = exp(-(BR * odS.x + vec3(bMe) * odS.y + BO * odS.z));
      L += Tv * Ts * (BR * r.x * pR + vec3(uBM) * r.y * pM) * dt;
      Ms += Tv * (BR * r.x + vec3(uBM) * r.y) * dt;   // Mehrfachstreuung genähert: gleichmäßig aus dem hellen Himmel
    }
    return (L + Ms * vec3(0.030, 0.044, 0.078) * sonneHoch) * ${SONNE.toFixed(1)};
  }`;

const VS_QUAD = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const LUT_FS = `varying vec2 vUv; uniform vec3 uSonneE; uniform float uH, uBedeckt, uStadt;
  ${STREUUNG_GLSL}
  void main() {
    float az = vUv.x * PI, v = vUv.y * 2.0 - 1.0, e = sign(v) * v * v * PI * 0.5;
    vec3 d = vec3(cos(e) * cos(az), sin(e), cos(e) * sin(az));
    vec3 L = streuung(d, uSonneE, uH);
    L += vec3(0.0042, 0.0066, 0.0150) * (1.0 - smoothstep(-0.2, 0.05, uSonneE.y));                  // Nachthimmel ist nicht schwarz
    L += vec3(0.060, 0.038, 0.026) * uStadt * exp(-abs(e) * 16.0) * (1.0 - smoothstep(-0.12, 0.1, uSonneE.y));   // Lichtglocke der Stadt am Horizont
    float l = dot(L, vec3(0.3, 0.55, 0.15));
    L = mix(L, vec3(l) * vec3(0.92, 0.96, 1.02) * (0.62 + 0.25 * max(d.y, 0.0)), uBedeckt);          // bedeckt: grau, oben etwas heller
    gl_FragColor = vec4(L, 1.0);
  }`;

// Sampeln der Textur in jedem Shader: tHimmel, uSonneH (Richtung zur Sonne, y oben)
export const HIMMEL_GLSL = `uniform sampler2D tHimmel; uniform vec3 uSonneH;
  vec3 himmelLUT(vec3 d) {
    float e = asin(clamp(d.y, -1.0, 1.0));
    vec2 hs = normalize(uSonneH.xz + vec2(1e-5, 0.0)), hd = normalize(d.xz + vec2(1e-5, 0.0));
    float az = acos(clamp(dot(hs, hd), -1.0, 1.0)) / 3.14159265, v = sign(e) * sqrt(abs(e) / 1.5707963) * 0.5 + 0.5;
    return texture2D(tHimmel, vec2(az, v)).rgb;
  }`;

// gemeinsame Uniforms für alle Materialien, die den Himmel spiegeln (Glas, Lack, Wasser)
export const HIMMEL_U = { tHimmel: { value: null }, uSonneH: { value: new THREE.Vector3(0, 1, 0) } };

function kugelS(o, d, r) { const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2], c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r, h = b * b - c; if (h < 0) return [1e12, -1e12]; const s = Math.sqrt(h); return [-b - s, -b + s]; }

export class Atmos {
  constructor(renderer, { mobil = false } = {}) {
    this.renderer = renderer; this.mobil = mobil;
    this.rt = new THREE.WebGLRenderTarget(256, 128, { type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.rt.texture.wrapS = THREE.MirroredRepeatWrapping;
    HIMMEL_U.tHimmel.value = this.rt.texture; this.U = HIMMEL_U;
    this.lut = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { uSonneE: { value: new THREE.Vector3(0, 1, 0) }, uH: { value: 2 }, uBM: { value: BM_BASIS }, uBedeckt: { value: 0 }, uStadt: { value: 0 } }, vertexShader: VS_QUAD, fragmentShader: LUT_FS, depthTest: false, depthWrite: false }));
    this.stand = null; this.sonneFarbe = new THREE.Color(1, 1, 1); this.himmelFarbe = new THREE.Color(0.5, 0.6, 0.8); this.horizont = new THREE.Color(0.7, 0.75, 0.8); this.bodenFarbe = new THREE.Color(0.3, 0.27, 0.22); this.helligkeit = 1;
    this.sonneWolken = new THREE.Color(1, 1, 1); this.mondDir = new THREE.Vector3(0, 1, 0); this.dipU = { value: 0 };
  }
  // nach Sonnenstand und Wetter: Sonnenfarbe (Ausdünnung durch die Luft), Himmel und Horizont für Licht und Dunst auf dem Handy
  setzen(sonne, { hoehe = 2, bedeckt = 0, dunst = 0, stadt = 0 } = {}) {
    const el = Math.asin(THREE.MathUtils.clamp(sonne.y, -1, 1)), hK = Math.max(2, Math.min(hoehe, 60000)), bm = BM_BASIS * (1 + 2.5 * dunst);
    this.U.uSonneH.value.copy(sonne); { const q = 6371000 / (6371000 + Math.max(0, hoehe)); this.dipU.value = -Math.sqrt(Math.max(0, 1 - q * q)); }
    this.mondDir.set(-sonne.x + 0.32, Math.abs(sonne.y) * 0.95 + 0.22, -sonne.z + 0.26).normalize();   // Mond grob gegenüber der Sonne, immer etwas über dem Horizont
    const schluessel = `${(el * 300) | 0}:${Math.round(Math.log2(hK + 1) * 8)}:${Math.round(bedeckt * 40)}:${Math.round(dunst * 40)}:${Math.round(stadt * 20)}`;
    if (schluessel === this.stand) return false;
    this.stand = schluessel;
    const L = this.lut.material.uniforms; L.uSonneE.value.set(Math.cos(el), Math.sin(el), 0); L.uH.value = hK; L.uBM.value = bm; L.uBedeckt.value = bedeckt; L.uStadt.value = stadt;
    const r = this.renderer, alt = r.getRenderTarget(); r.setRenderTarget(this.rt); this.lut.render(r); r.setRenderTarget(alt);
    // Sonnenfarbe: Durchlässigkeit vom Boden zur Sonne
    const T = this.durchlass(el, bm); this.sonneFarbe.setRGB(T[0], T[1], T[2]);
    const m = Math.max(T[0], T[1], T[2], 1e-3); this.sonneFarbe.multiplyScalar(1 / m);
    this.sonneStaerke = m;
    const Th = this.durchlassAb(el, 2800, bm); this.sonneWolken.setRGB(Th[0], Th[1], Th[2]);   // Sonne auf Höhe der Wolken: dort scheint sie noch, wenn sie am Boden schon weg ist (Abendrot von unten)
    // Himmel im Mittel (Umgebungslicht) und am Horizont quer zur Sonne
    const hor = this.himmelCPU(0.03, 1.2, el, hK, bm), obenL = this.himmelCPU(0.75, 1.2, el, hK, bm), mitte = this.himmelCPU(0.3, 2.2, el, hK, bm), f = 1 - bedeckt;
    const grau = c => { const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15; return [c[0] * f + l * 0.92 * (1 - f), c[1] * f + l * 0.96 * (1 - f), c[2] * f + l * 1.02 * (1 - f)]; };
    const H = grau(hor), M = grau([(obenL[0] + mitte[0]) / 2, (obenL[1] + mitte[1]) / 2, (obenL[2] + mitte[2]) / 2]);
    this.horizont.setRGB(H[0], H[1], H[2]); this.himmelFarbe.setRGB(M[0], M[1], M[2]);
    return true;
  }
  // Durchlässigkeit der Luft bis zur Sonne (grob integriert)
  durchlass(el, bm) {
    const s = [Math.cos(el), Math.sin(el), 0], p = [0, R + 2, 0], g = kugelS(p, s, R); if (g[0] > 0 && g[1] > 0 && el < -0.02) return [0, 0, 0];
    const a = kugelS(p, s, RT), N = 16, dt = a[1] / N; let odR = 0, odM = 0, odO = 0;
    for (let i = 0; i < N; i++) { const t = (i + 0.5) * dt, x = s[0] * t, y = p[1] + s[1] * t, h = Math.hypot(x, y) - R; odR += Math.exp(-h / HR) * dt; odM += Math.exp(-h / HM) * dt; odO += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * dt; }
    return [0, 1, 2].map(i => Math.exp(-(BR[i] * odR + bm * 1.11 * odM + BO[i] * odO)));
  }
  // Durchlässigkeit von einer Höhe h aus (fein integriert, wichtig für die streifenden Strahlen beim Abendrot)
  durchlassAb(el, h, bm) {
    const s = [Math.cos(el), Math.sin(el), 0], p = [0, R + h, 0], g = kugelS(p, s, R); if (g[0] > 0 && g[1] > 0) return [0, 0, 0];
    const a = kugelS(p, s, RT), N = 64; let odR = 0, odM = 0, odO = 0, t0 = 0;
    for (let i = 0; i < N; i++) { const f = (i + 1) / N, t1 = a[1] * f * f, dt = t1 - t0, t = (t0 + t1) / 2, x = s[0] * t, y = p[1] + s[1] * t, hh = Math.hypot(x, y) - R; odR += Math.exp(-hh / HR) * dt; odM += Math.exp(-hh / HM) * dt; odO += Math.max(0, 1 - Math.abs(hh - 25000) / 15000) * dt; t0 = t1; }
    return [0, 1, 2].map(i => Math.exp(-(BR[i] * odR + bm * 1.11 * odM + BO[i] * odO)));
  }
  // Himmel in einer Richtung auf der Rechnerseite (wenige Schritte): e Höhenwinkel, az Winkel zur Sonne, Mittelwerte für Licht
  himmelCPU(e, az, el, hK, bm) {
    const s = [Math.cos(el), Math.sin(el), 0], d = [Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)], o = [0, R + hK, 0];
    const a = kugelS(o, d, RT), N = 10, dt = a[1] / N, c = d[0] * s[0] + d[1] * s[1], pR = 0.0596831 * (1 + c * c), gg = 0.8, pM = 0.0795775 * (1 - gg * gg) * (1 + c * c) / ((2 + gg * gg) * Math.pow(1 + gg * gg - 2 * gg * c, 1.5));
    let odR = 0, odM = 0, odO = 0; const L = [0, 0, 0], Ms = [0, 0, 0], sh = THREE.MathUtils.smoothstep(s[1], -0.16, 0.25);
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) * dt, p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], h = Math.hypot(p[0], p[1], p[2]) - R, r = Math.exp(-h / HR), m = Math.exp(-h / HM), oz = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
      odR += r * dt; odM += m * dt; odO += oz * dt;
      const g = kugelS(p, s, R); let tR = 1e6, tM = 1e6, tO = 1e6;
      if (!(g[0] > 0 && g[1] > 0)) { const a2 = kugelS(p, s, RT), N2 = 4, d2 = a2[1] / N2; tR = tM = tO = 0; for (let j = 0; j < N2; j++) { const u = (j + 0.5) * d2, q = [p[0] + s[0] * u, p[1] + s[1] * u, p[2] + s[2] * u], hq = Math.hypot(q[0], q[1], q[2]) - R; tR += Math.exp(-hq / HR) * d2; tM += Math.exp(-hq / HM) * d2; tO += Math.max(0, 1 - Math.abs(hq - 25000) / 15000) * d2; } }
      for (let k = 0; k < 3; k++) { const Tv = Math.exp(-(BR[k] * odR + bm * 1.11 * odM + BO[k] * odO)), Ts = Math.exp(-(BR[k] * tR + bm * 1.11 * tM + BO[k] * tO)); L[k] += Tv * Ts * (BR[k] * r * pR + bm * m * pM) * dt; Ms[k] += Tv * (BR[k] * r + bm * m) * dt; }
    }
    const f = [0.030, 0.044, 0.078]; return [0, 1, 2].map(k => (L[k] + Ms[k] * f[k] * sh) * SONNE);
  }
  // Himmelskuppel: Mesh mit derselben Schnittstelle wie der Sky aus three (uniforms.sunPosition, uHimmel)
  kuppel() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { tHimmel: this.U.tHimmel, uSonneH: this.U.uSonneH, sunPosition: this.U.uSonneH, uUnten: { value: this.bodenFarbe }, uDip: this.dipU, uEnvSatt: { value: 1 }, uHimmel: { value: 1 }, uSonneFarbe: { value: this.sonneFarbe }, uZeit: { value: 0 }, uZirren: { value: 0.35 }, uNacht: { value: 0 }, uMond: { value: this.mondDir } },
      vertexShader: `varying vec3 vR; void main() { vR = (modelMatrix * vec4(position, 0.0)).xyz; vec4 p = projectionMatrix * viewMatrix * vec4(cameraPosition + vR, 1.0); gl_Position = p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: `varying vec3 vR; uniform float uHimmel, uZeit, uZirren, uNacht, uDip, uEnvSatt; uniform vec3 uSonneFarbe, uMond, uUnten; ${HIMMEL_GLSL}
        float wert(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453), c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
        float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * wert(p); p = p * 2.03 + vec2(13.1, 7.7); a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vR); vec3 c = himmelLUT(d.y < uDip ? normalize(vec3(d.x, uDip, d.z)) : d);
          // Unter dem Horizont liegt die Erde: dort sieht man den Himmel nur durch einen Spalt im Boden oder hinter der Sichtweite, dann in der Farbe des Bodens oder des Dunstes statt tiefblau
          c = mix(c, uUnten, smoothstep(uDip - 0.006, uDip - 0.035, d.y));
          // Federwolken hoch oben (Zirren): in die Länge gezogen, von der Sonne angestrahlt, zum Horizont dichter und blasser
          if (d.y > 0.01 && uZirren > 0.01) {
            vec2 q = d.xz / (d.y + 0.08) * 0.55 + vec2(uZeit * 0.002, uZeit * 0.0006);
            vec2 w = vec2(fbm(q * 1.3), fbm(q * 1.3 + 5.2)) - 0.5;
            float f = fbm(vec2(q.x * 2.2, q.y * 0.7) + w * 1.6);
            float a = smoothstep(0.52 - 0.14 * uZirren, 0.86, f) * smoothstep(0.01, 0.16, d.y) * (0.45 + 0.5 * uZirren);
            vec3 hell = uSonneFarbe * (0.75 + 0.5 * max(0.0, uSonneH.y)) * smoothstep(-0.12, 0.08, uSonneH.y) + himmelLUT(vec3(d.x, max(d.y, 0.3), d.z)) * 0.55;
            c = mix(c, hell, a * 0.85);
          }
          // Sonnenscheibe und Hof
          float k = dot(d, normalize(uSonneH));
          float tagS = smoothstep(-0.03, 0.02, uSonneH.y);
          c += uSonneFarbe * (smoothstep(0.99996, 0.99999, k) * 90.0 + pow(max(k, 0.0), 1600.0) * 1.8 + pow(max(k, 0.0), 180.0) * 0.1) * tagS;
          // Mond: Scheibe mit Meeren, Randabdunklung und Hof
          if (uNacht > 0.01) {
            float km = dot(d, uMond), r = 0.0135;
            if (km > 0.97) {
              vec3 ost = normalize(cross(uMond, vec3(0.0, 1.0, 0.0))), nord = cross(ost, uMond); vec2 u = vec2(dot(d, ost), dot(d, nord)) / r; float l2 = dot(u, u);
              if (l2 < 1.0) { float me = fbm(u * 1.7 + 4.3), kr = fbm(u * 7.0 + 1.3); c += vec3(1.0, 0.98, 0.93) * (0.42 + 0.72 * smoothstep(0.34, 0.6, me) + 0.14 * (kr - 0.5)) * (0.72 + 0.28 * sqrt(1.0 - l2)) * smoothstep(1.0, 0.97, l2) * 1.25 * uNacht; }
            }
            c += vec3(0.55, 0.64, 0.82) * (pow(max(km, 0.0), 9000.0) * 0.1 + pow(max(km, 0.0), 500.0) * 0.012 + pow(max(km, 0.0), 40.0) * 0.0035) * uNacht;
          }
          c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uEnvSatt);
          gl_FragColor = vec4(c * uHimmel, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: true, toneMapped: true, fog: false,
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.frustumCulled = false; m.renderOrder = -3; m.scale.setScalar(10000);
    return m;
  }
}

// ---------- Kontaktschatten und Luftperspektive als Pass nach dem Rendern ----------
const TIEFE_GLSL = `uniform sampler2D tTiefe; uniform mat4 uProjInv, uKamWelt; uniform float uNah, uFern;
  vec3 ansicht(vec2 uv, float d) { vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }`;

const AO_FS = `varying vec2 vUv; uniform vec2 uAufl; uniform vec2 uP; uniform float uAspekt; ${TIEFE_GLSL}
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float d = texture2D(tTiefe, vUv).x;
    if (d >= 0.99999) { gl_FragColor = vec4(1.0, 1e5, 0.0, 1.0); return; }
    vec3 P = ansicht(vUv, d); float dist = -P.z;
    if (dist > 900.0) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }
    vec2 e = 1.0 / uAufl;
    vec3 r = ansicht(vUv + vec2(e.x, 0.0), texture2D(tTiefe, vUv + vec2(e.x, 0.0)).x) - P, l = P - ansicht(vUv - vec2(e.x, 0.0), texture2D(tTiefe, vUv - vec2(e.x, 0.0)).x);
    vec3 u = ansicht(vUv + vec2(0.0, e.y), texture2D(tTiefe, vUv + vec2(0.0, e.y)).x) - P, o = P - ansicht(vUv - vec2(0.0, e.y), texture2D(tTiefe, vUv - vec2(0.0, e.y)).x);
    vec3 dx = abs(r.z) < abs(l.z) ? r : l, dy = abs(u.z) < abs(o.z) ? u : o, N = normalize(cross(dx, dy));
    float Rd = clamp(dist * 0.035, 0.55, 7.0), rUv = Rd * uP.y * 0.5 / dist, a0 = ign(gl_FragCoord.xy) * 6.2831853, occ = 0.0;
    const int NS = 12;
    for (int i = 0; i < NS; i++) {
      float fi = (float(i) + 0.5) / float(NS), a = a0 + float(i) * 2.399963, rr = sqrt(fi) * rUv;
      vec2 s = vUv + vec2(cos(a) * rr / uAspekt, sin(a) * rr);
      float ds = texture2D(tTiefe, s).x; if (ds >= 0.99999) continue;
      vec3 V = ansicht(s, ds) - P; float l2 = dot(V, V), vn = dot(V, N) / sqrt(l2 + 1e-4);
      occ += max(0.0, vn - 0.14) * (1.0 - smoothstep(0.35, 1.0, l2 / (Rd * Rd)));
    }
    float ao = 1.0 - clamp(occ / float(NS) * 2.6, 0.0, 1.0);
    ao = mix(ao, 1.0, smoothstep(500.0, 900.0, dist));
    gl_FragColor = vec4(ao, dist, 0.0, 1.0);
  }`;
const AO_BLUR_FS = `varying vec2 vUv; uniform sampler2D tAO; uniform vec2 uAufl;
  void main() {
    vec2 m = texture2D(tAO, vUv).xy; float s = 0.0, g = 0.0;
    for (int y = -2; y <= 1; y++) for (int x = -2; x <= 1; x++) {
      vec2 q = texture2D(tAO, vUv + (vec2(float(x), float(y)) + 0.5) / uAufl).xy;
      float w = exp(-abs(q.y - m.y) / max(0.03 * m.y, 0.08)); s += q.x * w; g += w;
    }
    gl_FragColor = vec4(s / max(g, 1e-4), m.y, 0.0, 1.0);
  }`;
// Sonnenstrahlen (05.11.2026, "wie GTA 6"): Blick von jedem Pixel Richtung Sonne durch die Tiefe, wie viel Himmel liegt dort. Häuser und Bäume schneiden Schatten in den Dunst. Viertel Auflösung, 22 Abrufe, danach weichgezeichnet.
const STRAHL_FS = `varying vec2 vUv; uniform sampler2D tTiefe; uniform vec2 uSonneUv; uniform float uAspekt;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    vec2 d = uSonneUv - vUv; float L = length(d * vec2(uAspekt, 1.0)), rand = max(0.0, 1.0 - L / 1.25);
    if (rand <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    const int N = 22; vec2 st = d * min(1.0, 0.9 / max(L, 1e-4)) / float(N), uv = vUv + st * ign(gl_FragCoord.xy); float s = 0.0, g = 0.0, w = 1.0;
    for (int i = 0; i < N; i++) { if (textureLod(tTiefe, uv, 0.0).x >= 0.99999) s += w; g += w; w *= 0.945; uv += st; }
    float r = s / g; gl_FragColor = vec4(vec3(r * rand * rand), 1.0);
  }`;
const STRAHL_BLUR_FS = `varying vec2 vUv; uniform sampler2D tStrahl; uniform vec2 uAufl;
  void main() { vec2 e = 1.0 / uAufl; float r = 0.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) r += texture2D(tStrahl, vUv + vec2(float(x), float(y)) * e * 1.5).r; gl_FragColor = vec4(vec3(r / 9.0), 1.0); }`;
const COMP_VS = `varying vec2 vUv; varying float vSichtbar; uniform sampler2D tTiefe; uniform vec2 uSonneUv; uniform float uStrahlStark;
  void main() { vUv = uv; float s = 0.0;   // sieht man die Sonne selbst? (für die Blendenreflexe)
    if (uStrahlStark > 0.001 && uSonneUv.x > 0.0 && uSonneUv.x < 1.0 && uSonneUv.y > 0.0 && uSonneUv.y < 1.0) { for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) if (textureLod(tTiefe, uSonneUv + vec2(float(x), float(y)) * 0.004, 0.0).x >= 0.99999) s += 1.0; s /= 25.0; }
    vSichtbar = s; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Sonnenstrahlen unter Wasser (Skill 3d-underwater-god-rays): ein Wellenfeld quer zur Sonne wird entlang jedes Sichtstrahls aufsummiert, die Strahlen laufen so im Raum zusammen und ziehen an den Fischen vorbei. Viertel Auflösung, unten weichgezeichnet
const UW_STRAHL_FS = `varying vec2 vUv; uniform mat4 uProjInv, uKamWelt; uniform vec3 uSonneH; uniform float uSeaY, uZeit;
  float swell(vec2 p, float t) { p += 0.62 * vec2(sin(p.y * 0.57 + t * 0.21), sin(p.x * 0.49 - t * 0.17)); return (sin(dot(p, vec2(0.86, 0.51)) + t * 0.29) + sin(dot(p, vec2(-0.42, 0.91)) * 1.23 - t * 0.24) + sin(dot(p, vec2(0.13, -0.99)) * 0.87 + t * 0.19) + sin(dot(p, vec2(-0.97, -0.24)) * 1.41 - t * 0.15)) * 0.25; }
  void main() {
    vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 ray = normalize(mat3(uKamWelt) * (v.xyz / v.w)), cam = uKamWelt[3].xyz, so = normalize(vec3(uSonneH.x, max(uSonneH.y, 0.25), uSonneH.z)); vec3 ex = normalize(cross(so, vec3(0.0, 1.0, 0.0))), ey = cross(ex, so);
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), total = 0.0, wei = 0.0;
    for (int i = 0; i < 18; i++) { float f = (float(i) + jit) / 18.0, t = 3.0 + 62.0 * f * f; vec3 p = cam + ray * t; if (p.y > uSeaY) break; vec2 q = vec2(dot(p, ex), dot(p, ey)) * 0.5; float s = swell(q, uZeit), fo = smoothstep(-0.05, 1.0, s), web = pow(1.0 - abs(swell(q * 2.6 + vec2(3.1, 7.7), uZeit * 1.35)), 5.0), d = max((uSeaY - p.y) / max(so.y, 0.2), 0.0), w = exp(-t * 0.05) * (0.08 + f); total += fo * fo * exp(-d * 0.014) * (0.45 + 0.9 * web) * w; wei += w; }
    total /= max(wei, 1e-4); float mu = max(dot(ray, so), 0.0); total = mix(total, 0.16, pow(mu, 28.0)); float ph = 0.7 + 1.1 * pow(mu, 5.0) + 0.9 * pow(mu, 40.0), unten = mix(0.45, 1.0, smoothstep(-0.45, 0.35, ray.y)); gl_FragColor = vec4(vec3(total * ph * unten), 1.0);
  }`;
const COMP_FS = `varying vec2 vUv; varying float vSichtbar; uniform vec4 uUW, uUWL; uniform vec3 uUWLP, uUWLD; uniform sampler2D tStrahl; uniform vec2 uSonneUv; uniform vec3 uStrahlF; uniform float uStrahlStark, uAspektC; uniform sampler2D tHS; uniform vec4 uHS; uniform vec3 uHN; uniform sampler2D tSzene, tAO, tWolkenS; uniform vec3 uBR, uSchMitte, uSchOst, uSchNord; uniform float uBA, uHA, uHK, uAOStark, uDunstAn, uSchStark, uSchS, uDipC; uniform vec2 uAufl; ${TIEFE_GLSL} ${HIMMEL_GLSL}
  float schicht(float y0, float dy, float d, float H) { float k = dy / H; float f = abs(k * d) < 1e-3 ? d : (1.0 - exp(-k * d)) / k; return exp(-max(y0, -2000.0) / H) * f; }
  float uwWelle(vec2 p, float t) { p += 0.62 * vec2(sin(p.y * 0.57 + t * 0.21), sin(p.x * 0.49 - t * 0.17)); return (sin(dot(p, vec2(0.86, 0.51)) + t * 0.29) + sin(dot(p, vec2(-0.42, 0.91)) * 1.23 - t * 0.24) + sin(dot(p, vec2(0.13, -0.99)) * 0.87 + t * 0.19) + sin(dot(p, vec2(-0.97, -0.24)) * 1.41 - t * 0.15)) * 0.25; }
  // Unter Wasser (Wunsch Nr. 64): Rot verschwindet nach wenigen Metern, ab rund 200 m dunkelblau, ab rund 1.000 m schwarz. Oberfläche von unten mit dem Fenster zum Himmel (Snellius, Kegel von 48,6 Grad), Rest Spiegelung des dunklen Wassers. Lampe für die Tiefe
  vec3 unterWasser(vec3 sc, float d) {
    vec3 Pv = ansicht(vUv, min(d, 0.999995)), cam = uKamWelt[3].xyz, ray = normalize(mat3(uKamWelt) * Pv);
    float dist = d < 0.99999 ? length(Pv) : 1e6, seaY = uUW.x, tag = uUW.y, zeit = uUW.z, dS = ray.y > 1e-3 ? (seaY - cam.y) / ray.y : 1e9; bool oben = dS < dist + 0.8;
    float dE = min(oben ? dS : dist, 4000.0); vec3 wp = cam + ray * dE, kD = vec3(0.22, 0.034, 0.0125), kC = vec3(0.3, 0.055, 0.035);
    float tK = max(seaY - cam.y, 0.0), tiefK = smoothstep(60.0, 500.0, tK); vec3 kV = mix(kC, vec3(0.02, 0.013, 0.011), tiefK); float  tE = max(seaY - wp.y, 0.0), tM = max(tK - ray.y * min(tK + 20.0, 70.0), 0.0), so = clamp(uSonneH.y, 0.0, 1.0);
    vec3 L = exp(-kD * tM) * tag, W = vec3(0.012, 0.085, 0.125) * (0.45 + 1.7 * so), c;
    if (oben) {
      vec2 p = wp.xz; float e = max(0.6, dS * 0.018), kf = 1.0 / (1.0 + dS * 0.004), t1 = zeit * 1.6, t2 = zeit * 2.3;
      vec2 g = vec2(uwWelle((p + vec2(e, 0.0)) * 0.35, t1) - uwWelle((p - vec2(e, 0.0)) * 0.35, t1), uwWelle((p + vec2(0.0, e)) * 0.35, t1) - uwWelle((p - vec2(0.0, e)) * 0.35, t1)) * 0.5 / e * 0.42;
      g += vec2(uwWelle((p + vec2(e, 0.0)) * 1.1, t2) - uwWelle((p - vec2(e, 0.0)) * 1.1, t2), uwWelle((p + vec2(0.0, e)) * 1.1, t2) - uwWelle((p - vec2(0.0, e)) * 1.1, t2)) * 0.5 / e * 0.13;
      vec3 n = normalize(vec3(-g.x * kf, 1.0, -g.y * kf)), rf = refract(ray, -n, 1.33); float cI = abs(dot(ray, n)), fenster = smoothstep(0.64, 0.74, cI);
      vec3 tief = W * exp(-kD * (tK + 30.0)) * tag * 0.8; c = tief;
      if (dot(rf, rf) > 0.1) { vec3 h = himmelLUT(normalize(vec3(rf.x, max(rf.y, 0.02), rf.z))); float mu = max(dot(rf, uSonneH), 0.0); h += uStrahlF * (pow(mu, 900.0) * 34.0 + pow(mu, 60.0) * 0.5) * smoothstep(-0.05, 0.1, uSonneH.y); c = mix(tief, h * 0.85, fenster); }
    } else {
      c = sc * exp(-kD * tE) * (0.3 + 0.7 * tag);
      if (uUWL.w > 0.001) { vec3 lv = wp - uUWLP; float ld = length(lv) + 0.001, ke = smoothstep(0.72, 0.9, dot(lv / ld, uUWLD)) * 2.2 + 0.55 * smoothstep(50.0, 3.0, ld); c += sc * min(uUWL.w * ke / (1.0 + ld * ld * 0.003), 1.1) * exp(-kV * ld); }
    }
    vec3 Tv = exp(-kV * dE); float st = 1.0 - exp(-0.05 * dE);
    c = c * Tv * (1.0 - st * 0.6 * (1.0 - tiefK)) + W * L * st;
    c += vec3(0.16, 0.4, 0.47) * uUWL.x * texture2D(tStrahl, vUv).r * exp(-tK * 0.014) * tag;
    return c;
  }
  void main() {
    vec4 s = texture2D(tSzene, vUv); float d = texture2D(tTiefe, vUv).x; vec3 c = s.rgb;
    if (uUW.w > 0.5) { c = unterWasser(c, d); if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); gl_FragColor = vec4(min(c, vec3(64.0)), s.a); return; }
    if (d < 0.99999) {   // der Himmel trägt seine Luft schon
    vec3 P = ansicht(vUv, d); float dist = length(P); vec3 dir = mat3(uKamWelt) * (P / dist);
    if (uAOStark > 0.001) {
      // Verdeckung tiefengetreu hochgerechnet: von vier Nachbarn zählen die mit ähnlichem Abstand
      vec2 t = 1.0 / uAufl; float z = -P.z, a = 0.0, g = 0.0;
      for (int i = 0; i < 4; i++) { vec2 o = (vec2(float(i & 1), float(i >> 1)) - 0.5) * t; vec2 q = texture2D(tAO, vUv + o).xy; float w = exp(-abs(q.y - z) / max(0.02 * z, 0.05)) + 1e-3; a += q.x * w; g += w; }
      float ao = a / g, l = dot(c, vec3(0.3, 0.55, 0.15));
      c *= mix(1.0, ao, uAOStark * (1.0 - 0.45 * smoothstep(0.6, 3.0, l)));   // helle Lichter (Fenster nachts, Sonne auf Weiß) weniger
    }
    if (uHS.w > 0.001) {
      // Sonnenschatten über die ganze Stadt (kit/stadtschatten.js): Strahl zur Sonne durch die Höhenkarte, nur außerhalb der echten Schattenkarte
      vec3 wp = (uKamWelt * vec4(P, 1.0)).xyz; float fa = smoothstep(uHN.z * 0.7, uHN.z * 0.97, length(wp.xz - uHN.xy));
      if (fa > 0.001) { float vis = 1.0, tq = 7.0; vec3 sd = uSonneH; for (int i = 0; i < 12; i++) { vec3 pq = wp + sd * tq; vec2 uq = (pq.xz - uHS.xy) * uHS.z + 0.5; if (uq.x < 0.0 || uq.y < 0.0 || uq.x > 1.0 || uq.y > 1.0) break; float hq = texture2D(tHS, vec2(uq.x, 1.0 - uq.y)).r; if (hq > 1.0) { vis = min(vis, smoothstep(-1.5, 3.0 + tq * 0.035, pq.y - (hq - 2000.0))); if (vis < 0.02) break; } tq *= 1.5; }
        c *= mix(vec3(1.0) - uHS.w * fa * vec3(0.52, 0.48, 0.36), vec3(1.0), vis); }
    }
    if (uSchStark > 0.001) {
      // Wolkenschatten (kit/wolkenberge.js): zieht über Stadt und Land, nimmt vor allem die Sonne weg
      vec3 q = (uKamWelt * vec4(P, 1.0)).xyz - uSchMitte; vec2 u = vec2(dot(q, uSchOst), dot(q, uSchNord)) / uSchS;
      float rand = smoothstep(0.5, 0.42, max(abs(u.x), abs(u.y))), sch = texture2D(tWolkenS, u + 0.5).r;
      c *= mix(1.0, 0.6 + 0.4 * sch, uSchStark * rand);
    }
    if (uDunstAn > 0.001) {
      float dy = dir.y; vec3 od = uBR * schicht(uHK, dy, dist, 8000.0); float oa = uBA * schicht(uHK, dy, dist, uHA);
      vec3 T = exp(-(od + vec3(oa)));
      // In der Luft: als Quelle der Himmel gleich über dem echten Horizont (aus 16 km Höhe ist er tief unter der Waagerechten, darüber wäre es schon dunkelblau). Der Himmel ist in diesem Bild rund zehnmal heller als das Land, in echt drei- bis fünfmal:
      // mit der vollen Einstreuung läge ein blauer Schleier über allem (06.11.2026). Darum wächst der Dunst aus der Luft erst auf langer Strecke, am Horizont endet er trotzdem in der Farbe des Himmels
      float kL = smoothstep(150.0, 2600.0, uHK); vec3 ins = himmelLUT(normalize(vec3(dir.x, max(dir.y, mix(0.018, uDipC + 0.006, kL)), dir.z)));
      vec3 w = 1.0 - T; { vec3 wg = mix(w, vec3(dot(w, vec3(0.3333))), 0.55); wg *= wg; wg *= wg; w = mix(w, wg, kL); }
      c = mix(c, c * (1.0 - w) + ins * w, uDunstAn);
    }
    }
    if (uStrahlStark > 0.001) {
      float wolke = 1.0; if (uSchStark > 0.001) { vec3 q = uKamWelt[3].xyz - uSchMitte; vec2 u = vec2(dot(q, uSchOst), dot(q, uSchNord)) / uSchS; wolke = mix(1.0, texture2D(tWolkenS, u + 0.5).r, uSchStark); }
      c += uStrahlF * texture2D(tStrahl, vUv).r * uStrahlStark * wolke;
      if (vSichtbar > 0.01) { vec2 a = vec2(uAspektC, 1.0), q = (vUv - 0.5) * a, sp = (uSonneUv - 0.5) * a; vec3 fl = vec3(0.9, 0.7, 0.5) * smoothstep(0.075, 0.062, length(q + sp * 0.35)) * 0.03 + vec3(0.5, 0.8, 0.9) * smoothstep(0.045, 0.034, length(q + sp * 0.7)) * 0.045 + vec3(0.7, 0.9, 0.6) * smoothstep(0.13, 0.118, length(q + sp * 1.2)) * 0.018 + vec3(0.9, 0.6, 0.8) * smoothstep(0.028, 0.02, length(q - sp * 0.32)) * 0.035; c += fl * uStrahlF * vSichtbar * wolke * 0.8; }
    }
    if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);   // ein ungültiger Bildpunkt würde im Glanz zu einem großen schwarzen oder weißen Fleck
    gl_FragColor = vec4(min(c, vec3(64.0)), s.a);
  }`;

// Bewegungsunschärfe der Kamera (05.11.2026, "wie GTA 6"): jeder Bildpunkt wird zurückgerechnet, wo er im letzten Bild stand, und entlang dieser Strecke gemittelt. Nah an der Kamera (das eigene Auto, die eigene Figur) nichts.
// Nur beim schnellen Fahren und im Jet, abschaltbar, zu Fuß aus. Viele kleine Abrufe statt einer eigenen Geschwindigkeitskarte.
const BLUR_FS = `varying vec2 vUv; uniform sampler2D tSzene, tTiefe; uniform mat4 uProjInv, uKamWelt, uVPalt; uniform float uStark;
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    float d = texture2D(tTiefe, vUv).x; vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 P = v.xyz / v.w; float dist = length(P);
    if (d >= 0.99999) { P = normalize(P) * 2e5; dist = 2e5; }
    vec4 q = uVPalt * (uKamWelt * vec4(P, 1.0)); vec2 alt = q.xy / q.w * 0.5 + 0.5, w = (vUv - alt) * uStark * smoothstep(7.0, 26.0, dist);
    float L = length(w); if (L > 0.035) w *= 0.035 / L;
    vec3 c = texture2D(tSzene, vUv).rgb; if (L < 0.0012) { gl_FragColor = vec4(c, 1.0); return; }
    float j = ign(gl_FragCoord.xy), g = 1.0; for (int i = 0; i < 8; i++) { vec2 u = vUv + w * ((float(i) + j) / 8.0 - 0.5); float dq = texture2D(tTiefe, u).x; if (dq < d - 0.0005 && d < 0.99999) continue; c += texture2D(tSzene, u).rgb; g += 1.0; }
    gl_FragColor = vec4(min(c / g, vec3(64.0)), 1.0);
  }`;
export class BlurPass extends Pass {
  constructor(atmosPass) {
    super(); this.ap = atmosPass; this.enabled = false; this.needsSwap = true; this.stark = 0; this.vp = new THREE.Matrix4(); this.vpAlt = new THREE.Matrix4(); this.posAlt = new THREE.Vector3(); this.gut = false;
    this.q = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tSzene: { value: null }, tTiefe: atmosPass.gem.tTiefe, uProjInv: atmosPass.gem.uProjInv, uKamWelt: atmosPass.gem.uKamWelt, uVPalt: { value: this.vpAlt }, uStark: { value: 0 } }, vertexShader: VS_QUAD, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false }));
  }
  // je Bild, nachdem die Kamera steht. stark: 0 aus bis 1
  setzen(camera, stark) {
    this.vpAlt.copy(this.vp); this.vp.multiplyMatrices(camera.projectionMatrix, _bm.copy(camera.matrixWorld).invert());
    const sprung = !this.gut || camera.position.distanceTo(this.posAlt) > 60; this.posAlt.copy(camera.position); this.gut = stark > 0.001;   // Ankerwechsel oder Sprung: ein Bild ohne
    this.stark = stark; this.enabled = stark > 0.001 && !sprung && this.ap.enabled; this.q.material.uniforms.uStark.value = stark;
  }
  render(renderer, writeBuffer, readBuffer) { this.q.material.uniforms.tSzene.value = readBuffer.texture; renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.q.render(renderer); }
  dispose() { this.q.dispose(); }
}
const _sv = new THREE.Vector3(), _bm = new THREE.Matrix4();
export class AtmosPass extends Pass {
  constructor(atmos) {
    super(); this.atmos = atmos; this.needsSwap = true; this.enabled = false;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.aoA = new THREE.WebGLRenderTarget(2, 2, opt); this.aoB = new THREE.WebGLRenderTarget(2, 2, opt);
    const gem = { tTiefe: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uKamWelt: { value: new THREE.Matrix4() }, uNah: { value: 1 }, uFern: { value: 1e4 } };
    this.ao = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...gem, uAufl: { value: new THREE.Vector2(2, 2) }, uP: { value: new THREE.Vector2(1, 1) }, uAspekt: { value: 1 } }, vertexShader: VS_QUAD, fragmentShader: AO_FS, depthTest: false, depthWrite: false }));
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tAO: { value: this.aoA.texture }, uAufl: { value: new THREE.Vector2(2, 2) } }, vertexShader: VS_QUAD, fragmentShader: AO_BLUR_FS, depthTest: false, depthWrite: false }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...gem, ...atmos.U, tSzene: { value: null }, tAO: { value: this.aoB.texture }, uBR: { value: new THREE.Vector3(...BR) }, uBA: { value: 1 / 16000 }, uHA: { value: 1500 }, uHK: { value: 2 }, uDipC: atmos.dipU, uAOStark: { value: 0.85 }, uDunstAn: { value: 1 }, uAufl: { value: new THREE.Vector2(2, 2) }, tWolkenS: { value: null }, uSchStark: { value: 0 }, uSchS: { value: 20000 }, uSchMitte: { value: new THREE.Vector3() }, uSchOst: { value: new THREE.Vector3(1, 0, 0) }, uSchNord: { value: new THREE.Vector3(0, 0, -1) } }, vertexShader: VS_QUAD, fragmentShader: COMP_FS, depthTest: false, depthWrite: false }));
    this.gem = gem; this.dunstBeta = 1 / 16000;
    const CU = this.comp.material.uniforms; this.comp.material.vertexShader = COMP_VS; CU.tHS = { value: null }; CU.uHS = { value: new THREE.Vector4(0, 0, 1, 0) }; CU.uHN = { value: new THREE.Vector3(0, 0, 1) };
    this.strahlA = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }); this.strahlB = this.strahlA.clone();
    CU.tStrahl = { value: this.strahlB.texture }; CU.uStrahlStark = { value: 0 }; CU.uStrahlF = { value: new THREE.Color(1, 1, 1) }; CU.uSonneUv = { value: new THREE.Vector2(0.5, 0.5) }; CU.uAspektC = { value: 1 };
    this.strahl = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tTiefe: gem.tTiefe, uSonneUv: CU.uSonneUv, uAspekt: CU.uAspektC }, vertexShader: VS_QUAD, fragmentShader: STRAHL_FS, depthTest: false, depthWrite: false }));
    this.strahlBlur = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tStrahl: { value: this.strahlA.texture }, uAufl: { value: new THREE.Vector2(2, 2) } }, vertexShader: VS_QUAD, fragmentShader: STRAHL_BLUR_FS, depthTest: false, depthWrite: false }));
    this.strahlKraft = 0;
    CU.uUW = { value: new THREE.Vector4(0, 0, 0, 0) }; CU.uUWL = { value: new THREE.Vector4(1.2, 0, 0, 0) }; CU.uUWLP = { value: new THREE.Vector3() }; CU.uUWLD = { value: new THREE.Vector3(0, 0, 1) };
    this.uwStrahl = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { uProjInv: gem.uProjInv, uKamWelt: gem.uKamWelt, uSonneH: atmos.U.uSonneH, uSeaY: { value: 0 }, uZeit: { value: 0 } }, vertexShader: VS_QUAD, fragmentShader: UW_STRAHL_FS, depthTest: false, depthWrite: false }));
  }
  // Unter Wasser (kit/unterwasser.js): { seaY, tag, zeit, tief, lampe, lampeP, lampeD } oder null
  unterwasser(a) {
    const C = this.comp.material.uniforms; if (!a) { C.uUW.value.w = 0; C.uUWL.value.w = 0; return; }
    C.uUW.value.set(a.seaY, a.tag, a.zeit, 1); C.uUWL.value.w = a.lampe || 0; C.uStrahlStark.value = 0; if (a.lampeP) C.uUWLP.value.copy(a.lampeP); if (a.lampeD) C.uUWLD.value.copy(a.lampeD);
    const U = this.uwStrahl.material.uniforms; U.uSeaY.value = a.seaY; U.uZeit.value = a.zeit; this.uwRay = a.tief < 500 && a.tag > 0.05;
  }
  setSize(w, h) { const a = Math.max(2, Math.ceil(w / 2)), b = Math.max(2, Math.ceil(h / 2)); this.aoA.setSize(a, b); this.aoB.setSize(a, b); this.ao.material.uniforms.uAufl.value.set(a, b); this.blur.material.uniforms.uAufl.value.set(a, b); this.comp.material.uniforms.uAufl.value.set(a, b); this.ao.material.uniforms.uAspekt.value = w / h;
    const c = Math.max(2, Math.ceil(w / 4)), e = Math.max(2, Math.ceil(h / 4)); this.strahlA.setSize(c, e); this.strahlB.setSize(c, e); this.strahlBlur.material.uniforms.uAufl.value.set(c, e); this.comp.material.uniforms.uAspektC.value = w / h; }
  // je Bild: Kamera, Höhe der Kamera über dem Meer, Dunst (1/m), Stärke der Verdeckung und des Dunsts
  update(camera, { hoehe = 2, beta = 1 / 16000, ao = 0.85, dunst = 1, strahlen = 0 }) {
    const C = this.comp.material.uniforms; C.uHK.value = hoehe; C.uBA.value = beta; C.uAOStark.value = ao; C.uDunstAn.value = dunst; this.strahlKraft = strahlen; this.matrizen(camera);
  }
  // unmittelbar vor dem Rendern: Kamera steht endgültig (sonst hinkt die Tiefe ein Bild hinterher und der Dunst zittert beim Fahren)
  matrizen(camera) {
    const g = this.gem; g.uProjInv.value.copy(camera.projectionMatrixInverse); g.uKamWelt.value.copy(camera.matrixWorld); g.uNah.value = camera.near; g.uFern.value = camera.far;
    this.ao.material.uniforms.uP.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    // Sonne auf dem Bildschirm, Stärke nach Sonnenstand (flach am stärksten) und Lage im Bild
    const C = this.comp.material.uniforms, so = this.atmos.U.uSonneH.value, st = this.atmos.sonneFarbe; _sv.copy(so).transformDirection(camera.matrixWorldInverse);
    let k = 0; if (this.strahlKraft > 0.001 && _sv.z < -0.05 && so.y > -0.03) {
      const pm = camera.projectionMatrix.elements, nx = pm[0] * _sv.x / -_sv.z, ny = pm[5] * _sv.y / -_sv.z; C.uSonneUv.value.set(nx * 0.5 + 0.5, ny * 0.5 + 0.5);
      k = this.strahlKraft * (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(nx), Math.abs(ny)), 1.0, 2.2)) * THREE.MathUtils.smoothstep(so.y, -0.03, 0.04) * (1 - 0.55 * THREE.MathUtils.smoothstep(so.y, 0.25, 0.8));
    }
    C.uStrahlStark.value = k; C.uStrahlF.value.setRGB(st.r, st.g, st.b);
  }
  // Sonnenschatten der Stadt (kit/stadtschatten.js): { tex, x, z, s, stark, nah: { x, z, r } } oder null
  stadtSchatten(a) { const C = this.comp.material.uniforms; if (!a) { C.uHS.value.w = 0; return; } C.tHS.value = a.tex; C.uHS.value.set(a.x, a.z, 1 / a.s, a.stark); C.uHN.value.set(a.nah.x, a.nah.z, a.nah.r); }
  // Wolkenschatten (kit/wolkenberge.js): { tex, mitte, ost, nord, s, stark } oder null
  schattenSetzen(a) {
    const C = this.comp.material.uniforms; if (!a) { C.uSchStark.value = 0; return; }
    C.tWolkenS.value = a.tex; C.uSchMitte.value.copy(a.mitte); C.uSchOst.value.copy(a.ost); C.uSchNord.value.copy(a.nord); C.uSchS.value = a.s; C.uSchStark.value = a.stark;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.gem.tTiefe.value = readBuffer.depthTexture;
    if (this.comp.material.uniforms.uAOStark.value > 0.001) {
      renderer.setRenderTarget(this.aoA); this.ao.render(renderer);
      renderer.setRenderTarget(this.aoB); this.blur.render(renderer);
    }
    const unter = this.comp.material.uniforms.uUW.value.w > 0.5;
    if (unter) { this.comp.material.uniforms.uUWL.value.x = this.uwRay ? 3.2 : 0; if (this.uwRay) { renderer.setRenderTarget(this.strahlA); this.uwStrahl.render(renderer); renderer.setRenderTarget(this.strahlB); this.strahlBlur.render(renderer); } }
    else if (this.comp.material.uniforms.uStrahlStark.value > 0.001) {
      renderer.setRenderTarget(this.strahlA); this.strahl.render(renderer);
      renderer.setRenderTarget(this.strahlB); this.strahlBlur.render(renderer);
    }
    this.comp.material.uniforms.tSzene.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.comp.render(renderer);
  }
  dispose() { this.aoA.dispose(); this.aoB.dispose(); this.ao.dispose(); this.blur.dispose(); this.comp.dispose(); this.uwStrahl.dispose(); this.strahlA.dispose(); this.strahlB.dispose(); this.strahl.dispose(); this.strahlBlur.dispose(); }
}
