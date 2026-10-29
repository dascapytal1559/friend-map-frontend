// The Time river's numbers (timeRiver.ts): each measure's streams by Melbourne
// month, from the first month with any to now, for the people shown alone;
// calls that add no length as marks; and the hover card's rows.

import { describe, expect, it } from "vitest";
import type { CatchUp, ListedCall } from "../archive.ts";
import {
  ALL_APPS, amountLabel, appChoices, callFlows, DEFAULT_FILTERS, filtersStore, FILTERS_KEY, flowRows, flowsOf, hangoutFlows, inSpan, kindOn, markAt, messageFlows,
  parseFilters, setFilters, spanMonths, togetherFlows, togetherLabel, toggleKind, widthLabel, type Filters, type Measure, type RiverData,
} from "./timeRiver.ts";

const NOW = Date.parse("2026-10-12T12:00:00+11:00");

function call(at: string, people: number[], { answered = true as boolean | null, seconds = 600 as number | null } = {}): ListedCall {
  return {
    ref: { kind: "call", id: 1 }, at: Date.parse(at), platform: "phone", service: "phone", source: "history", direction: "outgoing",
    answered, answeredSet: false, sourceAnswered: answered, durationSeconds: seconds, length: seconds === null ? null : "source",
    lengthEditable: false, people, others: 0, note: "",
  } as ListedCall;
}

const NAMES = ["Ada Sample", "Bruno Placeholder", "Cleo Example"];

function hangout(day: string, people: number[], hours: number): CatchUp {
  return { id: 1, day, time: null, hours, trip: null, note: "", people: people.map((id) => ({ id, name: NAMES[id % NAMES.length], aliases: [] })), others: 0 };
}

