"""Warning-rol — ARSO (Slovenië), via de officiële CAP-feed van meteo.arso.gov.si.

GEEN scraping: ARSO publiceert waarschuwingen als CAP 1.2 (dezelfde OASIS-standaard als Italië en
MeteoAlarm). We lezen de CAP-index, halen de CAP-bestanden op en parsen ze met de gedeelde
core.cap-kern. ARSO is de primaire bron; MeteoAlarm kan later als Europese fallback dienen.

Slovenië is klein maar meteorologisch complex (Julische Alpen, Karst, Adria, Pannonische vlakte).
ARSO deelt het land in enkele waarschuwingsregio's. Omdat het land klein is, resolven we de regio
uit lat/lon met een lichte bounds-tabel — geen handmatige zonecode nodig (anders dan Italië).
Bron: Agencija Republike Slovenije za okolje (ARSO).
"""
import re

import requests

from ..base import Provider
from core import cap

_INDEX = "https://meteo.arso.gov.si/uploads/probase/www/warning/text/en/warning_si/cap-index.html"
_BASE = "https://meteo.arso.gov.si/uploads/probase/www/warning/text/en/warning_si/"

_SI = (45.4, 46.9, 13.3, 16.6)  # lat_min, lat_max, lon_min, lon_max (Slovenië)

# Lichte waarschuwingsregio's (ruwe bounds; Slovenië is klein). Namen zoals ARSO/MeteoAlarm ze
# in de CAP-areaDesc kan gebruiken, plus Sloveense variant voor matching.
_REGIONS = [
    ("Slovenia - North-West", (46.1, 46.9, 13.3, 14.6)),
    ("Slovenia - South-West", (45.4, 46.1, 13.3, 14.6)),
    ("Slovenia - Central",    (45.8, 46.4, 14.3, 15.2)),
    ("Slovenia - North-East", (46.2, 46.9, 15.0, 16.6)),
    ("Slovenia - South-East", (45.4, 46.2, 14.9, 16.6)),
]

_CACHE = {"zones": None, "fetched": None}
_TTL_SECONDS = 3 * 3600


def _region_for(lat, lon):
    best = None
    for name, (la0, la1, lo0, lo1) in _REGIONS:
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            # kies de regio waarvan het middelpunt het dichtst bij ligt bij overlap
            cy, cx = (la0 + la1) / 2, (lo0 + lo1) / 2
            d = (lat - cy) ** 2 + (lon - cx) ** 2
            if best is None or d < best[0]:
                best = (d, name)
    return best[1] if best else None


class ARSO(Provider):
    role = "warning"
    name = "ARSO"
    country_scope = ["SI"]
    base_confidence = 90

    def __init__(self):
        super().__init__(token="live")
        self.mock = False

    def _covers(self, lat, lon):
        return _SI[0] <= lat <= _SI[1] and _SI[2] <= lon <= _SI[3]

    def _cap_urls(self):
        html = requests.get(_INDEX, timeout=8).text
        urls = []
        for m in re.findall(r'href=["\']?([^"\'>\s]+\.(?:xml|cap))', html, re.IGNORECASE):
            urls.append(m if m.startswith("http") else _BASE + m.lstrip("/").split("/")[-1])
        return list(dict.fromkeys(urls))

    def _load_zones(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        if _CACHE["zones"] is not None and _CACHE["fetched"] and \
                (now - _CACHE["fetched"]).total_seconds() < _TTL_SECONDS:
            return _CACHE["zones"]
        merged = {"by_code": {}, "by_name": {}}
        for url in self._cap_urls():
            try:
                parsed = cap.parse(requests.get(url, timeout=8).content, now=now)
            except Exception:
                continue
            merged["by_code"].update(parsed["by_code"])
            merged["by_name"].update(parsed["by_name"])
        _CACHE.update({"zones": merged, "fetched": now})
        return merged

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
        region = _region_for(lat, lon)
        try:
            parsed = self._load_zones()
        except Exception:
            return []
        if not parsed:
            return []
        # geen actieve waarschuwingen -> rustig (groen), maar wel ARSO als autoriteit
        rec = None
        if region:
            rec = parsed["by_name"].get(region.lower())
        # val terug op de meest ernstige actieve waarschuwing in Slovenië als de regio niet matcht
        if rec is None and parsed["by_name"]:
            actives = [r for r in parsed["by_name"].values() if r.get("active")]
            if actives:
                order = ["green", "yellow", "orange", "red"]
                rec = max(actives, key=lambda r: order.index(r["level"]))
        level = rec["level"] if rec else "green"
        detail = self.name + (f" · {region}" if region else "")
        if rec and rec.get("active"):
            detail = f"{self.name} · {rec.get('risk', '')}".strip(" ·")
        return self._warn(level, detail, rec.get('expires') if rec else None)
