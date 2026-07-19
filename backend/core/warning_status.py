"""Warning-statusmodel (ADR-030, Commit 3).

De gebruiker mag NOOIT denken "geen waarschuwing = veilig". Daarom vier expliciete toestanden,
met als kernregel: UNAVAILABLE != SAFE.

  WARNING      officiële waarschuwing actief        (kleur + icoon)
  SAFE         bevoegde bron beschikbaar, rustig    (groen/grijs)
  UNAVAILABLE  geen bevoegde bron gevonden          (neutraal)
  STALE        bron bestaat maar data te oud        (oranje)

Confidence volgt de status: een officiële bron (WARNING/SAFE) is HIGH, geen bron is LOW,
verouderde data is MEDIUM.
"""
from datetime import datetime, timezone

WARNING = "WARNING"
SAFE = "SAFE"
UNAVAILABLE = "UNAVAILABLE"
STALE = "STALE"

_ACTIVE_LEVELS = ("yellow", "orange", "red")

# UI-mapping (spiegelt de frontend): toon-tint + icoon + korte tekst
DESCRIBE = {
    WARNING:     {"tone": "warn",    "icon": "🚨", "label": "Waarschuwing actief"},
    SAFE:        {"tone": "safe",    "icon": "✓",  "label": "Geen waarschuwing"},
    UNAVAILABLE: {"tone": "neutral", "icon": "○",  "label": "Geen bevoegde bron"},
    STALE:       {"tone": "stale",   "icon": "⚠️", "label": "Bron verouderd"},
}

_CONFIDENCE = {WARNING: "HIGH", SAFE: "HIGH", STALE: "MEDIUM", UNAVAILABLE: "LOW"}


def _to_dt(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(v)
    except (ValueError, TypeError):
        return None


def resolve(state, level, expires=None, now=None):
    """Bepaal de status uit: bevoegdheid (state 'national'/'unavailable'), ernst (level) en
    versheid (expires). now mag geïnjecteerd worden voor tests."""
    now = now or datetime.now(timezone.utc)
    if state != "national":
        return UNAVAILABLE                      # geen bevoegde bron -> nooit SAFE
    exp = _to_dt(expires)
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if level in _ACTIVE_LEVELS:
        if exp is not None and exp < now:
            return STALE                        # bron gaf een waarschuwing, maar die is verlopen
        return WARNING
    # bevoegde bron, geen actief niveau
    return SAFE


def confidence_for(status):
    return _CONFIDENCE.get(status, "LOW")


def to_object(status, authority, level, reason):
    """Het genormaliseerde warning-object dat de UI direct gebruikt."""
    return {
        "status": status,
        "authority": authority,
        "level": (level or "green").upper(),
        "confidence": confidence_for(status),
        "reason": reason,
    }
