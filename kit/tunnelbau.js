// Straßentunnel im Ortsworker (Wunsch Nr. 98, 09.11.2026, Nader: "alle Tunnel müssen auch da gebaut werden, also alles im Untergrund. Auch der
// Tunnel in der Mitte, 1:1, der ja durch Berlin geht vom Potsdamer Platz ... überall auf der Erde, wenn es dort Tunnel gibt").
// Aus den Straßenlinien (Kacheln: brunnel=tunnel, in Berlin dazu OSM tunnel und layer) werden Röhren. An jedem Portal (Tunnelende, an dem eine
// Straße ohne Tunnel anschließt) wird aus der Zufahrt ein offener Trog geschnitten: bis zu RAMPE Meter, nie über die nächste Kreuzung hinaus.
// Der Trog gilt danach wie ein Tunnel (keine Fahrbahn am Boden, kein Verkehr oben). Höhen rechnet der Hauptfaden (kit/tunnel.js) mit dem Gelände.
// Ausgabe je Stück: { p: [[x, z], ...], w, hw, offen (Trog), oben: 'a' | 'b' | null (welches Ende des Trogs auf Geländehöhe liegt) }

// Schalter: erst nach der Prüfung im Spiel an (Nr. 98). Prüfstände in node setzen globalThis.__tunnelTest
import { box, ueberlapp, schnitte, projektion } from './brueckenbau.js';
export const TUNNEL_BAUEN = true;
export const TIEFE = 7.0, RAMPE = 110;   // Fahrbahn der Röhre 7 m unter Gelände (4,5 m Lichte plus Decke und Überdeckung), Rampe mit rund 6,5 %
const FANG = 3.0;
const r2 = v => Math.round(v * 100) / 100;

function laengeL(l) { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; }
// Linie bei Abstand d vom Anfang teilen: [Anfang bis d, d bis Ende]
function teile(l, d) {
  let s = 0;
  for (let i = 1; i < l.length; i++) {
    const L = Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    if (s + L >= d) { const t = (d - s) / Math.max(L, 1e-6), q = [l[i - 1][0] + (l[i][0] - l[i - 1][0]) * t, l[i - 1][1] + (l[i][1] - l[i - 1][1]) * t]; return [[...l.slice(0, i), q], [q, ...l.slice(i)]]; }
    s += L;
  }
  return [l.slice(), [l[l.length - 1], l[l.length - 1]]];
}

