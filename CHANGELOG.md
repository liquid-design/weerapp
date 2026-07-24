# Changelog — Weerwijsheid

Formaat: [Keep a Changelog] · Versienummers: [SemVer] (MAJOR.MINOR.PATCH).
**Compatibiliteitsafspraak:** API-velden verwijderen/hernoemen of registersemantiek wijzigen
= minimaal MINOR; datamodel-breuk (locations.json, zone-contract) = MAJOR. Puur additief = PATCH/MINOR.

## [Unreleased]
### Onderzocht (geen codewijziging)
- **AT live waarschuwingskleuren — uitgesteld; bron is bruikbaar, maar onze geometrie mist de sleutel.**
  GeoSphere `getWarnstatus` (keyless: `https://warnungen.zamg.at/wsapp/api/getWarnstatus`; spec
  `https://openapi.hub.geosphere.at/warnapi/v1/openapi.json`) levert per waarschuwing `wlevel`
  (1=geel, 2=oranje, 3=rood) en een `gemeinden`-array met 5-cijferige Statistik-Austria GKZ-codes
  (bv. `"10101"`). Bruikbaar en 1-op-1 met onze bedoelde sleutel. **Maar** `austria_gemeinden.geojson`
  bevat die codes niet: alle 2114 features hebben `zone_id="AT-"` (`source_key` `ID` leeg, `zone=null`),
  dus overlap met de API is 0/2114 en een join is onmogelijk. Aansluiten zou een valse 'alles groen'
  tonen (ADR-032: UNAVAILABLE ≠ SAFE), daarom is `status_at()` **niet** geregistreerd en blijft AT op
  'kleuren onbekend'. Vervolgstap: her-fetch de AT-geometrie (`fetch_boundaries.py`, ADR-031) zodat
  `zone_id = "AT-"+GKZ`; daarna is `status_at()` analoog aan `status_de()` triviaal.
### Deploy (Fase B — VM `weer`, 2026-07-19)
- **Eerste productie-deploy uitgevoerd** (stap 1–11): app via git naar `/opt/weerwijsheid/app`,
  venv + systemd (`weerwijsheid.service` + `refresh.timer`), nginx (`server_name weer.home.lan`).
  Mijlpaal 1 (Italië) groen: `verify_routing` 14/0/0, `/api/context` t/m autoriteit, health 200.
  Bewijsstuk: `deploy/evidence/first-production-run.md`.
- **`docs/OPERATIONS.md`** — runbook op basis van de echte deploy: start/stop/status, git-update
  (nooit zip/scp), DNS via Technitium, egress-allowlist, nieuw land uitrollen, backup/recovery.
### Gerepareerd
- **`refresh_zones.sh` venv-detectie:** zoekt nu `$VENV` → app-lokaal `.venv` → `../venv`, zodat de
  refresh-timer werkt op de systemd-deploy (venv op `/opt/weerwijsheid/venv`, één niveau boven de
  app-map). Vóór deze fix sourcete het script alleen `.venv` in de app-map en faalde de timer.
- **Reproduceerbare herbouw voor DE/NL/AT:** de zonegeometrie voor Duitsland (402 Kreise),
  Nederland (12 provincies) en Oostenrijk (2114 gemeenten) staat nu als shipped GeoJSON in git,
  net als IT/FR/BE. Het register (`zone_sources.json`) verklaarde al `present:true` maar de
  bestanden ontbraken → een verse clone/kickstart was voor die drie afhankelijk van live
  overheids-WFS-endpoints. Nu volledig reproduceerbaar zonder netwerk. Alle drie geverifieerd:
  CRS EPSG:4326, model-contract compleet (`verify_boundaries de nl at`). `zone_manifest.json`
  (per-fetch ontvangstbewijs) is nu gitignored — build-artifact, geen bron.
### Infrastructuur
- **Read-only deploy-key** voor de VM: service-user `weerwijsheid` heeft nu een eigen
  ed25519-key (`/opt/weerwijsheid/.ssh/id_ed25519`, GitHub Deploy keys, geen write-access). De
  update-procedure is daarmee één schoon commando (`sudo -u weerwijsheid git pull`) i.p.v. de
  agent-forwarding + chown-omweg. OPERATIONS §2 bijgewerkt.
