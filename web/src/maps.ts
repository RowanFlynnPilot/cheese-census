import type { Creamery } from "./types";

/** The address is something to go to, not only to read: a maps search that
 *  opens the phone's maps app (or the web) with the plant's street address.
 *  One shape for the panel's "Open in Maps" and the map's hand-off at its
 *  zoom cap, so the two never disagree about where a creamery is. */
export function mapsHref(creamery: Pick<Creamery, "address" | "city"> | undefined): string | null {
  if (!creamery?.address) return null;
  const query = `${creamery.address}, ${creamery.city}, WI`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
