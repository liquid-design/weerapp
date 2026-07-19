"""Weerwijsheid — webserver (ADR-002, ADR-007).

Serveert de statische frontend én de JSON-API. Eén proces, geschikt voor één LXC.
Start:  python backend/app.py    (open http://<ip>:8080)
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request, send_from_directory

import config
import feedback
from pipeline import build_current
from geocoding import GeocodingProvider
from models.locations import load_locations, get_location, add_location, remove_location

app = Flask(__name__, static_folder=config.FRONTEND_DIR, static_url_path="")
geocoder = GeocodingProvider(os.environ.get("NOMINATIM_EMAIL", ""))


@app.route("/")
def index():
    return send_from_directory(config.FRONTEND_DIR, "index.html")


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/locations", methods=["GET", "POST"])
def locations():
    if request.method == "POST":
        body = request.get_json(force=True, silent=True) or {}
        ok = add_location(body.get("name"), body.get("lat"), body.get("lon"),
                          body.get("alert_zone", ""), body.get("country", ""))
        return jsonify({"ok": ok}), (200 if ok else 409)
    return jsonify(load_locations())


@app.route("/api/locations/<name>", methods=["DELETE"])
def delete_location(name):
    return jsonify({"ok": remove_location(name)})


@app.route("/api/geocode")
def geocode():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "lege zoekopdracht"}), 400
    try:
        return jsonify(geocoder.search(q))
    except Exception as exc:
        return jsonify({"error": f"geocoding mislukt: {exc}"}), 502


@app.route("/api/current")
def current():
    name = request.args.get("location", "")
    accommodation = request.args.get("accommodation", "tent")
    force = request.args.get("force", "") in ("1", "true", "yes")
    loc = get_location(name)
    if not loc:
        return jsonify({"error": f"onbekende locatie: {name}"}), 404
    return jsonify(build_current(loc, accommodation, force))


@app.route("/api/context")
def api_context():
    """Geographic Authority Context (ADR-030 Commit 4): locatie -> land -> regio -> autoriteit
    -> modellen. Voedt de 'Waarom deze bron?'-klik."""
    name = request.args.get("location", "")
    loc = get_location(name)
    if not loc:
        return jsonify({"error": f"onbekende locatie: {name}"}), 404
    from core import geo_context
    return jsonify(geo_context.build(loc))


@app.route("/api/data_health")
def api_data_health():
    """Gezondheid van de zone-data (ADR-031): welke landen missen geometrie of zijn verouderd.
    Voedt de databron-waarschuwing in de app. Maandelijkse refresh via tools/refresh_zones.sh."""
    import os
    from datetime import datetime, timezone
    data_dir = os.path.join(config.FRONTEND_DIR, "map", "data")
    try:
        reg = json.load(open(os.path.join(data_dir, "zone_sources.json")))["countries"]
    except Exception:
        return jsonify({"ok": False, "issues": [{"level": "error", "msg": "register ontbreekt"}]})
    try:
        manifest = json.load(open(os.path.join(data_dir, "zone_manifest.json")))
    except Exception:
        manifest = {"generated": None, "countries": {}}

    STALE_DAYS = 45  # maandelijkse cron + marge
    issues, now = [], datetime.now(timezone.utc)
    for cc, src in reg.items():
        if src.get("geometry_status") == "missing":
            continue  # bewust nog geen geometrie; geen fout
        f = src.get("file")
        present = bool(f) and os.path.exists(os.path.join(data_dir, f))
        m = manifest.get("countries", {}).get(cc, {})
        if not present:
            issues.append({"level": "warn", "country": cc,
                           "msg": f"{src['authority']}: zone-geometrie ontbreekt lokaal — draai kickstart/refresh"})
            continue
        # aanwezig bestand = OK. Een gefaalde REFRESH terwijl het bestand er is -> hooguit info.
        if m.get("ok") is False:
            issues.append({"level": "info", "country": cc,
                           "msg": f"{src['authority']}: laatste verversing faalde, bestaande data nog in gebruik"})
            continue
        fetched = m.get("fetched_at")
        if fetched:
            try:
                age = (now - datetime.fromisoformat(fetched)).days
                if age > STALE_DAYS:
                    issues.append({"level": "info", "country": cc,
                                   "msg": f"{src['authority']}: data {age} dagen oud — verversing aanbevolen"})
            except Exception:
                pass
    return jsonify({"ok": not any(i["level"] == "warn" for i in issues),
                    "generated": manifest.get("generated"), "issues": issues})


@app.route("/api/feedback", methods=["POST"])
def post_feedback():
    body = request.get_json(force=True, silent=True) or {}
    ok = feedback.add(body)
    return jsonify({"ok": ok}), (200 if ok else 400)


@app.route("/api/feedback/summary")
def feedback_summary():
    return jsonify(feedback.summary())


@app.route("/api/feedback/analysis")
def feedback_analysis():
    return jsonify(feedback.analysis())


if __name__ == "__main__":
    os.makedirs(config.CACHE_DIR, exist_ok=True)
    host = os.environ.get("HOST", "0.0.0.0")  # VM achter nginx: 127.0.0.1; lokaal testen: 0.0.0.0
    print(f"Weerwijsheid draait op http://{host}:{config.PORT}")
    app.run(host=host, port=config.PORT, debug=False)
