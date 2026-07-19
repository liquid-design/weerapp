"""AirQuality-rol — IQAir (token vereist). Stub tot activatie."""
from ..base import Provider


class IQAir(Provider):
    role = "airquality"
    name = "IQAir"
    base_confidence = 85

    def read(self, lat, lon):
        if self.mock:
            return []
        # TODO: IQAir nearest_city (self.token) -> readings("air_quality", <band>).
        raise NotImplementedError("IQAir real API nog niet geactiveerd.")
