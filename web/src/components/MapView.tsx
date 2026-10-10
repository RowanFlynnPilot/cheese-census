import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Creamery } from "../types";
import wisconsin from "../wisconsin.json";

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
const HIT = COARSE ? 40 : 28;
// Reduced motion covers Leaflet's own zoom, fade and pan animations too.
const MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Inside an article (the WordPress iframe) on a phone, a one-finger swipe on
// the map must scroll the article, not pan the map — a full-height map pane
// would otherwise trap the page. So the map starts un-draggable there and arms
// on the reader's first tap; pinch-zoom works throughout. Standalone, the page
// has nothing else to scroll, so dragging is on from the start.
const COOPERATIVE = COARSE && window.self !== window.top;

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Props {
  creameries: Creamery[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Prepared, escaped HTML hover cards, keyed by creamery id (built in App). */
  tooltips: Map<string, string>;
  /** The reader's own position, once they asked for it; never stored. */
  here: { lat: number; lng: number } | null;
}

export default function MapView({ creameries, selectedId, onSelect, tooltips, here }: Props) {
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
  const [armed, setArmed] = useState(!COOPERATIVE);

  /** One source of truth for pin appearance: retail stores read as a donut,
   *  the selected creamery as a larger gold pin. Classes live in styles.css
   *  next to the legend that explains them. */
  function icon(id: string, selected: boolean): L.DivIcon {
    const size = selected ? 18 : 12;
    const classes = ["marker"];
    if (storeIds.current.has(id)) classes.push("has-store");
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
    if (!map.current) return;
    const inState = [...markers.current.values()]
      .map((m) => m.getLatLng())
      .filter((p) => WISCONSIN.contains(p));
    if (inState.length > 1) {
      map.current.fitBounds(L.latLngBounds(inState), { padding: [32, 32], maxZoom: 11 });
    } else if (inState.length === 1) {
      map.current.setView(inState[0], 10);
    } else {
      map.current.setView(CENTER, ZOOM);
    }
  }

  /** A tap that lands on more than one pin's hit box opens a chooser instead
   *  of whichever pin happened to be on top — at the overview the south-east
   *  cluster is a dozen creameries under one thumb. */
  function openChooser(at: L.LatLng, ids: string[]) {
    if (!map.current) return;
    const rows = ids
      .map((id) => byId.current.get(id))
      .filter((c): c is Creamery => Boolean(c))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (c) =>
          `<li><button type="button" data-id="${esc(c.id)}">${esc(c.name)}<span>${esc(c.city)}${
            c.county ? ` · ${esc(c.county)} Co.` : ""
          }</span></button></li>`,
      )
      .join("");
    L.popup({ className: "pin-chooser", offset: [0, -6], maxWidth: 300, autoPanPadding: [24, 24] })
      .setLatLng(at)
      .setContent(`<p class="pc-head">${ids.length} creameries here — pick one</p><ul>${rows}</ul>`)
      .openOn(map.current);
  }

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
    layer.current = L.layerGroup().addTo(map.current);
    // The chooser's buttons: one delegated listener, bound when a popup opens.
    map.current.on("popupopen", (e: L.PopupEvent) => {
      const el = e.popup.getElement();
      if (!el) return;
      el.addEventListener("click", (ev) => {
        const button = (ev.target as Element).closest<HTMLElement>("button[data-id]");
        if (!button?.dataset.id) return;
        map.current?.closePopup();
        select.current(button.dataset.id);
      });
      el.querySelector<HTMLElement>("button[data-id]")?.focus({ preventScroll: true });
    });
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
          const at = m.latLngToContainerPoint(marker.getLatLng());
          const under = [...markers.current.entries()]
            .filter(([, other]) => at.distanceTo(m.latLngToContainerPoint(other.getLatLng())) <= HIT * 0.8)
            .map(([id]) => id);
          if (under.length > 1) openChooser(marker.getLatLng(), under);
          else select.current(creamery.id);
        });
      marker.addTo(layer.current!);
      markers.current.set(creamery.id, marker);
    }
    // Refit as filters narrow the set, but never yank the map while the reader is
    // looking at a particular creamery.
    if (!selection.current) frame();
  }, [creameries, tooltips]);

  // Re-style the selected pin and bring it into view.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      marker.setIcon(icon(id, id === selectedId));
      marker.setZIndexOffset(id === selectedId ? 1000 : 0);
    }
    if (!selectedId) {
      // Closing the panel after viewing an out-of-state company would leave the
      // reader looking at New Jersey — re-frame then. Anywhere in-state, keep
      // the reader's own pan and zoom: closing a pin they walked to should not
      // yank the map back to the statewide overview.
      if (map.current && !WISCONSIN.contains(map.current.getCenter())) frame();
    } else if (map.current) {
      map.current.closePopup();
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
        map.current.panTo(centre, { animate: MOTION });
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
    map.current.setView([here.lat, here.lng], Math.max(map.current.getZoom(), 9), { animate: MOTION });
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
    </div>
  );
}
