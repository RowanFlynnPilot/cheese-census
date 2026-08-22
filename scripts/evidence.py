"""Review-evidence assembler — a curation tool, run deliberately, never in build.py.

Reads the raw sources, the current merge() state and proposals, plus optional web
research notes (queue/web_research.json, written from supervised research runs),
and emits two review files:

    queue/review_crosswalk.json        one row per crosswalk decision
    queue/review_classifications.json  one row per company

Every row carries a decision, a tier, and the evidence a reviewer needs:

    tier "auto"    hard evidence — an exact signal (shared phone number, shared
                   street address, agreeing website domain, a deterministic name
                   rule) or, for records that would otherwise block the build, a
                   web-research finding whose legal name resolves exactly to one
                   canonical company.
    tier "review"  a human should look: conflicting signals, judgment calls
                   (seller-only listings, upgrade candidates), or no evidence.

scripts/promote.py writes the auto tier into data/overrides/. Nothing here
touches overrides, raw, or build output.
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import build  # noqa: E402  (reconfigures stdout, brings the name helpers)

QUEUE = ROOT / "queue"
WEB_RESEARCH = QUEUE / "web_research.json"

SIMILARITY_CONFLICT = 0.75  # a lookalike this close means a signal match is ambiguous


def _phone10(value: str | None) -> str | None:
    digits = re.sub(r"\D", "", value or "")
    return digits[-10:] if len(digits) >= 10 else None


def _addr_key(street: str | None, city: str | None) -> tuple[str, str] | None:
    if not street or not city:
        return None
    text = re.sub(r"[^a-z0-9 ]", " ", street.lower())
    for full, abbrev in (
        ("street", "st"), ("road", "rd"), ("drive", "dr"), ("avenue", "ave"),
        ("highway", "hwy"), ("north", "n"), ("south", "s"), ("east", "e"), ("west", "w"),
    ):
        text = re.sub(rf"\b{full}\b", abbrev, text)
    return (" ".join(text.split()), city.strip().lower())


def _domain(url: str | None) -> str | None:
    if not url:
        return None
    match = re.search(r"(?:https?://)?(?:www\.)?([a-z0-9\-\.]+\.[a-z]{2,})", url.lower())
    return match.group(1) if match else None


def main() -> None:
    raw = build.load_raw()
    ds = build.merge(raw)

    plant_company: dict[str, str] = {}
    dfw_company: dict[str, str] = {}
    for entry in ds["crosswalk"]:
        if entry.source == "datcp":
            plant_company[entry.source_key] = entry.creamery_id
        elif entry.source == "dfw":
            dfw_company[entry.source_key] = entry.creamery_id

    companies = {c.id: c for c in ds["creameries"]}
    datcp_by_plant = {r["source_key"]: r for r in raw["datcp"]}
    dfw_by_key = {r["source_key"]: r for r in raw["dfw"]}

    # ── Signal indexes over the canonical set ────────────────────────────────
    by_phone: dict[str, set[str]] = collections.defaultdict(set)
    by_addr: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for record in raw["datcp"]:
        company = plant_company[record["source_key"]]
        phone = _phone10(record["phone"])
        if phone:
            by_phone[phone].add(company)
        key = _addr_key(record["address"], record["city"])
        if key:
            by_addr[key].add(company)

    by_domain: dict[str, set[str]] = collections.defaultdict(set)
    for record in raw["dfw"]:
        company = dfw_company[record["source_key"]]
        for url in [record["website"], *(l["website"] for l in record["locations"])]:
            domain = _domain(url)
            if domain:
                by_domain[domain].add(company)

    # Two name indexes: legal business names, and everything (dba, aliases). A hit
    # on a legal name outranks a hit on a borrowed trade name — White Hill Cheese
    # trades as "Prairie Farms Dairy, Inc." but is not Prairie Farms Dairy, Inc.
    by_name_legal: dict[str, set[str]] = collections.defaultdict(set)
    by_name: dict[str, set[str]] = collections.defaultdict(set)

    def _learn(name: str | None, company: str, *, legal: bool = False) -> None:
        normalized = build._normalize_name(name)
        if not normalized:
            return
        by_name[normalized].add(company)
        if legal:
            by_name_legal[normalized].add(company)

    for record in raw["datcp"]:
        _learn(record["business_name"], plant_company[record["source_key"]], legal=True)
        _learn(record["dba"], plant_company[record["source_key"]])
    for record in raw["dfw"]:
        _learn(record["name"], dfw_company[record["source_key"]], legal=True)
    for company in companies.values():
        _learn(company.name, company.id)
        for alias in company.aka:
            _learn(alias, company.id)

    cities = {build._normalize_name(r["city"]) for r in raw["datcp"]}
    cities |= {build._normalize_name(r["municipality"] or "") for r in raw["datcp"]}
    cities.discard("")

    # Acronyms must come from the RAW names: AMPI is A-M-P-I only while
    # "Associated Milk Producers, Inc." still carries its Inc.
    by_acronym: dict[str, set[str]] = collections.defaultdict(set)
    def _learn_acronym(name: str | None, company: str) -> None:
        words = re.findall(r"[a-z]+", (name or "").lower())
        if len(words) >= 3:
            by_acronym["".join(w[0] for w in words)].add(company)
    for record in raw["datcp"]:
        _learn_acronym(record["business_name"], plant_company[record["source_key"]])
        _learn_acronym(record["dba"], plant_company[record["source_key"]])
    for record in raw["dfw"]:
        _learn_acronym(record["name"], dfw_company[record["source_key"]])

    def _city_filter(ids: set[str], city: str | None) -> set[str]:
        """DATCP licenses some chains as one business per city (Prairie Farms
        Mindoro / Shullsburg are separate companies), so an ambiguous name plus
        the entrant's city is often a unique fact."""
        if not city or len(ids) < 2:
            return ids
        town = city.strip().lower()
        narrowed = {
            company for company in ids
            if companies[company].city.strip().lower() == town
            or any(p.city.strip().lower() == town for p in companies[company].plants)
        }
        return narrowed or ids

    similarity_names = sorted(by_name)

    def _conflicts(name: str, matched: set[str]) -> list[str]:
        """Companies that look confusably like `name` but are NOT the match."""
        normalized = build._normalize_name(name)
        found = []
        for known in similarity_names:
            ids = by_name[known] - matched
            if not ids:
                continue
            if build._ratio(normalized, known) >= SIMILARITY_CONFLICT:
                found.extend(sorted(ids))
        return sorted(set(found))

    # ── Deterministic name-rule chain (contests, web-found legal names) ─────
    def _resolve_name(name: str, city: str | None) -> tuple[str | None, str | None]:
        variants: set[str] = set()
        base = build._normalize_name(name)
        variants.add(base)
        for part in re.split(r"[/,]", name):
            piece = build._normalize_name(part)
            if piece:
                variants.add(piece)
        for variant in list(variants):
            tokens = variant.split()
            tokens = [t for t in tokens if t != "s"]  # possessive debris: "henning s"
            variants.add(" ".join(tokens))
            for cut in (1, 2, 3):
                if len(tokens) > cut:
                    tail = " ".join(tokens[-cut:])
                    if tail in cities or (city and tail == build._normalize_name(city)):
                        variants.add(" ".join(tokens[:-cut]))
        ordered = sorted(variants, key=lambda v: (-len(v), v))

        def _settle(hits: set[str], rule: str) -> tuple[str, str] | None:
            narrowed = _city_filter(hits, city)
            if len(narrowed) == 1:
                suffix = " + city" if len(hits) > 1 else ""
                return next(iter(narrowed)), rule + suffix
            return None

        # Legal names adjudicate before trade names do.
        for index, label in ((by_name_legal, " (legal name)"), (by_name, "")):
            for variant in ordered:
                if found := _settle(index.get(variant, set()), f"name match on '{variant}'{label}"):
                    return found
            # unique prefix in either direction (two tokens minimum)
            for variant in ordered:
                if len(variant.split()) < 2:
                    continue
                hits = {
                    company
                    for known, ids in index.items()
                    if known.startswith(variant + " ") or variant.startswith(known + " ")
                    for company in ids
                }
                if found := _settle(hits, f"name prefix '{variant}'{label}"):
                    return found
            # a licensed name buried inside the entrant string:
            # "Sigma Darlington Plant Mexican Cheese Producers" contains a licensee
            for variant in ordered:
                hits = {
                    company
                    for known, ids in index.items()
                    if len(known) >= 12 and f" {known} " in f" {variant} "
                    for company in ids
                }
                if found := _settle(hits, f"licensed name contained in entrant name{label}"):
                    return found
        # acronym: AMPI == initials of "Associated Milk Producers, Inc."
        for variant in sorted(variants):
            if " " in variant or not 3 <= len(variant) <= 6:
                continue
            if found := _settle(by_acronym.get(variant, set()), f"acronym '{variant.upper()}'"):
                return found
        # last resort, still deterministic: near-identical spelling, far above the
        # lookalike zone (Sartori/Sargento sit at 0.83)
        best: list[tuple[float, str]] = []
        for known, ids in by_name.items():
            score = build._ratio(build._normalize_name(name), known)
            if score >= 0.92:
                best.extend((score, company) for company in ids)
        hits = {company for _, company in best}
        if found := _settle(hits, f"near-identical spelling ({max(best)[0]:.2f})" if best else ""):
            return found
        return None, None

    web: dict[str, dict] = {}
    if WEB_RESEARCH.exists():
        web = {r["id"]: r for r in json.loads(WEB_RESEARCH.read_text(encoding="utf-8"))}
        # Contest research ids were written from cleaned entrant names; the proposals
        # carry them verbatim ("Hansen's Sugar Shack, llC"). Fold both sides so the
        # lookup does not hinge on the junk suffix.
        folded = {}
        for research_id, row in list(web.items()):
            if research_id.startswith("contest:"):
                folded["contest:" + build._normalize_name(research_id[8:])] = row
        web |= folded

    def _web_resolution(
        research_id: str, city: str | None
    ) -> tuple[str | None, bool, list[dict]]:
        """Returns (target, excluded, evidence). A web identity finding counts as
        auto only when its legal name lands exactly on one canonical company through
        the deterministic chain; a no-licence verdict is a reviewed exclusion."""
        note = web.get(research_id)
        if not note and research_id.startswith("contest:"):
            note = web.get("contest:" + build._normalize_name(research_id[8:]))
        if not note:
            return None, False, []
        evidence = [{
            "signal": "web-research",
            "detail": note["finding"],
            "url": note.get("url"),
            "confidence": note.get("confidence"),
        }]
        if note.get("verdict") == "no_wisconsin_licence" and \
                note.get("confidence") in ("high", "medium"):
            return None, True, evidence
        if note.get("verdict") != "identified":
            return None, False, evidence
        # Findings are prose and often name bystanders — an acquirer, a colleague's
        # company, a successor plant. Resolve only when exactly ONE licensed company
        # is mentioned anywhere in the finding; otherwise a human picks.
        haystack = f" {build._normalize_name(note['finding'])} "
        mentioned: set[str] = set()
        for known, ids in by_name.items():
            weighty = len(known.split()) >= 2 or (known in by_name_legal and len(known) >= 4)
            if weighty and f" {known} " in haystack:
                mentioned |= ids
        if len(mentioned) == 1 and note.get("confidence") in ("high", "medium"):
            evidence.append({"signal": "name-rule",
                             "detail": "the finding mentions exactly one licensed company"})
            return next(iter(mentioned)), False, evidence
        if len(mentioned) > 1:
            evidence.append({
                "signal": "note",
                "detail": f"finding mentions several licensed companies "
                          f"({', '.join(sorted(companies[c].name for c in mentioned))}) — not resolvable mechanically",
            })
            return None, False, evidence
        target, rule = _resolve_name(note["finding"], city)
        if target and note.get("confidence") in ("high", "medium"):
            evidence.append({"signal": "name-rule", "detail": rule})
            return target, False, evidence
        return None, False, evidence

    # ── Crosswalk review ─────────────────────────────────────────────────────
    proposals = json.loads((QUEUE / "proposed_crosswalk.json").read_text(encoding="utf-8"))
    crosswalk_rows: list[dict] = []
    fanout = collections.defaultdict(list)  # contest company -> source_keys
    for proposal in proposals:
        if proposal["source"] == "contests":
            fanout[(proposal["name"], proposal["city"])].append(proposal["source_key"])

    def _row(source: str, source_key: str, target: str | None, tier: str,
             evidence: list[dict], note: str | None = None, *,
             excluded: bool = False) -> None:
        crosswalk_rows.append({
            "source": source,
            "source_key": source_key,
            "creamery_id": target,
            "excluded": excluded,
            "tier": tier,
            "note": note,
            "evidence": evidence,
        })

    for proposal in proposals:
        source, key = proposal["source"], proposal["source_key"]

        if source == "dfw":
            record = dfw_by_key[key]
            self_id = dfw_company[key]
            matched: set[str] = set()
            evidence: list[dict] = []
            for location in record["locations"]:
                phone = _phone10(location["phone"])
                for company in sorted(by_phone.get(phone, set()) - {self_id}):
                    matched.add(company)
                    evidence.append({
                        "signal": "phone",
                        "detail": f"{location['phone']} is also the licence phone of "
                                  f"{companies[company].name}",
                    })
                addr = _addr_key(location["street"], location["city"])
                for company in sorted(by_addr.get(addr, set()) - {self_id}):
                    matched.add(company)
                    evidence.append({
                        "signal": "address",
                        "detail": f"{location['street']}, {location['city']} is also a "
                                  f"licensed plant address of {companies[company].name}",
                    })
            web_target, _, web_evidence = _web_resolution(f"dfw:{key}", record["city"])
            evidence.extend(web_evidence)
            if len(matched) == 1:
                target = next(iter(matched))
                lookalikes = _conflicts(record["name"], {target, self_id})
                if lookalikes:
                    _row(source, key, target, "review", evidence,
                         f"signal match, but lookalike company(ies) exist: {lookalikes}")
                else:
                    _row(source, key, target, "auto", evidence)
            elif len(matched) > 1:
                _row(source, key, None, "review", evidence,
                     f"signals split across {sorted(matched)}")
            elif web_target:
                _row(source, key, web_target, "review", evidence,
                     "web identity only — no contact-detail corroboration; not build-blocking")
            else:
                _row(source, key, None, "review", evidence or
                     [{"signal": "none", "detail": "no phone/address/web corroboration"}])

        elif source == "masters":
            record = next(m for m in raw["masters"] if m["source_key"] == key)
            phone_hits = set(by_phone.get(_phone10(record["phone"]), set()))
            domain_hits = set(by_domain.get(_domain(record["website"]), set()))
            evidence = []
            for company in sorted(phone_hits):
                evidence.append({
                    "signal": "phone",
                    "detail": f"{record['phone']} is the licence phone of {companies[company].name}",
                })
            for company in sorted(domain_hits):
                evidence.append({
                    "signal": "domain",
                    "detail": f"{record['website']} is the listed website of {companies[company].name}",
                })
            all_hits = phone_hits | domain_hits
            web_target, web_excluded, web_evidence = _web_resolution(
                f"masters:{key}", record["city"]
            )
            evidence.extend(web_evidence)
            if len(all_hits) == 1:
                _row(source, key, next(iter(all_hits)), "auto", evidence)
            elif phone_hits and domain_hits and len(phone_hits & domain_hits) == 1:
                _row(source, key, next(iter(phone_hits & domain_hits)), "auto", evidence)
            elif all_hits:
                # Signals split — usually one business holding a plant licence and a
                # store licence (Renard's Cheese Store vs Rosewood Dairy). The printed
                # company name adjudicates when it clearly favours one candidate.
                scored = sorted(
                    ((build._ratio(build._normalize_name(record["company"]),
                                   build._normalize_name(companies[c].name)), c)
                     for c in all_hits),
                    reverse=True,
                )
                top_score, top = scored[0]
                runner_up = scored[1][0] if len(scored) > 1 else 0.0
                if top_score >= 0.70 and top_score - runner_up >= 0.10:
                    _row(source, key, top, "auto", evidence,
                         f"split signals ({sorted(all_hits)}); the printed company name "
                         f"matches {companies[top].name} ({top_score:.2f} vs {runner_up:.2f})")
                else:
                    _row(source, key, None, "review", evidence,
                         f"signals split across {sorted(all_hits)} — likely one business "
                         f"holding a plant licence and a store licence")
            elif web_target:
                _row(source, key, web_target, "auto", evidence,
                     "web-identified legal name resolves exactly; build-blocking otherwise")
            elif web_excluded:
                _row(source, key, None, "auto", evidence,
                     f"reviewed exclusion: no Wisconsin licensee behind "
                     f"'{record['company']}' — {record['name']} drops from people.json "
                     f"until one exists", excluded=True)
            else:
                _row(source, key, None, "review", evidence)

        elif source == "contests":
            continue  # handled once per company below

        elif source == "duplicate-company":
            left_id, right_id = key.split("|")
            left, right = companies.get(left_id), companies.get(right_id)
            if left is None or right is None:
                continue  # already merged away by an earlier promotion
            if not left.plants or not right.plants:
                continue  # the DFW-standalone flavour — settled by the dfw rows above
            keeper, loser = (left, right) if left.dfw_company_id else (right, left)
            shared_phone = {
                _phone10(datcp_by_plant[p.datcp_id]["phone"]) for p in keeper.plants
            } & {
                _phone10(datcp_by_plant[p.datcp_id]["phone"]) for p in loser.plants
            } - {None}
            evidence = [{
                "signal": "duplicate",
                "detail": f"near-identical names in one city; "
                          f"{'shared licence phone ' + sorted(shared_phone)[0] if shared_phone else 'no shared contact details'}",
            }]
            tier = "auto" if shared_phone else "review"
            for plant in loser.plants:
                _row("datcp", plant.datcp_id, keeper.id, tier, evidence,
                     f"re-homes {loser.name}'s licence into {keeper.name}")

    for (name, city), keys in sorted(fanout.items()):
        target, rule = _resolve_name(name, city)
        excluded = False
        evidence = []
        if target:
            evidence.append({"signal": "name-rule", "detail": rule})
            tier = "auto"
        else:
            target, excluded, web_evidence = _web_resolution(f"contest:{name}", city)
            evidence.extend(web_evidence)
            tier = "auto" if (target or excluded) else "review"
            if target:
                evidence.append({"signal": "note",
                                 "detail": "web-identified legal name resolves exactly; build-blocking otherwise"})
        for source_key in sorted(keys):
            _row("contests", source_key, target, tier,
                 evidence or [{"signal": "none", "detail": f"no rule or research resolves '{name}' ({city})"}],
                 f"entrant '{name}' ({city})"
                 + (" — reviewed exclusion: award keeps its verbatim entry, no creamery page" if excluded else ""),
                 excluded=excluded)

    # ── Classification review ────────────────────────────────────────────────
    suggestions = json.loads(
        (QUEUE / "proposed_classifications.json").read_text(encoding="utf-8")
    )
    masters_at = collections.Counter(
        company for person in ds["people"] for company in person.creamery_ids
    )
    awards_at = collections.Counter(
        award.creamery_id for award in ds["awards"] if award.creamery_id
    )

    classification_rows = []
    for suggestion in suggestions:
        company = companies.get(suggestion["id"])
        if company is None:
            continue  # merged away
        dfw_record = dfw_by_key.get(str(company.dfw_company_id)) if company.dfw_company_id else None
        roles = dfw_record["roles"] if dfw_record else []
        cheese_made = sorted({
            c for plant in company.plants
            for c in datcp_by_plant[plant.datcp_id]["cheese_manufactured"]
        })
        masters_here = masters_at.get(company.id, 0)
        awards_here = awards_at.get(company.id, 0)
        note = web.get(company.id)

        evidence = []
        flags = []
        if dfw_record:
            evidence.append({
                "signal": "dfw",
                "detail": f"wisconsincheese.com lists it under "
                          f"{' and '.join('Made By' if r == 'maker' else 'Sold By' for r in roles)} "
                          f"with {len(dfw_record['cheese_types'])} cheese types",
                "url": dfw_record["url"],
            })
        if cheese_made:
            evidence.append({"signal": "licence",
                             "detail": f"licensed to make {', '.join(cheese_made[:6])}"})
        else:
            evidence.append({"signal": "licence", "detail": "no cheese manufactured on any licence"})
        if masters_here:
            evidence.append({"signal": "people", "detail": f"{masters_here} master cheesemaker(s)"})
        if awards_here:
            evidence.append({"signal": "awards", "detail": f"{awards_here} championship award(s)"})
        if note:
            evidence.append({
                "signal": "web-research",
                "detail": note["finding"],
                "url": note.get("url"),
                "confidence": note.get("confidence"),
            })

        if dfw_record and "maker" in roles:
            decision, tier = "creamery", "auto"
        elif dfw_record:
            decision, tier = "commodity", "review"
            flags.append("seller-only DFW listing — commodity vs retail brand is a judgment call")
        elif not cheese_made and not masters_here and not awards_here:
            decision, tier = "processor", "auto"
        else:
            decision = "commodity"
            verdict = note.get("verdict") if note else None
            if verdict == "no_consumer_presence" and note.get("confidence") in ("high", "medium"):
                tier = "auto"
            elif verdict == "consumer_brand":
                tier = "review"
                flags.append("upgrade candidate: web shows a consumer brand — flipping to "
                             "creamery needs lat/lng in data/overrides/creameries.json")
            else:
                tier = "review"
                flags.append("no DFW listing and web research did not settle consumer presence")
            if masters_here or awards_here:
                tier = "review"
                flags.append("has master cheesemakers or championship awards — worth an editorial look")

        classification_rows.append({
            "id": company.id,
            "name": company.name,
            "city": company.city,
            "classification": decision,
            "tier": tier,
            "flags": flags,
            "evidence": evidence,
        })

    crosswalk_rows.sort(key=lambda r: (r["source"], r["source_key"]))
    classification_rows.sort(key=lambda r: r["id"])
    (QUEUE / "review_crosswalk.json").write_text(
        json.dumps(crosswalk_rows, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )
    (QUEUE / "review_classifications.json").write_text(
        json.dumps(classification_rows, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )

    xw = collections.Counter((r["source"], r["tier"]) for r in crosswalk_rows)
    cl = collections.Counter((r["classification"], r["tier"]) for r in classification_rows)
    print("evidence: crosswalk rows:", dict(xw))
    print("evidence: classifications:", dict(cl))
    blockers = [r for r in crosswalk_rows
                if r["source"] in ("masters", "contests")
                and r["creamery_id"] is None and not r["excluded"]]
    print(f"evidence: {len(blockers)} build-blocking source records still unresolved")
    for row in blockers:
        print(f"    {row['source']}:{row['source_key']}  {row.get('note') or ''}")


if __name__ == "__main__":
    main()
