import { describe, expect, it } from "vitest";
import { holdLocked, holdPhase, HOLD_TIMING, lookedAt, markedId, newHoldState, stepHold, type HoldInput } from "./webHold.ts";

const T = HOLD_TIMING;
const LOCK = T.lay + T.reach;
const input = (over: Partial<HoldInput>): HoldInput => ({ hoverId: null, heldId: null, reduced: false, ...over });

describe("whom the spider looks at", () => {
  it("is whoever it holds, whoever else is hovered", () => {
    expect(lookedAt({ hoverId: 2, heldId: 1 })).toBe(1);
    expect(lookedAt({ hoverId: null, heldId: 1 })).toBe(1);
  });

  it("is whoever is hovered while it holds nobody, else nobody", () => {
    expect(lookedAt({ hoverId: 2, heldId: null })).toBe(2);
    expect(lookedAt({ hoverId: null, heldId: null })).toBe(null);
  });
});

describe("the hold's phases", () => {
  it("lays the line out, reaches, snaps, then holds", () => {
    const hold = { id: 1, start: 1000 };
    expect(holdPhase(hold, 1000).phase).toBe("lay");
    expect(holdPhase(hold, 1000 + T.lay / 2)).toEqual({ phase: "lay", p: 0.5, since: T.lay / 2 });
    expect(holdPhase(hold, 1000 + T.lay).phase).toBe("reach");
    expect(holdPhase(hold, 1000 + LOCK).phase).toBe("snap");
    expect(holdPhase(hold, 1000 + LOCK + T.snap).phase).toBe("held");
    expect(holdLocked(hold, 1000 + LOCK - 1)).toBe(false);
    expect(holdLocked(hold, 1000 + LOCK)).toBe(true);
  });
});

describe("the hold and the beam", () => {
  it("fires the beam at whoever is hovered while nobody is held, and lets it go when they are no longer", () => {
    const state = newHoldState();
    expect(stepHold(state, 0, input({ hoverId: 2 }))).toEqual({ beam: null, hold: null, mark: null });
    expect(state.beam).toEqual({ id: 2, start: 0 });
    expect(stepHold(state, 100, input({ hoverId: 3 }))).toEqual({ beam: 2, hold: null, mark: 2 });
    expect(state.beam).toEqual({ id: 3, start: 100 });
    expect(stepHold(state, 200, input({}))).toEqual({ beam: 3, hold: null, mark: 3 });
    expect(state.beam).toBe(null);
  });

  it("takes up whoever is selected, keeping a beam already on them until the hold has them, then letting it go", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ hoverId: 1 }));
    stepHold(state, 500, input({ hoverId: 1, heldId: 1 }));
    expect(state.hold).toEqual({ id: 1, start: 500 });
    expect(state.beam).toEqual({ id: 1, start: 0 });
    stepHold(state, 500 + LOCK - 1, input({ hoverId: 1, heldId: 1 }));
    expect(state.beam?.id).toBe(1);
    // Locked: the hold wins, and the beam from the eyes is let go of (it breaks up), never coming back while they stay held and hovered.
    expect(stepHold(state, 500 + LOCK, input({ hoverId: 1, heldId: 1 }))).toEqual({ beam: 1, hold: null, mark: null });
    stepHold(state, 2000, input({ hoverId: 1, heldId: 1 }));
    expect(state.beam).toBe(null);
    expect(state.hold?.id).toBe(1);
  });

  it("fires no beam at whoever else is hovered while someone is held, the hold its only line, but marks them", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ heldId: 1 }));
    for (const now of [100, 1000, 5000]) {
      expect(stepHold(state, now, input({ hoverId: 2, heldId: 1 }))).toEqual({ beam: null, hold: null, mark: null });
      expect(state.beam).toBe(null);
      expect(state.mark).toEqual({ id: 2, start: 100 });
      expect(state.hold).toEqual({ id: 1, start: 0 });
    }
    // Onto whoever is held and off them again: still no beam.
    stepHold(state, 6000, input({ hoverId: 1, heldId: 1 }));
    expect(state.beam).toBe(null);
    stepHold(state, 6100, input({ hoverId: 3, heldId: 1 }));
    expect(state.beam).toBe(null);
  });

  it("lets go of a beam on someone else as someone is selected (chosen from elsewhere, not by the pointer), keeping their reticle", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ hoverId: 2 }));
    expect(stepHold(state, 100, input({ hoverId: 2, heldId: 1 }))).toEqual({ beam: 2, hold: null, mark: null });
    expect(state.beam).toBe(null);
    expect(state.mark).toEqual({ id: 2, start: 0 });
    expect(state.hold).toEqual({ id: 1, start: 100 });
  });

  it("lets go of the held when deselected, and the beam resumes on whoever is hovered", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ heldId: 1 }));
    expect(stepHold(state, 2000, input({ hoverId: 2 }))).toEqual({ beam: null, hold: 1, mark: null });
    expect(state.hold).toBe(null);
    expect(state.beam).toEqual({ id: 2, start: 2000 });
  });

  it("lets go of one and takes up the next when someone else is selected", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ heldId: 1 }));
    expect(stepHold(state, 2000, input({ heldId: 3 }))).toEqual({ beam: null, hold: 1, mark: null });
    expect(state.hold).toEqual({ id: 3, start: 2000 });
  });

  it("holds at once under reduced motion, a beam on them giving way", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ hoverId: 1, reduced: true }));
    expect(stepHold(state, 10, input({ hoverId: 1, heldId: 1, reduced: true }))).toEqual({ beam: 1, hold: null, mark: 1 });
    expect(holdPhase(state.hold!, 10).phase).toBe("held");
    expect(state.beam).toBe(null);
  });
});

