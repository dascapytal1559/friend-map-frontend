// Each main view names as many of the closest as its own Show top names says
// (topNames.ts): every main view the closest 100 until another is chosen, in the
// real app and the demo alike; the rest stay on the map unnamed.
// The maps are drawn to markup, wide, with nobody picked out.

import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSaved } from "../savedStore.ts";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { roofNamed } from "./City.tsx";
import { buildModel } from "./model.ts";
import { keptZoom, OrbitMap, orbits, web } from "./Orbits.tsx";
import { Orbits3DMap } from "./Orbits3D.tsx";
import { HOME } from "./orbitsZoom.ts";
import { ALL, amongTop, DEFAULT_TOP_NAMES, MAIN_VIEWS, makeTopNamesStores, topNamesKey, topNamesStores } from "./topNames.ts";
import type { ViewProps } from "./view.tsx";

beforeEach(() => resetSaved());
afterEach(() => resetSaved());

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
// P001 the closest down to P240; P230 is someone to reach out to.
const people = Array.from({ length: 240 }, (_, i) => person(i + 1, `P${String(i + 1).padStart(3, "0")}`, 2000 - i * 8));
people[229] = { ...people[229], shouldReachOut: true };
const report: RelationshipsReport = { generatedAt: NOW, gapDays: 14, people, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [] };
const model = buildModel(report);
const props: ViewProps = { model, width: 1400, height: 1000, inset: 60, hover: () => {}, open: () => {} } as ViewProps;

/** Who is named on a map drawn to markup, by rank (P001 is 1), sorted. */
const ranks = (markup: string) => [...markup.matchAll(/class="orbits__name[^"]*"[^>]*>P(\d+)</g)].map((m) => Number(m[1])).sort((a, b) => a - b);
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function draw(element: ReturnType<typeof createElement>): string {
  // There is no window here: one that asks for reduced motion draws everyone where they settle at once.
  vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) });
  return renderToStaticMarkup(element);
}

afterEach(() => {
  keptZoom.current = HOME;
  vi.unstubAllGlobals();
  for (const store of Object.values(topNamesStores)) store.reload(null);
});

function memory(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

describe("Show top names until another is chosen", () => {
  it("is the closest 100 on every main view, in the real app and the demo alike", () => {
    expect(DEFAULT_TOP_NAMES).toBe(100);
    for (const [demo, named] of [[false, 100], [true, 100]] as const) {
      const stores = makeTopNamesStores(demo);
      expect(Object.keys(stores)).toEqual(MAIN_VIEWS);
      for (const slug of MAIN_VIEWS) {
        stores[slug].reload(memory());
        expect(stores[slug].get(), `${slug} in the ${demo ? "demo" : "real app"}`).toBe(named);
      }
    }
  });

  it("keeps a choice already made in each app, apart from the other's, and writes nothing for the default", () => {
    const real = makeTopNamesStores(false);
    const demo = makeTopNamesStores(true);
    const kept = memory({ [topNamesKey("orbits", false)]: "all", [topNamesKey("web", true)]: "200" });
    for (const store of [...Object.values(real), ...Object.values(demo)]) store.reload(kept);
    expect([real.orbits.get(), real.web.get(), demo.orbits.get(), demo.web.get()]).toEqual([ALL, 100, 100, 200]);
    demo.city.set(25);
    expect(kept.kept.get(topNamesKey("city", true))).toBe("25");
    expect(kept.kept.has(topNamesKey("city", false))).toBe(false);
    demo.city.set(100);
    expect(kept.kept.has(topNamesKey("city", true))).toBe(false);
  });
});

describe("Show top names on Orbits", () => {
  it("names the closest 100 by default, and everyone to reach out to", () => {
    expect(ranks(draw(createElement(OrbitMap, props)))).toEqual([...upTo(DEFAULT_TOP_NAMES), 230]);
  });

  it("names the closest 25, 50 or 200, every one, unzoomed", () => {
    for (const named of [25, 50, 200]) expect(ranks(draw(createElement(OrbitMap, { ...props, named })))).toEqual([...upTo(named), 230]);
  });

  it("with All names the closest 200 as 200 does, then everyone else in view", () => {
    expect(ranks(draw(createElement(OrbitMap, { ...props, named: ALL })))).toEqual(upTo(240));
  });

  it("goes by Orbits' own setting, and the Spider web by the Spider web's", () => {
    topNamesStores.orbits.set(25);
    expect(ranks(draw(createElement(orbits.View, props)))).toEqual([...upTo(25), 230]);
    expect(ranks(draw(createElement(web.View, props)))).toEqual([...upTo(100), 230]);
    topNamesStores.web.set(50);
    expect(ranks(draw(createElement(web.View, props)))).toEqual([...upTo(50), 230]);
  });

  it("never moves anyone nearer the sun or further, nor changes an icon's size, whatever is named", () => {
    // Each person's distance from the sun: their icon's middle, or their name's, drawn in its place (the line's middle
    // 4 pixels over its baseline, less for a smaller name); and each icon's size.
    const places = (markup: string) => {
      const at = new Map<number, number>();
      for (const m of markup.matchAll(/<circle cx="([-\d.e]+)" cy="([-\d.e]+)" r="([\d.e]+)" class="orbits__body"[^>]*fill="url\(#orbits-face-(\d+)\)"/g)) at.set(Number(m[4]), Math.hypot(Number(m[1]), Number(m[2])));
      for (const m of markup.matchAll(/<text class="(orbits__name[^"]*)" x="([-\d.e]+)" y="([-\d.e]+)"[^>]*>P(\d+)</g)) {
        at.set(Number(m[4]), Math.hypot(Number(m[2]), Number(m[3]) - 4 * (m[1].includes("--minor") ? 0.84 : 1)));
      }
      return at;
    };
    const sizes = (markup: string) => new Map([...markup.matchAll(/ r="([\d.e]+)" class="orbits__body"[^>]*fill="url\(#orbits-face-(\d+)\)"/g)].map((m) => [Number(m[2]), Number(m[1])]));
    const [few, all] = [draw(createElement(OrbitMap, { ...props, named: 25 })), draw(createElement(OrbitMap, { ...props, named: 100 }))];
    const [before, after] = [places(few), places(all)];
    expect(before.size).toBe(240);
    for (const [id, r] of before) expect(after.get(id), `P${id}`).toBeCloseTo(r, 6);
    const [small, big] = [sizes(few), sizes(all)];
    // Everyone but the closest 100 and P230, to reach out to.
    expect(big.size).toBe(139);
    for (const [id, r] of big) expect(small.get(id), `P${id}`).toBe(r);
  });
});

