"""Catalog assembler — the executable half of the flavor tagging pass.

Combines each exported creamery's made-role cheese-type links (the authoritative
company↔type mapping scraped from wisconsincheese.com's ?cheese= filter) with the
editorial tagging table in data/tagging/types.json, and writes:

    data/catalog/cheeses.json     one record per creamery × typed cheese type —
                                  the canonical catalog build.py reads
    queue/review_cheeses.json     the tagging worklist: type ids that have no
                                  table row yet (with their makers), and places
                                  where the table's texture disagrees with DFW's
                                  own hardness grouping

Rules of the pass:
- A type absent from the tagging table produces NO records. Untagged cheese is a
  visible worklist entry, never a silently invented record and never a silently
  dropped one.
- The record's display name is DFW's type name verbatim (trademark glyphs kept;
  `trademarked` is detected from ® / ™). Ids come from the cleaned table name,
  so `sartori-company--bellavitano` stays stable however the glyphs render.
- Every curd-making creamery gets exactly one plain `family: curds` record via
  type 135 — that set is the curd map, per SCHEMA.md.
- Regenerate whenever classifications change: the catalog is built against the
  exported creamery set, and build.py fails loudly if a record's creamery has
  since left the export.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build  # noqa: E402

CATALOG = ROOT / "data" / "catalog"
QUEUE = ROOT / "queue"

# DFW's hardness grouping → SCHEMA texture, for the cross-check only.
HARDNESS_TEXTURE = {
    "Hard": "hard",
    "Semi-Hard": "semi_hard",
    "Semi-Soft": "semi_soft",
    "Soft": "soft",
}


def main() -> None:
    creameries = json.loads((ROOT / "build" / "creameries.json").read_text(encoding="utf-8"))
    dfw = {r["source_key"]: r for r in json.loads(
        (ROOT / "data" / "raw" / "dfw.json").read_text(encoding="utf-8"))}
    varieties = {v["id"]: v for v in json.loads(
        (ROOT / "data" / "raw" / "dfw_varieties.json").read_text(encoding="utf-8"))}
    table = json.loads((ROOT / "data" / "tagging" / "types.json").read_text(encoding="utf-8"))["types"]

    records: list[dict] = []
    untyped: dict[int, dict] = {}
    disagreements: list[dict] = []

    for creamery in sorted(creameries, key=lambda c: c["id"]):
        record = dfw.get(str(creamery["dfw_company_id"]))
        if not record:
            continue
        for link in sorted(record["cheese_types"], key=lambda t: t["id"]):
            if "made" not in link["roles"]:
                continue
            row = table.get(str(link["id"]))
            if row is None:
                entry = untyped.setdefault(
                    link["id"], {"type_id": link["id"], "name": link["name"], "makers": []}
                )
                entry["makers"].append(creamery["name"])
                continue
            records.append({
                "id": f"{creamery['id']}--{build._slugify(row['name'])}",
                "name": link["name"],
                "creamery_id": creamery["id"],
                "family": row["family"],
                "milk": row["milk"],
                "texture": row["texture"],
                "age_band": row["age_band"],
                "rind": row["rind"],
                "flavor": row["flavor"],
                "add_ins": row["add_ins"],
                "raw_milk": None,
                "trademarked": "®" in link["name"] or "™" in link["name"],
                "wisconsin_original": row.get("wisconsin_original", False),
                "description": None,
                "description_generated": True,
                "image": None,
            })

    # Cross-check the table against DFW's own hardness grouping — disagreement is
    # a review note, never an automatic change; the table is the editorial value.
    for type_id, row in sorted(table.items(), key=lambda kv: int(kv[0])):
        variety = varieties.get(int(type_id))
        if not variety or len(variety["hardness"]) != 1:
            continue
        dfw_texture = HARDNESS_TEXTURE[variety["hardness"][0]]
        if dfw_texture != row["texture"]:
            disagreements.append({
                "type_id": int(type_id),
                "name": row["name"],
                "table_texture": row["texture"],
                "dfw_hardness": variety["hardness"][0],
            })

    CATALOG.mkdir(exist_ok=True)
    records.sort(key=lambda r: r["id"])
    (CATALOG / "cheeses.json").write_text(
        json.dumps(records, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )
    review = {
        "untyped_types": sorted(untyped.values(), key=lambda u: u["type_id"]),
        "texture_disagreements": disagreements,
    }
    (QUEUE / "review_cheeses.json").write_text(
        json.dumps(review, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )

    made_links = sum(len(u["makers"]) for u in untyped.values()) + len(records)
    print(
        f"catalog: {len(records)} cheese records from {made_links} made-links "
        f"({len(untyped)} untyped types covering "
        f"{sum(len(u['makers']) for u in untyped.values())} links -> review), "
        f"{len(disagreements)} texture disagreement(s)"
    )


if __name__ == "__main__":
    main()
