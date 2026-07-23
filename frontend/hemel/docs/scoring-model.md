# Heldere Hemel — scoremodel v1.0

Dit document legt vast *waarom* de score is opgebouwd zoals hij is. Lees dit
voordat je de weging verandert. Eén verkeerde aanname (bv. "ik voeg
lichtvervuiling toe als +20 punten") sloopt het belangrijkste inzicht.

## Het kernidee

Sterrenkijkers verwarren intuïtief drie verschillende fysische vragen:

1. **Is de atmosfeer helder?** — wolken, wind, dauw, regen (weer, per uur).
2. **Is de hemel donker genoeg op deze locatie?** — lichtvervuiling
   (een *vaste geografische eigenschap*, geen weer).
3. **Is de lucht stabiel genoeg voor scherpe beelden?** — seeing
   (straalstroom, per nacht).

Daarom is de score **multiplicatief**, niet een klassiek 100-punten-aftrekmodel:

```
Heldere Hemel = Atmosfeer × Maan × Locatie × Seeing
                  (A)        (M)     (L)       (S)
```

Elke dimensie is een onafhankelijke "poort". Een perfecte atmosfeer in de stad
hoort géén 100 te scoren: de locatiefactor kapt dat af. Zo betekent 100% "de
atmosfeer is maximaal", niet "overal even mooi".

> **Grondprincipe: Heldere Hemel is een beslissingshulp, geen astronomie-dashboard.**
> Doel is de vraag "is dit een goede avond om naar de sterren te kijken?"
> beantwoorden voor gewone mensen — niet elke meetwaarde tonen. Vandaar in de
> UI mensentaal boven jargon: **Donkere hemel** (i.p.v. "Locatie/lichtvervuiling")
> en **Scherpe lucht** (i.p.v. "Seeing"). Techniek (SQM, Bortle, straalstroom)
> mag, maar pas in de verdiepingslaag, nooit als eerste boodschap.

## De dimensies

### A — Atmosfeer (0..100)
Vier weerfactoren tellen op (Open-Meteo, per uur), zoals de referentie:

| Factor | Max | Bron |
|---|---|---|
| Bewolking | 55 | lage/midden/hoge wolken apart gewogen, min nevel bij slecht zicht |
| Wind | 20 | wind + windstoten op 10 m |
| Dauw | 15 | marge temperatuur − dauwpunt (Δ°C) |
| Regen | 10 | neerslagkans |

Alleen donkere uren tellen mee (zon onder ~−12°). De nacht-Atmosfeer is het
gemiddelde over die uren. Code: `score.js` → `scoreHour`, `aggregateNight`.

### M — Maan (0..1)
Factor uit maanverlichting × maanhoogte. Een hoge volle maan dempt tot ~0.55.
De maan is *geometrie/astronomie*, lokaal berekend (`astro.js`), niet uit een API.

### L — Locatie / lichtvervuiling (0..1)
**Belangrijk: dit is GEEN weer.** Het is een vaste eigenschap van de plek.
Geschat met een stadsgloed-model (wet van Walker/Garstang):

```
kunstmatige_helderheid ∝ Σ (inwoners_stad × afstand_km^-2.5)
SQM   = 22.0 − 2.5 · log10(1 + kunstmatig/natuurlijk)
NELM  = 7.93 − 5 · log10(10^(4.316 − SQM/5) + 1)
Bortle← SQM (tabel)
factor← SQM (vloeiende curve, ankers ≈ Bortle-klassen)
```

Code: `lightpollution.js` (+ gebundelde stedendata `lp-data.js`).
Kalibratie-ankers: Antwerpen ≈ Bortle 8 (factor ~0.40), Cévennes/Bohinj ≈
Bortle 3 (~0.95), open oceaan ≈ Bortle 1 (1.0).

Dit is een **schatting**, geen meting. Het model kent (nog) niet: hoogte,
reliëf (bergen blokkeren licht), kust vs. binnenland, aerosolen, of het type
straatverlichting (LED vs. natrium). Presenteer het daarom als "≈ Bortle 8",
niet als absolute waarheid. Wil je exact? Vervang de databron door de
Falchi/Lorenz-wereldatlas als lokaal raster; de rest van de app blijft gelijk.

### S — Seeing (0..1)
Rust in de bovenlucht uit de straalstroom (Open-Meteo `wind_speed_250hPa`).
Bewust mild (max ~28% demping): telt vooral voor planeten, maan en fotografie,
nauwelijks voor sterrenbeelden/Melkweg. Code: `seeing.js`.

## De invariant (niet overtreden)

> Lichtvervuiling is geen weerfactor. Ze hoort niet in de 100 punten van
> Atmosfeer, en mag nooit een additieve aftrek worden. Ze is een
> vermenigvuldiger (0..1) omdat ze onafhankelijk van het weer werkt: een
> heldere nacht in Bortle 9 blijft een slechte hemel; een donkere nacht redt
> geen bewolkte lucht. `score = A × M × L × S`.

## Roadmap

Ontwerpregels (leidend): **simpel houden**. Geen kaart, geen 3D, geen
animaties. Elk element moet een *beslissing* helpen nemen, niet alleen data
tonen. Niet Astrospheric/Clear Outside naspelen — wel losse, tekst-lichte
elementen overnemen waar ze een beslissing scherper maken.

### Fase 1 — klaar
- ✅ Atmosfeer (bewolking, wind, dauw, regen)
- ✅ Maan (verlichting × hoogte)
- ✅ Seeing (250 hPa straalstroom)
- ✅ Lichtvervuiling (stadsgloed-schatting, als vermenigvuldiger)
- ✅ Transparante score-uitleg (dimensies met ✓/✕ + "waarom"-checklist)
- ✅ Beste moment als vénster (langste aaneengesloten goede blok + kwaliteitswoord)
- ✅ Uitleg-badges: Melkweg zichtbaar?, transparantie, nachttrend, dauwwaarschuwing
- ✅ Invariant gedocumenteerd (dit bestand)

> **Let op:** transparantie, de Melkweg-indicator, de dauwwaarschuwing en de
> nachttrend zijn **uitleg, geen weging** — ze veranderen de score niet. Ze
> lezen bestaande waarden (zicht, dauwmarge, RV, lp-factor, maanfactor,
> uurscores) op een begrijpelijke manier terug. Voeg ze nooit toe als
> scorefactor; dat zou dubbeltellen met Atmosfeer/Locatie/Maan.

### Fase 2 — verfijning van de score (nog niet gebouwd)
- ⬜ **Hoogtecorrectie** — milde transparantiebonus:
  `hoogte_factor = 1 + min(hoogte/5000, 0.25)` (0 m ×1.00, 1000 m ×1.10,
  2000 m ×1.20). Bron: Open-Meteo `elevation`. Tonen als "🏔 Hoogtevoordeel +8%".
- ⬜ **Horizon / terreinkwaliteit** — hoeveel vrije horizon (bergen, bebouwing).
- ⬜ **Profielen** — zelfde formule, andere gewichten:
  - Deep Sky: `A × M × L × S` (huidig).
  - Planetair: `A × M × S × 0.95`, met `L = 1` (Jupiter maakt stad vs. donker niet uit).
  - Meteoren: `A × M × donkerte`, seeing bijna irrelevant.
- ⬜ **Tekst-lichte elementen** (kandidaten, geïnspireerd op Astrospheric, passend
  bij "simpel"): een lijstje "objecten vannacht" met op/ondergang en hoogte
  ("Jupiter 68° — ondergang over 7u"); uitgebreidere maandetails (leeftijd in
  dagen, volgende fasen); een compacte agenda van komende gebeurtenissen
  (meteorenzwermen, nieuwe/volle maan, eclipsen, elongaties). Alles als tekst,
  geen kaart of klok-visualisatie.

### Fase 3 — "Beste hemel binnen X km" (bewust uitgesteld)
Niet zomaar "zoek de hoogste score" — dat geeft bergtoppen zonder weg,
privéterrein, natuurgebied zonder parkeerplaats. De echte functie is
**beste *bereikbare* observatieplek**, en vraagt om een tweede score naast de
astronomische kwaliteit:

```
Astronomie-kwaliteit          Bereikbaarheid
  + lichtvervuiling             + rijafstand / -tijd
  + weer                        + parkeerbaarheid
  + seeing                      + vrije horizon
  + maan                        + hoogte
        \                      /
         score = Astronomie × Bereikbaarheid
```

Resultaat is een korte lijst: "Baraque Michel — hemelkwaliteit 91%, rijden
1u32, verbetering +63%". Niet méér data, maar een betere beslissing.

**Voorbereiding (architectuur, vóór Fase 3):** de score-engine is nu al een
"oracle" — `scoreLocation(lat, lon, tijd)` werkt uit alleen coördinaten + weer,
in ~30 ms. De zoekfunctie hoeft daar straks alleen overheen te lussen. Om te
voorkomen dat `score.js` volloopt met `if (camping) / if (mountain) / if (city)`,
introduceer je dan een expliciet **locatie-object** dat de dimensies scheidt:

```
{
  latitude, longitude,
  lightPollution: { sqm, estimatedBortle, factor },
  terrain:        { elevation, horizonQuality },
  accessibility:  { distanceMin, parking }
}
```

Zo blijft de scheiding "atmosfeer vs. locatie vs. bereikbaarheid" behouden.

## Databronnen
- Weer + 250 hPa straalstroom: Open-Meteo (gratis, geen sleutel).
- Stedendata (stadsgloed): all-the-cities / GeoNames (CC-BY).
- Zon, maan, planeten: lokaal berekend (Meeus / Schlyter).
