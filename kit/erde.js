// Die Erde als Kugel (08_WELTBAU.md Phase 1, seit 29.10.2026): Koordinaten (WGS84, ECEF, ENU, Web Mercator Kacheln), wandernder
// Ursprung, Gelände aus AWS Terrarium Kacheln als Quadtree mit Bildschirmfehler, Blue Marble bei Tag und Nachtlichter (NASA, gemeinfrei),
// Kamera vom All bis zum Gehweg. Skill threejs-large-worlds: große Zahlen bleiben in JavaScript (Float64), die GPU bekommt nur
// Punkte relativ zum Kachelmittelpunkt und Positionen relativ zum Ursprung.
import * as THREE from 'three';

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

const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
// Satellitenbild: Sentinel 2 cloudless 2016 von EOX (CC BY 4.0, Hinweis auf der Seite), wolkenfrei, 10 m je Pixel, im selben Kachelraster wie das Gelände.
// Nur der Jahrgang 2016 ist frei für jede Nutzung (2018 und später CC BY NC SA). Nachtlichter: NASA Black Marble 2016 über GIBS (gemeinfrei), bis Stufe 8.
export const FOTO = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';
export const NACHT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png';
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
  // Oktaven stufenlos (die letzte blendet nach dem Bruchteil ein, sonst sah man Ringe beim Wechsel der Detailstufe)
  float wolkenFbm(vec3 p, float n) { float s = 0.0, a = 0.5; for (int i = 0; i < 9; i++) { float g = clamp(n - float(i), 0.0, 1.0); if (g <= 0.0) break; s += a * wert3(p) * g + a * 0.5 * (1.0 - g); p = p * 2.07 + 17.13; a *= 0.5; } return s; }
  float wolkenDichte(vec3 d, float okt) {
    float lat = asin(clamp(d.y, -1.0, 1.0)), al = abs(lat);
    // Klima: Tropen (Äquator) und Westwindzone (um 55 Grad) wolkig, Wüstengürtel (um 24 Grad) und Pole klar
    float klima = 0.16 * exp(-pow(lat / 0.10, 2.0)) + 0.12 * exp(-pow((al - 0.98) / 0.24, 2.0)) - 0.16 * exp(-pow((al - 0.41) / 0.12, 2.0)) - 0.08 * exp(-pow((al - 1.45) / 0.2, 2.0));
    vec3 drift = vec3(uWolken.y * 0.0021, 0.0, -uWolken.y * 0.0009);
    vec3 p = d * 2.0 + drift;
    vec3 w = vec3(wert3(p * 1.5), wert3(p * 1.5 + 11.3), wert3(p * 1.5 + 23.9)) - 0.5;   // leichte Verwirbelung (Fronten, Tiefs)
    float gross = wolkenFbm(d * 4.5 + w * 1.1 + drift * 3.0, 4.0);                     // Wetterlagen
    float nf = max(3.0, okt - 2.0), fein = wolkenFbm(d * 70.0 + w * 0.6 + drift * 25.0, nf) / (1.0 - pow(0.5, nf));   // Haufenwolken in den Feldern (normiert: gleiche Bedeckung nah und fern)
    float n = gross * 0.8 + fein * 0.42 + klima;
    float schwelle = 0.72 - uWolken.x * 0.30;   // geeicht mit Stichproben (09_GRAFIK.md): klar rund ein Viertel, bedeckt rund drei Viertel
    return smoothstep(schwelle, schwelle + 0.2, n);   // breiter Übergang: Ränder durchscheinend
  }
