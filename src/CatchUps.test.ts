import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { AccountSummary, CatchUp } from "./archive.ts";
import { freshCatchUp } from "./catchUps.ts";
import { CallOnChoices, CallPersonChip, callDraftOf, callInput, callOfHangout, CatchUpsField, choosingCallOn, EventForm, freshCall, hangoutOfCall, newEvent, usualCallOn, withCallPerson, type CallDraft, type EventStart } from "./CatchUps.tsx";
import { callLengthText, parseCallLength } from "./calls.ts";
import { nameStyleStore } from "./names.ts";
import { ReadOnly } from "./readOnly.ts";
import { dayKey } from "./time.ts";

const ada = { id: 7, name: "Ada Sample", aliases: [] };
const bea = { id: 8, name: "Bea Sample", aliases: [] };

const form = (start: EventStart, onDelete?: () => Promise<boolean>) => renderToStaticMarkup(createElement(EventForm, { start, onDone: () => {}, onDelete }));
const hangout = (fields: Partial<CatchUp> = {}, id?: number): EventStart =>
  id === undefined ? { ...newEvent(ada), kind: "hangout", hangout: { ...freshCatchUp(ada), ...fields } } : { kind: "hangout", id, hangout: { ...freshCatchUp(ada), ...fields } };

describe("Add event's form", () => {
  it("starts a hangout on today, no time, one hour, with them; and a call on today with them, no time or length, on the phone", () => {
    expect(freshCatchUp(ada)).toEqual({ day: dayKey(Date.now()), time: null, hours: 1, trip: null, note: "", people: [ada], others: 0 });
    expect(newEvent(ada, "2026-10-04")).toEqual({
      kind: "hangout",
      hangout: { ...freshCatchUp(ada), day: "2026-10-04" },
      call: { people: [{ person: ada, on: null }], day: "2026-10-04", time: "", length: "", note: "", others: 0 },
    });
    expect(freshCall()).toEqual({ people: [], day: dayKey(Date.now()), time: "", length: "", note: "", others: 0 });
  });

  it("opens on Hangout with the toggle for Call and Hangout at its top, Message not offered yet", () => {
    const html = form(newEvent(ada));
    expect(html).toContain('<form class="catch-up-form" aria-label="Add event"><div class="event-kind" role="group" aria-label="What kind of event">'
      + '<button type="button" aria-pressed="false">Call</button><button type="button" aria-pressed="true">Hangout</button></div>');
    expect(html).not.toContain(">Message</button>");
    expect(html).toContain(">Add hangout</button>");
  });

  it("offers the toggle on a hangout or call being changed, the other kind making it one", () => {
    expect(form(hangout({}, 3))).toContain('<form class="catch-up-form" aria-label="Change this hangout"><div class="event-kind" role="group" aria-label="What kind of event: the other makes it one">'
      + '<button type="button" aria-pressed="false" title="Make it a call">Call</button><button type="button" aria-pressed="true">Hangout</button></div>');
    const call = form({ kind: "call", id: 4, call: { people: [{ person: ada, on: { accountId: 11, platform: "imessage" } }], day: "2026-10-04", time: "19:30", length: "25", note: "", others: 0 } }, async () => true);
    expect(call).toContain('<button type="button" aria-pressed="true">Call</button><button type="button" aria-pressed="false" title="Make it a hangout">Hangout</button></div>');
    expect(call).toContain(">Save</button>");
    expect(call).toContain(">Delete</button>");
  });

  it("makes a call a hangout with everyone on it, its date, time, length in hours, note and unnamed others", () => {
    const call: CallDraft = { people: [{ person: ada, on: { accountId: 11, platform: "imessage" } }, { person: bea, on: { accountId: null, app: "discord" } }], day: "2026-10-04", time: "19:30", length: "1:30", note: "Planned the trip", others: 2 };
    expect(hangoutOfCall(call)).toEqual({ day: "2026-10-04", time: "19:30", hours: 1.5, trip: null, note: "Planned the trip", people: [ada, bea], others: 2 });
    // To two places, as a hangout keeps them: 25 minutes is 0.42 hours, a minute 0.02; with no length yet, an hour.
    expect(hangoutOfCall({ ...call, length: "25" }).hours).toBe(0.42);
    expect(hangoutOfCall({ ...call, length: "1" }).hours).toBe(0.02);
    expect(hangoutOfCall({ ...call, length: "" }).hours).toBe(1);
  });

  it("makes a hangout a call with everyone named at it on their usual account, its date, time (none to fill in without one), hours as minutes, note and unnamed others", () => {
    const dinner = { day: "2026-10-04", time: null, hours: 2.5, trip: null, note: "Dinner", people: [ada, bea], others: 20 };
    expect(callOfHangout(dinner)).toEqual({ people: [{ person: ada, on: null }, { person: bea, on: null }], day: "2026-10-04", time: "", length: "2:30", note: "Dinner", others: 20 });
    expect(callOfHangout({ ...dinner, time: "19:30", hours: 0.01 })).toMatchObject({ time: "19:30", length: "1" });
    expect(callOfHangout({ ...dinner, hours: 24 }).length).toBe("24:00");
  });

  it("asks a hangout for a date, a time if you like and hours, and no by call", () => {
    const html = form(newEvent(ada));
    expect(html).toContain(`<input type="date" max="${dayKey(Date.now())}" required="" value="${dayKey(Date.now())}"/>`);
    // The time beside the date, empty and not required, with no "No time" until one is set.
    // Its hour and minutes empty and on PM to start, so typing 7 30 says 7:30 pm.
    expect(html).toContain('</label><div class="catch-up-form__time"><span>Time</span><div class="time-box" role="group" aria-label="Time it started (if you like)">'
      + '<input class="time-box__part" inputMode="numeric" aria-label="Hour" placeholder="--" maxLength="2" pattern="0?[1-9]|1[0-2]" value=""/><span aria-hidden="true">:</span>'
      + '<input class="time-box__part" inputMode="numeric" aria-label="Minutes" placeholder="--" maxLength="2" pattern="[0-5]?[0-9]" value=""/>'
      + '<button type="button" class="time-box__half" title="am or pm: click, or type a or p">PM</button></div></div><label><span>Hours</span>');
    expect(html).toMatch(/<span>Hours<\/span><input type="number" inputMode="decimal" min="0.01" max="24" step="any" required="" value="1"\/>/);
    expect(html).not.toMatch(/By call|No time/);
    expect(form(hangout({ hours: 2.5 }, 3))).toContain('value="2.5"');
    expect(form(hangout({ time: "19:30" }, 3))).toMatch(/<span>Time<button type="button" class="link-button catch-up-form__no-time"[^>]*>No time<\/button><\/span><div class="time-box"[^>]*><input[^>]*aria-label="Hour"[^>]*value="7"\/>.*?aria-label="Minutes"[^>]*value="30"\/><button[^>]*>PM<\/button>/);
    // A hangout's own time shows as it is: a morning one stays AM.
    expect(form(hangout({ time: "09:05" }, 3))).toMatch(/aria-label="Hour"[^>]*value="9"\/>.*?aria-label="Minutes"[^>]*value="05"\/><button[^>]*>AM<\/button>/);
    expect(html).toMatch(/<div class="catch-up-form__note"><label for="[^"]+">Note <span class="muted">\(if you like\)<\/span><\/label><input id="[^"]+" placeholder="Dinner, a wedding" value=""\/><\/div>/);
  });

  it("shows who was at a hangout as chips on the With line, each with ×, and the field to add someone below it", () => {
    const html = form(hangout({ people: [ada, bea] }));
    const chip = (name: string) => `<span class="tag-chip tag-chip--alias">${name}<button type="button" aria-label="Take ${name} off this hangout">×</button></span>`;
    expect(html).toContain(`<div class="catch-up-form__with"><span>With</span>${chip("Ada Sample")}${chip("Bea Sample")}</div><div class="catch-up-form__add"><input aria-label="Add someone who was there"`);
    // Even the only one can come off; the form then waits for someone before it saves.
    expect(form(hangout())).toContain(chip("Ada Sample"));
  });

  it("asks how many more were at a hangout unnamed, on the line of the field to add someone: none to start, as kept when changing one", () => {
    expect(form(hangout())).toMatch(/<div class="catch-up-form__add"><input aria-label="Add someone who was there"[^>]*\/><label class="catch-up-form__others"[^>]*><span aria-hidden="true">\+<\/span><input type="number" inputMode="numeric" aria-label="Others there, unnamed" min="0" max="10000" step="1" value="0"\/><span aria-hidden="true">others<\/span><\/label><\/div>/);
    expect(form(hangout({ others: 20 }, 3))).toContain('aria-label="Others there, unnamed" min="0" max="10000" step="1" value="20"/>');
  });

  it("asks a call for its date, the time it started (needed), its length and everyone on it, each chip saying what it was on with them", () => {
    const draft: CallDraft = {
      people: [{ person: ada, on: { accountId: 11, platform: "imessage" } }, { person: bea, on: { accountId: null, app: "telegram" } }],
      day: "2026-10-04", time: "19:30", length: "1:30", note: "", others: 0,
    };
    const html = form({ kind: "call", id: 4, call: draft });
    expect(html).toContain('<div class="time-box" role="group" aria-label="Time it started"><input class="time-box__part" inputMode="numeric" aria-label="Hour" placeholder="--" maxLength="2" pattern="0?[1-9]|1[0-2]" required="" value="7"/>');
    expect(html).toMatch(/aria-label="Minutes"[^>]*value="30"\/><button[^>]*>PM<\/button>/);
    // A new call's time is needed, and starts on PM too.
    expect(form({ kind: "call", hangout: freshCatchUp(ada), call: freshCall(ada) })).toMatch(/aria-label="Hour"[^>]*required=""[^>]*value=""\/>.*?aria-label="Minutes"[^>]*value=""\/><button[^>]*>PM<\/button>/);
    expect(html).toContain('<span>Length</span><input inputMode="numeric" aria-label="How long it lasted: minutes, or h:mm" placeholder="25, 1:30" required="" aria-invalid="false" value="1:30"/>');
    // The hangout's With line, each chip with its platform and ▾, and the field to add more below; no selector apart.
    expect(html).toContain('<div class="catch-up-form__with"><span>With</span><span class="tag-chip tag-chip--alias call-chip">Ada Sample<button type="button" class="call-chip__on" aria-expanded="false" aria-label="What the call was on with Ada Sample: FaceTime">');
    expect(html).toContain('<span class="platform-badge">Telegram</span><span aria-hidden="true">▾</span></button><button type="button" aria-label="Take Bea Sample off this call">×</button></span></div><div class="catch-up-form__add"><input aria-label="Add someone who was on it"');
    expect(html).not.toMatch(/catch-up-form__accounts|<select|radiogroup/);
    expect(html).toContain('<button type="submit" class="button button--primary">Save</button>');
    expect(html).not.toMatch(/No time|Hours|others/);
    // Someone not yet on anything: "…", and it can't be saved until they are.
    const unset = form({ kind: "call", id: 4, call: { ...draft, people: [{ person: ada, on: null }] } });
    expect(unset).toContain('aria-label="What the call was on with Ada Sample: not chosen yet"><span class="platform-badge">…</span>');
    expect(unset).toContain('<button type="submit" class="button button--primary" disabled="">Save</button>');
  });

  it("offers Delete only for one being changed", () => {
    expect(form(hangout({}, 3), async () => true)).toContain('class="link-button catch-ups__delete">Delete</button>');
    expect(form(hangout({}, 3))).not.toContain("Delete");
  });

  it("reads a call's length as minutes or h:mm, and makes a call of a draft only when it says a whole one, everyone on it on something", () => {
    expect(["25", " 90 ", "1:30", "0:45", "0", "1.5", "1:75", "", "abc"].map(parseCallLength)).toEqual([25, 90, 90, 45, null, null, null, null, null]);
    expect([25, 60, 90, 125].map(callLengthText)).toEqual(["25", "1:00", "1:30", "2:05"]);
    const draft: CallDraft = {
      people: [{ person: ada, on: { accountId: 11, platform: "imessage" } }, { person: bea, on: { accountId: null, app: "telegram" } }],
      day: "2026-10-04", time: "19:30", length: "1:30", note: "", others: 0,
    };
    expect(callInput(draft)).toEqual({
      people: [{ personId: ada.id, accountId: 11, app: null }, { personId: bea.id, accountId: null, app: "telegram" }],
      day: "2026-10-04", time: "19:30", minutes: 90, note: "",
    });
    expect(callInput({ ...draft, note: "Planned the trip" })).toMatchObject({ note: "Planned the trip" });
    expect(callInput({ ...draft, people: [] })).toBeNull();
    expect(callInput({ ...draft, people: [...draft.people, { person: { id: 9, name: "Cy Sample", aliases: [] }, on: null }] })).toBeNull();
    expect(callInput({ ...draft, time: "" })).toBeNull();
    expect(callInput({ ...draft, length: "25:00" })).toBeNull();
    expect(callInput({ ...draft, length: "24:00" })).toMatchObject({ minutes: 1440 });
  });
});

