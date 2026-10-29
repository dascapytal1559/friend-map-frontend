import { describe, expect, it } from "vitest";
import { LIVE_TOGETHER_TAG, type CallDay, type GroupMembership, type ScoredCatchUp } from "../archive.ts";
import { DEFAULT_SETTINGS } from "../settings.ts";
import { callCatchUps, catchUpAt, closenessNow, closenessRanks, closenessScores, decay, directWeight, MONTH_DAYS, monthLengths, personMonthPoints, reportMonths, reportScores, runningShares, scoreLabel } from "./closeness.ts";

// Three months, the last in progress: now is the middle of March in Melbourne, 14.5 days gone.
const MONTHS = ["2026-01", "2026-02", "2026-03"];
const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const H = 90;
const half = (days: number) => 0.5 ** (days / H);

function score(direct: Record<number, number[]>, groups: GroupMembership[] = [], halfLifeDays = H) {
  return closenessScores({
    months: MONTHS, now: NOW, halfLifeDays, groups,
    direct: new Map(Object.entries(direct).map(([id, series]) => [Number(id), series])),
  });
}

/** A group of `memberIds` (everyone but you) where, in January, you wrote `fromMe` and each member `each`. */
function group(id: number, memberIds: number[], fromMe: number, each: Record<number, number>, extra = 0): GroupMembership {
  const fromMembers = Object.entries(each).map(([member, count]) => ({ id: Number(member), count }));
  const messages = fromMe + fromMembers.reduce((sum, m) => sum + m.count, 0) + extra;
  return { id, memberIds, selfOnly: false, messageCount: messages, lastMessageAt: null, months: [{ month: "2026-01", messages, fromMe, fromMembers }] };
}

describe("decay", () => {
  it("dates a month's messages at its middle and halves them every half-life", () => {
    const steps = monthLengths(MONTHS, NOW);
    expect(steps).toEqual([MONTH_DAYS, MONTH_DAYS, 14.5]);
    const [jan, feb, now] = decay([4, 0, 0], steps, H);
    expect(jan).toBeCloseTo(4 * half(MONTH_DAYS / 2));
    expect(feb).toBeCloseTo(4 * half(MONTH_DAYS * 1.5));
    expect(now).toBeCloseTo(4 * half(MONTH_DAYS * 1.5 + 14.5));
    // This month's messages count from halfway through the part of it gone by.
    expect(decay([0, 0, 2], steps, H)[2]).toBeCloseTo(2 * half(7.25));
    // A message a half-life old counts half.
    expect(decay([1, 0], [2 * H, 1e-9], H)[1]).toBeCloseTo(0.5);
  });
});

