// The Table's Catch-ups: what it lists remembered, its sorts and search, and
// its rows (the date as a link to the Calendar's day, who as chips that open their chat at it and the unnamed others,
// what each got, the note, Edit and Delete but on a read-only page).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatchUp } from "../archive.ts";
import { namesFor } from "../names.ts";
import { ReadOnly } from "../readOnly.ts";
import { CATCH_UP_SORT, findCatchUps, nextCatchUpSort, sortCatchUps } from "./catchUpsTable.ts";
import { CatchUpsTable } from "./CatchUpsTable.tsx";
import { loadTableRows, saveTableRows } from "./tableRows.ts";

const N = { full: namesFor("full"), hide: namesFor("hide"), except: namesFor("except", new Set([2])) };

const ada = { id: 2, name: "Ada Sample", aliases: ["Addy"] };
const bo = { id: 3, name: "Bo Example", aliases: [] };
const cy = { id: 4, name: "Cy Placeholder", aliases: [] };
const LIST: CatchUp[] = [
  { id: 1, day: "2026-09-01", time: null, hours: 2, trip: null, note: "Dinner", people: [ada], others: 0 },
  { id: 2, day: "2026-09-20", time: null, hours: 1, trip: null, note: "", people: [ada, bo, cy], others: 0 },
  { id: 3, day: "2026-09-01", time: "19:30", hours: 3, trip: null, note: "Board games", people: [bo], others: 2 },
  { id: 4, day: "2026-07-14", time: null, hours: 1, trip: null, note: "", people: [cy], others: 0 },
];
const ids = (list: readonly CatchUp[]) => list.map((c) => c.id);
const SETTINGS = { catchUpHourWorth: 50, groupSharedPart: 0.5, tripFullHours: 8 };

describe("what the Table lists", () => {
  it("is people until catch-ups are chosen, then remembered", () => {
    const items = new Map<string, string>();
    const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
    expect(loadTableRows(() => storage)).toBe("people");
    saveTableRows("catch-ups", () => storage);
    expect(loadTableRows(() => storage)).toBe("catch-ups");
    saveTableRows("people", () => storage);
    expect(loadTableRows(() => storage)).toBe("people");
  });

  it("is people without storage, when storage refuses, or with something else kept", () => {
    expect(loadTableRows(() => undefined)).toBe("people");
    const refusing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadTableRows(() => refusing)).toBe("people");
    expect(() => saveTableRows("catch-ups", () => refusing)).not.toThrow();
    expect(loadTableRows(() => ({ getItem: () => "cats", setItem: () => {} }))).toBe("people");
  });
});

