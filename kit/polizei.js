// Polizei und Fahndung (05.11.2026, Nader: "wie GTA 6"). Wer Menschen anfährt oder Autos rammt, wird gesucht: 1 bis 3 Sterne, je Stern mehr Streifenwagen. Keine Waffen, kein Blut: geschnappt heißt Strafe zahlen und aussteigen.
// Die Streifenwagen sind echte Fahrer (kit/drive.js) mit derselben Physik wie das eigene Auto. Sie folgen den Fahrspuren des Ortes über das Straßennetz zum Spieler (Routen aus kit/traffic.js),
// aus der Nähe mit freier Sicht direkt auf ihn zu. Wer sie abhängt, verliert nach und nach die Sterne. Überall auf der Erde, weil alles aus dem Straßennetz des Ortes kommt.
import * as THREE from 'three';
import { Fahrer } from './drive.js';
import { ladeFahrzeug, lackSetzen, FAHRZEUGE } from './vehicles.js';
import { ueberlappt } from './traffic.js';
import { lichtFleck } from './nachtlicht.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const ZELLE = 70;

// Lackierung: helle Karosserie mit blauem Band entlang der Seite, keine echten Schriftzüge
function streifenLack(obj, H) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(), kopie = new Map();
  obj.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material) || /^rad_/.test(o.name) || /^rad_/.test(o.parent?.name || '')) return;
    if (!kopie.has(o.material)) {
      const alt = o.material, altF = alt.onBeforeCompile, altK = alt.customProgramCacheKey?.() || 'x', m = alt.clone(), zu = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      m.onBeforeCompile = (sh, r) => {
        altF?.call(m, sh, r); sh.uniforms.uZuAuto = { value: zu }; sh.uniforms.uBand = { value: new THREE.Vector2(H * 0.36, H * 0.56) };
        sh.vertexShader = 'uniform mat4 uZuAuto; varying float vAutoY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAutoY = ( uZuAuto * vec4( transformed, 1.0 ) ).y;');
        sh.fragmentShader = 'varying float vAutoY; uniform vec2 uBand;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', `{ float lu = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) ), ba = smoothstep( uBand.x - 0.01, uBand.x + 0.01, vAutoY ) * ( 1.0 - smoothstep( uBand.y - 0.01, uBand.y + 0.01, vAutoY ) ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.03, 0.09, 0.3 ) * ( lu * 1.4 ), ba * smoothstep( 0.25, 0.4, lu ) ); }\n#include <alphamap_fragment>`);
      };
      m.customProgramCacheKey = () => altK + 'polizei';
      kopie.set(alt, m);
    }
    o.material = kopie.get(o.material);
  });
}
// Blaulicht: Balken auf dem Dach mit zwei leuchtenden Teilen und zwei Lichtflecken, die sich abwechseln
function blaulicht(def) {
  const g = new THREE.Group(); g.name = 'blaulicht';
  const koerper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.28), new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.5 })); g.add(koerper);
  const licht = s => { const m = new THREE.MeshBasicMaterial({ color: 0x1846ff }), b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.25), m); b.position.set(0.3 * s, 0.05, 0); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lichtFleck(), color: 0x2a5cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(2.4); sp.position.set(0.3 * s, 0.1, 0); g.add(b, sp); return { m, sp }; };
  g.userData.l = [licht(1), licht(-1)];
  g.position.set(0, def.hoehe + 0.03, -def.laenge * 0.03);
  return g;
}

