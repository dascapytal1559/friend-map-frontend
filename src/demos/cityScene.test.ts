// The City in 3D (cityScene.ts) on made-up people: the camera's lens and the
// gestures that move it (a zoom keeps the spot under the pointer, a drag
// carries the ground with it, a glide lands where it aims), the stepped forms
// keeping what the layout says (footprint and height), what the pointer hits,
// the light's routes along the roads to the tower, which names show and none
// over another, and how hard the GPU is asked to work.

import { describe, expect, it } from "vitest";
import { layoutCity, offBoulevards, BOULEVARD_HALF, AVENUE_HALF, type Resident } from "./cityLayout.ts";
import {
  clampRig, declutter, driftSpeed, DRIFT, DRIFT_AFTER_MS, DRIFT_RAMP_MS, easeRig, eyeOf, floorAt, formOf, groundAt, HEIGHT_SCALE, hitForm, HOME_BEARING, HOME_TILT,
  homeDistance, homeRig, INNER, introRig, plazaRing, matricesOf, nameReadable, nearestFoot, nextScale, OUTER, panRig, pickAlong, project, qualityFor, rayAt, reachOf, rigBetween,
  rigShowing, rigsClose, routeOf, SCALE_LEAST, stretchOf, tierBoxes, TILT_MOST, TOWER_SCALE, towerForms, UPRIGHT_TILT, zoomRig, ZOOM_LEAST, ZOOM_MOST, type Rig, type Vec3, type View,
} from "./cityScene.ts";

/** A made-up crowd of `count` people ranked 1 to `count` by closeness, the first `together` of them living with you. */
function crowd(count: number, together = 0, silent = 0): Resident[] {
  return Array.from({ length: count }, (_, i) => {
    const rank = i < count - silent ? i + 1 : 0;
    return { id: i + 1, name: `Person ${String((i * 7919) % count).padStart(4, "0")}`, rank, closeness: rank === 0 ? 0 : 1000 / rank, total: 10 + (count - i) * 3, together: i < together };
  });
}

const VIEW: View = { width: 1440, height: 900, top: 76 };
const PHONE: View = { width: 390, height: 844, top: 120 };
const city = layoutCity(crowd(400, 2, 30), { inner: INNER, outer: OUTER });
const rig = (r: Partial<Rig> = {}): Rig => ({ ...homeRig(homeDistance(city, VIEW)), ...r });

