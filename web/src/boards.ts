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
   fields on its opposite: spread across texture, age, milk, flavor family.
   The engine speaks with one voice: the nudge the meter shows is also the
   first thing the suggestion rail answers. */

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
  // The view asks before doing this when picks would go.
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
  // Drop ids the dataset no longer knows. Runs against the *latest* state
  // inside the updater, so it composes safely with a replace() queued in the
  // same render (a shared-link adoption) instead of overwriting it with stale ids.
  const prune = useCallback(
    (keep: (id: string) => boolean) =>
      write((s) => {
        const ids = s.ids.filter(keep);
        return ids.length === s.ids.length ? s : { ...s, ids };
      }),
    [write],
  );

  return { ids: state.ids, size: state.size, add, remove, clear, setSize, replace, prune };
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
  /** Picks whose creamery has closed — the board should not send anyone there. */
  closed: Cheese[];
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
    closed: [],
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
    const creamery = creameriesById.get(cheese.creamery_id);
    if (creamery?.county) cov.counties.add(creamery.county);
    if (creamery?.status === "closed") cov.closed.push(cheese);
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

/** What the board still wants. `want` is the chip a suggestion wears when it
 *  answers the nudge ("needed: soft"); `resolves` is how the rail knows. */
export interface Nudge {
  text: string;
  want: string;
  resolves: (cheese: Cheese) => boolean;
}

const SOFT = new Set(["fresh", "soft", "semi_soft"]);
const FIRM = new Set(["semi_hard", "hard"]);
const AGED = new Set(["aged", "extra_aged"]);

/** What the board still wants, in plain English — at most two nudges, in
 *  priority order. Empty when the spread is sound. */
export function boardNudges(picks: Cheese[], size: number, cov: BoardCoverage): Nudge[] {
  if (!picks.length) return [];
  const nudges: Nudge[] = [];
  if (cov.closed.length) {
    const gone = cov.closed[0];
    nudges.push({
      text: `${gone.name} comes from a creamery that has closed — swap it out.`,
      want: "",
      resolves: () => false,
    });
  }
  const soft = [...cov.textures].some((t) => SOFT.has(t));
  const firm = [...cov.textures].some((t) => FIRM.has(t));
  if (!soft) {
    nudges.push({
      text: "Nothing soft yet — a fresh or creamy cheese gives the board a landing spot.",
      want: "soft",
      resolves: (c) => SOFT.has(c.texture),
    });
  }
  if (!firm) {
    nudges.push({
      text: "Nothing firm yet — an aged wheel anchors the board.",
      want: "firm",
      resolves: (c) => FIRM.has(c.texture),
    });
  }
  if (![...cov.ages].some((a) => AGED.has(a))) {
    nudges.push({
      text: "Everything is young — one aged pick adds depth.",
      want: "aged",
      resolves: (c) => AGED.has(c.age_band),
    });
  }
  if (cov.milks.size === 1 && cov.milks.has("cow")) {
    nudges.push({
      text: "All cow so far — goat or sheep changes the conversation.",
      want: "goat or sheep",
      resolves: (c) => c.milk.some((m) => m !== "cow"),
    });
  }
  if (!cov.groups.has("bold") && !cov.groups.has("acid")) {
    nudges.push({
      text: "The board leans mild — something tangy or smoky wakes it up.",
      want: "tangy or smoky",
      resolves: (c) => c.flavor.some((f) => ["bold", "acid"].includes(FLAVOR_GROUP[f])),
    });
  }
  if (
    size >= 5 &&
    picks.length < size &&
    ![...cov.families].some((f) => DARE_FAMILIES.has(f))
  ) {
    nudges.push({
      text: "Room for a dare — a blue or a washed rind gets talked about.",
      want: "a blue or washed rind",
      resolves: (c) => DARE_FAMILIES.has(c.family),
    });
  }
  return nudges.slice(0, 2);
}

export interface BoardSuggestion {
  cheese: Cheese;
  score: number;
  /** Short chips explaining the pick: what it adds that the board lacks. */
  gains: string[];
}

/** Answering the meter's lead nudge outweighs any single structural gain, so
 *  the rail and the note never argue. */
const LEAD_BONUS = 4;

/** Age bands as a reader says them — "medium" alone reads as a size. */
export const AGE_WORD: Record<string, string> = {
  fresh: "fresh",
  young: "young",
  medium: "medium age",
  aged: "aged",
  extra_aged: "extra-aged",
};
const AGE_GAIN = AGE_WORD;

/** What this cheese would add to the board. Null means ineligible (a name
 *  already on the board, a third pick from one creamery, or a closed creamery). */