describe("the names' own layer", () => {
  it("is an SVG of its own over the sky's, holding every name and nothing else, which the pointer passes through", () => {
    for (const look of ["night", "web"] as const) {
      const markup = draw(createElement(OrbitMap, { ...props, look, named: ALL }));
      const [sky, names] = markup.split(/(?=<svg class="[^"]*orbits__name-layer)/);
      expect(sky).not.toMatch(/class="orbits__name/);
      expect(ranks(names)).toEqual(ranks(markup));
      expect(ranks(names).length).toBeGreaterThan(200);
      expect(names).not.toMatch(/orbits__body|orbits__leader/);
    }
    const css = readFileSync(new URL("./orbits.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.demos__stage > svg\.orbits__name-layer \{\s*pointer-events: none;/);
  });
});

describe("Show top names on Orbits 3D", () => {
  it("goes by its own setting, seen from straight above as Orbits is", () => {
    expect(ranks(draw(createElement(Orbits3DMap, props)))).toEqual([...upTo(100), 230]);
    topNamesStores["orbits-3d"].set(50);
    expect(ranks(draw(createElement(Orbits3DMap, props)))).toEqual([...upTo(50), 230]);
  });
});

describe("Show top names on the City", () => {
  const none = new Set<number>();

  it("names the closest 100 by default, and with All puts a name on every roof", () => {
    expect(topNamesStores.city.get()).toBe(DEFAULT_TOP_NAMES);
    for (const rank of [0, 1, 100, 700]) expect(roofNamed(1, rank, { named: ALL, reachOut: none, heldLinks: none })).toBe(true);
  });

  it("otherwise on the closest it names, everyone to reach out to and whoever shares group chats with the held, never the belt", () => {
    const named = 50;
    expect([1, 50, 51, 0].map((rank) => roofNamed(1, rank, { named, reachOut: none, heldLinks: none }))).toEqual([true, true, false, false]);
    expect(roofNamed(7, 300, { named, reachOut: new Set([7]), heldLinks: none })).toBe(true);
    expect(roofNamed(7, 300, { named, reachOut: none, heldLinks: new Set([7]) })).toBe(true);
  });
});

describe("amongTop", () => {
  it("counts only the ranked, closest first", () => {
    expect([1, 25, 26].map((place) => amongTop(place, 25))).toEqual([true, true, false]);
    for (const place of [null, undefined, 0]) expect(amongTop(place, ALL)).toBe(false);
    expect(amongTop(10_000, ALL)).toBe(true);
  });
});
