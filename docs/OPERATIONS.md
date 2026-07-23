# OPERATIONS.md — runbook Weerwijsheid (Fase B)

> Geschreven **ná** de eerste deploy (stap 1–11 van `deploy/DEPLOY_CHECKLIST.md`), op basis van
> wat écht werkte — niet van het plan. De bewezen baseline is **mijlpaal 1: Italië, volledige keten
> groen** (zie `deploy/evidence/first-production-run.md`). Uitbreiding naar overige landen is
> *normaal gebruik* en staat hieronder als procedure, niet als deploy-stap.

## Contract (eerst lezen)
De **repository is de bron van waarheid**; de VM voert alleen uit. Elke codewijziging gaat via
git → nieuwe deploy. **Nooit** handmatig patchen op de VM, **nooit** via zip/scp updaten.
Gegenereerde data (`frontend/map/data/`) is een reproduceerbaar artifact. Secrets staan alleen in
`/opt/weerwijsheid/config/env`.

## Systeemtoestand (baseline)
| | |
|---|---|
| VM (host) | `weer` — Debian 13 (trixie), kernel `6.12.95+deb13-amd64`, **10.10.30.110** (VLAN 30) |
| Service-user | `weerwijsheid` (uid 999, nologin), home `/opt/weerwijsheid` |
| App-checkout | `/opt/weerwijsheid/app` (git, remote `git@github.com:liquid-design/weerapp.git`) |
| Venv | `/opt/weerwijsheid/venv` — **let op: niet** in de app-map |
| Secrets | `/opt/weerwijsheid/config/env` (`root:weerwijsheid`, 640) |
| Logs | journald (API) · `/opt/weerwijsheid/logs/refresh.log` (refresh) |
| API-binding | `127.0.0.1:8080` (alleen lokaal; nginx ervoor) |
| Reverse proxy | nginx 1.26.3, `server_name weer.home.lan` → `127.0.0.1:8080` |
| Naam/DNS | `weer.home.lan` → 10.10.30.110 (A-record in Technitium) |

Alle beheer gaat via `ssh weer` (user `ansible`, sudo-wachtwoord). Root = break-glass via de
Proxmox-console.

---

## 1. Start / stop / status (systemd)
Twee units: `weerwijsheid.service` (de API, enige langdraaiende proces) en
`weerwijsheid-refresh.timer` (dagelijkse dataverversing).

```bash
# status
sudo systemctl status weerwijsheid
systemctl is-active weerwijsheid          # -> active
curl -s localhost:8080/api/health         # -> {"status":"ok"}

# start / stop / restart
sudo systemctl restart weerwijsheid
sudo systemctl stop weerwijsheid
sudo systemctl start weerwijsheid

# logs (live)
sudo journalctl -u weerwijsheid -f

# refresh-timer
systemctl list-timers weerwijsheid-refresh.timer   # volgende run
sudo systemctl start weerwijsheid-refresh.service   # nu handmatig verversen (zie §6-waarschuwing)
sudo tail -f /opt/weerwijsheid/logs/refresh.log
```

nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl status nginx
```

---

## 2. Update-procedure — **git, nooit zip/scp**
De bewezen keten is: **push vanaf de Mac → pull op de VM → restart**. Conform het contract is dit
de *enige* manier om code/config-templates te wijzigen.

```bash
# 1) op de Mac (in de repo)
git add -A && git commit -m "…"
git push origin main

# 2) op de VM — pull ALS de service-user (checkout is eigendom van weerwijsheid)
sudo -u weerwijsheid git -C /opt/weerwijsheid/app pull --ff-only

