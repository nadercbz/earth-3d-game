// Die Erde als Kugel (08_WELTBAU.md Phase 1, seit 29.10.2026): Koordinaten (WGS84, ECEF, ENU, Web Mercator Kacheln), wandernder
// Ursprung, Gelände aus AWS Terrarium Kacheln als Quadtree mit Bildschirmfehler, Blue Marble bei Tag und Nachtlichter (NASA, gemeinfrei),
// Kamera vom All bis zum Gehweg. Skill threejs-large-worlds: große Zahlen bleiben in JavaScript (Float64), die GPU bekommt nur
// Punkte relativ zum Kachelmittelpunkt und Positionen relativ zum Ursprung.
import * as THREE from 'three';
import { MEER_U, MEER_GLSL, MEER_STRAND_GLSL } from './meer_glsl.js';
import { WETTER_K } from './livewetter.js';
import { BODEN_U } from './materials.js';

export const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), R = 6371000;
const D2R = Math.PI / 180;

// Szene: x nach Osten (Längengrad 0 zeigt +x), y zum Nordpol, z nach -90 Grad Länge (rechtshändig: ECEF (x, y, z) wird (x, z, -y))
export function geoZuSzene(lat, lon, h = 0, out = new THREE.Vector3()) {
  const la = lat * D2R, lo = lon * D2R, N = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  const x = (N + h) * Math.cos(la) * Math.cos(lo), y = (N + h) * Math.cos(la) * Math.sin(lo), z = (N * (1 - E2) + h) * Math.sin(la);
  return out.set(x, z, -y);
}
export function szeneZuGeo(v) {
  const x = v.x, y = -v.z, z = v.y, lon = Math.atan2(y, x), p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2)), h = 0;
  for (let i = 0; i < 4; i++) { const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2); h = p / Math.cos(lat) - N; lat = Math.atan2(z, p * (1 - E2 * N / (N + h))); }
  return { lat: lat / D2R, lon: lon / D2R, h };
}
// Ost, Nord, Oben in Szenenkoordinaten
export function enu(lat, lon) {
  const la = lat * D2R, lo = lon * D2R;
  const ost = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo));
  const oben = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  const nord = new THREE.Vector3().crossVectors(oben, ost);
  return { ost, nord, oben };
}
// Web Mercator
export function kachelVonGeo(lat, lon, z) { const n = 2 ** z, la = lat * D2R; return { x: Math.floor((lon + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n) }; }
export function geoVonKachel(x, y, z) { const n = 2 ** z, lon = x / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / D2R; return { lat, lon }; }
export function sonnenRichtung(datum = new Date()) {   // Richtung zur Sonne in Szenenkoordinaten (Unterpunkt der Sonne: Deklination, Stundenwinkel aus UTC)
  const tag = Math.floor((datum - new Date(datum.getUTCFullYear(), 0, 0)) / 86400000), dekl = 23.44 * Math.sin(2 * Math.PI * (284 + tag) / 365);
  const utc = datum.getUTCHours() + datum.getUTCMinutes() / 60, lon = -15 * (utc - 12);
  return geoZuSzene(dekl, lon, 0).normalize();
}

const TERRARIUM = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';   // eigene Adresse für die Kugel: der Worker holt über s3.amazonaws.com, so stehen sich beide nicht im Weg (S3 spricht nur HTTP/1.1, 6 Verbindungen je Adresse)
// Satellitenbild: Sentinel 2 cloudless 2016 von EOX (CC BY 4.0, Hinweis auf der Seite), wolkenfrei, 10 m je Pixel, im selben Kachelraster wie das Gelände.
// Nur der Jahrgang 2016 ist frei für jede Nutzung (2018 und später CC BY NC SA). Nachtlichter: NASA Black Marble 2016 über GIBS (gemeinfrei), bis Stufe 8.
export const FOTO = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const NACHT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
let BILD_LEER = null;
const LEER = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); t.needsUpdate = true; return t; })();

// Rauschen ohne Textur (Hash nach Dave Hoskins), auch periodisch: Koordinaten modulo einer Periode laufen so nahtlos über Kachelgrenzen
export const RAUSCHEN_GLSL = `
  float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  float wert3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  float wert3p(vec3 x, float per) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); vec3 a = mod(i, per), b = mod(i + 1.0, per);
    return mix(mix(mix(hash13(a), hash13(vec3(b.x, a.y, a.z)), f.x), mix(hash13(vec3(a.x, b.y, a.z)), hash13(vec3(b.x, b.y, a.z)), f.x), f.y),
               mix(mix(hash13(vec3(a.x, a.y, b.z)), hash13(vec3(b.x, a.y, b.z)), f.x), mix(hash13(vec3(a.x, b.y, b.z)), hash13(b), f.x), f.y), f.z); }
`;
// Wolken der Erde (kit/wolkendecke.js zeichnet sie, die Kugel ihre Schatten): Dichte aus Richtung d (ECEF Szene, y zum Nordpol),
// Klima nach Breite (viele Wolken am Äquator und um 55 Grad, wenige über den Wüsten um 24 Grad), verwirbeltes Rauschen, Drift mit der Zeit.
export const WOLKEN_GLSL = `
  uniform vec4 uWolken;   // x Bedeckung, y Zeit, z Schattenstärke, w Sichtbarkeit der Decke
  uniform sampler2D tWetterK; uniform float uWetterKEin;   // aus dem All: gemessene Bewölkung der ganzen Erde (kit/livewetter.js)
  uniform float uWirbel;
  // Wirbel (07.11.2026, Nr. 75): an Zufallspunkten eines groben Gitters im Raum vielleicht ein Tief, in der Westwindzone und in den Tropen. Es dreht die Stellen um seine Achse,
  // innen stärker als außen, so werden aus dem Rauschen Spiralen wie auf Satellitenbildern. Drehsinn wie in echt: Nordhalbkugel gegen den Uhrzeigersinn, Süden umgekehrt.
  // Nahtlos: gezählt werden die 8 Zellen um den Punkt, und jeder Wirbel endet nach 0,27 (Abstand im Raum). Bis dorthin wird seine Zelle sicher mitgezählt, deshalb
  // gibt es keine Schnittkanten an Zellgrenzen (geprüft mit tools/wirbel_naht.py: Sprung höchstens 4 statt 162). t dreht mit (Richtung zur Sonne für das Licht in den Wolken).
  vec3 hashW(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }   // ohne Sinus: schneller
  vec3 wirbel(vec3 d, vec3 drift, inout vec3 t) {
    vec3 o = drift * 0.6, z0 = floor((d + o) * 2.4 - 0.5), r = d;
    for (int i = 0; i < 8; i++) {
      float fi = float(i); vec3 zc = z0 + vec3(mod(fi, 2.0), mod(floor(fi / 2.0), 2.0), floor(fi / 4.0));
      vec3 h = hashW(zc);
      if (h.x < 0.4) continue;
      vec3 m = (zc + 0.15 + h * 0.7) / 2.4 - o, dm = d - m; float r2 = dot(dm, dm);
      if (r2 > 0.0729) continue;   // weiter als 0,27: dieser Wirbel wirkt hier nicht
      vec3 c = normalize(m);
      float la = abs(asin(clamp(c.y, -1.0, 1.0))), zone = smoothstep(0.42, 0.62, la) * (1.0 - smoothstep(1.1, 1.3, la)) + 0.7 * exp(-pow((la - 0.26) / 0.07, 2.0));
      if (zone < 0.02) continue;
      float rr = acos(clamp(dot(r, c), -1.0, 1.0)), R = 0.1 + 0.08 * h.y;
      float a = -(1.3 + 1.9 * h.z) * exp(-pow(rr / R, 1.6)) * smoothstep(0.27, 0.17, sqrt(r2)) * zone * sign(c.y);   // Leseort rückwärts drehen: die Wolken drehen vorwärts
      float ca = cos(a), sa = sin(a);
      r = r * ca + cross(c, r) * sa + c * dot(c, r) * (1.0 - ca);
      t = t * ca + cross(c, t) * sa + c * dot(c, t) * (1.0 - ca);
    }
    return normalize(r);
  }
  // Oktaven stufenlos (die letzte blendet nach dem Bruchteil ein, sonst sah man Ringe beim Wechsel der Detailstufe)
  float wolkenFbm(vec3 p, float n) { float s = 0.0, a = 0.5; for (int i = 0; i < 9; i++) { float g = clamp(n - float(i), 0.0, 1.0); if (g <= 0.0) break; s += a * wert3(p) * g + a * 0.5 * (1.0 - g); p = p * 2.07 + 17.13; a *= 0.5; } return s; }
  vec3 wolkenDrift() { return vec3(uWolken.y * 0.0021, 0.0, -uWolken.y * 0.0009); }
  vec3 wolkenDreh(vec3 d, inout vec3 t) { if (uWirbel > 0.5) return wirbel(d, wolkenDrift(), t); return d; }
  // dq: Richtung nach den Wirbeln (die Decke rechnet sie nur einmal je Bildpunkt)
  float wolkenDichteQ(vec3 d, vec3 dq, float okt) {
    float lat = asin(clamp(d.y, -1.0, 1.0)), al = abs(lat);
    // Klima: Tropen (Äquator) und Westwindzone (um 55 Grad) wolkig, Wüstengürtel (um 24 Grad) und Pole klar
    float klima = 0.16 * exp(-pow(lat / 0.10, 2.0)) + 0.12 * exp(-pow((al - 0.98) / 0.24, 2.0)) - 0.16 * exp(-pow((al - 0.41) / 0.12, 2.0)) - 0.08 * exp(-pow((al - 1.45) / 0.2, 2.0));
    vec3 drift = wolkenDrift();
    vec3 p = dq * 2.0 + drift;
    vec3 w = vec3(wert3(p * 1.5), wert3(p * 1.5 + 11.3), wert3(p * 1.5 + 23.9)) - 0.5;   // leichte Verwirbelung (Fronten, Tiefs)
    float gross = wolkenFbm(dq * 4.5 + w * 1.1 + drift * 3.0, 4.0);                     // Wetterlagen
    float nf = max(3.0, okt - 2.0), fein = wolkenFbm(dq * 70.0 + w * 0.6 + drift * 25.0, nf) / (1.0 - pow(0.5, nf));   // Haufenwolken in den Feldern (normiert: gleiche Bedeckung nah und fern)
    float fernW = 1.0 - smoothstep(4.5, 7.0, okt);   // aus dem All große, weiche Formen statt Klecksen
    float n = gross * (0.8 + 0.12 * fernW) + fein * (0.42 - 0.17 * fernW) + klima * (1.0 - uWetterKEin * 0.8), bed = uWolken.x;
    if (uWetterKEin > 0.001) { float lo = atan(-d.z, d.x) / 6.2831853 + 0.5, la = lat * 57.29578; vec4 k = texture2D(tWetterK, vec2(lo + 0.5 / 24.0, ((la + 75.0) / 15.0 + 0.5) / 11.0)); bed = mix(bed, pow(k.r, 1.2) * 1.05, uWetterKEin); }
    float schwelle = 0.72 - bed * 0.30;   // geeicht mit Stichproben (09_GRAFIK.md): klar rund ein Viertel, bedeckt rund drei Viertel
    return smoothstep(schwelle, schwelle + 0.2 + 0.12 * fernW, n);   // breiter Übergang: Ränder durchscheinend
  }
  float wolkenDichte(vec3 d, float okt) { vec3 t = vec3(0.0); return wolkenDichteQ(d, wolkenDreh(d, t), okt); }   // Tiefs und Wirbelstürme drehen die Wolken zu Spiralen
`;

