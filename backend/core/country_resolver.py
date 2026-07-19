"""Geographic Authority Resolver (ADR-030, Commit 2+4) — coördinaten -> land én regio.

Een landgrens is een administratief FEIT, geen rechthoek. Daarom géén bounding-box-gok maar
reverse-geocoding via officiële administratieve grenzen (Nominatim). Bronvolgorde, autoriteit
eerst: (1) opgeslagen waarde van de geocoder; (2) reverse-geocode; anders None.

resolve(lat,lon,stored) -> ISO-landcode (backward-compatible, Commit 2).
resolve_context(...)     -> {"country": "SI", "region": "Gorenjska"} (Commit 4).
Geen bepaling mogelijk -> None: in een beslistool raden we geen bevoegdheid.
"""
import requests

_ENDPOINT = "https://nominatim.openstreetmap.org/reverse"
_CACHE = {}  # (lat,lon) afgerond -> {"country":.., "region":..}


def _reverse(lat, lon):
    params = {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 8, "addressdetails": 1}
    headers = {"User-Agent": "Weerwijsheid/3.0 (persoonlijke weerbeslisser)"}
    resp = requests.get(_ENDPOINT, params=params, headers=headers, timeout=4)
    resp.raise_for_status()
    addr = resp.json().get("address", {}) or {}
    cc = (addr.get("country_code", "") or "").upper() or None
    # administratieve regio: state -> region -> county (eerste die bestaat)
    region = addr.get("state") or addr.get("region") or addr.get("county")
    return {"country": cc, "region": region}


def resolve_context(lat, lon, stored=None, stored_region=None):
    """-> {"country": ISO|None, "region": str|None}. Opgeslagen waarden hebben voorrang."""
    if stored:
        return {"country": stored.upper(), "region": stored_region}
    key = (round(lat, 3), round(lon, 3))
    if key not in _CACHE:
        try:
            _CACHE[key] = _reverse(lat, lon)
        except Exception:
            _CACHE[key] = {"country": None, "region": None}  # geen netwerk -> geen gok
    ctx = dict(_CACHE[key])
    if stored_region and not ctx.get("region"):
        ctx["region"] = stored_region
    return ctx


def resolve(lat, lon, stored=None):
    """Backward-compatible (Commit 2): -> alleen de ISO-landcode of None."""
    return resolve_context(lat, lon, stored=stored)["country"]
