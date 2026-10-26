// Every view of the map: Orbits 2D, the flat sky, hidden from the switcher
// for now (`hidden`) but still at /orbits; Orbits, the same sky as a solar
// system (at /orbits-3d; its slug, "orbits-3d", is the name its usage and
// settings are kept under); the same map in friend circles (Circles), the
// same map as a spider's web (Spider web), the City (the same closeness as a
// cyberspace city), the Table of everyone, the Calendar of every day and the
// Time river (messages, calls or hangouts over time, in the river's look),
// then the frozen views, which keep working on the same data but get no new
// work. The view switcher lists them in this order, the main views
// (MAIN_VIEWS: Orbits, the Spider web and the City) first, as a group of
// their own. No React here, so the server's usage report (npm run usage) can
// read the list too.
//
// The app opens on the Spider web (DEFAULT_VIEW): the bare address, /, which is
// no view's own, leads to it, as does any address that names no view.
//
// A view that reads more of the backend than the map (`needs`) is offered only
// where the backend's handshake says it serves that (src/contract/handshake.ts).
//
// The demo (demoMode.ts) is two of this list's views again, on a made-up
// crowd: Orbits (at /orbits-3d) and the Spider web; under /demo in the app
// (/demo/orbits-3d, /demo/spider, /demo itself leading to its Spider web), and
// at the root of the static demo's own site.
// It offers the views in DEMO_VIEWS, so a view added here is in the demo only
// once it is added there too.

import type { Capability } from "./archive.ts";
import { offers } from "./contract/handshake.ts";

export interface ViewInfo {
  /** The name usage is recorded under. */
  slug: string;
  path: string;
  title: string;
  /** Frozen: kept as it is, not extended; see AGENTS.md. */
  frozen: boolean;
  /** Left out of the view switcher, though its address still opens it. */
  hidden?: boolean;
  /** What of the data contract it reads beside `map` (archive.ts, CAPABILITIES): a backend without them has no such view. */
  needs?: readonly Capability[];
  /**
   * Drawn dark whatever the page's look (theme.ts, lookOf): the night scenes (Orbits 3D and the City, drawn from the
   * night's palette and their own colours), and the views whose own sheets are the night's alone (the Time river, and
   * the frozen views).
   */
  night?: boolean;
}

export const VIEWS: ViewInfo[] = [
  { slug: "orbits", path: "/orbits", title: "Orbits 2D", frozen: false, hidden: true },
  { slug: "orbits-3d", path: "/orbits-3d", title: "Orbits", frozen: false, night: true },
  { slug: "circles", path: "/circles", title: "Circles", frozen: false },
  { slug: "web", path: "/spider", title: "Spider web", frozen: false },
  { slug: "city", path: "/city", title: "City", frozen: false, night: true },
  { slug: "table", path: "/table", title: "Table", frozen: false, needs: ["table", "scores"] },
  { slug: "calendar", path: "/calendar", title: "Calendar", frozen: false, needs: ["calendar"] },
  { slug: "time-river", path: "/time-river", title: "Time river", frozen: false, needs: ["river"], night: true },
  { slug: "river", path: "/river", title: "The river", frozen: true, night: true },
  { slug: "reciprocity", path: "/reciprocity", title: "Reciprocity", frozen: true, night: true },
];

/** The main views, listed first in the switcher, under "Main views", each naming as many as its own Show top names says (topNames.ts). */
export const MAIN_VIEWS: readonly string[] = ["orbits", "orbits-3d", "web", "city"];

/** The views the demo offers, in this list's order: Orbits (the solar system, at /orbits-3d) and the Spider web, both main views. */
export const DEMO_VIEWS: readonly string[] = ["orbits-3d", "web"];

/** The view the app opens on, at its bare address and at any that names no view: the Spider web, in the demo too. */
export const DEFAULT_VIEW = "web";

/** The views a page offers: the demo's (`demo`), or every one; either way, only those whose backend serves what they read (`offered`). */
export function viewsFor(demo: boolean, offered: (capability: Capability) => boolean = offers): ViewInfo[] {
  return (demo ? VIEWS.filter((view) => DEMO_VIEWS.includes(view.slug)) : VIEWS).filter((view) => (view.needs ?? []).every(offered));
}

/** Where the demo is in the app: its Orbits, and every other view under it. The static demo's are at the root of its own site. */
export const DEMO_ROOT = "/demo";

/** The demo's page in the real app's switcher, opened as a page of its own; the demo's switcher has none. */
export const DEMO_PAGE: Pick<ViewInfo, "slug" | "path" | "title"> = { slug: "demo", path: DEMO_ROOT, title: "Demo" };

/** Whether `pathname` is one of the demo's pages. */
export function inDemo(pathname: string): boolean {
  return pathname === DEMO_ROOT || pathname.startsWith(`${DEMO_ROOT}/`);
}

/**
 * A view's address in the demo (`demo` true) or in the real app: in the app's demo /demo/orbits for Orbits and
 * /demo/city for the City; with `root` "" (the static demo's own site), /orbits and /city, as in the app.
 */
export function viewPath(view: Pick<ViewInfo, "path">, demo: boolean, root: string = DEMO_ROOT): string {
  return demo ? `${root}${view.path}` : view.path;
}

/**
 * The view at `pathname` among `views` (every view, unless a page offers fewer), in the real app or the demo; undefined
 * for an address that names none.
 */
export function viewAt(pathname: string, views: readonly ViewInfo[] = VIEWS): ViewInfo | undefined {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const path = inDemo(trimmed) ? trimmed.slice(DEMO_ROOT.length) || "/" : trimmed;
  return views.find((view) => view.path === path);
}

/**
 * Where an address that is no view's own leads: the bare address, /, and the
 * demo's, /demo, to the view the app opens on (DEFAULT_VIEW); the demos moved
 * from /demos/<slug> to /<slug>, and the list of demos gave way to the
 * switcher; the Web is now the Spider web, so /web leads to /spider (and
 * /demo/web to /demo/spider; its slug is still "web", the name its usage is
 * kept under); the canvas (/canvas), the Time machine (/time-machine),
 * Constellations (/constellations) and Friend galaxies (/galaxies) are
 * retired, so their addresses lead to the default view.
 * Null when the address is current.
 */
export function movedPath(pathname: string): string | null {
  const home = VIEWS.find((view) => view.slug === DEFAULT_VIEW)!.path;
  const root = /^(\/demo)?\/?$/.exec(pathname);
  if (root) return `${root[1] ?? ""}${home}`;
  if (/^\/(canvas|time-machine|constellations|galaxies)\/?$/.test(pathname)) return home;
  const web = /^(\/demo)?\/web\/?$/.exec(pathname);
  if (web) return `${web[1] ?? ""}/spider`;
  const match = /^\/demos(?:\/([^/]*))?\/?$/.exec(pathname);
  if (!match) return null;
  return VIEWS.find((view) => view.slug === match[1])?.path ?? home;
}

/** Where an older address now lives (movedPath), its query and hash kept, so /web?colour=3dff9a opens the Spider web in that colour; null when it is current. */
export function movedAddress(at: Pick<Location, "pathname" | "search" | "hash">): string | null {
  const moved = movedPath(at.pathname);
  return moved === null ? null : `${moved}${at.search}${at.hash}`;
}
