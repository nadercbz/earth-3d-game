// Kollision für Spieler (zu Fuß und Fahren): Gebäude Grundrisse und Hausboxen in einem Raster mit 25 m Zellen, dazu Bodenhöhe
// (Gehweg oder Fahrbahn) und die Grenze des Ausschnitts. Punktabfragen sind billig genug für 120 Schritte je Sekunde.
// Seit 28.10.2026 nachts: Innenräume (kit/interior.js). Steht ein Haus "innen" an, gelten in seinem Grundriss die Innenwände, die Türzone
// vor der Haustür ist frei, die Bodenhöhe kommt aus Geschoss und Treppe (zustand: etage, kSeg).
import { inside } from './geo.js';

const ZELLE = 25;

export class Kollision {
  // polys: [[x, z], ...][] (Grundrisse), rechtecke: [x0, z0, x1, z1][] (Hausboxen), gehwege: Polygone mit Gehweghöhe, grenze: halbe Kantenlänge
  constructor({ polys = [], rechtecke = [], gehwege = [], gehwegHoehe = 0.12, grenze = 500, gelaende = null }) {
    this.gelaende = gelaende || (() => 0);   // Höhe des Geländes (Orte aus Kacheln, kit/ortbau.js)
    this.zellen = new Map(); this.polys = polys; this.rechtecke = rechtecke; this.grenze = grenze; this.gehwegHoehe = gehwegHoehe;
    polys.forEach((p, i) => this.eintragen(p, { poly: i }));
    rechtecke.forEach((r, i) => this.eintragen([[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], { rect: i }));
    this.gehwegZellen = new Map(); this.gehwege = gehwege;
    gehwege.forEach((p, i) => { const b = this.box(p[0]); for (let cx = Math.floor(b[0] / ZELLE); cx <= Math.floor(b[2] / ZELLE); cx++) for (let cz = Math.floor(b[1] / ZELLE); cz <= Math.floor(b[3] / ZELLE); cz++) { const k = cx + ':' + cz; (this.gehwegZellen.get(k) || this.gehwegZellen.set(k, []).get(k)).push(i); } });
    this.durch = null; this.durchBis = 0;
    this.innen = null; this.zustand = { etage: 0, kSeg: null };   // aktives Hausinneres (kit/interior.js) und Treppenzustand des Spielers
  }
  box(pts) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; }
  eintragen(pts, eintrag) {
    const b = this.box(pts);
    for (let cx = Math.floor(b[0] / ZELLE); cx <= Math.floor(b[2] / ZELLE); cx++) for (let cz = Math.floor(b[1] / ZELLE); cz <= Math.floor(b[3] / ZELLE); cz++) { const k = cx + ':' + cz; (this.zellen.get(k) || this.zellen.set(k, []).get(k)).push(eintrag); }
  }
  // steht der Punkt frei (kein Gebäude, innerhalb der Grenze)? Mit offen (Erde, seit 29.10.2026) ist hinter der Grenze freies Gelände:
  // das Auto fährt aus dem Ort hinaus auf die Kugel, bis der nächste Ort steht
  frei(x, z) {
    if (this.deck && this.yAkt !== undefined && this.yAkt > this.deck.y - 3) return Math.hypot(x - this.deck.x, z - this.deck.z) < this.deck.r;   // Aussichtsdeck: das Geländer hält
    if (this.tunnel) { const u = this.tunnel.unten(x, z, this.yAkt); if (u !== null) return u; }   // Straßentunnel (kit/tunnel.js, Nr. 98): unten zählt nur der Korridor, am Trog hält oben ein Geländer
    if (this.bruecke && this.bruecke.blockiert(x, z, this.yAkt)) return false;
    if (this.wasserFest && this.wasserFest(x, z) && !(this.bruecke && this.bruecke.deck(x, z) !== null)) return false;   // Fluss, Kanal, See mit festem Pegel (kit/ort.js pegelBauen, Nr. 106): an der Uferkante ist Schluss, nur über die Brücke (Tunnel darunter: oben schon entschieden)
    if (this.ubahn) { const u = this.ubahn.frei(x, z, this.yAkt); if (u !== null) return u; }
    { const AG = this.aufgangVon?.(); if (AG) { const u = AG.frei(x, z, this.yAkt, this.gelaende); if (u !== null) return u; } }   // Treppen zu hochgelegenen Bahnsteigen (kit/aufgang.js, Nr. 106)   // U-Bahn Treppen (kit/ubahn_eingang.js, Nr. 94)   // Brücken über Verkehr (kit/bruecke.js, Nr. 95): Damm der Rampen, Pfeiler, oben das Geländer
    if (this.zusatz && this.yAkt !== undefined) { const zu = this.zusatz(x, z); if (zu !== null && Math.abs(this.yAkt - zu) < 0.9) return true; }   // auf einem Bahnsteig: frei, auch wenn eine Bahnhofshalle als Haus darum steht (U Schlesisches Tor, Nr. 106)
    if (this.stadionFrei?.(x, z)) return true;   // im Innenraum eines Stadions
    if (Math.abs(x) > this.grenze || Math.abs(z) > this.grenze) return !!this.offen;
    // Auf einem Dach (Wunsch Nr. 57): yAkt ist die Höhe der Figur. Ein Haus, dessen Dach unter ihren Füßen liegt, ist keine Wand
    if (this.yAkt !== undefined && this.dachBei) { const d = this.dachBei(x, z); if (d !== null && this.yAkt > d - 0.6) return true; }   // 0,6 m seit Nr. 106 (vorher 1,4 m: niedrige Bauten auf einer Spur hoben das Auto 1,4 m an)
    if (this.innen) {
      if (this.innen.tuerZone(x, z)) return this.innen.tuerFrei(x, z);   // Haustür zu: das Blatt sperrt (Nr. 96)
      if (this.innen.drin(x, z)) return this.innen.frei(x, z, this.zustand);
    }
    return this.freiAussen(x, z);
  }
  freiAussen(x, z) {
    const l = this.zellen.get(Math.floor(x / ZELLE) + ':' + Math.floor(z / ZELLE)); if (!l) return true;
    for (const e of l) {
      if (e.rect !== undefined) { const r = this.rechtecke[e.rect]; if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return false; }
      else if (inside(this.polys[e.poly], x, z)) { if (e.poly < this.durchBis && this.imDurch(x, z)) continue; return false; }
    }
    return true;
  }
  // Haus an dieser Stelle: Nummer des Vielecks (nur die ersten bis, also Häuser) oder -1. Für die Torbögen der Durchfahrten (dashboard/app.js)
  hausBei(x, z, bis) {
    const l = this.zellen.get(Math.floor(x / ZELLE) + ':' + Math.floor(z / ZELLE)); if (!l) return -1;
    for (const e of l) if (e.poly !== undefined && e.poly < bis && inside(this.polys[e.poly], x, z)) return e.poly;
    return -1;
  }
  // Durchfahrten (Nr. 106): Fahrspuren, die laut Karte durch ein Haus führen (Tordurchfahrt, Haus über der Straße, Einfahrt ins Parkhaus). Bis
  // dahin stand dort die Hauswand als unsichtbare Sperre mitten auf der Spur (36 Stellen an 16 Berliner Orten). punkte: Spurpunkte im Haus alle 2 m,
  // frei ist ein Streifen von 2,4 m um sie. bis: nur für die ersten bis Vielecke (Häuser), nicht für Stände, Wahrzeichen, Stadien
  durchfahrten(punkte, bis) { this.durch = new Map(); this.durchBis = bis; for (const [x, z] of punkte) { const k = Math.floor(x / 8) + ':' + Math.floor(z / 8); (this.durch.get(k) || this.durch.set(k, []).get(k)).push(x, z); } }
  imDurch(x, z) { const cx = Math.floor(x / 8), cz = Math.floor(z / 8); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = this.durch.get((cx + a) + ':' + (cz + b)); if (!L) continue; for (let i = 0; i < L.length; i += 2) { const dx = L[i] - x, dz = L[i + 1] - z; if (dx * dx + dz * dz < 5.76) return true; } }
    const Z = this.durchgangVon?.(); if (Z) for (let i = 0; i < Z.length; i += 2) { const dx = Z[i] - x, dz = Z[i + 1] - z; if (dx * dx + dz * dz < 4.0) return true; }   // Weg durch die Hallenwand zu einer Bahnhofstreppe (kit/bahn.js)
    return false; }
  // Bodenhöhe: Gehweg oder Fahrbahn, im Haus Geschoss und Treppe
  hoehe(x, z, yAlt, nurLesen = false) {   // nurLesen: Abfrage ohne Nebenwirkung auf Geschoss und Treppe (Kamera, Prüfung Nr. 103)
    if (this.deck && yAlt !== undefined && yAlt > this.deck.y - 3) return this.deck.y;
    if (this.mauerH) { const m = this.mauerH(x, z, yAlt); if (m !== null) return m; }
    { const AG = this.aufgangVon?.(); if (AG) { const h = AG.hoehe(x, z, yAlt); if (h !== null) return h; } }   // Treppe zum Bahnsteig (kit/aufgang.js, Nr. 106), vor der Dach Regel
    if (yAlt !== undefined && this.dachBei) { const d = this.dachBei(x, z); if (d !== null && yAlt > d - 0.6 && d >= (this.gelaendeZ ? this.gelaendeZ(x, z, yAlt) : this.gelaende(x, z)) - 0.3) return d; }   // steht auf dem Dach. Liegt eine Brücke über dem Dach, zählt ihr Deck (Nr. 106: auf der Oberbaumbrücke sackte das Auto 1 m auf das Dach eines Baus darunter)
    if (this.innen && this.innen.drin(x, z)) return this.innen.y0 + this.innen.hoehe(x, z, nurLesen ? { ...this.zustand } : this.zustand);
    if (this.innen && this.zustand.etage && !nurLesen) this.zustand.etage = 0;   // draußen: wieder im Erdgeschoss
    if (this.ubahn) { const h = this.ubahn.hoehe(x, z, yAlt); if (h !== null) return h; }   // U-Bahn Treppe (Nr. 94)
    if (this.offen && (Math.abs(x) > this.grenze || Math.abs(z) > this.grenze)) { const gk = this.offen(x, z); return this.tunnel && yAlt !== undefined && yAlt < gk - 2.5 ? yAlt : gk; }   // hinter dem Ort: Boden der Kugel. Unten im Tunnel bleibt die Höhe, bis der nächste Ort mit seinem Tunnel steht (Nr. 98)
    const g = this.gelaendeZ ? this.gelaendeZ(x, z, yAlt) : this.gelaende(x, z), l = this.gehwegZellen.get(Math.floor(x / ZELLE) + ':' + Math.floor(z / ZELLE));
    if (this.zusatz) { const zu = this.zusatz(x, z); if (zu !== null && zu > g && (zu - g < 1.3 || (yAlt !== undefined && yAlt > zu - 1.5))) return zu; }   // Bahnsteige: ebenerdige als Stufe, hohe (Hochbahn, Viadukt) nur für den, der schon oben ist. Vorher sprang der Boden unter jedem Hochbahnhof auf den Bahnsteig, Autos darunter hingen an einer 14 m Stufe (Nr. 106)
    if (!l) return g;
    for (const i of l) { const [aussen, ...loecher] = this.gehwege[i]; if (inside(aussen, x, z) && !loecher.some(h => inside(h, x, z))) return g + this.gehwegHoehe; }
    return g;
  }
  // Deckenhöhe über dem Punkt (für die Kamera), draußen unendlich
  decke(x, z) { return this.innen && this.innen.drin(x, z) ? this.innen.y0 + this.innen.decke(x, z, this.zustand) : Infinity; }
  // Schritt von (x, z) nach (nx, nz): ganz, sonst achsweise (an der Wand entlang gleiten), sonst gar nicht
  schritt(x, z, nx, nz) {
    if (this.frei(nx, nz)) return [nx, nz];
    if (this.frei(nx, z)) return [nx, z];
    if (this.frei(x, nz)) return [x, nz];
    return [x, z];
  }
  // Strecke von a nach b frei? (Abtastung alle 0,5 m), liefert den Anteil bis zum ersten Hindernis (1 = frei)
  sicht(ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.5));
    this.zustand.sicht = true;   // im Haus: niedrige Möbel (Bett, Sofa, Tisch) versperren der Kamera nicht die Sicht (kit/interior.js, Nr. 96)
    try { for (let i = 1; i <= n; i++) { const t = i / n; if (!this.frei(ax + (bx - ax) * t, az + (bz - az) * t)) return Math.max(0, (i - 1) / n); } return 1; }
    finally { this.zustand.sicht = false; }
  }
}
