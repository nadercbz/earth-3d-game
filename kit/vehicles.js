// Fahrzeuge für das EARTH 3D GAME (seit 28.10.2026, Naders Wunsch: Autos mit Higgsfield, danach ein Fahrsystem mit echten Regeln).
// Vorlagen mit GPT Image 2.5 (ohne Marken und Logos), 3D aus Higgsfield, in Blender auf echte Länge gebracht
// (tools/blender/fahrzeuge.py), Front zeigt nach +z, Ursprung unten in der Mitte. Räder als eigene Knoten rad_vl, rad_vr, rad_hl, rad_hr,
// wenn die Trennung geklappt hat, sonst drehen sie sich nicht.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('../assets/vehicles/', import.meta.url);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let handy = false;   // Handy: Texturen 1024 aus handy/, Lack ohne Klarlack (billiger)
export function fahrzeugeHandy(an = true) { handy = an; }

// Autolack (seit 28.10.2026 nach Naders Kritik "verdellt, vermatscht"): wenig Metall, Klarlack nur auf glatten Flächen
// (rauer Gummi und Kunststoff bekommen keinen), Normalkarte schwächer, weil Hunyuan darin auch Wellen mitbackt.
// Projektregel für Helligkeit (wie bei den Gebäuden): Weiß höchstens rund 0,75, sonst brennt weißer Lack in der Sonne aus und die Form verschwindet
const HELL = 0.82;
function grundfarbe(alt, farbe) { return alt.color.clone().multiply(new THREE.Color(farbe ?? 0xffffff)).multiplyScalar(HELL); }

// Keine Normalkarte: Hunyuan malt die Fugen dort als gekritzelte Striche (Naders Kritik 28.10.2026). Kanten kommen aus der Geometrie.
function lack(alt, metall = 0.22, farbe = null) {
  const m = new THREE.MeshPhysicalMaterial({
    map: alt.map, roughnessMap: alt.roughnessMap, metalnessMap: alt.metalnessMap,
    color: grundfarbe(alt, farbe), roughness: 1, metalness: metall, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.0,
  });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.clearcoat *= 1.0 - smoothstep( 0.35, 0.7, roughnessFactor );');
  };
  m.customProgramCacheKey = () => 'autolack';
  return m;
}
function lackHandy(alt, metall = 0.22, farbe = null) {
  const m = alt.clone(); m.metalness = metall; m.color = grundfarbe(alt, farbe); m.roughness = 1; m.envMapIntensity = 1.0; m.normalMap = null;
  return m;
}

// Maße in Metern (Länge, Breite, Höhe) nach typischen Fahrzeugen in Berlin 2026, Anteil im Verkehr grob nach Zulassungen und Beobachtung
export const FAHRZEUGE = [
  { id: 'kompakt', name: 'Kompaktwagen', datei: 'kompakt.glb', laenge: 4.28, breite: 1.80, hoehe: 1.46, anteil: 0.26, klasse: 'pkw', metall: 0.45, info: 'Der häufigste Wagen in der Stadt, fünf Türen, Fließheck.' },
  { id: 'limousine', name: 'Limousine', datei: 'limousine.glb', laenge: 4.85, breite: 1.85, hoehe: 1.47, anteil: 0.14, klasse: 'pkw', info: 'Viertürige Limousine, oft Dienstwagen und Fahrdienste.' },
  { id: 'kombi', name: 'Kombi', datei: 'kombi.glb', laenge: 4.70, breite: 1.83, hoehe: 1.48, anteil: 0.15, klasse: 'pkw', info: 'Kombi mit Dachreling, Familien und Handwerk.' },
  { id: 'suv', name: 'SUV', datei: 'suv.glb', laenge: 4.45, breite: 1.85, hoehe: 1.62, anteil: 0.20, klasse: 'pkw', metall: 0.35, info: 'Kompakter SUV, wachsender Anteil im Stadtverkehr.' },
  { id: 'taxi', name: 'Berliner Taxi', datei: 'taxi.glb', laenge: 4.80, breite: 1.83, hoehe: 1.62, anteil: 0.10, klasse: 'taxi', farbe: 0xf1e2bd, info: 'Hellelfenbein (RAL 1015) mit Dachzeichen, wie alle Taxis in Deutschland.' },
  { id: 'transporter', name: 'Lieferwagen', datei: 'transporter.glb', laenge: 5.99, breite: 2.05, hoehe: 2.52, anteil: 0.10, klasse: 'lieferung', info: 'Kastenwagen mit Hochdach, Paketdienste und Handwerk, hält auch mal in zweiter Reihe.' },
  { id: 'bus', name: 'Doppeldeckerbus', datei: 'bus.glb', laenge: 13.73, breite: 2.55, hoehe: 4.06, anteil: 0.05, klasse: 'bus', info: 'Gelber Doppeldecker mit drei Achsen, fährt feste Linien und hält an Haltestellen (am Potsdamer Platz zum Beispiel M48, M85, 200, 300).' },
];

