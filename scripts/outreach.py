"""Photo-outreach merge list — a curation tool, never part of the build.

Groups queue/product_images.json by creamery and joins the creamery table,
producing queue/photo_outreach.csv: one row per creamery holding harvested
photos, with the counts and product names the outreach email
(docs/photo-outreach.md) merges in. No email addresses exist in any source —
the newsroom looks those up — so the CSV carries the website instead.

Run after any images.py re-harvest:  python scripts/outreach.py
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
QUEUE = ROOT / "queue"

PRODUCTS_SHOWN = 12


def fatal(message: str) -> None:
    sys.exit(f"OUTREACH FAILED: {message}")


def main() -> None:
    images_path = QUEUE / "product_images.json"
    creameries_path = ROOT / "build" / "creameries.json"
    for path in (images_path, creameries_path):
        if not path.exists():
            fatal(f"missing {path.relative_to(ROOT)} — run its producer first")

    rows = json.loads(images_path.read_text(encoding="utf-8"))
    creameries = {
        c["id"]: c
        for c in json.loads(creameries_path.read_text(encoding="utf-8"))
    }

    by_creamery: dict[str, dict] = {}
    for row in rows:
        creamery_id = row["cheese_id"].split("--")[0]
        if creamery_id not in creameries:
            fatal(
                f"photo row '{row['cheese_id']}' belongs to no exported creamery — "
                f"re-run scripts/images.py against the current build"
            )
        entry = by_creamery.setdefault(
            creamery_id, {"photos": 0, "products": [], "source": row["source_page"]}
        )
        entry["photos"] += 1
        title = row.get("matched_title") or ""
        if title and title not in entry["products"]:
            entry["products"].append(title)

    out = QUEUE / "photo_outreach.csv"
    with out.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(
            ["creamery_id", "creamery_name", "city", "website", "shop_domain",
             "photo_count", "sample_products", "listing_url"]
        )
        for creamery_id in sorted(by_creamery):
            creamery = creameries[creamery_id]
            entry = by_creamery[creamery_id]
            products = sorted(entry["products"])
            shown = "; ".join(products[:PRODUCTS_SHOWN])
            if len(products) > PRODUCTS_SHOWN:
                shown += f"; … {len(products) - PRODUCTS_SHOWN} more"
            writer.writerow([
                creamery_id,
                creamery["name"],
                creamery["city"],
                creamery.get("website") or "",
                urlsplit(entry["source"]).netloc,
                entry["photos"],
                shown,
                f"https://rowanflynnpilot.github.io/cheese-census/#{creamery_id}",
            ])

    print(f"OK: {len(by_creamery)} creameries, {len(rows)} photos -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
