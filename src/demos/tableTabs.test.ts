// The Table's tabs: People, Hangouts and Calls as real tabs, the chosen one in the address (and remembered for an
// address that names none), and a header showing only what acts on the tab's list: Add person and Tags with People,
// Add hangout with Hangouts, Add call and the app picker with Calls, the Query bar with People and Calls, and Changes
// and the People panel's button on all three; on a read-only page, none of the adds.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { provideArchive, type ArchiveApi } from "../archiveApi.ts";
import { ReadOnly } from "../readOnly.ts";
import { browser } from "./addressChoice.test.ts";
import { AddEvent } from "./AddEvent.tsx";
import { loadTableRows, saveTableRows, searchWithTab, tabInSearch } from "./tableRows.ts";
import { TablePage } from "./TablePage.tsx";

afterEach(() => vi.unstubAllGlobals());

/** An archive that never answers: the page as it first draws, loading. */
provideArchive(new Proxy({}, { get: () => () => new Promise(() => {}) }) as ArchiveApi);

/** The Table drawn at `/table` with `search`, on a read-only page or not. */
function page(search: string, readOnly = false) {
  browser("/table", search);
  return renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(TablePage, { navigate: () => () => {} })));
}

/** Each tab's words and whether it is the chosen one. */
const tabs = (html: string) => [...html.matchAll(/<button[^>]*role="tab"[^>]*aria-selected="(true|false)"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[2], m[1]]);
/** The header's buttons, by their words. */
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);

describe("the Table's tabs", () => {
  it("are a tablist of People, Hangouts and Calls, the address's tab chosen and alone in the Tab order", () => {
    const html = page("?tab=hangouts");
    expect(html).toContain('role="tablist"');
    expect(tabs(html)).toEqual([["People", "false"], ["Hangouts", "true"], ["Calls", "false"]]);
    expect(html).toMatch(/id="table-tab-catch-ups"[^>]*aria-controls="table-list"[^>]*tabindex="0"/);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html).toContain('role="tabpanel" id="table-list" aria-labelledby="table-tab-catch-ups"');
  });

  it("read the tab from the address, the rest of the query kept when one is written in", () => {
    expect(tabInSearch("?tab=calls")).toBe("calls");
    expect(tabInSearch("?tab=hangouts")).toBe("catch-ups");
    expect(tabInSearch("?tab=people")).toBe("people");
    expect(tabInSearch("?tab=catch-ups")).toBeNull();
    expect(tabInSearch("")).toBeNull();
    expect(searchWithTab("?x=1", "catch-ups")).toBe("?x=1&tab=hangouts");
    expect(searchWithTab("?tab=calls", "people")).toBe("?tab=people");
  });

  it("open the tab last chosen in this browser when the address names none", () => {
    const items = new Map<string, string>();
    const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
    saveTableRows("calls", () => storage);
    expect(loadTableRows(() => storage)).toBe("calls");
    items.set("friend-map.tableRows", "something else");
    expect(loadTableRows(() => storage)).toBe("people");
    expect(tabs(page(""))[0]).toEqual(["People", "true"]);
  });
});

describe("the Table's header, by tab", () => {
  it("on People: Add person, Tags (once loaded), Changes and the Query bar; no Add hangout, Add call or app picker", () => {
    const html = page("?tab=people");
    expect(buttons(html)).toEqual(expect.arrayContaining(["Add person", "Changes", "People"]));
    expect(buttons(html)).not.toEqual(expect.arrayContaining(["Add call"]));
    expect(html).not.toContain("Add hangout");
    expect(html).toContain('aria-label="Find a person"');
    expect(html).toContain("query-bar");
    expect(html).not.toContain('aria-label="App"');
  });

  it("on Hangouts: Add hangout and Changes; no Add person, Tags, Add call or Query bar", () => {
    const html = page("?tab=hangouts");
    expect(buttons(html)).toEqual(expect.arrayContaining(["Add hangout", "Changes", "People"]));
    for (const gone of ["Add person", "Tags", "Add call"]) expect(buttons(html)).not.toContain(gone);
    expect(html).toContain('aria-label="Find a hangout by who or note"');
    expect(html).not.toContain("query-bar");
  });

  it("on Calls: Add call, Changes and the Query bar; no Add person, Tags or Add hangout", () => {
    const html = page("?tab=calls");
    expect(buttons(html)).toEqual(expect.arrayContaining(["Add call", "Changes", "People"]));
    for (const gone of ["Add person", "Tags", "Add hangout"]) expect(buttons(html)).not.toContain(gone);
    expect(html).toContain('aria-label="Find a call by who or note"');
    expect(html).toContain("query-bar");
  });

  it("on a read-only page, no adds and no Changes on any tab", () => {
    for (const tab of ["people", "hangouts", "calls"]) {
      const shown = buttons(page(`?tab=${tab}`, true));
      for (const gone of ["Add person", "Add hangout", "Add call", "Tags", "Changes"]) expect(shown).not.toContain(gone);
    }
  });
});

describe("Add hangout and Add call", () => {
  it("are closed to start, each named for its kind", () => {
    for (const [kind, words] of [["hangout", "Add hangout"], ["call", "Add call"]] as const) {
      const html = renderToStaticMarkup(createElement(AddEvent, { kind }));
      expect(html).toContain('aria-expanded="false"');
      expect(html).toContain(`>${words}</button>`);
      expect(html).not.toContain("<form");
    }
  });
});
