// EARTH 3D GAME · Projekt Dashboard: die ersten Bausteine in 3D (Gebäude, Straßen, Texturen, Bäume, Menschen).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { initMaterials, makeMaterials, NACHT } from '../kit/materials.js';
import { buildCity, buildFernstadt, bodenStadt } from '../kit/city.js';
import { STILE } from '../kit/stile.js';
import { buildBuilding, TYPEN_INFO } from '../kit/buildings.js';
import { buildIntersection, Ampelsteuerung } from '../kit/roads.js';
import { BAEUME, makeTree, updateTrees, instanzBaeume, jahreszeit, vorlage } from '../kit/trees.js';
import { alleMenschen, loadPerson, spawn, ladeBewegungen, handyNetze } from '../kit/people.js';
import { Menge } from '../kit/crowd.js';
import { ladeOrt, Ort } from '../kit/ort.js';
import { alleFahrzeuge, ladeFahrzeug, setzeFahrzeug, fahrzeugeHandy, ladeFahrzeugStufen, Flotte } from '../kit/vehicles.js';
import { baueNetz, Verkehr, Signalanlagen, baueSignalkoepfe, ueberwegePhasen } from '../kit/traffic.js';
import { Eingabe } from '../kit/input.js';
import { Kollision } from '../kit/collision.js';
import { Figur, Verfolger } from '../kit/player.js';
import { Fahrer } from '../kit/drive.js';
import { Innenwelt } from '../kit/interior.js';
import { ortBestellen } from '../kit/ortdienst.js';
import { ErdWelt, ErdKamera, ladeOrteListe, ortNahe } from '../kit/erdwelt.js';
import { Jet, baueJet, jetEffekte, Streifen, JetTon, luftDichte } from '../kit/jet.js';
import { geoZuSzene, szeneZuGeo, enu } from '../kit/erde.js';
import { sonnenstand, Wolken, Sterne, Regen, WETTER } from '../kit/himmel.js';
import { Minikarte } from '../kit/minikarte.js';
import { Navi } from '../kit/navi.js';
import { ortFotoUniforms, ortFotoLaden, ortFotoFrei } from '../kit/ortfoto.js';
import { Wolkenberge } from '../kit/wolkenberge.js';
import { Leben } from '../kit/leben.js';
import { rng, orient } from '../kit/geo.js';

const MOBIL = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('de-DE');
const ladetext = t => { $('ladetext').textContent = t; };

// Renderer, Kamera, Steuerung
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBIL ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.25, 6000);
camera.position.set(-80, 60, 95);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.62;   // leicht nach oben schauen erlaubt (Augenhöhe zwischen Hochhäusern), Boden schützt tick() controls.minDistance = 1.5; controls.maxDistance = 1200;
controls.target.set(0, 6, 0);
controls.autoRotateSpeed = 0.5;

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
labels.domElement.className = 'labels';
document.body.appendChild(labels.domElement);

// Himmel, Sonne, Umgebungslicht
const sky = new Sky(); sky.scale.setScalar(10000); scene.add(sky);
const SU = sky.material.uniforms;
SU.uHimmel = { value: 1 };   // Erde: Himmel blendet mit der Höhe ins Schwarz des Alls (erdTick), sonst 1
sky.material.fragmentShader = 'uniform float uHimmel;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uHimmel, 1.0 );');
sky.renderOrder = -3;
SU.turbidity.value = 8; SU.rayleigh.value = 0.9; SU.mieCoefficient.value = 0.006; SU.mieDirectionalG.value = 0.8;
const skyScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(10000); sky2.material = sky.material; skyScene.add(sky2);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBIL ? 2048 : 4096, MOBIL ? 2048 : 4096);
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
sun.shadow.camera.layers.enable(1);   // Ebene 1: Schattenproxys der Gebäude an echten Orten (kit/ort.js), nur die Schattenkamera sieht sie
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xe6eef8, 0x8f7f6c, 0.55); scene.add(hemi);
scene.fog = new THREE.Fog(0xd3d7da, 420, 1650);   // Dunst wie in der Vorlage: Kern klar, Ferne verschwindet

