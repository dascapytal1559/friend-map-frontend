// The Table's Calls: its sorts, filters and search,
// what each cell says (whose a length is, unknown, where a call comes from),
// and its rows: when as a link to the Calendar's day, who as chips that open
// their chat at the call, a length and a note to set where a call takes
// them, nothing to set on a read-only page, notes hidden with the names;
// a red ✕ deleting a call logged alone. (Add call and the tab are in tableTabs.test.ts.)

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { GroupPerson, ListedCall } from "../archive.ts";
import { nameStyleStore, namesFor } from "../names.ts";
import { ReadOnly } from "../readOnly.ts";
import {
  answeredHint, answeredLabel, appsIn, CALL_SORT, callAnswer, callApp, callKey, filterCalls, heldCalls, lengthByHand, lengthHint, lengthLabel, loggedToDelete, nextCallSort, sortCalls,
} from "./callsTable.ts";
import { CallsTable } from "./CallsTable.tsx";

const N = { full: namesFor("full"), except: namesFor("except", new Set([2])) };

const ada: GroupPerson = { id: 2, name: "Ada Sample", aliases: ["Addy"] };
const bo: GroupPerson = { id: 3, name: "Bo Example", aliases: [] };
const cy: GroupPerson = { id: 4, name: "Cy Placeholder", aliases: [] };
const PEOPLE = new Map([ada, bo, cy].map((p) => [p.id, p]));

const at = (iso: string) => Date.parse(iso);
const base: Omit<ListedCall, "ref" | "at"> = {
  platform: "messenger", service: null, source: "record", direction: "incoming", answered: true, answeredSet: false, sourceAnswered: true, durationSeconds: 1500, length: "source",
  lengthEditable: false, people: [ada.id], others: 0, note: "",
};
/** The phone's call history, a Messenger call record, a WeChat one of no known length, one logged, and a WhatsApp three-way call. */
const LIST: ListedCall[] = [
  { ...base, ref: { kind: "call", id: 1 }, at: at("2026-09-01T18:00:00+10:00"), platform: "phone", service: "facetime-video", source: "history", direction: "outgoing", durationSeconds: 150 },
  { ...base, ref: { kind: "record", id: 2 }, at: at("2026-09-20T19:00:00+10:00"), people: [bo.id], note: "Planned the trip" },
  { ...base, ref: { kind: "record", id: 3 }, at: at("2026-09-10T19:00:00+10:00"), platform: "wechat", answered: null, sourceAnswered: null, durationSeconds: null, length: null, lengthEditable: true },
  { ...base, ref: { kind: "logged", id: 4 }, at: at("2026-09-15T20:15:00+10:00"), platform: "imessage", source: "logged", direction: null, durationSeconds: 240, length: "logged", lengthEditable: true, people: [cy.id] },
  { ...base, ref: { kind: "call", id: 5 }, at: at("2026-08-30T19:00:00+10:00"), platform: "whatsapp", service: "video", source: "app", answered: false, sourceAnswered: false, durationSeconds: 0, people: [cy.id, bo.id], others: 1 },
];
const keys = (list: readonly ListedCall[]) => list.map(callKey);
/** A chip in Who, as the markup has it: it opens their chat at the call. */
const chip = (name: string) => `<button type="button" class="tag-chip tag-chip--alias" title="Open their chat at this call">${name}</button>`;
const firstName = (call: ListedCall) => PEOPLE.get(call.people[0])!.name;