export class Polizei {
  constructor({ ton, mobil = false } = {}) {
    this.ton = ton; this.mobil = mobil; this.stufe = 0; this.punkte = 0; this.autos = []; this.t = 0; this.tSpawn = 0; this.unsichtbar = 0; this.gesehen = false; this.fest = 0; this.netz = null; this.gitter = null; this.quelle = null; this.laed = false; this.def = FAHRZEUGE.find(d => d.id === 'limousine');
    this.kam = new THREE.Vector3(); this.route = null; this.tZiel = 0; this.gemeldet = 0; this.achse = new THREE.Vector2();
  }
  // Vergehen: 1 Punkt ist ein Stern
  melde(p) { if (p <= 0) return; this.punkte = Math.min(3.2, this.punkte + p); const st = Math.min(3, Math.floor(this.punkte + 1e-6)); if (st > this.stufe) { this.stufe = st; this.unsichtbar = 0; this.neuerStern = true; } }
  // Vorladen, damit der erste Streifenwagen nicht ruckelt
  async laden() { if (this.quelle || this.laed) return; this.laed = true; try { this.quelle = await ladeFahrzeug(this.def); } catch { /* ohne Modell keine Polizei */ } this.laed = false; }
  leeren(A) { for (const c of this.autos) { c.f.entfernen(); this.licht && (this.licht.intensity = 0); } this.autos.length = 0; this.stufe = 0; this.punkte = 0; this.unsichtbar = 0; this.fest = 0; this.route = null; A?.verkehr && (A.verkehr.weitere = null); }
  // Straßen im Raster, einmal je Netz
  raster(netz) {
    if (this.netz === netz) return; this.netz = netz; this.route = null; const G = this.gitter = new Map();
    for (const r of netz.R) for (const sp of r.spuren.slice(0, 1)) for (let i = 1; i < sp.pts.length; i++) { const a = sp.pts[i - 1], b = sp.pts[i], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (ZELLE / 2)); for (let k = 0; k <= n; k++) { const key = Math.floor((a[0] + (b[0] - a[0]) * k / n) / ZELLE) * 100003 + Math.floor((a[1] + (b[1] - a[1]) * k / n) / ZELLE); const l = G.get(key) || G.set(key, []).get(key); if (!l.includes(r)) l.push(r); } }
  }
  spawn(A, ziel, cam) {
    const S = A.verkehr.netz.spuren; if (!S.length || !this.quelle) return null;
    const blick = cam.getWorldDirection(this.kam), R = this.autos.length;
    for (let t = 0; t < 40; t++) {
      const sp = S[Math.floor(Math.random() * S.length)]; if (sp.len < 14) continue;
      const m = sp.pts[Math.floor(sp.pts.length / 2)], n = sp.pts[Math.min(sp.pts.length - 1, Math.floor(sp.pts.length / 2) + 1)], dx = m[0] - ziel.x, dz = m[1] - ziel.z, d = Math.hypot(dx, dz);
      if (d < 110 || d > 300 + t * 6) continue;
      if ((dx * blick.x + dz * blick.z) / d > 0.3 && d < 240) continue;   // nicht im Bild auftauchen
      if (!A.kollision.frei(m[0], m[1]) || this.autos.some(c => Math.hypot(c.f.pos.x - m[0], c.f.pos.z - m[1]) < 25)) continue;
      const ry = Math.atan2(n[0] - m[0], n[1] - m[1]) || 0, f = new Fahrer({ quelle: this.quelle, kollision: A.kollision, start: { x: m[0], z: m[1], ry }, verkehr: A.verkehr, menge: A.menge });
      lackSetzen(f.obj, [0.86, 0.87, 0.9]); streifenLack(f.obj, this.def.hoehe); const bar = blaulicht(this.def); f.obj.add(bar); A.gruppe.add(f.obj); f.vLong = 12; f.K = { ...f.K, antrieb: f.K.antrieb * 1.2 }; f.weich = true; f.keinSturz = true;
      return this.autos.push({ f, bar, pfad: null, i: 0, tPfad: 0, steckt: 0, rueck: 0, t: Math.random() * 3, id: R, G: { pos: f.pos, dir: f.dir, v: 0, L: f.L, B: f.B, eigen: false } }), true;
    }
    return false;
  }
  // Abstand eines Punktes zur ersten Spur einer Fahrtrichtung
  abstandR(r, x, z) { const sp = r.spuren[0]; if (!sp) return 1e9; let bd = 1e9; for (let i = 1; i < sp.pts.length; i++) { const p = sp.pts[i - 1], q = sp.pts[i], ex = q[0] - p[0], ez = q[1] - p[1], l2 = ex * ex + ez * ez || 1e-9, t = clamp(((x - p[0]) * ex + (z - p[1]) * ez) / l2, 0, 1), d = Math.hypot(p[0] + ex * t - x, p[1] + ez * t - z); if (d < bd) bd = d; } return bd; }
  nahe(x, z) { const L = new Set(); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const r of this.gitter.get((Math.floor(x / ZELLE) + a) * 100003 + Math.floor(z / ZELLE) + b) || []) L.add(r); return [...L]; }
  naechsteR(x, z) { let best = null, bd = 1e9; for (const r of this.nahe(x, z)) { const d = this.abstandR(r, x, z); if (d < bd) { bd = d; best = r; } } return best; }
  // Route über die Kreuzungen, Richtung egal: mit Blaulicht darf man auch gegen die Einbahnstraße (vorher führten die Routen in Paris weit im Bogen vom Spieler weg)
  routeZu(netz, ziel) {
    const K = netz.K, n = K.length, D = new Float64Array(n).fill(1e12), N = new Int32Array(n).fill(-1), heap = [[0, ziel]]; D[ziel] = 0;
    const hoch = i => { while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const runter = i => { for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } };
    while (heap.length) { const [d, u] = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; runter(0); } if (d > D[u]) continue; const geh = (v, len) => { const nd = d + len + 4; if (nd < D[v]) { D[v] = nd; N[v] = u; heap.push([nd, v]); hoch(heap.length - 1); } }; for (const r of K[u].ab) geh(r.nach, r.len); for (const r of K[u].an) geh(r.von, r.len); }
    this.route = { D, N, ziel };
  }
  // Punkte von Kreuzung u nach v: eigene Spur in dieser Richtung, sonst die Gegenrichtung rückwärts
  kantePunkte(netz, u, v, aus) { const K = netz.K, r = K[u].ab.find(x => x.nach === v); if (r) { const sp = r.spuren[r.spuren.length - 1] || r.spuren[0]; if (sp) { for (const p of sp.pts) aus.push(p); return true; } } const g = K[u].an.find(x => x.von === v); if (g) { const sp = g.spuren[0]; if (sp) { for (let i = sp.pts.length - 1; i >= 0; i--) aus.push(sp.pts[i]); return true; } } return false; }
  // Fahrweg: von der nächsten Straße über die günstigste Kreuzung bis zur Zielkreuzung
  pfad(c, A) {
    const N0 = A.verkehr.netz, K = N0.K, f = c.f; c.pfad = []; c.i = 0; const R = this.route; if (!R) return; c.ziel = R.ziel;
    const r = this.naechsteR(f.pos.x, f.pos.z); if (!r) return;
    const kosten = u => { const dx = K[u].x - f.pos.x, dz = K[u].z - f.pos.z, d = Math.hypot(dx, dz); return R.D[u] + d + ((dx * f.dir.x + dz * f.dir.z) < 0 ? 45 : 0); };
    let u = kosten(r.von) < kosten(r.nach) ? r.von : r.nach;
    this.kantePunkte(N0, u === r.nach ? r.von : r.nach, u, c.pfad);
    for (let n = 0; n < 14 && u !== R.ziel && R.N[u] >= 0; n++) { const v = R.N[u]; this.kantePunkte(N0, u, v, c.pfad); u = v; }
  }
  // Lenken und Gas eines Wagens: reiner Verfolgungsalgorithmus über den Pfad, dicht dran direkt aufs Ziel
  steuern(c, dt, A, ziel, zv, nah, frei) {
    const f = c.f, v = f.vLong, av = Math.abs(v); let tx, tz, vSoll = 25 + this.stufe * 5;
    const dZiel = Math.hypot(ziel.x - f.pos.x, ziel.z - f.pos.z);
    if (nah && frei) { const vor = Math.min(0.9, dZiel / 22); tx = ziel.x + (ziel.vx || 0) * vor; tz = ziel.z + (ziel.vz || 0) * vor; vSoll = Math.max(zv + 6, Math.min(vSoll, dZiel * 1.3)); if (dZiel < 6.5 && zv < 2) vSoll = 0; }
    else if (c.pfad?.length > 1) {
      const P = c.pfad; while (c.i < P.length - 1 && Math.hypot(P[c.i + 1][0] - f.pos.x, P[c.i + 1][1] - f.pos.z) <= Math.hypot(P[c.i][0] - f.pos.x, P[c.i][1] - f.pos.z) + 0.5) c.i++;
      let L = 7 + av * 0.75, i = c.i; while (i < P.length - 1 && L > 0) { L -= Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); i++; } tx = P[i][0]; tz = P[i][1];
      // vor Kurven bremsen: Richtung 30 m voraus
      let L2 = 12 + av * 1.1, j = i; while (j < P.length - 1 && L2 > 0) { L2 -= Math.hypot(P[j + 1][0] - P[j][0], P[j + 1][1] - P[j][1]); j++; } const kurve = Math.abs(wrap(Math.atan2(P[j][0] - f.pos.x, P[j][1] - f.pos.z) - f.psi)); vSoll = Math.min(vSoll, THREE.MathUtils.lerp(vSoll, 8, clamp(kurve / 0.9, 0, 1)));
    } else { tx = ziel.x; tz = ziel.z; }
    // Auto voraus: daran vorbei, auf der freien Seite (Blaulicht: auch über die Gegenspur). Vorher klebte der Streifenwagen hinter jedem Auto und kam in dichten Städten nie an
    { const fx = f.dir.x, fz = f.dir.z, rx0 = -fz, rz0 = fx, weit = Math.max(12, av * 1.15); let bl = 1e9, bq = 0; for (const o of A.verkehr.alle) { const rx = o.pos.x - f.pos.x, rz = o.pos.z - f.pos.z, l = rx * fx + rz * fz; if (l < 0 || l > weit) continue; const q = rx * rx0 + rz * rz0; if (Math.abs(q) < 2.3 && l < bl) { bl = l; bq = q; } }
      if (bl < 1e9) { const seite = bq > -0.3 ? -1 : 1, um = seite * (2.9 - Math.abs(bq)), ax = f.pos.x + fx * Math.min(bl, 10) + rx0 * um, az = f.pos.z + fz * Math.min(bl, 10) + rz0 * um; if (A.kollision.frei(ax, az)) { tx = ax + fx * 4; tz = az + fz * 4; } else { const um2 = -seite * (2.9 - Math.abs(bq)), bx = f.pos.x + fx * Math.min(bl, 10) + rx0 * um2, bz = f.pos.z + fz * Math.min(bl, 10) + rz0 * um2; if (A.kollision.frei(bx, bz)) { tx = bx + fx * 4; tz = bz + fz * 4; } else vSoll = Math.min(vSoll, 6); } } }
    const err = wrap(Math.atan2(tx - f.pos.x, tz - f.pos.z) - f.psi);
    this.achse.x = clamp(-err * 2.4, -1, 1); vSoll = Math.min(vSoll, THREE.MathUtils.lerp(vSoll, 7, clamp(Math.abs(err) / 1.1, 0, 1)));
    this.achse.y = clamp((vSoll - v) / 5, -1, 1);
    // festgefahren: kurz zurück, gegengelenkt
    if (c.rueck > 0) { c.rueck -= dt; this.achse.y = -1; this.achse.x = clamp(err * 2.4, -1, 1); }
    else if (av < 1.5 && vSoll > 3) { c.steckt += dt; if (c.steckt > 1.4) { c.steckt = 0; c.rueck = 1.1; } } else c.steckt = 0;
    const st = f.update(dt, this.achse, false); f.treffer.length = 0; return st;
  }
  // je Bild. A: aktive Ansicht, W: Auto des Spielers oder null, F: Figur oder null, cam: Kamera. Liefert 'gefasst', wenn der Spieler gestellt wurde
  update(dt, A, W, F, cam) {
    const s = W || F; this.t += dt;
    if (this.punkte > 0 && this.stufe === 0) this.punkte = Math.max(0, this.punkte - dt * 0.03);   // kleine Vergehen verjähren
    if (!s || !A?.verkehr?.netz || !A.kollision) return null;
    this.raster(A.verkehr.netz);
    if (this.stufe > 0 && !this.quelle) this.laden();
    const ziel = { x: s.pos.x, z: s.pos.z, vx: W ? W.dir.x * W.vLong : 0, vz: W ? W.dir.z * W.vLong : 0 }, zv = W ? Math.abs(W.vLong) : (F.v || 0);
    // Anzahl der Wagen je Stern, neue kommen außerhalb des Bildes
    const soll = this.stufe === 0 ? 0 : this.mobil ? Math.min(2, this.stufe) : this.stufe + (this.stufe > 2 ? 1 : 0);
    if (this.autos.length < soll && (this.tSpawn -= dt) < 0) { this.tSpawn = 2.2; this.spawn(A, ziel, cam); }
    // Route: gemeinsame Zielstraße, höchstens einmal je Sekunde neu
    if ((this.tZiel -= dt) < 0 && this.autos.length) { this.tZiel = 1; const px = ziel.x + ziel.vx * 2, pz = ziel.z + ziel.vz * 2, r = this.naechsteR(px, pz) || this.naechsteR(ziel.x, ziel.z); if (r) { const K = A.verkehr.netz.K, zk = Math.hypot(K[r.von].x - px, K[r.von].z - pz) < Math.hypot(K[r.nach].x - px, K[r.nach].z - pz) ? r.von : r.nach; if (this.route?.ziel !== zk || this.route.netz !== A.verkehr.netz) { this.routeZu(A.verkehr.netz, zk); this.route.netz = A.verkehr.netz; } } }
    let nachster = 1e9, siehtJemand = false, naeheGefasst = false;
    for (let i = this.autos.length - 1; i >= 0; i--) {
      const c = this.autos[i], f = c.f; c.t += dt;
      const d = Math.hypot(ziel.x - f.pos.x, ziel.z - f.pos.z), frei = d < 80 && A.kollision.sicht(f.pos.x, f.pos.z, ziel.x, ziel.z) >= 1;
      if ((c.tPfad -= dt) < 0) { c.tPfad = 0.5; const P = c.pfad, weg = P?.length ? Math.hypot(P[c.i][0] - f.pos.x, P[c.i][1] - f.pos.z) : 1e9; if (!P?.length || c.ziel !== this.route?.ziel || c.i > P.length - 5 || weg > 18) this.pfad(c, A); }
      const st = this.steuern(c, dt, A, ziel, zv, d < 70, frei); if (st > 0.25) this.gemeldet = 1;
      if (d < nachster) nachster = d; if (d < 130 && (frei || d < 45)) siehtJemand = true;
      // ineinander: auseinanderschieben, Stoß für den Spieler
      if (W && d < 9 && ueberlappt(f, W)) {
        const dx = W.pos.x - f.pos.x, dz = W.pos.z - f.pos.z, l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l, dv = Math.abs(f.vLong - W.vLong);
        if (A.kollision.frei(f.pos.x - nx * 0.3, f.pos.z - nz * 0.3)) { f.pos.x -= nx * 0.3; f.pos.z -= nz * 0.3; }
        f.vLong *= 0.6; if (dv > 2 && (c.tStoss = (c.tStoss ?? 0) - dt) < 0) { c.tStoss = 0.6; const rl = -dx * W.dir.x - dz * W.dir.z, rq = (-dx * W.dir.z + dz * W.dir.x), stW = Math.min(0.5, dv / 16); W.stoesse.push(stW); W.treffer.push({ l: rl, q: rq, st: stW }); W.vLong *= 0.82; }
      }
      c.G.v = f.vLong; A.menge?.gefahrPruefen?.(dt, c.G);
      // Blaulicht
      const taktA = Math.floor(c.t * 7) % 4 < 2, [la, lb] = c.bar.userData.l; la.m.color.setHex(taktA ? 0x2a5cff : 0x0a1230); lb.m.color.setHex(taktA ? 0x0a1230 : 0x2a5cff); la.sp.visible = taktA; lb.sp.visible = !taktA;
      // weit weg und nicht zu sehen: näher heran (die Jagd reißt nicht ab), keine Sterne mehr: wegfahren lassen und verschwinden
      if (this.stufe === 0) { if (d > 90 || c.t > 25) { f.entfernen(); this.autos.splice(i, 1); } }
      else if (d > 370) { f.entfernen(); this.autos.splice(i, 1); }
      else { c.still = Math.abs(f.vLong) < 2.5 ? (c.still || 0) + dt : 0; if (c.still > 7 && d > 60) { f.entfernen(); this.autos.splice(i, 1); } }   // hängt hinter einem Stau fest: woanders neu
    }
    A.verkehr.weitere = this.autos.length ? this.autos.map(c => c.f) : null;
    // Rettungsgasse: wer einen Streifenwagen hinter sich hat, fährt an den Rand und wird langsamer
    for (const o of A.verkehr.alle) { let z = 0; for (const c of this.autos) { const rx = o.pos.x - c.f.pos.x, rz = o.pos.z - c.f.pos.z, l = rx * c.f.dir.x + rz * c.f.dir.z; if (l > 0 && l < 38 && Math.abs(rx * c.f.dir.z - rz * c.f.dir.x) < 5 && o.dir.x * c.f.dir.x + o.dir.z * c.f.dir.z > 0.3) z = 1.05; } if (z || o.gasse) { o.gasse = (o.gasse || 0) + (z - (o.gasse || 0)) * (1 - Math.exp(-2.4 * dt)); if (o.gasse < 0.01 && !z) o.gasse = 0; if (z && o.v > 8) o.v -= 5 * dt; } }
    // Sirene nach Abstand
    if (this.ton) this.ton.sirene(this.autos.length ? clamp(1 - nachster / 300, 0, 1) ** 1.6 : 0, dt);
    // Sterne: wer lange nicht gesehen wird, verliert einen
    this.gesehen = siehtJemand;
    if (this.stufe > 0) {
      if (siehtJemand) this.unsichtbar = 0; else { this.unsichtbar += dt; if (this.unsichtbar > 30 + this.stufe * 8) { this.unsichtbar = 0; this.stufe--; this.punkte = this.stufe; } }
      // gestellt: Spieler steht, ein Wagen dicht dran
      if (nachster < 9.5 && zv < 2.2) this.fest += dt; else this.fest = Math.max(0, this.fest - dt * 2);
      if (this.fest > 3) { this.fest = 0; naeheGefasst = true; }
    } else this.fest = 0;
    return naeheGefasst ? 'gefasst' : null;
  }
  // Ortswechsel: Lage in den neuen Rahmen (vorher/nachher über die Welt, wie beim Spieler)
  merken(zw) { for (const c of this.autos) { const f = c.f; c.mit = { p: zw(f.pos), a: zw(f.alt.pos), vorn: zw(f.pos.clone().addScaledVector(f.dir, 10)) }; } }
  umsetzen(W, A) {
    for (const c of this.autos) {
      const f = c.f, m = c.mit; if (!m) continue; W.weltZuLokal(m.p, f.pos); W.weltZuLokal(m.a, f.alt.pos); const vorn = W.weltZuLokal(m.vorn, new THREE.Vector3()).sub(f.pos); let dp = Math.atan2(vorn.x, vorn.z) - Math.atan2(f.dir.x, f.dir.z); dp = wrap(dp);
      f.psi += dp; f.alt.psi += dp; f.dir.set(Math.sin(f.psi), 0, Math.cos(f.psi)); f.kollision = A.kollision; f.verkehr = A.verkehr; f.menge = A.menge; c.pfad = null; c.ziel = null; c.tPfad = 0; c.mit = null; if (f.obj.parent !== A.gruppe) A.gruppe.add(f.obj); f.zeigen(1);
    }
    this.route = null; this.tZiel = 0;
  }
}
