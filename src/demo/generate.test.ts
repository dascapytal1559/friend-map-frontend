// The made-up crowd: the same every time, DEMO_SIZE people on the map and
// shaped like the real map, every count in proportion, and nothing real in it: no name from the made-up crowd of
// the map views, and, where your archive is on this
// machine, no name, handle or chat title from it either (skipped where it is
// not).

import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { dataHome } from "../../server/dataHome.ts";
import { CROWD_FIRST, CROWD_LAST, CROWD_SELF } from "../../server/fixtures/madeUpNames.ts";
import { closenessNow } from "../demos/closeness.ts";
import { isPlaceholderName, shortened } from "../names.ts";
import { DEFAULT_SETTINGS } from "../settings.ts";
import { DemoArchive } from "./archive.ts";
import { DEMO_SIZE, everyLine, generateDemo, messageText, SMALL_CROWD, type DemoData } from "./generate.ts";
import { SHAPE } from "./mapShape.ts";
import { histogram } from "./shape.ts";
import { FIRST_NAMES, GROUPS, LAST_NAMES, PLACES, SELF_NAME } from "./words.ts";

const NOW = Date.parse("2026-10-01T12:00:00+10:00");
const YEAR = 365.25 * 86_400_000;
const data = generateDemo(NOW);
const archive = new DemoArchive(data);
/** The crowd against the real map: each of its counts, in proportion. */
const scale = DEMO_SIZE / SHAPE.people.shown;
const scaled = (n: number) => Math.round(n * scale);

/** The words of a name, lowercased: "Ada Sample" is ada and sample. */
const words = (name: string) => name.toLowerCase().split(/[\s·]+/).filter((word) => word.length >= 3);

