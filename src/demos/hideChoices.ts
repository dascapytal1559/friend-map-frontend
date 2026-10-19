// Which of your tags Hide leaves out: the Hide button at the end of
// the Table's Query bar (HidePanel.tsx), and in the Calendar's header, with a
// switch per tag. The map views have no Hide of their own: they follow the
// Table's choices, changed only there. It applies after the query: a person with any
// tag switched on in Hide is left out of the view and its count.
//
// "archive" and "commercial" start on, and are listed even when nobody here
// has them (yet), so they take effect as soon as someone does; every other tag
// starts off. "archive" is everyone archived, by you or by the
// automatic rules: one archive. Hide is the last gate after the query, which
// runs over everyone: unticking "archive" shows the query's archived matches.
// The map loads archived people only once it is unticked (they are most of the
// archive), so until then that row is not counted there. The map lists the
// tags in use, most used first; the Table and the Calendar every tag in the
// tag table, in its order; then, in all, either of the two not listed yet. The
// choices are kept per browser, the Table's (which the maps follow) apart from the Calendar's; without storage (a private
// window, blocked site data) they last until the page is reloaded. Choices
// kept from before there was one archive carry over (loadHideChoices): the
// rules' old "system-archive" switch folds into "archive". Renaming a tag in
// the Table's tag manager carries its switch over, in every view's
// (renameStoredHidden).

import { ARCHIVE_TAG, SYSTEM_ARCHIVE_TAG } from "../archive.ts";
import { keptAs } from "../demoMode.ts";
import type { ViewScope } from "./queryBar.ts";

/** The tags Hide starts with on, listed whether or not anyone has them (the archive keeps them listed with its own copy, in server/archive/tags.ts). */
export const HIDDEN_BY_DEFAULT: readonly string[] = [ARCHIVE_TAG, "commercial"];

/** Hide's switches set by hand: true hides people with the tag. A tag not set is on only if HIDDEN_BY_DEFAULT has it. */
export type HideChoices = Readonly<Record<string, boolean>>;

/** Whose Hide choices: the Table's, which the map views follow too, or the Calendar's. */
export type HideScope = Exclude<ViewScope, "map"> | "calendar";

/** Where each view's choices are kept: apart in demo mode, whose tags are the made-up crowd's. */
export const HIDE_KEYS: Record<HideScope, string> = {
  table: keptAs("friend-map.table.hide"),
  calendar: keptAs("friend-map.calendar.hide"),
};

/** Whether `choices` shows archived people ("archive" switched off), for the map to load them. */
export function revealsArchived(choices: HideChoices): boolean {
  return !hides(choices, ARCHIVE_TAG);
}

/**
 * Where the old Filter and Hide panels kept their choices, and whether they
 * were folded, and the maps' own Hide from before they followed the Table's. Nothing reads them: they are cleared, so Hide starts from its
 * defaults rather than from an older selection.
 */
const OLD_KEYS = ["friend-map.tags", "friend-map.table.tags", "friend-map.tagPanels", keptAs("friend-map.hide")];

/** Whether a tag's switch is on. */
export function hides(choices: HideChoices, tag: string): boolean {
  return choices[tag] ?? HIDDEN_BY_DEFAULT.includes(tag);
}

/** The tags switched on: those set on by hand, then those on by default and not set. */
export function hiddenTags(choices: HideChoices): string[] {
  const set = Object.keys(choices).filter((tag) => choices[tag]);
  return [...set, ...HIDDEN_BY_DEFAULT.filter((tag) => !(tag in choices))];
}

/** Whether someone with these tags is shown: none of them is on in Hide. */
export function shownByHide(choices: HideChoices, tags: readonly string[]): boolean {
  return !tags.some((tag) => hides(choices, tag));
}

/** One tag's row in Hide: how many people have it (before any switch; null when they are not loaded to count). Its switch is in the choices. */
export interface HideEntry {
  tag: string;
  count: number | null;
}

/**
 * Hide's rows for these people: given `all` (the tag table's names, in its
 * order), every one of those, even with nobody here; then any other tag in
 * use, most used first; then any of HIDDEN_BY_DEFAULT not listed yet, in its
 * order, so ticking one (which loads or drops people) never moves its row.
 * `uncounted` are tags whose people are not among `people` to count.
 */
