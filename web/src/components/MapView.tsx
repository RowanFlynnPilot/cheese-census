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
}

export default function MapView({ creameries, selectedId, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const select = useRef(onSelect);
  select.current = onSelect;
  const selection = useRef(selectedId);
  selection.current = selectedId;

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
      scrollWheelZoom: false, // an embedded iframe must not hijack page scroll
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 18,
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Redraw pins whenever the filtered set changes.
  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    for (const creamery of creameries) {
      if (creamery.lat === null || creamery.lng === null) continue;
      const marker = L.marker([creamery.lat, creamery.lng], {
        title: creamery.name,
        icon: L.divIcon({
          className: "",
          html: `<div class="marker" style="width:12px;height:12px"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      })
        .bindTooltip(`${creamery.name} — ${creamery.city}`, { direction: "top" })
        .on("click", () => select.current(creamery.id));
      marker.addTo(layer.current!);
      markers.current.set(creamery.id, marker);
    }
    // Refit as filters narrow the set, but never yank the map while the reader is
    // looking at a particular creamery.
    if (!selection.current) frame();
  }, [creameries]);

  // Re-style the selected pin and bring it into view.
  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const size = id === selectedId ? 18 : 12;
      marker.setIcon(
        L.divIcon({
          className: "",
          html: `<div class="marker${id === selectedId ? " is-selected" : ""}" style="width:${size}px;height:${size}px"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      );
      if (id === selectedId) marker.setZIndexOffset(1000);
      else marker.setZIndexOffset(0);
    }
    if (!selectedId) {
      // Closing the panel after viewing an out-of-state company would otherwise
      // leave the reader looking at New Jersey.
      frame();
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
