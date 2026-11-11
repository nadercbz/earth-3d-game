#!/usr/bin/env python3
"""Holt die Lagen der Flugzeuge der Welt fuer EARTH 3D GAME. Aufruf: python3 holen.py ZIELORDNER

Quelle: adsb.lol, offene Daten unter ODbL 1.0 (Hinweis steht im Spiel). Kein Schluessel noetig.
Gefragt wird je Flugzeugtyp, das deckt mit wenigen Anfragen die ganze Welt ab, mit Pause zwischen den Anfragen.
Aus Ruecksicht auf Menschen: nur Fluggesellschaften behalten ihr Rufzeichen, private Flugzeuge bleiben namenlos,
Kennung und Hex Adresse werden nicht gespeichert. Nur Standardbibliothek, laeuft so in der GitHub Action.

Dazu die Ereignisse der Welt (Wunsch Nr. 52) in ereignisse.json: Erdbeben (USGS, gemeinfrei), Braende, Stuerme, Vulkane (NASA EONET, gemeinfrei),
Katastrophen (GDACS), Demonstrationen und gemeldete Kaempfe (GDELT, frei mit Nennung). Aus GDELT nur Ort, Art, Zeit und Zahl der Artikel, keine Namen, keine Schlagzeilen.
Kaempfe nur aus Laendern mit laufendem Krieg, in allen anderen meldet GDELT zu viel Kriminalitaet. Alles zusammengefasst auf rund 50 km."""
import calendar, csv, datetime, io, json, os, pathlib, re, sys, time, urllib.error, urllib.request, zipfile

UA = "Earth3DGame/1.0 (game build)"
PAUSE = float(os.environ.get("PAUSE", "4.5"))
TYPEN = ["B738", "A320", "B38M", "A21N", "A20N", "A321", "A319", "B737", "B739", "A19N", "B77W", "B789", "B788", "A359", "A333",
         "B763", "B772", "A332", "E190", "E195", "E75L", "E170", "E295", "BCS3", "BCS1", "CRJ9", "CRJ7", "AT76", "AT75", "DH8D",
         "B744", "B748", "A339", "A35K", "B78X", "A388", "B752", "B753", "MD11", "C919"]
RUF = re.compile(r"^[A-Z]{3}[0-9][0-9A-Z]{0,4}$")


def holen(typ):
    q = urllib.request.Request(f"https://api.adsb.lol/v2/type/{typ}", headers={"User-Agent": UA, "Accept": "application/json"})
    for versuch in range(3):
        try:
            with urllib.request.urlopen(q, timeout=30) as r:
                return json.load(r).get("ac") or []
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(30)
                continue
            print("Fehler", typ, e.code, file=sys.stderr)
            return []
        except Exception as e:
            print("Fehler", typ, e, file=sys.stderr)
            time.sleep(5)
    return []


# ---------- Ereignisse ----------
GITTER = 2   # je Grad, also rund 50 km
KRIEG_FIPS = {"UP", "IS", "GZ", "WE", "SU", "OD", "BM", "CG", "ML", "UV", "NG", "SO", "NI", "YM", "SY", "AF", "ET", "HA", "CT"}
EONET = {"wildfires": "brand", "severeStorms": "sturm", "volcanoes": "vulkan", "floods": "flut", "landslides": "rutsch", "drought": "duerre", "dustHaze": "staub"}
GDACS = {"FL": "flut", "TC": "sturm", "VO": "vulkan", "DR": "duerre", "WF": "brand"}


def json_holen(url, **kw):
    q = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(q, timeout=kw.get("timeout", 40)) as r:
        return json.load(r)


def gdelt_datei(stempel):
    u = f"https://data.gdeltproject.org/gdeltv2/{stempel}.export.CSV.zip"
    q = urllib.request.Request(u, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(q, timeout=40) as r:
            roh = r.read()
    except Exception:
        return None
    z = zipfile.ZipFile(io.BytesIO(roh))
    return list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding="utf-8", errors="replace"), delimiter="\t"))