describe("the made-up crowd", () => {
  it("is the same every time for the same moment, and a smaller one for a test is the same kind of crowd", () => {
    const again = generateDemo(NOW);
    expect(again.people).toEqual(data.people);
    expect(again.conversations).toEqual(data.conversations);
    // 700,000 entries each: compared as numbers, which a deep comparison is too slow for.
    const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (x: number, i: number) => x === b[i]);
    expect(same(again.messages.sentAt, data.messages.sentAt) && same(again.messages.sender, data.messages.sender)).toBe(true);
    expect(again.catchUps).toEqual(data.catchUps);
    expect(generateDemo(NOW + 40 * 86_400_000).messages.length).not.toBe(data.messages.length);
    const small = new DemoArchive(generateDemo(NOW, SMALL_CROWD));
    expect(small.relationships().people).toHaveLength(SMALL_CROWD.size!);
    expect(small.data.messages.length).toBeLessThan(data.messages.length / 5);
  }, 30_000);

  it("has DEMO_SIZE people on the map, and as many archived, by hand and by each rule, as the real map's in proportion", () => {
    const listing = archive.listPeople();
    // Everyone on the map, the one tagged commercial (whom Hide leaves off instead) among them.
    expect(listing.people.filter((person) => person.archived === null)).toHaveLength(DEMO_SIZE);
    const archived = new Map<string, number>();
    for (const person of listing.people) if (person.archived !== null) archived.set(person.archived, (archived.get(person.archived) ?? 0) + 1);
    expect(archived.get("you")).toBe(scaled(SHAPE.people.archivedByHand));
    for (const [rule, count] of Object.entries(SHAPE.people.archivedByRule)) {
      // People met only in group chats come out within a few of the real map's: whether one wrote depends on the draw.
      expect([rule, Math.abs((archived.get(rule) ?? 0) - scaled(count)) <= Math.max(2, scaled(count) * 0.02)]).toEqual([rule, true]);
    }
    expect(listing.me?.name).toBe(SELF_NAME);
    expect(listing.tags.map((t) => t.tag)).toContain("climbing");
  });

  it("has as many group chats as the real map's in proportion, as big, and the named ones the examples ask for", () => {
    const groups = data.conversations.filter((c) => c.type === "group");
    expect(groups).toHaveLength(scaled(SHAPE.groups.count));
    const members = groups.reduce((n, g) => n + g.memberAccountIds.length, 0);
    const theirs = scale * SHAPE.groups.sizes.reduce((n, bar) => n + bar.count * (bar.to === null ? bar.from * 1.5 : Math.sqrt(bar.from * bar.to)), 0);
    expect(members / theirs).toBeGreaterThan(0.5);
    expect(members / theirs).toBeLessThan(2);
    for (const kind of GROUPS) expect(groups.some((g) => g.title === kind.title)).toBe(true);
    // Most have a title, as the real map's do; the rest are named by their members.
    expect(groups.filter((g) => g.title === null).length).toBeLessThan(groups.length / 5);
  });

  it("scores closeness much as the real map does: as big a share in each band, from the belt to the sun", () => {
    const report = archive.relationships();
    const scores = closenessNow(report, DEFAULT_SETTINGS);
    const ours = histogram(report.people.map((p) => scores.get(p.id) ?? 0), SHAPE.closeness!.map((bar) => bar.from));
    // Half the bars' differences, over everyone: the share of people who would have to move band to match.
    const apart = ours.reduce((n, bar, i) => n + Math.abs(bar.count - scale * SHAPE.closeness![i].count), 0) / 2 / report.people.length;
    expect(apart).toBeLessThan(0.2);
  });

  it("gives some people years of one-to-one messages, both of them writing, a spread of last-spoke dates, and about as many messages as the real map's in proportion", () => {
    const report = archive.relationships();
    const spans = report.people.map((p) => (p.firstMessageAt !== null && p.lastMessageAt !== null ? (p.lastMessageAt - p.firstMessageAt) / YEAR : 0));
    expect(spans.filter((years) => years >= 3).length).toBeGreaterThan(scaled(100));
    expect(report.people.filter((p) => p.totals.directFromMe > 0 && p.totals.directFromThem > 0).length).toBeGreaterThan(scaled(600));
    const lastDays = report.people.map((p) => (p.lastMessageAt === null ? Infinity : (NOW - p.lastMessageAt) / 86_400_000));
    expect(lastDays.filter((days) => days <= 30).length).toBeGreaterThan(scaled(20));
    expect(lastDays.filter((days) => days > 5 * 365).length).toBeGreaterThan(scaled(100));
    const theirs = scale * SHAPE.activity.counts.reduce((a, b) => a + b, 0);
    expect(data.messages.length / theirs).toBeGreaterThan(0.7);
    expect(data.messages.length / theirs).toBeLessThan(1.4);
  });

  it("has calls with about as many people in proportion, some never answered, each in a one-to-one chat", () => {
    const calls = [...data.messages.calls];
    const callers = new Set(calls.map(([i]) => data.accounts[data.conversations[data.messages.conversation[i] - 1].memberAccountIds[1] - 1].personId));
    expect(callers.size).toBe(scaled(SHAPE.calls!.people));
    // A few people make most of the calls, so how many there are in all swings with the draw.
    expect(calls.length).toBeGreaterThan(scale * (SHAPE.calls!.answered + SHAPE.calls!.missed) * 0.3);
    expect(calls.filter(([, seconds]) => seconds === 0).length).toBeGreaterThan(0);
    for (const [i] of calls) expect(data.conversations[data.messages.conversation[i] - 1].type).toBe("direct");
    expect(archive.relationships().callDays.length).toBeGreaterThan(scaled(100));
  });

  it("keeps as many hangouts as the real map's in proportion, with people on the map, by date up to today, most with one person and some with more, each of them edited", () => {
    expect(data.catchUps.length).toBe(scaled(SHAPE.hangouts!.count));
    const shown = new Set(archive.listPeople().people.filter((p) => p.archived === null).map((p) => p.id));
    const today = new Date(NOW).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
    for (const c of data.catchUps) {
      expect(c.day <= today).toBe(true);
      expect(c.hours).toBeGreaterThan(0);
      for (const id of c.personIds) {
        expect(shown.has(id)).toBe(true);
        expect(data.people[id - 1].edited).toBe(true);
      }
    }
    expect(data.catchUps.filter((c) => c.personIds.length > 1).length).toBeGreaterThan(0);
    expect(data.catchUps.map((c) => c.day)).toEqual(data.catchUps.map((c) => c.day).sort());
  });

  it("keeps each chat's messages together and in order, in whole milliseconds before now, each reading as a line of chat", () => {
    const { messages } = data;
    let placed = 0;
    for (const chat of data.conversations) {
      expect(chat.start).toBe(placed);
      placed += chat.count;
      for (let i = chat.start; i < chat.start + chat.count; i++) {
        expect(messages.conversation[i]).toBe(chat.id);
        if (i > chat.start && messages.sentAt[i] < messages.sentAt[i - 1]) throw new Error(`message ${i + 1} is before the one before it`);
      }
    }
    expect(placed).toBe(messages.length);
    for (let i = 0; i < messages.length; i += 997) {
      expect(Number.isInteger(messages.sentAt[i])).toBe(true);
      expect(messages.sentAt[i]).toBeLessThan(NOW);
      const text = messageText(data, i);
      expect(text).not.toBe("");
      expect(text).not.toMatch(/[{}]/);
      // The same message always reads the same.
      expect(messageText(data, i)).toBe(text);
    }
    expect(everyLine()).toContain(messageText(data, 0));
  });
});

