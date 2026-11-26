// Bäume aus dem freien Generator EZ-Tree (MIT, Daniel Greenheck), auf echte Höhen in Metern skaliert.
// Je Art wird einmal erzeugt, alle weiteren Bäume teilen Geometrie und Material (2 Zeichenaufrufe je Baum).
import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';

export const BAEUME = [
  { id: 'esche', name: 'Straßenbaum Esche', preset: 'Ash Medium', rinde: 'willow', hoehe: 11, seed: 11, info: 'Laubbaum für Straßen und Plätze, lockere Krone, wiegt sich im Wind' },
  { id: 'eiche', name: 'Eiche', preset: 'Oak Medium', rinde: 'oak', hoehe: 13, seed: 7, info: 'breite, knorrige Krone für Parks und Höfe' },
  { id: 'espe', name: 'Espe', preset: 'Aspen Medium', rinde: 'birch', hoehe: 12, seed: 5, info: 'schlanker Baum mit hellem Stamm' },
  { id: 'kiefer', name: 'Kiefer', preset: 'Pine Medium', rinde: 'pine', hoehe: 14, seed: 3, info: 'Nadelbaum für Nordeuropa, Gebirge, Taiga' },
  { id: 'busch', name: 'Busch', preset: 'Bush 1', rinde: 'willow', hoehe: 1.7, seed: 2, info: 'Strauch für Vorgärten, Parks und Mittelstreifen' },
  { id: 'palme', name: 'Palme', eigen: palme, hoehe: 11, seed: 4, info: 'Dattelpalme für warme Länder: gebogener Stamm, Krone aus 13 Wedeln, wiegt sich im Wind' },
  { id: 'regenwald', name: 'Regenwaldbaum', preset: 'Ash Large', rinde: 'willow', rindeTon: [1.12, 1.12, 1.06], hoehe: 30, seed: 21, info: 'Baum des Kronendachs im tropischen Regenwald: langer Stamm, breite dichte Krone', mod: t => { const b = t.options.branch; b.radius[0] = 1.15; b.start[1] = 0.56; b.length[0] = 52; b.length[1] = 21; b.angle[1] = 58; b.children[0] = 8; b.children[1] = 5; b.force.strength = 0.012; t.options.leaves.size *= 1.25; t.options.leaves.count = 24; t.options.leaves.tint = 0xc4dca8; } },
  { id: 'urwaldriese', name: 'Urwaldriese', preset: 'Oak Large', rinde: 'oak', rindeTon: [1.08, 1.06, 1.0], hoehe: 48, seed: 33, info: 'ragt über das Kronendach hinaus, kahler Stamm, flache Schirmkrone', mod: t => { const b = t.options.branch; b.radius[0] = 1.9; b.start[1] = 0.74; b.length[0] = 70; b.length[1] = 20; b.angle[1] = 72; b.children[0] = 7; b.gnarliness[0] = 0.04; b.force.strength = -0.01; t.options.leaves.tint = 0xb8d09a; } },
  { id: 'akazie', name: 'Schirmakazie', preset: 'Oak Medium', rinde: 'oak', rindeTon: [0.9, 0.86, 0.8], hoehe: 9, seed: 17, info: 'Savanne: flache Krone, offene Äste', mod: t => { const b = t.options.branch; b.start[1] = 0.52; b.length[0] = 16; b.length[1] = 15; b.angle[1] = 74; b.children[0] = 6; b.force.strength = -0.05; t.options.leaves.count = Math.round(t.options.leaves.count * 0.7); t.options.leaves.tint = 0xcfd59a; } },
  { id: 'fichte', name: 'Fichte', preset: 'Pine Large', rinde: 'pine', rindeTon: [0.86, 0.86, 0.9], hoehe: 26, seed: 9, info: 'Nordwald und Gebirge: schlanker Kegel, dunkle Nadeln', mod: t => { t.options.leaves.tint = 0xa8c0a0; } },
];

