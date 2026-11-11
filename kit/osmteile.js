// Bekannte Gebäude Berlins aus den 3D Teilen von OpenStreetMap (Wunsch Nr. 83, 08.11.2026, Nader: "alle wichtigen Gebäude, die man kennt,
// auch Hochhäuser, wirklich so bauen, wie sie auch sind", beim Reichstag fehlte die Kuppel). Das Kataster (LoD2) hat Kuppeln und Turmspitzen
// oft nur als flachen Block; OSM beschreibt viele Wahrzeichen in Teilen (building:part mit Höhe, Mindesthöhe, Dachform, Farben, Material).
// tools/osm_teile.py schreibt nach daten/berlin_teile Gebäude mit Kuppel, Zwiebel, Kegel, Pyramide oder schlankem Turm samt allen Teilen.
// Im Ort ersetzen sie die Katasterhäuser in ihrem Umriss (kit/ortbau.js), gebaut werden sie in kit/osmteile_bau.js.
// Quelle: © OpenStreetMap contributors, ODbL. Diese Datei läuft auch im Ortsworker (ohne three.js).

// Kacheln (T_*.json) in Metern um die Ortsmitte. ausnahme(lat, lon): dort steht schon ein eigenes Wahrzeichen (kit/wahrzeichen_liste.js)
export function teileInOrt(kacheln, lat, lon, K_LAT, K_LON, ausnahme = null) {
  const gebaeude = [], hoch = [], gesehen = new Set();
  for (const d of kacheln || []) {
    if (!d?.g) continue;
    const zuM = (dla, dlo) => [(d.lon0 + dlo * 1e-7 - lon) * K_LON, -(d.lat0 + dla * 1e-7 - lat) * K_LAT];
    const ring = a => { const r = []; for (let i = 0; i + 1 < a.length; i += 2) r.push(zuM(a[i], a[i + 1])); return r; };
    for (const g of d.g) {
      if (gesehen.has(g.id)) continue; gesehen.add(g.id);
      const umriss = ring(g.u[0]); if (umriss.length < 3) continue;
      let cx = 0, cz = 0; for (const [x, z] of umriss) { cx += x; cz += z; } cx /= umriss.length; cz /= umriss.length;
      if (ausnahme && ausnahme(lat - cz / K_LAT, lon + cx / K_LON)) continue;
      const teile = [];
      for (const t of g.t) { const ringe = t.p.map(ring).filter(r => r.length >= 3); if (ringe.length) teile.push(RUSS.has(g.id) ? { ...t, ringe, russ: 1 } : { ...t, ringe }); }
      if (!teile.length) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of umriss) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      for (const t of teile) { let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity; for (const [x, z] of t.ringe[0]) { if (x < a) a = x; if (x > b) b = x; if (z < c) c = z; if (z > e) e = z; } t.box = [a, b, c, e]; }
      gebaeude.push({ id: g.id, name: g.name || '', umriss, box: [x0, x1, z0, z1], cx, cz, teile, voll: g.v !== 0, kirche: /kirche|dom\b|kathedrale|synagoge|moschee|kapelle|münster/i.test(g.name || '') });
    }
    // Hochhäuser mit Namen, Material oder Farbe (Wunsch Nr. 85): bestimmen die Fassade der Katasterhäuser in ihrem Umriss (hochStil unten)
    for (const h of d.hh || []) {
      if (gesehen.has(h.id)) continue; gesehen.add(h.id);
      const umriss = ring(h.u[0]); if (umriss.length < 3) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of umriss) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      hoch.push({ id: h.id, nm: h.nm || '', umriss, box: [x0, x1, z0, z1], h: h.h, ma: h.ma || null, fa: h.fa || null });
    }
  }
  const innen = (r, x, z) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  // drin(x, z): Gebäude, in dessen Umriss der Punkt liegt (oder null). Etwas Rand (2 m), damit Katasterhäuser mit leicht verschobener Mitte entfallen
  // Beschreiben die Teile den Bau nur teilweise (voll false), entfallen nur Häuser unter den Teilen, der Rest bleibt aus dem Kataster
  const drin = (x, z) => { for (const g of gebaeude) { const b = g.box; if (x < b[0] - 2 || x > b[1] + 2 || z < b[2] - 2 || z > b[3] + 2) continue; if (g.voll) { if (innen(g.umriss, x, z)) return g; continue; } for (const t of g.teile) { const q = t.box; if (x >= q[0] - 1 && x <= q[1] + 1 && z >= q[2] - 1 && z <= q[3] + 1 && innen(t.ringe[0], x, z)) return g; } } return null; };
  const hochBei = (x, z) => { for (const g of hoch) { const b = g.box; if (x < b[0] - 1 || x > b[1] + 1 || z < b[2] - 1 || z > b[3] + 1) continue; if (innen(g.umriss, x, z)) return g; } return null; };
  return { gebaeude, drin, hoch, hochBei };
}

