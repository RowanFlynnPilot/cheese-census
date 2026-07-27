"""WCMA championship contest results scraper — the awards layer.

Source
    WCMA hosts both contests; results are published class-by-class with cheese
    name, maker, company, and location:
    - World Championship Cheese Contest (even years, Madison):
        worldchampioncheese.org/results/  — most recent edition March 2026;
        next is February 2028.
    - U.S. Championship Cheese Contest (odd years):
        uschampioncheese.org — same organization, same results format.
    Event-driven: run twice a year at most, in the weeks after each contest.

Output → data/raw/contests.json
    Wisconsin entries only (that filter is safe at the scraper level — it's a
    published fact of each row, not an editorial judgment):
    [
      {
        "source_key": "wccc-2026-c07-1",     # {contest}-{year}-c{class}-{placement} — REQUIRED
        "contest": "wccc", "year": 2026,
        "class_number": 7, "class_name": "...",
        "placement": 1, "finalist": false, "champion": false,
        "score": 98.1,
        "cheese_name": "...", "maker": "...", "company": "...", "city": "..."
      },
      ...
    ]

Rules
    - Keep entry fields verbatim as published — matching to canonical
      creameries/cheeses happens in the merge, never here.
    - Backfill: start with the two or three most recent editions of each
      contest, then extend the archive as an enhancement.
"""
from __future__ import annotations

from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "contests.json"


def main() -> None:
    raise NotImplementedError("contests scraper not yet implemented — see module docstring")


if __name__ == "__main__":
    main()
