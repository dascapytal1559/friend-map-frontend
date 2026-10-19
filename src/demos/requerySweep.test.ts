// The Spider web's scan replays when you re-query, and at no other time
// (the user's ask: "Instead if I ever make a filter change, we should replay
// the top down, top to bottom radar sweep animation to ref to refresh the page
// essentially. But that should only happen on queries query resets, like if
// we've requeried it."). The Query bar counts each re-query (`requery`, by
// nextShown in queryBar.ts), and useTween plays the entrance again whenever
// that count moves (tweenOf in orbitsSky.ts); every other change moves people
// as on Orbits.

import { describe, expect, it } from "vitest";
import { nextShown, type RunReason, type Shown } from "./queryBar.ts";
import { tweenOf } from "./orbitsSky.ts";

const start: Shown = { only: new Set([1, 2, 3]), hide: {}, requery: 0 };

describe("a re-query", () => {
  it.each<[string, RunReason]>([
    ["a new query (Generate, or an example in the demo)", "generate"],
    ["× back to everyone", "clear"],
    ["a change of the Table's Hide, which runs the query again under it", "hide"],
  ])("is %s", (_, why) => {
    const shown = nextShown(start, new Set([2, 3]), {}, why);
    expect(shown.requery).toBe(1);
    expect(shown.only).toEqual(new Set([2, 3]));
  });

  it("counts even when it shows the same people, keeping their set so the map is not built again", () => {
    const same = nextShown(start, new Set([3, 2, 1]), start.hide, "generate");
    expect(same.requery).toBe(1);
    expect(same.only).toBe(start.only);
    expect(same.hide).toBe(start.hide);
    expect(nextShown(start, null, start.hide, "clear")).toMatchObject({ only: null, requery: 1 });
  });

  it("is never the query run again as messages arrive or people change", () => {
    expect(nextShown(start, new Set([1, 2, 3]), start.hide, "again")).toBe(start);
    const moved = nextShown(start, new Set([1, 2]), start.hide, "again");
    expect(moved).toMatchObject({ only: new Set([1, 2]), requery: 0 });
    const hidden = { archive: false };
    expect(nextShown(start, new Set([1, 2, 3]), hidden, "again")).toMatchObject({ hide: hidden, requery: 0 });
  });

  it("adds up, one for each", () => {
    const whys: RunReason[] = ["generate", "again", "hide", "again", "clear"];
    expect(whys.reduce((shown, why) => nextShown(shown, null, shown.hide, why), start).requery).toBe(3);
  });
});

describe("the scan replayed", () => {
  const change = { entering: false, replayed: false, reduced: false, rescaled: false, visible: true };

  it("plays at load, and again on a re-query, however little moved", () => {
    expect(tweenOf({ ...change, entering: true })).toBe("entrance");
    expect(tweenOf({ ...change, replayed: true })).toBe("entrance");
    expect(tweenOf({ ...change, replayed: true, visible: false })).toBe("entrance");
    expect(tweenOf({ ...change, replayed: true, rescaled: true })).toBe("entrance");
  });

  it("is not played for any other change: people move as on Orbits, or at once when nobody would see it or the map only rescaled", () => {
    expect(tweenOf(change)).toBe("move");
    expect(tweenOf({ ...change, visible: false })).toBe("atOnce");
    expect(tweenOf({ ...change, rescaled: true })).toBe("atOnce");
  });

  it("never plays under reduced motion: everyone is simply there", () => {
    expect(tweenOf({ ...change, reduced: true, replayed: true })).toBe("atOnce");
    expect(tweenOf({ ...change, reduced: true, entering: true })).toBe("atOnce");
    expect(tweenOf({ ...change, reduced: true })).toBe("atOnce");
  });
});
