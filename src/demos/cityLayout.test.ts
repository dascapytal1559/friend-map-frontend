// The City's geometry (cityLayout.ts) on made-up people: the tower in the
// middle with a floor for whoever lives with you, everyone else
// further out the lower their rank, kept off the avenues, and smaller the
// further out past the closest few hundred.

import { describe, expect, it } from "vitest";
import { cityExtent, HOME_CAMERA, paintOrder } from "./cityCamera.ts";
import {
  AVENUE_HALF, avenues, bandOf, buildingHeight, faces, footprint, GAP_ANGLE, layoutCity, LOWEST, OUTSKIRTS, plotRadius, TALLEST, taper, TAPER_DOT, TAPER_KNEE,
  tint, tower, traffic, type Resident,
} from "./cityLayout.ts";
import { wrap } from "./orbitsLayout.ts";

/** A made-up crowd of `count` people ranked 1 to `count` by closeness, the first `together` of them living with you, named in no order of rank (as people are). */
function crowd(count: number, together = 0, silent = 0): Resident[] {
  return Array.from({ length: count }, (_, i) => {
    const rank = i < count - silent ? i + 1 : 0;
    return { id: i + 1, name: `Person ${String((i * 7919) % count).padStart(4, "0")}`, rank, closeness: rank === 0 ? 0 : 1000 / rank, total: 10 + (count - i) * 3, together: i < together };
  });
}

const STAGE = { inner: 60, outer: 400 };

describe("distance by closeness rank", () => {
  it("puts the closest next to the tower, each lower rank further out, and no closeness in the outskirts", () => {
    const { inner, outer } = STAGE;
    expect(plotRadius(1, inner, outer, 500)).toBe(inner);
    expect(plotRadius(500, inner, outer, 500)).toBeCloseTo(outer);
    for (let rank = 1; rank < 500; rank++) expect(plotRadius(rank + 1, inner, outer, 500)).toBeGreaterThan(plotRadius(rank, inner, outer, 500));
    expect(plotRadius(0, inner, outer, 500)).toBe(outer + OUTSKIRTS);
  });

  it("steps the rest outward as if whoever lives with you were not there", () => {
    const { inner, outer } = STAGE;
    expect(plotRadius(3, inner, outer, 120, 2)).toBe(inner);
    expect(plotRadius(12, inner, outer, 120, 2)).toBeCloseTo(plotRadius(10, inner, outer, 118));
  });

  it("rings the closest 10, 25, 50… with avenues, each further out than the last", () => {
    const roads = avenues(120, STAGE.inner, STAGE.outer);
    expect(roads.map((r) => r.label)).toEqual(["top 10", "top 25", "top 50"]);
    for (let i = 1; i < roads.length; i++) expect(roads[i].r).toBeGreaterThan(roads[i - 1].r);
    expect(avenues(12, STAGE.inner, STAGE.outer)).toEqual([]);
  });

  it("gives each rank the band between the avenues it falls between, clear of both", () => {
    const roads = [{ rank: 10.5, r: 100 }, { rank: 25.5, r: 200 }];
    expect(bandOf(1, roads, 40, 500)).toEqual({ lo: 40, hi: 100 - AVENUE_HALF });
    expect(bandOf(10, roads, 40, 500)).toEqual({ lo: 40, hi: 100 - AVENUE_HALF });
    expect(bandOf(11, roads, 40, 500)).toEqual({ lo: 100 + AVENUE_HALF, hi: 200 - AVENUE_HALF });
    expect(bandOf(26, roads, 40, 500)).toEqual({ lo: 200 + AVENUE_HALF, hi: 500 });
    // The outskirts' rank, 0, is beyond every avenue.
    expect(bandOf(0, roads, 40, 500)).toEqual({ lo: 200 + AVENUE_HALF, hi: 500 });
  });
});

describe("a building's shape", () => {
  it("is taller the higher the closeness score, on a log scale, from the lowest slab to the tallest for the top score", () => {
    const top = 1000;
    expect(buildingHeight(0, top, 400)).toBe(400 * LOWEST);
    expect(buildingHeight(top, top, 400)).toBeCloseTo(400 * TALLEST);
    expect(buildingHeight(top * 2, top, 400)).toBeCloseTo(400 * TALLEST);
    for (let s = 1; s < top; s *= 2) expect(buildingHeight(s * 2, top, 400)).toBeGreaterThan(buildingHeight(s, top, 400));
    // A log scale: a tenth of the top score is well over half the height.
    expect(buildingHeight(top / 10, top, 400)).toBeGreaterThan(buildingHeight(top, top, 400) * 0.6);
  });

  it("is wider the more you have talked, on a square-root scale", () => {
    expect(footprint(0, 100, 400)).toBeCloseTo(400 * 0.012);
    expect(footprint(100, 100, 400)).toBeCloseTo(400 * 0.03);
    expect(footprint(25, 100, 400)).toBeCloseTo(400 * (0.012 + 0.018 * 0.5));
    expect(footprint(50, 100, 400)).toBeGreaterThan(footprint(25, 100, 400));
  });
});

