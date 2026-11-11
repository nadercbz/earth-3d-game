// Echte U-Bahn Eingänge Berlins zum Hinuntergehen (Wunsch Nr. 94, 09.11.2026, Nader: "Ich möchte alle betreten können und runtergehen ...
// Also, ich möchte die Treppen dann runtergehen, in die U-Bahn-Stationen überall. in ganz Berlin").
// Lage aus daten/berlin_ubahn.json (OSM railway=subway_entrance, 689 Eingänge zu 177 Bahnhöfen, tools/berlin_ubahn.py). Der Ortsworker (kit/ortbau.js)
// sucht für jeden Eingang an seiner echten Stelle einen freien Platz auf dem Gehweg und schneidet die offene Treppe aus dem Boden.
// Hier im Hauptfaden: Treppenhaus mit zwei Läufen zu je 10 Stufen (17 cm hoch, 30 cm tief) und Podest, unten ein Gang unter dem Gehweg mit dem Durchgang
// ins Bahnhofsinnere, Wände mit hellen Fliesen und einem Band in der Linienfarbe, Handläufe, Geländer oben, Säule mit U und Name.
// Gehen: Höhe als gleichmäßige Rampe (kein Ruckeln auf den Stufen), wer unten ist, bleibt unten (letzte Höhe). Kollision: unten nur der Schacht,
// oben das Geländer. Am Ende des Gangs öffnet sich der Bahnhof (kit/ubahn.js, eigene Szene).
import * as THREE from 'three';
import { B, W, LAUF, PODEST, STUFE, AUFTRITT, N, TIEF, OFFEN, LANG } from './ubahnbau.js';   // Maße gemeinsam mit dem Worker
export { B, W, OFFEN, LANG, TIEF };
const ZELLE = 16, DECKE = -0.32;

// Höhe der Rampe unter der Figur bei lokalem z (0 oben an der Treppe, positiv nach unten in Laufrichtung)
export function profil(z) {
  if (z <= 0) return 0;
  if (z < LAUF) return -N * STUFE * z / LAUF;
  if (z < LAUF + PODEST) return -N * STUFE;
  if (z < OFFEN) return -N * STUFE - N * STUFE * (z - LAUF - PODEST) / LAUF;
  return -TIEF;
}

export class EingangsFeld {
  // liste: [{ x, z, ry, y0 (Höhe oben an der Treppe), b (Bahnhof), n (Name), farbe }]
  constructor(liste) {
    this.liste = liste.map(e => ({ ...e, c: Math.cos(e.ry), s: Math.sin(e.ry) })); this.zellen = new Map();
    for (const e of this.liste) { const r = LANG + 3, x0 = Math.floor((e.x - r) / ZELLE), x1 = Math.floor((e.x + r) / ZELLE), z0 = Math.floor((e.z - r) / ZELLE), z1 = Math.floor((e.z + r) / ZELLE); for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) { const k = a * 100003 + c; (this.zellen.get(k) || this.zellen.set(k, []).get(k)).push(e); } }
    this.n = this.liste.length;
  }
  // Ortslage in die Lage des Eingangs: lx quer, lz entlang der Treppe (Gruppe mit rotation.y = ry)
  lokal(e, x, z) { const dx = x - e.x, dz = z - e.z; return [dx * e.c - dz * e.s, dx * e.s + dz * e.c]; }
  bei(x, z) { return this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)) || null; }
  // Bodenhöhe im Schacht, sonst null. yAlt: letzte Höhe der Füße
  hoehe(x, z, yAlt) {
    const L = this.bei(x, z); if (!L || yAlt === undefined) return null;
    for (const e of L) {
      const [lx, lz] = this.lokal(e, x, z); if (Math.abs(lx) > B / 2 || lz < -0.05 || lz > LANG) continue;
      if (yAlt > e.y0 + 1.2) continue;   // darüber (Sprung): normales Gelände
      if (lz <= OFFEN) return e.y0 + profil(lz);   // offene Treppe: hinein kommt man nur oben oder von unten
      if (yAlt < e.y0 - 1.2) return e.y0 - TIEF;   // im Gang unter dem Gehweg
    }
    return null;
  }
  // Kollision: null = normale Regeln, true = frei (im Schacht, Häuser darüber zählen nicht), false = Wand oder Geländer
  frei(x, z, y) {
    const L = this.bei(x, z); if (!L || y === undefined) return null;
    for (const e of L) {
      const [lx, lz] = this.lokal(e, x, z), ax = Math.abs(lx);
      if (y < e.y0 - 0.6) {   // unten im Schacht
        if (ax <= B / 2 - 0.3 && lz >= -0.3 && lz <= LANG - 0.3) return true;
        if (ax <= B / 2 + 2 && lz >= -1.5 && lz <= LANG + 1.5) return false;
        continue;
      }
      if (lz >= -0.05 && lz <= OFFEN + 0.3 && ax >= B / 2 - 0.12 && ax <= B / 2 + W + 0.25) return false;   // Geländer auf beiden Seiten
      if (lz >= OFFEN - 0.15 && lz <= OFFEN + 0.3 && ax <= B / 2 + W + 0.25) return false;   // Geländer am Ende über dem Gang
      if (ax < B / 2 - 0.12 && lz > -0.05 && lz < OFFEN) return true;   // oben in der Treppe, gleich geht es hinunter
    }
    return null;
  }
  // unten am Ende des Gangs: der Eingang, sonst null
  unten(x, z, y) {
    const L = this.bei(x, z); if (!L || y === undefined) return null;
    for (const e of L) { const [lx, lz] = this.lokal(e, x, z); if (Math.abs(lx) < B / 2 && lz > LANG - 1.8 && lz <= LANG && y < e.y0 - TIEF + 0.9) return e; }
    return null;
  }
}

