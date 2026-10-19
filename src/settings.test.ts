import { describe, expect, it } from "vitest";
import { callDaySeconds, callHours, catchUpCountedDayHours, catchUpCountedHours, catchUpWorth, groupShare, tripCountedHours } from "./catchUps.ts";
import { closenessSettings, DEFAULT_SETTINGS, parseSettings } from "./settings.ts";

const DEFAULTS = {
  trendMonths: 12,
  closenessHalfLifeDays: 90,
  catchUpHourWorth: 50,
  callMinimumMinutes: 5,
  messageReciprocity: 1,
  groupSharedPart: 0.5,
  tripFullHours: 8,
};

describe("parseSettings", () => {
  it("uses the defaults when there is no file", () => {
    expect(DEFAULT_SETTINGS).toEqual(DEFAULTS);
    expect(parseSettings(undefined)).toEqual({ settings: DEFAULTS, problems: [] });
  });

  it("reads the look-back window, in months", () => {
    expect(parseSettings({ trendMonths: 6 })).toEqual({ settings: { ...DEFAULTS, trendMonths: 6 }, problems: [] });
    expect(parseSettings({ trendMonths: 36 }).settings.trendMonths).toBe(36);
    expect(parseSettings({}).settings.trendMonths).toBe(12);
  });

  it("names what is wrong and falls back to the default for it", () => {
    for (const trendMonths of [2, 241, 6.5, "6", null]) {
      const { settings, problems } = parseSettings({ trendMonths });
      expect(settings.trendMonths).toBe(12);
      expect(problems).toEqual(["trendMonths must be a whole number of months from 3 to 240; using 12"]);
    }
    expect(parseSettings({ trendMonth: 6 }).problems).toEqual([
      "trendMonth is not a setting; the settings are trendMonths, closenessHalfLifeDays, catchUpHourWorth, callMinimumMinutes, messageReciprocity, groupSharedPart and tripFullHours",
    ]);
    expect(parseSettings([6]).problems).toEqual([`must be a JSON object, such as ${JSON.stringify(DEFAULTS)}`]);
  });

  it("reads the closeness half-life, in days, checked the same way", () => {
    expect(parseSettings({ closenessHalfLifeDays: 30 })).toEqual({ settings: { ...DEFAULTS, closenessHalfLifeDays: 30 }, problems: [] });
    expect(parseSettings({ trendMonths: 24, closenessHalfLifeDays: 365 }).settings).toEqual({ ...DEFAULTS, trendMonths: 24, closenessHalfLifeDays: 365 });
    for (const closenessHalfLifeDays of [6, 3651, 45.5, "90", null]) {
      const { settings, problems } = parseSettings({ closenessHalfLifeDays, trendMonths: 6 });
      expect(settings).toEqual({ ...DEFAULTS, trendMonths: 6 });
      expect(problems).toEqual(["closenessHalfLifeDays must be a whole number of days from 7 to 3650; using 90"]);
    }
  });

  it("reads what an hour caught up counts as, in messages, from nothing to a thousand", () => {
    const { settings, problems } = parseSettings({ catchUpHourWorth: 80 });
    expect(problems).toEqual([]);
    expect(catchUpWorth(settings, 1)).toBe(80);
    expect(catchUpWorth(settings, 2.5)).toBe(200);
    expect(catchUpWorth(DEFAULTS, 1)).toBe(50);
    expect(parseSettings({ catchUpHourWorth: 0 }).settings.catchUpHourWorth).toBe(0);
    for (const catchUpHourWorth of [-1, 1001, 2.5, "50", null]) {
      const wrong = parseSettings({ catchUpHourWorth, trendMonths: 6 });
      expect(wrong.settings).toEqual({ ...DEFAULTS, trendMonths: 6 });
      expect(wrong.problems).toEqual(["catchUpHourWorth must be a whole number of messages from 0 to 1000; using 50"]);
    }
  });

  it("reads how long a day's calls must be to count, from 0 to 120 minutes, and counts their hours", () => {
    const { settings, problems } = parseSettings({ callMinimumMinutes: 45 });
    expect(problems).toEqual([]);
    expect([callHours(settings, 90 * 60), callHours(settings, 45 * 60), callHours(settings, 45 * 60 - 1)]).toEqual([1.5, 0.75, 0]);
    expect([callHours(DEFAULTS, 5 * 60), callHours(DEFAULTS, 5 * 60 - 1)]).toEqual([1 / 12, 0]);
    expect(callHours({ callMinimumMinutes: 0 }, 0)).toBe(0);
    for (const callMinimumMinutes of [-1, 121, 2.5, "5"]) {
      const wrong = parseSettings({ callMinimumMinutes });
      expect(wrong.settings).toEqual(DEFAULTS);
      expect(wrong.problems).toEqual(["callMinimumMinutes must be a whole number of minutes from 0 to 120; using 5"]);
    }
  });

  it("reads how much a month's direct messages count by their balance, any number from 0 to 1", () => {
    for (const messageReciprocity of [0, 0.5, 0.25, 1]) {
      expect(parseSettings({ messageReciprocity })).toEqual({ settings: { ...DEFAULTS, messageReciprocity }, problems: [] });
    }
    for (const messageReciprocity of [-0.1, 1.5, 2, "1", null, Number.NaN]) {
      const wrong = parseSettings({ messageReciprocity });
      expect(wrong.settings).toEqual(DEFAULTS);
      expect(wrong.problems).toEqual(["messageReciprocity must be a number from 0 to 1; using 1"]);
    }
  });

  it("reads how much of a group's time everyone at it shares, any number from 0 to 1", () => {
    for (const groupSharedPart of [0, 0.25, 1]) {
      expect(parseSettings({ groupSharedPart })).toEqual({ settings: { ...DEFAULTS, groupSharedPart }, problems: [] });
    }
    for (const groupSharedPart of [-0.1, 1.5, "0.5", null]) {
      const wrong = parseSettings({ groupSharedPart });
      expect(wrong.settings).toEqual(DEFAULTS);
      expect(wrong.problems).toEqual(["groupSharedPart must be a number from 0 to 1; using 0.5"]);
    }
  });

  it("names the old catch-up settings as no settings any more", () => {
    const { settings, problems } = parseSettings({ phoneCatchUpWorth: 50 });
    expect(settings).toEqual(DEFAULTS);
    expect(problems[0]).toMatch(/^phoneCatchUpWorth is not a setting; the settings are trendMonths, closenessHalfLifeDays, catchUpHourWorth, callMinimumMinutes, messageReciprocity, groupSharedPart and tripFullHours$/);
  });

  it("gives the closeness score's settings alone, for the Table", () => {
    const all = { ...DEFAULTS, trendMonths: 36 };
    expect(closenessSettings(all)).toEqual({ closenessHalfLifeDays: 90, catchUpHourWorth: 50, callMinimumMinutes: 5, messageReciprocity: 1, groupSharedPart: 0.5, tripFullHours: 8 });
  });

  it("reads how many hours of a trip count whole, from an hour to a year of days, fractions too", () => {
    for (const tripFullHours of [1, 4.5, 8784]) {
      expect(parseSettings({ tripFullHours })).toEqual({ settings: { ...DEFAULTS, tripFullHours }, problems: [] });
    }
    for (const tripFullHours of [0, 0.5, 8785, "8", null]) {
      const wrong = parseSettings({ tripFullHours });
      expect(wrong.settings.tripFullHours).toBe(8);
      expect(wrong.problems).toEqual(["tripFullHours must be a number of hours from 1 to 8784; using 8"]);
    }
  });
});

