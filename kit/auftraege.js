// Aufträge (05.11.2026, Nader: "wie ein perfektes Spiel"): Taxi, Lieferung und Rennen, überall auf der Erde, weil die Ziele aus dem Straßen und Wegenetz des Ortes kommen. Ziele liegen in Längen und Breitengrad,
// bleiben also über Ortswechsel hinweg gültig. Marker als Lichtsäule, Navigation aus kit/navi.js. Bezahlung nach Strecke und Zeit.
import * as THREE from 'three';

function saeule() {
  const g = new THREE.CylinderGeometry(3.2, 3.2, 14, 28, 1, true); g.translate(0, 7, 0);
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uF: { value: new THREE.Color(0.2, 0.75, 1.0) }, uT: { value: 0 } },
    vertexShader: 'varying float vY; void main() { vY = position.y / 14.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vY; uniform vec3 uF; uniform float uT; void main() { float a = pow(1.0 - vY, 2.2) * (0.72 + 0.28 * sin(uT * 3.0 + vY * 9.0)); gl_FragColor = vec4(uF * a * 1.6, a); }' });
  const s = new THREE.Mesh(g, m); s.frustumCulled = false; s.visible = false; s.renderOrder = 4; s.name = 'auftragsmarker';
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.2, 40).rotateX(-Math.PI / 2).translate(0, 0.05, 0), new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.85, depthWrite: false })); s.add(ring);
  return s;
}
const ARTEN = { taxi: { name: 'Taxi', tipp: 'Fahrgast abholen', weiter: 'Fahrgast ans Ziel bringen', fertig: 'Fahrgast abgeliefert' }, lieferung: { name: 'Lieferung', tipp: 'Paket abholen', weiter: 'Paket abliefern', fertig: 'Paket abgeliefert' }, rennen: { name: 'Rennen', tipp: 'Zum Start', weiter: 'Nächstes Tor', fertig: 'Rennen beendet' } };
const dist = (a, b) => { const k = 111320, c = Math.cos(a.lat * Math.PI / 180); return Math.hypot((a.lat - b.lat) * k, (a.lon - b.lon) * k * c); };

