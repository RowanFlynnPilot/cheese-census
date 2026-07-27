"""Shared HTTP for scrapers: one polite, throttled, fail-loud fetcher.

Every scraper goes through fetch(). It identifies with a real User-Agent,
enforces a minimum delay between requests to the same host, and dies with a
named error on any non-200 response — never a partial or silent result.

Development cache
    Set CHEESE_CENSUS_CACHE=1 to serve responses from .cache/ (gitignored)
    instead of the network. Responses are always written to the cache; they
    are only read back when that variable is set. CI leaves it unset, so an
    automated run always talks to the live source.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

import requests

# Every scraper imports this module. Scraper output carries source text verbatim
# (BUTTERKÄSE, GRAN CANARIA®) and dev is a Windows console whose default code page
# cannot encode it — without this, printing a parsed value raises UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"

USER_AGENT = (
    "CheeseCensusBot/1.0 (The Cheese Census, Wausau Pilot & Review; "
    "+https://github.com/RowanFlynnPilot/cheese-census)"
)
MIN_INTERVAL_SECONDS = 1.0
TIMEOUT_SECONDS = 60

_last_request_at: dict[str, float] = {}


def fatal(scraper: str, message: str) -> None:
    """Named, non-zero exit. Scrapers never warn and never emit partial output."""
    sys.exit(f"SCRAPER FAILED ({scraper}): {message}")


def _cache_path(url: str) -> Path:
    return CACHE / f"{hashlib.sha256(url.encode('utf-8')).hexdigest()[:16]}.bin"


def fetch(url: str, *, scraper: str) -> bytes:
    """GET url politely, returning the raw body. Fatal on anything but HTTP 200."""
    cached = _cache_path(url)
    if os.environ.get("CHEESE_CENSUS_CACHE") == "1" and cached.exists():
        return cached.read_bytes()

    host = urlsplit(url).netloc
    since_last = time.monotonic() - _last_request_at.get(host, float("-inf"))
    if since_last < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - since_last)

    try:
        response = requests.get(
            url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT_SECONDS
        )
    except requests.RequestException as error:
        fatal(scraper, f"GET {url} failed: {error}")
    finally:
        _last_request_at[host] = time.monotonic()

    if response.status_code != 200:
        fatal(scraper, f"GET {url} returned HTTP {response.status_code}")

    CACHE.mkdir(exist_ok=True)
    cached.write_bytes(response.content)
    return response.content


def fetch_text(url: str, *, scraper: str, encoding: str = "utf-8") -> str:
    return fetch(url, scraper=scraper).decode(encoding)


def write_json(path: Path, payload) -> None:
    """One output format across every scraper: stable, diffable, newline-terminated.

    newline="\\n" is not cosmetic — without it Python rewrites every \\n as \\r\\n on
    Windows, so the same inputs would produce different bytes on a dev machine and in
    CI, which is exactly what the deterministic-output rule forbids.
    """
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def collapse(value: str) -> str:
    """Collapse all whitespace runs (including the CRLFs DATCP embeds in cells)."""
    return " ".join(value.split())
