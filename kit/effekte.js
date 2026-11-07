// Effekte beim Fahren (05.11.2026): Reifenqualm und Bremsspuren auf der Straße, Funken bei Zusammenstößen. Feste Pools, ein Aufruf je Art, keine neuen Objekte im Lauf.
import * as THREE from 'three';

const PN = 170, SN = 130, SPUR = 1400, GN = 460;
function punktPool(n, additiv, fs, maxPx = 4096) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), d = new Float32Array(n * 2);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aD', new THREE.BufferAttribute(d, 2).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uP: { value: 800 } },
    vertexShader: `attribute vec2 aD; varying float vA; uniform float uP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aD.y; gl_PointSize = min(aD.x * uP / max(0.5, -mv.z), ${maxPx.toFixed(1)}); gl_Position = projectionMatrix * mv; }`, fragmentShader: fs });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}
export class Effekte {
  constructor(szene, { mobil = false } = {}) {
    this.rauch = punktPool(PN, false, `varying float vA; void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard; gl_FragColor = vec4(vec3(0.62, 0.62, 0.63) * (vA < 0.0 ? 0.22 : 1.0), abs(vA) * (1.0 - d) * (1.0 - d)); }`);
    this.funken = punktPool(SN, true, `varying float vA; void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard; gl_FragColor = vec4(vec3(3.2, 1.7, 0.5) * vA * (1.0 - d), 1.0); }`);
    this.rp = Array.from({ length: PN }, () => ({ a: 0, l: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 })); this.sp = Array.from({ length: SN }, () => ({ a: 0, l: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })); this.ri = 0; this.si = 0;
    // Bremsspuren: Band aus Vierecken als Ring, zwei Reifen
    const g = new THREE.BufferGeometry(), pos = new Float32Array(SPUR * 18), al = new Float32Array(SPUR * 6);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aA', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
    this.spur = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, vertexShader: `attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: `varying float vA; void main() { gl_FragColor = vec4(0.015, 0.015, 0.018, vA * 0.62); }` }));
    this.spur.frustumCulled = false; this.spi = 0; this.letzte = [null, null];
    szene.add(this.rauch, this.funken, this.spur); this.t = 0;
    this.gi = punktPool(GN, false, `varying float vA; void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard; gl_FragColor = vec4(vec3(0.93, 0.96, 0.97), abs(vA) * (1.0 - d)); }`, 46); this.gi.renderOrder = 8; this.gp = Array.from({ length: GN }, () => ({ a: 0 })); this.gj = 0; this.gi.visible = false; szene.add(this.gi);
  }
  groesse(h, fov) { const p = h / (2 * Math.tan(fov * Math.PI / 360)); this.rauch.material.uniforms.uP.value = p; this.funken.material.uniforms.uP.value = p; if (this.gi) this.gi.material.uniforms.uP.value = p; }
  qualm(x, y, z, vx, vz, st, klein = 0, dunkel = false) { const p = this.rp[this.ri = (this.ri + 1) % PN]; p.a = 0.0001; p.l = 1.1 + Math.random() * 1.3; p.x = x; p.y = y; p.z = z; p.vx = vx * 0.12 + (Math.random() - 0.5) * 0.7; p.vy = 0.45 + Math.random() * 0.5; p.vz = vz * 0.12 + (Math.random() - 0.5) * 0.7; p.s = (0.9 + Math.random() * 0.8) * (klein || 1); p.st = st; p.dunkel = dunkel; }
  // Gischt hinter und neben dem Boot (fällt zurück ins Wasser) und Blasen unter Wasser (steigen auf). Eigener weißer Pool
  gischt(x, y, z, vx, vy, vz, st = 0.5, gr = 1, blase = false) { if (!this.gi) return; const p = this.gp[this.gj = (this.gj + 1) % GN]; p.a = 0.0001; p.l = blase ? 1.6 + Math.random() * 1.4 : 0.55 + Math.random() * 0.55; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = gr * (0.7 + Math.random() * 0.7); p.st = st; p.blase = blase; }
  funkenAus(x, y, z, vx, vz, st) { const n = Math.floor(6 + 26 * Math.min(1, st)); for (let i = 0; i < n; i++) { const p = this.sp[this.si = (this.si + 1) % SN]; p.a = 0.0001; p.l = 0.25 + Math.random() * 0.5; p.x = x + (Math.random() - 0.5) * 0.8; p.y = y + Math.random() * 0.5; p.z = z + (Math.random() - 0.5) * 0.8; const a = Math.random() * 6.28, r = 1.5 + Math.random() * 6; p.vx = vx * 0.3 + Math.cos(a) * r; p.vy = 1 + Math.random() * 3.5; p.vz = vz * 0.3 + Math.sin(a) * r; } }
  strich(i, a, b, staerke) {   // Viereck auf dem Boden von a nach b, 22 cm breit
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); if (l < 0.02) return; const nx = -dz / l * 0.11, nz = dx / l * 0.11, k = this.spi++ % SPUR, P = this.spur.geometry.attributes.position, A = this.spur.geometry.attributes.aA;
    const q = [[a.x + nx, a.y, a.z + nz], [a.x - nx, a.y, a.z - nz], [b.x - nx, b.y, b.z - nz], [a.x + nx, a.y, a.z + nz], [b.x - nx, b.y, b.z - nz], [b.x + nx, b.y, b.z + nz]];
    q.forEach((v, j) => { P.setXYZ(k * 6 + j, v[0], v[1], v[2]); A.setX(k * 6 + j, staerke); });
    P.needsUpdate = A.needsUpdate = true;
  }
  // W: Fahrer des Spielers oder null, H: Bodenhöhe
  update(dt, W, H, hand) {
    if (W) {
      const v = Math.abs(W.vLong), kmh = v * 3.6, quer = Math.abs(W.vLat), brems = W.aLong < -7 && kmh > 18, start = W.aLong > 3.2 && kmh < 28 && W.gasEingabe > 0.5;
      const schlupf = Math.min(1, (W.driftet || (hand && kmh > 12) ? 0.55 + quer * 0.06 : 0) + (brems ? 0.5 : 0) + (start ? 0.45 : 0)); W.schlupfTon = schlupf;
      if (schlupf > 0.25) {
        const d = W.bildDir, sx = -d.z, sz = d.x, hx = W.bildPos.x - d.x * W.L * 0.33, hz = W.bildPos.z - d.z * W.L * 0.33;
        [1, -1].forEach((s, i) => { const x = hx + sx * s * W.B * 0.42, z = hz + sz * s * W.B * 0.42, y = H(x, z) + 0.025, p = { x, y, z }; if (this.letzte[i]) this.strich(i, this.letzte[i], p, Math.min(1, schlupf * 1.15)); this.letzte[i] = p; if (Math.random() < schlupf * dt * 55) this.qualm(x, y + 0.15, z, d.x * W.vLong, d.z * W.vLong, Math.min(0.33, schlupf * 0.42)); });
      } else this.letzte[0] = this.letzte[1] = null;
    } else this.letzte[0] = this.letzte[1] = null;
    const P = this.rauch.geometry.attributes.position, D = this.rauch.geometry.attributes.aD; let an = false;
    this.rp.forEach((p, i) => { if (p.a <= 0) { D.setXY(i, 0, 0); return; } an = true; p.a += dt; const t = p.a / p.l; if (t >= 1) { p.a = 0; D.setXY(i, 0, 0); return; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 0.9; p.vz *= 1 - dt * 0.9; P.setXYZ(i, p.x, p.y, p.z); D.setXY(i, p.s * (1 + 3.4 * t), (p.dunkel ? -1 : 1) * (p.st || 0.3) * (1 - t) * Math.min(1, t * 8)); });
    if (an) { P.needsUpdate = D.needsUpdate = true; } this.rauch.visible = an;
    if (this.gi) { const Pg = this.gi.geometry.attributes.position, Dg = this.gi.geometry.attributes.aD; let ang = false; for (let i = 0; i < GN; i++) { const p = this.gp[i]; if (p.a <= 0) continue; ang = true; p.a += dt; const t = p.a / p.l; if (t >= 1) { p.a = 0; Dg.setXY(i, 0, 0); continue; } if (p.blase) { p.vy += (1.6 - p.vy) * dt * 2; p.x += Math.sin(p.a * 9 + i) * dt * 0.25; } else { p.vy -= 9.8 * dt; p.vx *= 1 - dt * 1.4; p.vz *= 1 - dt * 1.4; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; Pg.setXYZ(i, p.x, p.y, p.z); Dg.setXY(i, p.s * (p.blase ? 1 : 1 + 1.3 * t), p.st * (1 - t) * Math.min(1, t * 10)); } if (ang) { Pg.needsUpdate = Dg.needsUpdate = true; } this.gi.visible = ang; }
    const Q = this.funken.geometry.attributes.position, E = this.funken.geometry.attributes.aD; let an2 = false;
    this.sp.forEach((p, i) => { if (p.a <= 0) { E.setXY(i, 0, 0); return; } an2 = true; p.a += dt; const t = p.a / p.l; if (t >= 1) { p.a = 0; E.setXY(i, 0, 0); return; } p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const b = H(p.x, p.z) + 0.03; if (p.y < b) { p.y = b; p.vy *= -0.4; } Q.setXYZ(i, p.x, p.y, p.z); E.setXY(i, 0.07, 1 - t); });
    if (an2) { Q.needsUpdate = E.needsUpdate = true; } this.funken.visible = an2;
  }
  // nach einem Ortswechsel: Spuren gelten im alten Rahmen
  leeren() { this.spur.geometry.attributes.aA.array.fill(0); this.spur.geometry.attributes.aA.needsUpdate = true; for (const p of this.rp) p.a = 0; for (const p of this.sp) p.a = 0; this.letzte[0] = this.letzte[1] = null; }
}
