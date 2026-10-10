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
import { currentShareUrl, hasShareSheet, shareLink } from "../share";
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
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  // Move focus into the panel so Esc and screen readers land where the reader is
  // looking; App returns focus to the list row on close.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollTo(0, 0);
    setCopied("idle");
  }, [creamery.id]);

  // The URL-mirror effect keeps the address bar carrying this creamery's deep
  // link, so sharing is handing on the current URL: the phone's share sheet
  // where there is one, the clipboard otherwise.
  async function copyLink() {
    const result = await shareLink(currentShareUrl(), `${creamery.name} — The Cheese Census`);
    if (result === "shared" || result === "dismissed") return;
    setCopied(result === "copied" ? "done" : "failed");
    window.setTimeout(() => setCopied("idle"), 1800);
  }
  const sheet = hasShareSheet();

  const operations = cheeseOperations(creamery);
  const abilities = capabilities(creamery);
  const editions = groupAwards(awards);
  const firsts = awards.filter((a) => a.placement === 1).length;
  const website = safeHref(creamery.website);
  // The address is something to go to, not only to read: a maps search that
  // opens the phone's maps app (or the web) with the plant's street address.
  const mapsHref = creamery.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${creamery.address}, ${creamery.city}, WI`,
      )}`
    : null;
  // The pin stands on the home plant and Contact describes it; a company with
  // other licensed plants says so, so a reader near Platteville learns that
  // Emmi Roth is there too without being sent to Monroe.
  const otherPlantCities = [
    ...new Set(
      creamery.plants
        .filter((p) => p.datcp_id !== creamery.home_plant && p.city !== creamery.city)
        .map((p) => p.city),
    ),
  ];

  return (
    <aside
      className="detail"
      ref={panel}
      tabIndex={-1}
      aria-labelledby="creamery-title"
    >
      <div className="detail-head">
        <div className="head-actions">
          {position && <span className="pos">{position}</span>}
          <button className="hbtn step" onClick={onPrev} aria-label="Previous creamery" title="Previous (←)">
            ‹
          </button>
          <button className="hbtn step" onClick={onNext} aria-label="Next creamery" title="Next (→)">
            ›
          </button>
          <button
            className="hbtn copy"
            onClick={copyLink}
            aria-label={sheet ? "Share a link to this creamery" : "Copy a link to this creamery"}
          >
            {copied === "done"
              ? "Copied ✓"
              : copied === "failed"
                ? "Couldn't copy"
                : sheet
                  ? "Share"
                  : "Copy link"}
          </button>
          {/* A button's changing label is not announced; this is. */}
          <span className="sr-only" role="status">
            {copied === "done" ? "Link copied" : copied === "failed" ? "Couldn't copy the link" : ""}
          </span>
          <button className="hbtn close-x" onClick={onClose} aria-label="Close detail">
            ×
          </button>
        </div>
        <div className="title-row">
          {logoUrl && <LogoMark src={logoUrl} className="creamery-logo" />}
          <h2 id="creamery-title">{creamery.name}</h2>
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

      <section className="contact">
        <h3>Contact</h3>
        <p>
          {creamery.address}
          <br />
          {creamery.city}
          {creamery.county ? `, ${creamery.county} County` : ""}
        </p>
        {otherPlantCities.length > 0 && (
          <p className="aka">
            The {creamery.city} plant is pinned; also licensed in {listOf(otherPlantCities)}.
          </p>
        )}
        {mapsHref && (
          <p>
            <a className="maps-link" href={mapsHref} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.5a6.3 6.3 0 0 0-6.3 6.3c0 4.6 5 11.2 6.3 12.7 1.3-1.5 6.3-8.1 6.3-12.7A6.3 6.3 0 0 0 12 2.5zm0 8.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" />
              </svg>
              Open in Maps
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
        {creamery.phone && (
          <p>
            {/* The licence's business line, which may answer at a head office
                rather than at this door; the label says which it is. */}
            <a
              className="tel-link"
              href={telHref(creamery.phone)}
              title="Business phone on the plant's state licence"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.6 3.5c.5-.3 1.1-.1 1.4.4l1.9 3.3c.3.5.2 1.1-.2 1.5L8.3 10a11.6 11.6 0 0 0 5.7 5.7l1.3-1.4c.4-.4 1-.5 1.5-.2l3.3 1.9c.5.3.7.9.4 1.4l-1.2 2.3c-.3.6-1 .9-1.6.8C10.8 19.4 4.6 13.2 3.5 6.3c-.1-.6.2-1.3.8-1.6z" />
              </svg>
              <span className="sr-only">Business phone: </span>
              {creamery.phone}
            </a>
          </p>
        )}
        {website && (
          <p>
            <a href={website} target="_blank" rel="noopener noreferrer">
              {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              <span className="sr-only"> (opens in a new tab)</span>
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
          <p className="aka chip-hint">Tap a type to see every creamery licensed to make it.</p>
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
                    <span className="score">
                      <span className="sr-only">score </span>
                      {award.score.toFixed(3)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* The licence file is provenance, not the visit: every operation it
          lists already appears above as a chip, so the plant-by-plant detail
          folds behind one line until someone wants the licence numbers. */}
      <section>
        {creamery.plants.length === 0 ? (
          <>
            <h3>Licence</h3>
            <p className="aka">
              No Wisconsin dairy plant licence on file — listed by Dairy Farmers of
              Wisconsin but not matched to a DATCP plant.
            </p>
          </>
        ) : (
          <details className="licence">
            <summary>
              <h3>
                Licence details ({creamery.plants.length} plant
                {creamery.plants.length === 1 ? "" : "s"})
              </h3>
            </summary>
            {creamery.plants.map((plant) => (
              <div className="plant" key={plant.datcp_id}>
                <div className="id">
                  Licence {plant.datcp_id}
                  {plant.datcp_id === creamery.home_plant && creamery.plants.length > 1 && (
                    <span className="pinned"> · pinned</span>
                  )}
                </div>
                <div className="addr">
                  {plant.address}, {plant.city} · {plant.county} County
                  {plant.phone && (
                    <>
                      {" · "}
                      <a href={telHref(plant.phone)}>{plant.phone}</a>
                    </>
                  )}
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
          </details>
        )}
      </section>

      {/* Phones show the panel as a full-screen sheet; this thumb-sized bar is
          the way back, with the previous/next steps beside it so the header
          above can scroll away (the corner toolbar stays for desktop). */}
      <div className="sheet-bar">
        <button className="sheet-step" onClick={onPrev} aria-label="Previous creamery">
          ‹
        </button>
        <button className="sheet-back" onClick={onClose}>
          ← {backLabel}
        </button>
        <button className="sheet-step" onClick={onNext} aria-label="Next creamery">
          ›
        </button>
      </div>
    </aside>
  );
}

/** "Platteville, Stoughton and Seymour". */
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "(715) 693-6662 ext. 210" → tel:+17156936662;ext=210 (RFC 3966), so a phone
 *  dials it and a desktop hands it to whatever answers tel: links. */
function telHref(phone: string): string {
  const [number, ext] = phone.split(" ext. ");
  const digits = number.replace(/\D/g, "");
  return `tel:+1${digits}${ext ? `;ext=${ext}` : ""}`;
}