// Nachbearbeitung
// Kantenglättung trotz Nachbearbeitung: MSAA im Puffer (am Handy aus)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: MOBIL ? 0 : 4,
  depthTexture: MOBIL ? null : new THREE.DepthTexture(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()) }));   // Tiefe für die Wolkenberge (kit/wolkenberge.js)
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 5.0, distanceExponent: 1.4, thickness: 6.0, scale: 1.4, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9, radiusExponent: 1.5, rings: 3 });   // stärker entrauschen, keine Körnung am Boden
gtao.blendIntensity = 1.0;
gtao.enabled = false;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.0, 0.5, 0.9);
bloom.enabled = false;
composer.addPass(bloom);
composer.addPass(new OutputPass());
// Farbgebung nach der Vorlage: mehr Kontrast, etwas weniger Sättigung, kühle Schatten, leichte Vignette
const farbe = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uKontrast: { value: 1.2 }, uSaett: { value: 0.88 }, uVignette: { value: 0.2 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uKontrast, uSaett, uVignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv ); vec3 x = c.rgb;
      float l = dot( x, vec3( 0.2126, 0.7152, 0.0722 ) );
      x = mix( vec3( l ), x, uSaett );
      x = ( x - 0.42 ) * uKontrast + 0.42;
      x *= mix( vec3( 0.96, 0.99, 1.04 ), vec3( 1.0 ), smoothstep( 0.0, 0.6, l ) );
      x *= mix( 1.0 - uVignette, 1.0, smoothstep( 0.95, 0.3, length( vUv - 0.5 ) * 1.35 ) );
      gl_FragColor = vec4( clamp( x, 0.0, 1.0 ), c.a );
    }`,
});
composer.addPass(farbe);

const S = { schatten: true, ao: !MOBIL, bewegung: true, drehen: false, gitter: false, uhr: false };
// Wetter (kit/himmel.js): Ziel und weich geführter Zustand (Übergang rund 20 s), Nässe auf dem Asphalt, Dunst näher bei Nebel
let wetterZiel = WETTER.klar; const wetterJetzt = { ...WETTER.klar }; let wolken = null, sterne = null, regen = null;
function setWetter(name) { wetterZiel = WETTER[name] || WETTER.klar; $('wetter').textContent = wetterZiel.name; $('wetter').classList.toggle('an', wetterZiel !== WETTER.klar); }   // Verdeckung am Handy aus (verdoppelt die Geometrie)

let mats;
const sunDir = new THREE.Vector3(), _nebelFarbe = new THREE.Color();
let nacht = 0;

let BREITE = 52.51; const TAG_IM_JAHR = (() => { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); })();   // Berlin, heute (Sonnenbahn je Jahreszeit)
let stunde = 15;
function setTime(h) {
  stunde = h;
  if (aktiv?.erde && erdWelt) erdUtc = h - erdWelt.anker.lon / 15;   // Erde: Regler zeigt die Sonnenzeit am Anker, die Weltzeit läuft mit
  // echter Sonnenstand (kit/himmel.js): Ende Oktober in Berlin steht die Sonne mittags rund 24 Grad hoch, Aufgang gegen 7, Untergang gegen 17 Uhr Sonnenzeit
  const st = sonnenstand(h, TAG_IM_JAHR, BREITE), el = st.el;
  sunDir.copy(st.dir).normalize();
  SU.sunPosition.value.copy(sunDir);
  const hoch = THREE.MathUtils.clamp(Math.sin(el) / 0.6, 0, 1);
  const warm = new THREE.Color(1.0, 0.5, 0.26).lerp(new THREE.Color(1.0, 0.95, 0.88), hoch);
  sun.color.copy(warm);
  sun.intensity = 4.6 * THREE.MathUtils.smoothstep(Math.sin(el), -0.02, 0.12);
  nacht = 1 - THREE.MathUtils.smoothstep(Math.sin(el), -0.12, 0.08);
  hemi.intensity = 0.26 - 0.16 * nacht;
  hemi.color.setRGB(0.9 - 0.5 * nacht, 0.93 - 0.45 * nacht, 0.97 - 0.3 * nacht);
  renderer.toneMappingExposure = (0.66 + 0.45 * nacht) * (1 - 0.18 * (1 - wetterJetzt.licht));
  sun.intensity *= wetterJetzt.licht;
  hemi.intensity *= 1 + (1 - wetterJetzt.licht) * 0.5;   // bedeckt: mehr diffuses Licht, weniger Sonne
  scene.fog.color.setRGB(0.8 - 0.68 * nacht, 0.82 - 0.68 * nacht, 0.84 - 0.64 * nacht).multiplyScalar(1 - 0.1 * (1 - wetterJetzt.licht));
  scene.fog.color.lerp(_nebelFarbe.setRGB(0.74 - 0.62 * nacht, 0.76 - 0.62 * nacht, 0.78 - 0.6 * nacht), wetterJetzt.nebel * 0.8);   // Nebel ist hell
  SU.turbidity.value = Math.min(12, 8 + 3 * wetterJetzt.nebel + 4 * (1 - wetterJetzt.licht));   // über 12 wird der Himmel Shader dunkel und gelb
  sky.visible = wetterJetzt.nebel < 0.6; scene.background = sky.visible ? null : scene.fog.color;   // dichter Nebel: Himmel ist Nebelfarbe
  NACHT.value = nacht * (aktiv?.erde ? 0.6 : 1);   // Erde: aus der Luft sieht man tausende Fenster, darum gedämpft
  if (mats) {
    if (mats._extra) { mats._extra.leuchte.emissiveIntensity = 3.0 * nacht; }
  }
  bloom.enabled = !MOBIL && nacht > 0.5;        // Glanz erst, wenn die Sonne wirklich unten ist (Fenster, Laternen); Dämmerung bleibt klar
  bloom.strength = 0.5 * Math.max(0, nacht - 0.5) * 2 * (aktiv?.erde ? 0.45 : 1); bloom.threshold = aktiv?.erde ? 0.9 : 0.75;   // Erde: tausende Fenster der Kisten, sonst wird die Stadt ein heller Nebel
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60) % 60;
  $('uhr').textContent = `${String(hh % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  placeSun();
}

let envTimer = null;
function updateEnv() {
  clearTimeout(envTimer);
  envTimer = setTimeout(() => {
    const old = envRT;
    // Spiegelungssonde: die Stadt selbst spiegelt sich im Glas (wie Raytracing, aber einmal gerendert)
    // Erde: nur im Ort eine Sonde über seiner Mitte (der Himmel wird dafür um die Sonde gelegt), auf der Kugel nur der Himmel
    // Erde: nur der Himmel (die Aufnahme der ganzen Szene mit Ort und Kisten stockte bis 400 ms), sonst eine Sonde über der Ansicht
    const sonde = aktiv?.erde ? null : aktiv?.sonde ?? (aktiv ? aktiv.ziel.clone().setY(Math.max(6, aktiv.radius * 0.25)) : null);   // jede Ansicht spiegelt ihre eigene Umgebung
    const hell = SU.uHimmel.value; SU.uHimmel.value = 1;
    envRT = sonde ? pmrem.fromScene(scene, 0.012, 1, 9000, { size: MOBIL ? 128 : 256, position: sonde }) : pmrem.fromScene(skyScene, 0, 1, 20000);
    SU.uHimmel.value = hell;
    scene.environment = envRT.texture;
    scene.environmentIntensity = (aktiv?.id === 'szene' ? 0.55 : 0.38) - 0.3 * nacht;   // freie Ansichten sehen viel Himmel, darum weniger
    old?.dispose();
  }, 150);
}

// Schattenbereich passt sich der Ansicht an
let schattenRadius = 120;
const schattenZiel = new THREE.Vector3();
function placeSun() {
  sun.target.position.copy(schattenZiel);
  sun.position.copy(schattenZiel).addScaledVector(sunDir, schattenRadius * 2.2);
  const c = sun.shadow.camera;
  c.left = c.bottom = -schattenRadius; c.right = c.top = schattenRadius;
  c.near = 1; c.far = schattenRadius * 5; c.updateProjectionMatrix();
}

// Boden
function bodenPlatte(mat, groesse = 7000) {
  const g = new THREE.PlaneGeometry(groesse, groesse, 1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * groesse, (uv.getY(i) - 0.5) * groesse);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.position.y = -0.02;
  return m;
}

function etikett(titel, unter = '') {
  const d = document.createElement('div'); d.className = 'etikett';
  d.innerHTML = `<b>${titel}</b>${unter ? `<span>${unter}</span>` : ''}`;
  return new CSS2DObject(d);
}

function zaehle(obj) {
  let tris = 0, calls = 0;
  obj.traverse(o => { if (o.isMesh && o.visible) { calls++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return { tris, calls };
}

// Gebäude im Dashboard: Grundrisse in Metern
const RECHTECK = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];
const L_FORM = (w, d, nw, nd) => [[0, 0], [w, 0], [w, nd], [nw, nd], [nw, d], [0, d]];
const GEBAEUDE = [
  { id: 'raster', name: 'Büroturm weißes Raster', type: 'raster', pts: RECHTECK(30, 30), ecken: 4, height: 120, seed: 2 },
  { id: 'lochfassade', name: 'Weißer Turm mit Lochfenstern', type: 'lochfassade', pts: RECHTECK(26, 26), ecken: 3, height: 100, seed: 9 },
  { id: 'glasturm', name: 'Schwarzer Glasturm', type: 'glasturm', variant: 'kante', pts: RECHTECK(34, 22), height: 140, seed: 4 },
  { id: 'kupfer', name: 'Kupferturm', type: 'kupfer', pts: RECHTECK(26, 24), height: 90, seed: 6 },
  { id: 'band', name: 'Bürohaus mit Fensterbändern', type: 'band', variant: 'grau', pts: RECHTECK(36, 22), height: 28, seed: 12 },
  { id: 'altbau', name: 'Altbau mit Mansarddach', type: 'altbau', pts: L_FORM(26, 22, 12, 12), height: 21, seed: 3 },
  { id: 'ziegel', name: 'Ziegel Mietshaus', type: 'ziegel', pts: RECHTECK(20, 15), height: 19, seed: 8 },
  { id: 'wohnturm', name: 'Wohnturm mit Balkonen', type: 'wohnturm', pts: RECHTECK(22, 22), height: 64, seed: 5 },
];
const gebaeudeCache = new Map();
function haus(def) {
  if (!gebaeudeCache.has(def.id)) gebaeudeCache.set(def.id, buildBuilding(mats, def));
  return gebaeudeCache.get(def.id).clone();
}

// Ansichten
const ANSICHTEN = [
  { id: 'erde', name: 'Erde' },
  { id: 'szene', name: 'Zielbild Szene' },
  { id: 'gebaeude', name: 'Gebäude' },
  { id: 'baustile', name: 'Baustile der Welt' },
  { id: 'strassen', name: 'Straßen' },
  { id: 'texturen', name: 'Texturen' },
  { id: 'baeume', name: 'Bäume' },
  { id: 'menschen', name: 'Menschen' },
  { id: 'fahrzeuge', name: 'Fahrzeuge' },
  { id: 'potsdamer', name: 'Potsdamer Platz (Test)' },
  { id: 'kachel', name: 'Ort aus Kacheln' },
];
const gebaut = new Map();
let kachelZiel = null;   // #kachel@lat,lon: Ort aus Kacheln an beliebiger Stelle (Prüfung des Weltbaus)
let aktiv = null, menschenQuellen = [], bewegungen = new Map(), ALLE_MENSCHEN = [], ALLE_FAHRZEUGE = [], projektGezeigt = false;
// Verkehr: Fahrzeuge in drei Stufen (kit/vehicles.js Flotte), Handy nur vier Typen (Download Budget), fokus ist der Punkt, um den die Autos fahren
let flotteTypen = null, folge = null;
const fokus = new THREE.Vector3();
function ladeFlotte() {
  return flotteTypen ??= Promise.all(ALLE_FAHRZEUGE.filter(d => !MOBIL || ['kompakt', 'suv', 'taxi', 'bus'].includes(d.id)).map(ladeFahrzeugStufen)).then(l => l.filter(Boolean));
}
const ampelSignale = ampel => ({ farbe: g => { const [r, f] = ampel.phase(); return r === g ? f : 'rot'; } });   // Ampelsteuerung der Kreuzung als Signalgeber für die Autos
const VERKEHR_TEXT = 'Jedes Auto fährt mit dem Intelligent Driver Model: weich anfahren, Abstand nach Tempo, früh bremsen vor Kurven, Ampeln und Fußgängern. Regeln aus dem Regelwerk 1.3: eigene Spur, Tempo nach Straßenklasse, Gelb nur durchfahren, wenn Anhalten nicht mehr geht, Vorfahrt nach Schild, Straßenklasse und rechts vor links, Linksabbieger warten auf den Gegenverkehr, Kreuzung nur frei befahren und nur, wenn dahinter Platz ist, Fußgänger auf Überwegen haben Vorrang, Spurwechsel fürs Abbiegen, Busse halten an Haltestellen, Parkstreifen mit geparkten Autos.';

// Ortsszene (Potsdamer Platz, Orte aus Kacheln, später jede Stelle der Erde): Ort, Verkehr, Menschen, Kollision, Innenräume, Spielstart.
// A: Ansicht, g: Gruppe, daten: Ortsdaten (tools/ort_bauen.py oder kit/ortbau.js). Liefert ort, netz, Helfer augen() für Kamerapunkte.
// scheiben: in Schritten bauen, zwischen den Schritten ein Bild Pause (Erde: kein Stocken beim Ortswechsel), Zeiten in A.bauZeiten (ohne Pausen)
const bildPause = () => new Promise(r => document.visibilityState === 'visible' && innerWidth ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0));
async function ortSzene(A, g, daten, { seed = 11, autos = MOBIL ? 16 : 40, menschen = MOBIL ? 22 : 56, boden = true, scheiben = false } = {}) {
  if (scheiben) { autos = MOBIL ? 24 : 72; menschen = MOBIL ? 32 : 104; }   // Erde: belebter (29.10.2026 spät, Nader: "viel zu leer ... viel lebendiger")
  const bz = A.bauZeiten = {}; let bt = performance.now(); const bm = async n => { const j = performance.now(); bz[n] = Math.round(j - bt); if (window.__messen) (window.__bauLog ||= []).push([n, Math.round(bt), Math.round(j - bt)]); if (scheiben) await bildPause(); bt = performance.now(); };
  // Erde: Satellitenbild für den Boden des Ortes, lädt parallel zum Bau (kit/ortfoto.js)
  const fotoU = !boden && erdWelt ? ortFotoUniforms(erdWelt.erde.mat.uniforms.uHell, erdWelt.erde.mat.uniforms.uSonne) : null;
  if (fotoU) ortFotoLaden(fotoU, { lat: daten.meta.lat, lon: daten.meta.lon, halb: daten.meta.groesse / 2, renderer, mobil: MOBIL }).catch(e => console.warn('Ortsfoto', e));
  const ort = new Ort(daten, mats, { mobil: MOBIL, renderer, tief: boden ? null : 40, spaeter: scheiben, wasserMat: !boden && erdWelt ? erdWelt.wasserMaterial() : null, foto: fotoU });
  if (scheiben) await ort.bauen(bildPause);
  await bm('ort');
  if (boden) { g.add(bodenPlatte(mats.beton, 6000), ort.gruppe); g.children[g.children.length - 2].position.y = ort.unten - 0.02; } else g.add(ort.gruppe);
  // Verkehr: Spurgraph aus dem Straßennetz, je Ampelkreuzung ein eigener Umlauf, Signalköpfe an den Haltelinien, Überwege an denselben Gruppen
  ladetext('Fahrzeuge werden geladen');
  const typen = await ladeFlotte();
  await bm('flotteLaden');
  const netz = baueNetz(daten.verkehr, { ueberwege: daten.querungen, halte: (daten.moebel || []).filter(m => m[2] === 'halt'), parkenSeed: 5, links: !!daten.meta.links, hoehe: ort.H }); await bm('netz');
  const signale = new Signalanlagen(netz.anlagen, seed, new Ampelsteuerung([]));
  const koepfe = baueSignalkoepfe(netz, { mast: mats.technikDunkel }); signale.koepfe = koepfe; g.add(koepfe.gruppe);
  ueberwegePhasen(daten.wege, netz); await bm('signale');
  const fg = new Menge({ wege: daten.wege, ampel: signale, quellen: menschenQuellen, bewegungen, kamera: camera, mobil: MOBIL, seed,
    anzahl: scheiben ? Math.min(menschen, 14) : menschen, gruppen: MOBIL ? 4 : scheiben ? 14 : 8, gruppenOrte: daten.gruppen, blase: { radius: MOBIL ? 85 : 125 }, linear: !!daten.meta.wegeLinear });
  const menschenZiel = fg.alle.length + Math.max(0, menschen - 14);   // Erde: die übrigen kommen nach dem Tausch, zwei je Bild
  g.add(fg.gruppe); await bm('menge');
  const flotte = new Flotte(typen, { mobil: MOBIL, max: netz.parkplaetze.length + 80 });
  g.add(flotte.gruppe);
  const verkehr = new Verkehr({ netz, flotte, typen, signale, menge: fg, kamera: camera, fokus, anzahl: autos, seed: seed + 2, mobil: MOBIL, blase: { radius: MOBIL ? 260 : 430 } });
  await bm('verkehr');
  A.menge = fg; A.ort = ort; A.verkehr = verkehr; A.signale = signale;
  A.update = dt => { signale.update(dt); fg.update(dt); verkehr.update(dt); if (scheiben && fg.alle.length < menschenZiel) fg.nachfuellen(menschenZiel, 2); };
  // Spieler: Gebäude Grundrisse (nicht unter Dächern), Gehwegblöcke als Stufe, Gelände, Rand des Ausschnitts
  A.kollision = new Kollision({ polys: daten.gebaeude.filter(x => !x.rand && x.m < 2 && x.b !== 'roof' && x.b !== 'carport').map(x => x.p), gehwege: daten.bloecke, gehwegHoehe: 0.12, grenze: daten.meta.groesse / 2 - 3, gelaende: ort.H });
  A.startFussSuche = (x, z) => { let best = null, bd = Infinity; for (const k of daten.wege.knoten) { if (k[2] - ort.H(k[0], k[1]) < 0.05 || !A.kollision.frei(k[0], k[1])) continue; const d = Math.hypot(k[0] - x, k[1] - z); if (d < bd) { bd = d; best = k; } } return best ? { x: best[0], z: best[1], ry: Math.atan2(x - best[0], z - best[1]) + Math.PI } : { x: 0, z: 0, ry: 0 }; };
  // begehbare Gebäude (kit/interior.js): Innenräume entstehen, sobald die Figur ein Haus betritt oder vor der Haustür steht
  await bm('kollision');
  A.innenwelt = new Innenwelt({ mats, gruppe: g, kollision: A.kollision, haeuser: ort.haeuser, findeTuer: hid => ort.tueren.get(hid) || null }); await bm('innen');
  bz.ortTeile = ort.zeiten;
  A.bodenHoehe = (x, z) => ort.H(x, z);
  A.lod = () => ort.update(camera);
  A.schattenFolgen = true;
  A.radius = 420; A.ziel.set(0, 0, 0); A.sonde = new THREE.Vector3(0, 60 + ort.H(0, 0), 0);
  // Kamerapunkte auf Augenhöhe: falls der Punkt in einem Gebäude liegt, Richtung Ziel weiterrücken
  const luft = (x, z) => ort.frei(x, z) && [[4, 0], [-4, 0], [0, 4], [0, -4]].every(([dx, dz]) => ort.frei(x + dx, z + dz));
  const sicht = (x, z, zx, zz) => { const L = Math.hypot(zx - x, zz - z); for (let d = 2; d < Math.min(40, L); d += 2) if (!ort.frei(x + (zx - x) / L * d, z + (zz - z) / L * d)) return false; return true; };
  const augen = (x, z, zx, zy, zz) => {   // nächster freier Punkt mit 4 m Luft und 40 m freier Sicht zum Ziel, spiralförmig gesucht
    for (let r = 0; r <= 70; r += 2) for (let k = 0; k < (r ? 16 : 1); k++) {
      const w = k / 16 * Math.PI * 2, cx = x + Math.cos(w) * r, cz = z + Math.sin(w) * r;
      if (luft(cx, cz) && sicht(cx, cz, zx, zz)) return [[cx, 1.7 + ort.H(cx, cz), cz], [zx, zy + ort.H(zx, zz), zz]];
    }
    return [[x, 1.7 + ort.H(x, z), z], [zx, zy + ort.H(zx, zz), zz]];
  };
  return { ort, netz, verkehr, menge: fg, signale, augen, fotoU };
}

// ---------- Erde: die ganze Welt als Kugel, gebauter Ort um die Kamera (kit/erdwelt.js, 08_WELTBAU.md, seit 29.10.2026) ----------
// Eine Kamera vom All bis zur Straße (ErdKamera: Umlauf um einen Zielpunkt, Neigung nach Abstand). Unter 4,5 km (Handy 2,6 km) wird am
// ruhigen Zielpunkt ein Ort gebaut (Worker, dann in Scheiben im Hauptthread, unsichtbar bis fertig, dann in einem Bild getauscht).
// Anker: liegt das Ziel im Ort, ist seine Mitte der Ursprung (erdRegime 'ort', Spielmodi möglich), sonst wandert der Ursprung mit der Kamera.
let erdWelt = null, erdKam = null, erdOrt = null, erdAuftrag = null, erdRegime = 'kugel', erdUtc = null, orteListe = [], erdStatusT = 0, erdOrtFehler = 0, erdHoehe = 1e7;
let minikarte = null, navi = null, erdNachSprung = null, wolkenberge = null, leben = null;   // leben: Vögel und Flugzeuge (kit/leben.js)   // wolkenberge: Volumenwolken am Rechner (kit/wolkenberge.js)   // Minikarte, Navigation, Spiel nach dem Hinspringen fortsetzen (Wunsch Nr. 34)
let erdBauDauer = 4;   // gleitender Mittelwert der Bauzeit eines Ortes in Sekunden (im Auto wird so weit voraus bestellt)
const erdCache = [], erdStabil = { lat: 0, lon: 0, t: 0 }, erdLeer = [];   // erdLeer: Stellen ohne Straßen und Häuser (Gebirge, Wald, Meer), dort kein Ort
const ERD_HALB = MOBIL ? 450 : 600, ERD_BAUHOEHE = MOBIL ? 2600 : 4500, D2R = Math.PI / 180, _ev = new THREE.Vector3(), _ortKam = { position: new THREE.Vector3() };
const ERD_ZIELE = [
  { id: 'all', name: 'Weltall', lat: 38, lon: 12, dist: MOBIL ? 27000000 : 16000000, neigung: 0, kurs: 0, unter: 'die ganze Erde als Kugel, Tag und Nacht nach der Uhrzeit' },   // Handy hochkant: weiter weg, damit die Kugel ganz ins Bild passt
  { id: 'berlin', name: 'Berlin', lat: 52.50944, lon: 13.37611, dist: 650, neigung: 68, kurs: 235, boden: true, unter: 'Potsdamer Platz' },
  { id: 'london', name: 'London', lat: 51.5007, lon: -0.1246, dist: 650, neigung: 68, kurs: 300, boden: true, unter: 'Westminster, Linksverkehr' },
  { id: 'marrakesch', name: 'Marrakesch', lat: 31.6258, lon: -7.9891, dist: 560, neigung: 68, kurs: 30, boden: true, unter: 'Jemaa el Fna, Medina' },
  { id: 'tokio', name: 'Tokio', lat: 35.6595, lon: 139.7005, dist: 650, neigung: 68, kurs: 120, boden: true, unter: 'Shibuya, Linksverkehr' },
  { id: 'newyork', name: 'New York', lat: 40.7580, lon: -73.9855, dist: 760, neigung: 68, kurs: 210, boden: true, unter: 'Times Square' },
  { id: 'rio', name: 'Rio de Janeiro', lat: -22.9711, lon: -43.1823, dist: 650, neigung: 68, kurs: 40, boden: true, unter: 'Copacabana' },
];
const ERD_TEXT = 'Die ganze Erde als Kugel: Gelände aus den AWS Terrain Tiles mit Licht und Schatten je Pixel, überall das wolkenfreie Satellitenbild Sentinel 2 (EOX, 10 m je Pixel), nachts die echten Lichter der Städte (NASA Black Marble), Meer mit Wellen und Glitzerpfad, nah Straßen aus den OpenFreeMap Vektorkacheln und Gebäudekisten im Umkreis von 2 km. Beim Anflug wird an jeder Stelle der Erde ein Ort gebaut wie der Potsdamer Platz: Häuser nach der Bauweise des Landes, begehbar, Straßen mit Gehwegen, Ampeln, Überwegen, Verkehr mit Rechts oder Linksverkehr, Menschen und Gelände. Ziehen greift die Kugel, Rechts ziehen oder Shift dreht und neigt, Mausrad zoomt auf den Zeiger, W A S D fährt, Q und E zoomen. Im Ort gehen Zu Fuß und Fahren.';
let erdEnvStunde = -99;
function erdStundeSetzen() {
  if (erdUtc === null || !erdWelt) return;
  const h = ((erdUtc + erdWelt.anker.lon / 15) % 24 + 24) % 24, tz = $('tageszeit'); tz.value = Math.max(5, Math.min(23, h)); stunde = h; setTimeOhneUtc(h);
  if (Math.abs(h - erdEnvStunde) > 0.25) { erdEnvStunde = h; updateEnv(); }   // Umgebungslicht nur bei spürbar anderer Sonnenzeit neu
}
function setTimeOhneUtc(h) { const u = erdUtc; setTime(h); erdUtc = u; }
const erdWeg = (o, lat, lon) => o ? Math.hypot((lat - o.lat) * 111000, (lon - o.lon) * 111000 * Math.cos(lat * D2R)) : Infinity;
function erdZiel(z) {
  if (!erdWelt) return;
  if (spiel.modus === 'jet') { jetUmsetzen(z.lat, z.lon); return; }   // im Jet: über das Ziel versetzen, weiterfliegen
  if (spiel.modus !== 'frei') spielBeenden();
  erdKam.fliegeZu({ lat: z.lat, lon: z.lon, dist: z.dist, kurs: z.kurs, neigung: z.neigung });
  if (z.boden) erdWelt.vorladen(z.lat, z.lon);   // Kacheln, Karten und Kisten am Ziel laden schon während des Flugs
  if (z.boden && erdWeg(erdOrt, z.lat, z.lon) > ERD_HALB * 0.5 && !erdAuftrag) erdOrtLaden(z.lat, z.lon);   // der Worker baut, während die Kamera fliegt
}
function erdBoden(x, z) {   // Bodenhöhe im lokalen Rahmen: im Ort sein Gelände, sonst die Kugel
  if (erdOrt && erdRegime === 'ort' && Math.abs(x) < erdOrt.halb && Math.abs(z) < erdOrt.halb) return erdOrt.szene.ort.H(x, z);
  const g = erdWelt.lokalZuGeo(_ev.set(x, 0, z)); return erdWelt.bodenGeo(g.lat, g.lon) - erdWelt.anker.h;
}
function erdBodenGeo(lat, lon) {   // Bodenhöhe absolut: im Ort aus seinem Gelände (gleicher Rahmen wie kit/ortbau.js), sonst die Kugel
  const o = erdOrt;
  if (o) { const x = (lon - o.lon) * o.kLon, z = -(lat - o.lat) * o.kLat; if (Math.abs(x) < o.halb - 2 && Math.abs(z) < o.halb - 2) return o.h0 + o.szene.ort.H(x, z); }
  return erdWelt.bodenGeo(lat, lon);
}
function erdAnkerAufOrt(o) {
  const W = erdWelt, frei = spiel.modus === 'frei', cw = frei ? null : W.lokalZuWelt(camera.position, new THREE.Vector3()), tw = frei ? null : W.lokalZuWelt(controls.target, new THREE.Vector3());
  W.setzeAnker(o.lat, o.lon, o.h0);
  o.gruppe.position.set(0, 0, 0); o.gruppe.quaternion.identity(); o.gruppe.updateMatrixWorld(true); o.mitteLokal.set(0, 0, 0);
  if (frei) erdKam.anwenden(camera); else { W.weltZuLokal(cw, camera.position); W.weltZuLokal(tw, controls.target); }
  BREITE = o.lat; erdStundeSetzen();
}
async function erdOrtLaden(lat, lon) {
  erdAuftrag = { lat, lon, seit: performance.now() };
  try {
    const treffer = erdCache.find(c => erdWeg(c, lat, lon) < c.halb * 0.35);   // schon gebaut: sofort aus dem Speicher
    const daten = treffer ? structuredClone(treffer.daten) : await ortBestellen(lat, lon, { halb: ERD_HALB });
    // ohne Straßen und fast ohne Häuser kein Ort (sonst lag im Hochgebirge oder auf dem Meer eine leere Platte mit Wänden): dort bleibt die Kugel
    if (!daten.strasse.length && daten.gebaeude.length < 5) { erdLeer.push({ lat, lon, halb: ERD_HALB }); if (erdLeer.length > 24) erdLeer.shift(); return; }
    if (!treffer) { erdCache.unshift({ lat: daten.meta.lat, lon: daten.meta.lon, halb: daten.meta.groesse / 2, daten: structuredClone(daten) }); if (erdCache.length > 4) erdCache.pop(); }
    const A = gebaut.get('erde'); if (A) await erdOrtWechsel(A, daten);
    if (!treffer) erdBauDauer = THREE.MathUtils.clamp(0.6 * erdBauDauer + 0.4 * (performance.now() - erdAuftrag.seit) / 1000, 1.5, 15);
  } catch (e) { console.warn('Ort nicht gebaut', e); erdOrtFehler = performance.now(); }
  finally { erdAuftrag = null; }
}
function erdOrtEntsorgen(alt) { ortFotoFrei(alt.szene.fotoU); alt.szene.ort.entsorgen(); alt.gruppe.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); alt.gruppe.removeFromParent(); }
function erdOrtWeg(A = gebaut.get('erde')) {
  const alt = erdOrt; if (!alt) return;
  if (spiel.modus === 'fuss' || spiel.modus === 'fahren') spielBeenden();
  A.update = null; A.lod = null; A.kollision = null; A.innenwelt = null; A.verkehr = null; A.menge = null; A.schattenFolgen = false;
  erdOrtEntsorgen(alt); erdOrt = null; erdRegime = 'kugel';
  if (aktiv === A) document.getElementById('spielen').style.display = 'none';
}
// neuer Ort: in einem eigenen Ansichtsobjekt in Scheiben bauen (unsichtbar), Shader vorab übersetzen, dann in einem Bild tauschen
async function erdOrtWechsel(A, daten) {
  await hintergrund;   // Texturen, Menschen und Autos laden im Hintergrund, solange die Kugel schon zu sehen ist
  const og = new THREE.Group(); og.name = 'ort'; og.visible = false; A.gruppe.add(og);
  const A2 = { id: 'erde', gruppe: og, eintraege: [], radius: 420, ziel: new THREE.Vector3() };
  const tBau = performance.now();
  let szene;
  try { szene = await ortSzene(A2, og, daten, { boden: false, scheiben: true }); }
  catch (e) { og.removeFromParent(); throw e; }
  const m = daten.meta, phi = m.lat * D2R;
  const neu = { daten, lat: m.lat, lon: m.lon, h0: m.h0 || 0, halb: m.groesse / 2, gruppe: og, szene, anker: { lat: m.lat, lon: m.lon, h: m.h0 || 0 }, mitteLokal: new THREE.Vector3(),
    kLat: 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), kLon: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) };
  erdWelt.rahmenVon(neu.anker, og); neu.mitteLokal.copy(og.position);
  const tK = performance.now();   // Zeiten in A2.bauZeiten (tools/erde_mess.mjs)
  const log = (n, a) => { if (window.__messen) (window.__bauLog ||= []).push([n, Math.round(a), Math.round(performance.now() - a)]); };
  // wie beim echten Bild in das Ziel der Nachbearbeitung übersetzen: sonst haben die Shader Tone Mapping und Farbraum des Bildschirms
  // und werden beim ersten Bild doch noch einmal übersetzt (6 Shader, 430 ms Stocken)
  const altesZiel = renderer.getRenderTarget(); renderer.setRenderTarget(composer.renderTarget1);
  og.visible = true; const kompiliert = renderer.compileAsync ? renderer.compileAsync(og, camera, scene).catch(() => {}) : null; og.visible = false;
  renderer.setRenderTarget(altesZiel);
  const tK1 = performance.now();
  if (kompiliert) await kompiliert;   // Shader parallel übersetzen, sonst stockt das erste Bild mit dem Ort
  await vorgewaermt;
  log('kompilieren', tK);
  A2.bauZeiten.texturenOrt = await texturenHoch(og);   // was der Ort selbst an Texturen mitbringt (eigene Materialien), je Bild eine
  (A2.bauZeiten ||= {}).kompilieren = Math.round(tK1 - tK); A2.bauZeiten.kompilierenWarten = Math.round(performance.now() - tK1);
  daten.meta.zeit.haupt = Math.round(performance.now() - tBau);   // Aufbau im Hauptthread (in Scheiben, mit Warten)
  // Tausch in einem Bild, alten Ort freigeben. Spieler (Auto oder Figur) fährt nahtlos weiter (seit 29.10.2026, Wunsch Nr. 34): seine Lage
  // geht über die Welt (ECEF) in den neuen Rahmen, Tempo und Kamera bleiben, Kollision, Verkehr und Menschen kommen vom neuen Ort.
  // Vorher startete das Spiel neu (Sprung auf die nächste Fahrspur beim Blickpunkt, Naders Kritik "portet mich").
  const spieler = erdRegime === 'ort' && (spiel.modus === 'fuss' || spiel.modus === 'fahren') ? (spiel.auto || spiel.figur) : null;
  let halten = null, mit = null;
  if (spieler) {
    const zw = v => erdWelt.lokalZuWelt(v, new THREE.Vector3());
    mit = { p: zw(spieler.pos), a: zw(spieler.alt.pos), vorn: zw(_ev.copy(spieler.pos).addScaledVector(spieler.dir, 10)), rp: zw(spiel.rig.pos), rz: zw(spiel.rig.ziel), y0: spieler.pos.y };
  } else if (spiel.modus === 'fuss' || spiel.modus === 'fahren') { halten = { modus: spiel.modus, def: spiel.wahl }; spielBeenden(); }
  const alt = erdOrt; erdOrt = neu;
  for (const k of ['menge', 'ort', 'verkehr', 'signale', 'update', 'kollision', 'startFussSuche', 'innenwelt', 'schattenFolgen', 'sonde', 'bauZeiten']) A[k] = A2[k];
  A.kollision.offen = (x, z) => erdBoden(x, z);   // hinter dem Rand des Ortes weiter auf der Kugel (bis der nächste Ort steht)
  const ort = szene.ort;
  A.lod = () => { if (erdRegime === 'ort') ort.update(camera); else { _ortKam.position.copy(camera.position); og.worldToLocal(_ortKam.position); ort.update(_ortKam); } };
  A.bodenHoehe = (x, z) => erdBoden(x, z);
  og.visible = true;
  if (alt) erdOrtEntsorgen(alt);
  const tT = performance.now();
  if (erdRegime === 'ort') erdAnkerAufOrt(neu);
  if (mit) spielerUmsetzen(spieler, mit, A);
  log('tausch', tT);
  if (halten && erdRegime === 'ort') spielStarten(halten.modus, halten.def).catch(e => console.warn(e));
}
// Spieler in den Rahmen des neuen Ortes umrechnen (Anker steht schon auf ihm): Lage, letzter Physikschritt (Interpolation), Richtung, Kamera
function spielerUmsetzen(s, mit, A) {
  const W = erdWelt, r = spiel.rig;
  W.weltZuLokal(mit.p, s.pos); W.weltZuLokal(mit.a, s.alt.pos); W.weltZuLokal(mit.rp, r.pos); W.weltZuLokal(mit.rz, r.ziel);
  const vorn = W.weltZuLokal(mit.vorn, new THREE.Vector3()).sub(s.pos);
  let dpsi = Math.atan2(vorn.x, vorn.z) - Math.atan2(s.dir.x, s.dir.z); dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));   // die Rahmen sind um wenige Hundertstel Grad gedreht
  r.yaw += dpsi; r.kollision = A.kollision; s.kollision = A.kollision;
  if (s === spiel.auto) {
    s.psi += dpsi; s.alt.psi += dpsi; s.dir.set(Math.sin(s.psi), 0, Math.cos(s.psi)); s.verkehr = A.verkehr; s.menge = A.menge;
    if (A.verkehr) { A.verkehr.spieler = s; for (const o of A.verkehr.alle.slice()) if (Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < 14) { A.verkehr.entferne(o); A.verkehr.neu(); } }   // kein KI Auto im eigenen Blech
    s.zeigen(s.akku * 120);
  } else {
    s.ry += dpsi; s.alt.ry += dpsi; s.dir.set(Math.sin(s.ry), 0, Math.cos(s.ry)); s.menge = A.menge; if (s.boden !== undefined) s.boden += s.pos.y - mit.y0;
    if (A.verkehr) A.verkehr.spieler = s;
    s.zeigen(s.akku * 60);
  }
}
// ---------- Minikarte und Navigation (kit/minikarte.js, kit/navi.js, Wunsch Nr. 34, 29.10.2026) ----------
function spielerGeo() {   // Lage des Spielers auf der Erde: Jet, Auto oder Figur
  if (spiel.modus === 'jet' && spiel.jet) return { lat: spiel.jet.flug.geo.lat, lon: spiel.jet.flug.geo.lon };
  const s = spiel.auto || spiel.figur; return s && erdWelt ? erdWelt.lokalZuGeo(s.pos) : null;
}
function naviSetzen(o) {   // Ziel aus der Suche, Herkunft ist der nächste Ort zum Spieler
  const p = spielerGeo(), nah = p && orteListe.length ? ortNahe(orteListe, p.lat, p.lon) : null;
  navi.setzen({ name: o.name, lat: o.lat, lon: o.lon }, nah ? { name: nah.name } : null, spiel.modus);
}
function naviSpringen(z) {   // Knopf Hinspringen: im Jet über das Ziel, sonst Kamera hin und dort im selben Modus weiter, sobald der Ort steht
  navi.loeschen();
  if (spiel.modus === 'jet') { jetUmsetzen(z.lat, z.lon); return; }
  erdNachSprung = spiel.modus === 'fahren' || spiel.modus === 'fuss' ? { modus: spiel.modus, def: spiel.wahl } : null;
  erdZiel({ lat: z.lat, lon: z.lon, dist: 700, neigung: 66, kurs: 0, boden: true });
}
const _mkDir = new THREE.Vector3();
function minikarteUndNavi(dt, blick) {
  const J = spiel.modus === 'jet' ? spiel.jet : null, s = spiel.auto || spiel.figur;
  const zeigen = !!(J || ((spiel.modus === 'fahren' || spiel.modus === 'fuss') && s));
  minikarte.zeigen(zeigen); document.body.classList.toggle('mitziel', !!navi.ziel);
  const feld = $('erdfeld'), ph = zeigen ? (MOBIL ? 'Ziel eingeben (Navigation)' : 'Ziel eingeben (Navigation, Taste N)') : 'Ort auf der Erde suchen (171.654 Orte)';
  if (feld && feld.placeholder !== ph) feld.placeholder = ph;
  if (!zeigen) return;
  camera.getWorldDirection(_mkDir);   // die Karte dreht mit der Kamera (wie GTA), der Pfeil zeigt die Richtung des Spielers dazu
  const kurs = (Math.atan2(_mkDir.x, -_mkDir.z) / D2R + 360) % 360;
  let richtung, kmh, zoom;
  if (J) { richtung = J.flug.kurs; kmh = J.flug.kmh; const hG = Math.max(30, J.flug.geo.h - erdBodenGeo(blick.lat, blick.lon)); zoom = THREE.MathUtils.clamp(16.3 - Math.log2(hG / 100) - 0.4 * Math.log2(1 + kmh / 500), 2.5, 15.5); }
  else { const d = s.bildDir || s.dir; richtung = (Math.atan2(d.x, -d.z) / D2R + 360) % 360; kmh = spiel.auto ? spiel.auto.kmh : s.v * 3.6; zoom = spiel.auto ? 15.4 - 0.9 * Math.log2(1 + kmh / 50) : 16.2; }   // rund 280 m Umkreis im Stand, bei 100 km/h rund 560 m
  minikarte.update({ lat: blick.lat, lon: blick.lon, kurs, pfeil: richtung - kurs, zoom, dt, ziel: navi.ziel, route: navi.route, jet: !!J });
  navi.update(blick, kurs, spiel.modus, kmh, dt);
}
function erdKamera(dt) {   // freie Kamera der Erde: Flug, Tasten, Nachlauf, Zoom, dann Lage setzen
  eingabe.achse(_ach);
  erdKam.tick(dt, { x: _ach.x, y: _ach.y, schnell: eingabe.an('schnell'), hoch: (eingabe.an('runter') ? 1 : 0) - (eingabe.an('hoch') ? 1 : 0) });
  erdKam.anwenden(camera);
}
function erdTick(dt) {
  const W = erdWelt, A = aktiv; if (!W) return;
  const frei = spiel.modus === 'frei';
  if (!frei) erdKam.flug = null;
  // Ziel: in der freien Kamera ihr Zielpunkt, im Spiel die Figur oder das Auto
  const J = spiel.modus === 'jet' ? spiel.jet : null;
  const s = spiel.figur || spiel.auto, blick = J ? { lat: J.flug.geo.lat, lon: J.flug.geo.lon } : !frei && s ? W.lokalZuGeo(s.pos) : { lat: erdKam.lat, lon: erdKam.lon };
  let hA;
  if (frei) hA = erdKam.hoehe;
  else if (J) { const g = W.lokalZuGeo(camera.position); hA = g.h - erdBodenGeo(g.lat, g.lon); }
  else hA = camera.position.y - erdBoden(camera.position.x, camera.position.z);
  erdHoehe = hA;
  const wegVomOrt = erdWeg(erdOrt, blick.lat, blick.lon);
  // Anker: im Ort seine Mitte, sonst wandert er mit der Kamera (alle 20 km); im Jet immer mit der Kamera
  const imOrt = !J && erdOrt && wegVomOrt < erdOrt.halb * 0.85 && hA < 3000;
  if (imOrt && erdRegime !== 'ort') { erdRegime = 'ort'; erdAnkerAufOrt(erdOrt); }
  else if (!imOrt && erdRegime === 'ort' && (frei || J)) erdRegime = 'kugel';
  if (erdRegime === 'kugel' && camera.position.length() > (J ? 12000 : 20000)) {
    const g = W.lokalZuGeo(camera.position); W.setzeAnker(g.lat, g.lon, W.bodenGeo(g.lat, g.lon));
    if (J) jetSzene(); else erdKam.anwenden(camera);
    BREITE = g.lat; erdStundeSetzen();
  }
  if (erdOrt && erdRegime !== 'ort') { W.rahmenVon(erdOrt.anker, erdOrt.gruppe); erdOrt.mitteLokal.copy(erdOrt.gruppe.position); if (!erdKam.flug && (hA > 80000 || wegVomOrt > 40000)) erdOrtWeg(A); }
  if (A) A.ruht = erdRegime !== 'ort' && hA > 3000;   // Verkehr und Menschen pausieren hoch über dem Ort
  if (aktiv === A) { const zeigen = erdRegime === 'ort' ? '' : 'none'; const sp = document.getElementById('spielen'); if (sp.style.display !== zeigen) sp.style.display = zeigen; }
  // Ort bestellen, sobald das Ziel ruhig ist und die Kamera tief genug (im Spiel ohne Warten)
  const bewegt = erdWeg(erdStabil, blick.lat, blick.lon) / Math.max(dt, 1e-3);
  erdStabil.t = bewegt < Math.max(40, erdKam.dist * 0.2) ? erdStabil.t + dt : 0; erdStabil.lat = blick.lat; erdStabil.lon = blick.lon;
  const jetBaut = !J || (J.flug.geo.h - erdBodenGeo(blick.lat, blick.lon) < 1700 && J.flug.kmh < 450);   // im Jet nur tief und langsam (sonst ist er vorbei, bevor der Ort steht)
  const leer = erdLeer.some(l => erdWeg(l, blick.lat, blick.lon) < l.halb * 0.6);
  // im Auto früher und voraus bestellen: Mitte dort, wo es nach rund einer Bauzeit ist (höchstens 0,55 der halben Kante), sobald es 0,3 der halben
  // Kante von der Mitte weg ist und sich weiter entfernt. So steht der neue Ort, bevor der alte endet (Wunsch Nr. 34)
  let bestell = blick, ortWeit = wegVomOrt > ERD_HALB * 0.62;
  if (spiel.modus === 'fahren' && spiel.auto && erdOrt && erdRegime === 'ort') {
    const Wa = spiel.auto, v = Math.abs(Wa.vLong), rx = Wa.pos.x - erdOrt.mitteLokal.x, rz = Wa.pos.z - erdOrt.mitteLokal.z;
    if (wegVomOrt > ERD_HALB * 0.3 && v > 2 && (rx * Wa.dir.x + rz * Wa.dir.z) * Math.sign(Wa.vLong) > 0) {
      ortWeit = true; _ev.copy(Wa.pos).addScaledVector(Wa.dir, Math.sign(Wa.vLong) * Math.min(ERD_HALB * 0.55, v * (erdBauDauer + 0.5))); bestell = W.lokalZuGeo(_ev);
    }
  }
  if (!erdKam.flug && jetBaut && !leer && hA < ERD_BAUHOEHE && !erdAuftrag && (erdStabil.t > 0.35 || !frei) && performance.now() - erdOrtFehler > 6000 && ortWeit) erdOrtLaden(bestell.lat, bestell.lon);
  // weicher Boden: solange hier noch kein Ort steht, hält die Kamera rund 900 m Abstand (danach zoomt sie von selbst weiter); in leerem Gelände nicht
  erdKam.bodenAbstand = frei && !leer && (!erdOrt || wegVomOrt > ERD_HALB * 0.8) && performance.now() - erdOrtFehler > 6000 ? 900 : 0;
  controls.target.copy(frei ? W.geoZuLokal(erdKam.lat, erdKam.lon, erdKam.boden, _ev) : J ? J.modell.position : controls.target);   // Blickpunkt für Schatten, Verkehr und Dunst
  // Himmel, Dunst, Nah und Fern nach der Höhe (Skill threejs-large-worlds): weich, ohne Sprung
  const abst = frei ? Math.min(erdKam.dist, camera.position.distanceTo(controls.target)) : camera.position.distanceTo(controls.target);
  const himmel = 1 - THREE.MathUtils.smoothstep(hA, 9000, 70000);   // Himmel blendet zwischen 9 und 70 km ins Schwarz des Alls
  SU.uHimmel.value = himmel;
  if (SU.cloudCoverage) SU.cloudCoverage.value = wolkenberge?.enabled ? 0 : (0.22 + 0.4 * wetterJetzt.wolken) * (1 - THREE.MathUtils.smoothstep(hA, 1200, 3500));   // mit Wolkenbergen keine gemalten Wolken in der Kuppel   // die Wolken der Himmelskuppel (three.js r186) hängen nur unten über einem
  sky.visible = wetterJetzt.nebel < 0.6 && himmel > 0.003; scene.background = sky.visible || hA > 9000 ? null : scene.fog.color;
  sky.position.copy(camera.position);
  if (J) { scene.fog.near = Math.max(2500, hA * 3); scene.fog.far = scene.fog.near + 22000 + hA * 25; }   // im Jet weite Sicht (der Dunst der Kugel macht die Ferne)
  else { scene.fog.near = Math.max(420, abst * 0.95, hA * 3); scene.fog.far = scene.fog.near + 1250 + hA * 25; }
  const horizont = Math.sqrt(Math.max(1, hA) * (2 * 6371000 + Math.max(1, hA)));
  camera.near = J ? THREE.MathUtils.clamp(abst * 0.12, 0.25, 3) : THREE.MathUtils.clamp(Math.max(abst * 0.004, hA * 0.0015), 0.1, 5000);
  camera.far = Math.max(6000, Math.min(horizont * 1.3 + 40000, scene.fog.far * 1.6 + 2000));
  camera.updateProjectionMatrix();
  gtao.enabled = false;   // Erde: keine Verdeckung (das erste Einschalten übersetzte 6 Shader und stockte 430 ms, dazu doppelte Szene je Bild)
  bloom.enabled = !MOBIL && nacht > 0.5 && hA <= 60;   // von oben tausende Fenster: Glanz nur auf Augenhöhe
  sterne.mesh.scale.setScalar(Math.max(1, camera.far * 0.9 / 5000));
  W.erde.mat.uniforms.uHell.value = 0.95 / renderer.toneMappingExposure;   // Kugel unabhängig von der Belichtung des Dashboards (Nachbearbeitung mit ACES)
  // Wolkenberge am Rechner: unter 40 km, solange der Himmel zu sehen ist; die Decke wird dann zu dünnen Federwolken in 9 km
  if (!MOBIL && !wolkenberge) { wolkenberge = new Wolkenberge({ renderer, uWolken: W.erde.mat.uniforms.uWolken }); wolkenberge.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); composer.insertPass(wolkenberge, 1); }
  const bergeAn = !!wolkenberge && hA < 40000 && sky.visible;
  W.deckeDuenn = bergeAn;
  W.update(camera, { sonne: sunDir, nebel: [scene.fog.near * (1 - 0.78 * wetterJetzt.nebel), scene.fog.far], nebelFarbe: scene.fog.color, ort: erdOrt, hoeheUeberGrund: hA, bodenGeo: blick, dt, wolkenWetter: wetterJetzt.wolken });
  if (!leben) leben = new Leben(scene);
  leben.update(dt, camera, W, { boden: erdBoden, tag: THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.15), hoeheUeberGrund: hA, hell: W.erde.mat.uniforms.uHell.value * 0.69, an: wetterJetzt.regen < 0.5 });
  if (wolkenberge) wolkenberge.update(W, camera, { kamHoehe: W.lokalZuGeo(camera.position).h, sonne: sunDir, dunst: W.erde.mat.uniforms.uDunst.value, hell: W.erde.mat.uniforms.uHell.value, dt, an: bergeAn, menge: 0.85 + 0.3 * wetterJetzt.wolken });
  minikarteUndNavi(dt, blick);
  if (erdNachSprung && erdRegime === 'ort' && spiel.modus === 'frei' && !erdKam.flug && A?.kollision && !erdAuftrag) { const n = erdNachSprung; erdNachSprung = null; spielStarten(n.modus, n.def).catch(e => console.warn(e)); }
  // Anzeige
  erdStatusT += dt;
  if (erdStatusT > 0.4) {
    erdStatusT = 0;
    const g = frei ? erdKam.kamGeo : W.lokalZuGeo(camera.position), nah = orteListe.length ? ortNahe(orteListe, blick.lat, blick.lon) : null, i = W.info();
    const hoehe = hA >= 10000 ? `${fmt(hA / 1000)} km` : `${fmt(hA)} m`, m = erdOrt?.daten.meta;
    $('erdstatus').innerHTML = `<b>${nah ? nah.name : 'Erde'}</b>${m && wegVomOrt < 2000 ? ` · ${m.land || ''}` : ''} · ${blick.lat.toFixed(4)}°, ${blick.lon.toFixed(4)}° · ${hoehe} über Grund<br>` +
      `${erdAuftrag ? 'Ort wird gebaut …' : erdOrt && wegVomOrt < 3000 ? `Ort: ${fmt(erdOrt.szene.ort.info().gebaeude)} Häuser, Bauweise ${m.region}${m.links ? ', Linksverkehr' : ''}` : hA < ERD_BAUHOEHE ? 'Ort folgt' : 'tiefer zoomen, dann wird gebaut'} · Kugel ${i.kacheln} Kacheln${i.haeuser ? ` · ${fmt(i.haeuser)} Kisten` : ''}`;
  }
}

