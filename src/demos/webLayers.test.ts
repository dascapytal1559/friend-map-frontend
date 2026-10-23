// Which of the Spider web's two canvases (webLook.ts) each beam goes on, and where it
// comes from and whom the spider faces: the hold on whoever is selected, from
// the mouth, and the beam to whoever is hovered, from the eyes, on the one
// over the SVG, above everyone's icons, the hold over the beam. While someone
// is held, the hold is the only line: hovering anyone else fires no beam and
// turns nothing. The square reticle goes with the hover, never on whoever is
// held. The spider
// starts facing the way it was given, from its first frame through the boot.
// The web draws its rank rings as regular polygons at the rank
// radii, even with the web's strength at nothing, clear of their labels.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Frame } from "./orbitsSky.ts";
import { BOOT_MS, SCAN } from "./webChoreography.ts";
import { drawWeb, drawWebOver, labelBoxes, LOCK_FLASH_MS, newLookState, startHeading, UP, type WebScene } from "./webLook.ts";
import { MARK_TIMING } from "./webHold.ts";
import { ringTop, strandSag, webShape } from "./webGeometry.ts";
import { wrapAngle } from "./webRig.ts";

type XY = { x: number; y: number };

// Path2D and a canvas that keep only what is stroked: each stroked path's points.
class FakePath {
  points: XY[] = [];
  moveTo(x: number, y: number) { this.points.push({ x, y }); }
  lineTo(x: number, y: number) { this.points.push({ x, y }); }
  quadraticCurveTo(_cx: number, _cy: number, x: number, y: number) { this.points.push({ x, y }); }
  bezierCurveTo(_a: number, _b: number, _c: number, _d: number, x: number, y: number) { this.points.push({ x, y }); }
  arc() {}
  ellipse() {}
  rect() {}
  closePath() {}
}

function fakeCanvas() {
  const strokes: XY[][] = [];
  // Every image drawn (a halo is one): its centre and width.
  const images: Array<XY & { w: number }> = [];
  const thing: object = new Proxy(() => thing, { get: (_t, key) => (key === "then" ? undefined : thing), apply: () => thing });
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key === "stroke") return (path?: FakePath) => void (path && strokes.push(path.points));
      if (key === "drawImage") return (_image: unknown, x: number, y: number, w: number, h: number) => void images.push({ x: x + w / 2, y: y + h / 2, w });
      if (key in target) return target[key];
      return () => thing;
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes, images };
}

// The drawing's patterns are painted once on a canvas of their own.
beforeAll(() => {
  vi.stubGlobal("Path2D", FakePath);
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => fakeCanvas().ctx }) });
});
afterAll(() => vi.unstubAllGlobals());

// Two people, Person A to the right of the spider and Person B beyond them, and Person C below it.
const frame = (r: number, angle = 0): Frame => ({ angle, r, size: 6, opacity: 1, glow: 0, silent: false } as Frame);
const scene = (over: Partial<WebScene>): WebScene => ({
  colour: "amber", webStrength: 0.5, reachGlow: 0, width: 1200, height: 800, top: 0, sun: { x: 600, y: 400 }, k: 1,
  inner: 60, outer: 380, shape: webShape({ inner: 60, outer: 380, count: 2, far: 2400 }),
  frames: new Map([[1, frame(150)], [2, frame(300)], [3, frame(200, Math.PI / 2)]]),
  people: [{ id: 1, colour: "#ff0000" }, { id: 2, colour: "#00ff00" }, { id: 3, colour: "#0000ff" }],
  strength: () => 1, arrived: () => 1, lockIn: () => true, focusId: null, linked: new Set(), glows: () => true, hoverId: null, heldId: null, reduced: true,
  ...over,
});
// A stroke that ends at a point (Person B's dot at 300, 0), as the beam and the hold do.
const near = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;
const strokeTo = (strokes: XY[][], at: XY) => strokes.find((points) => points.length > 0 && near(points[points.length - 1], at));
const toB = (strokes: XY[][]) => strokeTo(strokes, { x: 300, y: 0 }) !== undefined;
// A reticle's corners: four strokes in one path of three points each, round a dot.
const reticlesAt = (strokes: XY[][], at: XY) => strokes.filter((points) => points.length === 12 && near({ x: (Math.min(...points.map((q) => q.x)) + Math.max(...points.map((q) => q.x))) / 2, y: (Math.min(...points.map((q) => q.y)) + Math.max(...points.map((q) => q.y))) / 2 }, at));
const still = { bootStart: null };

