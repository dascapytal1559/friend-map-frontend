// Orbits 3D's scene (orbits3dScene.ts): from straight above it is Orbits to
// the pixel, whatever anyone's height; the heights come from each person's
// seed and lean their orbit; the painting order, the extent, the light and
// the camera's bounds and reset behave.

import { describe, expect, it } from "vitest";
import { cameraBetween, clampCamera, TILT_MAX, TILT_MIN, turnCamera, type Camera } from "./cityCamera.ts";
import { drawnAt, heightOf, HOME_VIEW, INCLINE_MAX, inclinationOf, lightOn, nearness, paintOrder, ringAxes, sceneExtent, shadeAt } from "./orbits3dScene.ts";

const deg = (d: number) => (d * Math.PI) / 180;
const SEEDS = ["5a17c3e0b29d4f81", "0000000000000000", "ffffffffffffffff", "9b3e2a7c1d4f8e60", "13579bdf2468ace0"];
const CAMERAS: Camera[] = [HOME_VIEW, { bearing: deg(30), tilt: deg(45) }, { bearing: deg(-120), tilt: TILT_MAX }, { bearing: deg(200), tilt: TILT_MIN }];

describe("from straight above", () => {
  it("draws everyone exactly where Orbits does, at every zoom, whatever their height", () => {
    for (const k of [1, 2.5, 12]) {
      for (const [x, y, h] of [[100, -40, 30], [-33, 250, -80], [7, 7, 0], [0, -300, 55]]) {
        const p = drawnAt(HOME_VIEW, x, y, h, k);
        expect(p.x).toBeCloseTo(x * k, 9);
        expect(p.y).toBeCloseTo(y * k, 9);
      }
    }
  });

  it("shows no shading, and the rings are circles", () => {
    expect(shadeAt(HOME_VIEW)).toBe(0);
    expect(ringAxes(HOME_VIEW, 120)).toEqual({ rx: 120, ry: 120 });
  });

  it("paints in Orbits' own order when everyone is equally near", () => {
    const bodies = [{ id: 3, h: 0 }, { id: 1, h: 0 }, { id: 2, h: 0 }];
    expect(paintOrder(bodies, (b) => nearness(HOME_VIEW, 10, 10, b.h)).map((b) => b.id)).toEqual([3, 1, 2]);
  });

  it("reaches exactly the disc everyone is on", () => {
    expect(sceneExtent(300, 60, -40, HOME_VIEW)).toEqual({ left: -300, right: 300, top: -300, bottom: 300 });
  });
});

describe("heights", () => {
  it("come from the seed alone, the same every time, within the steepest lean", () => {
    for (const seed of SEEDS) {
      const a = inclinationOf(seed);
      expect(inclinationOf(seed)).toEqual(a);
      expect(Math.abs(a.slope)).toBeLessThanOrEqual(Math.sin(INCLINE_MAX) + 1e-12);
      expect(Math.abs(a.slope)).toBeGreaterThan(0);
      expect(a.node).toBeGreaterThanOrEqual(0);
      expect(a.node).toBeLessThan(2 * Math.PI);
    }
    expect(inclinationOf(SEEDS[0])).not.toEqual(inclinationOf(SEEDS[3]));
  });

  it("lean each orbit out of the plane: highest a quarter turn past the node, flat at the node, growing with the radius", () => {
    const incline = { slope: 0.2, node: deg(40) };
    expect(heightOf({ angle: deg(40), r: 100, silent: false }, incline, false)).toBeCloseTo(0);
    expect(heightOf({ angle: deg(130), r: 100, silent: false }, incline, false)).toBeCloseTo(20);
    expect(heightOf({ angle: deg(130), r: 300, silent: false }, incline, false)).toBeCloseTo(60);
    expect(heightOf({ angle: deg(310), r: 100, silent: false }, incline, false)).toBeCloseTo(-20);
  });

  it("keep the belt and whoever sits in the sun in the plane", () => {
    const incline = { slope: 0.2, node: 0 };
    expect(heightOf({ angle: deg(90), r: 300, silent: true }, incline, false)).toBe(0);
    expect(heightOf({ angle: deg(90), r: 20, silent: false }, incline, true)).toBe(0);
  });
});

