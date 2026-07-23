/*
 * lightpollution.js — schat hemelhelderheid (lichtvervuiling) per locatie.
 *
 * Geen live API en geen 3 GB-wereldatlas: in plaats daarvan een fysisch
 * stadsgloed-model (naar de wet van Walker/Garstang). Elke stad draagt bij
 * aan de kunstmatige hemelhelderheid ~ inwoners × afstand^-2.5. De som over
 * nabije steden geeft een verhouding kunstmatig/natuurlijk, en daaruit
 * volgen SQM (mag/boogsec²), NELM en de Bortle-klasse.
 *
 * Dit is een SCHATTING, geen meting. Voor exacte waarden zou je de
 * Falchi/Lorenz-wereldatlas als lokaal raster kunnen inladen; de rest van
 * de app werkt daar zo mee samen. Kalibratie: Antwerpen ~Bortle 8,
 * donkere Alpen/Cévennes ~Bortle 3, open oceaan ~Bortle 1.
 *
 * Vereist lp-data.js (window.LP_DATA) vóór dit bestand.
 */
(function (global) {
  "use strict";

  const RAD = Math.PI / 180, REARTH = 6371;
  const A = 1.508e-3;     // kalibratieconstante
  const DMIN = 4;         // min. effectieve afstand (km), voorkomt oneindig dichtbij
  const MAXD = 300;       // steden verder weg negeren
  const NAT_SQM = 22.0;   // natuurlijke donkere hemel

  let lons = null, lats = null, pops = null, count = 0;

  function decode() {
    if (lons || !global.LP_DATA) return;
    const bin = atob(global.LP_DATA);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const f = new Float32Array(bytes.buffer);
    count = f.length / 3;
    lons = new Float32Array(count); lats = new Float32Array(count); pops = new Float32Array(count);
    for (let i = 0; i < count; i++) { lons[i] = f[i * 3]; lats[i] = f[i * 3 + 1]; pops[i] = f[i * 3 + 2]; }
    global.LP_DATA = null; // geheugen vrijgeven
  }

  function haversine(la1, lo1, la2, lo2) {
    const dla = (la2 - la1) * RAD, dlo = (lo2 - lo1) * RAD;
    const a = Math.sin(dla / 2) ** 2 +
      Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(dlo / 2) ** 2;
    return 2 * REARTH * Math.asin(Math.sqrt(a));
  }

  // kunstmatig/natuurlijk-verhouding op een punt
  // TODO (voor Fase 3 "beste plek binnen X km"): bij het scoren van veel
  // punten wordt de lus over alle steden binnen 300 km zwaar. Bouw dan een
  // eenvoudige ruimtelijke index (rasterhokjes, bv. cell = floor(lat*2),
  // floor(lon*2), 0,5°) en raadpleeg alleen de relevante hokjes. Voor één
  // locatie is de huidige lineaire scan ruim snel genoeg.
  function ratioAt(lat, lon) {
    decode();
    if (!count) return 0;
    let s = 0;
    const dLatMax = MAXD / 111 + 0.1;
    const dLonMax = MAXD / (111 * Math.max(0.2, Math.cos(lat * RAD))) + 0.1;
    for (let i = 0; i < count; i++) {
      if (Math.abs(lats[i] - lat) > dLatMax) continue;
      if (Math.abs(lons[i] - lon) > dLonMax) continue;
      const d = haversine(lat, lon, lats[i], lons[i]);
      if (d > MAXD) continue;
      s += pops[i] * Math.pow(Math.max(d, DMIN), -2.5);
    }
    return A * s;
  }

  const log10 = (x) => Math.log(x) / Math.LN10;

  // SQM uit verhouding: helderheid = natuurlijk × (1+ratio) → magnituden
  function sqmFromRatio(ratio) { return NAT_SQM - 2.5 * log10(1 + ratio); }

  // NELM (blote-oog grensmagnitude) uit SQM — Unihedron/Schaefer
  function nelmFromSqm(sqm) {
    return 7.93 - 5 * log10(Math.pow(10, 4.316 - sqm / 5) + 1);
  }

  function bortleFromSqm(sqm) {
    const t = [[21.99, 1], [21.89, 2], [21.69, 3], [20.49, 4],
      [19.50, 5], [18.94, 6], [18.38, 7], [17.80, 8]];
    for (const [s, b] of t) if (sqm >= s) return b;
    return 9;
  }

  // vloeiende locatiefactor uit SQM (ankers ~ Bortle-klassen)
  const FPTS = [[22.1, 1.0], [21.99, 1.0], [21.89, 0.97], [21.69, 0.92],
    [20.49, 0.83], [19.50, 0.70], [18.94, 0.55], [18.38, 0.42],
    [17.80, 0.30], [16.0, 0.18]];
  function factorFromSqm(sqm) {
    if (sqm >= FPTS[0][0]) return 1.0;
    if (sqm <= FPTS[FPTS.length - 1][0]) return FPTS[FPTS.length - 1][1];
    for (let i = 0; i < FPTS.length - 1; i++) {
      const [s1, f1] = FPTS[i], [s2, f2] = FPTS[i + 1];
      if (sqm <= s1 && sqm >= s2) {
        const t = (sqm - s1) / (s2 - s1);
        return f1 + t * (f2 - f1);
      }
    }
    return 0.18;
  }

  const LABELS = { 1: "Ongerept donker", 2: "Echt donkere hemel", 3: "Landelijke hemel",
    4: "Landelijk / buitenwijk", 5: "Buitenwijk", 6: "Heldere buitenwijk",
    7: "Stadsrand", 8: "Stadshemel", 9: "Binnenstad" };

  function assess(lat, lon) {
    const ratio = ratioAt(lat, lon);
    const sqm = sqmFromRatio(ratio);
    const bortle = bortleFromSqm(sqm);
    return {
      ratio,
      sqm: Math.round(sqm * 100) / 100,
      nelm: Math.round(nelmFromSqm(sqm) * 10) / 10,
      bortle,
      factor: factorFromSqm(sqm),
      label: LABELS[bortle],
    };
  }

  const DEG = 180 / Math.PI;
  function bearingDeg(la1, lo1, la2, lo2) {
    const y = Math.sin((lo2 - lo1) * RAD) * Math.cos(la2 * RAD);
    const x = Math.cos(la1 * RAD) * Math.sin(la2 * RAD) -
      Math.sin(la1 * RAD) * Math.cos(la2 * RAD) * Math.cos((lo2 - lo1) * RAD);
    return (Math.atan2(y, x) * DEG + 360) % 360;
  }

  // Kandidaat-plekken binnen een straal: echte dorpen/plaatsen uit de
  // stedendata (dus bereikbaar over de weg). Voor de "beste hemel in de
  // buurt"-functie. minPop/maxPop houdt het bij dorpen/kleine plaatsen.
  function placesWithin(lat, lon, radiusKm, opts) {
    decode();
    opts = opts || {};
    const minPop = opts.minPop != null ? opts.minPop : 800;
    const maxPop = opts.maxPop != null ? opts.maxPop : 25000;
    const dLat = radiusKm / 111 + 0.05;
    const dLon = radiusKm / (111 * Math.max(0.2, Math.cos(lat * RAD))) + 0.05;
    const out = [];
    for (let i = 0; i < count; i++) {
      if (Math.abs(lats[i] - lat) > dLat) continue;
      if (Math.abs(lons[i] - lon) > dLon) continue;
      if (pops[i] < minPop || pops[i] > maxPop) continue;
      const km = haversine(lat, lon, lats[i], lons[i]);
      if (km > radiusKm || km < 4) continue; // sla de eigen omgeving over
      out.push({ lat: lats[i], lon: lons[i], pop: pops[i], km, bearing: bearingDeg(lat, lon, lats[i], lons[i]) });
    }
    return out;
  }

  global.LightPollution = { assess, placesWithin };
})(window);
