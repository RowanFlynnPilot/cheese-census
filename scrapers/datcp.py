"""DATCP Wisconsin Dairy Plant Directory scraper — the spine of the dataset.

Source
    Wisconsin Dept. of Agriculture, Trade and Consumer Protection publishes the
    Wisconsin Dairy Plant Directory as a PDF: every licensed dairy plant
    (~395-415, prefix 55) listed by county with trade name, plant address,
    dairy plant number, and processing operations (which enumerate cheese
    types made at each plant).

    Current edition: datcp.wi.gov → Publications → Directories → Dairy.
    Pin the exact PDF URL here once located; historical editions are archived
    at wistatedocuments.org if year-over-year diffing ever becomes a story.

Output → data/raw/datcp.json
    [
      {
        "source_key": "55-0123",            # dairy plant number — REQUIRED on every record
        "trade_name": "...",
        "address": "...", "city": "...", "county": "...",
        "operations": ["Cheddar", "Curds", ...]   # verbatim from the directory
      },
      ...
    ]

Rules
    - Emit the directory verbatim; no interpretation, no filtering. Deciding
      which plants matter is the classification pass's job, not the scraper's.
    - Parse with pdfplumber. Fail loudly (non-zero exit, named error) if the
      PDF layout doesn't match expectations — never emit partial output.
"""
from __future__ import annotations

from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "datcp.json"


def main() -> None:
    raise NotImplementedError("datcp scraper not yet implemented — see module docstring")


if __name__ == "__main__":
    main()
