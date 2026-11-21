"""Description generator — fills cheese descriptions and creamery summaries.

A curation tool, run deliberately like the scrapers. NEVER part of build.py:
the build stays offline and deterministic, and only *places* the text this
script wrote into data/descriptions/{cheeses,creameries}.json.

Behavior
    - Reads the built tables (build/*.json), so run `python build.py` first.
    - Selects every cheese and exported creamery whose description is missing
      or whose record changed since its text was written (a fingerprint of
      the facts the text was built from is stored beside it). A human edit —
      an override with description_generated false — is never touched.
    - Builds each request from the record's OWN structured fields only:
      family, milk, texture, age band, flavor tags, add-ins, matched awards,
      creamery context. Never from scraped prose.
    - Sends one Message Batch to the Anthropic API (half price, asynchronous)
      with a fixed WPR-voice prompt, polls it, and writes the results.
    - A reply that is refused, errored, cut off or out of shape is skipped and
      listed; nothing partial is written for it. Run again to retry those.

Usage
    python scripts/describe.py --dry-run        counts, a cost estimate, three sample requests; no API call
    python scripts/describe.py --limit 20       a first small batch to read before the full run
    python scripts/describe.py                  everything outstanding
    python scripts/describe.py --resume ID      collect a batch already submitted
    python scripts/describe.py --prune          drop text whose record no longer exists

Credentials come from the environment (ANTHROPIC_API_KEY); the script never
reads or stores a key. After a run: `python build.py`, then commit data/ and build/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "build"
OUT = ROOT / "data" / "descriptions"
MODEL = "claude-opus-5-5"
MAX_CHARS = 320

CONTESTS = {"uscc": "U.S. Championship Cheese Contest", "wccc": "World Championship Cheese Contest"}
PLACES = {1: "first", 2: "second", 3: "third"}

SYSTEM = """You write one short description for an entry in The Cheese Census, \
a census of Wisconsin cheese published by Wausau Pilot & Review, a local newspaper.

The reader is browsing a catalog and wants to know what this is and whether \
they would like it. Write the way the paper does: plain, dry, specific, warm \
without selling. One or two sentences, at most 45 words.

Use only the facts in the record you are given. Do not add history, founding \
dates, people, places, pairings, production methods or tasting claims that are \
not in the record, and do not guess. If the record lists contest awards you may \
mention the best one, with its year. Leave out anything the record does not \
support rather than hedging about it.

No superlatives and no marketing words (finest, artisan, world-class, \
delicious, perfect, must-try). No exclamation marks. Do not address the reader \
as "you". Do not start with the cheese's or creamery's name followed by "is". \
Do not mention the census, the record, or that the text was generated.

