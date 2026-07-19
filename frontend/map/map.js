// map.js — kaart initialiseren, centreren, lagen toevoegen. Enige verantwoordelijkheid: renderen.
// De architectuur (welke bron, welke modellen) is al beslist door geo_context.

let _map = null, _layerGroup = null, _legend = null;

function _freshMap(el){
  // Ruim een eventuele vorige kaart op: bij locatie-wisselen krijgt de container een nieuwe
  // node, en een hergebruikte instantie tekent dan in het niets (lege kaart).
  if(_map){ try { _map.remove(); } catch(e){} _map = null; _legend = null; }
  el.innerHTML = "";                       // Leaflet-resten uit de node halen
  _map = L.map(el, { scrollWheelZoom:false, zoomControl:true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12, attribution: "© OpenStreetMap"
  }).addTo(_map);
  _layerGroup = L.layerGroup().addTo(_map);
  return _map;
}

function _revealFix(map){
  // De kaart zit in een uitklap-blok; als de container net zichtbaar wordt moet Leaflet
  // z'n afmetingen opnieuw meten, anders blijft hij grijs/leeg.
  [60, 200, 500].forEach(ms => setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, ms));
}

// Toon de kaart voor een geo_context. lat/lon centreren de kaart op de locatie.
async function showContextMap(elId, ctx, lat, lon){
  const el = document.getElementById(elId);
  if(!el || typeof L === "undefined") return;
  const map = _freshMap(el);
  map.setView([lat, lon], 7);

  const layers = await buildLayers(ctx, lat, lon);
  // volgorde = de vier lagen van onder naar boven
  if(layers.zones){ layers.zones.addTo(_layerGroup); }            // 1+2 officiële zones + kleur
  if(layers.authority){ layers.authority.addTo(_layerGroup); }    // governance-outline
  if(layers.models){ layers.models.addTo(_layerGroup); }          // 3 grof modelvlak (contrast)
  L.marker([lat, lon]).addTo(_layerGroup)                          // 4 mijn locatie
    .bindPopup("📍 " + (ctx.location||"") +
      (layers.myZone ? "<br>Zone: <b>"+layers.myZone.zone+"</b>" : "")).openPopup();

  _addLegend(map, ctx, layers.myZone, layers.zoneType, !!layers.zones, layers.status, layers.liveColors, layers.colorsAt);
  _revealFix(map);
}

function _addLegend(map, ctx, myZone, zoneType, hasZones, status, liveColors, colorsAt){
  if(_legend){ map.removeControl(_legend); }
  _legend = L.control({position:"bottomleft"});
  _legend.onAdd = function(){
    const d = L.DomUtil.create("div","map-legend");
    const TYPE={meteorological:"meteorologische zones",administrative:"bestuurlijke gebieden"};
    const STAT={approximation:"benadering (nog geen officiële weerzones)",
                missing:"nog geen officiële geometrie",derived:"afgeleide geometrie"};
    let zoneLine;
    if(hasZones){
      const extra = (status && status!=="official") ? ` <span class="muted">· ${STAT[status]||status}</span>` : "";
      const kleur = liveColors
        ? `<div class="muted">kleuren: live${colorsAt?" · "+colorsAt.slice(0,16).replace("T"," "):""}</div>`
        : `<div class="muted">waarschuwingskleuren: onbekend — neutraal weergegeven</div>`;
      zoneLine = `<div><span class="lg-sw" style="background:#e7cf4a"></span> Officiële ${TYPE[zoneType]||"zones"}`+
        (ctx.authority&&ctx.authority.provider?` — ${ctx.authority.provider}`:'')+extra+`</div>`+kleur;
    } else {
      zoneLine = `<div class="muted">${STAT[status]||"Nog geen officiële zone-geometrie"} voor dit land — alleen landcontour.</div>`;
    }
    d.innerHTML =
      `<div class="lg-h">Wat zie ik?</div>`+ zoneLine +
      `<div><span class="lg-sw lg-model"></span> Modelcel — berekening (~grof)</div>`+
      `<div>📍 Mijn locatie${myZone?` · zone: <b>${myZone.zone}</b>`:''}</div>`;
    return d;
  };
  _legend.addTo(map);
}