`;

// Material für Kugel und Kacheln: Satellitenbild der Kachel (oder eines Vorfahren, bis das eigene da ist), Nachtlichter, Licht und Schatten
// aus der Normalenkarte (Gelände), Meer mit Wellen, Spiegelung und Glitzerpfad, Bodendetail aus der Nähe, Wolkenschatten, Luftperspektive.
// Eigene Shader brauchen am Ende tonemapping_fragment und colorspace_fragment, sonst landet lineares Licht ungewandelt auf dem sRGB Bildschirm.
export function erdMaterial(tag, nacht, defines = {}) {
  for (const t of [tag, nacht]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; }
  return new THREE.ShaderMaterial({ uniforms: { ...erdUniforms(tag, nacht), ...kachelUniforms() }, vertexShader: ERD_VS, fragmentShader: ERD_FS, defines });
}
// Uniforms getrennt: die gemeinsamen Objekte (Sonne, Dunst, Ort, Zeit) teilen alle Kacheln, die eigenen (Bilder, Rechtecke) hat jede Kachel selbst
function erdUniforms(tag, nacht) {
  return { tTag: { value: tag }, tNacht: { value: nacht }, uSonne: { value: new THREE.Vector3(1, 0, 0) }, uRelief: { value: 1 },
    uOrt: { value: new THREE.Vector4(0, 0, 0, 0) },              // halbe Kante, aktiv, Mitte x, Mitte z (lokale Szene): dort liegt der gebaute Ort, die Kugel spart ihn aus
    uOrtX: { value: new THREE.Vector2(1, 0) }, uOrtZ: { value: new THREE.Vector2(0, 1) },   // Achsen des Ortes in der Ebene der Szene
    uNebelFarbe: { value: new THREE.Color(0.8, 0.82, 0.84) }, uNebel: { value: new THREE.Vector2(1e9, 2e9) },   // Dunst wie scene.fog (Dashboard)
    uKarteFern: { value: new THREE.Vector2(9000, 26000) },       // Kartentextur nah, nur Foto fern (Abstand in Metern)
    uHell: { value: 1 }, uZeit: { value: 0 }, uDetail: { value: 1 }, tDetail: { value: LEER }, uDetailDa: { value: 0 },
    uZuLokal: { value: new THREE.Matrix3() }, uSonneE: { value: new THREE.Vector3(1, 0, 0) },   // Drehung ECEF Szene -> lokal (Normalenkarten), Sonne in ECEF
    uZuWelt: { value: new THREE.Matrix3() }, uUrsprungMod: { value: new THREE.Vector3() },   // lokal -> ECEF und Ursprung modulo PERIODE (Wasser im Ort, Wolken)
    uWolken: { value: new THREE.Vector4(0, 0, 0, 0) },
    uDunst: { value: new THREE.Color(0.27, 0.41, 0.66) } };      // Luftperspektive: Farbe des Dunsts bei Tag (linear)
}
function kachelUniforms() {
  return { tFoto: { value: LEER }, uFotoRect: { value: new THREE.Vector4(0, 0, 1, 1) }, tFotoAlt: { value: LEER }, uFotoAltRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFotoEin: { value: 1 }, uFotoDa: { value: 0 }, tNachtK: { value: LEER }, uNachtRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uNachtDa: { value: 0 },
    tNormal: { value: LEER }, uNormalDa: { value: 0 }, tKarte: { value: LEER }, uKarteEin: { value: 0 }, tMaske: { value: LEER }, uMaskeDa: { value: 0 },
    uMitte: { value: new THREE.Vector3() }, uMitteMod: { value: new THREE.Vector3() } };
}
export const PERIODE = 4096;   // Meter: Wellen und Bodendetail rechnen mit Koordinaten modulo dieser Periode (Float32 bleibt genau, keine Nähte)
const ERD_VS = `attribute vec2 uv1; attribute float aRand; uniform vec3 uMitte, uMitteMod; varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying float vD; varying vec3 vW; varying vec3 vE; varying vec3 vP; varying float vRand;
  void main() { vUv = uv; vUv1 = uv1; vRand = aRand; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position, 1.0)).xyz;
    vE = normalize(uMitte + position); vP = uMitteMod + position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`;
// Meer und Wasser (Kugel und Wasser im gebauten Ort, seit 29.10.2026 gemeinsam, damit es an der Ortsgrenze keinen Sprung gibt).
// vP: Koordinaten in ECEF modulo PERIODE (nahtlos), fp: Größe eines Pixels in Metern, tief: 0 flach bis 1 Tiefsee.
// Braucht uZeit, uZuLokal, uSonne, uDunst, uNebelFarbe, uHell und RAUSCHEN_GLSL.
export const WASSER_GLSL = `
  // Höhe der Wellen (periodisch, zwei Lagen, ziehen mit dem Wind); w1, w2: Gewicht der Lagen nach der Größe eines Pixels (kein Flimmern)
  float welle(vec3 p, float w1, float w2) { return wert3p(p / 64.0 + vec3(uZeit * 0.031, 0.0, uZeit * 0.017), ${PERIODE / 64}.0) * 0.65 * w1 + wert3p(p / 16.0 + vec3(-uZeit * 0.09, uZeit * 0.05, 0.0), ${PERIODE / 16}.0) * 0.35 * w2; }
  vec3 wasserFarbe(vec3 Ng, vec3 V, vec3 vP, float fp, float tief, vec3 tag, float sG, float tagSeite, float schatten) {
    vec3 Nw = Ng;   // Wasser ist eben: Kugelnormale, die Wellen kippen sie nah
    float w1 = 1.0 - smoothstep(8.0, 30.0, fp), w2 = 1.0 - smoothstep(2.0, 8.0, fp);
    if (w1 > 0.01) {
      float e = 1.5, h0 = welle(vP, w1, w2);
      vec3 g = vec3(welle(vP + vec3(e, 0.0, 0.0), w1, w2) - h0, welle(vP + vec3(0.0, e, 0.0), w1, w2) - h0, welle(vP + vec3(0.0, 0.0, e), w1, w2) - h0) / e;
      g = uZuLokal * g; g -= Ng * dot(g, Ng);
      Nw = normalize(Ng - g * 5.0);
    }
    // Grundfarbe nach Tiefe, das Foto nur leicht (die Stufen des Mosaiks färben das Meer verschieden)
    float lichtW = clamp(sG * 1.1, 0.0, 1.0);
    vec3 wasser = mix(mix(vec3(0.016, 0.06, 0.075), vec3(0.005, 0.02, 0.042), tief), tag, 0.22 * (1.0 - tief)) * (0.12 + 0.88 * lichtW) * uHell;
    // Spiegelung nach Fresnel aus der glatten Normale (stetig über den Abstand), die Wellen geben nah etwas Unruhe dazu
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(Ng, V), 0.0), 5.0), Fw = 0.02 + 0.98 * pow(1.0 - max(dot(Nw, V), 0.0), 5.0);
    F = mix(F, Fw, 0.5 * w1) * 0.72;
    vec3 himmel = mix(uDunst * 1.9, uNebelFarbe * 1.3, 0.35) * (0.15 + 0.9 * tagSeite) * uHell;   // der Himmel spiegelt sich (blau, zum Horizont heller)
    wasser = mix(wasser, himmel, F);
    float glanz = mix(900.0, 70.0, smoothstep(0.0, 40.0, fp));
    float sp = pow(max(dot(reflect(-uSonne, Nw), V), 0.0), glanz) * (glanz / 900.0 * 0.6 + 0.4) * tagSeite;
    return wasser + vec3(1.0, 0.93, 0.82) * sp * 1.6 * schatten * uHell;
  }
