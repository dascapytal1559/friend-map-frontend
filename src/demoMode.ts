// The demo: the app's map views (DEMO_VIEWS in views.ts) over a made-up crowd
// (src/demo/), for showing friend-map to someone without showing them anyone
// real. It is its own app beside the real one: its own header and view
// switcher, and no way into the real map from inside it. It lives in two
// places, the same pages in both: at /demo and /demo/<view> in the app (the
// real app's switcher links to it, as a page of its own), and as the static
// demo (npm run build:demo), plain files at the root of a site of their own,
// with no server behind them at all.
//
// Which app a page is comes from how it was built (the static demo) or else
// from its address, read once as it opens, so the archive is chosen before
// anything draws (pageArchive.ts): the server's in the real app, the made-up
// crowd held in the page in the demo. Moving between the two is always a new
// page load, so nothing real is ever in a demo page's memory. The demo is
// read-only and asks the server for nothing of yours: no archive, no
// media, no live updates, no settings, no model and no usage record. The one
// thing of yours it has is what every page is served: your saved view settings
// (savedSettings.ts, the Spider web's as numbers and choices), which its own
// start at (savedStore.ts), built into the static demo.

import { appPath } from "./mount.ts";
import { DEMO_ROOT, inDemo } from "./views.ts";

/**
 * Where the old Demo switch kept demo mode on, per browser, before the demo
 * moved to /demo. It means nothing now and is cleared (forgetOldDemoMode), so
 * a browser that left it on opens the real app as the real app.
 */
export const OLD_DEMO_MODE_KEY = "friend-map.demo";

type Storage = Pick<globalThis.Storage, "removeItem">;

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/** Whether this page is the static demo's: built as it (vite.demo.config.ts), the demo alone at the root of its own site. */
export const staticDemo: boolean = import.meta.env?.MODE === "static-demo";

/** Whether this page is the demo's: the static demo's, or in the app read once from its address as it opens. */
export const demoMode: boolean = staticDemo || inDemo(appPath(globalThis.location?.pathname ?? "/"));

/** Where the demo's views are: under /demo in the app, at the root of the static demo's own site. */
export const demoRoot: string = staticDemo ? "" : DEMO_ROOT;

/** Clears the old Demo switch's choice, if it was ever made in this browser. */
export function forgetOldDemoMode(storage: () => Storage | undefined = browserStorage): void {
  try {
    storage()?.removeItem(OLD_DEMO_MODE_KEY);
  } catch {
    // Nothing kept, so nothing to forget.
  }
}

/**
 * Where a choice you make in the page is kept: apart in the demo, for
 * the ones that hold your own words (the Query bar's query and the
 * words it came from, Hide's tags), so the demo never shows them and leaves
 * them as they were.
 */
export function keptAs(key: string, demo: boolean = demoMode): string {
  return demo ? `${key}@demo` : key;
}
