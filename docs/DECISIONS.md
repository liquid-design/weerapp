# DECISIONS — Architecture Decision Records (ADR)

Formaat: elk besluit heeft een nummer, besluit, reden, status. Statussen: Proposed,
Accepted, Superseded.

---

## ADR-000 — Definition of Done voor de MVP
**Besluit:** De MVP is klaar wanneer: LXC draait; browser opent dashboard; locatie kiezen
werkt; JSON-data zichtbaar; advies verschijnt; bron transparant zichtbaar; API-keys kunnen
later toegevoegd worden; documentatie aanwezig.
**Reden:** Meetbaar afronden, geen scope creep.
**Status:** Accepted

## ADR-001 — JSON boven Database (géén SQL/NoSQL/TimeSeries)
> Vervult het door de architect geformuleerde "ADR-003 – JSON boven Database"; hier als
> ADR-001 vastgelegd om de bestaande nummering niet te breken.

**Besluit:** Gebruik géén SQL-, NoSQL- of TimeSeries-database. Uitsluitend JSON-bestanden.

**Motivatie:** Dit is geen weerarchief. Het doel is: de huidige situatie tonen, forecast voor
maximaal 7 dagen, transparantie over bronnen, en beslissingen uitleggen. Er worden geen miljoenen
records opgeslagen, geen complexe queries uitgevoerd, en geen analyse over maanden/jaren gedaan.
Een database levert dus geen architecturale meerwaarde.

**Ordegrootte:** per locatie ~24 uur + 7×24 forecast ≈ 192 datapunten. Zelfs 20 locaties ≈ 3.840
records — minuscuul. JSON is ruim voldoende.

**Datamodel:** één JSON-bestand per locatie in `backend/cache/<slug>.json` (de per-locatie
variant uit het architectuurvoorstel), plus `config/locations.json` en `data/feedback.json`.
Elke cache draagt `updated`, `expires` en de gebruikte readings (met bron per waarde).

**Cache-metadata (per locatie-snapshot):**
```json
{ "updated": "2026-07-16T13:00:00", "expires": "2026-07-16T13:15:00", "_readings": [ ... ] }
```
Bij openen: `expires` verstreken? → opnieuw ophalen. Anders → cache tonen. Meer is niet nodig.

**Verboden opslagtechnologieën:** zie GOVERNANCE §8 (SQLite, PostgreSQL, MariaDB, MySQL, MongoDB,
InfluxDB, TimescaleDB, Redis) — tenzij een latere expliciete ADR dit goedkeurt.

**Filosofie:** de applicatie is een decision-support tool, geen archiefsysteem. De waarde zit in
bronnen combineren, confidence berekenen, beslissen uitleggen en transparantie tonen — niet in
datamanagement. Enterprise-denken = de eenvoudigste architectuur die het probleem volledig oplost.
**Status:** Accepted

## ADR-002 — Eén Proxmox LXC, geen containerstack
**Besluit:** Deployment als één LXC met één Python-proces dat API én statische frontend serveert.
**Reden:** Geen orkestratie nodig; lichter, sneller herstelbaar via snapshot, begrijpelijker.
**Status:** Accepted

## ADR-003 — Provider-adapterpatroon
**Besluit:** Elke databron is een adapter die van `BaseProvider` erft en genormaliseerde
velden + bron-metadata teruggeeft. De frontend spreekt nooit direct een externe API aan.
**Reden:** API-keys beschermen, bronnen inwisselen, meerdere bronnen combineren.
**Status:** Accepted

## ADR-004 — Pull-gebaseerde refresh met cache-TTL
**Besluit:** Geen achtergrond-polling. Bij openen wordt de cache hergebruikt als die jonger
is dan `cache_max_age_min` (default 15), anders opnieuw opgehaald.
**Reden:** Daggebruik, geen realtime-eis; bespaart API-calls en complexiteit.
**Status:** Accepted

## ADR-005 — Regelgebaseerde beslisengine (geen ML)
**Besluit:** `decision_engine.py` gebruikt expliciete regels met drempels uit
`config/thresholds.json`. Output bevat altijd `reason[]` + `action`.
**Reden:** Transparantie en uitlegbaarheid zijn het product. ML zou de "waarom" verbergen.
**Status:** Accepted

## ADR-006 — Secrets via .env
**Besluit:** Tokens uitsluitend in `.env` (niet in Git). Alleen `.env.example` wordt gecommit.
**Reden:** Basale security-hygiëne; frontend blijft tokenvrij.
**Status:** Accepted

