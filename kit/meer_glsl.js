// Meer: Wellen und Licht als gemeinsamer Shader für die Kugel, das Wasser im Ort und das Wellennetz (05.11.2026, Nader: "Die Meere müssen auch richtig gut aussehen, mit Wellen, als wären das richtiges Meer, Wasser").
// Wellen: Summe aus Gerstner Wellen mit echter Tiefwasser Dispersion, je Pixel aus den Ableitungen schattiert, jede Welle blendet an ihrer eigenen Pixelgröße aus (Skill 3d-ultra-realistic-water). Was nicht mehr aufgelöst ist, wird zu Rauheit:
// Glitzern, Fresnel und Himmel kommen dann aus der Verteilung der Neigungen (Bruneton, Neyret, Holzschuch 2010). So gibt es vom Bootsdeck bis zum All denselben Glitzerpfad, ohne Flimmern und ohne Sprung.
import * as THREE from 'three';
import { HIMMEL_GLSL, HIMMEL_U } from './atmos.js';

import { MOBIL } from './geraet.js';
export const MEER_MOBIL = MOBIL;
// [Wellenlänge m, Höhe m, Richtung zum Wind in Grad, Steilheit Q]. Summe Q bleibt unter 1, sonst falten sich die Kämme durch sich selbst
const ALLE = [
  [262, 0.62, -9, 0.05], [211, 0.52, 13, 0.06], [156, 0.48, -24, 0.07], [121, 0.42, 21, 0.08], [93, 0.38, -7, 0.09], [68, 0.29, 37, 0.09], [47, 0.21, -33, 0.08], [33, 0.15, 11, 0.08],
  [23, 0.1, -52, 0.07], [15.5, 0.066, 46, 0.06], [10.3, 0.042, -19, 0.05], [6.6, 0.026, 62, 0.04], [4.2, 0.016, -66, 0.03], [2.7, 0.0098, 28, 0.02],
];
const HANDY = [ALLE[1], ALLE[3], ALLE[4], ALLE[6], ALLE[8], ALLE[9], ALLE[11]];
export const WELLEN = MEER_MOBIL ? HANDY : ALLE;
export const NW = WELLEN.length;

const nullV2 = () => new THREE.Vector2(), nullV3 = () => new THREE.Vector3();
export const MEER_U = {
  uWelleDir: { value: WELLEN.map(() => new THREE.Vector4()) }, uWelleQ: { value: WELLEN.map(() => new THREE.Vector2()) }, uWelleG: { value: WELLEN.map(() => new THREE.Vector2()) }, uWellePhase: { value: new Float32Array(NW) },
  uSeeA: { value: 1 }, uSeeQ: { value: 1 }, uMeerSigma: { value: 0.03 }, uSchaum: { value: 0.015 }, uLutEin: { value: 1 }, uMeerT: { value: 0 }, uAnkerH: { value: 0 },
  uMeerEx: { value: new THREE.Vector3(1, 0, 0) }, uMeerEz: { value: new THREE.Vector3(0, 0, 1) }, uMeerMitte: { value: nullV3() }, uMeerNah: { value: new THREE.Vector4() }, uMeerTief: { value: 14 }, uRestAlle: { value: nullV2() },
  uLichtDir: { value: new THREE.Vector3(0, 1, 0) }, uLichtE: { value: new THREE.Vector3(40, 38, 34) }, uMeerAmb: { value: new THREE.Vector3(0.6, 0.7, 0.9) }, uHimmelO: { value: new THREE.Vector3(0.2, 0.4, 0.8) }, uHimmelH: { value: new THREE.Vector3(0.7, 0.8, 0.9) },
  uDetA: { value: nullV2() }, uDetB: { value: nullV2() }, uFoamA: { value: nullV2() }, uFoamB: { value: nullV2() }, uWindA: { value: nullV2() },
  tMeerDetail: { value: null }, tHimmel: HIMMEL_U.tHimmel, uSonneH: HIMMEL_U.uSonneH,
  tSpurN: { value: null }, tSpurF: { value: null }, uSpurN: { value: new THREE.Vector4(0, 0, 1, 0) }, uSpurF: { value: new THREE.Vector4(0, 0, 1, 0) },   // Kielwasser: Mitte x, z, Kehrwert der Kante, an
  uNurMaske: { value: 0 }, uWarp: { value: new THREE.Vector4() },
  tKarteA: { value: null }, tKarteB: { value: null }, uKarte: { value: new THREE.Vector4(0, 0, 1, 0) },   // Küstenkarte: Mitte x, z, Kehrwert der Kante, gültig
  tSpiegel: { value: null }, uSpiegelVP: { value: new THREE.Matrix4() }, uSpiegelAn: { value: 0 },   // Spiegelbild der Schiffe im Wasser (kit/schiffe.js)
  tWolkenS: { value: null }, uSchM: { value: nullV3() }, uSchO: { value: new THREE.Vector3(1, 0, 0) }, uSchN: { value: new THREE.Vector3(0, 0, -1) }, uSchS: { value: 1 }, uSchK: { value: 0 },   // Wolkenschatten (kit/wolkenberge.js)
  uBrand: { value: new THREE.Vector4(2.4, 0, 1, 420) }, uBrandDb: { value: 50 },   // Brandung: K (Phase nach Abstand), Phase der Zeit, Höhe, Reichweite; Abstand des Brechpunkts
};

