import type { Award, Cheese, Creamery, Dataset, Highlight, Person } from "./types";

const BASE = import.meta.env.BASE_URL;

async function table<T>(name: string): Promise<T[]> {
  const response = await fetch(`${BASE}data/${name}.json`);
  if (!response.ok) {
    throw new Error(`could not load ${name}.json (HTTP ${response.status})`);
  }
  return (await response.json()) as T[];
}

/** One cheese's shop-sourced draft material: a hotlinkable photo and the
 *  maker's own short description — both awaiting that creamery's permission. */
export interface DraftMedia {
  image: string;
  summary: string | null;
}

/** DEV-only overlay: shop-sourced photo + blurb candidates awaiting each
 *  creamery's permission (queue/product_images.json, served by
 *  `sync-data.mjs --draft`). Production builds scrub the file and never call
 *  this — the permission gate lives in the sync script, not up here. */
export async function loadDraftImages(): Promise<Map<string, DraftMedia>> {
  const response = await fetch(`${BASE}data/draft_images.json`);
  if (!response.ok) {
    throw new Error(
      `no draft image overlay (HTTP ${response.status}) — start with npm run dev, not vite directly`,
    );
  }
  const rows = (await response.json()) as {
    cheese_id: string;
    image: string;
    summary?: string | null;
  }[];
  return new Map(
    rows.map((r) => [r.cheese_id, { image: r.image, summary: r.summary ?? null }]),
  );
}

export async function loadDataset(): Promise<Dataset> {
  const [creameries, cheeses, people, awards, highlights] = await Promise.all([
    table<Creamery>("creameries"),
    table<Cheese>("cheeses"),
    table<Person>("people"),
    table<Award>("awards"),
    table<Highlight>("highlights"),
  ]);
  return { creameries, cheeses, people, awards, highlights };
}

/** Plant.operations concatenates DATCP's three licence columns. The first two are
 *  closed vocabularies — 7 GeneralProcessing and 29 SpecificProcessing values,
 *  verified against the July 2026 report — so membership is exact, not a regex
 *  guess. Everything outside them is a cheese type from CheeseManufactured.
 *
 *  "Other" appears in both SpecificProcessing and CheeseManufactured; it is kept
 *  as a capability because a "licensed to make: Other" chip carries no information.
 *  A genuinely new DATCP capability would surface as a cheese chip — visibly wrong
 *  and immediately reviewable, which beats silently hiding a new cheese type. */
const CAPABILITY_VOCAB = new Set<string>([
  // GeneralProcessing
  "ACaSS",
  "Bovine Milk",
  "Custom Processing",
  "Goat Milk",
  "Other Type of Milk",
  "Retail Store",
  "Sheep Milk",
  // SpecificProcessing
  "Affinage (Aging)",
  "Aseptic or Canning",
  "Brine System",
  "Butter Processing",
  "Cheese Processing",
  "Condensary/Evap",
  "Cottage Cheese",
  "Cream",
  "Cut/Wrap/Shred",
  "Drying Operation",
  "Fluid Milk",
  "Frozen Dairy Products",
  "LACF",
  "Membrane Processing",
  "Non-Dairy - Acidified Foods",
  "Non-Dairy - Juice",
  "Non-Dairy - Low Acid Canned Foods",
  "Non-Dairy - Seafood",
  "Other",
  "Pasteurizer - Batch",
  "Pasteurizer - HHST",
  "Pasteurizer - HTST",
  "Powder Mixing/Blending",
  "Process Cheese",
  "Raw Milk Cheese",
  "Single Service - Grade A",
  "Sour Cream",
  "Whey/Whey By Products",
  "Yogurt",
]);

export function isCapability(operation: string): boolean {
  return CAPABILITY_VOCAB.has(operation);
}

/** Case- and diacritic-insensitive folding, so "butterkase" finds Butterkäse. */
export function fold(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function cheeseOperations(creamery: Creamery): string[] {
  const all = creamery.plants.flatMap((p) => p.operations);
  return [...new Set(all.filter((o) => !isCapability(o)))].sort();
}

export function capabilities(creamery: Creamery): string[] {
  const all = creamery.plants.flatMap((p) => p.operations);
  return [...new Set(all.filter((o) => isCapability(o)))].sort();
}

export function awardsFor(awards: Award[], creameryId: string): Award[] {
  return awards
    .filter((a) => a.creamery_id === creameryId)
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.placement - b.placement ||
        a.class_number - b.class_number,
    );
}