describe("the Spider web's beam to whoever is looked at", () => {
  for (const [who, looked] of [["hovered", { hoverId: 2, focusId: 2 }], ["selected", { heldId: 2, focusId: 2 }]] as const) {
    it(`goes over everyone's icons when they are ${who}, never under them`, () => {
      const under = fakeCanvas();
      const above = fakeCanvas();
      const state = newLookState();
      drawWeb(under.ctx, scene(looked), { bootStart: null }, 10_000, state);
      drawWebOver(above.ctx, scene(looked), 10_000, state);
      expect(toB(above.strokes)).toBe(true);
      expect(toB(under.strokes)).toBe(false);
    });
  }

  it("is not drawn with nobody looked at", () => {
    const under = fakeCanvas();
    const above = fakeCanvas();
    const state = newLookState();
    drawWeb(under.ctx, scene({}), { bootStart: null }, 10_000, state);
    drawWebOver(above.ctx, scene({}), 10_000, state);
    expect(above.strokes).toEqual([]);
  });

  it("fires the hover's beam from the eyes and holds from the mouth", () => {
    for (const [looked, from] of [[{ hoverId: 2, focusId: 2 }, "eyes"], [{ heldId: 2, focusId: 2 }, "mouth"]] as const) {
      const above = fakeCanvas();
      const state = newLookState();
      drawWeb(fakeCanvas().ctx, scene(looked), still, 10_000, state);
      drawWebOver(above.ctx, scene(looked), 10_000, state);
      const strokes = above.strokes.filter((points) => points.length > 0 && near(points[points.length - 1], { x: 300, y: 0 }));
      expect(strokes.length).toBeGreaterThan(0);
      for (const points of strokes) expect(near(points[0], state.origin[from])).toBe(true);
    }
  });

  it("holds the selected from the mouth, facing them, and fires no beam at whoever else is hovered, only marking them", () => {
    const above = fakeCanvas();
    const state = newLookState();
    const held = scene({ heldId: 2, hoverId: 3, focusId: 2 });
    for (const now of [10_000, 10_500]) {
      drawWeb(fakeCanvas().ctx, held, still, now, state);
      drawWebOver(above.ctx, held, now, state);
    }
    const hold = above.strokes.findIndex((points) => points.length > 0 && near(points[points.length - 1], { x: 300, y: 0 }));
    expect(near(above.strokes[hold][0], state.origin.mouth)).toBe(true);
    expect(strokeTo(above.strokes, { x: 0, y: 200 })).toBeUndefined();
    expect(above.strokes.some((points) => points.length > 0 && near(points[0], state.origin.eyes))).toBe(false);
    expect(state.hold.beam).toBe(null);
    expect(state.hold.mark?.id).toBe(3);
    // Facing them, to the right, head and body, the hovered one below notwithstanding.
    expect(Math.abs(wrapAngle(state.rig!.head))).toBeLessThan(1e-6);
    expect(Math.abs(wrapAngle(state.rig!.chassis))).toBeLessThan(1e-6);
    // The mouth ahead of the eyes, both ahead of the hub.
    expect(state.origin.mouth.x).toBeGreaterThan(state.origin.eyes.x);
    expect(state.origin.eyes.x).toBeGreaterThan(0);
  });

  it("draws only the hold on whoever is both held and hovered, from the mouth", () => {
    const above = fakeCanvas();
    const state = newLookState();
    const both = scene({ heldId: 2, hoverId: 2, focusId: 2 });
    drawWeb(fakeCanvas().ctx, both, still, 10_000, state);
    drawWebOver(above.ctx, both, 10_000, state);
    expect(state.hold.beam).toBe(null);
    const strokes = above.strokes.filter((points) => points.length > 0 && near(points[points.length - 1], { x: 300, y: 0 }));
    expect(strokes.length).toBeGreaterThan(0);
    for (const points of strokes) expect(near(points[0], state.origin.mouth)).toBe(true);
  });

  it("turns all the way round to whoever is selected behind it, and stays on them while others are hovered", () => {
    const state = newLookState();
    // Person C, below the spider, selected; the spider starts facing up, away from them.
    const frames = 4000 / 16;
    for (let i = 0; i <= frames; i++) {
      const hoverId = i < frames / 2 ? null : i % 60 < 30 ? 1 : 2;
      const now = 10_000 + i * 16;
      drawWeb(fakeCanvas().ctx, scene({ heldId: 3, hoverId, focusId: 3, reduced: false }), still, now, state);
      drawWebOver(fakeCanvas().ctx, scene({ heldId: 3, hoverId, focusId: 3, reduced: false }), now, state);
    }
    expect(Math.abs(wrapAngle(state.rig!.head - Math.PI / 2))).toBeLessThan(0.02);
    expect(Math.abs(wrapAngle(state.rig!.chassis - Math.PI / 2))).toBeLessThan(0.3);
    expect(state.hold.hold?.id).toBe(3);
  });

  it("reels the hold in when they are deselected, and fires at whoever is hovered", () => {
    const state = newLookState();
    drawWeb(fakeCanvas().ctx, scene({ heldId: 2, focusId: 2, reduced: false }), still, 10_000, state);
    drawWeb(fakeCanvas().ctx, scene({ hoverId: 1, focusId: 1, reduced: false }), still, 12_000, state);
    expect(state.reeling.map((gone) => gone.id)).toEqual([2]);
    expect(state.hold.hold).toBe(null);
    expect(state.hold.beam?.id).toBe(1);
  });


  it("marks whoever is hovered with a square reticle 3 px past their dot each side, breathing up to 1 px more", () => {
    const above = fakeCanvas();
    const state = newLookState();
    drawWeb(fakeCanvas().ctx, scene({ hoverId: 2, focusId: 2 }), still, 10_000, state);
    drawWebOver(above.ctx, scene({ hoverId: 2, focusId: 2 }), 10_000, state);
    const [reticle] = reticlesAt(above.strokes, { x: 300, y: 0 });
    const width = Math.max(...reticle.map((q) => q.x)) - Math.min(...reticle.map((q) => q.x));
    // Person B's dot is 6 px in radius: 12 across, 3 more each side.
    expect(width).toBeGreaterThanOrEqual(18);
    expect(width).toBeLessThanOrEqual(20);
  });

  it("puts no reticle on whoever is held", () => {
    const above = fakeCanvas();
    const state = newLookState();
    drawWeb(fakeCanvas().ctx, scene({ heldId: 2, focusId: 2 }), still, 10_000, state);
    drawWebOver(above.ctx, scene({ heldId: 2, focusId: 2 }), 10_000, state);
    expect(toB(above.strokes)).toBe(true);
    expect(reticlesAt(above.strokes, { x: 300, y: 0 })).toEqual([]);
  });

  const widthOf = (reticle: XY[]) => Math.max(...reticle.map((q) => q.x)) - Math.min(...reticle.map((q) => q.x));
  const draw = (over: Partial<WebScene>, now: number, state: ReturnType<typeof newLookState>) => {
    const above = fakeCanvas();
    drawWeb(fakeCanvas().ctx, scene(over), still, now, state);
    drawWebOver(above.ctx, scene(over), now, state);
    return above.strokes;
  };

  it("marks whoever else is hovered while someone is held with the same square reticle, and the held with none", () => {
    const strokes = draw({ heldId: 2, hoverId: 3, focusId: 2 }, 10_000, newLookState());
    const [reticle, ...more] = reticlesAt(strokes, { x: 0, y: 200 });
    expect(more).toEqual([]);
    expect(widthOf(reticle)).toBeGreaterThanOrEqual(18);
    expect(widthOf(reticle)).toBeLessThanOrEqual(20);
    expect(reticlesAt(strokes, { x: 300, y: 0 })).toEqual([]);
  });

  it("puts no reticle on whoever is held when they are hovered too", () => {
    const strokes = draw({ heldId: 2, hoverId: 2, focusId: 2 }, 10_000, newLookState());
    expect(toB(strokes)).toBe(true);
    expect(reticlesAt(strokes, { x: 300, y: 0 })).toEqual([]);
  });

  it("moves the reticle with the hover, snapping on and springing off quickly", () => {
    const state = newLookState();
    const A = { x: 150, y: 0 };
    const C = { x: 0, y: 200 };
    const held = { heldId: 2, focusId: 2, reduced: false };
    draw({ ...held, hoverId: 1 }, 10_000, state);
    // On whoever is hovered, at full size, as soon as it has snapped on.
    let strokes = draw({ ...held, hoverId: 1 }, 10_000 + MARK_TIMING.on, state);
    expect(widthOf(reticlesAt(strokes, A)[0])).toBeLessThanOrEqual(20);
    // Hovering the next: it springs off the first as it snaps onto them.
    strokes = draw({ ...held, hoverId: 3 }, 10_200, state);
    expect(reticlesAt(strokes, A)).toHaveLength(1);
    expect(reticlesAt(strokes, C)).toHaveLength(1);
    strokes = draw({ ...held, hoverId: 3 }, 10_200 + MARK_TIMING.off, state);
    expect(reticlesAt(strokes, A)).toEqual([]);
    expect(widthOf(reticlesAt(strokes, C)[0])).toBeLessThanOrEqual(20);
    expect(MARK_TIMING.on + MARK_TIMING.off).toBeLessThanOrEqual(300);
  });

  it("marks whoever is hovered with nobody held from the moment they are hovered, before the beam has locked", () => {
    const state = newLookState();
    draw({ hoverId: 2, focusId: 2, reduced: false }, 10_000, state);
    expect(reticlesAt(draw({ hoverId: 2, focusId: 2, reduced: false }, 10_000 + MARK_TIMING.on, state), { x: 300, y: 0 })).toHaveLength(1);
  });
});

