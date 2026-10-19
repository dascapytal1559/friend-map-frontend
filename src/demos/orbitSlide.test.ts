// The map slides with the docked panel: as the panel opens, the map slides
// left in step with it, and back as it closes (lost in b77cea3, when the map
// began taking a new size only once the slide has settled, and so teleported
// at the end). Orbits, Circles and the Spider web keep their size under the
// panel (Demo.keepsSize; the user's ask: "friendmap demo opening sidebar and
// redrawing dots can be expensive for budget pcs. lets try not redrawing"):
// their stage stays the window's width and slides aside by half the panel on
// its transform, so they are never drawn again for it. The other live views
// narrow: between their redraws only the stylesheets move the map, so the test
// reads them: the map narrows on the panel's own transition, and the drawing
// of every one of those views is centred in it, so its centre rides the map's
// centre. The map's room, where its slide ends, takes the docked place at once,
// so the drawing can grow to it as the panel starts to close (mapSize.ts).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A stylesheet, without its comments. */
const css = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule with exactly these selectors (a list, comma-separated), as property: value. */
function rule(sheet: string, selector: string): Record<string, string> {
  const escaped = selector.split(",").map((s) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*,\\s*");
  const body = sheet.match(new RegExp(`(?:^|})\\s*${escaped}\\s*{([^}]*)}`))?.[1];
  if (body === undefined) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    body.split(";").map((d) => d.split(/:(.*)/s).map((s) => s.trim())).filter(([p]) => p).map(([p, v]) => [p, v]),
  );
}

describe("the map sliding with the docked panel", () => {
  const demos = css("./demos.css");
  const docked = ".demos--docked .demos__map, .demos--docked .demos__room";

  it("narrows the map on the same transition the panel slides on", () => {
    expect(rule(demos, ".demos__map").transition).toBe("right var(--dock-move)");
    expect(rule(demos, docked).right).toBe("var(--dock)");
    expect(rule(demos, ".demos--docked .demos__dock").transition).toBe("transform var(--dock-move)");
  });

  it("keeps the map's room, unseen, where the map's slide ends, on no transition", () => {
    const room = rule(demos, ".demos__room");
    expect(room).toEqual({ position: "absolute", inset: "0", visibility: "hidden", "pointer-events": "none" });
    expect(rule(demos, ".demos__map").inset).toBe("0");
  });

  it.each([
    ["Orbits and the Spider web's SVG", "./orbits.css", ".demos__stage > svg.orbits"],
    ["the Spider web's canvases", "./orbits.css", ".demos__stage > canvas.orbits-web"],
    ["Orbits 3D", "./orbits3d.css", ".demos__stage > .orbits-3d"],
    ["the City", "./city.css", ".demos__stage > .city"],
  ])("centres %s in the stage, so the drawing slides with the map's centre until it is redrawn", (_, sheet, selector) => {
    const drawing = rule(css(sheet), selector);
    expect(drawing.position).toBe("absolute");
    expect(drawing.left).toBe("50%");
    expect(drawing.transform).toBe("translateX(-50%)");
  });

  it("keeps the stage of a view that keeps its size the window's width, sliding it aside by half the panel on the panel's transition", () => {
    const stage = rule(demos, ".demos--keeps-size .demos__stage");
    expect(stage).toMatchObject({ right: "auto", width: "100vw", "will-change": "transform", transition: "transform var(--dock-move)" });
    expect(rule(demos, ".demos--keeps-size.demos--docked .demos__stage").transform).toBe("translateX(calc(var(--dock) / -2))");
  });

  it("keeps the size of Orbits, Circles and the Spider web alone", async () => {
    const { DEMOS } = await import("./Demos.tsx");
    expect(DEMOS.filter((demo) => demo.keepsSize).map((demo) => demo.slug)).toEqual(["orbits", "circles", "web"]);
  });

  it("slides at once under reduced motion, as the panel does", () => {
    expect(demos).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{[^}]*\.demos\s*{\s*--dock-move: 0\.01s linear;/);
  });
});
