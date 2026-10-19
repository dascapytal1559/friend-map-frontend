// A hangout (a catch-up) in the person's chat (ChatCatchUp, CatchUps.tsx): what it was, who else was there and its
// note, opening to Add event's form on Hangout, with Delete; and a call you logged (ChatLoggedCall), opening to
// it on Call. Each save shows the chip, whose Undo takes it back.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallRef, CatchUp, PersonCall } from "./archive.ts";
import { callRecords } from "./callRecords.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { changeChip, saveCallAnswered, saveCallNote } from "./changeChip.ts";
import { chatDays, sameDay, withEvents } from "./chatDays.ts";
import { ChatCatchUp, ChatLoggedCall, convertToCall, convertToCatchUp, EventForm, NewChatEvent, removeCall, removeCatchUp, saveCall, saveCatchUp } from "./CatchUps.tsx";
import { nameStyleStore } from "./names.ts";
import { ReadOnly } from "./readOnly.ts";
import { Call } from "./Timeline.tsx";

const ada = { id: 7, name: "Ada Sample", aliases: [] };
const bruno = { id: 8, name: "Bruno Placeholder", aliases: [] };
const dinner: CatchUp = { id: 3, day: "2026-10-04", time: null, hours: 3, trip: null, byCall: false, note: "Dinner\nand a walk after", people: [ada, bruno], others: 2 };

const drawn = (catchUp: CatchUp, readOnly = false) =>
  renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(ChatCatchUp, { catchUp, personId: ada.id })));

describe("a hangout in the chat", () => {
  afterEach(() => nameStyleStore.set("full"));

  it("says how long, who else was there and its note's first line, and opens to be changed", () => {
    const html = drawn(dinner);
    expect(html).toContain('<div class="message message--catch-up"><button type="button" class="message__body message__catch-up-open" title="Change this hangout">');
    expect(html).toContain("<strong>Hangout</strong> · 3 hours");
    expect(html).toContain('<span class="catch-ups__with muted">with <span>Bruno Placeholder</span> +2 others</span>');
    expect(html).toContain('<span class="message__catch-up-note">Dinner</span>');
    expect(html).not.toContain("and a walk after");
  });

  it("says when it started, when it has a time, and by call when it was", () => {
    expect(drawn({ ...dinner, time: "19:30" })).toContain("<strong>Hangout</strong> · 7:30 pm · 3 hours</span>");
    expect(drawn({ ...dinner, time: "19:30", byCall: true })).toContain("<strong>Hangout</strong> · 7:30 pm · 3 hours by call</span>");
  });

  it("only shows on a read-only page, and says nothing of who else when they were alone", () => {
    const html = drawn({ ...dinner, people: [ada], others: 0, note: "" }, true);
    expect(html).toBe('<div class="message message--catch-up"><div class="message__body"><span class="message__catch-up-what"><strong>Hangout</strong> · 3 hours</span></div></div>');
  });

  it("hides its note with the names (No name except…)", () => {
    nameStyleStore.set("except");
    expect(drawn(dinner)).toContain('<span class="muted">Note hidden</span>');
    expect(drawn(dinner)).not.toContain("Dinner");
  });

  it("offers + event on a day up to today, but not on a read-only page; the form offers Delete only for one being changed", () => {
    const add = (readOnly: boolean, day = "2026-10-04") =>
      renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(NewChatEvent, { person: ada, day })));
    expect(add(false)).toContain(">+ event</button>");
    expect(add(true)).toBe("");
    expect(add(false, "2999-01-01")).toBe("");
    const form = (onDelete?: () => Promise<boolean>) => renderToStaticMarkup(createElement(EventForm, { start: { kind: "hangout", id: 3, hangout: dinner }, onDone: () => {}, onDelete }));
    expect(form(async () => true)).toContain('class="link-button catch-ups__delete">Delete</button>');
    expect(form()).not.toContain("Delete");
  });
});

/** A 25-minute FaceTime call Ada and you had at 7:30 pm on 4 October, as you logged it on her iMessage account. */
const logged: PersonCall = {
  id: 5, platform: "imessage", messageId: null, manual: true, accountId: 11, at: Date.parse("2026-10-04T19:30:00+11:00"), durationSeconds: 1500,
  direction: null, answered: true, service: null, group: 5, people: 1, others: 0, note: "",
};

