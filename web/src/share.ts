/** One way to hand a link on. A phone's own share sheet (Messages, WhatsApp,
 *  Mail — how readers already pass things along) where there is one and the
 *  pointer is a finger; the clipboard everywhere else. The result says what
 *  happened so the button can say so too. */
export type ShareResult = "shared" | "dismissed" | "copied" | "failed";

/** Where a shared link should land. Standalone that is this page; once the
 *  census is embedded, VITE_SHARE_BASE names the article that embeds it (the
 *  WordPress page forwards its own ?query and #hash into the iframe src), so a
 *  shared cheese or board opens inside the paper, not the bare inner frame. */
const SHARE_BASE = (import.meta.env.VITE_SHARE_BASE as string | undefined) || "";

/** The current record or view as a link readers can pass on. */
export function shareBase(): string {
  return SHARE_BASE || `${location.origin}${location.pathname}`;
}

export function currentShareUrl(): string {
  return `${shareBase()}${location.search}${location.hash}`;
}

/** True on a touch device whose browser offers the native share sheet. A
 *  desktop Chrome has navigator.share too, but there "Copy link" is what
 *  people expect of a small button in a toolbar. */
export function hasShareSheet(): boolean {
  return (
    typeof navigator.share === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export async function shareLink(url: string, title: string): Promise<ShareResult> {
  if (hasShareSheet()) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      // The reader closed the sheet — nothing happened, nothing to report.
      if (e instanceof DOMException && e.name === "AbortError") return "dismissed";
      // Anything else (a sheet the browser refused): fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    // Clipboard unavailable (permissions, insecure context).
    return "failed";
  }
}
