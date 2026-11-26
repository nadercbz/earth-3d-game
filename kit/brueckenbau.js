// Brücken über Straßen, Gleise und Wege im Ortsworker (Wunsch Nr. 95, 09.11.2026, Nader: "Auch alle Brücken überall in Berlin sollen richtig gebaut sein,
// wie richtige Brücken ... Kann ich drunterherfahren oder drüberfahren?"). Bisher wurden nur Brücken über Wasser als Bauwerk gebaut, Brücken über
// Straßen und Gleise lagen flach auf dem Boden und kreuzten die untere Straße ebenerdig.
// Feste Regel: eine Straße mit brunnel=bridge, die eine Straße einer tieferen Ebene, ein ebenerdiges Gleis oder einen Weg kreuzt, ist ein Bauwerk.
// Aufeinanderfolgende Brückenstücke werden zu einem Lauf verbunden. Seine Zufahrten werden zu Rampen (bis RAMPE Meter, immer 8 m vor der nächsten
// Einmündung, Kreuzung oder Querung) und gehören zur Brücke. Die Rampen bleiben Linien der Straße (Verkehr fährt hinauf), sie haben nur keine
// Fahrbahn am Boden mehr. Die Höhen rechnet kit/bruecke.js: über jeder Kreuzung die Durchfahrtshöhe KLAR (Oberkante Fahrbahn über dem Boden),
// auf den Rampen höchstens rund 6 %, im Notfall 10 %.
// Ausgabe je Brücke: { p, w, hw, ueber, x: [[x, z, klar, ausdehnung], ...] Kreuzungen, k: [[x, z], [x, z]] Enden des Brückenteils, glieder: Linien }

export const BRUECKEN_UEBER_VERKEHR = true;   // Schalter: erst nach der Prüfung im Spiel an. Prüfstände in node setzen globalThis.__brueckeTest
export const RAMPE = 110, KLAR = { strasse: 5.9, bahn: 7.2, weg: 4.4 };   // 4,7 m, 6,0 m und 3,2 m lichte Höhe plus rund 1,2 m Überbau
const FANG = 1.8, RAND = 8;

