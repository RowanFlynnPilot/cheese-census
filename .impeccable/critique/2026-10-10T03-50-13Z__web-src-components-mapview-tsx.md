---
target: the map view
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:9e21682ab8618478713caa5b9d4409bc85ffbb3732372ac71588abbf8c500aa4"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-10T03-50-13Z
slug: web-src-components-mapview-tsx
closed: true
---
**Method: dual-agent (A: design-review agent, live site in its own tab · B: detector + overlay agent, local production preview in its own tab)**

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | A cluster tap zooms silently (two silent zooms on a phone before the chooser); the denied-location note never clears, even after the reader picks the county it suggests. |
| 2 | Match System / Real World | 3 | Emmi Roth's pin sits in Monroe while its panel, chooser row and Open in Maps say Platteville; "Licence" is the British noun; raw DATCP vocabulary rendered as chips. |
| 3 | User Control and Freedom | 3 | No way back to the statewide view: after search → open → clear → Esc the map sits at zoom 10 on Mosinee beside a list of 88, and the only controls are + and −. |
| 4 | Consistency and Standards | 3 | Panel header buttons 28px while everything else is 32–52; the strip's Clear is 32×16 on desktop and 44×44 on phone; eight creameries render "Monroe" with no "Co." beside rows that have one. |
| 5 | Error Prevention | 3 | County counts in the select and the chooser prevent the common mistakes; store + awards + county still dead-ends in a generic message. |
| 6 | Recognition Rather Than Recall | 3 | The map view never renders filters in force as chips (the catalog does); on a phone with the fold closed, county + award winners collapse to "Filters & sort 2". |
| 7 | Flexibility and Efficiency | 3 | ← → with "53 / 88", URL params, deep links, Near me, tel and maps exits. No list↔pin hover link, no zoom-to-results, no reset. |
| 8 | Aesthetic and Minimalist Design | 3 | Coherent and restrained; "88 of 88 creameries" and "88 creameries" sit 20px apart; "Also trades as" lists three spellings of one name. |
| 9 | Error Recovery | 4 | "4 match “Marathon” statewide, none in Burnett County · Show all 4" blames the filter, not the word; Did-you-mean, the denial note and the load error are plain sentences. |
| 10 | Help and Documentation | 3 | A proper About dialog and a chip hint; nothing explains why a pin tap zooms, and the placeholder's worked example truncates at 375px. |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** Authored at the surface, interchangeable underneath. The skin is unmistakably WPR: Fraunces on the dark teal, the typewriter seal, mono figures, folder tabs, the state outline under the pins, store pins as donuts, the gold selected pin, and copy in the paper's dry voice ("Sorted nearest first: Mullins Cheese, Inc. in Mosinee is 17 mi away."). The "makes Gouda" hint and the "who else makes this?" chips are genuine product ideas. The composition is still the category default: list-left, Leaflet-right, facts panel, stock zoom control, a sort select, a hover card. Nothing on the view says *census*: no count date, no enumeration framing, no county geometry on a map whose list sorts by county. The masthead almanac is the one place the census voice could live, and it reads as a stats bar.

**Deterministic scan.** CLI: four files (`web/src/components/MapView.tsx`, `web/src/App.tsx`, `web/src/components/CreameryDetail.tsx`, `web/index.html`), exit 0, zero findings, with a liveness probe confirming the detector fires on a deliberately bad file. Browser scans of the production build: desktop settled at one page-level finding in every state (cream palette on `body`, a false positive: `#f6f2e9` is the WPR brand cream). Phone: the subtitle at 11.52px (the documented attribution trade-off) and, with the fold open, the floating "Show map" pill covering 36% of row seven's meta line at scroll top. The fade added last pass softens that overlap but does not change the geometry the rule measures. Sixteen "buried raster" tiles after the pane flip are the pane's paused animation frames leaving zoom-7 tile containers unpruned, confirmed at the container level, not a wash on the surface. One "nested cards" hit on the sheet bar appeared only at a 300px-wide pane, not at 375px, and is not credited.

**Visual overlays.** The `[Human] Cheese Census map` tab in the browser pane holds the injected detector: the cream banner, the subtitle box and, from a 300px-wide final state, the sheet-bar box. The preview behind it is stopped, so reloading drops the overlay.

## Overall Impression

The score held at 31 because the five issues from the last critique are gone and a fresh reviewer found five new ones of the same weight. The top one is data, not design: a pin in Monroe whose panel, chooser row and maps link say Platteville, which the P0 fix two passes ago did not catch because the plant is in Wisconsin. Behind it sit three map behaviours (silent cluster zooms on a phone, no way back to the whole state, filters in force invisible on this view) and one typographic floor that the older readership keeps bumping into. The strongest work is the copy at the moments that matter and the Near me loop.

