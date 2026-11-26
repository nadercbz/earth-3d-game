// Fassaden und Dächer der Fernhäuser aus Higgsfield Bildern (Wunsch Nr. 104, 17.11.2026). Ein Blatt (assets/textures/fassaden/blatt.webp,
// je Schicht links Farbe, rechts Fenstermaske) wird zu einem Texturfeld (sampler2DArray) mit Alpha = Maske. Bis das Blatt da ist, zeichnet der
// Shader die alten Muster (uFassAn = 0). Bau der Bilder: tools/fassaden_bauen.py, Angaben je Schicht: kit/fassaden_daten.js.
import * as THREE from 'three';
import { FASSADEN } from './fassaden_daten.js';
import { ASSET_BASIS } from './bildlader.js';
import { MOBIL } from './geraet.js';

const N = FASSADEN.schichten.length;
const leer = new THREE.DataArrayTexture(new Uint8Array([200, 200, 200, 0]), 1, 1, 1); leer.needsUpdate = true;
export const FASS_U = {
  tFass: { value: leer }, uFassAn: { value: 0 },
  uFassM: { value: FASSADEN.schichten.map(e => new THREE.Vector4(e.meter[0], e.meter[1], e.fenster[0], e.fenster[1])) },
  uFassW: { value: FASSADEN.schichten.map(e => new THREE.Vector3(...e.wand)) },
};
// Schichtnummern als GLSL Konstanten: FL_GZ_STUCK und so weiter
export const FASS_GLSL = `uniform highp sampler2DArray tFass; uniform float uFassAn; uniform vec4 uFassM[${N}]; uniform vec3 uFassW[${N}];
${FASSADEN.schichten.map((e, i) => `#define FL_${e.name.toUpperCase()} ${i}`).join('\n')}
`;

let gestartet = false;
export function fassadenLaden(renderer) {
  if (gestartet) return; gestartet = true;
  if (typeof location !== 'undefined' && /[?&]fassaden=0/.test(location.search)) return;   // Vergleich mit den alten Mustern: ?fassaden=0
  const S = MOBIL ? FASSADEN.handy : FASSADEN.groesse;
  fetch(new URL(`textures/fassaden/${MOBIL ? 'handy/' : ''}blatt.webp`, ASSET_BASIS).href)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then(b => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
    .then(bmp => {
      const c = document.createElement('canvas'); c.width = 2 * S; c.height = S * N;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0); bmp.close?.();
      const roh = g.getImageData(0, 0, 2 * S, S * N).data, daten = new Uint8Array(S * S * 4 * N);
      for (let l = 0; l < N; l++) for (let y = 0; y < S; y++) {
        const q = ((l * S + y) * 2 * S) * 4, z = ((l * S + y) * S) * 4;
        for (let x = 0; x < S; x++) { const a = q + x * 4, m = q + (S + x) * 4, o = z + x * 4; daten[o] = roh[a]; daten[o + 1] = roh[a + 1]; daten[o + 2] = roh[a + 2]; daten[o + 3] = roh[m]; }
      }
      const t = new THREE.DataArrayTexture(daten, S, S, N);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true; t.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4); t.needsUpdate = true;
      FASS_U.tFass.value = t; FASS_U.uFassAn.value = 1;
    })
    .catch(e => console.warn('Fassaden', e?.message || e));
}

// Wandtöne der Fernsicht (sRGB wie die Materialien der Nahmodelle, kit/materials.js)
export const FS_TOENE = ['#d9c9a8', '#d8b889', '#d39a78', '#c4cdb0', '#a9bccb', '#c2bfb8', '#b9765a', '#e4e0d4', '#e0c878', '#c98f8a', '#9dbfae', '#b78f6a', '#dcd9d0', '#c9b99c', '#a3a09a', '#a8927c', '#8f4f3c', '#7a5140', '#b9b3a6', '#98958f', '#b9a57f', '#b2a284', '#a39a89', '#cdbd9f', '#b9a27c', '#b5b3ae', '#e2e0db', '#7d6048', '#8d9092', '#486a8a', '#8a3f33', '#c2c3bf', '#5b544c'];
export const FS_GLSL = `const vec3 FS_TON[${FS_TOENE.length}] = vec3[${FS_TOENE.length}](${FS_TOENE.map(h => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; }).join(', ')});`;

// Material der nahen Fotowände (kit/fotowand.js, Nr. 105): Farbe aus dem Texturfeld, Schicht und Kiez Ton stecken in den UV (x: 16 mal (Ton + 1),
// y: 16 mal Schicht). Die Wand wird im Ton des Kiezes gefärbt wie in der Ferne (Helligkeit aus dem Foto, Fenster bleiben). textureGrad mit den
// Ableitungen der UV: die ganzzahligen Sprünge zwischen Vierecken ändern so die Mipmap Stufe nicht. Bis das Blatt da ist, die Wandfarbe
const FOTO_FS = `
  float fwL = floor( vFotoUv.y / 16.0 ), fwK = floor( vFotoUv.x / 16.0 );
  int fwLi = int( fwL + 0.5 ), fwTon = int( fwK + 0.5 ) - 1;
  vec3 fwC = uFassW[ fwLi ];
  if ( uFassAn > 0.5 ) {
    vec2 fwT = vFotoUv - 16.0 * vec2( fwK, fwL );
    vec4 fwTx = textureGrad( tFass, vec3( fwT.x, 1.0 - fwT.y, fwL ), vec2( dFdx( vFotoUv.x ), -dFdx( vFotoUv.y ) ), vec2( dFdy( vFotoUv.x ), -dFdy( vFotoUv.y ) ) );
    fwC = fwTx.rgb;
    if ( fwTon >= 0 ) { float lw = dot( uFassW[ fwLi ], vec3( 0.2126, 0.7152, 0.0722 ) ), lc = dot( fwC, vec3( 0.2126, 0.7152, 0.0722 ) ); fwC = mix( fwC, FS_TON[ fwTon ] * lc / max( lw, 0.02 ), ( 1.0 - fwTx.a ) * 0.85 ); }
  } else if ( fwTon >= 0 ) fwC = FS_TON[ fwTon ];
  diffuseColor.rgb *= fwC;`;
export function fotoWandMat() {
  fassadenLaden();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, FASS_U);
    sh.vertexShader = 'varying vec2 vFotoUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vFotoUv = uv;');
    sh.fragmentShader = 'varying vec2 vFotoUv;\n' + FS_GLSL + '\n' + FASS_GLSL + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>' + FOTO_FS);
  };
  m.customProgramCacheKey = () => 'fotowand1';
  return m;
}