describe("tilted", () => {
  it("lifts a height up the screen and brings the near side forward", () => {
    const camera = { bearing: 0, tilt: deg(60) };
    const flat = drawnAt(camera, 0, 100, 0, 1);
    const high = drawnAt(camera, 0, 100, 50, 1);
    expect(high.x).toBeCloseTo(flat.x);
    expect(high.y).toBeLessThan(flat.y);
    expect(nearness(camera, 0, 100, 0)).toBeGreaterThan(nearness(camera, 0, -100, 0));
    expect(nearness(camera, 0, 0, 50)).toBeGreaterThan(nearness(camera, 0, 0, 0));
  });

  it("paints the far side first, the near side last", () => {
    const camera = { bearing: deg(90), tilt: deg(50) };
    const bodies = [{ x: 100, y: 0 }, { x: -100, y: 0 }, { x: 0, y: 100 }];
    const order = paintOrder(bodies, (b) => nearness(camera, b.x, b.y, 0));
    // Turned 90°, the east side comes toward the viewer.
    expect(order[0]).toEqual({ x: -100, y: 0 });
    expect(order[2]).toEqual({ x: 100, y: 0 });
  });

  it("squashes the rings into ellipses and keeps the leaning bodies within the extent", () => {
    const camera = { bearing: deg(20), tilt: deg(60) };
    const { rx, ry } = ringAxes(camera, 200);
    expect(rx).toBe(200);
    expect(ry).toBeCloseTo(100);
    const extent = sceneExtent(300, 60, -40, camera);
    for (let a = 0; a < 2 * Math.PI; a += 0.1) {
      for (const h of [60, -40, 0]) {
        const p = drawnAt(camera, Math.cos(a) * 300, Math.sin(a) * 300, h, 1);
        expect(p.x).toBeGreaterThanOrEqual(extent.left - 1e-9);
        expect(p.x).toBeLessThanOrEqual(extent.right + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(extent.top - 1e-9);
        expect(p.y).toBeLessThanOrEqual(extent.bottom + 1e-9);
      }
    }
  });

  it("shades fully once leaned past SHADE_TILT, and smoothly on the way", () => {
    expect(shadeAt({ bearing: 0, tilt: deg(25) })).toBe(1);
    expect(shadeAt({ bearing: 0, tilt: TILT_MAX })).toBe(1);
    const half = shadeAt({ bearing: 0, tilt: deg(12.5) });
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    let last = 0;
    for (let t = 0; t <= 25; t += 0.5) {
      const s = shadeAt({ bearing: 0, tilt: deg(t) });
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });
});

describe("the light", () => {
  it("is a unit vector toward the sun: from the east, a body west of it is lit from its right", () => {
    for (const camera of CAMERAS) {
      const l = lightOn(camera, -100, 0, 0);
      expect(Math.hypot(...l)).toBeCloseTo(1);
    }
    const [lx, ly, lz] = lightOn(HOME_VIEW, -100, 0, 0);
    expect(lx).toBeCloseTo(1);
    expect(ly).toBeCloseTo(0);
    expect(lz).toBeCloseTo(0);
  });

  it("comes from behind a body on the near side of the sun once the view leans", () => {
    const camera = { bearing: 0, tilt: deg(60) };
    // South of the sun is toward the viewer: the sun is beyond, so the light comes from into the screen.
    expect(lightOn(camera, 0, 100, 0)[2]).toBeLessThan(0);
    expect(lightOn(camera, 0, -100, 0)[2]).toBeGreaterThan(0);
  });
});

describe("the camera", () => {
  it("starts straight down and north up, and stays within the City's bounds", () => {
    expect(HOME_VIEW).toEqual({ bearing: 0, tilt: 0 });
    expect(clampCamera({ bearing: 0, tilt: -0.5 }).tilt).toBe(TILT_MIN);
    expect(clampCamera({ bearing: 0, tilt: 3 }).tilt).toBe(TILT_MAX);
    expect(turnCamera(HOME_VIEW, 0, 100).tilt).toBe(TILT_MIN);
    expect(turnCamera(HOME_VIEW, 0, -100000).tilt).toBe(TILT_MAX);
  });

  it("glides back home exactly, the short way round", () => {
    const from = { bearing: deg(170), tilt: deg(55) };
    expect(cameraBetween(from, HOME_VIEW, 1)).toEqual(HOME_VIEW);
    const half = cameraBetween(from, HOME_VIEW, 0.5);
    expect(half.tilt).toBeCloseTo(deg(27.5));
    expect(half.bearing).toBeCloseTo(deg(85));
    const other = cameraBetween({ bearing: deg(-170), tilt: 0 }, HOME_VIEW, 0.5);
    expect(other.bearing).toBeCloseTo(deg(-85));
  });
});
