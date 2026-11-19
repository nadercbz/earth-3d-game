// Leben im Grünen (06.11.2026, Nader: "lebendig wie die echte Welt"): Lianen an Urwaldbäumen, Schmetterlinge bei Tag, Glühwürmchen bei Nacht. Alles billig: eine Zeichnung je Art, Bewegung im Shader.
import * as THREE from 'three';
const uZeit = { value: 0 }, uNacht = { value: 0 };
function zufall(s) { let h = (s >>> 0) || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
const _M = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

function lianeGeo() { // Band mit Knick, 1 m Einheitslänge nach unten, Blätter als kleine Rauten
  const P = [], N = 8; for (let i = 0; i < N; i++) { const a = i / N, b = (i + 1) / N, w = 0.035, xa = Math.sin(a * 5) * 0.03, xb = Math.sin(b * 5) * 0.03; P.push(xa - w, -a, 0, xa + w, -a, 0, xb + w, -b, 0, xa - w, -a, 0, xb + w, -b, 0, xb - w, -b, 0); if (i % 2 === 0) { const l = 0.08; P.push(xb, -b, 0, xb + l, -b - l * 0.5, 0.03, xb + l * 0.4, -b - l * 1.1, -0.02, xb, -b, 0, xb - l, -b - l * 0.3, -0.03, xb - l * 0.5, -b - l, 0.02); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}
function falterGeo() { // zwei Flügel, Mitte auf der Achse, Schlag im Shader
  const P = [0, 0, 0.04, 0.06, 0, 0.05, 0.05, 0, -0.03, 0, 0, 0.04, 0.05, 0, -0.03, 0, 0, -0.03, 0, 0, 0.04, 0, 0, -0.03, -0.05, 0, -0.03, 0, 0, 0.04, -0.05, 0, -0.03, -0.06, 0, 0.05];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}

export class Waldleben {
  constructor(ort, { mobil = false } = {}) {
    this.ort = ort; this.mobil = mobil; this.gruppe = new THREE.Group(); this.gruppe.name = 'waldleben'; this.teile = []; this.mats = []; this.t0 = performance.now();
    const D = ort.daten, lat = D.meta?.lat ?? 50, R = zufall(Math.abs(Math.round(lat * 613) + Math.round((D.meta?.lon ?? 0) * 411)) + 5), H = ort.H; this.lat = lat;
    const wk = D.waldKarte, gruen = (D.baeume?.length || 0) + (D.gruen?.length || 0); this.gruen = gruen > 6;
    // Lianen im Regenwald: an rund jedem vierten Baum
    if (Math.abs(lat) < 26 && D.baeume?.length > 30) {
      const L = []; for (const b of D.baeume) { if (R() > 0.28) continue; const ho = b[2] || 14, n = 1 + Math.floor(R() * 3); for (let i = 0; i < n && L.length < (mobil ? 160 : 700); i++) { const a = R() * 6.283, r = 1 + R() * 4, l = ho * (0.45 + R() * 0.45); L.push([b[0] + Math.cos(a) * r, b[1] + Math.sin(a) * r, ho * (0.72 + R() * 0.2), l, R() * 6.283]); } }
      if (L.length) { const g = lianeGeo(), m = new THREE.MeshStandardMaterial({ color: 0x2f4a1c, roughness: 0.9, side: THREE.DoubleSide }); m.onBeforeCompile = sh => { sh.uniforms.uZeit = uZeit; sh.vertexShader = 'uniform float uZeit;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { vec4 iw = instanceMatrix[3]; float k = -position.y; transformed.x += sin(uZeit * 0.6 + iw.x * 0.3 + iw.z * 0.2) * 0.05 * k * k; }'); }; m.customProgramCacheKey = () => 'liane1'; const im = new THREE.InstancedMesh(g, m, L.length); L.forEach((q, i) => { _q.setFromAxisAngle(_Y, q[4]); _p.set(q[0], H(q[0], q[1]) + q[2], q[1]); _s.set(1, q[3], 1); im.setMatrixAt(i, _M.compose(_p, _q, _s)); }); im.computeBoundingSphere(); this.gruppe.add(im); this.teile.push(im, g); this.mats.push(m); }
    }
    // Schmetterlinge um die Kamera
    { const n = mobil ? 16 : 44, g = falterGeo(), m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); m.onBeforeCompile = sh => { sh.uniforms.uZeit = uZeit; sh.vertexShader = 'uniform float uZeit;\nattribute float aPh;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  { float s = sign(position.x), w = sin(uZeit * 13.0 + aPh * 40.0) * 0.9 + 0.35; transformed.y += abs(position.x) * w; transformed.x *= cos(w) * 0.9; }'); }; m.customProgramCacheKey = () => 'falter1'; this.falter = new THREE.InstancedMesh(g, m, n); this.falter.frustumCulled = false; const ph = new Float32Array(n), kl = [[0.9, 0.5, 0.05], [0.95, 0.85, 0.2], [0.85, 0.85, 0.82], [0.2, 0.35, 0.8], [0.7, 0.15, 0.1], [0.55, 0.3, 0.7]]; this.fd = []; for (let i = 0; i < n; i++) { ph[i] = R() * 6.283; const c = kl[Math.floor(R() * 6)]; this.falter.setColorAt(i, _c.setRGB(c[0], c[1], c[2])); this.fd.push({ x: R(), z: R(), a: R() * 6.283, b: R() * 6.283, h: 0.5 + R() * 1.6, s: 0.5 + R() }); } g.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1)); this.gruppe.add(this.falter); this.teile.push(this.falter, g); this.mats.push(m); }
    // Glühwürmchen: Punkte, die pulsieren
    { const n = mobil ? 40 : 120, P = new Float32Array(n * 3), Ph = new Float32Array(n); for (let i = 0; i < n; i++) { P[i * 3] = R() * 60 - 30; P[i * 3 + 1] = 0.4 + R() * 2.4; P[i * 3 + 2] = R() * 60 - 30; Ph[i] = R() * 6.283; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(Ph, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uZeit, uNacht, uMitte: { value: new THREE.Vector3() } }, vertexShader: 'attribute float aPh; uniform float uZeit, uNacht; uniform vec3 uMitte; varying float vK; void main() { vec3 q = position + vec3(sin(uZeit * 0.4 + aPh) * 1.4, sin(uZeit * 0.7 + aPh * 2.0) * 0.5, cos(uZeit * 0.33 + aPh) * 1.4); q.xz = mod(q.xz + 30.0 - uMitte.xz, 60.0) - 30.0 + uMitte.xz; q.y += uMitte.y; vec4 mv = modelViewMatrix * vec4(q, 1.0); float b = pow(max(0.0, sin(uZeit * 1.3 + aPh * 5.0)), 6.0); vK = b * uNacht; gl_PointSize = (2.0 + 26.0 * b) / max(1.0, -mv.z * 0.35); gl_Position = projectionMatrix * mv; }', fragmentShader: 'varying float vK; void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75, 1.0, 0.25) * vK * smoothstep(0.5, 0.0, r) * 2.2, 1.0); }' }); this.gluehen = new THREE.Points(g, m); this.gluehen.frustumCulled = false; this.gruppe.add(this.gluehen); this.teile.push(g); this.mats.push(m); }
  }
  // kam Kamera im Rahmen des Ortes (gruppe), nacht 0 bis 1, warm true im Sommerhalbjahr oder in den Tropen
  update(cam, nacht, warm = true) {
    const t = (performance.now() - this.t0) / 1000; uZeit.value = t % 3600; const o = this.ort.gruppe, lok = _p.copy(cam); o.worldToLocal(lok); const hH = this.ort.H(lok.x, lok.z), nah = lok.y - hH < 40;
    const fa = this.falter; fa.visible = nah && nacht < 0.25 && warm && this.gruen; if (fa.visible) { const R = 26, H = this.ort.H; for (let i = 0; i < fa.count; i++) { const f = this.fd[i], x0 = lok.x + ((f.x * 2 * R + t * 0.0) % (2 * R)) - R + Math.sin(t * 0.33 * f.s + f.a) * 7, z0 = lok.z + ((f.z * 2 * R) % (2 * R)) - R + Math.cos(t * 0.27 * f.s + f.b) * 7, dx = Math.cos(t * 0.33 * f.s + f.a) * f.s, dz = -Math.sin(t * 0.27 * f.s + f.b) * f.s, y = H(x0, z0) + f.h + Math.sin(t * 2.1 * f.s + f.a) * 0.25; _q.setFromAxisAngle(_Y, Math.atan2(dx, dz)); _s.setScalar(1); _M.compose(_v.set(x0, y, z0), _q, _s); fa.setMatrixAt(i, _M); } fa.instanceMatrix.needsUpdate = true; }
    this.gluehen.visible = nah && nacht > 0.4 && warm && this.gruen; if (this.gluehen.visible) { uNacht.value = nacht; this.gluehen.material.uniforms.uMitte.value.set(lok.x, hH, lok.z); }
  }
  entsorgen() { for (const q of this.teile) q.dispose?.(); for (const m of this.mats) m.dispose(); this.gruppe.removeFromParent(); }
}
const _v = new THREE.Vector3();
