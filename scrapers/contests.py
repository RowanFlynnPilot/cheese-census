"""WCMA championship contest results scraper — the awards layer.

Source
    WCMA hosts both contests and publishes results through the MyEntries results
    portal. worldchampioncheese.org/results/ and uschampioncheese.org/results/
    are now empty shells that hand off to myentries.org, whose front end is a
    Livewire single-page app — but it reads from a plain, unauthenticated JSON
    API, which is what this scraper uses (verified July 2026):

        GET /api/results/contests
            every edition back to 2011: {id, title, category: wccc|usccc}
        GET /api/results/contest-top-three-per-class/{id}
            {results: [{class: {number, name, ...}, entries: {"1": {...}, ...}}]}
            entries carry place, maker, company, city, state, country,
            brand_name, description and score_average
        GET /api/results/contest-top-three/{id}
            the overall champion and two runners-up

    Field semantics differ between those last two endpoints: in the per-class
    payload `brand_name` is the cheese name and `description` is the entrant's
    prose; in the top-three payload `description` holds the cheese name. This
    scraper reads `brand_name` for the cheese name and never the prose.

    The top-20 championship round is NOT in the API. It is published only as a
    hand-written page on each contest's WordPress site, so those URLs are listed
    per edition in EDITIONS below and must be added by hand each cycle. A
    finalist is by definition its class's first-place winner, so the join is on
    class number alone — the cheese names on those pages carry editorial
    shortenings and typos ("Gmunder Milk Traukirchner Raclette") and are not
    trustworthy join keys.

Output → data/raw/contests.json
    Wisconsin entries only (that filter is safe at the scraper level — it's a
    published fact of each row, not an editorial judgment):
    [
      {
        "source_key": "wccc-2026-c07-1",     # {contest}-{year}-c{class}-{placement}
        "contest": "wccc", "year": 2026,
        "class_number": 7, "class_name": "Natural Rinded Cheddar",
        "placement": 1, "finalist": false, "champion": false,
        "score": 98.1,
        "cheese_name": "...", "maker": "...", "company": "...", "city": "..."
      },
      ...
    ]

Rules
    - Keep entry fields verbatim as published — matching to canonical
      creameries/cheeses happens in the merge, never here.
    - Backfill: EDITIONS starts with the two most recent contests; extending it
      to the 2011-2024 archive is a one-line-per-edition enhancement.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

from _fetch import collapse, fatal, fetch_text, write_json

SCRAPER = "contests"
API = "https://myentries.org/api/results"
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "contests.json"

EDITIONS = (
    {
        "contest": "wccc",
        "year": 2026,
        "api_category": "wccc",
        "top_twenty_url": "https://worldchampioncheese.org/2026-wccc-top-20-finalists/",
    },
    {
        "contest": "uscc",
        "year": 2025,
        "api_category": "usccc",
        "top_twenty_url": "https://uschampioncheese.org/2025-usccc-top-20-cheeses/",
    },
)

WISCONSIN = "WI"
TOP_TWENTY_COUNT = 20
PLACEMENTS = ("1", "2", "3")

# "Class: 7 - Natural Rinded Cheddar", "Class #: 13 - ...", "Class 6: ..." all occur.
TOP_TWENTY_CLASS = re.compile(
    r"^Class\s*#?\s*(?::\s*)?(?P<number>\d+)\s*[:–—-]\s*\S", re.IGNORECASE
)


def _api(path: str):
    payload = fetch_text(f"{API}/{path}", scraper=SCRAPER)
    try:
        return json.loads(payload)
    except json.JSONDecodeError as error:
        fatal(SCRAPER, f"{API}/{path} did not return JSON: {error}")


def _contest_id(edition: dict) -> int:
    contests = _api("contests")
    if not isinstance(contests, list):
        fatal(SCRAPER, "/contests did not return a list — the results API has changed")
    matches = [
        c for c in contests
        if c.get("category") == edition["api_category"]
        and str(c.get("title", "")).startswith(str(edition["year"]))
    ]
    if len(matches) != 1:
        fatal(
            SCRAPER,
            f"expected exactly one {edition['year']} {edition['api_category']} contest in "
            f"/contests, found {len(matches)}: {[c.get('title') for c in matches]}",
        )
    return matches[0]["id"]


def _top_twenty_classes(url: str) -> set[int]:
    soup = BeautifulSoup(fetch_text(url, scraper=SCRAPER), "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    numbers = [
        int(match.group("number"))
        for line in soup.get_text("\n", strip=True).splitlines()
        if (match := TOP_TWENTY_CLASS.match(line.strip()))
    ]
    if len(numbers) != TOP_TWENTY_COUNT or len(set(numbers)) != TOP_TWENTY_COUNT:
        fatal(
            SCRAPER,
            f"{url}: parsed {len(numbers)} class numbers ({len(set(numbers))} distinct), "
            f"expected {TOP_TWENTY_COUNT} — the finalists page layout has changed",
        )
    return set(numbers)


def _champion_key(contest_id: int) -> tuple[str, str] | None:
    payload = _api(f"contest-top-three/{contest_id}")
    results = payload.get("results") if isinstance(payload, dict) else None
    if not results:
        fatal(SCRAPER, f"/contest-top-three/{contest_id} returned no results")
    champion = results[0]
    # In THIS payload `description` is the cheese name (see module docstring).
    return (
        collapse(champion.get("description") or "").lower(),
        collapse(champion.get("company") or "").lower(),
    )


def collect(edition: dict) -> list[dict]:
    contest_id = _contest_id(edition)
    finalist_classes = _top_twenty_classes(edition["top_twenty_url"])
    champion = _champion_key(contest_id)

    payload = _api(f"contest-top-three-per-class/{contest_id}")
    classes = payload.get("results") if isinstance(payload, dict) else None
    if not classes:
        fatal(SCRAPER, f"/contest-top-three-per-class/{contest_id} returned no results")

    known = {c["class"]["number"] for c in classes}
    missing = sorted(finalist_classes - known)
    if missing:
        fatal(
            SCRAPER,
            f"{edition['contest']} {edition['year']}: finalist page names class(es) {missing} "
            f"that the results API does not publish — the join is no longer safe",
        )

    records: list[dict] = []
    for entry_class in classes:
        meta = entry_class["class"]
        number, name = meta["number"], collapse(meta["name"])
        entries = entry_class.get("entries") or {}
        for placement in PLACEMENTS:
            entry = entries.get(placement)
            if entry is None:
                continue
            if collapse(entry.get("state") or "").upper() != WISCONSIN:
                continue
            if entry["place"] != int(placement):
                fatal(
                    SCRAPER,
                    f"{edition['contest']} {edition['year']} class {number}: entry keyed "
                    f"'{placement}' reports place {entry['place']}",
                )
            cheese_name = collapse(entry.get("brand_name") or "")
            score = entry.get("score_average")
            records.append({
                "source_key": f"{edition['contest']}-{edition['year']}-c{number:02d}-{placement}",
                "contest": edition["contest"],
                "year": edition["year"],
                "class_number": number,
                "class_name": name,
                "placement": entry["place"],
                "finalist": entry["place"] == 1 and number in finalist_classes,
                "champion": (
                    entry["place"] == 1
                    and champion is not None
                    and (cheese_name.lower(), collapse(entry.get("company") or "").lower()) == champion
                ),
                "score": float(score) if score is not None else None,
                "cheese_name": cheese_name,
                "maker": collapse(entry.get("maker") or ""),
                "company": collapse(entry.get("company") or ""),
                "city": collapse(entry.get("city") or ""),
            })

    print(
        f"contests: {edition['contest']} {edition['year']} — {len(classes)} classes, "
        f"{len(records)} Wisconsin placements"
    )
    return records


def main() -> None:
    records: list[dict] = []
    for edition in EDITIONS:
        records.extend(collect(edition))

    duplicates = sorted({
        key for key in (r["source_key"] for r in records)
        if [r["source_key"] for r in records].count(key) > 1
    })
    if duplicates:
        fatal(SCRAPER, f"duplicate source_key(s): {duplicates}")

    records.sort(key=lambda r: (r["contest"], r["year"], r["class_number"], r["placement"]))
    write_json(OUTPUT, records)

    finalists = sum(1 for r in records if r["finalist"])
    firsts = sum(1 for r in records if r["placement"] == 1)
    print(
        f"contests: {len(records)} Wisconsin awards ({firsts} first place, "
        f"{finalists} top-20 finalists) -> data/raw/contests.json"
    )


if __name__ == "__main__":
    main()