async function baueAnsicht(id) {
  if (gebaut.has(id)) return gebaut.get(id);
  if (id !== 'erde') { if (hintergrund) { ladetext('Baukasten wird geladen'); await hintergrund; } }   // alle anderen Ansichten brauchen Texturen, Menschen, Autos
  const g = new THREE.Group(); const A = { id, gruppe: g, eintraege: [], update: null, radius: 120, ziel: new THREE.Vector3() };
  if (id === 'erde') {
    ladetext('Erde wird geladen');
    const lader = new THREE.TextureLoader();
    const [tag, nacht] = await Promise.all([lader.loadAsync('../assets/erde/tag.jpg'), lader.loadAsync('../assets/erde/nacht.jpg')]);
    erdWelt = new ErdWelt({ renderer, gruppe: g, tag, nacht, mobil: MOBIL });
    erdKam = new ErdKamera(erdWelt); erdKam.bodenAn = erdBodenGeo;
    A.erde = erdWelt; A.radius = 420;
    if (erdUtc === null) { const d = new Date(); erdUtc = d.getUTCHours() + d.getUTCMinutes() / 60; }
    ladeOrteListe().then(l => { orteListe = l; }).catch(e => console.warn('Orte fehlen', e));
    A.eintraege = ERD_ZIELE.map(z => ({ id: z.id, name: z.name, erde: z, titel: z.name, unter: z.unter, text: ERD_TEXT }));
  }
  if (id === 'szene' || id === 'strassen') {
    const strasse = buildIntersection(mats, id === 'szene' ? { L: 120 } : {});
    mats._extra = strasse.userData.extra;
    g.add(strasse, bodenStadt(mats));
    const U = strasse.userData;
    const ampel = new Ampelsteuerung(U.ampeln);
    const R = rng(id === 'szene' ? 42 : 7);
    // Straßenbäume in den Baumscheiben
    const baeume = [];
    U.baumScheiben.forEach(([x, z], i) => {
      if (MOBIL && i % 2) return;                                   // Handy: jeder zweite Baum, ohne eigenen Schatten
      const def = BAEUME[i % 3 === 2 ? 2 : 0];
      const t = makeTree({ ...def, hoehe: def.hoehe * (0.85 + R() * 0.3) }, def.seed + (i % 4), true);
      t.position.set(x, 0.15, z); t.rotation.y = R() * Math.PI * 2; baeume.push(t);
      if (MOBIL) t.traverse(o => { o.castShadow = false; });
    });
    if (id === 'szene') {
      const stadt = buildCity(mats, strasse, { makeTree, BAEUME, mobil: MOBIL });
      const fern = buildFernstadt({ innen: U.S.L, mobil: MOBIL, radius: MOBIL ? 1050 : 1500 });   // Handy: kleinere Fernstadt, der Dunst verdeckt den Rand
      // Hausboxen für die Spieler Kollision (vor dem Verschmelzen), Grundriss in der Ebene
      const box = new THREE.Box3(); A.hausRechtecke = stadt.haeuser.map(h => { h.updateMatrixWorld(true); box.setFromObject(h); return [box.min.x, box.min.z, box.max.x, box.max.z]; });
      g.add(vereine(stadt.haeuser), stadt.boden, fern);   // alle Häuser je Material ein Mesh, wie später je Kachel im Spiel
      baeume.push(...stadt.extra.children);
      A.sonde = new THREE.Vector3(12, 48, 14);
      A.fernAnzahl = fern.userData.anzahl;
    }
    g.add(instanzBaeume(baeume));                                  // je Baumart zwei Zeichenaufrufe
    // Menschen mit Ziel, Route und Tätigkeiten (kit/crowd.js)
    const fg = new Menge({ wege: U.wege, ampel, quellen: menschenQuellen, bewegungen, kamera: camera, mobil: MOBIL,
      anzahl: MOBIL ? 9 : 18, gruppen: MOBIL ? 1 : 2, seed: id === 'szene' ? 5 : 9 });
    g.add(fg.gruppe);
    A.menge = fg;
    // Verkehr nach Regelwerk 1.3 (kit/traffic.js): Spurgraph aus dem Straßennetz der Kreuzung, die Ampel der Kreuzung schaltet auch die Autos
    ladetext('Fahrzeuge werden geladen');
    const typen = await ladeFlotte();
    const netz = baueNetz(U.verkehr, { parkenSeed: id === 'szene' ? 3 : 8 });
    const flotte = new Flotte(typen, { mobil: MOBIL, max: netz.parkplaetze.length + 40 });
    g.add(flotte.gruppe);
    const verkehr = new Verkehr({ netz, flotte, typen, signale: ampelSignale(ampel), menge: fg, kamera: camera, fokus, anzahl: MOBIL ? 6 : (id === 'szene' ? 18 : 14), seed: id === 'szene' ? 31 : 17, mobil: MOBIL });
    A.verkehr = verkehr;
    A.update = dt => { ampel.update(dt); fg.update(dt); verkehr.update(dt); };
    A.radius = id === 'szene' ? 240 : 105;
    const zc = U.zc, xc = U.xc, sz = id === 'szene' ? -1 : 1;
    // Spieler: Kollision (Hausboxen, Gehwegflächen als Stufe, Rand der Fläche) und Startpunkte (Gehweg an der Ecke, Fahrspur)
    A.kollision = new Kollision({ rechtecke: A.hausRechtecke || [], gehwege: U.gehwege.map(p => [p]), gehwegHoehe: U.H, grenze: U.S.L - 1 });
    A.startFuss = { x: xc + 14, z: sz * (zc + 2.6), ry: -Math.PI / 2 };
    const info = { titel: id === 'szene' ? 'Zielbild: Straßenecke' : 'Kreuzung nach Regelwerk', unter: id === 'szene' ? 'alle Bausteine zusammen im Spielmaßstab' : 'Straßen Baukasten, Teil 1 des Regelwerks' };
    const text = id === 'szene'
      ? 'Das Zielbild aus der Stil Bibel: Gebäude, Straße, Bäume, Menschen und Licht in einer Szene. Die Menschen gehen nur auf Gehwegen und über Zebrastreifen und warten bei Rot. Mit dem Regler unten wird es Abend und Nacht.'
      : 'Hauptstraße mit zwei Spuren je Richtung und Radstreifen, Querstraße mit Parkstreifen, Bordsteine mit runden Ecken, Zebrastreifen, Haltelinien, Pfeile, Ampeln mit festen Phasen, Laternen und Baumscheiben.';
    A.eintraege = [
      { id: 'ueberblick', name: 'Überblick', cam: id === 'szene' ? [-200, 165, 230] : [-70, 60, 85], ziel: id === 'szene' ? [0, 35, 0] : [0, 4, 0], ...info, text },
      { id: 'draufsicht', name: 'Draufsicht wie Drohne', cam: [0.01, 115, 0.02], ziel: [0, 0, 0], titel: 'Draufsicht', unter: 'wie die Drohnenbilder im Moodboard 10_Straßen', text: 'Markierungen, Zebrastreifen und Haltelinien folgen festen Maßen: Spur 3,25 m, Radstreifen 1,6 m, Kurvenradius 8 m, Zebrastreifen 4 m breit.' },
      { id: 'gehweg', name: 'Auf dem Gehweg', cam: [xc + 15, 1.7, sz * (zc + 3.4)], ziel: [xc - 4, 4, sz * (zc + 3.4)], titel: 'Augenhöhe', unter: 'Höhenstufe Gehweg, 1,7 m', text: 'So sieht man die Welt zu Fuß. Hier zählen Fassadendetails, Bordstein, Gehwegplatten und Figuren aus der Nähe.' },
      { id: 'ampel', name: 'Ampel und Überweg', cam: [xc + 20, 6, sz * (zc + 14)], ziel: [xc + 6, 2, sz * (zc + 3)], titel: 'Ampelphasen', unter: 'Hauptstraße 18 s, Querstraße 14 s, Gelb 3 s, Räumzeit 2 s', text: 'Fußgänger auf dem Überweg laufen mit der Phase der parallelen Fahrbahn. Wer bei Rot ankommt, bleibt stehen. Die Autos halten an der Haltelinie, bei Gelb nur, wenn der Bremsweg reicht.' },
      { id: 'verkehr', name: 'Verkehr an der Kreuzung', cam: [xc + 40, 2.9, sz * 2.5], ziel: [-6, 1.4, sz * -3], titel: 'Verkehr', unter: `${MOBIL ? 6 : (id === 'szene' ? 18 : 14)} Fahrzeuge, Ampeln, Vorfahrt, Abstand, Abbiegen`, text: VERKEHR_TEXT },
      { id: 'mitfahren', name: 'Mitfahren', folge: true, titel: 'Mitfahren', unter: 'Kamera hinter einem Auto, wechselt beim Verschwinden', text: 'Die Kamera hängt hinter einem Auto und fährt mit: Anfahren, Bremsen an der Ampel, Abbiegen mit Lenkeinschlag, Warten auf Fußgänger und Gegenverkehr. Ein anderer Kamerapunkt beendet die Fahrt.' },
    ];
    if (id === 'szene') A.eintraege.unshift({ id: 'vorlage', name: 'Wie die Vorlage', cam: [-55, 340, 310], ziel: [30, 40, -40], titel: 'Stadt wie die Vorlage', unter: 'weiße Raster, schwarzes Glas, Kupfer, Höfe, Dunst',
      text: 'Nachgebaut nach deinem Bild: Hochhäuser in Weiß, Schwarz und Kupfer auf Sockeln, Blockrand mit Innenhöfen, dunkle Straßen, dahinter eine Fernstadt, die im Dunst verschwindet. Glas spiegelt die Stadt, Kontaktschatten in den Straßenschluchten.' });
    if (id === 'szene') A.eintraege.push({ id: 'daecher', name: 'Dächer', cam: [150, 230, 120], ziel: [40, 80, 30], titel: 'Dachlandschaft', unter: 'Brüstungen, Treppenhäuser, Klimageräte, Wassertanks', text: 'Flachdächer bekommen per Zufall aus dem Seed Technik, damit die Stadt von oben lebendig aussieht und trotzdem jedes Mal gleich ist.' });
    A.zaehlInfo = () => zaehle(g);
  }
  if (id === 'potsdamer' || id === 'kachel') {
    // potsdamer: Testausschnitt aus dem OSM Auszug (tools/ort_bauen.py). kachel: dieselbe Stelle aus den OpenFreeMap Kacheln (kit/ortbau.js,
    // tools/ortbau_test.mjs), so wie jede Stelle der Erde gebaut wird (08_WELTBAU.md). Beide laufen durch dieselbe Ortsszene.
    ladetext(id === 'kachel' ? 'Ort wird aus den Kacheln gebaut' : 'Potsdamer Platz wird gebaut');
    const ziel = id === 'kachel' ? (kachelZiel || [52.50944, 13.37611]) : null;
    const daten = id === 'kachel' ? await ortBestellen(ziel[0], ziel[1], { halb: 600 }) : await ladeOrt('potsdamer_platz');
    A.daten = daten;
    const { ort, netz, augen } = await ortSzene(A, g, daten);
    const n = ort.info(), quelle = `${daten.meta.quelle}, Stand ${daten.meta.stand}.`;
    const kreuzungen = netz.K.filter(k => k.art === 'kreuzung').length;
    const text = id === 'kachel'
      ? `Dieselbe Stelle, gebaut nur aus den OpenFreeMap Kacheln, wie jede Stelle der Erde: ${fmt(n.gebaeude)} Häuser nach Parzellenteilung (die Kacheln fassen aneinander gebaute Häuser gleicher Höhe zusammen), Typen nach der Bauweise der Region (${daten.meta.region}), Straßenbreite aus Klasse und Abstand der Fassaden, Gehwege 1,5 m neben dem Bordstein, Überwege und Ampeln an Kreuzungen nach Straßenrang, ${fmt(n.baeume)} Bäume, ${fmt(n.laternen)} Laternen. Verkehr auf ${netz.spuren.length} Spuren, ${kreuzungen} Kreuzungen, ${netz.anlagen.length} Ampelanlagen. ${quelle}`
      : `Ein Quadratkilometer echte Erde aus OpenStreetMap, gebaut mit unserem Baukasten: ${fmt(n.gebaeude)} Gebäudeteile mit echter Höhe (dazu ${fmt(n.rand)} am Rand nur fern), ${fmt(n.baeume)} Bäume, ${fmt(n.laternen)} Laternen, ${n.ampeln} Ampeln, ${n.querungen} markierte Überwege, Fahrbahnen und Gehwege mit Bordstein aus den echten Flächen. Fern sind die Häuser Kisten mit gemalter Fassade, nah baut der Generator Kachel für Kachel die vollen Häuser. Die Menschen laufen auf den echten Fußwegen (${fmt(n.wegeKnoten)} Knoten) und warten an den Ampeln. Der Verkehr fährt auf dem echten Straßennetz: ${netz.spuren.length} Spuren, ${kreuzungen} Kreuzungen, ${netz.anlagen.length} Ampelanlagen, ${netz.parkplaetze.length} Parkplätze am Straßenrand. ${quelle}`;
    const blick = (name, cam, ziel, titel, unter, txt) => ({ id: name, name: titel, cam, ziel, titel, unter, text: txt || text });
    if (id === 'kachel' && kachelZiel) {   // andere Stelle der Erde: allgemeine Blicke (Überblick, Draufsicht, Augenhöhe an der größten Kreuzung, Verkehr)
      const kr = netz.K.filter(k => k.art === 'kreuzung').sort((a, b) => (b.an.length + b.ab.length) - (a.an.length + a.ab.length) || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0] || { x: 0, z: 0 };
      const h0 = ort.H(0, 0);
      A.eintraege = [
        blick('ueberblick', [560, 430 + h0, 650], [0, h0, 0], 'Überblick', `${daten.meta.land || ''}, Region ${daten.meta.region}`),
        blick('draufsicht', [0.01, 1080 + h0, 0.02], [0, h0, 0], 'Draufsicht', 'wie eine Karte, Norden oben'),
        blick('drohne', [kr.x + 120, 110 + ort.H(kr.x, kr.z), kr.z + 140], [kr.x, 10 + ort.H(kr.x, kr.z), kr.z], 'Drohne', 'über der größten Kreuzung'),
        blick('platz', ...augen(kr.x + 24, kr.z + 18, kr.x - 40, 8, kr.z - 20), 'Augenhöhe', 'an der größten Kreuzung'),
        blick('verkehr', ...(() => { const v = augen(kr.x + 30, kr.z - 8, kr.x - 20, 2, kr.z + 4); v[0][1] += 1.2; return v; })(), 'Verkehr', `${MOBIL ? 16 : 40} Fahrzeuge`, VERKEHR_TEXT),
        { id: 'mitfahren', name: 'Mitfahren', folge: true, titel: 'Mitfahren', unter: 'Kamera hinter einem Auto', text: 'Die Kamera hängt hinter einem Auto und fährt mit.' },
      ];
      A.zaehlInfo = () => zaehle(g);
    } else A.eintraege = [
      blick('ueberblick', [560, 430, 650], [0, 0, 0], 'Überblick', '1 km × 1 km um den Potsdamer Platz'),
      blick('draufsicht', [0.01, 1080, 0.02], [0, 0, 0], 'Draufsicht', 'wie eine Karte, Norden oben'),
      blick('drohne', [150, 120, 170], [-50, 35, -10], 'Drohne über dem Platz', 'Bahntower 103 m, Kollhoff Tower 86 m'),
      blick('platz', ...augen(52, 26, -62, 38, 6), 'Potsdamer Platz', 'Augenhöhe an der Kreuzung'),
      blick('leipziger', ...augen(118, 24, 205, 14, -36), 'Leipziger Platz', 'Achteckplatz, Augenhöhe'),
      blick('sony', [-95, 78, -175], [-180, 4, -60], 'Sony Center', 'Dach über dem Forum, von oben'),
      blick('kulturforum', ...augen(-352, -36, -412, 14, -84), 'Kulturforum', 'Vor der Philharmonie'),
      blick('marlene', ...augen(-150, 292, -222, 40, 429), 'Marlene Dietrich Platz', 'Atrium Tower 99 m'),
      blick('alte', ...augen(-58, 96, -118, 5, 214), 'Alte Potsdamer Straße', 'Läden im Erdgeschoss, Augenhöhe'),
      blick('verkehr', ...(() => { const v = augen(98, -9, 45, 2, -16); v[0][1] = 2.9; return v; })(), 'Verkehr am Potsdamer Platz', `${MOBIL ? 16 : 40} Fahrzeuge auf dem echten Straßennetz`, VERKEHR_TEXT + ' Die Ampelanlagen haben je Kreuzung einen eigenen Umlauf, die Überwege der Menschen hängen an denselben Gruppen.'),
      { id: 'mitfahren', name: 'Mitfahren', folge: true, titel: 'Mitfahren', unter: 'Kamera hinter einem Auto durch den Testausschnitt', text: 'Die Kamera hängt hinter einem Auto und fährt mit über die echten Straßen: Leipziger Straße, Potsdamer Straße, Stresemannstraße. Ein anderer Kamerapunkt beendet die Fahrt.' },
    ];
    A.zaehlInfo = () => zaehle(g);
  }
  if (id === 'gebaeude') {
    g.add(bodenStadt(mats));
    let x = -175;
    for (const def of GEBAEUDE) {
      const m = haus(def);
      const w = Math.max(...def.pts.map(p => p[0])), d = Math.max(...def.pts.map(p => p[1]));
      m.position.set(x, 0, -d / 2); g.add(m);
      const top = m.userData.height || def.height;
      const l = etikett(def.name, `${m.userData.floors} Geschosse · ${fmt(m.userData.tris)} Dreiecke`); l.position.set(x + w / 2, top + 8, 0); g.add(l);
      A.eintraege.push({ id: def.id, name: def.name, cam: [x + w / 2 + top * 0.5 + 8, top * 0.45 + 8, top * 0.85 + 30], ziel: [x + w / 2, top * 0.42, 0], titel: def.name,
        unter: `${def.type}${def.variant ? ' · ' + def.variant : ''} · ${top} m`, text: TYPEN_INFO[def.type],
        fakten: [['Höhe', `${top} m`], ['Geschosse', m.userData.floors], ['Dreiecke', fmt(m.userData.tris)], ['Zeichenaufrufe', m.userData.drawCalls], ['Grundriss', (def.pts.length === 4 ? 'Rechteck' : 'L Form') + (def.ecken ? ', runde Ecken' : '')], ['Quelle', 'Generator kit/buildings.js']] });
      x += w + 22;
    }
    A.eintraege.unshift({ id: 'alle', name: 'Alle Gebäude', cam: [-10, 110, 300], ziel: [-10, 45, 0], titel: 'Gebäude Generator', unter: '8 Typen nach deiner Vorlage, jeder Grundriss möglich',
      text: 'Jedes Haus entsteht aus Grundriss, Höhe, Typ und Seed. Im Spiel kommen Grundriss und Höhe aus OpenFreeMap, der Typ aus Landnutzung, Geschäften und Region. Gleicher Seed, gleiches Haus.' });
    A.radius = 230; A.ziel.set(-10, 0, 0); A.sonde = new THREE.Vector3(-10, 30, 40);
  }
  if (id === 'baustile') {
    // Galerie der Baustile aus kit/stile.js: Regionen als Felder in Spalten, Häuser je Region nebeneinander.
    // Alle Häuser zusammen je Material ein Mesh (wie die Stadt), die Kamera rahmt jedes Haus über seine Box.
    g.add(bodenStadt(mats));
    const hoch = innerHeight > innerWidth, regionen = [...new Set(STILE.map(d => d.region))], spalten = hoch ? 2 : 4, feldB = hoch ? 58 : 64, feldT = hoch ? 44 : 58;   // Hochformat: 2 Spalten, enger
    const haeuser = [], box = new THREE.Box3(), groesse = new THREE.Vector3(), mitte = new THREE.Vector3();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    regionen.forEach((reg, ri) => {
      const liste = STILE.filter(d => d.region === reg), fx = (ri % spalten) * feldB, fz = -Math.floor(ri / spalten) * feldT;
      const breiten = liste.map(def => Math.max(...def.pts.map(p => p[0])) - Math.min(...def.pts.map(p => p[0])));
      let x = fx - (breiten.reduce((a, b) => a + b, 0) + 10 * (liste.length - 1)) / 2;
      liste.forEach((def, k) => {
        const m = buildBuilding(mats, { ...def, leicht: def.leicht || MOBIL });
        const minX = Math.min(...def.pts.map(p => p[0])), minZ = Math.min(...def.pts.map(p => p[1])), maxZ = Math.max(...def.pts.map(p => p[1]));
        m.position.set(x - minX, 0, fz - (maxZ - minZ) / 2 - minZ); m.updateMatrixWorld(true); haeuser.push(m);
        box.setFromObject(m); box.getSize(groesse); box.getCenter(mitte);
        const top = +groesse.y.toFixed(1);
        const l = etikett(def.name, `${def.region} · ${fmt(m.userData.tris)} Dreiecke`); l.position.set(mitte.x, box.max.y + 3, mitte.z); l.visible = false; g.add(l);
        (A.etiketten ??= new Map()).set(def.id, l);
        // Abstand so, dass das ganze Haus mit Rand ins Bild passt (Höhe und Breite), Blick schräg von vorne oben
        const r = Math.max(groesse.y * 0.62, Math.hypot(groesse.x, groesse.z) * 0.5), dist = r / tan * 1.15 + 4;
        A.eintraege.push({ id: def.id, name: `${def.region}: ${def.name}`, cam: [mitte.x + dist * 0.42, mitte.y + dist * 0.38, mitte.z + dist * 0.82], ziel: [mitte.x, mitte.y * 0.85, mitte.z],
          titel: def.name, unter: `${def.region} · ${top} m`,
          text: def.info || TYPEN_INFO[def.type] || '', fakten: [['Höhe', `${top} m`], ['Geschosse', m.userData.floors], ['Dreiecke', fmt(m.userData.tris)], ['Zeichenaufrufe einzeln', m.userData.drawCalls], ['Typ', def.type]] });
        x += breiten[k] + 10;
      });
      if (!hoch) { const schild = etikett(reg, `${liste.length} Gebäude`); schild.position.set(fx, 1.5, fz + 20); g.add(schild); }   // Hochformat: Namen nur in der Liste
    });
    g.add(vereine(haeuser, { schatten: 'alle' }));
    const breite = (Math.min(regionen.length, spalten) - 1) * feldB, tiefe = (Math.ceil(regionen.length / spalten) - 1) * feldT;
    const cx = breite / 2, cz = -tiefe / 2, weit = hoch ? (tiefe / 2 + 25) / tan * 0.8 : Math.max(breite, tiefe) / tan * 0.62 + 60;
    A.eintraege.unshift({ id: 'alle', name: 'Alle Baustile', cam: hoch ? [cx, weit * 0.84, cz + weit * 0.56] : [cx - weit * 0.25, weit * 0.62, cz + weit * 0.78], ziel: [cx, 4, cz], titel: 'Baustile der Welt', unter: `${STILE.length} Gebäude in ${regionen.length} Regionen`,
      text: 'Gebäude für die ganze Erde im selben Detailgrad wie die Stadt: jede Region mit eigener Bauweise, Dachform, Material und Fenstern. Im Spiel wählt die Region (Unterregion aus den Länderdaten) den Stil, der Grundriss kommt aus OpenStreetMap.' });
    A.radius = Math.max(140, Math.max(breite, tiefe) / 2 + 60); A.ziel.set(cx, 0, cz);
  }
  if (id === 'texturen') {
    const boden = bodenPlatte(mats.beton, 400); g.add(boden);
    const Q = await (await fetch('../assets/textures/quellen.json')).json();
    const rollen = [['putz_hell', 'putz'], ['sandstein', 'sandstein'], ['beton_glatt', 'beton'], ['fassade_platten', 'platten'], ['ziegel', 'ziegel'], ['asphalt', 'asphalt'], ['gehweg_platten', 'gehweg'], ['granit', 'granit'], ['dach_kies', 'dach'], ['kopfstein', 'kopfstein']];
    rollen.forEach(([rolle, key], i) => {
      const x = (i % 5) * 7 - 14, z = Math.floor(i / 5) * 9 - 4;
      const platte = new THREE.Mesh(boxMeter(4, 0.12, 4), mats[key]); platte.position.set(x, 0.06, z); platte.receiveShadow = true; platte.castShadow = true; g.add(platte);
      const kugel = new THREE.Mesh(kugelMeter(1.0), mats[key]); kugel.position.set(x, 1.12, z); kugel.castShadow = true; kugel.receiveShadow = true; g.add(kugel);
      const q = Q[rolle];
      const l = etikett(rolle.replace('_', ' '), `${q.polyhaven} · ${q.meter[0]} × ${q.meter[1]} m`); l.position.set(x, 2.6, z); g.add(l);
      A.eintraege.push({ id: rolle, name: rolle.replace('_', ' '), cam: [x + 3.5, 3.2, z + 6.5], ziel: [x, 0.8, z], titel: rolle.replace('_', ' '), unter: `Poly Haven ${q.polyhaven}`,
        text: 'PBR Textur mit Farbe, Normalen und Rauheit, Auflösung 1k. Die Wiederholung kommt aus der echten Größe, darum passt der Maßstab überall.',
        fakten: [['Echte Größe', `${q.meter[0]} × ${q.meter[1]} m`], ['Lizenz', 'CC0'], ['Autor', q.autoren.join(', ')], ['Quelle', 'polyhaven.com']] });
    });
    A.eintraege.unshift({ id: 'alle', name: 'Alle Texturen', cam: [0, 16, 26], ziel: [0, 0, 0.5], titel: 'Texturen', unter: '10 Material Rollen, CC0 von Poly Haven', text: 'Putz, Sandstein, Beton, Fassadenplatten, Ziegel, Asphalt, Gehwegplatten, Granit, Dachkies und Kopfstein. Gebäude und Straßen nutzen nur diese Rollen, so bleibt der Look einheitlich.' });
    A.radius = 30;
  }
  if (id === 'baeume') {
    const boden = bodenPlatte(mats.kopfstein, 500); g.add(boden);
    BAEUME.forEach((def, i) => {
      const t = makeTree(def); const x = (i - 2) * 17; t.position.set(x, 0, 0); g.add(t);
      const l = etikett(def.name, `${def.hoehe} m · ${fmt(t.userData.tris)} Dreiecke`); l.position.set(x, def.hoehe + 2, 0); g.add(l);
      A.eintraege.push({ id: def.id, name: def.name, cam: [x + def.hoehe * 0.6 + 3, def.hoehe * 0.5 + 1, def.hoehe * 1.3 + 4], ziel: [x, def.hoehe * 0.45, 0], titel: def.name, unter: `EZ-Tree Vorlage ${def.preset}`, text: def.info,
        fakten: [['Höhe', `${def.hoehe} m`], ['Dreiecke', fmt(t.userData.tris)], ['Zeichenaufrufe', 2], ['Lizenz', 'MIT (EZ-Tree)']] });
    });
    A.eintraege.unshift({ id: 'alle', name: 'Alle Bäume', cam: [0, 14, 62], ziel: [0, 6, 0], titel: 'Bäume', unter: 'freier Generator, jede Art mit Seed', text: 'Jeder Baum entsteht aus einer Vorlage und einem Seed. Im Spiel wählt der Lebensraum die Art (Tabelle 4.2 der Stil Bibel), der Seed die Form. Blätter bewegen sich im Wind.' });
    A.update = (dt, t) => updateTrees(t);
    A.radius = 50;
  }
  if (id === 'menschen') {
    g.add(bodenStadt(mats));
    const figuren = [], etiketten = new Map();
    // alle Figuren erst hier laden (am Start nur eine Auswahl): Grundfiguren vorn, Varianten dahinter, je 7 pro Reihe
    // Handy: je Grundfigur nur 3 Varianten (Budget 500.000 Dreiecke), Desktop alle
    const jeBasis = {}, zeigen = ALLE_MENSCHEN.filter(d => !MOBIL || !d.basis || (jeBasis[d.basis] = (jeBasis[d.basis] || 0) + 1) <= 3);
    const da = (await Promise.all(zeigen.map(loadPerson))).map((src, i) => ({ src, def: zeigen[i] })).filter(e => e.src);
    const gruppen = [da.filter(e => e.def.quelle !== 'Higgsfield Variante'), da.filter(e => e.def.quelle === 'Higgsfield Variante')];
    let reihe = 0;
    gruppen.forEach((liste, gi) => {
      liste.forEach(({ src, def }, k) => {
        const spalte = k % 7, rz = reihe + Math.floor(k / 7);
        const x = (spalte - 3) * 1.7, z = -rz * 3.0;
        const f = spawn(src); f.obj.position.set(x, 0, z); f.play('gehen'); f.mixer.setTime(k * 0.37); g.add(f.obj); figuren.push(f);
        if (MOBIL) f.obj.traverse(o => { o.castShadow = false; });   // Handy: 28 Figuren ohne eigenen Schatten, sonst doppelte Geometrie
        const l = etikett(def.name.replace(' (Higgsfield)', ''), `${def.quelle} · ${fmt(src.tris)} Dreiecke`); l.position.set(x, def.hoehe + 0.35, z); l.visible = false; g.add(l); etiketten.set(def.id, l);
        A.eintraege.push({ id: def.id, name: def.name, cam: [x + 1.1, 1.25, z + 3.0], ziel: [x, 0.95, z], titel: def.name, unter: def.quelle,
          text: def.basis ? 'Kostenlose Variante einer Higgsfield Figur: Kleidung, Haut und Haar umgefärbt. Sie teilt Netz, Skelett und alle Bewegungen mit ihrer Grundfigur und bringt nur eine eigene Textur mit.' : 'Higgsfield Figur im Stil des Moodboards (ohne Gesicht, gedeckte Erdtöne), mit Meshy in 3D umgesetzt, mit Skelett. Sie kann gehen, stehen, sich umschauen, reden, telefonieren, mit Handy gehen und joggen.',
          fakten: [['Größe', `${def.hoehe.toFixed(2).replace('.', ',')} m`], ['Dreiecke', fmt(src.tris)], ['Bewegungen', src.clips.length + bewegungen.size], ['Textur', src.maps ? 'ja' : 'Vertexfarben'], ['Quelle', def.quelle]] });
      });
      reihe += Math.ceil(liste.length / 7);
    });
    A.eintraege.unshift({ id: 'alle', name: 'Alle Menschen', cam: [0, 7.5, 13], ziel: [0, 0.6, -4.5], titel: 'Menschen', unter: `${da.length} Higgsfield Figuren, vorne die Grundfiguren, dahinter Varianten`,
      text: 'Nur noch Higgsfield Figuren (Naders Entscheidung). Stil nach dem Moodboard: ohne Gesichtszüge, gedeckte Töne, weite Hosen, Pullover, Jacken, Cap und Tasche. Vorne die Grundfiguren, dahinter kostenlose Varianten mit anderen Kleiderfarben, Hauttönen und Haarfarben. Ein Klick auf eine Figur in der Liste zeigt sie aus der Nähe.' });
    A.etiketten = etiketten;
    A.update = dt => figuren.forEach(f => f.mixer.update(dt));
    A.radius = 16;
  }
  if (id === 'fahrzeuge') {
    // Fahrzeuge aus Higgsfield nebeneinander auf einer Fahrbahn; mit Bewegung drehen sich die Räder
    g.add(bodenPlatte(mats.asphalt, 400));
    const da = (await Promise.all(ALLE_FAHRZEUGE.map(ladeFahrzeug))).filter(Boolean), autos = [], etiketten = new Map();
    let x = 0;
    da.forEach(src => {
      const b = src.def.breite, f = setzeFahrzeug(src);
      x += b / 2 + 1.6; f.obj.position.set(x, 0, 0); g.add(f.obj); autos.push({ f, x, z0: 0 });
      if (MOBIL) f.obj.traverse(o => { if (o.isMesh) o.castShadow = false; });
      const l = etikett(src.def.name, `${src.def.laenge.toFixed(2).replace('.', ',')} m · ${fmt(src.tris)} Dreiecke`); l.position.set(x, src.def.hoehe + 0.6, 0); l.visible = false; g.add(l); etiketten.set(src.def.id, l);
      const d = Math.max(src.def.laenge, 4) * 1.15;
      A.eintraege.push({ id: src.def.id, name: src.def.name, cam: [x - d * 0.55, src.def.hoehe * 0.9 + 0.8, src.def.laenge / 2 + d * 0.62], ziel: [x, src.def.hoehe * 0.42, src.def.laenge * 0.08], titel: src.def.name, unter: 'Higgsfield, Vorlage ohne Marken',
        text: src.def.info, fakten: [['Länge', `${src.def.laenge.toFixed(2).replace('.', ',')} m`], ['Breite', `${src.def.breite.toFixed(2).replace('.', ',')} m`], ['Höhe', `${src.def.hoehe.toFixed(2).replace('.', ',')} m`], ['Dreiecke', fmt(src.tris)], ['Räder', src.raeder.length ? `${src.raeder.length}, drehen sich` : 'fest'], ['Reifenradius', `${src.radius.toFixed(2).replace('.', ',')} m`], ['Anteil im Verkehr', `${Math.round(src.def.anteil * 100)} %`]] });
      x += b / 2 + 1.6;
    });
    const mitte = x / 2;
    A.eintraege.unshift({ id: 'alle', name: 'Alle Fahrzeuge', cam: [-9, 6.5, 14], ziel: [mitte * 0.8, 1.2, -1], titel: 'Fahrzeuge', unter: `${da.length} Fahrzeuge für den Berliner Verkehr`,
      text: 'Die Fahrzeuge für Kreuzung und Potsdamer Platz, mit Higgsfield gebaut: Vorlagen ohne Marken und Logos, dann in 3D umgesetzt und in Blender auf echte Länge gebracht. Mit Bewegung drehen sich die Räder wie auf dem Prüfstand, passend zum Reifenradius. Als Nächstes kommt das Fahrsystem mit Spuren, Vorfahrt, Ampeln, Abstand und Zielen.' });
    A.etiketten = etiketten;
    A.update = dt => { for (const a of autos) a.f.drehe(dt * 1.6); };   // wie auf dem Prüfstand: die Räder drehen, das Fahrzeug steht
    A.radius = 30; A.ziel.set(mitte, 0, 0);
  }
  scene.add(g); g.visible = false;
  gebaut.set(id, A);
  return A;
}

