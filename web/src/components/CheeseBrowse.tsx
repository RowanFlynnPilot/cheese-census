import { useEffect, useRef, useState } from "react";
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

interface Props {
  loading: boolean;
  shown: Cheese[];
  hints: Map<string, string>;
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
  shown,
  hints,
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
  onClearAll,
  images,
}: Props) {
  const [visible, setVisible] = useState(PAGE);
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = visible < shown.length;

  // A new filtered set starts the reader back at the top of it.
  useEffect(() => {
    setVisible(PAGE);
    scroller.current?.scrollTo(0, 0);
  }, [shown]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
      },
      { rootMargin: "600px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, shown]);

  const slice = shown.slice(0, visible);

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
        imageUrl={media?.image}
        blurb={media?.summary ?? undefined}
        onOpen={() => onOpen(cheese.id)}
        onToggleHeart={() => onToggleHeart(cheese.id)}
      />
    );
  }

  return (
    <div className="cheese-main">
      {images && images.size > 0 && (
        <div className="draftbar" role="note">
          Internal draft — {images.size} product photos hotlinked from creamery
          sites for review only, pending each creamery&apos;s permission. Not for
          publication.
        </div>
      )}
      <div className="cheese-filters">
        <div className="cheese-filter-row">
          <input
            type="search"
            placeholder="Search cheeses, creameries, or a flavor — try “habanero”"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search cheeses by name, creamery, family, flavor or add-in"
          />
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
                {TEXTURE_LABEL[t] ?? t}
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
                {MILK_LABEL[m] ?? m}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as CheeseSortKey)}
            aria-label="Sort cheeses"
          >
            <option value="name">Sort: A–Z</option>
            <option value="creamery">Sort: Creamery</option>
            <option value="awards">Sort: Most awarded</option>
            <option value="family">Sort: Family</option>
          </select>
        </div>
        <div className="filter-toggles">
          <label>
            <input
              type="checkbox"
              checked={awardedOnly}
              onChange={(e) => onAwardedOnly(e.target.checked)}
            />
            Award winners
          </label>
          <label title="Cheeses invented in Wisconsin">
            <input
              type="checkbox"
              checked={originalsOnly}
              onChange={(e) => onOriginalsOnly(e.target.checked)}
            />
            Wisconsin originals
          </label>
          <label>
            <input
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => onMineOnly(e.target.checked)}
            />
            My cheeses{heartCount > 0 ? ` (${heartCount})` : ""}
          </label>
          {makerName && (
            <span className="maker-chip">
              from {makerName}
              <button
                type="button"
                onClick={onClearMaker}
                aria-label={`Stop filtering to ${makerName}`}
              >
                ×
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="cheese-scroll" ref={scroller}>
        {highlights.length > 0 && (
          <div className="highlight-row">
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
        )}

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
                    onOpen={() => onOpen(cheese.id)}
                    onToggleHeart={() => onToggleHeart(cheese.id)}
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
          groupByFamily(slice).map((group) => (
            <div key={group.label}>
              <div className="county-head">
                <span>{group.label}</span>
                <span className="era-count">{group.rows.length}</span>
              </div>
              <div className="cheese-grid">{group.rows.map(renderCard)}</div>
            </div>
          ))
        ) : !loading ? (
          <div className="cheese-grid">{slice.map(renderCard)}</div>
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
            ) : (
              <>
                <p>No cheeses match those filters.</p>
                <button className="linkish" onClick={onClearAll}>
                  Clear filters
                </button>
              </>
            )}
          </div>
        )}

        {hasMore && (
          <div className="more-wrap" ref={sentinel}>
            <button className="more" onClick={() => setVisible((v) => v + PAGE)}>
              Show more ({shown.length - visible} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
