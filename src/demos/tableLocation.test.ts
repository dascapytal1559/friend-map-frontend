// Setting where people are from the Table (LocationCell.tsx): the Location
// cell's list, and the rows holding still meanwhile.
// Saving, and the chip's Undo, are in changeChip.test.ts.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TablePerson } from "../archive.ts";
import { columnsFor, type LocationEdit, PersonRow } from "./Table.tsx";
import {
  chosenLocation, DEFAULT_SORT, filterRows, heldRows, isLocation, locationChoices, sortRows,
} from "./table.ts";

const person = (id: number, fields: Partial<TablePerson> = {}): TablePerson => ({
  id, name: `Person ${id}`, aliases: [], tags: [], note: "", identiconSeed: "00000000000000a1", identiconHue: null, location: null, unknown: false,
  untouched: false, archived: null, platforms: ["messenger"], messageCount: 2, directMessageCount: 2, groupMessageCount: 0,
  lastMessageAt: 1, byPlatform: [], calls: null, addedAt: 1, firstContactAt: null, closeness: 1, ...fields,
});

const VALUES = ["Brisbane", "Melbourne", "Sydney", "West End"];

describe("the Location cell's list", () => {
  it("offers every value in use, the most used first, and None when they have one", () => {
    expect(locationChoices(VALUES, "", null)).toEqual(VALUES.map((value) => ({ kind: "value", value })));
    expect(locationChoices(VALUES, "  ", "Sydney")[0]).toEqual({ kind: "none" });
    expect(locationChoices([], "", null)).toEqual([]);
  });

  it("narrows to the values holding what is typed, those starting with it first, but for case", () => {
    expect(locationChoices(VALUES, "we", null).map(chosenLocation)).toEqual(["West End", "we"]);
    expect(locationChoices(VALUES, "s", null).map(chosenLocation)).toEqual(["Sydney", "Brisbane", "West End", "s"]);
    // What is typed comes last, so Enter takes the value it starts.
    expect(locationChoices(VALUES, "MEL", "Brisbane")).toEqual([{ kind: "value", value: "Melbourne" }, { kind: "new", value: "MEL" }]);
  });

  it("offers what is typed as a new value, as the archive writes it, unless a value is it but for case", () => {
    expect(locationChoices(VALUES, "  Gold   Coast ", null)).toEqual([{ kind: "new", value: "Gold Coast" }]);
    expect(locationChoices(VALUES, "west end", null)).toEqual([{ kind: "value", value: "West End" }]);
  });

  it("sets, changes and clears: what a pick saves", () => {
    // Set: nobody had one, Brisbane picked.
    expect(chosenLocation(locationChoices(VALUES, "bris", null)[0])).toBe("Brisbane");
    // Change: Brisbane to Melbourne.
    expect(chosenLocation(locationChoices(VALUES, "melb", "Brisbane")[0])).toBe("Melbourne");
    // A new value.
    expect(chosenLocation(locationChoices(VALUES, "Hobart", "Brisbane")[0])).toBe("Hobart");
    // Clear: None, first while nothing is typed.
    expect(chosenLocation(locationChoices(VALUES, "", "Brisbane")[0])).toBeNull();
  });
});

describe("isLocation", () => {
  it("matches whatever its case", () => {
    expect(isLocation("MELBOURNE", "Melbourne")).toBe(true);
    expect(isLocation(null, "Melbourne")).toBe(false);
  });
});

describe("the rows held while locations are set", () => {
  it("keep their order and who is in them, as they are now, whatever the sort and the query say", () => {
    const before = [person(1, { location: "Brisbane" }), person(2, { location: "Melbourne" }), person(3, { location: "Brisbane" })];
    const by = { column: "location", descending: false } as const;
    const shown = filterRows(before, { hide: {}, search: "", only: new Set([1, 3]) });
    const ids = sortRows(shown.rows, by).map((r) => r.id);
    expect(ids).toEqual([1, 3]);
    // Person 1 moves to Sydney: sorted again they would go last, and the query (in Brisbane) would drop them.
    const after = [person(1, { location: "Sydney" }), before[1], before[2]];
    const now = filterRows(after, { hide: {}, search: "", only: new Set([3]) });
    expect(heldRows(ids, now.everyone).map((r) => [r.id, r.location])).toEqual([[1, "Sydney"], [3, "Brisbane"]]);
    // Someone merged away is gone.
    expect(heldRows([1, 9, 3], now.everyone).map((r) => r.id)).toEqual([1, 3]);
  });

  it("are as the platform picked counts them", () => {
    const ada = person(1, { messageCount: 10, byPlatform: [{ platform: "whatsapp", messageCount: 4, directMessageCount: 4, groupMessageCount: 0, lastMessageAt: 1 }] });
    const on = filterRows([ada], { hide: {}, search: "", platform: "whatsapp" });
    expect(heldRows([1], on.everyone)[0].messageCount).toBe(4);
    expect(sortRows(on.rows, DEFAULT_SORT)[0].messageCount).toBe(4);
  });
});

describe("the Table's location cells", () => {
  const edit: LocationEdit = { values: VALUES, onLocation: async () => true };
  const draw = (location: string | null, editing: LocationEdit | undefined) => renderToStaticMarkup(createElement("table", null, createElement("tbody", null,
    createElement(PersonRow, {
      row: person(1, { location }), rank: 1, index: 0, columns: columnsFor(null), open: false, onOpen: () => {}, now: 1, edit: editing,
    }))));

  it("has no Quick location column, editable or not", () => {
    expect(columnsFor(null).map((c) => c.title)).not.toContain("Quick location");
    expect(columnsFor(null).map((c) => c.column)).not.toContain("quick");
  });

  it("draws Location as a button, Add when they have none, and no other buttons", () => {
    const none = draw(null, edit);
    expect(none).toMatch(/<button[^>]*class="people-table__cell-button"[^>]*><span class="people-table__add">Add<\/span><\/button>/);
    expect(none.match(/<button/g)).toHaveLength(1);
    const melbourne = draw("Melbourne", edit);
    expect(melbourne).toMatch(/class="people-table__cell-button"[^>]*>Melbourne<\/button>/);
    expect(melbourne).not.toContain("aria-pressed");
  });

  it("is plain text, with no buttons, where nothing can be changed (demo mode)", () => {
    const html = draw("Melbourne", undefined);
    expect(html).toContain('<td title="Melbourne">Melbourne</td>');
    expect(html).not.toContain("<button");
  });
});
