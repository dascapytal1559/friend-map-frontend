import { describe, expect, it } from "vitest";
import { contrast, identicon, identiconSeedOf, oklab } from "../identicon.ts";
import type { DemoPerson } from "./model.ts";
import {
  centreOnIcons, directions, displacementTrail, drawnSize, EVEN_LAST, FIT_TURN, fitNames, boxesMeet, evenFraction, glowColour, glowOf, HEARTH, hearth, hearthGlowRadius, movesVisibly, NAME_GLOW, NAME_TINT, nameColour, nameGlow, namedIds, orbitRadius, placeBodies, rankFraction, textUnits, READABLE, rings, personOpacity, TIER_FLOOR, TIERS, tierOpacity, trailStartRank, wrap,
  type Aimed, type Box, type Drawn, type FitName, type Placed,
} from "./orbitsLayout.ts";
import { COLORS } from "./palette.ts";

function person(id: number, name: string, community: number, total = 10): DemoPerson {
  return {
    id, name, aliases: [], tags: [], note: "", shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null, unknown: false, total, direct: total, directFromMe: 0, directFromThem: total,
    groupFromMe: 0, groupFromThem: 0, myShare: 0, openingsByMe: 0, openingsByThem: 0, reactionsFromMe: 0,
    reactionsFromThem: 0, firstAt: null, lastAt: null, series: [], seriesMe: [], seriesThem: [], closeness: [], rank: [], community,
  };
}

describe("distance by closeness rank", () => {
  it("runs from 0 for the closest to 1 for the last, further out for a lower rank", () => {
    expect(rankFraction(1, 700)).toBe(0);
    expect(rankFraction(700, 700)).toBeCloseTo(1);
    expect(rankFraction(900, 700)).toBeCloseTo(1);
    expect(rankFraction(0, 700)).toBe(0);
    expect(rankFraction(1, 1)).toBe(0);
    for (let r = 1; r < 700; r++) expect(rankFraction(r + 1, 700)).toBeGreaterThan(rankFraction(r, 700));
    // A log scale: the closest ten take about a quarter of the room, the closest hundred about two thirds.
    expect(rankFraction(10.5, 700)).toBeCloseTo(0.26, 1);
    expect(rankFraction(100.5, 700)).toBeCloseTo(0.64, 1);
  });

  it("puts people with no score on the outermost orbit, and the closest next to the sun", () => {
    expect(orbitRadius(null, 40, 300, 120)).toBe(300);
    expect(orbitRadius(1, 40, 300, 120)).toBe(40);
  });

  it("sets whoever you live with in the sun, inside the closest orbit, and moves nobody else", () => {
    const [inner, outer, count] = [40, 300, 120];
    // Two live together: ranks 1 and 2 are theirs, in the sun.
    expect(orbitRadius(1, inner, outer, count, 2)).toBe(inner * HEARTH);
    expect(orbitRadius(2, inner, outer, count, 2)).toBe(inner * HEARTH);
    expect(inner * HEARTH).toBeLessThan(inner);
    // The closest of the rest sits on the closest orbit, and the last of them at the edge, as with nobody tagged.
    expect(orbitRadius(3, inner, outer, count, 2)).toBe(inner);
    expect(orbitRadius(count, inner, outer, count, 2)).toBeCloseTo(outer);
    expect(orbitRadius(12, inner, outer, count, 2)).toBeCloseTo(orbitRadius(10, inner, outer, count - 2));
  });

  it("spaces whoever you live with evenly round the sun, the first in their own direction", () => {
    const aim = new Map([[7, { angle: 1, lo: 0, hi: 2 }], [3, { angle: 2.5, lo: 2, hi: 3 }], [9, { angle: -1, lo: -2, hi: 0 }]]);
    const placed = hearth([7, 3, 9], aim, 50);
    // In the order of their own directions: 9, 7, 3, from 9's.
    expect([9, 7, 3].map((id) => placed.get(id)!.angle)).toEqual([-1, -1 + (2 * Math.PI) / 3, -1 + (4 * Math.PI) / 3]);
    for (const p of placed.values()) {
      expect(p.r).toBe(50 * HEARTH);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(50 * HEARTH);
    }
    // One alone keeps their own spoke.
    expect(hearth([3], aim, 50).get(3)!.angle).toBe(2.5);
    expect(hearth([], aim, 50).size).toBe(0);
  });

  it("draws the closest-10, 25, 50… bands that there are people to fill", () => {
    expect(rings(120).map((r) => r.label)).toEqual(["top 10", "top 25", "top 50"]);
    expect(rings(12).map((r) => r.label)).toEqual([]);
    expect(rings(705).map((r) => r.label)).toEqual(["top 10", "top 25", "top 50", "top 100", "top 250", "top 500"]);
    // Between the last person inside and the first outside.
    expect(rings(120)[0].rank).toBe(10.5);
  });

  it("keeps every ring clear of the next and inside the edge", () => {
    const [inner, outer] = [85, 530];
    for (const count of [60, 120, 705, 3000]) {
      const radii = rings(count).map((r) => orbitRadius(r.rank, inner, outer, count));
      for (let i = 1; i < radii.length; i++) expect(radii[i] - radii[i - 1]).toBeGreaterThan(20);
      expect(radii.at(-1)!).toBeLessThan(outer - 10);
    }
  });
});

