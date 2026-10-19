// @vitest-environment happy-dom
// The chat under its "Messages" fold (the person panel's): opening and closing it, and its loading, leave what sits above
// it (`children`: the panel's activity chart, hangouts and group chats) on the page as it was, never drawn anew; the
// archive is asked for nothing until it is first opened, and once only. Its controls (`fold.tools`, the panel's "Show
// group messages", and "Load all") are inside it: on a line above the chat while it is open, and nowhere while it is shut.

import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineMessage, TimelinePage } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { Timeline } from "./Timeline.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const message: TimelineMessage = {
  id: 1, platform: "messenger", conversation: { id: 3, type: "direct", title: null, marketplace: false },
  sentAt: Date.UTC(2026, 8, 27, 1), fromSelf: false, sender: "Ada Sample", type: "text", text: "See you at the market",
  unsent: false, callSeconds: null, callLengthGiven: false, callNote: "", attachments: [], reactions: [],
};

let mounts = 0;
/** Stands in for the activity chart: counts each time it is drawn anew. */
function Chart() {
  useEffect(() => void mounts++, []);
  return createElement("div", { className: "chart" });
}

let host: HTMLDivElement;
let root: Root;
let timeline: ReturnType<typeof vi.fn<(personId: number) => Promise<TimelinePage>>>;

/** Stands in for the panel's "Show group messages". */
const groupsSwitch = createElement("label", { className: "show-groups" }, "Show group messages (2 from them)");

const draw = (open: boolean, tools?: ReactNode) =>
  act(async () => {
    root.render(createElement(Timeline, {
      title: "Events", source: { person: 6, groups: false }, version: "1",
      fold: { label: "Messages · 1", open, onChange: () => {}, tools },
    }, createElement(Chart)));
  });

const loadAll = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Load all");

beforeEach(() => {
  mounts = 0;
  timeline = vi.fn(async () => ({ messages: [message], nextBefore: null }));
  provideArchive({ timeline } as unknown as ArchiveApi);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("the chat under its Messages fold", () => {
  it("opens and closes with what sits above it left as it was", async () => {
    await draw(false);
    const chart = host.querySelector(".chart");
    expect(chart).not.toBeNull();
    expect(timeline).not.toHaveBeenCalled();
    expect(host.querySelector(".timeline__scroller")).toBeNull();

    await draw(true);
    expect(timeline).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".timeline__scroller")).not.toBeNull();
    expect(host.querySelector(".chart")).toBe(chart);

    await draw(false);
    expect(host.querySelector(".timeline__scroller")).toBeNull();
    expect(host.querySelector(".chart")).toBe(chart);

    await draw(true);
    expect(host.querySelector(".chart")).toBe(chart);
    expect(mounts).toBe(1);
    // What loaded stays loaded.
    expect(timeline).toHaveBeenCalledTimes(1);
  });

  it("leaves it as it was while the first page loads", async () => {
    let loaded!: (page: TimelinePage) => void;
    timeline.mockImplementation(() => new Promise((resolve) => (loaded = resolve)));
    await draw(false);
    const chart = host.querySelector(".chart");
    await draw(true);
    expect(host.textContent).toContain("Loading messages");
    expect(host.querySelector(".chart")).toBe(chart);
    await act(async () => loaded({ messages: [message], nextBefore: null }));
    expect(host.querySelector(".timeline__scroller")).not.toBeNull();
    expect(host.querySelector(".chart")).toBe(chart);
    expect(mounts).toBe(1);
  });

  it("keeps its controls inside it, shown only while it is open", async () => {
    timeline.mockImplementation(async () => ({ messages: [message], nextBefore: "older" }));
    await draw(false, groupsSwitch);
    const chart = host.querySelector(".chart");
    expect(host.querySelector(".show-groups")).toBeNull();
    expect(loadAll()).toBeUndefined();
    expect(timeline).not.toHaveBeenCalled();

    await draw(true, groupsSwitch);
    const tools = host.querySelector(".timeline__tools");
    expect(tools?.querySelector(".show-groups")).not.toBeNull();
    expect(tools?.contains(loadAll() ?? null)).toBe(true);
    // Not on the Events line, and below the fold's heading.
    expect(host.querySelector(".timeline__header")?.querySelector("button")).toBeNull();
    const toggle = host.querySelector(".timeline__toggle")!;
    expect(toggle.compareDocumentPosition(tools!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await draw(false, groupsSwitch);
    expect(host.querySelector(".show-groups")).toBeNull();
    expect(loadAll()).toBeUndefined();
    expect(host.querySelector(".chart")).toBe(chart);
    expect(mounts).toBe(1);
    expect(timeline).toHaveBeenCalledTimes(1);
  });

  it("shows the switch while the first page loads and when it has nothing, the switch kept as it was", async () => {
    let loaded!: (page: TimelinePage) => void;
    timeline.mockImplementation(() => new Promise((resolve) => (loaded = resolve)));
    await draw(true, groupsSwitch);
    expect(host.textContent).toContain("Loading messages");
    const shown = host.querySelector(".show-groups");
    expect(shown).not.toBeNull();
    // Nothing more to load all of yet.
    expect(loadAll()).toBeUndefined();
    await act(async () => loaded({ messages: [], nextBefore: null }));
    expect(host.textContent).toContain("No one-to-one messages");
    expect(host.querySelector(".show-groups")).toBe(shown);
  });

  it("puts Load all on the title's line without a fold", async () => {
    timeline.mockImplementation(async () => ({ messages: [message], nextBefore: "older" }));
    await act(async () => {
      root.render(createElement(Timeline, { title: "An account", source: { person: 6, groups: false, account: 2 }, version: "1" }));
    });
    expect(host.querySelector(".timeline__header")?.contains(loadAll() ?? null)).toBe(true);
    expect(host.querySelector(".timeline__tools")).toBeNull();
  });
});
