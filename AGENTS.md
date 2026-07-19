# AGENTS.md — onboarding voor AI-agents én nieuwe ontwikkelaars

> **De code is niet de primaire waarheid van dit project.**
> De waarheid zit, in deze volgorde, in: (1) officiële databronnen, (2) contracten,
> (3) ADR's, (4) verifiers, (5) pas daarna de implementatie.
> Wie bij de code begint, "verbetert" dingen die expres zo gebouwd zijn.

## 1. Leesvolgorde (altijd)
1. `README.md` — wat het is, dekkingstabel, quick start
2. dit bestand — hoe je je gedraagt
3. `docs/ARCHITECTURE.md` — componenten + de twee kernsequenties
4. `docs/DECISIONS.md` — de ADR's (het *waarom*; ADR-030/031/032 zijn de kern)
5. **pas daarna** de code, en alleen de bestanden die je taak raakt

## 2. Waar staat de waarheid? (Single Source of Truth)
| Onderwerp | Waarheid |
|---|---|
| Architectuur & dataflow | `docs/ARCHITECTURE.md` |
| Ontwerpbeslissingen (waarom) | `docs/DECISIONS.md` (ADR-000…032) |
| Databronnen per land (autoriteit, licentie, CRS, zone_type) | `frontend/map/data/zone_sources.json` |
| Zone-datacontract | `frontend/map/data/zone.schema.json` |
| Warning-providercontract | `docs/WARNING_PROVIDER_CONTRACT.md` |
| Routering-testcases | `backend/tests/warning_routing_cases.json` |
| Werkwijze, DoD, releases | `docs/GOVERNANCE.md` |
| Databeleid (regels) | `docs/DATA_MANAGEMENT.md` |
| Documentatieroadmap | `docs/DOCUMENTATION_PLAN.md` |

README bevat géén detailwaarheid — hij verwijst. Vind je tegenspraak: register/contract wint
van proza; meld de tegenspraak i.p.v. stil te kiezen.

## 3. Verboden aannames (NOOIT)
- **Nooit zones of grenzen zelf tekenen of verzinnen.** Geen officiële geometrie beschikbaar →
  `geometry_status: missing`, landcontour + eerlijke melding (zo doet Slovenië het nu).
- **Nooit ontbrekende data invullen.** Onbekend ≠ veilig; UNAVAILABLE ≠ SAFE.
- **Nooit officiële bronnen vervangen door community-data** zonder ADR (uitzondering bestaat
  alleen expliciet in het register, bv. FR-departementen als admin-geometrie).
- **Nooit waarschuwingen afleiden uit modeldata.** Waarschuwing = institutioneel, alleen van
  de bevoegde autoriteit. Autoriteit > ernst — een `highest_warning_wins()` over landsgrenzen
  is de klassieke fout die ADR-030 verbiedt.
- **Nooit de kaart laten beslissen.** De kaart rendert `geo_context` + registers; alle logica
  zit in de backend.
- **Nooit een database, historiek of framework toevoegen.** JSON-only (ADR-001); afgewezen
  scope staat in ADR-032.
- **Nooit secrets in de repo.** Tokens alleen in `.env`; gelekte keys → roteren.

## 4. Taakmatrix (lees dít, raak dát — inclusief impactketen)
| Ik wil… | Lees eerst | Impactketen (in volgorde) |
|---|---|---|
| Nieuwe warning-provider | WARNING_PROVIDER_CONTRACT + ADR-030 | provider (`country_scope`!) → pipeline-kandidaten → `warning_routing_cases.json` → `verify_routing` → geo_context toont hem vanzelf → CHANGELOG |
| Nieuw land / nieuwe zonegeometrie | DATA_MANAGEMENT + ADR-031 | `zone_sources.json` (regel!) → evt. loader in `fetch_boundaries.py` → `verify_boundaries` → README-dekkingstabel → CHANGELOG |
| Live kleuren voor een land | ADR-032 | statusfetcher in `fetch_warning_status.py` → `warning_status.json`-sleutels = `zone_id` → CHANGELOG |
| Kaart/frontend wijzigen | ARCHITECTURE §5–6 | `map/layers.js` leest registers — nooit hardcoden → legenda eerlijk houden |
| Routering/gate aanpassen | ADR-030 + ROUTING_TEST_SPEC | code → **`verify_routing` moet 14+ PASS blijven** → ADR bij gedragswijziging |
| API wijzigen | `docs/API.md` (Fase A) | app.py → API.md → frontend → CHANGELOG |
| Bug fixen | CHANGELOG + relevante ADR | fix → verifiers → CHANGELOG |
| Deployen | INSTALLATION (+ OPERATIONS, Fase B) | — |

