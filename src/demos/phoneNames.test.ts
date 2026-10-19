// On a phone, Orbits, Circles and the Spider web name nobody (the user's ask: "on Mobile,
// let's remove all the names"): not the closest, not people to reach out to,
// not those sharing group chats with whoever is held, nor the friend circles.
// Only whoever is picked out (a finger held on them, or their panel open) is
// named. Off the phone layout, names are as ever. The map is drawn to markup,
// its window asking for the phone layout or not.

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { buildModel } from "./model.ts";
import { keptZoom, OrbitMap, PHONE, type OrbitOrder } from "./Orbits.tsx";
import { DEFAULT_TOP_NAMES as NAMED } from "./topNames.ts";
import { HOME, type Zoom } from "./orbitsZoom.ts";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
function person(id: number, name: string, messages: number): PersonRelationship {
  return {
    id, name, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(messages), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(messages) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}
// P001 the closest down to P120; P070 shares a group with P085; P110 is someone to reach out to; the first ten climb.
const people = Array.from({ length: 120 }, (_, i) => person(i + 1, `P${String(i + 1).padStart(3, "0")}`, 600 - i * 4));
people[109] = { ...people[109], shouldReachOut: true };
for (let i = 0; i < 10; i++) people[i] = { ...people[i], tags: ["climbing"] };
const report: RelationshipsReport = {
  generatedAt: NOW,
  gapDays: 14,
  people,
  archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
  groups: [
    { id: 10, memberIds: [70, 85], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
    { id: 11, memberIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], selfOnly: false, messageCount: 200, lastMessageAt: NOW, months: [] },
  ],
};
const model = buildModel(report);

/** The map drawn on a phone or not, at `zoom`, with `held`'s panel open, in `order`. */
function draw(
  phone: boolean,
  { held = null, zoom = HOME, width = 390, height = 844, order = "name", look = "night" }: { held?: number | null; zoom?: Zoom; width?: number; height?: number; order?: OrbitOrder; look?: "night" | "web" } = {},
): string {
  // There is no window here: one that asks for reduced motion draws everyone where they settle at once.
  vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") || (phone && query === PHONE) }) });
  keptZoom.current = zoom;
  return renderToStaticMarkup(createElement(OrbitMap, { model, width, height, inset: 60, hover: () => {}, open: () => {}, held, order, look }));
}
const named = (markup: string) => [...markup.matchAll(/class="orbits__name[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
const ranks = (markup: string) => named(markup).map((name) => Number(name.slice(1)));
const circleNames = (markup: string) => [...markup.matchAll(/<g class="orbits__circles"><text[^>]*>([^<]+)</g)].map((m) => m[1]);

afterEach(() => {
  keptZoom.current = HOME;
  vi.unstubAllGlobals();
});

describe("names on a phone", () => {
  it("goes by the phone layout's own media query", () => {
    expect(readFileSync(new URL("./demos.css", import.meta.url), "utf8")).toContain(`@media ${PHONE} {`);
  });

  it("draws no names at all, on Orbits or on Circles, zoomed in or not", () => {
    expect(named(draw(true))).toEqual([]);
    expect(named(draw(true, { zoom: { k: 4, x: 0, y: 0 } }))).toEqual([]);
    const circles = draw(true, { order: "circles" });
    expect(named(circles)).toEqual([]);
    expect(circleNames(circles)).toEqual([]);
    // A phone held sideways is wide, and still names nobody.
    expect(named(draw(true, { width: 1000, height: 400 }))).toEqual([]);
  });

  it("draws no names on the Spider web either, with its settings as a first visit finds them", () => {
    expect(named(draw(true, { look: "web" }))).toEqual([]);
    expect(named(draw(true, { look: "web", held: 70 }))).toEqual(["P070"]);
    expect(named(draw(false, { look: "web", width: 1000, height: 800 })).length).toBeGreaterThan(0);
  });

  it("names only whoever is held, not the people they share group chats with", () => {
    expect(named(draw(true, { held: 70 }))).toEqual(["P070"]);
  });

  it("goes by the phone layout, not the window's size: off it, the closest NAMED are named, and the circles", () => {
    const wide = { width: 1000, height: 800 };
    const desktop = ranks(draw(false, wide));
    expect(desktop.filter((rank) => rank <= NAMED).length).toBe(NAMED);
    expect(desktop.filter((rank) => rank > NAMED)).toEqual([110]);
    expect(named(draw(false, { held: 70, ...wide }))).toEqual(expect.arrayContaining(["P070", "P085"]));
    expect(circleNames(draw(false, { order: "circles", ...wide }))).toEqual(["climbing"]);
  });
});
