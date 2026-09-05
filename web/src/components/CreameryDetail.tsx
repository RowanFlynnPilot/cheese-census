import { useEffect, useRef, useState } from "react";
import type { Award, Cheese, Creamery, Person } from "../types";
import {
  CONTEST,
  PLACEMENT,
  capabilities,
  cheeseOperations,
  groupAwards,
  isCapability,
  safeHref,
} from "../data";
import LogoMark from "./LogoMark";

// Chips beyond this fold behind the "browse all" link to the catalog view —
// Carr Valley alone has 50 records.
const CHIP_LIMIT = 18;

interface Props {
  creamery: Creamery;
  people: Person[];
  awards: Award[];
  /** This creamery's records in the cheese catalog, name-sorted. */
  cheeses: Cheese[];
  /** Dev-only draft overlay (brand mark pending rights review); null in production. */
  logoUrl: string | null;
  /** "12 / 93" within the filtered list, or null when filtered out mid-view. */
  position: string | null;
  /** What the mobile back bar returns to — "Back to the map" from a pin,
   *  "Back to the list" from a row. */
  backLabel: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFilterCheese: (operation: string) => void;
  onOpenCheese: (id: string) => void;
  onBrowseCheeses: () => void;
}

export default function CreameryDetail({
  creamery,
  people,
  awards,
  cheeses,
  logoUrl,
  position,
  backLabel,
  onClose,
  onPrev,
  onNext,
  onFilterCheese,
  onOpenCheese,
  onBrowseCheeses,
}: Props) {
  const panel = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  // Move focus into the panel so Esc and screen readers land where the reader is
  // looking; App returns focus to the list row on close.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollTo(0, 0);
    setCopied(false);
  }, [creamery.id]);

  // The URL-mirror effect keeps the address bar carrying this creamery's deep
  // link, so sharing is just copying the current URL.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions, insecure context) — the address bar
      // still carries the same link.
    }
  }

  const operations = cheeseOperations(creamery);
  const abilities = capabilities(creamery);
  const editions = groupAwards(awards);
  const firsts = awards.filter((a) => a.placement === 1).length;
  const website = safeHref(creamery.website);

  return (
    <aside
      className="detail"
      ref={panel}
      tabIndex={-1}
      aria-labelledby="detail-title"
    >
      <div className="detail-head">
        <div className="head-actions">
          {position && <span className="pos">{position}</span>}
          <button className="hbtn" onClick={onPrev} aria-label="Previous creamery" title="Previous (←)">
            ‹
          </button>
          <button className="hbtn" onClick={onNext} aria-label="Next creamery" title="Next (→)">
            ›
          </button>
          <button
            className="hbtn copy"
            onClick={copyLink}
            aria-label="Copy a link to this creamery"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button className="hbtn" onClick={onClose} aria-label="Close detail">
            ×
          </button>
        </div>
        <div className="title-row">
          {logoUrl && <LogoMark src={logoUrl} className="creamery-logo" />}
          <h2 id="detail-title">{creamery.name}</h2>
        </div>
        <div className="where">
          {creamery.city}
          {creamery.county ? ` · ${creamery.county} County` : ""}
          {creamery.founded ? ` · est. ${creamery.founded}` : ""}
        </div>
        <div className="tags" style={{ marginTop: "0.5rem" }}>
          {creamery.status === "closed" && <span className="pill closed">Closed</span>}
          {creamery.retail.store && <span className="pill store">Retail store</span>}
          {awards.length > 0 && (
            <span className="pill award">
              {awards.length} award{awards.length === 1 ? "" : "s"}
              {firsts > 0 ? ` · ${firsts} first` : ""}
            </span>
          )}
          {people.length > 0 && (
            <span className="pill">
              {people.length} master cheesemaker{people.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {creamery.editorial.summary && (
        <section>
          <p className="summary">{creamery.editorial.summary}</p>
        </section>
      )}

      <section>
        <h3>Contact</h3>
        <p>
          {creamery.address}
          <br />
          {creamery.city}
          {creamery.county ? `, ${creamery.county} County` : ""}
        </p>
        {website && (
          <p>
            <a href={website} target="_blank" rel="noopener noreferrer">
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>
          </p>
        )}
        {creamery.aka.length > 0 && (
          <p className="aka">Also trades as: {creamery.aka.join(" · ")}</p>
        )}
      </section>

      {cheeses.length > 0 && (
        <section>
          <h3>In the cheese catalog ({cheeses.length})</h3>
          <div className="tags">
            {cheeses.slice(0, CHIP_LIMIT).map((cheese) => (
              <button
                className="tag product"
                key={cheese.id}
                onClick={() => onOpenCheese(cheese.id)}
                title={`Open ${cheese.name} in the cheese catalog`}
              >
                {cheese.name}
              </button>
            ))}
          </div>
          {cheeses.length > CHIP_LIMIT && (
            <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              <button className="linkish" onClick={onBrowseCheeses}>
                Browse all {cheeses.length} in the catalog →
              </button>
            </p>
          )}
        </section>
      )}

      {operations.length > 0 && (
        <section>
          <h3>Licensed to make</h3>
          <div className="tags">
            {operations.map((c) => (
              <button
                className="tag cheese"
                key={c}
                onClick={() => onFilterCheese(c)}
                title={`Every creamery licensed to make ${c}`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      {people.length > 0 && (
        <section>
          <h3>Master cheesemakers</h3>
          {people.map((person) => (
            <div className="person" key={person.id}>
              <div className="who">{person.name}</div>
              <div className="tags" style={{ marginTop: "0.2rem" }}>
                {person.certifications.map((c) => (
                  <span className="tag" key={c.type}>
                    {c.type}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {editions.length > 0 && (
        <section>
          <h3>Contest awards</h3>
          {editions.map((edition) => (
            <div className="award-edition" key={edition.key}>
              <div className="award-era">
                <span>
                  {CONTEST[edition.contest]} {edition.year}
                </span>
                <span className="era-count">{edition.awards.length}</span>
              </div>
              {edition.awards.map((award) => (
                <div className="award-row" key={award.id}>
                  <span className={`medal medal-${award.placement}`}>
                    {PLACEMENT[award.placement]}
                  </span>
                  <span className="what">
                    {award.cheese_id ? (
                      <button
                        className="linkish"
                        onClick={() => onOpenCheese(award.cheese_id!)}
                        title="Open this cheese in the catalog"
                      >
                        {award.entry.cheese_name}
                      </button>
                    ) : (
                      award.entry.cheese_name
                    )}
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
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Licensed plants ({creamery.plants.length})</h3>
        {creamery.plants.map((plant) => (
          <div className="plant" key={plant.datcp_id}>
            <div className="id">{plant.datcp_id}</div>
            <div className="addr">
              {plant.address}, {plant.city} · {plant.county} County
            </div>
            <div className="tags">
              {plant.operations.map((op) => (
                <span className={`tag${isCapability(op) ? "" : " cheese"}`} key={op}>
                  {op}
                </span>
              ))}
            </div>
          </div>
        ))}
        {creamery.plants.length === 0 && (
          <p className="aka">
            No Wisconsin dairy plant licence on file — listed by Dairy Farmers of
            Wisconsin but not matched to a DATCP plant.
          </p>
        )}
        {abilities.length > 0 && (
          <>
            <h3 style={{ marginTop: "0.9rem" }}>Plant capabilities</h3>
            <div className="tags">
              {abilities.map((a) => (
                <span className="tag" key={a}>
                  {a}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Phones show the panel as a full-screen sheet; this thumb-sized bar is
          the way back (the corner × stays for desktop). */}
      <button className="sheet-back" onClick={onClose}>
        ← {backLabel}
      </button>
    </aside>
  );
}
