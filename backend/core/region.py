"""Regio-detectie — kiest per locatie het scherpste forecast-model (ADR-020).

Bron-agnostisch principe blijft overeind: dit raakt ALLEEN de forecast-providers, niet de
beslisengine. Uit lat/lon leidt detect() een regio af; elke regio draagt het geprefereerde
Open-Meteo-model én Windy-model. Buiten alle boxen valt alles terug op een globaal model.

Bounding boxes zijn bewust ruim en mogen overlappen; de eerste match (meest specifiek eerst)
wint. Dit is een pragmatische atlas, geen exacte modeldekkingskaart — voldoende om onderweg
automatisch het juiste lokale model te pakken.
"""

# Elke regio: naam, box (lat_min, lat_max, lon_min, lon_max), open-meteo-model, windy-model,
# en een korte reden (voor uitleg in de UI).
# Volgorde = prioriteit: specifieke/kleine gebieden bovenaan, globale terugval onderaan.
REGIONS = [
    {
        "id": "alps", "name": "Alpenboog",
        "box": (44.5, 48.3, 5.5, 16.5),
        "openmeteo": "icon_d2", "windy": "iconD2",
        "why": "steil reliëf; hoge-resolutie ICON-D2 (~2 km) vangt dal-/bergverschillen",
    },
    {
        "id": "benelux", "name": "Benelux & Noordzeekust",
        "box": (49.0, 53.7, 2.0, 7.5),
        "openmeteo": "meteofrance_arome_france_hd", "windy": "arome",
        "why": "AROME HD (~1,3 km) is sterk voor buien en zeewind aan de kust",
    },
    {
        "id": "france", "name": "Frankrijk",
        "box": (42.0, 51.5, -5.2, 8.5),
        "openmeteo": "meteofrance_arome_france", "windy": "arome",
        "why": "AROME is het nationale hoge-resolutiemodel van Météo-France",
    },
    {
        "id": "north_italy", "name": "Noord-Italië",
        "box": (43.5, 47.2, 6.5, 14.0),
        "openmeteo": "icon_d2", "windy": "iconD2",
        "why": "Povlakte + Prealpen: onweer 'a macchia di leopardo', fijn rooster nodig",
    },
    {
        "id": "germany", "name": "Duitsland & Centraal-Europa",
        "box": (47.0, 55.2, 5.8, 15.5),
        "openmeteo": "icon_d2", "windy": "iconD2",
        "why": "ICON-D2 is het DWD-hogeresolutiemodel voor dit gebied",
    },
    {
        "id": "iberia", "name": "Iberisch schiereiland",
        "box": (35.8, 44.0, -9.6, 3.4),
        "openmeteo": "ecmwf_ifs025", "windy": "ecmwf",
        "why": "geen breed lokaal HD-model; ECMWF-IFS als sterke regionale basis",
    },
    {
        "id": "uk", "name": "Britse eilanden",
        "box": (49.8, 59.5, -11.0, 2.1),
        "openmeteo": "ukmo_seamless", "windy": "gfs",
        "why": "UKMO-seamless volgt het Met Office-model voor dit gebied",
    },
    {
        "id": "scandinavia", "name": "Scandinavië & Baltische zee",
        "box": (54.5, 71.5, 4.0, 31.0),
        "openmeteo": "metno_seamless", "windy": "iconEu",
        "why": "MET Norway-seamless is afgestemd op het Noord-Europese gebied",
    },
    {
        "id": "europe", "name": "Europa (breed)",
        "box": (34.0, 72.0, -12.0, 35.0),
        "openmeteo": "icon_eu", "windy": "iconEu",
        "why": "ICON-EU (~7 km) als regionale terugval binnen Europa",
    },
]

# Globale terugval buiten elke box (bv. overzee, andere continenten).
GLOBAL = {
    "id": "global", "name": "Globaal",
    "openmeteo": "best_match", "windy": "gfs",
    "why": "buiten regionale dekking: best_match / GFS als wereldwijde basis",
}


def detect(lat, lon):
    """Geef de regio-context voor een coördinaat: eerste (meest specifieke) match wint."""
    for r in REGIONS:
        la0, la1, lo0, lo1 = r["box"]
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            return {"id": r["id"], "name": r["name"], "openmeteo": r["openmeteo"],
                    "windy": r["windy"], "why": r["why"]}
    return dict(GLOBAL)
