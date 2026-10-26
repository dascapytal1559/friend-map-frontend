import { describe, expect, it } from "vitest";
import { contrast, mix } from "../identicon.ts";
import { rings } from "./orbitsLayout.ts";
import { COLORS, PAPER } from "./palette.ts";
import { PAPER_RING_LABEL, RING_LABEL, ringColours, ringShare } from "./ringColours.ts";
import { inkOf } from "./themeColour.ts";

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

describe("the guide rings on paper", () => {
  it("are the same family as ink, every label reading on white, the lines stronger and fainter outward still", () => {
    const all = rings(10_000).slice(0, 6).map((ring) => ringColours(ring.rank, COLORS.me, true));
    expect(all[0].colour).toBe(inkOf(COLORS.me, 0.58));
    for (const { colour, label } of all) {
      expect(contrast(mix(PAPER.night, colour, PAPER_RING_LABEL), PAPER.night)).toBeGreaterThanOrEqual(3);
      expect(alpha(label)).toBe(PAPER_RING_LABEL);
    }
    for (let i = 1; i < all.length; i++) expect(alpha(all[i].line)).toBeLessThan(alpha(all[i - 1].line));
    expect(alpha(all[0].line)).toBeGreaterThan(alpha(ringColours(10.5).line));
    // Another sun turns the family round the wheel as it does on the night, from that sun's ink.
    const teal = rings(10_000).slice(0, 6).map((ring) => ringColours(ring.rank, "#6fd0c6", true));
    expect(teal[0].colour).toBe(inkOf("#6fd0c6", 0.58));
    expect(teal.map((ring) => ring.colour)).not.toEqual(all.map((ring) => ring.colour));
    expect(ringColours(10.5, COLORS.me, true)).toEqual(all[0]);
  });
});
