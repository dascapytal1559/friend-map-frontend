// Zooming and panning Orbits (the user's ask: "a feature to Orbits that
// lets me zoom in"): the maths in orbitsZoom.ts on its own, then the map drawn
// to markup at a zoom, to see places spread while the sun and names keep their
// size and markers grow only until their identicons read, more people named,
// and a zoom that would show nobody let go.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSaved } from "../savedStore.ts";
import type { PersonRelationship } from "../archive.ts";
import { buildModel } from "./model.ts";
import { keptZoom, OrbitMap } from "./Orbits.tsx";
import { BACKGROUND, glowColour, READABLE } from "./orbitsLayout.ts";
import { boundsOf, chooseNamed, clampZoom, HOME, MAX_ZOOM, panBy, panToShow, pinchZoom, wheelFactor, zoomAt, zoomBetween, zoomToShow, type Zoom } from "./orbitsZoom.ts";

// The system reaches 300 pixels from the sun every way, a little more to the right.
beforeEach(() => resetSaved());
afterEach(() => resetSaved());

const extent = { left: -300, right: 320, top: -300, bottom: 300 };

describe("clampZoom", () => {
  it("never zooms out past the whole system, nor in past MAX_ZOOM", () => {
    expect(clampZoom({ k: 0.5, x: 0, y: 0 }, extent).k).toBe(1);
    expect(clampZoom({ k: 40, x: 0, y: 0 }, extent).k).toBe(MAX_ZOOM);
  });

  it("cannot shift the whole system, unzoomed, at all", () => {
    expect(clampZoom({ k: 1, x: 120, y: -80 }, extent)).toEqual(HOME);
  });

  it("shifts only so far that the system's edge never comes inside where it sits unzoomed", () => {
    // At 3x the left edge, unzoomed at -300, may come to -300 and no further: x + 3 * -300 <= -300.
    expect(clampZoom({ k: 3, x: 5000, y: 0 }, extent).x).toBe(600);
    expect(clampZoom({ k: 3, x: -5000, y: 0 }, extent).x).toBe(-640);
    expect(clampZoom({ k: 3, x: 0, y: -5000 }, extent).y).toBe(-600);
    // Within bounds, kept as it is.
    expect(clampZoom({ k: 3, x: 100, y: -50 }, extent)).toEqual({ k: 3, x: 100, y: -50 });
  });

  it("with the panel over the map hiding the system's edges, shifts unzoomed as far as brings each edge into view", () => {
    // A map 800 wide, the middle 400 of it in view beside the panel: the system's edges, at -300 and 320, may come to
    // -200 and 200, so the map shifts 100 right or 120 left, and no further; up and down, not at all.
    const bounds = boundsOf(extent, 800, 400);
    expect(clampZoom({ k: 1, x: 5000, y: 80 }, bounds)).toEqual({ k: 1, x: 100, y: 0 });
    expect(clampZoom({ k: 1, x: -5000, y: 0 }, bounds).x).toBe(-120);
    // Zoomed in, as far as the edge of what is in view, nearer the sun than where the system's edge sits unzoomed.
    expect(clampZoom({ k: 3, x: 5000, y: 0 }, bounds).x).toBe(700);
    // `margin` in from what is in view.
    expect(clampZoom({ k: 1, x: 5000, y: 0 }, boundsOf(extent, 800, 400, 60)).x).toBe(160);
  });

  it("is as ever with all of the map in view, or more of it than the system spans", () => {
    expect(boundsOf(extent, 800, 800)).toBe(extent);
    expect(clampZoom({ k: 1, x: 120, y: 0 }, boundsOf(extent, 1600, 1000))).toEqual(HOME);
  });
});

