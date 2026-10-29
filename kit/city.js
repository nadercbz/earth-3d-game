// Stadt nach Naders Vorlage (moodboard/01_gebaeude/vorlage_1zu1_raster_tuerme.png):
// dichte Hochhäuser in Weiß, Schwarz und Kupfer auf Sockeln, Blockrand mit Innenhöfen, dunkle Straßen,
// dahinter eine Fernstadt aus Instanzen, die im Dunst verschwindet. Straßenebene bleibt europäisch (Altbau, Ziegel).
import * as THREE from 'three';
import { Bau, rng } from './geo.js';
import { buildBuilding } from './buildings.js';
import { NACHT } from './materials.js';

const R4 = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const L4 = (u0, v0, w, d, nw, nd) => [[u0, v0], [u0 + w, v0], [u0 + w, v0 + nd], [u0 + nw, v0 + nd], [u0 + nw, v0 + d], [u0, v0 + d]];

// Bauplan je Quartier in lokalen Koordinaten (u entlang der Hauptstraße, v entlang der Querstraße, ab der Gehwegkante)
// Nebenstraßen bei u und v zwischen 52 und 64 m. Typen und Höhen nach der Vorlage.
function plan(q) {
  const P = [];
  const turm = (fuss, h, type, variant, ecken, sockel) => P.push({ pts: fuss, h, type, variant, ecken, sockel });
  const haus = (fuss, h, type, variant) => P.push({ pts: fuss, h, type, variant });
  const hof = (u0, v0, u1, v1, h, variant, d = 12) => {
    haus(R4(u0, v0, u1, v0 + d), h, 'band', variant); haus(R4(u0, v1 - d, u1, v1), h, 'band', variant);
    haus(R4(u0, v0 + d, u0 + d, v1 - d), h, 'band', variant); haus(R4(u1 - d, v0 + d, u1, v1 - d), h, 'band', variant);
    P.push({ hof: [u0 + d, v0 + d, u1 - d, v1 - d] });
  };
  if (q === '1,1') {
    turm(R4(8, 8, 38, 38), 150, 'raster', null, 4, R4(1, 1, 46, 46));
    hof(66, 2, 106, 48, 26, 'grau');
    turm(R4(6, 70, 40, 94), 172, 'glasturm', 'kante', 0, R4(2, 66, 46, 104));
    turm(R4(72, 70, 98, 96), 118, 'lochfassade', null, 3, R4(66, 66, 106, 104));
  } else if (q === '-1,1') {
    turm(R4(5, 12, 45, 34), 136, 'glasturm', null, 0, R4(1, 2, 48, 46));
    turm(R4(70, 10, 96, 36), 104, 'lochfassade', null, 3);
    hof(2, 66, 48, 104, 22, 'kupfer');
    turm(R4(68, 68, 100, 100), 96, 'raster', null, 0, R4(66, 66, 106, 104));
  } else if (q === '1,-1') {
    haus(L4(0, 0, 24, 22, 11, 11), 22, 'altbau'); haus(R4(25, 0, 43, 15), 19, 'ziegel'); haus(R4(0, 25, 20, 45), 62, 'wohnturm');
    turm(R4(70, 8, 98, 36), 116, 'kupfer', null, 0, R4(66, 2, 106, 46));
    haus(R4(2, 66, 46, 82), 30, 'band', 'weiss'); turm(R4(6, 86, 40, 104), 82, 'raster', null, 3);
    turm(R4(68, 68, 102, 96), 158, 'glasturm', null, 0, R4(66, 66, 106, 104));
  } else {
    haus(L4(0, 0, 22, 20, 10, 10), 19, 'altbau'); haus(R4(24, 0, 40, 14), 16, 'ziegel'); haus(R4(0, 23, 18, 42), 23, 'altbau'); haus(R4(41, 0, 50, 16), 21, 'altbau');
    hof(66, 2, 106, 48, 24, 'weiss');
    turm(R4(8, 70, 40, 98), 72, 'raster', 'kupfer', 2, R4(2, 66, 46, 104));
    turm(R4(70, 68, 100, 98), 92, 'lochfassade', 'grau', 0, R4(66, 66, 106, 104));
  }
  return P;
}

