// The Table's First contact and Added cells (Table.tsx): the Melbourne day, its time in the tooltip, "never" for nobody in touch.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TablePerson } from "../archive.ts";
import { columnsFor, PersonRow } from "./Table.tsx";

const NOW = Date.parse("2026-10-12T12:00:00+11:00");

const person = (fields: Partial<TablePerson>): TablePerson => ({
  id: 1, name: "Ada Sample", aliases: [], tags: [], note: "", identiconSeed: "00000000000000a1", identiconHue: null, location: null, unknown: false,
  untouched: false, archived: null, platforms: [], messageCount: 0, directMessageCount: 0, groupMessageCount: 0, lastMessageAt: null, byPlatform: [], calls: null,
  addedAt: NOW, firstContactAt: null, closeness: 0, ...fields,
});

/** The cells of `row` under the headers `titles`, each as [tooltip, text]. */
function cells(row: TablePerson, titles: string[]): Array<[string | null, string]> {
  const columns = columnsFor(null);
  const html = renderToStaticMarkup(createElement("table", null, createElement("tbody", null,
    createElement(PersonRow, { row, rank: 0, index: 0, columns, open: false, onOpen: () => {}, now: NOW }))));
  const tds = [...html.matchAll(/<td([^>]*)>(.*?)<\/td>/g)].map(([, attributes, inner]) =>
    [/title="([^"]*)"/.exec(attributes)?.[1] ?? null, inner.replace(/<[^>]+>/g, "")] as [string | null, string]);
  return titles.map((title) => tds[columns.findIndex((c) => c.title === title)]);
}

describe("the Table's First contact and Added", () => {
  it("shows the Melbourne day each was, with its time in the tooltip", () => {
    const row = person({ addedAt: Date.parse("2026-09-28T09:15:00+10:00"), firstContactAt: Date.parse("2019-03-02T23:40:00+11:00") });
    expect(cells(row, ["First contact", "Added"])).toEqual([["2019-03-02 23:40", "2019-03-02"], ["2026-09-28 09:15", "2026-09-28"]]);
  });

  it("says never for someone you were never in touch with", () => {
    expect(cells(person({}), ["First contact"])).toEqual([[null, "never"]]);
  });

  it("keeps both whatever platform is picked", () => {
    for (const platform of [null, "whatsapp", "phone"]) {
      expect(columnsFor(platform).map((c) => c.column)).toEqual(expect.arrayContaining(["firstContact", "added"]));
    }
  });
});
