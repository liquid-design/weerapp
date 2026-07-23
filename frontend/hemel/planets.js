/*
 * planets.js — geocentrische planeetposities (Mercurius t/m Neptunus).
 *
 * Kepleriaanse baanelementen met driftsnelheden (methode van Paul
 * Schlyter, "How to compute planetary positions"). Nauwkeurigheid ~1
 * boogminuut tot een fractie van een graad — ruim genoeg om hoogte,
 * kompasrichting en zichtbaarheidsvenster te bepalen. Alles onder
 * `Planets`. Vereist dat astro.js al geladen is (voor findCrossings).
 */
(function (global) {
  "use strict";

  const RAD = Math.PI / 180;
  const rev = (x) => ((x % 360) + 360) % 360;

  // Schlyter's dagteller: dagen sinds 2000 jan 0.0 (JD 2451543.5).
  function dayNumber(date) {
    return date.valueOf() / 86400000 - 10957.5;
  }

  // Baanelementen als functie van d.
  const ELEMENTS = {
    Mercurius: (d) => ({ N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d, sym: "\u263F" }),
    Venus: (d) => ({ N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d, sym: "\u2640" }),
    Mars: (d) => ({ N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d, sym: "\u2642" }),
    Jupiter: (d) => ({ N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d, sym: "\u2643" }),
    Saturnus: (d) => ({ N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d, sym: "\u2644" }),
    Uranus: (d) => ({ N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d, sym: "\u2645" }),
    Neptunus: (d) => ({ N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d, sym: "\u2646" }),
  };

  // Zonspositie (nodig voor geocentrische omzetting).
  function sunRect(d) {
    const w = 282.9404 + 4.70935e-5 * d;
    const e = 0.016709 - 1.151e-9 * d;
    const M = rev(356.047 + 0.9856002585 * d);
    const Er = M + (e / RAD) * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
    const xv = Math.cos(Er * RAD) - e;
    const yv = Math.sqrt(1 - e * e) * Math.sin(Er * RAD);
    const v = Math.atan2(yv, xv) / RAD;
    const r = Math.sqrt(xv * xv + yv * yv);
    const lon = rev(v + w);
    return { x: r * Math.cos(lon * RAD), y: r * Math.sin(lon * RAD), lon };
  }

  // Geocentrische RA/Dec (graden/graden) van een planeet.
  function raDec(name, date) {
    const d = dayNumber(date);
    const o = ELEMENTS[name](d);
    const N = rev(o.N), i = o.i, w = rev(o.w), a = o.a, e = o.e, M = rev(o.M);

    // eccentrische anomalie (iteratief)
    let E = M + (e / RAD) * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
    for (let k = 0; k < 8; k++) {
      E = E - (E - (e / RAD) * Math.sin(E * RAD) - M) /
        (1 - e * Math.cos(E * RAD));
    }
    const xv = a * (Math.cos(E * RAD) - e);
    const yv = a * Math.sqrt(1 - e * e) * Math.sin(E * RAD);
    const v = Math.atan2(yv, xv) / RAD;
    const r = Math.sqrt(xv * xv + yv * yv);

    const vw = (v + w) * RAD;
    const Nr = N * RAD, ir = i * RAD;
    const xh = r * (Math.cos(Nr) * Math.cos(vw) - Math.sin(Nr) * Math.sin(vw) * Math.cos(ir));
    const yh = r * (Math.sin(Nr) * Math.cos(vw) + Math.cos(Nr) * Math.sin(vw) * Math.cos(ir));
    const zh = r * (Math.sin(vw) * Math.sin(ir));

    const s = sunRect(d);
    const xg = xh + s.x, yg = yh + s.y, zg = zh;

    const ecl = (23.4393 - 3.563e-7 * d) * RAD;
    const xe = xg;
    const ye = yg * Math.cos(ecl) - zg * Math.sin(ecl);
    const ze = yg * Math.sin(ecl) + zg * Math.cos(ecl);

    return {
      ra: Math.atan2(ye, xe) / RAD,
      dec: Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / RAD,
      sym: o.sym,
    };
  }

  // Lokale sterrentijd (graden) — consistent met astro.js.
  function lstDeg(date, lng) {
    const d = date.valueOf() / 86400000 - 10957.5;
    // GMST0 in graden volgens Schlyter: L = M_sun + w_sun
    const Ms = rev(356.047 + 0.9856002585 * d);
    const ws = 282.9404 + 4.70935e-5 * d;
    const gmst0 = rev(Ms + ws + 180);
    const ut = (date.valueOf() / 3600000) % 24; // uren UT
    return rev(gmst0 + ut * 15.04107 + lng);
  }

  // Hoogte + azimut (graden) van een planeet.
  function altAz(name, date, lat, lng) {
    const p = raDec(name, date);
    const ha = rev(lstDeg(date, lng) - p.ra) * RAD;
    const phi = lat * RAD, dec = p.dec * RAD;
    let alt = Math.asin(Math.sin(phi) * Math.sin(dec) +
      Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
    // refractie dicht bij horizon
    alt = alt + (RAD * 0.017) / Math.tan(alt + (RAD * 10.26) / (alt / RAD + 5.11));
    const az = Math.atan2(Math.sin(ha),
      Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { altitude: alt / RAD, azimuth: rev(az / RAD + 180), sym: p.sym };
  }

  const DIRS = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  function compass(az) {
    return DIRS[Math.round(az / 45) % 8];
  }

  const NAMES = ["Mercurius", "Venus", "Mars", "Jupiter", "Saturnus", "Uranus", "Neptunus"];

  /**
   * Welke planeten zijn tijdens de donkere uren zichtbaar (boven de
   * horizon)? Retourneert per planeet piek-hoogte, richting en het
   * zichtbaarheidsvenster binnen [darkStartMs, darkEndMs].
   */
  function visibleDuring(darkStartMs, darkEndMs, lat, lng) {
    const out = [];
    for (const name of NAMES) {
      const altFn = (date) => altAz(name, date, lat, lng).altitude;
      // bemonster binnen het duister-venster: piek + boven-horizon-span
      let peakAlt = -90, peakMs = darkStartMs, above = [];
      for (let t = darkStartMs; t <= darkEndMs; t += 10 * 60000) {
        const a = altFn(new Date(t));
        if (a > 0) above.push(t);
        if (a > peakAlt) { peakAlt = a; peakMs = t; }
      }
      if (peakAlt < 5) continue; // te laag om zinvol te zien
      // hoogte + richting op het beste moment (piek binnen het duister)
      const info = altAz(name, new Date(peakMs), lat, lng);
      out.push({
        name,
        sym: info.sym,
        peakAlt: Math.round(peakAlt),
        dir: compass(info.azimuth),
        startMs: above.length ? above[0] : null,
        endMs: above.length ? above[above.length - 1] : null,
      });
    }
    // helderste/hoogste eerst-ish: Venus, Jupiter, Mars, Saturnus, dan rest
    const order = { Venus: 0, Jupiter: 1, Mars: 2, Saturnus: 3, Mercurius: 4, Uranus: 5, Neptunus: 6 };
    out.sort((a, b) => (order[a.name] - order[b.name]));
    return out;
  }

  global.Planets = { altAz, visibleDuring, compass, NAMES };
})(window);