`;
// Wasser im gebauten Ort (kit/ort.js): gleiche Wellen und Farbe wie das Meer der Kugel; U: Uniforms der Kugel (gemeinsame Objekte)
export function wasserMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uSonne: U.uSonne, uDunst: U.uDunst, uNebelFarbe: U.uNebelFarbe, uNebel: U.uNebel, uHell: U.uHell, uZeit: U.uZeit, uZuLokal: U.uZuLokal, uZuWelt: U.uZuWelt, uUrsprungMod: U.uUrsprungMod },
    vertexShader: `uniform vec3 uUrsprungMod; uniform mat3 uZuWelt; varying vec3 vW; varying vec3 vN; varying vec3 vP; varying float vD;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0)); vP = uUrsprungMod + uZuWelt * w.xyz;
        vec4 mv = viewMatrix * w; vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uSonne, uDunst, uNebelFarbe; uniform vec2 uNebel; uniform float uHell, uZeit; uniform mat3 uZuLokal; varying vec3 vW; varying vec3 vN; varying vec3 vP; varying float vD;
      ${RAUSCHEN_GLSL}
      ${WASSER_GLSL}
      void main() {
        vec3 Ng = normalize(vN), V = normalize(cameraPosition - vW); float fp = length(fwidth(vP)), sG = dot(Ng, uSonne), tagSeite = smoothstep(-0.18, 0.08, sG);
        vec3 c = wasserFarbe(Ng, V, vP, fp, 0.15, vec3(0.03, 0.08, 0.09), sG, tagSeite, 1.0);
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
export const ACES_UMKEHR_GLSL = `
  vec3 acesUmkehr(vec3 y) {
    vec3 o = clamp(mat3(vec3(0.643038, 0.059269, 0.005962), vec3(0.311187, 0.931436, 0.063929), vec3(0.045775, 0.009295, 0.930118)) * y, 0.0, 0.98);
    vec3 a = 1.0 - o * 0.983729, b = 0.0245786 - o * 0.4329510, c = -(0.000090537 + o * 0.238081);
    vec3 v = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
    return max(mat3(vec3(1.764741, -0.147028, -0.036337), vec3(-0.675778, 1.160252, -0.162436), vec3(-0.088963, -0.013224, 1.198773)) * v, 0.0);
  }`;

const ERD_FS = `uniform sampler2D tTag, tNacht, tFoto, tFotoAlt, tNachtK, tNormal, tKarte, tMaske, tDetail; uniform vec3 uSonne, uSonneE; uniform vec4 uOrt, uFotoRect, uFotoAltRect, uNachtRect; uniform vec2 uOrtX, uOrtZ;
  uniform vec3 uNebelFarbe, uDunst; uniform vec2 uNebel, uKarteFern; uniform float uHell, uKarteEin, uFotoEin, uFotoDa, uNachtDa, uNormalDa, uMaskeDa, uZeit, uDetail, uDetailDa; uniform mat3 uZuLokal;
  varying vec2 vUv; varying vec2 vUv1; varying vec3 vN; varying float vD; varying vec3 vW; varying vec3 vE; varying vec3 vP; varying float vRand;
  ${RAUSCHEN_GLSL}
  ${WOLKEN_GLSL}
  ${WASSER_GLSL}
  ${ACES_UMKEHR_GLSL}
  float triDetail(vec3 p, float rep, vec3 bw, float fp, vec4 w) {
    float lod = log2(max(fp, 1e-4) * 512.0 / rep);
    vec4 t = textureLod(tDetail, p.yz / rep, lod) * bw.x + textureLod(tDetail, p.xz / rep, lod) * bw.y + textureLod(tDetail, p.xy / rep, lod) * bw.z;
    return dot(t, w);
  }
  void main() {
    if (uOrt.y > 0.5) { vec2 dO = vW.xz - uOrt.zw; if (abs(dot(dO, uOrtX)) < uOrt.x && abs(dot(dO, uOrtZ)) < uOrt.x) discard; }   // im Rahmen des Ortes (liegt der Anker woanders, ist sein Quadrat leicht gedreht)
    vec3 Ng = normalize(vN), V = normalize(cameraPosition - vW);
    vec4 nm = uNormalDa > 0.5 ? texture2D(tNormal, vUv1) : vec4(0.5, 0.5, 0.5, 0.0);
    vec3 Nt = uNormalDa > 0.5 ? normalize(uZuLokal * (nm.xyz * 2.0 - 1.0)) : Ng;
    // Bild: eigenes Foto der Kachel, bis es da ist das eines Vorfahren (gleicher Ausschnitt, nur gröber), ganz am Anfang Blue Marble
    // aus dem All (über rund 2.000 km Abstand) blendet es weich in Blue Marble: nahtlos und ruhig, während das Mosaik aus Sentinel 2 in den Tropen
    // Streifen der UTM Zonen zeigt (Aufnahmen verschiedener Tage)
    vec3 bm = texture2D(tTag, vUv).rgb, tag = bm;
    float fern = uFotoDa > 0.5 ? smoothstep(1.8e6, 6.0e6, vD) : 1.0;
    if (uFotoDa > 0.5) tag = mix(mix(texture2D(tFotoAlt, uFotoAltRect.xy + vUv1 * uFotoAltRect.zw).rgb, texture2D(tFoto, uFotoRect.xy + vUv1 * uFotoRect.zw).rgb, uFotoEin) * 0.82, bm, fern);
    vec3 nacht = uNachtDa > 0.5 ? texture2D(tNachtK, uNachtRect.xy + vUv1 * uNachtRect.zw).rgb : texture2D(tNacht, vUv).rgb;
    // Wasser: Meer aus den Höhen (unter 0 m, Alpha der Normalenkarte), flache Stellen nur, wenn auch das Foto nach Wasser aussieht
    float fotoWasser = smoothstep(0.008, 0.04, tag.b - max(tag.r, tag.g)) * (1.0 - smoothstep(0.18, 0.35, tag.g));
    float dunkel = 1.0 - smoothstep(0.03, 0.09, dot(tag, vec3(0.3, 0.5, 0.2)));
    float meer = max(smoothstep(0.05, 0.09, nm.a), max(fotoWasser, dunkel * 0.9) * step(0.01, nm.a));   // ab rund 10 m Tiefe sicher Meer (Polder liegen nur wenige Meter unter 0), auf 0 m oder flach nach dem Foto
    if (uMaskeDa > 0.5) meer = max(texture2D(tMaske, vUv1).r, smoothstep(0.3, 0.6, nm.a));   // nah: Wasserflächen aus den Vektorkacheln (genaue Küsten, Seen, Flüsse)
    // fern: Meer aus der Farbe von Blue Marble (dort fast schwarz), feiner als die Normalenkarte grober Stufen (sonst Treppen an den Küsten)
    meer = mix(meer, smoothstep(0.015, 0.05, bm.b - max(bm.r, bm.g * 0.85)) * smoothstep(0.3, 0.5, (bm.b - bm.r) / (bm.b + 0.01)), fern);   // Blue Marble mit Bathymetrie: Schelfe hellblau, auch sie sind Meer
    float lichterFern = 1.0;
    // Karte als Überlagerung (Alpha aus dem Worker): Straßen und Ufer scharf über dem Foto, blendet mit dem Abstand aus und beim Laden ein
    vec4 karte = texture2D(tKarte, vUv1);
    float kf = (1.0 - smoothstep(uKarteFern.x, uKarteFern.y, vD)) * uKarteEin, ka = karte.a * kf;
    tag = mix(tag, karte.rgb, ka);
    lichterFern = 1.0 - kf;   // nah leuchten die echten Fenster und Laternen, nicht das Nachtbild
    float sG = dot(Ng, uSonne), sT = dot(Nt, uSonne);
    float tagSeite = smoothstep(-0.18, 0.08, sG);
    float licht = clamp(sT * 1.1, 0.0, 1.0);
    float himmelsLicht = 0.05 + 0.28 * tagSeite * (0.55 + 0.45 * dot(Nt, Ng));   // Licht vom Himmel: Schattenseiten bleiben lesbar
    // Bodendetail aus der Nähe: feines Korn gegen die Unschärfe des Fotos (10 m je Pixel), nur an Land
    float fp = length(fwidth(vP));   // Größe eines Pixels in Metern (außerhalb von Verzweigungen, sonst sind Ableitungen undefiniert)
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
    if (uWolken.z > 0.01 && tagSeite > 0.01) { vec3 dW = normalize(vE + uSonneE * (0.0011 / max(dot(vE, uSonneE), 0.12))); schatten = 1.0 - uWolken.z * wolkenDichte(dW, 5.0) * tagSeite; }
    #endif
    // Boden so hell, wie das Foto aufgenommen ist: erst die Helligkeit auf dem Bildschirm (linear), dann durch die ACES Kurve des OutputPass
    // zurückgerechnet. Sonst versinken dunkle Flächen (Wald, Heide, Moor) im Fuß der Kurve fast in Schwarz (gemessen 29.10.2026 bei Beelitz)
    vec3 boden = tag * (himmelsLicht * vec3(0.92, 0.97, 1.08) + 0.92 * licht * schatten) * 1.3;   // bei üblichem Tageslicht rund so hell wie das Foto
    vec3 c = acesUmkehr(boden) * (0.6 / 0.95) * uHell + nacht * nacht * 1.6 * smoothstep(0.08, -0.12, sG) * lichterFern;
    if (meer > 0.01) {
      float tief = mix(smoothstep(0.55, 1.0, nm.a), 1.0, fern);   // fern überall Tiefsee (die Normalenkarte grober Stufen ist zu grob für Schelfe)
      vec3 wasser = wasserFarbe(Ng, V, vP, fp, tief, tag, sG, tagSeite, schatten);
      c = mix(c, wasser + nacht * nacht * 1.6 * smoothstep(0.08, -0.12, sG) * lichterFern * 0.3, meer);
    }
    // Luftperspektive: Weg durch die untere Luft. Aus dem All in der Mitte der Scheibe kurz (leichter Schleier), am Rand lang (blauer Saum),
    // in der Luft wächst er mit dem Abstand bis zum Horizont. So gibt es zwischen All und Boden keinen Sprung in den Farben.
    c *= 1.0 - 0.4 * vRand;   // Vorhänge an Kachelrändern (nur durch Spalten zu sehen) wie Fels im Schatten
    float weg = min(vD, 20000.0 / max(dot(Ng, V), 0.03));
    float dunst = 1.0 - exp(-weg / 150000.0);
    c = mix(c, uDunst * (0.2 + 0.8 * clamp(sG * 1.2 + 0.1, 0.0, 1.0)), dunst * 0.72);
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
  const geo = new THREE.SphereGeometry(A + 80000, 128, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSonne: { value: new THREE.Vector3(1, 0, 0) }, uStaerke: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSonne; uniform float uStaerke; varying vec3 vN; varying vec3 vW;
      void main() { vec3 V = normalize(cameraPosition - vW); float rand = pow(1.0 - abs(dot(normalize(vN), V)), 3.2);
        float tag = smoothstep(-0.35, 0.35, dot(normalize(vN), uSonne));
        vec3 c = vec3(0.32, 0.55, 1.0) * rand * (0.15 + 0.85 * tag) * uStaerke * 1.6;
        gl_FragColor = vec4(c, 1.0);
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
    return new THREE.ShaderMaterial({ uniforms: u, vertexShader: ERD_VS, fragmentShader: ERD_FS, defines: this.defines });
  }
  kachel(z, x, y, eltern = null) { const key = `${z}/${x}/${y}`; let k = this.kacheln.get(key); if (!k) { k = new Kachel(z, x, y, eltern); this.kacheln.set(key, k); } return k; }
  kinder(k) { if (!k.kinder) k.kinder = [this.kachel(k.z + 1, k.x * 2, k.y * 2, k), this.kachel(k.z + 1, k.x * 2 + 1, k.y * 2, k), this.kachel(k.z + 1, k.x * 2, k.y * 2 + 1, k), this.kachel(k.z + 1, k.x * 2 + 1, k.y * 2 + 1, k)]; return k.kinder; }

  // Höhen laden und Mesh bauen (Schürze: Randpunkte um 3 Prozent der Spanne nach unten)
  async laden(k) {
    if (k.mesh || k.laedt || k.fehler) return;
    if (this.laufend >= this.maxLaufend) return;
    this.laufend++; k.abbruch = new AbortController();
    k.laedt = (async () => {
      try {
        const r = await fetch(TERRARIUM.replace('{z}', k.z).replace('{x}', k.x).replace('{y}', k.y), { signal: k.abbruch.signal });
        if (!r.ok) throw new Error(r.status);
        const bmp = await createImageBitmap(await r.blob());
        this.ctx.drawImage(bmp, 0, 0); bmp.close();
        const d = this.ctx.getImageData(0, 0, 256, 256).data;
        k.mesh = this.baue(k, d); k.mesh.position.copy(k.mitte).sub(this.ursprung); k.mesh.visible = false; this.gruppe.add(k.mesh); this.geladen++;   // sichtbar macht sie erst der Quadtree (vorab geladene Kacheln am Flugziel sonst mitten im Bild)
        if (this.karte && k.z >= this.karteAb) this.karte(k).then(r => {
          if (!r) return; if (!k.mesh) { r.tex.dispose(); r.maske.dispose(); return; }
          const u = k.mesh.material.uniforms; u.tKarte.value = r.tex; u.uKarteEin.value = 0; k.karteTex = r.tex; this.einblenden.add(k);   // weich einblenden statt Ploppen
          u.tMaske.value = r.maske; u.uMaskeDa.value = 1; k.maskeTex = r.maske;
        }).catch(() => {});
      } catch (e) { if (e.name !== 'AbortError') k.fehler = true; }
      finally { this.laufend--; k.laedt = null; k.abbruch = null; }
    })();
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
  baue(k, d) {
    const N = 32, pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2), uv1 = new Float32Array((N + 1) * (N + 1) * 2), idx = [];
    const n = 2 ** k.z, P = new THREE.Vector3();
    const hg = k.hgrid = new Float32Array((N + 1) * (N + 1));   // Höhen vor der Schürze (für hoehe())
    let feld = new Float32Array(65536); for (let i = 0; i < 65536; i++) feld[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    // Terrarium ist in Städten ein Oberflächenmodell (Häuser und Bäume bis 25 m hoch).
    // Bodenfilter mit festem Fenster von 250 m Radius in jeder Stufe ab 9 (wie im Ort und bei den Kisten): sonst entfernt jede Stufe die
    // Stadtbuckel unterschiedlich stark, und an den Grenzen der Stufen entstehen Stufen und Spalten. Fein (r groß) auf 64 x 64 (Minimum je 4 x 4).
    const pxm = k.spanne / 256, r = 250 / pxm;
    let hoehe = (px, py) => feld[Math.min(255, py) * 256 + Math.min(255, px)];
    if (k.z >= 9 && r >= 0.5) {
      if (r > 6) {
        const klein = new Float32Array(64 * 64);
        for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { let m = Infinity; for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) { const v = feld[(j * 4 + b) * 256 + i * 4 + a]; if (v < m) m = v; } klein[j * 64 + i] = m; }
        const offen = bodenGekappt(klein, 64, Math.round(r / 4), pxm * 4);
        hoehe = (px, py) => offen[Math.min(63, py >> 2) * 64 + Math.min(63, px >> 2)];
      } else { const offen = bodenGekappt(feld, 256, Math.max(1, Math.round(r)), pxm); hoehe = (px, py) => offen[Math.min(255, py) * 256 + Math.min(255, px)]; }
    }
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { let h = hoehe(Math.round(i / N * 255), Math.round(j / N * 255)); if (h < 0) h = 0; hg[j * (N + 1) + i] = h; }   // Meer auf 0 (Bathymetrie nicht als Loch)
    // Ränder wie die nächst gröbere Stufe (seit 29.10.2026): ungerade Randpunkte liegen auf der Geraden ihrer Nachbarn. So passen Kacheln
    // gleicher und benachbarter Stufen ohne Stufe aneinander (im Gebirge hingen sonst Vorhänge an den Kachelgrenzen)
    // Gerade Randpunkte aus dem Gitter der Eltern (sie liegen genau auf dessen Punkten): so zeigt jeder Rand die Höhen der gröberen Stufe, und
    // Nachbarn gleicher oder eine Stufe gröberer Kacheln treffen sich auf denselben Werten (rekursiv, über Elterngrenzen hinweg)
    const E = k.eltern?.hgrid;
    if (E) {
      const cx = k.x - k.eltern.x * 2, cy = k.y - k.eltern.y * 2, eh = (i, j) => E[(cy * 16 + j / 2) * (N + 1) + cx * 16 + i / 2];
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
    const senk = THREE.MathUtils.clamp((hMax - hMin) * 0.2 + k.spanne * 0.004, 30, 700);
    k.hMin = hMin; k.hMax = hMax;
    const rand = []; for (let i = 0; i <= N; i++) rand.push(i); for (let j = 1; j <= N; j++) rand.push(j * (N + 1) + N); for (let i = N - 1; i >= 0; i--) rand.push(N * (N + 1) + i); for (let j = N - 1; j >= 1; j--) rand.push(j * (N + 1));
    const nG = (N + 1) * (N + 1), nR = rand.length, P2 = new Float32Array((nG + nR) * 3), N2 = new Float32Array((nG + nR) * 3), U2 = new Float32Array((nG + nR) * 2), U12 = new Float32Array((nG + nR) * 2);
    P2.set(pos); N2.set(nor); U2.set(uv); U12.set(uv1);
    rand.forEach((o, r) => {
      const q = nG + r; P.set(pos[o * 3], pos[o * 3 + 1], pos[o * 3 + 2]).add(k.mitte); P.multiplyScalar((P.length() - senk) / P.length()).sub(k.mitte);
      P2[q * 3] = P.x; P2[q * 3 + 1] = P.y; P2[q * 3 + 2] = P.z; for (let c = 0; c < 3; c++) N2[q * 3 + c] = nor[o * 3 + c];
      U2[q * 2] = uv[o * 2]; U2[q * 2 + 1] = uv[o * 2 + 1]; U12[q * 2] = uv1[o * 2]; U12[q * 2 + 1] = uv1[o * 2 + 1];
    });
    for (let r = 0; r < nR; r++) { const a = rand[r], b = rand[(r + 1) % nR], a2 = nG + r, b2 = nG + (r + 1) % nR; idx.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); }
    const RA = new Float32Array(nG + nR); RA.fill(1, nG);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P2, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N2, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U2, 2)); g.setAttribute('uv1', new THREE.BufferAttribute(U12, 2)); g.setAttribute('aRand', new THREE.BufferAttribute(RA, 1)); g.setIndex(idx);
    const mat = this.neuesMaterial(), u = mat.uniforms;
    u.uMitte.value.copy(k.mitte); u.uMitteMod.value.set(mod(k.mitte.x, PERIODE), mod(k.mitte.y, PERIODE), mod(k.mitte.z, PERIODE));
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
        daten[q + 3] = roh < 0 ? Math.min(255, Math.max(8, -roh / 160 * 255)) : roh < 0.6 ? 4 : 0;   // Meer: 8 = flach, 255 = ab 160 m tief; 4 = um 0 m (feine Stufen haben im Meer oft 0 plus Rauschen statt Tiefe)
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
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) this.vorlade.push(this.pfad(z, t.x + dx, t.y + dy));   // Stufen 11 bis 13 mit 5 x 5 (Blick beim Abstieg)
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
    const horizontCos = R / Math.max(R + 1, kameraWelt.length()), kamN = kameraWelt.clone().normalize();
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
        if (k.mitte.dot(kamN) / k.mitte.length() < horizontCos - 0.25) { versteckeBaum(k); return true; }   // hinter dem Horizont
      }
      k.zuletzt = this.frames;
      // Abstand zum nächsten Punkt der Kachel (nicht zur Mitte): Nachbarn unterscheiden sich so höchstens um eine Stufe, sonst hingen im Gebirge Vorhänge
      const d = Math.max(1, kameraWelt.distanceTo(cW) - sph.radius * 0.95), px = k.spanne / (2 * d * tan) * hoehePx;
      k.wichtig = d / k.spanne;
      if (px > this.pixelGrenze && k.z < this.maxZoom) {
        const kinder = this.kinder(k); let alle = true;
        for (const c of kinder) if (!besuche(c)) alle = false;
        if (alle) { if (k.mesh) k.mesh.visible = false; return true; }
        for (const c of kinder) versteckeBaum(c);   // Rückfall auf diese Kachel, bis die Kinder da sind
      }
      if (k.mesh) { k.mesh.visible = true; sichtbar.add(k); return true; }
      wuensche.push([d, k]); return false;
    };
    for (const w of this.wurzeln) besuche(w);
    wuensche.sort((a, b) => a[0] - b[0]);
    for (const [, k] of wuensche) { if (this.laufend >= this.maxLaufend) break; this.laden(k); }
    // Bilder: sichtbare Kacheln setzen ihre Quelle; fehlende Fotos zuerst für Kacheln, die groß im Bild sind; Nachtlichter nur auf der Nachtseite
    const fotoWunsch = [], nachtWunsch = new Set();
    for (const k of sichtbar) {
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
    // Speicher: lange nicht besuchte Kacheln freigeben (nie die Wurzeln); Nachtbilder nach einer Weile ohne Nutzung
    if (this.geladen > this.budget && this.frames % 30 === 0) {
      const alt = [...this.kacheln.values()].filter(k => k.mesh && k.z > 2 && this.frames - k.zuletzt > 120).sort((a, b) => a.zuletzt - b.zuletzt);
      for (const k of alt.slice(0, this.geladen - this.budget + 20)) this.entladen(k);
    }
    if (this.frames % 120 === 0) for (const k of this.kacheln.values()) if (k.nacht && this.frames - (k.nachtZuletzt || 0) > 1800) { k.nacht.image?.close?.(); k.nacht.dispose(); k.nacht = null; }
    this.sichtbar = sichtbar;
  }
  // Ursprung umsetzen: alle Kacheln bekommen neue Positionen (Punkte bleiben), Kamera bleibt nahe 0
  setzeUrsprung(v) {
    this.ursprung.copy(v);
    for (const k of this.kacheln.values()) if (k.mesh) k.mesh.position.copy(k.mitte).sub(v);
    for (const m of this.kappen || []) m.position.copy(m.userData.welt).sub(v);
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
