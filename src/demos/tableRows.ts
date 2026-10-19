// What the Table lists, its tab: people (the default), catch-ups (CatchUpsTable.tsx) or calls (CallsTable.tsx),
// chosen with the tabs at the top of its header. The address says which, always (?tab=people, ?tab=hangouts,
// ?tab=calls), so a link or a reload opens the same tab; choosing one writes it in place (replaceState, no new
// history entry). An address that says none (the view switcher's /table) opens the tab last chosen in this
// browser and writes it in. Without storage (a private window, blocked site data) that is People.

import { useEffect, useSyncExternalStore } from "react";
import { HANGOUT } from "../eventWords.ts";

export type TableRows = "people" | "catch-ups" | "calls";

/** The tabs, in order, each with the word the address and the tab use for it. */
export const TABLE_TABS: readonly { rows: TableRows; param: string; title: string }[] = [
  { rows: "people", param: "people", title: "People" },
  { rows: "catch-ups", param: HANGOUT.many, title: HANGOUT.Many },
  { rows: "calls", param: "calls", title: "Calls" },
];

const KEY = "friend-map.tableRows";

/** The address's query parameter that names the tab. */
export const TAB_PARAM = "tab";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

/** The remembered choice: people unless catch-ups or calls were chosen. */
export function loadTableRows(storage: () => Storage | undefined = browserStorage): TableRows {
  try {
    const kept = storage()?.getItem(KEY);
    return TABLE_TABS.find((tab) => tab.rows === kept)?.rows ?? "people";
  } catch {
    return "people";
  }
}

export function saveTableRows(rows: TableRows, storage: () => Storage | undefined = browserStorage): void {
  try {
    storage()?.setItem(KEY, rows);
  } catch {
    // Not kept: the choice lasts until the page is reloaded.
  }
}

/** The tab an address's query names, or null when it names none it knows. */
export function tabInSearch(search: string): TableRows | null {
  const raw = new URLSearchParams(search).get(TAB_PARAM);
  return TABLE_TABS.find((tab) => tab.param === raw)?.rows ?? null;
}

/** The query with the tab written in, the rest of it kept. */
export function searchWithTab(search: string, rows: TableRows): string {
  const params = new URLSearchParams(search);
  params.set(TAB_PARAM, TABLE_TABS.find((tab) => tab.rows === rows)!.param);
  return `?${params.toString()}`;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  globalThis.addEventListener?.("popstate", listener);
  return () => {
    listeners.delete(listener);
    globalThis.removeEventListener?.("popstate", listener);
  };
}

const inAddress = (): TableRows | null => tabInSearch(globalThis.location?.search ?? "");

/** Writes the tab into the address in place, and tells whoever listens. */
function writeTab(rows: TableRows): void {
  const at = globalThis.location;
  if (at && globalThis.history?.replaceState) {
    const search = searchWithTab(at.search, rows);
    if (search !== at.search) globalThis.history.replaceState(globalThis.history.state, "", `${at.pathname}${search}${at.hash}`);
  }
  for (const listener of listeners) listener();
}

/** What the Table lists, and its setter, which writes it into the address and remembers it. */
export function useTableRows(): [TableRows, (rows: TableRows) => void] {
  const addressed = useSyncExternalStore(subscribe, inAddress, inAddress);
  const shown = addressed ?? loadTableRows();
  // An address that names no tab is given the one shown.
  useEffect(() => {
    if (addressed === null) writeTab(shown);
  }, [addressed, shown]);
  return [shown, (next) => {
    saveTableRows(next);
    writeTab(next);
  }];
}
