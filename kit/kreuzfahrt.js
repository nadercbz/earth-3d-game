// Fahrplan der Kreuzer (05.11.2026, Nader: "wenn es anlegt am Hafen ... die Reise mit antreten"). Routen aus tools/routen_bauen.mjs: echte Liegeplätze und Fahrwasser. Der Plan hängt nur an der Uhr: jedes Schiff ist für alle zur gleichen Zeit an derselben Stelle.
// Tempo wie im echten Betrieb (rund 20 Knoten), acht Stunden im Hafen. Zeitraffer an Bord schiebt die Uhr der Schiffe vor, im Hafen langsam, auf See bis 600 fach.
const D2R = Math.PI / 180, V = 10.3, LIEGE = 8 * 3600, RAMPE = 3500, SPEICHER = 'earth3d_kreuzfahrt';
const dist = (a, b) => { const dy = (b[0] - a[0]) * 111320, dLo = ((b[1] - a[1] + 540) % 360) - 180, dx = dLo * 111320 * Math.cos((a[0] + b[0]) * 0.5 * D2R); return Math.hypot(dx, dy); };
const peil = (a, b) => { const dy = b[0] - a[0], dLo = ((b[1] - a[1] + 540) % 360) - 180, dx = dLo * Math.cos((a[0] + b[0]) * 0.5 * D2R); return Math.atan2(dx, dy) / D2R; };
const winkelMisch = (a, b, k) => { const d = ((b - a + 540) % 360) - 180; return a + d * k; };
export class Kreuzfahrt {
  constructor() { this.routen = []; this.versatz = 0; this.bereit = false; try { this.versatz = +(localStorage.getItem(SPEICHER) || 0) || 0; } catch { /* privat */ } this.laden = fetch(new URL('../assets/ships/routen.json', import.meta.url)).then(r => r.json()).then(j => this.aufbau(j)).catch(e => console.warn('Routen', e)); this.faktor = 1; this.tSpeichern = 0; }
  aufbau(j) {
    this.routen = j.routen.map((R, ri) => {
      const leg = R.wege.map(P => { const c = [0]; for (let i = 1; i < P.length; i++) c.push(c[i - 1] + dist(P[i - 1], P[i])); const L = c.at(-1), tR = 2 * RAMPE / V, T = L > 2 * RAMPE ? (L - 2 * RAMPE) / V + 2 * tR : 2 * L / V; return { P, c, L, T, tR }; });
      // Kurs am Liegeplatz: der von Kurs und Gegenkurs, der näher an der Einfahrt liegt
      const n = R.haefen.length, haefen = R.haefen.map((h, i) => { const ein = leg[(i - 1 + n) % n], t = ein ? this.tangente(ein, ein.L - 800) : h.kurs; const d = Math.abs(((t - h.kurs + 540) % 360) - 180); const kurs = d < 90 ? h.kurs : h.kurs + 180; return { ...h, kursEff: (kurs + 360) % 360 }; });
      let T = 0; const t0 = []; for (let i = 0; i < n; i++) { t0.push(T); T += leg[i].T + LIEGE; } return { name: R.name, haefen, leg, T, t0, phase: (ri * 7919.0) * 3600 % T };
    }); this.bereit = true;
  }
  tangente(l, s) { const a = this.punkt(l, Math.max(0, s - 170)), b = this.punkt(l, Math.min(l.L, s + 170)); return peil(a, b); }
  punkt(l, s) { const c = l.c; let i0 = 0, i1 = c.length - 1; while (i1 - i0 > 1) { const m = (i0 + i1) >> 1; if (c[m] <= s) i0 = m; else i1 = m; } const k = (s - c[i0]) / Math.max(1e-6, c[i1] - c[i0]), a = l.P[i0], b = l.P[i1], dLo = ((b[1] - a[1] + 540) % 360) - 180; return [a[0] + (b[0] - a[0]) * k, a[1] + dLo * k]; }
  uhr() { return Date.now() / 1000 + this.versatz; }
  // Lage eines Schiffs: r Route, j Nummer auf der Route (0, 1, je um die halbe Runde versetzt)
  zustand(r, j = 0, out = {}) {
    const R = this.routen[r]; if (!R) return null; const T = R.T; let t = (this.uhr() + R.phase + j * T / 2) % T; let i = 0; while (i + 1 < R.t0.length && t >= R.t0[i + 1]) i++; t -= R.t0[i]; const n = R.haefen.length, l = R.leg[i], von = R.haefen[i], nach = R.haefen[(i + 1) % n];
    if (t < l.T) {
      const s = l.L > 2 * RAMPE ? (t < l.tR ? RAMPE * (t / l.tR) ** 2 : t > l.T - l.tR ? l.L - RAMPE * ((l.T - t) / l.tR) ** 2 : RAMPE + (t - l.tR) * V) : l.L * (t / l.T) ** 2 * (3 - 2 * t / l.T), v = l.L > 2 * RAMPE ? (t < l.tR ? 2 * RAMPE * t / (l.tR * l.tR) : t > l.T - l.tR ? 2 * RAMPE * (l.T - t) / (l.tR * l.tR) : V) : 3;
      const p = this.punkt(l, s), tg = this.tangente(l, s), a = Math.min(1, Math.max(0, (s - 200) / 500)), e = Math.min(1, Math.max(0, (l.L - s - 200) / 500)); let k = winkelMisch(von.kursEff, tg, a * a * (3 - 2 * a)); k = winkelMisch(nach.kursEff, k, e * e * (3 - 2 * e));
      out.lat = p[0]; out.lon = p[1]; out.kurs = (k + 360) % 360; out.v = v; out.liegt = false; out.hafen = null; out.naechster = nach; out.rest = l.T - t; out.bisKm = (l.L - s) / 1000; out.route = R.name; out.text = `Route ${R.name} · nächster Hafen ${nach.name} in ${this.dauer(l.T - t)}`;
    } else { const rest = l.T + LIEGE - t; out.lat = nach.lat; out.lon = nach.lon; out.kurs = nach.kursEff; out.v = 0; out.liegt = true; out.hafen = nach; out.naechster = R.haefen[(i + 2) % n]; out.rest = rest; out.bisKm = 0; out.route = R.name; out.text = `Im Hafen von ${nach.name} · Abfahrt in ${this.dauer(rest)}`; }
    return out;
  }
  dauer(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h >= 48 ? `${Math.round(h / 24)} Tagen` : h ? `${h} h ${m} min` : `${m} min`; }
  // Uhr der Schiffe so stellen, dass Schiff j der Route r gerade im angegebenen Hafen liegt (Mitte der Liegezeit, dann bleibt Zeit zum Ansehen)
  stelleAufHafen(r, h, j = 0) { const R = this.routen[r]; if (!R) return; const n = R.haefen.length, i = (h - 1 + n) % n, ziel = R.t0[i] + R.leg[i].T + 900, t = (this.uhr() + R.phase + j * R.T / 2) % R.T; let d = ziel - t; if (d < 0) d += R.T; this.versatz += d; this.merken(); }
  merken() { try { localStorage.setItem(SPEICHER, String(this.versatz)); } catch { /* privat */ } }
  // Zeitraffer: je Bild aufrufen, Rückgabe sind die vorgerückten Sekunden
  vorruecken(dt, faktor) { if (faktor <= 1) return 0; const d = dt * (faktor - 1); this.versatz += d; if ((this.tSpeichern -= dt) < 0) { this.tSpeichern = 5; this.merken(); } return d; }
  anzahl() { return this.routen.length * 2; }
}
