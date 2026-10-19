// Friend circles, Orbits' other order round the sun: the same people and chats
// always give the same order, people who share group chats end up side by
// side, related circles sit together, the ring is balanced with the big
// circles spread round it and clear gaps between circles, and the A to Z order
// is untouched.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSaved } from "../savedStore.ts";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { BIG_SHARE, CIRCLE_GAP, circleLabel, circleTies, friendCircles, groupWeight, line, louvain, PART_GAP, presence, PRESENCE_POWER, type CircleGroup } from "./friendCircles.ts";
import { nameStyleStore } from "../names.ts";
import { buildModel } from "./model.ts";
import { OrbitMap } from "./Orbits.tsx";
import { circleLabelSpot, directions, GAP_SPACE_LEAST, GAPS_MOST, spread, TIER_FLOOR } from "./orbitsLayout.ts";

beforeEach(() => resetSaved());
afterEach(() => resetSaved());

const person = (id: number, name = `P${String(id).padStart(4, "0")}`, tags: string[] = []) => ({ id, name, tags });
const group = (id: number, memberIds: number[], messageCount = 100, size = memberIds.length): CircleGroup => ({ id, memberIds, size, messageCount });
/** Where each id sits in `order`. */
const places = (order: number[]) => new Map(order.map((id, i) => [id, i]));
/** Whether `ids` sit side by side in `order`, in some order. */
const together = (order: number[], ids: number[]) => {
  const at = ids.map((id) => order.indexOf(id)).sort((a, b) => a - b);
  return at[0] >= 0 && at[at.length - 1] - at[0] === ids.length - 1;
};

/** A seeded random number generator (mulberry32), so a made-up crowd is the same every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A made-up map the size of the real map: `count` people, about half of
 * them in friend groups of 4 to 30, each with a few small chats among its own
 * people (and the odd one with a neighbouring group's), a few big chats
 * across groups, and the rest in no group chat at all. Closeness (`rank`,
 * each person's place, 1 for the closest) runs mostly by friend group, a few
 * groups close and most not, with the people in no group chat mostly far out,
 * as on the real map.
 */
export function crowd(count = 1000, seed = 7) {
  const random = seeded(seed);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  const people = Array.from({ length: count }, (_, i) => person(i + 1, `Person ${String(Math.floor(random() * 1e6)).padStart(6, "0")}`));
  const friends: number[][] = [];
  let next = 1;
  while (next < count * 0.55) {
    const size = 4 + Math.floor(random() * 27);
    friends.push(Array.from({ length: size }, (_, i) => next + i).filter((id) => id <= count));
    next += size;
  }
  const groups: CircleGroup[] = [];
  const sample = (from: number[], n: number) => [...from].sort(() => random() - 0.5).slice(0, Math.min(n, from.length));
  for (const [f, members] of friends.entries()) {
    for (let c = 0; c < 2 + Math.floor(members.length / 4); c++) {
      const chat = sample(members, 3 + Math.floor(random() * 9));
      if (random() < 0.15 && friends[f + 1]) chat.push(...sample(friends[f + 1], 2));
      groups.push(group(groups.length + 1, chat, Math.floor(random() ** 3 * 5000)));
    }
  }
  for (let b = 0; b < 6; b++) {
    const chat = friends.flatMap((members) => (random() < 0.3 ? sample(members, 3) : []));
    groups.push(group(groups.length + 1, chat, Math.floor(random() * 300), chat.length * 3));
  }
  const close = seeded(seed + 100);
  const affinity = friends.map(() => close() ** 2);
  const score = new Map<number, number>();
  friends.forEach((members, f) => members.forEach((id) => score.set(id, affinity[f] * 0.75 + close() * 0.25)));
  for (const p of people) if (!score.has(p.id)) score.set(p.id, close() ** 3 * 0.7);
  const rank = new Map([...people].sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.id - b.id).map((p, i) => [p.id, i + 1]));
  return { people, groups, friends, pick, rank };
}

