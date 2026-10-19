// Another app's call record in the chat: it reads as the phone's calls do ("Call · 12 min", "Missed call"), in place
// of the words its app wrote for it; one whose app does not say how long it was offers to take its length.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { callRecords } from "./callRecords.ts";
import { nameStyleStore } from "./names.ts";
import { ReadOnly } from "./readOnly.ts";
import { Message } from "./Timeline.tsx";

provideArchive({ attachmentUrl: (id: number) => `/attachments/${id}` } as unknown as ArchiveApi);

describe("a call record", () => {
  const drawnCall = (callSeconds: number | null, fromSelf = false, { given = false, chat = "direct" as "direct" | "group", readOnly = false, note = "", id = 2 } = {}) =>
    renderToStaticMarkup(createElement(ReadOnly.Provider, { value: readOnly }, createElement(Message, {
      message: {
        id, platform: "messenger", conversation: { id: 9, type: chat, title: "Ada", marketplace: false }, sentAt: 0, fromSelf,
        sender: fromSelf ? null : "Ada", type: "call", text: "Words the app wrote for it", unsent: false, callSeconds, callLengthGiven: given, callNote: note,
        attachments: [], reactions: [],
      },
    })));

  it("reads as a call, in place of the words its app wrote", () => {
    expect(drawnCall(72 * 60)).toMatch(/class="message message--call"[\s\S]*<p>Call · 1 h 12 min<\/p>/);
    expect(drawnCall(72 * 60)).not.toContain("Words the app wrote");
    expect(drawnCall(0)).toMatch(/class="message message--call message--missed"[\s\S]*<p>Missed call<\/p>/);
    expect(drawnCall(0, true)).toMatch(/class="message message--self message--call message--missed"[\s\S]*<p>Unanswered call<\/p>/);
    expect(drawnCall(null)).toMatch(/<p>Call <button[^>]*>Add length<\/button><\/p>/);
  });

  it("offers to add a length only where its app said none, in a one-to-one chat, and to change your own", () => {
    expect(drawnCall(72 * 60)).not.toContain("<button");
    expect(drawnCall(0)).not.toContain("<button");
    expect(drawnCall(null, false, { chat: "group" })).toMatch(/<p>Call<\/p>/);
    expect(drawnCall(null, false, { readOnly: true })).toMatch(/<p>Call<\/p>/);
    expect(drawnCall(25 * 60, false, { given: true })).toMatch(/<p>Call · 25 min<span[^>]*> \(yours\)<\/span> <button[^>]*>Edit<\/button><\/p>/);
  });

  it("shows the first line of your note under it, hidden with the names, and as the page last saved it", () => {
    const note = "Planned the trip\nand the dates";
    expect(drawnCall(72 * 60, false, { note })).toContain('<p>Call · 1 h 12 min</p><span class="message__catch-up-note message__call-note" title="Planned the trip\nand the dates">Planned the trip</span>');
    expect(drawnCall(null, false, { note })).toMatch(/Add length<\/button><\/p><span class="message__catch-up-note message__call-note"[^>]*>Planned the trip<\/span>/);
    expect(drawnCall(72 * 60)).not.toContain("message__call-note");
    nameStyleStore.set("except");
    try {
      expect(drawnCall(72 * 60, false, { note })).toContain('<span class="muted message__call-note">Note hidden</span>');
      expect(drawnCall(72 * 60, false, { note })).not.toContain("Planned");
    } finally {
      nameStyleStore.set("full");
    }
    // Saved from the Table since the chat loaded: the chat shows it at once.
    callRecords.set(31, { callNote: "Talked about the move" });
    expect(drawnCall(72 * 60, false, { note, id: 31 })).toContain(">Talked about the move</span>");
  });
});
