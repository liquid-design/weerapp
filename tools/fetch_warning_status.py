"""fetch_warning_status.py — haalt de ACTUELE waarschuwingsniveaus per zone op (ADR-032).

Gescheiden van de geometrie (fetch_boundaries.py): grenzen veranderen zelden, kleuren dagelijks.
De kaart leest alleen het resultaat (warning_status.json) en roept NOOIT providers aan.

    zone_sources.json -> STATUS_FETCHERS[land] -> warning_status.json { "DE-105334000": "orange", ... }

Eerlijkheidsregel: geen statusbron voor een land -> dat land ontbreekt in het bestand en de kaart
toont neutraal + 'kleuren onbekend'. Nooit een verzonnen kleur.

Draai (Mac/LXC, met internet):   python tools/fetch_warning_status.py it de
Cron-baar via tools/refresh_zones.sh (of vaker als je wilt; het bestand is klein).
"""
import sys, os, json
from datetime import datetime, timezone

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "frontend", "map", "data")
OUT = os.path.join(DATA, "warning_status.json")
UA = {"User-Agent": "Weerwijsheid/3.0 (persoonlijke weerbeslisser)"}

_SEVERITY = {"Minor": "yellow", "Moderate": "orange", "Severe": "red", "Extreme": "red"}


def status_it():
    """Italië: het dagelijkse Protezione Civile-bulletin (TopoJSON) draagt per zone de kleur."""
    base = "https://raw.githubusercontent.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica/master/files/"
    # index-bestand van vandaag zoeken via de GitHub contents-API is rate-limited; het bulletin
    # publiceert een stabiel 'last'-patroon: probeer de recentste via de daglijst in files/.
    # Pragmatisch: het laatst bekende naamformaat wordt door de kaartsite zelf geladen; wij
    # pakken de door de site gerefereerde json via het vaste patroon van vandaag en gisteren.
    from datetime import date, timedelta
    candidates = []
    for d in (date.today(), date.today() - timedelta(days=1)):
        for hhmm in ("1458", "1500", "1437", "1600", "1400"):
            candidates.append(f"{d:%Y%m%d}_{hhmm}")
    for stamp in candidates:
        try:
            r = requests.get(base + stamp + ".json", headers=UA, timeout=15)
            if r.status_code != 200:
                continue
            meta = r.json()
            topo_url = meta["today"]["topo_json"]
            t = requests.get(topo_url, headers=UA, timeout=30).json()
            obj = next(iter(t["objects"].values()))
            out = {}
            for g in obj["geometries"]:
                p = g.get("properties", {})
                rapp = (p.get("Rappresentata nella mappa", "") or "").upper()
                level = "red" if "ROSSA" in rapp else "orange" if "ARANCIONE" in rapp \
                        else "yellow" if "GIALLA" in rapp else "green"
                name = p.get("Nome zona")
                if name:
                    out[f"IT-{name}"] = level
            return out, meta.get("name", stamp)
        except Exception:
            continue
    raise RuntimeError("geen recent bulletin gevonden (probeer later)")


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


STATUS_FETCHERS = {"IT": status_it, "DE": status_de}
# FR/NL/BE/AT/SI: nog geen statusbron aangesloten -> bewust afwezig (kaart toont 'kleuren onbekend').


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
