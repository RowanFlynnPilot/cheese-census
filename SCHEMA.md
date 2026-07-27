# The Cheese Census — Data Schema v1

Canonical data model for the WPR Wisconsin cheese tool. This describes the **merged, validated dataset** the site consumes — not the raw scraper outputs. Raw source data flows through the pipeline and dies at the merge step; only records conforming to this schema survive.

## Pipeline shape

```
scrapers/datcp.py     ─┐
scrapers/dfw.py        ├─→ data/raw/  ─→  build.py  ─→  build/*.json  (app consumes)
scrapers/masters.py    │   (committed,      │
scrapers/contests.py  ─┘    diffable)       ├─→ queue/  (generated review reports)
                                            │
                       data/overrides/  ────┘  (hand-edited, always wins)
                       data/vocab/tags.json    (controlled vocabularies)
```

Rules of the pipeline:

- **Scrapers fail loudly** on structural changes to a source. No silent partial output.
- **Overrides always win.** Every canonical record can be patched by id from `data/overrides/`. This is the single mechanism for manual corrections — no edits to raw or build output, ever.
- **`build.py` validates everything** against this schema and the vocab file. Any violation kills the build with a named error. No warnings that scroll by.
- **Build output is deterministic.** Same inputs → byte-identical `build/*.json` (stable sort orders, stable tiebreaks).

## Entity model

The reader-facing entity is the **creamery** — the company, not the plant. DATCP licenses *plants*, and multi-plant companies are common (BelGioioso alone holds many plant numbers), so plants nest under creameries. The DATCP plant number remains the canonical join key for everything government-issued; the creamery slug is the canonical key for everything reader-facing.

```
creamery 1 ──< plants (DATCP records)
creamery 1 ──< cheeses
creamery 1 ──< people (master cheesemakers)
awards >── matched to creamery (always attempted) and cheese (when possible)
crosswalk: source record → creamery id
```

One record per **distinct named product**. Marieke Gouda and Marieke Gouda Smoked are two records; there is no variant/parent modeling. If a creamery names it and sells it, it's a row. Curds follow the same rule: every curd-making creamery gets exactly one plain `family: curds` record — that set *is* the curd map — and flavored curds (pepper jack, habanero) are their own records like any other named product.

---

## `build/creameries.json`

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | slug | assigned | Stable forever. `hooks-cheese`, `uplands-cheese` |
| `name` | string | DFW → DATCP | Reader-facing name, not legal entity name |
| `aka` | string[] | merge | Other trade names encountered across sources |
| `city` | string | DATCP/DFW | Public-facing location |
| `county` | string | DATCP | Drives the county map view |
| `lat`, `lng` | float | geocoded once | Pinned via override after first geocode; **required** — the map can't render a null |
| `address` | string | DATCP/DFW | Retail address if one exists, else plant address |
| `website` | string \| null | DFW/curated | |
| `retail` | object | DFW | `{store: bool, mail_order: bool, online: bool}` — feeds trail planner |
| `plants` | object[] | DATCP | `{datcp_id, address, city, county, operations: string[]}` — operations kept verbatim from the directory |
| `dfw_company_id` | int \| null | DFW | From `/wi-cheese-companies/{id}/…` |
| `founded` | int \| null | curated | Storytelling field |
| `status` | enum | curated | `active` \| `closed` — closed creameries stay in the dataset (history is useful) but drop out of browse views |
| `editorial` | object | WPR-written | `{summary, visit_notes: string \| null, photo: string \| null}` |

Master cheesemaker names and award counts are **derived at build** from `people` and `awards` — never stored here.

The working dataset also carries `classification: creamery | commodity | processor | excluded` (set in overrides during the manual pass over the ~400 DATCP plants). The line: a company classifies as `creamery` only if it sells named consumer cheeses under its own brand; pure commodity and private-label operations are `commodity` regardless of volume. Only `creamery` rows are exported to `build/`. The classification field itself never ships.

## `build/cheeses.json`

