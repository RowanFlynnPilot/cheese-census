import { useEffect, useRef, useState } from "react";
import type { Award, Cheese, Creamery, Highlight } from "../types";
import {
  AGE_LABEL,
  CONTEST,
  MILK_LABEL,
  PLACEMENT,
  RIND_LABEL,
  TEXTURE_LABEL,
  chipLabel,
  familyLabel,
  flavorClass,
  labelize,
} from "../data";
import DraftPhoto from "./DraftPhoto";
import FlavorIcon from "./FlavorIcon";
import HeartButton from "./HeartButton";
import LogoMark from "./LogoMark";

interface Props {
  cheese: Cheese;
  creamery: Creamery | undefined;
  awards: Award[];
  /** Already resolved and filtered to browsable (active-creamery) cheeses. */
  similar: { cheese: Cheese; creamery: Creamery | undefined; score: number }[];
  highlight: Highlight | null;
  hearted: boolean;
  onToggleHeart: () => void;
  /** How many of this creamery's cheeses are in the catalog. */
  makerCount: number;
  /** "12 / 1069" within the filtered list, or null when not in the current view. */
  position: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenCheese: (id: string) => void;
  onOpenCreamery: (id: string) => void;
  onBrowseMaker: (id: string) => void;
  /** A flavor or add-in chip answers "what else tastes like this?" statewide. */
  onSearchTerm: (term: string) => void;
  /** Dev-only draft overlay (photo + maker's blurb pending permission);
   *  null in production. */
  imageUrl: string | null;
  blurb: string | null;
  /** The maker's brand mark (draft overlay); null in production. */
  logoUrl: string | null;
}

