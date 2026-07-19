/* ===== Theorie: menselijke vraag -> visueel model -> fysica (inklapbaar) ===== */

/* ---- fysica-formules (voor de interactieve tool) ---- */
function vaporPressure(T, RH){ return (RH/100) * 6.105 * Math.exp(17.27*T/(237.7+T)); }
function apparentTemp(T, RH, windKmh){
  const e = vaporPressure(T, RH); const ws = windKmh/3.6;
  return T + 0.33*e - 0.70*ws - 4.00;
}
function atColor(at){
  if(at<0) return '#3b6ea5'; if(at<10) return '#5b8fb0'; if(at<18) return '#6fae9a';
  if(at<24) return '#8aa06a'; if(at<28) return '#cca63e'; if(at<32) return '#cd8646';
  if(at<38) return '#c25a48'; return '#8a2f22';
}
function gaugeSVG(at){
  const min=-10,max=45,W=320,H=54,x=v=>((v-min)/(max-min))*W, px=Math.max(0,Math.min(W,x(at)));
  const stops=[[-10,'#3b6ea5'],[0,'#5b8fb0'],[10,'#6fae9a'],[21,'#8aa06a'],[27,'#cca63e'],[32,'#cd8646'],[38,'#c25a48'],[45,'#8a2f22']];
  const grad=stops.map(s=>`<stop offset="${((s[0]-min)/(max-min)*100).toFixed(1)}%" stop-color="${s[1]}"/>`).join('');
  const ticks=[-10,0,10,20,30,40].map(t=>`<text x="${x(t)}" y="${H-2}" font-size="9" fill="#8c8272" text-anchor="middle">${t}°</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img"><defs><linearGradient id="gg" x1="0" x2="1">${grad}</linearGradient></defs>
    <rect x="0" y="8" width="${W}" height="16" rx="8" fill="url(#gg)"/>
    <polygon points="${px-6},4 ${px+6},4 ${px},14" fill="#40392d"/>
    <line x1="${px}" y1="8" x2="${px}" y2="24" stroke="#40392d" stroke-width="2"/>${ticks}</svg>`;
}

/* ---- statische SVG-diagrammen ---- */
const SVG = {
  pipeline: `<svg viewBox="0 0 300 250" role="img">
    ${[['Echte atmosfeer','#eef3e6'],['Sensoren: satelliet · station · ballon · radar','#eef3e6'],
       ['Data-assimilatie — "beste gok nu"','#f4ecd2'],['Numeriek model — rooster + fysica','#f6e7d5'],
       ['Voorspelling — uur 1 … dag 10','#e6eef2']].map((b,i)=>{
      const y=8+i*49; return `<rect x="24" y="${y}" width="252" height="36" rx="8" fill="${b[1]}" stroke="#e4dac6"/>
        <text x="150" y="${y+22}" font-size="10.5" fill="#40392d" text-anchor="middle">${b[0]}</text>
        ${i<4?`<line x1="150" y1="${y+36}" x2="150" y2="${y+49}" stroke="#b5713a" stroke-width="2" marker-end="url(#pa)"/>`:''}`;
    }).join('')}
    <defs><marker id="pa" markerWidth="8" markerHeight="8" refX="4" refY="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b5713a"/></marker></defs>
  </svg>`,

  atmosphere: `<svg viewBox="0 0 300 150" role="img">
    <defs><linearGradient id="atm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#cfe0ef"/><stop offset="100%" stop-color="#f3e7cf"/></linearGradient></defs>
    <rect x="20" y="15" width="260" height="115" fill="url(#atm)" stroke="#e4dac6"/>
    <circle cx="255" cy="34" r="10" fill="#e8c74a"/>
    <path d="M60,128 q10,-40 22,-60 q10,-18 20,10 q8,20 20,-30" fill="none" stroke="#b5713a" stroke-width="2" marker-end="url(#up)"/>
    <text x="34" y="30" font-size="9" fill="#3b6ea5">koud · lage druk</text>
    <text x="34" y="122" font-size="9" fill="#9d3c2d">warm · hoge druk</text>
    <text x="150" y="70" font-size="9.5" fill="#40392d" text-anchor="middle">warme lucht stijgt, koelt af</text>
    <defs><marker id="up" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b5713a"/></marker></defs>
  </svg>`,

  zoomReal: `<svg viewBox="0 0 300 120" role="img">
    <rect x="10" y="12" width="280" height="96" rx="8" fill="#eef3e6" stroke="#e4dac6"/>
    <circle cx="70" cy="55" r="4" fill="#40392d"/><text x="70" y="44" font-size="10" fill="#40392d" text-anchor="middle">Antwerpen</text>
    <text x="70" y="74" font-size="16" text-anchor="middle">☀️</text>
    <circle cx="215" cy="70" r="4" fill="#40392d"/><text x="215" y="59" font-size="10" fill="#40392d" text-anchor="middle">Mechelen</text>
    <text x="215" y="90" font-size="16" text-anchor="middle">⛈️</text>
    <line x1="74" y1="55" x2="211" y2="70" stroke="#b5713a" stroke-dasharray="3 3"/>
    <text x="150" y="55" font-size="9" fill="#8c8272" text-anchor="middle">± 20 km</text>
  </svg>`,

  cellsGrid: `<svg viewBox="0 0 300 150" role="img">
    ${(()=>{ let s='';
      const panels=[['2 km · ~715 cellen',2,0],['10 km · ~29',10,52],['20 km · ~7',20,100]];
      panels.forEach((p,pi)=>{
        const y=p[2], boxW=86, boxH=42, ox=8;
        // teken een provincie-rechthoek en vul met rasters op schaal
        const nx = p[1]===2?8 : p[1]===10?4 : 2;
        const ny = p[1]===2?4 : p[1]===10?2 : 1;
        const cw=boxW/nx, ch=boxH/ny;
        s+=`<text x="${ox}" y="${y+11}" font-size="9.5" fill="#40392d">${p[0]}</text>`;
        for(let ix=0;ix<nx;ix++)for(let iy=0;iy<ny;iy++)
          s+=`<rect x="${ox+ix*cw}" y="${y+15+iy*ch}" width="${cw}" height="${ch}" fill="#f4ecd2" stroke="#cd8646" stroke-width="0.7"/>`;
        s+=`<rect x="${ox}" y="${y+15}" width="${boxW}" height="${boxH}" fill="none" stroke="#8c8272" stroke-width="1.2"/>`;
        s+=`<text x="${ox+boxW+10}" y="${y+40}" font-size="9" fill="#8c8272">provincie Antwerpen</text>`;
      });
      return s; })()}
  </svg>`,

  grid: `<svg viewBox="0 0 320 120" role="img">
    <defs><radialGradient id="cell" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#c25a48"/><stop offset="55%" stop-color="#cd8646"/>
      <stop offset="100%" stop-color="#cca63e" stop-opacity="0"/></radialGradient></defs>
    ${[0,110,220].map((ox,i)=>{
      const step=[8,20,40][i], label=['2 km','10 km','20 km'][i];
      let cells='';
      for(let gx=0;gx<90;gx+=step) for(let gy=18;gy<95;gy+=step)
        cells+=`<rect x="${ox+gx}" y="${gy}" width="${step}" height="${step}" fill="none" stroke="#c9bfa8" stroke-width="0.6"/>`;
      let res='';
      if(i>0){for(let gx=0;gx<90;gx+=step) for(let gy=18;gy<95;gy+=step){
        const cx=ox+gx+step/2, cy=gy+step/2, dx=cx-(ox+45), dy=cy-56;
        if(Math.sqrt(dx*dx+dy*dy)<22) res+=`<rect x="${ox+gx}" y="${gy}" width="${step}" height="${step}" fill="#cd8646" opacity="0.28"/>`;}}
      return `<ellipse cx="${ox+45}" cy="56" rx="24" ry="20" fill="url(#cell)"/>${res}${cells}
        <text x="${ox+45}" y="14" font-size="10" fill="#40392d" text-anchor="middle" font-weight="700">${label}</text>
        <text x="${ox+45}" y="112" font-size="8.5" fill="#8c8272" text-anchor="middle">${['scherp','afgezwakt','uitgesmeerd'][i]}</text>`;
    }).join('')}
  </svg>`,

  region: `<svg viewBox="0 0 320 150" role="img">
    <polygon points="20,20 300,30 290,130 40,120" fill="#cca63e" opacity="0.28" stroke="#b8960b" stroke-width="1.5"/>
    <text x="160" y="46" font-size="11" fill="#8a6a15" text-anchor="middle">Waarschuwing: hele regio</text>
    <text x="70" y="70" font-size="14">☀️</text><text x="230" y="70" font-size="14">☀️</text>
    <ellipse cx="150" cy="92" rx="18" ry="14" fill="#c25a48"/><text x="150" y="96" font-size="8" fill="#fff" text-anchor="middle">⚡ cel</text>
    <text x="160" y="124" font-size="9.5" fill="#40392d" text-anchor="middle">risicogebied ≠ lokale garantie</text>
  </svg>`,

  fan: `<svg viewBox="0 0 300 150" role="img">
    <polygon points="45,75 280,26 280,124" fill="#cd8646" opacity="0.14"/>
    ${[26,44,62,88,108,124].map(y=>`<path d="M45,75 Q170,${(75+y)/2} 280,${y}" fill="none" stroke="#cdbfa2" stroke-width="1"/>`).join('')}
    <path d="M45,75 Q170,74 280,72" fill="none" stroke="#b5713a" stroke-width="2.5"/>
    <circle cx="45" cy="75" r="4" fill="#40392d"/>
    <line x1="45" y1="15" x2="45" y2="140" stroke="#e4dac6"/><line x1="280" y1="15" x2="280" y2="140" stroke="#e4dac6"/>
    <text x="45" y="147" font-size="9" fill="#8c8272" text-anchor="middle">nu</text>
    <text x="280" y="147" font-size="9" fill="#8c8272" text-anchor="middle">dag 7</text>
    <text x="150" y="70" font-size="9.5" fill="#b5713a" text-anchor="middle">gemiddelde</text>
    <text x="235" y="20" font-size="9" fill="#8c8272">onzekerheids­waaier</text>
  </svg>`,

  body: `<svg viewBox="0 0 300 175" role="img">
    <rect x="115" y="62" width="70" height="66" rx="12" fill="#f6e7d5" stroke="#cd8646"/>
    <text x="150" y="92" font-size="10" fill="#40392d" text-anchor="middle">LICHAAM</text>
    <text x="150" y="106" font-size="9" fill="#8c8272" text-anchor="middle">~37 °C</text>
    <circle cx="150" cy="20" r="9" fill="#e8c74a"/>
    <line x1="150" y1="30" x2="150" y2="58" stroke="#cca63e" stroke-width="2" marker-end="url(#bd)"/>
    <text x="196" y="42" font-size="9" fill="#8a6a15">straling (warmt op)</text>
    <line x1="55" y1="95" x2="110" y2="95" stroke="#3b6ea5" stroke-width="2" marker-end="url(#bd2)"/>
    <text x="30" y="112" font-size="9" fill="#3b6ea5">wind →</text>
    <text x="24" y="124" font-size="8.5" fill="#8c8272">convectie (koelt)</text>
    <line x1="160" y1="60" x2="168" y2="40" stroke="#6fae9a" stroke-width="2" marker-end="url(#bd3)"/>
    <line x1="150" y1="60" x2="150" y2="42" stroke="#6fae9a" stroke-width="2" marker-end="url(#bd3)"/>
    <text x="176" y="52" font-size="9" fill="#4f6d3a">verdamping</text>
    <text x="150" y="150" font-size="9" fill="#8c8272" text-anchor="middle">vocht hoog → verdamping stokt → koeling faalt</text>
    <defs>
      <marker id="bd" markerWidth="8" markerHeight="8" refX="4" refY="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#cca63e"/></marker>
      <marker id="bd2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#3b6ea5"/></marker>
      <marker id="bd3" markerWidth="8" markerHeight="8" refX="4" refY="2" orient="auto"><path d="M0,8 L4,0 L8,8 z" fill="#6fae9a"/></marker>
    </defs>
  </svg>`,

  parcel: `<svg viewBox="0 0 300 180" role="img">
    <line x1="40" y1="160" x2="40" y2="15" stroke="#8c8272"/><line x1="40" y1="160" x2="285" y2="160" stroke="#8c8272"/>
    <text x="12" y="90" font-size="10" fill="#8c8272" transform="rotate(-90 12,90)">hoogte →</text>
    <text x="150" y="176" font-size="10" fill="#8c8272" text-anchor="middle">temperatuur →</text>
    <path d="M110,160 L150,95 L185,25" fill="none" stroke="#3b6ea5" stroke-width="2"/><text x="190" y="26" font-size="9" fill="#3b6ea5">omgeving</text>
    <path d="M110,160 L165,95 L235,25" fill="none" stroke="#c25a48" stroke-width="2" stroke-dasharray="4 3"/><text x="236" y="34" font-size="9" fill="#c25a48">pakket</text>
    <path d="M150,95 L165,95 L235,25 L185,25 Z" fill="#c25a48" opacity="0.18"/><text x="205" y="70" font-size="10" fill="#9d3c2d" font-weight="700">CAPE</text>
    <path d="M110,160 L150,95 L165,95 Z" fill="#3b6ea5" opacity="0.18"/><text x="126" y="150" font-size="8" fill="#3b6ea5">CIN</text>
  </svg>`,

  isobar: `<svg viewBox="0 0 300 160" role="img">
    ${[30,60,90,120,150].map((y,i)=>`<line x1="20" y1="${y}" x2="200" y2="${y-10}" stroke="#6fae9a" stroke-width="1.4"/>
      <text x="205" y="${y-8}" font-size="9" fill="#4f6d3a">${1008+i*4}</text>`).join('')}
    <line x1="70" y1="150" x2="70" y2="35" stroke="#c25a48" stroke-width="2" marker-end="url(#ia)"/>
    <text x="46" y="96" font-size="9" fill="#9d3c2d" transform="rotate(-90 46,96)">gradiënt</text>
    <line x1="120" y1="95" x2="230" y2="83" stroke="#40392d" stroke-width="2.5" marker-end="url(#ia2)"/>
    <text x="176" y="78" font-size="9" fill="#40392d">wind (geostrofisch)</text>
    <defs><marker id="ia" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#c25a48"/></marker>
      <marker id="ia2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#40392d"/></marker></defs>
    <text x="150" y="152" font-size="9.5" fill="#8c8272" text-anchor="middle">dicht opeen = harde wind</text>
  </svg>`,

  hydration: `<svg viewBox="0 0 300 170" role="img">
    <line x1="38" y1="140" x2="290" y2="140" stroke="#8c8272"/><line x1="38" y1="20" x2="38" y2="140" stroke="#8c8272"/>
    ${[['21°',2.0,'#8aa06a'],['25°',2.4,'#cca63e'],['30°',3.0,'#cd8646'],['35°',3.8,'#c25a48'],['40°',4.6,'#8a2f22']].map((b,i)=>{
      const h=b[1]/5*110, x=55+i*48, y=140-h;
      return `<rect x="${x}" y="${y}" width="30" height="${h}" rx="3" fill="${b[2]}"/>
        <text x="${x+15}" y="${y-4}" font-size="9" fill="#40392d" text-anchor="middle">~${b[1]} L</text>
        <text x="${x+15}" y="152" font-size="9" fill="#8c8272" text-anchor="middle">${b[0]}</text>`;}).join('')}
    <text x="20" y="80" font-size="9" fill="#8c8272" transform="rotate(-90 20,80)">L/dag (rust)</text>
  </svg>`
};

const FX = (inner)=>`<details class="depth"><summary>Voor de liefhebber — de fysica</summary>${inner}</details>`;

/* ---- hoofdstukken: menselijke vraag -> visueel -> (kort) -> fysica inklapbaar ---- */
const CHAPTERS = [
{ id:'hoe', title:'1 · Hoe weet een computer het weer?', html:`
  <h2>Hoe weet een computer wat het weer wordt?</h2>
  <p>Niet door in een glazen bol te kijken, maar door de echte atmosfeer te <b>meten</b>, daaruit een "beste gok van nu" te maken, en die vooruit te rekenen.</p>
  <div class="dgm">${SVG.pipeline}</div>
  <p class="dgm-cap">Van werkelijkheid naar verwachting. Elke stap voegt kennis toe — en een beetje onzekerheid.</p>
  <p>De grap: het model voorspelt niet "de waarheid", het rekent de atmosfeer uit die past binnen zijn metingen en zijn rooster. Wat er in die middelste doos gebeurt, zie je in de volgende hoofdstukken.</p>
  ${FX(`<p>Het model lost de <b>primitieve vergelijkingen</b> op: Navier-Stokes-impuls op een roterende bol (Coriolis), continuïteit (massabehoud), de eerste hoofdwet (energie) en een vochtbudget. Ruimte wordt een 3D-rooster, tijd stapjes Δt. De <b>CFL-voorwaarde</b> (Δt ≲ Δx/c) koppelt tijdstap aan roosterafstand; halveer je Δx, dan schalen de rekenkosten ruwweg met Δx⁻⁴.</p>`)}
`},
{ id:'vloeistof', title:'2 · De atmosfeer als vloeistof', html:`
  <h2>De atmosfeer is een bewegende vloeistof</h2>
  <p>Weer is in de kern een dunne laag gas die stroomt, opwarmt, afkoelt en vocht rondsleept. Vier grootheden beschrijven de toestand: <b>temperatuur</b>, <b>druk</b>, <b>vocht</b> en <b>beweging</b> (wind).</p>
  <div class="dgm">${SVG.atmosphere}</div>
  <p class="dgm-cap">Warme lucht is lichter, stijgt en koelt af; koude lucht zakt. Dat verticale spel drijft wolken, buien en wind.</p>
  <p>Alles wat volgt — waarom het waait, waarom wolken ontstaan, waarom 30° soms als 40° voelt — is een gevolg van hoe deze vier grootheden op elkaar inwerken.</p>
`},
{ id:'schaal', title:'3 · Welke schaal ziet het model?', html:`
  <h2>Welke schaal "ziet" het model eigenlijk?</h2>
  <p>Mensen gooien drie totaal verschillende dingen op één hoop: de <b>modelcel</b> (rekeneenheid), het <b>waarschuwingsgebied</b> (kansgebied) en je <b>app-locatie</b> (één punt). Dat verklaart bijna elke "de app zei regen maar mijn straat bleef droog".</p>
  <h4>De echte wereld: 20 km voelt als "hetzelfde weer"</h4>
  <div class="dgm">${SVG.zoomReal}</div>
  <p class="dgm-cap">Antwerpen en Mechelen liggen ~20 km uit elkaar. Voor jou bijna hetzelfde — voor de atmosfeer soms zon vs. onweer.</p>
  <h4>Hoeveel modelcellen passen in provincie Antwerpen?</h4>
  <div class="dgm">${SVG.cellsGrid}</div>
  <p class="dgm-cap">Provincie ≈ 2860 km². Bij 2 km ≈ 715 cellen, bij 10 km ≈ 29, bij 20 km ≈ 7. Grover rooster = het model middelt over een steeds groter gebied.</p>
  <p>Een 10 km-model dat "regen" zegt, bedoelt eigenlijk: <i>gemiddeld in dit blok van 100 km² verwacht ik neerslag</i> — niet "in jouw straat valt regen".</p>
  <div class="callout why">Drie schalen, drie betekenissen:<br><b>Waarschuwing</b> = kansgebied · <b>Modelcel</b> = rekeneenheid · <b>Buiencel</b> = het echte fysische verschijnsel (soms maar 10 km breed, 30 min actief).</div>
  <h4>Waarom kan mijn buurman ander weer hebben?</h4>
  <p>Schuif de afstand en zie het typische verschil:</p>
  <input class="rng" id="sD" type="range" min="0" max="3" value="1">
  <div class="slabel"><span id="dLbl">5–20 km</span><span id="dTag"></span></div>
  <div class="atbox"><div class="atval" id="dVal" style="font-size:18px"></div><div class="src" id="dEx"></div></div>
`, init:(root)=>{
  const D=root.querySelector('#sD');
  const rows=[
    {lbl:'0–1 km · zelfde tuin', tag:'identiek', val:'bijna exact hetzelfde weer', ex:'Binnen een modelcel; alleen microverschillen (schaduw, muur, plas).'},
    {lbl:'5–20 km · stad↔stad', tag:'kan verschillen', val:'buien kunnen totaal verschillen', ex:'Antwerpen zon, Mechelen onweer — beide soms in dezelfde 10 km-cel, dus "gemiddeld" klopt en lokaal niet.'},
    {lbl:'50–100 km · regio', tag:'vaak anders', val:'goed kans op heel ander weer', ex:'Andere modelcellen, ander frontgedrag; hier verschillen modellen ook onderling meer.'},
    {lbl:'provincie · groot', tag:'gemiddelde', val:'de waarschuwing dekt het hele gebied', ex:'Eén kleur voor tientallen cellen: een kansgebied, geen lokale garantie.'},
  ];
  function upd(){
    const r=rows[+D.value];
    root.querySelector('#dLbl').textContent=r.lbl;
    root.querySelector('#dTag').textContent=r.tag;
    root.querySelector('#dVal').textContent=r.val;
    root.querySelector('#dEx').textContent=r.ex;
  }
  D.addEventListener('input',upd); upd();
}},
{ id:'rooster', title:'4 · Waarom een rooster?', html:`
  <h2>Waarom modellen een rooster gebruiken</h2>
  <p>De computer kan niet elk luchtdeeltje volgen, dus deelt hij de lucht op in blokjes. Alles kleiner dan een paar blokjes <b>bestaat niet</b> voor het model — het wordt uitgesmeerd. Dat is geen fout, het is informatieverlies door resolutie.</p>
  <div class="dgm">${SVG.grid}</div>
  <p class="dgm-cap">Dezelfde onweerscel in 2 / 10 / 20 km. Fijn rooster = scherp; grof rooster = de piek verdwijnt.</p>
  <div class="callout why"><b>De les:</b> een model voorspelt niet "de waarheid", maar de atmosfeer die binnen zijn resolutie past. Voor een lokale bui in de bergen wil je dus een fijnmazig model (AROME, ICON-D2), niet een globaal.</div>
`},
{ id:'onzeker', title:'5 · Waarom verandert de verwachting?', html:`
  <h2>Waarom voorspellingen onzeker worden</h2>
  <p>"Morgen regen" en dan toch niet — dat komt zelden doordat het model slecht is. Het komt door <b>chaos</b>: een minuscuul verschil in de startmeting groeit razendsnel uit tot een heel ander scenario.</p>
  <div class="dgm">${SVG.fan}</div>
  <p class="dgm-cap">Vanaf "nu" waaieren mogelijke toekomsten uiteen. Dichtbij smal (zeker), ver weg breed (onzeker).</p>
  <p>Daarom draaien weerdiensten een <b>ensemble</b>: tientallen runs met piepkleine startverschillen. Liggen de uitkomsten dicht bij elkaar → betrouwbaar. Lopen ze uiteen → onzeker, plan met een plan B.</p>
  <div class="callout tip"><b>Zo werkt jouw dashboard ook:</b> meerdere onafhankelijke bronnen die het eens zijn = smalle waaier = hoge confidence. Spreken ze elkaar tegen = brede waaier = lage confidence.</div>
  ${FX(`<p>Chaos in de zin van Lorenz (1963): het systeem is deterministisch maar gevoelig voor beginvoorwaarden; fouten groeien exponentieel met een eindige "predictability horizon" van ruwweg 7–10 dagen. Het ensemble bemonstert de onzekerheid in de begintoestand en de modelfysica.</p>`)}
`},
{ id:'gevoel', title:'6 · Waarom voelt 30° als 40°?', html:`
  <h2>Waarom voelt 30 °C soms als 40 °C?</h2>
  <p>Omdat je lichaam een <b>warmtemachine</b> is: het produceert constant warmte en moet die kwijt. Hoe makkelijk dat lukt, hangt van drie dingen af.</p>
  <div class="dgm">${SVG.body}</div>
  <p class="dgm-cap">Zon warmt op; wind koelt (convectie); zweet koelt door te verdampen — maar alleen als de lucht het vocht aankan.</p>
  <ul>
    <li><b>Temperatuur</b> — hoe warm de lucht om je heen al is.</li>
    <li><b>Vocht</b> — bepaalt of je zweet nog kán verdampen. Hoog vocht → koeling stokt → voelt heter.</li>
    <li><b>Wind</b> — voert warmte af (convectie) → voelt koeler.</li>
  </ul>
  <p>Speel er zelf mee — schuif en zie het gevoel veranderen:</p>
  <div class="slabel"><span>Temperatuur</span><span id="lT">28 °C</span></div><input class="rng" id="sT" type="range" min="-10" max="45" value="28">
  <div class="slabel"><span>Relatieve vochtigheid</span><span id="lH">50 %</span></div><input class="rng" id="sH" type="range" min="0" max="100" value="50">
  <div class="slabel"><span>Wind</span><span id="lW">10 km/u</span></div><input class="rng" id="sW" type="range" min="0" max="60" value="10">
  <div class="atbox"><div class="atval" id="atVal">—</div><div id="atLbl" class="muted"></div><div id="gaugeWrap"></div><div class="src" id="eVal"></div></div>
  ${FX(`<p style="text-align:center;font-family:monospace;font-size:13px">AT = T + 0.33·e − 0.70·v − 4.0</p><p>Steadman's schijnbare temperatuur: e = dampdruk (hPa) uit RV via Magnus, v = wind (m/s). In het hitteregime nadert dit de heat index (T, RH); in het kouderegime de windchill (T, wind).</p>`)}
`, init:(root)=>{
  const T=root.querySelector('#sT'), H=root.querySelector('#sH'), W=root.querySelector('#sW');
  function upd(){
    const t=+T.value,h=+H.value,w=+W.value;
    root.querySelector('#lT').textContent=t+' °C'; root.querySelector('#lH').textContent=h+' %'; root.querySelector('#lW').textContent=w+' km/u';
    const at=apparentTemp(t,h,w), e=vaporPressure(t,h), col=atColor(at);
    const v=root.querySelector('#atVal'); v.textContent='voelt als '+at.toFixed(1)+' °C'; v.style.color=col;
    let reg='vocht en wind vrijwel in balans';
    if(t>=27&&h>=50) reg='warm + vochtig → verdamping stokt (voelt warmer)';
    else if(t<=10&&w>15) reg='koud + wind → convectie domineert (voelt kouder)';
    root.querySelector('#atLbl').textContent=reg;
    root.querySelector('#gaugeWrap').innerHTML=gaugeSVG(at);
    root.querySelector('#eVal').textContent='dampdruk e = '+e.toFixed(1)+' hPa · verschil met echte temp: '+(at-t>=0?'+':'')+(at-t).toFixed(1)+' °C';
  }
  [T,H,W].forEach(el=>el.addEventListener('input',upd)); upd();
}},
{ id:'wolken', title:'7 · Waarom ontstaan wolken & onweer?', html:`
  <h2>Waarom ontstaan wolken en onweer?</h2>
  <p>Warme lucht stijgt en koelt af. Op een bepaalde hoogte bereikt ze het <b>dauwpunt</b>: het vocht kan niet meer als damp blijven en condenseert tot een wolk. Blijft het opstijgende pakket wármer dan zijn omgeving, dan tornt het almaar door — en krijg je onweer.</p>
  <div class="dgm">${SVG.parcel}</div>
  <p class="dgm-cap">Zolang het pakket (rood) warmer is dan de omgeving (blauw), stijgt het door. Die oppervlakte is CAPE — de onweersbrandstof.</p>
  <p><b>Dauwpunt</b> zegt hoe snel condensatie begint; <b>CAPE</b> hoe hard het pakket kan doorstijgen. Hoge CAPE → krachtige stijgstromen → grote hagel en zware buien. Maar er is een trigger nodig (een front, opwarming) om de "deksel" (CIN) te doorbreken — hoge CAPE alleen is geen garantie.</p>
  ${FX(`<p>Verzadigingsdampdruk volgt Clausius-Clapeyron (Magnus: eₛ ≈ 6.11·exp(17.27T/(237.7+T))) — exponentieel, dus elke +10 °C bijna een verdubbeling van het vochtplafond. Daarom is dauwpunt een absolute vochtmaat en RV niet. Maximale stijgsnelheid w ≈ √(2·CAPE): 2500 J/kg ⇒ ~70 m/s theoretisch (in de praktijk minder door menging).</p>`)}
`},
{ id:'wind', title:'8 · Waarom waait het?', html:`
  <h2>Waarom waait het?</h2>
  <p>Wind is lucht die van hoge naar lage druk stroomt. Hoe groter het drukverschil over een afstand, hoe harder het waait. Op de draaiende aarde buigt de stroming af (Coriolis) en gaat de wind uiteindelijk vrijwel <i>langs</i> de drukverschillen lopen.</p>
  <div class="dgm">${SVG.isobar}</div>
  <p class="dgm-cap">Isobaren = lijnen van gelijke druk. Dicht opeen = sterk drukverschil = harde wind.</p>
  <p>Een snel <b>dalende</b> druk betekent dat een systeem nadert — vaak wind en regen. De verandering (tendens) zegt meer dan de absolute waarde.</p>
  ${FX(`<p>Boven de grenslaag balanceren drukgradiëntkracht en Corioliskracht: de geostrofische wind waait parallel aan de isobaren (op het NH met lage druk links). Aan de grond draait wrijving de wind iets naar lage druk toe en remt hem af.</p>`)}
`},
{ id:'bescherm', title:'9 · Hoe bescherm je jezelf?', html:`
  <h2>Hoe bescherm je jezelf?</h2>
  <p>Hydratatie schaalt met de warmte. Als ruwe referentie: gematigd klimaat (~21 °C, standaardatmosfeer 15 °C op zeeniveau, 1013,25 hPa) en rust ⇒ zo'n 2–2,5 L vocht per dag. Warmer = meer.</p>
  <div class="dgm">${SVG.hydration}</div>
  <p class="dgm-cap">Indicatief, in rust. Bij inspanning kan het per zweet-uur 0,5–1 L extra zijn.</p>
  <div class="callout"><b>Geen vaste formule.</b> De echte behoefte hangt af van activiteit, kleding, directe zon, acclimatisatie en lichaamsgrootte. Zie de grafiek als richting, niet als recept — en extreem véél water zonder zout is óók riskant (hyponatriëmie).</div>
  <h4>Vuistregels</h4>
  <ul>
    <li>Begin gehydrateerd; wacht niet op dorst (die loopt achter).</li>
    <li>Klein en vaak — opname is ~0,5–0,8 L/uur.</li>
    <li>Bij hoog vocht: koeling faalt eerder, wees extra voorzichtig in de middaghitte.</li>
    <li>Bij kou + wind: windchill onderschat je snel — dek huid af.</li>
    <li>Check: lichtgele urine ≈ goed; donker = bijdrinken.</li>
  </ul>
`},
{ id:'waarschuwing', title:'10 · Waarschuwingen begrijpen', html:`
  <h2>Waarschuwingen begrijpen</h2>
  <p>"Code oranje boven België" voelt als "bij mij wordt het gevaarlijk". Maar een waarschuwing markeert een <b>risicogebied</b>, geen lokale garantie. De echte gevaarlijke cel is vaak een fractie van dat gebied.</p>
  <div class="dgm">${SVG.region}</div>
  <p class="dgm-cap">De hele regio kleurt, terwijl de bui klein en lokaal is. Daarom kan bij jou de zon schijnen onder code oranje.</p>
  <div class="callout info"><b>Twee soorten:</b> de weerdienst/Meteoalarm waarschuwt op <b>intensiteit</b> (hoe heftig kán het worden), civiele bescherming op <b>impact</b> (gevolgen voor mensen/spullen). De impact-versie is leidend voor wat jij doet.</div>
  <h4>Kort per land</h4>
  <p>🇳🇱 KNMI · 🇧🇪 KMI · 🇫🇷 Météo-France · 🇮🇹 Protezione Civile · 🇩🇪 DWD (met violet) · 🇦🇹 GeoSphere · 🇸🇮 ARSO — allen groen/geel/oranje/rood, gevoed in het pan-Europese Meteoalarm. In Italië is voor onweer oranje het maximum. Volg altijd de nationale/impact-bron voor jouw zone.</p>
`}
];

(function initTheory(){
  const menu=document.getElementById('chapters'), body=document.getElementById('chapterBody');
  if(!menu||!body) return;
  menu.innerHTML=CHAPTERS.map((c,i)=>`<button class="ch ${i===0?'on':''}" data-i="${i}">${c.title}</button>`).join('');
  function show(i){
    body.innerHTML=CHAPTERS[i].html;
    menu.querySelectorAll('.ch').forEach(b=>b.classList.toggle('on',+b.dataset.i===i));
    if(typeof CHAPTERS[i].init==='function') CHAPTERS[i].init(body);
    body.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  menu.querySelectorAll('.ch').forEach(b=>b.addEventListener('click',()=>show(+b.dataset.i)));
  show(0);
})();
