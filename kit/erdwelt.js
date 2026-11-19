// Die ganze Erde im Dashboard (08_WELTBAU.md Phase 3 und 4, seit 29.10.2026): Kugel aus kit/erde.js im lokalen Rahmen eines Ankers
// (x Osten, y oben, z Süden, Meter, wie jeder Ort), Kamera vom All bis zum Gehweg, Fernbereich mit gemalten Karten und Gebäudekisten,
// und rund um die Kamera ein gebauter Ort aus den Kacheln (kit/ortbau.js) mit Verkehr, Menschen, Innenräumen und Spielmodi.
// Skill threejs-large-worlds: große Zahlen bleiben in JavaScript (Float64), die Szene liegt immer um den Anker (wandernder Ursprung).
import * as THREE from 'three';
import { Erde, geoZuSzene, szeneZuGeo, enu, kachelVonGeo, geoVonKachel, atmosphaere, wasserMaterial, PERIODE, R as ERDRADIUS, WIRBEL } from './erde.js';
import { karteBestellen, kistenBestellen } from './ortdienst.js';
import { baumImpostor, impostorPatch, baumFarbe } from './ort.js';
import { LAUB, istKahl } from './waldarten.js';
import { WALD_ARTEN } from './waldarten.js';
import { fernMaterial } from './city.js';
import { Wolkendecke } from './wolkendecke.js';
import { bildTextur } from './bildlader.js';

const D2R = Math.PI / 180;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// Drehung ECEF Szene -> lokaler Rahmen (Ost, Oben, Süd) an lat, lon
function drehung(lat, lon) {
  const e = enu(lat, lon), sued = e.nord.clone().negate();
  const L = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(e.ost, e.oben, sued));   // lokal -> ECEF
  return { zuLokal: L.clone().invert(), zuWelt: L, e };
}

// Kisten aus der Zeit vor dem Ort: im Quadrat des gebauten Ortes nicht zeichnen (Weltposition gegen uOrt, wie die Kugel)
function mitOrtAussparung(mat, U) {
  const basis = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    basis(sh, r); sh.uniforms.uOrt = U.uOrt; sh.uniforms.uOrtX = U.uOrtX; sh.uniforms.uOrtZ = U.uOrtZ;
    sh.vertexShader = 'varying vec3 vOrtW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vOrtW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = 'uniform vec4 uOrt;\nuniform vec2 uOrtX, uOrtZ;\nvarying vec3 vOrtW;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n  if ( uOrt.y > 0.5 ) { vec2 dO = vOrtW.xz - uOrt.zw; if ( abs( dot( dO, uOrtX ) ) < uOrt.x && abs( dot( dO, uOrtZ ) ) < uOrt.x ) discard; }');
  };
  mat.customProgramCacheKey = () => 'kistenAlt';
  return mat;
}

export class ErdWelt {
  constructor({ renderer, gruppe, tag, nacht, mobil = false }) {
    this.renderer = renderer; this.mobil = mobil; this.gruppe = gruppe;
    this.erdGruppe = new THREE.Group(); this.erdGruppe.name = 'erde'; gruppe.add(this.erdGruppe);
    // Satellitenbild je Kachel (Sentinel 2), dazu ab Stufe 11 (Handy 12) eine leichte Karte: Straßen und Ufer scharf über dem Foto
    this.erde = new Erde({ renderer, gruppe: this.erdGruppe, tag, nacht, mobil, maxZoom: mobil ? 13 : 14, karteAb: mobil ? 12 : 11, karte: k => this.karte(k) });
    this.kameraWelt = new THREE.Vector3();   // für den Vorrang der Aufträge
    if (mobil) WIRBEL.uWirbel.value = 0;   // Wolkenwirbel kosten am Handy zu viel Rechenzeit
    this.atmo = atmosphaere(); this.erdGruppe.add(this.atmo);   // Saum der Atmosphäre aus dem All
    this.wolken = new Wolkendecke({ mobil, uWolken: this.erde.mat.uniforms.uWolken }); gruppe.add(this.wolken.mesh);   // Wolkendecke in 6,5 km, Schatten auf der Kugel
    if (!mobil) bildTextur(new URL('../assets/erde/detail.png', import.meta.url).href, { fertig: t => {   // Luftbild Texturen für die Nahsicht (CC0)
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8; t.needsUpdate = true;
      renderer.initTexture(t); const U = this.erde.mat.uniforms; U.tDetail.value = t; U.uDetailDa.value = 1;
    } });
    this.kistenVorrat = null;   // Gebäudekisten am Flugziel vorab
    this.anker = { lat: 52.50944, lon: 13.37611, h: 34 }; this.ursprung = new THREE.Vector3();
    this.zuLokal = new THREE.Quaternion(); this.zuWelt = new THREE.Quaternion();
    this.kisten = new Map(); this.kistenMat = fernMaterial({ instanziert: false, lokal: true, licht: 0.7 }); this.kistenLaufend = 0;
    this.baumSchrumpf = { value: 1 }; this.baumFern = { value: this.mobil ? 3800 : 7400 }; this.baumMats = {};   // Bäume außerhalb des Ortes (je Kisten Kachel), schrumpfen von oben weg wie im Ort
    this.kistenMatAlt = mitOrtAussparung(fernMaterial({ instanziert: false, lokal: true, licht: 0.7 }), this.erde.mat.uniforms);
    this.kistenRadius = mobil ? 1400 : 3000; this.kistenFern = mobil ? 5000 : 12000;   // Mitte der Kachel 13 (Spanne rund 3 bis 5 km). Nah Stufe 14, dahinter Stufe 13 (Wunsch Nr. 56)
    this.setzeAnker(this.anker.lat, this.anker.lon, this.anker.h);
  }