// Kern der Stadt: alle Häuser der vier Quartiere, Nebenstraßen, Innenhöfe
export function buildCity(mats, strasse, { makeTree, BAEUME, mobil = false } = {}) {
  const U = strasse.userData, L = U.S.L;
  const haeuser = [], extra = new THREE.Group(), boden = new Bau();
  let seed = 101;
  for (const b of U.bloecke) {
    const gx = Math.abs(b.ecke[0]), gz = Math.abs(b.ecke[1]);
    const W = (pts) => pts.map(([u, v]) => [b.sx * (gx + u), b.sz * (gz + v)]);
    // Nebenstraßen (7 m Fahrbahn, 2,5 m Gehweg je Seite) in diesem Quartier
    const umax = L - 2 - gx, vmax = L - 2 - gz;
    nebenstrasse(boden, W, 52, 64, 0, vmax, true);
    nebenstrasse(boden, W, 0, umax, 52, 64, false);
    for (const p of plan(`${b.sx},${b.sz}`)) {
      if (p.hof) {   // Innenhof mit Pflaster, Rasen und kleinen Bäumen
        const [u0, v0, u1, v1] = p.hof;
        const q = W(R4(u0, v0, u1, v1));
        boden.poly('kopfstein', q, 0.17);
        const g = W(R4(u0 + 3, v0 + 3, u1 - 3, v1 - 3)); boden.poly('rasen', g, 0.19);
        if (makeTree && !mobil) {
          const Rr = rng(seed);
          for (let i = 0; i < 3; i++) {
            const t = makeTree(BAEUME[1], 7 + i, true);
            t.scale.multiplyScalar(0.55 + Rr() * 0.2);
            const [x, z] = W([[u0 + 5 + Rr() * (u1 - u0 - 10), v0 + 5 + Rr() * (v1 - v0 - 10)]])[0];
            t.position.set(x, 0.19, z); t.rotation.y = Rr() * 6; extra.add(t);
          }
        }
        continue;
      }
      let y = 0.15;
      if (p.sockel) {
        const s = buildBuilding(mats, { pts: W(p.sockel), height: 15, type: 'band', variant: p.type === 'glasturm' ? 'grau' : 'weiss', seed: seed++ });
        s.position.y = y; haeuser.push(s); y += s.userData.height + 1.0;
      }
      const m = buildBuilding(mats, { pts: W(p.pts), height: p.h - (y - 0.15), type: p.type, variant: p.variant, ecken: p.ecken, seed: seed++, ohneLaden: !!p.sockel, leicht: mobil });
      m.position.y = y; haeuser.push(m);
    }
  }
  const bodenMesh = boden.build({ ...mats, rasen: mats.rasen || mats.pflanze }, { shadow: false });
  bodenMesh.traverse(o => { o.receiveShadow = true; });
  return { haeuser, extra, boden: bodenMesh };
}

function nebenstrasse(bau, W, u0, u1, v0, v1, quer) {
  // quer: Straße läuft entlang v (u fest zwischen u0 und u1), sonst entlang u
  const y = 0.152;
  const flaeche = (key, a0, a1, b0, b1, hh) => {
    const pts = quer ? W([[a0, b0], [a1, b0], [a1, b1], [a0, b1]]) : W([[b0, a0], [b1, a0], [b1, a1], [b0, a1]]);
    bau.poly(key, pts, hh);
  };
  const [a0, a1, b0, b1] = quer ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
  flaeche('asphalt', a0 + 2.5, a1 - 2.5, b0, b1, y);
  flaeche('granit', a0 + 2.2, a0 + 2.5, b0, b1, y + 0.004);
  flaeche('granit', a1 - 2.5, a1 - 2.2, b0, b1, y + 0.004);
  for (let b = b0 + 2; b < b1 - 3; b += 8) flaeche('markierung', (a0 + a1) / 2 - 0.06, (a0 + a1) / 2 + 0.06, b, b + 3.5, y + 0.006);
}

