"""DATCP Wisconsin dairy plant directory scraper — the spine of the dataset.

Source
    Wisconsin Dept. of Agriculture, Trade and Consumer Protection publishes
    every licensed dairy plant (~390, plant numbers prefixed 55-) through the
    MyDATCP "Dairy Plant License Holders" report:
        datcp.wi.gov → Publications → Directories → Dairy Plants
        → mydatcp.wi.gov/SiteMap/ServiceDetails/1fa14338-977a-ea11-812b-0050568c4f26

    This replaced the annual "Wisconsin Dairy Plant Directory" PDF, whose last
    edition was 2020-2021 (archived at wistatedocuments.org if year-over-year
    diffing ever becomes a story). The report is regenerated from the licensing
    database and carries a render timestamp, not an edition year, so there is
    nothing to pin but the URL.

    The same report is published as PDF, XLSX and CSV. We take the CSV: it
    carries the identical 388 plants with none of the PDF's wrapped-cell
    reconstruction, and a change to its header row is a far sharper structural
    tripwire than column drift in a 94-page rendering.

Output → data/raw/datcp.json
    [
      {
        "source_key": "55-436",             # dairy plant number — REQUIRED on every record
        "trade_name": "Moundview Dairy",    # DBA when present, else business name
        "business_name": "1540 Vision Drive LLC",
        "dba": "Moundview Dairy",
        "address": "1540 Vision Dr", "city": "Platteville",
        "state_zip": "WI, 53818", "county": "Grant",
        "municipality": "City of Platteville",
        "phone": "(608) 504-2510", "license_no": "328092",
        "grade_b_processing": "...", "grade_a_authorization": null,
        "general_processing":  ["Bovine Milk"],
        "specific_processing": ["Cheese Processing", "Cut/Wrap/Shred"],
        "cheese_manufactured": ["Brick", "Muenster (Munster)", "Other"],
        "operations": [...]                 # the three lists above, concatenated
      },
      ...
    ]

    The source splits operations across three columns; all three are kept
    verbatim so the classification pass can tell a cheese type ("Limburger")
    from a capability ("Retail Store", "Affinage (Aging)"). `operations` is
    their concatenation, and is what merge() lifts into Plant.operations.

Rules
    - Emit the directory verbatim; no interpretation, no filtering. Deciding
      which plants matter is the classification pass's job, not the scraper's.
    - Fail loudly (non-zero exit, named error) the moment the report's shape
      stops matching expectations — never emit partial output.
"""
from __future__ import annotations

import csv
import io
import re
from pathlib import Path

from _fetch import collapse, fatal, fetch_text, write_json

SCRAPER = "datcp"
SOURCE_URL = "https://mydatcp.wi.gov/documents/dfrs/Public_Dairy_Plant_License_Holders.csv"
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "datcp.json"

# The report's header row, verbatim. Any change here is a structural change to
# the source and must stop the run rather than silently reshape the output.
EXPECTED_COLUMNS = (
    "LicenseNo", "WIPlantNo", "BusinessName", "DBA", "BusinessPhone",
    "StreetAddress", "City", "StateZip", "County", "Municipality",
    "GradeBProcessing1", "GradeAPermitAuthorization", "GeneralProcessing",
    "SpecificProcessing", "CheeseManufactured", "VarianceStatus", "VarianceDate",
)

# Only these columns are comma-delimited lists. GradeBProcessing1 is NOT —
# it reads "Grade B Processing <= 1,000,000 lbs product per year".
LIST_COLUMNS = ("GeneralProcessing", "SpecificProcessing", "CheeseManufactured")

PLANT_NUMBER = re.compile(r"55-\d{1,4}")
PLANT_COUNT_RANGE = (300, 500)


def _split_list(value: str, *, column: str, plant: str) -> list[str]:
    """Split a comma-delimited cell, refusing to guess if the source starts
    embedding commas inside values (which would make this split silently wrong)."""
    tokens = [t for t in (collapse(t) for t in value.split(",")) if t]
    for token in tokens:
        if token[0].isdigit():
            fatal(
                SCRAPER,
                f"plant {plant}: {column} yielded token {token!r} starting with a digit — "
                f"values now contain commas and comma-splitting this column is unsafe",
            )
    return tokens


def _required(row: dict[str, str], column: str, plant: str) -> str:
    value = collapse(row[column])
    if not value:
        fatal(SCRAPER, f"plant {plant}: required column {column} is empty")
    return value


def parse(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    columns = tuple(reader.fieldnames or ())
    if columns != EXPECTED_COLUMNS:
        fatal(
            SCRAPER,
            "report columns changed — the source has been restructured.\n"
            f"  expected: {list(EXPECTED_COLUMNS)}\n"
            f"  found:    {list(columns)}",
        )

    records: list[dict] = []
    seen: set[str] = set()
    for line, row in enumerate(reader, start=2):
        plant = collapse(row["WIPlantNo"])
        if not PLANT_NUMBER.fullmatch(plant):
            fatal(SCRAPER, f"line {line}: plant number {plant!r} is not of the form 55-NNNN")
        if plant in seen:
            fatal(SCRAPER, f"line {line}: duplicate plant number {plant} — expected unique")
        seen.add(plant)

        business_name = _required(row, "BusinessName", plant)
        dba = collapse(row["DBA"])
        general = _split_list(row["GeneralProcessing"], column="GeneralProcessing", plant=plant)
        specific = _split_list(row["SpecificProcessing"], column="SpecificProcessing", plant=plant)
        cheese = _split_list(row["CheeseManufactured"], column="CheeseManufactured", plant=plant)

        records.append({
            "source_key": plant,
            "trade_name": dba or business_name,
            "business_name": business_name,
            "dba": dba or None,
            "address": _required(row, "StreetAddress", plant),
            "city": _required(row, "City", plant),
            "state_zip": _required(row, "StateZip", plant),
            "county": _required(row, "County", plant),
            "municipality": collapse(row["Municipality"]) or None,
            "phone": collapse(row["BusinessPhone"]) or None,
            "license_no": _required(row, "LicenseNo", plant),
            "grade_b_processing": collapse(row["GradeBProcessing1"]) or None,
            "grade_a_authorization": collapse(row["GradeAPermitAuthorization"]) or None,
            "general_processing": general,
            "specific_processing": specific,
            "cheese_manufactured": cheese,
            "operations": general + specific + cheese,
        })

    low, high = PLANT_COUNT_RANGE
    if not low <= len(records) <= high:
        fatal(
            SCRAPER,
            f"parsed {len(records)} plants, outside the expected {low}-{high} — "
            f"the report is truncated or the source has changed",
        )
    return records


def main() -> None:
    records = parse(fetch_text(SOURCE_URL, scraper=SCRAPER, encoding="utf-8-sig"))
    records.sort(key=lambda r: int(r["source_key"].split("-")[1]))
    write_json(OUTPUT, records)
    cheese_plants = sum(1 for r in records if r["cheese_manufactured"])
    print(f"datcp: {len(records)} plants ({cheese_plants} making cheese) -> data/raw/datcp.json")


if __name__ == "__main__":
    main()
