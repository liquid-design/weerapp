"""Gedeelde CAP-kern (Common Warning Schema) — ADR-027.

CAP 1.2 (OASIS) is de standaard voor officiële waarschuwingen; zowel Protezione Civile (Italië)
als ARSO (Slovenië) publiceren erin, net als MeteoAlarm. Deze module parseert een CAP-alert naar
een genormaliseerd schema: per zone een {level, risk, active, expires, name}.

Kleur wordt bepaald in deze volgorde (robuust over landen heen):
  1) MeteoAlarm-parameter 'awareness_level' (bv. '2; yellow; Moderate')
  2) kleurwoord in <event>/<description> (IT/EN/SI)
  3) CAP <severity> (Minor/Moderate/Severe/Extreme)
"""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

_NS = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}
_ORDER = ["green", "yellow", "orange", "red"]

# Kleurwoorden in meerdere talen -> genormaliseerde kleur
_COLOR_WORDS = {
    "green": "green", "yellow": "yellow", "orange": "orange", "red": "red",
    "giallo": "yellow", "gialla": "yellow", "arancione": "orange", "rosso": "red", "rossa": "red",
    "rumeno": "yellow", "rumena": "yellow", "oranzno": "orange", "oranžno": "orange",
    "rdece": "red", "rdeče": "red",
}
_SEVERITY = {"minor": "green", "moderate": "yellow", "severe": "orange", "extreme": "red"}

_RISK_WORDS = {
    "temporali": "onweer", "thunderstorm": "onweer", "neviht": "onweer",
    "idrogeologico": "wateroverlast", "idraulico": "overstroming", "flood": "overstroming",
    "rain": "regen", "precipitation": "regen", "wind": "wind", "veter": "wind",
    "heat": "hitte", "vroučina": "hitte", "vročina": "hitte", "snow": "sneeuw", "sneg": "sneeuw",
    "fire": "brand", "hail": "hagel",
}


def _norm(s):
    return (s or "").strip().lower()


def _color_from_text(text):
    t = _norm(text)
    for word, col in _COLOR_WORDS.items():
        if word in t:
            return col
    return None


def _risk_from_text(text):
    t = _norm(text)
    for word, risk in _RISK_WORDS.items():
        if word in t:
            return risk
    return "onbekend"


def _params(info):
    out = {}
    for p in info.findall("c:parameter", _NS):
        name = _norm(p.findtext("c:valueName", default="", namespaces=_NS))
        out[name] = p.findtext("c:value", default="", namespaces=_NS)
    return out


def _iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


def _level_for(info, params):
    # 1) MeteoAlarm awareness_level: 'niveau; kleur; ernst'
    al = params.get("awareness_level")
    if al:
        col = _color_from_text(al)
        if col:
            return col
    # 2) kleurwoord in event/description
    for key in ("c:event", "c:description", "c:headline"):
        col = _color_from_text(info.findtext(key, default="", namespaces=_NS))
        if col:
            return col
    # 3) CAP severity
    sev = _norm(info.findtext("c:severity", default="", namespaces=_NS))
    return _SEVERITY.get(sev, "green")


def _risk_for(info, params):
    at = params.get("awareness_type")
    if at:
        r = _risk_from_text(at)
        if r != "onbekend":
            return r
    return _risk_from_text(info.findtext("c:event", default="", namespaces=_NS))


def parse(xml_bytes, now=None):
    """CAP-XML -> {'by_code': {code: rec}, 'by_name': {name.lower(): rec}}.
    rec = {level, risk, name, expires, active}. Bewaart per zone het meest ernstige, met
    voorrang voor wat NU geldig is."""
    now = now or datetime.now(timezone.utc)
    root = ET.fromstring(xml_bytes)
    by_code, by_name = {}, {}
    for info in root.findall("c:info", _NS):
        params = _params(info)
        level = _level_for(info, params)
        risk = _risk_for(info, params)
        onset = _iso(info.findtext("c:onset", default="", namespaces=_NS))
        expires = _iso(info.findtext("c:expires", default="", namespaces=_NS))
        active = bool(onset and expires and onset <= now <= expires)
        for area in info.findall("c:area", _NS):
            name = area.findtext("c:areaDesc", default="", namespaces=_NS)
            code_el = area.find("c:geocode/c:value", _NS)
            code = code_el.text if code_el is not None else None
            rec = {"level": level, "risk": risk, "name": name,
                   "expires": expires.isoformat() if expires else None, "active": active}
            for key, store in ((code, by_code), (_norm(name) or None, by_name)):
                if not key:
                    continue
                cur = store.get(key)
                if cur is None or _ORDER.index(level) > _ORDER.index(cur["level"]) \
                        or (active and not cur.get("active")):
                    store[key] = rec
    return {"by_code": by_code, "by_name": by_name}
