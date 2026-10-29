// @vitest-environment happy-dom
// A trip (a hangout over several days, src/catchUps.ts) on the page: Add event's Several days, which asks when it
// started and ended and each day's private hours and saves it as one hangout; and how it reads in the person's list of
// hangouts, in their chat and on the change chip. Made-up people and dates only.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatchUp, Trip } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { CatchUpsField, ChatCatchUp, EventForm, newEvent, removeCatchUp, tripOf } from "./CatchUps.tsx";
import { changeChip } from "./changeChip.ts";

const ada = { id: 7, name: "Ada Sample", aliases: [] };
const bruno = { id: 8, name: "Bruno Placeholder", aliases: [] };
const away: Trip = { lastDay: "2026-10-06", endTime: "14:00", privateFrom: "00:00", privateTo: "10:00" };
/** Left at 6 pm on 4 Oct, home at 2 pm on the 6th: 6 hours, then 14, then 4. */
const trip: CatchUp = { id: 5, day: "2026-10-04", time: "18:00", trip: away, hours: 24, note: "Up the coast", people: [ada, bruno], others: 0 };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let api: Record<"addCatchUp" | "changeCatchUp" | "deleteCatchUp", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  api = {
    addCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 81 })),
    changeCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 82 })),
    deleteCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 83 })),
  };
  provideArchive(api as unknown as ArchiveApi);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  changeChip.dismiss();
});

