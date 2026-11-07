// Wolkenberge: echte Haufenwolken mit Volumen am Rechner (neu am 05.11.2026, Nader: "wolken realistischer", "wie GTA 6"). Verfahren wie Nubis (Horizon Zero Dawn):
// Strahlen in Viertelauflösung durch eine Schicht über dem Boden, Form aus Perlin-Worley Rauschen (64³), Ränder aus feinerem Worley Rauschen (32³),
// beide einmal im Worker gerechnet (kit/wolkenrausch.worker.js). Wetterkarte aus derselben Funktion wie Decke und Kugel (WOLKEN_GLSL) plus Felder und Türme.
// Licht aus der Atmosphäre (kit/atmos.js): Sonnenfarbe durch die Luft bis zur Wolke (Abendrot, Wolken glühen noch nach Sonnenuntergang), Himmelslicht, Boden von unten,
// nachts Mond und der Widerschein der Stadt. Ferne Wolken gehen in die Farbe des Himmels über. Das Bild wird über die Zeit gesammelt (Reprojektion mit Klammer der Nachbarn),
// dadurch kein Korn. Dazu eine Schattenkarte: Wolkenschatten ziehen über Stadt und Land (angewendet in AtmosPass). Am Handy bleibt die flache Decke (kit/wolkendecke.js).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RAUSCHEN_GLSL, WOLKEN_GLSL, WIRBEL } from './erde.js';
import { WETTER_K } from './livewetter.js';
import { HIMMEL_GLSL, HIMMEL_U } from './atmos.js';
import { MEER_U } from './meer_glsl.js';

const S_KARTE = 240000, KACHEL = 9000, BALLEN = 2700, DETAIL = 760, SIG = 0.03, SIG_V = 0.09;   // Karte 240 km, Lage der Wolken kachelt alle 5,4 km (Merkmale 1,4 km), Ballen alle 2,7 km (700 bis 170 m), Ränder alle 760 m (190 bis 24 m), Dichte je Meter
const num = v => v.toFixed(1);

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Wetterkarte: R Bedeckung (0 bis 1), G Höhe der Wolke im Verhältnis zur Schicht
const WETTER_FS = `uniform vec3 uMitteK, uOst, uNord, uZentrum; uniform mat3 uZuWelt; uniform float uMenge; varying vec2 vUv;
  ${RAUSCHEN_GLSL}
  ${WOLKEN_GLSL}
  void main() {
    vec3 p = uMitteK + uOst * (vUv.x - 0.5) * ${num(S_KARTE)} + uNord * (vUv.y - 0.5) * ${num(S_KARTE)};
    vec3 d = normalize(uZuWelt * normalize(p - uZentrum));
    vec3 dr = vec3(uWolken.y * 0.012, 0.0, -uWolken.y * 0.005);
    float dicht = wolkenDichte(d, 7.0);                                  // Wetterlage: dieselbe Funktion wie die Decke und die Schatten der Kugel
    float feld = smoothstep(0.3, 0.64, wolkenFbm(d * 380.0 + dr, 4.0));  // Wolkenfelder von rund 17 km
    float turm = wolkenFbm(d * 1400.0 + 3.1 + dr * 2.0, 3.0);            // Türme von rund 4,5 km
    float w = uMenge, f0 = mix(0.17, 0.9, smoothstep(0.0, 1.0, w));
    float f = max(clamp(f0 * (mix(0.12, 0.45, smoothstep(0.1, 0.6, w)) + mix(1.75, 1.1, smoothstep(0.1, 0.6, w)) * feld) + dicht * 0.35 * (0.4 + w), 0.0, 1.0), smoothstep(0.72, 0.98, w));   // Schönwetter: Gruppen von Wolken mit Lücken dazwischen   // Regen und Gewitter: geschlossene Decke
    float g = 0.42 + 0.58 * pow(smoothstep(0.34, 0.68, turm * 0.62 + feld * 0.22 + w * 0.2 + dicht * 0.14), 2.0);
    gl_FragColor = vec4(f, g, 0.0, 1.0);
  }`;

