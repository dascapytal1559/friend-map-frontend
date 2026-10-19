// Names on the map views (Orbits, Circles, the Spider web, Orbits 3D): each
// named person drawn as their name alone, centred where their icon would be
// (centreOnIcons), everyone not named keeping their icon; on Orbits and the
// Spider web turned round their orbits until no name covers another
// (useNameFit); every name in its person's own icon colour, with no card; and
// no setting for where names go, your choice of Name only being the
// only one.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSaved } from "../savedStore.ts";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { buildModel } from "./model.ts";
import { drawnBox, keptZoom, nameAt, OrbitMap } from "./Orbits.tsx";
import { Orbits3DMap } from "./Orbits3D.tsx";
import { boxesMeet, centreOnIcons, glowColour, textUnits } from "./orbitsLayout.ts";
import { WEB_CHAR_WIDTH } from "./orbitsSky.ts";
import { HOME } from "./orbitsZoom.ts";
import type { ViewProps } from "./view.tsx";
import { settingsOpenStore } from "../ViewSettings.tsx";
import { ViewList } from "../ViewSwitcher.tsx";

// Drawn with names in full, as these maps were laid out for; the real app starts at First L..
beforeEach(() => resetSaved({ names: "full" }));
afterEach(() => {
  resetSaved();
  keptZoom.current = HOME;
  vi.unstubAllGlobals();
});

describe("in the menu", () => {
  /** The open view's settings, as the menu draws them (open), on a page that shows names. */
  const settings = (current: string, demo = true) => {
    settingsOpenStore.reload(null);
    settingsOpenStore.set(true);
    const html = renderToStaticMarkup(createElement(ViewList, { current, onPick: () => {}, names: true, demo }));
    settingsOpenStore.set(false);
    return /<section class="view-switcher__settings"[^>]*>.*?<\/section>/.exec(html)?.[0] ?? "";
  };
  const labels = (html: string) => [...html.matchAll(/class="view-switcher__label"[^>]*>([^<]+)</g)].map((m) => m[1]);

  it("offers no choice of where names go: Name format, then each view's own, Show top names among them", () => {
    expect(labels(settings("orbits"))).toEqual(["Name format", "Theme", "Show top names", "Name padding"]);
    expect(labels(settings("web"))).toEqual(["Name format", "Show top names", "Name padding", "Colour", "Strand curve", "Spokes", "Web strength"]);
    expect(labels(settings("orbits-3d"))).toEqual(["Name format", "Show top names"]);
    expect(labels(settings("circles"))).toEqual(["Name format"]);
    expect(labels(settings("city"))).toEqual(["Name format", "Show top names"]);
    for (const view of ["orbits", "orbits-3d", "circles", "web", "city"]) expect(settings(view), view).not.toMatch(/Name placement|Next to|On icon|Name only/);
  });
});

describe("centreOnIcons", () => {
  it("centres every name on its body, whatever it covers, leaving none out", () => {
    const spots = centreOnIcons([
      { id: 1, x: 0, y: 0, text: "Ada Sample" },
      { id: 2, x: 4, y: 0, text: "Bruno Placeholder" },
      { id: 3, x: 0, y: 2, text: "Cy", scale: 0.84 },
    ]);
    expect(spots.map((s) => [s.id, s.x, s.anchor])).toEqual([[1, 0, "middle"], [2, 4, "middle"], [3, 0, "middle"]]);
    expect(boxesMeet(spots[0], spots[1])).toBe(true);
    expect(spots[2].y).toBeCloseTo(2 + 4 * 0.84);
  });
});

