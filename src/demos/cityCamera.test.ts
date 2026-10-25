// The camera the City and Orbits 3D share (cityCamera.ts): where ground
// points are drawn as it turns and tilts, and the gestures that move it,
// within bounds (the City's further than Orbits 3D's).

import { describe, expect, it } from "vitest";
import {
  cameraBetween, clampCamera, project, squash, TILT_DEADZONE, TILT_MAX, TILT_MIN, TURN_PER_PX, turnCamera, TWIST_DEADZONE, twistCamera, wrapAngle, type Camera,
} from "./cityCamera.ts";
import { TILT_MOST } from "./cityScene.ts";

const deg = (d: number) => (d * Math.PI) / 180;
/** Leaned 60°, north up. */
const TILTED: Camera = { bearing: 0, tilt: Math.PI / 3 };

describe("the projection", () => {
  it("leaned 60°, squashes the ground to half its height and lifts heights up the screen", () => {
    expect(squash(TILTED)).toBeCloseTo(0.5);
    const p = project(TILTED, 10, 20);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(10);
    expect(project(TILTED, 10, 20, 5).y).toBeCloseTo(10 - 5 * Math.sin(Math.PI / 3));
  });

  it("turns the view round its middle: a bearing moves the east side toward the viewer", () => {
    const turned = { bearing: deg(90), tilt: TILTED.tilt };
    const east = project(turned, 100, 0);
    expect(east.x).toBeCloseTo(0);
    expect(east.y).toBeCloseTo(100 * squash(turned));
  });

  it("straight down, shows no height and no foreshortening", () => {
    const down = { bearing: 0, tilt: 0 };
    expect(project(down, 10, 20, 500)).toEqual(project(down, 10, 20));
    expect(project(down, 10, 20).y).toBeCloseTo(20);
  });
});

describe("moving the camera", () => {
  it("keeps the tilt between straight down and a low oblique, and the bearing on the circle", () => {
    expect(clampCamera({ bearing: 0, tilt: -1 }).tilt).toBe(TILT_MIN);
    expect(clampCamera({ bearing: 0, tilt: 3 }).tilt).toBe(TILT_MAX);
    expect(clampCamera({ bearing: 3 * Math.PI, tilt: 1 }).bearing).toBeCloseTo(Math.PI);
    expect(wrapAngle(deg(370))).toBeCloseTo(deg(10));
    expect(wrapAngle(deg(-190))).toBeCloseTo(deg(170));
    expect(TILT_MAX).toBeCloseTo(deg(70));
  });

  it("leans as far as a view allows: the City further than Orbits 3D", () => {
    expect(TILT_MOST).toBeGreaterThan(TILT_MAX);
    expect(clampCamera({ bearing: 0, tilt: 3 }, TILT_MOST).tilt).toBe(TILT_MOST);
    expect(turnCamera(TILTED, 0, -5000, TILT_MOST).tilt).toBe(TILT_MOST);
    expect(twistCamera(TILTED, [{ x: -50, y: 0 }, { x: 50, y: 0 }], [{ x: -50, y: -900 }, { x: 50, y: -900 }], TILT_MOST).tilt).toBe(TILT_MOST);
  });

  it("turns with a sideways drag and tilts with an up or down one, within bounds", () => {
    const turned = turnCamera(TILTED, 100, 0);
    expect(turned.tilt).toBe(TILTED.tilt);
    expect(turned.bearing).toBeCloseTo(-100 * TURN_PER_PX);
    // Dragging the near side of the view to the right moves it to the right.
    expect(project(turned, 0, 100).x).toBeGreaterThan(0);
    const leaned = turnCamera(TILTED, 0, -50);
    expect(leaned.tilt).toBeGreaterThan(TILTED.tilt);
    expect(turnCamera(TILTED, 0, -5000).tilt).toBe(TILT_MAX);
    expect(turnCamera(TILTED, 0, 5000).tilt).toBe(TILT_MIN);
  });

  it("turns with two fingers twisted and tilts with two dragged up or down, past a deadzone, and not with a pinch", () => {
    const start = [{ x: -50, y: 0 }, { x: 50, y: 0 }] as const;
    const pinched = twistCamera(TILTED, start, [{ x: -80, y: 0 }, { x: 80, y: 0 }]);
    expect(pinched).toEqual(TILTED);
    const twist = deg(30);
    const twisted = twistCamera(TILTED, start, [{ x: -50 * Math.cos(twist), y: -50 * Math.sin(twist) }, { x: 50 * Math.cos(twist), y: 50 * Math.sin(twist) }]);
    expect(twisted.bearing).toBeCloseTo(twist - TWIST_DEADZONE);
    expect(twisted.tilt).toBe(TILTED.tilt);
    const nudged = twistCamera(TILTED, start, [{ x: -50, y: TILT_DEADZONE / 2 }, { x: 50, y: TILT_DEADZONE / 2 }]);
    expect(nudged).toEqual(TILTED);
    const leaned = twistCamera(TILTED, start, [{ x: -50, y: -60 }, { x: 50, y: -60 }]);
    expect(leaned.tilt).toBeGreaterThan(TILTED.tilt);
    expect(leaned.bearing).toBe(0);
  });

  it("glides between two cameras the short way round, landing exactly", () => {
    const from = { bearing: deg(170), tilt: deg(20) };
    const to = { bearing: deg(-170), tilt: deg(60) };
    const half = cameraBetween(from, to, 0.5);
    expect(half.bearing).toBeCloseTo(Math.PI);
    expect(half.tilt).toBeCloseTo(deg(40));
    expect(cameraBetween(from, to, 1)).toEqual(clampCamera(to));
    expect(cameraBetween(from, TILTED, 1)).toEqual(TILTED);
  });
});
