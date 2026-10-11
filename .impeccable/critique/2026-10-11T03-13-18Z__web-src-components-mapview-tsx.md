---
target: the map view
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:b79d678f23399bb327aceab04b289e9f07e7174077472f680449c56e76a3a502"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-11T03-13-18Z
slug: web-src-components-mapview-tsx
---
**Method: dual-agent** (A: design-review sub-agent, Playwright captures at desktop, Pixel 7, 375 px and a simulated embed; B: detector sub-agent, CLI scan plus headless Playwright injection. The pane's tab cap blocked a live overlay tab for both.)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Every state change has a sentence, but on the phone's map pane a county filter in force is invisible: the masthead says "4 of 88" and nothing on the map says why. |
| 2 | Match System / Real World | 3 | "Wisconsin" (aria "Show all of Wisconsin") refits the filtered set, not the state; the "also trades as" line dumps licence-name variants in capitals. |
| 3 | User Control and Freedom | 2 | A press on + at the cap poisons the next refit, so "Wisconsin", Near me off and a filter change snap back to zoom 14; the phone county trap has no way out on the map pane. |
| 4 | Consistency and Standards | 3 | The sheet's Contact links draw their underline 20 px below the text, unlike every other link; Near me state is shown three ways. |
| 5 | Error Prevention | 2 | At the desktop overview 33 of 88 dot centres sit inside a neighbour's 28 px hit box: hovering Emmi Roth's dot shows Maple Leaf's card and clicking opens Maple Leaf; a thumb 24 px from a pin filters the state to one county. |
| 6 | Recognition Rather Than Recall | 3 | Place names, shields and the legend's pin rule help; pins stay anonymous dots at every zoom, and the "You" dot covers the "Wausau" label. |
| 7 | Flexibility and Efficiency | 3 | Stepping, Shift+zoom, deep links, county tap, chip hand-off; Near me one tap from both panes. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and handsome; the legend grows with "Selected" and slides under the open panel; at 375 px the filter block is three rows of air around Near me. |
| 9 | Error Recovery | 3 | The empty states are the best copy in the product, but "Did you mean" for "Hooks chese" offers Alpinage, Arena and Brunkow and not Hook's. |
| 10 | Help and Documentation | 3 | The About panel is thorough; the phone number's "business line on the licence" label lives only in a hover title; nothing says a county is tappable. |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** Authored for this product. The basemap is OpenStreetMap repainted in the WPR palette with Public Sans labels and route shields, the state and county lines are the same geometry the select, the sort and the chips use, award winners wear the house gold, and the copy is the paper's throughout: "As close as the census map goes", "The Monroe plant is pinned; also licensed in Platteville, Stoughton and Seymour", a reset control called "Wisconsin" rather than "Reset". What a dairy co-op's store locator could still run unchanged is the chrome: the Leaflet zoom stack and attribution strip, the generic crosshair, the dot/donut/ring pin vocabulary, "Open in Maps" and "Copy link" as the panel's verbs. The missed character is on the map itself: the counties are mute lines until hovered and never carry a name or a count, and the overview sets Minneapolis, Rockford and Chicago at Wausau's weight, so the first frame reads "Upper Midwest with an outline" more than a map of Wisconsin.

**Deterministic scan.** The CLI detector is clean on the three markup files and on the stylesheet, with and without project config, and the reviewer proved it fires on planted anti-patterns. The in-page detector found five distinct items across six states: Leaflet's attribution control's zero vertical inset (vendor CSS, no project rule), the cream page background (the brand token), the masthead subtitle at 11.52 px on phones (the one line the stylesheet deliberately keeps below the floor), the eighth list row sitting under the phone's floating "Show map" pill at the initial scroll position (real geometry, mitigated by the fade and the list's bottom padding), and an occlusion report on the zoom-cap label that is a false positive: the label is `pointer-events: none`, so the detector's hit test lands on the county path beneath it while the paint order and the screenshot show it fully legible.

**Visual overlays.** No user-visible overlay exists; the tab cap forced headless injection, so the overlays are recorded in six screenshots in the run's scratch folder rather than in a [Human] tab.

## Overall Impression