describe("the Spider web with a name in place of an icon (Name only)", () => {
  // Person B drawn as a name 60 px wide and 13 tall, centred on their place at 300, 0.
  const names = new Map([[2, { wide: 60, tall: 13 }]]);
  const draw = (over: Partial<WebScene>) => {
    const under = fakeCanvas();
    const above = fakeCanvas();
    const state = newLookState();
    drawWeb(under.ctx, scene({ names, ...over }), still, 10_000, state);
    drawWebOver(above.ctx, scene({ names, ...over }), 10_000, state);
    return { under, above, state };
  };
  // A stroke that ends on the near edge of B's name, 2 px out: never across it.
  const toName = (strokes: XY[][]) => strokes.filter((points) => {
    const end = points[points.length - 1];
    return points.length > 1 && Math.abs(end.x - (300 - 32)) < 0.5 && Math.abs(end.y) <= 8.5 + 1e-6;
  });

  for (const [who, looked, from] of [["hovered", { hoverId: 2, focusId: 2 }, "eyes"], ["selected", { heldId: 2, focusId: 2 }, "mouth"]] as const) {
    it(`ends the line to whoever is ${who} at the edge of their name, from the ${from}`, () => {
      const { above, state } = draw(looked);
      expect(toB(above.strokes)).toBe(false);
      const lines = toName(above.strokes);
      expect(lines.length).toBeGreaterThan(0);
      for (const points of lines) expect(near(points[0], state.origin[from])).toBe(true);
    });
  }

  it("marks whoever is hovered with a reticle round their name, 3 px past it each side", () => {
    const [reticle] = reticlesAt(draw({ hoverId: 2, focusId: 2 }).above.strokes, { x: 300, y: 0 });
    const wide = Math.max(...reticle.map((q) => q.x)) - Math.min(...reticle.map((q) => q.x));
    const tall = Math.max(...reticle.map((q) => q.y)) - Math.min(...reticle.map((q) => q.y));
    expect(wide).toBeGreaterThanOrEqual(66);
    expect(wide).toBeLessThanOrEqual(68);
    expect(tall).toBeGreaterThanOrEqual(19);
    expect(tall).toBeLessThanOrEqual(21);
  });

  it("leaves the web under the name, with no card cut out of it, and cuts it away under everyone else's icon as ever", () => {
    const under = fakeCanvas();
    const rects: number[][] = [];
    const arcs: number[][] = [];
    Object.assign(under.ctx, { rect: (...box: number[]) => rects.push(box), arc: (...circle: number[]) => arcs.push(circle) });
    drawWeb(under.ctx, scene({ names }), still, 10_000, newLookState());
    expect(rects.some(([x, y]) => Math.abs(x - 300) < 40 && Math.abs(y) < 10)).toBe(false);
    expect(arcs.some(([x, y]) => near({ x, y }, { x: 300, y: 0 }))).toBe(false);
    expect(arcs.some(([x, y]) => near({ x, y }, { x: 150, y: 0 }))).toBe(true);
  });

  it("is untouched for everyone else: a line to them ends at their middle", () => {
    expect(strokeTo(draw({ hoverId: 1, focusId: 1 }).above.strokes, { x: 150, y: 0 })).toBeDefined();
  });
});

