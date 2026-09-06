---
target: the board builder
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\BoardView.tsx"
target_fingerprint: "sha256:4fd73f1a3c3779e83c444f2b85967676f5821302c03fadc80c60066ca72fd0f8"
target_path: "C:\\Users\\rpfly\\Projects\\cheese-census\\web\\src\\components\\BoardView.tsx"
timestamp: 2026-09-06T20-20-45Z
slug: web-src-components-boardview-tsx
closed: true
---
Method: dual-agent (A: design-review sub-agent · B: detector-evidence sub-agent)

# Critique — the Cheese Board Builder (`web/src/components/BoardView.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Meter, live note and tab count confirm every add; "Copy board link" fails silently when the clipboard is denied |
| 2 | Match System / Real World | 2 | Gain chips are bare vocabulary tokens ("+ medium", "+ the dare"); "Semi-soft table" and "Other · Hard" leak into the shopping list |
| 3 | User Control and Freedom | 1 | No undo anywhere; "Use this board", "Start over" and shrinking 5→3 destroy picks silently |
| 4 | Consistency and Standards | 3 | Card grammar reused faithfully; three labels for one action ("+ Add to the board" / "Add to the board" / "+ Add to my cheese board") |
| 5 | Error Prevention | 1 | The only guard on "Use this board" is a hover `title`; the disabled panel button at 50% opacity hides its own reason |
| 6 | Recognition Rather Than Recall | 2 | The note asks for soft while the rail offers hard; the sheet says "retail store" but the address lives on another view |
| 7 | Flexibility and Efficiency | 3 | Complete-my-board, seed-from-hearts and link-as-board are real accelerators; focus drops to `body` after every add |
| 8 | Aesthetic and Minimalist Design | 2 | House ad above the headline; a 62ch lede repeating the meter; 4+1 tray on desktop; a five-line raw URL on screen |
| 9 | Error Recovery | 1 | Unknown link ids dropped silently; a closed creamery's cheese sits on board and sheet unflagged; the full-board swap nudge offers no candidates |
| 10 | Help and Documentation | 2 | The lede and one footnote are the only help; About explains privacy, not "balance" or how to buy |
| **Total** | | **20/40** | **Acceptable — significant improvements needed before readers are happy** |

## Design Specificity Verdict

**LLM assessment.** Specific in voice and data, generic in form. The paper's language is everywhere — teal band, cream ground, Fraunces heads, mono figures, "From the cheese desk", the dry nudge copy ("goat or sheep changes the conversation") — and the balance meter over texture/age/milk/flavor could only exist on top of this census. But the composition is a sponsor box, a size toggle, and three card grids in a row; nothing in the layout says "cheese board" (no plate, no plated order), and the journey ends in a raw URL and three identical quiet buttons. A wine-flight builder could reuse the structure with the labels swapped.

**Deterministic scan.** Static `impeccable detect` over BoardView.tsx, CheeseDetail.tsx and App.tsx: exit 0, zero findings (TSX is regex-scanned only; linked CSS is not followed). The in-page detector, injected into a fresh tab, reported 39 items:
- 26× cramped-padding on `DraftPhoto` ribbons — 22 of them in the hidden, still-mounted catalog grid, 4 on visible suggestion thumbnails. Dev-only draft overlay, absent from production: false positive for the shipped page.
- 1× clipped-overflow on the Leaflet container — the mounted-but-hidden map view: false positive.
- **9× undersized-ui-text**: `.kicker` renders at 10.88px (0.68rem) on the suggestion and featured cards — real; sits just under the detector's 11px floor.
- **2× line-length**: the two `.aka` footnotes ("Ranked by what each cheese adds…", "Made one worth showing off?…") run ~123 characters at full 16px body size because `.aka` is only styled inside `.detail` and `.about-card` — real, and it explains why the footnote outweighs its section head.
- 1× em-dash-overuse (11 in body text, counted across hidden views): advisory; the paper's voice.
- 1× cream-palette (body `#F6F2E9`): the brand ground, by design.

