# Security Policy

Weerwijsheid is een persoonlijke, lokaal gehoste applicatie (homelab). Geen gebruikersaccounts,
geen persoonsgegevens buiten zelfgekozen locatienamen/coördinaten.

## Secrets
- API-tokens staan **uitsluitend** in `.env` (lokaal) of `/opt/weerwijsheid/config/env` (VM),
  nooit in Git. `.env` staat in `.gitignore`.
- Lekt een token, **roteer** het bij de betrokken provider; de app draait zonder token gewoon
  door (die provider valt terug op mock met zichtbare vlag).

## Dependencies
Minimaal (Flask, requests, pyproj). Pin bij een release; controleer periodiek
`pip list --outdated`. Geen dependency toevoegen zonder ADR (zie GOVERNANCE.md).

## Netwerk / deployment
Interne deploy draait op **plain HTTP** via nginx op een privaat netwerk (bewuste keuze, zie
AGENTS.md §Open Decisions). Niet bedoeld voor blootstelling aan het publieke internet zonder
extra maatregelen (TLS, authenticatie, rate-limiting).

## Kwetsbaarheid melden
Privé project: open een GitHub-issue met het label `security`, of neem contact op via het
adres in de repo-eigenaar-profiel. Geef reproductiestappen; geen publieke exploit-details vóór
een fix.

## Threat model (kort)
Lokale app, vertrouwd netwerk. Voornaamste risico's: (1) gelekte provider-tokens → roteren;
(2) prompt-injectie via externe data — data wordt als data behandeld, niet als instructie;
(3) verouderde dependencies → periodieke check. Geen SQL/DB (JSON-only), geen user-auth,
geen file-uploads.