let fgSchattenAus = false;
function vereine(gruppen, { schatten = 'waende' } = {}) {
  const jeMat = new Map();
  for (const h of gruppen) {
    h.updateMatrixWorld(true);
    h.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!jeMat.has(o.material)) jeMat.set(o.material, { geos: [], cast: o.castShadow });
      jeMat.get(o.material).geos.push(geo);
    });
  }
  const g = new THREE.Group();
  const waende = new Set(['putz', 'putzSand', 'putzGrau', 'sandstein', 'ziegel', 'beton', 'platten', 'kupfer', 'weiss', 'glasDunkel', 'granit', 'schiefer', 'technikDunkel'].map(k => mats[k]));
  const mittel = new Set([mats.stein, mats.holz]);
  for (const [mat, { geos, cast }] of jeMat) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = cast && (schatten === 'alle' ? !mat.transparent : waende.has(mat) || (!MOBIL && mittel.has(mat))); m.receiveShadow = true; g.add(m);   // Stadt: Rahmen, Glas, Kleinteile ohne Schatten
    geos.forEach(x => x.dispose());
  }
  g.userData = { type: 'haeuser' };
  return g;
}

function boxMeter(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  return g;
}
function kugelMeter(r) {
  const g = new THREE.SphereGeometry(r, 48, 32);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * Math.PI * r);
  return g;
}

