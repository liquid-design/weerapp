/*
 * forecast.js — netwerklaag: Open-Meteo weerdata + geocoding.
 * Vult window.HH.geocode en window.HH.fetchForecast.
 */
(function () {
  "use strict";
  window.HH = window.HH || {};
  const HH = window.HH;

  const HOURLY = [
    "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "relative_humidity_2m", "wind_speed_10m", "wind_gusts_10m",
    "precipitation_probability", "temperature_2m", "dew_point_2m", "visibility",
    "wind_speed_250hPa",
  ].join(",");

  // Geocoding via Nominatim (OpenStreetMap): vindt niet alleen steden/dorpen
  // maar ook campings, gehuchten, adressen en natuurgebieden — veel rijker dan
  // een puur plaatsen-geocoder. Keyless en CORS-vriendelijk vanuit de browser.
  // Nominatim-beleid: laag volume, ~1 verzoek/seconde — de zoekbalk gebruikt
  // daarom debounce (zie app.js), niet één verzoek per toetsaanslag.
  async function geocode(q, signal) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2" +
      "&addressdetails=1&limit=6&accept-language=nl&q=" + encodeURIComponent(q);
    const r = await fetch(url, { signal, headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("Zoeken mislukt (" + r.status + ")");
    const data = await r.json();
    return data.map((it) => {
      const a = it.address || {};
      const place = it.name || a.city || a.town || a.village || a.hamlet ||
        a.municipality || (it.display_name || "").split(",")[0];
      return {
        name: place,
        display_name: it.display_name || "",
        lat: parseFloat(it.lat),
        lon: parseFloat(it.lon),
        type: it.type || "",
        category: it.category || "",
        country: (a.country_code || "").toUpperCase(),
      };
    });
  }

  async function fetchForecast(lat, lon) {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
      "&longitude=" + lon + "&hourly=" + HOURLY + "&forecast_days=7&timezone=auto";
    const r = await fetch(url);
    if (!r.ok) throw new Error("Open-Meteo gaf een fout (" + r.status + ")");
    return r.json();
  }

  // Omgekeerd: coördinaat -> plaatsnaam (voor het benoemen van nabije plekken).
  async function reverseGeocode(lat, lon, signal) {
    const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12" +
      "&accept-language=nl&lat=" + lat + "&lon=" + lon;
    const r = await fetch(url, { signal, headers: { "Accept": "application/json" } });
    if (!r.ok) return null;
    const it = await r.json();
    const a = it.address || {};
    const name = a.village || a.town || a.city || a.hamlet || a.municipality ||
      a.county || (it.display_name || "").split(",")[0];
    return { name: name, display_name: it.display_name || "" };
  }

  HH.geocode = geocode;
  HH.fetchForecast = fetchForecast;
  HH.reverseGeocode = reverseGeocode;
})();
