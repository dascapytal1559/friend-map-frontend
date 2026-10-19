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
    for (const [slug, title] of [["orbits", "Orbits"], ["circles", "Circles"], ["table", "Table"], ["calendar", "Calendar"], ["river", "The river"]]) {
      const html = renderToStaticMarkup(createElement(ViewSwitcher, { current: slug, crumb: "Friend map" }));
      expect(html).toMatch(new RegExp(`<h1><button[^>]*aria-expanded="false"[^>]*>${title}<svg`));
      expect(html).toContain('<span class="view-switcher__crumb">Friend map</span>');
      expect(html).not.toContain("<nav");
    }
  });

  it("lists the main views (Orbits, Orbits 3D, the Spider web and the City), Circles, the Table, the Calendar and the Time river, the frozen views and the Demo, the current one marked", () => {
    const html = renderToStaticMarkup(createElement(ViewList, { current: "table", onPick: () => {}, demo: false }));
    expect(links(html)).toEqual(["Orbits", "Orbits 3D", "Spider web", "City", "Circles", "Table", "Calendar", "Time river", "The river", "Reciprocity", "Demo"]);
    expect(groups(html)).toEqual(["Main views", "Other views", "Frozen", "About the app"]);
    // Each group's views, in order: the main views under their heading, the others under theirs.
    expect(html.indexOf(">Main views<")).toBeLessThan(html.indexOf(">Orbits</a>"));
    expect(html.indexOf(">City</a>")).toBeLessThan(html.indexOf(">Other views<"));
    expect(html.indexOf(">Other views<")).toBeLessThan(html.indexOf(">Circles</a>"));
    expect(html).toMatch(/<a href="\/orbits-3d">Orbits 3D<\/a>/);
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
    const html = renderToStaticMarkup(createElement(ViewList, { current: "city", onPick: () => {}, demo: true, root: "/demo" }));
    expect(links(html)).toEqual(["Orbits", "Orbits 3D", "Spider web", "City", "The river", "Reciprocity"]);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/demo/orbits", "/demo/orbits-3d", "/demo/spider", "/demo/city", "/demo/river", "/demo/reciprocity"]);
    expect(html).toMatch(/<a href="\/demo\/city" aria-current="page">City<\/a>/);
    expect(html).not.toMatch(/About the app|>Demo<|Frozen|Table|Calendar|Circles|Time river/);
    // The views are grouped as the main ones and the others, the river and Reciprocity among them.
    expect(groups(html)).toEqual(["Main views", "Other views", "City settings"]);
    expect(html.indexOf(">City</a>")).toBeLessThan(html.indexOf(">Other views<"));
  });

  it("in the static demo lists the same views at the root of its own site", () => {
    const html = renderToStaticMarkup(createElement(ViewList, { current: "orbits", onPick: () => {}, demo: true, root: "" }));
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/orbits", "/orbits-3d", "/spider", "/city", "/river", "/reciprocity"]);
    expect(html).toMatch(/<a href="\/orbits" aria-current="page">Orbits<\/a>/);
  });
});
