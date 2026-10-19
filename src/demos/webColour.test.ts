// The Spider web's colour (webColour.ts): the colour last chosen under Colour
// in the Spider web's settings in the menu (viewSettings.ts), saved with the
// web's other settings (savedStore.ts), the default blue until one is; a
// plain /spider shows it, /spider?colour=3dff9a a custom colour and
// ?colour=amber Amber until a colour is chosen, which then leaves the address
// plain; a colour it no longer knows (?colour=purple, once a preset) is the
// one chosen. The last custom colour is remembered on the device, which the
// Custom swatch offers again. The map is drawn to markup to see the Spider web take its canvas
// under the SVG in the address's colour, and Orbits keep none; and to see the
// Spider web's sun always the sun, never your photo, with no "+" to add one.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { buildModel } from "./model.ts";
import { circles, OrbitMap, photoShown, web } from "./Orbits.tsx";
import { savedStorage, resetSaved } from "../savedStore.ts";
import { COLOUR_KEY, COLOURS, colourIn, DEFAULT_COLOUR, DEFAULT_CUSTOM, presetOf, searchWith, webColourChosen, webColourStore, webCustomStore } from "./webColour.ts";

/**
 * A browser's address bar, as the store sees it: the address, and a history
 * whose replaceState changes it in place (as a browser's does) and counts its
 * calls; `open` is a fresh page load at another address.
 */
