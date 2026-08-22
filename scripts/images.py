"""Product-image URL harvester (curation tool, never in build).

Revisits the shops behind queue/products_research.json and pairs the titles
harvested there with product image URLs and the maker's own short description.
Output is queue/product_images.json — a review queue, not pipeline input.
The two payloads carry different rules: PHOTOS are permission-gated (nothing
in build/ references them; Cheese.image stays null until a creamery grants use
and the photo is ingested through data/overrides/), while the DESCRIPTIONS
render as short quoted, attributed excerpts — ordinary quotation. The web dev
server overlays the queue as an explicitly-marked internal draft (see
web/scripts/sync-data.mjs --draft); production builds scrub it.

Sources are tried per shop, cheapest first:
  shopify      {origin}/products.json — the platform's public catalog feed
  woocommerce  {origin}/wp-json/wc/store/v1/products — same idea, WordPress
  squarespace  {page}?format=json — Squarespace's per-page item listing
  page         the recorded listing page(s), <img alt> matched against the
               harvested titles (one hop into same-host category/collection
               links, bounded)

Unlike scrapers, this probes: a 404 on a platform endpoint is an answer, not an
error, so it uses its own tolerant GET with scrapers/_fetch.py's UA and
throttle but its own cache semantics — hits AND misses persist in .cache/ and
are always read back, so iterating on the matcher costs zero requests. Delete
.cache/ to re-probe live. A shop that yields nothing is reported, never fatal.

Matching titles to catalog records mirrors the award rule: exact folded-name
match first, else the longest record name word-contained in the title — never
reverse containment ("Aged Gouda" must not claim a "Smoked Aged Gouda" photo).
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from catalog import _fold, clean_title  # noqa: E402
from scrapers._fetch import CACHE, USER_AGENT, _cache_path  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

MIN_INTERVAL_SECONDS = 1.0
TIMEOUT_SECONDS = 30
PAGE_BUDGET = 12  # fallback crawl: listing page + at most this many category hops

# Obvious non-product imagery, matched against the URL path.
NOISE = re.compile(r"\.(svg|gif)(\?|$)|logo|icon|sprite|favicon|badge|payment", re.I)

_last_request_at: dict[str, float] = {}


def probe(url: str) -> bytes | None:
    """Polite GET returning None on any failure — probing endpoints is the job."""
    cached = _cache_path(url)
    if cached.exists():
        body = cached.read_bytes()
        return None if body == b"" else body
    host = urlsplit(url).netloc
    since = time.monotonic() - _last_request_at.get(host, float("-inf"))
    if since < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - since)
    try:
        response = requests.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_SECONDS
        )
    except requests.RequestException:
        _last_request_at[host] = time.monotonic()
        return None
    _last_request_at[host] = time.monotonic()
    CACHE.mkdir(exist_ok=True)
    # Misses are cached as empty bodies so a re-run does not re-probe them.
    cached.write_bytes(response.content if response.status_code == 200 else b"")
    return response.content if response.status_code == 200 else None


def probe_json(url: str):
    body = probe(url)
    if body is None:
        return None
    try:
        return json.loads(body)
    except ValueError:
        return None


def _summary(markup: str | None) -> str | None:
    """First sentence(s) of the shop's own description, plain-texted and kept
    under ~180 chars. Unlike the photos, these render as QUOTES — quoted,
    attributed to the maker — which is ordinary quotation, not reproduction;
    no per-creamery permission, though the pattern goes past the attorney with
    the rest of the pre-launch review."""
    if not markup:
        return None
    text = " ".join(BeautifulSoup(markup, "html.parser").get_text(" ").split())
    if len(text) < 15:
        return None
    picked = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        candidate = f"{picked} {sentence}".strip()
        if picked and len(candidate) > 180:
            break
        picked = candidate
        if len(picked) > 180:
            break
    if len(picked) > 200:
        picked = picked[:197].rstrip() + "…"
    return picked or None


def shopify(origin: str) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for page in range(1, 6):
        data = probe_json(f"{origin}/products.json?limit=250&page={page}")
        if not isinstance(data, dict) or not isinstance(data.get("products"), list):
            break
        products = data["products"]
        if not products:
            break
        for product in products:
            images = product.get("images") or []
            src = images[0].get("src") if images else None
            if product.get("title") and src:
                found.setdefault(
                    _fold(clean_title(product["title"])),
                    {"image": src, "summary": _summary(product.get("body_html"))},
                )
        if len(products) < 250:
            break
    return found


def woocommerce(origin: str) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for page in range(1, 6):
        data = probe_json(
            f"{origin}/wp-json/wc/store/v1/products?per_page=100&page={page}"
        )
        if not isinstance(data, list) or not data:
            break
        for product in data:
            images = product.get("images") or []
            src = images[0].get("src") if images else None
            if product.get("name") and src:
                found.setdefault(
                    _fold(clean_title(product["name"])),
                    {
                        "image": src,
                        "summary": _summary(
                            product.get("short_description") or product.get("description")
                        ),
                    },
                )
        if len(data) < 100:
            break
    return found


def squarespace(page_url: str) -> dict[str, dict]:
    sep = "&" if "?" in page_url else "?"
    data = probe_json(f"{page_url}{sep}format=json")
    if not isinstance(data, dict):
        return {}
    found: dict[str, dict] = {}
    for item in data.get("items", []):
        title, asset = item.get("title"), item.get("assetUrl")
        if title and asset:
            found[_fold(clean_title(title))] = {
                "image": asset,
                "summary": _summary(item.get("excerpt") or item.get("body")),
            }
    return found


# Listing pages serve thumbnails. Known patterns, each swappable for the
# original: Wix's transform segment (w_75,h_75 placeholders — the source of
# genuinely blurry panels), a "_small"-style name suffix, and WordPress-style
# -WxH suffixes when the dimensions are actually small.
WIX_TRANSFORM = re.compile(r"^(https?://static\.wixstatic\.com/media/[^/]+)/v1/.*$")
NAMED_SMALL = re.compile(
    r"_(?:small|thumb|thumbnail|compact|icon)(?=\.(?:jpe?g|png|webp)(?:\?|$))", re.I
)
SIZE_SUFFIX = re.compile(
    r"[-_](\d{2,4})x(\d{2,4})(?=\.(?:jpe?g|png|webp)(?:\?|$))", re.I
)


def _upgrade(url: str) -> str:
    """Swap a thumbnail URL for its original — but keep the swap only if the
    original really exists (one cached probe), else the thumbnail stands."""
    candidate = WIX_TRANSFORM.sub(r"\1", url)
    if candidate == url:
        candidate = NAMED_SMALL.sub("", url)
    if candidate == url:
        m = SIZE_SUFFIX.search(url)
        if m and max(int(m.group(1)), int(m.group(2))) < 400:
            candidate = SIZE_SUFFIX.sub("", url)
    if candidate != url and probe(candidate) is not None:
        return candidate
    return url


def _largest_srcset(value: str) -> str | None:
    """A srcset's FIRST candidate is usually its smallest — take the widest."""
    best_url, best_w = None, -1
    for part in value.split(","):
        bits = part.strip().split()
        if not bits:
            continue
        width = 0
        if len(bits) > 1 and bits[1].endswith("w"):
            try:
                width = int(bits[1][:-1])
            except ValueError:
                width = 0
        if width > best_w:
            best_w, best_url = width, bits[0]
    return best_url


