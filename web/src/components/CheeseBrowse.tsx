import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Award, Cheese, Creamery, Highlight } from "../types";
import {
  MILK_LABEL,
  TEXTURE_LABEL,
  familyLabel,
  type DraftMedia,
  type Recommendation,
} from "../data";
import CheeseCard from "./CheeseCard";

export const CHEESE_SORTS = ["name", "creamery", "awards", "family"] as const;
export type CheeseSortKey = (typeof CHEESE_SORTS)[number];
// The catalog opens on the state's contest winners, not on "1 Year Aged…" —
// A–Z is a phone book; most-awarded is the newspaper's first page. Ties fall
// back to A–Z, so the tail of the list reads exactly as it used to.
export const DEFAULT_CHEESE_SORT: CheeseSortKey = "awards";
const SORT_LABEL: Record<CheeseSortKey, string> = {
  awards: "Most awarded",
  name: "A–Z",
  creamery: "Creamery",
  family: "Family",
};
// Worked examples under an empty search box: a flavor, a maker, a note — the
// three kinds of word the search understands, each one tap away.
const EXAMPLES = ["habanero", "Hook’s", "smoky"];

interface Props {
  loading: boolean;
  /** Below the phone breakpoint the facets fold behind one "Filters & sort"
   *  button, so the first screen shows cheese instead of a wall of controls. */
  narrow: boolean;
  shown: Cheese[];
  /** The filter inputs, folded to one string. A change means the reader asked a
   *  new question, so the grid restarts at the top; `shown` alone also changes
   *  when a heart is toggled mid-scroll, which must not move the page. */
  filterKey: string;
  hints: Map<string, string>;
  /** The names nearest a search that found nothing (App computes them). */
  nearMisses: { id: string; name: string }[];
  creameriesById: Map<string, Creamery>;
  awardsByCheese: Map<string, Award[]>;
  heartSet: Set<string>;
  heartCount: number;
  onToggleHeart: (id: string) => void;
  recommendations: Recommendation[];
  highlights: { highlight: Highlight; cheese: Cheese }[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  query: string;
  onQuery: (v: string) => void;
  family: string;
  onFamily: (v: string) => void;
  texture: string;
  onTexture: (v: string) => void;
  milk: string;
  onMilk: (v: string) => void;
  sort: CheeseSortKey;
  onSort: (v: CheeseSortKey) => void;
  awardedOnly: boolean;
  onAwardedOnly: (v: boolean) => void;
  originalsOnly: boolean;
  onOriginalsOnly: (v: boolean) => void;
  mineOnly: boolean;
  onMineOnly: (v: boolean) => void;
  makerName: string | null;
  onClearMaker: () => void;
  vocab: { families: string[]; textures: string[]; milks: string[] };
  familyCounts: Map<string, number>;
  textureCounts: Map<string, number>;
  milkCounts: Map<string, number>;
  onClearAll: () => void;
  /** Dev-only draft overlay (photos + blurbs pending permission); null in production. */
  images: Map<string, DraftMedia> | null;
}

// One expansion step of the grid — the sentinel below auto-loads the next step
// before the reader reaches the bottom, and the button is the no-JS-observer path.
const PAGE = 96;

/** Consecutive runs of one family — the input is already family-sorted. */
function groupByFamily(rows: Cheese[]): { label: string; rows: Cheese[] }[] {
  const groups: { label: string; rows: Cheese[] }[] = [];
  for (const cheese of rows) {
    const label = familyLabel(cheese.family);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(cheese);
    else groups.push({ label, rows: [cheese] });
  }
  return groups;
}

export default function CheeseBrowse({
  loading,
  narrow,
  shown,
  filterKey,
  hints,
  nearMisses,
  creameriesById,
  awardsByCheese,
  heartSet,
  heartCount,
  onToggleHeart,
  recommendations,
  highlights,
  selectedId,
  onOpen,
  query,
  onQuery,
  family,
  onFamily,
  texture,
  onTexture,
  milk,
  onMilk,
  sort,
  onSort,
  awardedOnly,
  onAwardedOnly,
  originalsOnly,
  onOriginalsOnly,
  mineOnly,
  onMineOnly,
  makerName,
  onClearMaker,
  vocab,
  familyCounts,
  textureCounts,
  milkCounts,
  onClearAll,
  images,
}: Props) {
  const [visible, setVisible] = useState(PAGE);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = visible < shown.length;

  // Phones: the facets start folded; the button carries how many are set so a
  // narrowed list never reads as "the census is small". Desktop ignores this.
  const [facetsOpen, setFacetsOpen] = useState(false);
  const folded = narrow && !facetsOpen;

  function clearEverything() {
    onClearAll();
    onMineOnly(false);
    onSort(DEFAULT_CHEESE_SORT);
  }

  // Every filter in force, as a removable chip — visible with the facets
  // folded, so a short list always shows its cause and its undo. The maker
  // chip is the one a reader did not set here (it arrives from a creamery's
  // panel), so it leads.
  const chips: { key: string; label: string; aria: string; remove: () => void }[] = [];
  if (makerName) {
    chips.push({
      key: "maker",
      label: `from ${makerName}`,
      aria: `Stop filtering to ${makerName}`,
      remove: onClearMaker,
    });
  }
  if (family) {
    chips.push({
      key: "family",
      label: familyLabel(family),
      aria: `Remove the ${familyLabel(family)} filter`,
      remove: () => onFamily(""),
    });
  }
  if (texture) {
    const label = TEXTURE_LABEL[texture] ?? texture;
    chips.push({ key: "texture", label, aria: `Remove the ${label} filter`, remove: () => onTexture("") });
  }
  if (milk) {
    const label = `${MILK_LABEL[milk] ?? milk} milk`;
    chips.push({ key: "milk", label, aria: `Remove the ${label} filter`, remove: () => onMilk("") });
  }
  if (awardedOnly) {
    chips.push({
      key: "awarded",
      label: "Award winners",
      aria: "Remove the award winners filter",
      remove: () => onAwardedOnly(false),
    });
  }
  if (originalsOnly) {
    chips.push({
      key: "originals",
      label: "Wisconsin originals",
      aria: "Remove the Wisconsin originals filter",
      remove: () => onOriginalsOnly(false),
    });
  }
  if (mineOnly) {
    chips.push({
      key: "mine",
      label: "My cheeses",
      aria: "Show every cheese, not only the saved ones",
      remove: () => onMineOnly(false),
    });
  }
  if (sort !== DEFAULT_CHEESE_SORT) {
    chips.push({
      key: "sort",
      label: `Sort: ${SORT_LABEL[sort]}`,
      aria: `Back to the ${SORT_LABEL[DEFAULT_CHEESE_SORT]} sort`,
      remove: () => onSort(DEFAULT_CHEESE_SORT),
    });
  }
  const activeFacets = chips.length - (makerName ? 1 : 0);

  // A new question starts the reader back at the top of its answer.
  useEffect(() => {
    setVisible(PAGE);
    scroller.current?.scrollTo(0, 0);
  }, [filterKey]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    // The grid scrolls inside .cheese-scroll, so the observer must watch that
    // box: against the viewport, clipping defeated the margin and the next
    // page only mounted once the sentinel was already on screen.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
      },
      { root: scroller.current, rootMargin: "600px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, shown]);

  const slice = useMemo(() => shown.slice(0, visible), [shown, visible]);

  // The family heads count the whole answer, not the page of it that has
  // rendered so far — a number that grew as you scrolled was a number nobody
  // could trust.
  const familyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const cheese of shown) {
      const label = familyLabel(cheese.family);
      totals.set(label, (totals.get(label) ?? 0) + 1);
    }
    return totals;
  }, [shown]);

  // Ten "Aged Cheddar" cards in a row differ only by maker, so where a name
  // repeats in view the maker line leads with the weight.
  const repeated = useMemo(() => {
    const seen = new Map<string, number>();
    for (const cheese of slice) seen.set(cheese.name, (seen.get(cheese.name) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  }, [slice]);

  function renderCard(cheese: Cheese) {
    const media = images?.get(cheese.id);
    return (
      <CheeseCard
        key={cheese.id}
        cheese={cheese}
        creamery={creameriesById.get(cheese.creamery_id)}
        awards={awardsByCheese.get(cheese.id) ?? []}
        hint={hints.get(cheese.id)}
        hearted={heartSet.has(cheese.id)}
        selected={cheese.id === selectedId}
        leadMaker={repeated.has(cheese.name)}
        imageUrl={media?.image}
        blurb={media?.summary ?? undefined}
        onOpen={onOpen}
        onToggleHeart={onToggleHeart}
      />
    );
  }

  const band =
    highlights.length > 0 && shown.length > 0 ? (
      <div className="highlight-row" key="highlights">
        {highlights.map(({ highlight, cheese }) => (
          <button
            type="button"
            key={`${highlight.cheese_id}-${highlight.starts}`}
            className={`highlight${highlight.type === "sponsored" ? " sponsored" : ""}`}
            onClick={() => onOpen(cheese.id)}
          >
            <span className="kicker">
              {highlight.type === "sponsored"
                ? `Sponsored · ${highlight.sponsor}`
                : "From the cheese desk"}
            </span>
            <span className="hl-label">{highlight.label}</span>
            <span className="hl-name">
              {cheese.name} — {creameriesById.get(cheese.creamery_id)?.name}
            </span>
          </button>
        ))}
      </div>
    ) : null;

  /** The cheese-desk band inside the first grid: on a phone it follows the
   *  first row of cards, so the reader's answer comes before the paper's
   *  plug; on desktop it leads the grid as before. DOM order is the visual
   *  order either way. */
  function withBand(cards: ReactNode[], first: boolean): ReactNode[] {
    if (!band || !first) return cards;
    if (!narrow) return [band, ...cards];
    const row = Math.min(2, cards.length);
    return [...cards.slice(0, row), band, ...cards.slice(row)];
  }

  const trimmedQuery = query.trim();

  return (
    <div className="cheese-main">
      <div className="cheese-filters">
        <div className="cheese-filter-row">
          <input
            type="search"
            placeholder="Search cheeses"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search cheeses by name, creamery, family, flavor or add-in"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {narrow && (
            <button
              type="button"
              className={`facets-toggle${activeFacets ? " is-active" : ""}`}
              aria-expanded={facetsOpen}
              aria-controls="catalog-facets"
              onClick={() => setFacetsOpen((o) => !o)}
            >
              Filters &amp; sort
              {activeFacets > 0 && <span className="facets-count">{activeFacets}</span>}
              <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" />
              </svg>
            </button>
          )}
          <div className="cheese-facets" id="catalog-facets" hidden={folded}>
            <select
              value={family}
              onChange={(e) => onFamily(e.target.value)}
              aria-label="Filter by cheese family"
            >
              <option value="">All families</option>
              {vocab.families.map((f) => (
                <option key={f} value={f}>
                  {familyLabel(f)} ({familyCounts.get(f)})
                </option>
              ))}
            </select>
            <select
              value={texture}
              onChange={(e) => onTexture(e.target.value)}
              aria-label="Filter by texture"
            >
              <option value="">Any texture</option>
              {vocab.textures.map((t) => (
                <option key={t} value={t}>
                  {TEXTURE_LABEL[t] ?? t} ({textureCounts.get(t)})
                </option>
              ))}
            </select>
            <select
              value={milk}
              onChange={(e) => onMilk(e.target.value)}
              aria-label="Filter by milk"
            >
              <option value="">Any milk</option>
              {vocab.milks.map((m) => (
                <option key={m} value={m}>
                  {MILK_LABEL[m] ?? m} ({milkCounts.get(m)})
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as CheeseSortKey)}
              aria-label="Sort cheeses"
            >
              <option value="awards">Sort: Most awarded</option>
              <option value="name">Sort: A–Z</option>
              <option value="creamery">Sort: Creamery</option>
              <option value="family">Sort: Family</option>
            </select>
          </div>
        </div>
        {!trimmedQuery && (
          <div className="search-examples" aria-label="Example searches">
            <span>Try</span>
            {EXAMPLES.map((example) => (
              <button type="button" key={example} onClick={() => onQuery(example)}>
                {example}
              </button>
            ))}
          </div>
        )}
        <div className="filter-toggles" hidden={folded}>
          <label>
            <input
              type="checkbox"
              checked={awardedOnly}
              onChange={(e) => onAwardedOnly(e.target.checked)}
            />
            Award winners
          </label>
          <label>
            <input
              type="checkbox"
              checked={originalsOnly}
              onChange={(e) => onOriginalsOnly(e.target.checked)}
            />
            Wisconsin originals <span className="hint">(invented here)</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => onMineOnly(e.target.checked)}
            />
            My cheeses{heartCount > 0 ? ` (${heartCount})` : ""}
          </label>
        </div>
        {chips.length > 0 && (
          <div className="active-filters" aria-label="Filters in force">
            {chips.map((chip) => (
              <button
                type="button"
                key={chip.key}
                className="filter-chip"
                onClick={chip.remove}
                aria-label={chip.aria}
              >
                {chip.label}
                <span className="chip-x" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
            {chips.length > 1 && (
              <button type="button" className="linkish" onClick={clearEverything}>
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="cheese-scroll" ref={scroller}>
        {mineOnly && recommendations.length > 0 && (
          <section className="rail" aria-label="Cheeses to try next">
            <div className="rail-head">
              <h2>To try next</h2>
              <span>matched to what you’ve saved, by the census’s similarity engine</span>
            </div>
            <div className="rail-cards">
              {recommendations.map(({ cheese, because }) => (
                <div className="rec-card" key={cheese.id}>
                  <CheeseCard
                    cheese={cheese}
                    creamery={creameriesById.get(cheese.creamery_id)}
                    awards={awardsByCheese.get(cheese.id) ?? []}
                    hearted={heartSet.has(cheese.id)}
                    selected={cheese.id === selectedId}
                    compact
                    because={because.name}
                    imageUrl={images?.get(cheese.id)?.image}
                    onOpen={onOpen}
                    onToggleHeart={onToggleHeart}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <div className="cheese-grid" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div className="skel card" key={i}>
                <div className="bar" style={{ width: `${48 + ((i * 19) % 40)}%` }} />
                <div className="bar" style={{ width: `${28 + ((i * 13) % 30)}%` }} />
              </div>
            ))}
          </div>
        )}

        {!loading && sort === "family" ? (
          groupByFamily(slice).map((group, index) => (
            <div key={group.label}>
              <h3 className="county-head">
                <span>{group.label}</span>
                <span className="era-count">{familyTotals.get(group.label)}</span>
              </h3>
              <div className="cheese-grid">{withBand(group.rows.map(renderCard), index === 0)}</div>
            </div>
          ))
        ) : !loading ? (
          <div className="cheese-grid">{withBand(slice.map(renderCard), true)}</div>
        ) : null}

        {!loading && shown.length === 0 && (
          <div className="empty">
            {mineOnly && heartCount === 0 ? (
              <>
                <p>No saved cheeses yet.</p>
                <p>
                  Tap the ♥ on any cheese to start your list — it stays in this
                  browser, and the census will suggest cheeses to try next.
                </p>
                <button className="linkish" onClick={() => onMineOnly(false)}>
                  Browse the catalog
                </button>
              </>
            ) : trimmedQuery ? (
              <>
                <p className="empty-head">Nothing called “{trimmedQuery}”.</p>
                {nearMisses.length > 0 && (
                  <p className="near-misses">
                    Did you mean{" "}
                    {nearMisses.map((miss, i) => (
                      <span key={miss.id}>
                        {i > 0 ? (i === nearMisses.length - 1 ? " or " : ", ") : ""}
                        <button type="button" className="linkish" onClick={() => onQuery(miss.name)}>
                          {miss.name}
                        </button>
                      </span>
                    ))}
                    ?
                  </p>
                )}
                <p>Try a maker (Hook’s), a flavor (smoky) or a county (Green).</p>
                <p>
                  <button type="button" className="linkish" onClick={() => onQuery("")}>
                    Clear the search
                  </button>
                  {chips.length > 0 && (
                    <>
                      {" · "}
                      <button type="button" className="linkish" onClick={clearEverything}>
                        Clear the filters too
                      </button>
                    </>
                  )}
                </p>
              </>
            ) : (
              <>
                <p>No cheeses match those filters.</p>
                <button type="button" className="linkish" onClick={clearEverything}>
                  Clear filters
                </button>
              </>
            )}
          </div>
        )}

        {hasMore && (
          <div className="more-wrap" ref={sentinel}>
            <button className="more" onClick={() => setVisible((v) => v + PAGE)}>
              Show more ({(shown.length - visible).toLocaleString("en-US")} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
