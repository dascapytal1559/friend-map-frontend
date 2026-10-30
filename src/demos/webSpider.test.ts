// The spider's drawing (webSpider.ts), on a recording canvas: it draws
// without a real canvas (so every shape it uses is one the Spider web's test
// canvas knows), and its beams come from the head, turned with it: the
// hover's from the eyes, the hold's from the mouth.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { newRig, updateRig, wrapAngle } from "./webRig.ts";
import { beamOrigin, drawSpider } from "./webSpider.ts";

type XY = { x: number; y: number };

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

/** A canvas that counts what is filled and stroked, and refuses nothing else. */
function fakeCanvas() {
  const counts = { fill: 0, stroke: 0, image: 0 };
  const thing: object = new Proxy(() => thing, { get: (_t, key) => (key === "then" ? undefined : thing), apply: () => thing });
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key === "fill") return () => void counts.fill++;
      if (key === "stroke") return () => void counts.stroke++;
      if (key === "drawImage") return () => void counts.image++;
      if (key in target) return target[key];
      return () => thing;
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, counts };
}

beforeAll(() => {
  vi.stubGlobal("Path2D", FakePath);
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => fakeCanvas().ctx }) });
});
afterAll(() => vi.unstubAllGlobals());

const ink = { line: "#ffb347", accent: "#ffb347", beam: "#39d8ff", eye: "#39d8ff", chitin: { deep: "#070c17", shell: "#232022", lit: "#454a54" }, shadow: 0.3 };
const eyes = { open: 1, gaze: { x: 0, y: 0 }, glow: 1 };
const UP = -Math.PI / 2;

describe("the spider", () => {
  it("draws its legs and body on a recording canvas, at the hub's size and grown by the zoom, moving and still", () => {
    for (const [px, reduced] of [[1, false], [3.5, false], [1, true]] as const) {
      const { ctx, counts } = fakeCanvas();
      drawSpider(ctx, newRig(UP, 0, 40), 40, eyes, ink, 1000, { reduced, px, shadow: true });
      // Six plates a leg, eight legs, a body: hundreds of fills, more strokes.
      expect(counts.fill).toBeGreaterThan(100);
      expect(counts.stroke).toBeGreaterThan(counts.fill / 2);
      expect(counts.image).toBeGreaterThan(8);
    }
  });

  it("casts its shadow, its body's and each leg's, only with the shadow on", () => {
    const drawn = (shadow: boolean) => {
      const { ctx, counts } = fakeCanvas();
      drawSpider(ctx, newRig(UP, 0, 40), 40, eyes, ink, 1000, { reduced: true, px: 1, shadow });
      return counts;
    };
    const on = drawn(true);
    const off = drawn(false);
    expect(on.fill - off.fill).toBe(1);
    expect(on.stroke - off.stroke).toBe(8);
  });

  it("fires its beams from the head: the mouth ahead of the eyes, both ahead of the hub, turning with the head", () => {
    const s = 40;
    const rig = newRig(UP, 0, s);
    const mouth = beamOrigin(rig, s, "mouth");
    const eyes = beamOrigin(rig, s, "eyes");
    // Facing up the screen: ahead is -y. The eyes sit on the visor, the mouth between the fangs further ahead.
    expect(mouth.y).toBeLessThan(eyes.y);
    expect(eyes.y).toBeLessThan(-0.3 * s);
    expect(mouth.y - eyes.y).toBeLessThan(-0.15 * s);
    expect(Math.abs(mouth.x)).toBeLessThan(1e-9);
    expect(Math.abs(eyes.x)).toBeLessThan(1e-9);
    // The head turned right on its neck: the mouth swings right of the eyes, which swing right of the hub.
    updateRig(rig, 16, 16, s, { look: UP + 0.8, target: null, reduced: true, random: () => 0.5 });
    expect(Math.abs(wrapAngle(rig.head - (UP + 0.8)))).toBeLessThan(1e-9);
    const turned = beamOrigin(rig, s, "mouth");
    expect(turned.x).toBeGreaterThan(beamOrigin(rig, s, "eyes").x);
    expect(beamOrigin(rig, s, "eyes").x).toBeGreaterThan(0);
    // The body's sway carries both with it.
    rig.sway = { x: 5, y: 0 };
    expect(beamOrigin(rig, s, "mouth").x).toBeCloseTo(turned.x + 5);
  });
});
