# The Cheese Census — web

React + Vite front end for the creamery map and directory. Renders `build/*.json`;
it holds no data of its own and computes nothing the pipeline should have computed.

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

Creameries, their licensed plants and operations, master cheesemakers and contest
awards — filterable by county, retail store and award record, sortable by name,
award count or county (with sticky county section heads), with a map pin per
creamery (retail stores render as a donut; the legend on the map explains the
pins). Awards group by contest edition with 1st/2nd/3rd medal chips and champion /
top-20 treatment. A stats strip under the masthead carries the census-wide
numbers, and an "About this census" panel in the colophon explains sources,
methodology and the provisional-data notice.

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

## Shareable views

The whole view lives in the URL, so a story or embed can link straight to it:

| Parameter | Meaning | Example |
|---|---|---|
| `?county=` | County filter | `?county=Green` |
| `?q=` | Search text | `?q=gouda` |
| `?store=1` | Retail-store filter on | |
| `?awards=1` | Award-winners filter on | |
| `?sort=` | `awards` or `county` (default name) | `?sort=awards` |
| `#creamery-id` | Opens that creamery's detail panel | `#hooks-cheese-company-inc` |

They compose: `/?county=Green&sort=awards#klondike-cheese-company` opens the Green
County view sorted by award count with Klondike's panel up. Esc closes the panel
and returns focus to the list.

`build/cheeses.json` is still empty, so the reader-facing cheese layer (browse,
hearts, similar-cheese, highlights) is not built yet. `src/types.ts` already mirrors
the full SCHEMA.md shape including `Cheese`, `SimilarRef` and `Highlight`, so that
layer drops in without reshaping anything.

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
