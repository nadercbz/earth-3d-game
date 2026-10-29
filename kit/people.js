// Menschen laden und klonen. Nur noch Higgsfield Figuren (Naders Entscheidung 28.10.2026):
// Grundfiguren mit eigenem Netz, Varianten teilen das Netz ihrer Grundfigur und bringen nur ihre Textur mit.
// Zusätzliche Bewegungen (Stehen, Umschauen, Reden, Telefonieren, Gehen mit Handy, Joggen) liegen als reine
// Animationsdateien in assets/people/bewegungen/ und passen auf alle Figuren, weil alle dasselbe Skelett haben.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = new URL('../assets/people/', import.meta.url);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

export const MENSCHEN = [
  { id: 'hf_frau_cap', name: 'Frau mit Cap (Higgsfield)', datei: 'higgsfield/hf_frau_cap.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.68 },
  { id: 'hf_frau_locken', name: 'Frau mit Locken (Higgsfield)', datei: 'higgsfield/hf_frau_locken.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.65 },
  { id: 'hf_mann_jacke', name: 'Mann mit Jacke (Higgsfield)', datei: 'higgsfield/hf_mann_jacke.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.82 },
  { id: 'hf_frau_mantel', name: 'Ältere Frau im Mantel (Higgsfield)', datei: 'higgsfield/hf_frau_mantel.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.66 },
  { id: 'hf_mann_hoodie', name: 'Junger Mann im Hoodie (Higgsfield)', datei: 'higgsfield/hf_mann_hoodie.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.78 },
  { id: 'hf_frau_kopftuch', name: 'Frau mit Kopftuch (Higgsfield)', datei: 'higgsfield/hf_frau_kopftuch.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.66 },
  { id: 'hf_mann_anzug', name: 'Mann im Anzug (Higgsfield)', datei: 'higgsfield/hf_mann_anzug.glb', quelle: 'Higgsfield (Meshy)', hoehe: 1.8 },
];

const geladen = new Map();
let handy = false;       // Handy: vereinfachte Netze aus higgsfield/handy/ (rund ein Drittel weniger Dreiecke, gleiches Skelett und Textur)
export function handyNetze(an = true) { handy = an; }
let higgsfield = null;   // nur Grundfiguren laden, die wirklich da sind (assets/people/higgsfield/liste.json)
let varianten = null;    // kostenlose Varianten aus assets/people/varianten.json

// Alle Figuren: Grundfiguren plus jede Variante (doppelte ids nur einmal), nur was wirklich vorhanden ist
export async function alleMenschen() {
  varianten ??= fetch(new URL('varianten.json', BASE)).then(r => r.ok ? r.json() : []).catch(() => []);
  higgsfield ??= fetch(new URL('higgsfield/liste.json', BASE)).then(r => r.ok ? r.json() : []).catch(() => []);
  const [liste, da] = await Promise.all([varianten, higgsfield]);
  const basis = MENSCHEN.filter(d => da.includes(d.id));
  const ids = new Set(basis.map(d => d.id));
  return [...basis, ...(Array.isArray(liste) ? liste : []).filter(d => d && d.id && d.datei && !ids.has(d.id) && d.basis && d.textur && ids.has(d.basis) && ids.add(d.id))];   // Varianten nur mit fertiger Textur
}

export async function loadPerson(def) {
  if (geladen.has(def.id)) return geladen.get(def.id);
  let p;
  if (def.basis && def.textur) {   // Variante: Netz der Grundfigur, eigene Textur
    p = (async () => {
      const basisDef = MENSCHEN.find(d => d.id === def.basis);
      const [src, tex] = await Promise.all([loadPerson(basisDef), texLoader.loadAsync(new URL(def.textur, BASE).href)]);
      if (!src) return null;
      tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const material = src.material.clone(); material.map = tex;
      return { ...src, def, material };
    })().catch(() => null);
  } else {
    const datei = handy && !def.basis ? def.datei.replace('higgsfield/', 'higgsfield/handy/') : def.datei;   // nur Grundfiguren haben ein Handy Netz
    p = loader.loadAsync(new URL(datei, BASE).href).then(gltf => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const h = box.max.y - box.min.y;
      let tris = 0, maps = 0, material = null;
      gltf.scene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
          tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          if (o.material.map) maps++;
          material ??= o.material;
        }
      });
      const clips = gltf.animations.map(ohneVorschub);
      const gehen = clips.find(c => /geh|walk/i.test(c.name)) || clips[0];
      return { def, scene: gltf.scene, scale: def.hoehe / h, minY: box.min.y, gehen, tris: Math.round(tris), maps, clips: clips.map(c => c.name), material };
    }).catch(() => null);
  }
  geladen.set(def.id, p);
  return p;
}

// Bewegung auf der Stelle: die Hüfte darf wippen, aber nicht wandern (sonst rutscht die Figur aus ihrer Position)
function ohneVorschub(clip) {
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}

// Zusätzliche Bewegungen einmal laden: Map Name -> AnimationClip
export const BEWEGUNGEN = ['stehen', 'umschauen', 'reden_a', 'reden_b', 'telefon', 'gehen_handy', 'joggen'];
let bewegungen = null;
export function ladeBewegungen() {
  bewegungen ??= Promise.all(BEWEGUNGEN.map(n => loader.loadAsync(new URL(`bewegungen/${n}.glb`, BASE).href)
    .then(g => { const c = ohneVorschub(g.animations[0]); c.name = n; return [n, c]; }).catch(() => null)))
    .then(l => new Map(l.filter(Boolean)));
  return bewegungen;
}

// Eine Figur in die Szene setzen, mit eigenem Mixer. play(name) blendet weich über.
export function spawn(src, extra = new Map()) {
  const inner = SkeletonUtils.clone(src.scene);
  if (src.material) inner.traverse(o => { if (o.isMesh) o.material = src.material; });
  // kein Frustum Culling für Figuren: three berechnet sonst beim ersten Bild die Hülle jeder Figur über alle Knochen auf der CPU
  // (56 Figuren, 370 ms Stocken beim ersten Bild mit dem Ort, 29.10.2026). Ferne Figuren blendet die Menge selbst aus (kit/crowd.js).
  // Auch das Sortieren fragt nach der Hülle (WebGLRenderer.projectObject), darum eine feste Hülle aus der Ruhehaltung (ohne Knochen) vorgeben
  inner.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; if (o.isSkinnedMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.boundingSphere = o.geometry.boundingSphere.clone(); o.boundingSphere.radius *= 1.5; } });
  inner.scale.setScalar(src.scale);
  inner.position.y = -src.minY * src.scale;
  const obj = new THREE.Group(); obj.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const acts = {};
  if (src.gehen) acts.gehen = mixer.clipAction(src.gehen);
  for (const [n, c] of extra) acts[n] = mixer.clipAction(c);
  let aktiv = null, tempo = 1;
  const play = (name, fade = 0.35) => {
    let a = acts[name];
    if (!a) { if (name === 'stehen' && acts.gehen) { acts.gehen.timeScale = 0; return; } a = acts.gehen; }
    if (!a) return;
    a.timeScale = name === 'gehen' || name === 'joggen' || name === 'gehen_handy' ? tempo : 1;
    if (a === aktiv) return;
    a.reset().setEffectiveWeight(1).play();
    if (aktiv) aktiv.crossFadeTo(a, fade, false);
    aktiv = a;
  };
  const setSpeed = s => { tempo = s; if (aktiv && aktiv !== acts.stehen && aktiv.getClip().name !== 'umschauen') aktiv.timeScale = s; };
  return { obj, mixer, acts, play, setSpeed };
}
