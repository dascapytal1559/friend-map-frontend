// Aspiring friends (src/aspiring.ts) on Orbits and the Spider web: far out at the
// edge of the page in a big bubble, named under it, and nobody else moved for it.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { ASPIRING_TAG, isAspiring } from "../aspiring.ts";
import { resetSaved } from "../savedStore.ts";
import { EMPTY_ASPIRING, newPerson } from "./AddPerson.tsx";
import { buildModel } from "./model.ts";
import { keptZoom, OrbitMap, underBubble } from "./Orbits.tsx";
import { Orbits3DMap } from "./Orbits3D.tsx";
import { aspiringPlaces, aspiringSize, edgeReach, type Box } from "./orbitsLayout.ts";
import { aspiringEdge, BELT, stageOf, type PlacedName } from "./orbitsSky.ts";
import { HOME } from "./orbitsZoom.ts";
import type { ViewProps } from "./view.tsx";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
const friend = (id: number): PersonRelationship => ({
  id, name: `Sample Person ${id}`, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
  totals: counts(500 - id), firstMessageAt: NOW, lastMessageAt: NOW,
  months: [{ month: "2026-03", ...counts(500 - id) }],
  reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
});
/** Someone added by hand, with no messages at all. */
const aspiring = (id: number, name: string): PersonRelationship => ({
  ...friend(id), name, tags: [ASPIRING_TAG], totals: counts(0), months: [], firstMessageAt: null, lastMessageAt: null,
});
const report = (extra: PersonRelationship[] = []): RelationshipsReport => ({
  generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [],
  people: [...Array.from({ length: 40 }, (_, i) => friend(i + 1)), ...extra],
});
const [WIDTH, HEIGHT, TOP] = [1200, 900, 60];
const props = (people: PersonRelationship[] = []) => ({ model: buildModel(report(people)), width: WIDTH, height: HEIGHT, inset: TOP, hover: () => {}, open: () => {} }) as ViewProps;