| Field | Type | Notes |
|---|---|---|
| `id` | slug | `{creamery-id}--{cheese-slug}` (double hyphen separator): `marieke-gouda--fenugreek-gouda` |
| `name` | string | |
| `creamery_id` | slug | FK, validated |
| `family` | enum | One value from `vocab.family` |
| `milk` | enum[] | ≥1 value from `vocab.milk` |
| `texture` | enum | Ordinal, from `vocab.texture` |
| `age_band` | enum | Ordinal, from `vocab.age_band` |
| `rind` | enum | From `vocab.rind` |
| `flavor` | enum[] | 2–6 tags from `vocab.flavor` — enforced range, this powers similarity |
| `add_ins` | enum[] | From `vocab.add_ins`; empty array = plain cheese |
| `raw_milk` | bool \| null | `null` = unverified (the one permitted null-as-unknown; it's real reporting value but often unknowable from scraping) |
| `trademarked` | bool | The BellaVitanos and Chandokas |
| `wisconsin_original` | bool | Invented here — colby, brick, the originals list |
| `description` | string \| null | Generated-first — see Descriptions below. Never DFW marketing prose |
| `description_generated` | bool | `true` until a human edits the text; drives coverage reports and any on-site disclosure treatment |
| `image` | string \| null | |
| `similar` | object[] | **Injected at build**: top 6 `{cheese_id, score}` — see Similarity |

Awards are never stored on the cheese record. `build.py` denormalizes matched awards into the cheese export as `award_refs` for render convenience; `awards.json` stays the source of truth.

Hearts live exclusively in Supabase, keyed on `cheese_id`. The static JSON carries zero engagement state.

### Descriptions

Descriptions are generated, not hand-written — nobody at WPR has time to write hundreds of these. A standalone script (`scripts/describe.py`) builds each description from the record's own structured fields (family, milk, texture, age band, flavor tags, add-ins, awards, creamery context) using a fixed WPR-voice prompt, and writes the result into the data files. Three rules keep this sane:

- Generation never runs inside `build.py`. The build stays offline and deterministic; `describe.py` is a curation tool run deliberately, like the scrapers, and only for records missing a description or changed since their last generation.
- Input is the structured record, never scraped DFW prose — the copyright posture stays clean, and any description can be regenerated whenever its record changes.
- `description_generated` stays `true` until a human touches the text. The queue reports coverage and the generated/edited split, so editing is opportunistic spot-checking, never a launch gate. Whether generated text gets a disclosure treatment on-site is an editorial presentation call the flag makes possible.

A cheese with `description: null` simply renders its structured data — missing descriptions are never build-fatal.

## `build/people.json`

| Field | Type | Notes |
|---|---|---|
| `id` | slug | |
| `name` | string | From the Master Cheesemaker directory |
| `creamery_ids` | slug[] | Resolved via crosswalk; a person can certify at more than one company over a career |
| `certifications` | object[] | `{type, year: int \| null}` — `type` from `vocab.mc_certifications` (certifications are per cheese variety) |
| `active` | bool | In the current year's directory |

## `build/awards.json`

Wisconsin winners only, both contests, class-by-class.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `{contest}-{year}-c{class}-{placement}`: `wccc-2026-c07-1` |
| `contest` | enum | `wccc` (World, even years) \| `uscc` (US, odd years) |
| `year` | int | |
| `class_number` | int | |
| `class_name` | string | As published |
| `placement` | int | 1 \| 2 \| 3 |
| `finalist` | bool | Made the top-20 championship round |
| `champion` | bool | Won the whole thing |
| `score` | float \| null | Published for finalists |
| `entry` | object | `{cheese_name, maker, company, city}` — verbatim as published, never edited |
| `creamery_id` | slug \| null | Resolved match; null lands in the queue |
| `cheese_id` | slug \| null | Only when the entry maps cleanly to a cataloged cheese — many won't, and that's fine |

## `data/crosswalk` (pipeline-internal, not exported)

Maps every source record to a canonical creamery.

```json
{"source": "datcp", "source_key": "55-0123", "creamery_id": "hooks-cheese", "method": "auto"}
{"source": "dfw",   "source_key": "39",      "creamery_id": "hooks-cheese", "method": "auto"}
```

- `source`: `datcp` | `dfw` | `masters` | `contests` — matching the scraper module names, one vocabulary everywhere
- `method`: `auto` (emitted by the merge's normalized name + address matching) or `manual` (lives in `data/overrides/crosswalk.json`)
- Manual entries always win over auto. Every source record must resolve to a crosswalk row or an explicit `excluded` classification — anything else lands in `queue/unmatched.json` and the build **fails** until resolved. Unresolved entities are exactly the thing manual review exists for; the build refusing to proceed is the feature.

---

## `data/vocab/tags.json` — controlled vocabularies

Every enum in the schema lives here. An unknown value anywhere in the data is a build failure, and adding a vocabulary term is a deliberate commit — that friction is what keeps the similarity engine honest.

**milk** — `cow`, `goat`, `sheep`, `mixed`

**texture** (ordinal) — `fresh` → `soft` → `semi_soft` → `semi_hard` → `hard`

**age_band** (ordinal) — `fresh` → `young` (<3 mo) → `medium` (3–9 mo) → `aged` (9 mo–2 yr) → `extra_aged` (2 yr+)

**rind** — `none`, `natural`, `bloomy`, `washed`, `wax`

**family** (starting set, expected to get edited in review):
`cheddar`, `colby_jack`, `alpine`, `gouda_edam`, `blue`, `bloomy`, `washed_rind`, `fresh`, `pasta_filata`, `italian_hard`, `hispanic`, `brined`, `semi_soft_table` (brick, muenster, havarti, butterkäse), `curds`, `spreads_processed`, `other`

**flavor** (the similarity backbone, ~22 tags):
`buttery`, `creamy`, `milky`, `mild`, `sweet`, `caramel`, `nutty`, `toasty`, `fruity`, `grassy`, `earthy`, `mushroomy`, `tangy`, `sharp`, `salty`, `briny`, `savory`, `smoky`, `peppery`, `pungent`, `funky`, `crystalline`

**add_ins** (starter set, grows by commit):
`dill`, `garlic`, `onion`, `chive`, `basil`, `tomato`, `jalapeno`, `chipotle`, `habanero`, `horseradish`, `caraway`, `fenugreek`, `cumin`, `truffle`, `bacon`, `cranberry`, `cherry`

**mc_certifications** — seeded from whatever varieties appear in the Master Cheesemaker directory parse.

## Similarity

Computed pairwise at build time over all exported cheeses. Pure function of the record fields — no runtime computation, no ML.

```
score(a, b) =
    3.0  × jaccard(flavor)
  + 2.0  × ordinal(texture)        # 1 exact, 0.5 adjacent, 0 otherwise
  + 1.5  × ordinal(age_band)       # same rule
  + 1.0  × jaccard(milk)
  + 1.0  × add_in_match            # jaccard(add_ins); both-empty = 1.0
  + 0.5  × (rind equal)
  + 0.5  × (family equal)
```

- Normalized to 0–100 (max raw score 9.5).
- Flavor dominates by design: the point is "you'll like this," not "this is technically the same style." Family gets only a nudge, so a caramel-nutty aged gouda can surface a caramel-crystalline aged cheddar — that cross-family discovery is the delight the feature exists for.
- `add_in_match` scoring 1.0 when both are plain means plain-vs-plain comparisons are unaffected while plain-vs-flavored pairs eat a relative penalty — a dill havarti should surface other dill cheeses before plain havarti.
- Top 6 per cheese exported. Ties broken by score desc, then id asc — deterministic builds.

## `build/highlights.json`

Editorial state kept apart from the catalog (separation of concerns — the catalog describes cheese; this file describes what WPR is doing with it this week).

```json
{"cheese_id": "...", "type": "editorial", "label": "Cheese of the Week", "starts": "2026-08-03", "ends": "2026-08-09"}
{"cheese_id": "...", "type": "sponsored", "label": "Sponsor Spotlight", "sponsor": "...", "starts": "...", "ends": "..."}
```

`type` is `editorial` | `sponsored` and the frontend must render the two visibly differently. `sponsor` is required when `type = sponsored`, forbidden otherwise — validated like everything else.

## Validation (build-fatal, all of them)

1. Any value not in `vocab/tags.json`
2. Duplicate `id` within any table
3. Dangling FK (`creamery_id`, `cheese_id`, crosswalk target)
4. `flavor` outside 2–6 tags
5. Missing `lat`/`lng` on an exported creamery
6. Unresolved source record (no crosswalk row, no `excluded` classification)
7. `sponsored` highlight without a `sponsor`, or vice versa
8. Non-deterministic output (build runs sort checks on its own export)

`queue/` reports are regenerated every run for the non-fatal review work: creameries with zero cataloged cheeses, awards with `creamery_id` but no `cheese_id`, cheeses still carrying provisional flavor tags from assisted tagging, and description coverage (missing / generated / human-edited).
