# The Cheese Census — web

React + Vite front end: the creamery map and directory, and the reader-facing
cheese catalog. Renders `build/*.json`; it holds no data of its own and computes
nothing the pipeline should have computed.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` first runs `scripts/sync-data.mjs`, which copies `build/*.json` into
`public/data/` (gitignored — `build/` stays the single source of truth). If `build/`
is empty the sync fails loudly: the pipeline stops at the manual review gate until
`data/overrides/classifications.json` and `crosswalk.json` are filled in.

```bash
npm run build       # typecheck + production bundle into dist/
npm run typecheck
```

## What it renders today

Two views under one masthead, switched by the mode bar:

**Creamery map** — creameries, their licensed plants and operations, master
cheesemakers and contest awards — filterable by county, retail store and award
record, sortable by name, award count or county (with sticky county section
heads), with a map pin per creamery (retail stores render as a donut; the legend
on the map explains the pins). Awards group by contest edition with 1st/2nd/3rd
medal chips and champion / top-20 treatment. A stats strip under the masthead
carries the census-wide numbers, and an "About this census" panel in the colophon
explains sources, methodology and the provisional-data notice.

Search answers the census's home question — *who makes X?* It matches names,
cities, counties and trade names, and reaches into each creamery's licensed
cheese types (diacritic-insensitive), labelling rows that matched that way with
"makes …". The "Licensed to make" chips in the detail panel are buttons: click
one to see every maker of that cheese. The panel also carries prev/next
navigation through the filtered list (← / → keys work too, with a position
indicator) and a copy-link button for the creamery's deep link.

Plant operations are split into cheese types and plant capabilities using DATCP's
own closed vocabularies (the 7 GeneralProcessing and 29 SpecificProcessing values,
pinned in `src/data.ts`) — membership, not pattern-matching.

**Cheese catalog** — the product-level reader layer over `build/cheeses.json`:
a card grid filterable by family, texture and milk (with counts), searchable
across names, makers, families, flavor tags and add-ins (indirect matches carry
a "matched: …" hint), sortable A–Z / by creamery / most awarded / by family
(family sort groups under sticky heads). Cards carry family kicker, flavor tags,
add-in chips, and award / Wisconsin-original / raw-milk / goat-sheep badges.
Flavor chips are color-coded into six families (`FLAVOR_GROUP` in `src/data.ts`:
dairy, sweet, toast, green, acid, bold — acid wears the house teal) with a
matching dot, so a card's profile scans at a glance; add-ins render as
additions ("+ habanero"). A new vocabulary term joins its family there, or
falls back to a plain tag.
The detail panel shows the facts (family, texture, age, rind, milk), clickable
flavor and add-in chips ("what else tastes like this, statewide?"), the cheese's
contest record, and the **similar-cheeses list** with match-strength bars —
`similarity.py`'s scores, rendered as shipped. Closed-creamery records stay
reachable by deep link and award reference but never appear in browse.

The two views cross-navigate: a creamery panel lists its catalog records as
chips ("In the cheese catalog") and links each pinned award to its cheese; a
cheese panel links back to its creamery on the map and to a maker-filtered
catalog view (removable "from …" chip).

**Hearts** — the ♥ on any card or panel saves a cheese to "My cheeses". Hearts
live in `localStorage` (`cheese-census.hearts.v1`), keyed on the stable cheese
ids Supabase aggregation will later use; nothing leaves the browser, and the
About panel says so. The mode bar shows a "♥ n saved" shortcut once anything is
saved. The shelf view (My cheeses toggle) adds a **"To try next"** rail:
`recommend()` in `src/data.ts` pools the similar-lists of every saved cheese,
sums match scores per candidate, and labels each pick with the saved cheese that
contributed its strongest link ("because you saved …"). Plain variants of one
type mirror each other at 100.0 across creameries (a known dataset limit), so
the rail keeps one candidate per folded name and at most two per creamery.

Highlights from `build/highlights.json` render as a band above the grid and
inside the matching cheese's panel, date-windowed by their `starts`/`ends`.
Editorial and sponsored highlights render visibly differently (see Conventions).

**Draft photo overlay (dev only).** `queue/product_images.json` (from
`python scripts/images.py`) holds product-photo URLs harvested from creamery
shops — a *permission queue*: WPR may not publish them until each creamery says
yes. `npm run dev` serves it as `data/draft_images.json` and the app overlays
the photos with a DRAFT ribbon on every image, an amber "not for publication"
bar over the catalog, and a caption in the detail panel. The gate is in
`scripts/sync-data.mjs`: without `--draft` it *deletes* the file from
`public/data/`, so `npm run build` physically cannot ship it, and the fetch is
additionally `import.meta.env.DEV`-gated. Photos are hotlinked with
`referrerPolicy="no-referrer"` and vanish silently if a shop blocks or moves
them. When a creamery grants permission, its photos graduate to `Cheese.image`
via the pipeline (`data/overrides/` + locally hosted assets) — never from this
overlay.

## Shareable views

The active view lives in the URL, so a story or embed can link straight to it.
The hash discriminates itself: creamery ids are single-hyphen slugs, cheese ids
carry the `--` separator, so `#hooks-cheese-company-inc` opens a map panel and
`#cedar-valley-cheese-inc--habanero-muenster` opens a catalog panel — either one
straight from a cold load.

Creamery-map parameters:

| Parameter | Meaning | Example |
|---|---|---|
| `?county=` | County filter | `?county=Green` |
| `?q=` | Search text | `?q=gouda` |
| `?store=1` | Retail-store filter on | |
| `?awards=1` | Award-winners filter on | |
| `?sort=` | `awards` or `county` (default name) | `?sort=awards` |
| `#creamery-id` | Opens that creamery's detail panel | `#hooks-cheese-company-inc` |

Cheese-catalog parameters (all under `?view=cheeses`):

| Parameter | Meaning | Example |
|---|---|---|
| `?cq=` | Search text | `?cq=habanero` |
| `?family=` / `?texture=` / `?milk=` | Facet filters (vocabulary terms) | `?family=colby_jack` |
| `?maker=` | One creamery's cheeses | `?maker=cedar-valley-cheese-inc` |
| `?csort=` | `creamery`, `awards` or `family` (default name) | `?csort=awards` |
| `?cawards=1` / `?wo=1` / `?mine=1` | Award winners / Wisconsin originals / saved only | |
| `#creamery--cheese` | Opens that cheese's detail panel | `#klondike-cheese-company--feta` |

They compose: `/?view=cheeses&family=curds&csort=awards` is the curd map's list
form. Esc closes the open panel and returns focus to its card or row.

## Deployment

Vite `base` defaults to `/cheese-census/` for GitHub Pages. Serving from a domain
root instead:

```bash
BASE_PATH=/ npm run build
```

The page is designed to fill its container, so the embedding WordPress iframe must
be given a height — it does not self-size. Map tiles come from CARTO/OpenStreetMap;
fonts from Google Fonts. Both are third-party requests from inside the iframe.

Once `data/overrides/` has been through editorial review, build with:

```bash
VITE_DATA_STATUS=reviewed npm run build
```

which drops the "Provisional data" notice from the colophon.

## Conventions

- WPR design system only: teal `#3A867C`, cream `#F6F2E9`, Fraunces display,
  Public Sans body, JetBrains Mono for figures (plant numbers, scores, counts).
  Nothing here gestures at DFW's badge or trade dress.
- "Wisconsin" belongs in the subtitle and page title, never in the mark.
- Editorial and sponsored highlights must render visibly differently — the
  `.highlight` / `.highlight.sponsored` rules already diverge, and must stay that way.