## ADR-007 — Flask als enige webframework
**Besluit:** Flask + `requests`. Geen zwaardere stack.
**Reden:** Minimale, bekende dependency die routing én statische serving dekt; makkelijk in LXC.
**Status:** Accepted

## ADR-008 — Frontend gesplitst in drie bestanden
**Besluit:** De v1 single-file HTML wordt gesplitst in `index.html` / `style.css` / `app.js`.
**Reden:** De app wordt nu door de backend geserveerd (HTTP), dus de eerdere `file://`-CORS-
reden voor één bestand vervalt. Splitsen is onderhoudbaarder. Ontwerp/kleuren/uitleg blijven.
**Status:** Accepted (superseeds de single-file keuze uit v1 voor deze server-context)

## ADR-009 — Cache per locatie
**Besluit:** `cache/<slug>.json` per locatie i.p.v. één `current.json`.
**Reden:** Meerdere locaties (Thuis, Camping…) zonder elkaars cache te overschrijven.
**Status:** Accepted

## ADR-010 — Mock-first databronnen
**Besluit:** Providers leveren realistische **mock**-data zolang er geen token is, met een
`"mock": true`-vlag zichtbaar in de transparantielaag.
**Reden:** Werkende MVP zonder externe afhankelijkheden; keys pas na de bouwfase.
**Status:** Accepted

## ADR-011 — Geocoding via Nominatim (keyless)
**Besluit:** Locaties worden toegevoegd door een plaatsnaam (camping/stad/land) te zoeken via
Nominatim (OpenStreetMap). De backend levert kandidaten met coördinaten; de gebruiker kiest;
de gekozen lat/lon wordt opgeslagen in `locations.json` en voedt daarna alle weer-providers.
**Reden:** Geen API-key nodig (past bij "keys pas na de bouwfase"), indexeert ook POI's zoals
campings, en houdt de weer-adapters coördinaat-gebaseerd. Externe call loopt via de backend.
**Nuance:** Nominatim-gebruiksregels respecteren (herkenbare User-Agent, laag volume, ~1 req/s).
Optionele contact-e-mail via `NOMINATIM_EMAIL`.
**Status:** Accepted

## ADR-012 — Open-Meteo als keyless live-basisbron
**Besluit:** De live weerdata (temperatuur, gevoelstemperatuur, wind + gust, neerslag, CAPE) en
luchtkwaliteit komen standaard van Open-Meteo, dat geen API-key vereist. Token-bronnen (Windy,
OpenWeather, IQAir) zijn optioneel en vullen aan/overschrijven wanneer hun key is ingevuld.
**Reden:** De MVP kan live zonder account of key; secrets zijn niet nodig om te starten en
hoeven nooit gedeeld te worden. Open-Meteo ondersteunt bovendien modelkeuze (ECMWF/GFS/ICON/AROME).
**Nuance:** Vereist internet; bij netwerkfout valt de pipeline terug op mock (met lage confidence).
**Status:** Accepted

## ADR-013 — Gelaagde pipeline met rollen i.p.v. hoofdbron
**Besluit:** De architectuur is een pipeline: Provider-adapters → Unified Weather Model →
Decision Engine → Confidence Engine → Explainability → Dashboard. Providers zijn georganiseerd
per **rol** (forecast/observation/warning/airquality/lightning/radar), elk met mogelijk meerdere
leveranciers. Er is géén "hoofdbron"; Open-Meteo is slechts de eerste forecast-leverancier.
**Reden:** Toekomstvast en onderhoudbaar: nieuwe bronnen of regels toevoegen zonder de rest te
raken. Elke laag heeft één verantwoordelijkheid.
**Status:** Accepted (vervangt de "hoofdbron"-opzet uit v2)

## ADR-014 — Bron-agnostische beslisengine op canonieke velden
**Besluit:** De Decision Engine leest uitsluitend canonieke velden uit het Unified Weather Model
(`forecast.wind_gust`, `cape`, …), nooit een leverancier (`OpenMeteo.wind`).
**Reden:** Ontkoppelt beslislogica van databronnen; bronnen zijn inwisselbaar en combineerbaar.
**Status:** Accepted

