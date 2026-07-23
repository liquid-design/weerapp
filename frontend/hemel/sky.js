/*
 * sky.js — tab "Planeten & sterren": twee sterrenwielen (dierenriem +
 * planeten) op één pagina, met een gedeelde tijd-slider. Hergebruikt de
 * locatie uit Heldere Hemel (HH.state.lat/lon), zodat je die niet opnieuw
 * hoeft te kiezen. Zelfde Schlyter-astronomie als de app (planeten via het
 * Planets-model; ecliptica/zon/maan lokaal), zodat beide wielen consistent
 * zijn. Exposeert HH.renderSky().
 */
(function () {
  "use strict";
  const HH = window.HH;
  const RAD = Math.PI / 180;
  const rev = (x) => ((x % 360) + 360) % 360;
  const R = 150, cx = 180, cy = 180;

  // ---- astronomie (consistent met planets.js) --------------------------
  function dayNumber(date) { return date.valueOf() / 86400000 - 10957.5; }
  function sunRect(d) {
    const w = 282.9404 + 4.70935e-5 * d, e = 0.016709 - 1.151e-9 * d, M = rev(356.047 + 0.9856002585 * d);
    const E = M + (e / RAD) * Math.sin(M * RAD) * (1 + e * Math.cos(M * RAD));
    const xv = Math.cos(E * RAD) - e, yv = Math.sqrt(1 - e * e) * Math.sin(E * RAD);
    const v = Math.atan2(yv, xv) / RAD, r = Math.sqrt(xv * xv + yv * yv), lon = rev(v + w);
    return { lon };
  }
  function lstDeg(date, lng) {
    const d = date.valueOf() / 86400000 - 10957.5;
    const Ms = rev(356.047 + 0.9856002585 * d), ws = 282.9404 + 4.70935e-5 * d;
    const gmst0 = rev(Ms + ws + 180), ut = (date.valueOf() / 3600000) % 24;
    return rev(gmst0 + ut * 15.04107 + lng);
  }
  function altAzRaDec(date, lat, lng, raDeg, decDeg) {
    const ha = rev(lstDeg(date, lng) - raDeg) * RAD, phi = lat * RAD, dec = decDeg * RAD;
    let alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
    alt = alt + (RAD * 0.017) / Math.tan(alt + (RAD * 10.26) / (alt / RAD + 5.11));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    return { alt: alt / RAD, az: rev(az / RAD + 180) };
  }
  function eclToEqDeg(lonDeg, latDeg) {
    const e = 23.4393 * RAD, l = lonDeg * RAD, b = (latDeg || 0) * RAD;
    const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / RAD;
    const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / RAD;
    return { ra: rev(ra), dec };
  }
  function moonRaDec(date) {
    const d = date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545, e = 23.4397 * RAD;
    const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
    const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
    const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)) / RAD;
    const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)) / RAD;
    return { ra: rev(ra), dec };
  }

  const SIGNS = [["\u2648", "Ram"], ["\u2649", "Stier"], ["\u264A", "Tweelingen"], ["\u264B", "Kreeft"],
    ["\u264C", "Leeuw"], ["\u264D", "Maagd"], ["\u264E", "Weegschaal"], ["\u264F", "Schorpioen"],
    ["\u2650", "Boogschutter"], ["\u2651", "Steenbok"], ["\u2652", "Waterman"], ["\u2653", "Vissen"]];
  const PLANETS = ["Mercurius", "Venus", "Mars", "Jupiter", "Saturnus", "Uranus", "Neptunus"];
  const PCOLOR = { Mercurius: "#b0a086", Venus: "#e9d9a6", Mars: "#c25a48", Jupiter: "#cd8646",
    Saturnus: "#cca63e", Uranus: "#8fbccb", Neptunus: "#6a7fb5" };
  const CARD = [["N", 0], ["NO", 45], ["O", 90], ["ZO", 135], ["Z", 180], ["ZW", 225], ["W", 270], ["NW", 315]];
  const DIRS16 = ["N", "NNO", "NO", "ONO", "O", "OZO", "ZO", "ZZO", "Z", "ZZW", "ZW", "WZW", "W", "WNW", "NW", "NNW"];
  const compass16 = (az) => DIRS16[Math.round(az / 22.5) % 16];

  // liniaal onder de slider: uur-tickjes, dikkere lijn + datum bij middernacht,
  // en een accent-markering op "nu". Venster = nu ± 12 uur.
  function timeRuler() {
    const now = Date.now(), start = now - 720 * 60000, end = now + 720 * 60000, span = end - start;
    let h = "";
    let d = new Date(start); d.setMinutes(0, 0, 0);
    if (d.getTime() < start) d.setTime(d.getTime() + 3600000);
    for (let t = d.getTime(); t <= end; t += 3600000) {
      const dt = new Date(t), hh = dt.getHours(), pos = ((t - start) / span * 100).toFixed(2);
      if (hh === 0) {
        h += '<span class="rt day" style="left:' + pos + '%"></span>';
        h += '<span class="rl day" style="left:' + pos + '%">' +
          dt.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" }) + '</span>';
      } else {
        h += '<span class="rt" style="left:' + pos + '%"></span>';
        if (hh % 6 === 0) h += '<span class="rl" style="left:' + pos + '%">' + String(hh).padStart(2, "0") + '</span>';
      }
    }
    h += '<span class="rt now" style="left:50%"></span><span class="rl now" style="left:50%">nu</span>';
    return h;
  }

  // gekleurde kwaliteitsbalk: hergebruikt de uurscores én kleuren uit
  // "De nacht in één oogopslag" (state.nights[].chartHours). Dag = geen
  // segment (gewone balk), zodat alleen de nacht ingekleurd wordt.
  function qualityBar() {
    const st = HH.state;
    if (!st.nights || !st.nights.length || !window.Score) return "";
    const now = Date.now(), start = now - 720 * 60000, end = now + 720 * 60000, span = end - start;
    const w = (3600000 / span * 100).toFixed(2);
    let h = "";
    for (const n of st.nights) {
      for (const hr of n.chartHours) {
        if (hr.ms < start - 3600000 || hr.ms > end) continue;
        const pos = ((hr.ms - start) / span * 100).toFixed(2);
        h += '<span class="qseg r-' + Score.ratingKey(hr.display) + '" style="left:' + pos + '%;width:' + w + '%"></span>';
      }
    }
    return h;
  }

  const SIGN_SYM = {}, SIGN_INDEX = {};
  SIGNS.forEach((sn, i) => { SIGN_SYM[sn[1]] = sn[0]; SIGN_INDEX[sn[1]] = i; });

  // Vereenvoudigde maar herkenbare sterfiguren (asterismen) per teken.
  // stars: [x, y, magnitude] in een 0..120 vak (y omlaag); lines: paren indices.
  const CONSTEL = {
    Ram: { s: [[30,68,3],[52,60,2.6],[70,52,2],[82,42,2]], l: [[0,1],[1,2],[2,3]],
      d: "Een korte, gebogen lijn van sterren. Helderste ster: Hamal." },
    Stier: { s: [[20,18,2],[40,44,3],[57,58,1],[66,50,3],[86,30,3],[48,66,3],[14,13,4.5],[18,10,4.5],[16,16,4.5],[12,14,4.5]],
      l: [[0,1],[1,2],[2,3],[3,4],[2,5]],
      d: "De kop is een V (de Hyaden) met de oranje Aldebaran; twee horens steken omhoog. Het groepje sterretjes ernaast is het Zevengesternte (Pleiaden)." },
    Tweelingen: { s: [[32,18,2],[50,20,1],[28,42,3],[52,44,3],[24,66,3],[58,66,3],[30,86,3],[64,84,3]],
      l: [[0,1],[0,2],[2,4],[4,6],[1,3],[3,5],[5,7]],
      d: "Twee parallelle rijen — de tweeling — met de heldere koppen Castor en Pollux bovenaan." },
    Kreeft: { s: [[50,46,4],[34,28,4],[66,30,4],[52,74,4],[47,42,5],[54,44,5]], l: [[0,1],[0,2],[0,3]],
      d: "Zwak, een omgekeerde Y. In het midden de Bijenkorf-sterrenhoop (M44), mooi met een verrekijker." },
    Leeuw: { s: [[30,72,1],[33,58,3],[39,45,2.6],[47,38,3],[55,44,3],[49,53,3],[64,50,2.6],[88,56,2],[66,64,3]],
      l: [[0,1],[1,2],[2,3],[3,4],[4,5],[0,6],[6,7],[7,8],[8,6]],
      d: "De 'Sikkel' (een omgekeerd vraagteken) met Regulus onderaan, en een driehoek voor de achterhand met Denebola in de staart." },
    Maagd: { s: [[52,86,1],[46,60,3],[30,40,3],[60,58,3],[64,74,3],[22,54,3]],
      l: [[0,1],[1,2],[1,3],[3,4],[1,5]],
      d: "Uitgestrekt en wat zwak. Helderste ster: de blauwwitte Spica, laag in het zuiden." },
    Weegschaal: { s: [[30,66,3],[44,40,2.6],[66,50,3],[54,74,3]], l: [[0,1],[1,2],[2,3],[3,0]],
      d: "Een scheve vierhoek — de weegschaal. Bevat de ster met de mooiste naam: Zubeneschamali." },
    Schorpioen: { s: [[24,22,3],[30,30,3],[28,40,3],[40,50,1],[48,62,3],[56,72,3],[66,78,3],[76,74,3],[82,64,3],[78,55,3]],
      l: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9]],
      d: "De duidelijke J-haak met de rode reuzenster Antares in het hart en een gekromde staart met de angel." },
    Boogschutter: { s: [[54,26,3],[44,40,3],[36,56,3],[50,66,2.6],[66,64,3],[70,46,3],[60,44,3]],
      l: [[0,1],[1,2],[1,6],[0,6],[6,5],[5,4],[4,3],[3,2]],
      d: "Het 'theepot'-patroon. De 'stoom' uit de tuit wijst richting het centrum van de Melkweg." },
    Steenbok: { s: [[24,38,3],[32,46,3],[48,64,3],[64,60,3],[76,44,3],[68,38,3]],
      l: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]],
      d: "Een brede driehoek of 'boot'. Zwak, maar 's zomers hoog in het zuiden te vinden." },
    Waterman: { s: [[38,34,2.6],[28,46,2.6],[50,40,3],[45,32,3],[56,34,3],[53,50,3],[60,60,3],[64,70,3],[72,74,3]],
      l: [[2,3],[2,4],[2,5],[0,2],[0,1],[5,6],[6,7],[7,8]],
      d: "Een zwakke Y — de waterkruik — met een 'stroom' sterren die eronder naar beneden loopt." },
    Vissen: { s: [[26,26,4],[20,34,4],[26,42,4],[34,40,4],[32,30,4],[44,56,3],[56,72,3],[70,58,3],[82,44,3],[80,34,3]],
      l: [[0,1],[1,2],[2,3],[3,4],[4,0],[3,5],[5,6],[6,7],[7,8],[8,9]],
      d: "Twee vissen verbonden door een koord, met de 'Circlet' (een ringetje sterren) aan één kant. Zwak." },
  };

  function constellationSVG(name) {
    const c = CONSTEL[name]; if (!c) return "";
    const V = 120;
    let s = '<svg viewBox="0 0 ' + V + ' ' + V + '" class="cst-fig" xmlns="http://www.w3.org/2000/svg">';
    s += '<defs><radialGradient id="cbg" cx="50%" cy="45%" r="70%"><stop offset="0%" stop-color="#1b1830"/><stop offset="100%" stop-color="#0c0a16"/></radialGradient></defs>';
    s += '<rect x="0" y="0" width="' + V + '" height="' + V + '" rx="10" fill="url(#cbg)"/>';
    for (let i = 0; i < 46; i++) {
      const x = ((i * 61) % 112) + 4, y = ((i * 97 + 23) % 112) + 4;
      const r = (i % 5 === 0 ? 0.9 : 0.5), op = (i % 3 === 0 ? 0.32 : 0.16);
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#fff" opacity="' + op + '"/>';
    }
    c.l.forEach(([a, b]) => { const A = c.s[a], B = c.s[b];
      s += '<line x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '" stroke="#9db0da" stroke-opacity="0.5" stroke-width="0.8"/>'; });
    c.s.forEach((st) => { const mag = st[2] == null ? 3 : st[2];
      const r = Math.max(1.1, Math.min(3.4, 3.6 - mag * 0.5));
      if (mag <= 2) s += '<circle cx="' + st[0] + '" cy="' + st[1] + '" r="' + (r + 2.4) + '" fill="#fff" opacity="0.12"/>';
      s += '<circle cx="' + st[0] + '" cy="' + st[1] + '" r="' + r.toFixed(1) + '" fill="#f6f1e6"/>';
    });
    s += '</svg>';
    return s;
  }

  function escClose(e) { if (e.key === "Escape") closeConstellation(); }
  function closeConstellation() {
    const o = document.querySelector(".cst-overlay"); if (o) o.remove();
    document.removeEventListener("keydown", escClose);
  }
  function openConstellation(name) {
    closeConstellation();
    const c = CONSTEL[name]; if (!c) return;
    const st = HH.state, date = new Date(Date.now() + skyOff * 60000);
    let posTxt = "";
    if (st.lat != null && SIGN_INDEX[name] != null) {
      const eq = eclToEqDeg(SIGN_INDEX[name] * 30 + 15, 0);
      const p = altAzRaDec(date, st.lat, st.lon, eq.ra, eq.dec);
      posTxt = p.alt > 0
        ? "Nu: kijk naar het " + compass16(p.az) + ", " + Math.round(p.alt) + "\u00b0 hoog"
        : "Nu onder de horizon \u2014 sleep de tijd om te zien wanneer het opkomt.";
    }
    const ov = HH.el("div", "cst-overlay");
    ov.innerHTML = '<div class="cst-modal"><button class="cst-close" aria-label="sluiten">\u00d7</button>' +
      '<div class="cst-title">' + (SIGN_SYM[name] || "") + " " + name + '</div>' +
      '<div class="cst-svg">' + constellationSVG(name) + '</div>' +
      '<div class="cst-desc">' + c.d + '</div>' +
      (posTxt ? '<div class="cst-pos">' + posTxt + '</div>' : '') + '</div>';
    ov.addEventListener("click", (e) => { if (e.target === ov) closeConstellation(); });
    ov.querySelector(".cst-close").onclick = closeConstellation;
    document.body.appendChild(ov);
    document.addEventListener("keydown", escClose);
  }
  HH.openConstellation = openConstellation;

  function skyBodies(kind, date, lat, lon) {
    if (kind === "zodiac") return SIGNS.map(([sym, name], i) => {
      const eq = eclToEqDeg(i * 30 + 15, 0); const p = altAzRaDec(date, lat, lon, eq.ra, eq.dec);
      return { sym, name, alt: p.alt, az: p.az, color: "#9166a6" };
    });
    return PLANETS.map((name) => {
      const p = window.Planets.altAz(name, date, lat, lon);
      return { sym: p.sym, name, alt: p.altitude, az: p.azimuth, color: PCOLOR[name] };
    });
  }

  function project(alt, az) {
    let r = (90 - alt) / 90 * R; const below = alt < 0; if (below) r = R + 10;
    const a = az * RAD; return [cx + r * Math.sin(a), cy - r * Math.cos(a), below];
  }

  function drawWheel(date, lat, lon, bodies, style) {
    let s = '<svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg">';
    s += '<defs><radialGradient id="sky2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#3d3556"/><stop offset="100%" stop-color="#241f38"/></radialGradient></defs>';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="url(#sky2)" stroke="#e4dac6" stroke-width="2"/>';
    [30, 60].forEach((a) => { const r = (90 - a) / 90 * R;
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#fff" stroke-opacity="0.12"/>';
      s += '<text x="' + (cx + 4) + '" y="' + (cy - r + 11) + '" font-size="9" fill="#fff" opacity="0.4">' + a + '\u00b0</text>';
    });
    let dp = "", started = false;
    for (let L = 0; L <= 360; L += 3) {
      const eq = eclToEqDeg(L, 0); const p = altAzRaDec(date, lat, lon, eq.ra, eq.dec);
      if (p.alt >= 0) { const [x, y] = project(p.alt, p.az); dp += (started ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " "; started = true; }
      else started = false;
    }
    if (dp) s += '<path d="' + dp + '" fill="none" stroke="#cca63e" stroke-opacity="0.5" stroke-width="1.6"/>';

    const sr = sunRect(dayNumber(date)); const se = eclToEqDeg(sr.lon, 0); const sun = altAzRaDec(date, lat, lon, se.ra, se.dec);
    const me = moonRaDec(date); const moon = altAzRaDec(date, lat, lon, me.ra, me.dec);
    const [mx, my, mb] = project(moon.alt, moon.az); s += '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="5" fill="#f2ead2" stroke="#8c8272" opacity="' + (mb ? 0.35 : 1) + '"/>';
    const [sx, sy, sb] = project(sun.alt, sun.az); s += '<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="7" fill="#f2c14e" stroke="#9c5a22" opacity="' + (sb ? 0.3 : 1) + '"/>';

    const up = [], down = [];
    for (const b of bodies) {
      const [x, y, below] = project(b.alt, b.az);
      const X = x.toFixed(1), Y = y.toFixed(1), TY = (y + 5).toFixed(1);
      if (below) {
        down.push(b.name);
        if (style === "sign") {
          s += '<g data-sign="' + b.name + '" style="cursor:pointer"><title>' + b.name + ' \u2014 bekijk sterrenbeeld</title>' +
            '<circle cx="' + X + '" cy="' + Y + '" r="10" fill="transparent"/>' +
            '<text x="' + X + '" y="' + TY + '" text-anchor="middle" font-size="14" fill="#8c8272" opacity="0.55">' + b.sym + '</text></g>';
        } else {
          s += '<text x="' + X + '" y="' + TY + '" text-anchor="middle" font-size="14" fill="#8c8272" opacity="0.55">' + b.sym + '</text>';
        }
      } else {
        up.push(b);
        if (style === "sign") {
          s += '<g data-sign="' + b.name + '" style="cursor:pointer"><title>' + b.name + ' \u2014 bekijk sterrenbeeld</title>' +
            '<circle cx="' + X + '" cy="' + Y + '" r="12" fill="#9166a6"/>' +
            '<text x="' + X + '" y="' + TY + '" text-anchor="middle" font-size="14" fill="#fff">' + b.sym + '</text></g>';
        } else {
          s += '<circle cx="' + X + '" cy="' + Y + '" r="11" fill="' + b.color + '"/>' +
            '<text x="' + X + '" y="' + TY + '" text-anchor="middle" font-size="14" fill="#241f38">' + b.sym + '</text>';
        }
      }
    }
    CARD.forEach(([nm, az]) => { const a = az * RAD; const x = cx + (R + 14) * Math.sin(a), y = cy - (R + 14) * Math.cos(a); s += '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#8c8272">' + nm + '</text>'; });
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="#f6f1e6"/>';
    s += '</svg>';
    return { svg: s, up, down, sun, moon, style };
  }

  function listHtml(w) {
    let h = "";
    if (w.up.length) {
      h = '<div class="ul-title">Draai je kompas naar de richting, kijk omhoog tot de hoogte:</div>';
      h += w.up.slice().sort((a, b) => a.az - b.az).map((u) =>
        '<div class="ul-item"><span class="ul-sym" style="color:' + u.color + '">' + u.sym + '</span> <b>' + u.name +
        '</b> \u2014 <b>' + compass16(u.az) + '</b>, <b>' + Math.round(u.alt) + '\u00b0</b></div>').join("");
    } else h = '<div class="ul-title">Niets boven de horizon op dit moment.</div>';
    const extra = [];
    if (w.sun.alt > 0) extra.push("\u2600\uFE0F Zon " + compass16(w.sun.az) + ", " + Math.round(w.sun.alt) + "\u00b0");
    if (w.moon.alt > 0) extra.push("\uD83C\uDF19 Maan " + compass16(w.moon.az) + ", " + Math.round(w.moon.alt) + "\u00b0");
    if (extra.length) h += '<div class="ul-extra">' + extra.join(" \u00b7 ") + '</div>';
    if (w.style === "planet" && w.down.length) h += '<div class="ul-extra">Onder de horizon: ' + w.down.join(", ") + '.</div>';
    if (w.sun.alt > 0) h += '<div class="ul-extra">\u2600\uFE0F Het is dag \u2014 sleep naar de nacht voor wat je echt kunt zien.</div>';
    return h;
  }

  let skyOff = 0;

  function drawAll() {
    const st = HH.state; if (st.lat == null) return;
    const date = new Date(Date.now() + skyOff * 60000);
    const z = drawWheel(date, st.lat, st.lon, skyBodies("zodiac", date, st.lat, st.lon), "sign");
    HH.$("#wheelZ").innerHTML = z.svg; HH.$("#listZ").innerHTML = listHtml(z);
    const p = drawWheel(date, st.lat, st.lon, skyBodies("planet", date, st.lat, st.lon), "planet");
    HH.$("#wheelP").innerHTML = p.svg; HH.$("#listP").innerHTML = listHtml(p);
    const opts = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    HH.$("#skyLabel").innerHTML = (skyOff === 0 ? "<b>nu</b> \u00b7 " : "") + date.toLocaleString("nl-BE", opts);
  }

  function renderSky() {
    const root = HH.$("#sky"); root.innerHTML = "";
    const st = HH.state;
    if (st.lat == null) {
      root.innerHTML = '<div class="sky-empty">Kies eerst een locatie in <b>Heldere Hemel</b> ' +
        '(via de zoekbalk hierboven). De wielen gebruiken dan automatisch die plek.</div>';
      return;
    }
    const wrap = HH.el("div", "sky-wrap");
    wrap.innerHTML =
      '<div class="sky-loc"></div>' +
      '<div class="sky-slider"><div class="ruler">' + timeRuler() + '</div>' +
      '<div class="qbar">' + qualityBar() + '</div>' +
      '<input id="skyTime" type="range" min="-720" max="720" step="5">' +
      '<div class="timeread"><span id="skyLabel"></span><button id="skyNow" class="btn ghost" style="padding:2px 12px">nu</button></div>' +
      '<div class="sky-cap">Kleur op de balk = hemelkwaliteit per uur, zoals in Heldere Hemel.</div></div>' +
      '<div class="sky-grid">' +
        '<div class="sky-card"><div class="sky-h">\u2728 Dierenriem</div><div id="wheelZ" class="sky-wheel"></div><div id="listZ" class="up-list"></div></div>' +
        '<div class="sky-card"><div class="sky-h">\uD83E\uDE90 Planeten</div><div id="wheelP" class="sky-wheel"></div><div id="listP" class="up-list"></div></div>' +
      '</div>' +
      '<div class="guide"><b>Zo lees je het.</b> Je staat in het midden, met de hele hemel om je heen. Het midden = recht boven je (zenit), de rand = de horizon. Elk teken of planeet staat op zijn <b>richting</b> (N boven, O rechts, Z onder, W links) en zijn <b>hoogte</b> (rand 0\u00b0, ringen 30\u00b0 en 60\u00b0, midden 90\u00b0). Draai met je kompas naar die richting en kijk omhoog \u2014 \u00e9\u00e9n vuist op armlengte \u2248 10\u00b0. De gouden boog is de ecliptica; zon, maan, planeten en dierenriem liggen daar altijd langs. Tik op een paars teken in het dierenriem-wiel voor een voorbeeld van het sterrenbeeld. De dierenriem is tropisch (echte sterrenbeelden ~24\u00b0 verschoven door precessie).</div>';
    root.appendChild(wrap);
    wrap.querySelector(".sky-loc").textContent =
      (st.name || "Locatie") + " \u00b7 " + st.lat.toFixed(2) + "\u00b0, " + st.lon.toFixed(2) + "\u00b0";
    const slider = HH.$("#skyTime"); slider.value = skyOff;
    slider.addEventListener("input", (e) => { skyOff = parseInt(e.target.value, 10); drawAll(); });
    HH.$("#skyNow").addEventListener("click", () => { skyOff = 0; slider.value = 0; drawAll(); });
    drawAll();
    HH.$("#wheelZ").addEventListener("click", (e) => {
      const g = e.target.closest("[data-sign]");
      if (g) openConstellation(g.getAttribute("data-sign"));
    });
  }

  HH.renderSky = renderSky;
})();
