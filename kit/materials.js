// Material Rollen des EARTH 3D GAME. Texturen CC0 von Poly Haven (assets/textures/quellen.json),
// alle Geometrien schreiben UV in Metern, die Wiederholung kommt aus der echten Texturgröße.
// Texturen werden auf ihren Mittelwert normiert: die Farbe (tint) ist die echte Durchschnittsfarbe,
// "staerke" bestimmt, wie viel Struktur der Textur durchkommt (0 glatt, 1 voll). So bleibt jede Fläche sauber.
import * as THREE from 'three';

const BASE = new URL('../assets/textures/', import.meta.url);
const loader = new THREE.TextureLoader();
let QUELLEN = null;
const cache = new Map();
let maxAniso = 8;
let ordner = '';   // Handy: Texturen in 512 statt 1024 aus <rolle>/handy/ (ein Viertel der Daten, auf dem kleinen Bildschirm kein Unterschied)

// Gemeinsame Uniform für die Nacht (0 Tag, 1 Nacht): Fensterlicht im Glas
export const NACHT = { value: 0 };

export async function initMaterials(renderer, { handy = false } = {}) {
  ordner = handy ? 'handy/' : '';
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  QUELLEN = await (await fetch(new URL('quellen.json', BASE))).json();
  return QUELLEN;
}

function mittelwert(img) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 16, 16);
  const d = g.getImageData(0, 0, 16, 16).data; let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4, col = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  return new THREE.Vector3(col.r, col.g, col.b);
}

function tex(rolle, map, srgb) {
  const key = rolle + '/' + map;
  if (cache.has(key)) return cache.get(key);
  const eintrag = { avg: { value: new THREE.Vector3(0.6, 0.6, 0.6) } };
  eintrag.t = bildTextur(new URL(`${rolle}/${ordner}${map}.webp`, BASE).href, { fertig: t => { if (srgb) eintrag.avg.value.copy(mittelwert(t.image)); } });
  eintrag.t.wrapS = eintrag.t.wrapT = THREE.RepeatWrapping;
  eintrag.t.anisotropy = maxAniso;
  if (srgb) eintrag.t.colorSpace = THREE.SRGBColorSpace;
  const m = QUELLEN?.[rolle]?.meter || [1, 1];
  eintrag.t.repeat.set(1 / m[0], 1 / m[1]);
  cache.set(key, eintrag);
  return eintrag;
}

export const MAP_NORMIERT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor.rgb = mix( vec3( 1.0 ), sampledDiffuseColor.rgb / max( uMapAvg, vec3( 0.03 ) ), uMapK );
  diffuseColor *= sampledDiffuseColor;
#endif`;

// Verwitterung der Wände (05.11.2026, Nader: "wie GTA 6", vorher wirkten die Fassaden wie frisch gestrichen): Spritzschmutz am Sockel, senkrechte Regenspuren, große Flecken. Ein kleines Bild statt
// Rauschen im Shader (zwei Abrufe je Pixel). UV der Wände ist in Metern (entlang der Wand, Höhe über dem Haus, kit/geo.js), Sockel liegt also bei v = 0.
// Bild kachelbar: R große Flecken, G senkrechte Schlieren, B feines Korn
let _verw = null;
function verwitterungsBild() {
  if (_verw) return _verw;
  const N = 256, d = new Uint8Array(N * N * 4); let s = 4711; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const raster = (nx, ny) => { const g = new Float32Array(nx * ny); for (let i = 0; i < g.length; i++) g[i] = r(); return { g, nx, ny }; };
  const wert = (R, u, v) => { const x = u * R.nx, y = v * R.ny, x0 = Math.floor(x), y0 = Math.floor(y); let fx = x - x0, fy = y - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); const X0 = x0 % R.nx, X1 = (x0 + 1) % R.nx, Y0 = y0 % R.ny, Y1 = (y0 + 1) % R.ny, a = R.g[Y0 * R.nx + X0], b = R.g[Y0 * R.nx + X1], c = R.g[Y1 * R.nx + X0], e = R.g[Y1 * R.nx + X1]; return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy; };
  const fleck = [raster(4, 4), raster(9, 9), raster(21, 21), raster(47, 47)], schliere = [raster(38, 3), raster(90, 5), raster(190, 9), raster(13, 2)], korn = [raster(70, 70), raster(150, 150)];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N;
    const f = wert(fleck[0], u, v) * 0.5 + wert(fleck[1], u, v) * 0.28 + wert(fleck[2], u, v) * 0.15 + wert(fleck[3], u, v) * 0.07;
    const bahn = wert(schliere[3], u, v), sch = (wert(schliere[0], u, v) * 0.45 + wert(schliere[1], u, v) * 0.35 + wert(schliere[2], u, v) * 0.2) * (0.25 + 1.1 * bahn);
    const k = wert(korn[0], u, v) * 0.55 + wert(korn[1], u, v) * 0.45, o = (j * N + i) * 4;
    d[o] = Math.min(255, f * 255); d[o + 1] = Math.min(255, Math.max(0, (sch - 0.28) * 2.1) * 255); d[o + 2] = Math.min(255, k * 255); d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (_verw = t);
}
const VERW = { value: null };
const VERW_VS = `
  vVerw = vec3( uv, abs( normal.y ) < 0.7 ? 1.0 : 0.0 );`;
