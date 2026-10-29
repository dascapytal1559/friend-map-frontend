import { describe, expect, it } from "vitest";
import type { CatchUp, PersonCall } from "./archive.ts";
import { aimAt, callMoment, catchUpMoment, chatDays, dayWindow, isMarked, loadingAllLabel, momentCursor, momentKey, sameDay, withEvents, withNewest } from "./chatDays.ts";

const at = (iso: string, id: number) => ({ id, sentAt: Date.parse(iso) });

describe("chatDays", () => {
  it("turns newest-first pages into Melbourne days read oldest to newest", () => {
    const newestFirst = [
      at("2026-02-02T09:00:00+11:00", 5),
      at("2026-02-01T23:30:00+11:00", 4),
      at("2026-02-01T08:00:00+11:00", 3),
      // 8:30 am on 1 February in Melbourne is 31 January in UTC; it belongs to 1 February.
      at("2026-02-01T08:30:00+11:00", 2),
      at("2026-01-30T12:00:00+11:00", 1),
    ].sort((a, b) => b.sentAt - a.sentAt);
    expect(chatDays(newestFirst).map(({ day, messages }) => [day, messages.map((m) => m.id)])).toEqual([
      ["2026-01-30", [1]],
      ["2026-02-01", [3, 2, 4]],
      ["2026-02-02", [5]],
    ]);
  });

  it("puts an older page's messages above what is shown, joining a day split across pages", () => {
    const firstPage = [at("2026-02-01T20:00:00+11:00", 3), at("2026-02-01T10:00:00+11:00", 2)];
    const olderPage = [at("2026-02-01T09:00:00+11:00", 1), at("2026-01-31T09:00:00+11:00", 0)];
    expect(chatDays([...firstPage, ...olderPage]).map(({ day, messages }) => [day, messages.map((m) => m.id)])).toEqual([
      ["2026-01-31", [0]],
      ["2026-02-01", [1, 2, 3]],
    ]);
  });

  it("has no days without messages", () => {
    expect(chatDays([])).toEqual([]);
  });
});

describe("sameDay", () => {
  it("tells a day an older page added to from one left as it was", () => {
    const day = { day: "2026-02-01", messages: [at("2026-02-01T10:00:00+11:00", 2), at("2026-02-01T20:00:00+11:00", 3)] };
    expect(sameDay(day, { ...day, messages: [...day.messages] })).toBe(true);
    expect(sameDay(day, { ...day, messages: [at("2026-02-01T09:00:00+11:00", 1), ...day.messages] })).toBe(false);
    expect(sameDay(day, { ...day, day: "2026-02-02" })).toBe(false);
    // The same count and first message, but an entry in it loaded again (a catch-up changed): drawn again.
    expect(sameDay(day, { ...day, messages: [day.messages[0], { ...day.messages[1] }] })).toBe(false);
  });
});

describe("withNewest", () => {
  // Three pages loaded, newest first: ids 150 down to 1, a minute apart.
  const minute = (id: number) => ({ id, sentAt: Date.parse("2026-02-01T09:00:00+11:00") + id * 60_000 });
  const shown = Array.from({ length: 150 }, (_, i) => minute(150 - i));

  it("adds new messages at the bottom and keeps every page already loaded", () => {
    // The newest page again: two new messages, then the newest 48 already shown.
    const newest = [minute(152), minute(151), ...shown.slice(0, 48)];
    const chat = withNewest(shown, newest);
    expect(chat.map((m) => m.id)).toEqual([152, 151, ...shown.map((m) => m.id)]);
    expect(chat.slice(2)).toEqual(shown);
    // The new messages land at the end of the newest day, so that day is drawn again and older ones are not.
    expect(sameDay(chatDays(shown).at(-1)!, chatDays(chat).at(-1)!)).toBe(false);
  });

  it("gives back the same chat when nothing is new, and sorts in one that came in late", () => {
    expect(withNewest(shown, shown.slice(0, 50))).toBe(shown);
    const late = { id: 999, sentAt: minute(100).sentAt + 1 };
    const chat = withNewest(shown, [...shown.slice(0, 50), late]);
    expect(chat.map((m) => m.id).slice(49, 52)).toEqual([101, 999, 100]);
    expect(chat).toHaveLength(151);
  });
});