export function hideEntries(
  people: ReadonlyArray<{ tags: readonly string[] }>,
  all: readonly string[] = [],
  uncounted: readonly string[] = [],
): HideEntry[] {
  const counts = new Map<string, number>();
  for (const person of people) for (const tag of new Set(person.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const others = [...counts].filter(([tag]) => !all.includes(tag) && !HIDDEN_BY_DEFAULT.includes(tag)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
  const listed = [...all, ...others];
  return [...listed, ...HIDDEN_BY_DEFAULT.filter((tag) => !listed.includes(tag))]
    .map((tag) => ({ tag, count: uncounted.includes(tag) ? null : counts.get(tag) ?? 0 }));
}

/** Hide's rows with nobody loaded to count (the map before anything has shown): every tag in `choices`, then the defaults. */
export function uncountedEntries(choices: HideChoices): HideEntry[] {
  const tags = Object.keys(choices);
  return hideEntries([], tags, [...tags, ...HIDDEN_BY_DEFAULT]);
}

/** `choices` with one tag switched on or off. */
export function chooseHide(choices: HideChoices, tag: string, on: boolean): HideChoices {
  return { ...choices, [tag]: on };
}

/** `choices` with every row switched on or off (Select all / Unselect all). */
export function chooseAllHide(choices: HideChoices, entries: readonly HideEntry[], on: boolean): HideChoices {
  return entries.reduce((next, entry) => chooseHide(next, entry.tag, on), choices);
}

/**
 * `choices` after a tag is renamed `from` to `to`: its switch goes with it; or,
 * when `to` was a tag already (`merged`), it goes, and `to` keeps its own.
 */
export function renameHidden(choices: HideChoices, from: string, to: string, merged = false): HideChoices {
  if (!(from in choices)) return choices;
  const { [from]: on, ...rest } = choices;
  return merged ? rest : { ...rest, [to]: on };
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

/** A view's remembered choices, or none (the defaults) when there are none or they cannot be read. */
export function loadHideChoices(key: string, storage: () => Storage | undefined = browserStorage): HideChoices {
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(key) ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return oneArchive(Object.fromEntries(Object.entries(saved).filter(([, on]) => typeof on === "boolean")));
  } catch {
    return {};
  }
}

/**
 * Choices kept from before there was one archive, as they are now. The rules'
 * old row, "system-archive", folds into "archive": it stays shown only if both
 * were unticked (anything else would bring back people you still hid).
 * "spam", on by default then and a tag no more, goes, so a "spam" tag made
 * later starts off as any new tag does. Choices without either are kept as they are.
 */
export function oneArchive(choices: HideChoices): HideChoices {
  if (!(SYSTEM_ARCHIVE_TAG in choices) && !("spam" in choices)) return choices;
  const { [SYSTEM_ARCHIVE_TAG]: rules, spam: _spam, ...rest } = choices;
  return rules === undefined ? rest : { ...rest, [ARCHIVE_TAG]: hides(rest, ARCHIVE_TAG) || rules };
}

export function saveHideChoices(key: string, choices: HideChoices, storage: () => Storage | undefined = browserStorage): void {
  try {
    storage()?.setItem(key, JSON.stringify(choices));
  } catch {
    // Not kept: the choices last until the page is reloaded.
  }
}

/** Clears what the old Filter and Hide panels kept in this browser (OLD_KEYS). */
export function forgetOldPanels(storage: () => Storage | undefined = browserStorage): void {
  try {
    for (const key of OLD_KEYS) storage()?.removeItem(key);
  } catch {
    // Nothing to clear without storage.
  }
}

/** Carries a renamed tag's remembered switch over in every view's choices in this browser (see renameHidden). */
export function renameStoredHidden(from: string, to: string, merged: boolean, storage: () => Storage | undefined = browserStorage): void {
  for (const key of Object.values(HIDE_KEYS)) {
    // Only choices this browser has made: nothing is written where there were none.
    try {
      if (storage()?.getItem(key) == null) continue;
    } catch {
      continue;
    }
    saveHideChoices(key, renameHidden(loadHideChoices(key, storage), from, to, merged), storage);
  }
}
