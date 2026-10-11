# CLAUDE.md — The Cheese Census

**The Cheese Census** — a census of Wisconsin cheese, from Wausau Pilot & Review.
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
scripts/images.py          product-image URL harvester (shops behind the title harvest);
                           writes queue/product_images.json — a PERMISSION queue, never
                           pipeline input; web dev overlays it as a marked draft
scripts/logos.py           creamery brand-mark harvester (apple-touch-icon/favicon/header
                           logo from each creamery's own site) → queue/creamery_logos.json;
                           same dev-only draft overlay, never pipeline input
scripts/evidence.py        review-evidence assembler: corroborates proposals with local
                           signals + committed web research; writes queue/review_*.json
scripts/promote.py         promotes the auto tier into data/overrides/ (humans always win)
scripts/catalog.py         assembles data/catalog/cheeses.json from the tagging table
scripts/geocode.py         plant geocoder (Census Bureau batch geocoder, public, no key):
                           writes data/geocode/plants.json once; incremental, lists the
                           plants it could not place — a curation tool, never in build
data/geocode/plants.json   every DATCP plant's point (committed): build.py picks each
                           creamery's home plant as the one nearest its listing's point
                           and snaps the pin to it, so the panel describes the pinned place
scripts/counties.py        Wisconsin's 72 county outlines (Census cartographic boundaries,
                           public domain) → web/src/counties.json for the map's county layer
web/public/map/wisconsin.pmtiles
                           the map's basemap: a Protomaps extract of Wisconsin (OpenStreetMap
                           data, zoom 0–11, 38 MB), served from the site by HTTP range requests
                           and drawn by protomaps-leaflet in the WPR palette; refreshed only
                           with the pmtiles CLI (command in web/README.md), never edited
web/tests/                 Playwright smoke test of the production build (npm run test:e2e);
                           the deploy workflow's third gate
data/raw/                  committed scraper output (diffable history)
  dfw_varieties.json       DFW's 55 cheese varieties + their hardness/intensity/flavor
                           groupings — a reference table for the tagging pass, not a
                           source table; build.py does not read it
data/overrides/            hand-edited: creameries/cheeses patches, manual crosswalk, classifications
data/tagging/types.json    the flavor tagging pass's editorial table: one row per DFW
                           cheese-type id, mapped into the closed vocabularies
data/catalog/cheeses.json  the tagging pass's product (scripts/catalog.py): one record
                           per exported creamery x tagged type; canonical build input
