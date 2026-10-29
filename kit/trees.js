// Bäume aus dem freien Generator EZ-Tree (MIT, Daniel Greenheck), auf echte Höhen in Metern skaliert.
// Je Art wird einmal erzeugt, alle weiteren Bäume teilen Geometrie und Material (2 Zeichenaufrufe je Baum).
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

export const BAEUME = [
  { id: 'esche', name: 'Straßenbaum Esche', preset: 'Ash Medium', hoehe: 11, seed: 11, info: 'Laubbaum für Straßen und Plätze, lockere Krone, wiegt sich im Wind' },
  { id: 'eiche', name: 'Eiche', preset: 'Oak Medium', hoehe: 13, seed: 7, info: 'breite, knorrige Krone für Parks und Höfe' },
  { id: 'espe', name: 'Espe', preset: 'Aspen Medium', hoehe: 12, seed: 5, info: 'schlanker Baum mit hellem Stamm' },
  { id: 'kiefer', name: 'Kiefer', preset: 'Pine Medium', hoehe: 14, seed: 3, info: 'Nadelbaum für Nordeuropa, Gebirge, Taiga' },
  { id: 'busch', name: 'Busch', preset: 'Bush 1', hoehe: 1.7, seed: 2, info: 'Strauch für Vorgärten, Parks und Mittelstreifen' },
];

const vorlagen = new Map();

export function vorlage(def, seed, leicht) {
  const key = def.id + ':' + seed + (leicht ? ':l' : '');
  if (vorlagen.has(key)) return vorlagen.get(key);
  const t = new Tree();
  t.loadPreset(def.preset);
  t.options.seed = seed;
  if (leicht) {   // Straßenbaum für Szenen: halbe Unterteilung, weniger aber größere Blätter
    const b = t.options.branch;
    b.levels = Math.min(b.levels, 2);
    for (const k in b.sections) b.sections[k] = Math.max(2, Math.round(b.sections[k] * 0.4));
    for (const k in b.segments) b.segments[k] = Math.max(3, Math.round(b.segments[k] * 0.5));
    t.options.leaves.count = Math.max(4, Math.round(t.options.leaves.count * 0.42));
    t.options.leaves.size *= 2.0;            // weniger, aber größere doppelte Blattflächen: volle Krone, wenig Dreiecke
  }
  t.generate();
  const box = new THREE.Box3().setFromObject(t);
  const v = { tree: t, scale: def.hoehe / Math.max(0.01, box.max.y - box.min.y), tris: t.triangleCount };
  vorlagen.set(key, v);
  return v;
}

export function makeTree(def, seed = def.seed, leicht = false) {
  const v = vorlage(def, seed, leicht);
  const g = new THREE.Group();
  for (const src of [v.tree.branchesMesh, v.tree.leavesMesh]) {
    const m = new THREE.Mesh(src.geometry, src.material);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  g.scale.setScalar(v.scale);
  g.userData = { ...def, tris: v.tris, drawCalls: 2, vorlage: v };
  return g;
}

// Viele Bäume als Instanzen: je Vorlage zwei Zeichenaufrufe (Äste, Blätter) statt zwei je Baum.
// Der Wind Shader von EZ-Tree kennt keine Instanzen, darum bekommt die Blattkopie die Instanzmatrix dazu.
const blattKopien = new Map();
export function blattMitInstanzen(mat) {
  if (blattKopien.has(mat)) return blattKopien.get(mat);
  const orig = mat.onBeforeCompile, m = mat.clone();
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('mvPosition = modelViewMatrix * mvPosition;', '#ifdef USE_INSTANCING\n        mvPosition = instanceMatrix * mvPosition;\n        #endif\n        mvPosition = modelViewMatrix * mvPosition;');
  };
  blattKopien.set(mat, m);
  return m;
}

export function instanzBaeume(baeume) {
  const gruppen = new Map();
  for (const t of baeume) {
    t.updateMatrix();
    const key = t.userData.vorlage;
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(t);
  }
  const out = new THREE.Group(), M = new THREE.Matrix4();
  for (const [v, liste] of gruppen) {
    [v.tree.branchesMesh, v.tree.leavesMesh].forEach((src, i) => {
      const mat = i === 1 ? blattMitInstanzen(src.material) : src.material;
      const im = new THREE.InstancedMesh(src.geometry, mat, liste.length);
      liste.forEach((t, k) => im.setMatrixAt(k, M.copy(t.matrix)));
      im.castShadow = i === 0 && (liste[0].children[i]?.castShadow ?? true); im.receiveShadow = true;   // Blätter ohne eigenen Schatten (spart ein Drittel)
      im.computeBoundingSphere();
      out.add(im);
    });
  }
  return out;
}

// Wind: alle Bäume einer Art teilen das Blattmaterial, ein Aufruf je Vorlage reicht
export function updateTrees(t) {
  for (const v of vorlagen.values()) v.tree.update(t);
  for (const m of blattKopien.values()) if (m.userData.shader) m.userData.shader.uniforms.uTime.value = t;
}

// Jahreszeit (07_AUSBAU.md Block 4, seit 29.10.2026): Blattfarbe je Monat. Frühling hell, Sommer satt, Herbst orange bis braun,
// Winter kahl (Blätter fast unsichtbar: Farbe dunkelbraun, die Krone wirkt als Astwerk). Gilt für alle Blattmaterialien (auch die Instanzkopien).
export function jahreszeit(monat) {
  const t = [[0.52, 0.42, 0.3], [0.52, 0.42, 0.3], [0.62, 0.62, 0.4], [0.86, 1.0, 0.72], [0.95, 1.05, 0.85], [1, 1, 1], [1, 1, 1], [1, 0.98, 0.92], [1.0, 0.9, 0.65], [1.05, 0.72, 0.38], [0.85, 0.55, 0.3], [0.52, 0.42, 0.3]][Math.max(0, Math.min(11, monat - 1))];
  const alle = new Set(blattKopien.values()); for (const v of vorlagen.values()) alle.add(v.tree.leavesMesh.material);
  for (const m of alle) if (m && m.color) m.color.setRGB(t[0], t[1], t[2]);
}
