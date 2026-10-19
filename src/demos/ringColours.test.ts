import { describe, expect, it } from "vitest";
import { contrast, mix } from "../identicon.ts";
import { rings } from "./orbitsLayout.ts";
import { COLORS } from "./palette.ts";
import { RING_LABEL, ringColours, ringShare } from "./ringColours.ts";

const alpha = (rgba: string) => Number(/([\d.]+)\)$/.exec(rgba)![1]);

describe("the guide rings' colours", () => {
  it("step out one band a ring, whoever is shown: the top 10 first, the top 500 and beyond last", () => {
    const shares = rings(10_000).map((ring) => ringShare(ring.rank));
    expect(shares.slice(0, 6)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(shares.slice(6)).toEqual([1, 1, 1]);
    // The Query bar showing fewer people drops outer rings and leaves the others' colours as they were.
    expect(rings(120).map((ring) => ringColours(ring.rank))).toEqual(rings(10_000).slice(0, 3).map((ring) => ringColours(ring.rank)));
  });

  it("start at the sun's orange and grow fainter outward, line and label alike", () => {
    const all = rings(10_000).slice(0, 6).map((ring) => ringColours(ring.rank));
    const shown = all.map(({ colour }) => contrast(mix(COLORS.night, colour, RING_LABEL), COLORS.night));
    expect(all[0].colour).toBe(COLORS.me);
    for (let i = 1; i < all.length; i++) {
      expect(alpha(all[i].line)).toBeLessThan(alpha(all[i - 1].line));
      expect(shown[i]).toBeLessThan(shown[i - 1]);
    }
  });

  it("fade every label, but keep it legible on the night sky", () => {
    for (const ring of rings(10_000)) {
      const { colour, label } = ringColours(ring.rank);
      expect(alpha(label)).toBeLessThan(0.55);
      expect(contrast(mix(COLORS.night, colour, RING_LABEL), COLORS.night)).toBeGreaterThanOrEqual(2);
    }
  });
});
