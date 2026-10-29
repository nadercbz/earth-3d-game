// Wolkendecke der Erde (09_GRAFIK.md Abschnitt 3, seit 29.10.2026): eine Schicht in 6,5 km Höhe über dem Ellipsoid, als Gitter in Ringen um
// den Punkt unter der Kamera (dicht in der Mitte, bis zum Horizont), Lage im Vertex Shader. Dichte aus WOLKEN_GLSL (kit/erde.js), dieselbe
// Funktion wirft die Schatten auf die Kugel. Aus dem All Wolkenbänder mit Tag, Nacht und Abendrot, beim Durchfliegen weich ausgeblendet.
import * as THREE from 'three';
import { A, F, RAUSCHEN_GLSL, WOLKEN_GLSL } from './erde.js';

const B = A * (1 - F);

export class Wolkendecke {
  constructor({ mobil = false, uWolken }) {
    const NR = mobil ? 44 : 72, NP = mobil ? 72 : 120, pos = [], idx = [];
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NP; j++) pos.push(i / NR, j / NP * Math.PI * 2, 0);
    for (let i = 0; i < NR; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + 1, c = a + NP + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    this.hoeheDecke = 6500;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMitte: { value: new THREE.Vector3() }, uOben: { value: new THREE.Vector3(0, 1, 0) }, uOst: { value: new THREE.Vector3(1, 0, 0) }, uNord: { value: new THREE.Vector3(0, 0, -1) },
        uThetaMax: { value: 0.1 }, uDecke: { value: this.hoeheDecke }, uZuWelt: { value: new THREE.Matrix3() }, uSonne: { value: new THREE.Vector3(0, 1, 0) },
        uKamHoehe: { value: 0 }, uHell: { value: 1 }, uDunst: { value: new THREE.Color(0.27, 0.41, 0.66) }, uWolken },
      vertexShader: `uniform vec3 uMitte, uOben, uOst, uNord; uniform float uThetaMax, uDecke; uniform mat3 uZuWelt; varying vec3 vDirL; varying vec3 vW;
        void main() {
          float th = uThetaMax * position.x * position.x;
          vec3 d = cos(th) * uOben + sin(th) * (cos(position.y) * uOst + sin(position.y) * uNord);
          vec3 e = uZuWelt * d;   // Richtung in ECEF (y zum Nordpol): Radius des Ellipsoids plus Höhe der Decke
          float r = 1.0 / sqrt((e.x * e.x + e.z * e.z) / ${(A * A).toExponential(9)} + e.y * e.y / ${(B * B).toExponential(9)}) + uDecke;
          vec3 w = uMitte + d * r; vDirL = d; vW = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: `uniform vec3 uSonne, uMitte, uDunst; uniform mat3 uZuWelt; uniform float uKamHoehe, uDecke, uHell; varying vec3 vDirL; varying vec3 vW;
        ${RAUSCHEN_GLSL}
        ${WOLKEN_GLSL}
        void main() {
          vec3 dE = normalize(uZuWelt * vDirL), V = cameraPosition - vW; float dist = length(V); V /= dist;
          float okt = clamp(12.0 - log2(max(dist, 1.0) / 1500.0), 4.5, 9.0);   // nah feinere Wolken (stufenlos)
          float dichte = wolkenDichte(dE, okt);
          if (dichte < 0.01) discard;
          float s = dot(vDirL, uSonne), tag = smoothstep(-0.18, 0.12, s);
          // Licht von der Sonnenseite: ist die Wolke zur Sonne hin dichter, liegt diese Stelle im Schatten (wirkt plastisch)
          vec3 sE = normalize(uZuWelt * uSonne), zurSonne = normalize(sE - dE * dot(sE, dE));
          float vorn = wolkenDichte(normalize(dE + zurSonne * 0.0009), okt - 1.0);
          float plastik = clamp(1.0 - (vorn - dichte) * 1.6, 0.55, 1.15);
          float unten = step(uKamHoehe, uDecke);   // Kamera unter der Decke: man sieht die dunkle Unterseite
          float licht = mix((0.9 - 0.18 * dichte) * plastik, 0.35 + 0.45 * (1.0 - dichte), unten);
          vec3 c = mix(vec3(0.56, 0.6, 0.68), vec3(1.0, 0.985, 0.96), clamp(licht, 0.0, 1.0)) * (0.9 + 0.12 * plastik);
          c *= 0.04 + 0.96 * tag;
          c += vec3(1.0, 0.5, 0.25) * 0.35 * tag * (1.0 - smoothstep(0.0, 0.28, s));   // Abendrot am Rand von Tag und Nacht
          c = mix(c, uDunst * (0.3 + 0.9 * tag), (1.0 - exp(-dist / 900000.0)) * 0.5);   // Luftperspektive weit draußen
          float a = pow(dichte, 1.4) * uWolken.w;   // dünne Ränder durchscheinend, Kerne deckend
          a *= smoothstep(0.0, 0.12, abs(dot(vDirL, V)));   // am Horizont der Decke weich
          a *= smoothstep(200.0, 1800.0, abs(uKamHoehe - uDecke));   // beim Durchfliegen ausblenden
          gl_FragColor = vec4(c * uHell, min(a, 0.86));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; this.mesh.name = 'wolkendecke';
  }
  // je Bild: Ringe um den Punkt unter der Kamera; welt: ErdWelt (Anker), kamLokal: Kamera im lokalen Rahmen, kamHoehe über dem Meer
  update(welt, kamLokal, kamHoehe, sonneLokal, hell) {
    const U = this.mat.uniforms, R = 6371000, hc = welt.deckeDuenn ? 9000 : this.hoeheDecke; U.uDecke.value = hc;   // mit Wolkenbergen (kit/wolkenberge.js) als Federwolken in 9 km
    welt.weltZuLokal(new THREE.Vector3(0, 0, 0), U.uMitte.value);
    const oben = U.uOben.value.copy(kamLokal).sub(U.uMitte.value).normalize();
    const hilf = Math.abs(oben.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    U.uOst.value.crossVectors(hilf, oben).normalize(); U.uNord.value.crossVectors(oben, U.uOst.value);
    const H = Math.max(0, kamHoehe);
    U.uThetaMax.value = Math.min(1.5, Math.acos(R / (R + hc)) + Math.acos(R / (R + H + 1)) + 0.02);
    U.uZuWelt.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(welt.zuWelt));
    U.uSonne.value.copy(sonneLokal); U.uKamHoehe.value = kamHoehe; U.uHell.value = hell;
  }
}
