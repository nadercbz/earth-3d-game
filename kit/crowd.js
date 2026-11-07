// Menschen in der Stadt nach Regelwerk 1.4 und Naders Wunsch (28.10.2026): unterschiedliche Tätigkeiten, keine Runden,
// niemand läuft durch einen anderen. Jeder Mensch hat ein Ziel und eine Route über Gehwege und Zebrastreifen,
// geht rechts, weicht aus, überholt, wartet bei Rot. Dazu Paare, Jogger, Menschen mit Handy, Gespräche bei Begegnungen,
// Gruppen im Gespräch, Umschauen, Stehen, Telefonieren. Wer am Ende der Straße ankommt, geht aus dem Bild und kommt
// woanders wieder herein, sofern die Kamera beide Stellen nicht sieht.
import * as THREE from 'three';
import { spawn } from './people.js';
import { rng } from './geo.js';
import { NACHT } from './materials.js';
import { nurSichtbar } from './statisch.js';

// Ferne Menschen als Bild (03.11.2026, Nader: "poppen auf einmal immer Menschen auf"): gezeichnet werden höchstens die nächsten 30 Figuren,
// dahinter erschienen sie aus dem Nichts. Jetzt steht hinter der Grenze bis IMP_WEIT ein Bild derselben Figur (einmal je Quelle von vorn
// gerendert, im Gehen), immer zur Kamera gedreht, ein Aufruf für alle. Beim Wechsel zur echten Figur ändert sich kaum etwas.
const STEH_MIX = ['stehen', 'stehen', 'stehen_kontra', 'stehen_kontra', 'stehen_kontra2', 'stehen_kontra2', 'stehen_arme', 'stehen_taschen', 'stehen_taschen', 'stehen_huefte', 'stehen_ruecken'];
const IMP_WEIT = 150, IMP_WEIT_HANDY = 80, ATLAS = new WeakMap();
function atlasBauen(renderer, quellen, bewegungen) {
  const n = quellen.length, Z = 64, H = 128, spalten = Math.min(n, 16), zeilen = Math.ceil(n / spalten);
  const rt = new THREE.WebGLRenderTarget(spalten * Z, zeilen * H, { samples: 4 });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace; rt.texture.minFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false;
  const szene = new THREE.Scene(); szene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
  const sonne = new THREE.DirectionalLight(0xffffff, 2.2); sonne.position.set(1.5, 3, 4); szene.add(sonne);
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 1, 0, 0.1, 30); cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  const alt = { rt: renderer.getRenderTarget(), farbe: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), scissor: renderer.getScissorTest(), vp: renderer.getViewport(new THREE.Vector4()), sc: renderer.getScissor(new THREE.Vector4()) };
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.setScissorTest(true);
  const groesse = [];
  quellen.forEach((q, i) => {
    const f = spawn(q, bewegungen); f.play('gehen', 0); f.mixer.update(0.45); szene.add(f.obj); f.obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(f.obj, true), h = Math.max(0.5, box.max.y - box.min.y), w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z), sz = Math.max(h * 1.04, w * 2.1);
    cam.left = -sz / 4; cam.right = sz / 4; cam.bottom = box.min.y; cam.top = box.min.y + sz; cam.updateProjectionMatrix();
    const x = (i % spalten) * Z, y = Math.floor(i / spalten) * H; renderer.setViewport(x, y, Z, H); renderer.setScissor(x, y, Z, H);
    renderer.render(szene, cam); szene.remove(f.obj); groesse.push(sz);
  });
  renderer.setViewport(alt.vp); renderer.setScissor(alt.sc); renderer.setScissorTest(alt.scissor); renderer.setRenderTarget(alt.rt); renderer.setClearColor(alt.farbe, alt.alpha);   // Bildausschnitt zurück (sonst zeichnete das Spiel in eine Ecke)
  return { tex: rt.texture, groesse, spalten, zeilen };
}
function bilderMesh(atlas, max) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
  const zelle = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2); geo.setAttribute('aZelle', zelle);
  const mat = new THREE.MeshBasicMaterial({ map: atlas.tex, alphaTest: 0.5, fog: true });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uZelle = { value: new THREE.Vector2(1 / atlas.spalten, 1 / atlas.zeilen) }; sh.uniforms.uNacht = NACHT;
    sh.vertexShader = 'attribute vec2 aZelle;\nuniform vec2 uZelle;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vMapUv * uZelle + aZelle;')
      .replace('#include <project_vertex>', `vec3 bC = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  float bSx = length( instanceMatrix[ 0 ].xyz ), bSy = length( instanceMatrix[ 1 ].xyz );
  vec3 bRechts = normalize( vec3( viewMatrix[ 0 ][ 0 ], 0.0, viewMatrix[ 2 ][ 0 ] ) + 1e-5 );   // zur Kamera gedreht, aufrecht
  vec4 mvPosition = modelViewMatrix * vec4( bC + bRechts * position.x * bSx + vec3( 0.0, position.y * bSy, 0.0 ), 1.0 );
  gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = 'uniform float uNacht;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 0.78 * ( 1.0 - 1.15 * uNacht );\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'menschenbild';
  const m = new THREE.InstancedMesh(geo, mat, max); m.frustumCulled = false; m.count = 0; m.castShadow = false;
  return m;
}


const WEIT = 85, WEIT_HANDY = 45;   // größte Entfernung, bis zu der Figuren gezeichnet werden (Meter)
const ABSTAND = 0.62;          // harter Mindestabstand zwischen zwei Menschen (Mitte zu Mitte, Meter)
const TEMPO = { gehen: 1.15, gehen_handy: 0.95, joggen: 2.9 };   // Geschwindigkeit, bei der die Animation ohne Rutschen passt
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _qI = new THREE.Quaternion();

export class Menge {
  // wege.knoten: {x, z, art} (Kreuzung aus roads.js) oder [x, z, y, art] (echte Wege aus tools/ort_bauen.py).
  // wege.kanten: [a, b, art, phase, nx, nz, breite]; Normale und Breite nur bei echten Wegen, phase null heißt ohne Ampel.
  // gruppenOrte: feste Stellen für stehende Gruppen. blase: { radius } hält die Menschen um die Kamera (große Orte).
  constructor({ wege, ampel, quellen, bewegungen, anzahl = 16, seed = 5, hoehe = 0.15, kamera, mobil = false, gruppen = 2, gruppenOrte = null, blase = null, linear = false, renderer = null }) {
    this.linear = linear;
    this.ampel = ampel; this.R = rng(seed); this.kamera = kamera; this.mobil = mobil; this.hoehe = hoehe;
    this.bewegungen = bewegungen; this.quellen = quellen; this.blase = blase; this.blaseT = 0;
    this.gruppe = new THREE.Group(); this.alle = [];
    if (!quellen.length) return;
    if (renderer && blase) { if (!ATLAS.has(quellen)) ATLAS.set(quellen, atlasBauen(renderer, quellen, bewegungen)); this.atlas = ATLAS.get(quellen); this.bilder = bilderMesh(this.atlas, 220); this.gruppe.add(this.bilder); }
    // Graph: Knoten, Kanten mit Länge, Art (gehweg, ueberweg), Ampelphase, bei echten Wegen Normale und Breite
    const K = wege.knoten.map(k => Array.isArray(k) ? { x: k[0], z: k[1], y: k[2], art: k[3] } : k);
    this.hoehen = K.some(k => k.y !== undefined);
    this.N = K.map(k => new THREE.Vector3(k.x, k.y ?? hoehe, k.z));
    this.art = K.map(k => k.art);
    this.adj = this.N.map(() => []);
    for (const [a, b, art, phase, nx, nz, w] of wege.kanten) {
      const e = { a, b, art, phase, len: this.N[a].distanceTo(this.N[b]), n: nx !== undefined ? [nx, nz] : null, w };
      if (e.len < 0.05) continue;
      this.adj[a].push(e); this.adj[b].push({ ...e, a: b, b: a });
    }
    if (!this.adj.some(l => l.some(e => e.art === 'gehweg'))) { this.leer = true; return; }   // Ort ohne Wege (mitten im Wald): niemand unterwegs
    this.routen = new Map();   // Ziel -> Abstände und nächster Schritt (Dijkstra bei Bedarf, auch für große Netze)
    this.ziele = this.N.map((_, i) => i).filter(i => this.adj[i].length && !['ecke', 'weg'].includes(this.art[i]));
    this.enden = this.N.map((_, i) => i).filter(i => this.art[i] === 'ende');
    // Menschen in fester Mischung: ein Drittel in Paaren, je ein Achtel Jogger, rund ein Sechstel mit Handy, der Rest allein
    const paare = Math.max(1, Math.round(anzahl / 6)), jogger = Math.max(1, Math.round(anzahl / 8)), handy = Math.max(1, Math.round(anzahl / 6));
    for (let k = 0; k < paare; k++) { const a = this.neu('einzeln'); const b = this.neu('folger'); b.leiter = a; a.partner = b; b.partner = a; }
    for (let k = 0; k < jogger; k++) this.neu('jogger');
    for (let k = 0; k < handy; k++) this.neu('handy');
    for (let k = paare * 2 + jogger + handy; k < anzahl; k++) this.neu('einzeln');
    // Gruppen, die auf dem Gehweg oder auf Plätzen stehen und reden
    if (gruppenOrte) gruppenOrte.slice(0, gruppen).forEach(([x, z]) => this.gruppeImGespraech(new THREE.Vector3(x, this.hoehen ? 0.12 : hoehe, z)));
    else for (let g = 0; g < gruppen; g++) this.gruppeImGespraech();
    if (blase) for (const p of this.alle) if (!p.statisch && p.typ !== 'folger') this.umsetzen(p, true);
  }

  // weitere Menschen nach und nach (Erde, Bau in Scheiben): je Aufruf höchstens n, bis ziel erreicht ist (sonst kostete der Ortswechsel ein Bild von 35 ms)
  nachfuellen(ziel, n = 2) { if (this.leer) return;
    for (let k = 0; k < n && this.alle.length < ziel; k++) { const r = this.R(), p = this.neu(r < 0.12 ? 'jogger' : r < 0.3 ? 'handy' : 'einzeln'); if (this.blase) this.umsetzen(p, !this.ausserSicht); }
  }
  // Ortswechsel auf der Erde (Kachelraster, Wunsch Nr. 36): die Menschen des alten Ortes ziehen mit, statt dass neue erscheinen. Die beim Bau
  // gesetzten verschwinden, jeder alte kommt mit seiner Figur auf den nächsten Weg dieses Netzes (höchstens 3 m daneben), Gruppen bleiben stehen.
  // umrechnen(v): Punkt aus dem alten in diesen Rahmen (in place). Wer hier keinen Weg findet, bleibt im alten Ort und geht mit ihm.
  uebernehmen(alte, umrechnen) {
    for (const p of this.alle) p.f.obj.removeFromParent();
    this.alle = []; this.ausserSicht = true;
    if (!this.N || !alte?.alle) return 0;
    const nimm = new Set(), KZ = 24, gitter = new Map();   // Kanten im Raster (vorher jede Person gegen alle Kanten: 36 ms beim Wechsel)
    for (const l of this.adj) for (const e of l) { const A = this.N[e.a], B = this.N[e.b], n = Math.ceil(e.len / (KZ / 2)) + 1; let letzt = null;
      for (let k = 0; k <= n; k++) { const t = k / n, key = Math.floor((A.x + (B.x - A.x) * t) / KZ) * 100003 + Math.floor((A.z + (B.z - A.z) * t) / KZ); if (key === letzt) continue; letzt = key; (gitter.get(key) || gitter.set(key, []).get(key)).push(e); } }
    const naechsteKante = (x, z, dx, dz) => {
      let best = null, bt = 0, bd = 3; const kanten = new Set(); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const e of gitter.get((Math.floor(x / KZ) + a) * 100003 + Math.floor(z / KZ) + b) || []) kanten.add(e);
      for (const e of kanten) {
        const A = this.N[e.a], B = this.N[e.b], ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez || 1e-9;
        if (Math.abs(A.x - x) > e.len + 3 || Math.abs(A.z - z) > e.len + 3) continue;
        if ((ex * dx + ez * dz) < 0) continue;   // Kante in Gehrichtung (jede Kante liegt in beiden Richtungen in adj)
        const t = Math.max(0, Math.min(1, ((x - A.x) * ex + (z - A.z) * ez) / l2)), d = Math.hypot(A.x + ex * t - x, A.z + ez * t - z);
        if (d < bd) { bd = d; best = e; bt = t; }
      }
      return best ? [best, bt] : null;
    };
    for (const p of alte.alle) if (p.flucht) { p.flucht = null; p.fluchtRy = null; p.zustandVor = null; p.zurueck = 0; p.blick = null; p.push.set(0, 0, 0); p.f.obj.rotation.x = p.f.obj.rotation.z = 0; if (!p.statisch) p.zustand = 'gehen'; }   // Flucht gilt im alten Netz, Kanten und Rahmen sind neu
    for (const p of alte.alle) { if (p.szene) continue;   // Figuren einer Straßenszene (kit/szenen.js) bleiben im alten Ort: sie haben keine Laufrichtung, der Ortswechsel brach daran ab
      if (p.typ === 'folger') continue;
      const pos = umrechnen(p.pos.clone());
      if (p.statisch) { if (naechsteKante(pos.x, pos.z, 0, 0) || this.N.some(k => Math.abs(k.x - pos.x) + Math.abs(k.z - pos.z) < 20)) { p.pos.copy(pos); umrechnen(p.mitte); nimm.add(p); } continue; }
      const vorn = umrechnen(p.pos.clone().add(p.dir)).sub(pos), tr = naechsteKante(pos.x, pos.z, vorn.x, vorn.z);
      if (!tr) continue;
      const [e, t] = tr; p.pos.copy(pos); p.kante = e; p.s = t * e.len; p.zustand = 'gehen'; p.warteAuf = null; p.timer = 0;
      if (p.gespraech) { p.gespraech.gespraech = null; p.gespraech = null; }
      p.ziel = e.b; nimm.add(p);   // erst bis zum Ende der Kante, dort ein neues Ziel (Routen für alle auf einmal kosteten beim Wechsel zu viel)
      if (p.partner && p.partner.typ === 'folger') { umrechnen(p.partner.pos); nimm.add(p.partner); }
    }
    for (const p of alte.alle) if (nimm.has(p)) { if (p.partner && !nimm.has(p.partner)) p.partner = null; this.gruppe.add(p.f.obj); this.alle.push(p); }
    alte.alle = alte.alle.filter(p => !nimm.has(p));
    return this.alle.length;
  }
  // Kürzeste Wege zu einem Ziel (Dijkstra vom Ziel aus, das Netz ist ungerichtet), zwischengespeichert je Ziel
  route(ziel) {
    let r = this.routen.get(ziel);
    if (r) return r;
    const n = this.N.length, D = new Float64Array(n).fill(Infinity), W = new Int32Array(n).fill(-1);
    const heap = [[0, ziel]]; D[ziel] = 0; W[ziel] = ziel;
    const hoch = i => { while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const runter = i => { for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } };
    while (heap.length) {
      const [d, u] = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; runter(0); }
      if (d > D[u]) continue;
      for (const e of this.adj[u]) { const nd = d + e.len; if (nd < D[e.b]) { D[e.b] = nd; W[e.b] = u; heap.push([nd, e.b]); hoch(heap.length - 1); } }
    }
    r = { D, W };
    if (this.routen.size > 300) this.routen.delete(this.routen.keys().next().value);
    this.routen.set(ziel, r);
    return r;
  }
  weiterZu(b, ziel) { return this.route(ziel).W[b]; }
  distanz(a, ziel) { return this.route(ziel).D[a]; }

  // Seitlicher Spielraum auf einer Kante: Gehweg der Kreuzung (Linie nah am Bordstein), echte Wege nach ihrer Breite
  spur(e) {
    if (e.w) { const h = Math.max(0.3, e.w / 2 - 0.35); return [-h, h]; }
    return e.art === 'gehweg' ? [-0.35, 1.75] : [-1.6, 1.6];
  }

  kante(a, b) { return this.adj[a].find(e => e.b === b); }

  // Richtung zur Hausseite (Gehweg) bzw. quer zum Zebrastreifen
  normale(e) {
    if (e.n) return new THREE.Vector3(e.n[0], 0, e.n[1]);
    const A = this.N[e.a], B = this.N[e.b];
    const t = _v.subVectors(B, A).normalize(), n = new THREE.Vector3(-t.z, 0, t.x);
    if (e.art === 'gehweg') { const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2; if (n.x * Math.sign(mx) + n.z * Math.sign(mz) < 0) n.negate(); }
    return n;
  }

  koerper(src) {
    const f = spawn(src, this.bewegungen), meshes = []; f.qi = this.quellen.indexOf(src);
    f.obj.traverse(o => { if (o.isMesh) meshes.push(o); });
    f.obj.updateMatrixWorld = nurSichtbar;   // Skelett mit rund 28 Knochen: nicht gezeichnete Figuren (die meisten) kosten sonst jedes Bild alle Matrizen
    this.gruppe.add(f.obj);
    return { f, meshes };
  }

  neu(typ) {
    const { f, meshes } = this.koerper(this.quellen[Math.floor(this.R() * this.quellen.length)]);
    const kanten = this.gehwegKanten ||= this.adj.flatMap(l => l.filter(e => e.art === 'gehweg'));   // einmal je Netz (vorher je Person, 56 Personen rund 40 ms)
    const e = kanten[Math.floor(this.R() * kanten.length)];
    const vSoll = typ === 'jogger' ? 2.6 + this.R() * 0.6 : typ === 'handy' ? 0.85 + this.R() * 0.2 : 1.05 + this.R() * 0.4;
    const p = { f, meshes, typ, kante: e, s: this.R() * e.len, lat: 0.5, latZiel: 0.5, latV: 0, v: vSoll, vSoll, push: new THREE.Vector3(), pos: new THREE.Vector3(),
      ry: this.R() * 6.28, dir: new THREE.Vector3(0, 0, 1), zustand: 'gehen', timer: 0, ziel: null, cooldown: 2 + this.R() * 8, schatten: null, clip: null };
    if (typ !== 'folger') this.neuesZiel(p);
    this.platz(p, true);
    this.alle.push(p);
    return p;
  }

  gruppeImGespraech(ort = null) {
    // zwei oder drei Menschen stehen auf einem langen geraden Gehweg nahe der Hausseite (oder an einer festen Stelle) und reden
    let mitte = ort;
    if (!mitte) {
      const kanten = this.adj.flatMap(l => l.filter(e => e.art === 'gehweg' && e.len > 20));
      if (!kanten.length) return;
      const e = kanten[Math.floor(this.R() * kanten.length)], n = this.normale(e);
      mitte = new THREE.Vector3().lerpVectors(this.N[e.a], this.N[e.b], 0.12 + this.R() * 0.25).addScaledVector(n, 1.2);
    }
    const anzahl = 2 + (this.R() < 0.6 ? 1 : 0);
    for (let k = 0; k < anzahl; k++) {
      const { f, meshes } = this.koerper(this.quellen[Math.floor(this.R() * this.quellen.length)]);
      const w = (k / anzahl) * Math.PI * 2 + this.R() * 0.4;
      const p = { f, meshes, typ: 'gruppe', zustand: 'gruppe', statisch: true, mitte, v: 0, push: new THREE.Vector3(), schatten: null, clip: null,
        pos: mitte.clone().add(new THREE.Vector3(Math.cos(w) * 0.62, 0, Math.sin(w) * 0.62)), ry: Math.atan2(-Math.cos(w), -Math.sin(w)), timer: 2 + this.R() * 6 };
      this.clip(p, ['reden_a', 'reden_b', 'stehen'][k % 3]);
      this.alle.push(p);
    }
  }

  neuesZiel(p) {
    const von = p.kante.b, min = p.typ === 'jogger' ? 90 : 35, max = this.blase ? this.blase.radius * 1.4 : Infinity;
    let ziel = von;
    for (let t = 0; t < 40; t++) {
      const z = this.ziele[Math.floor(this.R() * this.ziele.length)];
      if (z === von) continue;
      const luft = this.N[z].distanceTo(this.N[von]);
      if (luft < min * 0.7 || luft > max) continue;   // große Netze: erst grob nach Luftlinie, dann den Weg prüfen
      const d = this.distanz(von, z);
      if (d < Infinity && d > min) { ziel = z; break; }
    }
    p.ziel = ziel;
  }

  // Blase um die Kamera: wer zu weit weg ist, kommt auf einem Weg knapp außerhalb der Sichtweite wieder herein
  umsetzen(p, start = false) {
    const cam = this.kamera.position, r = this.blase.radius, sicht = (this.mobil ? WEIT_HANDY : WEIT) * 1.12 + 4;   // neu gesetzte Menschen erscheinen außerhalb der Sichtgrenze
    // Knoten im Umkreis aus einem Raster (vorher 60 Zufallsversuche über den ganzen Ort: im schmalen Ring um die Kamera traf das selten,
    // die Menschen blieben beim Fahren zurück und die Straßen um den Spieler wurden leer)
    if (!this.gitter) { this.gitter = new Map(); this.N.forEach((n, i) => { if (!this.adj[i].length || this.art[i] === 'ende') return; const k = Math.floor(n.x / 40) * 100003 + Math.floor(n.z / 40); (this.gitter.get(k) || this.gitter.set(k, []).get(k)).push(i); }); }
    const kand = [], g0 = Math.floor(cam.x / 40), g1 = Math.floor(cam.z / 40), gr = Math.ceil(r / 40);
    for (let a = -gr; a <= gr; a++) for (let b = -gr; b <= gr; b++) for (const i of this.gitter.get((g0 + a) * 100003 + g1 + b) || []) {
      const d = Math.hypot(this.N[i].x - cam.x, this.N[i].z - cam.z); if (d < r && (start || d > sicht + 5)) kand.push(i);
    }
    const best = kand.length ? kand[Math.floor(this.R() * kand.length)] : null;
    if (best === null) return;
    const e = this.adj[best].find(k => k.art !== 'ueberweg') || this.adj[best][0];
    p.kante = e; p.s = start ? this.R() * e.len : 0; p.sprung = true; p.zustand = 'gehen'; p.warteAuf = null;
    if (p.gespraech) { p.gespraech.zustand = 'gehen'; p.gespraech.gespraech = null; p.gespraech = null; }
    this.neuesZiel(p);
    this.platz(p, true);
  }

  clip(p, name) {
    if (name === 'stehen' && !p.ohneArten) { p.steh ??= STEH_MIX[Math.floor(this.R() * STEH_MIX.length)]; if (p.f.acts[p.steh]) name = p.steh; }   // jeder Mensch hat seine eigene Art zu stehen (Wunsch Nr. 49)
    if (p.clip === name) return;
    const erstes = p.clip === null;
    p.clip = name; p.f.play(name, erstes ? 0 : 0.35);
    const a = p.f.acts[name];
    if (erstes && a) a.time = this.R() * a.getClip().duration;   // nicht alle im selben Takt
  }

  // Sollposition auf der Route (Kante plus seitlicher Versatz plus Schubs aus der Abstandsregel)
  platz(p, sofort = false) {
    const e = p.kante, A = this.N[e.a], B = this.N[e.b], n = this.normale(e);
    const t = Math.min(1, Math.max(0, p.s / e.len));
    const ziel = _w.lerpVectors(A, B, t).addScaledVector(n, p.lat).add(p.push);
    if (this.hoehen) ziel.y = this.linear ? A.y + (B.y - A.y) * t : (A.y === B.y ? A.y : (t < 0.5 ? A.y : B.y));   // echte Wege: Höhe der Knoten (Gehweg 0,12 m, Fahrbahn 0); Orte aus Kacheln linear (Gelände, Überwegenden auf Fahrbahnhöhe)
    else ziel.y = e.art === 'ueberweg' && Math.min(p.s, e.len - p.s) > 2.3 ? 0 : this.hoehe;   // auf der Fahrbahn, nicht auf Bordsteinhöhe
    if (sofort) p.pos.copy(ziel); else p.pos.lerp(ziel, 0.35);
    p.dir.subVectors(B, A).normalize().multiplyScalar(Math.max(p.v, 0.3)).addScaledVector(n, p.latV || 0);
  }

  update(dt) { if (this.leer) return;
    const L = this.alle;
    for (const p of L) { p.cooldown = Math.max(0, (p.cooldown || 0) - dt); if (p.mitSpieler > 0 && (p.mitSpieler -= dt) <= 0) this.ansprechenEnde(p, true); if (p.flucht) continue; if (p.zurueck > 0) { p.zurueck -= dt; p.push.multiplyScalar(Math.max(0, 1 - dt * 0.9)); } else p.push.multiplyScalar(Math.max(0, 1 - dt * 2.5)); }
    if (this.gefahr) this.gefahrPruefen(dt);
    for (const p of L) {
      if (p.flucht) { this.fliehen(p, dt); continue; }
      if (p.szene) continue;   // kit/szenen.js führt diese Menschen selbst
      if (p.statisch) this.gruppeSchritt(p, dt);
      else if (p.typ !== 'folger') this.schritt(p, dt);
    }
    for (const p of L) if (p.typ === 'folger' && !p.flucht) this.folgen(p, dt);
    for (const p of L) p.sprung = false;
    if (this.blase && (this.blaseT += dt) > 1) {   // einmal je Sekunde: wer weit weg ist, kommt nah an die Kamera
      this.blaseT = 0;
      const cam = this.kamera.position, r = this.blase.radius;
      for (const p of L) if (!p.statisch && p.typ !== 'folger' && Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z) > r) this.umsetzen(p);
    }
    this.trennen();
    this.zeichnen(dt);
  }

  // Das Auto des Spielers kommt (05.11.2026, "wie GTA 6"): wer vor dem Wagen steht, springt zur Seite und schaut ihm nach; hupen wirkt weiter voraus.
  // gefahr: { pos, dir, v, L, B, hupe }, this.frei(x, z) prüft die Kollision, damit niemand in eine Wand springt
  gefahrPruefen(dt, G = this.gefahr) {
    const v = Math.abs(G.v), sg = G.v < 0 ? -1 : 1; if (v < 2.5 && !G.hupe) return;
    const dx = G.dir.x * sg, dz = G.dir.z * sg, sx = -dz, sz = dx, weit = Math.min(30, 4 + v * 1.25) + (G.hupe ? 8 : 0);
    for (const p of this.alle) {
      if (p.flucht) continue;
      const rx = p.pos.x - G.pos.x, rz = p.pos.z - G.pos.z, l = rx * dx + rz * dz; if (l < -G.L / 2 || l > weit + G.L / 2) continue;
      const q = rx * sx + rz * sz; if (Math.abs(q) > G.B / 2 + 0.95) continue;   // schmal: wer auf dem Gehweg geht, bleibt ruhig, wenn das Auto auf der Fahrbahn vorbeifährt
      // getroffen: nur wer wirklich im Rechteck steht und schon schnell genug
      if (G.eigen !== false && v > 6 && l < G.L / 2 + 0.3 && Math.abs(q) < G.B / 2 + 0.15) { this.umgestossen(p, dx, dz, sx * (Math.sign(q) || 1), sz * (Math.sign(q) || 1), v); continue; }
      let seite = Math.sign(q) || (this.R() < 0.5 ? 1 : -1);
      const prob = s => !this.frei || this.frei(p.pos.x + sx * s * 2.6, p.pos.z + sz * s * 2.6);
      if (!prob(seite)) { if (prob(-seite)) seite = -seite; }
      p.flucht = { x: sx * seite + dx * 0.18, z: sz * seite + dz * 0.18, t: 0.75 + Math.min(0.5, Math.abs(q) < 1 ? 0.35 : 0.1), v: 4.6 + this.R() * 1.2, art: 'weg', G };
      p.zustandVor = p.zustand; if (p.gespraech) { p.gespraech.zustand = 'gehen'; p.gespraech.gespraech = null; p.gespraech.blick = null; p.gespraech = null; }
      p.blick = null; this.clip(p, 'joggen'); p.f.setSpeed(1.5);
      this.nachricht?.('schreck', p);
    }
  }
  // Wer angefahren wird, fällt hin und steht wieder auf (kein Blut, keine Toten)
  umgestossen(p, dx, dz, sx, sz, v) {
    const k = Math.min(1, v / 18);
    p.flucht = { x: dx * 0.8 + sx * 0.6, z: dz * 0.8 + sz * 0.6, t: 2.6 + k, v: 3 + 7 * k, art: 'sturz', fall: 0, G: this.gefahr, roll: (this.R() - 0.5) * 0.7 };
    p.zustandVor = p.zustand; if (p.gespraech) { p.gespraech.zustand = 'gehen'; p.gespraech.gespraech = null; p.gespraech.blick = null; p.gespraech = null; }
    p.blick = null; this.clip(p, 'stehen'); p.f.setSpeed(0.6);
    this.nachricht?.('sturz', p, k);
  }
  fliehen(p, dt) {
    const F = p.flucht; F.t -= dt; const o = p.f.obj;
    if (F.art === 'sturz') {
      const vJetzt = F.v * Math.max(0, Math.min(1, (F.t - 1.6) * 1.6)); this.schub(p, F.x * vJetzt * dt, F.z * vJetzt * dt);
      const ziel = F.t > 1.1 ? 1 : Math.max(0, F.t / 1.1); F.fall += (ziel - F.fall) * Math.min(1, dt * (F.t > 1.1 ? 9 : 5)); o.rotation.order = 'YXZ'; o.rotation.x = -F.fall * 1.52; o.rotation.z = F.fall * F.roll;
      if (F.t <= 0) { o.rotation.x = 0; o.rotation.z = 0; this.endeFlucht(p); }
      return;
    }
    if (F.art === 'weg') {
      const vJetzt = F.v * Math.min(1, F.t * 3 + 0.2); this.schub(p, F.x * vJetzt * dt, F.z * vJetzt * dt); p.dir?.set(F.x, 0, F.z);
      p.fluchtRy = Math.atan2(F.x, F.z);
      if (F.t <= 0) { F.art = 'schaut'; F.t = 1.6 + this.R() * 2.2; p.fluchtRy = null; p.blick = { pos: F.G.pos }; this.clip(p, 'umschauen'); p.f.setSpeed(1); }
      return;
    }
    if (F.t <= 0) this.endeFlucht(p);
  }
  // Verschieben ohne Sprung: gehende Menschen hängen über p.push an ihrer Route, stehende Gruppen direkt
  schub(p, dx, dz) {
    const x = p.pos.x + dx, z = p.pos.z + dz; if (this.frei && !this.frei(x, z)) return;
    p.pos.x = x; p.pos.z = z;
  }
  endeFlucht(p) {
    p.flucht = null; p.fluchtRy = null; p.blick = null; const z = p.zustandVor; p.zustandVor = null;
    if (p.statisch) { this.clip(p, 'stehen'); return; }
    p.zustand = 'gehen'; p.warteAuf = null; if (z === 'warten') p.s = Math.max(0, p.s - 0.5);
    const e = p.kante, A = e && this.N[e.a], B = e && this.N[e.b]; if (!A || !B) return;
    this.clip(p, p.typ === 'jogger' ? 'joggen' : 'gehen');
    // zurück zur Route: der Versatz wird zum Schubs und klingt in rund 3 s ab (sonst rutscht die Figur in wenigen Bildern zurück)
    const n = this.normale(e), t = Math.min(1, Math.max(0, p.s / e.len));
    p.push.set(p.pos.x - (A.x + (B.x - A.x) * t + n.x * p.lat), 0, p.pos.z - (A.z + (B.z - A.z) * t + n.z * p.lat)); p.zurueck = 3;
  }

  gruppeSchritt(p, dt) {
    if ((p.timer -= dt) < 0) { p.timer = 4 + this.R() * 7; this.clip(p, ['reden_a', 'reden_b', 'stehen', 'umschauen'][Math.floor(this.R() * 4)]); }
  }

  schritt(p, dt) {
    const e = p.kante;
    if (p.zustand !== 'gehen') {   // im Stehen: Umschauen, Stehen, Telefonieren, Reden, Warten an der Ampel
      p.v = 0; p.latV = 0;
      if (p.zustand === 'warten') {
        if (this.ampel.fussgaengerGruen(p.warteAuf.phase)) { p.zustand = 'gehen'; p.kante = p.warteAuf; p.s = 0; p.warteAuf = null; p.v = p.vSoll * 0.6; }
      } else if ((p.timer -= dt) <= 0) {
        const g = p.gespraech;
        if (g) { g.zustand = 'gehen'; g.gespraech = null; g.cooldown = 40; p.gespraech = null; p.cooldown = 40; }
        p.zustand = 'gehen';
      }
      this.platz(p);
      return;
    }
    // Gehen: Rechts gehen, Gegenverkehr rechts vorbei, Stehende umgehen, Langsame überholen
    const A = this.N[e.a], B = this.N[e.b], t = _v.subVectors(B, A).normalize().clone(), n = this.normale(e);
    const rechtsN = Math.sign(-t.z * n.x + t.x * n.z) || 1;   // +1: rechts liegt auf der Hausseite
    const [lo, hi] = this.spur(e);
    let latWunsch = e.w || e.art === 'gehweg' ? (lo + hi) / 2 + rechtsN * Math.min(0.45, (hi - lo) / 4) : rechtsN * 0.8;
    let vZiel = p.vSoll;
    for (const o of this.alle) {
      if (o === p || o === p.partner) continue;
      const rel = _w.subVectors(o.mitte || o.pos, p.pos);   // eine Gruppe ist ein Hindernis mit ihrer Mitte
      if (Math.abs(rel.y) > 1) continue;
      const vor = rel.dot(t), quer = rel.dot(n);
      if (vor < -0.5 || vor > 4.5) continue;
      const olat = p.lat + quer;
      const entgegen = !!o.kante && o.zustand === 'gehen' && !o.statisch && !!this.N[o.kante.a] && !!this.N[o.kante.b] && _v.subVectors(this.N[o.kante.b], this.N[o.kante.a]).normalize().dot(t) < -0.3;
      // Begegnung: zwei Einzelne kennen sich, bleiben stehen und reden
      const allein = q => (q.typ === 'einzeln' || q.typ === 'handy') && !q.partner;
      if (allein(p) && allein(o) && entgegen && vor > 0.9 && vor < 2.2 && Math.abs(quer) < 1.8 && !p.cooldown && !o.cooldown) {
        if (this.R() < 0.75) {
          const dauer = 6 + this.R() * 8;
          for (const [x, y, c] of [[p, o, 'reden_a'], [o, p, 'reden_b']]) { x.zustand = 'reden'; x.timer = dauer; x.gespraech = y; x.blick = y; this.clip(x, c); }
          return;
        }
        p.cooldown = o.cooldown = 8;   // kennen sich nicht: weitergehen
      }
      const breite = o.mitte ? 1.3 : 0.95;                     // Gruppe: Radius 0,62 m plus Abstand
      if (Math.abs(quer) > breite + 0.05) continue;
      const steht = o.statisch || o.zustand !== 'gehen';
      if (entgegen) latWunsch = THREE.MathUtils.clamp(olat + rechtsN * 0.95, lo, hi);
      else if (steht || o.v < p.vSoll - 0.15) {
        const links = olat - breite, re = olat + breite;
        const reOk = re <= hi, liOk = links >= lo;
        latWunsch = reOk && (!liOk || Math.abs(re - p.lat) < Math.abs(links - p.lat)) ? re : liOk ? links : (re <= hi + 0.4 ? hi : lo);
        if (vor > 0 && vor < 1.4 && Math.abs(quer) < breite - 0.4) vZiel = Math.min(vZiel, steht ? 0.2 : o.v * 0.9);   // kein Platz: langsamer
      }
    }
    p.latZiel = THREE.MathUtils.clamp(latWunsch, lo, hi);
    const dl = THREE.MathUtils.clamp(p.latZiel - p.lat, -dt * 0.9, dt * 0.9);
    p.lat += dl; p.latV = dl / Math.max(dt, 1e-3);
    p.v += THREE.MathUtils.clamp(vZiel - p.v, -dt * 2.5, dt * 1.5);
    p.s += p.v * dt;
    if (p.s >= e.len) this.knoten(p);
    if (p.zustand === 'gehen') {
      const c = p.typ === 'jogger' ? 'joggen' : p.typ === 'handy' ? 'gehen_handy' : 'gehen';
      this.clip(p, p.v < 0.15 ? 'stehen' : c);
      p.f.setSpeed(Math.max(0.3, p.v / TEMPO[c]));
      // unterwegs im Schnitt alle 30 bis 40 Sekunden etwas anderes: umschauen, ins Schaufenster sehen, telefonieren, kurz stehen,
      // Paare bleiben stehen und reden miteinander
      if (p.typ !== 'jogger' && !p.cooldown && this.R() < dt / 32) this.unterwegs(p);
    }
    this.platz(p, p.sprung);
  }

  knoten(p) {
    const b = p.kante.b, rest = p.s - p.kante.len;
    if (b === p.ziel) {
      if (this.art[b] === 'ende' && this.ausDemBild(p, b)) return;
      const r = this.R();   // angekommen: eine Tätigkeit, dann ein neues Ziel
      if (p.typ === 'handy') { if (r < 0.5) this.taetigkeit(p, 'telefon', 8 + this.R() * 8); }
      else if (p.typ !== 'jogger') {
        if (r < 0.32) this.taetigkeit(p, 'umschauen', 4 + this.R() * 4);
        else if (r < 0.5) this.taetigkeit(p, 'stehen', 3 + this.R() * 4);
        else if (r < 0.62) this.taetigkeit(p, 'telefon', 8 + this.R() * 7);
      }
      this.neuesZiel(p);
    }
    const naechster = this.weiterZu(b, p.ziel);
    const e = (naechster >= 0 && naechster !== b && this.kante(b, naechster)) || this.kante(b, p.kante.a) || this.adj[b][0];
    if (e.art === 'ueberweg' && e.phase && !this.ampel.fussgaengerGruen(e.phase)) {   // bei Rot an der Bordsteinkante warten
      p.s = p.kante.len; p.zustand = 'warten'; p.warteAuf = e; this.clip(p, this.R() < 0.4 ? 'umschauen' : 'stehen');
      return;
    }
    p.kante = e; p.s = Math.max(0, Math.min(rest, e.len));
  }

  // Am Ende der Straße: aus dem Bild gehen und an einem anderen Straßenende wieder hereinkommen, wenn die Kamera beide Stellen nicht sieht
  ausDemBild(p, b) {
    const cam = this.kamera.position, weit = 45 * 45;
    const andere = this.enden.filter(i => i !== b && this.N[i].distanceToSquared(cam) > weit);
    if (this.N[b].distanceToSquared(cam) < weit || !andere.length) return false;
    const neu = andere[Math.floor(this.R() * andere.length)];
    p.kante = this.adj[neu][0]; p.s = 0; p.sprung = true;
    this.neuesZiel(p);
    return true;
  }

  unterwegs(p) {
    const r = this.R();
    if (p.partner) { this.taetigkeit(p, 'reden', 6 + this.R() * 8); p.clip = null; this.clip(p, 'reden_a'); p.blick = p.partner; return; }
    if (p.typ === 'handy') return r < 0.6 ? this.taetigkeit(p, 'telefon', 8 + this.R() * 10) : this.taetigkeit(p, 'stehen', 3 + this.R() * 3);
    if (r < 0.3) this.taetigkeit(p, 'umschauen', 4 + this.R() * 4);
    else if (r < 0.55) { this.taetigkeit(p, 'schaufenster', 4 + this.R() * 5); p.clip = null; this.clip(p, 'stehen'); }
    else if (r < 0.8) this.taetigkeit(p, 'telefon', 8 + this.R() * 10);
    else this.taetigkeit(p, 'stehen', 3 + this.R() * 4);
  }

  // Der Spieler spricht diesen Menschen an (Wunsch Nr. 76): stehen bleiben, zum Spieler drehen und reden, solange die Sprechblase steht.
  // Ein Gespräch mit einem anderen endet dafür. Wer zu zweit geht, bleibt mit der Begleitung stehen, beide schauen den Spieler an
  ansprechen(p, figur, dauer) {
    if (p.flucht) return false;
    if (p.gespraech) { const o = p.gespraech; o.zustand = 'gehen'; o.gespraech = null; o.blick = null; p.gespraech = null; }
    const leiter = p.typ === 'folger' ? p.leiter : null;
    for (const x of leiter ? [p, leiter] : [p]) {
      x.mitSpieler = dauer; x.spielerBlick = figur;
      if (x.statisch) { x.blickVor ??= x.blick; x.timer = dauer; }
      else if (x.typ !== 'folger') { x.zustand = 'reden'; x.timer = dauer; x.cooldown = dauer + 6; }
      x.blick = figur; if (x === p || x.typ !== 'folger') { x.clip = null; this.clip(x, x === p ? 'reden_a' : 'stehen'); }
    }
    return true;
  }
  ansprechenEnde(p, ablauf = false) {
    if (!ablauf && !(p.mitSpieler > 0)) return;
    const leiter = p.typ === 'folger' ? p.leiter : null;
    for (const x of leiter ? [p, leiter] : [p]) {
      x.mitSpieler = 0; x.spielerBlick = null;
      if (x.statisch) { x.blick = x.blickVor || null; x.blickVor = null; x.timer = 0; }
      else if (x.zustand === 'reden' && !x.gespraech) x.timer = Math.min(x.timer, 0.3 + this.R() * 0.5);   // geht gleich weiter
    }
  }

  taetigkeit(p, name, dauer) {
    p.zustand = name; p.timer = dauer; p.cooldown = dauer + 8; this.clip(p, name);
  }

  // Paare: der Folger geht neben seinem Partner, bleibt mit ihm stehen und redet dann mit ihm
  folgen(p, dt) {
    const l = p.leiter, e = l.kante;
    const neueKante = p.kante !== e;
    p.kante = e; p.v = l.v; p.zustand = l.zustand === 'gehen' ? 'gehen' : 'paar';
    const [lo, hi] = this.spur(e);
    // neben dem Partner auf der freien Seite, sonst kurz hinter ihm (an Gruppen und Engstellen). Im Stehen bleibt die Seite.
    const frei = lat => lat >= lo && lat <= hi && !this.alle.some(o => o !== p && o !== l && (o.statisch || o.zustand !== 'gehen') &&
      Math.min(this.querAbstand(e, lat, l.s, o), this.querAbstand(e, lat, l.s + 1.2, o)) < 0.75);
    if (p.zustand === 'gehen' && (p.seite === undefined || !frei(l.lat + p.seite))) p.seite = frei(l.lat + 0.72) ? 0.72 : frei(l.lat - 0.72) ? -0.72 : 0;
    const seite = p.seite ?? 0.72;
    const sZiel = Math.max(0, l.s - (seite ? 0.15 : 0.95));
    p.s = l.sprung || neueKante ? sZiel : p.s + THREE.MathUtils.clamp(sZiel - p.s, -dt * 1.5, dt * 1.5);
    const dl = THREE.MathUtils.clamp(THREE.MathUtils.clamp(l.lat + seite, lo, hi) - p.lat, -dt, dt);
    p.lat = l.sprung ? THREE.MathUtils.clamp(l.lat + seite, lo, hi) : p.lat + dl; p.latV = l.latV;
    this.platz(p, l.sprung);
    if (p.zustand === 'gehen') { this.clip(p, p.v < 0.15 ? 'stehen' : 'gehen'); p.f.setSpeed(Math.max(0.3, p.v / TEMPO.gehen)); p.blick = null; }
    else if (p.mitSpieler > 0 && p.spielerBlick) { this.clip(p, 'reden_a'); p.blick = p.spielerBlick; }   // spricht mit dem Spieler (Wunsch Nr. 76)
    else { this.clip(p, l.zustand === 'telefon' ? 'stehen' : 'reden_b'); p.blick = l; if (l.zustand === 'umschauen' || l.zustand === 'stehen') l.blick = p; }
  }

  // Abstand eines Menschen o zur Stelle (Kante e, seitlich lat, entlang s), nur nahe Stellen zählen
  querAbstand(e, lat, s, o) {
    const n = this.normale(e), t = Math.min(1, Math.max(0, s / e.len));
    const x = this.N[e.a].x + (this.N[e.b].x - this.N[e.a].x) * t + n.x * lat, z = this.N[e.a].z + (this.N[e.b].z - this.N[e.a].z) * t + n.z * lat;
    return Math.hypot(o.pos.x - x, o.pos.z - z);
  }

  // Harte Regel: niemand steht in einem anderen. Überlappungen werden auseinandergeschoben, Gruppen bleiben stehen.
  trennen() {
    const L = this.alle;
    for (let runde = 0; runde < 4; runde++) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (a.statisch && b.statisch) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d >= ABSTAND || Math.abs(a.pos.y - b.pos.y) > 1) continue;
      const nx = d > 1e-3 ? dx / d : 0.95, nz = d > 1e-3 ? dz / d : 0.3, tief = ABSTAND - d;
      const fa = a.statisch ? 0 : b.statisch ? 1 : 0.5, fb = 1 - fa;
      a.pos.x -= nx * tief * fa; a.pos.z -= nz * tief * fa; b.pos.x += nx * tief * fb; b.pos.z += nz * tief * fb;
      a.push.x -= nx * tief * fa * 0.3; a.push.z -= nz * tief * fa * 0.3;
      b.push.x += nx * tief * fb * 0.3; b.push.z += nz * tief * fb * 0.3;
    }
  }

  zeichnen(dt) {
    const cam = this.kamera.position, weit = (this.mobil ? WEIT_HANDY : WEIT) ** 2;   // Handy: Figuren nur bis 45 m (Budget 500.000 Dreiecke)
    // höchstens die nächsten 30 Figuren (Handy 12) zeichnen: je Figur rund 14.000 Dreiecke, an vollen Kreuzungen sonst 770.000 (London, 29.10.2026)
    const max = this.mobil ? 12 : 30;
    // Grenze gleitet (Zeitkonstante rund 1,5 s) statt jedes Bild neu zu springen, dazu 12 % Spielraum je Figur: vorher wechselten Figuren an der
    // Grenze ständig zwischen sichtbar und unsichtbar (Nader 03.11.2026: "poppen auf einmal immer Menschen auf")
    let ziel2 = weit; if (this.alle.length > max) { const d = this.alle.map(p => p.pos.distanceToSquared(cam)).sort((a, b) => a - b); ziel2 = Math.min(weit, d[max - 1] + 1e-3); }
    const g = Math.sqrt(this._grenzeG ?? Math.sqrt(ziel2) ** 2), zg = Math.sqrt(ziel2), neuG = g + (zg - g) * Math.min(1, dt / 1.5);
    this._grenzeG = neuG * neuG; this._grenze2 = this._grenzeG;
    const B = this.bilder, Z = B?.geometry.attributes.aZelle, impW2 = (this.mobil ? IMP_WEIT_HANDY : IMP_WEIT) ** 2; let nB = 0;
    for (const p of this.alle) {
      const o = p.f.obj;
      if (p.zustand === 'gehen' && p.typ !== 'folger' && !p.flucht) p.blick = null;
      // Blickrichtung: beim Gehen in Laufrichtung, im Gespräch zum Gegenüber, an der Ampel über die Straße
      let ziel = p.ry;
      if (p.fluchtRy != null) ziel = p.fluchtRy;
      else if (p.blick) ziel = Math.atan2(p.blick.pos.x - p.pos.x, p.blick.pos.z - p.pos.z);
      else if (p.zustand === 'warten' && p.warteAuf) { const B = this.N[p.warteAuf.b]; ziel = Math.atan2(B.x - p.pos.x, B.z - p.pos.z); }
      else if (p.zustand === 'schaufenster') { const n = this.normale(p.kante); ziel = Math.atan2(n.x, n.z); }
      else if (p.zustand === 'gehen') ziel = Math.atan2(p.dir.x, p.dir.z);
      let d = ziel - p.ry; d = Math.atan2(Math.sin(d), Math.cos(d));
      p.ry += d * Math.min(1, dt * (p.typ === 'jogger' || p.flucht ? 9 : 6));
      o.position.copy(p.pos); o.rotation.y = p.ry; if (p.kipp !== undefined) o.rotation.z = p.kipp; if (p.flucht?.fall) o.position.y += p.flucht.fall * 0.13;
      const d2 = p.pos.distanceToSquared(cam), sichtbar = p.f.obj.visible ? d2 <= this._grenze2 * 1.25 : d2 <= this._grenze2 * 0.8;   // weiter weg nicht zeichnen, mit Spielraum (Quadrate: rund 12 %)
      o.visible = sichtbar;
      const schatten = !this.mobil && d2 < 35 * 35;                    // Schatten nur nah an der Kamera
      if (p.schatten !== schatten) { p.schatten = schatten; p.meshes.forEach(m => { m.castShadow = schatten; }); }
      if (sichtbar) p.f.mixer.update(dt);
      else if (B && nB < 220 && p.f.qi >= 0 && d2 < impW2) {   // hinter der Grenze: Bild der Figur
        const A = this.atlas, sz = A.groesse[p.f.qi]; _w.set(sz / 2, sz, 1);
        B.setMatrixAt(nB, _m4.compose(p.pos, _qI, _w)); Z.setXY(nB, (p.f.qi % A.spalten) / A.spalten, Math.floor(p.f.qi / A.spalten) / A.zeilen); nB++;
      }
    }
    if (B) { B.count = nB; B.instanceMatrix.needsUpdate = true; Z.needsUpdate = true; }
  }
}
