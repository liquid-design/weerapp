/*
 * nearby.js — "Betere hemel in de buurt": vind een paar bereikbare plekken
 * die vannacht een betere sterrenhemel geven dan thuis.
 *
 * Twee-fasen aanpak (zuinig met API-calls):
 *   Fase 1 (0 API): rangschik echte dorpen op donkerte, afstand en grootte,
 *                   pak de beste ~8 die ver genoeg uit elkaar liggen.
 *   Fase 2 (weer):  haal Open-Meteo op voor die ~8 + thuis, bereken de
 *                   volledige nachtscore (incl. milde hoogtebonus), toon top 5.
 *
 * Optimaliseert op de BESTE sterrenkijkavond, niet puur de donkerste plek:
 * lichtvervuiling is de goedkope eerste filter, het weer beslist.
 * Rijtijd is een schatting (hemelsbreed × wegfactor), geen echte route.
 */
(function (global) {
  "use strict";
  const RAD = Math.PI / 180;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

  // intentie-standen: label, icoon, straal (km, hemelsbreed), en de winst
  // (t.o.v. thuis) die nodig is om een plek te tonen — hoe verder, hoe meer.
  const MODES = {
    kijken: { key: "kijken", label: "Even kijken", icon: "\uD83C\uDF19", km: 28, need: 8 },
    goed: { key: "goed", label: "Goede plek", icon: "\uD83D\uDD2D", km: 55, need: 12 },
    fotos: { key: "fotos", label: "Nacht voor foto's", icon: "\uD83D\uDCF7", km: 110, need: 18 },
    roadwarrior: { key: "roadwarrior", label: "Roadwarrior", icon: "\uD83D\uDE97", km: 165, need: 25 },
  };

  const DIRS = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  const compass = (b) => DIRS[Math.round(b / 45) % 8];

  function hav(la1, lo1, la2, lo2) {
    const dla = (la2 - la1) * RAD, dlo = (lo2 - lo1) * RAD;
    const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dlo / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }

  // ruwe rijtijd: wegfactor 1.3, ~70 km/u gemiddeld
  function driveEstimate(km) {
    const roadKm = km * 1.3;
    return { roadKm: Math.round(roadKm), mins: Math.round(roadKm / 70 * 60) };
  }
  function fmtDrive(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? (h + "u" + (m ? " " + m + "m" : "")) : (m + " min");
  }

  // ---- fase 1: goedkope lokale rangschikking (0 API) --------------------
  function rankPhase1(candidates, radiusKm, topN) {
    // veiligheidscap: assess is O(steden), dus niet duizenden kandidaten
    if (candidates.length > 220) {
      candidates.sort((a, b) => a.pop - b.pop); // kleinere plaatsen eerst (donkerder)
      candidates = candidates.slice(0, 220);
    }
    for (const c of candidates) {
      const a = LightPollution.assess(c.lat, c.lon);
      c.assess = a;
      // donkerte primair; lichte straf voor afstand en bevolking
      c.p1 = a.factor * 0.75 - (c.km / radiusKm) * 0.15 - Math.min(c.pop / 25000, 1) * 0.10;
    }
    candidates.sort((x, y) => y.p1 - x.p1);
    // spreid: geen cluster van buurdorpen — min. 8 km uit elkaar
    const picked = [];
    for (const c of candidates) {
      if (picked.length >= topN) break;
      if (picked.some((p) => hav(p.lat, p.lon, c.lat, c.lon) < 8)) continue;
      picked.push(c);
    }
    return picked;
  }

  // ---- nachtscore voor een plek uit een Open-Meteo respons --------------
  function darkFactor(sunAlt) {
    if (sunAlt >= 0) return 0;
    if (sunAlt <= -18) return 1;
    if (sunAlt > -6) return lerp(0, 0.35, (0 - sunAlt) / 6);
    if (sunAlt > -12) return lerp(0.35, 0.8, (-6 - sunAlt) / 6);
    return lerp(0.8, 1, (-12 - sunAlt) / 6);
  }

  function scoreNight(data, lat, lon, targetKey) {
    if (!data || !data.hourly) return null;
    const H = data.hourly, off = data.utc_offset_seconds || 0;
    const assess = global.LightPollution ? LightPollution.assess(lat, lon) : null;
    const lpF = assess ? assess.factor : 1;

    const hours = [];
    for (let i = 0; i < H.time.length; i++) {
      const instant = new Date(Date.parse(H.time[i] + ":00Z") - off * 1000);
      const sun = Astro.getSunPosition(instant, lat, lon);
      if (sun.altitude >= 0) continue;
      const date = H.time[i].slice(0, 10), hourNum = parseInt(H.time[i].slice(11, 13), 10);
      let key = date;
      if (hourNum < 12) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1); key = d.toISOString().slice(0, 10); }
      if (key !== targetKey) continue;
      const mp = Astro.getMoonPosition(instant, lat, lon), mi = Astro.getMoonIllumination(instant);
      const cloudTotal = H.cloud_cover ? H.cloud_cover[i] :
        Math.round(0.6 * H.cloud_cover_low[i] + 0.3 * H.cloud_cover_mid[i] + 0.1 * H.cloud_cover_high[i]);
      const s = Score.scoreHour({
        cloudLow: H.cloud_cover_low[i], cloudMid: H.cloud_cover_mid[i], cloudHigh: H.cloud_cover_high[i],
        cloudTotal, humidity: H.relative_humidity_2m[i],
        wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m[i],
        precipProb: H.precipitation_probability[i],
        temp: H.temperature_2m[i], dewpoint: H.dew_point_2m[i],
        visibility: H.visibility ? H.visibility[i] : null,
        sunAlt: sun.altitude, moonAlt: mp.altitude, moonIllum: mi.fraction,
      });
      const df = darkFactor(sun.altitude);
      hours.push({
        sunAlt: sun.altitude, weather: s.weather, moonFactor: s.moonFactor, cloudTotal,
        wind: H.wind_speed_10m[i], precipProb: H.precipitation_probability[i],
        humidity: H.relative_humidity_2m[i], visKm: H.visibility && H.visibility[i] != null ? H.visibility[i] / 1000 : null,
        spread: s.spread, parts: s.parts, haze: s.haze,
        wind250ms: H.wind_speed_250hPa && H.wind_speed_250hPa[i] != null ? H.wind_speed_250hPa[i] / 3.6 : null,
        score: Math.round(s.weather * s.moonFactor * df), hourLabel: H.time[i].slice(11, 16),
      });
    }
    if (!hours.length) return null;
    let dark = hours.filter((h) => h.sunAlt < -12);
    if (!dark.length) dark = hours.filter((h) => h.sunAlt < -6);
    if (!dark.length) dark = hours;

    const w250 = dark.map((h) => h.wind250ms).filter((x) => x != null);
    const seeingMs = w250.length ? w250.reduce((a, b) => a + b, 0) / w250.length : null;
    const seeingFactor = global.Seeing ? Seeing.factor(seeingMs) : 1;
    const agg = Score.aggregateNight(dark, 0, { lpFactor: lpF, lp: assess, seeingFactor, seeingMs });

    // milde hoogtebonus uit Open-Meteo elevation (1000 m ~ +10%, cap +20%)
    let elevBonus = 1;
    const elev = data.elevation;
    if (typeof elev === "number") elevBonus = 1 + Math.min(Math.max(elev, 0) / 10000, 0.2);
    const score = Math.round(Math.min(agg.tonightScore * elevBonus, 100));

    return {
      score, base: agg.tonightScore,
      bortle: assess ? assess.bortle : null, label: assess ? assess.label : "",
      elev: typeof elev === "number" ? Math.round(elev) : null,
      milkyWay: agg.milkyWay, dims: agg.dims,
    };
  }

  // ---- schematisch radar-kaartje (SVG, geen tegels/library) -------------
  function radarSVG(spots, radiusKm) {
    const S = 260, c = S / 2, R = c - 26;
    const rk = (spot) => 20 + (spot.km / radiusKm) * (R - 20);
    const col = { g: "var(--g)", y: "var(--y)", o: "var(--o)", r: "var(--r)" };
    let s = '<svg viewBox="0 0 ' + S + ' ' + S + '" class="radar" xmlns="http://www.w3.org/2000/svg">';
    // ringen
    [0.5, 1].forEach((f) => {
      s += '<circle cx="' + c + '" cy="' + c + '" r="' + (20 + f * (R - 20)) +
        '" fill="none" stroke="var(--line)" stroke-width="1"/>';
    });
    // kompas
    [["N", c, 12], ["O", S - 8, c + 4], ["Z", c, S - 4], ["W", 8, c + 4]].forEach((d) => {
      s += '<text x="' + d[1] + '" y="' + d[2] + '" class="radar-dir">' + d[0] + '</text>';
    });
    // spots
    spots.forEach((sp, i) => {
      const ang = (sp.bearing - 90) * RAD; // N boven
      const rr = rk(sp);
      const x = c + rr * Math.cos(ang), y = c + rr * Math.sin(ang);
      const size = 5 + Math.min(sp.gain, 40) / 40 * 7;
      const key = sp.score >= 70 ? "g" : sp.score >= 50 ? "y" : sp.score >= 30 ? "o" : "r";
      s += '<line x1="' + c + '" y1="' + c + '" x2="' + x + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/>';
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + size.toFixed(1) + '" fill="' + col[key] + '" opacity="0.9"/>';
      s += '<text x="' + x + '" y="' + (y - size - 3).toFixed(1) + '" class="radar-lab">' + (i + 1) + '</text>';
    });
    // thuis in het midden
    s += '<circle cx="' + c + '" cy="' + c + '" r="4" fill="var(--ink)"/>';
    s += '<text x="' + c + '" y="' + (c + 16) + '" class="radar-home">thuis</text>';
    s += '</svg>';
    return s;
  }

  global.Nearby = { MODES, compass, driveEstimate, fmtDrive, rankPhase1, scoreNight, radarSVG };
})(window);
