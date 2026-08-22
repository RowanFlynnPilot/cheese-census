import { useEffect, useMemo, useRef, useState } from "react";
import type { Award, Creamery, Dataset } from "./types";
import type { DraftMedia } from "./data";
import {
  MILK_ORDER,
  TEXTURE_ORDER,
  activeHighlights,
  awardsFor,
  awardsForCheese,
  cheeseOperations,
  familyLabel,
  fold,
  labelize,
  loadDataset,
  loadDraftImages,
  peopleFor,
  recommend,
} from "./data";
import { useHearts } from "./hearts";
import MapView from "./components/MapView";
import CreameryDetail from "./components/CreameryDetail";
import CheeseBrowse, { CHEESE_SORTS, type CheeseSortKey } from "./components/CheeseBrowse";
import CheeseDetail from "./components/CheeseDetail";

// Flip to "reviewed" once data/overrides/ has been through editorial review:
//   VITE_DATA_STATUS=reviewed npm run build
const DATA_STATUS = import.meta.env.VITE_DATA_STATUS ?? "provisional";

const BASE_TITLE = document.title;

const SORTS = ["name", "awards", "county"] as const;
type SortKey = (typeof SORTS)[number];

type ViewKey = "map" | "cheeses";

// The view is shareable: filters live in the query string, the open record in
// the hash. Creamery ids are single-hyphen slugs; cheese ids are
// {creamery}--{cheese} with a double hyphen, so the hash discriminates itself.
function initialParam(name: string): string {
  return new URLSearchParams(location.search).get(name) ?? "";
}