let liste = null;
// Nur Fahrzeuge, deren Datei es gibt (assets/vehicles/liste.json)
export async function alleFahrzeuge() {
  liste ??= fetch(new URL('liste.json', BASE)).then(r => r.ok ? r.json() : []).catch(() => []);
  const da = await liste;
  return FAHRZEUGE.filter(f => da.includes(f.id));
}

const geladen = new Map(), lackCache = new Map();
export function ladeFahrzeug(def) {
  if (!geladen.has(def.id)) {
    geladen.set(def.id, loader.loadAsync(new URL((handy ? 'handy/' : '') + def.datei, BASE).href).then(g => {
      let tris = 0; const raeder = [];
      g.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          // Hunyuan backt Metall voll ein (Silber wirkte wie Chrom): eigener Lack statt des gelieferten Materials
          if (/^rad_/.test(o.parent?.name || '') || /^rad_/.test(o.name)) { o.material.envMapIntensity = 1.0; }   // Räder behalten ihre Materialien (Gummi, Felge, Bremse)
          else if (o.material?.isMeshStandardMaterial) { const alt = o.material; o.material = lackCache.get(alt) || lackCache.set(alt, handy ? lackHandy(alt, def.metall, def.farbe) : lack(alt, def.metall, def.farbe)).get(alt); }   // Metallic Lack (Silber) braucht mehr Metall als Uni
        }
        if (/^rad_/.test(o.name) && !/^rad_/.test(o.parent?.name || '')) raeder.push(o.name);   // nur der Radknoten, nicht seine Materialteile
      });
      const box = new THREE.Box3().setFromObject(g.scene), gr = box.getSize(new THREE.Vector3());
      // Reifenradius aus dem parametrischen Rad (tools/blender/rad_bauen.py): halbe Höhe des Rads
      const rad = g.scene.getObjectByName(raeder[0] || '');
      const radius = rad ? new THREE.Box3().setFromObject(rad).getSize(new THREE.Vector3()).y / 2 : 0.35;
      return { def, scene: g.scene, tris: Math.round(tris), raeder, mass: gr, radius };
    }).catch(() => null));
  }
  return geladen.get(def.id);
}

// Ein Fahrzeug in die Szene setzen. drehe(dist) dreht die Räder passend zur gefahrenen Strecke.
export function setzeFahrzeug(src) {
  const obj = src.scene.clone(true);
  const raeder = [];
  obj.traverse(o => { if (/^rad_/.test(o.name) && !/^rad_/.test(o.parent?.name || '')) raeder.push(o); });   // nur Radknoten, sonst drehen die Teile doppelt
  return { obj, raeder, drehe: dist => { for (const w of raeder) w.rotation.x += dist / src.radius; } };
}