describe("groupShare", () => {
  const share = (groupSharedPart: number) => (n: number) => groupShare({ groupSharedPart }, n);

  it("gives each of n people half shared, half split: 1/2 + 1/2 ÷ n", () => {
    expect([1, 2, 4, 9, 25].map(share(0.5))).toEqual([1, 0.75, 0.625, 0.5 + 0.5 / 9, 0.52]);
  });

  it("is an equal split with nothing shared, everything with all of it shared, and whole for one person either way", () => {
    expect([1, 2, 4, 9, 25].map(share(0))).toEqual([1, 1 / 2, 1 / 4, 1 / 9, 1 / 25]);
    expect([1, 2, 25].map(share(1))).toEqual([1, 1, 1]);
    expect(share(0.3)(1)).toBe(1);
  });

  it("sets a hangout's worth for each person at it, the unnamed others counted", () => {
    // 2 hours with 4 people: 100 × 5/8.
    expect(catchUpWorth(DEFAULTS, 2, 4)).toBe(62.5);
    // 3 hours with a friend and 2 others: 150 × 2/3.
    expect(catchUpWorth(DEFAULTS, 3, 1, 2)).toBeCloseTo(100);
    expect(catchUpWorth({ ...DEFAULTS, groupSharedPart: 0 }, 2, 4)).toBe(25);
  });

  it("sets a day's call time: one-to-one calls whole, a logged group call at the share, to the second", () => {
    const day = { seconds: 600, groupCalls: [{ seconds: 2700, people: 3 }, { seconds: 61, people: 2 }] };
    expect(callDaySeconds(DEFAULTS, day)).toBe(600 + 1800 + 46);
    expect(callDaySeconds({ groupSharedPart: 0 }, day)).toBe(600 + 900 + 31);
    expect(callDaySeconds(DEFAULTS, { seconds: 300 })).toBe(300);
  });
});

