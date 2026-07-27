"""Description generator — fills cheese descriptions and creamery summaries.

A curation tool, run deliberately like the scrapers. NEVER part of build.py:
the build stays offline and deterministic.

Behavior
    - Selects cheeses with description == null (and creameries with
      editorial.summary == null), plus any records changed since their last
      generation.
    - Builds each description from the record's OWN structured fields only:
      family, milk, texture, age band, flavor tags, add-ins, matched awards,
      creamery context. Never from scraped DFW prose (description_raw) — the
      copyright posture stays clean and any description can be regenerated
      whenever its record changes.
    - Calls the Anthropic API with a fixed WPR-voice prompt (short, factual,
      warm; no marketing superlatives).
    - Writes results into the data files with description_generated = true.
      A human edit flips the flag to false, and describe.py never touches
      edited text.

The queue report (queue/report.json) tracks the missing/generated/edited
split so editing stays an opportunistic spot-check, never a launch gate.
"""
from __future__ import annotations


def main() -> None:
    raise NotImplementedError("describe.py not yet implemented — see module docstring")


if __name__ == "__main__":
    main()
