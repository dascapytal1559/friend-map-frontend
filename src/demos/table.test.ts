import { describe, expect, it } from "vitest";
import { LIVE_TOGETHER_TAG, type TablePerson } from "../archive.ts";
import { namesFor, type NameStyle } from "../names.ts";
import { hides } from "./hideChoices.ts";
import { DEFAULT_SORT, filterRows, nextSort, platformsIn, sortRows, sortShown, type TableFilter, type TableSort } from "./table.ts";

function person(id: number, fields: Partial<TablePerson> = {}): TablePerson {
  return {
    id,
    name: `Person named ${id}`,
    aliases: [],
    identiconSeed: "00000000000000a1", identiconHue: null,
    tags: [],
    note: "",
    location: null,
    unknown: false,
    untouched: false,
    archived: null,
    platforms: [],
    messageCount: 0,
    directMessageCount: 0,
    groupMessageCount: 0,
    lastMessageAt: null,
    byPlatform: [], calls: null, addedAt: 1, firstContactAt: null,
    closeness: 0,
    ...fields,
  };
}

// The Table starts with archive and commercial on in Hide; most tests show everyone.
const START: TableFilter = { hide: {}, search: "" };
const EVERYONE: TableFilter = { ...START, hide: { archive: false, commercial: false } };

const PEOPLE = [
  person(1, { name: "Ada Fictional", aliases: ["Addy"], tags: ["climbing"], closeness: 5, messageCount: 40, directMessageCount: 30, lastMessageAt: 300, note: "met at the gym", location: "Toowoomba" }),
  person(2, { name: "bruno", tags: ["archive"], archived: "you", closeness: 9, messageCount: 12, directMessageCount: 2, lastMessageAt: 100 }),
  // Archived by the rules: "archive" too, as the server gives it (tagsWithRule).
  person(3, { name: "Cleo", tags: ["archive"], archived: "groups-silent", closeness: 0.5, messageCount: 3 }),
  person(4, { name: "Dev", tags: ["commercial", "keep"], closeness: 2, messageCount: 7, directMessageCount: 7, lastMessageAt: 200, location: "Sydney" }),
  person(5, { name: "", tags: ["archive"], archived: "no-name" }),
];

function table(filter: TableFilter, sort: TableSort = DEFAULT_SORT, style: NameStyle = "full") {
  const names = namesFor(style);
  const filtered = filterRows(PEOPLE, filter, names);
  return { ...filtered, rows: sortRows(filtered.rows, sort, names) };
}
const ids = (filter: TableFilter, sort = DEFAULT_SORT, names: NameStyle = "full") => table(filter, sort, names).rows.map((r) => r.id);