describe("loadingAllLabel", () => {
  it("counts what has loaded against the whole history, once it is known", () => {
    expect(loadingAllLabel(5050, null)).toBe("Loading… 5,050");
    expect(loadingAllLabel(12000, 74075)).toBe("Loading… 12,000 of 74,075");
    // A message arriving while it loads can take the count past the total taken at the start.
    expect(loadingAllLabel(74076, 74075)).toBe("Loading… 74,075 of 74,075");
  });
});

describe("dayWindow", () => {
  const heights = [100, 200, 300, 400, 500]; // newest first: bottoms at 0, 100, 300, 600, 1000

  it("draws the days the view and its margin reach, measured up from the bottom", () => {
    expect(dayWindow(heights, 0, 250, 0)).toEqual({ newest: 0, oldest: 1, newer: 0, older: 1200 });
    expect(dayWindow(heights, 350, 200, 0)).toEqual({ newest: 2, oldest: 2, newer: 300, older: 900 });
    expect(dayWindow(heights, 350, 200, 100)).toEqual({ newest: 1, oldest: 3, newer: 100, older: 500 });
  });

  it("draws everything when the view takes it all in, and nothing when there is nothing", () => {
    expect(dayWindow(heights, 0, 5000, 0)).toEqual({ newest: 0, oldest: 4, newer: 0, older: 0 });
    expect(dayWindow([], 0, 500, 100)).toEqual({ newest: -1, oldest: -1, newer: 0, older: 0 });
  });
});

describe("withEvents: calls", () => {
  const call = (iso: string, id: number): PersonCall =>
    ({ id, platform: "phone", messageId: null, manual: false, accountId: 9, at: Date.parse(iso), durationSeconds: 60, direction: "incoming", answered: true, service: "phone", group: null, people: 1, others: 0, note: "" });
  const messages = [at("2026-02-03T09:00:00+11:00", 3), at("2026-02-02T09:00:00+11:00", 2)];
  const calls = [call("2026-02-04T09:00:00+11:00", 3), call("2026-02-02T12:00:00+11:00", 2), call("2026-02-01T09:00:00+11:00", 1)];

  it("puts calls among the messages at their time, with ids no message has", () => {
    const entries = withEvents(messages, calls, [], true);
    expect(entries.map((e) => e.id)).toEqual([-3, 3, -2, 2, -1]);
    expect(chatDays(entries).map((day) => [day.day, day.messages.map((e) => e.id)])).toEqual([
      ["2026-02-01", [-1]], ["2026-02-02", [2, -2]], ["2026-02-03", [3]], ["2026-02-04", [-3]],
    ]);
  });

  it("leaves out calls older than the oldest message loaded until the whole history is", () => {
    expect(withEvents(messages, calls, [], false).map((e) => e.id)).toEqual([-3, 3, -2, 2]);
    // With no messages at all, every call.
    expect(withEvents([], calls, [], false).map((e) => e.id)).toEqual([-3, -2, -1]);
  });

  it("leaves out calls newer than the newest message loaded while the chat (opened at a moment) does not reach its newest", () => {
    expect(withEvents(messages, calls, [], true, false).map((e) => e.id)).toEqual([3, -2, 2, -1]);
    expect(withEvents(messages, calls, [], false, false).map((e) => e.id)).toEqual([3, -2, 2]);
    expect(withEvents([], calls, [], true, false).map((e) => e.id)).toEqual([-3, -2, -1]);
  });

  it("keeps each call's entry, so a day is drawn again only when it changes, and the messages as they are without calls", () => {
    const first = withEvents(messages, calls, [], true);
    const again = withEvents([...messages], calls, [], true);
    expect(sameDay(chatDays(first)[0], chatDays(again)[0])).toBe(true);
    expect(first.find((e) => e.id === -1)).toBe(again.find((e) => e.id === -1));
    expect(withEvents(messages, [], [], true)).toBe(messages);
  });

  it("never adds another app's call, which is a message in the chat already", () => {
    const messenger: PersonCall = { ...call("2026-02-02T10:00:00+11:00", 2), platform: "messenger", messageId: 2, service: null };
    expect(withEvents(messages, [messenger], [], true)).toBe(messages);
    expect(withEvents(messages, [...calls, messenger], [], true).map((e) => e.id)).toEqual([-3, 3, -2, 2, -1]);
  });
});

