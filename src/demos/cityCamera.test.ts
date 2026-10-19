// The City's camera (cityCamera.ts): where ground points are drawn as it
// turns and tilts, and back again; what is in front; a building's corners
// and faces as seen; how big a name fits on a roof; and the gestures that
// move it, within bounds.

import { describe, expect, it } from "vitest";
import {
  cameraBetween, cityExtent, clampCamera, depth, drawnBuilding, HOME_CAMERA, inPolygon, LINE_HEIGHT, paintOrder, project, roofLines, roofType, squash, TILT_DEADZONE,
  TILT_MAX, TILT_MIN, TURN_PER_PX, turnCamera, TWIST_DEADZONE, twistCamera, unproject, wrapAngle, type Camera,
} from "./cityCamera.ts";
import { layoutCity, type Resident } from "./cityLayout.ts";

const deg = (d: number) => (d * Math.PI) / 180;
const CAMERAS: Camera[] = [HOME_CAMERA, { bearing: deg(30), tilt: deg(45) }, { bearing: deg(-120), tilt: TILT_MAX }, { bearing: deg(200), tilt: TILT_MIN }];

describe("the projection", () => {
  it("as the city first appears, squashes the ground to half its height and lifts heights up the screen", () => {
    expect(squash(HOME_CAMERA)).toBeCloseTo(0.5);
    const p = project(HOME_CAMERA, 10, 20);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(10);
    expect(project(HOME_CAMERA, 10, 20, 5).y).toBeCloseTo(10 - 5 * Math.sin(Math.PI / 3));
  });

  it("finds the ground point under a drawn spot at every bearing and tilt", () => {
    for (const camera of CAMERAS) {
      for (const [x, y] of [[0, 0], [100, -40], [-33, 250], [7, 7]]) {
        const drawn = project(camera, x, y);
        const back = unproject(camera, drawn.x, drawn.y);
        expect(back.x, `${JSON.stringify(camera)} x`).toBeCloseTo(x, 6);
        expect(back.y, `${JSON.stringify(camera)} y`).toBeCloseTo(y, 6);
      }
    }
  });

  it("turns the city round the tower: a bearing moves the east side toward the viewer", () => {
    const turned = { bearing: deg(90), tilt: HOME_CAMERA.tilt };
    const east = project(turned, 100, 0);
    expect(east.x).toBeCloseTo(0);
    expect(east.y).toBeCloseTo(100 * squash(turned));
    expect(depth(turned, 100, 0)).toBeCloseTo(100);
    expect(depth(HOME_CAMERA, 0, 100)).toBeCloseTo(100);
    expect(depth(HOME_CAMERA, 0, -100)).toBeCloseTo(-100);
  });

  it("straight down, shows no height and no foreshortening", () => {
    const down = { bearing: 0, tilt: 0 };
    expect(project(down, 10, 20, 500)).toEqual(project(down, 10, 20));
    expect(project(down, 10, 20).y).toBeCloseTo(20);
  });
});

