// Orbits 3D's tours (orbits3dTour.ts): the address picks one; each holds
// straight above (Orbits as it is) before it moves, leans to its angle and no
// further, moves smoothly with no jolt anywhere, and drifts on at its own
// speed once the lean is done.

import { describe, expect, it } from "vitest";
import { TILT_MAX, wrapAngle } from "./cityCamera.ts";
import { HOME_VIEW } from "./orbits3dScene.ts";
import { lean, tourAt, tourOf, TOURS, type Tour } from "./orbits3dTour.ts";

const FRAME = 1000 / 60;
const ALL = Object.entries(TOURS) as Array<[string, Tour]>;
/** Each tour's camera and zoom at every 60 fps frame from opening to 4 s after its lean. */
const framesOf = (tour: Tour) =>
  Array.from({ length: Math.ceil((tour.hold + Math.max(tour.move, tour.push) + 4000) / FRAME) }, (_, i) => tourAt(tour, i * FRAME));

describe("the address", () => {
  it("picks a tour by name, and none otherwise", () => {
    expect(tourOf("?tour=orbit")).toBe(TOURS.orbit);
    expect(tourOf("?names=full&tour=tilt")).toBe(TOURS.tilt);
    for (const search of ["", "?tour=", "?tour=spin", "?tour=toString", "?tour=__proto__"]) expect(tourOf(search)).toBeNull();
  });
});

describe("the lean's easing", () => {
  it("runs from rest at 0 to rest at 1, fastest early, with a long ease-out", () => {
    expect(lean(0)).toBe(0);
    expect(lean(1)).toBe(1);
    expect(lean(-1)).toBe(0);
    expect(lean(2)).toBe(1);
    const speed = (p: number) => (lean(p + 1e-6) - lean(p - 1e-6)) / 2e-6;
    expect(speed(1e-6)).toBeCloseTo(0, 4);
    expect(speed(1 - 1e-6)).toBeCloseTo(0, 4);
    expect(speed(1 / 3)).toBeGreaterThan(speed(0.25));
    expect(speed(1 / 3)).toBeGreaterThan(speed(0.45));
    // Most of the lean is done by halfway; the rest is the ease-out.
    expect(lean(0.5)).toBeCloseTo(0.6875, 9);
  });
});

describe("each tour", () => {
  for (const [name, tour] of ALL) {
    it(`${name}: holds straight above, unzoomed, until its hold is over`, () => {
      for (const t of [0, 500, tour.hold / 2, tour.hold]) expect(tourAt(tour, t)).toEqual({ camera: HOME_VIEW, k: 1 });
    });

    it(`${name}: leans to its angle and no further, and zooms to its zoom`, () => {
      const frames = framesOf(tour);
      for (const f of frames) {
        expect(f.camera.tilt).toBeLessThanOrEqual(tour.tilt + 1e-12);
        expect(f.k).toBeLessThanOrEqual(tour.zoom + 1e-12);
      }
      expect(tour.tilt).toBeLessThanOrEqual(TILT_MAX);
      const landed = tourAt(tour, tour.hold + Math.max(tour.move, tour.push));
      expect(landed.camera.tilt).toBeCloseTo(tour.tilt, 12);
      expect(landed.k).toBeCloseTo(tour.zoom, 12);
    });

    it(`${name}: moves without a jolt, its speed changing only a little from one frame to the next`, () => {
      const frames = framesOf(tour);
      const steps = frames.slice(1).map((f, i) => ({
        tilt: f.camera.tilt - frames[i].camera.tilt,
        turn: wrapAngle(f.camera.bearing - frames[i].camera.bearing),
        zoom: Math.log(f.k / frames[i].k),
      }));
      for (let i = 1; i < steps.length; i++) {
        expect(Math.abs(steps[i].tilt - steps[i - 1].tilt)).toBeLessThan(0.001);
        expect(Math.abs(steps[i].turn - steps[i - 1].turn)).toBeLessThan(0.001);
        expect(Math.abs(steps[i].zoom - steps[i - 1].zoom)).toBeLessThan(0.001);
      }
    });

    it(`${name}: once the lean is done, turns on at its drift and nothing else`, () => {
      const t = tour.hold + Math.max(tour.move, tour.push) + 1000;
      const [a, b] = [tourAt(tour, t), tourAt(tour, t + 1000)];
      expect(wrapAngle(b.camera.bearing - a.camera.bearing)).toBeCloseTo(tour.drift, 9);
      expect(b.camera.tilt).toBe(a.camera.tilt);
      expect(b.k).toBe(a.k);
    });
  }

  it("tilt leans straight down the view, without turning", () => {
    for (const f of framesOf(TOURS.tilt)) expect(f.camera.bearing).toBe(0);
  });
});
