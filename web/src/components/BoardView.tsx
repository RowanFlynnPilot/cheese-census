import { useEffect, useRef, useState } from "react";
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
  safeHref,
  type DraftMedia,
} from "../data";
import {
  AGE_WORD,
  BOARD_SIZES,
  GROUP_LABEL,
  GROUP_ORDER,
  type BoardCoverage,
  type BoardSuggestion,
  type Nudge,
} from "../boards";
import DraftPhoto from "./DraftPhoto";
import FlavorIcon from "./FlavorIcon";
import { hasShareSheet, shareLink } from "../share";

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
  coverage: BoardCoverage;
  /** What the meter asks for, in priority order (the rail answers the first). */
  nudges: Nudge[];
  suggestions: BoardSuggestion[];
  /** A full board that still wants something: candidates answering the nudge,
   *  and the pick each would replace. */
  swap: { candidates: BoardSuggestion[]; replacing: Cheese } | null;
  /** Active highlight placements — the editorial/sponsored add path. */
  highlights: { highlight: Highlight; cheese: Cheese }[];
  /** The active sponsor for this surface, or null (slot absent). */
  sponsor: Sponsor | null;
  /** The curated gallery — reader submissions and cheese-desk boards. */
  featured: FeaturedBoard[];
  /** Load a featured board as the working board (its size comes with it). */
  onAdopt: (ids: string[], title: string) => void;
  /** Dev-only draft overlay (product photos pending permission); null in production. */
  images: Map<string, DraftMedia> | null;
  heartCount: number;
  /** The canonical share link for the current board (mirrors the URL). */
  shareUrl: string;
  /** A board just replaced or cleared, restorable for a few seconds. */
  undo: { label: string } | null;
  onUndo: () => void;
  onSetSize: (n: number) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onComplete: () => void;
  onSeed: () => void;
  onSwap: (id: string) => void;
  onOpen: (id: string) => void;
}

type FocusAfter = { kind: "slot"; id: string } | { kind: "tray" } | null;

