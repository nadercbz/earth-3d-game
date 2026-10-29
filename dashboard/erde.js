// EARTH 3D GAME · Erde (08_WELTBAU.md Phase 1): Kugel mit Gelände, Tag und Nacht, Orte als Lichter, Kamera vom All bis zum Boden.
import * as THREE from 'three';
import { Erde, Kugelkamera, geoZuSzene, szeneZuGeo, sonnenRichtung, orteLichter, R } from '../kit/erde.js';
import { Sterne } from '../kit/himmel.js';

const MOBIL = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('de-DE');

const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance', reversedDepthBuffer: true, logarithmicDepthBuffer: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBIL ? 1.5 : 2)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.info.autoReset = false;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 1e8);
const welt = new THREE.Group(); scene.add(welt);

// Tag und Nacht aus dem echten Sonnenstand (UTC jetzt), Uhrzeit verschiebbar
let zeitVersatz = 0;   // Stunden
const sonne = new THREE.Vector3(1, 0, 0);
const sterne = new Sterne(MOBIL ? 1200 : 2500, 5e7); sterne.mat.size = 1.6; scene.add(sterne.mesh);

const laden = new THREE.TextureLoader();
const [tag, nacht] = await Promise.all([laden.loadAsync('../assets/erde/tag.jpg'), laden.loadAsync('../assets/erde/nacht.jpg')]);
const erde = new Erde({ renderer, gruppe: welt, tag, nacht, mobil: MOBIL });
const kam = new Kugelkamera(camera);
window.ERDE = { erde, kam, camera, renderer, scene, THREE };

// Orte aus der Erddatenbank (zlib je Ebene, DecompressionStream)
async function ladeOrte() {
  const [meta, bin] = await Promise.all([fetch('../daten/heute/cities.json').then(r => r.json()), fetch('../daten/heute/cities.bin').then(r => r.arrayBuffer())]);
  const ebene = async (name) => { const [o, l] = meta.layers[name]; const ds = new DecompressionStream('deflate'); const w = ds.writable.getWriter(); w.write(new Uint8Array(bin, o, l)); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); };
  const [lon, lat, pop, flag, en, de] = await Promise.all([ebene('lon'), ebene('lat'), ebene('pop'), ebene('flag'), ebene('en'), ebene('de')]);
  const LON = new Float32Array(lon.buffer), LAT = new Float32Array(lat.buffer), POP = new Uint32Array(pop.buffer), FLAG = flag;
  const EN = new TextDecoder().decode(en).split('\n'), DE = new TextDecoder().decode(de).split('\n');
  const orte = []; for (let i = 0; i < meta.count; i++) orte.push({ lat: LAT[i], lon: LON[i], pop: POP[i], flag: FLAG[i], name: DE[i] || EN[i], en: EN[i] });
  return orte;
}
$('ladetext').textContent = 'Orte werden geladen';
let orte = [];
try { orte = await ladeOrte(); } catch (e) { console.warn('Orte nicht ladbar (daten/ fehlt online)', e); }
let lichter = null;
if (orte.length) { lichter = orteLichter(orte, erde.ursprung); welt.add(lichter); }
$('laden').classList.add('weg');