def _img_src(img, base: str) -> str | None:
    src = img.get("data-src") or img.get("data-original") or img.get("src")
    srcset = img.get("data-srcset") or img.get("srcset")
    if not src and srcset:
        src = _largest_srcset(srcset)
    if not src or src.startswith("data:"):
        return None
    absolute = urljoin(base, src)
    if NOISE.search(absolute):
        return None
    return _upgrade(absolute)


def page_scan(start_url: str, wanted: set[str]) -> dict[str, dict]:
    """Match <img alt> (and enclosing-link titles) on the listing page and one
    hop of same-host category/collection/product-list links against the titles
    we know this shop sells. Listing pages carry no per-product prose."""
    found: dict[str, dict] = {}
    seen: set[str] = set()
    queue = [start_url]
    host = urlsplit(start_url).netloc
    while queue and len(seen) < PAGE_BUDGET:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        body = probe(url)
        if body is None:
            continue
        soup = BeautifulSoup(body, "html.parser")
        for img in soup.find_all("img"):
            label = img.get("alt") or ""
            anchor = img.find_parent("a")
            if not label.strip() and anchor is not None:
                label = anchor.get("title") or anchor.get_text(" ", strip=True)
            key = _fold(clean_title(label)) if label else ""
            if key and key in wanted and key not in found:
                src = _img_src(img, url)
                if src:
                    found[key] = {"image": src, "summary": None}
        if url == start_url and len(found) < len(wanted):
            for a in soup.find_all("a", href=True):
                href = urljoin(url, a["href"]).split("#")[0]
                if urlsplit(href).netloc != host or href in seen:
                    continue
                if re.search(r"/(categor|collection|shop|store|product)", href, re.I):
                    queue.append(href)
    return found


