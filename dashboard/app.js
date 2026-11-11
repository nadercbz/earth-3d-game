// EARTH 3D GAME · Projekt Dashboard: die ersten Bausteine in 3D (Gebäude, Straßen, Texturen, Bäume, Menschen).
import '../kit/stand.js';   // muss als Erstes laufen: leert den Speicher eines älteren Stands, bevor irgendetwas geladen wird
import { T, LOCALE, landName, lexikonEN } from '../kit/sprache.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
import { schilderSprache } from '../kit/schilder.js';
import { Tiere } from '../kit/tiere.js';
import { Ton } from '../kit/ton.js';
import { Effekte } from '../kit/effekte.js';
import { Schaden } from '../kit/schaden.js';
import { Radio, SENDER } from '../kit/radio.js';
import { Muenzen } from '../kit/muenzen.js';
import { Polizei } from '../kit/polizei.js';
import { Meer } from '../kit/meer.js';
import { voelkerLaden, looksFuer } from '../kit/voelker.js';
import { geschichtenLaden, geschichte } from '../kit/geschichten.js';
import { AugePass } from '../kit/auge.js';
import { Schiffe, SCHIFFE } from '../kit/schiffe.js';
import { Echtzeit } from '../kit/echtzeit.js';
import { Ereignisse } from '../kit/ereignisse.js';
import { Szenen } from '../kit/szenen.js';
import { Stadtschatten } from '../kit/stadtschatten.js';
import { strandMaterial } from '../kit/meer_glsl.js';
import { Heli, baueHeli, heliDateiLaden, heliEinsetzen, heliEffekte, HeliTon } from '../kit/heli.js';
import { Auftraege } from '../kit/auftraege.js';
import { SpielShell } from './spiel.js';
import '../kit/bauwerke.js';   // neue Gebäudemodelle (05.11.2026)
import { buildBuilding, TYPEN_INFO } from '../kit/buildings.js';
import { buildIntersection, Ampelsteuerung } from '../kit/roads.js';
import { BAEUME, makeTree, updateTrees, instanzBaeume, jahreszeit, vorlage, BLATT_LICHT } from '../kit/trees.js';
import { alleMenschen, loadPerson, spawn, ladeBewegungen, handyNetze, lookQuelle, STEHEN_ARTEN, aktionBereit } from '../kit/people.js';
import { WF_ARTEN, WF_STUFEN, wfStufeHier, wfPreis, wfStartPreis, wfCodeText, wfMailLink, wfWunschMail } from '../kit/werbeflaechen.js';
import { buchungenLaden } from '../kit/werbung.js';
import { Skyline } from '../kit/skyline.js';
import { Menge } from '../kit/crowd.js';
import { ladeOrt, Ort } from '../kit/ort.js';
import { alleFahrzeuge, ladeFahrzeug, setzeFahrzeug, fahrzeugeHandy, ladeFahrzeugStufen, Flotte, lackSetzen, autoFarbe } from '../kit/vehicles.js';
import { Scheinwerfer, LampenLichter } from '../kit/nachtlicht.js';
import { baueNetz, Verkehr, Signalanlagen, baueSignalkoepfe, ueberwegePhasen } from '../kit/traffic.js';
import { Eingabe } from '../kit/input.js';
import { Kollision } from '../kit/collision.js';
import { Figur, Verfolger } from '../kit/player.js';
import { Kreuzer } from '../kit/kreuzer.js';
import { UBahn, MetroDaten, eingangBauen } from '../kit/ubahn.js';
import { Mitfahrt, ZugQuelle, FlugQuelle, flughaefenLaden } from '../kit/mitfahrt.js';
import { Wasserfz, WASSER_ARTEN, wasserModell } from '../kit/wasserfahrt.js';
import { Unterwasser, WRACKS, TIEFSTELLEN } from '../kit/unterwasser.js';
import { Fahrer } from '../kit/drive.js';
import { Innenwelt } from '../kit/interior.js';
import { ortBestellen } from '../kit/ortdienst.js';
import { ErdWelt, ErdKamera, ladeOrteListe, ortNahe } from '../kit/erdwelt.js';
import { Jet, baueJet, jetDateiLaden, jetEinsetzen, jetEffekte, Streifen, JetTon, luftDichte } from '../kit/jet.js';
import { geoZuSzene, szeneZuGeo, enu } from '../kit/erde.js';
import { sonnenstand, Wolken, Sterne, Regen, Schnee, WETTER } from '../kit/himmel.js';
import { Weltraum } from '../kit/weltraum.js';
import { LiveWetter, WETTER_K } from '../kit/livewetter.js';
import { Gewitter } from '../kit/gewitter.js';
import { BODEN_U } from '../kit/materials.js';
import { Minikarte } from '../kit/minikarte.js';
import { Navi } from '../kit/navi.js';
import { ortFotoUniforms, ortFotoLaden, ortFotoFrei } from '../kit/ortfoto.js';
import { Wolkenberge } from '../kit/wolkenberge.js';
import { Meerestiere, Himmelstiere, TIERWUNSCH, TIER_MASSE, TIER_FLUG } from '../kit/wildtiere.js';
import { Weltobjekte } from '../kit/weltobjekte.js';
import { Wahrzeichen } from '../kit/wahrzeichen.js';
import { monatJetzt } from '../kit/waldarten.js';
import { wahrzeichenPolys, WAHRZEICHEN, RAEDER } from '../kit/wahrzeichen_liste.js';
import { stadionUmriss, imStadion } from '../kit/stadion.js';
import { Atmos, AtmosPass, BlurPass } from '../kit/atmos.js';
import { Leben } from '../kit/leben.js';
import { rng, orient, inside } from '../kit/geo.js';

import { MOBIL } from '../kit/geraet.js';
import { bildTexturWarten } from '../kit/bildlader.js';
import { einfrieren } from '../kit/statisch.js';
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString(LOCALE);
const ladetext = t => { $('ladetext').textContent = t; };

// Renderer, Kamera, Steuerung
// Punktlichter und Scheinwerfer: Rechnung nur, wo das Licht wirklich hinreicht (bei Tag und außer Reichweite spart das rund ein Drittel der Bildzeit bei voller Auflösung)
{ let n = 0; THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(/RE_Direct\( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight \);/g, m => n++ < 2 ? 'if ( directLight.visible ) ' + m : m); }
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
// Wie three.js, nur dass Materialien mit sortGruppe (die Kacheln der Kugel, je eines) als eine Gruppe von vorn nach hinten laufen
renderer.setOpaqueSort((a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || (a.material.sortGruppe ?? a.material.id) - (b.material.sortGruppe ?? b.material.id) || a.z - b.z || a.id - b.id);
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBIL ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace('float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;', 'const float phi = 0.7;');   // ohne Rauschen je Pixel: das feine Punktmuster auf Autos und Kleidung war dieser Versatz
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.25, 6000);
camera.position.set(-80, 60, 95);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.62; controls.minDistance = 1.5; controls.maxDistance = 1200;   // leicht nach oben schauen erlaubt (Augenhöhe zwischen Hochhäusern), Boden schützt tick()
controls.target.set(0, 6, 0);
controls.autoRotateSpeed = 0.5;

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
labels.domElement.className = 'labels';
document.body.appendChild(labels.domElement);

// Himmel, Sonne, Umgebungslicht
const atmos = new Atmos(renderer, { mobil: MOBIL });   // Himmel aus echter Streuung (kit/atmos.js, seit 04.11.2026)
const sky = atmos.kuppel(); scene.add(sky);
const SU = sky.material.uniforms;
const skyScene = new THREE.Scene(); const sky2 = new THREE.Mesh(sky.geometry, sky.material); sky2.scale.setScalar(10000); sky2.frustumCulled = false; skyScene.add(sky2);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;

const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBIL ? 2048 : 4096, MOBIL ? 2048 : 4096);
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
sun.shadow.camera.layers.enable(1);   // Ebene 1: Schattenproxys der Gebäude an echten Orten (kit/ort.js) und Kronen der Bäume, nur der Schattendurchgang sieht sie
{ const sm = renderer.shadowMap, r0 = sm.render; sm.render = function (lights, sz, kam) { const v = kam.layers.isEnabled(1); kam.layers.enable(1); r0.call(this, lights, sz, kam); if (!v) kam.layers.disable(1); }; }   // three prüft im Schattendurchgang die Ebenen der Hauptkamera, ohne das warfen Ebene 1 Objekte nie Schatten (gefunden 06.11.2026)
scene.add(sun, sun.target);
const ton = new Ton();
const ALS_SPIEL = !location.hash || location.hash === '#spiel' || location.hash.startsWith('#spiel@');   // ohne Anker im Link beginnt das Spiel mit dem Titelbild, #erde und die anderen Ansichten sind das Dashboard
const hemi = new THREE.HemisphereLight(0xe6eef8, 0x8f7f6c, 0.55); scene.add(hemi); sun.layers.enable(5); hemi.layers.enable(5);   // Ebene 5: Spiegelbild der Schiffe (kit/schiffe.js)
// feste Zahl Lichter ab dem ersten Bild (sonst würden alle Shader neu übersetzt): die nächsten Laternen und die Scheinwerfer des eigenen Autos, am Handy nur die Flecken
const lampenLichter = MOBIL ? null : new LampenLichter(scene, { anzahl: 6, staerke: 60 });
const spielerSpot = MOBIL ? null : new THREE.SpotLight(0xfff0dc, 0, 70, 0.42, 0.55, 1.6); if (spielerSpot) { spielerSpot.castShadow = false; scene.add(spielerSpot, spielerSpot.target); }
scene.fog = new THREE.Fog(0xd3d7da, 420, 1650);   // Dunst wie in der Vorlage: Kern klar, Ferne verschwindet

