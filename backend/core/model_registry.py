"""Model Registry (ADR-022) — modelkennis en consensusgewichten.

Levert per bronnaam (label, bv. 'ICON-D2') het basisgewicht, met een terreinbonus als het
voorkeursterrein van het model bij de locatie past. Zo weegt de consensus modellen naar hun
meteorologische geschiktheid in plaats van alles 50/50 te behandelen.
"""
import config

_INDEX = None
_BONUS = 1.2


def _index():
    global _INDEX, _BONUS
    if _INDEX is None:
        data = config.load_models()
        _BONUS = data.get("terrain_bonus", 1.2)
        _INDEX = {}
        for key, entry in data.get("models", {}).items():
            entry = dict(entry, key=key)
            _INDEX[entry["label"]] = entry
    return _INDEX


def weight_for(label, terrain):
    """Basisgewicht × terreinbonus als het model bij dit terrein hoort."""
    entry = _index().get(label)
    if not entry:
        return 1.0
    w = entry.get("weight", 1.0)
    pref = set(entry.get("preferred_terrain", []))
    if pref & set(terrain or []):
        w *= _BONUS
    return round(w, 3)


def meta_for(label):
    """Type/resolutie voor weergave; leeg dict als onbekend."""
    entry = _index().get(label)
    if not entry:
        return {}
    return {"type": entry.get("type"), "resolution_km": entry.get("resolution_km")}
