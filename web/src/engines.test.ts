import { describe, expect, it } from "vitest";
import type { Award, Cheese, Creamery } from "./types";
import { boardCoverage, boardNudges, completeBoard, suggestForBoard } from "./boards";
import { awardCitation, fold, recommend } from "./data";

/* The two pure engines — the similarity-driven recommender and the board's
   variety scorer — are the parts of the front end with rules worth pinning:
   determinism, the mirror-name rule, the per-creamery cap, and the promise
   that awards never outrank fit. Everything here runs against small synthetic
   fixtures so a data refresh can never flip a test. */

function cheese(partial: Partial<Cheese> & { id: string; creamery_id: string }): Cheese {
  return {
    name: partial.id.split("--")[1].replace(/-/g, " "),
    family: "cheddar",
    milk: ["cow"],
    texture: "semi_hard",
    age_band: "medium",
    rind: "none",
    flavor: ["sharp", "buttery"],
    add_ins: [],
    raw_milk: null,
    trademarked: false,
    wisconsin_original: false,
    description: null,
    description_generated: true,
    image: null,
    similar: [],
    ...partial,
  };
}

function creamery(id: string, county: string): Creamery {
  return {
    id,
    name: id,
    aka: [],
    city: "Somewhere",
    county,
    lat: 44,
    lng: -89,
    address: "",
    website: null,
    retail: { store: false, mail_order: false, online: false },
    plants: [],
    dfw_company_id: null,
    founded: null,
    status: "active",
    editorial: { summary: null, visit_notes: null, photo: null },
  };
}

const creameries = new Map(
  [
    creamery("a", "Dane"),
    creamery("b", "Green"),
    creamery("c", "Door"),
    creamery("d", "Brown"),
  ].map((c) => [c.id, c]),
);
const noAwards = new Map<string, Award[]>();

const pool: Cheese[] = [
  cheese({ id: "a--cheddar", creamery_id: "a" }),
  cheese({ id: "b--cheddar", creamery_id: "b" }), // plain-variant mirror of a--cheddar
  cheese({
    id: "b--brie",
    creamery_id: "b",
    family: "bloomy",
    texture: "soft",
    age_band: "young",
    rind: "bloomy",
    flavor: ["creamy", "mushroomy"],
  }),
  cheese({
    id: "b--gouda",
    creamery_id: "b",
    family: "gouda_edam",
    texture: "hard",
    age_band: "extra_aged",
    flavor: ["caramel", "nutty"],
  }),
  cheese({
    id: "c--feta",
    creamery_id: "c",
    family: "brined",
    texture: "soft",
    age_band: "fresh",
    milk: ["sheep"],
    flavor: ["salty", "tangy"],
  }),
  cheese({
    id: "c--blue",
    creamery_id: "c",
    family: "blue",
    texture: "semi_soft",
    age_band: "aged",
    flavor: ["pungent", "salty"],
  }),
];
const byId = new Map(pool.map((c) => [c.id, c]));

