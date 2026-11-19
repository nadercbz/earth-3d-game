// Gewitter (05.11.2026): Blitze zwischen Wolken und Boden, Himmel zuckt mit, der Donner kommt mit der Schallgeschwindigkeit nach. Läuft, solange das Wetter Gewitter meldet.
import * as THREE from 'three';
export class Gewitter {
  constructor(szene, ton) {
    this.ton = ton; this.t = 4 + Math.random() * 6; this.blitz = 0; this.leben = 0;
    const n = 64 * 6; this.pos = new Float32Array(n * 3); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 7.5, 11), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: true })); this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 8; szene.add(this.mesh);
  }
  // Bolzen als Band, das zur Kamera schaut
  bolzen(cam) {
    const a = Math.random() * 6.283, d = 1200 + Math.random() * 9000, x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d, oben = Math.max(1100, cam.y + 900), unten = cam.y - Math.min(300, cam.y + 200), st = 62, br = Math.max(1.6, d * 0.0021);
    const P = []; let px = x + (Math.random() - 0.5) * 300, pz = z + (Math.random() - 0.5) * 300; for (let i = 0; i <= st; i++) { const t = i / st; px += (Math.random() - 0.5) * 70 * (0.3 + t) + (x - px) * 0.06; pz += (Math.random() - 0.5) * 70 * (0.3 + t) + (z - pz) * 0.06; P.push([px, oben + (unten - oben) * t, pz]); }
    const rx = -Math.sin(a), rz = Math.cos(a); let o = 0; for (let i = 0; i < st; i++) { const A = P[i], B = P[i + 1], w0 = br * (1 - i / st * 0.5), w1 = br * (1 - (i + 1) / st * 0.5); for (const v of [[A, -w0], [A, w0], [B, -w1], [B, -w1], [A, w0], [B, w1]]) { this.pos[o++] = v[0][0] + rx * v[1]; this.pos[o++] = v[0][1]; this.pos[o++] = v[0][2] + rz * v[1]; } }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.setDrawRange(0, st * 6); this.mesh.visible = true; this.leben = 0.16 + Math.random() * 0.14; this.blitz = 1; this.flacker = Math.random() * 6;
    return d;
  }
  // Liefert die Stärke des Blitzes (0 bis 1) für die Belichtung
  update(dt, staerke, cam, draussen = true) {
    this.t -= dt;
    if (staerke > 0.4 && this.t <= 0 && draussen) { this.t = 7 + Math.random() * 20; const d = this.bolzen(cam); setTimeout(() => this.ton?.donner?.(d), d / 340 * 1000); }
    if (this.leben > 0) { this.leben -= dt; if (this.leben <= 0) this.mesh.visible = false; }
    this.blitz = Math.max(0, this.blitz - dt * 3.2);
    return this.blitz * this.blitz * (0.65 + 0.35 * Math.sin(this.blitz * 30 + (this.flacker || 0)));
  }
}