describe("the lens", () => {
  it("puts the spot it looks at in the middle of the space under the header", () => {
    for (const view of [VIEW, PHONE]) {
      const r = { ...homeRig(homeDistance(city, view), view), x: 40, y: -25 };
      const s = project(r, view, [40, 0, -25]);
      expect(s.x).toBeCloseTo(view.width / 2, 6);
      expect(s.y).toBeCloseTo(view.top + (view.height - view.top) / 2, 6);
      expect(s.depth).toBeCloseTo(r.distance, 6);
    }
  });

  it("stands the camera south of what it looks at, as first seen, and turns it round as cityCamera's bearing does", () => {
    const home = rig();
    const eye = eyeOf(home);
    expect(eye[0]).toBeCloseTo(0, 6);
    expect(eye[2]).toBeGreaterThan(0);
    expect(eye[1] / home.distance).toBeCloseTo(Math.cos(HOME_TILT), 9);
    // Turned 90°, the east of the city comes toward the viewer, as the 2D City had it.
    const turned = eyeOf({ ...home, bearing: Math.PI / 2 });
    expect(turned[0]).toBeGreaterThan(0);
    expect(turned[2]).toBeCloseTo(0, 6);
    // Straight down, north is up the screen.
    const down = { ...home, tilt: 0 };
    expect(project(down, VIEW, [0, 0, -50]).y).toBeLessThan(project(down, VIEW, [0, 0, 50]).y);
    expect(project(down, VIEW, [50, 0, 0]).x).toBeGreaterThan(project(down, VIEW, [-50, 0, 0]).x);
  });

  it("finds the ground point under a spot on the screen, as drawn, at every turn and tilt", () => {
    for (const r of [rig(), rig({ bearing: 1.1, tilt: 0.3, x: 60, y: 90 }), rig({ bearing: -2.4, tilt: TILT_MOST * 0.95, distance: 300 })]) {
      for (const p of [[0, 0], [120, -40], [-60, 210]] as const) {
        const s = project(r, VIEW, [p[0], 0, p[1]]);
        if (s.depth <= 0) continue;
        const back = groundAt(r, VIEW, s.x, s.y);
        expect(back, JSON.stringify(r)).not.toBeNull();
        expect(back!.x).toBeCloseTo(p[0], 4);
        expect(back!.y).toBeCloseTo(p[1], 4);
      }
    }
    // Over the horizon there is no ground.
    expect(groundAt(rig({ tilt: TILT_MOST }), VIEW, 720, VIEW.top + 1)).toBeNull();
  });

  it("agrees with the matrices WebGL draws with", () => {
    const r = rig({ bearing: 0.7, tilt: 1.0, x: 30, y: -12, distance: 900 });
    const { view, projection } = matricesOf(r, VIEW);
    const p: Vec3 = [80, 25, 140];
    const v = [0, 1, 2, 3].map((row) => view[row] * p[0] + view[4 + row] * p[1] + view[8 + row] * p[2] + view[12 + row]);
    const c = [0, 1, 2, 3].map((row) => projection[row] * v[0] + projection[4 + row] * v[1] + projection[8 + row] * v[2] + projection[12 + row] * v[3]);
    const s = project(r, VIEW, p);
    expect(((c[0] / c[3] + 1) / 2) * VIEW.width).toBeCloseTo(s.x, 3);
    expect(((1 - c[1] / c[3]) / 2) * VIEW.height).toBeCloseTo(s.y, 3);
    expect(c[3]).toBeCloseTo(s.depth, 4);
  });

  it("first stands far enough back to show every avenue and the tower's top; upright, from higher up, the outermost may run off the sides", () => {
    for (const view of [VIEW, PHONE]) {
      const home = homeRig(homeDistance(city, view), view);
      expect(home.tilt).toBe(view === PHONE ? UPRIGHT_TILT : HOME_TILT);
      const radii = city.avenues.map((a) => a.r).sort((a, b) => a - b);
      for (const r of view === PHONE ? radii.slice(0, -1) : radii) {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * 2 * Math.PI;
          const s = project(home, view, [Math.cos(a) * r, 0, Math.sin(a) * r]);
          expect(s.x).toBeGreaterThan(0);
          expect(s.x).toBeLessThan(view.width);
          expect(s.y).toBeGreaterThan(view.top);
          expect(s.y).toBeLessThan(view.height);
        }
      }
      expect(project(home, view, [0, city.tower.h * TOWER_SCALE, 0]).y).toBeGreaterThan(view.top);
    }
  });
});

