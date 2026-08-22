import { useEffect, useMemo, useRef, useState } from "react";
import type { Creamery, Dataset } from "./types";
import { awardsFor, cheeseOperations, fold, loadDataset, peopleFor } from "./data";
import MapView from "./components/MapView";
import CreameryDetail from "./components/CreameryDetail";

// Flip to "reviewed" once data/overrides/ has been through editorial review:
//   VITE_DATA_STATUS=reviewed npm run build
const DATA_STATUS = import.meta.env.VITE_DATA_STATUS ?? "provisional";

const BASE_TITLE = document.title;

const SORTS = ["name", "awards", "county"] as const;
type SortKey = (typeof SORTS)[number];

// The view is shareable: filters live in the query string, the open creamery in
// the hash. A newsroom embed can therefore point an iframe at ?county=Green or
// deep-link #hooks-cheese straight from a story.
function initialParam(name: string): string {
  return new URLSearchParams(location.search).get(name) ?? "";
}

function initialSort(): SortKey {
  const sort = initialParam("sort");
  return (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : "name";
}

/** Consecutive runs of one county — the input is already county-sorted. */
function groupByCounty(rows: Creamery[]): { label: string; rows: Creamery[] }[] {
  const groups: { label: string; rows: Creamery[] }[] = [];
  for (const creamery of rows) {
    const label = creamery.county ? `${creamery.county} County` : "No county on file";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(creamery);
    else groups.push({ label, rows: [creamery] });
  }
  return groups;
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => initialParam("q"));
  const [county, setCounty] = useState(() => initialParam("county"));
  const [retailOnly, setRetailOnly] = useState(() => initialParam("store") === "1");
  const [awardedOnly, setAwardedOnly] = useState(() => initialParam("awards") === "1");
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  // Captured at first render: the URL-mirror effect below rewrites the URL (hashless
  // while nothing is selected) before the data arrives, so reading location.hash in
  // the data-load effect would find it already stripped.
  const [deepLink] = useState(() => decodeURIComponent(location.hash.slice(1)));
  const aboutCard = useRef<HTMLDivElement>(null);
  const aboutOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message));
  }, []);

  const awardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const award of data?.awards ?? []) {
      if (award.creamery_id) {
        counts.set(award.creamery_id, (counts.get(award.creamery_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [data]);

  const counties = useMemo(
    () =>
      [
        ...new Set(
          (data?.creameries ?? []).map((c) => c.county).filter(Boolean) as string[],
        ),
      ].sort(),
    [data],
  );

  const countyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const creamery of data?.creameries ?? []) {
      if (creamery.county) {
        counts.set(creamery.county, (counts.get(creamery.county) ?? 0) + 1);
      }
    }
    return counts;
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    return {
      creameries: data.creameries.length,
      counties: counties.length,
      plants: data.creameries.reduce((n, c) => n + c.plants.length, 0),
      cheeses: data.cheeses.length,
      masters: data.people.length,
      awards: data.awards.length,
    };
  }, [data, counties]);

  // The census's home question is "who makes X?", so search reaches past names
  // into each creamery's licensed cheese types; hints record when that — and only
  // that — is why a row matched, so the list can say so.
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    const hints = new Map<string, string>();
    const list = (data?.creameries ?? [])
      .filter((c) => {
        // Closed creameries stay in the dataset (history is useful) but drop out
        // of browse views — SCHEMA.md's status rule.
        if (c.status !== "active") return false;
        if (county && c.county !== county) return false;
        if (retailOnly && !c.retail.store) return false;
        if (awardedOnly && !awardCounts.has(c.id)) return false;
        if (!needle) return true;
        const direct =
          fold(c.name).includes(needle) ||
          fold(c.city).includes(needle) ||
          fold(c.county ?? "").includes(needle) ||
          c.aka.some((a) => fold(a).includes(needle));
        if (direct) return true;
        const operation = cheeseOperations(c).find((o) => fold(o).includes(needle));
        if (operation) {
          hints.set(c.id, operation);
          return true;
        }
        return false;
      })
      .sort((a, b) => {
        if (sort === "awards") {
          const diff = (awardCounts.get(b.id) ?? 0) - (awardCounts.get(a.id) ?? 0);
          if (diff) return diff;
        } else if (sort === "county") {
          // Explicit, not a "~" sentinel: localeCompare's collation puts
          // punctuation before letters, which quietly sorted these first.
          if (!a.county !== !b.county) return a.county ? -1 : 1;
          const diff = (a.county ?? "").localeCompare(b.county ?? "");
          if (diff) return diff;
        }
        return a.name.localeCompare(b.name);
      });
    return { list, hints };
  }, [data, query, county, retailOnly, awardedOnly, sort, awardCounts]);
  const shown = filtered.list;

  const selected = data?.creameries.find((c) => c.id === selectedId) ?? null;
  const shownIndex = selectedId ? shown.findIndex((c) => c.id === selectedId) : -1;

  // A county name in the URL that the dataset does not know is dropped rather
  // than silently rendering an empty directory.
  useEffect(() => {
    if (data && county && !counties.includes(county)) setCounty("");
  }, [data, county, counties]);

  // Deep link: #creamery-id opens that creamery once the data is in. The captured
  // deepLink covers the cold load; the hashchange listener covers hash-only
  // navigation, which the browser treats as an anchor jump — no reload, no remount.
  // (Our own history.replaceState never fires hashchange, so there is no loop.)
  useEffect(() => {
    if (!data) return;
    const apply = (slug: string) => {
      if (slug && data.creameries.some((c) => c.id === slug)) setSelectedId(slug);
    };
    apply(deepLink);
    const onHashChange = () => apply(decodeURIComponent(location.hash.slice(1)));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [data, deepLink]);

  // Mirror the whole view into the URL (replaceState — no history spam).
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (county) params.set("county", county);
    if (retailOnly) params.set("store", "1");
    if (awardedOnly) params.set("awards", "1");
    if (sort !== "name") params.set("sort", sort);
    const search = params.toString();
    history.replaceState(
      null,
      "",
      location.pathname + (search ? `?${search}` : "") + (selectedId ? `#${selectedId}` : ""),
    );
    document.title = selected ? `${selected.name} — The Cheese Census` : BASE_TITLE;
  }, [query, county, retailOnly, awardedOnly, sort, selectedId, selected]);

  // Filtering away the creamery someone is reading closes its panel — a detail
  // view for a pin that is no longer on the map is disorienting.
  useEffect(() => {
    if (selectedId && data && !shown.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [shown, selectedId, data]);

  function closeDetail() {
    const id = selectedId;
    setSelectedId(null);
    if (id) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-cid="${id}"]`)?.focus();
      });
    }
  }

  /** Walk the filtered list from the detail panel, wrapping at the ends.
   *  A functional update, so rapid repeats compose instead of reading one
   *  stale index. */
  function step(delta: number) {
    if (!shown.length) return;
    setSelectedId((current) => {
      const at = current ? shown.findIndex((c) => c.id === current) : -1;
      const index = at < 0 ? 0 : (at + delta + shown.length) % shown.length;
      return shown[index].id;
    });
  }

  function openAbout() {
    aboutOpener.current = document.activeElement as HTMLElement | null;
    setAboutOpen(true);
  }

  function closeAbout() {
    setAboutOpen(false);
    aboutOpener.current?.focus();
  }

  /** Answer "who else makes this?" from a cheese chip in the detail panel. The
   *  county filter clears because the question is statewide; the open creamery
   *  necessarily matches its own cheese, so its panel stays up. */
  function filterByCheese(operation: string) {
    setQuery(operation);
    setCounty("");
  }

  // Global keys, routed through a ref so the listener binds once.
  const keys = useRef({ closeDetail, step, closeAbout, aboutOpen, selectedId });
  keys.current = { closeDetail, step, closeAbout, aboutOpen, selectedId };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === "Escape") {
        if (k.aboutOpen) k.closeAbout();
        else k.closeDetail();
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && k.selectedId && !k.aboutOpen) {
        // e.target is not always an Element (window itself, for one).
        const target = e.target instanceof Element ? e.target : null;
        // Leave arrows alone inside form fields and the map (Leaflet pans with them).
        if (target?.closest("input, select, textarea, .leaflet-container")) return;
        e.preventDefault();
        k.step(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (aboutOpen) aboutCard.current?.focus();
  }, [aboutOpen]);

  function clearFilters() {
    setQuery("");
    setCounty("");
    setRetailOnly(false);
    setAwardedOnly(false);
  }

  function renderRow(creamery: Creamery) {
    const wins = awardCounts.get(creamery.id) ?? 0;
    const hint = filtered.hints.get(creamery.id);
    return (
      <button
        key={creamery.id}
        data-cid={creamery.id}
        className="creamery-row"
        aria-current={creamery.id === selectedId}
        onClick={() => setSelectedId(creamery.id)}
      >
        <div className="name">{creamery.name}</div>
        <div className="meta">
          <span>
            {creamery.city}
            {creamery.county ? ` · ${creamery.county} Co.` : ""}
          </span>
          {hint && <span className="op-hint">makes {hint}</span>}
          {creamery.retail.store && <span className="pill store">Store</span>}
          {wins > 0 && (
            <span className="pill award">
              {wins} award{wins === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </button>
    );
  }

  if (error) {
    return (
      <div className="empty" style={{ padding: "3rem 1rem" }}>
        <p>Could not load the census data.</p>
        <p style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{error}</p>
        <p>
          Run <code>python build.py</code>, then <code>npm run data</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 22 18H2Z" fill="var(--gold)" />
          <circle cx="12" cy="13.6" r="1.7" fill="var(--teal)" />
          <circle cx="8.6" cy="16.2" r="1.1" fill="var(--teal)" />
          <circle cx="15.5" cy="16.4" r="1.25" fill="var(--teal)" />
        </svg>
        <h1>The Cheese Census</h1>
        <p className="subtitle">
          A census of Wisconsin cheese, from the Wausau Pilot &amp; Review
        </p>
        <span className="count" aria-live="polite">
          {data ? `${shown.length} of ${data.creameries.length} creameries` : "loading…"}
        </span>
      </header>

      {stats && (
        <div className="stats">
          <span className="stat">
            <b>{stats.creameries}</b> creameries
          </span>
          <span className="stat">
            <b>{stats.counties}</b> counties
          </span>
          <span className="stat">
            <b>{stats.plants}</b> licensed plants
          </span>
          {stats.cheeses > 0 && (
            <span className="stat">
              <b>{stats.cheeses}</b> cheeses
            </span>
          )}
          <span className="stat">
            <b>{stats.masters}</b> master cheesemakers
          </span>
          <span className="stat">
            <b>{stats.awards}</b> contest awards
          </span>
        </div>
      )}

      <div className="layout">
        <div className="sidebar">
          <div className="filters">
            <input
              type="search"
              placeholder="Search names, cities, or a cheese — try “limburger”"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search creameries by name, city, county or cheese type"
            />
            <div className="filter-row">
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                aria-label="Filter by county"
              >
                <option value="">All counties ({counties.length})</option>
                {counties.map((c) => (
                  <option key={c} value={c}>
                    {c} ({countyCounts.get(c)})
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort creameries"
              >
                <option value="name">Sort: A–Z</option>
                <option value="awards">Sort: Most awarded</option>
                <option value="county">Sort: County</option>
              </select>
            </div>
            <div className="filter-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={retailOnly}
                  onChange={(e) => setRetailOnly(e.target.checked)}
                />
                Retail store
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={awardedOnly}
                  onChange={(e) => setAwardedOnly(e.target.checked)}
                />
                Award winners
              </label>
            </div>
          </div>

          <div className="list">
            {!data &&
              !error &&
              Array.from({ length: 8 }, (_, i) => (
                <div className="skel" key={i} aria-hidden="true">
                  <div className="bar" style={{ width: `${52 + ((i * 17) % 34)}%` }} />
                  <div className="bar" style={{ width: `${30 + ((i * 11) % 22)}%` }} />
                </div>
              ))}
            {sort === "county"
              ? groupByCounty(shown).map((group) => (
                  <div key={group.label}>
                    <div className="county-head">
                      <span>{group.label}</span>
                      <span className="era-count">{group.rows.length}</span>
                    </div>
                    {group.rows.map(renderRow)}
                  </div>
                ))
              : shown.map(renderRow)}
            {data && shown.length === 0 && (
              <div className="empty">
                <p>No creameries match those filters.</p>
                <button className="linkish" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="map-pane">
          <MapView creameries={shown} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="legend" aria-hidden="true">
            <span>
              <i className="marker" style={{ width: 10, height: 10 }} /> Creamery
            </span>
            <span>
              <i className="marker has-store" style={{ width: 10, height: 10 }} /> Retail
              store
            </span>
            <span>
              <i className="marker is-selected" style={{ width: 10, height: 10 }} />{" "}
              Selected
            </span>
          </div>
          {selected && data && (
            <CreameryDetail
              creamery={selected}
              people={peopleFor(data.people, selected.id)}
              awards={awardsFor(data.awards, selected.id)}
              position={shownIndex >= 0 ? `${shownIndex + 1} / ${shown.length}` : null}
              onClose={closeDetail}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onFilterCheese={filterByCheese}
            />
          )}
        </div>
      </div>

      <footer className="colophon">
        <span>The Cheese Census — Wausau Pilot &amp; Review</span>
        <span className="sources">
          Plant data: Wisconsin DATCP · Consumer listings: Dairy Farmers of Wisconsin ·
          Awards: Wisconsin Cheese Makers Association
        </span>
        <button className="about-link" onClick={openAbout}>
          About this census
        </button>
        {DATA_STATUS !== "reviewed" && (
          <button className="provisional" onClick={openAbout}>
            Provisional data — classifications not yet editorially reviewed
          </button>
        )}
      </footer>

      {aboutOpen && (
        <div className="about-overlay" onClick={closeAbout}>
          <div
            className="about-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            ref={aboutCard}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={closeAbout} aria-label="Close about">
              ×
            </button>
            <h2 id="about-title">About this census</h2>
            <p>
              The Cheese Census is an evergreen database of Wisconsin creameries and
              the cheese they make, built and maintained by the{" "}
              <a
                href="https://www.wausaupilotandreview.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Wausau Pilot &amp; Review
              </a>
              .
            </p>
            <h3>Where the data comes from</h3>
            <ul>
              <li>
                <b>Plants and operations</b> — the Wisconsin DATCP dairy plant licence
                report: every licensed plant, its location, and what it is licensed to
                process and make.
              </li>
              <li>
                <b>Consumer listings</b> — Dairy Farmers of Wisconsin&apos;s
                wisconsincheese.com directory: retail presence, locations, and master
                cheesemakers.
              </li>
              <li>
                <b>Awards</b> — World and U.S. Championship Cheese Contest results
                published by the Wisconsin Cheese Makers Association; Wisconsin
                entries only.
              </li>
            </ul>
            <h3>What &ldquo;licensed to make&rdquo; means</h3>
            <p>
              The cheese types on a company&apos;s plant licences — a census of what
              each creamery is licensed to produce, not a product catalog. Named
              products, flavors and the cheese browser arrive in a later phase.
            </p>
            <h3>Provisional data</h3>
            <p>
              Which licensed companies appear here as consumer creameries is an
              editorial classification by WPR. Until that review is complete, the
              directory carries a provisional-data notice and details may change.
            </p>
            <p className="aka">
              Spot an error? Corrections are welcome via the Wausau Pilot &amp; Review
              newsroom.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
