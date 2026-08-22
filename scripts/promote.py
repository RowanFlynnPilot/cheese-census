"""Promote reviewed evidence into data/overrides/ — deliberate, like hand-editing,
but wholesale.

Reads queue/review_crosswalk.json and queue/review_classifications.json (from
scripts/evidence.py) and writes:

    data/overrides/classifications.json   every company's classification. Auto-tier
                                          rows are hard evidence; review-tier rows
                                          carry their suggested value so the build
                                          can go green, and stay listed in the
                                          review file as the editorial worklist.
    data/overrides/crosswalk.json         auto-tier resolutions only, as
                                          method="manual" entries.

Existing override entries always win — a value a human wrote is never replaced
by a promoted one. Run with --dry-run to see the effect without writing.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUEUE = ROOT / "queue"
OVERRIDES = ROOT / "data" / "overrides"


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, payload) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    crosswalk_rows = _read(QUEUE / "review_crosswalk.json")
    classification_rows = _read(QUEUE / "review_classifications.json")

    # ── Classifications: every company gets a value; humans always win ──────
    existing = _read(OVERRIDES / "classifications.json")
    kept, written = [], 0
    classifications = dict(existing)
    for row in classification_rows:
        if row["id"] in existing:
            if existing[row["id"]] != row["classification"]:
                kept.append((row["id"], existing[row["id"]], row["classification"]))
            continue
        classifications[row["id"]] = row["classification"]
        written += 1

    # ── Crosswalk: auto tier only ────────────────────────────────────────────
    existing_entries = _read(OVERRIDES / "crosswalk.json")
    existing_keys = {(e["source"], e["source_key"]) for e in existing_entries}
    promoted = list(existing_entries)
    added = 0
    for row in crosswalk_rows:
        if row["tier"] != "auto":
            continue
        if row["creamery_id"] is None and not row.get("excluded"):
            continue
        if (row["source"], row["source_key"]) in existing_keys:
            continue
        promoted.append({
            "source": row["source"],
            "source_key": row["source_key"],
            "creamery_id": row["creamery_id"],
            "method": "manual",
        })
        added += 1
    promoted.sort(key=lambda e: (e["source"], e["source_key"]))

    flagged = [r for r in classification_rows if r["tier"] == "review"]
    unresolved = [
        r for r in crosswalk_rows
        if r["creamery_id"] is None and not r.get("excluded")
        and r["source"] in ("masters", "contests") and r["tier"] != "auto"
    ]
    review_only = [
        r for r in crosswalk_rows
        if r["tier"] == "review" and r["creamery_id"] is not None
    ]

    print(f"promote: classifications — {written} written, {len(existing)} pre-existing kept")
    for company, theirs, ours in kept:
        print(f"    kept your value for {company}: {theirs} (evidence suggested {ours})")
    print(f"promote: crosswalk — {added} auto entries added ({len(existing_entries)} pre-existing kept)")
    print(f"promote: editorial worklist — {len(flagged)} flagged classifications, "
          f"{len(review_only)} crosswalk rows with a proposed target awaiting eyes, "
          f"{len(unresolved)} unresolved build-blockers")

    if dry_run:
        print("promote: dry run — nothing written")
        return
    _write(OVERRIDES / "classifications.json", classifications)
    _write(OVERRIDES / "crosswalk.json", promoted)
    print("promote: wrote data/overrides/classifications.json and crosswalk.json")


if __name__ == "__main__":
    main()