function evaluate(
  cheese: Cheese,
  cov: BoardCoverage,
  pickCount: number,
  awards: Award[] | undefined,
  creamery: Creamery | undefined,
  lead: Nudge | null,
): { score: number; gains: string[] } | null {
  if (cov.names.has(fold(cheese.name))) return null;
  if (creamery && creamery.status !== "active") return null;
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
    gains.push(AGE_GAIN[cheese.age_band] ?? (AGE_LABEL[cheese.age_band] ?? cheese.age_band).toLowerCase());
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
    gains.push(`${familyLabel(cheese.family).toLowerCase()} family`);
  }
  // The board is a shopping list in the end: a pick from a county already on
  // it is one fewer stop, not one more.
  const county = creamery?.county;
  if (county && cov.counties.has(county)) score += 0.75;
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
    gains.push("the adventurous pick");
  }
  if (lead?.want && lead.resolves(cheese)) {
    score += LEAD_BONUS;
    gains.unshift(`needed: ${lead.want}`);
  }
  // A second pick from a creamery already on the board is allowed but costly.
  if (fromSame === 1) score -= 1.5;
  // "Fresh" texture and "Fresh" age band would chip twice; say it once.
  return { score, gains: [...new Set(gains)] };
}

interface RankOptions {
  /** Keep ranking even when the board is full — the swap rail needs it. */
  allowFull?: boolean;
}

/** Every eligible candidate, best first: score desc, id asc. */
function rankForBoard(
  picks: Cheese[],
  size: number,
  pool: Cheese[],
  creameriesById: Map<string, Creamery>,
  awardsByCheese: Map<string, Award[]>,
  options: RankOptions = {},
): { ranked: BoardSuggestion[]; cov: BoardCoverage } {
  const cov = boardCoverage(picks, creameriesById);
  if (picks.length >= size && !options.allowFull) return { ranked: [], cov };
  const lead = boardNudges(picks, size, cov)[0] ?? null;
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
      lead,
    );
    if (result) ranked.push({ cheese, ...result });
  }
  ranked.sort((a, b) => b.score - a.score || a.cheese.id.localeCompare(b.cheese.id));
  return { ranked, cov };
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
  options: RankOptions = {},
): BoardSuggestion[] {
  const { ranked, cov } = rankForBoard(picks, size, pool, creameriesById, awardsByCheese, options);
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

/** djb2 over a string — a stable, cheap way to turn a reader's salt into an
 *  index. Not cryptographic; it only has to be the same every time. */
function hash(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h;
}

/** Fill the board greedily: take the top suggestion, re-score, repeat. Also the
 *  seeding path — pass the reader's hearted cheeses as the pool and it picks
 *  the most balanced board their own saves can make.
 *
 *  `salt` breaks exact-score ties per reader (a random id kept in their
 *  browser), so an empty board's one-tap fill is not the same five cheeses for
 *  everyone in the state. An empty salt keeps the id-ascending order — the
 *  build's determinism promise, and what the tests pin. */
export function completeBoard(
  picks: Cheese[],
  size: number,
  pool: Cheese[],
  creameriesById: Map<string, Creamery>,
  awardsByCheese: Map<string, Award[]>,
  salt = "",
): Cheese[] {
  const board = [...picks];
  let step = 0;
  while (board.length < size) {
    const { ranked } = rankForBoard(board, size, pool, creameriesById, awardsByCheese);
    if (!ranked.length) break;
    const top = ranked[0].score;
    const tied = ranked.filter((s) => s.score === top);
    const index = salt ? hash(`${salt}:${step}`) % tied.length : 0;
    board.push(tied[index].cheese);
    step += 1;
  }
  return board;
}

/** The pick a full board can best spare: the one carrying the fewest facets
 *  (texture, age, milk, flavor family, cheese family) nothing else on the board
 *  covers. Ties go to the newest pick — the cheapest to lose. A closed
 *  creamery's cheese is always the one to spare. */
export function weakestPick(picks: Cheese[], creameriesById: Map<string, Creamery>): Cheese | null {
  if (!picks.length) return null;
  const closed = picks.find((c) => creameriesById.get(c.creamery_id)?.status === "closed");
  if (closed) return closed;
  let weakest: Cheese | null = null;
  let fewest = Infinity;
  for (const pick of picks) {
    const others = boardCoverage(
      picks.filter((c) => c.id !== pick.id),
      creameriesById,
    );
    let unique = 0;
    if (!others.textures.has(pick.texture)) unique += 1;
    if (!others.ages.has(pick.age_band)) unique += 1;
    unique += pick.milk.filter((m) => !others.milks.has(m)).length;
    unique += new Set(
      pick.flavor.map((f) => FLAVOR_GROUP[f]).filter((g) => g && !others.groups.has(g)),
    ).size;
    if (!others.families.has(pick.family)) unique += 1;
    if (unique <= fewest) {
      fewest = unique;
      weakest = pick;
    }
  }
  return weakest;
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
