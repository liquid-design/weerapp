/* ===== Weerwijsheid frontend =====
   Live-tab praat met de backend (/api). Leermodules zijn client-side data. */

const LVLTXT = {green:'Rustig',yellow:'Opletten',orange:'Maatregelen',red:'Beoordelen',violet:'Uitwijken'};
const LVLABBR = {green:'g',yellow:'y',orange:'o',red:'r',violet:'p'};

/* ---------- tabs ---------- */
// Gescoped naar het weer-domein (ADR-033): zo kan markup uit Heldere Hemel de
// tabnavigatie nooit kapen, en omgekeerd.
const _weer=document.getElementById('domein-weer')||document;
const tabs=_weer.querySelectorAll('.tab'), panels=_weer.querySelectorAll('.panel');
tabs.forEach(t=>t.addEventListener('click',()=>{
  tabs.forEach(x=>x.classList.toggle('active',x===t));
  panels.forEach(p=>p.classList.toggle('active',p.id===t.dataset.p));
  window.scrollTo({top:0,behavior:'smooth'});
}));

/* ---------- databron-gezondheid (ADR-031) ---------- */
async function checkDataHealth(){
  const el = document.getElementById('dataHealth');
  if(!el) return;
  try{
    const h = await (await fetch('/api/data_health')).json();
    const warns = (h.issues||[]).filter(i=>i.level==='warn');
    if(!warns.length){ el.style.display='none'; return; }
    el.innerHTML = `<b>⚠️ Databron-waarschuwing</b><br>`+
      warns.map(i=>`${i.country?i.country+': ':''}${i.msg}`).join('<br>')+
      `<div class="dh-fix">Herstel: <code>./tools/kickstart.sh</code> of <code>python tools/fetch_boundaries.py all</code></div>`;
    el.style.display='block';
  }catch(e){ el.style.display='none'; }
}

/* ================= LIVE (backend) ================= */
const locSel=document.getElementById('locSel');
const accSel=document.getElementById('accSel');
const liveOut=document.getElementById('liveOut');

async function loadLocations(selectName){
  try{
    const r=await fetch('/api/locations'); const locs=await r.json();
    locSel.innerHTML=locs.map(l=>`<option value="${encodeURIComponent(l.name)}">${l.name}</option>`).join('');
    if(selectName){
      const enc=encodeURIComponent(selectName);
      if([...locSel.options].some(o=>o.value===enc)) locSel.value=enc;
    }
    if(!locs.length){ liveOut.innerHTML=`<p class="muted">Nog geen locaties. Voeg er een toe via ➕.</p>`; return; }
    loadCurrent();
  }catch(e){ liveOut.innerHTML=`<div class="callout">Kon locaties niet laden. Draait de backend?</div>`; }
}
async function loadCurrent(force){
  const loc=locSel.value, acc=accSel.value;
  if(!loc)return;
  liveOut.innerHTML=`<p class="muted">Laden…</p>`;
  try{
    const r=await fetch(`/api/current?location=${loc}&accommodation=${acc}${force?'&force=1':''}`);
    const d=await r.json();
    if(d.error){liveOut.innerHTML=`<div class="callout">${d.error}</div>`;return;}
    renderLive(d);
  }catch(e){ liveOut.innerHTML=`<div class="callout">Fout bij ophalen data.</div>`; }
}
let LAST=null;

