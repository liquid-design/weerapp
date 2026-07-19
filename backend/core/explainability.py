"""Explainability Engine — vertaalt beslissing + model + confidence naar uitleg.

Levert (1) een 3-staten verdict voor bovenaan (veilig/opletten/vertrekken),
(2) een lijst factoren met waarde, eenheid, bronnen en vertrouwen,
(3) het advies-vertrouwen.
"""
from core import confidence_engine as ce
from core import unified_model as um

# 5 niveaus -> 3 verdicts voor de kop
_VERDICT = {
    "green":  {"icon": "✔", "word": "Veilig",     "klass": "g"},
    "yellow": {"icon": "⚠", "word": "Opletten",   "klass": "y"},
    "orange": {"icon": "⚠", "word": "Maatregelen", "klass": "o"},
    "red":    {"icon": "✖", "word": "Vertrekken",  "klass": "r"},
    "violet": {"icon": "✖", "word": "Vertrekken",  "klass": "p"},
}

# Welke canonieke velden tonen we altijd in de onderbouwing (ruwe data)
_SHOW = ["wind_gust", "cape", "rain_amount", "rain_next_hours", "temperature",
         "feels_like", "lightning_distance", "air_quality"]


def _src_label(r):
    provider = r.get("provider", "?")
    model = r.get("model")
    if not model or model == provider:
        return provider
    return f"{provider} {model}"


def _field_block(model, field, active_forecast):
    entry = model.get(field)
    if not entry or entry.get("value") is None:
        return None
    if field in ("air_quality",):
        conf = ce.categorical_confidence(entry)
    else:
        conf = ce.field_confidence(entry, field)
    sources = [{"label": _src_label(r), "provider": r["provider"],
                "model": r.get("model"), "value": r["value"], "role": r["role"]}
               for r in entry.get("readings", []) if r.get("value") is not None]
    present = {s["label"] for s in sources}
    missing = sorted(active_forecast - present) if field != "air_quality" else []
    return {
        "field": field,
        "value": entry["value"],
        "unit": entry["unit"],
        "dominant": entry.get("dominant"),
        "confidence": conf[0] if conf else None,
        "confidence_label": conf[1] if conf else None,
        "n_sources": conf[2] if conf else 0,
        "sources": sources,
        "missing": missing,
    }


def explain(model, decision):
    verdict = _VERDICT.get(decision["level"], _VERDICT["green"])
    conf_pct, conf_label = ce.overall(model, decision["drivers"])

    active_forecast = {_src_label(r) for entry in model.values()
                       for r in entry.get("readings", [])
                       if r.get("role") == "forecast" and r.get("value") is not None}

    factors = []
    for f in _SHOW:
        block = _field_block(model, f, active_forecast)
        if block:
            factors.append(block)

    warning = {
        "level": um.value(model, "warning_level"),
        "authority": um.value(model, "warning_authority"),
    }
    return {
        "verdict": verdict,
        "confidence": {"pct": conf_pct, "label": conf_label},
        "factors": factors,
        "warning": warning,
    }
