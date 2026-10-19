// Untouched people (src/untouched.ts) in the people views: drawn muted in
// People's list, the Table and a group chat's members, and not
// otherwise; and a group chat's "Archive untouched": what it says it will do,
// the call it makes, and the chip that undoes it all at once.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupChat, GroupMember, PersonSummary, TablePerson } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { httpArchive } from "./archiveHttp.ts";
import { changeChip, archiveUntouched, type Chip } from "./changeChip.ts";
import { ChangeChipView } from "./demos/page.tsx";
import { columnsFor, PersonRow } from "./demos/Table.tsx";
import { GroupMembers } from "./GroupChat.tsx";
import { nameStyleStore } from "./names.ts";
import { PeopleList } from "./PeoplePanel.tsx";
import { ReadOnly } from "./readOnly.ts";
import { untouchedPlan } from "./untouched.ts";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");

const person = (id: number, name: string, untouched: boolean): PersonSummary => ({
  id, name, aliases: [], tags: [], note: "", noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null,
  edited: !untouched, untouched, archived: null, archiveRule: null, location: null,
  accounts: [{ id: id * 10, platform: "messenger", displayName: name, handle: null, link: "import", messageCount: 2, directMessageCount: 2, groupMessageCount: 0, lastMessageAt: NOW }],
  messageCount: 2, directMessageCount: 2, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: NOW, unknown: false, lastByPlatform: [], joined: null,
});

const member = (id: number, name: string, untouched: boolean, archived = false): GroupMember => ({ id, name, aliases: [], messages: 1, untouched, archived });

const group = (members: GroupMember[]): GroupChat => ({
  id: 75, title: "Footy", platform: "messenger", people: members.length + 1, members, fromMe: 3, messageCount: 9, firstMessageAt: NOW, lastMessageAt: NOW,
});

const footy = group([
  member(1, "Ada Sample", true),
  member(2, "Bo Example", false),
  member(3, "Cy Example", true),
  member(4, "Dee Example", false, true),
  member(5, "Eve Example", true, true),
]);

const draw = (element: ReturnType<typeof createElement>, readOnly = false) =>
  renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, element));
const chip = (html: string, name: string) => html.match(new RegExp(`<button[^>]*>${name}</button>`))?.[0] ?? "";

afterEach(() => {
  changeChip.dismiss();
  nameStyleStore.set("full");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the untouched in the people views", () => {
  it("are muted in a group chat's members, the archived faint, and everyone else as before", () => {
    const html = draw(createElement(GroupMembers, { group: footy, onOpenPerson: () => {} }));
    expect(chip(html, "Ada Sample")).toContain('class="group-chat__member group-chat__member--untouched"');
    expect(chip(html, "Ada Sample")).toContain('title="Untouched: you have never changed them');
    expect(chip(html, "Bo Example")).toContain('class="group-chat__member"');
    expect(chip(html, "Dee Example")).toContain('class="group-chat__member group-chat__member--archived"');
    // Archived wins: someone archived by the rules but untouched shows as archived.
    expect(chip(html, "Eve Example")).toContain("group-chat__member--archived");
  });

  it("are muted in People's list, with why on hover, and nobody else is", () => {
    const people = [person(1, "Ada Sample", true), person(2, "Bo Example", false)];
    const html = draw(createElement(PeopleList, { listing: { people, me: null, tags: [] }, onOpen: () => {} }));
    expect(html).toMatch(/<span class="person-label--untouched" title="Untouched: [^"]*">Ada Sample<\/span>/);
    expect(html.match(/person-label--untouched/g)).toHaveLength(1);
  });

  it("are dim in the Table, with why on hover, and nobody else is", () => {
    const row = (p: PersonSummary): TablePerson => ({
      id: p.id, name: p.name, aliases: p.aliases, tags: p.tags, note: p.note, identiconSeed: p.identiconSeed, identiconHue: p.identiconHue, location: null, unknown: false,
      untouched: p.untouched, archived: null, platforms: ["messenger"], messageCount: 2, directMessageCount: 2, groupMessageCount: 0, lastMessageAt: NOW, byPlatform: [], calls: null, addedAt: 1, firstContactAt: null, closeness: 1,
    });
    const table = (p: PersonSummary) => renderToStaticMarkup(createElement("table", null, createElement("tbody", null,
      createElement(PersonRow, { row: row(p), rank: 1, index: 0, columns: columnsFor(null), open: false, onOpen: () => {}, now: NOW }))));
    expect(table(person(1, "Ada Sample", true))).toMatch(/<td title="Untouched: [^"]*" class="people-table__untouched">/);
    expect(table(person(2, "Bo Example", false))).not.toContain("untouched");
  });
});