function browser(pathname = "/spider", search = "") {
  const location = { pathname, search, hash: "" };
  const replaced: string[] = [];
  const history = {
    replaceState: (_state: unknown, _title: string, url: string) => {
      replaced.push(url);
      const at = new URL(url, "http://localhost");
      location.pathname = at.pathname;
      location.search = at.search;
      location.hash = at.hash;
    },
  };
  vi.stubGlobal("location", location);
  vi.stubGlobal("history", history);
  return {
    location,
    replaced,
    open(path: string, query = "") {
      location.pathname = path;
      location.search = query;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSaved();
});

describe("the colours", () => {
  it("are Amber, with a swatch and a line on it, then any custom colour", () => {
    expect(COLOURS.map((c) => [c.colour, c.title])).toEqual([["amber", "Amber"]]);
    for (const c of COLOURS) {
      expect(c.about).not.toBe("");
      expect(c.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect([presetOf("amber"), presetOf("#3dff9a")]).toEqual(["amber", "custom"]);
  });

  it("remember the last custom colour on the device, a neon green until one is chosen", () => {
    const items = new Map<string, string>();
    webCustomStore.reload({ getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) });
    expect(webCustomStore.get()).toBe(DEFAULT_CUSTOM);
    webCustomStore.set("#123abc");
    expect([...items.values()]).toEqual(["#123abc"]);
    webCustomStore.reload({ getItem: () => "not a colour", setItem: () => {}, removeItem: () => {} });
    expect(webCustomStore.get()).toBe(DEFAULT_CUSTOM);
    webCustomStore.reload(null);
  });
});

describe("the colour in an address", () => {
  it("reads ?colour=<colour> or a custom colour's hex, and nothing else", () => {
    expect(colourIn("?a=1&colour=amber")).toBe("amber");
    expect(colourIn("?colour=3DFF9A")).toBe("#3dff9a");
    expect(colourIn("?colour=%233dff9a")).toBe("#3dff9a");
    expect(colourIn("?colour=teal")).toBeNull();
    expect(colourIn("?colour=purple")).toBeNull();
    expect(colourIn("?colour=3dff9")).toBeNull();
    expect(colourIn("")).toBeNull();
  });

  it("takes the colour last chosen out, keeping the rest of the query", () => {
    expect(searchWith("?colour=3dff9a", "#65a5e2")).toBe("");
    expect(searchWith("?a=1&colour=3dff9a", "#65a5e2")).toBe("?a=1");
    expect(searchWith("?a=1&colour=purple", "#65a5e2")).toBe("?a=1");
    expect(searchWith("?a=1", "amber")).toBe("?a=1&colour=amber");
  });

  it("writes a custom colour as its hex, without the #, so a copied link opens it", () => {
    expect(searchWith("?a=1", "#3dff9a")).toBe("?a=1&colour=3dff9a");
    expect(colourIn(searchWith("", "#3dff9a"))).toBe("#3dff9a");
  });
});

describe("the colour shown", () => {
  beforeEach(() => resetSaved());

  it("is the colour last chosen, the default blue until one is, at no address, a plain one, or one asking for a colour it does not know, Purple (once a preset) included", () => {
    expect(DEFAULT_COLOUR).toBe("#65a5e2");
    expect(webColourStore.get()).toBe("#65a5e2");
    const page = browser("/spider", "");
    expect(webColourStore.get()).toBe("#65a5e2");
    page.open("/spider", "?colour=teal");
    expect(webColourStore.get()).toBe("#65a5e2");
    page.open("/spider", "?colour=purple");
    expect(webColourStore.get()).toBe("#65a5e2");
    resetSaved({ "web.colour": "amber" });
    expect(webColourStore.get()).toBe("amber");
  });

  it("is what an address asks for, until a colour is chosen", () => {
    const page = browser("/spider", "?colour=3dff9a");
    expect(webColourStore.get()).toBe("#3dff9a");
    page.open("/spider", "?colour=amber");
    expect(webColourStore.get()).toBe("amber");
    page.open("/spider");
    expect(webColourStore.get()).toBe("#65a5e2");
  });

  it("saves a choice, so a plain address shows it on any browser, and leaves the address plain", () => {
    const page = browser("/spider", "?a=1&colour=3dff9a");
    const heard: string[] = [];
    const stop = webColourStore.subscribe(() => heard.push(webColourStore.get()));
    webColourStore.set("amber");
    expect(page.location.search).toBe("?a=1");
    expect([webColourChosen.get(), savedStorage.getItem(COLOUR_KEY)]).toEqual(["amber", "amber"]);
    page.open("/spider");
    expect(webColourStore.get()).toBe("amber");
    webColourStore.set("#3dff9a");
    expect(page.location.search).toBe("");
    expect(savedStorage.getItem(COLOUR_KEY)).toBe("#3dff9a");
    expect(heard.at(-1)).toBe("#3dff9a");
    stop();
  });

  it("follows the saved colour changing, as it does when another device chose one", () => {
    browser("/spider", "");
    const heard: string[] = [];
    const stop = webColourStore.subscribe(() => heard.push(webColourStore.get()));
    resetSaved({ "web.colour": "#123abc" });
    expect(heard).toEqual(["#123abc"]);
    stop();
  });
});

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
function person(id: number, name: string, messages: number): PersonRelationship {
  return {
    id, name, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(messages), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(messages) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}
const report: RelationshipsReport = {
  generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [],
  people: [person(1, "Ada Sample", 30), person(2, "Bruno Placeholder", 20), person(3, "Cy Example", 10)],
};
const model = buildModel(report);
const props = { model, width: 800, height: 600, inset: 60, hover: () => {}, open: () => {} };

describe("the Spider web view", () => {
  // There is no window here: one that asks for reduced motion draws everyone where they settle at once (stubbed for each
  // test, since every test ends by clearing the stubs).
  beforeEach(() => {
    vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) });
    // Amber chosen, everyone named in full, as these were written for.
    resetSaved({ "web.colour": "amber", names: "full" });
  });

  it("is Orbits' map with the web look, and Orbits itself keeps its own look with no canvas", () => {
    expect(web.slug).toBe("web");
    const orbits = renderToStaticMarkup(createElement(OrbitMap, props));
    expect(orbits).not.toContain("<canvas");
    expect(orbits).toContain('<svg class="orbits"');
    expect(orbits).toContain('stop-color="#fff8e8"');
  });

  it("puts a canvas under and one over the SVG in Amber at a plain address with Amber chosen, names the colour on them, and recolours the sun", () => {
    const markup = renderToStaticMarkup(createElement(web.View, props));
    const under = markup.indexOf('<canvas class="orbits-web orbits-web--under orbits-web--amber"');
    const over = markup.indexOf('<canvas class="orbits-web orbits-web--over orbits-web--amber"');
    expect(under).toBeGreaterThan(-1);
    expect(under).toBeLessThan(markup.indexOf("<svg"));
    expect(over).toBeGreaterThan(markup.indexOf("</svg>"));
    expect(markup).toContain('<svg class="orbits orbits--web orbits--amber"');
    expect(markup).not.toContain('stop-color="#fff8e8"');
    // Everyone is still drawn, as their name in place of their identicon.
    expect(markup.match(/class="orbits__name/g) ?? []).toHaveLength(3);
    expect(markup).toContain("Ada Sample");
  });

  it("never shows your photo nor its buttons, while Orbits and Circles still do", () => {
    expect(photoShown("web")).toBe(false);
    expect(photoShown("night")).toBe(true);
    expect(renderToStaticMarkup(createElement(OrbitMap, props))).toContain('aria-label="Add a photo of you"');
    expect(renderToStaticMarkup(createElement(circles.View, props))).toContain('aria-label="Add a photo of you"');
    const markup = renderToStaticMarkup(createElement(web.View, props));
    expect(markup).not.toContain("photo of you");
    expect(markup).not.toContain("<image");
    expect(markup).toContain(">you</text>");
  });

  it("is the colour chosen, Amber, at /spider?colour=purple, a preset no longer offered", () => {
    vi.stubGlobal("location", { pathname: "/spider", search: "?colour=purple", hash: "" });
    const markup = renderToStaticMarkup(createElement(web.View, props));
    expect(markup).toContain('<svg class="orbits orbits--web orbits--amber"');
    expect(markup).toContain("--web-accent:rgba(255, 179, 71, 0.8)");
  });

  it("is a custom colour at /spider?colour=3dff9a, its look worked out from it, on the canvases and the SVG alike", () => {
    vi.stubGlobal("location", { pathname: "/spider", search: "?colour=3dff9a", hash: "" });
    const markup = renderToStaticMarkup(createElement(web.View, props));
    expect(markup).toContain('<canvas class="orbits-web orbits-web--under orbits-web--custom"');
    expect(markup).toContain('<svg class="orbits orbits--web orbits--custom"');
    expect(markup).toMatch(/--web-accent:rgba\(\d+, \d+, \d+, 0\.800\)/);
    expect(markup).not.toContain("--web-accent:rgba(255, 179, 71");
  });
});
