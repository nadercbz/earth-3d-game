// Texturen im Grafikspeicher begrenzen (Nr. 110, 25.11.2026). Gemessen im Handyformat am Großen Stern: 398 MB Texturen, davon 106 MB Baumrinde
// (4 Arten mal 5 Karten in 1024), 43 MB das Tagbild der Kugel (4096 x 2048), dazu Lack, Figuren und Böden. Ein Handy hält das nicht (Absturz der Seite).
// Am Handy werden Bilder vor dem Hochladen verkleinert: Farbkarten auf TEX_MAX mal 2, alle anderen Karten (Normalen, Rauheit, Verdeckung) auf TEX_MAX,
// Bäume ganz auf TEX_MAX, die Kugel auf TEX_MAX_GROSS. Am Rechner passiert nichts. Zeichenflächen (Canvas), Datentexturen, Felder und Bildziele bleiben.
import { TEX_MAX, TEX_MAX_GROSS } from './geraet.js';
const KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'clearcoatNormalMap', 'lightMap'];
const GROSS = new Set(['tTag', 'tNacht']), KLEIN = /^(branches|leaves)/;
export const texSparAn = TEX_MAX !== Infinity;
function grenze(slot, mat) {
  if (GROSS.has(slot)) return TEX_MAX_GROSS;
  if (KLEIN.test(mat.name || '')) return TEX_MAX;
  return slot === 'map' || slot === 'emissiveMap' ? TEX_MAX * 2 : TEX_MAX;
}
async function eine(t, max, renderer) {
  const q = t.source, im = q?.data; if (!im || q.__spar) return 0;
  const istBild = typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement, istBitmap = typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap;
  if (!istBild && !istBitmap) { q.__spar = true; return 0; }
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height; if (!w || !h) return 0;   // noch nicht geladen: beim nächsten Durchgang
  q.__spar = true;
  if (Math.max(w, h) <= max) return 0;
  const k = max / Math.max(w, h), nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
  let klein;
  try { klein = await createImageBitmap(im, { resizeWidth: nw, resizeHeight: nh, resizeQuality: 'medium', premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: istBild && t.flipY ? 'flipY' : 'none' }); }
  catch (_) { return 0; }   // ohne createImageBitmap mit Größe (sehr alte Browser) bleibt das Bild, wie es ist
  if (q.data !== im) { klein.close(); return 0; }   // inzwischen getauscht
  q.data = klein; q.needsUpdate = true;
  if (istBitmap) try { im.close(); } catch (_) { /* schon zu */ }
  return (w * h - nw * nh) * 4 * 1.33 / 1048576;
}
// Alle Texturen unter wurzel prüfen und zu große verkleinern. Liefert die gesparten MB (geschätzt). Schon hochgeladene werden freigegeben und kommen beim nächsten Bild klein wieder.
export async function texturSparen(wurzel, renderer) {
  if (!texSparAn || !wurzel) return 0;
  const liste = new Map();   // je Bildquelle: ihre Texturen und die größte erlaubte Kante
  const merke = (t, slot, m) => { if (!t?.isTexture || t.isRenderTargetTexture || t.isDataTexture || t.isCompressedTexture || t.isCanvasTexture || t.isVideoTexture || t.isData3DTexture || t.isDataArrayTexture || !t.source || t.source.__spar) return; const g = grenze(slot, m); let e = liste.get(t.source); if (!e) liste.set(t.source, e = { tex: new Set(), max: g }); e.tex.add(t); e.max = Math.max(e.max, g); };
  wurzel.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) { for (const k of KEYS) merke(m[k], k, m); if (m.uniforms) for (const k in m.uniforms) merke(m.uniforms[k]?.value, k, m); } });
  let mb = 0;
  for (const e of liste.values()) {
    const [t0] = e.tex, s = await eine(t0, e.max, renderer); if (!s) continue; mb += s;
    for (const t of e.tex) { if (renderer?.properties.get(t).__webglTexture) t.dispose(); t.needsUpdate = true; }
  }
  return mb;
}
