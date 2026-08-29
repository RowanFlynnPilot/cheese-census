import { useCallback, useEffect, useState } from "react";
import type { Award, Cheese, Creamery } from "./types";
import {
  AGE_LABEL,
  FLAVOR_GROUP,
  MILK_LABEL,
  TEXTURE_LABEL,
  familyLabel,
  fold,
  labelize,
} from "./data";

/* The cheese board builder: personal state (like hearts) plus a pure,
   deterministic balance engine. A good board is a *variety* problem — the
   similarity engine measures sameness, this module spends the same structured
   fields on its opposite: spread across texture, age, milk, flavor family. */

// Board state lives in the reader's browser beside their hearts, keyed on the
// same stable cheese ids. Nothing leaves the device.
const KEY = "cheese-census.board.v1";

export const BOARD_SIZES = [3, 5, 7] as const;
export const DEFAULT_SIZE = 5;

interface Stored {
  size: number;
  ids: string[];
}

function read(): Stored {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const candidate = parsed as { size?: unknown; ids?: unknown };
      const size =
        typeof candidate.size === "number" &&
        (BOARD_SIZES as readonly number[]).includes(candidate.size)
          ? candidate.size
          : DEFAULT_SIZE;
      const ids = Array.isArray(candidate.ids)
        ? [...new Set(candidate.ids.filter((x): x is string => typeof x === "string"))]
        : [];
      return { size, ids: ids.slice(0, size) };
    }
  } catch {
    // Unreadable storage — start with an empty board.
  }
  return { size: DEFAULT_SIZE, ids: [] };
}

/** The working board, in pick order, synced across open tabs. */
export function useBoard() {
  const [state, setState] = useState<Stored>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const write = useCallback((updater: (s: Stored) => Stored) => {
    setState((current) => {
      const next = updater(current);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode, quota) — the board lasts the session.
      }
      return next;
    });
  }, []);

  const add = useCallback(
    (id: string) =>
      write((s) =>
        s.ids.includes(id) || s.ids.length >= s.size ? s : { ...s, ids: [...s.ids, id] },
      ),
    [write],
  );
  const remove = useCallback(
    (id: string) => write((s) => ({ ...s, ids: s.ids.filter((x) => x !== id) })),
    [write],
  );
  const clear = useCallback(() => write((s) => ({ ...s, ids: [] })), [write]);
  // Shrinking trims from the end — the newest picks are the cheapest to lose.
  const setSize = useCallback(
    (size: number) => write((s) => ({ size, ids: s.ids.slice(0, size) })),
    [write],
  );
  const replace = useCallback(
    (ids: string[], size?: number) =>
      write((s) => {
        const next = size ?? s.size;
        return { size: next, ids: [...new Set(ids)].slice(0, next) };
      }),
    [write],
  );

  return { ids: state.ids, size: state.size, add, remove, clear, setSize, replace };
}

/* ── The balance engine (pure, deterministic) ─────────────────────────────── */

export interface BoardCoverage {
  textures: Set<string>;
  ages: Set<string>;
  milks: Set<string>;
  /** Flavor families covered (FLAVOR_GROUP values). */
  groups: Set<string>;
  families: Set<string>;
  counties: Set<string>;
  /** Picks per creamery — a board must not collapse into one maker's shelf. */
  creameries: Map<string, number>;
  /** Folded pick names — the plain-variant mirror rule, same as recommend(). */
  names: Set<string>;
}

export function boardCoverage(
  picks: Cheese[],
  creameriesById: Map<string, Creamery>,
): BoardCoverage {
  const cov: BoardCoverage = {
    textures: new Set(),
    ages: new Set(),
    milks: new Set(),
    groups: new Set(),
    families: new Set(),
    counties: new Set(),
    creameries: new Map(),
    names: new Set(),
  };
  for (const cheese of picks) {
    cov.textures.add(cheese.texture);
    cov.ages.add(cheese.age_band);
    for (const m of cheese.milk) cov.milks.add(m);
    for (const f of cheese.flavor) {
      const group = FLAVOR_GROUP[f];
      if (group) cov.groups.add(group);
    }
    cov.families.add(cheese.family);
    const county = creameriesById.get(cheese.creamery_id)?.county;
    if (county) cov.counties.add(county);
    cov.creameries.set(
      cheese.creamery_id,
      (cov.creameries.get(cheese.creamery_id) ?? 0) + 1,
    );
    cov.names.add(fold(cheese.name));
  }
  return cov;
}

/** The adventurous corner of the board — boosted once a board has its footing. */
const DARE_FAMILIES = new Set(["blue", "washed_rind"]);

export interface BoardSuggestion {
  cheese: Cheese;
  score: number;
  /** Short chips explaining the pick: what it adds that the board lacks. */
  gains: string[];
}

/** What this cheese would add to the board. Null means ineligible (a name
 *  already on the board, or a third pick from one creamery). */