// Nachbearbeitung
// Kantenglättung trotz Nachbearbeitung: MSAA im Puffer (am Handy aus)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: MOBIL ? 0 : 4,
  depthTexture: MOBIL ? null : new THREE.DepthTexture(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()) }));   // Tiefe für die Wolkenberge (kit/wolkenberge.js)
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
const hauptPass = new RenderPass(scene, camera); composer.addPass(hauptPass);
const atmosPass = new AtmosPass(atmos); atmosPass.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());   // Kontaktschatten und Luftperspektive (nur Erde am Rechner)
if (!MOBIL) composer.addPass(atmosPass);
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 5.0, distanceExponent: 1.4, thickness: 6.0, scale: 1.4, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9, radiusExponent: 1.5, rings: 3 });   // stärker entrauschen, keine Körnung am Boden
gtao.blendIntensity = 1.0;
gtao.enabled = false;
const blurPass = new BlurPass(atmosPass); if (!MOBIL) composer.addPass(blurPass);   // Bewegungsunschärfe, Wolken werden davor eingesetzt
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.0, 0.5, 0.9);
bloom.enabled = false;
// Ungültige Bildpunkte (NaN, unendlich) dürfen nicht in den Glanz: dort verschmiert einer zu großen schwarzen Flächen, die aufblitzen (Wunsch Nr. 56). Auch am Handy und oben, wo die Luftperspektive aus ist
bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); if (any(isnan(texel)) || any(isinf(texel))) texel = vec4(0.0); texel.rgb = min(texel.rgb, vec3(64.0));');
bloom.materialHighPassFilter.needsUpdate = true;
composer.addPass(bloom);
const auge = new AugePass(renderer); composer.addPass(auge);   // automatische Belichtung (kit/auge.js)
composer.addPass(new OutputPass());
// Farbgebung nach der Vorlage: mehr Kontrast, etwas weniger Sättigung, kühle Schatten, leichte Vignette
const farbe = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uKontrast: { value: 1.2 }, uSaett: { value: 0.88 }, uVignette: { value: 0.2 }, uAufhell: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uKontrast, uSaett, uVignette, uAufhell; varying vec2 vUv;
    void main() {
      vec4 c = texture2D( tDiffuse, vUv ); vec3 x = c.rgb;
      float l = dot( x, vec3( 0.2126, 0.7152, 0.0722 ) );
      x = mix( vec3( l ), x, uSaett );
      x = mix( x, ( x - 0.42 ) * uKontrast + 0.42, smoothstep( 0.02, 0.32, l ) );   // Kontrast nur in den Mitten: er drückte dunkle Töne auf Schwarz (0,1 wurde 0,036). Wald, Schatten und das Meer von nahem wirkten dadurch schwarz (Wunsch Nr. 56)
      x *= mix( vec3( 0.985, 0.995, 1.012 ), vec3( 1.0 ), smoothstep( 0.0, 0.6, l ) );
      x += uAufhell * ( 1.0 - smoothstep( 0.0, 0.5, l ) ) * vec3( 0.92, 1.0, 1.14 );   // der Fuß der ACES Kurve drückt Schatten fast auf Schwarz: leicht anheben, kühl wie Himmelslicht
      x *= mix( 1.0 - uVignette, 1.0, smoothstep( 0.95, 0.3, length( vUv - 0.5 ) * 1.35 ) );
      x += ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5 ) / 255.0;   // gegen Stufen in Himmel und Wolken
      gl_FragColor = vec4( clamp( x, 0.0, 1.0 ), c.a );
    }`,
});
composer.addPass(farbe);

const S = { schatten: true, ao: !MOBIL, bewegung: true, drehen: false, gitter: false, uhr: false };
// Wetter (kit/himmel.js): Ziel und weich geführter Zustand (Übergang rund 20 s), Nässe auf dem Asphalt, Dunst näher bei Nebel
let bloomBasis = 0.07; let wetterZiel = WETTER.klar; const wetterJetzt = { ...WETTER.klar }; let wolken = null, sterne = null, regen = null, schnee = null, gewitter = null, belichtung = 0.9, weltraum = null;
const live = new LiveWetter(); let wetterLive = true;   // Wetter: live wie in der echten Welt (kit/livewetter.js), bis jemand von Hand eines wählt
function setWetter(name) { wetterLive = name === 'live'; live.an = wetterLive; if (wetterLive) { live.letzte = null; live.warte = 0; if (live.ziel) wetterZiel = live.ziel; } else wetterZiel = WETTER[name] || WETTER.klar; $('wetter').textContent = wetterLive ? 'Live' : wetterZiel.name; $('wetter').classList.toggle('an', !wetterLive); }   // Verdeckung am Handy aus (verdoppelt die Geometrie)

let mats;
let uwLicht = false;
const sunDir = new THREE.Vector3(), _nebelFarbe = new THREE.Color(), _hemi = new THREE.Color(), _hemiNacht = new THREE.Color(0.40, 0.50, 0.82), _weiss = new THREE.Color(1, 1, 1);
let nacht = 0, erdKamMeer = 2;

let BREITE = 52.51; const TAG_IM_JAHR = (() => { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); })();   // Berlin, heute (Sonnenbahn je Jahreszeit)
let stunde = 15;
function setTime(h) {
  stunde = h;
  if (aktiv?.erde && erdWelt) erdUtc = h - erdWelt.anker.lon / 15;   // Erde: Regler zeigt die Sonnenzeit am Anker, die Weltzeit läuft mit
  // echter Sonnenstand (kit/himmel.js): Ende Oktober in Berlin steht die Sonne mittags rund 24 Grad hoch, Aufgang gegen 7, Untergang gegen 17 Uhr Sonnenzeit
  const st = sonnenstand(h, TAG_IM_JAHR, BREITE), el = st.el;
  sunDir.copy(st.dir).normalize();
  SU.sunPosition.value.copy(sunDir);
  nacht = 1 - THREE.MathUtils.smoothstep(Math.sin(el), -0.12, 0.08);
  const bedeckt = THREE.MathUtils.smoothstep(wetterJetzt.wolken, 0.35, 0.95) * 0.95;
  atmos.setzen(sunDir, { hoehe: aktiv?.erde ? erdKamMeer : 2, bedeckt, dunst: wetterJetzt.nebel, stadt: aktiv?.erde && erdHoehe > 30000 ? 0 : 1 });
  sun.color.copy(atmos.sonneFarbe);
  sun.intensity = 5.0 * THREE.MathUtils.smoothstep(Math.sin(el), -0.02, 0.1);
  // Umgebungslicht: Farbe des Himmels, nachts Mondlicht und der Widerschein der Stadt (seit 04.11.2026 nicht mehr fast schwarz)
  { const c = atmos.himmelFarbe, l = Math.max(c.r, c.g, c.b, 1e-3); _hemi.setRGB(c.r / l, c.g / l, c.b / l).lerp(_weiss, 0.68).lerp(_hemiNacht, nacht); hemi.color.copy(_hemi); hemi.groundColor.setRGB(0.52 - 0.36 * nacht, 0.46 - 0.32 * nacht, 0.38 - 0.24 * nacht); }
  hemi.intensity = 2.25 - 0.65 * nacht;   // kräftiges Himmelslicht: Schatten bleiben farbig und lesbar wie im Spiel, nicht schwarz
  belichtung = (0.74 + 0.26 * nacht) * (1 - 0.18 * (1 - wetterJetzt.licht)) * (1 + erdWaldAuge * 0.46 * (1 - nacht)) * (1 - 0.36 * THREE.MathUtils.smoothstep(Math.sin(el), 0.3, 0.95)); renderer.toneMappingExposure = belichtung;   // hohe Sonne: Belichtung geht zurück wie bei einer Kamera, sonst brennen Sand und Beton in den Tropen aus
  sun.intensity *= wetterJetzt.licht;
  hemi.intensity *= 1 + (1 - wetterJetzt.licht) * 0.5;   // bedeckt: mehr diffuses Licht, weniger Sonne
  if (uwLicht) { hemi.color.setRGB(1, 1, 1); hemi.groundColor.setRGB(0.62, 0.62, 0.62); hemi.intensity = 1.7; sun.color.setRGB(1, 1, 1); sun.intensity = 1.2 * THREE.MathUtils.smoothstep(Math.sin(el), -0.02, 0.1); }   // unter Wasser rechnet das Bildfilter Tiefe und Tageszeit: hier nur die Farbe der Dinge, sonst bliebe die Lampe nachts wirkungslos
  { const so = atmos.sonneFarbe, hi = atmos.himmelFarbe, st = THREE.MathUtils.smoothstep(Math.sin(el), -0.02, 0.1) * wetterJetzt.licht, n = 1 - nacht; BLATT_LICHT.value.setRGB((so.r * 0.34 * st + hi.r * 0.16 + 0.018) * (0.25 + 0.75 * n), (so.g * 0.4 * st + hi.g * 0.14 + 0.022) * (0.25 + 0.75 * n), (so.b * 0.14 * st + hi.b * 0.08 + 0.028) * (0.25 + 0.75 * n)); }   // Licht durchs Laub
  scene.fog.color.copy(atmos.horizont);
  scene.fog.color.lerp(_nebelFarbe.setRGB(0.74 - 0.62 * nacht, 0.76 - 0.62 * nacht, 0.78 - 0.6 * nacht), wetterJetzt.nebel * 0.8);   // Nebel ist hell
  sky.visible = wetterJetzt.nebel < 0.6; scene.background = sky.visible ? null : scene.fog.color;   // dichter Nebel: Himmel ist Nebelfarbe
  NACHT.value = nacht * (aktiv?.erde ? 0.6 : 1);   // Erde: aus der Luft sieht man tausende Fenster, darum gedämpft
  if (mats) {
    if (mats._extra) { mats._extra.leuchte.emissiveIntensity = 3.0 * nacht; }
  }
  bloom.enabled = !MOBIL;        // Glanz: nachts Fenster und Laternen, bei Tag ganz leicht auf Sonne, Spiegelungen und Lack
  bloom.strength = bloomBasis = (0.07 + 0.5 * Math.max(0, nacht - 0.5) * 2) * (aktiv?.erde ? (nacht > 0.5 ? 0.45 : 1) : 1); bloom.threshold = nacht > 0.5 ? (aktiv?.erde ? 0.9 : 0.75) : 1.25;   // Erde: tausende Fenster der Kisten, sonst wird die Stadt ein heller Nebel
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
    const hell = SU.uHimmel.value; SU.uHimmel.value = 1; SU.uEnvSatt.value = 0.45;   // Umgebungslicht fast neutral: der blaue Himmel färbte sonst Asphalt und alles im Schatten tiefblau
    envRT = sonde ? pmrem.fromScene(scene, 0.012, 1, 9000, { size: MOBIL ? 128 : 256, position: sonde }) : pmrem.fromScene(skyScene, 0, 1, 20000);
    SU.uHimmel.value = hell; SU.uEnvSatt.value = 1;
    scene.environment = envRT.texture; window.__ereignis?.('env');
    scene.environmentIntensity = (aktiv?.id === 'szene' ? 0.55 : 0.38) - 0.2 * nacht;   // freie Ansichten sehen viel Himmel, darum weniger
    old?.dispose();
  }, 150);
}

// Schattenbereich passt sich der Ansicht an
let tNatur = 0; const natur = { kueste: 0, tropen: 0, stadt: 1 };
let schattenRadius = 120, erdWaldAuge = 0;   // erdWaldAuge: im dichten Wald am Boden geht die Belichtung hoch wie beim Auge
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

let etikettDa = false;   // CSS2DRenderer läuft durch die ganze Szene (2 ms je Bild bei 10.000 Objekten), im Spiel gibt es keine Etiketten
function etikett(titel, unter = '') {
  etikettDa = true;
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
  if (scheiben) { autos = MOBIL ? 60 : 240; menschen = MOBIL ? 64 : 220; }   // Nr. 92 (09.11.2026, Nader: "sieht das aus wie eine Ghost-Stadt, aber da soll wirklich viel Leben sein"): fast doppelt so viele Autos und Menschen   // Erde: belebter (29.10.2026 spät und 02.11.2026, Nader: "so wenig Verkehr ... mehr Autos")   // Erde: belebter (29.10.2026 spät, Nader: "viel zu leer ... viel lebendiger")
  const bz = A.bauZeiten = {}; let bt = performance.now(); const bm = async n => { const j = performance.now(); bz[n] = Math.round(j - bt); if (window.__messen) (window.__bauLog ||= []).push([n, Math.round(bt), Math.round(j - bt)]); if (scheiben) await bildPause(); bt = performance.now(); };
  // Erde: Satellitenbild für den Boden des Ortes, lädt parallel zum Bau (kit/ortfoto.js)
  const fotoU = !boden && erdWelt ? ortFotoUniforms(erdWelt.erde.mat.uniforms.uHell, erdWelt.erde.mat.uniforms.uSonne) : null;
  const fotoFertig = !fotoU ? null : ortFotoLaden(fotoU, { lat: daten.meta.lat, lon: daten.meta.lon, halb: daten.meta.groesse / 2, renderer, mobil: MOBIL }).catch(e => console.warn('Ortsfoto', e));
  if (!boden && erdWelt && !mats._strandMat) mats._strandMat = strandMaterial();
  const ort = new Ort(daten, mats, { mobil: MOBIL, renderer, tief: boden ? null : 40, spaeter: scheiben, wasserMat: !boden && erdWelt ? erdWelt.wasserMaterial() : null, foto: fotoU });
  if (scheiben) await ort.bauen(bildPause);
  await bm('ort');
  if (boden) { g.add(bodenPlatte(mats.beton, 6000), ort.gruppe); g.children[g.children.length - 2].position.y = ort.unten - 0.02; } else g.add(ort.gruppe);
  // Verkehr: Spurgraph aus dem Straßennetz, je Ampelkreuzung ein eigener Umlauf, Signalköpfe an den Haltelinien, Überwege an denselben Gruppen
  ladetext('Fahrzeuge werden geladen');
  const typen = await ladeFlotte();
  await bm('flotteLaden');
  // Erde: Weltlage der Ortsmitte (wie kit/ortbau.js), damit Parkplätze, geparkte Autos und Ampeln an der Erde hängen statt am Ort (Wunsch Nr. 36)
  const phi = daten.meta.lat * D2R, welt = scheiben ? [daten.meta.lon * (111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)), -daten.meta.lat * (111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi))] : null;
  const netz = baueNetz(daten.verkehr, { ueberwege: daten.querungen, halte: (daten.moebel || []).filter(m => m[2] === 'halt'), parkenSeed: 5, links: !!daten.meta.links, hoehe: ort.Hz || ort.H, welt, stellen: daten.freizeit?.stellen || [] }); await bm('netz');
  const signale = new Signalanlagen(netz.anlagen, seed, new Ampelsteuerung([]), welt ? netz : null);
  const koepfe = baueSignalkoepfe(netz, { mast: mats.technikDunkel }, { masten: daten.ampeln || [] }); signale.koepfe = koepfe; g.add(koepfe.gruppe); einfrieren(koepfe.gruppe);   // Köpfe nur an Masten neben der Fahrbahn (Nr. 88)
  ueberwegePhasen(daten.wege, netz); await bm('signale');
  const fg = new Menge({ wege: daten.wege, ampel: signale, quellen: await voelkerQuellen(daten.meta?.iso), bewegungen, kamera: camera, mobil: MOBIL, seed,
    anzahl: scheiben ? Math.min(menschen, 14) : menschen, gruppen: MOBIL ? 6 : scheiben ? 24 : 8, gruppenOrte: daten.gruppen, blase: { radius: MOBIL ? 110 : 170 }, renderer, linear: !!daten.meta.wegeLinear });
  const menschenZiel = fg.alle.length + Math.max(0, menschen - 14);   // Erde: die übrigen kommen nach dem Tausch, zwei je Bild
  g.add(fg.gruppe); await bm('menge');
  const flotte = new Flotte(typen, { mobil: MOBIL, max: netz.parkplaetze.length + autos + 20 });
  g.add(flotte.gruppe);
  const verkehr = new Verkehr({ netz, flotte, typen, signale, menge: fg, kamera: camera, fokus, anzahl: autos, seed: seed + 2, mobil: MOBIL, blase: { radius: MOBIL ? 230 : 380 }, land: !!daten.meta?.kleinort });
  await bm('verkehr');
  A.menge = fg; A.ort = ort; A.verkehr = verkehr; A.signale = signale;
  const szenen = welt ? new Szenen({ menge: fg, ort, mobil: MOBIL, kamera: camera, uhr: () => { const lo = daten.meta?.lon || 0, u = erdUtc ?? (new Date().getUTCHours() + new Date().getUTCMinutes() / 60); return ((u + lo / 15) % 24 + 24) % 24; }, tipp: (t, s) => shell?.aktiv && shell.tipp(t, s), hinweis: true, verkehr: () => A.verkehr, kollision: () => A.kollision }) : null; A.szenen = szenen;
  A.update = dt => { szenen?.update(dt); ort.rummel?.update(dt, camera.position); ort.kraene?.update(); ort.freizeit?.update(camera.position); ort.werbung?.update(dt); ort.kleintiere?.update(camera.position, nacht, Math.abs(erdWelt?.anker.lat ?? 50) < 30 || ((erdWelt?.anker.lat ?? 50) >= 0) === (monatJetzt() >= 4 && monatJetzt() <= 9), dt); ort.waldleben?.update(camera.position, nacht, Math.abs(erdWelt?.anker.lat ?? 50) < 30 || ((erdWelt?.anker.lat ?? 50) >= 0) === (monatJetzt() >= 4 && monatJetzt() <= 9)); ort.wild?.update(camera.position, spiel.auto ? { x: (spiel.auto.bildPos || spiel.auto.pos).x, z: (spiel.auto.bildPos || spiel.auto.pos).z, schnell: true } : spiel.figur ? { x: (spiel.figur.bildPos || spiel.figur.pos).x, z: (spiel.figur.bildPos || spiel.figur.pos).z } : null, ton); ort.bahn?.update(camera.position, verkehr, ton); ort.flughafen?.update(camera.position, verkehr); ort.hafen?.update(camera.position, schiffe, (x, z) => { const m = ort.daten.meta, phi = m.lat * Math.PI / 180; return { lat: m.lat - z / (111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)), lon: m.lon + x / (111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)) }; }); signale.update(dt); fg.update(dt); verkehr.update(dt); if (scheiben && fg.alle.length < menschenZiel) fg.nachfuellen(menschenZiel, 2); };
  // Spieler: Gebäude Grundrisse (nicht unter Dächern), Gehwegblöcke als Stufe, Gelände, Rand des Ausschnitts
  A.kollision = new Kollision({ polys: [...daten.gebaeude.filter(x => !x.rand && x.m < 2 && x.b !== 'roof' && x.b !== 'carport').map(x => x.p), ...(daten.meta.lat != null ? wahrzeichenPolys(daten.meta.lat, daten.meta.lon, daten.meta.groesse / 2) : []), ...(ort.brueckenRails || []), ...(daten.freizeit?.stadien || []).map(q => stadionUmriss(q)), ...(daten.freizeit?.fest || [])], gehwege: daten.bloecke, gehwegHoehe: 0.12, grenze: daten.meta.groesse / 2 - 3, gelaende: ort.H }); if (ort.Hz) A.kollision.gelaendeZ = ort.Hz; A.kollision.dachBei = (x, z) => ort.dachBei(x, z); if (ort.mauer) A.kollision.mauerH = (x, z, y) => ort.mauer.hoeheBei(x, z, y); A.kollision.stadionFrei = (daten.freizeit?.stadien || []).length ? (x, z) => daten.freizeit.stadien.some(q => imStadion(q, x, z, -stadionRand(q))) : null;
  A.startFussSuche = (x, z) => { let best = null, bd = Infinity; for (const k of daten.wege.knoten) { if (k[2] - ort.H(k[0], k[1]) < 0.05 || !A.kollision.frei(k[0], k[1])) continue; const d = Math.hypot(k[0] - x, k[1] - z); if (d < bd) { bd = d; best = k; } } return best ? { x: best[0], z: best[1], ry: Math.atan2(x - best[0], z - best[1]) + Math.PI } : { x: 0, z: 0, ry: 0 }; };
  // begehbare Gebäude (kit/interior.js): Innenräume entstehen, sobald die Figur ein Haus betritt oder vor der Haustür steht
  await bm('kollision');
  A.kollision.zusatz = (x, z) => ort.bahn?.steigHoehe(x, z) ?? null;
  A.kollision.tunnel = ort.tunnelFeld?.n ? ort.tunnelFeld : null;   // Straßentunnel (Nr. 98)
  A.kollision.bruecke = ort.brueckenFeld?.ueber ? ort.brueckenFeld : null;   // Brücken über Verkehr (Nr. 95)
  A.kollision.ubahn = ort.ubahnFeld?.n ? ort.ubahnFeld : null;   // U-Bahn Eingänge (Nr. 94)
  A.innenwelt = new Innenwelt({ mats, gruppe: g, kollision: A.kollision, haeuser: ort.haeuser, findeTuer: hid => ort.tueren.get(hid) || null, festeTuer: (hid, aus) => ort.festeTuer(hid, aus), mobil: MOBIL, klang: art => { if (art === 'griff') { ton.klick(); ton.ton(1500, 1100, 0.025, 0.03, 'square', 0.05); } else if (art === 'auf') { ton.knall(0.03, 800, 0.5); ton.ton(200, 150, 0.01, 0.35, 'sawtooth', 0.12); } else ton.tuer(); } }); await bm('innen');   // Haustür auf Tastendruck (Nr. 96)
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
  return { ort, netz, verkehr, menge: fg, signale, augen, fotoU, fotoFertig };
}

// ---------- Erde: die ganze Welt als Kugel, gebauter Ort um die Kamera (kit/erdwelt.js, 08_WELTBAU.md, seit 29.10.2026) ----------
// Eine Kamera vom All bis zur Straße (ErdKamera: Umlauf um einen Zielpunkt, Neigung nach Abstand). Unter 4,5 km (Handy 2,6 km) wird am
// ruhigen Zielpunkt ein Ort gebaut (Worker, dann in Scheiben im Hauptthread, unsichtbar bis fertig, dann in einem Bild getauscht).
// Anker: liegt das Ziel im Ort, ist seine Mitte der Ursprung (erdRegime 'ort', Spielmodi möglich), sonst wandert der Ursprung mit der Kamera.
let erdWelt = null, erdKam = null, erdOrt = null, erdAuftrag = null, erdRegime = 'kugel', erdUtc = null, orteListe = [], erdStatusT = 0, erdOrtFehler = 0, erdHoehe = 1e7;
const radio = new Radio(ton); let muenzen = null; const polizei = new Polizei({ ton, mobil: MOBIL });
let shell = null, effekte = null, auftraege = null, tiere = null, scheinwerfer = null, minikarte = null, navi = null, erdNachSprung = null, wolkenberge = null, leben = null;   // leben: Vögel und Flugzeuge (kit/leben.js)   // wolkenberge: Volumenwolken am Rechner (kit/wolkenberge.js)   // Minikarte, Navigation, Spiel nach dem Hinspringen fortsetzen (Wunsch Nr. 34)
let erdBauDauer = 4, erdVorratLaeuft = false;   // gleitender Mittelwert der Bauzeit eines Ortes in Sekunden (im Auto wird so weit voraus bestellt)
const erdCache = [], erdStabil = { lat: 0, lon: 0, t: 0 }, erdLeer = [], erdVorrat = new Map(), erdHaenger = new Map();   // erdVorrat: Kachel Schlüssel -> Ortsdaten, im Hintergrund geholt (Wunsch Nr. 36)   // erdLeer: Stellen ohne Straßen und Häuser (Gebirge, Wald, Meer), dort kein Ort
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
// festes Kachelraster der Orte (Wunsch Nr. 36, 02.11.2026): Orte stehen nur noch auf den Mitten eines Rasters mit Kante ERD_HALB, nicht mehr
// dort, wo die Kamera gerade ist. Dieselbe Stelle der Erde gibt so immer denselben Ort (gleiche Bäume, Laternen, geparkte Autos), zwei
// Nachbarorte überlappen um eine halbe Kante und sind dort gleich gebaut, und der Zwischenspeicher trifft beim Zurückfahren.
function erdZelle(lat, lon) {
  const S = ERD_HALB, i = Math.round(lat * 111195 / S), la = i * S / 111195, kl = Math.max(1000, 111412.84 * Math.cos(la * D2R) - 93.5 * Math.cos(3 * la * D2R));
  const j = Math.round(lon * kl / S); return { lat: la, lon: j * S / kl, key: i + ':' + j };
}
// liegt ein Punkt deutlich (40 m) in einer anderen Rasterzelle als der Ort? (kein Hin und Her an der Zellgrenze)
function erdAndereZelle(o, lat, lon) {
  if (!o) return true;
  const dx = Math.abs(lon - o.lon) * o.kLon, dz = Math.abs(lat - o.lat) * o.kLat;
  return Math.max(dx, dz) > ERD_HALB / 2 + 40;
}
const erdWeg = (o, lat, lon) => o ? Math.hypot((lat - o.lat) * 111000, (lon - o.lon) * 111000 * Math.cos(lat * D2R)) : Infinity;
function erdZiel(z) {
  if (!erdWelt) return;
  if (spiel.modus === 'jet') { jetUmsetzen(z.lat, z.lon); return; }   // im Jet: über das Ziel versetzen, weiterfliegen
  if (spiel.modus !== 'frei') spielBeenden();
  erdKam.fliegeZu({ lat: z.lat, lon: z.lon, dist: z.dist, kurs: z.kurs, neigung: z.neigung, dauer: z.dauer });
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
  ({ lat, lon } = erdZelle(lat, lon));
  if (erdOrt && erdWeg(erdOrt, lat, lon) < 5) return;   // diese Kachel steht schon
  erdAuftrag = { lat, lon, seit: performance.now() };
  try {
    const treffer = erdCache.find(c => erdWeg(c, lat, lon) < c.halb * 0.35);   // schon gebaut: sofort aus dem Speicher
    const vor = !treffer && erdVorrat.get(erdZelle(lat, lon).key);   // im Hintergrund schon geholt (Kachel voraus)
    const daten = treffer ? structuredClone(treffer.daten) : vor ? await vor : await ortBestellen(lat, lon, { halb: ERD_HALB });
    if (vor) erdVorrat.delete(erdZelle(lat, lon).key);
    // ohne Straßen und fast ohne Häuser kein Ort (sonst lag im Hochgebirge oder auf dem Meer eine leere Platte mit Wänden): dort bleibt die Kugel
    // Seit 06.11.2026 nur noch auf dem Meer: Wüste, Eis und Gebirge bekommen einen Ort aus reinem Gelände, sonst konnte man dort nicht aussteigen (Sahara, Grönland)
    if (!daten.strasse.length && daten.gebaeude.length < 5 && (daten.baeume?.length || 0) < 300 && !daten.waldKarte && (erdWelt?.erde?.meerBei(lat, lon) ?? 1) > 0.5) { erdLeer.push({ lat, lon, halb: ERD_HALB }); if (erdLeer.length > 24) erdLeer.shift(); return; }
    if (!treffer) { erdCache.unshift({ lat: daten.meta.lat, lon: daten.meta.lon, halb: daten.meta.groesse / 2, daten: structuredClone(daten) }); if (erdCache.length > 6) erdCache.pop(); }
    const A = gebaut.get('erde'); if (A) await erdOrtWechsel(A, daten);
    if (!treffer) erdBauDauer = THREE.MathUtils.clamp(0.6 * erdBauDauer + 0.4 * (performance.now() - erdAuftrag.seit) / 1000, 1.5, 15);
  } catch (e) { console.warn('Ort nicht gebaut', e); erdOrtFehler = performance.now(); if (e.haengt) { const z = erdZelle(lat, lon).key; erdHaenger.set(z, (erdHaenger.get(z) || 0) + 1); if (erdHaenger.get(z) >= 2) { erdLeer.push({ lat, lon, halb: ERD_HALB }); if (erdLeer.length > 24) erdLeer.shift(); } } }   // zweimal gehangen: an dieser Stelle nicht noch einmal versuchen
  finally { erdAuftrag = null; }
}
function erdOrtEntsorgen(alt) { ortFotoFrei(alt.szene.fotoU); alt.szene.ort.entsorgen(); alt.gruppe.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); alt.gruppe.removeFromParent(); }
function erdOrtWeg(A = gebaut.get('erde')) {
  const alt = erdOrt; if (!alt) return;
  if (spiel.modus === 'fuss' || spiel.modus === 'fahren') spielBeenden();
  A.update = null; A.lod = null; A.kollision = null; A.innenwelt = null; A.verkehr = null; A.szenen = null; A.menge = null; A.schattenFolgen = false;
  erdOrtEntsorgen(alt); erdOrt = null; erdRegime = 'kugel';
  if (aktiv === A) document.getElementById('spielen').style.display = 'none';
}
// neuer Ort: in einem eigenen Ansichtsobjekt in Scheiben bauen (unsichtbar), Shader vorab übersetzen, dann in einem Bild tauschen
async function erdOrtWechsel(A, daten) {
  schilderSprache(daten.meta.iso);   // Ladenschilder in der Sprache des Landes (kit/schilder.js)
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
  // Boden mit Satellitenbild abwarten (höchstens 1,5 s), sonst sah man beim Tausch kurz den neutralen Boden
  if (szene.fotoFertig) { const tF = performance.now(); await Promise.race([szene.fotoFertig, new Promise(r => setTimeout(r, 1500))]); log('fotoWarten', tF); }
  daten.meta.zeit.haupt = Math.round(performance.now() - tBau);   // Aufbau im Hauptthread (in Scheiben, mit Warten)
  // Vorbau (Wunsch Nr. 82, 08.11.2026, Nader: "Da soll sich nicht irgendwie was aufbauen"): die nahen Häuser des neuen Ortes entstehen schon vor dem
  // Tausch, unsichtbar, mit der Kamera im Rahmen des neuen Ortes (je Bild 5 ms, höchstens 3 s). Vorher standen nach jedem Tausch in der Nähe nur
  // Kisten, bis die Häuser nachgebaut waren (Überflug mit 250 km/h: voll 0, mittel 0, 53 Viertel in der Warteschlange direkt nach dem Tausch)
  // Auch das Zusammenlegen der Kacheln (kit/ort.js vereinen) läuft im Vorbau, sonst lagen die Zeichenaufrufe kurz nach dem Tausch bei 1188
  { const tV = performance.now(), kam = new THREE.Object3D(), O = szene.ort; og.updateMatrixWorld(true);
    const vereinOffen = () => { for (const k of O.kacheln.values()) { if (!k.kern || k.ganzFertig || !k.viertel.some(v => v.will !== 'fern')) continue; const L = k.viertel.filter(v => v.liste.length); if (L.length >= 2 && L.every(v => v.stufen.mittel)) return true; } return false; };
    while (performance.now() - tV < 3500) { kam.position.copy(camera.position); og.worldToLocal(kam.position); O.update(kam, 5); if (!O.warteschlange.length && !vereinOffen() && performance.now() - tV > 150) break; await new Promise(r => requestAnimationFrame(r)); }
    log('vorbau', tV); (A2.bauZeiten ||= {}).vorbau = Math.round(performance.now() - tV); }
  // Tausch in einem Bild, alten Ort freigeben. Spieler (Auto oder Figur) fährt nahtlos weiter (seit 29.10.2026, Wunsch Nr. 34): seine Lage
  // geht über die Welt (ECEF) in den neuen Rahmen, Tempo und Kamera bleiben, Kollision, Verkehr und Menschen kommen vom neuen Ort.
  // Vorher startete das Spiel neu (Sprung auf die nächste Fahrspur beim Blickpunkt, Naders Kritik "portet mich").
  if (spiel.wechsel?.fz) spiel.wechsel = null;
  const spieler = erdRegime === 'ort' && (spiel.modus === 'fuss' || spiel.modus === 'fahren') ? (spiel.auto || spiel.figur) : null;
  let halten = null, mit = null;
  if (spieler) {
    const zw = v => erdWelt.lokalZuWelt(v, new THREE.Vector3());
    polizei.merken(zw);
    mit = { p: zw(spieler.pos), a: zw(spieler.alt.pos), vorn: zw(_ev.copy(spieler.pos).addScaledVector(spieler.dir, 10)), rp: zw(spiel.rig.pos), rz: zw(spiel.rig.ziel), y0: spieler.pos.y };
  } else if (spiel.modus === 'fuss' || spiel.modus === 'fahren') { halten = { modus: spiel.modus, def: spiel.wahl }; spielBeenden(); }
  const alt = erdOrt; erdOrt = neu;
  const altV = A.verkehr, altM = A.menge;
  for (const k of ['menge', 'szenen', 'ort', 'verkehr', 'signale', 'update', 'kollision', 'startFussSuche', 'innenwelt', 'schattenFolgen', 'sonde', 'bauZeiten']) A[k] = A2[k];
  A.kollision.offen = (x, z) => erdBoden(x, z);   // hinter dem Rand des Ortes weiter auf der Kugel (bis der nächste Ort steht)
  const ort = szene.ort;
  A.lod = () => { if (erdRegime === 'ort') ort.update(camera); else { _ortKam.position.copy(camera.position); og.worldToLocal(_ortKam.position); ort.update(_ortKam); } };
  A.bodenHoehe = (x, z) => erdBoden(x, z);
  og.visible = true;
  // Autos und Menschen ziehen in den neuen Ort um (Kachelraster, Wunsch Nr. 36): Lage über die Szene vom alten in den neuen Rahmen
  if (alt && (altV || altM)) {
    alt.gruppe.updateMatrixWorld(true); og.updateMatrixWorld(true);
    const um = v => og.worldToLocal(alt.gruppe.localToWorld(v));
    const tU = performance.now();
    const vorher = { autos: altV?.alle.length || 0, menschen: altM?.alle.length || 0 };
    if (altV && A.verkehr) A.verkehr.uebernehmen(altV.alle.map(fz => { const pos = um(fz.pos.clone()), dir = um(fz.pos.clone().add(fz.dir)).sub(pos).setY(0).normalize(); return { typ: fz.typ, pos, dir, v: fz.v, tempoFaktor: fz.tempoFaktor, spin: fz.spin, farbe: fz.farbe }; }));
    if (altM && A.menge) A.menge.uebernehmen(altM, um);
    log('uebernehmen', tU);
    if (window.__messen) (window.__uebergabe ||= []).push({ ...vorher, autosMit: A.verkehr?.alle.length || 0, menschenMit: A.menge?.alle.length || 0, ms: Math.round(performance.now() - tU) });
  }
  if (alt) erdOrtEntsorgen(alt);
  const tT = performance.now();
  if (erdRegime === 'ort') erdAnkerAufOrt(neu);
  if (mit) { spielerUmsetzen(spieler, mit, A); polizei.umsetzen(erdWelt, A); }
  log('tausch', tT); window.__ereignis?.('ortTausch');
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
// Werbeflächen (Wunsch Nr. 59): nächste Fläche am Spieler und ihre Karte. Die Regeln stehen in kit/werbeflaechen.js, die Preise in daten/werbung/preise.json
let wfDaten = null, skyline = null, himmelstiere = null;
// Anklicken (Wunsch Nr. 61: "man kann die Werbung anschauen, auch anklicken und dann kommt man auch auf den Link"): kurzer Klick oder Tipp ohne Ziehen, Strahl aus der Kamera. Zuerst Banner an Wahrzeichen, dann die Flächen des Ortes
const _wfStrahl = new THREE.Raycaster(), _wfNdc = new THREE.Vector2(); let _wfAb = null;
// Echtes anklicken (kit/echtzeit.js): Flugzeug, Zug oder Schiff zeigt, was es wirklich ist, und beim Flugzeug kann man mitfliegen
function echtKlick(cx, cy) {
  if (!echtzeit || !erdWelt || !shell || spiel.jet) return false; const r = renderer.domElement.getBoundingClientRect(), fest = !!document.pointerLockElement, nx = fest ? 0 : (cx - r.left) / r.width * 2 - 1, ny = fest ? 0 : -((cy - r.top) / r.height) * 2 + 1;
  // Ereignisse liegen über den Flugzeugen und sind seltener: zuerst prüfen
  const e = weltgeschehen?.treffer(nx, ny, camera, erdWelt, erdHoehe); if (e) { shell.echtKarte(weltgeschehen.info(e)); return true; }
  const t = echtzeit.treffer(nx, ny, camera, erdWelt, erdHoehe); if (!t) return false; shell.echtKarte(echtzeit.info(t)); return true;
}
function mitfliegen(i) {
  if (!echtzeit || !erdKam) return; if (spiel.modus !== 'frei') spielBeenden(); echtzeit.mitfliegen(i, erdWelt); erdKam.folgen(() => echtzeit.folgeLage(), { narrow: 95, wide: 150, regional: 75 }[echtzeit.folge?.n] || 95); const L = echtzeit.folgeLage(); if (L) shell?.folgeChip(L);
}
function mitfliegenEnde() { if (!echtzeit?.folge) return; const L = echtzeit.folgeLage(); echtzeit.folge = null; erdKam.folgen(null); shell?.folgeChip(null); if (L) erdKam.fliegeZu({ lat: L.lat, lon: L.lon, dist: 26000, neigung: 40, kurs: erdKam.kurs }); }
function werbeKlick(cx, cy) {
  if (!erdOrt && !wahrzeichen) return false; const r = renderer.domElement.getBoundingClientRect(); if (document.pointerLockElement) _wfNdc.set(0, 0); else _wfNdc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); _wfStrahl.setFromCamera(_wfNdc, camera);
  const W = erdOrt?.szene?.ort?.werbung; let e = W?.treffer(_wfStrahl, camera.position) || null, dE = e ? camera.position.distanceTo(_wfP.set(e.x, e.yW ?? 0, e.z)) : Infinity;
  const ban = []; wahrzeichen?.gruppe?.traverse(o => { if (o.name?.startsWith('banner_') && o.parent?.visible) ban.push(o); }); if (ban.length) { _wfStrahl.far = 1200; const t = _wfStrahl.intersectObjects(ban, false)[0]; if (t && t.distance < dE) { const P = t.object.userData.premium; e = W?.liste.find(x => x.id === P.id) || { ...P, x: 0, z: 0, ry: 0, y0: 0, premium: true }; } }
  if (!e || !shell) return false; shell.werbeKarte(e); return true;
}
const _wfP = new THREE.Vector3();
function werbeNah() { const W = aktiv?.ort?.werbung || erdOrt?.szene?.ort?.werbung; if (!W) return null; const p = spiel.auto ? (spiel.auto.bildPos || spiel.auto.pos) : spiel.figur ? (spiel.figur.bildPos || spiel.figur.pos) : null; return p ? W.naechste(p.x, p.z) : null; }
function wfVorladen() { return wfDaten ??= Promise.all([fetch(new URL('../daten/werbung/preise.json', import.meta.url)).then(r => r.json()).catch(() => null), fetch(new URL('../daten/heute/countries.json', import.meta.url)).then(r => r.json()).then(j => new Map(j.countries.map(c => [c.iso2, c]))).catch(() => new Map())]); }
async function werbeInfo(e) {
  wfVorladen();
  if (!e.buchung && e.premium) { const B = await buchungenLaden(); e.buchung = B.flaechen.find(f => f.id === e.id) || null; }
  const [P, L] = await wfDaten, nah = orteListe.length ? ortNahe(orteListe, e.lat, e.lon) : null, land = L.get(e.iso), s = wfStufeHier({ pop: nah?.pop, metro: nah?.metro, hauptstadt: !!(nah?.flag & 1), km: nah?.km, premium: e.premium }), A = WF_ARTEN[e.art], fl = e.b * e.h, p = wfPreis(P, e.art, s, land?.gdppc, fl), st = wfStartPreis(P, e.art, s, land?.gdppc, fl), lk = e.buchung?.link;
  const ortT = [e.stadt || nah?.name, landName(land)].filter(Boolean).join(', ') || 'Unbekannt', grT = `${e.b.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} × ${e.h.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} m`, startT = st ? st.toLocaleString(LOCALE) + ' €' : null, regT = new URL(`register.html#${e.id}@${e.lat.toFixed(5)},${e.lon.toFixed(5)}`, location.href).href.replace(/^http:\/\/[^/]+/, 'https://nadercbz.github.io/earth-3d-game');
  return { code: wfCodeText(e.id), mail: wfMailLink(P?.kontaktMail, { code: e.id, art: e.name ? `${A.name}, ${e.name}` : A.name, ort: ortT, groesse: grT, stufe: `${WF_STUFEN[s].id}, ${WF_STUFEN[s].name}`, start: startT, register: regT }), motiv: e.buchung?.motiv ? new URL('../' + e.buchung.motiv, import.meta.url).href : null, link: /^https?:\/\//.test(lk || '') ? lk : null, start: startT, titel: e.name || A.name, art: A.name, ort: ortT, groesse: grT, stufe: WF_STUFEN[s].id, stufeName: WF_STUFEN[s].name, preis: p ? p.toLocaleString(LOCALE) + ' €' : null, register: `register.html#${e.id}@${e.lat.toFixed(5)},${e.lon.toFixed(5)}` };
}
function spielerGeo() {   // Lage des Spielers auf der Erde: Jet, Auto oder Figur
  if (spiel.modus === 'jet' && spiel.jet) return { lat: spiel.jet.flug.geo.lat, lon: spiel.jet.flug.geo.lon };
  if (spiel.modus === 'bord' && spiel.bord?.schiff) return { lat: spiel.bord.schiff.lat, lon: spiel.bord.schiff.lon };
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
  const J = spiel.modus === 'jet' ? spiel.jet : null, s = spiel.auto || spiel.figur, Bo = spiel.modus === 'bord' && spiel.bord?.schiff ? spiel.bord.schiff : null;
  const zeigen = !!(J || Bo || ((spiel.modus === 'fahren' || spiel.modus === 'fuss') && s));
  minikarte.zeigen(zeigen); document.body.classList.toggle('mitziel', !!navi.ziel);
  const feld = $('erdfeld'), ph = zeigen ? (MOBIL ? 'Ziel eingeben (Navigation)' : 'Ziel eingeben (Navigation, Taste N)') : 'Ort oder Wahrzeichen suchen (171.654 Orte)';
  if (feld && feld.placeholder !== ph) feld.placeholder = ph;
  if (!zeigen) return;
  camera.getWorldDirection(_mkDir);   // die Karte dreht mit der Kamera (wie GTA), der Pfeil zeigt die Richtung des Spielers dazu
  const kurs = (Math.atan2(_mkDir.x, -_mkDir.z) / D2R + 360) % 360;
  let richtung, kmh, zoom;
  if (Bo) { richtung = Bo.kurs / D2R; kmh = Bo.v * 3.6; zoom = 11.5; }
  else if (J) { richtung = J.flug.kurs; kmh = J.flug.kmh; const hG = Math.max(30, J.flug.geo.h - erdBodenGeo(blick.lat, blick.lon)); zoom = THREE.MathUtils.clamp(16.3 - Math.log2(hG / 100) - 0.4 * Math.log2(1 + kmh / 500), 2.5, 15.5); }
  else { const d = s.bildDir || s.dir; richtung = (Math.atan2(d.x, -d.z) / D2R + 360) % 360; kmh = spiel.auto ? spiel.auto.kmh : s.v * 3.6; zoom = spiel.auto ? 15.4 - 0.9 * Math.log2(1 + kmh / 50) : 16.2; }   // rund 280 m Umkreis im Stand, bei 100 km/h rund 560 m
  minikarte.update({ lat: blick.lat, lon: blick.lon, kurs, pfeil: richtung - kurs, zoom, dt, ziel: navi.ziel, route: navi.route, jet: !!J, punkte: muenzen?.karte });
  navi.update(blick, kurs, spiel.modus, kmh, dt);
}
function erdKamera(dt) {   // freie Kamera der Erde: Flug, Tasten, Nachlauf, Zoom, dann Lage setzen
  eingabe.achse(_ach);
  echtzeit?.bild(); erdKam.tick(dt, { x: _ach.x, y: _ach.y, schnell: eingabe.an('schnell'), hoch: (eingabe.an('runter') ? 1 : 0) - (eingabe.an('hoch') ? 1 : 0) });
  erdKam.anwenden(camera);
}
function erdTick(dt) {
  const W = erdWelt, A = aktiv; if (!W) return;
  const frei = spiel.modus === 'frei';
  if (!frei) erdKam.flug = null;
  // Ziel: in der freien Kamera ihr Zielpunkt, im Spiel die Figur oder das Auto
  const J = spiel.modus === 'jet' ? spiel.jet : null;
  const B = spiel.modus === 'bord' ? spiel.bord : null;
  W.erde.imFlug = !!erdKam.flug;
  const s = spiel.figur || spiel.auto, blick = J ? { lat: J.flug.geo.lat, lon: J.flug.geo.lon } : B?.schiff ? { lat: B.schiff.lat, lon: B.schiff.lon } : !frei && s ? W.lokalZuGeo(s.pos) : { lat: erdKam.lat, lon: erdKam.lon };
  let hA;
  if (frei) hA = erdKam.hoehe;
  else if (J || B) { const g = W.lokalZuGeo(camera.position); hA = g.h - erdBodenGeo(g.lat, g.lon); if (J?.wasser) hA = Math.max(hA, 1.5); }
  else hA = camera.position.y - erdBoden(camera.position.x, camera.position.z);
  erdHoehe = hA;
  const wegVomOrt = erdWeg(erdOrt, blick.lat, blick.lon);
  // Anker: im Ort seine Mitte, sonst wandert er mit der Kamera (alle 20 km); im Jet immer mit der Kamera
  const imOrt = !J && (!B || B.imOrt) && erdOrt && wegVomOrt < erdOrt.halb * 0.85 && hA < 3000;
  if (imOrt && erdRegime !== 'ort') { erdRegime = 'ort'; erdAnkerAufOrt(erdOrt); }
  else if (!imOrt && erdRegime === 'ort' && (frei || J || B)) erdRegime = 'kugel';
  if (erdRegime === 'kugel' && camera.position.length() > (J || B ? 12000 : 20000)) {
    const g = W.lokalZuGeo(camera.position); W.setzeAnker(g.lat, g.lon, W.bodenGeo(g.lat, g.lon));
    if (J) jetSzene(); else if (!B) erdKam.anwenden(camera);
    BREITE = g.lat; erdStundeSetzen();
  }
  if (erdOrt && erdRegime !== 'ort') { W.rahmenVon(erdOrt.anker, erdOrt.gruppe); erdOrt.mitteLokal.copy(erdOrt.gruppe.position); if (!erdKam.flug && (hA > 80000 || wegVomOrt > 40000)) erdOrtWeg(A); }
  if (A) A.ruht = erdRegime !== 'ort' && hA > 3000;   // Verkehr und Menschen pausieren hoch über dem Ort
  if (aktiv === A) { const zeigen = erdRegime === 'ort' ? '' : 'none'; const sp = document.getElementById('spielen'); if (sp.style.display !== zeigen) sp.style.display = zeigen; }
  // Ort bestellen, sobald das Ziel ruhig ist und die Kamera tief genug (im Spiel ohne Warten)
  const bewegt = erdWeg(erdStabil, blick.lat, blick.lon) / Math.max(dt, 1e-3);
  erdStabil.t = bewegt < Math.max(40, erdKam.dist * 0.2) ? erdStabil.t + dt : 0; erdStabil.lat = blick.lat; erdStabil.lon = blick.lon;
  const jetBaut = B?.ortErlaubt === false ? false : !J || (J.flug.geo.h - erdBodenGeo(blick.lat, blick.lon) < 1700 && J.flug.kmh < 450 && !(J.wasser && J.flug.geo.h < -35));   // im Jet nur tief und langsam (sonst ist er vorbei, bevor der Ort steht)
  const leer = erdLeer.some(l => erdWeg(l, blick.lat, blick.lon) < l.halb * 0.6);
  // im Auto früher und voraus bestellen: Mitte dort, wo es nach rund einer Bauzeit ist (höchstens 0,55 der halben Kante), sobald es 0,3 der halben
  // Kante von der Mitte weg ist und sich weiter entfernt. So steht der neue Ort, bevor der alte endet (Wunsch Nr. 34)
  let bestell = blick, ortWeit = erdAndereZelle(erdOrt, blick.lat, blick.lon);
  if (spiel.modus === 'fahren' && spiel.auto && erdOrt && erdRegime === 'ort') {
    const Wa = spiel.auto, v = Math.abs(Wa.vLong), rx = Wa.pos.x - erdOrt.mitteLokal.x, rz = Wa.pos.z - erdOrt.mitteLokal.z;
    // in Fahrt entscheidet nur der Punkt voraus (sonst bestellte das Auto nach dem Wechsel gleich wieder die Kachel, aus der es kommt);
    // im Stand erst, wenn es mehr als 0,75 der halben Kante von der Mitte weg ist
    ortWeit = v > 2 ? false : wegVomOrt > erdOrt.halb * 0.75;
    if (v > 2 && (rx * Wa.dir.x + rz * Wa.dir.z) * Math.sign(Wa.vLong) > 0) {
      _ev.copy(Wa.pos).addScaledVector(Wa.dir, Math.sign(Wa.vLong) * Math.min(ERD_HALB * 0.7, v * (erdBauDauer * 1.4 + 1))); const vor = W.lokalZuGeo(_ev);
      if (erdAndereZelle(erdOrt, vor.lat, vor.lon)) { ortWeit = true; bestell = vor; }
    }
  }
  { const v = B?.ortVoraus; if (v) { ortWeit = erdAndereZelle(erdOrt, v.lat, v.lon); bestell = v; } }
  tierWunschTick(blick); tierChipTick(dt);
  if (!erdKam.flug && jetBaut && !leer && hA < ERD_BAUHOEHE && !erdAuftrag && (erdStabil.t > 0.35 || !frei) && performance.now() - erdOrtFehler > 6000 && ortWeit) erdOrtLaden(bestell.lat, bestell.lon);
  // Kachel voraus im Hintergrund holen (der Worker baut die Daten, der Wechsel muss dann nur noch zeichnen): im Auto in Fahrtrichtung, zu Fuß
  // und in der freien Kamera die nächste Nachbarkachel zum Blickpunkt. Immer nur eine auf einmal, nie während ein Ort bestellt ist
  if (erdOrt && !erdAuftrag && !erdVorratLaeuft && erdRegime === 'ort' && hA < ERD_BAUHOEHE && !J) {
    const Wa = spiel.auto, vorP = Wa && Math.abs(Wa.vLong) > 2 ? W.lokalZuGeo(_ev.copy(Wa.pos).addScaledVector(Wa.dir, Math.sign(Wa.vLong) * ERD_HALB * 0.85)) : blick;
    const dx = (vorP.lon - erdOrt.lon) * erdOrt.kLon, dz = (vorP.lat - erdOrt.lat) * erdOrt.kLat;
    if (Math.max(Math.abs(dx), Math.abs(dz)) > ERD_HALB * 0.2) {
      const ziel = Math.abs(dx) > Math.abs(dz) ? erdZelle(erdOrt.lat, erdOrt.lon + Math.sign(dx) * ERD_HALB / erdOrt.kLon) : erdZelle(erdOrt.lat + Math.sign(dz) * ERD_HALB / erdOrt.kLat, erdOrt.lon);
      if (!erdVorrat.has(ziel.key) && !erdCache.some(c => erdWeg(c, ziel.lat, ziel.lon) < 5) && !erdLeer.some(l => erdWeg(l, ziel.lat, ziel.lon) < l.halb * 0.6)) {
        erdVorratLaeuft = true;
        const p = ortBestellen(ziel.lat, ziel.lon, { halb: ERD_HALB }); erdVorrat.set(ziel.key, p);
        p.catch(() => erdVorrat.delete(ziel.key)).finally(() => { erdVorratLaeuft = false; if (erdVorrat.size > 4) erdVorrat.delete(erdVorrat.keys().next().value); });
      }
    }
  }
  // weicher Boden: solange hier noch kein Ort steht, hält die Kamera rund 900 m Abstand (danach zoomt sie von selbst weiter); in leerem Gelände nicht
  erdKam.bodenAbstand = frei && !erdKam.folge && !leer && (!erdOrt || wegVomOrt > ERD_HALB * 0.8) && performance.now() - erdOrtFehler > 6000 ? 900 : 0;
  controls.target.copy(frei ? W.geoZuLokal(erdKam.lat, erdKam.lon, erdKam.boden, _ev) : J ? J.modell.position : B ? B.figurWelt(_ev) : s ? (s.bildPos || s.pos) : controls.target);   // Blickpunkt für Schatten, Verkehr und Dunst (im Auto und zu Fuß der Spieler: vorher blieb er am Startpunkt stehen, die Autos fuhren dort und nach ein paar Kilometern gab es keinen Verkehr mehr)
  // Himmel, Dunst, Nah und Fern nach der Höhe (Skill threejs-large-worlds): weich, ohne Sprung
  const abst = frei ? Math.min(erdKam.dist, camera.position.distanceTo(controls.target)) : camera.position.distanceTo(controls.target);
  const himmel = 1 - THREE.MathUtils.smoothstep(hA, 9000, 70000);   // Himmel blendet zwischen 9 und 70 km ins Schwarz des Alls
  SU.uHimmel.value = himmel;
  SU.uZirren.value = (0.3 + 0.55 * wetterJetzt.wolken) * (1 - THREE.MathUtils.smoothstep(hA, 7000, 12000)); SU.uZeit.value += dt;   // Federwolken der Kuppel (Handy und über den Wolkenbergen)
  sky.visible = wetterJetzt.nebel < 0.6 && himmel > 0.003; scene.background = sky.visible || hA > 9000 ? null : scene.fog.color;
  sky.position.copy(camera.position);
  erdKamMeer = W.lokalZuGeo(camera.position).h;
  const uwJetzt = !!spiel.uwAn, innenSz = !!B?.szene, atmosAn = !MOBIL && hA < 90000; atmosPass.enabled = atmosAn && !window.__ohneLuft && !innenSz;   // Rechner: Luftperspektive aus der Tiefe statt Nebel der Materialien
  if (atmosAn) { scene.fog.near = 1e8; scene.fog.far = 2e8; atmosPass.update(camera, { hoehe: erdKamMeer, beta: THREE.MathUtils.lerp(THREE.MathUtils.lerp(1 / 40000, 1 / 16000, Math.min(1, wetterJetzt.wolken * 1.2)), 1 / 320, wetterJetzt.nebel * wetterJetzt.nebel), ao: S.ao && hA < 1500 ? 0.9 : 0, dunst: 1 - THREE.MathUtils.smoothstep(hA, 40000, 90000), strahlen: uwJetzt ? 0 : 0.42 * (1 - 0.85 * wetterJetzt.wolken) * (1 - THREE.MathUtils.smoothstep(hA, 3000, 14000)) }); }
  else if (J) { scene.fog.near = Math.max(2500, hA * 3); scene.fog.far = scene.fog.near + 22000 + hA * 25; }   // im Jet weite Sicht (der Dunst der Kugel macht die Ferne)
  else { scene.fog.near = Math.max(MOBIL ? 420 : 650, abst * 0.95, hA * 3); scene.fog.far = scene.fog.near + (MOBIL ? 1250 : 3000) + hA * 25; if (meer?.nah && !erdOrt) scene.fog.far = Math.max(scene.fog.far, Math.min(30000, Math.sqrt(hA * 12.74e6) * 0.7)); }   // 03.11.2026 weiter: Häuser bis rund 3,6 km sichtbar. Über offener See bis zum Horizont: Kacheln nur aus Meer kosten kaum etwas, sonst endet das Wasser in einem hellen Streifen
  if (uwJetzt && MOBIL && unterwasser) { scene.fog.near = 0.5; scene.fog.far = 70; scene.fog.color.copy(unterwasser.nebelFarbe); sky.visible = false; scene.background = scene.fog.color; }   // Handy: kein AtmosPass
  const horizont = Math.sqrt(Math.max(1, hA) * (2 * 6371000 + Math.max(1, hA)));
  camera.near = J ? THREE.MathUtils.clamp(abst * 0.12, 0.25, 3) : B ? 0.1 : THREE.MathUtils.clamp(Math.max(abst * 0.004, hA * 0.0015), 0.1, 5000);
  SU.uUnten.value = atmosAn ? atmos.bodenFarbe : scene.fog.color;
  camera.far = atmosAn ? Math.max(6000, horizont * 1.3 + 40000) : Math.max(6000, Math.min(horizont * 1.3 + 40000, scene.fog.far * 1.6 + 2000));
  camera.updateProjectionMatrix();
  gtao.enabled = false;   // Erde: keine Verdeckung (das erste Einschalten übersetzte 6 Shader und stockte 430 ms, dazu doppelte Szene je Bild)
  bloom.enabled = !MOBIL;   // nachts von oben tausende Fenster: Glanz nur auf Augenhöhe, weich zurückgenommen statt hart geschaltet (sonst sprang das Bild bei 60 m)
  bloom.strength = bloomBasis * (nacht >= 0.5 ? 1 - THREE.MathUtils.smoothstep(hA, 40, 180) : 1);
  { const raumL = THREE.MathUtils.smoothstep(hA, 800000, 4000000);   // Weltraum Look (Nr. 75): Stadtlichter und Sonne glühen aus dem All, tiefe Schwärze, Vignette
    bloom.threshold = THREE.MathUtils.lerp(nacht > 0.5 ? 0.9 : 1.25, 0.8, raumL); if (raumL > 0) { bloom.strength = Math.max(bloom.strength, 0.32 * raumL); bloom.radius = 0.5 + 0.1 * raumL; }
    farbe.uniforms.uKontrast.value = 1.1 + 0.1 * raumL; farbe.uniforms.uVignette.value = 0.12 + 0.18 * raumL; farbe.uniforms.uSaett.value = 1.08 - 0.06 * raumL; }
  sterne.mesh.scale.setScalar(Math.max(1, camera.far * 0.9 / 5000));
  W.erde.mat.uniforms.uHell.value = 0.95 / belichtung;   // Kugel unabhängig von der Belichtung des Dashboards (Nachbearbeitung mit ACES)
  // Wolkenberge am Rechner: unter 40 km, solange der Himmel zu sehen ist; die Decke wird dann zu dünnen Federwolken in 9 km
  if (!MOBIL && !wolkenberge) { wolkenberge = new Wolkenberge({ renderer, uWolken: W.erde.mat.uniforms.uWolken, atmos }); wolkenberge.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); wolkenberge.atmosPass = atmosPass; composer.insertPass(wolkenberge, 2); }
  const bergeAn = !!wolkenberge && hA < 66000 && sky.visible && !window.__ohneWolken && !uwJetzt && !innenSz;
  W.deckeDuenn = bergeAn ? 1 - THREE.MathUtils.smoothstep(hA, 16000, 62000) : 0;   // weich: Wolkenberge und Decke überblenden zwischen 62 und 16 km (Wunsch Nr. 56)
  W.update(camera, { sonne: sunDir, nebel: [scene.fog.near * (1 - 0.78 * wetterJetzt.nebel), scene.fog.far], nebelFarbe: scene.fog.color, ort: erdOrt, hoeheUeberGrund: hA, bodenGeo: blick, dt, wolkenWetter: wetterJetzt.wolken });
  weltraum ||= new Weltraum(scene); weltraum.update(camera, { welt: W, sonne: sunDir, hoehe: hA, utc: erdUtc });   // Sterne, Milchstraße, Sonne und Mond aus dem All (Nr. 75)
  live.update(dt, blick.lat, blick.lon, { amMeer: !!meer?.nah || (meer ? W.erde.meerBei(blick.lat, blick.lon) > 0.2 : false), hoehe: hA });
  if (wetterLive && live.ziel) wetterZiel = live.ziel;
  WETTER_K.uWetterKEin.value = WETTER_K.tWetterK.value ? THREE.MathUtils.smoothstep(hA, 120000, 700000) : 0;
  if (!meer) meer = new Meer({ renderer, welt: W, gruppe: A.gruppe, mobil: MOBIL, atmos });
  { const S = meer.seegang, q = wetterLive ? live.seegang : null; S.hoehe = q?.hoehe ?? null; S.periode = q?.periode ?? null; S.richtung = q?.richtung ?? null; S.wind = wetterLive ? (live.daten?.wind_speed_10m ?? null) : null; }
  meer.update(dt, { camera, hA, sonne: sunDir, nacht, wetter: wetterJetzt.wolken, regen: wetterJetzt.regen, mond: atmos.mondDir, ort: erdOrt });
  // Unter Wasser (kit/unterwasser.js): Boden, Fische, Licht. Die Kugel und das Wellennetz sieht man von unten nicht, die Oberfläche zeichnet der AtmosPass
  if (J?.wasser && unterwasser) {
    const gc = W.lokalZuGeo(camera.position), spC = wasserSpiegel(gc.lat, gc.lon), F = J.flug, wlC = meer.karteGut && meer.nah ? meer.hoeheBei(camera.position) * (spiel.wellenF ?? 1) : 0, tiefF = Math.max(0, J.sp - F.geo.h), tag = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.2);
    let lampe = J.art === 'uboot' ? THREE.MathUtils.smoothstep(tiefF, 12, 50) : J.art === 'schwimmer' ? THREE.MathUtils.smoothstep(tiefF, 40, 120) * 0.55 : 0; lampe = Math.max(lampe, (1 - tag) * THREE.MathUtils.smoothstep(tiefF, 1, 5) * (J.art === 'uboot' ? 1 : J.art === 'schwimmer' ? 0.55 : 0)); J.lampe = lampe;
    W.weltZuLokal(F.p, _ev); const lp = _ev.clone(), ld = new THREE.Vector3(0, 0, 1).applyQuaternion(J.modell.quaternion); if (J.art === 'uboot') ld.y -= 0.22; ld.normalize(); if (J.art === 'uboot') lampe *= 1.7;
    const wasAn = spiel.uwAn; spiel.uwAn = unterwasser.update(dt, { camera, W, lat: gc.lat, lon: gc.lon, h: gc.h, spiegel: spC, wellen: wlC, sonne: sunDir, lampe, lampeP: lp, lampeD: ld, pass: MOBIL ? null : atmosPass });
    uwLicht = spiel.uwAn;
    if (spiel.uwAn !== wasAn) { W.erde.gruppe.visible = !spiel.uwAn; ton.unterWasser(spiel.uwAn); if (spiel.uwAn) effekte?.gischt(camera.position.x, camera.position.y, camera.position.z, 0, 1, 0, 0.5, 0.2, true); }
    if (spiel.uwAn) meer.mesh.visible = false;
    const kg = J.modell.userData.kegel; if (kg) { kg.visible = lampe > 0.03 && spiel.uwAn; kg.material.uniforms.uK.value = lampe; }
  } else if (spiel.uwAn) { spiel.uwAn = false; uwLicht = false; unterwasser.aus(atmosPass); W.erde.gruppe.visible = true; ton.unterWasser(false); }
  if (!schiffe) schiffe = new Schiffe({ renderer, welt: W, gruppe: A.gruppe, meer, mobil: MOBIL, ton });
  schiffe.effekte = effekte; (schiffe.boot ||= { F: null, s: { d: null, spur: [], seit: 0, v: 0, band: null } }).F = J?.wasser && J.art !== 'schwimmer' && !J.flug.unter && !J.einflug ? J.flug : null; schiffe.update(dt, { camera, hA, nacht, blick, wind: wetterJetzt.wind });
  if ((spiel.tGang = (spiel.tGang || 0) - dt) < 0) { spiel.tGang = 0.8; for (const q of schiffe.liste) if (q.plan && q.modell) { const nah = q.fahrplan.liegt && (q.lat - blick.lat) ** 2 + (q.lon - blick.lon) ** 2 < 0.0009; if (nah) { const sgK = schiffe.kaiSeite(q), k0 = q.kurs, lx = -Math.cos(k0), ly = Math.sin(k0); if (erdOrt && erdWeg(erdOrt, q.lat, q.lon) < erdOrt.halb * 0.9 && !q.abGemessen) { let ab = null; for (let d0 = 19; d0 < 90; d0 += 1.2) { const la = q.lat + ly * sgK * d0 / 111320, lo = q.lon + lx * sgK * d0 / (111320 * Math.cos(q.lat * D2R)); if (erdBodenGeo(la, lo) > 0.9) { ab = d0; break; } } if (ab) { q.abGemessen = ab; if (q.gang) { q.modell.remove(q.gang); q.gang = null; } } } const f = schiffe.gangFuss(q); schiffe.gangwaySetzen(q, true, THREE.MathUtils.clamp(erdBodenGeo(f.lat, f.lon), 0.6, 8)); } else { if (q.gang) schiffe.gangwaySetzen(q, false); q.abGemessen = 0; } } }
  if (!leben) leben = new Leben(scene);
  if (!tiere) tiere = new Tiere(scene, { mobil: MOBIL });
  if (!meerestiere) meerestiere = new Meerestiere(scene, { mobil: MOBIL });
  meerestiere.update(dt, camera, W, blick, hA, !B);
  if (!himmelstiere) himmelstiere = new Himmelstiere(scene, { mobil: MOBIL });
  himmelstiere.update(dt, W, blick, hA, THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.15) * (wetterJetzt.regen < 0.5 ? 1 : 0), (la, lo) => erdBodenGeo(la, lo), monatJetzt());
  if (!echtzeit) { echtzeit = new Echtzeit(scene, { mobil: MOBIL }); echtzeit.beiFolgeEnde = grund => { if (erdKam) erdKam.folgen(null); shell?.folgeChip(null); if (grund) shell?.tipp(grund, 4); }; }
  echtzeit.update(dt, { camera, welt: W, blick, hA, nacht, tag: THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.15), hell: W.erde.mat.uniforms.uHell.value * 0.69, an: !B });
  if (echtzeit.folge && (spiel.tFolge = (spiel.tFolge || 0) - dt) < 0) { spiel.tFolge = 0.4; const L = echtzeit.folgeLage(); if (L) shell?.folgeChip(L); }
  { const ez = $('echtstatus'), zl = echtzeit.statusZeile || ''; if (ez && ez._t !== zl) { ez._t = zl; ez.textContent = zl; } }
  if (!weltgeschehen) { weltgeschehen = new Ereignisse(scene, { mobil: MOBIL }); shell?.weltgeschehenKnopf?.(); shell?.tierKnopf?.(); }
  weltgeschehen.update(dt, { camera, welt: W, blick, hA, sonne: sunDir, nacht, tag: THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.15), boden: (la, lo) => erdBodenGeo(la, lo), an: !B && !document.body.classList.contains('titel') });   // Titelbild ohne Marken (Nr. 75)
  if (!MOBIL) { stadtschatten ||= new Stadtschatten(renderer); if (atmosPass.enabled && !innenSz) stadtschatten.update(dt, { welt: W, ort: erdOrt?.szene?.ort, kamera: camera, hA, pass: atmosPass, sonneY: sunDir.y, nah: { x: schattenZiel.x, z: schattenZiel.z, r: schattenRadius } }); }
  if (!weltobjekte) weltobjekte = new Weltobjekte(scene, { mobil: MOBIL });
  weltobjekte.update(dt, camera, W, blick, hA, nacht, (la, lo) => erdBodenGeo(la, lo));
  if (!skyline) skyline = new Skyline(scene, { mobil: MOBIL });
  skyline.update(dt, W, blick, hA, hA < (MOBIL ? 3000 : 9000) ? W.kistenFern * 0.92 : 0, (la, lo) => erdBodenGeo(la, lo));
  if (!wahrzeichen) wahrzeichen = new Wahrzeichen(scene, { mobil: MOBIL });
  wahrzeichen.update(dt, W, blick, hA, (la, lo) => erdBodenGeo(la, lo), erdRegime === 'ort' ? erdOrt : null); wahrzeichen.raeder(dt, W, blick, hA, (la, lo) => erdBodenGeo(la, lo), erdRegime === 'ort' ? erdOrt : null);
  { const sp = spiel.auto ? (spiel.auto.bildPos || spiel.auto.pos) : spiel.figur ? (spiel.figur.bildPos || spiel.figur.pos) : null, ortAn = erdRegime === 'ort' && hA < 180 && erdOrt;
    tiere.update(dt, camera.position, { knoten: ortAn ? erdOrt.daten.wege.knoten : null, menge: ortAn ? A?.menge : null, H: erdBoden, tag: THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.15), spieler: sp, spielerR: spiel.auto ? 12 : 3.5, an: !!ortAn && wetterJetzt.regen < 0.5 }); }
  leben.update(dt, camera, W, { boden: erdBoden, tag: THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.15), hoeheUeberGrund: hA, hell: W.erde.mat.uniforms.uHell.value * 0.69, an: wetterJetzt.regen < 0.5, fliegerAus: !!echtzeit?.fluegeLeben() });
  { const wk = erdRegime === 'ort' && erdOrt && hA < 70 && !J && !B ? erdOrt.daten.waldKarte : null; let z = 0; if (wk) { const hb = erdOrt.halb, i = Math.floor((camera.position.x + hb) / (2 * hb) * wk.n), j = Math.floor((camera.position.z + hb) / (2 * hb) * wk.n); if (i >= 0 && j >= 0 && i < wk.n && j < wk.n) z = wk.d[j * wk.n + i] / 255 * (1 - THREE.MathUtils.smoothstep(hA, 25, 70)); } erdWaldAuge += (z - erdWaldAuge) * (1 - Math.exp(-dt * 1.1)); }   // im Wald passt sich das Auge an
  if (wolkenberge) wolkenberge.update(W, camera, { kamHoehe: erdKamMeer, hoeheGrund: hA, sonne: sunDir, atmos, dt, an: bergeAn && !window.__ohneWolken, wetter: wetterJetzt.wolken, licht: wetterJetzt.licht, nacht, nahAus: frei ? 1400 : 0, ev: auge.ev, stadt: hA > 30000 ? 0 : 1, beta: THREE.MathUtils.lerp(1 / 15000, 1 / 320, wetterJetzt.nebel * wetterJetzt.nebel) });
  // Scheinwerfer und Rücklichter nachts (kit/nachtlicht.js): fahrende Autos im Ort und das eigene
  if (!scheinwerfer) { scheinwerfer = new Scheinwerfer({ max: MOBIL ? 60 : 200, mobil: MOBIL }); scene.add(scheinwerfer.gruppe); }
  const autosNacht = erdRegime === 'ort' && A?.verkehr && !A.ruht ? A.verkehr.alle.filter(f => f.pos.distanceToSquared(camera.position) < 250000) : [];
  for (const f of autosNacht) f.bremst = (f.a < -1.1 || Math.abs(f.v) < 0.2) && f.pos.distanceToSquared(camera.position) < 40000;
  if (spiel.auto) { const W3 = spiel.auto; W3.nacht = nacht > 0.5; autosNacht.push({ pos: W3.bildPos || W3.pos, dir: W3.bildDir || W3.dir, L: W3.L, B: W3.B, spieler: true, bremst: (W3.vLong > 0.5 && _ach.y < -0.1) || eingabe.an('bremse') }); }
  scheinwerfer.update(autosNacht, nacht);
  if (lampenLichter) {
    const lp = erdRegime === 'ort' && hA < 700 ? erdOrt?.szene.ort.lampen : null;
    lampenLichter.update(dt, lp || null, s ? (s.bildPos || s.pos) : camera.position, nacht);
    const Wa = spiel.auto;
    if (Wa && nacht > 0.05) { spielerSpot.intensity = 260 * nacht; const d = Wa.bildDir, p = Wa.bildPos; spielerSpot.position.set(p.x + d.x * Wa.L * 0.45, p.y + 0.75, p.z + d.z * Wa.L * 0.45); spielerSpot.target.position.set(p.x + d.x * 26, p.y - 0.4, p.z + d.z * 26); spielerSpot.target.updateMatrixWorld(); }
    else spielerSpot.intensity = 0;
  }
  minikarteUndNavi(dt, blick);
  parkenTick(dt);
  // Detail nach Leistung (Wunsch Nr. 66 und 70): wie weit Häuser in voller und mittlerer Stufe gebaut werden, richtet sich nach dem Rechner. Schnelle Rechner sehen mehr, langsame bleiben flüssig
  // Ruhige Weitsicht (Wunsch Nr. 82, 08.11.2026): die Stufengrenzen der Häuser wanderten alle 3 s mit der Bildrate (300 m mal 0,55 bis 1,2), Häuser an
  // der Grenze wechselten so auch im Stand den Stil. Jetzt zwei feste Stufen (1 und 0,8): erst nach 9 s klar zu langsamer Bilder kleiner, nach 30 s
  // schneller Bilder zurück, höchstens alle 20 s und nur, wenn sich die Kamera bewegt hat (dann fällt der Wechsel nicht auf)
  if (!MOBIL && erdOrt?.szene) { const Q = (spiel.q ||= { t: 0, s: 0, n: 0, f: 1, lang: 0, schnell: 0, seit: 0, p: camera.position.clone() }), O = erdOrt.szene.ort; Q.t += dt; Q.s += dt; Q.n++; Q.seit += dt;
    if (Q.t > 3) { const ms = Q.s / Q.n * 1000; Q.t = Q.s = Q.n = 0; Q.lang = ms > 30 ? Q.lang + 3 : 0; Q.schnell = ms < 14 ? Q.schnell + 3 : 0;
      const bewegt = Q.p.distanceToSquared(camera.position) > 400; Q.p.copy(camera.position);
      if (bewegt && Q.seit > 20) { if (Q.f > 0.8 && Q.lang >= 9) { Q.f = 0.8; Q.seit = 0; Q.lang = 0; } else if (Q.f < 1 && Q.schnell >= 30) { Q.f = 1; Q.seit = 0; Q.schnell = 0; } } }
    O.nahVoll = 105 * Q.f; O.nahMittel = 300 * Q.f; }
  if (erdOrt?.szene && !erdOrt.eingaengeDa && A?.kollision && (spiel.tEing = (spiel.tEing || 0) - dt) < 0) { spiel.tEing = 1; if (erdRegime === 'ort') eingaengeSetzen(erdOrt, A); }
  if (!effekte) { effekte = new Effekte(scene, { mobil: MOBIL }); }
  effekte.groesse(innerHeight * renderer.getPixelRatio(), camera.fov);
  effekte.update(dt, spiel.modus === 'fahren' ? spiel.auto : null, erdBoden, eingabe.an('bremse'));
  radio.update(spiel.modus === 'fahren' && !!shell?.aktiv);
  if (shell?.aktiv) { const was = polizei.update(dt, erdRegime === 'ort' ? A : null, spiel.auto, spiel.figur, camera); shell.sterne(polizei.stufe, !polizei.gesehen); if (polizei.neuerStern) { polizei.neuerStern = false; shell.tipp(polizei.stufe === 1 ? 'Die Polizei sucht dich' : 'Mehr Polizei unterwegs', 3); } if (was === 'gefasst') festnahme(); }
  if (shell?.aktiv) { muenzen ||= new Muenzen(scene, shell.stand.muenzen ||= {}); const s = spiel.auto || spiel.figur, c = muenzen.update(dt, spiel.modus === 'jet' ? null : erdOrt, erdRegime === 'ort' && aktiv?.kollision ? s?.pos : null, spiel.auto ? 3.2 : 1.7, erdBoden); if (c) { ton.muenze(); shell.zahlen(25, 'Münze gefunden'); } }
  { const W2 = spiel.auto || spiel.wasserPseudo, innenU = spiel.modus === 'bord' && !!spiel.bord?.szene, F2 = spiel.figur || (spiel.modus === 'bord' ? spiel.bord?.figur : null), hu = spiel.modus === 'fahren' && eingabe.an('hupe'); if (aktiv?.erde && erdWelt) { if ((tNatur -= dt) < 0) { tNatur = 1; const c0 = camera.position, gl = erdWelt.lokalZuGeo(c0), Er2 = erdWelt.erde, kl = Math.cos(gl.lat * D2R); let n = 0; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; if (Er2.meerBei(gl.lat + Math.sin(a) * 350 / 111000, gl.lon + Math.cos(a) * 350 / (111000 * kl)) > 0.5) n++; } natur.kueste = gl.h < 150 ? Math.min(1, n / 4) : 0; natur.tropen = Math.abs(gl.lat) < 24 ? 1 : 0; natur.stadt = erdOrt ? THREE.MathUtils.clamp(erdOrt.daten.gebaeude.length / 900, 0.08, 1) : 0.1; } } else { natur.kueste = 0; natur.tropen = 0; natur.stadt = 1; }
    ton.update(dt, { wald: innenU ? 0 : erdWaldAuge, kueste: innenU ? 0 : natur.kueste, tropen: innenU ? 0 : natur.tropen, stadtAnteil: innenU ? 0 : natur.stadt, modus: spiel.modus === 'bord' ? 'fuss' : spiel.wasserPseudo ? 'fahren' : spiel.jet?.wasser ? 'fuss' : spiel.modus, kmh: W2?.kmh || 0, drehzahl: W2?.drehzahl || 0, rpm: W2?.fassung >= 4 ? W2.rpm : 0, last: W2?.last, gas: W2?.gasEingabe || 0, schlupf: W2?.schlupfTon || 0, klasse: W2?.def?.klasse, tag: THREE.MathUtils.smoothstep(sunDir.y, -0.05, 0.1), regen: innenU ? 0 : wetterJetzt.regen, vFuss: F2?.v || 0, luft: F2?.luft, hupe: hu, boden: hA < 900 && !innenU, verkehr: A?.verkehr ? Math.min(1, A.verkehr.alle.length / 100) : 0 }); }
  if (shell?.aktiv && !auftraege) auftraege = new Auftraege({ szene: scene, welt: () => erdWelt, ort: () => erdOrt, spielerGeo, modus: () => spiel.modus, navi, ton, hud: shell.auftragHud, zahlen: (b, g) => shell.zahlen(b, g) });
  if (auftraege && spiel.modus === 'fahren') auftraege.update(dt, spiel.auto?.kmh || 0);
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
    const [tag, nacht] = await Promise.all([bildTexturWarten('../assets/erde/tag.jpg'), bildTexturWarten('../assets/erde/nacht.jpg')]);
    erdWelt = new ErdWelt({ renderer, gruppe: g, tag, nacht, mobil: MOBIL });
    erdKam = new ErdKamera(erdWelt); erdKam.bodenAn = erdBodenGeo;
    A.erde = erdWelt; A.radius = 420;
    if (erdUtc === null) { const d = new Date(); erdUtc = d.getUTCHours() + d.getUTCMinutes() / 60; }
    setTimeout(() => ladeOrteListe().then(l => { orteListe = l; }).catch(e => console.warn('Orte fehlen', e)), 2500);   // 3 MB, für Suche und Namen: nach dem ersten Bild
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

