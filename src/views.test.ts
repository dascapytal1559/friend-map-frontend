import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DEFAULT_VIEW, DEMO_VIEWS, movedAddress, movedPath, viewAt, VIEWS, viewsFor } from "./views.ts";

it("lists the main view first, then Orbits 3D, Circles, the Spider web, the City, the Table, the Calendar and the Time river, then the frozen views", () => {
  expect(VIEWS.filter((v) => !v.frozen).map((v) => v.slug)).toEqual(["orbits", "orbits-3d", "circles", "web", "city", "table", "calendar", "time-river"]);
  expect(VIEWS.slice(0, 8).every((v) => !v.frozen)).toBe(true);
  expect(VIEWS.filter((v) => v.frozen).map((v) => v.slug)).toEqual(["river", "reciprocity"]);
  expect(viewAt("/orbits")?.slug).toBe("orbits");
  // The solar system is Orbits; the flat sky, Orbits 2D, is hidden from the switcher for now but still at /orbits.
  expect(VIEWS.filter((v) => v.title.startsWith("Orbits")).map((v) => [v.slug, v.path, v.title, v.hidden ?? false])).toEqual([
    ["orbits", "/orbits", "Orbits 2D", true],
    ["orbits-3d", "/orbits-3d", "Orbits", false],
  ]);
  // The bare address is no view's own: it leads to the Spider web (movedPath), and the page falls back to it.
  expect(viewAt("/")).toBeUndefined();
  expect(viewAt("/river/")?.slug).toBe("river");
  expect(viewAt("/orbits-3d")?.slug).toBe("orbits-3d");
  expect(viewAt("/circles")?.slug).toBe("circles");
  expect(viewAt("/spider")?.slug).toBe("web");
  // The app holds no demo, so an old /demo address is no view (the server sends it to the public demo, server/oldDemo.ts).
  expect(viewAt("/demo/spider")).toBeUndefined();
  expect(viewAt("/table")?.slug).toBe("table");
  expect(viewAt("/city")?.slug).toBe("city");
  expect(viewAt("/calendar")?.slug).toBe("calendar");
  expect(viewAt("/time-river")?.slug).toBe("time-river");
  // Not in the demo, which has no Time river.
  expect(viewAt("/time-river", viewsFor(true))).toBeUndefined();
  expect(viewAt("/nowhere")).toBeUndefined();
});

it("opens on the Spider web at the bare address, keeping the query asked for", () => {
  expect(DEFAULT_VIEW).toBe("web");
  expect(movedPath("/")).toBe("/spider");
  expect(movedAddress({ pathname: "/", search: "?colour=amber", hash: "" })).toBe("/spider?colour=amber");
  // An address that names a view still opens it.
  for (const path of ["/orbits", "/city", "/spider"]) expect([path, movedPath(path)]).toEqual([path, null]);
  // An old /demo address is the server's to send on (server/oldDemo.ts), not the page's.
  for (const path of ["/demo", "/demo/spider"]) expect([path, movedPath(path)]).toEqual([path, null]);
});

it("sends the old demo addresses, and the retired canvas, Time machine, Constellations and Friend galaxies, to where the views are now", () => {
  expect(movedPath("/demos")).toBe("/spider");
  expect(movedPath("/demos/")).toBe("/spider");
  expect(movedPath("/demos/orbits")).toBe("/orbits");
  expect(movedPath("/demos/time-machine")).toBe("/spider");
  expect(movedPath("/time-machine")).toBe("/spider");
  expect(movedPath("/time-machine/")).toBe("/spider");
  expect(movedPath("/demos/river/")).toBe("/river");
  expect(movedPath("/demos/unknown")).toBe("/spider");
  expect(movedPath("/canvas")).toBe("/spider");
  expect(movedPath("/canvas/")).toBe("/spider");
  expect(movedPath("/constellations")).toBe("/spider");
  expect(movedPath("/galaxies/")).toBe("/spider");
  expect(movedPath("/demos/galaxies")).toBe("/spider");
  expect(movedPath("/river")).toBeNull();
});

it("sends the Web's old addresses to the Spider web, keeping the colour asked for", () => {
  expect(movedPath("/web")).toBe("/spider");
  expect(movedPath("/web/")).toBe("/spider");
  expect(movedPath("/demos/web")).toBe("/spider");
  expect(movedPath("/spider")).toBeNull();
  expect(movedPath("/webs")).toBeNull();
  expect(movedAddress({ pathname: "/web", search: "?colour=3dff9a", hash: "" })).toBe("/spider?colour=3dff9a");
  expect(movedAddress({ pathname: "/web/", search: "?colour=3dff9a", hash: "#x" })).toBe("/spider?colour=3dff9a#x");
  expect(movedAddress({ pathname: "/spider", search: "?colour=3dff9a", hash: "" })).toBeNull();
  expect(viewAt(movedPath("/web")!)?.title).toBe("Spider web");
});

it("has the static demo's site send /web and /demo/web to /spider before any other rule", () => {
  // Cloudflare Pages' _redirects: one rule a line, "from to status", the first match taken.
  const rules = readFileSync(new URL("./demo/public/_redirects", import.meta.url), "utf8")
    .split("\n").filter((line) => line.trim() && !line.startsWith("#")).map((line) => line.trim().split(/\s+/));
  const first = (from: string) => rules.find(([rule]) => rule === from || (rule.endsWith("/*") && from.startsWith(rule.slice(0, -1))));
  for (const from of ["/web", "/web/", "/demo/web", "/demo/web/"]) expect(first(from)).toEqual([from, "/spider", "301"]);
  expect(first("/demo/city")).toEqual(["/demo/*", "/:splat", "301"]);
});

it("offers in the demo Orbits (the solar system, at /orbits-3d) and the Spider web, at the root of the static demo's site", () => {
  const demo = viewsFor(true);
  expect(demo.map((v) => [v.slug, v.title])).toEqual([["orbits-3d", "Orbits"], ["web", "Spider web"]]);
  expect(DEMO_VIEWS.every((slug) => VIEWS.some((v) => v.slug === slug))).toBe(true);
  expect(viewsFor(false)).toEqual(VIEWS);
  expect(demo.map((v) => v.path)).toEqual(["/orbits-3d", "/spider"]);
  expect(viewAt("/orbits-3d/", demo)?.slug).toBe("orbits-3d");
  expect(viewAt("/spider", demo)?.slug).toBe("web");
  // The views it does not offer are no view there, so its page shows the Spider web.
  for (const view of ["orbits", "table", "calendar", "circles", "city", "river", "reciprocity", "time-river"]) {
    expect([view, viewAt(`/${view}`, demo)]).toEqual([view, undefined]);
  }
});

it("offers a view only where the backend serves what it reads beside the map: the Table, the Calendar and the Time river", () => {
  const map = (capability: string) => capability === "map";
  expect(viewsFor(false, map).map((v) => v.slug)).toEqual(VIEWS.filter((v) => !["table", "calendar", "time-river"].includes(v.slug)).map((v) => v.slug));
  // The Table needs the backend's rows and friend-map's scores.
  expect(viewsFor(false, (c) => ["map", "table"].includes(c)).map((v) => v.slug)).not.toContain("table");
  expect(viewsFor(false, (c) => ["map", "table", "scores", "river"].includes(c)).map((v) => v.slug)).toEqual(expect.arrayContaining(["table", "time-river"]));
  // Before any handshake, and with a backend from before it, every view.
  expect(viewsFor(false)).toEqual(VIEWS);
});
