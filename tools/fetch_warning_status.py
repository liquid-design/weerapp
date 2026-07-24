"""fetch_warning_status.py — haalt de ACTUELE waarschuwingsniveaus per zone op (ADR-032).

Gescheiden van de geometrie (fetch_boundaries.py): grenzen veranderen zelden, kleuren dagelijks.
De kaart leest alleen het resultaat (warning_status.json) en roept NOOIT providers aan.

    zone_sources.json -> STATUS_FETCHERS[land] -> warning_status.json { "DE-105334000": "orange", ... }

Eerlijkheidsregel: geen statusbron voor een land -> dat land ontbreekt in het bestand en de kaart
toont neutraal + 'kleuren onbekend'. Nooit een verzonnen kleur.

Draai (Mac/LXC, met internet):   python tools/fetch_warning_status.py it de
Cron-baar via tools/refresh_zones.sh (of vaker als je wilt; het bestand is klein).
"""
import sys, os, json, re
from datetime import datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "frontend", "map", "data")
OUT = os.path.join(DATA, "warning_status.json")
UA = {"User-Agent": "Weerwijsheid/3.0 (persoonlijke weerbeslisser)"}

_SEVERITY = {"Minor": "yellow", "Moderate": "orange", "Severe": "red", "Extreme": "red"}


_DPC_REPO = "pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica"
_DPC_RAW = f"https://raw.githubusercontent.com/{_DPC_REPO}/master/files/"
_DPC_API = f"https://api.github.com/repos/{_DPC_REPO}"


def _dpc_latest_stamp():
    """Deterministisch de nieuwste bulletin-bestandsnaam (YYYYMMDD_HHMM) bepalen — GEEN giswerk.

    De publicatietijd (HHMM) varieert per dag, dus een vaste tijdenlijst raadt onvermijdelijk mis
    (dat was de oude bug: 20260719_1416.json miste omdat '1416' niet in de gok-lijst zat). We lezen
    de 'files/'-map via de GitHub git-tree API en nemen de lexicografisch hoogste naam (zero-padded
    datum+tijd => hoogste = nieuwste). De contents-API is hiervoor ONBRUIKBAAR: die cap't op 1000
    entries en gaf daardoor eerder ten onrechte 2022 als 'nieuwste'."""
    root = requests.get(f"{_DPC_API}/git/trees/master", headers=UA, timeout=30)
    root.raise_for_status()
    files_sha = next(t["sha"] for t in root.json()["tree"]
                     if t["path"] == "files" and t["type"] == "tree")
    tree = requests.get(f"{_DPC_API}/git/trees/{files_sha}", headers=UA, timeout=30)
    tree.raise_for_status()
    stamps = [t["path"][:-5] for t in tree.json()["tree"]
              if re.fullmatch(r"\d{8}_\d{4}\.json", t["path"])]
    if not stamps:
        raise RuntimeError("geen bulletin-bestanden gevonden in DPC-repo files/")
    return max(stamps)


def status_it():
    """Italië: het dagelijkse Protezione Civile-bulletin draagt per zone de kleur.

    Bron: pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica (officieel, CC-BY-4.0) — dezelfde
    bron als de kaart op mappe.protezionecivile.gov.it. Het index-bestand `files/<stamp>.json` wijst
    naar `today.topo_json`; die TopoJSON draagt per zone `Nome zona` + `Rappresentata nella mappa`.
    Geverifieerd 2026-07-19 met echte requests: 187 geometrieën, `Nome zona` matcht de zonegeometrie
    (`zone`) 1-op-1, en de frontend koppelt via `IT-<Nome zona>` (layers.js). Kleurwoorden staan in
    de 'ALLERTA <KLEUR>'-tekst (GIALLA/ARANCIONE/ROSSA); 'NESSUNA ALLERTA' => geen woord => groen."""
    stamp = _dpc_latest_stamp()
    meta = requests.get(_DPC_RAW + stamp + ".json", headers=UA, timeout=30)
    meta.raise_for_status()
    topo_url = meta.json()["today"]["topo_json"]
    t = requests.get(topo_url, headers=UA, timeout=60)
    t.raise_for_status()
    obj = next(iter(t.json()["objects"].values()))
    out = {}
    for g in obj["geometries"]:
        p = g.get("properties", {}) or {}
        rapp = (p.get("Rappresentata nella mappa", "") or "").upper()
        level = ("red" if "ROSSA" in rapp else "orange" if "ARANCIONE" in rapp
                 else "yellow" if "GIALLA" in rapp else "green")
        name = p.get("Nome zona")
        if name:
            out[f"IT-{name}"] = level
    if not out:
        raise RuntimeError(f"bulletin {stamp} bevatte geen zones met 'Nome zona'")
    return out, meta.json().get("name", stamp)


