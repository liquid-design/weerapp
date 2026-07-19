# INSTALLATION — Weerwijsheid v2

## Vereisten
- Een Proxmox **LXC** met Debian 12 of Ubuntu 22.04+.
- Python 3.10 of hoger.
- Uitgaand internet naar de weer-API's (pas na de bouwfase nodig; de MVP draait op mock-data).

## 1. LXC klaarmaken
```bash
apt update && apt install -y python3 python3-venv python3-pip
```

## 2. Project plaatsen en venv maken
```bash
cd /opt
# kopieer de map 'weerwijsheid' hierheen (scp, git, of unzip)
cd weerwijsheid
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

## 3. Configuratie
```bash
cp .env.example .env          # tokens later invullen; leeg mag voor de mock-MVP
# controleer/bewerk je locaties:
nano config/locations.json
```

## 4. Starten (ontwikkeling)
```bash
python backend/app.py
# open in de browser:  http://<lxc-ip>:8080
```

## 5. Starten als service (productie, optioneel)
Maak `/etc/systemd/system/weerwijsheid.service`:
```ini
[Unit]
Description=Weerwijsheid
After=network.target

[Service]
WorkingDirectory=/opt/weerwijsheid
ExecStart=/opt/weerwijsheid/.venv/bin/python backend/app.py
Restart=on-failure
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
```
```bash
systemctl daemon-reload
systemctl enable --now weerwijsheid
```

## 6. Verifiëren (acceptatie)
- `http://<lxc-ip>:8080` toont het dashboard.
- Locatie-dropdown werkt en toont data.
- Advies + reden + bron zijn zichtbaar.
- `curl http://<lxc-ip>:8080/api/current?location=Camping%20Italië` geeft genormaliseerde JSON.

## 7. API-keys toevoegen (na de bouwfase)
Vul in `.env` de tokens in en herstart. Zolang een token leeg is, blijft die provider op
mock-data staan (zichtbaar via de `mock`-vlag in de transparantielaag).

## Poort
Standaard `8080`, override met de omgevingsvariabele `PORT`.

## Netwerktoegang (voor de LXC/firewall)
De app benadert deze externe hosts:
- api.open-meteo.com, air-quality-api.open-meteo.com (forecast + AQI, keyless)
- api.openweathermap.org (forecast, token)
- api.windy.com (forecast, token — pas nuttig op betaald plan)
- weerlive.nl (KNMI-meting, token, NL/Vlaanderen)
- nominatim.openstreetmap.org (geocoding)
- api.github.com + raw.githubusercontent.com (Protezione Civile CAP-bulletin, Italië)
- meteo.arso.gov.si (ARSO CAP-waarschuwingen, Slovenië)
- warnungen.zamg.at (GeoSphere Austria Warn-API, Oostenrijk)

## Kaartlaag (Commit 5)
De kaart gebruikt Leaflet via CDN (unpkg.com) en OpenStreetMap-tiles. Voor een volledig
self-contained LXC kun je Leaflet later lokaal vendoren; nu vereist de kaart internettoegang tot:
- unpkg.com (Leaflet library)
- tile.openstreetmap.org (kaarttegels)
Authority-grenzen (Natural Earth, publiek domein) en model-footprints staan lokaal in
frontend/map/data/ — geen externe bron nodig.

## Secrets / environment
Kopieer `config/env.example` naar `/opt/weerwijsheid/config/env` (VM) of naar `.env` in de
projectroot (lokaal) en vul de gewenste API-tokens in vóór het starten van de service. Alle
tokens zijn optioneel — leeg betekent dat die provider op mock draait met een zichtbare vlag.
De systemd-unit laadt dit bestand via `EnvironmentFile=/opt/weerwijsheid/config/env`; de lokale
dev-loader leest `.env` uit de projectroot. Zet nooit echte tokens in Git (`.env` staat in
`.gitignore`).