  // ---------- Anker (wandernder Ursprung): lokale Szene um lat, lon, Höhe h ----------
  setzeAnker(lat, lon, h) {
    this.anker = { lat, lon, h };
    const d = drehung(lat, lon); this.zuLokal.copy(d.zuLokal); this.zuWelt.copy(d.zuWelt);
    geoZuSzene(lat, lon, h, this.ursprung);
    this.erdGruppe.quaternion.copy(this.zuLokal); this.erdGruppe.updateMatrixWorld(true);
    this.erde.setzeUrsprung(this.ursprung);
    for (const k of this.kisten.values()) { if (k.mesh) k.mesh.position.copy(k.welt).sub(this.ursprung); if (k.baeume) k.baeume.position.copy(k.welt).sub(this.ursprung); }
    if (this.atmo) this.atmo.position.copy(this.ursprung).negate();
  }
  // lokal (Szene) <-> ECEF Szene <-> Geo
  lokalZuWelt(v, out = new THREE.Vector3()) { return out.copy(v).applyQuaternion(this.zuWelt).add(this.ursprung); }
  weltZuLokal(v, out = new THREE.Vector3()) { return out.copy(v).sub(this.ursprung).applyQuaternion(this.zuLokal); }
  geoZuLokal(lat, lon, h, out = new THREE.Vector3()) { return this.weltZuLokal(geoZuSzene(lat, lon, h, _w), out); }
  lokalZuGeo(v) { return szeneZuGeo(this.lokalZuWelt(v, _w)); }
  // Transformation eines Rahmens (Anker a) in den aktuellen lokalen Rahmen: für den Ort, wenn der Anker woanders liegt
  rahmenVon(a, obj) {
    const d = drehung(a.lat, a.lon), u = geoZuSzene(a.lat, a.lon, a.h, new THREE.Vector3());
    obj.position.copy(u).sub(this.ursprung).applyQuaternion(this.zuLokal);
    obj.quaternion.copy(this.zuLokal).multiply(d.zuWelt);
    obj.updateMatrixWorld(true);
  }

  // Wasser im gebauten Ort mit dem Shader des Meeres (gleiche Wellen, keine Kante an der Ortsgrenze)
  wasserMaterial() { return this._wasser ??= wasserMaterial(this.erde.mat.uniforms); }
  // Bodenhöhe der Kugel an lat, lon (gefiltertes Gelände der feinsten geladenen Kachel)
  bodenGeo(lat, lon) { return this.erde.hoehe(lat, lon); }
  // Höhe des Bodens am Rand eines gebauten Ortes (über dem Ellipsoid), damit die Kacheln dort auf ihn zulaufen: x Kante -X, y Kante +X, z Kante -Z, w Kante +Z
  ortRandSetzen(ort, ziel) {
    const S = ort.szene.ort, H = ort.halb, v = new THREE.Vector3(), o = new THREE.Vector3(); ort.gruppe.updateMatrixWorld(true);
    const hoeheAm = (x, z) => { v.set(x, (S.Hboden || S.H)(x, z), z); ort.gruppe.localToWorld(v); this.lokalZuWelt(v, o); return szeneZuGeo(o).h; };
    for (let i = 0; i <= 32; i++) { const t = (i / 16 - 1) * H; ziel[i].set(hoeheAm(-H, t), hoeheAm(H, t), hoeheAm(t, -H), hoeheAm(t, H)); }
  }

  // ---------- Karten der Kugelkacheln (Worker) ----------
  karte(k) {
    // Vorrang: Kacheln, die im Verhältnis zu ihrem Abstand groß sind (nah und fein), zuerst; nicht mehr geladene Kacheln fallen weg
    // während eines Flugs zählen Kacheln am Ziel wie Kacheln unter der Kamera (sonst kamen die Karten am Ziel erst nach der Landung)
    const vorrang = () => Math.min(this.kameraWelt.distanceTo(k.mitte), this.zielWelt ? this.zielWelt.distanceTo(k.mitte) * 0.5 : Infinity) / k.spanne - (k.mesh?.visible ? 2 : 0), abgesagt = () => !k.mesh;
    return karteBestellen(k.z, k.x, k.y, this.mobil ? 256 : 512, vorrang, abgesagt).then(({ bild, maske, wasser }) => {
      const t = new THREE.Texture(bild); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.mobil ? 2 : 8;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
      this.renderer.initTexture(t);   // gleich hochladen: sonst kamen beim Abstieg dutzende Karten im selben Bild auf die Grafikkarte (bis 470 ms)
      const m = new THREE.Texture(maske); m.flipY = false; m.generateMipmaps = true; m.minFilter = THREE.LinearMipmapLinearFilter; m.wrapS = m.wrapT = THREE.ClampToEdgeWrapping; m.needsUpdate = true;
      this.renderer.initTexture(m);
      return { tex: t, maske: m, wasser };
    });
  }