// Ladebildschirm erst nach 250 ms (03.11.2026, Nader: weißer Blitz): er hat einen hellen Hintergrund und erschien bei jedem Start von Fahren
// oder Zu Fuß für einen Augenblick, auch wenn Auto oder Figur schon geladen waren (auch beim automatischen Neustart nach einem Ortswechsel)
async function mitLader(text, arbeit) {
  const t = setTimeout(() => { ladetext(text); $('laden').classList.remove('weg'); }, 250);
  try { return await arbeit(); } finally { clearTimeout(t); $('laden').classList.add('weg'); }
}
async function waehleAnsicht(id, eintrag) {
  const A = gebaut.has(id) ? gebaut.get(id) : await mitLader(`${ANSICHTEN.find(a => a.id === id).name} wird gebaut`, async () => { await new Promise(r => setTimeout(r, 30)); return baueAnsicht(id); });
  if (aktiv && aktiv !== A) { spielBeenden(); aktiv.gruppe.visible = false; }
  aktiv = A; A.gruppe.visible = true; if (weltraum && !A.erde) weltraum.mesh.visible = false;
  // Farbgebung: die Vorlage (Kontrast 1,2 um 0,42) ist für gebaute Szenen. Auf der Erde bringt das Foto die Farben selbst mit, mit dem harten
  // Kontrast versanken Wald, Heide und Schatten fast in Schwarz (gemessen 29.10.2026 bei Beelitz)
  farbe.uniforms.uKontrast.value = A.erde ? 1.1 : 1.2; farbe.uniforms.uSaett.value = A.erde ? 1.08 : 0.88; farbe.uniforms.uVignette.value = A.erde ? 0.12 : 0.2; farbe.uniforms.uAufhell.value = A.erde ? 0.04 : 0;
  document.getElementById('spielen').style.display = A.kollision ? '' : 'none';
  document.body.classList.toggle('erde', !!A.erde);
  controls.maxDistance = A.erde ? 3200 : 1200;
  if (A.erde) { controls.enabled = false; erdStundeSetzen(); }
  else { atmosPass.enabled = false; scene.fog.near = 420; scene.fog.far = 1650; controls.enabled = true; BREITE = 52.51; camera.far = 6000; camera.updateProjectionMatrix(); sky.position.set(0, 0, 0); sterne.mesh.scale.setScalar(1); setTime(stunde); }
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
renderer.domElement.addEventListener('pointerdown', e => { _wfAb = { x: e.clientX, y: e.clientY, t: e.timeStamp }; });
renderer.domElement.addEventListener('pointerup', e => { const a = _wfAb; _wfAb = null; if (!a || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 7 || e.timeStamp - a.t > 450 || (spiel.jet && !spiel.jet.wasser) || shell?.pausiert) return; if (!(!spiel.jet && werbeKlick(e.clientX, e.clientY)) && !tierKlick(e.clientX, e.clientY) && !spiel.jet) echtKlick(e.clientX, e.clientY); });
const spiel = { modus: 'frei', figur: null, auto: null, rig: null, wahl: null, parken: {}, wechsel: null };
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
  // Flieger in der Leiste (Wunsch Nr. 48): Klick startet, nochmal Klick auf denselben beendet, Klick auf den anderen wechselt direkt an Ort und Stelle
  const flugKnopf = (id, art) => { const k = $(id); if (k) k.onclick = () => { if (spiel.modus === 'jet' && spiel.jet?.art === art) waehleModus('frei'); else jetStarten(art); }; };
  flugKnopf('jetknopf', 'jet'); flugKnopf('heliknopf', 'heli');
  for (const [art, id] of Object.entries(WASSER_KNOEPFE)) { const k = $(id); if (k) k.onclick = () => { if (spiel.modus === 'jet' && spiel.jet?.art === art) waehleModus('frei'); else wasserStarten(art).catch(e => console.warn(e)); }; }
  // Handy: alle vier hinter einem Knopf, in der Leiste ist kein Platz
  { const k = $('wasserwahl'); if (k) k.onclick = () => { const li = $('auswahl'); if (li.classList.contains('offen') && li.dataset.art === 'wasser') { li.classList.remove('offen'); return; } if (spiel.modus === 'jet' && spiel.jet?.wasser) { waehleModus('frei'); return; } li.dataset.art = 'wasser'; li.innerHTML = '<div class="titel">Aufs Wasser</div>'; for (const art of Object.keys(WASSER_KNOEPFE)) { const b = document.createElement('button'); b.textContent = WASSER_ARTEN[art].name; b.onclick = () => { li.classList.remove('offen'); wasserStarten(art).catch(e => console.warn(e)); }; li.appendChild(b); } li.classList.add('offen'); }; }
  const box = $('spielen');
  box.querySelectorAll('button[data-m]').forEach(b => { b.onclick = () => waehleModus(b.dataset.m); });
  document.querySelectorAll('#knoepfe button').forEach(b => {
    const t = b.dataset.t;
    if (t === 'ende') { b.onclick = () => { if (shell?.aktiv) shell.pause(true); else waehleModus('frei'); }; return; }
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
// Figuren je Land (Wunsch Nr. 49): für jedes Land einmal eine Auswahl aus seiner echten Bevölkerung (kit/voelker.js). Solange die Daten fehlen, die bisherigen Grundfiguren
const volkCache = new Map();
function voelkerQuellen(iso) {
  const k = iso || 'XX'; if (volkCache.has(k)) return volkCache.get(k);
  const p = (async () => {
    if (!(await voelkerLaden(new URL('../', import.meta.url)))) return menschenQuellen;
    geschichtenLaden(new URL('../', import.meta.url));   // Geschichten der Menschen (Nr. 76): Namen und Länderdaten im Hintergrund
    const seed = [...k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7), basen = MOBIL ? menschenQuellen.map(q => q.def.basis || q.def.id) : null, L = looksFuer(iso, MOBIL ? 10 : 24, seed, basen);
    const q = (await Promise.all(L.map((l, i) => lookQuelle(l, i)))).filter(Boolean);
    return q.length >= 4 ? q : menschenQuellen;
  })().catch(e => { console.warn('Völker', e); return menschenQuellen; });
  volkCache.set(k, p); return p;
}
async function spielStarten(m, def) {
  const A = aktiv; if (!A || !A.kollision) return;
  spielBeenden(); fahrt = null; folge = null;
  const fokusXZ = camera.position.distanceTo(controls.target) > 150 ? controls.target : camera.position;
  spiel.rig = new Verfolger(camera, A.kollision); spiel.wahl = def;
  if (m === 'fuss') {
    const quelle = menschenQuellen.find(q => q.def.id === def.id) || await mitLader('Figur wird geladen', () => loadPerson(def));
    if (!quelle) return;
    const start = A.startFussSuche ? A.startFussSuche(fokusXZ.x, fokusXZ.z) : A.startFuss;
    spiel.figur = new Figur({ quelle, bewegungen, kollision: A.kollision, start, menge: A.menge });
    A.gruppe.add(spiel.figur.obj);
    spiel.rig.yaw = start.ry + Math.PI; spiel.rig.pitch = 0.1; spiel.rig.distZiel = spiel.rig.dist = (MOBIL ? 3.6 : 3.1);
    if (A.verkehr) A.verkehr.spieler = spiel.figur;
  } else {
    const quelle = await mitLader('Fahrzeug wird geladen', () => ladeFahrzeug(def));
    if (!quelle || !A.verkehr) return;
    const start = fahrspurStart(A, fokusXZ.x, fokusXZ.z, def.laenge);
    spiel.auto = new Fahrer({ quelle, kollision: A.kollision, start, verkehr: A.verkehr, menge: A.menge });
    if (def.klasse === 'pkw' || def.klasse === 'lieferung') { const f = autoFarbe(Math.random(), def.klasse); lackSetzen(spiel.auto.obj, f); spiel.auto.farbe = f; }
    A.gruppe.add(spiel.auto.obj); spiel.auto.schaden = new Schaden(spiel.auto.obj, { L: def.laenge, B: def.breite, H: def.hoehe });
    spiel.rig.yaw = start.ry + Math.PI; spiel.rig.pitch = 0.12; spiel.rig.distBasis = (MOBIL ? 5.8 : 4.4) + def.laenge * 0.5; spiel.rig.distZiel = spiel.rig.dist = spiel.rig.distBasis;
    A.verkehr.spieler = spiel.auto;
  }
  spiel.modus = m; controls.enabled = false; eingabe.spiel = true;
  $('hilfe').textContent = HILFE[m]; $('hilfe').classList.add('an'); $('hud').classList.toggle('an', m === 'fahren');
  document.body.classList.add('spiel');
  document.querySelectorAll('#spielen button[data-m]').forEach(b => b.classList.toggle('an', b.dataset.m === m));
  const kb = document.querySelector('#knoepfe button[data-t="bremse"]'); if (kb) kb.textContent = m === 'fuss' ? 'Springen' : 'Bremse';   // dieselbe Taste, anderer Sinn
}
// An Bord des Kreuzers gehen (kit/kreuzer.js): die Figur läuft im Rahmen des Schiffs, die Welt zieht wie im Flieger mit
async function bordStarten(s, wo = {}) {
  if (!s?.modell || umsteigen) return false; umsteigen = true;
  try {
    const def = spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0], quelle = menschenQuellen.find(q => q.def.id === def.id) || await mitLader('Figur wird geladen', () => loadPerson(def)); if (!quelle) return false;
    kreuzer ||= new Kreuzer({ renderer, mobil: MOBIL, beiAussteigen: sg => bordVerlassen(sg), fahrplan: schiffe.fahrplan, uhrWeiter: h => { if (erdUtc !== null) { erdUtc += h; erdStundeSetzen(); } } });
    await mitLader('Das Schiff wird geladen', () => kreuzer.betreten({ schiff: s, quelle, bewegungen, ...wo }));
    if (spiel.modus !== 'frei') { const m = spiel.modus; const f = spiel.figur, a = spiel.auto; if (f) { f.entfernen(); spiel.figur = null; } if (a) { a.schaden?.entsorgen(); a.entfernen(); spiel.auto = null; } if (m === 'jet') jetEntfernen(); if (aktiv?.verkehr) aktiv.verkehr.spieler = null; }
    kreuzer.quellen = menschenQuellen.filter(q => q && q.def);
    spiel.modus = 'bord'; spiel.bord = kreuzer; controls.enabled = false; eingabe.spiel = true; fahrt = null; folge = null; if (erdRegime === 'ort') erdRegime = 'kugel'; camera.fov = 62; camera.updateProjectionMatrix();
    $('hilfe').textContent = MOBIL ? 'Stick: gehen · Ziehen: schauen' : 'W A S D: gehen · Shift: schneller · C: Ich Sicht · E: Aufzug, Gangway · T: Zeitraffer · Esc: Menü'; $('hilfe').classList.add('an'); document.body.classList.add('spiel'); return true;
  } finally { umsteigen = false; }
}
async function bordVerlassen(sg) {
  const q = kreuzer?.schiff; if (!q || umsteigen) return; const g = schiffe.gangFuss(q), k = q.kurs;
  umsteigen = true;
  try {
    const bereit = () => erdOrt && erdWeg(erdOrt, g.lat, g.lon) < erdOrt.halb * 0.92;
    if (!bereit()) { kreuzer.meldung?.('Der Hafen wird noch gebaut, einen Moment'); const t0 = performance.now(); while (!bereit() && performance.now() - t0 < 45000 && spiel.modus === 'bord') { if (!erdAuftrag) erdOrtLaden(g.lat, g.lon); await new Promise(r => setTimeout(r, 400)); } if (!bereit() || spiel.modus !== 'bord') return; }
    const def = spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0]; kreuzer.verlassen(); spiel.bord = null; camera.up.set(0, 1, 0); camera.fov = 40; camera.updateProjectionMatrix(); spiel.modus = 'frei'; erdRegime = 'ort'; erdAnkerAufOrt(erdOrt);
    await spielStarten('fuss', def); const f = spiel.figur, A = aktiv;
    if (f) { const l = erdWelt.geoZuLokal(g.lat, g.lon, 0, new THREE.Vector3()); let x = l.x, z = l.z; if (!A.kollision.frei(x, z) && A.startFussSuche) { const p = A.startFussSuche(x, z); x = p.x; z = p.z; } f.pos.set(x, A.kollision.hoehe(x, z), z); f.bildSetzen?.(); ton.tuer?.(); }
  } finally { umsteigen = false; }
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
  blaseZu();
  spiel.wechsel = null; spiel.ausWunsch = false;
  if (spiel.modus === 'frei') return;
  if (spiel.figur) { spiel.figur.entfernen(); spiel.figur = null; }
  if (spiel.auto) { spiel.auto.schaden?.entsorgen(); spiel.auto.entfernen(); spiel.auto = null; }
  if (aktiv?.menge) aktiv.menge.gefahr = null;
  polizei.leeren(aktiv);
  if (aktiv?.verkehr) aktiv.verkehr.spieler = null;
  if (spiel.rig) spiel.rig.zuruecksetzen();
  const warJet = spiel.modus === 'jet' ? jetEntfernen() : null;
  if (spiel.modus === 'bord') { spiel.bord?.verlassen(); spiel.bord = null; camera.up.set(0, 1, 0); document.body.classList.remove('spiel', 'innen', 'mitkarte'); camera.fov = 40; camera.updateProjectionMatrix(); }
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
// Einsteigen und Aussteigen (Taste E oder F, 05.11.2026, Nader: "ein und aussteigen in autos mit mensch, einfach wenn man e klickt am Auto"): die Figur läuft zur Fahrertür, steigt ein, das Auto gehört dir. Beim Aussteigen bremst der Wagen, die Figur steigt aus, er bleibt geparkt stehen.
let umsteigen = false;
const _wv = new THREE.Vector3(), _wq = new THREE.Vector3();
function fahrerSeite(A) { return A.verkehr?.netz?.links ? -1 : 1; }   // Rechtsverkehr: Fahrer links, Linksverkehr: rechts
// Punkt neben der Tür und Sitzplatz. links vom Auto ist (dir.z, -dir.x)
function tuerPunkte(fz, seite, out) { const lx = fz.dir.z, lz = -fz.dir.x, vor = (fz.L || 4.4) * 0.1; out.tx = fz.pos.x + fz.dir.x * vor + lx * seite * (fz.B / 2 + 0.42); out.tz = fz.pos.z + fz.dir.z * vor + lz * seite * (fz.B / 2 + 0.42); out.sx = fz.pos.x + fz.dir.x * vor + lx * seite * 0.2; out.sz = fz.pos.z + fz.dir.z * vor + lz * seite * 0.2; return out; }
// Begehbar (07.11.2026, Regel Nr. 29, Karte Wahrzeichen und Stadien begehbar): Stadien von innen, Aussichtsdecks der hohen Türme. Decks: [Höhe in Metern, Radius des Rundgangs, Radius des Schafts]. Echte Höhen der Besucherebenen, gerundet
const DECKS = { eiffelturm: [276, 12, 7], fernsehturm: [204, 18, 8], cntower: [346, 22, 10], skytree: [350, 22, 12], burj: [555, 20, 13], empire: [320, 24, 14], tokyotower: [150, 18, 11], spaceneedle: [159, 19, 6], shard: [244, 14, 7] };
const stadionRand = q => THREE.MathUtils.clamp(Math.min(q.L / 2 - 0.5 - 57, q.B / 2 - 0.5 - 38), 11, 48) + 1.5;
let deckMesh = null;
function begehbarNah(F) {
  const O = erdRegime === 'ort' ? erdOrt?.szene?.ort : null, K = aktiv?.kollision; if (!O || !K) return null; const p = F.pos;
  if (K.deck) { if (p.y > K.deck.y - 3) return { art: 'deckAb', text: 'Mit dem Aufzug nach unten' }; K.deck = null; deckMesh?.traverse(o => o.geometry?.dispose()); deckMesh?.removeFromParent(); deckMesh = null; }   // auf anderem Weg heruntergekommen
  for (const s of O.daten.freizeit?.stadien || []) { if (imStadion(s, p.x, p.z, -stadionRand(s))) return { art: 'stadionRaus', s, text: 'Stadion verlassen' }; else if (imStadion(s, p.x, p.z, 7)) return { art: 'stadionRein', s, text: 'Ins Stadion gehen' }; }
  const W = erdWelt, m = O.daten.meta; for (const w of WAHRZEICHEN) { const D = DECKS[w.id]; if (!D || Math.abs(w.lat - m.lat) > 0.02) continue; const l = W.geoZuLokal(w.lat, w.lon, 0, _wv); if (Math.hypot(l.x - p.x, l.z - p.z) < (w.frei || 30) + 10) return { art: 'deckAuf', w, D, x: l.x, z: l.z, text: 'Mit dem Aufzug nach oben' }; }
  return null;
}
function begehbarGehen(b, F) {
  const K = aktiv.kollision, O = erdOrt.szene.ort, setz = (x, y, z) => { F.pos.set(x, y, z); F.bildSetzen?.(); F.boden = y; F.hoeheUeberBoden = 0; F.luft = false; K.yAkt = y; };
  ton.klick?.(); blende(0.35);
  if (b.art === 'stadionRein') { const s = b.s, ca = Math.cos(s.ry), sa = Math.sin(s.ry), L0 = s.L / 2 - stadionRand(s) - 6; setz(s.x + sa * L0, O.H(s.x + sa * L0, s.z + ca * L0) + 0.05, s.z + ca * L0); spiel.stadionVor = { x: F.pos.x, z: F.pos.z }; shell?.tipp('Im Stadion. E führt wieder hinaus', 3); }
  else if (b.art === 'stadionRaus') { const s = b.s, dx = F.pos.x - s.x, dz = F.pos.z - s.z, l = Math.hypot(dx, dz) || 1; let t = 1; for (; t < 2.2; t += 0.05) { if (!imStadion(s, s.x + dx / l * (s.L / 2) * t, s.z + dz / l * (s.L / 2) * t, 4)) break; } const x = s.x + dx / l * (s.L / 2) * t, z = s.z + dz / l * (s.L / 2) * t; setz(x, O.H(x, z) + 0.05, z); }
  else if (b.art === 'deckAuf') { const [h, r, r0] = b.D, y = O.H(b.x, b.z) + h, G = new THREE.Group(), ma = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }); const boden = new THREE.Mesh(new THREE.RingGeometry(r0, r + 0.5, 56).rotateX(-Math.PI / 2), ma); boden.receiveShadow = true; G.add(boden); const reling = new THREE.Mesh(new THREE.TorusGeometry(r + 0.4, 0.035, 6, 72).rotateX(Math.PI / 2), ma); reling.position.y = 1.15; G.add(reling); const st = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 5), ma, 48), M4 = new THREE.Matrix4(); for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; M4.makeTranslation(Math.cos(a) * (r + 0.4), 0.575, Math.sin(a) * (r + 0.4)); st.setMatrixAt(i, M4); } G.add(st); G.position.set(b.x, y, b.z); erdOrt.gruppe.add(G); deckMesh = G; K.deck = { x: b.x, y, z: b.z, r, vor: [F.pos.x, F.pos.y, F.pos.z] }; setz(b.x + (r - 1.2), y, b.z); F.ry = Math.PI / 2; shell?.tipp(`${b.w.name}, ${Math.round(h)} m. E fährt wieder hinunter`, 4); }
  else if (b.art === 'deckAb') { const v = K.deck.vor; K.deck = null; deckMesh?.traverse(o => o.geometry?.dispose()); deckMesh?.removeFromParent(); deckMesh = null; setz(v[0], v[1], v[2]); }
  return true;
}
function blende(s) { const e = $('fotoblitz'); if (!e) return; e.style.transition = 'none'; e.style.background = '#000'; e.style.opacity = '1'; requestAnimationFrame(() => { e.style.transition = `opacity ${s}s`; e.style.opacity = '0'; setTimeout(() => { e.style.background = ''; }, s * 1000 + 40); }); }
// Geschichten der Menschen (07.11.2026, Wunsch Nr. 76, Nader: "wenn man vor ihnen steht und E klickt, sodass man das dann als Sprechblase lesen kann"):
// E (am Handy der Knopf Ein Aus) vor einer Person spricht sie an. Sie bleibt stehen, dreht sich zum Spieler und erzählt ihre eigene Geschichte (kit/geschichten.js),
// die Sprechblase steht über ihrem Kopf, bis sie fertig ist, der Spieler weggeht oder noch einmal E drückt. Vor einer Person hat Ansprechen Vorrang vor Einsteigen.
const blase = { el: null, p: null, M: null, t: 0, dauer: 0, yawZiel: null }, _bv = new THREE.Vector3();
let personNr = 0;
function personVorne(F) {
  const M = aktiv?.menge; if (!F || !M?.alle?.length || spiel.modus !== 'fuss') return null;
  const fx = Math.sin(F.ry), fz = Math.cos(F.ry); let best = null, bs = 9;
  for (const p of M.alle) {
    if (p.flucht || p.szene || !p.f?.obj?.parent) continue;
    const dx = p.pos.x - F.pos.x, dz = p.pos.z - F.pos.z, d = Math.hypot(dx, dz);
    if (d > 2.6 || d < 0.15 || Math.abs(p.pos.y - F.pos.y) > 2) continue;
    const c = (dx * fx + dz * fz) / d; if (c < 0.3) continue;   // vor der Figur, bis gut 70 Grad zur Seite
    const s = d * (1.7 - c); if (s < bs) { bs = s; best = p; }
  }
  return best;
}
function lookVon(M, p) { const q = M.quellen?.[p.f.qi]; return q?.look || { frau: /frau|woman|female/i.test(q?.def?.id || '') }; }
function liveBei(la, lo) {   // heute gemeldet in der Nähe (kit/ereignisse.js): Demonstration in der Stadt, Sturm in der Gegend
  const L = weltgeschehen?.L; if (!L?.length) return null; const jetzt = Date.now() / 1000, c = Math.cos(la * D2R), r = { demo: false, sturm: false };
  for (const e of L) { if (jetzt - (e.t || 0) > 86400) continue; const km = Math.hypot((e.la - la) * 111, (e.lo - lo) * 111 * c); if (e.a === 'demo' && km < 25) r.demo = true; else if (e.a === 'sturm' && km < 200) r.sturm = true; }
  return r.demo || r.sturm ? r : null;
}
function geschichteFuer(M, p, partnerName = null) {
  const meta = erdOrt?.daten?.meta || aktiv?.daten?.meta || {}, g = erdWelt ? spielerGeo() : null;
  const ort = (g && orteListe.length ? ortNahe(orteListe, g.lat, g.lon)?.name : null) || meta.name || '';
  p.sid ??= (++personNr * 2654435761 + Math.floor(Math.random() * 1e6)) >>> 0;
  return geschichte({ seed: p.sid, look: lookVon(M, p), iso2: meta.iso || 'DE', ort, typ: p.typ, partnerName, gruppe: !!p.statisch, hund: !!p.hund, live: g ? liveBei(g.lat, g.lon) : null });
}
function geschichteVon(M, p) {
  if (p.geschichte) return p.geschichte;
  const b = p.partner;   // zu zweit: beide kennen den Namen des anderen
  if (b && !b.geschichte) { const gb = geschichteFuer(M, b), gp = geschichteFuer(M, p, gb.name); b.geschichte = geschichteFuer(M, b, gp.name); p.geschichte = gp; }
  else p.geschichte = geschichteFuer(M, p, b?.geschichte?.name || null);
  return p.geschichte;
}
function ansprechen(p) {
  const M = aktiv?.menge, F = spiel.figur; if (!M || !F) return false;
  const g = geschichteVon(M, p);
  if (!blase.el) { const e = document.createElement('div'); e.id = 'sprechblase'; e.className = 'sprechblase'; e.setAttribute('role', 'status'); e.setAttribute('aria-live', 'polite'); e.innerHTML = '<b></b><p></p>'; document.body.appendChild(e); blase.el = e; }
  if (blase.p && blase.p !== p) blase.M?.ansprechenEnde?.(blase.p);
  blase.el.querySelector('b').textContent = g.kopf; blase.el.querySelector('p').textContent = g.text;
  blase.p = p; blase.M = M; blase.t = 0; blase.dauer = Math.min(18, 4 + g.text.length * 0.05);   // Lesezeit nach Länge
  blase.yawZiel = F.ry + Math.PI + 0.55;   // Kamera schwenkt etwas zur Seite, damit man beide sieht und nicht nur den eigenen Rücken (wie im Gespräch in einem Film)
  if (shell?.tTipp > 0) shell.tTipp = 0.001;   // kurze Nachricht oben weg, die Blase hat Vorrang
  M.ansprechen?.(p, F, blase.dauer + 0.6);
  blase.el.classList.remove('an'); void blase.el.offsetWidth; blase.el.classList.add('an'); blaseTick(0);
  ton.klick?.();
  return true;
}
function blaseZu() { if (!blase.p) return; blase.el?.classList.remove('an'); blase.M?.ansprechenEnde?.(blase.p); blase.p = null; blase.M = null; }
function blaseTick(dt) {
  const p = blase.p; if (!p) return;
  const F = spiel.figur;
  if (!F || spiel.modus !== 'fuss' || (blase.t += dt) > blase.dauer || Math.hypot(p.pos.x - F.pos.x, p.pos.z - F.pos.z) > 7 || !p.f.obj.parent) { blaseZu(); return; }
  const rig = spiel.rig; if (rig && blase.yawZiel !== null && blase.t < 1.6 && rig.ruhe >= blase.t) { const d = Math.atan2(Math.sin(blase.yawZiel - rig.yaw), Math.cos(blase.yawZiel - rig.yaw)); rig.yaw += d * (1 - Math.exp(-3.5 * dt)); }   // nur solange der Spieler die Kamera nicht selbst bewegt
  // Punkt über dem Kopf auf den Bildschirm, die Blase bleibt ganz im Bild
  p.f.obj.getWorldPosition(_bv); _bv.y += (lookVon(blase.M, p).groesse || 1.74) + 0.32; _bv.project(camera);
  const el = blase.el, w = innerWidth, h = innerHeight, bw = el.offsetWidth, bh = el.offsetHeight, sicht = _bv.z < 1 && Math.abs(_bv.x) < 1.2 && Math.abs(_bv.y) < 1.2;
  const x = THREE.MathUtils.clamp((_bv.x * 0.5 + 0.5) * w, bw / 2 + 10, w - bw / 2 - 10), y = THREE.MathUtils.clamp((-_bv.y * 0.5 + 0.5) * h, bh + 16, h - 90);
  el.style.transform = `translate(${Math.round(x - bw / 2)}px, ${Math.round(y - bh)}px)`; el.style.visibility = sicht ? '' : 'hidden';
}
function einsteigenWahl(reden = true) {   // reden: E, Knopf und Gamepad sprechen zuerst eine Person vor dir an, F steigt immer ein
  const A = aktiv, F = spiel.figur; if (!F || spiel.wechsel || umsteigen) return false;
  { const per = reden ? personVorne(F) : null; if (per) { if (blase.p === per) { blaseZu(); return true; } return ansprechen(per); } }   // Wunsch Nr. 76
  { const t = A?.innenwelt?.tuerNah(F.pos); if (t) return A.innenwelt.umschalten(F.pos); }   // Haustür auf und zu (Nr. 96)
  { const b = begehbarNah(F); if (b) return begehbarGehen(b, F); }
  { const e = eingangNah(F); if (e) { ubahnStarten(e.i).catch(x => console.warn(x)); return true; } }
  if (zugEinsteigen(F)) return true;
  { const n = flugzeugNah(F); if (n) { flugWahl({ gate: n }).catch(e => console.warn(e)); return true; } }
  { const G = gangwayNah(); if (G) { bordStarten(G.s, { deck: 4, x: G.sg * 14.5, z: 2, ry: -G.sg * Math.PI / 2 }).catch(e => console.warn(e)); return true; } }
  // Flieger zuerst: geparkter Jet oder Hubschrauber in der Nähe
  for (const P of Object.values(spiel.parken)) { if (!P) continue; const l = erdWelt.weltZuLokal(P.F.p, _wv); if (P.wasser) { if (Math.hypot(l.x - F.pos.x, l.z - F.pos.z) < 18) { wasserStarten(P.art, P).catch(e => console.warn(e)); return true; } continue; } if (Math.hypot(l.x - F.pos.x, l.z - F.pos.z) < (P.art === 'jet' ? 11 : 9)) { spiel.wechsel = { art: 'flug', P, phase: 'gehen', t: 0 }; $('hilfe').classList.remove('an'); return true; } }
  if (!A?.verkehr) return false;
  let best = null, bd = 9; const p = F.pos;
  for (const fz of A.verkehr.geparkt) { const d = Math.hypot(fz.pos.x - p.x, fz.pos.z - p.z); if (d < bd) { bd = d; best = fz; } }
  for (const fz of A.verkehr.alle) { if (Math.abs(fz.v) > 7) continue; const d = Math.hypot(fz.pos.x - p.x, fz.pos.z - p.z); if (d < bd - 0.5) { bd = d; best = fz; } }
  if (!best) { shell?.tipp('Kein Auto in der Nähe'); return false; }
  // ein Auto im Verkehr bleibt stehen und wird zum parkenden
  if (!best.geparkt) { A.verkehr.entferne(best); A.verkehr.neu(); const q = { typ: best.typ, def: best.def, L: best.L, B: best.B, pos: best.pos.clone(), dir: best.dir.clone(), spin: best.spin || 0, lenk: 0, nick: 0, neigung: 0, geparkt: true, stufe: -1, farbe: best.farbe || [1, 1, 1] }; A.verkehr.geparkt.push(q); best = q; }
  let seite = fahrerSeite(A); const pt = tuerPunkte(best, seite, {}); if (!A.kollision.frei(pt.tx, pt.tz)) seite = -seite;
  ladeFahrzeug(best.def);
  // auf der anderen Seite: erst um das Auto herum
  const rx = p.x - best.pos.x, rz = p.z - best.pos.z, q = (rx * best.dir.z - rz * best.dir.x) * seite, l = rx * best.dir.x + rz * best.dir.z, um = q < 0 && Math.abs(l) < best.L / 2 + 0.5;
  spiel.wechsel = { art: 'rein', fz: best, seite, phase: um ? 'herum' : 'gehen', t: 0, ende: Math.sign(l) || 1, pt: {} };
  return true;
}
// Fertig eingestiegen: Figur weg, Fahrer übernimmt das Auto
async function einsteigenFertig(WE) {
  const A = aktiv, F = spiel.figur, best = WE.fz; umsteigen = true;
  try {
    const quelle = await ladeFahrzeug(best.def); if (!quelle) return false;
    const i = A.verkehr.geparkt.indexOf(best); if (i >= 0) A.verkehr.geparkt.splice(i, 1);
    const farbe = best.farbe, ry = Math.atan2(best.dir.x, best.dir.z), pos = best.pos;
    F.entfernen(); spiel.figur = null;
    const W = spiel.auto = new Fahrer({ quelle, kollision: A.kollision, start: { x: pos.x, z: pos.z, ry }, verkehr: A.verkehr, menge: A.menge });
    lackSetzen(W.obj, farbe); W.farbe = farbe; A.gruppe.add(W.obj); W.schaden = new Schaden(W.obj, { L: best.def.laenge, B: best.def.breite, H: best.def.hoehe }); spiel.wahl = best.def; spiel.modus = 'fahren'; A.verkehr.spieler = W;
    const r = spiel.rig; r.distBasis = (MOBIL ? 5.8 : 4.4) + best.def.laenge * 0.5; r.distZiel = r.distBasis; r.ruhe = 9; $('hilfe').textContent = HILFE.fahren; ton.anlassen();
    return true;
  } finally { umsteigen = false; }
}
async function spielAussteigen() {
  const A = aktiv, W = spiel.auto; if (!A || !W || umsteigen) return false;
  umsteigen = true;
  try {
    const def = spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0], quelle = menschenQuellen.find(q => q.def.id === def.id) || await loadPerson(def); if (!quelle) return false;
    let seite = fahrerSeite(A); const pt = tuerPunkte(W, seite, {}); if (!A.kollision.frei(pt.tx, pt.tz)) { seite = -seite; tuerPunkte(W, seite, pt); }
    const typ = A.verkehr.typen.findIndex(t => t?.def.id === W.def.id);
    A.verkehr.geparkt.push({ typ: typ >= 0 ? typ : 0, def: W.def, L: W.L, B: W.B, pos: W.pos.clone(), dir: W.dir.clone(), spin: 0, lenk: 0, nick: 0, neigung: 0, geparkt: true, stufe: -1, farbe: W.farbe || [1, 1, 1] });
    const y = W.pos.y, psi = W.psi; W.schaden?.entsorgen(); W.entfernen(); spiel.auto = null; if (A.menge) A.menge.gefahr = null;
    const f = spiel.figur = new Figur({ quelle, bewegungen, kollision: A.kollision, start: { x: pt.sx, z: pt.sz, ry: psi }, menge: A.menge }); A.gruppe.add(f.obj); spiel.modus = 'fuss'; A.verkehr.spieler = f;
    spiel.wechsel = { art: 'raus', t: 0, von: { x: pt.sx, z: pt.sz, y: y - 0.32 }, nach: { x: pt.tx, z: pt.tz } }; f.pos.y = y - 0.32; f.ry = Math.atan2(pt.tx - pt.sx, pt.tz - pt.sz); f.bildSetzen?.();
    spiel.rig.distZiel = MOBIL ? 3.6 : 3.1; $('hud').classList.remove('an'); $('hilfe').textContent = HILFE.fuss; ton.tuer();
    return true;
  } finally { umsteigen = false; }
}
const _achW = new THREE.Vector2(0, 1);
// Laufweg und Einsteigen als kleine Abfolge, Eingabe ist solange aus. Liefert true, solange etwas läuft
function wechselTick(dt, F) {
  const WE = spiel.wechsel; if (!WE) return false; WE.t += dt;
  const glatt = k => k * k * (3 - 2 * k);
  if (WE.art === 'raus') {   // aus dem Sitz zur Tür hinaus
    const k = Math.min(1, WE.t / 0.55), g = glatt(k), bH = aktiv.kollision.hoehe(WE.nach.x, WE.nach.z); if (F.clip !== 'gehen') { F.clip = 'gehen'; F.f.play('gehen', 0.15); }
    F.pos.x = WE.von.x + (WE.nach.x - WE.von.x) * g; F.pos.z = WE.von.z + (WE.nach.z - WE.von.z) * g; F.pos.y = WE.von.y + (bH - WE.von.y) * g; F.alt.pos.copy(F.pos); F.alt.ry = F.ry; F.zeigen(1); F.f.mixer.update(dt);
    if (k >= 1) { spiel.wechsel = null; $('hilfe').classList.add('an'); F.boden = undefined; }
    return true;
  }
  let tx, tz;
  if (WE.art === 'flug') { const P = WE.P, l = erdWelt.weltZuLokal(P.F.p, _wv), o = P.art === 'jet' ? _wq.set(1.7, 0, 3.5) : _wq.set(1.25, 0, 0.8); o.applyQuaternion(erdWelt.zuLokal).applyQuaternion(P.F.q); tx = l.x + o.x; tz = l.z + o.z; if (!aktiv.kollision.frei(tx, tz)) { o.x = -o.x; o.z = -o.z; tx = l.x + 0; tz = l.z + 0; } }
  else { const pt = tuerPunkte(WE.fz, WE.seite, WE.pt); tx = pt.tx; tz = pt.tz; if (WE.phase === 'herum') { const fz = WE.fz; tx = fz.pos.x + fz.dir.x * WE.ende * (fz.L / 2 + 0.75); tz = fz.pos.z + fz.dir.z * WE.ende * (fz.L / 2 + 0.75); } }
  if (WE.phase === 'gehen' || WE.phase === 'herum') {
    const dx = tx - F.pos.x, dz = tz - F.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.28 || WE.t > 4) {
      if (WE.phase === 'herum') { WE.phase = 'gehen'; WE.t = 0; }
      else { WE.phase = 'rein'; WE.t = 0; WE.sx = F.pos.x; WE.sz = F.pos.z; WE.sy = F.pos.y; if (WE.art === 'rein') ton.tuer(); else ton.klick(); }
    } else F.update(dt, _achW, Math.atan2(dx, dz), d > 2.6, false);
    return true;
  }
  if (WE.phase === 'rein') {   // Tür: Figur dreht zur Mitte und taucht in den Sitz
    if (WE.art === 'flug') { const k = Math.min(1, WE.t / 0.4); F.f.mixer.update(dt); if (k >= 1) { spiel.wechsel = null; flugEinsteigen(WE.P); } return true; }
    if (F.clip !== 'gehen') { F.clip = 'gehen'; F.f.play('gehen', 0.15); }
    const pt = WE.pt, k = Math.min(1, WE.t / 0.5), g = glatt(k); F.pos.x = WE.sx + (pt.sx - WE.sx) * g; F.pos.z = WE.sz + (pt.sz - WE.sz) * g; F.pos.y = WE.sy - 0.34 * g; let dr = Math.atan2(pt.sx - WE.sx, pt.sz - WE.sz) - F.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); F.ry += dr * Math.min(1, dt * 12); F.alt.pos.copy(F.pos); F.alt.ry = F.ry; F.zeigen(1); F.f.mixer.update(dt);
    if (k >= 1) { spiel.wechsel = null; einsteigenFertig(WE).catch(e => console.warn(e)); }
    return true;
  }
  return false;
}
// Beim Start steht die Figur neben einem geparkten Auto (vorher im Schnitt über 100 m zu laufen, bevor das Spiel losgeht), auf der Seite mit dem höheren Boden (Gehweg)
function figurZumAuto() {
  const A = aktiv, F = spiel.figur; if (!F || !A?.verkehr || !A.kollision) return;
  let b = null, bd = 320; for (const fz of A.verkehr.geparkt) { const d = Math.hypot(fz.pos.x - F.pos.x, fz.pos.z - F.pos.z); if (d < bd) { bd = d; b = fz; } }
  if (!b) return; const sx = -b.dir.z, sz = b.dir.x, seiten = [1, -1].map(si => ({ x: b.pos.x + sx * si * (b.B / 2 + 1.15), z: b.pos.z + sz * si * (b.B / 2 + 1.15) })).filter(q => A.kollision.frei(q.x, q.z)).sort((m, n) => A.kollision.hoehe(n.x, n.z) - A.kollision.hoehe(m.x, m.z));
  if (!seiten.length) return; const q = seiten[0], ry = Math.atan2(b.pos.x - q.x, b.pos.z - q.z);
  F.pos.set(q.x, A.kollision.hoehe(q.x, q.z), q.z); F.ry = ry; F.alt && (F.alt.pos.copy(F.pos), F.alt.ry = ry); if (F.boden !== undefined) F.boden = F.pos.y; F.bildSetzen?.();
  spiel.rig.yaw = ry + Math.PI + (MOBIL ? 0.2 : 0.45); spiel.rig.pitch = 0.1;
}
// Niemand geht durch Autos: steht die Figur im Rechteck eines Wagens, wird sie zur nächsten Kante geschoben
function figurAusAutos(F) {
  const V = aktiv?.verkehr; if (!V) return; const listen = polizei.autos.length ? [V.geparkt, V.alle, polizei.autos.map(c => c.f)] : [V.geparkt, V.alle]; if (V.flieger) listen.push(V.flieger);
  for (const L of listen) for (const fz of L) {
    const dx = F.pos.x - fz.pos.x, dz = F.pos.z - fz.pos.z; if (dx * dx + dz * dz > (fz.L > 8 ? 130 : 64)) continue;
    let l = dx * fz.dir.x + dz * fz.dir.z, q = dx * fz.dir.z - dz * fz.dir.x; const hl = fz.L / 2 + 0.3, hb = fz.B / 2 + 0.3; if (Math.abs(l) >= hl || Math.abs(q) >= hb || F.pos.y > fz.pos.y + (fz.def?.hoehe || 1.5)) continue;
    if (hl - Math.abs(l) < hb - Math.abs(q)) l = Math.sign(l || 1) * hl; else q = Math.sign(q || 1) * hb;
    const x = fz.pos.x + fz.dir.x * l + fz.dir.z * q, z = fz.pos.z + fz.dir.z * l - fz.dir.x * q; if (aktiv.kollision.frei(x, z)) { F.pos.x = x; F.pos.z = z; }
  }
}
// Gestellt: Strafe, aussteigen, die Streifenwagen ziehen ab
async function festnahme() {
  const S = shell?.stand; if (!S) return; const strafe = Math.max(50, Math.round(S.geld * 0.15 / 10) * 10); S.geld = Math.max(0, S.geld - strafe); shell.geldZeigen(); shell.ortBanner('Festgenommen', `Strafe ${strafe.toLocaleString(LOCALE)} €`); ton.fehler();
  polizei.stufe = 0; polizei.punkte = 0; auftraege?.abbrechen('Auftrag verloren'); if (spiel.auto) { spiel.auto.vLong = 0; spiel.auto.vLat = 0; spiel.auto.kmh = 0; await spielAussteigen().catch(() => {}); }
}
// Steht ein Auto in Reichweite von F? (für den Hinweis)
function gangwayNah() { const F = spiel.figur; if (!F || !schiffe || !erdWelt) return null; for (const q of schiffe.liste) if (q.plan && q.fahrplan?.liegt && q.gang?.visible) { const f = schiffe.gangFuss(q), l = erdWelt.geoZuLokal(f.lat, f.lon, 0, _wv); if (Math.hypot(l.x - F.pos.x, l.z - F.pos.z) < 9) return { s: q, sg: f.sg }; } return null; }
// Unten am Ende des Gangs eines echten Eingangs (Nr. 94) geht es in den Bahnhof: nächste Station aus metro.json zu den Koordinaten des Bahnhofs
let echtLaeuft = false;
async function echterEingang(e) { if (umsteigen || echtLaeuft) return; echtLaeuft = true; try { await metro.laden(); const L = metro.nahe(e.sla, e.slo, 600); if (L.length) await ubahnStarten(L[0].i); } finally { echtLaeuft = false; } }
function autoInReichweite() { const A = aktiv, F = spiel.figur; { const e = F && !spiel.wechsel && A?.kollision?.ubahn?.unten(F.pos.x, F.pos.z, F.pos.y); if (e) return T('Zum Bahnhof'); } if (F && !spiel.wechsel && personVorne(F)) return 'Ansprechen'; if (F && !spiel.wechsel) { const t = A?.innenwelt?.tuerNah(F.pos); if (t) return t.offen ? 'Tür schließen' : 'Tür öffnen'; } if (F && !spiel.wechsel) { const b = begehbarNah(F); if (b) return b.text; } { const e = F && !spiel.wechsel ? eingangNah(F) : null; if (e) return `U-Bahn ${e.name}`; if (F && !spiel.wechsel && erdRegime === 'ort' && erdOrt?.szene?.ort?.bahn?.zugNah(F.pos.x, F.pos.z)) return 'In den Zug einsteigen'; if (F && !spiel.wechsel && flugzeugNah(F)) return 'Ins Flugzeug einsteigen'; } if (F && !spiel.wechsel && gangwayNah()) return 'An Bord gehen'; if (!F || !A?.verkehr || spiel.wechsel) return false; const p = F.pos; for (const P of Object.values(spiel.parken)) { if (!P) continue; const l = erdWelt.weltZuLokal(P.F.p, _wv); if (P.wasser) { if (Math.hypot(l.x - p.x, l.z - p.z) < 18) return `${WASSER_ARTEN[P.art].name} nehmen`; continue; } if (Math.hypot(l.x - p.x, l.z - p.z) < (P.art === 'jet' ? 11 : 9)) return P.art === 'jet' ? 'In den Jet steigen' : 'In den Hubschrauber steigen'; } for (const fz of A.verkehr.geparkt) if (Math.hypot(fz.pos.x - p.x, fz.pos.z - p.z) < 9) return 'Einsteigen'; for (const fz of A.verkehr.alle) if (Math.abs(fz.v) <= 7 && Math.hypot(fz.pos.x - p.x, fz.pos.z - p.z) < 8.5) return 'Einsteigen'; return false; }
const def_laenge = W => W.def?.laenge || 4.4;
// Kamerawinkel im Spiel: 40 Grad wie im Dashboard wirkten eng, im Hochformat sah man waagrecht nur 19 Grad (Autos neben der Figur lagen außerhalb des Bildes)
const spielFov = () => innerWidth < innerHeight ? 68 : 50;
function spielTick(dt) {
  blaseTick(dt);
  if (spiel.rig) { spiel.rig.fovBasis = spielFov(); spiel.rig.autos = aktiv?.verkehr ? (spiel.autosListe ||= [])  : null; if (aktiv?.verkehr) { spiel.autosListe[0] = aktiv.verkehr.geparkt; spiel.autosListe[1] = aktiv.verkehr.alle; } }
  if (aktiv?.erde && eingabe.gedrueckt('ziel')) { const f = $('erdfeld'); document.body.classList.add('suche'); f.focus(); f.select(); f.onblur = () => document.body.classList.remove('suche'); }   // N: Ziel für die Navigation eingeben
  if (eingabe.gedrueckt('ende')) { if (shell?.aktiv) { eingabe.bild(); shell.pause(true); return; } waehleModus('frei'); return; }
  if (eingabe.gedrueckt('werbung') && shell?._wf && !shell.pausiert) shell.werbeKarte(shell._wf);
  if (eingabe.gedrueckt('foto') && aktiv?.erde && !shell?.pausiert) fotoMachen();
  if (spiel.auto && spiel.modus === 'fahren') { if (eingabe.gedrueckt('blinkL')) blinker(-1); if (eingabe.gedrueckt('blinkR')) blinker(1); blinkerTick(dt); }
  if (eingabe.gedrueckt('lexikon') && aktiv?.erde && !shell?.pausiert) shell?.tierlexikon();
  if (spiel.modus !== 'bord' && eingabe.gedrueckt('einsteigen')) { const nurF = eingabe.kanten.has('KeyF') && !eingabe.kanten.has('KeyE'); eingabe.kanten.delete('KeyF'); eingabe.kanten.delete('KeyE'); if (spiel.modus === 'fuss') einsteigenWahl(!nurF); else if (spiel.modus === 'fahren') { if (!spiel.wechsel) spiel.ausWunsch = true; } else if (spiel.modus === 'jet') flugAussteigen(); }
  if (eingabe.gedrueckt('auftrag')) { if (shell?.aktiv) shell.auftragWahl(); }
  if (eingabe.gedrueckt('ton')) ton.umschalten();
  if (eingabe.gedrueckt('radio') && spiel.modus === 'fahren') { const r = radio.weiter(); shell?.tipp(r.info ? `${r.name} · ${r.info}` : r.name, 2.5); if (shell?.aktiv) { shell.stand.einst.radio = radio.i; } }
  // Wer hinter dem stehenden Spieler wartet, hupt irgendwann
  if ((spiel.modus === 'fahren' || spiel.modus === 'fuss') && aktiv?.verkehr && (spiel.hupT = (spiel.hupT ?? 3) - dt) < 0) { spiel.hupT = 0.5; const P = (spiel.auto || spiel.figur); if (P && (spiel.auto ? spiel.auto.kmh < 3 : P.v < 0.3)) { let wartet = false; for (const fz of aktiv.verkehr.alle) { if (Math.abs(fz.v) > 0.5) continue; const rx = P.pos.x - fz.pos.x, rz = P.pos.z - fz.pos.z, l = rx * fz.dir.x + rz * fz.dir.z, q = Math.abs(rx * fz.dir.z - rz * fz.dir.x); if (l > 0 && l < fz.L / 2 + 8 && q < 1.8) { wartet = true; break; } } spiel.wartetT = wartet ? (spiel.wartetT || 0) + 0.5 : 0; if (spiel.wartetT > 3.5) { spiel.wartetT = Math.random() * 1.5; ton.naheHupe(); } } else spiel.wartetT = 0; }
  if (spiel.modus === 'jet') { jetTick(dt); return; }
  if (spiel.modus === 'bord') { const sp = eingabe.gedrueckt('springen'), ee = eingabe.gedrueckt('einsteigen'), kk = eingabe.gedrueckt('kamera'), zz = eingabe.gedrueckt('zeit'), bb = eingabe.bild(); eingabe.achse(_ach); spiel.bord.tick(dt, { achse: _ach, rennen: eingabe.an('schnell'), springen: sp, b: bb, e: ee, kamera: kk, zeit: zz }); return; }
  const springen = eingabe.gedrueckt('springen');   // Flanke vor bild() lesen, bild() verbraucht sie
  const rig = spiel.rig, b = eingabe.bild(); eingabe.achse(_ach, spiel.modus === 'fahren');   // Fahren: Gas und Lenkung unabhängig (Nr. 100)
  if (spiel.modus === 'fuss' && spiel.figur) {
    const F = spiel.figur;
    rig.eingabe(b, { zoom: [2, 8] });
    const war = F.luft;
    if (!wechselTick(dt, F)) {
      F.update(dt, _ach, rig.yaw + Math.PI, eingabe.an('schnell'), springen);   // Kamera schaut von yaw aus auf die Figur: vorwärts ist yaw plus pi
      if (war && !F.luft) rig.stoss(0.12);   // Landung: kleiner Stoß
      figurAusAutos(F);
      if (aktiv?.erde && (spiel.tUfer = (spiel.tUfer || 0) - dt) < 0) { spiel.tUfer = 0.15; uferPruefen(F); }
    }
    if (spiel.modus !== 'fuss' || !spiel.figur) return;   // gerade eingestiegen oder ins Wasser gelaufen
    aktiv.innenwelt?.update(dt, F.pos);
    { const ue = aktiv.kollision?.ubahn?.unten(F.pos.x, F.pos.z, F.pos.y); if (ue && !umsteigen && !echtLaeuft) echterEingang(ue).catch(x => console.warn(x)); }   // unten am Gang eines echten U-Bahn Eingangs (Nr. 94): in den Bahnhof
    _zielP.copy(F.bildPos); _zielP.y += 1.42 - F.hoeheUeberBoden * 0.5; _zielP.addScaledVector(F.dir, Math.min(0.6, F.v * 0.25)); if (!MOBIL) { const sw = rig.yaw; _zielP.x += Math.cos(sw) * 0.42; _zielP.z -= Math.sin(sw) * 0.42; }   // gezeigte (interpolierte) Lage, sonst zittert die Figur gegen die Kamera
    { const K = aktiv.kollision, imHaus = !!(K?.innen && K.innen.drin(F.pos.x, F.pos.z)), treppe = imHaus && K.zustand.kSeg !== null;   // im Haus etwas höher, auf der Treppe von oben, vor Wänden höher statt näher (Nr. 96)
      rig.update(dt, { ziel: _zielP, heading: F.ry, bewegt: F.v > 0.3, rueckRate: imHaus ? 2.0 : 1.2, warte: imHaus ? 0.6 : 1.2, rate: 12, pitchStandard: treppe ? 0.62 : imHaus ? 0.24 : 0.1, heben: imHaus ? 0.8 : 0 }); }
  } else if (spiel.modus === 'fahren' && spiel.auto) {
    const W = spiel.auto;
    rig.eingabe(b, { zoom: [3.5, 16] });
    if (spiel.ausWunsch) { _ach.y = W.vLong > 0.3 ? -1 : W.vLong < -0.3 ? 1 : 0; if (W.kmh < 7) { spiel.ausWunsch = false; spielAussteigen().catch(e => console.warn(e)); return; } }
    W.gasEingabe = Math.max(0, _ach.y); if (W.fassung >= 4) W.griff = 1 - 0.22 * Math.min(1, wetterJetzt?.regen || 0);   // nasse Straße: weniger Haftung (Nr. 100)
    const st = W.update(dt, _ach, eingabe.an('bremse') || !!spiel.ausWunsch); if (st) { rig.stoss(st); if (st > 0.05) { ton.stoss(st); const d = W.bildDir; effekte?.funkenAus(W.bildPos.x + d.x * W.L * 0.5, W.bildPos.y + 0.6, W.bildPos.z + d.z * W.L * 0.5, d.x * W.vLong, d.z * W.vLong, st); if (shell?.aktiv && st > 0.25) shell.stand.statistik.unfaelle++; } }
    if (W.treffer.length && !shell?.stand?.einst?.schaden) W.treffer.length = 0;   // Schadensmodell aus (Standard, Wunsch Nr. 97): keine Beulen, kein Motorschaden
    if (W.treffer.length) {   // Beulen, ab der Hälfte lässt der Motor nach, bei 100 Prozent Motorschaden
      for (const t of W.treffer) W.schaden?.treffer(t.l, t.q, t.st); W.treffer.length = 0;
      const sw = W.schaden?.wert || 0, war = W.motor; W.motor = sw >= 1 ? 0.1 : 1 - 0.5 * THREE.MathUtils.smoothstep(sw, 0.5, 1);
      if (sw >= 1 && war > 0.1) { shell?.tipp(MOBIL ? 'Motorschaden. Steig aus (Ein Aus) oder repariere im Menü' : 'Motorschaden. Steig aus (E) oder repariere im Menü (Esc)', 7); ton.fehler(); }
    }
    { const sw = W.schaden?.wert || 0; if (sw > 0.45 && effekte && (spiel.qualmT = (spiel.qualmT || 0) - dt) <= 0) { spiel.qualmT = 0.24 - 0.18 * THREE.MathUtils.smoothstep(sw, 0.45, 1); const d = W.bildDir; effekte.qualm(W.bildPos.x + d.x * W.L * 0.34, W.bildPos.y + (W.def?.hoehe || 1.5) * 0.6, W.bildPos.z + d.z * W.L * 0.34, d.x * W.vLong, d.z * W.vLong, 0.08 + sw * 0.2, 0.32 + sw * 0.26, sw > 0.72); } }
    { const M = aktiv.menge; if (M) { const G = spiel.gefahr ||= { pos: null, dir: null, v: 0, L: 4, B: 2, hupe: false }; G.pos = W.pos; G.dir = W.dir; G.v = W.vLong; G.L = W.L; G.B = W.B; G.hupe = eingabe.an('hupe'); M.gefahr = G; M.frei ||= (x, z) => aktiv?.kollision ? aktiv.kollision.frei(x, z) : true; M.nachricht ||= (art, p, k) => { if (art !== 'sturz') return; ton.stoss(0.12 + k * 0.2); spiel.rig?.stoss(0.08 + k * 0.15); if (shell?.aktiv) { shell.tipp('Pass auf, ein Fußgänger!', 2.5); shell.stand.statistik.unfaelle++; polizei.melde(1); } }; } }
    if (W.kiStoss) { if (shell?.aktiv && W.kiStoss > 0.12) polizei.melde(W.kiStoss * 0.75); W.kiStoss = 0; }
    // Verfolger wie GTA: hinter der Fahrtrichtung (bei Drift zwischen Nase und Bewegung), zieht mit Tempo nach hinten, Blick voraus,
    // Umschauen mit der Maus, danach schwenkt er in 1,8 s zurück
    // Kamera folgt der gezeigten (interpolierten) Lage des Autos, nicht dem letzten Physikschritt (sonst zittert es gegen die Kamera)
    // Wunsch Nr. 81: fest hinter dem Auto wie in Arcade Rennspielen, auch beim Rückwärtsfahren (vorher klappte sie dann auf die Vorderseite),
    // Abstand, Blickpunkt und Bildwinkel aus einem geglätteten Tempo (sonst pumpte das Bild beim Gasgeben und Bremsen)
    const av = Math.abs(W.vLong), bewegung = av > 3 ? W.bildPsi - Math.atan2(W.vLat, av) * 0.6 * Math.sign(W.vLong) : W.bildPsi;
    rig.avGlatt = (rig.avGlatt ?? av) + (av - (rig.avGlatt ?? av)) * (1 - Math.exp(-2.5 * dt)); const ag = rig.avGlatt;
    // Abstand wächst mit dem Tempo schneller als der Blickpunkt voraus: die Kamera weicht bei Tempo leicht zurück (4,5 m hinter der Mitte im Stand,
    // rund 5,4 m bei 100 km/h). Vorher wanderte der Blickpunkt bis 5 m voraus und die starre Kamera saß bei Tempo fast über dem Heck
    rig.distZiel = THREE.MathUtils.clamp(rig.distBasis * (1 + ag * 0.014), rig.distBasis, rig.distBasis * 1.5);
    _zielP.copy(W.bildPos); _zielP.y += 1.25; _zielP.addScaledVector(W.bildDir, 2 + Math.min(3, ag * 0.06));   // das Auto bleibt im unteren Drittel des Bildes
    // Fahrphysik Fassung 4 (Nr. 100): Blick in die Kurve (Ziel wandert mit Gierrate und Tempo zur Kurveninnenseite), Drehung über eine Feder,
    // Bildwinkel öffnet kurz beim Beschleunigen und schließt beim Bremsen, feines Zittern erst ab rund 110 km/h
    if (W.fassung >= 4) {
      const quer = THREE.MathUtils.clamp((W.omega || 0) * av * 0.045, -1.3, 1.3); rig.blickQuer = (rig.blickQuer ?? 0) + (quer - (rig.blickQuer ?? 0)) * (1 - Math.exp(-3 * dt));
      _zielP.x += -W.bildDir.z * rig.blickQuer; _zielP.z += W.bildDir.x * rig.blickQuer;
      rig.fovStoss = (rig.fovStoss ?? 0) + (THREE.MathUtils.clamp((W.aLongG || 0) * 0.32, -2.2, 3) - (rig.fovStoss ?? 0)) * (1 - Math.exp(-5 * dt));
      rig.ruhig ??= !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; if (rig.ruhig) rig.fovStoss = 0;   // Systemeinstellung Bewegung reduzieren: kein Bildwinkelstoß, kein Fahrtzittern
    }
    rig.update(dt, { ziel: _zielP, heading: bewegung, bewegt: true, rueckRate: 6, warte: 1.8, rate: 9, starr: true, pitchStandard: 0.12, fovPlus: Math.min(16, ag * 0.3) + (W.fassung >= 4 ? rig.fovStoss : 0), minAbstand: 3.2 + def_laenge(W) * 0.3, heben: 0.55, feder: W.fassung >= 4 ? 7.5 : 0, zittern: W.fassung >= 4 && !rig.ruhig ? THREE.MathUtils.smoothstep(ag * 3.6, 110, 230) : 0 });
    $('hud').textContent = `${Math.round(W.kmh)} km/h · ${W.rueckwaerts && W.vLong < -0.2 ? 'R' : W.gang + 1}. Gang${W.driftet ? ' · Drift' : ''}`;
    if (W.fassung >= 4) { const hd = $('hud'); if (!hd.classList.contains('dz')) hd.classList.add('dz'); hd.style.setProperty('--dz', Math.min(1, W.drehzahl || 0).toFixed(3)); }
  }
}