# 3) herstart de service
sudo systemctl restart weerwijsheid
curl -s localhost:8080/api/health
```

Stap 2 is **één schoon commando** — geen agent-forwarding, geen chown-omweg. Dat werkt dankzij een
**read-only deploy-key** die de service-user `weerwijsheid` bezit:
`/opt/weerwijsheid/.ssh/id_ed25519` (in GitHub → repo `weerapp` → Settings → Deploy keys,
*zonder* write-access). `sudo -u weerwijsheid git pull` gebruikt die key automatisch.

Verifiëren dat de key werkt:
```bash
sudo -u weerwijsheid ssh -T git@github.com
# -> "Hi liquid-design/weerapp! You've successfully authenticated, but GitHub does not provide shell access."
```

> **git draait als `weerwijsheid`, niet als `ansible`** — git als `ansible` op deze checkout geeft
> `detected dubious ownership`.
>
> **Deploy-key opnieuw opzetten (recovery / verse VM):**
> ```bash
> sudo -u weerwijsheid bash -c 'umask 077; mkdir -p /opt/weerwijsheid/.ssh
>   ssh-keygen -t ed25519 -N "" -C weerwijsheid-deploy@weer -f /opt/weerwijsheid/.ssh/id_ed25519 -q
>   ssh-keyscan -t ed25519 github.com >> /opt/weerwijsheid/.ssh/known_hosts   # fingerprint moet
>   #   SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU zijn (GitHub officieel)
>   cat /opt/weerwijsheid/.ssh/id_ed25519.pub'
> # plak de .pub in GitHub → repo weerapp → Settings → Deploy keys → Add (Allow write access UIT)
> ```
> *Historie:* de éérste clone had nog geen deploy-key en ging via SSH agent-forwarding
> (`ssh -A`, met de Mac-key) + een chown-omweg. Sinds de deploy-key is dat niet meer nodig.

> **Untracked runtime-state (ADR-032).** `config/locations.json` en
> `frontend/map/data/warning_status.json` staan **niet** in git (gitignored) — het is
> tijdswaarde-data, geen bron. Gevolg voor de update: een `pull` raakt ze nooit meer aan, dus
> `--ff-only` breekt er niet meer op. Twee aandachtspunten bij een pull die ze wél lokaal
> gewijzigd aantreft (overgangssituatie of handmatige edit): **back-up ze eerst buiten de
> checkout** en zet ze daarna terug (eigendom `weerwijsheid`) — ze staan in de backup-sectie §8.
> `warning_status.json` is bovendien regenereerbaar via de refresh-timer (§6); `locations.json`
> niet — dat is onvervangbaar. Verse clone zonder `locations.json`: de app valt terug op de
> default (`config/locations.example.json`), geen crash.

---

## 3. DNS — **terugkerend struikelpunt, lees dit eerst bij "kan de naam niet bereiken"**
`weer.home.lan` (en de hele `home.lan`-zone) wordt **alleen** geserveerd door **Technitium**:
**10.10.30.10** en **10.10.30.20** (:53; webconsole :5380). Beide resolven zowel intern
(`weer.home.lan` → 10.10.30.110) als publiek (recursief).

**Wat de zone NIET kent:**
- de VLAN-30-gateway **10.10.30.1** (de VM's DHCP-uplink-resolver) → `home.lan` = NXDOMAIN,
  alleen publieke DNS. Gevolg: de **VM zelf** kan `weer.home.lan` niet resolven. Dat is prima —
  de VM hoeft de naam niet te resolven om te serveren.
- WireGuard-clients met `DNS = 10.200.0.1` → resolven `home.lan` niet.

**Fix voor een client die de naam moet bereiken (bv. je laptop over WireGuard):** wijs de DNS naar
Technitium. In de WireGuard-config:
```ini
[Interface]
DNS = 10.10.30.10, 10.10.30.20
```
`AllowedIPs` bevat al `10.10.0.0/16`, dus Technitium is bereikbaar over de tunnel. Herverbinden,
daarna werkt `http://weer.home.lan`. (Bewezen: na deze fix gaf `curl http://weer.home.lan/api/health`
→ `{"status":"ok"}`.)

**Verify losstaand van resolver-config:**
```bash
# direct tegen Technitium (bewijst dat het record klopt)
dig @10.10.30.10 weer.home.lan A     # -> 10.10.30.110
# proxy los van DNS (bewijst nginx+app)
curl -H 'Host: weer.home.lan' http://10.10.30.110/api/health
```

---

## 4. Egress-allowlist (uitgaand, 443)
De app draait server-side fetchers; een **geblokkeerde host is geen crash** — die provider valt
terug op mock/afwezig en toont zich als "kleuren onbekend" / `UNAVAILABLE` via `/api/data_health`
(UNKNOWN ≠ FAIL). Sta minimaal toe:

| Host | Waarvoor |
|---|---|
| `open-meteo.com` | forecast (keyless) — kernbron |
| `api.openweathermap.org` | forecast/observatie (met token) |
| `weerlive.nl` | NL KNMI-observaties (met token) |
| `nominatim.openstreetmap.org` | geocoding |
| `raw.githubusercontent.com` | IT-waarschuwingsbulletin (**zie §7 — bron dood**) |
| `maps.dwd.de` | DE-waarschuwingen (WFS) |
| `warnungen.zamg.at` / `*.geosphere.at` | AT-waarschuwingen |
| `meteo.arso.gov.si` | SI-waarschuwingen |
| `service.pdok.nl` | NL-provinciegeometrie (fetch_boundaries) |
| `statistik.at` | AT-gemeentegeometrie (fetch_boundaries) |
| `github.com` | git-update (deploy-key / pull) |
| `unpkg.com`, `tile.openstreetmap.org` | **browser-side**: Leaflet-CDN + OSM-tiles (kaart) |

`+ apt-mirror` (updates) en evt. OCSP/CRL. **Bouwfase ruimer (443 open); pas ná stabiele productie
beperken** tot bovenstaande.

---

## 5. Nieuw land uitrollen (normale procedure)
Geen deploy-stap — normaal gebruik. Draai als `weerwijsheid` met het **absolute venv-pad**
(niet via `refresh_zones.sh`, zie §6):

```bash
cd /opt/weerwijsheid/app
PY=/opt/weerwijsheid/venv/bin/python
sudo -u weerwijsheid $PY tools/fetch_boundaries.py de nl at   # of: all
sudo -u weerwijsheid $PY tools/fetch_boundaries.py            # (geen arg = alle *.geojson)
sudo -u weerwijsheid $PY tools/verify_boundaries.py de nl at  # contract + CRS-check
sudo systemctl restart weerwijsheid
curl -s localhost:8080/api/data_health | jq .                 # issues zouden moeten slinken
```
Herprojectie (NL/BE/AT: EPSG:28992/31370/31287 → 4326) vereist `pyproj` — al in de venv. Een land
dat faalt stopt de rest niet.