export interface AwardGroup {
  key: string;
  contest: Award["contest"];
  year: number;
  awards: Award[];
}

/** One group per contest edition, newest first — the shape the detail panel renders. */
export function groupAwards(awards: Award[]): AwardGroup[] {
  const editions = new Map<string, Award[]>();
  for (const award of awards) {
    const key = `${award.contest}-${award.year}`;
    const list = editions.get(key);
    if (list) list.push(award);
    else editions.set(key, [award]);
  }
  return [...editions.values()]
    .map((list) => ({
      key: `${list[0].contest}-${list[0].year}`,
      contest: list[0].contest,
      year: list[0].year,
      awards: [...list].sort(
        (a, b) => a.class_number - b.class_number || a.placement - b.placement,
      ),
    }))
    .sort((a, b) => b.year - a.year || a.contest.localeCompare(b.contest));
}

export function peopleFor(people: Person[], creameryId: string): Person[] {
  return people
    .filter((p) => p.creamery_ids.includes(creameryId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const PLACEMENT = ["", "1st", "2nd", "3rd"];
export const CONTEST: Record<string, string> = {
  wccc: "World Championship",
  uscc: "U.S. Championship",
};

/* ── Cheese-side helpers (the reader layer) ────────────────────────────── */

export const FAMILY_LABEL: Record<string, string> = {
  cheddar: "Cheddar",
  colby_jack: "Colby & Jack",
  alpine: "Alpine",
  gouda_edam: "Gouda & Edam",
  blue: "Blue",
  bloomy: "Bloomy rind",
  washed_rind: "Washed rind",
  fresh: "Fresh",
  pasta_filata: "Pasta filata",
  italian_hard: "Italian hard",
  hispanic: "Hispanic",
  brined: "Brined",
  semi_soft_table: "Semi-soft table",
  curds: "Curds",
  spreads_processed: "Spreads & processed",
  other: "Other",
};

export const TEXTURE_LABEL: Record<string, string> = {
  fresh: "Fresh",
  soft: "Soft",
  semi_soft: "Semi-soft",
  semi_hard: "Semi-hard",
  hard: "Hard",
};

export const AGE_LABEL: Record<string, string> = {
  fresh: "Fresh",
  young: "Young",
  medium: "Medium",
  aged: "Aged",
  extra_aged: "Extra-aged",
};

export const RIND_LABEL: Record<string, string> = {
  none: "Rindless",
  natural: "Natural rind",
  bloomy: "Bloomy rind",
  washed: "Washed rind",
  wax: "Waxed",
};

export const MILK_LABEL: Record<string, string> = {
  cow: "Cow",
  goat: "Goat",
  sheep: "Sheep",
  mixed: "Mixed",
};

// Softest to hardest / lightest to strongest — the order the filters offer them.
export const TEXTURE_ORDER = ["fresh", "soft", "semi_soft", "semi_hard", "hard"];
export const MILK_ORDER = ["cow", "goat", "sheep", "mixed"];

/** Vocabulary terms are lowercase words joined with underscores. */
export function labelize(term: string): string {
  return term.replace(/_/g, " ");
}

/** The closed 22-term flavor vocabulary, grouped into six palette families so
 *  a card's profile reads at a glance (acid = house teal, green = earthy…).
 *  Presentation only — a term missing here renders as a plain tag, and a new
 *  vocabulary term should be added to its family when it lands. */
export const FLAVOR_GROUP: Record<string, string> = {
  buttery: "dairy",
  creamy: "dairy",
  milky: "dairy",
  mild: "dairy",
  sweet: "sweet",
  caramel: "sweet",
  fruity: "sweet",
  nutty: "toast",
  toasty: "toast",
  crystalline: "toast",
  grassy: "green",
  earthy: "green",
  mushroomy: "green",
  tangy: "acid",
  sharp: "acid",
  salty: "acid",
  briny: "acid",
  savory: "bold",
  smoky: "bold",
  peppery: "bold",
  pungent: "bold",
  funky: "bold",
};

export function flavorClass(term: string): string {
  const group = FLAVOR_GROUP[term];
  return group ? `tag fl f-${group}` : "tag";
}

/** "ghost_pepper" → "Ghost pepper" — chip labels read sentence-case; queries
 *  and prose keep the lowercase vocabulary term. */
export function chipLabel(term: string): string {
  const label = labelize(term);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function familyLabel(family: string): string {
  return FAMILY_LABEL[family] ?? labelize(family);
}

/** The single win a card should brag about: champion first, then placement,
 *  then recency. */
export function topAward(awards: Award[]): Award | null {
  if (!awards.length) return null;
  return [...awards].sort(
    (a, b) =>
      Number(b.champion) - Number(a.champion) ||
      a.placement - b.placement ||
      b.year - a.year ||
      a.class_number - b.class_number,
  )[0];
}

/** "1st · Lowfat Cheeses · World Championship 2026" — the card citation. */
export function awardCitation(award: Award): string {
  const label = award.champion
    ? "Champion"
    : PLACEMENT[award.placement] + (award.finalist ? " · Top 20" : "");
  return `${label} · ${award.class_name} · ${CONTEST[award.contest]} ${award.year}`;
}

export function awardsForCheese(awards: Award[], cheeseId: string): Award[] {
  return awards
    .filter((a) => a.cheese_id === cheeseId)
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.placement - b.placement ||
        a.class_number - b.class_number,
    );
}

/** A highlight is live inside its [starts, ends] window; ISO dates compare as strings. */
export function activeHighlights(
  highlights: Highlight[],
  cheesesById: Map<string, Cheese>,
  today: string,
): { highlight: Highlight; cheese: Cheese }[] {
  return highlights
    .filter((h) => h.starts <= today && today <= h.ends)
    .map((h) => ({ highlight: h, cheese: cheesesById.get(h.cheese_id) }))
    .filter((x): x is { highlight: Highlight; cheese: Cheese } => Boolean(x.cheese));
}

export interface Recommendation {
  cheese: Cheese;
  /** The saved cheese that contributed this candidate's strongest link. */
  because: Cheese;
}

/** "To try next": pool the similar-lists of every saved cheese and sum the
 *  match scores per candidate. Plain variants of one type mirror each other at
 *  100.0 across creameries — a known dataset limit — so an undamped top list
 *  is all mirrors: keep one candidate per folded name and at most two per
 *  creamery. Ties break on id so the rail is stable across reloads. */
export function recommend(
  hearts: string[],
  cheesesById: Map<string, Cheese>,
  include: (cheese: Cheese) => boolean,
  limit = 8,
): Recommendation[] {
  const saved = new Set(hearts);
  const pool = new Map<string, { total: number; best: number; because: Cheese }>();
  for (const id of hearts) {
    const heart = cheesesById.get(id);
    if (!heart) continue;
    for (const ref of heart.similar) {
      if (saved.has(ref.cheese_id)) continue;
      const candidate = cheesesById.get(ref.cheese_id);
      if (!candidate || !include(candidate)) continue;
      const entry = pool.get(ref.cheese_id);
      if (!entry) {
        pool.set(ref.cheese_id, { total: ref.score, best: ref.score, because: heart });
      } else {
        entry.total += ref.score;
        if (ref.score > entry.best) {
          entry.best = ref.score;
          entry.because = heart;
        }
      }
    }
  }
  const ranked = [...pool.entries()].sort(
    (a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]),
  );
  const seenNames = new Set<string>();
  const perCreamery = new Map<string, number>();
  const picks: Recommendation[] = [];
  for (const [id, entry] of ranked) {
    const cheese = cheesesById.get(id)!;
    const nameKey = fold(cheese.name);
    const fromSame = perCreamery.get(cheese.creamery_id) ?? 0;
    if (seenNames.has(nameKey) || fromSame >= 2) continue;
    seenNames.add(nameKey);
    perCreamery.set(cheese.creamery_id, fromSame + 1);
    picks.push({ cheese, because: entry.because });
    if (picks.length >= limit) break;
  }
  return picks;
}
