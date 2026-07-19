"""Warning-rol — Protezione Civile 'Bollettino di Criticità' (Italië), via officiële CAP-feed.

GEEN scraping: de Bollettino wordt door DPC dagelijks als CAP 1.2 (OASIS-standaard) gepubliceerd
op hun eigen GitHub-repo onder CC-BY-4.0. We halen het nieuwste bulletin op, parsen het CAP-XML
en zetten het om naar een zone -> kleur-map. Voor een locatie met een bekende 'zona di allerta'
(code als 'Lomb-04' of de zonenaam) geven we de impact-kleur terug.

Zonder zonecode kan een punt niet betrouwbaar aan een zone worden gekoppeld (dat vereist de
zonegeometrie/shapefile). Dan rapporteren we dat de zone niet is ingesteld i.p.v. te gokken —
een beslistool hoort niet te raden. Bronvermelding: Dipartimento della Protezione Civile.
"""
import io
import zipfile
from datetime import datetime, timezone

import requests

from ..base import Provider
from core import cap

_API = ("https://api.github.com/repos/pcm-dpc/"
        "DPC-Bollettini-Criticita-Idrogeologica-Idraulica/commits?path=files/xml&per_page=1")
_RAW = ("https://raw.githubusercontent.com/pcm-dpc/"
        "DPC-Bollettini-Criticita-Idrogeologica-Idraulica/master/files/xml/")

_IT = (36.0, 47.5, 6.0, 19.0)  # lat_min, lat_max, lon_min, lon_max

# Kleine module-cache zodat we GitHub niet bij elke locatie bevragen
_CACHE = {"url": None, "zones": None, "fetched": None}
_TTL_SECONDS = 3 * 3600


class ProtezioneCivile(Provider):
    role = "warning"
    name = "Protezione Civile"
    country_scope = ["IT"]
    base_confidence = 90

    def __init__(self, zone=""):
        super().__init__(token="live")
        self.mock = False
        self.zone = (zone or "").strip()

    def _covers(self, lat, lon):
        return _IT[0] <= lat <= _IT[1] and _IT[2] <= lon <= _IT[3]

    def _latest_url(self):
        resp = requests.get(_API, timeout=8,
                            headers={"Accept": "application/vnd.github+json"})
        resp.raise_for_status()
        sha = resp.json()[0]["sha"]
        detail = requests.get(_API.split("/commits?")[0] + f"/commits/{sha}", timeout=8)
        detail.raise_for_status()
        for f in detail.json().get("files", []):
            fn = f["filename"]
            if fn.startswith("files/xml/") and fn.endswith(".zip"):
                return _RAW + fn.split("/")[-1]
        return None

    def _load_zones(self):
        now = datetime.now(timezone.utc)
        if _CACHE["zones"] is not None and _CACHE["fetched"] and \
                (now - _CACHE["fetched"]).total_seconds() < _TTL_SECONDS:
            return _CACHE["zones"]
        url = self._latest_url()
        if not url:
            return None
        zip_bytes = requests.get(url, timeout=10).content
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            cap_name = next((n for n in zf.namelist() if n.startswith("Cap_")), None)
            if not cap_name:
                return None
            parsed = cap.parse(zf.read(cap_name), now=now)
        _CACHE.update({"url": url, "zones": parsed, "fetched": now})
        return parsed

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
            return []  # buiten Italië
        if not self.zone:
            return self._warn("green", f"{self.name} (zone niet ingesteld)")
        try:
            parsed = self._load_zones()
        except Exception:
            return []  # feed onbereikbaar -> geen (misleidende) waarschuwing
        if not parsed:
            return []
        rec = parsed["by_code"].get(self.zone) or parsed["by_name"].get(self.zone.lower())
        level = rec["level"] if rec else "green"
        detail = self.name
        if rec and rec.get("active"):
            detail = f"{self.name} · {rec['risk']}"
        return self._warn(level, detail, rec.get('expires') if rec else None)
