// A hangout over several days (src/catchUps.ts): the dates it is on, its time together each day, and how it reads.

import { describe, expect, it } from "vitest";
import type { Trip } from "./archive.ts";
import {
  catchUpDayCount, catchUpDayHours, catchUpDays, catchUpHoursOn, catchUpTitle, catchUpWhen, DAYS_MOST, daysLabel, isOnDay, PRIVATE_FROM, PRIVATE_TO, tripDayHours, tripHours,
} from "./catchUps.ts";

/** A trip ending on `lastDay` at `endTime`, private midnight to 10 am unless said. */
const trip = (lastDay: string, endTime = "14:00", privateFrom = PRIVATE_FROM, privateTo = PRIVATE_TO): Trip => ({ lastDay, endTime, privateFrom, privateTo });

describe("a hangout over several days", () => {
  it("is on each date from its first to its last, both counted; one on a single date is on that date alone", () => {
    expect(catchUpDays({ day: "2026-10-04", trip: null })).toEqual(["2026-10-04"]);
    expect(catchUpDays({ day: "2026-09-29", trip: trip("2026-10-02") })).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(catchUpDays({ day: "2025-12-31", trip: trip("2026-01-01") })).toEqual(["2025-12-31", "2026-01-01"]);
    expect(catchUpDays({ day: "2028-02-28", trip: trip("2028-03-01") })).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(catchUpDayCount({ day: "2026-10-04", trip: null })).toBe(1);
    expect(catchUpDayCount({ day: "2026-10-04", trip: trip("2026-10-13") })).toBe(10);
    // Across the change to daylight saving in Melbourne (4 Oct 2026), still a whole number of days.
    expect(catchUpDays({ day: "2026-10-03", trip: trip("2026-10-05") })).toHaveLength(3);
  });

  it("never lists more than DAYS_MOST dates", () => {
    expect(catchUpDays({ day: "2020-01-01", trip: trip("2026-01-01") })).toHaveLength(DAYS_MOST);
  });

  it("is on a date when it falls from its first to its last", () => {
    const away = { day: "2026-10-04", trip: trip("2026-10-13") };
    expect(["2026-10-03", "2026-10-04", "2026-10-09", "2026-10-13", "2026-10-14"].map((day) => isOnDay(away, day))).toEqual([false, true, true, true, false]);
    expect(isOnDay({ day: "2026-10-04", trip: null }, "2026-10-04")).toBe(true);
    expect(isOnDay({ day: "2026-10-04", trip: null }, "2026-10-05")).toBe(false);
  });

  it("counts from when it began to when it ended, less the private window each day", () => {
    // Left at 6 pm, home at 2 pm two days on, private midnight to 10 am: 6 pm to midnight, 10 am to midnight, 10 am to 2 pm.
    expect(tripDayHours("2026-10-04", "18:00", trip("2026-10-06"))).toEqual([
      { day: "2026-10-04", hours: 6 }, { day: "2026-10-05", hours: 14 }, { day: "2026-10-06", hours: 4 },
    ]);
    expect(tripHours("2026-10-04", "18:00", trip("2026-10-06"))).toBe(24);
    // Leaving inside the window counts from its end; ending inside it counts nothing that day.
    expect(tripDayHours("2026-10-04", "06:00", trip("2026-10-05", "08:00")).map((d) => d.hours)).toEqual([14, 0]);
    // No time to begin with: from the day's start.
    expect(tripDayHours("2026-10-04", null, trip("2026-10-05")).map((d) => d.hours)).toEqual([14, 4]);
    // A window across midnight (11 pm to 7 am) is 8 hours a day.
    expect(tripDayHours("2026-10-04", "18:00", trip("2026-10-06", "14:00", "23:00", "07:00")).map((d) => d.hours)).toEqual([5, 16, 7]);
    // The same time twice is no window at all.
    expect(tripDayHours("2026-10-04", "12:00", trip("2026-10-05", "12:00", "09:00", "09:00")).map((d) => d.hours)).toEqual([12, 12]);
    // Minutes count: 7:30 pm to midnight.
    expect(tripDayHours("2026-10-04", "19:30", trip("2026-10-05", "10:00")).map((d) => d.hours)).toEqual([4.5, 0]);
    // Ten whole days away, private midnight to 10 am: 14 hours on each, 140 in all.
    expect(tripHours("2026-10-04", "00:00", trip("2026-10-14", "00:00"))).toBe(140);
  });

  it("counts a hangout on a single date as its hours on it", () => {
    expect(catchUpDayHours({ day: "2026-10-04", time: "19:30", trip: null, hours: 2.5 })).toEqual([{ day: "2026-10-04", hours: 2.5 }]);
    expect(catchUpDayHours({ day: "2026-10-04", time: "18:00", trip: trip("2026-10-05"), hours: 10 })).toEqual([{ day: "2026-10-04", hours: 6 }, { day: "2026-10-05", hours: 4 }]);
    expect(catchUpHoursOn({ day: "2026-10-04", time: "18:00", trip: trip("2026-10-05"), hours: 10 }, "2026-10-05")).toBe(4);
    expect(catchUpHoursOn({ day: "2026-10-04", time: "18:00", trip: trip("2026-10-05"), hours: 10 }, "2026-10-06")).toBe(0);
    expect(catchUpHoursOn({ day: "2026-10-04", time: null, trip: null, hours: 2 }, "2026-10-04")).toBe(2);
  });

  it("reads as its hours over its days and its dates as a range, the month and year said once where they are shared", () => {
    expect(catchUpTitle(34, 3)).toBe("34 hours over 3 days");
    expect(catchUpTitle(2)).toBe("2 hours");
    expect(catchUpWhen("2026-10-04")).toBe("4 Oct 2026");
    expect(catchUpWhen("2026-10-04", null)).toBe("4 Oct 2026");
    expect(catchUpWhen("2026-10-04", "2026-10-13")).toBe("4–13 Oct 2026");
    expect(catchUpWhen("2026-09-28", "2026-10-03")).toBe("28 Sept – 3 Oct 2026");
    expect(catchUpWhen("2025-12-30", "2026-01-02")).toBe("30 Dec 2025 – 2 Jan 2026");
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(10)).toBe("10 days");
  });
});
