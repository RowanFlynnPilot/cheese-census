import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type { Award, Creamery, Dataset } from "./types";

/** A same-document view transition for the moments that would otherwise
 *  teleport: a panel opening or closing, a tab switch. Behind a feature check
 *  and the reader's motion preference (styles.css names the groups and times
 *  them); stepping ← → between creameries is rapid navigation and stays
 *  instant, so it never goes through here. */
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
/** Resolves once the update is in the DOM: a transition applies it a frame
 *  later, after the old state is captured, so anything that must follow it
 *  (returning focus to a row that was inert under the sheet) waits here. */
function transition(update: () => void): Promise<void> {
  if (typeof document.startViewTransition !== "function" || REDUCED_MOTION.matches) {
    update();
    return Promise.resolve();
  }
  const running = document.startViewTransition(() => {
    flushSync(update);
  });
  // A transition begun while the document is hidden (a background tab) is
  // aborted with InvalidStateError on every promise; the update still
  // applies, and nothing here should surface as an unhandled rejection.
  running.ready.catch(() => undefined);
  running.finished.catch(() => undefined);
  return running.updateCallbackDone.catch(() => undefined);
}
import type { DraftMedia } from "./data";
import {
  MILK_ORDER,
  TEXTURE_ORDER,
  activeHighlights,
  activeSponsor,
  awardsFor,
  awardsForCheese,
  cheeseOperations,
  familyLabel,
  fold,
  labelize,
  loadDataset,
  loadDraftImages,
  loadDraftLogos,
  peopleFor,
  recommend,
} from "./data";
import { useHearts } from "./hearts";
import {
  BOARD_SIZES,
  boardCoverage,
  boardNudges,
  completeBoard,
  suggestForBoard,
  useBoard,
  weakestPick,
} from "./boards";
import LogoMark from "./components/LogoMark";
import CreameryDetail from "./components/CreameryDetail";
import CheeseBrowse, {
  CHEESE_SORTS,
  DEFAULT_CHEESE_SORT,
  type CheeseSortKey,
} from "./components/CheeseBrowse";
import CheeseDetail from "./components/CheeseDetail";
import BoardView from "./components/BoardView";
import { shareBase } from "./share";
import type { Cheese } from "./types";

// Leaflet and its stylesheet are a third of the bundle and only the map view
// needs them: they load the first time that view shows.
const MapView = lazy(() => import("./components/MapView"));

// Flip to "reviewed" once data/overrides/ has been through editorial review:
//   VITE_DATA_STATUS=reviewed npm run build
const DATA_STATUS = import.meta.env.VITE_DATA_STATUS ?? "provisional";

const BASE_TITLE = document.title;

const SORTS = ["name", "awards", "county", "distance"] as const;
type SortKey = (typeof SORTS)[number];

/** Great-circle miles between two points — enough for "14 mi" on a row. */
function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function fmtMiles(miles: number): string {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** How near a typed word is to a name: character-bigram overlap (Dice),
 *  taken against the whole name and against each of its words, so "hookz"
 *  finds Hook's Cheese Company and "habanro" finds Habanero Jack. Both
 *  strings arrive folded. */
function nearness(query: string, text: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) set.add(padded.slice(i, i + 2));
    return set;
  };
  const qg = grams(query);
  const dice = (candidate: string) => {
    const ng = grams(candidate);
    let hits = 0;
    for (const g of qg) if (ng.has(g)) hits++;
    return (2 * hits) / (qg.size + ng.size);
  };
  return Math.max(dice(text), ...text.split(/\s+/).filter(Boolean).map(dice));
}

type ViewKey = "map" | "cheeses" | "board";

// The view is shareable: filters live in the query string, the open record in
// the hash. Creamery ids are single-hyphen slugs; cheese ids are
// {creamery}--{cheese} with a double hyphen, so the hash discriminates itself.
function initialParam(name: string): string {
  return new URLSearchParams(location.search).get(name) ?? "";
}

/** The hash, decoded defensively — a hand-mangled escape (`#%`) throws from
 *  decodeURIComponent, and a bad shared link must not blank the whole app. */
function readHash(): string {
  const raw = location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function initialSort(): SortKey {
  const sort = initialParam("sort");
  return (SORTS as readonly string[]).includes(sort) ? (sort as SortKey) : "name";
}

function initialCheeseSort(): CheeseSortKey {
  const sort = initialParam("csort");
  return (CHEESE_SORTS as readonly string[]).includes(sort)
    ? (sort as CheeseSortKey)
    : DEFAULT_CHEESE_SORT;
}

function initialView(): ViewKey {
  // A record hash names a specific cheese, and that panel lives in the catalog —
  // it outranks the view param (a shared board link carries no hash).
  if (readHash().includes("--")) return "cheeses";
  const view = initialParam("view");
  if (view === "board") return "board";
  // "catalog" is what the tab says, so a hand-typed link gets there too.
  return view === "cheeses" || view === "catalog" ? "cheeses" : "map";
}

/** True below the phone breakpoint (styles.css: 760px). The masthead count
 *  drops its noun there — "1,059 of 1,069 cheeses" is the one string that
 *  would not share the title line, and the active tab already names the noun. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    // iOS 13 has only the deprecated addListener; calling a missing method
    // would take the whole frame down through the error boundary.
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);
  return narrow;
}

/** Return focus without jolting the page: no ancestor scroll (the embedding
 *  article included), just the pane's own scroller nudged until the target
 *  shows. A target that is hidden (the list pane behind a phone's map) yields
 *  to the fallback instead of dropping focus to the body. */
function restoreFocus(el: HTMLElement | null, fallback: HTMLElement | null) {
  const visible =
    el !== null && el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden";
  const target = visible ? el : fallback;
  if (!target) return;
  target.focus({ preventScroll: true });
  const scroller = target.closest<HTMLElement>(".list, .cheese-scroll, .board-scroll");
  if (!scroller) return;
  const r = target.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  if (r.top < s.top) scroller.scrollTop -= s.top - r.top;
  else if (r.bottom > s.bottom) scroller.scrollTop += r.bottom - s.bottom;
}

/** The locate glyph, shared by "Near me" and the phone map's own button. */
function Crosshair() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      <circle cx="12" cy="12" r="7.5" fill="none" />
    </svg>
  );
}

/** The "Did you mean" names: at most three, and only ones that are near — an
 *  absolute floor, and no more than a notch below the best, so "hookz" offers
 *  Hook's and not Winona Foods after it. */