async function loadContext(name, trace){
  const body=document.getElementById('whyBody');
  if(!body) return;
  try{
    const ctrl=new AbortController();
    const to=setTimeout(()=>ctrl.abort(), 7000);
    const r=await fetch(`/api/context?location=${encodeURIComponent(name)}`,{signal:ctrl.signal});
    clearTimeout(to);
    const c=await r.json();
    const steps=(c.trace&&c.trace.length?c.trace:trace)||[];
    const chain=`<div class="ctx-chain">📍 ${c.location} → ${c.country||'?'}`+
      (c.region?` → ${c.region}`:'')+
      (c.authority&&c.authority.provider?` → <b>${c.authority.provider}</b> (${c.authority.confidence})`:' → geen bevoegde bron')+`</div>`;
    const rows=steps.map(s=>{
      const mark=s.decision==='SELECTED'?'✔':'✕';
      return `<div class="tr-row"><span class="tr-${s.decision.toLowerCase()}">${mark} ${s.provider}</span> <span class="muted">${s.reason}</span></div>`;
    }).join('');
    const models=(c.models||[]).map(m=>
      `<div class="tr-row">🟦 ${m.name} <span class="muted">${m.coverage} · ${m.resolution_km??'?'} km · ~${m.cell_km2??'?'} km²/cel</span></div>`).join('');
    const note=c.note?`<div class="wstat-r">${c.note}</div>`:'';
    body.innerHTML=chain+rows+(models?`<div class="ctx-h">Modeldekking</div>${models}`:'')+note+
      `<button class="map-toggle" id="mapToggle">🗺️ Toon op kaart</button><div id="ctxMap"></div>`;
    const btn=document.getElementById('mapToggle');
    if(btn) btn.addEventListener('click',()=>{
      const el=document.getElementById('ctxMap');
      el.classList.add('open'); btn.style.display='none';
      const co=(LAST&&LAST.coordinates)||{lat:c.lat,lon:c.lon};
      if(typeof showContextMap==='function') showContextMap('ctxMap', c, co.lat, co.lon);
    });
  }catch(e){ body.textContent='Kon de bron-context niet laden (probeer verversen).'; }
}
const FIELD_ICON={wind_gust:'💨',cape:'⚡',rain_amount:'🌧️',rain_next_hours:'🌦️',temperature:'🌡️',feels_like:'🥵',lightning_distance:'🌩️',air_quality:'🌫️'};
const FIELD_LBL={wind_gust:'Windstoot',cape:'CAPE',rain_amount:'Regen 24u',rain_next_hours:'Regen kort',temperature:'Temp',feels_like:'Voelt als',lightning_distance:'Bliksem',air_quality:'Lucht'};
function confNote(d){
  const low=d.confidence.pct<55;
  const single=(d.factors||[]).some(f=>d.decision.level!=='green' && f.n_sources<2);
  if(!low) return '';
  return single
    ? 'Gebaseerd op één bron — nog niet gekruist. Voeg een 2e forecast-bron toe voor kruiscontrole.'
    : 'Bronnen spreken elkaar tegen — wees voorzichtiger met plannen.';
}
function renderLive(d){
  LAST=d;
  const v=d.verdict, kl=v.klass;
  // 1) BESLISSING bovenaan
  let html=`<div class="verdict ${kl}"><div class="vt">${v.icon} ${v.word}</div>`+
    `<div class="vaction">${d.decision.action}</div></div>`;
  // regio + gebruikte modellen
  if(d.region){
    const terr=(d.region.terrain||[]).join(', ');
    const models=(d.region.models||[]).join(', ');
    const lead=d.region.dominant?` · leidend: ${d.region.dominant}`:'';
    html+=`<div class="region"><span class="r-name">📍 ${d.region.name}</span>`+
      (terr?`<span class="r-terr">${terr}</span>`:'')+
      (models?`<div class="r-models">modellen: ${models}${lead}</div>`:'')+`</div>`;
  }
  // waarschuwing direct onder de beslissing — mobiel: zichtbaar zonder scrollen
  const w=d.warning||{};
  const st=w.status||'';
  const ICON={WARNING:'🚨',SAFE:'✓',UNAVAILABLE:'○',STALE:'⚠️'};
  const LBL={WARNING:'Waarschuwing',SAFE:'Geen waarschuwing',UNAVAILABLE:'Geen bevoegde bron',STALE:'Bron verouderd'};
  if(st){
    const lvl=(w.level&&w.level!=='GREEN')?` · ${w.level}`:'';
    const auth=w.authority?` · ${w.authority}`:'';
    html+=`<div class="wstat wstat-${st.toLowerCase()}">`+
          `<b>${ICON[st]||''} ${LBL[st]||st}</b>${lvl}${auth}`+
          (w.reason?`<div class="wstat-r">${w.reason}</div>`:'')+`</div>`;
    // Waarom deze bron? — de volledige keten (ADR-030 Commit 4): locatie -> land -> regio -> autoriteit -> modellen
    const tr=(d.warning_routing&&d.warning_routing.steps)||[];
    html+=`<details class="why-src" id="whySrc"><summary>Waarom deze bron?</summary><div id="whyBody" class="muted">laden…</div></details>`;
  }
  // 2) ONDERBOUWING
  html+=`<div class="meaning"><div class="k">Waarom?</div><ul class="why">`+
    d.reason.map(r=>`<li>${r.text}</li>`).join('')+`</ul>`;
  const note=confNote(d);
  html+=`<div class="conf"><span class="conf-pct ${d.confidence.label==='hoog'?'g':d.confidence.label==='matig'?'y':'r'}">${d.confidence.pct}%</span>`+
    `<span>advies-vertrouwen (${d.confidence.label})</span></div>`+
    (note?`<div class="conf-note">${note}</div>`:'')+`</div>`;
  // 3) RUWE DATA (factoren met bron + confidence)
  html+=`<div class="meaning"><div class="k">Ruwe data — bron per waarde</div>`;
  html+=(d.factors||[]).map(f=>{
    const ic=FIELD_ICON[f.field]||'•', lb=FIELD_LBL[f.field]||f.field;
    const cc=f.confidence==null?'':(f.confidence>=80?'g':f.confidence>=55?'y':'r');
    const provs=f.sources.map(s=>s.label||s.provider).join(', ');
    const cross=f.n_sources>1?` · ${f.n_sources} bronnen`:'';
    const lead=(f.dominant&&f.n_sources>1)?` · leidend: ${f.dominant}`:'';
    const miss=(f.missing&&f.missing.length)?`<span class="f-miss">ontbreekt: ${f.missing.join(', ')}</span>`:'';
    return `<div class="factor"><div class="f-ic">${ic}</div>`+
      `<div class="f-main"><b>${lb}: ${f.value}${f.unit?' '+f.unit:''}</b>`+
      `<span class="f-src">${provs}${cross}${lead}</span>${miss}</div>`+
      (f.confidence!=null?`<div class="f-conf ${cc}">${f.confidence}%</div>`:'')+`</div>`;
  }).join('');
  html+=`<div class="src" style="margin-top:8px">Bijgewerkt: ${d.timestamp} · cache: ${d.cache}</div></div>`;
  // 4) FEEDBACK (leer-loop)
  html+=`<div class="meaning"><div class="k act">Was dit advies goed?</div><div class="fb" id="fb">`+
    ['perfect','te voorzichtig','te laat','viel mee','erger dan verwacht']
      .map(x=>`<button class="fb-btn" data-f="${x}">${x}</button>`).join('')+
    `</div><div id="fbMsg" class="src"></div></div>`;
  liveOut.innerHTML=html;
  // context laden NADAT #whyBody in de DOM staat (anders is getElementById null)
  if(document.getElementById('whyBody')){
    loadContext(d.location, (d.warning_routing&&d.warning_routing.steps)||[]);
  }
  const fb=document.getElementById('fb');
  if(fb) fb.querySelectorAll('.fb-btn').forEach(b=>b.addEventListener('click',()=>sendFeedback(b.dataset.f)));
}
async function sendFeedback(kind){
  if(!LAST)return;
  const snap={};
  (LAST.factors||[]).forEach(f=>{ if(['wind_gust','cape','rain_amount'].includes(f.field)) snap[f.field]=f.value; });
  try{
    await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({location:LAST.location,level:LAST.decision.level,action:LAST.decision.action,feedback:kind,snapshot:snap})});
    document.getElementById('fbMsg').textContent='Bedankt — genoteerd. Dit helpt de beslisregels bij te stellen.';
    document.querySelectorAll('.fb-btn').forEach(b=>b.disabled=true);
  }catch(e){ document.getElementById('fbMsg').textContent='Kon feedback niet opslaan.'; }
}
locSel.addEventListener('change',()=>loadCurrent());
accSel.addEventListener('change',()=>loadCurrent());
document.getElementById('refreshBtn').addEventListener('click',()=>loadCurrent(true));

