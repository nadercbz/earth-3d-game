// Bilder laden, ohne den Hauptfaden anzuhalten (06.11.2026, Wunsch Nr. 66). THREE.TextureLoader entpackt erst beim Hochladen auf die Grafikkarte, im Hauptfaden: im Profil bis 600 ms am Stück, auf schwächeren Rechnern Sekunden. Hier passiert das Entpacken vorher im Hintergrund (ImageBitmap).
import * as THREE from 'three';
// Ordner assets, von hier aus. Gilt auch im Bündel (kit/spiel.js). Ein Pfad mit ../../ aus kit/vendor zeigte im Bündel unter einer Unteradresse wie GitHub Pages ins Leere (07.11.2026: alle Bäume schwarz)
export const ASSET_BASIS = new URL('../assets/', import.meta.url);
const OPT = { imageOrientation: 'flipY', colorSpaceConversion: 'none' };
let geht = typeof createImageBitmap === 'function' && typeof fetch === 'function' && !/^((?!chrome|android).)*safari/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');   // Safari: createImageBitmap mit Optionen ist unzuverlässig, dort wie bisher
// Liefert sofort eine Textur, das Bild kommt nach. fertig(textur) wie bei TextureLoader. vormultipliziert: Blätter mit Alpha
export function bildTextur(url, { vormultipliziert = false, flip = true, fertig = null, fehler = null } = {}) {
  if (!geht) { const t = new THREE.TextureLoader().load(url, fertig || undefined, undefined, fehler || undefined); t.premultiplyAlpha = vormultipliziert; t.flipY = flip; return t; }
  const t = new THREE.Texture();
  t.flipY = false;   // bei ImageBitmap wirkt UNPACK_FLIP_Y nicht, das Bild ist schon gedreht (Orientierung wie TextureLoader)
  t.premultiplyAlpha = vormultipliziert;
  fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.blob(); })
    .then(b => createImageBitmap(b, { ...OPT, imageOrientation: flip ? 'flipY' : 'none', premultiplyAlpha: vormultipliziert ? 'premultiply' : 'none' }))
    .then(bmp => { t.image = bmp; t.needsUpdate = true; fertig?.(t); })
    .catch(e => { if (fehler) fehler(e); else console.warn('Bild', url, e?.message || e); });
  return t;
}
export function bildTexturWarten(url, opt = {}) { return new Promise((ja, nein) => { const t = bildTextur(url, { ...opt, fertig: x => ja(x || t), fehler: nein }); }); }
