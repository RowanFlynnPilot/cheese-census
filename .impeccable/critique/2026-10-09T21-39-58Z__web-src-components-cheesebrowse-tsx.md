---
target: the catalog view
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\CheeseBrowse.tsx"
target_fingerprint: "sha256:5d312e37f1d4e07f9a5d0c9776500ac4372aea24072c21f3926784c38c5c91d4"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\CheeseBrowse.tsx"
timestamp: 2026-10-09T21-39-58Z
slug: web-src-components-cheesebrowse-tsx
closed: true
---
**Method: dual-agent** (A: isolated design-review agent, live site at desktop and phone widths · B: isolated detector agent, CLI scan plus overlay injection on a local production preview).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | The result count lives in the masthead corner, far from the search box; on a phone an active facet reduces to a "1" badge |
| 2 | Match System / Real World | 3 | "Brined", "Pasta filata", "Semi-soft table" and "similarity engine" go unglossed; "651 / 1059" is a database counter |
| 3 | User Control and Freedom | 3 | Escape, back bar and Clear all exist, but a facet set from a link has no visible chip to remove; only the maker filter does |
| 4 | Consistency and Standards | 3 | The maker filter is a chip, family/texture/milk are not; the sheet has two closes (× and the back bar) |
| 5 | Error Prevention | 3 | The board-full sentence is exemplary; the truncated placeholder drops the one worked example |
| 6 | Recognition Rather Than Recall | 2 | With the fold closed nothing says which filter is on; the sort lives inside the fold |
| 7 | Flexibility and Efficiency | 3 | Tokenized search, URL params, arrow stepping, chip-to-search; no example chips, no near-matches |
| 8 | Aesthetic and Minimalist Design | 2 | A card carries seven slots; the phone citation strip wraps to five lines; the sheet header is 187px of sticky toolbar |
| 9 | Error Recovery | 2 | A misspelled search says "No cheeses match those filters"; "Couldn't copy" shows no URL in the panels |
| 10 | Help and Documentation | 3 | Chip hints and About exist; the heart is unexplained until the shelf is empty |
| **Total** | | **27/40** | **Acceptable (top of the band)** |

## Design Specificity Verdict

**LLM assessment: half-authored.** The surface language is unmistakably this product's: Fraunces names, the gold rosette with a spelled-out citation, six flavor families with drawn glyphs, "From the cheese desk", "(invented here)", "Tap a note or an ingredient…". The composition is category-generic: search, four selects, three checkboxes, card grid, right drawer. The product-specific problem it never solves is structural sameness: under the family sort, ten consecutive "Aged Cheddar" cards wear identical chips and the only differentiator, the maker, is 12px grey; the similar list repeats "Habanero Jack" three times. The 623 plain variants are real data rendered as duplicates.

