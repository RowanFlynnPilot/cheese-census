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
npm test            # vitest: the recommender and board engines, on synthetic fixtures
```

`src/engines.test.ts` pins the rules the two pure engines promise — determinism,
the mirror-name rule, the two-per-creamery cap, "awards never outrank fit", the
nudge priorities — against small synthetic cheeses, so a data refresh can never
flip a test. The deploy runs it before every publish.

## What it renders today

Three views under one masthead, switched by the mode bar:

**Creamery Map** — creameries, their licensed plants and operations, master
cheesemakers and contest awards — filterable by county, retail store and award
record, sortable by name, award count or county (with sticky county section
heads), with a map pin per creamery (retail stores render as a donut; the legend
on the map explains the pins). Hovering a pin opens a card — name (with the
draft logo in dev), city and county, street address, store/award/catalog
pills, and the first licensed cheese types as chips; the HTML is built and
escaped in `App.tsx` (`mapTips`), the only hand-rendered markup in the app. Awards group by contest edition with 1st/2nd/3rd
medal chips and champion / top-20 treatment. The masthead is one teal band:
title row, a census-numbers line, and the two view tabs folder-style on its
bottom edge (active tab in cream). An "About this census" panel in the colophon
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

The map answers "where" and "near me" (October 2026 critique, 27/40 → the five
priority issues): every exported pin is in Wisconsin, by build validation #11
(six licensed plants had carried their listing's out-of-state headquarters
coordinates; their first Wisconsin plants are pinned in
`data/overrides/creameries.json`, geocoded with the Census Bureau's public
geocoder); Esri's keyless Light Gray *Reference* layer puts the place names on
the map; **Near me** asks the browser for the reader's position once, draws one
ink dot, sorts the list by distance with miles on each row, and keeps nothing
(not in storage, not in the URL — the distance sort never travels in a link;
the WordPress iframe needs `allow="geolocation"`); a tap that lands on more
than one pin's hit box opens a chooser (a Leaflet popup in the cream card,
one 44px button per creamery) instead of whichever pin was on top; the legend
stays on phones as one line at the map's top right; a search shows a result
strip at the head of the list ("28 match “Gouda” · Clear"), and on a phone a
"Licensed to make" chip closes the sheet onto that strip so the tap has a
visible result; an empty search names what was typed and offers the nearest
creamery names (`nearness` in `App.tsx`); the panel's address carries an
"Open in Maps" link, and the plant-by-plant licence detail folds behind
"Licence details (N plants)" — every operation it lists is already a chip
above.

**Cheese Catalog** — the product-level reader layer over `build/cheeses.json`:
a card grid filterable by family, texture and milk (with counts), searchable
across names, makers, families, flavor tags and add-ins (indirect matches carry
a "matched: …" hint), sortable A–Z / by creamery / most awarded / by family
(family sort groups under sticky heads). Cards carry family kicker, flavor tags,
add-in chips, and award / Wisconsin-original / raw-milk / goat-sheep badges.
Award winners wear a gold rosette seal beside the heart and a citation strip at
the card's foot — the top win spelled out ("1st · Lowfat Cheeses · World
Championship 2026 · +7 more awards"; champion beats placement beats recency,
`topAward`/`awardCitation` in `src/data.ts`). That treatment is census data and
ships; it is independent of the draft overlay. Search is tokenized — every word
must match somewhere across name, maker, city and tags, so "klondike feta"
works. Flavor chips are color-coded into six families (`FLAVOR_GROUP` in `src/data.ts`:
dairy, sweet, toast, green, acid, bold — acid wears the house teal), each with
a monochrome currentColor glyph (`FlavorIcon.tsx`: droplet, berry, acorn, leaf,
bolt, flame — deliberately not emoji, which render platform-dependently and
outside the palette), so a card's profile scans at a glance. A term can carry
its own glyph over its family's (`TERM_GLYPHS` — buttery gets a butter dish). Labels are
sentence-case; add-ins render as additions ("+ Habanero"). A new vocabulary
term joins its family there, or falls back to a plain tag.
The detail panel shows the facts (family, texture, age, rind, milk), clickable
flavor and add-in chips ("what else tastes like this, statewide?"), the cheese's
contest record, and the **similar-cheeses list** with match-strength bars —
`similarity.py`'s scores, rendered as shipped. Closed-creamery records stay
reachable by deep link and award reference but never appear in browse.

The catalog explains its own state (October 2026 critique, 27/40 → the five
priority issues): every filter in force renders as a removable chip in one row
beside the "from …" maker chip, on both breakpoints, so a `?milk=goat` link
never reads as "the census is small"; an empty search box carries three worked
examples (a flavor, a maker, a note) that fill it on tap; a search that finds
nothing names what was typed and offers the three nearest names (character-
bigram overlap over the folded names, `nearMisses` in `App.tsx`), with the
cheese-desk band hidden over an empty result; the family-sort heads count the
whole answer (`familyTotals`), never the page that has rendered so far, with
the count beside the label; on phones the band follows the first row of cards
(the reader's answer before the paper's plug — DOM order is the visual order),
the record sheet's header scrolls with the record while a bottom bar carries
back plus previous/next, and the maker line reads in ink at 0.86rem, bold where
a name repeats in view.

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

**Cheese Board** — the board builder (`src/boards.ts` + `BoardView.tsx`): pick a
size (3/5/7), then build toward balance. A good board is a *variety* problem, so
the engine spends the catalog's structured fields on the similarity engine's
opposite: the **balance meter** shows the board's spread across the texture and
age spectrums, milks, and the six flavor families; a plain-English nudge names
the biggest gap ("Nothing firm yet — an aged wheel anchors the board"). **The
engine speaks with one voice:** `boardNudges` returns structured nudges (text,
a short `want`, and a `resolves` predicate) and `suggestForBoard` gives the
leading nudge a bonus larger than any single structural gain, so the rail's
first cards answer the note ("Suggested next — soft first", chip "needed:
soft"). Beneath that, **Suggested next** ranks by what a cheese would *add*
(new texture +3, age +2, milk +2, flavor families +1.5 ea, family +1.5, a
same-county stop +0.75 — the board is a shopping list, fewer stops win — and
an award bonus that never outranks fit; second-pick-per-creamery penalty, third
forbidden, mirror names skipped, closed creameries never suggested, and a "dare"
boost toward a blue or washed rind once a board has footing). A full board that
still wants something grows a **swap rail**: candidates that answer the nudge,
each replacing `weakestPick` — the pick carrying the fewest facets nothing else
covers (a closed creamery's cheese is always the one to spare). **Fill it for
me** lives in the first empty slot and fills greedily, breaking exact-score ties
with a per-browser salt (`cheese-census.reader.v1`) so one-tap boards differ
reader to reader while the build's own determinism (empty salt) is what the
tests pin; **Start from my saved** builds the most balanced board the reader's
hearts can make. Nothing is lost by accident: "Use this board" and "Start over"
show an inline **Undo** for ten seconds, and shrinking the size asks first,
naming the picks it would drop. Adding happens from suggestions, highlight
cards, or any cheese panel's "Add to the board" button, and focus follows the
action (the new slot after an add, the tray after a fill or remove, the slot
after closing a panel). The board persists in `localStorage`
(`cheese-census.board.v1`) and mirrors into the URL (`?view=board&bsize=5&b=…`,
size always included) so **the link is the board** — a recipient loads those
picks at that size — and ends in a **shopping list grouped by stop**: each
creamery with its street address, website and whether it has a store at the
creamery, its cheeses in plain words ("Semi-hard · medium age · cow"), closed
creameries flagged, copy-link (with the raw link revealed only if copying
fails) and a print stylesheet that prints the list and nothing else.
`build/sponsors.json` feeds the **sponsor slot** below the headline: the active
`placement: "board"` entry renders "Made possible by …" in the sponsored visual
language (absent when none is live) and its credit rides the printed sheet; the
current entry is WPR's own house ad.

**Featured boards** (`build/boards.json`) close the loop: readers email the
newsroom (`editor@wausaupilotandreview.com` — the paper's published submission
address) their board's share link plus a photo of the real spread; an editor
curates entries into `data/boards.json` (build-validated: every pick must exist,
counts are 3/5/7), so nothing reaches the gallery unreviewed. Each gallery card
renders the board from census data — pick chips open the cheese panels, "Use
this board" adopts it as the working board — with the photo (a locally hosted
asset under `public/boards/`, never a hotlink, published only with the
submitter's grant) when there is one. "Send it to the newsroom" in the share
row opens the reader's own mail client with the link and the publication grant
prefilled; the gallery's invite line does the same. Editorial entries render
"From the cheese desk", reader entries "Shared by {first name, town}".

**Draft photo overlay (dev only).** `queue/product_images.json` (from
`python scripts/images.py`) holds product-photo URLs and the maker's own short
description harvested from creamery shops. The *photos* are a permission
queue — WPR may not publish them until each creamery says yes. The
*descriptions* are different: they render as short quoted, attributed
excerpts (italic under a card's tags; an "In their words — {creamery}"
section in the panel), which is ordinary quotation and needs no per-creamery
permission (the attorney blesses the pattern in the standing pre-launch
review). Both currently ride the dev-only overlay because the reader layer
has not shipped; when it does, the quotes can go to production while the
photos keep waiting on permissions.

`queue/creamery_logos.json` (from `python scripts/logos.py`) rides the same
overlay as `draft_logos.json`: each creamery's own brand mark (apple-touch-icon,
else largest favicon, else a header logo image, probe-verified), shown in the
directory rows and both detail panels. Identification use, but still brand
artwork — dev-only until the pre-launch rights review. The draft notice bar is
app-level (all three views show overlay material — catalog cards and panels,
board tray slots and suggestion cards, map hover cards), and any non-`--draft`
sync deletes both overlay files. `npm run dev` serves it as `data/draft_images.json` and the app overlays
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
| `#creamery-id` | Opens that creamery's detail panel | `#hook-s-cheese-company-inc` |

