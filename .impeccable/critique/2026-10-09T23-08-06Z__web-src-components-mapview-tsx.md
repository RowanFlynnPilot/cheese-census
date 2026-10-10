---
target: the map view
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
target_fingerprint: "sha256:7bda1a81056cc22afe8096a54d6abf374538c8c29feae749fd3bf336234569e1"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\MapView.tsx"
timestamp: 2026-10-09T23-08-06Z
slug: web-src-components-mapview-tsx
closed: true
---
**Method: dual-agent** (A: isolated design-review agent, live site at desktop and phone widths · B: isolated detector agent, CLI scan plus overlay injection on a local production preview; B returned first, A ran isolated, synthesis after both).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "28 of 88", "39 / 88" and the "makes …" hints are good; a chip tap on the phone changes nothing the reader can see |
| 2 | Match System / Real World | 2 | "Pasteurizer-HTST", "Bovine Milk", "class 105 · Semi-soft (Semi-hard)…", bare "98.350"; pins in New Jersey labelled "Kaukauna · Brown County" |
| 3 | User Control and Freedom | 3 | Escape, back bar, prev/next, filter-away closes the panel; every result-set change discards the reader's own pan and zoom, no reset |
| 4 | Consistency and Standards | 3 | The catalog's empty state names the query and offers near-misses; the map's still says "those filters" after a search. "Store" / "Retail store" / donut |
| 5 | Error Prevention | 2 | 118 overlapping hit-box pairs across 69 of 88 pins at the overview; a click on one marker opened its neighbour |
| 6 | Recognition Rather Than Recall | 2 | No place labels, no near-me: a reader must recall their county; the legend is hidden on phones |
| 7 | Flexibility and Efficiency | 3 | URL params, arrow stepping, hover cards, county sort with sticky heads; no distance |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained palette; a creamery's operations appear three times in its panel |
| 9 | Error Recovery | 3 | "Clear filters" and "Try again" exist; no near-miss, no naming of the failing term |
| 10 | Help and Documentation | 3 | Chip hint, screen-reader map note, worked placeholder; nothing explains the donut pin on a phone |
| **Total** | | **27/40** | **Acceptable (top of the band)** |

## Design Specificity Verdict

**LLM assessment: authored above the map, generic on it.** Masthead, almanac line, folder tabs, "makes Limburger" hints, "Licensed to make", medal chips with scores, `Licence 55-1472` in mono and the dry no-licence sentence read as a newspaper data desk. The map itself is an unlabelled Leaflet default: Esri light-gray base with no reference layer (no city names), uniform 12px dots, plus and minus; the donut-for-store rule is the only authored cartographic idea. The sidebar is any store locator; the panel's order is the database's. `editorial.summary` is empty for 0 of 88.

**Deterministic scan:** CLI detector 0 findings across MapView.tsx, CreameryDetail.tsx, App.tsx. Browser overlays: desktop map 13 (12 buried-raster = Leaflet tile fade-in, false positive; cream palette, false positive); record open 15 (tiles/palette plus 3 real repeated-container-text — "Cheddar", "Colby", "Gorgonzola" three times each inside the panel — and 2 real text-occlusion hits: the panel's chips cover the Leaflet attribution and the legend's "Selected" label at 1024px); phone Green County with the map 17 (tiles, palette, tiny-text 11.52px on the documented subtitle exception).

**Visual overlays:** injected successfully on all three states; left open in the [Human] tab (local server since stopped).

## Overall Impression

The bones are right and in places rare (list as the keyboard path, pins not Tab stops, focus restore, licence-aware search). What undermines it is the one thing a map must get right: six creameries with Wisconsin plant addresses are pinned at corporate headquarters out of state, one fifteen miles from Wausau. Below that, no place names and no "near me": Pat has to recall the county and tick a checkbox to reach Mullins Cheese in Mosinee. The biggest opportunity after the pins is a phone that opens on "nearest stores" instead of a filter form and a corporate alphabet.

## What's Working

- **The list is the accessible path; pins are not stops.** Zero marker Tab stops; search → county → sort → toggles → rows; Escape returns focus to the row.
- **Search that reaches the licence file and says why.** "limburger" surfaces every creamery licensed to make it with a "makes Limburger" hint; a chip answers "who else?" statewide.
- **The phone sheet's bottom bar.** 44px back/prev/next where a thumb is, header scrolling away.

