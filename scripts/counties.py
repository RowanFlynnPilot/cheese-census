"""Wisconsin county outlines for the map — a curation tool, run deliberately.

Downloads the U.S. Census Bureau's 2023 cartographic boundary file for counties
(1:5,000,000, public domain), keeps Wisconsin's 72, simplifies each outline to
the same 0.003° tolerance as the state outline in web/src/wisconsin.json, and
writes web/src/counties.json as a FeatureCollection with {name, fips} per
feature, sorted by name. The map draws it under the pins; nothing in the
pipeline reads it.

    python scripts/counties.py
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

import requests
import shapefile  # pyshp
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "src" / "counties.json"
URL = "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_5m.zip"
TOLERANCE = 0.003  # degrees, as for the state outline
WISCONSIN = "55"


def main() -> None:
    response = requests.get(URL, timeout=120, headers={"User-Agent": "CheeseCensusBot/1.0"})
    if response.status_code != 200:
        sys.exit(f"COUNTIES FAILED: HTTP {response.status_code} from the Census Bureau")
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    base = next(n[:-4] for n in archive.namelist() if n.endswith(".shp"))
    reader = shapefile.Reader(
        shp=io.BytesIO(archive.read(base + ".shp")),
        dbf=io.BytesIO(archive.read(base + ".dbf")),
        shx=io.BytesIO(archive.read(base + ".shx")),
    )
    fields = [f[0] for f in reader.fields[1:]]
    features = []
    for record in reader.iterShapeRecords():
        attrs = dict(zip(fields, record.record))
        if attrs["STATEFP"] != WISCONSIN:
            continue
        geometry = shape(record.shape.__geo_interface__).simplify(TOLERANCE, preserve_topology=True)
        rounded = json.loads(json.dumps(mapping(geometry)), parse_float=lambda v: round(float(v), 4))
        features.append({
            "type": "Feature",
            "properties": {"name": attrs["NAME"], "fips": attrs["GEOID"]},
            "geometry": rounded,
        })
    features.sort(key=lambda f: f["properties"]["name"])
    if len(features) != 72:
        sys.exit(f"COUNTIES FAILED: expected 72 Wisconsin counties, got {len(features)}")
    OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"))
        + "\n",
        encoding="utf-8", newline="\n",
    )
    print(f"wrote {OUT.relative_to(ROOT)}: {len(features)} counties, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