describe("the catch-ups' order", () => {
  it("starts newest first, those on one date the last added first", () => {
    expect(ids(sortCatchUps(LIST, CATCH_UP_SORT, SETTINGS))).toEqual([2, 3, 1, 4]);
    expect(ids(sortCatchUps(LIST, { column: "day", descending: false }, SETTINGS))).toEqual([4, 1, 3, 2]);
  });

  it("puts those on one date by their time before when they were added, those without one first in the day", () => {
    const day = (id: number, time: string | null): CatchUp => ({ id, day: "2026-09-01", time, hours: 1, trip: null, note: "", people: [ada], others: 0 });
    const list = [day(1, "19:30"), day(2, null), day(3, "08:00"), day(4, "19:30")];
    expect(ids(sortCatchUps(list, CATCH_UP_SORT, SETTINGS))).toEqual([4, 1, 3, 2]);
    expect(ids(sortCatchUps(list, { column: "day", descending: false }, SETTINGS))).toEqual([2, 3, 1, 4]);
  });

  it("by hours, the longest first, and the same hours newest first", () => {
    expect(ids(sortCatchUps(LIST, { column: "hours", descending: true }, SETTINGS))).toEqual([3, 1, 2, 4]);
    expect(ids(sortCatchUps(LIST, { column: "hours", descending: false }, SETTINGS))).toEqual([2, 4, 1, 3]);
  });

  it("by weight, what each got the most first, the same weight newest first", () => {
    // Weights, each one's share at half shared: 100, 33.3, 100 (3 hours, a friend and 2 others) and 50.
    expect(ids(sortCatchUps(LIST, { column: "weight", descending: true }, SETTINGS))).toEqual([3, 1, 4, 2]);
    expect(ids(sortCatchUps(LIST, { column: "weight", descending: false }, SETTINGS))).toEqual([2, 4, 3, 1]);
  });

  it("by weight, a trip by the hours its time together counts as", () => {
    // 6 pm on 4 Oct to 2 pm on the 6th: 24 hours together, counting as 13.86, 692.8; a 14-hour day, 700.
    const trip: CatchUp = {
      id: 6, day: "2026-10-04", time: "18:00", trip: { lastDay: "2026-10-06", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" },
      hours: 24, note: "", people: [ada], others: 0,
    };
    const day: CatchUp = { ...trip, id: 7, day: "2026-09-02", time: null, trip: null, hours: 14 };
    expect(ids(sortCatchUps([trip, day], { column: "weight", descending: true }, SETTINGS))).toEqual([7, 6]);
    expect(ids(sortCatchUps([trip, day], { column: "hours", descending: true }, SETTINGS))).toEqual([6, 7]);
  });

  it("turns round on a second click, and starts a new column at its biggest", () => {
    expect(nextCatchUpSort(CATCH_UP_SORT, "day")).toEqual({ column: "day", descending: false });
    expect(nextCatchUpSort({ column: "day", descending: false }, "hours")).toEqual({ column: "hours", descending: true });
  });
});

describe("finding catch-ups", () => {
  it("by anyone at one, by name or alias, or by its note", () => {
    expect(ids(findCatchUps(LIST, "addy", N.full))).toEqual([1, 2]);
    expect(ids(findCatchUps(LIST, "placeholder", N.full))).toEqual([2, 4]);
    expect(ids(findCatchUps(LIST, "games", N.full))).toEqual([3]);
    expect(findCatchUps(LIST, "  ", N.full)).toBe(LIST);
  });

  it("as ever with No name, which is for the map alone; by the names of those picked alone with No name except…", () => {
    expect(findCatchUps(LIST, "addy", N.hide)).toEqual(findCatchUps(LIST, "addy", N.full));
    expect(findCatchUps(LIST, "addy", N.except)).toEqual([]);
    expect(findCatchUps(LIST, "games", N.except)).toEqual([]);
  });
});

/** A chip in Who, as the markup has it: it opens their chat at the hangout. */
const chip = (name: string) => `<button type="button" class="tag-chip tag-chip--alias" title="Open their chat at this hangout">${name}</button>`;
/** Where each date links to, in the order drawn. */
const linked: string[] = [];
const navigate = (to: string) => {
  linked.push(to);
  return () => {};
};

describe("the catch-ups' rows", () => {
  const render = (readOnly: boolean) => renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(CatchUpsTable, {
    rows: sortCatchUps(LIST, CATCH_UP_SORT, SETTINGS), sort: CATCH_UP_SORT, onSort: () => {}, openId: bo.id, onOpenAt: () => {}, navigate,
    editing: null, onEdit: () => {}, settings: SETTINGS, top: 100,
  })));

  it("show the date, hours, everyone at it as a chip, then the unnamed others, what each got (their share) and the note", () => {
    linked.length = 0;
    const html = render(false);
    // The date opens the Calendar at that day, in place; each one there is a chip opening their own chat at it.
    expect(html).toContain('<td class="when-cell"><a class="when-cell__open" href="/calendar?day=2026-09-20" title="Open the Calendar on Sunday 20 September 2026">20 Sept 2026</a></td>');
    expect(html).toContain('<td class="when-cell"><a class="when-cell__open" href="/calendar?day=2026-09-01" title="Open the Calendar on Tuesday 1 September 2026">1 Sept 2026<span class="people-table__secondary"> 7:30 pm</span></a></td>');
    expect(linked).toEqual(["/calendar?day=2026-09-20", "/calendar?day=2026-09-01", "/calendar?day=2026-09-01", "/calendar?day=2026-07-14"]);
    expect(html).toContain(`${chip("Ada Sample")}${chip("Bo Example")}${chip("Cy Placeholder")}`);
    expect(html).not.toContain("popover");
    expect(html.match(/class="tag-chip /g)).toHaveLength(6);
    // One hour with three people: 50 × (½ + ½ ÷ 3) each; two hours alone: 100.
    expect(html).toContain(">33.3</td>");
    expect(html).toContain(">100</td>");
    expect(html).toContain(">Weight each<");
    expect(html).not.toContain("messages</span>");
    // Three hours with Bo and two others: 150 × (½ + ½ ÷ 3), and said after Bo's chip.
    expect(html).toContain('<span class="people-table__secondary">+2 others</span>');
    expect(html).toContain('title="3 hours × 50 messages × 67%, each one&#x27;s share with 3 people">100</td>');
    expect(html.match(/others</g)).toHaveLength(1);
    expect(html).toContain("Board games");
    // The hour with Cy is its hours alone.
    expect(html).toContain('title="1 hour">1</td>');
    expect(html.match(/>Edit</g)).toHaveLength(4);
    // Bo's panel is open: the two with Bo are marked.
    expect(html.match(/people-table__open/g)).toHaveLength(2);
  });

  it("have no Edit or Delete on a read-only page", () => {
    const html = render(true);
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain(">Delete<");
  });

  it("give a trip one row: its first to last day and when it started, its hours in all over its days, and what they count as", () => {
    const trip: CatchUp = {
      id: 5, day: "2026-10-04", time: "18:00", trip: { lastDay: "2026-10-06", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" },
      hours: 24, note: "", people: [ada], others: 0,
    };
    const html = renderToStaticMarkup(createElement(CatchUpsTable, {
      rows: [trip], sort: CATCH_UP_SORT, onSort: () => {}, openId: null, onOpenAt: () => {}, navigate, editing: null, onEdit: () => {}, settings: SETTINGS, top: 0,
    }));
    expect(html).toContain('>4–6 Oct 2026<span class="people-table__secondary"> 6:00 pm</span></a>');
    expect(html).toContain('title="24 hours over 3 days">24<span class="people-table__secondary catch-ups-table__days">over 3 days</span></td>');
    // 24 hours together count as 8 × √3 hours (tripCountedHours): 692.8, not 1,200.
    expect(html).toContain('title="24 hours, counted as 13.86 hours (the first 8 hours whole, the rest by their square root), × 50 messages, each day&#x27;s part on its own date">692.8</td>');
    // Its hours in all sort it among the rest.
    expect(ids(sortCatchUps([...LIST, trip], { column: "hours", descending: true }, SETTINGS))[0]).toBe(5);
  });

  it("say so when there are none", () => {
    const html = renderToStaticMarkup(createElement(CatchUpsTable, {
      rows: [], sort: CATCH_UP_SORT, onSort: () => {}, openId: null, onOpenAt: () => {}, navigate, editing: null, onEdit: () => {}, settings: SETTINGS, top: 0,
    }));
    expect(html).toContain("No hangouts here.");
  });
});
