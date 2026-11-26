// Echtzeit (06.11.2026, Wunsch Nr. 51: "Flugzeuge, Züge und Schiffe sollen alle auch fahren, am besten in Echtzeit, wie sie gerade auch wirklich fahren."). Kostenlos, ohne Konto.
// Flugzeuge: alle der Welt aus adsb.lol (ODbL). Die GitHub Action des Repos legt die Lagen auf den Zweig live (tools/live/), das Spiel rechnet jedes Flugzeug mit Kurs und Tempo weiter. Eingestellt ist alle 10 Minuten, GitHub startet geplante Läufe aber nur alle paar Stunden (gemessen 07.11.2026: 3,8 und 6 Stunden). Lagen gelten 45 Minuten (MAX_ALTER), danach fliegen wieder die simulierten Flugzeuge.
// Züge: Finnland (Digitraffic, CC BY 4.0), Norwegen (Entur, NLOD), Berlin und Brandenburg (VBB über transport.rest), direkt aus dem Browser, nur nahe der Kamera. Transitous wäre weltweit, verbietet aber kommerzielle Nutzung, darum nicht dabei.
// Schiffe: Ostsee (Digitraffic Meri, CC BY 4.0). Überall sonst läuft die Simulation weiter, die Welt ist nie leer. Keine Kennzeichen, keine Hex Adressen, private Flugzeuge ohne Namen.
import { LOCALE } from './sprache.js';
import * as THREE from 'three';
import { geoZuSzene, szeneZuGeo, enu } from './erde.js';
import { fliegerLaden, fliegerMaterial, FLIEGER_FARBEN } from './flughafen.js';

export const ECHT = { q: null };   // die laufende Echtzeit, für kit/bahn.js und kit/schiffe.js
const LIVE = 'https://raw.githubusercontent.com/nadercbz/earth-3d-game/live/';
const D2R = Math.PI / 180, R2D = 180 / Math.PI, ERDE = 6371000, kl = THREE.MathUtils.clamp, MAX_ALTER = 45 * 60;
const FLUGTYP = { A318: ['Airbus A318', 'narrow'], A319: ['Airbus A319', 'narrow'], A320: ['Airbus A320', 'narrow'], A321: ['Airbus A321', 'narrow'], A19N: ['Airbus A319neo', 'narrow'], A20N: ['Airbus A320neo', 'narrow'], A21N: ['Airbus A321neo', 'narrow'], B737: ['Boeing 737-700', 'narrow'], B738: ['Boeing 737-800', 'narrow'], B739: ['Boeing 737-900', 'narrow'], B38M: ['Boeing 737 MAX 8', 'narrow'], B752: ['Boeing 757-200', 'narrow'], B753: ['Boeing 757-300', 'narrow'], C919: ['Comac C919', 'narrow'],
  B763: ['Boeing 767-300', 'wide'], B772: ['Boeing 777-200', 'wide'], B77W: ['Boeing 777-300ER', 'wide'], B788: ['Boeing 787-8', 'wide'], B789: ['Boeing 787-9', 'wide'], B78X: ['Boeing 787-10', 'wide'], B744: ['Boeing 747-400', 'wide'], B748: ['Boeing 747-8', 'wide'], A332: ['Airbus A330-200', 'wide'], A333: ['Airbus A330-300', 'wide'], A339: ['Airbus A330-900', 'wide'], A359: ['Airbus A350-900', 'wide'], A35K: ['Airbus A350-1000', 'wide'], A388: ['Airbus A380', 'wide'], MD11: ['McDonnell Douglas MD-11', 'wide'],
  E170: ['Embraer E170', 'regional'], E75L: ['Embraer E175', 'regional'], E190: ['Embraer E190', 'regional'], E195: ['Embraer E195', 'regional'], E295: ['Embraer E195-E2', 'regional'], BCS1: ['Airbus A220-100', 'regional'], BCS3: ['Airbus A220-300', 'regional'], CRJ7: ['Bombardier CRJ700', 'regional'], CRJ9: ['Bombardier CRJ900', 'regional'], AT75: ['ATR 72-500', 'regional'], AT76: ['ATR 72-600', 'regional'], DH8D: ['De Havilland Dash 8-400', 'regional'] };
const KURSNAME = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'], zahl = n => Math.round(n).toLocaleString(LOCALE);
const kursText = k => { const g = (k * R2D + 720) % 360; return `${Math.round(g)}°, ${KURSNAME[Math.round(g / 45) % 8]}`; };
const alterText = s => s < 90 ? 'gerade eben' : s < 3600 ? `vor ${Math.round(s / 60)} Min.` : `vor ${(s / 3600).toFixed(1).replace('.', ',')} Std.`;