/* --- locatie toevoegen (geocoding) & verwijderen --- */
const addBox=document.getElementById('addBox');
const geoQ=document.getElementById('geoQ');
const geoOut=document.getElementById('geoOut');
document.getElementById('addToggle').addEventListener('click',()=>{
  addBox.style.display = addBox.style.display==='none' ? 'block' : 'none';
  if(addBox.style.display==='block') geoQ.focus();
});
async function doGeocode(){
  const q=geoQ.value.trim(); if(!q)return;
  geoOut.innerHTML=`<p class="muted">Zoeken…</p>`;
  try{
    const r=await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const res=await r.json();
    if(res.error){geoOut.innerHTML=`<div class="callout">${res.error}</div>`;return;}
    if(!res.length){geoOut.innerHTML=`<p class="muted">Niets gevonden. Probeer specifieker (plaats + land).</p>`;return;}
    geoOut.innerHTML=res.map((c,i)=>
      `<div class="cand" data-i="${i}"><b>${c.name}</b> <span class="muted">(${c.lat}, ${c.lon})</span><small>${c.display_name}</small></div>`).join('');
    geoOut.querySelectorAll('.cand').forEach(el=>el.addEventListener('click',()=>addLocation(res[+el.dataset.i])));
  }catch(e){ geoOut.innerHTML=`<div class="callout">Zoeken mislukt (netwerk?).</div>`; }
}
async function addLocation(c){
  try{
    const r=await fetch('/api/locations',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:c.name,lat:c.lat,lon:c.lon,country:c.country||''})});
    const d=await r.json();
    if(!d.ok){geoOut.innerHTML=`<div class="callout">Bestaat al of kon niet worden toegevoegd.</div>`;return;}
    addBox.style.display='none'; geoQ.value=''; geoOut.innerHTML='';
    loadLocations(c.name);
  }catch(e){ geoOut.innerHTML=`<div class="callout">Toevoegen mislukt.</div>`; }
}
document.getElementById('geoBtn').addEventListener('click',doGeocode);
geoQ.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();doGeocode();} });
document.getElementById('delBtn').addEventListener('click',async()=>{
  const name=decodeURIComponent(locSel.value||''); if(!name)return;
  if(!confirm(`"${name}" verwijderen?`))return;
  await fetch(`/api/locations/${encodeURIComponent(name)}`,{method:'DELETE'});
  loadLocations();
});
loadLocations();
checkDataHealth();