// Brandung: Wellen, deren Kämme parallel zum Ufer laufen. Phase aus dem Abstand zur Küste: im flachen Wasser werden sie langsamer und enger (Flachwasser Dispersion mit gleichmäßig ansteigendem Grund),
// sie wachsen bis zum Brechpunkt (Green), brechen und laufen als Schaumwalze aus. In Buchten folgen sie dem Ufer von selbst, abgeschirmte Stellen bleiben ruhig (Offenheit aus der Küstenkarte).
const BRAND_GLSL = `
  uniform vec4 uBrand, uKarte; uniform float uBrandDb;
  vec2 karteUV(vec2 xz) { return vec2(0.5 + (xz.x - uKarte.x) * uKarte.z, 0.5 - (xz.y - uKarte.y) * uKarte.z); }
  float brandStreu(vec2 p) { return sin(p.x * 0.0113 + p.y * 0.0071) * 1.7 + sin(p.y * 0.0191 - p.x * 0.0137 + 1.7) * 1.0 + sin(p.x * 0.031 + p.y * 0.027 + 4.0) * 0.45; }
  float brandAbschnitt(vec2 p) { return 0.62 + 0.38 * sin(p.x * 0.017 - p.y * 0.021 + 2.0) * sin(p.y * 0.0089 + p.x * 0.0063); }
  float brandPhase(float d, vec2 p) { return uBrand.x * sqrt(max(d, 0.0) + 6.0) + brandStreu(p) + uBrand.y; }
  float brandHoehe(float d, float off, vec2 p) { float D = uBrand.w; return uBrand.z * (0.04 + 0.96 * off * off) * (1.0 - smoothstep(D * 0.35, D, d)) * mix(0.3, 1.0, smoothstep(0.0, uBrandDb, d)) * brandAbschnitt(p); }
  float brandKamm(float phi) { float s = 0.5 + 0.5 * cos(phi + 0.85 * sin(phi)); return s * s * s; }
  // Stärke der offenen See: an der Küste klein, hinter Landzungen klein
  float meerAmp(float d, float off) { return mix(0.14, 1.0, smoothstep(0.0, 1.0, clamp(d / (uBrand.w * 1.25), 0.0, 1.0))) * mix(0.3, 1.0, off); }
`;
// Für den Vertex Shader des Netzes: nur der Hub
export const MEER_VS_GLSL = `
  #define NW ${NW}
  ${BRAND_GLSL}
  uniform vec4 uWelleDir[NW]; uniform vec2 uWelleQ[NW], uWelleG[NW]; uniform float uWellePhase[NW];
  uniform float uSeeA, uSeeQ, uAnkerH; uniform vec3 uMeerEx, uMeerEz, uMeerMitte; uniform vec4 uWarp;
  ${'' /* siehe meerWarp unten */}
  vec2 meerWarp(vec2 p) { vec2 q = p + uWarp.xy; return p + vec2(17.0 * sin(q.y * 0.0031 + 1.3) + 10.0 * sin(q.x * 0.0058 + q.y * 0.0041) + 6.0 * sin(q.y * 0.0137 - q.x * 0.0093 + 0.7), 15.0 * sin(q.x * 0.0027 + 4.1) + 9.0 * sin(q.y * 0.0063 - q.x * 0.0037) + 6.0 * sin(q.x * 0.0151 + q.y * 0.0089 + 2.9)); }
  // Wellengruppen: jede Welle ist mal stärker, mal schwächer, je nach Gegend. Sonst ergeben die festen Richtungen ein sichtbares Gitter. Zwei langsame Felder, jede Welle mischt sie anders
  vec2 meerGruppe(vec2 p) { vec2 q = p + uWarp.xy; return vec2(sin(q.x * 0.0017 + 1.1) * sin(q.y * 0.0023 + 0.4) * 0.7 + 0.3 * sin(q.x * 0.0041 - q.y * 0.0029 + 2.3), sin(q.x * 0.0029 + q.y * 0.0011 + 3.7) * sin(q.y * 0.0019 - q.x * 0.0013 + 0.9) * 0.7 + 0.3 * sin(q.y * 0.0047 + q.x * 0.0037 + 5.1)); }
  vec3 meerHub(vec2 p0, float foot, float amp) {
    vec3 d = vec3(0.0); vec2 p = meerWarp(p0), gr = meerGruppe(p0);
    for (int i = 0; i < NW; i++) {
      vec4 w = uWelleDir[i]; float L = uWelleQ[i].y, fade = 1.0 - smoothstep(L * 0.18, L * 0.5, foot); if (fade <= 0.0) continue;
      fade *= 1.0 + dot(uWelleG[i], gr);
      float A = w.w * fade * uSeeA * amp, QA = uWelleQ[i].x * fade * uSeeQ * amp, th = w.z * dot(w.xy, p) + uWellePhase[i], s = sin(th), c = cos(th);
      d.y += A * s; d.x += QA * w.x * c; d.z += QA * w.y * c;
    }
    return d;
  }
`;
export const MEER_GLSL = `
  #define NW ${NW}
  ${BRAND_GLSL}
  uniform sampler2D tKarteB;
  uniform vec4 uWelleDir[NW]; uniform vec2 uWelleQ[NW], uWelleG[NW]; uniform float uWellePhase[NW];
  uniform float uSeeA, uSeeQ, uMeerSigma, uSchaum, uLutEin, uMeerT, uAnkerH;
  uniform vec3 uMeerEx, uMeerEz, uMeerMitte, uLichtDir, uLichtE, uMeerAmb, uHimmelO, uHimmelH;
  uniform vec2 uDetA, uDetB, uFoamA, uFoamB, uWindA, uRestAlle; uniform vec4 uWarp;
  uniform sampler2D tMeerDetail, tSpurN, tSpurF; uniform vec4 uSpurN, uSpurF;
  #ifdef MEER_NETZ
  uniform sampler2D tWolkenS, tSpiegel; uniform mat4 uSpiegelVP; uniform float uSpiegelAn; uniform vec3 uSchM, uSchO, uSchN; uniform float uSchS, uSchK;   // nur im Wellennetz, der Kachelshader ist am Limit der Texturen
  #endif
  ${HIMMEL_GLSL}
  vec2 meerWarp(vec2 p) { vec2 q = p + uWarp.xy; return p + vec2(17.0 * sin(q.y * 0.0031 + 1.3) + 10.0 * sin(q.x * 0.0058 + q.y * 0.0041) + 6.0 * sin(q.y * 0.0137 - q.x * 0.0093 + 0.7), 15.0 * sin(q.x * 0.0027 + 4.1) + 9.0 * sin(q.y * 0.0063 - q.x * 0.0037) + 6.0 * sin(q.x * 0.0151 + q.y * 0.0089 + 2.9)); }
  // Wellengruppen: jede Welle ist mal stärker, mal schwächer, je nach Gegend. Sonst ergeben die festen Richtungen ein sichtbares Gitter. Zwei langsame Felder, jede Welle mischt sie anders
  vec2 meerGruppe(vec2 p) { vec2 q = p + uWarp.xy; return vec2(sin(q.x * 0.0017 + 1.1) * sin(q.y * 0.0023 + 0.4) * 0.7 + 0.3 * sin(q.x * 0.0041 - q.y * 0.0029 + 2.3), sin(q.x * 0.0029 + q.y * 0.0011 + 3.7) * sin(q.y * 0.0019 - q.x * 0.0013 + 0.9) * 0.7 + 0.3 * sin(q.y * 0.0047 + q.x * 0.0037 + 5.1)); }
  vec2 meerEbene(vec3 w) { vec3 r = w - uMeerMitte; return vec2(dot(r, uMeerEx), dot(r, uMeerEz)); }
  // Kielwasser: nah fein, fern grob. R Bugwelle, G Gischt, B glatte Spur, A Höhe der Kelvinwellen
  vec2 gSpurG = vec2(0.0);
  vec4 meerSpur(vec2 xz) {
    vec4 s = vec4(0.0, 0.0, 0.0, 0.5); gSpurG = vec2(0.0);
    if (uSpurF.w > 0.5) { vec2 u = vec2(0.5 + (xz.x - uSpurF.x) * uSpurF.z, 0.5 - (xz.y - uSpurF.y) * uSpurF.z); if (u.x > 0.0 && u.x < 1.0 && u.y > 0.0 && u.y < 1.0) s = textureLod(tSpurF, u, 0.0); }
    if (uSpurN.w > 0.5) { vec2 u = vec2(0.5 + (xz.x - uSpurN.x) * uSpurN.z, 0.5 - (xz.y - uSpurN.y) * uSpurN.z), r = abs(u - 0.5) * 2.0; float k = 1.0 - smoothstep(0.85, 1.0, max(r.x, r.y)); if (k > 0.0) { vec4 n = textureLod(tSpurN, u, 0.0); s = mix(s, n, k); float e = 0.0012, m = 1.0 / (e / uSpurN.z); gSpurG = vec2(textureLod(tSpurN, u + vec2(e, 0.0), 0.0).a - n.a, n.a - textureLod(tSpurN, u + vec2(0.0, e), 0.0).a) * m * 2.0 * k; } }
    s.a = (s.a - 0.5) * 2.0; return s;
  }
  // Hub und Ableitungen (je Pixel); rest: Neigungen der Wellen, die unter die Pixelgröße fallen
  vec3 meerWellen(vec2 p0, float foot, float amp, float ruhig, out vec3 dX, out vec3 dZ, out float rest) {
    vec3 d = vec3(0.0); dX = vec3(1.0, 0.0, 0.0); dZ = vec3(0.0, 0.0, 1.0); rest = 0.0; vec2 p = meerWarp(p0), gr = meerGruppe(p0);
    for (int i = 0; i < NW; i++) {
      vec4 w = uWelleDir[i]; float L = uWelleQ[i].y, fade = 1.0 - smoothstep(L * 0.18, L * 0.5, foot);
      float kk = amp * mix(1.0, (1.0 - smoothstep(8.0, 30.0, L)) * 0.3, ruhig), kA0 = w.z * w.w * uSeeA * kk;
      rest += (1.0 - fade * fade) * 0.5 * kA0 * kA0;
      if (fade <= 0.0) continue;
      fade *= 1.0 + dot(uWelleG[i], gr);
      float A = w.w * fade * uSeeA * kk, QA = uWelleQ[i].x * fade * uSeeQ * kk, th = w.z * dot(w.xy, p) + uWellePhase[i], s = sin(th), c = cos(th);
      d.y += A * s; d.x += QA * w.x * c; d.z += QA * w.y * c;
      float kA = w.z * A, kQ = w.z * QA;
      dX.x -= kQ * w.x * w.x * s; dX.y += kA * w.x * c; dX.z -= kQ * w.x * w.y * s;
      dZ.x -= kQ * w.x * w.y * s; dZ.y += kA * w.y * c; dZ.z -= kQ * w.y * w.y * s;
    }
    return d;
  }
  float meerLambda(float c, float s2) { float v = c / sqrt(max((1.0 - c * c) * 2.0 * s2, 1e-6)), e = 2.0 * exp(-v * v) / (2.319 * v + sqrt(4.0 + 1.52 * v * v)); return max(0.0, (exp(-v * v) - v * 1.7724539 * e) / (2.0 * v * 1.7724539)); }
  float meerSonne(vec3 L, vec3 V, vec3 N, float s2) {
    vec3 H = normalize(L + V); float zH = max(dot(H, N), 1e-3), zL = max(dot(L, N), 0.01), zV = max(dot(V, N), 0.01), zH2 = zH * zH, tan2 = (1.0 - zH2) / zH2;
    float p = exp(-0.5 * tan2 / s2) / (6.2831853 * s2), F = 0.02 + 0.98 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
    return F * p / ((1.0 + meerLambda(zL, s2) + meerLambda(zV, s2)) * zV * zH2 * zH2 * 4.0);
  }
  // p: Ebene der Wellen, dpx, dpy: Ableitungen von p (vor jeder Verzweigung gebildet), Ng: Normale der glatten Meeresfläche
  vec3 meerFarbe(vec2 p, vec2 dpx, vec2 dpy, vec3 Ng, vec3 V, float dist, float flach, vec3 tint, float schatten, float ruhig, vec4 br, vec4 wk) {
    float foot = max(length(dpx) + length(dpy), 1e-3), dK = br.x, offen = br.y, amp = meerAmp(dK, offen);
    // Wolkenschatten: nimmt dem Wasser die Sonne, die Spiegelung des Himmels bleibt. AtmosPass dunkelt später alles gleich ab, das wird hier zurückgerechnet
    float schAus = 1.0;
    #ifdef MEER_NETZ
    if (uSchK > 0.001) { vec3 w = uMeerMitte + uMeerEx * p.x + uMeerEz * p.y - uSchM; vec2 u = vec2(dot(w, uSchO), dot(w, uSchN)) / uSchS; float ra = smoothstep(0.5, 0.42, max(abs(u.x), abs(u.y))), sw = texture2D(tWolkenS, u + 0.5).r, st = uSchK * ra; schatten *= mix(1.0, sw, st); schAus = mix(1.0, 0.44 + 0.56 * sw, st); }
    #endif
    // Ab 65 m je Pixel ist keine Welle mehr aufgelöst (die längste misst 262 m): dann nur noch die Summe ihrer Neigungen, ohne die Schleife über alle Wellen
    vec3 dX = vec3(1.0, 0.0, 0.0), dZ = vec3(0.0, 0.0, 1.0), d = vec3(0.0); float rest;
    if (foot < 65.6) d = meerWellen(p, foot * 2.0, amp, ruhig, dX, dZ, rest); else rest = mix(uRestAlle.x, uRestAlle.y, ruhig) * uSeeA * uSeeA * amp * amp;
    vec3 np = normalize(cross(dZ, dX));
    float J = dX.x * dZ.z - dX.z * dZ.x;
    // Windfelder: große Flecken, in denen das Wasser rauer ist (von oben heller und dunkler), damit sich nichts sichtbar wiederholt
    vec2 q1 = p / 1900.0 + uWindA, q2 = vec2(p.y, -p.x) / 610.0 - uWindA * 1.7;
    float lgW = 0.5 * log2(max(length(dpx) * length(dpy), 1e-4)), wind = textureLod(tMeerDetail, q1, lgW - 1.892).a * 0.62 + textureLod(tMeerDetail, q2, lgW - 0.252).a * 0.38;   // Mip aus dem Mittel der Achsen: große weiche Flecken brauchen keine anisotrope Filterung
    float flecken = smoothstep(0.32, 0.68, wind);
    // Feinstruktur: zwei wandernde Lagen, solange man sie noch auflösen kann
    float fDet = 1.0 - smoothstep(1.2, 16.0, foot), calm = 1.0 - 0.7 * wk.b;
    if (fDet > 0.0) {
      vec2 a = textureGrad(tMeerDetail, p / 19.0 + uDetA, dpx / 19.0, dpy / 19.0).xy * 2.0 - 1.0;
      vec2 b = textureGrad(tMeerDetail, vec2(p.y, -p.x) / 7.3 + uDetB, vec2(dpx.y, -dpx.x) / 7.3, vec2(dpy.y, -dpy.x) / 7.3).xy * 2.0 - 1.0;
      np.xz += (a * 0.65 + vec2(-b.y, b.x) * 0.45) * (0.17 + 0.17 * flecken) * fDet * calm * mix(1.0, 0.45, ruhig);
    }
    // Kleine Kräuselwellen: zerlegen die Sonne ganz nah in einzelne Funken
    float fMikro = 1.0 - smoothstep(0.04, 1.1, foot); vec2 mikro = vec2(0.0);
    if (fMikro > 0.0) {
      vec2 c1 = textureGrad(tMeerDetail, vec2(-p.y, p.x) / 2.6 + uDetB * 2.3, vec2(-dpx.y, dpx.x) / 2.6, vec2(-dpy.y, dpy.x) / 2.6).xy * 2.0 - 1.0;
      vec2 c2 = textureGrad(tMeerDetail, p / 0.97 - uDetA * 3.1, dpx / 0.97, dpy / 0.97).xy * 2.0 - 1.0;
      mikro = (c1 * 0.62 + c2 * 0.38) * 0.36 * fMikro * calm * mix(1.0, 0.4, ruhig);   // nur für die Sonne, im Himmel gäbe es ein Gittermuster
    }
    np = normalize(np);
    vec3 N = normalize(uMeerEx * np.x + Ng * np.y + uMeerEz * np.z);
    if (gSpurG.x != 0.0 || gSpurG.y != 0.0) N = normalize(N - vec3(gSpurG.x, 0.0, gSpurG.y) * 0.7);   // Kelvinwellen hinter dem Schiff
    // Brandung: Neigung aus der Ableitung nach dem Abstand, dazu Lage des Kamms für Schaum und Licht
    float phiB = 0.0, hB = 0.0, kB = 0.0;
    if (dK < uBrand.w && foot < 30.0 && ruhig < 0.5) {
      float e = max(0.6, foot * 0.7); phiB = brandPhase(dK, p); hB = brandHoehe(dK, offen, p); kB = brandKamm(phiB);
      float y0 = hB * kB, y1 = brandHoehe(dK + e, offen, p) * brandKamm(brandPhase(dK + e, p));
      float sl = clamp((y1 - y0) / e, -0.9, 0.9) * (1.0 - smoothstep(6.0, 30.0, foot));
      N = normalize(N - vec3(br.z, 0.0, -br.w) * sl);
    }
    // Rauheit: was das Bild nicht mehr auflöst. Ruhige Flecken und Kielwasser glatter
    float s2 = max((uMeerSigma * mix(1.0, 0.32, fDet) * mix(0.1, 1.0, smoothstep(0.03, 2.2, foot)) * mix(0.62, 1.3, flecken) + rest) * calm * mix(1.0, 0.4, ruhig), 0.0011);
    float sv = sqrt(s2), cv = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - cv, 5.0 * exp(-2.69 * sv)) / (1.0 + 22.7 * pow(sv, 1.5));
    // Himmel in der Spiegelung: raue See schaut im Mittel steiler nach oben, darum ist das Meer am Horizont dunkler als die Luft
    vec3 R = reflect(-V, N); float ry = dot(R, Ng); R = normalize(R + Ng * (max(abs(ry), sv * 1.15 + 0.004) - ry));
    float tagS = smoothstep(-0.2, 0.06, dot(Ng, uSonneH));
    vec3 himmelA = mix(uHimmelH, uHimmelO, sqrt(max(dot(R, Ng), 0.0))) * tagS, himmel = himmelA;
    float lut = uLutEin * (1.0 - smoothstep(2.5e5, 8e5, dist)); if (lut > 0.0) himmel = mix(himmelA, himmelLUT(R), lut);
    himmel = mix(vec3(dot(himmel, vec3(0.3, 0.55, 0.15))), himmel, 0.74) + vec3(0.016, 0.024, 0.04) * (1.0 - tagS);   // Spiegelung weniger satt als der Himmel selbst (Wolken, Dunst), nachts ein Rest Himmelslicht
    // Licht im Wasser: Himmel und Sonne von oben
    vec3 L = uLichtDir; float sonneAuf = max(dot(Ng, L), 0.0), NL = max(dot(N, L), 0.0);
    vec3 lichtW = uMeerAmb * mix(0.08, 1.0, tagS) + uLichtE * 0.025 * sonneAuf * schatten + vec3(0.025, 0.035, 0.06) * (1.0 - tagS);
    vec2 Lh = L.xz / max(length(L.xz), 1e-3), Vh = V.xz / max(length(V.xz), 1e-3);
    float gegen = pow(max(dot(-Vh, Lh), 0.0), 2.0), hgt = smoothstep(-0.7, 1.1, d.y), kipp = clamp(1.0 - np.y, 0.0, 1.0);
    float sss = (0.25 + 0.75 * gegen) * hgt * (0.3 + kipp * 4.5) * (1.0 - smoothstep(6.0, 60.0, foot));
    vec3 tiefF = mix(vec3(0.0075, 0.03, 0.043), vec3(0.016, 0.034, 0.03), ruhig), durch = vec3(0.02, 0.17, 0.15);
    himmel = mix(himmel, vec3(dot(himmel, vec3(0.3, 0.55, 0.15))) * vec3(0.96, 1.0, 0.98), ruhig * 0.42);
    vec3 koerper = (tiefF + durch * (sss + 0.012)) * lichtW;
    koerper += durch * 0.09 * wk.g * lichtW;                                                                       // luftreiches Wasser im Kielwasser ist heller
    { vec3 flachF = max(tint * 0.62, mix(vec3(0.03, 0.135, 0.135), vec3(0.2, 0.3, 0.25), 1.0 - smoothstep(1.0, 14.0, dK)));   // flach: Grund und Farbe des Satellitenbilds (Lagunen, Sandbänke), ganz vorn Sand
      koerper = mix(koerper, flachF * lichtW * (0.82 + 0.3 * hgt), flach * 0.86); }
    float spA = 0.0;
    #ifdef MEER_NETZ
    if (uSpiegelAn > 0.5 && dist < 4000.0) {   // Schiffe im Wasser: Bildpunkt aus dem gespiegelten Blick, die Wellen ziehen das Bild senkrecht in Streifen
      vec4 q = uSpiegelVP * vec4(uMeerMitte + uMeerEx * p.x + uMeerEz * p.y, 1.0);
      if (q.w > 0.0) { float kS = clamp(70.0 / dist, 0.07, 0.6); vec2 uvS = q.xy / q.w * 0.5 + 0.5 + vec2(np.x * 0.11, np.z * 0.55) * kS * mix(1.0, 0.35, calm < 0.8 ? 1.0 : 0.0); vec2 df = vec2(0.0016, 0.006) * (1.0 + dist * 0.004); vec4 sp = (textureLod(tSpiegel, uvS, 0.0) * 2.0 + textureLod(tSpiegel, uvS + df, 0.0) + textureLod(tSpiegel, uvS - df, 0.0) + textureLod(tSpiegel, uvS + df * vec2(-1.0, 2.2), 0.0)) / 5.0; spA = sp.a * 0.92; sp.rgb /= max(sp.a, 0.02); himmel = mix(himmel, sp.rgb, spA); koerper *= 1.0 - 0.4 * spA; F = max(F, spA * 0.14 * (1.0 - cv)); }
    }
    #endif
    vec3 col = mix(koerper, himmel, F);
    // Sonne: Glitzern. Schwach auch der Hof um die Spiegelung
    float tagL = smoothstep(-0.03, 0.05, dot(Ng, L));
    vec3 specR = uLichtE * meerSonne(L, V, normalize(N + uMeerEx * mikro.x + uMeerEz * mikro.y), s2);
    // Weiter weg zerfällt der Hof in Funken: Rauschen mit bewusst zu scharfer Mip Stufe, im Mittel 1. Ganz fern wird das Rauschen von selbst glatt
    float mipF = log2(max(foot, 1e-3) * 512.0 / 11.0) - 1.2;
    float kFu = smoothstep(7.4, 8.9, mipF), funken = 0.72;
    if (kFu < 1.0) { vec2 gf1 = textureLod(tMeerDetail, p / 11.0 + uDetA * 5.0, mipF).xy, gf2 = textureLod(tMeerDetail, vec2(p.y, -p.x) / 17.0 - uDetB * 3.3, mipF + 0.55).xy; funken = mix(exp(clamp(((gf1.x - 0.5) + (gf2.y - 0.5)) * 18.0, -3.0, 2.6)) * 0.72, 0.72, kFu); }
    vec3 spec = specR / (1.0 + specR / mix(2.0, 9.0, 1.0 - smoothstep(0.1, 2.4, foot)));   // Hof begrenzt: Glitzerpfad statt weißer Fläche
    spec = min(spec * funken, vec3(11.0)) * schatten * tagL * mix(1.0, 0.22, ruhig);   // Flüsse und Seen: kein weißer Blitz über die ganze Breite
    // Schaum: Muster mit der Maske schwellen, damit er in Spitzen zerfällt statt grau zu werden
    float kamm = smoothstep(0.86 - 0.26 * uSeeA, 0.36, J) * smoothstep(0.1, 0.8, d.y * 0.6 + 0.3) * mix(0.25, 1.0, flecken) * (1.0 - 0.8 * ruhig);
    float bander = 0.0;
    if (dK < uBrand.w && ruhig < 0.5) {   // Brandung: am Brechpunkt schäumt der Kamm, dahinter zieht eine Walze aus Schaum aufs Ufer, ganz vorn ein Saum
      float db = uBrandDb, stark = clamp(hB / max(uBrand.z, 0.05), 0.0, 1.0);
      float zurueck = fract((phiB + 3.14159) / 6.2831853);                                                   // 0 direkt hinter dem Kamm (zum Meer hin), wächst bis zum nächsten
      float walze = exp(-zurueck * 4.2), bricht = 1.0 - smoothstep(db * 0.85, db * 1.7, dK);
      bander = max(sqrt(kB) * smoothstep(db * 2.1, db * 1.15, dK) * stark * 0.6 * (1.0 - smoothstep(4.0, 18.0, foot)), walze * bricht * mix(0.45, 1.0, stark)) * mix(0.45, 1.0, smoothstep(0.35, 0.6, wind)) * smoothstep(0.1, 0.5, offen);
      bander = max(bander, (1.0 - smoothstep(1.5, 3.0 + (4.0 + uBrand.z * 5.0) * offen, dK)) * (0.12 + 0.75 * offen));        // Saum am Ufer
      bander = max(bander, (1.0 - smoothstep(db * 0.2, db * 1.2, dK)) * 0.3 * offen);                        // Rest aus Blasen zwischen den Walzen
    }
    vec3 Lp = vec3(0.0); float muster = 0.0, fFern = smoothstep(9.0, 70.0, foot);
    if (fFern < 1.0) { vec4 f1 = textureGrad(tMeerDetail, p / 9.0 + uFoamA, dpx / 9.0, dpy / 9.0), f2 = textureGrad(tMeerDetail, p / 3.3 + uFoamB, dpx / 3.3, dpy / 3.3); muster = f1.b * 0.72 + f2.b * 0.28; }
    float maske = clamp(max(max(kamm * 0.78, bander), max(wk.r * 0.75, wk.g * 0.95)), 0.0, 1.0);
    float schaum = smoothstep(1.0 - maske, 1.2 - maske, muster * 0.88 + maske * 0.22);
    schaum = mix(schaum, maske * 0.32 + uSchaum * (0.25 + 1.5 * flecken) * (1.0 - ruhig), fFern);
    vec3 schaumF = vec3(0.9, 0.93, 0.95) * (uMeerAmb * mix(0.06, 1.0, tagS) * 1.05 + uLichtE * 0.025 * (0.25 + 0.75 * NL) * schatten) * (0.78 + 0.22 * muster);
    col = mix(col, schaumF, clamp(schaum, 0.0, 1.0));
    return (col + spec * (1.0 - clamp(schaum, 0.0, 1.0))) / schAus;
  }
`;