### Gerepareerd
- **IT live-kleuren werken weer.** Correctie op een eerdere foute diagnose: de DPC-bulletinfeed
  (`pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica`) is **niet** dood — de GitHub
  *contents*-API cap't op 1000 entries en toonde daardoor ten onrechte 2022 als "nieuwste". De
  echte bug zat in `status_it()`: het raadde vaste publicatietijden (HHMM) en miste het bestand
  van vandaag. `status_it()` bepaalt de nieuwste bulletin-bestandsnaam nu **deterministisch** via
  de GitHub git-tree API (geen giswerk). Geverifieerd met echte requests: 187 zones, `Nome zona`
  matcht de zonegeometrie 1-op-1, frontend-sleutel `IT-<naam>`; `data_health` `sources.IT.ok=true`.
### Toegevoegd (pre-deploy)
- Deploy-kit in `deploy/`: systemd-units (api + refresh-timer), directorycontract,
  deploy-checklist met validatierun (mijlpaal 1 = Italië, volledige keten).
### Toegevoegd
- **Heldere Hemel geïntegreerd** (ADR-033): sterrenkijk-app als tweede beslisdomein met
  domein-switcher bovenaan (Weer = default). HH-code onder `frontend/hemel/`, CSS volledig
  gescoped onder `#domein-hemel`, `geoBtn` → `hhGeoBtn`, scripts lazy geladen
  (`lp-data.js` is 1,8 MB), HH-init lazy-load-proof gemaakt, WW-tablogica gescoped naar
  `#domein-weer`.
- Repo publiek: LICENSE (MIT), NOTICE.md (data-attributie per bron), SECURITY.md; README
  licentie-sectie. HOST-config + nginx-template (intern HTTP) + DNS-stap in deploy-checklist.
### Governance
- Ansible expliciet uitgesteld (Open Decision in AGENTS.md): handmatige deploy is de bron van
  waarheid; volgende stap is `deploy/install.sh`, niet een Ansible-rol. Current State-tabel
  toegevoegd aan AGENTS.md.
### Gepland
- VM-deploy uitvoeren; daarna OPERATIONS-runbook + INSTALLATION-LXC-sectie + SECURITY.md (Fase B).
- Live waarschuwingskleuren voor AT/FR/NL/BE.

## [3.2.0] — 2026-07-18
### Toegevoegd
- **Live zonekleuren** via losgekoppeld `warning_status.json` (ADR-032): IT (DPC-bulletin)
  en DE (DWD Warnungen_Landkreise); legenda toont versheid of eerlijk "kleuren onbekend".
- **DWD-waarschuwingsprovider** (DE volledig live: gate → status → kaart).
- **België**: 11 provinciezones (Statbel/NGI). **Frankrijk**: 96 departementen.
- **Datapijplijn-bewaking**: kickstart, maandelijkse refresh-cron, `zone_manifest.json`,
  `/api/data_health` + databanner in de app.
- **Documentatiefundament** (Fase A): AGENTS.md/CLAUDE.md, README, ARCHITECTURE (SAD-light),
  DATA_MANAGEMENT §Governance, API.md, USER_GUIDE, TESTING, dit CHANGELOG, GOVERNANCE-aanvulling.
### Gewijzigd
- `zone_sources.json` is registry-leidend (loaders per bron-type, `geometry_status`).
- Kaart: verse Leaflet-instantie per weergave (fix lege kaart bij locatiewissel);
  DE toont zonenamen i.p.v. WARNCELLID.
### Opgelost
- Valse databanner voor meegeleverde bestanden ("shipped"-loader).
- pyproj in requirements (consistente setup).

## [3.1.0] — 2026-07-17
### Toegevoegd
- **ADR-030 volledig**: authority-attributie (C1), country-gate + reverse-geocode (C2),
  statusmodel WARNING/SAFE/UNAVAILABLE/STALE (C3), geo-context + "Waarom deze bron?" (C4),
  kaartvisualisatie met echte Italiaanse allertazones + point-in-polygon (C5).
- `verify_routing.py` governance-verifier (14 PASS) + routing-cases.
- Zone-architectuur (ADR-031): register, `zone.schema.json`, fetch/verify_boundaries,
  zones voor DE/NL/AT via officiële bronnen.
### Opgelost
- Alpenlek: Bled/Šobec/Tirol kregen Italiaanse autoriteit (baseline-screenshots) — nu ARSO/GeoSphere.

## [3.0.0] — 2026-07 (eerder)
- Model-aware multi-bron engine (Open-Meteo per model, Windy, OpenWeather, Weerlive/KNMI),
  regioresolver + modelregister, warning-providers IT/SI/AT, decision-first UI, leermodules.

[Keep a Changelog]: https://keepachangelog.com/ · [SemVer]: https://semver.org/
