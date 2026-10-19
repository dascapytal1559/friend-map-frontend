// Where the hover card goes (tipPlace in view.tsx): beside the pointer as it
// always was on a laptop, never past the window's edges on a phone, and above
// a finger held on someone, where the hand does not cover it. On the Spider web, one
// place for each person, beside their dot away from the spider, off its beam.

import { describe, expect, it } from "vitest";
import type { DemoPerson } from "./model.ts";
import { tipAt, tipPlace, type Tip } from "./view.tsx";

const someone = {} as DemoPerson;
const rows: Array<[string, string]> = [["Messages", "12"], ["Last spoke", "today"]];
// As the card is placed until it is drawn: 280 wide (250, its padding and border), 60 high and 22 a row.
const WIDE = 280;
const TALL = 104;
const laptop = { width: 1400, height: 900 };
const phone = { width: 390, height: 844 };

describe("the hover card's place", () => {
  it("sits beside the pointer, to its left near the right edge, as before", () => {
    expect(tipPlace(tipAt({ clientX: 500, clientY: 300 }, someone, rows), laptop)).toEqual({ left: 518, top: 314 });
    expect(tipPlace(tipAt({ clientX: 1300, clientY: 300 }, someone, rows), laptop)).toEqual({ left: 1300 - 18 - WIDE, top: 314 });
    expect(tipPlace(tipAt({ clientX: 500, clientY: 880 }, someone, rows), laptop).top).toBe(900 - TALL);
  });

  it("stays inside a window barely wider than itself", () => {
    for (const clientX of [20, 100, 200, 370]) {
      const { left } = tipPlace(tipAt({ clientX, clientY: 300 }, someone, rows), phone);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + WIDE).toBeLessThanOrEqual(390 - 8);
    }
  });

  it("goes above a finger, centred on it and inside the window, or below it with no room above", () => {
    const finger = (clientX: number, clientY: number) => tipAt({ clientX, clientY, pointerType: "touch" }, someone, rows);
    expect(finger(195, 500).touch).toBe(true);
    expect(tipPlace(finger(195, 500), phone)).toEqual({ left: 195 - WIDE / 2, top: 500 - 48 - TALL });
    expect(tipPlace(finger(380, 500), phone).left).toBe(390 - WIDE - 8);
    expect(tipPlace(finger(195, 120), phone).top).toBe(120 + 48);
  });

  it("goes by its size as drawn", () => {
    const drawn = { width: 300, height: 150 };
    expect(tipPlace(tipAt({ clientX: 1300, clientY: 880 }, someone, rows), laptop, drawn)).toEqual({ left: 1300 - 18 - 300, top: 900 - 150 });
  });

  it("is a pointer's card unless a finger shows it", () => {
    expect(tipAt({ clientX: 1, clientY: 1, pointerType: "mouse" }, someone, rows).touch).toBeUndefined();
  });
});

