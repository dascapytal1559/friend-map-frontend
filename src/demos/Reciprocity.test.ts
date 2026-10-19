import { describe, expect, it } from "vitest";
import type { DemoPerson } from "./model.ts";
import { carry, fitSwarm, insideSize, overall, placeLabels, ratioLabel, rows, splitAt, swarm, twoLines } from "./Reciprocity.tsx";

const counts = (directFromMe: number, directFromThem: number, openingsByMe = 0, openingsByThem = 0) =>
  ({ directFromMe, directFromThem, openingsByMe, openingsByThem });

describe("carry", () => {
  it("is null with no one-to-one chat, and 0 when it is even", () => {
    expect(carry(counts(0, 0, 3, 0), "both")).toBeNull();
    expect(carry(counts(50, 50, 4, 4), "both")).toBe(0);
  });

  it("is positive when you carry it and negative when they do, as log2 of the ratio", () => {
    expect(carry(counts(198, 98), "messages")).toBeCloseTo(1);
    expect(carry(counts(98, 198), "messages")).toBeCloseTo(-1);
    expect(carry(counts(10, 10, 7, 1), "openings")).toBeCloseTo(2);
  });

  it("averages messages and reach-outs for both", () => {
    const person = counts(198, 98, 1, 7);
    expect(carry(person, "both")).toBeCloseTo((1 + -2) / 2);
  });

  it("keeps a handful of messages from reading as wildly lopsided", () => {
    expect(Math.abs(carry(counts(3, 0), "messages")!)).toBeLessThan(1.5);
    expect(Math.abs(carry(counts(300, 0), "messages")!)).toBeGreaterThan(7);
  });
});

describe("splitAt", () => {
  const leftArea = (t: number) => 1 - (Math.acos(t) - t * Math.sqrt(1 - t * t)) / Math.PI;

  it("cuts through the centre for an even split and at the edges for all or nothing", () => {
    expect(splitAt(0.5)).toBeCloseTo(0);
    expect(splitAt(0)).toBe(-1);
    expect(splitAt(1)).toBe(1);
  });

  it("leaves the asked share of the area on the left", () => {
    for (const share of [0.1, 0.25, 0.6, 0.9]) expect(leftArea(splitAt(share))).toBeCloseTo(share, 6);
  });

  it("is symmetric", () => {
    expect(splitAt(0.2)).toBeCloseTo(-splitAt(0.8), 9);
  });
});

describe("swarm", () => {
  const items = [
    { x: 0, r: 10 },
    { x: 5, r: 8 },
    { x: -4, r: 6 },
    { x: 40, r: 5 },
    { x: 2, r: 4 },
    { x: 3, r: 3 },
  ];

  it("keeps x, puts the biggest on the beam and a lone circle on it too", () => {
    const y = swarm(items);
    expect(y[0]).toBe(0);
    expect(y[3]).toBe(0);
  });

  it("never overlaps two circles", () => {
    const y = swarm(items, 1.5);
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const distance = Math.hypot(items[i].x - items[j].x, y[i] - y[j]);
        expect(distance).toBeGreaterThanOrEqual(items[i].r + items[j].r + 1.5 - 1e-6);
      }
    }
  });

  it("is deterministic", () => {
    expect(swarm(items)).toEqual(swarm(items));
  });
});

describe("fitSwarm", () => {
  const xs = Array.from({ length: 30 }, () => 0);
  const radii = xs.map(() => 10);

  it("leaves the radii alone when the swarm fits", () => {
    expect(fitSwarm([0, 100], [10, 10], 50).rs).toEqual([10, 10]);
  });

  it("shrinks the circles until the swarm fits its room, without overlapping them", () => {
    const { rs, ys } = fitSwarm(xs, radii, 200);
    expect(rs[0]).toBeLessThan(10);
    expect(Math.max(...ys.map((y, i) => Math.abs(y) + rs[i]))).toBeLessThanOrEqual(200);
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(2 * rs[0] - 1e-6);
  });

  it("stops at a third of the size rather than vanishing", () => {
    expect(fitSwarm(xs, radii, 10).rs[0]).toBeGreaterThan(3);
  });
});

