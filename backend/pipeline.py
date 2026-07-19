"""Pipeline — rijgt de lagen aan elkaar (ADR-013).

Provider-adapters -> Unified Weather Model -> Decision Engine -> Confidence/Explainability.
Regelt cache-TTL en mock-fallback. De registers hieronder bepalen welke leverancier bij
welke rol hoort (GOVERNANCE §3: hier voeg je een bron toe).
"""
import json
import os
from datetime import datetime, timedelta

import config
from core import unified_model, decision_engine, explainability, region_resolver, model_registry, country_resolver, warning_status
from models.locations import slugify

# --- Providerregisters per rol -------------------------------------------------
from providers.forecast.openmeteo import OpenMeteoForecast
from providers.forecast.windy import WindyForecast
from providers.forecast.openweather import OpenWeatherForecast
from providers.observation.openweather import OpenWeatherObservation
from providers.observation.weerlive import Weerlive
from providers.airquality.openmeteo import OpenMeteoAir
from providers.airquality.iqair import IQAir
from providers.warning.meteoalarm import MeteoAlarm
from providers.warning.protezionecivile import ProtezioneCivile
from providers.warning.arso import ARSO
from providers.warning.geosphere import GeoSphere
from providers.warning.dwd import DWD
from providers.lightning.blitzortung import Blitzortung
from providers.radar.rainviewer import RainViewer


def _select_warnings(country, location):
    """Country-gate (ADR-030, Commit 2). Bepaalt WELKE bron mag spreken over deze locatie,
    puur op landbevoegdheid — nog geen ernst-aggregatie (dat is unified_model). Retourneert
    (providers, trace, state). Keten: land -> bevoegde autoriteit -> (later) aggregatie."""
    location = location or {}
    candidates = [
        ProtezioneCivile(location.get("alert_zone", "")),  # country_scope ["IT"]
        ARSO(),                                             # ["SI"]
        GeoSphere(),                                        # ["AT"]
        DWD(),                                              # ["DE"]
    ]
    selected, rejected, steps = [], [], []
    for prov in candidates:
        scope = getattr(prov, "country_scope", None) or []
        if country and country in scope:
            selected.append(prov)
            steps.append({"provider": prov.name, "decision": "SELECTED",
                          "reason": "bevoegd voor dit land"})
        else:
            reason = "geen land bepaald" if not country else f"alleen {'/'.join(scope)}"
            rejected.append({"authority": prov.name, "scope": scope, "reason": reason})
            steps.append({"provider": prov.name, "decision": "REJECTED", "reason": reason})
    trace = {"country": country, "selected": [p.name for p in selected],
             "rejected": rejected, "steps": steps}
    if selected:
        return selected, trace, "national"      # bevoegde bron aanwezig; data bepaalt SAFE/WARNING
    # GEEN nationale bron -> geen silent green. Europese fallback, expliciet als UNAVAILABLE.
    trace["fallback"] = "MeteoAlarm (Europees)"
    return [MeteoAlarm()], trace, "unavailable"


def _providers(region, location, warning_provs):
    location = location or {}
    provs = [
        OpenMeteoForecast(region["open_meteo_models"]),     # forecast, keyless, MODEL-AWARE
        WindyForecast(config.TOKENS["windy"], region["windy_models"]),  # forecast, token, MODEL-AWARE
        OpenWeatherForecast(config.TOKENS["openweather"]),  # forecast, token
        OpenWeatherObservation(config.TOKENS["openweather"]),  # observation, token
        Weerlive(config.TOKENS["weerlive"]),                # observation (KNMI-meting), NL/Vlaanderen
        IQAir(config.TOKENS["iqair"]) if config.TOKENS["iqair"] else OpenMeteoAir(),  # aqi
    ] + warning_provs + [                                   # warning (country-gated, ADR-030)
        Blitzortung(),                                      # lightning (stub)
        RainViewer(),                                       # radar (stub)
    ]
    return provs


