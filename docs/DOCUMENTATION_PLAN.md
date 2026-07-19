# Documentatieplan Weerwijsheid — voorstel (v1)

**Doel.** Van Weerwijsheid een volwassen, onderhoudbaar en overdraagbaar project maken zonder een
documentatieberg te creëren die zelf ononderhoudbaar wordt. Leidend principe (zelfde als de code):
**één document, één verantwoordelijkheid — en machine-leesbare bronnen zijn de waarheid, documenten
verwijzen ernaar.**

**Kernbeslissing.** De wensenlijst (±70 documenten) is gecomprimeerd naar **13 documenten**
(waarvan 7 al bestaan en opgewaardeerd worden) in drie fasen. Elk geschrapt item is niet weggegooid
maar **geconsolideerd** — zie de consolidatietabel onderaan.

---

## 0. Wat er al is (niet dupliceren)

| Bestaand | Verantwoordelijkheid | Status |
|---|---|---|
| `docs/DECISIONS.md` | ADR-log (ADR-000…032) — het geheugen van elke ontwerpkeuze | ✅ actueel |
| `docs/ARCHITECTURE.md` | Architectuuroverzicht | 🔸 opwaarderen (Fase A) |
| `docs/GOVERNANCE.md` | Werkwijze/repo-governance | 🔸 opwaarderen (Fase A) |
| `docs/DATA_MANAGEMENT.md` | Datastromen/cache | 🔸 opwaarderen → Data Governance (Fase A) |
| `docs/INSTALLATION.md` | Installatie | 🔸 uitbreiden met LXC (Fase B) |
| `docs/WARNING_PROVIDER_CONTRACT.md` | Contract voor warning-providers | ✅ |
| `docs/WARNING_ROUTING_TEST_SPEC.md` | Testspecificatie routering | ✅ |
| `frontend/map/data/zone_sources.json` + `zone.schema.json` | **Machine-leesbaar bronregister + contract** — dé waarheid over databronnen, licenties, CRS, zone_type | ✅ |
| `backend/verify_routing.py`, `tools/verify_boundaries.py` | Uitvoerbare contract-/regressietests | ✅ |
| `tools/kickstart.sh` | Bootstrap in één commando | ✅ |
| `frontend/map/data/README.md` | Vast vs. op-te-halen data | ✅ |

---

## Fase A — nu, vóór de deploy

### A0. `AGENTS.md` (root) + dunne `CLAUDE.md` — nieuw ✅ (geschreven)
- **Waarom:** de ingang voor élke nieuwe sessie (AI of mens): leesvolgorde, waarheidstabel,
  verboden aannames, taakmatrix mét impactketen, vaste workflow. Voorkomt dat een nieuwe agent
  bij de code begint en expres-zo-gebouwde keuzes "verbetert".
- **Doelgroep:** AI-agents + nieuwe ontwikkelaars. **Omvang:** 2 pagina's. **Prioriteit: MUST.**
- **Consolideert:** PROJECT_INDEX, AI_ONBOARDING, CHANGE_IMPACT (impactketen zit in de
  taakmatrix). *Afgewezen: `index.yaml` (dupliceert de waarheidstabel — synchronisatierisico);
  losse PROJECT_INDEX/CHANGE_IMPACT-documenten.* `CLAUDE.md` blijft dun en verwijst alleen
  (Claude Code leest hem automatisch; de inhoud woont in AGENTS.md).


### A1. `README.md` (root) — opwaarderen ✅
- **Waarom:** de voordeur. Product-overzicht, Quick Start én roadmap in één; het eerste (vaak enige) dat een overnemer leest.
- **Doelgroep:** iedereen. **Omvang:** 1–2 pagina's. **Prioriteit: MUST.**
- **Afhankelijkheden:** kickstart.sh, INSTALLATION.md.
- **Absorbeert:** Product-overzicht, Quick Start/Getting Started, Roadmap, Known Limitations.

### A2. `docs/USER_GUIDE.md` — nieuw ✅
- **Waarom:** de concepten (statusmodel, zone_type, confidence, kaartlagen, databanner) in één naslagplek, inclusief FAQ en herstelacties.
- **Doelgroep:** gebruiker. **Omvang:** 3–4 pagina's. **Prioriteit: MUST.**
- **Absorbeert:** Gebruikershandleiding, FAQ, Troubleshooting (gebruikerskant).