## ADR-015 — Confidence uit bron-overeenstemming
**Besluit:** Een Confidence Engine berekent per veld een vertrouwen: één bron = basisvertrouwen
(niet gekruist), meerdere bronnen = hoog bij kleine spreiding, laag bij grote spreiding. Het
advies-vertrouwen is de zwakste schakel onder de bepalende velden.
**Reden:** "Modellen spreken elkaar tegen" is waardevolle informatie voor de gebruiker.
**Status:** Accepted

## ADR-016 — Append-only feedback-log (bewuste uitzondering op ADR-001)
**Besluit:** De applicatie bewaart **geen meteorologische historie**. Alleen **beslisfeedback**
wordt append-only opgeslagen in `data/feedback.json`, omdat deze noodzakelijk is om de kwaliteit
van de beslisregels te evalueren. Elke regel bevat het advies, de weercontext die het advies
bepaalde, het menselijk oordeel en de configuratieversie (zie ADR-018).
**Reden:** Feedback is een kleine "menselijke correctielaag", geen tijdreeksdatabase. Het verschil
met verboden historie: geen miljoenen weerpunten, maar tientallen beslispunten met een oordeel.
**Status:** Accepted (nuanceert ADR-001 uitsluitend voor feedback)

## ADR-018 — Configuratieversies koppelen aan feedback
**Besluit:** `config/thresholds.json` draagt een `version`. Elke feedback-regel bewaart de versie
die actief was toen het advies werd gegeven.
**Reden:** Maakt regelvalidatie zuiver: je kunt zeggen "regel X was 87% correct onder v2026.07.1".
Zonder versie zou feedback over verschillende drempelsets vervuild raken. Bump de versie bij elke
inhoudelijke wijziging van de drempels.
**Status:** Accepted

## ADR-020 — Region Resolver: regio ≠ modelgebied
**Besluit:** Een locatie wordt via `core/region_resolver.py` en `config/regions.json` omgezet in
een regioprofiel (regio, terrein, voorkeursmodellen per provider). De Open-Meteo-adapter is
**model-aware**: hij bevraagt per locatie de aanbevolen modellen (bv. ICON-D2 + ECMWF in de Alpen)
en levert **elk model als aparte bron**. Een model dat de plek fysiek niet dekt geeft null terug
en valt vanzelf weg — zo lost "modelbeschikbaarheid" zichzelf op zonder harde regels.
**Reden:** Meteorologische modellen volgen geen politieke grenzen. Door modellen als bronnen te
behandelen (ICON vs ECMWF vs GFS) wordt de confidence-consensus meteorologisch betekenisvol in
plaats van een vergelijking van distributielagen.
**Nuance:** De atlas is een advieslaag met grove rechthoeken; grensgebieden kunnen "net ernaast"
vallen. Verfijning (polygonen, gewicht ×1.2 voor lokale modellen) is een latere stap.
**Status:** Accepted

## ADR-022 — Model Registry & gewogen consensus
**Besluit:** Modelkennis (type, resolutie, basisgewicht, voorkeursterrein) staat centraal in
`config/models.json`; `core/model_registry.py` levert per bron een gewicht. De Unified Weather
Model berekent numerieke consensus als **gewogen gemiddelde** en bepaalt het **leidende model**
(zwaarst wegende bron). Past het voorkeursterrein van een model bij de locatie, dan krijgt het
een terreinbonus (×1.2), zodat bv. ICON-D2 in de Alpen zwaarder weegt dan globaal ECMWF.
**Reden:** Bronnen zijn meteorologisch niet gelijkwaardig. Wegen i.p.v. 50/50 geeft een sterkere
consensus én maakt de resolver data-gedreven (geen `if region == alps`).
**Nuance:** Gewichten zijn een expliciete, aanpasbare config — geen ML (ADR-019).
**Status:** Accepted

## ADR-027 — Gedeelde CAP-kern (Common Warning Schema)
**Besluit:** CAP 1.2-parsing zit in één gedeelde module `core/cap.py`. Elke landen-warning-provider
(Protezione Civile, ARSO, later KNMI/KMI/DWD) voedt zijn CAP erin en krijgt een genormaliseerd
schema terug (zone → level/risk/active/expires). Kleur wordt robuust bepaald: MeteoAlarm-parameter
`awareness_level` → kleurwoord in event/description (meertalig) → CAP `severity`.
**Reden:** CAP is de gedeelde standaard; één parser voorkomt duplicatie en maakt nieuwe landen een
kwestie van "waar staat de feed en hoe koppel ik de zone", niet "hoe parse ik CAP".
**Status:** Accepted