describe("the Spider web's reach-out glow", () => {
  // Person A, at 150, 0, is to reach out to; the widest image centred on them is their halo.
  const haloOfA = (glows: (id: number) => boolean) => {
    const under = fakeCanvas();
    const frames = new Map([[1, { ...frame(150), glow: 1 }], [2, frame(300)], [3, frame(200, Math.PI / 2)]]);
    drawWeb(under.ctx, scene({ frames, glows }), still, 10_000, newLookState());
    return Math.max(...under.images.filter((image) => near(image, { x: 150, y: 0 })).map((image) => image.w));
  };

  it("is their wider halo, and only the plain one while someone is held whom they are not linked to", () => {
    const glowing = haloOfA(() => true);
    const off = haloOfA((id) => id !== 1);
    // The glow reaches 9 pixels further each way.
    expect(glowing - off).toBeCloseTo(18, 6);
  });
});

describe("the Spider web's boot", () => {
  // Strokes centred on a point: a bracket round someone's dot.
  const centredAt = (strokes: XY[][], at: XY) => strokes.filter((points) => points.length > 1 && near({ x: (Math.min(...points.map((q) => q.x)) + Math.max(...points.map((q) => q.x))) / 2, y: (Math.min(...points.map((q) => q.y)) + Math.max(...points.map((q) => q.y))) / 2 }, at));

  it("locks in with a bracket everyone it names, as the scan reaches them, and nobody else", () => {
    // Persons A and B sit level with the sun, so the scan reaches both 700 ms in; only A is named (Show top names).
    const under = fakeCanvas();
    drawWeb(under.ctx, scene({ strength: () => 0.5, lockIn: (id) => id === 1 }), { bootStart: 0 }, 800, newLookState());
    expect(centredAt(under.strokes, { x: 150, y: 0 }).length).toBeGreaterThan(0);
    expect(centredAt(under.strokes, { x: 300, y: 0 })).toEqual([]);
    // Named too, B locks in as well.
    const both = fakeCanvas();
    drawWeb(both.ctx, scene({ strength: () => 0.5, lockIn: () => true }), { bootStart: 0 }, 800, newLookState());
    expect(centredAt(both.strokes, { x: 300, y: 0 }).length).toBeGreaterThan(0);
  });

  it("leaves no bracket on anyone once it is over, the closest included, unless they are hovered", () => {
    // Everyone named and drawn at full strength, as the closest are: the lock-in has flashed and gone.
    const closest = { strength: () => 1, lockIn: () => true };
    for (const at of [SCAN.from + SCAN.length + LOCK_FLASH_MS, BOOT_MS, BOOT_MS + 60_000]) {
      const under = fakeCanvas();
      const above = fakeCanvas();
      const state = newLookState();
      drawWeb(under.ctx, scene(closest), { bootStart: 0 }, at, state);
      drawWebOver(above.ctx, scene(closest), at, state);
      for (const dot of [{ x: 150, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 200 }]) {
        expect(centredAt(under.strokes, dot)).toEqual([]);
        expect(centredAt(above.strokes, dot)).toEqual([]);
      }
    }
  });

  it("brackets only whoever is hovered once it is over, and never whoever is held", () => {
    const closest = { strength: () => 1, lockIn: () => true };
    const under = fakeCanvas();
    const above = fakeCanvas();
    const state = newLookState();
    const looked = scene({ ...closest, hoverId: 3, heldId: 2, focusId: 2 });
    drawWeb(under.ctx, looked, { bootStart: 0 }, BOOT_MS + 10_000, state);
    drawWebOver(above.ctx, looked, BOOT_MS + 10_000, state);
    expect(centredAt(above.strokes, { x: 0, y: 200 }).length).toBeGreaterThan(0);
    for (const dot of [{ x: 150, y: 0 }, { x: 300, y: 0 }]) expect(centredAt([...under.strokes, ...above.strokes], dot)).toEqual([]);
  });
});

