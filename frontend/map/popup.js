// popup.js — HTML voor de kaart-popups. De trace-popup is de meest onderscheidende laag:
// hij toont WAAROM deze autoriteit bevoegd is (ADR-030).

function popupZone(p, mine, ctx, zoneType){
  const LVL={green:"🟢 geen",yellow:"🟡 geel",orange:"🟠 oranje",red:"🔴 rood"};
  const TYPE={meteorological:"meteorologische zone",administrative:"bestuurlijk gebied"};
  return `<div class="mappop">
    ${mine?'<b>📍 Jouw zone</b><br>':''}
    <b>${p.zone||"zone"}</b>
    <div>Niveau: ${LVL[p.level]||p.level}</div>
    ${zoneType?`<div class="muted">${TYPE[zoneType]||zoneType}</div>`:''}
    ${mine&&ctx&&ctx.authority?`<div>Autoriteit: ${ctx.authority.provider}</div>`:''}
  </div>`;
}

function popupAuthority(ctx, props){
  const a = ctx.authority || {};
  const steps = (ctx.trace || []).map(s => {
    const mark = s.decision === "SELECTED" ? "✔" : "✕";
    const cls = s.decision === "SELECTED" ? "tr-selected" : "tr-rejected";
    return `<div><span class="${cls}">${mark} ${s.provider}</span> <span class="muted">${s.reason}</span></div>`;
  }).join("");
  return `<div class="mappop">
    <b>Waarom deze bron?</b>
    <div>📍 ${ctx.location||""}</div>
    <div>Land: ${props.country}${ctx.region ? " · " + ctx.region : ""}</div>
    <div>Autoriteit: <b>${a.provider || "geen"}</b>${a.confidence ? " ("+a.confidence+")" : ""}</div>
    <hr>${steps}
    ${ctx.note ? '<div class="muted">'+ctx.note+'</div>' : ""}
  </div>`;
}

function popupModel(p){
  return `<div class="mappop">
    <b>${p.name}</b>
    <div>Resolutie: ${p.resolution_km} km</div>
    <div>Raster: ~${p.cell_km2} km²/cel</div>
    <div>Dekking: ${p.coverage}</div>
  </div>`;
}
