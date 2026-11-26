// Automatische Belichtung (Wunsch Nr. 55 und 56, 06.11.2026, Skills threejs-aaa-graphics-builder, threejs-debug-profiler): das Auge passt sich an, wie in großen Spielen.
// Misst das Bild vor der Tonkurve in einem kleinen Raster (Logarithmus der Helligkeit), ohne das hellste Fünftel (Himmel, Sonne) und die dunkelsten 5 Prozent, und führt die Belichtung langsam nach.
// So gibt es beim Wechsel von Kugel zu Ort oder aus der Sonne in den Wald keinen dunklen Sprung mehr, dunkle Szenen werden lesbar.
//
// Seit Nr. 110 (25.11.2026, Nader: "Irgendwann fängt das auch immer an zu ruckeln") rechnet alles auf der Grafikkarte. Vorher las der Hauptfaden das Raster alle 6 Bilder
// zurück (readRenderTargetPixelsAsync). Gemessen am Großen Stern (tools/dauer_mess.mjs PROFIL=1): getBufferSubData 2301 ms von 10 s, je Aufruf rund 34 ms, weil der Aufruf
// wartet, bis die Grafikkarte alle schon abgeschickten Bilder fertig hat. Ergebnis war alle 150 ms ein Bild mit 70 bis 150 ms (Bildzeit p50 17, p95 88 ms).
// Jetzt: Raster 32 x 18 (wie vorher), daraus ein Bildpunkt mit dem gestutzten Mittel, daraus ein Bildpunkt mit der nachgeführten Belichtung, und der Pass selbst
// multipliziert das Bild damit. Nichts wird zurückgelesen. Wer den Wert im Programm braucht (nur Prüfwerkzeuge): lies(). Die Wolken nehmen die Textur evTextur.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const B = 32, H = 18, VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const eins = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const quad = (uniforms, fragmentShader) => new FullScreenQuad(new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader, depthTest: false, depthWrite: false }));