function evaluate(
  cheese: Cheese,
  cov: BoardCoverage,
  pickCount: number,
  awards: Award[] | undefined,
  creamery: Creamery | undefined,
): { score: number; gains: string[] } | null {
  if (cov.names.has(fold(cheese.name))) return null;
  const fromSame = cov.creameries.get(cheese.creamery_id) ?? 0;
  if (fromSame >= 2) return null;

  // Base 0.1 keeps a fully-covered board's remaining slots fillable — a
  // candidate that adds nothing new still ranks, just behind everything that does.
  let score = 0.1;
  const gains: string[] = [];
  if (!cov.textures.has(cheese.texture)) {
    score += 3;
    gains.push((TEXTURE_LABEL[cheese.texture] ?? cheese.texture).toLowerCase());
  }
  if (!cov.ages.has(cheese.age_band)) {
    score += 2;
    gains.push((AGE_LABEL[cheese.age_band] ?? cheese.age_band).toLowerCase());
  }
  const newMilks = cheese.milk.filter((m) => !cov.milks.has(m));
  score += 2 * newMilks.length;
  if (newMilks.length) {
    gains.push(
      `${newMilks.map((m) => (MILK_LABEL[m] ?? m).toLowerCase()).join(" & ")} milk`,
    );
  }
  const newGroups = new Set<string>();
  for (const f of cheese.flavor) {
    const group = FLAVOR_GROUP[f];
    if (group && !cov.groups.has(group) && !newGroups.has(group)) {
      newGroups.add(group);
      if (newGroups.size <= 2) gains.push(labelize(f));
    }
  }
  score += 1.5 * Math.min(newGroups.size, 2);
  if (!cov.families.has(cheese.family)) {
    score += 1.5;
    gains.push(familyLabel(cheese.family).toLowerCase());
  }
  const county = creamery?.county;
  if (county && !cov.counties.has(county)) score += 0.75;
  if (awards?.length) {
    score += awards.some((a) => a.champion) ? 1.5 : 1;
    gains.push("award winner");
  }
  if (
    pickCount >= 2 &&
    DARE_FAMILIES.has(cheese.family) &&
    ![...cov.families].some((f) => DARE_FAMILIES.has(f))
  ) {
    score += 1;
    gains.push("the dare");
  }
  // A second pick from a creamery already on the board is allowed but costly.
  if (fromSame === 1) score -= 1.5;
  // "Fresh" texture and "Fresh" age band would chip twice; say it once.
  return { score, gains: [...new Set(gains)] };
}

/** Ranked next picks for the board. Deterministic: score desc, id asc; shown
 *  list additionally capped to one per creamery and one per folded name so the
 *  rail reads as eight different answers, not one answer eight times. */
export function suggestForBoard(
  picks: Cheese[],
  size: number,
  pool: Cheese[],
  creameriesById: Map<string, Creamery>,
  awardsByCheese: Map<string, Award[]>,
  limit = 8,
): BoardSuggestion[] {
  if (picks.length >= size) return [];
  const cov = boardCoverage(picks, creameriesById);
  const onBoard = new Set(picks.map((c) => c.id));
  const ranked: BoardSuggestion[] = [];
  for (const cheese of pool) {
    if (onBoard.has(cheese.id)) continue;
    const result = evaluate(
      cheese,
      cov,
      picks.length,
      awardsByCheese.get(cheese.id),
      creameriesById.get(cheese.creamery_id),
    );
    if (result) ranked.push({ cheese, ...result });
  }
  ranked.sort((a, b) => b.score - a.score || a.cheese.id.localeCompare(b.cheese.id));
  const seenNames = new Set(cov.names);
  const seenCreameries = new Set<string>();
  const shown: BoardSuggestion[] = [];
  for (const suggestion of ranked) {
    const nameKey = fold(suggestion.cheese.name);
    if (seenNames.has(nameKey) || seenCreameries.has(suggestion.cheese.creamery_id)) {
      continue;
    }
    seenNames.add(nameKey);
    seenCreameries.add(suggestion.cheese.creamery_id);
    shown.push(suggestion);
    if (shown.length >= limit) break;
  }
  return shown;
}

/** Fill the board greedily: take the top suggestion, re-score, repeat. Also the
 *  seeding path — pass the reader's hearted cheeses as the pool and it picks
 *  the most balanced board their own saves can make. */
export function completeBoard(
  picks: Cheese[],
  size: number,
  pool: Cheese[],
  creameriesById: Map<string, Creamery>,
  awardsByCheese: Map<string, Award[]>,
): Cheese[] {
  const board = [...picks];
  while (board.length < size) {
    const next = suggestForBoard(board, size, pool, creameriesById, awardsByCheese, 1)[0];
    if (!next) break;
    board.push(next.cheese);
  }
  return board;
}

/** What the board still wants, in plain English — at most two nudges, in
 *  priority order. Empty when the spread is sound. */
export function boardNudges(picks: Cheese[], size: number, cov: BoardCoverage): string[] {
  if (!picks.length) return [];
  const nudges: string[] = [];
  const soft =
    cov.textures.has("fresh") || cov.textures.has("soft") || cov.textures.has("semi_soft");
  const firm = cov.textures.has("semi_hard") || cov.textures.has("hard");
  if (!soft) {
    nudges.push("Nothing soft yet — a fresh or creamy cheese gives the board a landing spot.");
  }
  if (!firm) nudges.push("Nothing firm yet — an aged wheel anchors the board.");
  if (!cov.ages.has("aged") && !cov.ages.has("extra_aged")) {
    nudges.push("Everything is young — one aged pick adds depth.");
  }
  if (cov.milks.size === 1 && cov.milks.has("cow")) {
    nudges.push("All cow so far — goat or sheep changes the conversation.");
  }
  if (!cov.groups.has("bold") && !cov.groups.has("acid")) {
    nudges.push("The board leans mild — something tangy or smoky wakes it up.");
  }
  if (
    size >= 5 &&
    picks.length < size &&
    ![...cov.families].some((f) => DARE_FAMILIES.has(f))
  ) {
    nudges.push("Room for a dare — a blue or a washed rind gets talked about.");
  }
  return nudges.slice(0, 2);
}

/** Meter labels for the six flavor families — reader-facing names for the
 *  internal palette groups. */
export const GROUP_ORDER = ["dairy", "sweet", "toast", "green", "acid", "bold"];
export const GROUP_LABEL: Record<string, string> = {
  dairy: "Mild & creamy",
  sweet: "Sweet & fruity",
  toast: "Nutty & toasty",
  green: "Earthy & grassy",
  acid: "Tangy & sharp",
  bold: "Bold & smoky",
};
