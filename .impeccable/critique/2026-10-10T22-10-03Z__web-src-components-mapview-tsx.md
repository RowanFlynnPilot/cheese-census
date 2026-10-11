---
target: the map view
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:9c0ad2add8d0a186283af86134e001c72b2ba2ff37cfca0af5a1643ed24bf492"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-10T22-10-03Z
slug: web-src-components-mapview-tsx
closed: true
---
**Method: dual-agent** (A: design-review sub-agent, built-in browser plus Playwright captures · B: detector sub-agent, CLI scan plus headless Playwright injection; the pane's tab cap blocked a live overlay tab)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Nothing says the map has reached its zoom cap; after a panel closes the view silently stays wherever the pan left it. |
| 2 | Match System / Real World | 3 | "plant", "Licence" (British spelling, DATCP says "license") and a button that only says "Wisconsin" reach reader copy. |
| 3 | User Control and Freedom | 3 | Closing a panel does not bring the state back; "Wisconsin" with a county filter on frames four pins while its title promises the state. |
| 4 | Consistency and Standards | 3 | On touch a map tap either filters (county) or opens (pin) with no visual difference between the targets; pins are kept out of the Tab order by design, counties are in it by accident. |
| 5 | Error Prevention | 3 | The + control walks a reader into a blank map; a burst of + presses is partly dropped. |
| 6 | Recognition Rather Than Recall | 3 | Three ring sizes are explained only by a hover-only `title` on the legend; nothing on touch says a county is tappable. |
| 7 | Flexibility and Efficiency | 3 | URL state, chips, ←/→ stepping, county tap, Near me; but the map's controls are the ~100th Tab stop and there is no skip-to-map. |
| 8 | Aesthetic and Minimalist Design | 3 | The southern overview is a thicket of gold rings; the phone map stacks legend, three controls, the pill and the attribution. |
| 9 | Error Recovery | 4 | "4 match “Marathon” statewide, none in Burnett County · Show all 4 · Clear the search" is the model; denied location hands off to the county select. |
| 10 | Help and Documentation | 2 | No visible explanation of pin size, of "In the cheese catalog" vs "Licensed to make", or of the zoom limit; the phone's meaning is a tooltip. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** Authored, not borrowed. The basemap now sits in the house cream and teal with Public Sans labels, the state and county lines are the paper's teal, the masthead reads as a newspaper almanac, figures sit in mono, and the copy is unmistakably WPR's ("The Monroe plant is pinned; also licensed in Platteville, Stoughton and Seymour."). The pin grammar is a real encoding, not a marker icon. The chassis is standard by choice (list left, map right, Leaflet +/−, Show map pill), which PRODUCT.md asks for. The missed opportunity is inside the map pane: once the eye leaves the masthead only the palette says WPR. The overview reads as a dot-density chart of contest wins, the county layer draws no county names although the list, select and sort are all county-first, and there is no editorial geography at all (Green County, the Fox Valley) in a product whose claim is that a newspaper made it.

**Deterministic scan.** The CLI detector is clean on all three files and on the stylesheet: zero primary, zero advisory, with and without project config. The reviewer proved the zero is meaningful by confirming the detector fires on planted CSS and Tailwind anti-patterns, and noted it cannot see JSX style objects, of which these files have ten harmless ones. The in-page detector found two to three items per state. Leaflet's attribution control is flagged for cramped padding in every state (it is the library's own `padding: 0 5px`, 12 px type), the cream page background trips the generic cream-palette rule (that is the brand), and on phones the masthead subtitle measures 11.52 px. That last one is a true measurement: it is the one line the stylesheet deliberately keeps below the floor, documented as attribution rather than content.

**Visual overlays.** No user-visible overlay exists. The browser pane's tab cap blocked a fresh tab, so injection ran headless; the overlays are recorded in four screenshots in the critique scratch folder rather than in a [Human] tab.

## Overall Impression

The map is now a WPR object, and the hard data problems of the last three critiques are gone. What is left is two framing failures that hit the two most common arrivals: an article's deep link to a southern creamery lands the reader on Illinois, and zooming in to see a place lands them on blank polygons because the new basemap's roads are white on cream. Fix those two and the remaining issues are keyboard hygiene and sidebar grouping. The single biggest opportunity is the hand-off line between this map and the reader's maps app: decide where it is and say it on the map.

