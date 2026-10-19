import { describe, expect, it } from "vitest";
import { addName, cleanName, draftResult, dropIndex, moveName, nameChange, namesOf, removeName, renameName } from "./nameChips.ts";

const names = ["Ada Sample", "Addy", "Ada S"] as const;

describe("a person's names as chips", () => {
  it("are their name, then their aliases, in order, each once", () => {
    expect(namesOf({ name: "Ada Sample", aliases: ["Addy", "Ada S"] })).toEqual(names);
    expect(namesOf({ name: "Ada Sample", aliases: ["Ada Sample", "Addy"] })).toEqual(["Ada Sample", "Addy"]);
  });

  it("move: dragging an alias first makes it their name, and the name before it the first alias", () => {
    expect(moveName(names, 2, 0)).toEqual(["Ada S", "Ada Sample", "Addy"]);
    expect(moveName(names, 0, 2)).toEqual(["Addy", "Ada S", "Ada Sample"]);
    expect(moveName(names, 1, 2)).toEqual(["Ada Sample", "Ada S", "Addy"]);
    // Past either end is the end; to where it is, or a chip that is not there, changes nothing.
    expect(moveName(names, 1, 9)).toEqual(["Ada Sample", "Ada S", "Addy"]);
    expect(moveName(names, 1, -3)).toEqual(["Addy", "Ada Sample", "Ada S"]);
    expect(moveName(names, 1, 1)).toBe(names);
    expect(moveName(names, 5, 0)).toBe(names);
  });

  it("add: at the end, written as the archive writes names, never twice or empty", () => {
    expect(addName(names, "  Ada   Fictional ")).toEqual([...names, "Ada Fictional"]);
    expect(addName(names, "Addy")).toBe(names);
    expect(addName(names, "   ")).toBe(names);
    expect(cleanName(" a \t b ")).toBe("a b");
  });

  it("remove: any name but the last one left", () => {
    expect(removeName(names, 0)).toEqual(["Addy", "Ada S"]);
    expect(removeName(names, 2)).toEqual(["Ada Sample", "Addy"]);
    expect(removeName(["Ada Sample"], 0)).toEqual(["Ada Sample"]);
    expect(removeName(names, 3)).toBe(names);
  });

  it("rename: in its place; empty changes nothing, and written as another of their names the two are one", () => {
    expect(renameName(names, 1, " Ads ")).toEqual(["Ada Sample", "Ads", "Ada S"]);
    expect(renameName(names, 1, "")).toBe(names);
    expect(renameName(names, 1, "Addy")).toBe(names);
    expect(renameName(names, 2, "Ada Sample")).toEqual(["Ada Sample", "Addy"]);
    expect(renameName(names, 0, "Addy")).toEqual(["Addy", "Ada S"]);
  });

  it("says what a change did, for its chip", () => {
    expect(nameChange(names, names)).toBeNull();
    expect(nameChange(names, addName(names, "Ads"))).toEqual({ done: "added", name: "Ads" });
    expect(nameChange(names, removeName(names, 0))).toEqual({ done: "removed", name: "Ada Sample" });
    expect(nameChange(names, renameName(names, 1, "Ads"))).toEqual({ done: "renamed", from: "Addy", to: "Ads" });
    expect(nameChange(names, moveName(names, 2, 0))).toEqual({ done: "first", name: "Ada S" });
    expect(nameChange(names, moveName(names, 1, 2))).toEqual({ done: "reordered" });
  });

  it("drops a dragged chip after every chip on the rows above it, and each on its row whose middle it passed", () => {
    // Two rows of two: [0-40] [50-90] over [0-40] [50-90], 20 px tall each.
    const boxes = [
      { left: 0, right: 40, top: 0, bottom: 20 }, { left: 50, right: 90, top: 0, bottom: 20 },
      { left: 0, right: 40, top: 30, bottom: 50 }, { left: 50, right: 90, top: 30, bottom: 50 },
    ];
    expect(dropIndex(boxes, 5, 10)).toBe(0);
    expect(dropIndex(boxes, 30, 10)).toBe(1);
    expect(dropIndex(boxes, 95, 10)).toBe(2);
    expect(dropIndex(boxes, 5, 40)).toBe(2);
    expect(dropIndex(boxes, 75, 40)).toBe(4);
    expect(dropIndex(boxes, 5, 80)).toBe(4);
    expect(dropIndex(boxes, 60, -10)).toBe(0);
  });

  it("a name box: Enter or leaving it gives what was typed; Esc, or nothing typed, gives nothing", () => {
    expect(draftResult("Ada Sample", "enter")).toBe("Ada Sample");
    expect(draftResult("Ada Sample", "leave")).toBe("Ada Sample");
    expect(draftResult("Ada Sample", "escape")).toBeNull();
    for (const end of ["enter", "leave", "escape"] as const) expect(draftResult("  ", end)).toBeNull();
  });

  it("adding from the Names + box: Enter adds the name last; Esc or an empty box adds nothing", () => {
    const add = (text: string, end: "enter" | "leave" | "escape") => {
      const typed = draftResult(text, end);
      return typed === null ? names : addName(names, typed);
    };
    expect(add(" Bruno  Placeholder ", "enter")).toEqual([...names, "Bruno Placeholder"]);
    expect(add("Bruno", "leave")).toEqual([...names, "Bruno"]);
    expect(add("Bruno", "escape")).toBe(names);
    expect(add("", "leave")).toBe(names);
  });

  it("editing a chip: their name or an alias is renamed in place; Esc or an emptied chip changes nothing", () => {
    const edit = (index: number, text: string, end: "enter" | "leave" | "escape") => {
      const typed = draftResult(text, end);
      return typed === null ? names : renameName(names, index, typed);
    };
    expect(edit(0, "Ada Example", "enter")).toEqual(["Ada Example", "Addy", "Ada S"]);
    expect(edit(2, "Ada E", "leave")).toEqual(["Ada Sample", "Addy", "Ada E"]);
    expect(edit(1, "Ada Example", "escape")).toBe(names);
    // Emptied, it stays rather than going: removing is the ×'s.
    expect(edit(1, " ", "enter")).toBe(names);
  });
});