### A3. `docs/ARCHITECTURE.md` — opwaarderen tot SAD-light ✅
- **Waarom:** één architectuurdocument: componenten, dataflow en de twee kernsequenties (advies-opbouw; warning-routering) als tekst/mermaid. Geen losse diagramdocumenten die los van de tekst verouderen.
- **Doelgroep:** ontwikkelaar/overnemer. **Omvang:** 4–6 pagina's. **Prioriteit: MUST.**
- **Afhankelijkheden:** DECISIONS.md (verwijst naar ADR's i.p.v. herhalen).
- **Absorbeert:** SAD, Design Document, Data Architecture, Zone Architecture, Component-/Sequence-/Dataflow-diagrammen, Folderstructuur, Mapping-documentatie.

### A4. `docs/API.md` — nieuw ✅
- **Waarom:** de Flask-API is klein maar hét koppelvlak; alle endpoints met request/response-voorbeeld.
- **Doelgroep:** ontwikkelaar. **Omvang:** 2 pagina's. **Prioriteit: MUST** (klein, hoge waarde).

### A5. `docs/DATA_MANAGEMENT.md` — opwaarderen tot Data Governance ✅
- **Waarom:** één plek voor het databeleid. **Het bronregister blijft `zone_sources.json`** (autoriteitsmatrix, licenties, CRS, updatebeleid staan dáár per land); dit document beschrijft de *regels*: kwaliteits-/validatie-eisen (zone.schema.json), CRS-beleid (alles → EPSG:4326), updateritme (maandelijks geometrie, dagelijks kleuren), eerlijkheidsregel (missing ≠ verzinnen).
- **Doelgroep:** ontwikkelaar/overnemer. **Omvang:** 2–3 pagina's. **Prioriteit: MUST.**
- **Afhankelijkheden:** zone_sources.json, zone.schema.json, ADR-031/032.
- **Absorbeert:** Bronregister (verwijst), Autoriteitsmatrix (verwijst), Datakwaliteitsregels, Validatieregels, Licenties, Updatebeleid per bron, CRS-beleid, Metadata-standaard.

### A6. `docs/TESTING.md` — nieuw ✅
- **Waarom:** de teststrategie bestaat al ín code (verify_routing = contract-/regressietest van de governance; verify_boundaries = datavalidatie); dit document maakt expliciet wat elke verifier bewaakt, hoe je ze draait en wanneer (DoD: verifiers groen vóór elke release).
- **Doelgroep:** ontwikkelaar. **Omvang:** 2 pagina's. **Prioriteit: SHOULD.**
- **Absorbeert:** Unit-/Integratie-/Contract-/Regressietests, Validatie zonebestanden/databronnen, Smoke test. *Afgewezen: performance-tests (één gebruiker, JSON-bestanden — geen reëel risico).*

### A7. `CHANGELOG.md` (root) — nieuw ✅
- **Waarom:** vanaf nu elke wijziging in Keep-a-Changelog-stijl met SemVer (huidig: 3.x). Release Notes = bovenste sectie; geen apart document.
- **Doelgroep:** iedereen. **Omvang:** groeit. **Prioriteit: SHOULD.**
- **Absorbeert:** CHANGELOG, Release Notes, Semantic Versioning, Backwards Compatibility (afsprakensectie bovenaan).

### A8. `docs/GOVERNANCE.md` — opwaarderen ✅
- **Waarom:** werkwijze op maat: main-only + tags (geen branching-theater voor één ontwikkelaar), SemVer-beleid, Definition of Done (verifiers groen, ADR bij architectuurwijziging, CHANGELOG bij), review-checklist (de vaste vragen: bevoegdheid? schijnzekerheid? contract?).
- **Doelgroep:** ontwikkelaar/overnemer. **Omvang:** 2 pagina's. **Prioriteit: SHOULD.**
- **Absorbeert:** Repository Governance, Branching Strategy, Versioning Policy, Release Procedure, DoD, Review Checklist, Coding Standards, Python Style Guide (drie regels: PEP8, Nederlandse docstrings met *waarom*, bestaande conventies — een aparte styleguide is overhead).

## Fase B — samen met de Proxmox-deploy

### B1. `docs/OPERATIONS.md` — nieuw (het runbook)
- **Waarom:** beheer van de draaiende app: start/stop (systemd), cron-schema (refresh_zones + warning_status), logs, wat `/api/data_health` bewaakt, back-up (config/ + locations.json — de rest is reproduceerbaar), update- en herstelprocedure (kickstart = recovery).
- **Doelgroep:** beheerder. **Omvang:** 3 pagina's. **Prioriteit: MUST bij deploy.**
- **Absorbeert:** Logging, Monitoring, Error Handling (operationeel), Backup, Update-/Build-/Release-/Recovery-procedure.

### B2. `docs/INSTALLATION.md` — LXC-sectie
- **Prioriteit: MUST bij deploy.** Debian LXC, netwerk-allowlist (deels aanwezig), systemd-unit, eerste kickstart.

### B3. `SECURITY.md` (root) — nieuw
- **Waarom:** kort en eerlijk: secrets alleen in `.env` (inclusief de les van de gelekte keys: roteren), dependency-beleid (pinnen, maandelijkse check), mini-dreigingsmodel (lokale app, geen accounts, geen persoonsgegevens behalve zelfgekozen locaties → privacy in één alinea), disclosure-adres.
- **Doelgroep:** ontwikkelaar/melder. **Omvang:** 1–2 pagina's. **Prioriteit: SHOULD** (MUST bij open source).
- **Absorbeert:** Security Policy, Responsible Disclosure, Dependency Policy, Secrets Management, API Key Handling, Privacy Statement, Threat Model.

## Fase C — alleen als het project openbaar wordt

| Document | Prioriteit dan | Notitie |
|---|---|---|
| `LICENSE` | MUST | Keuzemoment: MIT (maximaal open) of EUPL (Europees copyleft). Databronnen hebben eigen licenties (CC-BY/GeoNutzV/ODbL) — attributie staat al in zone_sources.json. |
| `CONTRIBUTING.md` | SHOULD | Verwijst naar GOVERNANCE.md + kickstart; geen duplicatie. |
| `CODE_OF_CONDUCT.md`, `SUPPORT.md` | NICE | Standaard-templates. |
| `AUTHORS` / `ACKNOWLEDGEMENTS` | NICE | Databron-attributies + architect + AI-assistentie eerlijk vermelden. |
| `CITATION.cff` | NICE | Alleen zinvol bij academisch hergebruik. |

---

## Consolidatietabel (waar elk gevraagd item landde)

| Gevraagd | Landt in |
|---|---|
| Quick Start, Product-overzicht, Roadmap, Known Limitations | README.md |
| Kickstart, Dev Setup, bootstrap/setup/verificatie/smoke, "één commando" | kickstart.sh (bestaat) + README §Development |
| FAQ, Troubleshooting, Gebruikershandleiding | USER_GUIDE.md |
| SAD, Design Doc, Data/Zone Architecture, alle diagrammen, folderstructuur, mapping | ARCHITECTURE.md |
| ADR's | DECISIONS.md (bestaat) |
| Bronregister, autoriteitsmatrix, licenties, updatebeleid, CRS, metadata, validatie | zone_sources.json (waarheid) + DATA_MANAGEMENT.md (regels) |
| Alle test-typen | TESTING.md + bestaande verifiers |
| Branching, versioning, release, DoD, review, coding standards, style guide | GOVERNANCE.md |
| Alle security/privacy-items | SECURITY.md |
| Alle operations-items | OPERATIONS.md |
| CHANGELOG, Release Notes, SemVer, compatibiliteit | CHANGELOG.md |
| Open-source-bestanden | Fase C |

**Bewust afgewezen:** performance-teststrategie (geen reëel risico op deze schaal), losse
diagram-documenten (verouderen los van de tekst), aparte style guide (drie regels volstaan),
aparte Release Notes naast CHANGELOG (duplicatie).

## Volgorde van schrijven
1. **A1 README** → 2. **A3 ARCHITECTURE** → 3. **A5 DATA_MANAGEMENT** → 4. **A4 API** →
5. **A2 USER_GUIDE** → 6. **A7 CHANGELOG + A8 GOVERNANCE + A6 TESTING** → *(deploy)* →
7. **B1 OPERATIONS + B2 LXC-sectie + B3 SECURITY** → *(indien openbaar)* → Fase C.
