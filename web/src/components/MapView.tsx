import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Creamery } from "../types";

// Wisconsin, comfortably framed.
const CENTER: L.LatLngTuple = [44.6, -89.8];
const ZOOM = 7;

// A handful of DFW-listed companies sit in New Jersey, South Carolina and Texas.
// They get pins and pan normally when selected, but they must not drag the
// overview framing out of the state.
const WISCONSIN = L.latLngBounds([42.3, -93.1], [47.4, -86.1]);

// Keep in step with `.detail { width: min(420px, 100%) }` in styles.css.
const DETAIL_WIDTH = 420;
const MIN_VISIBLE_MAP = 140;

interface Props {
  creameries: Creamery[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Prepared, escaped HTML hover cards, keyed by creamery id (built in App). */
  tooltips: Map<string, string>;
}

export default function MapView({ creameries, selectedId, onSelect, tooltips }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const storeIds = useRef<Set<string>>(new Set());
  const select = useRef(onSelect);
  select.current = onSelect;
  const selection = useRef(selectedId);
  selection.current = selectedId;

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
      html: `<div class="${classes.join(" ")}" style="width:${size}px;height:${size}px"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
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

  useEffect(() => {
    if (!host.current || map.current) return;
    map.current = L.map(host.current, {
      center: CENTER,
      zoom: ZOOM,
      maxZoom: 16, // the basemap's native ceiling — past it lies grey void
      scrollWheelZoom: false, // an embedded iframe must not hijack page scroll
      // fitBounds snaps to whole zoom levels by default, and Wisconsin misses
      // fitting at 7 by a hair — so the overview collapsed to a whole-Midwest 6.
      // Half-steps let the fit land where the state actually is.
      zoomSnap: 0.5,
    });
    // Esri's Light Gray canvas: keyless, CDN-fast, and muted enough to sit
    // under the WPR palette. (CARTO's free basemaps began watermarking
    // "API KEY REQUIRED" across every tile in mid-2026.) Native tiles stop at
    // zoom 16, so the map must not zoom past what exists.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
        maxZoom: 16,
      },
    ).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
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
    storeIds.current = new Set(
      creameries.filter((c) => c.retail.store).map((c) => c.id),
    );
    for (const creamery of creameries) {
      if (creamery.lat === null || creamery.lng === null) continue;
      const marker = L.marker([creamery.lat, creamery.lng], {
        title: creamery.name,
        icon: icon(creamery.id, creamery.id === selection.current),
      })
        .bindTooltip(
          tooltips.get(creamery.id) ?? `${creamery.name} — ${creamery.city}`,
          { direction: "top", offset: [0, -10], opacity: 1, className: "map-card-tip" },
        )
        .on("click", () => select.current(creamery.id));
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
        map.current.panTo(centre, { animate: true });
      }
    }
  }, [selectedId]);

  return <div className="map" ref={host} role="application" aria-label="Map of Wisconsin creameries" />;
}