const VERW_FS = `
  if ( vVerw.z > 0.5 ) {
    vec3 vA = texture2D( tVerw, vVerw.xy * vec2( 0.0417, 0.0277 ) ).rgb, vB = texture2D( tVerw, vVerw.xy * vec2( 0.13, 0.09 ) + 0.37 ).rgb;
    float yy = vVerw.y, sockel = ( 1.0 - smoothstep( 0.05, 0.55 + 1.5 * vA.r, yy ) ) * ( 0.5 + 0.5 * vB.b ), kontakt = 1.0 - smoothstep( 0.0, 0.42, yy );
    float regen = vA.g * ( 0.45 + 0.55 * vB.r ), fleck = smoothstep( 0.42, 0.74, vA.r * 0.7 + vB.r * 0.3 ), korn = vB.b - 0.5;
    diffuseColor.rgb *= ( 1.0 - 0.34 * sockel - 0.28 * kontakt ) * ( 1.0 - 0.3 * regen ) * ( 1.0 - 0.13 * fleck ) * ( 1.0 + 0.09 * korn );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.97, 0.91, 0.82 ), max( sockel, fleck * 0.5 ) );
  }`;
// Wetter am Boden (05.11.2026): nass, Pfützen mit Spiegelung und Ringen von den Tropfen, Schnee bleibt auf waagrechten Flächen liegen. Gemeinsame Werte für alle Texturmaterialien, gesetzt vom Live Wetter
export const BODEN_U = { uNassB: { value: 0 }, uSchneeB: { value: 0 }, uRegenB: { value: 0 }, uZeitB: { value: 0 }, tVerw: VERW };
export const BODEN_KOPF = 'uniform float uNassB, uSchneeB, uRegenB, uZeitB;\n';
export const bodenFS = (xz, cond) => `
  float pfuetze = 0.0; vec2 bXZ = ${xz};
  if ( ${cond} ) {
    float bn = texture2D( tVerw, bXZ * 0.019 ).r * 0.6 + texture2D( tVerw, bXZ * 0.071 + 0.31 ).r * 0.4;
    if ( uNassB > 0.01 ) { diffuseColor.rgb *= 1.0 - 0.36 * uNassB; pfuetze = smoothstep( 0.6 - 0.1 * uNassB, 0.66 - 0.06 * uNassB, bn ) * uNassB; diffuseColor.rgb *= 1.0 - 0.32 * pfuetze; }
    if ( uSchneeB > 0.01 ) { float sn = smoothstep( 0.0, 0.5, uSchneeB * 1.25 - 0.25 + ( bn - 0.5 ) * 0.9 ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.89, 0.93 ), sn ); pfuetze *= 1.0 - sn; }
  }`;
export const BODEN_RAUH = `#include <roughnessmap_fragment>
  roughnessFactor = mix( roughnessFactor * ( 1.0 - 0.42 * uNassB ), 0.05, pfuetze );`;
export const BODEN_NORMALE = `#include <normal_fragment_maps>
  if ( pfuetze > 0.02 ) {
    normal = normalize( mix( normal, normalize( vNormal ), pfuetze ) );
    if ( uRegenB > 0.01 && pfuetze > 0.2 ) { vec2 q = bXZ * 1.3, id = floor( q ), f = fract( q ) - 0.5; float h = fract( sin( dot( id, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ), t = fract( uZeitB * 0.9 + h ); vec2 dr = f - ( vec2( fract( h * 7.1 ), fract( h * 13.7 ) ) - 0.5 ) * 0.6; float d = length( dr ), ring = sin( ( d - t * 0.7 ) * 55.0 ) * smoothstep( 0.06, 0.0, abs( d - t * 0.7 ) ) * ( 1.0 - t ); normal = normalize( normal + ( viewMatrix * vec4( dr.x, 0.0, dr.y, 0.0 ) ).xyz / max( d, 0.01 ) * ring * 0.35 * uRegenB * pfuetze ); }
  }`;
// Normierung je Material (clone() übernimmt onBeforeCompile nicht: kit/ortfoto.js holt sie sich von hier)
export const TEX_INFO = new WeakMap();
// Texturiertes Material in einer Rolle
export function texMat(rolle, { tint = 0xffffff, rough = 1, normal = 1, metal = 0, staerke = 0.6 } = {}) {
  const d = tex(rolle, 'diff', true);
  const m = new THREE.MeshStandardMaterial({
    map: d.t, normalMap: tex(rolle, 'nor', false).t, roughnessMap: tex(rolle, 'rough', false).t,
    normalScale: new THREE.Vector2(normal, normal), color: tint, roughness: rough, metalness: metal,
  });
  const k = { value: staerke };
  TEX_INFO.set(m, { avg: d.avg, k });
  m.onBeforeCompile = sh => {
    VERW.value ||= verwitterungsBild();
    sh.uniforms.uMapAvg = d.avg; sh.uniforms.uMapK = k; sh.uniforms.tVerw = VERW; Object.assign(sh.uniforms, BODEN_U);
    sh.vertexShader = 'varying vec3 vVerw;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>' + VERW_VS);
    sh.fragmentShader = 'uniform vec3 uMapAvg;\nuniform float uMapK;\nuniform sampler2D tVerw;\nvarying vec3 vVerw;\n' + BODEN_KOPF + sh.fragmentShader.replace('#include <map_fragment>', MAP_NORMIERT + VERW_FS + bodenFS('vVerw.xy', 'vVerw.z < 0.5')).replace('#include <roughnessmap_fragment>', BODEN_RAUH).replace('#include <normal_fragment_maps>', BODEN_NORMALE);
  };
  m.customProgramCacheKey = () => 'texnorm3';
  m.userData.staerke = k;
  return m;
}