Reply with the description alone: plain text on one line, no quotation marks, \
no label."""


def fatal(message: str) -> None:
    print(f"FATAL: {message}", file=sys.stderr)
    sys.exit(1)


def read(path: Path):
    if not path.exists():
        fatal(f"{path.relative_to(ROOT)} is missing — run python build.py first")
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, table: dict) -> None:
    path.write_text(
        json.dumps(dict(sorted(table.items())), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8", newline="\n",
    )


def fingerprint(facts: dict) -> str:
    return hashlib.sha256(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def award_line(award: dict) -> str:
    line = f"{PLACES[award['placement']]} place, {CONTESTS[award['contest']]} {award['year']}, class \"{award['class_name']}\""
    return line + (" (champion)" if award.get("champion") else "")


def cheese_facts(cheese: dict, creamery: dict | None, awards: list[dict]) -> dict:
    return {
        "kind": "cheese",
        "name": cheese["name"],
        "maker": creamery["name"] if creamery else None,
        "made_in": f"{creamery['city']}, Wisconsin" if creamery and creamery.get("city") else None,
        "family": cheese["family"],
        "texture": cheese["texture"],
        "age_band": cheese["age_band"],
        "milk": cheese["milk"],
        "raw_milk": cheese["raw_milk"],
        "rind": cheese["rind"],
        "flavor": cheese["flavor"],
        "add_ins": cheese["add_ins"],
        "wisconsin_original": cheese["wisconsin_original"],
        "awards": [award_line(a) for a in sorted(awards, key=lambda a: (a["placement"], -a["year"], a["id"]))[:3]],
    }


def creamery_facts(creamery: dict, cheeses: list[dict], awards: list[dict]) -> dict:
    families: dict[str, int] = {}
    for cheese in cheeses:
        families[cheese["family"]] = families.get(cheese["family"], 0) + 1
    return {
        "kind": "creamery",
        "name": creamery["name"],
        "city": creamery["city"],
        "county": creamery["county"],
        "retail_store_listed": creamery["retail"]["store"],
        "licensed_plants": len(creamery["plants"]),
        "cheeses_in_catalog": len(cheeses),
        "families_made": [f for f, _ in sorted(families.items(), key=lambda kv: (-kv[1], kv[0]))[:5]],
        "named_cheeses": sorted(c["name"] for c in cheeses)[:8],
        "contest_awards": len(awards),
        "first_places": sum(1 for a in awards if a["placement"] == 1),
        "best_awards": [award_line(a) for a in sorted(awards, key=lambda a: (a["placement"], -a["year"], a["id"]))[:2]],
    }


def outstanding() -> tuple[dict[str, dict], dict[str, dict], dict[str, dict]]:
    """Every record that needs text: {custom_id: facts}, plus the two tables."""
    cheeses = read(BUILD / "cheeses.json")
    creameries = read(BUILD / "creameries.json")
    awards = read(BUILD / "awards.json")
    done_cheeses = read(OUT / "cheeses.json")
    done_creameries = read(OUT / "creameries.json")
    by_id = {c["id"]: c for c in creameries}
    todo: dict[str, dict] = {}
    for cheese in cheeses:
        if cheese["description"] and not cheese["description_generated"]:
            continue  # a human wrote it
        facts = cheese_facts(cheese, by_id.get(cheese["creamery_id"]), [a for a in awards if a["cheese_id"] == cheese["id"]])
        if done_cheeses.get(cheese["id"], {}).get("fingerprint") != fingerprint(facts):
            todo[cheese["id"]] = facts
    for creamery in creameries:
        if creamery["status"] != "active":
            continue
        facts = creamery_facts(
            creamery,
            [c for c in cheeses if c["creamery_id"] == creamery["id"]],
            [a for a in awards if a["creamery_id"] == creamery["id"]],
        )
        if done_creameries.get(creamery["id"], {}).get("fingerprint") != fingerprint(facts):
            todo[creamery["id"]] = facts
    return todo, done_cheeses, done_creameries


def user_message(facts: dict) -> str:
    shown = {k: v for k, v in facts.items() if v not in (None, [], "")}
    return "The record:\n" + json.dumps(shown, indent=2, ensure_ascii=False)


def clean(text: str) -> str | None:
    """A reply in shape, or None: one line, no wrapping quotes, within length."""
    text = " ".join(text.split()).strip().strip('"“”').strip()
    if not text or len(text) > MAX_CHARS or "!" in text:
        return None
    return text


def collect(client, batch_id: str, todo: dict[str, dict], done_cheeses: dict, done_creameries: dict) -> None:
    # custom_id must be short and plain, so requests are keyed by position.
    keys = sorted(todo)
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            break
        counts = batch.request_counts
        print(f"  {batch.processing_status}: {counts.processing} processing, {counts.succeeded} done")
        time.sleep(30)
    written, skipped = 0, []
    for result in client.messages.batches.results(batch_id):
        record_id = keys[int(result.custom_id.removeprefix("r"))]
        facts = todo[record_id]
        text = None
        if result.result.type == "succeeded" and result.result.message.stop_reason == "end_turn":
            text = clean(next((b.text for b in result.result.message.content if b.type == "text"), ""))
        if text is None:
            reason = result.result.type if result.result.type != "succeeded" else result.result.message.stop_reason
            skipped.append(f"{record_id} ({reason})")
            continue
        table = done_cheeses if facts["kind"] == "cheese" else done_creameries
        table[record_id] = {"text": text, "fingerprint": fingerprint(facts), "model": MODEL}
        written += 1
    write(OUT / "cheeses.json", done_cheeses)
    write(OUT / "creameries.json", done_creameries)
    print(f"Wrote {written} descriptions; skipped {len(skipped)}.")
    for line in skipped:
        print(f"  skipped: {line}")
    print("Next: python build.py, read a sample, then commit data/ and build/.")


def prune() -> None:
    cheese_ids = {c["id"] for c in read(BUILD / "cheeses.json")}
    creamery_ids = {c["id"] for c in read(BUILD / "creameries.json")}
    for name, live in (("cheeses", cheese_ids), ("creameries", creamery_ids)):
        table = read(OUT / f"{name}.json")
        kept = {k: v for k, v in table.items() if k in live}
        write(OUT / f"{name}.json", kept)
        print(f"{name}: kept {len(kept)}, dropped {len(table) - len(kept)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resume", metavar="BATCH_ID")
    parser.add_argument("--prune", action="store_true")
    args = parser.parse_args()

    if args.prune:
        prune()
        return
    todo, done_cheeses, done_creameries = outstanding()
    if args.limit:
        # A first look should show both kinds and a spread of makers.
        keys = sorted(todo, key=lambda k: hashlib.sha256(k.encode()).hexdigest())[: args.limit]
        todo = {k: todo[k] for k in keys}
    kinds = [f["kind"] for f in todo.values()]
    print(f"Outstanding: {kinds.count('cheese')} cheeses, {kinds.count('creamery')} creameries.")
    if not todo:
        return

    if args.dry_run:
        chars = len(SYSTEM) * len(todo) + sum(len(user_message(f)) for f in todo.values())
        tokens_in = chars / 3.5
        tokens_out = len(todo) * 250  # the text plus the model's brief reasoning
        cost = (tokens_in * 4 + tokens_out * 20) / 1e6 / 2  # batch pricing is half
        print(f"Estimate: about {tokens_in / 1e6:.2f}M input and {tokens_out / 1e6:.2f}M output tokens on {MODEL},")
        print(f"roughly ${cost:.2f} at batch prices. A rough figure, not a quote.")
        for key in sorted(todo, key=lambda k: hashlib.sha256(k.encode()).hexdigest())[:3]:
            print(f"\n--- {key} ---\n{user_message(todo[key])}")
        return

    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request

    client = anthropic.Anthropic()
    if args.resume:
        batch_id = args.resume
    else:
        keys = sorted(todo)
        try:
            batch = client.messages.batches.create(
                requests=[
                    Request(
                        custom_id=f"r{i}",
                        params=MessageCreateParamsNonStreaming(
                            model=MODEL,
                            max_tokens=2000,
                            system=SYSTEM,
                            output_config={"effort": "low"},
                            messages=[{"role": "user", "content": user_message(todo[key])}],
                        ),
                    )
                    for i, key in enumerate(keys)
                ]
            )
        except anthropic.AuthenticationError:
            fatal("the API rejected the credentials — set ANTHROPIC_API_KEY and run again")
        except anthropic.APIConnectionError as error:
            fatal(f"could not reach the API: {error}")
        batch_id = batch.id
        print(f"Submitted batch {batch_id} ({len(keys)} requests). If this stops, rerun with --resume {batch_id}")
    collect(client, batch_id, todo, done_cheeses, done_creameries)


if __name__ == "__main__":
    main()
