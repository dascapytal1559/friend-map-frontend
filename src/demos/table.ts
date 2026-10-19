// The Table view's rows (Table.tsx): everyone from GET /api/archive/table,
// archived people too, or only those on the platform picked (their counts
// then that platform's alone), filtered by the Query bar's query, then as Hide and
// the search say (with Phone calls picked, their calls stand in for messages),
// ranked by closeness among the people
// left (filterRows), and sorted by any column (sortRows, apart so that
// sorting tens of thousands of people does not filter them again). While
// you set locations in the table, the rows hold their order (heldRows), so
// nobody jumps away mid-edit; the Location cell's choices (locationChoices) are
// here too. Pure functions, no DOM.

import { livesTogether, type PlatformCounts, type TablePerson } from "../archive.ts";
import { byCloseness } from "./closeness.ts";
import { namesFor } from "../names.ts";
import { sameLocation, writtenLocation } from "../locations.ts";
import { finds, findWords, type FindNames } from "./find.ts";
import { hideEntries, shownByHide, type HideChoices, type HideEntry } from "./hideChoices.ts";

/** The name choice when none is given: every name as it is. */
const FULL_NAMES = namesFor("full");

export type Column =
  | "name" | "tags" | "location" | "platforms" | "messages" | "direct" | "closeness" | "last" | "firstContact" | "added" | "note"
  // Shown in place of Messages, Direct and Last message with Phone calls picked (CALL_PLATFORM).
  | "calls" | "callTime" | "lastCall";

/** The call history's platform: it has calls, not messages, so the Table shows call columns for it. */
export const CALL_PLATFORM = "phone";

export interface TableSort {
  column: Column;
  descending: boolean;
}

/** Numbers and dates sort biggest and newest first when their column is first chosen; words A to Z. */
export const FIRST_DESCENDING: ReadonlySet<Column> = new Set(["messages", "direct", "closeness", "last", "firstContact", "added", "calls", "callTime", "lastCall"]);

export const DEFAULT_SORT: TableSort = { column: "closeness", descending: true };

/** The sort after clicking `column`'s header: the other way round if it is already sorted by, else its first way. */
export function nextSort(sort: TableSort, column: Column): TableSort {
  return sort.column === column ? { column, descending: !sort.descending } : { column, descending: FIRST_DESCENDING.has(column) };
}

/** `sort`, unless its column is not among those `shown` (Messages with Phone calls picked, say): then by closeness. */
export function sortShown(sort: TableSort, shown: readonly Column[]): TableSort {
  return shown.includes(sort.column) ? sort : DEFAULT_SORT;
}

export interface TableFilter {
  /** The platform picked (tablePlatform.ts), or null for all. */
  platform?: string | null;
  /** The ids the Query bar's query matches, or null for no query. */
  only?: ReadonlySet<number> | null;
  hide: HideChoices;
  /** The search box's words. */
  search: string;
}

export interface FilteredRows {
  /** The people left, in no particular order (see sortRows). */
  rows: TablePerson[];
  /**
   * Rank by closeness among the people the query and Hide leave (the search aside): 1 closest, whoever you
   * lives with first (closenessRanks); missing with no score.
   */
  ranks: Map<number, number>;
  /** Hide's rows: every tag in `allTags`' order, then the rest (see hideEntries), counted over everyone the query leaves. */
  hideEntries: HideEntry[];
  /** Everyone on the platform picked (everyone with none), however else filtered, as on it (see onlyOn). */
  everyone: readonly TablePerson[];
}

/**
 * The people to show. The search finds people as find.ts does, by what
 * `names` (the name choice) shows. `allTags` is every tag in the tag table,
 * in its order, so Hide lists those nobody has too.
 */
export function filterRows(people: readonly TablePerson[], filter: TableFilter, names: FindNames = FULL_NAMES, allTags: readonly string[] = []): FilteredRows {
  const { only, platform } = filter;
  const onPlatform = platform ? people.flatMap((p) => onlyOn(p, platform)) : people;
  const queried = only ? onPlatform.filter((p) => only.has(p.id)) : onPlatform;
  const shown = queried.filter((p) => shownByHide(filter.hide, p.tags));
  const ranks = new Map(
    shown
      .filter((p) => livesTogether(p) || p.closeness > 0)
      .sort((a, b) => byCloseness(livesTogether(a), a.closeness, a.id, livesTogether(b), b.closeness, b.id))
      .map((p, i) => [p.id, i + 1]),
  );
  const words = findWords(filter.search);
  return {
    rows: words ? shown.filter((p) => finds(p, words, names)) : shown,
    ranks,
    hideEntries: hideEntries(queried, allTags),
    everyone: onPlatform,
  };
}

/** `person` as seen on `platform`: their counts there alone, or nothing without an account there. */
function onlyOn(person: TablePerson, platform: string): TablePerson[] {
  const counts = person.byPlatform.find((c) => c.platform === platform);
  if (!counts) return [];
  const { messageCount, directMessageCount, groupMessageCount, lastMessageAt }: PlatformCounts = counts;
  return [{ ...person, messageCount, directMessageCount, groupMessageCount, lastMessageAt }];
}