def main() -> None:
    research = json.loads(
        (ROOT / "queue" / "products_research.json").read_text(encoding="utf-8")
    )
    catalog = json.loads(
        (ROOT / "data" / "catalog" / "cheeses.json").read_text(encoding="utf-8")
    )
    by_creamery: dict[str, list[dict]] = {}
    for record in catalog:
        by_creamery.setdefault(record["creamery_id"], []).append(record)

    rows: list[dict] = []
    shops = harvested = 0
    for entry in sorted(research, key=lambda e: e["creamery_id"]):
        titles = entry.get("products") or []
        records = by_creamery.get(entry["creamery_id"], [])
        if not titles or not records:
            continue
        shops += 1
        # Some research rows carry a trailing note after the URL
        # ("…cheesestore.com (online-cheese-store categories)") — keep the URL.
        url = entry["url"].split()[0]
        origin = "{0.scheme}://{0.netloc}".format(urlsplit(url))
        wanted = {_fold(clean_title(t)) for t in titles}

        images = shopify(origin)
        via = "shopify"
        if not images:
            images, via = woocommerce(origin), "woocommerce"
        if not images:
            images, via = squarespace(url), "squarespace"
        if not images:
            images, via = page_scan(url, wanted), "page"
        if not images:
            print(f"  none: {entry['creamery_id']} ({origin})")
            continue
        harvested += 1

        # Award-rule matching: exact folded name, else the longest record name
        # word-contained in the shop title.
        names = sorted(
            ((_fold(record["name"]), record) for record in records),
            key=lambda pair: -len(pair[0]),
        )
        best: dict[str, tuple] = {}
        for title_key, media in sorted(images.items()):
            match, exact = None, False
            for name_key, record in names:
                if title_key == name_key:
                    match, exact = record, True
                    break
                if f" {name_key} " in f" {title_key} ":
                    match = record
                    break
            if match is None:
                continue
            rank = (0 if exact else 1, len(title_key), media["image"])
            if match["id"] not in best or rank < best[match["id"]][:3]:
                best[match["id"]] = (*rank, title_key, media)
        for cheese_id in sorted(best):
            _, _, _, title_key, media = best[cheese_id]
            rows.append(
                {
                    "cheese_id": cheese_id,
                    "image": media["image"],
                    "summary": media["summary"],
                    "matched_title": title_key,
                    "source_page": url,
                    "via": via,
                }
            )
        print(f"  {via}: {entry['creamery_id']} -> {len(best)} of {len(records)} records")

    out = ROOT / "queue" / "product_images.json"
    out.write_text(
        json.dumps(sorted(rows, key=lambda r: r["cheese_id"]), indent=2,
                   sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"images: {len(rows)} cheese records matched a product photo URL across "
        f"{harvested} of {shops} shops -> {out.relative_to(ROOT)}"
    )
    print("REMINDER: permission queue only — nothing here may ship until the "
          "creamery says yes.")


if __name__ == "__main__":
    main()
