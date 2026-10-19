// The Calendar view (calendar.ts, CalendarPage.tsx, DayPanel.tsx): the month
// as weeks, filled out with the days either side, what Hide leaves out, each day's totals with and without group
// chats, the shading, the remembered group choice and the address, and what
// the calendar and the day panel draw.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { CalendarDay, CalendarMonth } from "../archive.ts";
import { nameStyleStore } from "../names.ts";
import { ReadOnly } from "../readOnly.ts";
import { calendarDay, calendarDayTotals, dayTotals, fromAddress, heat, hiddenPeople, GROUPS_KEY, includeGroupsStore, monthGrid, monthHangouts, monthTotals, neighbourMonths, neighbourTotals, NO_TOTALS, shiftMonth, shownWith, sumTotals, toAddress } from "./calendar.ts";
import { dayLabel, MonthNav, MonthView } from "./CalendarPage.tsx";
import { DayContent } from "./DayPanel.tsx";

afterEach(() => nameStyleStore.set("full"));

/**
 * October 2026: Ada (1) and Bo (2) talk one-to-one with you; Cy (3, archived) only writes to you; a group
 * chat (13) holds Ada, Bo and Cy; another (14) only Cy and Dee (4, tagged commercial); and a chat with nobody but
 * you (15), your notes to yourself.
 */
const month: CalendarMonth = {
  month: "2026-10",
  span: { first: "2019-03-02", last: "2026-10-05" },
  chats: [
    { id: 11, type: "direct", people: [1] },
    { id: 12, type: "direct", people: [3] },
    { id: 13, type: "group", people: [1, 2, 3] },
    { id: 14, type: "group", people: [3, 4] },
    { id: 15, type: "direct", people: [] },
    { id: 16, type: "direct", people: [2] },
  ],
  people: [{ id: 1, tags: [] }, { id: 2, tags: ["climbing"] }, { id: 3, tags: ["archive"] }, { id: 4, tags: ["commercial"] }],
  days: [
    {
      day: "2026-10-04",
      chats: [{ chat: 11, messages: 40 }, { chat: 12, messages: 7 }, { chat: 13, messages: 300 }, { chat: 14, messages: 50 }, { chat: 15, messages: 2 }],
      calls: [{ person: 1, answered: true, seconds: 1860, group: null }, { person: 3, answered: false, seconds: 0, group: null }, { person: 2, answered: false, seconds: 0, group: null }],
      catchUps: [{ id: 1, people: [1, 2], hours: 3 }, { id: 2, people: [3], hours: 1 }],
    },
    { day: "2026-10-05", chats: [{ chat: 16, messages: 10 }], calls: [], catchUps: [] },
  ],
};

describe("the month", () => {
  it("is laid out in weeks, Monday first, filled out with the days of the months before and after", () => {
    const weeks = monthGrid("2026-10");
    // 1 October 2026 is a Thursday.
    expect(weeks[0]).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.at(-1)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(weeks).toHaveLength(5);
    expect(neighbourMonths("2026-10")).toEqual(["2026-09", "2026-11"]);
    // February 2027 starts on a Monday and ends on a Sunday: four whole weeks, nothing either side.
    expect(monthGrid("2027-02")).toHaveLength(4);
    expect(monthGrid("2027-02").flat().every((day) => day.startsWith("2027-02"))).toBe(true);
    expect(neighbourMonths("2027-02")).toEqual([]);
    // A month starting on a Monday fills out only its end; across a year's end too.
    expect(neighbourMonths("2026-06")).toEqual(["2026-07"]);
    expect(monthGrid("2026-12").at(-1)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    // And a month can take six rows.
    expect(monthGrid("2026-08")).toHaveLength(6);
  });

  it("takes the days it shows from the months either side out of theirs, as Hide leaves them", () => {
    const september: CalendarMonth = {
      ...month,
      month: "2026-09",
      days: [
        { day: "2026-09-27", chats: [{ chat: 11, messages: 5 }], calls: [], catchUps: [] },
        { day: "2026-09-29", chats: [], calls: [], catchUps: [{ id: 3, people: [1], hours: 2 }, { id: 4, people: [3], hours: 1 }] },
      ],
    };
    const around = neighbourTotals("2026-10", [september], {}, false);
    // The 27th is a Sunday, in the week before October's first.
    expect([...around.keys()]).toEqual(["2026-09-29"]);
    expect(around.get("2026-09-29")).toMatchObject({ catchUps: 1, catchUpHours: 2 });
    expect(neighbourTotals("2026-10", [september], { archive: false }, false).get("2026-09-29")).toMatchObject({ catchUps: 2 });
  });

  it("moves by months to the same date, or the month's last day where it is shorter", () => {
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonth("2024-03-31", -1)).toBe("2024-02-29");
    expect(shiftMonth("2026-10-04", -12)).toBe("2025-10-04");
  });
});

