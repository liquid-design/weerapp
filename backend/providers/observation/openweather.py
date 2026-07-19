"""Observation-rol — gemeten waarden van stations (token vereist). Stub tot activatie.

Observaties krijgen een hoger basisvertrouwen dan forecasts (het is een echte meting).
Ze vullen dezelfde canonieke velden (bv. temperature, wind_gust), zodat de confidence-engine
meting vs. verwachting kan kruisen.
"""
from ..base import Provider


class OpenWeatherObservation(Provider):
    role = "observation"
    name = "OpenWeather (station)"
    base_confidence = 90

    def read(self, lat, lon):
        if self.mock:
            return []
        # TODO: OpenWeather current weather (self.token) -> readings("temperature", ...), enz.
        raise NotImplementedError("Observation real API nog niet geactiveerd.")
