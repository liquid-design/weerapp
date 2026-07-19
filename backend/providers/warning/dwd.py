"""Warning-rol — DWD (Duitsland), via de officiële Geoserver-waarschuwingslaag.

GEEN key nodig: het endpoint dwd:Warnungen_Gemeinden geeft de NU-actieve waarschuwingen als
GeoJSON. We filteren op het punt (lon/lat valt in de gemeente-polygoon) en normaliseren naar
hetzelfde schema als de andere warning-providers. Publiek onder GeoNutzV (© GeoBasis-DE/BKG).

DWD draagt rijke info: EVENT (gevaarstype), SEVERITY (ernst) en EXPIRES. Onbereikbaar of geen
waarschuwing -> green, nooit een misleidende melding.
"""
from datetime import datetime, timezone

import requests

from ..base import Provider

# Geoserver WFS: NU-actieve waarschuwingen per gemeente, als GeoJSON in EPSG:4326.
URL = "https://maps.dwd.de/geoserver/dwd/ows"

_DE = (47.2, 55.1, 5.8, 15.1)  # lat_min, lat_max, lon_min, lon_max (Duitsland)

# DWD CAP SEVERITY -> kleur (yellow=Wetterwarnung .. red=Unwetter/extremes)
_SEVERITY = {"Minor": "yellow", "Moderate": "orange", "Severe": "red", "Extreme": "red"}
_ORDER = ["green", "yellow", "orange", "red"]


def _point_in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geom(lon, lat, geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poly in polys:
        if poly and _point_in_ring(lon, lat, poly[0]):
            return True
    return False


def _parse(gj, lon, lat, now=None):
    """Pure functie: DWD-GeoJSON -> genormaliseerd {level, risk, active, name, expires}.
    Kiest de meest ernstige waarschuwing waarvan de gemeente-polygoon het punt bevat."""
    now = now or datetime.now(timezone.utc)
    best = None
    for f in (gj or {}).get("features", []) or []:
        p = f.get("properties", {}) or {}
        geom = f.get("geometry")
        if not geom or not _point_in_geom(lon, lat, geom):
            continue
        level = _SEVERITY.get(p.get("SEVERITY"), "yellow")
        risk = (p.get("EVENT") or "").strip().lower() or "onbekend"
        name = p.get("NAME") or p.get("AREADESC")
        expires = p.get("EXPIRES")
        rec = {"level": level, "risk": risk, "active": True, "name": name, "expires": expires}
        if best is None or _ORDER.index(level) > _ORDER.index(best["level"]):
            best = rec
    return best or {"level": "green", "risk": None, "active": False, "name": None, "expires": None}


class DWD(Provider):
    role = "warning"
    name = "DWD"
    country_scope = ["DE"]
    base_confidence = 90

    def __init__(self):
        super().__init__(token="live")
        self.mock = False

    def _covers(self, lat, lon):
        return _DE[0] <= lat <= _DE[1] and _DE[2] <= lon <= _DE[3]

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
        # kleine bounding box rond het punt beperkt de respons; lokaal doen we point-in-polygon
        d = 0.25
        params = {
            "service": "WFS", "version": "2.0.0", "request": "GetFeature",
            "typeName": "dwd:Warnungen_Gemeinden", "outputFormat": "application/json",
            "srsName": "EPSG:4326",
            # WFS 2.0 met EPSG:4326 verwacht lat,lon-volgorde in bbox
            "bbox": f"{lat-d},{lon-d},{lat+d},{lon+d},urn:ogc:def:crs:EPSG::4326",
        }
        try:
            resp = requests.get(URL, params=params, timeout=8)
            resp.raise_for_status()
            rec = _parse(resp.json(), lon, lat)
        except Exception:
            return []  # onbereikbaar -> geen misleidende waarschuwing
        authority = self.name
        if rec.get("name"):
            authority = f"{self.name} · {rec['name']}"
        if rec.get("active") and rec.get("risk"):
            authority = f"{self.name} · {rec['name']} · {rec['risk']}"
        return self._warn(rec["level"], authority, rec.get("expires"))