describe("moving the camera", () => {
  it("zooms about the ground under the pointer, which stays under it", () => {
    const r = rig({ bearing: 0.4 });
    for (const [px, py, factor] of [[300, 500, 2], [1100, 700, 0.6], [720, 300, 3.5]]) {
      const anchor = groundAt(r, VIEW, px, py)!;
      const zoomed = zoomRig(r, factor, anchor);
      const s = project(zoomed, VIEW, [anchor.x, 0, anchor.y]);
      expect(s.x).toBeCloseTo(px, 4);
      expect(s.y).toBeCloseTo(py, 4);
      expect(zoomed.distance).toBeCloseTo(r.distance / factor, 6);
    }
  });

  it("drags the ground: the point under the pointer as the drag began follows it", () => {
    const r = rig({ bearing: -0.8, tilt: 1.1 });
    const from = groundAt(r, VIEW, 500, 600)!;
    const to = groundAt(r, VIEW, 640, 520)!;
    const moved = panRig(r, from, to);
    const s = project(moved, VIEW, [from.x, 0, from.y]);
    expect(s.x).toBeCloseTo(640, 4);
    expect(s.y).toBeCloseTo(520, 4);
  });

  it("keeps the zoom, the spot and the tilt within bounds", () => {
    const home = homeDistance(city, VIEW);
    const reach = reachOf(city);
    expect(clampRig(rig({ distance: home * 100 }), home, reach).distance).toBeCloseTo(home / ZOOM_LEAST, 6);
    expect(clampRig(rig({ distance: 0.001 }), home, reach).distance).toBeCloseTo(home / ZOOM_MOST, 6);
    const far = clampRig(rig({ x: reach * 3, y: 0 }), home, reach);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(reach, 6);
    expect(clampRig(rig({ tilt: 2 }), home, reach).tilt).toBe(TILT_MOST);
    expect(clampRig(rig({ tilt: -1 }), home, reach).tilt).toBe(0);
  });

  it("glides the short way round, at an even pace in the zoom, and lands exactly", () => {
    const a = rig({ bearing: 3, distance: 100 });
    const b = rig({ bearing: -3, distance: 400 });
    const mid = rigBetween(a, b, 0.5);
    expect(Math.abs(mid.bearing)).toBeGreaterThan(3);
    expect(mid.distance).toBeCloseTo(200, 6);
    expect(rigBetween(a, b, 1)).toBe(b);
  });

  it("follows its goal smoothly, arriving and staying there; at once with no easing", () => {
    const goal = rig({ x: 200, distance: 500 });
    let shown = rig();
    const gaps: number[] = [];
    for (let i = 0; i < 120; i++) {
      shown = easeRig(shown, goal, 1 / 60, 0.085);
      gaps.push(Math.hypot(shown.x - goal.x, shown.y - goal.y));
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1]);
    expect(shown).toBe(goal);
    expect(easeRig(rig(), goal, 1 / 60, 0)).toBe(goal);
    expect(rigsClose(goal, { ...goal, bearing: goal.bearing + 2 * Math.PI })).toBe(true);
  });

  it("drifts round the city only once left alone, coming up to speed gently", () => {
    expect(driftSpeed(0)).toBe(0);
    expect(driftSpeed(DRIFT_AFTER_MS)).toBe(0);
    expect(driftSpeed(DRIFT_AFTER_MS + DRIFT_RAMP_MS / 2)).toBeCloseTo(DRIFT / 2, 9);
    expect(driftSpeed(DRIFT_AFTER_MS + DRIFT_RAMP_MS * 3)).toBe(DRIFT);
    // Slow enough to read by: no faster than once round in four minutes.
    expect(DRIFT).toBeLessThanOrEqual((2 * Math.PI) / 240);
  });

  it("opens with a push in from further out and lower, ending as first seen", () => {
    const home = rig();
    const from = introRig(home);
    expect(from.distance).toBeGreaterThan(home.distance);
    expect(from.tilt).toBeGreaterThan(home.tilt);
    expect(rigBetween(from, home, 1)).toBe(home);
    expect(home.bearing).toBe(HOME_BEARING);
  });

  it("brings someone found into view, leaving the camera be when they are already in view and close enough", () => {
    const plot = [...city.plots.values()].find((p) => p.rank === 120)!;
    const at: Vec3 = [plot.x, 5, plot.y];
    const shown = rigShowing(rig(), VIEW, at, 200, 60);
    expect(shown.x).toBe(plot.x);
    expect(shown.y).toBe(plot.y);
    expect(shown.distance).toBe(200);
    expect(rigShowing(shown, VIEW, at, 200, 60)).toBe(shown);
  });
});