// Glas (seit 04.11.2026): hinter jedem Fenster liegt ein Raum (Interior Mapping: der Blickstrahl trifft Rückwand, Boden, Decke oder Seitenwand eines Rasters
// aus Räumen, nur in diesem Shader, keine Geometrie), davor spiegelt das Glas den Himmel und die gegenüberliegende Stadt (Fresnel). Nachts sind zufällige Räume
// warm erleuchtet, einige mit Vorhang oder blauem Fernseher. innen: wie viel vom Raum durchscheint (dunkles Bürohausglas wenig)
import { HIMMEL_GLSL, HIMMEL_U } from './atmos.js';
import { atlasTextur } from './schilder.js';
import { bildTextur } from './bildlader.js';
export function glasMat({ color = 0x2c3a44, rough = 0.06, metal = 0.2, env = 1.4, raster = [1.55, 3.4], licht = 0.3, variation = 0.45, innen = 1 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: Math.min(env, 0.5) });
  const Ra = { value: new THREE.Vector2(...raster) }, L = { value: licht }, V = { value: variation }, I = { value: innen };
  m.onBeforeCompile = sh => {
    sh.uniforms.uNacht = NACHT; sh.uniforms.uRaster = Ra; sh.uniforms.uLicht = L; sh.uniforms.uVar = V; sh.uniforms.uInnen = I; sh.uniforms.tHimmel = HIMMEL_U.tHimmel; sh.uniforms.uSonneH = HIMMEL_U.uSonneH;
    sh.vertexShader = 'varying vec2 vGUv;\nvarying vec3 vGW;\nvarying vec3 vGN;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vGUv = uv;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  { vec4 gw = vec4( transformed, 1.0 ); vec3 gn = objectNormal;
    #ifdef USE_INSTANCING
      gw = instanceMatrix * gw; gn = mat3( instanceMatrix ) * gn;
    #endif
    gw = modelMatrix * gw; vGW = gw.xyz; vGN = normalize( mat3( modelMatrix ) * gn ); }`);
    sh.fragmentShader = `varying vec2 vGUv; varying vec3 vGW; varying vec3 vGN; ${HIMMEL_GLSL}
