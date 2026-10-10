"""Plant geocoder — a curation tool, run deliberately, never in build.py.

Every DATCP plant licence carries a street address; the map needs a point.
This geocodes each plant once through the U.S. Census Bureau's public batch
geocoder (no key, public domain) and writes the result to

    data/geocode/plants.json      datcp_id -> {lat, lng, match, matched_address}

which build.py reads as committed data: the home plant of a creamery is the
licensed plant nearest its listing's point, and the pin snaps to that plant's
geocode, so the address, city, county and phone the panel shows describe the
place the pin stands on.

Runs are incremental: plants already matched are kept; plants the geocoder
could not match (rural routes, new streets) are retried every run and listed,
so a human can pin them in data/overrides/creameries.json if the plant is a
creamery's home. --refresh re-geocodes everything.

    python scripts/geocode.py [--refresh]
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "datcp.json"
OUT = ROOT / "data" / "geocode" / "plants.json"
BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
BENCHMARK = "Public_AR_Current"
USER_AGENT = (
    "CheeseCensusBot/1.0 (The Cheese Census, Wausau Pilot & Review; "
    "+https://github.com/RowanFlynnPilot/cheese-census)"
)

for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")


def fatal(message: str) -> None:
    sys.exit(f"GEOCODE FAILED: {message}")


def _plants() -> list[dict]:
    if not RAW.exists():
        fatal("missing data/raw/datcp.json — run scrapers/datcp.py first")
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    return raw["records"] if isinstance(raw, dict) and "records" in raw else raw


def _state_zip(value: str) -> tuple[str, str]:
    # DATCP publishes "WI, 54912"; the geocoder wants the two apart.
    state, _, zip_code = (value or "").partition(",")
    return state.strip(), zip_code.strip()


def _batch(rows: list[dict]) -> dict[str, dict]:
    """One POST for every address: the batch endpoint takes a headerless CSV of
    id,street,city,state,zip and answers one CSV row per input."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    for plant in rows:
        state, zip_code = _state_zip(plant["state_zip"])
        writer.writerow([plant["source_key"], plant["address"], plant["city"], state, zip_code])
    response = requests.post(
        BATCH_URL,
        files={"addressFile": ("plants.csv", buffer.getvalue().encode("utf-8"), "text/csv")},
        data={"benchmark": BENCHMARK},
        headers={"User-Agent": USER_AGENT},
        timeout=300,
    )
    if response.status_code != 200:
        fatal(f"HTTP {response.status_code} from the Census geocoder")
    results: dict[str, dict] = {}
    for row in csv.reader(io.StringIO(response.text)):
        if not row:
            continue
        source_key, status = row[0], row[2] if len(row) > 2 else "No_Match"
        if status == "Match" and len(row) >= 6:
            lng, lat = (float(v) for v in row[5].split(","))
            results[source_key] = {
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "match": row[3],  # Exact or Non_Exact
                "matched_address": row[4],
            }
        else:
            results[source_key] = {"lat": None, "lng": None, "match": status, "matched_address": None}
    missing = [p["source_key"] for p in rows if p["source_key"] not in results]
    if missing:
        fatal(f"the geocoder answered nothing for {len(missing)} plant(s): {missing[:10]}")
    return results


def main() -> None:
    refresh = "--refresh" in sys.argv[1:]
    plants = _plants()
    existing: dict[str, dict] = (
        json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() and not refresh else {}
    )
    todo = [
        p for p in plants
        if p["source_key"] not in existing or existing[p["source_key"]]["lat"] is None
    ]
    print(f"{len(plants)} plants, {len(existing)} already geocoded, {len(todo)} to geocode")
    if todo:
        existing.update(_batch(todo))
    # Plants that left the licence file leave the table too; the file mirrors raw.
    keep = {p["source_key"] for p in plants}
    table = {k: v for k, v in existing.items() if k in keep}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(table, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )
    exact = sum(1 for v in table.values() if v["match"] == "Exact")
    near = sum(1 for v in table.values() if v["match"] == "Non_Exact")
    unmatched = sorted(k for k, v in table.items() if v["lat"] is None)
    print(f"wrote {OUT.relative_to(ROOT)}: {exact} exact, {near} non-exact, {len(unmatched)} unmatched")
    if unmatched:
        by_key = {p["source_key"]: p for p in plants}
        for key in unmatched:
            p = by_key[key]
            print(f"  unmatched {key}: {p['address']}, {p['city']} ({p['business_name']})")


if __name__ == "__main__":
    main()
