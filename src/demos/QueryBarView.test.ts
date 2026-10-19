import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryBar, type QueryBarHandle } from "./QueryBar.tsx";
import { initialQueryBar, type QueryBarState } from "./queryBar.ts";

function render(state: Partial<QueryBarState>, count?: number): string {
  const bar: QueryBarHandle = {
    state: { ...initialQueryBar(""), ...state },
    dispatch: () => {},
    run: () => {},
    generate: () => {},
    clear: () => {},
    only: null,
    hide: {},
    requery: 0,
  };
  return renderToStaticMarkup(createElement(QueryBar, { bar, hide: createElement("span", null, "Hide"), count }));
}

/** The go buttons. */
const goButtons = (html: string) => [...html.matchAll(/<button[^>]*class="query-bar__go[^"]*"[^>]*>/g)].map((m) => m[0]);

const SQL = "SELECT person_id FROM people WHERE met = 'Toowoomba'";
const ON = { query: SQL, said: "people I met in Toowoomba", note: "" };

describe("the Query bar as drawn", () => {
  it("has one box, Query in natural language, then Hide: no Query box, arrow, ?, Tag panels or Generate buttons", () => {
    const html = render({});
    expect(html).toMatch(/<textarea[^>]*aria-label="Transcript"[^>]*placeholder="Query in natural language"/);
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).not.toMatch(/aria-label="Query"[^>]*placeholder|query-bar__arrow|→/);
    expect(html.indexOf("<span>Hide</span>")).toBeGreaterThan(html.search(/<textarea/));
    expect(html).not.toMatch(/>\?<|Tag panels|>Generate</);
  });

  it("never shows the query that ran, only the words it came from", () => {
    const html = render({ applied: ON, transcript: ON.said });
    expect(html).toContain(">people I met in Toowoomba</textarea>");
    expect(html).not.toContain("SELECT");
  });

  it("puts a go button in the box, a tick, pressable only with words in it, and busy while Generate waits", () => {
    const [empty] = goButtons(render({}));
    expect(goButtons(render({}))).toHaveLength(1);
    expect(empty).toContain('disabled=""');
    expect(empty).toContain('title="Show who this says: a model writes the query and runs it"');
    expect(goButtons(render({ transcript: "the climbers" }))[0]).not.toContain("disabled");
    expect(goButtons(render({ transcript: "\n" }))[0]).toContain('disabled=""');
    const waiting = goButtons(render({ generating: true, transcript: "x" }))[0];
    expect(waiting).toContain("query-bar__go--busy");
    expect(waiting).toContain('disabled=""');
    expect(waiting).toContain('title="Generating…"');
  });

  it("shows × while the box holds words or a query is on, to go back to everyone", () => {
    expect(render({})).not.toContain("query-bar__clear");
    expect(render({ transcript: "the climbers" })).toContain('title="Clear: everyone shows"');
    // A query kept from an older page, with no words, can still be cleared.
    expect(render({ applied: { query: "met:toowoomba", said: "", note: "" } })).toContain('title="Clear: everyone shows"');
  });

  it("edges the box while a query is on, says how many match (no Undo: × clears), and shows errors as alerts", () => {
    expect(render({ applied: ON, transcript: ON.said })).toContain("query-bar__transcript query-bar__transcript--on");
    expect(render({})).not.toContain("query-bar__transcript--on");
    const ran = render({ applied: ON, transcript: ON.said, status: { kind: "info", text: "40 people match. Not in the query: who are tall.", from: "run" } });
    expect(ran).toMatch(/role="status">40 people match\. Not in the query: who are tall\.<\/p>/);
    expect(ran).not.toContain("Undo");
    const failed = render({ status: { kind: "error", text: "SQL: no such table: peple", from: "run" } });
    expect(failed).toContain('role="alert">SQL: no such table: peple</p>');
  });

  it("turns red (the box and Hide, through query-bar--failed) only while a query has failed or been refused", () => {
    expect(render({})).toMatch(/<div class="query-bar" role="search"/);
    const refused = render({ failed: ON, status: { kind: "error", text: "20,120 people match ; ask for fewer or hide more in the Table: the limit is 1,000.", from: "run" } });
    expect(refused).toMatch(/<div class="query-bar query-bar--failed" role="search"/);
    expect(refused).toContain('role="alert"');
    // Hide sits inside the bar, so the red reaches it (demos.css).
    expect(refused.indexOf("<span>Hide</span>")).toBeGreaterThan(refused.indexOf("query-bar--failed"));
  });
});

describe("the Query bar's line with a count (the map views)", () => {
  it("says how many are shown while everyone shows, in place of nothing or Everyone shows", () => {
    expect(render({}, 702)).toMatch(/role="status">702 people<\/p>/);
    expect(render({}, 1)).toMatch(/role="status">1 person<\/p>/);
    expect(render({}, 1234)).toContain(">1,234 people<");
    const undone = render({ status: { kind: "info", text: "Cleared: everyone shows.", from: "clear" } }, 702);
    expect(undone).toMatch(/role="status">702 people<\/p>/);
    expect(undone).not.toContain("everyone shows");
  });

  it("keeps what a query matched, and an error, over the count", () => {
    const ran = render({ applied: ON, transcript: ON.said, status: { kind: "info", text: "12 people match.", from: "run" } }, 12);
    expect(ran).toContain(">12 people match.<");
    const failed = render({ failed: ON, status: { kind: "error", text: "no such column", from: "run" } }, 702);
    expect(failed).toContain(">No such column<");
    expect(failed).not.toContain("702");
  });

  it("says nothing without a count, as on the Table", () => {
    expect(render({})).not.toContain("query-bar__status");
  });
});
