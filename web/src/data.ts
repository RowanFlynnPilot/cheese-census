import type { Award, Cheese, Creamery, Dataset, Highlight, Person } from "./types";

const BASE = import.meta.env.BASE_URL;

async function table<T>(name: string): Promise<T[]> {
  const response = await fetch(`${BASE}data/${name}.json`);
  if (!response.ok) {
    throw new Error(`could not load ${name}.json (HTTP ${response.status})`);
  }
  return (await response.json()) as T[];
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
