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

/** Cheese types a creamery is licensed to make, from its DATCP plant operations.
 *  Operations are verbatim from the licence, so this stays a display concern. */
const NON_CHEESE_OPERATION =
  /milk$|^ACaSS$|Retail Store|Custom Processing|Pasteurizer|Brine System|Membrane|Powder|Frozen|Affinage|Condensary|Drying|Cut\/Wrap|Cheese Processing|Whey|Cream$|Butter|Yogurt|Sour Cream|Single Service|Aseptic|LACF|Non-Dairy|Process Cheese|Raw Milk Cheese|Fluid Milk|^Other$/i;

export function cheeseOperations(creamery: Creamery): string[] {
  const all = creamery.plants.flatMap((p) => p.operations);
  return [...new Set(all.filter((o) => !NON_CHEESE_OPERATION.test(o)))].sort();
}

export function capabilities(creamery: Creamery): string[] {
  const all = creamery.plants.flatMap((p) => p.operations);
  return [...new Set(all.filter((o) => NON_CHEESE_OPERATION.test(o)))].sort();
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
