---
target: the map view
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:5ea629484670dfd6463962d4a2db1d3c4c86d3a397eebe89e247aa45733f3b04"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-11T05-50-25Z
slug: web-src-components-mapview-tsx
---
**Method: dual-agent** (A: design-review sub-agent, built-in browser plus Playwright captures at desktop, Pixel 7 and 375 px; B: detector sub-agent, CLI scan plus headless Playwright injection. The pane's tab cap blocked a live overlay tab for both.)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Every self-move is announced except the one that loses readers: + with a panel open zooms about the map's centre, under the panel, so the selected pin slides out of the strip within two presses and nothing says so. |
| 2 | Match System / Real World | 3 | "Business line on the state licence", "Listed with a retail store on wisconsincheese.com", "Licensed to make: Bleu" beside "In the catalog: Blue": provenance language where a visitor asks "can I go there?". |
| 3 | User Control and Freedom | 3 | "Wisconsin" lands on a smaller state than the one the reader started with (6.5 vs 7 desktop, 6 vs 6.5 phone) unless it is clearing a county; closing an arrival panel refits the overview with no way back to the town. |
| 4 | Consistency and Standards | 3 | Two chip styles in one sheet (outlined chips open a cheese, tinted chips filter the map) with no stated rule; two home frames; the empty-state frame is a third. |
| 5 | Error Prevention | 3 | Chooser, cluster zoom, + disabled at the cap and "Did you mean" all hold; nothing stops a reader zooming their selected creamery off the map, and at the cap the label still offers "Open in Maps" for a pin no longer on screen. |
| 6 | Recognition Rather Than Recall | 3 | After closing an arrival the list scrolls to the row with no highlight and the map shows 88 same-weight pins; at zoom 13 to 14 the map is blank cream with no place name. |
| 7 | Flexibility and Efficiency | 3 | Shift-zoom, arrow-key panning, deep links, Near me, Enter on rows, skip links; no "see on map" from a row or the sheet, whose only exit is the list. |
| 8 | Aesthetic and Minimalist Design | 3 | Undercut by out-of-state labels at full weight, "MINNESOTA" under the zoom buttons, two grey caveat paragraphs between the address and the actions, and an "also trades as" line of case variants. |
| 9 | Error Recovery | 4 | "4 match “Marathon” statewide, none in Burnett County · Show all 4 · Clear the search", "Nothing called “Hooks chese”. Did you mean Hook's…", "Location is off for this site…": the best empty states on a map. |
| 10 | Help and Documentation | 3 | The legend states the pin rule and the About panel is thorough, but the search's one worked example is truncated on every phone ("try “lir"), and nothing tells a phone reader counties are tappable. |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** Authored, up to a line. The masthead is a newspaper flag (Fraunces at full softness with the wonky forms, the gold wedge at cap height, the thick-over-thin rule over a mono almanac line), the basemap is the census's own cream-and-pencil Wisconsin with the state outline and 72 county lines under the pins, the pin vocabulary is explained in a legend that says the rule out loud, the way home is a word rather than a house icon, and the copy is the paper's throughout ("Vilas County · no creameries in the census", "15 creameries here — zooming in"). Nobody could drop this onto a bike-shop locator unchanged. Below that line the furniture is category-standard: search plus two selects plus two checkboxes, list rows with pills, an aside with uppercase heads, Leaflet's +/−. Three specific misses: the basemap draws Minneapolis, Chicago, Duluth and "ONTARIO" at Wisconsin's weight, so after "Wisconsin" on a phone the state is a third of the frame among nine out-of-state cities; the pins are abstract dots in a census of cheese, the wedge being the only cheese in the visual language; and the hover card and panel are facts with no editorial sentence, so the newspaper voice lives in the status labels and nowhere in the records.

**Deterministic scan.** The CLI detector is clean on the three markup files and the stylesheet, with and without project config. The in-page detector found the same five rules on six elements as last run: Leaflet's attribution padding (vendor CSS), the cream page background (the brand token), the phone subtitle at 11.52 px (deliberate), the eighth list row under the phone's floating pill at the initial scroll (real, mitigated by the fade and padding), the zoom-cap label reported as occluded because it is `pointer-events: none` and the hit test falls through (a false positive, legible in the screenshot), and the legend's "Selected" entry 40% under the open panel, which the design review again found independently.

**Visual overlays.** No user-visible overlay exists; the tab cap forced headless injection, so the overlays are in six screenshots in the run's scratch folder rather than in a [Human] tab.

## Overall Impression

The phone pass landed: no control covers a pin, small crowds open the chooser at once, the county tooltip no longer follows a thumb, and the review calls the pin-resolution model and the county grammar out as strengths. The score holds at 31 because two paths still fail at the moment a reader leans in. On desktop, pressing + with a panel open zooms about a centre that sits under the panel, so "see the town" slides the town away. On a phone, an article's deep link opens a document whose only exit is an alphabetical list, and the town frame it computed is never seen. Both are framing, not data, and both are small to fix.

## What's Working

- **Status copy in the paper's voice, wired to a live region.** Every self-move the map makes is named in a dry sentence a reader can act on, and a screen reader hears the same sentence.
- **The pin-resolution model.** Inert pins, nearest-centre hit resolution and a pointer-aware chooser: a mouse on Anderson and Harmony, 4 px apart, gets a two-row chooser; a thumb on the 15-pin Monroe crowd gets one labelled zoom and then a three-row chooser; seven fast presses give seven steps.
- **The county layer as the map's grammar.** Hover names the county and its count, a tap filters to it, the chip appears where the tap was on the phone, the one filled shape is the county in force, and the "Wisconsin" button's label says it will clear it.

## Priority Issues

1. **[P1] The zoom buttons lose the selected creamery on desktop.** With the panel open, + zooms about the map's geometric centre, 30 px from the panel's edge, so a pin placed mid-strip is off-screen after two presses; at the cap the label reads "As close as the census map goes · Open in Maps" over blank cream with no pin, and Escape leaves the same blank. **Why it matters:** Pat presses + to see the town and the town leaves. **Fix:** while a creamery is selected, zoom about the pin (`setZoomAround`) or about the visible strip's centre, and after each zoom pan the selected pin back inside the strip with the existing margin. **Suggested command:** /impeccable harden

2. **[P1] The phone arrival never shows the map.** A cold deep link on a phone opens a full-screen sheet over the list pane whose only exit is "← Back to the list"; the zoom-10 town frame is computed and never seen; closing refits the overview and the list scrolls to the row without a highlight. **Why it matters:** the reader who came from an article asking "where is this?" gets a document, then an A–Z list, then 88 pins. **Fix:** on a creamery deep link at a narrow width open the map pane, so the bar reads "← Back to the map" and closing lands on the town with the pin still the large gold one for a beat; keep the town on close for arrivals on both sizes, with "Wisconsin" as the way out; add a "See on the map" link beside "Open in Maps". **Suggested command:** /impeccable clarify

3. **[P2] Two "Wisconsins".** The overview fits the pins (7 desktop, 6.5 phone), the button fits the state's outline (6.5 and 6), and the button with a county in force clears the county and fits the pins again. The reader's home is a third smaller on a phone than the frame they started with, and the southern cluster becomes a solid blob. **Fix:** one frame function, the pins-within-state fit with the same options, used by the overview, the resize, the close refit and the button. **Suggested command:** /impeccable harden

4. **[P2] Out-of-state places at Wisconsin's weight, with "MINNESOTA" under the zoom buttons.** The known open item and still the largest specificity miss. **Fix:** a second places rule for points outside the state polygon, one size down in the rule-strong grey, and a translucent cream inverse polygon under the pins to wash the land beyond the border, as chosen last time. **Suggested command:** /impeccable colorize

5. **[P2] The search placeholder is cut off on every phone.** "Search creameries — try “lir" on a Pixel 7 (276 px of text in a 239 px field) and "Search creameries — t" at 375 px. It is the only onboarding the search has and it reads as a glitch. **Fix:** a phone placeholder ("Try “limburger”") or the catalog's worked-examples row under the field. **Suggested command:** /impeccable clarify

Carried as P3, worth one pass together: Contact's order (two grey caveats between the address and the two actions) and the legend's "Selected" entry under the panel edge, which the detector measured again.

## Persona Red Flags

**Casey (one-handed, distracted phone):** the legend takes a 45 px band across the top of the map and the "Show list" pill sits where the thumb rests, over Burlington's pin; after "Wisconsin" the south-west is thirty overlapping rings and a tap there is a zoom, a tap and a chooser; the chooser header says "4 creameries here" for four places 40 miles apart; the zoom label wraps with an orphan ("7 creameries here — zooming / in"); the fold does not show that Near me changed the sort.

**Jordan (reads everything):** "Business line on the state licence", which licence?; "Listed with a retail store on wisconsincheese.com" hedges the pill two lines above; "Licensed to make: Bleu" versus "In the catalog: Blue" in one sheet; the "also trades as" line lists case variants of one name; the rings at 14, 16 and 18 px are not distinguishable at a glance; the masthead's 1,059 cheeses counts the browsable set and never says so.

**Sam (screen reader, keyboard, 200%):** mostly good: three skip links, the sr-only note, rows as buttons, counties out of the Tab order, Escape returning focus, "Copied ✓" mirrored by a status, focus rings everywhere tabbed. Flags: the map container takes focus and arrow keys pan it, but nothing announces where the map is or that it moved; the "Did you mean" buttons announce bare names with no verb; the sheet's ‹ › are labelled but the position counter that explains them is hidden on narrow screens; at 200% the phone findings apply on a desktop.

**Pat (late 60s, phone, from an article, wants a creamery this weekend):** the arrival issue is Pat's whole visit; then 13 px grey caveats between the address and the two actions she needs; "Business line on the state licence" reads as "this might not be the shop"; pressing + ends on a cream field with no road name; the two things that work perfectly are the `tel:` link and "Open in Maps".

## Minor Observations

- At zoom 13 to 14 the map is a blank with one road and no name; the cap label could carry the pinned address.
- The selected pin covers the town label it stands on ("M●nroe", "Kn●wlton").
- The hover card's address is mono while the panel's is Public Sans.
- The Leaflet attribution prefix takes a full line at 375 px; dropping the prefix keeps the OpenStreetMap credit.
- The empty-state map frame (centre, zoom 7, Duluth and Marquette in view) differs from the fitted overview.
- The chooser head at 12.5 px mono caps is the smallest reader-facing text on the map; basemap labels at zoom 10 to 11 render around 11 px.
- The two checkboxes stack beside the Near me pill at 375 px with awkward centring; with `?county=Marathon` the county fit crops Athens at the top edge.
- The detector's eighth-row occlusion under the floating pill and the 11.52 px subtitle are known and documented; no console or page errors in any state of either assessment; every measured text pair is at or above 4.68:1.

## Questions to Consider

- The list, the select, the sort, the tooltip and the chip are all county-first; why are the pins still 88 identical dots? What would the overview look like if counties carried their counts and pins appeared only from zoom 8?
- Is a full-screen sheet the right arrival for an article reader at all? What if the deep link opened the town with a half-height sheet (name, address, Open in Maps, Call) and the rest a swipe away?
- "Wisconsin" is the button, the outline, the subtitle and the extract's edge, and each draws the edge of the world somewhere different. Which one is the census's?
- At the zoom cap the census hands the reader to Google, yet it owns the address and the phone number. What is lost by leaving, and could the cap label say the address instead?
