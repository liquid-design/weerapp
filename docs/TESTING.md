# TESTING — Weerwijsheid

De teststrategie is bewust **uitvoerbaar in plaats van documentair**: de belangrijkste
garanties leven als verifiers in de repo. Dit document zegt wat elke verifier bewaakt,
hoe je hem draait en wanneer.

## 1. De twee verifiers (contract- én regressietests)
### `python backend/verify_routing.py` — governance-verifier
Bewaakt de bestuurlijke kern (ADR-030): *mag deze bron over deze locatie spreken?*
- **Cases** in `backend/tests/warning_routing_cases.json` (testdata = documentatie):
  regressie ("bug never returns": Bled/Šobec/Tirol → nooit meer Protezione Civile),
  breekpunten (Dreiländereck → exact één autoriteit; Bormio/Trieste), no-source
  (BE/NL → UNAVAILABLE, geen silent green), en de **collision-test**
  (IT-rood vs SI-geel op Sloveens grondgebied → ARSO wint: autoriteit > ernst).
- Plus 4 **statusdemo's** (WARNING/SAFE/UNAVAILABLE/STALE; UNAVAILABLE ≠ SAFE).
- Uitkomsten: **PASS / FAIL / UNKNOWN** — UNKNOWN (geen dekking) ≠ FAIL (regressie).
  Exit-code 1 alleen bij FAIL → bruikbaar als CI-poort. Verwacht: **14+ PASS · 0 FAIL**.

### `python tools/verify_boundaries.py [landen]` — datacontract-validatie
Elk zonebestand tegen `zone.schema.json`: aantal features, verplichte properties,
CRS-indicatie (coördinaten binnen WGS84-bereik), model-compleetheid, `_source`-attributie.

## 2. Overige checks
- **Smoke**: `python backend/app.py` + `curl /api/health` en `/api/data_health`.
- **Frontend-syntax**: `node --check frontend/app.js frontend/map/*.js`.
- **Pure-functie-unittests** zitten in de verifiers zelf (bv. `_parse` van providers wordt
  met synthetische data getest bij ontwikkeling); aparte pytest-suite is bewust niet
  opgetuigd zolang de verifiers de contracten dekken (afweging: onderhoud vs. dekking).
- **Afgewezen**: performance-tests (één gebruiker, JSON-bestanden — geen reëel risico).

## 3. Wanneer draaien (Definition of Done, zie GOVERNANCE)
| Moment | Verplicht |
|---|---|
| Elke wijziging aan routing/providers/statusmodel | verify_routing |
| Elke wijziging aan zonedata/loaders/register | verify_boundaries |
| Elke frontend-wijziging | node --check |
| Vóór elke release/tag | beide verifiers + smoke |

## 4. Een nieuwe testcase toevoegen
Routering: voeg een case toe aan `warning_routing_cases.json` (met `expected` en
`must_not_select`) — de verifier pikt hem automatisch op. Data: nieuwe landen worden door
`verify_boundaries.py` automatisch meegenomen zodra het bestand bestaat.