## What's Working

1. **The empty states think like an editor.** "4 match “Marathon” statewide, none in Burnett County" admits what the tool hid instead of implying a real place is missing, and "Did you mean" only speaks when it is actually close. This is the one place the view is unmistakably a newspaper's.
2. **Near me is a complete loop.** A true toggle with a pressed state, a status sentence, a "Sort: Nearest" option that exists only when it is real, miles on every row, a legend entry that appears only with the dot, and nothing in storage or the URL. A second press undoes all of it.
3. **Focus discipline.** Skip links move focus, Esc returns it to the originating row with a visible ring and scrolls it into view, the About dialog hands focus back, the chooser takes focus on its first row and Escape hands it to the map, and pins are deliberately not tab stops with an sr-only line saying so.

## Priority Issues

**[P1] The pin and the address disagree, and the phone is not what the schema says it is.**
- **Why it matters:** Emmi Roth USA (`emmi-roth-usa`) is pinned at Monroe (42.610, −89.653; W&W Dairy is 1.3 km away) while its city, county, address and maps link are Platteville, 60 km west; the chooser row under the Monroe cluster reads "Platteville · Grant Co." and Open in Maps routes the reader away from the pin they tapped. Eight active creameries carry no county (Cheese Merchants of America, Clearview Dairy aTwo Cheese, Deer Creek Cheese, Hoard's Dairymen Farm Creamery, Koepke Farms, Maple Leaf Cheese Co, Red Barn Family Farms, W&W Dairy; all DFW-only listings) and render "Monroe" with no "Co." beside rows that have one. The new phone field is DATCP's BusinessPhone, the licensee's business line: 21 of 27 multi-plant companies file one number for every plant, and Anderson International Foods shows (516) 747-2210, a New York number, on its Edgar plant, while `SCHEMA.md` and the `build.py` comment call it "the home plant's number". In Operate mode the pin is the promise and Open in Maps is the task's last step.
- **Fix:** Contact describes the pinned plant (its address, city, county, number) and says so when the company has others ("Pinned: Monroe plant · also Platteville, Stoughton, Seymour"); the maps link routes to the pinned plant. Reword the phone as the business line on the licence and label it so. A curation script (beside `scripts/evidence.py`, never in build) geocodes each displayed city with the Census geocoder and lists pins more than a few km from it, so overrides can settle Emmi Roth and any others. Fill the eight counties from the DFW listing where it carries one, or drop the "·" slot consistently.
- **Suggested command:** `/impeccable harden`

**[P2] Phone cluster taps answer with a zoom, twice, before any chooser.**
- **Why it matters:** the phone overview sits at zoom 6.5, so a tap on the Monroe cluster zooms to 8.5, a second tap to 10.5, and only the third opens the chooser (`CLUSTER_ZOOM` 9, `CHOOSER_RADIUS` 35px in `MapView.tsx`). The hover card is closed on touch, so each zoom is the tap's only feedback, and a silent zoom reads as a missed tap.
- **Fix:** on a cluster tap compute the zoom at which the tapped pins actually part and go there in one move, and show a transient label during the move ("17 creameries here — zooming in") in the existing map-hint style; or open the chooser at once when its list would fit.
- **Suggested command:** `/impeccable clarify`

**[P2] No way back to Wisconsin; the map and the list drift apart.**
- **Why it matters:** search "Mullins" fits the map to one pin at zoom 10; open it, clear the search, press Esc: the list shows 88, the map shows Mosinee, and the zoom control is + and − only. The refit is suppressed while a panel is open (`MapView.tsx` markers effect) and runs on close only if the centre left the state.
- **Fix:** a third control under −, "Wisconsin", that fits the current filtered set; track whether the reader panned or zoomed, and when they did not, refit on panel close.
- **Suggested command:** `/impeccable harden`

**[P2] Filters in force are invisible on the map view.**
- **Why it matters:** the catalog renders every active facet as a removable `.filter-chip`; the map relies on the select's value, two checkboxes and, on a phone with the fold closed, a `.facets-count` badge reading "2". A shared `?county=Marathon&awards=1` link reads as "the census is small" on a phone.
- **Fix:** reuse the catalog's chip row beneath the search row at both breakpoints (county, store, awards, non-default sort), each removable.
- **Suggested command:** `/impeccable clarify`

**[P2] Secondary type and secondary targets sit below the readership.**
- **Why it matters:** pills 11.84px, row meta 12.8px, legend 12.16px, section heads 12.16px, the hover card's body 12.48px with an 11.52px mono address, the chooser head 11.84px. Targets: desktop panel header buttons 28px (`.hbtn` 1.75rem), the Contact website link 17px tall on desktop, the strip's Clear 32×16 on desktop, the chooser × 24px, "Browse all 24 in the catalog →" 21px and the licence summary 22px on phones. PRODUCT.md puts older readers on phones at the floor; the floor is met at 0.68rem but most of the view lives just above it.
- **Fix:** lift non-target secondary text to 0.8rem and anything tappable to 0.86rem; make the licence summary, the "Browse all" link and the website link block-level with a 44px minimum on phones; grow the desktop header buttons to 36px and the chooser × to 32px.
- **Suggested command:** `/impeccable typeset`

## Persona Red Flags

**Jordan (first-timer, desktop):** hovers the Emmi Roth pin, reads a card naming one creamery, clicks, and the map zooms instead of opening; nothing explains the rule. Reads "88 of 88 creameries" and "88 creameries" and wonders which counts. Reads "LICENCE DETAILS (2 PLANTS)", "Monterey/Monterey Jack" and "class 12" as jargon, and "Also trades as: MULLINS' CHEESE, INC. · Mullins' Cheese, Inc. · Mullins' Cheese/Mullins' Whey" as a glitch. After Esc, hunts for a whole-state button that is not there.

**Casey (one-handed phone):** the first screen is fine, every target 44px. Flips to the map, taps the Monroe cluster three times before a chooser whose × is 24px in the far corner. In the sheet, "Browse all 24 in the catalog →" is 21px tall and the licence summary 22px; the attribution shares the pill's row.

**Sam (screen reader, keyboard, 200% zoom):** skip links good. The panel takes focus with no visible outline, so a sighted keyboard user loses the cursor until the first Tab; "53 / 88" is an unlabelled span; the chooser is a popup, not a dialog, so its heading is never announced; Escape lands on the map container with the browser's default outline; the county select is 36 options with no narrowing.

**Marlene, 71, Weston print subscriber planning a Saturday curd run at 125% zoom (from PRODUCT.md):** Near me gives her the perfect sentence. The 11.84px pills, 12.8px meta and 28px panel buttons are hard; the hover card's mono address is unreadable to her. "Retail store" says a shop exists, not whether it is open Saturday, so the task ends in a phone call, which the tel link now makes possible. If she picks Emmi Roth from the Monroe cluster she drives to Platteville. She wants to print her short list; the board can print, the map cannot.

## Minor Observations

- The denial note persists indefinitely, including after the reader picks the county it suggests.
- Near me's success path runs two animations: the re-sorted list re-creates the markers and reframes to the overview before the dot's own `setView` lands on the reader. Keying the refit on set membership rather than order would fix it.
- The "Selected" legend swatch shows when nothing is selected.
- Anderson International Foods' deep link is `#harmony-cheese`, the id taken from the licensee's name; ids are frozen, so this stays.
- County select counts are static totals regardless of search or checkboxes.
- With zero pins the map falls back to the centre at zoom 7, visibly wider than the 88-pin fit, so the two frames jump.
- The search placeholder truncates at 375px ("Search creameries — tr"), losing the worked example.
- "28 match “gouda”" scans oddly beside a mono numeral; "28 creameries match" would not.
- The hover card is the best-authored element on the map and it is mouse-only.
- The almanac reads 1,059 cheeses while the docs say 1,069; the browsable set is the design, but a reader cross-checking with the article may stumble.
- The subtitle's 0.72rem on phones remains below the detector's line; "Licence" remains British; "Tap a type…" still speaks to a mouse.
- The floating pill still covers a row's meta at scroll top with the fold open (detector-confirmed); only a bottom bar instead of a floating pill would end that.

## Questions to Consider

- If the pin is a plant and the Contact block is a headquarters, which one is the census counting, and should Contact ever show an address the pin does not stand on?
- The list is the keyboard's path to every creamery. Why isn't it the thumb's? A cluster tap could filter the list to "these 17" instead of zooming a map that is about to need two more taps.
- The catalog earned filter chips, worked examples and a "from …" crumb; the map earned Near me and a result strip. What stops the two views from sharing one filter-state language?
- Six figures ride the masthead on every view. Who are they for: the reader on the map needs one number, the sponsor a headline, the editor a dashboard?