## What's Working

- **The pin and the panel agree, and the copy says so.** Contact names the pinned plant and the others in one plain sentence in the place the doubt arises; the licence fold marks it. Honest where it matters.
- **The empty state names its cause and ranks its undos.** Every number on screen corroborates it (masthead "0 of 88", the fold button's count), so nobody concludes the census is small.
- **The phone cluster tap explains its own movement.** "12 creameries here — zooming in", then "3 creameries here — pick one" with 50 px rows. Zoom resolves what zoom can, the chooser resolves the rest, and the reader is told which is happening.

## Priority Issues

1. **[P1] A deep link to a southern creamery frames Iowa and Illinois, and Escape leaves it there.** Opening `#emmi-roth-usa` or Hook's pans at zoom 7 with the half-panel offset, so the visible strip shows Cedar Rapids, Davenport and Peoria with Wisconsin's edge at the top (verified in the capture). On close the centre is still inside the state bounds, so the refit never runs and the reader is left over Indiana. **Why it matters:** readers arrive from articles by deep link, on the creamery the article is about; the first thing they see of a census of Wisconsin cheese is another state. **Fix:** on select, fit the pin together with the state outline using a bottom-right padding of the panel width, so the state stays in the visible strip; on close, refit when less than about 60% of the visible area is in-state, not only when the centre leaves it. **Suggested command:** /impeccable layout

2. **[P1] Roads are invisible on the basemap, so zoom 11 and beyond reads as blank polygons.** Major roads and highways paint white on cream, about 1.1:1, and minor roads 1.03:1; at zoom 9 to 12 the map shows towns, county lines and rivers but no legible road network and no highway numbers, and at the cap it is flat land-cover shapes with a greyed + and no word why. The detector cannot see a canvas, so this is design-review evidence only, confirmed in the captures. **Why it matters:** "is it on the way?" is the question a weekend visitor asks a map; an older reader reads blank polygons as the map breaking. **Fix:** lift major roads and highways to a warm grey in the flavor (keep the cream casing), enable highway shield labels from zoom 9, leave minor roads faint; then re-judge the cap, and at the cap say so where the zoom label lives ("That's as close as the census map goes · Open in Maps for streets") with the maps link when a creamery is selected. **Suggested command:** /impeccable colorize, then /impeccable harden for the cap message

3. **[P2] County outlines are 72 inert keyboard stops wearing the browser's orange ring.** After the map container, Tab lands on each county path: Leaflet binds focus and blur listeners for the tooltip, and Chromium treats an SVG element with focus listeners as focusable. Each stop shows Chromium's default ring around the county's bounding box and Enter does nothing (verified: no chip, no filter). Today's CSS rule quiets only pointer focus, and its comment claiming the counties are not keyboard-focusable is wrong. **Why it matters:** a keyboard or screen-reader user gets 72 unnamed, inoperable stops between the map and the zoom buttons, in a ring that is not the house teal. **Fix:** set `tabindex="-1"` on each county path when the layer is built (keeps click, leaves the Tab order), keep the county select as the keyboard path, and add "Skip to the map" beside "Skip to the creamery list". **Suggested command:** /impeccable harden

4. **[P2] A burst of + presses collapses to fewer steps.** Seven taps 80 ms apart moved the phone map about three steps; seven taps 700 ms apart moved it seven. Leaflet computes each zoom-in from the zoom at the start of the running animation, so presses during it retarget the same level. **Why it matters:** older readers tap + repeatedly, the map falls behind the thumb, and the mismatch reads as unresponsiveness. **Fix:** own the zoom buttons: accumulate a pending target (`min(MAX_ZOOM, (pending ?? zoom) + 1)`) and animate to it; the "Wisconsin" control already owns its own move. **Suggested command:** /impeccable harden

5. **[P2] The sidebar groups by control type, not by the reader's question.** Near me is a sort but sits two rows from the Sort select with two filters between; once pressed, the select silently grows a "Nearest" option. The legend explains the three ring sizes only in a hover title, so on touch there is no explanation at all. On phones the two filters a visitor wants, Retail store and Award winners, fold behind "Filters & sort" with no hint of what is inside. **Why it matters:** the one control built for the weekend visitor is a quiet outlined pill, and the encoding readers see most (ring size) is never stated where they can read it. **Fix:** put Near me on the sort row; write the pin rule into the legend ("Award winner · bigger with more wins") and into the sr-only note; name the fold's contents on phones ("Filters & sort · county, store, awards"). **Suggested command:** /impeccable layout for the grouping, /impeccable clarify for the legend and fold copy

## Persona Red Flags

**Casey (one-handed phone):** zoom, "Wisconsin" and the phone's Near me button stack at the map's top left, the far corner from a right thumb; only "Show list" is in reach. A burst of + taps lags (issue 4). The search placeholder truncates to "Search creameries — try “lim", so the one worked example is lost; with a chip set it ends at "try". At zoom 10 in Monroe the chooser's × sits beside a 44 px "Emmi Roth USA" row, easy to hit instead.

**Jordan (first-timer):** reads "Licence details (4 plants)", "Licensed to make" and "In the cheese catalog (23)" and is never told what a plant is or how the two cheese lists differ. Sees three ring sizes with the explanation hidden in a hover title. Reads a button that says only "Wisconsin" and wonders if it is a label. Hovers "Rusk County · no creameries in the census", clicks, and nothing happens.

**Sam (screen reader, keyboard, 200% zoom):** the Tab path to the rows is clean (skip links, tabs, search, county, sort, two 13 px checkboxes, Near me, rows), Enter opens the panel with focus and Escape returns it to the row (verified), and the result strip and nearest line are live regions. Then the map container is stop ~100 and the next 72 stops are county paths with no name and no action (issue 3). No skip-to-map. At 200% the view takes the phone branch, so the map is behind "Show map" and the filters behind the fold.

**Pat (WPR reader, late 60s, phone, from an article, wants a creamery this weekend):** arrives on an A–Z list that opens with Agropur, Inc., a corporate plant. Zooms in to see where the shop is and gets polygons (issue 2); taps + and the map falls behind (issue 4). Row meta at 13.4 px, the legend at 12.5 px, the chooser head at 12.5 px mono caps and the panel's h3 at 12.8 px all sit at the floor PRODUCT.md sets for these eyes; the name, the sheet body and the 44 px "Open in Maps" and phone links are right. No hours anywhere, and nothing says so.

## Minor Observations

- Leaflet's attribution control is the one brand-foreign element on the map (12 px default face, the flag glyph, `padding: 0 5px`); the detector flagged its padding in every state and the design review called it out independently. Restyle it in the house face at the legibility floor, cream background, real inset.
- "Wisconsin" with a county filter in force frames the filtered pins, not the state; its title promises otherwise.
- "Open in Maps" and the phone link draw their underline as a border on an inline-flex box, so it floats about 10 px under the text as a detached rule.
- The hover card sets the street address in JetBrains Mono; an address is not a figure.
- The "You" dot covers the Wausau label when the reader is in Wausau.
- The chooser head is mono uppercase ("3 CREAMERIES HERE — PICK ONE"), a data label for a sentence.
- Wheel zoom is off on the standalone page too; turn it on when the page is not framed.
- The legend grows "Selected" and "You" on demand, changing width under the reader's eye.
- During an empty search the county select still says "Burnett (1)" while the masthead says "0 of 88"; the option counts are unfiltered totals and nothing says so.
- "Licence" is British spelling throughout; DATCP's own word is "license". An editor's call, but it is reader-facing.
- The masthead subtitle at 11.52 px on phones is the detector's one true measurement; it is attribution, not content, and the stylesheet says so. Leave it unless the editor wants the floor absolute.

## Questions to Consider

- Is the overview a map or a chart? Eighty-eight pins in three ring sizes at zoom 7 is a dot-density chart of contest wins. If the reader's question is "where can I go on Saturday", should the default frame be the forty-odd retail stores with the rest one tap away?
- The census owns "which creamery"; Google and Apple own "which road". Where exactly is the hand-off line, 11, 12 or 14, and should the map say it out loud instead of fading into polygons?
- The list, the select and the sort are county-first, yet the basemap never writes a county's name. Should the county layer label itself from zoom 8 so the map speaks the same unit as the list?
- An article links to one creamery. Should that deep link open on that town at zoom 10 with the sheet up, rather than the statewide view panned toward Illinois?