def gdelt_mischen(alt, letzte, jetzt):
    """alt: Eintraege aus dem letzten Lauf. Holt die Viertelstunden seit dem letzten Lauf, hoechstens 24 auf einmal (rund 6 Stunden beim ersten Mal)."""
    G = {f"{e['a']}:{round(e['la'] * GITTER)}:{round(e['lo'] * GITTER)}": e for e in alt if jetzt - e["t"] < 48 * 3600}
    start = max(letzte or 0, jetzt - 6 * 3600) // 900 * 900 + 900; ende = jetzt // 900 * 900; ok = letzte or 0; n = 0
    stempel = list(range(start, ende + 1, 900))[-24:]
    for s in stempel:
        L = gdelt_datei(time.strftime("%Y%m%d%H%M%S", time.gmtime(s)))
        if L is None:
            continue
        n += 1; ok = max(ok, s)
        for r in L:
            try:
                wurzel, typ, land = r[28], r[51], r[53]
                if typ not in ("3", "4") or r[56] == "" or r[57] == "":
                    continue
                kat = "demo" if wurzel == "14" else "kampf" if wurzel in ("19", "20") and land in KRIEG_FIPS and r[25] == "1" else None
                if not kat:
                    continue
                la, lo, art = float(r[56]), float(r[57]), int(r[33] or 0)
                k = f"{kat}:{round(la * GITTER)}:{round(lo * GITTER)}"; e = G.get(k)
                if e:
                    e["n"] += art; e["t"] = max(e["t"], s)
                    if art > e.get("_m", 0):
                        e["la"], e["lo"], e["o"], e["_m"] = round(la, 3), round(lo, 3), r[52][:60], art
                else:
                    G[k] = {"a": kat, "la": round(la, 3), "lo": round(lo, 3), "o": r[52][:60], "n": art, "t": s, "_m": art}
            except (ValueError, IndexError):
                continue
    print("GDELT", n, "Dateien,", len(G), "Orte")
    return list(G.values()), ok