describe("a call in no chat, among the messages", () => {
  const phone: PersonCall = { ...logged, platform: "phone", manual: false, accountId: 9, direction: "incoming", service: "phone", group: null };
  const html = (call: PersonCall) => renderToStaticMarkup(createElement(Call, { call }));

  it("says the phone's as before, and an app's with several people with the app and how many others were on it", () => {
    expect(html(phone)).toBe('<div class="message message--call"><div class="message__meta">7:30 pm · They called</div><div class="message__body"><p>Call · 25 min</p></div></div>');
    const threeWay: PersonCall = { ...phone, platform: "whatsapp", service: "video", group: -5, people: 3, others: 1, note: "" };
    expect(html(threeWay)).toContain('<p>Video call · 25 min</p><span class="muted"><span class="platform-badge">WhatsApp</span> · with 2 others</span>');
    expect(html({ ...threeWay, answered: false, durationSeconds: 0, direction: "outgoing" })).toContain("You called</div><div class=\"message__body\"><p>Unanswered video call</p>");
  });

  it("shows the first line of your note on it", () => {
    expect(html({ ...phone, note: "Asked about the move\nand more" })).toContain('<p>Call · 25 min</p><span class="message__catch-up-note message__call-note" title="Asked about the move\nand more">Asked about the move</span>');
  });
});

describe("a logged call in the chat", () => {
  it("says when, how long and on what (its account's platform, else the app said), that you logged it, and opens to be changed; on a read-only page it only shows", () => {
    const html = (readOnly: boolean, call = logged) =>
      renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(ChatLoggedCall, { call })));
    expect(html(false)).toBe('<div class="message message--catch-up message--logged-call"><button type="button" class="message__body message__catch-up-open" title="Change this call">'
      + '<span class="message__catch-up-what"><strong>Call</strong> · 7:30 pm · 25 min</span><span class="muted"><span class="platform-badge">FaceTime</span> · you logged it</span></button></div>');
    expect(html(true)).not.toContain("<button");
    expect(html(false, { ...logged, platform: "discord", accountId: 12 })).toContain('<span class="platform-badge">Discord</span> · you logged it');
    expect(html(false, { ...logged, platform: "other", accountId: null })).toContain('<span class="platform-badge">another app</span> · you logged it');
    // One logged with several people says how many others were on it.
    expect(html(false, { ...logged, people: 3 })).toContain('<span class="platform-badge">FaceTime</span> · with 2 others · you logged it');
    expect(html(false, { ...logged, people: 2 })).toContain(' · with 1 other · you logged it');
    // Its note's first line, under it.
    expect(html(false, { ...logged, note: "Caught up on the week" })).toContain('you logged it</span><span class="message__catch-up-note message__call-note" title="Caught up on the week">Caught up on the week</span></button>');
  });

  it("sits in the chat at its time, apart from the imported calls of the same number", () => {
    const imported: PersonCall = { ...logged, platform: "phone", manual: false, accountId: 9, direction: "incoming", service: "phone", at: logged.at + 60_000 };
    const entries = withEvents([], [logged, imported], [], true);
    expect(entries.map((e) => e.id)).toHaveLength(2);
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });
});