describe("the taper", () => {
  it("keeps the closest few hundred full size, halves at the knee, and is a dot past a thousand", () => {
    expect(taper(1, 3000)).toBeCloseTo(1, 3);
    expect(taper(250, 3000)).toBeGreaterThan(0.95);
    expect(taper(TAPER_KNEE, 3000)).toBeCloseTo(TAPER_DOT + (1 - TAPER_DOT) / 2, 6);
    expect(taper(500, 3000)).toBeGreaterThan(0.5);
    expect(taper(500, 3000)).toBeLessThan(0.7);
    expect(taper(1000, 3000)).toBeLessThan(0.15);
    expect(taper(2000, 3000)).toBeCloseTo(TAPER_DOT, 2);
    // The formula, as the legend and docs/views.md state it.
    expect(taper(700, 3000)).toBeCloseTo(TAPER_DOT + (1 - TAPER_DOT) / (1 + (700 / TAPER_KNEE) ** 5), 9);
  });

  it("only ever shrinks with rank, by a little at a time: no step anywhere", () => {
    for (let rank = 1; rank < 3000; rank++) {
      const [here, next] = [taper(rank, 3000), taper(rank + 1, 3000)];
      expect(next).toBeLessThanOrEqual(here);
      expect(here - next, `rank ${rank}`).toBeLessThan(0.006);
    }
    expect(taper(3000, 3000)).toBeGreaterThanOrEqual(TAPER_DOT);
  });

  it("counts no closeness yet as the last rank", () => {
    expect(taper(0, 1500)).toBe(taper(1500, 1500));
    expect(taper(0, 100)).toBeCloseTo(1, 2);
  });

  it("scales footprint and height alike in the city", () => {
    const people = crowd(2000, 0, 50);
    const city = layoutCity(people, { inner: 90, outer: 560 });
    const plot = (rank: number) => [...city.plots.values()].find((p) => p.rank === rank)!;
    const topTotal = Math.max(...people.map((p) => p.total));
    const topScore = Math.max(...people.map((p) => p.closeness));
    for (const rank of [1, 250, 500, 1000, 1950]) {
      const p = plot(rank);
      const person = people.find((q) => q.rank === rank)!;
      expect(p.h).toBeCloseTo(buildingHeight(person.closeness, topScore, 560) * taper(rank, 2000), 6);
      // The footprint too, unless its band was too full and shrank it further.
      expect(p.s).toBeLessThanOrEqual(footprint(person.total, topTotal, 560) * taper(rank, 2000) + 1e-9);
    }
    expect(plot(1950).h).toBeLessThan(plot(1).h * 0.2);
    const outskirts = [...city.plots.values()].filter((p) => p.silent);
    for (const p of outskirts) expect(p.h).toBeLessThan(plot(1).h * 0.2);
  });
});

