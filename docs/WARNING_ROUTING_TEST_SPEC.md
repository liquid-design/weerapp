# Warning Routing Test Specification v1.0

Bewijsdocument, geen implementatie. Vloeit voort uit ADR-030 en het Warning Provider Contract v1.0.

Doel: de waarschuwingsroutering toetsbaar maken vóór er code verandert. Elke case legt niet alleen
vast welke autoriteit **wél** verwacht wordt, maar ook welke er **niet** geselecteerd mag worden —
dat laatste is de eigenlijke test, want de audit-fout was juist een *te ruime* selectie.

Governance-lijn: `ADR-030 → Warning Provider Contract → Routing Test Specification → Implementatie`.

## Statusverwachting per case

Elke case toetst vier dingen:
1. **country** — juist land bepaald uit lat/lon (reverse-geocode).
2. **warning_authority** — de bevoegde instantie (of `UNAVAILABLE` als er geen bron is).
3. **must_not_select** — providers die deze locatie NIET mogen claimen.
4. **state** — `SAFE / WARNING / UNAVAILABLE / STALE` (niet "groen/niet-groen").

Nog niet ingevuld = huidige toestand vóór de sprint (allemaal FAIL waar `must_not_select` wordt
geschonden of `state` ontbreekt). Na implementatie hoort elke case op PASS te staan.

---

## Basis-cases

### B1 — Antwerpen (BE)
```yaml
input:      { lat: 51.22, lon: 4.40 }
expected:
  country:  BE
  warning_authority: UNAVAILABLE      # KMI nog niet aangesloten
  state:    UNAVAILABLE               # NIET "SAFE/groen"
must_not_select: [Protezione Civile, ARSO, GeoSphere Austria]
```

### B2 — Texel (NL)
```yaml
input:      { lat: 53.05, lon: 4.80 }
expected:
  country:  NL
  warning_authority: UNAVAILABLE      # KNMI-warning nog niet aangesloten (Weerlive = observation)
  observation: Weerlive (KNMI)        # observation-rol wél actief
  state:    UNAVAILABLE
must_not_select: [Protezione Civile, ARSO, GeoSphere Austria]
```

### B3 — Lago di Garda (IT)
```yaml
input:      { lat: 45.55, lon: 10.70 }
expected:
  country:  IT
  warning_authority: Protezione Civile
  state:    SAFE | WARNING            # afhankelijk van bulletin
must_not_select: [ARSO, GeoSphere Austria]
```

### B4 — Bled (SI)
```yaml
input:      { lat: 46.37, lon: 14.11 }
expected:
  country:  SI
  warning_authority: ARSO
  state:    SAFE | WARNING
must_not_select: [Protezione Civile, GeoSphere Austria]   # <-- audit-fout: beide claimden Bled
```

### B5 — Tirol / Innsbruck (AT)
```yaml
input:      { lat: 47.27, lon: 11.39 }
expected:
  country:  AT
  warning_authority: GeoSphere Austria
  state:    WARNING                   # geverifieerd: geel onweer actief (audit)
must_not_select: [Protezione Civile, ARSO]                # <-- audit-fout: IT claimde Tirol
```

---

## Breekpunt-cases (bewust moeilijk)

### X1 — Dreiländereck (AT/SI/IT drielandenpunt, bij Peč / Monte Forno)
```yaml
input:      { lat: 46.51, lon: 13.71 }
purpose:    "Eén berg, drie autoriteiten. Test dat exact één land bindend is per punt."
expected:
  country:  AT | SI | IT              # afhankelijk van welke kant van het punt; MOET er één zijn
  warning_authority: <de instantie van dat land, precies één>
  state:    SAFE | WARNING
must_not_select: <de andere twee landen>
notes: >
  Kritisch: het systeem mag hier NIET drie waarschuwingen stapelen of de autoriteit op volgorde
  kiezen. Precies één bevoegde bron. Dit is de zuiverste test van de country-gate.
```

### X2 — Bormio (IT, Alpen — hoogte/dal/pas)
```yaml
input:      { lat: 46.47, lon: 10.37 }   # dorp ~1225 m; Passo dello Stelvio ~2758 m nabij
purpose:    "Hoogteverschil binnen enkele km. Test resolutie + juiste nationale bron."
expected:
  country:  IT
  warning_authority: Protezione Civile
  forecast_models_include: [ICON-D2, AROME]   # fijnmazig, niet enkel ECMWF
  state:    SAFE | WARNING
must_not_select: [GeoSphere Austria]          # <-- audit-fout: AT lekte in bij Bormio
notes: >
  Hoogtecorrectie is nog een open punt (ADR-030 valt hier buiten). Deze case bewaakt minimaal dat
  de juiste NATIONALE bron en fijnmazige modellen gekozen worden; expliciete lapse-rate is v-later.
```

### X3 — Trieste (IT, Alpen ↔ Adria-overgang)
```yaml
input:      { lat: 45.65, lon: 13.77 }
purpose:    "Kust + bora-wind + onweer op de grens IT/SI. Test kustnabije grensrouting."
expected:
  country:  IT
  warning_authority: Protezione Civile        # Friuli Venezia Giulia
  state:    SAFE | WARNING
must_not_select: [ARSO]                        # SI ligt < 15 km, mag NIET claimen
notes: >
  Trieste ligt vlak bij de Sloveense grens; de country-gate moet standhouden ondanks nabijheid.
  Adriatische invloed (wind/onweer) is een forecast-thema, niet de warning-routing.
```

---

## Uitvoeringsvorm (na implementatie)

Deze spec wordt een klein testscript (`backend/verify_routing.py`) dat per case de pipeline
bevraagt en `expected` + `must_not_select` toetst, met een PASS/FAIL-matrix als uitvoer. Zo wordt
ADR-030 aantoonbaar: niet "de router zou nu goed moeten zijn", maar "8/8 cases PASS, geen enkele
must_not_select geschonden".

## Faseplan (governance)

```
Fase 1 — bewijslaag
  [x] ADR-030
  [x] Warning Provider Contract v1.0
  [x] Warning Routing Test Specification v1.0   <-- dit document

Fase 2 — implementatie
  [x] country resolver (reverse-geocode -> country_code op de locatie)  — Commit 2
  [x] authority selection (autoriteit = bron van de sterkste waarschuwing)  — Commit 1
  [x] statusmodel SAFE / WARNING / UNAVAILABLE / STALE  — Commit 3

Fase 3 — validatie
  [x] verify_routing.py: 14 PASS / 0 FAIL / 0 UNKNOWN (10 routing + 4 statusdemo)
```