const DICHTE_U = `uniform sampler2D tWetter; uniform highp sampler3D tForm, tDetail; uniform mat3 uZuWelt; uniform vec3 uZentrum, uMitteK, uOst, uNord, uUrsprungMod, uDrift, uDriftD, uWindS; uniform float uR, uH0, uH1, uBallen;`;
// Dichte (Nubis): Grundform wird an der Bedeckung abgeschnitten, flache Unterseite, nach oben rund, Ränder angefressen (unten fransig, oben Blumenkohl). fein: mit Rändern
const DICHTE_GLSL = `
  float gTop = 0.0;
  float rm(float v, float a, float b) { return clamp((v - a) / max(b - a, 1e-4), 0.0, 1.0); }
  vec2 kugel(vec3 o, vec3 d, float r) { vec3 oc = o - uZentrum; float b = dot(oc, d), c = dot(oc, oc) - r * r, h = b * b - c; if (h < 0.0) return vec2(1e30, -1e30); h = sqrt(h); return vec2(-b - h, -b + h); }
  // stufe 0: nur die Hülle (Schatten, weite Lichtschritte, leere Luft überspringen), 1: mit Ballen, 2: mit feinen Rändern (Sichtstrahl)
  // Neu am 06.11.2026 (Nader: "Wolken ... wie echt", vorher Wattebausch): Hülle wie bei Nubis 3: die Ballen schneiden an der Schwelle 1 minus Hülle, am Rand der Wolke bleiben nur die Spitzen des Rauschens stehen. Das gibt Blumenkohl mit klarer Kante statt glatter Schale
  float wolke(vec3 p, float lod, int stufe, out float hRel) {
    hRel = 0.0;
    vec3 rel = p - uZentrum; float rr = length(rel), hb = rr - uR - uH0, hn = hb / (uH1 - uH0);
    if (hn <= 0.0 || hn >= 1.0) return 0.0;
    vec3 q = p - uMitteK; vec2 uv = vec2(dot(q, uOst), dot(q, uNord)) / ${num(S_KARTE)} + 0.5;
    vec2 wet = textureLod(tWetter, uv, 0.0).rg;
    float f = wet.r * smoothstep(0.5, 0.38, abs(uv.x - 0.5)) * smoothstep(0.5, 0.38, abs(uv.y - 0.5));   // am Rand der Karte weich aus
    if (f < 0.015) return 0.0;
    // Säule: das Rauschen ändert sich nach oben kaum (eine Wolke steht als Ganzes, der Himmel hat echte Lücken)
    vec3 e = uUrsprungMod + uZuWelt * p + uDrift + uWindS * hn, eS = e - uZuWelt * (rel / rr) * hb * 0.72;
    vec4 s = textureLod(tForm, eS / ${num(KACHEL)}, lod);
    vec4 s2 = textureLod(tForm, eS / ${num(KACHEL * 0.37)}, lod);
    float wf = s.g * 0.625 + s.b * 0.25 + s.a * 0.125, base = rm(s.r, wf - 1.0, 1.0);
    // Schönwetter (06.11.2026, Nader: "Wolken realistischer", vorher einzelne Popcorn Bälle): viele kleine flache Haufenwolken von 300 bis 800 m in Gruppen statt weniger großer Kugeln. Je mehr Bedeckung, desto mehr zählt die große Form
    float klein = smoothstep(0.34, 0.14, f), wf2 = s2.g * 0.625 + s2.b * 0.25 + s2.a * 0.125; base = mix(base, rm(s2.r, wf2 - 1.0, 1.0) * (0.86 + 0.14 * base), klein);
    float c = rm(base, 0.92 - 0.5 * f, 1.0);                             // Schwelle aus der gemessenen Verteilung des Rauschens: f ist etwa der Anteil an Wolke
    if (c <= 0.0) return 0.0;
    // Dach: mehrere Köpfe statt eines Doms, die Höhe wechselt innerhalb der Wolke
    float kopf = s.g * 0.5 + s2.g * 0.5;   // zwei Größen
    float top = sqrt(c * (2.0 - c)) * wet.g * (0.34 + 1.0 * kopf) * mix(1.0, 0.46, klein), bot = 0.02 * (1.0 - c); gTop = top;
    hRel = hn / max(top, 1e-3);
    if (hn >= top || hn <= bot) return 0.0;
    float hR = clamp(hRel, 0.0, 1.0), huelle = pow(c, mix(0.62, 1.05, smoothstep(0.0, 0.32, hR))) * rm(hn, bot, bot + 0.022) * (1.0 - hR * hR * hR) * smoothstep(0.05, 0.16, top);   // breiter Rand: dort entstehen die Ballen. Sehr flache Säulen fallen weg, sonst liegt ein Schleier zwischen den Köpfen
    if (stufe == 0) return huelle * 0.8;
    vec4 b3 = textureLod(tForm, e / uBallen, lod);
    float n = b3.g * 0.6 + b3.b * 0.28 + b3.a * 0.12;                     // Ballen: Worley in drei Größen, Mitte hell
    float rho = rm(n, 1.0 - huelle * 1.28, 1.0 - huelle * 0.75);
    if (stufe == 1 || rho <= 0.0) return rho;
    vec3 dn = textureLod(tDetail, (e + uDriftD) / ${num(DETAIL)}, 0.0).rgb;
    float hf = dn.r * 0.6 + dn.g * 0.28 + dn.b * 0.12, ero = mix(hf, 1.0 - hf, clamp(hR * 3.5, 0.0, 1.0));   // unten fransig, oben Blumenkohl
    // Neu am 06.11.2026: die feinen Ränder verschieben die Schwelle selbst. Vorher schnitten sie nur das letzte Stück ab, die Kante blieb glatt wie Watte, jetzt beulen sie die Fläche um bis zu 60 m aus
    return rm(n + (ero - 0.5) * 0.3 * (1.0 - 0.6 * huelle), 1.0 - huelle * 1.28 + 0.03, 1.0 - huelle * 0.75 + 0.03);
  }`;

