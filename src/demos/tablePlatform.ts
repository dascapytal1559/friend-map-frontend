// The Table's platform picker: all platforms (null, the default) or one, by
// its archive name ("whatsapp"), remembered in this browser apart from the
// query. With one picked the Table lists only people with an account there,
// and their Messages, Direct and Last message count that platform alone
// (filterRows in table.ts); with Phone calls, answered calls, call time and
// last call stand in for them (columnsFor in Table.tsx). Without storage (a private window, blocked site
// data) the choice lasts until the page is reloaded.

import { useState } from "react";

const KEY = "friend-map.tablePlatform";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

/** The remembered platform, or null for all of them. */
export function loadTablePlatform(storage: () => Storage | undefined = browserStorage): string | null {
  try {
    return storage()?.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function saveTablePlatform(platform: string | null, storage: () => Storage | undefined = browserStorage): void {
  try {
    if (platform) storage()?.setItem(KEY, platform);
    else storage()?.removeItem(KEY);
  } catch {
    // Not kept: the choice lasts until the page is reloaded.
  }
}

/** The picked platform (null for all) and its setter, which remembers it. */
export function useTablePlatform(): [string | null, (platform: string | null) => void] {
  const [platform, setPlatform] = useState(() => loadTablePlatform());
  return [platform, (next) => {
    saveTablePlatform(next);
    setPlatform(next);
  }];
}
