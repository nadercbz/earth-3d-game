// Himmel und Wetter (07_AUSBAU.md Block 4, seit 29.10.2026): echter Sonnenstand aus Datum, Uhrzeit und Breitengrad, Wolkendecke
// aus Rauschen (zieht mit dem Wind), Sterne nachts, Regen als Striche um die Kamera, Nebel über den Dunst. Alles ohne Dateien,
// Wolken und Sterne je 1 Zeichenaufruf, Regen 1 (Desktop 3.500 Tropfen, Handy 1.200).
import * as THREE from 'three';

// Sonnenstand: Deklination aus dem Tag im Jahr, Stundenwinkel aus der Uhrzeit (Sonnenzeit), Höhe und Azimut für den Breitengrad.
// Liefert die Richtung zur Sonne in der Szene (x Osten, z Süden) und die Höhe in Radiant.
export function sonnenstand(stunde, tagImJahr, breite) {
  const phi = THREE.MathUtils.degToRad(breite), dekl = THREE.MathUtils.degToRad(23.44) * Math.sin(2 * Math.PI * (284 + tagImJahr) / 365);
  const H = THREE.MathUtils.degToRad(15 * (stunde - 12));
  const sinEl = Math.sin(phi) * Math.sin(dekl) + Math.cos(phi) * Math.cos(dekl) * Math.cos(H), el = Math.asin(THREE.MathUtils.clamp(sinEl, -1, 1));
  const cosAz = (Math.sin(dekl) - Math.sin(phi) * sinEl) / Math.max(1e-6, Math.cos(phi) * Math.cos(el));
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1)); if (H > 0) az = 2 * Math.PI - az;   // Azimut von Norden über Osten
  // Szene: x nach Osten, z nach Süden, y oben. Norden ist -z.
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  return { dir, el, az };
}