  // ---------- Gebäudekisten im Umkreis der Kamera (Stufe 14) ----------
  // boden: { lat, lon } der Kamera, aktiv: nur in Bodennähe; ohne: gebauter Ort { lat, lon, halb }
  // Kisten tauschen ohne Lücke (seit 29.10.2026 abends): wechselt der gebaute Ort, bleiben die alten Kisten stehen, bis die neuen da sind;
  // solange spart ihr Shader das Quadrat des Ortes aus (kistenMatAlt), danach kommen sie ohne die Häuser des Ortes aus dem Worker.
  kistenUpdate(boden, aktiv, ohne, aktivFern = aktiv) {
    const okey = ohne ? `${ohne.lat.toFixed(5)},${ohne.lon.toFixed(5)},${ohne.halb}` : '';
    const wunsch = new Set();
    // Quadtree aus zwei Stufen (Wunsch Nr. 56, 06.11.2026, Nader: "Die Weitsicht sollte auch sehr, sehr gut sein"): nah Stufe 14 mit echten Höhen, Bäumen und Dächern, dahinter Stufe 13 bis rund 11 km. Eine Kachel 13 oder ihre vier Kinder, nie beides
    const umkreis = (p, radius, radiusFern) => {
      const t = kachelVonGeo(p.lat, p.lon, 13), spanne = 40075016 * Math.cos(p.lat * D2R) / 2 ** 13, r = Math.ceil(Math.max(radius, radiusFern) / spanne) + 1;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const x = t.x + dx, y = t.y + dy, g = geoVonKachel(x + 0.5, y + 0.5, 13);
        const d = Math.hypot((g.lat - p.lat) * 111000, (g.lon - p.lon) * 111000 * Math.cos(p.lat * D2R));
        if (d < radius) { for (const a of [0, 1]) for (const b of [0, 1]) wunsch.add(`${x * 2 + a}/${y * 2 + b}`); }
        else if (d < radiusFern) wunsch.add(`13/${x}/${y}`);
      }
    };
    if (aktiv || aktivFern) umkreis(boden, aktiv ? this.kistenRadius : 0, aktivFern ? this.kistenFern : 0);
    // Auch unter der Kamera: bei schrägem Blick aus der Höhe liegt ihr Zielpunkt Kilometer voraus, der Vordergrund war leer (Wunsch Nr. 66)
    const kam = this.kamGeo, kamWeg = kam ? Math.hypot((kam.lat - boden.lat) * 111000, (kam.lon - boden.lon) * 111000 * Math.cos(boden.lat * D2R)) : 0;
    if (aktivFern && kam && kamWeg > 400) umkreis(kam, aktiv ? this.kistenRadius * (kam.h < 1500 ? 0.8 : 0.45) : 0, this.kistenFern * 0.5);
    if (this.kistenVorrat && performance.now() < this.kistenVorrat.bis) umkreis(this.kistenVorrat, this.kistenRadius * 0.6, 0); else this.kistenVorrat = null;
    const kinderVon = key => { const [, x, y] = key.split('/').map(Number); return [`${x * 2}/${y * 2}`, `${x * 2 + 1}/${y * 2}`, `${x * 2}/${y * 2 + 1}`, `${x * 2 + 1}/${y * 2 + 1}`]; };
    const elternVon = key => { const [x, y] = key.split('/').map(Number); return `13/${x >> 1}/${y >> 1}`; };
    const fertig = key => !!this.kisten.get(key)?.fertig;
    const weg = (k, key) => { if (k.mesh) { this.erdGruppe.remove(k.mesh); k.mesh.geometry.dispose(); } if (k.baeume) { this.erdGruppe.remove(k.baeume); k.baeume.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); } this.kisten.delete(key); };
    for (const [key, k] of this.kisten) {
      const ist13 = key.startsWith('13/');
      if (!wunsch.has(key)) {
        if (k.laedt) continue;
        // Kein Loch beim Wechsel der Stufe: die alte bleibt, bis die neue da ist
        if (ist13) { const K = kinderVon(key); if (K.some(c => wunsch.has(c)) && !K.every(fertig)) continue; }
        else { const E = elternVon(key); if (wunsch.has(E) && !fertig(E)) continue; }
        weg(k, key); continue;
      }
      if (!ist13 && k.okey !== okey && k.mesh && k.mesh.material !== this.kistenMatAlt) k.mesh.material = this.kistenMatAlt;   // altes Ort Quadrat aussparen, bis neu geladen
    }
    const max = this.mobil ? 2 : 4;
    for (const key of wunsch) {
      const alt = this.kisten.get(key), ist13 = key.startsWith('13/'), teile = key.split('/').map(Number), x = teile.at(-2), y = teile.at(-1), zK = ist13 ? 13 : 14;
      const gS = geoVonKachel(x + 0.5, y + 0.5, zK), dS = Math.min(Math.hypot((gS.lat - boden.lat) * 111000, (gS.lon - boden.lon) * 111000 * Math.cos(boden.lat * D2R)), kam ? Math.hypot((gS.lat - kam.lat) * 111000, (gS.lon - kam.lon) * 111000 * Math.cos(boden.lat * D2R)) : Infinity), stufe = ist13 ? 0 : dS < 1700 ? 2 : dS < 3600 ? 1 : 0;   // näher dran mehr Bäume: Kachel wird neu bestellt, wenn man näher kommt
      if ((alt && (alt.laedt || ((ist13 || alt.okey === okey) && (alt.stufe ?? 0) >= stufe))) || this.kistenLaufend >= max) continue;
      const eintrag = alt || { mesh: null, welt: new THREE.Vector3() }; eintrag.stufe = stufe;
      eintrag.laedt = true; eintrag.okeyNeu = okey; this.kisten.set(key, eintrag); this.kistenLaufend++;
      // Dreiecke je Kachel: nah mehr, fern weniger (Tokio hat 10.000 Häuser je Kachel); die wichtigsten Häuser (Höhe mal Größe) zuerst
      const g = gS, d = dS;
      const vorrat = this.kistenVorrat ? Math.hypot((g.lat - this.kistenVorrat.lat) * 111000, (g.lon - this.kistenVorrat.lon) * 111000 * Math.cos(g.lat * D2R)) : Infinity;
      const dd = Math.min(d, vorrat), budget = ist13 ? (this.mobil ? 3000 : dd < 7000 ? 26000 : 12000) : this.mobil ? (dd < 1100 ? 16000 : 9000) : dd < 1100 ? 70000 : dd < 2200 ? 36000 : 20000;
      const mitte = geoZuSzene(g.lat, g.lon, 0, new THREE.Vector3());
      const baumBudget = ist13 ? 0 : this.mobil ? [700, 1500, 3200][stufe] : [5000, 13000, 26000][stufe];
      kistenBestellen(x, y, ist13 ? null : ohne, budget, () => (ist13 ? 3 : 0) + Math.min(this.kameraWelt.distanceTo(mitte), this.zielWelt ? this.zielWelt.distanceTo(mitte) * 0.5 : Infinity) / 800 - (eintrag.mesh ? 0 : 1), () => this.kisten.get(key) !== eintrag, baumBudget, zK).then(dd => {
        eintrag.laedt = false; this.kistenLaufend--;
        if (this.kisten.get(key) !== eintrag) return;
        eintrag.okey = eintrag.okeyNeu; eintrag.fertig = true;
        if (eintrag.mesh) { this.erdGruppe.remove(eintrag.mesh); eintrag.mesh.geometry.dispose(); eintrag.mesh = null; }
        if (eintrag.baeume) { this.erdGruppe.remove(eintrag.baeume); eintrag.baeume.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); eintrag.baeume = null; }
        geoZuSzene(dd.lat, dd.lon, dd.h, eintrag.welt);
        if (dd.baeume?.length) eintrag.baeume = this.baeumeAnlegen(dd, eintrag);
        if (!dd.pos.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(dd.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(dd.nor, 3)); geo.setAttribute('aTyp', new THREE.BufferAttribute(dd.typ, 1));
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, ist13 ? this.kistenMatAlt : this.kistenMat); m.castShadow = false; m.receiveShadow = false; m.name = 'kisten ' + key;
        geoZuSzene(dd.lat, dd.lon, dd.h, eintrag.welt);
        m.position.copy(eintrag.welt).sub(this.ursprung); m.quaternion.copy(drehung(dd.lat, dd.lon).zuWelt);
        eintrag.mesh = m; eintrag.anzahl = dd.anzahl; this.erdGruppe.add(m);
      }).catch(e => { if (!this._kistenFehler) { this._kistenFehler = true; console.warn('Kisten', key, e?.message || e); } eintrag.laedt = false; this.kistenLaufend--; if (!eintrag.mesh) this.kisten.delete(key); });
    }
    // Sichtbar: Kachel 13, solange nicht alle vier Kinder fertig sind, danach die Kinder. So stehen nie zwei Häuser ineinander
    for (const [key, k] of this.kisten) {
      if (!key.startsWith('13/')) continue;
      const K = kinderVon(key), alle = K.every(fertig);
      if (k.mesh) k.mesh.visible = !alle;
      for (const c of K) { const e = this.kisten.get(c); if (e?.mesh) e.mesh.visible = alle || !k.mesh; }
    }
    for (const [key, k] of this.kisten) if (!key.startsWith('13/') && k.mesh && !k.mesh.visible && !this.kisten.has(elternVon(key))) k.mesh.visible = true;
  }

  // Bäume einer Kisten Kachel als Baumbilder (Wald aus dem Satellitenbild, kit/waldarten.js). Je Baum: x, y, z, Höhe, Art, Farbe des Bildpunkts
  baeumeAnlegen(dd, eintrag) {
    const B = dd.baeume, ST = 6, n = B.length / ST, g = new THREE.Group(); g.name = 'bäume';
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    for (let art = 0; art < WALD_ARTEN.length; art++) {
      let c = 0; for (let i = 0; i < n; i++) if (B[i * ST + 4] === art) c++; if (!c) continue; const id = WALD_ARTEN[art];
      const kahl = LAUB.has(id) && istKahl(dd.lat), im = baumImpostor(this.renderer, id, c, kahl); im.material = this.baumMat(id + (kahl ? ':kahl' : ''), im.material);
      let k = 0; for (let i = 0; i < n; i++) { if (B[i * ST + 4] !== art) continue; P.set(B[i * ST], B[i * ST + 1], B[i * ST + 2]); Q.setFromAxisAngle(Y, (i * 2.399) % 6.283); S.setScalar(B[i * ST + 3] / im.userData.impostor); M.compose(P, Q, S); im.setMatrixAt(k, M); im.setColorAt(k, baumFarbe(B[i * ST + 5], id, dd.lat, (i * 0.618034) % 1, C)); k++; }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = false; g.add(im);
    }
    g.position.copy(eintrag.welt).sub(this.ursprung); g.quaternion.copy(drehung(dd.lat, dd.lon).zuWelt); g.visible = this.baumSchrumpf.value > 0.02;
    this.erdGruppe.add(g); return g;
  }
  baumMat(id, basis) {   // Kopie des Baumbilds mit Schrumpfen zur Wurzel (uSchrumpf, je Bild nach der Kamerahöhe)
    if (this.baumMats[id]) return this.baumMats[id];
    const m = basis.clone(), U = this.baumSchrumpf;
    m.onBeforeCompile = sh => { impostorPatch(sh); sh.uniforms.uSchrumpf = U; sh.uniforms.uBaumFern = this.baumFern; sh.vertexShader = 'uniform float uSchrumpf, uBaumFern;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed *= uSchrumpf * (1.0 - smoothstep(uBaumFern * 0.72, uBaumFern, length((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz)));'); };   // in der Ferne versinken die Bäume weich im Foto: ab rund 7 km sieht man sie nicht mehr einzeln
    m.customProgramCacheKey = () => 'baumschrumpf4';
    return (this.baumMats[id] = m);
  }

  // Flugziel vorab: Geländekacheln mit Karten (Stufe 10 bis 14) und Gebäudekisten, damit die Landung gleich scharf ist
  vorladen(lat, lon) { this.erde.vorladen(lat, lon); this.kistenVorrat = { lat, lon, bis: performance.now() + 45000 }; this.zielWelt = geoZuSzene(lat, lon, 0, new THREE.Vector3()); clearTimeout(this._zielT); this._zielT = setTimeout(() => { this.zielWelt = null; }, 20000); }
  // Stand je Bild: Kacheln der Kugel, Kisten, Uniforms (Sonne, Dunst, Ort)
  update(camera, { sonne, nebel, nebelFarbe, ort = null, hoeheUeberGrund = 1e6, bodenGeo = null, dt = 1 / 60, wolkenWetter = 0 }) {
    const U = this.erde.mat.uniforms, h = hoeheUeberGrund;
    U.uSonne.value.copy(sonne);
    U.uSonneE.value.copy(sonne).applyQuaternion(this.zuWelt);   // Sonne in ECEF (Wolken, Nachtbilder)
    U.uZuLokal.value.setFromMatrix4(_m.makeRotationFromQuaternion(this.zuLokal));   // Normalenkarten liegen in ECEF
    U.uZuWelt.value.setFromMatrix4(_m.makeRotationFromQuaternion(this.zuWelt));
    const mod = (a) => ((a % PERIODE) + PERIODE) % PERIODE; U.uUrsprungMod.value.set(mod(this.ursprung.x), mod(this.ursprung.y), mod(this.ursprung.z));
    U.uZeit.value = (U.uZeit.value + dt) % 3600;
    U.uKarteFern.value.set(Math.max(2500, h * 1.5), Math.max(7000, h * 4));   // Karte nur nah über dem Foto (Straßen scharf), weiter weg das reine Satellitenbild
    this.atmo.material.uniforms.uSonne.value.copy(sonne); this.atmo.material.uniforms.uStaerke.value = THREE.MathUtils.smoothstep(h, 40000, 600000); this.atmo.visible = h > 40000;
    { const raum = THREE.MathUtils.smoothstep(h, 800000, 4000000); U.uRaum.value = raum; this.atmo.material.uniforms.uRaum.value = raum; this.atmo.getWorldPosition(this.atmo.material.uniforms.uMitte.value); }   // Weltraum Look (Nr. 75)
    U.uNebel.value.set(nebel[0], nebel[1]); U.uNebelFarbe.value.copy(nebelFarbe);
    U.uNachtStark.value = 0.05 + 0.95 * THREE.MathUtils.smoothstep(hoeheUeberGrund, 3000, 70000);
    if (ort) {
      const c = ort.mitteLokal; U.uOrt.value.set(ort.halb - 1.5, 1, c.x, c.z);
      const q = ort.gruppe.quaternion, ax = _v.set(1, 0, 0).applyQuaternion(q), az = _w.set(0, 0, 1).applyQuaternion(q);
      U.uOrtX.value.set(ax.x, ax.z).normalize(); U.uOrtZ.value.set(az.x, az.z).normalize();
      if (this._randOrt !== ort && ort.szene?.ort?.H) { this._randOrt = ort; this.ortRandSetzen(ort, U.uOrtRand.value); }
    } else { U.uOrt.value.set(0, 0, 0, 0); this._randOrt = null; }
    const welt = this.lokalZuWelt(camera.position, this.kameraWelt);
    // Wolken: Bedeckung nach dem Wetter, Drift, Schatten aus der Höhe, die Decke erst über 1,2 km (darunter die Wolken des Himmels)
    const W = U.uWolken.value; W.x = 0.12 + 0.7 * wolkenWetter;   // klar wenige Wolken (man will die Erde sehen), Regen fast bedeckt
    W.y = (W.y + dt * 0.003) % 100000;   // Drift: Haufenwolken rund 15 m/s, Wetterlagen rund 30 m/s (stand vorher im Kommentar, die Wolken standen still)
    const kD = this.deckeDuenn || 0; W.z = 0.42 * (1 - kD) * THREE.MathUtils.smoothstep(h, 1500, 5000); W.w = THREE.MathUtils.smoothstep(h, 1200, 3500) * (1 - 0.85 * kD);   // mit Wolkenbergen nur dünne Federwolken. deckeDuenn läuft weich von 0 bis 1: vorher sprang die Decke bei 40 km in einem Bild um, das war der grelle Blender beim Zoomen (Wunsch Nr. 56)
    this.wolken.mesh.visible = W.w > 0.003;
    if (this.wolken.mesh.visible) this.wolken.update(this, camera.position, szeneZuGeo(welt).h, sonne, U.uHell.value);
    this.wolken.mat.uniforms.uDunst.value.copy(U.uDunst.value);
    this.erde.update(camera, welt, hoeheUeberGrund, dt, U.uSonneE.value);
    this.kamGeo = szeneZuGeo(welt);
    if (bodenGeo) this.kistenUpdate(bodenGeo, hoeheUeberGrund < (this.mobil ? 1800 : 3500), ort ? { lat: ort.lat, lon: ort.lon, halb: ort.halb } : null, hoeheUeberGrund < (this.mobil ? 3000 : 9000));
    const sch = THREE.MathUtils.smoothstep(2800 - h, 0, 1000); this.baumSchrumpf.value = sch;   // von oben zeigt das Satellitenbild den Wald
    { const fern = this.baumFern.value + 1900; for (const k of this.kisten.values()) if (k.baeume) k.baeume.visible = sch > 0.02 && k.welt.distanceTo(this.kameraWelt) < fern; }
  }
  info() { let kisten = 0, haeuser = 0; for (const k of this.kisten.values()) if (k.mesh) { kisten++; haeuser += k.anzahl || 0; } return { kacheln: this.erde.geladen, sichtbar: this.erde.sichtbar.size, laden: this.erde.laufend, kisten, haeuser }; }
}

