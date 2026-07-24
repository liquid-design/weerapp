"""fetch_boundaries.py — haalt officiële waarschuwingszone-geometrie op, genormaliseerd.

Registry-gedreven (ADR-031): zone_sources.json is leidend. Geen land-specifieke if-statements,
maar loader-ADAPTERS die per bron-type werken. Nieuwe landen = een regel in het register + (zo
nodig) een bestaande loader hergebruiken.

    zone_sources.json  ->  fetch_boundaries.py  ->  loaders[source.loader].fetch()  ->  normalize()  ->  save()

Governance: officiële bron -> vaste geometrie -> lokaal in de repo -> geen runtime-afhankelijkheid.
Draai als BEWUSTE build-stap op een machine MET internet (niet de dev-sandbox):

    python tools/fetch_boundaries.py de fr nl      # specifieke landen
    python tools/fetch_boundaries.py all

Herprojectie (NL/BE/AT: EPSG:28992/31370/31287 -> 4326) vereist pyproj; ontbreekt die, dan meldt
de loader dat en slaat het land over i.p.v. verkeerde coördinaten te schrijven.
"""
import sys, os, json
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "frontend", "map", "data")
REGISTRY = os.path.join(DATA, "zone_sources.json")
UA = {"User-Agent": "Weerwijsheid/3.0 (persoonlijke weerbeslisser)"}

OUT_FILE = {  # land -> lokaal bestand (spiegelt 'file' in het register zodra present:true)
    "DE": "germany_warn_kreise.geojson", "FR": "france_vigilance_departements.geojson",
    "NL": "netherlands_provinces.geojson", "BE": "belgium_provinces.geojson",
    "AT": "austria_gemeinden.geojson", "SI": "slovenia_regions.geojson",
    "IT": "italy_alert_zones.geojson",
}


def _round(c, n=2):
    if isinstance(c[0], (int, float)):
        return [round(c[0], n), round(c[1], n)]
    return [_round(x, n) for x in c]


def _thin_ring(ring):
    """Verwijder opeenvolgende dubbele punten na afronden (scheelt fors, bv. NL-kustlijn)."""
    out = [ring[0]]
    for p in ring[1:]:
        if p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else ring


def _thin(geom):
    t = geom["type"]; c = geom["coordinates"]
    if t == "Polygon":
        geom["coordinates"] = [_thin_ring(r) for r in c]
    elif t == "MultiPolygon":
        geom["coordinates"] = [[_thin_ring(r) for r in poly] for poly in c]
    return geom


def _reproject_needed(crs):
    return crs and crs.upper() not in ("EPSG:4326", "CRS84", "WGS84")


def _make_transformer(crs):
    from pyproj import Transformer
    return Transformer.from_crs(crs, "EPSG:4326", always_xy=True)


def _project(coords, tf):
    if isinstance(coords[0], (int, float)):
        x, y = tf.transform(coords[0], coords[1])
        return [round(x, 4), round(y, 4)]
    return [_project(c, tf) for c in coords]


def normalize(features, src, country):
    """Bron-features -> uniform intern zone-model (ADR-031)."""
    key = src.get("source_key")
    tf = None
    if _reproject_needed(src.get("crs")):
        try:
            tf = _make_transformer(src["crs"])
        except Exception as e:
            raise RuntimeError(f"herprojectie {src['crs']}->4326 vereist pyproj: {e}")
    out = []
    for f in features:
        p = f.get("properties", {}) or {}
        geom = f["geometry"]
        coords = _project(geom["coordinates"], tf) if tf else _round(geom["coordinates"])
        # Weergavenaam: NOOIT de ID-sleutel eerst (anders toont DE de WARNCELLID i.p.v. de naam).
        # g_name = Statistik Austria (Gemeindename); generieke attribuutnaam, geen land-if.
        name = (p.get("NAME") or p.get("naam") or p.get("name") or p.get("nom")
                or p.get("domain_name") or p.get("g_name") or p.get(key))
        out.append({"type": "Feature", "properties": {
            "zone_id": f"{country}-{p.get(key,'')}",
            "country": country, "authority": src["authority"],
            "zone_type": src["zone_type"], "geometry_status": src["geometry_status"],
            "source_dataset": src["dataset"], "source_key": key,
            "zone": name, "level": "green",
        }, "geometry": _thin({"type": geom["type"], "coordinates": coords})})
    return {"type": "FeatureCollection",
            "_source": f"{src['authority']} — {src['dataset']} ({src['license']})",
            "features": out}


# ---- loader-adapters: één per bron-type, hergebruikt over landen ----

def _discover_layer(base_url, prefix):
    """Kies EXPLICIET de nieuwste GRENZEN-laag (polygonen), niet de Mittelpunkte (centroïden/punten).

    Statistik Austria publiceert per jaargang twee lagen onder dezelfde prefix:
      `<prefix><YYYYMMDD>`      = Gemeinden Grenzen      -> polygonen  (wat we willen)
      `<prefix>MP_<YYYYMMDD>`   = Gemeinden Mittelpunkte -> punten     (fout: leeg zone_id + Points)
    Alfabetisch sorteren koos ten onrechte de MP-laag ('M' > cijfer). We selecteren daarom alleen
    namen waar direct ná de prefix EXACT een 8-cijferige datum staat (dus geen `MP_`-infix), en
    nemen de nieuwste datum."""
    import re
    cap = base_url.split("?")[0] + "?service=WFS&version=2.0.0&request=GetCapabilities"
    r = requests.get(cap, headers=UA, timeout=90); r.raise_for_status()
    names = re.findall(r"<(?:wfs:)?Name>([^<]*" + re.escape(prefix) + r"[^<]*)</(?:wfs:)?Name>", r.text)
    dated = [(m.group(1), n) for n in names
             for m in [re.search(re.escape(prefix) + r"(\d{8})$", n)] if m]
    if not dated:
        raise RuntimeError(f"geen Grenzen-laag ('{prefix}'+datum, geen MP_) in capabilities; "
                           f"wel gevonden: {sorted(names)}")
    return max(dated)[1]  # nieuwste datum


