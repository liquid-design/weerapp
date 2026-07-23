/*
 * score.js — sterrenkijk-score, multiplicatief model.
 *
 *   Heldere-Hemel = Atmosfeer × Maan × Locatie × Seeing
 *
 * Atmosfeer (0..100) telt vier weerfactoren op — precies zoals de
 * referentie: Bewolking 55 / Wind 20 / Dauw 15 / Regen 10. De maan, de
 * lichtvervuiling (locatie) en de seeing (straalstroom) zijn APARTE
 * dimensies die als factor (0..1) meeschalen. Zo betekent 100% "de
 * atmosfeer is maximaal", niet "overal even mooi": een heldere nacht in
 * de stad zakt via de locatiefactor, precies wat je met het oog ervaart.
 */
(function (global) {
  "use strict";

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const stdev = (arr) => {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(mean(arr.map((x) => (x - m) * (x - m))));
  };

  const MAX = { cloud: 55, wind: 20, dew: 15, rain: 10 };

  function skyClearFactor(low, mid, high) {
    const tLow = 1 - (low / 100) * 1.0;
    const tMid = 1 - (mid / 100) * 0.85;
    const tHigh = 1 - (high / 100) * 0.55;
    return clamp(tLow * tMid * tHigh, 0, 1);
  }
  function windSeeing(windKmh, gustKmh) {
    const w = Math.max(windKmh || 0, (gustKmh || 0) * 0.6);
    if (w <= 12) return 1;
    if (w >= 45) return 0.55;
    return lerp(1, 0.55, (w - 12) / 33);
  }

  // Atmosferische uurscore (0..100) + aparte maanfactor (0..1).
  function scoreHour(h) {
    const clearFrac = skyClearFactor(h.cloudLow, h.cloudMid, h.cloudHigh);
    let haze = 0;
    if (typeof h.visibility === "number" && h.visibility > 0) {
      const visKm = h.visibility / 1000;
      if (visKm < 30) haze = -Math.round(lerp(0, 6, (30 - visKm) / 28));
    }
    const cloud = clamp(MAX.cloud * clearFrac + haze, 0, MAX.cloud);
    const wind = MAX.wind * windSeeing(h.wind, h.gust);
    const spread = h.temp != null && h.dewpoint != null ? h.temp - h.dewpoint : 5;
    const dew = MAX.dew * clamp(spread / 5, 0, 1);
    const rain = MAX.rain * (1 - clamp((h.precipProb || 0) / 100, 0, 1));
    const weather = clamp(Math.round(cloud + wind + dew + rain), 0, 100);

    // maan als factor: verlichting × hoogte, tot ~45% demping
    let moonFactor = 1, moonPenalty = 0;
    if (h.moonAlt > 0) {
      const altW = clamp(h.moonAlt / 40, 0, 1);
      moonPenalty = Math.round(45 * (h.moonIllum || 0) * altW);
      moonFactor = 1 - moonPenalty / 100;
    }
    return {
      weather,
      parts: { cloud: Math.round(cloud), wind: Math.round(wind), dew: Math.round(dew), rain: Math.round(rain) },
      haze, moonFactor, moonPenalty, moonDown: h.moonAlt <= 0, spread,
    };
  }

  const qualityWord = (s) => s >= 85 ? "uitstekend" : s >= 70 ? "goed" : s >= 50 ? "redelijk" : "matig";

  // Beste moment = het LANGSTE aaneengesloten blok dat de drempel haalt
  // (eerst 85, anders 70, anders 55). Bij gelijke lengte wint het hoogste
  // gemiddelde. Zo krijg je een venster i.p.v. één toevallig topuur.
  function longestBlock(hours, thr) {
    let best = null, i = 0;
    while (i < hours.length) {
      if (hours[i].score >= thr) {
        let j = i;
        while (j + 1 < hours.length && hours[j + 1].score >= thr) j++;
        const span = hours.slice(i, j + 1);
        const avg = mean(span.map((x) => x.score));
        if (!best || span.length > best.len || (span.length === best.len && avg > best.avg)) {
          best = {
            hours: span, len: span.length, avg,
            startLabel: span[0].hourLabel,
            endLabel: nextHourLabel(span[span.length - 1].hourLabel),
            quality: qualityWord(avg),
          };
        }
        i = j + 1;
      } else i++;
    }
    return best;
  }
  function bestWindow(hours) {
    if (!hours.length) return null;
    for (const thr of [85, 70, 55]) {
      const b = longestBlock(hours, thr);
      if (b) return b;
    }
    // niets haalt 55: pak het beste enkele uur
    let bi = 0;
    hours.forEach((h, i) => { if (h.score > hours[bi].score) bi = i; });
    const h = hours[bi];
    return {
      hours: [h], len: 1, avg: h.score, quality: qualityWord(h.score),
      startLabel: h.hourLabel, endLabel: nextHourLabel(h.hourLabel),
    };
  }
  function nextHourLabel(hhmm) {
    const h = (parseInt(hhmm.slice(0, 2), 10) + 1) % 24;
    return String(h).padStart(2, "0") + ":00";
  }
  function longestRun(hours, threshold) {
    let best = 0, cur = 0;
    for (const h of hours) { if (h.score >= threshold) { cur++; best = Math.max(best, cur); } else cur = 0; }
    return best;
  }

  function confidence(hours, nightIndex) {
    const clouds = hours.map((h) => h.cloudTotal);
    const mc = mean(clouds), cv = stdev(clouds);
    let label;
    if (mc < 15 && cv < 12) label = "Hoog";
    else if (cv > 28 || (mc >= 30 && mc <= 70)) label = "Laag";
    else label = "Middel";
    if (nightIndex >= 4 && label === "Hoog") label = "Middel";
    if (nightIndex >= 4 && label === "Middel") label = "Laag";
    return label;
  }

  function verdict(score) {
    if (score >= 85) return { head: "Naar buiten", key: "g" };
    if (score >= 70) return { head: "De moeite waard", key: "g" };
    if (score >= 50) return { head: "Wisselend", key: "y" };
    if (score >= 30) return { head: "Matige nacht", key: "o" };
    return { head: "Beter een andere nacht", key: "r" };
  }
  function ratingLabel(score) {
    if (score >= 85) return "Uitstekend";
    if (score >= 70) return "Goed";
    if (score >= 50) return "Redelijk";
    if (score >= 30) return "Matig";
    return "Slecht";
  }
  function ratingKey(score) {
    if (score >= 70) return "g";
    if (score >= 50) return "y";
    if (score >= 30) return "o";
    return "r";
  }

  /**
   * hours = donkere uren, elk met .weather, .moonFactor, .score (= baluur:
   * weather×moonFactor×darkFactor), .parts, .cloudTotal, ...
   * site = { lpFactor, lp, seeingFactor, seeingMs }
   */
  function aggregateNight(hours, nightIndex, site) {
    if (!hours.length) return null;
    const avgWeather = mean(hours.map((h) => h.weather));
    const moonFac = mean(hours.map((h) => h.moonFactor));
    const lp = site && site.lpFactor != null ? site.lpFactor : 1;
    const seeing = site && site.seeingFactor != null ? site.seeingFactor : 1;

    const final = clamp(Math.round(avgWeather * moonFac * lp * seeing), 0, 100);

    const bw = bestWindow(hours);
    const usable = hours.filter((h) => h.score >= 45).length;
    const run = longestRun(hours, 45);

    const aggParts = {
      cloud: Math.round(mean(hours.map((h) => h.parts.cloud))),
      wind: Math.round(mean(hours.map((h) => h.parts.wind))),
      dew: Math.round(mean(hours.map((h) => h.parts.dew))),
      rain: Math.round(mean(hours.map((h) => h.parts.rain))),
    };
    const meanCloud = Math.round(mean(hours.map((h) => h.cloudTotal)));
    const meanWindMs = mean(hours.map((h) => h.wind)) / 3.6;
    const meanSpread = mean(hours.map((h) => h.spread));
    const meanRain = Math.round(mean(hours.map((h) => h.precipProb || 0)));
    const meanRH = Math.round(mean(hours.map((h) => h.humidity != null ? h.humidity : 80)));
    const visVals = hours.map((h) => h.visKm).filter((x) => x != null);
    const meanVisKm = visVals.length ? mean(visVals) : null;
    const worstHaze = Math.min(0, ...hours.map((h) => h.haze));
    const worstVisKm = visVals.length ? Math.min(...visVals) : null;

    // transparantie (alleen uitleg, geen weging): zicht + dauwmarge + RV
    let transparency = "matig";
    const vk = meanVisKm == null ? 40 : meanVisKm;
    if (vk > 20 && meanSpread > 5 && meanRH < 85) transparency = "goed";
    else if (vk > 10 && meanSpread > 2 && meanRH < 92) transparency = "matig";
    else transparency = "slecht";

    // nachttrend: eerste helft vs. tweede helft van de uurscores
    let trend = null;
    if (hours.length >= 3) {
      const h1 = mean(hours.slice(0, Math.floor(hours.length / 2)).map((h) => h.score));
      const h2 = mean(hours.slice(Math.ceil(hours.length / 2)).map((h) => h.score));
      trend = h2 - h1 > 8 ? "verbetert" : h2 - h1 < -8 ? "verslechtert" : "stabiel";
    }

    // "kan ik de Melkweg zien?" — donkere hemel + weinig maan + weinig wolken
    const milkyWay = lp > 0.75 && moonFac > 0.8 && meanCloud < 25;

    // dauwwaarschuwing: kleine marge + hoge vochtigheid
    const dewWarn = meanSpread < 2 && meanRH > 90;

    return {
      tonightScore: final,
      dims: {
        atmos: Math.round(avgWeather),
        moon: Math.round(moonFac * 100),
        loc: Math.round(lp * 100),
        seeing: Math.round(seeing * 100),
      },
      avgWeather: Math.round(avgWeather),
      moonFactor: moonFac,
      usableHours: usable, darkHours: hours.length, run,
      bestWindow: bw,
      confidence: confidence(hours, nightIndex),
      verdict: verdict(final), ratingLabel: ratingLabel(final),
      aggParts, meanCloud, meanWindMs, meanSpread, meanRain, meanRH,
      worstHaze, worstVisKm, meanVisKm,
      transparency, trend, milkyWay, dewWarn,
    };
  }

  function describe(agg, moon, site) {
    const parts = [];
    if (agg.meanCloud < 18) parts.push("Vrijwel heldere lucht");
    else if (agg.meanCloud < 45) parts.push("deels bewolkt met heldere gaten");
    else if (agg.meanCloud < 75) parts.push("wisselend bewolkt");
    else parts.push("overwegend bewolkt");
    if (moon && moon.down) parts.push("maan onder de horizon");
    else if (moon && moon.illum > 0.5) parts.push("heldere maan stoort een deel van de nacht");
    if (agg.meanSpread < 2.5) parts.push("hoog dauwrisico");
    if (site && site.bortle >= 7) parts.push("maar sterke lichtvervuiling — de hemel blijft grijs");
    else if (site && site.bortle <= 3) parts.push("donkere hemel, Melkweg zichtbaar");
    return parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
  }

  global.Score = { scoreHour, aggregateNight, describe, ratingKey, ratingLabel, MAX };
})(window);
