// The Calendar view's working out (CalendarPage.tsx draws it): the month as
// weeks, Monday first, filled out with the days either side; who Hide leaves out; what each day adds up to, one-to-one
// chats only or with group chats; and how strongly a day is shaded.
//
// Hide leaves out people, as on every view, and a chat, call or catch-up goes
// with them only when everyone in it but you are left out: a group
// chat with one friend still in it shows whole, and a chat with only
// you in it (your notes to yourself) always shows. Messages "With groups",
// in the Calendar's settings in the menu (viewSettings.ts; "One-to-one" until
// chosen, then remembered in this browser), adds group chats to the day panel
// and to what the calendar counts and shades; without it, both are one-to-one
// chats only. Calls and catch-ups count either way.

import type { CalendarChat, CalendarDay, CalendarDayCounts, CalendarMonth, CalendarTagged } from "../archive.ts";
import { catchUpHoursOn } from "../catchUps.ts";
import { keptSetting, useStore } from "../keptSetting.ts";
import { addDays, addMonths, isDay, isMonth, monthDays } from "../time.ts";
import { VIEWS } from "../views.ts";
import { hides, type HideChoices } from "./hideChoices.ts";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The month's weeks, Monday first: each seven days (YYYY-MM-DD), filled out before the 1st and after the last with the
 * days of the month before and after, as a wall calendar is.
 */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [year, m] = month.split("-").map(Number);
  // getUTCDay counts from Sunday; the weeks here start on Monday.
  const lead = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((lead + monthDays(month).length) / 7);
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, i) => addDays(first, week * 7 + i - lead)));
}

/** The months either side of `month` that its grid shows days of. */
export function neighbourMonths(month: string): string[] {
  const days = monthGrid(month).flat();
  return [days[0], days.at(-1)!].filter((day) => !day.startsWith(month)).map((day) => day.slice(0, 7));
}

/** The totals of the days `month`'s grid shows from the months either side, out of those months as loaded. */
export function neighbourTotals(month: string, neighbours: readonly CalendarMonth[], hide: HideChoices, groups: boolean): Map<string, DayTotals> {
  const shown = new Set(monthGrid(month).flat().filter((day) => !day.startsWith(month)));
  const totals = new Map<string, DayTotals>();
  for (const neighbour of neighbours) {
    for (const [day, t] of monthTotals(neighbour, hide, groups)) if (shown.has(day)) totals.set(day, t);
  }
  return totals;
}

/** Everyone Hide leaves out: anyone with a tag switched on there. */
export function hiddenPeople(people: readonly CalendarTagged[], hide: HideChoices): Set<number> {
  return new Set(people.filter((person) => person.tags.some((tag) => hides(hide, tag))).map((person) => person.id));
}

/** Whether something with these people in it shows: anyone in it is not hidden, or nobody but you are in it. */
export function shownWith(people: readonly number[], hidden: ReadonlySet<number>): boolean {
  return people.length === 0 || people.some((id) => !hidden.has(id));
}

/** What a day adds up to, as the calendar and the day panel show it. */
export interface DayTotals {
  /** Messages in the chats shown (with or without group chats). */
  messages: number;
  chats: number;
  /** Group chat messages left out while group messages are not included (0 while they are). */
  groupMessages: number;
  groupChats: number;
  /** Calls, how many of them were not answered, and how long the answered ones were connected. */
  calls: number;
  missed: number;
  callSeconds: number;
  catchUps: number;
  catchUpHours: number;
}

export const NO_TOTALS: DayTotals = { messages: 0, chats: 0, groupMessages: 0, groupChats: 0, calls: 0, missed: 0, callSeconds: 0, catchUps: 0, catchUpHours: 0 };

/** One day's totals, given every chat by id, who is hidden, and whether group chats count. */
export function dayTotals(day: CalendarDayCounts, chats: ReadonlyMap<number, CalendarChat>, hidden: ReadonlySet<number>, groups: boolean): DayTotals {
  const totals = { ...NO_TOTALS };
  for (const { chat, messages } of day.chats) {
    const info = chats.get(chat);
    if (!info || !shownWith(info.people, hidden)) continue;
    if (info.type === "direct" || groups) {
      totals.messages += messages;
      totals.chats++;
    } else {
      totals.groupMessages += messages;
      totals.groupChats++;
    }
  }
  // A call with several people (logged, or an app's in no chat) is one call, shown while anyone on it is.
  const counted = new Set<number>();
  for (const call of day.calls) {
    if (!shownWith([call.person], hidden)) continue;
    if (call.group !== null) {
      if (counted.has(call.group)) continue;
      counted.add(call.group);
    }
    totals.calls++;
    if (call.answered) totals.callSeconds += call.seconds;
    else totals.missed++;
  }
  for (const catchUp of day.catchUps) {
    if (!shownWith(catchUp.people, hidden)) continue;
    totals.catchUps++;
    totals.catchUpHours += catchUp.hours;
  }
  return totals;
}