describe("the crowd's names", () => {
  it("share no word with the made-up crowd of the map views", () => {
    const crowd = new Set([...CROWD_FIRST, ...CROWD_LAST, CROWD_SELF].flatMap(words));
    expect(crowd.size).toBeGreaterThan(20);
    expect([...FIRST_NAMES, ...LAST_NAMES, ...words(SELF_NAME)].filter((name) => crowd.has(name.toLowerCase()))).toEqual([]);
  });

  it("take their places as twenty beginnings, each with the same five endings, in that order", () => {
    const ends = ["brook", "combe", "dale", "field", "ford"];
    const starts = PLACES.filter((_, i) => i % ends.length === 0).map((place) => place.slice(0, -ends[0].length));
    expect(starts).toHaveLength(20);
    expect(PLACES).toEqual(starts.flatMap((start) => ends.map((end) => start + end)));
  });

  it("are kept in full, a first name and a last (or an address), one person to each but for deleted accounts", () => {
    const named = data.people.filter((p) => !isPlaceholderName(p.name)).map((p) => p.name);
    expect(new Set(named).size).toBe(named.length);
    expect(named.filter((name) => !/^\p{L}+ \p{L}+$/u.test(name) && !name.includes("@"))).toEqual([]);
  });

  it("show as First L. (\"Ada S.\", as the demo shows them off the map and its map to start with) to one person each on the map", () => {
    const onMap = archive.listPeople().people.filter((p) => p.archived === null).map((p) => shortened(p.name, "initial"));
    expect(onMap.filter((name) => !/^\p{L}+ \p{Lu}\.$/u.test(name))).toEqual([]);
    expect(new Set(onMap).size).toBe(onMap.length);
  });

  const archiveFile = `${dataHome().archive}/archive.sqlite`;
  it.skipIf(!existsSync(archiveFile))("are nobody you know: no name, alias, handle or chat title from your archive", () => {
    const denied = denylist(archiveFile);
    expect(denied.names.size).toBeGreaterThan(0);
    // Counts only, so a failure names nobody real.
    expect(leaksIn(data, denied).length).toBe(0);
    // And the check would see a leak: a crowd with one of your names in it.
    const real = [...denied.names].find((name) => words(name).length >= 2)!;
    const leaky: DemoData = { ...data, people: [...data.people, { ...data.people[1], id: 9999, name: real }] };
    const found = leaksIn(leaky, denied);
    expect([found.length, found.includes(`name: ${real}`)]).toEqual([1, true]);
  });
});

/**
 * Names (people's, their aliases, accounts' display names), handles and chat
 * titles from an archive, read-only, lowercased and single-spaced; a
 * platform's placeholder for a deleted account ("Facebook user") is nobody.
 */
export function denylist(file: string): { names: Set<string>; handles: Set<string>; titles: Set<string> } {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const clean = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
    const names = new Set<string>();
    for (const row of db.prepare("SELECT name, aliases_json FROM person").all() as { name: string; aliases_json: string }[]) {
      if (!isPlaceholderName(row.name)) names.add(clean(row.name));
      for (const alias of JSON.parse(row.aliases_json) as string[]) names.add(clean(alias));
    }
    const handles = new Set<string>();
    for (const row of db.prepare("SELECT display_name, handle FROM import_person").all() as { display_name: string; handle: string | null }[]) {
      if (!isPlaceholderName(row.display_name)) names.add(clean(row.display_name));
      if (row.handle) handles.add(clean(row.handle));
    }
    names.delete("");
    const titles = new Set<string>();
    for (const row of db.prepare("SELECT title FROM conversation WHERE title IS NOT NULL").all() as { title: string }[]) titles.add(clean(row.title));
    return { names, handles, titles };
  } finally {
    db.close();
  }
}

/**
 * What of the crowd is on the denylist: a person's name or alias of two words
 * or more that is a real name (a first name or nickname alone is not anyone),
 * a real name of two or more words in any line of chat the crowd can hold, a
 * handle, or a group chat's title.
 */
export function leaksIn(crowd: DemoData, denied: ReturnType<typeof denylist>): string[] {
  const leaks = new Set<string>();
  for (const person of crowd.people) {
    for (const name of [person.name, ...person.aliases]) if (words(name).length >= 2 && denied.names.has(name.toLowerCase())) leaks.add(`name: ${name}`);
  }
  for (const account of crowd.accounts) if (account.handle && denied.handles.has(account.handle.toLowerCase())) leaks.add(`handle: ${account.handle}`);
  for (const conversation of crowd.conversations) {
    if (conversation.type === "group" && conversation.title && denied.titles.has(conversation.title.toLowerCase())) leaks.add(`title: ${conversation.title}`);
  }
  const fullNames = [...denied.names].filter((name) => words(name).length >= 2 && name.split(" ").every((word) => word.length >= 3));
  const texts = everyLine().map((line) => line.toLowerCase()).join("\n");
  for (const name of fullNames) if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(texts)) leaks.add(`text: ${name}`);
  return [...leaks].sort();
}
