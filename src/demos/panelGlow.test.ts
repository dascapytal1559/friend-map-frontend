// The person panel's colours on the map views (panelGlow.ts): the view's own.

import { describe, expect, it } from "vitest";
import { ORANGE, themeSun } from "./orbitsTheme.ts";
import { COLORS } from "./palette.ts";
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
