// Brücken über Wasser als Bauwerke (06.11.2026, Nader: "alles, was in der echten Welt will ich da auch haben", "maßstabsgetreu"). Vorher lag die Fahrbahn flach auf dem Gelände, über Flüssen also unter dem Wasser.
// Lage und Breite aus den Kacheln (brunnel=bridge über Wasser, kit/ortbau.js). Höhe nach Länge und Ufer, Rampen mit höchstens 5,5 % Steigung. Drei Bauarten: Steinbogen in alten Städten, Balken auf Pfeilern, Schrägseil ab 520 m.
// Autos, Fußgänger und Spieler fahren oben: das Höhenfeld dieser Klasse ersetzt ort.H. Unter der Brücke bleibt das Gelände (ort.Hz entscheidet nach der letzten Höhe, Uferstraßen fahren unten durch). Keine Marken, nur Bauart.
import * as THREE from 'three';

const ZELLE = 16;
const glatt = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export class BrueckenFeld {
  constructor(liste, Hg, halb, { altStadt = false, land = null, wasser = null } = {}) {   // Hg: Boden, über Gewässern mit festem Pegel der Wasserspiegel (kit/ort.js). land: nur das Gelände (Höhe der Brückenenden am Ufer)
    this.Hg = Hg; this.land = land || Hg; this.wasser = wasser || (() => false); this._alle = []; this.ketten = []; this.zellen = new Map(); this.altStadt = altStadt; this.pfeiler = new Map();   // wasser(x, z): Gewässer mit festem Pegel
    // nach Ebene bauen (Autobahnkreuze: die obere Brücke rechnet ihre Durchfahrtshöhe über dem Deck der unteren), jede Kette gleich eintragen
    for (const b of [...liste].sort((p, q) => (p.e || 0) - (q.e || 0))) { const k = b.ueber ? this.ketteUeber(b, halb) : this.kette(b, halb); if (!k) continue; this.ketten.push(k); this.eintragen(k); }
    this.geschwister();
    this.zellen = new Map(); for (const k of this.ketten) this.eintragen(k);   // neu mit Lückenschluss zwischen Geschwistern
    this.ueber = this.ketten.some(k => k.ueber);
    // ort.H: oben, wo eine Brücke ist (bei Brücken über Verkehr nur auf den Rampen, unter dem Brückenteil bleibt der Boden für die untere Straße).
    // ort.Hz: mit der letzten Höhe, wer unten ist, bleibt unten
    this.H = (x, z) => { const g = Hg(x, z), d = this.deck(x, z, true); return d === null ? g : Math.max(g, d); };
    // Mit letzter Höhe: man bleibt auf der Ebene, auf der man ist. Unter mehreren Decks an einer Stelle (zwei Brücken nebeneinander auf
    // verschiedener Höhe, Brücke über Uferweg) zählt das, das der letzten Höhe am nächsten liegt, höchstens 3,2 m darüber. Bis Nr. 106 gewann
    // immer das höchste erreichbare: wer auf der unteren Brücke fuhr, sprang im Überlappungsbereich auf die obere
    this.Hz = (x, z, yAlt) => { const g = Hg(x, z); if (yAlt === undefined) { const d = this.deck(x, z); return d === null ? g : Math.max(g, d); } const L = this._alle; L.length = 0; this.deck(x, z, false, L); if (!L.length) return g; let best = g, bd = Math.abs(g - yAlt); for (const d of L) { if (d < g || d - yAlt > 3.2) continue; const a = Math.abs(d - yAlt); if (a < bd - 1e-4 || (a < bd + 0.3 && d > best)) { bd = a; best = d; } } return best; };
  }
  eintragen(k) {
      const extra = (k.extMax || 0) + 1.3;
      for (let i = 1; i < k.x.length; i++) { const seg = { k, i }, r = k.halb + 0.5 + extra, x0 = Math.floor((Math.min(k.x[i - 1], k.x[i]) - r) / ZELLE), x1 = Math.floor((Math.max(k.x[i - 1], k.x[i]) + r) / ZELLE), z0 = Math.floor((Math.min(k.z[i - 1], k.z[i]) - r) / ZELLE), z1 = Math.floor((Math.max(k.z[i - 1], k.z[i]) + r) / ZELLE); for (let a = x0; a <= x1; a++) for (let c = z0; c <= z1; c++) { const s = a * 100003 + c; (this.zellen.get(s) || this.zellen.set(s, []).get(s)).push(seg); } }
  }
  // Brückenköpfe (Nr. 106): Enden aller Ketten auf festem Boden mit ihrer Höhe. kit/ort.js zieht das Gelände dort auf die Höhe der Brücke
  // (innen ganz, außen auf 18 m verzogen): das Höhenmodell schwankt neben der Fahrbahn um bis zu 2 m, die Straße lag am Brückenende höher
  // oder tiefer als das Deck (Stufen bis 1,7 m an Gertraudenbrücke und Weidendammer Brücke)
  koepfe() { const out = [];
    for (const k of this.ketten) { const N = k.x.length;
      for (const e of [0, N - 1]) { if (k.offenEnde?.[e ? 1 : 0]) continue; if (!k.ueber || Math.abs(k.y[e] - k.g[e]) < 0.4) out.push({ x: k.x[e], z: k.z[e], y: k.y[e], r0: k.aussen + 2, r1: k.aussen + 20 });
        // Uferstück einer Wasserbrücke (vom Ende bis zum Wasser, höchstens 45 m): das Gelände folgt dem Deck. Vorher galt nur die Höhe am Ende, bei
        // verschieden hohen Ufern lag das Deck am Wasser bis 0,9 m unter dem angeglichenen Gelände (Stufe auf der Gertraudenbrücke, 18.11.2026)
        if (k.ueber) continue; const d = e ? -1 : 1;
        for (let i = e + d, n = 0; i > 0 && i < N - 1 && n < 9 && !this.wasser(k.x[i], k.z[i]) && k.y[i] - k.g[i] < 1.2; i += d, n++) out.push({ x: k.x[i], z: k.z[i], y: k.y[i] - 0.32, r0: k.aussen + 2, r1: k.aussen + 14 }); } }   // 32 cm unter dem Deck: Gehweg und Grünflächen liegen 12 cm über dem Gelände und deckten das Deck sonst zu (Gertraudenbrücke live, 19.11.2026)
    return out; }
  // Nächster Punkt einer Kette zu (x, z): Abstand, Höhe, Richtung. jenseits: der Punkt liegt hinter einem Ende der Kette (nicht daneben)
  naechst(m, x, z) {
    let bd = Infinity, r = null; const N = m.x.length;
    for (let i = 1; i < N; i++) { const ax = m.x[i - 1], az = m.z[i - 1], dx = m.x[i] - ax, dz = m.z[i] - az, q = dx * dx + dz * dz; if (q <= 0) continue; const t0 = ((x - ax) * dx + (z - az) * dz) / q, t = Math.min(1, Math.max(0, t0)), px = ax + dx * t, pz = az + dz * t, d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < bd) { bd = d; const l = Math.sqrt(q); r = { i, t, x: px, z: pz, tx: dx / l, tz: dz / l, y: m.y[i - 1] + (m.y[i] - m.y[i - 1]) * t, jenseits: (i === 1 && t0 < -1.5 / l) || (i === N - 1 && t0 > 1 + 1.5 / l) }; } }
    if (r) r.d = Math.sqrt(bd); return r;
  }
  // Geschwister (Wunsch Nr. 106, 18.11.2026, Nader: "Fast alle Brücken sind immer noch kaputt"): die Karte führt große Brücken als mehrere
  // Linien nebeneinander (je Fahrtrichtung eine, dazu Rad und Fußwege). Jede Linie wurde eine eigene Brücke mit eigener Höhe und eigenem
  // Geländer: Stufen zwischen den Fahrbahnen und Geländer quer über der Nachbarspur (Warschauer Brücke: 58 Wände auf den Spuren, Oberbaumbrücke:
  // 1,3 m Stufen). Jetzt: Ketten, die nebeneinander laufen (Abstand der Ränder bis 3 m, fast parallel), sind ein Bauwerk. Gleiche Höhe an
  // gleicher Stelle (die niedrigere gilt), zur Nachbarin hin kein Geländer und keine Seitenwand, die Lücke dazwischen wird Deck (extL, extR)
  geschwister() {
    const K = this.ketten, LUECKE = 3;
    for (const k of K) { const N = k.x.length; k.innL = new Uint8Array(N); k.innR = new Uint8Array(N); k.extL = new Float32Array(N); k.extR = new Float32Array(N); k.nb = null; k.extMax = 0;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 0; i < N; i++) { x0 = Math.min(x0, k.x[i]); x1 = Math.max(x1, k.x[i]); z0 = Math.min(z0, k.z[i]); z1 = Math.max(z1, k.z[i]); } k.box = [x0, z0, x1, z1]; }
    if (K.length < 2) return;
    for (const k of K) { const N = k.x.length;
      for (const m of K) { if (m === k) continue; const r = k.aussen + m.aussen + LUECKE; if (k.box[0] > m.box[2] + r || k.box[2] < m.box[0] - r || k.box[1] > m.box[3] + r || k.box[3] < m.box[1] - r) continue;
        for (let i = 0; i < N; i++) {
          const q = this.naechst(m, k.x[i], k.z[i]); if (!q || q.jenseits || q.d > r) continue;
          const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1); let tx = k.x[b] - k.x[a], tz = k.z[b] - k.z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          if (Math.abs(tx * q.tx + tz * q.tz) < 0.82) continue;   // kreuzt statt zu begleiten
          if (Math.abs(q.y - k.y[i]) > 2.5) continue;   // andere Ebene (niedriger Steg neben hoher Brücke): kein gemeinsames Bauwerk
          (k.nb ||= Array.from({ length: N }, () => null)); (k.nb[i] ||= []).push({ m, i: q.i, t: q.t });
          const o = (q.x - k.x[i]) * -tz + (q.z - k.z[i]) * tx; if (Math.abs(o) < 0.5) continue;   // liegt aufeinander: nur die Höhe angleichen
          const ext = Math.min(LUECKE / 2, Math.max(0, (Math.abs(o) - k.aussen - m.aussen) / 2)) + 0.04;
          if (o > 0) { k.innL[i] = 1; k.extL[i] = Math.max(k.extL[i], ext); } else { k.innR[i] = 1; k.extR[i] = Math.max(k.extR[i], ext); } k.extMax = Math.max(k.extMax, ext);
        } } }
    // Gleiche Höhe an gleicher Stelle: jede Gruppe von Geschwistern hat ein Hauptteil (die breiteste und längste Fahrbahn), die anderen folgen
    // seiner Höhe. An ihren eigenen Enden treffen sie auf 25 m verzogen wieder ihr eigenes Ufer. (Erster Anlauf am 18.11.2026: überall die
    // niedrigere Höhe. Das zog das Deck am Brückenende bis 1,1 m unter die Straße, weil die Ufer im Höhenmodell je Teil verschieden hoch liegen)
    { const G = new Map(K.map(k => [k, k])), wurzel = k => { while (G.get(k) !== k) k = G.get(k); return k; };
      for (const k of K) if (k.nb) for (const L of k.nb) if (L) for (const { m } of L) { const a = wurzel(k), b = wurzel(m); if (a !== b) G.set(a, b); }
      const gruppen = new Map(); for (const k of K) { const w = wurzel(k); (gruppen.get(w) || gruppen.set(w, []).get(w)).push(k); }
      for (const T of gruppen.values()) { if (T.length < 2) continue; const wert = k => (k.fuss ? 0 : 1e6) + k.w * k.L, haupt = T.reduce((a, b) => wert(b) > wert(a) ? b : a);
        for (const k of T) { if (k === haupt || !k.nb) continue; const N = k.x.length, y0 = Array.from(k.y), fest = new Uint8Array(N);
          for (let i = 0; i < N; i++) { const q = k.nb[i]?.find(e => e.m === haupt); if (q) { k.y[i] = haupt.y[q.i - 1] + (haupt.y[q.i] - haupt.y[q.i - 1]) * q.t; fest[i] = 1; } }
          // Stücke ohne Verbindung zum Hauptteil (vor seinem Anfang, hinter seinem Ende): eigene Höhe, am Übergang um den Unterschied verschoben und auf 25 m verzogen
          for (let i = 0; i < N; i++) { if (fest[i]) continue; let j = -1, dj = Infinity; for (let c = 0; c < N; c++) if (fest[c] && Math.abs(k.s[c] - k.s[i]) < dj) { dj = Math.abs(k.s[c] - k.s[i]); j = c; } if (j >= 0) k.y[i] = y0[i] + (k.y[j] - y0[j]) * (1 - glatt(dj / 25)); }
          // Enden auf das eigene Ufer (geschlossene Enden: die eigene Höhe am Ende war die des Bodens)
          for (const e of [0, N - 1]) { if (k.offenEnde?.[e ? 1 : 0]) continue; if ([0, haupt.x.length - 1].some(f => Math.hypot(haupt.x[f] - k.x[e], haupt.z[f] - k.z[e]) < 30)) continue;   // endet neben dem Hauptteil: seine Höhe gilt, das Gelände am Brückenkopf richtet sich nach der Brücke (koepfe)
            const d = y0[e] - k.y[e]; if (Math.abs(d) < 0.01) continue; const D = Math.min(25, k.L / 2); for (let i = 0; i < N; i++) { const u = Math.abs(k.s[i] - k.s[e]) / D; if (u < 1) k.y[i] += d * (1 - glatt(u)); } }
          if (k.ueber) for (let i = 0; i < N; i++) k.y[i] = Math.max(k.g[i], k.y[i]);
        } } }
    // Stoß: zwei Stücke derselben Brücke treffen sich Ende an Ende (über dem Wasser oder am Rand): gleiche Höhe am Stoß, auf 40 m verzogen
    for (const k of K) { if (k.ueber) continue; for (const e of [0, k.x.length - 1]) for (const m of K) { if (m === k || m.ueber) continue; for (const f of [0, m.x.length - 1]) { if (Math.hypot(k.x[e] - m.x[f], k.z[e] - m.z[f]) > 2.5) continue; const yJ = Math.max(k.y[e], m.y[f]);
      for (const [c, j] of [[k, e], [m, f]]) { const d = yJ - c.y[j]; if (Math.abs(d) < 0.01) continue; const D = Math.min(40, c.L * 0.6), sJ = c.s[j]; for (let i = 0; i < c.x.length; i++) { const u = Math.abs(c.s[i] - sJ) / D; if (u < 1) c.y[i] += d * (1 - glatt(u)); } } } } }
    // einzelne Lücken in der Kennung schließen (ein Abtastpunkt ohne Nachbarin zwischen zweien mit): sonst stünde dort ein kurzes Stück Geländer
    for (const k of K) for (const A of [k.innL, k.innR]) for (let i = 1; i < A.length - 1; i++) if (!A[i] && A[i - 1] && A[i + 1]) A[i] = 1;
  }
  // nurFest: Stücke ohne Raum darunter (Brücken über Wasser, Rampen), nicht der offene Brückenteil über Straße, Gleis oder Weg
  deck(x, z, nurFest = false, alle = null) {   // alle: Liste, in die jede Deckhöhe an der Stelle kommt (Hz wählt daraus)
    const l = this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)); if (!l) return null; let best = null, ersatz = null, eD = Infinity;
    // Höhe genau unter dem Punkt: nur Abschnitte, auf die er senkrecht fällt. Bis Nr. 106 zählte jeder Abschnitt im Umkreis mit seinem nächsten
    // Ende, das Höchste gewann: auf Rampen sprang die Höhe in Sägezähnen um bis zu Umkreis mal Steigung (Warschauer Brücke: 0,5 m alle 5 m).
    // Fällt der Punkt auf keinen Abschnitt senkrecht (außen an einem Knick, hinter dem Ende), gilt der nächste
    for (const { k, i } of l) { if (nurFest && k.offen && k.offen[i - 1] && k.offen[i]) continue; const ax = k.x[i - 1], az = k.z[i - 1], dx = k.x[i] - ax, dz = k.z[i] - az, q = dx * dx + dz * dz, t0 = q > 0 ? ((x - ax) * dx + (z - az) * dz) / q : 0, t = Math.min(1, Math.max(0, t0)), px = ax + dx * t - x, pz = az + dz * t - z;
      let h = k.halb + (alle ? 1.3 : 0); if (k.extMax) { const links = px * dz - pz * dx > 0, E = links ? k.extL : k.extR; h += Math.max(E[i - 1], E[i]); }   // zur Nachbarin hin reicht das Deck bis zur Mitte der Lücke. Mit letzter Höhe (alle) 1,3 m Spielraum: Spuren breiter Straßen liegen manchmal knapp neben dem Deck aus der Kartenbreite, wer oben ist, bleibt dort oben
      const d2 = px * px + pz * pz; if (d2 > h * h) continue; const y = k.y[i - 1] + (k.y[i] - k.y[i - 1]) * t;
      if (t0 > -0.02 && t0 < 1.02) { if (best === null || y > best) best = y; if (alle) alle.push(y); } else if (d2 < eD) { eD = d2; ersatz = y; } }
    if (alle && !alle.length && ersatz !== null) alle.push(ersatz);
    return best ?? ersatz;
  }
  // Unterkante des tiefsten Bauwerks über dem Punkt (Ausflugsschiffe, kit/flussschiffe.js), sonst null. Steinbögen: der Bogen reicht tiefer als der Scheitel
  unterkante(x, z) {
    const l = this.zellen.get(Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE)); if (!l) return null; let best = null;
    for (const { k, i } of l) { const ax = k.x[i - 1], az = k.z[i - 1], dx = k.x[i] - ax, dz = k.z[i] - az, q = dx * dx + dz * dz, t = q > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / q)) : 0, px = ax + dx * t - x, pz = az + dz * t - z; if (px * px + pz * pz > (k.halb + 1.5) * (k.halb + 1.5)) continue;
      const u = k.y[i - 1] + (k.y[i] - k.y[i - 1]) * t - (k.art === 'stein' ? 1.5 : k.fuss ? 0.6 : Math.min(2.4, 0.75 + k.L * 0.005)); if (best === null || u < best) best = u; }
    return best;
  }
  // Kollision (kit/collision.js) bei Brücken über Verkehr: Damm der Rampen von der Seite und von unten, Pfeiler, oben das Geländer. y: Höhe der Füße
  blockiert(x, z, y) {
    if (y === undefined) return false;
    const key = Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE);
    for (const [px, pz, r, yT] of this.pfeiler.get(key) || []) if (y < yT && (x - px) * (x - px) + (z - pz) * (z - pz) < r * r) return true;
    const l = this.zellen.get(key); if (!l) return false;
    // Seit Nr. 106 für alle Brücken (vorher lagen die Geländer der Brücken über Wasser als Flächen ohne Höhe in der Kollision: unsichtbare Wand
    // für alle, die unten am Ufer entlang oder neben der Rampe fuhren). Geländer nur außen: zur Nachbarin hin (Geschwister) ist das Deck offen
    let gel = false, damm = false, aufDeck = false;
    for (const { k, i } of l) {
      const ax = k.x[i - 1], az = k.z[i - 1], dx = k.x[i] - ax, dz = k.z[i] - az, q = dx * dx + dz * dz, t0 = q > 0 ? ((x - ax) * dx + (z - az) * dz) / q : 0, t = Math.min(1, Math.max(0, t0)), px = ax + dx * t - x, pz = az + dz * t - z, d = Math.hypot(px, pz);
      if (d > k.aussen + 0.5 || t0 < -0.06 || t0 > 1.06) continue;   // nur Abschnitte genau neben oder unter dem Punkt (sonst gälte auf Rampen die Höhe weiter vorn)
      const yD = k.y[i - 1] + (k.y[i] - k.y[i - 1]) * t, gD = k.g[i - 1] + (k.g[i] - k.g[i - 1]) * t, fest = !!k.ueber && !(k.offen[i - 1] && k.offen[i]);
      if (d <= k.aussen + 0.05) { if (Math.abs(y - yD) < 0.75) aufDeck = true; else if (fest && yD - gD > 0.6 && y < yD - 0.6 && y > gD - 1) damm = true; }   // Damm der Rampe, nicht für den, der darunter im Trog oder Tunnel fährt
      else if (yD - gD > 0.9 && Math.abs(y - yD) < 1.5) { const links = px * dz - pz * dx > 0, I = links ? k.innL : k.innR; if (!(I[i - 1] || I[i])) gel = true; }   // Geländerstreifen, solange man oben ist
    }
    return aufDeck ? false : damm || gel;   // wer auf einem Deck steht, steht weder im Damm noch im Geländer der Nachbarin
  }
  // Brücke über Straße, Gleis oder Weg (Nr. 95, Ausgabe von kit/brueckenbau.js): über jeder Kreuzung die Durchfahrtshöhe, Plateau über der Breite des
  // Unteren, außen fallend mit höchstens 6 % (im Notfall 10 %, sonst wird die Durchfahrt niedriger), an den Enden der Rampen wieder Boden
  ketteUeber(b, halb) {
    const X = [], Z = []; for (let i = 1; i < b.p.length; i++) { const [ax, az] = b.p[i - 1], [bx, bz] = b.p[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 5)); for (let j = i === 1 ? 0 : 1; j <= n; j++) { X.push(ax + (bx - ax) * j / n); Z.push(az + (bz - az) * j / n); } }
    if (X.length < 3) return null; const N = X.length, S = new Float64Array(N); for (let i = 1; i < N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); const L = S[N - 1]; if (L < 10) return null;
    const G = Array.from({ length: N }, (_, i) => this.land(X[i], Z[i]));   // Gelände, nicht der Wasserspiegel: eine Brücke über Straße und Kanal tauchte am Ende über dem Wasser bis zum Pegel ab (Hallesches Tor, Nr. 106)
    const sVon = (x, z) => { let best = 0, bd = Infinity; for (let i = 1; i < N; i++) { const ax = X[i - 1], az = Z[i - 1], dx = X[i] - ax, dz = Z[i] - az, q = dx * dx + dz * dz, t = q > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / q)) : 0, px = ax + dx * t - x, pz = az + dz * t - z, d = px * px + pz * pz; if (d < bd) { bd = d; best = S[i - 1] + (S[i] - S[i - 1]) * t; } } return { s: best, d: Math.sqrt(bd) }; };
    const xs = (b.x || []).map(([x, z, klar, aus]) => { const r = sVon(x, z); return r.d < 3 ? { s: r.s, y: Math.max(this.Hg(x, z), this.deck(x, z) ?? -Infinity) + klar, pl: aus || 6 } : null; }).filter(Boolean).sort((a, c) => a.s - c.s);   // über einer tieferen Brücke deren Deck
    const kern = (b.k || []).map(([x, z]) => sVon(x, z)).filter(r => r.d < 3).map(r => r.s); let kA = 0, kB = L;
    if (kern.length >= 2) { kA = Math.min(...kern); kB = Math.max(...kern); } else if (kern.length === 1 && xs.length) { if (xs[0].s >= kern[0]) kA = kern[0]; else kB = kern[0]; }
    const rand = (x, z) => Math.abs(x) > halb - 1 || Math.abs(z) > halb - 1, aR = rand(X[0], Z[0]), bR = rand(X[N - 1], Z[N - 1]), Y = new Float32Array(N), offen = new Uint8Array(N);
    let steig = 0.06;
    if (!xs.length) for (let i = 0; i < N; i++) Y[i] = G[i];   // Kreuzung außerhalb des Ortes: flach, die Fahrbahn bleibt sichtbar
    else {
      const weit = (c, s) => Math.max(0, Math.abs(s - c.s) - c.pl);   // Abstand außerhalb des Plateaus
      let noetig = 0; for (const c of xs) { if (!aR) noetig = Math.max(noetig, (c.y - G[0]) / Math.max(1, weit(c, 0))); if (!bR) noetig = Math.max(noetig, (c.y - G[N - 1]) / Math.max(1, weit(c, L))); }
      if (noetig > steig) steig = Math.min(0.10, noetig);
      for (const c of xs) { if (!aR) c.y = Math.min(c.y, G[0] + steig * weit(c, 0)); if (!bR) c.y = Math.min(c.y, G[N - 1] + steig * weit(c, L)); }
      for (let i = 0; i < N; i++) { const s = S[i]; let y = -1e9; for (const c of xs) y = Math.max(y, c.y - steig * weit(c, s)); for (let j = 1; j < xs.length; j++) if (s >= xs[j - 1].s && s <= xs[j].s) { const t = (s - xs[j - 1].s) / Math.max(0.01, xs[j].s - xs[j - 1].s); y = Math.max(y, xs[j - 1].y + (xs[j].y - xs[j - 1].y) * t); } Y[i] = Math.max(G[i], y); }
      for (let p = 0; p < 3; p++) { const Y2 = Y.slice(); for (let i = 1; i < N - 1; i++) Y2[i] = (Y[i - 1] + 2 * Y[i] + Y[i + 1]) / 4; for (let i = 1; i < N - 1; i++) Y[i] = Math.max(G[i], Y2[i]); }   // Kuppe und Fuß weich
    }
    for (let i = 0; i < N; i++) offen[i] = S[i] >= kA - 0.01 && S[i] <= kB + 0.01 ? 1 : 0;
    const w = Math.max(5, b.w), geh = w >= 7 ? 1.9 : 1.1;
    return { x: X, z: Z, y: Y, s: S, g: G, L, w, geh, halb: w / 2 + geh + 0.2, fuss: false, art: 'balken', aussen: w / 2 + geh, ueber: b.ueber, offen, kA, kB, steig };
  }
  // Linie alle 5 m abtasten, Höhe festlegen
  kette(b, halb) {
    const X = [], Z = []; for (let i = 1; i < b.p.length; i++) { const [ax, az] = b.p[i - 1], [bx, bz] = b.p[i], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 5)); for (let j = i === 1 ? 0 : 1; j <= n; j++) { X.push(ax + (bx - ax) * j / n); Z.push(az + (bz - az) * j / n); } }
    if (X.length < 3) return null; const N = X.length, S = new Float64Array(N); for (let i = 1; i < N; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); const L = S[N - 1]; if (L < 10) return null;
    const G = Array.from({ length: N }, (_, i) => this.Hg(X[i], Z[i])), tief = Math.min(...G), fuss = b.hw === 'fuss', steig = fuss ? 0.075 : 0.055, rand = (x, z) => Math.abs(x) > halb - 1 || Math.abs(z) > halb - 1, aR = rand(X[0], Z[0]), bR = rand(X[N - 1], Z[N - 1]), mitten = (i, j) => { if (!this.wasser(X[i], Z[i])) return false; const dx = X[i] - X[j], dz = Z[i] - Z[j], l = Math.hypot(dx, dz) || 1; return this.wasser(X[i] + dx / l * 8, Z[i] + dz / l * 8); }, oA = aR || mitten(0, 1), oB = bR || mitten(N - 1, N - 2), yA = oA ? null : Math.max(G[0], this.land(X[0], Z[0])), yB = oB ? null : Math.max(G[N - 1], this.land(X[N - 1], Z[N - 1]));   // Ende mitten über dem Wasser (Brücke aus mehreren Stücken): offen, die Höhe gleicht geschwister() am Stoß an   // Enden auf dem Ufer, auch wenn die Linie schon über dem Wasser beginnt (Nr. 106)
    // Über einem Gewässer mit festem Pegel (kit/ort.js pegelBauen, Nr. 106) liegt das Wasser tief im Bett: die Brücke bleibt flach auf Uferhöhe mit
    // leichtem Stich, nur wenn das Ufer niedrig ist, hebt sie sich für die Durchfahrt (3,8 m über dem Wasser, Fußgängerbrücken 3,3 m)
    let pegelFest = false; for (let i = 0; i < N && !pegelFest; i++) pegelFest = this.wasser(X[i], Z[i]);
    let yD = pegelFest ? Math.max(Math.max(yA ?? -1e9, yB ?? -1e9) + Math.min(0.5, L * 0.004), tief + (fuss ? 3.2 : 3.9))   // Durchfahrt für die Ausflugsschiffe (kit/flussschiffe.js: 2,2 m hoch, Überbau rund 1 m)
      : Math.max(tief + (fuss ? THREE.MathUtils.clamp(1.8 + L * 0.02, 2.6, 8) : THREE.MathUtils.clamp(3 + L * 0.035, 5, 24)), Math.max(yA ?? -1e9, yB ?? -1e9) + Math.min(1.5, L * 0.012));
    if (yA !== null && yB !== null) yD = Math.max(Math.max(yA, yB) + 0.25, Math.min(yD, (0.62 * L * steig + yA + yB) / 2)); else if (yA !== null || yB !== null) { const e = yA ?? yB; yD = Math.max(e + 0.25, Math.min(yD, e + 0.62 * L * steig)); }
    if (yA === null && yB === null && pegelFest) { let l = -1e9; for (let i = 0; i < N; i++) if (!this.wasser(X[i], Z[i])) l = Math.max(l, this.land(X[i], Z[i])); if (l > -1e8) yD = Math.max(yD, l + 0.25); }   // beide Enden am Rand des Ausschnitts: Höhe vom Ufer dazwischen
    const ra = yA === null ? 0 : (yD - yA) / steig * 1.45, rb = yB === null ? 0 : (yD - yB) / steig * 1.45, Y = new Float32Array(N);
    for (let i = 0; i < N; i++) { const s = S[i]; let y = yD; if (ra > 0 && s < ra) y = yA + (yD - yA) * glatt(s / ra); if (rb > 0 && L - s < rb) y = Math.min(y, yB + (yD - yB) * glatt((L - s) / rb)); Y[i] = y; }
    // Ufer verschieden hoch und die Brücke zu kurz für beide Rampen: die Rampe vom tiefen Ufer zog das Deck am hohen Ufer bis 2,4 m unter die Straße
    // (Gertraudenbrücke, 18.11.2026). Das Deck liegt nie unter der Verbindung beider Ufer (halb gerade, halb weich, an den Enden genau auf Uferhöhe)
    if (yA !== null && yB !== null) for (let i = 0; i < N; i++) { const t = S[i] / L; Y[i] = Math.max(Y[i], yA + (yB - yA) * (0.5 * t + 0.5 * glatt(t))); }
    const w = Math.max(fuss ? 3.2 : 5, b.w), geh = fuss ? 0 : w >= 7 ? 1.9 : 1.1, h = (Math.imul(Math.round(X[0] * 3), 73856093) ^ Math.imul(Math.round(Z[0] * 3), 19349663)) >>> 0, z01 = (h % 1000) / 1000;
    const art = !fuss && L > 520 && w >= 7 ? 'seil' : L < 300 && (this.altStadt ? z01 < 0.72 : z01 < 0.1) ? 'stein' : 'balken';
    return { x: X, z: Z, y: Y, s: S, g: G, L, w, geh, halb: w / 2 + geh + 0.2, fuss, art, aussen: w / 2 + geh, offenEnde: [oA, oB] };
  }
}