// ---------- Düsenjet über der ganzen Erde (kit/jet.js, 09_GRAFIK.md Abschnitt 7, Wunsch Nr. 33) ----------
// Ein Knopf startet ihn überall auf der Erde. Maus zielt (ein Klick fängt die Maus), der Jet fliegt wie mit einem Instruktor dorthin;
// Tasten steuern direkt und haben Vorrang. Physik in festen Schritten (120 je Sekunde) in ECEF, Kamera und Modell relativ zum Anker.
const HELI_HILFE = MOBIL ? 'Stick: vor, zurück und drehen · Hoch · Runter · Ein Aus zum Aussteigen am Boden' : 'W S vor und zurück · A D drehen · Q E seitlich · Shift hoch · Leertaste runter · Maus ziehen schaut um · C Kamera · E aussteigen am Boden';
const JET_HILFE = MOBIL ? 'Stick lenkt (hoch drückt die Nase) · Nachbrenner · Bremse · Beenden' : 'Maus zielt (Klick fängt die Maus) · W S Schub · Shift Nachbrenner · Pfeile Nase · A D Rollen · Q E Seitenruder · Leertaste Bremse · G Fahrwerk · C Kamera · M Ton · E aussteigen am Boden · Esc Menü';
const _jE = new THREE.Euler(), D2Rj = Math.PI / 180, _jq = new THREE.Quaternion(), _jv = new THREE.Vector3(), _jw = new THREE.Vector3(), _jm = new THREE.Matrix4(), _jy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
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
let stadtschatten = null, echtzeit = null, weltgeschehen = null, heliModell = null, heliTon = null, meer = null, schiffe = null, kreuzer = null, meerestiere = null, weltobjekte = null, wahrzeichen = null;
// art: 'jet' oder 'heli'; weiter: geparkter Flieger, in den man wieder einsteigt (Zustand bleibt, steht am Boden)
function jetStarten(art = 'jet', weiter = null) {
  if (typeof art !== 'string') art = 'jet';
  if (!aktiv?.erde || !erdWelt) return;
  const start0 = weiter ? null : spielerGeo();   // der Hubschrauber startet am Spieler
  const flugH = !weiter && spiel.modus === 'jet' && spiel.jet ? spiel.jet.flug.geo.h : null;   // Wechsel in der Luft: der neue Flieger übernimmt die Höhe, soweit er sie kann
  if (spiel.modus !== 'frei') spielBeenden();
  fahrt = null; folge = null;
  jetHudBauen();
  const istHeli = art === 'heli';
  if (!weiter && spiel.parken[art]) { const alt = spiel.parken[art]; scene.remove(alt.modell); spiel.parken[art] = null; }
  if (istHeli) { if (!heliModell) heliModell = baueHeli(); heliDateiLaden(MOBIL); heliEinsetzen(heliModell).catch(e => console.warn(e)); try { if (!heliTon) heliTon = new HeliTon(); heliTon.pause(true); } catch (e) { console.warn('Ton', e); } }
  else { if (!jetModell) jetModell = baueJet(); jetDateiLaden(MOBIL); jetEinsetzen(jetModell).catch(e => console.warn(e)); try { if (!jetTon) jetTon = new JetTon(); jetTon.pause(true); } catch (e) { console.warn('Ton', e); } }
  const modell = istHeli ? heliModell : jetModell;
  const F = weiter ? weiter.F : istHeli ? new Heli() : new Jet(), W = erdWelt, k = erdKam;
  const kg = k.kamGeo, hoch = k.hoehe > 25000;
  const lat = hoch ? k.lat : (start0?.lat ?? kg.lat), lon = hoch ? k.lon : (start0?.lon ?? kg.lon), boden = erdBodenGeo(lat, lon);
  if (weiter) { spiel.parken[art] = null; F.keinPilot = false; F.haubeOffen = false; if (istHeli) F.motorAn = true; else { F.gas = 0; F.nach = 0; } }
  // Start: tief genug an der Kamera, aus großer Höhe über dem Zielpunkt (die Kamera fliegt dann zum Jet); der Hubschrauber schwebt über dem Spieler, höher als die Häuser ringsum
  else if (istHeli) { const h = hoch ? boden + 1200 : Math.max(boden + 60, hausHoeheBei(lat, lon) + 22, flugH === null ? 0 : Math.min(flugH, boden + 2500)); F.setze(lat, lon, h, k.kurs, 0); }
  else { const h = hoch ? boden + 3000 : Math.max(kg.h, boden + 350); F.setze(lat, lon, h, k.kurs, hoch ? 800 : 650); }
  modell.visible = true; scene.add(modell);   // nach einem Absturz war es unsichtbar
  const streifen = new Streifen(MOBIL ? 400 : 900); scene.add(streifen.mesh);
  const J = spiel.jet = { art, flug: F, modell, streifen, blickY: 0, blickP: 0, blickT: 0, kamKurs: F.kursR ?? 0, kamP: new THREE.Vector3(), kamQ: new THREE.Quaternion(), modus: 'verfolger', zielen: false,
    zielKurs: F.kurs, zielNeig: 0, rest: 0, fov: 60, zeit: 0, emit: 0, wirbel: 0, absturz: 0, einflug: null, warnT: 0, machAlt: 0, schuettel: 0, start: { lat, lon } };
  // Einflug: Kamera aus der jetzigen Lage weich zum Jet (Abstand logarithmisch), der Jet wartet so lange
  const P0 = W.lokalZuWelt(camera.position, new THREE.Vector3()), Q0 = W.zuWelt.clone().multiply(camera.quaternion);
  J.einflug = { P0, Q0, t: 0, dauer: weiter ? 0.7 : hoch ? 3.2 : 1.2 };
  jetKamera(0, true);
  W.vorladen(lat, lon);
  if (erdRegime === 'ort') erdRegime = 'kugel';
  spiel.modus = 'jet'; controls.enabled = false; eingabe.spiel = true;
  camera.fov = 60; camera.updateProjectionMatrix();
  $('hilfe').textContent = istHeli ? HELI_HILFE : JET_HILFE; $('hilfe').classList.add('an'); $('jethud').classList.add('an');
  document.body.classList.add('spiel', 'jetan');
  const kn = document.querySelectorAll('#knoepfe button[data-t="schnell"]'), kb = document.querySelector('#knoepfe button[data-t="bremse"]'); if (kn[0]) kn[0].textContent = istHeli ? 'Hoch' : 'Nachbrenner'; if (kb) kb.textContent = istHeli ? 'Runter' : 'Bremse';
  $(istHeli ? 'heliknopf' : 'jetknopf')?.classList.add('an');
  document.querySelectorAll('#spielen button[data-m]').forEach(b => b.classList.remove('an'));   // im Flug ist keiner der Modi Frei, Zu Fuß, Fahren an
  document.activeElement?.blur?.();   // sonst löst die Leertaste (runter, Bremse) den eben geklickten Knopf noch einmal aus
}
function jetEntfernen() {
  const J = spiel.jet; if (!J) return null;
  const pos = { lat: J.flug.geo.lat, lon: J.flug.geo.lon };
  if (!J.behalten) scene.remove(J.modell); if (J.streifen) { scene.remove(J.streifen.mesh); J.streifen.mesh.geometry.dispose(); J.streifen.mesh.material.dispose(); }
  if (J.wasser) { spiel.wasserPseudo = null; for (const id of Object.values(WASSER_KNOEPFE)) $(id)?.classList.remove('an'); $('wasserwahl')?.classList.remove('an'); if (J.modell.userData.kegel) J.modell.userData.kegel.visible = false; if (spiel.uwAn) { const g = erdWelt.lokalZuGeo(camera.position); erdWelt.geoZuLokal(g.lat, g.lon, Math.max(g.h, wasserSpiegel(g.lat, g.lon) + 25), camera.position); } }
  if (J.explosion) { scene.remove(J.explosion); J.explosion = null; }
  spiel.jet = null; jetTon?.pause(false); heliTon?.pause(false);
  if (document.pointerLockElement) document.exitPointerLock();
  camera.fov = 40; camera.updateProjectionMatrix();
  $('jethud')?.classList.remove('an'); document.body.classList.remove('jetan'); $('jetknopf')?.classList.remove('an'); $('heliknopf')?.classList.remove('an');
  const kn = document.querySelector('#knoepfe button[data-t="schnell"]'); if (kn) kn.textContent = 'Rennen';
  { const kb = document.querySelector('#knoepfe button[data-t="bremse"]'); if (kb) kb.textContent = 'Bremse'; }
  return pos;
}
// Höchstes Haus im Umkreis von rund 60 m (Hubschrauberstart)
function hausHoeheBei(lat, lon) { const o = erdOrt; if (!o) return erdBodenGeo(lat, lon); const x = (lon - o.lon) * o.kLon, z = -(lat - o.lat) * o.kLat; let m = 0; for (const e of o.daten.gebaeude) { if (e.rand) continue; const q = e.p[0]; if (Math.abs(q[0] - x) < 80 && Math.abs(q[1] - z) < 80) m = Math.max(m, e.h || 0); } return erdBodenGeo(lat, lon) + m; }
// Haus unter einem Punkt des Ortes: Raster aus 40 m Zellen, damit es je Physikschritt nur wenige Grundrisse zu prüfen gibt
function hausBei(o, x, z) {
  if (!o.hausRaster) { const R = o.hausRaster = new Map(); for (const e of o.daten.gebaeude) { if (e.rand) continue; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [px, pz] of e.p) { x0 = Math.min(x0, px); z0 = Math.min(z0, pz); x1 = Math.max(x1, px); z1 = Math.max(z1, pz); } const h = { e, x0, z0, x1, z1 }; for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) { const k = i * 65536 + j, L = R.get(k); if (L) L.push(h); else R.set(k, [h]); } } }
  const L = o.hausRaster.get(Math.floor(x / 40) * 65536 + Math.floor(z / 40)); if (!L) return null;
  for (const h of L) { if (x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1) continue; let innen = false; const P = h.e.p; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) innen = !innen; if (innen) return h.e; }
  return null;
}
// Aussteigen aus dem Flieger: nur am Boden und fast im Stand. Der Flieger bleibt stehen, die Figur steigt neben ihm aus, später wieder einsteigen mit E
async function flugAussteigen() {
  const J = spiel.jet; if (J?.wasser) return wasserAussteigen(); if (!J || umsteigen) return false; const F = J.flug; if (F.absturz) return false;
  if (!F.amBoden) { const t = performance.now(); if (t - (J.tippZeit || -1e9) > 15000) { J.tippZeit = t; shell?.tipp(F.art === 'heli' ? 'Erst landen: Leertaste halten, er setzt sanft auf' : 'Erst landen: tief und langsam anfliegen, das Fahrwerk kommt von selbst', 4.5); } return false; }
  if (F.kmh > 14) { J.ausWunsch = true; shell?.tipp('Er bremst, dann steigst du aus', 2.5); return false; }
  if (!erdOrt || erdWeg(erdOrt, F.geo.lat, F.geo.lon) > erdOrt.halb * 0.92) { shell?.tipp('Hier ist noch nichts gebaut, einen Moment', 3); if (!erdAuftrag) erdOrtLaden(F.geo.lat, F.geo.lon); return false; }
  const def = spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0], art = F.art; umsteigen = true;
  try {
    F.v.set(0, 0, 0); F.keinPilot = true; J.ausWunsch = false; if (art === 'jet') { F.haubeOffen = true; F.gas = 0; F.nach = 0; } else { F.motorAn = false; }
    J.behalten = true; spiel.parken[art] = { art, F, modell: J.modell };
    erdRegime = 'ort'; erdAnkerAufOrt(erdOrt);
    await spielStarten('fuss', def);
    const f = spiel.figur, A = aktiv;
    if (f) {
      const l = erdWelt.weltZuLokal(F.p, new THREE.Vector3()), o = (art === 'jet' ? _wq.set(2.7, 0, 3.4) : _wq.set(1.7, 0, 2.4)).clone().applyQuaternion(F.q).applyQuaternion(erdWelt.zuLokal), o2 = art === 'jet' ? o.clone().negate() : _wq.set(-1.7, 0, 2.4).clone().applyQuaternion(F.q).applyQuaternion(erdWelt.zuLokal); let x = l.x + o.x, z = l.z + o.z;   // Kampfhubschrauber (Nr. 84): neben dem Cockpit, nicht in den Lenkwaffen
      // Auf dem Dach (Wunsch Nr. 57): die Figur steigt neben dem Flieger auf dasselbe Dach, sonst neben ihm auf den Boden
      const OS = erdOrt?.szene?.ort, dachY = F.aufDach && OS ? OS.dachBei(l.x, l.z) : null; let yF = null;
      if (dachY !== null) { for (const s of [1, -1, 0.6, -0.6, 0.3, -0.3, 0.12]) { const px = l.x + o.x * s, pz = l.z + o.z * s, d = OS.dachBei(px, pz); if (d !== null && Math.abs(d - dachY) < 2.5) { x = px; z = pz; yF = d; break; } } }
      if (yF === null) { if (!A.kollision.frei(x, z)) { x = l.x + o2.x; z = l.z + o2.z; } if (!A.kollision.frei(x, z) && A.startFussSuche) { const q = A.startFussSuche(l.x, l.z); x = q.x; z = q.z; } yF = A.kollision.hoehe(x, z); }   // in der Enge: unten auf den nächsten freien Platz
      f.pos.set(x, yF, z); f.ry = Math.atan2(o.x, o.z); f.bildSetzen?.(); f.boden = yF; A.kollision.yAkt = yF; spiel.rig.yaw = f.ry + 0.55; spiel.rig.pitch = 0.16; spiel.rig.distZiel = spiel.rig.dist = MOBIL ? 7 : 6; ton.tuer(); shell?.tipp('', 0.01);
    }
    return true;
  } finally { umsteigen = false; }
}
function flugEinsteigen(P) { umsteigen = false; jetStarten(P.art, P); }
// Geparkte Flieger: bleiben auf ihrer Stelle der Erde, Rotor läuft aus, Kanzel öffnet
const _pv = new THREE.Vector3();
const _hv = new THREE.Vector3();
function flugHindernisse() {
  const V = aktiv?.verkehr; if (!V || !erdWelt) return; const L = (V.flieger ||= []); L.length = 0; const og = erdOrt?.gruppe, im = erdRegime === 'ort';
  const dazu = (F, art) => { if (F.geo.h - erdBodenGeo(F.geo.lat, F.geo.lon) > 7) return; const r = (F._hind ||= { pos: new THREE.Vector3(), dir: new THREE.Vector3(), L: art === 'jet' ? 15.6 : 15.7, B: art === 'jet' ? 3 : 5.3, vLong: 0, def: { hoehe: 3 } }); erdWelt.weltZuLokal(F.p, r.pos); _hv.set(0, 0, 1).applyQuaternion(F.q).applyQuaternion(erdWelt.zuLokal); if (!im && og) og.worldToLocal(r.pos); r.dir.set(_hv.x, 0, _hv.z).normalize(); L.push(r); };
  for (const P of Object.values(spiel.parken)) if (P && !P.wasser) dazu(P.F, P.art);
  if (spiel.jet && !spiel.jet.wasser) dazu(spiel.jet.flug, spiel.jet.art);
  if (!L.length) V.flieger = null;
}
function parkenTick(dt) { flugHindernisse(); for (const P of Object.values(spiel.parken)) { if (!P) continue; const W = erdWelt; if (P.wasser) { P.F.schritt(Math.min(dt, 0.05), RUHEND); P.F.aktualisiere(); } W.weltZuLokal(P.F.p, P.modell.position); P.modell.quaternion.copy(W.zuLokal).multiply(P.F.q); P.modell.visible = P.modell.position.lengthSq() < 2.5e7; if (P.wasser) continue; if (P.art === 'heli') { P.F.drehzahl *= Math.exp(-dt * 0.35); heliEffekte(P.modell, P.F, dt); } else jetEffekte(P.modell, P.F, performance.now() / 1000, dt); } }
const RUHEND = { gas: 0, lenk: 0, auf: 0, schnell: false };
function jetUmsetzen(lat, lon) {   // Ziel aus der Liste oder Suche: Jet über das Ziel, Kurs bleibt
  const J = spiel.jet; if (!J) return;
  if (J.wasser) { const w = wasserSuchen(lat, lon, 60000); if (!w) { shell?.tipp('Dort ist kein Wasser in der Nähe', 3.5); return; } J.flug.setze(w.lat, w.lon, wasserSpiegel(w.lat, w.lon) - J.flug.d.tiefgang, J.flug.kurs, 0); erdWelt.vorladen(w.lat, w.lon); J.hOff = null; J.einflug = { P0: erdWelt.lokalZuWelt(camera.position, new THREE.Vector3()), Q0: erdWelt.zuWelt.clone().multiply(camera.quaternion), t: 0, dauer: 2.2 }; return; }
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
  { const u = J.modell.userData, cp = J.modus === 'cockpit'; if (u.haube?.material) u.haube.material.visible = !cp; F.keinPilot = cp; if (u.innen) u.innen.visible = cp; if (cp) u.anzeigen?.update(F, dt); if (u.reiter) u.reiter.obj.visible = !cp || J.art === 'uboot'; }
  if (J.modus === 'cockpit') {
    if (J.wasser) { const si = J.modell.userData.sitz; if (si) P.copy(F.p).add(_jv.set(si.x, si.y + 0.72, si.z + (J.art === 'uboot' ? 0.9 : 0.12)).applyQuaternion(F.q)); else P.copy(F.p).add(_jv.set(0, 0.32, 0.2).applyQuaternion(F.q)); }
    else if (J.art === 'heli') P.copy(F.p).add(_jv.set(0, 0.84, 1.48).applyQuaternion(F.q)); else P.copy(F.p).add(_jv.set(0, 0.95, 3.7).applyQuaternion(F.q));   // Hubschrauber: Augen des Piloten im hinteren, erhöhten Sitz (kampfheli.py)
    Q.copy(F.q).multiply(_jy);
    // Blick: leicht nach unten auf die Anzeigen, im Hubschrauber mit der Maus umschauen
    if ((J.blickT += dt) > 2.5) { J.blickY *= Math.exp(-dt * 2); J.blickP *= Math.exp(-dt * 2); }
    Q.multiply(_jq.setFromEuler(_jE.set(-(J.art === 'heli' ? 0.22 : 0.1) + (J.blickP || 0), -(J.blickY || 0), 0, 'YXZ')));   // Hubschrauber etwas tiefer: über den Schützen vorn auf Boden und Bildschirme
  } else if (J.wasser) {   // Verfolger für Boote und Schwimmer: bleibt über den Wellen, beim Tauchen unter der Fläche und über dem Grund
    let dk = F.kursR - J.kamKurs; dk = Math.atan2(Math.sin(dk), Math.cos(dk)); J.kamKurs += dk * (sofort ? 1 : 1 - Math.exp(-2.8 * dt));
    if ((J.blickT += dt) > 2.4) { J.blickY *= Math.exp(-dt * 1.6); J.blickP *= Math.exp(-dt * 1.6); }
    const kA = F.d.kam, k = J.kamKurs + J.blickY, abst = kA[0] * (camera.aspect < 1 ? 1.3 : 1) * (1 + Math.min(0.32, V / 80)), pi = THREE.MathUtils.clamp(Math.atan2(kA[1], kA[0]) + J.blickP - F.nick * 0.7, -0.8, 1.25);
    const vor = new THREE.Vector3().addScaledVector(e.nord, Math.cos(k)).addScaledVector(e.ost, Math.sin(k));
    P.copy(F.p).addScaledVector(vor, -abst * Math.cos(pi));
    let hO = abst * Math.sin(pi) + 0.5; const gk = szeneZuGeo(_jw.copy(P).addScaledVector(oben, hO)), obW = welleHier(gk.lat, gk.lon), figUnter = F.geo.h < welleHier(F.geo.lat, F.geo.lon) - F.d.tiefgang - (J.warUnter ? 0.9 : 1.6);
    if (figUnter) { const un = grundHier(gk.lat, gk.lon) + 1, ob = obW - 0.5; if (gk.h > ob) hO -= gk.h - ob; else if (gk.h < un) hO += Math.min(un, ob) - gk.h; }
    else { const un = Math.max(obW + 0.55, erdBodenGeo(gk.lat, gk.lon) + 1); if (gk.h < un) hO += un - gk.h; }
    J.hOff = sofort || J.hOff == null ? hO : J.hOff + (hO - J.hOff) * (1 - Math.exp(-(figUnter === J.warUnter ? 7 : 14) * dt)); J.warUnter = figUnter;
    P.addScaledVector(oben, J.hOff);
    const blick = new THREE.Vector3().copy(F.p).addScaledVector(oben, F.d.L > 4 ? 1.1 : 0.45).addScaledVector(vor, 2.2).sub(P).normalize(), l2 = new THREE.Vector3().crossVectors(oben, blick).normalize(), u2 = new THREE.Vector3().crossVectors(blick, l2);
    Q.setFromRotationMatrix(_jm.makeBasis(l2.clone().negate(), u2, blick.clone().negate()));
  } else if (J.art === 'heli') {   // Verfolger: folgt dem Kurs weich, Maus schaut um, kehrt nach 2 s zurück
    let d = (F.kursR - J.kamKurs); d = Math.atan2(Math.sin(d), Math.cos(d)); J.kamKurs += d * (sofort ? 1 : 1 - Math.exp(-2.6 * dt));
    if ((J.blickT += dt) > 2) { J.blickY *= Math.exp(-dt * 1.6); J.blickP *= Math.exp(-dt * 1.6); }
    const k = J.kamKurs + J.blickY, abst = (F.amBoden ? 20 : 21 + Math.min(6, V / 12)) * (camera.aspect < 1 ? 1.4 : 1), pi = THREE.MathUtils.clamp(0.2 + J.blickP, -0.2, 1.2);
    const vor = new THREE.Vector3().addScaledVector(e.nord, Math.cos(k)).addScaledVector(e.ost, Math.sin(k));
    // zieht heran, wenn ein Haus im Weg ist, und bleibt über dem Boden
    let ab = abst; for (let i = 0; i < 6; i++) { P.copy(F.p).addScaledVector(vor, -ab * Math.cos(pi)).addScaledVector(oben, ab * Math.sin(pi) + 1.2); const g = szeneZuGeo(P), o = erdOrt; if (!o) break; const x = (g.lon - o.lon) * o.kLon, z = -(g.lat - o.lat) * o.kLat; if (Math.abs(x) > o.halb || Math.abs(z) > o.halb) break; const hs = hausBei(o, x, z); if (!hs || g.h > erdBodenGeo(g.lat, g.lon) + hs.h + 1) break; ab = Math.max(7, ab * 0.72); }
    { const g = szeneZuGeo(P), b = erdBodenGeo(g.lat, g.lon) + 1.2; if (g.h < b) P.addScaledVector(oben, b - g.h); }
    const blick = new THREE.Vector3().copy(F.p).addScaledVector(oben, 0.8).addScaledVector(vor, 3).sub(P).normalize(), l2 = new THREE.Vector3().crossVectors(oben, blick).normalize(), u2 = new THREE.Vector3().crossVectors(blick, l2);
    Q.setFromRotationMatrix(_jm.makeBasis(l2.clone().negate(), u2, blick.clone().negate()));
  } else {
    const abst = (15.5 + Math.min(4, V / 300) + F.nach * 1.5) * (camera.aspect < 1 ? 1.55 : 1);   // Hochformat: weiter weg, sonst füllen die Flügel die Breite
    let vor;
    if (J.zielen) vor = jetZielRichtung(J, e);
    else { J.kamGlatt ??= F.q.clone(); if (sofort) J.kamGlatt.copy(F.q); else J.kamGlatt.slerp(F.q, 1 - Math.exp(-5.5 * dt)); vor = new THREE.Vector3(0, 0, 1).applyQuaternion(J.kamGlatt); }
    const auf = J.zielen ? oben.clone() : new THREE.Vector3(0, 1, 0).applyQuaternion(J.kamGlatt);
    const links = new THREE.Vector3().crossVectors(auf, vor).normalize(), up = new THREE.Vector3().crossVectors(vor, links);
    P.copy(F.p).addScaledVector(vor, -abst).addScaledVector(up, 3.3);
    if (F.amBoden || F.agl < 30) { const g = szeneZuGeo(P), b = erdBodenGeo(g.lat, g.lon) + 1.4; if (g.h < b) P.addScaledVector(oben, b - g.h); }
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
    // Bezug ist der Erdradius am Ziel: die Erde ist kein Ball, mit festen 6.371 km läge die Kamera beim tiefen Start in Mitteleuropa 6 km zu hoch (Wasser, Hubschrauber)
    const RE = P.length() - Math.max(1, szeneZuGeo(P).h), d0 = E.P0.clone().normalize(), d1 = P.clone().normalize(), h0 = Math.max(1, E.P0.length() - RE), h1 = Math.max(1, P.length() - RE);
    const d = d0.clone().lerp(d1, s).normalize(), hh = Math.exp(Math.log(h0) + (Math.log(h1) - Math.log(h0)) * s);
    if (k < 1) { P = E.P0.distanceTo(P) < 2500 ? E.P0.clone().lerp(P, s) : d.multiplyScalar(RE + hh); Q = E.Q0.clone().slerp(Q, s); }
    else J.einflug = null;
  }
  if (window.__jetKamOrbit) {   // Prüfstand (tools/jet_modell.mjs): Kamera umkreist den Jet
    const o = window.__jetKamOrbit, a = o.az * D2Rj, b = o.el * D2Rj, off = new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)).multiplyScalar(o.d).applyQuaternion(F.q);
    P.copy(F.p).add(off); const blick = off.clone().negate().normalize(), l2 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0).applyQuaternion(F.q), blick).normalize(), u2 = new THREE.Vector3().crossVectors(blick, l2);
    Q.setFromRotationMatrix(_jm.makeBasis(l2.clone().negate(), u2, blick.clone().negate()));
  }
  J.kamP.copy(P); J.kamQ.copy(Q);
  // Sichtwinkel wächst mit dem Tempo
  const fov = J.wasser ? (J.modus === 'cockpit' ? 72 : 56) + Math.min(16, V * 0.42) : J.art === 'heli' ? (J.modus === 'cockpit' ? 72 : 55) + Math.min(10, V * 0.12) : (J.modus === 'cockpit' ? 70 : 58) + 20 * Math.min(1, V / 1150) + F.nach * 5;
  J.fov += (fov - J.fov) * (sofort ? 1 : 1 - Math.exp(-3 * dt));
  if (Math.abs(camera.fov - J.fov) > 0.05) { camera.fov = J.fov; camera.updateProjectionMatrix(); }
}
function jetZielRichtung(J, e) {
  const k = J.zielKurs * D2Rj, n = J.zielNeig * D2Rj;
  return new THREE.Vector3().addScaledVector(e.nord, Math.cos(k) * Math.cos(n)).addScaledVector(e.ost, Math.sin(k) * Math.cos(n)).addScaledVector(e.oben, Math.sin(n)).normalize();
}
// Ein Takt des Hubschraubers: Eingaben, Physik in festen Schritten, Boden, Kamera, Anzeige
function heliTick(dt) {
  const J = spiel.jet, F = J.flug; J.zeit += dt;
  if (eingabe.gedrueckt('kamera')) J.modus = J.modus === 'cockpit' ? 'verfolger' : 'cockpit';
  if (eingabe.gedrueckt('ton') && heliTon) heliTon.an = !heliTon.an;
  eingabe.achse(_ach); const b = eingabe.bild(); if (b.x || b.y) { J.blickY -= b.x * 0.0045; J.blickP += b.y * 0.0035; J.blickT = 0; }
  const hoch = (eingabe.an('schnell') ? 1 : 0) - (eingabe.an('bremse') ? 1 : 0), seite = (eingabe.an('gierRechts') ? 1 : 0) - (eingabe.an('gierLinks') ? 1 : 0), e = { vor: _ach.y, seite: eingabe.stickAktiv ? 0 : seite, gier: _ach.x, hoch };
  if (J.ausWunsch && F.amBoden && F.kmh <= 14) { flugAussteigen().catch(x => console.warn(x)); return; }
  if (!J.einflug && !F.absturz) {
    J.rest = Math.min(J.rest + dt, 0.1); const h = 1 / 120;
    while (J.rest >= h) { J.rest -= h; F.aktualisiere(); F.schritt(h, e); if (flugBoden(F, J, h)) break; }
  }
  F.aktualisiere();
  absturzTakt(F, J, dt);
  jetKamera(dt); jetSzene(); heliEffekte(J.modell, F, dt);
  // Staub unter dem Rotor
  if (effekte && F.agl < 14 && (J.staubT = (J.staubT || 0) - dt) < 0 && !F.absturz) { J.staubT = 0.05; const a = Math.random() * 6.283, r = 3 + Math.random() * 3.5, x = J.modell.position.x + Math.cos(a) * r, z = J.modell.position.z + Math.sin(a) * r, y = J.modell.position.y - F.agl - F.radHoehe + 0.2; effekte.qualm(x, y, z, Math.cos(a) * 26, Math.sin(a) * 26, 0.12 * (1 - F.agl / 14) * F.drehzahl, 0.9); }
  if (heliTon) { heliTon.pause(document.visibilityState === 'visible'); heliTon.setze(F); }
  jetHud(J, dt);
}
// Bodenkontakt von Jet und Hubschrauber: aufsetzen, wenn es sanft genug ist, sonst Absturz. Am Boden folgt er dem Gelände. Liefert true bei Absturz
function flugBoden(F, J, h) {
  const g = szeneZuGeo(F.p), o = erdOrt, x = o ? (g.lon - o.lon) * o.kLon : 0, z = o ? -(g.lat - o.lat) * o.kLat : 0, imOrt = o && Math.abs(x) < o.halb - 2 && Math.abs(z) < o.halb - 2, OS = imOrt ? o.szene?.ort : null, hA0 = OS && g.h - o.h0 < 900 ? OS.hausAm(x, z) : null, haus = hA0?.e.g || null;   // jedes Haus des Ortes, auch am Rand
  const unten = erdBodenGeo(g.lat, g.lon), dach = haus ? o.h0 + OS.dachBei(x, z) : 0, kufe = g.h - F.radHoehe, aufDach = haus && kufe > dach - 1.2, b = aufDach ? dach : unten, wasser = !o && unten < 0.6; F.agl = g.h - b - F.radHoehe; F.aufDach = !!aufDach;
  if (F.amBoden) {
    if (F.agl > 1.6) { F.amBoden = false; return false; }   // über die Kante gerollt (Dachrand, Hang)
    if (haus && !aufDach) { if (F.kmh > 45) return flugAbsturz(F, J); if (F.kmh > 1) { F.p.addScaledVector(F.v, -h * 4); F.v.set(0, 0, 0); J.schuettel = Math.max(J.schuettel, 0.4); ton.stoss?.(0.3); } return false; }   // rollt gegen eine Wand
    geoZuSzene(g.lat, g.lon, b + F.radHoehe, F.p); return false;
  }
  // Kampfhubschrauber (Nr. 84, Rotor 14,6 m): sechs Punkte am Rotorkreis gegen die Häuser. Langsam schiebt ihn die Wand weg, ab 40 km/h ist es ein Rotorschlag
  if (F.art === 'heli' && OS && !F.amBoden && g.h - o.h0 < 900) {
    const yR = g.h - o.h0 + 2.0; let px = 0, pz = 0, n = 0;
    for (let k = 0; k < 6; k++) { const w = k * Math.PI / 3, sx = x + Math.cos(w) * 6.8, sz = z + Math.sin(w) * 6.8, hs = OS.hausAm(sx, sz); if (!hs) continue; const d = OS.dachBei(sx, sz); if (d === null || yR > d - 0.3 || yR < (hs.e.basis || 0) + (hs.e.g.m || 0)) continue; px += x - sx; pz += z - sz; n++; }
    if (n) {
      if (F.kmh > 40) return flugAbsturz(F, J);
      const L = Math.hypot(px, pz) || 1, s = 0.12; geoZuSzene(g.lat - (pz / L * s) / o.kLat, g.lon + (px / L * s) / o.kLon, g.h, F.p); F.v.multiplyScalar(0.8); J.schuettel = Math.min(1, J.schuettel + 0.05);
    }
  }
  if (haus && !aufDach) {   // von der Seite ins Haus: ein langsamer Hubschrauber prallt ab, alles andere stürzt ab
    const y = g.h - o.h0, bo = unten - o.h0; if (y > bo + (haus.m || 0) - 0.5) { if (F.art === 'heli' && F.kmh < 40) { F.p.addScaledVector(F.v, -h * 6); F.v.multiplyScalar(-0.35); J.schuettel = Math.min(1, J.schuettel + 0.5); ton.stoss?.(0.4); return false; } return flugAbsturz(F, J); }
  }
  if (F.agl <= 0) {
    const sink = -F.steigen, quer = Math.abs(F.quer), neig = F.neigung;
    const ok = !wasser && (F.art === 'heli' ? sink < 8 && quer < 24 && Math.abs(neig) < 24 && F.kmh < 110 : F.fahrwerk > 0.85 && sink < 10 && quer < 22 && neig > -7 && neig < 24 && F.kmh < 480);
    if (!ok) return flugAbsturz(F, J);
    if (F.aufsetzen) F.aufsetzen(); else F.amBoden = true; geoZuSzene(g.lat, g.lon, b + F.radHoehe, F.p);
    F.v.addScaledVector(F.e.oben, -F.v.dot(F.e.oben)); F.aktualisiere(); J.schuettel = Math.min(1, J.schuettel + Math.min(0.5, sink * 0.08)); ton.stoss?.(Math.min(0.5, 0.1 + sink * 0.05)); J.staubStoss = 1;
    if (shell?.aktiv) { shell.tipp(MOBIL ? 'Gelandet · Ein Aus zum Aussteigen' : 'Gelandet · E zum Aussteigen', 5); shell.landung?.(F.art); }
  }
  return false;
}
function flugAbsturz(F, J) {
  window.__flugLog?.push({ was: 'absturz', kmh: F.kmh, agl: F.agl, boden: F.amBoden, st: F.steigen, neig: F.neigung, quer: F.quer, fw: F.fahrwerk, dach: F.aufDach, h: F.geo.h, unten: erdBodenGeo(F.geo.lat, F.geo.lon), lat: F.geo.lat, lon: F.geo.lon, ort: erdOrt && [erdOrt.lat, erdOrt.lon, erdOrt.halb], haus: erdOrt && (() => { const e = hausBei(erdOrt, (F.geo.lon - erdOrt.lon) * erdOrt.kLon, -(F.geo.lat - erdOrt.lat) * erdOrt.kLat); return e && { h: e.h, m: e.m, art: e.art, n: e.p.length }; })(), am: erdOrt?.szene?.ort && (() => { const g = szeneZuGeo(F.p), x = (g.lon - erdOrt.lon) * erdOrt.kLon, z = -(g.lat - erdOrt.lat) * erdOrt.kLat, h = erdOrt.szene.ort.hausAm(x, z); return { x: +x.toFixed(1), z: +z.toFixed(1), typ: h?.e.typ, id: h?.e.g.id, hh: h?.e.g.h, dach: h && erdOrt.szene.ort.dachBei(x, z), box: h && [h.x0, h.z0, h.x1, h.z1].map(v => +v.toFixed(1)) }; })(), stack: new Error().stack.split('\n').slice(1, 4).join(' ') });
  F.absturz = { t: 0, p: F.p.clone() }; F.v.set(0, 0, 0); F.amBoden = false; J.ausWunsch = false; J.modell.visible = false; J.schuettel = 1; (F.art === 'heli' ? heliTon : jetTon)?.knall(1.4); polizei.leeren(aktiv);
  const ex = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending })); ex.frustumCulled = false; scene.add(ex); J.explosion = ex;
  return true;
}
// Absturz: Knall, Feuerball, nach 2,5 s neu in der Luft über der Stelle
function absturzTakt(F, J, dt) {
  if (!F.absturz) return; F.absturz.t += dt;
  if (J.explosion) { const t = F.absturz.t, s = 6 + t * 70; J.explosion.scale.setScalar(s); J.explosion.material.opacity = Math.max(0, 1 - t / 1.4); erdWelt.weltZuLokal(F.absturz.p, J.explosion.position); }
  if (F.absturz.t > 2.5) { const b = erdBodenGeo(F.geo.lat, F.geo.lon); if (F.art === 'heli') { F.setze(F.geo.lat, F.geo.lon, Math.max(b + 70, hausHoeheBei(F.geo.lat, F.geo.lon) + 25), F.kurs, 0); } else { F.setze(F.geo.lat, F.geo.lon, b + 1500, F.kurs, 700); J.zielKurs = F.kurs; J.zielNeig = 0; } if (J.explosion) { scene.remove(J.explosion); J.explosion = null; } J.modell.visible = true; }
}
function jetTick(dt) {
  const J = spiel.jet; if (!J) return;
  if (J.wasser) { wasserTick(dt); return; }
  if (J.art === 'heli') { heliTick(dt); return; }
  const F = J.flug; J.zeit += dt;
  if (eingabe.gedrueckt('kamera')) J.modus = J.modus === 'cockpit' ? 'verfolger' : 'cockpit';
  if (eingabe.gedrueckt('ton') && jetTon) jetTon.an = !jetTon.an;
  // Fahrwerk: G schaltet, sonst von selbst: tief und langsam raus, oben wieder rein
  if (eingabe.gedrueckt('fahrwerk')) { F.fahrwerkZiel = F.fahrwerkZiel > 0.5 ? 0 : 1; J.fwHand = 12; ton.klick(); }
  if (window.__fahrwerkZiel !== undefined) F.fahrwerkZiel = window.__fahrwerkZiel;
  else if ((J.fwHand = (J.fwHand || 0) - dt) <= 0) { if (F.agl < 170 && F.kmh < 560) F.fahrwerkZiel = 1; else if (F.agl > 260 || F.kmh > 640) F.fahrwerkZiel = 0; }
  if (F.amBoden) F.fahrwerkZiel = 1;
  // Eingaben: Tasten direkt, Stick am Handy, Maus Zielen
  eingabe.achse(_ach);
  const kNase = (eingabe.an('naseHoch') ? 1 : 0) - (eingabe.an('naseRunter') ? 1 : 0), kRoll = (eingabe.an('rollRechts') ? 1 : 0) - (eingabe.an('rollLinks') ? 1 : 0), kGier = (eingabe.an('gierRechts') ? 1 : 0) - (eingabe.an('gierLinks') ? 1 : 0);
  let nase = kNase, rollen = kRoll, gieren = kGier;
  if (eingabe.stickAktiv) { nase = -_ach.y; rollen = _ach.x; }   // Stick hoch drückt die Nase (wie ein Steuerknüppel)
  if (eingabe.an('gasPlus')) F.gas = Math.min(1, F.gas + dt * 0.6);
  if (eingabe.an('gasMinus')) F.gas = Math.max(0, F.gas - dt * 0.6);
  if (MOBIL) { if (F.amBoden) F.gas = eingabe.an('schnell') || nase > 0.2 ? 0.95 : 0; else F.gas = Math.max(F.gas, F.fahrwerk > 0.8 && F.agl < 170 ? 0.2 : 0.8); }
  if (!F.amBoden && F.fahrwerk > 0.8 && F.agl < 170 && !eingabe.an('gasPlus') && !eingabe.an('schnell')) F.gas = Math.max(0.2, F.gas - dt * 0.4);   // Anflug: der Schub geht von selbst zurück
  if (J.ausWunsch && F.amBoden) { F.gas = 0; if (F.kmh <= 14) { flugAussteigen().catch(x => console.warn(x)); return; } }
  const nach = !J.ausWunsch && (eingabe.an('schnell') || !!window.__jetNach), bremse = eingabe.an('bremse') || !!J.ausWunsch;
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
      if (flugBoden(F, J, h)) break;
    }
  }
  F.aktualisiere();
  absturzTakt(F, J, dt);
  // Kondensstreifen in kalter Luft, Wirbel an den Flügelspitzen bei hoher Last
  J.emit += dt; J.wirbel += dt;
  // Kondensstreifen entstehen erst 60 m hinter den Düsen (die Feuchte braucht Zeit zum Gefrieren), Wirbel an den Flügelspitzen sind dünn
  if (!F.absturz && F.geo.h > 7800 && F.sigma > 0.004 && J.emit > 0.035) { J.emit = 0; for (const d of jetModell.userData.duesen) J.streifen.neu(d.clone().add(_jv.set(0, 0, -60)).applyQuaternion(F.q).add(F.p), 26, 3.5); }
  if (!F.absturz && Math.abs(F.lastSchnitt || 0) > 4.5 && F.geo.h < 7000 && J.wirbel > 0.015) { J.wirbel = 0; for (const d of jetModell.userData.fluegelSpitzen) J.streifen.neu(d.clone().applyQuaternion(F.q).add(F.p), 0.6, 0.22); }
  jetKamera(dt);
  jetSzene();
  J.streifen.update(dt, erdWelt, innerHeight / (2 * Math.tan(camera.fov * D2Rj / 2)));
  jetEffekte(J.modell, F, J.zeit, dt);
  if (F.mach >= 1 && J.machAlt < 1 && F.sigma > 0.1) J.schuettel = Math.min(1, J.schuettel + 0.7);
  J.machAlt = F.mach;
  if (jetTon) { jetTon.pause(document.visibilityState === 'visible'); jetTon.setze(F, dt); }
  jetHud(J, dt);
}
// ---------- Auf und unter dem Wasser (Wunsch Nr. 64, kit/wasserfahrt.js, kit/unterwasser.js, 14_MITFAHREN.md) ----------
// Speedboot, Jetski, U-Boot und Schwimmer laufen im Modus der Flieger (spiel.jet mit wasser: true): gleicher Anker, gleiche Anzeige, überall auf der Erde.
const WASSER_HILFE = {
  speedboot: MOBIL ? 'Stick lenkt und gibt Gas · Turbo · Bremse · Ein Aus am Ufer' : 'W S Gas und zurück · A D lenken · Shift Turbo · Leertaste Bremse · Maus ziehen schaut um · C Kamera · E am Ufer aussteigen',
  jetski: MOBIL ? 'Stick lenkt und gibt Gas · Turbo · Bremse · Ein Aus am Ufer' : 'W S Gas und zurück · A D lenken · Shift Turbo · Leertaste Bremse · Maus ziehen schaut um · C Kamera · E am Ufer aussteigen',
  uboot: MOBIL ? 'Stick vor und drehen · Hoch · Runter, lange halten wird schneller · Ein Aus aufgetaucht am Ufer' : 'W S vor und zurück · A D drehen · Leertaste tauchen · Shift auftauchen, lange halten wird schneller · C Kamera · E aufgetaucht am Ufer',
  schwimmer: MOBIL ? 'Stick schwimmt · Hoch · Runter taucht, lange halten wird schneller · ans Ufer schwimmen steigt aus' : 'W S schwimmen · A D drehen · Leertaste abtauchen · Shift auftauchen und schneller · ans Ufer schwimmen steigt aus',
};
let unterwasser = null; const wasserModelle = {}, _wl = new THREE.Vector3(), _wk = new THREE.Vector3(), _wn = new THREE.Vector3();
// Wasserfläche hier in Metern über dem Meer: im Ort wie sein Wasser (Meer auf 0, Flüsse und Seen auf dem Gelände), sonst wie die Kugel
function wasserSpiegel(lat, lon) {
  const o = erdOrt;
  if (o) { const x = (lon - o.lon) * o.kLon, z = -(lat - o.lat) * o.kLat; if (Math.abs(x) < o.halb - 2 && Math.abs(z) < o.halb - 2) return o.daten.meta?.amMeer ? 0 : o.h0 + o.szene.ort.Hboden(x, z) - 0.45; }
  const v = erdWelt.bodenGeo(lat, lon); return v < 4 ? 0 : v + 0.45;   // grobe Höhen an der Küste rauschen um ein paar Meter: das Meer bleibt auf 0
}
// Liegt hier Wasser? Im Ort seine Wasserflächen (Ergebnis im 4 m Raster gemerkt), sonst die Maske der Kugel
function wasserHier(lat, lon) {
  const o = erdOrt;
  if (o) { const x = (lon - o.lon) * o.kLon, z = -(lat - o.lat) * o.kLat; if (Math.abs(x) < o.halb - 2 && Math.abs(z) < o.halb - 2) { const C = (o.wasserMemo ||= new Map()), k = Math.round(x / 4) * 100003 + Math.round(z / 4); let v = C.get(k); if (v === undefined) { v = (o.daten.wasser || []).some(w => inside(w[0], x, z) && !w.slice(1).some(l => inside(l, x, z))); if (C.size > 8000) C.clear(); C.set(k, v); } return v; } }
  return erdWelt.erde.wasserBei(lat, lon) > 0.5;
}
// Nächstes Wasser, das breit genug ist. Liefert Lage und Entfernung oder null
function wasserSuchen(lat, lon, bis = 600000) {
  const cl = Math.max(0.05, Math.cos(lat * D2Rj)), kLa = 12 / 111195, kLo = 12 / (111195 * cl), ok = (la, lo) => wasserHier(la, lo) && wasserHier(la + kLa, lo) && wasserHier(la - kLa, lo) && wasserHier(la, lo + kLo) && wasserHier(la, lo - kLo);
  if (ok(lat, lon)) return { lat, lon, weg: 0 };
  for (let r = 30; r < bis; r *= 1.3) for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, la = lat + Math.sin(a) * r / 111195, lo = lon + Math.cos(a) * r / (111195 * cl); if (ok(la, lo)) return { lat: la, lon: lo, weg: r }; }
  return null;
}
// Nächster freier Punkt an Land (zum Aussteigen), zuerst in Fahrtrichtung
function landSuchen(lat, lon, R, kursR = 0) {
  const A = aktiv, o = erdOrt, cl = Math.max(0.05, Math.cos(lat * D2Rj)); if (!o || !A?.kollision) return null;
  for (let r = 1.5; r <= R; r *= 1.22) for (let i = 0; i < 20; i++) { const s = i % 2 ? (i + 1) / 2 : -i / 2, a = kursR + s * Math.PI / 10, la = lat + Math.cos(a) * r / 111195, lo = lon + Math.sin(a) * r / (111195 * cl), x = (lo - o.lon) * o.kLon, z = -(la - o.lat) * o.kLat; if (Math.abs(x) > o.halb - 3 || Math.abs(z) > o.halb - 3 || wasserHier(la, lo) || !A.kollision.frei(x, z)) continue; const la2 = lat + Math.cos(a) * (r + 1.5) / 111195, lo2 = lon + Math.sin(a) * (r + 1.5) / (111195 * cl); if (wasserHier(la2, lo2)) continue; return { lat: la, lon: lo, x, z }; }
  return null;
}
// Oberfläche mit den Wellen dort, wo das Wellennetz wirklich liegt; in schmalem Wasser kleiner (spiel.wellenF)
function welleHier(lat, lon) { const sp = wasserSpiegel(lat, lon); if (!meer?.karteGut || !meer.nah) return sp; erdWelt.geoZuLokal(lat, lon, sp, _wl); return sp + meer.hoeheBei(_wl) * (spiel.wellenF ?? 1); }
function grundHier(lat, lon) {
  const sp = wasserSpiegel(lat, lon); let b = unterwasser ? unterwasser.bodenBei(lat, lon, sp) : sp - 20; const o = erdOrt;
  if (o) { const x = (lon - o.lon) * o.kLon, z = -(lat - o.lat) * o.kLat; if (Math.abs(x) < o.halb - 2 && Math.abs(z) < o.halb - 2) b = Math.max(b, o.h0 + o.szene.ort.Hboden(x, z)); }
  return Math.min(b, sp - 1.5);
}
const wasserHilfe = { welle: welleHier, boden: grundHier, wasser: wasserHier };
// Mit dem U-Boot direkt zu einem Wrack oder Tiefseegraben. Am Wrack etwas seitlich, mit Blick darauf
function wasserZuStelle(o) { const kurs = (o.kurs ?? 40) * D2Rj, ab = o.L ? o.L * 0.052 + 34 : 0, a = kurs + Math.PI * 0.62, cl = Math.cos(o.lat * D2Rj), lat = o.lat + Math.cos(a) * ab / 111195, lon = o.lon + Math.sin(a) * ab / (111195 * cl); return wasserStarten('uboot', null, { lat, lon, fest: true, zumGrund: true, kurs: (a + Math.PI) / D2Rj, name: o.name, grundHoehe: o.L ? 12 : 8 }).catch(e => console.warn(e)); }
async function wasserStarten(art, weiter = null, wo = null) {
  if (!aktiv?.erde || !erdWelt || !WASSER_ARTEN[art]) return false;
  const k = erdKam, hoch = k.hoehe > 25000, s0 = weiter ? null : (wo || spielerGeo());
  let lat = hoch && !s0 ? k.lat : (s0?.lat ?? k.kamGeo.lat), lon = hoch && !s0 ? k.lon : (s0?.lon ?? k.kamGeo.lon), weg = 0;
  if (weiter) { lat = weiter.F.geo.lat; lon = weiter.F.geo.lon; }
  const kurs0 = wo?.kurs ?? (spiel.modus === 'jet' && spiel.jet ? spiel.jet.flug.kurs : k.kurs);
  if (!weiter && !wo?.fest) { const w = wasserSuchen(lat, lon); if (!w) { shell?.tipp('Hier ist kein Wasser in der Nähe. Flieg ans Meer oder an einen See', 4.5); return false; } lat = w.lat; lon = w.lon; weg = w.weg; }
  const def = wo?.def || (spiel.modus === 'fuss' ? spiel.wahl : null) || spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0];
  if (spiel.modus !== 'frei') spielBeenden();
  fahrt = null; folge = null; jetHudBauen();
  if (!weiter && spiel.parken[art]) { const alt = spiel.parken[art]; scene.remove(alt.modell); spiel.parken[art] = null; }
  unterwasser ||= new Unterwasser(scene, { mobil: MOBIL });
  const modell = wasserModelle[art] ||= art === 'schwimmer' ? Object.assign(new THREE.Group(), { name: 'schwimmer' }) : wasserModell(art), W = erdWelt, F = weiter ? weiter.F : new Wasserfz(art, wasserHilfe);
  spiel.wellenF = 1;
  if (weiter) spiel.parken[art] = null; else { const sp = wasserSpiegel(lat, lon); F.setze(lat, lon, sp - F.d.tiefgang, kurs0, 0); }
  modell.visible = true; scene.add(modell);
  const J = spiel.jet = { art, flug: F, modell, streifen: null, blickY: 0, blickP: 0, blickT: 0, kamKurs: F.kursR, kamP: new THREE.Vector3(), kamQ: new THREE.Quaternion(), modus: 'verfolger', zielen: false, zielKurs: F.kurs, zielNeig: 0, rest: 0, fov: 60, zeit: 0, emit: 0, wirbel: 0, absturz: 0, einflug: null, warnT: 0, machAlt: 0, schuettel: 0, start: { lat, lon }, wasser: true, halt: 0, haltW: 0, hOff: null, def, sp: wasserSpiegel(lat, lon), krawl: 0, clip: null, letzte: { lat, lon }, zumGrund: wo?.zumGrund ? 12 : 0, grundZiel: wo?.name || null, grundHoehe: wo?.grundHoehe || 0, spritzT: 0, blasenT: 0, lampe: 0, landT: 0 };
  spiel.figurDef = def; reiterSetzen(J).catch(e => console.warn(e));
  const P0 = W.lokalZuWelt(camera.position, new THREE.Vector3()), Q0 = W.zuWelt.clone().multiply(camera.quaternion);
  J.einflug = { P0, Q0, t: 0, dauer: weiter ? 0.6 : hoch ? 3.2 : weg > 3000 || wo?.zumGrund ? 2.4 : wo?.fest ? 0.25 : 1.2 };
  jetKamera(0, true); W.vorladen(lat, lon);
  if (erdRegime === 'ort') erdRegime = 'kugel';
  spiel.modus = 'jet'; controls.enabled = false; eingabe.spiel = true; camera.fov = 60; camera.updateProjectionMatrix();
  $('hilfe').textContent = WASSER_HILFE[art]; $('hilfe').classList.add('an'); $('jethud').classList.add('an'); for (const id of ['jnase', 'jbahn', 'jziel']) $(id).style.display = 'none';
  document.body.classList.add('spiel', 'jetan');
  { const kn = document.querySelector('#knoepfe button[data-t="schnell"]'), kb = document.querySelector('#knoepfe button[data-t="bremse"]'), tauch = F.d.tauch; if (kn) kn.textContent = tauch ? 'Hoch' : 'Turbo'; if (kb) kb.textContent = tauch ? 'Runter' : 'Bremse'; }
  for (const [a, id] of Object.entries(WASSER_KNOEPFE)) $(id)?.classList.toggle('an', a === art); $('wasserwahl')?.classList.add('an');
  document.querySelectorAll('#spielen button[data-m]').forEach(b => b.classList.remove('an'));
  document.activeElement?.blur?.();
  if (weg > 150 && !wo) shell?.tipp(`Nächstes Wasser ${weg >= 1000 ? (weg / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(weg) + ' m'} von hier`, 3.5);
  return true;
}
const WASSER_KNOEPFE = { speedboot: 'bootknopf', jetski: 'jetskiknopf', uboot: 'ubootknopf', schwimmer: 'schwimmknopf' };
// Figur am Steuer oder im Wasser. Nur Higgsfield Figuren (Regel Nr. 13, 17), Haltung aus kit/people.js
async function reiterSetzen(J) {
  if (hintergrund) await hintergrund;
  const u = J.modell.userData, def = J.def, schw = J.art === 'schwimmer';
  if (u.reiter && u.reiterDef === def?.id) return;
  const q = menschenQuellen.find(s => s.def.id === def?.id) || (def ? await loadPerson(def).catch(() => null) : null) || menschenQuellen[0]; if (!q || spiel.jet !== J) return;
  if (u.reiter) J.modell.remove(u.reiter.obj);
  const f = spawn(q, bewegungen); f.obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  u.reiter = f; u.reiterDef = def?.id; J.modell.add(f.obj); J.clip = null;
  if (!schw) { const s = u.sitz; f.obj.position.set(s.x, s.y, s.z); f.obj.rotation.y = s.ry || 0; aktionBereit(f, 'sitzen'); f.play(f.acts.sitzen ? 'sitzen' : 'stehen', 0); }
  else { aktionBereit(f, 'schwimmen'); aktionBereit(f, 'treten'); }
}
// Ein Takt: Eingaben, Physik in festen Schritten, Kamera, Figur, Gischt, Anzeige
function wasserTick(dt) {
  const J = spiel.jet, F = J.flug, d = F.d, u = J.modell.userData; J.zeit += dt;
  if (eingabe.gedrueckt('kamera')) J.modus = J.modus === 'cockpit' ? 'verfolger' : 'cockpit';
  eingabe.achse(_ach); const b = eingabe.bild(); if (b.x || b.y) { J.blickY -= b.x * 0.0045; J.blickP += b.y * 0.0035; J.blickT = 0; }
  J.sp = wasserSpiegel(F.geo.lat, F.geo.lon);
  const hoch = eingabe.an('schnell'), runter = eingabe.an('bremse'), tief = Math.max(0, J.sp - F.geo.h);
  J.halt = hoch || runter ? J.halt + dt : 0; J.haltW = _ach.y > 0.5 ? J.haltW + dt : 0;
  const e = d.tauch ? { gas: _ach.y, lenk: _ach.x, auf: (hoch ? 1 : 0) - (runter ? 1 : 0), schnell: (hoch && tief < 2.5) || J.halt > 1.4 || (J.haltW > 2.5 && tief > 30) } : { gas: runter ? (F.vF > 0.6 ? -1 : F.vF < -0.6 ? 1 : 0) : _ach.y, lenk: _ach.x, auf: 0, schnell: hoch };
  // Wellen in schmalem Wasser kleiner
  if ((J.tSchmal = (J.tSchmal ?? 0) - dt) < 0) { J.tSchmal = 0.5; const g = F.geo, cl = Math.max(0.05, Math.cos(g.lat * D2Rj)); let n = 0; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; if (wasserHier(g.lat + Math.sin(a) * 160 / 111195, g.lon + Math.cos(a) * 160 / (111195 * cl))) n++; } spiel.wellenF = n >= 4 ? 1 : n >= 2 ? 0.4 : 0.16; }
  if (!J.einflug) {
    J.rest = Math.min(J.rest + dt, 0.1); const h = 1 / 60;
    while (J.rest >= h) { J.rest -= h; F.schritt(h, e); }
  }
  // Tauchen bis zur gewählten Stelle: sobald die feinen Tiefen da sind, steht das U-Boot rund 35 m über dem Grund
  if (J.zumGrund > 0) { J.zumGrund -= dt; if (unterwasser.karte.bereit(F.geo.lat, F.geo.lon) || J.zumGrund <= 0) { const bg = grundHier(F.geo.lat, F.geo.lon); F.geo.h = Math.min(bg + (J.grundHoehe || 14), J.sp - 3); F.vZ = 0; F.nick = 0; J.zumGrund = 0; J.hOff = null; if (J.grundZiel) shell?.tipp(`${J.grundZiel} · ${fmt(J.sp - bg)} m tief`, 5); } }
  // Schwimmer: am Ufer raus, ohne gebauten Ort zurück ins Wasser. Boote: wenn der Ort das Wasser anders zeichnet als die Kugel, zum nächsten Wasser
  const istW = wasserHier(F.geo.lat, F.geo.lon);
  if (istW) { J.letzte.lat = F.geo.lat; J.letzte.lon = F.geo.lon; J.landT = 0; }
  else if (J.art === 'schwimmer') { J.landT += dt; if (J.landT > 0.08 && !F.unter) { if (erdOrt && erdWeg(erdOrt, F.geo.lat, F.geo.lon) < erdOrt.halb * 0.92) { wasserAussteigen(true).catch(x => console.warn(x)); return; } F.geo.lat = J.letzte.lat; F.geo.lon = J.letzte.lon; F.vF = 0; } }
  else if ((J.landT += dt) > 0.8 && !F.unter) { J.landT = 0; const w = wasserSuchen(F.geo.lat, F.geo.lon, 1500); if (w) { F.geo.lat = w.lat; F.geo.lon = w.lon; F.vF *= 0.2; } }
  F.aktualisiere();
  if (F.imWasser && J.warLuft && (J.luftT || 0) > 0.25) { J.schuettel = Math.min(1, J.schuettel + 0.3); J.spritz = 1; } J.warLuft = F.imWasser === false; J.luftT = J.warLuft ? (J.luftT || 0) + dt : 0;
  jetKamera(dt); jetSzene();
  // Figur
  const f = u.reiter;
  if (f) {
    if (J.art === 'schwimmer') {
      const v = Math.abs(F.vF), krawl = Math.max(THREE.MathUtils.smoothstep(v, 0.2, 0.65), Math.abs(F.vZ) > 0.6 ? 0.8 : 0); J.krawl += (krawl - J.krawl) * (1 - Math.exp(-dt * 4));
      const name = J.krawl > 0.5 ? 'schwimmen' : 'treten'; if (J.clip !== name && f.acts[name]) { f.play(name, 0.45); J.clip = name; }
      f.obj.rotation.x = J.krawl * 1.38; f.obj.position.set(0, -1.16 * (1 - J.krawl) + (F.tauchen ? -0.1 : -0.2) * J.krawl, -0.86 * J.krawl);
      f.mixer.update(dt * (J.clip === 'schwimmen' ? THREE.MathUtils.clamp(0.7 + v * 0.4, 0.7, 2.2) : 1));
    } else f.mixer.update(dt);
  }
  if (u.schrauben) { const dr = (F.motor * 34 + Math.abs(F.vZ) * 2) * Math.sign(F.gas || 1) * dt; for (const sr of u.schrauben) sr.rotation.z += dr; }
  wasserEffekte(J, F, dt);
  spiel.wasserPseudo = J.art === 'schwimmer' ? null : { kmh: F.kmh, drehzahl: THREE.MathUtils.clamp(0.14 + F.motor * 0.45 + Math.abs(F.vF) / d.vMax * 0.45, 0, 1.05), gas: Math.abs(F.gas), klasse: J.art === 'uboot' ? 'bus' : null };
  wasserHud(J, dt);
}
function wasserEffekte(J, F, dt) {
  if (!effekte || J.einflug) return; const d = F.d, m = J.modell, vor = _wk.set(0, 0, 1).applyQuaternion(m.quaternion), v = Math.abs(F.vF), p = m.position;
  if (F.unter || (d.tauch && F.tauchen)) {   // Blasen
    if ((J.blasenT -= dt) < 0 && (v > 0.3 || Math.abs(F.vZ) > 0.2 || J.art === 'schwimmer')) { J.blasenT = J.art === 'uboot' ? 0.035 : 0.16; const s = J.art === 'uboot' ? -3.7 : 0.9; effekte.gischt(p.x + vor.x * s + (Math.random() - 0.5) * 0.5, p.y + vor.y * s + (J.art === 'uboot' ? 0 : 0.2), p.z + vor.z * s + (Math.random() - 0.5) * 0.5, 0, 0.8, 0, 0.5, J.art === 'uboot' ? 0.2 : 0.09, true); }
    return;
  }
  // Gischt am Heck und seitlich am Bug, stärker mit dem Tempo, nur im Wasser
  if (J.art === 'schwimmer') { if (v > 0.5 && (J.spritzT -= dt) < 0) { J.spritzT = 0.24; effekte.gischt(p.x + vor.x * 0.9 + (Math.random() - 0.5) * 0.5, p.y + 0.05, p.z + vor.z * 0.9 + (Math.random() - 0.5) * 0.5, 0, 1.3, 0, 0.35, 0.3); } return; }
  const st = THREE.MathUtils.clamp(v / 16, 0, 1); if (J.spritz) { J.spritz = 0; for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28; effekte.gischt(p.x + Math.cos(a) * d.L * 0.3, p.y + 0.1, p.z + Math.sin(a) * d.L * 0.3, Math.cos(a) * 3 + vor.x * v * 0.6, 1.5 + Math.random() * 3, Math.sin(a) * 3 + vor.z * v * 0.6, 0.45, 0.2 + Math.random() * 0.25); } }
  if (F.imWasser === false || st < 0.08 || (J.spritzT -= dt) > 0) return; J.spritzT = 0.012 + 0.04 * (1 - st);
  for (let i = 0; i < 2; i++) { const s = Math.random() < 0.62 ? -d.L * 0.52 : d.L * (0.05 + Math.random() * 0.2), q = (Math.random() - 0.5) * d.L * (s < 0 ? 0.26 : 0.32), rx = vor.z, rz = -vor.x, seite = s < 0 ? (Math.random() - 0.5) * 1.5 : Math.sign(q) * (1.4 + st * 2.6); effekte.gischt(p.x + vor.x * s + rx * q, p.y + 0.1, p.z + vor.z * s + rz * q, vor.x * v * (s < 0 ? 0.5 : 0.72) + rx * seite, 0.5 + st * (s < 0 ? 3.6 : 2.1) * Math.random(), vor.z * v * (s < 0 ? 0.5 : 0.72) + rz * seite, 0.3 + st * 0.26, 0.12 + st * Math.random() * 0.34); }
}
function wasserHud(J, dt) {
  J.hudT = (J.hudT || 0) + dt; if (J.hudT < 0.1) return; J.hudT = 0;
  const F = J.flug, d = F.d, tief = Math.max(0, J.sp - F.geo.h), grund = Math.max(0, J.sp - F.tiefeBoden), meter = v => v >= 10000 ? `${(v / 1000).toFixed(1).replace('.', ',')} km` : `${fmt(v)} m`;
  $('jtempo').textContent = `${fmt(F.kmh)} km/h`; $('jmach').textContent = `${fmt(F.kmh / 1.852)} Knoten`;
  $('jhoehe').textContent = d.tauch && tief > d.tiefgang + 1.5 ? `${meter(tief)} tief` : 'Oberfläche'; $('jsteig').textContent = `Grund ${meter(grund)}${d.tauch && Math.abs(F.vZ) > 0.2 ? ` · ${F.vZ > 0 ? 'steigt' : 'sinkt'} ${fmt(Math.abs(F.vZ))} m/s` : ''}`;
  $('jkurs').textContent = `${String(Math.round(F.kurs) % 360).padStart(3, '0')}° ${HIMMELSRICHTUNG[Math.round(F.kurs / 45) % 8]}`;
  $('jschubbalken').style.width = `${Math.round(F.motor * 100)}%`; $('jschubbalken').classList.remove('nach'); $('jschubtext').textContent = J.art === 'schwimmer' ? d.name : `${d.name} · Schub ${Math.round(F.motor * 100)} %`;
  $('jg').textContent = spiel.wellenF < 1 ? 'Fluss oder Ufer' : grund > 200 ? 'offenes Meer' : 'Küste';
  let w = ''; const wr = unterwasser?.wrack, g = F.geo;
  if (wr) { const ab = Math.hypot((wr.lat - g.lat) * 111000, (wr.lon - g.lon) * 111000 * Math.cos(g.lat * D2Rj)); w = `${wr.name} · ${ab > 1000 ? (ab / 1000).toFixed(1).replace('.', ',') + ' km' : fmt(ab) + ' m'}`; }
  else if (tief > 8000) w = 'Tiefsee · nur die Lampe gibt Licht'; else if (J.zeit < 7 && d.tauch && tief < 2) w = MOBIL ? 'Runter taucht ab' : 'Leertaste taucht ab';
  const we = $('jwarn'); if (we._t !== w) { we._t = w; we.textContent = w; we.className = 'jwarn'; }
}
// Aussteigen: am Ufer. Boote bleiben liegen und man steigt später wieder ein, das U-Boot erst aufgetaucht
async function wasserAussteigen(von = false) {
  const J = spiel.jet; if (!J?.wasser || umsteigen) return false; const F = J.flug, art = J.art, schw = art === 'schwimmer';
  if (F.d.tauch && F.unter) { if (!von) shell?.tipp(MOBIL ? 'Erst auftauchen: Hoch halten' : 'Erst auftauchen: Shift halten', 4); return false; }
  if (!erdOrt || erdWeg(erdOrt, F.geo.lat, F.geo.lon) > erdOrt.halb * 0.92) { if (!von) shell?.tipp('Hier ist noch nichts gebaut, einen Moment', 3); if (!erdAuftrag) erdOrtLaden(F.geo.lat, F.geo.lon); return false; }
  const L = landSuchen(F.geo.lat, F.geo.lon, schw ? 34 : 80, F.kursR); if (!L) { if (!von) shell?.tipp('Kein Ufer in der Nähe. Fahr näher ans Land', 3.5); return false; }
  const def = J.def, u = J.modell.userData; umsteigen = true;
  try {
    if (!schw) { F.vF = 0; F.gas = 0; J.behalten = true; spiel.parken[art] = { art, F, modell: J.modell, wasser: true }; if (u.reiter) u.reiter.obj.visible = false; }
    erdRegime = 'ort'; erdAnkerAufOrt(erdOrt);
    await spielStarten('fuss', def);
    const f = spiel.figur, A = aktiv;
    if (f) { const y = A.kollision.hoehe(L.x, L.z); f.pos.set(L.x, y, L.z); f.ry = F.kursR; f.bildSetzen?.(); f.boden = y; A.kollision.yAkt = y; spiel.rig.yaw = f.ry + 0.55; spiel.rig.pitch = 0.16; spiel.rig.distZiel = spiel.rig.dist = MOBIL ? 7 : 6; ton.tuer(); shell?.tipp('', 0.01); }
    return true;
  } finally { umsteigen = false; }
}
// Zu Fuß ins Wasser laufen: nur wenn man wirklich darauf zugeht und nicht auf einer Brücke oder hoch über dem Wasser steht
function uferPruefen(F) {
  const o = erdOrt, S = o?.szene?.ort; if (!S || erdRegime !== 'ort' || F.v < 0.6 || F.luft || spiel.wechsel || umsteigen) return;
  const px = F.pos.x + F.dir.x * 1.1, pz = F.pos.z + F.dir.z * 1.1; if (S.H(px, pz) - S.Hboden(px, pz) > 0.3) return;
  const g = erdWelt.lokalZuGeo(_wn.set(px, F.pos.y, pz)); if (!wasserHier(g.lat, g.lon) || g.h - wasserSpiegel(g.lat, g.lon) > 3.4) return;
  wasserStarten('schwimmer', null, { lat: g.lat, lon: g.lon, kurs: F.ry / D2Rj, fest: true, def: spiel.wahl }).catch(e => console.warn(e));
}
// ---------- U-Bahn (Wunsch Nr. 63, kit/ubahn.js, 14_MITFAHREN.md): Abgänge im Ort an den echten Stationen, drinnen eigene Szene, oben lädt die Erde weiter ----------
let ubahn = null; const metro = new MetroDaten(new URL('../daten/heute/metro.json', import.meta.url).href);
function eingaengeSetzen(o, A) {
  if (!metro.d) { metro.laden().catch(e => console.warn('Metro', e)); return; } if (o.eingaengeDa) return; if (o.szene?.ort?.daten?.ubahn?.length && !o.szene.ort.ubahnFeld) return; o.eingaengeDa = true; o.eingaenge = [];
  // echte Eingänge (Nr. 94) statt Ersatz Abgängen: mit dem Bahnhof aus metro.json (für E an der Treppe, den Ausgang oben und DASH.eingaenge)
  { const UF = o.szene?.ort?.ubahnFeld; if (UF?.n) { for (const e of UF.liste) { const L = metro.nahe(e.sla, e.slo, 600); if (L.length) o.eingaenge.push({ i: L[0].i, x: e.x, z: e.z, ry: e.ry, y: e.y0, name: e.n, echt: true }); } return; } }
  const L = metro.nahe(o.lat, o.lon, o.halb * 1.35), S = o.szene?.ort; if (!S || !A?.kollision) return; const netzU = /u-bahn|ubahn|untergrund/i;
  for (const { i } of L.slice(0, MOBIL ? 6 : 14)) {
    const s = metro.s(i); let x = (s[1] - o.lon) * o.kLon, z = -(s[0] - o.lat) * o.kLat; if (Math.abs(x) > o.halb - 8 || Math.abs(z) > o.halb - 8) continue;
    // freier Platz nah an der echten Stelle: Länge rund 6 m, Breite 3 m
    let best = null; suche: for (let r = 0; r < 70; r += 3) for (let a = 0; a < 12; a++) { const w = a / 12 * Math.PI * 2, px = x + Math.cos(w) * r, pz = z + Math.sin(w) * r, ry = a % 4 * Math.PI / 2 + (i % 8) * Math.PI / 16, sx = Math.sin(ry), cx = Math.cos(ry); let ok = true; for (const [ax, az] of [[0, -1], [0, 2], [0, 6.5], [-2, 0], [2, 0], [-2, 3], [2, 3], [-2, 6], [2, 6]]) { const qx = px + ax * cx + az * sx, qz = pz - ax * sx + az * cx; if (!A.kollision.frei(qx, qz) || (S.H(qx, qz) - S.Hboden(qx, qz)) > 0.3) { ok = false; break; } if (Math.abs(S.Hboden(qx, qz) - S.Hboden(px, pz)) > 0.5) { ok = false; break; } } if (ok && !o.eingaenge.some(q => Math.hypot(q.x - px, q.z - pz) < 16)) { best = { x: px, z: pz, ry }; break suche; } }
    if (!best) continue;
    const netz = metro.d.netze[s[3]] || '', zeichen = netzU.test(netz) || /Berlin|Hamburg|München|Munich|Nürnberg|Wien|Vienna/.test(netz) ? 'U' : 'M', G = eingangBauen(s[2], metro.farbe(s[4][0] ?? -1, s[3]), zeichen), y = S.Hboden(best.x, best.z); G.position.set(best.x, y, best.z); G.rotation.y = best.ry; o.gruppe.add(G); G.traverse(q => { q.updateMatrix?.(); }); G.updateMatrixWorld(true);
    o.eingaenge.push({ i, x: best.x, z: best.z, ry: best.ry, y, name: s[2] });
  }
}
function eingangNah(F) { const o = erdOrt; if (!F || !o?.eingaenge || erdRegime !== 'ort') return null; for (const e of o.eingaenge) if (Math.hypot(F.pos.x - e.x, F.pos.z - e.z) < 4.6) return e; return null; }
async function ubahnStarten(i) {
  if (umsteigen) return false; umsteigen = true;
  try {
    const def = spiel.wahl && spiel.modus === 'fuss' ? spiel.wahl : spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0], quelle = menschenQuellen.find(q => q.def.id === def.id) || await mitLader('Figur wird geladen', () => loadPerson(def)); if (!quelle) return false; spiel.figurDef = def;
    await mitLader('Die Station wird gebaut', () => metro.laden());
    ubahn ||= new UBahn({ mobil: MOBIL, renderer, daten: metro, ton, welt: erdWelt, boden: (la, lo) => erdBodenGeo(la, lo), beiAusgang: j => ubahnVerlassen(j) });
    await ubahn.betreten({ i, quelle, bewegungen, quellen: menschenQuellen.filter(q => q && q.def) });
    if (spiel.modus !== 'frei') { const f = spiel.figur, a = spiel.auto; if (f) { f.entfernen(); spiel.figur = null; } if (a) { a.schaden?.entsorgen(); a.entfernen(); spiel.auto = null; } if (spiel.modus === 'jet') jetEntfernen(); if (aktiv?.verkehr) aktiv.verkehr.spieler = null; }
    spiel.modus = 'bord'; spiel.bord = ubahn; controls.enabled = false; eingabe.spiel = true; fahrt = null; folge = null; if (erdRegime === 'ort') erdRegime = 'kugel'; document.body.classList.add('innen');
    $('hilfe').textContent = MOBIL ? 'Stick: gehen · Ziehen: schauen · Ein Aus: nutzen' : 'W A S D: gehen · Shift: schneller · C: Ich Sicht · E: nutzen, hinsetzen, nach oben · Esc: Menü'; $('hilfe').classList.add('an'); document.body.classList.add('spiel'); ton.tuer?.();
    return true;
  } finally { umsteigen = false; }
}
async function ubahnVerlassen(i) {
  if (umsteigen || spiel.bord !== ubahn) return; const s = metro.s(i), lat = s[0], lon = s[1]; umsteigen = true;
  try {
    const bereit = () => erdOrt && erdWeg(erdOrt, lat, lon) < erdOrt.halb * 0.82; if (!bereit()) { ubahn.melde('Die Stadt oben wird gebaut, einen Moment', 60); const t0 = performance.now(); while (!bereit() && performance.now() - t0 < 60000 && spiel.modus === 'bord') { if (!erdAuftrag) erdOrtLaden(lat, lon); await new Promise(r => setTimeout(r, 400)); } if (!bereit() || spiel.modus !== 'bord') return; }
    const def = spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0]; ubahn.verlassen(); spiel.bord = null; document.body.classList.remove('innen'); camera.fov = 40; camera.updateProjectionMatrix(); erdKamAuf(lat, lon); spiel.modus = 'frei'; erdRegime = 'ort'; erdAnkerAufOrt(erdOrt);
    await spielStarten('fuss', def); const f = spiel.figur, A = aktiv; let x = (lon - erdOrt.lon) * erdOrt.kLon, z = -(lat - erdOrt.lat) * erdOrt.kLat, ry = 0; if (!erdOrt.eingaengeDa) eingaengeSetzen(erdOrt, A); const e = erdOrt.eingaenge?.find(q => q.i === i); if (e) { x = e.x - Math.sin(e.ry) * 1.6; z = e.z - Math.cos(e.ry) * 1.6; ry = e.ry + Math.PI; }
    else if (A.kollision?.ubahn?.liste?.length) { let bq = null, bd = Infinity; for (const q of A.kollision.ubahn.liste) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; bq = q; } } if (bq && bd < 400) { x = bq.x - Math.sin(bq.ry) * 1.6; z = bq.z - Math.cos(bq.ry) * 1.6; ry = bq.ry + Math.PI; } }   // echte Eingänge (Nr. 94)
    if (f) { if (!A.kollision.frei(x, z) && A.startFussSuche) { const p = A.startFussSuche(x, z); x = p.x; z = p.z; } f.pos.set(x, A.kollision.hoehe(x, z), z); f.ry = ry; f.bildSetzen?.(); ton.tuer?.(); shell?.tipp(s[2], 3); }
  } finally { umsteigen = false; }
}
// ---------- Tierlexikon und Fotos (Wunsch Nr. 69, Nader: "Man kann auch die Tiere anklicken, dort finden, fotografieren, suchen und lernen, was für Tiere es wo gibt. Es ist auch eine Lernseite.") ----------
const LEX_URL = new URL('../daten/heute/tierlexikon.json', import.meta.url).href, ALBUM_KEY = 'earth3d_tieralbum', LEX_ALIAS = { kuh_braun: 'kuh', moewe_flug: 'moewe', gans_flug: 'gans', storch_flug: 'storch' }, MEER_GROESSE = { seekuh: 3, krake: 1.5, qualle: 0.8, wal: 14, pottwal: 16, orca: 7, hai: 3, delfin: 3, thunfisch: 2, fliegender_fisch: 0.5, mantarochen: 5, meeresschildkroete: 1.3, robbe: 1.8, walross: 3 };
let lexDaten = null, lexP = null, album = {}, fotoWunsch = false, tierChipT = 0, tierChipId = null; try { album = JSON.parse(localStorage.getItem(ALBUM_KEY) || '{}') || {}; } catch (e) { album = {}; }
function lexLaden() { return lexP ||= fetch(LEX_URL).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => lexikonEN(d, new URL('../daten/heute/tierlexikon_en.json', import.meta.url).href)).then(d => { const L = new Map(d.arten.map(e => [e.id, e])); L.stand = d; lexDaten = L; return L; }).catch(e => { lexP = null; throw e; }); }
function albumSpeichern() { try { localStorage.setItem(ALBUM_KEY, JSON.stringify(album)); return true; } catch (e) { return false; } }
const _tv = new THREE.Vector3(), _tw = new THREE.Vector3(), _tc = new THREE.Vector3();
// Alle Tiere, die gerade in der Welt zu sehen sind: cb(art, Lage in der Szene, Größe in Metern)
function tiereDurchgehen(cb) {
  const W = erdWelt; if (!W) return; const O = erdOrt?.szene?.ort, wi = O?.wild;
  if (wi?.tiere?.length) { wi.gruppe.updateWorldMatrix(true, false); for (const t of wi.tiere) { if (!wi.arten[t.art]) continue; const A = TIER_MASSE[t.art]; _tv.set(t.x, O.H(t.x, t.z) + A.H * 0.55, t.z).applyMatrix4(wi.gruppe.matrixWorld); cb(t.art, _tv, Math.max(A.L, A.H)); } }
  if (meerestiere?.pods?.length) for (const p of meerestiere.pods) { if (!meerestiere.mesh[p.art]?.visible) continue; W.geoZuLokal(p.lat, p.lon, 0, _tw); for (const t of p.T) { _tv.set(_tw.x + t.dx, _tw.y, _tw.z + t.dz); cb(p.art, _tv, MEER_GROESSE[p.art] || 2); } }
  if (himmelstiere?.gr?.length) for (const g of himmelstiere.gr) { if (!himmelstiere.mesh[g.art]?.m?.visible) continue; W.geoZuLokal(g.lat, g.lon, g.bH + g.h, _tw); for (const t of g.T) { _tv.set(_tw.x + (t.r ? Math.cos(t.a) * t.r : 0), _tw.y + (t.dh || 0), _tw.z + (t.r ? Math.sin(t.a) * t.r : 0)); cb(g.art, _tv, 3); } }
  if (erdRegime === 'ort' && tiere?.tauben?.im?.visible) for (const g of tiere.tauben.gruppen) { if (!g.aktiv) continue; for (const t of g.v) { _tv.set(t.x, t.y + 0.15, t.z); cb('taube', _tv, 0.5); } }
  if (erdRegime === 'ort' && aktiv?.menge?.alle) for (const p of aktiv.menge.alle) { const h = p.hund; if (!h || !p.f?.obj.visible) continue; _tv.set(h.x, p.pos.y + 0.3, h.z); cb('hund', _tv, 0.9); }
  if (spiel.uwAn && unterwasser?.tiere?.length) for (const t of unterwasser.tiere) { _tv.set(t.x, t.y, t.z); cb(t.art, _tv, MEER_GROESSE[t.art] || 2); }
}
// Tier an einer Stelle des Bildes (Pixel im Bild): das nächste zum Punkt, nah vor fern
function tierBeiPunkt(px, py, tol, minPx = 0, maxD = 700) {
  if (spiel.modus === 'bord' && spiel.bord?.szene) return null; const r = renderer.domElement.getBoundingClientRect(), foc = r.height / (2 * Math.tan(camera.fov * D2R / 2)); let best = null, bs = 1e9;
  tiereDurchgehen((art, p, gr) => { _tc.copy(p).applyMatrix4(camera.matrixWorldInverse); const d = -_tc.z; if (d < 0.6 || d > maxD) return; const gp = gr * 0.62 / d * foc; if (gp < minPx) return; const sx = _tc.x / d * foc + r.width / 2, sy = -_tc.y / d * foc + r.height / 2, rp = Math.max(tol, gp), a = Math.hypot(sx - px, sy - py); if (a > rp) return; const s = a / rp + d / 1400; if (s < bs) { bs = s; best = { art: LEX_ALIAS[art] || art, d, sx, sy }; } });
  return best;
}
function tierKlick(cx, cy) { if (!shell || !aktiv?.erde) return false; const r = renderer.domElement.getBoundingClientRect(), pl = !!document.pointerLockElement, t = tierBeiPunkt(pl ? r.width / 2 : cx - r.left, pl ? r.height / 2 : cy - r.top, MOBIL ? 30 : 20); if (!t) return false; ton.klick?.(); shell.tierKarte(t.art, null, true); return true; }
// Kleine Tafel, solange ein Tier in der Bildmitte ist
function tierChipTick(dt) {
  if ((tierChipT -= dt) > 0) return; tierChipT = 0.25; const el = $('tierchip'); if (!el) return; const r = renderer.domElement.getBoundingClientRect(), t = aktiv?.erde && !shell?.pausiert && spiel.modus !== 'frei' ? tierBeiPunkt(r.width / 2, r.height / 2, Math.min(r.width, r.height) * 0.14, 9, 240) : null;
  if (!t) { if (tierChipId) { tierChipId = null; el.classList.remove('an'); } return; } if (!lexDaten) { lexLaden().catch(() => {}); return; } if (t.art === tierChipId) return; const e = lexDaten.get(t.art); if (!e) return; tierChipId = t.art; el.textContent = `${e.n}${album[t.art] ? ' · im Album' : ''} · ${MOBIL ? 'antippen: Steckbrief' : 'Klick: Steckbrief · P: Foto'}`; el.classList.add('an');
}
function insektImBild() {
  if (spiel.uwAn && unterwasser?.fische?.visible) return unterwasser.fischU.uBunt.value > 0.5 ? 'korallenfische' : 'hering'; const O = erdOrt?.szene?.ort, s = spiel.figur; if (!O || !s || erdRegime !== 'ort') return null; const L = []; if (SU.uNacht.value > 0.5) { if (O.kleintiere) L.push('motte'); if (O.waldleben) L.push('gluehwuermchen'); } else { if (O.kleintiere) L.push('biene'); if (O.waldleben) L.push('schmetterling'); const P = s.bildPos || s.pos; if (O.kleintiere && O.daten.wasser?.some(W => W[0].some(q => Math.hypot(q[0] - P.x, q[1] - P.z) < 60))) L.push('libelle', 'libelle'); } return L.length ? L[Math.floor(Math.random() * L.length)] : null;
}
function fotoMachen() { fotoWunsch = true; }
// Direkt nach dem Bild, solange der Inhalt im Puffer liegt
function fotoNachBild() {
  if (!fotoWunsch) return; fotoWunsch = false; const c = renderer.domElement, tw = 400, th = 250, o = document.createElement('canvas'); o.width = tw; o.height = th; const a = c.width / c.height, ta = tw / th, sw = a > ta ? c.height * ta : c.width, sh = a > ta ? c.height : c.width / ta; o.getContext('2d').drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, tw, th);
  const r = c.getBoundingClientRect(), t = tierBeiPunkt(r.width / 2, r.height / 2, Math.min(r.width, r.height) * 0.26), id = t?.art || insektImBild(), bl = $('fotoblitz'); if (bl) { bl.classList.remove('an'); void bl.offsetWidth; bl.classList.add('an'); } ton.knall?.(0.08, 2600, 0.05);
  if (!id) { shell?.tipp('Kein Tier im Bild. Näher heran und die Kamera ausrichten', 3); return; }
  lexLaden().then(L => { const e = L.get(id); if (!e) return; const neu = !album[id], g = spielerGeo() || { lat: erdKam.lat, lon: erdKam.lon }, n = orteListe.length ? ortNahe(orteListe, g.lat, g.lon) : null; album[id] = { t: Date.now(), lat: +g.lat.toFixed(4), lon: +g.lon.toFixed(4), ort: n?.name || '', bild: o.toDataURL('image/jpeg', 0.74) }; const ok = albumSpeichern(); tierChipId = null; if (neu) ton.erfolg?.(); shell?.tipp(neu ? `Neu im Album: ${e.n}. ${Object.keys(album).length} von ${L.size} Arten` : `Neues Foto: ${e.n}`, 4); if (!ok) shell?.tipp('Fotos: Speicher des Browsers ist voll, das Bild bleibt nur bis zum Neuladen', 4); }).catch(() => {});
}
const imMeer = e => e.g === 'meer' && !/^(seeloewe|robbe|walross)$/.test(e.id);   // die liegen am Ufer, alle anderen leben im Wasser
// Hinfliegen aus dem Lexikon: an einen echten Ort, an dem die Art lebt
async function tierHin(id) {
  const L = await lexLaden(), e = L.get(id); if (!e?.o) return; const [lat, lon, name] = e.o; TIERWUNSCH.art = id; TIERWUNSCH.lat = lat; TIERWUNSCH.lon = lon; TIERWUNSCH.da = false; shell?.tipp(`${e.n}: ${name}`, 4);
  if (spiel.modus === 'bord') spielBeenden();
  if (e.tauchen || (imMeer(e) && shell?.aktiv)) { wasserStarten(e.tauchen ? 'schwimmer' : 'speedboot', null, { lat, lon, name }).catch(x => console.warn(x)); return; }
  if (spiel.modus === 'jet') { if (spiel.jet?.wasser) spielBeenden(); else { jetUmsetzen(lat, lon); return; } }
  if (spiel.modus === 'fuss' || spiel.modus === 'fahren') { naviSpringen({ lat, lon }); return; }
  const gr = e.g === 'meer' ? 260 : TIER_MASSE[id]?.H > 1.2 ? 60 : 34; erdZiel({ lat, lon, dist: gr, neigung: 76, kurs: 25, boden: true });
}
function tierWunschTick(blick) {
  const w = TIERWUNSCH; if (!w.art) return; const d = erdWeg(w, blick.lat, blick.lon); if (d < 3000 && !w.da) { w.da = true; if ((TIER_FLUG[w.art] || TIER_FLUG[w.art + '_flug']) && sunDir.y < 0.05 && lexDaten?.get(w.art)) shell?.tipp(`${lexDaten.get(w.art).n}: dort ist gerade Nacht, er fliegt erst wieder am Tag`, 5); } else if (w.da && d > 25000) { w.art = null; w.da = false; return; }
  if (erdOrt && erdRegime === 'ort' && erdWeg(erdOrt, w.lat, w.lon) < erdOrt.halb * 0.95) { const wi = erdOrt.szene?.ort?.wild; if (wi && wi.wunsch !== w.art && !wi.weg) { wi.wunsch = w.art; wi.wunschNachtrag(); } }
}
// ---------- Blinker (Karte Steuerung): Komma links, Punkt rechts, am Gamepad das Kreuz. Geht nach der Kurve von selbst aus ----------
const _blink = { an: 0, t: 0, W: null, g: null, kurs: 0, weit: 0 };
function blinker(s) {
  const W = spiel.auto; if (!W) return; if (_blink.W !== W) { _blink.g?.removeFromParent(); const G = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.4, 0.25), toneMapped: true }), g = new THREE.BoxGeometry(0.1, 0.07, 0.04); for (const q of [-1, 1]) for (const v of [-1, 1]) { const b = new THREE.Mesh(g, m); b.position.set(q * W.B * 0.46, 0.72, v * W.L * 0.495); b.userData.q = q; b.visible = false; G.add(b); } W.obj.add(G); _blink.g = G; _blink.W = W; }
  _blink.an = _blink.an === s ? 0 : s; _blink.t = 0; _blink.kurs = Math.atan2(W.dir.x, W.dir.z); _blink.weit = 0; ton.klick?.(); if (!_blink.an) for (const b of _blink.g.children) b.visible = false;
}
function blinkerTick(dt) {
  const W = spiel.auto; if (!_blink.an || _blink.W !== W) return; _blink.t += dt; const a = (_blink.t % 0.72) < 0.36; for (const b of _blink.g.children) b.visible = a && b.userData.q === -_blink.an; const kA = Math.floor((_blink.t - dt) / 0.36), kN = Math.floor(_blink.t / 0.36); if (kA !== kN) ton.ton?.(kN % 2 ? 1500 : 1100, kN % 2 ? 1500 : 1100, 0.012, 0.03, 'square');
  const k = Math.atan2(W.dir.x, W.dir.z), d = Math.abs(Math.atan2(Math.sin(k - _blink.kurs), Math.cos(k - _blink.kurs))); _blink.weit = Math.max(_blink.weit, d); if (_blink.weit > 0.5 && d < _blink.weit - 0.15 || d > 1.2) { _blink.an = 0; for (const b of _blink.g.children) b.visible = false; }
}
// ---------- Mitfahren: S-Bahn, Ringbahn, Regionalbahn, Straßenbahn, Flugzeug (Wunsch Nr. 63, kit/mitfahrt.js) ----------
let mitfahrt = null; const FLUG_URL = new URL('../daten/heute/flughaefen.json', import.meta.url).href;
async function mitfahrtStarten(art, quelle, extra = {}) {
  if (umsteigen) return false; umsteigen = true;
  try {
    const def = spiel.wahl && spiel.modus === 'fuss' ? spiel.wahl : spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0], fq = menschenQuellen.find(q => q.def.id === def.id) || await mitLader('Figur wird geladen', () => loadPerson(def)); if (!fq) return false; spiel.figurDef = def;
    mitfahrt ||= new Mitfahrt({ mobil: MOBIL, szene: scene, welt: erdWelt, ton, ortFn: () => erdOrt, beiEnde: x => mitfahrtEnde(x) });
    if (spiel.modus !== 'frei') { const f = spiel.figur, a = spiel.auto; if (f) { f.entfernen(); spiel.figur = null; } if (a) { a.schaden?.entsorgen(); a.entfernen(); spiel.auto = null; } if (spiel.modus === 'jet') jetEntfernen(); if (spiel.modus === 'bord') spiel.bord?.verlassen(); if (aktiv?.verkehr) aktiv.verkehr.spieler = null; }
    mitfahrt.betreten({ art, quelle, figurQuelle: fq, bewegungen, quellen: menschenQuellen.filter(q => q && q.def), ...extra });
    spiel.modus = 'bord'; spiel.bord = mitfahrt; controls.enabled = false; eingabe.spiel = true; fahrt = null; folge = null; if (art !== 'zug') erdRegime = 'kugel'; camera.fov = 62; camera.updateProjectionMatrix(); document.body.classList.add('spiel', 'innen', 'mitkarte');
    $('hilfe').textContent = MOBIL ? 'Stick: gehen · Ziehen: schauen · Ein Aus: hinsetzen, aussteigen' : art === 'flug' ? 'Maus ziehen: schauen · C: Sicht wechseln, auch von außen · T: Zeitraffer · W A S D: aufstehen, gehen · E: hinsetzen, aussteigen' : 'W A S D: gehen · C: Ich Sicht · E: hinsetzen, aussteigen, oder durch die offene Tür laufen · Maus ziehen: schauen'; $('hilfe').classList.add('an'); ton.tuer?.();
    return true;
  } finally { umsteigen = false; }
}
// Einsteigen in den stehenden Zug neben der Figur
function zugEinsteigen(F) {
  const B = erdRegime === 'ort' ? erdOrt?.szene?.ort?.bahn : null, n = B?.zugNah(F.pos.x, F.pos.z); if (!n) return false; const z = n.zug, c = z.wagen[n.w], rx = F.pos.x - c.px, rz = F.pos.z - c.pz, l = rx * c.dx + rz * c.dz, quer = rx * c.dz - rz * c.dx;
  const Q = new ZugQuelle(() => erdOrt, z, n.w); B.update(camera.position, aktiv?.verkehr, null); if (!z.fgM) { z.fg = undefined; return false; } Q.update(0, erdWelt);
  mitfahrtStarten('zug', Q, { tuerZ: l, seite: quer < 0 ? -1 : 1 }).catch(e => console.warn(e)); return true;
}
// Fliegen: Ziel wählen, vom Gate oder von der Startbahn des nächsten Flughafens
const FLUG_BELIEBT = ['JFK', 'LHR', 'CDG', 'DXB', 'HND', 'SIN', 'LAX', 'SYD', 'RAK', 'IST', 'GRU', 'JNB', 'BKK', 'FCO', 'BCN', 'CAI', 'DEL', 'MEX', 'YYZ', 'FRA', 'BER', 'CMN', 'HKG', 'AMS'];
const entf = (a, b) => { const la = (b.lat - a.lat) * D2R, lo = (b.lon - a.lon) * D2R, s = Math.sin(la / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(lo / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(s))); };
async function flugWahl({ gate = null } = {}) {
  const el = $('flugwahl'); el.innerHTML = '<div class="fw-kopf"><span>Flugplan wird geladen</span></div>'; el.classList.add('offen');
  let L; try { L = await flughaefenLaden(FLUG_URL); } catch (e) { el.innerHTML = '<div class="fw-kopf"><span>Flugplan nicht erreichbar</span><button type="button">×</button></div>'; el.querySelector('button').onclick = () => el.classList.remove('offen'); return; }
  const g = spielerGeo() || { lat: erdKam.lat, lon: erdKam.lon }; let ab = null, bd = 1e9; for (const f of L) { if (!f.rw) continue; const d = entf(g, f); if (d < bd) { bd = d; ab = f; } }
  if (gate && bd > 15) ab = { c: '', n: 'diesem Flugplatz', lat: g.lat, lon: g.lon, h: erdBodenGeo(g.lat, g.lon), rw: null };
  el.innerHTML = `<div class="fw-kopf"><span>Flug ab ${ab.n}${ab.c ? ` (${ab.c})` : ''}</span><button type="button" aria-label="Schließen">×</button></div><input type="text" placeholder="Ziel suchen: Stadt, Flughafen oder Kürzel" autocomplete="off"><div class="fw-liste"></div>`;
  const zu = el.querySelector('.fw-kopf button'), inp = el.querySelector('input'), li = el.querySelector('.fw-liste'); zu.onclick = () => el.classList.remove('offen'); inp.onkeydown = e => { if (e.key === 'Escape') { el.classList.remove('offen'); inp.blur(); } };
  const zeile = f => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span></span><small></small>`; b.children[0].textContent = `${f.n}, ${f.c}`; b.children[1].textContent = `${Math.round(entf(ab, f)).toLocaleString(LOCALE)} km`; b.onclick = () => { el.classList.remove('offen'); flugStarten(ab, f, gate); }; return b; };
  const zeigen = q => { li.textContent = ''; q = q.trim().toLowerCase(); let T; if (!q) { const u = document.createElement('div'); u.className = 'ueber'; u.textContent = 'Beliebte Ziele'; li.appendChild(u); T = FLUG_BELIEBT.map(c => L.find(f => f.c === c)).filter(f => f && f !== ab); } else T = L.filter(f => f !== ab && (f.c.toLowerCase() === q || f.n.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))).sort((a, b) => (b.c.toLowerCase() === q) - (a.c.toLowerCase() === q) || b.gross - a.gross).slice(0, 40); for (const f of T) li.appendChild(zeile(f)); if (q && !T.length) { const u = document.createElement('div'); u.className = 'ueber'; u.textContent = 'Kein Flughafen gefunden'; li.appendChild(u); } };
  inp.oninput = () => zeigen(inp.value); zeigen(''); if (!MOBIL) inp.focus();
}
function flugStarten(ab, nach, gate) { const Q = new FlugQuelle({ ab, nach, boden: (la, lo) => erdBodenGeo(la, lo), W: erdWelt, ortFn: () => erdOrt, ortBereit: (la, lo) => !!erdOrt && erdWeg(erdOrt, la, lo) < erdOrt.halb * 0.85, gate }); return mitfahrtStarten('flug', Q).catch(e => console.warn(e)); }
function flugzeugNah(F) { const fh = erdRegime === 'ort' ? erdOrt?.szene?.ort?.flughafen : null; if (!fh?.bereit || fh.weg) return null; const f = fh.fliegerNah(F.pos.x, F.pos.z); return f ? { fh, f } : null; }
// Freie Kamera mitnehmen, sonst hält der nächste Takt den Ort für verlassen und räumt ihn weg (am Handy, während die Figur lädt)
function erdKamAuf(lat, lon) { erdKam.lat = lat; erdKam.lon = lon; erdKam.boden = erdBodenGeo(lat, lon); erdKam.dist = Math.min(erdKam.dist, 700); erdKam.flug = null; }
async function mitfahrtEnde(x) {
  if (umsteigen || spiel.bord !== mitfahrt) return; const { lat, lon, art, seite, lageW, querW, dirW, zLok, zielG } = x; umsteigen = true;
  try {
    const bereit = () => erdOrt && erdWeg(erdOrt, lat, lon) < erdOrt.halb * 0.85; if (!bereit()) { mitfahrt.melde('Hier wird noch gebaut, einen Moment', 60); const t0 = performance.now(); while (!bereit() && performance.now() - t0 < 60000 && spiel.modus === 'bord') { if (!erdAuftrag) erdOrtLaden(lat, lon); await new Promise(r => setTimeout(r, 400)); } if (!bereit() || spiel.modus !== 'bord') return; }
    const def = spiel.figurDef || ALLE_MENSCHEN.find(d => d.id === shell?.stand.figur) || ALLE_MENSCHEN[0], W = erdWelt; mitfahrt.verlassen(); spiel.bord = null; camera.up.set(0, 1, 0); camera.fov = 40; camera.updateProjectionMatrix(); document.body.classList.remove('innen', 'mitkarte'); erdKamAuf(lat, lon); spiel.modus = 'frei'; erdRegime = 'ort'; erdAnkerAufOrt(erdOrt);
    await spielStarten('fuss', def); const f = spiel.figur, A = aktiv;
    if (f) {
      const l = W.weltZuLokal(lageW, new THREE.Vector3()), q = querW.clone().applyQuaternion(W.zuLokal), v = dirW.clone().applyQuaternion(W.zuLokal); let px, pz, ry;
      if (art === 'flug') { if (zielG?.g) { px = zielG.g.x + zielG.g.nx * 3; pz = zielG.g.z + zielG.g.nz * 3; } else { px = l.x + q.x * 12; pz = l.z + q.z * 12; } ry = Math.atan2(q.x, q.z); }
      else { px = l.x + q.x * seite * 3.1 + v.x * zLok; pz = l.z + q.z * seite * 3.1 + v.z * zLok; ry = Math.atan2(q.x * seite, q.z * seite); }
      if (!A.kollision.frei(px, pz) && A.startFussSuche) { const p = A.startFussSuche(px, pz); px = p.x; pz = p.z; } f.pos.set(px, A.kollision.hoehe(px, pz), pz); f.ry = ry; f.bildSetzen?.(); ton.tuer?.();
    }
  } finally { umsteigen = false; }
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
    if (J.art === 'heli') { $('jmach').textContent = `Rotor ${Math.round(F.drehzahl * 100)} %`; $('jschubtext').textContent = `Kollektiv ${Math.round(F.gas * 100)} %`; $('jschubbalken').classList.remove('nach'); $('jg').textContent = F.amBoden ? 'am Boden' : `${fmt(ueber)} m`; }
    else if (F.fahrwerk > 0.02) $('jg').textContent = F.fahrwerk > 0.98 ? 'Fahrwerk aus' : 'Fahrwerk fährt';
    let w = ''; if (F.absturz) w = 'ABSTURZ · neuer Start'; else if (F.amBoden) w = J.art === 'heli' ? (MOBIL ? 'AM BODEN · Hoch startet · Ein Aus steigt aus' : 'AM BODEN · Shift startet · E steigt aus') : F.kmh > 14 ? (MOBIL ? 'AM BODEN · Bremse hält an' : F.kmh > 150 && F.gas > 0.3 ? 'AM BODEN · Pfeil runter zieht hoch' : 'AM BODEN · Leertaste bremst') : (MOBIL ? 'AM BODEN · Stick zurück startet · Ein Aus steigt aus' : 'AM BODEN · W Schub · E steigt aus'); else if (J.art === 'jet' && zeitBoden < 5 && ueber < 3000 && F.fahrwerk < 0.8) w = 'HÖHE · hochziehen'; else if (J.art === 'jet' && F.fahrwerk > 0.8 && ueber < 300 && F.steigen < -1) w = F.steigen < -10 && ueber < 80 ? 'SINKEN ZU STARK' : F.kmh > 450 ? 'ZU SCHNELL · S weniger Schub' : 'ANFLUG · flach und langsam'; else if (J.art === 'jet' && zeitBoden < 5 && ueber < 3000) w = 'HÖHE · hochziehen'; else if (J.art === 'heli' && F.steigen < -8 && ueber < 40) w = 'SINKEN ZU STARK'; else if (F.abriss) w = 'ABRISS · Nase runter'; else if (F.sigma < 0.0008) w = 'RAUMFLUG · nur Raumschub';
    else if (J.zeit < 6) w = J.zielen || J.art === 'heli' ? '' : (MOBIL ? '' : 'Klick ins Bild: Maus zielt');   // im Hubschrauber zielt die Maus nicht
    const we = $('jwarn'); if (we._t !== w) { we._t = w; we.textContent = w; we.className = 'jwarn' + (w && w.startsWith('HÖHE') ? ' rot' : ''); }
  }
  // Marken: Nase, Flugbahn, Ziel
  const e = F.e; jetMarke($('jnase'), new THREE.Vector3(0, 0, 1).applyQuaternion(F.q));
  if (F.v.lengthSq() > 1) jetMarke($('jbahn'), F.v.clone().normalize()); else $('jbahn').style.display = 'none';
  if (J.zielen) jetMarke($('jziel'), jetZielRichtung(J, e)); else $('jziel').style.display = 'none';
}
// Maus fangen im Jet (Desktop): Klick ins Bild, Bewegung lenkt das Ziel; Esc gibt sie frei
renderer.domElement.addEventListener('pointerdown', e => { if (spiel.modus === 'jet' && spiel.jet?.art !== 'heli' && e.pointerType === 'mouse' && !document.pointerLockElement) renderer.domElement.requestPointerLock?.(); });
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

function groesseSetzen() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
  gtao.setSize(innerWidth, innerHeight); atmosPass.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  if (wolkenberge) wolkenberge.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());   // vorher blieben die Wolken nach Fenstergröße auf der alten Auflösung
}
addEventListener('resize', groesseSetzen);
// Auflösung nach Leistung (02.11.2026, Nader: "ruckelt" beim Fahren, 31 fps auf dem Retina Bildschirm). Seit 03.11.2026 ruhig: die erste Fassung
// sprang alle 4 bis 6 s zwischen zwei Stufen (gemessen 1,5 und 1,75), jedes Mal wurden alle Bildpuffer neu angelegt (Verdacht weißer Blitz,
// Nader: "ab und zu ... so ein weißer Flashblitz"). Jetzt: über 8 s gemittelt, nur nach unten in Stufen von 0,25, wenn die Bildzeit über 21 ms
// liegt; wieder nach oben erst nach 30 s unter 10 ms. Nie in den ersten 10 s und nie während eines Ortswechsels
const PR_MAX = Math.min(devicePixelRatio, MOBIL ? 1.5 : 2), PR_MIN = MOBIL ? 0.85 : 1;
let prT = 0, prSum = 0, prN = 0, prRuhe = 10, prSchnell = 0;
let PR_MAX_GRAFIK = 99, GRAFIK_REGELN = true;
function aufloesungRegeln(dt) {
  if (!GRAFIK_REGELN || window.__keineRegelung) return;   // __keineRegelung: Prüfstände messen bei fester Auflösung (tools/kosten.mjs setzte den Schalter, gelesen wurde er nicht mehr)
  if (dt > 0.25 || document.visibilityState !== 'visible' || erdAuftrag) { prT = prSum = prN = 0; return; }
  prSum += dt; prN++; prT += dt; prRuhe -= dt; if (prT < 8) return;
  const ms = prSum / prN * 1000; prT = prSum = prN = 0;
  prSchnell = ms < 10 ? prSchnell + 8 : 0;
  if (prRuhe > 0) return;
  const pr = renderer.getPixelRatio(); let neu = pr;
  if (ms > 21 && pr > PR_MIN) neu = Math.max(PR_MIN, pr - 0.25); else if (prSchnell >= 30 && pr < PR_MAX) { neu = Math.min(PR_MAX, pr + 0.25); prSchnell = 0; }
  if (neu === pr) return;
  renderer.setPixelRatio(neu); composer.setPixelRatio(neu); groesseSetzen(); prRuhe = 15; window.__ereignis?.('aufloesung ' + neu);
}

const uhr = new THREE.Timer();
let t = 0;
function tick(dt) {
  eingabe.pollen(dt);
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
  else { if (minikarte?.an) minikarte.zeigen(false); if (wolkenberge) wolkenberge.enabled = false; if (leben) leben.update(0, camera, null, { an: false }); echtzeit?.zeigen(false); weltgeschehen?.zeigen(false); atmosPass?.stadtSchatten(null); }
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
  for (const k of ['wolken', 'regen', 'nebel', 'nass', 'licht', 'schnee', 'gewitter', 'wind', 'decke']) { const d = (wetterZiel[k] ?? 0) - (wetterJetzt[k] ?? 0); if (Math.abs(d) > 1e-4) { wetterJetzt[k] += d * (1 - Math.exp(-dt / 7)); wetterNeu = true; } }
  if (wetterNeu) { setTime(stunde); if (mats) { mats.asphalt.roughness = 1 - 0.55 * wetterJetzt.nass; mats.asphalt.envMapIntensity = 0.55 + 2.0 * wetterJetzt.nass; mats.gehweg.roughness = 1 - 0.3 * wetterJetzt.nass; } }
  if (wolken) {
    const sonneHoch = THREE.MathUtils.clamp(sunDir.y / 0.5, 0, 1);
    const hochOben = aktiv?.erde ? erdHoehe : 0;
    wolken.update(dt, camera.position, { dichte: wetterJetzt.wolken, nacht, sonneHoch });
    if (!sky.visible || hochOben > 1200 || (aktiv?.erde && wolkenberge?.enabled)) wolken.mesh.visible = false;   // dichter Nebel: der Himmel ist Nebelfarbe, die Wolkendecke darüber verdunkelte das Bild; Erde: über den Wolken keine Decke
    sterne.update(camera.position, { nacht: hochOben > 30000 ? 1 : nacht, wolken: hochOben > 30000 ? 0 : wetterJetzt.wolken });
    if (aktiv?.erde && hochOben > 500000) sterne.mesh.visible = false;   // oben zeichnet kit/weltraum.js den Himmel
    regen.update(dt, camera.position, hochOben > 2000 ? 0 : wetterJetzt.regen, wetterJetzt.wind, wetterLive ? live.windRichtung : 250);
    if (!schnee) { schnee = new Schnee(MOBIL ? 900 : 2600); scene.add(schnee.mesh); }
    schnee.update(dt, camera.position, hochOben > 2000 ? 0 : wetterJetzt.schnee, wetterJetzt.wind, wetterLive ? live.windRichtung : 250);
    if (!gewitter) gewitter = new Gewitter(scene, ton);
    { const f = gewitter.update(dt, hochOben > 6000 ? 0 : wetterJetzt.gewitter, camera.position); renderer.toneMappingExposure = belichtung * (1 + f * 1.5); }
    BODEN_U.uNassB.value = wetterJetzt.nass; BODEN_U.uRegenB.value = wetterJetzt.regen; BODEN_U.uSchneeB.value = Math.max(wetterJetzt.decke || 0, (wetterJetzt.schnee || 0) * 0.7); BODEN_U.uZeitB.value = (BODEN_U.uZeitB.value + dt) % 1000;
  }
  const nebelNah = 1 - 0.78 * wetterJetzt.nebel;   // Nebel zieht den Dunst heran
  if (!(aktiv?.erde && (atmosPass.enabled || erdHoehe > 2000 || spiel.modus === 'jet'))) { scene.fog.near *= nebelNah; scene.fog.far = scene.fog.near + ((aktiv?.erde && !MOBIL ? 3000 : 1250) + (aktiv?.erde ? erdHoehe * 25 : 0)) * nebelNah * nebelNah; }
  renderer.info.reset();
  const __t4 = performance.now();
  if (spiel.modus === 'bord' && spiel.bord?.an) { spiel.bord.kameraSetzen(camera, dt); }
  { const innen = spiel.modus === 'bord' && spiel.bord?.szene; hauptPass.scene = innen || scene; hauptPass.camera = innen ? spiel.bord.kamera : camera; }   // U-Bahn: eigene Szene und Kamera
  if (aktiv?.erde && !MOBIL) { camera.updateMatrixWorld(); if (atmosPass.enabled) atmosPass.matrizen(camera); if (wolkenberge?.enabled) wolkenberge.matrizen(camera);
    { let k = 0; if (spiel.modus === 'fahren' && spiel.auto && shell?.stand.einst.blur !== false) k = THREE.MathUtils.smoothstep(spiel.auto.kmh, 45, 150) * 0.85; else if (spiel.modus === 'jet' && shell?.stand.einst.blur !== false) k = 0.8; blurPass.setzen(camera, k); } }   // Kamera steht jetzt endgültig
  SU.uNacht.value = nacht;
  if (aktiv?.erde && schiffe && !MOBIL && !(spiel.modus === 'bord' && spiel.bord?.szene)) schiffe.spiegelRendern(scene, camera, erdHoehe);
  { const evB = renderer.toneMappingExposure; auge.staerke = aktiv?.erde ? 1 - THREE.MathUtils.smoothstep(erdHoehe ?? 0, 400, 3500) : 0; auge.update(dt, evB); renderer.toneMappingExposure = evB * auge.ev; composer.render(dt); renderer.toneMappingExposure = evB; }
  fotoNachBild();
  if (window.__hell) window.__hell();   // Prüfstand tools/blitz_probe.mjs: Helligkeit jedes Bildes
  if (window.__messen) {   // Messung (tools/erde_mess.mjs): lange Bilder mit Teilzeiten und neuen Shadern
    const __dauer = performance.now() - __t0, __g = window.__gl, __gs = __g ? { ...__g } : null; if (__g) for (const k in __g) __g[k] = 0;
    const __progs = renderer.info.programs || [], __neuP = __progs.filter(p => !(window.__progSeen ||= new Set()).has(p.id)).map(p => p.name); for (const p of __progs) window.__progSeen.add(p.id);
    if (__dauer > 60) (window.__langeBilder ||= []).push({ t: performance.now(), neuP: __neuP, gl: __gs && Object.fromEntries(Object.entries(__gs).map(([k, v]) => [k, Math.round(v)])), ms: Math.round(__dauer), lod: Math.round(__t1 - __t0), update: Math.round(__t3 - __t2), render: Math.round(performance.now() - __t4), progs: renderer.info.programs?.length, tex: renderer.info.memory.textures, calls: renderer.info.render.calls, hoehe: Math.round(erdHoehe) });
  }
  if (etikettDa) labels.render(scene, camera);
  zeigeLeistung(dt); aufloesungRegeln(dt);
  shell?.update(dt);
}
function frame(ts) {
  requestAnimationFrame(frame);
  if (!innerWidth || !innerHeight || window.DASH?.pause || shell?.pausiert) return;   // verstecktes Fenster: nichts zeichnen; Prüfstände takten selbst; Pausemenü
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
    if (modus && e.pointerType === 'mouse' && e.buttons === 0) { erdLos(); return; }   // außerhalb des Fensters losgelassen: sonst folgte die Erde jeder Mausbewegung (07.11.2026)
    if (!modus || !frei() || pinch) return; const dx = e.clientX - letzt[0], dy = e.clientY - letzt[1]; letzt = [e.clientX, e.clientY];
    if (modus === 'drehen') erdKam.drehen(dx, dy); else erdKam.ziehen(camera, ...ndc(e.clientX, e.clientY));
  });
  const erdLos = () => { if (modus === 'ziehen' && erdKam) erdKam.loslassen(); modus = null; };
  addEventListener('pointerup', erdLos); addEventListener('pointercancel', erdLos); addEventListener('blur', erdLos);
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
    // Wahrzeichen und Riesenräder zuerst (Teil des Namens genügt: "eiffel", "pyramide", "brücke")
    const zuWz = o => { const b = document.createElement('button'); b.innerHTML = `${o.name}<small>Wahrzeichen</small>`; b.onclick = () => { feld.value = ''; treffer.classList.remove('offen'); feld.blur(); if (aktiv?.erde && spiel.modus !== 'frei') naviSetzen({ name: o.name, lat: o.lat, lon: o.lon }); else erdZiel({ lat: o.lat, lon: o.lon, dist: o.dist, neigung: 76, kurs: o.kurs, boden: true }); }; treffer.appendChild(b); };
    const wzHits = [...WAHRZEICHEN.map(w => ({ name: w.name, lat: w.lat, lon: w.lon, kurs: w.kurs + 25, dist: Math.max(260, w.hoch * 2.6, w.frei * 3.4) })), ...RAEDER.map(r => ({ name: r[0], lat: r[1], lon: r[2], kurs: r[3] + 40, dist: Math.max(300, r[4] * 2.6) }))].filter(w => w.name.toLowerCase().includes(q)).slice(0, 5); wzHits.forEach(zuWz);
    // Wracks und Tiefseegräben: das U-Boot startet direkt dort
    const uwHits = [...WRACKS.map(w => ({ ...w, art: 'Wrack, mit dem U-Boot' })), ...TIEFSTELLEN.map(w => ({ ...w, art: 'Tiefsee, mit dem U-Boot' }))].filter(w => w.name.toLowerCase().includes(q)).slice(0, 3);
    for (const o of uwHits) { const b = document.createElement('button'); b.innerHTML = `${o.name}<small>${o.art}</small>`; b.onclick = () => { feld.value = ''; treffer.classList.remove('offen'); feld.blur(); wasserZuStelle(o); }; treffer.appendChild(b); }
    const hits = orteListe.filter(o => o.name.toLowerCase().startsWith(q) || o.en.toLowerCase().startsWith(q)).sort((a, b) => b.pop - a.pop).slice(0, 10 - wzHits.length - uwHits.length);
    for (const o of hits) {
      const b = document.createElement('button'); b.innerHTML = `${o.name}<small>${fmt(o.pop)} Einwohner</small>`;
      b.onclick = () => { feld.value = ''; treffer.classList.remove('offen'); feld.blur(); if (aktiv?.erde && spiel.modus !== 'frei') naviSetzen(o); else erdZiel({ lat: o.lat, lon: o.lon, dist: 700, neigung: 66, kurs: 0, boden: true }); };   // im Spiel: Ziel der Navigation
      treffer.appendChild(b);
    }
    treffer.classList.toggle('offen', hits.length + wzHits.length + uwHits.length > 0);
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
  $('wetter').onclick = () => { const k = ['live', ...Object.keys(WETTER)], i = (k.findIndex(x => wetterLive ? x === 'live' : WETTER[x] === wetterZiel) + 1) % k.length; setWetter(k[i]); };
  setTime(15); updateEnv();
  baueNav();
  projektInfo();
  const [start, stelle] = (location.hash || '#erde').slice(1).split('@');
  if (stelle && !ALS_SPIEL) kachelZiel = stelle.split(',').map(Number);
  baueErdSuche();
  minikarte = new Minikarte({ mobil: MOBIL }); navi = new Navi({ springen: naviSpringen });
  hintergrund = new Promise(r => setTimeout(r, 1200)).then(ladeBaukasten);   // erst die Kugel, dann Texturen, Menschen und Autos (rund 20 MB): sonst warten die Kacheln beim ersten Besuch auf den Baukasten
  hintergrund.catch(err => { console.error(err); ladetext('Fehler: ' + err.message); });
  await waehleAnsicht(ANSICHTEN.some(a => a.id === start) ? start : 'erde');
  requestAnimationFrame(frame);
  shell = new SpielShell({ MOBIL, ton, lexLaden, album: () => album, tierHin, fotoMachen, wasserBei: (art, wo) => wasserStarten(art, null, wo), eingabeLeeren: () => eingabe.bild(), werbeNah, werbeInfo, mitfliegen, mitfliegenEnde, weltgeschehen: () => weltgeschehen, erdZiel,
    titelBlick: sofort => {   // Titelbild wie Naders Vorbild (Nr. 75): die Sonne steht gerade hinter dem linken Erdrand, die Nachtseite zeigt die Stadtlichter. Beim Öffnen sofort da, später als Flug
      const n = new Date(), u = erdUtc ?? (n.getUTCHours() + n.getUTCMinutes() / 60), lonS = (12 - u) * 15;
      erdZiel({ lat: 16, lon: ((lonS + 104) % 360 + 540) % 360 - 180, dist: 15000000, neigung: 0, kurs: 0, dauer: sofort ? 0.05 : null });
    }, warteAufOrt: () => new Promise((res, rej) => { const t0 = performance.now(); const f = () => { if (erdOrt && !erdAuftrag && !erdKam.flug && erdRegime === 'ort' && aktiv?.kollision) res(); else if (performance.now() - t0 > 90000) rej(new Error('Ort kam nicht')); else setTimeout(f, 200); }; f(); }),
    spielStarten, spielBeenden, bordStarten, kreuzfahrt: () => schiffe?.fahrplan, kreuzfahrtFuss: (r, h) => { const F = schiffe?.fahrplan; if (!F?.bereit) return null; F.stelleAufHafen(r, h, 0); const H = F.routen[r].haefen[h], st = F.zustand(r, 0), k = st.kurs * D2R, lx = -Math.cos(k), ly = Math.sin(k), sg = H.land[0] * lx + H.land[1] * ly >= 0 ? 1 : -1, x = sg * 33.2, f = [Math.sin(k), Math.cos(k)], l = [lx, ly], o = l[0] * x + f[0] * 2, n = l[1] * x + f[1] * 2; return { name: H.name, lat: st.lat + n / 111320, lon: st.lon + o / (111320 * Math.cos(st.lat * D2R)) }; }, modus: () => spiel.modus, auto: () => spiel.auto, figur: () => spiel.figur, spielerGeo, ortName: p => p && orteListe.length ? ortNahe(orteListe, p.lat, p.lon)?.name : null, land: () => erdOrt?.daten.meta.land || null,
    setWetter, uhrWeiter: h => { if (erdUtc !== null) { erdUtc += h; erdStundeSetzen(); } }, utc: h => { if (h !== undefined) { erdUtc = h; erdEnvStunde = -99; erdStundeSetzen(); } return erdUtc; }, ALLE_FAHRZEUGE: () => ALLE_FAHRZEUGE, ALLE_MENSCHEN: () => ALLE_MENSCHEN, auftraege: () => auftraege,
    suche: t => { const a = []; for (const o of orteListe) { if ((o.name || '').toLowerCase().startsWith(t)) { a.push(o); if (a.length > 5) break; } } return a; },
    wunschHier: async () => { try { const [P] = await wfDaten, g = spiel.figur ? null : null, W = erdWelt, lage = W ? W.lokalZuGeo(spiel.modus === 'fuss' && spiel.figur?.pos ? spiel.figur.pos : camera.position) : null, nah = lage && orteListe.length ? ortNahe(orteListe, lage.lat, lage.lon) : null; location.href = wfWunschMail(P?.kontaktMail, { adresse: nah?.name || '', art: '', lage: lage ? `${lage.lat.toFixed(5)}, ${lage.lon.toFixed(5)}` : '' }); } catch (e) { console.warn(e); } },
    figurZumAuto, autoInReichweite, wetterText: () => wetterLive ? live.text : '', wetterWahl: () => wetterLive ? 'live' : Object.keys(WETTER).find(k => WETTER[k] === wetterZiel), WETTER, radio, SENDER, jetStarten: (art = 'jet') => { jetStarten(art); if (shell) { const k = art === 'heli' ? 'heli' : 'jet'; shell.stand.statistik[k] = (shell.stand.statistik[k] || 0) + 1; } }, flugWahl: () => flugWahl(), wasserStarten: art => { wasserStarten(art).catch(e => console.warn(e)); if (shell) { shell.stand.statistik[art] = (shell.stand.statistik[art] || 0) + 1; } }, jetAn: () => spiel.modus === 'jet', flugArt: () => spiel.jet?.art, flugAmBoden: () => !!spiel.jet?.flug.amBoden, flugAussteigen, lackieren: rgb => { const W = spiel.auto, U = W?.obj.userData.lackU; if (!U) return false; U.value.setRGB(rgb[0], rgb[1], rgb[2]); W.farbe = rgb; return true; }, reparieren: () => { const W = spiel.auto; if (!W?.schaden) return; W.schaden.reparieren(); W.motor = 1; }, schadenModus: an => { const W = spiel.auto; if (!an && W?.schaden) { W.schaden.reparieren(); W.motor = 1; } },
    grafik: stufe => { const pr = { auto: Math.min(devicePixelRatio, MOBIL ? 1.5 : 2), hoch: Math.min(devicePixelRatio, 2), mittel: Math.min(devicePixelRatio, 1.25), niedrig: 1 }[stufe] || 1; PR_MAX_GRAFIK = pr; const n = Math.min(pr, renderer.getPixelRatio() > pr ? pr : renderer.getPixelRatio()); renderer.setPixelRatio(n); composer.setPixelRatio(n); groesseSetzen(); GRAFIK_REGELN = stufe === 'auto'; } });
  // Direkt an eine Stelle (Register: "Im Spiel ansehen"): #spiel@lat,lon,Name
  if (ALS_SPIEL && stelle) { const [st, tierId] = stelle.split(';tier='), [la, lo, ...nm] = st.split(','); if (Number.isFinite(+la) && Number.isFinite(+lo)) { if (tierId) { TIERWUNSCH.art = tierId; TIERWUNSCH.lat = +la; TIERWUNSCH.lon = +lo; TIERWUNSCH.da = false; lexLaden().catch(() => {}); } hintergrund.then(async () => { const e = tierId ? (await lexLaden().catch(() => null))?.get(tierId) : null; if (e && imMeer(e)) { shell.aufWasser({ lat: +la, lon: +lo, name: e.o[2] }, e.tauchen ? 'schwimmer' : 'speedboot').catch(x => console.warn(x)); return; } shell.los({ name: decodeURIComponent(nm.join(',')) || 'Unterwegs', lat: +la, lon: +lo }); }); } else shell.titel(); }
  else if (ALS_SPIEL) shell.titel();
  hintergrund.then(() => setTimeout(wfVorladen, 4000));   // Karte der Werbefläche öffnet dann sofort
  if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(e => console.warn('Speicher', e?.message || e));   // Kacheln bleiben im Browser (dashboard/sw.js), der zweite Besuch lädt fast nichts neu
  window.DASH = { STEHEN_ARTEN, get blase() { return { an: !!blase.p, kopf: blase.el?.querySelector('b')?.textContent, text: blase.el?.querySelector('p')?.textContent, rect: blase.p ? blase.el.getBoundingClientRect().toJSON() : null }; }, personVorne: () => personVorne(spiel.figur), ansprechen: p => ansprechen(p), geschichteVon: p => aktiv?.menge ? geschichteVon(aktiv.menge, p) : null, werbeKlick, get kamera() { return camera; }, get wahrzeichen() { return wahrzeichen; }, get meerU() { return meer?.U; }, get szene() { return scene; }, get composer() { return composer; }, get weltobjekte() { return weltobjekte; }, bordStarten, kreuzer: () => kreuzer, figur: () => spiel.figur, aktiv: () => aktiv, THREE, get menschenQuellen() { return menschenQuellen; }, get bewegungen() { return bewegungen; }, spawn, renderer, scene, camera, controls, get mats() { return mats; }, gebaut, waehleAnsicht, setTime, setWetter, wetterJetzt, S, spiel, eingabe, spielStarten, spielBeenden,
    get ALLE_MENSCHEN() { return ALLE_MENSCHEN; }, get ALLE_FAHRZEUGE() { return ALLE_FAHRZEUGE; }, hintergrund: () => hintergrund, tick: (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) tick(dt); },
    wasser: () => ({ J: spiel.jet?.wasser ? spiel.jet : null, uw: unterwasser, an: !!spiel.uwAn, wasserHier, wasserSpiegel, grundHier }), wasserStarten, wasserZuStelle, begehbarNah, begehbarGehen, ubahn: () => ubahn, mitfahrt: () => mitfahrt, tierHin, tierBeiPunkt, fotoMachen, lexLaden, album: () => album, himmelstiere: () => himmelstiere, meerestiere: () => meerestiere, mitfahrtStarten, flugWahl, linienflug: flugStarten, flughaefenLaden: () => flughaefenLaden(FLUG_URL), FlugQuelle, ZugQuelle, ubahnStarten, metro, eingaenge: () => erdOrt?.eingaenge || [], szenen: () => aktiv?.szenen, weltgeschehen: () => weltgeschehen, echtzeit: () => echtzeit, mitfliegen, mitfliegenEnde, voelkerQuellen, auge, erde: () => ({ welt: erdWelt, kam: erdKam, ort: erdOrt, regime: erdRegime, auftrag: erdAuftrag, hoehe: erdHoehe }), erdZiel, erdOrtLaden, erdZelle, fokus, jetStarten, flugStarten: jetStarten, flugAussteigen, einsteigenWahl, jet: () => spiel.jet, erdUtc: h => { erdUtc = h; erdEnvStunde = -99; erdStundeSetzen(); }, wolkenberge: () => wolkenberge, atmosPass, atmos, sky, tiere: () => tiere, shell: () => shell, auftraege: () => auftraege, ton, spielAussteigen, radio, muenzen: () => muenzen, blurPass, polizei, meer: () => meer, schiffe: () => schiffe, live, setWetterLive: setWetter };
}
start().catch(err => { ladetext('Fehler: ' + err.message); console.error(err); });