**Deterministic scan:** CLI detector: 0 findings across CheeseBrowse.tsx, CheeseCard.tsx, CheeseDetail.tsx. Browser overlays on three states: catalog top (1: cream-palette banner, false positive — committed palette); record open (13: banner + 12 text-occlusion hits, all grid text behind the intended detail drawer — false positives as a class; the drawer covers ~40% of the grid at 1280px); phone with facets open (2: banner + tiny-text 11.52px on the masthead subtitle — real and documented as the one deliberate exception; converges with the review's broader finding that secondary text sits at 11–12px).

**Visual overlays:** injected successfully on all three states; left open in the [Human] tab (local server since stopped).

## Overall Impression

The catalog is honest and well-built, and its first screen on desktop earns trust immediately: contest winners first, every claim cited. What it does not yet do is answer the reader's question on a phone: a masthead, a truncated search box, an editorial plug, and one and a half cards. The single biggest opportunity is to make the search the hero on arrival and to make the state of the catalog legible at all times: which filter is on, why the list is short, what to try when nothing matches.

## What's Working

- **The award treatment.** Seal plus citation plus the "Most awarded" default turns contest data nobody else surfaces into the credibility layer of the first screen.
- **The flavor system.** Family-coloured chips with drawn glyphs, and chips in the panel that become statewide searches.
- **The accessibility bones.** Constant-name hearts with aria-pressed, an inert page under the phone sheet, focus that returns to a visible control, a status region for copy, 44px sheet toolbar and fold controls on phones. Confirmed live.

## Priority Issues

- **[P1] Active facets are invisible on a phone.** CheeseBrowse.tsx 200–215, 264. `?milk=goat` shows "20 of 1,059" and a "1" badge with no visible cause or undo. **Fix:** render every active facet (family, texture, milk, non-default sort, toggles) as a removable chip in `.active-filters` beside the maker chip, both breakpoints. **Suggested command:** /impeccable clarify
- **[P1] A search that finds nothing is reported as a filter error.** CheeseBrowse.tsx 391–412; the highlight band (316–337) persists over the void. **Fix:** branch on the query ("Nothing called 'zzzz'. Try a maker ('Hook's'), a flavor ('smoky') or a county."), show the three nearest names from the search index, hide the band when the result set is empty. **Suggested command:** /impeccable clarify
- **[P1] Family-sort group heads count the rendered slice, not the result.** CheeseBrowse.tsx 378–382 groups `slice`; live, Cheddar read "116" of a real 239, then "212" as the page grew. **Fix:** count from `shown`/`familyCounts`, render from `slice`; put the count beside the label. **Suggested command:** /impeccable harden
- **[P2] The phone sheet header leaves 570px for the record.** CheeseDetail.tsx 106–186, styles.css 734–741: 187px sticky header plus the 52px back bar, two closes, a mono counter, prev/next over 1,059 rows. **Fix:** below 760px stick only the title row; move position/prev-next into the bottom bar or drop them; let the board button scroll. **Suggested command:** /impeccable layout
- **[P2] Secondary text at 11–12px, and the maker is the smallest thing on a card.** styles.css 1353 (`.cheese-maker` 12.16px grey), facts labels 11.2px, citation 11.84px, rail caption 12px, subtitle 11.52px (detector). Repeated names leave the maker as the only differentiator. **Fix:** `.cheese-maker` to 0.86rem ink; facts labels, citation and rail caption to ≥0.78rem; lead with the maker when a name repeats in view. **Suggested command:** /impeccable typeset

## Persona Red Flags

- **Casey:** fold and selects at the top, out of thumb reach; detail flavor chips are 18px-tall buttons under a hint that says to tap them; "Show more" is 30px; × top-right.
- **Sam:** duplicate accessible names ("Save Feta to my cheeses" ×2, HeartButton.tsx 19 omits the maker); each award announced twice per card (seal role=img + citation); masthead count aria-live fires per keystroke; facts labels 11.2px.
- **Jordan:** family names unglossed; "Most awarded" unexplained; the heart unexplained; "similarity engine".
- **Pat (68, from a story, phone):** truncated placeholder; 12.48px tab labels in 29px rows; the editorial band before any result; the sheet opens on a toolbar of glyphs and a counter before the name; "The facts" is a table with no sentence (623 descriptions pending).

## Minor Observations

- "Add to the board" is a 12.8px outlined pill — secondary clothing on the primary action; no path to the board after adding.
- The first save deserves a 1.5s inline "Saved — 2 in My cheeses", not a colour change and a far-corner count.
- The highlight band ignores the active filter (a cow-milk muenster under milk=goat; a Cedar Valley plug under the Hook's maker filter).
- "Goat milk" repeats on all 20 goat cards when the facet already says so.
- The "+1" dashed ghost reads as a button; "Sort: Most awarde" clips in the phone fold; two-line kickers misalign neighbouring card names; "…in the catalog →" orphans its arrow.
- "Couldn't copy" in the two detail panels offers no URL to select, unlike the board.
- "To try next" with one heart recommends the same creamery's near-identical feta; gate on ≥2 saves. The shelf has no "My cheeses" heading and shows suggestions above the reader's own list.
- Similar-cheese scores cluster 90–100, so every bar reads as full.

## Questions to Consider

- Why does a newspaper's catalog open on contest winners rather than on the reader's question? Should stories carry `maker=` links and the cold arrival make search the hero with example chips?
- Should plain variants collapse to one row per type ("Aged Cheddar — 12 creameries") so only named products get cards?
- If sponsored highlights are the business model, where does that card sit without being the first thing Pat sees on a phone?
- Is a "95" the reader can't act on better than "same family, same add-in, different county"?
