# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary (confirmed): Wausau Pilot & Review's general readership, arriving from
a story or the paper's site, mostly on phones. They browse casually — find a
creamery near them, look up a cheese they just ate, save a few, maybe build a
board — rather than arriving with a task list.

Secondary (evidenced by the product, not confirmed as a design target):
planners and enthusiasts who use the depth (facets, contest records, the
similarity lists); and the newsroom itself, which curates the census through
hand-edited data files and email submissions.

## Product Purpose

An evergreen statewide database of Wisconsin creameries and the cheese they
make — every licensed creamery, its cheeses, its master cheesemakers, its
contest record — with reader tools on top: a map and directory, a product-level
catalog with similar-cheese matching, hearts, and a cheese board builder.

Success (confirmed) is an **engagement franchise**: readers return, save
cheeses, share boards, submit their own, and sponsors fund it. Return visits,
saves, and shares are the measure; authority and local commerce follow from it.

## Positioning

The only product-level census of Wisconsin cheese: built deterministically from
the state licence file (DATCP), the consumer directory (DFW), the Master
Cheesemaker roster, and championship results, then edited by a newsroom. The
industry directory lists cheese *types* per company; the census lists named
products, links them to contest wins, scores what tastes alike, and turns that
into a board you can go buy. Published by a newspaper, free to read, with an
editorial voice a trade body cannot use.

## Operating Context

- Lives today on GitHub Pages as a review copy (provisional-data banner,
  `noindex`); the planned home is a WordPress iframe embed inside
  wausaupilotandreview.com articles after editorial review. An iframe needs a
  fixed height and must not hijack page scroll (the map's wheel-zoom is off
  for that reason). Whether the embed or the standalone page is the primary
  surface is not yet decided.
- Readers arrive from articles; the newsroom curates through validated,
  hand-edited files (`data/overrides/`, `data/highlights.json`,
  `data/sponsors.json`, `data/boards.json`) — every build either passes every
  validation or fails loudly.
- Reader boards are submitted by email to the newsroom
  (editor@wausaupilotandreview.com) with the board's share link and a photo;
  an editor curates them into the gallery. Sponsors buy labeled surfaces.

## Capabilities and Constraints

Three views under one masthead: the creamery map and directory (filters,
sort, hover cards, detail panels); the cheese catalog (facets with counts,
tokenized search, four sorts, cards with flavor chips and award citations,
detail panels with facts, contest record, similar cheeses); the cheese board
builder (3/5/7 boards, balance meter, ranked suggestions with "what this adds"
chips, one-tap complete, seed from hearts, shareable-by-URL, printable
shopping list, featured-board gallery, sponsor slot). Hearts and boards live in
`localStorage` and mirror into the URL only when shared; nothing leaves the
browser until a Supabase engagement layer exists.

Binding constraints: data is provisional until editorial review (banner stays);
product photos publish only with each creamery's permission (a dev-only draft
overlay shows them internally); shop descriptions render as short attributed
quotes; creamery logos ride the same draft overlay pending rights review;
cheese ids are frozen (hearts key on them); vocabularies are closed; builds are
deterministic; editorial and sponsored content render visibly differently;
nothing unreviewed reaches readers.

Undecided (recorded, not invented): opt-in vs notice-and-opt-out for photos
(attorney's call, both outreach drafts exist); self-serve board photo upload
(waits for Supabase plus a moderation workflow); embed timing and height.

## Brand Commitments

- Name: **The Cheese Census**. Standing subtitle: "A census of Wisconsin
  cheese, from Wausau Pilot & Review" — no "the" before the paper's name;
  "Wisconsin" never appears in the mark itself.
- The WPR design system is binding (volunteered as a constraint): teal
  `#3A867C`, cream `#F6F2E9`, Fraunces for display, Public Sans for body,
  JetBrains Mono for figures. The WPR typewriter seal
  (`web/public/wpr-typewriter-badge.png`) rides the attribution line. Nothing
  may gesture at Dairy Farmers of Wisconsin's badge or trade dress.
- Always rendered with WPR attribution. Voice is the paper's: plain, dry,
  specific. Attorney review before the name appears on sponsor contracts.

## Evidence on Hand

- Real, validated data in `build/*.json`: 89 creameries, 1,069 cheeses (446
  named products + 623 plain variants), 61 master cheesemakers, 299 contest
  awards; one editorial highlight; one house sponsor entry (WPR's own — no real
  sponsor yet); one cheese-desk featured board (no reader boards yet).
- 362 harvested product photos and maker blurbs in `queue/product_images.json`
  — a permission queue, **not publishable**; 72 creamery logos likewise.
- Absent, and not to be fabricated: sponsor brands, reader testimonials,
  reader-submitted boards or photos, engagement counts, editorial descriptions
  for 623 cheeses (generation pending).

## Product Principles

1. The data is the product: every fact traces to a source or an editor, and a
   number that can't be trusted is not shown.
2. Engagement without surveillance: personal state stays in the browser; a
   share is an explicit act, and the link is the payload.
3. Newspaper honesty on the surface: provisional means labeled, sponsored means
   labeled, quoted means attributed.
4. Legible first: older readers on phones set the floor — type size, contrast,
   and target size win over density.
5. A familiar tool with a distinct voice: standard affordances everywhere, the
   paper's dry editorial voice in the copy, delight saved for moments.

## Accessibility & Inclusion

WCAG 2.1 AA is a requirement (contrast, visible focus, keyboard paths,
screen-reader names), not an aspiration. The readership skews older: favor
legibility — larger type, strong contrast, generous touch targets — over
density, and never rely on color alone to carry state.
