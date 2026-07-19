# Changelog — Weerwijsheid

Formaat: [Keep a Changelog] · Versienummers: [SemVer] (MAJOR.MINOR.PATCH).
**Compatibiliteitsafspraak:** API-velden verwijderen/hernoemen of registersemantiek wijzigen
= minimaal MINOR; datamodel-breuk (locations.json, zone-contract) = MAJOR. Puur additief = PATCH/MINOR.

## [Unreleased]
### Deploy (Fase B — VM `weer`, 2026-07-19)
- **Eerste productie-deploy uitgevoerd** (stap 1–11): app via git naar `/opt/weerwijsheid/app`,
  venv + systemd (`weerwijsheid.service` + `refresh.timer`), nginx (`server_name weer.home.lan`).
  Mijlpaal 1 (Italië) groen: `verify_routing` 14/0/0, `/api/context` t/m autoriteit, health 200.
  Bewijsstuk: `deploy/evidence/first-production-run.md`.
- **`docs/OPERATIONS.md`** — runbook op basis van de echte deploy: start/stop/status, git-update
  (nooit zip/scp), DNS via Technitium, egress-allowlist, nieuw land uitrollen, backup/recovery.
- **Bekend issue vastgelegd:** `refresh_zones.sh` sourcet `.venv` in de app-map, maar de venv staat
  op `/opt/weerwijsheid/venv` → refresh-timer faalt tot fix (zie OPERATIONS §6). IT live-kleurenfeed
  (DPC-bulletin op GitHub) bevroren sinds 2022-09-03 → eerlijk `UNAVAILABLE` (OPERATIONS §7).
### Toegevoegd (pre-deploy)
- Deploy-kit in `deploy/`: systemd-units (api + refresh-timer), directorycontract,
  deploy-checklist met validatierun (mijlpaal 1 = Italië, volledige keten).
### Toegevoegd
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