describe("the Table view's rows", () => {
  it("starts on everyone Hide leaves, closest first, and lists every tag, the defaults on", () => {
    const start = table(START);
    // bruno is archived, Cleo and the nameless 5 archived by the rules, Dev commercial.
    expect(start.rows.map((r) => r.id)).toEqual([1]);
    expect(start.everyone.length).toBe(5);
    expect(start.hideEntries.map((t) => [t.tag, t.count, hides({}, t.tag)])).toEqual([
      ["climbing", 1, false], ["keep", 1, false], ["archive", 3, true], ["commercial", 1, true],
    ]);
    // Shown, the rules' archive comes in by closeness, nobody with no score last.
    const everyone = table(EVERYONE);
    expect(everyone.rows.map((r) => r.id)).toEqual([2, 1, 4, 3, 5]);
    expect(everyone.rows.map((r) => everyone.ranks.get(r.id))).toEqual([1, 2, 3, 4, undefined]);
  });

  it("puts whoever you live with closest of all, ahead of any score, and by score again once untagged", () => {
    const home = [
      ...PEOPLE.slice(0, 4),
      person(6, { name: "Ada Sample", tags: [LIVE_TOGETHER_TAG], closeness: 0.1 }),
      person(7, { name: "Bruno Placeholder", tags: [LIVE_TOGETHER_TAG] }),
    ];
    const filtered = filterRows(home, EVERYONE);
    const closest = sortRows(filtered.rows, DEFAULT_SORT);
    expect(closest.map((r) => [r.id, filtered.ranks.get(r.id)])).toEqual([[6, 1], [7, 2], [2, 3], [1, 4], [4, 5], [3, 6]]);
    // Turned round, they are last: still the closest.
    expect(sortRows(filtered.rows, { column: "closeness", descending: false }).map((r) => r.id)).toEqual([3, 4, 1, 2, 7, 6]);
    const untagged = home.map((p) => ({ ...p, tags: p.tags.filter((t) => t !== LIVE_TOGETHER_TAG) }));
    const again = filterRows(untagged, EVERYONE);
    expect(sortRows(again.rows, DEFAULT_SORT).map((r) => [r.id, again.ranks.get(r.id)])).toEqual([[2, 1], [1, 2], [4, 3], [3, 4], [6, 5], [7, undefined]]);
  });

  it("hides by any tag, archive and keep too, ranking over who is left", () => {
    // Ticking archive hides everyone archived, by you (bruno) or the rules (Cleo, 5): one archive.
    const left = table({ ...EVERYONE, hide: { ...EVERYONE.hide, archive: true } });
    expect(left.rows.map((r) => [r.id, left.ranks.get(r.id)])).toEqual([[1, 1], [4, 2]]);
    expect(ids({ ...EVERYONE, hide: { ...EVERYONE.hide, keep: true } })).toEqual([2, 1, 3, 5]);
    // Unticking archive alone shows them all.
    expect(ids({ ...START, hide: { archive: false } })).toEqual([2, 1, 3, 5]);
  });

  it("takes the query's matches first, then Hide and the search, ranking and counting tags over the matches", () => {
    // The query matches bruno, Cleo and Dev; Hide still takes Dev with archive unticked and commercial on.
    const view = table({ ...START, hide: { archive: false }, only: new Set([2, 3, 4]) });
    expect(view.rows.map((r) => [r.id, view.ranks.get(r.id)])).toEqual([[2, 1], [3, 2]]);
    expect(view.everyone.length).toBe(5);
    expect(view.hideEntries.map((t) => [t.tag, t.count])).toEqual([
      ["keep", 1], ["archive", 2], ["commercial", 1],
    ]);
    expect(ids({ ...EVERYONE, only: new Set([2, 3, 4]), search: "dev" })).toEqual([4]);
    expect(ids({ ...EVERYONE, only: new Set() })).toEqual([]);
    expect(ids({ ...EVERYONE, only: null })).toEqual([2, 1, 4, 3, 5]);
  });

  it("finds people by name, alias or note, whatever the map shows, No name too", () => {
    expect(ids({ ...EVERYONE, search: "addy" })).toEqual([1]);
    expect(ids({ ...EVERYONE, search: "GYM" })).toEqual([1]);
    // The search does not change the ranks.
    expect(table({ ...EVERYONE, search: "dev" }).ranks.get(4)).toBe(3);
    for (const style of ["first", "initial", "hide"] as NameStyle[]) {
      expect([style, ids({ ...EVERYONE, search: "addy" }, DEFAULT_SORT, style)]).toEqual([style, [1]]);
      expect([style, ids({ ...EVERYONE, search: "gym" }, DEFAULT_SORT, style)]).toEqual([style, [1]]);
    }
  });

  it("with No name except… finds only those picked, by name alone, and sorts everyone else last, unnamed", () => {
    const picked = namesFor("except", new Set([1, 4]));
    const found = (search: string) => filterRows(PEOPLE, { ...EVERYONE, search }, picked).rows.map((r) => r.id);
    expect(found("ada")).toEqual([1]);
    expect(found("dev")).toEqual([4]);
    // Anyone not picked, or by alias, note or location, nobody.
    for (const search of ["bruno", "cleo", "addy", "gym", "toowoomba"]) expect([search, found(search)]).toEqual([search, []]);
    const sorted = sortRows(filterRows(PEOPLE, EVERYONE, picked).rows, { column: "name", descending: false }, picked).map((r) => r.id);
    expect(sorted).toEqual([1, 4, 2, 3, 5]);
  });

  it("finds Chinese, Japanese and Korean anywhere in a name, alias, note or location, one character or more", () => {
    const rows = [
      person(1, { name: "周 伟", aliases: ["伟哥"] }),
      person(2, { name: "Ryan 周", location: "上海" }),
      person(3, { name: "さくら", note: "김민준の友達" }),
    ];
    const found = (search: string) => filterRows(rows, { ...START, search }).rows.map((r) => r.id);
    expect(found("周")).toEqual([1, 2]);
    expect(found("周伟")).toEqual([1]);
    expect(found("哥")).toEqual([1]);
    expect(found("上海")).toEqual([2]);
    expect(found("く")).toEqual([3]);
    expect(found("김")).toEqual([3]);
  });

  it("finds people by location, but not while names are hidden", () => {
    expect(ids({ ...EVERYONE, search: "toowoomba" })).toEqual([1]);
    expect(ids({ ...EVERYONE, search: "SYDNEY" })).toEqual([4]);
    expect(ids({ ...EVERYONE, search: "toowoomba" }, DEFAULT_SORT, "except")).toEqual([]);
  });

  it("sorts by any column either way, empty cells last both ways, ties by name", () => {
    // Labels, case aside: Addy (alias first), bruno, Cleo, Dev; the unnamed last.
    expect(ids(EVERYONE, { column: "name", descending: false })).toEqual([1, 2, 3, 4, 5]);
    expect(ids(EVERYONE, { column: "name", descending: true })).toEqual([4, 3, 2, 1, 5]);
    expect(ids(EVERYONE, { column: "messages", descending: true })).toEqual([1, 2, 4, 3, 5]);
    // Direct leaves out group chats: bruno's 12 are mostly group messages.
    expect(ids(EVERYONE, { column: "direct", descending: true })).toEqual([1, 4, 2, 3, 5]);
    expect(nextSort(DEFAULT_SORT, "direct")).toEqual({ column: "direct", descending: true });
    expect(ids(EVERYONE, { column: "last", descending: false })).toEqual([2, 4, 1, 3, 5]);
    expect(ids(EVERYONE, { column: "last", descending: true })).toEqual([1, 4, 2, 3, 5]);
    // The rules' archive sorts as archive, as it shows.
    expect(ids(EVERYONE, { column: "tags", descending: false })).toEqual([2, 3, 5, 1, 4]);
    expect(ids(EVERYONE, { column: "note", descending: false })).toEqual([1, 2, 3, 4, 5]);
    expect(ids(EVERYONE, { column: "location", descending: false })).toEqual([4, 1, 2, 3, 5]);
    expect(ids(EVERYONE, { column: "location", descending: true })).toEqual([1, 4, 2, 3, 5]);
    expect(nextSort(DEFAULT_SORT, "location")).toEqual({ column: "location", descending: false });
  });

  it("sorts by when they were added, newest first to start, so whoever an import just brought in is at the top", () => {
    const added = PEOPLE.map((p, i) => ({ ...p, addedAt: [500, 100, 400, 100, 300][i] }));
    const sorted = (sort: TableSort) => sortRows(filterRows(added, EVERYONE).rows, sort).map((p) => p.id);
    expect(nextSort(DEFAULT_SORT, "added")).toEqual({ column: "added", descending: true });
    // Ties (bruno and Dev, in the same import) by name.
    expect(sorted({ column: "added", descending: true })).toEqual([1, 3, 5, 2, 4]);
    expect(sorted({ column: "added", descending: false })).toEqual([2, 4, 5, 3, 1]);
  });

  it("sorts by first contact, newest first to start, nobody ever in touch last both ways", () => {
    const first = PEOPLE.map((p, i) => ({ ...p, firstContactAt: [20, null, 50, 10, null][i] }));
    const sorted = (sort: TableSort) => sortRows(filterRows(first, EVERYONE).rows, sort).map((p) => p.id);
    expect(nextSort(DEFAULT_SORT, "firstContact")).toEqual({ column: "firstContact", descending: true });
    expect(sorted({ column: "firstContact", descending: true })).toEqual([3, 1, 4, 2, 5]);
    expect(sorted({ column: "firstContact", descending: false })).toEqual([4, 1, 3, 2, 5]);
  });

  it("sorts names as the Table shows them, the map's choices aside, so the order gives no hidden name away", () => {
    for (const style of ["first", "initial", "hide"] as NameStyle[]) {
      expect([style, ids(EVERYONE, { column: "name", descending: true }, style)]).toEqual([style, [4, 3, 2, 1, 5]]);
    }
    // No name except…, nobody picked: everyone unnamed, so by id; and notes do not sort while hidden.
    expect(ids(EVERYONE, { column: "name", descending: true }, "except")).toEqual([1, 2, 3, 4, 5]);
    expect(ids(EVERYONE, { column: "note", descending: true }, "except")).toEqual([1, 2, 3, 4, 5]);
  });

  it("turns a sorted column round, and starts numbers biggest first and words A to Z", () => {
    expect(nextSort(DEFAULT_SORT, "closeness")).toEqual({ column: "closeness", descending: false });
    expect(nextSort(DEFAULT_SORT, "name")).toEqual({ column: "name", descending: false });
    expect(nextSort({ column: "name", descending: false }, "last")).toEqual({ column: "last", descending: true });
  });
});