// Land dicht am Wasser (Kugel): nasser Sand und die auflaufende Zunge. Sitzt im selben Shader wie das Meer, nutzt dessen Schaumgitter
export const MEER_STRAND_GLSL = `
  vec3 meerStrand(vec3 c, vec2 xz, vec2 p) {
    if (uKarte.w < 0.5) return c; vec2 ku = karteUV(xz); if (ku.x < 0.0 || ku.x > 1.0 || ku.y < 0.0 || ku.y > 1.0) return c;
    vec4 b = textureLod(tKarteB, ku, 0.0); float d = b.r; if (d >= 1.0 || d < -44.0) return c;
    float H = uBrand.z * (0.05 + 0.95 * b.g * b.g), weit = 1.2 + H * 6.0, inl = -d;
    float nass = 1.0 - smoothstep(weit * 0.8, weit * 1.7, inl + 2.0 * sin(p.x * 0.05 + p.y * 0.04)); c *= mix(1.0, 0.6, nass);
    float lauf = weit * (0.3 + 0.7 * pow(0.5 + 0.5 * cos(brandPhase(0.0, p)), 1.4));
    vec4 f = textureLod(tMeerDetail, p / 5.0 + uFoamA, 0.0); float rand = lauf + (f.a - 0.5) * 4.0;
    float zunge = 1.0 - smoothstep(rand - 0.8, rand + 0.2, inl), vorn = zunge * smoothstep(rand - 3.0, rand - 0.6, inl);
    float muster = smoothstep(0.42, 0.78, f.b + vorn * 0.35);
    vec3 licht = uMeerAmb * 0.9 + uLichtE * 0.025 * max(uLichtDir.y, 0.0);
    return mix(c, mix(vec3(0.075, 0.13, 0.12), vec3(0.86, 0.87, 0.85), muster * (0.3 + 0.7 * vorn)) * licht, zunge * mix(0.42, 0.9, max(muster * 0.6, vorn)));
  }
`;
// Streifen auf dem Land im gebauten Ort: dieselbe Zunge und derselbe nasse Sand wie auf der Kugel
export function strandMaterial() {
  const uni = {}; for (const k in MEER_U) uni[k] = MEER_U[k];
  return new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -60, fog: false,
    vertexShader: 'attribute float aInl; varying float vInl; varying vec3 vW; void main() { vInl = aInl; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying float vInl; varying vec3 vW;
      ${MEER_GLSL}
      void main() {
        vec2 p = meerEbene(vW), kuS = karteUV(vW.xz); float offS = uKarte.w > 0.5 && kuS.x > 0.0 && kuS.x < 1.0 && kuS.y > 0.0 && kuS.y < 1.0 ? texture2D(tKarteB, kuS).g : 1.0, H = uBrand.z * (0.04 + 0.9 * offS * offS), weit = 1.0 + H * 6.0, ph = brandPhase(0.0, p), lauf = weit * (0.3 + 0.7 * pow(0.5 + 0.5 * cos(ph), 1.4));
        vec4 f = texture2D(tMeerDetail, p / 5.0 + uFoamA), f2 = texture2D(tMeerDetail, p / 2.1 - uFoamB); float rnd = lauf + (f.a - 0.5) * 4.0, zunge = 1.0 - smoothstep(rnd - 0.6, rnd + 0.1, vInl);
        float vorn = zunge * smoothstep(rnd - 2.4, rnd - 0.5, vInl), muster = smoothstep(0.42, 0.78, f.b * 0.7 + f2.b * 0.3 + vorn * 0.35);
        float nass = 1.0 - smoothstep(weit * 0.8, weit * 1.7, vInl + 1.8 * sin(p.x * 0.05 + p.y * 0.04));
        vec3 licht = uMeerAmb * 0.9 + uLichtE * 0.025 * max(uLichtDir.y, 0.0), wasser = mix(vec3(0.075, 0.13, 0.12), vec3(0.86, 0.87, 0.85), muster * (0.3 + 0.7 * vorn)) * licht;
        float a = max(zunge * mix(0.42, 0.9, max(muster * 0.6, vorn)), nass * 0.3); if (a < 0.004) discard;
        gl_FragColor = vec4(mix(vec3(0.012, 0.01, 0.008) * licht, wasser, clamp(zunge * 2.0, 0.0, 1.0)), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
}
// Feine Muster, einmal gebacken (512 mal 512, nahtlos): RG Mikro Normale, B Schaumgitter, A Rauschen. Nach dem Skill 3d-ultra-realistic-water
const RAUSCHEN = `
  float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float wertP(vec2 p, vec2 per) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f), a = mod(i, per), b = mod(i + 1.0, per); return mix(mix(hash21(a), hash21(vec2(b.x, a.y)), u.x), mix(hash21(vec2(a.x, b.y)), hash21(b), u.x), u.y); }
  float fbmP(vec2 p, vec2 per) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * wertP(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s / 0.97; }
  float worley(vec2 p, float per) { vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0; for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), r = g + hash22(mod(i + g, per)) - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } return sqrt(d2) - sqrt(d1); }
`;
export function meerDetailBacken(renderer, groesse = 512) {
  const rt = new THREE.WebGLRenderTarget(groesse, groesse, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.NoColorSpace });
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const m = new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', depthTest: false, depthWrite: false, toneMapped: false,
    fragmentShader: `varying vec2 vUv; ${RAUSCHEN}
      void main() {
        vec2 uv = vUv, g = vec2(0.0);
        for (int i = 0; i < 48; i++) { float fi = float(i); vec2 h = hash22(vec2(fi * 1.37, 7.1)); float ang = h.x * 6.2831, kmag = floor(3.0 + pow(h.y, 1.6) * 44.0); vec2 k = floor(vec2(cos(ang), sin(ang)) * kmag + 0.5); if (dot(k, k) < 1.0) k = vec2(3.0, 1.0); float amp = 1.0 / pow(length(k), 1.35), ph = hash11(fi * 9.7) * 6.2831; g += k * amp * cos(dot(k, uv) * 6.2831 + ph); }
        g *= 0.9; vec3 n = normalize(vec3(-g * 0.22, 1.0));
        vec2 warp = vec2(fbmP(uv * 4.0, vec2(4.0)), fbmP(uv * 4.0 + 0.37, vec2(4.0))) - 0.5, wu = uv + warp * 0.09;
        float w1 = worley(wu * 9.0, 9.0), w2 = worley(wu * 21.0 + 3.0, 21.0), w3 = worley(uv * 47.0 + 7.0, 47.0);
        float lace = (1.0 - smoothstep(0.0, 0.2, w1)) * (0.6 + 0.4 * wertP(uv * 36.0, vec2(36.0))); lace = max(lace, (1.0 - smoothstep(0.0, 0.24, w2)) * 0.7);
        float blasen = smoothstep(0.35, 0.5, w3) * 0.35, koerper = fbmP(wu * 7.0, vec2(7.0)), foam = clamp(lace * 0.75 + koerper * 0.75 - 0.12 + blasen * (1.0 - lace), 0.0, 1.0);
        gl_FragColor = vec4(n.xy * 0.5 + 0.5, foam, fbmP(uv * 5.0 + 11.0, vec2(5.0)));
      }` });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false; const sz = new THREE.Scene(); sz.add(q);
  const alt = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(sz, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(alt); m.dispose(); q.geometry.dispose();
  return rt.texture;
}