def status_de():
    """Duitsland: DWD Warnungen_Landkreise — dezelfde WARNCELLID-sleutel als onze Kreise-geometrie."""
    url = ("https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature"
           "&typeName=dwd:Warnungen_Landkreise&outputFormat=application/json&srsName=EPSG:4326")
    r = requests.get(url, headers=UA, timeout=60); r.raise_for_status()
    out = {}
    for f in r.json().get("features", []):
        p = f.get("properties", {}) or {}
        wid = p.get("WARNCELLID") or p.get("warncellid")
        sev = _SEVERITY.get(p.get("SEVERITY") or p.get("severity"), "yellow")
        if wid is None:
            continue
        key = f"DE-{wid}"
        # meest ernstige wint bij meerdere waarschuwingen op dezelfde Kreis
        order = ["green", "yellow", "orange", "red"]
        if key not in out or order.index(sev) > order.index(out[key]):
            out[key] = sev
    return out, f"{len(out)} actieve Kreis-waarschuwingen"


def status_at():
    """Oostenrijk: GeoSphere getWarnstatus — per feature `wlevel` (1=yellow, 2=orange, 3=red) en een
    `gemeinden`-array met 5-cijferige GKZ-codes. Die code = `g_id` in austria_gemeinden.geojson, dus de
    sleutel is `AT-<code>` (= zone_id). Alleen niet-groene gemeinden staan in het bestand; de rest is
    groen (een gemeinde zonder waarschuwing ontbreekt in de feed). Meest-ernstige wint per gemeinde.

    Bron keyless, geverifieerd: GET https://warnungen.zamg.at/wsapp/api/getWarnstatus (spec
    https://openapi.hub.geosphere.at/warnapi/v1/openapi.json, schema WarningStatusFeature). De
    geometrie in de feed is EPSG:31287 maar irrelevant — we koppelen op code, niet op geometrie."""
    r = requests.get("https://warnungen.zamg.at/wsapp/api/getWarnstatus", headers=UA, timeout=60)
    r.raise_for_status()
    lvl = {1: "yellow", 2: "orange", 3: "red"}
    order = ["green", "yellow", "orange", "red"]
    out = {}
    for f in r.json().get("features", []):
        p = f.get("properties", {}) or {}
        sev = lvl.get(p.get("wlevel"))
        if not sev:
            continue
        for code in (p.get("gemeinden") or []):
            key = f"AT-{code}"
            if key not in out or order.index(sev) > order.index(out[key]):
                out[key] = sev
    return out, f"{len(out)} actieve gemeente-waarschuwingen"


STATUS_FETCHERS = {"IT": status_it, "DE": status_de, "AT": status_at}
# FR/NL/BE/SI: nog geen statusbron aangesloten -> bewust afwezig (kaart toont 'kleuren onbekend').
#
# AT — aangesloten 2026-07-24 ná geometrie-herstel. De blokkade was ONZE geometrie, niet de bron:
#   austria_gemeinden.geojson kwam uit de verkeerde WFS-laag (Mittelpunkte/punten, lege attributen).
#   Sinds fetch_boundaries.py expliciet de GRENZEN-laag kiest en source_key=g_id gebruikt, vult zone_id
#   met AT-<GKZ> en matcht het 1-op-1 met de `gemeinden`-codes uit getWarnstatus. Zie status_at().


def main(countries):
    try:
        current = json.load(open(OUT))
    except Exception:
        current = {"generated": None, "zones": {}, "sources": {}}
    for cc in countries:
        fn = STATUS_FETCHERS.get(cc)
        if not fn:
            print(f"== {cc} == geen statusbron aangesloten (kaart toont neutraal) — ok")
            continue
        print(f"== {cc} ==")
        try:
            zones, label = fn()
            # oude entries van dit land vervangen
            current["zones"] = {k: v for k, v in current["zones"].items() if not k.startswith(cc + "-")}
            current["zones"].update(zones)
            current["sources"][cc] = {"ok": True, "label": label,
                                      "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            active = sum(1 for v in zones.values() if v != "green")
            print(f"  -> {len(zones)} zones, {active} actief niet-groen  ({label})")
        except Exception as e:
            current["sources"][cc] = {"ok": False, "error": str(e),
                                      "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            print(f"  FOUT: {e}  (bestaande status blijft staan)")
    current["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    json.dump(current, open(OUT, "w"), ensure_ascii=False)
    print(f"geschreven: {os.path.relpath(OUT)} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    args = [a.upper() for a in sys.argv[1:]] or list(STATUS_FETCHERS)
    main(args)
