// Navigation (Wunsch Nr. 34, 29.10.2026, Nader: "eine Navigationsreihe, in der steht, wo ich herkomme und wie viele Meter entfernt das ist").
// Ziel kommt aus der Ortssuche (171.654 Orte). Die Zeile zeigt Richtungspfeil, verbleibende Strecke, Ziel, Herkunft und die Zeit beim
// aktuellen Tempo. Im Auto und zu Fuß folgt sie einer Route über die Straßen (kostenlose OSRM Server: Project OSRM für Autos, FOSSGIS für
// Fußwege, Daten © OpenStreetMap contributors): höchstens alle 6 s eine Anfrage, neu berechnet, wenn man 70 m (zu Fuß 35 m) von der Route
// abkommt. Ohne Antwort und im Jet gilt die Luftlinie (Großkreis).
const D2R = Math.PI / 180, R_ERDE = 6371008.8;
export function abstand(a, b) {   // Haversine in Metern
  const dl = (b.lat - a.lat) * D2R, dn = (b.lon - a.lon) * D2R, s = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dn / 2) ** 2;
  return 2 * R_ERDE * Math.asin(Math.min(1, Math.sqrt(s)));
}
export function peilung(a, b) {   // Kurs von a nach b in Grad (0 Norden, im Uhrzeigersinn)
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dn = (b.lon - a.lon) * D2R;
  return (Math.atan2(Math.sin(dn) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dn)) / D2R + 360) % 360;
}
const fmtStrecke = m => m < 1000 ? `${Math.max(0, Math.round(m / 10) * 10)} m` : m < 10000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 1000).toLocaleString('de-DE')} km`;
const fmtZeit = s => s < 60 ? '< 1 min' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round(s % 3600 / 60)).padStart(2, '0')} min`;
const ROUTER = {
  fahren: (a, b) => `https://router.project-osrm.org/route/v1/driving/${a.lon.toFixed(6)},${a.lat.toFixed(6)};${b.lon.toFixed(6)},${b.lat.toFixed(6)}?overview=full&geometries=geojson`,
  fuss: (a, b) => `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${a.lon.toFixed(6)},${a.lat.toFixed(6)};${b.lon.toFixed(6)},${b.lat.toFixed(6)}?overview=full&geometries=geojson`,
};

