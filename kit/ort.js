// Echter Ort aus OpenStreetMap (Daten aus tools/ort_bauen.py, erster Test 28.10.2026: Potsdamer Platz, 1 km²).
// Boden mit Fahrbahn, Gehwegblöcken mit Bordstein, Plätzen, Grün, Pfaden, Radwegen und Wasser, dazu Markierungen, Überwege,
// Ampeln, Laternen, Bäume (nah volle Bäume, fern einfache) und Stelen. Gebäude in Kacheln von 125 m: fern Kisten mit
// Fassaden aus dem Shader (fernMaterial), nah der Gebäude Generator, Haus für Haus nachgebaut, solange die Kamera nah ist.
import { fotoMaterial } from './ortfoto.js';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBuilding } from './buildings.js';
import { orient, area, edgeNormal, inside } from './geo.js';
import { fernMaterial } from './city.js';
import { texMat, NACHT } from './materials.js';
import { BAEUME, vorlage, blattMitInstanzen } from './trees.js';
import { eingangKante } from './interior.js';

export const BORD = 0.12;          // Gehweg über der Fahrbahn
const KACHEL = 125, UNTEN = -0.3, WASSER = -0.45;

export async function ladeOrt(name) {
  const r = await fetch(new URL(`../assets/orte/${name}.json`, import.meta.url));
  if (!r.ok) throw new Error(`Ort ${name} fehlt`);
  return r.json();
}

// ---------- Zuordnung: OSM Merkmale -> Gebäudetyp des Generators und Fassade für die Ferne ----------
function farbe(f) {
  if (!f) return null;
  const namen = { white: '#f0f0f0', beige: '#d8c8a8', ivory: '#eee8d8', cream: '#eadfc6', grey: '#909090', gray: '#909090', lightgrey: '#c0c0c0', lightgray: '#c0c0c0',
    silver: '#c0c0c0', darkgrey: '#505050', darkgray: '#505050', black: '#202020', brown: '#6b4a32', red: '#9a3a2a', maroon: '#6a2a20', yellow: '#d8c060', sand: '#c8b088' };
  const hex = (namen[f.toLowerCase()] || f).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return { hell: 0.2126 * r + 0.7152 * g + 0.0722 * b, warm: r - b };
}

export function zuordnung(g) {
  if (g.typ) return { typ: g.typ, variant: g.variant, fern: g.fern ?? 2 };   // Orte aus Kacheln (kit/ortbau.js): Typ kommt aus der Bauweise der Region
  const h = g.h - (g.m || 0), b = g.b || 'yes', mat = g.mat, f = farbe(g.farbe), hell = f ? f.hell > 0.5 : null;
  if (b === 'denkmal') return { schlicht: 'denkmal', fern: 5 };
  if (b === 'roof' || b === 'carport') return { schlicht: 'dach', fern: 5 };
  if (h < 4 || ['shed', 'kiosk', 'toilets', 'garage', 'garages', 'hut', 'service', 'transformer_tower'].includes(b)) return { schlicht: 'klein', fern: 5 };
  const wohnen = ['apartments', 'residential', 'house', 'dormitory', 'terrace'].includes(b);
  if (g.jahr && g.jahr < 1945) return h > 26 ? { typ: 'lochfassade', fern: 2 } : { typ: 'altbau', fern: 2 };
  if (mat === 'brick') return h > 20 ? { typ: 'lochfassade', variant: 'ziegel', fern: 3 } : { typ: 'ziegel', fern: 3 };   // Backstein: Lochfassade in Ziegel (Kollhoff Tower)
  if (mat === 'glass') return h > 30 ? { typ: 'glasturm', variant: hell ? 'kante' : undefined, fern: 1 } : { typ: 'band', variant: 'grau', fern: 4 };
  if (mat === 'metal') return hell === false || /gold|bronze|brown|copper/i.test(g.farbe || '') ? { typ: 'kupfer', fern: 3 } : { typ: 'band', variant: 'weiss', fern: 4 };
  if (mat === 'sandstone' || mat === 'stone' || (f && hell && f.warm > 0.12)) return { typ: 'lochfassade', variant: 'stein', fern: 2 };
  if (wohnen) return h > 35 ? { typ: 'wohnturm', fern: 2 } : { typ: 'lochfassade', fern: 2 };
  if (h > 45) return hell === false ? { typ: 'glasturm', fern: 1 } : { typ: 'raster', fern: 0 };
  return hell === false ? { typ: 'band', variant: 'grau', fern: 4 } : { typ: 'band', variant: 'weiss', fern: 4 };
}

// ---------- Geometrie Helfer ----------
function dreieckeOben(pts2, y, pos, uv, idx) {   // Fläche mit Löchern auf Höhe y, Normale nach oben, UV in Metern
  const [aussen, ...loecher] = pts2;
  const k = aussen.map(([x, z]) => new THREE.Vector2(x, z)), h = loecher.map(l => l.map(([x, z]) => new THREE.Vector2(x, z)));
  const tris = THREE.ShapeUtils.triangulateShape(k, h), alle = [...k, ...h.flat()], base = pos.length / 3;
  for (const v of alle) { pos.push(v.x, y, v.y); uv.push(v.x, -v.y); }
  for (const [a, b, c] of tris) {
    const A = alle[a], B = alle[b], C = alle[c], ny = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y);
    if (ny >= 0) idx.push(base + a, base + b, base + c); else idx.push(base + a, base + c, base + b);
  }
}
function flaeche(polys, y) {
  const pos = [], uv = [], idx = [];
  for (const p of polys) if (p[0].length >= 3) dreieckeOben(p, y, pos, uv, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// senkrechtes Rechteck an der Kante a-b von y0 bis y1, Normale n
function wand(pos, nor, uv, a, b, y0, y1, n) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const P = [[a[0], y0, a[1], 0, y0], [b[0], y0, b[1], L, y0], [b[0], y1, b[1], L, y1], [a[0], y1, a[1], 0, y1]];
  const e1 = [b[0] - a[0], 0, b[1] - a[1]], e2 = [0, y1 - y0, 0], cx = e1[1] * e2[2] - e1[2] * e2[1], cz = e1[0] * e2[1] - e1[1] * e2[0];
  const order = cx * n[0] + cz * n[1] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const i of order) { pos.push(P[i][0], P[i][1], P[i][2]); nor.push(n[0], 0, n[1]); uv.push(P[i][3], P[i][4]); }
}
function geoAus(pos, nor, uv, extra) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const k in extra || {}) g.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], 1));
  return g;
}
function mitVersatz(m, f) { m.polygonOffset = true; m.polygonOffsetFactor = f; m.polygonOffsetUnits = f; return m; }