## ADR-029 — GeoSphere Austria als primaire waarschuwingsbron (Oostenrijk)
**Besluit:** Oostenrijkse waarschuwingen komen uit de officiële GeoSphere Austria Warn-API
(CC-BY-4.0, JSON). Anders dan de CAP-landen is dit een REST/JSON-bron; hij krijgt een eigen
adapter maar voedt hetzelfde genormaliseerde warning-schema (level/risk/active/expires + impact).
Het endpoint neemt zelf lat/lon en geeft de waarschuwingen van de juiste GEMEENTE terug — dus
geen zonecode én geen geometrie-dependency nodig. Kleur uit `rawinfo.wlevel` (1/2/3 →
geel/oranje/rood), gevaarstype uit `rawinfo.wtype`, geldigheid uit start/end (Unix).
**Reden:** GeoSphere is de nationale, impact-gebaseerde bron met rijker detail (gevaarstype +
impact-tekst) dan een Europese aggregator, en werkt op gemeentebasis — passend bij het
resolutie-thema in de Alpen (dal vs. pas). Geverifieerd tegen een echte respons (Innsbruck).
**Nuance:** Hoogalpiene gebieden vallen bewust buiten GeoSphere-waarschuwingen. Bij uitval geeft
de adapter niets terug. Landeswarnzentralen (provinciale alarmcentrales) kunnen later als tweede
Oostenrijkse laag toegevoegd worden. Bron: GeoSphere Austria.
**Status:** Accepted
**Besluit:** Sloveense waarschuwingen komen rechtstreeks uit de officiële ARSO CAP-feed
(meteo.arso.gov.si), geparseerd via de gedeelde CAP-kern. MeteoAlarm blijft een mogelijke
Europese fallback. Omdat Slovenië klein is, wordt de waarschuwingsregio uit lat/lon geresolved met
een lichte bounds-tabel (5 regio's) — geen handmatige zonecode nodig (anders dan Italië).
**Reden:** ARSO denkt al in waarschuwingsregio's die passen bij een reis-use-case; een nationale
bron is nauwkeuriger en gezaghebbender dan een Europese aggregator.
**Nuance:** De exacte ARSO-CAP-bestandsnamen en de areaDesc/geocode per regio konden niet live
geverifieerd worden (feed leeg op een rustige dag, sandbox zonder ARSO-toegang). De adapter volgt
de CAP/MeteoAlarm-standaard, matcht regio op naam en valt terug op de nationale meest-ernstige
waarschuwing als de regionaam niet exact matcht. Eén live bulletin bevestigt de zonenamen.
**Status:** Accepted
**Besluit:** Italiaanse impact-waarschuwingen komen uit de officiële **CAP 1.2-feed** van het
Dipartimento della Protezione Civile (dagelijks gepubliceerd op hun GitHub-repo, CC-BY-4.0), niet
uit HTML-scraping van de kaart. De adapter zoekt het nieuwste bulletin, parseert het CAP-XML naar
een zone→kleur-map en geeft de impact-kleur voor de zone van de locatie.
**Reden:** Een gestandaardiseerde, gelicentieerde, machine-leesbare bron is stabiel en betrouwbaar;
HTML-scraping is fragiel en ongepast als basis voor een beslistool.
**Nuance:** Punt→zone vereist de zonegeometrie (shapefile, zware dependency). Om de app licht te
houden koppelt een locatie zich via een **zonecode/-naam** (`alert_zone`, bv. 'Lomb-04'). Zonder
zone rapporteert de adapter 'zone niet ingesteld' i.p.v. te gokken. Voor onweer kent Italië geen
rode code (oranje = max). Bronvermelding: Dipartimento della Protezione Civile.
**Status:** Accepted
**Besluit:** Weerlive (KNMI 10-minuten-metingen) is toegevoegd in de **observation**-rol, niet als
forecast (Optie A). Het levert gemeten temperatuur, gevoelstemperatuur en wind met een hoog
basisvertrouwen en een hoog regist+ gewicht (1.3), zodat de meting de forecasts ijkt: forecast
en meting verschijnen als aparte bronnen onder hetzelfde veld, waardoor de afwijking zichtbaar
wordt en de consensus richting de werkelijkheid trekt.
**Reden:** Een meting is sterker bewijs voor "nu" dan een voorspelling. Forecast-vs-observation is
meteorologisch waardevoller dan een extra voorspelling toevoegen (het vermengt geen model­berekening
met verwachtingstekst).
**Nuance:** Alleen actief in NL/Vlaanderen (KNMI-meetnet). Weerlive levert geen actuele windstoot
of moment-neerslag → die blijven unavailable. Privé/studiegebruik; 300 verzoeken/dag; bronlink
naar Weerlive.nl vereist.
**Status:** Accepted
**Besluit:** Windy is toegevoegd als tweede distributie-provider die dezelfde modellen kan
dragen als Open-Meteo. Readings hebben nu een apart `provider` (Open-Meteo/Windy/OpenWeather) én
`model` (ECMWF/ICON-D2/…). De Model Registry weegt op **model**, zodat 'ECMWF via Windy' even
zwaar weegt als 'ECMWF via Open-Meteo', maar ze in de debug onderscheidbaar blijven
('Windy ECMWF' vs 'Open-Meteo ECMWF'). De adapter vertaalt Windy's ruwe uitvoer (Kelvin→°C,
m/s→km/u, u/v-componenten→snelheid, neerslag→mm) naar het canonieke model en rapporteert
ontbrekende velden als *unavailable*, nooit 0. De consensus-/confidence-/weeglagen bleven
ongewijzigd — Windy verschijnt simpelweg als extra bron.
**Reden:** Windy vult gaten (met name CAPE, dat Open-Meteo's ECMWF-pad niet levert) en maakt
provider-vs-provider-vergelijking mogelijk: verschilt hetzelfde model via twee providers, dan is
dat een update-/providerverschil, geen modelverschil.
**Nuance:** Windy Point Forecast kent **geen ECMWF** (dat komt via Open-Meteo); wél iconEu,
iconD2, aromeFrance en gfs. Het **gratis/testplan levert geschudde nepdata** (herkenbaar aan een
`warning`-marker in de respons); de adapter weert die readings volledig, zodat Windy pas echt
meetelt na een upgrade. Windy staat dus veilig standaard uit tot er én een token én échte data is.
**Status:** Accepted

## ADR-033 — Heldere Hemel als tweede beslisdomein in één applicatie
**Status:** Accepted — geïmplementeerd (frontend-integratie; zie Uitvoering).

**Context.** "Heldere Hemel" is een aparte, werkende client-side app die per nacht scoort hoe
goed het is om naar de sterren te kijken (atmosfeer x maan x lichtvervuiling x seeing). Zelfde
gebruiker, zelfde vraagvorm ("wat betekent de lucht voor wat ik wil doen"), maar een ander
domein. Twee losse apps betekent twee URL's, twee deploys en twee plekken om te onderhouden.

**Besluit.**
1. **Eén applicatie, twee-niveau-navigatie.** Boven de bestaande tabbalk komt een
   *domein-switcher*: `[Weer] [Heldere Hemel]`. **Weer is de default** bij openen van
   `http://weer.home.lan`. Het actieve domein bepaalt welke tabrij eronder staat
   (Weer: Live/Getallen/... — Hemel: Heldere Hemel/Planeten & sterren/Theorie).
2. **Heldere Hemel behoudt z'n eigen code**, ongewijzigd van logica, onder `frontend/hemel/`.
   Geen herschrijving naar de WW-backend: HH praat rechtstreeks met Open-Meteo (keyless) en
   heeft geen provider-/autoriteitsketen nodig.
3. **Isolatie via scoping** (zie Uitvoering): HH-CSS wordt gescoped, HH-element-ID's krijgen een
   prefix, HH-scripts laden lazy bij eerste activering.
4. **NORMATIEF — het autoriteitsonderscheid.** Weerwijsheid stoelt op *de bevoegde autoriteit
   spreekt* (ADR-030): DWD over Duitsland, ARSO over Slovenie. **Heldere Hemel heeft geen
   autoriteit** — er bestaat geen nationale sterrenkijkdienst. De score is een eigen model met
   een geschatte lichtvervuiling (Walker/Garstang-gloedmodel: *schatting, geen meting*).
   De UI mag die twee claims nooit vermengen: een HH-score is nooit een waarschuwing, draagt
   nooit een autoriteitslabel, en verschijnt niet in `warning_status`/`data_health`.

**Overwogen alternatief (afgewezen).** Twee losse documenten (`/` en `/hemel`) met een gedeelde
switcher: nul botsingsrisico, geen scoping nodig, 1,8 MB laadt alleen op de hemel-pagina.
Afgewezen ten gunste van een samenhangender ervaring in één pagina; de meerkosten hieronder
worden bewust geaccepteerd.

**Gevolgen (eerlijk).**
- **CSS-botsing is het hoofdrisico**: beide apps stylen `body`, `header`, `main`, `h1`, `.card`,
  `.tab`, `.btn`. HH-CSS moet mechanisch gescoped worden onder een wrapper.
- **`.tab`-kaping**: WW selecteert tabs met `document.querySelectorAll('.tab')`. Zonder scoping
  pikt dat HH-markup op en breekt de navigatie van beide domeinen.
- **1,8 MB `lp-data.js` MOET lazy laden.** Anders betaalt elke weer-paginalading die prijs.
- HH's eigen header (zoekveld + "Gebruik mijn locatie") verhuist naar het HH-paneel; de globale
  header toont alleen de domein-switcher.
- Twee "Theorie"-tabs bestaan naast elkaar — correct: ze horen bij verschillende domeinen en
  slechts een domein is tegelijk actief.
- Geocoding blijft voorlopig dubbel (HH: Nominatim direct; WW: `/api/geocode`). Genoteerd als
  latere opruiming, geen blocker.
- Verifiers (`verify_routing`, `verify_boundaries`) raken HH niet: die bewaken
  waarschuwingsgovernance en zonedata.

**Uitvoering (plan, nog niet gebouwd).**
1. `frontend/hemel/` — HH-bestanden ongewijzigd, behalve de drie ingrepen hieronder.
2. **CSS-scoping**: alle selectors in `hemel/style.css` prefixen met `#domein-hemel `;
   `body`/`html`-regels handmatig beoordelen (achtergrond/lettertype van WW wint).
3. **ID-prefix**: HH-element-ID's krijgen `hh-` (minimaal `geoBtn` botst; `q`, `status`,
   `results`, `sky`, `theory` zijn generiek genoeg om preventief mee te nemen). HH's JS
   aanpassen op dezelfde prefix.
