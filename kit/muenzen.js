// Münzen zum Finden (05.11.2026, "wie ein perfektes Spiel"): an festen Stellen der Erde, gleich bei jedem Besuch, einmal gefunden bleiben sie weg (Spielstand). Sie liegen an Knoten des Wegenetzes, also überall auf der Welt erreichbar.
// Ein InstancedMesh, nur die nahen werden gezeichnet und gedreht. Auf der Minikarte als kleine Punkte.
import * as THREE from 'three';

const hash = (a, b) => { let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0);
const MAX = 40, ANTEIL = 0.02;

export class Muenzen {
  constructor(szene, gesammelt) {
    this.gesammelt = gesammelt; this.ort = null; this.liste = []; this.t = 0;
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 28); g.rotateX(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.85, roughness: 0.28, emissive: 0xc98a12, emissiveIntensity: 0.55 });
    this.mesh = new THREE.InstancedMesh(g, m, MAX); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.name = 'muenzen'; szene.add(this.mesh);
    const hg = new THREE.PlaneGeometry(2.4, 2.4), hm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: 'varying vec2 vU; void main() { vU = uv * 2.0 - 1.0; vec4 c = modelViewMatrix * instanceMatrix[3]; c.xy += position.xy; gl_Position = projectionMatrix * c; }', fragmentShader: 'varying vec2 vU; void main() { float d = dot(vU, vU); if (d > 1.0) discard; float a = (1.0 - d) * (1.0 - d); gl_FragColor = vec4(vec3(1.0, 0.72, 0.2) * a * 0.75, a); }' });
    this.schein = new THREE.InstancedMesh(hg, hm, MAX); this.schein.frustumCulled = false; this.schein.count = 0; szene.add(this.schein);
    this.karte = [];
  }
  // Knoten des Ortes auf die Stellen prüfen, an denen eine Münze liegt
  baue(o) {
    this.ort = o; this.liste = []; const K = o?.daten?.wege?.knoten; if (!K?.length) return;
    for (const k of K) {
      const lat = o.lat - k[1] / o.kLat, lon = o.lon + k[0] / o.kLon, a = Math.round(lat * 2600), b = Math.round(lon * 2600); if (hash(a, b) > ANTEIL) continue;
      const id = a + ',' + b; if (this.gesammelt[id] || this.liste.some(c => c.id === id)) continue;
      this.liste.push({ id, x: k[0], z: k[1], lat, lon, y: null });
    }
  }
  // pos: Spieler im Rahmen des Ortes, r: Reichweite, H: Bodenhöhe. Liefert die Münze, die gerade aufgesammelt wurde
  update(dt, o, pos, r, H) {
    if (o !== this.ort) this.baue(o);
    this.t += dt; let n = 0, treffer = null; const karte = this.karte; karte.length = 0;
    if (!pos) { this.mesh.count = this.schein.count = 0; return null; }
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const c = this.liste[i], d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < 420) karte.push(c);
      if (d > 170 || n >= MAX) continue;
      if (c.y === null) c.y = H(c.x, c.z) + 1.05;
      if (d < r && Math.abs(c.y - pos.y) < 4.5) { this.gesammelt[c.id] = 1; this.liste.splice(i, 1); treffer = c; continue; }
      _q.setFromAxisAngle(_Y, this.t * 2.2 + i); _p.set(c.x, c.y + Math.sin(this.t * 1.7 + i) * 0.12, c.z); _m.compose(_p, _q, _s); this.mesh.setMatrixAt(n, _m); this.schein.setMatrixAt(n, _m); n++;
    }
    this.mesh.count = this.schein.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.schein.instanceMatrix.needsUpdate = true;
    return treffer;
  }
  ausblenden() { this.mesh.count = this.schein.count = 0; this.karte.length = 0; }
}
