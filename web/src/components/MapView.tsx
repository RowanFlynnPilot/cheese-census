import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Creamery } from "../types";
import wisconsin from "../wisconsin.json";
import counties from "../counties.json";

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
// How long the "zooming in" label stays, in ms.
const HINT_MS = 1600;
// Reduced motion covers Leaflet's own zoom, fade and pan animations too.
const MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
}

/** Pin size by award count: a graduated symbol, three steps, legible at 12 px. */
function pinSize(awards: number, selected: boolean): number {
  if (selected) return 22;
  if (awards >= 15) return 18;
  if (awards >= 5) return 16;
  if (awards >= 1) return 14;
  return 12;
}

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
}: Props) {
  const host = useRef<HTMLDivElement>(null);
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
  const [armed, setArmed] = useState(!COOPERATIVE);
  // The reader moved the map by hand (drag, pinch, the zoom buttons) — then a
  // refit would take a view they chose. Our own moves set `programmatic`.
  const touched = useRef(false);
  const programmatic = useRef(false);
  // The filtered set changed while a panel was open: refit when it closes.
  const pendingFrame = useRef(false);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<number | null>(null);
  const [chooser, setChooser] = useState<{ at: L.LatLng; rows: Creamery[] } | null>(null);
  const chooserEl = useRef<HTMLDivElement>(null);

  /** Move the map ourselves without counting it as the reader's hand. The
   *  flag clears when this move ends — listened for after the action, because
   *  Leaflet stops any running animation first and that stop fires its own
   *  moveend — or after a beat, for a move that turns out to be no move. */
  function move(action: () => void) {
    programmatic.current = true;
    action();
    const done = () => {
      programmatic.current = false;
    };
    map.current?.once("moveend", done);
    window.setTimeout(done, 1500);
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
        m.fitBounds(L.latLngBounds(inState), { padding: [32, 32], maxZoom: 11 });
      } else if (inState.length === 1) {
        m.setView(inState[0], 10);
      } else {
        m.setView(CENTER, ZOOM);
      }
    });
    touched.current = false;
    pendingFrame.current = false;
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
      maxZoom: 16, // the basemap's native ceiling — past it lies grey void
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
    // Esri's Light Gray canvas: keyless, CDN-fast, and muted enough to sit
    // under the WPR palette. (CARTO's free basemaps began watermarking
    // "API KEY REQUIRED" across every tile in mid-2026.) Native tiles stop at
    // zoom 16, so the map must not zoom past what exists. The matching
    // reference layer carries the place names — a map with no "Wausau" on it
    // asked readers to recall where they live.
    const tiles = {
      attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
      maxZoom: 16,
    };
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      tiles,
    ).addTo(map.current);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16 },
    ).addTo(map.current);
    // The state's own outline under the pins, so the census reads as a map
    // *of Wisconsin* and not pins adrift on a grey canvas. U.S. Census Bureau
    // 2010 cartographic boundary file (1:5,000,000, public domain), simplified
    // to 0.003° and bundled as web/src/wisconsin.json — no fetch, no failure path.
    L.geoJSON(wisconsin as GeoJSON.Feature, {
      interactive: false,
      style: {
        color: "#3a867c",
        weight: 1.5,
        opacity: 0.85,
        fillColor: "#3a867c",
        fillOpacity: 0.04,
      },
    }).addTo(map.current);
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
        path.bindTooltip(label, { sticky: true, className: "county-tip", direction: "top", offset: [0, -8] });
        path.on("mouseover", () => {
          if (activeCounty.current !== name) path.setStyle(COUNTY_HOVER);
        });
        path.on("mouseout", () => {
          path.setStyle(activeCounty.current === name ? COUNTY_ACTIVE : COUNTY_STYLE);
        });
        path.on("click", () => {
          path.closeTooltip();
          // A county with no creameries has nothing to filter to; the tooltip
          // has already said so.
          if (!countyTotals.current.get(name)) return;
          pickCounty.current(name);
        });
      },
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    // The reader's own hand on the map, as opposed to our fits and pans: a
    // drag, a pinch, the zoom buttons. `programmatic` covers our own moves
    // until they end.
    map.current.on("dragstart", () => {
      touched.current = true;
    });
    map.current.on("zoomstart", () => {
      if (!programmatic.current) touched.current = true;
    });
    // "Wisconsin": the way back to the statewide frame, under the zoom
    // buttons — the zoom control alone offers no return once a search or a
    // cluster tap has flown the map to one town.
    const Reset = L.Control.extend({
      onAdd: () => {
        const bar = L.DomUtil.create("div", "leaflet-bar map-reset");
        const button = L.DomUtil.create("button", "", bar) as HTMLButtonElement;
        button.type = "button";
        button.textContent = "Wisconsin";
        button.title = "Show all of Wisconsin";
        button.setAttribute("aria-label", "Show all of Wisconsin");
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(button, "click", frame);
        return bar;
      },
    });
    new Reset({ position: "topleft" }).addTo(map.current);
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
      })
        .bindTooltip(
          tooltips.get(creamery.id) ?? `${creamery.name} — ${creamery.city}`,
          { direction: "top", offset: [0, -10], opacity: 1, className: "map-card-tip" },
        )
        .on("click", () => {
          const m = map.current;
          if (!m) return;
          // A tap opens the hover card too (touch fakes a mouseover) and nothing
          // ever closes it; the tap has answered, so the card goes.
          if (COARSE) marker.closeTooltip();
          const pin = marker.getLatLng();
          const at = m.latLngToContainerPoint(pin);
          const under = [...markers.current.entries()]
            .filter(
              ([, other]) =>
                at.distanceTo(m.latLngToContainerPoint(other.getLatLng())) <= CHOOSER_RADIUS,
            )
            .map(([id]) => id);
          if (under.length <= 1) {
            select.current(creamery.id);
            return;
          }
          // At the overview the Fox Valley is seven pins under one thumb but
          // seven towns on the ground. One move, to the zoom where the tapped
          // pins part the most (within a few steps), with a label saying why
          // the map moved; the chooser is for pins that share an address and
          // never part.
          const base = Math.ceil(m.getZoom());
          const crowd = (z: number) =>
            under.filter(
              (id) =>
                m.project(pin, z).distanceTo(m.project(markers.current.get(id)!.getLatLng(), z)) <=
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
          // Worth a move only when it clears the tap or at least halves the
          // crowd; splitting three pins into two is a chooser's job, not a
          // second silent zoom.
          if (target > base && (fewest <= 1 || fewest * 2 <= under.length)) {
            flash(`${under.length} creameries here — zooming in`);
            move(() => m.setView(pin, target, { animate: MOTION }));
            return;
          }
          openChooser(pin, under);
        });
      marker.addTo(layer.current!);
      markers.current.set(creamery.id, marker);
    }
    // Refit as filters narrow the set, but never yank the map while the reader is
    // looking at a particular creamery — remember to, for when the panel closes.
    if (!selection.current) frame();
    else pendingFrame.current = true;
  }, [creameries, tooltips, awards]);

  // The county in force reads as the one filled shape; the rest stay lines.
  useEffect(() => {
    countyLayer.current?.eachLayer((shape) => {
      const path = shape as L.Path & { feature?: GeoJSON.Feature };
      const name = String(path.feature?.properties?.name ?? "");
      path.setStyle(name === county && county ? COUNTY_ACTIVE : COUNTY_STYLE);
    });
  }, [county]);

  // Re-style the selected pin and bring it into view.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.setIcon(icon(id, id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    }
    if (!selectedId) {
      // Closing the panel: if the list changed underneath it (a search cleared
      // while a creamery was open) the map still shows the old answer, so
      // refit — unless the reader moved the map by hand, which is theirs to
      // keep. A centre that left the state is always re-framed.
      if (!map.current) return;
      if (!WISCONSIN.contains(map.current.getCenter()) || (pendingFrame.current && !touched.current)) {
        frame();
      }
      pendingFrame.current = false;
    } else if (map.current) {
      closeChooser();
      const marker = markers.current.get(selectedId);
      if (marker) {
        // Selecting a creamery opens the detail panel over the right of the map, so
        // a plain panTo would park the pin underneath it. Shift the centre by half
        // the panel width to land the pin in the strip that stays visible — unless
        // the panel covers nearly everything, as it does on a narrow screen.
        const width = map.current.getSize().x;
        const panel = Math.min(DETAIL_WIDTH, width);
        const zoom = map.current.getZoom();
        const centre =
          width - panel >= MIN_VISIBLE_MAP
            ? map.current.unproject(
                map.current.project(marker.getLatLng(), zoom).add([panel / 2, 0]),
                zoom,
              )
            : marker.getLatLng();
        move(() => map.current!.panTo(centre, { animate: MOTION }));
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
  }, [here]);

  /** The first tap on an embedded phone map arms dragging (this tap itself
   *  still lands on whatever it touched — a pin opens as usual). */
  function arm() {
    if (armed || !map.current) return;
    map.current.dragging.enable();
    setArmed(true);
  }

  return (
    <div
      className="map-wrap"
      role="region"
      aria-label="Map of Wisconsin creameries"
      onPointerDown={arm}
    >
      <p className="sr-only">
        Pins are not keyboard stops; the list beside the map has every creamery.
      </p>
      <div className="map" ref={host} />
      {!armed && (
        <p className="map-hint" aria-hidden="true">
          Tap the map to move it
        </p>
      )}
      {/* Why the map just moved on its own: "13 creameries here — zooming in".
          Always mounted (a live region announces changes, not arrivals);
          styles.css hides it while empty. */}
      <p className="map-hint map-zoom-hint" role="status">
        {hint}
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
