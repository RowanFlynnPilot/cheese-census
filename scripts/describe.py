"""Description generator — fills cheese descriptions and creamery summaries.

A curation tool, run deliberately like the scrapers. NEVER part of build.py:
the build stays offline and deterministic, and only *places* the text this
script wrote into data/descriptions/{cheeses,creameries}.json.

Behavior
    - Reads the built tables (build/*.json), so run `python build.py` first.
    - Selects every named cheese and exported creamery whose description is missing
      or whose record changed since its text was written (a fingerprint of
      the facts the text was built from is stored beside it). A human edit —
      an override with description_generated false — is never touched.
    - Skips plain type variants (a cheese named exactly for its DFW type:
      "Colby", "Aged Provolone"). Their facts are the same at every maker,
      so the text would be one sentence repeated; the labels already say it.
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
    python scripts/describe.py --compare --limit 20
                                                the same records on both models, side by side in
                                                queue/describe_compare.md; writes no descriptions
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
COMPARE_WITH = "claude-haiku-5-5"
PRICE_IN, PRICE_OUT = 4.00, 20.00  # dollars per million tokens, before the batch discount
MAX_CHARS = 320

CONTESTS = {"uscc": "U.S. Championship Cheese Contest", "wccc": "World Championship Cheese Contest"}
PLACES = {1: "first", 2: "second", 3: "third"}

# The closed vocabularies in plain words: the text must not read tags back.
FAMILY = {
    "cheddar": "cheddar", "colby_jack": "Colby or Jack", "alpine": "Alpine style, like Swiss or Gruyère",
    "gouda_edam": "Gouda or Edam", "blue": "blue cheese", "bloomy": "bloomy rind, like Brie or Camembert",
    "washed_rind": "washed rind, like Limburger or brick", "fresh": "fresh cheese",
    "pasta_filata": "stretched curd, like mozzarella or provolone", "italian_hard": "hard Italian style",
    "hispanic": "Hispanic style", "brined": "brined, like feta", "semi_soft_table": "semi-soft table cheese",
    "curds": "cheese curds", "spreads_processed": "cheese spread or processed cheese", "other": None,
}
TEXTURE = {"fresh": "fresh and moist", "soft": "soft", "semi_soft": "semi-soft", "semi_hard": "firm", "hard": "hard"}
AGE = {"fresh": "sold fresh", "young": "young", "medium": "aged a few months", "aged": "aged", "extra_aged": "long aged"}
RIND = {"none": None, "natural": "natural rind", "bloomy": "bloomy white rind", "washed": "washed rind", "wax": "wax coating"}

SYSTEM = """You write one short description for an entry in The Cheese Census, \
a census of Wisconsin cheese published by Wausau Pilot & Review, a local newspaper.

The reader is browsing a catalog. Beside your text they already see the \
cheese's name, its maker, and small labels for its type, texture, milk and \
flavors. Do not read those labels back as a list. Say what the cheese is like \
to eat and what sets it apart from its neighbors, the way the paper would in \
a sentence of a food story: plain, dry, specific, warm without selling. One or \
two sentences, at most 40 words.

Texture and mouthfeel come from the record's own words only. Do not add \
how it cuts, spreads, crumbles, melts or crunches, and do not swap a word \
for a stronger one ("semi-soft" is not "soft").

Use only the facts in the record. Do not add history, founding dates, people, \
pairings, serving ideas, production methods or tasting claims that are not in \
it, and do not guess. Never attribute the flavor to anyone ("tasters say", \
"described as", "flavors listed"): state it. Leave out what the record does \
not support rather than hedging.

