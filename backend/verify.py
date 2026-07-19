"""Verificatierapport — toont per locatie welke provider/model welk veld leverde.

Draai op je Mac (met internet, na het invullen van .env):
    source .venv/bin/activate
    python backend/verify.py "Antwerpen:51.22,4.40" "Chamonix:45.92,6.87"

Zonder argumenten gebruikt het een standaard reis-testset. Geen server nodig; roept de
pipeline rechtstreeks aan.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import region_resolver, model_registry
from pipeline import build_current

DEFAULT = [
    ("Antwerpen", 51.22, 4.40), ("Ardennen", 50.05, 5.72),
    ("Chamonix", 45.92, 6.87), ("Gardameer", 45.55, 10.70),
    ("Rome", 41.90, 12.50), ("Oslo", 59.91, 10.75),
]

FIELDS = ["temperature", "wind_gust", "cape", "rain_amount"]
FLABEL = {"temperature": "Temperatuur", "wind_gust": "Windstoot",
          "cape": "CAPE", "rain_amount": "Regen 24u"}


def _parse_args(args):
    if not args:
        return DEFAULT
    out = []
    for a in args:
        name, coords = a.split(":")
        lat, lon = coords.split(",")
        out.append((name, float(lat), float(lon)))
    return out


def report(name, lat, lon):
    region = region_resolver.resolve(lat, lon)
    doc = build_current({"name": name, "lat": lat, "lon": lon}, "tent", force=True)
    print("=" * 52)
    print(f"Locatie: {name}")
    print(f"Regio:   {region['name']}  ({', '.join(region['terrain'])})")
    print(f"Leidend model: {doc['region'].get('dominant')}")
    print("-" * 52)
    print(f"{'Bron':28}{'gewicht':>8}")
    # verzamel unieke bronnen uit de factoren
    seen = {}
    for f in doc["factors"]:
        for s in f["sources"]:
            seen.setdefault(s["label"], s.get("model"))
    for label, mdl in sorted(seen.items()):
        w = model_registry.weight_for(mdl, region["terrain"]) if mdl else 1.0
        print(f"{label:28}{w:>8}")
    print("-" * 52)
    for field in FIELDS:
        blk = next((f for f in doc["factors"] if f["field"] == field), None)
        print(f"\n{FLABEL[field]}")
        if not blk:
            print("  (geen enkele bron)")
            continue
        for s in blk["sources"]:
            print(f"  {s['label']:26} {s['value']}")
        for miss in blk.get("missing", []):
            print(f"  {miss:26} unavailable")
        print(f"  -> consensus {blk['value']} {blk['unit']} | "
              f"confidence {blk['confidence']}% | leidend {blk['dominant']}")
    print()


if __name__ == "__main__":
    for name, lat, lon in _parse_args(sys.argv[1:]):
        report(name, lat, lon)
