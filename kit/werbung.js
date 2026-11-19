// Werbeflächen in der Welt (Wunsch Nr. 59, 06.11.2026). Lage: kit/ortbau.js (daten.freizeit.werbung), Regeln und Kennungen: kit/werbeflaechen.js, Buchungen: daten/werbung/buchungen.json.
// Freie Flächen zeigen "Hier kann deine Werbung hängen" in der Sprache des Landes (auf der Leinwand gezeichnet, keine Datei), gebuchte das Motiv des Kunden.
// Je Art ein Körper und ein Plakat als Instanzen, also wenige Draw Calls. Die Plakate liegen in einem Bildatlas mit drei Farbreihen, jede Fläche nimmt ihre Reihe aus der Kennung.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NACHT } from './materials.js';
import { spracheVon } from './schilder.js';
import { WF_PREMIUM } from './werbeflaechen.js';

const D2R = Math.PI / 180, KLAT = p => 111132.954 - 559.822 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p), KLON = p => 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
const FARBEN = { orange: '#F26A21', kohle: '#232321', weiss: '#FEFEFE', mint: '#E3EAE0' };
const SCHEMA = [{ grund: FARBEN.orange, text: FARBEN.kohle, tag: FARBEN.kohle, tagText: FARBEN.weiss, akzent: 'rgba(35,35,33,.14)' }, { grund: FARBEN.kohle, text: FARBEN.weiss, tag: FARBEN.orange, tagText: FARBEN.kohle, akzent: 'rgba(242,106,33,.34)' }, { grund: FARBEN.mint, text: FARBEN.kohle, tag: FARBEN.orange, tagText: FARBEN.kohle, akzent: 'rgba(242,106,33,.34)' }];
const TEXTE = {
  de: ['Hier kann deine Werbung hängen.', 'FLÄCHE FREI', 'Diesen Platz buchen'], en: ['Your ad could hang here.', 'SPACE AVAILABLE', 'Book this spot'], fr: ['Votre publicité pourrait être ici.', 'EMPLACEMENT LIBRE', 'Réservez cet emplacement'], es: ['Tu publicidad podría estar aquí.', 'ESPACIO LIBRE', 'Reserva este lugar'], pt: ['Sua publicidade pode estar aqui.', 'ESPAÇO LIVRE', 'Reserve este lugar'], it: ['La tua pubblicità può stare qui.', 'SPAZIO LIBERO', 'Prenota questo spazio'], nl: ['Hier kan jouw reclame hangen.', 'RUIMTE VRIJ', 'Boek deze plek'], tr: ['Reklamın burada olabilir.', 'ALAN BOŞ', 'Bu yeri ayırt'], ru: ['Здесь может быть ваша реклама.', 'МЕСТО СВОБОДНО', 'Забронируйте это место'], pl: ['Tu może wisieć Twoja reklama.', 'MIEJSCE WOLNE', 'Zarezerwuj to miejsce'], ar: ['يمكن أن يكون إعلانك هنا.', 'مساحة متاحة', 'احجز هذا المكان'], ja: ['ここにあなたの広告を。', '広告枠 空きあり', 'この場所を予約'], zh: ['您的广告可以放在这里。', '广告位招租', '预订此位置'], ko: ['여기에 광고를 걸 수 있습니다.', '광고 공간 있음', '이 자리 예약하기'], hi: ['आपका विज्ञापन यहाँ लग सकता है।', 'जगह खाली', 'यह जगह बुक करें'],
};
const SCHRIFT = '"Inter Tight","Helvetica Neue",Helvetica,Arial,"Noto Sans","Hiragino Sans","PingFang SC","Apple SD Gothic Neo","Noto Sans CJK SC","Geeza Pro","Noto Sans Arabic","Kohinoor Devanagari","Noto Sans Devanagari",sans-serif';

