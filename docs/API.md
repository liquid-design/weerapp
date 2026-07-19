# API — Weerwijsheid

Kleine JSON-API (Flask) op poort 8080. Zelfde proces serveert ook de frontend (`/`).
Geen authenticatie: de app is bedoeld voor één huishouden op een vertrouwd netwerk (LXC/LAN).
Alle antwoorden zijn JSON; fouten dragen `{"error": "..."}` met een passende statuscode.

## Overzicht
| Endpoint | Methode | Doel |
|---|---|---|
| `/api/health` | GET | Leeft de server? |
| `/api/locations` | GET / POST | Locaties lezen / toevoegen |
| `/api/locations/<name>` | DELETE | Locatie verwijderen |
| `/api/geocode?q=` | GET | Plaats zoeken (Nominatim) |
| `/api/current?location=` | GET | **Het advies** (kern-endpoint) |
| `/api/context?location=` | GET | Geo-autoriteitscontext ("Waarom deze bron?") |
| `/api/data_health` | GET | Gezondheid van de zonedata |
| `/api/feedback` (+`/summary`, `/analysis`) | POST / GET | Menselijke correctielaag |

## Endpoints

### `GET /api/health`
→ `{"status": "ok"}`

### `GET /api/locations` · `POST /api/locations` · `DELETE /api/locations/<name>`
- GET → lijst van locaties: `[{"name","lat","lon","country"?,"region"?,"alert_zone"?}]`
- POST body: `{"name","lat","lon","country"?,"alert_zone"?}` → `{"ok":true}` of **409** bij
  duplicaatnaam. `country` komt van de geocoder en is gezaghebbend (ADR-030); ontbreekt hij,
  dan backfillt de eerste `/api/current`-aanroep hem via reverse-geocoding.
- DELETE → `{"ok":true|false}`

### `GET /api/geocode?q=<zoekterm>`
Zoekt via Nominatim. → lijst kandidaten `[{"name","lat","lon","type","country"}]`.
**400** bij lege query, **502** als Nominatim niet antwoordt.

### `GET /api/current?location=<naam>&accommodation=<tent|vouwwagen|caravan|camper>&force=<1>`
Het kern-endpoint: bouwt het volledige advies (cache-TTL; `force=1` omzeilt de cache).
**404** bij onbekende locatie. Antwoord (ingekort):
```json
{
  "location": "Camping Eden", "country": "IT",
  "region": {"name": "Alpen", "models": ["Open-Meteo ICON-D2", "..."], "dominant": "ICON-D2"},
  "verdict": "…", "decision": {"level": "yellow", "action": "…"}, "reason": "…",
  "confidence": {"pct": 85, "label": "hoog"},
  "factors": [{"field": "cape", "value": 736.9, "sources": [...], "confidence": 89}],
  "warning": {"status": "SAFE", "authority": "Protezione Civile",
               "level": "GREEN", "confidence": "HIGH", "reason": "…", "expires": null},
  "warning_routing": {"country": "IT", "selected": ["Protezione Civile"],
                       "rejected": [...], "steps": [{"provider","decision","reason"}]},
  "cache": "hit|miss", "updated": "…", "expires": "…"
}
```
`warning.status` ∈ WARNING · SAFE · UNAVAILABLE · STALE — **UNAVAILABLE ≠ SAFE** (ADR-030 C3).

### `GET /api/context?location=<naam>`
De keten locatie → land → regio → autoriteit → modellen (voedt "Waarom deze bron?" en de kaart).
**404** bij onbekende locatie.
```json
{
  "location": "Camping Šobec", "country": "SI", "region": "Gorenjska",
  "meteo_region": "Alpen",
  "authority": {"provider": "ARSO", "scope": "national", "confidence": "HIGH"},
  "warning_state": "national",
  "models": [{"name": "ICON-D2", "resolution_km": 2.2, "cell_km2": 5, "coverage": "Europa"}],
  "data_sources": {"forecast": [...], "observation": [...], "warning": ["ARSO"]},
  "layers": ["authority_area:SI", "model_coverage:ICON-D2", "..."],
  "trace": [{"provider": "Protezione Civile", "decision": "REJECTED", "reason": "alleen IT"}],
  "note": null
}
```

### `GET /api/data_health`
Beoordeelt register + manifest (ADR-031/032). Voedt de databanner in de app.
```json
{"ok": false, "generated": "2026-07-18T…",
 "issues": [{"level": "warn|info", "country": "DE",
              "msg": "DWD: zone-geometrie ontbreekt lokaal — draai kickstart/refresh"}]}
```
Regels: bestand aanwezig = OK · ontbrekend = **warn** · verversing gefaald maar bestand
aanwezig = **info** · `geometry_status: missing` (bewust, bv. SI) = géén melding.

### `POST /api/feedback` · `GET /api/feedback/summary` · `GET /api/feedback/analysis`
Append-only menselijke correctielaag (zie DATA_MANAGEMENT pijler 2). POST body: het
beslismoment + oordeel; → `{"ok":true}` of **400**. Summary/analysis aggregeren de log.

## Statische data-endpoints (frontend leest deze direct)
`/map/data/zone_sources.json` (register) · `/map/data/<land>.geojson` (zones) ·
`/map/data/warning_status.json` (kleuren) · `/map/data/zone_manifest.json` (fetch-log).
Contract: `frontend/map/data/zone.schema.json`.

## Wijzigen van de API
Volg AGENTS.md §4: app.py → dit document → frontend → CHANGELOG. Backwards-compatibel waar
mogelijk; velden verwijderen of hernoemen = minor/major bump (GOVERNANCE.md).