describe("a building as seen", () => {
  it("has its roof above its foot, the nearest corner at the bottom, and a hexagon round it at every angle", () => {
    for (const camera of CAMERAS) {
      const d = drawnBuilding(camera, 30, -20, 10, 25);
      expect(d.outline).toHaveLength(6);
      for (let i = 0; i < 4; i++) expect(d.roof[i].y).toBeLessThanOrEqual(d.foot[i].y + 1e-9);
      for (let i = 0; i < 4; i++) expect(d.foot[i].y).toBeLessThanOrEqual(d.foot[d.front].y + 1e-9);
      expect(d.foot[d.leftCorner].x).toBeLessThanOrEqual(d.foot[d.rightCorner].x);
      expect((d.front + 2) % 4).toBe(d.back);
      // Every corner is inside or on the silhouette; the box holds it all.
      for (const p of [...d.roof, ...d.foot]) {
        expect(p.x).toBeGreaterThanOrEqual(d.box.left - 1e-9);
        expect(p.x).toBeLessThanOrEqual(d.box.right + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(d.box.top - 1e-9);
        expect(p.y).toBeLessThanOrEqual(d.box.bottom + 1e-9);
      }
      if (camera.tilt > 0) {
        const centre = project(camera, 30, -20, 12);
        expect(inPolygon(centre, d.outline)).toBe(true);
        expect(inPolygon({ x: d.box.right + 5, y: centre.y }, d.outline)).toBe(false);
      }
    }
  });

  it("as the city first appears, is the hexagon it always was", () => {
    const d = drawnBuilding(HOME_CAMERA, 0, 0, 10, 30);
    const h = 30 * Math.sin(Math.PI / 3);
    expect(d.roof[0].x).toBeCloseTo(0);
    expect(d.roof[0].y).toBeCloseTo(-5 - h);
    expect(d.foot[2].y).toBeCloseTo(5);
    expect(d.foot[1].x).toBeCloseTo(10);
    expect(d.front).toBe(2);
    expect(d.leftCorner).toBe(3);
    expect(d.rightCorner).toBe(1);
  });
});

describe("what is in front", () => {
  it("draws the nearer of two buildings later whichever way the city is turned", () => {
    const plots = [
      { id: 1, x: 0, y: 100, r: 100, angle: 0, orbit: 100, s: 5, h: 10, rank: 1, silent: false },
      { id: 2, x: 0, y: -100, r: 100, angle: 0, orbit: 100, s: 5, h: 10, rank: 2, silent: false },
      { id: 3, x: 100, y: 0, r: 100, angle: 0, orbit: 100, s: 5, h: 10, rank: 3, silent: false },
    ];
    expect(paintOrder(plots, HOME_CAMERA).map((p) => p.id)).toEqual([2, 3, 1]);
    // Turned a half circle, the far side is near.
    expect(paintOrder(plots, { bearing: Math.PI, tilt: 1 }).map((p) => p.id)).toEqual([1, 3, 2]);
    // Turned a quarter, east is nearest.
    expect(paintOrder(plots, { bearing: deg(90), tilt: 1 }).map((p) => p.id).at(-1)).toBe(3);
  });

  it("reaches round the whole city, turned or not", () => {
    const people: Resident[] = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, name: `Person ${i}`, rank: i + 1, closeness: 100 / (i + 1), total: 10 + i, together: false }));
    const city = layoutCity(people, { inner: 60, outer: 400 });
    for (const camera of CAMERAS) {
      const extent = cityExtent(city, camera);
      expect(extent.left).toBeLessThan(-400);
      expect(extent.right).toBe(-extent.left);
      expect(extent.top).toBeLessThan(-city.tower.h * Math.sin(camera.tilt) - 20);
      expect(extent.bottom).toBeGreaterThan(400 * squash(camera));
      // Every building drawn is inside it.
      for (const plot of city.plots.values()) {
        const d = drawnBuilding(camera, plot.x, plot.y, plot.s, plot.h);
        expect(d.box.left).toBeGreaterThanOrEqual(extent.left);
        expect(d.box.right).toBeLessThanOrEqual(extent.right);
        expect(d.box.top).toBeGreaterThanOrEqual(extent.top);
        expect(d.box.bottom).toBeLessThanOrEqual(extent.bottom);
      }
    }
  });
});

