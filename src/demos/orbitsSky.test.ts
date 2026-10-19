// The stage the sky views share (Orbits, Circles, the Spider web, Orbits 3D): how far
// out the outermost orbit reaches (the user's ask: "increase the map circle
// radius by what i estimate is about 20px but idk what u use, to bring content
// circle closer to the edge, to give map a bit more space to fit everyone").
// The window's foot used to keep 44 pixels for the Time machine's line and
// then the demo's note, both gone from there, and the orbits stopped 64 short
// of it; now 34, so the system reaches 20 pixels further on a window as wide
// as it is tall or wider, and keeps its 70 a side on a narrow one.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { textUnits } from "./orbitsLayout.ts";
import { BELT, MINOR_SCALE, NAME_FONT, NAMED_LARGE, nameInk, nameScale, stageOf, WEB_CHAR_WIDTH, WEB_NAME_FONT } from "./orbitsSky.ts";

describe("the stage", () => {
  it("reaches 20 pixels further than it did on a wide window, on the demo's Spider web as the user saw it", () => {
    // 1000 by 698, the header 120 tall and 30 under it.
    const { outer, cy } = stageOf(1000, 698, 150);
    expect(outer).toBe((698 - 150 - 44) / 2 - 26 + 20);
    expect(698 - (cy + outer)).toBe(34);
  });

  it("keeps the belt of people with no closeness yet on the window, below the header", () => {
    for (const [width, height, top] of [[1440, 900, 130], [1000, 698, 150], [800, 600, 130], [390, 844, 150]]) {
      const { outer, cx, cy } = stageOf(width, height, top);
      const reach = outer + BELT;
      expect(cy - reach).toBeGreaterThanOrEqual(top);
      expect(cy + reach).toBeLessThanOrEqual(height - 20);
      expect(cx - reach).toBeGreaterThanOrEqual(50);
    }
  });

  it("is as it was on a phone upright, where the width decides", () => {
    expect(stageOf(390, 844, 150).outer).toBe(390 / 2 - 70);
  });
});

describe("names measured for fitting round the sun (Name only)", () => {
  const css = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

  it("are measured in the type each map view draws them in, full size and smaller", () => {
    const rule = (selector: string) => css("./orbits.css").match(new RegExp(`(?:^|\\n)${selector.replace(/[.-]/g, "\\$&")}\\s*{([^}]*)}`))![1];
    expect(rule(".orbits__name")).toContain(`${NAME_FONT.size}px var(--serif)`);
    expect(rule(".orbits__name--minor")).toContain(`font-size: ${NAME_FONT.minor}px`);
    expect(css("./demos.css")).toContain(`--serif: ${NAME_FONT.family};`);
    expect(NAME_FONT.minor).toBe(NAME_FONT.size * MINOR_SCALE);
    const web = rule(".orbits--web .orbits__name");
    expect(web).toContain(`font-family: ${WEB_NAME_FONT.family};`);
    expect(web).toContain(`font-size: ${WEB_NAME_FONT.size}px;`);
    expect(web).toContain(`letter-spacing: ${WEB_NAME_FONT.spacing}em;`);
    expect(rule(".orbits--web .orbits__name--minor")).toContain(`font-size: ${WEB_NAME_FONT.minor}px`);
  });

  it("are the closest NAMED_LARGE at full size, the rest smaller", () => {
    expect(nameScale(1)).toBe(1);
    expect(nameScale(NAMED_LARGE)).toBe(1);
    expect(nameScale(NAMED_LARGE + 1)).toBe(MINOR_SCALE);
    expect(nameScale(undefined)).toBe(MINOR_SCALE);
  });

  it("with no canvas to measure on, are as wide as placeLabels estimates, centred on the spot", () => {
    const ink = nameInk("Ada Sample", 1);
    expect(ink.right - ink.left).toBeCloseTo(textUnits("Ada Sample") * 6.6);
    expect(ink.left).toBeCloseTo(-ink.right);
    expect(ink.bottom - ink.top).toBe(13);
    // The Spider web's monospace, as wide as placeLabels takes it there.
    const web = nameInk("Ada Sample", 1, WEB_NAME_FONT);
    expect(web.right - web.left).toBeCloseTo(textUnits("Ada Sample") * WEB_CHAR_WIDTH);
  });
});
