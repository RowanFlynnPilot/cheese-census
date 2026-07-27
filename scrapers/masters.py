"""Wisconsin Master Cheesemaker directory scraper — the people layer.

Source
    Dairy Farmers of Wisconsin publishes an annual Master Cheesemaker Directory
    PDF on their blob storage. The landing page —
    wisconsincheese.com/our-cheese/our-makers/wisconsin-master-cheesemakers —
    links exactly one edition, so this scraper reads the link from the landing
    page rather than pinning a URL that goes stale every year. As of July 2026
    that link still resolves to the 2025 edition.

Layout (verified against the 2025 edition, July 2026)
    A 12-page landscape design PDF, not a table. Roster entries live on pages
    3-10 in two columns (left text starts x=195.8, right at x=807.8), eight
    entries per page, 63 in total. Fonts do the structural work:

        FranzSans-Heavy 18pt   person name, and the only reliable entry anchor
        FranzSans-Bold  12pt   company name — and, set ~228pt right of the
                               column edge, the certified varieties
        Clavo-Regular   12pt   street / city-state-zip
        Clavo-Bold      12pt   phone, website
        Clavo-SemiBold  12pt   sales contact line

    Certifications are separated from body text by a wide gutter: the furthest
    company-name word sits 150pt from the column edge, the nearest certification
    at 199pt. CERT_OFFSET splits them at 175pt, with ~25pt of clearance either
    side, and the parser additionally requires certifications to be upper-case.

    Page 11 is a plain list of ~51 masters who are retired, deceased, or no
    longer making the cheese they were certified for. Those names carry NO
    company and NO certifications, so they cannot form a Person record (which
    requires at least one of each) and are deliberately not emitted. If they
    are ever wanted, they need hand-curated companies in data/overrides/.

Output → data/raw/masters.json
    [
      {
        "source_key": "allen-jeff",         # REQUIRED; stable slug of the printed name
        "name": "JEFF ALLEN",               # verbatim, as printed (the PDF sets names in caps)
        "company": "BelGioioso Cheese, Inc.",   # verbatim, resolved to a creamery in the merge
        "address": "4200 Main Street", "city": "Green Bay",
        "state": "Wisconsin", "zip": "54311",
        "phone": "920-863-2123", "website": "www.belgioioso.com",
        "certifications": [{"type": "BLUE", "year": null}],
        "edition": 2025
      },
      ...
    ]

Rules
    - Certification types are emitted verbatim and feed data/vocab/tags.json →
      mc_certifications. The directory publishes no certification years, so
      `year` is always null — it is not guessed from the graduating-class page.
    - Parse with pdfplumber; fail loudly on layout drift.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import pdfplumber

from _fetch import CACHE, collapse, fatal, fetch, fetch_text, write_json

SCRAPER = "masters"
BASE = "https://www.wisconsincheese.com"
LANDING_URL = f"{BASE}/our-cheese/our-makers/wisconsin-master-cheesemakers"
DIRECTORY_LINK = re.compile(
    r"https?://[^\"'\s>]+master-cheesemaker-directory-(?P<year>\d{4})\.pdf", re.IGNORECASE
)
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "masters.json"

NAME_FONT = "FranzSans-Heavy"
BOLD_FONT = "FranzSans-Bold"
NAME_SIZE = 18
CERT_OFFSET = 175.0     # points right of a column's left edge; see module docstring
# Bold words are either company names (furthest observed: 150.5pt) or certifications
# (nearest observed: 199.5pt). Nothing bold may land between — if something does, the
# two columns have drifted together and the split is no longer trustworthy.
CERT_GAP_BAND = (155.0, 195.0)
LINE_TOLERANCE = 3.0    # points; words within this share a visual line
ENTRY_LEAD = 10.0       # a certification may sit slightly above its name's baseline

# Heavily certified masters get their varieties set in two side-by-side stacks, and a
# long variety wraps onto a second line. Both gaps are strongly bimodal across the 2025
# edition, so the splits are measured rather than guessed:
#   horizontal, within one label: <= 3.2pt      between stacks: >= 38.9pt
#   vertical,   wrapped label:    <= 14.4pt     next label:     >= 24.3pt
STACK_GAP = 20.0
WRAP_MAX = 19.0
AMBIGUOUS_VERTICAL = (15.0, 24.0)   # nothing may land here; if it does, the layout moved

# The comma after the city is not always typeset (e.g. "Two Rivers WI 54241"), and the
# 2025 edition carries at least one typo'd ZIP ("Fremont, Wisconsin 549406"). ZIPs are
# emitted exactly as printed — correcting a source typo is a job for data/overrides/.
CITY_STATE_ZIP = re.compile(
    r"^(?P<city>.+?),?\s+(?P<state>[A-Za-z]{2,}\.?)\s+(?P<zip>\d{5,6}(?:-\d{4})?)$"
)
BARE_ZIP = re.compile(r"^\d{5}$")
# Some entries print two numbers on one line ("920-867-2870 - 888-813-9720").
PHONE = re.compile(r"\d{3}-\d{3}-\d{4}")
WEBSITE = re.compile(r"^(?:www\.|https?://)", re.IGNORECASE)
RETIRED_HEADING = re.compile(r"Masters retired", re.IGNORECASE)

MIN_ENTRIES = 40


def _slug(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_value.lower())).strip("-")


def _lines(words: list[dict]) -> list[list[dict]]:
    """Group words into visual lines, each sorted left to right."""
    grouped: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if grouped and abs(word["top"] - grouped[-1][0]["top"]) <= LINE_TOLERANCE:
            grouped[-1].append(word)
        else:
            grouped.append([word])
    return [sorted(line, key=lambda w: w["x0"]) for line in grouped]


def _joined(line: list[dict]) -> str:
    return collapse(" ".join(word["text"] for word in line))


def _certifications(words: list[dict], *, name: str, page: int) -> list[str]:
    """Read the certification column: one or two vertical stacks of varieties,
    each variety occasionally wrapping onto a second line."""
    if not words:
        return []

    # Split every visual line into runs; a wide gap means a second stack, not a space.
    runs: list[list[dict]] = []
    for line in _lines(words):
        run = [line[0]]
        for previous, word in zip(line, line[1:]):
            if word["x0"] - previous["x1"] > STACK_GAP:
                runs.append(run)
                run = [word]
            else:
                run.append(word)
        runs.append(run)

    stacks: list[list[float]] = []
    for start in sorted({run[0]["x0"] for run in runs}):
        if stacks and start - stacks[-1][-1] <= STACK_GAP:
            stacks[-1].append(start)
        else:
            stacks.append([start])

    varieties: list[str] = []
    for stack in stacks:
        members = sorted((r for r in runs if r[0]["x0"] in stack), key=lambda r: r[0]["top"])
        group = [members[0]]
        for previous, run in zip(members, members[1:]):
            gap = run[0]["top"] - previous[0]["top"]
            low, high = AMBIGUOUS_VERTICAL
            if low < gap < high:
                fatal(
                    SCRAPER,
                    f"page {page}: entry '{name}' has a {gap:.1f}pt gap between certification "
                    f"lines — too wide to be a wrapped label, too narrow to be a new one. "
                    f"The directory's typesetting has changed.",
                )
            if gap <= WRAP_MAX:
                group.append(run)
            else:
                varieties.append(_join_runs(group))
                group = [run]
        varieties.append(_join_runs(group))

    for variety in varieties:
        if variety != variety.upper():
            fatal(
                SCRAPER,
                f"page {page}: entry '{name}' picked up non-upper-case text {variety!r} in the "
                f"certification column — CERT_OFFSET no longer separates the columns",
            )
    return varieties


def _join_runs(runs: list[list[dict]]) -> str:
    """Join a wrapped label. A trailing hyphen means the break was mid-word."""
    text = ""
    for run in runs:
        fragment = _joined(run)
        text = fragment if not text else (text + fragment if text.endswith("-") else f"{text} {fragment}")
    return text


def _parse_entry(name_line: list[dict], body: list[dict], certs: list[dict], *, page: int) -> dict:
    name = _joined(name_line)
    detail: list[str] = []
    for line in (_joined(line) for line in _lines(body)):
        if not line:
            continue
        # The design sometimes wraps the ZIP onto its own line; rejoin it.
        if BARE_ZIP.match(line) and detail:
            detail[-1] = f"{detail[-1]} {line}"
        else:
            detail.append(line)

    place = None
    place_index = None
    for index, line in enumerate(detail):
        match = CITY_STATE_ZIP.match(line)
        if match:
            place, place_index = match, index
            break
    if place is None:
        fatal(
            SCRAPER,
            f"page {page}: entry '{name}' has no 'City, State ZIP' line — "
            f"the directory layout has changed. Lines: {detail}",
        )

    company = detail[0] if place_index > 0 else None
    if not company:
        fatal(SCRAPER, f"page {page}: entry '{name}' has no company line")

    tail = detail[place_index + 1:]
    phone = next((m.group(0) for m in (PHONE.search(line) for line in tail) if m), None)
    website = next((line for line in tail if WEBSITE.match(line)), None)

    certifications = [
        {"type": variety, "year": None}
        for variety in _certifications(certs, name=name, page=page)
    ]

    return {
        "source_key": "",  # assigned by the caller once the whole roster is known
        "name": name,
        "company": company,
        "address": " ".join(detail[1:place_index]) or None,
        "city": place.group("city"),
        "state": place.group("state"),
        "zip": place.group("zip"),
        "phone": phone,
        "website": website,
        "certifications": certifications,
    }


def _parse_column(words: list[dict], *, page: int) -> list[dict]:
    names = [
        w for w in words
        if NAME_FONT in w["fontname"] and round(w["size"]) == NAME_SIZE
    ]
    if not names:
        return []

    column_left = min(w["x0"] for w in names)
    cert_x = column_left + CERT_OFFSET

    name_lines = _lines(names)
    anchors = [line[0]["top"] for line in name_lines]
    bounds = [(top - ENTRY_LEAD, next_top - ENTRY_LEAD)
              for top, next_top in zip(anchors, anchors[1:] + [float("inf")])]

    low, high = CERT_GAP_BAND
    for word in words:
        if BOLD_FONT in word["fontname"] and low <= word["x0"] - column_left < high:
            fatal(
                SCRAPER,
                f"page {page}: bold word {word['text']!r} sits {word['x0'] - column_left:.1f}pt "
                f"from the column edge, inside the gutter that separates company names from "
                f"certifications — the layout has changed",
            )

    def is_name(word: dict) -> bool:
        return NAME_FONT in word["fontname"] and round(word["size"]) == NAME_SIZE

    def is_cert(word: dict) -> bool:
        return BOLD_FONT in word["fontname"] and word["x0"] >= cert_x

    entries = []
    for name_line, (start, end) in zip(name_lines, bounds):
        span = [w for w in words if start <= w["top"] < end]
        body = [w for w in span if not is_name(w) and not is_cert(w)]
        certs = [w for w in span if is_cert(w)]
        entries.append(_parse_entry(name_line, body, certs, page=page))
    return entries


def parse(pdf_bytes_path: Path) -> tuple[list[dict], int]:
    """Returns (roster entries, count of names on the retired page)."""
    entries: list[dict] = []
    retired = 0
    with pdfplumber.open(pdf_bytes_path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            if RETIRED_HEADING.search(text):
                retired = len([
                    line for line in text.splitlines()[2:] if line.strip()
                ]) * 3
                continue
            words = page.extract_words(extra_attrs=["fontname", "size"])
            middle = page.width / 2
            for column in ([w for w in words if w["x0"] < middle],
                           [w for w in words if w["x0"] >= middle]):
                entries.extend(_parse_column(column, page=number))

    if len(entries) < MIN_ENTRIES:
        fatal(
            SCRAPER,
            f"parsed {len(entries)} master cheesemakers, expected at least {MIN_ENTRIES} — "
            f"the directory layout has changed",
        )
    return entries, retired


def main() -> None:
    landing = fetch_text(LANDING_URL, scraper=SCRAPER)
    links = {m.group(0): int(m.group("year")) for m in DIRECTORY_LINK.finditer(landing)}
    if len(links) != 1:
        fatal(
            SCRAPER,
            f"expected exactly one Master Cheesemaker directory PDF link on {LANDING_URL}, "
            f"found {len(links)}: {sorted(links)}",
        )
    url, edition = next(iter(links.items()))
    print(f"masters: {edition} edition -> {url}")

    CACHE.mkdir(exist_ok=True)
    local = CACHE / f"master-cheesemaker-directory-{edition}.pdf"
    local.write_bytes(fetch(url, scraper=SCRAPER))

    entries, retired = parse(local)
    for entry in entries:
        parts = entry["name"].split()
        entry["source_key"] = _slug(f"{parts[-1]} {' '.join(parts[:-1])}")
        entry["edition"] = edition

    duplicates = sorted(
        key for key in {e["source_key"] for e in entries}
        if [e["source_key"] for e in entries].count(key) > 1
    )
    if duplicates:
        fatal(SCRAPER, f"duplicate source_key(s) from printed names: {duplicates}")

    entries.sort(key=lambda e: e["source_key"])
    write_json(OUTPUT, entries)

    varieties = sorted({c["type"] for e in entries for c in e["certifications"]})
    print(
        f"masters: {len(entries)} active master cheesemakers, {len(varieties)} distinct "
        f"certification varieties -> data/raw/masters.json "
        f"({retired} retired/inactive names on the back page, not emitted)"
    )


if __name__ == "__main__":
    main()
