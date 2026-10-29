// Die ganze Erde im Dashboard (08_WELTBAU.md Phase 3 und 4, seit 29.10.2026): Kugel aus kit/erde.js im lokalen Rahmen eines Ankers
// (x Osten, y oben, z Süden, Meter, wie jeder Ort), Kamera vom All bis zum Gehweg, Fernbereich mit gemalten Karten und Gebäudekisten,
// und rund um die Kamera ein gebauter Ort aus den Kacheln (kit/ortbau.js) mit Verkehr, Menschen, Innenräumen und Spielmodi.
// Skill threejs-large-worlds: große Zahlen bleiben in JavaScript (Float64), die Szene liegt immer um den Anker (wandernder Ursprung).
import * as THREE from 'three';
import { Erde, geoZuSzene, szeneZuGeo, enu, kachelVonGeo, geoVonKachel, atmosphaere, wasserMaterial, PERIODE, R as ERDRADIUS } from './erde.js';
import { karteBestellen, kistenBestellen } from './ortdienst.js';
import { baumImpostor } from './ort.js';
import { fernMaterial } from './city.js';
import { Wolkendecke } from './wolkendecke.js';

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
    this.atmo = atmosphaere(); this.erdGruppe.add(this.atmo);   // Saum der Atmosphäre aus dem All
    this.wolken = new Wolkendecke({ mobil, uWolken: this.erde.mat.uniforms.uWolken }); gruppe.add(this.wolken.mesh);   // Wolkendecke in 6,5 km, Schatten auf der Kugel
    if (!mobil) new THREE.TextureLoader().load(new URL('../assets/erde/detail.png', import.meta.url).href, t => {   // Luftbild Texturen für die Nahsicht (CC0)
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8; t.needsUpdate = true;
      renderer.initTexture(t); const U = this.erde.mat.uniforms; U.tDetail.value = t; U.uDetailDa.value = 1;
    });
    this.kistenVorrat = null;   // Gebäudekisten am Flugziel vorab
    this.anker = { lat: 52.50944, lon: 13.37611, h: 34 }; this.ursprung = new THREE.Vector3();
    this.zuLokal = new THREE.Quaternion(); this.zuWelt = new THREE.Quaternion();
    this.kisten = new Map(); this.kistenMat = fernMaterial({ instanziert: false, lokal: true, licht: 0.3 }); this.kistenLaufend = 0;
    this.baumSchrumpf = { value: 1 }; this.baumMats = {};   // Bäume außerhalb des Ortes (je Kisten Kachel), schrumpfen von oben weg wie im Ort
    this.kistenMatAlt = mitOrtAussparung(fernMaterial({ instanziert: false, lokal: true, licht: 0.3 }), this.erde.mat.uniforms);
    this.kistenRadius = mobil ? 1200 : 2000;
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

  // ---------- Karten der Kugelkacheln (Worker) ----------
  karte(k) {
    // Vorrang: Kacheln, die im Verhältnis zu ihrem Abstand groß sind (nah und fein), zuerst; nicht mehr geladene Kacheln fallen weg
    // während eines Flugs zählen Kacheln am Ziel wie Kacheln unter der Kamera (sonst kamen die Karten am Ziel erst nach der Landung)
    const vorrang = () => Math.min(this.kameraWelt.distanceTo(k.mitte), this.zielWelt ? this.zielWelt.distanceTo(k.mitte) * 0.5 : Infinity) / k.spanne - (k.mesh?.visible ? 2 : 0), abgesagt = () => !k.mesh;
    return karteBestellen(k.z, k.x, k.y, this.mobil ? 256 : 512, vorrang, abgesagt).then(({ bild, maske }) => {
      const t = new THREE.Texture(bild); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.mobil ? 2 : 8;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
      this.renderer.initTexture(t);   // gleich hochladen: sonst kamen beim Abstieg dutzende Karten im selben Bild auf die Grafikkarte (bis 470 ms)
      const m = new THREE.Texture(maske); m.flipY = false; m.generateMipmaps = true; m.minFilter = THREE.LinearMipmapLinearFilter; m.wrapS = m.wrapT = THREE.ClampToEdgeWrapping; m.needsUpdate = true;
      this.renderer.initTexture(m);
      return { tex: t, maske: m };
    });
  }

  // ---------- Gebäudekisten im Umkreis der Kamera (Stufe 14) ----------
  // boden: { lat, lon } der Kamera, aktiv: nur in Bodennähe; ohne: gebauter Ort { lat, lon, halb }
  // Kisten tauschen ohne Lücke (seit 29.10.2026 abends): wechselt der gebaute Ort, bleiben die alten Kisten stehen, bis die neuen da sind;
  // solange spart ihr Shader das Quadrat des Ortes aus (kistenMatAlt), danach kommen sie ohne die Häuser des Ortes aus dem Worker.
  kistenUpdate(boden, aktiv, ohne) {
    const okey = ohne ? `${ohne.lat.toFixed(5)},${ohne.lon.toFixed(5)},${ohne.halb}` : '';
    const wunsch = new Set();
    const umkreis = (p, radius) => {
      const z = 14, t = kachelVonGeo(p.lat, p.lon, z), spanne = 40075016 * Math.cos(p.lat * D2R) / 2 ** z, r = Math.ceil(radius / spanne) + 1;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const x = t.x + dx, y = t.y + dy, g = geoVonKachel(x + 0.5, y + 0.5, z);
        const d = Math.hypot((g.lat - p.lat) * 111000, (g.lon - p.lon) * 111000 * Math.cos(p.lat * D2R));
        if (d < radius + spanne * 0.7) wunsch.add(`${x}/${y}`);
      }
    };
    if (aktiv) umkreis(boden, this.kistenRadius);
    if (this.kistenVorrat && performance.now() < this.kistenVorrat.bis) umkreis(this.kistenVorrat, this.kistenRadius * 0.6); else this.kistenVorrat = null;
    const weg = (k, key) => { if (k.mesh) { this.erdGruppe.remove(k.mesh); k.mesh.geometry.dispose(); } if (k.baeume) { this.erdGruppe.remove(k.baeume); k.baeume.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); } this.kisten.delete(key); };
    for (const [key, k] of this.kisten) {
      if (!wunsch.has(key)) { if (!k.laedt) weg(k, key); continue; }
      if (k.okey !== okey && k.mesh && k.mesh.material !== this.kistenMatAlt) k.mesh.material = this.kistenMatAlt;   // altes Ort Quadrat aussparen, bis neu geladen
    }
    const max = this.mobil ? 2 : 3;
    for (const key of wunsch) {
      const alt = this.kisten.get(key);
      if ((alt && (alt.laedt || alt.okey === okey)) || this.kistenLaufend >= max) continue;
      const [x, y] = key.split('/').map(Number), eintrag = alt || { mesh: null, welt: new THREE.Vector3() };
      eintrag.laedt = true; eintrag.okeyNeu = okey; this.kisten.set(key, eintrag); this.kistenLaufend++;
      // Dreiecke je Kachel: nah mehr, fern weniger (Tokio hat 10.000 Häuser je Kachel); die wichtigsten Häuser (Höhe mal Größe) zuerst
      const g = geoVonKachel(x + 0.5, y + 0.5, 14), d = Math.hypot((g.lat - boden.lat) * 111000, (g.lon - boden.lon) * 111000 * Math.cos(boden.lat * D2R));
      const vorrat = this.kistenVorrat ? Math.hypot((g.lat - this.kistenVorrat.lat) * 111000, (g.lon - this.kistenVorrat.lon) * 111000 * Math.cos(g.lat * D2R)) : Infinity;
      const budget = this.mobil ? 16000 : Math.min(d, vorrat) < 1100 ? 55000 : 26000;
      const mitte = geoZuSzene(g.lat, g.lon, 0, new THREE.Vector3());
      const baumBudget = this.mobil ? 0 : Math.min(d, vorrat) < 1100 ? 2600 : 1400;
      kistenBestellen(x, y, ohne, budget, () => Math.min(this.kameraWelt.distanceTo(mitte), this.zielWelt ? this.zielWelt.distanceTo(mitte) * 0.5 : Infinity) / 800 - (eintrag.mesh ? 0 : 1), () => this.kisten.get(key) !== eintrag, baumBudget).then(dd => {
        eintrag.laedt = false; this.kistenLaufend--;
        if (this.kisten.get(key) !== eintrag) return;
        eintrag.okey = eintrag.okeyNeu;
        if (eintrag.mesh) { this.erdGruppe.remove(eintrag.mesh); eintrag.mesh.geometry.dispose(); eintrag.mesh = null; }
        if (eintrag.baeume) { this.erdGruppe.remove(eintrag.baeume); eintrag.baeume.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); eintrag.baeume = null; }
        geoZuSzene(dd.lat, dd.lon, dd.h, eintrag.welt);
        if (dd.baeume?.length) eintrag.baeume = this.baeumeAnlegen(dd, eintrag);
        if (!dd.pos.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(dd.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(dd.nor, 3)); geo.setAttribute('aTyp', new THREE.BufferAttribute(dd.typ, 1));
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, this.kistenMat); m.castShadow = false; m.receiveShadow = false; m.name = 'kisten ' + key;
        geoZuSzene(dd.lat, dd.lon, dd.h, eintrag.welt);
        m.position.copy(eintrag.welt).sub(this.ursprung); m.quaternion.copy(drehung(dd.lat, dd.lon).zuWelt);
        eintrag.mesh = m; eintrag.anzahl = dd.anzahl; this.erdGruppe.add(m);
      }).catch(() => { eintrag.laedt = false; this.kistenLaufend--; if (!eintrag.mesh) this.kisten.delete(key); });
    }
  }

  // Bäume einer Kisten Kachel: Laub (Eiche) und Nadel (Kiefer) als Baumbilder, Lage wie die Kisten (Rahmen der Kachelmitte)
  baeumeAnlegen(dd, eintrag) {
    const B = dd.baeume, n = B.length / 5, g = new THREE.Group(); g.name = 'bäume';
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (const [art, id] of [[0, 'eiche'], [1, 'kiefer']]) {
      let c = 0; for (let i = 0; i < n; i++) if (B[i * 5 + 4] === art) c++; if (!c) continue;
      const im = baumImpostor(this.renderer, id, c); im.material = this.baumMat(id, im.material);
      let k = 0; for (let i = 0; i < n; i++) { if (B[i * 5 + 4] !== art) continue; P.set(B[i * 5], B[i * 5 + 1], B[i * 5 + 2]); Q.setFromAxisAngle(Y, (i * 2.399) % 6.283); S.setScalar(B[i * 5 + 3] / im.userData.impostor); M.compose(P, Q, S); im.setMatrixAt(k++, M); }
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = false; g.add(im);
    }
    g.position.copy(eintrag.welt).sub(this.ursprung); g.quaternion.copy(drehung(dd.lat, dd.lon).zuWelt); g.visible = this.baumSchrumpf.value > 0.02;
    this.erdGruppe.add(g); return g;
  }
  baumMat(id, basis) {   // Kopie des Baumbilds mit Schrumpfen zur Wurzel (uSchrumpf, je Bild nach der Kamerahöhe)
    if (this.baumMats[id]) return this.baumMats[id];
    const m = basis.clone(), U = this.baumSchrumpf;
    m.onBeforeCompile = sh => { sh.uniforms.uSchrumpf = U; sh.vertexShader = 'uniform float uSchrumpf;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed *= uSchrumpf;'); };
    m.customProgramCacheKey = () => 'baumschrumpf';
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
    U.uNebel.value.set(nebel[0], nebel[1]); U.uNebelFarbe.value.copy(nebelFarbe);
    if (ort) {
      const c = ort.mitteLokal; U.uOrt.value.set(ort.halb - 1.5, 1, c.x, c.z);
      const q = ort.gruppe.quaternion, ax = _v.set(1, 0, 0).applyQuaternion(q), az = _w.set(0, 0, 1).applyQuaternion(q);
      U.uOrtX.value.set(ax.x, ax.z).normalize(); U.uOrtZ.value.set(az.x, az.z).normalize();
    } else U.uOrt.value.set(0, 0, 0, 0);
    const welt = this.lokalZuWelt(camera.position, this.kameraWelt);
    // Wolken: Bedeckung nach dem Wetter, Drift, Schatten aus der Höhe, die Decke erst über 1,2 km (darunter die Wolken des Himmels)
    const W = U.uWolken.value; W.x = 0.12 + 0.7 * wolkenWetter;   // klar wenige Wolken (man will die Erde sehen), Regen fast bedeckt
    W.y = (W.y + dt * 0.003) % 100000;   // Drift: Haufenwolken rund 15 m/s, Wetterlagen rund 30 m/s (stand vorher im Kommentar, die Wolken standen still)
    W.z = 0.42 * THREE.MathUtils.smoothstep(h, 1500, 5000); W.w = THREE.MathUtils.smoothstep(h, 1200, 3500) * (this.deckeDuenn ? 0.15 : 1);   // mit Wolkenbergen nur dünne Federwolken
    this.wolken.mesh.visible = W.w > 0.003;
    if (this.wolken.mesh.visible) this.wolken.update(this, camera.position, szeneZuGeo(welt).h, sonne, U.uHell.value);
    this.wolken.mat.uniforms.uDunst.value.copy(U.uDunst.value);
    this.erde.update(camera, welt, hoeheUeberGrund, dt, U.uSonneE.value);
    if (bodenGeo) this.kistenUpdate(bodenGeo, hoeheUeberGrund < (this.mobil ? 1800 : 3500), ort ? { lat: ort.lat, lon: ort.lon, halb: ort.halb } : null);
    const sch = THREE.MathUtils.smoothstep(380 - h, 0, 130); this.baumSchrumpf.value = sch;   // von oben zeigt das Satellitenbild den Wald
    for (const k of this.kisten.values()) if (k.baeume) k.baeume.visible = sch > 0.02;
  }
  info() { let kisten = 0, haeuser = 0; for (const k of this.kisten.values()) if (k.mesh) { kisten++; haeuser += k.anzahl || 0; } return { kacheln: this.erde.geladen, sichtbar: this.erde.sichtbar.size, laden: this.erde.laufend, kisten, haeuser }; }
}

