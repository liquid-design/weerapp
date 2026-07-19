# DATA MANAGEMENT — Weerwijsheid v3

De applicatie is een decision-support tool, geen meteorologisch archiefsysteem. De opslaglaag
is daarom bewust triviaal: alleen JSON, geen database (ADR-001). Alle state past in vier kleine
pijlers, elk met één verantwoordelijkheid.

## Pijler 1 — Actuele snapshot (vluchtig)
Per locatie één bestand `backend/cache/<slug>.json`.
- Bevat de laatst opgehaalde readings + het samengestelde advies.
- Draagt `updated` en `expires`. Bij openen: `expires` verstreken? → opnieuw ophalen, anders → cache tonen.
- Overschrijfbaar en wegwerpbaar; verwijderen = simpelweg opnieuw ophalen. Geen historie.

Ordegrootte: ~24 uur + 7×24 forecast ≈ 192 datapunten per locatie; 20 locaties ≈ 3.840. Minuscuul.

## Pijler 2 — Append-only beslislog (klein, blijvend)
`data/feedback.json` — de "menselijke correctielaag".
- Eén regel per feedbackmoment: advies, weercontext (de bepalende waarden), menselijk oordeel, tijd.
- **Geen weerhistoriek**: geen periodieke weerpunten, alleen beslispunten met een oordeel.
- Append-only en atomair geschreven. Ordegrootte: tientallen regels per jaar.

## Pijler 3 — Configuratieversies
`config/thresholds.json` draagt een `version` (bv. `2026.07.1`).
- Elke feedback-regel bewaart de versie die actief was bij het advies (`thresholds_version`).
- Hierdoor blijft regelvalidatie zuiver: feedback over verschillende drempelsets vermengt niet.
- Werkwijze: pas je een drempel aan, bump dan de versie. Oude feedback houdt zijn eigen stempel.

## Pijler 4 — Periodieke samenvattingen (afgeleid, geen bron)
Berekend uit de beslislog, niet apart opgeslagen:
- `GET /api/feedback/summary` — ruwe telling per niveau.
- `GET /api/feedback/analysis` — **kalibratie** per niveau én configuratieversie: welk aandeel
  van de adviezen was *juist*, *te zwaar* (te voorzichtig / viel mee) of *te licht* (te laat /
  erger dan verwacht). Dit is de "regel X was 87% correct"-analyse.

Kalibratie-interpretatie van het menselijk oordeel:
| Oordeel | Betekenis voor de regel |
|---|---|
| perfect | juist |
| te voorzichtig | te zwaar (loos alarm) |
| viel mee | te zwaar |
| te laat | te licht (gemist) |
| erger dan verwacht | te licht |

## Wat dit expliciet NIET is
- Geen SQL/NoSQL/TimeSeries-database (ADR-001, GOVERNANCE §8).
- Geen weerarchief of tijdreeksanalyse over maanden/jaren.
- Geen machine learning op de feedback (ADR-019, GOVERNANCE §9) — eerst statistiek, eerst
  regelvalidatie. Pas bij een concrete vraag die statistiek niet kan beantwoorden, en pas na een
  expliciete ADR, komt een model eventueel in beeld.

## Waarom dit voldoende is
De waarde van de software zit in bronnen combineren, confidence berekenen, beslissen uitleggen en
transparantie tonen — niet in datamanagement. Voor enkele honderden JSON-records per week is een
database geen oplossing maar extra complexiteit. De eenvoudigste architectuur die het probleem
volledig oplost, wint.

---

# Deel 2 — Data Governance (regels; ADR-031/032)

De pijlers hierboven beschrijven *opslag*. Dit deel beschrijft de *regels* voor externe
geodata en waarschuwingsstatus. **Het bronregister zelf is machine-leesbaar en leidend:**
`frontend/map/data/zone_sources.json` (per land: autoriteit, `zone_type`, `geometry_status`,
bron-URL, licentie, CRS, sleutelattribuut). Dit document herhaalt die inhoud niet.

## G1. Autoriteitsprincipe
Eén bevoegde bron per land (de nationale weerdienst/civiele bescherming). Community- of
afgeleide data mag alleen als het register dat expliciet zegt (`geometry_status: derived` of
een note), nooit stilzwijgend. Autoriteit > ernst (ADR-030).

## G2. Kwaliteits- en validatieregels
- Elk zonebestand voldoet aan `zone.schema.json`: verplichte properties
  (`zone_id`, `country`, `authority`, `zone_type`, `geometry_status`, `zone`, `level`),
  geometrie Polygon/MultiPolygon.
- Validatie is uitvoerbaar, niet documentair: `python tools/verify_boundaries.py [landen]`
  controleert features, properties, CRS-indicatie en contract-compleetheid.
- `zone_id` = `<LAND>-<source_key-waarde>` en is de koppelsleutel tussen geometrie en
  `warning_status.json`. Weergavenaam (`zone`) is nooit de ID.

## G3. CRS-beleid
Opslag en rendering altijd **EPSG:4326 (WGS84)**. Bronnen in nationale stelsels
(NL 28992 · BE 31370/3812 · AT 31287) worden bij de build herprojecteerd (pyproj). Zonder
werkende herprojectie wordt een land **overgeslagen**, nooit met verkeerde coördinaten
weggeschreven. Coördinaten worden afgerond (~2–3 decimalen) en ontdubbeld voor bestandsgrootte.

## G4. Updatebeleid (cadans)
| Wat | Ritme | Hoe |
|---|---|---|
| Zonegeometrie | maandelijks (grenzen wijzigen zelden) | `tools/refresh_zones.sh` (cron) of handmatig `fetch_boundaries.py` |
| Waarschuwingskleuren | dagelijks of vaker (gebruikerskeuze) | `fetch_warning_status.py` (zit in refresh-script) |
| Bewaking | continu | `zone_manifest.json` → `/api/data_health` → banner in de app |
Ophalen is altijd een **bewuste build-stap**; runtime heeft geen externe geodata-afhankelijkheid.

## G5. Eerlijkheidsregels (hard)
- Geen officiële geometrie → `missing`: landcontour + melding, **nooit verzonnen grenzen** (SI).
- Geen statuskoppeling → neutrale kleuren + "waarschuwingskleuren: onbekend" (ADR-032).
- Benadering is zichtbaar: `approximation` staat in de legenda (NL-provincies tot de
  KNMI-polygoonovergang, die een registerwijziging is — geen codewijziging).

## G6. Licenties & attributie
Licentie per bron staat in het register (CC-BY-4.0 · GeoNutzV · Licence Ouverte · ODbL —
alle met naamsvermelding). Attributie reist mee in het `_source`-veld van elk gegenereerd
geojson-bestand en in de kaartlegenda/popups waar relevant. Bij herpublicatie van het project:
controleer de attributie-eisen per bron opnieuw.

## G7. Metadata-standaard
Elk gegenereerd databestand draagt: `_source` (bron + licentie), en via het manifest
`fetched_at`/`ok`/`n_zones`. Het register draagt de vaste metadata (CRS, sleutel, note met
beperkingen). Meer metadata-formaliteit (ISO 19115 e.d.) is bewust afgewezen: overhead zonder
afnemer.
