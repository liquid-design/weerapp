"""AirQuality-rol — Open-Meteo (keyless) levert de Europese AQI-klasse."""
import requests

from ..base import Provider

URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

_BANDS = [(20, "goed"), (40, "redelijk"), (60, "matig"), (80, "slecht"), (100, "zeer slecht")]


def _band(value):
    if value is None:
        return None
    for limit, label in _BANDS:
        if value <= limit:
            return label
    return "extreem slecht"


class OpenMeteoAir(Provider):
    role = "airquality"
    name = "Open-Meteo Air"
    base_confidence = 75

    def __init__(self):
        super().__init__(token="live")
        self.mock = False

    def read(self, lat, lon):
        params = {"latitude": lat, "longitude": lon,
                  "current": "european_aqi", "timezone": "auto"}
        resp = requests.get(URL, params=params, timeout=8)
        resp.raise_for_status()
        aqi = resp.json().get("current", {}).get("european_aqi")
        return [self.reading("air_quality", _band(aqi))]
