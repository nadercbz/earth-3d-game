// Torbögen (Wunsch Nr. 106, 19.11.2026): wo eine Fahrspur oder der Weg zu einer Bahnhofstreppe durch eine Hauswand führt, steht ein dunkles Tor mit
// Rahmen in der Wand. Vorher fuhren die Autos dort durch eine geschlossene Fassade. Die Wand selbst bleibt (sie verdeckt alles, was dahinter im Haus
// ist), das Tor liegt 7 cm davor: wer hineinfährt, verschwindet im Dunkel. Zwei Pfeiler und ein Sturz, 22 cm vor der Wand.
// tore: [{ x, z, dx, dz, hoch, breit }], (x, z) Stelle in der Wand, (dx, dz) zeigt ins Haus, hoch lichte Höhe (Standard 3,9 m), breit (Standard 3,4 m)
import * as THREE from 'three';

export function torboegenBauen(tore, hoehe) {
  const dunkel = [], rahmen = [], nd = [], nr = [];
  const flaeche = (ziel, nrm, a, b, c, d, n) => { for (const q of [a, b, c, a, c, d]) { ziel.push(q[0], q[1], q[2]); nrm.push(n[0], n[1], n[2]); } };
  for (const q of tore) {
    const tx = -q.dz, tz = q.dx, y0 = hoehe(q.x, q.z) - 0.05, y1 = y0 + (q.hoch || 3.9), B = (q.breit || 3.4) / 2, aus = [-q.dx, 0, -q.dz];
    const pt = (u, v, y) => [q.x + tx * u - q.dx * v, y, q.z + tz * u - q.dz * v];   // u: entlang der Wand, v: Meter vor der Wand
    flaeche(dunkel, nd, pt(-B, 0.07, y0), pt(B, 0.07, y0), pt(B, 0.07, y1), pt(-B, 0.07, y1), aus);
    for (const [u0, u1, ya, yb] of [[-B - 0.32, -B, y0, y1 + 0.38], [B, B + 0.32, y0, y1 + 0.38], [-B, B, y1, y1 + 0.38]]) {
      flaeche(rahmen, nr, pt(u0, 0.22, ya), pt(u1, 0.22, ya), pt(u1, 0.22, yb), pt(u0, 0.22, yb), aus);
      flaeche(rahmen, nr, pt(u0, 0, ya), pt(u0, 0.22, ya), pt(u0, 0.22, yb), pt(u0, 0, yb), [-tx, 0, -tz]);
      flaeche(rahmen, nr, pt(u1, 0.22, ya), pt(u1, 0, ya), pt(u1, 0, yb), pt(u1, 0.22, yb), [tx, 0, tz]);
      flaeche(rahmen, nr, pt(u0, 0.22, yb), pt(u1, 0.22, yb), pt(u1, 0, yb), pt(u0, 0, yb), [0, 1, 0]);
      flaeche(rahmen, nr, pt(u0, 0, ya), pt(u1, 0, ya), pt(u1, 0.22, ya), pt(u0, 0.22, ya), [0, -1, 0]);
    }
  }
  const netz = (pos, nrm, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false; m.receiveShadow = true; return m;
  };
  const g = new THREE.Group(); g.name = 'torboegen'; g.userData.anzahl = tore.length;
  g.add(netz(dunkel, nd, new THREE.MeshBasicMaterial({ color: 0x0b0b0d, side: THREE.DoubleSide })), netz(rahmen, nr, new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.92, side: THREE.DoubleSide })));
  return g;
}