describe("Hide", () => {
  it("leaves out everyone with a tag switched on, archive and commercial to start with", () => {
    expect([...hiddenPeople(month.people, {})].sort()).toEqual([3, 4]);
    expect([...hiddenPeople(month.people, { archive: false })]).toEqual([4]);
    expect([...hiddenPeople(month.people, { climbing: true, commercial: false })].sort()).toEqual([2, 3]);
  });

  it("leaves out a chat, call or catch-up only when everyone in it but you are left out", () => {
    const hidden = new Set([3, 4]);
    expect(shownWith([1, 3], hidden)).toBe(true);
    expect(shownWith([3, 4], hidden)).toBe(false);
    expect(shownWith([3], hidden)).toBe(false);
    expect(shownWith([], hidden)).toBe(true);
  });
});

describe("a day's totals", () => {
  const chats = new Map(month.chats.map((chat) => [chat.id, chat]));
  const day = month.days[0];

  it("counts one-to-one chats only, and the group messages left out, until group messages are included", () => {
    expect(dayTotals(day, chats, new Set([3, 4]), false)).toEqual({
      // Ada's chat and your own notes; the archived Cy's chat is left out.
      messages: 42, chats: 2,
      // The group with Ada and Bo in it shows whole; the one with only Cy and Dee does not.
      groupMessages: 300, groupChats: 1,
      // Ada's call and Bo's missed one; Cy's is left out.
      calls: 2, missed: 1, callSeconds: 1860,
      catchUps: 1, catchUpHours: 3,
    });
    expect(dayTotals(day, chats, new Set([3, 4]), true)).toMatchObject({ messages: 342, chats: 3, groupMessages: 0, groupChats: 0 });
    // With Hide off, everything.
    expect(dayTotals(day, chats, new Set(), true)).toMatchObject({ messages: 399, chats: 5, calls: 3, missed: 2, catchUps: 2, catchUpHours: 4 });
  });

  it("counts a call logged with several people once, while anyone on it is shown", () => {
    const group = { ...day, chats: [], catchUps: [], calls: [1, 2, 3].map((person) => ({ person, answered: true, seconds: 2700, group: 9 })) };
    expect(dayTotals(group, chats, new Set(), false)).toMatchObject({ calls: 1, callSeconds: 2700 });
    expect(dayTotals(group, chats, new Set([1, 3]), false)).toMatchObject({ calls: 1, callSeconds: 2700 });
    expect(dayTotals(group, chats, new Set([1, 2, 3]), false)).toMatchObject({ calls: 0 });
  });

  it("adds up a month, and a day panel's day the same way the calendar does", () => {
    const totals = monthTotals(month, {}, false);
    expect([...totals.keys()]).toEqual(["2026-10-04", "2026-10-05"]);
    expect(sumTotals(totals.values())).toMatchObject({ messages: 52, chats: 3, calls: 2, catchUps: 1 });
    expect(sumTotals([])).toEqual(NO_TOTALS);
    const panelDay: CalendarDay = {
      day: "2026-10-04",
      catchUps: [{ id: 1, day: "2026-10-04", time: null, hours: 3, trip: null, byCall: false, note: "dinner", others: 0, people: [person(1), person(2)] }],
      calls: [{ id: 1, platform: "phone", messageId: null, manual: false, accountId: 9, person: 1, at: Date.parse("2026-10-04T18:00:00+11:00"), durationSeconds: 1860, direction: "outgoing", answered: true, service: "phone", group: null, people: 1, others: 0, note: "" }],
      chats: [chat(11, "direct", [1], 40), chat(13, "group", [1, 2, 3], 300), chat(12, "direct", [3], 7)],
      people: [1, 2, 3].map((id) => ({ ...person(id), tags: id === 3 ? ["archive"] : [], identiconSeed: "a1b2", identiconHue: null })),
    };
    expect(calendarDayTotals(panelDay, new Set([3]), false)).toMatchObject({ messages: 40, chats: 1, groupMessages: 300, calls: 1, catchUps: 1 });
  });
});

