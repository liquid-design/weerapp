/* domain.js — domein-switcher (ADR-033): [Weer] | [Heldere Hemel].
 *
 * Weer is de default. Heldere Hemel is een APART beslisdomein: eigen model, GEEN
 * autoriteit (zie ADR-033). Daarom een switcher op niveau boven de tabbladen —
 * niet een achtste tab, want dat zou de twee soorten claims visueel gelijkstellen.
 *
 * HH-scripts laden LAZY bij de eerste activering: lp-data.js is ~1,8 MB en mag
 * geen enkele weer-paginalading vertragen.
 */
(function () {
  "use strict";
  const META = {
    weer:  { t: "🌦️ Weerwijsheid", s: "Ik zie iets → wat betekent het → wat doe ik?" },
    hemel: { t: "✦ Heldere Hemel",  s: "Wanneer is de lucht goed voor sterrenkijken?" }
  };
  // Volgorde = afhankelijkheidsvolgorde uit HH's eigen index.html. Niet husselen.
  const HH_SCRIPTS = ["astro.js", "planets.js", "seeing.js", "lp-data.js", "lightpollution.js",
                      "score.js", "forecast.js", "ui.js", "nearby.js", "sky.js", "theory.js", "app.js"];
  let state = "idle";   // idle | loading | ready | failed

  function hhStatus(msg) {
    const el = document.getElementById("status");
    if (el) el.textContent = msg;
  }

  function loadHH() {
    if (state === "ready" || state === "loading") return;
    state = "loading";
    hhStatus("Heldere Hemel laden…");
    HH_SCRIPTS.reduce((chain, src) => chain.then(() => new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "hemel/" + src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(src));
      document.body.appendChild(el);
    })), Promise.resolve())
      .then(() => { state = "ready"; })
      .catch(err => {
        state = "failed";
        hhStatus("Kon Heldere Hemel niet laden (" + err.message + "). Ververs de pagina.");
      });
  }

  function activate(d) {
    document.querySelectorAll(".domain").forEach(b => b.classList.toggle("active", b.dataset.d === d));
    document.querySelectorAll(".domein").forEach(x => { x.hidden = (x.id !== "domein-" + d); });
    const m = META[d] || META.weer;
    const t = document.getElementById("appTitle"), s = document.getElementById("appSub");
    if (t) t.textContent = m.t;
    if (s) s.textContent = m.s;
    if (d === "hemel") loadHH();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".domain").forEach(b =>
    b.addEventListener("click", () => activate(b.dataset.d)));
})();