// Sammler je Material
class Teil { constructor() { this.pos = []; this.nor = []; this.uv = []; }
  quad(a, b, c, d, ua, ub, uc, ud) { const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2]; let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; for (const [q, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { this.pos.push(q[0], q[1], q[2]); this.nor.push(nx, ny, nz); this.uv.push(u[0], u[1]); } }
  geo() { if (!this.pos.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); return g; }
}
const uvXZ = p => [p[0], p[2]];
// Baut alle Brücken eines Ortes: Fahrbahn, Gehwege, Geländer, Pfeiler. M: Materialien des Ortes, rails kommt in die Kollision
export function brueckenBauen(feld, M, { mobil = false, regel = null } = {}) {
  const pfeilerListe = [], r2p = v => Math.round(v * 100) / 100;
  const T = { fahr: new Teil(), geh: new Teil(), beton: new Teil(), stein: new Teil(), stahl: new Teil(), seil: new Teil(), mark: new Teil() }, rails = [], Hg = feld.Hg;
  const pfeilerFest = (x, z, r, yT) => { const key = Math.floor(x / ZELLE) * 100003 + Math.floor(z / ZELLE), rr = Math.ceil(r / ZELLE); for (let a = -rr; a <= rr; a++) for (let c = -rr; c <= rr; c++) { const k2 = key + a * 100003 + c; (feld.pfeiler.get(k2) || feld.pfeiler.set(k2, []).get(k2)).push([x, z, r, yT]); } };   // Pfeiler über Verkehr sind fest (Kollision)
  for (const k of feld.ketten) {
    const N = k.x.length, tx = new Float32Array(N), tz = new Float32Array(N); for (let i = 0; i < N; i++) { const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1), dx = k.x[b] - k.x[a], dz = k.z[b] - k.z[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
    const P = (i, o, dy = 0) => [k.x[i] - tz[i] * o, k.y[i] + dy, k.z[i] + tx[i] * o];   // o: seitlich, positiv links der Fahrtrichtung
    const hw = k.w / 2, au = k.aussen, dicke = k.art === 'stein' ? 0.9 : k.fuss ? 0.6 : Math.min(2.4, 0.75 + k.L * 0.005), hoch = i => k.y[i] - k.g[i];
    for (let i = 1; i < N; i++) {
      const a = i - 1, b = i, sa = k.s[a], sb = k.s[b];
      // Geschwister (Nr. 106): zur Nachbarin hin kein Geländer und keine Seitenwand, der Gehweg reicht bis zur Mitte der Lücke. s = 1 links, -1 rechts
      const innen = s => s > 0 ? !!(k.innL[a] && k.innL[b]) : !!(k.innR[a] && k.innR[b]), ext = s => innen(s) ? Math.max(s > 0 ? k.extL[a] : k.extR[a], s > 0 ? k.extL[b] : k.extR[b]) : 0;
      // Fahrbahn (oder Gehfläche), Gehwege mit Bordstein
      if (k.fuss) { const p = [P(a, -hw, 0.02), P(b, -hw, 0.02), P(b, hw, 0.02), P(a, hw, 0.02)]; T.geh.quad(p[0], p[3], p[2], p[1], uvXZ(p[0]), uvXZ(p[3]), uvXZ(p[2]), uvXZ(p[1])); }
      else {
        const p = [P(a, -hw, 0.02), P(b, -hw, 0.02), P(b, hw, 0.02), P(a, hw, 0.02)]; T.fahr.quad(p[0], p[3], p[2], p[1], uvXZ(p[0]), uvXZ(p[3]), uvXZ(p[2]), uvXZ(p[1]));
        for (const s of [-1, 1]) { const o0 = s * hw, o1 = s * (au + ext(s)), q = [P(a, o0, 0.17), P(b, o0, 0.17), P(b, o1, 0.17), P(a, o1, 0.17)]; if (s > 0) T.geh.quad(q[0], q[3], q[2], q[1], uvXZ(q[0]), uvXZ(q[3]), uvXZ(q[2]), uvXZ(q[1])); else T.geh.quad(q[0], q[1], q[2], q[3], uvXZ(q[0]), uvXZ(q[1]), uvXZ(q[2]), uvXZ(q[3]));
          const c = [P(a, o0, 0.02), P(b, o0, 0.02), P(b, o0, 0.17), P(a, o0, 0.17)]; if (s > 0) T.geh.quad(c[0], c[1], c[2], c[3], [sa, 0], [sb, 0], [sb, 0.15], [sa, 0.15]); else T.geh.quad(c[0], c[3], c[2], c[1], [sa, 0], [sa, 0.15], [sb, 0.15], [sb, 0]); }
      }
      const obenY = k.fuss ? 0.02 : 0.17, hoehe = Math.min(hoch(a), hoch(b)), stoff = k.art === 'stein' ? T.stein : T.beton;
      // Seiten und Unterseite (Steinbögen legt die Spannweite unten eigene Flächen an). Rampen der Brücken über Verkehr (Nr. 95): Stützmauern bis in den
      // Boden, der Damm dazwischen ist voll (keine Unterseite)
      if (k.ueber && !(k.offen[a] && k.offen[b])) { if (Math.max(hoch(a), hoch(b)) > 0.12) for (const s of [-1, 1]) { if (innen(s)) continue; const o = s * au, q = [P(a, o, k.g[a] - k.y[a] - 0.4), P(b, o, k.g[b] - k.y[b] - 0.4), P(b, o, obenY), P(a, o, obenY)]; if (s < 0) stoff.quad(q[0], q[3], q[2], q[1], [sa, q[0][1]], [sa, q[3][1]], [sb, q[2][1]], [sb, q[1][1]]); else stoff.quad(q[0], q[1], q[2], q[3], [sa, q[0][1]], [sb, q[1][1]], [sb, q[2][1]], [sa, q[3][1]]); } }
      else if (k.art !== 'stein') { for (const s of [-1, 1]) { if (innen(s)) continue; const o = s * au, q = [P(a, o, -dicke), P(b, o, -dicke), P(b, o, obenY), P(a, o, obenY)]; if (s < 0) stoff.quad(q[0], q[3], q[2], q[1], [sa, 0], [sa, dicke], [sb, dicke], [sb, 0]); else stoff.quad(q[0], q[1], q[2], q[3], [sa, 0], [sb, 0], [sb, dicke], [sa, dicke]); }
        const uR = -(au + ext(-1)), uL = au + ext(1), u = [P(a, uR, -dicke), P(b, uR, -dicke), P(b, uL, -dicke), P(a, uL, -dicke)]; stoff.quad(u[0], u[1], u[2], u[3], uvXZ(u[0]), uvXZ(u[1]), uvXZ(u[2]), uvXZ(u[3])); }
      // Leitlinie in der Mitte: 3 m Strich, 6 m Lücke (wie am Boden)
      if (!k.fuss && k.w >= 6) for (let a0 = Math.floor(sa / 9) * 9; a0 < sb; a0 += 9) { const s0 = Math.max(a0, sa), s1 = Math.min(a0 + 3, sb); if (s1 - s0 < 0.2) continue; const f0 = (s0 - sa) / (sb - sa), f1 = (s1 - sa) / (sb - sa), Lp = (f, o) => { const A = P(a, o, 0.035), B = P(b, o, 0.035); return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]; }, m = 0.07, q = [Lp(f0, -m), Lp(f1, -m), Lp(f1, m), Lp(f0, m)]; T.mark.quad(q[0], q[3], q[2], q[1], [0, 0], [1, 0], [1, 1], [0, 1]); }
      // Geländer, wo es hinunter geht
      if (hoehe > 0.9) for (const s of [-1, 1]) {
        if (innen(s)) continue;
        const o = s * (au - 0.04);
        if (k.art === 'stein') { const d = 0.28, i0 = o - s * d, q1 = [P(a, o, obenY), P(b, o, obenY), P(b, o, 1.05), P(a, o, 1.05)], q2 = [P(a, i0, obenY), P(b, i0, obenY), P(b, i0, 1.05), P(a, i0, 1.05)], q3 = [P(a, i0, 1.05), P(b, i0, 1.05), P(b, o, 1.05), P(a, o, 1.05)];
          if (s > 0) { T.stein.quad(q1[0], q1[1], q1[2], q1[3], [sa, 0], [sb, 0], [sb, 1], [sa, 1]); T.stein.quad(q2[0], q2[3], q2[2], q2[1], [sa, 0], [sa, 1], [sb, 1], [sb, 0]); T.stein.quad(q3[0], q3[3], q3[2], q3[1], [sa, 0], [sa, 0.3], [sb, 0.3], [sb, 0]); } else { T.stein.quad(q1[0], q1[3], q1[2], q1[1], [sa, 0], [sa, 1], [sb, 1], [sb, 0]); T.stein.quad(q2[0], q2[1], q2[2], q2[3], [sa, 0], [sb, 0], [sb, 1], [sa, 1]); T.stein.quad(q3[0], q3[1], q3[2], q3[3], [sa, 0], [sb, 0], [sb, 0.3], [sa, 0.3]); } }
        else { // Handlauf und Stäbe
          for (const hR of [1.08, 0.62]) { const r = 0.035; for (const [d1, d2] of [[0, r], [r, 0]]) { const q = [P(a, o - s * d1, obenY + hR - d2), P(b, o - s * d1, obenY + hR - d2), P(b, o + s * d1, obenY + hR + d2), P(a, o + s * d1, obenY + hR + d2)]; T.stahl.quad(q[0], q[1], q[2], q[3], [0, 0], [1, 0], [1, 1], [0, 1]); T.stahl.quad(q[0], q[3], q[2], q[1], [0, 0], [0, 1], [1, 1], [1, 0]); } }
          if (!mobil) for (let j = 0; j < 2; j++) { const f = j / 2, x = k.x[a] + (k.x[b] - k.x[a]) * f - tz[a] * o, z = k.z[a] + (k.z[b] - k.z[a]) * f + tx[a] * o, y = k.y[a] + (k.y[b] - k.y[a]) * f + obenY, r = 0.03; T.stahl.quad([x - tx[a] * r, y, z - tz[a] * r], [x + tx[a] * r, y, z + tz[a] * r], [x + tx[a] * r, y + 1.08, z + tz[a] * r], [x - tx[a] * r, y + 1.08, z - tz[a] * r], [0, 0], [1, 0], [1, 1], [0, 1]); T.stahl.quad([x - tx[a] * r, y, z - tz[a] * r], [x - tx[a] * r, y + 1.08, z - tz[a] * r], [x + tx[a] * r, y + 1.08, z + tz[a] * r], [x + tx[a] * r, y, z + tz[a] * r], [0, 0], [0, 1], [1, 1], [1, 0]); }
        }
        // Kollision: dünner Streifen, nicht hinunterfallen
        // Kollision: seit Nr. 106 für alle Brücken nach Höhe (BrueckenFeld.blockiert). Vorher lagen die Geländer der Wasserbrücken als Flächen ohne Höhe in der Kollision und standen unten am Ufer als unsichtbare Wand
      }
    }
    // Pfeiler
    const prisma = (t, x, z, ax, az, halbQ, halbL, y0, y1, spitz) => { // ax, az: Richtung quer zur Brücke (entlang der Pfeilerwand); Grundriss als Sechseck mit Spitzen quer zum Wasser
      const lx = az, lz = -ax, ring = spitz > 0 ? [[-halbQ - spitz, 0], [-halbQ, -halbL], [halbQ, -halbL], [halbQ + spitz, 0], [halbQ, halbL], [-halbQ, halbL]] : [[-halbQ, -halbL], [halbQ, -halbL], [halbQ, halbL], [-halbQ, halbL]], n = ring.length, W = ring.map(([q, l]) => [x + ax * q + lx * l, z + az * q + lz * l]);
      for (let i = 0; i < n; i++) { const a = W[i], b = W[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); t.quad([a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], [0, y0], [0, y1], [L, y1], [L, y0]); }
      t.quad([W[0][0], y1, W[0][1]], [W[n - 1][0], y1, W[n - 1][1]], [W[n >> 1][0], y1, W[n >> 1][1]], [W[1][0], y1, W[1][1]], [0, 0], [1, 0], [1, 1], [0, 1]);
    };
    // Brücken über Verkehr (Nr. 95): Pfeiler nur unter dem Brückenteil (zwischen den Widerlagern), Spannweite rund 34 m
    const s0K = k.ueber ? k.kA : 0, s1K = k.ueber ? k.kB : k.L, Lk = s1K - s0K;
    const span = k.ueber ? 34 : k.art === 'stein' ? THREE.MathUtils.clamp(k.L / 5, 14, 34) : k.fuss ? 30 : THREE.MathUtils.clamp(k.L / 6, 34, 72), nS = Math.max(1, Math.round(Lk / span)), iBei = s => { let i = 0; while (i < N - 1 && k.s[i] < s) i++; return i; }, piers = [];
    for (let j = 1; j < nS; j++) { const i0 = iBei(s0K + j * Lk / nS); if (!regel) { piers.push(i0); continue; }   // feste Regel (kit/stuetzen.js, Nr. 98): nie auf Fahrbahn, Weg oder Gleis, sonst bis 12 m verschieben oder weglassen
      const rP = Math.min(4, au * 0.9); let best = null; for (let d = 0; d < N && best === null; d++) for (const i1 of d ? [i0 + d, i0 - d] : [i0]) { if (i1 < 1 || i1 > N - 2 || Math.abs(k.s[i1] - k.s[i0]) > 12 || k.s[i1] < s0K + 3 || k.s[i1] > s1K - 3) continue; if (regel.frei(k.x[i1], k.z[i1], rP)) { best = i1; break; } }
      if (best !== null) { piers.push(best); regel.zahl.gesetzt++; if (best !== i0) regel.zahl.verschoben++; } else regel.zahl.entfallen++; }
    if (k.art === 'seil') { /* Pylone weiter unten */ }
    for (const i of piers) { const y1 = k.y[i] - dicke, g0 = Hg(k.x[i], k.z[i]), y0 = g0 - 4; if (y1 - g0 < 1.3) continue; const ax = -tz[i], az = tx[i], x = k.x[i], z = k.z[i]; pfeilerListe.push([r2p(x), r2p(z), Math.min(4, au * 0.9)]);
      if (k.art === 'stein') prisma(T.stein, x, z, ax, az, au * 0.98, Math.max(1.1, span * 0.075), y0, y1 - Math.min(1.5, (y1 - g0) * 0.2), 1.9);
      else if (au > 5.5) { for (const s of [-1, 1]) { prisma(T.beton, x + ax * s * au * 0.55, z + az * s * au * 0.55, ax, az, 1.05, 1.05, y0, y1 - 0.9, 0.5); if (k.ueber) pfeilerFest(x + ax * s * au * 0.55, z + az * s * au * 0.55, 1.5, y1); } prisma(T.beton, x, z, ax, az, au * 0.95, 0.85, y1 - 1.1, y1, 0); }
      else { prisma(T.beton, x, z, ax, az, au * 0.85, 0.65, y0, y1, 0.6); if (k.ueber) for (const f of [-0.6, 0, 0.6]) pfeilerFest(x + ax * f * au, z + az * f * au, 0.95, y1); }
    }
    // Widerlager: Stirnwand des Damms an beiden Enden des Brückenteils, vom Boden bis unter den Überbau
    if (k.ueber) for (const sK of [k.kA, k.kB]) { if (sK < 1 || sK > k.L - 1) continue; const i = iBei(sK), g = k.g[i], yU = k.y[i] - dicke; if (yU - g < 0.4) continue; const q = [P(i, -au, g - k.y[i] - 0.4), P(i, au, g - k.y[i] - 0.4), P(i, au, -dicke), P(i, -au, -dicke)], u = [[0, q[0][1]], [au * 2, q[1][1]], [au * 2, q[2][1]], [0, q[3][1]]]; T.beton.quad(q[0], q[1], q[2], q[3], u[0], u[1], u[2], u[3]); T.beton.quad(q[0], q[3], q[2], q[1], u[0], u[3], u[2], u[1]); }
    // Steinbögen: Wand bis zum Bogen, Bogenunterseite
    if (k.art === 'stein') { const grenzen = [0, ...piers.map(i => k.s[i]), k.L]; for (let j = 1; j < grenzen.length; j++) { const s0 = grenzen[j - 1], s1 = grenzen[j], sp = s1 - s0; if (sp < 4) continue; const steps = 12; let vA = null; for (let q = 0; q <= steps; q++) { const u = q / steps, s = s0 + sp * u, i = Math.min(N - 2, Math.max(0, iBei(s) - 1)), f = THREE.MathUtils.clamp((s - k.s[i]) / Math.max(0.01, k.s[i + 1] - k.s[i]), 0, 1), x = k.x[i] + (k.x[i + 1] - k.x[i]) * f, z = k.z[i] + (k.z[i + 1] - k.z[i]) * f, y = k.y[i] + (k.y[i + 1] - k.y[i]) * f, g = k.g[i] + (k.g[i + 1] - k.g[i]) * f, frei = Math.max(0.4, y - g - dicke), rise = Math.min(frei * 0.9, sp * 0.42), ya = y - dicke - rise + rise * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), nx = -tz[i], nz = tx[i], w = { x, z, y, ya, nx, nz, s }; if (vA) { for (const si of [-1, 1]) { const o = si * au, a1 = [vA.x + vA.nx * o, vA.ya, vA.z + vA.nz * o], b1 = [w.x + w.nx * o, w.ya, w.z + w.nz * o], b2 = [w.x + w.nx * o, w.y + 0.02, w.z + w.nz * o], a2 = [vA.x + vA.nx * o, vA.y + 0.02, vA.z + vA.nz * o]; if (si < 0) T.stein.quad(a1, a2, b2, b1, [vA.s, a1[1]], [vA.s, a2[1]], [w.s, b2[1]], [w.s, b1[1]]); else T.stein.quad(a1, b1, b2, a2, [vA.s, a1[1]], [w.s, b1[1]], [w.s, b2[1]], [vA.s, a2[1]]); } const a3 = [vA.x - vA.nx * au, vA.ya, vA.z - vA.nz * au], b3 = [w.x - w.nx * au, w.ya, w.z - w.nz * au], b4 = [w.x + w.nx * au, w.ya, w.z + w.nz * au], a4 = [vA.x + vA.nx * au, vA.ya, vA.z + vA.nz * au]; T.stein.quad(a3, b3, b4, a4, [vA.s, -au], [w.s, -au], [w.s, au], [vA.s, au]); } vA = w; } } }
    // Schrägseil: zwei Pylone, je Seite und Richtung 10 Seile
    if (k.art === 'seil') { const hP = Math.min(95, 24 + k.L * 0.06), seil = (a, b, r = 0.12) => { for (const [dx, dz] of [[r, 0], [0, r]]) { T.seil.quad([a[0] - dx, a[1], a[2] - dz], [b[0] - dx, b[1], b[2] - dz], [b[0] + dx, b[1], b[2] + dz], [a[0] + dx, a[1], a[2] + dz], [0, 0], [1, 0], [1, 1], [0, 1]); T.seil.quad([a[0] - dx, a[1], a[2] - dz], [a[0] + dx, a[1], a[2] + dz], [b[0] + dx, b[1], b[2] + dz], [b[0] - dx, b[1], b[2] - dz], [0, 0], [0, 1], [1, 1], [1, 0]); } };
      for (const f of [0.34, 0.66]) { const i = iBei(k.L * f), x = k.x[i], z = k.z[i], y = k.y[i], ax = -tz[i], az = tx[i], g0 = Hg(x, z), o = au + 1.3; for (const s of [-1, 1]) prisma(T.beton, x + ax * s * o, z + az * s * o, ax, az, 1.2, 1.7, g0 - 4, y + hP, 0); prisma(T.beton, x, z, ax, az, o + 1.2, 1.4, y - dicke - 2.2, y - dicke, 0); prisma(T.beton, x, z, ax, az, o + 1.2, 1.2, y + hP - 5, y + hP - 2.4, 0);
        for (const s of [-1, 1]) for (const dir of [-1, 1]) for (let c = 1; c <= (mobil ? 5 : 10); c++) { const d = c * (k.L * 0.15) / (mobil ? 5 : 10), iC = iBei(k.s[i] + dir * d); if (iC <= 0 || iC >= N - 1) continue; const q = P(iC, s * (au - 0.1), 0.1), oben = [x + ax * s * o, y + hP - 6 - c * 1.4, z + az * s * o]; seil(oben, q); } } }
  }
  const G = new THREE.Group(); G.name = 'bruecken'; const baue = (t, m, schatten) => { const g = t.geo(); if (!g || !m) return; const h = new THREE.Mesh(g, m); h.castShadow = schatten && !mobil; h.receiveShadow = true; h.frustumCulled = false; G.add(h); };
  baue(T.fahr, M.fahr, false); baue(T.geh, M.geh, false); baue(T.beton, M.beton, true); baue(T.stein, M.stein, true); baue(T.stahl, M.stahl, false); baue(T.seil, M.seil, false); baue(T.mark, M.mark, false);
  G.userData.pfeiler = pfeilerListe;   // für den Prüfstand (tools/bauwerke_pruefen.mjs)
  return { gruppe: G, rails };
}