Cheese-catalog parameters (all under `?view=cheeses`):

| Parameter | Meaning | Example |
|---|---|---|
| `?cq=` | Search text | `?cq=habanero` |
| `?family=` / `?texture=` / `?milk=` | Facet filters (vocabulary terms) | `?family=colby_jack` |
| `?maker=` | One creamery's cheeses | `?maker=cedar-valley-cheese-inc` |
| `?csort=` | `name`, `creamery` or `family` (default `awards` — contest winners first, then A–Z) | `?csort=name` |
| `?cawards=1` / `?wo=1` / `?mine=1` | Award winners / Wisconsin originals / saved only | |
| `#creamery--cheese` | Opens that cheese's detail panel | `#klondike-cheese-company--feta` |

Cheese-board parameters (all under `?view=board`):

| Parameter | Meaning | Example |
|---|---|---|
| `?b=` | The board itself — cheese ids, comma-joined, in pick order | `?b=klondike-cheese-company--feta,…` |
| `?bsize=` | Board size, `3`/`5`/`7` (default 5) | `?bsize=7` |

They compose: `/?view=cheeses&family=curds&csort=awards` is the curd map's list
form. A `b=` arrival *on the board view* adopts those picks as the working board
(ids the dataset doesn't know are dropped; a hand-mixed link with a record hash
opens the record and leaves the board alone); arriving without a `b=` leaves the
saved board untouched. Esc closes the open panel and returns focus to its card
or row.

