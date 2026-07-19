"""Locatiebeheer op config/locations.json. Geen database (ADR-001).

Schrijven gebeurt atomair (temp-bestand + os.replace) zodat locations.json nooit
half weggeschreven kan raken bij een crash of gelijktijdige toegang.
"""
import json
import os
import re

from config import LOCATIONS_FILE


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_locations():
    with open(LOCATIONS_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_locations(locations):
    tmp = LOCATIONS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(locations, fh, ensure_ascii=False, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, LOCATIONS_FILE)  # atomair op dezelfde filesystem


def get_location(name):
    for loc in load_locations():
        if loc["name"] == name or slugify(loc["name"]) == slugify(name):
            return loc
    return None


def add_location(name, lat, lon, alert_zone="", country=""):
    locations = load_locations()
    if any(l["name"] == name for l in locations):
        return False
    entry = {"name": name, "lat": float(lat), "lon": float(lon)}
    if country:
        entry["country"] = country.upper()   # gezaghebbend land van de geocoder (ADR-030)
    if alert_zone:
        entry["alert_zone"] = alert_zone  # bv. 'Lomb-04' of zonenaam (Italië, Protezione Civile)
    locations.append(entry)
    save_locations(locations)
    return True


def remove_location(name):
    locations = load_locations()
    new = [l for l in locations if l["name"] != name]
    if len(new) == len(locations):
        return False
    save_locations(new)
    return True


def backfill_meta(name, country=None, region=None):
    """Sla een eenmalig geresolved land/regio op de locatie op (ADR-030). Alleen als het veld
    nog ontbreekt — zo blijft de reverse-geocode een eenmalige kost en is context daarna direct."""
    if not country and not region:
        return False
    locations = load_locations()
    changed = False
    for l in locations:
        if l["name"] == name:
            if country and not l.get("country"):
                l["country"] = country.upper()
                changed = True
            if region and not l.get("region"):
                l["region"] = region
                changed = True
    if changed:
        save_locations(locations)
    return changed
