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
  _fetch.py                shared polite fetcher: 1s/host throttle, named fatals, dev cache
  datcp.py                 MyDATCP dairy plant licence CSV (the spine, 388 plants)
  dfw.py                   wisconsincheese.com (consumer layer, server-rendered HTML)
  masters.py               Master Cheesemaker directory PDF (annual)
  contests.py              WCMA championship results via the MyEntries JSON API
scripts/describe.py        description generation (Anthropic API) — curation tool, never in build
data/raw/                  committed scraper output (diffable history)
  dfw_varieties.json       DFW's 55 cheese varieties + their hardness/intensity/flavor
                           groupings — a reference table for the tagging pass, not a
                           source table; build.py does not read it
data/overrides/            hand-edited: creameries/cheeses patches, manual crosswalk, classifications
data/vocab/tags.json       all controlled vocabularies
data/highlights.json       editorial + sponsored highlight entries (hand-edited)
queue/report.json          generated review reports (non-fatal work: coverage, unmatched awards)
queue/proposed_*.json      merge()'s review proposals — classifications and fuzzy
                           crosswalk candidates; written every run, before the build's
                           own gates, so they exist even when the build stops
web/                       React/Vite front end (see web/README.md); renders build/*.json,
                           holds no data and computes nothing the pipeline should have
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

While developing a scraper, `$env:CHEESE_CENSUS_CACHE = "1"` replays responses from
the gitignored `.cache/` instead of re-fetching. Responses are always written to the
cache and only read back when that variable is set, so CI always hits the live source.

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

## Status (August 22, 2026) and next steps, in order

**The build is green**: 93 creameries, 61 people, 299 awards, deterministic and
idempotent end to end. The review gate was cleared by an evidence pass, not by
waving records through — see "How the review gate was cleared" below.

### How the review gate was cleared

`scripts/evidence.py` (curation tool, never in build) corroborates every proposal
with signals already in the raw data — shared licence phone numbers, shared plant
addresses, website domains, and a deterministic name-rule chain (legal-name-first
exact/prefix/contains/acronym matching with city disambiguation) — plus supervised
web research committed as `queue/web_research.json` (115 companies checked by
research agents, findings verified against the licence file). It writes tiered
review files to `queue/review_*.json`; `scripts/promote.py` promotes the auto tier
into `data/overrides/` (human-entered values always win). Both scripts are
re-runnable and idempotent.

New mechanism: a crosswalk override with `creamery_id: null` is a **reviewed
exclusion** — the record deliberately resolves to no canonical company (a maple
syrup outfit entering a contest, a master's unlicensed retail brand, Tillamook
entering from a partner plant). Four exist, each with evidence in the review file.
`merge()` also honors manual dfw/datcp crosswalk entries *structurally*: a DFW
listing merges into its licensed company (Marieke Gouda ↔ Holland's Family Cheese)
and a re-homed plant moves between companies.

### The editorial worklist (not build-blocking; the provisional banner stays up)

- **73 flagged classifications** in `queue/review_classifications.json` — above
  all ~60 upgrade candidates: commodity-classified companies where web research
  found a consumer brand (Eau Galle, Maple Grove, Old Country, Weyauwega curds…).
  Flipping one to `creamery` needs lat/lng in `data/overrides/creameries.json`.
- **8 crosswalk rows** with a proposed target awaiting eyes in
  `queue/review_crosswalk.json` (the Sargento standalone → TTLF Inc. among them;
  the licence file shows TTLF dba "Sargento Cheese Inc.", so it's near-certain).
- Cosmetic overrides worth making: the CROPP co-op displays as "Organic Valley
  Chaseburg" (first plant's dba); Edelweiss Creamery liquidated Feb 2026 and
  Prairie Farms closed both Shullsburg plants (status: closed candidates).
- Known wrinkle: creamery ids are assigned before manual merges apply, so
  promoting a merge for a company whose slug collided can shift another id.
  None shifted this round; check `git diff build/` after future promotions.

Current harvest — 388 DATCP plants → 323 companies; 114 DFW companies (1,346
company↔cheese-type links) + 55 varieties; 63 master cheesemakers with 172
certifications across a 40-term vocabulary; 299 Wisconsin contest awards.
Auto-crosswalk: datcp 388/388, dfw 114/114, masters 53/63, contests 238/299.

Three source realities differ from the original plan and are documented in the
relevant module docstrings:

- **DATCP retired the annual PDF.** The directory is now a live MyDATCP report
  published as PDF/XLSX/CSV with no edition year; we read the CSV. It is richer than
  the old PDF — operations split into general/specific/cheese-manufactured columns.
- **DFW publishes no named products.** Company pages list cheese *types* shared
  site-wide ("Gouda"), never "Marieke Gouda Smoked". The authoritative company↔type
  mapping is the `?cheese={id}` filter, not the company-page carousel, which is a
  curated subset. So SCHEMA's one-record-per-named-product catalog has no upstream
  source, and `merge()` emits zero cheeses rather than invent any — the catalog is
  built by the tagging pass below.
- **Contest results moved to an API.** Both contest sites now hand off to the
  MyEntries JSON API, which is what `contests.py` reads. The top-20 championship
  round is not in that API and is scraped from each contest's hand-written page,
  whose URL is listed per edition in `EDITIONS` and must be added each cycle.

Two scaffold corrections were needed to run: `Creamery.lat/lng` and `Creamery.county`
became optional on the model (a creamery exists long before it is geocoded, and DFW
lists out-of-state companies that hold no Wisconsin county), and the previously
unimplemented **validation #5** now enforces lat/lng on *exported* creameries in
`build.validate()` — exactly where SCHEMA.md scopes it.

Next steps, in order:

1. **Editorial pass over the worklist above** — skim, not research: every row
   carries its evidence and URL. Flips and corrections go in `data/overrides/`
   (re-run `python scripts/promote.py` after editing review files, or edit the
   override files directly — human values always win). When satisfied, build the
   front end with `VITE_DATA_STATUS=reviewed` to drop the provisional banner.
   - Note: `retail.mail_order` and `retail.online` are false for every creamery.
     DFW offers both as filters but publishes neither value, so they are not
     scraped; correct them in `data/overrides/creameries.json` where they matter.
2. Flavor tagging pass → the cheese catalog. Seed candidate products from DFW
   `cheese_types`, DATCP `cheese_manufactured`, and contest cheese names; tag with
   `data/raw/dfw_varieties.json` as a starting signal, human approves in batches.
   `flavor` needs 2–6 tags per record, so this is what unblocks `build/cheeses.json`
   and lights up the similarity engine — and with it the whole reader layer of the
   front end (browse, hearts, similar-cheese, highlights), which is stubbed out.
3. `scripts/describe.py` — generation with the WPR voice prompt
4. Front end, continued: GitHub Pages deploy workflow (build/ is real now), then
   the reader layer once step 2 lands.
