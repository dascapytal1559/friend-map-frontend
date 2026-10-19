// The demo's shape from the archive's facts and score report (made up here): every distribution over the people
// shown, closeness scored as the map scores it, and nothing but counts in what it writes.

import { describe, expect, it } from "vitest";
import type { MapFacts, MapFactsPerson, ScoreReport } from "../src/archive.ts";
import type { Histogram } from "../src/demo/shape.ts";
import { monthKey } from "../src/time.ts";
import type { ArchiveClient } from "./archiveClient.ts";
import { preContract } from "../src/contract/handshake.ts";
import { readShape, shapeModule, shapeOf } from "./demo-shape.ts";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const DAY = 86_400_000;
const [ADA, BEA, CY, DEE] = [2, 3, 4, 5];

const person = (id: number, more: Partial<MapFactsPerson> = {}): MapFactsPerson => ({
  id, messages: 0, youDirect: 0, theyDirect: 0, lastMessageAt: null, platforms: ["messenger"], tags: 0, groups: 0, located: false, reachOut: false,
  report: null, ...more,
});
const counted = (firstMessageAt: number) => ({ firstMessageAt, reactions: { fromMe: 2, fromThem: 3 }, openings: { byMe: 1, byThem: 1 } });
const month = (directFromMe: number, directFromThem: number) => ({
  month: monthKey(NOW), directFromMe, directFromThem, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0,
});

/** Ada and Bea write, Bea on two platforms; Cy only has a call and a hangout; Dee was added by hand. */
const FACTS: MapFacts = {
  people: [
    person(ADA, { messages: 40, youDirect: 20, theyDirect: 20, lastMessageAt: NOW - 2 * DAY, tags: 2, groups: 1, located: true, reachOut: true, report: counted(NOW - 3 * 365 * DAY) }),
    person(BEA, { messages: 7, youDirect: 6, theyDirect: 1, lastMessageAt: NOW - 400 * DAY, platforms: ["messenger", "whatsapp"], groups: 1, report: counted(NOW - 2 * 365 * DAY) }),
    person(CY, { report: counted(NOW - 10 * DAY) }),
    person(DEE, { platforms: [] }),
  ],
  archived: { byHand: 1, byRule: { unknown: 2 } },
  platformMessages: { messenger: 120, telegram: 5 },
  locations: 1,
  groups: [{ size: 4, titled: true, shown: 2 }, { size: 3, titled: false, shown: 1 }],
  groupMessages: [{ messages: 10, mine: 4, first: NOW - 800 * DAY, last: NOW - 5 * DAY }],
  months: [{ month: "2025-11", count: 3 }, { month: "2026-02", count: 9 }],
  calls: [
    { personId: CY, at: NOW - DAY, answered: true, durationSeconds: 600 },
    { personId: CY, at: NOW - 2 * DAY, answered: false, durationSeconds: 0 },
  ],
  tagPeople: [1, 1, 3],
};
const REPORT: ScoreReport = {
  generatedAt: 0,
  people: [{ id: ADA, months: [month(20, 20)] }, { id: BEA, months: [] }, { id: CY, months: [] }],
  groups: [],
  catchUps: [{ id: 1, day: "2026-03-01", hours: 2, time: null, trip: null, byCall: false, others: 3, personIds: [CY] }],
  callDays: [],
};

const sum = (bars: Histogram) => bars.reduce((n, bar) => n + bar.count, 0);
const bar = (bars: Histogram, value: number) => bars.find((b) => b.from <= value && (b.to === null || value < b.to))!.count;

