import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Creamery } from "../types";
import { labelRules, leafletLayer, paintRules, ShieldSymbolizer, type LabelRule } from "protomaps-leaflet";
import { namedFlavor, type Flavor } from "@protomaps/basemaps";
import wisconsin from "../wisconsin.json";
import counties from "../counties.json";
import { mapsHref } from "../maps";

// Wisconsin, comfortably framed.
const CENTER: L.LatLngTuple = [44.6, -89.8];
const ZOOM = 7;

// The overview frames the in-state pins. (Every exported pin is in-state —
// build validation #11 — so this is a guard for the reader's own location
// marker and for any future out-of-state listing, not a working assumption.)
const WISCONSIN = L.latLngBounds([42.3, -93.1], [47.4, -86.1]);

// Keep in step with `.detail { width: min(420px, 100%) }` in styles.css.
const DETAIL_WIDTH = 420;
const MIN_VISIBLE_MAP = 140;
// Room kept around a selected pin inside the strip the panel leaves visible:
// a thumb's hit box plus a little, so the pin never sits on the edge.
const PIN_MARGIN = 56;

// The pin stays a 12 px dot (18 selected); its hit box is what a thumb needs.
const COARSE = window.matchMedia("(pointer: coarse)").matches;
const HIT = COARSE ? 44 : 28;
// A pointer that hovers has already read the pin's card before it clicks, so
// only a pin drawn on top of another needs the chooser there.
const HOVER = window.matchMedia("(hover: hover)").matches;
const CHOOSER_RADIUS = HOVER ? 8 : HIT * 0.8;
// A cluster tap zooms to where the tapped pins part, at most this many steps
// closer and never past this zoom; pins that still coincide there share one
// address and get the chooser instead.
const SPLIT_STEPS = 4;
const SPLIT_MAX_ZOOM = 13;
// A crowd this small opens the chooser straight away instead of zooming.
const CHOOSER_DIRECT = 4;
// How long the "zooming in" label stays, in ms.
const HINT_MS = 1600;
// Reduced motion covers Leaflet's own zoom, fade and pan animations too.
const MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// A phone shows one pane and its map controls sit at the bottom, in a
// thumb's reach and off the state: the zoom buttons bottom-right above the
// credit line, "Wisconsin" and the locate button bottom-left (styles.css
// places the latter), the legend alone at the top. A top-left column of
// controls had covered the state's northwest, with Burnett Dairy's pin
// under the locate button; fitting the overview clear of it cost a half
// step of zoom that the pins could not spare.
const NARROW = window.matchMedia("(max-width: 760px)").matches;
// Inside an article (the WordPress iframe) on a phone, a one-finger swipe on
// the map must scroll the article, not pan the map — a full-height map pane
// would otherwise trap the page. So the map starts un-draggable there and arms
// on the reader's first tap; pinch-zoom works throughout. Standalone, the page
// has nothing else to scroll, so dragging is on from the start.
const COOPERATIVE = COARSE && window.self !== window.top;

// The chooser is a native popover where the browser has one: top layer, light
// dismiss and Escape for free. Elsewhere it is a plain card with the same
// shape and its own outside-click listener.
const POPOVER = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

// The basemap is the census's own: a Protomaps extract of Wisconsin
// (public/map/wisconsin.pmtiles — OpenStreetMap data, zoom 0–11, read from
// the site itself by HTTP range requests, so the map makes no third-party
// request) drawn by protomaps-leaflet in the WPR palette. The extract stops
// at zoom 11 to stay well inside GitHub's 100 MB file limit; past it,
// protomaps-leaflet redraws the zoom-11 geometry at the finer zooms, which
// holds up for three steps (the state's roads, rivers and towns, no
// residential streets or buildings) and goes polygonal beyond them.
const DATA_ZOOM = 11;
const MAX_ZOOM = 14;

/** The light flavor recoloured into the census's own palette: cream land,
 *  a tinted water, pencil-grey roads, ink labels with cream halos. The
 *  roads were white at first, the light flavor's idiom — on cream that is
 *  1.1:1 and the map read as polygons from zoom 9 up. protomaps-leaflet
 *  paints every road kind with `major` (no casings), so one warm grey at
 *  2.1:1 against the cream draws the whole network. */