// Fernstadt: tausende Türme als Instanzen mit Fassaden aus dem Shader, verschwinden im Dunst
// Material der Fernstadt: Fassaden aus dem Shader (Raster, Glas, Lochfassade, Kupfer, Bänder, schlicht) je Typ im Attribut aTyp.
// instanziert für die Kisten der Fernstadt, sonst für zusammengefasste Grundrisse (echte Orte, kit/ort.js).
// lokal: Fassadenachsen aus den Objektkoordinaten (y oben) statt der Welt, für Kacheln auf der Kugel (kit/stadt.js), deren Gruppe die ENU Drehung trägt
export function fernMaterial({ instanziert = true, lokal = false, licht = 1.4 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.1 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNacht = NACHT;
    sh.vertexShader = 'attribute float aTyp;\nvarying float vTyp;\nvarying vec3 vWp;\nvarying vec3 vWn;\n' + sh.vertexShader
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n  ${lokal ? 'vec4 fsW = vec4( transformed, 1.0 ); vWn = normalize( objectNormal );' : instanziert ? 'vec4 fsW = modelMatrix * instanceMatrix * vec4( transformed, 1.0 ); vWn = normalize( mat3( modelMatrix * instanceMatrix ) * objectNormal );' : 'vec4 fsW = modelMatrix * vec4( transformed, 1.0 ); vWn = normalize( mat3( modelMatrix ) * objectNormal );'} vWp = fsW.xyz; vTyp = aTyp;`);
    sh.fragmentShader = `varying float vTyp; varying vec3 vWp; varying vec3 vWn; uniform float uNacht;
float fsH( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
// weiche Kante für Streifen (gegen Flimmern): 1, wenn fract(x) über der Schwelle liegt
float fsS( float x, float schwelle ) { float w = fwidth( x ) * 0.9 + 1e-4; return smoothstep( schwelle - w, schwelle + w, fract( x ) ); }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float fsDach = step( 0.6, abs( vWn.y ) );
  vec2 fsT = normalize( vec2( -vWn.z, vWn.x ) + 1e-5 );
  float fsU = dot( vWp.xz, fsT ), fsV = vWp.y;
  vec3 fsFarbe; float fsGlas = 0.0; vec2 fsZelle = vec2( 0.0 );
  int typ = int( vTyp + 0.5 );
  bool fsSteil = typ >= 10; if ( fsSteil ) typ -= 10;   // Steildach der Kisten (kit/ortbau.worker.js steildach): Fläche gehört zum Dach
  if ( typ == 0 ) {          // weißes Raster
    float lam = fsS( fsU / 1.25, 0.78 ), band = fsS( fsV / 3.75, 0.88 );
    fsGlas = 1.0 - max( lam, band ); fsFarbe = mix( vec3( 0.93, 0.93, 0.91 ), vec3( 0.13, 0.16, 0.19 ), fsGlas ); fsZelle = floor( vec2( fsU / 1.25, fsV / 3.75 ) );
  } else if ( typ == 1 ) {   // schwarzes Glas
    float lin = max( fsS( fsU / 1.5, 0.95 ), fsS( fsV / 3.8, 0.96 ) );
    fsGlas = 1.0 - lin; fsFarbe = mix( vec3( 0.16, 0.17, 0.18 ), vec3( 0.025, 0.03, 0.04 ), fsGlas ); fsZelle = floor( vec2( fsU / 1.5, fsV / 3.8 ) );
  } else if ( typ == 2 ) {   // helle Lochfassade
    vec2 f = fract( vec2( fsU / 1.6, fsV / 3.3 ) );
    fsGlas = fsS( fsU / 1.6, 0.3 ) * ( 1.0 - fsS( fsU / 1.6, 0.92 ) ) * fsS( fsV / 3.3, 0.27 ) * ( 1.0 - fsS( fsV / 3.3, 0.83 ) );
    fsFarbe = mix( vec3( 0.88, 0.87, 0.84 ), vec3( 0.1, 0.12, 0.14 ), fsGlas ); fsZelle = floor( vec2( fsU / 1.6, fsV / 3.3 ) );
  } else if ( typ == 3 ) {   // Kupfer
    float band = fsS( fsV / 3.6, 0.7 ), lam = fsS( fsU / 1.8, 0.9 );
    fsGlas = 1.0 - max( band, lam ); fsFarbe = mix( vec3( 0.66, 0.36, 0.2 ), vec3( 0.12, 0.13, 0.15 ), fsGlas ); fsZelle = floor( vec2( fsU / 1.8, fsV / 3.6 ) );
  } else if ( typ == 5 ) {   // schlicht ohne Fenster (Denkmäler, Nebengebäude, Dächer)
    fsGlas = 0.0; fsFarbe = vec3( 0.55, 0.55, 0.53 );
  } else if ( typ == 6 ) {   // warmer Putz und Lehm (Maghreb, Golf, Kolonialstil, Haveli, Sahel): kleine Fenster, Farbe je Haus zwischen Sand und Ocker
    vec3 wand = mix( vec3( 0.86, 0.74, 0.56 ), vec3( 0.76, 0.47, 0.31 ), fsH( floor( vWp.xz / 23.0 ) ) );
    fsGlas = fsS( fsU / 2.4, 0.42 ) * ( 1.0 - fsS( fsU / 2.4, 0.7 ) ) * fsS( fsV / 3.2, 0.35 ) * ( 1.0 - fsS( fsV / 3.2, 0.72 ) );
    fsFarbe = mix( wand, vec3( 0.12, 0.1, 0.09 ), fsGlas ); fsZelle = floor( vec2( fsU / 2.4, fsV / 3.2 ) );
  } else if ( typ == 7 ) {   // weißer Putz (Kykladen, Vorstadt)
    fsGlas = fsS( fsU / 2.2, 0.36 ) * ( 1.0 - fsS( fsU / 2.2, 0.72 ) ) * fsS( fsV / 3.0, 0.3 ) * ( 1.0 - fsS( fsV / 3.0, 0.75 ) );
    fsFarbe = mix( vec3( 0.93, 0.92, 0.89 ), vec3( 0.14, 0.16, 0.18 ), fsGlas ); fsZelle = floor( vec2( fsU / 2.2, fsV / 3.0 ) );
  } else if ( typ == 8 ) {   // Holz (Machiya, Skandinavien): waagrechte Bretter, Farbe je Haus von dunkel bis Falunrot
    vec3 holz = mix( vec3( 0.3, 0.21, 0.15 ), vec3( 0.55, 0.2, 0.15 ), step( 0.6, fsH( floor( vWp.xz / 19.0 ) ) ) );
    float brett = fsS( fsV / 0.22, 0.85 );
    fsGlas = fsS( fsU / 2.0, 0.3 ) * ( 1.0 - fsS( fsU / 2.0, 0.75 ) ) * fsS( fsV / 3.0, 0.3 ) * ( 1.0 - fsS( fsV / 3.0, 0.8 ) );
    fsFarbe = mix( holz * ( 1.0 - 0.18 * brett ), vec3( 0.1, 0.11, 0.12 ), fsGlas ); fsZelle = floor( vec2( fsU / 2.0, fsV / 3.0 ) );
  } else if ( typ == 9 ) {   // Backstein (Ziegel, Brownstone)
    fsGlas = fsS( fsU / 1.7, 0.3 ) * ( 1.0 - fsS( fsU / 1.7, 0.8 ) ) * fsS( fsV / 3.2, 0.28 ) * ( 1.0 - fsS( fsV / 3.2, 0.82 ) );
    fsFarbe = mix( mix( vec3( 0.55, 0.27, 0.19 ), vec3( 0.42, 0.24, 0.18 ), fsH( floor( vWp.xz / 21.0 ) ) ), vec3( 0.1, 0.11, 0.13 ), fsGlas ); fsZelle = floor( vec2( fsU / 1.7, fsV / 3.2 ) );
  } else {                   // Bürohaus mit Bändern, grau
    float band = fsS( fsV / 3.6, 0.66 );
    fsGlas = 1.0 - band; fsFarbe = mix( vec3( 0.78, 0.78, 0.76 ), vec3( 0.16, 0.18, 0.2 ), fsGlas ); fsZelle = floor( vec2( fsU / 1.5, fsV / 3.6 ) );
  }
  float fsAA = smoothstep( 0.45, 0.95, max( fwidth( fsU ) / 1.25, fwidth( fsV ) / 3.6 ) );
  vec3 fsMittel = typ == 5 ? vec3( 0.55, 0.55, 0.53 ) : typ == 0 ? vec3( 0.6, 0.61, 0.61 ) : typ == 1 ? vec3( 0.05, 0.055, 0.065 ) : typ == 2 ? vec3( 0.55, 0.55, 0.53 ) : typ == 3 ? vec3( 0.42, 0.26, 0.17 )
    : typ == 6 ? vec3( 0.72, 0.56, 0.4 ) : typ == 7 ? vec3( 0.82, 0.81, 0.78 ) : typ == 8 ? vec3( 0.36, 0.2, 0.15 ) : typ == 9 ? vec3( 0.42, 0.23, 0.17 ) : vec3( 0.36, 0.37, 0.38 );
  fsFarbe = mix( fsFarbe, fsMittel, fsAA ); fsGlas = mix( fsGlas, 0.5, fsAA );
  if ( fsV < 6.0 ) { fsFarbe *= 0.55; }
  fsFarbe *= 0.72 + 0.36 * fsH( floor( vWp.xz / 40.0 ) );
  fsFarbe *= mix( 0.42, 1.0, smoothstep( 0.0, 45.0, vWp.y ) );   // Straßenschluchten unten dunkler, wie Verdeckung
  vec3 fsDachFarbe = typ == 6 ? fsMittel * 0.95 : typ == 7 ? vec3( 0.78, 0.77, 0.74 ) : typ == 8 ? vec3( 0.24, 0.22, 0.21 ) : typ == 9 ? vec3( 0.36, 0.22, 0.17 ) : vec3( 0.42, 0.42, 0.41 );   // Flachdächer in Lehm und Weiß, Ziegel und Holz dunkel
  if ( fsSteil ) {   // Ziegel rot bis braun oder Anthrazit je Haus, feine Reihen quer zum Gefälle
    float fsWahl = fsH( floor( vWp.xz / 17.0 ) + 3.1 );
    fsDachFarbe = fsWahl < 0.55 ? mix( vec3( 0.36, 0.15, 0.1 ), vec3( 0.3, 0.14, 0.11 ), fsH( floor( vWp.xz / 9.0 ) ) ) : fsWahl < 0.8 ? vec3( 0.22, 0.14, 0.12 ) : vec3( 0.13, 0.135, 0.145 );
    fsDachFarbe *= 0.9 + 0.1 * fsS( vWp.y / 0.32, 0.5 );
    fsDach = 1.0;
  }
  diffuseColor.rgb = mix( fsFarbe, fsDachFarbe, fsDach );
  float fsLicht = fsGlas * ( 1.0 - fsDach ) * step( 0.7, fsH( fsZelle + floor( vWp.xz / 13.0 ) ) );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix( roughnessFactor, 0.08, fsGlas * ( 1.0 - fsDach ) );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix( metalnessFactor, 0.6, fsGlas * ( 1.0 - fsDach ) );')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3( 1.0, 0.72, 0.45 ) * fsLicht * uNacht * ${licht.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'fernstadt' + (instanziert ? 'I' : 'G') + (lokal ? 'L' : '') + licht;
  return mat;
}

export function buildFernstadt({ innen = 130, radius = 1500, mobil = false, seed = 7 } = {}) {
  const R = rng(seed), raster = 46, liste = [];
  for (let x = -radius; x <= radius; x += raster) for (let z = -radius; z <= radius; z += raster) {
    const d = Math.hypot(x, z);
    if (Math.abs(x) < innen + raster * 0.6 && Math.abs(z) < innen + raster * 0.6) continue;
    if (d > radius || (mobil && R() < 0.45)) continue;
    const zentral = Math.exp(-d / 650);
    const rand = Math.max(Math.abs(x), Math.abs(z)) - innen;          // nah am Kern niedriger, damit der Kern wirkt
    const nahe = THREE.MathUtils.smoothstep(rand, 60, 420);
    const n = R() < 0.35 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = 16 + R() * 18, t = 14 + R() * 18;
      const hoch = R() < (0.12 + 0.55 * zentral) * nahe;
      const h = hoch ? 45 + Math.pow(R(), 1.5) * 190 * (0.45 + zentral) : 12 + R() * (14 + 22 * nahe);
      const ox = (R() - 0.5) * (raster - w - 6) * (n === 1 ? 1 : 0.4) + (n === 2 ? (k ? 9 : -9) : 0);
      const oz = (R() - 0.5) * (raster - t - 6);
      const typ = hoch ? [0, 0, 1, 1, 1, 2, 3][Math.floor(R() * 7)] : [2, 4, 4, 0, 1][Math.floor(R() * 5)];
      liste.push({ x: x + ox, z: z + oz, w, t, h, typ, ry: R() < 0.15 ? R() * 0.4 : 0 });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const typAttr = new Float32Array(liste.length);
  const mat = fernMaterial();
  const mesh = new THREE.InstancedMesh(geo, mat, liste.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3();
  liste.forEach((b, i) => {
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ry); S.set(b.w, b.h, b.t); Pv.set(b.x, 0, b.z);
    mesh.setMatrixAt(i, M.compose(Pv, Q, S)); typAttr[i] = b.typ;
  });
  geo.setAttribute('aTyp', new THREE.InstancedBufferAttribute(typAttr, 1));
  mesh.castShadow = false; mesh.receiveShadow = true;
  // Dachaufbauten (Technik, Treppenhäuser) auf den höheren Häusern: ein Zeichenaufruf für alle
  const aufbau = liste.filter(b => b.h > 26);
  const dachGeo = new THREE.BoxGeometry(1, 1, 1); dachGeo.translate(0, 0.5, 0);
  const anzahlAufbau = aufbau.reduce((n, b) => n + (b.h > 70 ? 2 : 1), 0);
  const dach = new THREE.InstancedMesh(dachGeo, new THREE.MeshStandardMaterial({ color: 0x8d8b87, roughness: 0.7, metalness: 0.2 }), anzahlAufbau);
  let k = 0;
  aufbau.forEach(b => {
    for (let j = 0; j < (b.h > 70 ? 2 : 1); j++) {
      const w = b.w * (j ? 0.18 + R() * 0.1 : 0.32 + R() * 0.2), t = b.t * (j ? 0.18 + R() * 0.1 : 0.3 + R() * 0.2), hh = j ? 1.4 + R() : 2.5 + R() * 3;
      const ox = (R() - 0.5) * (b.w - w) * 0.8, oz = (R() - 0.5) * (b.t - t) * 0.8;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.ry); S.set(w, hh, t);
      Pv.set(ox, 0, oz).applyQuaternion(Q).add(new THREE.Vector3(b.x, b.h, b.z));
      dach.setMatrixAt(k++, M.compose(Pv, Q, S));
    }
  });
  dach.castShadow = false; dach.receiveShadow = true;
  const gruppe = new THREE.Group(); gruppe.add(mesh, dach);
  gruppe.userData = { anzahl: liste.length };
  return gruppe;
}

// Boden außerhalb des Kerns: dunkle Straßen im Raster, helle Blöcke
export function bodenStadt(mats, groesse = 6000) {
  const g = new THREE.PlaneGeometry(groesse, groesse, 1, 1); g.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vBp;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vBp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = 'varying vec3 vBp;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  vec2 bz = abs( fract( ( vBp.xz + 23.0 ) / 46.0 ) - 0.5 ) * 46.0;
  float strasse = step( 23.0 - 4.5, max( bz.x, bz.y ) );
  diffuseColor.rgb = mix( vec3( 0.36, 0.36, 0.35 ), vec3( 0.09, 0.09, 0.1 ), strasse );`);
  };
  mat.customProgramCacheKey = () => 'bodenstadt';
  const m = new THREE.Mesh(g, mat); m.position.y = -0.05; m.receiveShadow = true;
  return m;
}