describe("groupWeight", () => {
  it("binds more the smaller the chat, counting everyone in it, on the map or not", () => {
    expect(groupWeight(group(1, [1, 2], 0))).toBe(1);
    expect(groupWeight(group(1, [1, 2, 3], 0))).toBeCloseTo(0.5);
    // Two of its eighty people are on the map: it still binds them as a chat of eighty.
    expect(groupWeight(group(1, [1, 2], 0, 80))).toBeCloseTo(1 / 79);
  });

  it("binds more the busier the chat, on a log scale", () => {
    expect(groupWeight(group(1, [1, 2], 9))).toBeCloseTo(2);
    expect(groupWeight(group(1, [1, 2], 999))).toBeCloseTo(4);
    expect(groupWeight(group(1, [1, 2], 9999))).toBeCloseTo(5);
  });
});

describe("circleTies", () => {
  it("sums the chats each pair shares, both ways round, leaving out people off the map", () => {
    const ties = circleTies([group(1, [1, 2, 3], 0), group(2, [1, 2], 0)], new Set([1, 2]));
    expect(ties.get(1)!.get(2)).toBeCloseTo(1.5);
    expect(ties.get(2)!.get(1)).toBeCloseTo(1.5);
    expect(ties.has(3)).toBe(false);
  });
});

describe("louvain", () => {
  it("splits two tight triangles joined by one weak tie", () => {
    const edges: Array<[number, number, number]> = [[0, 1, 1], [1, 2, 1], [0, 2, 1], [3, 4, 1], [4, 5, 1], [3, 5, 1], [2, 3, 0.1]];
    const graph = Array.from({ length: 6 }, () => new Map<number, number>());
    for (const [a, b, w] of edges) {
      graph[a].set(b, w);
      graph[b].set(a, w);
    }
    expect(louvain(graph)).toEqual([0, 0, 0, 1, 1, 1]);
  });
});

describe("line", () => {
  it("puts each beside whoever it is tied to most", () => {
    // A path 4 - 2 - 7 - 1 - 9, listed out of order.
    const ties = circleTies([group(1, [4, 2]), group(2, [2, 7]), group(3, [7, 1]), group(4, [1, 9])], new Set([1, 2, 4, 7, 9]));
    const order = line([1, 2, 4, 7, 9], ties, 7);
    expect([order, [...order].reverse()]).toContainEqual([4, 2, 7, 1, 9]);
  });
});

