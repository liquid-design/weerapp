/*
 * ui.js — alle render-helpers + de gedeelde basis (HH-namespace, state,
 * DOM-utilities, tijdformattering). Tekent de twee-panel UI.
 * Exposeert HH.render en HH.setStatus voor de orkestratie in app.js.
 */
(function () {
  "use strict";
  window.HH = window.HH || {};
  const HH = window.HH;

  // ---- gedeelde basis ----------------------------------------------------
  const $ = HH.$ = (s) => document.querySelector(s);
  const el = HH.el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };
  const pad = HH.pad = (n) => String(n).padStart(2, "0");
  const state = HH.state = { name: "", lat: null, lon: null, off: 0, nights: [], sel: 0, updated: "", site: null, tab: "forecast" };

  const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];
  const MO = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  function fmtLocal(ms) {
    const d = new Date(ms + state.off * 1000);
    return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }
  HH.fmtLocal = fmtLocal;

  // ---- helpers voor labels ---------------------------------------------
  function tabLabel(night, i) {
    if (i === 0) return "Vanavond";
    const d = new Date(night.key + "T12:00:00Z");
    return WD[d.getUTCDay()];
  }
  function nightHeading(night) {
    const d = new Date(night.key + "T12:00:00Z");
    const n = new Date(d); n.setUTCDate(d.getUTCDate() + 1);
    return WD[d.getUTCDay()] + " " + d.getUTCDate() + " " + MO[d.getUTCMonth()] +
      " \u2192 " + WD[n.getUTCDay()] + " ochtend";
  }
  function penaltyLabel(p) {
    if (p < 3) return { t: "Geen", k: "g" };
    if (p < 10) return { t: "Laag", k: "y" };
    if (p < 20) return { t: "Matig", k: "o" };
    return { t: "Hoog", k: "r" };
  }
  function confKey(c) { return c === "Hoog" ? "g" : c === "Middel" ? "y" : "o"; }

  // ---- render -----------------------------------------------------------
  function setStatus(msg) {
    const s = $("#status"); s.textContent = msg || ""; s.style.display = msg ? "block" : "none";
  }

  function render() {
    const root = $("#results"); root.innerHTML = "";
    const night = state.nights[state.sel];
    if (!night) { setStatus("Geen nachten met donkere uren gevonden voor deze plek/periode."); return; }
    setStatus("");

    // kop
    const head = el("div", "loc-head");
    head.innerHTML = '<div><div class="loc-name"></div><div class="loc-coords"></div></div>';
    head.querySelector(".loc-name").textContent = state.name || "Locatie";
    head.querySelector(".loc-coords").textContent =
      state.lat.toFixed(2) + "\u00b0, " + state.lon.toFixed(2) + "\u00b0 \u00b7 bijgewerkt " + state.updated;
    root.appendChild(head);

    // nacht-selector
    const tabs = el("div", "tabs");
    state.nights.forEach((n, i) => {
      const b = el("button", "tab r-" + Score.ratingKey(n.agg.tonightScore) + (i === state.sel ? " on" : ""));
      b.innerHTML = '<div class="tab-day">' + tabLabel(n, i).toUpperCase() + "</div>" +
        '<div class="tab-score">' + n.agg.tonightScore + "</div>" +
        '<div class="tab-bar"><span style="width:' + n.agg.tonightScore + '%"></span></div>';
      b.onclick = () => { state.sel = i; render(); };
      tabs.appendChild(b);
    });
    root.appendChild(tabs);

    // twee panelen — links: verdict-card + "in de buurt" eronder
    const grid = el("div", "panels");
    const leftCol = el("div", "left-col");
    leftCol.appendChild(leftPanel(night));
    leftCol.appendChild(nearbyPanel());
    grid.appendChild(leftCol);
    grid.appendChild(rightPanel(night));
    root.appendChild(grid);

    const src = el("div", "source");
    src.innerHTML = "Weerdata: Open-Meteo (incl. 250 hPa straalstroom). Zon, maan en planeten " +
      "lokaal berekend. Lichtvervuiling geschat via stadsgloed-model op stedendata " +
      "(all-the-cities / GeoNames, CC-BY).";
    root.appendChild(src);
  }

  function leftPanel(night) {
    const a = night.agg, v = a.verdict;
    const p = el("div", "card left r-" + v.key);

    const eyebrow = el("div", "eyebrow");
    eyebrow.textContent = (night.idx === 0 ? "Vannacht" : nightHeading(night)) + " \u00b7 algemeen";
    p.appendChild(eyebrow);

    const topline = el("div", "left-top");
    const head = el("div", "verdict");
    head.innerHTML = v.head.replace(/(\S+)$/, '<span class="accentword">$1</span>') +
      (night.idx === 0 ? " <span class=\"accentword\">vanavond</span>" : "");
    const scoreBox = el("div", "score-box");
    scoreBox.innerHTML = '<div class="big">' + a.tonightScore + '</div>' +
      '<div class="rating">' + a.ratingLabel + '</div>' +
      '<div class="conf conf-' + confKey(a.confidence) + '">' + a.confidence.toUpperCase() + ' VERTROUWEN</div>';
    topline.appendChild(head); topline.appendChild(scoreBox);
    p.appendChild(topline);

    const moonInfo = { down: night.moon.alt <= 0, illum: night.moon.illum };
    const sub = el("div", "subtitle");
    let text = Score.describe(a, moonInfo, state.site);
    const bright = night.planets.find((pl) => ["Venus", "Jupiter", "Saturnus", "Mars"].includes(pl.name));
    if (bright) text += " " + bright.name + " staat goed vannacht (" + bright.peakAlt + "\u00b0 " + bright.dir + ").";
    sub.textContent = text;
    p.appendChild(sub);

    // Laag 1 (beslissing): beste venster meteen zichtbaar, met kwaliteit
    if (a.bestWindow) {
      const b = a.bestWindow;
      const pill = el("div", "pill");
      pill.innerHTML = '<span class="pill-k">BESTE MOMENT</span> <b>' + b.startLabel +
        " \u2013 " + b.endLabel + '</b> <span class="pill-k">' + b.len + 'u \u00b7 ' + b.quality + '</span>';
      p.appendChild(pill);
    }

    // compacte badges: Melkweg, transparantie, nachttrend, dauw (indien nodig)
    p.appendChild(badges(a));

    // Laag 2 (verklaring): vier dimensies in mensentaal + checkmarks
    const d = a.dims;
    const dims = el("div", "dims");
    dims.innerHTML =
      dimChip("\u2601\uFE0F", "Atmosfeer", d.atmos) + '<span class="dim-x">\u00d7</span>' +
      dimChip("\uD83C\uDF19", "Maan", d.moon) + '<span class="dim-x">\u00d7</span>' +
      dimChip("\uD83C\uDF03", "Donkere hemel", d.loc) + '<span class="dim-x">\u00d7</span>' +
      dimChip("\uD83D\uDD2D", "Scherpe lucht", d.seeing);
    p.appendChild(dims);

    // "Waarom (niet hoger)?" als checklist + een samenvattende zin
    const wb = whyBlock(a, state.site, moonInfo);
    if (wb) {
      const w = el("div", "why");
      let html = '<div class="why-k">Waarom ' + (a.tonightScore < 50 ? "laag" : "niet hoger") + '?</div>' +
        '<ul class="why-list">';
      wb.items.forEach((it) => {
        html += '<li class="' + (it.ok ? "yes" : "no") + '"><span class="why-m">' +
          (it.ok ? "\u2713" : "\u2715") + '</span>' + it.text + '</li>';
      });
      html += '</ul>';
      if (wb.summary) html += '<div class="why-sum">' + wb.summary + '</div>';
      w.innerHTML = html;
      p.appendChild(w);
    }

    const glanceLabel = el("div", "section-label");
    glanceLabel.innerHTML = "De nacht in \u00e9\u00e9n oogopslag <span class=\"hint\">balkhoogte = uurscore \u00b7 lichter = schemering</span>";
    p.appendChild(glanceLabel);
    p.appendChild(chart(night));
    const detail = el("div", "hour-detail"); detail.id = "hourDetail";
    detail.textContent = "Tik op een uur voor de opbouw.";
    p.appendChild(detail);
    return p;
  }

  function chart(night) {
    const wrap = el("div", "chart");
    const bw = night.agg.bestWindow;
    const bwSet = new Set(bw ? bw.hours.map((h) => h.ms) : []);
    const row = el("div", "bars");
    night.chartHours.forEach((h) => {
      const b = el("div", "bar r-" + Score.ratingKey(h.display) +
        (bwSet.has(h.ms) ? " best" : "") + (h.darkF < 0.8 ? " tw" : ""));
      const fill = el("div", "bar-fill");
      fill.style.height = Math.max(4, h.display) + "%";
      b.appendChild(fill);
      const lab = el("div", "bar-lab"); lab.textContent = h.hourLabel.slice(0, 2);
      b.appendChild(lab);
      b.onclick = () => showHourDetail(h, night);
      row.appendChild(b);
    });
    wrap.appendChild(row);
    const axis = el("div", "axis");
    axis.innerHTML = '<span>' + (night.times.sunset ? fmtLocal(night.times.sunset) : "") +
      ' zononder</span><span>' + (night.times.sunrise ? fmtLocal(night.times.sunrise) : "") + ' zonop</span>';
    wrap.appendChild(axis);
    return wrap;
  }

  function badges(a) {
    const row = el("div", "badges");
    row.appendChild(badge("\uD83C\uDF0C",
      a.milkyWay ? "Melkweg waarschijnlijk zichtbaar" : "Melkweg waarschijnlijk niet zichtbaar",
      a.milkyWay ? "g" : "muted"));
    const tKey = a.transparency === "goed" ? "g" : a.transparency === "matig" ? "y" : "o";
    row.appendChild(badge("\uD83C\uDF2B\uFE0F", "Transparantie: " + a.transparency, tKey));
    if (a.trend) {
      const arrow = a.trend === "verbetert" ? "\u2197" : a.trend === "verslechtert" ? "\u2198" : "\u2192";
      const trKey = a.trend === "verbetert" ? "g" : a.trend === "verslechtert" ? "o" : "muted";
      row.appendChild(badge(arrow, "Nachttrend: " + a.trend, trKey));
    }
    if (a.dewWarn) row.appendChild(badge("\uD83D\uDCA7", "Kans op dauw op optiek later", "y"));
    return row;
  }
  function badge(icon, text, key) {
    const b = el("span", "badge b-" + key);
    b.innerHTML = '<span class="badge-i">' + icon + "</span>" + text;
    return b;
  }

  function dimChip(icon, label, pct) {
    const key = pct >= 80 ? "g" : pct >= 55 ? "y" : pct >= 30 ? "o" : "r";
    const mark = pct >= 70 ? '<span class="dim-ok">\u2713</span>' : '<span class="dim-no">\u2715</span>';
    return '<div class="dim r-' + key + '"><div class="dim-lab">' + icon + " " + label + '</div>' +
      '<div class="dim-val">' + pct + mark + '</div></div>';
  }

  function whyBlock(a, site, moon) {
    const d = a.dims;
    const yes = [], no = [];

    if (a.meanCloud < 25) yes.push("Weinig bewolking");
    else if (a.meanCloud >= 45) no.push("Te veel bewolking");
    if (a.meanRain < 15) yes.push("Geen regen");
    else no.push("Kans op neerslag");
    if (moon && moon.down) yes.push("Maan onder de horizon");
    else if (d.moon >= 85) yes.push("Weinig maanlicht");
    else if (d.moon < 70) no.push("Heldere maan stoort");
    if (d.loc >= 80) yes.push("Donkere hemel");
    else if (d.loc < 55) {
      const nm = (site && site.label ? site.label.toLowerCase() : "stedelijke");
      no.push("Sterke lichtgloed \u2014 " + nm + (site ? " (\u2248 Bortle " + site.bortle + ")" : ""));
    }
    if (d.seeing >= 85) yes.push("Rustige lucht");
    else if (d.seeing < 72) no.push("Onrustige bovenlucht");

    if (!no.length) return null;

    const items = yes.slice(0, 3).map((t) => ({ ok: true, text: t }))
      .concat(no.slice(0, 2).map((t) => ({ ok: false, text: t })));

    let summary = "";
    if (d.atmos < 55) summary = "Te veel bewolking of neerslag om vannacht goed te kijken.";
    else if (d.moon < 70) summary = "De maan verlicht de hemel \u2014 zwakke objecten verdwijnen.";
    else if (d.seeing < 72) summary = "De lucht is onrustig \u2014 fijne details (planeten, maan) worden waziger.";
    else if (d.loc < 55) summary = "De lucht is helder, maar de locatie beperkt wat je kunt zien.";

    return { items, summary };
  }

  function factorBar(label, val, max, unit) {
    const w = Math.round((val / max) * 100);
    const key = w >= 80 ? "g" : w >= 55 ? "y" : w >= 30 ? "o" : "r";
    return '<div class="fb"><div class="fb-top"><span>' + label + '</span>' +
      '<span class="fb-val">' + unit + '</span></div>' +
      '<div class="fb-track"><span class="r-' + key + '" style="width:' + w + '%"></span></div>' +
      '<div class="fb-pts">+' + val + "/" + max + '</div></div>';
  }

  function showHourDetail(h, night) {
    const d = $("#hourDetail"); d.innerHTML = "";
    const head = el("div", "hd-head");
    head.innerHTML = '<span>' + h.hourLabel + '</span><span class="hd-score r-' +
      Score.ratingKey(h.display) + '">' + h.display + '<small>/100</small></span>';
    d.appendChild(head);
    const grid = el("div", "fb-grid");
    grid.innerHTML =
      factorBar("Bewolking", h.parts.cloud, Score.MAX.cloud, h.cloudTotal + "%") +
      factorBar("Wind", h.parts.wind, Score.MAX.wind, (h.wind / 3.6).toFixed(1) + " m/s") +
      factorBar("Dauw", h.parts.dew, Score.MAX.dew, "\u0394" + h.spread.toFixed(1) + "\u00b0C") +
      factorBar("Regen", h.parts.rain, Score.MAX.rain, (h.precipProb || 0) + "%");
    d.appendChild(grid);
    const note = el("div", "hd-note");
    note.textContent = (h.moonPenalty > 0 ? "Maan dempt \u2212" + h.moonPenalty + "%" : "Maan onder de horizon") +
      (h.darkF < 0.9 ? " \u00b7 schemering" : " \u00b7 volledig donker") +
      " \u00b7 balk = atmosfeer \u00d7 maan";
    d.appendChild(note);
  }

  function rightPanel(night) {
    const wrap = el("div", "right");
    const a = night.agg, t = night.times;

    const cond = el("div", "card");
    cond.innerHTML = '<div class="card-label">Condities</div>' +
      rowKV("Zonsondergang", t.sunset ? fmtLocal(t.sunset) : "\u2014") +
      rowKV("Duisternis", (t.darkStart ? fmtLocal(t.darkStart) : "\u2014") + " \u2013 " +
        (t.darkEnd ? fmtLocal(t.darkEnd) : "\u2014") + ' <small>(' + t.darkKind + ')</small>') +
      rowKV("Zonsopkomst", t.sunrise ? fmtLocal(t.sunrise) : "\u2014") +
      rowKV("Bruikbare uren", a.usableHours + " van " + a.darkHours) +
      rowKV("Beste reeks", a.run + "u") +
      rowKV("Seeing (250 hPa)", a.seeingMs != null
        ? Math.round(a.seeingMs) + " m/s <small>(" + Seeing.label(a.seeingMs) + ")</small>" : "\u2014");
    wrap.appendChild(cond);

    if (state.site) {
      const s = state.site, lpKey = s.factor >= 0.8 ? "g" : s.factor >= 0.55 ? "y" : s.factor >= 0.35 ? "o" : "r";
      const loc = el("div", "card");
      loc.innerHTML = '<div class="card-label">Donkere hemel \u00b7 geschatte kwaliteit</div>' +
        '<div class="loc-headline r-' + lpKey + '">' + s.label + '</div>' +
        '<div class="loc-sub">\u2248 Bortle ' + s.bortle + ' \u00b7 factor \u00d7' + s.factor.toFixed(2) + '</div>' +
        rowKV("SQM", "\u2248 " + s.sqm.toFixed(2) + " <small>mag/boogsec\u00b2</small>") +
        rowKV("Grensmagnitude", "\u2248 " + s.nelm.toFixed(1) + " <small>blote oog</small>") +
        rowKV("Gebaseerd op", "<small>stedelijke lichtbronnen + afstand tot steden</small>") +
        '<div class="loc-note">Modelmatige schatting (stadsgloed), geen meting. Houdt nog ' +
        'geen rekening met hoogte, reli\u00ebf of type straatverlichting.</div>';
      wrap.appendChild(loc);
    }

    const br = el("div", "card");
    br.innerHTML = '<div class="card-label">Score-opbouw</div>' +
      '<div class="br-intro">Atmosfeer bouwt op uit vier weerfactoren (samen ' + a.dims.atmos + '/100)' +
      (a.worstHaze < 0 ? ', incl. nevel ' + a.worstHaze + ' (' + Math.round(a.worstVisKm) + ' km zicht)' : '') + '</div>' +
      factorBar("Bewolking", a.aggParts.cloud, Score.MAX.cloud, a.meanCloud + "%") +
      factorBar("Wind", a.aggParts.wind, Score.MAX.wind, a.meanWindMs.toFixed(1) + " m/s") +
      factorBar("Dauw", a.aggParts.dew, Score.MAX.dew, "\u0394" + a.meanSpread.toFixed(1) + "\u00b0C") +
      factorBar("Regen", a.aggParts.rain, Score.MAX.rain, a.meanRain + "%") +
      '<div class="br-sum">' +
      rowMul("Atmosfeer", a.dims.atmos, "") +
      rowMul("\u00d7 Maan", a.dims.moon, "%") +
      rowMul("\u00d7 Locatie", a.dims.loc, "%") +
      rowMul("\u00d7 Seeing", a.dims.seeing, "%") +
      '<div class="row final"><span>Eindscore</span><b class="r-' + Score.ratingKey(a.tonightScore) + '">' + a.tonightScore + '/100</b></div>' +
      '</div>';
    wrap.appendChild(br);

    const m = night.moon, pl = penaltyLabel(m.influence);
    const moon = el("div", "card");
    moon.innerHTML = '<div class="card-label">Maan</div>' +
      '<div class="moon-row"><div class="moon-glyph">' + m.glyph + '</div>' +
      '<div><div class="moon-name">' + m.name + '</div>' +
      '<div class="moon-sub">' + Math.round(m.illum * 100) + '% verlicht</div></div></div>' +
      rowKV("Opkomst", m.rise ? fmtLocal(m.rise) : "\u2014") +
      rowKV("Ondergang", m.set ? fmtLocal(m.set) : "\u2014") +
      '<div class="row"><span>Storing</span><b class="conf-' + pl.k + '">' + pl.t + '</b></div>';
    wrap.appendChild(moon);

    if (night.planets.length) {
      const pn = el("div", "card");
      let html = '<div class="card-label">Planeten</div>';
      night.planets.forEach((p) => {
        const win = (p.startMs ? fmtLocal(p.startMs) : "") + (p.endMs ? "\u2013" + fmtLocal(p.endMs) : "");
        html += '<div class="planet"><span class="pl-name">' + p.sym + " " + p.name + '</span>' +
          '<span class="pl-pos"><b>' + p.peakAlt + "\u00b0 " + p.dir + '</b> <small>' + win + '</small></span></div>';
      });
      pn.innerHTML = html;
      wrap.appendChild(pn);
    }
    return wrap;
  }

  function rowMul(k, val, suffix) {
    const key = val >= 80 ? "g" : val >= 55 ? "y" : val >= 30 ? "o" : "r";
    return '<div class="row"><span>' + k + '</span><b class="r-' + key + '">' + val + suffix + '</b></div>';
  }
  function rowKV(k, v) {
    return '<div class="row"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  // ---- betere hemel in de buurt: weergave ------------------------------
  function nearbyPanel() {
    const sec = el("div", "nearby-panel");
    sec.innerHTML =
      '<div class="nb-controls">' +
        '<span class="nb-title">Betere hemel in de buurt</span>' +
        '<select id="nearbyMode" aria-label="Hoe ver wil je rijden?">' +
          '<option value="kijken">\uD83C\uDF19 Even kijken \u00b7 30 min</option>' +
          '<option value="goed" selected>\uD83D\uDD2D Goede plek \u00b7 1 uur</option>' +
          '<option value="fotos">\uD83D\uDCF7 Nacht voor foto\u2019s \u00b7 2 uur</option>' +
          '<option value="roadwarrior">\uD83D\uDE97 Roadwarrior \u00b7 3 uur+</option>' +
        '</select>' +
        '<button id="nearbyBtn" class="btn">Zoek plekken</button>' +
      '</div>' +
      '<div id="nearbyOut" class="nb-out"></div>';
    sec.querySelector("#nearbyBtn").onclick = () =>
      HH.findNearby(sec.querySelector("#nearbyMode").value);
    return sec;
  }

  function nearbyStatus(msg) {
    const o = $("#nearbyOut"); if (o) o.innerHTML = '<p class="nb-msg">' + msg + "</p>";
  }

  function renderNearby(res) {
    const out = $("#nearbyOut"); if (!out) return; out.innerHTML = "";
    if (res.none) { out.innerHTML = '<p class="nb-msg">' + res.reason + "</p>"; return; }

    const worth = res.worth || [];
    if (!worth.length) {
      let msg = "Binnen \u201c" + res.mode.label.toLowerCase() + "\u201d vind ik geen plek die de rit " +
        res.nightLabel + " waard is \u2014 thuis is je beste optie.";
      if (res.best) msg += " (dichtstbij beter: +" + Math.max(0, res.best.gain) + " op ~" +
        Nearby.fmtDrive((res.best.drive || Nearby.driveEstimate(res.best.km)).mins) + ").";
      out.innerHTML = '<p class="nb-stay">' + msg + "</p>";
      return;
    }

    const head = el("div", "nb-head");
    head.innerHTML = res.mode.icon + " <b>" + worth.length + (worth.length > 1 ? " plekken" : " plek") +
      "</b> beter dan thuis (" + res.home + ") " + res.nightLabel;
    out.appendChild(head);

    const radar = el("div", "nb-radar");
    radar.innerHTML = Nearby.radarSVG(worth, res.radiusKm);
    out.appendChild(radar);

    const list = el("div", "nb-list");
    worth.forEach((c, i) => {
      const key = c.score >= 70 ? "g" : c.score >= 50 ? "y" : c.score >= 30 ? "o" : "r";
      const drive = c.drive || Nearby.driveEstimate(c.km);
      const row = el("div", "nb-item r-" + key);
      row.innerHTML =
        '<div class="nb-rank">' + (i + 1) + "</div>" +
        '<div class="nb-main"><div class="nb-name">' + (c.name || ("Plek " + (i + 1))) +
        ' <span class="nb-bortle">\u2248 B' + (c.night ? c.night.bortle : "?") + "</span></div>" +
        '<div class="nb-meta">~' + Nearby.fmtDrive(drive.mins) + " rijden naar het " + c.dir +
        " \u00b7 " + Math.round(c.km) + " km" +
        (c.night && c.night.milkyWay ? " \u00b7 \uD83C\uDF0C Melkweg" : "") + "</div></div>" +
        '<div class="nb-score"><div class="nb-num r-' + key + '">' + c.score +
        '</div><div class="nb-gain">+' + c.gain + "</div></div>";
      list.appendChild(row);
    });
    out.appendChild(list);

    const note = el("div", "nb-note");
    note.textContent = "Rijtijd is hemelsbreed geschat (geen route). Plekken zijn dorpen met wegen; " +
      "parkeer- en horizoninfo zit er niet in.";
    out.appendChild(note);
  }

  HH.render = render;
  HH.setStatus = setStatus;
  HH.renderNearby = renderNearby;
  HH.nearbyStatus = nearbyStatus;
})();