The last pass fixed what it set out to fix and left two things broken: a press on + at the cap leaves a pending zoom that undoes the next refit, and the deep-link framing that looked right at 800 px tucks the pin in the strip's corner at 1280 px with Minneapolis centred. Alongside those, the review found a pre-existing fault that matters more than either: at the overview a third of the pins cannot be pointed at reliably with a mouse, because 28 px hit boxes overlap and the topmost one wins the hover and the click. The product's voice and copy are now its strongest asset; the map's hit-testing and framing are what hold the score at 28.

## What's Working

- **The basemap is the census's own.** Map, pins, counties and chrome share one palette and one type family, served from the site's own extract, so the view reads as a newspaper page rather than a widget on tiles.
- **The copy explains the system's state in the paper's voice.** "28 match “gouda” · Clear", "Sorted nearest first: Mullins Cheese, Inc. in Mosinee is 17 mi away.", "12 creameries here — zooming in". Specific nouns and figures for every state change.
- **The thumb path was built from the tap.** Cluster tap, chooser popover with 50 px rows and focus on the first, a 44 px bottom bar, an inert page beneath the sheet, Escape and focus restore that work. Keyboard order is sound, including the new skip link and the counties out of the Tab order.

## Priority Issues

1. **[P1] On desktop, what you point at is not what you get in the clusters.** At the overview 33 of 88 dot centres fall inside another pin's 28 px hit box; the review hovered Emmi Roth's dot and got Maple Leaf Cheese's card, clicked and got Maple Leaf (also Hook's → Brunkow, Klondike → Wisconsin Cheese Group, Agropur → Malcore). The chooser never fires because its radius is measured from the pin that caught the click, not from the cursor. **Why it matters:** the hover card is how a desktop reader identifies a pin, and a census that names the wrong creamery for a third of its pins loses its authority. **Fix:** resolve hover and click to the pin nearest the cursor among those whose hit boxes contain it, and open the chooser when two centres sit within 14 px of the cursor; measure `under` from the pointer's container point, not the caught pin. **Suggested command:** /impeccable harden

2. **[P1] A press on + at the cap poisons the next refit.** At zoom 14 a press sets the pending target to 14 and asks for a zoom that never fires an end event, so the target lingers; the next programmatic zoom-out ("Wisconsin", Near me off, closing a panel, a filter change) ends with the zoom-end handler zooming straight back to 14. The override also dropped Leaflet's disabled guard, so the greyed button still takes presses. The same Leaflet behaviour drops a refit asked mid-animation: Burnett + "Marathon" left the map zoomed into an empty Burnett County instead of refitting. A regression from the last pass. **Why it matters:** the map appears to refuse to return to the state. **Fix:** never set a pending target equal to the current zoom, clear it when a programmatic move starts, honour the disabled state, and give the frame-and-pan path the same queue the buttons got. **Suggested command:** /impeccable harden

3. **[P1] The cold deep link still frames the wrong place at desktop widths.** A true cold load of `#emmi-roth-usa` at 1280×800 skips the overview fit (a selection is already set), then pans the pin only into the strip's padded corner: the gold pin sits bottom-right beside the panel edge, the visible strip is centred on Minneapolis and Rochester, and the list is unscrolled with the selected row off screen. The last pass's fix held at narrower panes, where the panel covers the map and the pin is centred. **Why it matters:** this is how most readers arrive, on the creamery the article is about. **Fix:** on arrival with a hash, frame the town, zoom 10 with the pin centred in the visible strip, and scroll the list to the selected row; keep the minimal pan for selections made from the overview. **Suggested command:** /impeccable layout

4. **[P1] The phone county trap, and a "Wisconsin" that is not Wisconsin.** A thumb 24 px from the Mosinee pin lands on Marathon County: the list filters to 4, the map zooms into the county, nothing on the map pane names the filter (the chips live on the hidden list pane), and "Wisconsin" refits the same four pins because it frames the shown set under a label and an aria name that promise the state. **Why it matters:** Casey and Pat tap pins with thumbs; a miss by a thumb's width silently empties the state and the one button that promises the way back does nothing. **Fix:** "Wisconsin" frames the state's bounds and clears a county filter in force (or is relabelled while filtered); mirror the filter chips onto the map pane under the legend with their ×; on coarse pointers nothing says a county is tappable, so either say so in the tooltip-equivalent or ask ("Filter to Marathon County · 4 creameries?"). **Suggested command:** /impeccable clarify