describe("friendCircles", () => {
  // Two friend groups whose names interleave A to Z, and two people in no group chat.
  const people = [person(1, "Ada"), person(2, "Bo"), person(3, "Cy"), person(4, "Di"), person(5, "Ed"), person(6, "Flo"), person(7, "Zed"), person(8, "Al")];
  const groups = [group(10, [1, 3, 5]), group(11, [2, 4, 6]), group(12, [1, 5])];

  it("sits people who share group chats side by side, a circle each, and everyone else together A to Z at the end", () => {
    const { order, circles, apart, gaps, weights } = friendCircles(people, groups);
    expect(circles.map((c) => [...c.ids].sort())).toEqual(expect.arrayContaining([[1, 3, 5], [2, 4, 6]]));
    expect(together(order, [1, 3, 5])).toBe(true);
    expect(together(order, [2, 4, 6])).toBe(true);
    // Ada and Ed share two chats: side by side.
    expect(Math.abs(order.indexOf(1) - order.indexOf(5))).toBe(1);
    expect(apart).toEqual([8, 7]);
    expect(order.slice(-2)).toEqual([8, 7]);
    // Both circles are big (a share of everyone of at least BIG_SHARE), so each is a part of its own, as is everyone else.
    expect(gaps).toEqual([{ at: 3, spaces: PART_GAP }, { at: 6, spaces: PART_GAP }]);
    // With no presence given, everyone takes the same room.
    expect(weights).toEqual(order.map(() => 1));
  });

  it("gives the same order for the same people and chats, however they are listed", () => {
    const first = friendCircles(people, groups);
    expect(friendCircles(people, groups)).toEqual(first);
    expect(friendCircles([...people].reverse(), [...groups].reverse())).toEqual(first);
    const { people: many, groups: chats } = crowd(400, 3);
    const once = friendCircles(many, chats);
    const random = seeded(11);
    const shuffle = <T,>(list: T[]) => [...list].sort(() => random() - 0.5);
    expect(friendCircles(shuffle(many), shuffle(chats).map((g) => ({ ...g, memberIds: shuffle([...g.memberIds]) })))).toEqual(once);
  });

  it("sits related circles side by side", () => {
    // Three tight trios; the first and third also share a chat of four with each other, the second ties to nobody else.
    const trios = [person(1), person(2), person(3), person(4), person(5), person(6), person(7), person(8), person(9)];
    const chats = [group(1, [1, 2, 3], 2000), group(2, [4, 5, 6], 2000), group(3, [7, 8, 9], 2000), group(4, [3, 7], 10, 4)];
    const { circles } = friendCircles(trios, chats);
    const sorted = circles.map((c) => [...c.ids].sort()[0]);
    expect(sorted).toHaveLength(3);
    expect(Math.abs(sorted.indexOf(1) - sorted.indexOf(7))).toBe(1);
  });

  it("turns each circle so whoever ties to the circle beside it sits at that end", () => {
    const trios = [person(1), person(2), person(3), person(4), person(5), person(6)];
    const chats = [group(1, [1, 2, 3], 2000), group(2, [4, 5, 6], 2000), group(3, [2, 5], 0, 30)];
    const { order } = friendCircles(trios, chats);
    // 2 and 5 are the bridge between the two circles: they meet where the circles do.
    expect(Math.abs(order.indexOf(2) - order.indexOf(5))).toBe(1);
  });

  it("on a crowd the real map's size, sits people near those they share chats with", () => {
    const { people: many, groups: chats, friends } = crowd();
    const { order, circles } = friendCircles(many, chats);
    expect(new Set(order).size).toBe(many.length);
    expect(order).toHaveLength(many.length);
    const at = places(order);
    // How far apart, round the ring, the people of each small chat sit: a few places, against hundreds by chance.
    const small = chats.filter((g) => g.size <= 12);
    const spans = small.map((g) => Math.max(...g.memberIds.map((id) => at.get(id)!)) - Math.min(...g.memberIds.map((id) => at.get(id)!)));
    const median = [...spans].sort((a, b) => a - b)[Math.floor(spans.length / 2)];
    expect(median).toBeLessThan(40);
    // Nearly everyone in a friend group (who is in any of its chats) lands in the circle most of their group is in.
    const circleOf = new Map(circles.flatMap((c, i) => c.ids.map((id) => [id, i] as const)));
    let together = 0;
    let tied = 0;
    for (const members of friends) {
      const theirs = members.filter((id) => circleOf.has(id)).map((id) => circleOf.get(id)!);
      const counts = new Map<number, number>();
      for (const c of theirs) counts.set(c, (counts.get(c) ?? 0) + 1);
      together += Math.max(0, ...counts.values());
      tied += theirs.length;
    }
    expect(together / tied).toBeGreaterThan(0.9);
  });
});

describe("circleLabel", () => {
  const map = [
    ...Array.from({ length: 4 }, (_, i) => person(i + 1, "a", ["climbing", "friend"])),
    ...Array.from({ length: 8 }, (_, i) => person(i + 10, "b", ["friend"])),
  ];

  it("names a circle by a tag most of its people have and few others do", () => {
    expect(circleLabel(map.slice(0, 4), map)).toBe("climbing");
  });

  it("names none by a tag most of the map has, by archive or keep, or for fewer than three", () => {
    expect(circleLabel(map.slice(4, 10), map)).toBeNull();
    const kept = [person(1, "a", ["keep"]), person(2, "b", ["keep"]), person(3, "c", ["keep"])];
    expect(circleLabel(kept, [...kept, ...map])).toBeNull();
    expect(circleLabel(map.slice(0, 2), map)).toBeNull();
  });
});