## 5. Vaste workflow bij elke wijziging
```
Wijziging nodig → raakt het architectuur/contract/gedrag?
   ja → eerst ADR (kort) in DECISIONS.md
Contract/register aanpassen vóór code
Implementeren (kleinst mogelijke scope; commits per beslissing)
Draaien:  python backend/verify_routing.py     (moet PASS blijven; UNKNOWN ≠ FAIL)
          python tools/verify_boundaries.py    (bij data-wijzigingen)
          node --check <gewijzigde .js>        (frontend)
CHANGELOG.md bijwerken · README-dekkingstabel indien zichtbaar voor gebruiker
```
**ADR verplicht bij:** nieuwe provider/bron, nieuwe architectuurlaag, wijziging van
routering/gate/statusmodel, wijziging van `zone_type`/`geometry_status`-semantiek,
afwijzen of toevoegen van scope.

## 6. Projectfilosofie in zes regels
Authority > Severity · Official > Community · Missing > Invented ·
Simple > Clever · Explainable > Black box · Contract > Implementatie

## 6a. Current State (wat is af, wat niet — voorkomt verkeerde aannames)
| Onderdeel | Status |
|---|---|
| IT — Protezione Civile | **Production** (zones + live kleuren + provider) |
| DE — DWD | **Production** (zones + live kleuren + provider) |
| AT — GeoSphere | zones + provider; kleuren nog niet live |
| SI — ARSO | provider live; geometrie **bewust `missing`** (geen officieel vectorbestand) |
| FR — Météo-France | 96 departementen; **nog geen live waarschuwingsprovider** |
| NL — KNMI | 12 provincies (benadering); geen provider; KNMI → polygonen mei 2026 |
| BE — KMI/IRM | 11 provincies; **nog geen live waarschuwingsprovider** |
| Deploy | **Fase B, handmatig** — nog niet uitgevoerd; deploy-kit in `deploy/` |
| Documentatie | Fase A compleet; Fase B (OPERATIONS/INSTALLATION-VM/SECURITY) ná eerste run |

"Geen live provider" ≠ kapot: die landen tonen eerlijk "geen bevoegde bron" (UNKNOWN ≠ FAIL).

## 6b. Open Decisions (bewust nog niet beslist — heropen niet zonder reden)
- **Deployment-automatisering.** Current state: *de handmatige deploy is de bron van waarheid.*
  Volgende stap ná de eerste geslaagde productie-run: `deploy/install.sh` (+ reverse-proxy
  templates). **Ansible is bewust uitgesteld** tot er aantoonbaar behoefte is aan het beheren
  van meerdere omgevingen of meerdere apps met een gedeeld patroon. **Introduceer geen
  Ansible-roles/playbooks tijdens Fase B tenzij deze beslissing expliciet wordt heroverwogen.**
- **TLS/HTTPS.** Interne deploy draait bewust op plain HTTP via nginx (weer.home.lan); geen
  Let's Encrypt. Heroverweeg pas bij externe blootstelling.
- **Kaartgeometrie-formaat.** GeoJSON nu; vector tiles pas overwegen als Leaflet-performance bij
  grote datasets (DWD-gemeenten ~11k) een echt probleem wordt.
- **KNMI-polygonen.** Overstappen zodra KNMI ze publiek maakt (mei 2026); dan wordt NL
  `official`/`meteorological` — een registerwijziging, geen codewijziging.
- **MeteoAlarm als fallback/normalisatielaag.** Alleen als validatie/audit, nooit als primaire
  bron; nu niet nodig.

## 7. Praktisch voor agents
- Werkkopie: projectroot; data die je ophaalt hoort in `frontend/map/data/` en wordt bewaakt
  door `zone_manifest.json` + `/api/data_health`.
- Sandbox zonder internet naar overheidsportalen? Dan bouw je het contract + script en laat
  je de mens de fetch draaien en de output plakken — **nooit gokken wat een endpoint teruggeeft.**
- Antwoorden aan de eigenaar: Nederlands, eerlijk over onzekerheid, geen schijnzekerheid.