// Bauweise der Wände eines Teils (kit/bauwerke.js, kit/stile.js): Glas, Turm, Kirche, Stein oder Putz nach Material, Farbe und Form
export function teilTyp(t, g, A) {
  const hoch = t.h - t.m, ma = String(t.ma || '').toLowerCase(), fa = t.fa;
  if (ma.includes('glass')) return { typ: 'glasmodern', variant: '' };
  const turm = hoch >= 12 && hoch > 2.2 * Math.sqrt(Math.max(1, A));
  if (turm) return { typ: 'kirchturm', variant: '' };
  const rot = fa && fa[0] > fa[1] * 1.25 && fa[0] > fa[2] * 1.3, ziegel = ma.includes('brick') || rot;
  if (g?.kirche) return { typ: 'kirche', variant: ziegel ? 'ziegel' : ma.includes('plaster') ? 'putz' : '' };
  if (ziegel) return { typ: 'kirche', variant: 'ziegel' };
  return { typ: 'museum', variant: '' };
}

// Steinbauten, die in Wirklichkeit dunkel sind, in OSM aber eine helle Farbe tragen (Nr. 87): Turmruine der Kaiser-Wilhelm-Gedächtniskirche (Sandstein, vom Brand 1943 verrußt)
const RUSS = new Set(['w15218373']);
// Wandmaterial aus Farbe und Material der OSM Teile (die Bauweise wählt sonst zufällig): Backstein, Sandstein, heller Putz, dunkler Stein
export function wandMaterial(t) {
  const ma = String(t.ma || '').toLowerCase(), f = t.fa;
  if (t.russ && !ma.includes('glass')) return ma.includes('brick') ? 'ziegelAlt' : 'steinRuss';   // dunkle Steinbauten trotz heller Farbe in OSM (RUSS)
  const hell = f ? (f[0] + f[1] + f[2]) / 3 : null, rot = f && f[0] > f[1] * 1.25 && f[0] > f[2] * 1.3, gelb = f && f[0] > f[2] * 1.18 && f[1] > f[2] * 1.08;
  if (ma.includes('brick') || rot) return hell != null && hell < 0.33 ? 'ziegelAlt' : gelb && !rot ? 'ziegelHell' : 'ziegelRot';   // gelber Backstein (Neue Synagoge)
  if (f && hell < 0.3) return 'schiefer';   // geschwärzter Stein
  if (ma.includes('sandstone') || (gelb && hell > 0.6)) return 'sandstein';
  if (gelb) return 'steinGelb';
  if (ma.includes('concrete')) return 'betonWand';
  if (ma.includes('stone') || ma.includes('limestone') || ma.includes('marble')) return hell != null && hell > 0.82 ? 'kalkA' : 'steinBlock';
  if (f) return hell > 0.86 ? 'stuckWeiss' : hell > 0.7 ? 'putzBeige' : 'steinBlock';
  return null;
}
// Fernsicht eines Teils passend zum Nahmodell (Nr. 82): Fassade (FERN in kit/regionen.js) und Ton (FS_TOENE in kit/city.js) aus Bauweise und Wandmaterial.
// Vorher erschien ein klassischer Bau aus der Ferne als türkise Glaskiste
const FERN_OSM = { kirche: 2, kirchturm: 2, museum: 2, glasmodern: 1 };
const TON_OSM = { steinRuss: 32, sandstein: 21, steinGelb: 20, steinBlock: 22, kalkA: 23, stuckWeiss: 26, putzBeige: 0, ziegelRot: 30, ziegelAlt: 16, ziegelHell: 1, betonWand: 19, schiefer: 28 };
const TON_TYP = { kirche: 20, kirchturm: 22, museum: 21, glasmodern: 4 };
export function teilFern(t, g, A) {
  const vb = !g?.kirche ? hochStil({ nm: g?.name || t.nm || '' }) : null;   // bekanntes Gebäude mit Vorbild (Atrium Tower)
  if (vb) return { typ: vb.typ, variant: vb.variant, fern: vb.fern, ton: vb.ton, wand: vb.vg?.wand || null, vg: vb.vg };
  const { typ, variant } = teilTyp(t, g, A), wm = wandMaterial(t);
  return { typ, variant, fern: FERN_OSM[typ] ?? 2, ton: wm ? TON_OSM[wm] ?? TON_TYP[typ] ?? 21 : TON_TYP[typ] ?? 21, wand: wm };
}

