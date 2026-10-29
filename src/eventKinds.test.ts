// @vitest-environment happy-dom
// Add event's two kinds (EventForm, CatchUps.tsx), as the person panel offers them: Call logs a call as a call (the
// logged-call route, POST /calls), and Hangout adds a hangout, which is in person: no by call is ever sent. A hangout
// made a call goes the same way, as one change. Made-up people and dates only.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatchUp } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { EventForm, newEvent } from "./CatchUps.tsx";
import { changeChip } from "./changeChip.ts";

const ada = { id: 7, name: "Ada Sample", aliases: [] };
const dinner: CatchUp = { id: 3, day: "2026-10-04", time: "19:30", hours: 1.5, trip: null, note: "Dinner", people: [ada], others: 0 };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let api: Record<"person" | "calls" | "addCall" | "addCatchUp" | "changeCatchUp" | "catchUpToCall", ReturnType<typeof vi.fn>>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  api = {
    // Ada's one account that carries calls, which a new call with her goes on.
    person: vi.fn(async () => ({ id: 7, name: "Ada Sample", accounts: [{ id: 11, platform: "phone", displayName: "Ada" }] })),
    calls: vi.fn(async () => []),
    addCall: vi.fn(async () => ({ call: null, changeset: 91 })),
    addCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 92 })),
    changeCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 93 })),
    catchUpToCall: vi.fn(async () => ({ call: null, changeset: 94 })),
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
const kind = (name: string) => [...host.querySelectorAll<HTMLButtonElement>(".event-kind button")].find((b) => b.textContent === name)!;
const submit = () => act(async () => $("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

/** Picks Call on the form, gives it a time and a length, and lets Ada's chip put it on her usual account. */
async function asCall(length: string): Promise<void> {
  await act(async () => kind("Call").click());
  await act(async () => {
    type($('[aria-label="Time it started"] [aria-label="Hour"]'), "7");
    type($('[aria-label="Time it started"] [aria-label="Minutes"]'), "30");
    type($('[aria-label="How long it lasted: minutes, or h:mm"]'), length);
  });
}

describe("Add event's Call and Hangout", () => {
  it("logs a call as a call: its people, each on their account, its date, time and length, through the logged-call route", async () => {
    await act(async () => root.render(createElement(EventForm, { start: newEvent(ada, "2026-10-04"), onDone: () => {} })));
    await asCall("25");
    expect(kind("Call").getAttribute("aria-pressed")).toBe("true");
    await submit();
    expect(api.addCall).toHaveBeenCalledWith({ people: [{ personId: 7, accountId: 11, app: null }], day: "2026-10-04", time: "19:30", minutes: 25, note: "" });
    expect(api.addCatchUp).not.toHaveBeenCalled();
  });

  it("adds a hangout in person, sending no by call", async () => {
    await act(async () => root.render(createElement(EventForm, { start: newEvent(ada, "2026-10-04"), onDone: () => {} })));
    expect(kind("Hangout").getAttribute("aria-pressed")).toBe("true");
    await act(async () => type($('input[type="number"][max="24"]'), "2"));
    await submit();
    expect(api.addCatchUp).toHaveBeenCalledWith({ day: "2026-10-04", time: null, trip: null, hours: 2, note: "", personIds: [7], others: 0 });
    expect(api.addCall).not.toHaveBeenCalled();
  });

  it("changes a hangout as one in person, even one a backend still sends with byCall, and makes one a call as a call", async () => {
    const older = { ...dinner, byCall: true } as CatchUp;
    await act(async () => root.render(createElement(EventForm, { start: { kind: "hangout", id: older.id, hangout: older }, onDone: () => {} })));
    await submit();
    expect(api.changeCatchUp).toHaveBeenCalledWith(3, { day: "2026-10-04", time: "19:30", trip: null, hours: 1.5, note: "Dinner", personIds: [7], others: 0 });
    await act(async () => root.render(createElement(EventForm, { key: "again", start: { kind: "hangout", id: dinner.id, hangout: dinner }, onDone: () => {} })));
    await asCall("1:30");
    await submit();
    expect(api.catchUpToCall).toHaveBeenCalledWith(3, { people: [{ personId: 7, accountId: 11, app: null }], day: "2026-10-04", time: "19:30", minutes: 90, note: "Dinner" });
  });
});