// Suche
const suche = $('suche'), treffer = $('treffer');
suche.oninput = () => {
  const q = suche.value.trim().toLowerCase(); treffer.innerHTML = ''; if (q.length < 2) { treffer.style.display = 'none'; return; }
  const hits = orte.filter(o => o.name.toLowerCase().startsWith(q) || o.en.toLowerCase().startsWith(q)).sort((a, b) => b.pop - a.pop).slice(0, 12);
  for (const o of hits) { const b = document.createElement('button'); b.innerHTML = `${o.name}<small>${fmt(o.pop)} Einwohner</small>`; b.onclick = () => { fliegeZu(o.lat, o.lon, Math.max(1500, Math.sqrt(o.pop) * 25)); suche.value = ''; treffer.style.display = 'none'; }; treffer.appendChild(b); }
  treffer.style.display = hits.length ? 'block' : 'none';
};
const ORTE = { berlin: [52.5163, 13.3777, 2500], marrakesch: [31.6295, -7.9811, 2500], tokio: [35.6762, 139.6503, 3000], newyork: [40.7580, -73.9855, 2500], rio: [-22.9519, -43.2105, 2500] };
document.querySelectorAll('#erde-leiste button[data-ort]').forEach(b => { b.onclick = () => fliegeZu(...ORTE[b.dataset.ort]); });
$('landen').onclick = () => { ziel = { lat: kam.lat, lon: kam.lon, hoehe: 60, neigung: -12, t: 0, dauer: 2.5, von: { ...kamStand() } }; };
$('all').onclick = () => fliegeZu(kam.lat, kam.lon, 12000000, -89);

// Flug zu einem Ziel (weich, Höhe mit Bogen)
let ziel = null;
const kamStand = () => ({ lat: kam.lat, lon: kam.lon, hoehe: kam.hoehe, neigung: kam.neigung, kurs: kam.kurs });
function fliegeZu(lat, lon, hoehe, neigung = -55) {
  const von = kamStand(), d = Math.hypot((lat - von.lat) * 111000, (lon - von.lon) * 111000 * Math.cos(lat * Math.PI / 180));
  ziel = { lat, lon, hoehe, neigung, t: 0, dauer: THREE.MathUtils.clamp(1 + Math.log10(1 + d / 1000) * 1.2, 1.2, 6), von, bogen: Math.max(von.hoehe, hoehe, Math.min(d * 0.9, 9e6)) };
}

// Eingabe: Ziehen verschiebt, Rechts oder Shift dreht, Rad zoomt, WASD fährt, Q E Höhe
const taste = new Set(); let zieht = null, letzt = [0, 0];
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; taste.add(e.code); });
addEventListener('keyup', e => taste.delete(e.code));
const c = renderer.domElement;
c.addEventListener('pointerdown', e => { zieht = e.button === 2 || e.shiftKey ? 'drehen' : 'ziehen'; letzt = [e.clientX, e.clientY]; c.setPointerCapture(e.pointerId); ziel = null; });
c.addEventListener('pointermove', e => { if (!zieht) return; const dx = e.clientX - letzt[0], dy = e.clientY - letzt[1]; letzt = [e.clientX, e.clientY]; if (zieht === 'drehen') kam.drehen(dx, dy); else kam.ziehen(dx, dy, innerHeight); });
c.addEventListener('pointerup', () => { zieht = null; }); c.addEventListener('contextmenu', e => e.preventDefault());
c.addEventListener('wheel', e => { e.preventDefault(); kam.zoom(Math.exp(e.deltaY * 0.0016)); ziel = null; }, { passive: false });
let pinch = null;
c.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
c.addEventListener('touchmove', e => { if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); kam.zoom(pinch / d); pinch = d; } }, { passive: true });

