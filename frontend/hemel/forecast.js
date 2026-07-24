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
  // Backend-eerst met terugval (ADR-033). In de geïntegreerde app loopt geocoding via
  // /api/geocode: die stuurt NOMINATIM_EMAIL mee (Nominatim-gebruiksbeleid) en cachet
  // server-side. Faalt de backend, of draait HH standalone (index.html direct geopend,
  // geen backend), dan valt hij terug op de directe Nominatim-aanroep — zo blijft Heldere
  // Hemel losstaand werkend, een eigenschap die ADR-033 expliciet bewaakt.
  async function geocode(q, signal) {
    try {
      return await geocodeBackend(q, signal);
    } catch (e) {
      if (e.name === "AbortError") throw e;   // afgebroken zoekopdracht: niet terugvallen
      return await geocodeNominatim(q, signal);
    }
  }

  // Weerwijsheid-backend: /api/geocode -> [{name, display_name, lat, lon, type, country}].
  // Genormaliseerd naar HH's suggestievorm. De backend zet " · <land>" achter de naam
  // (_friendly_name); dat strippen we zodat de HH-UI ongewijzigd dezelfde plaatsnaam toont.
  async function geocodeBackend(q, signal) {
    const r = await fetch("/api/geocode?q=" + encodeURIComponent(q),
      { signal, headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("backend geocode gaf " + r.status);
    const data = await r.json();
    return data.map((it) => ({
      name: (it.name || "").replace(/ · [A-Z]{2}$/, ""),
      display_name: it.display_name || "",
      lat: parseFloat(it.lat),
      lon: parseFloat(it.lon),
      type: it.type || "",
      category: "",
      country: (it.country || "").toUpperCase(),
    }));
  }

  // Directe Nominatim-aanroep (keyless, CORS-vriendelijk) — de standalone/terugval-weg.
  async function geocodeNominatim(q, signal) {
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