export default function CheeseDetail({
  cheese,
  creamery,
  awards,
  similar,
  highlight,
  hearted,
  onToggleHeart,
  makerCount,
  position,
  onClose,
  onPrev,
  onNext,
  onOpenCheese,
  onOpenCreamery,
  onBrowseMaker,
  onSearchTerm,
  imageUrl,
  blurb,
  logoUrl,
}: Props) {
  const panel = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollTo(0, 0);
    setCopied(false);
  }, [cheese.id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — the address bar still carries the same link.
    }
  }

  const milkLine =
    cheese.milk.map((m) => MILK_LABEL[m] ?? m).join(" & ") +
    (cheese.raw_milk ? " · raw" : "");

  return (
    <aside className="detail" ref={panel} tabIndex={-1} aria-labelledby="detail-title">
      <div className="detail-head">
        <div className="head-actions">
          {position && <span className="pos">{position}</span>}
          <button className="hbtn" onClick={onPrev} aria-label="Previous cheese" title="Previous (←)">
            ‹
          </button>
          <button className="hbtn" onClick={onNext} aria-label="Next cheese" title="Next (→)">
            ›
          </button>
          <button className="hbtn copy" onClick={copyLink} aria-label="Copy a link to this cheese">
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button className="hbtn" onClick={onClose} aria-label="Close detail">
            ×
          </button>
        </div>
        <div className="title-row">
          <h2 id="detail-title">{cheese.name}</h2>
          <HeartButton
            hearted={hearted}
            name={cheese.name}
            onToggle={onToggleHeart}
            className="in-head"
          />
        </div>
        <div className="where">
          {creamery ? (
            <>
              {logoUrl && <LogoMark src={logoUrl} className="where-logo" />}
              <button className="linkish" onClick={() => onOpenCreamery(creamery.id)}>
                {creamery.name}
              </button>
              {` · ${creamery.city}`}
              {creamery.county ? ` · ${creamery.county} County` : ""}
            </>
          ) : (
            cheese.creamery_id
          )}
        </div>
        <div className="tags" style={{ marginTop: "0.5rem" }}>
          {creamery?.status === "closed" && <span className="pill closed">Creamery closed</span>}
          {cheese.wisconsin_original && <span className="pill wo">Wisconsin original</span>}
          {cheese.raw_milk && <span className="pill raw">Raw milk</span>}
          {awards.length > 0 && (
            <span className="pill award">
              {awards.length} award{awards.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {imageUrl && (
        <section>
          <DraftPhoto
            src={imageUrl}
            alt={`${cheese.name} — product photo (draft)`}
            className="detail-photo"
          />
          <p className="aka" style={{ marginTop: "0.45rem", marginBottom: 0 }}>
            Product photo from the creamery&apos;s site — internal draft,
            pending permission. Not for publication.
          </p>
        </section>
      )}

      {blurb && (
        <section>
          <h3>In their words</h3>
          <p className="detail-blurb">“{blurb}”</p>
          <p className="aka" style={{ marginTop: "0.35rem", marginBottom: 0 }}>
            — {creamery?.name ?? "the creamery"}, from their product page
          </p>
        </section>
      )}

      {highlight && (
        <section className={`highlight${highlight.type === "sponsored" ? " sponsored" : ""}`}>
          <span className="kicker">
            {highlight.type === "sponsored"
              ? `Sponsored · ${highlight.sponsor}`
              : "From the cheese desk"}
          </span>
          <p style={{ marginTop: "0.25rem" }}>{highlight.label}</p>
        </section>
      )}

      {cheese.description && (
        <section>
          <p className="summary">{cheese.description}</p>
        </section>
      )}

      <section>
        <h3>The facts</h3>
        <dl className="facts">
          <dt>Family</dt>
          <dd>{familyLabel(cheese.family)}</dd>
          <dt>Texture</dt>
          <dd>{TEXTURE_LABEL[cheese.texture] ?? cheese.texture}</dd>
          <dt>Age</dt>
          <dd>{AGE_LABEL[cheese.age_band] ?? cheese.age_band}</dd>
          <dt>Rind</dt>
          <dd>{RIND_LABEL[cheese.rind] ?? cheese.rind}</dd>
          <dt>Milk</dt>
          <dd>{milkLine}</dd>
        </dl>
      </section>

      <section>
        <h3>Flavor notes</h3>
        <div className="tags">
          {cheese.flavor.map((f) => (
            <button
              className={flavorClass(f)}
              key={f}
              onClick={() => onSearchTerm(labelize(f))}
              title={`Every cheese tagged ${labelize(f)}`}
            >
              <FlavorIcon term={f} />
              {chipLabel(f)}
            </button>
          ))}
        </div>
        {cheese.add_ins.length > 0 && (
          <>
            <h3 style={{ marginTop: "0.9rem" }}>Made with</h3>
            <div className="tags">
              {cheese.add_ins.map((a) => (
                <button
                  className="tag addin"
                  key={a}
                  onClick={() => onSearchTerm(labelize(a))}
                  title={`Every cheese made with ${labelize(a)}`}
                >
                  {chipLabel(a)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {awards.length > 0 && (
        <section>
          <h3>Contest record</h3>
          {awards.map((award) => (
            <div className="award-row" key={award.id}>
              <span className={`medal medal-${award.placement}`}>
                {PLACEMENT[award.placement]}
              </span>
              <span className="what">
                {CONTEST[award.contest]} {award.year}
                {award.champion && <span className="pill champ">Champion</span>}
                {award.finalist && !award.champion && (
                  <span className="pill top20">Top 20</span>
                )}
                <span className="cls">
                  class {award.class_number} · {award.class_name}
                </span>
              </span>
              {award.score !== null && (
                <span className="score">{award.score.toFixed(3)}</span>
              )}
            </div>
          ))}
        </section>
      )}

      {similar.length > 0 && (
        <section>
          <h3>Similar cheeses to try</h3>
          {similar.map(({ cheese: match, creamery: maker, score }) => (
            <button
              type="button"
              className="sim-row"
              key={match.id}
              onClick={() => onOpenCheese(match.id)}
            >
              <span className="sim-what">
                <span className="sim-name">{match.name}</span>
                <span className="sim-maker">
                  {maker?.name}
                  {maker?.county ? ` · ${maker.county} Co.` : ""}
                </span>
              </span>
              <span className="sim-score" aria-label={`match strength ${Math.round(score)} of 100`}>
                <span className="sim-track">
                  <span className="sim-fill" style={{ width: `${Math.round(score)}%` }} />
                </span>
                <span className="sim-num">{Math.round(score)}</span>
              </span>
            </button>
          ))}
          <p className="aka" style={{ marginTop: "0.5rem" }}>
            Scored on family, texture, age, milk, flavor and add-ins — not on
            popularity.
          </p>
        </section>
      )}

      {creamery && makerCount > 1 && (
        <section>
          <h3>More from this creamery</h3>
          <p>
            <button className="linkish" onClick={() => onBrowseMaker(creamery.id)}>
              All {makerCount} {creamery.name} cheeses in the catalog →
            </button>
          </p>
        </section>
      )}
    </aside>
  );
}