## Priority Issues

- **[P0] Six creameries are pinned outside Wisconsin while their rows and panels name Wisconsin plants.** Confirmed in build/creameries.json: Arla Foods (Kaukauna · Brown, pinned 40.64/−74.58 NJ), Associated Milk Producers (Blair, MN), Bel Brands USA (Little Chute, IL), Anderson International Foods (Edgar · Marathon, Jersey City), Saputo Cheese USA (Waupun, IL), V & V Supremo (Browntown, Chicago). MapView.tsx 11–14 believes these are out-of-state offices; they are licensed Wisconsin plants carrying DFW's corporate-HQ coordinates. **Fix:** build-fatal validation that an exported creamery's lat/lng falls inside Wisconsin (ideally its county), plus corrected coordinates for the six in data/overrides/creameries.json at the first Wisconsin plant. **Suggested command:** /impeccable harden
- **[P1] No way to find "near me".** No labels, no geolocation, no distance sort, legend hidden on phones. **Fix:** Esri World_Light_Gray_Reference for place names; a "Near me" button (in-browser geolocation only) sorting rows by distance with miles shown; a one-line legend under the phone map. **Suggested command:** /impeccable onboard
- **[P1] Overlapping pins misfire.** 118 overlapping hit-box pairs across 69 of 88 pins at the overview; 40px phone boxes overlap more; a click on Harmony's marker opened Dairy State. **Fix:** a chooser when a tap lands on ≥2 hit boxes, or declutter below zoom 9 with count badges. **Suggested command:** /impeccable harden
- **[P1] A chip tap on the phone is silent.** The hint invites it; the list filters behind the sheet ("28 of 88" in the inert masthead) while the sheet does not change. **Fix:** on narrow screens a chip closes the sheet to the list with a "28 make Gouda · Clear" strip, or confirms in-sheet with "See the 28 →". **Suggested command:** /impeccable clarify
- **[P2] The panel is a licence file, not a visit.** Operations appear three times (detector: Cheddar/Colby/Gorgonzola ×3 inside the panel); plain-text address with no directions link, phone or hours; database order. **Fix:** address → maps link; plants and capabilities behind "Licence details"; lead with store, awards, master cheesemaker; one computed sentence per creamery until summaries exist. **Suggested command:** /impeccable distill

## Persona Red Flags

- **Casey:** county select (36 options) and sort first under her thumb; 40px hit boxes overlap in Green/Sheboygan; "Copy link" top-right out of reach on the sheet; silent chip tap → taps twice; the restored-focus row hides under the flip pill after "Back to the list".
- **Sam:** good bones (live count, sr-only score, focus restore); hover-card text 12.5px, address 11.5px mono, county heads 11.8px; selected pin is colour + size only; zoom controls land after 88 rows in Tab order.
- **Jordan:** "Licensed to make", "Licence 55-1472", "class 105", "98.350", "DATCP"; donut unexplained on phones; the panel vanishes silently when a filter removes its creamery.
- **Pat:** must know "Marathon" and tick "Retail store" (0.82rem checkbox) to reach Mullins Cheese, Mosinee; of Marathon's four rows one is an ingredient firm pinned in New Jersey and two have no store; no "nearest store", no hours, phone or directions.

## Minor Observations

- "Sort: Most awarded" truncates to "Sort: Most awar" at 380px.
- "All counties (35)" counts counties while the options count creameries.
- A single-result search zooms to level 10 over an unlabelled void.
- The A–Z default opens on Agropur, Alpinage, Anderson, Arla, AMPI, Bel — industrial names first.
- Scores need "out of 100" once; the almanac line is dropped on phones.
- At 1024px the panel covers the Leaflet attribution and part of the legend (detector).
- The empty search says "No creameries match those filters" where the catalog now names the query and offers near-misses.

## Questions to Consider

- If phones are primary, why does the phone open on a filter form and a corporate alphabet rather than "nearest stores"?
- What one sentence can the panel compute honestly per creamery until the newsroom writes 88 summaries?
- Is "Licensed to make" the reader's word or the regulator's — would "Makes", with the licence as provenance, serve Pat better?
- Should a company whose Wisconsin presence is a licence and an out-of-state HQ get the same dot as a farmstead creamery, or a different mark?