**Visual overlays.** Overlays are painted in the **[Human]** tab left open in the browser pane; overlays for hidden elements are drawn at their layout position, so the boxes over the tray belong to the hidden catalog grid beneath.

**Where the two agree.** The design review flagged 10.9px kickers and the inverted-weight footnote on its own; the detector pinpointed the footnote's cause (an unscoped class). The detector caught nothing interactional — the contradictory nudge, the missing undo, the closed-creamery gap, the touch targets — which is where the real problems are.

## Overall Impression

The idea is strong and the engine is honest; the surface treats the shopper as an afterthought, and the machine argues with itself. The single biggest opportunity: make the suggestions answer the nudge (so the page speaks with one voice) and make the shopping list shoppable (addresses, one or two stops, not five counties).

## What's Working

1. **The balance meter is a genuine editorial idea, well built.** `boardCoverage` and `boardNudges` turn structured fields into plain-English coaching; the four rows carry screen-reader text, the color cells are `aria-hidden`, the note is `aria-live`. Contrast passes everywhere measured (≥4.68:1).
2. **The link is the board.** `?b=` with readable commas, mirrored from state so the printed sheet never lags; unknown ids drop instead of crashing; print CSS strips everything but the sheet and stamps provenance.
3. **Sponsored vs editorial is honest by construction.** The presenting slot is hard-coded to the brown/parchment language and cannot borrow house teal; highlight cards keep kicker and accent border inside the builder.

## Priority Issues

1. **[P1] The nudge and the ranking disagree.** After one semi-hard Cheddar the note says "Nothing soft yet — a fresh or creamy cheese…" while the top three suggestions carry "+ hard, + extra-aged, + mixed milk" (Gran Canaria, Pastorale Blend, Parmesan). Cause: `evaluate()` in `boards.ts` sums novelty (texture 3 + age 2 + milk 2 …), so a hard multi-milk award wheel always outscores the soft cheese the nudge asks for, and `boardNudges` is never consulted by `suggestForBoard`. **Fix:** make the first nudge a scoring term (a large bonus to any candidate that resolves it) or pin the nudge-resolving candidates first under a label that says so. **Command:** `/impeccable harden`.
2. **[P1] Destructive actions have no guard and no undo.** "Use this board", "Start over" and shrinking 5→3 (which trims the newest, balancing picks) mutate storage immediately; the only warning is a `title` tooltip no phone reader sees. **Fix:** an inline "Replaced your 5 picks — Undo" strip for ~10 s, a "Keep as 3? You'll lose X and Y" confirm on shrink, and never rely on `title` for a warning. **Command:** `/impeccable harden`.
3. **[P1] The shopping list doesn't say where to shop.** Rows read "Hook's Cheese Company, Inc. — Mineral Point · retail store"; the street address and website exist on the creamery record but never reach the sheet, and the engine's +0.75 county-spread bonus actively pushes a Wausau reader toward a five-county drive. **Fix:** address + website per row, rows grouped by creamery, a "widely sold in grocery stores" note for commodity makers, and a product decision on the county bonus. **Command:** `/impeccable clarify`.
4. **[P1] Touch targets and type on the surface that is mostly phone traffic.** At 375px: slot × 23×23, "Add to the board" 24px tall, size buttons 27px, "Complete my board" 29px, featured pick chips 18px; kickers 10.9px, gain chips 11.5px. The mobile block enlarges the panel buttons but not one board control. **Fix:** 44px minimum height on every board button below 760px, a 32px hit area on the ×, chips and kickers ≥ 12px. **Command:** `/impeccable adapt`.
5. **[P2] Silent edges: a closed creamery and a mismatched size.** A link carrying `edelweiss-creamery--baby-swiss` renders on the board and in the sheet with no "closed" pill and sends the reader to a company liquidated in February 2026; a shared 5-board link omits `bsize`, so a recipient whose stored size is 7 sees "5 of 7" with two empty slots — the link is not fully the board. **Fix:** the catalog's `pill.closed` in slot and sheet (counted against balance), and always write `bsize` into the share link. **Command:** `/impeccable harden`.