## Deployment

`.github/workflows/deploy.yml` publishes to GitHub Pages
(https://rowanflynnpilot.github.io/cheese-census/) on every push that touches
`web/`, `build/`, `data/` or the pipeline. It is always the production build:
sync-data runs without `--draft`, so the site carries no hotlinked photos,
blurbs or logos, and the provisional banner stays until the build runs with
`VITE_DATA_STATUS=reviewed`. Two gates run first and either failing stops the
deploy loudly: `python build.py` is re-run on the committed inputs and must
reproduce `build/` byte for byte (a stale or non-deterministic build/ never
ships), and `npm test` must pass. The page carries `<meta name="robots"
content="noindex">` — a review copy under a provisional banner must not outrank
the article it will be embedded in, and an iframe's inner document should not
be the indexed page anyway. A render error anywhere is caught by
`ErrorBoundary` (one sentence and a Reload button rather than a blank frame);
a failed data load shows the same shape with a Try again button.

Vite `base` defaults to `/cheese-census/` for GitHub Pages. Serving from a domain
root instead:

```bash
BASE_PATH=/ npm run build
```

The page is designed to fill its container, so the embedding WordPress iframe must
be given a height — it does not self-size. (A child-side `ResizeObserver` →
`postMessage` broadcaster is the standard pattern if a content-height embed is
ever wanted; it is not built because every view here is a viewport-height
layout with its own scroller.) Map tiles come from Esri's keyless
World Light Gray canvas (CARTO's free basemaps started watermarking "API KEY
REQUIRED" across every tile in mid-2026, which is why they left); fonts from
Google Fonts. Both are third-party requests from inside the iframe. The Esri
canvas tops out at zoom 16 and the map is capped to match.

### The embed iframe

Three things the WordPress embed must carry, or features that work on the
standalone page go quiet inside the article:

```html
<iframe
  src="https://rowanflynnpilot.github.io/cheese-census/"
  title="The Cheese Census"
  allow="web-share; clipboard-write; geolocation"
  style="width: 100%; height: 760px; border: 0"
></iframe>
```

- `allow="web-share; clipboard-write; geolocation"` — Chromium gates the
  share sheet, the clipboard and geolocation behind Permissions Policy,
  default allowlist `self`; a cross-origin frame without it gets
  `NotAllowedError` on every Share / Copy link tap and a denied "Near me".
  The buttons already fall back (the link itself; "pick a county"), but the
  tap should just work.
- A share link should open the *article*, not the bare inner frame. Build
  with `VITE_SHARE_BASE=https://www.wausaupilotandreview.com/<article>/`
  (the page that holds the iframe) and have that page forward its own
  `location.search` and `location.hash` into the iframe `src` — the census
  reads `?view=…`, `?b=…`, `#record` from its own URL as today. Without the
  variable, share links point at the page the app is served from.
- On phones inside an article the map starts un-draggable (a one-finger
  swipe scrolls the article, not the map); the first tap on the map arms
  dragging and a "Tap the map to move it" label goes with it. Pinch-zoom works
  throughout. The standalone page has nothing else to scroll, so there the map
  drags from the start. (`MapView.tsx`, `COOPERATIVE`.)

Browser floor: iOS 14.1 / Safari 14.1 and the matching Chromium (the build
emits `||=`, `??=`, `inset`); `matchMedia` falls back to `addListener` for
anything older rather than taking the frame down. Fonts still come from
Google Fonts (three families, ~120 KB, render-blocking CSS); self-hosting a
latin subset with preloads is the one performance item left on the table.

Once `data/overrides/` has been through editorial review, build with:

```bash
VITE_DATA_STATUS=reviewed npm run build
```

which drops the "Provisional data" notice from the colophon.

## Conventions

- WPR design system only: teal `#3A867C`, cream `#F6F2E9`, Fraunces display,
  Public Sans body, JetBrains Mono for figures (plant numbers, scores, counts).
  Nothing here gestures at DFW's badge or trade dress. The masthead carries the
  WPR typewriter seal (`public/wpr-typewriter-badge.png`, self-hosted — the
  same mark the Brewers tracker uses) beside the attribution phrase.
- "Wisconsin" belongs in the subtitle and page title, never in the mark.
- Editorial and sponsored highlights must render visibly differently — the
  `.highlight` / `.highlight.sponsored` rules already diverge (house teal on
  the teal tint vs. sponsor brown on parchment, each with its full accent
  border and kicker), and must stay that way.
- WCAG 2.1 AA is a requirement. Cream on the brand teal measures ~3.9:1, so
  any *filled* surface carrying small text — the masthead band, primary
  buttons, store pills, active size-picker, board buttons — uses `--teal-dark`
  (6.2:1) with `--teal-deep` for hover; `--teal` stays the accent for chips,
  links, tints, pins and focus rings. Never put cream text on `--teal`.
- Legibility floor for an older readership: no reader-facing text below
  0.68rem, and secondary text (pills, tags, meta) sits at 0.74–0.8rem. The
  single exception is the mobile masthead tagline (0.72rem) so the WPR seal
  stays on its line. Text selection, the caret and tabular figures are
  themed from the palette (`::selection`, `caret-color`, `tabular-nums`).