describe("closenessScores", () => {
  it("counts a direct message 1 whoever sent it, fading with age", () => {
    const scores = score({ 1: [10, 0, 0], 2: [0, 0, 10] });
    expect(scores.get(1)![0]).toBeCloseTo(10 * half(MONTH_DAYS / 2));
    expect(scores.get(1)![2]).toBeCloseTo(10 * half(MONTH_DAYS * 1.5 + 14.5));
    // The same ten messages, recent: closer now, nothing before.
    expect(scores.get(2)![2]).toBeGreaterThan(scores.get(1)![2]);
    expect(scores.get(2)![1]).toBe(0);
    // A longer half-life forgets more slowly.
    expect(score({ 1: [10, 0, 0] }, [], 365).get(1)![2]).toBeGreaterThan(scores.get(1)![2]);
  });

  it("scores only whom it is asked to, the others still counting in a group's size", () => {
    const groups = [group(10, [1, 2, 3], 30, { 1: 50, 2: 20 })];
    const direct = new Map([[1, [0, 0, 0]]]);
    const scores = closenessScores({ months: MONTHS, now: NOW, halfLifeDays: H, direct, groups, only: new Set([1]) });
    expect([...scores.keys()]).toEqual([1]);
    expect(scores.get(1)).toEqual(score({}, groups).get(1));
  });

  it("credits each side's group messages by the other side's share, split among the others", () => {
    // Me and three others; I wrote 30 of the 100 messages, person 1 wrote 50, person 2 wrote 20 and person 3 none.
    const scores = score({}, [group(10, [1, 2, 3], 30, { 1: 50, 2: 20 })]);
    const age = half(MONTH_DAYS / 2);
    // Theirs at my share, 0.3; mine at theirs.
    expect(scores.get(1)![0]).toBeCloseTo(((50 * 0.3 + 30 * 0.5) / 3) * age);
    expect(scores.get(2)![0]).toBeCloseTo(((20 * 0.3 + 30 * 0.2) / 3) * age);
    expect(scores.get(3)![0]).toBe(0);
  });

  it("gives a chatty friend more of your messages than a quiet one", () => {
    // The worked example: me and four others, 1,000 messages. I write 200 (20%), a chatty friend 200 (20%), a quiet one 50.
    const scores = score({}, [group(10, [1, 2, 3, 4], 200, { 1: 200, 2: 50 }, 550)]);
    // Fading aside, as of January's end.
    const fade = half(MONTH_DAYS / 2);
    expect(scores.get(1)![0] / fade).toBeCloseTo(20); // (200 × 20% + 200 × 20%) ÷ 4, as when both were at my share
    expect(scores.get(2)![0] / fade).toBeCloseTo(5); // (50 × 20% + 200 × 5%) ÷ 4, where my share alone gave 12.5
  });

  it("gives a group you never write in nothing", () => {
    const scores = score({}, [group(10, [1, 2], 0, { 1: 500, 2: 300 })]);
    expect(scores.get(1)).toEqual([0, 0, 0]);
    expect(scores.get(2)).toEqual([0, 0, 0]);
  });

  it("counts a group more the more active you are in it", () => {
    const quiet = score({}, [group(10, [1, 2, 3], 5, { 1: 50 }, 45)]).get(1)![2];
    const active = score({}, [group(10, [1, 2, 3], 45, { 1: 50 }, 5)]).get(1)![2];
    expect(active).toBeGreaterThan(quiet * 5);
  });

  it("counts a small group more than a big one", () => {
    // The same share and the same messages from person 1, in a group of 4 and one of 200.
    const small = score({}, [group(10, [1, 2, 3, 4], 20, { 1: 80 })]).get(1)![2];
    const big = score({}, [group(10, Array.from({ length: 199 }, (_, i) => i + 1), 20, { 1: 80 })]).get(1)![2];
    expect(small / big).toBeCloseTo(199 / 4);
  });

  it("gives someone who never writes in a group nothing from it", () => {
    // I write most of it, but person 2 never does: none of mine are credited to them.
    const scores = score({}, [group(10, [1, 2], 90, { 1: 10 })]);
    expect(scores.get(1)![0]).toBeGreaterThan(0);
    expect(scores.get(2)).toEqual([0, 0, 0]);
  });

  it("never lets a group message outweigh a direct one", () => {
    // Just me and one other: I wrote 1, they wrote 9. Theirs count 0.1 each, mine 0.9: under the 10 direct messages.
    const scores = score({ 2: [10, 0, 0] }, [group(10, [1], 1, { 1: 9 })]);
    expect(scores.get(1)![2]).toBeCloseTo((9 * 0.1 + 1 * 0.9) * half(MONTH_DAYS * 1.5 + 14.5));
    expect(scores.get(1)![2]).toBeLessThan(scores.get(2)![2]);
  });

  it("adds direct and group messages together", () => {
    const direct = score({ 1: [6, 0, 0] }).get(1)![2];
    const inGroup = score({}, [group(10, [1, 2], 10, { 1: 10 })]).get(1)![2];
    expect(score({ 1: [6, 0, 0] }, [group(10, [1, 2], 10, { 1: 10 })]).get(1)![2]).toBeCloseTo(direct + inGroup);
  });

  it("takes each share only up to the month scored", () => {
    // Silent in January, then writing as much as person 1 by February: January's messages count for nothing as of January.
    const g: GroupMembership = {
      id: 10, memberIds: [1, 2], selfOnly: false, messageCount: 200, lastMessageAt: null,
      months: [
        { month: "2026-01", messages: 100, fromMe: 0, fromMembers: [{ id: 1, count: 100 }] },
        { month: "2026-02", messages: 100, fromMe: 100, fromMembers: [] },
      ],
    };
    const scores = score({}, [g]).get(1)!;
    expect(scores[0]).toBe(0);
    expect(scores[1]).toBeCloseTo((0.5 / 2) * (100 * half(MONTH_DAYS * 1.5) + 100 * half(MONTH_DAYS / 2)));
  });
});