Also found (P2): eight identical "Add to the board" accessible names and five identical featured-board buttons — add the cheese name; focus drops to `body` after Add/Remove/Complete and after closing the panel (`closeCheeseDetail` looks for `[data-chid]`, which slots do not carry); "Complete my board" on an empty 5-board yields the same five cheeses for every reader statewide — and that board *is* the featured "census starter board"; on a full board the swap nudge shows while the suggestion rail is unmounted; "Send it to the newsroom" is a `mailto:` that does nothing in Facebook's in-app browser, with no feedback.

## Persona Red Flags

**Jordan (first-timer, reads labels literally):** "Complete my board" on an empty board reads as "I'm done" and returns five strangers' cheeses; "+ the dare" and "+ medium" mean nothing; "OTHER" as a family kicker on Gran Canaria; the empty-slot copy lists four ways in, none of them a button; "retail store" reads as a category, not a place.

**Casey (one-handed, distracted phone user):** the × sits 23px wide in the slot's top-right, the far corner from a right thumb; sponsor box plus lede push the tray off the first screen; a shared link opened later inherits her stored 7-size and shows empty slots; "Send it to the newsroom" is a dead tap in an in-app browser; "Copy board link" fails silently when the clipboard is denied.

**Sam (screen reader + keyboard):** the first focusable element in the board region is the sponsor link; `aria-label="Your board"` sits on a `div` with no role (ignored); eight "Add to the board" buttons with identical names; the "Use this board" button's `title` and visible label disagree; focus is lost to `body` after every add/remove/close; gain chips are unlabeled spans ("medium"); the panel's ←/→ walk the whole catalog from inside the board. Focus rings themselves are fine (2px teal, `:focus-visible`).

**Marlene (72, on her phone from a Facebook link, a board for the church supper):** 11–12px chips and buttons; a 23px × she will hit by accident, with no undo; "MERKTS CHEDDAR JALAPEÑO WITH OTHER NATURAL FLAVORS CHEESE SPREAD" shouting from a slot; the board it hands her spans Brown, Green, Iowa, Outagamie and Sauk counties — none within an hour of Wausau — and the printed sheet has no addresses; the sensible 3-cheese size, chosen after a 5, silently loses two cheeses.

## Minor Observations

- Desktop tray: a 5-board renders 4+1 and a 7-board 4+3 at the 1020px max width; slots stretch to the row's tallest with content in the top third.
- Empty state on a phone: a full screen of dashed "Empty slot" boxes; the first slot's copy is the only onboarding.
- The lede (62ch) and the meter explain the same thing; the "Ranked by…" footnote is 16px while its section head is 12px caps.
- The highlight card's cheese name is an underlined teal sentence that reads as a link but opens a panel.
- `.board-share` has three quiet buttons and no primary; the raw URL above them is noise on screen (fine in print).
- "Spans 5 counties on one plate" is celebrated in the note — a boast that is a logistics problem for the shopper.
- Vocabulary leaks in the sheet: "Semi-soft table", "Other", "Spreads & processed"; the mono facts read as data, not shopping guidance.
- The masthead's third tab wraps to its own row on phones, leaving ~570px for content under band plus draft bar.

## Questions to Consider

1. Who is the board *for* — the eater or the shopper? The engine optimizes for the plate (variety, counties, dares) while the deliverable is a shopping list. If "take it shopping" is the job, distance to a store is a scoring term and the county bonus is a penalty.
2. If every reader's "Complete my board" yields the same five cheeses, is the featured gallery a submission channel or a mirror? Would seeding the tie-break from the reader's hearts, county, or the day's highlight make the one-tap board theirs?
3. Why does the paper's house ad outrank the headline on a page whose principle is "the data is the product"? Would the sponsor read better as the sheet's colophon than as the page's first element?
4. Is a 3/5/7 toggle the right primary control for readers arriving from an article on a phone — or should the page open with one strong first pick ("Start with a Wisconsin original") and let size emerge?
