"""Product-image URL harvester (curation tool, never in build).

Revisits the shops behind queue/products_research.json and pairs the titles
harvested there with product image URLs. Output is queue/product_images.json —
a REVIEW AND PERMISSION queue, not pipeline input: nothing in build/ references
these URLs, and Cheese.image stays null until a creamery grants use and the
photo is ingested through data/overrides/. The web dev server can overlay the
queue as an explicitly-marked internal draft (see web/scripts/sync-data.mjs
--draft); production builds scrub it.

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


def shopify(origin: str) -> dict[str, str]:
    found: dict[str, str] = {}
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
                found.setdefault(_fold(clean_title(product["title"])), src)
        if len(products) < 250:
            break
    return found


def woocommerce(origin: str) -> dict[str, str]:
    found: dict[str, str] = {}
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
                found.setdefault(_fold(clean_title(product["name"])), src)
        if len(data) < 100:
            break
    return found


def squarespace(page_url: str) -> dict[str, str]:
    sep = "&" if "?" in page_url else "?"
    data = probe_json(f"{page_url}{sep}format=json")
    if not isinstance(data, dict):
        return {}
    found: dict[str, str] = {}
    for item in data.get("items", []):
        title, asset = item.get("title"), item.get("assetUrl")
        if title and asset:
            found[_fold(clean_title(title))] = asset
    return found


def _img_src(img, base: str) -> str | None:
    src = img.get("data-src") or img.get("data-original") or img.get("src")
    if not src and img.get("srcset"):
        src = img["srcset"].split(",")[0].split()[0]
    if not src or src.startswith("data:"):
        return None
    absolute = urljoin(base, src)
    return None if NOISE.search(absolute) else absolute


def page_scan(start_url: str, wanted: set[str]) -> dict[str, str]:
    """Match <img alt> (and enclosing-link titles) on the listing page and one
    hop of same-host category/collection/product-list links against the titles
    we know this shop sells."""
    found: dict[str, str] = {}
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
                    found[key] = src
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
        for title_key, src in sorted(images.items()):
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
            rank = (0 if exact else 1, len(title_key), src)
            if match["id"] not in best or rank < best[match["id"]][:3]:
                best[match["id"]] = (*rank, title_key, src)
        for cheese_id in sorted(best):
            _, _, src, title_key, _ = best[cheese_id]
            rows.append(
                {
                    "cheese_id": cheese_id,
                    "image": src,
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
