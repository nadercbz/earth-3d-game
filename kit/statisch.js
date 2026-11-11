// Szenengraph entlasten (06.11.2026, Wunsch Nr. 66): three.js setzt jedes Bild für jedes Objekt die Matrix neu zusammen, auch wenn es sich nie bewegt. In der City of London waren das 10.000 Objekte und 3,3 ms je Bild.
import * as THREE from 'three';
const WELT = THREE.Object3D.prototype.updateMatrixWorld;
// Teilbaum, der sich relativ zu seinem Eltern nicht mehr bewegt: Matrizen einmal rechnen, danach nur noch neu, wenn sich der Eltern bewegt (Anker). Bewegliches trägt userData.beweglich (Türblätter)
export function einfrieren(wurzel) {
  const bewegt = [];
  wurzel.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = !!o.userData.beweglich; o.matrixWorldNeedsUpdate = true; if (o.userData.beweglich) bewegt.push(o); });
  // den ganzen Teilbaum überspringen, solange der Eltern ruht: dann kostet auch das Besuchen nichts mehr
  wurzel.updateMatrixWorld = function (force) { if (force || this.matrixWorldNeedsUpdate) WELT.call(this, force); else for (let i = 0; i < bewegt.length; i++) bewegt[i].updateMatrixWorld(false); };
  return wurzel;
}
// Für Objekte, die lange unsichtbar sind (Figuren): der ganze Teilbaum wird übersprungen. Beim Sichtbarwerden rechnet matrixAutoUpdate ihn wieder durch
export function nurSichtbar(force) { if (this.visible) WELT.call(this, force); }