describe("zoomAt", () => {
  // Where a spot (relative to the sun, unzoomed) is drawn, relative to the sun's unzoomed spot.
  const drawnAt = (zoom: Zoom, p: { x: number; y: number }) => ({ x: zoom.x + zoom.k * p.x, y: zoom.y + zoom.k * p.y });

  it("keeps the spot under the pointer where it is", () => {
    const pointer = { x: 150, y: -60 };
    const zoomed = zoomAt(HOME, 2, pointer, extent);
    expect(zoomed.k).toBe(2);
    // The spot under the pointer was at (150, -60) unzoomed; it is drawn there still.
    expect(drawnAt(zoomed, pointer)).toEqual(pointer);
    const further = zoomAt(zoomed, 1.5, { x: -40, y: 30 }, extent);
    const under = { x: (-40 - zoomed.x) / zoomed.k, y: (30 - zoomed.y) / zoomed.k };
    expect(drawnAt(further, under).x).toBeCloseTo(-40);
    expect(drawnAt(further, under).y).toBeCloseTo(30);
  });

  it("comes back to the whole map, unshifted, zooming all the way out from anywhere", () => {
    const zoomed = zoomAt(zoomAt(HOME, 4, { x: 250, y: 200 }, extent), 0.5, { x: -100, y: 0 }, extent);
    expect(zoomed.k).toBe(2);
    expect(zoomAt(zoomed, 0.1, { x: 30, y: 30 }, extent)).toEqual(HOME);
  });

  it("stops at MAX_ZOOM, still about the pointer", () => {
    const zoomed = zoomAt({ k: 10, x: 0, y: 0 }, 3, { x: 10, y: 0 }, extent);
    expect(zoomed.k).toBe(MAX_ZOOM);
    expect(zoomed.x).toBeCloseTo(10 - 10 * (MAX_ZOOM / 10));
  });
});

describe("panBy", () => {
  it("shifts by the drag, within bounds", () => {
    expect(panBy({ k: 2, x: 0, y: 0 }, 40, -25, extent)).toEqual({ k: 2, x: 40, y: -25 });
    expect(panBy({ k: 2, x: 0, y: 0 }, 900, 0, extent).x).toBe(300);
    expect(panBy(HOME, 40, 40, extent)).toEqual(HOME);
  });
});

describe("pinchZoom", () => {
  const drawnAt = (zoom: Zoom, p: { x: number; y: number }) => ({ x: zoom.x + zoom.k * p.x, y: zoom.y + zoom.k * p.y });

  it("zooms by how far the fingers spread, keeping the spot between them where it is", () => {
    const zoomed = pinchZoom(HOME, [{ x: 90, y: -40 }, { x: 110, y: -40 }], [{ x: 70, y: -40 }, { x: 130, y: -40 }], extent);
    expect(zoomed.k).toBe(3);
    expect(drawnAt(zoomed, { x: 100, y: -40 })).toEqual({ x: 100, y: -40 });
  });

  it("moves with the spot between the fingers, so a pinch can pan as it zooms", () => {
    const from = { k: 2, x: 20, y: 10 };
    const start = [{ x: -10, y: 0 }, { x: 10, y: 0 }] as const;
    // Under the middle of the fingers: (0 - 20) / 2, (0 - 10) / 2 unzoomed.
    const under = { x: -10, y: -5 };
    const moved = pinchZoom(from, start, [{ x: 30, y: 25 }, { x: 50, y: 25 }], extent);
    expect(moved.k).toBe(2);
    expect(drawnAt(moved, under)).toEqual({ x: 40, y: 25 });
    const closed = pinchZoom(from, start, [{ x: 35, y: 25 }, { x: 45, y: 25 }], extent);
    expect(closed.k).toBe(1);
  });

  it("stays within bounds, from the whole map to MAX_ZOOM", () => {
    expect(pinchZoom(HOME, [{ x: -50, y: 0 }, { x: 50, y: 0 }], [{ x: -10, y: 0 }, { x: 10, y: 0 }], extent)).toEqual(HOME);
    expect(pinchZoom(HOME, [{ x: -1, y: 0 }, { x: 1, y: 0 }], [{ x: -100, y: 0 }, { x: 100, y: 0 }], extent).k).toBe(MAX_ZOOM);
  });
});

