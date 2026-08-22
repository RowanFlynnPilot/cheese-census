"""Creamery logo harvester (curation tool, never in build).

Visits each exported creamery's own website and picks one square-ish brand
mark for the UI: apple-touch-icon first (consistently square, usually 180px),
then the largest sized favicon, then a header/nav <img> whose attributes say
"logo". Every pick is probe-verified before it is kept.

Output is queue/creamery_logos.json, served to the web app only through the
dev-only draft overlay (sync-data.mjs --draft). Logos identify the company —
nominative use, ordinary in editorial directories — but they are still brand
artwork, so they stay in the draft overlay until the attorney blesses the
pattern in the standing pre-launch review. Nothing in build/ references them.

Shares images.py's polite probe: hits AND misses cache in .cache/, so re-runs
are free; delete .cache/ to re-probe live.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))

from images import ROOT, probe  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")


def _size_of(link) -> int:
    """Largest edge in a sizes attribute ("180x180", "any" → big)."""
    sizes = (link.get("sizes") or "").lower()
    if sizes == "any":
        return 512
    best = 0
    for m in re.finditer(r"(\d+)x(\d+)", sizes):
        best = max(best, int(m.group(1)), int(m.group(2)))
    return best


def pick_logo(soup: BeautifulSoup, base: str) -> tuple[str, str] | None:
    """→ (absolute url, via) or None. Order: apple-touch-icon, sized favicon
    (≥64px), a header/nav image that calls itself a logo, any favicon."""
    apple = [
        (link, _size_of(link))
        for link in soup.find_all("link", rel=True)
        if "apple-touch-icon" in " ".join(link.get("rel"))and link.get("href")
    ]
    if apple:
        link = max(apple, key=lambda pair: pair[1])[0]
        return urljoin(base, link["href"]), "apple-touch-icon"

    icons = [
        (link, _size_of(link))
        for link in soup.find_all("link", rel=True)
        if "icon" in " ".join(link.get("rel")) and link.get("href")
    ]
    sized = [pair for pair in icons if pair[1] >= 64]
    if sized:
        link = max(sized, key=lambda pair: pair[1])[0]
        return urljoin(base, link["href"]), "favicon"

    for img in soup.find_all("img"):
        blob = " ".join(
            [
                img.get("src") or "",
                " ".join(img.get("class") or []),
                img.get("id") or "",
                img.get("alt") or "",
            ]
        ).lower()
        if "logo" in blob and "sprite" not in blob:
            src = img.get("data-src") or img.get("src")
            if src and not src.startswith("data:"):
                return urljoin(base, src), "header-img"

    if icons:
        link = max(icons, key=lambda pair: pair[1])[0]
        return urljoin(base, link["href"]), "favicon-small"
    return None


def main() -> None:
    creameries = json.loads(
        (ROOT / "build" / "creameries.json").read_text(encoding="utf-8")
    )
    rows: list[dict] = []
    tried = 0
    for creamery in sorted(creameries, key=lambda c: c["id"]):
        site = creamery.get("website")
        if not site:
            continue
        site = site.split()[0]
        # A social-page "website" would yield the platform's icon, not a brand.
        host = urlsplit(site).netloc.lower()
        if any(p in host for p in ("facebook.", "instagram.", "linktr.ee")):
            print(f"  social page, skipped: {creamery['id']} ({host})")
            continue
        tried += 1
        body = probe(site)
        if body is None:
            print(f"  unreachable: {creamery['id']} ({site})")
            continue
        try:
            soup = BeautifulSoup(body, "html.parser")
        except Exception:
            print(f"  unparseable: {creamery['id']} ({site})")
            continue
        picked = pick_logo(soup, site)
        if picked is None:
            print(f"  no mark: {creamery['id']} ({site})")
            continue
        url, via = picked
        mark_host = urlsplit(url).netloc.lower()
        if any(p in mark_host for p in ("fbcdn.", "facebook.")):
            # The site redirected to a social page; that's the platform's icon.
            print(f"  platform icon, skipped: {creamery['id']} ({mark_host})")
            continue
        if probe(url) is None:
            print(f"  dead mark: {creamery['id']} ({url[:80]})")
            continue
        rows.append(
            {"creamery_id": creamery["id"], "logo": url, "source_page": site, "via": via}
        )
        host = urlsplit(url).netloc
        print(f"  {via}: {creamery['id']} ({host})")

    out = ROOT / "queue" / "creamery_logos.json"
    out.write_text(
        json.dumps(sorted(rows, key=lambda r: r["creamery_id"]), indent=2,
                   sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"logos: {len(rows)} of {tried} creameries with websites -> "
        f"{out.relative_to(ROOT)}"
    )
    print("REMINDER: draft overlay only until the attorney blesses the pattern.")


if __name__ == "__main__":
    main()