// ---------- Netze ----------
class Teil { constructor() { this.pos = []; this.nor = []; this.uv = []; }
  quad(a, b, c, d, ua = [0, 0], ub = [1, 0], uc = [1, 1], ud = [0, 1]) { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2]; let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (const [q, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { this.pos.push(q[0], q[1], q[2]); this.nor.push(nx, ny, nz); this.uv.push(u[0], u[1]); } }
  geo() { if (!this.pos.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); return g; }
}
// Querschnitt der Treppe in (z, y): Stufen, Podest, Stufen, Gang
function stufenProfil() {
  const P = [[0, 0]]; let z = 0, y = 0;
  const lauf = () => { for (let k = 0; k < N; k++) { z += AUFTRITT; P.push([z, y]); y -= STUFE; P.push([z, y]); } };
  lauf(); z += PODEST; P.push([z, y]); lauf(); z = LANG; P.push([z, y]);
  return P;
}
const PROFIL = stufenProfil();
const leinwand = (w, h, mal) => { const c = document.createElement('canvas'); c.width = w; c.height = h; mal(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const schildCache = new Map();
function schild(name, farbe) {
  const k = name + farbe; if (schildCache.has(k)) return schildCache.get(k);
  const u = leinwand(256, 256, (g, w, h) => { g.fillStyle = '#1d5fae'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '800 200px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('U', w / 2, h / 2 + 10); });
  const n = leinwand(1024, 160, (g, w, h) => { g.fillStyle = '#10151c'; g.fillRect(0, 0, w, h); g.fillStyle = farbe; g.fillRect(0, h - 16, w, 16); g.fillStyle = '#fbfaf5'; g.textAlign = 'center'; g.textBaseline = 'middle'; let s = 96; g.font = `700 ${s}px system-ui, sans-serif`; while (g.measureText(name).width > w - 60 && s > 40) { s -= 4; g.font = `700 ${s}px system-ui, sans-serif`; } g.fillText(name, w / 2, h / 2 - 4); });
  const r = { u: new THREE.MeshBasicMaterial({ map: u }), n: new THREE.MeshBasicMaterial({ map: n }) }; schildCache.set(k, r); return r;
}
const MATS = {};
function mats(farbe) {
  MATS.stein ||= new THREE.MeshStandardMaterial({ color: 0x8e8c88, roughness: 0.85 });
  MATS.fliese ||= new THREE.MeshStandardMaterial({ color: 0xd6d0c1, roughness: 0.45 });
  MATS.decke ||= new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.9 });
  MATS.stahl ||= new THREE.MeshStandardMaterial({ color: 0x4d5155, roughness: 0.35, metalness: 0.7 });
  MATS.licht ||= new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
  MATS.durchgang ||= new THREE.MeshBasicMaterial({ color: 0xf3ead8 });
  const k = 'band' + farbe; MATS[k] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(farbe), roughness: 0.4 });
  return { ...MATS, band: MATS[k] };
}
// Ein Eingang als Gruppe: Ursprung oben an der Treppe auf Gehweghöhe, die Treppe läuft in lokales +z hinunter
export function eingangsTreppe(e) {
  const M = mats(e.farbe || '#1d5fae'), T = { stein: new Teil(), fliese: new Teil(), band: new Teil(), decke: new Teil(), stahl: new Teil(), licht: new Teil(), durchgang: new Teil() }, h = B / 2;
  // Stufen und Gang: Trittflächen nach oben, Setzstufen nach +z (sichtbar beim Hinaufgehen)
  for (let i = 1; i < PROFIL.length; i++) { const [z0, y0] = PROFIL[i - 1], [z1, y1] = PROFIL[i], A = [-h, y0, z0], Bq = [h, y0, z0], C = [h, y1, z1], D = [-h, y1, z1]; T.stein.quad(A, D, C, Bq, [-h, z0], [-h, z1], [h, z1], [h, z0]); }
  // Wände innen (Fliesen bis zur Gehwegkante, im Gang bis zur Decke), Band in Linienfarbe 1,3 m über der Rampe
  const oben = z => z <= OFFEN ? 0 : DECKE;
  for (let i = 0; i < 44; i++) { const z0 = LANG * i / 44, z1 = LANG * (i + 1) / 44, f0 = profil(z0), f1 = profil(z1);
    for (const s of [-1, 1]) { const x = s * h, a = [x, f0 - 0.05, z0], b = [x, f1 - 0.05, z1], c = [x, oben(z1), z1], d = [x, oben(z0), z0];
      if (s < 0) T.fliese.quad(a, b, c, d, [z0, a[1]], [z1, b[1]], [z1, c[1]], [z0, d[1]]); else T.fliese.quad(a, d, c, b, [z0, a[1]], [z0, d[1]], [z1, c[1]], [z1, b[1]]);
      const xb = s * (h - 0.01), ba = [xb, f0 + 1.22, z0], bb = [xb, f1 + 1.22, z1], bc = [xb, f1 + 1.4, z1], bd = [xb, f0 + 1.4, z0];
      if (Math.min(bc[1], bd[1]) < oben(z1) - 0.02) { if (s < 0) T.band.quad(ba, bb, bc, bd); else T.band.quad(ba, bd, bc, bb); }
      // Handlauf 0,9 m über der Rampe, 8 cm von der Wand
      const xh = s * (h - 0.08), r = 0.03, ha = [xh, f0 + 0.9, z0], hb = [xh, f1 + 0.9, z1]; T.stahl.quad([ha[0], ha[1] - r, ha[2]], [hb[0], hb[1] - r, hb[2]], [hb[0], hb[1] + r, hb[2]], [ha[0], ha[1] + r, ha[2]]); T.stahl.quad([ha[0], ha[1] - r, ha[2]], [ha[0], ha[1] + r, ha[2]], [hb[0], hb[1] + r, hb[2]], [hb[0], hb[1] - r, hb[2]]);
    } }
  // Decke über dem Gang, Lichtband, Stirn der Gehwegplatte über dem Gang, Durchgang am Ende (hell)
  T.decke.quad([-h, DECKE, OFFEN], [h, DECKE, OFFEN], [h, DECKE, LANG], [-h, DECKE, LANG]);
  T.licht.quad([-0.25, DECKE - 0.02, OFFEN + 0.3], [0.25, DECKE - 0.02, OFFEN + 0.3], [0.25, DECKE - 0.02, LANG - 0.3], [-0.25, DECKE - 0.02, LANG - 0.3]);
  T.fliese.quad([-h, DECKE, OFFEN], [-h, 0.12, OFFEN], [h, 0.12, OFFEN], [h, DECKE, OFFEN]);
  T.fliese.quad([-h, -TIEF, LANG], [-h, DECKE, LANG], [-0.85, DECKE, LANG], [-0.85, -TIEF, LANG]); T.fliese.quad([0.85, -TIEF, LANG], [0.85, DECKE, LANG], [h, DECKE, LANG], [h, -TIEF, LANG]);
  T.fliese.quad([-0.85, -TIEF + 2.3, LANG], [-0.85, DECKE, LANG], [0.85, DECKE, LANG], [0.85, -TIEF + 2.3, LANG]);
  T.durchgang.quad([-0.85, -TIEF, LANG - 0.02], [-0.85, -TIEF + 2.3, LANG - 0.02], [0.85, -TIEF + 2.3, LANG - 0.02], [0.85, -TIEF, LANG - 0.02]);
  // Brüstung und Geländer oben an der offenen Treppe (beide Seiten und am Ende)
  for (const s of [-1, 1]) { const x0 = s * h, x1 = s * (h + W); T.stein.quad([x0, 0.12, 0], [x0, 0.12, OFFEN], [x1, 0.12, OFFEN], [x1, 0.12, 0]); T.stein.quad([x1, -0.2, 0], [x1, 0.12, 0], [x1, 0.12, OFFEN], [x1, -0.2, OFFEN]); T.stein.quad([x0, 0.12, 0], [x1, 0.12, 0], [x1, -0.2, 0], [x0, -0.2, 0]);
    const xg = s * (h + W / 2), r = 0.03; for (const yg of [1.1, 0.55]) { T.stahl.quad([xg, 0.12 + yg - r, 0], [xg, 0.12 + yg - r, OFFEN], [xg, 0.12 + yg + r, OFFEN], [xg, 0.12 + yg + r, 0]); T.stahl.quad([xg, 0.12 + yg - r, 0], [xg, 0.12 + yg + r, 0], [xg, 0.12 + yg + r, OFFEN], [xg, 0.12 + yg - r, OFFEN]); }
    for (let z = 0; z <= OFFEN + 0.01; z += OFFEN / 6) { T.stahl.quad([xg - r, 0.12, z], [xg + r, 0.12, z], [xg + r, 1.22, z], [xg - r, 1.22, z]); T.stahl.quad([xg, 0.12, z - r], [xg, 1.22, z - r], [xg, 1.22, z + r], [xg, 0.12, z + r]); } }
  for (const yg of [1.1, 0.55]) { const r = 0.03, z = OFFEN + W / 2; T.stahl.quad([-h - W, 0.12 + yg - r, z], [h + W, 0.12 + yg - r, z], [h + W, 0.12 + yg + r, z], [-h - W, 0.12 + yg + r, z]); T.stahl.quad([-h - W, 0.12 + yg - r, z], [-h - W, 0.12 + yg + r, z], [h + W, 0.12 + yg + r, z], [h + W, 0.12 + yg - r, z]); }
  T.stein.quad([-h - W, 0.12, OFFEN], [h + W, 0.12, OFFEN], [h + W, 0.12, OFFEN + W], [-h - W, 0.12, OFFEN + W]);
  const G = new THREE.Group(); G.name = 'ubahn eingang';
  for (const [k, t] of Object.entries(T)) { const g = t.geo(); if (!g) continue; const m = new THREE.Mesh(g, M[k]); m.receiveShadow = k !== 'licht' && k !== 'durchgang'; m.castShadow = k === 'stahl'; G.add(m); }
  // Säule mit U und Namen vor dem Eingang
  const S = schild(e.n || 'U-Bahn', e.farbe || '#1d5fae'), saeule = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8).translate(0, 1.82, 0), M.stahl); saeule.position.set(-h - W - 0.45, 0, -0.4); G.add(saeule);
  const u = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), S.u); u.position.set(-h - W - 0.45, 3.2, -0.4); u.rotation.y = Math.PI; G.add(u); const u2 = u.clone(); u2.rotation.y = 0; u2.position.z -= 0.005; G.add(u2);
  const nm = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.34), S.n); nm.position.set(-h - W - 0.45, 2.62, -0.4); nm.rotation.y = Math.PI; G.add(nm); const nm2 = nm.clone(); nm2.rotation.y = 0; nm2.position.z -= 0.005; G.add(nm2);
  return G;
}
// Alle Eingänge eines Ortes: Gruppe und Feld (Höhe, Kollision, unten)
export function eingaengeBauen(liste, Hb) {
  const G = new THREE.Group(); G.name = 'ubahn eingaenge'; const daten = [];
  for (const e of liste) { const y0 = (Hb ? Hb(e.x, e.z) : 0) + 0.12, t = eingangsTreppe(e); t.position.set(e.x, y0, e.z); t.rotation.y = e.ry; G.add(t); daten.push({ ...e, y0 }); }
  return { gruppe: G, feld: new EingangsFeld(daten) };
}