export class AugePass extends Pass {
  constructor(renderer) {
    super();
    this.needsSwap = true; this.renderer = renderer; this.ev = 1; this.mittel = 0.18; this.bildNr = 0; this.gueltig = false; this.dt = 0.016; this.basis = 1; this.zielE = 0.2; this.i = 0;
    this.basisZiel = 0.2; this.von = 0.8; this.bis = 1.75; this.staerke = 1;   // staerke: 0 aus, 1 voll (das Dashboard nimmt sie aus der Höhe zurück)
    this.rt = new THREE.WebGLRenderTarget(B, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtM = eins(); this.rtE = [eins(), eins()]; this.frisch = true;
    this.quad = quad({ tBild: { value: null }, uTexel: { value: new THREE.Vector2(1 / B, 1 / H) } },
      `uniform sampler2D tBild; uniform vec2 uTexel; varying vec2 vUv;
        float l(vec2 uv) { vec3 c = texture2D(tBild, uv).rgb; float v = dot(c, vec3(0.2126, 0.7152, 0.0722)); if (isnan(v) || isinf(v)) v = 0.0; return log2(max(v, 1e-4)); }
        void main() { vec2 d = uTexel * 0.25; float m = (l(vUv + d * vec2(-1.0, -1.0)) + l(vUv + d * vec2(1.0, -1.0)) + l(vUv + d * vec2(-1.0, 1.0)) + l(vUv + d * vec2(1.0, 1.0))) * 0.25; gl_FragColor = vec4(clamp((m + 13.3) / 16.0, 0.0, 1.0)); }`);
    // Gestutztes Mittel ohne Sortieren: erst Mittel und Streuung aller 576 Felder, dann das Mittel der Felder zwischen Mittel minus 1,65 Streuungen (die dunkelsten 5 Prozent
    // fallen weg) und Mittel plus 0,84 Streuungen (das hellste Fünftel fällt weg). Bei gleichmäßigem Bild (Streuung 0) bleibt das einfache Mittel
    this.quadM = quad({ tRaster: { value: this.rt.texture } },
      `uniform sampler2D tRaster; varying vec2 vUv;
        void main() {
          float s = 0.0, q = 0.0;
          for (int j = 0; j < ${H}; j++) for (int i = 0; i < ${B}; i++) { float v = texture2D(tRaster, (vec2(float(i), float(j)) + 0.5) / vec2(${B}.0, ${H}.0)).r; s += v; q += v * v; }
          float n = ${B * H}.0, mu = s / n, sd = sqrt(max(0.0, q / n - mu * mu)), a = mu - 1.65 * sd - 1e-4, b = mu + 0.84 * sd + 1e-4, s2 = 0.0, n2 = 0.0;
          for (int j = 0; j < ${H}; j++) for (int i = 0; i < ${B}; i++) { float v = texture2D(tRaster, (vec2(float(i), float(j)) + 0.5) / vec2(${B}.0, ${H}.0)).r; if (v >= a && v <= b) { s2 += v; n2 += 1.0; } }
          float m = n2 > 0.5 ? s2 / n2 : mu;
          gl_FragColor = vec4(pow(2.0, m * 16.0 - 13.3), mu, sd, 1.0);
        }`);
    this.quadE = quad({ tAlt: { value: null }, tM: { value: this.rtM.texture }, uDt: { value: 0.016 }, uBasis: { value: 1 }, uZielE: { value: 0.2 }, uVon: { value: 0.8 }, uBis: { value: 1.75 }, uStaerke: { value: 1 }, uGueltig: { value: 0 }, uFrisch: { value: 1 } },
      `uniform sampler2D tAlt, tM; uniform float uDt, uBasis, uZielE, uVon, uBis, uStaerke, uGueltig, uFrisch; varying vec2 vUv;
        void main() {
          float ev = mix(texture2D(tAlt, vec2(0.5)).r, 1.0, uFrisch), mittel = texture2D(tM, vec2(0.5)).r;
          if (!(ev > 0.05 && ev < 20.0)) ev = 1.0;   // unbeschriebener Puffer oder NaN
          float z = uZielE / max(1e-3, uBasis * mittel), ziel = uGueltig > 0.5 ? 1.0 + (clamp(z, uVon, uBis) - 1.0) * uStaerke : 1.0;
          float tau = ziel > ev ? 1.5 : 0.8; ev += (ziel - ev) * (1.0 - exp(-min(uDt, 0.1) / tau));
          gl_FragColor = vec4(ev, ziel, mittel, 1.0);
        }`);
    this.quadA = quad({ tBild: { value: null }, tEv: { value: null } },
      'uniform sampler2D tBild, tEv; varying vec2 vUv; void main() { vec4 c = texture2D(tBild, vUv); gl_FragColor = vec4(c.rgb * texture2D(tEv, vec2(0.5)).r, c.a); }');
  }
  // Textur 1 x 1: r Belichtung, g Ziel, b gemessenes Mittel (für die Wolken, kit/wolkenberge.js)
  get evTextur() { return this.rtE[this.i].texture; }
  render(renderer, writeBuffer, readBuffer) {
    const alt = renderer.getRenderTarget();
    if (!(this.bildNr++ % 4)) {   // messen: jedes vierte Bild reicht, das Nachführen läuft in jedem Bild
      this.quad.material.uniforms.tBild.value = readBuffer.texture; renderer.setRenderTarget(this.rt); this.quad.render(renderer);
      renderer.setRenderTarget(this.rtM); this.quadM.render(renderer); this.gueltig = true;
    }
    const U = this.quadE.material.uniforms, neu = 1 - this.i;
    U.tAlt.value = this.rtE[this.i].texture; U.uDt.value = this.dt; U.uBasis.value = this.basis; U.uZielE.value = this.zielE; U.uVon.value = this.von; U.uBis.value = this.bis; U.uStaerke.value = this.staerke; U.uGueltig.value = this.gueltig ? 1 : 0; U.uFrisch.value = this.frisch ? 1 : 0;
    renderer.setRenderTarget(this.rtE[neu]); this.quadE.render(renderer); this.i = neu; this.frisch = false;
    const A = this.quadA.material.uniforms; A.tBild.value = readBuffer.texture; A.tEv.value = this.rtE[neu].texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quadA.render(renderer);
    renderer.setRenderTarget(alt);
  }
  // je Bild vor dem Zeichnen. basis: feste Belichtung des Dashboards, zielE: gewünschte mittlere Helligkeit nach der Belichtung. Liefert 1: die Belichtung steckt im Bild, nicht mehr in renderer.toneMappingExposure
  update(dt, basis, zielE = this.basisZiel) { this.dt = dt; this.basis = basis; this.zielE = zielE; return 1; }
  // Nur für Prüfwerkzeuge (tools/blick.mjs): liest Belichtung und Mittel zurück. Das wartet auf die Grafikkarte, im Spiel nie aufrufen
  lies() {
    const p = new Uint16Array(4); this.renderer.readRenderTargetPixels(this.rtE[this.i], 0, 0, 1, 1, p);
    return { ev: THREE.DataUtils.fromHalfFloat(p[0]), ziel: THREE.DataUtils.fromHalfFloat(p[1]), mittel: THREE.DataUtils.fromHalfFloat(p[2]) };
  }
  setSize() {}
  dispose() { this.rt.dispose(); this.rtM.dispose(); this.rtE[0].dispose(); this.rtE[1].dispose(); for (const q of [this.quad, this.quadM, this.quadE, this.quadA]) { q.material.dispose(); q.dispose(); } }
}