describe("which way the spider first faces", () => {
  const never = () => { throw new Error("no roll when the address says"); };

  it("is the degrees clockwise from up the address asks for", () => {
    expect(startHeading("?spider=0", never)).toBeCloseTo(UP);
    expect(startHeading("?spider=90", never)).toBeCloseTo(0);
    expect(startHeading("?colour=3dff9a&spider=180", never)).toBeCloseTo(Math.PI / 2);
    expect(startHeading("?spider=-90", never)).toBeCloseTo(Math.PI);
  });

  it("is a direction at random when the address says nothing it can read", () => {
    for (const search of ["", "?spider=", "?spider=left", "?colour=3dff9a"]) {
      expect(startHeading(search, () => 0.25)).toBeCloseTo(Math.PI / 2);
      expect(startHeading(search, () => 0.75)).toBeCloseTo(-Math.PI / 2);
    }
    const rolls = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((roll) => startHeading("", () => roll));
    expect(new Set(rolls.map((a) => a.toFixed(3))).size).toBe(rolls.length);
  });

  it("is where the whole spider faces from its first frame, and it stays there through the boot", () => {
    const heading = 2.2;
    const state = newLookState(heading);
    drawWeb(fakeCanvas().ctx, scene({ reduced: false }), { bootStart: 0 }, 0, state);
    const first = state.rig!;
    expect(first.head).toBe(heading);
    expect(first.chassis).toBe(heading);
    expect(first.abdomen).toBe(heading);
    for (let now = 16; now <= 1900; now += 16) drawWeb(fakeCanvas().ctx, scene({ reduced: false }), { bootStart: 0 }, now, state);
    expect(state.rig).toBe(first);
    expect(Math.abs(wrapAngle(state.rig!.chassis - heading))).toBeLessThan(1e-6);
  });

  it("is still where it was given under reduced motion", () => {
    const state = newLookState(-2.5);
    drawWeb(fakeCanvas().ctx, scene({}), still, 10_000, state);
    expect(state.rig!.head).toBe(-2.5);
    expect(state.rig!.chassis).toBe(-2.5);
  });

  it("is up unless said, as the tests above draw it", () => {
    expect(newLookState().heading).toBe(UP);
  });
});

