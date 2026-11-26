// Maße des Berliner Gehwegs (Wunsch Nr. 107, Runde 2) in Metern ab Bordsteinkante, für den Ortsbau (kit/bodenbau.js) und den Shader (kit/materials.js gehwegMat):
// Bordstein 25 cm, Unterstreifen aus Mosaikpflaster bis m1, Gehbahn aus Granitplatten bis m2 (drei Reihen zu 80 cm), danach Oberstreifen aus Mosaik.
// Ohne Haus in der Nähe endet der Gehweg bei nah, vor Häusern (bis haus Meter Abstand) reicht er bis fern.
export const GEHWEG = { bord: 0.25, m1: 1.45, m2: 3.85, nah: 4.9, fern: 9.5, haus: 6.5 };