// Material für Kugel und Kacheln: Satellitenbild der Kachel (oder eines Vorfahren, bis das eigene da ist), Nachtlichter, Licht und Schatten
// aus der Normalenkarte (Gelände), Meer mit Wellen, Spiegelung und Glitzerpfad, Bodendetail aus der Nähe, Wolkenschatten, Luftperspektive.
// Eigene Shader brauchen am Ende tonemapping_fragment und colorspace_fragment, sonst landet lineares Licht ungewandelt auf dem sRGB Bildschirm.
export function erdMaterial(tag, nacht, defines = {}) {
  for (const t of [tag, nacht]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; }
  return new THREE.ShaderMaterial({ uniforms: { ...erdUniforms(tag, nacht), ...kachelUniforms() }, vertexShader: ERD_VS, fragmentShader: ERD_FS, defines });
}
// Uniforms getrennt: die gemeinsamen Objekte (Sonne, Dunst, Ort, Zeit) teilen alle Kacheln, die eigenen (Bilder, Rechtecke) hat jede Kachel selbst
// Wirbel in den Wolken (Nr. 75): gemeinsam für Kugel, Decke und Wolkenberge, am Handy aus (kit/erdwelt.js)
export const WIRBEL = { uWirbel: { value: 1 } };
function erdUniforms(tag, nacht) {
  return { tTag: { value: tag }, tNacht: { value: nacht }, uSonne: { value: new THREE.Vector3(1, 0, 0) }, uRelief: { value: 1 },
    uOrt: { value: new THREE.Vector4(0, 0, 0, 0) },              // halbe Kante, aktiv, Mitte x, Mitte z (lokale Szene): dort liegt der gebaute Ort, die Kugel spart ihn aus
    uOrtRand: { value: Array.from({ length: 33 }, () => new THREE.Vector4()) }, uOrtX: { value: new THREE.Vector2(1, 0) }, uOrtZ: { value: new THREE.Vector2(0, 1) },   // Achsen des Ortes in der Ebene der Szene
    uNebelFarbe: { value: new THREE.Color(0.8, 0.82, 0.84) }, uNebel: { value: new THREE.Vector2(1e9, 2e9) },   // Dunst wie scene.fog (Dashboard)
    uKarteFern: { value: new THREE.Vector2(9000, 26000) },       // Kartentextur nah, nur Foto fern (Abstand in Metern)
    uHell: { value: 1 }, uZeit: { value: 0 }, uDetail: { value: 1 }, tDetail: { value: LEER }, uDetailDa: { value: 0 },
    uZuLokal: { value: new THREE.Matrix3() }, uSonneE: { value: new THREE.Vector3(1, 0, 0) },   // Drehung ECEF Szene -> lokal (Normalenkarten), Sonne in ECEF
    uZuWelt: { value: new THREE.Matrix3() }, uUrsprungMod: { value: new THREE.Vector3() },   // lokal -> ECEF und Ursprung modulo PERIODE (Wasser im Ort, Wolken)
    uWolken: { value: new THREE.Vector4(0, 0, 0, 0) },
    uRaum: { value: 0 }, ...WIRBEL,   // Weltraum Look (Nr. 75): 0 nah, 1 ab rund 4.000 km Höhe; Wirbel in den Wolken
    uNachtStark: { value: 1 },   // Nachtlichter aus dem All voll, nah am Boden fast aus (sonst leuchtete das ganze Land am Horizont weiß)
    uDunst: { value: new THREE.Color(0.27, 0.41, 0.66) }, ...MEER_U, ...WETTER_K, uSchneeB: BODEN_U.uSchneeB };      // Luftperspektive: Farbe des Dunsts bei Tag (linear)
}
function kachelUniforms() {
  return { tFoto: { value: LEER }, uFotoRect: { value: new THREE.Vector4(0, 0, 1, 1) }, tFotoAlt: { value: LEER }, uFotoAltRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFotoEin: { value: 1 }, uFotoDa: { value: 0 }, uGrob: { value: 0 }, tNachtK: { value: LEER }, uNachtRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uNachtDa: { value: 0 },
    uNaht: { value: new THREE.Vector4() }, tNormal: { value: LEER }, uNormalDa: { value: 0 }, tKarte: { value: LEER }, uKarteEin: { value: 0 }, tMaske: { value: LEER }, uMaskeDa: { value: 0 },
    uMitte: { value: new THREE.Vector3() }, uMitteMod: { value: new THREE.Vector3() }, uZelle: { value: 2000 } };
}
// Dreiecke einer Kachel, die nur aus Meer besteht: Gitter mit jedem vierten Punkt plus Vorhang (gemeinsam für alle, Ränder gleich wie im vollen Gitter an den Eckpunkten)
let _meerIdx = null;
function meerIndex(N, nG, nR) {
  if (_meerIdx) return _meerIdx;
  const a = [], S = 4, W = N + 1;
  for (let j = 0; j < N; j += S) for (let i = 0; i < N; i += S) { const p = j * W + i, q = p + S, r = (j + S) * W + i, t = r + S; a.push(p, r, q, q, r, t); }
  for (let t = 0; t < nR; t += S) { const o = (t + S) % nR, randPunkt = v => v <= N ? v : v <= 2 * N ? (v - N) * W + N : v <= 3 * N ? N * W + (3 * N - v) : (4 * N - v) * W; const pa = randPunkt(t), pb = randPunkt(o), a2 = nG + t, b2 = nG + o; a.push(pa, a2, pb, pb, a2, b2); }
  return _meerIdx = new Uint16Array(a);
}
export const PERIODE = 4096;   // Meter: Wellen und Bodendetail rechnen mit Koordinaten modulo dieser Periode (Float32 bleibt genau, keine Nähte)
const ERD_VS = `attribute vec2 uv1; attribute float aRand; attribute float aH; attribute vec2 aNaht; uniform vec4 uNaht; uniform vec3 uMitte, uMitteMod; uniform vec4 uMeerNah, uOrt, uOrtRand[33]; uniform vec2 uOrtX, uOrtZ; uniform float uMeerTief, uNurMaske, uZelle; varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying float vD; varying vec3 vW; varying vec3 vE; varying vec3 vP; varying float vRand; varying float vH;
  void main() { vUv = uv; vUv1 = uv1; vRand = aRand; vH = aH; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz;
    vE = normalize(uMitte + position); vP = uMitteMod + position; vec3 pos = position;
    // Naht zur gröberen Nachbarkachel (07.11.2026): der Rand läuft auf die Linie, die der Nachbar dort zeichnet (aNaht.x Abstand dorthin, aNaht.y Kanten als Bits oben, unten, links, rechts). So schließt die Kachel genau an, ohne Vorhang
    if (aNaht.y > 0.5) { float cN = aNaht.y, mN = 0.0; if (mod(cN, 2.0) >= 1.0) mN = max(mN, uNaht.x); if (mod(cN, 4.0) >= 2.0) mN = max(mN, uNaht.y); if (mod(cN, 8.0) >= 4.0) mN = max(mN, uNaht.z); if (cN >= 8.0) mN = max(mN, uNaht.w); if (mN > 0.0) { pos += vE * aNaht.x * mN; vW = (modelMatrix * vec4(pos, 1.0)).xyz; } }
    // Rand eines gebauten Ortes: die Kachel läuft auf die Höhe seines Randes (uOrtRand, 33 Punkte je Kante, 1 m darunter): eine Masche genau darauf, in der nächsten zurück auf ihre eigene Höhe. Sonst lag eine grobe Stufe der Kugel dort oft höher als der Ort (am Hang über 20 m), und man sah zwischen Ort und Kachel hindurch. Die Schürze des Ortes deckt den letzten Meter
    if (uOrt.y > 0.5 && uNurMaske < 0.5 && aH >= 1.0) { vec2 dO = vW.xz - uOrt.zw, oR = vec2(dot(dO, uOrtX), dot(dO, uOrtZ)) / uOrt.x, abR = abs(oR); float kS = 1.0 - smoothstep(uZelle * 1.05, uZelle * 2.3, (max(abR.x, abR.y) - 1.0) * uOrt.x);
      if (kS > 0.0) { bool xR = abR.x >= abR.y; float tR = (clamp(xR ? oR.y : oR.x, -1.0, 1.0) * 0.5 + 0.5) * 32.0; int iR = int(min(floor(tR), 31.0)); vec4 ra = mix(uOrtRand[iR], uOrtRand[iR + 1], tR - float(iR)); float hR = xR ? (oR.x < 0.0 ? ra.x : ra.y) : (oR.y < 0.0 ? ra.z : ra.w); pos += vE * (hR - 1.0 - aH) * kS; vW = (modelMatrix * vec4(pos, 1.0)).xyz; } }
    vec4 mv = modelViewMatrix * vec4(pos, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv;
    // Unter dem Wellennetz liegt das Meer der Kugel in der Tiefe weiter hinten (als läge die Fläche uMeerTief mal die Kamerahöhe tiefer): das Netz darf auch in Wellentälern unter die mittlere Höhe sinken. Je Punkt statt je Pixel, damit die Grafikkarte früh verdeckte Pixel verwerfen kann (gl_FragDepth kostete 6,5 ms je Bild)
    if (uMeerNah.w > 0.5 && aH < 3.0 && uNurMaske < 0.5) { float kN = 1.0 - smoothstep(uMeerNah.z * 1.05, uMeerNah.z * 1.3, length(vW.xz - uMeerNah.xy)); if (kN > 0.0) { vec4 c2 = projectionMatrix * vec4(mv.xyz * (1.0 + uMeerTief * kN), 1.0); if (abs(c2.w) > 1e-4) gl_Position.z = c2.z / c2.w * gl_Position.w; } }
  }`;
