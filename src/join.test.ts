import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonSummary } from "./archive.ts";
import { httpArchive } from "./archiveHttp.ts";
import { joinCandidates } from "./names.ts";
import { PersonView } from "./PeoplePanel.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("Join person", () => {
  it("joins the open person into the one picked, which is kept", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 7 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const survivor = await httpArchive.join(3, 7);
    expect(survivor).toEqual({ id: 7 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/archive/people/7/merge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ with: 3 });
  });

  it("offers people by name or alias, archived ones too (last), never the open person", () => {
    const everyone = [
      { id: 1, name: "Alexia L", aliases: [], archived: null },
      { id: 2, name: "Alexia L.", aliases: [], archived: "you" },
      { id: 3, name: "Sasha", aliases: ["Alex"], archived: null },
      { id: 4, name: "Bruno", aliases: [], archived: null },
    ];
    expect(joinCandidates(1, everyone, "alex").map((p) => p.id)).toEqual([3, 2]);
    expect(joinCandidates(1, everyone, " a ")).toEqual([]);
    expect(joinCandidates(1, everyone, "ALEXIA").map((p) => p.id)).toEqual([2]);
  });

  it("offers archived people after everyone else, before the limit", () => {
    const sam = (id: number, archived: "you" | "unknown" | null) => ({ id, name: `Sam ${id}`, aliases: [], archived });
    const everyone = [
      sam(1, "you"), sam(2, "unknown"), sam(3, null), sam(4, "you"), sam(5, null),
      sam(6, "you"), sam(7, "you"), sam(8, null), sam(9, "you"), sam(10, null),
    ];
    expect(joinCandidates(0, everyone, "sam").map((p) => p.id)).toEqual([3, 5, 8, 10, 1, 2]);
    expect(joinCandidates(0, everyone, "sam", 3).map((p) => p.id)).toEqual([3, 5, 8]);
    expect(joinCandidates(5, everyone, "sam", 10).map((p) => p.id)).toEqual([3, 8, 10, 1, 2, 4, 6, 7, 9]);
  });

  it("is offered for a deleted or unknown account, archived by the rules or not", () => {
    const deleted: PersonSummary = {
      id: 5, name: "Instagram User", aliases: [], tags: [], note: "", noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null,
      edited: false, untouched: false, archived: "unknown", archiveRule: "unknown", location: null,
      accounts: [{
        id: 50, platform: "instagram", displayName: "Instagram User", handle: null, link: "import",
        messageCount: 2, directMessageCount: 2, groupMessageCount: 0, lastMessageAt: 1,
      }],
      messageCount: 2, directMessageCount: 2, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: 1,
      unknown: true, lastByPlatform: [], joined: null,
    };
    const panel = (person: PersonSummary) =>
      renderToStaticMarkup(createElement(PersonView, { person, tagNames: [], locations: undefined, onMerged: () => {}, onOpenPerson: () => {} }));
    for (const person of [deleted, { ...deleted, tags: ["keep"], archived: null }]) expect(panel(person)).toContain(">Join person</button>");
  });

  it("sits at the right of the Accounts heading, closed to start, with no Fix heading", () => {
    const html = renderToStaticMarkup(createElement(PersonView, {
      person: {
        id: 6, name: "Ada", aliases: [], tags: [], note: "", noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a2", identiconHue: null,
        edited: false, untouched: false, archived: null, archiveRule: null, location: null, accounts: [],
        messageCount: 0, directMessageCount: 0, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: null,
        unknown: false, lastByPlatform: [], joined: null,
      },
      tagNames: [], locations: undefined, onMerged: () => {}, onOpenPerson: () => {},
    }));
    expect(html).toMatch(/<span class="field__head"><button[^>]*aria-expanded="false"[^>]*><span aria-hidden="true">▸<\/span> Accounts · 0<\/button><span class="join-person"><button[^>]*>Join person<\/button>/);
    expect(html.indexOf("Join person")).toBeGreaterThan(html.indexOf(">Tags</span>"));
    expect(html).not.toContain("<span>Fix</span>");
    // Hangouts sit in Events, below the chart; no help text under Tags.
    expect(html.indexOf("Hangouts</button>")).toBeGreaterThan(html.indexOf("activity-chart"));
    expect(html.indexOf("activity-chart")).toBeGreaterThan(html.indexOf("<h3>Events</h3>"));
    expect(html).not.toContain("field__hint");
  });

  it("shows the icon beside the Names + label, one button, and a chip for each name, their name first", () => {
    const base = {
      id: 6, name: "Ada", aliases: [] as string[], tags: [], note: "", noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a2", identiconHue: null,
      edited: false, untouched: false, archived: null, archiveRule: null, location: null, accounts: [],
      messageCount: 0, directMessageCount: 0, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: null,
      unknown: false, lastByPlatform: [], joined: null,
    };
    const panel = (aliases: string[]) =>
      renderToStaticMarkup(createElement(PersonView, { person: { ...base, aliases }, tagNames: [], locations: undefined, onMerged: () => {}, onOpenPerson: () => {} }));
    const one = panel([]);
    // The label is the button: its words, then the + alone green.
    expect(one).toMatch(
      /<span class="field__head field__head--name"><button type="button" class="add-name-open" aria-label="Names: add a name"[^>]*>Names<span class="add-name-open__plus" aria-hidden="true">\+<\/span><\/button><\/span>/,
    );
    // The box opens only from the label.
    expect(one).not.toContain('placeholder="add new name"');
    expect(one).not.toContain("Also known as");
    expect(one).not.toContain('aria-label="Name"');
    // The last name left has no ×.
    expect(one).not.toContain("Remove the name");
    const three = panel(["Addy", "Ada S"]);
    const at = (text: string) => three.indexOf(text);
    // The icon in a column of its own, then the Names line above the chips.
    expect(three).toMatch(/<div class="field names-field person-name"><span class="icon-picker"/);
    expect(at('aria-label="Change their icon"')).toBeLessThan(at('<span class="person-name__names">'));
    expect(at('aria-label="Names: add a name"')).toBeLessThan(at('class="name-chip name-chip--first"'));
    // Round, as Orbits draws them.
    expect(three).toMatch(/aria-label="Change their icon"[^>]*><svg class="identicon identicon--round"/);
    expect(three).toMatch(/class="name-chip name-chip--first"[^>]*>Ada<button[^>]*aria-label="Remove the name Ada"/);
    // Each chip, their name too, says a click changes it.
    expect(three.match(/title="[^"]*Click to change;/g)).toHaveLength(3);
    expect(at(">Ada<")).toBeLessThan(at(">Addy<"));
    expect(at(">Addy<")).toBeLessThan(at(">Ada S<"));
  });
});
