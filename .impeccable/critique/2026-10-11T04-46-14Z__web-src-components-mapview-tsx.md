---
target: the map view
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:3dd3c6fa6b6adc2328ab902919aed18ac3f3fb277d78ff23f351d76ab4878d20"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-11T04-46-14Z
slug: web-src-components-mapview-tsx
---
**Method: dual-agent** (A: design-review sub-agent, Playwright captures at desktop, Pixel 7, 375 px and a simulated embed; B: detector sub-agent, CLI scan plus headless Playwright injection. The pane's tab cap blocked a live overlay tab for both.)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | With a creamery selected the legend grows to "Selected" and the panel cuts it to "● S"; the one entry that explains the gold pin is the one you cannot read. |
| 2 | Match System / Real World | 3 | The overview is not the reader's map of Wisconsin: Minnesota's and Illinois's towns at Wausau's weight; "1 matches" reads as a typo; "Licence details" and "Business line on the state licence" are a regulator's words. |
| 3 | User Control and Freedom | 3 | On a Pixel 7 at the statewide zoom 84 of 88 pins have a neighbour inside the 36 px touch radius, so the first tap on almost any pin moves the map instead of opening it, and the only way back is "Wisconsin", not the previous frame. |
| 4 | Consistency and Standards | 3 | "Wisconsin" from the default view zooms out half a step (the pins fit at 7, the outline at 6.5) and after a county refits to the pins: two homes under one word; Leaflet's badge sits in the corner. |
| 5 | Error Prevention | 3 | On the phone overview the control column covers the state's northwest: Burnett Dairy Cooperative's pin sits inside the locate button, so a thumb aimed at it fires a location prompt. |
| 6 | Recognition Rather Than Recall | 3 | Touch has no hover card, so a phone shows 88 anonymous dots; the placeholder's example truncates to "try “lir"; the denied-location note says "pick a county above" while the county select is folded. |
| 7 | Flexibility and Efficiency | 3 | Keyboard is strong (stepping, + and − on the map, Shift ×3, skip links, deep links, URL state); on phones the reader pays two or three taps per creamery from the overview. |
| 8 | Aesthetic and Minimalist Design | 3 | Contact stacks three caveats around three actions; "Also trades as: Emmi Roth · Emmi Roth USA, Inc." repeats the title; the overview carries about 25 out-of-state labels. |
| 9 | Error Recovery | 4 | "4 match “Marathon” statewide, none in Burnett County · Show all 4 · Clear the search" and "Did you mean Hook's Cheese Company, Inc., Harmony Cheese or Cesar's Cheese LLC?" are exactly right. |
| 10 | Help and Documentation | 3 | The pin rule and the sources are explained, but what a tap does on a phone is told only after the fact, and the "Wisconsin" button's meaning lives in a title a phone never sees. |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** The shell is authored and unmistakably this paper's: the nameplate in Fraunces 800 with the leaning forms, the gold wedge with teal eyes, the typewriter seal on the tagline, the thick-over-thin gold rule over an almanac line of mono figures, folder tabs on the band's edge, and the dry copy throughout ("Hours aren't in the census; call before you drive"). The map is half-authored. The WPR palette runs through the basemap, the store donut and the ringed graduated pins are a real cartographic decision, and the chooser, the sheet's back bar and the "15 creameries here — zooming in" label are this product's own. What remains category-interchangeable is the basemap's labelling, which gives Minneapolis, Dubuque, Rockford and Chicago the standing of Wausau and Green Bay. At the overview more out-of-state towns are named than Wisconsin ones, the cream runs past the border unchanged and "WISCONSIN" is a faint caption, so the picture reads as the Upper Midwest with a teal line on it, worst on a phone where the bottom third is Iowa and Illinois. Leaflet's own chrome, a sidebar any directory could ship, and pins that carry none of the wedge's wit are the rest.

**Deterministic scan.** The CLI detector is clean on the three markup files and the stylesheet, with and without project config, and the reviewer proved it fires on planted patterns. The in-page detector found five rules on six elements across seven states. New since the last run: the legend's "Selected" entry is 40% under the open panel, which the design review found independently. The rest are known: Leaflet's attribution padding (vendor CSS), the cream page background (the brand token), the phone subtitle at 11.52 px (deliberate, documented), the eighth list row under the phone's floating pill at the initial scroll (real, mitigated by the fade and padding), and the zoom-cap label reported as occluded because it is `pointer-events: none` and the hit test falls through to the county beneath, while the paint order and the screenshot show it legible.

**Visual overlays.** No user-visible overlay exists; the tab cap forced headless injection, so the overlays are in seven screenshots in the run's scratch folder rather than in a [Human] tab.

## Overall Impression

The desktop path is now sound end to end: the cold deep link lands on the town, the pointer means the pin it is over, the zoom buttons keep count and return, the copy carries the paper's voice. The score moved from 28 to 31 on those fixes. What holds it there is the phone's map pane, where the overview is built for a mouse: the control column covers the northwest with a store-and-awards creamery under the locate button, nearly every pin needs two or three taps, and a county tooltip opens under the thumb and stays. The single biggest opportunity is deciding what the phone's first map is for, and framing it for a thumb.

## What's Working

- **The cold deep link is right.** `#emmi-roth-usa` lands at zoom 10 with the gold pin mid-strip, the row scrolled into view, the panel focused and the title set; Escape refits the state and returns focus to the row.
- **The empty states and status lines are the paper's voice doing real work.** "4 match “Marathon” statewide, none in Burnett County" blames the filter, not the word; "Did you mean" offers Hook's first for "Hooks chese"; "Sorted nearest first: Mullins Cheese, Inc. in Mosinee is 17 mi away." announces what a changed select cannot.
- **Contact tells the truth about its own data.** The pinned-plant line, the hours caveat and the phone's provenance note are the difference between a database and a newspaper, and the three links are each a thumb's height on phones.

## Priority Issues

1. **[P1] The phone's control column hides the state's northwest, and one of its best creameries.** At the Pixel 7 statewide frame the stacked zoom, "Wisconsin" and locate controls occupy the top-left 104×200 px, and Burnett Dairy Cooperative's pin (Grantsburg; 13 awards, a store) sits inside the locate button. A thumb aimed at it fires a geolocation prompt and the "Location is off" note lands on the hidden list pane. Crystal Ball Farms and Schuman sit at the column's edge. **Why it matters:** Casey and Pat cannot reach a top-tier creamery from the first map at all, and the side effect is a permission dialog. **Fix:** fit the phone overview with top-left padding that clears the column, or move "Wisconsin" and the locate button to the bottom-left above the pill; never let a control sit over an in-state pin. **Suggested command:** /impeccable layout

2. **[P1] The phone overview makes nearly every pin a two- or three-tap target, with a stray county label on top.** 84 of 88 pins have a neighbour inside the 36 px touch radius at zoom 6.5, so a tap on Emmi Roth yields "15 creameries here — zooming in", a move, and then "Green County · 9 creameries" opening at the tap point and staying over the Monroe pins through the zoom and the chooser, because a touch fires the county's hover tooltip. The portrait fit is by width, so the bottom third is Illinois while the pins crowd the middle. **Why it matters:** the first map a phone reader sees answers nothing with one tap. **Fix:** frame the phone overview a step closer (fit the in-state pins to the portrait aspect, allow 7.5); bind county tooltips only on hover pointers, or close them inside the tap handler; open the chooser directly when the crowd is four or fewer instead of zooming first. **Suggested command:** /impeccable harden

3. **[P2] The basemap treats Wisconsin's neighbours as the subject.** At the overview on both sizes about 25 out-of-state towns are set in the same ink and size as Wausau; "WISCONSIN" is a grey whisper; the land beyond the border is the same cream. **Why it matters:** Pat's first question is "where am I on this?" and the first names she reads are Minnesota's. **Fix:** filter the places layer's labels to features inside the outline (point-in-polygon against the state's own geometry) or set out-of-state labels one size down in the rule-strong grey, and wash the land outside the border with a masked cream-deep polygon so the state is the figure and the neighbours the ground. **Suggested command:** /impeccable colorize

4. **[P2] The panel clips the legend's "Selected" entry on desktop.** With any creamery open the legend grows to 527 px and the 420 px panel covers its tail; the detector measured 40% of the word under the panel and the review saw "● S". **Fix:** give the legend a maximum width when the panel is open, as the zoom-cap label already has, or drop "Selected" from the legend and show the gold pin beside the panel's where-line. **Suggested command:** /impeccable polish

5. **[P2] Contact buries the two things a visitor does under three things the paper wants to say.** The order today is address, pinned-plant line, hours caveat, Open in Maps, phone, business-line note, website, "also trades as"; on a phone "Open in Maps" is the sixth line. **Fix:** the three actions as one row directly under the address (Open in Maps · phone · website), the two caveats folded into one footnote sentence beneath them, "Also trades as" moved into the licence fold. **Suggested command:** /impeccable distill

## Persona Red Flags

**Casey (one-handed, distracted):** the zoom, "Wisconsin" and locate column is top-left, the farthest corner from a right thumb; a tap on the northwest pins fires the locate button; her first pin tap moves the map and leaves a county label on the pins; the "Show list" pill covers the last row and sits under the filter chip; the "zooming in" label lasts 1.6 s; the sheet's ‹ › step alphabetically to "Family Fresh Pack LLC" when she came from a Monroe pin.

**Jordan (reads everything):** the placeholder ends "try “lir"; "1 matches “Hook's…”" looks like a bug; "Listed with a retail store on wisconsincheese.com" names a site the page never introduces; "Also trades as: Emmi Roth · Emmi Roth USA, Inc." repeats the title; the legend's "· bigger with more wins" is a fragment; "Wisconsin" is a noun on a button; the chooser lists "Monroe · Green Co." three times with nothing to tell the three apart.

**Sam (screen reader, keyboard, 200%):** mostly sound: three skip links, a sensible Tab order through to the map and its controls, teal rings everywhere and cream on the band, the panel takes focus and gives it back, the chooser is a popover with Escape, the phone sheet makes the rest inert. Flags: the masthead count is a polite live region and re-announces on every keystroke of the search; at 200% on a laptop the phone layout shows about two rows under a 230 px header; the clipped "Selected" is unreadable to magnifier users too.

**Pat (late 60s, phone, from an article, wants to visit this weekend):** the deep link opens the sheet with "← Back to the list", so she never sees the town framing; Contact answers her questions but she reads two paragraphs before "Open in Maps"; the pins hide the town names she navigates by ("M●roe"); the county-zoom labels are about 10 px; "Near me" denied tells her to "pick a county above", which is folded behind "County & sort"; the zoom cap shows a blank cream field just when she wants streets, and only the label's hand-off saves her.

## Minor Observations

- "Wisconsin" from the default view moves the map half a step out (the pins fit at 7, the outline at 6.5) and after a county it refits to the pins: one home frame, please.
- Place names draw under the marker pane: Appleton is hidden by Agropur's pin at the overview, Monroe by the selected pin at zoom 10.
- Maple Leaf Cheese Co's pin sits practically on the Illinois line for a Monroe street address, six miles south of town; worth a look at the geocode (data, not design).
- The "WI 29" shield repeats four times along one road at the county zoom; "Saint Cloud" is clipped to "int Cloud" by the "Wisconsin" bar on desktop.
- The masthead count's `aria-live` duplicates the result strip's announcement and fires per keystroke; drop it.
- The desktop checkbox row reflows to two lines when "Near me" becomes "Nearest first"; at 375 px the two toggles stack beside the pill and the block grows 55 px.
- The empty-result fallback zooms out half a step; the map moves when a search finds nothing.
- Leaflet's attribution prefix (the flag and "Leaflet |") is a library's badge in a newspaper's corner; dropping the prefix keeps the OpenStreetMap credit.
- A mouse click on a coincident stack (Emmi Roth, W&W, Wisconsin Cheese Group, 1 to 2 px apart) zooms to 11 and the three pins still overlap; the county tooltip then appears under the unmoved pointer.
- "28 match “gouda”" and "1 matches “…”" are grammatical and still read wrong; "28 creameries match" would not.
- The hover card's address at 12.5 px mono and the phone note at 0.78rem are the smallest reader-facing text in the view.
- The detector's eighth-row occlusion under the floating pill and the 11.52 px subtitle are known and documented; no console or page errors in any state of either assessment.

## Questions to Consider

- If 84 of 88 pins cannot be opened with one thumb tap at the statewide frame, is a statewide overview the right first picture on a phone, or should the phone open on the reader's county with "Near me" as the first question rather than the fourth control?
- Should the basemap exist past the state line at all? A newspaper's state map stops at the border; a web map does not. Which one is a census?
- Why is the way home a word, "Wisconsin", that frames the state differently from the frame the reader arrived on?
- On a phone every answer, Near me, a county, a search, is delivered by the list, and the map is a picture to look at between taps. What does the map do there that earns its tab, its four controls and its two-line legend?
