/*
 * app.js — state + orkestratie: nacht-opbouw uit weerdata + astronomie,
 * laden, zoeken, en de opstart. Leunt op window.HH (basis + render uit
 * ui.js, netwerk uit forecast.js) en de globale modules Astro / Score /
 * Planets / LightPollution / Seeing.
 */
(function () {
  "use strict";
  const HH = window.HH;
  const { state, $, el, pad, render, setStatus, geocode, fetchForecast } = HH;

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

  // darkness-gate voor de weergegeven uurscore (0 bij zon=0°, 1 vanaf -18°)
  function darkFactor(sunAlt) {
    if (sunAlt >= 0) return 0;
    if (sunAlt <= -18) return 1;
    if (sunAlt > -6) return lerp(0, 0.35, (0 - sunAlt) / 6);
    if (sunAlt > -12) return lerp(0.35, 0.8, (-6 - sunAlt) / 6);
    return lerp(0.8, 1, (-12 - sunAlt) / 6);
  }

  function realInstant(localIso, offSec) {
    return new Date(Date.parse(localIso + ":00Z") - offSec * 1000);
  }

  // ---- locatie ----------------------------------------------------------
  function useBrowserLocation() {
    if (!navigator.geolocation) { setStatus("Deze browser deelt geen locatie. Zoek op plaatsnaam."); return; }
    setStatus("Locatie ophalen\u2026");
    navigator.geolocation.getCurrentPosition(
      (p) => { state.name = "Mijn locatie"; state.lat = p.coords.latitude; state.lon = p.coords.longitude; loadAndRender(); },
      () => setStatus("Kon locatie niet ophalen. Zoek op plaatsnaam."),
      { timeout: 10000 }
    );
  }

  // ---- op/ondergang per nacht ------------------------------------------
  function nightTimes(dateKey, lat, lon) {
    const start = realInstant(dateKey + "T12:00", state.off).getTime();
    const end = start + 24 * 3600000;
    const sunAlt = Astro.sunAltAt(lat, lon), moonAlt = Astro.moonAltAt(lat, lon);
    const s0 = Astro.findCrossings(sunAlt, start, end, 0, 4);
    const sunset = (s0.find((c) => !c.rising) || {}).ms || null;
    const sunrise = (s0.find((c) => c.rising && (!sunset || c.ms > sunset)) || {}).ms || null;

    let d18 = Astro.findCrossings(sunAlt, start, end, -18, 4);
    let darkStart = (d18.find((c) => !c.rising) || {}).ms || null;
    let darkEnd = (d18.find((c) => c.rising && (!darkStart || c.ms > darkStart)) || {}).ms || null;
    let darkKind = "astronomisch";
    if (darkStart == null || darkEnd == null) {
      const d12 = Astro.findCrossings(sunAlt, start, end, -12, 4);
      darkStart = (d12.find((c) => !c.rising) || {}).ms || sunset;
      darkEnd = (d12.find((c) => c.rising && (!darkStart || c.ms > darkStart)) || {}).ms || sunrise;
      darkKind = "nautisch";
    }

    const winA = sunset || start, winB = sunrise || end;
    const mc = Astro.findCrossings(moonAlt, winA - 2 * 3600000, winB + 2 * 3600000, 0, 6);
    const moonrise = (mc.find((c) => c.rising) || {}).ms || null;
    const moonset = (mc.find((c) => !c.rising) || {}).ms || null;

    return { sunset, sunrise, darkStart, darkEnd, darkKind };
  }

  // ---- nachten bouwen ---------------------------------------------------
  function buildNights(data) {
    const H = data.hourly;
    state.off = data.utc_offset_seconds || 0;
    state.lastData = data; // bewaard voor de thuis-vergelijking in "nabij"
    const now = Date.now();

    // lichtvervuiling: één keer per locatie (constant door de nacht)
    state.site = window.LightPollution
      ? LightPollution.assess(state.lat, state.lon) : null;

    // per uur verrijken
    const hours = [];
    for (let i = 0; i < H.time.length; i++) {
      const instant = realInstant(H.time[i], state.off);
      const sun = Astro.getSunPosition(instant, state.lat, state.lon);
      if (sun.altitude >= 0) continue; // alleen nacht
      const mp = Astro.getMoonPosition(instant, state.lat, state.lon);
      const mi = Astro.getMoonIllumination(instant);
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
      // baluur = atmosfeer × maanfactor × donkerte (tijdvariabel deel)
      const bar = Math.round(s.weather * s.moonFactor * df);
      const wind250ms = H.wind_speed_250hPa && H.wind_speed_250hPa[i] != null
        ? H.wind_speed_250hPa[i] / 3.6 : null;
      hours.push({
        iso: H.time[i], instant, ms: instant.getTime(),
        hourLabel: H.time[i].slice(11, 16), date: H.time[i].slice(0, 10),
        hourNum: parseInt(H.time[i].slice(11, 13), 10),
        sunAlt: sun.altitude, cloudTotal,
        wind: H.wind_speed_10m[i], precipProb: H.precipitation_probability[i],
        humidity: H.relative_humidity_2m[i],
        visKm: H.visibility && H.visibility[i] != null ? H.visibility[i] / 1000 : null,
        wind250ms,
        weather: s.weather, moonFactor: s.moonFactor,
        score: bar, display: bar, darkF: df,
        parts: s.parts, haze: s.haze, moonPenalty: s.moonPenalty, spread: s.spread,
      });
    }

    // groepeer per nacht (uren < 12u horen bij vorige avond)
    const groups = new Map();
    for (const h of hours) {
      let key = h.date;
      if (h.hourNum < 12) {
        const d = new Date(h.date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
        key = d.toISOString().slice(0, 10);
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(h);
    }

    const nights = [];
    let idx = 0;
    for (const [key, arr] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      arr.sort((a, b) => a.ms - b.ms);
      if (arr[arr.length - 1].ms < now - 3600000) continue; // voorbij

      // donkere uren (beste beschikbare tier) voor scoring
      let dark = arr.filter((h) => h.sunAlt < -12);
      if (!dark.length) dark = arr.filter((h) => h.sunAlt < -6);
      if (!dark.length) dark = arr.slice();

      // seeing uit de straalstroom (gemiddelde 250 hPa-wind over donkere uren)
      const w250 = dark.map((h) => h.wind250ms).filter((x) => x != null);
      const seeingMs = w250.length ? w250.reduce((a, b) => a + b, 0) / w250.length : null;
      const seeingFactor = window.Seeing ? Seeing.factor(seeingMs) : 1;
      const site = {
        lpFactor: state.site ? state.site.factor : 1,
        lp: state.site,
        seeingFactor, seeingMs,
      };

      const agg = Score.aggregateNight(dark, idx, site);
      agg.seeingMs = seeingMs;
      const t = nightTimes(key, state.lat, state.lon);
      const midMs = t.darkStart && t.darkEnd ? (t.darkStart + t.darkEnd) / 2 : arr[Math.floor(arr.length / 2)].ms;
      const ill = Astro.getMoonIllumination(new Date(midMs));
      const mpos = Astro.getMoonPosition(new Date(midMs), state.lat, state.lon);
      // planeten over de hele nacht (zononder->zonop), niet enkel het
      // astronomische donker -- zo verschijnt bv. Venus vlak na zononder.
      const planets = window.Planets
        ? Planets.visibleDuring(t.sunset || arr[0].ms,
            t.sunrise || arr[arr.length - 1].ms, state.lat, state.lon)
        : [];

      // maan-op/ondergang binnen de nacht
      const moonAltFn = Astro.moonAltAt(state.lat, state.lon);
      const mcross = Astro.findCrossings(moonAltFn, arr[0].ms - 3 * 3600000,
        arr[arr.length - 1].ms + 3 * 3600000, 0, 6);

      nights.push({
        key, idx, times: t,
        chartHours: arr, darkHours: dark, agg,
        moon: {
          illum: ill.fraction, phase: ill.phase, alt: mpos.altitude,
          name: Astro.moonPhaseName(ill.phase, ill.fraction),
          glyph: Astro.moonPhaseGlyph(ill.phase),
          rise: (mcross.find((c) => c.rising) || {}).ms || null,
          set: (mcross.find((c) => !c.rising) || {}).ms || null,
          influence: Math.round((1 - agg.moonFactor) * 100),
        },
        planets,
      });
      idx++;
    }
    return nights;
  }

  // ---- laden ------------------------------------------------------------
  async function loadAndRender() {
    try {
      setStatus("Weerdata ophalen\u2026");
      const data = await fetchForecast(state.lat, state.lon);
      state.nights = buildNights(data);
      state.sel = 0;
      const d = new Date(Date.now() + state.off * 1000);
      state.updated = pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
      render();
      if (state.tab === "sky" && HH.renderSky) HH.renderSky();
    } catch (e) {
      setStatus("Er ging iets mis: " + e.message);
    }
  }

  // ---- zoeken (Nominatim, debounce terwijl je typt) --------------------
  let searchTimer = null, searchAbort = null;

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function typeLabel(t) {
    const m = {
      camp_site: "camping", caravan_site: "camping", city: "stad", town: "plaats",
      village: "dorp", hamlet: "gehucht", isolated_dwelling: "buurtschap",
      peak: "berg", lake: "meer", water: "water", nature_reserve: "natuurgebied",
      attraction: "bezienswaardigheid", administrative: "gebied",
    };
    return m[t] || t || "";
  }

  function pickLocation(r) {
    state.name = r.name; state.lat = r.lat; state.lon = r.lon;
    $("#suggest").innerHTML = ""; $("#q").value = r.name;
    loadAndRender();
  }

  function renderSuggestions(res) {
    const sug = $("#suggest"); sug.innerHTML = "";
    res.forEach((r) => {
      const b = el("button", "suggest-item");
      const tl = typeLabel(r.type);
      b.innerHTML = '<span class="sug-name">' + escapeHtml(r.name) +
        (tl ? ' <span class="sug-type">' + escapeHtml(tl) + '</span>' : '') + '</span>' +
        '<span class="sug-addr">' + escapeHtml(r.display_name) + '</span>';
      b.onclick = () => pickLocation(r);
      sug.appendChild(b);
    });
  }

  async function runGeocode(q, quiet) {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    if (!quiet) setStatus("Zoeken\u2026");
    try {
      const res = await geocode(q, searchAbort.signal);
      if (!res.length) {
        $("#suggest").innerHTML = "";
        setStatus("Niets gevonden voor \u201c" + q + "\u201d. Probeer specifieker (plaats + land).");
        return;
      }
      setStatus("");
      renderSuggestions(res);
    } catch (e) {
      if (e.name === "AbortError") return; // vervangen door een nieuwere zoekopdracht
      setStatus("Zoeken mislukt: " + e.message);
    }
  }

  function doSearch() {
    const q = $("#q").value.trim();
    if (q.length < 2) return;
    clearTimeout(searchTimer);
    runGeocode(q, false);
  }
  function onType() {
    const q = $("#q").value.trim();
    clearTimeout(searchTimer);
    if (q.length < 3) { $("#suggest").innerHTML = ""; return; }
    searchTimer = setTimeout(() => runGeocode(q, true), 550);
  }

  // ---- betere hemel in de buurt ----------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function findNearby(modeKey) {
    const mode = Nearby.MODES[modeKey];
    if (!state.lat || !state.nights.length || !state.lastData) {
      HH.nearbyStatus("Kies eerst een locatie."); return;
    }
    const targetKey = state.nights[state.sel].key;
    const nightLabel = state.sel === 0 ? "vanavond" : "die nacht";

    HH.nearbyStatus("Donkere plekken in de buurt zoeken\u2026");
    let cands = LightPollution.placesWithin(state.lat, state.lon, mode.km, { minPop: 800, maxPop: 25000 });
    if (!cands.length) {
      HH.renderNearby({ mode, none: true, reason: "Geen dorpen in de buurt in de ingebouwde data." });
      return;
    }
    cands = Nearby.rankPhase1(cands, mode.km, 8);

    const homeNight = Nearby.scoreNight(state.lastData, state.lat, state.lon, targetKey);
    const homeVal = homeNight ? homeNight.score : 0;

    HH.nearbyStatus("Weer ophalen voor " + cands.length + " plekken\u2026");
    const scored = [];
    for (const c of cands) {
      try {
        const data = await fetchForecast(c.lat, c.lon);
        const sn = Nearby.scoreNight(data, c.lat, c.lon, targetKey);
        if (sn) {
          c.night = sn; c.score = sn.score; c.gain = sn.score - homeVal;
          c.drive = Nearby.driveEstimate(c.km); c.dir = Nearby.compass(c.bearing);
          scored.push(c);
        }
      } catch (e) { /* sla mislukte plek over */ }
    }
    if (!scored.length) { HH.nearbyStatus("Weer ophalen mislukt (netwerk?)."); return; }

    scored.sort((a, b) => b.score - a.score);
    const worth = scored.filter((c) => c.gain >= mode.need).slice(0, 5);

    if (worth.length) {
      HH.nearbyStatus("Plekken benoemen\u2026");
      for (const c of worth) {
        try { const nm = await HH.reverseGeocode(c.lat, c.lon); if (nm && nm.name) c.name = nm.name; } catch (e) { /* */ }
        await sleep(320);
      }
    }
    HH.renderNearby({ mode, home: homeVal, worth, best: scored[0], radiusKm: mode.km, nightLabel });
  }
  HH.findNearby = findNearby;

  // ---- tabs -------------------------------------------------------------
  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".app-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    $("#results").hidden = tab !== "forecast";
    $("#sky").hidden = tab !== "sky";
    $("#theory").hidden = tab !== "theory";
    if (tab === "sky" && HH.renderSky) HH.renderSky();
    if (tab === "theory" && HH.renderTheory) HH.renderTheory();
  }

  // Opstart. LET OP (ADR-033): bij lazy loading in Weerwijsheid is DOMContentLoaded al
  // gepasseerd; dan zou een enkele listener nooit vuren en zou de app stil dood zijn.
  // Daarom: direct booten als het document al geladen is. Werkt ook standalone.
  const boot = () => {
    $("#searchBtn").onclick = doSearch;
    $("#hhGeoBtn").onclick = useBrowserLocation;
    $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } });
    $("#q").addEventListener("input", onType);
    document.querySelectorAll(".app-tab").forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
    setStatus("Zoek een plaats, camping of adres \u2014 of gebruik je locatie.");
  };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