/** Every day of a month with anything shown, and its totals. */
export function monthTotals(month: CalendarMonth, hide: HideChoices, groups: boolean): Map<string, DayTotals> {
  const chats = new Map(month.chats.map((chat) => [chat.id, chat]));
  const hidden = hiddenPeople(month.people, hide);
  return new Map(month.days.map((day) => [day.day, dayTotals(day, chats, hidden, groups)]));
}

/** A day of the day panel, counted as the calendar counts it, so the two always agree. */
export function calendarDayTotals(day: CalendarDay, hidden: ReadonlySet<number>, groups: boolean): DayTotals {
  return dayTotals({
    day: day.day,
    chats: day.chats.map((chat) => ({ chat: chat.id, messages: chat.messages })),
    calls: day.calls.map((call) => ({ person: call.person, answered: call.answered, seconds: call.durationSeconds, group: call.group })),
    catchUps: day.catchUps.map((catchUp) => ({ id: catchUp.id, people: catchUp.people.map((p) => p.id), hours: catchUpHoursOn(catchUp, day.day) })),
  }, new Map(day.chats.map((chat) => [chat.id, chat])), hidden, groups);
}

/** How many hangouts the month had, as Hide leaves them: a trip once, however many of its days are in it. */
export function monthHangouts(month: CalendarMonth, hide: HideChoices): number {
  const hidden = hiddenPeople(month.people, hide);
  return new Set(month.days.flatMap((day) => day.catchUps.filter((c) => shownWith(c.people, hidden)).map((c) => c.id))).size;
}

/** The month's totals added up (a trip once for each of its days; monthHangouts counts it once). */
export function sumTotals(days: Iterable<DayTotals>): DayTotals {
  const sum = { ...NO_TOTALS };
  for (const day of days) for (const key of Object.keys(sum) as Array<keyof DayTotals>) sum[key] += day[key];
  return sum;
}

/**
 * How strongly a day is shaded: 0 with no messages, else up to 1 for the month's busiest day, by the square root of
 * its share of that day's messages: a day with a quarter of the busiest day's messages is shaded half as strongly,
 * so a quiet day still shows beside a busy one while the busy ones stand out.
 */
export function heat(messages: number, busiest: number): number {
  if (messages <= 0 || busiest <= 0) return 0;
  return Math.min(1, Math.sqrt(messages / busiest));
}

/** The same date `months` months on (back, for a negative number), or that month's last day where it is shorter. */
export function shiftMonth(day: string, months: number): string {
  const month = addMonths(day.slice(0, 7), months);
  return `${month}-${String(Math.min(Number(day.slice(8)), monthDays(month).length)).padStart(2, "0")}`;
}

/**
 * Where the address puts the calendar: ?day=YYYY-MM-DD opens that day, in its month; ?month=YYYY-MM shows that month;
 * anything else, today's month.
 */
export function fromAddress(search: string, today: string): { month: string; day: string | null } {
  const params = new URLSearchParams(search);
  const day = params.get("day");
  if (day && isDay(day)) return { month: day.slice(0, 7), day };
  const month = params.get("month");
  return { month: month && isMonth(month) ? month : today.slice(0, 7), day: null };
}

/** The Calendar's path open at `day`, its day panel open (as fromAddress reads it): what the Table's When links to. */
export function calendarDay(day: string): string {
  return `${CALENDAR_PATH}?day=${day}`;
}

const CALENDAR_PATH = VIEWS.find((view) => view.slug === "calendar")!.path;

/** The address's search for a month and the day open, if any: the day, or the month unless it is today's. */
export function toAddress(month: string, day: string | null, today: string): string {
  if (day) return `?day=${day}`;
  return month === today.slice(0, 7) ? "" : `?month=${month}`;
}

/** "Saturday 4 October 2026": a day as its panel's title reads it. */
export function longDay(day: string): string {
  return utcDate(day).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Sat 4 Oct": a day as a back arrow names it. */
export function shortDay(day: string): string {
  return utcDate(day).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "October 2026". */
export function monthTitle(month: string): string {
  return utcDate(`${month}-01`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" }));

function utcDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

// Whether the Calendar counts group messages: one-to-one only until "With groups" is chosen, then remembered in this
// browser.

export const GROUPS_KEY = "friend-map.calendarGroups";

export const includeGroupsStore = keptSetting(GROUPS_KEY, false, (kept) => kept === "true");

export function useIncludeGroups(): boolean {
  return useStore(includeGroupsStore);
}