describe("the map's names", () => {
  const NOW = Date.parse("2026-03-15T12:00:00+11:00");
  const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
  const person = (id: number): PersonRelationship => ({
    id, name: `Sample Person ${id}`, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(2000 - id * 8), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(2000 - id * 8) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  });
  const report: RelationshipsReport = { generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: Array.from({ length: 160 }, (_, i) => person(i + 1)) };
  const props = { model: buildModel(report), width: 1200, height: 900, inset: 60, hover: () => {}, open: () => {} } as ViewProps;

  function draw(element: ReturnType<typeof createElement>): string {
    // There is no window here: one that asks for reduced motion draws everyone where they settle at once.
    vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) });
    return renderToStaticMarkup(element);
  }
  /** Each name drawn: whose (by number), where, and how it is anchored. */
  const namesIn = (markup: string) => [...markup.matchAll(/<text class="(orbits__name[^"]*)" x="([-\d.e]+)" y="([-\d.e]+)" text-anchor="(\w+)"[^>]*>Sample Person (\d+)</g)]
    .map((m) => ({ id: Number(m[5]), className: m[1], x: Number(m[2]), y: Number(m[3]), anchor: m[4] }));
  /** What each guide ring's label covers, as the map keeps names off it (ringLabelBox in Orbits.tsx), from where it is drawn. */
  const ringLabelsIn = (markup: string) => [...markup.matchAll(/<text y="([-\d.e]+)" text-anchor="middle"[^>]*>(top \d+)</g)]
    .map((m) => ({ left: -(m[2].length * 7) / 2 - 4, right: (m[2].length * 7) / 2 + 4, top: Number(m[1]) - 3.5 - 8, bottom: Number(m[1]) - 3.5 + 6 }));
  /** Each marker's middle, by its order on the map. */
  const markers = (markup: string) => [...markup.matchAll(/<circle cx="([-\d.e]+)" cy="([-\d.e]+)" r="([\d.e]+)" class="orbits__body"/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
  /** A name's box, as centreOnIcons measures it, from where it is drawn: centred across its spot, its line's middle 4 pixels over the baseline. */
  const box = (n: { id: number; x: number; y: number; className: string }, charWidth = 6.6) => {
    const scale = n.className.includes("--minor") ? 0.84 : 1;
    const wide = textUnits(`Sample Person ${n.id}`) * charWidth * scale;
    const left = n.x - wide / 2;
    const middle = n.y - 4 * scale;
    return { left, right: left + wide, top: middle - 6 * scale, bottom: middle + 6 * scale };
  };
  /** Whether a name is centred on a marker. */
  const onAMarker = (n: { x: number; y: number; className: string }, middles: { x: number; y: number }[]) => {
    const scale = n.className.includes("--minor") ? 0.84 : 1;
    return middles.some((m) => Math.abs(m.x - n.x) < 1e-6 && Math.abs(m.y - (n.y - 4 * scale)) < 1e-6);
  };
  const TOP_100 = Array.from({ length: 100 }, (_, i) => i + 1);

  it("draws every name in its person's own icon colour, with the plain outline, no backing pill and no card, its glow on the letters", () => {
    // Person 7 is one to reach out to: their name glows.
    const glowing = buildModel({ ...report, people: report.people.map((p) => (p.id === 7 ? { ...p, shouldReachOut: true } : p)) });
    /** Each name's style, by whose it is. */
    const styles = (markup: string) => [...markup.matchAll(/<text class="orbits__name[^"]*"[^>]*style="([^"]*)"[^>]*>Sample Person (\d+)</g)]
      .map((m) => ({ id: Number(m[2]), fill: /fill:([^;"]+)/.exec(m[1])![1], glows: m[1].includes("drop-shadow") }));
    const own = glowColour("00000000000000a1", null);
    for (const [view, markup] of [
      ["Orbits", draw(createElement(OrbitMap, { ...props, model: glowing }))],
      ["Spider web", draw(createElement(OrbitMap, { ...props, model: glowing, look: "web" }))],
      ["Orbits 3D", draw(createElement(Orbits3DMap, { ...props, model: glowing }))],
    ] as const) {
      const names = styles(markup);
      expect(names.length, view).toBe(100);
      for (const n of names) expect(n.fill, view).toBe(own);
      expect(names.filter((n) => n.glows).map((n) => n.id), view).toEqual([7]);
      expect(markup, view).not.toMatch(/--name-outline|orbits__backing|orbits__card|orbits__leader/);
    }
  });

  it("draws everyone Show top names names as their name alone in place of their icon, everyone else as their icon, and on both map views turns them round their orbits until no name covers another", () => {
    for (const look of ["night", "web"] as const) {
      const markup = draw(createElement(OrbitMap, { ...props, look }));
      const names = namesIn(markup);
      const left = markers(markup);
      expect(names.map((n) => n.id).sort((a, b) => a - b)).toEqual(TOP_100);
      for (const n of names) expect(n.anchor).toBe("middle");
      // No marker under any name; the 60 not named keep theirs.
      for (const n of names) expect(onAMarker(n, left)).toBe(false);
      expect(left).toHaveLength(60);
      // Each view's names measured in its own type: the Spider web's monospace is wider. With the closest 25 named,
      // none covers another on Orbits; on the Spider web a few may, its even rings putting the closest few within some
      // 80 pixels of the hub, where names of 15 monospaced letters, over 100 pixels wide, have no clear angle within
      // FIT_TURN.
      const wide = look === "web" ? WEB_CHAR_WIDTH : 6.6;
      const overlaps = (list: typeof names) => list.reduce((sum, a, i) => sum + list.slice(i + 1).filter((b) => boxesMeet(box(a, wide), box(b, wide))).length, 0);
      const fewer = namesIn(draw(createElement(OrbitMap, { ...props, look, named: 25 })));
      expect(fewer).toHaveLength(25);
      expect(overlaps(fewer)).toBeLessThanOrEqual(look === "web" ? 2 : 0);
      // And off the ring labels, where each view draws them: on the rings, or the Spider web's level top threads.
      const rings = ringLabelsIn(markup);
      expect(rings.length).toBeGreaterThan(2);
      for (const n of fewer) for (const ring of rings) expect(boxesMeet(box(n, wide), ring)).toBe(false);
    }
  });

  it("draws whoever is picked out in place of their icon too, last, over any name under theirs, the rest keeping their icons", () => {
    for (const held of [3, 150]) {
      const markup = draw(createElement(OrbitMap, { ...props, held }));
      const names = namesIn(markup);
      expect(names.at(-1)!.id).toBe(held);
      expect(names.at(-1)!.className).toContain("orbits__name--focus");
      expect(names.filter((n) => n.id === held)).toHaveLength(1);
      expect(onAMarker(names.at(-1)!, markers(markup))).toBe(false);
      expect(markers(markup)).toHaveLength(held === 150 ? 59 : 60);
    }
  });

  it("is the same on Orbits 3D seen from straight above, without the turning", () => {
    const names = namesIn(draw(createElement(Orbits3DMap, props)));
    expect(names.map((n) => n.id).sort((a, b) => a - b)).toEqual(TOP_100);
    for (const n of names) expect(n.anchor).toBe("middle");
  });
});

describe("a name in place of its icon", () => {
  const label = (id: number, x: number, y: number, text: string) => ({ ...centreOnIcons([{ id, x, y, text }])[0], dx: 0, dy: 4, linkedOnly: false });

  it("is where it was placed, carried along with its person as they move", () => {
    const placed = label(1, 100, 50, "Ada Sample");
    expect(drawnBox(placed, { x: 100, y: 50 })).toEqual({ left: placed.left, right: placed.right, top: placed.top, bottom: placed.bottom });
    const moved = drawnBox(placed, { x: 130, y: 40 });
    expect(moved.left - placed.left).toBeCloseTo(30);
    expect(moved.top - placed.top).toBeCloseTo(-10);
  });

  it("picks its person anywhere on it, the name on top where two meet, and nobody off them", () => {
    const names = [label(1, 0, 0, "Ada Sample"), label(2, 60, 0, "Bruno Placeholder")].map((l) => ({ id: l.id, box: drawnBox(l, { x: l.x, y: l.y - 4 }) }));
    // Ada's name runs some 33 px either side of her place, past where her icon was.
    expect(nameAt({ x: -30, y: 0 }, names)).toBe(1);
    expect(nameAt({ x: 10, y: 2 }, names)).toBe(2);
    expect(nameAt({ x: 0, y: 20 }, names)).toBeNull();
    expect(nameAt({ x: 0, y: 9 }, names)).toBeNull();
    expect(nameAt({ x: -10, y: 9 }, names, 4)).toBe(1);
  });
});
