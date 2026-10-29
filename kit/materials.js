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
  eintrag.t = loader.load(new URL(`${rolle}/${ordner}${map}.webp`, BASE).href, t => { if (srgb) eintrag.avg.value.copy(mittelwert(t.image)); });
  eintrag.t.wrapS = eintrag.t.wrapT = THREE.RepeatWrapping;
  eintrag.t.anisotropy = maxAniso;
  if (srgb) eintrag.t.colorSpace = THREE.SRGBColorSpace;
  const m = QUELLEN?.[rolle]?.meter || [1, 1];
  eintrag.t.repeat.set(1 / m[0], 1 / m[1]);
  cache.set(key, eintrag);
  return eintrag;
}

const MAP_NORMIERT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor.rgb = mix( vec3( 1.0 ), sampledDiffuseColor.rgb / max( uMapAvg, vec3( 0.03 ) ), uMapK );
  diffuseColor *= sampledDiffuseColor;
#endif`;

// Texturiertes Material in einer Rolle
export function texMat(rolle, { tint = 0xffffff, rough = 1, normal = 1, metal = 0, staerke = 0.6 } = {}) {
  const d = tex(rolle, 'diff', true);
  const m = new THREE.MeshStandardMaterial({
    map: d.t, normalMap: tex(rolle, 'nor', false).t, roughnessMap: tex(rolle, 'rough', false).t,
    normalScale: new THREE.Vector2(normal, normal), color: tint, roughness: rough, metalness: metal,
  });
  const k = { value: staerke };
  m.onBeforeCompile = sh => {
    sh.uniforms.uMapAvg = d.avg; sh.uniforms.uMapK = k;
    sh.fragmentShader = 'uniform vec3 uMapAvg;\nuniform float uMapK;\n' + sh.fragmentShader.replace('#include <map_fragment>', MAP_NORMIERT);
  };
  m.customProgramCacheKey = () => 'texnorm';
  m.userData.staerke = k;
  return m;
}

// Glas: jedes Fenster etwas anders (Vorhang, Tiefe, Spiegelung), nachts leuchten zufällige Fenster warm
export function glasMat({ color = 0x2c3a44, rough = 0.06, metal = 0.2, env = 1.4, raster = [1.55, 3.4], licht = 0.38, variation = 0.45 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMapIntensity: env });
  const R = { value: new THREE.Vector2(...raster) }, L = { value: licht }, V = { value: variation };
  m.onBeforeCompile = sh => {
    sh.uniforms.uNacht = NACHT; sh.uniforms.uRaster = R; sh.uniforms.uLicht = L; sh.uniforms.uVar = V;
    sh.vertexShader = 'varying vec2 vGUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vGUv = uv;');
    sh.fragmentShader = `varying vec2 vGUv;
uniform float uNacht; uniform vec2 uRaster; uniform float uLicht; uniform float uVar;
float gHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec2 gZelle = floor( vGUv / uRaster );
  float gR = gHash( gZelle );
  vec2 gIn = fract( vGUv / uRaster );
  diffuseColor.rgb *= mix( 1.0 - uVar, 1.0 + uVar, gR ) * mix( 0.8, 1.0, smoothstep( 0.0, 0.5, gIn.y ) );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp( roughnessFactor + ( gR - 0.5 ) * 0.05, 0.02, 1.0 );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float gAn = step( 1.0 - uLicht, gHash( gZelle + 7.31 ) );
  totalEmissiveRadiance += vec3( 1.0, 0.7, 0.42 ) * gAn * uNacht * ( 0.9 + 1.4 * gR ) * mix( 0.55, 1.0, gIn.y );`);
  };
  m.customProgramCacheKey = () => 'glasfenster';
  return m;
}

// Farbrollen (Stilentwurf v0.2 nach Naders Vorlage: weiße Raster, schwarzes Glas, Kupfer, helle Steinbauten)
export const PALETTE = {
  creme: 0xcdbd9f, sand: 0xb9a27c, hellgrau: 0xb5b3ae, weiss: 0xe2e0db, rahmen: 0xf0ede6, rahmenDunkel: 0x2e3033,
  kupfer: 0xc4703e, markise: 0xa63a2e, gruen: 0x5f7046,
};

export function makeMaterials() {
  const glas = glasMat({ color: 0x334049, rough: 0.05, metal: 0.25, env: 2.2 });
  return {
    putz: texMat('putz_hell', { tint: PALETTE.creme, normal: 0.35, staerke: 0.22 }),
    putzSand: texMat('putz_hell', { tint: PALETTE.sand, normal: 0.35, staerke: 0.22 }),
    putzGrau: texMat('putz_hell', { tint: PALETTE.hellgrau, normal: 0.35, staerke: 0.22 }),
    sandstein: texMat('sandstein', { tint: 0xb2a284, normal: 0.7, staerke: 0.55 }),
    beton: texMat('beton_glatt', { tint: PALETTE.weiss, normal: 0.25, staerke: 0.18, rough: 0.9 }),
    platten: texMat('fassade_platten', { tint: 0xc4c2bd, normal: 0.6, staerke: 0.4 }),
    ziegel: texMat('ziegel', { tint: 0x8d5a44, normal: 0.9, staerke: 0.75 }),
    asphalt: Object.assign(texMat('asphalt', { tint: 0x4a4947, normal: 0.8, staerke: 0.55 }), { envMapIntensity: 0.55 }),   // trocken spiegelt er den Himmel wenig (sonst flach gesehen fast weiß)
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
    glasDunkel: glasMat({ color: 0x0d1015, rough: 0.035, metal: 0.6, env: 3.2, licht: 0.22, variation: 0.3 }),
    glasHell: glasMat({ color: 0x5d6d77, rough: 0.05, metal: 0.3, env: 1.4, raster: [1.25, 3.6] }),
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
