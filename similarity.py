"""Build-time cheese similarity, exactly as specified in SCHEMA.md.

Pure functions over validated Cheese records. No runtime computation,
no ML, deterministic output (ties broken by score desc, then id asc).
"""
from __future__ import annotations

from models import VOCAB, Cheese, SimilarRef

TEXTURE_ORDER = {t: i for i, t in enumerate(VOCAB["texture"])}
AGE_ORDER = {a: i for i, a in enumerate(VOCAB["age_band"])}

MAX_RAW_SCORE = 9.5  # sum of all weights below
TOP_N = 6


def _jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0  # both plain — a match, per spec (only reachable for add_ins)
    return len(sa & sb) / len(sa | sb)


def _ordinal(order: dict[str, int], a: str, b: str) -> float:
    distance = abs(order[a] - order[b])
    if distance == 0:
        return 1.0
    if distance == 1:
        return 0.5
    return 0.0


def score(a: Cheese, b: Cheese) -> float:
    """0-100 similarity. Flavor dominates by design — cross-family discovery is the point."""
    raw = (
        3.0 * _jaccard(a.flavor, b.flavor)
        + 2.0 * _ordinal(TEXTURE_ORDER, a.texture, b.texture)
        + 1.5 * _ordinal(AGE_ORDER, a.age_band, b.age_band)
        + 1.0 * _jaccard(a.milk, b.milk)
        + 1.0 * _jaccard(a.add_ins, b.add_ins)
        + 0.5 * (a.rind == b.rind)
        + 0.5 * (a.family == b.family)
    )
    return round(raw / MAX_RAW_SCORE * 100, 1)


def attach_similar(cheeses: list[Cheese]) -> None:
    """Inject the top-N similar list into every cheese, in place."""
    for a in cheeses:
        ranked = sorted(
            ((score(a, b), b.id) for b in cheeses if b.id != a.id),
            key=lambda pair: (-pair[0], pair[1]),
        )
        a.similar = [SimilarRef(cheese_id=cid, score=s) for s, cid in ranked[:TOP_N]]
