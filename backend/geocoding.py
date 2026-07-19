"""Geocoding — plaatsnaam (camping/stad/land) -> coördinaten via Nominatim (keyless).

Los van de weer-providers: dit is geen weerrol maar een hulpmiddel voor locatiebeheer.
Nominatim-gebruiksregels: herkenbare User-Agent, laag volume, ~1 req/s.
"""
import requests

ENDPOINT = "https://nominatim.openstreetmap.org/search"


def _friendly_name(item):
    name = item.get("name")
    addr = item.get("address", {}) or {}
    place = (addr.get("city") or addr.get("town") or addr.get("village")
             or addr.get("municipality") or "")
    country = addr.get("country_code", "").upper()
    parts = [p for p in [name or place, country] if p]
    if not parts:
        parts = [item.get("display_name", "onbekend").split(",")[0]]
    return " · ".join(parts) if len(parts) > 1 else parts[0]


class GeocodingProvider:
    name = "Nominatim (OSM)"

    def __init__(self, email=""):
        self.email = email

    def search(self, query, limit=5):
        params = {"q": query, "format": "jsonv2", "limit": limit, "addressdetails": 1}
        if self.email:
            params["email"] = self.email
        headers = {"User-Agent": "Weerwijsheid/3.0 (persoonlijke weerbeslisser)"}
        resp = requests.get(ENDPOINT, params=params, headers=headers, timeout=8)
        resp.raise_for_status()
        results = []
        for item in resp.json():
            results.append({
                "name": _friendly_name(item),
                "display_name": item.get("display_name"),
                "lat": round(float(item["lat"]), 5),
                "lon": round(float(item["lon"]), 5),
                "type": item.get("type"),
                "country": (item.get("address", {}) or {}).get("country_code", "").upper(),
            })
        return results