4. **Lazy load**: HH-scripts (incl. `lp-data.js`) pas injecteren bij de eerste klik op de
   domein-switcher; daarna HH's init aanroepen.
5. **Domein-switcher** in `index.html` + WW's tab-logica scopen naar de actieve domein-container.
6. Documentatie: README-dekking, `NOTICE.md` uitbreiden met HH-bronnen (GeoNames CC-BY voor de
   stedendata; Open-Meteo; Nominatim), AGENTS.md Current State, CHANGELOG.

## ADR-032 — Live zonekleuren via losgekoppeld statusbestand
**Status:** Accepted (IT + DE; overige landen bewust 'kleuren onbekend').

**Besluit.** Geometrie (zelden wijzigend) en waarschuwingsniveau (dagelijks) zijn gescheiden.
`tools/fetch_warning_status.py` schrijft `warning_status.json` (`{zone_id: level}` + per land
versheid/ok). De kaart leest alléén dit bestand en roept nooit providers aan; ontbreekt een land,
dan neutraal + 'waarschuwingskleuren: onbekend' in de legenda — nooit een verzonnen kleur.
Statusbronnen: IT = dagelijks DPC-bulletin (TopoJSON-kleuren), DE = DWD Warnungen_Landkreise
(zelfde WARNCELLID als de geometrie). Verversing zit in tools/refresh_zones.sh (frequentie is een
gebruikerskeuze; het bestand is klein).