describe("the shape of a map", () => {
  const shape = shapeOf(FACTS, REPORT, NOW);

  it("counts the people shown and archived, the platforms with whom on each, and the month", () => {
    expect(shape.takenAt).toBe("2026-03");
    expect(shape.people).toEqual({ shown: 4, archivedByHand: 1, archivedByRule: { unknown: 2 }, reachOut: 1 });
    expect(shape.platforms).toEqual({ messenger: { people: 3, messages: 120 }, telegram: { people: 0, messages: 5 }, whatsapp: { people: 1, messages: 0 } });
    expect(shape.fields).toEqual({ location: { people: 1, values: 1 } });
  });

  it("gives every distribution over the people shown, or those with what it counts", () => {
    for (const bars of [shape.messagesPerPerson, shape.tags.perPerson, shape.groups.perPerson]) expect(sum(bars)).toBe(4);
    // Dee, added by hand, has no account anywhere.
    expect(shape.platformsPerPerson.map((b) => b.count)).toEqual([2, 1, 0]);
    expect(sum(shape.myShare)).toBe(2);
    expect(bar(shape.myShare, 0.5)).toBe(1);
    expect(sum(shape.lastSpoke)).toBe(2);
    expect(shape.firstSpoke && sum(shape.firstSpoke)).toBe(3);
    expect([shape.reactions, shape.openings]).toEqual([{ fromMe: 6, fromThem: 9 }, { byMe: 3, byThem: 3 }]);
    expect([shape.tags.count, sum(shape.tags.peoplePerTag)]).toEqual([3, 3]);
  });

  it("scores closeness as the map does, over those the map's report counts: Bea's none at all, Ada's and Cy's some", () => {
    const closeness = shape.closeness!;
    expect(sum(closeness)).toBe(3);
    expect(closeness[0]).toEqual({ from: 0, to: Number.MIN_VALUE, count: 1 });
  });

  it("gives the group chats, the months from the first to the last, the calls and the hangouts", () => {
    expect([shape.groups.count, shape.groups.titled, sum(shape.groups.sizes), sum(shape.groups.shown), sum(shape.groups.messages)]).toEqual([2, 1, 2, 2, 1]);
    expect(bar(shape.groups.myShare, 0.4)).toBe(1);
    expect(shape.activity).toEqual({ from: "2025-11", counts: [3, 0, 0, 9] });
    expect(shape.calls && [shape.calls.answered, shape.calls.missed, shape.calls.people, sum(shape.calls.minutes)]).toEqual([1, 1, 1, 1]);
    expect(shape.calls?.activity).toEqual({ from: "2026-03", counts: [1] });
    expect(shape.hangouts && [shape.hangouts.count, shape.hangouts.withOthers, shape.hangouts.days, sum(shape.hangouts.hours)]).toEqual([1, 1, 15, 1]);
  });

  it("counts a trip as a hangout but leaves its hours out of how long they last, the demo's being on one day", () => {
    const trip = { lastDay: "2026-03-04", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" };
    const withTrip = shapeOf(FACTS, { ...REPORT, catchUps: [...REPORT.catchUps, { id: 2, day: "2026-03-02", time: "18:00", trip, hours: 38, byCall: false, others: 0, personIds: [ADA] }] }, NOW);
    expect(withTrip.hangouts && [withTrip.hangouts.count, sum(withTrip.hangouts.hours), bar(withTrip.hangouts.hours, 2)]).toEqual([2, 1, 1]);
  });

  it("has no calls or hangouts when the archive has none", () => {
    const quiet = shapeOf({ ...FACTS, calls: [] }, { ...REPORT, catchUps: [] }, NOW);
    expect([quiet.calls, quiet.hangouts]).toEqual([null, null]);
  });

  it("holds nothing but counts, and is written as the module the demo imports", () => {
    const strings = [...JSON.stringify(shape).matchAll(/"([^"]*)"/g)].map((m) => m[1]!).filter((s) => /[a-z]/i.test(s));
    // Keys, platforms, archive rules and months only.
    const allowed = /^(takenAt|people|shown|archivedByHand|archivedByRule|reachOut|messagesPerPerson|myShare|lastSpoke|firstSpoke|closeness|platforms|platformsPerPerson|groups|count|titled|sizes|messages|perPerson|years|calls|answered|missed|minutes|hangouts|days|hours|withOthers|tags|peoplePerTag|fields|location|values|reactions|fromMe|fromThem|openings|byMe|byThem|activity|from|to|counts|people|messenger|whatsapp|telegram|unknown)$/;
    expect(strings.filter((s) => !allowed.test(s) && !/^\d{4}-\d{2}$/.test(s))).toEqual([]);
    expect(shapeModule(shape)).toMatch(/^\/\/ The shape of the real map in numbers[\s\S]*export const SHAPE: DemoShape = \{/);
  });

  it("reads the facts and the score report through the archive's client", async () => {
    const client = { contract: async () => preContract(), mapFacts: async () => FACTS, scoreReport: async () => REPORT } as unknown as ArchiveClient;
    expect(await readShape(client, NOW)).toEqual(shape);
  });
});