// Wasser im gebauten Ort (kit/ort.js): gleiche Wellen und Farbe wie das Meer (kit/meer_glsl.js), ohne Hub. U: Uniforms der Kugel (gemeinsame Objekte)
export function wasserMaterial(U) {
  const uni = { uDunst: U.uDunst, uNebelFarbe: U.uNebelFarbe, uNebel: U.uNebel, uHell: U.uHell }; for (const k in MEER_U) uni[k] = MEER_U[k];
  return new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: `uniform float uAnkerH; varying vec3 vW; varying vec3 vN; varying float vD; varying float vH;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0)); vH = w.y + uAnkerH;
        vec4 mv = viewMatrix * w; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uDunst, uNebelFarbe; uniform vec2 uNebel; uniform float uHell; varying vec3 vW; varying vec3 vN; varying float vD; varying float vH;
      ${MEER_GLSL}
      void main() {
        vec3 Ng = normalize(vN), V = normalize(cameraPosition - vW); vec2 p = meerEbene(vW), dpx = dFdx(p), dpy = dFdy(p);
        float ruhig = smoothstep(3.0, 9.0, vH);   // Flüsse und Seen im Land: kleine Wellen
        vec3 c = meerFarbe(p, dpx, dpy, Ng, V, vD, 0.12, vec3(0.03, 0.07, 0.075), 1.0, ruhig, vec4(1e5, 1.0, 0.0, 0.0), meerSpur(vW.xz));
        c = mix(c, uNebelFarbe, smoothstep(uNebel.x, uNebel.y, vD));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// Umkehr der ACES Kurve, die der OutputPass anwendet (three.js ACESFilmicToneMapping: Eingangsmatrix, RRTAndODTFit, Ausgangsmatrix).
// acesUmkehr(y) liefert den Wert, den ACES (bei Belichtung 0,6) wieder zu y macht. Fotos (Sentinel 2, Blue Marble) erscheinen damit so hell wie
// aufgenommen, statt dass die Kurve ihre dunklen Töne verschluckt.
// Grünflächen im Satellitenbild: Sentinel 2 zeigt Wiese und Wald durch die Luft fast petrol (Berlin im Mittel 57, 77, 65). Im Grünen weniger Blau, etwas mehr Rot: Farbe wie vom Boden aus gesehen. Wasser (Blau über Grün) bleibt
export const FOTO_GRUEN_GLSL = `
  vec3 fotoGruen(vec3 c) { float g = smoothstep(1.18, 1.55, c.g / max(c.r, 0.0004)) * (1.0 - smoothstep(0.82, 1.1, c.b / max(c.g, 0.0004))); return mix(c, c * vec3(1.34, 1.16, 0.62), g); }`;
export const ACES_UMKEHR_GLSL = `
  vec3 acesUmkehr(vec3 y) {
    y = y / (1.0 + max(y - 0.5, vec3(0.0)) * 1.0);   // Helles weich begrenzen: Sand, Schnee und Dächer ergaben hier Werte weit über 1, die Nachbearbeitung machte daraus einen weißen Schleier über der ganzen Gegend
    vec3 o = clamp(mat3(vec3(0.643038, 0.059269, 0.005962), vec3(0.311187, 0.931436, 0.063929), vec3(0.045775, 0.009295, 0.930118)) * y, 0.0, 0.98);
    vec3 a = 1.0 - o * 0.983729, b = 0.0245786 - o * 0.4329510, c = -(0.000090537 + o * 0.238081);
    vec3 v = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
    return max(mat3(vec3(1.764741, -0.147028, -0.036337), vec3(-0.675778, 1.160252, -0.162436), vec3(-0.088963, -0.013224, 1.198773)) * v, 0.0);
  }`;

const ERD_FS = `float gWald = 0.0; uniform sampler2D tTag, tNacht, tFoto, tFotoAlt, tNachtK, tNormal, tKarte, tMaske, tDetail; uniform vec3 uSonne, uSonneE; uniform vec4 uOrt, uFotoRect, uFotoAltRect, uNachtRect; uniform vec2 uOrtX, uOrtZ;
  uniform vec3 uNebelFarbe, uDunst; uniform vec2 uNebel, uKarteFern; uniform float uNachtStark, uHell, uKarteEin, uFotoEin, uFotoDa, uNachtDa, uNormalDa, uMaskeDa, uZeit, uDetail, uDetailDa, uNurMaske, uSchneeB, uGrob; uniform mat3 uZuLokal; uniform vec4 uMeerNah; uniform float uRaum;
  varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying float vD; varying vec3 vW; varying vec3 vE; varying vec3 vP; varying float vRand; varying float vH;
  ${RAUSCHEN_GLSL}
  ${WOLKEN_GLSL}
  ${MEER_GLSL}
  ${MEER_STRAND_GLSL}
  ${ACES_UMKEHR_GLSL}
  ${FOTO_GRUEN_GLSL}
  float triDetail(vec3 p, float rep, vec3 bw, float fp, vec4 w) {
    float lod = log2(max(fp, 1e-4) * 512.0 / rep);
    vec4 t = textureLod(tDetail, p.yz / rep, lod) * bw.x + textureLod(tDetail, p.xz / rep, lod) * bw.y + textureLod(tDetail, p.xy / rep, lod) * bw.z;
    return dot(t, w);
  }
  void main() {
    if (uOrt.y > 0.5 && uNurMaske < 0.5) { vec2 dO = vW.xz - uOrt.zw; if (abs(dot(dO, uOrtX)) < uOrt.x && abs(dot(dO, uOrtZ)) < uOrt.x) discard; }   // im Rahmen des Ortes (liegt der Anker woanders, ist sein Quadrat leicht gedreht)
    vec3 Ng = normalize(vN), V = normalize(cameraPosition - vW);
    vec4 nm = uNormalDa > 0.5 ? texture2D(tNormal, vUv1) : vec4(0.5, 0.5, 0.5, 0.0);
    vec3 Nt = uNormalDa > 0.5 ? normalize(uZuLokal * (nm.xyz * 2.0 - 1.0)) : Ng;
    // Bild: eigenes Foto der Kachel, bis es da ist das eines Vorfahren (gleicher Ausschnitt, nur gröber), ganz am Anfang Blue Marble
    // aus dem All (über rund 2.000 km Abstand) blendet es weich in Blue Marble: nahtlos und ruhig, während das Mosaik aus Sentinel 2 in den Tropen
    // Streifen der UTM Zonen zeigt (Aufnahmen verschiedener Tage)
    vec3 bm = texture2D(tTag, vUv).rgb, tag = bm;
    float fern = uFotoDa > 0.5 ? smoothstep(1.8e6, 6.0e6, vD) : 1.0;
    if (uFotoDa > 0.5) { vec3 fotoN = texture2D(tFoto, uFotoRect.xy + vUv1 * uFotoRect.zw).rgb; if (uFotoEin < 0.999) fotoN = mix(texture2D(tFotoAlt, uFotoAltRect.xy + vUv1 * uFotoAltRect.zw).rgb, fotoN, uFotoEin); tag = mix(fotoN * 0.82, bm, fern); }
    // Wald im Bild: das Satellitenbild zeigt Wald fast schwarz und blaustichig. Dunkle Vegetation bekommt das Grün, das man von oben wirklich sieht
    { float lumT = dot(tag, vec3(0.3, 0.59, 0.11)), wT = smoothstep(1.32, 1.95, tag.g / max(tag.r, 0.0004)) * (1.0 - smoothstep(1.55, 2.15, tag.b / max(tag.g, 0.0004))) * (1.0 - smoothstep(0.034, 0.06, lumT)); tag = mix(tag, vec3(tag.g * 0.66 + tag.r * 0.12, tag.g * 1.16, tag.g * 0.42) * 1.8, wT); gWald = wT; }
    // Helle Dächer im Foto (10 m je Pixel) liegen als weiße Flecken neben den echten Häusern: Spitzen über Sandhelligkeit weich kappen, außer in Polargebieten und im Hochgebirge (dort ist Weiß Schnee)
    { float tM = max(tag.r, max(tag.g, tag.b)), kS = (1.0 - smoothstep(0.82, 0.92, abs(vE.y))) * (1.0 - smoothstep(1800.0, 3000.0, vH)) * (1.0 - fern); tag *= 1.0 / (1.0 + max(tM - 0.4, 0.0) * 2.2 * kS); }
    vec3 nacht = uNachtDa > 0.5 ? texture2D(tNachtK, uNachtRect.xy + vUv1 * uNachtRect.zw).rgb : texture2D(tNacht, vUv).rgb;
    // Wasser: Meer aus den Höhen (unter 0 m, Alpha der Normalenkarte), flache Stellen nur, wenn auch das Foto nach Wasser aussieht
    float fotoWasser = smoothstep(0.008, 0.04, tag.b - max(tag.r, tag.g)) * (1.0 - smoothstep(0.18, 0.35, tag.g));
    float dunkel = 1.0 - smoothstep(0.03, 0.09, dot(tag, vec3(0.3, 0.5, 0.2)));
    float meer = max(smoothstep(0.05, 0.09, nm.a), max(fotoWasser, dunkel * 0.9) * step(0.01, nm.a));   // ab rund 10 m Tiefe sicher Meer (Polder liegen nur wenige Meter unter 0), auf 0 m oder flach nach dem Foto
    if (uMaskeDa > 0.5) meer = max(texture2D(tMaske, vUv1).r, smoothstep(0.3, 0.6, nm.a));   // nah: Wasserflächen aus den Vektorkacheln (genaue Küsten, Seen, Flüsse)
    // fern: Meer aus der Farbe von Blue Marble (dort fast schwarz), feiner als die Normalenkarte grober Stufen (sonst Treppen an den Küsten)
    meer = mix(meer, smoothstep(0.015, 0.05, bm.b - max(bm.r, bm.g * 0.85)) * smoothstep(0.3, 0.5, (bm.b - bm.r) / (bm.b + 0.01)), fern);   // Blue Marble mit Bathymetrie: Schelfe hellblau, auch sie sind Meer
    meer *= 1.0 - smoothstep(0.0, 0.05, vRand);   // ein Vorhang ist nie Wasser
    // Flüsse und Seen: bis rund 60 m Höhe läuft das Wellennetz mit (es folgt dem Gelände, kit/meer.js), nur höher liegende Seen bleiben ruhig. Vorher entschied die Höhe allein ab 3 bis 9 m: die Themse brach mitten im Fluss ab, weil die Höhendaten dort schwanken (Wunsch Nr. 66)
    float binnen = uMaskeDa > 0.5 ? smoothstep(45.0, 70.0, vH) : smoothstep(3.0, 9.0, vH);
    // Grobe Kachel aus der Nähe (Wunsch Nr. 56): nach schnellem Zoomen liegt kurz eine Kachel im Bild, die weit zu groß ist. Ihre Karte des Meeres ist dann viel zu grob, ganz Berlin war dunkles Meer. Solange zählt nur das Foto
    meer = mix(meer, smoothstep(0.015, 0.05, bm.b - max(bm.r, bm.g * 0.85)) * smoothstep(0.3, 0.5, (bm.b - bm.r) / (bm.b + 0.01)), uGrob);   // grobe Kachel: Meer aus der Weltkarte, nicht aus den noch ungenauen Höhen (sonst dunkles Meer über Land, oder grünes Land über dem Meer vor Dubai)
    // Küstenkarte für das Wellennetz (kit/meer.js): Bild 1 Farbe und Wasser, Bild 2 Tiefe
    if (uNurMaske > 0.5) { float mm = meer * (1.0 - binnen); gl_FragColor = uNurMaske < 1.5 ? vec4(sqrt(tag), mm) : vec4(smoothstep(0.03, 0.14, nm.a), clamp(vH / 70.0, 0.0, 1.0), 0.0, 1.0); return; }
    vec2 pM = meerEbene(vW), dpMx = dFdx(pM), dpMy = dFdy(pM);
    // Größe eines Pixels und Karte vor der Verzweigung (in Verzweigungen sind Ableitungen undefiniert)
    float fp = length(fwidth(vP));
    vec4 karte = texture2D(tKarte, vUv1);
    // Offenes Wasser unter dem Wellennetz: das Netz rechnet dieselbe Farbe, die Kugel gibt nur die Tiefe frei. Spart das doppelte Rechnen je Pixel (rund ein Drittel der Bildzeit über See)
    if (uMeerNah.w > 0.5 && meer > 0.97 && binnen < 0.5 && textureLod(tKarteB, karteUV(vW.xz), 0.0).r > 2.5) { vec2 dN = vW.xz - uMeerNah.xy; if (dot(dN, dN) < uMeerNah.z * uMeerNah.z * 0.81) {
      gl_FragColor = vec4(uHimmelH * 0.12 + uMeerAmb * vec3(0.0075, 0.03, 0.043), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    } }
    float lichterFern = 1.0;
    // Karte als Überlagerung (Alpha aus dem Worker): Straßen und Ufer scharf über dem Foto, blendet mit dem Abstand aus und beim Laden ein
    float kf = (1.0 - smoothstep(uKarteFern.x, uKarteFern.y, vD)) * uKarteEin, ka = karte.a * kf;
    tag = mix(tag, karte.rgb, ka);
    lichterFern = 1.0 - kf * (1.0 - smoothstep(0.08, 0.5, uNachtStark));   // nah leuchten die echten Fenster und Laternen, nicht das Nachtbild. Aus großer Höhe gibt es keine Fenster mehr: dort zählt das Nachtbild auch auf Kacheln mit Karte (sonst fehlten aus 60 km die Lichter in der Mitte des Bildes)
    float sG = dot(Ng, uSonne), sT = dot(Nt, uSonne);
    float tagSeite = smoothstep(-0.18, 0.08, sG);
    float licht = clamp(sT * 1.1, 0.0, 1.0);
    float himmelsLicht = mix(0.05, 0.008, uRaum) + 0.28 * tagSeite * (0.55 + 0.45 * dot(Nt, Ng));   // aus dem All ist die Nachtseite fast schwarz   // Licht vom Himmel: Schattenseiten bleiben lesbar
    // Bodendetail aus der Nähe: feines Korn gegen die Unschärfe des Fotos (10 m je Pixel), nur an Land
    float nahe = (1.0 - smoothstep(900.0, 5500.0, vD)) * uDetail * (1.0 - meer);
    if (nahe > 0.01) {
      if (uDetailDa > 0.5) {
        // Luftbild Texturen (Poly Haven, CC0): Wiese, Fels, Erde, Sand nach der Farbe des Fotos, steile Hänge Fels; triplanar in ECEF (vP modulo
        // PERIODE, nahtlos über Kachelgrenzen), zwei Größen (16 und 128 m), Mip Stufe aus der Pixelgröße (in Verzweigungen keine Ableitungen)
        vec3 nE = uNormalDa > 0.5 ? normalize(nm.xyz * 2.0 - 1.0) : vE;
        float lum = dot(tag, vec3(0.3, 0.55, 0.15)), gruen = smoothstep(0.0, 0.025, tag.g - max(tag.r, tag.b) * 0.95);
        float sand = smoothstep(0.1, 0.28, lum) * smoothstep(0.0, 0.03, tag.r - tag.b) * (1.0 - gruen);
        float erdig = smoothstep(0.0, 0.03, tag.r - tag.g * 0.9) * (1.0 - sand) * (1.0 - gruen);
        float fels = max(0.3 * (1.0 - gruen), 1.0 - smoothstep(0.62, 0.86, dot(nE, vE)));
        vec4 w = vec4(gruen, fels, erdig, sand); w /= max(1e-3, w.x + w.y + w.z + w.w);
        vec3 bw = pow(abs(nE), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        float d1 = triDetail(vP, 16.0, bw, fp, w), d2 = triDetail(vP, 128.0, bw, fp, w);
        tag *= 1.0 + ((d1 - 0.5) * 1.1 + (d2 - 0.5) * 0.7) * nahe;
      } else { float d1 = wert3p(vP / 32.0, ${PERIODE / 32}.0), d2 = wert3p(vP / 4.0, ${PERIODE / 4}.0); tag *= 1.0 + ((d1 - 0.5) * 0.24 + (d2 - 0.5) * 0.12) * nahe; }
    }
    // Wolkenschatten (aus der Höhe sichtbar)
    float schatten = 1.0;
    #ifdef WOLKENSCHATTEN
    float schattenK = uWolken.z * (1.0 - smoothstep(0.75, 1.0, uRaum));   // aus dem All (ab rund 3.000 km) liegt der Schatten unter der Wolke selbst und ist nicht zu sehen: dort spart das eine ganze Wolkenrechnung je Bildpunkt
    if (schattenK > 0.01 && tagSeite > 0.01) { vec3 dW = normalize(vE + uSonneE * (0.0011 / max(dot(vE, uSonneE), 0.12))); schatten = 1.0 - schattenK * wolkenDichte(dW, 5.0) * tagSeite; }
    #endif
    // Boden so hell, wie das Foto aufgenommen ist: erst die Helligkeit auf dem Bildschirm (linear), dann durch die ACES Kurve des OutputPass
    // zurückgerechnet. Sonst versinken dunkle Flächen (Wald, Heide, Moor) im Fuß der Kurve fast in Schwarz (gemessen 29.10.2026 bei Beelitz)
    if (uSchneeB > 0.01) { float sN = uSchneeB * (1.0 - smoothstep(4e4, 2e5, vD)) * smoothstep(0.62, 0.9, dot(Nt, Ng)) * smoothstep(0.1, 0.5, uSchneeB + (wert3p(vP / 64.0, ${PERIODE / 64}.0) - 0.5) * 0.7); tag = mix(tag, vec3(0.62, 0.65, 0.7), sN); }
    vec3 tagWasser = tag; tag = fotoGruen(tag);
    // Vorhänge an Kachelrändern: die mittlere Farbe der Gegend, unten dunkler. Sonst läuft die Randfarbe der Kachel als senkrechte Streifen herunter (07.11.2026)
    if (vRand > 0.002) { vec3 gr = uFotoDa > 0.5 ? textureLod(tFoto, uFotoRect.xy + vUv1 * uFotoRect.zw, 5.0).rgb : tag; tag = mix(tag, gr * mix(0.92, 0.5, smoothstep(0.1, 0.9, vRand)), smoothstep(0.0, 0.05, vRand)); }
    vec3 boden = tag * (himmelsLicht * vec3(0.92, 0.97, 1.08) * mix(0.4, 1.0, tagSeite) + 0.92 * licht * schatten + 0.05 * (1.0 - 0.85 * uRaum) * (1.0 - tagSeite) * vec3(0.55, 0.68, 1.0)) * 1.3;   // nachts Mondlicht (02.11.2026: vorher war der Boden schwarz)   // bei üblichem Tageslicht rund so hell wie das Foto
    float nachtKraft = max(max(uNachtStark, 0.03), uRaum);   // ferne Städte leuchten auch aus niedriger Höhe (Stadtlicht am Horizont), direkt unter der Kamera bleibt es aus
    // Stadtlicht als Lichtermeer statt gleichmäßiger Fläche (06.11.2026): einzelne Lichtpunkte aus einem festen Raster der Erde, warm und kühl gemischt. Sobald ein Punkt kleiner als ein Bildpunkt wird, zählt der Mittelwert, sonst flimmert es
    vec3 stadtGlut = nacht * nacht * 1.6 * (1.0 + 2.4 * uRaum) * nachtKraft * mix(vec3(1.0, 0.86, 0.66), vec3(1.0, 0.72, 0.4), uRaum) * smoothstep(0.08, -0.12, sG) * lichterFern;   // aus dem All golden
    if (dot(stadtGlut, vec3(1.0)) > 0.002 && vD < 90000.0) { const float SL = 38.0; vec3 qL = vP / SL, zL = floor(qL), fL = qL - zL; float pu = 0.0; float warmL = 0.0; for (int zi = 0; zi < 2; zi++) { vec3 zc = zL + vec3(0.0, 0.0, float(zi) - 0.5 + step(0.5, fL.z)) ; vec3 hq = fract(zc * vec3(0.1031, 0.1030, 0.0973)); hq += dot(hq, hq.yxz + 33.33); hq = fract((hq.xxy + hq.yxx) * hq.zyx); float dl = length(qL - zc - hq); float s0 = smoothstep(0.26, 0.04, dl) * step(0.35, hq.x); if (s0 > pu) { pu = s0; warmL = hq.y; } } float fuss = length(fwidth(vP)) / SL, klar = 1.0 - smoothstep(0.5, 1.8, fuss); stadtGlut *= mix(1.0, 0.1 + pu * 9.0, klar); stadtGlut = mix(stadtGlut, stadtGlut * mix(vec3(0.72, 0.86, 1.25), vec3(1.15, 0.92, 0.62), warmL), klar); stadtGlut = min(stadtGlut, mix(vec3(0.075, 0.055, 0.038), vec3(4.0), smoothstep(0.08, 0.6, uNachtStark)) * (1.0 + 7.0 * klar)); }
    vec3 c = acesUmkehr(boden) * (0.6 / 0.95) * uHell + stadtGlut;
    if (meer < 0.99 && vH < 40.0 && uKarte.w > 0.5) c = meerStrand(c, vW.xz, pM);
    if (meer > 0.01) {
      float flach = (1.0 - mix(smoothstep(0.03, 0.14, nm.a), 1.0, fern)) * (1.0 - binnen);   // fern überall Tiefsee (die Normalenkarte grober Stufen ist zu grob für Schelfe)
      if (uMeerNah.w > 0.5 && uMaskeDa > 0.5) { vec2 dNw = vW.xz - uMeerNah.xy; if (dot(dNw, dNw) < uMeerNah.z * uMeerNah.z * 1.3) { float schmal = 1.0 - smoothstep(350.0, 1100.0, textureLod(tKarteB, karteUV(vW.xz), 0.0).r); flach = mix(flach, 1.0, schmal); tagWasser = mix(tagWasser, vec3(0.029, 0.073, 0.084), schmal); } }   // wie im Wellennetz (kit/meer.js), sonst Treppen am Ufer
      vec3 wasser = meerFarbe(pM, dpMx, dpMy, Ng, V, vD, flach, tagWasser, schatten, binnen, vec4(1e5, 1.0, 0.0, 0.0), meerSpur(vW.xz));
      c = mix(c, wasser + nacht * nacht * 1.6 * uNachtStark * vec3(1.0, 0.86, 0.66) * smoothstep(0.08, -0.12, sG) * lichterFern * 0.3, meer);
    }
    // Luftperspektive: Weg durch die untere Luft. Aus dem All in der Mitte der Scheibe kurz (leichter Schleier), am Rand lang (blauer Saum),
    // in der Luft wächst er mit dem Abstand bis zum Horizont. So gibt es zwischen All und Boden keinen Sprung in den Farben.
    float weg = min(vD, 20000.0 / max(dot(Ng, V), 0.03));
    float dunst = 1.0 - exp(-weg / 150000.0);
    c = mix(c, uDunst * (0.2 + 0.8 * clamp(sG * 1.2 + 0.1, 0.0, 1.0)), dunst * 0.72 * (1.0 - 0.6 * uRaum));   // aus dem All weniger Dunst über dem Tag
    // Weltraum Look (07.11.2026, Nr. 75): aus dem All tiefblaue Ozeane und ein warmer Saum an der Grenze von Tag und Nacht
    if (uRaum > 0.001) { c = mix(c, c * vec3(0.55, 0.72, 1.0) * 0.8, uRaum * meer * (1.0 - binnen) * 0.85); c += vec3(1.0, 0.45, 0.18) * 0.045 * exp(-pow((sG + 0.02) / 0.07, 2.0)) * uRaum; }
    c = mix(c, uNebelFarbe, smoothstep(uNebel.x, uNebel.y, vD));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Öffnung eines quadratischen Höhenfelds: erst Minimum, dann Maximum im Fenster (2r+1)², getrennt nach Zeilen und Spalten.
// Entfernt alles Erhabene, was schmaler als das Fenster ist (Häuser, Baumgruppen), Ebenen, Hänge und Stufen bleiben.
export function oeffnung(a, n, r) {
  const lauf = (src, max) => {
    const t = new Float32Array(src.length), o = new Float32Array(src.length);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let v = src[j * n + i]; const a0 = Math.max(0, i - r), a1 = Math.min(n - 1, i + r); for (let q = a0; q <= a1; q++) { const w = src[j * n + q]; v = max ? (w > v ? w : v) : (w < v ? w : v); } t[j * n + i] = v; }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let v = t[j * n + i]; const a0 = Math.max(0, j - r), a1 = Math.min(n - 1, j + r); for (let q = a0; q <= a1; q++) { const w = t[q * n + i]; v = max ? (w > v ? w : v) : (w < v ? w : v); } o[j * n + i] = v; }
    return o;
  };
  return lauf(lauf(a, false), true);
}

// Bodenfilter mit Kappe (seit 29.10.2026, Wunsch Nr. 33): die Öffnung entfernt Häuser und Bäume aus dem Oberflächenmodell, schnitt aber auch
// Berggrate ab (Klingen und Klippen in den Alpen). Darum hängt die Kappe vom Hang der geöffneten Fläche über 500 m ab: auf flachem Grund
// (Städte) fällt alles bis 400 m weg, an steilen Hängen (über 20 Prozent) höchstens 25 m. Gleiche Regel im Worker (kit/ortbau.worker.js).
export function bodenGekappt(a, n, r, pxm) {
  const o = oeffnung(a, n, r), out = new Float32Array(a.length), b = Math.max(1, r);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - b), i1 = Math.min(n - 1, i + b), j0 = Math.max(0, j - b), j1 = Math.min(n - 1, j + b);
    const hang = Math.hypot((o[j * n + i1] - o[j * n + i0]) / ((i1 - i0) * pxm || 1), (o[j1 * n + i] - o[j0 * n + i]) / ((j1 - j0) * pxm || 1));
    const t = Math.min(1, Math.max(0, (hang - 0.05) / 0.15)), s = t * t * (3 - 2 * t), kappe = 400 * (1 - s) + 25 * s;
    const v = a[j * n + i]; out[j * n + i] = Math.max(o[j * n + i], v - kappe);
  }
  return out;
}