describe("the even scale, the Spider web's", () => {
  const [inner, outer, count] = [40, 300, 700];
  const even = (rank: number | null, together = 0) => orbitRadius(rank, inner, outer, count, together, "even");

  it("draws the closest 10, 25, 50, 100 and 250, never 500 or beyond, and only the bands there are people to fill", () => {
    expect(rings(count, "even").map((r) => r.label)).toEqual(["top 10", "top 25", "top 50", "top 100", "top 250"]);
    expect(rings(3000, "even").map((r) => r.label)).toEqual(["top 10", "top 25", "top 50", "top 100", "top 250"]);
    expect(rings(120, "even")).toEqual(rings(120));
    expect(rings(count, "even").at(-1)!.rank).toBe(EVEN_LAST + 0.5);
  });

  it("spaces the rings evenly: every band, from the closest orbit to the first ring, ring to ring, and past the last to the edge, the same", () => {
    for (const n of [120, 700, 3000]) {
      const guides = rings(n, "even");
      const stops = [inner, ...guides.map((ring) => orbitRadius(ring.rank, inner, outer, n, 0, "even")), outer];
      const band = (outer - inner) / (guides.length + 1);
      for (let i = 1; i < stops.length; i++) expect(stops[i] - stops[i - 1]).toBeCloseTo(band);
    }
  });

  it("keeps the rings true: rank 10 just inside the top 10 ring and rank 11 just outside, and so on for each", () => {
    for (const ring of rings(count, "even")) {
      const at = even(ring.rank);
      const last = ring.rank - 0.5;
      expect(even(last)).toBeLessThan(at);
      expect(even(last + 1)).toBeGreaterThan(at);
      // Within a tenth of a band of it, either side.
      expect(at - even(last)).toBeLessThan((outer - inner) / 6 / 10);
      expect(even(last + 1) - at).toBeLessThan((outer - inner) / 6 / 10);
    }
  });

  it("spreads people evenly by rank within each band, in their order, everyone past the closest 250 out to the edge", () => {
    expect(even(1)).toBe(inner);
    expect(even(count)).toBeCloseTo(outer);
    expect(even(null)).toBe(outer);
    for (let r = 1; r < count; r++) expect(even(r + 1)).toBeGreaterThan(even(r));
    // A straight run within a band: the same step from one rank to the next.
    expect(even(40) - even(30)).toBeCloseTo(even(50) - even(40));
    expect(even(400) - even(300)).toBeCloseTo(even(600) - even(500));
    expect(evenFraction(1, 1, [])).toBe(0);
    expect(evenFraction(0, 700, [10.5])).toBe(0);
    expect(evenFraction(900, 700, [10.5])).toBe(1);
  });

  it("sets whoever you live with in the sun and lays the rest, and the rings, as if they were not there", () => {
    expect(even(1, 2)).toBe(inner * HEARTH);
    expect(even(3, 2)).toBe(inner);
    // The top 10 ring still falls between the tenth and the eleventh, counting them.
    const top10 = even(10.5, 2);
    expect(even(10, 2)).toBeLessThan(top10);
    expect(even(11, 2)).toBeGreaterThan(top10);
    expect(top10).toBeCloseTo(inner + (outer - inner) / 6);
  });

  it("is Orbits' own scale unless asked for", () => {
    expect(orbitRadius(40, inner, outer, count)).toBe(orbitRadius(40, inner, outer, count, 0, "log"));
    expect(orbitRadius(40, inner, outer, count)).not.toBeCloseTo(even(40));
  });
});

describe("glowOf", () => {
  it("glows for everyone you should reach out to, and nobody else", () => {
    expect(glowOf({ ...person(1, "Ada", 0), shouldReachOut: true })).toBe(1);
    expect(glowOf(person(2, "Bea", 0))).toBe(0);
  });

  it("follows the flag, not a tag or how much you talk", () => {
    // The old glow took the should-call tag, and before that a standing; a busy friend tagged so but not flagged has none.
    const tagged: DemoPerson = { ...person(1, "Ada", 0, 500), tags: ["should-call"] };
    expect(glowOf(tagged)).toBe(0);
    expect(glowOf({ ...person(1, "Ada", 0, 1), shouldReachOut: true })).toBe(1);
  });
});