describe("the buildings as built", () => {
  it("keep what the layout says: the base is the footprint, the top the height, stepping in as they rise", () => {
    for (const plot of city.plots.values()) {
      const form = formOf(plot);
      const tiers = tierBoxes(form);
      expect(tiers[0].half * Math.SQRT2).toBeCloseTo(plot.s, 9);
      expect(tiers[0].bottom).toBe(0);
      expect(tiers[tiers.length - 1].top).toBeCloseTo(plot.h * HEIGHT_SCALE, 9);
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].half).toBeLessThan(tiers[i - 1].half);
        expect(tiers[i].bottom).toBeCloseTo(tiers[i - 1].top, 9);
      }
    }
  });

  it("are taller the closer, as the layout's heights are", () => {
    const plots = [...city.plots.values()].filter((p) => !p.silent).sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < plots.length; i++) expect(formOf(plots[i]).h).toBeLessThanOrEqual(formOf(plots[i - 1]).h + 1e-9);
  });

  it("stand your tower over all of them, its podium inside the plaza and its faces square to the boulevards", () => {
    const { podium, shaft } = towerForms(city);
    const tallest = Math.max(...[...city.plots.values()].map((p) => formOf(p).h));
    expect(shaft.h).toBeGreaterThan(tallest * 1.5);
    expect(podium.half * Math.SQRT2).toBeLessThanOrEqual(plazaRing());
    expect(shaft.facing).toBe(0);
    for (const plot of city.plots.values()) expect(Math.hypot(plot.x, plot.y) - plot.s).toBeGreaterThan(podium.half);
  });

  it("finds whose floor of the tower a height is on", () => {
    const [lower, upper] = city.tower.floors;
    expect(floorAt(city, ((lower.bottom + lower.top) / 2) * TOWER_SCALE)).toBe(lower.id);
    expect(floorAt(city, ((upper.bottom + upper.top) / 2) * TOWER_SCALE)).toBe(upper.id);
    expect(floorAt(city, city.tower.h * TOWER_SCALE * 0.99)).toBeNull();
  });
});

describe("what the pointer is on", () => {
  it("hits a building where the ray meets one of its tiers, and misses beside its narrower top", () => {
    const plot = [...city.plots.values()].find((p) => formOf(p).scales.length === 3)!;
    const form = formOf(plot);
    const down = (x: number, z: number) => ({ origin: [x, 1000, z] as Vec3, dir: [0, -1, 0] as Vec3 });
    expect(hitForm(down(form.x, form.z), form)).toBeCloseTo(1000 - form.h, 6);
    // Just inside the base's corner, beside the top: the ray meets the base's roof.
    const [c, s] = [Math.cos(form.facing), Math.sin(form.facing)];
    const corner = form.half * 0.95;
    const hit = hitForm(down(form.x + (corner * c - corner * s), form.z + (corner * s + corner * c)), form);
    expect(hit).toBeCloseTo(1000 - tierBoxes(form)[0].top, 6);
    expect(hitForm(down(form.x + form.half * 2, form.z), form)).toBeNull();
    // Not yet risen, it is no taller than it has risen.
    expect(hitForm(down(form.x, form.z), form, 0.5)).toBeCloseTo(1000 - form.h * 0.5, 6);
  });

  it("picks the building in front where two are in line, and the one under the pointer from the camera", () => {
    const r = rig({ bearing: 0.3, tilt: 1.05, distance: 700 });
    const forms = [...city.plots.values()].map(formOf);
    for (const form of forms.filter((_, i) => i % 37 === 0)) {
      const s = project(r, VIEW, [form.x, form.h * 0.5, form.z]);
      const hit = pickAlong(rayAt(r, VIEW, s.x, s.y), forms);
      expect(hit).not.toBeNull();
      // Whatever it picks is no further from the camera than the building aimed at.
      const aimed = hitForm(rayAt(r, VIEW, s.x, s.y), form)!;
      const eye = eyeOf(r);
      expect(Math.hypot(hit!.at[0] - eye[0], hit!.at[1] - eye[1], hit!.at[2] - eye[2])).toBeLessThanOrEqual(aimed + 1e-6);
    }
  });

  it("catches a small building near the pointer by its foot", () => {
    const r = rig();
    const forms = [...city.plots.values()].map(formOf);
    const small = forms.reduce((a, b) => (b.half < a.half ? b : a));
    const foot = project(r, VIEW, [small.x, 0, small.z]);
    expect(nearestFoot(r, VIEW, [small], foot.x + 6, foot.y - 4, 12)).toBe(small.id);
    expect(nearestFoot(r, VIEW, [small], foot.x + 60, foot.y, 12)).toBeNull();
  });
});

