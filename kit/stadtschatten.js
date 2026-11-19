// Sonnenschatten über die ganze Stadt (06.11.2026, Wunsch Nr. 55: "als wäre es auch in Unreal mit Ray Tracing"). Die Schattenkarte der Sonne reicht nur rund 500 m, dahinter standen die Häuser ohne Schatten da und die Stadt sah aus der Luft flach aus.
// Hier: einmal von oben die Höhe aller Häuser in eine Karte schreiben (Schattenproxys des Ortes und die Gebäudekisten bis rund 5 km), in AtmosPass läuft dann je Bildpunkt ein kurzer Strahl zur Sonne durch diese Karte. Kostet eine Zeichnung alle paar Sekunden und 12 Texturzugriffe je Bildpunkt. Nur am Rechner.
import * as THREE from 'three';

const VS = `varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `varying float vY; void main() { gl_FragColor = vec4(vY + 2000.0, 0.0, 0.0, 1.0); }`;   // 0 heißt: hier steht nichts

export class Stadtschatten {
  constructor(renderer, { aufl = 1024 } = {}) {
    this.renderer = renderer; this.rt = new THREE.WebGLRenderTarget(aufl, aufl, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, generateMipmaps: false, colorSpace: THREE.NoColorSpace });
    this.rt.texture.wrapS = this.rt.texture.wrapT = THREE.ClampToEdgeWrapping; this.sz = new THREE.Scene(); this.sz.matrixWorldAutoUpdate = false; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000); this.cam.up.set(0, 0, -1);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, side: THREE.DoubleSide, toneMapped: false }); this.stell = new Map(); this.tNeu = 0; this.mitte = new THREE.Vector3(1e9, 0, 1e9); this.S = 4000; this.an = false; this.zahl = 0; this._c = new THREE.Color();
  }
  sammeln(W, ort) {
    const da = new Set(), hin = m => { if (!m?.geometry) return; da.add(m); let p = this.stell.get(m); if (!p) { p = new THREE.Mesh(m.geometry, this.mat); p.frustumCulled = false; p.matrixAutoUpdate = false; p.matrixWorldAutoUpdate = false; this.sz.add(p); this.stell.set(m, p); } p.geometry = m.geometry; m.updateWorldMatrix(true, false); p.matrixWorld.copy(m.matrixWorld); };
    for (const k of W.kisten.values()) if (k.mesh?.visible !== false && k.mesh) hin(k.mesh);
    if (ort?.kacheln) for (const k of ort.kacheln.values()) if (k.schatten) hin(k.schatten);
    for (const [m, p] of this.stell) if (!da.has(m)) { this.sz.remove(p); this.stell.delete(m); }
    return da.size;
  }
  // je Bild: pass ist der AtmosPass. nah: Mitte und Radius der echten Schattenkarte, dort bleibt sie allein
  update(dt, { welt: W, ort, kamera, hA, pass, sonneY, nah }) {
    const stark = THREE.MathUtils.smoothstep(sonneY, 0.03, 0.14) * (1 - THREE.MathUtils.smoothstep(hA, 6000, 16000)); if (stark < 0.01) { pass.stadtSchatten(null); return; }
    const c = kamera.position; this.tNeu -= dt; const S = hA > 1800 ? 12000 : hA > 600 ? 8000 : 5200, weg = Math.hypot(c.x - this.mitte.x, c.z - this.mitte.z);
    if (this.tNeu <= 0 && (weg > S * 0.07 || S !== this.S || this.tNeu < -6)) {
      this.tNeu = 1.5; this.mitte.set(Math.round(c.x / 40) * 40, 0, Math.round(c.z / 40) * 40); this.S = S; this.zahl = this.sammeln(W, ort); const K = this.cam, H = S / 2; K.left = K.bottom = -H; K.right = K.top = H; K.position.set(this.mitte.x, 9000, this.mitte.z); K.lookAt(this.mitte.x, 0, this.mitte.z); K.updateProjectionMatrix(); K.updateMatrixWorld(true);
      const r = this.renderer, alt = r.getRenderTarget(), au = r.autoClear, sa = r.shadowMap.autoUpdate; r.getClearColor(this._c); const aa = r.getClearAlpha(); r.shadowMap.autoUpdate = false; r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.autoClear = true; r.clear(); r.render(this.sz, K); r.setRenderTarget(alt); r.setClearColor(this._c, aa); r.autoClear = au; r.shadowMap.autoUpdate = sa;
    }
    pass.stadtSchatten({ tex: this.rt.texture, x: this.mitte.x, z: this.mitte.z, s: this.S, stark, nah });
  }
  entsorgen() { this.rt.dispose(); this.mat.dispose(); }
}