describe("directions", () => {
  const TOP = -Math.PI / 2;

  it("spreads everyone evenly round the sun, A to Z clockwise from the top, with the top kept clear", () => {
    const people = [person(3, "cy", 0), person(1, "Bo", 0), person(2, "Ada", 1), person(4, "Émile", -1)];
    const aim = directions(people, 0.2);
    const order = [...aim].sort((a, b) => a[1].angle - b[1].angle).map(([id]) => id);
    expect(order).toEqual([2, 1, 3, 4]);
    const space = (2 * Math.PI - 0.2) / 4;
    expect(aim.get(2)!.angle).toBeCloseTo(TOP + 0.1 + space / 2);
    expect(aim.get(1)!.angle - aim.get(2)!.angle).toBeCloseTo(space);
    expect(aim.get(4)!.angle).toBeCloseTo(TOP + 2 * Math.PI - 0.1 - space / 2);
  });

  it("places people by name alone: no slices, whatever their friend group or group chats", () => {
    const grouped = [person(1, "Ada", 0), person(2, "Bo", 1), person(3, "Cy", 0), person(4, "Di", 1)];
    const regrouped = grouped.map((p, i) => ({ ...p, community: i % 2 === 0 ? 5 : -1 }));
    expect(directions(regrouped, 0.2)).toEqual(directions(grouped, 0.2));
    // Two people in the same group are not drawn together: Ada and Cy sit two spaces apart, with Bo between.
    const aim = directions(grouped, 0.2);
    expect(aim.get(2)!.angle).toBeGreaterThan(aim.get(1)!.angle);
    expect(aim.get(2)!.angle).toBeLessThan(aim.get(3)!.angle);
  });

  it("moves everyone else only a little when someone new arrives", () => {
    const crowd = Array.from({ length: 40 }, (_, i) => person(i + 1, `Person ${String(i).padStart(2, "0")}`, 0));
    const before = directions(crowd, 0.2);
    const after = directions([...crowd, person(99, "Person 20a", 0)], 0.2);
    const space = (2 * Math.PI - 0.2) / 40;
    for (const p of crowd) expect(Math.abs(after.get(p.id)!.angle - before.get(p.id)!.angle)).toBeLessThanOrEqual(space);
  });

  it("lets each be pushed a couple of spaces either way, but not into the gap at the top", () => {
    const aim = directions(Array.from({ length: 10 }, (_, i) => person(i, `P${i}`, 0)), 0.3, 2);
    const space = (2 * Math.PI - 0.3) / 10;
    const [first, second, , , , , , , , last] = [...aim.values()];
    expect(second.hi - second.angle).toBeCloseTo(2 * space);
    expect(second.angle - second.lo).toBeCloseTo(space * 1.5);
    expect(second.lo).toBeCloseTo(TOP + 0.15);
    expect(first.lo).toBeCloseTo(TOP + 0.15);
    expect(last.hi).toBeCloseTo(TOP + 2 * Math.PI - 0.15);
  });
});