// ---------- Verkehr: drei Stufen je Fahrzeug als Instanzen (seit 28.10.2026 abends) ----------
// voll (<id>.glb, Räder 72 Segmente), mittel (<id>_m.glb, rund 30 % der Dreiecke, Räder drehen), fern (<id>_f.glb, rund 7 %, ein Netz,
// Räder fest). tools/fahrzeuge_lod.sh baut die Stufen. Alle Stufen nutzen die Materialien der vollen Stufe (Texturen nur einmal).
// Räder: ein Radnetz je Fahrzeug (das linke), rechte Räder sind dasselbe Netz um 180 Grad gedreht. Je Stufe und Fahrzeug:
// Karosserie 1 Zeichenaufruf, Räder 2 (Gummi, Metall), fern 3, egal wie viele Autos fahren.
// Meshopt und Quantisierung: Positionen liegen als normierte Ganzzahlen vor, die Skalierung steckt im Knoten. Vor dem Einbacken
// der Knotenmatrix in Fließkomma umwandeln, sonst passen die Werte nicht mehr in den Zahlenbereich (Karosserien verschwanden, Räder riesig).
function fliesskomma(geo, matrix) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = geo.attributes[name]; if (!a) continue;
    const n = a.itemSize, out = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, n));
  }
  if (geo.index) g.setIndex(geo.index.clone());
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  if (matrix) g.applyMatrix4(matrix);
  return g;
}
function sammle(scene) {
  scene.updateMatrixWorld(true);
  let koerper = null; const raeder = [];
  scene.traverse(o => {
    if (/^rad_/.test(o.name) && !/^rad_/.test(o.parent?.name || '')) {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      raeder.push({ x: p.x, y: p.y, z: p.z, vorn: /^rad_v/.test(o.name), rechts: /^rad_[vh]r/.test(o.name), knoten: o });
    } else if (o.isMesh && !/^rad_/.test(o.parent?.name || '')) koerper = koerper || o;
  });
  // Radgeometrie des ersten linken Rads (Kinder je Material zusammenführen, Gruppen behalten), Ursprung in der Radmitte
  const links = raeder.find(r => !r.rechts) || raeder[0];
  let radGeo = null, radMats = [];
  if (links) {
    const teile = []; links.knoten.traverse(m => { if (m.isMesh) teile.push(m); });
    const zurueck = new THREE.Matrix4().makeTranslation(-links.x, -links.y, -links.z);
    const geos = teile.map(m => fliesskomma(m.geometry, new THREE.Matrix4().multiplyMatrices(zurueck, m.matrixWorld)));
    radGeo = geos.length > 1 ? mergeGeometries(geos, true) : geos[0]; radMats = teile.map(m => m.material);
    if (geos.length === 1) { radGeo.clearGroups(); radGeo.addGroup(0, Infinity, 0); }
  }
  const koerperGeo = koerper ? fliesskomma(koerper.geometry, koerper.matrixWorld) : null;
  return { koerperGeo, koerperMat: koerper?.material, radGeo, radMats, raeder: raeder.map(({ knoten, ...r }) => r) };
}
const stufenGeladen = new Map();
export function ladeFahrzeugStufen(def) {
  if (stufenGeladen.has(def.id)) return stufenGeladen.get(def.id);
  const basis = (handy ? 'handy/' : ''), name = def.datei.replace('.glb', '');
  const p = Promise.all([ladeFahrzeug(def), loader.loadAsync(new URL(`${basis}${name}_m.glb`, BASE).href).catch(() => null), loader.loadAsync(new URL(`${basis}${name}_f.glb`, BASE).href).catch(() => null)]).then(([voll, m, f]) => {
    if (!voll) return null;
    const V = sammle(voll.scene), M = m ? sammle(m.scene) : null;
    const tris = g => g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
    const out = { def, radius: voll.radius, voll: { koerper: V.koerperGeo, mat: V.koerperMat, rad: V.radGeo, radMats: V.radMats, raeder: V.raeder }, tris: { voll: voll.tris } };
    out.mittel = M && M.koerperGeo ? { koerper: M.koerperGeo, mat: V.koerperMat, rad: M.radGeo || V.radGeo, radMats: V.radMats, raeder: V.raeder } : out.voll;
    out.tris.mittel = tris(out.mittel.koerper) + tris(out.mittel.rad) * V.raeder.length;
    if (f) {   // fern: Karosserie (mit uv) und alle Räder (mit Farben) je eine Geometrie, Räder fest, Materialien aus der vollen Stufe
      f.scene.updateMatrixWorld(true); const koerper = [], raeder = [], radMats = [];
      f.scene.traverse(o => { if (!o.isMesh) return; const g = fliesskomma(o.geometry, o.matrixWorld), ms = Array.isArray(o.material) ? o.material : [o.material];
        if (!g.attributes.color) { koerper.push(g); return; }
        if (g.groups.length > 1) ms.forEach((mm, i) => { const gg = g.groups[i], part = g.clone(); part.clearGroups(); part.setIndex(Array.from(g.index.array.slice(gg.start, gg.start + gg.count))); raeder.push(part); radMats.push(mm); });
        else { raeder.push(g); radMats.push(ms[0]); } });
      if (koerper.length) {
        const kg = koerper.length > 1 ? mergeGeometries(koerper, false) : koerper[0];
        const rg = raeder.length ? mergeGeometries(raeder, true) : null;
        const zu = radMats.map(mm => /metall/.test(mm.name) ? (V.radMats[1] || V.radMats[0]) : V.radMats[0]);
        out.fern = { koerper: kg, mat: V.koerperMat, rad: rg, radMats: zu, statisch: true }; out.tris.fern = tris(kg) + tris(rg);
      }
    }
    if (!out.fern) { out.fern = null; out.tris.fern = out.tris.mittel; }
    return out;
  });
  stufenGeladen.set(def.id, p);
  return p;
}

