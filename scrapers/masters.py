"""Wisconsin Master Cheesemaker directory scraper — the people layer.

Source
    Dairy Farmers of Wisconsin publishes an annual Master Cheesemaker
    Directory PDF (hosted on their blob storage, e.g. the 2025 edition at
    dfwblobstorage.blob.core.windows.net/.../dfw-master-cheesemaker-directory-2025.pdf).
    Landing page: wisconsincheese.com/our-cheese/our-makers/wisconsin-master-cheesemakers
    Small, high-signal roster: each certified Master Cheesemaker with their
    company and per-variety certifications. Refresh once a year when the new
    edition drops.

Output → data/raw/masters.json
    [
      {
        "source_key": "lastname-firstname",   # REQUIRED on every record; stable slug of the printed name
        "name": "...",
        "company": "...",                     # verbatim, resolved to a creamery in the merge
        "certifications": [{"type": "...", "year": 2019}]
      },
      ...
    ]

Rules
    - Certification types feed data/vocab/tags.json → mc_certifications.
      Seeding the vocab from the first successful parse is part of landing
      this scraper — an unseeded vocab fails the build by design.
    - Parse with pdfplumber; fail loudly on layout drift.
"""
from __future__ import annotations

from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "masters.json"


def main() -> None:
    raise NotImplementedError("masters scraper not yet implemented — see module docstring")


if __name__ == "__main__":
    main()