describe("spread", () => {
  it("is directions() given the A to Z order, evenly, with no gaps", () => {
    const people = [person(3, "cy"), person(1, "Bo"), person(2, "Ada"), person(4, "Émile")];
    expect(spread([2, 1, 3, 4], 0.2)).toEqual(directions(people, 0.2));
    expect(spread([2, 1, 3, 4], 0.2, { weights: [1, 1, 1, 1] })).toEqual(directions(people, 0.2));
  });

  it("leaves a gap of the spaces asked before a circle", () => {
    const aim = spread(Array.from({ length: 30 }, (_, i) => i), 0.2, { gaps: [{ at: 15, spaces: 2 }] });
    const space = aim.get(1)!.angle - aim.get(0)!.angle;
    expect(space).toBeCloseTo((2 * Math.PI - 0.2) / (30 + 2));
    expect(aim.get(15)!.angle - aim.get(14)!.angle).toBeCloseTo(space * 3);
  });

  it("gives each person room by their weight", () => {
    const aim = spread([1, 2, 3, 4], 0, { weights: [3, 1, 1, 3] });
    const step = (a: number, b: number) => aim.get(b)!.angle - aim.get(a)!.angle;
    // A person of weight 3 and their neighbour of 1 are two of their shares apart: (3 + 1) / 2 against (1 + 1) / 2.
    expect(step(1, 2)).toBeCloseTo(2 * step(2, 3));
    expect(step(3, 4)).toBeCloseTo(2 * step(2, 3));
    // The ring is shared out whole: the first starts half a share in, the last ends at the top.
    expect(aim.get(1)!.angle + Math.PI / 2).toBeCloseTo(((2 * Math.PI) / 8) * 1.5);
  });

  it("keeps gaps clear on a crowded map, never narrower than GAP_SPACE_LEAST of the ring a space", () => {
    const order = Array.from({ length: 1000 }, (_, i) => i);
    const aim = spread(order, 0, { gaps: [{ at: 500, spaces: 2 }] });
    const space = aim.get(1)!.angle - aim.get(0)!.angle;
    expect(space).toBeLessThan(2 * Math.PI * GAP_SPACE_LEAST);
    expect(aim.get(500)!.angle - aim.get(499)!.angle - space).toBeCloseTo(2 * 2 * Math.PI * GAP_SPACE_LEAST);
  });

  it("narrows the gaps when there are many, so they never take more than GAPS_MOST of the ring", () => {
    for (const count of [100, 1000]) {
      const order = Array.from({ length: count }, (_, i) => i);
      const aim = spread(order, 0, { gaps: order.filter((i) => i % 2 === 0).map((at) => ({ at, spaces: PART_GAP })) });
      const space = aim.get(1)!.angle - aim.get(0)!.angle;
      expect((2 * Math.PI - count * space) / (2 * Math.PI)).toBeCloseTo(GAPS_MOST);
    }
  });
});

