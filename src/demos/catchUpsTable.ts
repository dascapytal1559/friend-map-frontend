// The Table's Catch-ups (CatchUpsTable.tsx): every catch-up as a row, sorted
// by date (the newest first, to start with), by hours or by weight (what
// each person at it got, catchUpWorth: the hours it counts as, a trip's by
// tripCountedHours, times each one's share), and found by the
// header's search box by anyone at it (name or alias) or by its note, as the
// People table finds people (find.ts): while names are hidden (No name
// except…) by the names of those picked alone. Pure functions, no DOM.

import type { CatchUp, ClosenessSettings } from "../archive.ts";
import { catchUpCountedHours, catchUpWorth, inOrder } from "../catchUps.ts";
import { goesBy, holds } from "../names.ts";
import { findWords, type FindNames } from "./find.ts";

export type CatchUpColumn = "day" | "hours" | "weight";

export interface CatchUpSort {
  column: CatchUpColumn;
  descending: boolean;
}

export const CATCH_UP_SORT: CatchUpSort = { column: "day", descending: true };

/** The sort after clicking `column`'s header: the other way round if it is already sorted by, else the newest or longest first. */
export function nextCatchUpSort(sort: CatchUpSort, column: CatchUpColumn): CatchUpSort {
  return sort.column === column ? { column, descending: !sort.descending } : { column, descending: true };
}

/**
 * `list` sorted by `sort`, the weight being what each one at it got with `settings` (as its Weight shows); catch-ups
 * of the same hours or weight go newest first, and those on one date by time, then by when they were added (inOrder).
 */
export function sortCatchUps(
  list: readonly CatchUp[],
  sort: CatchUpSort,
  settings: Pick<ClosenessSettings, "catchUpHourWorth" | "groupSharedPart" | "tripFullHours">,
): CatchUp[] {
  const sign = sort.descending ? -1 : 1;
  // To a tenth, as Weight shows it, so those that show the same weight are the same weight.
  const weight = (c: CatchUp) => Math.round(catchUpWorth(settings, catchUpCountedHours(settings, c), c.people.length, c.others) * 10) / 10;
  const value = sort.column === "hours" ? (c: CatchUp) => c.hours : sort.column === "weight" ? weight : null;
  return [...list].sort((a, b) => (value ? sign * (value(a) - value(b)) || -inOrder(a, b) : sign * inOrder(a, b)));
}

/**
 * The catch-ups `search` finds: anyone at one goes by it, or its note holds it; while names are hidden (No name
 * except…), anyone at one who is picked and whose name holds it; all of them for no search.
 */
export function findCatchUps(list: readonly CatchUp[], search: string, names: FindNames): readonly CatchUp[] {
  const words = findWords(search);
  if (!words) return list;
  if (names.hidden) return list.filter((c) => c.people.some((p) => holds(names.label(p).primary, words)));
  return list.filter((c) => c.people.some((p) => goesBy(p.name, p.aliases, words)) || holds(c.note, words));
}
