// The Spider web's themes (webTheme.ts): Amber as tuned by hand, and a whole theme
// worked out from any one custom colour, the beam teal in every one.

import { describe, expect, it } from "vitest";
import { contrast } from "../identicon.ts";
import { hueGap, oklch } from "./themeColour.ts";
import { customTheme, TEAL, webTheme, type WebTheme } from "./webTheme.ts";

const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d+, \d+, \d+, [\d.]+\)$/;
/** A wheel of picks, every 15 degrees, strong and pale, light and dark. */
const PICKS = ["#ff0000", "#ff8800", "#ffee00", "#88ff00", "#00ff66", "#00ffee", "#0088ff", "#2200ff", "#aa00ff", "#ff00aa", "#3dff9a", "#39d8ff", "#204060", "#f4c0c8", "#330000"];

/** A theme as plain values, its one function called, so two can be compared whole. */
function plain(theme: WebTheme) {
  return { ...theme, palette: { ...theme.palette, body: { ...theme.palette.body, plain: theme.palette.body.plain("#ffffff") } } };
}

describe("Amber", () => {
  it("is the Spider web's own colours, as tuned, its teal across the wheel from its amber", () => {
    const amber = webTheme("amber").ink;
    expect(amber.strand).toBe("#ffb347");
    expect(amber.rings).toBe(TEAL);
    for (const colour of [amber.beam, amber.scan, amber.eye]) expect(colour).toBe(TEAL);
    expect(hueGap(oklch(amber.rings)[2], oklch(amber.strand)[2])).toBeGreaterThan(140);
  });
});

describe("the night", () => {
  it("is drawn as it always was: Amber, and a custom colour, to the value", () => {
    expect(plain(webTheme("amber"))).toEqual({
      ink: {
        background: "#030812", grid: "rgba(57, 216, 255, 0.07)", strand: "#ffb347", rings: "#39d8ff", accent: "#ffb347", beam: "#39d8ff", scan: "#39d8ff", eye: "#39d8ff",
        split: ["#ff3b6b", "#39d8ff"], haze: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.45)"], dark: "#070c17",
      },
      palette: {
        sun: [[0, "#39d8ff", 0.22], [0.5, "#39d8ff", 0.06], [1, "#39d8ff", 0]],
        body: { lit: "#ffffff", silent: "rgba(57, 216, 255, 0.45)", plain: "rgba(255, 179, 71, 0.75)", width: { lit: 1.8, silent: 1, plain: 1 } },
        trail: { warm: "#ffb347", cool: "#39d8ff" },
      },
      css: { "--web-accent": "rgba(255, 179, 71, 0.8)", "--web-ring": "rgba(255, 179, 71, 0.16)", "--web-link": "rgba(57, 216, 255, 0.55)", "--web-circle": "rgba(57, 216, 255, 0.35)" },
    });
    expect(plain(webTheme("#65a5e2"))).toEqual({
      ink: {
        background: "#010813", grid: "rgba(252, 164, 136, 0.070)", strand: "#86c4ff", rings: "#fca488", accent: "#a09efc", beam: "#39d8ff", scan: "#39d8ff", eye: "#39d8ff",
        split: ["#ff3b6b", "#fca488"], haze: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.5)"], dark: "#03101e",
      },
      palette: {
        sun: [[0, "#fca488", 0.22], [0.5, "#fca488", 0.06], [1, "#fca488", 0]],
        body: { lit: "#ffffff", silent: "rgba(252, 164, 136, 0.450)", plain: "rgba(134, 196, 255, 0.750)", width: { lit: 1.8, silent: 1, plain: 1 } },
        trail: { warm: "#86c4ff", cool: "#fca488" },
      },
      css: { "--web-accent": "rgba(160, 158, 252, 0.800)", "--web-ring": "rgba(134, 196, 255, 0.160)", "--web-link": "rgba(57, 216, 255, 0.550)", "--web-circle": "rgba(252, 164, 136, 0.350)" },
    });
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