function wprFlavor(light: Flavor): Flavor {
  const cream = "#f6f2e9";
  const paper = "#fbf9f4";
  const rule = "#e3ddd0";
  const minor = "#f0ebe1";
  const major = "#b3a995";
  const casingKeys = Object.keys(light).filter((k) => k.endsWith("_casing") || k.endsWith("_casing_early") || k.endsWith("_casing_late"));
  const overrides: Record<string, unknown> = {
    background: cream,
    earth: cream,
    park_a: "#eef0e2",
    park_b: "#e4ead6",
    wood_a: "#e9ecdd",
    wood_b: "#dfe6d2",
    scrub_a: "#eef0e2",
    scrub_b: "#e4ead6",
    glacier: cream,
    sand: "#f1ebdc",
    beach: "#f1ebdc",
    hospital: cream,
    industrial: "#efe9df",
    school: cream,
    pedestrian: "#efe9df",
    aerodrome: "#efe9df",
    runway: rule,
    zoo: "#eef0e2",
    military: "#efe9df",
    water: "#d6e4e1",
    pier: rule,
    buildings: "#ece5d6",
    other: minor,
    minor_service: minor,
    minor_a: minor,
    minor_b: paper,
    link: paper,
    major: major,
    highway: major,
    railway: "#cfc8ba",
    boundaries: "#9fb5b0",
    bridges_other: minor,
    bridges_minor: paper,
    bridges_link: paper,
    bridges_major: major,
    bridges_highway: major,
    tunnel_other: minor,
    tunnel_minor: minor,
    tunnel_link: minor,
    tunnel_major: minor,
    tunnel_highway: minor,
    roads_label_minor: "#7d8683",
    roads_label_minor_halo: cream,
    roads_label_major: "#5b6663",
    roads_label_major_halo: cream,
    ocean_label: "#5b7f78",
    subplace_label: "#5b6663",
    subplace_label_halo: cream,
    city_label: "#1d2321",
    city_label_halo: cream,
    state_label: "#9aa5a1",
    state_label_halo: cream,
    country_label: "#9aa5a1",
    address_label: "#7d8683",
    address_label_halo: cream,
    landcover: {
      grassland: "#eef0e2",
      barren: "#f1ebdc",
      urban_area: "#efe9df",
      farmland: "#eef0e2",
      glacier: cream,
      scrub: "#eaeddc",
      forest: "#e3e9d6",
    },
  };
  for (const key of casingKeys) overrides[key] = rule;
  return { ...light, ...overrides } as Flavor;
}

/** Every label symbolizer carries a Font with a `family`; set them all. */
function withFont(rules: LabelRule[], family: string) {
  const seen = new Set<object>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (typeof record.family === "string") record.family = family;
    for (const inner of Object.values(record)) walk(inner);
  };
  for (const rule of rules) walk(rule.symbolizer);
}