// Kamerafahrt
let fahrt = null;
function fahreZu(cam, ziel, dauer = 1.1) {
  const p1 = new THREE.Vector3(...cam), z1 = new THREE.Vector3(...ziel);
  if (camera.aspect < 0.85 && cam[1] > 3) p1.sub(z1).multiplyScalar(Math.min(2.1, 0.85 / camera.aspect)).add(z1);   // Hochformat: weiter weg (Augenhöhe bleibt stehen, sonst landet sie in Häusern)
  fahrt = { t: 0, dauer, p0: camera.position.clone(), z0: controls.target.clone(), p1, z1 };
}

// Oberfläche
function zeigeInfo(e, A) {
  const info = $('info');
  const z = A?.zaehlInfo ? A.zaehlInfo() : null;
  const fakten = e.fakten || (z ? [['Dreiecke gesamt', fmt(z.tris)], ['Meshes', fmt(z.calls)]] : []);
  info.innerHTML = `<div class="kopfzeile"><h2>${e.titel || e.name}</h2><button class="zu" aria-label="Info auf und zu">Info</button></div>
    <div class="unter">${e.unter || ''}</div><p>${e.text || ''}</p>
    ${fakten.length ? `<dl>${fakten.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}`;
  info.querySelector('.zu').onclick = () => info.classList.toggle('klein');
  if (MOBIL) info.classList.add('klein');
}

function projektInfo() {
  const info = $('info');
  info.innerHTML = `<div class="kopfzeile"><h2>Projekt</h2><button class="zu">Info</button></div><div class="unter">EARTH 3D GAME · Stand 28.10.2026</div>
    <p>Erste Bausteine im Stilentwurf aus deinem Moodboard: warmes Licht, Creme und Sandstein, Raster und Glas, Figuren ohne Gesicht in gedeckten Tönen.</p>
    <span class="chip gut">Erddaten geprüft</span><span class="chip gut">10 Texturen CC0</span><span class="chip gut">5 Gebäudetypen</span><span class="chip gut">Kreuzung mit Regeln</span><span class="chip gut">5 Baumarten</span><span class="chip gut">Menschen nur Higgsfield</span><span class="chip offen">Moodboard läuft</span><span class="chip offen">Stil Bibel offen</span>
    <dl><dt>Länder</dt><dd>212</dd><dt>Orte</dt><dd>171.654</dd><dt>Moodboard</dt><dd>7 Bilder</dd><dt>Maßstab</dt><dd>1 Einheit = 1 m</dd></dl>`;
  info.querySelector('.zu').onclick = () => info.classList.toggle('klein');
}

async function waehleAnsicht(id, eintrag) {
  $('laden').classList.remove('weg'); ladetext(`${ANSICHTEN.find(a => a.id === id).name} wird gebaut`);
  await new Promise(r => setTimeout(r, 30));
  const A = await baueAnsicht(id);
  $('laden').classList.add('weg');
  if (aktiv && aktiv !== A) { spielBeenden(); aktiv.gruppe.visible = false; }
  aktiv = A; A.gruppe.visible = true;
  // Farbgebung: die Vorlage (Kontrast 1,2 um 0,42) ist für gebaute Szenen. Auf der Erde bringt das Foto die Farben selbst mit, mit dem harten
  // Kontrast versanken Wald, Heide und Schatten fast in Schwarz (gemessen 29.10.2026 bei Beelitz)
  farbe.uniforms.uKontrast.value = A.erde ? 1.06 : 1.2; farbe.uniforms.uSaett.value = A.erde ? 0.96 : 0.88; farbe.uniforms.uVignette.value = A.erde ? 0.14 : 0.2;
  document.getElementById('spielen').style.display = A.kollision ? '' : 'none';
  document.body.classList.toggle('erde', !!A.erde);
  controls.maxDistance = A.erde ? 3200 : 1200;
  if (A.erde) { controls.enabled = false; erdStundeSetzen(); }
  else { controls.enabled = true; BREITE = 52.51; camera.far = 6000; camera.updateProjectionMatrix(); sky.position.set(0, 0, 0); sterne.mesh.scale.setScalar(1); setTime(stunde); }
  schattenRadius = A.radius; schattenZiel.copy(A.ziel); placeSun(); updateEnv();
  document.querySelectorAll('#bereiche button').forEach(b => b.classList.toggle('aktiv', b.dataset.id === id));
  const ein = $('eintraege'); ein.innerHTML = '';
  A.eintraege.forEach((e, i) => {
    const b = document.createElement('button'); b.textContent = e.name; b.dataset.id = e.id;
    b.onclick = () => waehleEintrag(A, e); ein.appendChild(b);
  });
  waehleEintrag(A, A.eintraege.find(e => e.id === eintrag) || A.eintraege[0], !eintrag);
  if (!projektGezeigt && id === 'szene') { projektGezeigt = true; projektInfo(); }
  history.replaceState(null, '', `#${id}${id === 'kachel' && kachelZiel ? '@' + kachelZiel.join(',') : ''}`);
  setGitter(S.gitter);
  jahreszeit(new Date().getMonth() + 1);   // Blattfarbe nach dem Monat (kit/trees.js)
}

function waehleEintrag(A, e, ersterAufruf) {
  document.querySelectorAll('#eintraege button').forEach(b => b.classList.toggle('aktiv', b.dataset.id === e.id));
  if (A.etiketten) for (const [k, l] of A.etiketten) l.visible = k === e.id;
  spielBeenden();
  folge = e.folge ? { start: false } : null; controls.enabled = !e.folge && !A.erde;   // Mitfahren: Kamera hängt hinter einem Auto; Erde: eigene Kamera
  if (e.folge) { fahrt = null; if (A.verkehr) A.verkehr.held = null; }
  if (e.erde) erdZiel(e.erde);
  else if (e.cam) fahreZu(e.cam, e.ziel, ersterAufruf ? 0.01 : 1.1);
  zeigeInfo(e, A);
}

