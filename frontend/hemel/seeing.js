/*
 * seeing.js — astronomische "seeing" uit de straalstroom (250 hPa wind).
 *
 * Hoge windsnelheid in de bovenlucht = turbulentie = onrustig, wazig beeld
 * (vooral hinderlijk voor planeten, maan en fotografie; minder voor
 * sterrenbeelden/Melkweg). Daarom bewust MILD: de factor zakt hooguit tot
 * ~0.72, zodat een onrustige nacht de score dempt maar niet sloopt.
 *
 * Bron: Open-Meteo hourly=wind_speed_250hPa (m/s). Drempels (meteoblue /
 * observatie-vuistregel): <15 m/s goed, 15-25 redelijk, 25-35 matig,
 * >35 m/s (~126 km/h) slecht.
 */
(function (global) {
  "use strict";
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // wind in m/s → factor 0.72..1.0
  function factor(ms) {
    if (ms == null || isNaN(ms)) return 1.0;
    if (ms <= 15) return 1.0;
    if (ms >= 40) return 0.72;
    // lineair van 1.0 (15) naar 0.72 (40)
    return clamp(1.0 - (ms - 15) / 25 * 0.28, 0.72, 1.0);
  }

  function label(ms) {
    if (ms == null) return "onbekend";
    if (ms <= 15) return "rustig";
    if (ms <= 25) return "redelijk";
    if (ms <= 35) return "onrustig";
    return "turbulent";
  }

  global.Seeing = { factor, label };
})(window);