describe("the shading", () => {
  it("is nothing without messages, the strongest on the month's busiest day, and a quarter of it shaded half as strongly", () => {
    expect(heat(0, 100)).toBe(0);
    expect(heat(100, 100)).toBe(1);
    expect(heat(25, 100)).toBeCloseTo(0.5);
    expect(heat(1, 400)).toBeCloseTo(0.05);
    expect(heat(5, 0)).toBe(0);
  });
});

describe("counting group messages", () => {
  const storage = () => {
    const items = new Map<string, string>();
    return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) };
  };

  it("is off until chosen, then remembered, as it was kept before; without storage it is off and still changes", () => {
    const kept = storage();
    includeGroupsStore.reload(kept);
    expect(includeGroupsStore.get()).toBe(false);
    includeGroupsStore.set(true);
    expect(kept.items.get(GROUPS_KEY)).toBe("true");
    includeGroupsStore.reload(kept);
    expect(includeGroupsStore.get()).toBe(true);
    includeGroupsStore.set(false);
    includeGroupsStore.reload(kept);
    expect(includeGroupsStore.get()).toBe(false);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    includeGroupsStore.reload(broken);
    expect(includeGroupsStore.get()).toBe(false);
    expect(() => includeGroupsStore.set(true)).not.toThrow();
    expect(includeGroupsStore.get()).toBe(true);
    includeGroupsStore.reload(storage());
  });
});

describe("the address", () => {
  it("opens on today's month, or the month or day it names, and names them back", () => {
    expect(fromAddress("", "2026-10-06")).toEqual({ month: "2026-10", day: null });
    expect(fromAddress("?month=2019-03", "2026-10-06")).toEqual({ month: "2019-03", day: null });
    expect(fromAddress("?day=2024-02-29", "2026-10-06")).toEqual({ month: "2024-02", day: "2024-02-29" });
    expect(fromAddress("?day=2026-02-30&month=nope", "2026-10-06")).toEqual({ month: "2026-10", day: null });
    expect(toAddress("2026-10", null, "2026-10-06")).toBe("");
    expect(toAddress("2019-03", null, "2026-10-06")).toBe("?month=2019-03");
    expect(toAddress("2019-03", "2019-03-02", "2026-10-06")).toBe("?day=2019-03-02");
  });

  it("is where the Table's When links to: the Calendar, open at that day", () => {
    const [path, search] = calendarDay("2019-03-02").split("?");
    expect(path).toBe("/calendar");
    expect(fromAddress(`?${search}`, "2026-10-06")).toEqual({ month: "2019-03", day: "2019-03-02" });
  });
});

describe("the calendar as drawn", () => {
  const totals = monthTotals(month, {}, false);
  const draw = (open: string | null = null) => renderToStaticMarkup(createElement(MonthView, {
    month: "2026-10", today: "2026-10-05", totals, open, onOpen: () => {}, onMonth: () => {},
  }));

  it("draws every day with its count and marks, the busiest shaded strongest, today and the open day marked", () => {
    const html = draw("2026-10-04");
    expect(html.match(/class="calendar__day[ "]/g)).toHaveLength(35);
    expect(html.match(/calendar__day--outside/g)).toHaveLength(4);
    expect(html).toMatch(/data-day="2026-10-04"[^>]*aria-pressed="true"[^>]*aria-label="Sunday 4 October 2026: 42 messages in 2 chats, 2 calls \(1 missed\), 1 hangout" style="--heat:1.000"/);
    // 10 messages against the busiest day's 42.
    expect(html).toMatch(/data-day="2026-10-05"[^>]*aria-label="Monday 5 October 2026, today: 10 messages in 1 chat"[^>]*--heat:0.488/);
    expect(html).toContain("calendar__day calendar__day--today");
    expect(html).toMatch(/data-day="2026-10-06"[^>]*tabindex="-1"[^>]*aria-label="Tuesday 6 October 2026: nothing"/);
    expect(html).toContain('class="calendar__mark calendar__mark--catch-up"></span><span class="calendar__mark calendar__mark--call"></span><span class="calendar__mark calendar__mark--missed"></span>');
    // The keyboard is on the open day.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/tabindex="0"[^>]*aria-label="Sunday 4 October/);
  });

  it("draws the days either side muted and unshaded, with their counts and marks", () => {
    const around = new Map([["2026-09-29", { ...NO_TOTALS, messages: 99, chats: 1, catchUps: 1, catchUpHours: 2 }]]);
    const html = renderToStaticMarkup(createElement(MonthView, {
      month: "2026-10", today: "2026-10-05", totals, around, open: null, onOpen: () => {}, onMonth: () => {},
    }));
    expect(html).toMatch(/class="calendar__day calendar__day--outside" data-day="2026-09-29" tabindex="-1"[^>]*aria-label="Tuesday 29 September 2026: 99 messages in 1 chat, 1 hangout" style="--heat:0.000"/);
    expect(html).toMatch(/data-day="2026-09-29"[^]*?calendar__count">99<[^]*?calendar__mark--catch-up/);
    expect(html).toMatch(/class="calendar__day calendar__day--outside calendar__day--future" data-day="2026-11-01"/);
    // October's shading is October's own: its busiest day is still the strongest.
    expect(html).toMatch(/data-day="2026-10-04"[^>]*--heat:1.000/);
  });

  it("puts the keyboard on today when no day is open", () => {
    expect(draw()).toMatch(/data-day="2026-10-05" tabindex="0"/);
  });

  it("names the day of a screen reader's nothing, and the month's navigation from the first year with anything", () => {
    expect(dayLabel("2026-10-07", undefined)).toBe("Wednesday 7 October 2026: nothing");
    const nav = renderToStaticMarkup(createElement(MonthNav, { month: "2026-10", today: "2026-10-06", span: month.span, onMonth: () => {} }));
    expect([...nav.matchAll(/<option value="(\d{4})"/g)].map((m) => m[1])).toEqual(["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"]);
    expect(nav).toMatch(/<option value="10" selected="">October<\/option>/);
    expect(nav).toMatch(/<button type="button" class="demos__method calendar__today" disabled="">Today<\/button>/);
  });
});