data/vocab/tags.json       all controlled vocabularies
data/highlights.json       editorial + sponsored highlight entries (hand-edited)
data/sponsors.json         feature-level sponsorship slots (hand-edited): a highlight
                           plugs a cheese, a sponsor entry buys a surface (placement
                           "board" = the Board Builder's "Made possible by" slot);
                           date-windowed, validated, exported to build/sponsors.json
data/boards.json           featured cheese boards (hand-edited, curated from reader
                           email submissions to editor@wausaupilotandreview.com):
                           3/5/7 validated cheese ids + credit + optional locally
                           hosted photo (web/public/boards/, submitter-granted);
                           exported to build/boards.json, rendered as the builder's
                           gallery — nothing reaches it unreviewed
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
9. Sponsor entry with an unknown `placement`, a malformed or inverted date
   window, a non-http(s) `url`, or a duplicate `id`
10. Featured board with an unknown or repeated cheese id, a pick count other
    than 3/5/7, an `image` that is not a bare filename, or a duplicate `id`
11. Exported creamery pinned outside Wisconsin (lat/lng beyond 42.4–47.4 N,
    93.0–86.2 W) — a listing's headquarters standing in for the plant; pin the
    first Wisconsin plant in `data/overrides/creameries.json`
12. Exported creamery pinned more than 1 km from its home plant's geocode, or
    whose `home_plant` is not one of its plants — the record would describe
    one place and the map another. Drop the lat/lng override, or re-run
    `scripts/geocode.py` if the plant moved; a home plant the geocoder could
    not place is exempt (its pin stays the listing's point)

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
  highlights must render visibly differently. WCAG 2.1 AA is a requirement
  and the readership skews older (see PRODUCT.md): filled surfaces that
  carry small text use `--teal-dark`, never cream-on-`--teal` (3.9:1), and
  no reader-facing text sits below 0.68rem — conventions in web/README.md.
- Name & branding: the product is **The Cheese Census**. "Wisconsin" lives in
  the standing subtitle ("A census of Wisconsin cheese, from Wausau
  Pilot & Review" — no "the" before the paper's name) and in page
  titles/metadata — never in the mark itself.
  Always render with WPR attribution; visual identity stays WPR (nothing
  gesturing at DFW's badge or trade dress); attorney review before the name
  appears on sponsor contracts.

## Status (August 22, 2026) and next steps, in order

**The build is green with a product-level cheese catalog**: 89 creameries,
1,069 cheeses (446 named products + 623 plain type variants), 61 people, 299
awards — deterministic and idempotent end to end. The similarity engine, the
curd map, and cross-family discovery are all live: Cedar Valley's Habanero
Muenster surfaces habanero jacks from three other creameries above its own
jalapeño sibling.

### The flavor tagging pass (product level)

`data/tagging/types.json` is the editorial heart: 114 DFW cheese types mapped
into the closed vocabularies, plus a product-name lexicon — base aliases
(longhorn→Colby, brun-uusto→bread cheese), modifiers (habanero → add-in +
peppery; goat → milk override; raw milk → raw_milk true; aged → age-band
shift), per-creamery brand words (Odyssey is Klondike, Cello is Schuman), and
an ignore list for sizes and marketing filler. `scripts/catalog.py` derives a
named product as base type row + parsed modifiers, from two name sources:
championship entries (in hand) and shop titles harvested from 84 creamery
websites into `queue/products_research.json` (1,355 titles, supervised
agent-and-hand collection; foreign-brand resale items excluded).

Every token of a product name must be accounted for or NO record is produced —
an unknown word is flavor information we refuse to drop. Semantic dedupe keeps
one record per (creamery, base, modifiers) however the name is spelled. Bare
type records stay alongside named products: the bare record IS the plain
variant, which is real (Klondike's plain Feta wins championships). 165 of 299
awards link to a specific cheese (exact name first, else longest-contained
name; never reverse containment). Nordic Creamery's raw-milk line populates
`raw_milk: true`; 39 products carry goat/sheep/mixed milk.

Worklist in `queue/review_cheeses.json`: 541 unparsed product names (single-name
signatures like Marisa and Mobay, plus flavors outside the vocabulary), 35
untyped single-maker types, and 6 deliberate texture disagreements with DFW's
groupings. **Known limit**: plain variants of the same type still mirror each
other across creameries at 100.0 in similar-lists; differentiation continues
through overrides and the unparsed-signature worklist.

### Non-Wisconsin cleanup

Out-of-state DFW listings are gone: Lactalis's Buffalo HQ, Palmetto (SC), Prairie
Farms' Iowa office and "Wisconsin's Finest" of Plano, TX are classified
`excluded`; ten more listings merged into their licensed Wisconsin companies with
licence-file evidence (Sargento → TTLF Inc dba Sargento Cheese Inc, Schuman →
Lake Country Dairy, Sartori → Sartori Company, Arla → Arla Foods Amba, CROPP →
the co-op, MCT → Bella Pak…). Edelweiss Creamery is `status: closed` (liquidated
Feb 2026) — in the dataset, out of browse.

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
2. Tagging worklist in `queue/review_cheeses.json`: 541 unparsed product names
   (add lexicon rows or override records), 35 untyped types, 6 texture
   disagreements. Re-run `scripts/catalog.py` after edits.
3. `scripts/describe.py` — generation with the WPR voice prompt (623 descriptions
   missing, per `queue/report.json`).
4. The WordPress iframe embed on wausaupilotandreview.com — only after the
   editorial review above. The GitHub Pages deploy is live:
   `.github/workflows/deploy.yml` publishes the production build (draft
   overlays scrubbed, provisional banner up, `noindex`) to
   https://rowanflynnpilot.github.io/cheese-census/ on every push touching
   `web/`, `build/`, `data/` or the pipeline — after two gates: `python
   build.py` must reproduce the committed `build/` byte for byte (stale or
   non-deterministic output fails the deploy, by design), and the web engine
   tests (`npm test`, vitest over `web/src/engines.test.ts`) must pass.

### The reader layer (built August 2026)

`web/` now carries two views under one masthead: the creamery map, and the
**cheese catalog** — card grid over `build/cheeses.json` with family/texture/milk
facets, tag-aware search, four sorts (family sort groups under sticky heads),
a detail panel with the facts, clickable flavor/add-in chips, the cheese's
contest record, and the similar-cheeses list with match-strength bars. The views
cross-navigate (creamery panel ↔ cheese panel, award rows → their cheese), and
the hash self-discriminates: `#slug` is a creamery, `#slug--slug` a cheese.
`web/README.md` documents every URL parameter.

**Hearts** are personal state in `localStorage` (`cheese-census.hearts.v1`),
keyed on cheese ids — the key Supabase aggregation will use when engagement
counts go live; nothing leaves the browser and the About panel says so. The
"My cheeses" shelf adds a **"To try next"** rail: `recommend()` pools the saved
cheeses' similar-lists, sums scores per candidate, attributes each pick to its
strongest contributor, and damps the plain-variant mirror limit (one candidate
per folded name, two per creamery). Highlights render date-windowed, editorial
and sponsored visibly distinct, in the browse band and the matching panel.

**The Cheese Board Builder** (August 2026) is the third view: pick a 3/5/7
board and build toward balance. `web/src/boards.ts` is the similarity engine's
inverse — a deterministic variety scorer over the same structured fields
(new texture/age/milk/flavor-family/county gains, an award thumb that never
outranks fit, per-creamery caps, the mirror-name rule, a "dare" boost toward
blue/washed rind once a board has footing) driving a balance meter with
plain-English nudges, ranked suggestions wearing "what this adds" chips,
one-tap Complete, and seed-from-hearts. Board state: `localStorage`
(`cheese-census.board.v1`) + URL (`?view=board&b=id,…` — the link IS the board);
ends in a print-clean shopping list. The sponsor door is open two ways, both
always in the sponsored visual language: highlights surface in the builder as
add-a-pick cards, and `data/sponsors.json` fills the "Made possible by" slot
(currently WPR's own house ad — no fabricated brands; real entries replace it).
Reader boards close the loop via the **featured-board gallery**
(`data/boards.json`, see layout above): submission is email-to-newsroom with
the share link + photo + publication grant, curation is editorial, and the
gallery renders each board from census data ("Use this board" adopts it) — the
static-site-honest v1; self-serve in-page upload waits for the Supabase layer
and a moderation workflow.

**The October 2026 review pass** (two audits — accessibility/UI guidelines and
mobile/performance/robustness — plus a hands-on walk at phone and desktop
widths) landed as one polish commit: the map draws Wisconsin's own outline
(`web/src/wisconsin.json`, Census 2010 1:5M boundary, public domain,
simplified); the masthead almanac counts the browsable set so it never
contradicts the "88 of 88" beside it; the catalog opens on contest winners
(`csort` default `awards`); phones fold the catalog facets behind one
"Filters & sort" button; Leaflet and its stylesheet load on the first map
view only (catalog and board arrivals fetch no tiles); the three big tables
preload with the bundle and are served compacted; search folds once per
cheese, cards are memoized and typing is deferred; the URL mirror is debounced
behind a try/catch (WebKit's 100-writes rule); skip links, a `main` landmark,
an inert page under the phone sheet, 44 px hit boxes on pins and sheet
buttons, 16 px inputs (no iOS focus-zoom), `overscroll-behavior: contain` on
every pane, hover rules behind `@media (hover: hover)`, forced-colors outlines,
3:1 control borders (`--rule-strong`), a bronze that passes, and a share
helper (`web/src/share.ts`: the phone's share sheet, else the clipboard; a
`VITE_SHARE_BASE` for the article that will embed the census). The embed
iframe needs `allow="web-share; clipboard-write"` — see web/README.md. An
Impeccable critique of the catalog (27/40) then drove a clarify → layout →
harden → typeset → polish pass: filter chips for every facet in force, worked
search examples, a search-aware empty state with nearest names, honest
family-sort counts, the band below the first row on phones, a scrolling sheet
header with a bottom back/step bar, and the maker line at body size. The map's
critique (27/40) found a P0 — six licensed Wisconsin plants pinned at their
listing's out-of-state headquarters — now validation #11 plus overrides; the
same pass added the place-name layer, Near me (distance sort, nothing stored),
the pin chooser for overlapping hit boxes, the result strip and chip-tap
hand-off on phones, the phone legend, the maps link and the licence fold. The
map's second critique (31/40) drove adapt → harden → clarify → layout →
polish: thumb-sized sheet chips and Contact links, the zoom-button rule that
Leaflet's lazy-loaded stylesheet had been overriding, a pointer-aware chooser
(a mouse opens the pin it clicked; a thumb's tap below zoom 9 zooms in before
any chooser; Escape closes it), Near me as a true toggle with a status line
and a phone map-pane button, an empty state that says when the filters hid
the matches ("4 match “Marathon” statewide, none in Burnett County · Show all
4"), and the phone's filters folded behind "Filters & sort" as the catalog's
are. The same pass added `phone` to the schema: DATCP's BusinessPhone,
normalised in `build.py` to "(715) 693-6662" / "… ext. 210", on every plant
and on the creamery from its home plant; the panel's Contact block dials it.

The third map critique (31/40 again: the earlier five issues gone, five new
ones of the same weight) led with data, not design — Emmi Roth pinned at
Monroe under a Platteville address, because a listing's coordinates are
wherever DFW geocoded the company and its city string does not say which
plant that is. The fix is structural: `scripts/geocode.py` geocodes every
licensed plant once into `data/geocode/plants.json` (340 of 388 placed; the
rest are rural grid addresses the Census geocoder cannot read), and `merge()`
makes the **home plant** the licensed plant nearest the listing's point, snaps
the pin onto it, and takes city, county, address and phone from it — so
Contact describes the pinned place, says which plant is pinned when the
company has others, and the licence fold marks it. Validation #12 fails any
pin that drifts from its home plant. `phone` is the licensee's business line
on that plant's licence (21 of 27 multi-plant companies file one number for
every plant), and is labelled so. The six P0 pin overrides are gone (the rule
reproduces them); a DFW-only listing takes the county every licensed plant in
its city shares, with one override (Hoard's, Jefferson). The map gained a
"Wisconsin" control under the zoom buttons, a refit on panel close when the
list changed underneath it and the reader's hand was not on the map, filter
chips as the catalog has, a one-move cluster zoom with a "18 creameries here
— zooming in" label (the chooser handles pins that will not part), and the
secondary type and targets lifted for the readership (pills 0.8rem, row meta
0.84rem, 36 px panel buttons, 44 px phone summaries and links).

**The October 2026 polish list** (installed skills, web techniques): county
lines under the pins from `scripts/counties.py` (Census boundaries, 72
counties, hover count, tap-to-filter, no raw-count choropleth), award winners
as graduated ringed pins, the newsroom phone in the footer (the `wpr-brand`
check: the census is on the Follow the Money pairing, the repo's cream wins);
view transitions for panels and tabs (feature-checked, reduced-motion aware,
focus restore waits for the update), the chooser as a native popover, the
heart as an overshooting transition; Fraunces' SOFT/WONK axes on the masthead,
balanced heads, pretty paragraphs, gold by role (`--gold-text`, `--gold-ring`,
`--gold-ink`) from OKLCH ramps recorded in `:root`; an authored glyph per
cheese family (`web/src/components/FamilyIcon.tsx`); a Playwright smoke test
(`web/tests`, `npm run test:e2e`) as the deploy's third gate on desktop, a
touch phone and reduced motion; and, the look chosen, the basemap itself:
Esri's grey canvas is gone and the map draws a Protomaps basemap
(OpenStreetMap data) in the WPR palette from a committed Wisconsin extract
(`web/public/map/wisconsin.pmtiles`, 38 MB, zoom 0–11, read by HTTP range
requests from the site, so the map makes no third-party request; the map is
capped at zoom 14, three steps of redrawn zoom-11 geometry; the smoke test
asserts the host answers `Range` with 206). OpenStreetMap is credited on the
map, in the colophon and in About. Details and the re-extract command are in
web/README.md.

The fourth map critique (30/40) led with arrival: a deep link to a southern
creamery had framed Illinois, and closing the panel left the map there. A
selected pin is now panned inside the visible strip only as far as that
takes, and a close refits the overview whenever the frame was ours rather
than the reader's. The basemap's roads went from white to pencil grey with
route shields from zoom 8 (`protomaps-leaflet` paints every road kind with
the flavor's `major`); the zoom cap says so and hands off to Open in Maps
(`web/src/maps.ts`, shared with the panel); the zoom buttons keep count of
presses; the 72 county outlines, which Chromium had made inert Tab stops,
carry `tabindex="-1"` and a "Skip to the map" link lands on the map; the
sidebar groups the county, then Sort with Near me, then the store and award
toggles (phones fold only "County & sort"); and the legend states the pin
rule. Details in web/README.md.

The fifth map critique (28/40) caught two regressions from that pass (a
pending zoom left at the cap that undid the next refit; the deep-link frame
holding only at narrow panes) and two older faults (overlapping pin hit
boxes let the topmost box win a hover or press — the map now resolves the
pointer to the nearest pin, and the pins are inert; "Wisconsin" framed the
shown set — it now clears a county filter or fits the state, and a phone's
map pane carries the filter chips). Our own map moves wait out a running
zoom animation, which Leaflet would otherwise drop. Contact names the phone
as the licence's business line in sight and says hours are not in the
census; "Did you mean" scores typed words against name words with common
words counting half. Details in web/README.md.

Catalog names got one more cleaning rule while building this: `clean_title` now
strips *leading* and bare *trailing* sizes ("15.5 oz Chipotle Colby Cheese",
"…Cheddar 1lb.") — Ellsworth's and LaGrander's shop titles carried them. That
renamed ~40 cheese ids; hearts were not yet public, so the ids were still free
to move. They are frozen now that hearts key on them.

**Product photos are permission-gated; shop descriptions are quotes.**
`scripts/images.py` harvests image URLs and the maker's own short description
(first sentences, ≤~200 chars) from the same shops as the title harvest
(Shopify/Woo/Squarespace feeds, then alt-text page scan) into
`queue/product_images.json`, matched to cheese ids by the award rule (exact
name, else longest contained). The two payloads carry different rules:

- *Photos* are copyrighted works (often not even the shop's own — stock,
  contract photographers), so nothing in `build/` references them and
  `Cheese.image` stays null until a creamery says yes (then: override +
  locally hosted asset). `npm run dev` overlays them as an unmistakable
  internal draft (DRAFT ribbon per image, amber not-for-publication bar);
  `sync-data.mjs` deletes the overlay file on any non-`--draft` run, so
  `npm run build` cannot ship it. Do not weaken this gate.
- *Descriptions* render as short **quoted, attributed excerpts** ("In their
  words — {creamery}"): ordinary quotation, no per-creamery permission; the
  attorney blesses the pattern in the standing pre-launch review. They are
  supplementary quotes only — the census's own `description` field remains
  `scripts/describe.py`'s generated voice, never scraped prose.
- *Facility logos* (`scripts/logos.py` → `queue/creamery_logos.json`:
  apple-touch-icon, else largest favicon, else a header img calling itself a
  logo; probe-verified) identify the company — nominative use, ordinary in
  editorial directories — but are still brand artwork, so they ride the same
  dev-only overlay until the attorney blesses the pattern.