// Orte der Erddatenbank (daten/heute/cities.*, zlib je Ebene) für Suche und Namen
export async function ladeOrteListe() {
  const [meta, bin] = await Promise.all([fetch(new URL('../daten/heute/cities.json', import.meta.url)).then(r => r.json()), fetch(new URL('../daten/heute/cities.bin', import.meta.url)).then(r => r.arrayBuffer())]);
  const ebene = async (name) => { const [o, l] = meta.layers[name]; const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter(); w.write(new Uint8Array(bin, o, l)); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); };
  const [lon, lat, pop, en, de] = await Promise.all([ebene('lon'), ebene('lat'), ebene('pop'), ebene('en'), ebene('de')]);
  const LON = new Float32Array(lon.buffer), LAT = new Float32Array(lat.buffer), POP = new Uint32Array(pop.buffer);
  const EN = new TextDecoder().decode(en).split('\n'), DE = new TextDecoder().decode(de).split('\n');
  const orte = []; for (let i = 0; i < meta.count; i++) orte.push({ lat: LAT[i], lon: LON[i], pop: POP[i], name: DE[i] || EN[i], en: EN[i] });
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
  greifen(camera, nx, ny) { this.flug = null; this.traeg = null; const h = this.treffer(camera, nx, ny); this.greif = { g0: h ? h.normalize() : null, nx, ny, t: performance.now(), w: null }; }
  ziehen(camera, nx, ny) {
    const G = this.greif; if (!G) return;
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
  // Flug zu einem Ziel: Lage über den Großkreis, Abstand mit Bogen (logarithmisch), Kurs und Neigung weich
  fliegeZu({ lat, lon, dist, kurs = this.kurs, neigung = 0 }) {
    const a = this.zielRichtung(), b = geoZuSzene(lat, lon, 0, new THREE.Vector3()).normalize(), weg = Math.acos(klemm(a.dot(b), -1, 1)) * ERDRADIUS;
    this.flug = { von: { a, dist: this.dist, kurs: this.kurs, neigung: this.neigung, lat: this.lat, lon: this.lon }, lat, lon, b, dist, kurs, neigung, t: 0, weg,
      dauer: klemm(1.6 + Math.log10(1 + weg / 1000) * 1.5, 1.8, 8), bogen: Math.max(this.dist, dist, Math.min(weg * 1.1, 1.2e7)) };
    this.traeg = null; this.zoomAnker = null;
  }
  // ---------- je Bild ----------
  tick(dt, tasten = null) {
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
    this.neigung = klemm(this.neigung, 0, ErdKamera.neigungMax(this.dist));
    this.boden = this.bodenAn(this.lat, this.lon);
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
