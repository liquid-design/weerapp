# Kaartdata — welke bestanden zijn "vast" en welke haal je zelf op

## Meegeleverd in de repo (blijven altijd staan)
- `zone_sources.json` — het bronnenregister (ADR-031), leidend voor alle landen
- `zone.schema.json` — het contract waartegen opgehaalde geometrie wordt getoetst
- `authority_regions.geojson` — landcontouren (Natural Earth)
- `model_coverage.geojson` — grove model-footprints
- `italy_alert_zones.geojson` — Italiaanse zones (Protezione Civile)
- `france_vigilance_departements.geojson` — Franse departementen (Météo-France)

## Zelf ophalen met `tools/fetch_boundaries.py` (NIET in de repo — te groot / dagelijks vers)
- `germany_warn_kreise.geojson` — `python tools/fetch_boundaries.py de`
- `netherlands_provinces.geojson` — `python tools/fetch_boundaries.py nl`
- `austria_gemeinden.geojson` — `python tools/fetch_boundaries.py at`
- (later) `belgium_provinces.geojson`, `slovenia_regions.geojson`

**Belangrijk:** haal je een nieuwe projectversie op, draai dan opnieuw:
```
python tools/fetch_boundaries.py de nl at
```
De kaart controleert zelf of een bestand aanwezig is; ontbreekt het, dan toont hij eerlijk
"nog geen officiële zone-geometrie" i.p.v. te breken.