export class Auftraege {
  // ctx: { szene, welt: () => ErdWelt, ort: () => erdOrt, spielerGeo, modus, navi, ton, hud, zahlen(geld, grund), verkehr }
  constructor(ctx) { this.ctx = ctx; this.aktiv = null; this.marker = saeule(); ctx.szene.add(this.marker); this.angebotT = 25; this.angebot = null; this.t = 0; }
  // Knoten des Wegenetzes als Punkte (lat, lon)
  zufallsPunkt(min, max, von) {
    const o = this.ctx.ort(); if (!o) return null; const K = o.daten.wege?.knoten; if (!K?.length) return null;
    for (let i = 0; i < 40; i++) { const k = K[Math.floor(Math.random() * K.length)], lat = o.lat - k[1] / o.kLat, lon = o.lon + k[0] / o.kLon, d = dist(von, { lat, lon }); if (d >= min && d <= max) return { lat, lon }; }
    return null;
  }
  // Rennstrecke: Tore auf Fahrspuren, jedes 130 bis 280 m vom letzten, grob in eine Richtung
  rennTore(von) {
    const o = this.ctx.ort(), S = o?.szene?.netz?.spuren; if (!S?.length) return null;
    let x = (von.lon - o.lon) * o.kLon, z = -(von.lat - o.lat) * o.kLat, kurs = null; const tore = [];
    for (let i = 0; i < 7; i++) {
      let ok = false;
      for (let v = 0; v < 90 && !ok; v++) {
        const sp = S[Math.floor(Math.random() * S.length)]; if (sp.len < 24) continue;
        const p = sp.pts[Math.floor(sp.pts.length / 2)], d = Math.hypot(p[0] - x, p[1] - z); if (d < 130 || d > 280) continue;
        const w = Math.atan2(p[0] - x, p[1] - z); if (kurs !== null) { const dw = Math.atan2(Math.sin(w - kurs), Math.cos(w - kurs)); if (Math.abs(dw) > 1.25) continue; }
        kurs = w; x = p[0]; z = p[1]; tore.push({ lat: o.lat - z / o.kLat, lon: o.lon + x / o.kLon }); ok = true;
      }
      if (!ok) break;
    }
    return tore.length >= 4 ? tore : null;
  }
  starten(art) {
    const C = this.ctx, p = C.spielerGeo(); if (!p) return false;
    if (art === 'rennen') { const tore = this.rennTore(p); if (!tore) { C.hud.tipp('Hier gibt es keine Rennstrecke, fahr auf eine Straße'); return false; } const L = tore.reduce((s, t, i) => s + (i ? dist(tore[i - 1], t) : 0), 0); this.aktiv = { art, stufe: 1, tore, i: 0, t: 0, frist: Math.round(L / 13.5) + 8, strecke: L }; this.zuZiel(tore[0], `Tor 1 von ${tore.length}`); }
    else { const a = this.zufallsPunkt(90, 380, p); if (!a) { C.hud.tipp('Hier gibt es gerade keinen Auftrag'); return false; } this.aktiv = { art, stufe: 0, t: 0, frist: art === 'lieferung' ? 0 : 0, abhol: a }; this.zuZiel(a, ARTEN[art].tipp); }
    this.angebot = null; C.ton.klick(); C.hud.auftrag(this.anzeige()); return true;
  }
  zuZiel(z, name) { const C = this.ctx; this.ziel = z; C.navi.setzen({ name, lat: z.lat, lon: z.lon }, null, 'fahren'); this.marker.visible = true; }
  abbrechen(grund) { if (!this.aktiv) return; this.aktiv = null; this.ziel = null; this.marker.visible = false; this.ctx.navi.loeschen(); this.ctx.hud.auftrag(null); if (grund) { this.ctx.hud.tipp(grund); this.ctx.ton.fehler(); } }
  anzeige() { const a = this.aktiv; if (!a) return null; const N = ARTEN[a.art]; let zeile = a.stufe === 0 ? N.tipp : N.weiter; if (a.art === 'rennen') zeile = `Tor ${a.i + 1} von ${a.tore.length}`; const rest = a.frist ? Math.max(0, a.frist - a.t) : null; return { titel: N.name, zeile, zeit: rest === null ? null : `${Math.floor(rest / 60)}:${String(Math.floor(rest % 60)).padStart(2, '0')}`, knapp: rest !== null && rest < 15 }; }
  update(dt, kmh) {
    const C = this.ctx, W = C.welt(), p = C.spielerGeo(); this.t += dt; this.marker.material.uniforms.uT.value = this.t;
    // Angebot: alle paar Minuten eine Chance im Auto
    if (!this.aktiv && C.modus() === 'fahren' && !this.angebot && (this.angebotT -= dt) < 0) { this.angebotT = 50 + Math.random() * 60; const arten = ['taxi', 'taxi', 'lieferung', 'rennen']; this.angebot = { art: arten[Math.floor(Math.random() * arten.length)], t: 14 }; C.hud.tipp(`${ARTEN[this.angebot.art].name}: Auftrag in der Nähe. J annehmen`, 14); }
    if (this.angebot && (this.angebot.t -= dt) < 0) this.angebot = null;
    const a = this.aktiv; if (!a || !p) return;
    if (this.ziel && W) { W.geoZuLokal(this.ziel.lat, this.ziel.lon, W.bodenGeo(this.ziel.lat, this.ziel.lon), this.marker.position); const o = C.ort(); if (o && Math.abs((this.ziel.lon - o.lon) * o.kLon) < o.halb && Math.abs((this.ziel.lat - o.lat) * o.kLat) < o.halb) { this.marker.position.y = o.gruppe.position.y + o.szene.ort.H((this.ziel.lon - o.lon) * o.kLon, -(this.ziel.lat - o.lat) * o.kLat); } }
    a.t += dt;
    const d = this.ziel ? dist(p, this.ziel) : 1e9, N = ARTEN[a.art];
    if (a.frist && a.t > a.frist) { this.abbrechen(a.art === 'rennen' ? 'Zeit abgelaufen, Rennen verloren' : 'Zu spät, Auftrag verloren'); return; }
    if (a.art === 'rennen') {
      if (d < 9) { a.i++; C.ton.muenze(); if (a.i >= a.tore.length) { const lohn = Math.round(a.strecke * 0.32 + Math.max(0, a.frist - a.t) * 6); C.zahlen(lohn, `${N.fertig} in ${Math.round(a.t)} s`); this.ende(); return; } a.frist += 2; this.zuZiel(a.tore[a.i], `Tor ${a.i + 1} von ${a.tore.length}`); }
    } else if (d < 7.5 && kmh < 22) {
      if (a.stufe === 0) {
        const z = this.zufallsPunkt(320, 1300, p) || this.zufallsPunkt(150, 3000, p); if (!z) { this.abbrechen('Kein Ziel gefunden'); return; }
        const L = dist(p, z); a.stufe = 1; a.ab = { ...p }; a.t = 0; a.laenge = L; a.frist = a.art === 'lieferung' ? Math.round(L * 1.5 / 11) + 12 : 0; C.ton.tuer(); C.hud.tipp(a.art === 'taxi' ? 'Fahrgast steigt ein' : 'Paket geladen'); this.zuZiel(z, N.weiter);
      } else {
        const satz = a.art === 'lieferung' ? 0.1 : 0.075, bonus = a.t * 11 < a.laenge * 1.7 ? Math.round(a.laenge * 0.03) : 0, lohn = Math.round(14 + a.laenge * satz + bonus); C.ton.tuer(); C.zahlen(lohn, `${N.fertig}${bonus ? ', schnell gefahren' : ''}`); this.ende(); return;
      }
    }
    C.hud.auftrag(this.anzeige());
  }
  ende() { this.aktiv = null; this.ziel = null; this.marker.visible = false; this.ctx.navi.loeschen(); this.ctx.hud.auftrag(null); this.ctx.fertig?.(); this.angebotT = 18 + Math.random() * 30; }
}
