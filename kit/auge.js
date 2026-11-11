// Automatische Belichtung (Wunsch Nr. 55 und 56, 06.11.2026, Skills threejs-aaa-graphics-builder, threejs-debug-profiler): das Auge passt sich an, wie in großen Spielen.
// Misst das Bild vor der Tonkurve in einem kleinen Raster (Logarithmus der Helligkeit), ohne das hellste Fünftel (Himmel, Sonne) und die dunkelsten 5 Prozent, und führt die Belichtung langsam nach.
// So gibt es beim Wechsel von Kugel zu Ort oder aus der Sonne in den Wald keinen dunklen Sprung mehr, dunkle Szenen werden lesbar. Das Lesen läuft asynchron (kein Warten auf die Grafikkarte).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const B = 32, H = 18;

export class AugePass extends Pass {
  constructor(renderer) {
    super();
    this.needsSwap = false; this.renderer = renderer; this.ev = 1; this.ziel = 1; this.mittel = 0.18; this.bildNr = 0; this.liest = false; this.gueltig = false;
    this.basisZiel = 0.2; this.von = 0.8; this.bis = 1.75; this.staerke = 1;   // staerke: 0 aus, 1 voll (das Dashboard nimmt sie aus der Höhe zurück)
    this.rt = new THREE.WebGLRenderTarget(B, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.puffer = new Uint8Array(B * H * 4); this.werte = new Float32Array(B * H);
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tBild: { value: null }, uTexel: { value: new THREE.Vector2(1 / B, 1 / H) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tBild; uniform vec2 uTexel; varying vec2 vUv;
        float l(vec2 uv) { vec3 c = texture2D(tBild, uv).rgb; float v = dot(c, vec3(0.2126, 0.7152, 0.0722)); if (isnan(v) || isinf(v)) v = 0.0; return log2(max(v, 1e-4)); }
        void main() { vec2 d = uTexel * 0.25; float m = (l(vUv + d * vec2(-1.0, -1.0)) + l(vUv + d * vec2(1.0, -1.0)) + l(vUv + d * vec2(-1.0, 1.0)) + l(vUv + d * vec2(1.0, 1.0))) * 0.25; gl_FragColor = vec4(clamp((m + 13.3) / 16.0, 0.0, 1.0)); }`,
      depthTest: false, depthWrite: false,
    }));
  }
  render(renderer, writeBuffer, readBuffer) {
    if (this.liest || (this.bildNr++ % 6)) return;
    const alt = renderer.getRenderTarget(); this.quad.material.uniforms.tBild.value = readBuffer.texture;
    renderer.setRenderTarget(this.rt); this.quad.render(renderer); renderer.setRenderTarget(alt);
    this.liest = true;
    renderer.readRenderTargetPixelsAsync(this.rt, 0, 0, B, H, this.puffer).then(() => {
      this.liest = false; const W = this.werte, P = this.puffer; for (let i = 0; i < W.length; i++) W[i] = P[i * 4];
      const S = Float32Array.from(W).sort(), a = Math.floor(S.length * 0.05), b = Math.floor(S.length * 0.8); let s = 0; for (let i = a; i < b; i++) s += S[i];
      this.mittel = Math.pow(2, s / (b - a) / 255 * 16 - 13.3); this.gueltig = true;
    }).catch(() => { this.liest = false; });
  }
  // je Bild vor dem Zeichnen. basis: feste Belichtung des Dashboards, zielE: gewünschte mittlere Helligkeit nach der Belichtung
  update(dt, basis, zielE = this.basisZiel) {
    if (this.gueltig) { const z = zielE / Math.max(1e-3, basis * this.mittel); this.ziel = 1 + (THREE.MathUtils.clamp(z, this.von, this.bis) - 1) * this.staerke; } else this.ziel = 1;
    const tau = this.ziel > this.ev ? 1.5 : 0.8; this.ev += (this.ziel - this.ev) * (1 - Math.exp(-Math.min(dt, 0.1) / tau));
    return this.ev;
  }
  setSize() {}
  dispose() { this.rt.dispose(); this.quad.dispose(); }
}