describe("board suggestions", () => {
  it("never suggests a cheese whose name is already on the board", () => {
    const picks = [byId.get("a--cheddar")!];
    const ids = suggestForBoard(picks, 5, pool, creameries, noAwards).map((s) => s.cheese.id);
    expect(ids).not.toContain("b--cheddar");
  });

  it("ranks the pick that fills the most gaps first, and says why", () => {
    const picks = [byId.get("a--cheddar")!];
    const [top] = suggestForBoard(picks, 5, pool, creameries, noAwards);
    // The extra-aged gouda adds a texture, an age band, two flavor families and
    // a family — more new ground than anything else in the pool.
    expect(top.cheese.id).toBe("b--gouda");
    expect(top.gains).toEqual(
      expect.arrayContaining(["hard", "extra-aged", "caramel", "gouda & edam"]),
    );
  });

  it("caps a creamery at two picks", () => {
    const picks = [byId.get("b--brie")!, byId.get("b--gouda")!];
    const ids = suggestForBoard(picks, 7, pool, creameries, noAwards).map((s) => s.cheese.id);
    expect(ids.every((id) => !id.startsWith("b--"))).toBe(true);
  });

  it("chips each gain once even when texture and age share a label", () => {
    const [top] = suggestForBoard([byId.get("a--cheddar")!], 5, pool, creameries, noAwards);
    expect(new Set(top.gains).size).toBe(top.gains.length);
  });

  it("lets an award nudge but never outrank fit", () => {
    // A champion that duplicates the board's only pick structurally (same
    // texture, age, milk, flavors, family) must trail every cheese that adds
    // something — the award bonus is smaller than any single structural gain.
    // Its own creamery, so the one-per-creamery display cap can't hide it.
    const champion = cheese({
      id: "d--champion-cheddar",
      creamery_id: "d",
      name: "Champion Cheddar",
    });
    const awards = new Map<string, Award[]>([
      [champion.id, [{ id: "x", champion: true } as Award]],
    ]);
    const picks = [byId.get("a--cheddar")!];
    const ranked = suggestForBoard(picks, 7, [...pool, champion], creameries, awards);
    const ids = ranked.map((s) => s.cheese.id);
    expect(ids[0]).not.toBe(champion.id);
    expect(ids.indexOf(champion.id)).toBeGreaterThan(ids.indexOf("c--feta"));
    expect(ranked.find((s) => s.cheese.id === champion.id)?.gains).toContain("award winner");
  });
});

describe("completeBoard", () => {
  it("fills to size, deterministically", () => {
    const once = completeBoard([], 5, pool, creameries, noAwards).map((c) => c.id);
    const twice = completeBoard([], 5, pool, creameries, noAwards).map((c) => c.id);
    expect(once).toHaveLength(5);
    expect(twice).toEqual(once);
  });

  it("stops short when the pool cannot fill the board", () => {
    const filled = completeBoard([], 7, pool.slice(0, 2), creameries, noAwards);
    expect(filled).toHaveLength(1); // the second cheddar is a mirror name
  });
});

describe("boardNudges", () => {
  it("says nothing about an empty board", () => {
    expect(boardNudges([], 5, boardCoverage([], creameries))).toEqual([]);
  });

  it("names the biggest gaps, two at most", () => {
    const picks = [byId.get("a--cheddar")!];
    const nudges = boardNudges(picks, 5, boardCoverage(picks, creameries));
    expect(nudges).toHaveLength(2);
    expect(nudges[0]).toMatch(/Nothing soft yet/);
  });

  it("is quiet when the spread is sound", () => {
    const picks = ["a--cheddar", "b--brie", "c--feta", "c--blue", "b--gouda"].map(
      (id) => byId.get(id)!,
    );
    expect(boardNudges(picks, 5, boardCoverage(picks, creameries))).toEqual([]);
  });
});

describe("recommend", () => {
  const withSimilar = new Map(
    pool.map((c) => [
      c.id,
      {
        ...c,
        similar:
          c.id === "a--cheddar"
            ? [
                { cheese_id: "b--cheddar", score: 100 },
                { cheese_id: "b--gouda", score: 60 },
                { cheese_id: "c--blue", score: 20 },
              ]
            : [],
      },
    ]),
  );

  it("skips saved cheeses and mirror names, and attributes each pick", () => {
    const picks = recommend(["a--cheddar"], withSimilar, () => true);
    const ids = picks.map((p) => p.cheese.id);
    expect(ids).not.toContain("a--cheddar");
    expect(ids).not.toContain("b--cheddar"); // same folded name as the saved cheese
    expect(ids[0]).toBe("b--gouda");
    expect(picks[0].because.id).toBe("a--cheddar");
  });
});

describe("helpers", () => {
  it("folds case and diacritics", () => {
    expect(fold("Butterkäse")).toBe("butterkase");
  });

  it("cites a win the way the card does", () => {
    const award = {
      champion: false,
      placement: 1,
      finalist: true,
      class_name: "Lowfat Cheeses",
      contest: "wccc",
      year: 2026,
    } as Award;
    expect(awardCitation(award)).toBe("1st · Top 20 · Lowfat Cheeses · World Championship 2026");
  });
});