describe("tripCountedHours", () => {
  const counted = (hours: number, tripFullHours = 8) => tripCountedHours({ tripFullHours }, hours);

  it("counts a trip's first 8 hours whole, then 8 × √(hours ÷ 8)", () => {
    expect([2, 8].map((h) => counted(h))).toEqual([2, 8]);
    // A whole day away (14 hours), a weekend, 5 days, 10 days and a month, at 50 messages an hour.
    expect([14, 28, 70, 140, 420].map((h) => Math.round(counted(h) * 50))).toEqual([529, 748, 1183, 1673, 2898]);
    expect(counted(32)).toBe(16);
  });

  it("always counts a longer trip for more, each hour more for less", () => {
    const hours = [1, 7, 8, 9, 14, 100, 1000];
    const each = hours.map((h) => counted(h));
    each.slice(1).forEach((c, i) => expect(c).toBeGreaterThan(each[i]));
    expect(counted(9) - counted(8)).toBeLessThan(1);
    expect(counted(101) - counted(100)).toBeLessThan(counted(15) - counted(14));
  });

  it("is set by tripFullHours: more counts more whole, and a year of days counts every trip whole", () => {
    expect(counted(16, 4)).toBe(8);
    expect(counted(140, 8784)).toBe(140);
  });
});

describe("catchUpCountedDayHours", () => {
  // Made-up: 6 pm on 4 Oct to 2 pm on the 6th, private midnight to 10 am: 6, 14 and 4 hours together, 24 in all.
  const trip = { day: "2026-10-04", time: "18:00", hours: 24, trip: { lastDay: "2026-10-06", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" } };

  it("shares a trip's counted hours out over its days by each one's time together", () => {
    const days = catchUpCountedDayHours(DEFAULTS, trip);
    const all = 8 * Math.sqrt(3);
    expect(days.map((d) => d.day)).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
    [6, 14, 4].forEach((h, i) => expect(days[i].hours).toBeCloseTo((all * h) / 24));
    expect(catchUpCountedHours(DEFAULTS, trip)).toBeCloseTo(all);
  });

  it("leaves a hangout on one date whole, however long", () => {
    const day = { day: "2026-10-04", time: null, hours: 14, trip: null };
    expect(catchUpCountedDayHours(DEFAULTS, day)).toEqual([{ day: "2026-10-04", hours: 14 }]);
    expect(catchUpCountedHours(DEFAULTS, day)).toBe(14);
  });

  it("counts a trip of 8 hours or less whole", () => {
    const short = { ...trip, time: "20:00", trip: { ...trip.trip, lastDay: "2026-10-05", endTime: "12:00" } };
    expect(catchUpCountedDayHours(DEFAULTS, short)).toEqual([{ day: "2026-10-04", hours: 4 }, { day: "2026-10-05", hours: 2 }]);
  });
});
