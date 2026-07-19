"""Forecast-rol — Windy Point Forecast API v2 (token vereist), MODEL-AWARE.

Windy is een distributielaag boven meerdere modellen. Deze adapter bevraagt per locatie de door
de Region Resolver aanbevolen Windy-modellen en levert elk als aparte bron met provider='Windy'
en model=<label>. Zo kun je 'ECMWF via Windy' vergelijken met 'ECMWF via Open-Meteo'.

Formaat (api.windy.com/api/point-forecast/v2):
  POST body {lat, lon, model, parameters:[...], levels:["surface"], key}  (key in de BODY)
  respons {ts:int[], units:{"param-level":unit}, "param-level": float[], ...}
  - temp-surface in KELVIN, wind_u/wind_v-surface in m/s, cape-surface in J/kg
  - neerslag als 'past3hprecip-surface' (eenheid uit 'units', vaak m -> ×1000 = mm)

Defensief: ontbrekende velden -> None (unavailable, niet 0). Onbekende sleutel -> veld valt weg.
De adapter kent GEEN modelgewichten (die zitten in de Model Registry).
"""
import math
import requests

from ..base import Provider

URL = "https://api.windy.com/api/point-forecast/v2"

# Region-model-id -> (Windy model-id, weergavelabel).
# LET OP: Windy Point Forecast kent GEEN 'ecmwf' (dat komt via Open-Meteo). Alleen deze wel:
_MODELS = {
    "iconEu": ("iconEu", "ICON-EU"),
    "iconD2": ("iconD2", "ICON-D2"),
    "arome": ("aromeFrance", "AROME"),
    "gfs": ("gfs", "GFS"),
}

# Windy's gratis/testplan levert geschudde nepdata, herkenbaar aan deze marker in de respons.
_TEST_MARKER = "testing API version"

# Kandidaat-sleutels per canoniek veld (Windy varieert soms in naamgeving)
_KEYS = {
    "temp": ["temp-surface"],
    "gust": ["gust-surface", "windGust-surface"],
    "wind_u": ["wind_u-surface"],
    "wind_v": ["wind_v-surface"],
    "cape": ["cape-surface"],
    "precip3h": ["past3hprecip-surface", "precip-surface"],
}


def _first(data, keys, idx=0):
    for k in keys:
        arr = data.get(k)
        if isinstance(arr, list) and len(arr) > idx and isinstance(arr[idx], (int, float)):
            return arr[idx], k
    return None, None


def _precip_to_mm(value, unit):
    if value is None:
        return None
    if unit and "mm" in unit:
        return round(value, 1)
    # standaard Windy: meters -> mm
    return round(value * 1000, 1)


def _parse(data):
    """Pure functie: Windy-respons -> dict canonieke velden (None = unavailable). Los testbaar."""
    units = data.get("units", {}) or {}
    out = {}

    tK, _ = _first(data, _KEYS["temp"])
    out["temperature"] = round(tK - 273.15) if tK is not None else None
    out["feels_like"] = None  # Windy levert geen kant-en-klare gevoelstemperatuur

    u, _ = _first(data, _KEYS["wind_u"])
    v, _ = _first(data, _KEYS["wind_v"])
    if u is not None and v is not None:
        out["wind_speed"] = round(math.hypot(u, v) * 3.6)
    else:
        out["wind_speed"] = None

    g, _ = _first(data, _KEYS["gust"])
    out["wind_gust"] = round(g * 3.6) if g is not None else None

    cape, _ = _first(data, _KEYS["cape"])
    out["cape"] = round(cape) if cape is not None else None

    p, pkey = _first(data, _KEYS["precip3h"])
    punit = units.get(pkey) if pkey else None
    mm3h = _precip_to_mm(p, punit)
    out["rain_next_hours"] = mm3h  # ~komende uren (3u-accumulatie)
    # 24u: som de eerste ~8 waarden van de 3u-neerslag indien beschikbaar
    if pkey and isinstance(data.get(pkey), list):
        vals = [x for x in data[pkey][:8] if isinstance(x, (int, float))]
        out["rain_amount"] = _precip_to_mm(sum(vals), punit) if vals else None
    else:
        out["rain_amount"] = None
    return out


class WindyForecast(Provider):
    role = "forecast"
    name = "Windy"
    base_confidence = 82

    def __init__(self, token="", models=None):
        super().__init__(token=token)
        # region-model-id's -> alleen de door Windy ondersteunde
        self.models = [m for m in (models or []) if m in _MODELS]

    def _post(self, lat, lon, windy_model, parameters):
        body = {"lat": round(lat, 3), "lon": round(lon, 3), "model": windy_model,
                "parameters": parameters, "levels": ["surface"], "key": self.token}
        resp = requests.post(URL, json=body, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _fetch_model(self, lat, lon, windy_model):
        # Degradatie: probeer volledige set, val terug als een parameter niet wordt ondersteund
        for params in (["temp", "wind", "windGust", "cape", "past3hprecip"],
                       ["temp", "wind", "windGust", "cape"],
                       ["temp", "wind", "windGust"]):
            try:
                data = self._post(lat, lon, windy_model, params)
            except Exception:
                continue
            # Gratis/testplan levert geschudde nepdata -> NIET in de consensus laten.
            if _TEST_MARKER in str(data.get("warning", "")):
                return None
            return _parse(data)
        return None

    def read(self, lat, lon):
        if self.mock or not self.models:
            return []
        out = []
        fields = ("temperature", "feels_like", "wind_speed", "wind_gust",
                  "rain_next_hours", "rain_amount", "cape")
        for region_id in self.models:
            windy_model, label = _MODELS[region_id]
            parsed = self._fetch_model(lat, lon, windy_model)
            if not parsed:
                continue
            for fld in fields:
                if parsed.get(fld) is not None:
                    out.append(self.reading(fld, parsed[fld], model=label))
        return out
