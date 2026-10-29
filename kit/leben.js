// Leben am Himmel (29.10.2026 spät, Nader: "Die Welt sieht viel zu leer aus ... viel lebendiger"): Vogelschwärme in Bodennähe und
// Verkehrsflugzeuge in rund 10 km Höhe mit Kondensstreifen. Lagen in ECEF gespeichert (über die Anker der Erde hinweg ohne Sprung),
// je Bild in den lokalen Rahmen gerechnet. Nur bei Tag; Vögel nur, wenn die Kamera tiefer als rund 600 m über dem Boden ist.
import * as THREE from 'three';

const SCHWAERME = 4, JE = 14, FLIEGER = 3, STREIFEN_N = 24;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4(), _u = new THREE.Vector3();

function vogelGeo() {   // Rumpf und zwei Flügel (V), Spannweite rund 0,9 m; aFluegel: 0 Rumpf, plus minus 1 an den Spitzen
  const p = [0, 0, 0.22, 0, 0, -0.18, 0.45, 0, 0.0, 0, 0, 0.22, -0.45, 0, 0.0, 0, 0, -0.18], f = [0, 0, 1, 0, -1, 0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('aFluegel', new THREE.Float32BufferAttribute(f, 1));
  return g;
}
function fliegerGeo() {   // Verkehrsflugzeug grob (40 m lang): Rumpf, Flügel, Leitwerk
  const teile = [new THREE.BoxGeometry(4, 4, 40), new THREE.BoxGeometry(36, 0.8, 6).translate(0, -0.6, 2), new THREE.BoxGeometry(12, 0.5, 3).translate(0, 0.8, -17), new THREE.BoxGeometry(0.6, 7, 4).translate(0, 4, -17)];
  const pos = []; for (const t of teile) { const a = t.toNonIndexed().attributes.position.array; for (const x of a) pos.push(x); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

export class Leben {
  constructor(szene) {
    this.t = 0; this.zufall = (() => { let s = 1234567; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    // Vögel: Flügelschlag im Vertex Shader (Phase je Vogel aus der Instanz)
    const vm = new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.DoubleSide, fog: true });
    vm.onBeforeCompile = sh => {
      sh.uniforms.uZeit = this.zeitU = this.zeitU || { value: 0 };
      sh.vertexShader = 'attribute float aFluegel; uniform float uZeit;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float ph = float(gl_InstanceID) * 1.7, schlag = sin(uZeit * (7.0 + mod(float(gl_InstanceID), 3.0)) + ph) * 0.55 + 0.15;
  transformed.y += abs(aFluegel) * schlag * 0.38;`);
    };
    this.zeitU = { value: 0 };
    this.voegel = new THREE.InstancedMesh(vogelGeo(), vm, SCHWAERME * JE); this.voegel.frustumCulled = false; this.voegel.visible = false; this.voegel.name = 'vögel';
    this.schwaerme = Array.from({ length: SCHWAERME }, () => ({ w: null, v: new THREE.Vector3(), hoehe: 25, plaetze: Array.from({ length: JE }, () => new THREE.Vector3()), wackel: Array.from({ length: JE }, () => this.zufall() * 6.28) }));
    // Flugzeuge und Kondensstreifen (Band zur Kamera gedreht, Breite wächst nach hinten, blendet aus)
    this.flieger = new THREE.InstancedMesh(fliegerGeo(), new THREE.MeshLambertMaterial({ color: 0xd8dde3 }), FLIEGER); this.flieger.frustumCulled = false; this.flieger.visible = false; this.flieger.name = 'flugzeuge';
    this.flugzeuge = Array.from({ length: FLIEGER }, () => ({ w: null, v: new THREE.Vector3(), alter: 0 }));
    const sp = [], st = []; for (let i = 0; i <= STREIFEN_N; i++) for (const s of [-1, 1]) { sp.push(0, 0, 0); st.push(i / STREIFEN_N, s); }
    const idx = []; for (let i = 0; i < STREIFEN_N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.streifen = this.flugzeuge.map(() => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp.slice(), 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(st.slice(), 2)); g.setIndex(idx);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uHell: { value: 1 } },
        vertexShader: `attribute vec2 aT; uniform vec3 uA, uB; varying float vT;
          void main() { vT = aT.x; vec3 p = mix(uA, uB, aT.x), d = normalize(uB - uA), z = normalize(cameraPosition - p), s = normalize(cross(d, z));
            float breite = mix(18.0, 140.0, aT.x); gl_Position = projectionMatrix * viewMatrix * vec4(p + s * aT.y * breite, 1.0); }`,
        fragmentShader: `uniform float uAlpha, uHell; varying float vT;
          void main() { float a = uAlpha * pow(1.0 - vT, 1.4) * smoothstep(0.0, 0.03, vT) * 0.55; gl_FragColor = vec4(vec3(0.96, 0.97, 1.0) * uHell, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }` });
      const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.visible = false; me.renderOrder = 2; me.name = 'kondensstreifen'; return me;
    });
    szene.add(this.voegel, this.flieger, ...this.streifen);
  }
  // welt: ErdWelt; boden(x, z): Bodenhöhe im lokalen Rahmen; tag 0 bis 1; hoeheUeberGrund der Kamera
  update(dt, camera, welt, { boden, tag, hoeheUeberGrund, hell = 1, an = true }) {
    this.t += dt; this.zeitU.value = this.t % 1000;
    const vogelAn = an && tag > 0.3 && hoeheUeberGrund < 600, fliegerAn = an && tag > 0.15 && hoeheUeberGrund < 9000;
    this.voegel.visible = vogelAn; this.flieger.visible = fliegerAn; for (const s of this.streifen) s.visible = fliegerAn;
    const z = this.zufall, cam = camera.position;
    if (vogelAn) {
      let i = 0;
      for (const S of this.schwaerme) {
        let c = S.w ? welt.weltZuLokal(S.w, _v) : null, neu = false;
        if (!c || Math.hypot(c.x - cam.x, c.z - cam.z) > 750) {
          neu = true;   // neu: 150 bis 450 m um die Kamera, Höhe 20 bis 90 m über dem Boden
          const w = z() * 6.28, r = 150 + z() * 300; c = _v.set(cam.x + Math.cos(w) * r, 0, cam.z + Math.sin(w) * r);
          S.hoehe = 20 + z() * 70; const k = z() * 6.28, tempo = 9 + z() * 5; S.v.set(Math.cos(k) * tempo, 0, Math.sin(k) * tempo);
          S.plaetze.forEach(p => p.set((z() - 0.5) * 26, (z() - 0.5) * 6, (z() - 0.5) * 26));
        }
        // sanft kurven, Höhe über dem Boden halten
        const dreh = Math.sin(this.t * 0.13 + S.hoehe) * 0.25 * dt; S.v.set(S.v.x * Math.cos(dreh) - S.v.z * Math.sin(dreh), 0, S.v.x * Math.sin(dreh) + S.v.z * Math.cos(dreh));
        c.addScaledVector(S.v, dt); const yZiel = boden(c.x, c.z) + S.hoehe; c.y = neu ? yZiel : c.y + (yZiel - c.y) * Math.min(1, dt * 0.8);
        S.w = welt.lokalZuWelt(c, S.w || new THREE.Vector3());
        _q.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(S.v.x, S.v.z));
        for (let k = 0; k < JE; k++) {
          const p = S.plaetze[k], wk = S.wackel[k] + this.t * 1.3;
          _w.set(p.x + Math.sin(wk) * 2.5, p.y + Math.sin(wk * 1.7) * 1.2, p.z + Math.cos(wk * 0.8) * 2.5).add(c);
          _m.compose(_w, _q, _s); this.voegel.setMatrixAt(i++, _m);
        }
      }
      this.voegel.instanceMatrix.needsUpdate = true;
    }
    if (fliegerAn) {
      for (let f = 0; f < FLIEGER; f++) {
        const F = this.flugzeuge[f], st = this.streifen[f];
        let p = F.w ? welt.weltZuLokal(F.w, _v) : null;
        if (!p || p.distanceTo(cam) > 70000) {   // neu: 40 bis 60 km entfernt am Horizont, fliegt quer über den Himmel
          const w = z() * 6.28, r = 40000 + z() * 20000, kurs = w + Math.PI + (z() - 0.5) * 1.2, hoehe = 9500 + z() * 2000;
          p = _v.set(cam.x + Math.cos(w) * r, boden(cam.x, cam.z) + hoehe, cam.z + Math.sin(w) * r);
          F.v.set(Math.cos(kurs) * 235, 0, Math.sin(kurs) * 235); F.alter = 0; F.weg = 0;
        }
        p.addScaledVector(F.v, dt); F.alter += dt; F.weg = Math.min(12000, (F.weg || 0) + 235 * dt);
        F.w = welt.lokalZuWelt(p, F.w || new THREE.Vector3());
        _q.setFromAxisAngle(_w.set(0, 1, 0), Math.atan2(F.v.x, F.v.z)); _m.compose(p, _q, _s); this.flieger.setMatrixAt(f, _m);
        const U = st.material.uniforms; U.uA.value.copy(p).addScaledVector(F.v, -0.09); U.uB.value.copy(p).addScaledVector(F.v, -F.weg / 235);
        U.uAlpha.value = Math.min(1, F.alter / 3) * tag; U.uHell.value = hell;
      }
      this.flieger.instanceMatrix.needsUpdate = true;
    }
  }
}