5. **[P2] Reassurance is thin at the moment a reader decides to drive.** Contact gives an address, "Open in Maps", a phone and a website; no hours, no sentence that there is a shop at this door beyond a 0.8rem pill, and the phone is the licence's business line labelled only through a hover title, invisible on touch: Anderson International Foods in Edgar shows a New York number. **Why it matters:** this is the only thing between Pat and a ninety-minute drive to a plant gate. **Fix:** a visible label ("Business line on the state licence") and, for store creameries, one dry sentence under the address: "Retail shop at this address. Hours aren't in the census; call before you drive." **Suggested command:** /impeccable clarify

## Persona Red Flags

**Casey (one-handed phone):** a thumb miss filters the map to a county with no visible cause and no way back on the map pane; the greyed + still takes presses and then "Wisconsin" fails; the SW and Fox Valley clusters are blobs at the overview, rescued by the cluster zoom whose label lasts 1.6 s; the search placeholder truncates to "try “lir" at 412 px and "try “tr" at 375; the chip hand-off lands on a list still scrolled from before, so the first match is above the fold.

**Jordan (first-timer):** nothing says counties are tappable or that tapping again clears; "Wisconsin" reads as a destination; "Licence 55-1472" is bureaucratic; the difference between "In the cheese catalog (21)" and "Licensed to make" goes unexplained; Fort Dodge and Rockford at in-state weight make Jordan wonder whether Iowa creameries are in the census; at the cap with nothing selected the label is a dead end.

**Sam (screen reader, keyboard, 200% zoom):** the Tab order is sound end to end (skip links, tabs, controls, 88 rows, the map container with its note, zoom, Wisconsin, attribution, colophon), rings are visible, Escape returns focus to the row, the chooser moves focus to its first button, counties carry `tabindex="-1"`, the sheet inerts the page. Flags: "Show all of Wisconsin" announces a promise it does not keep when filtered; at 200% the phone layout shows a row and a half per screen with the "Show map" pill over the second; the county select is a 38-option listbox.

**Pat (late 60s, phone, from an article, wants a creamery this weekend):** the chooser rows show "Monroe · Green Co." with no store or award pill, so the pick among three Monroe creameries is blind; the sheet's "Open in Maps" and phone underlines float 20 px under the text; no hours and no visible note that the number is the licence line; after "Back to the map" the lower half of the screen is Illinois; an accidental county tap strands her.

## Minor Observations

- **"Did you mean" is defeated by the word "cheese".** `nearness()` takes the maximum over the name's words, so every "… Cheese …" name ties at 0.63 on "chese" and alphabetical order breaks the tie: Hook's is never offered for "Hooks chese". Score each query word against its best name word and average, and down-weight words common to many names (cheese, dairy, company, inc). Confirmed in the source.
- The legend grows to 526 px with "Selected" and slides under the 420 px panel.
- The "You" dot sits on the "Wausau" label at zooms 9 to 11, the one label a located reader wants.
- At the county zoom the four pins are anonymous 12 px dots and the "Knowlton" label collides with the Mullins pin; label pins from zoom 10 up.
- Every road kind draws at one weight at zoom 11 (the renderer paints all roads with one colour and width), so the Wausau grid reads as a net; shields carry the hierarchy alone. Out-of-state labels and the state names are set at in-state weight.
- The sheet's Contact links put the underline at the bottom of a 2.75rem inline-flex box; underline an inner span.
- The "also trades as" line should fold variants that differ only by case or punctuation.
- The sort chip appears for Most awarded and County but not Nearest, while the select says "Sort: Nearest".
- The detector's eighth-row occlusion under the floating pill is real geometry at the initial scroll position, mitigated by the fade and the bottom padding; the subtitle at 11.52 px is deliberate attribution; Leaflet's attribution control remains the one vendor-styled element on the map.
- No console errors or page errors in any state of either assessment.

## Questions to Consider

- Is the overview a map of Wisconsin or of the Upper Midwest? Fort Dodge, Rockford and Chicago are drawn at Wausau's weight, and the only thing saying "this is the census's ground" is a 1.5 px outline.
- If a third of the pins cannot be pointed at reliably at the overview, is the statewide frame the right first screen on desktop, or should the paper's map open on its own readership's region with "Wisconsin" as the step out?
- What does "Retail store" promise? Should the census refuse to call a place a store until it has hours, or say "call first" every time?
- The pins encode five things (store donut, award ring, ring size, selected gold, the you-dot). Is award count the magnitude a visitor needs on a map, or is "a door you can walk through" the only size that matters?