/* ================= LEERMODULES (client-side) ================= */
const NUMBERS={
  wind:{label:'💨 Wind (windstoten)',unit:'km/u',levels:[
    {c:'g',r:'tot ~50',mean:'Rustig tot matig.',act:'Geniet buiten.'},
    {c:'y',r:'50–62',mean:'Harde wind (Bft 7). Losse spullen waaien weg.',act:'Zet parasol/luifel vast.'},
    {c:'o',r:'62–88',mean:'Stormachtig tot storm (Bft 8–9). Lichte schade.',act:'Verwijder luifel/vouwwanden.'},
    {c:'r',r:'88–117',mean:'Zware storm (Bft 10–11). Bomen ontworteld.',act:'Tent is geen veilige plek — zoek een gebouw/auto.'},
    {c:'p',r:'118+',mean:'Orkaankracht (Bft 12).',act:'Direct naar veilige accommodatie.'}],
    foot:'Beoordeel gevaar op de gusts, niet de gemiddelde wind. 1 kt ≈ 1,85 km/u.'},
  regen:{label:'🌧️ Regen (intensiteit)',unit:'mm/uur',levels:[
    {c:'g',r:'< 2,5',mean:'Lichte regen.',act:'Niets.'},
    {c:'y',r:'2,5–7,6',mean:'Matige regen.',act:'Let op afwatering.'},
    {c:'o',r:'7,6–50',mean:'Zware regen; velden lopen vol.',act:'Niet in laaggelegen kom kamperen.'},
    {c:'r',r:'> 50',mean:'Stortregen; kans op flash floods.',act:'Weg bij beekjes/laagtes; verplaatsing overwegen.'}],
    foot:'Intensiteit zegt meer dan een dagtotaal. 40–80 mm in enkele uren is veel.'},
  cape:{label:'⚡ CAPE (onweersbrandstof)',unit:'J/kg',levels:[
    {c:'g',r:'< 1000',mean:'Weinig energie.',act:'Geniet buiten.'},
    {c:'y',r:'1000–2500',mean:'Gewoon zomeronweer mogelijk.',act:'Hou de radar in de gaten.'},
    {c:'o',r:'2500–4000',mean:'Zware buien, grote hagel mogelijk.',act:'Geen bergwandeling zonder plan B.'},
    {c:'r',r:'> 4000',mean:'Extreem potentieel (supercellen).',act:'Bij waarschuwing: veilige plaats zoeken.'}],
    foot:'CAPE is potentieel, geen garantie. Combineer met radar + bliksem + waarschuwing.'},
  dauwpunt:{label:'💧 Dauwpunt (benauwdheid)',unit:'°C',levels:[
    {c:'g',r:'< 13',mean:'Fris, droge lucht.',act:'Prettig.'},
    {c:'y',r:'13–16',mean:'Aangenaam.',act:'Niets.'},
    {c:'o',r:'16–18',mean:'Licht klam.',act:'Zweterig bij inspanning.'},
    {c:'r',r:'> 18',mean:'Benauwd tot tropisch.',act:'Koelte opzoeken; zwaar slapen.'}],
    foot:'Dauwpunt is een betere benauwdheidsmeter dan relatieve vochtigheid.'},
  temp:{label:'🌡️ Temperatuur',unit:'°C',levels:[
    {c:'g',r:'18–25',mean:'Aangenaam.',act:'Niets.'},
    {c:'y',r:'25–30',mean:'Warm.',act:'Drink extra, zoek schaduw.'},
    {c:'o',r:'30–35',mean:'Heet.',act:'Middaghitte mijden.'},
    {c:'r',r:'> 35',mean:'Zeer heet; hitte-alarm mogelijk.',act:'Inspanning vermijden, koel blijven.'}],
    foot:'Kijk naar "voelt als"; nacht boven 20° = tropennacht.'}
};
const MODELS={
  meerdaags:{pick:'ECMWF',txt:'Betrouwbaarste allrounder voor 3–7 dagen.',act:'Basis voor planning; grote lijn, niet het exacte uur.'},
  morgen:{pick:'ICON-D2 / AROME',txt:'Hoge resolutie (~2 km); ziet kleine onweerscellen.',act:'Voor 12–36 u; combineer met radar.'},
  bergen:{pick:'AROME / ICON-D2',txt:'Fijn genoeg voor dalen en hellingen.',act:'In de Alpen betrouwbaarder dan globale modellen.'},
  twijfel:{pick:'Compare models',txt:'Verschillen = onzekerheid, dat is zelf informatie.',act:'Eensgezind = vertrouw; verschillend = plan B.'}
};
const COUNTRIES={
  be:{flag:'🇧🇪',name:'België — KMI',url:'meteo.be',zones:'per provincie',
    levels:[['y','Geel','Wees waakzaam.'],['o','Oranje','Wees voorbereid; stel verplaatsingen uit.'],['r','Rood','Onderneem actie voor je veiligheid.']],
    camp:'Oranje: luifel weg, plan aanpassen. Rood: stevige accommodatie zoeken.',note:'Meteorologisch criterium (≥65% kans). BE-Alert voor directe berichten.'},
  nl:{flag:'🇳🇱',name:'Nederland — KNMI',url:'knmi.nl',zones:'per provincie',
    levels:[['y','Geel','Wees alert.'],['o','Oranje','Wees voorbereid; mogelijk schade.'],['r','Rood','Weeralarm; onderneem actie.']],
    camp:'Oranje = verblijf beoordelen. Rood = niet in de tent blijven.',note:'Impact is leidend (analyse met crisispartners).'},
  fr:{flag:'🇫🇷',name:'Frankrijk — Météo-France',url:'vigilance.meteofrance.fr',zones:'per département, update 6u & 16u',
    levels:[['y','Jaune','Wees attent.'],['o','Orange','Wees zeer waakzaam.'],['r','Rouge','Absolute waakzaamheid.']],
    camp:'Bij orange horen "bulletins de suivi" met gedragsadvies.',note:'Aparte zones voor kust en bergen.'},
  it:{flag:'🇮🇹',name:'Italië — Protezione Civile',url:'protezionecivile.gov.it',zones:'per zone (158)',
    levels:[['y','Giallo','Lokale problemen mogelijk.'],['o','Arancione','Wijdverspreid; schade waarschijnlijk.'],['r','Rosso','Zeer intens; noodmaatregelen.']],
    camp:'Ook bij geel kan een cel lokaal fel uithalen. Oranje = aanpassen; rood = vermijden.',note:'Onweer max oranje. Meteoalarm = intensiteit, PC = impact.'},
  de:{flag:'🇩🇪',name:'Duitsland — DWD',url:'dwd.de/warnungen',zones:'per Landkreis',
    levels:[['y','Geel (1)','Gevaren mogelijk.'],['o','Oranje (2)','Markant; plaatselijk schade.'],['r','Rood (3)','Unwetter; verspreide schade.'],['p','Violet (4)','Extreem; levensbedreigend.']],
    camp:'Vanaf oranje verblijf beoordelen; rood = veilige plek. WarnWetter-app.',note:'4 stufen + "Vorabinformation".'},
  at:{flag:'🇦🇹',name:'Oostenrijk — GeoSphere',url:'geosphere.at',zones:'per Bezirk',
    levels:[['y','Gelb','Lokaal ongemak.'],['o','Orange','Kan dagelijks leven verstoren.'],['r','Rot','Gevaar; volg Zivilschutz.']],
    camp:'Hoogalpiene regio\'s vallen buiten deze waarschuwingen.',note:'Hitte op gevoelstemperatuur.'},
  si:{flag:'🇸🇮',name:'Slovenië — ARSO',url:'meteo.arso.gov.si',zones:'per regio',
    levels:[['y','Rumeno','Wees alert.'],['o','Oranžno','Gevaarlijk weer mogelijk.'],['r','Rdeče','Hoogste niveau; volg instructies.']],
    camp:'West-Slovenië heeft hoge bliksemdichtheid; onweer frequent in de zomer.',note:'Kleur = verwachte impact.'}
};
const ROUTINE=[
  ['Apple Weather','Snelle blik: temp, "voelt als", regen vandaag.'],
  ['Windy — ECMWF','Trend komende 3–7 dagen.'],
  ['Windy — ICON-D2 / AROME','Detail vandaag/morgen; onweer.'],
  ['Radar','Wat komt er nú aan? (waarneming)'],
  ['Officiële waarschuwing','KMI / KNMI / Protezione Civile — het oordeel.']
];