// Orte der Erddatenbank (daten/heute/cities.*, zlib je Ebene) für Suche und Namen
export async function ladeOrteListe() {
  const [meta, bin] = await Promise.all([fetch(new URL('../daten/heute/cities.json', import.meta.url)).then(r => r.json()), fetch(new URL('../daten/heute/cities.bin', import.meta.url)).then(r => r.arrayBuffer())]);
  const ebene = async (name) => { const [o, l] = meta.layers[name]; const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter(); w.write(new Uint8Array(bin, o, l)); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); };
  const [lon, lat, pop, en, de, metro, flag] = await Promise.all([ebene('lon'), ebene('lat'), ebene('pop'), ebene('en'), ebene('de'), ebene('metro'), ebene('flag')]);
  const LON = new Float32Array(lon.buffer), LAT = new Float32Array(lat.buffer), POP = new Uint32Array(pop.buffer), METRO = new Uint32Array(metro.buffer);
  const EN = new TextDecoder().decode(en).split('\n'), DE = new TextDecoder().decode(de).split('\n');
  const orte = []; for (let i = 0; i < meta.count; i++) orte.push({ lat: LAT[i], lon: LON[i], pop: POP[i], metro: METRO[i], flag: flag[i], name: DE[i] || EN[i], en: EN[i] });
  return orte;
}
// nächster Ort (gewichtet nach Größe) für den Namen einer Stelle
export function ortNahe(orte, lat, lon) {
  let best = null, bw = Infinity; const c = Math.cos(lat * D2R);
  for (const o of orte) { const dy = o.lat - lat; if (Math.abs(dy) > 0.6) continue; const dx = (o.lon - lon) * c, d = Math.hypot(dx, dy) * 111; if (d > 60) continue; const w = d / Math.pow(Math.max(1000, o.pop), 0.25); if (w < bw) { bw = w; best = { ...o, km: d }; } }
  return best;
}

