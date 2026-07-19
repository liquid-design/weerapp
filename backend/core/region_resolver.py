"""Region Resolver (ADR-020) — coördinaten -> regioprofiel met voorkeursmodellen.

Belangrijk principe (van de architect): regio is NIET hetzelfde als modelgebied. Deze laag
geeft *advies* welke modellen op deze plek waarschijnlijk het sterkst zijn; een model dat de
plek fysiek niet dekt levert vanzelf niets en valt in de pipeline weg. Zo volgen we geen
politieke grenzen maar modeldekking + terrein.

resolve(lat, lon) -> {
  "id", "name", "terrain":[...], "note",
  "open_meteo_models":[...], "windy_models":[...]
}
"""
import config


def _contains(lat, lon, bounds):
    la, lo = bounds["lat"], bounds["lon"]
    return la[0] <= lat <= la[1] and lo[0] <= lon <= lo[1]


def resolve(lat, lon):
    regions = config.load_regions().get("regions", [])
    chosen = None
    for region in regions:
        if _contains(lat, lon, region.get("bounds", {})):
            chosen = region
            break
    if chosen is None:
        # geen enkele match (buiten Europa): neutrale strategie
        return {
            "id": "world_default", "name": "Buiten Europa",
            "terrain": ["onbekend"],
            "note": "Geen regioprofiel; best_match kiest zelf een model.",
            "open_meteo_models": ["best_match"], "windy_models": ["ecmwf"],
        }
    models = chosen.get("models", {})
    return {
        "id": chosen["id"],
        "name": chosen["name"],
        "terrain": chosen.get("terrain", []),
        "note": chosen.get("note", ""),
        "open_meteo_models": models.get("open_meteo", ["best_match"]),
        "windy_models": models.get("windy", []),
    }
