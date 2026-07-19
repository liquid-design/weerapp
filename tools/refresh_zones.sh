#!/usr/bin/env bash
# refresh_zones.sh — maandelijkse verversing (voor cron). Logt naar data/zone_refresh.log.
# Cron-voorbeeld (elke 1e van de maand, 04:30):
#   30 4 1 * * /pad/naar/weerwijsheid/tools/refresh_zones.sh >> /pad/naar/weerwijsheid/data/zone_refresh.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
# venv-locatie robuust bepalen: expliciete $VENV, anders app-lokaal .venv (dev/kickstart),
# anders zuster-map ../venv (systemd-deploy: /opt/weerwijsheid/venv). Zie docs/OPERATIONS.md §6.
if [ -n "${VENV:-}" ] && [ -f "${VENV}/bin/activate" ]; then
    source "${VENV}/bin/activate"
elif [ -f .venv/bin/activate ]; then
    source .venv/bin/activate
elif [ -f ../venv/bin/activate ]; then
    source ../venv/bin/activate
else
    echo "FOUT: geen venv gevonden (probeer \$VENV, .venv of ../venv)" >&2
    exit 1
fi
echo "=== refresh $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
python3 tools/fetch_boundaries.py all || true
python3 tools/fetch_warning_status.py || true
python3 tools/verify_boundaries.py || true
echo "=== einde refresh ==="
