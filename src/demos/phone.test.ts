// friend-map on a phone (opened through the tailnet): the stylesheets' phone
// and touch rules, read as text as orbitSlide.test.ts reads the dock's. A
// laptop is untouched by them: every one is under a media query that only a
// narrow window or a touch screen meets. The touch gestures on Orbits are in
// Orbits.tsx, their maths tested in orbitsZoom.test.ts (pinchZoom), and the
// hover card's place for a finger in tipPlace.test.ts.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A stylesheet, without its comments. */
const css = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The body of the @media block with exactly this query. */
function media(sheet: string, query: string): string {
  const start = sheet.indexOf(`@media ${query} {`);
  if (start < 0) throw new Error(`no @media ${query}`);
  let depth = 0;
  for (let i = sheet.indexOf("{", start); i < sheet.length; i++) {
    if (sheet[i] === "{") depth++;
    else if (sheet[i] === "}" && --depth === 0) return sheet.slice(sheet.indexOf("{", start) + 1, i);
  }
  throw new Error(`unclosed @media ${query}`);
}

/** The declarations of the rule with exactly these selectors (a list, comma-separated) in `block`, as property: value. */
function rule(block: string, selector: string): Record<string, string> {
  const escaped = selector.split(",").map((s) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*,\\s*");
  const body = block.match(new RegExp(`(?:^|[{}])\\s*${escaped}\\s*{([^}]*)}`))?.[1];
  if (body === undefined) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(body.split(";").map((d) => d.split(/:(.*)/s).map((s) => s.trim())).filter(([p]) => p).map(([p, v]) => [p, v]));
}

const PHONE = "(max-width: 560px), (max-height: 500px) and (pointer: coarse)";
const UPRIGHT = "(max-width: 560px)";
const TOUCH = "(pointer: coarse)";

describe("on a phone", () => {
  const demos = css("./demos.css");
  const app = css("../app.css");

  it("opens the panel over the whole screen, over the map rather than beside it", () => {
    const phone = media(demos, PHONE);
    expect(rule(phone, ".demos")["--dock"]).toBe("100vw");
    // The map's room (where its slide ends, mapSize.ts) stays with it.
    expect(rule(phone, ".demos--docked .demos__map, .demos--docked .demos__room").right).toBe("0");
    // A view that keeps its size stays where it is under it, rather than sliding aside by half the screen.
    expect(rule(phone, ".demos--keeps-size.demos--docked .demos__stage").transform).toBe("none");
    expect(Number(rule(phone, ".demos__dock")["z-index"])).toBeGreaterThan(7);
    expect(rule(phone, ".demos__drawer.side-panel").inset).toBe("0");
  });

  it("lets the archived chip and error notice out of the map, so they show over the panel", () => {
    expect(rule(media(demos, PHONE), ".demos__map")["container-type"]).toBe("normal");
  });

  it("keeps the line under the Query bar on the screen", () => {
    expect(rule(media(demos, UPRIGHT), ".query-bar__status").left).toBe("0");
  });

  it("keeps the Table's names in view while it scrolls sideways", () => {
    const table = media(css("./table.css"), UPRIGHT);
    expect(rule(table, ".people-table th:first-child,\n  .people-table td:first-child").position).toBe("sticky");
  });

  it("writes in fields at 16 px on a touch screen, so an iPhone does not zoom the page in on them", () => {
    const touch = media(demos, TOUCH);
    expect(touch).toMatch(/\.demos__find,[^{]*\.query-bar__transcript[^{]*{\s*font-size: 16px;/);
    expect(media(app, TOUCH)).toMatch(/\.side-panel input,[^{]*{\s*font-size: 16px;/);
  });

  it("gives the panel's close and back buttons room for a finger", () => {
    const close = rule(media(app, TOUCH), ".side-panel__close,\n  .side-panel__back");
    expect(close["min-width"]).toBe("40px");
    expect(close["min-height"]).toBe("40px");
  });
});
