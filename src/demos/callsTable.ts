// The Table's Calls (CallsTable.tsx): every call (GET /api/archive/calls,
// ListedCall) as a row, sorted by when (the newest first, to start with), who,
// the app, whether it was answered, its length or its note; kept
// to the calls with someone the Query bar and Hide leave in, on the app
// picked; and found by the header's search box by anyone on it (name or
// alias) or by its note, as the Hangouts are (catchUpsTable.ts): while names
// are hidden (No name except…) by the names of those picked alone. What each
// cell says is worked out here too, and what deleting a logged call names.
// Pure functions, no DOM.

import type { CallAnswer, CallRef, GroupPerson, ListedCall } from "../archive.ts";
import { callDuration, callPlatformName } from "../calls.ts";
import { goesBy, holds } from "../names.ts";
import { findWords, type FindNames } from "./find.ts";

export type CallColumn = "at" | "who" | "app" | "answered" | "length" | "note";

export interface CallSort {
  column: CallColumn;
  descending: boolean;
}

export const CALL_SORT: CallSort = { column: "at", descending: true };

/** The columns that start biggest or newest first; the rest start A to Z. */
const FIRST_DESCENDING: ReadonlySet<CallColumn> = new Set(["at", "length"]);

/** The sort after clicking `column`'s header: the other way round if it is already sorted by, else as the column starts. */
export function nextCallSort(sort: CallSort, column: CallColumn): CallSort {
  return sort.column === column ? { column, descending: !sort.descending } : { column, descending: FIRST_DESCENDING.has(column) };
}

/** A call's key, the same each time the list loads: its kind and number (CallRef). */
export function callKey(call: { ref: CallRef }): string {
  return `${call.ref.kind}:${call.ref.id}`;
}

/**
 * A call you logged, as deleting it names it in the change chip (deleteCall): its group by one of its
 * numbers, and everyone on it; null for an imported call, which is not deleted here.
 */
export function loggedToDelete(call: ListedCall): { id: number; at: number; durationSeconds: number; platform: string; people: number } | null {
  if (call.ref.kind !== "logged") return null;
  return { id: call.ref.id, at: call.at, durationSeconds: call.durationSeconds ?? 0, platform: call.platform, people: call.people.length + call.others };
}

/** The app a call was on, as the Table names it: the call history's "Phone" or "FaceTime", else the app ("WhatsApp"). */
export function callApp(call: Pick<ListedCall, "platform" | "service">): string {
  if (call.platform === "phone") return call.service === "facetime-audio" || call.service === "facetime-video" ? "FaceTime" : "Phone";
  return callPlatformName(call.platform);
}

/** "video" or "audio" when its source says (FaceTime's, an app's in no chat); else null. */
export function callMedium(call: Pick<ListedCall, "service">): "video" | "audio" | null {
  return call.service === "facetime-video" || call.service === "video" ? "video" : call.service === "facetime-audio" ? "audio" : null;
}


/** Where a call comes from, for its tooltip. */
export function sourceHint(call: Pick<ListedCall, "source">): string {
  return {
    history: "from the phone's call history",
    app: "from the app's list of calls",
    record: "a call record in your chat with them",
    logged: "you logged it",
  }[call.source];
}

/** Whether you entered a call's length yourself: one you gave a call record, or one you logged; the cell marks it with a pencil. */
export function lengthByHand(call: Pick<ListedCall, "length">): boolean {
  return call.length === "given" || call.length === "logged";
}

/** "Yes" or "No", whichever way it went, or empty when not known. */
export function answeredLabel(call: Pick<ListedCall, "answered">): "Yes" | "No" | "" {
  return call.answered === null ? "" : call.answered ? "Yes" : "No";
}

/** Whether it was answered, in words for a tooltip. */
function answeredWords(answered: boolean): string {
  return answered ? "it was answered" : "it was not answered";
}

/**
 * Whether a call was answered (`answered`, null for not known) as you pick it in the Answered cell: No is
 * "missed" whichever way the call went, the one value kept for a call not answered.
 */
export function callAnswer(answered: boolean | null): CallAnswer {
  return answered === null ? "unknown" : answered ? "answered" : "missed";
}

/**
 * Whose a call's Answered is, for its cell's tooltip: yours (with what its source says), its source's, or, for
 * one you logged, yours.
 */
export function answeredHint(call: Pick<ListedCall, "answered" | "answeredSet" | "sourceAnswered" | "source" | "platform" | "service">): string {
  if (call.source === "logged") return "You logged it, so it was answered";
  const app = callApp(call);
  const says = { history: "The phone's call history", app: `${app}'s list of calls`, record: `${app}'s own record of the call` }[call.source];
  const sourceSays = call.sourceAnswered === null ? `${says} does not say` : `${says} says ${answeredWords(call.sourceAnswered)}`;
  return call.answeredSet ? `You said ${call.answered === null ? "it is not known" : answeredWords(call.answered)}. ${sourceSays}` : `${sourceSays}. Pick another to say otherwise; it counts toward closeness as you say`;
}