const _g = { lat: 0, lon: 0, k: 0 }, _p = new THREE.Vector3(), _w = new THREE.Vector3(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _l = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
// Großkreis: von lat, lon mit Kurs k (Bogenmaß) s Meter weiter, liefert auch den Kurs am Ziel
function vor(lat, lon, k, s, o = _g) {
  if (s < 1) { o.lat = lat; o.lon = lon; o.k = k; return o; }
  const d = s / ERDE, la = lat * D2R, sd = Math.sin(d), cd = Math.cos(d), sl = Math.sin(la), cl = Math.cos(la), sk = Math.sin(k), ck = Math.cos(k), sl2 = sl * cd + cl * sd * ck;
  o.lat = Math.asin(kl(sl2, -1, 1)) * R2D; o.lon = ((lon + Math.atan2(sk * sd * cl, cd - sl * sl2) * R2D + 540) % 360) - 180; o.k = Math.atan2(sk * cl, ck * cd * cl - sl * sd); return o;
}
const peilung = (la0, lo0, la1, lo1) => { const a = la0 * D2R, b = la1 * D2R, d = (lo1 - lo0) * D2R; return Math.atan2(Math.sin(d) * Math.cos(b), Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(d)); };
const abstand = (la0, lo0, la1, lo1) => { const c = Math.cos((la0 + la1) * 0.5 * D2R); return Math.hypot((la1 - la0) * 111195, (lo1 - lo0) * 111195 * c); };

// ---------- Zeichen für die Sicht von oben: Flugzeug mit Streifen, Einheit Länge 1, Nase +z ----------
function iconFlug() {
  const P = [], S = [], tri = (a, b, c, d, e, f, s = 1) => { P.push(a, 0, b, c, 0, d, e, 0, f); S.push(s, s, s); };
  tri(0, 0.5, 0.07, 0.28, -0.07, 0.28); tri(0.07, 0.28, 0.07, -0.42, -0.07, 0.28); tri(-0.07, 0.28, 0.07, -0.42, -0.07, -0.42); tri(0.07, -0.42, 0, -0.5, -0.07, -0.42);
  for (const s of [1, -1]) { tri(s * 0.07, 0.14, s * 0.5, -0.16, s * 0.5, -0.24); tri(s * 0.07, 0.14, s * 0.5, -0.24, s * 0.07, -0.1); tri(s * 0.05, -0.32, s * 0.22, -0.5, s * 0.22, -0.55); tri(s * 0.05, -0.32, s * 0.22, -0.55, s * 0.05, -0.45); }
  P.push(0.018, 0, -0.45, -0.018, 0, -0.45, 0, 0, -2.6); S.push(0.5, 0.5, 0);
  return { P: new Float32Array(P), S: new Float32Array(S) };
}
function iconBoden() {   // Raute mit Spitze in Fahrtrichtung, für Züge und Schiffe
  const P = [0, 0, 0.75, 0.32, 0, 0, 0, 0, -0.5, 0, 0, 0.75, 0, 0, -0.5, -0.32, 0, 0]; return { P: new Float32Array(P), S: new Float32Array(6).fill(1) };
}
function ebene(icon, cap, uni) {
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(icon.P, 3)); g.setAttribute('aS', new THREE.BufferAttribute(icon.S, 1));
  const mk = n => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; }, A = { aP: mk(3), aV: mk(3), aF: mk(4) }; for (const k in A) g.setAttribute(k, A[k]); g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: uni,
    vertexShader: `attribute vec3 aP, aV; attribute vec4 aF; attribute float aS; uniform float uT, uPx; varying vec4 vF;
      void main() {
        if (aF.w < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vF = vec4(0.0); return; }
        vec3 w = aP + aV * uT, o = normalize(w); float v2 = dot(aV, aV);
        vec3 f = v2 > 0.01 ? normalize(aV - o * dot(aV, o)) : normalize(cross(o, vec3(0.0, 1.0, 0.0))), r = cross(f, o);
        float s = -(modelViewMatrix * vec4(w, 1.0)).z * uPx * aF.w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(w + (r * position.x + f * position.z) * s, 1.0);
        vF = vec4(aF.rgb, aS);
      }`,
    fragmentShader: `uniform float uA; varying vec4 vF; void main() { if (vF.a <= 0.001) discard; gl_FragColor = vec4(vF.rgb, vF.a * uA);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = 3; me.name = 'echtzeit zeichen'; me.A = A; me.G = g; return me;
}

// ---------- Züge: drei offene Quellen, je Gebiet ----------
const VBB_ART = { suburban: 'sbahn', subway: 'ubahn', tram: 'tram', regional: 'regio', express: 'express' };
const GEBIETE = [
  { id: 'fi', name: 'Finnland', box: [59.4, 70.3, 19, 32.5], alle: 20, quelle: 'Digitraffic Finnland, CC BY 4.0',
    holen: async () => (await (await fetch('https://rata.digitraffic.fi/api/v1/train-locations/latest/')).json()).map(z => ({ id: 'fi' + z.trainNumber, lat: z.location.coordinates[1], lon: z.location.coordinates[0], v: (z.speed || 0) / 3.6, kurs: null, name: 'Zug ' + z.trainNumber, ziel: '', art: 'regio', t: Date.parse(z.timestamp) || Date.now() })) },
  { id: 'no', name: 'Norwegen', box: [57.5, 71.5, 4, 31.5], alle: 30, quelle: 'Entur, NLOD',
    holen: async () => { const r = await fetch('https://api.entur.io/realtime/v2/vehicles/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', 'ET-Client-Name': 'earth3dgame-spiel' }, body: JSON.stringify({ query: '{vehicles(mode:RAIL){vehicleId line{publicCode lineName} destinationName location{latitude longitude} bearing speed lastUpdated}}' }) }), d = await r.json(), jetzt = Date.now(); return (d?.data?.vehicles || []).filter(q => q.location && jetzt - Date.parse(q.lastUpdated) < 300000).map(q => ({ id: 'no' + q.vehicleId, lat: q.location.latitude, lon: q.location.longitude, v: q.speed ?? null, kurs: q.bearing != null ? q.bearing * D2R : null, name: q.line?.publicCode || 'Zug', ziel: q.destinationName || '', art: 'regio', t: Date.parse(q.lastUpdated) })); } },
  { id: 'vb', name: 'Berlin und Brandenburg', box: [51.2, 53.7, 11.2, 14.9], alle: 20, nurNah: true, quelle: 'VBB über transport.rest',
    // Die Antwort ist auf rund 120 Fahrzeuge begrenzt und nicht nach Nähe sortiert: am Boden nur ein enges Fenster abfragen, sonst fehlen die Züge vor der Tür
    holen: async (b, hA) => { const eng = hA < 6000, dLa = eng ? 0.016 : 0.16, dLo = eng ? 0.026 : 0.26, r = await fetch(`https://v6.vbb.transport.rest/radar?north=${(b.lat + dLa).toFixed(4)}&west=${(b.lon - dLo).toFixed(4)}&south=${(b.lat - dLa).toFixed(4)}&east=${(b.lon + dLo).toFixed(4)}&results=${eng ? 120 : 200}&duration=30&frames=0&polylines=false&bus=false&ferry=false&language=de`), d = await r.json(), jetzt = Date.now(), doppelt = new Set(), L = []; for (const m of d?.movements || d || []) { if (!m.location || !VBB_ART[m.line?.product]) continue; const k = `${m.line.name}:${m.location.latitude.toFixed(3)}:${m.location.longitude.toFixed(3)}`; if (doppelt.has(k)) continue; doppelt.add(k); L.push({ id: 'vb' + m.tripId, lat: m.location.latitude, lon: m.location.longitude, v: null, kurs: null, name: m.line.name || 'Zug', ziel: m.direction || '', art: VBB_ART[m.line.product], t: jetzt }); } return L; } },
];
const imGebiet = (B, lat, lon, m = 0) => lat > B[0] - m && lat < B[1] + m && lon > B[2] - m && lon < B[3] + m;
const SEE_BOX = [57.3, 66.2, 16.5, 33];

