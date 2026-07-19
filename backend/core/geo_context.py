"""Geographic Authority Context (ADR-030, Commit 4).

Bouwt per locatie de keten: locatie -> land -> administratieve regio -> bevoegde warning-authority
-> relevante modellen. Dit is het CONTRACT dat de 'Waarom deze bron?'-klik en (later) de kaart
voeden. Geen kaart-UI, geen nieuwe providers, geen weerdata — puur resolutie.

Eerlijkheidsregel (gekozen ontwerp): toon alleen bronnen die ECHT zijn aangesloten. Waar geen
bevoegde bron bestaat, zeggen we dat expliciet ('geen nationale bron') i.p.v. een niet-gebouwde
regionale dienst te suggereren.
"""
from core import region_resolver, model_registry, country_resolver, warning_status
from providers.forecast.openmeteo import _MODEL_NAMES


def _models(region):
    out = []
    for mid in region.get("open_meteo_models", []):
        label = _MODEL_NAMES.get(mid, mid)
        meta = model_registry.meta_for(label) or {}
        res = meta.get("resolution_km")
        out.append({
            "name": label,
            "coverage": "Europa",
            "resolution_km": res,
            "cell_km2": round(res * res) if isinstance(res, (int, float)) else None,
            "type": meta.get("type"),
        })
    return out


def _authority(country, location):
    # lokale import: pipeline importeert providers; vermijdt import-cyclus bij laden
    from pipeline import _select_warnings
    provs, trace, state = _select_warnings(country, location or {})
    national = [p for p in provs if getattr(p, "country_scope", None)]
    if national:
        return {
            "provider": national[0].name,
            "scope": "national",
            "confidence": "HIGH",
        }, trace, state
    return {"provider": None, "scope": None, "confidence": "LOW"}, trace, state


def build(location):
    """-> contract met land, regio, autoriteit(+trace), modellen, databronnen en kaartlagen."""
    lat, lon = location["lat"], location["lon"]
    ctx = country_resolver.resolve_context(
        lat, lon, stored=location.get("country"), stored_region=location.get("region"))
    country, region_name = ctx["country"], ctx["region"]
    region = region_resolver.resolve(lat, lon)
    authority, trace, state = _authority(country, location)

    # kaartlagen die deze context activeert (namen; Commit 5 rendert ze)
    layers = []
    if authority["provider"]:
        layers.append(f"authority_area:{country}")
    layers += [f"model_coverage:{m['name']}" for m in _models(region)]

    # databronnen: alleen wat structureel is aangesloten (eerlijkheidsregel)
    data_sources = {
        "forecast": ["Open-Meteo (model-aware)"],
        "observation": ["Weerlive (KNMI)"] if country in ("NL", "BE") else [],
        "warning": [authority["provider"]] if authority["provider"] else [],
    }

    return {
        "location": location["name"],
        "country": country,
        "region": region_name,                 # administratieve regio (bv. Gorenjska)
        "meteo_region": region["name"],         # meteorologische regio (bv. Alpen)
        "authority": authority,
        "warning_state": state,
        "models": _models(region),
        "data_sources": data_sources,
        "layers": layers,
        "trace": trace.get("steps", []),
        "note": None if authority["provider"] else
                f"Geen nationale waarschuwingsbron aangesloten voor {country or 'dit gebied'}.",
    }
