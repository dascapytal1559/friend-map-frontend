// The size the map is drawn at while the docked person panel slides (the
// user's ask: "atm when i close person's panel, the map panel moves to the
// center with black sides, then it expands to fill the screen. fix this").
// The map used to take a new size only once its stage had held still past the
// slide, which suits a panel opening (the old, wider drawing overflows under
// the panel) but not one closing: the old, narrower drawing stayed 1020 wide,
// centred, while the stage widened to 1440, leaving bare strips up to 210
// pixels a side until it was redrawn 150 ms after the slide. These replay the
// stage's widths a frame at a time as recorded in the browser.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cover, mapSizer, type Size } from "./mapSize.ts";

const FRAME = 1000 / 60;
const SETTLE_MS = 150;
const HEIGHT = 900;

/** The stage's widths, a frame apart, as the panel slid out on the Spider web view in a 1440-wide window. */
const CLOSING = [1026, 1049, 1093, 1154, 1216, 1269, 1311, 1344, 1370, 1390, 1406, 1418, 1427, 1433, 1437, 1439, 1440];
/** And as it slid in. */
const OPENING = [1439, 1392, 1338, 1244, 1191, 1149, 1103, 1080, 1062, 1048, 1037, 1030, 1025, 1021, 1020];

const at = (width: number): Size => ({ width, height: HEIGHT });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A sizer at rest at `from`, and every frame's stage and drawing from then on. */
function sizerAt(from: number) {
  const draws: Array<Size & { now: boolean }> = [];
  const sizer = mapSizer(SETTLE_MS, (size, now) => draws.push({ ...size, now }));
  sizer.room(at(from));
  sizer.stage(at(from));
  draws.length = 0;
  let stage = from;
  let drawn = from;
  const frames: Array<{ stage: number; drawn: number }> = [];
  const frame = (change: { room?: number; stage?: number }) => {
    if (change.room !== undefined) sizer.room(at(change.room));
    if (change.stage !== undefined) sizer.stage(at((stage = change.stage)));
    drawn = draws.at(-1)?.width ?? drawn;
    frames.push({ stage, drawn });
    vi.advanceTimersByTime(FRAME);
  };
  /** A slide to `to`: the room is there on its first frame, the stage gets there on `widths`, then it all rests. */
  const slide = (to: number, widths: number[]) => {
    frame({ room: to });
    for (const width of widths) frame({ stage: width });
    for (let t = 0; t < SETTLE_MS * 2; t += FRAME) frame({});
  };
  return { draws, frames, frame, slide };
}

describe("the map's size while the docked panel slides", () => {
  it("is never narrower than the stage as the panel closes, drawn at the full width on the frame it starts", () => {
    const map = sizerAt(1020);
    map.slide(1440, CLOSING);
    for (const { stage, drawn } of map.frames) expect(drawn).toBeGreaterThanOrEqual(stage);
    expect(map.frames[0]).toEqual({ stage: 1020, drawn: 1440 });
    expect(map.draws).toEqual([{ width: 1440, height: HEIGHT, now: true }]);
  });

  it("keeps the wider drawing as the panel opens, and draws it narrower once, after the slide", () => {
    const map = sizerAt(1440);
    map.slide(1020, OPENING);
    for (const { stage, drawn } of map.frames) expect(drawn).toBeGreaterThanOrEqual(stage);
    expect(map.draws).toEqual([{ width: 1020, height: HEIGHT, now: false }]);
    const last = OPENING.length;
    const narrowed = map.frames.findIndex((f) => f.drawn === 1020);
    expect((narrowed - last) * FRAME).toBeGreaterThanOrEqual(SETTLE_MS);
  });

  it.each([
    ["closed while still opening", 1440, OPENING, 1020],
    ["opened while still closing", 1020, CLOSING, 1440],
  ])("covers the stage when the panel is %s", (_, from, there, toward) => {
    const map = sizerAt(from);
    map.frame({ room: toward });
    for (const width of there.slice(0, 6)) map.frame({ stage: width });
    map.slide(from, there.slice(0, 5).reverse().concat(from));
    for (const { stage, drawn } of map.frames) expect(drawn).toBeGreaterThanOrEqual(stage);
    expect(map.frames.at(-1)).toEqual({ stage: from, drawn: from });
  });

  it("follows a window widening frame by frame, and narrowing once it is still", () => {
    const map = sizerAt(1200);
    for (const width of [1210, 1230, 1260]) map.frame({ room: width, stage: width });
    expect(map.frames.map((f) => f.drawn)).toEqual([1210, 1230, 1260]);
    for (const width of [1240, 1200, 1180]) map.frame({ room: width, stage: width });
    expect(map.frames.at(-1)).toEqual({ stage: 1180, drawn: 1260 });
    for (let t = 0; t < SETTLE_MS + 2 * FRAME; t += FRAME) map.frame({});
    expect(map.frames.at(-1)).toEqual({ stage: 1180, drawn: 1180 });
  });

  it("takes the first size at once", () => {
    const draws: Size[] = [];
    const sizer = mapSizer(SETTLE_MS, (size) => draws.push(size));
    sizer.room(at(1020));
    expect(draws).toEqual([]);
    sizer.stage(at(1020));
    expect(draws).toEqual([at(1020)]);
  });
});

describe("cover", () => {
  it("is as wide and as tall as the wider and the taller", () => {
    expect(cover({ width: 1020, height: 900 }, { width: 1440, height: 800 })).toEqual({ width: 1440, height: 900 });
  });
});