// Zeilen so groß wie möglich in den Kasten
function umbruch(c, text, gr, gew, maxB, ohneLeer) {
  c.font = `${gew} ${gr}px ${SCHRIFT}`; const teile = ohneLeer ? [...text] : text.split(' '), z = []; let l = '';
  for (const t of teile) { const n = l ? (ohneLeer ? l + t : l + ' ' + t) : t; if (c.measureText(n).width > maxB && l) { z.push(l); l = t; } else l = n; }
  if (l) z.push(l); return z;
}
function passend(c, text, maxB, maxH, gew, ohneLeer, lh = 0.98) {
  for (let gr = maxH; gr > 8; gr *= 0.94) { const z = umbruch(c, text, gr, gew, maxB, ohneLeer); if (z.length * gr * lh <= maxH && z.every(s => c.measureText(s).width <= maxB)) return { gr, z, lh }; }
  return { gr: 10, z: [text], lh };
}
// Ein Plakat. x, y: linke obere Ecke der Zelle. Die Ziffern des Codes zeichnet der Shader je Fläche in das Feld, das diese Funktion zurückgibt (Wunsch Nr. 62)
function plakatMalen(c, x, y, w, h, s, spr, art) {
  const T = TEXTE[spr] || TEXTE.en, S = SCHEMA[s], rtl = spr === 'ar', ohneLeer = spr === 'ja' || spr === 'zh', m = Math.min(w, h) * 0.075, breit = w / h > 2.2, gross = w / h > 0.9;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = S.grund; c.fillRect(x, y, w, h);
  // großer Kreis als Erde, angeschnitten
  c.fillStyle = S.akzent; c.beginPath(); const R = Math.max(w, h) * (breit ? 0.42 : 0.58); c.arc(rtl ? x + w * 0.04 : x + w * 0.96, y + h * (breit ? 0.9 : 1.02), R, 0, 7); c.fill();
  c.textBaseline = 'alphabetic'; c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left'; const tx = rtl ? x + w - m : x + m;
  // Schild oben
  const tagH = h * (breit ? 0.17 : 0.085), tagGr = tagH * 0.62; c.font = `800 ${tagGr}px ${SCHRIFT}`; const tagB = c.measureText(T[1]).width + tagH * 0.9, tagX = rtl ? x + w - m - tagB : x + m, tagY = y + m;
  c.fillStyle = S.tag; c.beginPath(); if (c.roundRect) c.roundRect(tagX, tagY, tagB, tagH, tagH * 0.22); else c.rect(tagX, tagY, tagB, tagH); c.fill(); c.fillStyle = S.tagText; c.fillText(T[1], rtl ? tagX + tagB - tagH * 0.45 : tagX + tagH * 0.45, tagY + tagH * 0.72);
  // Unten: Leiste mit dem Code, darüber der Aufruf. Auf der breiten Dachtafel beides in einer Zeile
  const codeH0 = h * (breit ? 0.17 : 0.085), aufrufH = breit ? 0 : h * 0.056, codeY = y + h - m * 0.8 - codeH0;
  c.direction = 'ltr'; c.textAlign = 'left'; c.font = `800 ${codeH0 * 0.72}px ${SCHRIFT}`; c.fillStyle = S.text; const CODE = 'CODE', labelB = c.measureText(CODE).width, labelX = x + m; c.fillText(CODE, labelX, codeY + codeH0 * 0.8);
  let rechts = x + w - m; if (gross) { c.textAlign = 'right'; c.font = `800 ${codeH0 * 0.62}px ${SCHRIFT}`; c.fillText('EARTH', rechts, codeY + codeH0 * 0.8); rechts -= c.measureText('EARTH').width + m * 0.6; c.textAlign = 'left'; }
  const zx = labelX + labelB + codeH0 * 0.35, zelle = Math.min((rechts - zx) / 15, codeH0 * 0.6), zh = zelle / 0.6, zy = codeY + (codeH0 - zh) * 0.5, feld = { u0: (zx - x) / w, v0: 1 - (zy + zh - y) / h, uw: zelle * 15 / w, vh: zh / h };
  c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left';
  if (aufrufH) { c.font = `600 ${aufrufH * 0.82}px ${SCHRIFT}`; c.fillStyle = S.text; c.fillText(T[2], tx, codeY - m * 0.32); }
  // Hauptsatz
  const oben = tagY + tagH + m * (breit ? 0.42 : 0.7), Hmax = codeY - (aufrufH ? aufrufH + m * 0.55 : m * 0.35) - oben, F = passend(c, T[0], w - 2 * m, Hmax, 800, ohneLeer);
  c.font = `800 ${F.gr}px ${SCHRIFT}`; c.fillStyle = S.text; if (!ohneLeer && !rtl) c.letterSpacing = `${-F.gr * 0.025}px`;
  F.z.forEach((z, i) => c.fillText(z, tx, oben + F.gr * 0.84 + i * F.gr * F.lh)); c.letterSpacing = '0px';
  c.restore(); return feld;
}
// Ziffern 0 bis 9 und Leerzeichen, einmal für alle Plakate
let _ziffern = null;
function ziffern(mobil) { if (_ziffern) return _ziffern; const B = 64, H = 104, cv = document.createElement('canvas'); cv.width = B * 11; cv.height = H; const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, H); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.font = `800 92px "Inter Tight","Helvetica Neue",Helvetica,Arial,sans-serif`; for (let i = 0; i < 10; i++) c.fillText(String(i), B * (i + 0.5), 86); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.anisotropy = mobil ? 4 : 8; t.minFilter = THREE.LinearMipmapLinearFilter; return _ziffern = t; }
// Größe je Zelle des Atlas
const ZELLE = { plakat: [768, 544], quer: [768, 384], hoch: [512, 742], clp: [384, 564], litfass: [512, 590], dach: [1024, 340], pylon: [1024, 597] };
const _atlas = new Map();
function atlas(art, spr, mobil) {
  const k = art + spr + (mobil ? 'm' : ''); if (_atlas.has(k)) return _atlas.get(k);
  const f = mobil ? 0.5 : 1, [zb, zh] = ZELLE[art], w = Math.round(zb * f), h = Math.round(zh * f), cv = document.createElement('canvas'); cv.width = w; cv.height = h * 3; const c = cv.getContext('2d'); let feld = null;
  for (let s = 0; s < 3; s++) feld = plakatMalen(c, 0, s * h, w, h, s, spr, art);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = mobil ? 4 : 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.userData = { feld }; _atlas.set(k, t); return t;
}