const NAH_MAX = 14, STREIFEN_N = 16;
export class Echtzeit {
  constructor(szene, { mobil = false } = {}) {
    this.szene = szene; this.mobil = mobil; ECHT.q = this; this.an = true; this.now = Date.now() / 1000; this.zeit = 0;
    this.ecef = new THREE.Group(); this.ecef.name = 'echtzeit fern'; szene.add(this.ecef); this.ecef.visible = false;
    this.uF = { uT: { value: 0 }, uPx: { value: 0.01 }, uA: { value: 1 } }; this.uB = { uT: { value: 0 }, uPx: { value: 0.008 }, uA: { value: 1 } };
    this.fern = ebene(iconFlug(), mobil ? 9000 : 16000, this.uF); this.boden = ebene(iconBoden(), 4000, this.uB); this.ecef.add(this.fern, this.boden);
    this.F = null; this.tF = 0; this.tBasis = 0; this.fehlerF = 0;
    this.zuege = new Map(); this.gebiet = {}; this.schiffe = new Map(); this.schiffMeta = new Map(); this.tS = 0; this.tSM = 0; this.schiffStand = 0; this.bodenNeu = false; this.tBodenBasis = 0;
    this.nah = []; this.tNah = 0; this.typ = null; this.maxNah = mobil ? 6 : NAH_MAX; this.folge = null;
    fliegerLaden().then(M => { this.typ = {}; const mats = fliegerMaterial(); for (const n of Object.keys(M)) { const e = { n: 0 }; for (const part of ['lack', 'farbe', 'glas', 'licht', 'teil']) { if (!M[n][part]) continue; const im = new THREE.InstancedMesh(M[n][part], mats[part], this.maxNah); im.count = 0; im.frustumCulled = false; im.name = 'echt flieger ' + n; szene.add(im); e[part] = im; } this.typ[n] = e; } }).catch(e => console.warn('Echtzeit Flieger', e));
    // Kondensstreifen: Band zur Kamera gedreht, wird nach hinten breiter und blendet aus
    const sp = [], st = []; for (let i = 0; i <= STREIFEN_N; i++) for (const s of [-1, 1]) { sp.push(0, 0, 0); st.push(i / STREIFEN_N, s); } const idx = []; for (let i = 0; i < STREIFEN_N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.streifen = Array.from({ length: this.maxNah }, () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp.slice(), 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(st.slice(), 2)); g.setIndex(idx);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uAlpha: { value: 0 }, uHell: { value: 1 } },
        vertexShader: `attribute vec2 aT; uniform vec3 uA, uB; varying float vT; void main() { vT = aT.x; vec3 p = mix(uA, uB, aT.x), d = normalize(uB - uA), z = normalize(cameraPosition - p), s = normalize(cross(d, z)); float breite = mix(7.0, 130.0, aT.x); gl_Position = projectionMatrix * viewMatrix * vec4(p + s * aT.y * breite, 1.0); }`,
        fragmentShader: `uniform float uAlpha, uHell; varying float vT; void main() { float a = uAlpha * pow(1.0 - vT, 1.3) * smoothstep(0.0, 0.015, vT) * 0.6; gl_FragColor = vec4(vec3(0.96, 0.97, 1.0) * uHell, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
      const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.visible = false; me.renderOrder = 2; me.name = 'echt kondensstreifen'; szene.add(me); return me; });
    // Licht am Flugzeug: bleibt sichtbar, auch wenn das Flugzeug kleiner als ein Bildpunkt ist. Nachts blitzt es
    this.punktG = new THREE.BufferGeometry(); this.punktG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxNah * 3), 3).setUsage(THREE.DynamicDrawUsage)); this.punktG.setAttribute('aPh', new THREE.BufferAttribute(Float32Array.from({ length: this.maxNah }, (_, i) => i * 0.37), 1)); this.punktG.setDrawRange(0, 0);
    this.punkte = new THREE.Points(this.punktG, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uZeit: { value: 0 }, uNacht: { value: 0 }, uPr: { value: Math.min(2, devicePixelRatio || 1) } },
      vertexShader: `attribute float aPh; uniform float uZeit, uNacht, uPr; varying float vB; void main() { float bl = step(0.9, fract(uZeit * 0.9 + aPh)); vB = mix(0.55, 0.45 + bl * 2.6, uNacht); gl_PointSize = uPr * mix(2.0, 2.2 + bl * 2.2, uNacht); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uNacht; varying float vB; void main() { vec2 q = gl_PointCoord - 0.5; if (dot(q, q) > 0.25) discard; gl_FragColor = vec4(mix(vec3(0.1, 0.11, 0.13), vec3(1.0, 0.96, 0.9) * vB, uNacht), 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` })); this.punkte.frustumCulled = false; this.punkte.renderOrder = 3; this.punkte.visible = false; this.punkte.name = 'echt lichter'; szene.add(this.punkte);
  }
  zeigen(an) { this.ecef.visible = an && this.an; this.punkte.visible = an && this.an && this.punkte.visible; if (!an) { for (const s of this.streifen) s.visible = false; if (this.typ) for (const n in this.typ) { const e = this.typ[n]; for (const p of ['lack', 'farbe', 'glas', 'licht', 'teil']) if (e[p]) e[p].count = 0; } this.punkte.visible = false; } }
  // Am Anfang jedes Bilds: eine Uhr für alles in diesem Bild, sonst zittert die Kamera beim Mitfliegen gegen das Flugzeug
  bild() { this.now = Date.now() / 1000; }

  // ---------- Flugzeuge: Daten ----------
  async fluegeHolen() {
    try {
      const r = await fetch(LIVE + 'fluege.json', { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); const d = await r.json(), n = d.la?.length || 0; if (n < 100) return; if (this.F && d.t <= this.F.t) return;
      const G = n => new Float32Array(n), F = { n, t: d.t, q: d.q, la: G(n), lo: G(n), h: G(n), k: G(n), v: G(n), z: G(n), ty: Uint8Array.from(d.ty), cs: d.cs, id: Uint16Array.from(d.id), typen: d.typen, P: G(n * 3), V: G(n * 3), sicht: new Uint8Array(n) };
      for (let i = 0; i < n; i++) { F.la[i] = d.la[i] / 1e4; F.lo[i] = d.lo[i] / 1e4; F.h[i] = d.h[i]; F.k[i] = d.k[i] * D2R; F.v[i] = d.v[i]; F.z[i] = d.z[i]; }
      const alt = this.F; this.F = F; F.nachId = new Map(); for (let i = 0; i < n; i++) F.nachId.set(F.id[i], i);
      this.basis(); this.nahUmhaengen(alt); this.fehlerF = 0;
    } catch (e) { this.fehlerF++; }
  }
  fluegeLeben() { return !!this.F && Date.now() / 1000 - this.F.t < MAX_ALTER; }
  // Lage eines Flugzeugs jetzt: Großkreis mit Tempo und Kurs, Höhe mit der letzten Steigrate, wer unten ankommt, ist gelandet
  flugLage(i, o = _g) { const F = this.F, a = Math.max(0, this.now - F.t); vor(F.la[i], F.lo[i], F.k[i], F.v[i] * a, o); const z = F.z[i], h = F.h[i] + z * Math.min(a, 300); o.h = kl(h, 150, 13700); o.gelandet = z < -1 && F.h[i] < 4500 && h < 120; o.z = a < 300 ? z : 0; return o; }
  basis() {
    const F = this.F; if (!F) return; const A = this.fern.A, P = F.P, V = F.V, aP = A.aP.array, aV = A.aV.array, aF = A.aF.array, cap = A.aP.count, N = Math.min(F.n, cap), t = this.now = Date.now() / 1000; this.tBasis = t; this.uF.uT.value = 0;
    const leb = this.fluegeLeben();
    for (let i = 0; i < N; i++) {
      this.flugLage(i, _g); const j = i * 3, m = i * 4; if (!leb || _g.gelandet) { F.sicht[i] = 0; aF[m + 3] = 0; continue; } F.sicht[i] = 1; geoZuSzene(_g.lat, _g.lon, _g.h, _p); P[j] = aP[j] = _p.x; P[j + 1] = aP[j + 1] = _p.y; P[j + 2] = aP[j + 2] = _p.z;
      const la = _g.lat * D2R, lo = _g.lon * D2R, sa = Math.sin(la), ca = Math.cos(la), so = Math.sin(lo), co = Math.cos(lo), sk = Math.sin(_g.k) * F.v[i], ck = Math.cos(_g.k) * F.v[i];
      // Ost (-so, 0, -co), Nord (-sa co, ca, sa so) in der Szene
      V[j] = aV[j] = -so * sk - sa * co * ck; V[j + 1] = aV[j + 1] = ca * ck; V[j + 2] = aV[j + 2] = -co * sk + sa * so * ck;
      const tief = kl(1 - (_g.h - 1500) / 4500, 0, 1); aF[m] = 1.5 + tief * 0.4; aF[m + 1] = 1.42 - tief * 0.5; aF[m + 2] = 1.2 - tief * 0.75; aF[m + 3] = FLUGTYP[F.typen[F.ty[i]]]?.[1] === 'wide' ? 1.25 : 1;
    }
    A.aP.needsUpdate = A.aV.needsUpdate = A.aF.needsUpdate = true; this.fern.G.instanceCount = N;
  }

  // ---------- Züge und Schiffe: Daten ----------
  zuegeHolen(blick, hA) {
    const jetzt = performance.now() / 1000;
    for (const G of GEBIETE) {
      const S = this.gebiet[G.id] ||= { tNaechst: 0, stand: 0, laeuft: false, bx: 0, by: 0 }; const offen = imGebiet(G.box, blick.lat, blick.lon, 2) && hA < (G.nurNah ? 120000 : 1500000); if (!offen || S.laeuft || jetzt < S.tNaechst) continue;
      S.laeuft = true; S.tNaechst = jetzt + (G.nurNah && hA > 6000 ? 45 : G.alle) * (this.mobil ? 1.5 : 1); G.holen(blick, hA).then(L => { this.zuegeMischen(G, L, blick); S.stand = performance.now() / 1000; S.fehler = 0; }).catch(() => { S.fehler = (S.fehler || 0) + 1; S.tNaechst = performance.now() / 1000 + G.alle * Math.min(8, 1 + S.fehler); }).finally(() => { S.laeuft = false; });
    }
  }
  zuegeMischen(G, L, blick) {
    const neu = new Set();
    for (const r of L) {
      if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue; const a = this.zuege.get(r.id); neu.add(r.id); r.geb = G; r.tS = Date.now();
      if (a) { const dt = (r.t - a.t) / 1000, s = abstand(a.lat, a.lon, r.lat, r.lon); if (dt > 2 && s < 8000) { const v = s / dt; if (r.v == null) r.v = a.v == null ? v : a.v * 0.4 + v * 0.6; if (r.kurs == null) r.kurs = s > 12 ? peilung(a.lat, a.lon, r.lat, r.lon) : a.kurs; } else { r.v ??= a.v; r.kurs ??= a.kurs; } }
      this.zuege.set(r.id, r);
    }
    // Was nicht mehr in der Antwort steht, fällt weg. Bei der VBB nur im abgefragten Fenster
    for (const [id, r] of this.zuege) if (r.geb === G && !neu.has(id)) this.zuege.delete(id);
    this.bodenNeu = true;
  }
  schiffeHolen(blick, hA) {
    const jetzt = performance.now() / 1000; if (!imGebiet(SEE_BOX, blick.lat, blick.lon, 3) || hA > 3000000) return;
    if (jetzt > this.tSM) { this.tSM = jetzt + 1200; fetch(`https://meri.digitraffic.fi/api/ais/v1/vessels?from=${Date.now() - 24 * 3600000}`).then(r => r.json()).then(L => { for (const q of L) this.schiffMeta.set(q.mmsi, q); }).catch(() => { this.tSM = performance.now() / 1000 + 120; }); }
    if (jetzt > this.tS) { this.tS = jetzt + 60; fetch('https://meri.digitraffic.fi/api/ais/v1/locations').then(r => r.json()).then(d => { const t0 = Date.now(); this.schiffe.clear(); for (const q of d.features || []) { const P = q.properties, c = q.geometry?.coordinates; if (!c || t0 - P.timestampExternal > 3600000) continue; const v = (P.sog || 0) * 0.51444, h = P.heading != null && P.heading < 360 ? P.heading : P.cog < 360 ? P.cog : 0; this.schiffe.set(q.mmsi ?? P.mmsi, { mmsi: q.mmsi ?? P.mmsi, lat: c[1], lon: c[0], v: v < 0.3 ? 0 : v, kurs: (v > 1 && P.cog < 360 ? P.cog : h) * D2R, t: P.timestampExternal }); } this.schiffStand = performance.now() / 1000; this.bodenNeu = true; }).catch(() => { this.tS = performance.now() / 1000 + 180; }); }
  }
  schiffeLeben(lat, lon) { return imGebiet(SEE_BOX, lat, lon) && this.schiffe.size > 20 && performance.now() / 1000 - this.schiffStand < 300; }
  zuegeLeben(lat, lon) { const t = performance.now() / 1000; return GEBIETE.some(G => imGebiet(G.box, lat, lon) && this.gebiet[G.id]?.stand && t - this.gebiet[G.id].stand < 150); }
  zugLage(r, o = {}) { const a = kl((Date.now() - r.t) / 1000, 0, 60); if (r.kurs != null && r.v) vor(r.lat, r.lon, r.kurs, r.v * a, o); else { o.lat = r.lat; o.lon = r.lon; o.k = r.kurs; } return o; }
  schiffLage(r, o = {}) { const a = kl((Date.now() - r.t) / 1000, 0, 900); return vor(r.lat, r.lon, r.kurs, r.v * a, o); }
  zuegeBei(lat, lon, m) { const L = [], dLa = m / 111000, dLo = dLa / Math.max(0.1, Math.cos(lat * D2R)); for (const r of this.zuege.values()) if (Math.abs(r.lat - lat) < dLa && Math.abs(r.lon - lon) < dLo) L.push(r); return L; }
  schiffeBei(lat, lon, m, max) { const L = []; for (const r of this.schiffe.values()) { const d = abstand(lat, lon, r.lat, r.lon); if (d < m) { r.d = d; L.push(r); } } L.sort((a, b) => a.d - b.d); return L.slice(0, max).map(r => ({ ...r, ...this.schiffDaten(r) })); }
  schiffDaten(r) { const M = this.schiffMeta.get(r.mmsi); return M ? { name: M.name || '', typ: M.shipType || 0, ziel: (M.destination || '').trim(), L: (M.referencePointA || 0) + (M.referencePointB || 0), B: (M.referencePointC || 0) + (M.referencePointD || 0) } : { name: '', typ: 0, ziel: '', L: 0, B: 0 }; }
  bodenZeichnen() {
    const A = this.boden.A, aP = A.aP.array, aV = A.aV.array, aF = A.aF.array, cap = A.aP.count; let i = 0; this.tBodenBasis = this.now; this.uB.uT.value = 0; const o = {};
    const setze = (lat, lon, k, v, r, g, b, gr) => { if (i >= cap) return; geoZuSzene(lat, lon, 40, _p); const j = i * 3, m = i * 4, la = lat * D2R, lo = lon * D2R, sa = Math.sin(la), ca = Math.cos(la), so = Math.sin(lo), co = Math.cos(lo), kk = k ?? 0, sk = Math.sin(kk) * (k == null ? 0 : v), ck = Math.cos(kk) * (k == null ? 0 : v); aP[j] = _p.x; aP[j + 1] = _p.y; aP[j + 2] = _p.z; aV[j] = -so * sk - sa * co * ck; aV[j + 1] = ca * ck; aV[j + 2] = -co * sk + sa * so * ck; aF[m] = r; aF[m + 1] = g; aF[m + 2] = b; aF[m + 3] = gr; i++; };
    for (const r of this.zuege.values()) { this.zugLage(r, o); setze(o.lat, o.lon, r.kurs, r.v || 0, 1.6, 0.78, 0.16, 0.9); }
    for (const r of this.schiffe.values()) { this.schiffLage(r, o); setze(o.lat, o.lon, r.kurs, r.v, 0.22, 1.25, 1.4, 0.9); }
    this.boden.G.instanceCount = i; A.aP.needsUpdate = A.aV.needsUpdate = A.aF.needsUpdate = true;
  }

  // ---------- Flugzeuge in der Nähe: echte Modelle, Lichter, Kondensstreifen ----------
  nahUmhaengen(alt) {   // neue Datei: gleiche Flugzeuge weich auf die neue Lage führen statt springen
    const F = this.F; for (let i = this.nah.length - 1; i >= 0; i--) { const o = this.nah[i], j = F.nachId.get(o.id); if (j === undefined) { if (o === this.folge) this.folgeEnde('Der Flug ist nicht mehr in den Daten.'); this.nah.splice(i, 1); continue; } const P0 = o.pw.clone(); o.i = j; this.flugLage(j, _g); geoZuSzene(_g.lat, _g.lon, _g.h, _w); o.korr.copy(P0).sub(_w); if (o.korr.lengthSq() > 2.5e11) o.korr.set(0, 0, 0); }
  }
  nahWaehlen(camW, hA) {
    const F = this.F; if (!F) return; const t = this.now - this.tBasis, P = F.P, V = F.V, N = Math.min(F.n, this.fern.A.aP.count), R2 = (hA > 40000 ? 300000 : 110000) ** 2, bis = this.maxNah, L = [];
    for (let i = 0; i < N; i++) { if (!F.sicht[i]) continue; const j = i * 3, dx = P[j] + V[j] * t - camW.x; if (dx * dx > R2) continue; const dy = P[j + 1] + V[j + 1] * t - camW.y; if (dy * dy > R2) continue; const dz = P[j + 2] + V[j + 2] * t - camW.z, d = dx * dx + dy * dy + dz * dz; if (d < R2) L.push([d, i]); }
    L.sort((a, b) => a[0] - b[0]); const halten = new Set(), neu = []; if (this.folge) { neu.push(this.folge); halten.add(this.folge.i); }
    for (const [, i] of L) { if (neu.length >= bis) break; if (halten.has(i)) continue; halten.add(i); neu.push(this.nah.find(o => o.i === i) || this.nahNeu(i)); }
    this.nah = neu;
  }
  nahNeu(i) { const F = this.F, id = F.id[i]; return { i, id, korr: new THREE.Vector3(), pw: new THREE.Vector3(), n: FLUGTYP[F.typen[F.ty[i]]]?.[1] || 'narrow', f: FLIEGER_FARBEN[id % FLIEGER_FARBEN.length] }; }
  nahZeichnen(dt, W, cam, tag, hell, nacht, hA) {
    const F = this.F, T = this.typ; if (T) for (const n in T) T[n].n = 0; const pos = this.punktG.attributes.position, kk = Math.exp(-dt / 10); let z = 0, s = 0; const zuL = W.zuLokal;
    for (const o of this.nah) {
      const i = o.i; this.flugLage(i, _g); if (_g.gelandet && o !== this.folge) continue; geoZuSzene(_g.lat, _g.lon, _g.h, _w).add(o.korr); o.korr.multiplyScalar(kk); o.pw.copy(_w); W.weltZuLokal(_w, _p);
      const e = enu(_g.lat, _g.lon), v = F.v[i], g = Math.atan2(_g.z, v); o.lat = _g.lat; o.lon = _g.lon; o.h = _g.h; o.k = _g.k;
      _f.copy(e.nord).multiplyScalar(Math.cos(_g.k)).addScaledVector(e.ost, Math.sin(_g.k)); _l.crossVectors(e.oben, _f).normalize(); _v.copy(_f).multiplyScalar(Math.cos(g)).addScaledVector(e.oben, Math.sin(g)); _u.crossVectors(_v, _l);
      _q.setFromRotationMatrix(_m.makeBasis(_w.copy(_l).negate(), _u, _f.copy(_v).negate())).premultiply(zuL); _m.compose(_p, _q, _s);   // die Modelle der Flughäfen haben die Nase bei -z
      const E = T?.[o.n]; if (E && E.n < this.maxNah) { const k = E.n++; E.lack.setMatrixAt(k, _m); E.glas?.setMatrixAt(k, _m); E.licht?.setMatrixAt(k, _m); if (E.farbe) { E.farbe.setMatrixAt(k, _m); E.farbe.setColorAt(k, _c.setRGB(o.f[0], o.f[1], o.f[2])); } if (E.teil) E.teil.setMatrixAt(k, _m.compose(_p, _q, _g.h - (W.bodenGeo?.(_g.lat, _g.lon) ?? 0) < 500 ? _s : _klein)); if (E.licht) E.licht.setColorAt(k, _c.setRGB(4.2, 4.2, 3.9)); }
      pos.setXYZ(z++, _p.x, _p.y, _p.z);
      // Kondensstreifen über 7,5 km, nur bei Tag, zur Kamera gedrehtes Band in lokalen Koordinaten
      const st = this.streifen[s]; if (st && _g.h > 7500 && tag > 0.15) { _v.applyQuaternion(zuL); const U = st.material.uniforms; U.uA.value.copy(_p).addScaledVector(_v, -42); U.uB.value.copy(_p).addScaledVector(_v, -14000 - (o.id % 7) * 1800); U.uAlpha.value = tag * kl((_g.h - 7500) / 900, 0, 1); U.uHell.value = hell; st.visible = true; s++; }
    }
    for (; s < this.streifen.length; s++) this.streifen[s].visible = false;
    if (T) for (const n in T) { const e = T[n]; for (const p of ['lack', 'farbe', 'glas', 'licht', 'teil']) { const m = e[p]; if (!m) continue; m.count = e.n; if (e.n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } } }
    this.punktG.setDrawRange(0, z); pos.needsUpdate = true; this.punkte.visible = z > 0; const U = this.punkte.material.uniforms; U.uZeit.value = this.zeit % 1000; U.uNacht.value = nacht;
  }

  // ---------- je Bild ----------
  update(dt, { camera, welt: W, blick, hA, nacht = 0, tag = 1, hell = 1, an = true }) {
    this.zeit += dt; const sichtbar = an && this.an;
    if (!sichtbar) { this.zeigen(false); return; }
    // Daten
    if ((this.tF -= dt) <= 0) { this.tF = this.fehlerF ? Math.min(600, 60 * (1 + this.fehlerF)) : 240; this.fluegeHolen(); }
    if ((this.tZQ = (this.tZQ ?? 1) - dt) <= 0) { this.tZQ = 2; this.zuegeHolen(blick, hA); this.schiffeHolen(blick, hA); }
    if (this.F && this.now - this.tBasis > 120) this.basis();
    if (this.bodenNeu || this.now - this.tBodenBasis > 60) { this.bodenNeu = false; this.bodenZeichnen(); }
    // Fern: die ganze Gruppe liegt in ECEF, nur ihre Lage folgt dem Anker
    this.ecef.visible = true; this.ecef.quaternion.copy(W.zuLokal); this.ecef.position.copy(W.ursprung).negate().applyQuaternion(W.zuLokal); this.ecef.updateMatrixWorld(true);
    this.uF.uT.value = this.now - this.tBasis; this.uB.uT.value = this.now - this.tBodenBasis;
    const lh = Math.log10(Math.max(hA, 100)), H = innerHeight || 800, ta = 2 * Math.tan(camera.fov * 0.5 * D2R) / H;
    this.uF.uPx.value = ta * kl(16 - (lh - 4) * 4, 4.2, 15); this.uF.uA.value = THREE.MathUtils.smoothstep(hA, 16000, 42000) * 0.95;
    this.uB.uPx.value = ta * kl(12 - (lh - 4) * 2, 6, 12); this.uB.uA.value = THREE.MathUtils.smoothstep(hA, 1500, 4000) * (hA > 2500000 ? 0.6 : 0.95);
    // Unsichtbare Zeichen nicht zeichnen (Nr. 87): unter 16 km sind die Flugzeugzeichen ganz ausgeblendet, kosteten aber jedes Bild alle Dreiecke (rund 74.000)
    this.fern.visible = this.uF.uA.value > 0.002; this.boden.visible = this.uB.uA.value > 0.002;
    // Nah: echte Modelle unter rund 60 km Kamerahöhe
    if (this.F && this.fluegeLeben() && (hA < 60000 || this.folge)) { if ((this.tNah -= dt) <= 0) { this.tNah = 1.3; W.lokalZuWelt(camera.position, _w); this.nahWaehlen(_w.clone(), hA); } this.nahZeichnen(dt, W, camera, tag, hell, nacht, hA); }
    else if (this.nah.length || this.punkte.visible) { this.nah = []; this.nahZeichnen(dt, W, camera, tag, hell, nacht, hA); }
    this.statusText();
  }
  // ---------- Status und Klick ----------
  status() { const F = this.F, leb = this.fluegeLeben(); return { flug: leb ? { n: F.sicht.reduce((a, b) => a + b, 0), alter: Math.max(0, this.now - F.t) } : null, zuege: this.zuege.size, schiffe: this.schiffe.size }; }
  statusText() { if ((this.tStatus = (this.tStatus ?? 0) - 1 / 60) > 0) return; this.tStatus = 5; const S = this.status(); this.statusZeile = S.flug ? `${zahl(S.flug.n)} echte Flugzeuge, Stand ${alterText(S.flug.alter)}${S.zuege ? `, ${zahl(S.zuege)} echte Züge` : ''}${S.schiffe ? `, ${zahl(S.schiffe)} echte Schiffe` : ''}` : ''; }
  // nächstes Echtes zum Bildpunkt (NDC), Flugzeuge zuerst, dazu die Züge und Schiffe rund um die Kamera
  treffer(nx, ny, camera, W, hA) {
    const asp = camera.aspect, grenze = (this.mobil ? 0.075 : 0.04); let beste = null, bd = grenze; W.lokalZuWelt(camera.position, _w); const cw = _w.clone(), cl2 = cw.lengthSq();
    const pr = (x, y, z) => { _p.set(x, y, z); if (_p.dot(cw) < _p.lengthSq() - 1) return null; W.weltZuLokal(_p, _v).project(camera); if (_v.z > 1 || _v.z < -1) return null; return Math.hypot((_v.x - nx) * asp, _v.y - ny); };
    const F = this.F; if (F && this.fluegeLeben()) { const t = this.now - this.tBasis, P = F.P, V = F.V, N = Math.min(F.n, this.fern.A.aP.count); if (hA > 12000) for (let i = 0; i < N; i++) { if (!F.sicht[i]) continue; const j = i * 3, d = pr(P[j] + V[j] * t, P[j + 1] + V[j + 1] * t, P[j + 2] + V[j + 2] * t); if (d !== null && d < bd) { bd = d; beste = { art: 'flug', i }; } }
      for (const o of this.nah) { const d = pr(o.pw.x, o.pw.y, o.pw.z); if (d !== null && d < bd) { bd = d; beste = { art: 'flug', i: o.i }; } } }
    const o = {}; for (const r of this.zuege.values()) { this.zugLage(r, o); geoZuSzene(o.lat, o.lon, 40, _w); const d = pr(_w.x, _w.y, _w.z); if (d !== null && d < bd) { bd = d; beste = { art: 'zug', r }; } }
    for (const r of this.schiffe.values()) { this.schiffLage(r, o); geoZuSzene(o.lat, o.lon, 40, _w); const d = pr(_w.x, _w.y, _w.z); if (d !== null && d < bd) { bd = d; beste = { art: 'schiff', r }; } }
    return beste;
  }
  info(t) {
    if (t.art === 'flug') { const F = this.F, i = t.i, cs = F.cs[i], ty = FLUGTYP[F.typen[F.ty[i]]]?.[0] || F.typen[F.ty[i]], L = this.flugLage(i, {}), a = this.now - F.t; return { art: 'Flugzeug', titel: cs || ty, text: `Dieses Flugzeug fliegt gerade wirklich. Die Lage kommt aus den offenen Empfängern von adsb.lol und wird seit dem letzten Datenstand mit Kurs und Tempo weitergerechnet.`, zeilen: [['Typ', ty], ['Höhe', `${zahl(Math.round(L.h / 50) * 50)} m`], ['Tempo', `${zahl(F.v[i] * 3.6)} km/h`], ['Kurs', kursText(L.k)], ['Stand', alterText(a)]], quelle: 'adsb.lol, Open Database License', mit: t.i }; }
    if (t.art === 'zug') { const r = t.r, a = (Date.now() - r.t) / 1000; return { art: 'Zug', titel: r.name + (r.ziel ? ` nach ${r.ziel}` : ''), text: `Dieser Zug fährt gerade wirklich, ${r.geb.name}.`, zeilen: [...(r.ziel ? [['Ziel', r.ziel]] : []), ...(r.v ? [['Tempo', `${zahl(r.v * 3.6)} km/h`]] : []), ['Stand', alterText(a)]], quelle: r.geb.quelle }; }
    const r = t.r, D = this.schiffDaten(r), a = (Date.now() - r.t) / 1000; return { art: 'Schiff', titel: D.name || 'Schiff', text: 'Dieses Schiff fährt gerade wirklich, gemeldet über AIS in der Ostsee.', zeilen: [...(D.ziel ? [['Ziel', D.ziel]] : []), ...(D.L ? [['Länge', `${zahl(D.L)} m`]] : []), ['Tempo', r.v ? `${zahl(r.v * 3.6)} km/h` : 'liegt still'], ['Stand', alterText(a)]], quelle: 'Digitraffic Meri, CC BY 4.0' };
  }
  // ---------- Mitfliegen ----------
  mitfliegen(i, W) { const F = this.F; let o = this.nah.find(q => q.i === i); if (!o) { o = this.nahNeu(i); this.flugLage(i, _g); geoZuSzene(_g.lat, _g.lon, _g.h, o.pw); this.nah.unshift(o); if (this.nah.length > this.maxNah) this.nah.length = this.maxNah; } this.folge = o; const cs = F.cs[i]; this.folgeName = cs || FLUGTYP[F.typen[F.ty[i]]]?.[0] || 'Flugzeug'; this.folgeTyp = FLUGTYP[F.typen[F.ty[i]]]?.[0] || ''; }
  folgeEnde(grund = null) { this.folge = null; if (this.beiFolgeEnde) this.beiFolgeEnde(grund); }
  // für die Kamera: Lage des verfolgten Flugzeugs in diesem Bild, mit derselben Uhr wie das Modell
  folgeLage() { const o = this.folge, F = this.F; if (!o || !F) return null; this.flugLage(o.i, _g); geoZuSzene(_g.lat, _g.lon, _g.h, _w).add(o.korr); const g = szeneZuGeo(_w); return { lat: g.lat, lon: g.lon, h: g.h, kurs: _g.k * R2D, tempo: F.v[o.i], name: this.folgeName, typ: this.folgeTyp }; }
}
const _klein = new THREE.Vector3(0.001, 0.001, 0.001);
