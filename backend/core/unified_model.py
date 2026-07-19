"""Unified Weather Model — één gestandaardiseerd beeld uit alle providers.

Groepeert readings per canoniek veld en berekent een consensuswaarde. Voor numerieke velden is
dat een GEWOGEN gemiddelde (gewicht uit de Model Registry, ADR-022), plus het 'leidende' model
(zwaarst wegende bron). De rest van het systeem kent alleen dit model, nooit de bron rechtstreeks.
"""
_WARN_ORDER = ["green", "yellow", "orange", "red", "violet"]
_AIR_ORDER = ["goed", "redelijk", "matig", "slecht", "zeer slecht", "extreem slecht"]

UNITS = {
    "temperature": "°C", "feels_like": "°C",
    "wind_speed": "km/u", "wind_gust": "km/u",
    "rain_next_hours": "mm", "rain_amount": "mm/24u",
    "cape": "J/kg", "lightning_distance": "km", "radar_eta": "min",
    "air_quality": "", "warning_level": "", "warning_authority": "",
}

MIN_FIELDS = {"lightning_distance", "radar_eta"}  # kleiner = relevanter


def _wmean(readings):
    nums = [(r["value"], r.get("weight", 1.0)) for r in readings
            if isinstance(r["value"], (int, float))]
    if not nums:
        return None
    tw = sum(w for _, w in nums)
    if tw == 0:
        return round(sum(v for v, _ in nums) / len(nums), 1)
    return round(sum(v * w for v, w in nums) / tw, 1)


def _dominant(readings):
    cand = [r for r in readings if r.get("value") is not None]
    if not cand:
        return None
    return max(cand, key=lambda r: r.get("weight", 1.0)).get("model")


def _winning_warning_provider(grouped):
    """Bron (provider) die het HOOGSTE warning_level zette. Autoriteit volgt ernst,
    zodat warning_level en warning_authority nooit meer uit verschillende bronnen komen
    (ADR-030, Commit 1). Gelijke niveaus: eerste in lijstvolgorde (deterministisch)."""
    cand = [r for r in grouped.get("warning_level", []) if r.get("value") in _WARN_ORDER]
    if not cand:
        return None
    winner = max(cand, key=lambda r: _WARN_ORDER.index(r["value"]))
    return winner.get("provider")


def _consensus(field, readings):
    vals = [r["value"] for r in readings if r["value"] is not None]
    if not vals:
        return None
    if field == "warning_level":
        return max(vals, key=lambda v: _WARN_ORDER.index(v) if v in _WARN_ORDER else 0)
    if field == "air_quality":
        return max(vals, key=lambda v: _AIR_ORDER.index(v) if v in _AIR_ORDER else 0)
    if field == "warning_authority":
        return vals[0]
    if field in MIN_FIELDS:
        return min(vals)
    return _wmean(readings)  # numeriek: gewogen gemiddelde


def build(readings):
    """readings -> { field: {value, unit, readings:[...], dominant} }"""
    grouped = {}
    for r in readings:
        grouped.setdefault(r["field"], []).append(r)
    model = {}
    for field, rs in grouped.items():
        model[field] = {
            "value": _consensus(field, rs),
            "unit": UNITS.get(field, ""),
            "readings": rs,
            "dominant": _dominant(rs) if field not in ("warning_authority",) else None,
        }
    # ADR-030 / Commit 1 — attributiefix: warning_authority volgt de bron van het WINNENDE
    # warning_level, niet meer simpelweg de eerste provider in de lijst. Invariant:
    # warning_level en warning_authority komen altijd uit dezelfde bron.
    if "warning_authority" in model:
        prov = _winning_warning_provider(grouped)
        if prov:
            match = next((r["value"] for r in grouped.get("warning_authority", [])
                          if r.get("provider") == prov and r.get("value")), None)
            model["warning_authority"]["value"] = match or prov
    return model


def value(model, field):
    return model.get(field, {}).get("value")