Write names exactly as the record gives them. The record omits what is \
unremarkable (cow's milk, no rind), so do not mention milk or rind unless the \
record does. Do not use trade terms such as "pasta filata", "cheese family" \
or "age band".

Awards: each one names the entry that won it. Mention an award only if that \
entry is this same product, not a flavored or packaged relative, and then \
give the place, the contest and the year. Otherwise say nothing about awards.

No superlatives and no marketing words (finest, artisan, world-class, \
delicious, perfect, must-try). No exclamation marks. Do not address the reader \
as "you". Vary how sentences open; do not start with the name followed by \
"is". The town is beside the text already: name it only now and then, never \
as a habit ("this Gouda from Thorp"). Do not mention the census, the record, or that the text was generated.

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
    if award.get("champion"):
        line += " (champion)"
    return line + f" — won by the entry \"{award['entry']['cheese_name']}\""


def cheese_facts(cheese: dict, creamery: dict | None, awards: list[dict]) -> dict:
    return {
        "kind": "cheese",
        "name": cheese["name"],
        "maker": creamery["name"] if creamery else None,
        "made_in": f"{creamery['city']}, Wisconsin" if creamery and creamery.get("city") else None,
        "type": FAMILY[cheese["family"]],
        "texture": TEXTURE[cheese["texture"]],
        "age": AGE[cheese["age_band"]],
        "milk": None if cheese["milk"] == ["cow"] else cheese["milk"],
        "raw_milk": True if cheese["raw_milk"] else None,
        "rind": RIND[cheese["rind"]],
        "flavor": cheese["flavor"],
        "added": cheese["add_ins"],
        "a_Wisconsin_original": True if cheese["wisconsin_original"] else None,
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
        "types_made": [FAMILY[f] for f, _ in sorted(families.items(), key=lambda kv: (-kv[1], kv[0]))[:5] if FAMILY[f]],
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
    type_names = {
        link["name"].casefold()
        for company in read(ROOT / "data" / "raw" / "dfw.json")
        for link in company["cheese_types"]
    }
    todo: dict[str, dict] = {}
    for cheese in cheeses:
        if cheese["description"] and not cheese["description_generated"]:
            continue  # a human wrote it
        if by_id.get(cheese["creamery_id"], {}).get("status") != "active":
            continue  # a closed creamery's cheese is out of browse; no present-tense text for it
        if cheese["name"].casefold() in type_names:
            continue  # a plain type variant: the same facts at every maker
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


def submit(client, todo: dict[str, dict], model: str) -> str:
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request

    # custom_id must be short and plain, so requests are keyed by position.
    try:
        batch = client.messages.batches.create(
            requests=[
                Request(
                    custom_id=f"r{i}",
                    params=MessageCreateParamsNonStreaming(
                        model=model,
                        max_tokens=2000,
                        system=SYSTEM,
                        output_config={"effort": "low"},
                        messages=[{"role": "user", "content": user_message(todo[key])}],
                    ),
                )
                for i, key in enumerate(sorted(todo))
            ]
        )
    except anthropic.AuthenticationError:
        fatal("the API rejected the credentials — set ANTHROPIC_API_KEY and run again")
    except anthropic.APIConnectionError as error:
        fatal(f"could not reach the API: {error}")
    return batch.id


def fetch(client, batch_id: str, todo: dict[str, dict]) -> tuple[dict[str, str], list[str]]:
    """Wait for a batch; return {record id: text} and the skipped, with reasons."""
    keys = sorted(todo)
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            break
        counts = batch.request_counts
        print(f"  ...{batch_id[-6:]} {batch.processing_status}: {counts.processing} processing, {counts.succeeded} done")
        time.sleep(30)
    texts, skipped = {}, []
    for result in client.messages.batches.results(batch_id):
        record_id = keys[int(result.custom_id.removeprefix("r"))]
        text = None
        if result.result.type == "succeeded" and result.result.message.stop_reason == "end_turn":
            text = clean(next((b.text for b in result.result.message.content if b.type == "text"), ""))
        if text is None:
            reason = result.result.type if result.result.type != "succeeded" else result.result.message.stop_reason
            skipped.append(f"{record_id} ({reason})")
        else:
            texts[record_id] = text
    return texts, skipped


def collect(client, batch_id: str, todo: dict[str, dict], done_cheeses: dict, done_creameries: dict) -> None:
    texts, skipped = fetch(client, batch_id, todo)
    for record_id, text in texts.items():
        facts = todo[record_id]
        table = done_cheeses if facts["kind"] == "cheese" else done_creameries
        table[record_id] = {"text": text, "fingerprint": fingerprint(facts), "model": MODEL}
    write(OUT / "cheeses.json", done_cheeses)
    write(OUT / "creameries.json", done_creameries)
    print(f"Wrote {len(texts)} descriptions; skipped {len(skipped)}.")
    for line in skipped:
        print(f"  skipped: {line}")
    print("Next: python build.py, read a sample, then commit data/ and build/.")


def compare(client, todo: dict[str, dict]) -> None:
    """The same records on both models, side by side. Writes no descriptions."""
    ids = {model: submit(client, todo, model) for model in (MODEL, COMPARE_WITH)}
    print("Submitted " + " and ".join(f"{model} ({batch})" for model, batch in ids.items()))
    replies = {model: fetch(client, batch, todo)[0] for model, batch in ids.items()}
    lines = ["# Description voice: side by side", ""]
    for key in sorted(todo):
        lines += [f"## {todo[key]['name']} ({todo[key].get('maker') or todo[key]['kind']})", ""]
        for model in ids:
            text = replies[model].get(key, "(skipped)")
            lines += [f"- **{model}** [{len(text.split())} words]: {text}"]
        lines += [""]
    path = ROOT / "queue" / "describe_compare.md"
    path.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"Wrote {path.relative_to(ROOT)} — nothing was added to data/descriptions.")


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
    parser.add_argument("--compare", action="store_true")
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
        cost = (tokens_in * PRICE_IN + tokens_out * PRICE_OUT) / 1e6 / 2  # batch pricing is half
        print(f"Estimate: about {tokens_in / 1e6:.2f}M input and {tokens_out / 1e6:.2f}M output tokens on {MODEL},")
        print(f"roughly ${cost:.2f} at batch prices. A rough figure, not a quote.")
        for key in sorted(todo, key=lambda k: hashlib.sha256(k.encode()).hexdigest())[:3]:
            print(f"\n--- {key} ---\n{user_message(todo[key])}")
        return

    import anthropic

    client = anthropic.Anthropic()
    if args.compare:
        compare(client, todo)
        return
    if args.resume:
        batch_id = args.resume
    else:
        batch_id = submit(client, todo, MODEL)
        print(f"Submitted batch {batch_id} ({len(todo)} requests). If this stops, rerun with --resume {batch_id}")
    collect(client, batch_id, todo, done_cheeses, done_creameries)


if __name__ == "__main__":
    main()