describe("placeBodies", () => {
  const crowd = Array.from({ length: 30 }, (_, i) => person(i + 1, `P${String(i).padStart(2, "0")}`, i % 3, 100 - i));
  const aim = directions(crowd, 0.2);
  const bodies: Aimed[] = crowd.map((p, i) => ({ id: p.id, orbit: 60 + (i % 5) * 4, size: 6, ...aim.get(p.id)! }));

  const expectNoOverlaps = (placed: Map<number, { x: number; y: number }>, sizeOf: (id: number) => number, padding: number) => {
    const list = [...placed];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, pa] = list[i];
        const [b, pb] = list[j];
        expect(Math.hypot(pa.x - pb.x, pa.y - pb.y)).toBeGreaterThanOrEqual(sizeOf(a) + sizeOf(b) + padding - 0.02);
      }
    }
  };

  it("leaves no two bodies overlapping, even when a crowd starts on top of each other", () => {
    expectNoOverlaps(placeBodies(bodies, { padding: 1 }), () => 6, 1);
  });

  it("leaves no overlaps in a big crowd of mixed sizes, most of it near the sun", () => {
    const many = Array.from({ length: 150 }, (_, i) => person(i + 1, `Someone ${i}`, 0));
    const spots = directions(many, 0.2);
    const size = (id: number) => 2.6 + (id % 7) * 1.8;
    const list: Aimed[] = many.map((p, i) => ({ id: p.id, orbit: 40 + (i % 4 === 0 ? 0 : (i * 37) % 260), size: size(p.id), ...spots.get(p.id)! }));
    expectNoOverlaps(placeBodies(list, { padding: 1.5, giveIn: 4, giveOut: 40, minR: 36 }), size, 1.5);
  });

  it("keeps everyone within reach of their direction and never nearer the sun than their orbit allows", () => {
    const placed = placeBodies(bodies, { giveIn: 2, minR: 55 });
    for (const body of bodies) {
      const p = placed.get(body.id)!;
      expect(p.angle).toBeGreaterThanOrEqual(body.lo - 1e-9);
      expect(p.angle).toBeLessThanOrEqual(body.hi + 1e-9);
      expect(p.r).toBeGreaterThanOrEqual(Math.max(55, body.orbit - 2) - 1e-9);
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(p.r);
    }
  });

  it("keeps people on their true orbit and in their own direction when there is room", () => {
    const few = directions([person(1, "A", 0), person(2, "B", 0), person(3, "C", 1)], 0.2);
    const placed = placeBodies([
      { id: 1, orbit: 100, size: 4, ...few.get(1)! },
      { id: 2, orbit: 200, size: 4, ...few.get(2)! },
      { id: 3, orbit: 150, size: 4, ...few.get(3)! },
    ]);
    for (const [id, orbit] of [[1, 100], [2, 200], [3, 150]]) {
      expect(placed.get(id)!.r).toBeCloseTo(orbit);
      expect(placed.get(id)!.angle).toBeCloseTo(few.get(id)!.angle);
    }
  });

  it("is deterministic", () => {
    expect([...placeBodies(bodies)]).toEqual([...placeBodies(bodies)]);
  });

  it("keeps every body's edge off the sun", () => {
    const placed = placeBodies(bodies.map((b) => ({ ...b, orbit: 50 })), { minR: 55 });
    for (const p of placed.values()) expect(p.r - 6).toBeGreaterThanOrEqual(55 - 1e-9);
  });

  it("places some 700 people ranked by closeness without overlaps, off the sun, near their orbits", () => {
    // Shaped like a real history: most people a few dozen messages, a few thousands, and those with the most
    // messages mostly (not always) the closest, so the biggest bodies crowd the smallest orbits.
    const [inner, outer] = [85, 530];
    const random = seeded(7);
    const people = Array.from({ length: 700 }, (_, i) => person(i + 1, `Person ${i}`, 0, 1 + Math.floor(1000 * random() ** 6)));
    const order = people.map((p) => ({ id: p.id, key: p.total * (0.2 + random()) })).sort((a, b) => b.key - a.key);
    const rank = new Map(order.map((p, i) => [p.id, i + 1]));
    const aim = directions(people, 0.26);
    const bodies: Aimed[] = people.map((p) => ({
      id: p.id, orbit: orbitRadius(rank.get(p.id)!, inner, outer, 700), size: 2.8 + 12 * Math.sqrt(p.total / 1000), ...aim.get(p.id)!,
    }));
    const sizeOf = new Map(bodies.map((b) => [b.id, b.size]));
    const giveOut = (outer - inner) * 0.12 + 8;
    const placed = placeBodies(bodies, { giveIn: 4, giveOut, minR: inner * 0.92 });
    expectNoOverlaps(placed, (id) => sizeOf.get(id)!, 1.5);
    for (const body of bodies) {
      const p = placed.get(body.id)!;
      expect(p.r - body.size).toBeGreaterThanOrEqual(inner * 0.92 - 1e-9);
      expect(p.r).toBeGreaterThanOrEqual(body.orbit - 4 - 1e-9);
      expect(p.r).toBeLessThanOrEqual(Math.max(body.orbit + giveOut, inner * 0.92 + body.size) + 1e-9);
    }
    // The closest ten stay inside the closest-25 ring, clear of the crowd beyond it.
    const ring25 = orbitRadius(25.5, inner, outer, 700);
    for (const [id, r] of rank) if (r <= 10) expect(placed.get(id)!.r).toBeLessThan(ring25);
  });
});

