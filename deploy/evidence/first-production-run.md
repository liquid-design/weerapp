# Bewijsstuk — eerste productie-run (invullen tijdens de deploy)

Geen logboek maar een referentiedocument: waarom is dit de baseline?

| Veld | Waarde |
|---|---|
| Datum/tijd (UTC) | 2026-07-19 · build 14:02:30Z · service actief 14:08:24Z |
| Machine hostname | `weer` (infrastructuur) |
| Application/service name | weerwijsheid (workload) |
| VM-id | Proxmox-VM `weer` op VLAN 30, **10.10.30.110** (verhuisd van 10.10.10.110 tijdens deploy); numeriek VM-id nog aanvullen vanuit Proxmox |
| OS + kernel | Debian GNU/Linux 13 (trixie) · kernel `6.12.95+deb13-amd64` |
| Git-commit (app) | `b5c2cc334bc82426b5f6f480cd2617aeb2be6ec3` (`b5c2cc3`) — v3-app in repo gezet + gepusht, daarna gekloond naar `/opt/weerwijsheid/app` |
| Eerste geslaagde build | `fetch_boundaries.py it` → IT meegeleverd, 187 zones, manifest `ok` · `fetch_warning_status.py it` → live-bulletin **FOUT** (upstream feed bevroren, zie UNKNOWN), bestaande `warning_status.json` behouden |
| Manifest-hash | `sha256:c7c6a85a97fb4fbe12f7f04f53c378c2d53ef9a928f0c059a3b76f3e81a11501` (`frontend/map/data/zone_manifest.json`; IT ok, 187 zones, fetched 2026-07-19T14:02:30Z) |
| verify_routing | **14 PASS / 0 FAIL / 0 UNKNOWN** |
| verify_boundaries (IT) | CRS **EPSG:4326 OK**, 187 features. Model-contract per-feature toont "MIST: zone_id, country, authority, zone_type, geometry_status" — die velden zitten in het register (`zone_sources.json`), niet per zone; informatief, geen defect |
| Bekende UNKNOWN-gevallen | (1) **IT live-kleuren**: Protezione-Civile-bulletin op het gecodeerde GitHub-pad is bevroren sinds sept 2022 (nieuwste `20220903_1523.json`) → `warning_status.json` `sources.IT.ok=false`; app toont dit eerlijk, geen verzonnen kleur (UNKNOWN ≠ FAIL). (2) **DE/NL/AT** geometrie niet lokaal — mijlpaal 1 deed enkel `it`; uitrol via `fetch_boundaries.py all`. (3) **SI** heeft per ontwerp geen officieel zonebestand (ARSO-regio's, MeteoAlarm-token vereist) |
| Afwijkingen t.o.v. checklist | 1. **Bron = git, maar de app stond niet in de repo** → v3 in repo-root gecommit + gepusht (`43758ca → b5c2cc3`) en op de VM gekloond via SSH agent-forwarding (VM had geen deploy-key). 2. **VM verhuisde 10.10.10.110 → 10.10.30.110 (VLAN 30)** tijdens de deploy (zelfde host-key geverifieerd); checklist-stap 10 noemt nog 10.10.10.110 — **DNS A-record wijst correct naar 10.10.30.110**. 3. **DNS-resolutie voor clients**: de VM-resolver (gateway 10.10.30.1) en de WireGuard-DNS (10.200.0.1) serveren de `home.lan`-zone niet; het record staat correct op Technitium **10.10.30.10/.20** → client-resolver moet naar Technitium wijzen. 4. Systeem is een **VM, geen LXC** (checklist noemt LXC op één plek). 5. `HOST=127.0.0.1` gezet in `config/env`; app luistert lokaal, nginx (server_name `weer.home.lan`) ervoor, `nginx -t` groen |

## Verificatie-uitsnede (bewijs)
```
# governance
verify_routing.py            → TOTAAL: 14 PASS · 0 FAIL · 0 UNKNOWN

# API t/m autoriteit (Trieste, tijdelijke testlocatie)
/api/context?location=Trieste → country IT · authority Protezione Civile (HIGH, national)
  trace: Protezione Civile SELECTED ("bevoegd voor dit land")
         ARSO / GeoSphere Austria / DWD  REJECTED

# healthcheck
systemctl is-active weerwijsheid  → active (enabled)
curl localhost:8080/api/health    → 200 {"status":"ok"}

# reverse proxy (nginx 1.26.3, server_name weer.home.lan)
nginx -t                                             → syntax ok / test successful
curl -H 'Host: weer.home.lan' http://127.0.0.1/api/health → 200 {"status":"ok"}

# DNS-eindketen (via Technitium-resolutie)
10.10.30.10 / .20 : weer.home.lan → 10.10.30.110 (NOERROR)
curl --resolve weer.home.lan:80:10.10.30.110 http://weer.home.lan/api/health → 200 {"status":"ok"}
```
