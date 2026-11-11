// Menschen laden und klonen. Nur noch Higgsfield Figuren (Naders Entscheidung 28.10.2026):
// Grundfiguren mit eigenem Netz, Varianten teilen das Netz ihrer Grundfigur und bringen nur ihre Textur mit.
// Zusätzliche Bewegungen (Stehen, Umschauen, Reden, Telefonieren, Gehen mit Handy, Joggen) liegen als reine
// Animationsdateien in assets/people/bewegungen/ und passen auf alle Figuren, weil alle dasselbe Skelett haben.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { bildTexturWarten } from './bildlader.js';

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

// Gesichter (05.11.2026): die Figuren aus dem 3D Generator haben kaum Gesichtszüge. Augen, Brauen, Nase und Mund kommen aus dem Shader, gerechnet in der Ruhehaltung des Netzes (bleiben also am Kopf),
// Lage aus den Ecken, die am Kopfknochen hängen. Kein Mehraufwand an Aufrufen, wirkt auch auf die Varianten.
function kopfMass(mesh) {
  const sk = mesh.skeleton, g = mesh.geometry, P = g.attributes.position, I = g.attributes.skinIndex, W = g.attributes.skinWeight; if (!sk || !P || !I || !W) return null;
  const ki = new Set(); sk.bones.forEach((b, i) => { if (/head/i.test(b.name) && !/top|end/i.test(b.name)) ki.add(i); }); if (!ki.size) return null;   // alle Kopfknochen (Head, headfront): beim Mann im Anzug hing der Kopf nicht am ersten, er hatte darum kein Gesicht
  // Über Mittelwerte statt Grenzwerte (06.11.2026): im Auto Rig hängen einzelne Punkte der Hand oder des Rumpfs am Kopf, ein einziger davon machte den Kopf 1 m breit, das Gesicht landete am Bauch
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < P.count; i++) {
    let w = 0; for (let k = 0; k < 4; k++) if (ki.has(I.getComponent(i, k))) w += W.getComponent(i, k);
    if (w < 0.6) continue;
    xs.push(P.getX(i)); ys.push(P.getY(i)); zs.push(P.getZ(i));
  }
  if (xs.length < 12) return null;
  const pc = (L, p) => { const s = [...L].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  let ober = pc(ys, 0.995), mitteY = pc(ys, 0.6), cx = pc(xs, 0.5), hoeheK = (ober - pc(ys, 0.1));
  // Nur Punkte nahe der Kopfmitte: Hände und Rumpf fallen damit heraus
  const nah = []; for (let i = 0; i < xs.length; i++) if (Math.abs(ys[i] - mitteY) < hoeheK * 0.8 && Math.abs(xs[i] - cx) < hoeheK * 0.75) nah.push(i);
  const X = nah.map(i => xs[i]), Y = nah.map(i => ys[i]), Z = nah.map(i => zs[i]); if (X.length < 12) return null;
  cx = (pc(X, 0.03) + pc(X, 0.97)) / 2; ober = pc(Y, 0.998); const kinn = pc(Y, 0.02), breite = pc(X, 0.97) - pc(X, 0.03);
  // Beim Mann im Anzug hängt nur die Nasenpartie am Kopfknochen, das Maß wäre viel zu klein und das Gesicht fehlte. Dann aus der Geometrie: der Kopf ist die oberste Zone
  g.computeBoundingBox(); const yMax = g.boundingBox.max.y, H = yMax - g.boundingBox.min.y;
  if (ober - kinn < 0.12 * H) {
    const X2 = [], Z2 = [], yK = yMax - 0.153 * H, mx = cx; for (let i = 0; i < P.count; i++) if (P.getY(i) > yK && Math.abs(P.getX(i) - mx) < 0.09 * H) { X2.push(P.getX(i)); Z2.push(P.getZ(i)); }
    if (X2.length > 12) return { cx: (pc(X2, 0.03) + pc(X2, 0.97)) / 2, kinn: yK, w: pc(X2, 0.97) - pc(X2, 0.03), zv: pc(Z2, 0.985), zh: pc(Z2, 0.015), oben: yMax };
  }
  return { cx, kinn, w: breite, zv: pc(Z, 0.985), zh: pc(Z, 0.015), oben: ober };
}
const LEER_MASKE = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();
function mitGesicht(material, k, look = null) {
  if (!k) return material;
  const U = { uKopf: { value: new THREE.Vector4(k.cx, k.kinn, Math.min(k.w, (k.oben - k.kinn) * 0.82), k.zv) }, uKopfT: { value: k.zv - k.zh },
    uLookAn: { value: look ? 1 : 0 }, tMaske: { value: look?.maske || LEER_MASKE }, uHaut: { value: new THREE.Vector3(...(look?.haut || [1, 1, 1])) }, uHaar: { value: new THREE.Vector3(...(look?.haar || [1, 1, 1])) }, uOben: { value: new THREE.Vector3(...(look?.oben || [1, 1, 1])) }, uUnten: { value: new THREE.Vector3(...(look?.unten || [1, 1, 1])) },
    uBasisL: { value: new THREE.Vector4(...(look?.mittel || [1, 1, 1, 1])) }, uRobe: { value: look?.robe || 0 }, uRobeP: { value: new THREE.Vector4(...(look?.robeP || [0, 0, 0, 0])) }, uRobeB: { value: new THREE.Vector2(...(look?.robeB || [0, 0])) }, uGesicht: { value: new THREE.Vector4(look?.auge ?? 1, look?.nase ?? 1, look?.lippen ?? 1, look?.bart ?? 0) } };
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    // Lange Gewänder (Djellaba, Thobe, Sari, Wunsch Nr. 49): unterhalb der Hüfte rücken die Beine zusammen und werden zu einem Rock, der sich nach unten weitet. Nur der Körper, kein zweites Netz
    sh.vertexShader = 'varying vec3 vBind; uniform float uRobe; uniform vec4 uRobeP; uniform vec2 uRobeB;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBind = position;').replace('#include <skinning_vertex>', `#include <skinning_vertex>
  if (uRobe > 0.001 && position.y < uRobeP.x) { float hR = clamp((uRobeP.x - position.y) / max(uRobeP.x - uRobeP.y, 1e-3), 0.0, 1.0), kR = uRobe * smoothstep(0.0, 0.16, hR) * (1.0 - smoothstep(1.0 - (1.0 - uRobe) * 1.6 - 0.01, 1.0, hR) * step(uRobe, 0.95));
    float dX = transformed.x - uRobeP.z, sX = dX < 0.0 ? -1.0 : 1.0, breite = 1.0 + 1.35 * hR, zu = uRobeB.x * (0.05 + 0.5 * hR);   // die Beine laufen über die Mitte hinaus ineinander: so bleibt keine Lücke, auch nicht im Schritt
    transformed.x = mix(transformed.x, uRobeP.z + (dX - sX * zu) * breite, kR);
    transformed.z = mix(transformed.z, uRobeP.w + (transformed.z - uRobeP.w) * 0.42, kR); }`);
    sh.fragmentShader = 'varying vec3 vBind; uniform vec4 uKopf, uBasisL, uGesicht; uniform float uKopfT, uLookAn, uRobe; uniform sampler2D tMaske; uniform vec3 uHaut, uHaar, uOben, uUnten;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  if (uLookAn > 0.5) { float idM = floor(texture2D(tMaske, vMapUv).r * 255.0 + 0.5); if (idM > 0.5) { float lumM = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      if (idM < 1.5) diffuseColor.rgb = uHaut * clamp(lumM / uBasisL.x, 0.62, 1.3); else if (idM < 2.5) diffuseColor.rgb = uHaar * clamp(lumM / uBasisL.y, 0.6, 1.5); else if (idM < 3.5) diffuseColor.rgb = uOben * clamp(lumM / uBasisL.z, mix(0.5, 0.72, step(0.5, uRobe)), 1.45); else diffuseColor.rgb = uUnten * clamp(lumM / uBasisL.w, mix(0.5, 0.78, step(0.5, uRobe)), mix(1.45, 1.18, step(0.5, uRobe))); } }
  if (vBind.y > uKopf.y && vBind.z > uKopf.w - uKopfT * 0.62) {
    float W = uKopf.z, H = W * 1.3; vec2 q = vec2(abs(vBind.x - uKopf.x), vBind.y - uKopf.y) / W; float aa = 0.012;
    float yA = 0.68, yM = 0.36, yN = 0.5;
    if (q.y < 1.1 && q.x < 0.5) {
      vec3 haut = diffuseColor.rgb;
      // Augen: Weiß, Iris, Oberlid
      if (uGesicht.w > 0.01) { float bB = uGesicht.w * (1.0 - smoothstep(0.31, 0.44, q.y)) * smoothstep(0.0, 0.03, q.y) * (1.0 - smoothstep(0.34, 0.5, q.x)); float bS = uGesicht.w * (1.0 - smoothstep(0.0, 0.025, abs(q.y - yM - 0.05))) * (1.0 - smoothstep(0.12, 0.16, q.x)); diffuseColor.rgb = mix(diffuseColor.rgb, uHaar * 0.85, max(bB * 0.72, bS * 0.8) * (0.72 + 0.28 * sin(vBind.x * 900.0) * sin(vBind.y * 760.0))); }   // Bart
      vec2 a = (q - vec2(0.2, yA)) / vec2(0.075, 0.034 * uGesicht.x); float ae = dot(a, a);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.48, 0.45), 1.0 - smoothstep(0.75, 1.1, ae));
      vec2 ir = (q - vec2(0.195, yA)) / vec2(0.034, 0.034 * max(uGesicht.x, 0.85)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.035, 0.025), (1.0 - smoothstep(0.7, 1.05, dot(ir, ir))) * (1.0 - smoothstep(0.75, 1.1, ae)));
      float lid = (1.0 - smoothstep(0.0, 0.014, abs(q.y - yA - 0.034 + 2.4 * (q.x - 0.2) * (q.x - 0.2)))) * (1.0 - smoothstep(0.075, 0.1, abs(q.x - 0.2)));
      diffuseColor.rgb = mix(diffuseColor.rgb, haut * 0.22, lid * 0.85);
      // Brauen
      float br = (1.0 - smoothstep(0.0, 0.016, abs(q.y - yA - 0.095 + 1.2 * (q.x - 0.21) * (q.x - 0.21)))) * (1.0 - smoothstep(0.075, 0.105, abs(q.x - 0.21)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.045, 0.035), br * 0.8);
      // Nase: Schatten unter der Spitze und seitlich
      float na = (1.0 - smoothstep(0.03 * uGesicht.y, 0.075 * uGesicht.y, q.x)) * (1.0 - smoothstep(0.0, 0.03, abs(q.y - yN)));
      diffuseColor.rgb = mix(diffuseColor.rgb, haut * 0.62, na * 0.75);
      float ns = (1.0 - smoothstep(0.0, 0.02, abs(q.x - 0.06))) * smoothstep(yN, yN + 0.03, q.y) * (1.0 - smoothstep(yN + 0.08, yN + 0.2, q.y));
      diffuseColor.rgb = mix(diffuseColor.rgb, haut * 0.8, ns * 0.4);
      // Mund: Lippen und Spalt
      vec2 m = (q - vec2(0.0, yM)) / vec2(0.13, 0.036 * uGesicht.z); float me = dot(m, m);
      diffuseColor.rgb = mix(diffuseColor.rgb, haut * vec3(0.66, 0.34, 0.34), 1.0 - smoothstep(0.7, 1.15, me));
      float sp = (1.0 - smoothstep(0.0, 0.01, abs(q.y - yM))) * (1.0 - smoothstep(0.1, 0.135, q.x));
      diffuseColor.rgb = mix(diffuseColor.rgb, haut * 0.28, sp * 0.9);
    }
  }`);
  };
  material.customProgramCacheKey = () => 'figurGesicht2';
  return material;
}

// Kratzer auf der Kleidung (06.11.2026): im Textur Atlas stoßen die Inseln ohne Lücke aneinander, an den Nähten holte die Filterung die Farbe der Nachbarinsel (weiße Linien auf dem schwarzen Hoodie).
// Die Ränder jeder Insel rücken darum um ein paar Bildpunkte nach innen. Das ändert nichts Sichtbares außer den Nähten.
function uvEinziehen(g, d = 3 / 1024) {
  const uv = g.attributes.uv, ix = g.index; if (!uv || !ix) return;
  const n = uv.count, I = ix.array, kanten = new Map(), ox = new Float32Array(n), oy = new Float32Array(n);
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], b = I[t + (e + 1) % 3], k = a < b ? a * n + b : b * n + a; kanten.set(k, kanten.has(k) ? -1 : I[t + (e + 2) % 3]); }
  for (const [k, c] of kanten) { if (c < 0) continue; const a = Math.floor(k / n), b = k % n, ax = uv.getX(a), ay = uv.getY(a), ex = uv.getX(b) - ax, ey = uv.getY(b) - ay, L = Math.hypot(ex, ey); if (L < 1e-7) continue; let nx = -ey / L, ny = ex / L; if ((uv.getX(c) - ax) * nx + (uv.getY(c) - ay) * ny < 0) { nx = -nx; ny = -ny; } ox[a] += nx; oy[a] += ny; ox[b] += nx; oy[b] += ny; }
  for (let i = 0; i < n; i++) { const L = Math.hypot(ox[i], oy[i]); if (L > 1e-5) uv.setXY(i, uv.getX(i) + ox[i] / L * d, uv.getY(i) + oy[i] / L * d); }
  uv.needsUpdate = true;
}

// Schattierung glätten (Nr. 101, 10.11.2026): die Netze aus Bild zu 3D tragen an fast jeder Lage mehrere Ecken mit verschiedenen Normalen (gemessen an
// hf_frau_cap: 6.456 von 7.660 Lagen, im Mittel 48 Grad auseinander). Aus der Nähe sahen Jacken und Hosen darum facettiert aus. Jede Ecke bekommt
// die nach Fläche gewichtete Mitte aller Flächen an ihrer Lage, die höchstens `grad` von ihrer eigenen abweichen. Echte Kanten (Schirm der Mütze,
// Sohle, Tasche) bleiben. Prüfung: node artifacts/qualitaetsrunde_nr101/figur_normalen.mjs und ein Foto aus der Nähe (tools/figur_probe.mjs)
function normalenGlaetten(g, grad = 78) {
  const P = g.attributes.position, ix = g.index; if (!P || !ix) return;
  const n = P.count, I = ix.array, eig = new Float32Array(n * 3), cosG = Math.cos(grad * Math.PI / 180);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2], ax = P.getX(a), ay = P.getY(a), az = P.getZ(a);
    const ux = P.getX(b) - ax, uy = P.getY(b) - ay, uz = P.getZ(b) - az, vx = P.getX(c) - ax, vy = P.getY(c) - ay, vz = P.getZ(c) - az;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;   // Länge ist die doppelte Fläche: große Flächen zählen mehr
    for (const i of [a, b, c]) { eig[i * 3] += fx; eig[i * 3 + 1] += fy; eig[i * 3 + 2] += fz; }
  }
  const lagen = new Map(), einheit = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const L = Math.hypot(eig[i * 3], eig[i * 3 + 1], eig[i * 3 + 2]) || 1; einheit[i * 3] = eig[i * 3] / L; einheit[i * 3 + 1] = eig[i * 3 + 1] / L; einheit[i * 3 + 2] = eig[i * 3 + 2] / L;
    const k = P.getX(i) + ',' + P.getY(i) + ',' + P.getZ(i), l = lagen.get(k); if (l) l.push(i); else lagen.set(k, [i]);
  }
  const neu = new Float32Array(n * 3);
  for (const l of lagen.values()) for (const i of l) {
    let x = 0, y = 0, z = 0;
    for (const j of l) if (einheit[i * 3] * einheit[j * 3] + einheit[i * 3 + 1] * einheit[j * 3 + 1] + einheit[i * 3 + 2] * einheit[j * 3 + 2] >= cosG) { x += eig[j * 3]; y += eig[j * 3 + 1]; z += eig[j * 3 + 2]; }
    const L = Math.hypot(x, y, z); if (L > 1e-12) { neu[i * 3] = x / L; neu[i * 3 + 1] = y / L; neu[i * 3 + 2] = z / L; } else { neu[i * 3] = einheit[i * 3]; neu[i * 3 + 1] = einheit[i * 3 + 1]; neu[i * 3 + 2] = einheit[i * 3 + 2]; }
  }
  g.setAttribute('normal', new THREE.Float32BufferAttribute(neu, 3));
}

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
      const [src, tex] = await Promise.all([loadPerson(basisDef), bildTexturWarten(new URL(def.textur, BASE).href, { flip: false })]);
      if (!src) return null;
      tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const material = mitGesicht(src.material.clone(), src.kopf); material.map = tex;
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
          o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; uvEinziehen(o.geometry); normalenGlaetten(o.geometry);
          tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          if (o.material.map) maps++;
          material ??= o.material;
        }
      });
      let kopf = null; gltf.scene.traverse(o => { if (o.isSkinnedMesh && !kopf) kopf = kopfMass(o); });
      if (material) { material.roughness = 0.92; material.metalness = 0; material.envMapIntensity = 0.55; mitGesicht(material, kopf); }   // dunkles Haar spiegelte sonst den Himmel türkis
      const clips = gltf.animations.map(ohneVorschub);
      const gehen = clips.find(c => /geh|walk/i.test(c.name)) || clips[0];
      const ruhe = ruhehaltung(gltf.scene);   // vor der ersten Bewegung festhalten (für das Retargeting)
      return { def, ruhe, kopf, scene: gltf.scene, scale: def.hoehe / h, minY: box.min.y, gehen, tris: Math.round(tris), maps, clips: clips.map(c => c.name), material };
    }).catch(() => null);
  }
  geladen.set(def.id, p);
  return p;
}

// Figuren eines Ortes (Wunsch Nr. 49): dieselben Higgsfield Körper, aber Haut, Haar, Kleidung und Größe aus kit/voelker.js. Jede Figur ist eine Quelle wie bisher eine Variante, teilt Netz und Textur mit ihrer Grundfigur
let MASKEN = null; const maskenTex = new Map();
async function maskeLaden(id) { MASKEN ??= fetch(new URL('higgsfield/masken/masken.json', BASE)).then(r => r.json()); const M = await MASKEN; if (!maskenTex.has(id)) maskenTex.set(id, texLoader.loadAsync(new URL(`higgsfield/masken/${id}.png`, BASE).href).then(t => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; })); return { m: M[id], tex: await maskenTex.get(id) }; }
export async function lookQuelle(look, i = 0) {
  const def = MENSCHEN.find(d => d.id === look.basis); if (!def) return null; const src = await loadPerson(def); if (!src || !src.kopf) return null;
  const { m, tex } = await maskeLaden(look.basis);
  const material = src.material.clone(); material.map = src.material.map;
  // Nach dem Skinning rechnet der Shader in den Einheiten des Knotens (rund 90 je Einheit der Rohdaten, das Netz hängt unter einem Maßstab 0,01), die Maße der Karte sind in Rohdaten. Ohne Umrechnung schloss sich kein Gewand
  let sm = null; src.scene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; }); src.scene.updateMatrixWorld(true); const sY = sm ? sm.getWorldScale(new THREE.Vector3()).y : 1, e = (def.hoehe / src.scale) / (m.H || 2) / (sY / (src.scene.scale?.y || 1));
  mitGesicht(material, src.kopf, { maske: tex, haut: look.haut, haar: look.haar, oben: look.oben, unten: look.unten, mittel: m.mittel, robe: look.robe, robeP: [m.huefte, m.knoechel, m.cx * e, m.cz * e], robeB: [m.bein * e, m.innen * e], auge: look.auge, nase: look.nase, lippen: look.lippen, bart: look.bart });
  const h = def.hoehe / src.scale;   // Höhe des Netzes in seinen Einheiten
  return { ...src, def: { ...def, id: `${def.id}~${i}` }, material, scale: look.groesse / h, breit: look.breit, kopfteil: look.kopf ? { art: look.kopf, farbe: look.kopfFarbe } : null, look };
}
// Teile am Kopf: Tuch mit Ring, Kappe, Turban, gebundenes Tuch, Melone, Kegelhut. Einmal je Art gebaut, in Einheiten der Kopfbreite
function mergeGeos(L) { const P = [], N = []; for (const g of L) { P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); } const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return G; }
const KOPF_GEO = new Map();
function kopfGeo(art) {
  if (KOPF_GEO.has(art)) return KOPF_GEO.get(art);
  let g; const lathe = (p, n = 16) => new THREE.LatheGeometry(p.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), n);   // von unten nach oben, sonst zeigen die Flächen nach innen und die Kappe scheint zu schweben
  if (art === 'kufi') g = lathe([[0, 0.3], [0.5, 0.3], [0.56, 0.2], [0.58, 0], [0.56, -0.08]]);
  else if (art === 'bowler') { g = lathe([[0, 0.5], [0.3, 0.5], [0.5, 0.38], [0.58, 0.15], [0.6, 0.02], [0.92, 0], [0.95, -0.03], [0.6, -0.03]]); }
  else if (art === 'kegelhut') g = lathe([[0, 0.55], [1.5, 0], [1.52, -0.02], [0, 0.45]], 20);
  else if (art === 'muetze') { g = lathe([[0, 0.34], [0.5, 0.36], [0.72, 0.28], [0.66, 0.08], [0.56, 0.0], [0.56, -0.08]]); const sch = new THREE.BoxGeometry(0.72, 0.035, 0.3).translate(0, -0.03, 0.62); g = mergeGeos([g.toNonIndexed(), sch.toNonIndexed()]); }
  else if (art === 'turban') { g = new THREE.SphereGeometry(0.66, 18, 12); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), w = Math.atan2(z, x), b = 1 + 0.07 * Math.sin(w * 2 + y * 9); P.setXYZ(i, x * b, y * 0.72 + 0.1, z * b * 1.06); } g.computeVertexNormals(); }
  else if (art === 'gele') { g = new THREE.SphereGeometry(0.6, 20, 12); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), w = Math.atan2(z, x), b = 1 + 0.13 * Math.sin(w * 5 + y * 6) * Math.max(0, y + 0.3); P.setXYZ(i, x * b * (1 + 0.28 * Math.max(0, y)), y * 0.7 + 0.2, z * b * (1 + 0.1 * Math.max(0, y))); } g.computeVertexNormals(); }
  else if (art === 'ghutra') { g = new THREE.SphereGeometry(0.64, 18, 14); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { let x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (y < 0) { const f = -y / 0.64; y *= 1 + 2.6 * (z < 0.1 ? 1 : 0.15); z -= f * 0.14; x *= 1 + 0.34 * f; if (z > 0.22) z = 0.22; } P.setXYZ(i, x, y + 0.1, z - 0.04); } g.computeVertexNormals(); }
  else g = new THREE.SphereGeometry(0.6, 12, 10);
  KOPF_GEO.set(art, g); return g;
}
const KOPF_MAT = new Map();
function kopfMat(art, farbe) { const k = art + farbe; if (!KOPF_MAT.has(k)) KOPF_MAT.set(k, new THREE.MeshStandardMaterial({ color: farbe ?? 0xdddddd, roughness: art === 'bowler' ? 0.7 : 0.92, metalness: 0 })); return KOPF_MAT.get(k); }
const RING_GEO = new THREE.TorusGeometry(0.56, 0.05, 6, 20).rotateX(Math.PI / 2), RING_MAT = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 });
const _km = new THREE.Matrix4(), _kp = new THREE.Vector3(), _kq = new THREE.Quaternion(), _ks = new THREE.Vector3();
function kopfteilSetzen(inner, src) {
  const K = src.kopf, T = src.kopfteil; if (!K || !T) return;
  const kopf = inner.getObjectByName('Head') || inner.getObjectByName('mixamorigHead'); if (!kopf) return;
  const breite = K.w * 1.04, y = K.oben - breite * (T.art === 'kegelhut' ? 0.34 : T.art === 'bowler' || T.art === 'muetze' ? 0.36 : T.art === 'kufi' ? 0.2 : T.art === 'gele' ? 0.34 : T.art === 'turban' ? 0.27 : 0.46), z = (K.zv + K.zh) / 2 - breite * 0.04;
  const m = new THREE.Mesh(kopfGeo(T.art), kopfMat(T.art, T.farbe)); m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
  // Lage in der Ruhehaltung (Einheiten des Netzes) in den Rahmen des Kopfknochens
  // Die Maße stehen in Koordinaten des Netzes (Ruhelage rund 2 Einheiten hoch, nicht in Metern). Die Umkehrung der Bindung des Kopfknochens führt sie genau in seinen Rahmen, unabhängig von Haltung und Maßstab
  let sm = null; inner.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; }); const bi = sm?.skeleton.bones.indexOf(kopf) ?? -1; if (bi < 0) return;
  _km.copy(sm.skeleton.boneInverses[bi]).multiply(new THREE.Matrix4().compose(_kp.set(K.cx, y, z), _kq.identity(), _ks.setScalar(breite)));
  _km.decompose(m.position, m.quaternion, m.scale); kopf.add(m);
  if (T.art === 'ghutra') { const r = new THREE.Mesh(RING_GEO, RING_MAT); r.position.set(0, 0.26, -0.02); r.frustumCulled = false; m.add(r); }
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
    .then(g => { const c = ohneVorschub(g.animations[0]); c.name = n; c.userData = { ruhe: ruhehaltung(g.scene) }; return [n, c]; }).catch(() => null)))
    .then(l => new Map(l.filter(Boolean)));
  return bewegungen;
}

// ---------- Retargeting (04.11.2026, Nader: "manche stehen komisch, Kopf im Stehen ist geknickt") ----------
// Die Bewegungen stammen vom Skelett einer anderen Figur. Alle Skelette heißen gleich, haben aber eigene Ruhehaltungen (Hals und Kopf stehen je Modell
// anders). Die Drehwerte einfach zu übernehmen kippte den Kopf bis zu 40 Grad. Jetzt wird jede Bewegung je Figur umgerechnet: Drehung in der Welt
// relativ zur Ruhehaltung der Quelle, angewendet auf die Ruhehaltung der Figur, zurück in lokale Werte; Hüfte: nur die Abweichung, skaliert mit der Beinlänge.
function ruhehaltung(wurzel) {
  wurzel.updateMatrixWorld(true);
  const m = new Map(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  wurzel.traverse(o => { if (!o.isBone && !o.children.some(c => c.isBone) && !/hips|spine|neck|head|arm|leg|foot|hand|shoulder|toe/i.test(o.name)) return;
    o.matrixWorld.decompose(_p, _q, _s); m.set(o.name, { name: o.name, q: o.quaternion.clone(), p: o.position.clone(), w: _q.clone(), wp: _p.clone(), eltern: o.parent?.name || null }); });
  return m;
}
const _umgerechnet = new WeakMap();
function umrechnen(clip, quelle, ziel) {
  if (!quelle || !ziel) return clip;
  const dauer = clip.duration, n = Math.max(2, Math.round(dauer * 30) + 1), zeiten = new Float32Array(n); for (let i = 0; i < n; i++) zeiten[i] = dauer * i / (n - 1);
  const spuren = new Map(), hueftPos = [];
  for (const t of clip.tracks) { const [knochen, art] = t.name.split('.'); if (art === 'quaternion') spuren.set(knochen, t.createInterpolant()); else if (art === 'position' && /hips/i.test(knochen)) hueftPos.push({ knochen, t }); }
  // Reihenfolge: Eltern vor Kindern, nur Knochen, die beide Skelette haben
  const namen = [...ziel.keys()].filter(k => quelle.has(k)), reihe = []; const gesehen = new Set();
  const nimm = k => { if (gesehen.has(k) || !ziel.has(k) || !quelle.has(k)) return; const e = ziel.get(k).eltern; if (e) nimm(e); gesehen.add(k); reihe.push(k); };
  namen.forEach(nimm);
  const werte = new Map(reihe.map(k => [k, new Float32Array(n * 4)])), wQ = new Map(), wZ = new Map();
  const _a = new THREE.Quaternion(), _b = new THREE.Quaternion(), _d = new THREE.Quaternion();
  // Arme und Beine: Knochenrichtung an die Quelle angleichen (Ruhehaltung A oder T mit anderem Winkel: sonst stehen die Arme vom Körper ab),
  // Rumpf, Hals und Kopf bleiben bei der Ruhehaltung der Figur (sonst kippt der Kopf)
  const ruheZiel = new Map(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
  const kind = (m, k) => { for (const b of m.values()) if (b.eltern === k) return b; return null; };
  for (const k of reihe) {
    const Z = ziel.get(k), Q = quelle.get(k);
    if (/(arm|forearm|upleg|leg)$/i.test(k)) { const kz = kind(ziel, k), kq = kind(quelle, k); if (kz && kq && ziel.has(kz.name) && quelle.has(kz.name)) { const qk = quelle.get(kz.name);
      _v1.subVectors(ziel.get(kz.name).wp, Z.wp).normalize(); _v2.subVectors(qk.wp, Q.wp).normalize(); if (_v1.lengthSq() > 0.5 && _v2.lengthSq() > 0.5) { ruheZiel.set(k, new THREE.Quaternion().setFromUnitVectors(_v1, _v2).multiply(Z.w)); continue; } } }
    ruheZiel.set(k, Z.w);
  }
  for (let i = 0; i < n; i++) {
    wQ.clear(); wZ.clear();
    for (const k of reihe) {
      const Q = quelle.get(k), Z = ziel.get(k), ip = spuren.get(k);
      // Quelle: lokale Drehung zur Zeit, Weltdrehung über die Eltern
      if (ip) { const v = ip.evaluate(zeiten[i]); _a.set(v[0], v[1], v[2], v[3]).normalize(); } else _a.copy(Q.q);
      const eQ = Q.eltern && wQ.get(Q.eltern), wq = (eQ ? eQ.clone() : (Q.eltern && quelle.has(Q.eltern) ? quelle.get(Q.eltern).w.clone() : Q.w.clone().multiply(Q.q.clone().invert()))).multiply(_a);
      wQ.set(k, wq);
      // Ziel: Welt = Welt Quelle mal Ruhe Quelle invers mal Ruhe Ziel
      _d.copy(wq).multiply(_b.copy(Q.w).invert()).multiply(ruheZiel.get(k));
      wZ.set(k, _d.clone());
      const eZ = Z.eltern && wZ.get(Z.eltern), elternZ = eZ || (Z.eltern && ziel.has(Z.eltern) ? ziel.get(Z.eltern).w : Z.w.clone().multiply(Z.q.clone().invert()));
      _a.copy(elternZ).invert().multiply(_d);
      const w = werte.get(k), o = i * 4;
      // kürzester Weg zum vorigen Wert, sonst springt die Interpolation
      if (i && w[o - 4] * _a.x + w[o - 3] * _a.y + w[o - 2] * _a.z + w[o - 1] * _a.w < 0) { _a.x *= -1; _a.y *= -1; _a.z *= -1; _a.w *= -1; }
      w[o] = _a.x; w[o + 1] = _a.y; w[o + 2] = _a.z; w[o + 3] = _a.w;
    }
  }
  const spurenNeu = [];
  for (const k of reihe) if (spuren.has(k)) spurenNeu.push(new THREE.QuaternionKeyframeTrack(`${k}.quaternion`, zeiten, werte.get(k)));
  for (const { knochen, t } of hueftPos) {
    const Q = quelle.get(knochen), Z = ziel.get(knochen); if (!Q || !Z) continue;
    const f = Math.abs(Q.p.y) > 1e-6 ? Math.abs(Z.p.y / Q.p.y) : 1, v = new Float32Array(t.values.length);
    for (let i = 0; i < v.length; i += 3) { v[i] = Z.p.x; v[i + 1] = Z.p.y + (t.values[i + 1] - Q.p.y) * f; v[i + 2] = Z.p.z; }
    spurenNeu.push(new THREE.VectorKeyframeTrack(`${knochen}.position`, t.times, v));
  }
  const neu = new THREE.AnimationClip(clip.name, dauer, spurenNeu); return neu;
}
// Stehen (06.11.2026, Nader: "manche stehen komisch"): die fremde Bewegung ließ die Arme mit offenen Händen abstehen, die Knie im Schritt. Darum je Figur aus ihrer eigenen Ruhehaltung gerechnet:
// Füße fest am Boden (zwei Knochen IK, Knie leicht nach vorn), Arme hängen locker, Rumpf atmet, das Gewicht wandert langsam, der Kopf schaut etwas umher. 12 s Schleife.
// Seit 06.11.2026 (Wunsch Nr. 49, "richtig gute organische Animationen, dass die nicht steif stehen") mehrere Haltungen aus demselben Rechenweg: Spielbein (Kontrapost), verschränkte Arme, Hände in den Taschen, in die Hüfte gestützt, hinter dem Rücken.
export const STEHEN_ARTEN = { stehen: {}, stehen_kontra: { gewicht: 1 }, stehen_kontra2: { gewicht: -1 }, stehen_arme: { arme: 'verschraenkt', gewicht: 0.45 }, stehen_taschen: { arme: 'taschen', gewicht: -0.55 }, stehen_huefte: { arme: 'huefte', gewicht: 0.75 }, stehen_ruecken: { arme: 'ruecken', gewicht: 0.25 } };
// Aktionen für die Szenen auf der Straße (kit/szenen.js, Wunsch Nr. 54): TikTok tanzen, filmen, klatschen, jubeln, Schild halten, Gitarre spielen, zeigen, winken, Selfie. Rechenweg wie Stehen, Füße am Boden, Arme nach Richtungen (x Seite, y oben, z vorn). Je Figur erst gerechnet, wenn sie gebraucht wird
const _V = (x, y, z) => new THREE.Vector3(x, y, z), _s1 = Math.sin;
export const AKTIONEN = {
  tanzen: { T: 1.6, breit: 1.7, hueft: w => [0.022 * _s1(w), -0.03 + 0.024 * Math.abs(_s1(w))], neig: w => 0.07 * _s1(w), fuss: (S, w) => { const ph = S === 'Left' ? 0 : Math.PI, h = Math.max(0, _s1(w + ph)); return [0, h * 0.035, 0.03 * _s1(w + ph)]; }, arme: (s, w, S) => { const ph = S === 'Left' ? 0 : Math.PI, u = _s1(w + ph); return [_V(s * 0.6, -0.2 + 0.72 * u, 0.38), _V(s * (0.12 - 0.42 * u), 0.5 + 0.5 * u, 0.56)]; } },
  klatschen: { T: 0.7, hueft: w => [0, 0.004 * _s1(w)], arme: (s, w) => [_V(s * 0.2, -0.72, 0.62), _V(-s * (0.6 + 0.2 * Math.cos(w * 2)), 0.32, 0.78)] },
  filmen: { T: 6, gewicht: 0.3, arme: (s, w) => [_V(s * 0.22, -0.2 + 0.02 * _s1(w), 0.92), _V(-s * 0.2, 0.62 + 0.02 * _s1(w * 2), 0.75)] },
  jubeln: { T: 1.1, hueft: w => [0, 0.018 * Math.abs(_s1(w)) - 0.008], arme: (s, w) => [_V(s * 0.34, 0.9, 0.12), _V(s * (0.1 + 0.12 * _s1(w * 2)), 0.96, 0.14)] },
  schild: { T: 2.6, gewicht: 0.25, arme: (s, w) => [_V(s * 0.24, 0.32 + 0.06 * _s1(w * 2), 0.82), _V(-s * 0.22, 0.92, 0.2)] },
  gitarre: { T: 1.2, hueft: w => [0.004 * _s1(w), 0], neig: w => 0.02 * _s1(w), arme: (s, w, S) => S === 'Left' ? [_V(s * 0.3, -0.72, 0.5), _V(s * 0.5, 0.22, 0.82)] : [_V(s * 0.22, -0.82, 0.42), _V(-s * 0.82, -0.06 + 0.14 * _s1(w * 2), 0.5)] },
  zeigen: { T: 5, gewicht: 0.3, arme: (s, w, S) => S === 'Left' ? [_V(s * 0.12, -1, 0.02), _V(s * 0.05, -1, 0.16)] : [_V(s * 0.46, 0.14 + 0.06 * _s1(w), 0.86), _V(s * 0.36, 0.2 + 0.06 * _s1(w), 0.9)] },
  winken: { T: 1.2, arme: (s, w, S) => S === 'Left' ? [_V(s * 0.12, -1, 0.02), _V(s * 0.05, -1, 0.16)] : [_V(s * 0.42, 0.72, 0.2), _V(s * (0.22 + 0.36 * _s1(w * 2)), 0.9, 0.1)] },
  selfie: { T: 5, gewicht: -0.4, arme: (s, w, S) => S === 'Left' ? [_V(s * 0.16, -1, 0.06), _V(s * 0.05, -0.95, 0.28)] : [_V(s * 0.34, 0.32 + 0.03 * _s1(w), 0.86), _V(s * 0.1, 0.34 + 0.03 * _s1(w), 0.92)] },
  // Wasser (Wunsch Nr. 64): Sitz auf Boot und Jetski, Kraul, Wassertreten. Beim Kraul liegt der Körper flach (kit/wasserfahrt.js kippt ihn), darum zeigt oben (y) in Schwimmrichtung und vorn (z) nach unten
  sitzen: { T: 3, breit: 1.9, hueft: () => [0, -0.46], fuss: () => [0, 0, 0.3], arme: (s, w) => [_V(s * 0.2, -0.42 + 0.01 * _s1(w), 0.82), _V(-s * 0.06, 0.02, 1)] },
  schwimmen: { T: 1.45, breit: 0.7, fuss: (S, w) => { const ph = S === 'Left' ? 0 : Math.PI; return [0, 0, 0.13 * _s1(w * 3 + ph)]; }, arme: (s, w, S) => { const a = w + (S === 'Left' ? 0 : Math.PI); return [_V(s * 0.16, Math.cos(a), Math.sin(a) * 0.9), _V(s * 0.08, Math.cos(a + 0.55), Math.sin(a + 0.55) * 0.9)]; } },
  treten: { T: 2.2, breit: 1.25, hueft: w => [0, -0.07 + 0.012 * _s1(w)], fuss: (S, w) => { const ph = S === 'Left' ? 0 : Math.PI; return [0, 0.14 + 0.09 * _s1(w + ph), 0.13 * Math.cos(w + ph)]; }, arme: (s, w) => [_V(s * 0.64, -0.34 + 0.12 * _s1(w), 0.34), _V(s * (0.52 + 0.26 * _s1(w)), -0.12, 0.74)] },
};
// Eine Aktion für diese Figur bereitstellen (einmal je Netz gerechnet). Liefert true, wenn sie abspielbar ist
export function aktionBereit(f, name) { if (f.acts[name]) return true; const m = f.src && _umgerechnet.get(f.src.scene); if (!m || !AKTIONEN[name]) return false; let c = m.clips.get(name); if (!c) { c = stehenBauen(m.ruhe, name); if (!c) return false; m.clips.set(name, c); } f.acts[name] = f.mixer.clipAction(c); return true; }
function stehenBauen(R, name = 'stehen') {
  const ART = STEHEN_ARTEN[name] || AKTIONEN[name] || {}, g0 = ART.gewicht || 0, ag = Math.abs(g0);
  const braucht = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'Head']; if (braucht.some(n => !R.has(n))) return null;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion(), T = ART.T || 12, N = ART.T ? Math.max(13, Math.round(ART.T * 24) + 1) : 73, zeiten = new Float32Array(N); for (let i = 0; i < N; i++) zeiten[i] = T * i / (N - 1);
  const reihe = [], gesehen = new Set(), nimm = k => { if (gesehen.has(k) || !R.has(k)) return; const e = R.get(k).eltern; if (e) nimm(e); gesehen.add(k); reihe.push(k); }; for (const k of R.keys()) nimm(k);
  const unterHuefte = new Set(['Hips']); for (const k of reihe) if (R.get(k).eltern && unterHuefte.has(R.get(k).eltern)) unterHuefte.add(k);
  const H = R.get('Hips'), hoch = H.wp.y, lange = (a, b) => R.get(a).wp.distanceTo(R.get(b).wp), Lo = { Left: lange('LeftUpLeg', 'LeftLeg'), Right: lange('RightUpLeg', 'RightLeg') }, Lu = { Left: lange('LeftLeg', 'LeftFoot'), Right: lange('RightLeg', 'RightFoot') };
  const seiteX = Math.sign(R.get('LeftArm').wp.x - R.get('RightArm').wp.x) || 1, mx = (R.get('LeftUpLeg').wp.x + R.get('RightUpLeg').wp.x) / 2, mz = (R.get('LeftFoot').wp.z + R.get('RightFoot').wp.z) / 2, breit = (Math.abs(R.get('LeftUpLeg').wp.x - R.get('RightUpLeg').wp.x) * 0.5 + hoch * 0.035) * (ART.breit || 1);
  const fuss = { Left: V(mx + seiteX * breit, R.get('LeftFoot').wp.y, mz + hoch * 0.022), Right: V(mx - seiteX * breit, R.get('RightFoot').wp.y, mz - hoch * 0.016) };
  // Spielbein: das freie Bein steht etwas vor und außen, das Gewicht liegt auf dem anderen
  const frei = g0 > 0 ? 'Right' : g0 < 0 ? 'Left' : null; if (frei) { fuss[frei].z += hoch * 0.06 * ag; fuss[frei].x += (frei === 'Left' ? 1 : -1) * seiteX * hoch * 0.02 * ag; }
  const hx0 = seiteX * g0 * hoch * 0.03, neig0 = seiteX * g0 * 0.042, yFuss = { Left: seiteX * (frei === 'Left' ? 0.26 : 0.07), Right: -seiteX * (frei === 'Right' ? 0.26 : 0.07) };
  const armPose = typeof ART.arme === 'function' ? null : { taschen: s => [V(s * 0.17, -1, -0.03), V(-s * 0.1, -1, 0.26)], huefte: s => [V(s * 0.64, -1, -0.14), V(-s * 0.95, -0.42, 0.2)], verschraenkt: s => [V(s * 0.15, -1, 0.1), s === seiteX ? V(-s * 0.9, 0.2, 0.44) : V(-s * 0.9, 0.06, 0.5)], ruecken: s => [V(s * 0.17, -1, -0.24), V(-s * 0.55, -0.62, -0.44)] }[ART.arme];
  const werte = new Map([...reihe].filter(k => unterHuefte.has(k)).map(k => [k, new Float32Array(N * 4)])), huefte = new Float32Array(N * 3);
  const delta = Q(), welt = new Map(), dq = new Map(), _a = Q(), _b = V(), _c = V(), _z = V(0, 0, 1), rx = Q(), ry = Q(), rz = Q(), X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  const eltH = R.get(H.eltern), pw = H.w.clone().multiply(H.q.clone().invert()), pwI = pw.clone().invert(), sP = eltH ? Math.max(1e-6, H.p.length() / Math.max(1e-6, H.wp.distanceTo(eltH.wp))) : 1;
  const armZiel = (k, kind, ziel) => { const r = R.get(k), dir = _b.subVectors(R.get(kind).wp, r.wp).normalize(); const d = Q().setFromUnitVectors(dir, ziel); dq.set(k, d); welt.set(k, d.clone().multiply(r.w)); };
  for (let i = 0; i < N; i++) {
    const w = zeiten[i] / T * Math.PI * 2, gew = Math.sin(w), atem = Math.sin(w * 3), hA = ART.hueft ? ART.hueft(w) : null, hx = hoch * (0.0075 * gew * (ART.T ? 0 : 1) + (hA ? hA[0] : 0)) + hx0, hy = -hoch * (0.016 + 0.0008 * atem + 0.007 * ag) + (hA ? hA[1] * hoch : 0), lage = V(hx, hy, 0);
    welt.clear(); dq.clear();
    // Rumpf, Hals und Kopf: kleine Drehungen um die Ruhehaltung
    const neig = -seiteX * (0.0055 * gew * (ART.T ? 0 : 1) + (ART.neig ? ART.neig(w) : 0)); rz.setFromAxisAngle(Z, neig + neig0); rx.setFromAxisAngle(X, 0.006 * atem + 0.012); ry.setFromAxisAngle(Y, 0.1 * Math.sin(w * 2 + 1) + 0.07 * Math.sin(w + 2.2) + 0.03 * Math.sin(w * 3 + 0.4)).multiply(new THREE.Quaternion().setFromAxisAngle(X, 0.03 * Math.sin(w * 2 + 2.6) + 0.012));
    dq.set('Hips', rz.clone()); const dBrust = Q().multiplyQuaternions(rx, new THREE.Quaternion().setFromAxisAngle(Z, neig - neig0 * 0.55)).normalize(), rzM = new THREE.Quaternion().setFromAxisAngle(Z, neig + neig0 * 0.3), rzH = new THREE.Quaternion().setFromAxisAngle(Z, neig - neig0 * 0.25), rzK = rz.clone();
    for (const k of reihe) { if (!unterHuefte.has(k)) continue; const r = R.get(k); let d = null;
      if (k === 'Hips') d = rzK; else if (/^spine$/i.test(k) || /^spine0?1$/i.test(k)) d = rzM; else if (/^spine0?2$|shoulder/i.test(k)) d = dBrust; else if (/^neck$/i.test(k)) d = rzH; else if (/^head/i.test(k)) d = ry; else if (/toe/i.test(k)) d = null;
      welt.set(k, d ? d.clone().multiply(r.w) : r.w.clone()); }
    // Arme hängen locker, leicht vom Körper weg, Unterarm etwas nach vorn; Hände folgen dem Unterarm
    for (const [S, sx, ph] of [['Left', seiteX, 0], ['Right', -seiteX, 1.7]]) {
      const sw = Math.sin(w * 2 + ph) * 0.006;
      if (ART.arme && typeof ART.arme === 'function') { const [o, u] = ART.arme(sx, w, S); armZiel(S + 'Arm', S + 'ForeArm', o.normalize()); armZiel(S + 'ForeArm', S + 'Hand', u.normalize()); }
      else if (armPose) { const [o, u] = armPose(sx); o.z += sw; u.z += sw; u.y += sw; armZiel(S + 'Arm', S + 'ForeArm', o.normalize()); armZiel(S + 'ForeArm', S + 'Hand', u.normalize()); }
      else { armZiel(S + 'Arm', S + 'ForeArm', V(sx * 0.115, -1, 0.01 + sw).normalize()); armZiel(S + 'ForeArm', S + 'Hand', V(sx * 0.05, -1, 0.17 + sw * 2).normalize()); }
      welt.set(S + 'Hand', dq.get(S + 'ForeArm').clone().multiply(R.get(S + 'Hand').w));
      // Beine: Knie zeigt nach vorn, Fuß bleibt stehen
      const fA = ART.fuss ? ART.fuss(S, w) : null, a = _b.copy(R.get(S + 'UpLeg').wp).sub(H.wp).applyQuaternion(rzK).add(H.wp).add(lage), f = fA ? V(fuss[S].x + fA[0] * hoch, fuss[S].y + fA[1] * hoch, fuss[S].z + fA[2] * hoch) : fuss[S], to = _c.subVectors(f, a), d = Math.min(to.length(), (Lo[S] + Lu[S]) * 0.9985); to.normalize();
      const co = THREE.MathUtils.clamp((Lo[S] * Lo[S] + d * d - Lu[S] * Lu[S]) / (2 * Lo[S] * d), -1, 1), si = Math.sqrt(1 - co * co), p = V().copy(_z).addScaledVector(to, -_z.dot(to)).normalize(), knie = V().copy(a).addScaledVector(to, Lo[S] * co).addScaledVector(p, Lo[S] * si);
      const d1 = V().subVectors(knie, a).normalize(), d2 = V().copy(a).addScaledVector(to, d).sub(knie).normalize();
      const rO = R.get(S + 'UpLeg'), rU = R.get(S + 'Leg'), q1 = Q().setFromUnitVectors(V().subVectors(rU.wp, rO.wp).normalize(), d1), q2 = Q().setFromUnitVectors(V().subVectors(R.get(S + 'Foot').wp, rU.wp).normalize(), d2);
      welt.set(S + 'UpLeg', q1.multiply(rO.w)); welt.set(S + 'Leg', q2.multiply(rU.w)); const qF = new THREE.Quaternion().setFromAxisAngle(Y, yFuss[S]); welt.set(S + 'Foot', qF.clone().multiply(R.get(S + 'Foot').w)); for (const k of reihe) if (/toe/i.test(k) && k.startsWith(S)) welt.set(k, qF.clone().multiply(R.get(k).w));
    }
    // lokal: Eltern invers mal Welt
    for (const k of reihe) { if (!unterHuefte.has(k)) continue; const r = R.get(k), e = r.eltern && welt.get(r.eltern), el = e || pw; _a.copy(el).invert().multiply(welt.get(k)).normalize(); const v = werte.get(k), o = i * 4; if (i && v[o - 4] * _a.x + v[o - 3] * _a.y + v[o - 2] * _a.z + v[o - 1] * _a.w < 0) { _a.x *= -1; _a.y *= -1; _a.z *= -1; _a.w *= -1; } v[o] = _a.x; v[o + 1] = _a.y; v[o + 2] = _a.z; v[o + 3] = _a.w; }
    const dl = V().copy(lage).applyQuaternion(pwI).multiplyScalar(sP).add(H.p); huefte[i * 3] = dl.x; huefte[i * 3 + 1] = dl.y; huefte[i * 3 + 2] = dl.z;
  }
  const spuren = []; for (const [k, v] of werte) spuren.push(new THREE.QuaternionKeyframeTrack(`${k}.quaternion`, zeiten, v)); spuren.push(new THREE.VectorKeyframeTrack('Hips.position', zeiten, huefte));
  return new THREE.AnimationClip(name, T, spuren);
}
// Bewegungen für eine Figur (einmal je Netz, Varianten teilen es)
function bewegungenFuer(src, extra) {
  if (!extra.size) return extra;
  let m = _umgerechnet.get(src.scene);
  if (!m) { m = { ruhe: src.ruhe ||= ruhehaltung(src.scene), clips: new Map() }; _umgerechnet.set(src.scene, m); }
  if (!m.fertig) { m.fertig = true; for (const [n, c] of extra) if (!m.clips.has(n)) { m.clips.set(n, (n === 'stehen' && stehenBauen(m.ruhe)) || umrechnen(c, c.userData?.ruhe, m.ruhe)); }
    if (extra.has('stehen')) for (const n of Object.keys(STEHEN_ARTEN)) if (n !== 'stehen') { const c = stehenBauen(m.ruhe, n); if (c) m.clips.set(n, c); } }
  return m.clips;
}

// Eine Figur in die Szene setzen, mit eigenem Mixer. play(name) blendet weich über.
export function spawn(src, extra = new Map()) {
  const inner = SkeletonUtils.clone(src.scene);
  if (src.material) inner.traverse(o => { if (o.isMesh) o.material = src.material; });
  // kein Frustum Culling für Figuren: three berechnet sonst beim ersten Bild die Hülle jeder Figur über alle Knochen auf der CPU
  // (56 Figuren, 370 ms Stocken beim ersten Bild mit dem Ort, 29.10.2026). Ferne Figuren blendet die Menge selbst aus (kit/crowd.js).
  // Auch das Sortieren fragt nach der Hülle (WebGLRenderer.projectObject), darum eine feste Hülle aus der Ruhehaltung (ohne Knochen) vorgeben
  inner.traverse(o => { if (!o.isMesh) return; o.frustumCulled = false; if (o.isSkinnedMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); o.boundingSphere = o.geometry.boundingSphere.clone(); o.boundingSphere.radius *= 1.5; } });
  inner.scale.set(src.scale * (src.breit || 1), src.scale, src.scale * (src.breit || 1));
  inner.position.y = -src.minY * src.scale;
  if (src.kopfteil) kopfteilSetzen(inner, src);
  const obj = new THREE.Group(); obj.add(inner);
  const mixer = new THREE.AnimationMixer(inner);
  const acts = {};
  if (src.gehen) acts.gehen = mixer.clipAction(src.gehen);
  for (const [n, c] of bewegungenFuer(src, extra)) acts[n] = mixer.clipAction(c);
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
  return { obj, mixer, acts, play, setSpeed, src };
}
