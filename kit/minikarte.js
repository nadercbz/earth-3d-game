// Minikarte unten rechts (Wunsch Nr. 34, 29.10.2026, Nader: "auf dem Netz unten rechts sehen, wo ich gerade bin auf der Erde"): beim Fahren,
// zu Fuß und im Jet. Wie in GTA in Blickrichtung gedreht, Spieler als Pfeil etwas unter der Mitte, Norden am Rand, Maßstab nach Tempo und
// Höhe. Nah eigene dunkle Kartenkacheln aus den Vektorkacheln (Worker, Auftrag minikarte), weit draußen das Satellitenbild (EOX Sentinel 2
// 2016) mit Wasser und Straßen darüber. Dazu Ziel (am Rand, wenn es außerhalb liegt) und Route der Navigation (kit/navi.js).
import { miniKarteBestellen } from './ortdienst.js';
import { FOTO } from './erde.js';

const T = 256, D2R = Math.PI / 180;
// Web Mercator: Pixel auf Stufe z (256 je Kachel)
export function merc(lat, lon, z) {
  const n = T * 2 ** z, s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * D2R);
  return [(lon + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

export class Minikarte {
  constructor({ mobil = false } = {}) {
    this.G = mobil ? 118 : 196; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.canvas = document.createElement('canvas'); c.className = 'minikarte'; c.setAttribute('aria-label', 'Minikarte');
    c.width = c.height = Math.round(this.G * this.dpr); c.style.width = c.style.height = this.G + 'px';
    document.body.appendChild(c); this.g = c.getContext('2d');
    this.kacheln = new Map(); this.an = false; this.zoom = null;
  }
  zeigen(an) { if (an === this.an) return; this.an = an; this.canvas.classList.toggle('an', an); if (!an) this.zoom = null; }
  // art: k (Karte mit Grund), s (Wasser und Straßen, durchsichtig), f (Foto); nur aus dem Speicher: lade = false
  kachel(art, z, x, y, lade = true) {
    const n = 2 ** z; x = ((x % n) + n) % n; if (y < 0 || y >= n) return null;
    const key = `${art}${z}/${x}/${y}`, jetzt = performance.now(); let k = this.kacheln.get(key);
    if (k && k.fehlerBis && jetzt > k.fehlerBis) { this.kacheln.delete(key); k = null; }   // nach einem Fehler später noch einmal
    if (!k) {
      if (!lade) return null;
      k = { bild: null, t: jetzt }; this.kacheln.set(key, k);
      const fehler = () => { k.fehlerBis = performance.now() + 15000; };
      if (art === 'f') { const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async'; img.onload = () => { k.bild = img; }; img.onerror = fehler; img.src = FOTO.replace('{z}', z).replace('{x}', x).replace('{y}', y); }
      else miniKarteBestellen(z, x, y, z >= 14 ? 512 : T, art === 'k', () => -6, () => !this.kacheln.has(key)).then(b => { if (this.kacheln.get(key) === k) k.bild = b; else b.close?.(); }).catch(fehler);
      if (this.kacheln.size > 140) {   // die am längsten nicht gebrauchte fertige Kachel freigeben
        let alt = null; for (const [kk, v] of this.kacheln) if (v.bild && (!alt || v.t < alt[1].t)) alt = [kk, v];
        if (alt) { alt[1].bild.close?.(); this.kacheln.delete(alt[0]); }
      }
    }
    k.t = jetzt; return k.bild;
  }
  // eine Schicht aus Kacheln der Stufe zq (höchstens maxZ) um den Spieler; fehlt eine Kachel, springt ein Vorfahr ein (gröber, aber keine Lücke)
  schicht(g, art, zf, lat, lon, R, maxZ) {
    const zq = Math.max(0, Math.min(Math.round(zf), maxZ)), s = 2 ** (zf - zq), [cx, cy] = merc(lat, lon, zq), r = R / s;
    for (let ty = Math.floor((cy - r) / T); ty <= Math.floor((cy + r) / T); ty++) for (let tx = Math.floor((cx - r) / T); tx <= Math.floor((cx + r) / T); tx++) {
      const dx = (tx * T - cx) * s, dy = (ty * T - cy) * s, d = T * s;
      let b = this.kachel(art, zq, tx, ty);
      if (b) { g.drawImage(b, dx, dy, d + 0.6, d + 0.6); continue; }
      for (let up = 1; up <= 5 && zq - up >= 0; up++) {
        const p = this.kachel(art, zq - up, tx >> up, ty >> up, up === 1); if (!p) continue;
        const w = (p.width || T) / 2 ** up, sx = (tx - ((tx >> up) << up)) * w, sy = (ty - ((ty >> up) << up)) * w;   // Stufe 14 kommt mit 512 Pixeln
        g.drawImage(p, sx, sy, w, w, dx, dy, d + 0.6, d + 0.6); break;
      }
    }
  }
  // o: { lat, lon, kurs (Blickrichtung in Grad, 0 Norden, im Uhrzeigersinn), pfeil (Richtung des Spielers relativ dazu), zoom (Stufe, gebrochen), dt,
  //      ziel: { lat, lon } | null, route: [[lat, lon], ...] | null, jet }
  update(o) {
    if (!this.an) return;
    const g = this.g, G = this.G, M = G / 2;
    this.zoom = this.zoom === null ? o.zoom : this.zoom + (o.zoom - this.zoom) * (1 - Math.exp(-3 * (o.dt || 0.016)));
    const zf = this.zoom, mx = M, my = G * 0.6, th = -o.kurs * D2R, cos = Math.cos(th), sin = Math.sin(th);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, G, G);
    g.save(); g.beginPath(); g.arc(M, M, M - 1.5, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2a3037'; g.fillRect(0, 0, G, G);
    g.translate(mx, my); g.rotate(th);
    const R = G * 0.64;
    if (zf >= 11.5) {   // bis die Kartenkacheln da sind (Worker), zeigt das Satellitenbild darunter den Ort (vorher war die Karte anfangs leer)
      this.schicht(g, 'f', zf, o.lat, o.lon, R, 14); g.fillStyle = 'rgba(18, 22, 28, 0.45)'; g.fillRect(-R, -R, 2 * R, 2 * R);   // Stufe 14 wie die Kugel (meist schon im Speicher, schont den Server)
      this.schicht(g, 'k', zf, o.lat, o.lon, R, 14);
    }
    else {
      this.schicht(g, 'f', zf, o.lat, o.lon, R, 15);
      g.fillStyle = 'rgba(18, 22, 28, 0.32)'; g.fillRect(-R, -R, 2 * R, 2 * R);   // Foto abdunkeln, damit Straßen und Pfeil lesbar bleiben
      if (zf >= 7.5) this.schicht(g, 's', zf, o.lat, o.lon, R, 14);
    }
    const [px, py] = merc(o.lat, o.lon, zf);
    if (o.route && o.route.length > 1) {   // Route: dunkler Rand, darüber kräftig
      g.beginPath(); o.route.forEach(([la, lo], i) => { const [x, y] = merc(la, lo, zf); i ? g.lineTo(x - px, y - py) : g.moveTo(x - px, y - py); });
      g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = 'rgba(20, 16, 8, 0.7)'; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#ffb547'; g.lineWidth = 4; g.stroke();
    }
    g.restore();
    // Ziel: im Kreis an seiner Stelle, sonst am Rand in seiner Richtung
    if (o.ziel) {
      const [zx, zy] = merc(o.ziel.lat, o.ziel.lon, zf), dx = zx - px, dy = zy - py;
      let sx = mx + dx * cos - dy * sin, sy = my + dx * sin + dy * cos;
      const rx = sx - M, ry = sy - M, rr = Math.hypot(rx, ry), rand = M - 9, aussen = rr > rand;
      if (aussen) { sx = M + rx / rr * rand; sy = M + ry / rr * rand; }
      g.beginPath(); g.arc(sx, sy, aussen ? 6 : 7, 0, Math.PI * 2); g.fillStyle = '#ffb547'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1b1610'; g.stroke();
      g.beginPath(); g.arc(sx, sy, 2.2, 0, Math.PI * 2); g.fillStyle = '#1b1610'; g.fill();
    }
    // Spieler: Pfeil nach oben (Blickrichtung), im Jet etwas größer
    const a = o.jet ? 9 : 8;
    g.save(); g.translate(mx, my); g.rotate((o.pfeil || 0) * D2R); g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.72, a * 0.8); g.lineTo(0, a * 0.38); g.lineTo(-a * 0.72, a * 0.8); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#11151a'; g.stroke(); g.restore();
    // Rand und Norden
    g.beginPath(); g.arc(M, M, M - 1.5, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = 'rgba(14, 17, 21, 0.85)'; g.stroke();
    const nx = M + Math.sin(th) * (M - 11), ny = M - Math.cos(th) * (M - 11);
    g.beginPath(); g.arc(nx, ny, 8, 0, Math.PI * 2); g.fillStyle = 'rgba(14, 17, 21, 0.85)'; g.fill();
    g.fillStyle = '#ffffff'; g.font = '700 10px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
  }
}
