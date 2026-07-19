"""Warning-rol — GeoSphere Austria (Oostenrijk), via de officiële Warn-API.

GEEN scraping en geen geometrie-dependency: het endpoint neemt zelf lat/lon en geeft de
waarschuwingen van de juiste GEMEENTE terug (GeoSphere stelt waarschuwingen op gemeentebasis
samen). We lezen de 'properties' en normaliseren naar hetzelfde schema als de CAP-landen.

Anders dan CAP draagt GeoSphere rijkere info: gevaarstype (onweer/hitte/wind/…) en een
impact-tekst. Hoogalpiene gebieden vallen bewust buiten de waarschuwing (dal wél, pas niet).
Publiek onder CC-BY-4.0. Bron: GeoSphere Austria.
"""
from datetime import datetime, timezone

import requests

from ..base import Provider

URL = "https://warnungen.zamg.at/wsapp/api/getWarningsForCoords"

_AT = (46.3, 49.1, 9.4, 17.2)  # lat_min, lat_max, lon_min, lon_max (Oostenrijk)

# rawinfo.wlevel -> kleur
_LEVEL = {1: "yellow", 2: "orange", 3: "red"}
_ORDER = ["green", "yellow", "orange", "red"]

# rawinfo.wtype -> gevaarstype (GeoSphere-codering)
_TYPE = {
    1: "wind", 2: "regen", 3: "sneeuw", 4: "ijzel",
    5: "onweer", 6: "hitte", 7: "kou", 8: "temperatuur",
}


def _to_dt(unix_str):
    try:
        return datetime.fromtimestamp(int(unix_str), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _parse(data, now=None):
    """Pure functie: GeoSphere-GeoJSON -> genormaliseerd {level, risk, active, name, expires,
    impact}. Kiest de meest ernstige NU-actieve waarschuwing; anders de eerstvolgende. Los testbaar."""
    now = now or datetime.now(timezone.utc)
    props = (data or {}).get("properties", {}) or data or {}
    loc = ((props.get("location") or {}).get("properties") or {})
    name = loc.get("name")
    best = None
    for w in props.get("warnings", []) or []:
        p = w.get("properties", {}) or {}
        raw = p.get("rawinfo", {}) or {}
        level = _LEVEL.get(raw.get("wlevel"), "green")
        risk = _TYPE.get(raw.get("wtype"), "onbekend")
        start = _to_dt(raw.get("start"))
        end = _to_dt(raw.get("end"))
        active = bool(start and end and start <= now <= end)
        if not active:
            continue  # alleen wat NU geldt telt mee voor de beslissing
        rec = {"level": level, "risk": risk, "active": True, "name": name,
               "expires": end.isoformat() if end else None,
               "impact": (p.get("auswirkungen") or p.get("text") or "").strip()}
        if best is None or _ORDER.index(level) > _ORDER.index(best["level"]):
            best = rec
    return best or {"level": "green", "risk": None, "active": False,
                    "name": name, "expires": None, "impact": ""}


class GeoSphere(Provider):
    role = "warning"
    name = "GeoSphere Austria"
    country_scope = ["AT"]
    base_confidence = 90

    def __init__(self):
        super().__init__(token="live")
        self.mock = False

    def _covers(self, lat, lon):
        return _AT[0] <= lat <= _AT[1] and _AT[2] <= lon <= _AT[3]

    def _warn(self, level, authority, expires=None):
        return [
            {"field": "warning_level", "value": level, "provider": self.name,
             "model": self.name, "role": self.role, "confidence": self.base_confidence,
             "expires": expires, "time": ""},
            {"field": "warning_authority", "value": authority, "provider": self.name,
             "model": self.name, "role": self.role, "confidence": self.base_confidence, "time": ""},
        ]

    def read(self, lat, lon):
        if not self._covers(lat, lon):
            return []
        try:
            resp = requests.get(URL, params={"lon": lon, "lat": lat, "lang": "en"}, timeout=8)
            resp.raise_for_status()
            rec = _parse(resp.json())
        except Exception:
            return []  # onbereikbaar -> geen misleidende waarschuwing
        authority = self.name
        if rec.get("name"):
            authority = f"{self.name} · {rec['name']}"
        if rec.get("active") and rec.get("risk"):
            authority = f"{self.name} · {rec['name']} · {rec['risk']}"
        return self._warn(rec["level"], authority, rec.get('expires'))