describe("the web's rank rings", () => {
  const ranks = [{ r: 150, label: "top 10" }, { r: 250, label: "top 25" }];
  const shape = webShape({ inner: 60, outer: 380, count: 2, far: 2400, ranks });
  // A stroke with a ring `r` from the hub in it: a corner on every spoke, each at its angle.
  const ringAt = (strokes: XY[][], r: number) => strokes.some((points) => shape.spokes.every((spoke) => points.some((p) => Math.abs(p.x - Math.cos(spoke.angle) * r) < 1e-6 && Math.abs(p.y - Math.sin(spoke.angle) * r) < 1e-6)));

  it("are drawn as regular polygons at the rank radii, among the thinner rings and the spokes", () => {
    const { ctx, strokes } = fakeCanvas();
    drawWeb(ctx, scene({ shape }), still, 10_000, newLookState());
    for (const rank of ranks) expect(ringAt(strokes, rank.r)).toBe(true);
    expect(ringAt(strokes, shape.hub)).toBe(true);
  });

  it("stay, alone of the web, with its strength at nothing, so the bands keep their meaning", () => {
    const { ctx, strokes } = fakeCanvas();
    drawWeb(ctx, scene({ shape, webStrength: 0 }), still, 10_000, newLookState());
    for (const rank of ranks) expect(ringAt(strokes, rank.r)).toBe(true);
    expect(ringAt(strokes, shape.hub)).toBe(false);
    expect(strokes.filter((points) => points.some((p) => Math.hypot(p.x, p.y) > 2000))).toHaveLength(0);
  });

  it("keep their corners on the spokes at the rank radii however deep their threads sag and however many spokes", () => {
    for (const [spokes, curve] of [[8, 1], [48, 1], [30, 0.5]]) {
      const bent = webShape({ inner: 60, outer: 380, count: 2, far: 2400, ranks, spokes, curve });
      const { ctx, strokes } = fakeCanvas();
      drawWeb(ctx, scene({ shape: bent }), still, 10_000, newLookState());
      expect(bent.spokes).toHaveLength(spokes);
      const at = (r: number) => strokes.some((points) => bent.spokes.every((spoke) => points.some((p) => Math.abs(p.x - Math.cos(spoke.angle) * r) < 1e-6 && Math.abs(p.y - Math.sin(spoke.angle) * r) < 1e-6)));
      for (const rank of ranks) expect(at(rank.r)).toBe(true);
    }
  });

  it("keep clear of a sagging label's thread: its box reaches up as far as the thread rises across it, and no further than the whole sag", () => {
    const deep = webShape({ inner: 60, outer: 380, count: 2, far: 2400, ranks, spokes: 8, curve: 1 });
    const many = webShape({ inner: 60, outer: 380, count: 2, far: 2400, ranks, spokes: 48, curve: 1 });
    const [straight] = labelBoxes(shape, 1);
    for (const bent of [deep, many]) {
      const [box] = labelBoxes(bent, 1);
      // Its foot as far below the thread's middle as ever; its top higher by the rise, within the whole sag.
      expect(box.y + box.height).toBeCloseTo(-ringTop(bent, 150) + 6);
      const rise = box.height - straight.height;
      expect(rise).toBeGreaterThan(0);
      expect(rise).toBeLessThanOrEqual(strandSag(bent, 150) + 1e-9);
    }
    // Eight spokes: the label sits well within the top thread, which rises (x / half its span)² of its sag across it.
    const half = 150 * Math.sin(Math.PI / 8);
    expect(labelBoxes(deep, 1)[0].height - straight.height).toBeCloseTo(strandSag(deep, 150) * (straight.width / 2 / half) ** 2);
    // Forty-eight: the label is wider than the thread, so the box takes the whole sag.
    expect(labelBoxes(many, 1)[0].height - straight.height).toBeCloseTo(strandSag(many, 150));
  });

  it("keep clear of their labels: a box round each, centred above the hub on the ring's level top, as wide as its label, at any zoom", () => {
    const [ten, twentyFive] = labelBoxes(shape, 1);
    expect(ten.x + ten.width / 2).toBeCloseTo(0);
    expect(ten.y + ten.height / 2).toBeCloseTo(-ringTop(shape, 150));
    expect(twentyFive.width).toBeGreaterThan(40);
    const zoomed = labelBoxes(shape, 3)[1];
    expect(zoomed.y + zoomed.height / 2).toBeCloseTo(-ringTop(shape, 250) * 3);
    expect(zoomed.width).toBe(twentyFive.width);
    expect(labelBoxes(webShape({ inner: 60, outer: 380, count: 2, far: 2400 }), 1)).toEqual([]);
  });
});
