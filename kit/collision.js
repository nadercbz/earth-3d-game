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
    if (Math.abs(x) > this.grenze || Math.abs(z) > this.grenze) return !!this.offen;
    if (this.innen) {
      if (this.innen.tuerZone(x, z)) return true;
      if (this.innen.drin(x, z)) return this.innen.frei(x, z, this.zustand);
    }
    return this.freiAussen(x, z);
  }
  freiAussen(x, z) {
    const l = this.zellen.get(Math.floor(x / ZELLE) + ':' + Math.floor(z / ZELLE)); if (!l) return true;
    for (const e of l) {
      if (e.rect !== undefined) { const r = this.rechtecke[e.rect]; if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return false; }
      else if (inside(this.polys[e.poly], x, z)) return false;
    }
    return true;
  }
  // Bodenhöhe: Gehweg oder Fahrbahn, im Haus Geschoss und Treppe
  hoehe(x, z) {
    if (this.innen && this.innen.drin(x, z)) return this.innen.y0 + this.innen.hoehe(x, z, this.zustand);
    if (this.innen && this.zustand.etage) this.zustand.etage = 0;   // draußen: wieder im Erdgeschoss
    if (this.offen && (Math.abs(x) > this.grenze || Math.abs(z) > this.grenze)) return this.offen(x, z);   // hinter dem Ort: Boden der Kugel
    const g = this.gelaende(x, z), l = this.gehwegZellen.get(Math.floor(x / ZELLE) + ':' + Math.floor(z / ZELLE)); if (!l) return g;
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
    for (let i = 1; i <= n; i++) { const t = i / n; if (!this.frei(ax + (bx - ax) * t, az + (bz - az) * t)) return Math.max(0, (i - 1) / n); }
    return 1;
  }
}