// Saum der Atmosphäre: Kugelschale 80 km über dem Meer, leuchtet zum Rand hin (Fresnel), auf der Tagseite hell, aus dem All sichtbar
export function atmosphaere() {
  // Saum der Atmosphäre (07.11.2026, Nr. 75, Vorbild von Nader): für jeden Sichtstrahl der engste Abstand zur Erde. Außerhalb des Rands ein Halo, der mit der Höhe
  // über dem Rand abfällt, über der Scheibe ein dünner Schleier, der zum Rand hin dichter wird. Blau auf der Tagseite, warm im Ring der Dämmerung, und im Gegenlicht
  // (Sonne knapp hinter der Erde) leuchtet er hell auf. Der Glanz der Nachbearbeitung macht daraus den Lichtschein
  const geo = new THREE.SphereGeometry(A + 130000, 160, 80);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSonne: { value: new THREE.Vector3(1, 0, 0) }, uStaerke: { value: 0 }, uMitte: { value: new THREE.Vector3() }, uRaum: { value: 0 } },
    vertexShader: `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSonne, uMitte; uniform float uStaerke, uRaum; varying vec3 vW;
      void main() {
        const float R = ${A.toFixed(1)}, H = 26000.0;
        vec3 V = normalize(vW - cameraPosition), O = cameraPosition - uMitte;
        float b = dot(O, V), c = dot(O, O) - R * R, disk = b * b - c;
        vec3 P = O - V * b; float hMin = length(P) - R;
        float saum, randNah;
        if (disk > 0.0 && b < 0.0) { vec3 E = O + V * (-b - sqrt(disk)); float cosI = clamp(-dot(V, normalize(E)), 0.0, 1.0); saum = pow(1.0 - cosI, 6.0) * 0.8 + 0.015 * (1.0 - cosI); randNah = pow(1.0 - cosI, 12.0); }
        else { saum = exp(-max(hMin, 0.0) / H); randNah = saum; }
        vec3 nP = normalize(P); float sL = dot(nP, uSonne);
        float tag = smoothstep(-0.3, 0.25, sL), daemmer = exp(-pow(sL / 0.16, 2.0)), vd = max(dot(V, uSonne), 0.0), vor = (pow(vd, 6.0) * 0.22 + pow(vd, 60.0) * 1.6) * randNah;   // Gegenlicht nur am schmalen Rand
        vec3 farbe = vec3(0.28, 0.56, 1.0) * (0.05 + 1.15 * tag) + vec3(1.0, 0.58, 0.3) * daemmer * 0.55 + vec3(1.0, 0.86, 0.68) * vor * (2.5 + 2.5 * uRaum);
        gl_FragColor = vec4(farbe * saum * uStaerke * (1.25 + 0.55 * uRaum), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 2; m.userData.welt = new THREE.Vector3();
  return m;
}

// Eine Geländekachel: Höhen aus Terrarium (256 px, hier 33 x 33 Punkte), Punkte relativ zum Mittelpunkt, Schürze am Rand,
// dazu eine Normalenkarte (Licht und Schatten je Pixel), ihr Satellitenbild und bis Stufe 8 ihre Nachtlichter
class Kachel {
  constructor(z, x, y, eltern = null) { this.z = z; this.x = x; this.y = y; this.eltern = eltern; this.key = `${z}/${x}/${y}`; this.kinder = null; this.mesh = null; this.laedt = null; this.abbruch = null; this.fehler = false; this.zuletzt = 0;
    const nw = geoVonKachel(x, y, z), so = geoVonKachel(x + 1, y + 1, z);
    this.lat0 = so.lat; this.lat1 = nw.lat; this.lon0 = nw.lon; this.lon1 = so.lon;
    this.mitteGeo = { lat: (this.lat0 + this.lat1) / 2, lon: (this.lon0 + this.lon1) / 2 };
    this.mitte = geoZuSzene(this.mitteGeo.lat, this.mitteGeo.lon, 0);
    this.spanne = 40075016 * Math.cos(this.mitteGeo.lat * D2R) / 2 ** z;   // Meter am Boden
    this.radius = geoZuSzene(this.lat0, this.lon0, 0).distanceTo(this.mitte) * 1.05;
    this.foto = null; this.fotoLaedt = false; this.fotoFehler = 0; this.fotoEin = 1; this.fotoAlt = null;
    this.nacht = null; this.nachtLaedt = false; this.nachtFehler = 0;
    this.oben = this.mitte.clone().normalize(); this.hMin = null; this.hMax = null;   // Höhenbereich nach dem Laden (Sichtprüfung im Gebirge)
  }
}
const mod = (a, n) => ((a % n) + n) % n;

export class Erde {
  // karte(k): liefert für Kacheln ab Stufe karteAb eine Textur (Straßen und Ufer aus den Vektorkacheln) als Überlagerung des Fotos
  constructor({ renderer, gruppe, tag, nacht, mobil = false, maxZoom = null, karte = null, karteAb = 12, fotos = true }) {
    this.renderer = renderer; this.gruppe = gruppe; this.mobil = mobil; this.karte = karte; this.karteAb = karteAb; this.fotos = fotos;
    this.defines = mobil ? {} : { WOLKENSCHATTEN: 1 };
    this.mat = erdMaterial(tag, nacht, this.defines);
    this.ursprung = new THREE.Vector3();             // Float64 (JavaScript Zahlen), Szene liegt um ihn herum
    this.kacheln = new Map(); this.wurzeln = [];
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) this.wurzeln.push(this.kachel(2, x, y));
    this.laufend = 0; this.maxLaufend = mobil ? 6 : 14; this.maxZoom = maxZoom ?? (mobil ? 11 : 12); this.pixelGrenze = mobil ? 420 : 340;
    this.sichtbar = new Set(); this.geladen = 0; this.frames = 0; this.budget = mobil ? 220 : 520;   // höchstens so viele Kacheln im Speicher
    this.vorlade = []; this.einblenden = new Set();   // Kacheln am Flugziel vorab laden; Karten, die gerade einblenden
    this.fotoLaufend = 0; this.maxFotos = mobil ? 6 : 12; this.nachtLaufend = 0; this.fotoAnzahl = 0;
    this.normalGroesse = mobil ? 64 : 128;
    this.bild = new OffscreenCanvas(256, 256); this.ctx = this.bild.getContext('2d', { willReadFrequently: true });
    for (const pol of [90, -90]) {   // Polkappen: Web Mercator endet bei 85 Grad, der Fächer bis zum Pol trägt Blue Marble
      const n = 64, latR = pol > 0 ? 85 : -85, pos = [], uv = [], idx = [], mitte = geoZuSzene(pol, 0, 0);
      pos.push(0, 0, 0); uv.push(0.5, pol > 0 ? 1 : 0);
      const P = new THREE.Vector3();
      for (let i = 0; i <= n; i++) { const lon = i / n * 360 - 180; geoZuSzene(latR, lon, 0, P).sub(mitte); pos.push(P.x, P.y, P.z); uv.push((lon + 180) / 360, (latR + 90) / 180); }
      for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
      { // Drehsinn prüfen: Vorderseite muss nach außen zeigen (am Nordpol war die Kappe abgewandt und fehlte, ein dunkles Loch)
        const a = new THREE.Vector3(pos[0], pos[1], pos[2]), b = new THREE.Vector3(pos[3], pos[4], pos[5]), c2 = new THREE.Vector3(pos[6], pos[7], pos[8]);
        const nn = new THREE.Vector3().crossVectors(b.clone().sub(a), c2.clone().sub(a)), aussen = a.clone().add(mitte).normalize();
        if (nn.dot(aussen) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      // Normalen radial nach außen (der Fächer lieferte am Nordpol nach innen zeigende Normalen: dunkle Kappe mit dichtem Dunst)
      const nor = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) { P.set(pos[i], pos[i + 1], pos[i + 2]).add(mitte).normalize(); nor[i] = P.x; nor[i + 1] = P.y; nor[i + 2] = P.z; }
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      const mat = this.neuesMaterial(); mat.uniforms.uMitte.value.copy(mitte);
      const m = new THREE.Mesh(g, mat); m.userData.welt = mitte; m.position.copy(mitte); this.gruppe.add(m); (this.kappen ??= []).push(m);
    }
  }
  // eigenes Material je Kachel: gemeinsame Uniforms (gleiche Objekte) plus eigene Bilder und Rechtecke; alle teilen ein Programm
  neuesMaterial() {
    const U = this.mat.uniforms, eigen = kachelUniforms(), u = {};
    for (const k in U) u[k] = k in eigen ? eigen[k] : U[k];
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: ERD_VS, fragmentShader: ERD_FS, defines: this.defines, side: THREE.DoubleSide });   // beidseitig: durch einen Spalt am Rand eines Ortes sieht man die Unterseite der Kachel statt des Himmels
    m.sortGruppe = this.mat.id;   // alle Kacheln bilden eine Gruppe und werden von vorn nach hinten gezeichnet (app.js, opakSort): verdeckte Pixel kosten dann nichts
    return m;
  }
  kachel(z, x, y, eltern = null) { const key = `${z}/${x}/${y}`; let k = this.kacheln.get(key); if (!k) { k = new Kachel(z, x, y, eltern); this.kacheln.set(key, k); } return k; }
  kinder(k) { if (!k.kinder) k.kinder = [this.kachel(k.z + 1, k.x * 2, k.y * 2, k), this.kachel(k.z + 1, k.x * 2 + 1, k.y * 2, k), this.kachel(k.z + 1, k.x * 2, k.y * 2 + 1, k), this.kachel(k.z + 1, k.x * 2 + 1, k.y * 2 + 1, k)]; return k.kinder; }

  // Höhen laden und Mesh bauen (Schürze: Randpunkte um 3 Prozent der Spanne nach unten)
  async laden(k, erneut = false) {
    if ((k.mesh && !erneut) || k.laedt || k.fehler) return;
    if (!erneut) {
    // Erst die Eltern (ab Stufe 7): ihre Höhen geben den Rand der Kachel vor. Ohne sie, zum Beispiel nach einem weiten Sprung, passten Nachbarn nicht aufeinander (am Hang Stufen bis über 40 m)
    if (k.z >= 7 && k.eltern && !k.eltern.hgrid && !k.eltern.fehler) return this.laden(k.eltern);
    // Flaches Gelände erbt von den Eltern (Wunsch Nr. 66, Nader: "alles lädt extrem langsam"): nach dem Bodenfilter mit 250 m Fenster bringen feinere Höhenkacheln dort nichts Neues, kosten aber je rund 90 KB von einem langsamen Server. Vom Flug nach London blieben so von 276 Abrufen rund die Hälfte
    if (k.eltern?.flachFeld) {
      if (this.erbeBild !== this.frames) { this.erbeBild = this.frames; this.erbeN = 0; }
      if (this.erbeN >= (this.mobil ? 2 : 4)) return;   // wenige je Bild, gerechnet wird im Hauptfaden
      this.erbeN++; k.mesh = this.baue(k, null, k.eltern.flachFeld); this.nachBau(k); return;
    }
    }
    if (this.laufend >= this.maxLaufend) { if (erneut) setTimeout(() => this.laden(k, true), 1500); return; }
    this.laufend++; k.abbruch = new AbortController();
    k.laedt = (async () => {
      try {
        const r = await fetch(TERRARIUM.replace('{z}', k.z).replace('{x}', k.x).replace('{y}', k.y), { signal: k.abbruch.signal });
        if (!r.ok) throw new Error(r.status);
        const bmp = await createImageBitmap(await r.blob());
        this.ctx.drawImage(bmp, 0, 0); bmp.close();
        const d = this.ctx.getImageData(0, 0, 256, 256).data;
        if (k.flachNot && k.mesh) this.entladen(k);
        k.flachNot = false; k.fehlV = 0; k.mesh = this.baue(k, d); this.nachBau(k);
      } catch (e) {
        // Ein gestörter Abruf darf die Kachel nicht für immer leer lassen (Wurzelkachel weg, ganze Erde leer): sofort flach oder von den Eltern bauen, nach einer Wartezeit neuer Versuch
        if (e.name !== 'AbortError') {
          k.fehlV = (k.fehlV || 0) + 1; k.fehler = true;
          if (!k.mesh) { BILD_LEER ||= new Uint8ClampedArray(262144); k.mesh = this.baue(k, BILD_LEER); k.flachFeld = null; k.flachNot = true; this.nachBau(k); }   // alles -32768: Höhen der Eltern, ganz oben Meereshöhe
          setTimeout(() => { k.fehler = false; if (k.flachNot && k.mesh) this.laden(k, true); }, Math.min(60000, 4000 * 2 ** k.fehlV));
        }
      }
      finally { this.laufend--; k.laedt = null; k.abbruch = null; }
    })();
  }
  nachBau(k) {
    k.mesh.position.copy(k.mitte).sub(this.ursprung); k.mesh.visible = false; this.gruppe.add(k.mesh); this.geladen++;   // sichtbar macht sie erst der Quadtree (vorab geladene Kacheln am Flugziel sonst mitten im Bild)
    if (this.karte && k.z >= this.karteAb) { if (k.fuerZiel && k.z >= this.maxZoom - 1) this.karteHolen(k); else k.karteWunsch = true; }   // Karten erst für Kacheln, die man wirklich sieht: beim Abstieg kosteten Stufen, die nur kurz im Bild waren, rund 20 MB Vektorkacheln (Wunsch Nr. 66)
  }
  karteHolen(k) {
    k.karteWunsch = false;
    this.karte(k).then(r => {
      if (!r) return; if (!k.mesh) { r.tex.dispose(); r.maske.dispose(); return; }
      const u = k.mesh.material.uniforms; u.tKarte.value = r.tex; u.uKarteEin.value = 0; k.karteTex = r.tex; this.einblenden.add(k);   // weich einblenden statt Ploppen
      u.tMaske.value = r.maske; u.uMaskeDa.value = 1; k.maskeTex = r.maske; k.wasserG = r.wasser;
    }).catch(() => {});
  }
  // Satellitenbild der Kachel (EOX Sentinel 2 cloudless 2016): wird weich über das Bild des Vorfahren geblendet
  fotoLaden(k) {
    if (k.foto || k.fotoLaedt || (k.fotoFehler && performance.now() - k.fotoFehler < 20000) || this.fotoLaufend >= this.maxFotos) return;
    k.fotoLaedt = true; this.fotoLaufend++;
    fetch(FOTO.replace('{z}', k.z).replace('{x}', k.x).replace('{y}', k.y)).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => createImageBitmap(b, { imageOrientation: 'none' }))
      .then(bmp => {
        if (!k.mesh) { bmp.close(); return; }
        const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.mobil ? 2 : 8;
        t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
        this.renderer.initTexture(t);
        k.fotoAlt = this.quelle(k.eltern, 'foto'); k.foto = t; k.fotoEin = k.fotoAlt ? 0 : 1; this.fotoAnzahl++;
      })
      .catch(() => { k.fotoFehler = performance.now(); })
      .finally(() => { k.fotoLaedt = false; this.fotoLaufend--; });
  }
  // Nachtlichter (NASA Black Marble) bis Stufe 8; feinere Kacheln nehmen den Ausschnitt ihres Vorfahren
  nachtLaden(k) {
    if (k.nacht || k.nachtLaedt || (k.nachtFehler && performance.now() - k.nachtFehler < 30000) || this.nachtLaufend >= (this.mobil ? 2 : 4)) return;
    k.nachtLaedt = true; this.nachtLaufend++;
    fetch(NACHT.replace('{z}', k.z).replace('{x}', k.x).replace('{y}', k.y)).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => createImageBitmap(b, { imageOrientation: 'none', premultiplyAlpha: 'none' }))
      .then(bmp => {
        const t = new THREE.Texture(bmp); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; this.renderer.initTexture(t); k.nacht = t; k.nachtZuletzt = this.frames;
      })
      .catch(() => { k.nachtFehler = performance.now(); })
      .finally(() => { k.nachtLaedt = false; this.nachtLaufend--; });
  }
  // nächste Kachel (sie selbst oder ein Vorfahr) mit Bild der Art 'foto' oder 'nacht'
  quelle(k, art) { while (k) { if (k[art]) return k; k = k.eltern; } return null; }
  // Rechteck im Bild der Quelle q, das die Kachel k abdeckt (uv1 der Kachel -> uv im Bild)
  rechteck(k, q, out) { const f = 2 ** (k.z - q.z), s = 1 / f; return out.set((k.x - q.x * f) * s, (k.y - q.y * f) * s, s, s); }
  // Bilder einer sichtbaren Kachel in ihre Uniforms schreiben (je Bild, billig)
  bilderSetzen(k, dt) {
    const u = k.mesh.material.uniforms;
    u.uGrob.value = THREE.MathUtils.smoothstep(k.grobPx || 0, 2.2, 4.5);
    const q = this.quelle(k, 'foto');
    if (!q) u.uFotoDa.value = 0;
    else {
      u.uFotoDa.value = 1;
      if (q === k && k.fotoEin < 1) {
        k.fotoEin = Math.min(1, k.fotoEin + dt / 0.45);
        const a = k.fotoAlt && k.fotoAlt.foto ? k.fotoAlt : null;
        u.tFoto.value = k.foto; u.uFotoRect.value.set(0, 0, 1, 1);
        if (a) { u.tFotoAlt.value = a.foto; this.rechteck(k, a, u.uFotoAltRect.value); u.uFotoEin.value = k.fotoEin * k.fotoEin * (3 - 2 * k.fotoEin); } else u.uFotoEin.value = 1;
        if (k.fotoEin >= 1) k.fotoAlt = null;
      } else {
        u.tFoto.value = q.foto; this.rechteck(k, q, u.uFotoRect.value); u.uFotoEin.value = 1;
        u.tFotoAlt.value = q.foto; u.uFotoAltRect.value.copy(u.uFotoRect.value);
      }
    }
    // Nacht: Vorfahr auf Stufe 8 oder darüber
    let nq = k; while (nq && nq.z > 8) nq = nq.eltern;
    const n = this.quelle(nq, 'nacht');
    if (n) { u.uNachtDa.value = 1; u.tNachtK.value = n.nacht; this.rechteck(k, n, u.uNachtRect.value); n.nachtZuletzt = this.frames; } else u.uNachtDa.value = 0;
    return nq;
  }
  baue(k, d, erbe = null) {
    const N = 32, pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2), uv1 = new Float32Array((N + 1) * (N + 1) * 2), idx = [];
    const n = 2 ** k.z, P = new THREE.Vector3();
    const hg = k.hgrid = new Float32Array((N + 1) * (N + 1));   // Höhen vor der Schürze (für hoehe())
    let feld = new Float32Array(65536), luecken = 0;
    if (erbe) { const cx = k.x - k.eltern.x * 2, cy = k.y - k.eltern.y * 2; for (let py = 0; py < 256; py++) { const fy = Math.max(0, Math.min(126.999, (cy + (py + 0.5) / 256) * 64 - 0.5)), j0 = Math.floor(fy), ty = fy - j0; for (let px = 0; px < 256; px++) { const fx = Math.max(0, Math.min(126.999, (cx + (px + 0.5) / 256) * 64 - 0.5)), i0 = Math.floor(fx), tx = fx - i0, o = j0 * 128 + i0; feld[py * 256 + px] = (erbe[o] * (1 - tx) + erbe[o + 1] * tx) * (1 - ty) + (erbe[o + 128] * (1 - tx) + erbe[o + 129] * tx) * ty; } } }
    else for (let i = 0; i < 65536; i++) { const v = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768; feld[i] = v; if (v < -12000) luecken++; }
    // Lücken im Datensatz (06.11.2026, Wunsch Nr. 56): Terrarium hat in manchen Gegenden auf Stufe 14 gar keine Daten (alles -32768, zum Beispiel im Allgäu). Das wurde zu Meereshöhe 0: mitten im Gebirge ein Viereck Meer mit Steilwänden, beim Zoomen ein dunkler Blitz. Solche Punkte kommen jetzt aus den Höhen der Eltern
    if (luecken) { const E0 = k.eltern?.hgrid, cx0 = E0 ? k.x - k.eltern.x * 2 : 0, cy0 = E0 ? k.y - k.eltern.y * 2 : 0; for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) { const o = py * 256 + px; if (feld[o] >= -12000) continue; if (!E0) { feld[o] = 0; continue; } const fx = (cx0 + px / 255) * 16, fy = (cy0 + py / 255) * 16, x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(N, x0 + 1), y1 = Math.min(N, y0 + 1), tx = fx - x0, ty = fy - y0; feld[o] = (E0[y0 * (N + 1) + x0] * (1 - tx) + E0[y0 * (N + 1) + x1] * tx) * (1 - ty) + (E0[y1 * (N + 1) + x0] * (1 - tx) + E0[y1 * (N + 1) + x1] * tx) * ty; } }
    // Terrarium ist in Städten ein Oberflächenmodell (Häuser und Bäume bis 25 m hoch).
    // Bodenfilter mit festem Fenster von 250 m Radius in jeder Stufe ab 9 (wie im Ort und bei den Kisten): sonst entfernt jede Stufe die
    // Stadtbuckel unterschiedlich stark, und an den Grenzen der Stufen entstehen Stufen und Spalten. Fein (r groß) auf 64 x 64 (Minimum je 4 x 4).
    const pxm = k.spanne / 256, r = 250 / pxm;
    let hoehe = (px, py) => feld[Math.min(255, py) * 256 + Math.min(255, px)];
    if (k.z >= 9 && r >= 0.5 && !erbe) {
      if (r > 6) {
        const klein = new Float32Array(64 * 64);
        for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { let m = Infinity; for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) { const v = feld[(j * 4 + b) * 256 + i * 4 + a]; if (v < m) m = v; } klein[j * 64 + i] = m; }
        const offen = bodenGekappt(klein, 64, Math.round(r / 4), pxm * 4);
        hoehe = (px, py) => offen[Math.min(63, py >> 2) * 64 + Math.min(63, px >> 2)];
      } else { const offen = bodenGekappt(feld, 256, Math.max(1, Math.round(r)), pxm); hoehe = (px, py) => offen[Math.min(255, py) * 256 + Math.min(255, px)]; }
    }
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const px = Math.round(i / N * 255), py = Math.round(j / N * 255); let h = hoehe(px, py); if (h < 0) h = 0; hg[j * (N + 1) + i] = h; }   // Meer auf 0 (Bathymetrie nicht als Loch)
    // Ränder: das letzte Pixel liegt ein halbes Pixel vor der Kachelgrenze, das erste der Nachbarkachel ein halbes dahinter. Im Steilen trennte das benachbarte Kacheln um Dutzende Meter. Die Höhe wird bis genau auf die Grenze fortgesetzt, dann treffen sich beide (07.11.2026)
    if (k.z >= 7) { const zp = hoehe === undefined ? 1 : (k.z >= 9 && r > 6 && !erbe ? 4 : 1), rnd = (i, j) => { const px = Math.round(i / N * 255), py = Math.round(j / N * 255); let h = hoehe(px, py), dx = 0, dy = 0; if (i === 0) dx = h - hoehe(zp, py); else if (i === N) dx = h - hoehe(255 - zp, py); if (j === 0) dy = h - hoehe(px, zp); else if (j === N) dy = h - hoehe(px, 255 - zp); return Math.max(0, h + THREE.MathUtils.clamp((dx + dy) * 0.5, -60, 60)); }; for (let t = 0; t <= N; t++) { hg[t] = rnd(t, 0); hg[N * (N + 1) + t] = rnd(t, N); hg[t * (N + 1)] = rnd(0, t); hg[t * (N + 1) + N] = rnd(N, t); } }
    // Seen und schmale Meeresarme (07.11.2026): zwei Gitterpunkte auf den Hängen links und rechts spannten eine schräge Fläche über das Wasser. An der Grenze zur feineren Kachel stand dann eine blaue Wand über dem See. Wasser ist im Höhenbild vollkommen eben: liegt im Umfeld eines Gitterpunkts genug ebene Fläche ganz unten, kommt der Punkt auf diese Höhe
    if (k.z >= 8 && !erbe) { const R = Math.max(2, Math.ceil(128 / N)), W = new Float32Array((2 * R + 1) * (2 * R + 1)); for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const cx = Math.round(i / N * 255), cy = Math.round(j / N * 255), x0 = Math.max(0, cx - R), x1 = Math.min(255, cx + R), y0 = Math.max(0, cy - R), y1 = Math.min(255, cy + R); let n0 = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = feld[y * 256 + x]; if (v > -12000) W[n0++] = v; } if (n0 < 8) continue; const T = W.subarray(0, n0).sort(); let best = 0, ab = 0; for (let a2 = 0, b2 = 0; b2 < n0; b2++) { while (T[b2] - T[a2] > 0.4) a2++; if (b2 - a2 + 1 > best) { best = b2 - a2 + 1; ab = a2; } } if (best / n0 < 0.14 || ab / n0 > 0.12) continue; const w = Math.max(T[ab + (best >> 1)], 0), o = j * (N + 1) + i; if (hg[o] > w + 3) hg[o] = w; } }
    // Ränder wie die nächst gröbere Stufe (seit 29.10.2026): ungerade Randpunkte liegen auf der Geraden ihrer Nachbarn. So passen Kacheln
    // gleicher und benachbarter Stufen ohne Stufe aneinander (im Gebirge hingen sonst Vorhänge an den Kachelgrenzen)
    // Gerade Randpunkte aus dem Gitter der Eltern (sie liegen genau auf dessen Punkten): so zeigt jeder Rand die Höhen der gröberen Stufe, und
    // Nachbarn gleicher oder eine Stufe gröberer Kacheln treffen sich auf denselben Werten (rekursiv, über Elterngrenzen hinweg)
    // Seit 07.11.2026 aus den eigenen Höhen der Eltern, nicht aus ihrem schon angepassten Rand: sonst vererbte sich der Rand über alle Stufen, und auf großen Kachelgrenzen (etwa 8,4375° Ost) lief quer durch Alpen und Seen eine gerade Linie mit 16 km Punktabstand
    k.hroh = hg.slice();
    const E = k.eltern?.hroh;
    if (E) {
      const cx = k.x - k.eltern.x * 2, cy = k.y - k.eltern.y * 2, eh = (i, j) => E[(cy * 16 + j / 2) * (N + 1) + cx * 16 + i / 2];
      // Der Bodenfilter sieht am Rand der Kachel nur ihre eigene Hälfte des Fensters und lässt dort Hügel stehen, die er drinnen abträgt. Darum läuft das Gitter auf den letzten rund 300 m in die Höhen der Eltern aus: sonst gab es am Rand eine Stufe in einer Masche (wie eine Wand, bis über 30 m hoch)
      if (k.z >= 9) {
        const zelle = k.spanne / N, zone = Math.max(1.5, 300 / zelle), elternH = (i, j) => { const fx = cx * 16 + i / 2, fy = cy * 16 + j / 2, x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(N, x0 + 1), y1 = Math.min(N, y0 + 1), tx = fx - x0, ty = fy - y0; return (E[y0 * (N + 1) + x0] * (1 - tx) + E[y0 * (N + 1) + x1] * tx) * (1 - ty) + (E[y1 * (N + 1) + x0] * (1 - tx) + E[y1 * (N + 1) + x1] * tx) * ty; };
        for (let j = 1; j < N; j++) for (let i = 1; i < N; i++) { const w = THREE.MathUtils.smoothstep(Math.min(i, N - i, j, N - j), 0, zone); if (w < 1) { const o = j * (N + 1) + i; if (hg[o] > 0) hg[o] = Math.max(0.01, elternH(i, j) * (1 - w) + hg[o] * w); } }
      }
      for (let t = 0; t <= N; t += 2) { hg[t] = eh(t, 0); hg[N * (N + 1) + t] = eh(t, N); hg[t * (N + 1)] = eh(0, t); hg[t * (N + 1) + N] = eh(N, t); }
    }
    for (let t = 1; t < N; t += 2) { for (const [a, b, c] of [[t, t - 1, t + 1], [N * (N + 1) + t, N * (N + 1) + t - 1, N * (N + 1) + t + 1], [t * (N + 1), (t - 1) * (N + 1), (t + 1) * (N + 1)], [t * (N + 1) + N, (t - 1) * (N + 1) + N, (t + 1) * (N + 1) + N]]) hg[a] = (hg[b] + hg[c]) / 2; }
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const fx = i / N, fy = j / N, lon = (k.x + fx) / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (k.y + fy) / n))) / D2R;
      const h = hg[j * (N + 1) + i];
      geoZuSzene(lat, lon, h, P).sub(k.mitte);
      const o = j * (N + 1) + i; pos[o * 3] = P.x; pos[o * 3 + 1] = P.y; pos[o * 3 + 2] = P.z;
      uv[o * 2] = (lon + 180) / 360; uv[o * 2 + 1] = (lat + 90) / 180;   // Blue Marble ist gleichwinklig (equirectangular); three dreht Bilder (v = 0 unten), also Südpol bei v = 0
      uv1[o * 2] = fx; uv1[o * 2 + 1] = fy;   // Bilder der Kachel (ImageBitmap, flipY aus: v = 0 oben)
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, dd = c + 1; idx.push(a, c, b, b, c, dd); }
    const roh = new THREE.BufferGeometry(); roh.setAttribute('position', new THREE.BufferAttribute(pos, 3)); roh.setIndex(idx); roh.computeVertexNormals();
    const nor = roh.attributes.normal.array; roh.dispose();
    // Vorhang am Rand (echte Schürze, seit 29.10.2026): eine zweite Reihe Punkte unter dem Rand, beidseitig gezeichnet. Benachbarte Stufen
    // weichen im Gebirge um Hunderte Meter ab; die alte Schürze senkte nur den Rand und ließ unten eine Lücke (weiße Risse in den Alpen).
    let hMin = Infinity, hMax = -Infinity; for (const v of hg) { if (v < hMin) hMin = v; if (v > hMax) hMax = v; }
    const senk = THREE.MathUtils.clamp((hMax - hMin) * 0.25 + k.spanne * 0.006, 45, 800);
    k.hMin = hMin; k.hMax = hMax;
    // Flach genug für die Kinder? Dann bekommen sie das gefilterte Feld dieser Kachel (128 x 128) und laden keine eigenen Höhen
    k.flachFeld = null;
    if (k.z >= 9 && k.z < this.maxZoom && hMax - hMin < (k.z >= 10 ? 130 : 70)) { const f = new Float32Array(16384); for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) f[j * 128 + i] = hoehe(i * 2 + 1, j * 2 + 1); k.flachFeld = f; }
    const rand = []; for (let i = 0; i <= N; i++) rand.push(i); for (let j = 1; j <= N; j++) rand.push(j * (N + 1) + N); for (let i = N - 1; i >= 0; i--) rand.push(N * (N + 1) + i); for (let j = N - 1; j >= 1; j--) rand.push(j * (N + 1));
    const nG = (N + 1) * (N + 1), nR = rand.length, P2 = new Float32Array((nG + nR) * 3), N2 = new Float32Array((nG + nR) * 3), U2 = new Float32Array((nG + nR) * 2), U12 = new Float32Array((nG + nR) * 2);
    P2.set(pos); N2.set(nor); U2.set(uv); U12.set(uv1);
    rand.forEach((o, r) => {
      const q = nG + r; P.set(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]).add(k.mitte); P.multiplyScalar((P.length() - senk) / P.length()).sub(k.mitte);
      P2[q * 3] = P.x; P2[q * 3 + 1] = P.y; P2[q * 3 + 2] = P.z; for (let c = 0; c < 3; c++) N2[q * 3 + c] = nor[o * 3 + c];
      U2[q * 2] = uv[o * 2]; U2[q * 2 + 1] = uv[o * 2 + 1]; U12[q * 2] = uv1[o * 2]; U12[q * 2 + 1] = uv1[o * 2 + 1];
    });
    for (let r = 0; r < nR; r++) { const a = rand[r], b = rand[(r + 1) % nR], a2 = nG + r, b2 = nG + (r + 1) % nR; idx.push(a, a2, b, b, a2, b2); }
    // Kachel nur aus Meer (ab Stufe 9, gröbere Stufen brauchen die Punkte für die Rundung der Erde): ein Zehntel der Dreiecke, die Punkte bleiben
    const nurMeer = hMax === 0 && k.z >= 9, idxMeer = nurMeer ? meerIndex(N, nG, nR) : null;
    const RA = new Float32Array(nG + nR); RA.fill(1, nG);
    const AH = new Float32Array(nG + nR); AH.set(hg); rand.forEach((o, r) => { AH[nG + r] = hg[o]; });
    // Naht: Abstand jedes Randpunkts zur Linie, die eine eine Stufe gröbere Nachbarkachel dort zeichnet (ihre Randpunkte kommen aus den Höhen ihrer Eltern, das sind unsere Großeltern)
    const AN = new Float32Array((nG + nR) * 2), G0 = k.eltern?.eltern?.hroh;
    if (G0) { const P0 = k.eltern, GG = P0.eltern, cx0 = k.x - P0.x * 2, cy0 = k.y - P0.y * 2, pcx = P0.x - GG.x * 2, pcy = P0.y - GG.y * 2, linie = (i, j) => { const gi = pcx * 16 + (cx0 * 16 + i / 2) / 2, gj = pcy * 16 + (cy0 * 16 + j / 2) / 2, x0 = Math.floor(gi), y0 = Math.floor(gj), x1 = Math.min(N, x0 + 1), y1 = Math.min(N, y0 + 1), tx = gi - x0, ty = gj - y0; return (G0[y0 * (N + 1) + x0] * (1 - tx) + G0[y0 * (N + 1) + x1] * tx) * (1 - ty) + (G0[y1 * (N + 1) + x0] * (1 - tx) + G0[y1 * (N + 1) + x1] * tx) * ty; }, code = (i, j) => (j === 0 ? 1 : 0) + (j === N ? 2 : 0) + (i === 0 ? 4 : 0) + (i === N ? 8 : 0); const satz = (o, q) => { const j = Math.floor(o / (N + 1)), i = o - j * (N + 1); AN[q * 2] = linie(i, j) - hg[o]; AN[q * 2 + 1] = code(i, j); }; rand.forEach((o, r) => { satz(o, o); satz(o, nG + r); }); }
    { const mg = k.meerG = new Uint8Array((N + 1) * (N + 1)); for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) mg[j * (N + 1) + i] = feld[Math.round(j / N * 255) * 256 + Math.round(i / N * 255)] < 1 ? 255 : 0; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P2, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U2, 2)); g.setAttribute('uv1', new THREE.BufferAttribute(U12, 2)); g.setAttribute('aNaht', new THREE.BufferAttribute(AN, 2)); g.setAttribute('aRand', new THREE.BufferAttribute(RA, 1)); g.setAttribute('aH', new THREE.BufferAttribute(AH, 1)); if (idxMeer) g.setIndex(new THREE.BufferAttribute(idxMeer, 1)); else g.setIndex(idx);
    const mat = this.neuesMaterial(), u = mat.uniforms;
    u.uMitte.value.copy(k.mitte); u.uMitteMod.value.set(mod(k.mitte.x, PERIODE), mod(k.mitte.y, PERIODE), mod(k.mitte.z, PERIODE)); u.uZelle.value = k.spanne / N;
    // Tiefe je Punkt: die feinen Stufen der Terrarium Kacheln kennen im Meer oft nur 0, dann gilt die Tiefe der Eltern (ETOPO, bis Stufe rund 9 echt)
    { const tg = k.tiefeG = new Float32Array((N + 1) * (N + 1)); let vf = k.eltern, st = 1; while (vf && !vf.tiefeG) { vf = vf.eltern; st *= 2; }   // nächster Vorfahr mit Tiefen (die Kachel kann vor ihren Eltern geladen sein)
      const Eg = vf?.tiefeG, sk = vf ? 2 ** (k.z - vf.z) : 1, ox = vf ? k.x - vf.x * sk : 0, oy = vf ? k.y - vf.y * sk : 0;
      const vomVorfahr = (fx, fy) => { if (!Eg) return 80; const ex = (ox + fx) / sk * N, ey = (oy + fy) / sk * N, i0 = Math.min(N - 1, Math.floor(ex)), j0 = Math.min(N - 1, Math.floor(ey)), tx = ex - i0, ty = ey - j0; return (Eg[j0 * (N + 1) + i0] * (1 - tx) + Eg[j0 * (N + 1) + i0 + 1] * tx) * (1 - ty) + (Eg[(j0 + 1) * (N + 1) + i0] * (1 - tx) + Eg[(j0 + 1) * (N + 1) + i0 + 1] * tx) * ty; };
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const roh = feld[Math.round(j / N * 255) * 256 + Math.round(i / N * 255)]; tg[j * (N + 1) + i] = roh < -1.5 && (k.z <= 9 || -roh > 2) ? -roh : roh < 1 ? vomVorfahr(i / N, j / N) : 0; } }
    k.normalTex = this.normalKarte(k, hoehe, feld); u.tNormal.value = k.normalTex; u.uNormalDa.value = 1;
    const m = new THREE.Mesh(g, mat); m.frustumCulled = true; m.userData.welt = k.mitte;
    return m;
  }
  // Normalenkarte (Richtung in ECEF Szene, Alpha = Meer aus der Tiefe): Licht und Schatten je Pixel statt alle 33 Punkte. Aus großer Höhe
  // leicht überhöht, sonst wären die Alpen aus dem All flach (ein Pixel deckt dort Kilometer ab).
  normalKarte(k, hoehe, feld) {
    const M = this.normalGroesse, schritt = 256 / M, n = 2 ** k.z, daten = new Uint8Array(M * M * 4);
    const ueber = k.z <= 4 ? 7 : k.z <= 6 ? 4.5 : k.z <= 8 ? 2.8 : k.z <= 10 ? 1.8 : k.z <= 12 ? 1.3 : 1.1;
    const h = new Float32Array((M + 2) * (M + 2));
    for (let j = -1; j <= M; j++) for (let i = -1; i <= M; i++) { const px = Math.max(0, Math.min(255, Math.floor((i + 0.5) * schritt))), py = Math.max(0, Math.min(255, Math.floor((j + 0.5) * schritt))); let v = hoehe(px, py); if (v < 0) v = 0; h[(j + 1) * (M + 2) + i + 1] = v; }
    const cosLo = new Float32Array(M), sinLo = new Float32Array(M);
    for (let i = 0; i < M; i++) { const lon = ((k.x + (i + 0.5) / M) / n * 360 - 180) * D2R; cosLo[i] = Math.cos(lon); sinLo[i] = Math.sin(lon); }
    for (let j = 0; j < M; j++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (k.y + (j + 0.5) / M) / n))), cl = Math.cos(lat), sl = Math.sin(lat);
      const dm = 40075016 * cl / n / M * 2;   // zwei Texel in Metern (zentrale Differenz)
      for (let i = 0; i < M; i++) {
        const o = (j + 1) * (M + 2) + i + 1;
        const ge = (h[o + 1] - h[o - 1]) / dm * ueber, gn = (h[o - (M + 2)] - h[o + (M + 2)]) / dm * ueber;
        let nE = -ge, nN = -gn, nU = 1; const l = Math.hypot(nE, nN, nU); nE /= l; nN /= l; nU /= l;
        // Ost, Nord, Oben in Szenenkoordinaten (wie enu()): ost = (-sin lo, 0, -cos lo), oben = (cl cos lo, sl, -cl sin lo), nord = oben x ost
        const ox = -sinLo[i], oz = -cosLo[i], ux = cl * cosLo[i], uy = sl, uz = -cl * sinLo[i];
        const nx = uy * oz, ny = uz * ox - ux * oz, nz = -uy * ox;
        const X = ox * nE + nx * nN + ux * nU, Y = ny * nN + uy * nU, Z = oz * nE + nz * nN + uz * nU;
        const q = (j * M + i) * 4; daten[q] = (X * 0.5 + 0.5) * 255; daten[q + 1] = (Y * 0.5 + 0.5) * 255; daten[q + 2] = (Z * 0.5 + 0.5) * 255;
        const roh = feld[Math.min(255, Math.floor((j + 0.5) * schritt)) * 256 + Math.min(255, Math.floor((i + 0.5) * schritt))];
        if (roh < 0.6 && k.tiefeG) {   // Tiefe aus dem Punktgitter (mit den Eltern), so ist ein Schelfmeer nicht flach, nur weil die feine Kachel dort 0 hat
          const N2 = 32, fx = (i + 0.5) / M * N2, fy = (j + 0.5) / M * N2, i0 = Math.min(N2 - 1, Math.floor(fx)), j0 = Math.min(N2 - 1, Math.floor(fy)), tx = fx - i0, ty = fy - j0, tg = k.tiefeG;
          const t = (tg[j0 * 33 + i0] * (1 - tx) + tg[j0 * 33 + i0 + 1] * tx) * (1 - ty) + (tg[(j0 + 1) * 33 + i0] * (1 - tx) + tg[(j0 + 1) * 33 + i0 + 1] * tx) * ty;
          daten[q + 3] = t > 0.5 ? Math.min(255, Math.max(8, t / 160 * 255)) : 4;   // Meer: 8 = flach, 255 = ab 160 m tief; 4 = um 0 m
        } else daten[q + 3] = roh < 0 ? Math.min(255, Math.max(8, -roh / 160 * 255)) : roh < 0.6 ? 4 : 0;
      }
    }
    const t = new THREE.DataTexture(daten, M, M, THREE.RGBAFormat); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    return t;
  }
  entladen(k) {
    if (k.abbruch) k.abbruch.abort();
    if (k.mesh) { this.gruppe.remove(k.mesh); k.mesh.geometry.dispose(); k.mesh.material.dispose(); k.mesh = null; this.geladen--; }
    if (k.karteTex) { k.karteTex.dispose(); k.karteTex = null; }
    if (k.maskeTex) { k.maskeTex.image?.close?.(); k.maskeTex.dispose(); k.maskeTex = null; }
    if (k.normalTex) { k.normalTex.dispose(); k.normalTex = null; }
    if (k.foto) {
      // sichtbare Nachfahren, die dieses Bild als Vorfahr zeigen, sofort auf ein anderes Bild stellen: sonst zeichnet das laufende Bild noch mit
      // dem geschlossenen ImageBitmap (live mit langsamem Netz: "source data has been detached", Kachel kurz schwarz)
      const betroffen = []; for (const o of this.kacheln.values()) { const u = o.mesh?.material.uniforms; if (u && o !== k && (u.tFoto.value === k.foto || u.tFotoAlt.value === k.foto)) betroffen.push(o); }
      k.foto.image?.close?.(); k.foto.dispose(); k.foto = null; this.fotoAnzahl--;
      for (const o of betroffen) { const u = o.mesh.material.uniforms; u.tFoto.value = u.tFotoAlt.value = LEER; u.uFotoDa.value = 0; this.bilderSetzen(o, 0); }
    }
    k.fotoAlt = null;
  }

  // Quadtree je Bild: Kacheln verfeinern, bis ihre Spanne auf dem Bildschirm klein genug ist. Eine Kachel verschwindet erst, wenn alle
  // sichtbaren Kinder geladen sind (nichts ploppt, nichts liegt doppelt übereinander); fehlt ein Kind, zeigt die Kachel sich selbst und
  // versteckt den ganzen Unterbaum (sonst flimmern Eltern und Kinder gegeneinander).
  // Kacheln um einen Punkt vorab laden (Flugziel): Stufen 6 bis maxZoom, die feinsten mit Nachbarn
  vorladen(lat, lon) {
    for (let z = 6; z <= this.maxZoom; z++) {
      const t = kachelVonGeo(lat, lon, z), r = z >= 11 && z <= this.maxZoom - 1 ? 2 : 1;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) { const v = this.pfad(z, t.x + dx, t.y + dy); v.fuerZiel = true; this.vorlade.push(v); }   // Stufen 11 bis 13 mit 5 x 5 (Blick beim Abstieg)
    }
  }
  // Kachel über die Kette der Vorfahren anlegen (damit eltern stimmt)
  pfad(z, x, y) {
    let k = this.kachel(2, x >> (z - 2), y >> (z - 2));
    for (let zz = 3; zz <= z; zz++) { const kx = x >> (z - zz), ky = y >> (z - zz); k = this.kinder(k)[(ky & 1) * 2 + (kx & 1)]; }
    return k;
  }
  update(camera, kameraWelt, hoeheKamera, dt = 1 / 60, sonneE = null) {
    this.frames++;
    for (const k of this.einblenden) { if (!k.mesh) { this.einblenden.delete(k); continue; } const u = k.mesh.material.uniforms.uKarteEin; u.value = Math.min(1, u.value + dt / 0.7); if (u.value >= 1) this.einblenden.delete(k); }
    this.vorlade = this.vorlade.filter(k => !k.fehler && (!k.mesh || (this.fotos && !k.foto && !k.fotoFehler)));
    for (const k of this.vorlade) { k.zuletzt = this.frames; if (!k.mesh) { if (this.laufend < this.maxLaufend) this.laden(k); } else if (this.fotos) this.fotoLaden(k); }
    const fr = this._fr ??= new THREE.Frustum(), M = this._m ??= new THREE.Matrix4();
    camera.updateMatrixWorld(); fr.setFromProjectionMatrix(M.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sph = this._s ??= new THREE.Sphere(), tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hoehePx = this.renderer.domElement.clientHeight || 900;
    const sichtbar = new Set(), wuensche = [];
    // Horizont: was dahinter liegt, ist nie zu sehen, belastete aber die Grafikkarte (rund 40 Grad Kacheln hinter dem Horizont, mehrfach übereinander im Streifen unter der Kimm). Berge hinter dem Horizont bleiben über ihre Höhe sichtbar
    const gK = szeneZuGeo(kameraWelt), lenK = kameraWelt.length(), rK = lenK - gK.h, horizont = Math.acos(THREE.MathUtils.clamp(rK / Math.max(rK + 1, lenK), -1, 1)), kamN = kameraWelt.clone().normalize();
    const versteckeBaum = (k) => { if (k.mesh) k.mesh.visible = false; if (k.kinder) for (const c of k.kinder) versteckeBaum(c); };
    this.gruppe.updateMatrixWorld(); const GW = this.gruppe.matrixWorld;
    // liefert true, wenn alles Sichtbare dieser Kachel gezeichnet ist (durch sie selbst oder ihre Kinder)
    const cW = this._cw ??= new THREE.Vector3();
    const besuche = (k) => {
      // Hülle auf der echten Höhe der Kachel (vor dem Laden die der Eltern): auf Meereshöhe fielen im Hochgebirge Kacheln vor der Kamera aus der Sicht (weißes Loch)
      const hLo = k.hMin ?? k.eltern?.hMin ?? 0, hHi = k.hMax ?? k.eltern?.hMax ?? (k.z >= 5 ? 5000 : 0), hm = (hLo + hHi) / 2;
      cW.copy(k.oben).multiplyScalar(hm).add(k.mitte);
      sph.center.copy(cW).sub(this.ursprung).applyMatrix4(GW); sph.radius = Math.hypot(k.radius, (hHi - hLo) / 2) * 1.02;
      if (k.z > 2) {
        if (!fr.intersectsSphere(sph)) { versteckeBaum(k); return true; }
        const beta = Math.acos(THREE.MathUtils.clamp(k.mitte.dot(kamN) / k.mitte.length(), -1, 1));
        if (k.z < 5 ? Math.cos(beta) < rK / Math.max(rK + 1, lenK) - 0.25 : beta - Math.asin(Math.min(1, sph.radius / rK)) > horizont + Math.acos(rK / (rK + Math.max(hHi, 0) * 1.3 + 600))) { versteckeBaum(k); return true; }
      }
      k.zuletzt = this.frames;
      // Abstand zum nächsten Punkt der Kachel (nicht zur Mitte): Nachbarn unterscheiden sich so höchstens um eine Stufe, sonst hingen im Gebirge Vorhänge
      // Flacher Blick (am Boden auf ferne Kacheln): sie liegen als schmaler Streifen am Horizont, gröbere Stufen sehen gleich aus und sparen Zeichnungen (Paris am Boden 296 Kacheln, jede rund 20 Mikrosekunden)
      const d = Math.max(1, kameraWelt.distanceTo(cW) - sph.radius * 0.95), flach = d > 1800 ? Math.min(1, Math.max(0.34, (Math.max(0, hoeheKamera) + (hHi - hLo)) / d * 6)) : 1, px = k.spanne / (2 * d * tan) * hoehePx * flach;
      k.wichtig = d / k.spanne; k.grobPx = px / this.pixelGrenze;
      // Offene See weiter weg: Wellen und Licht kommen aus dem Shader, feinere Kacheln brächten nichts. Spart Zeichnungen (jede kostet rund 30 Mikrosekunden Metal Zustand) und Dreiecke
      if (px > this.pixelGrenze * (k.hMax === 0 && k.z >= 6 && d > 6000 ? 2.6 : 1) && k.z < this.maxZoom) {
        const kinder = this.kinder(k); let alle = true;
        for (const c of kinder) if (!besuche(c)) alle = false;
        if (alle) { if (k.mesh) k.mesh.visible = false; return true; }
        for (const c of kinder) versteckeBaum(c);   // Rückfall auf diese Kachel, bis die Kinder da sind
      }
      if (k.mesh) { k.mesh.visible = true; sichtbar.add(k); return true; }
      wuensche.push([d, k]); return false;
    };
    for (const w of this.wurzeln) besuche(w);
    // Nähte: welche Kante grenzt an eine gröbere Kachel? Neu berechnet, wenn sich die sichtbaren Kacheln ändern, weich überblendet
    { let sig = sichtbar.size; for (const k of sichtbar) sig = (sig * 31 + k.z * 7 + k.x * 13 + k.y * 17) | 0; if (sig !== this.nahtSig) { this.nahtSig = sig; const grob = (z, x, y) => { const n = 2 ** z; x = (x + n) % n; if (y < 0 || y >= n) return 0; for (let d = 1; d <= 5 && z - d >= 2; d++) { const a = this.kacheln.get(`${z - d}/${x >> d}/${y >> d}`); if (a?.mesh?.visible && sichtbar.has(a)) return 1; } return 0; }; for (const k of sichtbar) { (k.nahtZ ??= new THREE.Vector4()).set(grob(k.z, k.x, k.y - 1), grob(k.z, k.x, k.y + 1), grob(k.z, k.x - 1, k.y), grob(k.z, k.x + 1, k.y)); } } const am = Math.min(1, dt * 5); for (const k of sichtbar) { const u = k.mesh.material.uniforms.uNaht?.value, z = k.nahtZ; if (u && z) { u.x += (z.x - u.x) * am; u.y += (z.y - u.y) * am; u.z += (z.z - u.z) * am; u.w += (z.w - u.w) * am; } } }
    wuensche.sort((a, b) => a[0] - b[0]);
    // Im Flug nur laden, was am Ziel gebraucht wird: Kacheln unterwegs sind Sekundenbruchteile im Bild und blockierten den Server für das Ziel
    for (const [, k] of wuensche) { if (this.laufend >= this.maxLaufend) break; if (this.imFlug && k.z >= 5 && !k.fuerZiel) continue; this.laden(k); }
    // Bilder: sichtbare Kacheln setzen ihre Quelle; fehlende Fotos zuerst für Kacheln, die groß im Bild sind; Nachtlichter nur auf der Nachtseite
    const fotoWunsch = [], nachtWunsch = new Set();
    for (const k of sichtbar) {
      if (k.karteWunsch && !this.imFlug) this.karteHolen(k);
      const nq = this.bilderSetzen(k, dt);
      if (this.fotos && !k.foto && !k.fotoLaedt) fotoWunsch.push(k);
      if (this.fotos && nq && !nq.nacht && sonneE && k.mitte.dot(sonneE) / k.mitte.length() < 0.3) nachtWunsch.add(nq);
    }
    for (const m of this.kappen) m.material.uniforms.uFotoDa.value = 0;
    if (this.fotos) {
      fotoWunsch.sort((a, b) => a.wichtig - b.wichtig);
      for (const k of fotoWunsch) { if (this.fotoLaufend >= this.maxFotos) break; this.fotoLaden(k); }
      for (const k of nachtWunsch) this.nachtLaden(k);
    }
    // Die nächste Stufe vorladen, sobald alles Sichtbare da ist (Wunsch Nr. 56, Nader: "nicht immer erst nach dem Laden"): die Kacheln mitten im Bild zuerst. Zoomen zeigt dann sofort das schärfere Bild
    if (this.fotos && !this.imFlug && !wuensche.length && !fotoWunsch.length && this.laufend < (this.mobil ? 1 : 3) && this.fotoLaufend < (this.mobil ? 1 : 3) && this.frames % 4 === 0) {
      const nah = [...sichtbar].filter(k => k.z < this.maxZoom).sort((a, b) => a.wichtig - b.wichtig).slice(0, this.mobil ? 6 : 16);
      suche: for (const k of nah) for (const c of this.kinder(k)) {
        if (c.fehler) continue;
        if (!c.mesh) { if (!c.laedt) { this.laden(c); break suche; } continue; }
        c.zuletzt = this.frames;
        if (!c.foto && !c.fotoLaedt && !(c.fotoFehler && performance.now() - c.fotoFehler < 20000)) { this.fotoLaden(c); break suche; }
      }
    }
    // Speicher: lange nicht besuchte Kacheln freigeben (nie die Wurzeln); Nachtbilder nach einer Weile ohne Nutzung
    if (this.geladen > this.budget && this.frames % 30 === 0) {
      const alt = [...this.kacheln.values()].filter(k => k.mesh && k.z > 2 && this.frames - k.zuletzt > 120).sort((a, b) => a.zuletzt - b.zuletzt);
      for (const k of alt.slice(0, this.geladen - this.budget + 20)) this.entladen(k);
    }
    if (this.frames % 120 === 0) for (const k of this.kacheln.values()) if (k.nacht && this.frames - (k.nachtZuletzt || 0) > 1800) { for (const o of this.kacheln.values()) { const u = o.mesh?.material.uniforms; if (u && u.tNachtK.value === k.nacht) { u.tNachtK.value = LEER; u.uNachtDa.value = 0; } } k.nacht.image?.close?.(); k.nacht.dispose(); k.nacht = null; }   // erst alle Kacheln umstellen, die dieses Bild noch tragen (sonst zeichnete eine wieder sichtbare Kachel mit dem geschlossenen Bild: WebGL Fehler)
    this.sichtbar = sichtbar;
  }
  // Ursprung umsetzen: alle Kacheln bekommen neue Positionen (Punkte bleiben), Kamera bleibt nahe 0
  setzeUrsprung(v) {
    this.ursprung.copy(v);
    for (const k of this.kacheln.values()) if (k.mesh) k.mesh.position.copy(k.mitte).sub(v);
    for (const m of this.kappen || []) m.position.copy(m.userData.welt).sub(v);
  }
  // Liegt hier Wasser (Meer, Fluss, See)? 0 bis 1 aus den Vektorkarten, wo sie schon da sind, sonst wie meerBei
  wasserBei(lat, lon) {
    for (let z = this.maxZoom; z >= this.karteAb; z--) {
      const t = kachelVonGeo(lat, lon, z), k = this.kacheln.get(`${z}/${t.x}/${t.y}`); if (!k?.wasserG) continue;
      const n = 2 ** z, fx = (lon + 180) / 360 * n - t.x, la = lat * D2R, fy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n - t.y, i = Math.min(31, Math.max(0, Math.floor(fx * 32))), j = Math.min(31, Math.max(0, Math.floor(fy * 32))), tx = fx * 32 - i, ty = fy * 32 - j, m = k.wasserG;
      return ((m[j * 33 + i] * (1 - tx) + m[j * 33 + i + 1] * tx) * (1 - ty) + (m[(j + 1) * 33 + i] * (1 - tx) + m[(j + 1) * 33 + i + 1] * tx) * ty) / 255;
    }
    return this.meerBei(lat, lon);
  }
  // Liegt hier Meer? 0 bis 1 aus der feinsten geladenen Kachel (Höhen vor dem Filter, unter 1 m)
  meerBei(lat, lon) {
    for (let z = this.maxZoom; z >= 2; z--) {
      const t = kachelVonGeo(lat, lon, z), k = this.kacheln.get(`${z}/${t.x}/${t.y}`); if (!k || !k.mesh || !k.meerG) continue;
      const n = 2 ** z, fx = ((lon + 180) / 360 * n - t.x), la = lat * D2R, fy = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n - t.y);
      const N = 32, i = Math.min(N - 1, Math.floor(fx * N)), j = Math.min(N - 1, Math.floor(fy * N)), m = k.meerG, tx = fx * N - i, ty = fy * N - j;
      return ((m[j * (N + 1) + i] * (1 - tx) + m[j * (N + 1) + i + 1] * tx) * (1 - ty) + (m[(j + 1) * (N + 1) + i] * (1 - tx) + m[(j + 1) * (N + 1) + i + 1] * tx) * ty) / 255;
    }
    return 0;
  }
  // Höhe des Geländes an einer Stelle (aus der feinsten geladenen Kachel, bilinear aus den 33 x 33 Punkten über die Entfernung zur Kugel)
  hoehe(lat, lon) {
    for (let z = this.maxZoom; z >= 2; z--) {
      const t = kachelVonGeo(lat, lon, z), k = this.kacheln.get(`${z}/${t.x}/${t.y}`); if (!k || !k.mesh) continue;
      const n = 2 ** z, fx = ((lon + 180) / 360 * n - t.x), la = lat * D2R, fy = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n - t.y);
      const N = 32, i = Math.min(N - 1, Math.floor(fx * N)), j = Math.min(N - 1, Math.floor(fy * N)), hg = k.hgrid;
      const h = (ii, jj) => hg[jj * (N + 1) + ii];
      const tx = fx * N - i, ty = fy * N - j;
      const h00 = h(i, j), h10 = h(i + 1, j), h01 = h(i, j + 1), h11 = h(i + 1, j + 1);
      const r = (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
      return Math.max(0, r);
    }
    return 0;
  }
}

// Orte als Lichter: Punkte in Szenenkoordinaten (Float32 reicht aus der Höhe), Größe nach Einwohnern, nachts sichtbar
export function orteLichter(orte, ursprung) {
  const n = orte.length, pos = new Float32Array(n * 3), gr = new Float32Array(n), P = new THREE.Vector3();
  orte.forEach((o, i) => { geoZuSzene(o.lat, o.lon, 30, P); pos.set([P.x, P.y, P.z], i * 3); gr[i] = Math.min(3.5, 0.6 + Math.log10(Math.max(1000, o.pop)) - 2.5); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('gr', new THREE.BufferAttribute(gr, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSonne: { value: new THREE.Vector3(1, 0, 0) }, uStaerke: { value: 1 } },
    vertexShader: `attribute float gr; uniform vec3 uSonne; uniform float uStaerke; varying float vA;
      void main() { vec3 n = normalize(position); float s = dot(n, uSonne); vA = smoothstep(0.1, -0.1, s) * uStaerke;
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = gr * clamp(3000000.0 / max(1.0, -mv.z), 0.5, 4.0) * 1.6; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.4, 1.0, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(1.0, 0.86, 0.6, a);\n      #include <colorspace_fragment>\n    }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.position.copy(ursprung).negate();
  return pts;
}