def _mock_readings(lat, lon):
    """Fallback als de live-forecast onbereikbaar is (bv. geen internet)."""
    from providers.base import Provider
    import hashlib

    def seed(salt):
        raw = f"{lat:.3f}:{lon:.3f}:{datetime.now():%Y-%m-%d-%H}:{salt}"
        return int(hashlib.sha256(raw.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF

    p = Provider(token="")
    p.name, p.role, p.base_confidence = "Mock (offline)", "forecast", 40
    gust = round(15 + seed("g") * 90)
    return [
        p.reading("temperature", round(12 + seed("t") * 24)),
        p.reading("feels_like", round(12 + seed("t") * 24) + round(seed("f") * 5)),
        p.reading("wind_speed", round(gust * 0.5)),
        p.reading("wind_gust", gust),
        p.reading("rain_amount", round(seed("r") * 120)),
        p.reading("rain_next_hours", round(seed("n") * 30)),
        p.reading("cape", round(seed("c") * 4200)),
    ]


def _cache_path(name):
    return os.path.join(config.CACHE_DIR, f"{slugify(name)}.json")


def _fresh(path):
    """Geef de cache terug als 'expires' nog niet is verstreken (ADR-001)."""
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if datetime.now() < datetime.fromisoformat(data["expires"]):
            return data
    except Exception:
        return None
    return None


def _src_label(reading):
    """Weergavenaam: 'Open-Meteo ICON-EU', 'Windy ECMWF', of 'OpenWeather'."""
    provider = reading.get("provider", "?")
    model = reading.get("model")
    if not model or model == provider:
        return provider
    return f"{provider} {model}"


def _annotate_weights(readings, terrain):
    """Ken elk forecast/observation-reading een consensusgewicht toe (Model Registry +
    terreinbonus). Weegt op MODEL/bron; een KNMI-meting weegt zwaarder dan een forecast."""
    for r in readings:
        if r.get("role") in ("forecast", "observation"):
            r["weight"] = model_registry.weight_for(r.get("model", r["provider"]), terrain)
    return readings


def _assemble(location, readings, accommodation, thresholds, cache_state, region,
              country=None, warning_trace=None, warning_state=None):
    model = unified_model.build(readings)
    decision = decision_engine.decide(model, accommodation, thresholds)
    expl = explainability.explain(model, decision)
    forecast = [r for r in readings if r.get("role") == "forecast"]
    forecast_sources = sorted({_src_label(r) for r in forecast})
    dominant = None
    if forecast:
        dominant = max(forecast, key=lambda r: r.get("weight", 1.0)).get("model")
    warning = dict(expl["warning"])
    # ADR-030 Commit 3 — statusmodel: WARNING / SAFE / UNAVAILABLE / STALE (UNAVAILABLE != SAFE).
    wl = model.get("warning_level", {})
    level = wl.get("value") or "green"
    expires = None
    for r in wl.get("readings", []):
        if r.get("value") == level and r.get("expires"):
            expires = r["expires"]
            break
    status = warning_status.resolve(warning_state, level, expires)
    if status == warning_status.UNAVAILABLE:
        cc = country or "onbekend"
        authority = f"geen nationale bron ({cc})"
        reason = "geen bevoegde nationale waarschuwingsbron voor dit land"
    else:
        authority = warning.get("authority")
        reason = {"WARNING": "officiële waarschuwing actief",
                  "SAFE": "bevoegde bron gecontroleerd — geen waarschuwing",
                  "STALE": "bron beschikbaar maar waarschuwing verlopen"}.get(status, "")
    warning = warning_status.to_object(status, authority, level, reason)
    warning["expires"] = expires
    return {
        "location": location["name"],
        "coordinates": {"lat": location["lat"], "lon": location["lon"]},
        "country": country,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "region": {
            "id": region["id"], "name": region["name"],
            "terrain": region["terrain"], "note": region.get("note", ""),
            "models": forecast_sources, "dominant": dominant,
        },
        "verdict": expl["verdict"],
        "decision": {"level": decision["level"], "action": decision["action"]},
        "reason": decision["reason"],
        "confidence": expl["confidence"],
        "factors": expl["factors"],
        "warning": warning,
        "warning_routing": warning_trace,
        "cache": cache_state,
    }


def build_current(location, accommodation="tent", force=False):
    thresholds = config.load_thresholds()
    path = _cache_path(location["name"])
    lat, lon = location["lat"], location["lon"]
    region = region_resolver.resolve(lat, lon)
    # ADR-030 Commit 2 — bestuurlijke laag: land bepalen, dan de bevoegde bron(nen) selecteren.
    ctx = country_resolver.resolve_context(lat, lon, stored=location.get("country"),
                                           stored_region=location.get("region"))
    country = ctx["country"]
    # backfill: eenmalig geresolved land/regio opslaan zodat context daarna direct is
    if country and (not location.get("country") or (ctx.get("region") and not location.get("region"))):
        try:
            from models.locations import backfill_meta
            backfill_meta(location["name"], country, ctx.get("region"))
        except Exception:
            pass
    warning_provs, wtrace, wstate = _select_warnings(country, location)

    # Verse cache: readings hergebruiken, engine opnieuw draaien (accommodatie kan wijzigen)
    if not force:
        cached = _fresh(path)
        if cached and "_readings" in cached:
            readings = _annotate_weights(cached["_readings"], region["terrain"])
            doc = _assemble(location, readings, accommodation, thresholds, "hit", region,
                            country, wtrace, wstate)
            doc["updated"] = cached.get("updated")
            doc["expires"] = cached.get("expires")
            doc["_readings"] = cached["_readings"]
            return _strip(doc)

    # Verse readings ophalen
    readings = []
    forecast_ok = False
    for prov in _providers(region, location, warning_provs):
        try:
            part = prov.read(lat, lon)
        except NotImplementedError:
            continue
        except Exception:
            continue
        if part and prov.role == "forecast":
            forecast_ok = True
        readings.extend(part)

    if not forecast_ok:
        readings.extend(_mock_readings(lat, lon))

    _annotate_weights(readings, region["terrain"])

    now = datetime.now()
    expires = now + timedelta(minutes=thresholds["cache_max_age_min"])
    doc = _assemble(location, readings, accommodation, thresholds, "miss", region,
                    country, wtrace, wstate)
    doc["updated"] = now.isoformat(timespec="seconds")
    doc["expires"] = expires.isoformat(timespec="seconds")
    doc["_readings"] = readings

    os.makedirs(config.CACHE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)

    return _strip(doc)


def _strip(doc):
    """Interne velden niet naar de frontend sturen."""
    return {k: v for k, v in doc.items() if not k.startswith("_")}
