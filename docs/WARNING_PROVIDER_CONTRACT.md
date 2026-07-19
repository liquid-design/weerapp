# Warning Provider Contract v1.0

Technisch contract (geen ADR — dit is een bouwregel, niet een besluit). Vloeit voort uit ADR-030.

## Waarom dit contract bestaat

De audit legde een **contractwijziging** bloot. Voor forecast-bronnen volstond:

> "Ik dek deze coördinaten." — genoeg voor ECMWF, ICON, AROME, OpenWeather.

Voor waarschuwingsbronnen is dat onvoldoende. Daar geldt:

> "Ik ben de bevoegde waarschuwingsautoriteit voor dit grondgebied." — KNMI, KMI, ARSO,
> GeoSphere, Protezione Civile, DHMZ, MeteoSwiss.

Weerdata is fysisch; waarschuwingsdata is bestuurlijk. Een warning-provider die alleen
`covers(lat, lon)` implementeert, herintroduceert de Alpenlek. Dit contract voorkomt dat een
toekomstige provider die fout opnieuw maakt.

## Verplichte eigenschappen (elke warning-provider)

| Veld | Betekenis | Voorbeeld |
|------|-----------|-----------|
| `country_scope` | Land(en) waarvoor deze provider bevoegd is (ISO-3166-alpha-2) | `["SI"]` |
| `authority_name` | Naam van de bevoegde instantie | `"ARSO"` |
| `hazard_types` | Ondersteunde gevaarstypen (genormaliseerd) | `["onweer","wind","hitte",...]` |
| `severity_mapping` | Afbeelding bron-niveau → `green/yellow/orange/red` | `wlevel 1→yellow` |
| `validity_period` | Begin/einde van elke waarschuwing (tijdzone-bewust) | `onset/expires` |

## Selectieregel

```
country_match : VERPLICHT      (provider claimt alleen zijn eigen land)
region_match  : GEWENST        (fijnere zone binnen het land, waar beschikbaar)
bbox_match    : ONVOLDOENDE    (een rechthoek alleen mag NIET de sleutel zijn)
```

Een provider mag `bbox` gebruiken als *goedkope voorfilter*, maar de bindende beslissing is
`country_scope` t.o.v. de `country_code` van de locatie.

## Uitvoercontract (genormaliseerd, per waarschuwing)

```
warning_level     : green | yellow | orange | red
authority         : authority_name (van de bron die dit niveau zette)
risk              : genormaliseerd gevaarstype
confidence        : hoog (officiële bron) | laag (fallback/afwezig)
source_timestamp  : wanneer de bron dit uitgaf
validity          : { from, until }
state             : SAFE | WARNING | UNAVAILABLE | STALE   (zie ADR-030 statusmodel)
```

## WARNING_STATE — SOC-denken op meteorologie

Geen data is geen goed nieuws. Vier volwassen toestanden i.p.v. "groen/niet-groen":

- **SAFE** — officiële bron zegt: geen waarschuwing (hoog vertrouwen).
- **WARNING** — officiële bron geeft een niveau.
- **UNAVAILABLE** — geen officiële bron aangesloten voor dit land (laag vertrouwen, geen fout).
- **STALE** — bron bereikbaar maar te oud (buiten validity / feed niet ververst).

---

## Toetsing bestaande providers aan v1.0

Momentopname (v3.7, vóór ADR-030-implementatie). "Deels" = werkt correct binnen eigen land, maar
mist de expliciete `country_scope`-sleutel.

| Provider | country_scope | authority_name | hazard_types | severity_mapping | validity | Selectie nu | Contract |
|----------|:---:|:---:|:---:|:---:|:---:|---|:---:|
| Protezione Civile (IT) | ✗ | ✓ | ✓ | ✓ (event→kleur) | ✓ | bbox (te ruim) | **Deels** |
| ARSO (SI) | ✗ | ✓ | ✓ | ✓ (awareness_level) | ✓ | bbox + regio | **Deels** |
| GeoSphere (AT) | ✗ | ✓ | ✓ | ✓ (wlevel) | ✓ | bbox | **Deels** |
| MeteoAlarm (EU) | n.v.t. | ✓ | ✗ (stub) | n.v.t. | ✗ | fallback | **Fallback** |

### Bevindingen per eis

- **country_scope ontbreekt overal.** Geen enkele provider kent zijn ISO-land expliciet; allen
  gebruiken nog een bbox. Dit is exact de eis die ADR-030 introduceert en die de Alpenlek oplost.
- **authority_name, hazard_types, severity_mapping, validity: aanwezig en correct** bij de drie
  nationale bronnen. De inhoud van het contract is dus al geïmplementeerd; alleen de *selectiesleutel*
  klopt nog niet.
- **MeteoAlarm** is bewust een neutrale fallback (geen echte hazard-parsing). Onder v1.0 hoort die
  de `UNAVAILABLE`-toestand te leveren, niet een misleidend `SAFE`.
- **Autoriteit-attributie** (nu `vals[0]`) voldoet niet aan het uitvoercontract ("authority van de
  bron die dit niveau zette"). Losse correctheidsfix, stap 1 van de sprint.

### Conclusie van de toetsing

Het contract is **inhoudelijk al grotendeels vervuld** — de drie nationale providers leveren de
juiste velden. De enige structurele tekortkoming is de **selectiesleutel** (bbox i.p.v.
country_scope) plus de **autoriteit-attributie**. Dat bevestigt de ADR-030-diagnose: geen
architectuurprobleem, maar een verkeerde sleutel. De implementatiesprint is daarmee klein en
afgebakend.

## Implementatievolgorde (ná dit contract)

1. **Authority attribution** — `warning_authority` = bron van de sterkste waarschuwing (correctheid).
2. **Country gate** — locatie krijgt `country_code` (reverse-geocode); provider claimt op
   `country_scope`. Alpenlek verdwijnt.
3. **Statusmodel** — `SAFE / WARNING / UNAVAILABLE / STALE` i.p.v. groen/niet-groen.
4. **Pas daarna landen toevoegen** — dan is een nieuw land administratief: `country_code` +
   `authority` + `adapter.py` + `severity_mapping`. Geen nieuwe architectuur.

## Evolutiepad (bewust gefaseerd)

```
v1: country_code            ← hier na ADR-030 (grote sprong voor een campingdashboard)
v2: country + region
v3: officiële waarschuwingspolygonen (GIS)
```