interface Props {
  creameries: Creamery[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Prepared, escaped HTML hover cards, keyed by creamery id (built in App). */
  tooltips: Map<string, string>;
  /** The reader's own position, once they asked for it; never stored. */
  here: { lat: number; lng: number } | null;
  /** The county filter in force ("" for none); tapping a county toggles it. */
  county: string;
  onCounty: (name: string) => void;
  /** Creameries per county across the whole browsable set, for the county tooltips. */
  countyCounts: Map<string, number>;
  /** Contest awards per creamery: award winners get a larger, ringed pin. */
  awards: Map<string, number>;
  /** The creamery the page was opened on (an article's deep link), if any:
   *  its first selection frames the town rather than nudging the overview. */
  arrival: string | null;
}

/** Pin size by award count: a graduated symbol, three steps, legible at 12 px. */
function pinSize(awards: number, selected: boolean): number {
  if (selected) return 22;
  if (awards >= 15) return 18;
  if (awards >= 5) return 16;
  if (awards >= 1) return 14;
  return 12;
}

/** How a frame fits its bounds: even room on a desktop; on a phone, clear
 *  of the two-line legend at the top and of the pill at the bottom, with
 *  the sides kept tight so the state takes the width it can. */
const FIT: L.FitBoundsOptions = NARROW
  ? { paddingTopLeft: [12, 64], paddingBottomRight: [12, 28] }
  : { padding: [32, 32] };

const COUNTY_STYLE: L.PathOptions = {
  color: "#3a867c",
  weight: 0.8,
  opacity: 0.45,
  fillColor: "#3a867c",
  fillOpacity: 0,
};
const COUNTY_HOVER: L.PathOptions = { fillOpacity: 0.08 };
const COUNTY_ACTIVE: L.PathOptions = { weight: 2, opacity: 0.95, fillOpacity: 0.12 };

export default function MapView({
  creameries,
  selectedId,
  onSelect,
  tooltips,
  here,
  county,
  onCounty,
  countyCounts,
  awards,
  arrival: arrivedAt,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Spent on the first selection it names; a later hash change is a plain selection.
  const arrival = useRef(arrivedAt);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const byId = useRef<Map<string, Creamery>>(new Map());
  const storeIds = useRef<Set<string>>(new Set());
  const hereMarker = useRef<L.Marker | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const selection = useRef(selectedId);
  selection.current = selectedId;
  const pickCounty = useRef(onCounty);
  pickCounty.current = onCounty;
  const activeCounty = useRef(county);
  activeCounty.current = county;
  const countyTotals = useRef(countyCounts);
  countyTotals.current = countyCounts;
  const awardsRef = useRef(awards);
  awardsRef.current = awards;
  const countyLayer = useRef<L.GeoJSON | null>(null);
  // The state outline's own bounds, and the "Wisconsin" control's button
  // (its title says when a press also clears the county).
  const stateBounds = useRef<L.LatLngBounds | null>(null);
  const resetButton = useRef<HTMLButtonElement | null>(null);
  const [armed, setArmed] = useState(!COOPERATIVE);
  // The map shows a frame the reader chose — a drag, a pinch, the zoom
  // buttons, a cluster tap, Near me — and a refit would take it from them.
  // Our own moves (the overview, the pan that shows a selected pin) set
  // `programmatic` instead and are ours to undo.
  const touched = useRef(false);
  const programmatic = useRef(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  // Leaflet ignores a zoom asked for while its zoom animation runs: our own
  // moves wait for the animation's end (`queued`), and the zoom buttons'
  // presses add up to a target (`pendingZoom`) that the end applies.
  const zooming = useRef(false);
  const queued = useRef<(() => void) | null>(null);
  const pendingZoom = useRef<number | null>(null);
  // The pin under a hovering pointer, resolved to the nearest centre.
  const hoveredPin = useRef<string | null>(null);
  // At the cap, the map says so and hands off to the reader's maps app.
  const [capped, setCapped] = useState(false);
  const [chooser, setChooser] = useState<{ at: L.LatLng; rows: Creamery[] } | null>(null);
  const chooserEl = useRef<HTMLDivElement>(null);

  /** Move the map ourselves without counting it as the reader's hand. The
   *  flag clears when this move ends — listened for after the action, because
   *  Leaflet stops any running animation first and that stop fires its own
   *  moveend — or after a beat, for a move that turns out to be no move. */
  function move(action: () => void) {
    const m = map.current;
    if (!m) return;
    const run = () => {
      programmatic.current = true;
      action();
      const done = () => {
        programmatic.current = false;
      };
      m.once("moveend", done);
      window.setTimeout(done, 1500);
    };
    if (!zooming.current) {
      run();
      return;
    }
    // Asked mid-animation Leaflet would drop it; it runs when the animation
    // ends (or after a beat, should the end never be reported).
    queued.current = run;
    window.setTimeout(() => {
      if (queued.current === run) {
        queued.current = null;
        run();
      }
    }, 1200);
  }

  function flash(text: string) {
    setHint(text);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), HINT_MS);
  }

  /** One source of truth for pin appearance: retail stores read as a donut,
   *  award winners carry a gold ring and grow with their count, the selected
   *  creamery is the largest gold pin. Classes live in styles.css next to
   *  the legend that explains them. */
  function icon(id: string, selected: boolean): L.DivIcon {
    const wins = awardsRef.current.get(id) ?? 0;
    const size = pinSize(wins, selected);
    const classes = ["marker"];
    if (storeIds.current.has(id)) classes.push("has-store");
    if (wins > 0) classes.push("has-award");
    if (selected) classes.push("is-selected");
    return L.divIcon({
      className: "",
      html: `<div class="marker-hit"><div class="${classes.join(" ")}" style="width:${size}px;height:${size}px"></div></div>`,
      iconSize: [HIT, HIT],
      iconAnchor: [HIT / 2, HIT / 2],
    });
  }

  /** Frame the visible set: fit the in-state pins, or fall back to the whole state. */
  function frame() {
    const m = map.current;
    if (!m) return;
    const inState = [...markers.current.values()]
      .map((marker) => marker.getLatLng())
      .filter((p) => WISCONSIN.contains(p));
    move(() => {
      if (inState.length > 1) {
        m.fitBounds(L.latLngBounds(inState), { ...FIT, maxZoom: 11 });
      } else if (inState.length === 1) {
        m.setView(inState[0], 10);
      } else {
        m.setView(CENTER, ZOOM);
      }
    });
    touched.current = false;
  }

  /** "Wisconsin", literally: the whole state, and no county filter. The
   *  button had framed whatever set was shown — four pins after a county
   *  tap — under a name that promised the state, which on a phone left a
   *  thumb's miss on a county with no way back. A county in force is
   *  cleared (the list's refit then frames every pin); otherwise the state's
   *  outline is fitted, whatever search or toggle is narrowing the list. */
  function reset() {
    const m = map.current;
    if (!m) return;
    if (activeCounty.current) {
      pickCounty.current(activeCounty.current);
      return;
    }
    if (stateBounds.current) move(() => m.fitBounds(stateBounds.current!, FIT));
    touched.current = false;
  }

  /** The pin a pointer means: the nearest centre among the hit boxes it is
   *  in. Hit boxes overlap wherever pins crowd — at the overview a third of
   *  the dots sit inside a neighbour's box — so the topmost box must not win:
   *  pointing at Emmi Roth's dot opened Maple Leaf. The pins themselves take
   *  no pointer events; the map resolves every hover and press here. */
  function pinAt(point: L.Point): string | null {
    const m = map.current;
    if (!m) return null;
    let best: string | null = null;
    let nearest = HIT / 2;
    for (const [id, marker] of markers.current) {
      const d = point.distanceTo(m.latLngToContainerPoint(marker.getLatLng()));
      if (d <= nearest) {
        nearest = d;
        best = id;
      }
    }
    return best;
  }

  /** A press resolved to a pin: open it; or, at the overview where the Fox
   *  Valley is seven pins under one thumb but seven towns on the ground, one
   *  move to the zoom where the pressed pins part the most (within a few
   *  steps), with a label saying why the map moved; or the chooser, for pins
   *  that share an address and never part. */
  function tap(id: string, point: L.Point) {
    const m = map.current;
    const marker = markers.current.get(id);
    if (!m || !marker) return;
    const pin = marker.getLatLng();
    const under = [...markers.current.entries()]
      .filter(
        ([, other]) => point.distanceTo(m.latLngToContainerPoint(other.getLatLng())) <= CHOOSER_RADIUS,
      )
      .map(([other]) => other);
    if (under.length <= 1) {
      select.current(id);
      return;
    }
    // A small crowd is a chooser's job: one press, four names, a pick —
    // zooming first made it a move and two more presses.
    if (under.length <= CHOOSER_DIRECT) {
      openChooser(pin, under);
      return;
    }
    const base = Math.ceil(m.getZoom());
    const crowd = (z: number) =>
      under.filter(
        (other) =>
          m.project(pin, z).distanceTo(m.project(markers.current.get(other)!.getLatLng(), z)) <=
          CHOOSER_RADIUS,
      ).length;
    let target = base;
    let fewest = under.length;
    for (let z = base + 1; z <= Math.min(base + SPLIT_STEPS, SPLIT_MAX_ZOOM); z++) {
      const left = crowd(z);
      if (left < fewest) {
        fewest = left;
        target = z;
      }
      if (left <= 1) break;
    }
    // Worth a move only when it clears the press or at least halves the
    // crowd; splitting three pins into two is a chooser's job, not a second
    // silent zoom.
    if (target > base && (fewest <= 1 || fewest * 2 <= under.length)) {
      flash(`${under.length} creameries here — zooming in`);
      move(() => m.setView(pin, target, { animate: MOTION }));
      touched.current = true; // the reader asked for this town
      return;
    }
    openChooser(pin, under);
  }

  /** A tap that lands on more than one pin's hit box opens a chooser instead
   *  of whichever pin happened to be on top — pins that share an address
   *  never part however far the map zooms. */
  function openChooser(at: L.LatLng, ids: string[]) {
    const rows = ids
      .map((id) => byId.current.get(id))
      .filter((c): c is Creamery => Boolean(c))
      .sort((a, b) => a.name.localeCompare(b.name));
    setChooser({ at, rows });
  }

  function closeChooser() {
    const el = chooserEl.current;
    if (POPOVER && el?.matches(":popover-open")) el.hidePopover(); // its toggle event clears the state
    else setChooser(null);
  }

  // Place the chooser over the pin and show it. A popover lives in the top
  // layer, so the position is in viewport coordinates; it opens above the pin
  // and flips below when the top of the viewport is too close, and stays
  // inside the sides. The map moving underneath closes it.
  useEffect(() => {
    const el = chooserEl.current;
    const m = map.current;
    if (!el || !m || !chooser) return;
    const point = m.latLngToContainerPoint(chooser.at);
    const rect = m.getContainer().getBoundingClientRect();
    const x = rect.left + point.x;
    const y = rect.top + point.y;
    el.style.setProperty("--x", `${x}px`);
    el.style.setProperty("--y", `${y}px`);
    el.dataset.side = "above";
    if (POPOVER) el.showPopover();
    if (y - el.offsetHeight - 12 < 8) el.dataset.side = "below";
    const half = el.offsetWidth / 2 + 8;
    el.style.setProperty("--x", `${Math.min(Math.max(x, half), window.innerWidth - half)}px`);
    el.querySelector<HTMLElement>("button[data-id]")?.focus({ preventScroll: true });
    const onMove = () => closeChooser();
    m.on("movestart zoomstart", onMove);
    const onToggle = (ev: Event) => {
      if ((ev as ToggleEvent).newState === "closed") setChooser(null);
    };
    el.addEventListener("toggle", onToggle);
    // Without a popover there is no light dismiss: a press outside closes it.
    const onOutside = (ev: PointerEvent) => {
      if (!POPOVER && !el.contains(ev.target as Node)) setChooser(null);
    };
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      m.off("movestart zoomstart", onMove);
      el.removeEventListener("toggle", onToggle);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [chooser]);

  useEffect(() => {
    if (!host.current || map.current) return;
    map.current = L.map(host.current, {
      center: CENTER,
      zoom: ZOOM,
      maxZoom: MAX_ZOOM, // three steps past the extract's data; see DATA_ZOOM
      zoomControl: false, // ours, below: the buttons keep count of presses
      scrollWheelZoom: false, // an embedded iframe must not hijack page scroll
      dragging: !COOPERATIVE,
      zoomAnimation: MOTION,
      fadeAnimation: MOTION,
      markerZoomAnimation: MOTION,
      // fitBounds snaps to whole zoom levels by default, and Wisconsin misses
      // fitting at 7 by a hair — so the overview collapsed to a whole-Midwest 6.
      // Half-steps let the fit land where the state actually is.
      zoomSnap: 0.5,
    });
    // The basemap (see DATA_ZOOM above): the Protomaps light flavor in the
    // census's palette, labels in the body face, place names included — a map
    // with no "Wausau" on it asked readers to recall where they live. The
    // cream background also stands in beyond the extract's edge, about a
    // degree past the state line at zoom 8 and a few miles at zoom 11.
    const flavor = wprFlavor(namedFlavor("light"));
    const labels = labelRules(flavor, "en");
    withFont(labels, '"Public Sans", sans-serif');
    // Highway shields from zoom 8: "is it on the way?" is the question a
    // visitor asks of a map, and a road network alone cannot say which road
    // is which. Placed after the place names, which keep priority. A route
    // the data lists under two numbers ("I 39;US 51") would set as one
    // string, so those are left to the road's own name label.
    const shields: LabelRule = {
      dataLayer: "roads",
      minzoom: 8,
      symbolizer: new ShieldSymbolizer({
        labelProps: ["ref"],
        font: '600 11px "Public Sans", sans-serif',
        fill: "#1d2321",
        background: "#fbf9f4",
        padding: 3,
      }),
      filter: (zoom, feature) => {
        const ref = feature.props.ref;
        if (typeof ref !== "string" || ref.length === 0 || ref.length > 7) return false;
        return feature.props.kind === "highway" || (zoom >= 10 && feature.props.kind === "major_road");
      },
    };
    let afterPlaces = labels.length;
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].dataLayer === "places") {
        afterPlaces = i + 1;
        break;
      }
    }
    labels.splice(afterPlaces, 0, shields);
    leafletLayer({
      url: `${import.meta.env.BASE_URL}map/wisconsin.pmtiles`,
      paintRules: paintRules(flavor),
      labelRules: labels,
      maxDataZoom: DATA_ZOOM,
      backgroundColor: "#f6f2e9",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; <a href="https://protomaps.com">Protomaps</a>',
    }).addTo(map.current);
    // The state's own outline under the pins, so the census reads as a map
    // *of Wisconsin* and not pins adrift on a grey canvas. U.S. Census Bureau
    // 2010 cartographic boundary file (1:5,000,000, public domain), simplified
    // to 0.003° and bundled as web/src/wisconsin.json — no fetch, no failure path.
    const outline = L.geoJSON(wisconsin as GeoJSON.Feature, {
      interactive: false,
      style: {
        color: "#3a867c",
        weight: 1.5,
        opacity: 0.85,
        fillColor: "#3a867c",
        fillOpacity: 0.04,
      },
    }).addTo(map.current);
    stateBounds.current = outline.getBounds();
    // The counties, under the pins: the list, the select and the sort are all
    // county-first, so the map carries the same geometry. Reference lines,
    // not a filled choropleth — the pins already carry the magnitude, and a
    // county tinted by a raw count would only repeat them. Hover names the
    // county and its count; a tap filters the list to it (and again clears).
    // Same source as the state outline (Census cartographic boundaries,
    // 2023, 1:5M, public domain, simplified by scripts/counties.py).
    countyLayer.current = L.geoJSON(counties as GeoJSON.FeatureCollection, {
      style: () => COUNTY_STYLE,
      onEachFeature: (feature, shape) => {
        const name = String(feature.properties?.name ?? "");
        const path = shape as L.Path;
        const label = () => {
          const n = countyTotals.current.get(name) ?? 0;
          return `${name} County · ${n === 0 ? "no creameries in the census" : `${n} creamer${n === 1 ? "y" : "ies"}`}`;
        };
        // The name-and-count tooltip is for a pointer that hovers. A touch
        // fakes a hover too, and the tooltip it opened sat over the pins
        // through the zoom and the chooser that followed the tap.
        if (HOVER) {
          path.bindTooltip(label, { sticky: true, className: "county-tip", direction: "top", offset: [0, -8] });
          path.on("mouseover", () => {
            if (activeCounty.current !== name) path.setStyle(COUNTY_HOVER);
          });
          path.on("mouseout", () => {
            path.setStyle(activeCounty.current === name ? COUNTY_ACTIVE : COUNTY_STYLE);
          });
        }
        path.on("click", (e) => {
          // The pins take no pointer events, so a press on one reaches the
          // county beneath it too; the map's own click handler has it.
          if (pinAt((e as L.LeafletMouseEvent).containerPoint)) return;
          path.closeTooltip();
          // A county with no creameries has nothing to filter to. A hovering
          // pointer has read that in the tooltip; a thumb is told now.
          if (!countyTotals.current.get(name)) {
            if (!HOVER) flash(label());
            return;
          }
          pickCounty.current(name);
        });
      },
    }).addTo(map.current);
    // Leaflet binds focus and blur listeners to each county for its tooltip,
    // and Chromium treats an SVG element with focus listeners as a Tab stop:
    // 72 of them, unnamed and inert (Enter does nothing), between the map
    // and the zoom buttons. Out of the Tab order; the county select is the
    // keyboard path, and a pointer press still focuses the shape it pressed.
    countyLayer.current.eachLayer((shape) => {
      (shape as L.Path).getElement()?.setAttribute("tabindex", "-1");
    });
    layer.current = L.layerGroup().addTo(map.current);
    // The reader's own hand on the map, as opposed to our fits and pans: a
    // drag, a pinch, the zoom buttons. `programmatic` covers our own moves
    // until they end.
    const m = map.current;
    m.on("dragstart", () => {
      touched.current = true;
    });
    m.on("zoomstart", () => {
      zooming.current = true;
      if (!programmatic.current) touched.current = true;
      // Our own move outranks whatever the buttons had pending.
      else pendingZoom.current = null;
    });
    // The zoom buttons, with a memory. Leaflet ignores a zoom asked for while
    // its zoom animation is running, so a burst of presses from a thumb lost
    // most of its steps (seven taps, three steps). Each press now advances a
    // pending target, and the end of one animation starts the next — the
    // map ends up where the count of presses says. A press at the cap or
    // the floor leaves nothing pending: a target equal to the zoom in hand
    // never ends, and one left behind undid the next refit.
    const step = (delta: number) => {
      const from = pendingZoom.current ?? m.getZoom();
      const target = Math.max(m.getMinZoom(), Math.min(m.getMaxZoom(), from + delta));
      if (target === from) return;
      pendingZoom.current = target;
      m.setZoom(target, { animate: MOTION });
    };
    const QueuedZoom = L.Control.Zoom.extend({
      _zoomIn(e: MouseEvent) {
        step(e.shiftKey ? 3 : 1);
      },
      _zoomOut(e: MouseEvent) {
        step(e.shiftKey ? -3 : -1);
      },
    }) as unknown as new (options?: L.Control.ZoomOptions) => L.Control.Zoom;
    new QueuedZoom({ position: NARROW ? "bottomright" : "topleft" }).addTo(m);
    m.on("zoomend", () => {
      zooming.current = false;
      const next = queued.current;
      if (next) {
        // A move of ours that waited out the animation goes first.
        queued.current = null;
        pendingZoom.current = null;
        next();
      } else {
        const target = pendingZoom.current;
        if (target !== null && target !== m.getZoom()) m.setZoom(target, { animate: MOTION });
        else pendingZoom.current = null;
      }
      setCapped(m.getZoom() >= MAX_ZOOM);
    });
    // Every press and hover on the map resolves to the nearest pin (pinAt);
    // the pins themselves are inert to the pointer.
    m.on("click", (e: L.LeafletMouseEvent) => {
      const id = pinAt(e.containerPoint);
      if (id) tap(id, e.containerPoint);
    });
    if (HOVER) {
      const hover = (id: string | null) => {
        if (id === hoveredPin.current) return;
        if (hoveredPin.current) markers.current.get(hoveredPin.current)?.closeTooltip();
        hoveredPin.current = id;
        if (id) {
          countyLayer.current?.eachLayer((shape) => (shape as L.Path).closeTooltip());
          markers.current.get(id)?.openTooltip();
        }
        m.getContainer().classList.toggle("over-pin", id !== null);
      };
      m.on("mousemove", (e: L.LeafletMouseEvent) => hover(pinAt(e.containerPoint)));
      m.on("mouseout", () => hover(null));
    }
    // "Wisconsin": the way back to the whole state, under the zoom buttons —
    // the zoom control alone offers no return once a search or a cluster tap
    // has flown the map to one town (see reset()).
    const Reset = L.Control.extend({
      onAdd: () => {
        const bar = L.DomUtil.create("div", "leaflet-bar map-reset");
        const button = L.DomUtil.create("button", "", bar) as HTMLButtonElement;
        button.type = "button";
        button.textContent = "Wisconsin";
        button.title = "Show all of Wisconsin";
        button.setAttribute("aria-label", "Show all of Wisconsin");
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(button, "click", reset);
        resetButton.current = button;
        return bar;
      },
    });
    new Reset({ position: NARROW ? "bottomleft" : "topleft" }).addTo(map.current);
    // The chooser is a popover (below); the browser gives it a popover
    // attribute only where it can honour one.
    if (POPOVER) chooserEl.current?.setAttribute("popover", "auto");
    // Leaflet only watches window resizes; the container itself changes size
    // too (mobile pane flips, embed reflows, orientation changes). Re-measure,
    // and re-frame the overview unless the reader is looking at a pin.
    const observer = new ResizeObserver(() => {
      if (!map.current) return;
      map.current.invalidateSize({ animate: false });
      if (!selection.current) frame();
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Redraw pins whenever the filtered set changes (or the hover cards do —
  // the draft logo overlay arrives just after the dataset).
  useEffect(() => {
    if (!layer.current) return;
    closeChooser();
    layer.current.clearLayers();
    markers.current.clear();
    hoveredPin.current = null;
    byId.current = new Map(creameries.map((c) => [c.id, c]));
    storeIds.current = new Set(
      creameries.filter((c) => c.retail.store).map((c) => c.id),
    );
    for (const creamery of creameries) {
      if (creamery.lat === null || creamery.lng === null) continue;
      const marker = L.marker([creamery.lat, creamery.lng], {
        title: creamery.name,
        icon: icon(creamery.id, creamery.id === selection.current),
        // The list beside the map is the keyboard path to every creamery;
        // 88 focusable pins would be 88 extra Tab stops on the way to it.
        keyboard: false,
        // Inert to the pointer: the map resolves hover and press to the
        // nearest pin (pinAt), so an overlapping hit box never wins by
        // being on top.
        interactive: false,
      }).bindTooltip(tooltips.get(creamery.id) ?? `${creamery.name} — ${creamery.city}`, {
        direction: "top",
        offset: [0, -10],
        opacity: 1,
        className: "map-card-tip",
      });
      marker.addTo(layer.current!);
      markers.current.set(creamery.id, marker);
    }
    // Refit as filters narrow the set, but never yank the map while the reader is
    // looking at a particular creamery; the close refits if the frame is ours.
    if (!selection.current) frame();
  }, [creameries, tooltips, awards]);

  // The county in force reads as the one filled shape; the rest stay lines.
  // The "Wisconsin" button says that a press will clear it.
  useEffect(() => {
    countyLayer.current?.eachLayer((shape) => {
      const path = shape as L.Path & { feature?: GeoJSON.Feature };
      const name = String(path.feature?.properties?.name ?? "");
      path.setStyle(name === county && county ? COUNTY_ACTIVE : COUNTY_STYLE);
    });
    const label = county ? `Show all of Wisconsin (clears the ${county} County filter)` : "Show all of Wisconsin";
    resetButton.current?.setAttribute("title", label);
    resetButton.current?.setAttribute("aria-label", label);
  }, [county]);

  // Re-style the selected pin and bring it into view.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.setIcon(icon(id, id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    }
    if (!selectedId) {
      // Closing the panel is the way back: a frame of our own making (the
      // overview, the pan that showed the pin, a refit the list asked for
      // while the panel was up) is refitted, so the reader returns to the
      // state and not to wherever the pan left it. A frame the reader chose
      // is theirs to keep — unless they dragged it out of the state.
      if (!map.current) return;
      if (!touched.current || !WISCONSIN.contains(map.current.getCenter())) frame();
    } else if (map.current) {
      closeChooser();
      const marker = markers.current.get(selectedId);
      if (marker) {
        // The panel covers the right of the map, so the pin has to land in the
        // strip that stays visible — and only by as much as that takes. A pin
        // already in the strip does not move the map, and a southern pin at
        // the overview no longer pulls Illinois into the frame, as centring
        // it in the strip did. On a narrow screen the panel covers nearly
        // everything; the pin is simply centred, for when the sheet closes.
        const m = map.current;
        const width = m.getSize().x;
        const panel = Math.min(DETAIL_WIDTH, width);
        const strip = width - panel >= MIN_VISIBLE_MAP;
        if (arrival.current === selectedId) {
          // Arrival by deep link: the reader came for this place, not for
          // the state, and has seen no frame yet — so the town, at zoom 10,
          // with the pin in the middle of the strip (the overview's minimal
          // pan would leave it tucked in the strip's corner). Ours to undo:
          // closing the panel refits the overview.
          arrival.current = null;
          const zoom = Math.max(m.getZoom(), 10);
          const centre = strip
            ? m.unproject(m.project(marker.getLatLng(), zoom).add([panel / 2, 0]), zoom)
            : marker.getLatLng();
          move(() => m.setView(centre, zoom, { animate: false }));
          touched.current = false;
        } else if (strip) {
          move(() =>
            m.panInside(marker.getLatLng(), {
              paddingTopLeft: [PIN_MARGIN, PIN_MARGIN],
              paddingBottomRight: [panel + PIN_MARGIN, PIN_MARGIN],
              animate: MOTION,
            }),
          );
        } else {
          move(() => m.panTo(marker.getLatLng(), { animate: MOTION }));
        }
      }
    }
  }, [selectedId]);

  // The reader's own position: one ink dot, and the map moves to it once.
  useEffect(() => {
    if (!map.current) return;
    hereMarker.current?.remove();
    hereMarker.current = null;
    if (!here) return;
    hereMarker.current = L.marker([here.lat, here.lng], {
      icon: L.divIcon({ className: "", html: '<div class="here-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 500,
    }).addTo(map.current);
    const m = map.current;
    move(() => m.setView([here.lat, here.lng], Math.max(m.getZoom(), 9), { animate: MOTION }));
    touched.current = true; // the reader asked to be here
  }, [here]);

  /** The first tap on an embedded phone map arms dragging (this tap itself
   *  still lands on whatever it touched — a pin opens as usual). */
  function arm() {
    if (armed || !map.current) return;
    map.current.dragging.enable();
    setArmed(true);
  }

  // The hand-off at the zoom cap: the selected creamery's own maps link, the
  // same one the panel's Contact block carries.
  const capLink = selectedId ? mapsHref(creameries.find((c) => c.id === selectedId)) : null;

  return (
    <div
      className="map-wrap"
      role="region"
      aria-label="Map of Wisconsin creameries"
      onPointerDown={arm}
    >
      <p className="sr-only">
        Pins are not keyboard stops; the list beside the map has every creamery. An award
        winner&rsquo;s pin grows with its contest wins.
      </p>
      <div className="map" id="creamery-map" ref={host} />
      {!armed && (
        <p className="map-hint" aria-hidden="true">
          Tap the map to move it
        </p>
      )}
      {/* Why the map just moved on its own ("13 creameries here — zooming
          in"), or, at the cap, that it goes no closer and where to for
          streets. Always mounted (a live region announces changes, not
          arrivals); styles.css hides it while empty. */}
      <p className="map-hint map-zoom-hint" role="status">
        {hint ??
          (capped ? (
            <>
              As close as the census map goes
              {capLink && (
                <>
                  {" · "}
                  <a href={capLink} target="_blank" rel="noopener noreferrer">
                    Open in Maps
                  </a>
                </>
              )}
            </>
          ) : null)}
      </p>
      {/* The pin chooser. Escape stops here: the app's own Escape (close the
          panel) is not what the key meant, and focus goes back to the map. */}
      <div
        ref={chooserEl}
        className="pin-chooser"
        hidden={!POPOVER && !chooser}
        role="group"
        aria-labelledby="pin-chooser-head"
        onKeyDown={(ev) => {
          if (ev.key !== "Escape") return;
          ev.stopPropagation();
          closeChooser();
          map.current?.getContainer().focus({ preventScroll: true });
        }}
      >
        {chooser && (
          <>
            <p className="pc-head" id="pin-chooser-head">
              {chooser.rows.length} creameries here — pick one
            </p>
            <button type="button" className="pc-close" aria-label="Close" onClick={closeChooser}>
              ×
            </button>
            <ul>
              {chooser.rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    data-id={c.id}
                    onClick={() => {
                      closeChooser();
                      select.current(c.id);
                    }}
                  >
                    {c.name}
                    <span>
                      {c.city}
                      {c.county ? ` · ${c.county} Co.` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
