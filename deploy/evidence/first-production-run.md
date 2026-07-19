# Bewijsstuk — eerste productie-run (invullen tijdens de deploy)

Geen logboek maar een referentiedocument: waarom is dit de baseline?

| Veld | Waarde |
|---|---|
| Datum/tijd (UTC) | _…_ |
| Machine hostname | _weer_ (infrastructuur) |
| Application/service name | weerwijsheid (workload) |
| VM-id | _…_ |
| OS + kernel | _uit `cat /etc/os-release` + `uname -r`_ |
| Git-commit (app) | _`git rev-parse HEAD`_ |
| Eerste geslaagde build | _uitvoer `fetch_boundaries.py it` + `fetch_warning_status.py it`_ |
| Manifest-hash | _`sha256sum frontend/map/data/zone_manifest.json`_ |
| verify_routing | _… PASS / … FAIL / … UNKNOWN_ |
| verify_boundaries (IT) | _contract compleet? CRS OK?_ |
| Bekende UNKNOWN-gevallen | _bv. SI geometrie missing; FR/NL/BE zonder live waarschuwingsbron — per ontwerp (UNKNOWN ≠ FAIL)_ |
| Afwijkingen t.o.v. checklist | _wat de werkelijkheid anders deed dan het plan → input voor OPERATIONS.md_ |