describe("the Calls' order", () => {
  it("starts newest first; a header sorts by it, again the other way round, when and length biggest first and the rest A to Z", () => {
    expect(keys(sortCalls(LIST, CALL_SORT, firstName))).toEqual(["record:2", "logged:4", "record:3", "call:1", "call:5"]);
    expect(nextCallSort(CALL_SORT, "at")).toEqual({ column: "at", descending: false });
    expect(nextCallSort(CALL_SORT, "length")).toEqual({ column: "length", descending: true });
    expect(nextCallSort(CALL_SORT, "who")).toEqual({ column: "who", descending: false });
    expect(keys(sortCalls(LIST, { column: "at", descending: false }, firstName))).toEqual(["call:5", "call:1", "record:3", "logged:4", "record:2"]);
  });

  it("keeps empty cells last either way round, and calls the same in the column newest first", () => {
    // Lengths: 1500, 240, 150, 0, and the WeChat call's not known, last both ways.
    expect(keys(sortCalls(LIST, { column: "length", descending: true }, firstName))).toEqual(["record:2", "logged:4", "call:1", "call:5", "record:3"]);
    expect(keys(sortCalls(LIST, { column: "length", descending: false }, firstName))).toEqual(["call:5", "call:1", "logged:4", "record:2", "record:3"]);
    expect(keys(sortCalls(LIST, { column: "note", descending: false }, firstName))[0]).toBe("record:2");
    expect(keys(sortCalls(LIST, { column: "answered", descending: false }, firstName))).toEqual(["record:2", "logged:4", "call:1", "call:5", "record:3"]);
    // Answered: the WeChat call's not known (empty), last both ways.
    expect(keys(sortCalls(LIST, { column: "answered", descending: true }, firstName))).toEqual(["call:5", "record:2", "logged:4", "call:1", "record:3"]);
    expect(keys(sortCalls(LIST, { column: "app", descending: false }, firstName))).toEqual(["logged:4", "call:1", "record:2", "record:3", "call:5"]);
    // Who, by the first named as the name choice names them: nobody named, last.
    const hidden = (call: ListedCall) => N.except.label(PEOPLE.get(call.people[0])!).primary;
    expect(keys(sortCalls(LIST, { column: "who", descending: false }, hidden)).slice(0, 2).sort()).toEqual(["call:1", "record:3"]);
  });

  it("holds the rows of a list as they were, as they are now, leaving out a call no longer there", () => {
    const now = LIST.map((call) => (call.ref.id === 2 ? { ...call, note: "Changed" } : call)).filter((call) => call.ref.id !== 5);
    const held = heldCalls(["call:5", "record:2", "call:1"], now);
    expect(keys(held)).toEqual(["record:2", "call:1"]);
    expect(held[0].note).toBe("Changed");
  });
});

describe("the Calls' filters and search", () => {
  const found = (filter: Partial<Parameters<typeof filterCalls>[1]>, names = N.full) =>
    keys(filterCalls(LIST, { shown: null, app: null, search: "", ...filter }, PEOPLE, names));

  it("keeps the calls with someone the query and Hide leave in, on the app picked", () => {
    expect(found({})).toEqual(keys(LIST));
    expect(found({ shown: new Set([bo.id]) })).toEqual(["record:2", "call:5"]);
    expect(found({ shown: new Set() })).toEqual([]);
    expect(found({ app: "Messenger" })).toEqual(["record:2"]);
    expect(found({ app: "FaceTime" })).toEqual(["call:1", "logged:4"]);
    expect(appsIn(LIST)).toEqual(["FaceTime", "Messenger", "WeChat", "WhatsApp"]);
  });

  it("finds a call by anyone on it, by name or alias, or by its note; while names are hidden, by the names of those picked alone", () => {
    expect(found({ search: "addy" })).toEqual(["call:1", "record:3"]);
    expect(found({ search: "example" })).toEqual(["record:2", "call:5"]);
    expect(found({ search: "the trip" })).toEqual(["record:2"]);
    expect(found({ search: "  " })).toEqual(keys(LIST));
    expect(found({ search: "ada" }, N.except)).toEqual(["call:1", "record:3"]);
    expect(found({ search: "example" }, N.except)).toEqual([]);
    expect(found({ search: "the trip" }, N.except)).toEqual([]);
  });
});