function draw(element: ReturnType<typeof createElement>, phone = false): string {
  // There is no window here: one that asks for reduced motion draws everyone where they settle at once.
  vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") || (phone && query.includes("max-width")) }) });
  return renderToStaticMarkup(element);
}
/** Each bubble's middle and radius, from its ring. */
const bubbles = (markup: string) => [...markup.matchAll(/<circle cx="([-\d.e]+)" cy="([-\d.e]+)" r="([\d.e]+)" fill="none" stroke="[^"]*" stroke-width="1.4" stroke-dasharray/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
const namedAt = (markup: string, name: string) => {
  const found = new RegExp(`<text class="orbits__name[^"]*" x="([-\\d.e]+)" y="([-\\d.e]+)"[^>]*>${name}<`).exec(markup);
  return found ? { x: Number(found[1]), y: Number(found[2]) } : null;
};
/** Everyone else on the map, as drawn: their markers, and their names. */
const others = (markup: string) => [...markup.matchAll(/<circle cx="[^"]*" cy="[^"]*" r="[^"]*" class="orbits__body"|<text class="orbits__name[^"]*" x="[^"]*" y="[^"]*"[^>]*>Sample Person \d+</g)].map((m) => m[0]);

beforeEach(() => resetSaved({ names: "full" }));
afterEach(() => {
  resetSaved();
  keptZoom.current = HOME;
  vi.unstubAllGlobals();
});

describe("where aspiring friends sit", () => {
  const edge: Box = { left: -600, right: 600, top: -300, bottom: 350 };

  it("measures how far the edge is along any direction", () => {
    expect(edgeReach(0, edge)).toBeCloseTo(600);
    expect(edgeReach(Math.PI, edge)).toBeCloseTo(600);
    expect(edgeReach(-Math.PI / 2, edge)).toBeCloseTo(300);
    expect(edgeReach(Math.PI / 2, edge)).toBeCloseTo(350);
  });

  it("puts one in the top right corner, and two in opposite corners", () => {
    const one = aspiringPlaces([7], edge, 400).get(7)!;
    expect([one.x, one.y]).toEqual([expect.closeTo(600), expect.closeTo(-300)]);
    const two = aspiringPlaces([7, 8], edge, 400);
    expect(two.get(7)!.x).toBeGreaterThan(0);
    expect(two.get(8)!.x).toBeLessThan(0);
    expect(two.get(8)!.y).toBeGreaterThan(0);
  });

  it("keeps everyone on the edge, off any of it the map reaches, and never on top of each other", () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const placed = [...aspiringPlaces(ids, edge, 400).values()];
    for (const p of placed) {
      expect(p.r).toBeGreaterThanOrEqual(400);
      expect(p.r).toBeCloseTo(edgeReach(p.angle, edge));
    }
    const gaps = placed.flatMap((a, i) => placed.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
    expect(Math.min(...gaps)).toBeGreaterThan(100);
  });

  it("still spreads them round an edge that is all too near", () => {
    const placed = [...aspiringPlaces([1, 2], edge, 5000).values()];
    expect(placed.map((p) => Math.sign(p.x))).toEqual([1, -1]);
  });

  it("leaves a corner clear of the map on any window, a phone's too", () => {
    for (const [width, height, top] of [[1440, 900, 110], [1200, 1200, 110], [390, 844, 150], [844, 390, 110], [600, 500, 80]]) {
      const { outer, cx, cy } = stageOf(width, height, top);
      const size = aspiringSize(outer);
      const edge = aspiringEdge(width, height, top, cx, cy, size);
      const corner = aspiringPlaces([1], edge, 0).get(1)!;
      expect(corner.r, `${width}x${height}`).toBeGreaterThan(outer + BELT + size);
    }
  });

  it("makes a bubble bigger than anyone's marker, on a big map and a small one", () => {
    expect(aspiringSize(360)).toBeGreaterThan(15);
    expect(aspiringSize(125)).toBeGreaterThan(8);
  });
});

describe("an aspiring friend on the map", () => {
  const far = [aspiring(100, "Ada Sample"), aspiring(101, "Walt Example")];

  it("is drawn as a bubble out on the page, however little you have talked, and bigger than the most talked-to", () => {
    for (const look of ["night", "web"] as const) {
      const markup = draw(createElement(OrbitMap, { ...props(far), look }));
      const drawn = bubbles(markup);
      expect(drawn, look).toHaveLength(2);
      const { outer, cx, cy } = stageOf(WIDTH, HEIGHT, TOP);
      for (const b of drawn) {
        expect(b.r).toBeCloseTo(aspiringSize(outer));
        expect(Math.hypot(b.x, b.y)).toBeGreaterThan(outer + BELT + b.r);
        expect(cx + b.x + b.r).toBeLessThanOrEqual(WIDTH);
        expect(cx + b.x - b.r).toBeGreaterThanOrEqual(0);
        expect(cy + b.y + b.r).toBeLessThanOrEqual(HEIGHT);
        expect(cy + b.y - b.r).toBeGreaterThanOrEqual(TOP);
      }
    }
  });

  it("is named under their bubble, which stays", () => {
    for (const look of ["night", "web"] as const) {
      const markup = draw(createElement(OrbitMap, { ...props(far), look }));
      const [ada] = bubbles(markup);
      const name = namedAt(markup, "Ada Sample")!;
      expect(name.x).toBeCloseTo(ada.x);
      expect(name.y).toBeGreaterThan(ada.y + ada.r);
    }
  });

  it("moves nobody else: everyone is drawn just where they are without them", () => {
    for (const look of ["night", "web"] as const) {
      expect(others(draw(createElement(OrbitMap, { ...props(far), look })))).toEqual(others(draw(createElement(OrbitMap, { ...props(), look }))));
    }
  });

  it("sits out at the edge even with messages, until the tag comes off, and takes nobody's place", () => {
    const talked = { ...friend(100), name: "Ada Sample", tags: [ASPIRING_TAG] };
    const markup = draw(createElement(OrbitMap, props([talked])));
    expect(bubbles(markup)).toHaveLength(1);
    expect(others(markup)).toEqual(others(draw(createElement(OrbitMap, props()))));
    expect(bubbles(draw(createElement(OrbitMap, props([{ ...talked, tags: [] }]))))).toHaveLength(0);
  });

  it("keeps their place on the edge with their name glowing, one to reach out to too", () => {
    const glowing = [{ ...far[0], shouldReachOut: true }, far[1]];
    expect(bubbles(draw(createElement(OrbitMap, props(glowing))))).toEqual(bubbles(draw(createElement(OrbitMap, props(far)))));
  });

  it("is a bubble with no name on a phone, as everyone there is unnamed until picked out", () => {
    const markup = draw(createElement(OrbitMap, props(far)), true);
    expect(bubbles(markup)).toHaveLength(2);
    expect(namedAt(markup, "Ada Sample")).toBeNull();
  });

  it("carries their name's box along under the bubble, so a click on the name opens them", () => {
    const label = { id: 1, x: 5, y: 9, dx: 0, dy: 4, left: 0, right: 10, top: 2, bottom: 12, anchor: "middle", scale: 1, linkedOnly: false } as PlacedName;
    expect(underBubble(label, 20)).toEqual({ ...label, dy: 36 });
  });

  it("is the same on the solar system, the Orbits the menu offers, seen from straight above", () => {
    const flat = bubbles(draw(createElement(OrbitMap, props(far))));
    const markup = draw(createElement(Orbits3DMap, props(far)));
    expect(bubbles(markup)).toEqual(flat);
    const name = namedAt(markup, "Ada Sample")!;
    expect(name.y).toBeGreaterThan(flat[0].y + flat[0].r);
  });

  it("moves nobody else on the solar system either, whose names are all that is on its SVG", () => {
    expect(others(draw(createElement(Orbits3DMap, props(far))))).toEqual(others(draw(createElement(Orbits3DMap, props()))));
  });
});

describe("adding an aspiring friend", () => {
  it("gives them the tag, with what you would say to them as their note", () => {
    const person = newPerson({ ...EMPTY_ASPIRING, name: "Ada Sample", note: "Your talk stayed with me" }, false);
    expect(person).toEqual({ name: "Ada Sample", tags: [ASPIRING_TAG], note: "Your talk stayed with me" });
    expect(isAspiring({ tags: person.tags! })).toBe(true);
  });
});