describe("the ring's balance", () => {
  const { people: many, groups: chats, rank } = crowd();
  const shows = new Map(many.map((p) => [p.id, presence(rank.get(p.id)!)]));
  const result = friendCircles(many, chats, shows);
  const aim = spread(result.order, 0.32, { weights: result.weights, gaps: result.gaps });
  const closest = (n: number) => many.filter((p) => rank.get(p.id)! <= n).map((p) => p.id);
  /** How lopsided people are round the sun: the length of the mean of their directions, 0 for even and 1 for all at one spot. */
  const lopsided = (ids: number[]) =>
    Math.hypot(...[Math.cos, Math.sin].map((f) => ids.reduce((sum, id) => sum + f(aim.get(id)!.angle), 0))) / ids.length;
  /** The most of `ids` in any half of the ring. */
  const mostInHalf = (ids: number[]) =>
    Math.max(...Array.from({ length: 180 }, (_, d) => ids.filter((id) => ((aim.get(id)!.angle - (d * Math.PI) / 90) % (2 * Math.PI) + 4 * Math.PI) % (2 * Math.PI) < Math.PI).length)) / ids.length;

  it("takes presence from how strongly someone is drawn, the closest most", () => {
    expect(presence(1)).toBe(1);
    expect(presence(30)).toBeLessThan(presence(20));
    expect(presence(500)).toBeCloseTo(TIER_FLOOR ** PRESENCE_POWER);
    expect(presence(null)).toBe(presence(500));
    expect(result.weights).toEqual(result.order.map((id) => shows.get(id)));
  });

  it("spreads the people near the sun round the ring rather than to one side", () => {
    // Before the balancing (circles in a row from the top, each person an even share), the closest 25 all sat in one
    // half of the ring; the closest 50 98% in one half, lopsided 0.60; the closest 100 84%, lopsided 0.41.
    const even = spread(result.order, 0.32);
    expect(mostInHalf(closest(25))).toBeLessThan(0.9);
    expect(lopsided(closest(50))).toBeLessThan(0.4);
    expect(mostInHalf(closest(50))).toBeLessThan(0.8);
    expect(lopsided(closest(100))).toBeLessThan(0.32);
    expect(mostInHalf(closest(100))).toBeLessThan(0.75);
    // And presence alone is not what does it: the same order shared out evenly is worse.
    const evenLopsided = (ids: number[]) =>
      Math.hypot(...[Math.cos, Math.sin].map((f) => ids.reduce((sum, id) => sum + f(even.get(id)!.angle), 0))) / ids.length;
    expect(lopsided(closest(50))).toBeLessThan(evenLopsided(closest(50)));
  });

  it("gives the big circles a part of the ring each, spread round it with smaller circles between", () => {
    const everyone = result.weights.reduce((sum, w) => sum + w, 0);
    const weigh = (ids: number[]) => ids.reduce((sum, id) => sum + shows.get(id)!, 0);
    const big = result.circles.map((c, i) => ({ i, c })).filter(({ c }) => weigh(c.ids) >= BIG_SHARE * everyone);
    expect(big.length).toBeGreaterThanOrEqual(3);
    // No two big circles side by side.
    for (let k = 1; k < big.length; k++) expect(big[k].i - big[k - 1].i).toBeGreaterThan(1);
    // Each starts a part: a wide gap before it or the circle before it, and the big ones well apart round the ring.
    const middle = (ids: number[]) => (aim.get(ids[0])!.angle + aim.get(ids[ids.length - 1])!.angle) / 2;
    const middles = big.map(({ c }) => middle(c.ids));
    for (let k = 1; k < middles.length; k++) expect(middles[k] - middles[k - 1]).toBeGreaterThan((2 * Math.PI) / (big.length + 1) / 2);
    // And each sits in the middle of its part (the circles between two part gaps), smaller ones either side.
    const at = places(result.order);
    const partGap = new Set(result.gaps.filter((g) => g.spaces === PART_GAP).map((g) => g.at));
    const parts: number[][] = [];
    result.circles.forEach((c, i) => (i === 0 || partGap.has(at.get(c.ids[0])!) ? parts.push([i]) : parts.at(-1)!.push(i)));
    const bigOnes = new Set(big.map(({ i }) => i));
    const crowded = parts.filter((part) => part.length >= 3);
    expect(crowded.length).toBeGreaterThanOrEqual(2);
    for (const part of crowded) {
      const where = part.findIndex((i) => bigOnes.has(i));
      expect(where).toBeGreaterThan(0);
      expect(where).toBeLessThan(part.length - 1);
    }
  });

  it("leaves clear gaps between circles, wider between parts and before the people in no chat", () => {
    const at = places(result.order);
    const angle = (i: number) => aim.get(result.order[i])!.angle;
    const width = (spaces: number) => spaces * 2 * Math.PI * GAP_SPACE_LEAST * 0.9;
    // Every circle after the first, and the people in no chat, start after a gap.
    expect(result.gaps.map((g) => g.at)).toEqual([...result.circles.slice(1).map((c) => at.get(c.ids[0])!), at.get(result.apart[0])!]);
    for (const { at: i, spaces } of result.gaps) expect(angle(i) - angle(i - 1)).toBeGreaterThan(width(spaces));
    expect(result.gaps.some((g) => g.spaces === CIRCLE_GAP)).toBe(true);
    expect(result.gaps.at(-1)!.spaces).toBe(PART_GAP);
  });

  it("gives the same ring for the same people, chats and presence, however they are listed", () => {
    const random = seeded(5);
    const shuffle = <T,>(list: T[]) => [...list].sort(() => random() - 0.5);
    expect(friendCircles(many, chats, shows)).toEqual(result);
    expect(friendCircles(shuffle(many), shuffle(chats).map((g) => ({ ...g, memberIds: shuffle([...g.memberIds]) })), new Map(shuffle([...shows])))).toEqual(result);
  });
});