describe("placeLabels", () => {
  const bounds = { x: 0, y: 0, width: 400, height: 300 };

  it("puts a name below its circle when there is room", () => {
    const circle = { x: 200, y: 150, r: 10 };
    const labels = placeLabels([{ id: 1, circle, width: 60 }], [circle], bounds);
    expect(labels.get(1)).toMatchObject({ x: 200, anchor: "middle", inside: null });
    expect(labels.get(1)!.y).toBeGreaterThan(160);
  });

  it("moves a name that would hit another circle or label, and drops one with no room", () => {
    const a = { x: 200, y: 150, r: 10 };
    const below = { x: 200, y: 180, r: 10 };
    const labels = placeLabels(
      [
        { id: 1, circle: a, width: 60 },
        { id: 2, circle: a, width: 60 },
        { id: 3, circle: a, width: 60 },
        { id: 4, circle: a, width: 60 },
      ],
      [a, below],
      bounds,
    );
    expect(labels.get(1)!.y).toBeLessThan(150);
    expect(labels.get(2)!.anchor).toBe("start");
    expect(labels.get(3)!.anchor).toBe("end");
    expect(labels.has(4)).toBe(false);
  });

  it("stays inside the bounds", () => {
    const edge = { x: 5, y: 150, r: 4 };
    const labels = placeLabels([{ id: 1, circle: edge, width: 80 }], [edge], bounds);
    expect(labels.get(1)!.anchor).toBe("start");
  });

  it("sets a name inside its circle when given a size to set it at", () => {
    const circle = { x: 200, y: 150, r: 40 };
    expect(placeLabels([{ id: 1, circle, width: 60, inside: 12 }], [circle], bounds).get(1)).toMatchObject({ x: 200, inside: 12 });
  });
});

describe("insideSize and twoLines", () => {
  it("splits a name after its first word", () => {
    expect(twoLines("Ada Proxy")).toEqual(["Ada", "Proxy"]);
    expect(twoLines("Ada de la Proxy")).toEqual(["Ada", "de la Proxy"]);
    expect(twoLines("Ada")).toEqual(["Ada"]);
  });

  it("fits the longest line in a big circle, capped, and refuses a small one", () => {
    expect(insideSize("Ada Proxy", 46)).toBe(12.5);
    const size = insideSize("Kira Testington", 31)!;
    expect(size).toBeGreaterThanOrEqual(9);
    expect(size * 0.54 * "Testington".length).toBeLessThanOrEqual(1.7 * 31 + 1e-6);
    expect(insideSize("Kira Testington", 12)).toBeNull();
    expect(insideSize("Al Bo", 22)).toBeNull();
  });
});

describe("rows", () => {
  it("centres one row on 0 and wraps when it runs out of width", () => {
    const one = rows([5, 5, 5], 100, 5);
    expect(one.map((p) => p.x)).toEqual([-15, 0, 15]);
    const two = rows([5, 5, 5, 5], 30, 5);
    expect(two[2].y).toBeGreaterThan(two[0].y);
    expect(two[2].x).toBe(-7.5);
  });
});

describe("overall and ratioLabel", () => {
  it("sums your share across everyone", () => {
    const people = [counts(30, 10, 1, 0), counts(10, 30, 0, 3)] as DemoPerson[];
    expect(overall(people)).toEqual({ messages: 0.5, openings: 0.25 });
    expect(overall([counts(0, 0)] as DemoPerson[])).toEqual({ messages: null, openings: null });
  });

  it("names a log2 ratio", () => {
    expect(ratioLabel(0)).toBe("even");
    expect(ratioLabel(1)).toBe("2×");
    expect(ratioLabel(-2)).toBe("4×");
    expect(ratioLabel(Math.log2(1.5))).toBe("1.5×");
  });
});