describe("the reticle on whoever is hovered", () => {
  it("marks whoever is hovered, someone held or not, but never whoever is held", () => {
    expect(markedId({ hoverId: 2, heldId: null })).toBe(2);
    expect(markedId({ hoverId: 2, heldId: 1 })).toBe(2);
    expect(markedId({ hoverId: 1, heldId: 1 })).toBe(null);
    expect(markedId({ hoverId: null, heldId: 1 })).toBe(null);
    expect(markedId({ hoverId: null, heldId: null })).toBe(null);
  });

  it("moves with the hover while someone is held, letting go of each one left", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ heldId: 1 }));
    stepHold(state, 100, input({ hoverId: 2, heldId: 1 }));
    expect(state.mark).toEqual({ id: 2, start: 100 });
    expect(stepHold(state, 140, input({ hoverId: 3, heldId: 1 }))).toEqual({ beam: null, hold: null, mark: 2 });
    expect(state.mark).toEqual({ id: 3, start: 140 });
    // Onto whoever is held: let go of, none on them.
    expect(stepHold(state, 180, input({ hoverId: 1, heldId: 1 }))).toEqual({ beam: null, hold: null, mark: 3 });
    expect(state.mark).toBe(null);
    // Off them again, onto someone else: marked at once.
    stepHold(state, 220, input({ hoverId: 2, heldId: 1 }));
    expect(state.mark).toEqual({ id: 2, start: 220 });
  });

  it("lets go of whoever is hovered as they are selected, and marks them again once deselected", () => {
    const state = newHoldState();
    stepHold(state, 0, input({ hoverId: 2 }));
    expect(stepHold(state, 50, input({ hoverId: 2, heldId: 2 })).mark).toBe(2);
    expect(state.mark).toBe(null);
    stepHold(state, 2000, input({ hoverId: 2 }));
    expect(state.mark).toEqual({ id: 2, start: 2000 });
  });

  it("is on at once under reduced motion", () => {
    const state = newHoldState();
    stepHold(state, 10, input({ hoverId: 2, heldId: 1, reduced: true }));
    expect(state.mark).toEqual({ id: 2, start: -Infinity });
  });
});
