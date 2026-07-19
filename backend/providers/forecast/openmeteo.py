"""Forecast-rol — Open-Meteo (keyless), MODEL-AWARE.

Open-Meteo is een distributielaag boven meerdere modellen (ICON, ECMWF, GFS, AROME, ...).
Deze adapter bevraagt PER locatie de door de Region Resolver aanbevolen modellen en levert
elk model als een APARTE bron. Zo vergelijkt de confidence-engine echte modellen onderling
(ICON-EU vs ECMWF vs ...) in plaats van alleen distributeurs.

Een model dat de plek fysiek niet dekt, geeft null terug -> die readings vallen weg. Zo lost
'modelbeschikbaarheid' zichzelf op zonder harde regels.
"""
import requests

from ..base import Provider

URL = "https://api.open-meteo.com/v1/forecast"

_MODEL_NAMES = {
    "best_match": "Open-Meteo (auto)",
    "ecmwf_ifs04": "ECMWF",
    "ecmwf_ifs025": "ECMWF-025",
    "gfs_seamless": "GFS",
    "icon_seamless": "ICON",
    "icon_eu": "ICON-EU",
    "icon_d2": "ICON-D2",
    "meteofrance_seamless": "AROME/ARPEGE",
    "meteofrance_arome_france": "AROME",
    "meteofrance_arpege_europe": "ARPEGE",
    "metno_seamless": "MET Norway",
    "ukmo_seamless": "UKMO",
}


def _num(v):
    return v if isinstance(v, (int, float)) else None


def _parse(data):
    """Pure functie: Open-Meteo-JSON (1 model) -> dict canonieke velden. Los testbaar."""
    cur = data.get("current", {}) or {}
    hourly = data.get("hourly", {}) or {}
    times = hourly.get("time", []) or []
    precip = hourly.get("precipitation", []) or []
    capes = hourly.get("cape", []) or []
    idx = times.index(cur["time"]) if cur.get("time") in times else 0

    def _sum(arr, start, n):
        vals = [_num(v) for v in arr[start:start + n] if _num(v) is not None]
        return round(sum(vals), 1) if vals else 0

    cape_win = [_num(c) for c in capes[idx:idx + 12] if _num(c) is not None]
    t = _num(cur.get("temperature_2m"))
    f = _num(cur.get("apparent_temperature"))
    g = _num(cur.get("wind_gusts_10m"))
    s = _num(cur.get("wind_speed_10m"))
    return {
        "temperature": round(t) if t is not None else None,
        "feels_like": round(f) if f is not None else None,
        "wind_speed": round(s) if s is not None else None,
        "wind_gust": round(g) if g is not None else None,
        "rain_next_hours": _sum(precip, idx, 6),
        "rain_amount": _sum(precip, idx, 24),
        "cape": round(max(cape_win)) if cape_win else None,
    }


class OpenMeteoForecast(Provider):
    role = "forecast"
    base_confidence = 80

    def __init__(self, models=None):
        super().__init__(token="live")
        self.mock = False
        # models: lijst van Open-Meteo model-id's (regio-advies). Leeg -> best_match.
        self.models = models or ["best_match"]
        self.name = "Open-Meteo"

    def _fetch(self, lat, lon, model):
        params = {
            "latitude": lat, "longitude": lon,
            "wind_speed_unit": "kmh", "timezone": "auto", "forecast_days": 2,
            "current": "temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,precipitation",
            "hourly": "precipitation,cape",
        }
        if model and model != "best_match":
            params["models"] = model
        resp = requests.get(URL, params=params, timeout=8)
        resp.raise_for_status()
        return _parse(resp.json())

    def read(self, lat, lon):
        out = []
        fields = ("temperature", "feels_like", "wind_speed", "wind_gust",
                  "rain_next_hours", "rain_amount", "cape")
        for model in self.models:
            label = _MODEL_NAMES.get(model, f"Open-Meteo ({model})")
            try:
                parsed = self._fetch(lat, lon, model)
            except Exception:
                continue  # dit model niet bereikbaar -> sla over
            model_readings = []
            for fld in fields:
                if parsed.get(fld) is not None:
                    model_readings.append(self.reading(fld, parsed[fld], model=label))
            # model dekt de plek niet (alles null) -> niets toevoegen
            if model_readings:
                out.extend(model_readings)
        return out