describe("a name on a roof", () => {
  it("fits inside the roof's square: a long name best across a diamond, a short one best on a square", () => {
    const wide = 5; // a name five times as wide as tall
    const diamond = roofType(10, 0, wide);
    const square = roofType(10, deg(45), wide);
    expect(diamond).toBeGreaterThan(square);
    // The line's corners stay inside the roof: on the diamond, |x| + |y| ≤ s.
    expect((wide * diamond) / 2 + diamond / 2).toBeLessThanOrEqual(10);
    // Square on: the line is as wide as the square's side at most.
    expect(wide * square).toBeLessThanOrEqual(10 * Math.SQRT2 + 1e-9);
    // A short name (as wide as tall) has more room on the square.
    expect(roofType(10, deg(45), 1)).toBeGreaterThan(roofType(10, 0, 1));
    expect(roofType(10, deg(45), 1)).toBeLessThanOrEqual(10 * Math.SQRT2 + 1e-9);
    // The same every quarter turn, and bigger on a bigger roof.
    expect(roofType(10, deg(90), wide)).toBeCloseTo(diamond);
    expect(roofType(10, deg(135), wide)).toBeCloseTo(square);
    expect(roofType(20, 0, wide)).toBeCloseTo(2 * diamond);
  });

  it("fits a long name bigger on two lines than on one, the block still inside the roof", () => {
    const one = roofLines(10, 0, [8]);
    expect(one).toBeCloseTo(roofType(10, 0, 8 / LINE_HEIGHT) / LINE_HEIGHT);
    const two = roofLines(10, 0, [4.2, 3.7]);
    expect(two).toBeGreaterThan(one);
    // The block: two lines high, the longer line wide, with its corners inside the diamond (|x| + |y| ≤ s).
    expect((4.2 * two) / 2 + (2 * LINE_HEIGHT * two) / 2).toBeLessThanOrEqual(10);
    // A short name is bigger on one line.
    expect(roofLines(10, 0, [2])).toBeGreaterThan(roofLines(10, 0, [1, 1]));
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

  it("turns with a sideways drag and tilts with an up or down one, within bounds", () => {
    const turned = turnCamera(HOME_CAMERA, 100, 0);
    expect(turned.tilt).toBe(HOME_CAMERA.tilt);
    expect(turned.bearing).toBeCloseTo(-100 * TURN_PER_PX);
    // Dragging the near side of the city to the right moves it to the right.
    expect(project(turned, 0, 100).x).toBeGreaterThan(0);
    const leaned = turnCamera(HOME_CAMERA, 0, -50);
    expect(leaned.tilt).toBeGreaterThan(HOME_CAMERA.tilt);
    expect(turnCamera(HOME_CAMERA, 0, -5000).tilt).toBe(TILT_MAX);
    expect(turnCamera(HOME_CAMERA, 0, 5000).tilt).toBe(TILT_MIN);
  });

  it("turns with two fingers twisted and tilts with two dragged up or down, past a deadzone, and not with a pinch", () => {
    const start = [{ x: -50, y: 0 }, { x: 50, y: 0 }] as const;
    const pinched = twistCamera(HOME_CAMERA, start, [{ x: -80, y: 0 }, { x: 80, y: 0 }]);
    expect(pinched).toEqual(HOME_CAMERA);
    const twist = deg(30);
    const twisted = twistCamera(HOME_CAMERA, start, [{ x: -50 * Math.cos(twist), y: -50 * Math.sin(twist) }, { x: 50 * Math.cos(twist), y: 50 * Math.sin(twist) }]);
    expect(twisted.bearing).toBeCloseTo(twist - TWIST_DEADZONE);
    expect(twisted.tilt).toBe(HOME_CAMERA.tilt);
    const nudged = twistCamera(HOME_CAMERA, start, [{ x: -50, y: TILT_DEADZONE / 2 }, { x: 50, y: TILT_DEADZONE / 2 }]);
    expect(nudged).toEqual(HOME_CAMERA);
    const leaned = twistCamera(HOME_CAMERA, start, [{ x: -50, y: -60 }, { x: 50, y: -60 }]);
    expect(leaned.tilt).toBeGreaterThan(HOME_CAMERA.tilt);
    expect(leaned.bearing).toBe(0);
  });

  it("glides between two cameras the short way round, landing exactly", () => {
    const from = { bearing: deg(170), tilt: deg(20) };
    const to = { bearing: deg(-170), tilt: deg(60) };
    const half = cameraBetween(from, to, 0.5);
    expect(half.bearing).toBeCloseTo(Math.PI);
    expect(half.tilt).toBeCloseTo(deg(40));
    expect(cameraBetween(from, to, 1)).toEqual(clampCamera(to));
    expect(cameraBetween(from, HOME_CAMERA, 1)).toEqual(HOME_CAMERA);
  });
});