function initialSort(): SortKey {
  const sort = initialParam("sort");
  return (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : "name";
}

function initialCheeseSort(): CheeseSortKey {
  const sort = initialParam("csort");
  return (CHEESE_SORTS as readonly string[]).includes(sort)
    ? (sort as CheeseSortKey)
    : "name";
}

function initialView(): ViewKey {
  if (decodeURIComponent(location.hash.slice(1)).includes("--")) return "cheeses";
  return initialParam("view") === "cheeses" ? "cheeses" : "map";
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
  const [view, setView] = useState<ViewKey>(initialView);

  // Creamery-view state.
  const [query, setQuery] = useState(() => initialParam("q"));
  const [county, setCounty] = useState(() => initialParam("county"));
  const [retailOnly, setRetailOnly] = useState(() => initialParam("store") === "1");
  const [awardedOnly, setAwardedOnly] = useState(() => initialParam("awards") === "1");
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Cheese-view state.
  const [cheeseQuery, setCheeseQuery] = useState(() => initialParam("cq"));
  const [family, setFamily] = useState(() => initialParam("family"));
  const [texture, setTexture] = useState(() => initialParam("texture"));
  const [milk, setMilk] = useState(() => initialParam("milk"));
  const [maker, setMaker] = useState(() => initialParam("maker"));
  const [cheeseSort, setCheeseSort] = useState<CheeseSortKey>(initialCheeseSort);
  const [cheeseAwarded, setCheeseAwarded] = useState(() => initialParam("cawards") === "1");
  const [originalsOnly, setOriginalsOnly] = useState(() => initialParam("wo") === "1");
  const [mineOnly, setMineOnly] = useState(() => initialParam("mine") === "1");
  const [selectedCheeseId, setSelectedCheeseId] = useState<string | null>(null);

  const { hearts, toggleHeart } = useHearts();
  const heartSet = useMemo(() => new Set(hearts), [hearts]);

  const [aboutOpen, setAboutOpen] = useState(false);
  // Captured at first render: the URL-mirror effect below rewrites the URL (hashless
  // while nothing is selected) before the data arrives, so reading location.hash in
  // the data-load effect would find it already stripped.
  const [deepLink] = useState(() => decodeURIComponent(location.hash.slice(1)));
  // Highlights are dated placements; the window check happens once per visit.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const aboutCard = useRef<HTMLDivElement>(null);
  const aboutOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message));
  }, []);

  // The draft photo overlay exists only under `npm run dev` — production
  // builds scrub the file (sync-data.mjs) and this never even fetches.
  const [draftImages, setDraftImages] = useState<Map<string, DraftMedia> | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    loadDraftImages().then(setDraftImages, (e: Error) => console.error(e.message));
  }, []);

  const creameriesById = useMemo(
    () => new Map((data?.creameries ?? []).map((c) => [c.id, c])),
    [data],
  );
  const cheesesById = useMemo(
    () => new Map((data?.cheeses ?? []).map((c) => [c.id, c])),
    [data],
  );

  const awardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const award of data?.awards ?? []) {
      if (award.creamery_id) {
        counts.set(award.creamery_id, (counts.get(award.creamery_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [data]);

  const awardsByCheese = useMemo(() => {
    const map = new Map<string, Award[]>();
    for (const award of data?.awards ?? []) {
      if (award.cheese_id) {
        const list = map.get(award.cheese_id);
        if (list) list.push(award);
        else map.set(award.cheese_id, [award]);
      }
    }
    return map;
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

  // Closed creameries stay in the dataset (history is useful) but their records
  // drop out of browse views — SCHEMA.md's status rule, applied to both tables.
  const activeCheeses = useMemo(
    () =>
      (data?.cheeses ?? []).filter(
        (c) => creameriesById.get(c.creamery_id)?.status === "active",
      ),
    [data, creameriesById],
  );

  const familyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cheese of activeCheeses) {
      counts.set(cheese.family, (counts.get(cheese.family) ?? 0) + 1);
    }
    return counts;
  }, [activeCheeses]);

  const cheeseVocab = useMemo(
    () => ({
      families: [...familyCounts.keys()].sort((a, b) =>
        familyLabel(a).localeCompare(familyLabel(b)),
      ),
      textures: TEXTURE_ORDER.filter((t) => activeCheeses.some((c) => c.texture === t)),
      milks: MILK_ORDER.filter((m) => activeCheeses.some((c) => c.milk.includes(m))),
    }),
    [familyCounts, activeCheeses],
  );

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

  // The cheese search answers the reader question in the other direction —
  // "what is there to eat?" Tokenized, so "klondike feta" spans maker and
  // name; tag-only matches carry a "matched:" hint.
  const cheeseFiltered = useMemo(() => {
    const tokens = fold(cheeseQuery.trim()).split(/\s+/).filter(Boolean);
    const hints = new Map<string, string>();
    const list = activeCheeses
      .filter((cheese) => {
        if (maker && cheese.creamery_id !== maker) return false;
        if (family && cheese.family !== family) return false;
        if (texture && cheese.texture !== texture) return false;
        if (milk && !cheese.milk.includes(milk)) return false;
        if (cheeseAwarded && !awardsByCheese.has(cheese.id)) return false;
        if (originalsOnly && !cheese.wisconsin_original) return false;
        if (mineOnly && !heartSet.has(cheese.id)) return false;
        if (!tokens.length) return true;
        const creamery = creameriesById.get(cheese.creamery_id);
        const identity = [
          cheese.name,
          creamery?.name ?? "",
          creamery?.city ?? "",
          ...(creamery?.aka ?? []),
        ]
          .map(fold)
          .join(" ");
        const tagTerms = [
          familyLabel(cheese.family),
          ...cheese.flavor.map(labelize),
          ...cheese.add_ins.map(labelize),
        ];
        const everything = `${identity} ${tagTerms.map(fold).join(" ")}`;
        if (!tokens.every((t) => everything.includes(t))) return false;
        if (!tokens.every((t) => identity.includes(t))) {
          const term = tagTerms.find((t) =>
            tokens.some((token) => fold(t).includes(token)),
          );
          if (term) hints.set(cheese.id, term);
        }
        return true;
      })
      .sort((a, b) => {
        if (cheeseSort === "awards") {
          const diff =
            (awardsByCheese.get(b.id)?.length ?? 0) -
            (awardsByCheese.get(a.id)?.length ?? 0);
          if (diff) return diff;
        } else if (cheeseSort === "creamery") {
          const diff = (creameriesById.get(a.creamery_id)?.name ?? "").localeCompare(
            creameriesById.get(b.creamery_id)?.name ?? "",
          );
          if (diff) return diff;
        } else if (cheeseSort === "family") {
          const diff = familyLabel(a.family).localeCompare(familyLabel(b.family));
          if (diff) return diff;
        }
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      });
    return { list, hints };
  }, [
    activeCheeses,
    cheeseQuery,
    maker,
    family,
    texture,
    milk,
    cheeseAwarded,
    originalsOnly,
    mineOnly,
    heartSet,
    cheeseSort,
    awardsByCheese,
    creameriesById,
  ]);
  const cheesesShown = cheeseFiltered.list;

  const recommendations = useMemo(
    () =>
      recommend(hearts, cheesesById, (c) => {
        return creameriesById.get(c.creamery_id)?.status === "active";
      }),
    [hearts, cheesesById, creameriesById],
  );

  const highlights = useMemo(
    () => (data ? activeHighlights(data.highlights, cheesesById, today) : []),
    [data, cheesesById, today],
  );

  const selected = data?.creameries.find((c) => c.id === selectedId) ?? null;
  const shownIndex = selectedId ? shown.findIndex((c) => c.id === selectedId) : -1;

  // Cheese detail resolves against the full table, not the browse list, so
  // award references and deep links reach closed-creamery records too.
  const selectedCheese = selectedCheeseId
    ? (cheesesById.get(selectedCheeseId) ?? null)
    : null;
  const cheeseIndex = selectedCheeseId
    ? cheesesShown.findIndex((c) => c.id === selectedCheeseId)
    : -1;

  const selectedCreameryCheeses = useMemo(
    () =>
      selected
        ? (data?.cheeses ?? [])
            .filter((c) => c.creamery_id === selected.id)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [data, selected],
  );

  const similarResolved = useMemo(() => {
    if (!selectedCheese) return [];
    return selectedCheese.similar.flatMap((ref) => {
      const match = cheesesById.get(ref.cheese_id);
      if (!match) return [];
      const makerOfMatch = creameriesById.get(match.creamery_id);
      if (makerOfMatch?.status !== "active") return [];
      return [{ cheese: match, creamery: makerOfMatch, score: ref.score }];
    });
  }, [selectedCheese, cheesesById, creameriesById]);

  // URL values the dataset does not know are dropped rather than silently
  // rendering an empty view.
  useEffect(() => {
    if (!data) return;
    if (county && !counties.includes(county)) setCounty("");
    if (maker && !creameriesById.has(maker)) setMaker("");
    if (family && !familyCounts.has(family)) setFamily("");
    if (texture && !TEXTURE_ORDER.includes(texture)) setTexture("");
    if (milk && !MILK_ORDER.includes(milk)) setMilk("");
  }, [data, county, counties, maker, creameriesById, family, familyCounts, texture, milk]);

  // Deep link: the hash opens a record once the data is in — #creamery-id for the
  // map view, #creamery--cheese for the catalog. The captured deepLink covers the
  // cold load; the hashchange listener covers hash-only navigation, which the
  // browser treats as an anchor jump — no reload, no remount. (Our own
  // history.replaceState never fires hashchange, so there is no loop.)
  useEffect(() => {
    if (!data) return;
    const apply = (slug: string) => {
      if (!slug) return;
      if (slug.includes("--")) {
        if (data.cheeses.some((c) => c.id === slug)) {
          setView("cheeses");
          setSelectedCheeseId(slug);
        }
      } else if (data.creameries.some((c) => c.id === slug)) {
        setView("map");
        setSelectedId(slug);
      }
    };
    apply(deepLink);
    const onHashChange = () => apply(decodeURIComponent(location.hash.slice(1)));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [data, deepLink]);

  // Mirror the active view into the URL (replaceState — no history spam).
  useEffect(() => {
    const params = new URLSearchParams();
    let hash: string | null = null;
    if (view === "cheeses") {
      params.set("view", "cheeses");
      if (cheeseQuery) params.set("cq", cheeseQuery);
      if (family) params.set("family", family);
      if (texture) params.set("texture", texture);
      if (milk) params.set("milk", milk);
      if (maker) params.set("maker", maker);
      if (cheeseSort !== "name") params.set("csort", cheeseSort);
      if (cheeseAwarded) params.set("cawards", "1");
      if (originalsOnly) params.set("wo", "1");
      if (mineOnly) params.set("mine", "1");
      hash = selectedCheeseId;
    } else {
      if (query) params.set("q", query);
      if (county) params.set("county", county);
      if (retailOnly) params.set("store", "1");
      if (awardedOnly) params.set("awards", "1");
      if (sort !== "name") params.set("sort", sort);
      hash = selectedId;
    }
    const search = params.toString();
    history.replaceState(
      null,
      "",
      location.pathname + (search ? `?${search}` : "") + (hash ? `#${hash}` : ""),
    );
    document.title =
      view === "cheeses" && selectedCheese
        ? `${selectedCheese.name} — The Cheese Census`
        : view === "map" && selected
          ? `${selected.name} — The Cheese Census`
          : BASE_TITLE;
  }, [
    view,
    query,
    county,
    retailOnly,
    awardedOnly,
    sort,
    selectedId,
    selected,
    cheeseQuery,
    family,
    texture,
    milk,
    maker,
    cheeseSort,
    cheeseAwarded,
    originalsOnly,
    mineOnly,
    selectedCheeseId,
    selectedCheese,
  ]);

  // Filtering away the creamery someone is reading closes its panel — a detail
  // view for a pin that is no longer on the map is disorienting. (The cheese
  // grid has no such ghost: its panel stays up through filter changes.)
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

  function closeCheeseDetail() {
    const id = selectedCheeseId;
    setSelectedCheeseId(null);
    if (id) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-chid="${CSS.escape(id)}"]`)?.focus();
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

  function stepCheese(delta: number) {
    if (!cheesesShown.length) return;
    setSelectedCheeseId((current) => {
      const at = current ? cheesesShown.findIndex((c) => c.id === current) : -1;
      const index = at < 0 ? 0 : (at + delta + cheesesShown.length) % cheesesShown.length;
      return cheesesShown[index].id;
    });
  }

  function openCheese(id: string) {
    setView("cheeses");
    setSelectedCheeseId(id);
  }

  function openCreamery(id: string) {
    setView("map");
    setSelectedId(id);
  }

  function clearCheeseFacets() {
    setCheeseQuery("");
    setFamily("");
    setTexture("");
    setMilk("");
    setMaker("");
    setCheeseAwarded(false);
    setOriginalsOnly(false);
  }

  /** "All N of this creamery's cheeses" — a clean slate filtered to one maker. */
  function browseMaker(id: string) {
    clearCheeseFacets();
    setMineOnly(false);
    setMaker(id);
    setView("cheeses");
  }

  /** A flavor or add-in chip asks the statewide question, so every narrower
   *  facet clears; the open panel stays as the anchor. */
  function searchTerm(term: string) {
    clearCheeseFacets();
    setMineOnly(false);
    setCheeseQuery(term);
  }

  function openAbout() {
    aboutOpener.current = document.activeElement as HTMLElement | null;
    setAboutOpen(true);
  }

  function closeAbout() {
    setAboutOpen(false);
    aboutOpener.current?.focus();
  }

  /** Answer "who else makes this?" from a licence chip in the detail panel. The
   *  county filter clears because the question is statewide; the open creamery
   *  necessarily matches its own cheese, so its panel stays up. */
  function filterByCheese(operation: string) {
    setQuery(operation);
    setCounty("");
  }

  // Global keys, routed through a ref so the listener binds once.
  const keys = useRef({
    closeDetail,
    closeCheeseDetail,
    step,
    stepCheese,
    closeAbout,
    aboutOpen,
    selectedId,
    selectedCheeseId,
    view,
  });
  keys.current = {
    closeDetail,
    closeCheeseDetail,
    step,
    stepCheese,
    closeAbout,
    aboutOpen,
    selectedId,
    selectedCheeseId,
    view,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === "Escape") {
        if (k.aboutOpen) k.closeAbout();
        else if (k.view === "cheeses") k.closeCheeseDetail();
        else k.closeDetail();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (k.aboutOpen) return;
        const open = k.view === "cheeses" ? k.selectedCheeseId : k.selectedId;
        if (!open) return;
        // e.target is not always an Element (window itself, for one).
        const target = e.target instanceof Element ? e.target : null;
        // Leave arrows alone inside form fields and the map (Leaflet pans with them).
        if (target?.closest("input, select, textarea, .leaflet-container")) return;
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        if (k.view === "cheeses") k.stepCheese(delta);
        else k.step(delta);
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

  const countLine = !data
    ? "loading…"
    : view === "cheeses"
      ? `${cheesesShown.length} of ${activeCheeses.length} cheeses`
      : `${shown.length} of ${data.creameries.length} creameries`;

  return (
    <div className="app">
      <header className="masthead">
        <div className="mast-top">
          <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3 22 18H2Z" fill="var(--gold)" />
            <circle cx="12" cy="13.6" r="1.7" fill="var(--teal)" />
            <circle cx="8.6" cy="16.2" r="1.1" fill="var(--teal)" />
            <circle cx="15.5" cy="16.4" r="1.25" fill="var(--teal)" />
          </svg>
          <h1>The Cheese Census</h1>
          <p className="subtitle">
            A census of Wisconsin cheese, from Wausau Pilot &amp; Review
          </p>
          <span className="count" aria-live="polite">
            {countLine}
          </span>
        </div>

        {stats && (
          <div className="stats-line">
            <span>
              <b>{stats.creameries}</b> creameries
            </span>
            <span>
              <b>{stats.counties}</b> counties
            </span>
            <span>
              <b>{stats.plants}</b> licensed plants
            </span>
            {stats.cheeses > 0 && (
              <span>
                <b>{stats.cheeses}</b> cheeses
              </span>
            )}
            <span>
              <b>{stats.masters}</b> master cheesemakers
            </span>
            <span>
              <b>{stats.awards}</b> contest awards
            </span>
          </div>
        )}

        <nav className="mast-tabs" aria-label="Census views">
          <button
            className="mode"
            aria-current={view === "map" ? "page" : undefined}
            onClick={() => setView("map")}
          >
            Creamery map
          </button>
          <button
            className="mode"
            aria-current={view === "cheeses" ? "page" : undefined}
            onClick={() => setView("cheeses")}
          >
            Cheese catalog
          </button>
          {hearts.length > 0 && (
            <button
              className="mode-hearts"
              onClick={() => {
                // "Take me to my shelf" — stale facets from earlier browsing
                // would silently hide saved cheeses.
                clearCheeseFacets();
                setMineOnly(true);
                setView("cheeses");
              }}
              aria-label={`Open my ${hearts.length} saved cheese${hearts.length === 1 ? "" : "s"}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20.4C8.5 17.6 3 13.3 3 8.8 3 6.1 5.1 4 7.7 4c1.7 0 3.4 1 4.3 2.5C12.9 5 14.6 4 16.3 4 18.9 4 21 6.1 21 8.8c0 4.5-5.5 8.8-9 11.6z" />
              </svg>
              {hearts.length} saved
            </button>
          )}
        </nav>
      </header>

      <div className="viewport">
        <div className={`layout${view === "map" ? "" : " view-off"}`}>
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
                cheeses={selectedCreameryCheeses}
                position={shownIndex >= 0 ? `${shownIndex + 1} / ${shown.length}` : null}
                onClose={closeDetail}
                onPrev={() => step(-1)}
                onNext={() => step(1)}
                onFilterCheese={filterByCheese}
                onOpenCheese={openCheese}
                onBrowseCheeses={() => browseMaker(selected.id)}
              />
            )}
          </div>
        </div>

        <div className={`cheese-pane${view === "cheeses" ? "" : " view-off"}`}>
          <CheeseBrowse
            loading={!data}
            shown={cheesesShown}
            hints={cheeseFiltered.hints}
            creameriesById={creameriesById}
            awardsByCheese={awardsByCheese}
            heartSet={heartSet}
            heartCount={hearts.length}
            onToggleHeart={toggleHeart}
            recommendations={recommendations}
            highlights={highlights}
            selectedId={selectedCheeseId}
            onOpen={setSelectedCheeseId}
            query={cheeseQuery}
            onQuery={setCheeseQuery}
            family={family}
            onFamily={setFamily}
            texture={texture}
            onTexture={setTexture}
            milk={milk}
            onMilk={setMilk}
            sort={cheeseSort}
            onSort={setCheeseSort}
            awardedOnly={cheeseAwarded}
            onAwardedOnly={setCheeseAwarded}
            originalsOnly={originalsOnly}
            onOriginalsOnly={setOriginalsOnly}
            mineOnly={mineOnly}
            onMineOnly={setMineOnly}
            makerName={maker ? (creameriesById.get(maker)?.name ?? null) : null}
            onClearMaker={() => setMaker("")}
            vocab={cheeseVocab}
            familyCounts={familyCounts}
            onClearAll={clearCheeseFacets}
            images={draftImages}
          />
          {selectedCheese && data && (
            <CheeseDetail
              cheese={selectedCheese}
              creamery={creameriesById.get(selectedCheese.creamery_id)}
              awards={awardsForCheese(data.awards, selectedCheese.id)}
              similar={similarResolved}
              highlight={
                highlights.find((h) => h.cheese.id === selectedCheese.id)?.highlight ??
                null
              }
              hearted={heartSet.has(selectedCheese.id)}
              onToggleHeart={() => toggleHeart(selectedCheese.id)}
              makerCount={
                activeCheeses.filter((c) => c.creamery_id === selectedCheese.creamery_id)
                  .length
              }
              position={
                cheeseIndex >= 0 ? `${cheeseIndex + 1} / ${cheesesShown.length}` : null
              }
              onClose={closeCheeseDetail}
              onPrev={() => stepCheese(-1)}
              onNext={() => stepCheese(1)}
              onOpenCheese={openCheese}
              onOpenCreamery={openCreamery}
              onBrowseMaker={browseMaker}
              onSearchTerm={searchTerm}
              imageUrl={draftImages?.get(selectedCheese.id)?.image ?? null}
              blurb={draftImages?.get(selectedCheese.id)?.summary ?? null}
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
            Provisional data
            <span className="pd-long"> — classifications not yet editorially reviewed</span>
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
              <li>
                <b>The cheese catalog</b> — assembled by WPR from contest entries and
                each creamery&apos;s own published product names, mapped into a
                controlled set of families, textures, flavors and add-ins. The
                similar-cheese scores are computed from those fields — family,
                texture, age, milk, flavor, add-ins — not from popularity.
              </li>
            </ul>
            <h3>Saved cheeses</h3>
            <p>
              The ♥ list is yours alone: it is stored in your browser and never sent
              anywhere. &ldquo;To try next&rdquo; is matched from your saved cheeses
              by the same similarity scoring, on your device.
            </p>
            <h3>What &ldquo;licensed to make&rdquo; means</h3>
            <p>
              The cheese types on a company&apos;s plant licences — a census of what
              each creamery is licensed to produce. The cheese catalog is the
              product-level layer on top of it.
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
