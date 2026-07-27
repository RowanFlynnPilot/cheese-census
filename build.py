"""Pipeline orchestrator: raw → merge → overrides → validate → similarity → export.

Every failure is fatal and named. There are no warnings, no partial builds,
no fallbacks. If this script exits 0, build/ is complete and correct.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from models import (
    CLASSIFICATIONS,
    Award,
    Cheese,
    Creamery,
    CrosswalkEntry,
    Highlight,
    Person,
)
from similarity import attach_similar

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
OVERRIDES = ROOT / "data" / "overrides"
BUILD = ROOT / "build"
QUEUE = ROOT / "queue"

SOURCES = ("datcp", "dfw", "masters", "contests")


def fatal(message: str) -> None:
    sys.exit(f"BUILD FAILED: {message}")


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


# ── Stage 1: load raw scraper output ─────────────────────────────────────────

def load_raw() -> dict[str, list[dict]]:
    raw = {}
    for source in SOURCES:
        path = RAW / f"{source}.json"
        if not path.exists():
            fatal(f"missing data/raw/{source}.json — run scrapers/{source}.py first")
        raw[source] = _read_json(path)
    return raw


# ── Stage 2: entity resolution ───────────────────────────────────────────────

def merge(raw: dict[str, list[dict]]) -> dict:
    """Resolve source records into canonical creameries/cheeses/people/awards
    plus auto crosswalk entries (normalized name + address matching).

    Returns {"creameries": [Creamery], "cheeses": [Cheese], "people": [Person],
             "awards": [Award], "crosswalk": [CrosswalkEntry]}.
    """
    raise NotImplementedError(
        "merge() is the next build step once scrapers emit raw JSON — see CLAUDE.md"
    )


# ── Stage 3: overrides (hand-edited, always win) ─────────────────────────────

def apply_overrides(ds: dict) -> dict:
    for table, model in (("creameries", Creamery), ("cheeses", Cheese)):
        patches: dict[str, dict] = _read_json(OVERRIDES / f"{table}.json")
        by_index = {record.id: i for i, record in enumerate(ds[table])}
        for record_id, patch in patches.items():
            if record_id not in by_index:
                fatal(f"override targets unknown {table} id '{record_id}'")
            current = ds[table][by_index[record_id]]
            ds[table][by_index[record_id]] = model.model_validate(
                {**current.model_dump(), **patch}
            )

    manual = [CrosswalkEntry(**e) for e in _read_json(OVERRIDES / "crosswalk.json")]
    for entry in manual:
        if entry.method != "manual":
            fatal(f"crosswalk override {entry.source}:{entry.source_key} must have method='manual'")
    manual_keys = {(e.source, e.source_key) for e in manual}
    ds["crosswalk"] = [
        e for e in ds["crosswalk"] if (e.source, e.source_key) not in manual_keys
    ] + manual
    return ds


def load_classifications(ds: dict) -> dict[str, str]:
    classifications: dict[str, str] = _read_json(OVERRIDES / "classifications.json")
    invalid = {k: v for k, v in classifications.items() if v not in CLASSIFICATIONS}
    if invalid:
        fatal(f"invalid classification value(s): {invalid} — allowed: {CLASSIFICATIONS}")
    missing = sorted(c.id for c in ds["creameries"] if c.id not in classifications)
    if missing:
        fatal(
            f"{len(missing)} creamery(ies) lack a classification in "
            f"data/overrides/classifications.json: {missing[:10]}{' …' if len(missing) > 10 else ''}"
        )
    return classifications


def load_highlights() -> list[Highlight]:
    return [Highlight(**h) for h in _read_json(ROOT / "data" / "highlights.json")]


# ── Stage 4: validation (all fatal) ──────────────────────────────────────────

def _no_duplicates(table: str, ids: list[str]) -> None:
    duplicates = sorted(i for i, count in Counter(ids).items() if count > 1)
    if duplicates:
        fatal(f"duplicate id(s) in {table}: {duplicates}")


def validate(ds: dict, raw: dict, classifications: dict[str, str]) -> None:
    for table in ("creameries", "cheeses", "people", "awards"):
        _no_duplicates(table, [record.id for record in ds[table]])

    exported_creameries = {
        c.id for c in ds["creameries"] if classifications[c.id] == "creamery"
    }
    all_creameries = {c.id for c in ds["creameries"]}
    cheese_ids = {c.id for c in ds["cheeses"]}

    for cheese in ds["cheeses"]:
        if cheese.creamery_id not in exported_creameries:
            fatal(
                f"cheese '{cheese.id}' belongs to non-exported creamery "
                f"'{cheese.creamery_id}' — reclassify the creamery or remove the cheese"
            )
    for person in ds["people"]:
        unknown = [c for c in person.creamery_ids if c not in all_creameries]
        if unknown:
            fatal(f"person '{person.id}' references unknown creamery(ies) {unknown}")
    for award in ds["awards"]:
        if award.creamery_id and award.creamery_id not in all_creameries:
            fatal(f"award '{award.id}' references unknown creamery '{award.creamery_id}'")
        if award.cheese_id and award.cheese_id not in cheese_ids:
            fatal(f"award '{award.id}' references unknown cheese '{award.cheese_id}'")
    for highlight in ds["highlights"]:
        if highlight.cheese_id not in cheese_ids:
            fatal(f"highlight references unknown cheese '{highlight.cheese_id}'")

    resolved = {(e.source, e.source_key) for e in ds["crosswalk"]}
    for entry in ds["crosswalk"]:
        if entry.creamery_id not in all_creameries:
            fatal(
                f"crosswalk {entry.source}:{entry.source_key} targets unknown "
                f"creamery '{entry.creamery_id}'"
            )
    for source, records in raw.items():
        for record in records:
            key = record.get("source_key")
            if key is None:
                fatal(f"raw {source} record missing 'source_key' — scraper contract violation")
            if (source, key) not in resolved:
                fatal(
                    f"unresolved {source} record '{key}' — add a crosswalk entry "
                    f"(data/overrides/crosswalk.json) or classify its company 'excluded'; "
                    f"the build refusing to proceed is the feature"
                )


# ── Stage 5: queue reports (review work, never build-fatal) ──────────────────

def write_queue_report(ds: dict, classifications: dict[str, str]) -> None:
    cheeses_per_creamery = Counter(c.creamery_id for c in ds["cheeses"])
    descriptions = Counter(
        "missing" if c.description is None
        else "generated" if c.description_generated
        else "edited"
        for c in ds["cheeses"]
    )
    report = {
        "creameries_without_cheeses": sorted(
            c.id for c in ds["creameries"]
            if classifications[c.id] == "creamery" and cheeses_per_creamery[c.id] == 0
        ),
        "awards_matched_creamery_not_cheese": sorted(
            a.id for a in ds["awards"] if a.creamery_id and not a.cheese_id
        ),
        "descriptions": {k: descriptions.get(k, 0) for k in ("missing", "generated", "edited")},
    }
    (QUEUE / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


# ── Stage 6: deterministic export ────────────────────────────────────────────

def _write_table(name: str, records: list) -> None:
    payload = [r.model_dump(mode="json") for r in sorted(records, key=lambda r: r.id)]
    (BUILD / f"{name}.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def export(ds: dict, classifications: dict[str, str]) -> dict[str, int]:
    exported = {
        "creameries": [c for c in ds["creameries"] if classifications[c.id] == "creamery"],
        "cheeses": ds["cheeses"],
        "people": ds["people"],
        "awards": ds["awards"],
    }
    for name, records in exported.items():
        _write_table(name, records)
    highlights = sorted(ds["highlights"], key=lambda h: (h.starts, h.cheese_id))
    (BUILD / "highlights.json").write_text(
        json.dumps([h.model_dump(mode="json") for h in highlights],
                   indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return {name: len(records) for name, records in exported.items()}


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    QUEUE.mkdir(exist_ok=True)

    raw = load_raw()
    ds = merge(raw)
    ds = apply_overrides(ds)
    ds["highlights"] = load_highlights()
    classifications = load_classifications(ds)
    validate(ds, raw, classifications)
    attach_similar(ds["cheeses"])
    write_queue_report(ds, classifications)
    counts = export(ds, classifications)
    print(
        "OK: "
        + ", ".join(f"{count} {name}" for name, count in counts.items())
        + f", {len(ds['highlights'])} highlights → build/"
    )


if __name__ == "__main__":
    main()