describe("the light on the roads", () => {
  it("runs from the building in to its ring road, round to a boulevard, and down it to the tower, never across a building's plot", () => {
    for (const plot of [...city.plots.values()].filter((_, i) => i % 23 === 0)) {
      const route = routeOf(plot, city, 0.5);
      const first = route.points[0];
      const last = route.points[route.points.length - 1];
      expect(Math.hypot(first.x - plot.x, first.y - plot.y)).toBeLessThanOrEqual(plot.s + 1e-6);
      expect(Math.hypot(last.x, last.y)).toBeLessThan(city.tower.s + 8);
      // The last stretch runs on a boulevard, the arc on a ring road or the plaza's.
      expect(offBoulevards(last.x, last.y)).toBeLessThan(BOULEVARD_HALF);
      const ring = Math.hypot(route.points[2].x, route.points[2].y);
      const rings = [plazaRing(), ...city.avenues.map((a) => a.r)];
      expect(Math.min(...rings.map((r) => Math.abs(r - ring)))).toBeLessThan(AVENUE_HALF);
      let length = 0;
      for (let i = 1; i < route.points.length; i++) length += Math.hypot(route.points[i].x - route.points[i - 1].x, route.points[i].y - route.points[i - 1].y);
      expect(route.length).toBeCloseTo(length, 6);
    }
  });

  it("cuts a stretch of a route, the light's tail, as long as asked", () => {
    const route = routeOf([...city.plots.values()][50], city, 0.2);
    const piece = stretchOf(route, 20, 60);
    let length = 0;
    for (let i = 1; i < piece.length; i++) length += Math.hypot(piece[i].x - piece[i - 1].x, piece[i].y - piece[i - 1].y);
    expect(length).toBeCloseTo(40, 6);
    expect(stretchOf(route, -30, -1)).toEqual([]);
    expect(stretchOf(route, route.length + 1, route.length + 40)).toEqual([]);
  });
});

describe("names", () => {
  it("show once the building is big enough on the screen beside the name, fading in, never flickering on or off at a step", () => {
    expect(nameReadable(5, 80)).toBe(0);
    expect(nameReadable(40, 80)).toBe(1);
    let last = 0;
    for (let px = 0; px <= 60; px += 0.5) {
      const v = nameReadable(px, 80);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v - last).toBeLessThan(0.08);
      last = v;
    }
  });

  it("never overlap: the first asked keeps its place, and one that would meet it is left out", () => {
    const kept = declutter([
      { x: 100, y: 100, wide: 30, tall: 8 },
      { x: 120, y: 105, wide: 30, tall: 8 },
      { x: 100, y: 130, wide: 30, tall: 8 },
      { x: 200, y: 100, wide: 30, tall: 8 },
    ]);
    expect(kept).toEqual([true, false, true, true]);
  });
});

describe("how hard the GPU works", () => {
  it("draws fewer pixels, a smaller reflection, less bloom and fewer steps through the mist on a phone", () => {
    const phone = qualityFor(true, 3);
    const computer = qualityFor(false, 2);
    expect(phone.pixelRatio).toBeLessThan(computer.pixelRatio);
    expect(phone.reflection).toBeLessThan(computer.reflection);
    expect(phone.bloomLevels).toBeLessThan(computer.bloomLevels);
    expect(phone.mistSteps).toBeLessThan(computer.mistSteps);
    expect(qualityFor(false, 1).pixelRatio).toBe(1);
  });

  it("lowers the pixels where frames run slow and raises them again when there is room, within bounds", () => {
    expect(nextScale(1, 30)).toBeLessThan(1);
    expect(nextScale(SCALE_LEAST, 40)).toBe(SCALE_LEAST);
    expect(nextScale(0.7, 6)).toBeGreaterThan(0.7);
    expect(nextScale(1, 6)).toBe(1);
    expect(nextScale(0.8, 14)).toBe(0.8);
  });
});