export default function BoardView({
  loading,
  picks,
  size,
  cheesesById,
  creameriesById,
  awardsByCheese,
  coverage: cov,
  nudges,
  suggestions,
  swap,
  highlights,
  sponsor,
  featured,
  onAdopt,
  images,
  heartCount,
  shareUrl,
  undo,
  onUndo,
  onSetSize,
  onAdd,
  onRemove,
  onClear,
  onComplete,
  onSeed,
  onSwap,
  onOpen,
}: Props) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [pendingSize, setPendingSize] = useState<number | null>(null);
  const tray = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Where focus lands once the board has re-rendered after an action, so a
  // keyboard or screen-reader user is never dropped at the top of the page.
  const focusAfter = useRef<FocusAfter>(null);

  const full = picks.length >= size;
  const stops = new Set(picks.map((c) => c.creamery_id)).size;
  const onBoard = new Set(picks.map((c) => c.id));
  const highlightAdds = highlights.filter((h) => !onBoard.has(h.cheese.id));
  const sponsorHref = safeHref(sponsor?.url);
  const lead = nudges[0] ?? null;

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    // preventScroll: a plain focus() scrolls every ancestor, the embedding
    // article included, to reveal the element.
    if (target.kind === "slot") {
      tray.current
        ?.querySelector<HTMLElement>(`[data-chid="${CSS.escape(target.id)}"]`)
        ?.focus({ preventScroll: true });
    } else {
      tray.current?.focus({ preventScroll: true });
    }
  }, [picks]);

  useEffect(() => {
    if (pendingSize !== null) confirmButton.current?.focus();
  }, [pendingSize]);

  function add(id: string) {
    focusAfter.current = { kind: "slot", id };
    onAdd(id);
  }
  function remove(id: string) {
    focusAfter.current = { kind: "tray" };
    onRemove(id);
  }
  function complete() {
    focusAfter.current = { kind: "tray" };
    onComplete();
  }
  function swapIn(id: string) {
    focusAfter.current = { kind: "slot", id };
    onSwap(id);
  }

  // Growing is free; shrinking drops the newest picks, so it asks first.
  function pickSize(n: number) {
    setPendingSize(null);
    if (n < picks.length) setPendingSize(n);
    else onSetSize(n);
  }

  // The phone's share sheet where there is one (the board goes straight into a
  // text or an email), the clipboard otherwise; a denied clipboard (in-app
  // browsers, permissions) shows the link itself to select by hand.
  async function copyLink() {
    const result = await shareLink(shareUrl, "My Wisconsin cheese board — The Cheese Census");
    if (result === "shared" || result === "dismissed") return;
    setCopied(result === "copied" ? "done" : "failed");
    if (result === "copied") window.setTimeout(() => setCopied("idle"), 1600);
  }
  const sheet = hasShareSheet();

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

  /** What a meter row covers, spelled out for screen readers — the cells
   *  themselves carry the state only as color and weight. */
  function covered(order: string[], labels: Record<string, string>, on: Set<string>) {
    const names = order.filter((k) => on.has(k)).map((k) => labels[k] ?? k);
    return names.length ? names.join(", ") : "none yet";
  }

  function meterCells(order: string[], labels: Record<string, string>, on: Set<string>) {
    return order.map((key) => (
      <span className={`meter-cell${on.has(key) ? " on" : ""}`} key={key}>
        {labels[key] ?? key}
      </span>
    ));
  }

  /** "Semi-hard · medium age · cow" — the sheet speaks plainly. */
  function plainFacts(cheese: Cheese) {
    return [
      TEXTURE_LABEL[cheese.texture] ?? cheese.texture,
      AGE_WORD[cheese.age_band] ?? cheese.age_band,
      cheese.milk.map((m) => (MILK_LABEL[m] ?? m).toLowerCase()).join(" & "),
    ].join(" · ");
  }

  function suggestionCard(
    { cheese, gains }: BoardSuggestion,
    action: { label: string; ariaLabel: string; onClick: () => void },
  ) {
    const maker = creameriesById.get(cheese.creamery_id);
    const photo = images?.get(cheese.id)?.image;
    return (
      <div className="suggest-card" key={cheese.id}>
        {photo && (
          <DraftPhoto
            src={photo}
            alt={`${cheese.name} — product photo (draft)`}
            className="s-photo"
          />
        )}
        <span className="kicker">{familyLabel(cheese.family)}</span>
        <button className="s-name" onClick={() => onOpen(cheese.id)} data-chid={cheese.id}>
          {cheese.name}
        </button>
        <span className="s-maker">
          {maker?.name}
          {maker?.county ? ` · ${maker.county} Co.` : ""}
        </span>
        <span className="s-gains">
          {gains.length ? (
            gains.slice(0, 4).map((g) => (
              <span className={`s-gain${g.startsWith("needed:") ? " lead" : ""}`} key={g}>
                {g.startsWith("needed:") ? g : `+ ${g}`}
              </span>
            ))
          ) : (
            <span className="s-gain">rounds it out</span>
          )}
        </span>
        <button className="s-add" onClick={action.onClick} aria-label={action.ariaLabel}>
          {action.label}
        </button>
      </div>
    );
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

  // The shopping list groups by creamery: one stop, however many cheeses.
  const stopOrder: string[] = [];
  for (const cheese of picks) {
    if (!stopOrder.includes(cheese.creamery_id)) stopOrder.push(cheese.creamery_id);
  }

  return (
    <div className="board-scroll">
      <div className="board-inner">
        <header className="board-head">
          <h2>Build a Wisconsin cheese board</h2>
          <p className="board-lede">
            Pick a size, then build toward balance. The meter reads your spread
            across texture, age, milk and flavor; every suggestion says what it adds.
          </p>
        </header>

        {sponsor && (
          <div className="board-sponsor" role="note">
            <span className="kicker">Made possible by</span>
            <span className="sp-name">
              {sponsorHref ? (
                <a href={sponsorHref} target="_blank" rel="noopener noreferrer">
                  {sponsor.name}
                </a>
              ) : (
                sponsor.name
              )}
            </span>
            <span className="sp-label">{sponsor.label}</span>
          </div>
        )}

        <div className="board-controls">
          <div className="size-picker" role="group" aria-label="Board size">
            {BOARD_SIZES.map((n) => (
              <button
                key={n}
                aria-pressed={n === size}
                onClick={() => pickSize(n)}
                aria-label={`${n}-cheese board`}
              >
                {n} cheeses
              </button>
            ))}
          </div>
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

        {pendingSize !== null && (
          <div className="confirm-strip" role="group" aria-label="Confirm the smaller board">
            <span>
              Keep {pendingSize}? You&apos;ll drop{" "}
              {picks
                .slice(pendingSize)
                .map((c) => c.name)
                .join(" and ")}
              .
            </span>
            <span className="strip-actions">
              <button
                ref={confirmButton}
                className="board-action"
                onClick={() => {
                  onSetSize(pendingSize);
                  setPendingSize(null);
                }}
              >
                Keep {pendingSize}
              </button>
              <button className="board-action quiet" onClick={() => setPendingSize(null)}>
                Never mind
              </button>
            </span>
          </div>
        )}

        <div className="undo-strip" role="status" aria-live="polite">
          {undo && (
            <>
              <span>{undo.label}.</span>
              <button className="board-action quiet" onClick={onUndo}>
                Undo
              </button>
            </>
          )}
        </div>

        <div
          className="board-tray"
          role="group"
          aria-label="Your board"
          tabIndex={-1}
          ref={tray}
          data-size={size}
        >
          {Array.from({ length: size }, (_, i) => {
            const cheese = picks[i];
            if (!cheese) {
              const firstEmpty = i === picks.length;
              return (
                <div className="board-slot empty" key={`empty-${i}`}>
                  {firstEmpty ? (
                    <>
                      <span>{picks.length ? "Room for more." : "An empty board."}</span>
                      <button className="board-action" onClick={complete}>
                        {picks.length ? "Fill the rest for me" : "Fill it for me"}
                      </button>
                      <span className="slot-hint">or add from the suggestions below</span>
                    </>
                  ) : (
                    "Empty slot"
                  )}
                </div>
              );
            }
            const maker = creameriesById.get(cheese.creamery_id);
            const photo = images?.get(cheese.id)?.image;
            return (
              <div className="board-slot" key={cheese.id}>
                {photo && (
                  <DraftPhoto
                    src={photo}
                    alt={`${cheese.name} — product photo (draft)`}
                    className="slot-photo"
                  />
                )}
                <span className="kicker">{familyLabel(cheese.family)}</span>
                <button
                  className="slot-name"
                  onClick={() => onOpen(cheese.id)}
                  data-chid={cheese.id}
                  aria-label={`Open ${cheese.name}`}
                >
                  {cheese.name}
                </button>
                <span className="slot-maker">
                  {maker?.name ?? cheese.creamery_id}
                  {maker?.county ? ` · ${maker.county} Co.` : ""}
                </span>
                <span className="tags">
                  {maker?.status === "closed" && (
                    <span className="pill closed">Creamery closed</span>
                  )}
                  {cheese.flavor.slice(0, 2).map((f) => (
                    <span className={flavorClass(f)} key={f}>
                      <FlavorIcon term={f} />
                      {chipLabel(f)}
                    </span>
                  ))}
                </span>
                <button
                  className="slot-remove"
                  onClick={() => remove(cheese.id)}
                  aria-label={`Remove ${cheese.name} from the board`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div className="board-meter" role="group" aria-label="Board balance">
          <div
            className="meter-row"
            role="group"
            aria-label={`Texture covered: ${covered(TEXTURE_ORDER, TEXTURE_LABEL, cov.textures)}`}
          >
            <span className="meter-label">Texture</span>
            <div className="meter-cells" aria-hidden="true">
              {meterCells(TEXTURE_ORDER, TEXTURE_LABEL, cov.textures)}
            </div>
          </div>
          <div
            className="meter-row"
            role="group"
            aria-label={`Age covered: ${covered(AGE_ORDER, AGE_LABEL, cov.ages)}`}
          >
            <span className="meter-label">Age</span>
            <div className="meter-cells" aria-hidden="true">
              {meterCells(AGE_ORDER, AGE_LABEL, cov.ages)}
            </div>
          </div>
          <div
            className="meter-row"
            role="group"
            aria-label={`Milk covered: ${covered(MILK_ORDER, MILK_LABEL, cov.milks)}`}
          >
            <span className="meter-label">Milk</span>
            <div className="meter-cells" aria-hidden="true">
              {meterCells(MILK_ORDER, MILK_LABEL, cov.milks)}
            </div>
          </div>
          <div
            className="meter-row"
            role="group"
            aria-label={`Flavor families covered: ${covered(GROUP_ORDER, GROUP_LABEL, cov.groups)}`}
          >
            <span className="meter-label">Flavor</span>
            <div className="meter-cells" aria-hidden="true">
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
          <p
            className={`meter-note${full && !lead ? " done" : ""}`}
            aria-live="polite"
          >
            {picks.length === 0
              ? "The meter fills as you pick."
              : lead
                ? full
                  ? `Full board. ${lead.text}`
                  : lead.text
                : full
                  ? `That's a balanced board — soft to firm, ${stops === 1 ? "one stop" : `${stops} stops`} to shop.`
                  : "Good spread so far — keep going."}
          </p>
        </div>

        {swap && swap.candidates.length > 0 && (
          <section className="board-suggest">
            <h3>To answer that, swap one in</h3>
            <div className="board-suggestions">
              {swap.candidates.map((s) =>
                suggestionCard(s, {
                  label: `Swap in for ${swap.replacing.name}`,
                  ariaLabel: `Swap ${s.cheese.name} in for ${swap.replacing.name}${
                    creameriesById.get(swap.replacing.creamery_id)
                      ? ` from ${creameriesById.get(swap.replacing.creamery_id)!.name}`
                      : ""
                  }`,
                  onClick: () => swapIn(s.cheese.id),
                }),
              )}
            </div>
            <p className="aka">
              {swap.replacing.name}
              {creameriesById.get(swap.replacing.creamery_id)
                ? ` (${creameriesById.get(swap.replacing.creamery_id)!.name})`
                : ""}{" "}
              is the pick the board can best spare — it adds the least that nothing else
              covers.
            </p>
          </section>
        )}

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
                <button className="hl-open" onClick={() => onOpen(cheese.id)} data-chid={cheese.id}>
                  {cheese.name} — {creameriesById.get(cheese.creamery_id)?.name}
                </button>
                <button
                  className="hl-add"
                  onClick={() => add(cheese.id)}
                  aria-label={`Add ${cheese.name} to the board`}
                >
                  Add to the board
                </button>
              </div>
            ))}
          </div>
        )}

        {!full && suggestions.length > 0 && (
          <section className="board-suggest">
            <h3>{lead?.want ? `Suggested next — ${lead.want} first` : "Suggested next"}</h3>
            <div className="board-suggestions">
              {suggestions.map((s) =>
                suggestionCard(s, {
                  label: "Add to the board",
                  ariaLabel: `Add ${s.cheese.name} to the board`,
                  onClick: () => add(s.cheese.id),
                }),
              )}
            </div>
            <p className="aka">
              Ranked by what each cheese adds to this board — what the meter asks for
              first, then texture, age, milk and flavor it lacks, with a nod to contest
              winners. Awards never outrank fit.
            </p>
          </section>
        )}

        {picks.length > 0 && (
          <section className="board-sheet">
            <h3>The shopping list</h3>
            {stopOrder.map((creameryId) => {
              const maker = creameriesById.get(creameryId);
              const site = safeHref(maker?.website);
              const closed = maker?.status === "closed";
              return (
                <div className="sheet-group" key={creameryId}>
                  <div className="sheet-group-head">
                    <span className="sh-maker">
                      {maker?.name ?? creameryId}
                      {closed && <span className="pill closed">Closed</span>}
                    </span>
                    {maker && (
                      <span className="sheet-addr">
                        {maker.address ? `${maker.address}, ` : ""}
                        {maker.city}
                        {maker.retail.store
                          ? " · store at the creamery"
                          : " · no creamery store — try your grocer"}
                        {site && (
                          <>
                            {" · "}
                            <a href={site} target="_blank" rel="noopener noreferrer">
                              {site.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            </a>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {picks
                    .filter((c) => c.creamery_id === creameryId)
                    .map((cheese) => {
                      const wins = awardsByCheese.get(cheese.id)?.length ?? 0;
                      return (
                        <div className="sheet-row" key={cheese.id}>
                          <span className="sh-name">{cheese.name}</span>
                          <span className="sh-facts">
                            {plainFacts(cheese)}
                            {wins > 0 ? ` · ${wins} award${wins === 1 ? "" : "s"}` : ""}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
            <p className="sheet-foot">
              {stops === 1 ? "One stop" : `${stops} stops`} · Picked with The Cheese
              Census — Wausau Pilot &amp; Review
              {sponsor ? ` · Board Builder made possible by ${sponsor.name}` : ""}
            </p>
            <p className={`sheet-link${copied === "failed" ? " is-shown" : ""}`}>
              {shareUrl}
            </p>
            <div className="board-share">
              <button className="board-action" onClick={copyLink}>
                {copied === "done"
                  ? "Copied ✓"
                  : copied === "failed"
                    ? "Couldn't copy — select the link above"
                    : sheet
                      ? "Share this board"
                      : "Copy board link"}
              </button>
              <span className="sr-only" role="status">
                {copied === "done"
                  ? "Board link copied"
                  : copied === "failed"
                    ? "Couldn't copy — the link is shown above the buttons"
                    : ""}
              </span>
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
                          aria-label={maker ? `Open ${cheese.name} from ${maker.name}` : `Open ${cheese.name}`}
                        >
                          {cheese.name}
                        </button>
                      );
                    })}
                  </span>
                  <button
                    className="s-add"
                    onClick={() => onAdopt(b.cheese_ids, b.title)}
                    aria-label={`Use the ${b.title} as my board`}
                  >
                    Use this board
                  </button>
                </div>
              ))}
            </div>
            <p className="aka">
              Made one worth showing off? Email your board&apos;s link and a photo to{" "}
              <a className="linkish" href={submitHref}>
                {NEWSROOM}
              </a>{" "}
              — reader boards land here, credited by first name and town.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