/** Its length as the cell shows it: "25 min"; null when not known, and for one never answered (nothing to say). */
export function lengthLabel(call: Pick<ListedCall, "durationSeconds" | "answered">): string | null {
  return call.durationSeconds === null || call.answered === false ? null : callDuration(call.durationSeconds);
}

/**
 * Whose a call's length is, for the cell's tooltip: its source's (its app's own record, or the phone's call history),
 * yours, or not known (and whether you may give it one here); a missed call has none.
 */
export function lengthHint(call: Pick<ListedCall, "length" | "lengthEditable" | "source" | "platform" | "service" | "answered">): string {
  const app = callApp(call);
  if (call.answered === false) return "Not answered, so it has no length";
  switch (call.length) {
    case "source":
      return call.source === "history" ? "From the phone's call history, as it is" : `From ${app}'s own record of the call, as it is`;
    case "given":
      return `Logged by hand, as ${app} does not say`;
    case "logged":
      return "Logged by hand";
    case null:
      return call.lengthEditable ? `${app} does not say how long it was: give it a length, and it counts toward closeness`
        : `${app} does not say how long it was`;
  }
}

/** Who the calls name, by person id (the Table's people). */
export type CallPeople = ReadonlyMap<number, GroupPerson>;

/** What the calls are kept to: those with someone in `shown` (the query and Hide's people; null for everyone), on `app` (null for any), found by `search`. */
export interface CallFilter {
  shown: ReadonlySet<number> | null;
  app: string | null;
  search: string;
}

/**
 * The calls `filter` keeps: with someone it shows, on its app, and found by its search, which finds anyone on one who
 * goes by it, or its note holding it; while names are hidden (No name except…), anyone on one who is picked and whose
 * name holds it. A call whose people are all unknown to the Table goes with a query or Hide, as nobody shown is on it.
 */
export function filterCalls(list: readonly ListedCall[], filter: CallFilter, people: CallPeople, names: FindNames): ListedCall[] {
  const words = findWords(filter.search);
  const on = (call: ListedCall) => call.people.flatMap((id) => people.get(id) ?? []);
  return list.filter((call) => {
    if (filter.shown && !call.people.some((id) => filter.shown!.has(id))) return false;
    if (filter.app !== null && callApp(call) !== filter.app) return false;
    if (!words) return true;
    if (names.hidden) return on(call).some((p) => holds(names.label(p).primary, words));
    return on(call).some((p) => goesBy(p.name, p.aliases, words)) || holds(call.note, words);
  });
}

/** Every app the calls were on, A to Z (callApp), for the picker. */
export function appsIn(list: readonly ListedCall[]): string[] {
  return [...new Set(list.map(callApp))].sort((a, b) => a.localeCompare(b));
}

/**
 * `list` sorted by `sort`, empty cells always last (no one named, no length, no note); calls the same
 * in the column go newest first. Who sorts by the first named on each as `label` names them (the name choice), A to
 * Z; Answered as Yes, No, those not known (empty) last.
 */
export function sortCalls(list: readonly ListedCall[], sort: CallSort, label: (call: ListedCall) => string): ListedCall[] {
  const sign = sort.descending ? -1 : 1;
  const newest = (a: ListedCall, b: ListedCall) => b.at - a.at || callKey(a).localeCompare(callKey(b));
  const value = (call: ListedCall): number | string | null => {
    switch (sort.column) {
      case "at": return call.at;
      case "who": return label(call) || null;
      case "app": return callApp(call);
      case "answered": return call.answered === null ? null : call.answered ? 0 : 1;
      case "length": return call.durationSeconds;
      case "note": return call.note || null;
    }
  };
  const keyed = list.map((call) => ({ call, value: value(call) }));
  keyed.sort((a, b) => {
    if (a.value === null || b.value === null) return a.value === b.value ? newest(a.call, b.call) : a.value === null ? 1 : -1;
    const order = typeof a.value === "number" ? a.value - (b.value as number) : a.value.localeCompare(b.value as string);
    return sign * order || newest(a.call, b.call);
  });
  return keyed.map((k) => k.call);
}

/** The calls of `keys` (callKey) as they are now in `pool`, in that order: the rows held while calls are being changed. */
export function heldCalls(keys: readonly string[], pool: readonly ListedCall[]): ListedCall[] {
  const byKey = new Map(pool.map((call) => [callKey(call), call]));
  return keys.flatMap((key) => byKey.get(key) ?? []);
}
