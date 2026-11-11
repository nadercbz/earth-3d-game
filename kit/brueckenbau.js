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
  // Brückenstücke zu Läufen verbinden (Enden auf 1,6 m, gleiche Ebene, Breite höchstens 2,5 m verschieden)
  const laeufe = [];
  for (const s of strassenLinien) {
    if (s.tunnel || s.f.p.brunnel !== 'bridge' || /service|track|path|steps|footway|cycleway|pedestrian/.test(s.hw)) continue;
    for (const l of s.f.linien) if (l.length >= 2 && !bekannt.has(l) && laengeL(l) > 2) laeufe.push({ p: l.slice(), gl: [l], s, e: ebene(s), w: s.w });
  }
  const nah = (q, r) => Math.hypot(q[0] - r[0], q[1] - r[1]) < 1.6;
  for (let wieder = true; wieder;) {
    wieder = false;
    suche: for (let i = 0; i < laeufe.length; i++) for (let j = 0; j < laeufe.length; j++) {
      const A = laeufe[i], B = laeufe[j]; if (i === j || A.e !== B.e || Math.abs(A.w - B.w) > 2.5) continue;
      const a = A.p, b = B.p, e = a[a.length - 1]; let neu = null;
      if (nah(e, b[0])) neu = a.concat(b.slice(1)); else if (nah(e, b[b.length - 1])) neu = a.concat(b.slice(0, -1).reverse());
      if (neu) { A.p = neu; A.gl.push(...B.gl); A.w = Math.max(A.w, B.w); laeufe.splice(j, 1); wieder = true; break suche; }
    }
  }
  if (!laeufe.length) return [];
  // alle Linien mit Rahmen, Enden aller Straßenlinien für Anschlüsse
  const strassen = [], enden = [];
  for (const s of strassenLinien) { if (s.tunnel) continue; for (const l of s.f.linien) if (l.length >= 2) { strassen.push({ s, l, b: box(l), e: ebene(s) }); enden.push({ s, l, ende: 'a', q: l[0] }, { s, l, ende: 'b', q: l[l.length - 1] }); } }
  const gl = gleise.filter(g => g.l?.length >= 2).map(g => ({ ...g, b: box(g.l) })), wg = wege.filter(l => l?.length >= 2).map(l => ({ l, b: box(l) }));
  const endenBei = q => enden.filter(e => Math.hypot(e.q[0] - q[0], e.q[1] - q[1]) < FANG);
  const aus = [], vergeben = new Set();
  for (const lauf of laeufe) {
    const P = lauf.p, bP = box(P), eigen = new Set(lauf.gl);
    // was kreuzt der Lauf? Straßen tieferer Ebene, ebenerdige Gleise, Wege
    const unten = [];
    for (const o of strassen) if (o.e < lauf.e && !o.s.oben && ueberlapp(bP, o.b)) for (const c of schnitte(P, o.l)) unten.push({ ...c, art: 'strasse', hb: o.s.w / 2 });
    for (const g of gl) if (ueberlapp(bP, g.b)) for (const c of schnitte(P, g.l)) unten.push({ ...c, art: g.art || 'bahn', hb: g.art === 'strasse' ? 3.2 : 2.6 });
    for (const w of wg) if (ueberlapp(bP, w.b)) for (const c of schnitte(P, w.l)) unten.push({ ...c, art: 'weg', hb: 1.6 });
    if (!unten.length) continue;
    // Rampen auf den Zufahrten: genau eine Straße schließt an, kein Ortsrand, frei bis 8 m vor dem nächsten Anschluss
    const rampen = {};
    for (const [ende, q] of [['a', P[0]], ['b', P[P.length - 1]]]) {
      rampen[ende] = [];
      if (amRand(q)) continue;
      const zu = endenBei(q).filter(o => !eigen.has(o.l) && o.s.f.p.brunnel !== 'bridge' && !vergeben.has(o.l));
      if (zu.length !== 1 || endenBei(q).filter(o => !eigen.has(o.l)).length !== 1) continue;   // Kreuzung oder Sackgasse am Brückenende: keine Rampe
      const z = zu[0], l0 = z.ende === 'b' ? z.l.slice().reverse() : z.l, b0 = box(l0);
      let frei = laengeL(l0); if (endenBei(l0[l0.length - 1]).some(o => o.l !== z.l)) frei -= RAND;
      for (const e of enden) { if (e.l === z.l || eigen.has(e.l) || e.q[0] < b0[0] - 3 || e.q[0] > b0[2] + 3 || e.q[1] < b0[1] - 3 || e.q[1] > b0[3] + 3) continue; const pr = projektion(l0, e.q); if (pr.d < 2.5 && pr.s > 1) frei = Math.min(frei, pr.s - RAND); }
      for (const o of strassen) if (o.e < 1 && o.l !== z.l && !eigen.has(o.l) && ueberlapp(b0, o.b)) for (const c of schnitte(l0, o.l)) if (c.d > 1) frei = Math.min(frei, c.d - RAND);   // höhere Brücken gehen darüber
      for (const g of gl) if (ueberlapp(b0, g.b)) for (const c of schnitte(l0, g.l)) frei = Math.min(frei, c.d - RAND);
      for (const w of wg) if (ueberlapp(b0, w.b)) for (const c of schnitte(l0, w.l)) if (c.d > 1) frei = Math.min(frei, c.d - RAND);
      frei = Math.min(RAMPE, frei); if (frei < 10) continue;
      const i = z.s.f.linien.indexOf(z.l); if (i < 0) continue;
      const [rampe, rest] = teile(l0, frei), rampeL = z.ende === 'b' ? rampe.slice().reverse() : rampe, restL = z.ende === 'b' ? rest.slice().reverse() : rest;
      if (laengeL(restL) > 1) z.s.f.linien.splice(i, 1, restL, rampeL); else z.s.f.linien.splice(i, 1, rampeL);   // Netz bleibt: die Zufahrt ist jetzt Rest und Rampe
      vergeben.add(z.l); eigen.add(rampeL); lauf.gl.push(rampeL); rampen[ende] = rampe;   // rampe läuft vom Brückenende weg
    }
    const A = rampen.a, B = rampen.b, p = [...A.slice().reverse(), ...P.slice(A.length ? 1 : 0), ...B.slice(1)];
    const r2 = v => Math.round(v * 100) / 100, art = unten.some(u => u.art === 'bahn') ? 'bahn' : unten.some(u => u.art === 'strasse') ? 'strasse' : 'weg';
    for (const l of lauf.gl) vergeben.add(l);
    aus.push({ p: p.map(([x, z]) => [r2(x), r2(z)]), w: lauf.w, hw: lauf.s.hw, ueber: art, e: lauf.e,
      x: unten.map(u => { const q = punktBei(P, u.d); return [r2(q[0]), r2(q[1]), KLAR[u.art], r2(Math.min(40, (u.hb + 1.5) / Math.max(0.25, u.sin)))]; }),
      k: [P[0].map(r2), P[P.length - 1].map(r2)], kern: P.map(([x, z]) => [r2(x), r2(z)]), glieder: lauf.gl });
  }
  return aus;
}