const WOLKEN_FS = `uniform sampler2D tTiefe; uniform mat4 uProjInv, uKamWelt; uniform vec3 uKam, uLicht, uLichtF, uHimmelA, uBodenA, uStadt, uBR; uniform float uNah, uFern, uEin, uBA, uHK, uFrame, uDipW, uNahAus, uDaemmer; uniform vec2 uJit; varying vec2 vUv;
  ${DICHTE_U}
  ${HIMMEL_GLSL}
  ${DICHTE_GLSL}
  float tiefeZuAbstand(float d, vec3 dirV) { float z = (2.0 * uNah * uFern) / (uFern + uNah - (2.0 * d - 1.0) * (uFern - uNah)); return z / max(-dirV.z, 1e-4); }
  float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }   // auf 1 für gleichmäßige Streuung normiert
  float schicht(float y0, float dy, float d, float H) { float k = dy / H; float f = abs(k * d) < 1e-3 ? d : (1.0 - exp(-k * d)) / k; return exp(-max(y0, -2000.0) / H) * f; }
  float zufall(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }   // weißes Rauschen: mittelt sich über die Zeit ohne Muster
  void main() {
    vec4 v = uProjInv * vec4((vUv + uJit) * 2.0 - 1.0, 1.0, 1.0); vec3 dirV = normalize(v.xyz / v.w), dir = normalize(mat3(uKamWelt) * dirV);
    vec2 a = kugel(uKam, dir, uR + uH1), b = kugel(uKam, dir, uR + uH0);
    float hk = length(uKam - uZentrum) - uR, t0, t1;
    if (a.y < 0.0 || a.x > a.y) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    if (hk < uH0) { t0 = b.y; t1 = a.y; }                               // darunter: von der Unterseite bis oben raus
    else if (hk < uH1) { t0 = 0.0; t1 = b.x > 0.0 ? b.x : a.y; }        // mittendrin
    else { t0 = max(a.x, 0.0); t1 = b.x > 0.0 ? b.x : a.y; }            // darüber: oben rein, unten oder seitlich raus
    float tz = texture2D(tTiefe, vUv + uJit).x, szene = tz >= 0.99999 ? 1e30 : tiefeZuAbstand(tz, dirV);
    if (hk < uH0 && szene < t0) szene = 1e30;                           // Haus oder Baum davor: trotzdem rechnen (hält die Ränder sauber, der Mischer blendet dort aus)
    t1 = min(t1, min(szene, t0 + 170000.0));
    if (t1 <= t0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    // Seit 06.11.2026: leere Luft mit großen Schritten überspringen, in der Wolke kleine Schritte nach dem Abstand (vorher 48 Schritte über 160 km: auf eine nahe Wolke kamen nur 3, darum wirkte sie glatt)
    // Seit 06.11.2026 (Wunsch Nr. 56): die Schrittweite richtet sich auch nach der Länge des Wegs durch die Schicht. Von oben ist die Schicht nur rund 800 m dick, aus 30 km Höhe sprang der Strahl mit Schritten über 1 km einfach hinweg: die Wolken waren unsichtbar und tauchten bei 12 km plötzlich auf
    float schrittMax = max((t1 - t0) / 24.0, 20.0);
    const int N = 84;
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), zit = fract(ign + mod(uFrame, 64.0) * 0.61803399);
    float cth = dot(dir, uLicht), ph = mix(mix(hg(cth, -0.2), hg(cth, 0.74), 0.62), 1.0, 0.32), pK = 0.6 * (0.5 - 0.5 * cth);
    vec3 col = vec3(0.0); float T = 1.0, tM = 0.0, gM = 0.0, form = 1.0, formH = 1.0, t = t0 + min(clamp(t0 * 0.0095, 20.0, 520.0), schrittMax) * 4.0 * zit, leer = 0.0; bool erst = true, drin = false;
    for (int i = 0; i < N; i++) {
      if (t >= t1) break;
      float dtF = min(clamp(t * 0.0095, 20.0, 520.0), schrittMax), lod = clamp(log2(max(t, 1.0) / 8400.0), 0.0, 3.0); float hRel; vec3 p = uKam + dir * t;
      if (!drin) {
        if (wolke(p, lod + 0.5, 0, hRel) * uEin <= 0.0005) { t += dtF * 4.0; continue; }
        drin = true; leer = 0.0; t = max(t0, t - dtF * 3.2); continue;
      }
      int stufe = t < 20000.0 ? 2 : 1;
      float rho = wolke(p, lod, stufe, hRel) * uEin;
      if (uNahAus > 0.0) rho *= smoothstep(uNahAus * 0.2, uNahAus, t);   // freie Kamera: nahe Wolken durchscheinend, sonst blendet jede Wolke beim Zoomen das ganze Bild weiß (im Flieger bleibt das Hindurchfliegen echt)
      if (rho > 0.002) {
        leer = 0.0;
        if (erst) {   // erste Berührung: Richtung der Fläche messen, das zeichnet die Ballen
          erst = false;
          if (t < 20000.0) { float hm, e = max(26.0, t * 0.006), r0 = wolke(p, lod, 1, hm); vec3 gr = vec3(wolke(p + vec3(e, 0.0, 0.0), lod, 1, hm), wolke(p + vec3(0.0, e, 0.0), lod, 1, hm), wolke(p + vec3(0.0, 0.0, e), lod, 1, hm)) - r0;
            vec3 nW = -gr / max(length(gr), 1e-4); form = clamp(0.62 + 0.62 * dot(nW, uLicht), 0.2, 1.22); formH = 0.68 + 0.32 * nW.y; }
        }
        float sig = rho * ${SIG_V.toFixed(4)};
        // Licht: 5 Schritte zur Sonne oder zum Mond (je weiter, desto gröber), fern weniger
        float od = 0.0, s = 32.0 + t * 0.0016; vec3 q = p; int nl = t > 16000.0 ? 3 : 5;
        for (int j = 0; j < nl; j++) { q += uLicht * s; float hq; od += wolke(q, lod + 0.5, j < 2 ? 1 : 0, hq) * s; s *= 2.0; }
        float tl = od * ${SIG.toFixed(4)};
        float dicke = gTop, Tl = exp(-tl * 1.25) * 0.72 + exp(-tl * 0.2) * 0.28;                  // Mehrfachstreuung genähert: Licht dringt tiefer ein, Falten bleiben aber lesbar
        float puder = 1.0 - exp(-(tl + sig * 120.0) * 1.6);                              // Falten dunkler (Blumenkohl), im Gegenlicht schwächer
        float hR = clamp(hRel, 0.0, 1.0), un = (1.0 - hR) * (1.0 - hR), tiefe = exp(-tl * 0.1);
        vec3 S = uLichtF * 0.66 * Tl * ph * mix(1.0, puder, pK) * form + (uHimmelA * uDaemmer * (0.5 + 0.5 * tiefe) + uLichtF * 0.1 * tiefe) * mix(0.46 - 0.26 * clamp(dicke * 1.6, 0.0, 1.0), 1.0, smoothstep(0.0, 0.55, hR)) * formH + (uBodenA + uStadt) * un;
        float tr = exp(-sig * dtF), g = T * (1.0 - tr);
        col += S * g; tM += t * g; gM += g; T *= tr;
        if (T < 0.015) break;
      } else if ((leer += 1.0) > 7.0) drin = false;
      t += dtF;
    }
    // Luftperspektive: was vor der Wolke an Luft liegt, kommt aus dem Himmel. Ferne Wolken gehen ohne Kante in den Himmel über
    if (gM > 1e-4) {
      float d = tM / gM, dy = dir.y; vec3 od = uBR * schicht(uHK, dy, d, 8000.0); float oa = uBA * 0.6 * schicht(uHK, dy, d, 1500.0);
      float kL = smoothstep(150.0, 2600.0, uHK); vec3 Ta = exp(-(od + vec3(oa))), ins = himmelLUT(normalize(vec3(dir.x, max(dir.y, mix(0.018, uDipW + 0.006, kL)), dir.z))), wa = 1.0 - Ta; { vec3 wg = mix(wa, vec3(dot(wa, vec3(0.3333))), 0.55); wg *= wg; wa = mix(wa, wg, kL); }   // wie die Luftperspektive des Bodens (kit/atmos.js)
      col = col * (1.0 - wa) + ins * wa * (1.0 - T);
    }
    gl_FragColor = vec4(col, T);
  }`;

