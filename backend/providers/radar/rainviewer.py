"""Radar-rol — nowcast 'bui binnen X minuten' (radar_eta). Stub.

RainViewer is keyless, maar 'regen over N minuten op een punt' vereist het samplen van
radartegels — buiten scope van deze stap. Placeholder die de rol vastlegt.
"""
from ..base import Provider


class RainViewer(Provider):
    role = "radar"
    name = "RainViewer"
    base_confidence = 72

    def read(self, lat, lon):
        return []  # nog niet gekoppeld