/* fill selects */
function opt(o){return '<option value="">— Kies —</option>'+Object.keys(o).map(k=>`<option value="${k}">${o[k].label||o[k].name}</option>`).join('');}
document.getElementById('numSel').innerHTML=opt(NUMBERS);
document.getElementById('cnSel').innerHTML='<option value="">— Kies —</option>'+Object.keys(COUNTRIES).map(k=>`<option value="${k}">${COUNTRIES[k].flag} ${COUNTRIES[k].name}</option>`).join('');

/* getallen */
document.getElementById('numSel').addEventListener('change',e=>{
  const n=NUMBERS[e.target.value],out=document.getElementById('numOut');
  if(!n){out.innerHTML='';return;}
  out.innerHTML=`<table><thead><tr><th>Waarde</th><th>Betekenis → actie</th></tr></thead><tbody>`+
    n.levels.map(l=>`<tr class="${l.c}"><td class="val">${l.r}${n.unit?' '+n.unit:''}</td><td><b>${l.mean}</b><br><span class="muted">→ ${l.act}</span></td></tr>`).join('')+
    `</tbody></table><p class="muted">${n.foot}</p>`;
});

/* modellen */
document.getElementById('modSel').addEventListener('change',e=>{
  const m=MODELS[e.target.value],out=document.getElementById('modOut');
  if(!m){out.innerHTML='';return;}
  out.innerHTML=`<div class="meaning"><div class="k">Pak dit</div><div class="v"><span class="pill" style="font-weight:700">${m.pick}</span></div>`+
    `<div class="k">Wat betekent dit?</div><div class="v">${m.txt}</div>`+
    `<div class="k act">Wat doe ik?</div><div class="v">${m.act}</div></div>`;
});