const _M = new THREE.Matrix4(), _W = new THREE.Matrix4(), _T = new THREE.Matrix4(), _E = new THREE.Euler(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(1, 1, 1), _P = new THREE.Vector3();
// Kiste für die Ferne: Unterbau über die ganze Länge, Kabine oben auf 55 % der Länge, Maße aus der Karosserie, Farbe aus ihrem Hauptmaterial
function punktGeo(t) {
  const g = (t.fern || t.mittel).koerper; if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox, L = b.max.z - b.min.z, B = b.max.x - b.min.x, H = b.max.y - b.min.y, cz = (b.max.z + b.min.z) / 2, cx = (b.max.x + b.min.x) / 2;
  const unten = new THREE.BoxGeometry(B, H * 0.55, L); unten.translate(cx, b.min.y + H * 0.275 + 0.0, cz);
  const oben = new THREE.BoxGeometry(B * 0.9, H * 0.45, L * 0.55); oben.translate(cx, b.min.y + H * 0.775, cz - L * 0.05);
  const m = mergeGeometries([unten.toNonIndexed(), oben.toNonIndexed()]); unten.dispose(); oben.dispose(); return m;
}
const punktMats = new Map();
function punktMat(t) {
  const quelle = [].concat((t.fern || t.mittel).mat)[0], farbe = quelle?.color ? quelle.color.clone() : new THREE.Color(0x8a8f96);
  const key = farbe.getHexString(); if (!punktMats.has(key)) punktMats.set(key, new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.45, metalness: 0.3 }));
  return punktMats.get(key);
}

