"""Forecast-rol — OpenWeather 5-day/3-hour forecast (token vereist).

Actief zodra OPENWEATHER_TOKEN is ingevuld. Levert dezelfde CANONIEKE velden als Open-Meteo
(temperature, feels_like, wind_speed, wind_gust, rain_next_hours, rain_amount), zodat de
confidence-engine ze kan kruisen. Geen CAPE (die komt van Open-Meteo/Windy).

Belangrijk: deze adapter is het ENIGE punt dat OpenWeather kent. De rest van het systeem ziet
alleen canonieke velden. De ruwe OpenWeather-JSON wordt nooit aan de frontend getoond.
"""
import requests

from ..base import Provider

URL = "https://api.openweathermap.org/data/2.5/forecast"


def _kmh(ms):
    return round(ms * 3.6) if isinstance(ms, (int, float)) else None


def _rain3(item):
    r = item.get("rain", {})
    v = r.get("3h") if isinstance(r, dict) else None
    return v if isinstance(v, (int, float)) else 0


def _parse(data):
    """Pure functie: OpenWeather-forecast-JSON -> dict canonieke velden. Los testbaar."""
    lst = data.get("list", []) or []
    if not lst:
        return {}
    first = lst[0]
    main = first.get("main", {}) or {}
    wind = first.get("wind", {}) or {}
    temp = main.get("temp")
    feels = main.get("feels_like")
    return {
        "temperature": round(temp) if isinstance(temp, (int, float)) else None,
        "feels_like": round(feels) if isinstance(feels, (int, float)) else None,
        "wind_speed": _kmh(wind.get("speed")),
        "wind_gust": _kmh(wind.get("gust")),
        "rain_next_hours": round(sum(_rain3(x) for x in lst[:2]), 1),   # ~6 uur
        "rain_amount": round(sum(_rain3(x) for x in lst[:8]), 1),       # ~24 uur
    }


class OpenWeatherForecast(Provider):
    role = "forecast"
    name = "OpenWeather"
    base_confidence = 78

    def read(self, lat, lon):
        if self.mock:
            return []  # geen token -> niet actief
        params = {"lat": lat, "lon": lon, "appid": self.token, "units": "metric"}
        resp = requests.get(URL, params=params, timeout=8)
        resp.raise_for_status()
        parsed = _parse(resp.json())
        fields = ("temperature", "feels_like", "wind_speed", "wind_gust",
                  "rain_next_hours", "rain_amount")
        return [self.reading(f, parsed[f], model="OpenWeather")
                for f in fields if parsed.get(f) is not None]
