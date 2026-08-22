import type { Award, Cheese, Creamery } from "../types";
import {
  MILK_LABEL,
  awardCitation,
  chipLabel,
  familyLabel,
  flavorClass,
  topAward,
} from "../data";
import DraftPhoto from "./DraftPhoto";
import FlavorIcon from "./FlavorIcon";
import HeartButton from "./HeartButton";

interface Props {
  cheese: Cheese;
  creamery: Creamery | undefined;
  /** This cheese's contest wins — drives the seal and the citation line. */
  awards: Award[];
  /** Why this card matched a search when its name and maker didn't. */
  hint?: string;
  hearted: boolean;
  selected: boolean;
  /** Rail cards drop the tag row and badges to stay scannable. */
  compact?: boolean;
  /** "because you saved X" — only the recommendation rail passes this. */
  because?: string;
  /** Dev-only draft overlay (photo + maker's blurb pending permission);
   *  absent in production. */
  imageUrl?: string;
  blurb?: string;
  onOpen: () => void;
  onToggleHeart: () => void;
}

const TAG_LIMIT = 3;

/** Rosette: a seal with ribbon tails, filled in currentColor. */
const ROSETTE = (
  <>
    <circle cx="12" cy="8.6" r="5.4" />
    <path d="M8.9 12.9 7 20.4l3.4-2 1.6 3.1 1.6-3.1 3.4 2-1.9-7.5a6.6 6.6 0 0 1-6.2 0z" />
  </>
);

export default function CheeseCard({
  cheese,
  creamery,
  awards,
  hint,
  hearted,
  selected,
  compact,
  because,
  imageUrl,
  blurb,
  onOpen,
  onToggleHeart,
}: Props) {
  const flavors = cheese.flavor.slice(0, TAG_LIMIT);
  const overflow = cheese.flavor.length - flavors.length;
  const specialMilk = cheese.milk.filter((m) => m !== "cow");
  const best = topAward(awards);
  const citation = best ? awardCitation(best) : null;

  return (
    <div className={`cheese-card${compact ? " compact" : ""}`}>
      <button
        type="button"
        className="card-open"
        data-chid={cheese.id}
        aria-current={selected || undefined}
        onClick={onOpen}
      >
        {imageUrl && (
          <DraftPhoto
            src={imageUrl}
            alt={`${cheese.name} — product photo (draft)`}
            className="card-photo"
          />
        )}
        <span className="kicker">{familyLabel(cheese.family)}</span>
        <span className="cheese-name">{cheese.name}</span>
        <span className="cheese-maker">
          {creamery?.name ?? cheese.creamery_id}
          {creamery?.county ? ` · ${creamery.county} Co.` : ""}
        </span>
        {because && <span className="because">because you saved {because}</span>}
        {!compact && (
          <>
            <span className="tags">
              {flavors.map((f) => (
                <span className={flavorClass(f)} key={f}>
                  <FlavorIcon term={f} />
                  {chipLabel(f)}
                </span>
              ))}
              {overflow > 0 && <span className="tag more">+{overflow}</span>}
              {cheese.add_ins.map((a) => (
                <span className="tag addin" key={a}>
                  {chipLabel(a)}
                </span>
              ))}
            </span>
            {blurb && <span className="card-blurb">“{blurb}”</span>}
            {hint && <span className="op-hint">matched: {hint}</span>}
            {(citation ||
              cheese.wisconsin_original ||
              cheese.raw_milk ||
              specialMilk.length > 0) && (
            <span className="card-foot">
              {(cheese.wisconsin_original ||
                cheese.raw_milk ||
                specialMilk.length > 0) && (
                <span className="badges">
                  {cheese.wisconsin_original && (
                    <span className="pill wo">Wisconsin original</span>
                  )}
                  {cheese.raw_milk && <span className="pill raw">Raw milk</span>}
                  {specialMilk.length > 0 && (
                    <span className="pill milk">
                      {specialMilk.map((m) => MILK_LABEL[m] ?? m).join(" & ")} milk
                    </span>
                  )}
                </span>
              )}
              {citation && (
                <span className="card-won">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {ROSETTE}
                  </svg>
                  <span>
                    {citation}
                    {awards.length > 1 &&
                      ` · +${awards.length - 1} more award${awards.length > 2 ? "s" : ""}`}
                  </span>
                </span>
              )}
            </span>
            )}
          </>
        )}
      </button>
      {best && (
        <span
          className="card-seal"
          role="img"
          aria-label={`Award winner: ${citation}`}
          title={citation ?? undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {ROSETTE}
          </svg>
        </span>
      )}
      <HeartButton
        hearted={hearted}
        name={cheese.name}
        onToggle={onToggleHeart}
        className="card-heart"
      />
    </div>
  );
}
