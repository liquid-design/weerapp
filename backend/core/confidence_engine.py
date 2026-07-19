"""Confidence Engine — hoe zeker is een waarde, op basis van bron-overeenstemming.

Eén bron  -> basisvertrouwen van die bron ("niet gekruist").
Meer bronnen -> hoe dichter bij elkaar, hoe hoger het vertrouwen; grote spreiding = laag
vertrouwen ("modellen spreken elkaar tegen"). Categorische velden: aandeel dat het eens is.
"""


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


# Regen in categorieën: kleine absolute verschillen ("droog") mogen de confidence niet drukken.
_RAIN_BANDS = {
    "rain_amount": [(1, "droog"), (5, "licht"), (20, "matig")],       # mm/24u
    "rain_next_hours": [(0.5, "droog"), (2, "licht"), (10, "matig")],  # mm/6u
}


def _rain_band(field, value):
    for limit, label in _RAIN_BANDS[field]:
        if value <= limit:
            return label
    return "zwaar"


def _rain_confidence(entry, field):
    nums = [r["value"] for r in entry.get("readings", []) if isinstance(r["value"], (int, float))]
    if not nums:
        return None
    if len(nums) == 1:
        base = max((r.get("confidence", 70) for r in entry["readings"]), default=70)
        return min(base, 85), _label(min(base, 85)), 1
    bands = [_rain_band(field, v) for v in nums]
    order = ["droog", "licht", "matig", "zwaar"]
    span = max(order.index(b) for b in bands) - min(order.index(b) for b in bands)
    pct = {0: 92, 1: 60, 2: 35}.get(span, 25)  # zelfde categorie = hoog; verder uiteen = laag
    return pct, _label(pct), len(nums)


def field_confidence(entry, field=None):
    """entry = model[field] met 'readings' en 'value'. Geeft (percentage, label, n_bronnen)."""
    if field in _RAIN_BANDS:
        return _rain_confidence(entry, field)
    readings = entry.get("readings", [])
    nums = [r["value"] for r in readings if isinstance(r["value"], (int, float))]
    n = len(readings)

    if n == 0:
        return None
    if len(nums) <= 1:
        base = max((r.get("confidence", 70) for r in readings), default=70)
        pct = min(base, 85)
        return pct, _label(pct), n

    mean = sum(nums) / len(nums)
    rng = max(nums) - min(nums)
    rel = rng / mean if mean else 0
    pct = round(_clamp(100 - rel * 80, 25, 98))
    return pct, _label(pct), n


def categorical_confidence(entry):
    readings = entry.get("readings", [])
    vals = [r["value"] for r in readings if r["value"] is not None]
    if not vals:
        return None
    top = entry.get("value")
    agree = sum(1 for v in vals if v == top) / len(vals)
    pct = round(_clamp(agree * 100, 25, 98))
    return pct, _label(pct), len(readings)


def _label(pct):
    if pct >= 80:
        return "hoog"
    if pct >= 55:
        return "matig"
    return "laag"


def overall(model, driver_fields):
    """Advies-vertrouwen = zwakste schakel onder de velden die het advies bepaalden."""
    pcts = []
    for f in driver_fields:
        entry = model.get(f)
        if not entry:
            continue
        c = field_confidence(entry, f)
        if c:
            pcts.append(c[0])
    if not pcts:
        return 70, _label(70)
    p = min(pcts)  # conservatief: laagste telt
    return p, _label(p)