describe("the people on a call, each with what it was on", () => {
  afterEach(() => nameStyleStore.set("full"));
  const account = (id: number, platform: string, displayName: string): AccountSummary => ({
    id, platform, displayName, handle: null, link: "import", messageCount: 0, directMessageCount: 0, groupMessageCount: 0, lastMessageAt: null,
  });
  const accounts = [account(11, "imessage", "+61491570006"), account(12, "messenger", "Ada Sample"), account(13, "x", "adasample")];

  it("puts someone on not yet on anything, once, and their chip's choice changes only them", () => {
    const one = withCallPerson(freshCall(ada, "2026-10-04"), bea);
    expect(one.people).toEqual([{ person: ada, on: null }, { person: bea, on: null }]);
    expect(withCallPerson(one, bea)).toBe(one);
    const chosen = choosingCallOn(choosingCallOn(one, ada.id, { accountId: 11, platform: "imessage" }), bea.id, { accountId: null, app: "phone" });
    // Changed later from the chip: Messenger for Ada, Bea as she was.
    expect(choosingCallOn(chosen, ada.id, { accountId: 12, platform: "messenger" }).people).toEqual([
      { person: ada, on: { accountId: 12, platform: "messenger" } }, { person: bea, on: { accountId: null, app: "phone" } },
    ]);
  });

  it("starts someone on the account their latest call was on, else their phone one, else the first; with none, the phone", () => {
    const call = (accountId: number, at: number) => ({ accountId, at });
    expect(usualCallOn(accounts, [call(12, 2), call(11, 1)])).toEqual({ accountId: 12, platform: "messenger" });
    expect(usualCallOn([...accounts, account(14, "phone", "+61491570110")], [])).toEqual({ accountId: 14, platform: "phone" });
    expect(usualCallOn(accounts, [])).toEqual({ accountId: 11, platform: "imessage" });
    expect(usualCallOn([account(13, "x", "adasample")], [])).toEqual({ accountId: null, app: "phone" });
  });

  it("opens a logged call's group to change it with everyone on it on what it was on, and the others on it unnamed", () => {
    const draft = callDraftOf({
      at: Date.parse("2026-10-04T19:30:00+11:00"), durationSeconds: 5400, note: "",
      people: [{ callId: 5, person: ada, accountId: 11, platform: "imessage" }, { callId: 6, person: bea, accountId: null, platform: "wechat" }],
    }, 2);
    expect(draft).toEqual({
      people: [{ person: ada, on: { accountId: 11, platform: "imessage" } }, { person: bea, on: { accountId: null, app: "wechat" } }],
      day: "2026-10-04", time: "19:30", length: "1:30", note: "", others: 2,
    });
  });

  it("draws a chip open or closed, its platform (FaceTime for iMessage) its badge", () => {
    const chip = (open: boolean) => renderToStaticMarkup(createElement(CallPersonChip, {
      pick: { person: ada, on: { accountId: 11, platform: "imessage" } }, open, onToggle: () => {}, onUsual: () => {}, onRemove: () => {},
    }));
    expect(chip(false)).toBe('<span class="tag-chip tag-chip--alias call-chip">Ada Sample<button type="button" class="call-chip__on" aria-expanded="false" aria-label="What the call was on with Ada Sample: FaceTime">'
      + '<span class="platform-badge">FaceTime</span><span aria-hidden="true">▾</span></button><button type="button" aria-label="Take Ada Sample off this call">×</button></span>');
    expect(chip(true)).toContain('class="tag-chip tag-chip--alias call-chip call-chip--open">Ada Sample<button type="button" class="call-chip__on" aria-expanded="true"');
    nameStyleStore.set("except");
    expect(chip(false)).not.toContain("Ada Sample");
  });

  const choices = (props: Partial<Parameters<typeof CallOnChoices>[0]>) =>
    renderToStaticMarkup(createElement(CallOnChoices, { name: ada, accounts: accounts.slice(0, 2), on: { accountId: 12, platform: "messenger" }, onChoose: () => {}, ...props }));

  it("offers each account that carries calls as its platform's chip and its name, the chosen one checked", () => {
    const html = choices({});
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('<button type="button" role="radio" aria-checked="false" class="call-accounts__account" title="+61491570006"><span class="platform-badge">FaceTime</span><span class="call-accounts__name">+61491570006</span></button>');
    expect(html).toContain('<button type="button" role="radio" aria-checked="true" class="call-accounts__account" title="Ada Sample"><span class="platform-badge">Messenger</span>');
  });

  it("offers the apps for someone with no account that carries calls, and says while their accounts load", () => {
    const html = choices({ accounts: [], on: { accountId: null, app: "wechat" } });
    expect(html.match(/role="radio"/g)).toHaveLength(10);
    expect([...html.matchAll(/<span class="platform-badge">([^<]+)<\/span>/g)].map((m) => m[1])).toEqual(
      ["Phone", "FaceTime", "WhatsApp", "Messenger", "Instagram", "Signal", "Telegram", "WeChat", "Discord", "Other"],
    );
    expect(html).toContain('aria-checked="true" class="call-accounts__account" title="None of their accounts carries calls, so the call is on the app you say"><span class="platform-badge">WeChat</span>');
    expect(html).toContain('<span class="platform-badge">Other</span>');
    expect(choices({ accounts: undefined })).toContain("Loading their accounts…");
  });

  it("hides their names with the names (No name except…)", () => {
    nameStyleStore.set("except");
    expect(choices({})).not.toMatch(/Ada Sample|\+61491570006/);
  });
});

