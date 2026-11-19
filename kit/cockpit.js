// Anzeigen im Cockpit (05.11.2026): drei Bildschirme auf einer Leinwand, die im Cockpit 10 Mal je Sekunde neu gezeichnet werden. Künstlicher Horizont, Kompass, Triebwerk. Für Jet und Hubschrauber.
import { T, istEN } from './sprache.js';
import * as THREE from 'three';
const B = 1024, H = 340, P = B / 3;
export class Anzeigen {
  constructor(art) {
    this.art = art; const c = this.c = document.createElement('canvas'); c.width = B; c.height = H; this.g = c.getContext('2d'); this.t = 1;
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.flipY = false; this.tex.anisotropy = 4;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x050607, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 1.25, roughness: 0.2, metalness: 0, side: THREE.DoubleSide });
    this.mat.name = 'mfd';
  }
  update(F, dt) { this.t += dt; if (this.t < 0.1) return; this.t = 0; this.zeichne(F); this.tex.needsUpdate = true; }
  zeichne(F) {
    const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#04070a'; g.fillRect(0, 0, B, H);
    this.horizont(g, F, 6, 6, P - 12, H - 12); this.kompass(g, F, P + 6, 6, P - 12, H - 12); this.technik(g, F, 2 * P + 6, 6, P - 12, H - 12);
  }
  rahmen(g, x, y, w, h) { g.strokeStyle = 'rgba(120,150,150,.5)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
  horizont(g, F, x, y, w, h) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); const m = [x + w / 2, y + h / 2], k = 4.2; g.translate(m[0], m[1]); g.rotate(-(F.quer || 0) * Math.PI / 180); g.translate(0, (F.neigung || 0) * k);
    g.fillStyle = '#1f6fb2'; g.fillRect(-w * 1.5, -h * 3, w * 3, h * 3); g.fillStyle = '#7a5230'; g.fillRect(-w * 1.5, 0, w * 3, h * 3); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(-w * 1.5, 0); g.lineTo(w * 1.5, 0); g.stroke();
    g.font = '600 15px Arial'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.lineWidth = 2; for (let d = -40; d <= 40; d += 10) { if (!d) continue; const yy = -d * k, l = 34; g.beginPath(); g.moveTo(-l, yy); g.lineTo(l, yy); g.stroke(); g.fillText(Math.abs(d), l + 6, yy + 5); }
    g.restore();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 4; g.beginPath(); g.moveTo(m[0] - 66, m[1]); g.lineTo(m[0] - 22, m[1]); g.lineTo(m[0] - 22, m[1] + 12); g.moveTo(m[0] + 66, m[1]); g.lineTo(m[0] + 22, m[1]); g.lineTo(m[0] + 22, m[1] + 12); g.moveTo(m[0] - 3, m[1]); g.lineTo(m[0] + 3, m[1]); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(x, y + h / 2 - 22, 78, 44); g.fillRect(x + w - 84, y + h / 2 - 22, 84, 44); g.fillStyle = '#7dffb0'; g.font = '700 25px Arial'; g.textAlign = 'center'; g.fillText(Math.round(F.kmh), x + 39, y + h / 2 + 9); g.fillText(Math.round(F.agl < 9999 ? F.agl : F.geo.h), x + w - 42, y + h / 2 + 9);
    g.font = '600 13px Arial'; g.fillStyle = '#cfe'; g.fillText('km/h', x + 39, y + h / 2 + 40); g.fillText('m', x + w - 42, y + h / 2 + 40); this.rahmen(g, x, y, w, h);
  }
  kompass(g, F, x, y, w, h) {
    const m = [x + w / 2, y + h / 2 + 6], r = Math.min(w, h) * 0.42; g.save(); g.translate(m[0], m[1]); g.strokeStyle = 'rgba(125,255,176,.35)'; g.lineWidth = 2; for (const q of [0.33, 0.66]) { g.beginPath(); g.arc(0, 0, r * q, 0, 6.283); g.stroke(); }
    g.rotate(-(F.kurs || 0) * Math.PI / 180); g.strokeStyle = '#7dffb0'; g.fillStyle = '#7dffb0'; g.font = '700 21px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 10) { const a = d * Math.PI / 180, gross = d % 30 === 0; g.lineWidth = gross ? 3 : 1.5; g.beginPath(); g.moveTo(Math.sin(a) * r, -Math.cos(a) * r); g.lineTo(Math.sin(a) * (r - (gross ? 14 : 8)), -Math.cos(a) * (r - (gross ? 14 : 8))); g.stroke(); if (d % 90 === 0) { g.save(); g.translate(Math.sin(a) * (r - 32), -Math.cos(a) * (r - 32)); g.rotate(a); g.fillStyle = d ? '#7dffb0' : '#ffb84a'; g.fillText((istEN ? 'NESW' : 'NOSW')[d / 90], 0, 0); g.restore(); } }
    g.restore(); g.textBaseline = 'alphabetic'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(m[0], m[1] - 18); g.lineTo(m[0], m[1] + 16); g.moveTo(m[0] - 15, m[1] - 2); g.lineTo(m[0] + 15, m[1] - 2); g.moveTo(m[0] - 6, m[1] + 14); g.lineTo(m[0] + 6, m[1] + 14); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 26px Arial'; g.textAlign = 'center'; g.fillText(String(Math.round(F.kurs) % 360).padStart(3, '0') + '°', x + w / 2, y + 30); this.rahmen(g, x, y, w, h);
  }
  balken(g, x, y, w, h, wert, farbe, name, text) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, y, w, h); g.fillStyle = farbe; const k = Math.max(0, Math.min(1, wert)); g.fillRect(x, y + h * (1 - k), w, h * k); g.fillStyle = '#dff'; g.font = '600 15px Arial'; g.textAlign = 'center'; g.fillText(name, x + w / 2, y + h + 20); g.font = '700 17px Arial'; g.fillText(text, x + w / 2, y - 7); }
  technik(g, F, x, y, w, h) {
    const hoch = h - 120, oben = y + 42; if (this.art === 'heli') { this.balken(g, x + 30, oben, 50, hoch, F.drehzahl, '#7dffb0', 'ROTOR', Math.round(F.drehzahl * 100)); this.balken(g, x + 125, oben, 50, hoch, F.gas, '#ffd24a', 'KOLL', Math.round(F.gas * 100)); this.balken(g, x + 220, oben, 50, hoch, 0.72 + 0.02 * Math.sin(F.geo.lon * 900), '#6fc8ff', 'TANK', '72'); }
    else { this.balken(g, x + 22, oben, 44, hoch, F.gas + F.nach * 0.3, F.nach > 0.3 ? '#ff9b3d' : '#7dffb0', 'L', Math.round((F.gas + F.nach * 0.3) * 77)); this.balken(g, x + 86, oben, 44, hoch, F.gas + F.nach * 0.3, F.nach > 0.3 ? '#ff9b3d' : '#7dffb0', 'R', Math.round((F.gas + F.nach * 0.3) * 77)); this.balken(g, x + 170, oben, 44, hoch, 0.68, '#6fc8ff', 'TANK', '68');
      const an = F.fahrwerk > 0.98, faehrt = F.fahrwerk > 0.02 && !an; g.fillStyle = an ? '#39d36f' : faehrt ? '#ffb84a' : '#39424a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + w - 42 + [0, -18, 18][i], y + 62 + (i ? 30 : 0), 11, 0, 6.283); g.fill(); } g.fillStyle = '#dff'; g.font = '600 13px Arial'; g.textAlign = 'center'; g.fillText(T('FAHRWERK'), x + w - 42, y + 126); }
    g.fillStyle = '#7dffb0'; g.font = '700 19px Arial'; g.textAlign = 'left'; g.fillText(`${F.steigen >= 0 ? '+' : ''}${Math.round(F.steigen)} m/s`, x + 18, y + h - 22); this.rahmen(g, x, y, w, h);
  }
}
// dunkle Innenhaut: die Rückseiten des Rumpfes, nur im Cockpit sichtbar. Keine Daten extra, die Fenster bleiben frei
export function innenHaut(rumpf, farbe = 0x17181c) { const m = new THREE.Mesh(rumpf.geometry, new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.85, metalness: 0, side: THREE.BackSide })); m.frustumCulled = false; m.visible = false; m.castShadow = false; rumpf.add(m); return m; }