describe("the Table with a platform picked", () => {
  const counts = (platform: string, direct: number, group: number, last: number | null) =>
    ({ platform, messageCount: direct + group, directMessageCount: direct, groupMessageCount: group, lastMessageAt: last });
  const ON = [
    // Mostly Messenger, a little WhatsApp.
    person(1, { name: "Ada", closeness: 5, platforms: ["messenger", "whatsapp"], messageCount: 105, directMessageCount: 95, groupMessageCount: 10, lastMessageAt: 300, byPlatform: [counts("messenger", 90, 10, 300), counts("whatsapp", 5, 0, 120)] }),
    // WhatsApp only, in groups.
    person(2, { name: "Bea", closeness: 9, platforms: ["whatsapp"], messageCount: 40, groupMessageCount: 40, lastMessageAt: 200, byPlatform: [counts("whatsapp", 0, 40, 200)] }),
    // Messenger only.
    person(3, { name: "Cal", closeness: 2, tags: ["work"], platforms: ["messenger"], messageCount: 7, directMessageCount: 7, lastMessageAt: 250, byPlatform: [counts("messenger", 7, 0, 250)] }),
    // An account on WhatsApp with nothing said there yet.
    person(4, { name: "Dot", tags: ["work"], platforms: ["whatsapp"], byPlatform: [counts("whatsapp", 0, 0, null)] }),
    // Added by hand: no account anywhere.
    person(5, { name: "Eve", closeness: 1 }),
  ];
  const on = (platform: string | null, filter: Partial<TableFilter> = {}) => filterRows(ON, { ...EVERYONE, platform, ...filter });
  const sorted = (platform: string | null, sort: TableSort) => sortRows(on(platform).rows, sort).map((p) => p.id);

  it("with all platforms lists everyone with their whole counts, as before", () => {
    const all = on(null);
    expect(all.everyone.length).toBe(5);
    expect(all.rows).toEqual(ON);
    expect(filterRows(ON, EVERYONE)).toEqual(all);
  });

  it("lists only people with an account there, counted there alone; closeness stays whole", () => {
    const whatsapp = on("whatsapp");
    expect(whatsapp.everyone.length).toBe(3);
    expect(whatsapp.rows.map((p) => p.id).sort()).toEqual([1, 2, 4]);
    expect(whatsapp.rows.find((p) => p.id === 1)).toMatchObject({ messageCount: 5, directMessageCount: 5, groupMessageCount: 0, lastMessageAt: 120, closeness: 5 });
    // Ranked by closeness among the people on it.
    expect([...whatsapp.ranks]).toEqual([[2, 1], [1, 2]]);
    // The people given are left as they were.
    expect(ON[0].messageCount).toBe(105);
  });

  it("sorts Messages, Direct and Last message by that platform's counts, empty cells last", () => {
    expect(sorted(null, { column: "messages", descending: true })).toEqual([1, 2, 3, 4, 5]);
    expect(sorted("whatsapp", { column: "messages", descending: true })).toEqual([2, 1, 4]);
    expect(sorted("whatsapp", { column: "direct", descending: true })).toEqual([1, 2, 4]);
    expect(sorted("whatsapp", { column: "last", descending: true })).toEqual([2, 1, 4]);
    expect(sorted("whatsapp", { column: "last", descending: false })).toEqual([1, 2, 4]);
    expect(sorted("messenger", { column: "last", descending: true })).toEqual([1, 3]);
  });

  it("then takes the query, Hide and the search as ever, counting Hide's tags over the platform's people", () => {
    expect(on("whatsapp", { only: new Set([1, 3, 4]) }).rows.map((p) => p.id).sort()).toEqual([1, 4]);
    const hidden = on("whatsapp", { hide: { archive: false, commercial: false, work: true } });
    expect(hidden.rows.map((p) => p.id).sort()).toEqual([1, 2]);
    expect(hidden.everyone.length).toBe(3);
    expect(hidden.hideEntries.find((e) => e.tag === "work")?.count).toBe(1);
    expect(on("messenger", { search: "cal" }).rows.map((p) => p.id)).toEqual([3]);
  });

  it("offers every platform anyone is on, A to Z by the name shown", () => {
    const names: Record<string, string> = { whatsapp: "WhatsApp", messenger: "Messenger", imessage: "iMessage" };
    expect(platformsIn([...ON, person(6, { platforms: ["imessage"] })], (p) => names[p])).toEqual(["imessage", "messenger", "whatsapp"]);
    expect(platformsIn([], (p) => p)).toEqual([]);
  });
});

