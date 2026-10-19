// The web (webGeometry.ts), placed relative to the sun as Orbits places
// people: even spokes and regular rings, the rank rings at Orbits' rank radii
// on its even scale, evenly apart.

import { describe, expect, it } from "vitest";
import { BELT } from "./orbitsSky.ts";
import { orbitRadius, rings } from "./orbitsLayout.ts";
import { ringGap, ringTop, spokesFor, STRAND_DEPTH, strandControl, strandSag, webShape, wrapAngle, xy } from "./webGeometry.ts";

const stage = { inner: 40, outer: 300, count: 700, far: 2000 };

describe("webShape", () => {
  // Orbits' rank rings for a crowd of 700 on this stage, on the even scale, as Orbits.tsx hands them over.
  const radius = (rank: number) => orbitRadius(rank, stage.inner, stage.outer, stage.count, 0, "even");
  const ranks = rings(stage.count, "even").map((ring) => ({ r: radius(ring.rank), label: ring.label }));
  const web = webShape({ ...stage, ranks });
  const n = web.spokes.length;
  const step = (2 * Math.PI) / n;

  it("has spokes by the crowd's size unless told, made even, evenly round the hub, all running out past the edges", () => {
    expect([spokesFor(100), spokesFor(500), spokesFor(900)]).toEqual([20, 24, 30]);
    expect(n).toBe(30);
    expect(webShape({ ...stage, count: 600 }).spokes).toHaveLength(2 * Math.round(spokesFor(600) / 2));
    expect(webShape({ ...stage, count: 600 }).spokes.length % 2).toBe(0);
    web.spokes.forEach((spoke, i) => {
      if (i > 0) expect(spoke.angle - web.spokes[i - 1].angle).toBeCloseTo(step);
      expect(spoke.r).toBe(stage.far);
    });
    expect(web.belt).toBe(stage.outer + BELT);
    expect(web.hub).toBeLessThan(stage.inner);
  });

  it("puts no spoke straight up, the top midway between two, and is the same mirrored left to right and top to bottom", () => {
    const fromUp = web.spokes.map((s) => Math.abs(wrapAngle(s.angle + Math.PI / 2)));
    expect(Math.min(...fromUp)).toBeCloseTo(step / 2);
    const angles = web.spokes.map((s) => wrapAngle(s.angle));
    const has = (a: number) => angles.some((b) => Math.abs(wrapAngle(a - b)) < 1e-9);
    for (const a of angles) {
      expect(has(Math.PI - a)).toBe(true);
      expect(has(-a)).toBe(true);
    }
  });

  it("lays a ring at each of Orbits' rank radii, the closest 10 to 250 evenly apart, carrying its label, exactly at the radius its rank sits at", () => {
    expect(ranks.map((r) => r.label)).toEqual(["top 10", "top 25", "top 50", "top 100", "top 250"]);
    const ranked = web.rings.filter((ring) => ring.label !== null);
    expect(ranked).toEqual(ranks);
    for (const ring of ranked) expect(ring.r).toBe(radius(Number(ring.label!.slice(4)) + 0.5));
    for (let i = 2; i < ranked.length; i++) expect(ranked[i].r - ranked[i - 1].r).toBeCloseTo(ranked[1].r - ranked[0].r);
  });

  it("rings the hub where the spokes start, and adds thinner rings only where rank rings stand wide apart, evenly within the gap, and on out past the edges", () => {
    const radii = web.rings.map((ring) => ring.r);
    expect(web.rings[0]).toEqual({ r: web.hub, label: null });
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    // Between two neighbouring rings with labels (or the hub), the thinner rings in between split the gap evenly, and
    // a gap too narrow for one at ringGap gets none.
    const anchors = web.rings.flatMap((ring, i) => (i === 0 || ring.label !== null ? [i] : []));
    for (let a = 1; a < anchors.length; a++) {
      const [from, to] = [radii[anchors[a - 1]], radii[anchors[a]]];
      const inside = radii.slice(anchors[a - 1] + 1, anchors[a]);
      const gaps = [from, ...inside, to].slice(1).map((r, i) => r - [from, ...inside][i]);
      for (const g of gaps) expect(g).toBeCloseTo((to - from) / (inside.length + 1));
      if (a === 1) expect(inside.length).toBe(Math.max(0, Math.round((to - from) / ringGap((from + to) / 2)) - 1));
    }
    // Inside the closest rank ring, round the spider, there is room for some; among the people, the rank rings stand alone.
    expect(anchors[1]).toBeGreaterThan(1);
    expect(anchors.slice(1).every((at, i, all) => i === 0 || at === all[i - 1] + 1)).toBe(true);
    // As many in every gap between two rank rings, so every band is alike, however wide the stage: with room for
    // some on a big one, where ringGap alone would give the inner gaps more than the outer.
    const big = webShape({ inner: 85, outer: 1000, count: 700, far: 4000, ranks: rings(700, "even").map((ring) => ({ r: orbitRadius(ring.rank, 85, 1000, 700, 0, "even"), label: ring.label })) });
    const at = big.rings.flatMap((ring, i) => (ring.label !== null ? [i] : []));
    const counts = at.slice(1).map((i, j) => i - at[j] - 1);
    expect(counts[0]).toBeGreaterThan(0);
    expect(new Set(counts).size).toBe(1);
    const steps = big.rings.slice(at[0], at[at.length - 1] + 1).map((ring, i, all) => (i === 0 ? null : ring.r - all[i - 1].r)).slice(1);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!);
    const beyond = web.rings.slice(anchors[anchors.length - 1] + 1);
    expect(beyond.every((ring) => ring.label === null)).toBe(true);
    expect(beyond[beyond.length - 1].r).toBeGreaterThan(stage.far - ringGap(stage.far));
    expect(beyond[beyond.length - 1].r).toBeLessThanOrEqual(stage.far);
    expect(beyond[beyond.length - 1].r - beyond[beyond.length - 2].r).toBeGreaterThan(beyond[1].r - beyond[0].r);
    expect(ringGap(0)).toBe(30);
    expect(ringGap(1000)).toBeCloseTo(135);
  });

  it("sets each ring's label on the level thread across its top, a little inside its corners", () => {
    expect(ringTop(web, 200)).toBeCloseTo(200 * Math.cos(Math.PI / n));
    const [left, right] = web.spokes.filter((s) => Math.abs(wrapAngle(s.angle + Math.PI / 2)) < step);
    expect(xy({ angle: left.angle, r: 200 })[1]).toBeCloseTo(-ringTop(web, 200));
    expect(xy({ angle: right.angle, r: 200 })[1]).toBeCloseTo(-ringTop(web, 200));
  });

  it("is the same every time, and leaves out a rank ring that would not fit between the hub and the edges", () => {
    expect(webShape({ ...stage, ranks })).toEqual(web);
    const lost = webShape({ ...stage, ranks: [{ r: 5, label: "top 1" }, ...ranks, { r: stage.far + 1, label: "top 9" }] });
    expect(lost.rings.filter((ring) => ring.label !== null)).toEqual(ranks);
  });
});