describe("zoomToShow", () => {
  // The view, relative to the sun's unzoomed spot: 200 pixels each way, a little more below.
  const view = { left: -200, right: 200, top: -200, bottom: 240 };
  const drawnAt = (zoom: Zoom, at: { x: number; y: number }) => ({ x: zoom.x + at.x * zoom.k, y: zoom.y + at.y * zoom.k });

  it("leaves the zoom as it is for someone in view, zoomed in far enough", () => {
    const zoom = { k: 2, x: 30, y: -10 };
    expect(zoomToShow(zoom, { x: 50, y: 80 }, 1.5, view, extent)).toBe(zoom);
    expect(zoomToShow(HOME, { x: 0, y: 180 }, 1, view, extent)).toBe(HOME);
  });

  it("centres the view on someone out of it, at the same zoom", () => {
    const zoom = { k: 4, x: 0, y: 0 };
    const at = { x: 120, y: -90 };
    const to = zoomToShow(zoom, at, 1, view, extent);
    expect(to.k).toBe(4);
    expect(drawnAt(to, at)).toEqual({ x: 0, y: 20 });
  });

  it("zooms in on someone too small to read, centred on them", () => {
    const at = { x: 40, y: 30 };
    const to = zoomToShow(HOME, at, 3, view, extent);
    expect(to.k).toBe(3);
    expect(drawnAt(to, at)).toEqual({ x: 0, y: 20 });
  });

  it("zooms no further than MAX_ZOOM, and stays within bounds by the system's edge", () => {
    expect(zoomToShow(HOME, { x: 10, y: 10 }, 40, view, extent).k).toBe(MAX_ZOOM);
    // On the system's edge at 1.2, the bounds let the map shift only so far toward centring them.
    const to = zoomToShow(HOME, { x: 315, y: 0 }, 1.2, view, extent);
    expect(to.k).toBeCloseTo(1.2);
    expect(to.x).toBeCloseTo(-extent.right * 0.2);
  });
});

describe("panToShow", () => {
  // In view beside the panel: 200 pixels each way across, a little more below.
  const view = { left: -200, right: 200, top: -200, bottom: 240 };
  const bounds = boundsOf(extent, 800, 400);

  it("leaves the zoom as it is for someone in view", () => {
    const zoom = { k: 2, x: 30, y: -10 };
    expect(panToShow(zoom, { x: 50, y: 80 }, view, bounds)).toBe(zoom);
  });

  it("pans someone out of view just far enough to bring them to its edge, at the same zoom", () => {
    expect(panToShow(HOME, { x: 290, y: 10 }, view, bounds)).toEqual({ k: 1, x: -90, y: 0 });
    expect(panToShow({ k: 4, x: 0, y: 0 }, { x: -60, y: 70 }, view, bounds)).toEqual({ k: 4, x: 40, y: -40 });
  });

  it("pans no further than the bounds let it", () => {
    // On the system's very edge, past where the bounds let it come in: as near as they allow.
    expect(panToShow(HOME, { x: 320, y: 0 }, { ...view, right: 150 }, bounds)).toEqual({ k: 1, x: -120, y: 0 });
    // With the whole map in view, unzoomed, it cannot pan at all.
    expect(panToShow(HOME, { x: 290, y: 0 }, view, extent)).toBe(HOME);
  });
});

describe("zoomBetween", () => {
  const from = { k: 1.5, x: 20, y: -40 };
  const to = { k: 6, x: -300, y: 120 };

  it("starts at one zoom and ends at the other", () => {
    expect(zoomBetween(from, to, 0)).toEqual(from);
    const end = zoomBetween(from, to, 1);
    expect(end.k).toBeCloseTo(to.k);
    expect(end.x).toBeCloseTo(to.x);
    expect(end.y).toBeCloseTo(to.y);
  });

  it("zooms in evenly: halfway is the middle of the two zooms by ratio", () => {
    expect(zoomBetween(from, to, 0.5).k).toBeCloseTo(3);
  });

  it("keeps whatever is drawn at the same spot at both ends at that spot all the way", () => {
    // The spot p with from.x + p * from.k === to.x + p * to.k.
    const p = (to.x - from.x) / (from.k - to.k);
    for (const e of [0.2, 0.5, 0.9]) {
      const z = zoomBetween(from, to, e);
      expect(z.x + p * z.k).toBeCloseTo(from.x + p * from.k);
    }
  });

  it("pans evenly at one zoom", () => {
    expect(zoomBetween({ k: 2, x: 0, y: 0 }, { k: 2, x: 100, y: -50 }, 0.25)).toEqual({ k: 2, x: 25, y: -12.5 });
  });
});