// Bild über die Zeit sammeln: letzter Stand an die Stelle der Kamera von damals zurückgerechnet, auf den Bereich der Nachbarn geklammert (kein Nachziehen)
const SAMMEL_FS = `uniform sampler2D tNeu, tAlt; uniform vec2 uTexel, uSub; uniform mat4 uVPalt, uProjInv, uKamWelt; uniform vec3 uKam, uZentrum; uniform float uRref, uMisch; varying vec2 vUv;
  void main() {
    vec2 sub = mod(floor(gl_FragCoord.xy), 2.0); bool jetzt = sub.x == uSub.x && sub.y == uSub.y;   // nur dieser Bildpunkt von vieren hat in diesem Bild einen neuen Wert (Sammelbild doppelt so fein wie der Lauf)
    vec4 c = texture2D(tNeu, vUv), mn = c, mx = c;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { if (x == 0 && y == 0) continue; vec4 n = texture2D(tNeu, vUv + vec2(float(x), float(y)) * uTexel); mn = min(mn, n); mx = max(mx, n); }
    if (uMisch >= 0.999) { gl_FragColor = c; return; }
    vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 dir = normalize(mat3(uKamWelt) * normalize(v.xyz / v.w));
    vec3 oc = uKam - uZentrum; float b = dot(oc, dir), cc = dot(oc, oc) - uRref * uRref, h = b * b - cc, t = 40000.0;
    if (h > 0.0) { h = sqrt(h); t = -b - h > 0.0 ? -b - h : -b + h; if (t <= 0.0) t = 40000.0; }
    vec4 q = uVPalt * vec4(uKam + dir * t, 1.0); vec2 a = q.xy / q.w * 0.5 + 0.5;
    if (q.w <= 0.0 || a.x < 0.0 || a.x > 1.0 || a.y < 0.0 || a.y > 1.0) { gl_FragColor = c; return; }
    vec4 sp = (mx - mn) * 0.3, alt = clamp(texture2D(tAlt, a), mn - sp, mx + sp);
    gl_FragColor = jetzt ? mix(alt, texelFetch(tNeu, ivec2(floor(gl_FragCoord.xy * 0.5)), 0), uMisch) : alt;
  }`;

