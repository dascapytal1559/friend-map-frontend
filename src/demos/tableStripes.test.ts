// The Table's rows alternate in shade by their place in the list (Table.tsx),
// not by anything about the person, so sorting or filtering keeps the stripes even.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TablePerson } from "../archive.ts";
import { columnsFor, PersonRow } from "./Table.tsx";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");

const person = (id: number): TablePerson => ({
  id, name: `Person ${id}`, aliases: [], tags: [], note: "", identiconSeed: "00000000000000a1", identiconHue: null, location: null, unknown: false,
  untouched: false, archived: null, platforms: ["messenger"], messageCount: 2, directMessageCount: 2, groupMessageCount: 0, lastMessageAt: NOW, byPlatform: [], calls: null, addedAt: 1, firstContactAt: null, closeness: 1,
});

const rowClass = (index: number, open = false, id = 1) => {
  const html = renderToStaticMarkup(createElement("table", null, createElement("tbody", null,
    createElement(PersonRow, { row: person(id), rank: 1, index, columns: columnsFor(null), open, onOpen: () => {}, now: NOW }))));
  return /<tr[^>]*?class="([^"]*)"/.exec(html)?.[1] ?? null;
};

describe("the Table's striped rows", () => {
  it("shades every other row by its place, whoever is in it", () => {
    expect([0, 1, 2, 3].map((i) => rowClass(i))).toEqual([null, "people-table__odd", null, "people-table__odd"]);
    expect(rowClass(1, false, 7)).toBe(rowClass(1, false, 1));
  });

  it("keeps the open row's highlight on either shade", () => {
    expect(rowClass(0, true)).toBe("people-table__open");
    expect(rowClass(1, true)).toBe("people-table__odd people-table__open");
  });
});