// Palme (05.11.2026): eigener Generator mit derselben Schnittstelle wie EZ-Tree (branchesMesh, leavesMesh, update)
function palme() {
  const g = new THREE.Group(), R = (() => { let s = 77; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  // Stamm: 9 Ringe, leicht gebogen, zur Spitze dünner, Ringe als Wechsel der Dicke
  const pos = [], nor = [], idx = [], SEG = 7, RI = 12, H = 11, bug = 1.1;
  for (let i = 0; i <= RI; i++) { const t = i / RI, cx = bug * t * t, y = H * t, r = (0.34 - 0.15 * t) * (1 + (i % 2 ? 0.05 : -0.03)); for (let k = 0; k <= SEG; k++) { const a = k / SEG * Math.PI * 2; pos.push(cx + Math.cos(a) * r, y, Math.sin(a) * r); nor.push(Math.cos(a), 0, Math.sin(a)); } }
  for (let i = 0; i < RI; i++) for (let k = 0; k < SEG; k++) { const a = i * (SEG + 1) + k, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); sg.setIndex(idx);
  const stamm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x7a644a, roughness: 0.95 }));
  // Wedel: Bild mit Fiedern, gebogene Streifen
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null; let tex = null;
  if (c) { c.width = 128; c.height = 512; const x = c.getContext('2d'); x.clearRect(0, 0, 128, 512); x.strokeStyle = '#5a6a2a'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 512); x.lineTo(64, 0); x.stroke(); for (let y = 500; y > 8; y -= 7) { const t = y / 512, l = 58 * Math.sin(Math.min(1, t * 1.08) * Math.PI * 0.92 + 0.08); const f = `rgb(${70 + (y * 13 % 40)},${112 + (y * 7 % 46)},${40 + (y * 5 % 24)})`; x.strokeStyle = f; x.lineWidth = 3.2; x.beginPath(); x.moveTo(64, y); x.quadraticCurveTo(64 - l * 0.6, y - 10, 64 - l, y - 22); x.moveTo(64, y); x.quadraticCurveTo(64 + l * 0.6, y - 10, 64 + l, y - 22); x.stroke(); } tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
  const lp = [], ln = [], lu = [], li = [], SE = 7;
  for (let w = 0; w < 13; w++) { const a = w / 13 * Math.PI * 2 + R() * 0.2, stufe = w % 2, L = 3.6 + R() * 1.2, hoch = stufe ? 0.95 : 0.45, ax = Math.cos(a), az = Math.sin(a), n0 = lp.length / 3, br = 0.72 + R() * 0.16; for (let i = 0; i <= SE; i++) { const t = i / SE, d = L * t, y = H + d * hoch - 2.7 * d * d / (L * L) * L * (0.5 + 0.2 * stufe), cx = bug + ax * d, cz = az * d, b = br * (1 - 0.1 * t); lp.push(cx - az * b, y - 0.05, cz + ax * b, cx + az * b, y - 0.05, cz - ax * b); ln.push(0, 1, 0, 0, 1, 0); lu.push(0, t, 1, t); } for (let i = 0; i < SE; i++) { const p = n0 + i * 2; li.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); } }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2)); lg.setIndex(li);
  const krone = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }));
  g.add(stamm, krone); g.branchesMesh = stamm; g.leavesMesh = krone; g.update = () => {}; g.triangleCount = (idx.length + li.length) / 3;
  return g;
}

const vorlagen = new Map(), RINDE_KACHEL = 1.1;   // Meter echte Rinde je Texturkachel
// Licht durch die Blätter (05.11.2026): Sonne und Himmel scheinen durch das Laub, sonst stehen Bäume im Gegenlicht wie schwarze Scherenschnitte
export const BLATT_LICHT = { value: new THREE.Color(0.12, 0.13, 0.12) };