describe("the city laid out", () => {
  it("has the tower in the middle, a floor for whoever lives with you and a building for everyone else", () => {
    const people = crowd(120, 2);
    const city = layoutCity(people, STAGE);
    expect(city.together).toEqual([1, 2]);
    expect(city.plots.size).toBe(118);
    expect(city.plots.has(1)).toBe(false);
    expect(city.tower.s).toBe(STAGE.inner * 0.5);
    expect(city.tower.h).toBeGreaterThan(Math.max(...[...city.plots.values()].map((p) => p.h)));
    // The closest of them on top.
    expect(city.tower.floors.map((f) => f.id)).toEqual([2, 1]);
    expect(city.tower.floors[0].bottom).toBe(0);
    expect(city.tower.floors[1].bottom).toBe(city.tower.floors[0].top);
    expect(city.tower.floors[1].top).toBeLessThan(city.tower.h);
    // Nobody living with you: no floors.
    expect(tower([], 60, 400).floors).toEqual([]);
  });

  it("stands the closer person nearer the tower than the further, by rank, and nobody in the plaza", () => {
    const people = crowd(300, 1, 20);
    const city = layoutCity(people, STAGE);
    const plots = [...city.plots.values()].filter((p) => !p.silent).sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < plots.length; i++) expect(plots[i].orbit).toBeGreaterThan(plots[i - 1].orbit);
    // As placed, nudged apart, everyone ranked inside an avenue stands nearer than everyone ranked outside it.
    for (const road of city.avenues) {
      const nearest = Math.min(...plots.filter((p) => p.rank > road.rank).map((p) => p.r));
      for (const p of plots.filter((p) => p.rank < road.rank)) expect(p.r, `rank ${p.rank} inside ${road.label}`).toBeLessThan(nearest);
    }
    for (const p of city.plots.values()) expect(p.r - p.s).toBeGreaterThanOrEqual(STAGE.inner * 0.74 - 1e-6);
    // The outskirts lie beyond everyone with a score.
    const outskirts = [...city.plots.values()].filter((p) => p.silent);
    expect(outskirts).toHaveLength(20);
    for (const p of outskirts) expect(p.r).toBeGreaterThan(Math.max(...plots.map((q) => q.r)) - 1e-6);
  });

  it("keeps every building off the avenues, on the side its rank says", () => {
    const city = layoutCity(crowd(400, 2, 30), STAGE);
    for (const p of city.plots.values()) {
      for (const road of city.avenues) {
        expect(Math.abs(p.r - road.r), `person ${p.id} on ${road.label}`).toBeGreaterThanOrEqual(p.s + AVENUE_HALF - 1e-6);
        if (p.rank > 0 && p.rank < road.rank) expect(p.r, `person ${p.id} inside ${road.label}`).toBeLessThan(road.r);
        else expect(p.r, `person ${p.id} outside ${road.label}`).toBeGreaterThan(road.r);
      }
    }
  });

  it("leaves the gap for the avenues' labels clear, at the upper left", () => {
    const city = layoutCity(crowd(300), STAGE);
    for (const p of city.plots.values()) expect(Math.abs(wrap(p.angle - GAP_ANGLE))).toBeGreaterThan(0.1);
  });

  it("places hundreds of people without overlaps to speak of, in a few milliseconds", () => {
    const people = crowd(700, 3, 100);
    const start = performance.now();
    const city = layoutCity(people, { inner: 90, outer: 560 });
    expect(performance.now() - start).toBeLessThan(400);
    const plots = [...city.plots.values()];
    let overlapping = 0;
    for (let i = 0; i < plots.length; i++) {
      for (let j = i + 1; j < plots.length; j++) {
        const [a, b] = [plots[i], plots[j]];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.s + b.s - 1) overlapping++;
      }
    }
    // A band too full has its buildings shrunk until they fit, so only a few pairs are left touching.
    expect(overlapping).toBeLessThan(plots.length * 0.02);
    expect(paintOrder(plots, HOME_CAMERA).map((p) => p.y)).toEqual(paintOrder(plots, HOME_CAMERA).map((p) => p.y).sort((a, b) => a - b));
    const extent = cityExtent(city, HOME_CAMERA);
    expect(extent.left).toBeLessThan(-560);
    expect(extent.right).toBeGreaterThan(560);
    expect(extent.top).toBeLessThan(-city.tower.h);
  });

  it("is the same for the same people", () => {
    const people = crowd(80, 1);
    expect(layoutCity(people, STAGE)).toEqual(layoutCity(people, STAGE));
  });
});

describe("colour and light", () => {
  it("mixes a building's faces toward its neon by strength, the roof lightest, and remembers them", () => {
    const strong = faces("#4de3ff", 1);
    const faint = faces("#4de3ff", 0.2);
    expect(strong).toBe(faces("#4de3ff", 1));
    expect(strong.roof).not.toBe(strong.east);
    expect(faint.roof).not.toBe(strong.roof);
    expect(tint("#4de3ff", 0.5)).toBe("rgba(77, 227, 255, 0.500)");
    expect(tint("#4de3ff", 2)).toBe("rgba(77, 227, 255, 1.000)");
  });

  it("sends light down the roads from everyone talked with lately, each setting off at a different moment", () => {
    const lit = traffic([{ id: 1, daysSince: 0 }, { id: 2, daysSince: 7 }, { id: 3, daysSince: 8 }, { id: 4, daysSince: null }], 7);
    expect(lit.map((l) => l.id)).toEqual([1, 2]);
    expect(lit[0].phase).not.toBe(lit[1].phase);
    for (const l of lit) expect(l.phase).toBeGreaterThanOrEqual(0);
    for (const l of lit) expect(l.phase).toBeLessThan(1);
  });
});