describe("withEvents: catch-ups", () => {
  const ada = { id: 7, name: "Ada Sample", aliases: [] };
  const catchUp = (day: string, id: number, time: string | null = null): CatchUp => ({ id, day, time, hours: 2, trip: null, note: "", people: [ada], others: 0 });
  // One just after midnight, so the catch-up must still come first on its day.
  const messages = [at("2026-02-03T00:00:00+11:00", 4), at("2026-02-02T09:00:00+11:00", 2)];
  const call = (iso: string, id: number): PersonCall =>
    ({ id, platform: "phone", messageId: null, manual: false, accountId: 9, at: Date.parse(iso), durationSeconds: 60, direction: "incoming", answered: true, service: "phone", group: null, people: 1, others: 0, note: "" });

  it("puts each at the start of its day, before that day's messages and calls, and gives one on a quiet day its own", () => {
    const entries = withEvents(messages, [call("2026-02-03T00:00:00+11:00", 5)], [catchUp("2026-02-04", 3), catchUp("2026-02-03", 2), catchUp("2026-02-02", 1)], true);
    expect(chatDays(entries).map((day) => [day.day, day.messages.map((e) => ("catchUp" in e ? `catch-up ${e.catchUp.id}` : e.id))])).toEqual([
      ["2026-02-02", ["catch-up 1", 2]],
      ["2026-02-03", ["catch-up 2", -5, 4]],
      ["2026-02-04", ["catch-up 3"]],
    ]);
  });

  it("puts one with a time at that time in Melbourne, among that day's messages and calls", () => {
    const day = [at("2026-02-03T21:00:00+11:00", 6), at("2026-02-03T19:00:00+11:00", 5), at("2026-02-03T08:00:00+11:00", 4)];
    const entries = withEvents(day, [call("2026-02-03T19:45:00+11:00", 8)], [catchUp("2026-02-03", 3, "19:30"), catchUp("2026-02-03", 2)], true);
    expect(chatDays(entries).map((d) => d.messages.map((e) => ("catchUp" in e ? `catch-up ${e.catchUp.id}` : e.id)))).toEqual([
      ["catch-up 2", 4, 5, "catch-up 3", -8, 6],
    ]);
    // Out of daylight saving, 7:30 pm is 9:30 UTC.
    const winter = withEvents([], [], [catchUp("2026-07-01", 1, "19:30")], true);
    expect(winter[0].sentAt).toBe(Date.parse("2026-07-01T19:30:00+10:00"));
  });

  it("leaves out those before the oldest message's day until the whole history is loaded, but keeps that day's", () => {
    const catchUps = [catchUp("2026-02-02", 2), catchUp("2026-02-01", 1)];
    const ids = (entries: Array<{ id: number }>) => entries.filter((e) => "catchUp" in e).map((e) => (e as { catchUp: CatchUp }).catchUp.id);
    expect(ids(withEvents(messages, [], catchUps, false))).toEqual([2]);
    expect(ids(withEvents(messages, [], catchUps, true))).toEqual([2, 1]);
    expect(ids(withEvents([], [], catchUps, false))).toEqual([2, 1]);
  });

  it("leaves out those after the newest message's day while the chat does not reach its newest, but keeps that day's", () => {
    const catchUps = [catchUp("2026-02-04", 4), catchUp("2026-02-03", 3, "21:00")];
    const ids = (entries: Array<{ id: number }>) => entries.filter((e) => "catchUp" in e).map((e) => (e as { catchUp: CatchUp }).catchUp.id);
    expect(ids(withEvents(messages, [], catchUps, true, false))).toEqual([3]);
    expect(ids(withEvents(messages, [], catchUps, true, true))).toEqual([4, 3]);
  });

  it("keeps a catch-up's entry while it is the same, and makes a new one once it is changed, so its day is drawn again", () => {
    const kept = catchUp("2026-02-02", 1);
    const before = chatDays(withEvents(messages, [], [kept], true))[0];
    expect(sameDay(before, chatDays(withEvents([...messages], [], [kept], true))[0])).toBe(true);
    expect(sameDay(before, chatDays(withEvents(messages, [], [{ ...kept, hours: 3 }], true))[0])).toBe(false);
  });
});

