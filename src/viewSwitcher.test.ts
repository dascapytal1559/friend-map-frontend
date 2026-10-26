// The title at the top left is the view switcher: the page's name, with a
// caret, as one button that opens the list of views.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ViewList, ViewSwitcher } from "./ViewSwitcher.tsx";

const groups = (html: string) => [...html.matchAll(/view-switcher__group[^>]*>(?:<span[^>]*><\/span>)?([^<]+)</g)].map((m) => m[1]);
const links = (html: string) => [...html.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);

describe("the view switcher", () => {
  it("is the page's title: its name and a caret in one button, under the crumb, closed", () => {
    for (const [slug, title] of [["orbits-3d", "Orbits"], ["orbits", "Orbits 2D"], ["circles", "Circles"], ["table", "Table"], ["calendar", "Calendar"], ["river", "The river"]]) {
      const html = renderToStaticMarkup(createElement(ViewSwitcher, { current: slug, crumb: "Friend map" }));
      expect(html).toMatch(new RegExp(`<h1><button[^>]*aria-expanded="false"[^>]*>${title}<svg`));
      expect(html).toContain('<span class="view-switcher__crumb">Friend map</span>');
      expect(html).not.toContain("<nav");
    }
  });

  it("lists the main views (Orbits, the Spider web and the City), Circles, the Table, the Calendar and the Time river, the frozen views and the Demo, the current one marked", () => {
    const html = renderToStaticMarkup(createElement(ViewList, { current: "table", onPick: () => {}, demo: false }));
    // Orbits is the solar system; Orbits 2D, the flat one, is hidden for now.
    expect(links(html)).toEqual(["Orbits", "Spider web", "City", "Circles", "Table", "Calendar", "Time river", "The river", "Reciprocity", "Demo"]);
    expect(groups(html)).toEqual(["Main views", "Other views", "Frozen", "About the app"]);
    // Each group's views, in order: the main views under their heading, the others under theirs.
    expect(html.indexOf(">Main views<")).toBeLessThan(html.indexOf(">Orbits</a>"));
    expect(html.indexOf(">City</a>")).toBeLessThan(html.indexOf(">Other views<"));
    expect(html.indexOf(">Other views<")).toBeLessThan(html.indexOf(">Circles</a>"));
    expect(html).toMatch(/<a href="\/orbits-3d">Orbits<\/a>/);
    expect(html).not.toContain('href="/orbits"');
    expect(html).toMatch(/<a href="\/spider">Spider web<\/a>/);
    expect(html).toMatch(/<a href="\/demo" title="[^"]*made-up crowd[^"]*">Demo<\/a>/);
    expect(html).toMatch(/<a href="\/table" aria-current="page">Table<\/a>/);
    expect(html).toMatch(/<a href="\/calendar">Calendar<\/a>/);
    expect(html).toMatch(/<a href="\/time-river">Time river<\/a>/);
    expect(html).toMatch(/<a href="\/circles">Circles<\/a>/);
    expect(html).toMatch(/<a href="\/city">City<\/a>/);
    expect(html).not.toContain("Time machine");
  });

  it("in the demo lists its own views, none of them frozen, every one under /demo, and no Demo or way into the real map", () => {
    const html = renderToStaticMarkup(createElement(ViewList, { current: "orbits-3d", onPick: () => {}, demo: true, root: "/demo" }));
    // Orbits (the solar system) and the Spider web.
    expect(links(html)).toEqual(["Orbits", "Spider web"]);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/demo/orbits-3d", "/demo/spider"]);
    expect(html).toMatch(/<a href="\/demo\/orbits-3d" aria-current="page">Orbits<\/a>/);
    expect(html).not.toMatch(/About the app|>Demo<|Frozen|Table|Calendar|Circles|Time river|City|river|Reciprocity|3D</);
    // Both are main views, so there is no group of others.
    expect(groups(html)).toEqual(["Main views", "Orbits settings"]);
  });

  it("keeps Orbits 2D's settings in the menu when it is opened by its address, though it is not listed", () => {
    const html = renderToStaticMarkup(createElement(ViewList, { current: "orbits", onPick: () => {}, demo: false }));
    expect(links(html)).not.toContain("Orbits 2D");
    expect(groups(html)).toContain("Orbits 2D settings");
  });

  it("titles the solar system Orbits, in the demo and the app alike", () => {
    for (const demo of [true, false]) expect(renderToStaticMarkup(createElement(ViewSwitcher, { current: "orbits-3d", crumb: "Friend map", demo }))).toMatch(/<h1><button[^>]*>Orbits<svg/);
  });

  it("in the static demo lists the same views at the root of its own site", () => {
    const html = renderToStaticMarkup(createElement(ViewList, { current: "orbits-3d", onPick: () => {}, demo: true, root: "" }));
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/orbits-3d", "/spider"]);
    expect(html).toMatch(/<a href="\/orbits-3d" aria-current="page">Orbits<\/a>/);
  });
});