export const laengeL = l => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; };
export const box = l => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of l) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, z0, x1, z1]; };
export const ueberlapp = (a, b, r = 2) => a[0] - r <= b[2] && b[0] - r <= a[2] && a[1] - r <= b[3] && b[1] - r <= a[3];
// Linie bei Abstand d teilen: [Anfang bis d, d bis Ende]
function teile(l, d) {
  let s = 0;
  for (let i = 1; i < l.length; i++) { const L = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); if (s + L >= d) { const t = (d - s) / Math.max(L, 1e-6), q = [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * t, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t]; return [[...l.slice(0, i), q], [q, ...l.slice(i)]]; } s += L; }
  return [l.slice(), [l[l.length - 1], l[l.length - 1]]];
}
function punktBei(l, d) {
  let s = 0;
  for (let i = 1; i < l.length; i++) { const L = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); if (s + L >= d) { const t = (d - s) / Math.max(L, 1e-6); return [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * t, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t]; } s += L; }
  return l[l.length - 1].slice();
}
// Schnittpunkte zweier Linien: Abstand auf a und Sinus des Winkels
export function schnitte(a, b) {
  const o = []; let sa = 0;
  for (let i = 1; i < a.length; i++) {
    const [ax, az] = a[i - 1], [bx, bz] = a[i], La = Math.hypot(bx - ax, bz - az); if (La < 1e-6) continue;
    for (let j = 1; j < b.length; j++) {
      const [cx, cz] = b[j - 1], [dx, dz] = b[j], r = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(r) < 1e-9) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / r, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / r;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { const Lb = Math.hypot(dx - cx, dz - cz) || 1; o.push({ d: sa + t * La, sin: Math.abs(r) / (La * Lb) }); }
    }
    sa += La;
  }
  return o;
}
// Abstand des Punktes q entlang l (Projektion) und quer dazu
export function projektion(l, q) {
  let s = 0, best = { s: 0, d: Infinity };
  for (let i = 1; i < l.length; i++) { const [ax, az] = l[i - 1], [bx, bz] = l[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, L = Math.sqrt(L2), t = L2 > 0 ? Math.min(1, Math.max(0, ((q[0] - ax) * dx + (q[1] - az) * dz) / L2)) : 0, d = Math.hypot(ax + dx * t - q[0], az + dz * t - q[1]); if (d < best.d) best = { s: s + t * L, d }; s += L; }
  return best;
}

// strassenLinien wie in kit/ortbau.js. gleise: [{ l, art: 'bahn' | 'strasse' }] ebenerdige Gleise, wege: Linien der Fuß und Radwege am Boden.
// bekannt: Linien, die schon Brücke sind (über Wasser). Teilt die Zufahrten der Brücken (Rampe und Rest bleiben Linien derselben Straße)
export function brueckenSammeln(strassenLinien, gleise = [], wege = [], { bekannt = new Set(), halb = 600 } = {}) {
  if (!BRUECKEN_UEBER_VERKEHR && !globalThis.__brueckeTest) return [];
  const ebene = s => s.f.p.brunnel === 'bridge' ? Math.max(1, +s.f.p.layer || 1) : (+s.f.p.layer || 0);
  const amRand = q => Math.abs(q[0]) > halb - 2 || Math.abs(q[1]) > halb - 2;
  // Brückenstücke zu Läufen verbinden (Enden auf 1,6 m, in gerader Fortsetzung bis 3,5 m, gleiche Ebene, Breite höchstens 2,5 m verschieden)
  const laeufe = [];
  for (const s of strassenLinien) {
    if (s.tunnel || s.f.p.brunnel !== 'bridge' || /service|track|path|steps|footway|cycleway|pedestrian/.test(s.hw)) continue;
    for (const l of s.f.linien) if (l.length >= 2 && !bekannt.has(l) && laengeL(l) > 2) laeufe.push({ p: l.slice(), gl: [l], s, e: ebene(s), w: s.w });
  }
  if (globalThis.__brueckeLog) for (const l of laeufe) globalThis.__brueckeLog.push({ a: l.p[0], b: l.p[l.p.length - 1], L: Math.round(laengeL(l.p)), w: l.w, e: l.e, hw: l.s.hw, n: l.p.length });   // nur für Prüfstände in node
  const nah = (q, r) => Math.hypot(q[0] - r[0], q[1] - r[1]) < 1.6;
  for (let wieder = true; wieder;) {
    wieder = false;
    suche: for (let i = 0; i < laeufe.length; i++) for (let j = 0; j < laeufe.length; j++) {
      const A = laeufe[i], B = laeufe[j]; if (i === j || A.e !== B.e || Math.abs(A.w - B.w) > 2.5) continue;
      const a = A.p, b = B.p, e = a[a.length - 1]; let neu = null;
      if (nah(e, b[0])) neu = a.concat(b.slice(1)); else if (nah(e, b[b.length - 1])) neu = a.concat(b.slice(0, -1).reverse());
      // Lücke an der Kachelgrenze (19.11.2026, Putlitzbrücke: zwei Stücke derselben Fahrbahn lagen 1,8 m auseinander, die Brücke tauchte dazwischen
      // auf den Boden ab, während die Gegenfahrbahn 5,7 m hoch blieb): bis 3,5 m verbinden, wenn das zweite Stück das erste gerade fortsetzt
      else for (const vorn of [true, false]) {
        const q = vorn ? b[0] : b[b.length - 1], q2 = vorn ? b[1] : b[b.length - 2], lx = q[0] - e[0], lz = q[1] - e[1], lg = Math.hypot(lx, lz); if (lg >= 3.5) continue;
        const v = a[a.length - 2], ax = e[0] - v[0], az = e[1] - v[1], al = Math.hypot(ax, az) || 1, bx = q2[0] - q[0], bz = q2[1] - q[1], bl = Math.hypot(bx, bz) || 1;
        if ((ax * bx + az * bz) / (al * bl) > 0.94 && (ax * lx + az * lz) / (al * lg) > 0.5) { neu = a.concat(vorn ? b : b.slice().reverse()); break; }
      }
      if (neu) { A.p = neu; A.gl.push(...B.gl); A.w = Math.max(A.w, B.w); laeufe.splice(j, 1); wieder = true; break suche; }
    }
  }
  if (!laeufe.length) return [];
  // alle Linien mit Rahmen, Enden aller Straßenlinien für Anschlüsse
  const strassen = [], enden = [];
  for (const s of strassenLinien) { if (s.tunnel) continue; for (const l of s.f.linien) if (l.length >= 2) { strassen.push({ s, l, b: box(l), e: ebene(s) }); enden.push({ s, l, ende: 'a', q: l[0] }, { s, l, ende: 'b', q: l[l.length - 1] }); } }
  const gl = gleise.filter(g => g.l?.length >= 2).map(g => ({ ...g, b: box(g.l) })), wg = wege.filter(l => l?.length >= 2).map(l => ({ l, b: box(l) }));
  const endenBei = q => enden.filter(e => !tot.has(e.l) && Math.hypot(e.q[0] - q[0], e.q[1] - q[1]) < FANG);
  const aus = [], vergeben = new Set();
  const AB = h => /^(motorway|trunk)/.test(h || ''), tot = new Set(), stoss = [], neben = [], r2 = v => Math.round(v * 100) / 100;
  const spaeter = [];
  const neuesEnde = (s, l) => { enden.push({ s, l, ende: 'a', q: l[0] }, { s, l, ende: 'b', q: l[l.length - 1] }); };
  // gerade Fortsetzung über ein Ende hinaus (v0 nach v1 ist die Richtung): die Linie mit dem kleinsten Knick, gleiche Klasse bevorzugt
  const fortsetzung = (zu, v0, v1, hw) => { const ax = v1[0] - v0[0], az = v1[1] - v0[1], al = Math.hypot(ax, az) || 1; let best = null, bw = 0.8;
    for (const o of zu) { const l = o.ende === 'b' ? o.l.slice().reverse() : o.l, q = punktBei(l, Math.min(12, laengeL(l))), bx = q[0] - l[0][0], bz = q[1] - l[0][1], bl = Math.hypot(bx, bz) || 1, c = (ax * bx + az * bz) / (al * bl) + (o.s.hw === hw ? 0.08 : 0); if (c > bw) { bw = c; best = o; } }
    return best; };
  // Rampe ziehen: von einem Linienende (start) weg bis RAMPE Meter, immer 8 m vor der nächsten Einmündung, Kreuzung oder Querung.
  // Autobahn und Zubringer (Nr. 112, 26.11.2026, Dreieck Funkturm und Kreuz Schöneberg): die Rampe läuft über Einmündungen auf der geraden Fortsetzung
  // weiter (auch über mehrere Linien), einmündende Zubringer bekommen eine eigene Rampe auf der Höhe der Einmündung (nebenRampe). Trifft sie auf die
  // nächste Brücke derselben Straße oder deren Rampe, ist das ein Stoß: beide bleiben oben (kit/bruecke.js gleicht die Höhe an), statt dazwischen
  // steil auf den Boden zu tauchen. Vorher endete die Brücke an jeder Einmündung ohne Rampe am Boden, die Gegenfahrbahn lag bis 4 m höher daneben
  const ziehe = (start, hwLauf, eigen, glieder) => {
    let cur = start, uebrig = RAMPE, w = 0; const nebenListe = [], stuecke = [];
    for (let runde = 0; runde < 8 && cur; runde++) {
      const z = cur, l0 = z.ende === 'b' ? z.l.slice().reverse() : z.l, b0 = box(l0), L0 = laengeL(l0), ab = AB(hwLauf) && AB(z.s.hw), nebenAuf = [], fernQ = l0[l0.length - 1];
      const fern = endenBei(fernQ).filter(o => o.l !== z.l && !eigen.has(o.l));
      let grenze = Infinity;
      for (const e of enden) { if (tot.has(e.l) || e.l === z.l || eigen.has(e.l) || e.q[0] < b0[0] - 3 || e.q[0] > b0[2] + 3 || e.q[1] < b0[1] - 3 || e.q[1] > b0[3] + 3) continue; const pr = projektion(l0, e.q); if (pr.d < 2.5 && pr.s > 1 && pr.s < L0 - 1) { if (ab && AB(e.s.hw) && e.s.f.p.brunnel !== 'bridge' && !vergeben.has(e.l)) nebenAuf.push({ o: e, s: pr.s }); else grenze = Math.min(grenze, pr.s - RAND); } }
      for (const o of strassen) if (o.e < 1 && o.l !== z.l && !tot.has(o.l) && !eigen.has(o.l) && ueberlapp(b0, o.b)) for (const c of schnitte(l0, o.l)) if (c.d > 1 && c.d < L0 - 1 && !nebenAuf.some(n => n.o.l === o.l)) grenze = Math.min(grenze, c.d - RAND);   // höhere Brücken gehen darüber
      for (const g of gl) if (ueberlapp(b0, g.b)) for (const c of schnitte(l0, g.l)) grenze = Math.min(grenze, c.d - RAND);
      for (const w of wg) if (ueberlapp(b0, w.b)) for (const c of schnitte(l0, w.l)) if (c.d > 1) grenze = Math.min(grenze, c.d - RAND);
      let weiter = null, amStoss = false;
      if (ab && grenze === Infinity && uebrig > L0 && fern.length && fern.every(o => AB(o.s.hw)) && !amRand(fernQ)) {
        if (uebrig > L0 + 10) weiter = fortsetzung(fern.filter(o => o.s.f.p.brunnel !== 'bridge' && !vergeben.has(o.l)), l0[l0.length - 2], fernQ, z.s.hw);
        if (!weiter && fortsetzung(fern.filter(o => o.s.f.p.brunnel === 'bridge' || vergeben.has(o.l)), l0[l0.length - 2], fernQ, z.s.hw)) amStoss = true;
      }
      const frei = weiter || amStoss ? L0 : Math.min(L0 - (fern.length ? RAND : 0), grenze, uebrig);
      if (globalThis.__rampeLog) console.log('RAMPE', hwLauf, start.q.map(Math.round), 'zu', z.s.hw, 'L', Math.round(L0), 'frei', Math.round(frei), weiter ? 'weiter' : amStoss ? 'stoss' : '', 'neben', nebenAuf.map(n => n.o.s.hw + '@' + Math.round(n.s)));
      if (!weiter && !amStoss && frei < (stuecke.length ? 2 : 10)) break;
      const i = z.s.f.linien.indexOf(z.l); if (i < 0) break;
      let stueck = l0;
      if (frei < L0 - 0.5) { const [vorn, rest] = teile(l0, frei), vornL = z.ende === 'b' ? vorn.slice().reverse() : vorn, restL = z.ende === 'b' ? rest.slice().reverse() : rest; z.s.f.linien.splice(i, 1, restL, vornL); stueck = vorn; tot.add(z.l); vergeben.add(vornL); eigen.add(vornL); glieder.push(vornL); neuesEnde(z.s, vornL); neuesEnde(z.s, restL); strassen.push({ s: z.s, l: restL, b: box(restL), e: ebene(z.s) }); }   // Netz bleibt: die Zufahrt ist jetzt Rest und Rampe
      else { vergeben.add(z.l); eigen.add(z.l); glieder.push(z.l); }
      stuecke.push(stueck); w = Math.max(w, z.s.w); uebrig -= laengeL(stueck);
      for (const n of nebenAuf) if (weiter || amStoss || n.s < frei - 4) nebenListe.push(n.o);
      if (weiter) for (const o of fern) if (o !== weiter && AB(o.s.hw) && o.s.f.p.brunnel !== 'bridge') nebenListe.push(o);
      if (amStoss) stoss.push(fernQ);
      cur = weiter;
    }
    if (!stuecke.length) return null;
    const rampe = stuecke[0].slice(); for (let k = 1; k < stuecke.length; k++) rampe.push(...stuecke[k].slice(1));
    return { rampe, w, nebenListe };
  };
  // Rampe eines Zubringers, der an einer Brücke oder ihrer Rampe einmündet: beginnt auf der Höhe der Einmündung (kit/bruecke.js ketteUeber liest sie
  // vom schon gebauten Damm) und fällt auf ihrer eigenen Linie zum Boden
  const nebenRampe = (o, e, tiefe = 0) => {
    if (tot.has(o.l) || vergeben.has(o.l) || o.s.f.p.brunnel === 'bridge' || tiefe > 3) return;
    const gl2 = [], r = ziehe(o, o.s.hw, new Set(), gl2); if (!r) return;
    const p = r.rampe.map(([x, z]) => [r2(x), r2(z)]), q1 = punktBei(r.rampe, 0.6).map(r2);
    neben.push({ p, w: o.s.w, hw: o.s.hw, sp: o.s.abSpuren || 0, lw: o.s.abLw || 0, ueber: 'strasse', e: e + 0.25, x: [], k: [p[0], p[0]], kern: [p[0], q1], glieder: gl2, neben: 1 });
    for (const n of r.nebenListe) nebenRampe(n, e + 0.25, tiefe + 1);
  };
  for (const lauf of laeufe) {
    const P = lauf.p, bP = box(P), eigen = new Set(lauf.gl);
    // was kreuzt der Lauf? Straßen tieferer Ebene, ebenerdige Gleise, Wege
    const unten = [];
    for (const o of strassen) if (o.e < lauf.e && !o.s.oben && ueberlapp(bP, o.b)) { const LP0 = laengeL(P); for (const c of schnitte(P, o.l)) { if (o.e < 1 && (c.d < 4 || c.d > LP0 - 4)) { unten.push({ ...c, art: 'strasse', hb: o.s.w / 2, l: null, ecke: true }); continue; }   // Straße am Boden, die das Brückenende berührt: Einmündung, keine Unterführung (Nr. 112: solche Scheinkreuzungen verlangten 5,9 m Höhe direkt am Brückenende)
      unten.push({ ...c, art: 'strasse', hb: o.s.w / 2, l: o.e < 1 ? o.l : null }); } }
    for (const g of gl) if (ueberlapp(bP, g.b)) for (const c of schnitte(P, g.l)) unten.push({ ...c, art: g.art || 'bahn', hb: g.art === 'strasse' ? 3.2 : 2.6, l: g.l });
    for (const w of wg) if (ueberlapp(bP, w.b)) for (const c of schnitte(P, w.l)) unten.push({ ...c, art: 'weg', hb: 1.6, l: w.l });
    if (!unten.length) continue;
    // Rampen auf den Zufahrten: genau eine Straße schließt an, kein Ortsrand, frei bis 8 m vor dem nächsten Anschluss
    const rampen = {};
    for (const [ende, q] of [['a', P[0]], ['b', P[P.length - 1]]]) {
      rampen[ende] = [];
      if (amRand(q)) continue;
      // Das Ende schließt an eine andere Brücke an (Abzweig auf dem Bauwerk, zweites Stück derselben Brücke) und keine Straße am Boden: Stoß, keine Rampe. Vorher fiel das
      // Deck dort auf den Boden und kreuzte die untere Straße ebenerdig (Kreuz Schöneberg, 26.11.2026)
      if (!endenBei(q).some(o => !eigen.has(o.l) && o.s.f.p.brunnel !== 'bridge') && strassen.some(o => o.s.f.p.brunnel === 'bridge' && !eigen.has(o.l) && q[0] > o.b[0] - 3 && q[0] < o.b[2] + 3 && q[1] > o.b[1] - 3 && q[1] < o.b[3] + 3 && projektion(o.l, q).d < 2.5)) { stoss.push(q); continue; }
      const alleEnden = endenBei(q).filter(o => !eigen.has(o.l));
      let zu = alleEnden.filter(o => o.s.f.p.brunnel !== 'bridge' && !vergeben.has(o.l)), nebenAmEnde = [];
      if (zu.length !== 1 || alleEnden.length !== 1) {   // Kreuzung oder Sackgasse am Brückenende: keine Rampe
        if (globalThis.__rampeLog) console.log('ENDE', lauf.s.hw, q.map(Math.round), 'alle', alleEnden.map(o => o.s.hw + (o.s.f.p.brunnel || '') + (vergeben.has(o.l) ? 'V' : '')), 'zu', zu.length);
        // Autobahnkreuz (Nr. 112, 26.11.2026, Dreieck Funkturm): mündet am Brückenende ein Zubringer ein, endete die Brücke ohne Rampe am Boden,
        // die Gegenfahrbahn daneben lag bis 4 m höher auf ihrem Damm. Jetzt läuft die Rampe auf der geraden Fortsetzung weiter, der Zubringer
        // bekommt eine eigene Rampe, die auf der Höhe der Einmündung beginnt (nebenRampe)
        if (!AB(lauf.s.hw) || !zu.length) continue;
        const [v0, v1] = ende === 'a' ? [P[1], P[0]] : [P[P.length - 2], P[P.length - 1]], best = fortsetzung(zu, v0, v1, lauf.s.hw);
        if (!best) continue;
        nebenAmEnde = zu.filter(o => o !== best && AB(o.s.hw)); zu = [best];
      }
      const r = ziehe(zu[0], lauf.s.hw, eigen, lauf.gl); if (!r) continue;
      rampen[ende] = r.rampe; lauf.w = Math.max(lauf.w, r.w);   // rampe läuft vom Brückenende weg. Breite der Zufahrt: sie hat oft mehr Spuren als das Brückenstück, die äußere Spur lag sonst neben dem Deck im Geländer (Moltkebrücke, 18.11.2026)
      for (const o of nebenAmEnde.concat(r.nebenListe)) spaeter.push([o, lauf.e]);   // erst nach allen Brücken: sonst nimmt ein Zubringer der nächsten Brücke die Zufahrt weg
    }
    // Brückenende ohne Rampe in einer Kreuzung (Nr. 112, Brücke über die Bahn am Kaiserdamm): auf der Breite der Querstraße kein Geländer, es stand
    // sonst quer auf deren Fahrspur (unsichtbare Wand). gf: Meter ab dem Ende a und ab dem Ende b ohne Geländer
    const gf = [0, 0]; [['a', P[0]], ['b', P[P.length - 1]]].forEach(([ende, q], n) => { if (rampen[ende].length || amRand(q)) return; let w = 0; for (const o of strassen) { if (tot.has(o.l) || eigen.has(o.l) || o.s.f.p.brunnel === 'bridge' || q[0] < o.b[0] - 3 || q[0] > o.b[2] + 3 || q[1] < o.b[1] - 3 || q[1] > o.b[3] + 3) continue; const d = projektion(o.l, q).d; if (d < o.s.w / 2 + 1.5) w = Math.max(w, o.s.w / 2 + d + 2); } if (w) gf[n] = r2(w); });
    const A = rampen.a, B = rampen.b, p = [...A.slice().reverse(), ...P.slice(A.length ? 1 : 0), ...B.slice(1)];
    const art = unten.some(u => u.art === 'bahn') ? 'bahn' : unten.some(u => u.art === 'strasse') ? 'strasse' : 'weg';
    for (const l of lauf.gl) vergeben.add(l);
    aus.push({ p: p.map(([x, z]) => [r2(x), r2(z)]), w: lauf.w, hw: lauf.s.hw, sp: lauf.s.abSpuren || 0, lw: lauf.s.abLw || 0, ueber: art, e: lauf.e,
      x: unten.map(u => { const q = punktBei(P, u.d); return [r2(q[0]), r2(q[1]), u.ecke ? 0.1 : KLAR[u.art], r2(u.ecke ? 1 : Math.min(40, (u.hb + 1.5) / Math.max(0.25, u.sin)))]; }),
      k: [P[0].map(r2), P[P.length - 1].map(r2)], kern: P.map(([x, z]) => [r2(x), r2(z)]), glieder: lauf.gl, _u: unten, _P: P, _la: A.length ? laengeL(A) : 0, _lb: B.length ? laengeL(B) : 0, ...(gf[0] || gf[1] ? { gf: [A.length ? 0 : gf[0], B.length ? 0 : gf[1]] } : {}) });
  }
  for (const [o, e] of spaeter) nebenRampe(o, e);
  // Stoß: Enden, an denen zwei Bauwerke derselben Straße aneinander anschließen
  const alle = aus.concat(neben);
  for (const b of alle) { const st = [b.p[0], b.p[b.p.length - 1]].filter(q => stoss.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 2.5)); if (st.length) b.st = st; }
  // Einschnitt (Nr. 112 Runde 3, 26.11.2026): kann eine Brücke über einer Kreuzung ihre Durchfahrtshöhe nicht erreichen (Kreuzung am Brückenende,
  // Rampe zu kurz: mit 10 % fehlen mehr als 1,5 m), bleibt sie auf Straßenhöhe und das Untere wird abgesenkt, wie die Ringbahn in echt im Einschnitt
  // liegt. Vorher lagen solche Brücken flach am Boden und kreuzten Gleis oder Straße ebenerdig (rund 50 an 26 Berliner Ausschnitten).
  // Je Einschnitt: Stück der unteren Linie um die Kreuzung, volle Tiefe unter der Brücke (pl), davor und dahinter Rampe (Gleis 4 %, Straße 7 %, Weg 8 %)
  const stueck = (l, a, b) => { const L = laengeL(l); a = Math.max(0, a); b = Math.min(L, b); if (b - a < 2) return null; const hinten = a > 0.01 ? teile(l, a)[1] : l, vorn = b < L - 0.01 ? teile(hinten, b - a)[0] : hinten; return vorn; };
  const einschnitte = [], NEIG = { bahn: 0.04, strasse: 0.07, weg: 0.08 }, STEIL = { bahn: 0.16, strasse: 0.12, weg: 0.16 };
  const glEnden = []; for (const g of gl) glEnden.push({ l: g.l, q: g.l[0], a: true }, { l: g.l, q: g.l[g.l.length - 1], a: false });
  // Gleis über seine Linienenden hinaus verlängern (die Karte teilt Gleise an jeder Weiche): sonst endete der Einschnitt mit voller Tiefe am Linienende
  const verlaengern = (l, noetig) => { const P = l.slice(), benutzt = new Set([l]);
    for (const hinten of [false, true]) { let weg = 0; for (let n = 0; n < 14 && weg < noetig; n++) { const q = hinten ? P[P.length - 1] : P[0], v = hinten ? P[P.length - 2] : P[1], ax = q[0] - v[0], az = q[1] - v[1], al = Math.hypot(ax, az) || 1; let best = null, bw = 0.9;
        for (const e of glEnden) { if (benutzt.has(e.l) || Math.abs(e.q[0] - q[0]) > 1.5 || Math.abs(e.q[1] - q[1]) > 1.5) continue; const m = e.a ? e.l : e.l.slice().reverse(), bx = m[1][0] - m[0][0], bz = m[1][1] - m[0][1], c = (ax * bx + az * bz) / (al * (Math.hypot(bx, bz) || 1)); if (c > bw) { bw = c; best = { m, l: e.l }; } }
        if (!best) { if (!amRand(q)) { const d = noetig - weg, e = [q[0] + ax / al * d, q[1] + az / al * d]; if (hinten) P.push(e); else P.unshift(e); } break; }   // keine Fortsetzung gefunden (Weiche mit Knick, Gleis auf anderer Ebene): gerade weiter, damit alle Gleise unter einer Brücke gleich tief liegen
        benutzt.add(best.l); weg += laengeL(best.m); if (hinten) P.push(...best.m.slice(1)); else P.unshift(...best.m.slice(1).reverse()); } }
    return P; };
  const gesenkt = new Set(), schnittBox = [];
  for (const b of alle) { const U = b._u, P = b._P; if (U && !b.neben) { const LP = laengeL(P), offenA = amRand(b.p[0]) || !!b.st?.some(t => Math.hypot(t[0] - b.p[0][0], t[1] - b.p[0][1]) < 2.5), eB = b.p[b.p.length - 1], offenB = amRand(eB) || !!b.st?.some(t => Math.hypot(t[0] - eB[0], t[1] - eB[1]) < 2.5);
      for (const u of U) { if (!u.l || u.art !== 'bahn') continue;   // nur Gleise: abgesenkte Straßen bekamen an Widerlagern und Einmündungen Buckel (Versuch 26.11.2026), dafür braucht es eine eigene Unterführung
        const klar = KLAR[u.art], pl = Math.min(40, (u.hb + 1.5) / Math.max(0.25, u.sin)), ra = offenA ? 99 : 0.10 * Math.max(0, b._la + u.d - pl), rb = offenB ? 99 : 0.10 * Math.max(0, b._lb + LP - u.d - pl), fehlt = klar - Math.min(ra, rb);
        if (fehlt < 1.5) continue;
        const q = punktBei(P, u.d), halbB = Math.min(40, (b.w / 2 + 4) / Math.max(0.25, u.sin)), rl = klar / NEIG[u.art], E = u.art === 'bahn' ? verlaengern(u.l, halbB + rl) : u.l, s0 = projektion(E, q).s, LE = laengeL(E), bE = box(E);
        // frei je Seite: bis zur nächsten ebenerdigen Straße, die quert (sie fiele sonst in den Einschnitt), bei Straße und Weg auch bis zur nächsten Einmündung
        let fa = amRand(E[0]) ? 1e6 : s0, fb = amRand(E[E.length - 1]) ? 1e6 : LE - s0;   // am Ortsrand läuft der Einschnitt bis zur Kante weiter
        const grenze = (sd, rand) => { if (sd < s0 - halbB) fa = Math.min(fa, s0 - sd - rand); else if (sd > s0 + halbB) fb = Math.min(fb, sd - s0 - rand); else { fa = -1; fb = -1; } };
        for (const o of strassen) { if (o.e >= 1 || tot.has(o.l) || o.l === u.l || o.s.f.p.brunnel === 'bridge' || b.glieder.includes(o.l) || !ueberlapp(bE, o.b)) continue; for (const c of schnitte(E, o.l)) grenze(c.d, 8 + o.s.w / 2); }
        if (u.art !== 'bahn') for (const e of enden) { if (tot.has(e.l) || e.l === u.l || e.q[0] < bE[0] - 3 || e.q[0] > bE[2] + 3 || e.q[1] < bE[1] - 3 || e.q[1] > bE[3] + 3) continue; const pr = projektion(E, e.q); if (pr.d < 2.5) grenze(pr.s, 8); }
        const rla = Math.min(rl, fa - halbB), rlb = Math.min(rl, fb - halbB); if (globalThis.__einschnittLog) console.log('EINSCHNITT', b.hw, u.art, q.map(Math.round), 'fehlt', r2(fehlt), 'LE', Math.round(LE), 's0', Math.round(s0), 'fa', Math.round(fa), 'fb', Math.round(fb), 'rla', Math.round(rla), 'rlb', Math.round(rlb), rla < klar / STEIL[u.art] || rlb < klar / STEIL[u.art] ? 'NEIN' : 'ja');
        if (rla < klar / STEIL[u.art] || rlb < klar / STEIL[u.art]) continue;
        const st = stueck(E, s0 - halbB - rla, s0 + halbB + rlb); if (!st) continue;
        gesenkt.add(u.l); schnittBox.push(box(st));
        einschnitte.push({ p: st.map(([x, z]) => [r2(x), r2(z)]), m: [r2(q[0]), r2(q[1])], pl: r2(halbB), ra: r2(rla), rb: r2(rlb), t: klar, hb: r2(u.hb + 1.2), ko: [[P[0], P[1]], [P[P.length - 1], P[P.length - 2]]].map(([e, v]) => { const l = Math.hypot(e[0] - v[0], e[1] - v[1]) || 1; return [r2(e[0]), r2(e[1]), r2((e[0] - v[0]) / l), r2((e[1] - v[1]) / l), r2(b.w / 2 + 6)]; }) }); } }   // ko: Brückenende, Richtung nach außen, halbe Breite des Widerlagers
    delete b._u; delete b._P; delete b._la; delete b._lb; }
  alle.einschnitte = einschnitte;
  return alle;
}
