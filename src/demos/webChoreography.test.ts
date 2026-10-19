// The Spider web's boot (webChoreography.ts): when each person appears as the
// scan reaches them, and how webBoot brings them in for useTween.

import { describe, expect, it } from "vitest";
import type { Drawn } from "./orbitsLayout.ts";
import { appearAt, BOOT_MS, easeOutBack, easeOutExpo, SCAN, webBoot, type WebMotion } from "./webChoreography.ts";

const frame = (angle: number, r: number, opacity = 1): Drawn => ({ angle, r, size: 6, glow: 0, opacity, silent: false });
const ENTRANCE = { from: 10, stagger: 700, inner: 40, outer: 300, cy: 350, height: 700 };

describe("the boot", () => {
  it("locks people in as the scan line reaches their height on the stage, top to bottom", () => {
    const stage = { cy: 350, height: 700 };
    expect(appearAt({ angle: -Math.PI / 2, r: 350 }, stage, 320).delay).toBe(SCAN.from);
    expect(appearAt({ angle: 0, r: 100 }, stage, 320).delay).toBeCloseTo(SCAN.from + SCAN.length / 2);
    expect(appearAt({ angle: Math.PI / 2, r: 350 }, stage, 320).delay).toBeCloseTo(SCAN.from + SCAN.length);
    expect(appearAt({ angle: Math.PI / 2, r: 1000 }, stage, 320).delay).toBeCloseTo(SCAN.from + SCAN.length);
    expect(appearAt({ angle: 0, r: 100 }, stage, 320).length).toBeGreaterThan(0);
    expect(SCAN.from + SCAN.length).toBeLessThan(BOOT_MS);
  });

  it("goes by height within the web's reach when there is no stage", () => {
    expect(appearAt({ angle: -Math.PI / 2, r: 320 }, {}, 320).delay).toBeCloseTo(SCAN.from);
    expect(appearAt({ angle: Math.PI / 2, r: 320 }, {}, 320).delay).toBeCloseTo(SCAN.from + SCAN.length);
  });
});

describe("webBoot", () => {
  it("condenses people in place for the boot, each when the scan reaches them, and notes when it began", () => {
    const motion: { current: WebMotion } = { current: { bootStart: null } };
    const boot = webBoot(motion);
    const to = frame(0, 200);
    expect(boot.entranceFrom(to, ENTRANCE)).toMatchObject({ angle: 0, r: 200, opacity: 0, glow: 0 });
    expect(boot.entranceFrom(to, ENTRANCE).size).toBeLessThan(to.size);
    const timed = boot.entrance(to, ENTRANCE);
    expect(timed).toMatchObject(appearAt({ angle: 0, r: 200 }, ENTRANCE, ENTRANCE.outer + 11));
    expect(timed.ease!(1)).toBeCloseTo(1);
    boot.began!(5000);
    expect(motion.current.bootStart).toBe(5000);
  });
});

describe("the easings", () => {
  it("start at 0 and land on 1, the back one overshooting on the way", () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...Array.from({ length: 11 }, (_, i) => easeOutBack(i / 10)))).toBeGreaterThan(1);
    expect(easeOutExpo(0)).toBeCloseTo(0, 2);
    expect(easeOutExpo(1)).toBe(1);
  });
});