// Plakatmaterial: Reihe im Atlas je Instanz, nachts eigenes Licht
const _pm = new Map(), LICHT = { plakat: [0, 0.62], quer: [0, 0.42], hoch: [0, 0.42], clp: [0.06, 0.95], litfass: [0, 0.34], dach: [0, 0.8], pylon: [0.2, 1.05] };
function plakatMaterial(art, spr, mobil) {
  const k = art + spr + (mobil ? 'm' : ''); if (_pm.has(k)) return _pm.get(k);
  const A = atlas(art, spr, mobil), fe = A.userData.feld, U = { uLicht: { value: 0 }, uCodeR: { value: new THREE.Vector4(fe.u0, fe.v0, fe.uw, fe.vh) }, tZiffern: { value: ziffern(mobil) } }, m = new THREE.MeshStandardMaterial({ map: A, roughness: art === 'pylon' ? 0.3 : 0.62, metalness: 0, envMapIntensity: 0.5 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute float aSchema, aCodeA, aCodeB; varying vec2 vPU; varying float vCA, vCB, vSc;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPU = uv; vCA = aCodeA; vCB = aCodeB; vSc = aSchema;\n  vMapUv.y = (vMapUv.y * 0.97 + 0.015 + 2.0 - aSchema) / 3.0;');
    // Code je Fläche: 15 Stellen (3 Ziffern, Lücke, ...), die Ziffern liegen je 6 zur Basis 11 in zwei Zahlen. textureGrad, sonst blitzen an den Zellgrenzen falsche Mipstufen auf
    sh.fragmentShader = 'uniform float uLicht; uniform vec4 uCodeR; uniform sampler2D tZiffern; varying vec2 vPU; varying float vCA, vCB, vSc;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { vec2 gC = (vec2(fract(vPU.x), vPU.y) - uCodeR.xy) / uCodeR.zw;
    if (gC.x > 0.0 && gC.x < 1.0 && gC.y > 0.0 && gC.y < 1.0) { float pC = floor(gC.x * 15.0), gr = floor(pC / 4.0), inn = mod(pC, 4.0), dC = 10.0;
      if (inn < 2.5) { float kC = gr * 3.0 + inn, vC = kC < 5.5 ? vCA : vCB, poC = kC < 5.5 ? kC : kC - 6.0; dC = mod(floor((vC + 0.25) / pow(11.0, 5.0 - poC)), 11.0); }
      vec2 uvD = vec2((dC + fract(gC.x * 15.0)) / 11.0, gC.y), sk = vec2(15.0 / 11.0, 1.0); float aC = textureGrad(tZiffern, uvD, dFdx(vPU / uCodeR.zw) * sk, dFdy(vPU / uCodeR.zw) * sk).r;
      diffuseColor.rgb = mix(diffuseColor.rgb, (vSc > 0.5 && vSc < 1.5) ? vec3(0.98) : vec3(0.017), aC); } }`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uLicht;'); };
  m.customProgramCacheKey = () => 'werbePlakat'; m.userData.U = U; m.userData.licht = LICHT[art]; _pm.set(k, m); return m;
}
const licht = m => { const [a, b] = m.userData.licht; m.userData.U.uLicht.value = a + (b - a) * NACHT.value; };

// ---------- Körper ----------
const box = (b, h, t, x, y, z, hex) => farbig(new THREE.BoxGeometry(b, h, t).translate(x, y, z), hex);
const zyl = (r0, r1, h, x, y, z, hex, n = 16, offen = false) => farbig(new THREE.CylinderGeometry(r0, r1, h, n, 1, offen).translate(x, y, z), hex);
function farbig(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, A = new Float32Array(n * 3); for (let i = 0; i < n; i++) { A[i * 3] = c.r; A[i * 3 + 1] = c.g; A[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(A, 3)); return g.index ? g.toNonIndexed() : g; }
const alle = (...g) => { for (const x of g) { x.deleteAttribute('uv'); } return mergeGeometries(g); };
const KASTEN = '#2c2f33', ALU = '#6d7277', STAHL = '#3a3d40';
// Plakat Geometrien liegen auf z nach vorn. Einheit: Meter, außer bei Banner und Dach (Einheitsquadrat, Maßstab aus der Fläche)
const quad = (b, h, x, y, z, ry = 0) => { const g = new THREE.PlaneGeometry(b, h); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
const BAU = {
  litfass: { plakat: () => { const g = new THREE.CylinderGeometry(0.632, 0.632, 2.4, 28, 1, true).translate(0, 1.55, 0), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2); return g; },
    koerper: () => alle(zyl(0.68, 0.74, 0.18, 0, 0.09, 0, '#4b4e4d', 20), zyl(0.6, 0.6, 2.72, 0, 1.54, 0, '#c9c4b6', 16), zyl(0.71, 0.67, 0.14, 0, 2.86, 0, '#2f3a36', 20), zyl(0.2, 0.7, 0.42, 0, 3.14, 0, '#2f3a36', 20), zyl(0.05, 0.2, 0.2, 0, 3.45, 0, '#2f3a36', 8)), mass: () => 1 },
  plakat: { plakat: () => quad(3.56, 2.52, 0, 2.26, 0.085), koerper: () => alle(box(3.74, 2.7, 0.14, 0, 2.26, 0, KASTEN), box(0.12, 1.0, 0.12, -1.2, 0.5, 0, STAHL), box(0.12, 1.0, 0.12, 1.2, 0.5, 0, STAHL), box(3.74, 0.05, 0.3, 0, 3.72, 0.2, ALU), box(0.26, 0.06, 0.18, -1, 3.72, 0.42, '#d7d3c8'), box(0.26, 0.06, 0.18, 1, 3.72, 0.42, '#d7d3c8')), mass: e => e.b / 3.56 },
  clp: { plakat: () => mergeGeometries([quad(1.19, 1.75, 0, 1.5, 0.111), quad(1.19, 1.75, 0, 1.5, -0.111, Math.PI)]), koerper: () => alle(box(1.34, 1.92, 0.2, 0, 1.5, 0, ALU), box(0.54, 0.54, 0.16, 0, 0.27, 0, STAHL)), mass: () => 1 },
  quer: { plakat: () => quad(1, 1, 0, 0.5, 0), koerper: () => alle(box(1.012, 1.02, 1.1, 0, 0.5, -0.56, '#34363a')), mass: e => [e.b, e.h, 1] },
  hoch: { plakat: () => quad(1, 1, 0, 0.5, 0), koerper: () => alle(box(1.015, 1.012, 1.1, 0, 0.5, -0.56, '#34363a')), mass: e => [e.b, e.h, 1] },
  dach: { plakat: () => quad(1, 1, 0, 0.8, 0.052), koerper: () => alle(box(1.012, 1.03, 0.09, 0, 0.8, 0, KASTEN), ...[-0.36, 0, 0.36].flatMap(x => [box(0.012, 0.3, 0.03, x, 0.15, 0, STAHL), box(0.012, 0.04, 0.42, x, 0.02, -0.2, STAHL), box(0.012, 0.42, 0.012, x, 0.36, -0.28, STAHL).rotateX(0.75).translate(0, 0.02, -0.1)])), mass: e => [e.b, e.h, e.h] },
  pylon: { plakat: () => mergeGeometries([quad(12, 7, 0, 9.6, 0.36), quad(12, 7, 0, 9.6, -0.36, Math.PI)]), koerper: () => alle(box(12.5, 7.5, 0.7, 0, 9.6, 0, '#17191c'), zyl(0.62, 0.75, 6, 0, 3, 0, '#2a2d30', 20), zyl(1.5, 1.7, 0.3, 0, 0.15, 0, '#3a3d40', 20)), mass: e => e.b / 12 },
};
const _geo = new Map(); const geo = (art, teil) => { const k = art + teil; if (!_geo.has(k)) _geo.set(k, BAU[art][teil]()); return _geo.get(k); };
let _koerperMat = null; const koerperMat = () => _koerperMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.08 });

// ---------- Buchungen ----------
let _buchungen = null, _basis = new URL('../', import.meta.url);
export const buchungenLaden = () => _buchungen ??= fetch(new URL('daten/werbung/buchungen.json', _basis)).then(r => r.json()).catch(() => ({ flaechen: [] }));
const texLader = new THREE.TextureLoader(), _motive = new Map();
function motivMaterial(pfad) {
  if (_motive.has(pfad)) return _motive.get(pfad);
  const t = texLader.load(new URL(pfad, _basis).href); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.72, metalness: 0, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, envMapIntensity: 0.4 }); _motive.set(pfad, m); return m;
}
const _hell = m => { m.emissiveIntensity = 0.03 + 0.55 * NACHT.value; };

// Banner am Wahrzeichen: hängt am Modell, sichtbar auch ohne gebauten Ort
export function wahrzeichenBanner(G, id) {
  for (const P of WF_PREMIUM) { if (P.wz !== id) continue;
    buchungenLaden().then(B => { const b = B.flaechen.find(f => f.id === P.id); if (!b?.motiv) return; const m = motivMaterial(b.motiv);
      for (const pl of P.platten) { const q = new THREE.Mesh(new THREE.PlaneGeometry(P.b, P.h), m); q.position.set(pl.x, pl.y + P.h / 2, pl.z); q.rotation.y = pl.ry; q.name = 'banner_' + P.id; q.receiveShadow = true; q.castShadow = false; q.onBeforeRender = () => _hell(m); q.userData.premium = P; G.add(q); } }); }
}

const _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
export class Werbung {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'werbung'; this.liste = []; this.teile = []; this.t = 0; this.wand = null;
    const D = ort.daten.freizeit?.werbung, m = ort.daten.meta; if (!D?.length || m?.lat == null) return;
    const phi = m.lat * D2R, kLa = KLAT(phi), kLo = KLON(phi), iso = m.iso || 'XX', spr = spracheVon(iso), nach = new Map();
    for (const [art, x, z, ry, b, h, y0, pi, zelle] of D) {
      const lat = m.lat - z / kLa, lon = m.lon + x / kLo, P = pi >= 0 ? WF_PREMIUM[pi] : null, id = P?.id || zelle; let n = 0; for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0;
      const e = { id, art, x, z, ry, b, h, y0, lat, lon, iso, name: P?.name || null, stadt: P?.stadt || null, premium: !!P, schema: n % 3 }; this.liste.push(e); if (art === 'wahrzeichen') continue;
      const klasse = art === 'banner' ? (b / h >= 1.2 ? 'quer' : 'hoch') : art; (nach.get(klasse) || nach.set(klasse, []).get(klasse)).push(e);
    }
    for (const [klasse, l] of nach) this.instanzen(klasse, l, spr);
    buchungenLaden().then(B => this.buchungen(B));
  }
  hoeheVon(e) {
    const O = this.ort; if (e.art === 'dach') { const h = O.hausAm?.(e.x, e.z), g = h?.e; return (g ? g.basis : O.H(e.x, e.z)) + e.y0; }
    return O.H(e.x, e.z) + (e.y0 || 0);
  }
  instanzen(klasse, l, spr) {
    const P = geo(klasse, 'plakat').clone(), K = geo(klasse, 'koerper'), A = new Float32Array(l.length), mass = BAU[klasse].mass; P.setAttribute('aSchema', new THREE.InstancedBufferAttribute(A, 1)); const CA = new Float32Array(l.length), CB = new Float32Array(l.length); P.setAttribute('aCodeA', new THREE.InstancedBufferAttribute(CA, 1)); P.setAttribute('aCodeB', new THREE.InstancedBufferAttribute(CB, 1));
    const mp = plakatMaterial(klasse, spr, this.mobil), me = new THREE.InstancedMesh(P, mp, l.length), mk = new THREE.InstancedMesh(K, koerperMat(), l.length);
    l.forEach((e, i) => { const s = mass(e), S = Array.isArray(s) ? s : [s, s, s]; _p.set(e.x, this.hoeheVon(e), e.z); _q.setFromAxisAngle(_Y, e.ry); _s.set(S[0], S[1], S[2]); _M.compose(_p, _q, _s); me.setMatrixAt(i, _M); mk.setMatrixAt(i, _M); A[i] = e.schema; { const d = String(e.id).padEnd(12, ' '); let a = 0, b = 0; for (let k = 0; k < 12; k++) { const z = d[k] === ' ' ? 10 : +d[k]; if (k < 6) a = a * 11 + z; else b = b * 11 + z; } CA[i] = a; CB[i] = b; } e.klasse = klasse; e.i = i; e.me = me; e.mk = mk; e.yW = _p.y; });
    me.instanceMatrix.needsUpdate = mk.instanceMatrix.needsUpdate = true; me.computeBoundingSphere(); mk.computeBoundingSphere(); me.receiveShadow = true; mk.castShadow = !this.mobil; mk.receiveShadow = true; me.name = 'werbe_' + klasse; me.userData.flaechen = l; me.onBeforeRender = () => licht(mp);
    this.gruppe.add(mk, me); this.teile.push(P); if (klasse === 'pylon') this.wand = { attr: P.attributes.aSchema };
  }
  // Gebuchte Flächen: Motiv statt Einladung. Treffer über Kennung oder Lage (bis 8 m), falls sich die Kartendaten leicht verschieben
  buchungen(B) {
    if (this.tot) return; const c = Math.cos((this.ort.daten.meta.lat || 0) * D2R);
    for (const f of B.flaechen) { const e = this.liste.find(e => e.id === f.id || (e.art === f.art && Math.hypot((e.lat - f.lat) * 111132, (e.lon - f.lon) * 111320 * c) < 8)); if (!e) continue; e.buchung = f; if (e.art === 'wahrzeichen' || !f.motiv || !e.me) continue;
      const mi = motivMaterial(f.motiv), g = new THREE.BufferGeometry().copy(geo(e.klasse, 'plakat')); e.me.getMatrixAt(e.i, _M); const q = new THREE.Mesh(g, mi); q.applyMatrix4(_M); q.receiveShadow = true; q.onBeforeRender = () => _hell(mi); q.userData.flaeche = e; e.motivMesh = q; _M.makeScale(0, 0, 0); e.me.setMatrixAt(e.i, _M); e.me.instanceMatrix.needsUpdate = true; this.gruppe.add(q); this.teile.push(g); }
  }
  // Fläche unter einem Strahl (Klick oder Tippen): nur Plakate und Motive, was hinter einem Haus liegt zählt nicht
  treffer(strahl, kamera, maxD = 320) {
    const ziele = this.gruppe.children.filter(o => o.name?.startsWith('werbe_') || o.userData.flaeche); if (!ziele.length) return null; strahl.far = maxD;
    for (const t of strahl.intersectObjects(ziele, false)) { const o = t.object, e = o.userData.flaeche || o.userData.flaechen?.[t.instanceId]; if (!e || (e.motivMesh && o !== e.motivMesh)) continue; if (this.verdeckt(kamera, t.point)) continue; return e; }
    return null;
  }
  verdeckt(kamera, p) { const O = this.ort; if (!O.hausAm) return false; const L = kamera.distanceTo(p), n = Math.floor(L / 5); for (let i = 1; i < n - 1; i++) { const f = i / n, x = kamera.x + (p.x - kamera.x) * f, y = kamera.y + (p.y - kamera.y) * f, z = kamera.z + (p.z - kamera.z) * f, h = O.hausAm(x, z); if (h && y < h.e.basis + h.e.g.h - 0.5 && Math.hypot(p.x - x, p.z - z) > 3.5) return true; } return false; }
  // Nächste Fläche zum Spieler
  naechste(x, z, r = 12) { let best = null, bd = 1; for (const e of this.liste) { const R = e.art === 'wahrzeichen' ? 75 : e.art === 'pylon' ? 26 : e.art === 'banner' || e.art === 'dach' ? 24 : r, d = Math.hypot(e.x - x, e.z - z) / R; if (d < bd) { bd = d; best = e; } } return best; }
  update(dt = 0.016) { if (this.wand && (this.t += dt) > 7) { this.t = 0; const A = this.wand.attr; for (let i = 0; i < A.count; i++) A.array[i] = (A.array[i] + 1) % 3; A.needsUpdate = true; } }
  entsorgen() { this.tot = true; for (const g of this.teile) g.dispose(); for (const o of this.gruppe.children) o.isInstancedMesh && o.dispose(); }
}
