// layers.js — vertaalt geo_context naar Leaflet-lagen. Beslist NIETS; rendert alleen wat
// geo_context al heeft bepaald (ADR-030, Commit 5).

const AUTHORITY_COLORS = {
  "ARSO": "#2e7d5b", "Protezione Civile": "#b5713a",
  "GeoSphere Austria": "#7a5ea8", "_default": "#888"
};

// Waarschuwingskleuren (officiële niveaus)
const LEVEL_FILL = { green:"#7fae6a", yellow:"#e7cf4a", orange:"#e08a3c", red:"#c0392b" };

// Register van officiële zonebronnen per land (ADR-031); bepaalt welk bestand + zone_type.
let _zoneRegistry = null;
async function _registry(){
  if(_zoneRegistry) return _zoneRegistry;
  try { _zoneRegistry = (await loadGeoJSON("map/data/zone_sources.json")).countries; }
  catch(e){ _zoneRegistry = {}; }
  return _zoneRegistry;
}

// point-in-polygon (ray casting) op [lon,lat]-ringen
function _pointInRing(pt, ring){
  let x=pt[0], y=pt[1], inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function _pointInFeature(lon, lat, geom){
  const polys = geom.type==="Polygon" ? [geom.coordinates] : geom.coordinates;
  for(const poly of polys){
    if(_pointInRing([lon,lat], poly[0])){
      let inHole=false;
      for(let h=1;h<poly.length;h++){ if(_pointInRing([lon,lat], poly[h])){ inHole=true; break; } }
      if(!inHole) return true;
    }
  }
  return false;
}

async function loadGeoJSON(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error("kon " + path + " niet laden");
  return r.json();
}

// Live waarschuwingsniveaus per zone (ADR-032): apart bestand, los van de geometrie.
let _warnStatus = null;
async function _status(){
  if(_warnStatus !== null) return _warnStatus;
  try { _warnStatus = await loadGeoJSON("map/data/warning_status.json"); }
  catch(e){ _warnStatus = {}; }
  return _warnStatus;
}

// Laag 1+2+4: officiële waarschuwingszones, gekleurd op niveau, mijn zone uitgelicht.
async function zonesLayer(ctx, lat, lon){
  const reg = await _registry();
  const entry = reg[ctx.country];
  const status = (entry && entry.geometry_status) || null;
  if(!entry || !entry.file) return { layer:null, myZone:null, zoneType:null, status };
  // Vertrouw niet blind op 'present': controleer of het bestand er ECHT is (overleeft zip-updates).
  let gj;
  try { gj = await loadGeoJSON("map/data/" + entry.file); }
  catch(e){ return { layer:null, myZone:null, zoneType:null, status }; }
  if(!gj || !gj.features || !gj.features.length) return { layer:null, myZone:null, zoneType:null, status };
  // live niveaus: statusbestand overschrijft het (statische) level in de geometrie
  const ws = await _status();
  const zmap = (ws && ws.zones) || {};
  const src = ws && ws.sources && ws.sources[ctx.country];
  const liveOk = !!(src && src.ok);
  const levelOf = f => {
    const p = f.properties;
    return zmap[p.zone_id] || zmap[ctx.country + "-" + p.zone] || p.level || "green";
  };
  let myZone = null;
  for(const f of gj.features){
    if(_pointInFeature(lon, lat, f.geometry)){ myZone = f.properties; break; }
  }
  const layer = L.geoJSON(gj, {
    style: f => {
      const mine = myZone && f.properties.zone === myZone.zone;
      return { color: mine ? "#1b1b1b" : "#5a5148",
               weight: mine ? 3 : 0.6,
               fillColor: LEVEL_FILL[levelOf(f)] || LEVEL_FILL.green,
               fillOpacity: mine ? 0.75 : 0.5 };
    },
    onEachFeature: (f, l) => {
      const mine = myZone && f.properties.zone === myZone.zone;
      l.bindPopup(popupZone({...f.properties, level: levelOf(f)}, mine, ctx, entry.zone_type));
    }
  });
  if(myZone) myZone = {...myZone, level: zmap[myZone.zone_id] || zmap[ctx.country+"-"+myZone.zone] || myZone.level};
  return { layer, myZone, zoneType: entry.zone_type, status: entry.geometry_status,
           liveColors: liveOk, colorsAt: src && src.fetched_at };
}

// Authority-gebied: landgrens met de autoriteitskleur (governance-outline).
async function authorityLayer(ctx){
  const gj = await loadGeoJSON("map/data/authority_regions.geojson");
  const only = { type:"FeatureCollection",
    features: gj.features.filter(f => f.properties.country === ctx.country) };
  const color = AUTHORITY_COLORS[ctx.authority && ctx.authority.provider] || AUTHORITY_COLORS._default;
  return L.geoJSON(only, {
    style: { color, weight: 2.5, fill:false, dashArray:"6 4" },
    onEachFeature: (f, layer) => layer.bindPopup(popupAuthority(ctx, f.properties))
  });
}

// Model-footprints: alleen de modellen die in deze context relevant zijn.
async function modelLayer(ctx){
  const gj = await loadGeoJSON("map/data/model_coverage.geojson");
  const names = new Set((ctx.models || []).map(m => m.name));
  const only = { type:"FeatureCollection",
    features: gj.features.filter(f => names.has(f.properties.name)) };
  return L.geoJSON(only, {
    style: { color:"#3a6ea5", weight:1, dashArray:"4 3", fillColor:"#3a6ea5", fillOpacity:0.05 },
    onEachFeature: (f, layer) => layer.bindPopup(popupModel(f.properties))
  });
}

async function buildLayers(ctx, lat, lon){
  const out = {};
  try { const z = await zonesLayer(ctx, lat, lon); out.zones = z.layer; out.myZone = z.myZone; out.zoneType = z.zoneType; out.status = z.status; out.liveColors = z.liveColors; out.colorsAt = z.colorsAt; }
  catch(e){ out.zones = null; }
  try { out.authority = await authorityLayer(ctx); } catch(e){ out.authority = null; }
  try { out.models = await modelLayer(ctx); } catch(e){ out.models = null; }
  return out;
}