describe("wheelFactor", () => {
  const wheel = (deltaY: number, over: { deltaMode?: number; ctrlKey?: boolean } = {}) => wheelFactor({ deltaY, deltaMode: 0, ctrlKey: false, ...over });

  it("zooms in for scrolling up (or pinching out) and out for down, the same amount each way", () => {
    expect(wheel(-100)).toBeGreaterThan(1);
    expect(wheel(100)).toBeLessThan(1);
    expect(wheel(-100) * wheel(100)).toBeCloseTo(1);
  });

  it("zooms faster per pixel for a pinch (the wheel with control held) than for the wheel", () => {
    expect(wheel(-10, { ctrlKey: true })).toBeGreaterThan(wheel(-10));
  });

  it("counts a wheel that moves in lines as lines of pixels, and caps a fast flick", () => {
    expect(wheel(-3, { deltaMode: 1 })).toBeCloseTo(wheel(-48));
    expect(wheel(-2000)).toBe(wheel(-150));
  });
});

describe("chooseNamed", () => {
  const order = Array.from({ length: 400 }, (_, i) => i + 1);
  const everyone = () => true;

  it("names the closest `named`, every one, unzoomed, as ever", () => {
    expect(chooseNamed(order, 50, 1, everyone)).toEqual({ required: order.slice(0, 50), optional: [] });
  });

  it("names more as zooming opens room, the square of the zoom, the closest first, only where there is room beside them", () => {
    const { required, optional } = chooseNamed(order, 50, 2, everyone);
    expect(required).toEqual(order.slice(0, 50));
    expect(optional).toEqual(order.slice(50, 200));
    // However far in, never more than a few hundred at once.
    const far = chooseNamed(order, 50, MAX_ZOOM, everyone);
    expect(far.required.length + far.optional.length).toBe(300);
  });

  it("names every one of the closest `named` when that is more than a few hundred, zoomed in or not", () => {
    for (const k of [1, 2, MAX_ZOOM]) expect(chooseNamed(order, 400, k, everyone)).toEqual({ required: order, optional: [] });
  });

  it("with `room` (Show top names' All) names that many even unzoomed, past the first `named` only where there is room, however far in", () => {
    for (const k of [1, 2, MAX_ZOOM]) expect(chooseNamed(order, 200, k, everyone, new Set(), 400)).toEqual({ required: order.slice(0, 200), optional: order.slice(200) });
  });

  it("names only people in view, the closest of them first", () => {
    const inView = (id: number) => id % 4 === 0;
    const { required, optional } = chooseNamed(order, 50, 2, inView);
    expect(required).toEqual(order.slice(0, 50).filter(inView));
    expect(optional[0]).toBe(52);
    expect([...required, ...optional].every(inView)).toBe(true);
    expect(required.length + optional.length).toBe(100);
  });

  it("always names people to reach out to, wherever they rank, if in view", () => {
    const always = new Set([3, 120, 390, 391]);
    const inView = (id: number) => id !== 391;
    const unzoomed = chooseNamed(order, 50, 1, inView, always);
    expect(unzoomed.required).toEqual([...order.slice(0, 50), 120, 390]);
    expect(unzoomed.optional).toEqual([]);
    const zoomed = chooseNamed(order, 50, 2, inView, always);
    expect(zoomed.required).toEqual([...order.slice(0, 50), 120, 390]);
    expect(zoomed.optional).not.toContain(120);
  });
});

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
function person(id: number, messages: number): PersonRelationship {
  return {
    id, name: `Person ${id}`, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(messages), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(messages) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}
const crowd = buildModel({
  generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [],
  people: Array.from({ length: 160 }, (_, i) => person(i + 1, 400 - 2 * i)),
});

/** The map drawn at `zoom`, 800 by 600 under a 60-pixel header, so the sun sits at (400, 324) unzoomed. */
function draw(zoom: Zoom, model = crowd, held: number | null = null): string {
  keptZoom.current = zoom;
  return renderToStaticMarkup(createElement(OrbitMap, { model, width: 800, height: 600, inset: 60, hover: () => {}, open: () => {}, held }));
}
const sky = (markup: string) => markup.match(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)">/)!.slice(1).map(Number);
const radii = (markup: string, className: string) => [...markup.matchAll(new RegExp(`<circle[^>]*class="${className}"[^>]*>`, "g"))].map((m) => Number(m[0].match(/ r="([\d.]+)"/)![1]));
const ringRadii = (markup: string) => [...(markup.match(/<g class="orbits__rings">(.*?)<\/g>/)?.[1].matchAll(/<circle r="([\d.]+)"/g) ?? [])].map((m) => Number(m[1]));
const nameCount = (markup: string) => (markup.match(/class="orbits__name/g) ?? []).length;

describe("the map zoomed", () => {
  // There is no window here: one that asks for reduced motion draws everyone where they settle at once.
  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => void vi.unstubAllGlobals());
  afterEach(() => void (keptZoom.current = HOME));

  it("spreads the rings out from the sun, moved by the shift", () => {
    const home = draw(HOME);
    const zoomed = draw({ k: 2, x: 40, y: -30 });
    expect(sky(home)).toEqual([400, 324]);
    expect(sky(zoomed)).toEqual([440, 294]);
    ringRadii(zoomed).forEach((r, i) => expect(r).toBeCloseTo(ringRadii(home)[i] * 2));
  });

  it("keeps the sun its size, and grows the smaller markers only until their identicons can be read", () => {
    // With No name, so everyone is drawn as their icon, the closest too.
    resetSaved({ names: "hide" });
    const home = draw(HOME);
    const zoomed = draw({ k: 3, x: 0, y: 0 });
    expect(radii(zoomed, "orbits__sun")).toEqual(radii(home, "orbits__sun"));
    expect(Math.max(...radii(zoomed, "orbits__body"))).toBe(Math.max(...radii(home, "orbits__body")));
    const smallest = (markup: string) => Math.min(...radii(markup, "orbits__body"));
    expect(smallest(home)).toBeLessThan(READABLE);
    expect(smallest(zoomed)).toBeCloseTo(READABLE);
    // Zoomed far in on the crowd to the right, everyone well off the page is not drawn.
    const drawn = radii(draw({ k: 6, x: -1000, y: 0 }), "orbits__body").length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(radii(home, "orbits__body").length / 2);
  });

  it("names more people zoomed in than the hundred named unzoomed", () => {
    expect(nameCount(draw(HOME))).toBe(100);
    expect(nameCount(draw({ k: 1.5, x: 0, y: 0 }))).toBeGreaterThan(100);
  });

  it("draws each tier of names fainter than the one before, and whoever is picked out at full strength", () => {
    // Person n is the nth closest in the crowd.
    const strength = (markup: string) =>
      new Map([...markup.matchAll(/<text class="orbits__name[^"]*"[^>]* opacity="([\d.]+)"[^>]*>Person (\d+)</g)].map((m) => [Number(m[2]), Number(m[1])]));
    const home = strength(draw(HOME));
    expect([1, 10, 11, 25, 26, 50, 51, 100].map((n) => home.get(n))).toEqual([1, 1, 0.8, 0.8, 0.6, 0.6, 0.4, 0.4]);
    // Named only once zoomed in, beyond the hundred: at the 20% floor.
    const zoomed = strength(draw({ k: 1.5, x: 0, y: 0 }));
    expect([...zoomed].filter(([n]) => n > 100).length).toBeGreaterThan(0);
    for (const [n, opacity] of zoomed) if (n > 100) expect(opacity).toBe(0.2);
    // The 80th closest, picked out, is named at full strength.
    expect(strength(draw(HOME, crowd, 80)).get(80)).toBe(1);
  });

  it("draws everyone named as their name and everyone else as their identicon, each tier as strongly as the last", () => {
    const markup = draw(HOME);
    const markers = new Map([...markup.matchAll(/<circle[^>]*fill="url\(#orbits-face-(\d+)\)"[^>]* opacity="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]));
    const names = new Map([...markup.matchAll(/<text class="orbits__name[^"]*"[^>]* opacity="([\d.]+)"[^>]*>Person (\d+)</g)].map((m) => [Number(m[2]), Number(m[1])]));
    // The hundred named, each as their name alone; the sixty beyond them as their identicon.
    expect(names.size).toBe(100);
    expect(markers.size).toBe(60);
    for (const id of markers.keys()) expect(markup).toContain(`<pattern id="orbits-face-${id}"`);
    const strength = (n: number) => names.get(n) ?? markers.get(n);
    expect([1, 10, 11, 25, 26, 50, 51, 100, 101, 160].map(strength)).toEqual([1, 1, 0.8, 0.8, 0.6, 0.6, 0.4, 0.4, 0.2, 0.2]);
    // With the 150th closest picked out, they are at full strength, and everyone else at one flat BACKGROUND, names and identicons alike.
    const held = draw(HOME, crowd, 150);
    const heldMarkers = new Map([...held.matchAll(/<circle[^>]*fill="url\(#orbits-face-(\d+)\)"[^>]* opacity="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]));
    const heldNames = new Map([...held.matchAll(/<text class="orbits__name[^"]*"[^>]* opacity="([\d.]+)"[^>]*>Person (\d+)</g)].map((m) => [Number(m[2]), Number(m[1])]));
    expect(heldNames.get(150)).toBe(1);
    expect(heldMarkers.has(150)).toBe(false);
    for (const n of [1, 30, 100]) expect(heldNames.get(n)).toBe(BACKGROUND);
    for (const n of [101, 160]) expect(heldMarkers.get(n)).toBe(BACKGROUND);
  });

  it("writes each name in its person's own icon colour in place of their icon, picked out or not", () => {
    const seeds = ["0123456789abcdef", "fedcba9876543210", "00000000000000a1"];
    const three = buildModel({
      generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [],
      people: seeds.map((seed, i) => ({ ...person(i + 1, 30 - 10 * i), identiconSeed: seed })),
    });
    const fills = (markup: string) => new Map([...markup.matchAll(/<text class="orbits__name[^"]*"[^>]* style="fill:(#[0-9a-f]{6})"[^>]*>Person (\d+)</g)].map((m) => [Number(m[2]), m[1]]));
    const expected = new Map(seeds.map((seed, i) => [i + 1, glowColour(seed, null)]));
    expect(new Set(expected.values()).size).toBe(3);
    expect(fills(draw(HOME, three))).toEqual(expected);
    expect(fills(draw(HOME, three, 2))).toEqual(expected);
  });

  it("draws the closest hundred big enough to read their identicons, and the rest by how much you talked", () => {
    const markup = draw(HOME);
    const sizes = new Map([...markup.matchAll(/<circle[^>]* r="([\d.]+)"[^>]*fill="url\(#orbits-face-(\d+)\)"/g)].map((m) => [Number(m[2]), Number(m[1])]));
    for (const [n, r] of sizes) if (n <= 100) expect(r).toBeGreaterThanOrEqual(READABLE);
    expect(Math.min(...[...sizes].filter(([n]) => n > 100).map(([, r]) => r))).toBeLessThan(READABLE);
  });

  it("names the belt of people with no closeness yet only once zooming in opens room, as unzoomed nobody there is named", () => {
    const withBelt = buildModel({
      generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: [person(1, 30), person(2, 20), person(3, 0)],
    });
    expect(withBelt.people.find((p) => p.id === 3)!.rank.at(-1)).toBe(0);
    const names = (markup: string) => [...markup.matchAll(/class="orbits__name[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]).sort();
    expect(names(draw(HOME, withBelt))).toEqual(["Person 1", "Person 2"]);
    expect(names(draw({ k: 1.3, x: 0, y: 0 }, withBelt))).toEqual(["Person 1", "Person 2", "Person 3"]);
  });

  it("goes back to the whole map when the zoom it was left at would show nobody", () => {
    const few = buildModel({ generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: [person(1, 30), person(2, 20), person(3, 10)] });
    // As far in as it goes, at the system's bottom-right corner, where none of the three are.
    expect(sky(draw({ k: MAX_ZOOM, x: -1e6, y: -1e6 }, few))).toEqual([400, 324]);
    // A zoom with someone in view is kept.
    expect(sky(draw({ k: 1.5, x: 20, y: 0 }, few))).toEqual([420, 324]);
  });
});
