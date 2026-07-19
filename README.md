# Weerwijsheid

Een **persoonlijke weerbeslisser** voor kamperen en reizen door Europa: ruwe meteorologische
data → één menselijk advies, met uitleg waaróm — en met de **juiste officiële autoriteit** per
land. Draait als één Python-proces (Flask) op een Proxmox LXC. Geen database, geen accounts,
geen historiek (ADR-001).

> **Kernvraag:** "Ik zie een weerfenomeen → wat betekent dit → moet ik iets doen?"
>
> **Kernprincipe:** bronnen hebben een *recht van spreken* (ARSO over Slovenië, DWD over
> Duitsland — nooit andersom), en het systeem bewijst dat automatisch. Geen schijnzekerheid:
> wat we niet weten, tonen we als onbekend.

## Snel starten
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                        # tokens optioneel; leeg = mock met zichtbare vlag
python3 tools/fetch_boundaries.py de nl at  # officiële zonegeometrie (IT/FR/BE meegeleverd)
python3 tools/fetch_warning_status.py       # actuele waarschuwingskleuren (IT/DE)
python backend/app.py                       # http://localhost:8080
```
Of alles in één keer (verse machine): `./tools/kickstart.sh`

Verifiëren: `python backend/verify_routing.py` (governance, 14 checks) en
`python tools/verify_boundaries.py` (zonedata tegen het contract).

## Wat het doet
- **Live weerbeslisser**: verdict eerst (Veilig/Opletten/Maatregelen), dan de reden, dan de
  ruwe data per bron — multi-model consensus (ECMWF/ICON/AROME/…) met regiobewuste weging.
- **Officiële waarschuwingen per land**: locatie → land → bevoegde autoriteit
  (IT Protezione Civile · SI ARSO · AT GeoSphere · DE DWD), met status
  WARNING/SAFE/UNAVAILABLE/STALE. Geen bron voor een land? Dan zegt de app dat eerlijk.
- **"Waarom deze bron?"**: de volledige beslisketen + kaart met officiële waarschuwingszones
  in hun echte kleuren, jouw zone opgelicht, en het grove modelvlak eroverheen als contrast.
- **Databron-bewaking**: ontbrekende of verouderde zonedata geeft een banner in de app met
  het herstelcommando (`/api/data_health`).

## Dekking (7 landen)
| Land | Autoriteit | Zones | Live kleuren | Live waarschuwing |
|---|---|---|---|---|
| 🇮🇹 IT | Protezione Civile | ✅ 187 (meteorologisch) | ✅ | ✅ |
| 🇩🇪 DE | DWD | ✅ ~400 Kreise (meteorologisch) | ✅ | ✅ |
| 🇦🇹 AT | GeoSphere Austria | ✅ ~2100 gemeenten | — | ✅ |
| 🇸🇮 SI | ARSO | eerlijk: geen officiële geometrie | — | ✅ |
| 🇫🇷 FR | Météo-France | ✅ 96 departementen | — | — |
| 🇳🇱 NL | KNMI | ✅ 12 provincies (benadering) | — | — |
| 🇧🇪 BE | KMI/IRM | ✅ 11 provincies | — | — |

## Ondersteund platform
Primair deployment-doel: **Debian 13 (Trixie)** · systemd · **Python 3.12+** · nginx of Apache
als reverse proxy. De applicatie draait in een Python virtual environment (geen harde binding
aan een specifieke minor-versie; 3.11 werkt ook, maar 3.12+ is de geteste baseline).

## Structuur
- `backend/` — Flask-app, pipeline, core-engines (`core/`), provider-adapters (`providers/` per rol)
- `frontend/` — decision-first dashboard + kaart (`map/`) + leermodules
- `config/` — locaties, thresholds, regio's, modelregister
- `tools/` — kickstart, fetch_boundaries, fetch_warning_status, verify_boundaries, refresh-cron
- `docs/` — architectuur, ADR's (000–032), contracten, dit plan

## Documentatie
Begin bij `docs/ARCHITECTURE.md`, dan `docs/DECISIONS.md` (de ADR's — het waarom van elke
keuze). Documentatieroadmap: `docs/DOCUMENTATION_PLAN.md`.

## Roadmap & bekende beperkingen
- **Volgende:** Proxmox/Debian-deploy (OPERATIONS-runbook), live kleuren voor AT/FR/NL/BE.
- **Bekend:** SI heeft geen officieel zonebestand (5 ARSO-regio's; vereist MeteoAlarm-token) —
  bewust landcontour i.p.v. verzonnen grenzen. NL waarschuwt t/m mei 2026 per provincie;
  daarna stapt KNMI op polygonen over (registerwijziging, geen codewijziging). Kaart vereist
  internet voor Leaflet-CDN en OSM-tiles.
- **Geparkeerd** (ADR-032): historiek/DB, model-vs-autoriteit-vergelijking, offline tiles,
  notificaties.

## Licentie & data-attributie
Code: **MIT** (`LICENSE`). Data: officiële bronnen met eigen licenties (CC-BY-4.0, GeoNutzV,
ODbL, Licence Ouverte) — attributies in `NOTICE.md`, machine-leesbaar in
`frontend/map/data/zone_sources.json`. Kaart: Leaflet + © OpenStreetMap. Bij hergebruik van de
Franse departementdata (ODbL) geldt share-alike op afgeleide databestanden.