const sonnenLicht = new THREE.DirectionalLight(0xffffff, 0); scene.add(sonnenLicht);
const uhr = new THREE.Timer(); let t = 0, fps = 60, hudT = 0;
function tick(dt) {
  t += dt;
  if (ziel) {   // Flug: Lage linear, Höhe mit Bogen (hoch und wieder runter), Neigung weich
    ziel.t += dt; const k = Math.min(1, ziel.t / ziel.dauer), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const v = ziel.von; kam.lat = v.lat + (ziel.lat - v.lat) * e; let dl = ziel.lon - v.lon; dl = ((dl + 540) % 360) - 180; kam.lon = v.lon + dl * e;
    const bogen = ziel.bogen ? Math.sin(Math.PI * k) * (ziel.bogen - Math.max(v.hoehe, ziel.hoehe)) * 0.6 : 0;
    kam.hoehe = Math.exp(Math.log(v.hoehe) + (Math.log(ziel.hoehe) - Math.log(v.hoehe)) * e) + Math.max(0, bogen);
    kam.neigung = v.neigung + (ziel.neigung - v.neigung) * e;
    if (k >= 1) ziel = null;
  }
  // Tasten: Tempo nach Höhe (Skill threejs-large-worlds), Kurs aus der Kamera
  const tempo = Math.max(2, kam.hoehe * 0.6) * (taste.has('ShiftLeft') ? 3 : 1), k = kam.kurs * Math.PI / 180;
  const vor = (taste.has('KeyW') || taste.has('ArrowUp') ? 1 : 0) - (taste.has('KeyS') || taste.has('ArrowDown') ? 1 : 0), seit = (taste.has('KeyD') || taste.has('ArrowRight') ? 1 : 0) - (taste.has('KeyA') || taste.has('ArrowLeft') ? 1 : 0);
  if (vor || seit) { kam.verschiebe((vor * Math.sin(k) + seit * Math.cos(k)) * tempo * dt, (vor * Math.cos(k) - seit * Math.sin(k)) * tempo * dt); ziel = null; }
  if (taste.has('KeyQ')) kam.zoom(Math.exp(1.2 * dt)); if (taste.has('KeyE')) kam.zoom(Math.exp(-1.2 * dt));
  // Boden unter der Kamera (nie hinein)
  kam.boden = erde.hoehe(kam.lat, kam.lon);
  if (kam.hoehe < 1.6) kam.hoehe = 1.6;
  kam.anwenden(erde.ursprung);
  // wandernder Ursprung: wenn die Kamera 20 km vom Ursprung weg ist, alles umsetzen
  if (kam.welt.distanceTo(erde.ursprung) > 20000) { erde.setzeUrsprung(kam.welt); if (lichter) lichter.position.copy(erde.ursprung).negate(); kam.anwenden(erde.ursprung); }
  // Sonne
  sonne.copy(sonnenRichtung(new Date(Date.now() + zeitVersatz * 3600000)));
  erde.mat.uniforms.uSonne.value.copy(sonne); if (lichter) { lichter.material.uniforms.uSonne.value.copy(sonne); lichter.material.uniforms.uStaerke.value = THREE.MathUtils.clamp(1 - (kam.hoehe - 300000) / 4000000 * 0.75, 0.25, 1); }   // aus dem All dezenter, sonst wird Europa ein weißer Fleck
  sonnenLicht.position.copy(sonne).multiplyScalar(1e7); sonnenLicht.intensity = 2.5;
  sterne.update(camera.position, { nacht: 1, wolken: 0 }); sterne.mat.opacity = THREE.MathUtils.clamp((kam.hoehe - 20000) / 200000, 0.2, 1);
  erde.update(camera, kam.welt, kam.hoehe);
  renderer.info.reset(); renderer.render(scene, camera);
  fps = fps * 0.95 + 0.05 / Math.max(dt, 1e-3); hudT += dt;
  if (hudT > 0.4) { hudT = 0; const i = renderer.info.render; $('erde-hud').innerHTML = `<b>${kam.lat.toFixed(4)}°, ${kam.lon.toFixed(4)}°</b><br>Höhe ${kam.hoehe >= 10000 ? fmt(kam.hoehe / 1000) + ' km' : fmt(kam.hoehe) + ' m'} über Grund (${fmt(kam.boden)} m)<br>${Math.round(fps)} fps · ${fmt(i.calls)} Aufrufe · ${fmt(i.triangles / 1000)}k Dreiecke<br>Kacheln ${erde.geladen} geladen, ${erde.sichtbar.size} im Bild, ${erde.laufend} laden`; }
}
function frame() { requestAnimationFrame(frame); if (!innerWidth || window.ERDE.pause) return; uhr.update(); tick(Math.min(0.05, uhr.getDelta())); }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
window.ERDE.tick = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); }; window.ERDE.fliegeZu = fliegeZu; window.ERDE.setzeZeit = h => { zeitVersatz = h; };
requestAnimationFrame(frame);