/** Every platform anyone has an account on, A to Z by `name` (what the picker shows). */
export function platformsIn(people: readonly TablePerson[], name: (platform: string) => string): string[] {
  const platforms = new Set(people.flatMap((p) => p.platforms));
  return [...platforms].sort((a, b) => collator.compare(name(a), name(b)));
}

/** What a column sorts by; null (empty) always sorts last, whichever way round. */
function sortKey(row: TablePerson, column: Column, names: FindNames): string | number | null {
  const text = (value: string) => value.trim() || null;
  switch (column) {
    case "name": return text(label(row, names));
    case "tags": return text(row.tags.join(", "));
    case "location": return row.location;
    case "platforms": return text(row.platforms.join(", "));
    case "messages": return row.messageCount;
    case "direct": return row.directMessageCount;
    // Whoever you live with has a closeness however low their score (sortRows puts them closest).
    case "closeness": return livesTogether(row) ? row.closeness : row.closeness || null;
    case "last": return row.lastMessageAt;
    case "firstContact": return row.firstContactAt;
    case "added": return row.addedAt;
    case "note": return names.hidden ? null : text(row.note);
    case "calls": return row.calls?.answered ?? null;
    case "callTime": return row.calls?.seconds ?? null;
    case "lastCall": return row.calls?.lastCallAt ?? null;
  }
}

function label(row: TablePerson, names: FindNames): string {
  return names.label(row).primary;
}

const collator = new Intl.Collator("en-AU", { sensitivity: "base", numeric: true });

function compare(a: string | number, b: string | number): number {
  return typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
}

/**
 * `rows` sorted by `sort`, ties by name (the unnamed last) then id, the name as
 * the name choice (`names`) shows it, so the order gives no name away: while
 * names are hidden (No name except…) by the names of those picked, everyone else
 * unnamed, last, and notes not at all. By closeness, whoever
 * you live with is closest of all, ahead of any score.
 */
export function sortRows(rows: readonly TablePerson[], sort: TableSort, names: FindNames = FULL_NAMES): TablePerson[] {
  const keyed = rows.map((row) => ({
    row,
    // By closeness, whoever you live with is closer than any score.
    together: sort.column === "closeness" && livesTogether(row),
    key: sortKey(row, sort.column, names),
    name: label(row, names),
  }));
  const direction = sort.descending ? -1 : 1;
  keyed.sort((a, b) => {
    if (a.together !== b.together) return (a.together ? 1 : -1) * direction;
    if (a.key !== b.key) {
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      const order = compare(a.key, b.key);
      if (order !== 0) return order * direction;
    }
    if (!a.name !== !b.name) return a.name ? -1 : 1;
    return collator.compare(a.name, b.name) || a.row.id - b.row.id;
  });
  return keyed.map((k) => k.row);
}

/**
 * The rows held in the order `ids` were in when you began changing locations here, each as `pool` (the
 * filter's `everyone`) has them now, whoever no longer matches the query, Hide or the search, or now sorts elsewhere,
 * included; anyone gone from the archive (merged away) is left out.
 */
export function heldRows(ids: readonly number[], pool: readonly TablePerson[]): TablePerson[] {
  const byId = new Map(pool.map((p) => [p.id, p]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Whether `location` is `value`, but for case. */
export function isLocation(location: string | null, value: string): boolean {
  return location !== null && sameLocation(location, value);
}

/** One choice in the Location cell's list: a value in use, one typed that nobody has, or none (clear it). */
export type LocationChoice =
  | { kind: "value"; value: string }
  | { kind: "new"; value: string }
  | { kind: "none" };

/**
 * The Location cell's list for `draft` (what is typed) over the values in use (`values`, the most used first): none,
 * when they have one and nothing is typed; the values holding what is typed, those starting with it first; and what
 * is typed, as the archive writes it, when no value is it but for case.
 */
export function locationChoices(values: readonly string[], draft: string, location: string | null): LocationChoice[] {
  const typed = writtenLocation(draft);
  if (!typed) return [...(location !== null ? [{ kind: "none" } as const] : []), ...values.map((value) => ({ kind: "value", value }) as const)];
  const lower = typed.toLowerCase();
  const holding = values.filter((v) => v.toLowerCase().includes(lower));
  const starting = holding.filter((v) => v.toLowerCase().startsWith(lower));
  const matches = [...starting, ...holding.filter((v) => !starting.includes(v))];
  return [
    ...matches.map((value) => ({ kind: "value", value }) as const),
    ...(values.some((v) => sameLocation(v, typed)) ? [] : [{ kind: "new", value: typed } as const]),
  ];
}

/** What picking `choice` sets the location to. */
export function chosenLocation(choice: LocationChoice): string | null {
  return choice.kind === "none" ? null : choice.value;
}
