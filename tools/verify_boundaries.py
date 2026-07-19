"""verify_boundaries.py — controleert opgehaalde zonegeometrie tegen het contract (ADR-031).

Draai op je Mac NA fetch_boundaries.py. Rapporteert per bestand: aantal features, property-namen,
of het genormaliseerde model klopt, en een ruwe CRS-check (liggen de coördinaten binnen -180..180 /
-90..90 = waarschijnlijk EPSG:4326, of zijn het grote getallen = nog niet herprojecteerd).

    python tools/verify_boundaries.py            # alle *.geojson in de datamap
    python tools/verify_boundaries.py de fr      # specifieke landen
"""
import sys, os, json, glob

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "map", "data")
REQUIRED = ["zone_id", "country", "authority", "zone_type", "geometry_status", "zone", "level"]


def _first_coord(geom):
    c = geom["coordinates"]
    while isinstance(c[0], list):
        c = c[0]
    return c


def check(path):
    name = os.path.basename(path)
    try:
        gj = json.load(open(path))
    except Exception as e:
        print(f"  {name}: KAN NIET LADEN — {e}"); return
    feats = gj.get("features", [])
    if not feats:
        print(f"  {name}: 0 features (leeg?)"); return
    p0 = feats[0].get("properties", {})
    lon, lat = _first_coord(feats[0]["geometry"])[:2]
    crs_ok = -180 <= lon <= 180 and -90 <= lat <= 90
    missing = [k for k in REQUIRED if k not in p0]
    print(f"  {name}")
    print(f"    features      : {len(feats)}")
    print(f"    properties    : {list(p0.keys())}")
    print(f"    eerste coord  : [{lon}, {lat}]  -> {'EPSG:4326 OK' if crs_ok else 'NIET 4326 (herprojectie nodig!)'}")
    print(f"    model-contract: {'compleet' if not missing else 'MIST: '+', '.join(missing)}")
    print(f"    _source       : {gj.get('_source','?')}")


COUNTRY_FILE = {
    "de": "germany", "fr": "france", "nl": "netherlands", "be": "belgium",
    "at": "austria", "si": "slovenia", "it": "italy",
}

if __name__ == "__main__":
    args = [a.lower() for a in sys.argv[1:]]
    files = sorted(glob.glob(os.path.join(DATA, "*.geojson")))
    if args:
        stems = [COUNTRY_FILE.get(a, a) for a in args]
        files = [f for f in files if any(os.path.basename(f).lower().startswith(s) for s in stems)]
    print(f"Controleer {len(files)} bestand(en) in {os.path.relpath(DATA)}:")
    for f in files:
        check(f)