describe("catch-ups", () => {
  const index = new Map(MONTHS.map((month, i) => [month, i]));
  const steps = monthLengths(MONTHS, NOW);
  const caughtUp = (day: string, worth = 50, personIds = [1]) =>
    closenessScores({ months: MONTHS, now: NOW, halfLifeDays: H, direct: new Map(), groups: [], catchUps: [{ day, worth, personIds }] });

  it("dates a catch-up at the middle of its day: today counts whole, a past month's from its end", () => {
    expect(catchUpAt("2026-03-15", index, steps)).toEqual({ month: 2, age: 0 });
    expect(catchUpAt("2026-03-10", index, steps)).toEqual({ month: 2, age: 5 });
    // 31 January is half a day before the end of January; 1 February all but half a day of a 28-day month.
    expect(catchUpAt("2026-01-31", index, steps)!.age).toBeCloseTo(MONTH_DAYS * 0.5 / 31);
    expect(catchUpAt("2026-02-01", index, steps)!.age).toBeCloseTo(MONTH_DAYS * 27.5 / 28);
    // Not yet, and not in the months scored.
    expect(catchUpAt("2026-03-16", index, steps)).toBeNull();
    expect(catchUpAt("2025-12-31", index, steps)).toBeNull();
  });

  it("counts its worth in direct messages on its day, halving every half-life after", () => {
    expect(caughtUp("2026-03-15").get(1)).toEqual([0, 0, 50]);
    expect(caughtUp("2026-03-10").get(1)![2]).toBeCloseTo(50 * half(5));
    const january = caughtUp("2026-01-31").get(1)!;
    const age = MONTH_DAYS * 0.5 / 31;
    expect(january[0]).toBeCloseTo(50 * half(age));
    expect(january[1]).toBeCloseTo(50 * half(age + MONTH_DAYS));
    expect(january[2]).toBeCloseTo(50 * half(age + MONTH_DAYS + 14.5));
    // A half-life on, it counts half.
    const long = closenessScores({ months: MONTHS, now: NOW, halfLifeDays: 30, direct: new Map(), groups: [], catchUps: [{ day: "2026-02-13", worth: 50, personIds: [1] }] });
    expect(long.get(1)![2]).toBeCloseTo(50 * 0.5 ** ((MONTH_DAYS * 15.5 / 28 + 14.5) / 30));
    // Not yet happened: nothing.
    expect(caughtUp("2026-03-16").get(1)).toBeUndefined();
  });

  it("weighs a catch-up worth one message in the middle of a month as one direct message that month", () => {
    const message = score({ 1: [1, 0, 0] }).get(1)!;
    const catchUp = caughtUp("2026-01-16", 1).get(1)!;
    for (let i = 0; i < MONTHS.length; i++) expect(catchUp[i]).toBeCloseTo(message[i]);
  });

  it("gives everyone at it the whole of it, and adds it to their messages", () => {
    const both = caughtUp("2026-03-01", 50, [1, 2]);
    expect(both.get(1)).toEqual(both.get(2));
    const withMessages = closenessScores({
      months: MONTHS, now: NOW, halfLifeDays: H, direct: new Map([[1, [6, 0, 0]]]), groups: [], catchUps: [{ day: "2026-03-01", worth: 50, personIds: [1, 2] }],
    });
    expect(withMessages.get(1)![2]).toBeCloseTo(score({ 1: [6, 0, 0] }).get(1)![2] + both.get(1)![2]);
    // Only whom it is asked to score.
    const only = closenessScores({ months: MONTHS, now: NOW, halfLifeDays: H, direct: new Map(), groups: [], only: new Set([2]), catchUps: [{ day: "2026-03-01", worth: 50, personIds: [1, 2] }] });
    expect([...only.keys()]).toEqual([2]);
    // Worth nothing, it counts for nothing.
    expect(caughtUp("2026-03-01", 0).get(1)).toBeUndefined();
  });

  it("goes by its hours times the settings' worth of an hour, and starts the months at the first catch-up", () => {
    const at = (day: string, hours: number, id: number): ScoredCatchUp => ({ id, day, hours, time: null, trip: null, personIds: [id], others: 0 });
    const report = {
      generatedAt: NOW, groups: [],
      people: [1, 2, 3, 4, 5].map((id) => ({ id, months: id === 5 ? [{ month: "2026-02", directFromMe: 1, directFromThem: 1, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 }] : [] })),
      catchUps: [at("2026-03-15", 3, 1), at("2026-03-15", 3, 2), at("2026-03-15", 0.5, 3), at("2025-11-20", 1, 4)],
      callDays: [],
    };
    // Before anyone's first message, so the months start there.
    expect(reportMonths(report)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
    const now = closenessNow(report, { ...DEFAULT_SETTINGS, catchUpHourWorth: 20 });
    expect(now.get(1)).toBeCloseTo(60);
    expect(now.get(2)).toBeCloseTo(60);
    expect(now.get(3)).toBeCloseTo(10);
    expect(now.get(4)!).toBeGreaterThan(0);
    expect(now.get(4)!).toBeLessThan(20 * half(100));
    // The default: 50 messages an hour.
    const defaults = reportScores(report, reportMonths(report), DEFAULT_SETTINGS);
    expect(defaults.get(1)!.at(-1)).toBeCloseTo(150);
    expect(defaults.get(3)!.at(-1)).toBeCloseTo(25);
  });
});

describe("reciprocity", () => {
  const month = (m: string, directFromMe: number, directFromThem: number) =>
    ({ month: m, directFromMe, directFromThem, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
  const report = (months: Record<number, Array<ReturnType<typeof month>>>, groups: GroupMembership[] = []) => ({
    generatedAt: NOW, groups, catchUps: [], callDays: [],
    people: Object.entries(months).map(([id, m]) => ({ id: Number(id), months: m })),
  });

  it("counts a month 2√(yours × theirs): an even one as plainly counted, a lopsided one less either way round, a one-way one nothing", () => {
    expect(directWeight(50, 50, 1)).toBe(100);
    expect(directWeight(90, 10, 1)).toBeCloseTo(60);
    expect(directWeight(10, 90, 1)).toBeCloseTo(60);
    expect(directWeight(99, 1, 1)).toBeCloseTo(19.9);
    expect(directWeight(100, 0, 1)).toBe(0);
    expect(directWeight(0, 100, 1)).toBe(0);
    expect(directWeight(0, 0, 1)).toBe(0);
  });

  it("blends the plain count (0) and the balanced one (1) in between, 0 being the old score", () => {
    for (const [mine, theirs] of [[50, 50], [90, 10], [100, 0], [3, 7]]) expect(directWeight(mine, theirs, 0)).toBe(mine + theirs);
    expect(directWeight(90, 10, 0.5)).toBeCloseTo(80);
    expect(directWeight(100, 0, 0.25)).toBeCloseTo(75);
    // Never more than the plain count.
    for (const r of [0, 0.3, 0.7, 1]) expect(directWeight(70, 30, r)).toBeLessThanOrEqual(100);
  });

  it("weighs each month on its own, before fading: a friendship gone one-way lately counts less now, its even past as it was", () => {
    // Person 1 even in January, one-way since; person 2 the same totals, even every month.
    const r = report({
      1: [month("2026-01", 20, 20), month("2026-02", 0, 20), month("2026-03", 0, 10)],
      2: [month("2026-01", 20, 20), month("2026-02", 10, 10), month("2026-03", 5, 5)],
    });
    const scores = reportScores(r, MONTHS, DEFAULT_SETTINGS);
    const steps = monthLengths(MONTHS, NOW);
    expect(scores.get(1)).toEqual(decay([40, 0, 0], steps, H));
    expect(scores.get(2)).toEqual(decay([40, 20, 10], steps, H));
    // January counts the same for both; by March only the even friendship has more.
    expect(scores.get(1)![0]).toBeCloseTo(scores.get(2)![0]);
    expect(scores.get(1)![2]).toBeLessThan(scores.get(2)![2]);
    // Balanced over the whole would have counted person 1's 20 and 60 as 2√(20 × 60), about 69; month by month it is 40.
    // With reciprocity 0 they are the plain count, as before.
    expect(reportScores(r, MONTHS, { ...DEFAULT_SETTINGS, messageReciprocity: 0 }).get(1)).toEqual(decay([40, 20, 10], steps, H));
  });

  it("leaves group chats, one-sided chats, catch-ups and calls as they are", () => {
    const g = group(10, [1, 2], 30, { 1: 50 });
    const selfOnly: GroupMembership = { ...group(11, [1, 2], 20, {}), selfOnly: true };
    const base = {
      ...report({ 1: [month("2026-01", 0, 0)], 2: [month("2026-01", 0, 0)] }, [g, selfOnly]),
      catchUps: [{ id: 1, day: "2026-02-10", time: null, trip: null, hours: 2, personIds: [1], others: 0 }] as ScoredCatchUp[],
      callDays: [{ personId: 2, day: "2026-03-02", seconds: 3600 }] as CallDay[],
    };
    const balanced = reportScores(base, MONTHS, DEFAULT_SETTINGS);
    const plain = reportScores(base, MONTHS, { ...DEFAULT_SETTINGS, messageReciprocity: 0 });
    expect(balanced).toEqual(plain);
    expect(balanced.get(1)![2]).toBeGreaterThan(0);
    expect(balanced.get(2)![2]).toBeGreaterThan(0);
  });
});

describe("chats where only your side is known", () => {
  const month = (directFromMe: number, directFromThem: number, directFromMeSelfOnly: number) =>
    ({ month: "2026-01", directFromMe, directFromThem, directFromMeSelfOnly, groupFromMe: 0, groupFromThem: 0 });
  const report = (months: Record<number, ReturnType<typeof month>>, groups: GroupMembership[] = []) => ({
    generatedAt: NOW, groups, catchUps: [], callDays: [],
    people: Object.entries(months).map(([id, m]) => ({ id: Number(id), months: [m] })),
  });

  it("counts each of your direct messages twice, for the reply assumed, whatever the reciprocity, and weighs two-sided chats by their balance", () => {
    // Person 1 only on a one-sided platform (10 of yours), person 2 on a two-sided one (10 of yours, none back),
    // person 3 on both (4 of yours one-sided, 6 two-sided both ways).
    const r = report({ 1: month(10, 0, 10), 2: month(10, 0, 0), 3: month(10, 6, 4) });
    const fade = half(MONTH_DAYS / 2);
    for (const messageReciprocity of [0, 0.5, 1]) {
      const scores = reportScores(r, MONTHS, { ...DEFAULT_SETTINGS, messageReciprocity });
      expect(scores.get(1)![0]).toBeCloseTo(20 * fade);
      expect(scores.get(3)![0]).toBeCloseTo(20 * fade);
      // Your 10 with none back: 10 counted plainly, nothing fully balanced, half that half way.
      expect(scores.get(2)![0]).toBeCloseTo(10 * (1 - messageReciprocity) * fade);
    }
  });

  it("takes everyone in a group there to write as much as you do, each a 1/n share", () => {
    // Me and three others, I wrote 30: each of the 4 is taken to write 30, a quarter each.
    const g: GroupMembership = { ...group(10, [1, 2, 3], 30, {}), selfOnly: true };
    const scores = score({}, [g]);
    const fade = half(MONTH_DAYS / 2);
    for (const id of [1, 2, 3]) expect(scores.get(id)![0]).toBeCloseTo(((30 * 0.25 + 30 * 0.25) / 3) * fade);
    // The same as a two-sided group where everyone did write 30.
    expect(scores.get(1)![0]).toBeCloseTo(score({}, [group(10, [1, 2, 3], 30, { 1: 30, 2: 30, 3: 30 })]).get(1)![0]);
    // A group there you never write in still adds nothing.
    expect(score({}, [{ ...group(10, [1, 2], 0, {}), selfOnly: true }]).get(1)).toEqual([0, 0, 0]);
  });
});

describe("a catch-up's share", () => {
  it("gives each at it their share of its worth: half shared by all, half split equally", () => {
    const people = (n: number): ScoredCatchUp => ({ id: n, day: "2026-03-15", hours: 2, time: null, trip: null, personIds: Array.from({ length: n }, (_, i) => n * 10 + i), others: 0 });
    const report = {
      generatedAt: NOW, groups: [], callDays: [], catchUps: [people(1), people(2), people(5)],
      people: [10, 20, 21, 50, 51, 52, 53, 54].map((id) => ({ id, months: [] })),
    };
    const now = closenessNow(report, DEFAULT_SETTINGS);
    // Two hours at 50 an hour: 100 alone, 75 each for two (½ + ½ ÷ 2), 60 each for five (½ + ½ ÷ 5).
    expect(now.get(10)).toBeCloseTo(100);
    expect(now.get(20)).toBeCloseTo(75);
    expect(now.get(21)).toBeCloseTo(75);
    for (const id of [50, 51, 52, 53, 54]) expect(now.get(id)).toBeCloseTo(60);
    // Nothing shared: split equally, 50 each for two, 20 each for five.
    const equal = closenessNow(report, { ...DEFAULT_SETTINGS, groupSharedPart: 0 });
    expect([10, 20, 50].map((id) => equal.get(id))).toEqual([100, 50, 20].map((n) => expect.closeTo(n)));
  });

  it("gives the others no one named a share too, which counts for nobody", () => {
    const report = {
      generatedAt: NOW, groups: [], callDays: [],
      catchUps: [
        { id: 1, day: "2026-03-15", hours: 3, time: null, trip: null, personIds: [1], others: 2 },
        { id: 2, day: "2026-03-15", hours: 2, time: null, trip: null, personIds: [2, 3], others: 18 },
      ],
      people: [1, 2, 3].map((id) => ({ id, months: [] })),
    };
    const now = closenessNow(report, DEFAULT_SETTINGS);
    // Three hours with 1 and 2 others: 150 × (½ + ½ ÷ 3), 100 for 1. Two hours with 2, 3 and 18 others: 100 × (½ + ½ ÷ 20), 52.5 each.
    expect(now.get(1)).toBeCloseTo(100);
    expect(now.get(2)).toBeCloseTo(52.5);
    expect(now.get(3)).toBeCloseTo(52.5);
    // Split equally: 50 for 1, 5 each for 2 and 3.
    const equal = closenessNow(report, { ...DEFAULT_SETTINGS, groupSharedPart: 0 });
    expect([1, 2, 3].map((id) => equal.get(id))).toEqual([50, 5, 5].map((n) => expect.closeTo(n)));
  });
});

describe("a trip", () => {
  // Away with one friend from 6 pm on 4 Mar to 2 pm on 6 Mar, private midnight to 10 am: 6 hours, then 14, then 4.
  const trip: ScoredCatchUp = {
    id: 1, day: "2026-03-04", time: "18:00", trip: { lastDay: "2026-03-06", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" },
    hours: 24, personIds: [1], others: 0,
  };
  const days = (hours: Array<[string, number]>): ScoredCatchUp[] =>
    hours.map(([day, h], i) => ({ id: 10 + i, day, time: null, trip: null, hours: h, personIds: [2], others: 0 }));
  const report = (catchUps: ScoredCatchUp[]) => ({ generatedAt: NOW, groups: [], callDays: [], catchUps, people: [1, 2].map((id) => ({ id, months: [] })) });

  it("counts each of its days on its own date, its part of the hours its time together counts as", () => {
    // 24 hours together count as 8 × √3; each day takes its part by its hours.
    const part = (8 * Math.sqrt(3)) / 24;
    const single = days([["2026-03-04", 6 * part], ["2026-03-05", 14 * part], ["2026-03-06", 4 * part]]);
    const now = closenessNow(report([trip, ...single]), DEFAULT_SETTINGS);
    expect(now.get(1)).toBeCloseTo(now.get(2)!);
    // With every hour whole, as that many one-day hangouts would.
    const whole = { ...DEFAULT_SETTINGS, tripFullHours: 8784 };
    const asDays = closenessNow(report([trip, ...days([["2026-03-04", 6], ["2026-03-05", 14], ["2026-03-06", 4]])]), whole);
    expect(asDays.get(1)).toBeCloseTo(asDays.get(2)!);
    // Not its hours in all on its first day: the later days fade less.
    const firstDay = closenessNow(report([{ ...trip, trip: null }]), whole);
    expect(asDays.get(1)!).toBeGreaterThan(firstDay.get(1)!);
  });

  it("splits its points between the months its days are in", () => {
    const across = { ...trip, day: "2026-02-28", trip: { ...trip.trip!, lastDay: "2026-03-02" } };
    const points = personMonthPoints(report([across]), 1, DEFAULT_SETTINGS);
    // 6 hours on 28 Feb; 14 on 1 Mar and 4 on the 2nd: 24 hours count as 8 × √3, at 50 an hour, 692.82.
    expect(points.map((m) => m.month)).toEqual(["2026-02", "2026-03"]);
    expect(points[0].hangouts).toBeCloseTo((400 * Math.sqrt(3) * 6) / 24);
    expect(points[1].hangouts).toBeCloseTo((400 * Math.sqrt(3) * 18) / 24);
  });

  it("counts a long trip less for each hour, a hangout on one date every hour whole", () => {
    // Ten whole days away from midnight to midnight: 140 hours together, counting as 1,673 messages, not 7,000.
    const ten = { ...trip, day: "2026-03-01", time: "00:00", trip: { ...trip.trip!, lastDay: "2026-03-11", endTime: "00:00" } };
    const points = personMonthPoints(report([ten]), 1, DEFAULT_SETTINGS);
    expect(Math.round(points[0].hangouts)).toBe(1673);
    // Shared as any group hangout: with a second friend there, 75% each.
    const two = personMonthPoints(report([{ ...ten, personIds: [1, 2] }]), 2, DEFAULT_SETTINGS);
    expect(two[0].hangouts).toBeCloseTo(0.75 * points[0].hangouts);
    const day = personMonthPoints(report(days([["2026-03-04", 14]])), 2, DEFAULT_SETTINGS);
    expect(day[0].hangouts).toBe(700);
  });
});

describe("calls", () => {
  const report = (callDays: CallDay[], catchUps: ScoredCatchUp[] = []) => ({
    generatedAt: NOW, groups: [], catchUps, callDays,
    people: [1, 2, 3, 4, 5].map((id) => ({ id, months: [] })),
  });
  const minutes = (personId: number, day: string, m: number): CallDay => ({ personId, day, seconds: m * 60 });

  it("counts a day's answered calls by how long they were, at the hour's worth, from 5 minutes", () => {
    const now = closenessNow(report([minutes(1, "2026-03-15", 90), minutes(2, "2026-03-15", 12), minutes(3, "2026-03-15", 5), minutes(4, "2026-03-15", 4)]), DEFAULT_SETTINGS);
    expect(now.get(1)).toBeCloseTo(75);
    expect(now.get(2)).toBeCloseTo(10);
    expect(now.get(3)).toBeCloseTo(50 / 12);
    // A voicemail, or a dropped call: nothing.
    expect(now.get(4) ?? 0).toBe(0);
  });

  it("goes by the settings' shortest day and hour's worth, and dates a call on its day", () => {
    const settings = { ...DEFAULT_SETTINGS, callMinimumMinutes: 60, catchUpHourWorth: 40 };
    const now = closenessNow(report([minutes(1, "2026-03-15", 60), minutes(2, "2026-03-15", 59), minutes(3, "2026-03-10", 120)]), settings);
    expect(now.get(1)).toBeCloseTo(40);
    expect(now.get(2) ?? 0).toBe(0);
    expect(now.get(3)).toBeCloseTo(80 * half(5));
    // With no shortest, any answered call counts, but a day of none still counts nothing.
    expect(closenessNow(report([minutes(1, "2026-03-15", 1), minutes(2, "2026-03-15", 0)]), { ...DEFAULT_SETTINGS, callMinimumMinutes: 0 }).get(2) ?? 0).toBe(0);
    // A call before any message starts the months.
    expect(reportMonths(report([minutes(1, "2025-12-01", 30)]))).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"]);
  });

  it("counts a day's calls in full beside any hangout with them that day, a backend's byCall passed over", () => {
    // In person with 3 for two hours, then an hour's call the same day: both count.
    const inPerson: ScoredCatchUp = { id: 9, day: "2026-03-15", hours: 2, time: null, trip: null, personIds: [3], others: 0 };
    // One a backend still sends with byCall, from before calls were their own kind (the life archive's repair makes it the
    // call it was): a hangout like any other, and the day's calls with 1 count whole beside it.
    const older = { id: 7, day: "2026-03-15", hours: 1.5, time: null, trip: null, byCall: true, personIds: [1, 2], others: 0 } as ScoredCatchUp;
    const calls = [minutes(1, "2026-03-15", 60), minutes(1, "2026-03-10", 60), minutes(3, "2026-03-15", 60)];
    const catchUps = [older, inPerson];
    expect(callCatchUps(report(calls, catchUps), DEFAULT_SETTINGS)).toEqual([
      { day: "2026-03-15", personIds: [1], worth: 50 },
      { day: "2026-03-10", personIds: [1], worth: 50 },
      { day: "2026-03-15", personIds: [3], worth: 50 },
    ]);
    const now = closenessNow(report(calls, catchUps), DEFAULT_SETTINGS);
    // 1: the day's hour of calls and their share of the hour and a half with 2 (½ + ½ ÷ 2 of 75), and the hour five days before.
    expect(now.get(1)).toBeCloseTo(50 + 56.25 + 50 * half(5));
    expect(now.get(2)).toBeCloseTo(56.25);
    expect(now.get(3)).toBeCloseTo(150);
  });

  it("gives each on a call logged with several people their share of it, before the shortest day that counts", () => {
    // 45 minutes with three: 30 minutes each half shared, 15 split equally; with 6 minutes one-to-one the same day.
    const day: CallDay = { personId: 1, day: "2026-03-15", seconds: 6 * 60, groupCalls: [{ seconds: 45 * 60, people: 3 }] };
    expect(closenessNow(report([day]), DEFAULT_SETTINGS).get(1)).toBeCloseTo(50 * (36 / 60));
    expect(closenessNow(report([day]), { ...DEFAULT_SETTINGS, groupSharedPart: 0 }).get(1)).toBeCloseTo(50 * (21 / 60));
    // 8 minutes with four: 5 minutes each half shared, which counts; 2 split equally, which does not.
    const short: CallDay = { personId: 2, day: "2026-03-15", seconds: 0, groupCalls: [{ seconds: 8 * 60, people: 4 }] };
    expect(closenessNow(report([short]), DEFAULT_SETTINGS).get(2)).toBeCloseTo(50 * (5 / 60));
    expect(closenessNow(report([short]), { ...DEFAULT_SETTINGS, groupSharedPart: 0 }).get(2) ?? 0).toBe(0);
  });
});

describe("runningShares", () => {
  it("is someone's running share of a group's messages", () => {
    expect(runningShares([0, 10, 30], [0, 5, 5])).toEqual([0, 0.5, 0.25]);
  });
});

describe("closenessRanks", () => {
  it("ranks the highest score first each month, with no rank for no score", () => {
    const ranks = closenessRanks([
      { id: 1, closeness: [0, 5, 1], tags: [] },
      { id: 2, closeness: [3, 2, 2], tags: [] },
      { id: 3, closeness: [0, 2, 0], tags: [] },
    ], 3);
    expect(ranks.get(1)).toEqual([0, 1, 2]);
    expect(ranks.get(2)).toEqual([1, 2, 1]);
    // A tie goes to the lower id.
    expect(ranks.get(3)).toEqual([0, 3, 0]);
  });

  it("ranks whoever you live with first every month, whatever their score, even none", () => {
    const people = [
      { id: 1, closeness: [9, 9, 9], tags: ["work"] },
      { id: 2, closeness: [0, 0, 0.1], tags: [LIVE_TOGETHER_TAG] },
      { id: 3, closeness: [4, 1, 2], tags: [] },
      { id: 4, closeness: [1, 2, 3], tags: ["family", LIVE_TOGETHER_TAG] },
    ];
    const ranks = closenessRanks(people, 3);
    // Among themselves, by their own score; then everyone else as before.
    expect(ranks.get(4)).toEqual([1, 1, 1]);
    expect(ranks.get(2)).toEqual([2, 2, 2]);
    expect(ranks.get(1)).toEqual([3, 3, 3]);
    expect(ranks.get(3)).toEqual([4, 4, 4]);
  });

  it("ranks someone by their score again once the tag is taken off", () => {
    const people = [
      { id: 1, closeness: [9], tags: [] as string[] },
      { id: 2, closeness: [0.5], tags: [LIVE_TOGETHER_TAG] },
      { id: 3, closeness: [0], tags: [] as string[] },
    ];
    expect(closenessRanks(people, 1).get(2)).toEqual([1]);
    const untagged = closenessRanks(people.map((p) => ({ ...p, tags: [] })), 1);
    expect([...untagged]).toEqual([[1, [1]], [2, [2]], [3, [0]]]);
  });
});

describe("scoreLabel", () => {
  it("reads as a plain number", () => {
    expect(scoreLabel(0)).toBe("0");
    expect(scoreLabel(0.004)).toBe("under 0.01");
    expect(scoreLabel(0.2734)).toBe("0.27");
    expect(scoreLabel(3.14)).toBe("3.1");
    expect(scoreLabel(42.4)).toBe("42");
    expect(scoreLabel(1234.5)).toBe("1,235");
  });
});

describe("personMonthPoints", () => {
  const counts = (month: string, directFromMe: number, directFromThem: number, directFromMeSelfOnly = 0) =>
    ({ month, directFromMe, directFromThem, directFromMeSelfOnly, groupFromMe: 0, groupFromThem: 0 });
  const catchUp = (id: number, day: string, hours: number, personIds: number[], others = 0): ScoredCatchUp =>
    ({ id, day, time: null, trip: null, hours, personIds, others });
  const report = {
    generatedAt: NOW,
    people: [
      { id: 1, months: [counts("2026-01", 90, 10), counts("2026-02", 5, 0, 5)] },
      { id: 2, months: [counts("2026-01", 3, 3)] },
    ],
    groups: [
      group(7, [1, 2], 10, { 1: 20, 2: 10 }),
      { id: 8, memberIds: [1, 2, 3], selfOnly: true, messageCount: 8, lastMessageAt: null, months: [{ month: "2026-02", messages: 8, fromMe: 8, fromMembers: [] }] },
    ],
    catchUps: [catchUp(1, "2026-02-10", 2, [1]), catchUp(2, "2026-03-05", 3, [1, 2], 2)],
    callDays: [
      { personId: 1, day: "2026-03-01", seconds: 30 * 60 },
      { personId: 1, day: "2026-03-02", seconds: 4 * 60 },
      { personId: 1, day: "2026-03-10", seconds: 0, groupCalls: [{ seconds: 40 * 60, people: 4 }] },
    ],
  };
  const points = personMonthPoints(report, 1, DEFAULT_SETTINGS);
  const at = (month: string) => points.find((p) => p.month === month)!;

  it("splits a month's direct messages by who sent them, at their balance", () => {
    // 90 and 10 count 60: 54 for yours, 6 for theirs.
    expect(at("2026-01").directYou).toBeCloseTo(54);
    expect(at("2026-01").directThem).toBeCloseTo(6);
    expect(at("2026-01").directThemAssumed).toBe(0);
    // Yours where only your side is kept count 2 each: 1 yours, and 1 for the reply assumed, on their side.
    expect(at("2026-02").directYou).toBeCloseTo(5);
    expect(at("2026-02").directThem).toBeCloseTo(5);
    expect(at("2026-02").directThemAssumed).toBeCloseTo(5);
  });

  it("weighs group messages by the other side's share there, and assumes an even exchange where only your side is kept", () => {
    // Group 7: 40 messages, yours 10 (a quarter), theirs 20 (a half), 2 others.
    expect(at("2026-01").groupThem).toBeCloseTo((20 * 0.25) / 2);
    expect(at("2026-01").groupYou).toBeCloseTo((10 * 0.5) / 2);
    expect(at("2026-01").groupThemAssumed).toBe(0);
    // Group 8: 4 people with you, each a quarter, 3 others; half yours, half the replies assumed.
    expect(at("2026-02").groupYou).toBeCloseTo((8 * 0.25) / 3);
    expect(at("2026-02").groupThem).toBeCloseTo((8 * 0.25) / 3);
    expect(at("2026-02").groupThemAssumed).toBeCloseTo((8 * 0.25) / 3);
  });

  it("counts calls and hangouts at their worth, a hangout split among everyone at it", () => {
    expect(at("2026-02").hangouts).toBeCloseTo(100);
    // 3 hours with them, a friend and 2 others: 150 × (½ + ½ ÷ 4) each.
    expect(at("2026-03").hangouts).toBeCloseTo(93.75);
    // Half an hour of calls counts 25; a day under 5 minutes nothing; 40 minutes with four, 25 minutes each, 20.8.
    expect(at("2026-03").calls).toBeCloseTo(25 + 50 * (25 / 60));
    expect(points.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("adds up to the score with nothing fading", () => {
    const settings = { ...DEFAULT_SETTINGS, closenessHalfLifeDays: 1e15 };
    const total = personMonthPoints(report, 1, settings).reduce((sum, p) => sum + p.directThem + p.directYou + p.groupThem + p.groupYou + p.calls + p.hangouts, 0);
    expect(total).toBeCloseTo(closenessNow(report, settings).get(1)!);
  });

  it("is empty for someone with nothing", () => {
    expect(personMonthPoints(report, 9, DEFAULT_SETTINGS)).toEqual([]);
  });
});
