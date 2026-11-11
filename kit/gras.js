// Gras in 3D um die Kamera (05.11.2026, Nader: "wie GTA 6"): feste Zahl Büschel als Instanzen, jedes hängt an der Welt (Lage modulo Kachel, wandert also nie mit), Höhe aus dem Gelände, nach außen weich kleiner (kein Aufpoppen), wiegt sich im Wind, bekommt Schatten. Rechner: 34.000 Büschel, Handy aus.
// Seit 06.11.2026 überall, wo das Satellitenbild Bewuchs zeigt: Maske Rot Stadtgrün, Grün Wald (lockeres kurzes Gras, dazu Farne), Blau offenes Land (Wiese, Steppe, Savanne: Farbe aus dem Bildpunkt, in trockenen Gegenden hoch und golden).
import * as THREE from 'three';

let _blatt = null, _farn = null;
// Bild mit Halmen, einmal gezeichnet: unten dunkel, oben heller, durchscheinend zwischen den Halmen
function halmBild() {
  if (_blatt) return _blatt;
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W * 2; c.height = H; const g = c.getContext('2d');
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // rechte Hälfte: Blumen, heller Kopf (die Farbe kommt je Büschel aus dem Shader), oben im Bild und klar vom Grün getrennt
  for (let i = 0; i < 11; i++) { const x = W + 14 + r() * (W - 28), h = H * (0.5 + r() * 0.42), kipp = (r() - 0.5) * 12, k = 6 + r() * 5;
    g.strokeStyle = 'rgb(70,104,44)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, H); g.lineTo(x + kipp, H - h); g.stroke();
    g.fillStyle = 'rgb(255,0,255)'; for (let b = 0; b < 6; b++) { const a = b / 6 * 6.283; g.beginPath(); g.ellipse(x + kipp + Math.cos(a) * k * 0.62, H - h + Math.sin(a) * k * 0.62, k * 0.52, k * 0.36, a, 0, 6.283); g.fill(); }
    g.fillStyle = 'rgb(232,190,60)'; g.beginPath(); g.arc(x + kipp, H - h, k * 0.42, 0, 6.283); g.fill(); }
  for (let i = 0; i < 46; i++) {
    const x = r() * W, h = H * (0.45 + r() * 0.55), b = 2.6 + r() * 3.4, kipp = (r() - 0.5) * 34, gr = 96 + r() * 72;
    const v = g.createLinearGradient(0, H, 0, H - h); v.addColorStop(0, `rgb(${gr * 0.56},${gr * 0.76},${gr * 0.32})`); v.addColorStop(1, `rgb(${gr * 0.86},${gr * 1.0},${gr * 0.46})`);
    g.fillStyle = v; g.beginPath(); g.moveTo(x - b, H); g.quadraticCurveTo(x - b * 0.4 + kipp * 0.3, H - h * 0.6, x + kipp, H - h); g.quadraticCurveTo(x + b * 0.5 + kipp * 0.3, H - h * 0.55, x + b, H); g.closePath(); g.fill();
  }
  _blatt = new THREE.CanvasTexture(c); _blatt.colorSpace = THREE.SRGBColorSpace; _blatt.wrapS = _blatt.wrapT = THREE.ClampToEdgeWrapping; _blatt.anisotropy = 4;
  return _blatt;
}
// Farnwedel (links) und breites Blatt der Tropen (rechts) auf einem Bild. v 0 am Stiel, v 1 an der Spitze
function farnBild() {
  if (_farn) return _farn;
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W * 2; c.height = H; const g = c.getContext('2d'); let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Farn: Mittelrippe, Fiedern werden zur Spitze kürzer, jede Fieder hat kleine Zähne
  g.strokeStyle = 'rgb(66,92,36)'; g.lineWidth = 5; g.beginPath(); g.moveTo(W / 2, H); g.quadraticCurveTo(W / 2 + 4, H / 2, W / 2, 6); g.stroke();
  for (let y = H - 34; y > 10; y -= 11) { const t = 1 - y / H, L = (W / 2 - 8) * Math.pow(Math.sin(Math.min(1, t * 1.06) * Math.PI * 0.94 + 0.1), 0.8) * (1 - t * 0.25);
    for (const sg of [-1, 1]) { const hell = 66 + r() * 34, f = `rgb(${hell * 0.62},${hell * 1.2},${hell * 0.42})`; g.fillStyle = f; const x0 = W / 2, y0 = y, xE = x0 + sg * L, yE = y0 - L * 0.34; g.beginPath(); g.moveTo(x0, y0 + 3); const Z = 7; for (let k = 1; k <= Z; k++) { const q = k / Z, b = 7 * (1 - q * 0.8); g.lineTo(x0 + (xE - x0) * q, y0 + (yE - y0) * q + b); } g.lineTo(xE, yE); for (let k = Z; k >= 1; k--) { const q = k / Z, b = 6 * (1 - q * 0.8); g.lineTo(x0 + (xE - x0) * (q - 0.05), y0 + (yE - y0) * q - b); } g.closePath(); g.fill(); } }
  // Breites Blatt: glänzend dunkelgrün, helle Mittelrippe, Seitenadern
  const cx = W + W / 2, gr = g.createLinearGradient(W, 0, W * 2, 0); gr.addColorStop(0, 'rgb(36,86,34)'); gr.addColorStop(0.5, 'rgb(60,118,44)'); gr.addColorStop(1, 'rgb(34,80,32)'); g.fillStyle = gr; g.beginPath(); g.moveTo(cx, H); g.bezierCurveTo(W + 4, H * 0.72, W + 6, H * 0.26, cx, 4); g.bezierCurveTo(W * 2 - 6, H * 0.26, W * 2 - 4, H * 0.72, cx, H); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150,190,96,0.75)'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 8); g.stroke(); g.lineWidth = 1.6; g.strokeStyle = 'rgba(130,176,90,0.5)'; for (let y = H - 30; y > 40; y -= 28) { const t = 1 - y / H, L = (W / 2 - 14) * Math.sin(Math.min(1, t) * Math.PI) ** 0.6; g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx - L * 0.5, y - 22, cx - L, y - 40); g.moveTo(cx, y); g.quadraticCurveTo(cx + L * 0.5, y - 22, cx + L, y - 40); g.stroke(); }
  _farn = new THREE.CanvasTexture(c); _farn.colorSpace = THREE.SRGBColorSpace; _farn.wrapS = _farn.wrapT = THREE.ClampToEdgeWrapping; _farn.anisotropy = 4;
  return _farn;
}
// Rosette aus 6 gebogenen Wedeln, Einheit 1 m Länge. 4 Abschnitte je Wedel: 48 Dreiecke
function farnGeo() {
  const pos = [], uv = [], idx = [], WEDEL = 6, SEG = 4;
  for (let w = 0; w < WEDEL; w++) { const a = w * 2.399963, ca = Math.cos(a), sa = Math.sin(a), L = 0.8 + 0.28 * ((w * 0.618) % 1), hoch = 0.42 + 0.28 * ((w * 0.37) % 1), n0 = pos.length / 3, br = 0.2;
    for (let i = 0; i <= SEG; i++) { const t = i / SEG, d = L * (t * 0.9 + 0.1 * t * t), y = 0.03 + hoch * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) - 0.34 * t * t * t, x = ca * d, z = sa * d, b = br; pos.push(x - sa * b, y - b * 0.28, z + ca * b, x + sa * b, y - b * 0.28, z - ca * b); uv.push(0, t, 1, t); }
    for (let i = 0; i < SEG; i++) { const p = n0 + i * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); } }
  const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); geo.setIndex(idx);
  return geo;
}
const GRAS_KOPF = `attribute vec4 aOff; uniform sampler2D tGrasMaske, tGrasFarbe; uniform highp sampler2D tGrasH; uniform vec3 uGrasKam; uniform float uGrasKachel, uGrasHalb, uGrasRad, uGrasZeit, uGrasTrocken, uGrasTropen, uGrasGross, uGrasInnen;
  float grasHoehe(vec2 xz) { vec2 t = (xz + uGrasHalb) / (2.0 * uGrasHalb) * 256.0 - 0.5; vec2 i = floor(t), f = t - i; ivec2 a = ivec2(clamp(i, vec2(0.0), vec2(255.0))), b = ivec2(clamp(i + 1.0, vec2(0.0), vec2(255.0)));
    float h00 = texelFetch(tGrasH, a, 0).r, h10 = texelFetch(tGrasH, ivec2(b.x, a.y), 0).r, h01 = texelFetch(tGrasH, ivec2(a.x, b.y), 0).r, h11 = texelFetch(tGrasH, b, 0).r; return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y); }
  `;

