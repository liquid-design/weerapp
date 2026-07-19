#!/usr/bin/env bash
# kickstart.sh — eenmalige setup + eerste dataload voor Weerwijsheid.
# Draait de venv op, installeert dependencies en haalt alle waarschuwingszones op.
#
#   ./tools/kickstart.sh
#
# Idempotent: opnieuw draaien is veilig (venv wordt hergebruikt, data ververst).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/3  Python-venv + dependencies"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
pip install -q pyproj          # nodig voor herprojectie NL/BE/AT

echo "==> 2/3  Waarschuwingszones ophalen (officiële bronnen)"
python3 tools/fetch_boundaries.py all || true   # één land dat faalt mag de rest niet stoppen

echo "==> 3/3  Verifiëren tegen het contract"
python3 tools/verify_boundaries.py || true

echo
echo "Klaar. Start de app met:  source .venv/bin/activate && python backend/app.py"
echo "Ontbrekende landen? Zie de waarschuwing in de app (Instellingen > databronnen)."
