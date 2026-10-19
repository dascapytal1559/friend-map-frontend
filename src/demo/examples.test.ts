// The Query bar's examples run over the made-up crowd, each matching
// someone, and are labelled as examples on the bar.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryBar, type QueryBarHandle } from "../demos/QueryBar.tsx";
import { initialQueryBar } from "../demos/queryBar.ts";
import { DemoArchive } from "./archive.ts";
import { EXAMPLES } from "./examples.ts";
import { generateDemo } from "./generate.ts";

const NOW = Date.parse("2026-10-01T12:00:00+10:00");
const archive = new DemoArchive(generateDemo(NOW));

describe("the example transcripts", () => {
  it("each run over the crowd and match someone, and differ from one another", () => {
    for (const example of EXAMPLES) expect([example.query, archive.runQuery(example.query).ids.length > 0]).toEqual([example.query, true]);
    expect(new Set(EXAMPLES.map((e) => e.query)).size).toBe(EXAMPLES.length);
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(5);
  });

  it("are offered on the bar in place of Generate, the box read-only and labelled as examples", () => {
    const bar: QueryBarHandle = { state: initialQueryBar(""), dispatch: () => {}, run: () => {}, generate: () => {}, clear: () => {}, only: null, hide: {}, requery: 0 };
    const html = renderToStaticMarkup(createElement(QueryBar, { bar, hide: null, examples: EXAMPLES }));
    expect(html).toMatch(/<textarea[^>]*aria-label="Transcript"[^>]*placeholder="Example transcripts"[^>]*readOnly=""/);
    expect(html).toContain('title="Examples: in the app you say what you want here, and a model writes the query"');
    expect(html).not.toContain("Generate");
    // One box, as in the app.
    expect(html.match(/<textarea/g)).toHaveLength(1);
  });
});
