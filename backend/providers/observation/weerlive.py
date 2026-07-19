"""Observation-rol — Weerlive (KNMI 10-minuten-metingen), token vereist.

Optie A uit de architectuurbespreking: Weerlive is een ECHTE METING, geen voorspelling. Het
levert de canonieke velden die het meet (temperatuur, gevoelstemperatuur, wind, luchtvochtigheid,
dauwpunt) met een HOGER basisvertrouwen dan forecasts, zodat de confidence-/delta-logica de
forecasts hiertegen ijkt ("ECMWF voorspelt 21.4, Weerlive meet 22.1 -> +0.7 afwijking").

Alleen zinvol in Nederland/Vlaanderen (KNMI-meetnet). De adapter begrenst zichzelf daarop.
Weerlive levert GEEN actuele windstoot en GEEN moment-neerslag -> die blijven unavailable
(nooit 0). Bron: KNMI-meetgegevens via Weerlive.nl.
"""
import requests

from ..base import Provider

URL = "https://weerlive.nl/api/weerlive_api_v2.php"

# Ruwe begrenzing NL + Vlaanderen (KNMI-meetnet dekt dit gebied)
_LAT = (50.6, 53.7)
_LON = (2.5, 7.3)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _parse(data):
    """Pure functie: Weerlive-JSON -> dict canonieke velden (None = unavailable). Los testbaar."""
    live = (data.get("liveweer") or [{}])[0]
    temp = _num(live.get("temp"))
    gtemp = _num(live.get("gtemp"))
    windkmh = _num(live.get("windkmh"))
    lv = _num(live.get("lv"))
    dauwp = _num(live.get("dauwp"))
    return {
        "temperature": round(temp) if temp is not None else None,
        "feels_like": round(gtemp) if gtemp is not None else None,
        "wind_speed": round(windkmh) if windkmh is not None else None,
        "humidity": round(lv) if lv is not None else None,
        "dew_point": round(dauwp) if dauwp is not None else None,
        # Weerlive levert GEEN actuele windstoot of moment-neerslag:
        "wind_gust": None,
    }


class Weerlive(Provider):
    role = "observation"
    name = "Weerlive (KNMI)"
    base_confidence = 92  # meting > forecast

    def __init__(self, token=""):
        super().__init__(token=token)

    def _covers(self, lat, lon):
        return _LAT[0] <= lat <= _LAT[1] and _LON[0] <= lon <= _LON[1]

    def read(self, lat, lon):
        if self.mock or not self._covers(lat, lon):
            return []  # geen token, of buiten NL/Vlaanderen -> niet actief
        params = {"key": self.token, "locatie": f"{lat},{lon}"}
        resp = requests.get(URL, params=params, timeout=8)
        resp.raise_for_status()
        parsed = _parse(resp.json())
        fields = ("temperature", "feels_like", "wind_speed")
        return [self.reading(f, parsed[f], model="Weerlive (KNMI)")
                for f in fields if parsed.get(f) is not None]