// ---------- Hochhausfassaden nach Vorbild (Wunsch Nr. 85, 08.11.2026, Nader: "auch Hochhäuser, wirklich so bauen, wie sie auch sind") ----------
// Bekannte Türme nach ihrem OSM Namen mit Bauweise und Material der echten Fassade (öffentliche Beschreibungen, keine Marken, keine Logos).
// vg: Vorgaben an die Bauweise (kit/bauwerke.js: glas, rahmen, wand). Ohne Vorbild entscheiden Material und Farbe aus OSM, sonst bleibt die Bauweise der Region.
const VORBILDER = [
  [/Kollhoff/i, { typ: 'artdeco', vg: { wand: 'ziegelAlt' } }],                                   // dunkelroter Klinker
  [/Bahntower/i, { typ: 'glasmodern', vg: { glas: 'glasSilber', rahmen: 'metall' } }],            // gläserner Halbrundturm
  [/Zoofenster/i, { typ: 'artdeco', vg: { wand: 'kalkA' } }],                                     // heller Naturstein
  [/Upper West/i, { typ: 'glasmodern', vg: { glas: 'glasDunkel', rahmen: 'rahmenDunkel' } }],     // dunkles Glas mit dunklen Lisenen
  [/Treptower/i, { typ: 'glasmodern', vg: { glas: 'glasBlau', rahmen: 'metall' } }],
  [/EDGE East Side|Berlinian|Stream Tower|Einz Tower|M50\b/i, { typ: 'glasmodern', vg: { glas: 'glasSilber', rahmen: 'lack' } }],
  [/Internationales Handelszentrum/i, { typ: 'glasmodern', vg: { glas: 'glasDunkel', rahmen: 'lack' } }],   // dunkles Glas, weiße Pfeiler
  [/Axel.Springer/i, { typ: 'glasmodern', vg: { glas: 'glasGold', rahmen: 'metall' } }],          // goldene Glasfassade
  [/Atrium Tower|debis/i, { typ: 'betonturm', vg: { wand: 'steinGelb' } }],                        // Terrakotta in warmem Gelb
  [/Telefunken|Europa.?Center|Haus der Elektroindustrie/i, { typ: 'band', variant: 'weiss' }],    // Fensterbänder der 1960er
  [/Königstadt|Haus der Statistik|Haus des Reisens|Haus des Berliner Verlages/i, { typ: 'betonturm', vg: { wand: 'betonPlatte' } }],
  [/Weberwiese/i, { typ: 'lochfassade', variant: 'stein' }],                                       // Keramikplatten, Lochfassade
  [/Haus des Lehrers/i, { typ: 'glasmodern', vg: { glas: 'glasGruen', rahmen: 'metall' } }],
  [/Cube Berlin|Silver Tower|Kranzler Eck/i, { typ: 'glasmodern', vg: { glas: 'glasSilber', rahmen: 'metall' } }],
  [/Ritz.Carlton|Beisheim/i, { typ: 'artdeco', vg: { wand: 'kalkA' } }],
];
const GLAS_TON = { glasBlau: 4, glasGruen: 10, glasSilber: 12, glasDunkel: 14, glasGold: 15 };
const FERN_TYP = { glasmodern: 1, artdeco: 9, betonturm: 2, neubau: 7, band: 4, lochfassade: 2 };
// Fassade eines Hochhauses: { typ, variant, vg, fern, ton } oder null (dann bleibt die Bauweise der Region)
export function hochStil(hv) {
  if (!hv) return null;
  let s = null;
  for (const [re, v] of VORBILDER) if (re.test(hv.nm || '')) { s = v; break; }
  if (!s) {
    const ma = String(hv.ma || '').toLowerCase(), f = hv.fa, hell = f ? (f[0] + f[1] + f[2]) / 3 : null;
    const glasF = f ? (f[2] > f[0] * 1.15 && f[2] >= f[1] ? 'glasBlau' : f[1] > f[0] * 1.1 && f[1] > f[2] * 1.02 ? 'glasGruen' : hell < 0.35 ? 'glasDunkel' : 'glasSilber') : 'glasBlau';
    const wm = wandMaterial(hv);
    if (ma.includes('glass')) s = { typ: 'glasmodern', vg: { glas: glasF, rahmen: 'metall' } };
    else if (ma.includes('metal')) s = { typ: 'glasmodern', vg: { glas: 'glasSilber', rahmen: 'metall' } };
    else if (ma.includes('concrete')) s = { typ: 'betonturm', vg: { wand: hell != null && hell > 0.7 ? 'betonPlatte' : 'betonWand' } };
    else if (ma.includes('plaster')) s = { typ: 'neubau', vg: { wand: wm || 'stuckWeiss' } };
    else if (wm && (wm.startsWith('ziegel') || (ma && /sandstein|kalkA|steinBlock|steinGelb/.test(wm)))) s = { typ: 'artdeco', vg: { wand: wm } };
    else if (hell != null && hell < 0.45) s = { typ: 'glasmodern', vg: { glas: glasF === 'glasSilber' ? 'glasDunkel' : glasF, rahmen: 'rahmenDunkel' } };
    else if (wm) s = { typ: 'betonturm', vg: { wand: wm } };
  }
  if (!s) return null;
  const ton = s.vg?.glas ? GLAS_TON[s.vg.glas] ?? 4 : s.vg?.wand ? TON_OSM[s.vg.wand] ?? 21 : s.typ === 'band' ? 7 : 21;
  return { typ: s.typ, variant: s.variant || '', vg: s.vg || null, fern: FERN_TYP[s.typ] ?? 2, ton };
}
