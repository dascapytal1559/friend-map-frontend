import { describe, expect, it } from "vitest";
import { activityBars, monthCounts, monthName, monthReach, monthReadout, personActivity } from "./activity.ts";
import type { PersonActivity } from "./archive.ts";
import { closenessNow, personMonthPoints } from "./demos/closeness.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

const month = (m: string, directFromMe: number, directFromThem: number, groupFromThem = 0, groupFromMe = 0, directFromMeSelfOnly = 0) =>
  ({ month: m, directFromMe, directFromThem, directFromMeSelfOnly, groupFromMe, groupFromThem });

type Points = PersonActivity["points"][number];
const points = (m: string, p: Partial<Omit<Points, "month">>): Points =>
  ({ month: m, directThem: 0, directThemAssumed: 0, directYou: 0, groupThem: 0, groupThemAssumed: 0, groupYou: 0, calls: 0, hangouts: 0, callSeconds: 0, hangoutCount: 0, ...p });

describe("personActivity", () => {
  const report = {
    generatedAt: Date.parse("2026-03-15T12:00:00+11:00"),
    people: [{ id: 1, months: [month("2026-01", 18, 42)] }],
    groups: [],
    catchUps: [{ id: 1, day: "2026-03-05", hours: 2, time: null, trip: null, others: 0, personIds: [1] }],
    callDays: [{ personId: 1, day: "2026-02-01", seconds: 30 * 60 }, { personId: 1, day: "2026-02-20", seconds: 3 * 60 }, { personId: 1, day: "2026-02-25", seconds: 0, groupCalls: [{ seconds: 30 * 60, people: 2 }] }, { personId: 2, day: "2026-02-01", seconds: 600 }],
  };

  it("gives each month's points as the score counts them, with the month's call time and hangouts", () => {
    const activity = personActivity(report, 1, DEFAULT_SETTINGS);
    expect(activity.months).toEqual(report.people[0].months);
    const scored = personMonthPoints(report, 1, DEFAULT_SETTINGS);
    expect(activity.points.map(({ callSeconds, hangoutCount, ...p }) => p)).toEqual(scored);
    // Half an hour with two: their share, 75% of it, 22.5 minutes.
    expect(activity.points.map((p) => [p.month, p.callSeconds, p.hangoutCount])).toEqual([["2026-01", 0, 0], ["2026-02", 33 * 60 + 1350, 0], ["2026-03", 0, 1]]);
    expect(activity.points[1].calls).toBeCloseTo(25 + 50 * (22.5 / 60));
    expect(activity.points[2].hangouts).toBeCloseTo(100);
  });

  it("counts a trip as one hangout, in the month it began, its points in the months of its days", () => {
    // 6 pm on 27 Feb to 2 pm on 1 Mar, private midnight to 10 am: 6 and 14 hours in February, 4 in March, 24 in all,
    // counting as 8 × √3 hours (tripCountedHours), at 50 an hour 692.82: 20/24 of it in February, 4/24 in March.
    const trip = { id: 2, day: "2026-02-27", time: "18:00", trip: { lastDay: "2026-03-01", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" }, hours: 24, others: 0, personIds: [1] };
    const activity = personActivity({ ...report, catchUps: [trip], callDays: [] }, 1, DEFAULT_SETTINGS);
    const months = activity.points.filter((p) => p.hangouts > 0);
    expect(months.map((p) => [p.month, p.hangoutCount])).toEqual([["2026-02", 1], ["2026-03", 0]]);
    expect(months[0].hangouts).toBeCloseTo((400 * Math.sqrt(3) * 20) / 24);
    expect(months[1].hangouts).toBeCloseTo((400 * Math.sqrt(3) * 4) / 24);
  });

  it("keeps a month of calls too short to count, for its time", () => {
    const short = personActivity({ ...report, catchUps: [], callDays: [{ personId: 1, day: "2026-02-20", seconds: 120 }] }, 1, DEFAULT_SETTINGS);
    expect(short.points.at(-1)).toEqual(points("2026-02", { callSeconds: 120 }));
  });
});

describe("activityBars", () => {
  it("runs from the first month to the last, filling the months between with nothing", () => {
    const bars = activityBars({ months: [month("2025-11", 2, 1), month("2026-02", 0, 4)], points: [points("2025-11", { directThem: 1, directYou: 2 }), points("2026-03", { hangouts: 50, hangoutCount: 1 })] }, false);
    expect(bars.months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
    expect(bars.them).toEqual([1, 0, 0, 0, 0]);
    expect(bars.you).toEqual([2, 0, 0, 0, 0]);
    expect(bars.hangouts).toEqual([0, 0, 0, 0, 50]);
    expect(bars.themCount).toEqual([1, 0, 0, 4, 0]);
  });

  it("adds both sides' group points and counts only with groups", () => {
    const activity = { months: [month("2024-01", 3, 1, 5, 9)], points: [points("2024-01", { directThem: 1, directThemAssumed: 0.5, directYou: 2, groupThem: 4, groupThemAssumed: 1, groupYou: 6 })] };
    expect(activityBars(activity, false)).toMatchObject({ them: [1], themAssumed: [0.5], you: [2], themCount: [1], youCount: [3] });
    expect(activityBars(activity, true)).toMatchObject({ them: [5], themAssumed: [1.5], you: [8], themCount: [6], youCount: [12] });
  });

  it("is empty with nothing to show", () => {
    expect(activityBars({ months: [], points: [] }, true).months).toEqual([]);
    expect(activityBars({ months: [month("2024-01", 0, 0, 3)], points: [] }, false).months).toEqual([]);
  });
});

describe("monthReach", () => {
  it("puts half of the calls and hangouts each side of the line, beside each side's messages", () => {
    const bars = activityBars({ months: [], points: [points("2024-01", { directThem: 10, directYou: 4, calls: 20, hangouts: 100 })] }, false);
    expect(monthReach(bars, 0)).toEqual({ above: 70, below: 64 });
  });
});

describe("where only your side is kept", () => {
  const selfOnlyGroup = { id: 8, memberIds: [1], selfOnly: true, messageCount: 4, lastMessageAt: null, months: [{ month: "2026-01", messages: 4, fromMe: 4, fromMembers: [] }] };
  const report = {
    generatedAt: Date.parse("2026-03-15T12:00:00+11:00"),
    people: [{ id: 1, months: [month("2026-01", 8, 0, 0, 4, 6), month("2026-02", 3, 3)] }],
    groups: [selfOnlyGroup],
    catchUps: [],
    callDays: [],
  };

  it("puts the even exchange the score assumes half on their side, marked assumed", () => {
    const bars = activityBars(personActivity(report, 1, DEFAULT_SETTINGS), false);
    // 6 of yours with no reply kept: 6 yours and 6 assumed theirs; the 2 others of yours, with nothing back, count nothing.
    expect(bars.them).toEqual([6, 3]);
    expect(bars.themAssumed).toEqual([6, 0]);
    expect(bars.you).toEqual([6, 3]);
    expect(monthReadout(bars, 0)).toBe("Jan 2026 · them 6 (6 assumed) · you 6 · Discord keeps only your side");
    expect(monthReadout(bars, 1)).toBe("Feb 2026 · them 3 · you 3");
    // The counts stay the messages kept.
    expect(monthCounts(bars, 0)).toBe("0 messages from them, 8 from you");
  });

  it("does the same for a group chat that keeps only your side, with group messages", () => {
    const bars = activityBars(personActivity(report, 1, DEFAULT_SETTINGS), true);
    // The group: you and them, a half share each, 1 other: 2 × 4 ÷ 2 ÷ 1 = 4, 2 each side.
    expect(bars.them).toEqual([8, 3]);
    expect(bars.themAssumed).toEqual([8, 0]);
    expect(bars.you).toEqual([8, 3]);
  });

  it("adds up to what the score counts", () => {
    const bars = activityBars(personActivity(report, 1, { ...DEFAULT_SETTINGS, closenessHalfLifeDays: 1e15 }), true);
    const total = bars.them.reduce((a, b) => a + b, 0) + bars.you.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(closenessNow(report, { ...DEFAULT_SETTINGS, closenessHalfLifeDays: 1e15 }).get(1)!);
  });
});

describe("monthReadout", () => {
  it("reads out a month's points, calls and hangouts only when there were any", () => {
    const bars = activityBars({
      months: [month("2024-03", 18, 42)],
      points: [points("2024-03", { directThem: 42.3, directYou: 18, calls: 25, callSeconds: 1800, hangouts: 100, hangoutCount: 1 }), points("2024-05", { directYou: 1200 })],
    }, false);
    expect(monthReadout(bars, 0)).toBe("Mar 2024 · them 42 · you 18 · calls 25 · hangouts 100");
    expect(monthReadout(bars, 1)).toBe("Apr 2024 · them 0 · you 0");
    expect(monthReadout(bars, 2)).toBe("May 2024 · them 0 · you 1,200");
  });

  it("reads out what made the points up", () => {
    const bars = activityBars({
      months: [month("2024-03", 18, 1)],
      points: [points("2024-03", { calls: 25, callSeconds: 1800, hangouts: 200, hangoutCount: 2 })],
    }, false);
    expect(monthCounts(bars, 0)).toBe("1 message from them, 18 from you · 30 min of calls · 2 hangouts");
    expect(monthCounts(activityBars({ months: [], points: [points("2024-03", { calls: 0, callSeconds: 120 })] }, false), 0)).toBe("2 min of calls");
  });
});

it("names a month", () => {
  expect(monthName("2024-03")).toBe("Mar 2024");
  expect(monthName("2026-12")).toBe("Dec 2026");
});
