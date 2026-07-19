# Gebruikershandleiding — Weerwijsheid

Voor wie de app gebruikt (niet ontwikkelt). Technische achtergrond: `ARCHITECTURE.md`.

## 1. Het idee in één alinea
Je kiest een **locatie** en je **verblijf** (tent/vouwwagen/caravan/camper). De app combineert
meerdere weermodellen én de officiële waarschuwingsdienst van het land waar je bent, en geeft
één advies: **Veilig / Opletten / Maatregelen** — met de reden erbij, en met hoe zeker dat
advies is. De app is een beslishulp, geen archief: hij vertelt wat je nú moet weten.

## 2. Het Live-scherm lezen (van boven naar beneden)
1. **Verdict** (groot): het advies, afgestemd op je verblijf (een tent is kwetsbaarder dan een camper).
2. **Regio + modellen**: welke weermodellen hier meetellen en welke leidend is (in de Alpen
   weegt het fijne ICON-D2 zwaarder; in Frankrijk AROME).
3. **Waarschuwingsregel** met een status:
   - ✓ **Geen waarschuwing** — de bevoegde bron is gecontroleerd en rustig.
   - 🚨 **Waarschuwing** — officieel niveau (geel/oranje/rood) van de bevoegde dienst.
   - ○ **Geen bevoegde bron** — voor dit land is (nog) geen dienst aangesloten. Dit betekent
     *onbekend*, niet *veilig* — hou zelf de lokale weerdienst in de gaten.
   - ⚠️ **Bron verouderd** — er wás een waarschuwing maar die is verlopen; ververs.
4. **Waarom?** — de bepalende waarden (bv. CAPE, windstoten) + **advies-vertrouwen** (%):
   hoog = bronnen zijn het eens; laag = één bron of onenigheid — wees voorzichtiger.
5. **Ruwe data — bron per waarde**: elke waarde met alle bronnen en het leidende model.

## 3. "Waarom deze bron?" en de kaart
Klik **▼ Waarom deze bron?** onder de waarschuwingsregel:
- De keten: 📍 locatie → land → regio → **bevoegde autoriteit** (bv. Šobec → SI → Gorenjska →
  ARSO), plus wie er is afgewezen en waarom ("Protezione Civile — alleen IT").
- **🗺️ Toon op kaart**: officiële waarschuwingszones in hun actuele kleur, jouw zone dik
  omlijnd, en het gestreepte **modelvlak** eroverheen. Dat contrast is het punt: één modelcel
  (~5–80 km²) overdekt meerdere officiële zones — dáárom kleurt een telefoon-app soms "heel
  Noord-Italië" geel terwijl de officiële waarschuwing alleen jouw vallei geldt.
- De legenda zegt eerlijk wat je ziet: *meteorologische zones* (IT/DE: echte weerzones) of
  *bestuurlijke gebieden* (NL/BE/FR: provincies/departementen als benadering), en of de
  kleuren **live** zijn of **onbekend** (dan neutraal weergegeven).

## 4. Locaties beheren
**➕ Locatie toevoegen** → zoek een plaats → kies de kandidaat. Het land wordt automatisch
vastgelegd (bepaalt de bevoegde waarschuwingsdienst). Voor een vaste Italiaanse camping kun
je optioneel een `alert_zone` instellen voor zone-specifieke bulletins.

## 5. De databron-banner
Zie je bovenaan **⚠️ Databron-waarschuwing**, dan ontbreekt of veroudert zonedata. Herstel:
```bash
./tools/kickstart.sh            # of gericht:
python3 tools/fetch_boundaries.py de nl at
python3 tools/fetch_warning_status.py
```
Slovenië zonder zones is **geen fout**: er bestaat geen officieel zonebestand — de app toont
bewust de landcontour in plaats van verzonnen grenzen.

## 6. FAQ
**Waarom zie ik "geen bevoegde bron" in Frankrijk/België/Nederland?** De zonekaart is er wel,
maar de live waarschuwingskoppeling voor die diensten is nog niet gebouwd. De app zegt dat
eerlijk in plaats van groen te gokken.
**Waarom verschilt het advies van mijn telefoon-app?** Die gebruikt vaak één model en grove
gebieden. Weerwijsheid toont meerdere modellen, de officiële zone én hoe zeker het advies is.
**Waarom is het vertrouwen soms laag terwijl het rustig weer is?** Vertrouwen meet
bron-overeenstemming, niet gevaar. Eén bron of onenigheid → lager percentage.
**Kleuren op de kaart kloppen niet met vandaag?** Draai `fetch_warning_status.py` (of wacht
op de cron); de legenda toont de laatste verversing.

## 7. Problemen oplossen
| Symptoom | Oorzaak → actie |
|---|---|
| "Kon locaties niet laden" | Backend draait niet → `python backend/app.py` |
| Kaart blijft leeg | Leaflet/OSM vereist internet; of zonebestand ontbreekt → databanner volgen |
| "Kon de bron-context niet laden" | Tijdelijke netwerkfout → ververs; blijft het: backendlog bekijken |
| Oude waarden | Cache-TTL → wissel accommodatie of gebruik verversen (force) |