**Afgewezen scope** (bewust, past niet bij een beslistool): historische weerdata/DB (strijdig met
ADR-001), model-vs-autoriteit vergelijkingslaag, offline tile-caching en notificaties — geparkeerd
tot na de deploy.

## ADR-031 — Officiële waarschuwingszone-geometrie per land (kaartlaag)
**Status:** Accepted — Italië geïmplementeerd; overige landen via buildscript op een machine met internet.

**Context.** De kaart toont per locatie de officiële waarschuwingszones. Onderzoek naar 7 landen
legde een fundamenteel onderscheid bloot dat in het datamodel moet: sommige landen definiëren
**eigen meteorologische zones** (Italië ~187 zone di allerta, Duitsland Warngebiete met WARNCELLID),
andere **hergebruiken bestuurlijke eenheden** (NL provincies, BE provincies, FR departementen).

**Besluit.**
1. Elk land heeft een record in `frontend/map/data/zone_sources.json` met o.a. `zone_type`
   (`meteorological` | `administrative`), de officiële bron, licentie, CRS en `key_attr`. De kaart
   leest dit register; niets hardcoded.
2. **`zone_type` is verplicht en zichtbaar** in popup én legenda — zo wordt nooit een meteorologische
   zone (IT/DE) verward met een bestuurlijke benadering (NL/BE/FR). Dit voorkomt een verkeerde
   vergelijking, precies het risico dat de landen-uitbreiding introduceert.