export class Navi {
  constructor({ springen } = {}) {
    const d = this.el = document.createElement('div'); d.className = 'navi'; d.id = 'navi';
    d.innerHTML = '<div class="npfeil" id="npfeil"><i></i></div><div class="ntext"><b id="nstrecke"></b><span id="nziel"></span><small id="nvon"></small></div>' +
      '<button class="nknopf" id="nspringen" title="Direkt zum Ziel springen">Hinspringen</button><button class="nknopf nx" id="nende" title="Navigation beenden" aria-label="Navigation beenden">×</button>';
    document.getElementById('erdsuche')?.appendChild(d) || document.body.appendChild(d);
    this.$ = id => d.querySelector('#' + id);
    this.$('nende').onclick = () => this.loeschen();
    this.$('nspringen').onclick = () => { if (this.ziel && springen) springen(this.ziel); };
    this.ziel = null; this.von = null; this.route = null; this.modus = null; this.t = 0; this.anfrageT = -99; this.laeuft = false; this.weg = 0; this.angekommen = 0; this.abseitsT = 0;
  }
  setzen(ziel, von, modus) {
    this.ziel = { name: ziel.name, lat: ziel.lat, lon: ziel.lon }; this.von = von; this.route = null; this.voraus = null; this.idx = 1; this.modus = modus; this.anfrageT = -99; this.angekommen = 0; this.abseitsT = 0;
    this.el.classList.add('an'); this.el.classList.remove('fertig'); this.t = 99;
  }
  loeschen() { this.ziel = null; this.route = null; this.el.classList.remove('an', 'fertig'); }
  // Route holen (im Hintergrund), Ergebnis als [[lat, lon], ...]
  async holen(p, jetzt) {
    if (this.laeuft || !ROUTER[this.modus]) return;
    this.laeuft = true; this.anfrageT = jetzt; const ziel = this.ziel;
    try {
      const r = await fetch(ROUTER[this.modus](p, ziel), { signal: AbortSignal.timeout(9000) });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), geo = j.routes?.[0]?.geometry?.coordinates;
      if (this.ziel === ziel && geo?.length > 1) {
        const R = geo.map(([lo, la]) => [la, lo]), kum = new Float64Array(R.length);
        for (let i = 1; i < R.length; i++) kum[i] = kum[i - 1] + abstand({ lat: R[i - 1][0], lon: R[i - 1][1] }, { lat: R[i][0], lon: R[i][1] });
        this.route = R; this.kum = kum; this.idx = 1; this.dauer = j.routes[0].duration || 0;
      }
    } catch (e) { /* Luftlinie bleibt */ }
    finally { this.laeuft = false; }
  }
  // Strecke entlang der Route ab dem nächsten Punkt, dazu ein Punkt rund 40 m voraus (für den Pfeil) und der Abstand zur Route.
  // Gesucht wird nahe der letzten Stelle (lange Routen haben tausende Punkte), alle 2 s über die ganze Route
  entlang(p, ganz) {
    const R = this.route, K = this.kum, kx = Math.cos(p.lat * D2R) * 111320, ky = 110540;
    const i0 = ganz ? 1 : Math.max(1, this.idx - 40), i1 = ganz ? R.length : Math.min(R.length, this.idx + 400);
    let bi = this.idx, bt = 0, bd = Infinity;
    for (let i = i0; i < i1; i++) {
      const ax = (R[i - 1][1] - p.lon) * kx, ay = (R[i - 1][0] - p.lat) * ky, bx = (R[i][1] - p.lon) * kx, by = (R[i][0] - p.lat) * ky, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)), d = Math.hypot(ax + dx * t, ay + dy * t);
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    this.idx = bi;
    const hier = K[bi - 1] + (K[bi] - K[bi - 1]) * bt, rest = K[R.length - 1] - hier;
    let j = bi; const w = hier + 40; while (j < R.length - 1 && K[j] < w) j++;
    const f = Math.max(0, Math.min(1, (w - K[j - 1]) / ((K[j] - K[j - 1]) || 1))), voraus = { lat: R[j - 1][0] + (R[j][0] - R[j - 1][0]) * f, lon: R[j - 1][1] + (R[j][1] - R[j - 1][1]) * f };
    return { rest: rest + bd, voraus, abseits: bd };
  }
  // je Bild: p { lat, lon }, kurs (Grad), modus (fahren, fuss, jet), kmh
  update(p, kurs, modus, kmh, dt) {
    if (!this.ziel) return;
    const jetzt = performance.now() / 1000;
    if (modus !== this.modus) { this.modus = modus; this.route = null; this.anfrageT = -99; }
    if (this.angekommen) { if (jetzt - this.angekommen > 5) this.loeschen(); return; }
    // Pfeil jedes Bild (Richtung zum Punkt voraus relativ zur Blickrichtung), Rechnung und Text rund zehnmal je Sekunde
    if (this.voraus) { const rel = ((peilung(p, this.voraus) - kurs + 540) % 360) - 180; this.$('npfeil').style.transform = `rotate(${rel.toFixed(1)}deg)`; }
    this.t += dt; if (this.t < 0.1) return; this.t = 0;
    const luft = abstand(p, this.ziel);
    let rest = luft, voraus = this.ziel;
    if (modus !== 'jet' && luft > 60) {
      if (!this.route && jetzt - this.anfrageT > 6) this.holen(p, jetzt);
      if (this.route) {
        this.ganzT = (this.ganzT || 0) + 0.1; const e = this.entlang(p, this.ganzT > 2); if (this.ganzT > 2) this.ganzT = 0;
        rest = e.rest; voraus = e.voraus;
        this.abseitsT = e.abseits > (modus === 'fuss' ? 35 : 70) ? this.abseitsT + 0.1 : 0;
        if (this.abseitsT > 2 && jetzt - this.anfrageT > 6) { this.abseitsT = 0; this.holen(p, jetzt); }   // vom Weg ab: neue Route
      }
    }
    this.weg = rest; this.voraus = voraus;
    const da = modus === 'jet' ? 900 : modus === 'fuss' ? 25 : 45;   // angekommen: kurz melden, dann aus
    if (luft < da) {
      this.angekommen = jetzt; this.el.classList.add('fertig'); this.$('npfeil').style.transform = '';
      this.$('nstrecke').textContent = 'Angekommen'; this.$('nziel').textContent = this.ziel.name; this.$('nvon').textContent = this.von ? `von ${this.von.name}` : ''; return;
    }
    // Zeit: im Auto aus der Fahrzeit der Route (Anteil der Reststrecke), sonst Reststrecke durch Tempo, mindestens ein übliches Tempo je Art
    const voll = this.route ? this.kum[this.kum.length - 1] : 0;
    const sek = this.route && this.dauer && modus === 'fahren' ? this.dauer * rest / Math.max(1, voll) : rest / (Math.max(kmh, modus === 'jet' ? 400 : modus === 'fuss' ? 4.5 : 50) / 3.6);
    const zeit = ` · ${fmtZeit(sek)}`;
    this.$('nstrecke').textContent = fmtStrecke(rest) + zeit;
    this.$('nziel').textContent = `nach ${this.ziel.name}`;
    this.$('nvon').textContent = (this.von ? `von ${this.von.name} · ` : '') + (this.route && modus !== 'jet' ? 'über die Straßen' : 'Luftlinie');
  }
}
