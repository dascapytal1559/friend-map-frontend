// Orbits' theme colour (orbitsTheme.ts): the sun's orange until another is
// chosen, which colours the sun and the guide rings (ringColours.ts), kept
// where it reads on the night sky.

import { describe, expect, it } from "vitest";
import { contrast, mix } from "../identicon.ts";
import { rings } from "./orbitsLayout.ts";
import { NIGHT_PALETTE, ORANGE, orbitsPalette, PAPER_PALETTE, themeSun } from "./orbitsTheme.ts";
import { COLORS, PAPER } from "./palette.ts";
import { RING_LABEL, ringColours } from "./ringColours.ts";
import { hueGap, inkOf, oklch } from "./themeColour.ts";
import { rgba } from "./webDraw.ts";

const PICKS = ["#ff0000", "#ffee00", "#00ff66", "#00ffee", "#0088ff", "#2200ff", "#aa00ff", "#ff00aa", "#6fd0c6", "#102030", "#ffffff"];

describe("Orbits' theme", () => {
  it("is Orbits' own look in the orange, exactly as it was", () => {
    expect(ORANGE).toBe(COLORS.me);
    expect(orbitsPalette(ORANGE)).toBe(NIGHT_PALETTE);
    expect(NIGHT_PALETTE.sun[0]).toEqual([0, "#fff8e8", 1]);
    for (const ring of rings(10_000)) expect(ringColours(ring.rank, ORANGE)).toEqual(ringColours(ring.rank));
  });

  it("colours the sun in the chosen colour, kept light enough to read on the night", () => {
    expect(themeSun("#6fd0c6")).toBe("#6fd0c6");
    for (const pick of PICKS) {
      const sun = themeSun(pick);
      expect(oklch(sun)[0]).toBeGreaterThanOrEqual(0.715);
      expect(contrast(sun, COLORS.night)).toBeGreaterThanOrEqual(6);
      if (oklch(pick)[1] > 0.05) expect(hueGap(oklch(sun)[2], oklch(pick)[2])).toBeLessThan(4);
      const palette = orbitsPalette(pick);
      expect(palette.sun.slice(1).map(([, colour]) => colour)).toEqual([sun, sun, sun]);
      expect(palette.trail).toEqual(NIGHT_PALETTE.trail);
    }
  });

  it("starts the rings at the sun, turns the rest of the gradient with it, and keeps every label legible", () => {
    for (const pick of PICKS) {
      const sun = themeSun(pick);
      const all = rings(10_000).slice(0, 6).map((ring) => ringColours(ring.rank, sun));
      expect(all[0].colour).toBe(sun);
      for (const { colour } of all) expect(contrast(mix(COLORS.night, colour, RING_LABEL), COLORS.night)).toBeGreaterThanOrEqual(2);
    }
    // The violet at the far end of the orange's gradient, turned as far as a teal sun is from the orange.
    const far = (sun: string) => oklch(ringColours(1000, sun).colour)[2];
    const turn = oklch(themeSun("#6fd0c6"))[2] - oklch(ORANGE)[2];
    expect(hueGap(far("#6fd0c6"), far(ORANGE) + turn)).toBeLessThan(3);
  });
});

describe("Orbits on paper", () => {
  it("draws the sun as a solid disc in the theme's hue with a pale halo, rims in ink, and Paper's trails", () => {
    expect(orbitsPalette(ORANGE, true)).toBe(PAPER_PALETTE);
    expect(orbitsPalette(ORANGE)).toBe(NIGHT_PALETTE);
    for (const pick of [ORANGE, ...PICKS]) {
      const palette = orbitsPalette(pick, true);
      expect(orbitsPalette(pick, true)).toBe(palette);
      const [core, halo] = [palette.sun[0][1], palette.sun[2][1]];
      // A disc, not text: it needs only to stand out on white, and a yellow sun stays yellow.
      expect(contrast(core, PAPER.night)).toBeGreaterThanOrEqual(2.2);
      expect(oklch(halo)[0]).toBeGreaterThan(oklch(core)[0]);
      if (oklch(pick)[1] > 0.05) expect(hueGap(oklch(core)[2], oklch(pick)[2])).toBeLessThan(4);
      expect(palette.sun.at(-1)![2]).toBe(0);
      expect(palette.body.lit).toBe(PAPER.star);
      expect(palette.body.silent).toBe(PAPER.dim);
      expect(palette.body.plain("#f6c177")).toBe(rgba(inkOf("#f6c177"), 0.55));
      expect(palette.trail).toEqual({ warm: PAPER.warm, cool: PAPER.cool });
    }
  });
});