// Schattenkarte: vom Boden zur Sonne durch die Schicht
const SCHATTEN_FS = `uniform vec3 uFeldMitte, uLicht; uniform float uFeldS; varying vec2 vUv;
  ${DICHTE_U}
  ${DICHTE_GLSL}
  void main() {
    vec3 g = uFeldMitte + uOst * (vUv.x - 0.5) * uFeldS + uNord * (vUv.y - 0.5) * uFeldS;
    vec2 a = kugel(g, uLicht, uR + uH0), b = kugel(g, uLicht, uR + uH1);
    float t0 = max(a.y, 0.0), L = min(b.y - t0, 14000.0), od = 0.0;
    if (L > 0.0) { const int N = 9; float dt = L / float(N); for (int i = 0; i < N; i++) { float hq; od += wolke(g + uLicht * (t0 + (float(i) + 0.5) * dt), 0.5, 1, hq) * dt; } }
    float T = exp(-od * ${SIG.toFixed(4)} * 0.45);
    gl_FragColor = vec4(T, T, T, 1.0);
  }`;

// Mischen in voller Auflösung: was näher liegt als die Unterseite der Schicht (Kamera darunter), bekommt keine Wolke. Hochrechnen bikubisch (schärfer als linear, keine Rauten)
const MISCH_FS = `uniform sampler2D tSzene, tWolken, tTiefe; uniform mat4 uProjInv, uKamWelt; uniform vec3 uKam, uZentrum; uniform float uR, uH0, uNah, uFern; uniform vec2 uGroesse; varying vec2 vUv;
  vec4 bikubisch(sampler2D t, vec2 uv, vec2 g) {
    vec2 p = uv * g, pc = floor(p - 0.5) + 0.5, f = p - pc;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f), w12 = w1 + w2;
    vec2 t0 = (pc - 1.0) / g, t3 = (pc + 2.0) / g, t12 = (pc + w2 / w12) / g;
    vec4 c = texture2D(t, vec2(t12.x, t0.y)) * w12.x * w0.y + texture2D(t, vec2(t0.x, t12.y)) * w0.x * w12.y + texture2D(t, t12) * w12.x * w12.y + texture2D(t, vec2(t3.x, t12.y)) * w3.x * w12.y + texture2D(t, vec2(t12.x, t3.y)) * w12.x * w3.y;
    return c / (w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y);
  }
  // weich statt scharf: das Sammelbild trägt noch das Raster des Laufs, Wolken vertragen die leichte Unschärfe (Karte Wolken ohne Raster)
  vec4 weich(sampler2D t, vec2 uv, vec2 g) { vec2 e = 1.25 / g; return texture2D(t, uv) * 0.2 + (texture2D(t, uv + vec2(e.x, e.y)) + texture2D(t, uv + vec2(-e.x, e.y)) + texture2D(t, uv + vec2(e.x, -e.y)) + texture2D(t, uv + vec2(-e.x, -e.y))) * 0.14 + (texture2D(t, uv + vec2(e.x * 1.9, 0.0)) + texture2D(t, uv + vec2(-e.x * 1.9, 0.0)) + texture2D(t, uv + vec2(0.0, e.y * 1.9)) + texture2D(t, uv + vec2(0.0, -e.y * 1.9))) * 0.06; }
  void main() {
    vec4 s = texture2D(tSzene, vUv);
    float hk = length(uKam - uZentrum) - uR;
    if (hk < uH0) {
      float d = texture2D(tTiefe, vUv).x;
      if (d < 0.99999) {
        vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); vec3 dirV = normalize(v.xyz / v.w), dir = normalize(mat3(uKamWelt) * dirV);
        float z = (2.0 * uNah * uFern) / (uFern + uNah - (2.0 * d - 1.0) * (uFern - uNah)), szene = z / max(-dirV.z, 1e-4);
        vec3 oc = uKam - uZentrum; float b = dot(oc, dir), c = dot(oc, oc) - (uR + uH0) * (uR + uH0), h = b * b - c;
        float tBasis = h > 0.0 ? -b + sqrt(h) : 1e30;
        if (szene < tBasis) { gl_FragColor = s; return; }
      }
    }
    vec4 w = weich(tWolken, vUv, uGroesse); w.rgb = max(w.rgb, vec3(0.0)); w.a = clamp(w.a, 0.0, 1.0);
    vec3 aus = s.rgb * w.a + w.rgb;
    if (any(isnan(aus)) || any(isinf(aus))) aus = s.rgb;   // nie ein ungültiger Bildpunkt (würde im Glanz weiß aufblitzen)
    gl_FragColor = vec4(min(aus, vec3(64.0)), s.a);
  }`;

