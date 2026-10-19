// The person panel's Accounts, Hangouts, Group chats and Messages: closed whenever a panel opens, nothing remembered from
// an earlier one; Messages opens by itself only when the panel opens at a moment, to show it.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonSummary } from "./archive.ts";
import type { ChatMoment } from "./chatDays.ts";
import { PersonView } from "./PeoplePanel.tsx";

afterEach(() => vi.unstubAllGlobals());

const ada: PersonSummary = {
  id: 6, name: "Ada Smith", aliases: [], tags: [], note: "", noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a2", identiconHue: null,
  edited: false, untouched: false, archived: null, archiveRule: null, location: null, accounts: [],
  messageCount: 1240, directMessageCount: 1200, groupMessageCount: 40, marketplaceMessageCount: 0, lastMessageAt: null,
  unknown: false, lastByPlatform: [], joined: null,
};

const panel = (moment?: ChatMoment) =>
  renderToStaticMarkup(createElement(PersonView, { person: ada, moment, tagNames: [], locations: undefined, onMerged: () => {}, onOpenPerson: () => {} }));

/** Whether the toggle whose label starts with `label` is drawn open. */
const expanded = (html: string, label: string) => {
  const found = html.match(new RegExp(`aria-expanded="(true|false)"[^>]*><span aria-hidden="true">[▸▾]</span> ${label}`));
  expect(found, label).not.toBeNull();
  return found![1] === "true";
};

describe("the person panel's sections", () => {
  // Group chats appear once their list loads, after the panel draws: PersonGroups.test.ts.
  it("open closed: Accounts, Hangouts and Messages, the chat not loading", () => {
    const html = panel();
    expect(expanded(html, "Accounts")).toBe(false);
    expect(expanded(html, "Hangouts")).toBe(false);
    expect(expanded(html, "Messages · 1,200")).toBe(false);
    expect(html).not.toContain("Loading messages");
    expect(html).not.toContain("timeline__scroller");
  });

  it("remember nothing from the browser, even a choice an earlier version kept there", () => {
    const kept = { getItem: () => "true", setItem: vi.fn() };
    vi.stubGlobal("window", { localStorage: kept });
    vi.stubGlobal("localStorage", kept);
    const html = panel();
    for (const label of ["Accounts", "Hangouts", "Messages"]) expect(expanded(html, label), label).toBe(false);
    expect(kept.setItem).not.toHaveBeenCalled();
  });

  it("put Messages under Events, after its chart, hangouts and group chats", () => {
    const html = panel();
    expect(html.indexOf("Messages · ")).toBeGreaterThan(html.indexOf("<h3>Events</h3>"));
    expect(html.indexOf("Messages · ")).toBeGreaterThan(html.indexOf("Hangouts"));
    expect(html.indexOf("Messages · ")).toBeGreaterThan(html.indexOf("activity-chart"));
  });

  it("open Messages, and its chat, when the panel opens at a moment", () => {
    const html = panel({ at: Date.UTC(2026, 8, 27), mark: { catchUp: 1 } });
    expect(expanded(html, "Messages")).toBe(true);
    expect(html).toContain("Loading messages");
    expect(expanded(html, "Accounts")).toBe(false);
    expect(expanded(html, "Hangouts")).toBe(false);
  });
});