describe("the Table with Phone calls picked", () => {
  const calls = (answered: number, unanswered: number, seconds: number, lastCallAt: number) => ({ answered, unanswered, seconds, lastCallAt });
  const phone = { platform: "phone", messageCount: 0, directMessageCount: 0, groupMessageCount: 0, lastMessageAt: null };
  const PEOPLE_CALLED = [
    // Many short calls, the last a while ago.
    person(1, { name: "Ada", closeness: 5, platforms: ["imessage", "phone"], messageCount: 50, byPlatform: [{ ...phone, platform: "imessage", messageCount: 50 }, phone], calls: calls(4, 1, 600, 100) }),
    // One long call, the newest.
    person(2, { name: "Bea", closeness: 3, platforms: ["phone"], byPlatform: [phone], calls: calls(1, 0, 5000, 300) }),
    // Only missed calls.
    person(3, { name: "Cal", platforms: ["phone"], byPlatform: [phone], calls: calls(0, 2, 0, 200) }),
    // A call account with no calls left on it (they were moved).
    person(4, { name: "Dot", platforms: ["phone"], byPlatform: [phone] }),
    // Never called.
    person(5, { name: "Eve", platforms: ["imessage"], messageCount: 9, byPlatform: [{ ...phone, platform: "imessage", messageCount: 9 }] }),
  ];
  const sorted = (sort: TableSort) => sortRows(filterRows(PEOPLE_CALLED, { ...EVERYONE, platform: "phone" }).rows, sort).map((p) => p.id);

  it("lists only people with a call account", () => {
    expect(filterRows(PEOPLE_CALLED, { ...EVERYONE, platform: "phone" }).rows.map((p) => p.id).sort()).toEqual([1, 2, 3, 4]);
  });

  it("sorts by answered calls, call time and last call, biggest and newest first, nobody without calls last", () => {
    expect(sorted(nextSort(DEFAULT_SORT, "calls"))).toEqual([1, 2, 3, 4]);
    expect(sorted(nextSort(DEFAULT_SORT, "callTime"))).toEqual([2, 1, 3, 4]);
    expect(sorted(nextSort(DEFAULT_SORT, "lastCall"))).toEqual([2, 3, 1, 4]);
    expect(sorted({ column: "lastCall", descending: false })).toEqual([1, 3, 2, 4]);
  });

  it("sorts by closeness when sorted by a column the platform does not show", () => {
    const messages: TableSort = { column: "messages", descending: true };
    expect(sortShown(messages, ["name", "calls", "closeness"])).toEqual(DEFAULT_SORT);
    expect(sortShown(messages, ["name", "messages", "closeness"])).toBe(messages);
  });
});
