"""Decision Engine — bepaalt het advies. Bron-agnostisch (ADR-005, ADR-014).

Leest UITSLUITEND canonieke velden uit het unified model (forecast.wind_gust, cape, ...),
nooit een leverancier. Output: niveau + redenen (met veld+waarde) + actie + driver-velden.
Drempels komen uit config/thresholds.json.
"""
from core import unified_model as um

_ORDER = ["green", "yellow", "orange", "red", "violet"]

_ACTIONS = {
    "green":  "Geen bijzondere maatregelen — geniet buiten. Hou je gewone check aan.",
    "yellow": "Opletten: zet losse zaken vast en hou de radar in de gaten.",
    "orange": "Neem maatregelen: verwijder luifel/vouwwanden, mijd laaggelegen plekken bij "
              "water en blijf bij onweer niet in de tent.",
    "red":    "Beoordeel je verblijf: een tent is nu geen veilige plek. Overweeg uitwijken "
              "naar een stevig gebouw.",
    "violet": "Uitwijken naar veilige accommodatie. Volg de officiële waarschuwing; bij nood 112.",
}


def _max(a, b):
    return a if _ORDER.index(a) >= _ORDER.index(b) else b


def _band(value, bands):
    level = "green"
    for name in ("yellow", "orange", "red", "violet"):
        if name in bands and value >= bands[name]:
            level = name
    return level


def decide(model, accommodation, thresholds):
    reasons = []
    drivers = []
    level = "green"

    def add(field, level_):
        drivers.append(field)

    gust = um.value(model, "wind_gust")
    if gust is not None:
        wl = _band(gust, thresholds["wind_gust_kmh"])
        if wl != "green":
            reasons.append({"field": "wind_gust", "text": f"windstoten {gust} km/u", "value": gust})
            add("wind_gust", wl)
        level = _max(level, wl)

    amount = um.value(model, "rain_amount")
    if amount is not None:
        rl = _band(amount, thresholds["rain_amount_mm24"])
        if rl != "green":
            reasons.append({"field": "rain_amount", "text": f"regen {amount} mm/24u", "value": amount})
            add("rain_amount", rl)
        level = _max(level, rl)

    cape = um.value(model, "cape")
    if cape is not None:
        cl = _band(cape, thresholds["cape_jkg"])
        if cl != "green":
            reasons.append({"field": "cape", "text": f"CAPE {cape} J/kg", "value": cape})
            add("cape", cl)
        level = _max(level, cl)

    lightning = um.value(model, "lightning_distance")
    if lightning is not None and cape is not None:
        if lightning <= thresholds["lightning_near_km"] and cape >= thresholds["cape_jkg"]["yellow"]:
            reasons.append({"field": "lightning_distance", "text": f"bliksem op {lightning} km", "value": lightning})
            add("lightning_distance", "orange")
            level = _max(level, "orange")

    vuln = thresholds["accommodation_vulnerability"].get(accommodation, 0.5)
    if vuln >= 1.0 and gust is not None and gust >= thresholds["wind_gust_kmh"]["orange"] and level == "orange":
        reasons.append({"field": None, "text": f"kwetsbaar verblijf: {accommodation}", "value": None})
        level = _max(level, "red")
    elif vuln >= 1.0 and level in ("orange", "red"):
        reasons.append({"field": None, "text": f"kwetsbaar verblijf: {accommodation}", "value": None})

    warning = um.value(model, "warning_level")
    if warning and warning in _ORDER:
        if _ORDER.index(warning) > _ORDER.index(level):
            reasons.append({"field": "warning_level", "text": f"officiële waarschuwing: {warning}", "value": warning})
            add("warning_level", warning)
        level = _max(level, warning)

    if not reasons:
        reasons.append({"field": None, "text": "geen drempels overschreden", "value": None})

    return {
        "level": level,
        "reason": reasons,
        "action": _ACTIONS[level],
        "drivers": list(dict.fromkeys(drivers)),  # uniek, volgorde behouden
    }
