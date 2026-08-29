import { useState } from "react";
import type { Award, Cheese, Creamery, FeaturedBoard, Highlight, Sponsor } from "../types";
import {
  AGE_LABEL,
  AGE_ORDER,
  MILK_LABEL,
  MILK_ORDER,
  TEXTURE_LABEL,
  TEXTURE_ORDER,
  chipLabel,
  familyLabel,
  flavorClass,
} from "../data";
import {
  BOARD_SIZES,
  GROUP_LABEL,
  GROUP_ORDER,
  boardCoverage,
  boardNudges,
  type BoardSuggestion,
} from "../boards";
import FlavorIcon from "./FlavorIcon";

// The paper's published submission address (news tips and reader content).
const NEWSROOM = "editor@wausaupilotandreview.com";

interface Props {
  loading: boolean;
  /** The board's cheeses, in pick order. */
  picks: Cheese[];
  size: number;
  cheesesById: Map<string, Cheese>;
  creameriesById: Map<string, Creamery>;
  awardsByCheese: Map<string, Award[]>;
  suggestions: BoardSuggestion[];
  /** Active highlight placements — the editorial/sponsored add path. */
  highlights: { highlight: Highlight; cheese: Cheese }[];
  /** The active sponsor for this surface, or null (slot absent). */
  sponsor: Sponsor | null;
  /** The curated gallery — reader submissions and cheese-desk boards. */
  featured: FeaturedBoard[];
  /** Load a featured board as the working board (its size comes with it). */
  onAdopt: (ids: string[]) => void;
  heartCount: number;
  /** The canonical share link for the current board (mirrors the URL). */
  shareUrl: string;
  onSetSize: (n: number) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onComplete: () => void;
  onSeed: () => void;
  onOpen: (id: string) => void;
}

