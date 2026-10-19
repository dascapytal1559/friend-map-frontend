// The spider's eyes (webEyes.ts): a life of their own, at random moments,
// never on a loop; following whoever is hovered; still under reduced motion.

import { describe, expect, it } from "vitest";
import { eyesAt, newEyeState, pickEyeAct, restAfter } from "./webEyes.ts";

/** A run of numbers that is the same every time. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const still = { reduced: false, look: null };

describe("the eyes", () => {
  it("rest a while, then do something: mostly a blink, sometimes a double blink, a glance or a scan", () => {
    const kinds = new Set<string>();
    const random = seeded(1);
    for (let i = 0; i < 200; i++) kinds.add(pickEyeAct(0, random).kind);
    expect([...kinds].sort()).toEqual(["blink", "double", "glance", "scan"]);
    const rest = restAfter(1000, () => 0.5);
    expect(rest).toBeGreaterThan(1000 + 1400);
    expect(rest).toBeLessThan(1000 + 5600);
  });

  it("are open and steady before their time comes, shut at the middle of a blink, and open again after, resting until the next", () => {
    const state = newEyeState(0);
    const random = () => 0.1;
    expect(eyesAt(state, 100, random, still)).toMatchObject({ open: 1, gaze: { x: 0, y: 0 } });
    expect(state.act).toBeNull();
    // At 1200 a blink begins (0.1 rolls a blink).
    expect(eyesAt(state, 1200, random, still).open).toBeCloseTo(1);
    expect(state.act?.kind).toBe("blink");
    expect(eyesAt(state, 1275, random, still).open).toBeCloseTo(0, 1);
    expect(eyesAt(state, 1350, random, still).open).toBeCloseTo(1, 1);
    expect(state.act).toBeNull();
    expect(state.next).toBeGreaterThan(1350 + 1400);
  });

  it("glance aside and come back, and scan from side to side", () => {
    const glance = { act: { kind: "glance" as const, start: 0, length: 1000, dir: { x: 0.8, y: 0.2 } }, next: 0 };
    expect(eyesAt(glance, 500, () => 0, still).gaze).toEqual({ x: 0.8, y: 0.2 });
    expect(eyesAt(glance, 0, () => 0, still).gaze.x).toBeCloseTo(0);
    expect(eyesAt(glance, 1000, () => 0, still).gaze.x).toBeCloseTo(0);
    const scan = { act: { kind: "scan" as const, start: 0, length: 1800, dir: { x: 0, y: 0 } }, next: 0 };
    expect(eyesAt(scan, 450, () => 0, still).gaze.x).toBeCloseTo(0.9);
    expect(eyesAt(scan, 1350, () => 0, still).gaze.x).toBeCloseTo(-0.9);
  });

  it("follow whoever is hovered, brightening, and are still under reduced motion", () => {
    const state = newEyeState(0);
    const looking = eyesAt(state, 100, () => 0, { reduced: false, look: { x: 1, y: 0 } });
    expect(looking.gaze.x).toBeCloseTo(0.6);
    expect(looking.glow).toBeGreaterThan(eyesAt(newEyeState(0), 100, () => 0, still).glow);
    const reduced = { act: { kind: "blink" as const, start: 0, length: 150, dir: { x: 0, y: 0 } }, next: 0 };
    expect(eyesAt(reduced, 75, () => 0, { reduced: true, look: null })).toEqual({ open: 1, gaze: { x: 0, y: 0 }, glow: 1 });
  });
});
