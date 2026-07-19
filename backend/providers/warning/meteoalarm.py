"""Warning-rol — officiële waarschuwing (impact-kleur + autoriteit).

Nu neutraal ('green', niet gekoppeld) zodat het advies op echt weer berust. Volgende stap:
MeteoAlarm CAP-feeds (feeds.meteoalarm.org) parsen en op zone matchen, of nationale diensten
(KNMI/KMI/Protezione Civile).
"""
from ..base import Provider


class MeteoAlarm(Provider):
    role = "warning"
    name = "MeteoAlarm"
    base_confidence = 88

    def __init__(self):
        super().__init__(token="live")
        self.mock = True  # tot echte feed-koppeling

    def _authority(self, lat, lon):
        if lat > 50.5:
            return "KNMI"
        if 49.5 < lat <= 51.5 and lon < 6.5:
            return "KMI"
        if 41 <= lat <= 47.5 and 6.5 <= lon <= 18.5:
            return "Protezione Civile"
        if 41 <= lat <= 51 and lon < 8.5:
            return "Météo-France"
        return "MeteoAlarm"

    def read(self, lat, lon):
        suffix = "" if not self.mock else " (niet gekoppeld)"
        return [
            {"field": "warning_level", "value": "green", "provider": self.name,
             "role": self.role, "confidence": self.base_confidence, "time": ""},
            {"field": "warning_authority", "value": self._authority(lat, lon) + suffix,
             "provider": self.name, "role": self.role, "confidence": self.base_confidence, "time": ""},
        ]