// Kamera hinter einem Auto (Mitfahren): weich nachgeführt, bei Verschwinden des Autos ein neues
const _cam = new THREE.Vector3(), _ziel = new THREE.Vector3();
function mitfahren(dt) {
  const V = aktiv.verkehr;
  if (!V.held || !V.alle.includes(V.held)) {
    const k = V.alle.filter(f => f.def.klasse !== 'bus' && f.v > 1.5);
    V.held = k[Math.floor(Math.random() * k.length)] || V.alle[0]; folge.start = false;
    if (!V.held) return;
  }
  const h = V.held, d = h.dir, zurueck = h.L * 0.5 + 7.5;
  _cam.set(h.pos.x - d.x * zurueck, 2.9 + h.def.hoehe * 0.4, h.pos.z - d.z * zurueck);
  _ziel.set(h.pos.x + d.x * 9, 1.0, h.pos.z + d.z * 9);
  const k = folge.start ? 1 - Math.exp(-dt * 4) : 1;
  camera.position.lerp(_cam, k); controls.target.lerp(_ziel, k); folge.start = true;
  camera.lookAt(controls.target);
}

function setGitter(an) {
  if (mats) for (const m of Object.values(mats)) if (m && m.isMaterial) m.wireframe = an;
  aktiv?.gruppe.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.wireframe = an; }); });
}

function navZahlen() {   // Zahlen hinter Menschen und Fahrzeuge nachtragen (laden im Hintergrund)
  for (const [id, n] of [['menschen', ALLE_MENSCHEN.length], ['fahrzeuge', ALLE_FAHRZEUGE.length]]) { const k = document.querySelector(`#bereiche button[data-id="${id}"] small`); if (k) k.textContent = n; }
}
function baueNav() {
  const ber = $('bereiche');
  ANSICHTEN.forEach(a => {
    const b = document.createElement('button'); b.dataset.id = a.id;
    const n = { szene: 'Ecke', gebaeude: GEBAEUDE.length, baustile: STILE.length, strassen: 1, texturen: 10, baeume: BAEUME.length, menschen: ALLE_MENSCHEN.length, fahrzeuge: ALLE_FAHRZEUGE.length, potsdamer: 'Test', kachel: 'Welt', erde: 'Kugel' }[a.id] ?? '';
    b.innerHTML = `${a.name}<small>${n}</small>`;
    b.onclick = () => waehleAnsicht(a.id);
    ber.appendChild(b);
  });
  document.querySelectorAll('.schalter button').forEach(b => {
    b.classList.toggle('an', !!S[b.dataset.s]);
    b.onclick = () => {
      const k = b.dataset.s; S[k] = !S[k]; b.classList.toggle('an', S[k]);
      if (k === 'schatten') { renderer.shadowMap.enabled = S.schatten; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); }
      if (k === 'ao') gtao.enabled = S.ao;
      if (k === 'drehen') controls.autoRotate = S.drehen;
      if (k === 'gitter') setGitter(S.gitter);
    };
  });
  const tz = $('tageszeit');
  tz.oninput = () => { setTime(+tz.value); updateEnv(); };
  baueSpielen();
}

// ---------- Spielmodi: freie Kamera, zu Fuß, Fahren (06_STEUERUNG.md) ----------
const eingabe = new Eingabe(renderer.domElement); eingabe.aktiv = true;
const spiel = { modus: 'frei', figur: null, auto: null, rig: null, wahl: null };
const freiV = new THREE.Vector3(), _fwd = new THREE.Vector3(), _rgt = new THREE.Vector3(), _ach = new THREE.Vector2(), _zielP = new THREE.Vector3();
const HILFE = { fuss: 'W A S D oder Pfeile laufen · Shift rennen · Leertaste springen · Maus ziehen dreht · Mausrad Abstand · Esc beendet', fahren: 'W Gas · S Bremse und rückwärts · A D lenken · Leertaste Handbremse · Maus ziehen schaut um · Esc beendet' };

// Freie Kamera: WASD und Pfeile verschieben Kamera und Blickpunkt, Q E heben und senken, Shift dreifach, Tempo wächst mit der Höhe
function freieKamera(dt) {
  eingabe.achse(_ach);
  const hoch = (eingabe.an('hoch') ? 1 : 0) - (eingabe.an('runter') ? 1 : 0);
  _fwd.subVectors(controls.target, camera.position); _fwd.y = 0; if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1); _fwd.normalize(); _rgt.crossVectors(_fwd, new THREE.Vector3(0, 1, 0));
  const tempo = Math.min(400, 10 + 0.8 * Math.max(0, camera.position.y - (aktiv?.bodenHoehe ? aktiv.bodenHoehe(camera.position.x, camera.position.z) : 0))) * (eingabe.an('schnell') ? 3 : 1);
  _zielP.set(0, 0, 0).addScaledVector(_fwd, _ach.y).addScaledVector(_rgt, _ach.x).multiplyScalar(tempo); _zielP.y += hoch * tempo * 0.5;
  freiV.lerp(_zielP, 1 - Math.exp(-(_zielP.lengthSq() > freiV.lengthSq() ? 8 : 10) * dt));
  if (freiV.lengthSq() > 1e-4) { camera.position.addScaledVector(freiV, dt); controls.target.addScaledVector(freiV, dt); const bh = (aktiv?.bodenHoehe ? aktiv.bodenHoehe(camera.position.x, camera.position.z) : 0) + 1.5; if (camera.position.y < bh) { controls.target.y += bh - camera.position.y; camera.position.y = bh; } }
}

function baueSpielen() {
  const jk = $('jetknopf'); if (jk) jk.onclick = () => { if (spiel.modus === 'jet') waehleModus('frei'); else jetStarten(); };
  const box = $('spielen');
  box.querySelectorAll('button[data-m]').forEach(b => { b.onclick = () => waehleModus(b.dataset.m); });
  document.querySelectorAll('#knoepfe button').forEach(b => {
    const t = b.dataset.t;
    if (t === 'ende') { b.onclick = () => waehleModus('frei'); return; }
    const an = e => { e.preventDefault(); eingabe.setzeTouch(t, true); b.classList.add('an'); }, aus = e => { eingabe.setzeTouch(t, false); b.classList.remove('an'); };
    b.addEventListener('pointerdown', an); b.addEventListener('pointerup', aus); b.addEventListener('pointercancel', aus); b.addEventListener('pointerleave', aus);
  });
  eingabe.stickEl = $('stick');
}
function waehleModus(m) {
  const liste = $('auswahl');
  document.querySelectorAll('#spielen button[data-m]').forEach(b => b.classList.toggle('an', b.dataset.m === m));
  if (m === 'frei') { spielBeenden(); liste.classList.remove('offen'); return; }
  // Auswahl der Figur oder des Fahrzeugs
  liste.innerHTML = ''; liste.classList.add('offen');
  const titel = document.createElement('div'); titel.className = 'titel'; titel.textContent = m === 'fuss' ? 'Figur wählen' : 'Fahrzeug wählen'; liste.appendChild(titel);
  const eintraege = m === 'fuss' ? ALLE_MENSCHEN.filter(d => !d.basis || menschenQuellen.some(q => q.def.id === d.id)) : (flotteTypen ? ALLE_FAHRZEUGE.filter(d => !MOBIL || ['kompakt', 'suv', 'taxi', 'bus'].includes(d.id)) : []);
  for (const d of eintraege) {
    const b = document.createElement('button'); b.textContent = d.name.replace(' (Higgsfield)', ''); b.onclick = () => { liste.classList.remove('offen'); spielStarten(m, d).catch(err => { console.error(err); ladetext('Fehler: ' + err.message); }); };
    liste.appendChild(b);
  }
}
async function spielStarten(m, def) {
  const A = aktiv; if (!A || !A.kollision) return;
  spielBeenden(); fahrt = null; folge = null;
  const fokusXZ = camera.position.distanceTo(controls.target) > 150 ? controls.target : camera.position;
  spiel.rig = new Verfolger(camera, A.kollision); spiel.wahl = def;
  if (m === 'fuss') {
    ladetext('Figur wird geladen'); $('laden').classList.remove('weg');
    const quelle = menschenQuellen.find(q => q.def.id === def.id) || await loadPerson(def);
    $('laden').classList.add('weg');
    if (!quelle) return;
    const start = A.startFussSuche ? A.startFussSuche(fokusXZ.x, fokusXZ.z) : A.startFuss;
    spiel.figur = new Figur({ quelle, bewegungen, kollision: A.kollision, start, menge: A.menge });
    A.gruppe.add(spiel.figur.obj);
    spiel.rig.yaw = start.ry + Math.PI; spiel.rig.pitch = 0.32; spiel.rig.distZiel = spiel.rig.dist = 4.2;
    if (A.verkehr) A.verkehr.spieler = spiel.figur;
  } else {
    ladetext('Fahrzeug wird geladen'); $('laden').classList.remove('weg');
    const quelle = await ladeFahrzeug(def);
    $('laden').classList.add('weg');
    if (!quelle || !A.verkehr) return;
    const start = fahrspurStart(A, fokusXZ.x, fokusXZ.z, def.laenge);
    spiel.auto = new Fahrer({ quelle, kollision: A.kollision, start, verkehr: A.verkehr, menge: A.menge });
    A.gruppe.add(spiel.auto.obj);
    spiel.rig.yaw = start.ry + Math.PI; spiel.rig.pitch = 0.17; spiel.rig.distBasis = 5.5 + def.laenge * 0.55; spiel.rig.distZiel = spiel.rig.dist = spiel.rig.distBasis;
    A.verkehr.spieler = spiel.auto;
  }
  spiel.modus = m; controls.enabled = false; eingabe.spiel = true;
  $('hilfe').textContent = HILFE[m]; $('hilfe').classList.add('an'); $('hud').classList.toggle('an', m === 'fahren');
  document.body.classList.add('spiel');
  document.querySelectorAll('#spielen button[data-m]').forEach(b => b.classList.toggle('an', b.dataset.m === m));
  const kb = document.querySelector('#knoepfe button[data-t="bremse"]'); if (kb) kb.textContent = m === 'fuss' ? 'Springen' : 'Bremse';   // dieselbe Taste, anderer Sinn
}
// Startplatz auf der nächsten Fahrspur beim Blickpunkt, KI Autos im Umkreis von 25 m werden umgesetzt
function fahrspurStart(A, x, z, laenge) {
  let best = null, bd = Infinity;
  for (const sp of A.verkehr.netz.spuren) {
    if (sp.len < laenge + 6) continue;
    for (let i = 1; i < sp.pts.length; i++) {
      const a = sp.pts[i - 1], b = sp.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)), px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, ry: Math.atan2(dx, dz) }; }
    }
  }
  if (!best) return { x, z, ry: 0 };
  for (const o of A.verkehr.alle.slice()) if (Math.hypot(o.pos.x - best.x, o.pos.z - best.z) < 25) { A.verkehr.entferne(o); A.verkehr.neu(); }
  return best;
}
function spielBeenden() {
  if (spiel.modus === 'frei') return;
  if (spiel.figur) { spiel.figur.entfernen(); spiel.figur = null; }
  if (spiel.auto) { spiel.auto.entfernen(); spiel.auto = null; }
  if (aktiv?.verkehr) aktiv.verkehr.spieler = null;
  if (spiel.rig) spiel.rig.zuruecksetzen();
  const warJet = spiel.modus === 'jet' ? jetEntfernen() : null;
  spiel.modus = 'frei'; controls.enabled = !aktiv?.erde; eingabe.spiel = false; eingabe.zeigeStick(null);
  controls.target.copy(camera.position).add(camera.getWorldDirection(_fwd).multiplyScalar(12));
  if (aktiv?.erde && erdKam && warJet) erdKam.uebernehmen(camera, erdWelt.geoZuLokal(warJet.lat, warJet.lon, erdBodenGeo(warJet.lat, warJet.lon), new THREE.Vector3()));   // nach dem Jet: Blick auf die Stelle unter ihm
  else if (aktiv?.erde && erdKam) {   // Erde: die freie Kamera übernimmt, Ziel ist der Boden in Blickrichtung
    const p = new THREE.Vector3(); let hit = null;
    for (let d = 3; d < 1500; d *= 1.08) { p.copy(camera.position).addScaledVector(_fwd, d); if (p.y <= erdBoden(p.x, p.z) + 0.2) { hit = p.clone(); break; } }
    if (!hit) { hit = camera.position.clone().addScaledVector(_fwd, 25); hit.y = erdBoden(hit.x, hit.z); }
    erdKam.uebernehmen(camera, hit);
  }
  $('hilfe').classList.remove('an'); $('hud').classList.remove('an'); document.body.classList.remove('spiel');
  document.querySelectorAll('#spielen button[data-m]').forEach(b => b.classList.toggle('an', b.dataset.m === 'frei'));
}
const def_laenge = W => W.def?.laenge || 4.4;
function spielTick(dt) {
  if (aktiv?.erde && eingabe.gedrueckt('ziel')) { const f = $('erdfeld'); f.focus(); f.select(); }   // N: Ziel für die Navigation eingeben
  if (eingabe.gedrueckt('ende')) { waehleModus('frei'); return; }
  if (spiel.modus === 'jet') { jetTick(dt); return; }
  const springen = eingabe.gedrueckt('springen');   // Flanke vor bild() lesen, bild() verbraucht sie
  const rig = spiel.rig, b = eingabe.bild(); eingabe.achse(_ach);
  if (spiel.modus === 'fuss' && spiel.figur) {
    const F = spiel.figur;
    rig.eingabe(b, { zoom: [2, 8] });
    const war = F.luft;
    F.update(dt, _ach, rig.yaw + Math.PI, eingabe.an('schnell'), springen);   // Kamera schaut von yaw aus auf die Figur: vorwärts ist yaw plus pi
    if (war && !F.luft) rig.stoss(0.12);   // Landung: kleiner Stoß
    aktiv.innenwelt?.update(dt, F.pos);
    _zielP.copy(F.bildPos); _zielP.y += 1.45 - F.hoeheUeberBoden * 0.5; _zielP.addScaledVector(F.dir, Math.min(0.6, F.v * 0.25));   // gezeigte (interpolierte) Lage, sonst zittert die Figur gegen die Kamera
    rig.update(dt, { ziel: _zielP, heading: F.ry, bewegt: F.v > 0.3, rueckRate: 1.2, warte: 1.2, rate: 12 });
  } else if (spiel.modus === 'fahren' && spiel.auto) {
    const W = spiel.auto;
    rig.eingabe(b, { zoom: [4, 16] });
    const st = W.update(dt, _ach, eingabe.an('bremse')); if (st) rig.stoss(st);
    // Verfolger wie GTA: hinter der Fahrtrichtung (bei Drift zwischen Nase und Bewegung), zieht mit Tempo nach hinten, Blick voraus,
    // Umschauen mit der Maus, danach schwenkt er in 1,8 s zurück
    // Kamera folgt der gezeigten (interpolierten) Lage des Autos, nicht dem letzten Physikschritt (sonst zittert es gegen die Kamera)
    const av = Math.abs(W.vLong), bewegung = av > 3 ? W.bildPsi - Math.atan2(W.vLat, av) * 0.6 * Math.sign(W.vLong) : W.bildPsi;
    rig.distZiel = THREE.MathUtils.clamp(rig.distBasis * (1 + av * 0.008), rig.distBasis, rig.distBasis * 1.35);
    _zielP.copy(W.bildPos); _zielP.y += 1.0; _zielP.addScaledVector(W.bildDir, 2 + Math.min(5, av * 0.12));   // das Auto bleibt im unteren Drittel des Bildes
    rig.update(dt, { ziel: _zielP, heading: W.rueckwaerts && W.vLong < -1 ? W.bildPsi + Math.PI : bewegung, bewegt: true, rueckRate: 3.5, warte: 1.8, rate: 9, pitchStandard: 0.22, fovPlus: Math.min(16, av * 0.3), minAbstand: 3.2 + def_laenge(W) * 0.3, heben: 0.55 });
    $('hud').textContent = `${Math.round(W.kmh)} km/h · ${W.rueckwaerts && W.vLong < -0.2 ? 'R' : W.gang + 1}. Gang${W.driftet ? ' · Drift' : ''}`;
  }
}