def load_wfs_geojson(src):
    """WFS-endpoint dat GeoJSON teruggeeft (DWD Kreise, PDOK provincies, Statistik Austria).
    Bij een datum-placeholder in de laagnaam wordt de echte laag via capabilities ontdekt."""
    url = src["source"]
    if not url.lower().startswith("http"):
        url = "https://" + url
    # datum-placeholder? -> laagnaam dynamisch ontdekken (bv. STATISTIK_AUSTRIA_GEM_YYYYMMDD)
    if "YYYYMMDD" in url:
        import re
        base = url.split("?")[0]
        layer = _discover_layer(base, "STATISTIK_AUSTRIA_GEM_")
        url = re.sub(r"typeName=[^&]+", "typeName=" + layer, url)
    r = requests.get(url, headers=UA, timeout=120); r.raise_for_status()
    try:
        return r.json().get("features", [])
    except Exception:
        raise RuntimeError("geen JSON (endpoint gaf XML/HTML — controleer request=GetFeature/outputFormat)")


def load_geojson_direct(src):
    """Directe GeoJSON-download (Météo-France via data.gouv.fr)."""
    url = src["source"]
    if not url.lower().startswith("http"):
        url = "https://" + url
    r = requests.get(url, headers=UA, timeout=90); r.raise_for_status()
    return r.json().get("features", [])


def load_unsupported(src):
    raise RuntimeError(f"loader '{src['loader']}' vereist een handmatige stap — zie note: {src.get('note','')}")


LOADERS = {
    "wfs_geojson": load_wfs_geojson,
    "geojson_direct": load_geojson_direct,
    "statbel": "shipped",          # BE: meegeleverd in de repo (via github opgehaald + genormaliseerd)
    "meteoalarm": load_unsupported,    # SI: MeteoAlarm API-token of obcine-reconstructie
    "topojson_dpc": "shipped",     # IT: meegeleverd (TopoJSON-decoder al toegepast)
    "geojson_shipped": "shipped",  # FR: meegeleverd (github + normalisatie)
}


def _update_registry_present(country, filename):
    reg = json.load(open(REGISTRY))
    reg["countries"][country]["file"] = filename
    reg["countries"][country]["present"] = True
    json.dump(reg, open(REGISTRY, "w"), ensure_ascii=False, indent=2)


MANIFEST = os.path.join(DATA, "zone_manifest.json")


def _load_manifest():
    try:
        return json.load(open(MANIFEST))
    except Exception:
        return {"generated": None, "countries": {}}


def _write_manifest(country, ok, n_zones=0, error=None):
    from datetime import datetime, timezone
    m = _load_manifest()
    m["generated"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    m["countries"][country] = {
        "ok": ok, "fetched_at": m["generated"],
        "n_zones": n_zones, "error": error,
    }
    json.dump(m, open(MANIFEST, "w"), ensure_ascii=False, indent=2)


def fetch_country(country, registry):
    src = registry["countries"].get(country)
    if not src:
        print(f"  onbekend land: {country}"); return
    loader = LOADERS.get(src["loader"])
    if loader == "shipped":
        # Meegeleverd bestand: controleer aanwezigheid, markeer niet als 'gefaald'.
        name = OUT_FILE.get(country, f"{country.lower()}_zones.geojson")
        path = os.path.join(DATA, name)
        if os.path.exists(path):
            try:
                n = len(json.load(open(path)).get("features", []))
            except Exception:
                n = 0
            _write_manifest(country, True, n_zones=n)
            print(f"== {country} == meegeleverd ({name}, {n} zones) — geen ophaling nodig")
        else:
            _write_manifest(country, False, error="meegeleverd bestand ontbreekt")
            print(f"== {country} == meegeleverd bestand ontbreekt: {name}")
        return
    if not loader:
        print(f"  geen loader voor {country} ({src['loader']})")
        _write_manifest(country, False, error=f"geen loader ({src['loader']})"); return
    print(f"== {country} == loader={src['loader']} status={src['geometry_status']}")
    try:
        feats = loader(src)
        fc = normalize(feats, src, country)
        name = OUT_FILE.get(country, f"{country.lower()}_zones.geojson")
        path = os.path.join(DATA, name)
        json.dump(fc, open(path, "w"))
        _update_registry_present(country, name)
        n = len(fc["features"])
        _write_manifest(country, True, n_zones=n)
        print(f"  -> {name}: {n} zones, {os.path.getsize(path)//1024} KB  [present:true]")
    except Exception as e:
        _write_manifest(country, False, error=str(e))
        print(f"  overgeslagen: {e}")


if __name__ == "__main__":
    registry = json.load(open(REGISTRY))
    args = [a.upper() for a in sys.argv[1:]] or ["ALL"]
    todo = list(registry["countries"]) if args == ["ALL"] else args
    for c in todo:
        fetch_country(c, registry)
