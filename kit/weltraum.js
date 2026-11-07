// Weltraum Look (07.11.2026, Wunsch Nr. 75, Nader: "Aber ich möchte vor allen Dingen diesen Look haben"): Sternenhimmel mit Milchstraße, Sonne mit
// Lichtschein und der Mond an seiner echten Stelle. Eine Kugel um die Kamera, gezeichnet nach der Erde (die Erde verdeckt sie, das spart Rechenzeit),
// blendet ab rund 80 km Höhe ein. Sterne zufällig, aber fest an der Himmelskugel: sie drehen mit der Sternzeit. Milchstraße (galaktische Ebene,
// Zentrum im Schützen) und Mond (Bahnformel nach Meeus, genau auf rund 1 Grad) liegen wie in echt.
import * as THREE from 'three';

const D2R = Math.PI / 180;
// Immer ganz hinten wie der Himmel in kit/atmos.js: Tiefe auf die ferne Ebene (z = w). Kugel 2.000 km groß, damit die Richtung trotz großer Kamerakoordinaten genau bleibt
const VS = `varying vec3 vDir; void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition + vDir, 1.0); gl_Position.z = gl_Position.w; }`;
const FS = `uniform vec3 uSonne, uMond; uniform mat3 uDreh; uniform float uSicht, uMondPx; varying vec3 vDir;
  float h13(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  vec3 h33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  float wert(vec3 p) { vec3 i = floor(p), f = p - i; f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * wert(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
  // Sterne in zwei Lagen: wenige helle, viele schwache. Ein Stern je Zelle, Größe nie unter einem Bildpunkt (sonst flimmern sie)
  vec3 sterne(vec3 e, float band) {
    vec3 s = vec3(0.0);
    for (int l = 0; l < 3; l++) {
      float N = l == 0 ? 90.0 : l == 1 ? 260.0 : 640.0;
      vec3 q = e * N, z = floor(q), f = q - z, h = h33(z + float(l) * 17.0);
      float hell = pow(h13(z + 3.7 + float(l)), l == 0 ? 14.0 : l == 1 ? 7.0 : 3.0);
      if (h.z > (l == 0 ? 0.55 : l == 1 ? 0.4 : 0.22 + 0.6 * band)) continue;   // in der Milchstraße viel mehr schwache Sterne
      float px = length(fwidth(q)) * 0.75, r = max(0.035 + 0.05 * hell, px), d = length(f - (0.15 + 0.7 * h));
      float st = smoothstep(r, r * 0.25, d) * hell * (0.035 + 0.05 * hell) * (0.035 + 0.05 * hell) / (r * r);
      vec3 farbe = mix(vec3(1.0, 0.78, 0.55), vec3(0.68, 0.8, 1.0), h13(z + 9.1));
      s += st * farbe * (l == 0 ? 14.0 : l == 1 ? 6.0 : 2.6);
    }
    return s;
  }
  // Milchstraße: galaktischer Nordpol RA 192,86 Grad, Dek 27,13 Grad; Zentrum RA 266,4 Grad, Dek -28,94 Grad (J2000)
  float bandBei(vec3 e) { return exp(-pow(dot(e, vec3(-0.8676, -0.1981, 0.4560)) / 0.17, 2.0)); }
  vec3 milchstrasse(vec3 e) {
    vec3 n = vec3(-0.8676, -0.1981, 0.4560), zen = vec3(-0.0549, -0.8734, -0.4838);
    float b = dot(e, n), band = exp(-pow(b / 0.17, 2.0)), kern = exp(-pow(acos(clamp(dot(e, zen), -1.0, 1.0)) / 0.75, 2.0));
    if (band < 0.003) return vec3(0.0);
    float wolke = fbm(e * 7.0), fein = fbm(e * 23.0 + 4.0), staub = smoothstep(0.5, 0.78, fbm(e * 11.0 + 2.3)) * exp(-pow(b / 0.06, 2.0));
    float i = band * (0.2 + 0.8 * wolke * wolke) * (0.7 + 0.6 * fein) * (1.0 - 0.85 * staub) * (0.3 + 1.2 * kern);
    return i * mix(vec3(0.62, 0.7, 0.86), vec3(0.96, 0.88, 0.76), kern * 0.8) * 0.085;   // weißlich blau, warmer Kern
  }
  void main() {
    vec3 d = normalize(vDir), e = normalize(uDreh * d);
    vec3 c = (sterne(e, bandBei(e)) + milchstrasse(e)) * uSicht;
    // Sonne: Scheibe 0,27 Grad, heller Kern, weiter Schein (der Glanz der Nachbearbeitung macht daraus den Lichtschein am Erdrand)
    float s = dot(d, uSonne);
    c += vec3(1.0, 0.97, 0.9) * (smoothstep(0.999989, 0.999991, s) * 24.0 + pow(max(s, 0.0), 3000.0) * 3.0 + pow(max(s, 0.0), 800.0) * 0.22 + pow(max(s, 0.0), 40.0) * 0.01) * uSicht;
    // Mond: Scheibe 0,26 Grad an seiner echten Stelle, beleuchtet von der Sonne, mit Meeren
    float m = dot(d, uMond);
    if (m > 0.99998) {
      vec3 ax = normalize(cross(uMond, abs(uMond.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), ay = cross(uMond, ax);
      vec2 q = vec2(dot(d, ax), dot(d, ay)) / 0.00455; float rr = dot(q, q);
      if (rr < 1.0) { vec3 nm = normalize(q.x * ax + q.y * ay - uMond * sqrt(1.0 - rr));
        float licht = clamp(dot(nm, uSonne), 0.0, 1.0), meer = smoothstep(0.42, 0.62, fbm(vec3(q * 2.2, 3.0)));
        c = mix(c, vec3(0.62, 0.6, 0.57) * (1.0 - 0.38 * meer) * (0.012 + 1.6 * licht), smoothstep(1.0, 0.86, rr) * uSicht); }
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Mond in Äquatorkoordinaten (Einheitsvektor, x zum Frühlingspunkt, z Norden), vereinfachte Bahn nach Meeus
function mondAequ(jd) {
  const d = jd - 2451545.0, L = (218.316 + 13.176396 * d) * D2R, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.229350 * d) * D2R;
  const lam = L + 6.289 * D2R * Math.sin(M), bet = 5.128 * D2R * Math.sin(F), eps = 23.439 * D2R;
  const x = Math.cos(bet) * Math.cos(lam), y = Math.cos(eps) * Math.cos(bet) * Math.sin(lam) - Math.sin(eps) * Math.sin(bet), z = Math.sin(eps) * Math.cos(bet) * Math.sin(lam) + Math.cos(eps) * Math.sin(bet);
  return new THREE.Vector3(x, y, z);
}
// Rektaszension der Sonne (Bogenmaß) für die Sternzeit passend zur Sonne im Spiel
function sonneRA(jd) {
  const n = jd - 2451545.0, L = (280.46 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R, lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R, eps = 23.439 * D2R;
  return Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
}

export class Weltraum {
  constructor(szene) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSonne: { value: new THREE.Vector3(1, 0, 0) }, uMond: { value: new THREE.Vector3(0, 1, 0) }, uDreh: { value: new THREE.Matrix3() }, uSicht: { value: 0 }, uMondPx: { value: 0 } },
      vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; this.mesh.name = 'weltraum'; this.mesh.visible = false;
    szene.add(this.mesh);
    this._m4 = new THREE.Matrix4(); this._m3 = new THREE.Matrix3(); this._p = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0); this._rz = new THREE.Matrix3(); this._mond = new THREE.Vector3(); this.tMond = 0;
  }
  // je Bild: camera, welt (ErdWelt mit zuWelt), sonne (lokal), hoehe in m, utc Stunden im Spiel
  update(camera, { welt, sonne, hoehe, utc }) {
    const sicht = THREE.MathUtils.smoothstep(hoehe, 80000, 700000);
    this.mesh.visible = sicht > 0.001 && !!welt; if (!this.mesh.visible) return;
    if (this.mesh.scale.x !== 2e6) { this.mesh.scale.setScalar(2e6); this.mesh.updateMatrixWorld(); }
    const U = this.mat.uniforms; U.uSicht.value = sicht; U.uSonne.value.copy(sonne).normalize();
    // lokal -> ECEF Szene (zuWelt) -> ECEF (x, -z, y) -> Äquator (Drehung um die Erdachse mit der Sternzeit)
    const jetzt = new Date(), jd0 = Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()) / 86400000 + 2440587.5, h = Number.isFinite(utc) ? ((utc % 24) + 24) % 24 : jetzt.getUTCHours() + jetzt.getUTCMinutes() / 60, jd = jd0 + h / 24;
    const theta = sonneRA(jd) + (h - 12) * 15 * D2R;   // Sonne im Spiel steht mittags über dem Längengrad 0 um 12 Uhr Weltzeit, die Sternzeit folgt ihr
    const c = Math.cos(theta), s = Math.sin(theta); this._rz.set(c, -s, 0, s, c, 0, 0, 0, 1);
    this._m3.setFromMatrix4(this._m4.makeRotationFromQuaternion(welt.zuWelt));
    U.uDreh.value.copy(this._rz).multiply(this._p).multiply(this._m3);
    if ((this.tMond -= 1) <= 0) { this.tMond = 30; this._mond.copy(mondAequ(jd)); }
    U.uMond.value.copy(this._mond).applyMatrix3(this._m3.copy(U.uDreh.value).transpose()).normalize();   // zurück in die Szene (Drehung: Umkehr = Transponierte)
  }
}
