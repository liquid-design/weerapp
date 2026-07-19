"""Centrale configuratie. Laadt .env (zonder externe dependency), paden en thresholds."""
import json
import os

# --- Paden -----------------------------------------------------------------
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)
CONFIG_DIR = os.path.join(ROOT_DIR, "config")
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")
CACHE_DIR = os.path.join(BACKEND_DIR, "cache")
DATA_DIR = os.path.join(ROOT_DIR, "data")
FEEDBACK_FILE = os.path.join(DATA_DIR, "feedback.json")
LOCATIONS_FILE = os.path.join(CONFIG_DIR, "locations.json")
THRESHOLDS_FILE = os.path.join(CONFIG_DIR, "thresholds.json")
REGIONS_FILE = os.path.join(CONFIG_DIR, "regions.json")
MODELS_FILE = os.path.join(CONFIG_DIR, "models.json")


def _load_env():
    """Minimale .env-loader: KEY=VALUE per regel, # is commentaar. Geen dependency nodig."""
    path = os.path.join(ROOT_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_env()

# --- Tokens (leeg = provider draait op mock) -------------------------------
TOKENS = {
    "windy": os.environ.get("WINDY_TOKEN", ""),
    "openweather": os.environ.get("OPENWEATHER_TOKEN", ""),
    "weatherapi": os.environ.get("WEATHERAPI_TOKEN", ""),
    "iqair": os.environ.get("IQAIR_TOKEN", ""),
    "weerlive": os.environ.get("WEERLIVE_TOKEN", ""),
}

PORT = int(os.environ.get("PORT", "8080"))

# Open-Meteo is keyless. Model kiezen kan: best_match | ecmwf_ifs04 | gfs_seamless |
# icon_seamless | meteofrance_seamless
OPENMETEO_MODEL = os.environ.get("OPENMETEO_MODEL", "best_match")


def load_thresholds():
    with open(THRESHOLDS_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_regions():
    with open(REGIONS_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_models():
    with open(MODELS_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)
