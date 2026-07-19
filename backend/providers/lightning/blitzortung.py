"""Lightning-rol — bliksemafstand (km tot dichtstbijzijnde inslag). Stub.

Blitzortung heeft geen simpele keyless punt-API; dit is een placeholder die de rol vastlegt.
Zolang leeg, blijft lightning_distance onbekend en laat de beslisengine dat netjes weg.
"""
from ..base import Provider


class Blitzortung(Provider):
    role = "lightning"
    name = "Blitzortung"
    base_confidence = 70

    def read(self, lat, lon):
        return []  # nog niet gekoppeld
