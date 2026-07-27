import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "./types";
import { awardsFor, loadDataset, peopleFor } from "./data";
import MapView from "./components/MapView";
import CreameryDetail from "./components/CreameryDetail";

// Flip to "reviewed" once data/overrides/ has been through editorial review:
//   VITE_DATA_STATUS=reviewed npm run build
const DATA_STATUS = import.meta.env.VITE_DATA_STATUS ?? "provisional";

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [county, setCounty] = useState("");
  const [retailOnly, setRetailOnly] = useState(false);
  const [awardedOnly, setAwardedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message));
  }, []);

  const awardedIds = useMemo(
    () => new Set((data?.awards ?? []).map((a) => a.creamery_id).filter(Boolean) as string[]),
    [data],
  );

  const counties = useMemo(
    () =>
      [...new Set((data?.creameries ?? []).map((c) => c.county).filter(Boolean) as string[])].sort(),
    [data],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.creameries ?? [])
      .filter((c) => {
        if (county && c.county !== county) return false;
        if (retailOnly && !c.retail.store) return false;
        if (awardedOnly && !awardedIds.has(c.id)) return false;
        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          c.city.toLowerCase().includes(needle) ||
          (c.county ?? "").toLowerCase().includes(needle) ||
          c.aka.some((a) => a.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, query, county, retailOnly, awardedOnly, awardedIds]);

  const selected = data?.creameries.find((c) => c.id === selectedId) ?? null;

  if (error) {
    return (
      <div className="empty" style={{ padding: "3rem 1rem" }}>
        <p>Could not load the census data.</p>
        <p style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{error}</p>
        <p>Run <code>python build.py</code>, then <code>npm run data</code>.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1>The Cheese Census</h1>
        <p className="subtitle">
          A census of Wisconsin cheese, from the Wausau Pilot &amp; Review
        </p>
        <span className="count">
          {data ? `${shown.length} of ${data.creameries.length} creameries` : "loading…"}
        </span>
      </header>

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
                    {c}
                  </option>
                ))}
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
            {shown.map((creamery) => {
              const wins = awardedIds.has(creamery.id);
              return (
                <button
                  key={creamery.id}
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
                    {wins && <span className="pill award">Award</span>}
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
          {selected && data && (
            <CreameryDetail
              creamery={selected}
              people={peopleFor(data.people, selected.id)}
              awards={awardsFor(data.awards, selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      <footer className="colophon">
        <span>The Cheese Census — Wausau Pilot &amp; Review</span>
        <span>
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