// ---------- Kamera der Erde (seit 29.10.2026 abends) ----------
// Naders Wunsch: die Kugel darf beim Zoomen nicht aus dem Bild rutschen, der Weg vom All bis auf die Straße soll ohne Sprung sein.
// Umlauf um einen Zielpunkt am Boden wie Google Earth: Zustand in Geo (Ziel, Abstand, Kurs, Neigung), daraus die Lage der Kamera.
// Weit weg schaut sie senkrecht auf die Kugel (Neigung höchstens neigungMax), beim Hineinzoomen kippt sie langsam zum Horizont
// (neigungAuto). Zoom weich und auf den Mauszeiger, Ziehen greift die Kugel (Punkt unter dem Zeiger bleibt unter dem Zeiger), danach Nachlauf.
const glatt = t => t * t * (3 - 2 * t), klemm = THREE.MathUtils.clamp;
export class ErdKamera {
  constructor(welt) {
    this.welt = welt;
    this.lat = 38; this.lon = 12; this.boden = 0;          // Zielpunkt am Boden
    this.dist = 16e6; this.distSoll = 16e6;                // Abstand Kamera zum Ziel, weich geführt (logarithmisch)
    this.kurs = 0; this.neigung = 0;                       // Grad; Neigung 0 = senkrecht nach unten, 80 = fast waagrecht
    this.minDist = 6; this.maxDist = 3e7;
    this.traeg = null; this.greif = null; this.zoomAnker = null; this.flug = null; this.kippen = 0;
    this.bodenAn = (lat, lon) => welt.bodenGeo(lat, lon);   // das Dashboard setzt im gebauten Ort dessen Gelände ein
    this.hoehe = 1e7; this.kamGeo = { lat: 38, lon: 12, h: 1e7 };
  }
  static neigungMax(d) { const t = klemm((Math.log(d) - Math.log(22000)) / (Math.log(4.5e6) - Math.log(22000)), 0, 1); return 82 * (1 - glatt(t)); }
  static neigungAuto(d) { const t = klemm((Math.log(d) - Math.log(650)) / (Math.log(22000) - Math.log(650)), 0, 1); return 70 * (1 - glatt(t)); }
  // Lage in ECEF Szene: Ziel T, Kamera P, Achsen der Kamera (x rechts, y oben, z vom Ziel zur Kamera)
  lage() {
    const e = enu(this.lat, this.lon), T = geoZuSzene(this.lat, this.lon, this.boden, new THREE.Vector3());
    const k = this.kurs * D2R, n = this.neigung * D2R;
    const vor = new THREE.Vector3().addScaledVector(e.nord, Math.cos(k)).addScaledVector(e.ost, Math.sin(k));
    const x = new THREE.Vector3().addScaledVector(e.ost, Math.cos(k)).addScaledVector(e.nord, -Math.sin(k));
    const z = new THREE.Vector3().addScaledVector(e.oben, Math.cos(n)).addScaledVector(vor, -Math.sin(n));
    return { T, P: T.clone().addScaledVector(z, this.dist), x, y: new THREE.Vector3().crossVectors(z, x), z, e };
  }
  anwenden(camera) {
    const L = this.lage(), W = this.welt, q = W.zuLokal;
    W.weltZuLokal(L.P, camera.position);
    camera.quaternion.setFromRotationMatrix(_m.makeBasis(L.x.applyQuaternion(q), L.y.applyQuaternion(q), L.z.applyQuaternion(q)));
    camera.up.copy(L.e.oben).applyQuaternion(q); camera.updateMatrixWorld();
    const g = szeneZuGeo(L.P); this.kamGeo = g; this.hoehe = g.h - this.bodenAn(g.lat, g.lon);
    return L;
  }
  zielSetzen(v) { const g = szeneZuGeo(v); this.lat = klemm(g.lat, -85, 85); this.lon = g.lon; }
  // Richtung (ECEF) zum Ziel als Einheitsvektor und zurück
  zielRichtung() { return geoZuSzene(this.lat, this.lon, 0, new THREE.Vector3()).normalize(); }
  drehZiel(q) { const r = geoZuSzene(this.lat, this.lon, this.boden, new THREE.Vector3()), L = r.length(); r.normalize().applyQuaternion(q).multiplyScalar(L); this.zielSetzen(r); }
  // Schnitt des Strahls durch einen Bildpunkt (NDC) mit der Kugel durch das Ziel; liefert ECEF Punkt oder null
  treffer(camera, nx, ny) {
    const W = this.welt, O = W.lokalZuWelt(camera.position, new THREE.Vector3());
    const d = _v.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize().applyQuaternion(W.zuWelt);
    const r = geoZuSzene(this.lat, this.lon, this.boden, _w).length(), b = O.dot(d), c = O.lengthSq() - r * r, disk = b * b - c;
    if (disk < 0) return null; const t = -b - Math.sqrt(disk); return t > 0 ? O.addScaledVector(d, t) : null;
  }
  // ---------- Eingabe ----------
  greifen(camera, nx, ny) { this.flug = null; this.traeg = null; if (this.folge) { this.greif = { g0: null, nx, ny, t: performance.now(), w: null }; return; } const h = this.treffer(camera, nx, ny); this.greif = { g0: h ? h.normalize() : null, nx, ny, t: performance.now(), w: null }; }
  ziehen(camera, nx, ny) {
    const G = this.greif; if (!G) return;
    if (this.folge) { this.folgeKurs = (this.folgeKurs || 0) + (nx - G.nx) * 140; this.neigung = klemm(this.neigung + (ny - G.ny) * -90, 20, 92); G.nx = nx; G.ny = ny; this.folgeFrei = 6; return; }
    if (G.g0) {
      const h = this.treffer(camera, nx, ny);
      if (h) {
        const g1 = h.normalize(), q = new THREE.Quaternion().setFromUnitVectors(g1, G.g0);
        const winkel = 2 * Math.acos(klemm(q.w, -1, 1)), grenze = Math.max(1e-6, 0.35 * this.dist / ERDRADIUS);   // am Horizont nicht davonspringen
        if (winkel > grenze) q.slerp(new THREE.Quaternion(), 1 - grenze / winkel);
        this.drehZiel(q); this.anwenden(camera);
        const jetzt = performance.now(), dt = Math.max(1, jetzt - G.t) / 1000, a = new THREE.Vector3(q.x, q.y, q.z), s = a.length();
        if (s > 1e-12) { const w = Math.min(winkel, grenze) / dt; G.w = G.w ? { achse: a.normalize(), w: G.w.w * 0.6 + w * 0.4 } : { achse: a.normalize(), w }; }
        G.t = jetzt; G.nx = nx; G.ny = ny; return;
      }
    }
    // Zeiger im All: nach Bildschirm Pixeln verschieben
    const mpp = 2 * this.dist * Math.tan(camera.fov / 2 * D2R) / 2, dx = (nx - G.nx) * mpp * camera.aspect, dy = (ny - G.ny) * mpp, k = this.kurs * D2R;
    this.verschiebe(-dx * Math.cos(k) - dy * Math.sin(k), dx * Math.sin(k) - dy * Math.cos(k)); G.nx = nx; G.ny = ny;
  }
  loslassen() { const G = this.greif; this.greif = null; if (G && G.w && performance.now() - G.t < 120 && G.w.w > 1e-7) this.traeg = { achse: G.w.achse, w: G.w.w }; }
  verschiebe(dE, dN) { this.lat = klemm(this.lat + dN / ERDRADIUS / D2R, -85, 85); this.lon = ((this.lon + dE / (ERDRADIUS * Math.cos(this.lat * D2R)) / D2R + 540) % 360) - 180; }
  rad(camera, delta, nx, ny) {   // Mausrad oder Pinch: Faktor auf den Sollabstand, Anker unter dem Zeiger
    this.flug = null; const f = Math.exp(delta);
    this.distSoll = klemm(this.distSoll * f, this.minDist, this.maxDist);
    // nur beim Hineinzoomen zum Zeiger hin; beim Hinauszoomen bleibt das Ziel (sonst wanderte es über viele Schritte bis nach Tibet)
    const h = nx === undefined || f >= 1 ? null : this.treffer(camera, nx, ny); this.zoomAnker = h ? h.normalize() : null;
    if (f < 1) this.kippen = 1.2;   // beim Hineinzoomen eine Weile zum Horizont kippen
  }
  drehen(dx, dy) { this.flug = null; this.kurs = (this.kurs + dx * 0.25 + 360) % 360; this.neigung = klemm(this.neigung + dy * 0.22, 0, ErdKamera.neigungMax(this.dist)); }
  // Mitfliegen: fn liefert je Bild die Lage des Flugzeugs (lat, lon, h, kurs); null beendet. Danach steht das Ziel wieder am Boden
  folgen(fn, abstand = 95) { if (!fn) { const h = this.folgeH; this.folge = null; if (h !== undefined) { const b = this.bodenAn(this.lat, this.lon); this.dist = this.distSoll = Math.max(this.dist, h - b); this.neigung = Math.min(this.neigung, 40); } return; } const b = geoZuSzene(this.lat, this.lon, 0, new THREE.Vector3()).normalize(), G = fn(), c = G ? geoZuSzene(G.lat, G.lon, 0, new THREE.Vector3()).normalize() : b, weg = Math.acos(klemm(b.dot(c), -1, 1)) * ERDRADIUS; this.folge = fn; this.folgeEin = 0; this.folgeAbstand = abstand; this.folgeKurs = 0; this.folgeFrei = 0; this.folgeH = this.boden; this.folgeVon = { a: this.zielRichtung(), dist: this.dist, h: this.boden, neigung: this.neigung }; this.folgeDauer = klemm(2.4 + Math.log10(1 + weg / 1000) * 0.9, 2.5, 6); this.greif = null; this.flug = null; this.traeg = null; this.zoomAnker = null; }
  // Flug zu einem Ziel: Lage über den Großkreis, Abstand mit Bogen (logarithmisch), Kurs und Neigung weich
  fliegeZu({ lat, lon, dist, kurs = this.kurs, neigung = 0, dauer = null }) {   // dauer: eigene Flugzeit in Sekunden (Titelbild beim Öffnen: sofort)
    const a = this.zielRichtung(), b = geoZuSzene(lat, lon, 0, new THREE.Vector3()).normalize(), weg = Math.acos(klemm(a.dot(b), -1, 1)) * ERDRADIUS;
    this.flug = { von: { a, dist: this.dist, kurs: this.kurs, neigung: this.neigung, lat: this.lat, lon: this.lon }, lat, lon, b, dist, kurs, neigung, t: 0, weg,
      dauer: dauer ?? klemm(1.6 + Math.log10(1 + weg / 1000) * 1.5, 1.8, 8), bogen: Math.max(this.dist, dist, Math.min(weg * 1.1, 1.2e7)) };
    this.traeg = null; this.zoomAnker = null;
  }
  // ---------- je Bild ----------
  tick(dt, tasten = null) {
    // Mitfliegen: das Ziel ist das Flugzeug, die Kamera folgt seinem Kurs, Ziehen dreht um das Flugzeug
    if (this.folge) { const G = this.folge(); if (G) { let e = 1; if (this.folgeEin < 1) { this.folgeEin = Math.min(1, this.folgeEin + dt / this.folgeDauer); const k = this.folgeEin; e = k * k * (3 - 2 * k); } const V = this.folgeVon; if (e < 1) { const b = geoZuSzene(G.lat, G.lon, 0, new THREE.Vector3()).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V.a, b); this.zielSetzen(V.a.clone().applyQuaternion(new THREE.Quaternion().slerp(q, e)).multiplyScalar(ERDRADIUS + 1000)); this.folgeH = V.h + (G.h - V.h) * e; this.dist = this.distSoll = Math.exp(Math.log(V.dist) + (Math.log(this.folgeAbstand) - Math.log(V.dist)) * e); this.neigung = V.neigung + (80 - V.neigung) * e; } else { this.lat = G.lat; this.lon = G.lon; this.folgeH = G.h; } this.flug = null; this.traeg = null; this.zoomAnker = null; tasten = null; this.folgeFrei = Math.max(0, (this.folgeFrei || 0) - dt); if (this.folgeFrei <= 0) this.folgeKurs = (this.folgeKurs || 0) * Math.exp(-dt * 0.8); const ziel = G.kurs + (this.folgeKurs || 0), dk = ((ziel - this.kurs + 540) % 360) - 180; this.kurs = (this.kurs + dk * (1 - Math.exp(-dt * 1.6)) + 360) % 360; } else this.folge = null; }
    const F = this.flug;
    if (F) {
      F.t += dt; const k = Math.min(1, F.t / F.dauer), e = k < 0.5 ? 8 * k ** 4 : 1 - Math.pow(-2 * k + 2, 4) / 2;   // ruhiger Anfang und langer letzter Abstieg
      const q = new THREE.Quaternion().setFromUnitVectors(F.von.a, F.b), qe = new THREE.Quaternion().slerp(q, e);
      const r = F.von.a.clone().applyQuaternion(qe).multiplyScalar(ERDRADIUS + 1000); this.zielSetzen(r);
      if (k >= 1) { this.lat = F.lat; this.lon = F.lon; }
      // Abstand: logarithmisch zum Ziel, aber nie näher als die restliche Strecke (weiche Obergrenze): die Kamera bleibt hoch, solange sie
      // noch weit fliegt, und sinkt erst am Ende (vorher sank sie zur Hälfte auf 20 km und raste tief über die Alpen, ohne dass Kacheln nachkamen)
      const l0 = Math.log(F.von.dist), l1 = Math.log(F.dist), lb = Math.log(F.bogen), rest = F.weg * (1 - e);
      const li = l0 + (l1 - l0) * e + Math.max(0, lb - Math.max(l0, l1)) * Math.sin(Math.PI * k) * 0.85, lr = Math.log(rest * 1.3 + 1), w = 3;
      this.distSoll = F.dist; this.dist = Math.max(Math.exp(Math.max(li, lr) + Math.log(1 + Math.exp(-Math.abs(li - lr) * w)) / w), this.bodenAbstand || 0);   // weicher Boden gilt auch im Flug
      const dk = ((F.kurs - F.von.kurs + 540) % 360) - 180; this.kurs = (F.von.kurs + dk * e + 360) % 360;
      this.neigung = F.von.neigung + (F.neigung - F.von.neigung) * e;
      if (k >= 1) this.flug = null;
    } else {
      // Tasten: W A S D verschiebt das Ziel (Tempo nach Abstand), Q E zoomen
      if (tasten && (tasten.x || tasten.y)) { const v = Math.max(4, this.dist * 0.8) * (tasten.schnell ? 3 : 1) * dt, k = this.kurs * D2R; this.verschiebe((tasten.y * Math.sin(k) + tasten.x * Math.cos(k)) * v, (tasten.y * Math.cos(k) - tasten.x * Math.sin(k)) * v); this.traeg = null; }
      if (tasten && tasten.hoch) { this.distSoll = klemm(this.distSoll * Math.exp(-tasten.hoch * 1.4 * dt), this.minDist, this.maxDist); if (tasten.hoch > 0) this.kippen = 0.6; }
      // Nachlauf nach dem Ziehen
      if (this.traeg && !this.greif) { const T = this.traeg; this.drehZiel(new THREE.Quaternion().setFromAxisAngle(T.achse, T.w * dt)); T.w *= Math.exp(-3.2 * dt); if (T.w < 1e-8) this.traeg = null; }
      // Abstand weich zum Soll, Ziel wandert mit dem Zoom zum Anker (Punkt unter dem Zeiger bleibt stehen)
      this.distSoll = klemm(this.distSoll, this.minDist, this.maxDist);
      // weicher Boden (bodenAbstand): solange am Ziel noch kein Ort steht, bleibt die Kamera weiter weg und zoomt danach von selbst weiter
      const l = Math.log(this.dist), ls = Math.log(Math.max(this.distSoll, this.bodenAbstand || 0, this.minDist)), ln = l + (ls - l) * (1 - Math.exp(-9 * dt)), delta = ln - l;
      this.dist = Math.exp(ln);
      if (this.zoomAnker && Math.abs(delta) > 1e-6) {
        const s = klemm(1 - Math.exp(delta), -0.25, 0.25), a = this.zielRichtung(), q = new THREE.Quaternion().setFromUnitVectors(a, this.zoomAnker);
        this.drehZiel(new THREE.Quaternion().slerp(q, s));
      }
      if (Math.abs(ls - ln) < 1e-3) this.zoomAnker = null;
      // beim Hineinzoomen kippen (Google Earth), nie über die Grenze nach Abstand
      if (this.kippen > 0) { this.kippen -= dt; if (delta < 0) { const ziel = Math.max(this.neigung, ErdKamera.neigungAuto(this.dist)); this.neigung += (ziel - this.neigung) * (1 - Math.exp(-3.5 * dt)); } }
    }
    this.neigung = this.folge ? klemm(this.neigung, 20, 92) : klemm(this.neigung, 0, ErdKamera.neigungMax(this.dist));
    this.boden = this.folge ? this.folgeH : this.bodenAn(this.lat, this.lon);
    // Kamera nie unter den Boden: Neigung so begrenzen, dass sie mindestens 1,8 m über dem Gelände bleibt
    const L = this.lage(), g = szeneZuGeo(L.P), bc = this.bodenAn(g.lat, g.lon);
    if (g.h - bc < 1.8) { const c = klemm((1.8 + bc - this.boden) / this.dist, -1, 1); this.neigung = Math.min(this.neigung, Math.acos(c) / D2R); }
  }
  // aus einer beliebigen Kamera (nach Zu Fuß oder Fahren) übernehmen: Ziel ist der Boden in Blickrichtung
  uebernehmen(camera, zielLokal) {
    const W = this.welt, Pw = W.lokalZuWelt(camera.position, new THREE.Vector3()), Tw = W.lokalZuWelt(zielLokal, new THREE.Vector3());
    const g = szeneZuGeo(Tw); this.lat = g.lat; this.lon = g.lon; this.boden = this.bodenAn(g.lat, g.lon);
    const off = Pw.sub(geoZuSzene(g.lat, g.lon, this.boden, new THREE.Vector3())), d = off.length(), e = enu(g.lat, g.lon);
    this.dist = this.distSoll = Math.max(this.minDist, d);
    this.neigung = klemm(Math.acos(klemm(off.dot(e.oben) / Math.max(1e-6, d), -1, 1)) / D2R, 0, 85);
    this.kurs = (Math.atan2(-off.dot(e.ost), -off.dot(e.nord)) / D2R + 360) % 360;
    this.traeg = null; this.flug = null; this.zoomAnker = null;
  }
}
