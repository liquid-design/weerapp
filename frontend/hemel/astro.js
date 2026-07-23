/*
 * astro.js — lokale zon- en maanberekeningen + op/ondergang-tijden.
 *
 * Geen externe library, geen build-stap. Standaard low-precision
 * formules (Meeus / Astronomy Answers), dezelfde wiskunde die
 * bibliotheken als SunCalc gebruiken. Alles hangt onder `Astro`.
 */
(function (global) {
  "use strict";

  const RAD = Math.PI / 180;
  const DAY_MS = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const OBLIQUITY = 23.4397 * RAD;

  function toDays(date) {
    return date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
  }

  function rightAscension(l, b) {
    return Math.atan2(
      Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY),
      Math.cos(l)
    );
  }
  function declination(l, b) {
    return Math.asin(
      Math.sin(b) * Math.cos(OBLIQUITY) +
        Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l)
    );
  }
  function azimuth(H, phi, dec) {
    return Math.atan2(
      Math.sin(H),
      Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)
    );
  }
  function altitude(H, phi, dec) {
    return Math.asin(
      Math.sin(phi) * Math.sin(dec) +
        Math.cos(phi) * Math.cos(dec) * Math.cos(H)
    );
  }
  function siderealTime(d, lw) {
    return RAD * (280.16 + 360.9856235 * d) - lw;
  }

  // --- zon ----------------------------------------------------------------
  function solarMeanAnomaly(d) {
    return RAD * (357.5291 + 0.98560028 * d);
  }
  function eclipticLongitude(M) {
    const C =
      RAD *
      (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + RAD * 102.9372 + Math.PI;
  }
  function sunCoords(d) {
    const M = solarMeanAnomaly(d);
    const L = eclipticLongitude(M);
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }

  // --- maan ---------------------------------------------------------------
  function moonCoords(d) {
    const L = RAD * (218.316 + 13.176396 * d);
    const M = RAD * (134.963 + 13.064993 * d);
    const F = RAD * (93.272 + 13.22935 * d);
    const l = L + RAD * 6.289 * Math.sin(M);
    const b = RAD * 5.128 * Math.sin(F);
    const dt = 385001 - 20905 * Math.cos(M);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
  }

  // --- publieke posities --------------------------------------------------
  function getSunPosition(date, lat, lng) {
    const lw = RAD * -lng, phi = RAD * lat, d = toDays(date);
    const c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    return {
      altitude: altitude(H, phi, c.dec) / RAD,
      azimuth: (azimuth(H, phi, c.dec) / RAD + 180) % 360,
    };
  }

  function getMoonPosition(date, lat, lng) {
    const lw = RAD * -lng, phi = RAD * lat, d = toDays(date);
    const c = moonCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    let h = altitude(H, phi, c.dec);
    h = h + (RAD * 0.017) / Math.tan(h + (RAD * 10.26) / (h / RAD + 5.11));
    return {
      altitude: h / RAD,
      azimuth: (azimuth(H, phi, c.dec) / RAD + 180) % 360,
      distance: c.dist,
    };
  }

  function getMoonIllumination(date) {
    const d = toDays(date);
    const s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(
      Math.sin(s.dec) * Math.sin(m.dec) +
        Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
    );
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(
      Math.cos(s.dec) * Math.sin(s.ra - m.ra),
      Math.sin(s.dec) * Math.cos(m.dec) -
        Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
    );
    return {
      fraction: (1 + Math.cos(inc)) / 2,
      phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
    };
  }

  // Naam uit verlichting + wassend/afnemend (phase<0.5 = wassend).
  function moonPhaseName(phase, fraction) {
    const f = fraction == null ? 0.5 : fraction;
    const waxing = phase < 0.5;
    if (f < 0.02) return "Nieuwe maan";
    if (f > 0.98) return "Volle maan";
    if (f >= 0.46 && f <= 0.54) return waxing ? "Eerste kwartier" : "Laatste kwartier";
    if (waxing) return f < 0.5 ? "Wassende sikkel" : "Wassende maan";
    return f < 0.5 ? "Afnemende sikkel" : "Afnemende maan";
  }
  function moonPhaseGlyph(phase) {
    const g = ["\uD83C\uDF11", "\uD83C\uDF12", "\uD83C\uDF13", "\uD83C\uDF14",
      "\uD83C\uDF15", "\uD83C\uDF16", "\uD83C\uDF17", "\uD83C\uDF18"];
    return g[Math.round(phase * 8) % 8];
  }

  // --- op/ondergang: generieke drempel-kruising ---------------------------
  // Zoekt momenten waarop de hoogte `targetDeg` passeert tussen twee
  // tijdstippen. Bemonstert elke `stepMin` min en interpoleert lineair.
  // Retourneert [{ms, rising}].
  function findCrossings(altFn, startMs, endMs, targetDeg, stepMin) {
    const step = (stepMin || 5) * 60000;
    const out = [];
    let prevT = startMs;
    let prevA = altFn(new Date(prevT));
    for (let t = startMs + step; t <= endMs; t += step) {
      const a = altFn(new Date(t));
      if ((prevA - targetDeg) * (a - targetDeg) < 0) {
        const frac = (targetDeg - prevA) / (a - prevA);
        out.push({ ms: prevT + frac * (t - prevT), rising: a > prevA });
      }
      prevT = t;
      prevA = a;
    }
    return out;
  }

  function sunAltAt(lat, lng) {
    return (date) => getSunPosition(date, lat, lng).altitude;
  }
  function moonAltAt(lat, lng) {
    return (date) => getMoonPosition(date, lat, lng).altitude;
  }

  global.Astro = {
    getSunPosition, getMoonPosition, getMoonIllumination,
    moonPhaseName, moonPhaseGlyph,
    findCrossings, sunAltAt, moonAltAt,
  };
})(window);