---

## 6. Data-refresh (timer)
`weerwijsheid-refresh.timer` draait dagelijks 04:30 (±15 min) `tools/refresh_zones.sh`.

> ℹ️ **venv-detectie (opgelost).** `refresh_zones.sh` zoekt de venv nu robuust: expliciete `$VENV`
> → app-lokaal `.venv` (dev/kickstart) → zuster-map `../venv` (systemd-deploy:
> `/opt/weerwijsheid/venv`). Op de VM pakt hij automatisch `/opt/weerwijsheid/venv`. Verifieer een
> run met `sudo systemctl start weerwijsheid-refresh.service` en
> `sudo tail -f /opt/weerwijsheid/logs/refresh.log`.
> *(Historie: vóór deze fix sourcete het script alleen `.venv` in de app-map en faalde de timer op
> de VM — de venv staat één niveau hoger.)*

De refresh doet geometrie (`fetch_boundaries.py all`) én actuele kleuren
(`fetch_warning_status.py`). Geometrie is idempotent; kleuren zijn klein — dagelijks draaien is
goedkoop.

---

## 7. Bekende issues
- **IT live-kleuren: WERKEND** (correctie op eerdere diagnose). De DPC-bulletinfeed
  `pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica` is niet dood — de eerdere conclusie
  "bevroren sinds 2022" was een artefact van de GitHub *contents*-API (cap 1000 entries). De bug
  zat in `status_it()`, dat vaste publicatietijden (HHMM) raadde en het bestand van vandaag miste.
  Sinds de fix bepaalt `status_it()` de nieuwste bulletin-bestandsnaam deterministisch via de
  GitHub git-tree API. `data_health` `sources.IT.ok=true`; de kaart toont echte zonekleuren.
- **`/api/data_health` = `ok:false`** zolang niet alle landen zijn uitgerold: mijlpaal 1 deed alleen
  `it`, dus DE/NL/AT melden "geometrie ontbreekt lokaal" (`warn`). Verdwijnt na §5. **`ok:false` is
  hier verwacht gedrag, geen defect.**
- **SI heeft per ontwerp geen officieel zonebestand** (ARSO-regio's; vereist MeteoAlarm-token) —
  bewust landcontour i.p.v. verzonnen grenzen. Dat is een geldige UNKNOWN.
- **Refresh-timer venv-pad** — zie §6.

---

## 8. Backup — wat is onvervangbaar
Slechts **twee** bestanden zijn niet reproduceerbaar; back-up alleen die:
```
/opt/weerwijsheid/config/env               # secrets (tokens, HOST/PORT)
/opt/weerwijsheid/app/config/locations.json # gebruikers-locaties
```
Al het overige komt terug uit **git** (code, config-templates, geometrie-artifacts) + de **fetchers**
(actuele data). Geen database, geen historiek (ADR-001).

## 9. Recovery — herbouw vanaf niets
De keten is per ontwerp reconstrueerbaar. Volledige herbouw:
1. VM + service-user + mappen (checklist stap 1–3), of herstel de VM-snapshot.
2. `git clone` → `/opt/weerwijsheid/app` (§2).
3. `python3 -m venv /opt/weerwijsheid/venv && venv/bin/pip install -r app/requirements.txt`.
4. Zet `config/env` en `config/locations.json` terug uit backup (§8).
5. Dataload: `tools/kickstart.sh` bouwt venv + haalt **alle** zones op (idempotent, herbruikbaar);
   of handmatig per land (§5).
6. `systemctl enable --now weerwijsheid weerwijsheid-refresh.timer`; healthcheck (§1).

`kickstart.sh` = "herbouw-vanaf-niets" in één commando (let op: het script gebruikt óók `.venv` in
de app-map — draai het lokaal of pas het venv-pad aan, zie §6).

---

## Bijlage — operationele eigenaardigheden (uit deze deploy)
- **VLAN-verhuizing.** De VM verhuisde tijdens de deploy van 10.10.10.110 → **10.10.30.110**. Bij
  `Host key verification failed` na een adreswijziging: controleer eerst dat de **host-key
  identiek** is aan de eerder vertrouwde (zelfde machine) vóór je `accept-new` toestaat. De
  ed25519-fingerprint was `SHA256:ZjJQ1n0BCyH/NpsGTuaLdV0YTFwuAvukZGrwdGm1vtY`.
- **Checklist-drift.** `deploy/DEPLOY_CHECKLIST.md` stap 10 noemt nog 10.10.10.110 en spreekt van
  "LXC"; de werkelijkheid is een **VM** op **10.10.30.110**. De DNS wijst correct naar .30.110.
- **Sudo.** `ansible` heeft sudo mét wachtwoord (niet NOPASSWD). Losse SSH-calls delen geen
  sudo-cache → gebruik één `sudo` per commando/sessie.
