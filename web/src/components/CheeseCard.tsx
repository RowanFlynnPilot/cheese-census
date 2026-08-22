import type { Cheese, Creamery } from "../types";
import { MILK_LABEL, chipLabel, familyLabel, flavorClass } from "../data";
import DraftPhoto from "./DraftPhoto";
import FlavorIcon from "./FlavorIcon";
import HeartButton from "./HeartButton";

interface Props {
  cheese: Cheese;
  creamery: Creamery | undefined;
  awardCount: number;
  /** Why this card matched a search when its name and maker didn't. */
  hint?: string;
  hearted: boolean;
  selected: boolean;
  /** Rail cards drop the tag row and badges to stay scannable. */
  compact?: boolean;
  /** "because you saved X" — only the recommendation rail passes this. */
  because?: string;
  /** Dev-only draft overlay (photos pending permission); absent in production. */
  imageUrl?: string;
  onOpen: () => void;
  onToggleHeart: () => void;
}

const TAG_LIMIT = 3;

export default function CheeseCard({
  cheese,
  creamery,
  awardCount,
  hint,
  hearted,
  selected,
  compact,
  because,
  imageUrl,
  onOpen,
  onToggleHeart,
}: Props) {
  const flavors = cheese.flavor.slice(0, TAG_LIMIT);
  const overflow = cheese.flavor.length - flavors.length;
  const specialMilk = cheese.milk.filter((m) => m !== "cow");

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
            {(awardCount > 0 ||
              cheese.wisconsin_original ||
              cheese.raw_milk ||
              specialMilk.length > 0) && (
              <span className="badges">
                {awardCount > 0 && (
                  <span className="pill award">
                    {awardCount} award{awardCount === 1 ? "" : "s"}
                  </span>
                )}
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
            {hint && <span className="op-hint">matched: {hint}</span>}
          </>
        )}
      </button>
      <HeartButton
        hearted={hearted}
        name={cheese.name}
        onToggle={onToggleHeart}
        className="card-heart"
      />
    </div>
  );
}