describe("what a call's cells say", () => {
  it("names the app, FaceTime from the call history's service; and whether it was answered", () => {
    expect(LIST.map(callApp)).toEqual(["FaceTime", "Messenger", "WeChat", "FaceTime", "WhatsApp"]);
    expect(callApp({ platform: "phone", service: "phone" })).toBe("Phone");
    expect(LIST.map(answeredLabel)).toEqual(["Yes", "Yes", "", "Yes", "No"]);
    expect(LIST.map((call) => callAnswer(call.answered))).toEqual(["answered", "answered", "unknown", "answered", "missed"]);
  });

  it("says whose Answered is: its source's, yours with what its source says, or yours for one logged", () => {
    expect(answeredHint(LIST[0])).toBe("The phone's call history says it was answered. Pick another to say otherwise; it counts toward closeness as you say");
    expect(answeredHint(LIST[2])).toBe("WeChat's own record of the call does not say. Pick another to say otherwise; it counts toward closeness as you say");
    expect(answeredHint({ ...LIST[1], answered: false, answeredSet: true })).toBe("You said it was not answered. Messenger's own record of the call says it was answered");
    expect(answeredHint({ ...LIST[4], answered: null, answeredSet: true })).toBe("You said it is not known. WhatsApp's list of calls says it was not answered");
    expect(answeredHint(LIST[3])).toBe("You logged it, so it was answered");
  });

  it("gives a length, marked by hand when you gave or logged it and not when its source says; none for one never answered or not known", () => {
    expect(LIST.map(lengthLabel)).toEqual(["3 min", "25 min", null, "4 min", null]);
    expect(LIST.map(lengthByHand)).toEqual([false, false, false, true, false]);
    expect(lengthByHand({ ...LIST[2], length: "given" })).toBe(true);
    expect(lengthHint(LIST[3])).toBe("Logged by hand");
    expect(lengthHint({ ...LIST[2], length: "given" })).toBe("Logged by hand, as WeChat does not say");
    expect(lengthHint(LIST[0])).toBe("From the phone's call history, as it is");
    expect(lengthHint(LIST[1])).toBe("From Messenger's own record of the call, as it is");
    expect(lengthHint(LIST[2])).toBe("WeChat does not say how long it was: give it a length, and it counts toward closeness");
    expect(lengthHint({ ...LIST[2], lengthEditable: false })).toBe("WeChat does not say how long it was");
    expect(lengthHint({ ...LIST[2], answered: false })).toBe("Not answered, so it has no length");
  });
});