3. **Governance: officiële bron → vaste geometrie → lokaal in de repo → geen runtime-afhankelijkheid.**
   Ophalen is een bewuste build-stap via `tools/fetch_boundaries.py`, dat **registry-gedreven** werkt:
   `zone_sources.json` → per land een `loader`-adapter (`wfs_geojson`, `geojson_direct`, ...) →
   `normalize()` naar één intern zone-model → opslaan. Géén land-specifieke if-statements.
   Elke genormaliseerde zone draagt: `zone_id`, `country`, `authority`, `zone_type`,
   `geometry_status`, `source_dataset`, `source_key`, `zone`, `level`.
4. **`geometry_status`** (official | derived | approximation | missing) staat naast `zone_type`,
   zodat de NL-polygoonovergang (2026) en toekomstige upgrades een registerwijziging zijn, geen
   codewijziging. De legenda toont de status eerlijk (bv. NL nu 'benadering').
5. **Geen schijnzekerheid**: een land zonder aanwezige geometrie (`present:false`) toont geen
   verzonnen zones maar alleen de landcontour + een eerlijke legendamelding. NL/BE/DE/FR/SI/AT
   krijgen hun zones zodra het buildscript op een machine met internet is gedraaid.

**Geverifieerde bronnen (samenvatting).** IT: Protezione Civile TopoJSON (CC-BY-4.0, meteorologisch,
aanwezig). DE: DWD Warngebiete_Kreise WFS (GeoNutzV, meteorologisch, WARNCELLID). FR: Météo-France
vvs_departementales GeoJSON (Licence Ouverte, administratief, domain_id). NL: PDOK provincies WFS
(administratief; KNMI stapt mei 2026 over op polygonen → dan meteorologisch). BE: Statbel provincies
(CC-BY-4.0, administratief). AT: Statistik Austria Gemeinden WFS (CC-BY-4.0, administratief,
EPSG:31287→4326). SI: geen officieel vectorbestand — MeteoAlarm Metadata API of reconstructie uit
obcine (5 grove regio's).

**Update (7 landen + DWD-provider).** BE toegevoegd via Statbel/NGI-provincies (11 gebieden,
official). DE kreeg náást de zone-geometrie ook een echte **waarschuwingsprovider** (providers/
warning/dwd.py, Geoserver Warnungen_Gemeinden, point-in-polygon, GeoNutzV) — Duitsland is nu volledig
live, net als IT/SI/AT. SI blijft bewust **missing**: de 5 ARSO-regio's vallen met geen enkele
administratieve indeling samen en er is geen bereikbaar officieel vectorbestand; liever landcontour
dan verzonnen grenzen (vereist MeteoAlarm-token). Kickstart (tools/kickstart.sh) + maandelijkse cron
(tools/refresh_zones.sh) + zone_manifest.json voeden /api/data_health, dat een banner in de app toont
bij ontbrekende/verouderde data.

**Nuance.** NL/BE/AT/SI-bronnen staan in een nationaal projectiestelsel en vereisen herprojectie
naar EPSG:4326. DWD-gemeenten (~11000) zijn te zwaar voor Leaflet; gebruik Kreise (~400) of
vereenvoudig. KNMI's polygoonovergang (2026) betekent dat NL's `zone_type` later meteorologisch wordt.
**Status:** Accepted
**Status:** Accepted (ontwerpregel) — implementatie volgt als aparte sprint.

**Context.** De architectuuraudit (seed-set van 10 grens-locaties) legde een fundamenteel verschil
bloot tussen twee soorten data die het systeem verwerkt:

- **Weerdata is fysisch/geografisch.** ECMWF, ICON, AROME zijn modellen met ruimtelijke dekking.
  Routeren op `lat/lon → modeldekking → beste model` is correct; een model dat de plek niet dekt,
  valt vanzelf weg.
- **Waarschuwingsdata is geografisch én bestuurlijk.** Een officiële waarschuwing volgt niet
  modeldekking maar *grondgebied → bevoegde instantie*: `lat/lon → land/regio → autoriteit → waarschuwing`.

De warning-laag gebruikte tot nu toe de sleutel van de forecast-laag (`provider.covers(lat, lon)`
met grove rechthoeken). Gevolg: de bounding box van Protezione Civile (36–47,5 °N, 6–19 °E)
overdekt de hele Alpenboog en claimt Bled (SI), Tirol (AT), Istrië (HR), Garmisch (DE), Chamonix
(FR) en Interlaken (CH). Omdat de warning-autoriteit op *volgorde* werd gekozen (`vals[0]`), kreeg
een correcte oranje ARSO-waarschuwing de verkeerde vlag ("Protezione Civile").

**Besluit.**
1. **Waarschuwingsproviders routeren op autoriteit, niet op coördinaten alleen.** De sleutel wordt
   `provider.covers(country, region, lat, lon)`. Een provider claimt een locatie alleen als het
   land/de regio onder zijn bestuurlijke verantwoordelijkheid valt.
2. **Minimale implementatie eerst, geen GIS.** Niet meteen shapefiles/polygon-matching. Wel:
   `lat/lon → reverse-geocode → country_code (+ regio) → warning-provider`. De `country_code` komt
   uit Nominatim, dat we al aanroepen; we slaan hem op de locatie op. Een simpele map
   `{ "SI": ARSO, "IT": ProtezioneCivile, "AT": GeoSphere, ... }` lost het leeuwendeel op.
   Fijnmazige zonegeometrie (Italiaanse allertazones, ARSO-regio's) blijft een latere verfijning.
3. **Autoriteit volgt de winnende waarschuwing.** `warning_authority` komt van de reading die het
   hoogste `warning_level` zette, niet van de eerste provider in de lijst.
4. **Drie toestanden i.p.v. twee — een veiligheidsregel.** Onderscheid expliciet:
   - `GREEN` met bekende bron → "rustig, en we hebben een bevoegde bron gecontroleerd" (hoog vertrouwen);
   - `UNKNOWN` → "geen nationale waarschuwingsbron aangesloten voor dit land" (laag vertrouwen);
   - `YELLOW/ORANGE/RED` met bron → actieve waarschuwing.
   "Geen oranje waarschuwing gevonden" mag nooit hetzelfde ogen als "we hebben geen bron voor dit land".

**Bewust niet nu.** Niet alle ontbrekende landen (KMI/KNMI/DWD/DHMZ/MeteoSwiss/Météo-France) in
één keer toevoegen. Eerst de router corrigeren; anders vermenigvuldigt een foute selectie zich over
meer providers. Volgorde: eerst `locatie → land → autoriteit`, daarna pas `autoriteit → adapter`.

**Gevolgen.**
- Locaties krijgen een `country`-veld (en optioneel `region`); de land-laag die in ADR-020
  bewust ontbrak voor forecast, wordt hier alsnog geïntroduceerd — specifiek voor de warning-rol.
- Nieuwe landen aansluiten wordt triviaal: land in de map, adapter erachter.
- Verificatie na implementatie met drie extra breekpunten: Dreiländereck (één berg, drie
  autoriteiten), Bormio (hoogte/dal/pas), Trieste (Alpen ↔ Adria).

**Kernzin.** Weermodellen zijn fysisch; waarschuwingen zijn institutioneel. De audit vond niet een
bug maar de architecturale grens tussen die twee.

**Implementatie (Commits 1-3).** Commit 1: `warning_authority` volgt de winnende waarschuwing. Commit 2: country-gate op `country_scope` + reverse-geocode landbepaling + routing-trace + geen silent fallback. Commit 3: statusmodel WARNING/SAFE/UNAVAILABLE/STALE (UNAVAILABLE != SAFE) met genormaliseerd object {status, authority, level, confidence, reason} en UI-mapping. Bewaakt door `backend/verify_routing.py` (14 PASS/0 FAIL/0 UNKNOWN).

## ADR-017 — Decision-first dashboard
**Besluit:** Het dashboard toont eerst de beslissing (✔ Veilig / ⚠ Opletten/Maatregelen /
✖ Vertrekken), dan de onderbouwing en het advies-vertrouwen, en pas daarna de ruwe data met
bron en confidence per waarde.
**Reden:** De gebruiker wil eerst weten wat te doen, niet eerst cijfers.
**Status:** Accepted
