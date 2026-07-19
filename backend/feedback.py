"""Feedback-loop — append-only leerlog (ADR-016) + regelvalidatie (ADR-019).

Bewaart GEEN meteorologische historie. Alleen beslisfeedback: het advies, de weercontext die
het advies bepaalde, het menselijk oordeel, en de configuratieversie waaronder het advies tot
stand kwam. Dat laatste maakt regelvalidatie zuiver: je weet onder welke drempelset een regel
X% correct was.

De analyse is puur statistisch (kalibratie: te zwaar / juist / te licht). Bewust GEEN machine
learning — zie ADR-019. Eerst regels valideren, pas veel later eventueel modellen.
"""
import json
import os
from collections import Counter
from datetime import datetime

import config

VALID = {"perfect", "te voorzichtig", "te laat", "viel mee", "erger dan verwacht"}

# Kalibratie-interpretatie van menselijk oordeel t.o.v. het gegeven advies
_CALIBRATION = {
    "perfect": "juist",
    "te voorzichtig": "te_zwaar",
    "viel mee": "te_zwaar",
    "te laat": "te_licht",
    "erger dan verwacht": "te_licht",
}


def _load():
    if not os.path.exists(config.FEEDBACK_FILE):
        return []
    try:
        with open(config.FEEDBACK_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return []


def add(entry):
    if entry.get("feedback") not in VALID:
        return False
    thresholds = config.load_thresholds()
    records = _load()
    records.append({
        "time": datetime.now().isoformat(timespec="seconds"),
        "location": entry.get("location"),
        "level": entry.get("level"),
        "action": entry.get("action"),
        "feedback": entry.get("feedback"),
        "context": entry.get("snapshot", {}),          # bv. {wind_gust, cape, rain_amount}
        "thresholds_version": thresholds.get("version", "?"),
    })
    os.makedirs(config.DATA_DIR, exist_ok=True)
    tmp = config.FEEDBACK_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(records, fh, ensure_ascii=False, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, config.FEEDBACK_FILE)
    return True


def summary():
    records = _load()
    by_level = {}
    for r in records:
        by_level.setdefault(r.get("level", "?"), Counter())[r.get("feedback", "?")] += 1
    return {"total": len(records), "by_level": {lvl: dict(c) for lvl, c in by_level.items()}}


def analysis():
    """Regelvalidatie: kalibratie per niveau, per configuratieversie. Statistiek, geen ML."""
    records = _load()
    buckets = {}  # (version, level) -> Counter van juist/te_zwaar/te_licht
    for r in records:
        key = (r.get("thresholds_version", "?"), r.get("level", "?"))
        cal = _CALIBRATION.get(r.get("feedback"), "juist")
        buckets.setdefault(key, Counter())[cal] += 1

    out = []
    for (version, level), c in sorted(buckets.items()):
        total = sum(c.values())
        out.append({
            "thresholds_version": version,
            "level": level,
            "n": total,
            "juist_pct": round(100 * c["juist"] / total) if total else 0,
            "te_zwaar_pct": round(100 * c["te_zwaar"] / total) if total else 0,
            "te_licht_pct": round(100 * c["te_licht"] / total) if total else 0,
        })
    return {"total": len(records), "calibration": out}