describe("a trip on the calendar", () => {
  // Ada and Bo away from 6 pm on 4 Oct to 2 pm on the 6th, private midnight to 10 am: 6 hours, then 14, then 4.
  const trip = {
    id: 9, day: "2026-10-04", time: "18:00", trip: { lastDay: "2026-10-06", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" },
    hours: 24, byCall: false, note: "", others: 0, people: [person(1), person(2)],
  };
  const on = (day: string): CalendarDay => ({
    day, catchUps: [trip], calls: [], chats: [], people: [1, 2].map((id) => ({ ...person(id), tags: [], identiconSeed: "a1b2", identiconHue: null })),
  });
  const draw = (day: string) => renderToStaticMarkup(createElement(DayContent, { data: on(day), hide: {}, groups: false, onOpenPerson: () => {} }));

  it("is on each of its days with that day's time together, saying which day of it this is", () => {
    expect(calendarDayTotals(on("2026-10-05"), new Set(), false)).toMatchObject({ catchUps: 1, catchUpHours: 14 });
    expect(draw("2026-10-04")).toContain("6:00 pm · <strong>6 hours</strong> with ");
    const middle = draw("2026-10-05");
    expect(middle).toContain("<strong>14 hours</strong> with ");
    expect(middle).not.toContain("6:00 pm");
    expect(middle).toContain(" · day 2 of 3, 4–6 Oct 2026, 24 hours in all</span>");
    expect(draw("2026-10-06")).toContain("until 2:00 pm · <strong>4 hours</strong> with ");
  });

  it("counts once in the month's hangouts, as Hide leaves it", () => {
    const days = ["2026-10-04", "2026-10-05", "2026-10-06"].map((day, i) => ({ day, chats: [], calls: [], catchUps: [{ id: 9, people: [1, 2], hours: [6, 14, 4][i] }] }));
    const october: CalendarMonth = { ...month, days: [...days, { day: "2026-10-07", chats: [], calls: [], catchUps: [{ id: 10, people: [3], hours: 2 }] }] };
    // Cy (3) is archived, so Hide leaves out the hangout only they were at, until archived people are shown.
    expect(monthHangouts(october, {})).toBe(1);
    expect(monthHangouts(october, { archive: false })).toBe(2);
    // Each day's totals have the trip that day, for its mark.
    expect(sumTotals(monthTotals(october, { archive: false }, false).values())).toMatchObject({ catchUps: 4, catchUpHours: 26 });
  });
});

describe("the day panel as drawn", () => {
  const data: CalendarDay = {
    day: "2026-10-04",
    catchUps: [{ id: 1, day: "2026-10-04", time: "19:30", hours: 3, trip: null, byCall: false, note: "Dinner at the noodle place", others: 2, people: [person(1), person(2)] }],
    calls: [
      { id: 1, platform: "phone", messageId: null, manual: false, accountId: 9, person: 1, at: Date.parse("2026-10-04T18:05:00+11:00"), durationSeconds: 1860, direction: "outgoing", answered: true, service: "phone", group: null, people: 1, others: 0, note: "" },
      { id: 2, platform: "phone", messageId: null, manual: false, accountId: 8, person: 3, at: Date.parse("2026-10-04T19:00:00+11:00"), durationSeconds: 0, direction: "incoming", answered: false, service: "phone", group: null, people: 1, others: 0, note: "" },
    ],
    chats: [chat(11, "direct", [1], 40), chat(13, "group", [1, 2, 3], 300), chat(12, "direct", [3], 7), chat(15, "direct", [], 2)],
    people: [1, 2, 3].map((id) => ({ ...person(id), tags: id === 3 ? ["archive"] : [], identiconSeed: "a1b2c3d4", identiconHue: null })),
  };
  const draw = (groups: boolean, hide = {}) =>
    renderToStaticMarkup(createElement(DayContent, { data, hide, groups, onOpenPerson: () => {} }));

  it("gives the day's totals, its catch-ups and calls, and its one-to-one chats, each headed by whoever it is with", () => {
    const html = draw(false);
    expect(html).toContain("<strong>42</strong> messages in 2 chats");
    expect(html).toContain("<strong>1</strong> call · 31 min");
    expect(html).toContain("<strong>1</strong> hangout · 3 hours");
    expect(html).toContain(">Not counting 300 group messages in 1 group</p>");
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain("Ada Example</button></span><span> and <button");
    expect(html).toContain("+2 others");
    expect(html).toContain("7:30 pm · <strong>3 hours</strong> with ");
    expect(html).not.toContain("by call");
    expect(html).toContain("Dinner at the noodle place");
    expect(html).toContain("Call · 31 min");
    // The archived Cy's missed call and chat are left out; the group too, until included.
    expect(html).not.toContain("Cy Example");
    expect(html).not.toContain("Missed call");
    const heads = [...html.matchAll(/<h4 class="day-chat__head">(.*?)<\/h4>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
    expect(heads).toEqual(["Ada ExampleMessenger · 40 messages · 9:00 am – 5:00 pm", "Notes to yourselfMessenger · 2 messages · 9:00 am – 5:00 pm"]);
  });

  it("lists a call you logged with the phone's, on its app, said to be yours", () => {
    const logged = { id: 1, platform: "facetime", messageId: null, manual: true, accountId: null, person: 2, at: Date.parse("2026-10-04T20:00:00+11:00"), durationSeconds: 1500, direction: null, answered: true, service: null, group: 1, people: 1, others: 0, note: "" };
    const html = renderToStaticMarkup(createElement(DayContent, {
      data: { ...data, calls: [...data.calls, logged] }, hide: {}, groups: false, onOpenPerson: () => {},
    }));
    expect(html).toContain("<strong>2</strong> calls · 56 min");
    expect(html).toMatch(/Bo Example<\/button><span class="muted"> · on FaceTime, logged by you<\/span><\/span><span>Call · 25 min<\/span>/);
  });

  it("lists a call logged with several people as one row, everyone on it on their platform", () => {
    const on = (id: number, person: number, platform: string) => ({
      id, platform, messageId: null, manual: true, accountId: id, person, at: Date.parse("2026-10-04T20:00:00+11:00"), durationSeconds: 2700, direction: null, answered: true, service: null, group: 7, people: 2, others: 0, note: "",
    });
    const html = renderToStaticMarkup(createElement(DayContent, {
      data: { ...data, calls: [...data.calls, on(7, 1, "discord"), on(8, 2, "phone")] }, hide: {}, groups: false, onOpenPerson: () => {},
    }));
    expect(html).toContain("<strong>2</strong> calls · 1 h 16 min");
    expect(html).toMatch(/Ada Example<\/button> <span class="muted">on Discord<\/span><\/span><span> and <button[^>]*>Bo Example<\/button> <span class="muted">on Phone<\/span><\/span><span class="muted"> · logged by you<\/span><\/span><span>Call · 45 min<\/span>/);
  });

  it("lists an app's call with several people in no chat as one row, everyone named, its unnamed others counted, and a logged group of the same number apart", () => {
    const on = (id: number, person: number) => ({
      id, platform: "whatsapp", messageId: null, manual: false, accountId: id, person, at: Date.parse("2026-10-04T20:00:00+11:00"), durationSeconds: 2400,
      direction: "incoming" as const, answered: true, service: "video" as const, group: -7, people: 3, others: 1, note: "",
    });
    const logged = { ...on(7, 2), platform: "phone", manual: true, direction: null, service: null, group: 7, people: 1, others: 0, durationSeconds: 600 };
    const html = renderToStaticMarkup(createElement(DayContent, {
      data: { ...data, calls: [...data.calls, on(7, 1), on(8, 2), logged] }, hide: {}, groups: false, onOpenPerson: () => {},
    }));
    expect(html).toContain("<strong>3</strong> calls · 1 h 21 min");
    expect(html).toMatch(/Ada Example<\/button><\/span><span> and <button[^>]*>Bo Example<\/button><\/span><span class="muted"> \+1 other<\/span><span class="muted"> · on WhatsApp, they called<\/span><\/span><span>Video call · 40 min<\/span>/);
    expect(html).toMatch(/Bo Example<\/button><span class="muted"> · on Phone, logged by you<\/span><\/span><span>Call · 10 min<\/span>/);
  });

  it("says a catch-up by call was by call, after its hours", () => {
    const html = renderToStaticMarkup(createElement(DayContent, {
      data: { ...data, catchUps: [{ ...data.catchUps[0], byCall: true }] }, hide: {}, groups: false, onOpenPerson: () => {},
    }));
    expect(html).toContain("7:30 pm · <strong>3 hours</strong> by call with ");
  });

  it("adds the group chats with group messages included, named by their people when untitled", () => {
    const html = draw(true);
    expect(html).toContain("<strong>342</strong> messages in 3 chats");
    expect(html).toContain('day-chat__group">Ada Example, Bo Example and 1 more</span>');
    expect(html).toContain("Messenger · 4 people · 300 messages");
    expect(html).not.toContain("Not counting");
  });

  it("shows what Hide leaves out once its tag is switched off", () => {
    const html = draw(false, { archive: false });
    expect(html).toContain("Cy Example");
    expect(html).toContain("Missed call");
    expect(html).toContain("<strong>49</strong> messages in 3 chats");
  });

  it("shows no name and no note with No name except…, but every name with No name, which is for the map alone", () => {
    nameStyleStore.set("hide");
    expect(draw(true)).toContain("Bo Example");
    nameStyleStore.set("except");
    const html = draw(true);
    for (const name of ["Ada", "Bo Example", "noodle"]) expect(html).not.toContain(name);
    expect(html).toContain("Note hidden");
    expect(html).toContain('class="name-hidden"');
  });

  it("offers Add event on the day, but not on a read-only page or a day still to come", () => {
    const html = draw(false);
    expect(html).toMatch(/<h3>Hangout<\/h3><button type="button" class="link-button day-panel__add">Add event<\/button>/);
    const empty: CalendarDay = { day: "2026-10-07", catchUps: [], calls: [], chats: [], people: [] };
    const drawDay = (day: CalendarDay, readOnly = false) => renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly },
      createElement(DayContent, { data: day, hide: {}, groups: false, onOpenPerson: () => {} })));
    expect(drawDay(empty)).toContain("<h3>Hangouts</h3><button");
    expect(drawDay(empty, true)).not.toContain("Add event");
    expect(drawDay(data, true)).not.toContain("Add event");
    expect(drawDay(data, true)).toContain("<h3>Hangout</h3>");
    expect(drawDay({ ...empty, day: "2999-01-01" })).not.toContain("Add event");
  });

  it("says when there is nothing on the day, or nothing but group messages", () => {
    const empty: CalendarDay = { day: "2026-10-07", catchUps: [], calls: [], chats: [], people: [] };
    expect(renderToStaticMarkup(createElement(DayContent, { data: empty, hide: {}, groups: false, onOpenPerson: () => {} }))).toContain("Nothing on this day.");
    const groupsOnly = { ...data, catchUps: [], calls: [], chats: [data.chats[1]] };
    expect(renderToStaticMarkup(createElement(DayContent, { data: groupsOnly, hide: {}, groups: false, onOpenPerson: () => {} }))).toContain("Nothing here but group messages.");
  });
});

function person(id: number) {
  return { id, name: ["", "Ada Example", "Bo Example", "Cy Example"][id], aliases: [] };
}

function chat(id: number, type: "direct" | "group", people: number[], messages: number) {
  return {
    id, type, people, platform: "messenger", title: null, size: 1 + people.length,
    namedBy: type === "group" ? people.slice(0, 2).map(person) : [],
    messages, first: Date.parse("2026-10-04T09:00:00+11:00"), last: Date.parse("2026-10-04T17:00:00+11:00"),
  };
}
