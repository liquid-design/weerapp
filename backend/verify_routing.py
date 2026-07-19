"""Warning Routing Verification (ADR-030) — governance-verifier, geen unit test.

Bewaakt blijvend dat de bestuurlijke regel waar blijft: een bron mag alleen spreken over een
locatie waarvoor hij bevoegd is. Als iemand later een provider toevoegt of de selectiecode wijzigt
en de autoriteitsregels breekt, valt dat hier om.

Drie statussen (UNKNOWN != FAIL):
  PASS    — verwachte autoriteit/toestand gekozen, geen verboden bron geselecteerd.
  FAIL    — een bron spreekt buiten zijn bevoegdheid (regressie).
  UNKNOWN — onvoldoende dekking (land onbepaald of geen provider geconfigureerd), geen fout.

Draai:  python backend/verify_routing.py
Cases:  backend/tests/warning_routing_cases.json  (testdata = documentatie)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import country_resolver, unified_model
from pipeline import _select_warnings

CASES = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "tests", "warning_routing_cases.json")

PASS, FAIL, UNKNOWN = "PASS", "FAIL", "UNKNOWN"
_ORDER = ["green", "yellow", "orange", "red"]


def _resolve_country(inp):
    return country_resolver.resolve(inp["lat"], inp["lon"], stored=inp.get("country"))


def _collision_authority(country, synthetic):
    """Gate EERST (kandidaten o.b.v. land), pas daarna severity-aggregatie over de toegestane
    bronnen. Bewijst: authority-selectie > severity-vergelijking."""
    provs, trace, state = _select_warnings(country, {})
    allowed = {p.name for p in provs}
    readings = []
    for sp in synthetic:
        if sp["authority"] in allowed:          # niet-bevoegde bron doet niet mee
            readings.append({"field": "warning_level", "value": sp["level"],
                             "provider": sp["authority"], "model": sp["authority"],
                             "role": "warning", "time": ""})
            readings.append({"field": "warning_authority", "value": sp["authority"],
                             "provider": sp["authority"], "model": sp["authority"],
                             "role": "warning", "time": ""})
    if not readings:
        return None, trace, "unavailable"
    m = unified_model.build(readings)
    return unified_model.value(m, "warning_authority"), trace, state


def _evaluate(case):
    inp = case["input"]
    country = _resolve_country(inp)
    exp = case.get("expected", {})
    forbidden = set(case.get("must_not_select", []))

    if country is None:
        return UNKNOWN, {"reason": "land onbepaald (geen netwerk / buiten dekking)"}, None

    # Collision-case: synthetische bronnen, meet de uiteindelijke autoriteit
    if "synthetic_providers" in case:
        authority, trace, state = _collision_authority(country, case["synthetic_providers"])
        picked = {authority} if authority else set()
    else:
        provs, trace, state = _select_warnings(country, {})
        selected = [p for p in provs if getattr(p, "country_scope", None)]  # nationale bronnen
        authority = selected[0].name if selected else None
        picked = {p.name for p in selected}

    # verboden bron geselecteerd? -> regressie
    breached = forbidden & picked
    if breached:
        return FAIL, {"reason": f"verboden bron geselecteerd: {', '.join(sorted(breached))}",
                      "trace": trace}, authority

    # verwachte UNAVAILABLE
    if exp.get("state", "").upper() == "UNAVAILABLE":
        if state == "unavailable":
            return PASS, {"reason": "geen nationale bron — correct UNAVAILABLE", "trace": trace}, None
        return FAIL, {"reason": f"verwachtte UNAVAILABLE maar kreeg {authority}", "trace": trace}, authority

    # verwachte autoriteit
    want = exp.get("authority")
    if want and authority == want:
        return PASS, {"reason": f"correcte autoriteit: {authority}", "trace": trace}, authority
    if want and authority != want:
        if authority is None:
            return UNKNOWN, {"reason": f"geen provider geconfigureerd (verwacht {want})",
                             "trace": trace}, None
        return FAIL, {"reason": f"verwachtte {want} maar kreeg {authority}", "trace": trace}, authority
    return UNKNOWN, {"reason": "geen verwachting opgegeven", "trace": trace}, authority


def _print_case(name, status, detail, authority, was_before=None):
    print("=" * 52)
    print(f"CASE:     {name}")
    tr = detail.get("trace") or {}
    if tr.get("country"):
        print(f"Land:     {tr['country']}")
    if authority:
        print(f"Gekozen:  {authority}")
    for rej in tr.get("rejected", []):
        print(f"  ✓ afgewezen {rej['authority']:22} ({rej['reason']})")
    if tr.get("fallback"):
        print(f"  fallback: {tr['fallback']}")
    if was_before:
        print(f"Was voorheen: {was_before}  ->  nu: {authority or '—'}")
    print(f"REDEN:    {detail['reason']}")
    print(f"RESULT:   {status}{'  ✅' if status==PASS else '  ❌' if status==FAIL else '  ⚠️'}")


def _status_demos():
    """Eén demo-case per statustoestand (ADR-030 Commit 3). Toetst het statusmodel deterministisch,
    los van live feeds. Bewaakt: UNAVAILABLE != SAFE."""
    from core import warning_status as ws
    from datetime import datetime, timezone
    now = datetime(2026, 7, 16, 21, 0, tzinfo=timezone.utc)
    cases = [
        ("Bled — actieve gele waarschuwing", "national", "yellow",
         "2026-07-16T23:59:59+02:00", ws.WARNING),
        ("Rustige regio — bron aanwezig, geen waarschuwing", "national", "green", None, ws.SAFE),
        ("België — geen nationale bron", "unavailable", "green", None, ws.UNAVAILABLE),
        ("Verlopen waarschuwing — bron te oud", "national", "orange",
         "2026-07-16T12:00:00+00:00", ws.STALE),
    ]
    print("=" * 52)
    print("STATUSMODEL — één demo per toestand (UNAVAILABLE != SAFE)")
    ok = 0
    for name, state, level, expires, expect in cases:
        got = ws.resolve(state, level, expires, now)
        status = PASS if got == expect else FAIL
        ok += got == expect
        conf = ws.confidence_for(got)
        print(f"  {name}")
        print(f"    -> {got} (confidence {conf})   {status}{'  ✅' if status==PASS else '  ❌'}")
    return ok, len(cases)


def main():
    data = json.load(open(CASES, encoding="utf-8"))
    print("WARNING ROUTING VERIFICATION v1.0")
    from datetime import datetime
    print(f"Run: {datetime.now():%Y-%m-%d %H:%M}")
    print("Regel: land -> bevoegde autoriteit -> aggregatie. Autoriteit vóór ernst.\n")

    tally = {PASS: 0, FAIL: 0, UNKNOWN: 0}
    for group in ("regression", "seeds", "breakpoints", "collision"):
        for case in data.get(group, []):
            status, detail, authority = _evaluate(case)
            tally[status] += 1
            _print_case(case["name"], status, detail, authority, case.get("was_before"))
    # statusmodel-demos
    sok, stotal = _status_demos()
    tally[PASS] += sok
    tally[FAIL] += (stotal - sok)
    print("=" * 52)
    print(f"TOTAAL:  {tally[PASS]} PASS · {tally[FAIL]} FAIL · {tally[UNKNOWN]} UNKNOWN")
    print("(UNKNOWN = onvoldoende dekking, geen regressie.)")
    return 1 if tally[FAIL] else 0


if __name__ == "__main__":
    sys.exit(main())
