"""verify_boundaries.py — controleert opgehaalde zonegeometrie tegen het contract (ADR-031).

Registry-gedreven: alleen bestanden die als `file` in zone_sources.json staan zijn zonebestanden;
andere *.geojson in de datamap (landcontouren, modelvlakken) worden overgeslagen, niet gefaald.

Dit is een echte POORT: hij controleert WAARDEN, niet alleen of velden bestaan. Per zonebestand,
over ALLE features:
  - zone_id heeft een niet-lege suffix na "<LAND>-"        (leeg = onbruikbaar als sleutel)
  - zone (weergavenaam) is niet leeg/null
  - geometrie is Polygon of MultiPolygon                    (Point = geen zone)
  - de per-feature source_key komt overeen met het register (register mag niet 'liegen')
  - de REQUIRED-velden bestaan; ruwe CRS-check (EPSG:4326?)
Exit-code 1 zodra één bestand faalt, zodat CI/kickstart het als fout ziet.

    python tools/verify_boundaries.py            # alle geregistreerde bestanden
    python tools/verify_boundaries.py de fr      # specifieke landen
"""
import sys, os, json, glob

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "map", "data")
REQUIRED = ["zone_id", "country", "authority", "zone_type", "geometry_status", "zone", "level"]
POLY = {"Polygon", "MultiPolygon"}


def _first_coord(geom):
    c = geom["coordinates"]
    while isinstance(c[0], list):
        c = c[0]
    return c


def check(path, record):
    """Valideer één zonebestand tegen het contract. Retourneert True als het slaagt."""
    name = os.path.basename(path)
    country = record["country"]
    reg_key = record.get("source_key")
    try:
        gj = json.load(open(path))
    except Exception as e:
        print(f"  {name}: KAN NIET LADEN — {e}"); return False
    feats = gj.get("features", [])
    if not feats:
        print(f"  {name}: 0 features (leeg?)"); return False

    p0 = feats[0].get("properties", {})
    lon, lat = _first_coord(feats[0]["geometry"])[:2]
    crs_ok = -180 <= lon <= 180 and -90 <= lat <= 90
    missing = [k for k in REQUIRED if k not in p0]

    prefix = f"{country}-"
    bad_zid = sum(1 for f in feats
                  if not (str(f["properties"].get("zone_id", "")).startswith(prefix)
                          and len(str(f["properties"].get("zone_id", ""))) > len(prefix)))
    bad_zone = sum(1 for f in feats if not str(f["properties"].get("zone") or "").strip())
    bad_geom = sum(1 for f in feats if (f.get("geometry") or {}).get("type") not in POLY)
    file_keys = {f["properties"].get("source_key") for f in feats}
    fk = next(iter(file_keys)) if len(file_keys) == 1 else sorted(file_keys)

    errors = []
    if missing:
        errors.append("ontbrekende velden: " + ", ".join(missing))
    if bad_zid:
        errors.append(f"{bad_zid}/{len(feats)} zonder bruikbare zone_id-suffix na {prefix!r}")
    if bad_zone:
        errors.append(f"{bad_zone}/{len(feats)} met lege/ontbrekende zone-naam")
    if bad_geom:
        geoms = sorted({(f.get('geometry') or {}).get('type') for f in feats})
        errors.append(f"{bad_geom}/{len(feats)} niet-Polygon geometrie (types: {geoms})")
    if len(file_keys) != 1 or fk != reg_key:
        errors.append(f"source_key register={reg_key!r} != bestand={fk!r}")
    if not crs_ok:
        errors.append(f"eerste coord [{lon}, {lat}] lijkt niet EPSG:4326 (herprojectie nodig)")

    print(f"  {name}  ({len(feats)} features)")
    print(f"    properties : {list(p0.keys())}")
    print(f"    CRS        : [{lon}, {lat}] -> {'EPSG:4326 OK' if crs_ok else 'NIET 4326'}")
    print(f"    source_key : register {reg_key!r} vs bestand {fk!r}")
    if errors:
        for e in errors:
            print(f"    ✗ {e}")
        print(f"    -> FAIL ({len(errors)} soort(en) fout)")
        return False
    print(f"    -> OK (zone_id-suffix, zone-naam, Polygon, source_key: alle {len(feats)} features geldig)")
    return True


COUNTRY_FILE = {
    "de": "germany", "fr": "france", "nl": "netherlands", "be": "belgium",
    "at": "austria", "si": "slovenia", "it": "italy",
}


def registered_records():
    """basename -> {country, source_key} voor elk land met een `file` in het register (ADR-031)."""
    reg = json.load(open(os.path.join(DATA, "zone_sources.json")))
    out = {}
    for cc, rec in reg["countries"].items():
        if rec.get("file"):
            out[rec["file"]] = {"country": cc, "source_key": rec.get("source_key")}
    return out


if __name__ == "__main__":
    args = [a.lower() for a in sys.argv[1:]]
    records = registered_records()
    on_disk = sorted(glob.glob(os.path.join(DATA, "*.geojson")))
    files = [f for f in on_disk if os.path.basename(f) in records]
    skipped = [f for f in on_disk if os.path.basename(f) not in records]
    if args:
        stems = [COUNTRY_FILE.get(a, a) for a in args]
        files = [f for f in files if any(os.path.basename(f).lower().startswith(s) for s in stems)]

    print(f"Controleer {len(files)} geregistreerd(e) bestand(en) in {os.path.relpath(DATA)}:")
    failed = [f for f in files if not check(f, records[os.path.basename(f)])]
    if skipped and not args:
        print(f"Overgeslagen ({len(skipped)}× — niet in zone_sources.json, geen zonebestand): "
              + ", ".join(os.path.basename(f) for f in skipped))

    if failed:
        print(f"\nRESULTAAT: {len(failed)} van {len(files)} bestand(en) FAALT: "
              + ", ".join(os.path.basename(f) for f in failed))
        sys.exit(1)
    print(f"\nRESULTAAT: alle {len(files)} bestand(en) voldoen aan het contract.")