export function vorlage(def, seed, leicht) {
  const key = def.id + ':' + seed + (leicht ? ':l' : '');
  if (vorlagen.has(key)) return vorlagen.get(key);
  if (def.eigen) { const t = def.eigen(), box = new THREE.Box3().setFromObject(t), v = { tree: t, scale: def.hoehe / Math.max(0.01, box.max.y - box.min.y), tris: t.triangleCount }; vorlagen.set(key, v); return v; }
  const t = new Tree();
  t.loadPreset(def.preset);
  t.options.seed = seed;
  def.mod?.(t);
  if (leicht) {   // Straßenbaum für Szenen: halbe Unterteilung, weniger aber größere Blätter
    const b = t.options.branch;
    b.levels = Math.min(b.levels, 2);
    for (const k in b.sections) b.sections[k] = Math.max(2, Math.round(b.sections[k] * 0.4));
    for (const k in b.segments) b.segments[k] = k === '0' ? Math.max(8, b.segments[k]) : Math.max(3, Math.round(b.segments[k] * 0.5));   // Stamm rund, Äste einfach
    t.options.leaves.count = Math.max(4, Math.round(t.options.leaves.count * 0.42));
    t.options.leaves.size *= 2.0;            // weniger, aber größere doppelte Blattflächen: volle Krone, wenig Dreiecke
  }
  if (def.rinde) t.options.bark.type = def.rinde;
  if (!leicht) { const b = t.options.branch; b.segments[0] = Math.max(14, b.segments[0]); if (b.segments[1] !== undefined) b.segments[1] = Math.max(8, b.segments[1]); }   // runde Stämme (vorher 8 Kanten)
  t.generate();
  // Rinde in echten Maßen: eine Kachel sind rund 1,1 m echte Rinde. Der Maßstab steht erst nach dem ersten Bau fest, darum ein zweiter Bau mit derselben Saat (07.11.2026)
  { const b0 = new THREE.Box3().setFromObject(t), s0 = def.hoehe / Math.max(0.01, b0.max.y - b0.min.y); t.options.bark.kachel = RINDE_KACHEL / s0; t.options.bark.textureScale = { x: 1, y: 1 }; t.generate(); }
  t.branchesMesh.material.color?.multiplyScalar(def.mod ? 2.4 : 1.5);   // Rinde heller: im Schatten sonst fast schwarz
  if (def.rindeTon) { const c = t.branchesMesh.material.color; c?.setRGB(c.r * def.rindeTon[0], c.g * def.rindeTon[1], c.b * def.rindeTon[2]); }
  if (def.id === 'kiefer' || def.id === 'fichte') { const c = t.branchesMesh.material.color; c?.setRGB(c.r * 0.86, c.g * 0.86, c.b * 0.74); }   // Rinde der Nadelbäume nicht rosa
  { const m = t.branchesMesh.material, alt = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { alt?.call(m, sh, r); sh.uniforms.uBlattLicht = BLATT_LICHT; sh.fragmentShader = 'uniform vec3 uBlattLicht;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * vec3(dot(uBlattLicht, vec3(0.42))) * 1.25;\n#include <opaque_fragment>'); }; m.customProgramCacheKey = () => 'rinde1'; m.needsUpdate = true; }   // Licht aus dem Wald ringsum: Stämme stehen sonst im Gegenlicht schwarz da
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
    sh.uniforms.uBlattLicht = BLATT_LICHT;
    sh.fragmentShader = 'uniform vec3 uBlattLicht;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * uBlattLicht;\n#if NUM_DIR_LIGHTS > 0\n{ float gegen = clamp(-dot(normalize(vViewPosition), directionalLights[0].direction), 0.0, 1.0); outgoingLight += diffuseColor.rgb * vec3(1.0, 1.25, 0.42) * directionalLights[0].color * gegen * gegen * 0.2; }\n#endif\n{ float blL = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)); outgoingLight = mix(vec3(blL), outgoingLight, 0.62) * vec3(1.05, 0.97, 0.92); }\n#include <opaque_fragment>').replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      { float dK = length(vViewPosition); if (dK < 3.0) { float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (ign > (dK - 0.6) / 2.4) discard; } }`);   // Äste direkt vor der Kamera lösen sich auf, statt das Bild zu verdecken
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
  for (const m of blattKopien.values()) if (m.userData.shader?.uniforms.uTime) m.userData.shader.uniforms.uTime.value = t;
}

// Jahreszeit (07_AUSBAU.md Block 4, seit 29.10.2026): Blattfarbe je Monat. Frühling hell, Sommer satt, Herbst orange bis braun,
// Winter kahl (Blätter fast unsichtbar: Farbe dunkelbraun, die Krone wirkt als Astwerk). Gilt für alle Blattmaterialien (auch die Instanzkopien).
export function jahreszeit(monat) {
  const t = [[0.52, 0.42, 0.3], [0.52, 0.42, 0.3], [0.62, 0.62, 0.4], [0.86, 1.0, 0.72], [0.95, 1.05, 0.85], [1, 1, 1], [1, 1, 1], [1, 0.98, 0.92], [1.0, 0.9, 0.65], [1.05, 0.72, 0.38], [0.85, 0.55, 0.3], [0.52, 0.42, 0.3]][Math.max(0, Math.min(11, monat - 1))];
  const alle = new Set(blattKopien.values()); for (const v of vorlagen.values()) alle.add(v.tree.leavesMesh.material);
  for (const m of alle) if (m && m.color) m.color.setRGB(t[0], t[1], t[2]);
}
