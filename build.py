"""Pipeline orchestrator: raw → merge → overrides → validate → similarity → export.

Every failure is fatal and named. There are no warnings, no partial builds,
no fallbacks. If this script exits 0, build/ is complete and correct.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

from models import (
    CLASSIFICATIONS,
    Award,
    AwardEntry,
    Certification,
    Cheese,
    Creamery,
    CrosswalkEntry,
    FeaturedBoard,
    Highlight,
    Person,
    Plant,
    Retail,
    Sponsor,
)
from similarity import attach_similar

# Messages here are prose, em dashes and all, and dev is a Windows console whose
# default code page cannot encode them. Without this a fatal renders as mojibake and
# a plain print() raises UnicodeEncodeError over a character in its own error text.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

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

# Legal-form noise that carries no identity. Stripped before any name comparison.
# "and" is here because DATCP licenses "Alpine Slicing & Cheese Conversion Company"
# and "Alpine Slicing and Cheese Conversion Company" as two plants of one business.
LEGAL_NOISE = re.compile(
    r"\b(inc|llc|l\.l\.c|ltd|co|company|companies|cooperative|co-?op|corp|corporation"
    r"|usa|the|llp|lp|incorporated|and)\b"
)
# An exact normalized-name hit is the only thing trusted enough to become a crosswalk
# entry unattended. Fuzzy scoring is advisory only and lands in queue/proposed_crosswalk
# — measured against the real data, name similarity alone is actively dangerous:
# "Sartori Cheese Company" scores 0.83 against "Sargento Cheese", and both are in
# Plymouth, so neither name nor city rescues it. A human resolves those.
PROPOSAL_FLOOR = 0.72
CITY_ASSISTED_FLOOR = 0.50   # a weaker name is still worth showing if the city agrees
CITY_BONUS = 0.15
PROPOSALS_PER_RECORD = 3


def _normalize_name(value: str | None) -> str:
    text = re.sub(r"[^a-z0-9 ]", " ", (value or "").lower())
    return " ".join(LEGAL_NOISE.sub(" ", text).split())


def _slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_value.lower())).strip("-")


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


class Resolver:
    """Normalized-name index over canonical companies. Exact hits auto-resolve;
    everything else comes back as scored candidates for human review."""

    def __init__(self) -> None:
        self._by_name: dict[str, set[str]] = {}
        self._cities: dict[str, set[str]] = {}

    def add(self, company_key: str, *names: str | None) -> None:
        for name in names:
            normalized = _normalize_name(name)
            if normalized:
                self._by_name.setdefault(normalized, set()).add(company_key)

    def add_cities(self, company_key: str, cities) -> None:
        self._cities.setdefault(company_key, set()).update(
            c.strip().lower() for c in cities if c and c.strip()
        )

    def resolve(
        self, name: str | None, city: str | None = None
    ) -> tuple[str | None, list[dict]]:
        """Returns (auto-matched company key or None, ranked candidates).

        Only a unique exact normalized-name hit auto-matches. Candidates are ranked
        by city agreement first, then name similarity — a shared city is the strongest
        evidence available to the reviewer, and ordering by similarity alone buries the
        right answer (Steve Bechel's "Eau Galle Cheese" in Durand ties at 0.80 with
        "Cedar Valley Cheese" in Belgium, and only the city tells them apart).
        """
        normalized = _normalize_name(name)
        exact = self._by_name.get(normalized, set())
        if len(exact) == 1:
            return next(iter(exact)), []

        town = (city or "").strip().lower()
        best: dict[str, float] = {}
        for known, keys in self._by_name.items():
            score = round(_ratio(normalized, known), 3)
            for key in keys:
                if score > best.get(key, 0.0):
                    best[key] = score
        ranked = sorted(
            (
                {
                    "company_key": key,
                    "name_similarity": score,
                    "city_match": bool(town and town in self._cities.get(key, set())),
                }
                for key, score in best.items()
                if score >= PROPOSAL_FLOOR
                or (score >= CITY_ASSISTED_FLOOR and town and town in self._cities.get(key, set()))
            ),
            # Blend rather than hard-prioritise: a shared city is worth roughly the gap
            # between a good and an excellent name match, not an override of it.
            key=lambda c: (
                -(c["name_similarity"] + (CITY_BONUS if c["city_match"] else 0.0)),
                c["company_key"],
            ),
        )
        return None, ranked[:PROPOSALS_PER_RECORD]


def _datcp_companies(records: list[dict]) -> dict[str, list[dict]]:
    """Group licensed plants into companies. BelGioioso alone holds 12 plant numbers."""
    companies: dict[str, list[dict]] = {}
    for record in records:
        key = _normalize_name(record["business_name"])
        if not key:
            fatal(f"datcp plant {record['source_key']} has an unusable business name")
        companies.setdefault(key, []).append(record)
    return companies


def _assign_ids(companies: dict[str, dict]) -> None:
    """Stable, collision-free creamery slugs. Ids are forever — Supabase hearts key
    on them — so collisions are broken by city, then by a DATCP plant number, never
    by an ordinal that would shift when the directory changes."""
    taken: dict[str, str] = {}
    for key in sorted(companies):
        company = companies[key]
        base = _slugify(company["name"])
        candidate = base
        if candidate in taken:
            candidate = f"{base}-{_slugify(company['city'])}"
        if candidate in taken and company["plants"]:
            candidate = f"{base}-{company['plants'][0]['datcp_id'].lower()}"
        if candidate in taken:
            fatal(
                f"cannot assign a unique creamery id: '{company['name']}' and "
                f"'{companies[taken[candidate]]['name']}' both reduce to '{candidate}'"
            )
        taken[candidate] = key
        company["id"] = candidate


def merge(raw: dict[str, list[dict]]) -> dict:
    """Resolve source records into canonical creameries/cheeses/people/awards
    plus auto crosswalk entries (normalized name + address matching).

    DATCP is the spine: its plants group into companies keyed by normalized business
    name, and the plant number stays the canonical government key. DFW companies,
    master cheesemakers and contest entries resolve onto those companies by exact
    normalized name (against both the licensed name and the DBA); a DFW company that
    matches nothing becomes a creamery in its own right, since DFW lists real
    businesses that hold no Wisconsin plant licence.

    Returns {"creameries": [Creamery], "cheeses": [Cheese], "people": [Person],
             "awards": [Award], "crosswalk": [CrosswalkEntry]}.
    """
    companies: dict[str, dict] = {}
    crosswalk: list[dict] = []
    proposals: list[dict] = []

    # ── DATCP: the spine ─────────────────────────────────────────────────────
    for key, plants in _datcp_companies(raw["datcp"]).items():
        first = plants[0]
        companies[key] = {
            "key": key,
            "name": first["trade_name"],
            "aka": {p["business_name"] for p in plants} | {p["dba"] for p in plants if p["dba"]},
            "city": first["city"],
            "county": first["county"],
            "address": first["address"],
            "plants": [
                {
                    "datcp_id": p["source_key"],
                    "address": p["address"],
                    "city": p["city"],
                    "county": p["county"],
                    "operations": p["operations"],
                }
                for p in plants
            ],
            # Kept apart from the flattened operations list so the classification pass
            # can tell a cheese type ("Limburger") from a capability ("Retail Store").
            "cheeses_made": sorted({c for p in plants for c in p["cheese_manufactured"]}),
            "operations": sorted({o for p in plants for o in p["operations"]}),
            "dfw": None,
        }

    resolver = Resolver()
    for key, company in companies.items():
        resolver.add(key, key, *company["aka"])
        resolver.add_cities(key, [company["city"], *(p["city"] for p in company["plants"])])

    # ── DFW: the consumer layer ──────────────────────────────────────────────
    for record in sorted(raw["dfw"], key=lambda r: int(r["source_key"])):
        matched, candidates = resolver.resolve(record["name"], record["city"])
        if matched is None:
            matched = f"dfw:{record['source_key']}"
            companies[matched] = {
                "key": matched,
                "name": record["name"],
                "aka": set(),
                "city": record["city"] or "",
                "county": None,
                "address": "",
                "plants": [],
                "dfw": None,
            }
            if candidates:
                proposals.append({
                    "source": "dfw",
                    "source_key": record["source_key"],
                    "name": record["name"],
                    "city": record["city"],
                    "resolved_to": "a new standalone creamery",
                    "candidates": [
                        {**c,
                         "company": companies[c["company_key"]]["name"],
                         "city": companies[c["company_key"]]["city"],
                         "plants": len(companies[c["company_key"]]["plants"])}
                        for c in candidates
                    ],
                })
        # One company can carry two DFW listings — Union Star Cheese Factory is also
        # listed as its Willow Creek Cheese brand. Keep the lowest DFW id as the
        # primary so the creamery's identity does not depend on iteration order; the
        # other name lands in aka and both ids still resolve to this creamery.
        if companies[matched]["dfw"] is None:
            companies[matched]["dfw"] = record
        headquarters = next(
            (l for l in record["locations"] if l["kind"] == "Headquarters"),
            record["locations"][0] if record["locations"] else None,
        )
        if headquarters:
            companies[matched].setdefault("coords", (headquarters["lat"], headquarters["lng"]))
            if not companies[matched]["address"]:
                companies[matched]["address"] = headquarters["street"] or ""
            if not companies[matched]["city"]:
                companies[matched]["city"] = headquarters["city"]
        companies[matched]["aka"].add(record["name"])
        crosswalk.append({"source": "dfw", "source_key": record["source_key"], "company": matched})

    for key, company in companies.items():
        if company["name"] and company["dfw"]:
            company["name"] = company["dfw"]["name"]

        # city/county/address must describe the same place the pin does. Taking them
        # from plants[0] while lat/lng came from the DFW headquarters put Grande Cheese
        # (8 plants) in Green County with a pin 100km north in Fond du Lac. Prefer the
        # plant in the headquarters' city; fall back to the lowest-numbered plant.
        if company["plants"]:
            home = company["plants"][0]
            headquarters = next(
                (l for l in (company["dfw"] or {}).get("locations", [])
                 if l["kind"] == "Headquarters"),
                None,
            )
            if headquarters:
                home = next(
                    (p for p in company["plants"]
                     if p["city"].strip().lower() == (headquarters["city"] or "").strip().lower()),
                    home,
                )
            company["city"] = home["city"]
            company["county"] = home["county"]
            company["address"] = home["address"]

    _assign_ids(companies)
    company_id = {key: company["id"] for key, company in companies.items()}

    for record in raw["datcp"]:
        crosswalk.append({
            "source": "datcp",
            "source_key": record["source_key"],
            "company": _normalize_name(record["business_name"]),
        })

    # Manual crosswalk entries win over name matching, and they have to be read HERE
    # rather than left to apply_overrides(): a master cheesemaker or award that does
    # not resolve is skipped or left creamery-less by this function, so patching the
    # crosswalk afterwards would satisfy validation #6 while the Person record stayed
    # silently missing from the export.
    by_creamery_id = {company["id"]: key for key, company in companies.items()}
    manual: dict[tuple[str, str], str | None] = {}
    for entry in _read_json(OVERRIDES / "crosswalk.json"):
        target = entry["creamery_id"]
        if target is None:
            # A reviewed exclusion: the record deliberately resolves to nothing.
            manual[(entry["source"], entry["source_key"])] = None
            continue
        if target not in by_creamery_id:
            fatal(
                f"crosswalk override {entry['source']}:{entry['source_key']} targets unknown "
                f"creamery '{target}' — check queue/proposed_crosswalk.json for valid ids"
            )
        manual[(entry["source"], entry["source_key"])] = by_creamery_id[target]

    # A manual DFW entry must merge structurally, not just re-point a crosswalk row:
    # the standalone company merge() invented for that listing has to dissolve into
    # the licensed company, handing over its consumer layer (coordinates, retail,
    # website, trade name). Otherwise the override fixes resolution while a ghost
    # duplicate creamery stays in the export.
    for (source, source_key), target_key in manual.items():
        if source != "dfw":
            continue
        stray = companies.pop(f"dfw:{source_key}", None)
        if stray is None:
            continue  # the listing name-matched some company; apply_overrides re-points it
        target = companies[target_key]
        if target["dfw"] is None:
            target["dfw"] = stray["dfw"]
            target["name"] = stray["dfw"]["name"]
        target["aka"] |= {stray["name"]} | stray["aka"]
        if "coords" not in target and "coords" in stray:
            target["coords"] = stray["coords"]
        for entry in crosswalk:
            if entry["company"] == f"dfw:{source_key}":
                entry["company"] = target_key
        company_id.pop(f"dfw:{source_key}")

    # A manual DATCP entry re-homes the plant itself — that is how two licences that
    # are really one business (a creamery and its separately licensed store) become
    # one creamery. A company left with no plants and no DFW listing ceases to exist.
    rehomed = False
    for (source, source_key), target_key in manual.items():
        if source != "datcp":
            continue
        owner_key = next(
            (k for k, c in companies.items()
             if any(p["datcp_id"] == source_key for p in c["plants"])),
            None,
        )
        if owner_key is None or owner_key == target_key:
            continue
        owner = companies[owner_key]
        plant = next(p for p in owner["plants"] if p["datcp_id"] == source_key)
        owner["plants"].remove(plant)
        companies[target_key]["plants"].append(plant)
        rehomed = True
        for entry in crosswalk:
            if entry["source"] == "datcp" and entry["source_key"] == source_key:
                entry["company"] = target_key
        if not owner["plants"] and owner["dfw"] is None:
            companies.pop(owner_key)
            company_id.pop(owner_key)
    if rehomed:
        for company in companies.values():
            company["plants"].sort(key=lambda p: int(p["datcp_id"].split("-")[1]))

    # Everything resolves against the full canonical set, DFW-only companies included.
    full = Resolver()
    for key, company in companies.items():
        full.add(key, key, company["name"], *company["aka"])
        full.add_cities(key, [company["city"], *(p["city"] for p in company["plants"])])

    def _candidates(found: list[dict]) -> list[dict]:
        return [
            {**c, "company": companies[c["company_key"]]["name"],
             "city": companies[c["company_key"]]["city"]}
            for c in found
        ]

    # ── Masters and contests ─────────────────────────────────────────────────
    people: list[Person] = []
    for record in sorted(raw["masters"], key=lambda r: r["source_key"]):
        matched, candidates = full.resolve(record["company"], record["city"])
        override_key = ("masters", record["source_key"])
        if override_key in manual:
            matched = manual[override_key]
            if matched is None:
                continue  # reviewed exclusion: no licensee behind this company name
        if matched is None:
            proposals.append({
                "source": "masters",
                "source_key": record["source_key"],
                "name": record["company"],
                "city": record["city"],
                "resolved_to": None,
                "candidates": _candidates(candidates),
            })
            continue
        crosswalk.append({"source": "masters", "source_key": record["source_key"], "company": matched})
        display = record["name"]
        for maker in (companies[matched]["dfw"] or {}).get("master_cheesemakers", []):
            if _normalize_name(maker["name"]) == _normalize_name(record["name"]):
                display = maker["name"]  # DFW prints proper case; the PDF sets names in caps
        people.append(Person(
            id=record["source_key"],
            name=display,
            creamery_ids=[company_id[matched]],
            certifications=[Certification(**c) for c in record["certifications"]],
            active=True,
        ))

    # ── The cheese catalog (built by the flavor tagging pass) ────────────────
    # data/catalog/cheeses.json is scripts/catalog.py's product: one record per
    # exported creamery × tagged cheese type. Its absence is the legitimate
    # pre-tagging state, not an error. Regenerate it after classification
    # changes — a record pointing at a creamery that left the export is fatal
    # downstream, by design.
    catalog_path = ROOT / "data" / "catalog" / "cheeses.json"
    cheeses = (
        [Cheese(**record) for record in _read_json(catalog_path)]
        if catalog_path.exists()
        else []
    )
    cheeses_by_creamery: dict[str, list[Cheese]] = {}
    for cheese in cheeses:
        cheeses_by_creamery.setdefault(cheese.creamery_id, []).append(cheese)

    def _award_cheese(creamery_key: str | None, cheese_name: str) -> str | None:
        """Link an award to a cheese: an exact name match first (the catalog's
        named products come partly from these very entries), else exactly one of
        the creamery's cheeses appearing by name inside the published entry —
        'Odyssey Mediterranean Feta in Brine' contains Feta. Ambiguity stays
        unlinked."""
        if creamery_key is None:
            return None
        candidates = sorted(
            cheeses_by_creamery.get(company_id[creamery_key], []), key=lambda c: c.id
        )
        entry = f" {_normalize_name(cheese_name)} "
        exact = [c.id for c in candidates if _normalize_name(c.name) == entry.strip()]
        if len(exact) == 1:
            return exact[0]
        # Longest contained name wins: "Odyssey Mediterranean Feta in Brine"
        # prefers the creamery's "Mediterranean Feta" over its plainer fetas.
        # Never the reverse containment — an award for "Aged Gouda" must not
        # attach to "Smoked Aged Gouda"; unlinked is the honest state.
        hits = sorted(
            (c for c in candidates if f" {_normalize_name(c.name)} " in entry),
            key=lambda c: (-len(_normalize_name(c.name)), c.id),
        )
        return hits[0].id if hits else None

    awards: list[Award] = []
    for record in sorted(raw["contests"], key=lambda r: r["source_key"]):
        matched, candidates = full.resolve(record["company"], record["city"])
        override_key = ("contests", record["source_key"])
        excluded = override_key in manual and manual[override_key] is None
        if override_key in manual:
            matched = manual[override_key]
        if matched is None and not excluded:
            proposals.append({
                "source": "contests",
                "source_key": record["source_key"],
                "name": record["company"],
                "city": record["city"],
                "resolved_to": None,
                "candidates": _candidates(candidates),
            })
        if matched is not None:
            crosswalk.append({
                "source": "contests", "source_key": record["source_key"], "company": matched,
            })
        awards.append(Award(
            id=record["source_key"],
            contest=record["contest"],
            year=record["year"],
            class_number=record["class_number"],
            class_name=record["class_name"],
            placement=record["placement"],
            finalist=record["finalist"],
            champion=record["champion"],
            score=record["score"],
            entry=AwardEntry(
                cheese_name=record["cheese_name"],
                maker=record["maker"],
                company=record["company"],
                city=record["city"],
            ),
            creamery_id=company_id[matched] if matched else None,
            cheese_id=_award_cheese(matched, record["cheese_name"]),
        ))

    creameries = [
        Creamery(
            id=company["id"],
            name=company["name"],
            aka=sorted(n for n in company["aka"] if n and n != company["name"]),
            city=company["city"],
            county=company["county"],
            lat=company.get("coords", (None, None))[0],
            lng=company.get("coords", (None, None))[1],
            address=company["address"],
            website=(company["dfw"] or {}).get("website"),
            retail=Retail(
                store=bool((company["dfw"] or {}).get("retail", {}).get("store")),
                # DFW advertises mail-order and online filters but publishes neither
                # value; false here means "not advertised", and overrides carry truth.
                mail_order=False,
                online=False,
            ),
            plants=[Plant(**p) for p in company["plants"]],
            dfw_company_id=int(company["dfw"]["source_key"]) if company["dfw"] else None,
        )
        for company in sorted(companies.values(), key=lambda c: c["id"])
    ]

    proposals.extend(_duplicate_companies(companies))
    # A record a manual crosswalk entry already settled has nothing left to propose.
    proposals = [
        p for p in proposals if (p["source"], p["source_key"]) not in manual
    ]
    write_proposals(companies, proposals)

    return {
        "creameries": creameries,
        "cheeses": cheeses,
        "people": people,
        "awards": awards,
        "crosswalk": [
            CrosswalkEntry(
                source=entry["source"],
                source_key=entry["source_key"],
                creamery_id=company_id[entry["company"]],
                method="auto",
            )
            for entry in sorted(crosswalk, key=lambda e: (e["source"], e["source_key"]))
        ],
    }


# ── Review proposals (written every run, before the build's own gates) ───────

DUPLICATE_FLOOR = 0.85


def _duplicate_companies(companies: dict[str, dict]) -> list[dict]:
    """Two DATCP licences for one business look like two creameries. Surface the
    near-identical pairs that share a city — merging them is a manual crosswalk entry."""
    ordered = sorted(companies.values(), key=lambda c: c["id"])
    cities = {
        c["id"]: {t.lower() for t in [c["city"], *(p["city"] for p in c["plants"])] if t}
        for c in ordered
    }
    found = []
    for i, a in enumerate(ordered):
        for b in ordered[i + 1:]:
            if not cities[a["id"]] & cities[b["id"]]:
                continue
            score = round(_ratio(_normalize_name(a["name"]), _normalize_name(b["name"])), 3)
            if score < DUPLICATE_FLOOR:
                continue
            found.append({
                "source": "duplicate-company",
                "source_key": f"{a['id']}|{b['id']}",
                "name": a["name"],
                "city": a["city"],
                "resolved_to": None,
                "candidates": [{
                    "company": b["name"],
                    "company_key": b["id"],
                    "name_similarity": score,
                    "city": b["city"],
                    "shared_cities": sorted(cities[a["id"]] & cities[b["id"]]),
                    "plants": [p["datcp_id"] for p in a["plants"]] + [p["datcp_id"] for p in b["plants"]],
                }],
            })
    return found

def _suggest(company: dict) -> tuple[str, str]:
    dfw = company["dfw"]
    cheeses = company.get("cheeses_made", [])
    if dfw and "maker" in dfw["roles"]:
        types = ", ".join(t["name"] for t in dfw["cheese_types"][:4]) or "none listed"
        return "creamery", (
            f"DFW lists it as a maker ({len(dfw['cheese_types'])} cheese types: {types})"
            f"{', retail store' if dfw['retail']['store'] else ''}; "
            f"{len(company['plants'])} DATCP plant(s)"
        )
    if dfw:
        return "commodity", (
            f"DFW lists it under Sold By only, not Made By; {len(company['plants'])} DATCP plant(s)"
        )
    if cheeses:
        return "commodity", (
            f"{len(company['plants'])} DATCP plant(s) making {', '.join(cheeses[:5])}; "
            f"no DFW consumer listing"
        )
    return "processor", (
        f"{len(company['plants'])} DATCP plant(s), no cheese manufactured; "
        f"operations: {', '.join(company.get('operations', [])[:5]) or 'none listed'}"
    )


def write_proposals(companies: dict[str, dict], proposals: list[dict]) -> None:
    QUEUE.mkdir(exist_ok=True)
    suggested = []
    for company in sorted(companies.values(), key=lambda c: c["id"]):
        classification, evidence = _suggest(company)
        suggested.append({
            "id": company["id"],
            "name": company["name"],
            "city": company["city"],
            "suggested": classification,
            "evidence": evidence,
        })
    (QUEUE / "proposed_classifications.json").write_text(
        json.dumps(suggested, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )
    (QUEUE / "proposed_crosswalk.json").write_text(
        json.dumps(
            sorted(proposals, key=lambda p: (p["source"], p["source_key"])),
            indent=2, sort_keys=True, ensure_ascii=False,
        ) + "\n",
        encoding="utf-8", newline="\n",
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


def load_sponsors() -> list[Sponsor]:
    return [Sponsor(**s) for s in _read_json(ROOT / "data" / "sponsors.json")]


def load_boards() -> list[FeaturedBoard]:
    return [FeaturedBoard(**b) for b in _read_json(ROOT / "data" / "boards.json")]


# ── Stage 4: validation (all fatal) ──────────────────────────────────────────

def _no_duplicates(table: str, ids: list[str]) -> None:
    duplicates = sorted(i for i, count in Counter(ids).items() if count > 1)
    if duplicates:
        fatal(f"duplicate id(s) in {table}: {duplicates}")


def validate(ds: dict, raw: dict, classifications: dict[str, str]) -> None:
    for table in ("creameries", "cheeses", "people", "awards", "sponsors", "boards"):
        _no_duplicates(table, [record.id for record in ds[table]])

    exported_creameries = {
        c.id for c in ds["creameries"] if classifications[c.id] == "creamery"
    }
    all_creameries = {c.id for c in ds["creameries"]}
    cheese_ids = {c.id for c in ds["cheeses"]}

    ungeocoded = sorted(
        c.id for c in ds["creameries"]
        if c.id in exported_creameries and (c.lat is None or c.lng is None)
    )
    if ungeocoded:
        fatal(
            f"{len(ungeocoded)} exported creamery(ies) have no lat/lng — the map cannot "
            f"render a null. Geocode and pin them in data/overrides/creameries.json, or "
            f"reclassify: {ungeocoded[:10]}{' …' if len(ungeocoded) > 10 else ''}"
        )

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
    for board in ds["boards"]:
        unknown = [c for c in board.cheese_ids if c not in cheese_ids]
        if unknown:
            fatal(f"featured board '{board.id}' references unknown cheese(s) {unknown}")

    resolved = {(e.source, e.source_key) for e in ds["crosswalk"]}
    for entry in ds["crosswalk"]:
        if entry.creamery_id is None:
            continue  # a reviewed exclusion resolves the record to nothing, deliberately
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
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8", newline="\n",
    )


# ── Stage 6: deterministic export ────────────────────────────────────────────

def _write_table(name: str, records: list) -> None:
    payload = [r.model_dump(mode="json") for r in sorted(records, key=lambda r: r.id)]
    (BUILD / f"{name}.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
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
        encoding="utf-8", newline="\n",
    )
    _write_table("sponsors", ds["sponsors"])
    _write_table("boards", ds["boards"])
    return {name: len(records) for name, records in exported.items()}


def main() -> None:
    BUILD.mkdir(exist_ok=True)
    QUEUE.mkdir(exist_ok=True)

    raw = load_raw()
    ds = merge(raw)
    ds = apply_overrides(ds)
    ds["highlights"] = load_highlights()
    ds["sponsors"] = load_sponsors()
    ds["boards"] = load_boards()
    classifications = load_classifications(ds)
    validate(ds, raw, classifications)
    attach_similar(ds["cheeses"])
    write_queue_report(ds, classifications)
    counts = export(ds, classifications)
    print(
        "OK: "
        + ", ".join(f"{count} {name}" for name, count in counts.items())
        + f", {len(ds['highlights'])} highlights, {len(ds['sponsors'])} sponsors, "
        + f"{len(ds['boards'])} featured boards -> build/"
    )


if __name__ == "__main__":
    main()