function textur3D(data, n) {
  const t = new THREE.Data3DTexture(data, n, n, n); t.format = THREE.RGBAFormat; t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
const REIHUM = [[0, 0], [1, 1], [1, 0], [0, 1]];
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _h = new THREE.Vector3();

export class Wolkenberge extends Pass {
  constructor({ renderer, uWolken, atmos }) {
    super();
    this.renderer = renderer; this.atmos = atmos; this.needsSwap = true; this.enabled = false; this.bereit = false; this.ein = 0;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
    this.wetterRT = new THREE.WebGLRenderTarget(384, 384, opt);
    this.schattenRT = new THREE.WebGLRenderTarget(384, 384, { ...opt, type: THREE.UnsignedByteType });
    this.neuRT = new THREE.WebGLRenderTarget(2, 2, opt); this.histA = new THREE.WebGLRenderTarget(2, 2, opt); this.histB = new THREE.WebGLRenderTarget(2, 2, opt);
    const G = this.gem = { uZentrum: { value: new THREE.Vector3() }, uMitteK: { value: new THREE.Vector3() }, uOst: { value: new THREE.Vector3(1, 0, 0) }, uNord: { value: new THREE.Vector3(0, 0, -1) }, uZuWelt: { value: new THREE.Matrix3() } };
    const D = this.dichteU = { ...G, tWetter: { value: this.wetterRT.texture }, tForm: { value: null }, tDetail: { value: null }, uUrsprungMod: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector3() }, uDriftD: { value: new THREE.Vector3() }, uWindS: { value: new THREE.Vector3() }, uR: { value: 6371000 }, uH0: { value: 1300 }, uH1: { value: 4000 }, uBallen: { value: BALLEN } };
    this.wetter = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...G, uWolken, uMenge: { value: 0 }, ...WETTER_K, ...WIRBEL }, vertexShader: VS, fragmentShader: WETTER_FS, depthTest: false, depthWrite: false }));
    this.wolken = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...D, ...HIMMEL_U, tTiefe: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uKamWelt: { value: new THREE.Matrix4() }, uKam: { value: new THREE.Vector3() }, uLicht: { value: new THREE.Vector3(0, 1, 0) }, uLichtF: { value: new THREE.Vector3(1, 1, 1) },
      uDaemmer: { value: 1 }, uHimmelA: { value: new THREE.Vector3() }, uBodenA: { value: new THREE.Vector3() }, uStadt: { value: new THREE.Vector3() }, uBR: { value: new THREE.Vector3(5.802e-6, 13.558e-6, 33.1e-6) }, uBA: { value: 1 / 16000 }, uHK: { value: 2 }, uDipW: atmos.dipU, uNahAus: { value: 0 }, uNah: { value: 1 }, uFern: { value: 1e5 }, uEin: { value: 0 }, uFrame: { value: 0 }, uJit: { value: new THREE.Vector2() } },
      vertexShader: VS, fragmentShader: WOLKEN_FS, depthTest: false, depthWrite: false }));
    const W = this.wolken.material.uniforms;
    this.sammel = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tNeu: { value: this.neuRT.texture }, tAlt: { value: this.histA.texture }, uTexel: { value: new THREE.Vector2() }, uSub: { value: new THREE.Vector2() }, uVPalt: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uKamWelt: W.uKamWelt, uKam: W.uKam, uZentrum: G.uZentrum, uRref: { value: 6373000 }, uMisch: { value: 1 } }, vertexShader: VS, fragmentShader: SAMMEL_FS, depthTest: false, depthWrite: false }));
    this.schatten = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { ...D, uFeldMitte: { value: new THREE.Vector3() }, uFeldS: { value: 20000 }, uLicht: W.uLicht }, vertexShader: VS, fragmentShader: SCHATTEN_FS, depthTest: false, depthWrite: false }));
    this.misch = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tSzene: { value: null }, tWolken: { value: this.histA.texture }, tTiefe: W.tTiefe, uProjInv: W.uProjInv, uKamWelt: W.uKamWelt, uKam: W.uKam, uZentrum: G.uZentrum, uR: D.uR, uH0: D.uH0, uNah: W.uNah, uFern: W.uFern, uGroesse: { value: new THREE.Vector2(2, 2) } }, vertexShader: VS, fragmentShader: MISCH_FS, depthTest: false, depthWrite: false }));
    this.karteMitte = null; this.karteT = 99; this.schattenT = 99; this.frame = 0; this.histGut = false; this.vpAlt = new THREE.Matrix4(); this.vpNeu = new THREE.Matrix4(); this.anker = null; this.ankerNeu = false; this.h0 = null;
    this.drift = new THREE.Vector3(); this.driftD = new THREE.Vector3();
    const wk = new Worker(new URL('./wolkenrausch.worker.js', import.meta.url));
    wk.onmessage = e => { D.tForm.value = textur3D(e.data.form, e.data.n); D.tDetail.value = textur3D(e.data.det, e.data.d); this.bereit = true; wk.terminate(); };
    wk.postMessage(1);
  }
  setSize(w, h) {
    const a = Math.max(2, Math.ceil(w / 4)), b = Math.max(2, Math.ceil(h / 4));   // Viertelauflösung (Wolken sind weich, das Sammeln über die Zeit holt die Schärfe zurück)
    this.neuRT.setSize(a, b); this.histA.setSize(a * 2, b * 2); this.histB.setSize(a * 2, b * 2);   // Lauf in Viertelauflösung, gesammelt in halber: jeder der vier feinen Punkte kommt reihum dran (wie in großen Spielen)
    this.sammel.material.uniforms.uTexel.value.set(1 / a, 1 / b); this.misch.material.uniforms.uGroesse.value.set(a * 2, b * 2); this.histGut = false;
  }
  // je Bild: welt ErdWelt (Anker), kamHoehe über dem Meer, hoeheGrund über Grund, sonne lokal, an: zeigen. wetter 0 bis 1, licht wie Wetter (bedeckt weniger Sonne), nacht 0 bis 1
  update(welt, camera, { kamHoehe, hoeheGrund = 0, sonne, atmos, dt, an, wetter = 0, licht = 1, nacht = 0, stadt = 1, beta = 1 / 16000, nahAus = 0, ev = 1 }) {
    this.enabled = !!(an && this.bereit);
    if (!this.enabled) { this.karteMitte = null; this.histGut = false; if (this.atmosPass) this.atmosPass.schattenSetzen(null); MEER_U.uSchK.value = 0; return; }
    this.ein = Math.min(1, this.ein + dt / 1.5);
    const W = this.wolken.material.uniforms, D = this.dichteU, G = this.gem;
    welt.weltZuLokal(_v.set(0, 0, 0), G.uZentrum.value);
    const oben = _o.subVectors(camera.position, G.uZentrum.value), rK = oben.length(); oben.normalize();
    const R = rK - kamHoehe; D.uR.value = R;
    // Schicht: Unterseite rund 1,3 km über dem Meer, über hohem Land entsprechend höher; dicker bei mehr Wolken
    const boden = kamHoehe - hoeheGrund, h0Ziel = 1300 + 0.75 * Math.max(0, boden - 300);
    this.h0 = this.h0 === null ? h0Ziel : this.h0 + (h0Ziel - this.h0) * (1 - Math.exp(-dt / 20));
    D.uH0.value = this.h0; D.uH1.value = this.h0 + THREE.MathUtils.lerp(820, 5600, Math.pow(wetter, 1.15));   // Schönwetter: flache Haufenwolken, rund 400 bis 1.200 m hoch (vorher 2,8 km: hohe Klötze)
    this.sammel.material.uniforms.uRref.value = R + this.h0 + 300;
    // Licht aus der Atmosphäre: Sonne auf Wolkenhöhe (leuchtet noch nach Sonnenuntergang am Boden), sonst Mond
    const sw = atmos.sonneWolken, kannSonne = sw.r + sw.g + sw.b > 0.01;
    D.uBallen.value = BALLEN * (1 + 1.5 * wetter * wetter);   // Schlechtwetter: große Türme statt kleiner Ballen
    const ueber = THREE.MathUtils.smoothstep(kamHoehe, this.h0, this.h0 + 3500), E = 1.7 * THREE.MathUtils.lerp(0.3 + 0.7 * licht, 1, ueber) / Math.pow(ev, 0.85);   // über den Wolken scheint die Sonne immer. Geteilt durch die automatische Belichtung (kit/auge.js): sonst brennen die Wolken weiß aus, wenn das Auge sich an den dunklen Wald gewöhnt
    if (kannSonne) { W.uLicht.value.copy(sonne).normalize(); W.uLichtF.value.set(sw.r * E * 1.13, sw.g * E * 1.19, sw.b * E * 1.33); }
    else { W.uLicht.value.copy(atmos.mondDir); const m = 0.16 * THREE.MathUtils.smoothstep(nacht, 0.5, 1) * (0.3 + 0.7 * licht); W.uLichtF.value.set(m * 0.82, m * 0.92, m * 1.12); }
    W.uDaemmer.value = 1 + 1.4 * Math.max(0, 1 - Math.max(0, sonne.y) / 0.22);   // tiefe Sonne: der helle Himmel beleuchtet die Wolken stärker, sonst stehen harte dunkle Klumpen vor dem Abendhimmel
    const hf = atmos.himmelFarbe, hl = hf.r * 0.3 + hf.g * 0.55 + hf.b * 0.15; { const kH = 0.28 - 0.2 * wetter, hH = 0.8 + 0.5 * wetter; W.uHimmelA.value.set(THREE.MathUtils.lerp(hl, hf.r, kH) * hH, THREE.MathUtils.lerp(hl, hf.g, kH) * hH, THREE.MathUtils.lerp(hl, hf.b, kH) * hH); }   // Licht vom Himmel: in der Wolke vielfach gestreut, darum weniger blau
    const tagKraft = Math.max(0, sonne.y) * E * 0.2;
    W.uBodenA.value.set(tagKraft * 0.95, tagKraft * 0.88, tagKraft * 0.78);
    const st = 0.05 * nacht * stadt; W.uStadt.value.set(st * 1.0, st * 0.62, st * 0.36);
    const ausHoehe = 1 - THREE.MathUtils.smoothstep(hoeheGrund, 26000, 62000);   // oben übernimmt die Wolkendecke, weich überblendet
    W.uBA.value = beta; W.uHK.value = kamHoehe; W.uEin.value = this.ein * ausHoehe; W.uNahAus.value = nahAus;
    G.uZuWelt.value.setFromMatrix4(_m.makeRotationFromQuaternion(welt.zuWelt));
    const m = a => ((a % KACHEL) + KACHEL) % KACHEL; D.uUrsprungMod.value.set(m(welt.ursprung.x), m(welt.ursprung.y), m(welt.ursprung.z));
    // Wind: Wolken ziehen langsam nach Osten, oben etwas voraus (geneigte Türme), Ränder brodeln
    _h.set(7.5, 0, 2.5).applyNormalMatrix(G.uZuWelt.value);
    this.drift.addScaledVector(_h, -dt); this.driftD.addScaledVector(_h, -dt * 0.35);
    this.drift.set(m(this.drift.x), m(this.drift.y), m(this.drift.z)); this.driftD.set(m(this.driftD.x), m(this.driftD.y), m(this.driftD.z));
    D.uDrift.value.copy(this.drift); D.uDriftD.value.copy(this.driftD); D.uWindS.value.copy(_h).multiplyScalar(-60);
    // Wetterkarte neu: wenn die Kamera ein Sechstel der Karte weiter ist, der Anker gewechselt hat oder alle 3 s (Drift)
    const nadir = G.uZentrum.value.clone().addScaledVector(oben, R);
    this.karteT += dt;
    this.ankerNeu = !this.anker || this.anker.distanceToSquared(welt.ursprung) > 1;
    const r = this.renderer;
    if (!this.karteMitte || this.ankerNeu || this.karteMitte.distanceTo(nadir) > S_KARTE / 6 || this.karteT > 3 || Math.abs(this.mengeAlt - wetter) > 0.02) {
      this.karteT = 0; this.anker = welt.ursprung.clone(); this.karteMitte = nadir.clone(); this.mengeAlt = wetter;
      const hilf = Math.abs(oben.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      G.uOst.value.crossVectors(hilf, oben).normalize(); G.uNord.value.crossVectors(oben, G.uOst.value).normalize(); G.uMitteK.value.copy(nadir);
      this.wetter.material.uniforms.uMenge.value = wetter;
      const alt = r.getRenderTarget(); r.setRenderTarget(this.wetterRT); this.wetter.render(r); r.setRenderTarget(alt);
    }
    // Schattenkarte um den Punkt unter der Kamera, alle paar Bilder (die Wolken ziehen langsam). Von oben größer, damit auch das Land darunter Schatten hat
    this.schattenT += dt;
    if (this.atmosPass) {
      const S = this.schatten.material.uniforms, feld = THREE.MathUtils.clamp(hoeheGrund * 3, 18000, 240000), tag = kannSonne ? THREE.MathUtils.smoothstep(sonne.y, 0.0, 0.14) : 0;
      const stark = tag * (0.25 + 0.75 * licht) * this.ein * ausHoehe;
      if (stark > 0.01 && (this.schattenT > 0.06 || this.ankerNeu)) {
        this.schattenT = 0;
        S.uFeldS.value = feld; S.uFeldMitte.value.copy(camera.position).addScaledVector(oben, -hoeheGrund);
        const alt = r.getRenderTarget(); r.setRenderTarget(this.schattenRT); this.schatten.render(r); r.setRenderTarget(alt);
        this.atmosPass.schattenSetzen({ tex: this.schattenRT.texture, mitte: S.uFeldMitte.value, ost: G.uOst.value, nord: G.uNord.value, s: feld, stark });
        MEER_U.tWolkenS.value = this.schattenRT.texture; MEER_U.uSchM.value.copy(S.uFeldMitte.value); MEER_U.uSchO.value.copy(G.uOst.value); MEER_U.uSchN.value.copy(G.uNord.value); MEER_U.uSchS.value = feld; MEER_U.uSchK.value = stark;
      } else if (stark <= 0.01) { this.atmosPass.schattenSetzen(null); MEER_U.uSchK.value = 0; }
    }
  }
  // unmittelbar vor dem Rendern (Kamera steht endgültig)
  matrizen(camera) {
    const W = this.wolken.material.uniforms;
    W.uProjInv.value.copy(camera.projectionMatrixInverse); W.uKamWelt.value.copy(camera.matrixWorld); W.uKam.value.copy(camera.position); W.uNah.value = camera.near; W.uFern.value = camera.far;
    this.sammel.material.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    this.vpAlt.copy(this.vpNeu); this.vpNeu.multiplyMatrices(camera.projectionMatrix, _m.copy(camera.matrixWorld).invert());
    if (this.ankerNeu) { this.vpAlt.copy(this.vpNeu); this.ankerNeu = false; }   // neuer Anker: dasselbe Bild in einem neuen Rahmen, also ohne Rückrechnung weitersammeln
  }
  render(renderer, writeBuffer, readBuffer) {
    const W = this.wolken.material.uniforms, Sa = this.sammel.material.uniforms, Mi = this.misch.material.uniforms;
    W.tTiefe.value = this.atmosPass?.enabled ? this.atmosPass.gem.tTiefe.value : readBuffer.depthTexture;   // Tiefe der Szene (hinter dem Atmosphären Pass ist die Tiefe dieses Puffers alt)
    this.frame = (this.frame + 1) % 1024; W.uFrame.value = this.frame;
    const of = REIHUM[this.frame % 4]; Sa.uSub.value.set(of[0], of[1]); W.uJit.value.set((of[0] - 0.5) * 0.5 * Sa.uTexel.value.x, (of[1] - 0.5) * 0.5 * Sa.uTexel.value.y);
    renderer.setRenderTarget(this.neuRT); this.wolken.render(renderer);
    Sa.tAlt.value = this.histA.texture; Sa.uVPalt.value.copy(this.vpAlt); Sa.uMisch.value = this.histGut ? 0.3 : 1;
    renderer.setRenderTarget(this.histB); this.sammel.render(renderer);
    const t = this.histA; this.histA = this.histB; this.histB = t; this.histGut = true;
    Mi.tSzene.value = readBuffer.texture; Mi.tWolken.value = this.histA.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.misch.render(renderer);
  }
  dispose() { for (const r of [this.wetterRT, this.schattenRT, this.neuRT, this.histA, this.histB]) r.dispose(); for (const q of [this.wetter, this.wolken, this.sammel, this.schatten, this.misch]) q.dispose(); }
}