// strassenLinien: Einträge { f: { linien, p }, hw, w, tunnel, ... } aus kit/ortbau.js. Teilt Zufahrten in Trog und Rest, liefert die Tunnelstücke
export function tunnelSammeln(strassenLinien, { halb = 600 } = {}) {
  if (!TUNNEL_BAUEN && !globalThis.__tunnelTest) return [];
  const key = (x, z) => Math.round(x / FANG) + ':' + Math.round(z / FANG), nah = (m, x, z) => { const ix = Math.round(x / FANG), iz = Math.round(z / FANG), o = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const e of m.get((ix + a) + ':' + (iz + b)) || []) if (Math.hypot(e.x - x, e.z - z) < FANG) o.push(e); return o; };
  const amRand = (x, z) => Math.abs(x) > halb - 2 || Math.abs(z) > halb - 2;
  // Enden aller Linien: Tunnel und offene Straßen getrennt
  const tEnden = new Map(), sEnden = new Map(), push = (m, e) => { const k = key(e.x, e.z); (m.get(k) || m.set(k, []).get(k)).push(e); };
  for (const s of strassenLinien) {
    if (s.hw === 'service' && !s.tunnel) continue;
    for (const l of s.f.linien) { if (l.length < 2) continue; for (const [ende, q] of [['a', l[0]], ['b', l[l.length - 1]]]) push(s.tunnel ? tEnden : sEnden, { s, l, ende, x: q[0], z: q[1] }); }
  }
  const stuecke = [], neu = [];
  for (const s of strassenLinien) {
    if (!s.tunnel || s.trog || /service|track|path/.test(s.hw)) continue;
    for (const l of s.f.linien) if (l.length >= 2 && laengeL(l) > 4) stuecke.push({ p: l.map(([x, z]) => [r2(x), r2(z)]), w: s.w, hw: s.hw, offen: false, oben: null });
  }
  // Portale: Tunnelende ohne weiteren Tunnel, mit angeschlossener Straße. Die Zufahrt wird bis RAMPE Meter zum Trog, nie über eine Kreuzung hinaus
  const erledigt = new Set(), alle = [];
  for (const s of strassenLinien) { if (s.tunnel || s.hw === 'service' || s.f.p.brunnel === 'bridge' || (+s.f.p.layer || 0) >= 1) continue; for (const l of s.f.linien) if (l.length >= 2) alle.push({ s, l, b: box(l) }); }   // Zufahrten (service) begrenzen den Trog nicht, ihre Fläche wird am Trog ausgespart
  for (const [, L] of tEnden) for (const t of L) {
    if (amRand(t.x, t.z)) continue;
    if (nah(tEnden, t.x, t.z).some(o => o.l !== t.l)) continue;   // hier geht der Tunnel weiter
    const zu = nah(sEnden, t.x, t.z).filter(o => !o.s.tunnel && !erledigt.has(o.l)); if (!zu.length) continue;
    for (const z of zu) {
      erledigt.add(z.l);
      // Zufahrt vom Portal weg, auch über einfache Fortsetzungen (am Ende genau eine weitere Straße) bis RAMPE. Vorher endete der Trog am Ende der
      // ersten Kachellinie: am Tiergartentunnel und am Alexanderplatz blieben 25 und 32 m Trog für 7 m Tiefe (35 % Gefälle, Prüfstand 09.11.2026)
      const kette = [{ e: z, l0: z.ende === 'b' ? z.l.slice().reverse() : z.l }]; let Lsum = laengeL(kette[0].l0), kreuzung = false;
      for (;;) {
        const letzte = kette[kette.length - 1], fern = letzte.l0[letzte.l0.length - 1], weiter = nah(sEnden, fern[0], fern[1]).filter(o => o.l !== letzte.e.l);
        if (weiter.length >= 2) { kreuzung = true; break; }
        if (!weiter.length || Lsum >= RAMPE || amRand(fern[0], fern[1])) break;
        const w = weiter[0]; if (w.s.tunnel || erledigt.has(w.l) || nah(tEnden, fern[0], fern[1]).length) { kreuzung = true; break; }
        erledigt.add(w.l); const l0 = w.ende === 'b' ? w.l.slice().reverse() : w.l; kette.push({ e: w, l0 }); Lsum += laengeL(l0);
      }
      // Feste Regel: der Trog endet 8 m vor jeder Straße, die ihn kreuzt (Winkel über 20 Grad) oder in ihn einmündet, auch mitten auf einer Linie
      // (die Kachellinien sind dort oft nicht geteilt, Alexanderplatz 09.11.2026). Parallele Fahrbahnen spart kit/ortbau.js am Trog aus
      const pfad = kette.reduce((P, { l0 }) => P.length ? P.concat(l0.slice(1)) : l0.slice(), []), bP = box(pfad), eigen = new Set(kette.map(k => k.e.l));
      let frei = Lsum;
      for (const o of alle) { if (eigen.has(o.l) || !ueberlapp(bP, o.b, 3)) continue; for (const c of schnitte(pfad, o.l)) if (c.d > 2 && c.sin > 0.34) frei = Math.min(frei, c.d - 8); for (const q of [o.l[0], o.l[o.l.length - 1]]) { const pr = projektion(pfad, q); if (pr.d < 2.5 && pr.s > 2) frei = Math.min(frei, pr.s - 8); } }
      const lang = Math.min(RAMPE, frei, kreuzung ? Lsum - 8 : Lsum); if (lang < 12) continue;
      // Trog aus der Kette schneiden: ganze Linien werden Trog, die letzte wird geteilt (ihr Rest bleibt Straße, gleiche Zeichenrichtung)
      let offen = lang; const trog = [];
      for (const { e, l0 } of kette) {
        const Ll = laengeL(l0), i = e.s.f.linien.indexOf(e.l); if (i < 0) break;
        if (Ll <= offen + 0.01) { trog.push(...(trog.length ? l0.slice(1) : l0)); e.s.f.linien.splice(i, 1); offen -= Ll; if (offen < 0.5) break; continue; }
        const [teil, uebrig] = teile(l0, offen), uebrigL = e.ende === 'b' ? uebrig.slice().reverse() : uebrig;
        trog.push(...(trog.length ? teil.slice(1) : teil)); if (laengeL(uebrigL) > 1) e.s.f.linien[i] = uebrigL; else e.s.f.linien.splice(i, 1);
        break;
      }
      if (trog.length < 2) continue;
      // Trog als eigene Linie mit Tunnelmerkmal (keine Fahrbahn am Boden, Portal des Verkehrs an seinem oberen Ende)
      neu.push({ ...z.s, tunnel: true, trog: true, f: { ...z.s.f, linien: [trog] } });
      stuecke.push({ p: trog.map(([x, zz]) => [r2(x), r2(zz)]), w: z.s.w, hw: z.s.hw, offen: true, oben: 'b' });   // Punkt 0 am Portal (unten), letzter Punkt auf Geländehöhe
    }
  }
  for (const e of neu) strassenLinien.push(e);
  return stuecke;
}
