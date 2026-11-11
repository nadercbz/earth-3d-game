// Sichtbare Unfallschäden am eigenen Auto (05.11.2026, Nader: "Auto geht kaputt", "wie GTA 6"). Das Fahrzeug ist ein einziges Netz aus Higgsfield, Türen oder Hauben lassen sich nicht abnehmen.
// Darum bis zu 10 Beulen im Vertex Shader: jeder Treffer drückt die Karosserie an der Stelle nach innen, dazu Falten (feines Rauschen), im Fragment Shader Kratzer und stumpfer Lack.
// Beulen stehen im Rahmen des Autos (x rechts, y hoch, z vorn). Kein Neuaufbau der Geometrie, nur für das eigene Auto, Kosten rund 0,1 ms. Schatten bleiben unverformt (fällt nicht auf).
import * as THREE from 'three';

const MAX = 10;
const VS_KOPF = `
  uniform vec4 uBeule[${MAX}]; uniform mat4 uZuAuto, uVonAuto; varying float vDelle; varying vec3 vAutoP;
  float beulNoise(vec3 p) { return sin(p.x * 13.1 + sin(p.y * 7.3)) * sin(p.y * 17.3 + sin(p.z * 5.9)) * sin(p.z * 11.7 + sin(p.x * 9.1)); }`;
const VS_FORM = `
  { vec3 pA = (uZuAuto * vec4(transformed, 1.0)).xyz; vec3 weg = vec3(0.0); float del = 0.0;
    for (int i = 0; i < ${MAX}; i++) { vec4 b = uBeule[i]; if (b.w <= 0.0) continue;
      float r = 0.42 + b.w * 1.15, d = length(pA - b.xyz), k = 1.0 - smoothstep(0.0, r, d); if (k <= 0.0) continue;
      vec3 rein = normalize(vec3(0.0, 0.62, 0.0) - b.xyz + vec3(0.0, 0.0001, 0.0));
      weg += rein * (k * k * (3.0 - 2.0 * k)) * b.w * 0.42; del = max(del, k * min(1.0, b.w * 1.6));
    }
    if (del > 0.0) { weg += vec3(beulNoise(pA * 1.0), beulNoise(pA.yzx * 1.3), beulNoise(pA.zxy * 0.9)) * 0.035 * del; pA += weg; transformed = (uVonAuto * vec4(pA, 1.0)).xyz; }
    vDelle = del; vAutoP = pA; }`;
const FS_KOPF = `
  varying float vDelle; varying vec3 vAutoP;
  float hash31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  float wert3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float kratzer(vec3 p) { float grob = wert3(p * vec3(2.2, 9.0, 1.6)), fein = wert3(p * vec3(5.0, 58.0, 3.2)); return smoothstep(0.66, 0.74, fein) * smoothstep(0.38, 0.62, grob); }`;
const FS_FARBE = `
  if (vDelle > 0.02) { float staerke = smoothstep(0.1, 0.8, vDelle), kr = kratzer(vAutoP) * smoothstep(0.12, 0.55, vDelle), ab = smoothstep(0.74, 0.82, wert3(vAutoP * vec3(13.0, 31.0, 9.0)) + vDelle * 0.14);
    diffuseColor.rgb *= 1.0 - 0.3 * staerke;                                    // stumpf
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.2, 0.21), ab * 0.7);   // Lack ab, dunkles Blech
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.52), kr * 0.75); }    // helle Kratzer
`;

// Normalen: in der Beule die aus den Bildschirmableitungen (facettiert, wirkt wie zerknittertes Blech)
const FS_NORMAL = `
  if (vDelle > 0.03) { vec3 fl = normalize(cross(dFdx(-vViewPosition), dFdy(-vViewPosition))); normal = normalize(mix(normal, fl, smoothstep(0.03, 0.55, vDelle) * 0.82)); }`;
const FS_RAU = `
  if (vDelle > 0.03) { material.roughness = min(1.0, material.roughness + vDelle * 0.5); }`;
const FS_RAU_KLAR = `
  #ifdef USE_CLEARCOAT
  if (vDelle > 0.03) { material.clearcoat *= 1.0 - smoothstep(0.05, 0.5, vDelle); }
  #endif`;

function aufMaterial(m, U) {
  const alt = m.onBeforeCompile, altKey = m.customProgramCacheKey?.() || 'x', n = m.clone();
  n.onBeforeCompile = (sh, r) => {
    alt?.call(n, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = VS_KOPF + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VS_FORM);
    sh.fragmentShader = FS_KOPF + '\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', FS_FARBE + '\n#include <alphamap_fragment>')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FS_NORMAL)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n' + FS_RAU + FS_RAU_KLAR);
  };
  n.customProgramCacheKey = () => altKey + 'schaden';
  return n;
}

export class Schaden {
  // obj: Wurzel des Autos, L, B, H in Metern
  constructor(obj, { L = 4.4, B = 1.8, H = 1.5 } = {}) {
    this.obj = obj; this.L = L; this.B = B; this.H = H; this.wert = 0; this.n = 0;
    this.beulen = Array.from({ length: MAX }, () => new THREE.Vector4(0, 0, 0, 0));
    obj.updateMatrixWorld(true); this.mats = [];
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), kopie = new Map();
    obj.traverse(o => {
      if (!o.isMesh || Array.isArray(o.material) || /^rad_/.test(o.name) || /^rad_/.test(o.parent?.name || '')) return;
      const zu = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), von = zu.clone().invert();
      const key = o.material.uuid + zu.elements.join(',');
      if (!kopie.has(key)) { const m = aufMaterial(o.material, { uBeule: { value: this.beulen }, uZuAuto: { value: zu }, uVonAuto: { value: von } }); kopie.set(key, m); this.mats.push(m); }
      o.material = kopie.get(key);
    });
  }
  // Treffer: l längs (vorn positiv), q quer (rechts positiv, im Rahmen des Autos), st 0 bis 1
  treffer(l, q, st) {
    if (st < 0.05) return;
    const x = -THREE.MathUtils.clamp(q, -this.B / 2, this.B / 2), z = THREE.MathUtils.clamp(l, -this.L / 2, this.L / 2), y = this.H * 0.42;
    // nahe an einer vorhandenen Beule: die wird tiefer, sonst neue (die älteste schwache wird ersetzt)
    let ziel = null; for (const b of this.beulen) if (b.w > 0 && Math.hypot(b.x - x, b.z - z) < 0.55) { ziel = b; break; }
    if (ziel) { ziel.w = Math.min(1, ziel.w + st * 0.6); ziel.x = (ziel.x + x) / 2; ziel.z = (ziel.z + z) / 2; }
    else { ziel = this.beulen[this.n++ % MAX]; ziel.set(x, y, z, Math.min(1, 0.15 + st * 0.75)); }
    this.wert = Math.min(1, this.wert + st * 0.22);
  }
  reparieren() { for (const b of this.beulen) b.set(0, 0, 0, 0); this.wert = 0; this.n = 0; }
  entsorgen() { for (const m of this.mats) m.dispose(); this.mats.length = 0; }
}