// Gelände (Orte aus Kacheln, kit/ortbau.js): Höhenraster { x0, z0, s, nx, nz, h } relativ zur Mitte, bilinear. Ohne Raster flach.
export function gelaendeFunktion(g) {
  if (!g || !g.h || !g.nx) return () => 0;
  const { x0, z0, s, nx, nz, h } = g;
  return (x, z) => {
    const fx = (x - x0) / s, fz = (z - z0) / s, i = Math.max(0, Math.min(nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j)), o = j * nx + i;
    return (h[o] * (1 - tx) + h[o + 1] * tx) * (1 - tz) + (h[o + nx] * (1 - tx) + h[o + nx + 1] * tx) * tz;
  };
}
// Fläche aufs Gelände legen: Dreiecke an der längsten Kante teilen, bis das Gelände zwischen den Ecken höchstens fehler Meter von der
// Ebene abweicht (geprüft an Kantenmitte und Schwerpunkt) oder keine Kante länger als minL ist, nie länger als maxL. Dann y += H(x, z).
// Seit 29.10.2026 nach Fehler statt fest alle 12 m: am flachen Potsdamer Platz 177.000 statt 30.000 Dreiecke für die Gehwege.
function drapiere(geo, H, maxL = 40, minL = 6, fehler = 0.03) {
  const P = geo.attributes.position, I = geo.index ? geo.index.array : null, n = I ? I.length : P.count, out = [], m2 = maxL * maxL, n2 = minL * minL;
  const teile = (a, b, c, tiefe) => {
    const ab = (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2, bc = (b[0] - c[0]) ** 2 + (b[2] - c[2]) ** 2, ca = (c[0] - a[0]) ** 2 + (c[2] - a[2]) ** 2, mx = Math.max(ab, bc, ca);
    if (mx <= n2 || tiefe > 16) { out.push(a, b, c); return; }
    if (mx <= m2) {
      const ha = H(a[0], a[2]), hb = H(b[0], b[2]), hc = H(c[0], c[2]);
      const [p, q, hp, hq] = mx === ab ? [a, b, ha, hb] : mx === bc ? [b, c, hb, hc] : [c, a, hc, ha];
      const eKante = Math.abs(H((p[0] + q[0]) / 2, (p[2] + q[2]) / 2) - (hp + hq) / 2), eMitte = Math.abs(H((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3) - (ha + hb + hc) / 3);
      if (eKante <= fehler && eMitte <= fehler) { out.push(a, b, c); return; }
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    if (mx === ab) { const m = mid(a, b); teile(a, m, c, tiefe + 1); teile(m, b, c, tiefe + 1); }
    else if (mx === bc) { const m = mid(b, c); teile(a, b, m, tiefe + 1); teile(a, m, c, tiefe + 1); }
    else { const m = mid(c, a); teile(a, b, m, tiefe + 1); teile(m, b, c, tiefe + 1); }
  };
  for (let k = 0; k < n; k += 3) { const v = j => { const i = I ? I[k + j] : k + j; return [P.getX(i), P.getY(i), P.getZ(i)]; }; teile(v(0), v(1), v(2), 0); }
  const pos = new Float32Array(out.length * 3), uv = new Float32Array(out.length * 2);
  out.forEach((p, i) => { pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1] + H(p[0], p[2]); pos[i * 3 + 2] = p[2]; uv[i * 2] = p[0]; uv[i * 2 + 1] = -p[2]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}
const hebe = (arr, H) => { for (let i = 0; i < arr.length; i += 3) arr[i + 1] += H(arr[i], arr[i + 2]); return arr; };

// Kisten mit Fassade aus dem Shader: Wände plus Dach je Grundriss, Typ als Attribut
function fernGeo(liste) {
  const pos = [], nor = [], typ = [];
  for (const { pts, y0, y1, t } of liste) {
    const n0 = pos.length;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; wand(pos, nor, [], a, b, y0, y1, edgeNormal(a, b)); }
    const p2 = [], u2 = [], i2 = [];
    dreieckeOben([pts], y1, p2, u2, i2);
    for (const k of i2) { pos.push(p2[k * 3], p2[k * 3 + 1], p2[k * 3 + 2]); nor.push(0, 1, 0); }
    for (let k = n0 / 3; k < pos.length / 3; k++) typ.push(t);
  }
  return geoAus(pos, nor, null, { aTyp: typ });
}

// je Material eine Geometrie (wie vereine in app.js), Glas und Kleinteile ohne Schatten
function zusammen(gruppen, waende, tueren = null) {
  const jeMat = new Map(), blaetter = [];
  for (const h of gruppen) {
    h.updateMatrixWorld(true);
    const t = tueren ? h.getObjectByName('tuerblatt') : null;
    if (t) { t.userData.id = h.userData.id; blaetter.push(t); }
    h.traverse(o => {
      if (!o.isMesh) return;
      if (t) { let p = o; while (p && p !== h) { if (p === t) return; p = p.parent; } }   // Haustür bleibt ein eigenes Objekt (dreht sich, kit/interior.js)
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!jeMat.has(o.material)) jeMat.set(o.material, []);
      jeMat.get(o.material).push(geo.index ? geo.toNonIndexed() : geo);
    });
  }
  const g = new THREE.Group();
  for (const [mat, geos] of jeMat) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = !!waende && waende.has(mat); m.receiveShadow = true; g.add(m);   // nur Wände werfen Schatten, wie in der Stadt (Handy: keine)
    geos.forEach(x => x.dispose());
  }
  g.userData.tueren = [];
  for (const t of blaetter) { const M = t.matrixWorld.clone(); g.add(t); M.decompose(t.position, t.quaternion, t.scale); tueren.set(t.userData.id, t); g.userData.tueren.push(t.userData.id); }
  return g;
}

// einfacher Baum für die Ferne: Stamm und Krone, Höhe 1, Farben als Vertexfarben
function fernBaum(nadel) {
  const stamm = new THREE.CylinderGeometry(0.025, 0.04, 0.4, 5); stamm.translate(0, 0.2, 0);
  // Krone mit 20 Flächen, aber weich schattiert (gemeinsame Punkte), damit sie aus der Ferne rund wirkt
  let krone = nadel ? new THREE.ConeGeometry(0.2, 0.75, 7) : new THREE.IcosahedronGeometry(0.3, 0);
  if (!nadel) { krone.deleteAttribute('uv'); krone = mergeVertices(krone); krone.scale(1, 1.1, 1); }
  krone.computeVertexNormals(); krone.translate(0, nadel ? 0.6 : 0.64, 0);
  const farbig = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); const col = new THREE.Color(c); for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  stamm.deleteAttribute('uv'); krone.deleteAttribute('uv');
  const g = mergeGeometries([farbig(stamm, 0x4a3b2c), farbig(krone, nadel ? 0x2f4632 : 0x48603a)]);
  return g;
}