function nearestNames(
  scored: { id: string; name: string; score: number }[],
): { id: string; name: string }[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const floor = Math.max(0.45, (sorted[0]?.score ?? 0) * 0.7);
  return sorted
    .filter((s) => s.score >= floor)
    .slice(0, 3)
    .map(({ id, name }) => ({ id, name }));
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
  // Phones show one pane at a time (the floating flip pill); desktop ignores this.
  const [mobilePane, setMobilePane] = useState<"list" | "map">("list");
  // Phones fold the county, sort and checkbox controls behind one button, as
  // the catalog does, so the first screen is creameries; desktop ignores this.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // "Near me": the reader's position, asked for on a tap and kept only for
  // this visit — never written anywhere, never in the URL (a shared link
  // cannot carry someone else's location).
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "asking" | "denied" | "unavailable">("idle");

  function locate() {
    // Pressed while on: a toggle untoggles. The dot, the miles and the
    // distance sort all go; the list returns to A–Z.
    if (here) {
      setHere(null);
      setSort((s) => (s === "distance" ? "name" : s));
      setLocating("idle");
      return;
    }
    if (!("geolocation" in navigator)) {
      setLocating("unavailable");
      return;
    }
    setLocating("asking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHere({ lat: position.coords.latitude, lng: position.coords.longitude });
        setSort("distance");
        setLocating("idle");
      },
      (err) => setLocating(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

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

  const { hearts, toggleHeart, pruneHearts } = useHearts();
  const heartSet = useMemo(() => new Set(hearts), [hearts]);

  // The cheese board: personal state beside hearts; the ids double as the
  // shareable URL payload.
  const board = useBoard();
  // Stable callbacks for effect deps — the hook's return object is rebuilt
  // every render, the functions inside it are not.
  const { replace: replaceBoard, setSize: setBoardSize, prune: pruneBoard } = board;
  // Captured once: a shared board link hydrates the working board on arrival —
  // but only a *board-view* arrival. A hand-mixed link (`#cheese` plus `b=`)
  // opens the cheese and leaves the reader's own board alone.
  const [boardParam] = useState(() => initialParam("b"));
  const [boardSizeParam] = useState(() => initialParam("bsize"));
  const [arrivedOnBoard] = useState(() => initialView() === "board");
  const boardAdopted = useRef(false);
  // A random id kept in this browser, used only to break exact-score ties when
  // filling a board — so one-tap boards differ from reader to reader instead of
  // every phone in the state getting the same five cheeses. Never sent anywhere.
  const [readerSalt] = useState(() => {
    try {
      const key = "cheese-census.reader.v1";
      let salt = localStorage.getItem(key);
      if (!salt) {
        salt = Math.random().toString(36).slice(2);
        localStorage.setItem(key, salt);
      }
      return salt;
    } catch {
      return "";
    }
  });
  // A board just replaced or cleared, restorable for a few seconds.
  const [undo, setUndo] = useState<{ ids: string[]; size: number; label: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const [aboutOpen, setAboutOpen] = useState(false);
  const narrow = useNarrow();
  // The map (Leaflet, its stylesheet, its tiles) mounts the first time the map
  // view shows and then stays, so the visibility trick keeps its size. A
  // catalog or board arrival never fetches a basemap it does not display.
  const [mapMounted, setMapMounted] = useState(() => view === "map");
  useEffect(() => {
    if (view === "map") setMapMounted(true);
  }, [view]);
  // Captured at first render: the URL-mirror effect below rewrites the URL (hashless
  // while nothing is selected) before the data arrives, so reading location.hash in
  // the data-load effect would find it already stripped.
  const [deepLink] = useState(readHash);
  // Highlights and sponsor slots are dated placements; the window check happens
  // once per visit, against the reader's *local* calendar date — toISOString()
  // is UTC and would flip a Wisconsin window five or six hours early.
  const [today] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
  const aboutCard = useRef<HTMLDivElement>(null);
  const aboutOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    loadDataset().then(setData, (e: Error) => setError(e.message));
  }, []);

  // The draft overlays exist only under `npm run dev` — production builds
  // scrub the files (sync-data.mjs) and these never even fetch.
  const [draftImages, setDraftImages] = useState<Map<string, DraftMedia> | null>(null);
  const [draftLogos, setDraftLogos] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    loadDraftImages().then(setDraftImages, (e: Error) => console.error(e.message));
    loadDraftLogos().then(setDraftLogos, (e: Error) => console.error(e.message));
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

  // The browse universe: closed creameries stay in the dataset (their awards
  // and deep links resolve) but leave the filters, the counters and the county
  // menu, so "X of Y" always means "clearing the filters gets you Y".
  const activeCreameries = useMemo(
    () => (data?.creameries ?? []).filter((c) => c.status === "active"),
    [data],
  );

  const counties = useMemo(
    () =>
      [
        ...new Set(activeCreameries.map((c) => c.county).filter(Boolean) as string[]),
      ].sort(),
    [activeCreameries],
  );

  const countyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const creamery of activeCreameries) {
      if (creamery.county) {
        counts.set(creamery.county, (counts.get(creamery.county) ?? 0) + 1);
      }
    }
    return counts;
  }, [activeCreameries]);

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

  const textureCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cheese of activeCheeses) {
      counts.set(cheese.texture, (counts.get(cheese.texture) ?? 0) + 1);
    }
    return counts;
  }, [activeCheeses]);

  // A mixed-milk cheese counts toward each of its milks — the menu answers
  // "how many can I get with goat in them?", not a partition.
  const milkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cheese of activeCheeses) {
      for (const m of cheese.milk) counts.set(m, (counts.get(m) ?? 0) + 1);
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

  // The almanac line counts what the tool browses: a closed creamery and its
  // cheeses stay in the record (deep links and award rows still resolve) but
  // the masthead must agree with the "88 of 88" beside it. Awards and master
  // cheesemakers are history, so those stay whole.
  const stats = useMemo(() => {
    if (!data) return null;
    return {
      creameries: activeCreameries.length,
      counties: counties.length,
      plants: activeCreameries.reduce((n, c) => n + c.plants.length, 0),
      cheeses: activeCheeses.length,
      masters: data.people.length,
      awards: data.awards.length,
    };
  }, [data, activeCreameries, activeCheeses, counties]);

  // The census's home question is "who makes X?", so search reaches past names
  // into each creamery's licensed cheese types; hints record when that — and only
  // that — is why a row matched, so the list can say so.
  const filtered = useMemo(() => {
    const needle = fold(query.trim());
    const hints = new Map<string, string>();
    const matches = (c: Creamery) => {
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
    };
    const active = (data?.creameries ?? []).filter((c) => c.status === "active");
    // What the word alone finds, so an empty list can say whether the word or
    // the county and checkboxes are the reason.
    const statewide = needle ? active.filter(matches).length : 0;
    const list = active
      .filter((c) => {
        if (county && c.county !== county) return false;
        if (retailOnly && !c.retail.store) return false;
        if (awardedOnly && !awardCounts.has(c.id)) return false;
        return matches(c);
      })
      .sort((a, b) => {
        if (sort === "distance" && here) {
          const miles = (c: Creamery) =>
            c.lat === null || c.lng === null ? Infinity : milesBetween(here, { lat: c.lat, lng: c.lng });
          const diff = miles(a) - miles(b);
          if (diff) return diff;
        } else if (sort === "awards") {
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
    return { list, hints, statewide };
  }, [data, query, county, retailOnly, awardedOnly, sort, awardCounts, here]);
  const shown = filtered.list;

  // A creamery search that finds nothing: the three names (or cities) nearest
  // the typed text, so "hooks" still lands on Hook's.
  const creameryNearMisses = useMemo(() => {
    const q = fold(query.trim());
    if (!q || shown.length > 0) return [] as { id: string; name: string }[];
    const scored: { id: string; name: string; score: number }[] = [];
    for (const creamery of activeCreameries) {
      const best = Math.max(nearness(q, fold(creamery.name)), nearness(q, fold(creamery.city)));
      scored.push({ id: creamery.id, name: creamery.name, score: best });
    }
    return nearestNames(scored);
  }, [query, shown.length, activeCreameries]);

  // Search text folds once per cheese, not once per keystroke: ~1,000 records
  // × eight strings through NFD-normalize is tens of milliseconds on a phone.
  const searchIndex = useMemo(() => {
    const index = new Map<
      string,
      { identity: string; everything: string; tags: { label: string; folded: string }[] }
    >();
    for (const cheese of activeCheeses) {
      const creamery = creameriesById.get(cheese.creamery_id);
      const identity = [
        cheese.name,
        creamery?.name ?? "",
        creamery?.city ?? "",
        ...(creamery?.aka ?? []),
      ]
        .map(fold)
        .join(" ");
      const tags = [
        familyLabel(cheese.family),
        ...cheese.flavor.map(labelize),
        ...cheese.add_ins.map(labelize),
      ].map((label) => ({ label, folded: fold(label) }));
      index.set(cheese.id, {
        identity,
        everything: `${identity} ${tags.map((t) => t.folded).join(" ")}`,
        tags,
      });
    }
    return index;
  }, [activeCheeses, creameriesById]);

  // Typing stays responsive: the grid follows the deferred value, so a slow
  // phone skips intermediate renders instead of lagging every keystroke.
  const deferredCheeseQuery = useDeferredValue(cheeseQuery);

  // The cheese search answers the reader question in the other direction —
  // "what is there to eat?" Tokenized, so "klondike feta" spans maker and
  // name; tag-only matches carry a "matched:" hint.
  const cheeseFiltered = useMemo(() => {
    const tokens = fold(deferredCheeseQuery.trim()).split(/\s+/).filter(Boolean);
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
        const entry = searchIndex.get(cheese.id);
        if (!entry) return false;
        if (!tokens.every((t) => entry.everything.includes(t))) return false;
        if (!tokens.every((t) => entry.identity.includes(t))) {
          const term = entry.tags.find((tag) =>
            tokens.some((token) => tag.folded.includes(token)),
          );
          if (term) hints.set(cheese.id, term.label);
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
    deferredCheeseQuery,
    searchIndex,
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

  // When a search finds nothing, the three names nearest the typed text — a
  // typo'd "habanro" still lands on Habanero Jack. Character-bigram overlap
  // (Dice) over the folded names, computed only on an empty result.
  const nearMisses = useMemo(() => {
    const q = fold(deferredCheeseQuery.trim());
    if (!q || cheesesShown.length > 0) return [] as { id: string; name: string }[];
    const seen = new Set<string>();
    const scored: { id: string; name: string; score: number }[] = [];
    for (const cheese of activeCheeses) {
      if (seen.has(cheese.name)) continue;
      seen.add(cheese.name);
      scored.push({ id: cheese.id, name: cheese.name, score: nearness(q, fold(cheese.name)) });
    }
    return nearestNames(scored);
  }, [deferredCheeseQuery, cheesesShown.length, activeCheeses]);

  // What the reader *asked for*, as one string. The grid scrolls back to the
  // top when this changes — and only then: the result set also changes when a
  // heart is toggled mid-scroll, and that must not bounce the reader around.
  const cheeseFilterKey = [
    deferredCheeseQuery,
    family,
    texture,
    milk,
    maker,
    cheeseSort,
    cheeseAwarded,
    originalsOnly,
    mineOnly,
  ].join("\u0000");

  const catalogCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cheese of activeCheeses) {
      counts.set(cheese.creamery_id, (counts.get(cheese.creamery_id) ?? 0) + 1);
    }
    return counts;
  }, [activeCheeses]);

  // Rich hover cards for the map pins. Leaflet takes HTML strings, so this is
  // the one place the app renders markup by hand — everything interpolated is
  // escaped first.
  const mapTips = useMemo(() => {
    const esc = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const tips = new Map<string, string>();
    for (const creamery of data?.creameries ?? []) {
      if (creamery.status !== "active") continue;
      const types = cheeseOperations(creamery);
      const wins = awardCounts.get(creamery.id) ?? 0;
      const inCatalog = catalogCounts.get(creamery.id) ?? 0;
      const logo = draftLogos?.get(creamery.id);
      const pills = [
        creamery.retail.store ? '<span class="pill store">Store</span>' : "",
        wins ? `<span class="pill award">${wins} award${wins === 1 ? "" : "s"}</span>` : "",
        inCatalog ? `<span class="pill">${inCatalog} in the catalog</span>` : "",
      ].join("");
      const chips =
        types
          .slice(0, 5)
          .map((t) => `<span class="tag cheese">${esc(t)}</span>`)
          .join("") +
        (types.length > 5 ? `<span class="tag">+${types.length - 5}</span>` : "");
      tips.set(
        creamery.id,
        [
          `<div class="mc-name">${
            logo
              ? `<img class="mc-logo" src="${esc(logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`
              : ""
          }${esc(creamery.name)}</div>`,
          `<div class="mc-where">${esc(creamery.city)}${
            creamery.county ? ` · ${esc(creamery.county)} County` : ""
          }</div>`,
          creamery.address ? `<div class="mc-addr">${esc(creamery.address)}</div>` : "",
          pills ? `<div class="mc-pills">${pills}</div>` : "",
          chips ? `<div class="mc-types">${chips}</div>` : "",
        ].join(""),
      );
    }
    return tips;
  }, [data, awardCounts, catalogCounts, draftLogos]);

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

  const boardSponsor = useMemo(
    () => (data ? activeSponsor(data.sponsors, "board", today) : null),
    [data, today],
  );

  // The gallery, newest first. Build validation guarantees every pick exists.
  const featuredBoards = useMemo(
    () =>
      [...(data?.boards ?? [])].sort(
        (a, b) => b.added.localeCompare(a.added) || a.id.localeCompare(b.id),
      ),
    [data],
  );


  // The board's picks, resolved in saved order. A closed creamery's cheese
  // stays — it is the reader's list — but leaves the suggestion pool.
  const boardCheeses = useMemo(
    () =>
      board.ids
        .map((id) => cheesesById.get(id))
        .filter((c): c is Cheese => Boolean(c)),
    [board.ids, cheesesById],
  );

  // One analysis of the board feeds the meter, the rail and the swap rail, so
  // they cannot disagree: the note's first nudge is what the rail answers.
  const boardAnalysis = useMemo(() => {
    const coverage = boardCoverage(boardCheeses, creameriesById);
    const nudges = boardNudges(boardCheeses, board.size, coverage);
    const full = boardCheeses.length >= board.size;
    const suggestions = full
      ? []
      : suggestForBoard(boardCheeses, board.size, activeCheeses, creameriesById, awardsByCheese);
    const replacing = full && nudges.length ? weakestPick(boardCheeses, creameriesById) : null;
    const swap = replacing
      ? {
          replacing,
          candidates: suggestForBoard(
            boardCheeses,
            board.size,
            activeCheeses,
            creameriesById,
            awardsByCheese,
            4,
            { allowFull: true },
          ),
        }
      : null;
    return { coverage, nudges, suggestions, swap };
  }, [boardCheeses, board.size, activeCheeses, creameriesById, awardsByCheese]);

  // The canonical share link, built from state rather than read back from the
  // address bar so the printed sheet never lags a render behind. The size
  // always travels: the link IS the board, and a recipient's own stored size
  // must not reshape it.
  const boardShareUrl = useMemo(() => {
    const params = new URLSearchParams({ view: "board", bsize: String(board.size) });
    if (board.ids.length) params.set("b", board.ids.join(","));
    // Commas are legal in a query string; the encoded form just reads worse
    // on the printed sheet.
    return `${shareBase()}?${params.toString().replace(/%2C/g, ",")}`;
  }, [board.ids, board.size]);

  // A shared link's board loads once the dataset can vouch for its ids; a bare
  // arrival (no b param) leaves the reader's own saved board alone.
  useEffect(() => {
    if (!data || boardAdopted.current) return;
    boardAdopted.current = true;
    if (!arrivedOnBoard) return;
    const ids = boardParam
      ? boardParam.split(",").filter((id) => cheesesById.has(id))
      : [];
    const isSize = (n: number) => (BOARD_SIZES as readonly number[]).includes(n);
    // An older link without bsize still arrives at its own size when the pick
    // count is one — never the recipient's stored size.
    const size = isSize(Number(boardSizeParam))
      ? Number(boardSizeParam)
      : isSize(ids.length)
        ? ids.length
        : undefined;
    if (ids.length) replaceBoard(ids, size);
    else if (size) setBoardSize(size);
  }, [data, arrivedOnBoard, boardParam, boardSizeParam, cheesesById, replaceBoard, setBoardSize]);

  // Ids the dataset no longer knows (a cheese removed since the reader saved
  // it) drop silently rather than holding a ghost slot or padding a count.
  // prune() filters inside the state updater, so it cannot undo the adoption
  // queued just above in the same render.
  useEffect(() => {
    if (!data) return;
    const known = (id: string) => cheesesById.has(id);
    pruneBoard(known);
    pruneHearts(known);
  }, [data, cheesesById, pruneBoard, pruneHearts]);

  /** Greedy fill from the whole catalog — the one-tap board. */
  function completeMyBoard() {
    const filled = completeBoard(
      boardCheeses,
      board.size,
      activeCheeses,
      creameriesById,
      awardsByCheese,
      readerSalt,
    );
    board.replace(filled.map((c) => c.id));
  }

  /** Keep the board being replaced for ten seconds: undo beats a confirm
   *  when recovery is this cheap. */
  function stashBoard(label: string) {
    setUndo({ ids: board.ids, size: board.size, label });
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 10000);
  }

  function undoBoard() {
    if (!undo) return;
    board.replace(undo.ids, undo.size);
    setUndo(null);
  }

  /** "Use this board" from the gallery: the picks arrive with their own size. */
  function adoptBoard(ids: string[], title: string) {
    const n = board.ids.length;
    if (n) stashBoard(`Replaced your ${n} pick${n === 1 ? "" : "s"} with “${title}”`);
    const size = (BOARD_SIZES as readonly number[]).includes(ids.length)
      ? ids.length
      : board.size;
    board.replace(ids, size);
  }

  function clearBoard() {
    const n = board.ids.length;
    if (n) stashBoard(`Cleared your ${n} pick${n === 1 ? "" : "s"}`);
    board.clear();
  }

  /** A full board answering its nudge: the candidate takes the place of the
   *  pick the board can best spare. */
  function swapIn(id: string) {
    const replacing = boardAnalysis.swap?.replacing;
    if (!replacing) return;
    board.replace(board.ids.map((x) => (x === replacing.id ? id : x)));
  }

  /** The most balanced board the reader's own saved cheeses can make. */
  function seedBoardFromHearts() {
    const saved = hearts
      .map((id) => cheesesById.get(id))
      .filter(
        (c): c is Cheese =>
          Boolean(c) && creameriesById.get(c!.creamery_id)?.status === "active",
      );
    const seeded = completeBoard([], board.size, saved, creameriesById, awardsByCheese);
    board.replace(seeded.map((c) => c.id));
  }

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
    const onHashChange = () => apply(readHash());
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
      if (cheeseSort !== DEFAULT_CHEESE_SORT) params.set("csort", cheeseSort);
      if (cheeseAwarded) params.set("cawards", "1");
      if (originalsOnly) params.set("wo", "1");
      if (mineOnly) params.set("mine", "1");
      hash = selectedCheeseId;
    } else if (view === "board") {
      // The board IS the URL: anyone the link reaches loads these picks at
      // this size. No hash — a record hash would flip a shared link into the
      // catalog.
      params.set("view", "board");
      params.set("bsize", String(board.size));
      if (board.ids.length) params.set("b", board.ids.join(","));
    } else {
      if (query) params.set("q", query);
      if (county) params.set("county", county);
      if (retailOnly) params.set("store", "1");
      if (awardedOnly) params.set("awards", "1");
      // The distance sort belongs to this reader's position, so it never
      // travels in a link.
      if (sort !== "name" && sort !== "distance") params.set("sort", sort);
      hash = selectedId;
    }
    // Keep board-id commas readable — the address bar is a share surface too.
    const search = params.toString().replace(/%2C/g, ",");
    const href = location.pathname + (search ? `?${search}` : "") + (hash ? `#${hash}` : "");
    // Debounced: WebKit refuses more than 100 history writes in 30 seconds,
    // and one write per keystroke gets there mid-word. The URL is a
    // convenience, so a refused write is swallowed, never thrown into the
    // error boundary.
    const timer = window.setTimeout(() => {
      try {
        history.replaceState(null, "", href);
      } catch {
        // rate-limited or sandboxed — the state is still the state
      }
    }, 250);
    document.title =
      view !== "map" && selectedCheese
        ? `${selectedCheese.name} — The Cheese Census`
        : view === "map" && selected
          ? `${selected.name} — The Cheese Census`
          : view === "board"
            ? "My cheese board — The Cheese Census"
            : view === "cheeses"
              ? "Cheese catalog — The Cheese Census"
              : BASE_TITLE;
    return () => window.clearTimeout(timer);
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
    board.ids,
    board.size,
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
    void transition(() => setSelectedId(null)).then(() => {
      if (!id) return;
      requestAnimationFrame(() => {
        // From a pin on a phone the row sits in the hidden list pane; the flip
        // pill is the nearest visible control.
        restoreFocus(
          document.querySelector<HTMLElement>(`[data-cid="${CSS.escape(id)}"]`),
          document.querySelector<HTMLElement>(".mobile-flip"),
        );
      });
    });
  }

  function closeCheeseDetail() {
    const id = selectedCheeseId;
    const pane = view === "board" ? ".board-pane" : ".cheese-pane";
    void transition(() => setSelectedCheeseId(null)).then(() => {
      if (!id) return;
      // Scoped to the active pane: the catalog's hidden card carries the same
      // id and would otherwise win the query and swallow the focus.
      requestAnimationFrame(() => {
        restoreFocus(
          document.querySelector<HTMLElement>(`${pane} [data-chid="${CSS.escape(id)}"]`),
          document.querySelector<HTMLElement>(`${pane} input[type="search"], ${pane} button`),
        );
      });
    });
  }

  // On a phone the detail sheet covers the whole frame, so what it covers must
  // leave the tab and swipe order too — aria-modal alone does not do that.
  useEffect(() => {
    const open = narrow && (view === "map" ? selectedId !== null : selectedCheeseId !== null);
    const covered = document.querySelectorAll<HTMLElement>(
      ".skip-links, .masthead, .draftbar, .sidebar, .mobile-flip, .cheese-main, .board-scroll, .colophon",
    );
    covered.forEach((el) => {
      el.inert = open;
    });
    return () =>
      covered.forEach((el) => {
        el.inert = false;
      });
  }, [narrow, view, selectedId, selectedCheeseId]);

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
    transition(() => {
      setView("cheeses");
      setSelectedCheeseId(id);
    });
  }

  function openCreamery(id: string) {
    transition(() => {
      setView("map");
      setSelectedId(id);
    });
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

  /** aria-modal promises the dialog is the whole world; make Tab keep that
   *  promise instead of wandering into the page behind the overlay. */
  function trapAboutTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !aboutCard.current) return;
    const focusables = aboutCard.current.querySelectorAll<HTMLElement>("button, a[href]");
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === aboutCard.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Answer "who else makes this?" from a licence chip in the detail panel. The
   *  question is statewide, so every narrower filter clears — a lingering
   *  county or award toggle would silently hide makers; the open creamery
   *  necessarily matches its own cheese, so its panel stays up. */
  function filterByCheese(operation: string) {
    setQuery(operation);
    setCounty("");
    setRetailOnly(false);
    setAwardedOnly(false);
    // On a phone the sheet covers the list it just filtered, so the tap would
    // change nothing the reader can see: close the sheet onto the list, whose
    // result strip names the answer, and put focus there (once the list pane
    // is no longer inert — the effect below runs after that one).
    if (narrow) {
      focusStripNext.current = true;
      setSelectedId(null);
      setMobilePane("list");
    }
  }

  const focusStripNext = useRef(false);
  useEffect(() => {
    if (!focusStripNext.current || selectedId) return;
    focusStripNext.current = false;
    // Synchronous first (the covered panes are no longer inert by now), with
    // one retry a beat later for a browser that is still settling the sheet.
    const land = () => {
      const strip = document.querySelector<HTMLElement>(".result-strip");
      if (!strip) return false;
      strip.focus({ preventScroll: true });
      return document.activeElement === strip;
    };
    if (!land()) window.setTimeout(land, 80);
  }, [selectedId, query]);

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
  // Refreshed after every commit (not during render, which the compiler rules
  // forbid), so the listener below always sees the latest handlers.
  useLayoutEffect(() => {
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
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === "Escape") {
        if (k.aboutOpen) k.closeAbout();
        else if (k.view === "map") k.closeDetail();
        else k.closeCheeseDetail(); // catalog and board both open cheese panels
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (k.aboutOpen) return;
        const open = k.view === "map" ? k.selectedId : k.selectedCheeseId;
        if (!open) return;
        // e.target is not always an Element (window itself, for one).
        const target = e.target instanceof Element ? e.target : null;
        // Leave arrows alone inside form fields and the map (Leaflet pans with them).
        if (target?.closest("input, select, textarea, .leaflet-container")) return;
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        if (k.view === "map") k.step(delta);
        else k.stepCheese(delta);
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
    clearNarrowing();
  }

  /** Drop the county and the checkboxes and keep the word: "Show all 4". */
  function clearNarrowing() {
    setCounty("");
    setRetailOnly(false);
    setAwardedOnly(false);
  }

  // How the empty state names what hid the matches: "none in Burnett County
  // with a retail store".
  const narrowing = [
    county ? `in ${county} County` : "",
    retailOnly && awardedOnly
      ? "with a retail store and contest awards"
      : retailOnly
        ? "with a retail store"
        : awardedOnly
          ? "with contest awards"
          : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mapChips: { key: string; label: string; aria: string; remove: () => void }[] = [];
  if (county) {
    mapChips.push({
      key: "county",
      label: `${county} County`,
      aria: `Remove the ${county} County filter`,
      remove: () => setCounty(""),
    });
  }
  if (retailOnly) {
    mapChips.push({
      key: "store",
      label: "Retail store",
      aria: "Remove the retail store filter",
      remove: () => setRetailOnly(false),
    });
  }
  if (awardedOnly) {
    mapChips.push({
      key: "awards",
      label: "Award winners",
      aria: "Remove the award winners filter",
      remove: () => setAwardedOnly(false),
    });
  }
  if (sort === "awards" || sort === "county") {
    const label = sort === "awards" ? "Most awarded" : "County";
    mapChips.push({
      key: "sort",
      label: `Sort: ${label}`,
      aria: "Back to the A–Z sort",
      remove: () => setSort("name"),
    });
  }
  // What the phone's fold holds — the county and the sort. The store and award
  // toggles sit beside Near me in the open: the three things a visitor asks.
  const foldedActive = mapChips.filter((chip) => chip.key === "county" || chip.key === "sort").length;
  const foldFilters = narrow && !filtersOpen;

  // Once located, the list says what "nearest first" came to — the sort select
  // changing on its own is not an announcement.
  const nearestLine = (() => {
    if (!here) return null;
    const first = sort === "distance" ? shown[0] : undefined;
    if (!first || first.lat === null || first.lng === null) {
      return "Distances are from your location.";
    }
    const miles = fmtMiles(milesBetween(here, { lat: first.lat, lng: first.lng }));
    return `Sorted nearest first: ${first.name} in ${first.city} is ${miles} away.`;
  })();

  function renderRow(creamery: Creamery) {
    const wins = awardCounts.get(creamery.id) ?? 0;
    const hint = filtered.hints.get(creamery.id);
    const miles =
      here && creamery.lat !== null && creamery.lng !== null
        ? fmtMiles(milesBetween(here, { lat: creamery.lat, lng: creamery.lng }))
        : null;
    return (
      <button
        key={creamery.id}
        data-cid={creamery.id}
        className="creamery-row"
        aria-current={creamery.id === selectedId || undefined}
        onClick={() => transition(() => setSelectedId(creamery.id))}
      >
        <div className="name">
          {draftLogos?.get(creamery.id) && (
            <LogoMark src={draftLogos.get(creamery.id)!} className="row-logo" />
          )}
          {creamery.name}
        </div>
        <div className="meta">
          {miles && <span className="dist">{miles}</span>}
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
    // Readers see a plain sentence and a way back; the build hint is dev-only.
    return (
      <div className="empty load-error" role="alert">
        <p>The Cheese Census didn&apos;t load — the connection may have dropped.</p>
        <button className="board-action" onClick={() => location.reload()} autoFocus>
          Try again
        </button>
        <p className="load-error-detail">{error}</p>
        {import.meta.env.DEV && (
          <p>
            Run <code>python build.py</code>, then <code>npm run data</code>.
          </p>
        )}
      </div>
    );
  }

  // Newspaper numbers carry their commas.
  const fmt = (n: number) => n.toLocaleString("en-US");

  // Phones drop the noun on every view (the active tab names it), so the count
  // always shares the title line instead of wrapping under it.
  const countLine = !data
    ? "loading…"
    : view === "cheeses"
      ? `${fmt(cheesesShown.length)} of ${fmt(activeCheeses.length)}${narrow ? "" : " cheeses"}`
      : view === "board"
        ? `${boardCheeses.length} of ${board.size}${narrow ? " picked" : " on the board"}`
        : `${shown.length} of ${activeCreameries.length}${narrow ? "" : " creameries"}`;

  // One panel, placed in whichever pane is active — two mounted copies would
  // fight over focus and duplicate the aria ids.
  const cheeseDetailNode =
    selectedCheese && data ? (
      <CheeseDetail
        cheese={selectedCheese}
        creamery={creameriesById.get(selectedCheese.creamery_id)}
        awards={awardsForCheese(data.awards, selectedCheese.id)}
        similar={similarResolved}
        highlight={
          highlights.find((h) => h.cheese.id === selectedCheese.id)?.highlight ?? null
        }
        hearted={heartSet.has(selectedCheese.id)}
        onToggleHeart={() => toggleHeart(selectedCheese.id)}
        onBoard={board.ids.includes(selectedCheese.id)}
        boardFull={board.ids.length >= board.size}
        onToggleBoard={() =>
          board.ids.includes(selectedCheese.id)
            ? board.remove(selectedCheese.id)
            : board.add(selectedCheese.id)
        }
        backLabel={view === "board" ? "Back to the board" : "Back to the catalog"}
        makerCount={
          activeCheeses.filter((c) => c.creamery_id === selectedCheese.creamery_id).length
        }
        position={cheeseIndex >= 0 ? `${cheeseIndex + 1} / ${cheesesShown.length}` : null}
        onClose={closeCheeseDetail}
        onPrev={() => stepCheese(-1)}
        onNext={() => stepCheese(1)}
        onOpenCheese={openCheese}
        onOpenCreamery={openCreamery}
        onBrowseMaker={browseMaker}
        onSearchTerm={searchTerm}
        imageUrl={draftImages?.get(selectedCheese.id)?.image ?? null}
        blurb={draftImages?.get(selectedCheese.id)?.summary ?? null}
        logoUrl={draftLogos?.get(selectedCheese.creamery_id) ?? null}
      />
    ) : null;

  /** Skip links move focus instead of changing the hash — the hash is a
   *  record's address here, and `#main` would be a share link to nowhere. */
  const skipTo = (selector: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  };

  return (
    <div className="app" data-view={view}>
      <div className="skip-links">
        <a className="skip-link" href="#main" onClick={skipTo("#main")}>
          Skip to the {view === "map" ? "creamery list" : view === "cheeses" ? "cheese catalog" : "cheese board"}
        </a>
        {/* The map's own controls sit after the whole list in the Tab order;
            this lands on the map itself (arrow keys pan it, + and − zoom).
            Only while the map is on screen — a phone shows one pane. */}
        {view === "map" && (!narrow || mobilePane === "map") && (
          <a className="skip-link" href="#creamery-map" onClick={skipTo("#creamery-map")}>
            Skip to the map
          </a>
        )}
        <a className="skip-link" href="#colophon" onClick={skipTo("#colophon")}>
          Skip to about and sources
        </a>
      </div>
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
            <img
              className="wpr-badge"
              src={`${import.meta.env.BASE_URL}wpr-typewriter-badge.png`}
              alt=""
              width={26}
              height={26}
            />
          </p>
          <span className="count" aria-live="polite">
            {countLine}
          </span>
        </div>

        {/* Always in the flow (empty until the tables land) so the tabs and the
            list do not jump down when the figures arrive. */}
        <div className="stats-line">
          {stats && (
            <>
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
                  <b>{stats.cheeses.toLocaleString("en-US")}</b> cheeses
                </span>
              )}
              <span>
                <b>{stats.masters}</b> master cheesemakers
              </span>
              <span>
                <b>{stats.awards}</b> contest awards
              </span>
            </>
          )}
        </div>

        {/* Real links: each view has an address, so right-click "copy link"
            and middle-click work; a plain click stays in the page. */}
        <nav className="mast-tabs" aria-label="Census views">
          {/* Phones get the short names so all three tabs share one row. */}
          <a
            className="mode"
            href="?view=map"
            aria-current={view === "map" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              transition(() => setView("map"));
            }}
            aria-label="Creamery Map"
          >
            {narrow ? "Map" : "Creamery Map"}
          </a>
          <a
            className="mode"
            href="?view=cheeses"
            aria-current={view === "cheeses" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              transition(() => setView("cheeses"));
            }}
            aria-label="Cheese Catalog"
          >
            {narrow ? "Catalog" : "Cheese Catalog"}
          </a>
          <a
            className="mode"
            href="?view=board"
            aria-current={view === "board" ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              transition(() => setView("board"));
            }}
            aria-label={`Cheese Board${board.ids.length ? `, ${board.ids.length} picks` : ""}`}
          >
            {narrow ? "Board" : "Cheese Board"}
            {board.ids.length > 0 && <span className="tab-count">{board.ids.length}</span>}
          </a>
          {hearts.length > 0 && (
            <button
              className="mode-hearts"
              onClick={() => {
                // "Take me to my shelf" — stale facets from earlier browsing
                // would silently hide saved cheeses.
                clearCheeseFacets();
                setMineOnly(true);
                transition(() => setView("cheeses"));
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

      {((draftImages?.size ?? 0) > 0 || (draftLogos?.size ?? 0) > 0) && (
        <div className="draftbar" role="note">
          Internal draft — {draftImages?.size ?? 0} product photos and{" "}
          {draftLogos?.size ?? 0} facility logos hotlinked from creamery sites
          for review only, pending the pre-launch rights review. Not for
          publication.
        </div>
      )}

      <main className="viewport" id="main" tabIndex={-1}>
        <div className={`layout${view === "map" ? "" : " view-off"}`}>
          <h2 className="sr-only">Creamery map</h2>
          <div className={`sidebar${mobilePane === "map" ? " pane-off" : ""}`}>
            <div className="filters">
              <div className="filter-search-row">
                <input
                  type="search"
                  placeholder="Search creameries — try “limburger”"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search creameries by name, city, county or cheese type"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
                {/* Phones only (styles.css hides it wider): the county and the
                    sort unfold beneath on demand — the button names what it
                    holds — and the count says how many are set, so a short
                    list never reads as a small census. */}
                <button
                  type="button"
                  className={`facets-toggle${foldedActive ? " is-active" : ""}`}
                  aria-expanded={!foldFilters}
                  aria-controls="map-facets map-toggles"
                  onClick={() => setFiltersOpen((o) => !o)}
                >
                  County &amp; sort
                  {foldedActive > 0 && <span className="facets-count">{foldedActive}</span>}
                  <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" />
                  </svg>
                </button>
              </div>
              {/* Every filter in force as a removable chip, as the catalog
                  shows its own — visible with the phone's fold closed, so a
                  short list always shows its cause and its undo. */}
              {mapChips.length > 0 && (
                <div className="active-filters" aria-label="Filters in force">
                  {mapChips.map((chip) => (
                    <button
                      type="button"
                      key={chip.key}
                      className="filter-chip"
                      onClick={chip.remove}
                      aria-label={chip.aria}
                    >
                      {chip.label}
                      <span className="chip-x" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  ))}
                  {mapChips.length > 1 && (
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        clearNarrowing();
                        setSort("name");
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
              <div className="map-facets" id="map-facets" hidden={foldFilters}>
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
                    value={sort === "distance" && !here ? "name" : sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    aria-label="Sort creameries"
                  >
                    {here && <option value="distance">Sort: Nearest</option>}
                    <option value="name">Sort: A–Z</option>
                    <option value="awards">Sort: Most awarded</option>
                    <option value="county">Sort: County</option>
                  </select>
                </div>
              </div>
              {/* "Near me" is a sort, so it sits on the sort row (styles.css
                  lays the filters out as a grid), with what it came to beneath.
                  The reader's position stays in this browser: it sorts the
                  list and draws one dot, and is never stored or shared. */}
              <div className="locate-row">
                <button
                  type="button"
                  className={`near-me${here ? " is-on" : ""}`}
                  onClick={locate}
                  disabled={locating === "asking"}
                  aria-pressed={here !== null}
                >
                  <Crosshair />
                  {locating === "asking" ? "Finding you…" : here ? "Nearest first" : "Near me"}
                </button>
                {nearestLine && (
                  <p className="locate-note" role="status">
                    {nearestLine}
                  </p>
                )}
                {locating === "denied" && (
                  <p className="locate-note" role="status">
                    Location is off for this site. Turn it on in your browser, or pick a
                    county above.
                  </p>
                )}
                {locating === "unavailable" && (
                  <p className="locate-note" role="status">
                    Your location isn&rsquo;t available here — pick a county above instead.
                  </p>
                )}
              </div>
              {/* The two narrowings a visitor wants: in the open on every
                  size, beside Near me on a phone. */}
              <div className="map-facets" id="map-toggles">
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
              {query.trim() && data && shown.length > 0 && (
                <p className="result-strip" role="status" tabIndex={-1}>
                  <b>{shown.length}</b> {shown.length === 1 ? "matches" : "match"}{" "}
                  &ldquo;{query.trim()}&rdquo;
                  <button type="button" className="linkish" onClick={() => setQuery("")}>
                    Clear
                  </button>
                </p>
              )}
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
                      <h3 className="county-head">
                        <span>{group.label}</span>
                        <span className="era-count">{group.rows.length}</span>
                      </h3>
                      {group.rows.map(renderRow)}
                    </div>
                  ))
                : shown.map(renderRow)}
              {data && shown.length === 0 && (
                <div className="empty">
                  {query.trim() && filtered.statewide > 0 ? (
                    <>
                      {/* The word found creameries; the county or a checkbox
                          hid them. Blaming the word would tell the reader a
                          real place is not in the census. */}
                      <p className="empty-head">
                        <b>{filtered.statewide}</b>{" "}
                        {filtered.statewide === 1 ? "matches" : "match"} &ldquo;{query.trim()}
                        &rdquo; statewide, none {narrowing}.
                      </p>
                      <p>
                        <button type="button" className="linkish" onClick={clearNarrowing}>
                          Show all {filtered.statewide}
                        </button>
                        {" · "}
                        <button type="button" className="linkish" onClick={() => setQuery("")}>
                          Clear the search
                        </button>
                      </p>
                    </>
                  ) : query.trim() ? (
                    <>
                      <p className="empty-head">Nothing called &ldquo;{query.trim()}&rdquo;.</p>
                      {creameryNearMisses.length > 0 && (
                        <p className="near-misses">
                          Did you mean{" "}
                          {creameryNearMisses.map((miss, i) => (
                            <span key={miss.id}>
                              {i > 0 ? (i === creameryNearMisses.length - 1 ? " or " : ", ") : ""}
                              <button
                                type="button"
                                className="linkish"
                                onClick={() => setQuery(miss.name)}
                              >
                                {miss.name}
                              </button>
                            </span>
                          ))}
                          ?
                        </p>
                      )}
                      <p>Try a creamery, a city, a county or a cheese type (Limburger).</p>
                      <p>
                        <button type="button" className="linkish" onClick={() => setQuery("")}>
                          Clear the search
                        </button>
                        {(county || retailOnly || awardedOnly) && (
                          <>
                            {" · "}
                            <button type="button" className="linkish" onClick={clearFilters}>
                              Clear the filters too
                            </button>
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>No creameries match those filters.</p>
                      <button className="linkish" onClick={clearFilters}>
                        Clear filters
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`map-pane${mobilePane === "list" ? " pane-off" : ""}`}>
            {mapMounted && (
              <Suspense fallback={null}>
                <MapView
                  creameries={shown}
                  selectedId={selectedId}
                  onSelect={(id) => transition(() => setSelectedId(id))}
                  tooltips={mapTips}
                  here={here}
                  county={county}
                  onCounty={(name) => setCounty(name === county ? "" : name)}
                  countyCounts={countyCounts}
                  awards={awardCounts}
                />
              </Suspense>
            )}
            <div className="legend">
              <span>
                <i className="marker" style={{ width: 10, height: 10 }} /> Creamery
              </span>
              <span>
                <i className="marker has-store" style={{ width: 10, height: 10 }} /> Retail
                store
              </span>
              <span title="The more contest awards, the bigger the pin">
                <i className="marker has-award" style={{ width: 10, height: 10 }} /> Award
                winner
              </span>
              {selectedId && (
                <span>
                  <i className="marker is-selected" style={{ width: 10, height: 10 }} />{" "}
                  Selected
                </span>
              )}
              {here && (
                <span>
                  <i className="here-dot" /> You
                </span>
              )}
            </div>
            {/* Phones only: the map pane's own "Near me", under the zoom
                buttons, so a reader looking at the map need not flip to the
                list to ask. */}
            <button
              type="button"
              className={`map-locate${here ? " is-on" : ""}`}
              onClick={locate}
              disabled={locating === "asking"}
              aria-pressed={here !== null}
              aria-label="Near me"
              title={here ? "Nearest first — tap to turn off" : "Near me"}
            >
              <Crosshair />
            </button>
            {selected && data && (
              <CreameryDetail
                creamery={selected}
                people={peopleFor(data.people, selected.id)}
                awards={awardsFor(data.awards, selected.id)}
                cheeses={selectedCreameryCheeses}
                logoUrl={draftLogos?.get(selected.id) ?? null}
                position={shownIndex >= 0 ? `${shownIndex + 1} / ${shown.length}` : null}
                backLabel={mobilePane === "map" ? "Back to the map" : "Back to the list"}
                onClose={closeDetail}
                onPrev={() => step(-1)}
                onNext={() => step(1)}
                onFilterCheese={filterByCheese}
                onOpenCheese={openCheese}
                onBrowseCheeses={() => browseMaker(selected.id)}
              />
            )}
          </div>

          <button
            className="mobile-flip"
            onClick={() => setMobilePane((p) => (p === "list" ? "map" : "list"))}
          >
            {mobilePane === "list" ? (
              <>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.5a6.3 6.3 0 0 0-6.3 6.3c0 4.6 5 11.2 6.3 12.7 1.3-1.5 6.3-8.1 6.3-12.7A6.3 6.3 0 0 0 12 2.5zm0 8.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z" />
                </svg>
                Show map
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5.2h16v2.6H4zm0 5.5h16v2.6H4zm0 5.5h16v2.6H4z" />
                </svg>
                Show list
              </>
            )}
          </button>
        </div>

        <div className={`cheese-pane${view === "cheeses" ? "" : " view-off"}`}>
          <h2 className="sr-only">Cheese catalog</h2>
          <CheeseBrowse
            loading={!data}
            narrow={narrow}
            shown={cheesesShown}
            filterKey={cheeseFilterKey}
            hints={cheeseFiltered.hints}
            nearMisses={nearMisses}
            creameriesById={creameriesById}
            awardsByCheese={awardsByCheese}
            heartSet={heartSet}
            heartCount={hearts.length}
            onToggleHeart={toggleHeart}
            recommendations={recommendations}
            highlights={highlights}
            selectedId={selectedCheeseId}
            onOpen={(id) => transition(() => setSelectedCheeseId(id))}
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
            textureCounts={textureCounts}
            milkCounts={milkCounts}
            onClearAll={clearCheeseFacets}
            images={draftImages}
          />
          {view !== "board" && cheeseDetailNode}
        </div>

        <div className={`board-pane${view === "board" ? "" : " view-off"}`}>
          <BoardView
            loading={!data}
            picks={boardCheeses}
            size={board.size}
            cheesesById={cheesesById}
            creameriesById={creameriesById}
            awardsByCheese={awardsByCheese}
            coverage={boardAnalysis.coverage}
            nudges={boardAnalysis.nudges}
            suggestions={boardAnalysis.suggestions}
            swap={boardAnalysis.swap}
            highlights={highlights}
            sponsor={boardSponsor}
            featured={featuredBoards}
            onAdopt={adoptBoard}
            images={draftImages}
            heartCount={hearts.length}
            shareUrl={boardShareUrl}
            undo={undo ? { label: undo.label } : null}
            onUndo={undoBoard}
            onSetSize={board.setSize}
            onAdd={board.add}
            onRemove={board.remove}
            onClear={clearBoard}
            onComplete={completeMyBoard}
            onSeed={seedBoardFromHearts}
            onSwap={swapIn}
            onOpen={(id) => transition(() => setSelectedCheeseId(id))}
          />
          {view === "board" && cheeseDetailNode}
        </div>
      </main>

      <footer className="colophon" id="colophon" tabIndex={-1}>
        <span>The Cheese Census — Wausau Pilot &amp; Review · 715-301-5539</span>
        <span className="sources">
          Plant data: Wisconsin DATCP · Consumer listings: Dairy Farmers of Wisconsin ·
          Awards: Wisconsin Cheese Makers Association · Map: © OpenStreetMap contributors
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
            onKeyDown={trapAboutTab}
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
                <span className="sr-only"> (opens in a new tab)</span>
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
              <li>
                <b>The map</b> — roads, rivers and towns from{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenStreetMap
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>{" "}
                contributors, via Protomaps, served by WPR from a Wisconsin extract
                with nothing fetched from a third party; state and county lines from
                the U.S. Census Bureau. Each creamery is pinned at its licensed plant
                (the one nearest its listing when it has several), placed with the
                Census Bureau&apos;s geocoder.
              </li>
            </ul>
            <h3>Saved cheeses</h3>
            <p>
              The ♥ list is yours alone: it is stored in your browser and never sent
              anywhere. &ldquo;To try next&rdquo; is matched from your saved cheeses
              by the same similarity scoring, on your device.
            </p>
            <h3>The cheese board</h3>
            <p>
              Board picks live in your browser the same way, and are shared only
              when you share your board&apos;s link — the link itself is the board.
              Featured boards are reader submissions, sent to the newsroom by email
              and reviewed by an editor before they appear. Sponsor messages in the
              builder are always labeled as sponsored.
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
              Spot an error? Corrections are welcome at{" "}
              <a href="mailto:editor@wausaupilotandreview.com">editor@wausaupilotandreview.com</a>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