// Kamera über der Kugel: Lage als Breite, Länge, Höhe über Grund, Kurs und Neigung; Position in Szenenkoordinaten (Float64)
export class Kugelkamera {
  constructor(camera) { this.camera = camera; this.lat = 52.51; this.lon = 13.377; this.hoehe = 12000000; this.kurs = 0; this.neigung = -89; this.welt = new THREE.Vector3(); this.boden = 0; }
  // Position und Blick setzen (ursprung: aktueller Ursprung der Szene)
  anwenden(ursprung) {
    const e = enu(this.lat, this.lon), p = geoZuSzene(this.lat, this.lon, this.boden + this.hoehe, this.welt);
    const k = this.kurs * D2R, n = this.neigung * D2R;
    const vor = new THREE.Vector3().addScaledVector(e.nord, Math.cos(k)).addScaledVector(e.ost, Math.sin(k));
    const blick = new THREE.Vector3().addScaledVector(vor, Math.cos(n)).addScaledVector(e.oben, Math.sin(n));
    this.camera.position.copy(p).sub(ursprung); this.camera.up.copy(e.oben);
    this.camera.lookAt(this.camera.position.clone().add(blick));
    this.camera.near = THREE.MathUtils.clamp(this.hoehe * 0.002, 0.3, 2000); this.camera.far = Math.sqrt(Math.max(1, this.hoehe) * (2 * R + this.hoehe)) * 1.2 + 200000; this.camera.updateProjectionMatrix();
    this.e = e;
  }
  // Ziehen (Pixel) verschiebt die Lage, Rad ändert die Höhe, Rechts ziehen dreht
  ziehen(dx, dy, hoehePx) {
    const mpp = 2 * this.hoehe * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / hoehePx * (this.neigung < -60 ? 1 : 0.6);
    const k = this.kurs * D2R, ox = -dx * mpp, oy = dy * mpp;   // Bild zieht die Erde mit
    const dN = oy * Math.cos(k) - ox * Math.sin(k), dE = oy * Math.sin(k) + ox * Math.cos(k);
    this.verschiebe(dE, dN);
  }
  verschiebe(dE, dN) { this.lat = THREE.MathUtils.clamp(this.lat + dN / R / D2R, -85, 85); this.lon = ((this.lon + dE / (R * Math.cos(this.lat * D2R)) / D2R + 540) % 360) - 180; }
  zoom(f) { this.hoehe = THREE.MathUtils.clamp(this.hoehe * f, 1.6, 30000000); }
  drehen(dx, dy) { this.kurs = (this.kurs + dx * 0.25 + 360) % 360; this.neigung = THREE.MathUtils.clamp(this.neigung + dy * 0.25, -89.5, 10); }
}