def ereignisse(ziel):
    jetzt = int(time.time()); alt, letzte = [], 0
    try:
        v = json_holen(f"https://raw.githubusercontent.com/{os.environ.get('GITHUB_REPOSITORY', 'nadercbz/earth-3d-game')}/live/ereignisse.json")
        alt = [e for e in v.get("e", []) if e.get("a") in ("demo", "kampf")]; letzte = v.get("gd", 0)
    except Exception:
        pass
    E, letzte = gdelt_mischen(alt, letzte, jetzt)
    # Auch Orte mit wenigen Artikeln bleiben in der Datei, sonst sammelt sich zwischen zwei Laeufen nichts an. Das Spiel zeigt nur, was oft genug gemeldet wurde
    try:
        for f in json_holen("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson")["features"]:
            P, c = f["properties"], f["geometry"]["coordinates"]
            if (P.get("mag") or 0) >= 4.5 and P.get("type") == "earthquake":
                E.append({"a": "beben", "la": round(c[1], 3), "lo": round(c[0], 3), "o": (P.get("place") or "")[:60], "m": P["mag"], "tief": round(c[2]), "t": P["time"] // 1000})
    except Exception as e:
        print("USGS", e, file=sys.stderr)
    try:
        for ev in json_holen("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=500")["events"]:
            kat = EONET.get(ev["categories"][0]["id"]); g = ev["geometry"][-1] if ev.get("geometry") else None
            if not kat or not g or g.get("type") != "Point":
                continue
            c = g["coordinates"]; t = calendar.timegm(time.strptime(g["date"][:19], "%Y-%m-%dT%H:%M:%S"))
            E.append({"a": kat, "la": round(c[1], 3), "lo": round(c[0], 3), "o": ev["title"][:60], "t": t, **({"m": g["magnitudeValue"], "e": g.get("magnitudeUnit", "")} if g.get("magnitudeValue") else {}), "q": "NASA EONET"})
    except Exception as e:
        print("EONET", e, file=sys.stderr)
    try:
        heute = datetime.datetime.now(datetime.timezone.utc).date(); von = (heute - datetime.timedelta(days=14)).isoformat()
        for f in json_holen(f"https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=&fromDate={von}&toDate={heute.isoformat()}&alertlevel=Orange;Red").get("features", []):
            P, g = f["properties"], f.get("geometry") or {}
            kat = GDACS.get(P.get("eventtype"))
            if not kat or g.get("type") != "Point":
                continue
            c = g["coordinates"]; t = calendar.timegm(time.strptime(str(P.get("fromdate"))[:19], "%Y-%m-%dT%H:%M:%S"))
            E.append({"a": kat, "la": round(c[1], 3), "lo": round(c[0], 3), "o": (P.get("eventname") or P.get("name") or "")[:60] or kat, "t": t, "stufe": P.get("alertlevel"), "q": "GDACS"})
    except Exception as e:
        print("GDACS", e, file=sys.stderr)
    p = pathlib.Path(ziel); p.mkdir(parents=True, exist_ok=True)
    (p / "ereignisse.json").write_text(json.dumps({"t": jetzt, "gd": letzte, "e": E}, separators=(",", ":"), ensure_ascii=False))
    print(len(E), "Ereignisse")


def main(ziel):
    jetzt = time.time(); gesehen = set(); typen = []; S = {k: [] for k in ("la", "lo", "h", "k", "v", "z", "ty", "cs", "id")}
    for n, typ in enumerate(TYPEN):
        if n:
            time.sleep(PAUSE)
        for a in holen(typ):
            hx, la, lo, alt = a.get("hex"), a.get("lat"), a.get("lon"), a.get("alt_baro")
            if not hx or la is None or lo is None or alt in (None, "ground") or hx in gesehen:
                continue
            if (a.get("seen_pos") or 0) > 90 or (a.get("gs") or 0) < 60 or a.get("track") is None or (a.get("dbFlags") or 0) & 1:
                continue
            gesehen.add(hx)
            if typ not in typen:
                typen.append(typ)
            ruf = (a.get("flight") or "").strip()
            S["la"].append(round(la * 1e4)); S["lo"].append(round(lo * 1e4)); S["h"].append(round(alt * 0.3048 / 10) * 10); S["k"].append(round(a["track"]) % 360)
            S["v"].append(round(a["gs"] * 0.51444)); S["z"].append(round((a.get("baro_rate") or 0) * 0.00508)); S["ty"].append(typen.index(typ))
            S["cs"].append(ruf if RUF.match(ruf) else ""); S["id"].append(int(hx.replace("~", "0"), 16) % 65521)
    n = len(S["la"])
    print(n, "Flugzeuge in der Luft,", len(typen), "Typen,", round(time.time() - jetzt), "s")
    if n < 500:
        sys.exit("Zu wenig Flugzeuge, die alte Datei bleibt liegen")
    p = pathlib.Path(ziel); p.mkdir(parents=True, exist_ok=True)
    (p / "fluege.json").write_text(json.dumps({"t": round(jetzt), "q": "adsb.lol (ODbL)", "typen": typen, **S}, separators=(",", ":")))
    (p / "README.txt").write_text("Automatisch erzeugt fuer EARTH 3D GAME. Flugzeuglagen von adsb.lol, Open Database License (ODbL) 1.0. Ereignisse: USGS, NASA EONET, GDACS, The GDELT Project.\n")


if __name__ == "__main__":
    ziel = sys.argv[1] if len(sys.argv) > 1 else "aus"
    try:
        ereignisse(ziel)
    except Exception as e:
        print("Ereignisse", e, file=sys.stderr)
    if os.environ.get("NUR") != "ereignisse":
        main(ziel)