/** Types `value` into `input` as a person would, so React hears it. */
function type(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const $ = <T extends Element>(selector: string) => host.querySelector<T>(selector)!;
const $$ = <T extends Element>(selector: string) => [...host.querySelectorAll<T>(selector)];
/** Sends the form, as its Add or Save button does. */
const submit = () => act(async () => $("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

describe("Add event's Several days", () => {
  it("asks when it started and ended, each a date and a time, and each day's private hours, midnight to 10 am to start", async () => {
    await act(async () => root.render(createElement(EventForm, { start: newEvent(ada), onDone: () => {} })));
    expect(host.textContent).not.toContain("Private each day");
    await act(async () => $<HTMLInputElement>(".catch-up-form__several input").click());
    expect($$("label > span").map((s) => s.textContent)).toEqual(expect.arrayContaining(["Several days", "Started", "Ended"]));
    expect(host.textContent).not.toMatch(/Hours/);
    // The start's time is needed now, with no "No time".
    expect($('[aria-label="Time it started"] [aria-label="Hour"]').hasAttribute("required")).toBe(true);
    expect(host.textContent).not.toContain("No time");
    const [from, to] = $$<HTMLElement>(".catch-up-form__private-times .time-box");
    const shown = (box: HTMLElement) => [...box.querySelectorAll("input")].map((i) => i.value).join(":") + " " + box.querySelector("button")!.textContent;
    expect([shown(from), shown(to)]).toEqual(["12:00 AM", "10:00 AM"]);
    expect($(".catch-up-form__trip").textContent).toBe("When it ended: a day after it started, no later than today, and a time");
  });

  it("says how many days and hours together it comes to, and saves one hangout with the trip and its hours in all", async () => {
    await act(async () => root.render(createElement(EventForm, { start: newEvent(ada), onDone: () => {} })));
    await act(async () => $<HTMLInputElement>(".catch-up-form__several input").click());
    const [started, ended] = $$<HTMLInputElement>('input[type="date"]');
    await act(async () => {
      type(started, "2026-10-04");
      type($('[aria-label="Time it started"] [aria-label="Hour"]'), "6");
      type($('[aria-label="Time it started"] [aria-label="Minutes"]'), "00");
      type(ended, "2026-10-06");
      type($('[aria-label="Time it ended"] [aria-label="Hour"]'), "2");
      type($('[aria-label="Time it ended"] [aria-label="Minutes"]'), "00");
    });
    expect($(".catch-up-form__trip").textContent).toBe("3 days, 24 hours together");
    expect(started.value).toBe("2026-10-04");
    expect(ended.getAttribute("min")).toBe("2026-10-05");
    await submit();
    expect(api.addCatchUp).toHaveBeenCalledWith({ day: "2026-10-04", time: "18:00", trip: away, hours: 24, note: "", personIds: [7], others: 0 });
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "added", what: "hangout of 24 hours over 3 days on 4–6 Oct 2026 from 6:00 pm" }, changeset: 81 });
  });

  it("opens a trip being changed with its own times and window, and saves it whole; a private window that leaves nothing will not save", async () => {
    await act(async () => root.render(createElement(EventForm, { start: { kind: "hangout", id: trip.id, hangout: trip }, onDone: () => {} })));
    expect($<HTMLInputElement>(".catch-up-form__several input").checked).toBe(true);
    expect($(".catch-up-form__trip").textContent).toBe("3 days, 24 hours together");
    // Private from 10 am to 10 am is no window at all: every hour of the trip together.
    await act(async () => type($('[aria-label="Private from"] [aria-label="Hour"]'), "10"));
    expect($(".catch-up-form__trip").textContent).toBe("3 days, 44 hours together");
    await submit();
    expect(api.changeCatchUp).toHaveBeenCalledWith(5, expect.objectContaining({ trip: { ...away, privateFrom: "10:00" }, hours: 44, personIds: [7, 8], note: "Up the coast" }));
    // Private noon to 11 am, and away from noon to 11 am the next day: all of it private, nothing together, and no save.
    const allPrivate = { ...trip, id: 6, time: "12:00", trip: { ...away, lastDay: "2026-10-05", endTime: "11:00", privateFrom: "12:00", privateTo: "11:00" }, hours: 1 };
    await act(async () => root.render(createElement(EventForm, { key: "all private", start: { kind: "hangout", id: 6, hangout: allPrivate }, onDone: () => {} })));
    expect($(".catch-up-form__trip").textContent).toBe("No time together outside the private hours");
    expect($<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    await submit();
    expect(api.changeCatchUp).toHaveBeenCalledTimes(1);
  });

  it("takes a trip only once it says a whole one: a start time, a later last day no later than today, an end time and a window", () => {
    expect(tripOf("2026-10-04", "18:00", away)).toEqual(away);
    expect(tripOf("2026-10-04", "", away)).toBeNull();
    expect(tripOf("2026-10-04", "18:00", { ...away, lastDay: "2026-10-04" })).toBeNull();
    expect(tripOf("2026-10-04", "18:00", { ...away, lastDay: "" })).toBeNull();
    expect(tripOf("2026-10-04", "18:00", { ...away, endTime: "" })).toBeNull();
    expect(tripOf("2026-10-04", "18:00", { ...away, lastDay: "2999-01-01" })).toBeNull();
    expect(tripOf("2024-01-01", "18:00", { ...away, lastDay: "2025-01-02" })).toBeNull();
  });
});

describe("a trip on the page", () => {
  it("is one row in the person's hangouts: its hours in all over its days, its first to last day and its times", () => {
    const html = renderToStaticMarkup(createElement(CatchUpsField, { person: ada, catchUps: [trip], open: true, onToggle: () => {}, onOpenPerson: () => {} }));
    expect(html).toContain("<strong>24 hours over 3 days</strong> · 4–6 Oct 2026, 6:00 pm to 2:00 pm");
    expect(html.match(/catch-ups__row/g)).toHaveLength(1);
  });

  it("sits in the chat once, where it began, saying until when", () => {
    const html = renderToStaticMarkup(createElement(ChatCatchUp, { catchUp: trip, personId: ada.id }));
    expect(html).toContain("<strong>Hangout</strong> · 6:00 pm · 24 hours over 3 days · until 6 Oct 2026, 2:00 pm");
  });

  it("is deleted whole, the chip naming it", async () => {
    expect(await removeCatchUp(trip)).toBe(true);
    expect(api.deleteCatchUp).toHaveBeenCalledWith(5);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "deleted", what: "hangout of 24 hours over 3 days on 4–6 Oct 2026 from 6:00 pm" } });
  });
});
