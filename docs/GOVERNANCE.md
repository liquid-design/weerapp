# GOVERNANCE — Weerwijsheid v2

Dit document beschrijft de regels waarbinnen het project verandert. Doel: het systeem klein,
begrijpelijk en veilig houden.

## 1. Rolverdeling
- **Architect/reviewer:** zet kaders, keurt architectuurwijzigingen goed.
- **Bouwer:** implementeert binnen de kaders, maakt technische keuzes, documenteert.
- Onzekerheden worden **gedocumenteerd, niet geblokkeerd**.

## 2. Wijzigingsregels
1. Elke architectuurbeslissing wordt vastgelegd als **ADR** in `docs/DECISIONS.md`.
2. Een wijziging die het datamodel raakt, past **eerst** `ARCHITECTURE.md` §5 aan, dan de code.
3. Geen nieuwe runtime-afhankelijkheid zonder ADR (houd `requirements.txt` minimaal).
4. Geen database, geen extra langdraaiende service zonder expliciete architectengoedkeuring.
5. Kleine, werkende stappen boven grote herschrijvingen. Eerst MVP, dan audit.

## 3. Procedure: een nieuwe databron (provider) toevoegen
1. Bepaal de **rol**: forecast / observation / warning / airquality / lightning / radar.
2. Maak `backend/providers/<rol>/<naam>.py` met een klasse die van `Provider` erft.
3. Implementeer `read(lat, lon) -> list[reading]`; geef **canonieke** velden terug
   (bv. `wind_gust`, `cape`) via `self.reading(field, value)`. Nooit bron-specifieke veldnamen.
4. Registreer de provider in `backend/pipeline.py` (`_providers()`).
5. Token nodig? Voeg de naam toe aan `.env.example` (leeg) en lees hem via `config.TOKENS`.
6. Drempels horen in `config/thresholds.json`, niet in de engine. Leg een ADR vast.

## 4. Security-regels (hard)
- API-tokens staan **uitsluitend** in `.env` (nooit in HTML, JS, Git of cache).
- `.env` staat in `.gitignore`; alleen `.env.example` wordt gecommit.
- De frontend krijgt **nooit** tokens of directe API-URL's; alle externe calls lopen via de backend.
- Cachebestanden bevatten alleen genormaliseerde weerdata, geen secrets.
- Bij twijfel over een veld: niet loggen, niet in URL-parameters zetten.

## 5. Documentatieverplichtingen
Een pull request / wijziging is pas "klaar" als:
- [ ] `DECISIONS.md` een ADR bevat als de architectuur wijzigt;
- [ ] `ARCHITECTURE.md` klopt met de code;
- [ ] `INSTALLATION.md` klopt als de opstartwijze wijzigt;
- [ ] `.env.example` alle vereiste tokens noemt (leeg).

## 6. Beslisengine-governance
- De engine is **regelgebaseerd**. Geen AI, geen machine learning in de MVP.
- Drempels wonen in `config/thresholds.json`, niet in code.
- Elke risico-uitkomst levert **altijd** een `reason[]` én een `action` — geen "kaal" niveau.
- Een regel toevoegen: eerst drempel/definitie in config, dan de regel in `decision_engine.py`,
  dan een korte test/mock-verificatie.

## 7. Definition of Done (MVP)
Zie `docs/DECISIONS.md` ADR-000 en de acceptatiecriteria in de projectprompt.

## 8. Verboden opslagtechnologieën (ADR-001)
De volgende technologieën zijn **verboden** tenzij een latere expliciete ADR ze goedkeurt:
SQLite · PostgreSQL · MariaDB · MySQL · MongoDB · InfluxDB · TimescaleDB · Redis.

Reden: de opslaglaag moet triviaal blijven. Alle state past in JSON-bestanden
(`config/locations.json`, per-locatie `backend/cache/<slug>.json`, `data/feedback.json`).
Complexiteit hoort in de Decision-/Confidence-/Explainability-laag, niet in opslag. Wie een
database wil introduceren, schrijft éérst een ADR met concrete noodzaak (bv. multi-user,
langjarige analyse) die deze regel expliciet vervangt.

## 9. Verboden: machine learning op feedback (ADR-019)
Feedback wordt uitsluitend statistisch geanalyseerd (kalibratie per niveau/versie). Een
ML-/AI-model trainen op de feedbackdata is **verboden** tenzij een latere expliciete ADR dit
goedkeurt met een concrete vraag die statistiek niet kan beantwoorden. De waarde zit in
regelvalidatie en transparantie, niet in een black-box-model.

---

## 6. Versionering & releases (aanvulling Fase A)
- **SemVer** (zie afspraak bovenin `CHANGELOG.md`). Huidige lijn: 3.x.
- **Branching:** main-only + git-tags per release. Bewust géén feature-branch-proces voor
  één ontwikkelaar; discipline zit in kleine commits per beslissing (zoals ADR-030 C1–C5).
- **Releaseprocedure:** verifiers groen → CHANGELOG-sectie afronden → tag `vX.Y.Z` → zip/deploy.

## 7. Definition of Done
Een wijziging is klaar als: (1) `verify_routing.py` PASS blijft, (2) `verify_boundaries.py`
groen bij datawijzigingen, (3) `node --check` op geraakte JS, (4) ADR geschreven bij
architectuur-/gedragswijziging, (5) CHANGELOG bijgewerkt, (6) README-dekkingstabel klopt
indien gebruikerszichtbaar, (7) geen secrets in de diff.

## 8. Review-checklist (de vaste vragen)
1. **Bevoegdheid** — spreekt elke bron alleen over z'n eigen gebied? (autoriteit > ernst)
2. **Schijnzekerheid** — wordt iets getoond dat we niet echt weten? (missing > invented)
3. **Contract** — is register/schema aangepast vóór de code, en dekt een verifier het?
4. **Eenvoud** — kan het met minder? (geen DB, geen framework, geen extra dependency zonder ADR)
5. **Uitlegbaarheid** — kan de UI nog uitleggen waaróm?

## 9. Codestijl (drie regels — bewust geen aparte styleguide)
PEP8 · Nederlandstalige docstrings die het **waarom** uitleggen (niet het wat) ·
volg de bestaande conventies van het bestand dat je aanraakt.