export class Flotte {
  constructor(typen, { mobil = false, max = 160, grenzen = null } = {}) {
    this.typen = typen; this.gruppe = new THREE.Group(); this.mobil = mobil;
    // Abstände für voll, mittel, fern; dahinter nichts. Voll (Räder 72 Segmente, rund 50.000 Dreiecke) nur ganz nah, geparkte Autos eine Stufe früher gröber
    this.grenzen = grenzen || (mobil ? [3, 10, 380] : [9, 36, 760]);
    // vierte Stufe seit 29.10.2026: ab 220 m (Handy 120 m) nur noch Karosserie als zwei Kisten (24 Dreiecke statt rund 1.200), ein Auto ist dort unter 15 Pixel lang
    if (this.grenzen.length === 3) this.grenzen = [this.grenzen[0], this.grenzen[1], Math.min(this.grenzen[2], mobil ? 120 : 220), this.grenzen[2]];   // Handy (Budget 500.000 Dreiecke): voll nur das eigene Auto beim Mitfahren, geparkte immer fern. Desktop seit 28.10.2026 nachts: voll nur das Auto direkt vor einem (50.000 Dreiecke je Auto)
    this.stufen = typen.map(t => {
      if (!t) return null;
      const mk = (geo, mat, n, schatten) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.frustumCulled = false; im.castShadow = schatten; im.receiveShadow = true; im.visible = false; this.gruppe.add(im); return im; };
      const nR = t.voll.raeder.length || 4;
      return {
        voll: { koerper: mk(t.voll.koerper, t.voll.mat, max, true), rad: mk(t.voll.rad, t.voll.radMats, max * nR, true), n: 0, max, nR },
        mittel: { koerper: mk(t.mittel.koerper, t.mittel.mat, max, !mobil), rad: mk(t.mittel.rad, t.mittel.radMats, max * nR, !mobil), n: 0, max, nR },
        fern: t.fern ? { koerper: mk(t.fern.koerper, t.fern.mat, max, false), rad: t.fern.rad ? mk(t.fern.rad, t.fern.radMats, max, false) : null, n: 0, max, nR: 1, statisch: true } : null,
        punkt: { koerper: mk(punktGeo(t), punktMat(t), max, false), rad: null, n: 0, max, nR: 1, statisch: true },
      };
    });
  }
  beginnen() { for (const s of this.stufen) if (s) { s.voll.n = 0; s.mittel.n = 0; if (s.fern) s.fern.n = 0; s.punkt.n = 0; } }
  // fz: pos, dir, nick, neigung, spin, lenk, typ
  setze(fz, cam) {
    const S = this.stufen[fz.typ], T = this.typen[fz.typ]; if (!S) return;
    const d = Math.hypot(fz.pos.x - cam.x, fz.pos.y - cam.y, fz.pos.z - cam.z) * (fz.geparkt ? (this.mobil ? 100 : 2) : 1), g = this.grenzen;
    const stufe = d < g[0] ? S.voll : d < g[1] ? S.mittel : d < g[2] ? (S.fern || S.mittel) : d < g[3] ? S.punkt : null;
    fz.stufe = stufe === S.voll ? 0 : stufe === S.mittel ? 1 : stufe === S.punkt ? 3 : stufe ? 2 : -1;
    if (!stufe) return;
    _E.set((fz.nick || 0) + (fz.hang || 0), Math.atan2(fz.dir.x, fz.dir.z), fz.neigung || 0, 'YXZ');
    _M.compose(fz.pos, _Q.setFromEuler(_E), _S);
    if (stufe.max <= stufe.n) return;
    stufe.koerper.setMatrixAt(stufe.n, _M);
    if (stufe.rad && stufe.statisch) stufe.rad.setMatrixAt(stufe.n, _M);
    else if (stufe.rad) {
      const nR = T.voll.raeder.length, basis = stufe.n * nR, spin = fz.spin / T.radius;
      T.voll.raeder.forEach((r, i) => {
        _T.makeTranslation(r.x, r.y, r.z);
        _E.set(r.rechts ? -spin : spin, (r.rechts ? Math.PI : 0) - (r.vorn ? fz.lenk || 0 : 0), 0, 'YXZ');   // positives rotation.y dreht nach links
        _W.makeRotationFromEuler(_E);
        _T.multiply(_W);
        _W.multiplyMatrices(_M, _T);
        stufe.rad.setMatrixAt(basis + i, _W);
      });
    }
    stufe.n++;
  }
  fertig() {
    for (const s of this.stufen) if (s) for (const st of [s.voll, s.mittel, s.fern, s.punkt]) {
      if (!st) continue;
      st.koerper.count = st.n; st.koerper.visible = st.n > 0; st.koerper.instanceMatrix.needsUpdate = true;
      if (st.rad) { st.rad.count = st.n * st.nR; st.rad.visible = st.n > 0; st.rad.instanceMatrix.needsUpdate = true; }
    }
  }
  zaehle() { let tris = 0, calls = 0; for (const s of this.stufen) if (s) for (const st of [s.voll, s.mittel, s.fern, s.punkt]) { if (!st || !st.n) continue; for (const im of [st.koerper, st.rad]) { if (!im) continue; const g = im.geometry, m = Array.isArray(im.material) ? im.material.length : 1; calls += m; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * im.count; } } return { tris, calls }; }
}
