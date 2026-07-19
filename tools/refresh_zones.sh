#!/usr/bin/env bash
# refresh_zones.sh — maandelijkse verversing (voor cron). Logt naar data/zone_refresh.log.
# Cron-voorbeeld (elke 1e van de maand, 04:30):
#   30 4 1 * * /pad/naar/weerwijsheid/tools/refresh_zones.sh >> /pad/naar/weerwijsheid/data/zone_refresh.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
source .venv/bin/activate
echo "=== refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 tools/fetch_boundaries.py all || true
python3 tools/fetch_warning_status.py || true
python3 tools/verify_boundaries.py || true
echo "=== einde refresh ==="
