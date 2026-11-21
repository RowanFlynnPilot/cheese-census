import type { Cheese, Creamery, WeeklyTrio } from "../types";
import { safeHref } from "../data";

/** "This week's three": three cheeses recommended by a local business (the
 *  weekly sponsored slot) or, on an unsold week, by the cheese desk. The two
 *  must never look alike — a sold week wears the sponsored visual language
 *  and says "Sponsored" before anything else. */
export default function TrioCard({
  trio,
  cheeses,
  creameriesById,
  onOpen,
  onUse,
  useLabel,
}: {
  trio: WeeklyTrio;
  /** The three picks, resolved, in the picker's order. */
  cheeses: Cheese[];
  creameriesById: Map<string, Creamery>;
  onOpen: (id: string) => void;
  /** Seed the Board Builder with the three. */
  onUse: () => void;
  useLabel: string;
}) {
  const sponsored = trio.source === "sponsored";
  const href = safeHref(trio.url);
  const notes = new Map(trio.picks.map((p) => [p.cheese_id, p.note]));
  return (
    <section
      className={`highlight trio${sponsored ? " sponsored" : ""}`}
      aria-label={
        sponsored
          ? `Sponsored: this week's three cheeses, picked by ${trio.name}`
          : "This week's three cheeses, from the cheese desk"
      }
    >
      <span className="kicker">{sponsored ? "Sponsored" : "From the cheese desk"}</span>
      <h3 className="trio-title">
        This week&rsquo;s three
        {sponsored && (
          <span className="trio-by">
            {" "}
            picked by{" "}
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer sponsored">
                {trio.name}
              </a>
            ) : (
              trio.name
            )}
          </span>
        )}
      </h3>
      <ol className="trio-picks">
        {cheeses.map((cheese) => {
          const maker = creameriesById.get(cheese.creamery_id);
          const note = notes.get(cheese.id);
          return (
            <li key={cheese.id}>
              <button
                type="button"
                className="trio-pick"
                onClick={() => onOpen(cheese.id)}
                data-chid={cheese.id}
              >
                <span className="trio-name">{cheese.name}</span>
                {maker && <span className="trio-maker">{maker.name}</span>}
              </button>
              {note && (
                <span className="trio-note">
                  &ldquo;{note}&rdquo;
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className="trio-use" onClick={onUse}>
        {useLabel}
      </button>
    </section>
  );
}