describe("opening a chat at a moment", () => {
  const ada = { id: 7, name: "Ada Sample", aliases: [] };
  const dinner: CatchUp = { id: 4, day: "2026-02-03", time: "19:30", hours: 2, trip: null, note: "", people: [ada], others: 0 };
  const phoneCall: PersonCall = {
    id: 11, platform: "phone", messageId: null, manual: false, accountId: 9, at: Date.parse("2026-02-03T12:00:00+11:00"), durationSeconds: 60,
    direction: "incoming", answered: true, service: "phone", group: null, people: 1, others: 0, note: "",
  };
  const messages = [at("2026-02-04T09:00:00+11:00", 6), at("2026-02-03T12:00:00+11:00", 5), at("2026-02-02T09:00:00+11:00", 2)];
  const entries = withEvents(messages, [phoneCall], [dinner], true);

  it("marks a call record by its message, any other call by its time, and a hangout by its number, at its time", () => {
    const record = callMoment({ at: messages[1].sentAt, ref: { kind: "record", id: 5 } });
    expect(record).toEqual({ at: messages[1].sentAt, mark: { message: 5 } });
    expect(entries.filter((e) => isMarked(e, record)).map((e) => e.id)).toEqual([5]);
    // A call in no chat, or one logged, is each person's own row, so it is found by its time, never a message at that time.
    const history = callMoment({ at: phoneCall.at, ref: { kind: "call", id: 99 } });
    expect(history.mark).toEqual({ call: true });
    expect(entries.filter((e) => isMarked(e, history)).map((e) => e.id)).toEqual([-11]);
    const hangout = catchUpMoment(dinner);
    expect(hangout).toEqual({ at: Date.parse("2026-02-03T19:30:00+11:00"), mark: { catchUp: 4 } });
    expect(entries.filter((e) => isMarked(e, hangout)).map((e) => ("catchUp" in e ? e.catchUp.id : e.id))).toEqual([4]);
    // One with no time sits at the start of its day.
    expect(catchUpMoment({ ...dinner, time: null }).at).toBe(Date.parse("2026-02-03T00:00:00+11:00"));
  });

  it("pages from the moment: everything at it or later is after, everything earlier before", () => {
    expect(momentCursor({ at: 1770000000000, mark: { call: true } })).toBe("1770000000000:0");
  });

  it("aims at what it marks, else at the first entry at or after the moment, else the newest", () => {
    const hangout = catchUpMoment(dinner);
    expect(aimAt(entries, hangout)).toEqual({ entry: entries.find((e) => "catchUp" in e), marked: true });
    // Before the hangouts have loaded: the first message after its time.
    expect(aimAt(messages, hangout)).toEqual({ entry: messages[0], marked: false });
    expect(aimAt(messages, { at: Date.parse("2026-02-01T00:00:00+11:00"), mark: { call: true } })).toEqual({ entry: messages[2], marked: false });
    expect(aimAt(messages, { at: Date.parse("2026-03-01T00:00:00+11:00"), mark: { call: true } })).toEqual({ entry: messages[0], marked: false });
    expect(aimAt([], hangout)).toBeNull();
  });

  it("is the same moment only when asked for the same time, so the same When goes back to it", () => {
    const hangout = catchUpMoment(dinner);
    expect(momentKey({ ...hangout, asked: 1 })).toBe(momentKey({ ...hangout, asked: 1 }));
    expect(momentKey({ ...hangout, asked: 1 })).not.toBe(momentKey({ ...hangout, asked: 2 }));
    expect(momentKey(undefined)).toBe("newest");
  });
});