// ---------- Düsenjet über der ganzen Erde (kit/jet.js, 09_GRAFIK.md Abschnitt 7, Wunsch Nr. 33) ----------
// Ein Knopf startet ihn überall auf der Erde. Maus zielt (ein Klick fängt die Maus), der Jet fliegt wie mit einem Instruktor dorthin;
// Tasten steuern direkt und haben Vorrang. Physik in festen Schritten (120 je Sekunde) in ECEF, Kamera und Modell relativ zum Anker.
const JET_HILFE = MOBIL ? 'Stick lenkt (hoch drückt die Nase) · Nachbrenner · Bremse · Beenden' : 'Maus zielt (Klick fängt die Maus) · W S Schub · Shift Nachbrenner · Pfeile Nase · A D Rollen · Q E Seitenruder · Leertaste Luftbremse · C Kamera · M Ton · Esc Ende';
const D2Rj = Math.PI / 180, _jq = new THREE.Quaternion(), _jv = new THREE.Vector3(), _jw = new THREE.Vector3(), _jm = new THREE.Matrix4(), _jy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
let jetModell = null, jetTon = null;
const jetMaus = { x: 0, y: 0 };
function jetHudBauen() {
  if ($('jethud')) return;
  const d = document.createElement('div'); d.id = 'jethud'; d.className = 'jethud';
  d.innerHTML = '<div class="jk" id="jkurs"></div><div class="jl"><b id="jtempo"></b><span id="jmach"></span></div><div class="jr"><b id="jhoehe"></b><span id="jsteig"></span></div>' +
    '<div class="ju"><div class="jschub"><i id="jschubbalken"></i></div><span id="jschubtext"></span><span id="jg"></span></div><div class="jwarn" id="jwarn"></div>' +
    '<div class="jmark jnase" id="jnase"></div><div class="jmark jbahn" id="jbahn"></div><div class="jmark jziel" id="jziel"></div>';
  document.body.appendChild(d);
}
// Lage der Kamera aus dem Zustand (ECEF) in den lokalen Rahmen schreiben; auch nach dem Umsetzen des Ankers
function jetSzene() {
  const J = spiel.jet; if (!J) return;
  const W = erdWelt, F = J.flug;
  W.weltZuLokal(F.p, J.modell.position); J.modell.quaternion.copy(W.zuLokal).multiply(F.q); J.modell.updateMatrixWorld();
  W.weltZuLokal(J.kamP, camera.position); camera.quaternion.copy(W.zuLokal).multiply(J.kamQ); camera.updateMatrixWorld();
}
function jetStarten() {
  if (!aktiv?.erde || !erdWelt) return;
  if (spiel.modus !== 'frei') spielBeenden();
  fahrt = null; folge = null;
  jetHudBauen();
  if (!jetModell) jetModell = baueJet();
  try { if (!jetTon) jetTon = new JetTon(); jetTon.pause(true); } catch (e) { console.warn('Ton', e); }
  const F = new Jet(), W = erdWelt, k = erdKam;
  // Start: tief genug an der Kamera, aus großer Höhe über dem Zielpunkt (die Kamera fliegt dann zum Jet)
  const kg = k.kamGeo, hoch = k.hoehe > 25000;
  const lat = hoch ? k.lat : kg.lat, lon = hoch ? k.lon : kg.lon, boden = erdBodenGeo(lat, lon);
  const h = hoch ? boden + 3000 : Math.max(kg.h, boden + 350);
  F.setze(lat, lon, h, k.kurs, hoch ? 800 : 650);
  scene.add(jetModell);
  const streifen = new Streifen(MOBIL ? 400 : 900); scene.add(streifen.mesh);
  const J = spiel.jet = { flug: F, modell: jetModell, streifen, kamP: new THREE.Vector3(), kamQ: new THREE.Quaternion(), modus: 'verfolger', zielen: false,
    zielKurs: F.kurs, zielNeig: 0, rest: 0, fov: 60, zeit: 0, emit: 0, wirbel: 0, absturz: 0, einflug: null, warnT: 0, machAlt: 0, schuettel: 0, start: { lat, lon } };
  // Einflug: Kamera aus der jetzigen Lage weich zum Jet (Abstand logarithmisch), der Jet wartet so lange
  const P0 = W.lokalZuWelt(camera.position, new THREE.Vector3()), Q0 = W.zuWelt.clone().multiply(camera.quaternion);
  J.einflug = { P0, Q0, t: 0, dauer: hoch ? 3.2 : 1.2 };
  jetKamera(0, true);
  W.vorladen(lat, lon);
  if (erdRegime === 'ort') erdRegime = 'kugel';
  spiel.modus = 'jet'; controls.enabled = false; eingabe.spiel = true;
  camera.fov = 60; camera.updateProjectionMatrix();
  $('hilfe').textContent = JET_HILFE; $('hilfe').classList.add('an'); $('jethud').classList.add('an');
  document.body.classList.add('spiel', 'jetan');
  const kn = document.querySelectorAll('#knoepfe button'); if (kn[0]) kn[0].textContent = 'Nachbrenner'; if (kn[1]) kn[1].textContent = 'Bremse';
  $('jetknopf')?.classList.add('an');
}
function jetEntfernen() {
  const J = spiel.jet; if (!J) return null;
  const pos = { lat: J.flug.geo.lat, lon: J.flug.geo.lon };
  scene.remove(J.modell); scene.remove(J.streifen.mesh); J.streifen.mesh.geometry.dispose(); J.streifen.mesh.material.dispose();
  if (J.explosion) { scene.remove(J.explosion); J.explosion = null; }
  spiel.jet = null; jetTon?.pause(false);
  if (document.pointerLockElement) document.exitPointerLock();
  camera.fov = 40; camera.updateProjectionMatrix();
  $('jethud')?.classList.remove('an'); document.body.classList.remove('jetan'); $('jetknopf')?.classList.remove('an');
  const kn = document.querySelectorAll('#knoepfe button'); if (kn[0]) kn[0].textContent = 'Rennen';
  return pos;
}
function jetUmsetzen(lat, lon) {   // Ziel aus der Liste oder Suche: Jet über das Ziel, Kurs bleibt
  const J = spiel.jet; if (!J) return;
  const b = erdBodenGeo(lat, lon); J.flug.setze(lat, lon, b + 2500, J.flug.kurs, 800); J.zielKurs = J.flug.kurs; J.zielNeig = 0; J.streifen.leeren();
  erdWelt.vorladen(lat, lon);
  const P0 = erdWelt.lokalZuWelt(camera.position, new THREE.Vector3()), Q0 = erdWelt.zuWelt.clone().multiply(camera.quaternion);
  J.einflug = { P0, Q0, t: 0, dauer: 2.6 };
}
// Kamera: Verfolger (folgt der Lage des Jets, weich) oder beim Zielen hinter der Zielrichtung (Horizont bleibt waagrecht); Cockpit
function jetKamera(dt, sofort = false) {
  const J = spiel.jet, F = J.flug, V = F.v.length();
  const e = enu(F.geo.lat, F.geo.lon), oben = e.oben;
  let P = new THREE.Vector3(), Q = new THREE.Quaternion();
  J.modell.userData.haube.visible = J.modus !== 'cockpit';
  if (J.modus === 'cockpit') {
    P.copy(F.p).add(_jv.set(0, 0.92, 3.4).applyQuaternion(F.q)); Q.copy(F.q).multiply(_jy);
  } else {
    const abst = (15.5 + Math.min(4, V / 300) + F.nach * 1.5) * (camera.aspect < 1 ? 1.55 : 1);   // Hochformat: weiter weg, sonst füllen die Flügel die Breite
    let vor;
    if (J.zielen) vor = jetZielRichtung(J, e);
    else { J.kamGlatt ??= F.q.clone(); if (sofort) J.kamGlatt.copy(F.q); else J.kamGlatt.slerp(F.q, 1 - Math.exp(-5.5 * dt)); vor = new THREE.Vector3(0, 0, 1).applyQuaternion(J.kamGlatt); }
    const auf = J.zielen ? oben.clone() : new THREE.Vector3(0, 1, 0).applyQuaternion(J.kamGlatt);
    const links = new THREE.Vector3().crossVectors(auf, vor).normalize(), up = new THREE.Vector3().crossVectors(vor, links);
    P.copy(F.p).addScaledVector(vor, -abst).addScaledVector(up, 3.3);
    // Kamera schaut leicht nach unten auf den Jet (er sitzt im unteren Drittel), dreht sich wie ein three.js Kamera (-z vorn)
    const blick = vor.clone().multiplyScalar(abst + 60).addScaledVector(up, -3.3 + 1.5).normalize();
    const l2 = new THREE.Vector3().crossVectors(up, blick).normalize(), u2 = new THREE.Vector3().crossVectors(blick, l2);
    Q.setFromRotationMatrix(_jm.makeBasis(l2.clone().negate(), u2, blick.clone().negate()));
  }
  // Schütteln: Nachbrenner im dichten Teil der Luft, Knall, Absturz
  J.schuettel = Math.max(0, J.schuettel - dt * 1.6);
  const st = (F.nach * 0.0016 * Math.min(1, F.sigma * 3) * Math.min(1, V / 300) + J.schuettel * 0.012) * (J.modus === 'cockpit' ? 0.6 : 1);
  if (st > 1e-5) { const t = J.zeit; _jq.setFromEuler(new THREE.Euler(Math.sin(t * 37.1) * st + Math.sin(t * 61.7) * st * 0.5, Math.sin(t * 29.3) * st, Math.sin(t * 47.9) * st * 0.6)); Q.multiply(_jq); }
  // Einflug aus der alten Kameralage
  const E = J.einflug;
  if (E) {
    E.t += dt; const k = Math.min(1, E.t / E.dauer), s = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const RE = 6371000, d0 = E.P0.clone().normalize(), d1 = P.clone().normalize(), h0 = Math.max(1, E.P0.length() - RE), h1 = Math.max(1, P.length() - RE);
    const d = d0.clone().lerp(d1, s).normalize(), hh = Math.exp(Math.log(h0) + (Math.log(h1) - Math.log(h0)) * s);
    if (k < 1) { P = d.multiplyScalar(RE + hh); Q = E.Q0.clone().slerp(Q, s); }
    else J.einflug = null;
  }
  if (window.__jetKamOrbit) {   // Prüfstand (tools/jet_modell.mjs): Kamera umkreist den Jet
    const o = window.__jetKamOrbit, a = o.az * D2Rj, b = o.el * D2Rj, off = new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).multiplyScalar(o.d).applyQuaternion(F.q);
    P.copy(F.p).add(off); const blick = off.clone().negate().normalize(), l2 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0).applyQuaternion(F.q), blick).normalize(), u2 = new THREE.Vector3().crossVectors(blick, l2);
    Q.setFromRotationMatrix(_jm.makeBasis(l2.clone().negate(), u2, blick.clone().negate()));
  }
  J.kamP.copy(P); J.kamQ.copy(Q);
  // Sichtwinkel wächst mit dem Tempo
  const fov = (J.modus === 'cockpit' ? 70 : 58) + 20 * Math.min(1, V / 1150) + F.nach * 5;
  J.fov += (fov - J.fov) * (sofort ? 1 : 1 - Math.exp(-3 * dt));
  if (Math.abs(camera.fov - J.fov) > 0.05) { camera.fov = J.fov; camera.updateProjectionMatrix(); }
}
function jetZielRichtung(J, e) {
  const k = J.zielKurs * D2Rj, n = J.zielNeig * D2Rj;
  return new THREE.Vector3().addScaledVector(e.nord, Math.cos(k) * Math.cos(n)).addScaledVector(e.ost, Math.sin(k) * Math.cos(n)).addScaledVector(e.oben, Math.sin(n)).normalize();
}
function jetTick(dt) {
  const J = spiel.jet; if (!J) return;
  const F = J.flug; J.zeit += dt;
  if (eingabe.gedrueckt('kamera')) J.modus = J.modus === 'cockpit' ? 'verfolger' : 'cockpit';
  if (eingabe.gedrueckt('ton') && jetTon) jetTon.an = !jetTon.an;
  // Eingaben: Tasten direkt, Stick am Handy, Maus Zielen
  eingabe.achse(_ach);
  const kNase = (eingabe.an('naseHoch') ? 1 : 0) - (eingabe.an('naseRunter') ? 1 : 0), kRoll = (eingabe.an('rollRechts') ? 1 : 0) - (eingabe.an('rollLinks') ? 1 : 0), kGier = (eingabe.an('gierRechts') ? 1 : 0) - (eingabe.an('gierLinks') ? 1 : 0);
  let nase = kNase, rollen = kRoll, gieren = kGier;
  if (eingabe.stickAktiv) { nase = -_ach.y; rollen = _ach.x; }   // Stick hoch drückt die Nase (wie ein Steuerknüppel)
  if (eingabe.an('gasPlus')) F.gas = Math.min(1, F.gas + dt * 0.6);
  if (eingabe.an('gasMinus')) F.gas = Math.max(0, F.gas - dt * 0.6);
  if (MOBIL) F.gas = Math.max(F.gas, 0.8);
  const nach = eingabe.an('schnell') || !!window.__jetNach, bremse = eingabe.an('bremse');
  // Maus Zielen (Zeiger gefangen): Kurs und Neigung der Zielrichtung zum Horizont
  J.zielen = document.pointerLockElement === renderer.domElement || !!window.__jetZielen;   // __jetZielen: Prüfstand (tools/jet_flug.mjs)
  if (J.zielen) {
    J.zielKurs = (J.zielKurs + jetMaus.x * 0.11 + 360) % 360; J.zielNeig = THREE.MathUtils.clamp(J.zielNeig - jetMaus.y * 0.11, -88, 88);
    if (kNase || kRoll) { J.zielKurs = F.kurs; J.zielNeig = F.neigung; }   // Tasten haben Vorrang, danach gilt die neue Richtung
  }
  jetMaus.x = jetMaus.y = 0;
  // Physik in festen Schritten
  const tasten = Math.abs(nase) + Math.abs(rollen) > 0.01, cmd = F.cmd;
  if (!J.einflug && !F.absturz) {
    J.rest = Math.min(J.rest + dt, 0.1); const h = 1 / 120;
    while (J.rest >= h) {
      J.rest -= h; F.aktualisiere();
      let e = { nase, rollen, gieren, nach, bremse };
      if (J.zielen && !tasten) { F.instruktor(jetZielRichtung(J, F.e), cmd); e = { nase: cmd.x, rollen: cmd.z, gieren: gieren || cmd.y, nach, bremse }; }
      else if (MOBIL && !eingabe.stickAktiv) { const q = F.quer * D2Rj; e.rollen = THREE.MathUtils.clamp(-q * 0.8, -0.35, 0.35); }   // Handy: ohne Stick legt er sich langsam waagrecht
      F.schritt(h, e);
      if (jetKollision(F)) break;
    }
  }
  F.aktualisiere();
  // Absturz: Knall, Feuerball, nach 2,5 s neu in der Luft über der Stelle
  if (F.absturz) {
    F.absturz.t += dt;
    if (J.explosion) { const t = F.absturz.t, s = 6 + t * 70; J.explosion.scale.setScalar(s); J.explosion.material.opacity = Math.max(0, 1 - t / 1.4); erdWelt.weltZuLokal(F.absturz.p, J.explosion.position); }
    if (F.absturz.t > 2.5) { const b = erdBodenGeo(F.geo.lat, F.geo.lon); F.setze(F.geo.lat, F.geo.lon, b + 1500, F.kurs, 700); J.zielKurs = F.kurs; J.zielNeig = 0; if (J.explosion) { scene.remove(J.explosion); J.explosion = null; } J.modell.visible = true; }
  }
  // Kondensstreifen in kalter Luft, Wirbel an den Flügelspitzen bei hoher Last
  J.emit += dt; J.wirbel += dt;
  // Kondensstreifen entstehen erst 60 m hinter den Düsen (die Feuchte braucht Zeit zum Gefrieren), Wirbel an den Flügelspitzen sind dünn
  if (!F.absturz && F.geo.h > 7800 && F.sigma > 0.004 && J.emit > 0.035) { J.emit = 0; for (const d of jetModell.userData.duesen) J.streifen.neu(d.clone().add(_jv.set(0, 0, -60)).applyQuaternion(F.q).add(F.p), 26, 3.5); }
  if (!F.absturz && Math.abs(F.lastSchnitt || 0) > 4.5 && F.geo.h < 7000 && J.wirbel > 0.015) { J.wirbel = 0; for (const d of jetModell.userData.fluegelSpitzen) J.streifen.neu(d.clone().applyQuaternion(F.q).add(F.p), 0.6, 0.22); }
  jetKamera(dt);
  jetSzene();
  J.streifen.update(dt, erdWelt, innerHeight / (2 * Math.tan(camera.fov * D2Rj / 2)));
  jetEffekte(J.modell, F, J.zeit);
  if (F.mach >= 1 && J.machAlt < 1 && F.sigma > 0.1) J.schuettel = Math.min(1, J.schuettel + 0.7);
  J.machAlt = F.mach;
  if (jetTon) { jetTon.pause(document.visibilityState === 'visible'); jetTon.setze(F, dt); }
  jetHud(J, dt);
}
// Kollision: Boden (Gelände der Kugel oder des gebauten Ortes) und Häuser des Ortes (Grundriss und Höhe)
function jetKollision(F) {
  const g = szeneZuGeo(F.p), b = erdBodenGeo(g.lat, g.lon);
  let hart = g.h - b < 1.6;
  const o = erdOrt;
  if (!hart && o && g.h - o.h0 < 700) {
    const x = (g.lon - o.lon) * o.kLon, z = -(g.lat - o.lat) * o.kLat, y = g.h - o.h0;
    if (Math.abs(x) < o.halb && Math.abs(z) < o.halb) {
      o.hausIdx ??= o.daten.gebaeude.filter(e => !e.rand).map(e => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [px, pz] of e.p) { x0 = Math.min(x0, px); z0 = Math.min(z0, pz); x1 = Math.max(x1, px); z1 = Math.max(z1, pz); } return { e, x0, z0, x1, z1 }; });
      for (const h of o.hausIdx) {
        if (x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1) continue;
        const boden = o.szene.ort.H(x, z); if (y > boden + h.e.h + 0.5 || y < boden + (h.e.m || 0) - 0.5) continue;
        let innen = false; const P = h.e.p; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) innen = !innen;
        if (innen) { hart = true; break; }
      }
    }
  }
  if (!hart) return false;
  const J = spiel.jet;
  F.absturz = { t: 0, p: F.p.clone() }; F.v.set(0, 0, 0); J.modell.visible = false; J.schuettel = 1;
  jetTon?.knall(1.4);
  const ex = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
  ex.frustumCulled = false; scene.add(ex); J.explosion = ex;
  return true;
}
const HIMMELSRICHTUNG = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const _jp = new THREE.Vector3();
function jetMarke(el, richtungEcef) {   // Richtung (ECEF) auf den Bildschirm
  _jp.copy(richtungEcef).applyQuaternion(erdWelt.zuLokal).multiplyScalar(2000).add(camera.position).project(camera);
  if (_jp.z > 1 || Math.abs(_jp.x) > 1.2 || Math.abs(_jp.y) > 1.2) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.transform = `translate(${(_jp.x * 0.5 + 0.5) * innerWidth}px, ${(-_jp.y * 0.5 + 0.5) * innerHeight}px)`;
}
function jetHud(J, dt) {
  const F = J.flug, b = erdBodenGeo(F.geo.lat, F.geo.lon), ueber = F.geo.h - b;
  J.hudT = (J.hudT || 0) + dt;
  if (J.hudT > 0.08) {
    J.hudT = 0;
    $('jtempo').textContent = `${fmt(F.kmh)} km/h`; $('jmach').textContent = `Mach ${F.mach.toFixed(2).replace('.', ',')}`;
    $('jhoehe').textContent = F.geo.h >= 10000 ? `${(F.geo.h / 1000).toFixed(1).replace('.', ',')} km` : `${fmt(F.geo.h)} m`;
    $('jsteig').textContent = `${F.steigen >= 0 ? '+' : ''}${fmt(F.steigen)} m/s · ${ueber >= 10000 ? (ueber / 1000).toFixed(1).replace('.', ',') + ' km' : fmt(ueber) + ' m'} über Grund`;
    $('jkurs').textContent = `${String(Math.round(F.kurs) % 360).padStart(3, '0')}° ${HIMMELSRICHTUNG[Math.round(F.kurs / 45) % 8]}`;
    $('jschubbalken').style.width = `${Math.round(F.gas * 100)}%`; $('jschubbalken').classList.toggle('nach', F.nach > 0.3);
    $('jschubtext').textContent = F.nach > 0.3 ? 'NACHBRENNER' : `Schub ${Math.round(F.gas * 100)} %`;
    $('jg').textContent = `${(F.lastSchnitt || 0).toFixed(1).replace('.', ',')} g`;
    // Warnungen: Boden in weniger als 5 s, Abriss, Raumflug
    const sink = -F.steigen, zeitBoden = sink > 5 ? ueber / sink : Infinity;
    let w = ''; if (F.absturz) w = 'ABSTURZ · neuer Start'; else if (zeitBoden < 5 && ueber < 3000) w = 'HÖHE · hochziehen'; else if (F.abriss) w = 'ABRISS · Nase runter'; else if (F.sigma < 0.0008) w = 'RAUMFLUG · nur Raumschub';
    else if (J.zeit < 6) w = J.zielen ? '' : (MOBIL ? '' : 'Klick ins Bild: Maus zielt');
    const we = $('jwarn'); if (we.textContent !== w) { we.textContent = w; we.className = 'jwarn' + (w && w.startsWith('HÖHE') ? ' rot' : ''); }
  }
  // Marken: Nase, Flugbahn, Ziel
  const e = F.e; jetMarke($('jnase'), new THREE.Vector3(0, 0, 1).applyQuaternion(F.q));
  if (F.v.lengthSq() > 1) jetMarke($('jbahn'), F.v.clone().normalize()); else $('jbahn').style.display = 'none';
  if (J.zielen) jetMarke($('jziel'), jetZielRichtung(J, e)); else $('jziel').style.display = 'none';
}
// Maus fangen im Jet (Desktop): Klick ins Bild, Bewegung lenkt das Ziel; Esc gibt sie frei
renderer.domElement.addEventListener('pointerdown', e => { if (spiel.modus === 'jet' && e.pointerType === 'mouse' && !document.pointerLockElement) renderer.domElement.requestPointerLock?.(); });
addEventListener('mousemove', e => { if (spiel.modus === 'jet' && document.pointerLockElement === renderer.domElement) { jetMaus.x += e.movementX; jetMaus.y += e.movementY; } });
document.addEventListener('pointerlockchange', () => { const J = spiel.jet; if (J && document.pointerLockElement === renderer.domElement) { J.zielKurs = J.flug.kurs; J.zielNeig = J.flug.neigung; } });

