"""Provider-basis voor de rollen-architectuur.

Een provider hoort bij één ROL (forecast / observation / warning / airquality /
lightning / radar) en levert 'readings': losse metingen van CANONIEKE velden. De rest van
het systeem kent alleen die canonieke velden, nooit de bron. Zo blijft de beslisengine
bron-agnostisch en kun je per rol meerdere leveranciers hangen.

Reading = {
  "field": "wind_gust",      # canoniek veld
  "value": 82,               # waarde (of None)
  "provider": "Windy",       # leveranciernaam
  "role": "forecast",        # rol
  "confidence": 80,          # basisvertrouwen van deze bron (0-100), 1-bron-geval
  "time": "17:55"
}
"""
from datetime import datetime


class Provider:
    role = "forecast"
    name = "Base"
    base_confidence = 70  # gebruikt als er maar één bron is voor een veld

    def __init__(self, token=""):
        self.token = token
        self.mock = not bool(token)

    def read(self, lat, lon):
        """Geef een lijst readings terug. Lege lijst = niets te melden / niet actief."""
        return []

    def reading(self, field, value, model=None):
        return {
            "field": field,
            "value": value,
            "provider": self.name,       # distributielaag: Open-Meteo / Windy / OpenWeather
            "model": model or self.name, # meteorologisch model: ECMWF / ICON-EU / ...
            "role": self.role,
            "confidence": self.base_confidence,
            "time": datetime.now().strftime("%H:%M"),
        }