export default function BoardView({
  loading,
  picks,
  size,
  cheesesById,
  creameriesById,
  awardsByCheese,
  suggestions,
  highlights,
  sponsor,
  featured,
  onAdopt,
  heartCount,
  shareUrl,
  onSetSize,
  onAdd,
  onRemove,
  onClear,
  onComplete,
  onSeed,
  onOpen,
}: Props) {
  const [copied, setCopied] = useState(false);
  const full = picks.length >= size;
  const cov = boardCoverage(picks, creameriesById);
  const nudges = boardNudges(picks, size, cov);
  const counties = [...cov.counties].sort();
  const onBoard = new Set(picks.map((c) => c.id));
  const highlightAdds = highlights.filter((h) => !onBoard.has(h.cheese.id));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — the address bar carries the same link.
    }
  }

  // Submissions go through the newsroom — the reader's own mail client, their
  // board's link prefilled, and the publication grant spelled out. Curation
  // lands in data/boards.json, so nothing reaches the gallery unreviewed.
  const submitBody = [
    ...(picks.length ? ["Here's my board:", shareUrl, ""] : []),
    "Attach a photo of the real spread (JPG is perfect) — sending it means",
    "Wausau Pilot & Review may publish it in The Cheese Census. Tell us the",
    "first name and town to credit.",
  ].join("\n");
  const submitHref = `mailto:${NEWSROOM}?subject=${encodeURIComponent(
    "My cheese board — The Cheese Census",
  )}&body=${encodeURIComponent(submitBody)}`;

  function meterCells(order: string[], labels: Record<string, string>, on: Set<string>) {
    return order.map((key) => (
      <span className={`meter-cell${on.has(key) ? " on" : ""}`} key={key}>
        {labels[key] ?? key}
      </span>
    ));
  }

  if (loading) {
    return (
      <div className="board-scroll">
        <div className="board-inner">
          <div className="empty">
            <p>Loading the census…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="board-scroll">
      <div className="board-inner">
        {sponsor && (
          <div className="board-sponsor" role="note">
            <span className="kicker">Made possible by</span>
            <span className="sp-name">
              {sponsor.url ? (
                <a href={sponsor.url} target="_blank" rel="noopener noreferrer">
                  {sponsor.name}
                </a>
              ) : (
                sponsor.name
              )}
            </span>
            <span className="sp-label">{sponsor.label}</span>
          </div>
        )}

        <header className="board-head">
          <h2>Build a Wisconsin cheese board</h2>
          <p className="board-lede">
            Pick a size and build toward balance — the meter reads your spread
            across texture, age, milk and flavor the way the census sees it, and
            every suggestion says what it would add.
          </p>
          <div className="board-controls">
            <div className="size-picker" role="group" aria-label="Board size">
              {BOARD_SIZES.map((n) => (
                <button
                  key={n}
                  aria-pressed={n === size}
                  onClick={() => onSetSize(n)}
                  title={`A ${n}-cheese board`}
                >
                  {n} cheeses
                </button>
              ))}
            </div>
            {!full && (
              <button className="board-action" onClick={onComplete}>
                Complete my board
              </button>
            )}
            {picks.length === 0 && heartCount > 0 && (
              <button className="board-action quiet" onClick={onSeed}>
                Start from my {heartCount} saved
              </button>
            )}
            {picks.length > 0 && (
              <button className="board-action quiet" onClick={onClear}>
                Start over
              </button>
            )}
          </div>
        </header>

        <div className="board-tray" aria-label="Your board">
          {Array.from({ length: size }, (_, i) => {
            const cheese = picks[i];
            if (!cheese) {
              return (
                <div className="board-slot empty" key={`empty-${i}`}>
                  {i === 0 && picks.length === 0
                    ? "An empty board — start from a suggestion, a featured board below, your saved cheeses, or any cheese's page in the catalog."
                    : "Empty slot"}
                </div>
              );
            }
            const maker = creameriesById.get(cheese.creamery_id);
            return (
              <div className="board-slot" key={cheese.id}>
                <span className="kicker">{familyLabel(cheese.family)}</span>
                <button
                  className="slot-name"
                  onClick={() => onOpen(cheese.id)}
                  title={`Open ${cheese.name}`}
                >
                  {cheese.name}
                </button>
                <span className="slot-maker">
                  {maker?.name ?? cheese.creamery_id}
                  {maker?.county ? ` · ${maker.county} Co.` : ""}
                </span>
                <span className="tags">
                  {cheese.flavor.slice(0, 2).map((f) => (
                    <span className={flavorClass(f)} key={f}>
                      <FlavorIcon term={f} />
                      {chipLabel(f)}
                    </span>
                  ))}
                </span>
                <button
                  className="slot-remove"
                  onClick={() => onRemove(cheese.id)}
                  aria-label={`Remove ${cheese.name} from the board`}
                  title="Remove from the board"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="board-meter" aria-label="Board balance">
          <div className="meter-row">
            <span className="meter-label">Texture</span>
            <div className="meter-cells">
              {meterCells(TEXTURE_ORDER, TEXTURE_LABEL, cov.textures)}
            </div>
          </div>
          <div className="meter-row">
            <span className="meter-label">Age</span>
            <div className="meter-cells">{meterCells(AGE_ORDER, AGE_LABEL, cov.ages)}</div>
          </div>
          <div className="meter-row">
            <span className="meter-label">Milk</span>
            <div className="meter-cells">{meterCells(MILK_ORDER, MILK_LABEL, cov.milks)}</div>
          </div>
          <div className="meter-row">
            <span className="meter-label">Flavor</span>
            <div className="meter-cells">
              {GROUP_ORDER.map((g) => (
                <span
                  className={`meter-cell${cov.groups.has(g) ? ` on f-${g}` : ""}`}
                  key={g}
                >
                  {GROUP_LABEL[g]}
                </span>
              ))}
            </div>
          </div>
          <p className={`meter-note${full && nudges.length === 0 ? " done" : ""}`} aria-live="polite">
            {picks.length === 0
              ? "The meter fills as you pick."
              : full && nudges.length === 0
                ? `That's a balanced board — soft to firm, ${
                    counties.length === 1
                      ? "one county"
                      : `${counties.length} counties`
                  } on one plate.`
                : full
                  ? `Full board. Consider a swap: ${nudges[0].charAt(0).toLowerCase()}${nudges[0].slice(1)}`
                  : (nudges[0] ?? "Good spread so far — keep going.")}
          </p>
          {counties.length > 1 && !full && (
            <p className="board-counties">
              Spans {counties.length} counties: {counties.join(", ")}
            </p>
          )}
        </div>

        {highlightAdds.length > 0 && !full && (
          <div className="board-hl-row">
            {highlightAdds.map(({ highlight, cheese }) => (
              <div
                className={`highlight board-hl${highlight.type === "sponsored" ? " sponsored" : ""}`}
                key={`${highlight.cheese_id}-${highlight.starts}`}
              >
                <span className="kicker">
                  {highlight.type === "sponsored"
                    ? `Sponsored · ${highlight.sponsor}`
                    : "From the cheese desk"}
                </span>
                <span className="hl-label">{highlight.label}</span>
                <button className="linkish" onClick={() => onOpen(cheese.id)}>
                  {cheese.name} — {creameriesById.get(cheese.creamery_id)?.name}
                </button>
                <button className="hl-add" onClick={() => onAdd(cheese.id)}>
                  + Add to the board
                </button>
              </div>
            ))}
          </div>
        )}

        {!full && suggestions.length > 0 && (
          <section className="board-suggest">
            <h3>Suggested next</h3>
            <div className="board-suggestions">
              {suggestions.map(({ cheese, gains }) => {
                const maker = creameriesById.get(cheese.creamery_id);
                return (
                  <div className="suggest-card" key={cheese.id}>
                    <span className="kicker">{familyLabel(cheese.family)}</span>
                    <button
                      className="s-name"
                      onClick={() => onOpen(cheese.id)}
                      title={`Open ${cheese.name}`}
                    >
                      {cheese.name}
                    </button>
                    <span className="s-maker">
                      {maker?.name}
                      {maker?.county ? ` · ${maker.county} Co.` : ""}
                    </span>
                    <span className="s-gains">
                      {gains.length ? (
                        gains.slice(0, 4).map((g) => (
                          <span className="s-gain" key={g}>
                            + {g}
                          </span>
                        ))
                      ) : (
                        <span className="s-gain">rounds it out</span>
                      )}
                    </span>
                    <button className="s-add" onClick={() => onAdd(cheese.id)}>
                      Add to the board
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="aka" style={{ marginTop: "0.5rem" }}>
              Ranked by what each cheese adds to <i>this</i> board — texture, age,
              milk and flavor the board lacks — with a nod to contest winners.
              Awards never outrank fit.
            </p>
          </section>
        )}

        {picks.length > 0 && (
          <section className="board-sheet">
            <h3>The shopping list</h3>
            {picks.map((cheese) => {
              const maker = creameriesById.get(cheese.creamery_id);
              const wins = awardsByCheese.get(cheese.id)?.length ?? 0;
              return (
                <div className="sheet-row" key={cheese.id}>
                  <span className="sh-name">{cheese.name}</span>
                  <span className="sh-where">
                    {maker?.name}
                    {maker ? ` — ${maker.city}` : ""}
                    {maker?.retail.store ? " · retail store" : ""}
                    {wins > 0 ? ` · ${wins} award${wins === 1 ? "" : "s"}` : ""}
                  </span>
                  <span className="sh-facts">
                    {familyLabel(cheese.family)} · {TEXTURE_LABEL[cheese.texture]}
                  </span>
                </div>
              );
            })}
            <p className="sheet-foot">
              {counties.length > 0 && (
                <>
                  Spans {counties.length === 1 ? "one county" : `${counties.length} counties`}
                  {counties.length > 1 ? ` (${counties.join(", ")})` : ` (${counties[0]})`}
                  {" · "}
                </>
              )}
              Picked with The Cheese Census — Wausau Pilot &amp; Review
              {sponsor ? ` · Board Builder made possible by ${sponsor.name}` : ""}
            </p>
            <p className="sheet-link">{shareUrl}</p>
            <div className="board-share">
              <button className="board-action quiet" onClick={copyLink}>
                {copied ? "Copied ✓" : "Copy board link"}
              </button>
              <button className="board-action quiet" onClick={() => window.print()}>
                Print the list
              </button>
              <a className="board-action quiet" href={submitHref}>
                Send it to the newsroom
              </a>
            </div>
          </section>
        )}

        {featured.length > 0 && (
          <section className="board-featured">
            <h3>Featured boards</h3>
            <div className="featured-row">
              {featured.map((b) => (
                <div className="featured-card" key={b.id}>
                  {b.image && (
                    <img
                      className="featured-photo"
                      src={`${import.meta.env.BASE_URL}boards/${b.image}`}
                      alt={`${b.title} — ${b.credit}'s board`}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  )}
                  <span className="kicker">
                    {b.source === "editorial"
                      ? "From the cheese desk"
                      : `Shared by ${b.credit}`}
                  </span>
                  <span className="featured-title">{b.title}</span>
                  <span className="featured-picks">
                    {b.cheese_ids.map((id) => {
                      const cheese = cheesesById.get(id);
                      if (!cheese) return null;
                      const maker = creameriesById.get(cheese.creamery_id);
                      return (
                        <button
                          className="featured-pick"
                          key={id}
                          onClick={() => onOpen(id)}
                          title={maker ? `${cheese.name} — ${maker.name}` : cheese.name}
                        >
                          {cheese.name}
                        </button>
                      );
                    })}
                  </span>
                  <button
                    className="s-add"
                    onClick={() => onAdopt(b.cheese_ids)}
                    title="Replaces your current picks"
                  >
                    Use this board
                  </button>
                </div>
              ))}
            </div>
            <p className="aka" style={{ marginTop: "0.55rem" }}>
              Made one worth showing off?{" "}
              <a className="linkish" href={submitHref}>
                Email your board&apos;s link and a photo to the newsroom
              </a>{" "}
              — reader boards land here, credited by first name and town.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