describe("the hover card on the Spider web, beside the dot and off the spider's beam", () => {
  const bounds = { width: 1440, height: 900 };
  const hub = { x: 720, y: 450 };
  const two: Array<[string, string]> = [["a", "1"], ["b", "2"]];
  const tall = TALL;
  const tip = (x: number, y: number, r = 10): Tip => ({ x, y, dot: { r, hub }, person: someone, rows: two });
  const box = (place: { left: number; top: number }, height = tall) => ({ ...place, right: place.left + WIDE, bottom: place.top + height });
  type Box = ReturnType<typeof box>;
  // How far a point is from the card (0 inside it).
  const from = (p: { x: number; y: number }, b: Box) =>
    Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom));
  // How close the beam, from the hub to the dot, comes to the card.
  const nearestBeam = (to: { x: number; y: number }, b: Box) =>
    Math.min(...Array.from({ length: 201 }, (_, i) => from({ x: hub.x + ((to.x - hub.x) * i) / 200, y: hub.y + ((to.y - hub.y) * i) / 200 }, b)));
  const insideWindow = (b: Box) => b.left >= 8 && b.top >= 8 && b.right <= bounds.width - 8 && b.bottom <= bounds.height - 8;

  it("sits 20 pixels beyond the dot's edge, straight out from the spider", () => {
    // Right of the spider: to the right of the dot, level with it.
    expect(tipPlace(tip(900, 450), bounds)).toEqual({ left: 900 + 10 + 20, top: 450 - tall / 2 });
    // Left of it: to the left.
    expect(tipPlace(tip(500, 450), bounds)).toEqual({ left: 500 - 10 - 20 - WIDE, top: 450 - tall / 2 });
    // Above it: above the dot, centred on it; below it: below.
    expect(tipPlace(tip(720, 200), bounds)).toEqual({ left: 720 - WIDE / 2, top: 200 - 10 - 20 - tall });
    expect(tipPlace(tip(720, 700), bounds)).toEqual({ left: 720 - WIDE / 2, top: 700 + 10 + 20 });
  });

  it("keeps 20 pixels from a bigger dot's edge too, and goes by the card's size as drawn", () => {
    expect(tipPlace(tip(720, 300, 14), bounds, { width: 300, height: 180 })).toEqual({ left: 720 - 150, top: 300 - 14 - 20 - 180 });
    // Left of the spider, a wider card still ends 20 pixels short of the dot.
    expect(tipPlace(tip(500, 450), bounds, { width: 300, height: 180 }).left + 300).toBe(500 - 10 - 20);
  });

  it("off at an angle, its nearest corner is 20 pixels from the dot's edge, beyond the dot from the spider", () => {
    for (const [x, y] of [[1000, 650], [450, 280], [900, 300], [560, 620]]) {
      const b = box(tipPlace(tip(x, y), bounds));
      expect(from({ x, y }, b)).toBeCloseTo(30, 6);
      expect(nearestBeam({ x, y }, b)).toBeGreaterThan(8);
      const centre = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 };
      expect(Math.hypot(centre.x - hub.x, centre.y - hub.y)).toBeGreaterThan(Math.hypot(x - hub.x, y - hub.y));
    }
  });

  it("has one place for each person, wherever the pointer is on them", () => {
    // The Spider web gives the dot's centre, not the pointer, so the same dot is always the same card.
    expect(tipPlace(tip(1000, 650), bounds)).toEqual(tipPlace(tip(1000, 650), bounds));
  });

  it("near an edge, turns round the dot to the nearest place inside the window, still off the dot and the beam", () => {
    // Straight out would leave the window past the right edge, the bottom, a corner, the top.
    for (const [x, y] of [[1400, 450], [720, 880], [1420, 880], [30, 20], [1100, 30]]) {
      const b = box(tipPlace(tip(x, y), bounds));
      expect(insideWindow(b)).toBe(true);
      expect(from({ x, y }, b)).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(nearestBeam({ x, y }, b)).toBeGreaterThanOrEqual(8);
    }
    // Against the right edge, level with the spider, it turns only as far as it must: still right of the dot's middle.
    const turned = box(tipPlace(tip(1300, 450), bounds));
    expect(turned.right).toBeGreaterThan(1300);
  });

  it("anywhere on the map, is inside the window and covers neither the dot nor the beam", () => {
    for (let x = 20; x < bounds.width; x += 70) {
      for (let y = 20; y < bounds.height; y += 70) {
        if (Math.hypot(x - hub.x, y - hub.y) < 40) continue;
        const b = box(tipPlace(tip(x, y), bounds));
        expect(insideWindow(b)).toBe(true);
        expect(from({ x, y }, b)).toBeGreaterThanOrEqual(30 - 1e-6);
        expect(nearestBeam({ x, y }, b)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("with nowhere that keeps off both, straight out and inside the window", () => {
    const tiny = { width: 320, height: 200 };
    const b = box(tipPlace({ ...tip(150, 100), dot: { r: 10, hub: { x: 100, y: 100 } } }, tiny));
    expect(b.left).toBeGreaterThanOrEqual(8);
    expect(b.right).toBeLessThanOrEqual(320 - 8 + 1e-9);
    expect(b.top).toBe(100 - tall / 2);
  });

  it("is placed as ever for a finger, whatever dot it was given", () => {
    const finger = tipPlace({ ...tip(720, 700), touch: true }, bounds);
    expect(finger).toEqual({ left: 720 - WIDE / 2, top: 700 - 48 - tall });
  });
});
