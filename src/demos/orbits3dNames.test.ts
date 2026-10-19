// Orbits 3D's names once the view tilts (orbits3dNames.ts, orbits3dGl.ts'
// depth): from straight above nothing moves into the scene; past a small
// tilt every name is in it; and the depth each sprite is given hides a name behind a
// nearer sphere, or the sun, and never behind a glow.

import { describe, expect, it } from "vitest";
import { TILT_MAX } from "./cityCamera.ts";
import { COLOUR_GLOW, depthsOf, HOLLOW, kindOf, NAME, passesOf, PHOTO, SPHERE, SUN_CORE, SUN_GLOW } from "./orbits3dGl.ts";
import { nameKey, NAMES_TILT_FROM, NAMES_TILT_TO, namesInScene } from "./orbits3dNames.ts";
import { HOME_VIEW, nearness } from "./orbits3dScene.ts";

const deg = (d: number) => (d * Math.PI) / 180;

describe("where the names are drawn", () => {
  it("is Orbits' flat overlay from straight above, and still through a nudge of the camera", () => {
    expect(namesInScene(HOME_VIEW)).toBe(0);
    expect(namesInScene({ bearing: deg(90), tilt: 0 })).toBe(0);
    expect(namesInScene({ bearing: 0, tilt: NAMES_TILT_FROM })).toBe(0);
    expect(namesInScene({ bearing: 0, tilt: NAMES_TILT_FROM / 2 })).toBe(0);
  });

  it("is the scene once tilted past the threshold, however far", () => {
    expect(namesInScene({ bearing: 0, tilt: NAMES_TILT_TO })).toBe(1);
    expect(namesInScene({ bearing: deg(-45), tilt: deg(30) })).toBe(1);
    expect(namesInScene({ bearing: 0, tilt: TILT_MAX })).toBe(1);
  });

  it("blends smoothly from one to the other over the threshold", () => {
    let last = 0;
    for (let t = NAMES_TILT_FROM; t <= NAMES_TILT_TO + 1e-9; t += (NAMES_TILT_TO - NAMES_TILT_FROM) / 40) {
      const share = namesInScene({ bearing: 0, tilt: t });
      expect(share).toBeGreaterThanOrEqual(last);
      expect(share - last).toBeLessThan(0.1);
      last = share;
    }
    expect(last).toBeCloseTo(1);
    const half = namesInScene({ bearing: 0, tilt: (NAMES_TILT_FROM + NAMES_TILT_TO) / 2 });
    expect(half).toBeCloseTo(0.5);
  });
});

describe("depth", () => {
  it("gives the nearest sprite the smallest depth, the furthest the largest, and equals the same", () => {
    const z = depthsOf([0, 50, -20, 50]);
    expect(z[2]).toBe(1);
    expect(z[1]).toBe(-1);
    expect(z[3]).toBe(-1);
    expect(z[0]).toBeGreaterThan(z[1]);
    expect(z[0]).toBeLessThan(z[2]);
  });

  it("is flat from straight above a flat plane, so nothing hides anything there", () => {
    const nears = [[100, 0], [-100, 0], [0, 100]].map(([x, y]) => nearness(HOME_VIEW, x, y, 0));
    expect(depthsOf(nears)).toEqual([0, 0, 0]);
    expect(depthsOf([])).toEqual([]);
  });

  it("hides a name behind a nearer sphere, and shows one in front of a further sphere", () => {
    const camera = { bearing: 0, tilt: deg(50) };
    // South of the sun is toward the viewer.
    const nearSphere = nearness(camera, 0, 100, 0);
    const farSphere = nearness(camera, 0, -100, 0);
    const nameOfFar = farSphere;
    const nameOfNear = nearSphere;
    const [zNear, zFar, zNameFar, zNameNear] = depthsOf([nearSphere, farSphere, nameOfFar, nameOfNear]);
    // The depth test passes a fragment whose depth is at most what is there (LEQUAL):
    const shows = (name: number, over: number) => name <= over;
    expect(shows(zNameFar, zNear)).toBe(false);
    expect(shows(zNameNear, zFar)).toBe(true);
    // A name is always drawn over its own sphere.
    expect(shows(zNameNear, zNear)).toBe(true);
    expect(shows(zNameFar, zFar)).toBe(true);
  });
});

describe("the passes", () => {
  it("let glows neither test nor write depth, solids and the sun's middle write it, and names only test it", () => {
    expect(kindOf(SUN_GLOW)).toBe("glow");
    expect(kindOf(COLOUR_GLOW)).toBe("glow");
    expect(kindOf(SPHERE)).toBe("solid");
    expect(kindOf(HOLLOW)).toBe("solid");
    expect(kindOf(PHOTO)).toBe("solid");
    expect(kindOf(SUN_CORE)).toBe("mask");
    expect(kindOf(NAME)).toBe("name");
  });

  it("keep the painting order, one draw call per run of a kind", () => {
    const modes = [SUN_GLOW, COLOUR_GLOW, SPHERE, HOLLOW, SUN_GLOW, SUN_CORE, SPHERE, SPHERE, NAME, NAME];
    expect(passesOf(modes)).toEqual([
      { start: 0, end: 2, kind: "glow" },
      { start: 2, end: 4, kind: "solid" },
      { start: 4, end: 5, kind: "glow" },
      { start: 5, end: 6, kind: "mask" },
      { start: 6, end: 8, kind: "solid" },
      { start: 8, end: 10, kind: "name" },
    ]);
    expect(passesOf([])).toEqual([]);
  });
});
