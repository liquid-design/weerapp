# Deploy-checklist — Fase B (VM)

Dit is de **checklist voor de eerste deploy**, niet het runbook. Het runbook (OPERATIONS.md)
wordt geschreven ná deze handelingen, op basis van wat echt werkte (afspraak Fase B).

## Runtime-verantwoordelijkheid (het contract, eerst lezen)
> **De VM voert alleen uit; de repository blijft de bron van waarheid.**
- Git-repo → code + configuratie(templates). Geen handmatige fixes in de VM: elke wijziging
  gaat via de repo en een nieuwe deploy.
- VM → uitvoeringsomgeving (venv, systemd, logs).
- Gegenereerde data → **artifact**, altijd opnieuw opbouwbaar (`kickstart`/`refresh`);
  `zone_manifest.json` + `warning_status.json` zijn het bewijs van welke bronnen gebruikt zijn.
- Secrets → alleen in `/opt/weerwijsheid/config/env` (buiten de repo-boom, root:weerwijsheid 640).
- **Het formele onderscheid** (zodat niemand later waarschuwingen gaat cachen "alsof het
  geometrie is"): data met stabiele ruimtelijke/structurele eigenschappen → **build-artifact**;
  data met actuele tijdswaarde → **runtime ingestion**.
```
        officiële bronnen
        ┌──────┴──────────────┐
  geodata/grenzen      weer + waarschuwingen
    (langzaam)              (actueel)
        │                      │
   build-pipeline         runtime fetch
        │                      │
  map/data-artifact       actuele state
        └──────────┬───────────┘
                  API → UI
```

## Directorycontract
```
/opt/weerwijsheid/
├── app/        ← git checkout (code + frontend/map/data-artifacts)
├── config/
│   └── env     ← secrets (= .env-inhoud; NIET in de repo)
├── logs/       ← refresh.log, journald voor de API
└── venv/       ← python-omgeving
```
Afwijking van het generieke raw/processed-voorstel, bewust: de fetchers bewaren geen raw
(bron = officiële endpoints, herhaalbaar; manifest legt herkomst vast). `frontend/map/data/`
ís de processed-laag en is volledig reconstrueerbaar. Raw-opslag toevoegen = ADR.

## Stappen (afvinken tijdens de deploy; notities → OPERATIONS.md)
1. **VM** — Debian 13 (Trixie) via het community-script (`vm/debian-13-vm.sh`),
   2 vCPU / 2 GB / 16–32 GB, app-VLAN. Consistent met de overige apps (VM's).
   **Hostname = infrastructuur, niet de app:** kies `vm-weather-01` (of vergelijkbaar), niet
   `weerwijsheid`. De machine is infrastructuur; `weerwijsheid` is de *workload* (service-naam
   + domein). Zo blijft de VM bruikbaar als er later monitoring-/backup-agents of exporters bij
   komen. Direct na eerste login:
   - `apt install -y qemu-guest-agent && systemctl enable --now qemu-guest-agent` (Proxmox-integratie).
   - Python op Debian 13 is 3.12/3.13 — geen probleem; de venv isoleert.

2. **Beheercontract (Ansible) vóór root dichtgaat.** Deze VM wordt Ansible-beheerd, niet
   handmatig. Volgorde is kritisch: maak de beheer-user **voordat** je root-toegang beperkt.
   - Bootstrap (root tijdelijk mogelijk): `useradd -m -s /bin/bash ansible && usermod -aG sudo ansible`,
     SSH-key plaatsen in `~ansible/.ssh/authorized_keys`.
   - sudo: `/etc/sudoers.d/ansible`. Keuze — `ansible ALL=(ALL) NOPASSWD:ALL` is gemakkelijk maar
     zwak; de strengere eindstaat is sudo met wachtwoord of specifieke rules. **Aanbevolen:**
     begin met NOPASSWD voor de bootstrap, scherp daarna aan. Leg de keuze vast in SECURITY.md.
   - Na hardening: `PermitRootLogin no` + `PasswordAuthentication no` in sshd, key-only login.
     Root blijft als break-glass via de Proxmox-console (VM-voordeel).
   Levenscyclus: console-bootstrap → ansible-user → alles verder via playbook.
3. **Baseline** — `apt update && apt full-upgrade -y` en
   `apt install -y git python3 python3-venv python3-pip ca-certificates curl jq`.
   **Tijd is geen detail voor een weerapp** (verlopen waarschuwingen, verkeerde forecast-windows,
   foute manifest-timestamps): controleer `systemctl status systemd-timesyncd` en `timedatectl`.
   Service-identity: `useradd --system --home /opt/weerwijsheid --shell /usr/sbin/nologin weerwijsheid`
   · `mkdir -p /opt/weerwijsheid/{app,config,logs,venv}` · `chown -R weerwijsheid: /opt/weerwijsheid`.
   **Pre-app-controle vóór de applicatielaag:** `hostnamectl · ip addr · ip route ·
   cat /etc/os-release · timedatectl · sudo -u weerwijsheid id · ls -la /opt/weerwijsheid`
   — plak die output eerst; daarna pas git clone/venv/pip.
4. **Netwerk-allowlist (egress) — twee fasen.** *Bouwfase: ruimer* (443 out + apt-mirrors),
   zodat de eerste fout applicatief is en geen netwerkbeleid. *Na stabiele productie: beperken*
   tot 443 naar: open-meteo.com, api.openweathermap.org, weerlive.nl,
   nominatim.openstreetmap.org, raw.githubusercontent.com, maps.dwd.de, warnungen.zamg.at,
   meteo.arso.gov.si, service.pdok.nl, statistik.at, unpkg.com, tile.openstreetmap.org
   (+ apt-mirror en evt. OCSP/CRL).
5. **Deploy** — `git clone <repo> /opt/weerwijsheid/app` (of zip uitpakken);
   `python3 -m venv /opt/weerwijsheid/venv && /opt/weerwijsheid/venv/bin/pip install -r app/requirements.txt`.
6. **Secrets** — `config/env` vullen met de tokens (geroteerde keys!).
7. **Eerste build = validatierun** (zie hieronder) — pas daarna services aanzetten.
8. **systemd** — units uit `deploy/` kopiëren, `enable --now weerwijsheid weerwijsheid-refresh.timer`.
   Zet `HOST=127.0.0.1` in `config/env` zodat de app alleen lokaal luistert (nginx ervoor).
9. **Reverse proxy (nginx, HTTP-only intern)** — `apt install -y nginx`;
   `deploy/config/nginx.conf.template` → `/etc/nginx/sites-available/weerwijsheid` met
   `{{SERVER_NAME}}` = `weer.home.lan`; symlink naar `sites-enabled/`, `default`-site weg,
   `nginx -t && systemctl reload nginx`. Geen TLS (intern netwerk; bewuste keuze — Open Decision).
10. **DNS (Technitium)** — A-record `weer.home.lan` → `10.10.10.110`. Test:
    `curl -H 'Host: weer.home.lan' http://10.10.10.110/api/health` en daarna in de browser
    `http://weer.home.lan`.
11. **Bewijsstuk invullen** — `deploy/evidence/first-production-run.md` (datum, LXC-id,
   git-commit, eerste geslaagde build, manifest-hash, bekende UNKNOWN-gevallen). Dit is later
   de referentie voor "waarom is Italië de baseline?".
12. **Runbook schrijven** — OPERATIONS.md op basis van de notities van stap 1–11.

## Eerste productie-run = validatierun
Niet "werkt de app?", maar: **kan de hele keten zichzelf bewijzen voor één land?**
Mijlpaal 1 = Italië (één land, één officiële bron, één geometriecontract, volledige trace):
```bash
cd /opt/weerwijsheid/app && source ../venv/bin/activate
python3 tools/fetch_boundaries.py it        # meegeleverd → manifest "ok"
python3 tools/fetch_warning_status.py it     # bron → download → transformatie → artifact
python3 tools/verify_boundaries.py it        # validatie tegen contract
python  backend/verify_routing.py            # governance: 14+ PASS / 0 FAIL
python  backend/app.py &                     # (tijdelijk; daarna via systemd)
curl -s localhost:8080/api/health
curl -s localhost:8080/api/data_health       # bewaking leeft
curl -s "localhost:8080/api/context?location=..." # keten t/m autoriteit
# UI: Live-tab → "Waarom deze bron?" → kaart met IT-zones in de kleuren van vandaag
```
Elke stap toont een schakel: bron → download → validatie → transformatie → manifest → API → UI.
Pas als deze keten groen is: overige landen (`fetch_boundaries.py all`) en services activeren.
**UNKNOWN ≠ FAIL geldt ook hier:** landen zonder bron horen eerlijk "geen bevoegde bron" te
tonen — dat is een geslaagde validatie, geen defect.