export class Gras {
  // ort: { daten, H, halb }, gruen: Polygone [[aussen, ...loecher], ...] im Rahmen des Ortes
  constructor(ort, gruen, { anzahl = 34000, kachel = 84, radius = 40 } = {}) {
    const halb = ort.halb, N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.fillStyle = '#f00'; const k = N / (2 * halb);
    for (const [aussen, ...loecher] of gruen) { g.beginPath(); for (const r of [aussen, ...loecher]) { r.forEach((p, i) => { const x = (p[0] + halb) * k, y = (p[1] + halb) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } g.fill('evenodd'); }
    const wk = ort.daten?.waldKarte, mitWald = !!wk && wk.d.some(v => v > 60); if (wk) { g.globalCompositeOperation = 'lighter'; const q = N / wk.n; for (let j = 0; j < wk.n; j++) for (let i = 0; i < wk.n; i++) { const o = j * wk.n + i, d = wk.d[o]; let gr = wk.g ? wk.g[o] : 0; if (!ort.landlich && wk.f) gr *= Math.max(0, Math.min(1, (wk.f[o * 4 + 1] / Math.max(wk.f[o * 4], 1) - 1.04) / 0.1));   /* in der Stadt nur, wo das Bild wirklich grün ist, sonst Gras auf Pflaster */ if (d > 20 || gr > 20) { g.fillStyle = `rgb(0,${d > 20 ? d : 0},${gr > 20 ? gr : 0})`; g.fillRect(i * q, j * q, q + 1, q + 1); } } g.globalCompositeOperation = 'source-over'; }
    // Nichts wächst auf Fahrbahn, Plätzen, Wegen, Wasser, Sportplätzen und in Häusern (Wunsch Nr. 53, 06.11.2026, Nader: "viele Gräserpflanzen auf Straßen"): die Karte der Wiesen aus dem Satellitenbild ist grob (rund 20 m je Feld) und kannte keine Straßen. Dazu 1 m Abstand, damit kein Halm über die Kante ragt
    { const D = ort.daten || {}, pfad = ringe => { g.beginPath(); for (const r of ringe) { r.forEach((p, i) => { const x = (p[0] + halb) * k, y = (p[1] + halb) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); } };
      g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineJoin = 'round'; g.lineWidth = Math.max(1, 2 * k);
      for (const L of [D.strasse, D.plaetze, D.wasser, D.pfade, D.radwege, D.sand, D.freizeit?.golf?.gruene, D.freizeit?.golf?.sande]) for (const P of L || []) { pfad(P); g.fill('evenodd'); g.stroke(); }
      for (const e of D.gebaeude || []) if (e.p) { pfad([e.p]); g.fill(); g.stroke(); }
      for (const s of D.freizeit?.stadien || []) { g.save(); g.translate((s.x + halb) * k, (s.z + halb) * k); g.rotate(-s.ry); g.beginPath(); g.ellipse(0, 0, s.B / 2 * k + 2, s.L / 2 * k + 2, 0, 0, 6.2832); g.fill(); g.restore(); }   // im Stadion kein wildes Gras
      for (const q of D.freizeit?.plaetze || []) { g.save(); g.translate((q.x + halb) * k, (q.z + halb) * k); g.rotate(-q.ry); g.fillRect(-q.B / 2 * k - 2, -q.L / 2 * k - 2, q.B * k + 4, q.L * k + 4); g.restore(); }
      if (!ort.landlich) { g.lineWidth = Math.max(2, 7 * k); for (const P of D.bloecke || []) { pfad(P); g.stroke(); } }   // in der Stadt der Gehweg rund um den Block
      // Flughafen: nichts wächst auf Pisten, Rollwegen und Vorfeldern (06.11.2026)
      for (const P of D.vorfeld || []) { pfad(P); g.fill('evenodd'); g.lineWidth = Math.max(1, 2 * k); g.stroke(); }
      if (D.flughafen) { g.lineCap = 'butt'; for (const q of [...(D.flughafen.pisten || []), ...(D.flughafen.rollwege || [])]) { g.lineWidth = ((q.w || 25) + 5) * k; g.beginPath(); q.p.forEach((p, i) => { const x = (p[0] + halb) * k, y = (p[1] + halb) * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); } }
    }
    // Grobe Karte, wo überhaupt etwas wächst (Nr. 101, 10.11.2026): vorher liefen an jedem Ort alle Büschel durch den Shader, auch mitten auf dem
    // Pflaster (Potsdamer Platz: 354.000 Dreiecke Gras, Farne und Ferngras ohne einen sichtbaren Halm). 64 mal 64 Felder mit je einem Bit für
    // Stadtgrün (Rot), Wald (Grün) und offenes Land (Blau). update() schaltet jede Lage nur ein, wenn in ihrer Reichweite etwas wächst
    { const Z = 64, px = N / Z, d = g.getImageData(0, 0, N, N).data, F = new Uint8Array(Z * Z);
      for (let y = 0, o = 0; y < N; y++) { const zy = ((y / px) | 0) * Z; for (let x = 0; x < N; x++, o += 4) { const r = d[o], gr = d[o + 1], bl = d[o + 2]; if (r >= 150 || gr > 50 || bl > 0) F[zy + ((x / px) | 0)] |= (r >= 150 ? 1 : 0) | (gr > 50 ? 2 : 0) | (bl > 0 ? 4 : 0); } }
      this.wuchs = F; this.wuchsN = Z; this.halb = halb; }
    this.maske = new THREE.CanvasTexture(c); this.maske.flipY = false; this.maske.generateMipmaps = false; this.maske.minFilter = this.maske.magFilter = THREE.LinearFilter; this.maske.wrapS = this.maske.wrapT = THREE.ClampToEdgeWrapping;
    // Farbe des Bodens aus dem Satellitenbild (96², weich)
    const fN = wk?.n || 1; this.farbe = new THREE.DataTexture(wk?.f ? new Uint8Array(wk.f) : new Uint8Array([70, 78, 52, 255]), fN, fN, THREE.RGBAFormat); this.farbe.colorSpace = THREE.SRGBColorSpace; this.farbe.flipY = false; this.farbe.minFilter = this.farbe.magFilter = THREE.LinearFilter; this.farbe.wrapS = this.farbe.wrapT = THREE.ClampToEdgeWrapping; this.farbe.needsUpdate = true;
    // Höhe aus dem Gelände (Raster 256², Abfrage in voller Genauigkeit nur beim Bau)
    const R = 256, h = new Float32Array(R * R); for (let j = 0, i = 0; j < R; j++) for (let x = 0; x < R; x++, i++) h[i] = ort.H((x + 0.5) / R * 2 * halb - halb, (j + 0.5) / R * 2 * halb - halb);
    this.hoehe = new THREE.DataTexture(h, R, R, THREE.RedFormat, THREE.FloatType); this.hoehe.minFilter = this.hoehe.magFilter = THREE.NearestFilter; this.hoehe.needsUpdate = true;
    // Büschel: zwei gekreuzte Flächen, 0,55 m breit, 0,2 m hoch (Stadtrasen)
    const pos = [], uv = [], idx = [];
    for (let q = 0; q < 2; q++) { const a = q * Math.PI / 2, ax = Math.cos(a) * 0.275, az = Math.sin(a) * 0.275, n = pos.length / 3; pos.push(-ax, 0, -az, ax, 0, az, ax, 0.2, az, -ax, 0.2, -az); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); }
    const geo = new THREE.InstancedBufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); geo.setIndex(idx);
    const off = new Float32Array(anzahl * 4); let s = 13; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < anzahl; i++) { off[i * 4] = r(); off[i * 4 + 1] = r(); off[i * 4 + 2] = r(); off[i * 4 + 3] = r(); }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); geo.instanceCount = anzahl; geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const breiteAbs = Math.abs(wk?.lat ?? 50);
    const U = this.U = { tGrasMaske: { value: this.maske }, tGrasFarbe: { value: this.farbe }, tGrasH: { value: this.hoehe }, uGrasKam: { value: new THREE.Vector3() }, uGrasKachel: { value: kachel }, uGrasHalb: { value: halb }, uGrasRad: { value: radius }, uGrasZeit: { value: 0 }, uGrasTrocken: { value: THREE.MathUtils.smoothstep(wk?.trocken ?? 0, 0.15, 0.5) }, uGrasTropen: { value: 1 - THREE.MathUtils.smoothstep(breiteAbs, 14, 26) }, uGrasGross: { value: 1 }, uGrasInnen: { value: 0 } };
    const mat = this.mat = new THREE.MeshLambertMaterial({ map: halmBild(), alphaTest: 0.42, side: THREE.DoubleSide, color: 0xffffff });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = GRAS_KOPF + `varying float vGrasTon; varying float vGrasBlume; varying vec3 vGrasFarbe; varying float vGrasOffen; varying vec3 vGrasChroma;
        ` + sh.vertexShader
        .replace('#include <begin_vertex>', `
          vec2 grasW = aOff.xy * uGrasKachel, rel = mod(grasW - uGrasKam.xz + uGrasKachel * 0.5, uGrasKachel) - uGrasKachel * 0.5, xz = uGrasKam.xz + rel, mUv = (xz + uGrasHalb) / (2.0 * uGrasHalb);
          vec4 mk0 = textureLod(tGrasMaske, mUv, 0.0); float grasD = length(rel), stadt = step(0.6, mk0.r), imWald = smoothstep(0.2, 0.42, mk0.g), offen = mk0.b * (1.0 - stadt);
          float zuf = fract(aOff.w * 7.7), fleck = 0.5 + 0.5 * sin(xz.x * 0.21 + sin(xz.y * 0.13) * 1.7) * sin(xz.y * 0.17 + 0.8);
          float inWald = imWald * step(zuf, (0.14 + 0.34 * fleck) * (1.0 - 0.72 * uGrasTropen)), inOffen = step(zuf, offen * 1.1) * (1.0 - imWald);   // Wald: nur lockeres Gras. Offen: Dichte nach dem Bild
          float masken = max(stadt, max(inWald, inOffen)), anteilOffen = inOffen * (1.0 - stadt);
          float hoch = mix(1.0 + inWald * (0.5 + 0.9 * fleck), mix(1.4, 2.4, uGrasTrocken) * (0.55 + 0.9 * fleck) * uGrasGross, anteilOffen);
          float grasS = step(0.5, masken) * (1.0 - smoothstep(uGrasRad * 0.62, uGrasRad, grasD)) * smoothstep(uGrasInnen * 0.72, uGrasInnen, grasD) * (0.7 + 0.75 * aOff.w) * (1.0 - smoothstep(7.0, 19.0, uGrasKam.y - grasHoehe(uGrasKam.xz)));   // von oben sähe man nur gekreuzte Flächen (in der Parkansicht aus 26 m lagen schwarze Kreuze auf dem Rasen)
          float a0 = aOff.z * 6.2831853, ca = cos(a0), sa = sin(a0);
          vec3 transformed = position * grasS; transformed.y *= hoch; transformed.xz = vec2(ca * transformed.x - sa * transformed.z, sa * transformed.x + ca * transformed.z); transformed.xz *= 1.0 + 0.35 * anteilOffen;
          float wind = sin(uGrasZeit * 1.6 + xz.x * 0.35 + xz.y * 0.28) * 0.5 + sin(uGrasZeit * 3.1 + xz.x * 1.1 + aOff.z * 6.0) * 0.25;
          transformed.xz += vec2(0.1, 0.05) * wind * position.y * 3.0 * grasS * hoch;
          transformed += vec3(xz.x, grasHoehe(xz) + 0.02, xz.y);
          vGrasTon = (0.92 + 0.3 * fract(aOff.z * 7.3)) * mix(1.0, 0.62, imWald); vGrasOffen = anteilOffen;
          { vec3 f = textureLod(tGrasFarbe, mUv, 0.0).rgb; f.b *= 0.62; float fl = max(dot(f, vec3(0.3, 0.59, 0.11)), 0.008); vGrasChroma = mix(clamp(f / fl, vec3(0.25), vec3(1.5)), vec3(1.16, 1.0, 0.62), 0.25) * clamp(fl / 0.07, 0.8, 1.22) * (0.8 + 0.42 * fract(aOff.z * 11.3)) * 1.22; }
          // Blumen in Flecken: rund 16 Meter große Inseln, darin jedes siebte Büschel, Farbe je Insel. Nicht im Wald und nicht im trockenen Gras
          { float wi = sin(xz.x * 0.19 + 1.3) * sin(xz.y * 0.23 + 0.4) + 0.5 * sin(xz.x * 0.47 + xz.y * 0.31), bl = step(0.45, wi) * step(0.84, fract(aOff.z * 41.7)) * (1.0 - imWald) * step(uGrasTrocken, 0.5); vMapUv.x = vMapUv.x * 0.5 + 0.5 * bl; vGrasBlume = bl; float fw = fract(floor(xz.x * 0.06) * 0.37 + floor(xz.y * 0.06) * 0.71 + aOff.w * 0.24);
            vGrasFarbe = fw < 0.34 ? vec3(0.95, 0.94, 0.86) : fw < 0.6 ? vec3(0.96, 0.78, 0.2) : fw < 0.82 ? vec3(0.66, 0.42, 0.86) : vec3(0.9, 0.3, 0.28); }`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
      sh.fragmentShader = 'varying float vGrasTon; varying float vGrasBlume; varying vec3 vGrasFarbe; varying float vGrasOffen; varying vec3 vGrasChroma;\n' + sh.fragmentShader
        .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
        .replace('#include <map_fragment>', `#include <map_fragment>
  if ( vGrasBlume > 0.5 && diffuseColor.g < 0.2 && diffuseColor.b > 0.5 ) diffuseColor.rgb = vGrasFarbe; else diffuseColor.rgb = mix(diffuseColor.rgb * vGrasTon, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vGrasChroma, vGrasOffen);`);
    };
    mat.customProgramCacheKey = () => 'gras3d5';
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.name = 'gras'; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    // Zweite Stufe für offenes Land: große Büschel von 34 bis 150 m, sonst endet das Gras an einer harten Kante (Savanne, Steppe, Weide)
    if (wk?.g && wk.g.some(v => v > 60)) {
      const FN2 = 16000, g2 = geo.clone(); g2.instanceCount = FN2; g2.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7); const of2 = new Float32Array(FN2 * 4); for (let i = 0; i < FN2 * 4; i++) of2[i] = r(); g2.setAttribute('aOff', new THREE.InstancedBufferAttribute(of2, 4));
      const U2 = { ...U, uGrasKachel: { value: 300 }, uGrasRad: { value: 150 }, uGrasInnen: { value: 34 }, uGrasGross: { value: 1.15 } };
      const m2 = this.mat2 = mat.clone(); m2.alphaTest = 0.34; m2.onBeforeCompile = sh => { mat.onBeforeCompile(sh); Object.assign(sh.uniforms, U2); sh.vertexShader = sh.vertexShader.replace('vec3 transformed = position * grasS;', 'vec3 transformed = position * grasS; transformed.xz *= 3.2;').replace('float inWald = imWald * step(zuf, 0.14 + 0.34 * fleck)', 'float inWald = 0.0 * imWald * step(zuf, 0.14 + 0.34 * fleck)').replace('stadt = step(0.6, mk0.r)', 'stadt = 0.0'); };
      m2.customProgramCacheKey = () => 'gras3d5f';
      this.fernGras = new THREE.Mesh(g2, m2); this.fernGras.name = 'gras fern'; this.fernGras.frustumCulled = false; this.fernGras.receiveShadow = true; this.fernGras.castShadow = false; this.mesh.add(this.fernGras); this.U2 = U2;
    }
    // Farne und breite Blätter auf dem Waldboden, 3.200 Rosetten im Umkreis von 30 m
    if (mitWald) {
      const FN = 3200, fg = farnGeo(), of = new Float32Array(FN * 4); for (let i = 0; i < FN * 4; i++) of[i] = r();
      fg.setAttribute('aOff', new THREE.InstancedBufferAttribute(of, 4)); fg.instanceCount = FN; fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
      const UF = { ...U, uGrasKachel: { value: 64 }, uGrasRad: { value: 31 } };
      const fm = this.farnMat = new THREE.MeshLambertMaterial({ map: farnBild(), alphaTest: 0.4, side: THREE.DoubleSide, color: 0xffffff });
      fm.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, UF);
        sh.vertexShader = GRAS_KOPF + 'varying vec3 vFarnTon;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', `
            vec2 grasW = aOff.xy * uGrasKachel, rel = mod(grasW - uGrasKam.xz + uGrasKachel * 0.5, uGrasKachel) - uGrasKachel * 0.5, xz = uGrasKam.xz + rel, mUv = (xz + uGrasHalb) / (2.0 * uGrasHalb);
            float imWald = smoothstep(0.22, 0.44, textureLod(tGrasMaske, mUv, 0.0).g), grasD = length(rel), fleck = 0.5 + 0.5 * sin(xz.x * 0.11 + sin(xz.y * 0.09) * 2.1) * sin(xz.y * 0.13 + 1.1);
            float breit = step(fract(aOff.w * 13.1), uGrasTropen * 0.3);   // Tropen: jede dritte Pflanze mit breiten Blättern
            float an = imWald * step(fract(aOff.w * 5.3), 0.42 + 0.58 * fleck) * (1.0 - smoothstep(uGrasRad * 0.72, uGrasRad, grasD)) * (1.0 - smoothstep(14.0, 40.0, uGrasKam.y - grasHoehe(uGrasKam.xz)));
            float gr = an * mix(0.42 + 0.62 * aOff.w, 0.55 + 0.75 * aOff.w, uGrasTropen) * (1.0 - 0.12 * breit);
            float a0 = aOff.z * 6.2831853, ca = cos(a0), sa = sin(a0);
            vec3 transformed = position * gr; transformed.xz = vec2(ca * transformed.x - sa * transformed.z, sa * transformed.x + ca * transformed.z);
            float wind = sin(uGrasZeit * 1.1 + xz.x * 0.3 + xz.y * 0.24 + position.x * 2.0) * 0.5 + sin(uGrasZeit * 2.3 + aOff.z * 6.0 + position.z * 3.0) * 0.3;
            transformed.y += 0.035 * wind * position.y * 2.0 * gr;
            transformed += vec3(xz.x, grasHoehe(xz) + 0.02, xz.y);
            vMapUv.x = vMapUv.x * 0.5 + 0.5 * breit;
            vFarnTon = mix(vec3(0.86, 0.86, 0.56), vec3(1.22, 1.04, 0.68), fract(aOff.z * 9.7)) * (0.86 + 0.34 * fract(aOff.y * 5.1));`)
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(position.x * 0.5, 0.8, position.z * 0.5));');
        sh.fragmentShader = 'varying vec3 vFarnTon;\n' + sh.fragmentShader
          .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
          .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= vFarnTon;');
      };
      fm.customProgramCacheKey = () => 'farn2';
      this.farn = new THREE.Mesh(fg, fm); this.farn.name = 'farne'; this.farn.frustumCulled = false; this.farn.receiveShadow = true; this.farn.castShadow = false; this.UF = UF;
      this.mesh.add(this.farn);
    }
    this.t = 0;
  }
  update(kam, H) {
    const u = this.U; u.uGrasKam.value.copy(kam); u.uGrasZeit.value = performance.now() / 1000;
    let lagen = 0;
    if (kam.y - H(kam.x, kam.z) < 42) {
      const k = this.wuchsN / (2 * this.halb), zx = Math.floor((kam.x + this.halb) * k), zz = Math.floor((kam.z + this.halb) * k);
      if (zx !== this._zx || zz !== this._zz) { this._zx = zx; this._zz = zz; this._lagen = this.wuchsNah(zx, zz); }
      lagen = this._lagen;
    }
    this.mat.visible = !!(lagen & 1); if (this.fernGras) this.fernGras.visible = !!(lagen & 2); if (this.farn) this.farn.visible = !!(lagen & 4);
    this.mesh.visible = lagen !== 0;
  }
  // Bits: 1 Gras (Reichweite 42 m: Stadtgrün, Wald und offenes Land), 2 Ferngras (150 m, nur offenes Land), 4 Farne (31 m, nur Wald). Gesucht wird ein Feld
  // weiter als nötig (die Kamera bewegt sich im Feld, die Maske wird weich gefiltert). Außerhalb der Karte gilt wie im Shader ihr Rand
  wuchsNah(zx, zz) {
    const Z = this.wuchsN, F = this.wuchs, feld = 2 * this.halb / Z, bei = (x, z) => F[Math.min(Z - 1, Math.max(0, z)) * Z + Math.min(Z - 1, Math.max(0, x))];
    const ring = (r, bit) => { const n = Math.ceil(r / feld) + 1; for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) if (bei(zx + a, zz + b) & bit) return true; return false; };
    return (ring(42, 7) ? 1 : 0) | (this.fernGras && ring(150, 4) ? 2 : 0) | (this.farn && ring(31, 2) ? 4 : 0);
  }
  entsorgen() { if (this.fernGras) { this.fernGras.geometry.dispose(); this.mat2.dispose(); } this.mesh.geometry.dispose(); this.mat.dispose(); this.maske.dispose(); this.hoehe.dispose(); this.farbe.dispose(); if (this.farn) { this.farn.geometry.dispose(); this.farnMat.dispose(); } }
}
