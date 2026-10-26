// The Spider web's settings kept on the server (savedStore.ts): in the real
// app read from the set the page was served and sent back a moment after each
// choice, read again as the page comes back into view; in the demo, kept in
// its visitor's browser, starting at your saved choices (the
// user's ask: "when I change these settings, the demo defaults are
// automatically updated").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keptAs } from "./demoMode.ts";
import { DEFAULT_NAME_FADE, makeNameFadeStores } from "./demos/nameFade.ts";
import { makeTopNamesStores } from "./demos/topNames.ts";
import { makeWebColourChosen } from "./demos/webColour.ts";
import { makeWebSpokesStore, SPOKES_KEY, webCurveStore, webSpokesStore } from "./demos/webStyle.ts";
import type { Kept } from "./keptSetting.ts";
import { makeNameStyleStore, nameStyleStore } from "./names.ts";
import { resetSaved, savedStorage, startSaving } from "./savedStore.ts";

const memory = (initial: Record<string, string> = {}): Kept & { items: Map<string, string> } => {
  const items = new Map(Object.entries(initial));
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
};

beforeEach(() => resetSaved({}));
afterEach(() => {
  vi.useRealTimers();
  resetSaved();
});

describe("in the demo", () => {
  it("each starts at your saved choice, else its own default", () => {
    resetSaved({ "web.spokes": "20", "web.colour": "amber", names: "full" });
    const stores = [makeWebSpokesStore(true), makeWebColourChosen(true), makeNameStyleStore(true)];
    for (const store of stores) store.reload(memory());
    expect(stores.map((store) => store.get())).toEqual([20, "amber", "full"]);
    // Show top names was never chosen: the default, 100.
    expect(makeTopNamesStores(true).web.get()).toBe(100);
    resetSaved({ "web.top-names": "200" });
    expect(makeTopNamesStores(true).web.get()).toBe(200);
  });

  it("starts at its own choice over yours where it has one (DEMO_SAVED): how names fade", () => {
    resetSaved({ "name-fade.faintest": "0.5", "name-fade.reach-out": "fade" });
    const demo = makeNameFadeStores(true);
    for (const store of Object.values(demo)) store.reload(memory());
    // Its own faintest and bottom; yours for the rest.
    expect([demo.faintest.get(), demo.bottom.get(), demo.reachOut.get()]).toEqual([0.4, 50, false]);
    // The real app keeps yours.
    const real = makeNameFadeStores(false);
    expect([real.faintest.get(), real.bottom.get()]).toEqual([0.5, DEFAULT_NAME_FADE.bottom]);
  });

  it("keeps its visitor's choice in their browser, apart, and never on the server", () => {
    resetSaved({ "web.spokes": "20" });
    const browser = memory();
    const spokes = makeWebSpokesStore(true);
    spokes.reload(browser);
    spokes.set(30);
    expect([...browser.items]).toEqual([[keptAs(SPOKES_KEY, true), "30"]]);
    expect(savedStorage.getItem(SPOKES_KEY)).toBe("20");
    // Put back to yours, it is yours again, and follows yours next.
    spokes.set(20);
    expect(browser.items.size).toBe(0);
  });

  it("takes your names choice only when it shows names", () => {
    for (const [saved, demo] of [["first", "first"], ["hide", "initial"], ["except", "initial"]]) {
      resetSaved({ names: saved as "first" });
      const style = makeNameStyleStore(true);
      style.reload(memory());
      expect([saved, style.get()]).toEqual([saved, demo]);
    }
  });
});

describe("in the real app", () => {
  /** A server's answers to the page, as fetch: GET answers `stored`; each PUT is heard and merged in. */
  function server(stored: Record<string, string> = {}) {
    const puts: { body: Record<string, string | null>; keepalive: boolean }[] = [];
    let failing = false;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, string | null>;
        puts.push({ body, keepalive: Boolean(init.keepalive) });
        if (failing) return new Response("", { status: 500 });
        for (const [name, value] of Object.entries(body)) if (value === null) delete stored[name];
        else stored[name] = value;
        return Response.json({ settings: stored });
      }
      return Response.json({ settings: { ...stored } });
    });
    return { fetch: fetch as unknown as typeof globalThis.fetch, puts, stored, fail: (on: boolean) => void (failing = on) };
  }
  /** A page: its window and document, which can be hidden and shown again. */
  function page() {
    const target = new EventTarget() as EventTarget & { document: Document };
    const doc = new EventTarget() as EventTarget & { visibilityState: string };
    doc.visibilityState = "visible";
    target.document = doc as unknown as Document;
    return {
      target,
      hide: () => void ((doc.visibilityState = "hidden"), doc.dispatchEvent(new Event("visibilitychange"))),
      show: () => void ((doc.visibilityState = "visible"), doc.dispatchEvent(new Event("visibilitychange"))),
    };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("reads each from the set the page was served, the default where none was chosen", () => {
    resetSaved({ "web.spokes": "22", names: "full" });
    expect([webSpokesStore.get(), nameStyleStore.get(), webCurveStore.get()]).toEqual([22, "full", 0.1]);
  });

  it("sends choices a moment after the last one, together, the default too", async () => {
    vi.useFakeTimers();
    const api = server();
    const stop = startSaving({ fetch: api.fetch, target: page().target, delay: 300 });
    webSpokesStore.set(20);
    webSpokesStore.set(24);
    nameStyleStore.set("first");
    nameStyleStore.set("initial");
    expect(api.puts).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.puts).toEqual([{ body: { "web.spokes": "24", names: "initial" }, keepalive: false }]);
    expect(api.stored).toEqual({ "web.spokes": "24", names: "initial" });
    stop();
  });

  it("sends at once as the page is hidden, and reads the set again as it comes back, a choice made on another device included", async () => {
    const api = server();
    const view = page();
    const stop = startSaving({ fetch: api.fetch, target: view.target, delay: 10_000 });
    webSpokesStore.set(30);
    view.hide();
    expect(api.puts).toEqual([{ body: { "web.spokes": "30" }, keepalive: true }]);
    await settle();
    // Meanwhile, on the phone:
    api.stored["names"] = "first";
    const heard = vi.fn();
    const unhear = nameStyleStore.subscribe(heard);
    view.show();
    await settle();
    await settle();
    expect([nameStyleStore.get(), webSpokesStore.get()]).toEqual(["first", 30]);
    expect(heard).toHaveBeenCalled();
    unhear();
    stop();
  });

  it("keeps a choice not yet answered as chosen when the set is read again, and one the server refused to send with the next", async () => {
    const api = server({ "web.spokes": "16" });
    const view = page();
    const stop = startSaving({ fetch: api.fetch, target: view.target, delay: 10_000 });
    webSpokesStore.set(40);
    view.target.dispatchEvent(new Event("focus"));
    await settle();
    await settle();
    expect(webSpokesStore.get()).toBe(40);
    api.fail(true);
    view.hide();
    await settle();
    expect(api.stored["web.spokes"]).toBe("16");
    api.fail(false);
    nameStyleStore.set("full");
    view.hide();
    await settle();
    expect(api.puts.at(-1)!.body).toEqual({ "web.spokes": "40", names: "full" });
    expect(api.stored).toEqual({ "web.spokes": "40", names: "full" });
    stop();
  });

  it("sends nothing before saving starts, as in a test or the demo", () => {
    const api = server();
    webSpokesStore.set(18);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(savedStorage.getItem(SPOKES_KEY)).toBe("18");
  });
});