/** A small seeded random number generator, for made-up crowds that are the same every run. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fitNames", () => {
  // Names as long and tall as a full-size name of a dozen letters, centred on their people.
  const name = (id: number, half = 40, fixed?: boolean): FitName => ({ id, box: { left: -half, right: half, top: -8, bottom: 8 }, ...(fixed ? { fixed } : {}) });
  const at = (id: number, angle: number, r: number): [number, Placed] => [id, { id, angle, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r }];
  const boxOf = (n: FitName, p: Placed): Box => ({ left: p.x + n.box.left, right: p.x + n.box.right, top: p.y + n.box.top, bottom: p.y + n.box.bottom });
  const clear = (names: FitName[], placed: Map<number, Placed>) =>
    names.every((a, i) => names.slice(i + 1).every((b) => !boxesMeet(boxOf(a, placed.get(a.id)!), boxOf(b, placed.get(b.id)!))));
  const degrees = (radians: number) => (radians * 180) / Math.PI;

  it("turns a further person aside just far enough to clear a closer one's name, at the same distance from the sun", () => {
    // Two people a degree apart on the left, 200 pixels out: their names cover each other.
    const placed = new Map([at(1, Math.PI, 200), at(2, Math.PI + 0.017, 200), at(3, 0, 200)]);
    const names = [name(1), name(2)];
    const fitted = fitNames(placed, names);
    expect(fitted.get(1)).toEqual(placed.get(1));
    expect(fitted.get(2)!.r).toBe(200);
    expect(clear(names, fitted)).toBe(true);
    // Only as far as its 16-pixel-tall name needs: a few degrees, not to the far side.
    expect(degrees(Math.abs(wrap(fitted.get(2)!.angle - Math.PI)))).toBeLessThan(6);
    // Whoever is not named stays exactly where they were.
    expect(fitted.get(3)).toBe(placed.get(3));
  });

  it("moves nobody whose name is already clear, and keeps names in their order round the sun where it can", () => {
    const placed = new Map([at(1, 0, 150), at(2, Math.PI / 2, 150), at(3, Math.PI, 150)]);
    expect(fitNames(placed, [name(1), name(2), name(3)])).toEqual(placed);
  });

  it("gives the closer person, first in the list, their own place, whichever is nearer the sun", () => {
    const placed = new Map([at(1, Math.PI, 205), at(2, Math.PI + 0.01, 200)]);
    expect(fitNames(placed, [name(2), name(1)]).get(2)).toEqual(placed.get(2));
    expect(fitNames(placed, [name(1), name(2)]).get(1)).toEqual(placed.get(1));
  });

  it("never moves someone fixed (in the sun), fitting the rest round them", () => {
    const placed = new Map([at(1, Math.PI, 30), at(2, Math.PI + 0.1, 40)]);
    const names = [name(2), name(1, 40, true)];
    const fitted = fitNames(placed, names);
    expect(fitted.get(1)).toEqual(placed.get(1));
    expect(clear(names, fitted)).toBe(true);
  });

  it("keeps names off the marks round them, as off each other", () => {
    // A ring label straight up from the sun, 200 out, and someone whose name lands on it.
    const label = { left: -30, right: 30, top: -208, bottom: -194 };
    const placed = new Map([at(1, -Math.PI / 2 + 0.05, 200)]);
    const p = fitNames(placed, [name(1, 25)], { around: [label] }).get(1)!;
    expect(p.r).toBe(200);
    expect(boxesMeet(boxOf(name(1, 25), p), label)).toBe(false);
  });

  // How far apart two boxes are, ink to ink: the larger of the gaps across and up and down (below 0 where they overlap).
  const apart = (a: Box, b: Box) => Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);

  it("keeps names `pad` pixels apart up and down, turning a further one only as far as that needs", () => {
    const placed = new Map([at(1, Math.PI, 200), at(2, Math.PI + 0.017, 200)]);
    const names = [name(1), name(2)];
    for (const pad of [0, 2, 5]) {
      const fitted = fitNames(placed, names, { pad });
      const gap = apart(boxOf(names[0], fitted.get(1)!), boxOf(names[1], fitted.get(2)!));
      expect(fitted.get(1)).toEqual(placed.get(1));
      expect(gap).toBeGreaterThanOrEqual(pad - 1e-9);
      // A pixel along the orbit at a time: no more than a step past it.
      expect(gap).toBeLessThan(pad + 1.5);
    }
  });

  it("keeps names `pad` pixels apart across, moving one only once they are closer than that", () => {
    // Two names on the same spoke, 82 pixels apart on 80-pixel names: 2 pixels between them, side by side.
    const placed = new Map([at(1, Math.PI, 200), at(2, Math.PI, 282)]);
    const names = [name(1), name(2)];
    for (const pad of [0, 2]) expect(fitNames(placed, names, { pad })).toEqual(placed);
    const fitted = fitNames(placed, names, { pad: 3 });
    expect(fitted.get(2)!.angle).not.toBe(Math.PI);
    expect(apart(boxOf(names[0], fitted.get(1)!), boxOf(names[1], fitted.get(2)!))).toBeGreaterThanOrEqual(3 - 1e-9);
  });

  it("keeps `pad` pixels between a name and the marks round it too", () => {
    const label = { left: -30, right: 30, top: -208, bottom: -194 };
    const placed = new Map([at(1, -Math.PI / 2 + 0.05, 200)]);
    for (const pad of [0, 4]) {
      const p = fitNames(placed, [name(1, 25)], { around: [label], pad }).get(1)!;
      expect(apart(boxOf(name(1, 25), p), label)).toBeGreaterThanOrEqual(pad - 1e-9);
    }
  });

  it("never turns anyone into the gap at the top, nor further than FIT_TURN", () => {
    const top = 0.26;
    // Five names crowding the first spoke clockwise of the gap, and five round the ring's other side.
    const placed = new Map(Array.from({ length: 10 }, (_, i) => at(i + 1, (i < 5 ? -Math.PI / 2 + top / 2 : Math.PI / 2) + (i % 5) * 0.001, 120 + (i % 5))));
    const names = Array.from({ length: 10 }, (_, i) => name(i + 1));
    const fitted = fitNames(placed, names, { topGap: top });
    for (const [id, p] of fitted) {
      expect(p.angle).toBeGreaterThanOrEqual(-Math.PI / 2 + top / 2);
      expect(p.angle).toBeLessThanOrEqual(-Math.PI / 2 - top / 2 + 2 * Math.PI);
      expect(Math.abs(p.angle - placed.get(id)!.angle)).toBeLessThanOrEqual(FIT_TURN + 1e-9);
    }
  });

  it("where no angle within reach is clear, takes the one where its name covers the least", () => {
    // A ring of names shoulder to shoulder at 60 pixels out, with nowhere clear left: the last still moves to cover less.
    const placed = new Map(Array.from({ length: 12 }, (_, i) => at(i + 1, -Math.PI / 2 + 0.2 + (i * (2 * Math.PI - 0.4)) / 12, 60)));
    placed.set(13, at(13, 0.05, 60)[1]);
    const names = Array.from({ length: 13 }, (_, i) => name(i + 1, 12));
    const fitted = fitNames(placed, names, { topGap: 0.26 });
    const covered = (p: Placed) => names.slice(0, 12).reduce((sum, n) => {
      const [a, b] = [boxOf(name(13, 12), p), boxOf(n, fitted.get(n.id)!)];
      return sum + Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    }, 0);
    expect(covered(fitted.get(13)!)).toBeLessThan(covered(placed.get(13)!));
    expect(fitted.get(13)!.r).toBe(60);
  });

  it("gives the same places for the same people every time, and someone further out added moves none of the closer", () => {
    const placed = new Map(Array.from({ length: 40 }, (_, i) => at(i + 1, -Math.PI / 2 + 0.2 + i * 0.15, 120 + i * 5)));
    const names = Array.from({ length: 40 }, (_, i) => name(i + 1, 12 + (i % 7) * 4));
    const fitted = fitNames(placed, names, { topGap: 0.26 });
    expect(fitNames(placed, names, { topGap: 0.26 })).toEqual(fitted);
    expect(clear(names, fitted)).toBe(true);
    expect(names.filter((n) => fitted.get(n.id)!.angle !== placed.get(n.id)!.angle).length).toBeGreaterThan(5);
    const more = fitNames(new Map([...placed, at(41, 1, 330)]), [...names, name(41)], { topGap: 0.26 });
    for (const n of names) expect(more.get(n.id)).toEqual(fitted.get(n.id));
  });
});

describe("namedIds", () => {
  it("names the closest people as of the month shown, and nobody with no score", () => {
    const people = [
      { id: 1, rank: [0, 2, 3] },
      { id: 2, rank: [1, 1, 1] },
      { id: 3, rank: [0, 0, 2] },
      { id: 4, rank: [0, 0, 0] },
    ];
    expect(namedIds(people, 2, 2)).toEqual([2, 3]);
    expect(namedIds(people, 2, 10)).toEqual([2, 3, 1]);
    expect(namedIds(people, 0, 10)).toEqual([2]);
  });
});

describe("a name's width", () => {
  it("counts a wide character (CJK, kana, Hangul, full-width, emoji) as two Latin widths, and Latin as one", () => {
    expect(textUnits("Ada Proxy")).toBe("Ada Proxy".length);
    expect(textUnits("Zoë")).toBe(3);
    expect(textUnits("赵小红")).toBe(6);
    expect(textUnits("さくら")).toBe(6);
    expect(textUnits("민준")).toBe(4);
    expect(textUnits("ＡＢ")).toBe(4);
    expect(textUnits("Mia 🌸")).toBe(6);
    expect(textUnits("👩‍👧")).toBe(4);
    expect(textUnits("张三 Liu")).toBe(8);
    // A name centred on its body is that many average widths across: a Chinese name a full em a character.
    const [latin, chinese] = centreOnIcons([{ id: 1, x: 0, y: 0, text: "Ada Proxy" }, { id: 2, x: 0, y: 0, text: "赵小红" }]);
    expect(latin.right - latin.left).toBeCloseTo(9 * 6.6);
    expect(chinese.right - chinese.left).toBeGreaterThanOrEqual(3 * 12.5);
  });
});

describe("tiers", () => {
  it("follows the guide rings, from full strength for the closest 10 to 40% for the 51st to 100th, evenly between", () => {
    expect(TIERS.map((t) => t.closest)).toEqual([10, 25, 50, 100]);
    expect([1, 10, 11, 25, 26, 50, 51, 100].map((place) => tierOpacity(place))).toEqual([1, 1, 0.8, 0.8, 0.6, 0.6, 0.4, 0.4]);
    TIERS.slice(1).forEach((t, i) => expect(TIERS[i].opacity - t.opacity).toBeCloseTo(0.2));
  });

  it("draws everyone past the closest 100, and the belt with no closeness, at the 20% floor", () => {
    expect(TIER_FLOOR).toBe(0.2);
    for (const place of [101, 250, 501, 20_000, Infinity, null]) expect(tierOpacity(place)).toBe(0.2);
  });

  it("draws someone to reach out to at least as strongly as the last named tier, keeping a higher tier of their own", () => {
    expect([1, 11, 26, 51, 100].map((place) => personOpacity(place, true))).toEqual([1, 0.8, 0.6, 0.4, 0.4]);
    for (const place of [101, 20_000, null]) {
      expect(personOpacity(place, true)).toBe(0.4);
      expect(personOpacity(place, false)).toBe(0.2);
    }
  });

  it("takes the reach-out floor from the tier table, so changing the table moves it", () => {
    const tiers = [{ closest: 10, opacity: 1 }, { closest: 50, opacity: 0.7 }];
    expect(personOpacity(300, true, tiers)).toBe(0.7);
    expect(personOpacity(5, true, tiers)).toBe(1);
    expect(personOpacity(300, false, tiers)).toBe(0.2);
  });
});

describe("glow colours", () => {
  const seed = identiconSeedOf(7, 1_700_000_000_000);

  it("glows in the person's own identicon main colour", () => {
    expect(glowColour(seed, null)).toBe(identicon(seed).main);
    expect(glowColour(identiconSeedOf(8, 1_700_000_000_000), null)).not.toBe(glowColour(seed, null));
  });

  it("haloes a glowing name in that colour, as strong as the glow, and leaves every other name alone", () => {
    const colour = glowColour(seed, null);
    expect(nameGlow(colour, 0)).toBeUndefined();
    expect(nameGlow(colour, 0.01)).toBeUndefined();
    const alpha = Math.round(255 * NAME_GLOW.alpha).toString(16).padStart(2, "0");
    expect(nameGlow(colour, 1)).toBe(`drop-shadow(0 0 ${NAME_GLOW.blur.toFixed(2)}px ${colour}${alpha})`);
    // Halfway through fading in, half the reach and half the strength.
    const half = Math.round(255 * NAME_GLOW.alpha * 0.5).toString(16).padStart(2, "0");
    expect(nameGlow(colour, 0.5)).toBe(`drop-shadow(0 0 ${(NAME_GLOW.blur / 2).toFixed(2)}px ${colour}${half})`);
    // Subtle: a few pixels at most, never fully opaque, so the name stays sharp.
    expect(NAME_GLOW.blur).toBeLessThanOrEqual(4);
    expect(NAME_GLOW.alpha).toBeLessThan(1);
  });
});

describe("name colours", () => {
  // Seeds as People gives them; the night sky at its darkest and at its lightest, round the sun.
  const seeds = Array.from({ length: 5000 }, (_, i) => identiconSeedOf(i + 1, 1_700_000_000_000 + i * 3_217));
  const [NIGHT, SKY] = ["#070b16", "#121b33"];
  const hue = (hex: string) => { const [, a, b] = oklab(hex); return (Math.atan2(b, a) * 180) / Math.PI; };
  const chroma = (hex: string) => { const [, a, b] = oklab(hex); return Math.hypot(a, b); };

  it("tints each name halfway from its identicon's main colour to the plain light text", () => {
    expect(NAME_TINT).toBe(0.5);
    const seed = seeds[0];
    expect(nameColour(seed, null)).toBe(nameColour(seed, null));
    const [name, main, star] = [oklab(nameColour(seed, null)), oklab(identicon(seed).main), oklab(COLORS.star)];
    name.forEach((v, i) => expect(v).toBeCloseTo((main[i] + star[i]) / 2, 2));
  });

  it("keeps the identicon's hue, clearly coloured, so a name matches its marker", () => {
    for (const seed of seeds) {
      const turn = Math.abs(hue(nameColour(seed, null)) - hue(identicon(seed).main)) % 360;
      expect(Math.min(turn, 360 - turn)).toBeLessThan(15);
      expect(chroma(nameColour(seed, null))).toBeGreaterThan(1.8 * chroma(COLORS.star));
    }
  });

  it("reads easily on the night sky, well above the 4.5:1 text needs", () => {
    const worst = Math.min(...seeds.flatMap((seed) => [contrast(nameColour(seed, null), NIGHT), contrast(nameColour(seed, null), SKY)]));
    expect(worst).toBeGreaterThan(10);
  });
});

describe("markers as drawn", () => {
  it("keeps a marker its size unzoomed, and one already big enough to read whatever the zoom", () => {
    expect(drawnSize(3, 1)).toBe(3);
    expect(drawnSize(READABLE + 4, 1)).toBe(READABLE + 4);
    expect(drawnSize(READABLE + 4, 8)).toBe(READABLE + 4);
  });

  it("grows a small one with the zoom, never faster, until its identicon can be read", () => {
    expect(drawnSize(3, 2)).toBe(6);
    expect(drawnSize(3, 2.5)).toBe(7.5);
    expect(drawnSize(3, 12)).toBe(READABLE);
    // Two markers placed just clear of each other stay clear: the room between them grows with the zoom, and they no faster.
    for (const k of [1, 1.5, 2, 3, 6, 12]) expect(drawnSize(3, k) + drawnSize(5, k)).toBeLessThanOrEqual((3 + 5) * k);
  });
});

describe("angles", () => {
  it("wraps angle differences into (-π, π]", () => {
    expect(wrap(0.5)).toBeCloseTo(0.5);
    expect(wrap(2 * Math.PI + 0.5)).toBeCloseTo(0.5);
    expect(wrap(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5);
    expect(wrap(Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe("movesVisibly", () => {
  const body = (extra: Partial<Drawn> = {}): Drawn => ({ angle: 1, r: 200, size: 6, glow: 0, opacity: 1, silent: false, ...extra });
  const map = (...bodies: Drawn[]) => new Map(bodies.map((b, i) => [i, b]));

  it("takes a change nobody would see (a new message growing someone a hair) in one step", () => {
    expect(movesVisibly(map(body(), body()), map(body(), body({ size: 6.2, r: 200.3, angle: 1.001 })))).toBe(false);
  });

  it("animates a move, a growth, a fade or a glow one can see, and anyone new", () => {
    expect(movesVisibly(map(body()), map(body({ r: 190 })))).toBe(true);
    expect(movesVisibly(map(body()), map(body({ angle: 1.01 })))).toBe(true);
    expect(movesVisibly(map(body()), map(body({ size: 7 })))).toBe(true);
    expect(movesVisibly(map(body()), map(body({ opacity: 0 })))).toBe(true);
    expect(movesVisibly(map(body()), map(body({ glow: 1 })))).toBe(true);
    expect(movesVisibly(map(body()), map(body({ silent: true })))).toBe(true);
    expect(movesVisibly(map(body()), map(body(), body()))).toBe(true);
  });
});

describe("comet trails", () => {
  it("starts where they ranked at the start of the window, or in their first month in it", () => {
    // A score from month 2 on.
    const rank = [0, 0, 40, 31, 22, 9, 5, 4];
    // As of month 7 over 3 months: month 4.
    expect(trailStartRank(rank, 7, 3)).toBe(22);
    // Over 12 months, the window reaches before they had a score: month 2, their first.
    expect(trailStartRank(rank, 7, 12)).toBe(40);
    expect(trailStartRank([0, 0, 3], 2, 12)).toBeNull();
  });

  it("runs straight along the radius from the head back to where they sat, tapering to a point", () => {
    const head = { angle: 0.3, r: 100 };
    const trail = displacementTrail(head, 160, { width: 10, minShift: 6 })!;
    // Drifting closer: the tail is further out, in the same direction.
    expect(Math.hypot(...trail.tail)).toBeCloseTo(160);
    expect(Math.atan2(trail.tail[1], trail.tail[0])).toBeCloseTo(0.3);
    const [left, tip, right] = trail.outline;
    expect(tip).toEqual(trail.tail);
    // Full width at the head, across the radius, centred on it.
    expect(Math.hypot(left[0] - right[0], left[1] - right[1])).toBeCloseTo(10);
    expect(Math.hypot((left[0] + right[0]) / 2, (left[1] + right[1]) / 2)).toBeCloseTo(100);
  });

  it("points inward for someone drifting apart", () => {
    const trail = displacementTrail({ angle: -2, r: 150 }, 90, { width: 4, minShift: 6 })!;
    expect(Math.hypot(...trail.tail)).toBeCloseTo(90);
    expect(Math.atan2(trail.tail[1], trail.tail[0])).toBeCloseTo(-2);
  });

  it("draws nothing for a move smaller than minShift", () => {
    expect(displacementTrail({ angle: 0, r: 100 }, 104, { width: 4, minShift: 6 })).toBeNull();
    expect(displacementTrail({ angle: 0, r: 100 }, 100, { width: 4, minShift: 6 })).toBeNull();
    expect(displacementTrail({ angle: 0, r: 100 }, 94, { width: 4, minShift: 6 })).not.toBeNull();
  });
});

describe("hearthGlowRadius", () => {
  it("glows round whoever you live with, smaller than the sun's glow but past their marker", () => {
    expect(hearthGlowRadius(6, 100)).toBeLessThan(100 * 0.95 / 2);
    expect(hearthGlowRadius(6, 100)).toBeGreaterThan(6);
    expect(hearthGlowRadius(30, 40)).toBeGreaterThan(30);
  });
});
