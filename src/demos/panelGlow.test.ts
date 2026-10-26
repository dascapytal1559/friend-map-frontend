// The person panel's colours on the map views (panelGlow.ts): the view's own.

import { describe, expect, it } from "vitest";
import { contrast } from "../identicon.ts";
import { ORANGE, themeSun } from "./orbitsTheme.ts";
import { COLORS, PAPER } from "./palette.ts";
import { inkOf } from "./themeColour.ts";
import { panelGlow } from "./panelGlow.ts";
import { TEAL, webTheme } from "./webTheme.ts";

describe("panelGlow", () => {
  it("is the Spider web's strands and rings, Amber's or a custom colour's", () => {
    expect(panelGlow("web", "amber", ORANGE)).toEqual({ "--panel-glow": "#ffb347", "--panel-beam": TEAL });
    const custom = webTheme("#3dff9a").ink;
    expect(panelGlow("web", "#3dff9a", ORANGE)).toEqual({ "--panel-glow": custom.strand, "--panel-beam": custom.rings });
  });

  it("is Orbits' sun in its theme colour, with Orbits' teal", () => {
    expect(panelGlow("orbits", "amber", ORANGE)).toEqual({ "--panel-glow": ORANGE, "--panel-beam": COLORS.them });
    expect(panelGlow("orbits", "amber", "#204060")).toEqual({ "--panel-glow": themeSun("#204060"), "--panel-beam": COLORS.them });
  });

  it("leaves every other view to the stylesheet's colours", () => {
    for (const slug of ["orbits-3d", "circles", "city", "time-river", "river", "reciprocity"]) expect(panelGlow(slug, "amber", ORANGE)).toBeNull();
  });
});

describe("panelGlow on paper", () => {
  it("is the same colours as ink: the Spider web's paper strands and rings, Orbits' sun as ink with Paper's teal, every one reading on white", () => {
    const paper = webTheme("amber", true).ink;
    expect(panelGlow("web", "amber", ORANGE, true)).toEqual({ "--panel-glow": paper.strand, "--panel-beam": paper.rings });
    expect(panelGlow("orbits", "amber", ORANGE, true)).toEqual({ "--panel-glow": inkOf(ORANGE), "--panel-beam": PAPER.them });
    for (const glow of [panelGlow("web", "amber", ORANGE, true)!, panelGlow("web", "#3dff9a", ORANGE, true)!, panelGlow("orbits", "amber", "#204060", true)!]) {
      expect(contrast(glow["--panel-glow"], "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(contrast(glow["--panel-beam"], "#ffffff")).toBeGreaterThanOrEqual(3);
    }
    for (const slug of ["orbits-3d", "circles", "city"]) expect(panelGlow(slug, "amber", ORANGE, true)).toBeNull();
  });
});