// Impostor: der volle EZ-Tree wird einmal von der Seite in ein Bild gerendert (nur Umgebungslicht, also seine echte Farbe),
// in der Ferne stehen zwei gekreuzte Flächen mit diesem Bild. Sieht aus wie der Baum, kostet 4 Dreiecke.
const IMPOSTOR = new Map();   // je Baumart einmal gerendert (seit 29.10.2026: jeder neue Ort kostete sonst rund 100 ms)
function impostorBaum(renderer, v, n, art = null) {
  const fertig = art && IMPOSTOR.get(art);
  if (fertig) { const im = new THREE.InstancedMesh(fertig.geo, fertig.mat, n); im.userData.impostor = fertig.hoehe; im.userData.geteilt = true; return im; }
  const box = new THREE.Box3().setFromObject(v.tree), gr = box.getSize(new THREE.Vector3());
  const breite = Math.max(gr.x, gr.z), hoehe = gr.y, B = 256, Hp = Math.round(B * Math.min(2, hoehe / breite));
  const rt = new THREE.WebGLRenderTarget(B, Hp, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const szene = new THREE.Scene();
  szene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.85), new THREE.DirectionalLight(0xfff4e0, 1.2).translateX(3).translateY(6).translateZ(8));
  for (const src of [v.tree.branchesMesh, v.tree.leavesMesh]) szene.add(new THREE.Mesh(src.geometry, src.material));
  const cx = (box.min.x + box.max.x) / 2;
  const cam = new THREE.OrthographicCamera(-breite / 2, breite / 2, hoehe, 0, -100, 100); cam.position.set(cx, box.min.y, 50); cam.lookAt(cx, box.min.y, 0);
  const alt = renderer.getRenderTarget(), farbe = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(szene, cam);
  renderer.setRenderTarget(alt); renderer.setClearColor(farbe, alpha);
  const ebene = w => { const g = new THREE.PlaneGeometry(breite, hoehe); g.translate(0, hoehe / 2, 0); if (w) g.rotateY(Math.PI / 2); return g.toNonIndexed(); };
  const geo = mergeGeometries([ebene(false), ebene(true)]);
  const mat = new THREE.MeshStandardMaterial({ map: rt.texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.userData.impostor = hoehe;   // Skalierung je Baum: gewünschte Höhe / Höhe der Vorlage
  if (art) { IMPOSTOR.set(art, { geo, mat, hoehe, rt }); im.userData.geteilt = true; } else im.userData.rt = rt;   // geteilt: bleibt für den nächsten Ort
  return im;
}

// Baumbilder für die Erde außerhalb gebauter Orte (kit/erdwelt.js, Bäume der Kisten Kacheln): dieselben Bilder wie die fernen Bäume im Ort, dunkler
export function baumImpostor(renderer, id, n) {
  const key = id + ':erde', def = BAEUME.find(b => b.id === id), v = IMPOSTOR.has(key) ? null : vorlage(def, def.seed, true);
  const im = impostorBaum(renderer, v, n, key);
  if (im.material.isMeshStandardMaterial) { im.material.color.setRGB(0.4, 0.43, 0.38); im.material.envMapIntensity = 0.4; }
  return im;
}

export class Ort {
  constructor(daten, mats, { mobil = false, renderer = null, tief = null, spaeter = false, wasserMat = null, foto = null } = {}) {
    this.daten = daten; this.mats = mats; this.mobil = mobil; this.renderer = renderer;
    this.H = gelaendeFunktion(daten.gelaende); this.mitGelaende = !!(daten.gelaende && daten.gelaende.nx) && (daten.meta.relief || 0) > 0.15;
    this.gruppe = new THREE.Group();
    this.nahVoll = mobil ? 0 : 75;        // bis hier (Abstand zum Viertel) Häuser in voller Tiefe (Laibungen, Rahmen, Sprossen) wie an der Kreuzung
    this.nahMittel = mobil ? 75 : 210;    // bis hier die leichte Fassung des Generators, dahinter Kisten mit Shader Fassade
    this.waende = new Set(['putz', 'putzSand', 'putzGrau', 'sandstein', 'ziegel', 'beton', 'platten', 'kupfer', 'weiss', 'glasDunkel', 'granit', 'schiefer', 'technikDunkel', 'sichtbeton'].map(k => mats[k]).filter(Boolean));
    this.baumNah = mobil ? 40 : 70;       // bis hier volle Bäume (Abstand mit Höhe), dahinter Impostor (seit 28.10.2026 nachts enger: 160 m kosteten 160.000 Dreiecke)
    this.instanzen = [];                  // Stadtmöbel, Laternen, Ampeln, Baumscheiben: Instanzen nur im Umkreis (instanzenVerteilen)
    this.halb = daten.meta.groesse / 2;
    this.unten = this.mitGelaende ? Math.min(UNTEN, (daten.gelaende.hMin ?? 0) - 0.6) : UNTEN;   // Höhe der Bodenplatte unter dem Ort (ortSzene)
    if (tief) this.unten = Math.min(this.unten, (daten.gelaende?.hMin ?? 0) - tief);   // auf der Kugel: Schürze bis tief unter den Rand, gegen Spalten zum Gelände
    const M = this.m = {
      strasse: mats.asphalt, block: mats.gehweg, bord: mats.granit,
      platz: mitVersatz(texMat('gehweg_platten', { tint: 0x8a857d, normal: 0.7, staerke: 0.6 }), -1),   // so grau wie die Gehwege an der Kreuzung
      gruen: mitVersatz(texMat('dach_kies', { tint: 0x56703f, normal: 0.6, staerke: 0.55 }), -1),
      sand: mitVersatz(texMat('dach_kies', { tint: 0xd9c49a, normal: 0.35, staerke: 0.4 }), -1),
      pfad: mitVersatz(texMat('gehweg_platten', { tint: 0x9d978d, normal: 0.6, staerke: 0.5 }), -2),
      rad: mitVersatz(texMat('asphalt', { tint: 0x86493d, normal: 0.6, staerke: 0.45 }), -2),
      wasser: wasserMat || new THREE.MeshStandardMaterial({ color: 0x08202a, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.3 }),   // auf der Erde der Shader des Meeres (kit/erde.js wasserMaterial), sonst dunkel mit Spiegelung
      stele: new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 0.9 }),
      mast: mats.technikDunkel,
      beton: mats.sichtbeton || mats.beton, dach: mats.technik,
    };
    // Erde: Grün, Sand, Plätze und die Flächen zwischen den Straßen zeigen das Satellitenbild (kit/ortfoto.js), Straßen und Wege bleiben gebaut
    this.fotoMats = foto ? [M.block = fotoMaterial(M.block, foto, 0.78), M.gruen = fotoMaterial(M.gruen, foto, 0.92), M.sand = fotoMaterial(M.sand, foto, 0.85), M.platz = fotoMaterial(M.platz, foto, 0.4),
      M.pfad = fotoMaterial(M.pfad, foto, 0.55)] : [];   // Feld und Waldwege halb Foto (vorher hell wie Kreidestriche)
    this.zeiten = {};
    if (!spaeter) { const z = this.zeiten; let t = performance.now(); const mess = (name, f) => { f(); const j = performance.now(); z[name] = Math.round(j - t); t = j; };
      mess('boden', () => this.boden()); mess('markierungen', () => this.markierungen()); mess('stelen', () => this.stelen());
      mess('ausstattung', () => this.ausstattung()); mess('baeume', () => this.baeume()); mess('gebaeude', () => this.gebaeude()); }
  }
  // in Scheiben bauen (Erde): nach jedem Schritt und alle paar hundert Häuser eine Pause (warte), Zeiten ohne Pausen
  async bauen(warte) {
    const z = this.zeiten; let t = performance.now();
    const log = (n, a) => { if (globalThis.__messen) (globalThis.__bauLog ||= []).push([n, Math.round(a), Math.round(performance.now() - a)]); };   // Messprotokoll der Scheiben (tools/fahr_weit.mjs)
    const schritt = async (name, f) => { const a = performance.now(); f(); z[name] = (z[name] || 0) + Math.round(performance.now() - a); log(name, a); await warte(); };
    for (let i = 0, gen = this.bodenSchritte(); ; i++) { const a = performance.now(), r = gen.next(); z.boden = (z.boden || 0) + Math.round(performance.now() - a); log('boden' + i, a); if (r.done) break; await warte(); }
    await schritt('markierungen', () => { this.markierungen(); this.stelen(); });
    await schritt('ausstattung', () => this.ausstattung()); await schritt('baeume', () => this.baeume());
    const gen = this.gebaeudeSchritte(); let fertig = false;
    while (!fertig) { const a = performance.now(); fertig = gen.next().done; z.gebaeude = (z.gebaeude || 0) + Math.round(performance.now() - a); log('gebaeude', a); if (!fertig) await warte(); }
    return this;
  }

  // Ort freigeben (Erde Ansicht, Ortswechsel): Geometrien, Instanzpuffer, Bilder der Baum Impostoren. Gemeinsame Materialien bleiben.
  entsorgen() {
    this.gruppe.traverse(o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !o.userData.geteilt) o.geometry.dispose();
      if (o.userData.rt) { o.userData.rt.dispose(); o.material.dispose(); }
    });
    this.gruppe.removeFromParent(); this.kacheln?.clear?.(); this.warteschlange = [];
    for (const m of this.fotoMats) m.dispose();
  }

  // ---------- Boden ----------
  boden() { for (const _ of this.bodenSchritte()); }
  *bodenSchritte() {   // Haltepunkte zwischen den Flächen (Bau in Scheiben, Tokio: Boden in einem Stück 110 ms)
    const D = this.daten, M = this.m, H = this.halb, ist = (x) => Math.abs(Math.abs(x) - H) < 0.05;
    const add = (geo, mat, schatten = true) => { if (this.mitGelaende && !geo.userData.gehoben) geo = drapiere(geo, this.H); const m = new THREE.Mesh(geo, mat); m.receiveShadow = schatten; this.gruppe.add(m); return m; };
    add(flaeche(D.strasse, 0), M.strasse); yield;
    add(flaeche(D.bloecke, BORD), M.block); yield;
    add(flaeche(D.plaetze, BORD), M.platz);
    add(flaeche(D.gruen, BORD), M.gruen);
    if (D.sand?.length) add(flaeche(D.sand, BORD), M.sand);
    add(flaeche(D.pfade, BORD), M.pfad);
    add(flaeche(D.radwege, BORD), M.rad);
    if (D.wasser.length) add(flaeche(D.wasser, WASSER), M.wasser);
    yield;
    // Bordsteine, Kaimauern am Wasser, Schürze am Rand des Ausschnitts
    const wasserIn = (x, z) => D.wasser.some(w => inside(w[0], x, z) && !w.slice(1).some(l => inside(l, x, z)));
    const pos = [], nor = [], uv = [], oben = [], onor = [], ouv = [], rpos = [], rnor = [], ruv = [];
    const SOCKEL = -1000;   // Schürze am Rand: unten bis zur Bodenplatte (mit Gelände tiefer als der tiefste Punkt), oben aufs Gelände
    let tS = performance.now();   // Bau in Scheiben: spätestens nach 10 ms eine Pause (Bordsteine einer großen Stadt brauchten 53 ms am Stück)
    const ringe = function* (polys, istBlock) {
      for (const [aussen, ...loecher] of polys) {
        if (performance.now() - tS > 10) { yield; tS = performance.now(); }
        for (const r of [orient(aussen), ...loecher.map(l => orient(l).reverse())]) {
          for (let i = 0; i < r.length; i++) {
            const a = r[i], b = r[(i + 1) % r.length], n = edgeNormal(a, b);
            const randX = ist(a[0]) && ist(b[0]) && Math.abs(a[0] - b[0]) < 0.05, randZ = ist(a[1]) && ist(b[1]) && Math.abs(a[1] - b[1]) < 0.05;
            const y1 = istBlock ? BORD : 0;
            if (randX || randZ) { wand(rpos, rnor, ruv, a, b, SOCKEL, y1, n); continue; }
            if (!istBlock) continue;
            const mx = (a[0] + b[0]) / 2 + n[0] * 0.6, mz = (a[1] + b[1]) / 2 + n[1] * 0.6;
            if (D.wasser.length && wasserIn(mx, mz)) { wand(pos, nor, uv, a, b, WASSER - 0.2, BORD, n); continue; }
            wand(pos, nor, uv, a, b, 0, BORD, n);
            // Bordsteinkante oben: 25 cm Granit
            const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (L > 0.3) {
              const ai = [a[0] - n[0] * 0.25, a[1] - n[1] * 0.25], bi = [b[0] - n[0] * 0.25, b[1] - n[1] * 0.25];
              for (const q of [a, b, bi, a, bi, ai]) { oben.push(q[0], BORD + 0.002, q[1]); onor.push(0, 1, 0); ouv.push(q[0], q[1]); }
            }
          }
        }
      }
    };
    yield* ringe(D.bloecke, true); yield* ringe(D.strasse, false);
    yield;
    if (this.mitGelaende) { hebe(pos, this.H); yield; hebe(oben, this.H); }
    for (let i = 0; i < rpos.length; i += 3) { const x = rpos[i], z = rpos[i + 2]; rpos[i + 1] = rpos[i + 1] < SOCKEL + 1 ? this.unten : rpos[i + 1] + (this.mitGelaende ? this.H(x, z) : 0); }
    const bordGeo = geoAus(pos.concat(rpos), nor.concat(rnor), uv.concat(ruv)); bordGeo.userData.gehoben = true; add(bordGeo, M.bord);
    const kante = geoAus(oben, onor, ouv); kante.userData.gehoben = true;
    // Dreiecke der Kante nach oben drehen
    const p = kante.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      const ny = (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i]) - (p[i + 3] - p[i]) * (p[i + 8] - p[i + 2]);
      if (ny < 0) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
    }
    add(kante, mitVersatz(texMat('granit', { tint: 0x96938d, normal: 0.6, staerke: 0.5 }), -3));
  }

  // ---------- Markierungen: Leitlinien 3 m Strich, 6 m Lücke; Zebrastreifen; Furten an Ampeln ----------
  markierungen() {
    const D = this.daten, pos = [], y = 0.013;
    const quad = (cx, cz, ux, uz, l, b) => {   // Rechteck mit Mitte, Richtung u, Länge l, Breite b
      const vx = -uz, vz = ux, A = [cx - ux * l / 2 - vx * b / 2, cz - uz * l / 2 - vz * b / 2], B = [cx + ux * l / 2 - vx * b / 2, cz + uz * l / 2 - vz * b / 2],
        C = [cx + ux * l / 2 + vx * b / 2, cz + uz * l / 2 + vz * b / 2], Dd = [cx - ux * l / 2 + vx * b / 2, cz - uz * l / 2 + vz * b / 2];
      for (const q of [A, C, B, A, Dd, C]) pos.push(q[0], y, q[1]);
    };
    for (const l of D.linien) {
      let rest = 0, an = true;   // Strich und Lücke laufen über Knicke weiter
      for (let i = 0; i < l.p.length - 1; i++) {
        const [ax, az] = l.p[i], [bx, bz] = l.p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
        const ux = (bx - ax) / L, uz = (bz - az) / L;
        let s = 0;
        while (s < L) {
          const lang = (an ? 3 : 6) - rest, e = Math.min(L, s + lang);
          if (an && e - s > 0.2) quad(ax + ux * (s + e) / 2, az + uz * (s + e) / 2, ux, uz, e - s, l.art === 'mitte' ? 0.15 : 0.12);
          if (e - s < lang) { rest += e - s; break; }
          rest = 0; an = !an; s = e;
        }
      }
    }
    for (const q of D.querungen) {
      const [[ax, az], [bx, bz]] = q.p, L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, vx = -uz, vz = ux;
      if (q.art === 'zebra') for (let s = 0.6; s < L - 0.3; s += 1.0) quad(ax + ux * s, az + uz * s, vx, vz, 4, 0.5);
      else for (const o of [-2, 2]) for (let s = 0.4; s < L - 0.2; s += 0.75) quad(ax + ux * s + vx * o, az + uz * s + vz * o, ux, uz, 0.5, 0.12);
    }
    if (this.mitGelaende) hebe(pos, this.H);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const m = new THREE.Mesh(g, this.mats.markierung); m.receiveShadow = true; this.gruppe.add(m);
  }

  // ---------- Stelen: schlichte Betonblöcke wie im Original (Maße und Höhe aus den Daten) ----------
  stelen() {
    const S = this.daten.stelen; if (!S.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, this.m.stele, S.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    S.forEach(([x, z, l, b, a, h], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, BORD, z), Q.setFromAxisAngle(Y, -a), new THREE.Vector3(l, h, b))));
    im.castShadow = !this.mobil; im.receiveShadow = true; im.computeBoundingSphere();
    this.gruppe.add(im);
  }

  // ---------- Laternen (nachts hell) und Ampeln ----------
  ausstattung() {
    const D = this.daten, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), E = new THREE.Vector3(1, 1, 1);
    const mast = new THREE.CylinderGeometry(0.06, 0.09, 6, 6); mast.translate(0, 3, 0);
    const kopf = new THREE.CylinderGeometry(0.28, 0.12, 0.25, 8); kopf.translate(0, 6.05, 0);
    const licht = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, emissive: 0xffd9a0, emissiveIntensity: 0 });
    licht.onBeforeCompile = sh => { sh.uniforms.uNacht = NACHT; sh.fragmentShader = 'uniform float uNacht;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vec3( 1.0, 0.85, 0.62 ) * uNacht * 3.0;'); };
    licht.customProgramCacheKey = () => 'laterne';
    // radius: nur Instanzen im Umkreis der Kamera werden gesetzt (instanzenVerteilen), so zählen 1.000 Radbügel nicht im ganzen Bild
    const f = this.mobil ? 0.62 : 1;
    const viele = (geo, mat, punkte, schatten, radius = 320) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, punkte.length));
      punkte.forEach(([x, z, ry = 0], i) => im.setMatrixAt(i, M.compose(new THREE.Vector3(x, BORD, z), Q.setFromAxisAngle(Y, ry), E)));
      im.castShadow = schatten; im.computeBoundingSphere(); im.frustumCulled = false; this.gruppe.add(im);
      this.instanzen.push({ im, punkte, r2: (radius * f) ** 2, y: BORD });
      return im;
    };
    viele(mast, this.m.mast, D.laternen, !this.mobil, 320);
    viele(kopf, licht, D.laternen, false, 320);
    const amast = new THREE.CylinderGeometry(0.07, 0.08, 3.4, 6); amast.translate(0, 1.7, 0);
    const akopf = new THREE.BoxGeometry(0.32, 0.9, 0.24); akopf.translate(0, 2.75, 0.16);
    viele(mergeGeometries([amast.toNonIndexed(), akopf.toNonIndexed()]), this.m.mast, D.ampeln, !this.mobil, 220);
    this.moebel(viele);
  }
  // Instanzen im Umkreis der Kamera neu setzen (alle 6 m Kamerabewegung): Reihenfolge der Punkte bleibt, nur die Anzahl ändert sich
  instanzenVerteilen(cam) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), E = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
    for (const e of this.instanzen) {
      let n = 0;
      for (const p of e.punkte) {
        if ((p[0] - cam.x) ** 2 + (p[1] - cam.z) ** 2 > e.r2) continue;
        if (e.matrix) e.matrix(p, M); else M.compose(P.set(p[0], e.y + this.H(p[0], p[1]), p[1]), Q.setFromAxisAngle(Y, p[2] || 0), E);
        e.im.setMatrixAt(n++, M);
      }
      e.im.count = n; e.im.visible = n > 0; e.im.instanceMatrix.needsUpdate = true;
    }
  }

  // Stadtmöbel aus den Daten: Bänke (Holz auf Metall), Radbügel (vier je Punkt, entlang des Bordsteins), Papierkörbe,
  // Haltestellen (Mast mit Schild), Poller. Lokal +z zeigt zur Fahrbahn.
  moebel(viele) {
    const D = this.daten.moebel || []; if (!D.length) return;
    const box = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b.toNonIndexed(); };
    const zyl = (r0, r1, h, x, y, z, n = 8) => { const c = new THREE.CylinderGeometry(r0, r1, h, n); c.translate(x, y, z); return c.toNonIndexed(); };
    const holz = this.mats.holz || this.m.dach, metall = this.mats.metall || this.m.mast, dunkel = this.m.mast;
    const art = t => D.filter(m => m[2] === t).map(([x, z, , ry]) => [x, z, ry]);
    const bank = art('bank');
    viele(mergeGeometries([box(1.8, 0.05, 0.42, 0, 0.45, 0.02), box(1.8, 0.36, 0.04, 0, 0.76, -0.2)]), holz, bank, !this.mobil, 120);
    viele(mergeGeometries([box(0.06, 0.45, 0.46, -0.75, 0.225, 0), box(0.06, 0.45, 0.46, 0.75, 0.225, 0), box(0.05, 0.42, 0.05, -0.75, 0.66, -0.2), box(0.05, 0.42, 0.05, 0.75, 0.66, -0.2)]), dunkel, bank, false, 120);
    const buegel = [];
    for (const k of [-1.5, -0.5, 0.5, 1.5]) buegel.push(zyl(0.025, 0.025, 0.8, k - 0.33, 0.4, 0, 6), zyl(0.025, 0.025, 0.8, k + 0.33, 0.4, 0, 6), box(0.71, 0.05, 0.05, k, 0.8, 0));
    viele(mergeGeometries(buegel), metall, art('rad'), false, 90);
    viele(mergeGeometries([zyl(0.04, 0.04, 0.9, 0, 0.45, -0.25, 6), zyl(0.22, 0.2, 0.62, 0, 0.62, 0, 10)]), dunkel, art('korb'), false, 70);
    viele(zyl(0.08, 0.09, 0.9, 0, 0.45, 0, 8), dunkel, art('poller'), false, 70);
    const schild = new THREE.MeshStandardMaterial({ color: 0xd8b224, roughness: 0.5 });
    const halt = art('halt');
    viele(zyl(0.04, 0.04, 2.6, 0, 1.3, 0, 8), metall, halt, !this.mobil, 220);
    viele(mergeGeometries([new THREE.CircleGeometry(0.24, 18).translate(0, 2.45, 0.05).toNonIndexed(), new THREE.CircleGeometry(0.24, 18).rotateY(Math.PI).translate(0, 2.45, 0.03).toNonIndexed()]), schild, halt, false, 220);
  }

  // ---------- Bäume: nah volle EZ-Tree Bäume als Instanzen, fern einfache Bäume ----------
  baeume() {
    const arten = ['esche', 'eiche', 'espe', 'kiefer'];
    this.baumListe = this.daten.baeume.map(([x, z, h, typ], i) => ({ x, z, h, typ: arten.includes(typ) ? typ : 'esche', ry: (i * 2.399) % 6.283 }));
    this.baumArten = arten.map(id => {
      const def = BAEUME.find(b => b.id === id), v = vorlage(def, def.seed, true);
      const n = this.baumListe.filter(b => b.typ === id).length || 1;
      const ast = new THREE.InstancedMesh(v.tree.branchesMesh.geometry, v.tree.branchesMesh.material, n);
      const blatt = new THREE.InstancedMesh(v.tree.leavesMesh.geometry, blattMitInstanzen(v.tree.leavesMesh.material), n);
      const erde = this.fotoMats.length > 0, fern = this.renderer ? impostorBaum(this.renderer, v, n, erde ? id + ':erde' : id) : new THREE.InstancedMesh(fernBaum(id === 'kiefer'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), n);
      // Erde: ferne Bäume dunkler (Kronendach von oben wie im Satellitenbild: gemessen leuchtete ein Wald im Ort 13 mal heller als der Fotowald daneben)
      if (erde && fern.material.isMeshStandardMaterial) { fern.material.color.setRGB(0.4, 0.43, 0.38); fern.material.envMapIntensity = 0.4; }
      ast.userData.geteilt = blatt.userData.geteilt = true;   // Netze der Vorlage gehören allen Orten
      ast.castShadow = !this.mobil; blatt.castShadow = false; fern.castShadow = false;
      for (const m of [ast, blatt, fern]) { m.receiveShadow = true; m.count = 0; m.frustumCulled = false; this.gruppe.add(m); }
      return { id, def, v, ast, blatt, fern };
    });
    this.baumStand = null;
    // Baumscheiben: dunkle Erde mit Granitrand um jeden Straßenbaum auf dem Gehweg (wie an der Kreuzung)
    const mitScheibe = this.daten.baeume.filter(t => t[4] === 1);
    if (mitScheibe.length) {
      const erde = new THREE.PlaneGeometry(1.5, 1.5); erde.rotateX(-Math.PI / 2); erde.translate(0, 0.004, 0);
      const teile = [[0, 0.82, 1.76, 0.12], [0, -0.82, 1.76, 0.12], [0.82, 0, 0.12, 1.52], [-0.82, 0, 0.12, 1.52]].map(([x, z, w, d]) => { const b = new THREE.BoxGeometry(w, 0.07, d); b.translate(x, 0.035, z); return b.toNonIndexed(); });
      const punkte = mitScheibe.map(([x, z], i) => [x, z, (i * 0.7) % 1.57]);
      for (const [geo, mat] of [[erde, mitVersatz(new THREE.MeshStandardMaterial({ color: 0x3b2f25, roughness: 0.98 }), -3)], [mergeGeometries(teile), this.mats.granit]]) {
        const im = new THREE.InstancedMesh(geo, mat, mitScheibe.length);
        im.receiveShadow = true; im.frustumCulled = false; im.count = 0; this.gruppe.add(im);
        this.instanzen.push({ im, punkte, r2: ((this.mobil ? 55 : 90)) ** 2, y: BORD });   // nur im Umkreis (1.000 Scheiben kosteten 48.000 Dreiecke im ganzen Bild)
      }
    }
  }
  baeumeVerteilen(cam) {
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), S = new THREE.Vector3();
    const r2 = this.baumNah * this.baumNah;
    // Erde: von oben zeigt das Satellitenbild den Wald, die fernen Baumbilder schrumpfen zwischen 250 und 380 m Kamerahöhe weich weg
    // (sonst leuchtete der Wald im Ort heller als der Fotowald ringsum)
    const kFern = this.fotoMats.length ? THREE.MathUtils.smoothstep(380 - (cam.y - this.H(cam.x, cam.z)), 0, 130) : 1;
    for (const a of this.baumArten) { a.n = 0; a.f = 0; }
    const art = Object.fromEntries(this.baumArten.map(a => [a.id, a]));
    for (const b of this.baumListe) {
      const a = art[b.typ], nah = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2 + (cam.y - 8) ** 2 < r2;
      P.set(b.x, BORD + this.H(b.x, b.z), b.z); Q.setFromAxisAngle(Y, b.ry);
      if (nah) { const s = a.v.scale * b.h / a.def.hoehe; M.compose(P, Q, S.setScalar(s)); a.ast.setMatrixAt(a.n, M); a.blatt.setMatrixAt(a.n, M); a.n++; }
      else if (kFern > 0.02) { const s = a.fern.userData.impostor ? b.h / a.fern.userData.impostor * kFern : null; M.compose(P, Q, s ? S.setScalar(s) : S.set(b.h * 0.95 * kFern, b.h * kFern, b.h * 0.95 * kFern)); a.fern.setMatrixAt(a.f, M); a.f++; }
    }
    for (const a of this.baumArten) {
      a.ast.count = a.blatt.count = a.n; a.fern.count = a.f;
      for (const m of [a.ast, a.blatt, a.fern]) m.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- Gebäude in Kacheln ----------
  gebaeude() { for (const _ of this.gebaeudeSchritte()); }
  *gebaeudeSchritte() {
    this.kacheln = new Map(); this.warteschlange = []; this.haeuser = []; this.tueren = new Map();
    const fernMat = this.fernMat = fernMaterial({ instanziert: false }), V = KACHEL / 2;
    // Kachel 125 m: Kiste und Schattenproxy. Nahstufen (voll, leicht) je Viertel von 62,5 m (seit 28.10.2026 nachts), damit die volle
    // Stufe nicht bis in die ferne Ecke einer Kachel reicht: halbiert die Dreiecke der vollen Häuser auf Augenhöhe.
    let schritt = 0, tS = performance.now();
    for (const g of this.daten.gebaeude) {
      if (++schritt % 25 === 0 && performance.now() - tS > 10) { yield; tS = performance.now(); }   // Haltepunkt für den Bau in Scheiben (nach Zeit, höchstens rund 10 ms je Bild)
      const pts = orient(g.p); if (Math.abs(area(pts)) < 2) continue;
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const i = Math.floor(cx / KACHEL), j = Math.floor(cz / KACHEL), key = `${i},${j}`;
      if (!this.kacheln.has(key)) {
        const k = { key, x0: i * KACHEL, z0: j * KACHEL, liste: [], kern: false, h: 0, viertel: [] };
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) k.viertel.push({ kachel: k, x0: k.x0 + a * V, z0: k.z0 + b * V, liste: [], stufen: { voll: null, mittel: null }, will: 'fern', h: 0, abstand: 0, fernSeit: 0 });
        this.kacheln.set(key, k);
      }
      // Gelände: Haus steht auf der mittleren Bodenhöhe seines Grundrisses, ein Sockel reicht bis zur tiefsten Ecke
      let basis = 0, tief = 0; if (this.mitGelaende) { const hs = pts.map(([x, zz]) => this.H(x, zz)); basis = hs.reduce((a, b) => a + b, 0) / hs.length; tief = Math.min(...hs); }
      const k = this.kacheln.get(key), z = zuordnung(g), e = { g, pts, z, eingang: null, basis, tief };
      const v = k.viertel[(cx >= k.x0 + V ? 2 : 0) + (cz >= k.z0 + V ? 1 : 0)];
      k.liste.push(e); v.liste.push(e); k.h = Math.max(k.h, g.h); v.h = Math.max(v.h, g.h);
      if (!g.rand) k.kern = true;
      // begehbar (kit/interior.js): Häuser im Kern mit Erdgeschoss bekommen eine Haustür an der Straßenkante
      if (!g.rand && !z.schlicht && (g.m || 0) < 0.5 && g.h >= 4 && g.id) {
        e.eingang = eingangKante(pts, this.daten.bloecke);
        if (e.eingang >= 0) this.haeuser.push({ id: g.id, pts, y0: basis + (g.m || 0), h: g.h - (g.m || 0), typ: z.typ, variant: z.variant, seed: (g.id || 1) % 9973, laeden: !!g.laden, eingang: e.eingang });
        else e.eingang = null;
      }
    }
    let anzahl = 0;
    const schattenMat = new THREE.MeshBasicMaterial();
    for (const k of this.kacheln.values()) {
      if (++schritt % 4 === 0 && performance.now() - tS > 10) { yield; tS = performance.now(); }
      const geo = fernGeo(k.liste.map(({ g, pts, z, basis = 0, tief = 0 }) => ({ pts, y0: z.schlicht === 'dach' ? basis + Math.max(g.m || 0, g.h - 0.5) : (g.m || 0) > 0.5 ? basis + g.m : Math.min(tief, basis) + (g.rand ? UNTEN : -0.3 * (basis - tief > 0.05)), y1: basis + g.h, t: z.fern })));
      k.fern = new THREE.Mesh(geo, fernMat); k.fern.castShadow = false; k.fern.receiveShadow = true;
      // Schattenproxy (seit 28.10.2026 nachts): die Baumasse jeder Kachel wirft den Schatten, egal welche Stufe sichtbar ist. Liegt auf
      // Ebene 1, die nur die Schattenkamera sieht (app.js). So zählt der Schattendurchgang 12 Dreiecke je Haus statt der vollen Fassade.
      k.schatten = new THREE.Mesh(geo, schattenMat); k.schatten.castShadow = true; k.schatten.layers.set(1);
      this.gruppe.add(k.fern, k.schatten); anzahl += k.liste.length;
    }
    this.anzahl = anzahl;
  }

  // ein Haus mit dem Generator (oder schlicht, wenn es kein Haus mit Fenstern ist)
  haus({ g, pts, z, eingang = null, basis = 0, tief = 0 }, leicht) {
    const h = g.h - (g.m || 0);
    if (z.schlicht) {
      const y0 = z.schlicht === 'dach' ? Math.max(g.m || 0, g.h - 0.5) : (g.m || 0);
      const mesh = new THREE.Mesh(fernGeoSchlicht(pts, basis + y0, basis + g.h), z.schlicht === 'dach' ? this.m.dach : this.m.beton);
      return mesh;
    }
    const seed = (g.id || 1) % 9973;
    const b = buildBuilding(this.mats, { pts, height: h, type: z.typ, variant: z.variant, seed, ohneLaden: (g.m || 0) > 0.5, laeden: !!g.laden, leicht, eingang });
    b.userData.id = g.id;
    let kaputt = false;
    b.traverse(o => { if (o.isMesh && !kaputt) { const a = o.geometry.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (!Number.isFinite(a[i] + a[i + 1] + a[i + 2])) { kaputt = true; break; } } });
    if (kaputt) return new THREE.Mesh(fernGeoSchlicht(pts, g.m || 0, g.h), this.mats.putzGrau || this.m.beton);   // Grundriss, mit dem der Generator nicht klarkommt
    b.position.y = basis + (g.m || 0);
    if (basis - tief > 0.2 && (g.m || 0) < 0.5) { const sockel = new THREE.Mesh(fernGeoSchlicht(pts, tief - basis - 0.3, 0.02), this.mats.sandstein || this.m.beton); sockel.name = 'sockel'; b.add(sockel); }   // Hanglage: Sockel bis zur tiefsten Ecke
    return b;
  }

  // Kacheln nach Abstand zur Kamera in drei Stufen (voll, mittel, fern) umschalten und nahe Kacheln Haus für Haus bauen
  // (höchstens rund 8 ms je Bild). Solange eine Stufe noch gebaut wird, bleibt die nächstbeste sichtbar, damit nichts aufploppt.
  update(cam) {
    if (!this.baumStand || this.baumStand.distanceToSquared(cam.position) > 36) { this.baumStand = cam.position.clone(); this.baeumeVerteilen(cam.position); this.instanzenVerteilen(cam.position); }
    const p = cam.position, N = this.nahVoll, M = this.nahMittel, V = KACHEL / 2, jetzt = performance.now();
    for (const k of this.kacheln.values()) {
      if (!k.kern) continue;
      let nah = false;
      for (const v of k.viertel) {
        const dx = Math.max(v.x0 - p.x, 0, p.x - (v.x0 + V)), dz = Math.max(v.z0 - p.z, 0, p.z - (v.z0 + V)), dy = Math.max(0, p.y - v.h);
        const d = v.abstand = Math.hypot(dx, dz, dy);
        let will = d < N ? 'voll' : d < M ? 'mittel' : 'fern';
        if (v.will === 'voll' && will !== 'voll' && d < N + 25) will = 'voll';          // erst 25 m weiter zurückschalten
        if (v.will === 'mittel' && will === 'fern' && d < M + 25) will = 'mittel';
        v.will = will; if (will !== 'fern') nah = true;
      }
      // ist ein Viertel nah, bekommt die ganze Kachel mindestens die leichte Stufe (die Kiste gilt nur für die ganze Kachel)
      if (nah) for (const v of k.viertel) if (v.will === 'fern') v.will = 'mittel';
      for (const v of k.viertel) {
        if (v.will !== 'fern') {
          v.fernSeit = 0;
          if (!v.stufen[v.will] && v.liste.length && !this.warteschlange.some(w => w.v === v && w.stufe === v.will)) this.warteschlange.push({ v, stufe: v.will, i: 0, teile: [] });
        } else if (v.stufen.voll || v.stufen.mittel) {   // lange fern: Stufen freigeben (Speicher, wichtig für den Globus)
          v.fernSeit ||= jetzt;
          if (jetzt - v.fernSeit > 45000) for (const s of ['voll', 'mittel']) { const g = v.stufen[s]; if (!g) continue; g.traverse(o => o.geometry?.dispose()); this.gruppe.remove(g); v.stufen[s] = null; for (const id of g.userData.tueren || []) this.tueren.delete(id); }
        }
      }
      this.zeige(k);
    }
    this.warteschlange = this.warteschlange.filter(w => w.v.will !== 'fern' && !(w.stufe === 'voll' && w.v.will !== 'voll'));
    if (!this.warteschlange.length) return;
    this.warteschlange.sort((a, b) => a.v.abstand - b.v.abstand);
    const t0 = performance.now();
    while (this.warteschlange.length && performance.now() - t0 < 8) {
      const w = this.warteschlange[0];
      if (w.i < w.v.liste.length) { w.teile.push(this.haus(w.v.liste[w.i], w.stufe === 'mittel')); w.i++; continue; }
      const g = zusammen(w.teile, null, w.stufe === 'voll' ? this.tueren : null);   // Schatten kommt vom Proxy der Kachel (gebaeude); Haustüren nur in der vollen Stufe beweglich
      w.v.stufen[w.stufe] = g; g.visible = false; this.gruppe.add(g); this.warteschlange.shift(); this.zeige(w.v.kachel);
    }
  }
  // Kiste bleibt sichtbar, bis jedes Viertel mit Häusern eine Stufe hat (sonst stünden Kiste und Haus übereinander)
  zeige(k) {
    const alleFern = k.viertel.every(v => v.will === 'fern');
    const fertig = !alleFern && k.viertel.every(v => !v.liste.length || v.stufen.voll || v.stufen.mittel);
    for (const v of k.viertel) {
      const vo = v.stufen.voll, mi = v.stufen.mittel;
      const sicht = !fertig ? null : v.will === 'voll' ? (vo || mi) : (mi || vo);
      if (vo) vo.visible = sicht === vo;
      if (mi) mi.visible = sicht === mi;
    }
    k.fern.visible = !fertig;
  }

  // steht der Punkt in einem Gebäude? (für Kamerapunkte auf Augenhöhe)
  frei(x, z) { return !this.daten.gebaeude.some(g => !g.rand && g.m < 2 && g.b !== 'roof' && g.b !== 'carport' && inside(g.p, x, z)); }   // unter Dächern kann man stehen

  info() {
    const D = this.daten, kern = D.gebaeude.filter(g => !g.rand).length;
    return { gebaeude: kern, rand: D.gebaeude.length - kern, stelen: D.stelen.length, baeume: D.baeume.length, laternen: D.laternen.length, ampeln: D.ampeln.length,
      querungen: D.querungen.length, wegeKnoten: D.wege.knoten.length, moebel: (D.moebel || []).length, laeden: D.gebaeude.filter(g => g.laden).length,
      vollViertel: [...this.kacheln.values()].flatMap(k => k.viertel).filter(v => v.stufen.voll?.visible).length, leichtViertel: [...this.kacheln.values()].flatMap(k => k.viertel).filter(v => v.stufen.mittel?.visible).length };
  }
}

function fernGeoSchlicht(pts, y0, y1) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; wand(pos, nor, uv, a, b, y0, y1, edgeNormal(a, b)); }
  const p2 = [], u2 = [], i2 = [];
  dreieckeOben([pts], y1, p2, u2, i2);
  for (const k of i2) { pos.push(p2[k * 3], p2[k * 3 + 1], p2[k * 3 + 2]); nor.push(0, 1, 0); uv.push(u2[k * 2], u2[k * 2 + 1]); }
  return geoAus(pos, nor, uv);
}
