// Fotofassaden bekannter Gebäude (Nr. 113). Erzeugt von tools/fotofassade_bauen.py aus tools/fotofassaden/liste.json, nicht von Hand ändern.
// Quelle und Lizenz je Bild: assets/textures/fotofassaden/quellen.json und Quellenzeile der Seite
export const FOTOFASSADEN = [
  {"n": "reichstag_west", "a": [52.519215, 13.375333], "b": [52.517977, 13.375333], "h0": 0, "h1": 41, "vor": 0.8, "hinter": 12.5},
  {"n": "konzerthaus_ost", "a": [52.513259, 13.39223], "b": [52.513951, 13.392119], "h0": 0, "h1": 36.7, "vor": 0.8, "hinter": 12, "zu": 1},
  {"n": "rotes_rathaus_front", "a": [52.518878, 13.408687], "b": [52.518308, 13.407552], "h0": 0, "h1": 82.6, "vor": 0.8, "hinter": 6},
  {"n": "altes_museum_sued", "a": [52.519042, 13.398453], "b": [52.519459, 13.39954], "h0": 0, "h1": 18.2, "vor": 0.8, "hinter": 3, "zu": 1},
  {"n": "humboldt_forum_west", "a": [52.517163, 13.400027], "b": [52.51631, 13.401031], "h0": 0, "h1": 28.8, "vor": 0.8, "hinter": 7, "zu": 1},
  {"n": "staatsoper_west", "a": [52.517081, 13.394431], "b": [52.516252, 13.394569], "h0": 0, "h1": 34.1, "vor": 12.5, "hinter": 3, "zu": 1},
];
// Wandmaterial der übrigen Seiten je OSM Kennung (kit/osmteile.js)
export const FOTO_WAND = {"r2201742": "steinBlock", "r4211905": "ziegelRot"};
