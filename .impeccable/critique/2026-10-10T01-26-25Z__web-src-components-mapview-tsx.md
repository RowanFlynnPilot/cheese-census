---
target: the map view
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:6a256738abba4d446743f5772bea77a4f11a265c74306b832f436e10bc5206cb"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-10T01-26-25Z
slug: web-src-components-mapview-tsx
closed: true
---
**Method: dual-agent (A: design-review agent, live site in its own tab · B: detector + overlay agent, local production preview in its own tab)**

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Near me succeeds silently: the sort flips, miles appear, but no status text says the list re-sorted or how far the nearest creamery is. |
| 2 | Match System / Real World | 3 | DATCP licence vocabulary leaks raw into reader chips ("Washed Curd and Soaked Curd", "Bleu" beside the catalog's "Blue"); "Licence" spelled the British way in a Wisconsin paper. |
| 3 | User Control and Freedom | 3 | Esc, Clear, "Clear the filters too" and the phone back bar all work; the pin chooser ignores Esc and Near me has no off switch. |
| 4 | Consistency and Standards | 3 | `aria-pressed` on Near me promises a toggle but a second press re-locates; the catalog folds phone filters, the map does not. |
| 5 | Error Prevention | 3 | County options carry counts; search plus county can still combine into a misdiagnosed empty state. |
| 6 | Recognition Rather Than Recall | 3 | Place names, the worked placeholder, the chip hint and "Did you mean" are solid; the 36-item county select stays a recall task. |
| 7 | Flexibility and Efficiency | 4 | ← / → stepping with "n / N", every state in the URL, deep links, Share, skip links. Solid. |
| 8 | Aesthetic and Minimalist Design | 3 | The phone filter block is 203px with Near me orphaned on its own line; Agropur's sheet runs 1,782px with awards unfolded while the licence folds. |
| 9 | Error Recovery | 3 | "Nothing called “Marathon”" when four creameries match and the county filter is the real cause. |
| 10 | Help and Documentation | 3 | About explains sources and the provisional notice; nothing in place distinguishes "In the cheese catalog" from "Licensed to make". |
| **Total** | | **31/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** Authored content model and voice on a category-standard map shell. The masthead (Fraunces title, the wedge mark, the typewriter seal, the mono almanac line), the "makes Gouda" row hints, the "Licensed to make" chips, the contest table with medal chips and mono scores, and the dry copy ("Location is off for this site. Turn it on in your browser, or pick a county above.") could only be this paper's. The structural pattern is the store-locator template, and the map canvas is the interchangeable part: Esri grey tiles, Leaflet's stock zoom control, uniform 12px dots. The state outline, gold selected pin and store donut are the one authored move, and it is thin. The whole tool is organised by county (select, sort with 36 sticky heads, county on every row) yet the map draws no county lines, and pins carry no weight: 17 awards and 0 awards look identical.

**Deterministic scan.** CLI: four files scanned (`web/src/components/MapView.tsx`, `web/src/App.tsx`, `web/src/components/CreameryDetail.tsx`, `web/index.html`), exit 0, zero findings each. Browser scans on the local production build: desktop settled at one finding in every state (cream palette on `body`, a false positive: `#f6f2e9` is the WPR brand cream); the first desktop scan reported 24 "buried raster" tiles, a transient false positive from Leaflet's fade-in paused in a hidden tab, gone on re-scan. Phone list pane: four findings, two of them real and agreed with A: the floating "Show map" pill covers the eighth row at scroll top (36% of the name, 100% of its "7 awards" pill), and the masthead subtitle renders at 11.52px, a documented trade-off below the detector's 12px line but above the project's 0.68rem floor. One "nested cards" hit on the phone sheet bar appeared in one of two identical scans and is not credited. The detector missed everything that matters below; the 44px failures are computed-size facts it does not check.

**Visual overlays.** The `[Human] Cheese Census map` tab in the browser pane holds the injected detector with the cream-palette banner across the masthead; the settled desktop state has no element boxes. The local preview behind it is stopped, so reloading that tab drops the overlay.

## Overall Impression

The P0 is gone, the map now does the census's job, and the score moved from 27 to 31. What remains is follow-through: the phone sheet was left out of the 44px pass (its chips are 18px tall under a line telling you to tap them), the thumb-sized zoom buttons never shipped because of cascade order, the chooser over-helps on a mouse and under-helps at the overview, and Near me acts without saying so and cannot be undone. The single biggest opportunity is the phone sheet's touch sizing, measured independently by both agents.

## What's Working

1. **Search shows its work.** Matching reaches into licence types, the row says why it matched ("makes Gouda" in teal), the strip names the query and count ("28 match “gouda” · Clear"), and the map refits. A reader never wonders why a row is there.
2. **The phone hand-off holds.** Tapping "Cheddar" in a sheet closes it onto the list with focus on the 44px strip ("45 match “Cheddar”") and 45 rows marked "makes Cheddar"; the sticky bottom bar reads "Back to the map" or "Back to the list" depending on where you came from.
3. **The keyboard path is real.** Skip links on first Tab, rows as buttons with `aria-current`, the panel takes focus, ← / → step with "2 / 88", Esc returns focus to the row with a visible ring, the About dialog traps Tab and returns focus to its opener. A confirmed the Esc return after ruling out a background-tab artifact.

## Priority Issues

**[P1] The sheet's chips are 18px tall on a phone that tells you to tap them.**
- **Why it matters:** "Licensed to make" chips measure 62×18 and catalog chips 97×19 (A and B measured independently), directly under "Tap a type to see every creamery licensed to make it." They are the sheet's only cross-navigation and the smallest targets on the screen; a mis-tap filters the wrong type. The catalog view already grows its chips to 2.5rem on phones (`web/src/styles.css:3311`); `.tag` has no phone override (`web/src/styles.css:890`).
- **Fix:** In the phone block, `.detail .tag.cheese, .detail .tag.product { min-height: 2.5rem; padding: .45rem .8rem; font-size: .86rem }` and `.detail .tags { gap: .5rem }`. Desktop unchanged.
- **Suggested command:** `/impeccable adapt`

**[P2] The pin chooser fires for a pin the reader already identified, and Esc cannot close it.**
- **Why it matters:** Hit-testing uses the same radius on every pointer (`web/src/components/MapView.tsx:217`). On desktop, hovering Anderson International shows its card, then the click asks "2 creameries here — pick one" because Harmony Cheese sits 19px away. At zoom 7 the Fox Valley tap lists 7 names, Blue Mounds on the phone lists 9 with five visible and a 24px close. Leaflet's own Esc handler only runs while the map container has focus, and the chooser moves focus to its first button, so Esc does nothing. A rated this P1; by the severity definitions it is P2 because the list and zooming in are workarounds, but it is the map's most frequent friction.
- **Fix:** On `(hover: hover)` pointers open the clicked marker directly unless another pin is within ~8px. On coarse pointers below zoom 9, a cluster tap zooms two levels onto the tap point and shows the chooser only when pins still coincide. A keydown listener on the popup closes it on Escape and returns focus to the map.
- **Suggested command:** `/impeccable harden`

**[P2] The empty state blames the query when a filter is the cause.**
- **Why it matters:** With county Burnett and search "Marathon", the list says "Nothing called “Marathon”. Did you mean Dupont Cheese…" while four creameries match statewide. The branch keys on the query alone (`web/src/App.tsx:1623`) and near misses are scored over all creameries, so a reader who typed a real place believes it is not in the census. Near misses also have no floor relative to the best score: "Winona Foods" is offered for "hookz".
- **Fix:** Compute the query's unfiltered match count; when it is above zero, render "4 match “Marathon” statewide, none in Burnett County" with one "Show all 4" action and no "Did you mean". Require near misses to reach 0.45 or 70% of the best score.
- **Suggested command:** `/impeccable clarify`

**[P2] Near me cannot be switched off and does not say what it did.**
- **Why it matters:** The button carries `aria-pressed` but its only handler is `locate` (`web/src/App.tsx:1567`), so a second press re-asks for position; the "You" dot, legend entry and distance sort persist until reload. Success renders no `role="status"` text (only denial and unavailability do), so a screen-reader user hears "Nearest first, pressed" and learns nothing. The phone map pane has no locate control at all.
- **Fix:** Second press clears `here`, restores the name sort and the "Near me" label. On success, a status line beside the strip: "Nearest first: Mullins Cheese, Mosinee, is 17 mi away." A small locate control under the zoom buttons on the phone map pane.
- **Suggested command:** `/impeccable clarify`

**[P2] Phone chrome under the 44px line, including a rule that never shipped.**
- **Why it matters:** View tabs are 29px tall (`web/src/styles.css:3369`), the "Show map" pill 39px, pin hit boxes 40px, the strip's "Clear" 32px wide, colophon links 14px tall. The zoom buttons measure 30×30 on touch because the 44px override lives in the main stylesheet while Leaflet's 30px rule now loads later from the lazy map chunk at equal specificity (verified in `web/dist/assets`). The filter block is 203px with Near me alone on a right-aligned line, pushing the first row to y=294, and the floating pill covers row text at scroll top (detector-confirmed).
- **Fix:** Move the zoom override into the map component's stylesheet after the Leaflet import, or raise its specificity. Tabs and pill to 2.75rem, `HIT` 44 on coarse pointers, a min-width on "Clear", padding on colophon links. Put Near me on the sort row (it is a sort) or fold filters behind one button as the catalog does. A cream fade under the pill so it never sits on text.
- **Suggested command:** `/impeccable layout`

## Persona Red Flags

**Jordan (first-timer):** lands on 88 rows and 88 identical dots with "try “limburger”" as the only onboarding; the first Fox Valley tap answers with "7 creameries here — pick one". In the panel, "In the cheese catalog (8)" and "Licensed to make" are two chip rows with no sentence on the difference, and the licence chips read "Semisoft" and "Washed Curd and Soaked Curd". "Licence details (4 plants)" is newsroom provenance, not reader information.

**Casey (one-handed phone):** the filter block pushes the first row below the fold's midpoint; the map pane has no Near me; the Blue Mounds tap opens a 9-name popup to scroll inside, closed by a 24px ×; the chips Casey is told to tap are 18px tall; zoom buttons are 30px at the top-left, away from the thumb.

**Sam (screen reader, keyboard, 200% zoom):** the keyboard path is good. Gaps: Near me success is not announced; the chooser is not a dialog, Esc does nothing and Tab wanders into Leaflet's attribution links; at 200% zoom the layout takes the phone branch, so the 18px chips and unfolded filter block are what Sam gets on a desktop too.

**Marjorie, 68, print subscriber in Weston planning a Saturday drive (from PRODUCT.md's readership):** Near me gives her "Mullins Cheese, 17 mi, Store"; the panel offers an address, "Open in Maps" and a website, but no telephone number and no hours. DATCP's licence file carries a phone, the scraper reads it (`scrapers/datcp.py:140`), and the model drops it: no phone field in `models.py`, `SCHEMA.md` or `web/src/types.ts`. "Retail store" is a flag with no "open Saturday". The provisional notice she might read is a 12px footer line in jargon ("classifications").

## Minor Observations

- Closing the panel after stepping to an eastern creamery (Alpinage, Sturtevant) re-framed the whole state once: the panel-offset centre lands east of the state bound and `web/src/components/MapView.tsx:241` calls `frame()`. Compare against a padded bound.
- The phone subtitle at 0.72rem (11.5px) is a documented trade-off; for an older readership, 0.76rem with the seal allowed to wrap is the better side of it.
- The legend always shows "Selected", even with nothing selected; the store donut reads as "hollow" to some eyes.
- The hover card's "2 in this catalog" uses a noun the map never defines, and on touch the hover card stays open after a pin tap until the next tap.
- "Licence" throughout a U.S. paper's UI; DATCP's own report says "License".
- Sort options carry "Sort:" inside each option; a visible label would shorten them and the 36-option county select.
- The phone overview spends the lower 40% of the map pane on Illinois and Iowa; fit with bottom padding.
- Agropur's sheet is 1,782px on a phone: awards do not fold while the licence does.
- A closed creamery (Edelweiss) shows only a "Closed" pill, no date or reason.
- The provisional notice wraps to "Provisional data" alone on phones.

## Questions to Consider

- The reader's Saturday question is "can I visit, and are they open?" Why is the first fact a licence address, and why is the phone number the one field the scraper reads and the model throws away?
- Everything in this tool is county-first except the map. What would the overview look like as 35 county counts that tap into a county zoom, with pins only from zoom 9, and would the chooser still need to exist?
- "Licensed to make" is the newsroom's provenance concept. Would "Makes (per state licence)" with one explaining line in the panel outperform the About entry nobody opens?
- Inside a phone-width iframe the map starts un-draggable and the list is the real surface. Should the embed open on the list with the map secondary, and the standalone page the reverse?
