# CLAUDE.md — The Cheese Census

**The Cheese Census** — a census of Wisconsin cheese, from the Wausau Pilot & Review.
Statewide cheese database and reader tool: a sponsor + engagement franchise with an
evergreen cheese/creamery database at the core, and hearts, similar-cheese matching,
editorial + sponsored highlights, and later tentpoles (statewide cheese bracket,
match quiz, curd map, trail planner) on top.

`SCHEMA.md` is the canonical data model. Read it before touching anything in
`data/` or the pipeline. This file covers working conventions and current status.

## Ground rules

- **One correct path.** No fallbacks, no alternative code paths, no "try X then Y".
- **Fail fast and loud.** Preconditions violated → named fatal error. No warnings
  that scroll by, no partial output, ever. A build that exits 0 is complete and correct.
- **Surgical changes.** Minimal focused diffs; fix root causes, not symptoms.
- **Overrides are the only manual-edit mechanism.** Never hand-edit `data/raw/`
  (scraper-owned) or `build/` (build-owned). Corrections go in `data/overrides/`
  and always win over scraped data.
- **Deterministic builds.** Same inputs → byte-identical `build/*.json`. Nothing
  nondeterministic (API calls, timestamps, unsorted dicts) belongs in `build.py`.
- **Closed vocabularies.** Every tag lives in `data/vocab/tags.json`. Adding a
  term is a deliberate commit; an unknown value anywhere kills the build.

## Layout

```
SCHEMA.md                  canonical data model + pipeline rules (read it)
models.py                  pydantic models enforcing SCHEMA.md
similarity.py              build-time similar-cheese scoring (pure, deterministic)
build.py                   orchestrator: raw → merge → overrides → validate → similarity → export
scrapers/                  one module per source; each emits data/raw/<name>.json
  datcp.py                 DATCP dairy plant directory PDF (the spine, ~400 plants)
  dfw.py                   wisconsincheese.com (consumer layer, server-rendered HTML)
  masters.py               Master Cheesemaker directory PDF (annual)
  contests.py              WCMA championship results (event-driven, 2x/year max)
scripts/describe.py        description generation (Anthropic API) — curation tool, never in build
data/raw/                  committed scraper output (diffable history)
data/overrides/            hand-edited: creameries/cheeses patches, manual crosswalk, classifications
data/vocab/tags.json       all controlled vocabularies
data/highlights.json       editorial + sponsored highlight entries (hand-edited)
queue/report.json          generated review reports (non-fatal work: coverage, unmatched awards)
build/                     final static JSON the frontend consumes (committed)
```

## Scraper contract

Every raw record carries a `source_key` (DATCP plant number, DFW company id,
person slug, award id) — `build.py` fails on records without one, and every
source record must resolve to a crosswalk entry or an `excluded` classification
before the build passes. Scrapers emit sources verbatim: no interpretation, no
filtering (except the Wisconsin filter in contests.py, which is a published fact
of each row). Editorial judgment lives in the classification pass and overrides.

## Commands (dev is Windows / PowerShell 5.1 — chain with `;`)

```powershell
python -m pip install -r requirements.txt
python scrapers/datcp.py; python scrapers/dfw.py; python scrapers/masters.py; python scrapers/contests.py
python build.py
python scripts/describe.py
```

CI (`.github/workflows/build.yml`) runs the same sequence on Linux;
manual dispatch only until all scrapers are implemented.

## Build-fatal validations (complete list — keep in sync with SCHEMA.md)

1. Any value not in `data/vocab/tags.json`
2. Duplicate `id` within any table
3. Dangling FK (`creamery_id`, `cheese_id`, crosswalk target)
4. Cheese `flavor` outside 2–6 tags
5. Missing `lat`/`lng` on an exported creamery
6. Unresolved source record (no crosswalk entry, no `excluded` classification)
7. Creamery without a classification; cheese belonging to a non-exported creamery
8. `sponsored` highlight without a `sponsor`, or vice versa

## Conventions

- Creamery ids: slug (`hooks-cheese`). Cheese ids: `{creamery-id}--{cheese-slug}`
  (double hyphen). Ids are stable forever — Supabase hearts key on them.
- One record per distinct named product; no variant modeling. One plain
  `family: curds` record per curd-making creamery (that set is the curd map);
  flavored curds are separate records.
- Classification rule: `creamery` only if the company sells named consumer
  cheeses under its own brand; commodity/private-label is `commodity`.
- Descriptions are generated-first (`scripts/describe.py`) from structured
  fields only — never scraped DFW prose. `description_generated` flips false on
  human edit; missing descriptions are never build-fatal.
- Hearts and bracket votes live in Supabase keyed on cheese id; static JSON
  carries zero engagement state.
- Frontend (later): React/Vite → GitHub Pages → WordPress iframe embed.
  WPR design system: teal `#3A867C`, cream `#F6F2E9`, Fraunces display,
  Public Sans body, JetBrains Mono for data. Editorial and sponsored
  highlights must render visibly differently.
- Name & branding: the product is **The Cheese Census**. "Wisconsin" lives in
  the standing subtitle ("A census of Wisconsin cheese, from the Wausau
  Pilot & Review") and in page titles/metadata — never in the mark itself.
  Always render with WPR attribution; visual identity stays WPR (nothing
  gesturing at DFW's badge or trade dress); attorney review before the name
  appears on sponsor contracts.

## Status (July 27, 2026) and next steps, in order

Scaffold complete: schema, models, similarity engine, build orchestration,
validation, queue reporting, and deterministic export are implemented; the four
scrapers and `merge()` are not.

1. `scrapers/datcp.py` — locate + pin the current directory PDF, parse it
2. `scrapers/dfw.py` — makers directory + company pages + find-cheese
3. `merge()` in `build.py` — entity resolution (normalized name + address),
   auto crosswalk emission; first classification pass over the ~400 plants
4. `scrapers/masters.py` — parse the annual PDF, seed `mc_certifications` vocab
5. `scrapers/contests.py` — 2026 WCCC + 2025 USCC to start
6. `scripts/describe.py` — generation with the WPR voice prompt
7. Flavor tagging pass (assisted: script proposes tags from `description_raw`,
   human approves in batches) — then the similarity engine lights up
8. Frontend