// Messwerte gegen die Budgets aus nader-game-studio
let fps = 60, fpsT = 0;
function zeigeLeistung(dt) {
  fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  fpsT += dt; if (fpsT < 0.5) return; fpsT = 0;
  const r = renderer.info.render, maxCalls = MOBIL ? 300 : 1000, maxTris = MOBIL ? 500000 : 2000000;
  const k = (v, max) => v <= max ? 'gut' : 'warn';
  $('leistung').innerHTML = `<i class="${fps >= (MOBIL ? 30 : 55) ? 'gut' : 'warn'}">${Math.round(fps)}</i> fps · <i class="${k(r.calls, maxCalls)}">${fmt(r.calls)}</i> Aufrufe · <i class="${k(r.triangles, maxTris)}">${fmt(r.triangles / 1000)}k</i> Dreiecke`;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
  gtao.setSize(innerWidth, innerHeight);
});

const uhr = new THREE.Timer();
let t = 0;
function tick(dt) {
  t += dt;
  if (fahrt) {
    fahrt.t += dt; const k = Math.min(1, fahrt.t / fahrt.dauer), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    camera.position.lerpVectors(fahrt.p0, fahrt.p1, e); controls.target.lerpVectors(fahrt.z0, fahrt.z1, e);
    if (k >= 1) fahrt = null;
  }
  if (spiel.modus !== 'frei') spielTick(dt);
  else if (folge && aktiv?.verkehr) mitfahren(dt);
  else if (aktiv?.erde) erdKamera(dt);
  else { freieKamera(dt); controls.update(dt); }
  if (spiel.modus === 'frei' && !aktiv?.erde) {   // nie unter den Boden (mit Gelände); die Erde Kamera hält selbst Abstand
    const bh = aktiv?.bodenHoehe ? aktiv.bodenHoehe(camera.position.x, camera.position.z) : 0;
    if (camera.position.y < bh + 1.2) camera.position.y = bh + 1.2;
  }
  if (aktiv?.innenwelt && spiel.modus !== 'fuss') aktiv.innenwelt.update(dt, null);   // Türen zu, Innenräume aus
  eingabe.bild();
  const abstand = camera.position.distanceTo(controls.target);
  fokus.copy(abstand > 150 ? controls.target : camera.position);   // Übersicht: die Autos fahren um den Blickpunkt, sonst um die Kamera
  const naeh = THREE.MathUtils.clamp(abstand * 0.004, 0.1, 3);   // gegen Flackern auf großen Abständen
  scene.fog.near = Math.max(420, abstand * 0.95); scene.fog.far = scene.fog.near + 1250;   // Dunst wandert mit, der Blickpunkt bleibt klar
  if (Math.abs(naeh - camera.near) > 0.02) { camera.near = naeh; camera.updateProjectionMatrix(); }
  gtao.enabled = S.ao && camera.position.y > 18;   // Verdeckung wirkt von oben in den Schluchten; auf Augenhöhe spart das einen Durchgang
  if (aktiv?.erde) erdTick(dt);
  else { if (minikarte?.an) minikarte.zeigen(false); if (wolkenberge) wolkenberge.enabled = false; if (leben) leben.update(0, camera, null, { an: false }); }
  const __t0 = performance.now();
  if (aktiv?.lod) aktiv.lod();
  const __t1 = performance.now();
  if (aktiv?.schattenFolgen) {   // großer Ort: Schattenbereich wandert mit dem Blickpunkt (auf 20 m gerastert, gegen Flimmern)
    const r = THREE.MathUtils.clamp(Math.round(abstand * 0.8 / 20) * 20, 80, 520), zx = Math.round(controls.target.x / 20) * 20, zz = Math.round(controls.target.z / 20) * 20;
    if (r !== schattenRadius || zx !== schattenZiel.x || zz !== schattenZiel.z) { schattenRadius = r; schattenZiel.set(zx, 0, zz); placeSun(); }
  }
  const __t2 = performance.now();
  if (aktiv?.update && S.bewegung && !aktiv.ruht) aktiv.update(dt, t);
  const __t3 = performance.now();
  updateTrees(t);
  if (S.uhr) { const h = stunde + dt / 60; const tz = $('tageszeit'); tz.value = h > 23 ? 5 : h; setTime(+tz.value); }   // 1 Stunde je Minute, nachts wieder von vorn
  let wetterNeu = false;
  for (const k of ['wolken', 'regen', 'nebel', 'nass', 'licht']) { const d = wetterZiel[k] - wetterJetzt[k]; if (Math.abs(d) > 1e-4) { wetterJetzt[k] += d * (1 - Math.exp(-dt / 7)); wetterNeu = true; } }
  if (wetterNeu) { setTime(stunde); if (mats) { mats.asphalt.roughness = 1 - 0.55 * wetterJetzt.nass; mats.asphalt.envMapIntensity = 0.55 + 2.0 * wetterJetzt.nass; mats.gehweg.roughness = 1 - 0.3 * wetterJetzt.nass; } }
  if (wolken) {
    const sonneHoch = THREE.MathUtils.clamp(sunDir.y / 0.5, 0, 1);
    const hochOben = aktiv?.erde ? erdHoehe : 0;
    wolken.update(dt, camera.position, { dichte: wetterJetzt.wolken, nacht, sonneHoch });
    if (!sky.visible || hochOben > 1200) wolken.mesh.visible = false;   // dichter Nebel: der Himmel ist Nebelfarbe, die Wolkendecke darüber verdunkelte das Bild; Erde: über den Wolken keine Decke
    sterne.update(camera.position, { nacht: hochOben > 30000 ? 1 : nacht, wolken: hochOben > 30000 ? 0 : wetterJetzt.wolken });
    regen.update(dt, camera.position, hochOben > 2000 ? 0 : wetterJetzt.regen);
  }
  const nebelNah = 1 - 0.78 * wetterJetzt.nebel;   // Nebel zieht den Dunst heran
  if (!(aktiv?.erde && (erdHoehe > 2000 || spiel.modus === 'jet'))) { scene.fog.near *= nebelNah; scene.fog.far = scene.fog.near + (1250 + (aktiv?.erde ? erdHoehe * 25 : 0)) * nebelNah * nebelNah; }
  renderer.info.reset();
  const __t4 = performance.now();
  composer.render(dt);
  if (window.__messen) {   // Messung (tools/erde_mess.mjs): lange Bilder mit Teilzeiten und neuen Shadern
    const __dauer = performance.now() - __t0, __g = window.__gl, __gs = __g ? { ...__g } : null; if (__g) for (const k in __g) __g[k] = 0;
    const __progs = renderer.info.programs || [], __neuP = __progs.filter(p => !(window.__progSeen ||= new Set()).has(p.id)).map(p => p.name); for (const p of __progs) window.__progSeen.add(p.id);
    if (__dauer > 60) (window.__langeBilder ||= []).push({ t: performance.now(), neuP: __neuP, gl: __gs && Object.fromEntries(Object.entries(__gs).map(([k, v]) => [k, Math.round(v)])), ms: Math.round(__dauer), lod: Math.round(__t1 - __t0), update: Math.round(__t3 - __t2), render: Math.round(performance.now() - __t4), progs: renderer.info.programs?.length, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, hoehe: Math.round(erdHoehe) });
  }
  labels.render(scene, camera);
  zeigeLeistung(dt);
}
function frame(ts) {
  requestAnimationFrame(frame);
  if (!innerWidth || !innerHeight || window.DASH?.pause) return;   // verstecktes Fenster: nichts zeichnen; Prüfstände takten selbst
  uhr.update(ts);   // Zeitstempel des Bildschirmtakts (gleichmäßig), nicht performance.now() beim Aufruf (streut um 0,5 ms und ließ das Fahren zittern)
  tick(Math.min(0.05, uhr.getDelta()));
}

// Erde: Ziehen greift die Kugel, Rechts ziehen oder Shift dreht und neigt, Rad zoomt auf den Zeiger, zwei Finger zoomen, drehen und neigen
// (OrbitControls ist in der Erde aus, die ErdKamera gilt vom All bis zur Straße)
{
  const c = renderer.domElement; let modus = null, letzt = [0, 0], pinch = null, pinchWinkel = 0, pinchMitte = null;
  const frei = () => aktiv?.erde && spiel.modus === 'frei' && erdKam;
  const ndc = (x, y) => [x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1];
  c.addEventListener('pointerdown', e => {
    if (!frei() || (e.pointerType === 'touch' && !e.isPrimary)) return;
    modus = e.button === 2 || e.shiftKey ? 'drehen' : 'ziehen'; letzt = [e.clientX, e.clientY];
    if (modus === 'ziehen') erdKam.greifen(camera, ...ndc(e.clientX, e.clientY)); else erdKam.flug = null;
  });
  addEventListener('pointermove', e => {
    if (!modus || !frei() || pinch) return; const dx = e.clientX - letzt[0], dy = e.clientY - letzt[1]; letzt = [e.clientX, e.clientY];
    if (modus === 'drehen') erdKam.drehen(dx, dy); else erdKam.ziehen(camera, ...ndc(e.clientX, e.clientY));
  });
  addEventListener('pointerup', () => { if (modus === 'ziehen' && erdKam) erdKam.loslassen(); modus = null; });
  c.addEventListener('contextmenu', e => { if (frei()) e.preventDefault(); });
  c.addEventListener('wheel', e => { if (!frei()) return; e.preventDefault(); const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; erdKam.rad(camera, THREE.MathUtils.clamp(d, -240, 240) * 0.0018, ...ndc(e.clientX, e.clientY)); }, { passive: false });
  const abst2 = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const winkel2 = e => Math.atan2(e.touches[1].clientY - e.touches[0].clientY, e.touches[1].clientX - e.touches[0].clientX);
  const mitte2 = e => [(e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2];
  c.addEventListener('touchstart', e => { if (!frei() || e.touches.length !== 2) return; if (modus === 'ziehen') erdKam.loslassen(); modus = null; pinch = abst2(e); pinchWinkel = winkel2(e); pinchMitte = mitte2(e); }, { passive: true });
  c.addEventListener('touchmove', e => {
    if (!frei() || e.touches.length !== 2 || !pinch) return;
    const d = abst2(e), w = winkel2(e), m = mitte2(e);
    erdKam.rad(camera, Math.log(pinch / d), ...ndc(m[0], m[1]));
    erdKam.drehen(-(w - pinchWinkel) * 180 / Math.PI * 4, (m[1] - pinchMitte[1]) * 0.8);
    pinch = d; pinchWinkel = w; pinchMitte = m;
  }, { passive: true });
  c.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { passive: true });
}
function baueErdSuche() {
  const feld = $('erdfeld'), treffer = $('erdtreffer'); if (!feld) return;
  feld.oninput = () => {
    const q = feld.value.trim().toLowerCase(); treffer.innerHTML = '';
    if (q.length < 2 || !orteListe.length) { treffer.classList.remove('offen'); return; }
    const hits = orteListe.filter(o => o.name.toLowerCase().startsWith(q) || o.en.toLowerCase().startsWith(q)).sort((a, b) => b.pop - a.pop).slice(0, 10);
    for (const o of hits) {
      const b = document.createElement('button'); b.innerHTML = `${o.name}<small>${fmt(o.pop)} Einwohner</small>`;
      b.onclick = () => { feld.value = ''; treffer.classList.remove('offen'); feld.blur(); if (aktiv?.erde && spiel.modus !== 'frei') naviSetzen(o); else erdZiel({ lat: o.lat, lon: o.lon, dist: 700, neigung: 66, kurs: 0, boden: true }); };   // im Spiel: Ziel der Navigation
      treffer.appendChild(b);
    }
    treffer.classList.toggle('offen', hits.length > 0);
  };
  feld.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') treffer.querySelector('button')?.click(); if (e.key === 'Escape') { feld.value = ''; treffer.classList.remove('offen'); feld.blur(); } };
  feld.onfocus = () => eingabe.taste.clear();   // gehaltene Tasten loslassen (sonst fährt das Auto beim Tippen weiter)
  feld.onkeyup = e => e.stopPropagation();
}

// Baukasten (Texturen, Menschen, Fahrzeuge, Bewegungen): lädt im Hintergrund, die Erde ist vorher zu sehen (seit 29.10.2026 abends:
// vorher 20 MB vor dem ersten Bild, live mehrere Sekunden). Ansichten und der erste Ort warten auf dieses Versprechen.
let hintergrund = null;
async function ladeBaukasten() {
  await initMaterials(renderer, { handy: MOBIL });
  mats = makeMaterials(); setGitter(S.gitter);
  if (MOBIL) { handyNetze(); fahrzeugeHandy(); }
  ALLE_FAHRZEUGE = await alleFahrzeuge();
  ALLE_MENSCHEN = (await alleMenschen()).filter(d => d.quelle.startsWith('Higgsfield'));   // Naders Entscheidung: nur Higgsfield Figuren
  // für die Straße reicht eine Auswahl (Download Budget): Desktop alle Grundfiguren mit je 3 Varianten, Handy 4 Grundfiguren mit je 2.
  // Varianten teilen das Netz ihrer Grundfigur und kosten nur ihre Textur (rund 90 KB). Die Menschen Ansicht lädt alle.
  const handyBasen = ['hf_frau_locken', 'hf_mann_jacke', 'hf_frau_kopftuch', 'hf_mann_hoodie'];
  const basen = ALLE_MENSCHEN.filter(d => !d.basis && (!MOBIL || handyBasen.includes(d.id))).map(d => d.id), jeBasisStart = {};
  const auswahl = ALLE_MENSCHEN.filter(d => d.basis ? basen.includes(d.basis) && (jeBasisStart[d.basis] = (jeBasisStart[d.basis] || 0) + 1) <= (MOBIL ? 2 : 3) : basen.includes(d.id));
  [menschenQuellen, bewegungen] = await Promise.all([Promise.all(auswahl.map(loadPerson)).then(l => l.filter(Boolean)), ladeBewegungen()]);
  navZahlen();
  await ladeFlotte();   // Autos vorab, damit der erste Ort nicht auf sie wartet
  vorgewaermt = vorwaermen();   // Texturen je Bild eine auf die Grafikkarte (sonst lud das erste Bild mit dem Ort 107 Texturen in 712 ms)
}
// alle Texturen von Baukasten, Menschen, Fahrzeugen und Bäumen sammeln und nacheinander hochladen (renderer.initTexture), je Bild eine
let vorgewaermt = Promise.resolve();
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'specularMap', 'displacementMap'];
async function texturenHoch(gruppe) {   // Texturen einer Gruppe, die noch nicht auf der Grafikkarte sind
  const tex = new Set();
  gruppe.traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) { for (const k of TEX_KEYS) if (m[k]?.isTexture) tex.add(m[k]); for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture) tex.add(u.value); } });
  let n = 0;
  for (const t of tex) { if (!t.image || t.isRenderTargetTexture || renderer.properties.get(t).__webglTexture) continue; try { renderer.initTexture(t); n++; } catch (e) { /* noch nicht geladen */ } await bildPause(); }
  return n;
}
function schattenVorwaermen() {
  // compile() deckt die Tiefen Shader des Schattens nicht ab, und ihr Schlüssel enthält die Lichter der echten Szene. Darum einmal in der
  // echten Szene (Sonne, Himmelslicht) versteckte Stellvertreter in ein winziges Bildziel zeichnen: normal, als Instanzen, mit Bild plus
  // alphaTest (Blätter, Zweige) und eine Figur (Skelett). Sonst stockte der Anflug beim ersten Schatten des Ortes um 370 ms.
  const geo = new THREE.BoxGeometry(1, 1, 1), bild = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); bild.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial(), matA = new THREE.MeshStandardMaterial({ map: bild, alphaTest: 0.5 }), teile = new THREE.Group();
  for (const m of [mat, matA]) { const a = new THREE.Mesh(geo, m), b = new THREE.InstancedMesh(geo, m, 1); a.castShadow = b.castShadow = true; a.receiveShadow = b.receiveShadow = true; teile.add(a, b); }
  for (const q of menschenQuellen.slice(0, 1)) { const f = q.scene.clone(true); f.traverse(o => { if (o.isMesh) o.castShadow = true; }); teile.add(f); }
  teile.position.copy(sun.target.position); scene.add(teile);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }), alt = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(alt);
  scene.remove(teile); rt.dispose(); geo.dispose(); mat.dispose(); matA.dispose(); bild.dispose();
}
async function vorwaermen() {
  try { schattenVorwaermen(); } catch (e) { console.warn('Schatten vorwärmen', e); }
  const tex = new Set(), nimm = m => { if (!m) return; for (const x of [].concat(m)) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'specularMap', 'displacementMap']) if (x?.[k]?.isTexture) tex.add(x[k]); };
  if (mats) for (const m of Object.values(mats)) if (m?.isMaterial) nimm(m);
  for (const q of menschenQuellen) q.scene?.traverse(o => { if (o.isMesh) nimm(o.material); });
  for (const t of (await (flotteTypen || Promise.resolve([]))) || []) for (const st of ['voll', 'mittel', 'fern']) { const x = t?.[st]; if (x) { nimm(x.mat); nimm(x.radMats); } }
  for (const def of BAEUME) { try { const v = vorlage(def, def.seed, true); nimm(v.tree.branchesMesh.material); nimm(v.tree.leavesMesh.material); } catch (e) { /* Vorlage entsteht beim ersten Ort */ } }
  let n = 0; for (const t of tex) { if (!t.image) continue; try { renderer.initTexture(t); } catch (e) { /* noch nicht geladen */ } n++; await bildPause(); }
  return n;
}
async function start() {
  ladetext('Erde wird geladen');
  gtao.enabled = S.ao;
  wolken = new Wolken(); sterne = new Sterne(MOBIL ? 800 : 1500); regen = new Regen(MOBIL ? 1200 : 3500);
  scene.add(wolken.mesh, sterne.mesh, regen.mesh);
  $('wetter').onclick = () => { const k = Object.keys(WETTER), i = (k.findIndex(x => WETTER[x] === wetterZiel) + 1) % k.length; setWetter(k[i]); };
  setTime(15); updateEnv();
  baueNav();
  projektInfo();
  const [start, stelle] = (location.hash || '#erde').slice(1).split('@');
  if (stelle) kachelZiel = stelle.split(',').map(Number);
  baueErdSuche();
  minikarte = new Minikarte({ mobil: MOBIL }); navi = new Navi({ springen: naviSpringen });
  hintergrund = ladeBaukasten();
  hintergrund.catch(err => { console.error(err); ladetext('Fehler: ' + err.message); });
  await waehleAnsicht(ANSICHTEN.some(a => a.id === start) ? start : 'erde');
  requestAnimationFrame(frame);
  window.DASH = { THREE, renderer, scene, camera, controls, get mats() { return mats; }, gebaut, waehleAnsicht, setTime, setWetter, wetterJetzt, S, spiel, eingabe, spielStarten, spielBeenden,
    get ALLE_MENSCHEN() { return ALLE_MENSCHEN; }, get ALLE_FAHRZEUGE() { return ALLE_FAHRZEUGE; }, hintergrund: () => hintergrund, tick: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); },
    erde: () => ({ welt: erdWelt, kam: erdKam, ort: erdOrt, regime: erdRegime, auftrag: erdAuftrag, hoehe: erdHoehe }), erdZiel, jetStarten, jet: () => spiel.jet, erdUtc: h => { erdUtc = h; erdEnvStunde = -99; erdStundeSetzen(); }, wolkenberge: () => wolkenberge };
}
start().catch(err => { ladetext('Fehler: ' + err.message); console.error(err); });
