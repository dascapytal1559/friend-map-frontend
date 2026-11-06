// @vitest-environment happy-dom
// The hover card (HoverCard in view.tsx) is placed by its size as drawn, which a ResizeObserver tells it once the
// browser has laid the page out, and only when that size changes. So a hover never reads the card's size, which would
// make the browser lay out everything the hover changed there and then, ahead of the frame. Drawn in a page, with the
// observer played by the test. Made-up people only.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CROWD_FIRST, CROWD_LAST } from "../../server/fixtures/madeUpNames.ts";
import type { PersonRelationship } from "../archive.ts";
import { buildModel } from "./model.ts";
import { HoverCard, tipPlace, type Tip } from "./view.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (n: number) => ({ directFromMe: n, directFromMeSelfOnly: 0, directFromThem: n, groupFromMe: 0, groupFromThem: 0 });
function person(id: number): PersonRelationship {
  return {
    id, name: `${CROWD_FIRST[id % CROWD_FIRST.length]} ${CROWD_LAST[1]}`, aliases: [], tags: [], note: "", unknown: false, platforms: [],
    shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(100 - id), firstMessageAt: NOW, lastMessageAt: NOW, months: [{ month: "2026-03", ...counts(100 - id) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}
const model = buildModel({ generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: [person(1), person(2)] });
const bounds = { width: 1000, height: 800 };
// Near the bottom right, so the card's size decides where it goes.
const tipFor = (index: number): Tip => ({ x: 700, y: 700, person: model.people[index], rows: [["Closeness", `#${index + 1}`]] });

// A ResizeObserver the test drives: it says a size only when told to.
class FakeObserver {
  static all: FakeObserver[] = [];
  watched: Element[] = [];
  tell: (entries: Array<{ borderBoxSize: Array<{ inlineSize: number; blockSize: number }> }>) => void;
  constructor(tell: FakeObserver["tell"]) {
    this.tell = tell;
    FakeObserver.all.push(this);
  }
  observe(element: Element) { this.watched.push(element); }
  disconnect() { this.watched = []; }
}

let host: HTMLElement;
let root: Root;
let reads: number;

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal("ResizeObserver", FakeObserver);
  reads = 0;
  for (const key of ["offsetWidth", "offsetHeight"] as const) {
    vi.spyOn(HTMLElement.prototype, key, "get").mockImplementation(() => {
      reads++;
      return 0;
    });
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const card = () => host.querySelector<HTMLElement>(".demo-tip")!;
const placed = () => ({ left: parseFloat(card().style.left), top: parseFloat(card().style.top) });
const show = (tip: Tip) => act(async () => root.render(createElement(HoverCard, { tip, bounds })));
const drawnAt = (width: number, height: number) => act(async () => FakeObserver.all.at(-1)!.tell([{ borderBoxSize: [{ inlineSize: width, blockSize: height }] }]));

describe("the hover card", () => {
  it("reads no size as it is shown or moves to someone else", async () => {
    await show(tipFor(0));
    await show(tipFor(1));
    await show(tipFor(0));
    expect(reads).toBe(0);
  });

  it("is placed by an estimate of its size until it is drawn, then by its size as drawn", async () => {
    await show(tipFor(0));
    expect(placed()).toEqual(tipPlace(tipFor(0), bounds));
    expect(FakeObserver.all.at(-1)!.watched).toEqual([card()]);
    await drawnAt(250, 140);
    expect(placed()).toEqual(tipPlace(tipFor(0), bounds, { width: 250, height: 140 }));
    expect(placed()).not.toEqual(tipPlace(tipFor(0), bounds));
  });

  it("keeps its size as drawn for the next person, and takes theirs when it changes", async () => {
    await show(tipFor(0));
    await drawnAt(250, 140);
    await show(tipFor(1));
    expect(placed()).toEqual(tipPlace(tipFor(1), bounds, { width: 250, height: 140 }));
    await drawnAt(270, 180);
    expect(placed()).toEqual(tipPlace(tipFor(1), bounds, { width: 270, height: 180 }));
    // One observer for as long as the card is shown.
    expect(FakeObserver.all).toHaveLength(1);
  });

  it("stops watching once it is gone", async () => {
    await show(tipFor(0));
    await act(async () => root.render(null));
    expect(FakeObserver.all.at(-1)!.watched).toEqual([]);
  });
});