describe("changing a hangout or a logged call from the chat", () => {
  let changed: () => void;
  let api: Record<"changeCatchUp" | "deleteCatchUp" | "changeCall" | "deleteCall" | "callToCatchUp" | "catchUpToCall" | "setCallNote" | "setCallAnswered" | "undoChange", ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.useFakeTimers();
    // archiveChanged tells the page through document (the panel then loads the catch-ups again); here, a listener counts it.
    const page = new EventTarget();
    changed = vi.fn();
    page.addEventListener("friend-map:archive-changed", () => changed());
    vi.stubGlobal("document", page);
    api = {
      changeCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 71 })),
      deleteCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 72 })),
      changeCall: vi.fn(async () => ({ call: null, changeset: 73 })),
      deleteCall: vi.fn(async () => ({ call: null, changeset: 74 })),
      callToCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 77 })),
      catchUpToCall: vi.fn(async () => ({ call: null, changeset: 78 })),
      setCallNote: vi.fn(async (call: CallRef, note: string) => ({ call, note: note.trim(), changeset: 75 })),
      setCallAnswered: vi.fn(async (call: CallRef, answered: string) => ({ call, answered: answered === "unknown" ? null : answered === "answered", answeredSet: answered !== "answered", changeset: 76 })),
      undoChange: vi.fn(async () => ({})),
    };
    provideArchive(api as unknown as ArchiveApi);
  });

  afterEach(() => {
    changeChip.dismiss();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("saves it, shows the chip and loads again, so its day is drawn anew; Undo takes it back", async () => {
    const input = { day: dinner.day, time: "19:30", hours: 4, trip: null, byCall: false, note: dinner.note, personIds: [7, 8], others: 2 };
    expect(await saveCatchUp(input, dinner.id)).toBe(true);
    expect(api.changeCatchUp).toHaveBeenCalledWith(3, input);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "changed", what: "hangout of 4 hours on 4 Oct 2026 at 7:30 pm" }, changeset: 71 });
    expect(changed).toHaveBeenCalledTimes(1);
    // The catch-ups loaded again: the chat's day holds the changed one, so it is drawn again.
    const before = chatDays(withEvents([], [], [dinner], true))[0];
    expect(sameDay(before, chatDays(withEvents([], [], [{ ...dinner, hours: 4 }], true))[0])).toBe(false);
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(71);
    expect(changeChip.get()).toMatchObject({ phase: "undone" });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("deletes it, with the chip to bring it back", async () => {
    expect(await removeCatchUp(dinner)).toBe(true);
    expect(api.deleteCatchUp).toHaveBeenCalledWith(3);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "deleted", what: "hangout of 3 hours on 4 Oct 2026" }, changeset: 72 });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(72);
  });

  it("saves and deletes a logged call, naming it on the chip by its account's platform", async () => {
    const input = { people: [{ personId: 7, accountId: 11, app: null }], day: "2026-10-04", time: "19:30", minutes: 90, note: "" };
    api.changeCall.mockResolvedValueOnce({ call: { ...logged, durationSeconds: 5400 }, changeset: 73 });
    expect(await saveCall(input, 5)).toBe(true);
    expect(api.changeCall).toHaveBeenCalledWith(5, input);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "changed", what: "call of 1 h 30 min on FaceTime, 4 Oct 2026 at 7:30 pm" }, changeset: 73 });
    expect(await removeCall(logged)).toBe(true);
    expect(api.deleteCall).toHaveBeenCalledWith(5);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "deleted", what: "call of 25 min on FaceTime, 4 Oct 2026 at 7:30 pm" }, changeset: 74 });
    // One with several people is named by how many were on it, and deleted whole.
    expect(await removeCall({ ...logged, people: 3 })).toBe(true);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "deleted", what: "call of 25 min with 3 people, 4 Oct 2026 at 7:30 pm" } });
  });

  it("makes a logged call a hangout and a hangout a call, each one change the chip names as it is now; Undo takes it back", async () => {
    const asHangout = { day: "2026-10-04", time: "19:30", hours: 0.42, trip: null, byCall: false, note: "", personIds: [7], others: 0 };
    expect(await convertToCatchUp(5, asHangout)).toBe(true);
    expect(api.callToCatchUp).toHaveBeenCalledWith(5, asHangout);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "converted", what: "hangout of 0.42 hours on 4 Oct 2026 at 7:30 pm" }, changeset: 77 });
    expect(changed).toHaveBeenCalledTimes(1);
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(77);
    const asCall = { people: [{ personId: 7, accountId: null, app: "discord" as const }], day: dinner.day, time: "19:30", minutes: 180, note: dinner.note };
    api.catchUpToCall.mockResolvedValueOnce({ call: { ...logged, platform: "discord", durationSeconds: 10_800 }, changeset: 78 });
    expect(await convertToCall(dinner.id, asCall)).toBe(true);
    expect(api.catchUpToCall).toHaveBeenCalledWith(3, asCall);
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "converted", what: "call of 3 h on Discord, 4 Oct 2026 at 7:30 pm" }, changeset: 78 });
  });

  it("gives a call a note (the Table's Calls), the chip naming its day; a call record's chat shows it at once, and again as it was on Undo", async () => {
    const record: CallRef = { kind: "record", id: 41 };
    expect(await saveCallNote(record, "3 Oct 2026", "", " Planned the trip ")).toBe("Planned the trip");
    expect(api.setCallNote).toHaveBeenCalledWith(record, " Planned the trip ");
    expect(changeChip.get()).toMatchObject({ what: { kind: "call-note", call: record, day: "3 Oct 2026", before: "", after: "Planned the trip" }, changeset: 75 });
    expect(callRecords.get(41)).toEqual({ callNote: "Planned the trip" });
    expect(changed).toHaveBeenCalledTimes(1);
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(75);
    expect(callRecords.get(41)).toEqual({ callNote: "" });
    // A logged call's note is in the panel's calls, which load again; nothing is kept for it on the page.
    await saveCallNote({ kind: "logged", id: 5 }, "4 Oct 2026", "", "Caught up on the week");
    expect(callRecords.get(5)).toBeUndefined();
  });

  it("says whether a call was answered (the Table's Calls), the chip naming its day, and everything loads again; Undo takes it back", async () => {
    const record: CallRef = { kind: "record", id: 41 };
    expect(await saveCallAnswered(record, "3 Oct 2026", "missed")).toEqual({ call: record, answered: false, answeredSet: true });
    expect(api.setCallAnswered).toHaveBeenCalledWith(record, "missed");
    expect(changeChip.get()).toMatchObject({ what: { kind: "call-answered", day: "3 Oct 2026", answered: false, set: true }, changeset: 76 });
    expect(changed).toHaveBeenCalledTimes(1);
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(76);
  });

  it("says it did not save when the archive refuses", async () => {
    api.changeCatchUp.mockRejectedValueOnce(new Error("no"));
    const reported = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveCatchUp({ day: dinner.day, time: null, hours: 1, trip: null, byCall: false, note: "", personIds: [7], others: 0 }, dinner.id)).toBe(false);
    expect(changeChip.get()).toBeNull();
    reported.mockRestore();
  });
});