describe("the web's sliders, at their extremes", () => {
  const radius = (rank: number) => orbitRadius(rank, stage.inner, stage.outer, stage.count, 0, "even");
  const ranks = rings(stage.count, "even").map((ring) => ({ r: radius(ring.rank), label: ring.label }));
  const shapeOf = (spokes: number, curve: number) => webShape({ ...stage, ranks, spokes, curve });
  /** A quadratic thread's point at t. */
  const along = (a: number[], c: number[], b: number[], t: number) => [0, 1].map((i) => (1 - t) ** 2 * a[i] + 2 * (1 - t) * t * c[i] + t ** 2 * b[i]);
  /** The thread of ring `r` from spoke `i` to the next: its ends, its control point, its middle. */
  const thread = (shape: ReturnType<typeof shapeOf>, r: number, i: number) => {
    const [from, to] = [shape.spokes[i].angle, shape.spokes[(i + 1) % shape.spokes.length].angle];
    const a = xy({ angle: from, r });
    const b = xy({ angle: to, r });
    const c = strandControl(r, from, to, strandSag(shape, r));
    return { a, b, c, middle: along(a, c, b, 0.5) };
  };

  it("give as many spokes as asked, 8 to 48, evenly round the hub, the top midway between two, mirrored either way, whatever the curve", () => {
    for (const n of [8, 48]) {
      for (const curve of [0, 1]) {
        const shape = shapeOf(n, curve);
        expect(shape.spokes).toHaveLength(n);
        const step = (2 * Math.PI) / n;
        shape.spokes.forEach((spoke, i) => i > 0 && expect(spoke.angle - shape.spokes[i - 1].angle).toBeCloseTo(step));
        expect(Math.min(...shape.spokes.map((s) => Math.abs(wrapAngle(s.angle + Math.PI / 2))))).toBeCloseTo(step / 2);
        // The rings stay where the ranks put them: the curve and the spokes move none.
        expect(shape.rings.filter((ring) => ring.label !== null)).toEqual(ranks);
      }
    }
    expect(shapeOf(30, 0).rings).toEqual(shapeOf(8, 1).rings);
  });

  it("run each thread straight from spoke to spoke at no curve, the ring a regular polygon, its label on the level top", () => {
    for (const n of [8, 48]) {
      const shape = shapeOf(n, 0);
      expect(shape.curve).toBe(0);
      for (const ring of shape.rings) {
        expect(strandSag(shape, ring.r)).toBe(0);
        const { a, b, c } = thread(shape, ring.r, 3);
        expect(c[0]).toBeCloseTo((a[0] + b[0]) / 2);
        expect(c[1]).toBeCloseTo((a[1] + b[1]) / 2);
      }
      expect(ringTop(shape, 200)).toBeCloseTo(200 * Math.cos(Math.PI / n));
    }
  });

  it("sag each thread toward the hub at the deepest curve, its middle STRAND_DEPTH of its span inside the straight line, its ends still on the spokes at the ring's radius", () => {
    for (const n of [8, 48]) {
      const shape = shapeOf(n, 1);
      for (const r of [shape.hub, ranks[0].r, ranks[ranks.length - 1].r, 2000]) {
        const span = 2 * r * Math.sin(Math.PI / n);
        expect(strandSag(shape, r)).toBeCloseTo(STRAND_DEPTH * span);
        for (const i of [0, n / 2 - 1, n - 1]) {
          const { a, b, middle } = thread(shape, r, i);
          expect(Math.hypot(a[0], a[1])).toBeCloseTo(r);
          expect(Math.hypot(b[0], b[1])).toBeCloseTo(r);
          // Its middle on the line from the hub midway between the spokes, nearer the hub than the straight thread's by the sag.
          expect(Math.hypot(middle[0], middle[1])).toBeCloseTo(r * Math.cos(Math.PI / n) - STRAND_DEPTH * span);
          expect(Math.atan2(middle[1], middle[0])).toBeCloseTo(Math.atan2(a[1] + b[1], a[0] + b[0]));
          // Nowhere between the spokes is it outside the ring, nor at the hub.
          for (let t = 0; t <= 1; t += 0.125) expect(Math.hypot(...along(a, thread(shape, r, i).c, b, t))).toBeLessThanOrEqual(r + 1e-9);
          expect(Math.hypot(middle[0], middle[1])).toBeGreaterThan(0.5 * r);
        }
      }
      // The label sits on the top thread's middle, straight up from the hub.
      const top = thread(shape, 200, shape.spokes.findIndex((s) => Math.abs(wrapAngle(s.angle + Math.PI / 2 + Math.PI / n)) < 1e-9));
      expect(top.middle[0]).toBeCloseTo(0);
      expect(top.middle[1]).toBeCloseTo(-ringTop(shape, 200));
    }
    // Halfway, half as deep; past the ends of the range, held to them.
    expect(strandSag(shapeOf(30, 0.5), 200)).toBeCloseTo(strandSag(shapeOf(30, 1), 200) / 2);
    expect(shapeOf(30, 3).curve).toBe(1);
    expect(shapeOf(30, -1).curve).toBe(0);
  });
});

describe("the strands", () => {
  it("are placed at the zoom", () => {
    expect(xy({ angle: 0, r: 10 }, 3)).toEqual([30, 0]);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});
