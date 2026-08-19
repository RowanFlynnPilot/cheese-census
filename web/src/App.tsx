import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "./types";
import { awardsFor, loadDataset, peopleFor } from "./data";
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

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(() => initialParam("q"));
  const [county, setCounty] = useState(() => initialParam("county"));
  const [retailOnly, setRetailOnly] = useState(() => initialParam("store") === "1");
  const [awardedOnly, setAwardedOnly] = useState(() => initialParam("awards") === "1");
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Captured at first render: the URL-mirror effect below rewrites the URL (hashless
  // while nothing is selected) before the data arrives, so reading location.hash in
  // the data-load effect would find it already stripped.
  const [deepLink] = useState(() => decodeURIComponent(location.hash.slice(1)));

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
      masters: data.people.length,
      awards: data.awards.length,
    };
  }, [data, counties]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.creameries ?? [])
      .filter((c) => {
        if (county && c.county !== county) return false;
        if (retailOnly && !c.retail.store) return false;
        if (awardedOnly && !awardCounts.has(c.id)) return false;
        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.city.toLowerCase().includes(needle) ||
          (c.county ?? "").toLowerCase().includes(needle) ||
          c.aka.some((a) => a.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => {
        if (sort === "awards") {
          const diff = (awardCounts.get(b.id) ?? 0) - (awardCounts.get(a.id) ?? 0);
          if (diff) return diff;
        } else if (sort === "county") {
          // "~" sorts after every letter, so the county-less land at the end.
          const diff = (a.county ?? "~").localeCompare(b.county ?? "~");
          if (diff) return diff;
        }
        return a.name.localeCompare(b.name);
      });
  }, [data, query, county, retailOnly, awardedOnly, sort, awardCounts]);

  const selected = data?.creameries.find((c) => c.id === selectedId) ?? null;

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

  const close = useRef(closeDetail);
  close.current = closeDetail;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
              placeholder="Search name, city or county"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search creameries"
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
            {shown.map((creamery) => {
              const wins = awardCounts.get(creamery.id) ?? 0;
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
                    {creamery.retail.store && <span className="pill store">Store</span>}
                    {wins > 0 && (
                      <span className="pill award">
                        {wins} award{wins === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {data && shown.length === 0 && (
              <div className="empty">No creameries match those filters.</div>
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
              onClose={closeDetail}
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
        {DATA_STATUS !== "reviewed" && (
          <span className="provisional">
            Provisional data — classifications not yet editorially reviewed
          </span>
        )}
      </footer>
    </div>
  );
}