// Wertrauschen als Kacheltextur (wiederholbar, 2 Oktaven) für Wolken
function wolkenTextur(seed = 3, n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const ctx = c.getContext('2d'), img = ctx.createImageData(n, n), d = img.data;
  let s = seed >>> 0 || 1; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const G = 16, grid = Float32Array.from({ length: G * G }, R), G2 = 64, grid2 = Float32Array.from({ length: G2 * G2 }, R);
  const wert = (g, m, x, y) => { const x0 = Math.floor(x) % m, y0 = Math.floor(y) % m, x1 = (x0 + 1) % m, y1 = (y0 + 1) % m, fx = x - Math.floor(x), fy = y - Math.floor(y), sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); const a = g[y0 * m + x0], b = g[y0 * m + x1], cc = g[y1 * m + x0], dd = g[y1 * m + x1]; return (a + (b - a) * sx) + ((cc + (dd - cc) * sx) - (a + (b - a) * sx)) * sy; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.62 * wert(grid, G, x / n * G, y / n * G) + 0.28 * wert(grid2, G2, x / n * G2, y / n * G2) + 0.1 * wert(grid2, G2, x / n * G2 * 2.7, y / n * G2 * 2.7);
    const i = (y * n + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return t;
}

// Wolkendecke: große Fläche in 700 m Höhe, Alpha aus dem Rauschen, Dichte und Farbe über Uniforms, zieht mit dem Wind
export class Wolken {
  constructor({ groesse = 9000, hoehe = 700 } = {}) {
    const geo = new THREE.PlaneGeometry(groesse, groesse, 1, 1); geo.rotateX(Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tNoise: { value: wolkenTextur() }, uDichte: { value: 0.0 }, uVersatz: { value: new THREE.Vector2() }, uFarbe: { value: new THREE.Color(1, 1, 1) }, uSchatten: { value: new THREE.Color(0.55, 0.58, 0.64) }, uFog: { value: new THREE.Color(0.8, 0.82, 0.84) } },
      vertexShader: 'varying vec2 vUv; varying float vD; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D tNoise; uniform float uDichte; uniform vec2 uVersatz; uniform vec3 uFarbe, uSchatten, uFog; varying vec2 vUv; varying float vD;
        void main() {
          float n = texture2D(tNoise, vUv * 3.0 + uVersatz).a;
          float n2 = texture2D(tNoise, vUv * 7.0 - uVersatz * 1.7 + 0.37).a;
          float deck = smoothstep(0.62 - uDichte * 0.64, 0.78 - uDichte * 0.32, n * 0.75 + n2 * 0.25);   // bei Dichte 1 fast geschlossen
          float a = deck * mix(0.0, 0.96, clamp(uDichte * 1.6, 0.0, 1.0));
          float dick = smoothstep(0.5, 1.0, n);
          vec3 c = mix(uFarbe, uSchatten, dick * 0.7);
          float fern = smoothstep(1500.0, 5500.0, vD);   // zum Horizont in den Dunst
          c = mix(c, uFog, fern * 0.8); a *= 1.0 - fern * 0.85;
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.position.y = hoehe; this.mesh.renderOrder = -1; this.mesh.frustumCulled = false;
    this.wind = new THREE.Vector2(0.004, 0.0015);
  }
  update(dt, cam, { dichte, nacht, sonneHoch }) {
    this.mesh.position.x = cam.x; this.mesh.position.z = cam.z;
    const v = this.mat.uniforms.uVersatz.value; v.x += this.wind.x * dt; v.y += this.wind.y * dt;
    v.x += (cam.x - (this._cx ?? cam.x)) / 9000 * 3; v.y -= (cam.z - (this._cz ?? cam.z)) / 9000 * 3; this._cx = cam.x; this._cz = cam.z;   // Wolken bleiben am Ort
    this.mat.uniforms.uDichte.value += (dichte - this.mat.uniforms.uDichte.value) * (1 - Math.exp(-dt / 6));
    const warm = 1 - sonneHoch, hell = 1 - nacht;
    this.mat.uniforms.uFarbe.value.setRGB((0.98 - 0.86 * nacht) * (1 - warm * 0.1), (0.98 - 0.86 * nacht) * (1 - warm * 0.3), (1.0 - 0.84 * nacht) * (1 - warm * 0.45));
    this.mat.uniforms.uSchatten.value.setRGB(0.55 * hell + 0.08, 0.58 * hell + 0.09, 0.66 * hell + 0.12);
    this.mesh.visible = this.mat.uniforms.uDichte.value > 0.01;
  }
}

// Sterne: 1.500 Punkte auf einer Kugel, sichtbar nachts und ohne Wolken
export class Sterne {
  constructor(n = 1500, r = 5000) {
    const pos = new Float32Array(n * 3); let s = 7; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = 0; i < n; i++) { const u = R(), v = R(), th = 2 * Math.PI * u, ph = Math.acos(1 - v * 0.92); pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.mesh = new THREE.Points(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -2;
  }
  update(cam, { nacht, wolken }) { this.mesh.position.copy(cam); this.mat.opacity = Math.max(0, nacht - 0.15) * (1 - Math.min(1, wolken * 1.4)); this.mesh.visible = this.mat.opacity > 0.01; }
}

// Regen: Striche in einem Kasten um die Kamera (40 × 24 × 40 m), fallen mit 9 m/s plus Wind, springen unten wieder nach oben
export class Regen {
  constructor(n = 3500) {
    this.n = n; this.pos = new Float32Array(n * 6); this.v = new Float32Array(n);
    let s = 11; const R = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    this.lokal = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.lokal.set([(R() - 0.5) * 40, R() * 24, (R() - 0.5) * 40], i * 3); this.v[i] = 8 + R() * 3; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xcfd6dd, transparent: true, opacity: 0, depthWrite: false, fog: true });
    this.mesh = new THREE.LineSegments(geo, this.mat); this.mesh.frustumCulled = false;
    this.staerke = 0; this.wind = 1.2;
  }
  update(dt, cam, staerke) {
    this.staerke += (staerke - this.staerke) * (1 - Math.exp(-dt / 4));
    this.mat.opacity = 0.42 * Math.min(1, this.staerke * 1.3); this.mesh.visible = this.staerke > 0.02;
    if (!this.mesh.visible) return;
    const L = this.lokal, P = this.pos, n = this.n, len = 0.9;
    for (let i = 0; i < n; i++) {
      let y = L[i * 3 + 1] - this.v[i] * dt; if (y < -2) y += 26;
      L[i * 3 + 1] = y;
      const x = cam.x + L[i * 3], z = cam.z + L[i * 3 + 2], yy = cam.y - 2 + y;
      P[i * 6] = x; P[i * 6 + 1] = yy; P[i * 6 + 2] = z; P[i * 6 + 3] = x + this.wind * 0.06; P[i * 6 + 4] = yy + len; P[i * 6 + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// Wetterlagen: Wolken 0 bis 1, Regen 0 bis 1, Nebel (Dunst näher), Nässe (Asphalt spiegelt)
export const WETTER = {
  klar: { name: 'Klar', wolken: 0.08, regen: 0, nebel: 0, nass: 0, licht: 1 },
  wolkig: { name: 'Wolkig', wolken: 0.55, regen: 0, nebel: 0.1, nass: 0, licht: 0.75 },
  regen: { name: 'Regen', wolken: 0.95, regen: 1, nebel: 0.35, nass: 1, licht: 0.45 },
  nebel: { name: 'Nebel', wolken: 0.7, regen: 0, nebel: 1, nass: 0.4, licht: 0.6 },
};
