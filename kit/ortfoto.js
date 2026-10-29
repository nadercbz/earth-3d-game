// Satellitenbild für den Boden eines gebauten Ortes (29.10.2026 abends, offener Punkt "Übergang vom gebauten Ort zum Foto"): vorher lag
// der Ort als einheitlich grüne oder graue Platte im Foto der Kugel. Jetzt zeigen Grün, Wald, Sand und die Flächen zwischen den Straßen
// das Satellitenbild (EOX Sentinel 2 cloudless 2016, Stufe 15, CC BY 4.0) mit dem Korn ihrer Textur, Straßen und Gehwege bleiben gebaut.
// Helligkeit wie auf der Kugel: dasselbe Lichtmodell (Himmel plus Sonne), Schatten der Häuser aus der Beleuchtung des Materials, durch die
// ACES Kurve zurückgerechnet (acesUmkehr).
import * as THREE from 'three';
import { FOTO, ACES_UMKEHR_GLSL } from './erde.js';

const T = 256, D2R = Math.PI / 180;
const NEUTRAL = (() => { const t = new THREE.DataTexture(new Uint8Array([74, 82, 64, 255]), 1, 1); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; })();
const px = (lon, n) => (lon + 180) / 360 * n * T;
const py = (lat, n) => { const s = Math.sin(lat * D2R); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n * T; };

// Uniforms je Ort: das Bild kommt später (laden), bis dahin Anteil 0 (die Materialien zeigen ihre eigene Farbe)
export function ortFotoUniforms(uHell, uSonne) {
  return { tOrtFoto: { value: NEUTRAL }, uOrtFoto: { value: new THREE.Vector4(0, 0, 0, 0) }, uOrtFotoAn: { value: 0 }, uHell, uSonne };
}
// Schatten der Sonne aus der Beleuchtung des Materials abgreifen (Häuser, Bäume): Verhältnis des Sonnenlichts nach und vor getShadow
const SONNE = 'getDirectionalLightInfo( directionalLight, directLight );';
function lichterMitSchatten() {
  const c = THREE.ShaderChunk.lights_fragment_begin, i0 = c.indexOf(SONNE); if (i0 < 0) return c;
  const i1 = c.indexOf('RE_Direct(', i0);
  return c.slice(0, i0) + SONNE + ' fotoVoll = directLight.color;' + c.slice(i0 + SONNE.length, i1) +
    'fotoSchatten = min( fotoSchatten, dot( directLight.color, vec3( 1.0 ) ) / max( dot( fotoVoll, vec3( 1.0 ) ), 1e-5 ) );\n\t\t' + c.slice(i1);
}

// Bild aus den Kacheln der Stufe z für das Quadrat um lat, lon (halb Meter), Abbildung linear: u = x0 + x * dx, v = y0 + z * dz (z nach Süden)
export async function ortFotoLaden(U, { lat, lon, halb, z = 15, renderer, mobil = false }) {
  const phi = lat * D2R, kLat = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), kLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);   // wie kit/ortbau.js
  const n = 2 ** z, rand = 40, lonW = lon - (halb + rand) / kLon, lonO = lon + (halb + rand) / kLon, latN = lat + (halb + rand) / kLat, latS = lat - (halb + rand) / kLat;
  const x0 = Math.floor(px(lonW, n) / T), x1 = Math.floor(px(lonO, n) / T), y0 = Math.floor(py(latN, n) / T), y1 = Math.floor(py(latS, n) / T);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 36) return false;
  const W = (x1 - x0 + 1) * T, H = (y1 - y0 + 1) * T, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = 'rgb(74, 82, 64)'; g.fillRect(0, 0, W, H);
  const jobs = [];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) jobs.push((async () => {
    const r = await fetch(FOTO.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)); if (!r.ok) throw new Error(r.status);
    const b = await createImageBitmap(await r.blob()); g.drawImage(b, (tx - x0) * T, (ty - y0) * T); b.close(); return 1;
  })().catch(() => 0));
  const ok = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
  if (ok < jobs.length * 0.6) return false;   // zu viele Lücken: lieber die eigene Farbe
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = mobil ? 2 : 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  renderer?.initTexture(tex);
  U.tOrtFoto.value = tex;
  U.uOrtFoto.value.set((px(lon, n) - x0 * T) / W, (py(lat, n) - y0 * T) / H, (px(lon + 1 / kLon, n) - px(lon, n)) / W, (py(lat - 1 / kLat, n) - py(lat, n)) / H);
  U.uOrtFotoAn.value = 1;
  return true;
}
export function ortFotoFrei(U) { if (U?.tOrtFoto.value !== NEUTRAL) U?.tOrtFoto.value.dispose(); }

// Material mit Foto: anteil 0 bis 1 (Grün 0,92, Flächen zwischen den Straßen 0,8), Korn der eigenen Textur bleibt leicht erhalten
export function fotoMaterial(basis, U, anteil) {
  const m = basis.clone();
  m.onBeforeCompile = sh => {
    sh.uniforms.tOrtFoto = U.tOrtFoto; sh.uniforms.uOrtFoto = U.uOrtFoto; sh.uniforms.uOrtFotoAn = U.uOrtFotoAn; sh.uniforms.uHell = U.uHell; sh.uniforms.uSonne = U.uSonne; sh.uniforms.uFotoAnteil = { value: anteil };
    sh.vertexShader = 'varying vec2 vOrtXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vOrtXZ = position.xz;');
    sh.fragmentShader = `uniform sampler2D tOrtFoto; uniform vec4 uOrtFoto; uniform float uOrtFotoAn, uHell, uFotoAnteil; uniform vec3 uSonne; varying vec2 vOrtXZ;
${ACES_UMKEHR_GLSL}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
  float fotoK = uFotoAnteil * uOrtFotoAn;
  {
    vec3 foto = texture2D(tOrtFoto, uOrtFoto.xy + vOrtXZ * uOrtFoto.zw).rgb;
    float korn = clamp(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15)) / max(dot(diffuse, vec3(0.3, 0.55, 0.15)), 1e-3) / 0.55, 0.6, 1.4);   // Helligkeit der eigenen Textur, um 1
    diffuseColor.rgb = mix(diffuseColor.rgb, foto * mix(1.0, korn, 0.3), fotoK);
  }`)
      .replace('#include <lights_fragment_begin>', 'float fotoSchatten = 1.0; vec3 fotoVoll = vec3( 1.0 );\n' + lichterMitSchatten())
      // Licht wie auf der Kugel (kit/erde.js: Himmel plus Sonne mal Schatten, Foto mal 0,82, Gewinn 1,3, durch die ACES Kurve zurück), sonst
      // war der Ortsboden mit dem Umgebungslicht des Materials rund viermal heller als die Kugel ringsum
      .replace('#include <opaque_fragment>', `{
    vec3 nW = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
    float licht = clamp( dot( nW, uSonne ) * 1.1, 0.0, 1.0 ), tagSeite = smoothstep( -0.18, 0.08, uSonne.y );
    vec3 L = ( 0.05 + 0.28 * tagSeite * ( 0.55 + 0.45 * nW.y ) ) * vec3( 0.92, 0.97, 1.08 ) + 0.92 * licht * fotoSchatten;
    outgoingLight = mix( outgoingLight, acesUmkehr( diffuseColor.rgb * 0.82 * L * 1.3 ) * uHell * ( 0.6 / 0.95 ), fotoK );
  }
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ortfoto';
  return m;
}