describe("Archive untouched in a group chat", () => {
  it("archives the untouched not archived yet, and leaves the members changed and those archived already", () => {
    expect(untouchedPlan(footy.members)).toEqual({ archive: [1, 3], skipped: 1, archivedAlready: 2 });
    expect(untouchedPlan([member(1, "Ada", false)])).toEqual({ archive: [], skipped: 1, archivedAlready: 0 });
  });

  it("is offered with how many while there is anyone to archive, and never on a read-only page", () => {
    const button = /<button[^>]*group-chat__archive-untouched[^>]*>Archive untouched \(2\)<\/button>/;
    expect(draw(createElement(GroupMembers, { group: footy, onOpenPerson: () => {} }))).toMatch(button);
    expect(draw(createElement(GroupMembers, { group: footy, onOpenPerson: () => {} }), true)).not.toContain("Archive untouched");
    const nobody = group([member(2, "Bo Example", false), member(4, "Dee Example", false, true)]);
    expect(draw(createElement(GroupMembers, { group: nobody, onOpenPerson: () => {} }))).not.toContain("Archive untouched");
  });

  it("sends who it showed, to the group's route", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ archived: 2, changeset: 41 }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await httpArchive.archiveUntouched(75, [1, 3])).toEqual({ archived: 2, changeset: 41 });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual(["/api/archive/groups/75/archive-untouched", "POST", JSON.stringify({ people: [1, 3] })]);
  });
});

describe("the chip after Archive untouched", () => {
  let api: { archiveUntouched: ReturnType<typeof vi.fn>; undoChange: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", new EventTarget());
    api = {
      archiveUntouched: vi.fn(async (_group: number, shown: number[]) => ({ archived: shown.length, changeset: shown.length > 0 ? 52 : null })),
      undoChange: vi.fn(async () => ({})),
    };
    provideArchive(api as unknown as ArchiveApi);
  });

  it("says how many were archived, and its one Undo undoes that one changeset", async () => {
    expect(await archiveUntouched(75, [1, 3, 6])).toBe(3);
    expect(api.archiveUntouched).toHaveBeenCalledWith(75, [1, 3, 6]);
    expect(changeChip.get()).toMatchObject({ what: { kind: "archived", who: 3 }, changeset: 52, phase: "shown" });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledTimes(1);
    expect(api.undoChange).toHaveBeenCalledWith(52);
    expect(changeChip.get()?.phase).toBe("undone");
  });

  it("shows nothing when nobody was archived", async () => {
    expect(await archiveUntouched(75, [])).toBe(0);
    expect(changeChip.get()).toBeNull();
  });

  it("is drawn with the count, whatever the name choice", () => {
    const drawn = (who: number, phase: Chip["phase"]) =>
      renderToStaticMarkup(createElement(ChangeChipView, { chip: { what: { kind: "archived", who }, changeset: 52, phase, reason: null }, onUndo: () => {}, onDismiss: () => {} }));
    expect(drawn(9, "shown")).toContain("Archived <strong>9 people</strong>");
    expect(drawn(9, "shown")).toContain(">Undo</button>");
    expect(drawn(9, "undoing")).toContain("Bringing back <strong>9 people</strong>…");
    expect(drawn(9, "undone")).toContain("<strong>9 people</strong> are back");
    expect(drawn(1, "undone")).toContain("<strong>1 person</strong> is back");
    nameStyleStore.set("hide");
    expect(drawn(9, "shown")).toContain("Archived <strong>9 people</strong>");
  });
});