describe("Messages", () => {
  it("are the river's series, from the first month anyone shown has any", () => {
    const flows = messageFlows([{ id: 1, series: [0, 0, 3, 5] }, { id: 2, series: [0, 0, 0, 2] }], ["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(flows.months).toEqual(["2026-09", "2026-10"]);
    expect(flows.flows.map((f) => [f.id, f.series, f.counts])).toEqual([[1, [3, 5], [3, 5]], [2, [0, 2], [0, 2]]]);
    expect(flows.marks).toEqual([]);
  });

  it("are nothing when nobody has any", () => {
    expect(messageFlows([{ id: 1, series: [0, 0] }], ["2026-09", "2026-10"]).months).toEqual([]);
  });
});

describe("Calls", () => {
  it("measure answered calls in minutes by Melbourne month, from the first to now", () => {
    // 30 June 2026 at 23:00 in UTC is already 1 July in Melbourne.
    const flows = callFlows(new Set([1]), [call("2026-06-30T23:00:00Z", [1], { seconds: 1800 }), call("2026-08-03T10:00:00+10:00", [1], { seconds: 90 })], NOW);
    expect(flows.months).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(flows.flows).toEqual([{ id: 1, series: [30, 1.5, 0, 0], counts: [1, 1, 0, 0], missed: [0, 0, 0, 0] }]);
  });

  it("count a missed call, or one with no length known, as a call that adds no length, drawn as a mark at its day", () => {
    const flows = callFlows(
      new Set([1]),
      [
        call("2026-10-01T09:00:00+10:00", [1], { answered: false, seconds: 0 }),
        call("2026-10-11T09:00:00+11:00", [1], { answered: null, seconds: null }),
        call("2026-10-11T19:00:00+11:00", [1], { answered: true, seconds: null }),
        // Missed, with a length its source kept: still no length.
        call("2026-10-12T09:00:00+11:00", [1], { answered: false, seconds: 300 }),
      ],
      NOW,
    );
    expect(flows.flows).toEqual([{ id: 1, series: [0], counts: [4], missed: [2] }]);
    expect(flows.marks.map((m) => [m.day, m.missed])).toEqual([["2026-10-01", true], ["2026-10-11", false], ["2026-10-11", false], ["2026-10-12", true]]);
    expect(flows.marks[0].within).toBeCloseTo(0.5 / 31);
  });

  it("widen each shown person's stream by a call with several, and leave out the people not shown", () => {
    const flows = callFlows(new Set([1, 2]), [call("2026-10-02T12:00:00+10:00", [1, 2, 3], { seconds: 3600 }), call("2026-10-03T12:00:00+10:00", [3])], NOW);
    expect(flows.flows.map((f) => [f.id, f.series])).toEqual([[1, [60]], [2, [60]]]);
  });

  it("are nothing without any with the people shown", () => {
    expect(callFlows(new Set([1]), [call("2026-10-03T12:00:00+10:00", [3])], NOW)).toEqual({ months: [], flows: [], marks: [] });
  });
});

describe("Hangouts", () => {
  it("measure hours by month, each person at one its whole length, from the first to now", () => {
    const flows = hangoutFlows(new Set([1, 2]), [hangout("2026-08-20", [1, 2, 9], 3), hangout("2026-10-01", [1], 1.5), hangout("2026-10-04", [1], 2)], NOW);
    expect(flows.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(flows.flows.map((f) => [f.id, f.series, f.counts])).toEqual([[1, [3, 0, 3.5], [1, 0, 2]], [2, [3, 0, 0], [1, 0, 0]]]);
  });

  it("count a trip once, in the month it began, and each day's time together in its own month", () => {
    // 6 pm on 30 Sept to 2 pm on 2 Oct, private midnight to 10 am: 6 hours in September, 14 and 4 in October.
    const trip: CatchUp = { ...hangout("2026-09-30", [1], 24), time: "18:00", trip: { lastDay: "2026-10-02", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" } };
    const flows = hangoutFlows(new Set([1]), [trip], NOW);
    expect(flows.months).toEqual(["2026-09", "2026-10"]);
    expect(flows.flows.map((f) => [f.series, f.counts])).toEqual([[[6, 18], [1, 0]]]);
  });

  it("run to one logged ahead of now", () => {
    expect(hangoutFlows(new Set([1]), [hangout("2026-12-24", [1], 4)], NOW).months).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});

describe("Calls and hangouts together", () => {
  it("add each month's minutes on calls and hours at hangouts as hours, over the months of either, each kept apart", () => {
    const calls = callFlows(new Set([1, 2]), [call("2026-08-03T12:00:00+10:00", [1], { seconds: 4200 }), call("2026-10-02T12:00:00+10:00", [2], { answered: false, seconds: 0 })], NOW);
    const hangouts = hangoutFlows(new Set([1, 2]), [hangout("2026-09-05", [1], 2), hangout("2026-10-01", [1, 2], 1.5)], NOW);
    const flows = togetherFlows(calls, hangouts);
    expect(flows.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(flows.flows.map((f) => [f.id, f.series, f.counts, f.missed])).toEqual([
      [1, [70 / 60, 2, 1.5], [1, 1, 1], [0, 0, 0]],
      [2, [0, 0, 1.5], [0, 0, 2], [0, 0, 1]],
    ]);
    expect(flows.flows[0].parts!.calls.series).toEqual([70, 0, 0]);
    expect(flows.flows[0].parts!.hangouts.series).toEqual([0, 2, 1.5]);
    expect(flows.marks.map((m) => [m.id, m.month, m.missed])).toEqual([[2, 2, true]]);
  });

  it("run to a hangout logged ahead, and are nothing with neither", () => {
    const flows = togetherFlows(callFlows(new Set([1]), [call("2026-10-02T12:00:00+10:00", [1])], NOW), hangoutFlows(new Set([1]), [hangout("2026-12-24", [1], 4)], NOW));
    expect(flows.months).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(flows.flows[0].series).toEqual([10 / 60, 0, 4]);
    expect(togetherFlows({ months: [], flows: [], marks: [] }, { months: [], flows: [], marks: [] })).toEqual({ months: [], flows: [], marks: [] });
  });
});

describe("the toggles", () => {
  const on = (measure: Measure) => (["messages", "calls", "hangouts"] as const).filter((k) => kindOn(measure, k));

  it("keep Messages on its own: picking it turns the others off, and picking Calls or Hangouts turns it off", () => {
    expect(toggleKind("together", "messages")).toBe("messages");
    expect(toggleKind("calls", "messages")).toBe("messages");
    expect(toggleKind("messages", "calls")).toBe("calls");
    expect(toggleKind("messages", "hangouts")).toBe("hangouts");
    expect(on("messages")).toEqual(["messages"]);
  });

  it("turn Calls and Hangouts on and off apart, the last one on staying on", () => {
    expect(toggleKind("hangouts", "calls")).toBe("together");
    expect(toggleKind("calls", "hangouts")).toBe("together");
    expect(on("together")).toEqual(["calls", "hangouts"]);
    expect(toggleKind("together", "calls")).toBe("hangouts");
    expect(toggleKind("together", "hangouts")).toBe("calls");
    expect(toggleKind("calls", "calls")).toBe("calls");
    expect(toggleKind("hangouts", "hangouts")).toBe("hangouts");
    expect(toggleKind("messages", "messages")).toBe("messages");
  });
});

const DATA: RiverData = {
  people: [{ id: 1, series: [0, 4, 6] }, { id: 2, series: [0, 0, 3] }],
  months: ["2026-08", "2026-09", "2026-10"],
  messageApps: [
    { id: 1, apps: [{ platform: "messenger", months: [{ month: "2026-09", messages: 4 }, { month: "2026-10", messages: 1 }] }, { platform: "whatsapp", months: [{ month: "2026-10", messages: 5 }] }] },
    { id: 2, apps: [{ platform: "whatsapp", months: [{ month: "2026-10", messages: 3 }] }] },
    // Someone not shown.
    { id: 9, apps: [{ platform: "telegram", months: [{ month: "2026-10", messages: 50 }] }] },
  ],
  calls: [
    call("2026-10-02T12:00:00+10:00", [1]),
    { ...call("2026-09-02T12:00:00+10:00", [2], { seconds: 1200 }), platform: "whatsapp" },
    call("2026-10-03T12:00:00+10:00", [1], { answered: false, seconds: 0 }),
  ],
  catchUps: [hangout("2026-10-01", [1], 2), hangout("2026-10-05", [1, 2], 1)],
  now: NOW,
};
const filters = (change: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...change });

describe("the filters", () => {
  it("choose the measure's flows for the people shown", () => {
    expect(flowsOf(filters({ measure: "messages" }), DATA).flows.map((f) => f.series)).toEqual([[4, 6], [0, 3]]);
    expect(flowsOf(filters({ measure: "calls" }), DATA).flows.map((f) => [f.id, f.series])).toEqual([[1, [0, 10]], [2, [20, 0]]]);
    expect(flowsOf(filters({ measure: "hangouts" }), DATA).flows.map((f) => [f.id, f.series])).toEqual([[1, [0, 3]], [2, [0, 1]]]);
    expect(flowsOf(filters({ measure: "together" }), DATA).flows.map((f) => [f.id, f.series])).toEqual([[1, [0, 10 / 60 + 3]], [2, [20 / 60, 1]]]);
  });

  it("together, apply the app and calls with no length to the calls alone, every hangout counted", () => {
    const together = flowsOf(filters({ measure: "together", app: { messages: ALL_APPS, calls: "whatsapp" }, missed: false }), DATA);
    expect(together.flows.map((f) => [f.id, f.series])).toEqual([[2, [20 / 60, 1]], [1, [0, 3]]]);
    expect(together.marks).toEqual([]);
    expect(flowsOf(filters({ measure: "together" }), DATA).marks.map((m) => m.day)).toEqual(["2026-10-03"]);
  });

  it("count one app's messages or calls alone", () => {
    expect(flowsOf(filters({ measure: "messages", app: { messages: "whatsapp", calls: ALL_APPS } }), DATA).flows.map((f) => f.series)).toEqual([[0, 5], [0, 3]]);
    expect(flowsOf(filters({ measure: "messages", app: { messages: "messenger", calls: ALL_APPS } }), DATA).flows.map((f) => f.series)).toEqual([[4, 1], [0, 0]]);
    const calls = flowsOf(filters({ measure: "calls", app: { messages: ALL_APPS, calls: "whatsapp" } }), DATA);
    expect(calls.flows.map((f) => [f.id, f.series])).toEqual([[2, [20, 0]]]);
    expect(calls.marks).toEqual([]);
  });

  it("leave out the calls with no length, marks and counts alike, once asked", () => {
    const shown = flowsOf(filters({ measure: "calls" }), DATA);
    expect(shown.marks.map((m) => m.day)).toEqual(["2026-10-03"]);
    expect(shown.flows.find((f) => f.id === 1)!.counts).toEqual([0, 2]);
    const left = flowsOf(filters({ measure: "calls", missed: false }), DATA);
    expect(left.marks).toEqual([]);
    expect(left.flows.find((f) => f.id === 1)!.counts).toEqual([0, 1]);
  });

  it("cover the span chosen: the last months to now, all time, or from one month to another", () => {
    const months = ["2025-11", "2025-12", "2026-01"];
    expect(spanMonths({ span: "3m", from: null, to: null }, months, NOW)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(spanMonths({ span: "1y", from: null, to: null }, months, NOW)).toHaveLength(12);
    expect(spanMonths({ span: "1y", from: null, to: null }, months, NOW)[0]).toBe("2025-11");
    expect(spanMonths({ span: "all", from: null, to: null }, months, NOW)).toEqual(months);
    expect(spanMonths({ span: "custom", from: "2025-12", to: null }, months, NOW)).toEqual(["2025-12", "2026-01"]);
    // Either way round.
    expect(spanMonths({ span: "custom", from: "2026-02", to: "2025-12" }, months, NOW)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(spanMonths({ span: "all", from: null, to: null }, [], NOW)).toEqual([]);
    expect(spanMonths({ span: "all", from: null, to: null }, ["2026-10"], NOW)).toEqual(["2026-09", "2026-10"]);
  });

  it("draw a span's months alone, those with nothing as zeros, its marks moved to them", () => {
    const flows = flowsOf(filters({ measure: "calls", span: "custom", from: "2026-10", to: "2026-11" }), DATA);
    expect(flows.months).toEqual(["2026-10", "2026-11"]);
    expect(flows.flows.map((f) => [f.id, f.series])).toEqual([[1, [10, 0]], [2, [0, 0]]]);
    expect(flows.marks.map((m) => m.month)).toEqual([0]);
    expect(inSpan(flows, ["2026-11"]).marks).toEqual([]);
  });

  it("offer the apps the people shown have any of the measure on, the most first", () => {
    const ids = new Set([1, 2]);
    expect(appChoices("messages", ids, DATA)).toEqual([{ value: "whatsapp", title: "WhatsApp" }, { value: "messenger", title: "Messenger" }]);
    expect(appChoices("calls", ids, DATA)).toEqual([{ value: "phone", title: "Phone" }, { value: "whatsapp", title: "WhatsApp" }]);
    expect(appChoices("hangouts", ids, DATA)).toEqual([]);
    expect(appChoices("together", ids, DATA)).toEqual(appChoices("calls", ids, DATA));
  });

  it("are kept as they were chosen, anything unknown read as the default's", () => {
    expect(parseFilters(null)).toBe(DEFAULT_FILTERS);
    expect(parseFilters("not json")).toBe(DEFAULT_FILTERS);
    const chosen = filters({ measure: "calls", span: "custom", from: "2025-01", to: "2026-03", app: { messages: "whatsapp", calls: "phone" }, missed: false });
    expect(parseFilters(JSON.stringify(chosen))).toEqual(chosen);
    // Calls and Hangouts together; a single choice kept before reads as it was.
    expect(parseFilters(JSON.stringify({ ...chosen, measure: "together" })).measure).toBe("together");
    expect(parseFilters(JSON.stringify({ measure: "hangouts" }))).toEqual(DEFAULT_FILTERS);
    // How hangouts were had, kept from when one could be by call: passed over, as every hangout is in person.
    expect(parseFilters(JSON.stringify({ measure: "hangouts", had: "by-call" }))).toEqual(DEFAULT_FILTERS);
    expect(parseFilters(JSON.stringify({ measure: "letters", span: "forever", from: "2025-13", app: { calls: "" }, had: 3, missed: "no" }))).toEqual(DEFAULT_FILTERS);
  });

  it("are kept in this browser, Hangouts over all time to start", () => {
    const items = new Map<string, string>();
    const kept = { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
    filtersStore.reload(kept);
    expect(filtersStore.get()).toEqual(DEFAULT_FILTERS);
    setFilters({ measure: "messages", span: "6m" });
    expect(JSON.parse(items.get(FILTERS_KEY)!)).toMatchObject({ measure: "messages", span: "6m" });
    filtersStore.reload(kept);
    expect(filtersStore.get()).toMatchObject({ measure: "messages", span: "6m", missed: true });
    filtersStore.reload(null);
  });
});

describe("the words", () => {
  it("say a month's amount and the key's width in the measure's own terms", () => {
    expect(amountLabel("messages", 1, 1)).toBe("1 message");
    expect(amountLabel("messages", 1234, 1234)).toBe("1,234 messages");
    expect(amountLabel("calls", 65, 2)).toBe("2 calls · 1 h 5 min");
    expect(amountLabel("calls", 0, 1)).toBe("1 call");
    expect(amountLabel("hangouts", 3.5, 2)).toBe("2 hangouts · 3.5 hours");
    expect(amountLabel("hangouts", 1, 1)).toBe("1 hangout · 1 hour");
    expect(widthLabel("messages", 20)).toBe("20 messages");
    expect(widthLabel("calls", 30)).toBe("30 min of calls");
    expect(widthLabel("hangouts", 2)).toBe("2 hours of hangouts");
    expect(widthLabel("together", 2)).toBe("2 h of calls and hangouts together");
  });

  it("say time together in hours", () => {
    expect(togetherLabel(3)).toBe("3 h together");
    expect(togetherLabel(70 / 60)).toBe("1 h 10 min together");
  });

  it("give the hover card that month, every month, the busiest and the missed calls", () => {
    const flow = { id: 1, series: [30, 0, 5], counts: [1, 1, 2], missed: [0, 1, 1] };
    expect(flowRows("calls", flow, 2, ["2026-08", "2026-09", "2026-10"], "2026-10")).toEqual([
      ["Oct 2026 so far", "2 calls · 5 min"],
      ["Missed that month", "1"],
      ["Aug 2026 – Oct 2026", "4 calls · 35 min"],
      ["Missed in all", "2"],
      ["Busiest month", "Aug 2026 · 1 call · 30 min"],
    ]);
    const quiet = { id: 1, series: [2, 0], counts: [1, 0], missed: [0, 0] };
    expect(flowRows("hangouts", quiet, 1, ["2026-09", "2026-10"], "2026-10")[0]).toEqual(["Oct 2026 so far", "nothing"]);
    expect(flowRows("hangouts", quiet, 0, ["2026-09", "2026-10"], "2026-10")[0]).toEqual(["Sep 2026", "1 hangout · 2 hours"]);
    const together = flowsOf(filters({ measure: "together" }), DATA).flows.find((f) => f.id === 2)!;
    // Together, the calls and hangouts under each total, a part with none left out.
    expect(flowRows("together", together, 1, ["2026-09", "2026-10"], "2026-10")).toEqual([
      ["Oct 2026 so far", "1 h together"],
      ["Hangouts", "1 hangout · 1 h"],
      ["Sep 2026 – Oct 2026", "1 h 20 min together"],
      ["Calls", "1 call · 20 min"],
      ["Hangouts", "1 hangout · 1 h"],
      ["Busiest month", "Oct 2026 · 1 h together"],
    ]);
    // A span that ends before this month has no "so far".
    expect(flowRows("hangouts", quiet, 1, ["2026-09", "2026-10"], "2026-12")[0]).toEqual(["Oct 2026", "nothing"]);
  });
});

it("finds the mark nearest the pointer, within reach", () => {
  const marks = ["a", "b", "c"];
  expect(markAt(marks, [10, 20, 23], 21)).toBe("b");
  expect(markAt(marks, [10, 20, 23], 22.6)).toBe("c");
  expect(markAt(marks, [10, 20, 23], 40)).toBeNull();
});
