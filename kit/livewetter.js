// Live Wetter (05.11.2026, Nader: "unterschiedliche Wetter ereignisse überall aber live wie das wetter wirklich ist in der welt"). Daten von Open-Meteo (frei, ohne Schlüssel, CC BY 4.0): aktuelles Wetter am Ort des Spielers,
// am Meer dazu der Seegang (Höhe, Periode, Richtung), aus dem All eine grobe Karte der Bewölkung der ganzen Erde. Es geht nur die Lage im Spiel an den Dienst, sonst nichts. Fällt der Dienst aus, bleibt das letzte Wetter.
import * as THREE from 'three';

const API = 'https://api.open-meteo.com/v1/forecast', MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const TEXT = { 0: 'klar', 1: 'fast klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Reifnebel', 51: 'leichter Niesel', 53: 'Niesel', 55: 'starker Niesel', 56: 'gefrierender Niesel', 57: 'gefrierender Niesel', 61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'Eisregen', 67: 'Eisregen', 71: 'leichter Schnee', 73: 'Schnee', 75: 'starker Schnee', 77: 'Schneegriesel', 80: 'leichte Schauer', 81: 'Schauer', 82: 'heftige Schauer', 85: 'Schneeschauer', 86: 'starke Schneeschauer', 95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter' };
const kl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)), gl = (a, b, x) => { const t = kl((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const WETTER_K = { tWetterK: { value: null }, uWetterKEin: { value: 0 } };   // Karte der Bewölkung für den Blick aus dem All (kit/erde.js WOLKEN_GLSL)

// Aus den Messwerten die Größen des Spiels
export function wetterAusDaten(c) {
  const code = c.weather_code ?? 0, regenMm = (c.rain || 0) + (c.showers || 0), schneeCm = c.snowfall || 0, frost = (c.temperature_2m ?? 10) < 0.5;
  const gewitter = code >= 95 ? 1 : 0, istSchnee = schneeCm > 0.01 || (code >= 71 && code <= 77) || code === 85 || code === 86 || (frost && (c.precipitation || 0) > 0.02);
  const nebelCode = code === 45 || code === 48, sicht = c.visibility ?? 24000;
  const regen = istSchnee ? 0 : Math.max(kl(regenMm / 3.2), code >= 51 && code <= 57 ? 0.22 : code >= 61 && code <= 67 ? 0.45 : code >= 80 && code <= 82 ? 0.55 : 0, gewitter * 0.85);
  const schnee = istSchnee ? Math.max(kl(schneeCm / 1.2), 0.35) : 0, wolken = kl(Math.pow((c.cloud_cover ?? 30) / 100, 0.9) * 0.97 + 0.03);
  const nebel = Math.max(nebelCode ? 0.92 : 0, 1 - gl(180, 7000, sicht), regen * 0.3, schnee * 0.35);
  const licht = kl(1 - 0.58 * gl(0.3, 1, wolken) - 0.14 * regen - 0.1 * gewitter - 0.1 * schnee + 0.0, 0.26, 1);
  return { name: 'Live', wolken, regen, nebel, nass: Math.max(regen > 0.02 ? 0.45 + 0.55 * regen : 0, nebel * 0.25, schnee * 0.2), licht, schnee, gewitter, wind: c.wind_speed_10m ?? 4, decke: kl((c.snow_depth || 0) / 0.08) };
}
export class LiveWetter {
  constructor() { this.an = true; this.ziel = null; this.daten = null; this.seegang = null; this.letzte = null; this.warte = 0; this.laeuft = false; this.fehler = 0; this.text = ''; this.tGlobal = -1e12; this.globalLaeuft = false; this.windRichtung = 0; this.ort = ''; }
  async json(url) { const ab = new AbortController(), t = setTimeout(() => ab.abort(), 9000); try { const r = await fetch(url, { signal: ab.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } }
  update(dt, lat, lon, { amMeer = false, hoehe = 0 } = {}) {
    if (!this.an || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    this.warte -= dt; if (hoehe > 150000) this.globalHolen();
    if (this.laeuft || this.warte > 0) return; const L = this.letzte, jetzt = Date.now();
    if (L) { const weg = Math.hypot((lat - L.lat) * 111000, (lon - L.lon) * 111000 * Math.cos(lat * Math.PI / 180)); if (weg < 30000 && jetzt - L.t < 900000 && (!amMeer || L.meer)) return; }
    this.warte = 40 + this.fehler * 60; this.laeuft = true; this.holen(lat, lon, amMeer).finally(() => { this.laeuft = false; });
  }
  async holen(lat, lon, amMeer) {
    const la = lat.toFixed(3), lo = lon.toFixed(3);
    try {
      const d = await this.json(`${API}?latitude=${la}&longitude=${lo}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,snow_depth,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility&wind_speed_unit=ms`), c = d.current; if (!c) throw new Error('leer');
      this.daten = c; this.ziel = wetterAusDaten(c); this.windRichtung = c.wind_direction_10m || 0; this.fehler = 0;
      const beschr = TEXT[c.weather_code] || 'wechselhaft'; this.text = `${Math.round(c.temperature_2m)} °C · ${beschr} · Wind ${Math.round((c.wind_speed_10m || 0) * 3.6)} km/h`;
      this.letzte = { lat, lon, t: Date.now(), meer: false };
      this.warte = 6; window.__ereignis?.('wetter');
    } catch (e) { this.fehler = Math.min(10, this.fehler + 1); return; }
    if (!amMeer) { this.seegang = null; return; }
    try {
      const m = await this.json(`${MARINE}?latitude=${la}&longitude=${lo}&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period`), c = m.current;
      if (c && c.wave_height != null) { this.seegang = { hoehe: c.wave_height, periode: c.swell_wave_height > (c.wind_wave_height || 0) && c.swell_wave_period ? c.swell_wave_period : c.wave_period, richtung: c.wave_direction, wind: this.daten?.wind_speed_10m ?? null }; this.text += ` · Wellen ${c.wave_height.toFixed(1).replace('.', ',')} m`; }
      else this.seegang = { hoehe: null, periode: null, richtung: this.windRichtung, wind: this.daten?.wind_speed_10m ?? null };
      if (this.letzte) this.letzte.meer = true;
    } catch (e) { this.seegang = { hoehe: null, periode: null, richtung: this.windRichtung, wind: this.daten?.wind_speed_10m ?? null }; if (this.letzte) this.letzte.meer = true; }
  }
  // Karte der Bewölkung der ganzen Erde: 24 mal 11 Punkte, höchstens einmal je Stunde, nur beim Blick aus großer Höhe
  async globalHolen() {
    if (this.globalLaeuft || Date.now() - this.tGlobal < 3600000) return; this.globalLaeuft = true; this.tGlobal = Date.now();
    try {
      // je Browser höchstens einmal je Stunde beim Dienst (Grenze 600 Abrufe je Minute, die Karte zählt 264). Bleibt im Speicher des Browsers, sonst nirgends
      let werte = null; try { const k = JSON.parse(localStorage.getItem('earth3d_wolkenkarte') || 'null'); if (k && Date.now() - k.t < 3600000 && k.w?.length === 528) werte = k.w; } catch { /* privat oder voll */ }
      if (!werte) {
        const las = [], los = []; for (let i = 0; i < 11; i++) for (let j = 0; j < 24; j++) { las.push(-75 + i * 15); los.push(-180 + j * 15); }
        const r = await this.json(`${API}?latitude=${las.join(',')}&longitude=${los.join(',')}&current=cloud_cover,precipitation`), L = Array.isArray(r) ? r : [r]; if (L.length !== 264) throw new Error('Anzahl');
        werte = []; for (const p of L) werte.push(Math.round((p.current?.cloud_cover ?? 40) * 2.55), Math.min(255, Math.round((p.current?.precipitation || 0) * 60)));
        try { localStorage.setItem('earth3d_wolkenkarte', JSON.stringify({ t: Date.now(), w: werte })); } catch { /* privat oder voll */ }
      }
      const b = new Uint8Array(264 * 4); for (let i = 0; i < 264; i++) { b[i * 4] = werte[i * 2]; b[i * 4 + 1] = werte[i * 2 + 1]; b[i * 4 + 3] = 255; }
      const t = new THREE.DataTexture(b, 24, 11); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; WETTER_K.tWetterK.value?.dispose?.(); WETTER_K.tWetterK.value = t;
    } catch (e) { this.tGlobal = Date.now() - 3300000; } finally { this.globalLaeuft = false; }
  }
}