describe("the Calls' rows", () => {
  afterEach(() => nameStyleStore.set("full"));
  /** Where each When links to, in the order drawn. */
  const linked: string[] = [];
  const navigate = (to: string) => {
    linked.push(to);
    return () => {};
  };
  const drawn = (list: readonly ListedCall[], readOnly = false, openId: number | null = null) => renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(CallsTable, {
    rows: list, sort: CALL_SORT, onSort: () => {}, people: PEOPLE, openId, onOpen: () => {}, onOpenAt: () => {}, navigate, onEdit: () => {}, top: 0,
  })));
  const row = (html: string, n: number) => html.split("<tr ")[n + 2];

  it("say when, who as chips (and the unnamed others), the app and where it comes from, answered, its length and its note", () => {
    linked.length = 0;
    const html = drawn(sortCalls(LIST, CALL_SORT, firstName));
    expect(html).toContain('<th scope="col" aria-sort="descending"><button type="button">When<span class="people-table__arrow" aria-hidden="true">↓</span></button></th>');
    const bos = row(html, 0);
    // When opens the Calendar at that Melbourne day, in place; Bo's chip opens Bo's chat at the call.
    expect(bos).toContain('<td class="when-cell"><a class="when-cell__open" href="/calendar?day=2026-09-20" title="Open the Calendar on Sunday 20 September 2026">20 Sept 2026<span class="people-table__secondary"> 7:00 pm</span></a></td>');
    expect(linked).toEqual(["/calendar?day=2026-09-20", "/calendar?day=2026-09-15", "/calendar?day=2026-09-10", "/calendar?day=2026-09-01", "/calendar?day=2026-08-30"]);
    expect(bos).toContain(chip("Bo Example"));
    expect(bos).toContain('<td title="Messenger: a call record in your chat with them">Messenger</td>');
    // Answered, on an imported call, a select saying whose it is; on one logged, the word.
    expect(bos).toMatch(/<select class="calls-table__answer" aria-label="Answered" title="Messenger&#x27;s own record of the call says it was answered\. [^"]*"><option value="answered" selected="">Yes<\/option><option value="missed">No<\/option><option value="unknown" aria-label="Not known"><\/option><\/select>/);
    expect(row(html, 1)).toContain('<td class="calls-table__answered" title="You logged it, so it was answered">Yes</td>');
    // An app's own length is shown as it is, with no mark (its tooltip says it is the app's), and is not set here.
    expect(bos).toContain('<td title="From Messenger&#x27;s own record of the call, as it is">25 min</td>');
    expect(bos).toContain('title="Planned the trip">Planned the trip</button>');
    // One whose app does not say: unknown, with Add length.
    expect(row(html, 2)).toContain('<span class="calls-table__add-length">Add length</span>');
    // One logged: its length to change, with the pencil.
    expect(row(html, 1)).toMatch(/<button type="button" class="people-table__cell-button" title="Logged by hand: click to change it">4 min<span class="calls-table__by-hand" role="img" aria-label="logged by hand"><svg [^>]*>.*?<\/svg><\/span><\/button>/);
    // One you gave a length: the same pencil, as on one logged.
    expect(drawn([{ ...LIST[2], durationSeconds: 600, answered: true, length: "given" }])).toContain('title="Logged by hand, as WeChat does not say: click to change it">10 min<span class="calls-table__by-hand"');
    // The three-way call: everyone named, the unnamed counted, missed, no length.
    const threeWay = row(html, 4);
    // Each one named is a chip of their own, opening their own chat at the call; the When has no list of them.
    expect(threeWay).toContain(`${chip("Cy Placeholder")}${chip("Bo Example")}`);
    expect(threeWay).toContain("+1 other");
    expect(threeWay).toContain('href="/calendar?day=2026-08-30"');
    expect(html).not.toContain("popover");
    expect(threeWay).toContain(">WhatsApp video</td>");
    expect(threeWay).toContain('<select class="calls-table__answer calls-table__answer--quiet" aria-label="Answered"');
    expect(threeWay).toContain('<option value="missed" selected="">No</option>');
    // One you set is marked; one that went out says No too.
    const set = drawn([{ ...LIST[0], answered: false, answeredSet: true }]);
    expect(set).toContain('class="calls-table__answer calls-table__answer--quiet calls-table__answer--set"');
    expect(set).toContain('<option value="missed" selected="">No</option>');
  });

  it("link When to the Calendar on a call with nobody named too, with no chip", () => {
    const html = drawn([{ ...sortCalls(LIST, CALL_SORT, firstName)[0], people: [], others: 2 }]);
    expect(html).toContain('<a class="when-cell__open" href="/calendar?day=2026-09-20"');
    expect(html).not.toContain("tag-chip");
    expect(html).toContain("+2 others");
  });

  it("change nothing on a read-only page, and hide notes (and do not offer them) with the names", () => {
    const readOnly = drawn(LIST, true);
    expect(readOnly).not.toContain("people-table__cell-button");
    expect(readOnly).not.toContain("<select");
    expect(readOnly).toContain('<td class="calls-table__answered people-table__secondary" title="WeChat&#x27;s own record of the call does not say. Pick another to say otherwise; it counts toward closeness as you say"></td>');
    expect(readOnly).toContain('<td title="Planned the trip">Planned the trip</td>');
    expect(readOnly).toContain('<td title="WeChat does not say how long it was: give it a length, and it counts toward closeness"><span class="people-table__none">unknown</span></td>');
    nameStyleStore.set("except");
    const hidden = drawn(LIST);
    expect(hidden).not.toContain("Planned the trip");
    expect(hidden).toContain('<td><span class="people-table__none">hidden</span></td>');
    expect(hidden).not.toContain(">Add</span>");
  });

  it("offer a red ✕ in the last column of a call logged alone, none on a read-only page", () => {
    const html = drawn(sortCalls(LIST, CALL_SORT, firstName));
    expect(html).toContain('<th scope="col" class="calls-table__delete-cell"><span class="visually-hidden">Delete</span></th></tr>');
    const deletes = html.split("<tr ").slice(2).map((r) => /<td class="calls-table__delete-cell"><button type="button" class="calls-table__delete" title="Delete this call" aria-label="Delete this call">✕<\/button><\/td><\/tr>/.test(r));
    // Newest first: the Messenger record, the call logged, the WeChat record, the call history's, the three-way call.
    expect(deletes).toEqual([false, true, false, false, false]);
    // Its own column: every row has the same seven cells, the App cell only the app.
    expect(row(html, 0).match(/<td/g)).toHaveLength(7);
    expect(row(html, 1)).toContain('<td title="FaceTime: you logged it">FaceTime</td>');
    const readOnly = drawn(LIST, true);
    expect(readOnly).not.toContain("Delete this call");
  });

  it("delete a logged call by its group, the chip naming its time, length, app and everyone on it", () => {
    expect(loggedToDelete(LIST[3])).toEqual({ id: 4, at: LIST[3].at, durationSeconds: 240, platform: "imessage", people: 1 });
    expect(loggedToDelete({ ...LIST[3], people: [ada.id, cy.id] })?.people).toBe(2);
    expect(LIST.filter((call) => call.ref.kind !== "logged").map(loggedToDelete)).toEqual([null, null, null, null]);
  });

  it("mark the rows of whoever's panel is open, and say when there are none", () => {
    const html = drawn(LIST, false, bo.id);
    expect(html.match(/people-table__open/g)).toHaveLength(2);
    expect(drawn([])).toContain("No calls here.");
  });
});