/* landen */
document.getElementById('cnSel').addEventListener('change',e=>{
  const c=COUNTRIES[e.target.value],out=document.getElementById('cnOut');
  if(!c){out.innerHTML='';return;}
  out.innerHTML=`<p class="muted">${c.zones} · <a href="https://${c.url}" target="_blank" rel="noopener">${c.url}</a></p>`+
    `<table><thead><tr><th>Kleur</th><th>Betekenis</th></tr></thead><tbody>`+
    c.levels.map(l=>`<tr class="${l[0]}"><td class="val">${l[1]}</td><td>${l[2]}</td></tr>`).join('')+
    `</tbody></table><div class="meaning"><div class="k act">Wat betekent dit voor kamperen?</div><div class="v">${c.camp}</div>`+
    `<div class="k">Nuance</div><div class="v">${c.note}</div></div>`;
});

/* routine */
document.getElementById('routeList').innerHTML=ROUTINE.map((s,i)=>
  `<div class="route"><div class="n">${i+1}</div><div class="b"><b>${s[0]}</b><span>${s[1]}</span></div></div>`).join('');

/* beslisser (client, spiegelt engine-logica) */
const bIds=['bAcc','bWind','bRain','bStorm'].map(i=>document.getElementById(i));
function bDecide(){
  const acc=bAcc.value,w=+bWind.value,r=+bRain.value,s=+bStorm.value;
  const vuln={tent:1,vouw:.7,caravan:.4,camper:.2}[acc];
  const sev=Math.max(w+(w>=2?vuln*1.5:vuln*.5), r+(r>=2?.5:0), s*1.2);
  let lvl,head,acts;
  if(sev<1){lvl='g';head='Rustig — geniet ervan';acts=['Geen bijzondere maatregelen.'];}
  else if(sev<2){lvl='y';head='Opletten';acts=['Zet losse zaken vast.','Hou de radar in de gaten.'];}
  else if(sev<3){lvl='o';head='Maatregelen nemen';acts=['Verwijder luifel/vouwwanden.','Bij onweer niet in de tent.','Geen laaggelegen kom bij water.'];}
  else if(sev<4){lvl='r';head='Verblijf beoordelen';acts=['Tent is geen veilige plek.','Overweeg uitwijken naar een gebouw.','Vermijd bomen, water, open terrein.'];}
  else{lvl='p';head='Uitwijken';acts=['Verlaat lichte accommodatie.','Zoek een stevig gebouw.','Bij nood 112.'];}
  if(s>=3&&lvl!=='p')acts.unshift('Bliksem dichtbij + waarschuwing: ga nú naar een veilige plek.');
  const keys={g:'green',y:'yellow',o:'orange',r:'red',p:'violet'};
  const bar=Object.keys(LVLTXT).map(k=>`<div class="s-${LVLABBR[k]} ${keys[lvl]===k?'on':''}">${LVLTXT[k]}</div>`).join('');
  document.getElementById('bOut').innerHTML=`<div class="lvlbar">${bar}</div>`+
    `<div class="advice ${lvl}"><div class="lv ${lvl}">${head}</div>`+
    `<div class="src"><b>Wat doe ik?</b><ul>${acts.map(a=>`<li>${a}</li>`).join('')}</ul></div></div>`;
}
bIds.forEach(el=>el.addEventListener('change',bDecide));
bDecide();