describe("the hangouts list", () => {
  const field = (catchUps: CatchUp[], open = true) => createElement(CatchUpsField, { person: ada, catchUps, open, onToggle: () => {}, onOpenPerson: () => {} });

  it("closed: the heading with the count, Add event beside it, and no list", () => {
    const catchUps: CatchUp[] = [{ id: 1, day: "2026-09-27", time: null, hours: 1, trip: null, note: "", people: [ada], others: 0 }];
    const html = renderToStaticMarkup(field(catchUps, false));
    expect(html).toBe('<div class="field"><span class="field__head"><button type="button" class="field__toggle" aria-expanded="false"><span aria-hidden="true">▸</span> Hangouts · 1</button><button type="button" class="link-button catch-ups__add">Add event</button></span></div>');
  });

  it("offers no Add event on a read-only page", () => {
    const html = renderToStaticMarkup(createElement(ReadOnly.Provider, { value: true }, field([], false)));
    expect(html).not.toContain("Add event");
  });

  it("names each by its hours, its date and its time when it has one, never by call", () => {
    const catchUps: CatchUp[] = [
      { id: 2, day: "2026-10-04", time: "19:30", hours: 2.5, trip: null, note: "dinner", people: [ada, bea], others: 0 },
      // One a backend still sends with byCall, from before calls were their own kind: a hangout like any other.
      { id: 1, day: "2026-09-27", time: null, hours: 1, trip: null, byCall: true, note: "", people: [ada], others: 0 } as CatchUp,
    ];
    const html = renderToStaticMarkup(field(catchUps));
    expect(html).toContain("<strong>2.5 hours</strong> · 4 Oct 2026, 7:30 pm");
    expect(html).toContain("<strong>1 hour</strong> · 27 Sept 2026");
    expect(html).not.toContain("by call");
  });

  it("says how many more were there unnamed, after anyone else, or alone", () => {
    const catchUps: CatchUp[] = [
      { id: 3, day: "2026-10-05", time: null, hours: 5, trip: null, note: "", people: [ada, bea], others: 20 },
      { id: 2, day: "2026-10-04", time: null, hours: 2, trip: null, note: "", people: [ada], others: 1 },
      { id: 1, day: "2026-09-27", time: null, hours: 1, trip: null, note: "", people: [ada], others: 0 },
    ];
    const html = renderToStaticMarkup(field(catchUps));
    expect(html).toMatch(/with <span><button[^>]*>Bea Sample<\/button><\/span> \+20 others<\/span>/);
    expect(html).toContain('<span class="catch-ups__with muted">+1 other</span>');
    expect(html.match(/catch-ups__with/g)).toHaveLength(2);
  });
});