describe("circleLabelSpot", () => {
  const bounds = { left: -300, right: 300, top: -300, bottom: 300 };

  it("sets a circle's name beyond its arc, reaching away from the sun", () => {
    const right = circleLabelSpot(0, 200, "climbing", bounds);
    expect(right.anchor).toBe("start");
    expect(right.box.left).toBeCloseTo(200);
    const left = circleLabelSpot(Math.PI, 200, "climbing", bounds);
    expect(left.anchor).toBe("end");
    expect(left.box.right).toBeCloseTo(-200);
    const bottom = circleLabelSpot(Math.PI / 2, 200, "uni", bounds);
    expect(bottom.anchor).toBe("middle");
    expect(bottom.box.top).toBeGreaterThanOrEqual(199);
    const top = circleLabelSpot(-Math.PI / 2, 200, "uni", bounds);
    expect(top.box.bottom).toBeLessThanOrEqual(-199);
  });

  it("keeps it on the page, moving it along rather than letting it run off", () => {
    const spot = circleLabelSpot(0, 280, "book-club", bounds);
    expect(spot.box.right).toBeLessThanOrEqual(300);
    expect(spot.box.right - spot.box.left).toBeCloseTo(9 * 6.4);
    expect(spot.x).toBe(spot.box.left);
    const low = circleLabelSpot(Math.PI / 2, 299, "uni", bounds);
    expect(low.box.bottom).toBeLessThanOrEqual(300);
  });
});

describe("the map's order switch", () => {
  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => void vi.unstubAllGlobals());

  const NOW = Date.parse("2026-03-15T12:00:00+11:00");
  const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
  const relationship = (id: number, name: string, messages: number): PersonRelationship => ({
    id, name, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(messages), firstMessageAt: NOW, lastMessageAt: NOW, months: [{ month: "2026-03", ...counts(messages) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  });
  const names = ["Ada", "Bo", "Cy", "Di", "Ed", "Flo"];
  // Ada, Cy and Ed share a chat, as do Bo, Di and Flo.
  const report: RelationshipsReport = {
    generatedAt: NOW,
    gapDays: 14,
    people: names.map((name, i) => relationship(i + 1, name, 60 - i * 7)),
    archivedCount: 0,
    catchUps: [],
    callDays: [], unlinks: [],
    groups: [
      { id: 10, memberIds: [1, 3, 5], selfOnly: false, messageCount: 50, lastMessageAt: NOW, months: [] },
      { id: 11, memberIds: [2, 4, 6], selfOnly: false, messageCount: 50, lastMessageAt: NOW, months: [] },
    ],
  };
  // Ada, Cy and Ed climb.
  const model = buildModel({ ...report, people: report.people.map((p) => (p.id % 2 === 1 ? { ...p, tags: ["climbing"] } : p)) });
  const draw = (order?: "name" | "circles") =>
    renderToStaticMarkup(createElement(OrbitMap, { model, width: 900, height: 700, inset: 60, hover: () => {}, open: () => {}, ...(order ? { order } : {}) }));
  const arcs = (markup: string) => (markup.match(/class="orbits__circle"/g) ?? []).length;
  const circleNames = (markup: string) => [...markup.matchAll(/<g class="orbits__circles"><text[^>]*>([^<]+)</g)].map((m) => m[1]);
  /** Everyone, by name, clockwise from the top: each drawn as their name in place of their icon, the line's middle 4 pixels over its baseline. */
  const clockwise = (markup: string) =>
    [...markup.matchAll(/<text class="orbits__name[^"]*" x="([-\d.e]+)" y="([-\d.e]+)"[^>]*>([^<]+)</g)]
      .map((m) => ({ name: m[3], angle: (Math.atan2(Number(m[2]) - 4, Number(m[1])) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI) }))
      .sort((a, b) => a.angle - b.angle)
      .map((s) => s.name);

  it("keeps A to Z as it was, and as the default", () => {
    expect(draw("name")).toEqual(draw());
    expect(clockwise(draw("name"))).toEqual(names);
  });

  it("marks each friend circle with an arc, named by the tag its people share, and draws none A to Z", () => {
    expect(arcs(draw("circles"))).toBe(2);
    expect(circleNames(draw("circles"))).toEqual(["climbing"]);
    expect(arcs(draw("name"))).toBe(0);
    expect(circleNames(draw("name"))).toEqual([]);
  });

  it("names no circle with No names", () => {
    const before = nameStyleStore.get();
    nameStyleStore.set("hide");
    try {
      expect(arcs(draw("circles"))).toBe(2);
      expect(circleNames(draw("circles"))).toEqual([]);
    } finally {
      nameStyleStore.set(before);
    }
  });

  it("sits each chat's people side by side in friend circles", () => {
    const order = clockwise(draw("circles"));
    expect(together(order.map((n) => names.indexOf(n) + 1), [1, 3, 5])).toBe(true);
    expect(together(order.map((n) => names.indexOf(n) + 1), [2, 4, 6])).toBe(true);
  });
});
