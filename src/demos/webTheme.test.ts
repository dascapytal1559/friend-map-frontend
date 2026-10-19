// The Spider web's themes (webTheme.ts): Amber as tuned by hand, and a whole theme
// worked out from any one custom colour, the beam teal in every one.

import { describe, expect, it } from "vitest";
import { contrast } from "../identicon.ts";
import { hueGap, oklch } from "./themeColour.ts";
import { customTheme, TEAL, webTheme } from "./webTheme.ts";

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d+, \d+, \d+, [\d.]+\)$/;
/** A wheel of picks, every 15 degrees, strong and pale, light and dark. */
const PICKS = ["#ff0000", "#ff8800", "#ffee00", "#88ff00", "#00ff66", "#00ffee", "#0088ff", "#2200ff", "#aa00ff", "#ff00aa", "#3dff9a", "#39d8ff", "#204060", "#f4c0c8", "#330000"];

describe("Amber", () => {
  it("is the Spider web's own colours, as tuned, its teal across the wheel from its amber", () => {
    const amber = webTheme("amber").ink;
    expect(amber.strand).toBe("#ffb347");
    expect(amber.rings).toBe(TEAL);
    for (const colour of [amber.beam, amber.scan, amber.eye]) expect(colour).toBe(TEAL);
    expect(hueGap(oklch(amber.rings)[2], oklch(amber.strand)[2])).toBeGreaterThan(140);
  });
});

describe("a theme worked out from a custom colour", () => {
  it("is made of colours a canvas and a stylesheet can use, the same every time", () => {
    for (const pick of PICKS) {
      const { ink, palette, css } = customTheme(pick);
      for (const colour of [ink.background, ink.strand, ink.rings, ink.accent, ink.beam, ink.scan, ink.eye, ink.dark, ink.split[1], palette.trail.warm, palette.trail.cool]) expect(colour).toMatch(HEX);
      for (const colour of [ink.grid, palette.body.silent, palette.body.plain("#ffffff"), ...Object.values(css)]) expect(colour).toMatch(RGBA);
      expect(JSON.stringify(customTheme(pick))).toBe(JSON.stringify(customTheme(pick)));
    }
  });

  it("draws the strands in the colour's own hue", () => {
    for (const pick of PICKS.filter((p) => oklch(p)[1] > 0.05)) expect(hueGap(oklch(customTheme(pick).ink.strand)[2], oklch(pick)[2])).toBeLessThan(4);
  });

  it("keeps the strands, the rings, the accents and the beam bright against a dark ground, whatever the pick's own lightness", () => {
    for (const pick of PICKS) {
      const { ink } = customTheme(pick);
      expect(oklch(ink.background)[0]).toBeLessThan(0.2);
      for (const colour of [ink.strand, ink.rings, ink.accent, ink.beam]) expect(contrast(colour, ink.background)).toBeGreaterThanOrEqual(6);
    }
  });

  it("fires the Spider web's teal beam, its eyes and scan line teal too, in every colour, a teal one included", () => {
    for (const pick of PICKS) {
      const { ink, css } = customTheme(pick);
      for (const colour of [ink.beam, ink.scan, ink.eye]) expect(colour).toBe(TEAL);
      expect(css["--web-link"]).toBe("rgba(57, 216, 255, 0.550)");
    }
    expect(customTheme("#39d8ff").ink.beam).toBe(TEAL);
    expect(customTheme("#00ffee").ink.beam).toBe(TEAL);
  });

  it("puts the rings across the wheel from the strands", () => {
    for (const pick of PICKS.filter((p) => oklch(p)[1] > 0.05)) {
      const { ink } = customTheme(pick);
      expect(hueGap(oklch(ink.rings)[2], oklch(ink.strand)[2])).toBeGreaterThan(120);
    }
  });

  it("is what the Spider web draws for a custom colour", () => {
    expect(JSON.stringify(webTheme("#3dff9a"))).toBe(JSON.stringify(customTheme("#3dff9a")));
    expect(webTheme("#3dff9a")).toBe(webTheme("#3dff9a"));
  });
});
