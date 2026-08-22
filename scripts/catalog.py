"""Catalog assembler — the executable half of the flavor tagging pass.

Two layers, one output:

TYPE LAYER   each exported creamery's made-role cheese-type links (the
             authoritative company↔type mapping from wisconsincheese.com's
             ?cheese= filter) × the editorial rows in data/tagging/types.json.

PRODUCT LAYER  named products — the census's real unit, per SCHEMA.md — from
             two sources: championship entry names already in build/awards.json,
             and shop titles harvested from creamery websites into
             queue/products_research.json. A product derives as
             base type row + name-parsed modifiers: "Habanero Muenster – 16 oz"
             → the Muenster row + add_ins [habanero] + flavor peppery, sizes
             stripped. Every token must be accounted for (base, modifier, or
             ignorable) or the name produces NO record and lands in the review
             file — an unknown word is flavor information we refuse to drop.

Bare type records are KEPT alongside named products: the bare record is the
creamery's plain variant, which is a real product (Marieke sells plain Gouda
next to the smoked one; Klondike's plain Feta wins championships). A product
whose name is exactly the type name, or whose parse adds no tags, simply IS
the bare record and produces no duplicate.

Outputs:
    data/catalog/cheeses.json     the canonical catalog build.py reads
    queue/review_cheeses.json     untyped types, unparsed product names, and
                                  texture disagreements with DFW's groupings

Regenerate whenever classifications change: the catalog is built against the
exported creamery set, and build.py fails loudly if a record's creamery has
since left the export.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build  # noqa: E402

CATALOG = ROOT / "data" / "catalog"
QUEUE = ROOT / "queue"
RESEARCH = QUEUE / "products_research.json"

AGE_ORDER = ["fresh", "young", "medium", "aged", "extra_aged"]

# DFW's hardness grouping → SCHEMA texture, for the cross-check only.
HARDNESS_TEXTURE = {
    "Hard": "hard",
    "Semi-Hard": "semi_hard",
    "Semi-Soft": "semi_soft",
    "Soft": "soft",
}

# Trailing size/SKU segments on shop titles: "– 16 oz 2A", "(8 oz)", "- 1 lb".
SIZE_TAIL = re.compile(
    r"\s*[-–—(]\s*(approx\.?\s*)?\d[\d.,/]*\s*(oz|ounce|ounces|lb|lbs|pound|pounds|#|ct|count|pack)\b.*$",
    re.IGNORECASE,
)
# Sizes some shops print without a separator: "15.5 oz Chipotle Colby",
# "1lb 3 Pepper Gouda", "4 Year Aged Yellow Cheddar 1lb." — packaging, not name.
# A digit is required before the unit, so "Party Pack" and "8 Year" survive.
_SIZE_UNIT = r"(?:oz|ounce|ounces|lb|lbs|pound|pounds|ct|count|pack)"
SIZE_HEAD = re.compile(rf"^\d[\d.,/]*\s*{_SIZE_UNIT}\b\.?\s*", re.IGNORECASE)
SIZE_BARE_TAIL = re.compile(rf"\s+\d[\d.,/]*\s*{_SIZE_UNIT}\b\.?$", re.IGNORECASE)


def _fold(value: str) -> str:
    """Product-name folding. Deliberately NOT build._normalize_name — that strips
    legal noise ('co', 'and'), which would eat 'Co-Jack' alive."""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[®™©]", " ", text)
    text = re.sub(r"[^a-z0-9 ]", " ", text.lower())
    return " ".join(text.split())


def clean_title(raw: str) -> str:
    """Strip deli-scale sizes; keep the name as the maker prints it."""
    cleaned = SIZE_TAIL.sub("", raw)
    cleaned = SIZE_HEAD.sub("", cleaned)
    cleaned = SIZE_BARE_TAIL.sub("", cleaned)
    cleaned = cleaned.strip(" -–—,")
    return cleaned or raw.strip()


def main() -> None:
    creameries = {
        c["id"]: c
        for c in json.loads((ROOT / "build" / "creameries.json").read_text(encoding="utf-8"))
    }
    dfw = {r["source_key"]: r for r in json.loads(
        (ROOT / "data" / "raw" / "dfw.json").read_text(encoding="utf-8"))}
    varieties = {v["id"]: v for v in json.loads(
        (ROOT / "data" / "raw" / "dfw_varieties.json").read_text(encoding="utf-8"))}
    table = json.loads((ROOT / "data" / "tagging" / "types.json").read_text(encoding="utf-8"))
    types, aliases, modifiers = table["types"], table["base_aliases"], table["modifiers"]
    ignore = set(table["ignore"])
    brand_words = {k: set(v) for k, v in table.get("brand_words", {}).items()
                   if not k.startswith("_")}

    # A creamery's own name inside its own product names carries no tag
    # information — "Marieke Smoked Gouda" is the Gouda row plus smoky.
    creamery_ignore: dict[str, set[str]] = {}
    for creamery in creameries.values():
        words = set(_fold(creamery["name"]).split())
        for alias in creamery["aka"]:
            words |= set(_fold(alias).split())
        creamery_ignore[creamery["id"]] = words | brand_words.get(creamery["id"], set())

    # Base-name index: folded type names + aliases, matched longest-first.
    base_index: dict[str, str] = {}
    for type_id, row in types.items():
        base_index[_fold(row["name"])] = type_id
    for alias, type_id in aliases.items():
        base_index.setdefault(_fold(alias), type_id)
    bases_by_length = sorted(base_index, key=lambda b: (-len(b.split()), -len(b), b))
    modifier_index = {_fold(k): v for k, v in modifiers.items()}
    # Style words left dangling after the (longest) base was consumed — the
    # "cheddar" in "White Cheddar Cheese Curds" — carry no tag information the
    # chosen base does not already carry.
    base_tokens = {token for base in base_index for token in base.split()}

    def parse(raw_name: str, creamery_id: str) -> tuple[dict | None, str | None]:
        """→ (derived tag effects incl. type_id, None) or (None, reason)."""
        own_words = creamery_ignore.get(creamery_id, set())
        tokens = _fold(clean_title(raw_name)).split()
        if not tokens:
            return None, "empty after cleaning"
        base_id = None
        for base in bases_by_length:
            base_words = base.split()
            for start in range(len(tokens) - len(base_words) + 1):
                if tokens[start:start + len(base_words)] == base_words:
                    base_id = base_index[base]
                    tokens = tokens[:start] + tokens[start + len(base_words):]
                    break
            if base_id:
                break
        if base_id is None:
            return None, "no base type in name"

        add_ins: list[str] = []
        flavor_extra: list[str] = []
        milk: list[str] = []
        raw_milk = False
        age_shift = 0
        index = 0
        unknown: list[str] = []
        while index < len(tokens):
            matched = False
            for width in (3, 2, 1):
                window = " ".join(tokens[index:index + width])
                if width <= len(tokens) - index and window in modifier_index:
                    effect = modifier_index[window]
                    add_ins.extend(a for a in effect.get("add_ins", []) if a not in add_ins)
                    flavor_extra.extend(
                        f for f in effect.get("flavor", []) if f not in flavor_extra
                    )
                    milk.extend(m for m in effect.get("milk", []) if m not in milk)
                    raw_milk = raw_milk or effect.get("raw_milk", False)
                    age_shift += effect.get("age_shift", 0)
                    index += width
                    matched = True
                    break
            if matched:
                continue
            token = tokens[index]
            if (token in ignore or token in own_words or token in base_tokens
                    or len(token) == 1 or any(ch.isdigit() for ch in token)):
                index += 1
                continue
            unknown.append(token)
            index += 1
        if unknown:
            return None, f"unknown token(s): {', '.join(unknown)}"
        return {
            "type_id": base_id,
            "add_ins": add_ins,
            "flavor_extra": flavor_extra,
            "milk": milk,
            "raw_milk": raw_milk,
            "age_shift": age_shift,
        }, None

    def build_record(creamery_id: str, display: str, raw: str, derived: dict) -> dict:
        row = types[derived["type_id"]]
        age_index = AGE_ORDER.index(row["age_band"]) + derived["age_shift"]
        age_band = AGE_ORDER[max(0, min(len(AGE_ORDER) - 1, age_index))]
        # Modifier flavors are the distinguishing signal — they survive the cap.
        flavor = list(derived["flavor_extra"])
        for tag in row["flavor"]:
            if tag not in flavor:
                flavor.append(tag)
        flavor = flavor[:6]
        add_ins = sorted(set(row["add_ins"]) | set(derived["add_ins"]))
        return {
            "id": f"{creamery_id}--{build._slugify(display)}",
            "name": display,
            "creamery_id": creamery_id,
            "family": row["family"],
            "milk": derived.get("milk") or row["milk"],
            "texture": row["texture"],
            "age_band": age_band,
            "rind": row["rind"],
            "flavor": flavor,
            "add_ins": add_ins,
            # null means unverified; a name that says "raw milk" is real reporting.
            "raw_milk": True if derived.get("raw_milk") else None,
            "trademarked": "®" in raw or "™" in raw,
            "wisconsin_original": row.get("wisconsin_original", False),
            "description": None,
            "description_generated": True,
            "image": None,
        }

    # ── Product sources: shop harvest first (its spelling wins), then contests ──
    sources: list[tuple[str, str, str]] = []  # (creamery_id, raw_name, source)
    if RESEARCH.exists():
        for entry in json.loads(RESEARCH.read_text(encoding="utf-8")):
            if entry["creamery_id"] not in creameries:
                continue
            for product in entry["products"]:
                sources.append((entry["creamery_id"], product, "shop"))
    awards = json.loads((ROOT / "build" / "awards.json").read_text(encoding="utf-8"))
    seen_contest: set[tuple[str, str]] = set()
    for award in awards:
        creamery_id = award["creamery_id"]
        if creamery_id and creamery_id in creameries:
            key = (creamery_id, award["entry"]["cheese_name"])
            if key not in seen_contest:
                seen_contest.add(key)
                sources.append((creamery_id, award["entry"]["cheese_name"], "contest"))

    # Semantic dedupe: the same base type with the same modifiers at the same
    # creamery is ONE product however the name is spelled — "Havarti Dill" and
    # "Decatur Dairy Dill Havarti Cheese" must not become two records. Shop
    # spellings beat contest spellings (sources are ordered that way); within a
    # source the shortest display name wins, then lexicographic order.
    chosen: dict[tuple, tuple[int, int, str, str, dict]] = {}
    unparsed: list[dict] = []
    for creamery_id, raw, source in sources:
        derived, reason = parse(raw, creamery_id)
        if derived is None:
            unparsed.append({
                "creamery_id": creamery_id, "name": raw, "source": source, "reason": reason,
            })
            continue
        # A parse that adds nothing — no add-ins, no flavor, no milk or raw-milk
        # fact, no age shift — IS the bare type record under a longer name
        # ("Decatur Dairy Havarti"). The type row covers it; a product record
        # would only duplicate it with worse tags.
        if not (derived["add_ins"] or derived["flavor_extra"] or derived["milk"]
                or derived["raw_milk"] or derived["age_shift"]):
            continue
        display = clean_title(raw)
        key = (
            creamery_id,
            derived["type_id"],
            tuple(sorted(derived["add_ins"])),
            tuple(sorted(derived["flavor_extra"])),
            tuple(sorted(derived["milk"])),
            derived["raw_milk"],
            derived["age_shift"],
        )
        rank = (0 if source == "shop" else 1, len(display), display, raw)
        if key not in chosen or rank < chosen[key][:4]:
            chosen[key] = (*rank, {"creamery_id": creamery_id, "display": display,
                                   "raw": raw, "derived": derived})

    products: dict[str, dict] = {}
    for key in sorted(chosen, key=lambda k: str(k)):
        pick = chosen[key][4]
        record = build_record(pick["creamery_id"], pick["display"], pick["raw"], pick["derived"])
        if record["id"] not in products:
            products[record["id"]] = record

    # ── Type layer: every made-role link keeps its bare (plain-variant) record ──
    records: list[dict] = list(products.values())
    untyped: dict[int, dict] = {}
    disagreements: list[dict] = []
    for creamery in sorted(creameries.values(), key=lambda c: c["id"]):
        dfw_record = dfw.get(str(creamery["dfw_company_id"]))
        if not dfw_record:
            continue
        for link in sorted(dfw_record["cheese_types"], key=lambda t: t["id"]):
            if "made" not in link["roles"]:
                continue
            row = types.get(str(link["id"]))
            if row is None:
                entry = untyped.setdefault(
                    link["id"], {"type_id": link["id"], "name": link["name"], "makers": []}
                )
                entry["makers"].append(creamery["name"])
                continue
            record = {
                **build_record(creamery["id"], row["name"], link["name"],
                               {"type_id": str(link["id"]), "add_ins": [],
                                "flavor_extra": [], "age_shift": 0}),
                "name": link["name"],
            }
            if record["id"] not in products:
                records.append(record)

    for type_id, row in sorted(types.items(), key=lambda kv: int(kv[0])):
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
        "unparsed_products": sorted(
            unparsed, key=lambda u: (u["creamery_id"], u["name"])
        ),
        "texture_disagreements": disagreements,
    }
    (QUEUE / "review_cheeses.json").write_text(
        json.dumps(review, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )

    named = len(products)
    print(
        f"catalog: {len(records)} records ({named} named products, "
        f"{len(records) - named} type-level) | "
        f"{len(unparsed)} unparsed product names -> review | "
        f"{len(untyped)} untyped types | {len(disagreements)} texture disagreement(s)"
    )


if __name__ == "__main__":
    main()