uniform float uNacht, uLicht, uVar, uInnen; uniform vec2 uRaster;
float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 gZelle = floor( vGUv / uRaster ); float gR = gHash( gZelle ); vec2 gIn = fract( vGUv / uRaster );
  diffuseColor.rgb *= 0.25;   // das Glas selbst streut wenig, Raum und Spiegelung kommen unten dazu`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp( roughnessFactor + ( gR - 0.5 ) * 0.05, 0.02, 1.0 );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec3 gD = normalize( vGW - cameraPosition ), gNw = normalize( vGN );
    vec3 gT = normalize( abs( gNw.y ) > 0.9 ? vec3( 1.0, 0.0, 0.0 ) : cross( vec3( 0.0, 1.0, 0.0 ), gNw ) );
    // Raster aus Räumen: 4,2 m breit, 3,2 m hoch, 5 m tief
    vec3 gO = vec3( dot( vGW, gT ) / 4.2, vGW.y / 3.2, 0.0 ), gRd = vec3( dot( gD, gT ) / 4.2, gD.y / 3.2, max( dot( gD, -gNw ), 0.02 ) / 5.0 );
    vec2 gC = floor( gO.xy + 1e-3 ), gFc = fract( gO.xy ), gSign = sign( gRd.xy + 1e-5 );
    vec2 gTs = ( ( gC + step( 0.0, gSign ) ) - gO.xy ) / ( gRd.xy + gSign * 1e-5 ); float gTz = 1.0 / gRd.z, gTm = min( gTz, min( gTs.x, gTs.y ) );
    vec3 gH = gO + gRd * gTm; float gSeed = gHash( gC + floor( dot( vGW, gNw ) * 0.13 ) * 3.7 ), gSeed2 = gHash( gC * 1.7 + 11.3 );
    float gAn = step( 1.0 - uLicht, gSeed ) * uNacht;
    vec3 gWand = mix( vec3( 0.42, 0.40, 0.37 ), vec3( 0.62, 0.55, 0.46 ), gSeed2 ), gRaum;
    if ( gTm == gTz ) { vec2 q = fract( gH.xy ); gRaum = gWand * ( 0.8 + 0.25 * smoothstep( 0.0, 1.0, q.y ) ); if ( gSeed2 > 0.55 ) gRaum *= mix( 1.0, 0.45, step( 0.3, q.x ) * step( q.x, 0.72 ) * step( q.y, 0.42 ) ); }   // Rückwand, manchmal ein Möbel
    else if ( gTm == gTs.y ) { gRaum = gSign.y < 0.0 ? mix( vec3( 0.26, 0.19, 0.13 ), vec3( 0.2, 0.2, 0.22 ), gSeed ) : vec3( 0.72, 0.7, 0.66 ); }   // Boden oder Decke
    else gRaum = gWand * 0.72;   // Seitenwand
    vec3 gLichtFarbe = gSeed2 > 0.86 ? vec3( 0.55, 0.68, 1.0 ) : gSeed2 > 0.45 ? vec3( 1.0, 0.78, 0.52 ) : vec3( 1.0, 0.68, 0.40 );
    float gTief = clamp( gH.z, 0.0, 1.0 );
    vec3 gInnen = gRaum * ( ( 0.055 + 0.03 * gSeed2 ) * ( 1.0 - uNacht * 0.75 ) * ( 0.5 + 0.5 * gIn.y ) + gAn * gLichtFarbe * ( 1.5 - 0.5 * gTief ) );
    if ( gSeed2 < 0.25 ) gInnen = mix( gInnen, vec3( 0.34, 0.30, 0.24 ) * ( 0.1 + gAn * 0.6 ) , step( 0.55 + 0.3 * gSeed, gIn.y ) );   // Rollo oder Vorhang im oberen Teil
    // Spiegelung: Himmel, darunter die Stadt gegenüber als dunkle Silhouette mit hellen Fenstern
    vec3 gVs = normalize( vViewPosition ); float gF = 0.1 + 0.9 * pow( 1.0 - max( dot( normal, gVs ), 0.0 ), 4.0 );
    vec3 gR2 = reflect( gD, gNw ); float gAz = atan( gR2.x, gR2.z ) * 7.0, gSk = 0.1 + 0.33 * fract( sin( floor( gAz ) * 91.7 ) * 4375.5 );
    vec3 gHim = himmelLUT( normalize( vec3( gR2.x, max( gR2.y, 0.03 ), gR2.z ) ) );
    vec3 gStadt = mix( himmelLUT( vec3( gR2.x, 0.06, gR2.z ) ) * 0.42, vec3( 0.0 ), 0.2 ) + vec3( 1.0, 0.7, 0.42 ) * uNacht * 0.12 * step( 0.6, fract( gR2.y * 26.0 ) * fract( gAz * 3.0 ) );
    vec3 gSp = mix( gStadt, gHim, smoothstep( gSk - 0.02, gSk + 0.02, gR2.y ) );
    totalEmissiveRadiance += gInnen * uInnen * ( 1.0 - gF ) + gSp * gF * 1.05;
  }`);
  };
  m.customProgramCacheKey = () => 'glasfenster2';
  return m;
}

// Farbrollen (Stilentwurf v0.2 nach Naders Vorlage: weiße Raster, schwarzes Glas, Kupfer, helle Steinbauten)
export const PALETTE = {
  creme: 0xcdbd9f, sand: 0xb9a27c, hellgrau: 0xb5b3ae, weiss: 0xe2e0db, rahmen: 0xf0ede6, rahmenDunkel: 0x2e3033,
  kupfer: 0xc4703e, markise: 0xa63a2e, gruen: 0x5f7046,
};

// Neue Materialien (05.11.2026): erst bei der ersten Nutzung angelegt, ihre Texturen laden also nur, wenn ein Haus dieser Art wirklich vorkommt
function fauleMaterialien() {
  const T = (rolle, tint, n = 0.7, k = 0.8) => () => texMat(rolle, { tint, normal: n, staerke: k });
  const G = (o) => () => glasMat(o), F = (color, roughness = 0.7, metalness = 0, extra = {}) => () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const d = {
    ziegelRot: T('ziegel_rot', 0x8f4f3c, 0.9, 0.9), ziegelHell: T('ziegel_hell', 0xa8927c, 0.8, 0.85), ziegelAlt: T('ziegel_alt', 0x7a5140, 0.9, 0.9),
    putzBeige: T('putz_beige', 0xc9b99c, 0.4, 0.4), putzGemalt: T('putz_gemalt', 0xbdb6a6, 0.5, 0.5), putzRau: T('putz_rau', 0xb9b3a6, 0.6, 0.6), stuckWeiss: T('stuck_weiss', 0xdcd9d0, 0.5, 0.45),
    betonWand: T('beton_wand', 0x98958f, 0.6, 0.6), betonPlatte: T('beton_platte', 0xa3a09a, 0.6, 0.7), steinBlock: T('stein_block', 0xa39a89, 0.8, 0.8), kalkA: T('stein_block', 0xd9c9a8, 0.7, 0.55), kalkB: T('stein_block', 0xcdbd9f, 0.7, 0.55), kalkC: T('stein_gelb', 0xcfc0a2, 0.7, 0.5), zink: F(0x6d7479, 0.52, 0.55), eisen: () => eisenMaterial(), steinGelb: T('stein_gelb', 0xb9a57f, 0.8, 0.8), holzWand: T('holz_wand', 0x7d6048, 0.8, 0.8),
    wellblech: T('wellblech', 0x8d9092, 1.0, 0.6), wellblechBlau: T('wellblech', 0x486a8a, 1.0, 0.5), wellblechRot: T('wellblech', 0x8a3f33, 1.0, 0.5), wellblechWeiss: T('wellblech', 0xc2c3bf, 1.0, 0.5),
    dachZiegel: T('dach_ziegel', 0x8e4d38, 0.9, 0.9), dachKeramik: T('dach_keramik', 0x9c5a3e, 0.9, 0.9), dachSchiefer: T('dach_schiefer', 0x3f4247, 0.9, 0.9), dachGrau: T('dach_grau', 0x5a5b5c, 0.8, 0.8), dachReet: T('dach_reet', 0x8a7650, 1.0, 0.9),
    glasBlau: G({ color: 0x16304d, rough: 0.04, env: 2.6, licht: 0.28, variation: 0.3, innen: 0.5, raster: [1.5, 3.9] }), glasGruen: G({ color: 0x173e3c, rough: 0.04, env: 2.6, licht: 0.28, variation: 0.3, innen: 0.5, raster: [1.5, 3.9] }), glasSilber: G({ color: 0x5b6670, rough: 0.05, env: 3, licht: 0.28, variation: 0.25, innen: 0.45, raster: [1.5, 3.9] }),
    glasBunt: F(0x4a5a78, 0.25, 0.2, { emissive: 0x1a2030, emissiveIntensity: 0.5 }), kupferGruen: F(0x5d8a78, 0.6, 0.4), uhr: F(0xe8e4d8, 0.5), tor: F(0x9a9c9e, 0.55, 0.5), gelb: F(0xd8a92c, 0.5), tankBlau: F(0x2a5f9e, 0.5), farbRot: F(0xb0322a, 0.5), farbBlau: F(0x2a56a0, 0.5), farbGruen: F(0x2f7d4f, 0.5),
  };
  d.ladenschild = () => leuchtMat({ map: atlasTextur(), staerke: 1.25 });
  const streifen = (a, b) => { const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 8, 0, 8, 4); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.4, 1); return () => new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide }); };
  d.markise1 = streifen('#1f4a3a', '#efe6d6'); d.markise2 = streifen('#1d3557', '#efe6d6'); d.markise3 = () => new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.8, side: THREE.DoubleSide }); d.markise4 = streifen('#d9a92c', '#f4efe4');
  ['#d9c9a8', '#d8b889', '#d39a78', '#c4cdb0', '#a9bccb', '#c2bfb8', '#b9765a', '#e4e0d4', '#e0c878', '#c98f8a', '#9dbfae', '#b78f6a'].forEach((c, i) => { d['fa' + i] = T('putz_rau', new THREE.Color(c).getHex(), 0.55, 0.55); });
  return d;
}

// Geschmiedetes Geländer als Textur mit Ausschnitt: Stäbe, Bögen, Ranken. Ein Stück breit 0,9 m, Höhe wie das Gitter (Wunsch Nr. 70: Paris)
function eisenMaterial() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256); g.strokeStyle = '#14161a'; g.fillStyle = '#14161a'; g.lineCap = 'round';
  g.lineWidth = 9; g.beginPath(); g.moveTo(0, 12); g.lineTo(256, 12); g.moveTo(0, 244); g.lineTo(256, 244); g.moveTo(0, 196); g.lineTo(256, 196); g.moveTo(0, 60); g.lineTo(256, 60); g.stroke();
  g.lineWidth = 6; for (const x of [4, 128, 252]) { g.beginPath(); g.moveTo(x, 12); g.lineTo(x, 244); g.stroke(); }
  g.lineWidth = 5; for (const x0 of [0, 128]) { const m = x0 + 64; g.beginPath(); g.moveTo(m, 60); g.bezierCurveTo(m - 46, 74, m - 56, 124, m - 28, 128); g.bezierCurveTo(m - 8, 130, m - 8, 108, m - 24, 108); g.stroke(); g.beginPath(); g.moveTo(m, 60); g.bezierCurveTo(m + 46, 74, m + 56, 124, m + 28, 128); g.bezierCurveTo(m + 8, 130, m + 8, 108, m + 24, 108); g.stroke(); g.beginPath(); g.moveTo(m, 196); g.bezierCurveTo(m - 44, 184, m - 54, 146, m - 28, 142); g.stroke(); g.beginPath(); g.moveTo(m, 196); g.bezierCurveTo(m + 44, 184, m + 54, 146, m + 28, 142); g.stroke(); g.beginPath(); g.moveTo(m, 60); g.lineTo(m, 196); g.stroke(); g.beginPath(); g.arc(m, 128, 11, 0, 7); g.stroke(); for (const b of [x0 + 20, x0 + 108]) { g.beginPath(); g.moveTo(b, 196); g.lineTo(b, 244); g.stroke(); g.beginPath(); g.moveTo(b, 12); g.lineTo(b, 60); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, alphaTest: 0.4, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
}
export function makeMaterials() {
  const glas = glasMat({ color: 0x334049, rough: 0.05, metal: 0.25, env: 2.2 });   // Wohnhäuser und Läden
  const grund = {
    putz: texMat('putz_hell', { tint: PALETTE.creme, normal: 0.35, staerke: 0.22 }),
    putzSand: texMat('putz_hell', { tint: PALETTE.sand, normal: 0.35, staerke: 0.22 }),
    putzGrau: texMat('putz_hell', { tint: PALETTE.hellgrau, normal: 0.35, staerke: 0.22 }),
    sandstein: texMat('sandstein', { tint: 0xb2a284, normal: 0.7, staerke: 0.55 }),
    beton: texMat('beton_glatt', { tint: PALETTE.weiss, normal: 0.25, staerke: 0.18, rough: 0.9 }),
    platten: texMat('fassade_platten', { tint: 0xc4c2bd, normal: 0.6, staerke: 0.4 }),
    ziegel: texMat('ziegel', { tint: 0x8d5a44, normal: 0.9, staerke: 0.75 }),
    asphalt: Object.assign(texMat('asphalt', { tint: 0x5c5a57, normal: 0.8, staerke: 0.55 }), { envMapIntensity: 0.55 }),   // trocken spiegelt er den Himmel wenig (sonst flach gesehen fast weiß)
    gehweg: texMat('gehweg_platten', { tint: 0x8f8a83, normal: 0.7, staerke: 0.6 }),
    granit: texMat('granit', { tint: 0x8c8984, normal: 0.6, staerke: 0.5 }),
    dach: texMat('dach_kies', { tint: 0x7e7b76, normal: 0.6, staerke: 0.6 }),
    kopfstein: texMat('kopfstein', { tint: 0x8f877d, normal: 0.9, staerke: 0.7 }),
    rahmen: new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.5 }),
    rahmenDunkel: new THREE.MeshStandardMaterial({ color: PALETTE.rahmenDunkel, roughness: 0.35, metalness: 0.7 }),
    stein: new THREE.MeshStandardMaterial({ color: 0xbdb4a4, roughness: 0.78 }),
    weiss: new THREE.MeshStandardMaterial({ color: PALETTE.weiss, roughness: 0.62 }),
    schiefer: new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.5 }),
    glas,
    glasLicht: glas,
    glasDunkel: glasMat({ color: 0x0d1015, rough: 0.035, metal: 0.6, env: 3.2, licht: 0.2, variation: 0.3, innen: 0.45 }),
    glasHell: glasMat({ color: 0x5d6d77, rough: 0.05, metal: 0.3, env: 1.4, raster: [1.25, 3.6], innen: 0.8 }),
    metall: new THREE.MeshStandardMaterial({ color: 0xb2b0ab, roughness: 0.4, metalness: 0.8 }),
    kupfer: new THREE.MeshStandardMaterial({ color: PALETTE.kupfer, roughness: 0.55, metalness: 0.35 }),
    technik: new THREE.MeshStandardMaterial({ color: 0xaeaba5, roughness: 0.6, metalness: 0.3 }),
    technikDunkel: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.5, metalness: 0.5 }),
    holz: new THREE.MeshStandardMaterial({ color: 0x8f6444, roughness: 0.6 }),
    pflanze: new THREE.MeshStandardMaterial({ color: PALETTE.gruen, roughness: 0.9 }),
    erdeTopf: new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9 }),
    markise: new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.8, side: THREE.DoubleSide }),
    glasGelaender: new THREE.MeshStandardMaterial({ color: 0xbfd0d3, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    markierung: new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    markierungGelb: new THREE.MeshStandardMaterial({ color: 0xd9a933, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    gleis: new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.4, metalness: 0.8 }),
    schotter: texMat('dach_kies', { tint: 0x6e6a64, normal: 0.8, staerke: 0.8 }),
    ...stilMaterialien(),   // Baustile der Welt (kit/stile.js), nur Ergänzungen
  };
  const faul = fauleMaterialien();
  return new Proxy(grund, { get(t, k) { if (k in t) return t[k]; const f = faul[k]; if (!f) return undefined; const m = f(); m.userData.wand = !/^(glasBunt|uhr|gelb|tankBlau|farb)/.test(String(k)); return (t[k] = m); } });
}

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#efe6d6' : '#a63a2e'; g.fillRect(i * 8, 0, 8, 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 2.4, 1);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Baustile der Welt (kit/stile.js): regionale Material Rollen. Nur Ergänzungen, bestehende Rollen bleiben.
// Helle Baustoffe bleiben unter Albedo rund 0,55 (linear), Kalkweiß bei rund 0,72, sonst brennen sie in der Sonne aus.
// Holzschalung, Fliesen, Zellige und Schilder kommen als kleine Canvas Texturen mit Normalen aus einer Höhenfunktion.
function stilMaterialien() {
  const putz = (tint, normal = 0.35, staerke = 0.24) => texMat('putz_hell', { tint, normal, staerke });
  const stein = (tint, normal = 0.75, staerke = 0.5) => texMat('sandstein', { tint, normal, staerke });
  const S = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const siding = brettTexturen(false), bretter = brettTexturen(true), kachel = kachelTexturen(), zel = zelligeTexturen();
  const holzWand = (t, color) => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(1, 1), color, roughness: 0.78 });
  const fliese = color => new THREE.MeshStandardMaterial({ map: kachel.map, normalMap: kachel.normal, color, roughness: 0.45 });
  return {
    // Putze
    putzOcker: putz(0xb8884f), putzTerrakotta: putz(0xa9654a), putzRosa: putz(0xc08a70), putzGolf: putz(0xa68f69),
    kalk: putz(0xcac7be, 0.5, 0.3), lehm: putz(0x8a5e3d, 0.9, 0.55), putzIndigo: putz(0x6a88b2),
    putzKoralle: putz(0xc06a52), putzMais: putz(0xcca04a), putzTuerkis: putz(0x4b918b), putzKobalt: putz(0x4a6ca0),
    putzFlieder: putz(0x9883ab), putzLimette: putz(0x8fa45e), putzPink: putz(0xcf8a80),
    // Steine
    brownstone: stein(0x6a4535, 0.8, 0.5), sandsteinRot: stein(0xa86449), sandsteinGelb: stein(0xbf975c),
    sichtbeton: texMat('beton_glatt', { tint: 0x8f8d88, normal: 0.35, staerke: 0.3 }),
    bodenTerrakotta: texMat('gehweg_platten', { tint: 0xa0614a, normal: 0.6, staerke: 0.5 }),
    // Holz und Schalungen
    brettRot: holzWand(bretter, 0x7a2b22), brettOcker: holzWand(bretter, 0xc08d3c), brettWeiss: holzWand(bretter, 0xd6d3c9),
    brettBlau: holzWand(bretter, 0x5d7889), brettGruen: holzWand(bretter, 0x6a7d59), brettGrau: holzWand(bretter, 0x8b8d86), brettSchwarz: holzWand(bretter, 0x332e2a),
    sidingWeiss: holzWand(siding, 0xd6d3ca), sidingBlau: holzWand(siding, 0x7f95a9), sidingGelb: holzWand(siding, 0xc9b176),
    sidingGruen: holzWand(siding, 0x899879), sidingGrau: holzWand(siding, 0x979893), sidingRot: holzWand(siding, 0x8a3a30),
    holzDunkel: S(0x4a3426, 0.86), holzHell: S(0xa58460, 0.75), holzRot: S(0x5c2a1f, 0.78),
    lack: S(0xe2dfd8, 0.45),
    // Dächer
    schindel: S(0x4a4a48, 0.92), ziegelDach: S(0x9e5238, 0.72), ziegelGruen: S(0x2c6a49, 0.4, 0.05),
    kawara: S(0x3b3f44, 0.55, 0.12), dachSchwarz: S(0x2a2c2e, 0.72, 0.05, { envMapIntensity: 0.6 }), kuppelBlau: S(0x2a5c9a, 0.5),
    // Türen, Läden, Akzente
    blauTuer: S(0x22609c, 0.45), gruenTuer: S(0x2f5d4c, 0.5), ladenGruen: S(0x34503a, 0.5), ladenSchwarz: S(0x262a2c, 0.45),
    gold: S(0xc29638, 0.35, 0.85), bluete: S(0xa82a72, 0.85), tankSchwarz: S(0x232425, 0.55),
    wasser: S(0x335f6a, 0.05, 0.4, { envMapIntensity: 1.5 }),
    noren: S(0x2b3d64, 0.9, 0, { side: THREE.DoubleSide }),
    papier: leuchtMat({ color: 0xe0d9c4, emissive: 0xffc98a, staerke: 0.9 }),
    // Innenräume (kit/interior.js, seit 28.10.2026 nachts): Wände, Decken, Böden, Treppen, Möbel, Leuchten
    wandInnen: putz(0xcfcac1, 0.2, 0.12), decke: S(0xd9d6cf, 0.92),   // nie über Albedo 0,55, sonst brennen Innenwände im Licht aus parkett: holzWand(bretter, 0xa88a62), teppich: S(0x6a6e73, 0.96),
    estrich: texMat('beton_glatt', { tint: 0x9c9a95, normal: 0.3, staerke: 0.25 }), stufe: S(0x9c968c, 0.7), gelaender: S(0x3a3c40, 0.4, 0.6),
    tuerHolz: S(0xb59a73, 0.55), moebelHolz: S(0x8c6a4b, 0.65), moebelWeiss: S(0xe6e4de, 0.5), stoff: S(0x4e5f78, 0.92), stoffWarm: S(0x9a6b55, 0.92),
    leuchte: leuchtMat({ color: 0xf2efe6, emissive: 0xfff0cf, staerke: 2.4 }), schirm: S(0x24262a, 0.6, 0.2),
    // Fliesen und Mosaik
    zellige: new THREE.MeshStandardMaterial({ map: zel.map, normalMap: zel.normal, roughness: 0.22, metalness: 0.05 }),
    kachelBeige: fliese(0xb5a386), kachelWeiss: fliese(0xd3d0c8), kachelBraun: fliese(0x8a6b55),
    // Leuchtschilder (Japan, Indien): Schrift ohne echte Zeichen, leuchten nachts
    schildRot: leuchtMat({ map: schildTextur('#b8322b', '#f4efe4', 3) }), schildGelb: leuchtMat({ map: schildTextur('#d9a92c', '#2a2420', 5) }),
    schildBlau: leuchtMat({ map: schildTextur('#2a56a0', '#f4efe4', 9) }), schildWeiss: leuchtMat({ map: schildTextur('#e8e4da', '#b8322b', 13) }),
    schildGruen: leuchtMat({ map: schildTextur('#2f7d4f', '#f4efe4', 17) }),
  };
}

// Material, das nachts leuchtet (Uniform NACHT): Schilder mit Textur oder Papier mit warmem Licht
function leuchtMat({ map = null, color = 0xffffff, emissive = 0xffffff, staerke = 1.3 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, color, emissive, emissiveMap: map, emissiveIntensity: staerke, roughness: 0.45 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNacht = NACHT;
    sh.fragmentShader = 'uniform float uNacht;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= uNacht;');
  };
  m.customProgramCacheKey = () => 'leucht';
  return m;
}

function stilRng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function canvasTextur(w, h, zeichne, meter, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  zeichne(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  if (meter) t.repeat.set(1 / meter[0], 1 / meter[1]);
  return t;
}

// Farbe und Normalen aus Pixelfunktionen: farbe(x, y) liefert [r, g, b] in 0..1, hoehe(x, y) in 0..1
function pixelTexturen(w, h, farbe, hoehe, k, meter) {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = hoehe(x, y);
  const map = canvasTextur(w, h, (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = farbe(x, y), i = (y * w + x) * 4;
      img.data[i] = Math.min(255, c[0] * 255); img.data[i + 1] = Math.min(255, c[1] * 255); img.data[i + 2] = Math.min(255, c[2] * 255); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, meter);
  const normal = canvasTextur(w, h, (g) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = H[y * w + (x + 1) % w] - H[y * w + (x - 1 + w) % w], dy = H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x];
      let nx = -dx * k, ny = dy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, meter, false);
  return { map, normal };
}

// Holzschalung: waagrecht (Stülpschalung, Bretter 0,2 m) oder senkrecht (Deckleistenschalung, 0,25 m)
function brettTexturen(senkrecht) {
  const N = 128, px = N * (senkrecht ? 0.25 : 0.2), R = stilRng(senkrecht ? 11 : 7);
  const ton = Array.from({ length: 8 }, () => 0.9 + (R() - 0.5) * 0.08), mas = Array.from({ length: N }, () => (R() - 0.5) * 0.05);
  const quer = (x, y) => senkrecht ? x : y, laengs = (x, y) => senkrecht ? y : x;
  const farbe = (x, y) => {
    const a = quer(x, y), k = Math.floor(a / px) % 8, f = (a % px) / px;
    let c = ton[k] + mas[laengs(x, y) % N] * 0.4 + mas[(laengs(x, y) * 7 + k * 13) % N] * 0.3;
    if (senkrecht) { if (f < 0.18) c += 0.05; else if (f < 0.24) c *= 0.72; }
    else if (f > 0.9) c *= 0.62;
    return [c, c, c];
  };
  const hoehe = (x, y) => { const f = (quer(x, y) % px) / px; return senkrecht ? (f < 0.18 ? 1 : 0) : f; };
  return pixelTexturen(N, N, farbe, hoehe, senkrecht ? 1.6 : 2.4, [1, 1]);
}

// Kleine Fassadenfliesen (Japan, China): 95 × 45 mm im Halbverband
function kachelTexturen() {
  const W = 256, H = 256, bw = W / 5, bh = H / 10, R = stilRng(23), ton = Array.from({ length: 64 }, () => 0.93 + (R() - 0.5) * 0.1);
  const zelle = (x, y) => { const r = Math.floor(y / bh), xx = (x + (r % 2) * bw / 2) % W; return [Math.floor(xx / bw), r, xx % bw, y % bh]; };
  const fuge = (x, y) => { const [, , fx, fy] = zelle(x, y); return fx < 2 || fy < 2; };
  const farbe = (x, y) => { if (fuge(x, y)) return [0.78, 0.76, 0.72]; const [c, r] = zelle(x, y), t = ton[(c * 7 + r * 3) % 64]; return [t, t, t]; };
  return pixelTexturen(W, H, farbe, (x, y) => fuge(x, y) ? 0 : 1, 0.9, [0.475, 0.45]);
}

// Zellige: Mosaik aus kleinen glasierten Fliesen in Rauten Ringen (Grün, Weiß, Blau, Ocker, Schwarz)
function zelligeTexturen() {
  const N = 256, t = 32;
  const ring = [[0.75, 0.53, 0.23], [0.89, 0.86, 0.8], [0.18, 0.42, 0.31], [0.89, 0.86, 0.8], [0.15, 0.29, 0.49], [0.89, 0.86, 0.8], [0.18, 0.42, 0.31], [0.12, 0.13, 0.14]];
  const fuge = (x, y) => x % t < 2 || y % t < 2;
  const farbe = (x, y) => {
    if (fuge(x, y)) return [0.8, 0.77, 0.7];
    const i = Math.floor(x / t), j = Math.floor(y / t), d = Math.floor(Math.abs(i - 3.5) + Math.abs(j - 3.5));
    return ring[d % 8];
  };
  return pixelTexturen(N, N, farbe, (x, y) => fuge(x, y) ? 0 : 1, 1.2, [0.6, 0.6]);
}

// Leuchtschild: Hintergrund, Rand, gestapelte Zeichen aus Balken (keine echte Schrift)
function schildTextur(grund, zeichen, seed) {
  const R = stilRng(seed);
  return canvasTextur(64, 256, (g, w, h) => {
    g.fillStyle = grund; g.fillRect(0, 0, w, h);
    g.strokeStyle = zeichen; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = zeichen;
    for (let k = 0; k < 4; k++) {
      const y0 = 16 + k * 58, x0 = 12, s = 40;
      const n = 3 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        if (R() < 0.5) g.fillRect(x0 + R() * s * 0.3, y0 + R() * s, s * (0.5 + R() * 0.5), 5);
        else g.fillRect(x0 + R() * s, y0 + R() * s * 0.3, 5, s * (0.5 + R() * 0.5));
      }
    }
  }, null);
}
