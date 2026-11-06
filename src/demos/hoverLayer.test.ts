// @vitest-environment happy-dom
// A hover on Orbits and the Spider web (Orbits.tsx): the people's layer, everyone's marks, is drawn once and dimmed
// as a whole while someone is picked out, they and whoever shares group chats with them drawn again over it at their
// own strengths, and their own marks beneath hidden (hiddenMarks.ts). So a hover changes the layer's one opacity and
// the marks of the few it picks out, not every mark on the map. Drawn in a page, as a pointer moves over it.
// Made-up people only.

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CROWD_FIRST, CROWD_LAST } from "../../server/fixtures/madeUpNames.ts";
import { provideApp, type AppApi } from "../appApi.ts";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { swapHidden, marksOf } from "./hiddenMarks.ts";
import { buildModel } from "./model.ts";
import { keptZoom, OrbitMap, type OrbitLook } from "./Orbits.tsx";
import { DIM } from "./orbitsLayout.ts";
import { HOME } from "./orbitsZoom.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (n: number) => ({ directFromMe: n, directFromMeSelfOnly: 0, directFromThem: n, groupFromMe: 0, groupFromThem: 0 });
function person(id: number): PersonRelationship {
  return {
    id, name: `${CROWD_FIRST[id % CROWD_FIRST.length]} ${CROWD_LAST[0]}`, aliases: [], tags: [], note: "", unknown: false, platforms: [],
    shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(400 - 5 * id), firstMessageAt: NOW, lastMessageAt: NOW, months: [{ month: "2026-03", ...counts(400 - 5 * id) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}
// Forty people; the 30th shares a group chat with the 31st and the 32nd.
const report: RelationshipsReport = {
  generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
  people: Array.from({ length: 40 }, (_, i) => person(i + 1)),
  groups: [{ id: 10, memberIds: [30, 31, 32], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] }],
};
const model = buildModel(report);

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  // Reduced motion: everyone drawn where they settle at once.
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query.includes("reduced-motion"), media: query, addEventListener() {}, removeEventListener() {},
  }) as unknown as MediaQueryList);
  // No photo in place of the sun.
  provideApp({ mePhoto: async () => null } as unknown as AppApi);
  keptZoom.current = HOME;
  host = document.createElement("div");
  host.className = "demos__stage";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

/** The map, named by none of its Show top names so everyone is drawn as their icon, until a pick names them. */
const mount = (look: OrbitLook) => act(async () => root.render(createElement(OrbitMap, {
  model, width: 800, height: 600, inset: 60, hover: () => {}, open: () => {}, look, named: 0,
})));
const layer = (name: string) => host.querySelector<SVGSVGElement>(`svg.${name}`)!;
const marksOfIn = (svg: Element, id: number) => [...svg.querySelectorAll<SVGElement>(`[data-p="${id}"]`)];
const markerIn = (svg: Element, id: number) => svg.querySelector<SVGCircleElement>(`circle[fill="url(#orbits-face-${id})"]`);
/** Moves the pointer over someone's marker, as drawn in the people's layer. */
async function pointAt(id: number): Promise<void> {
  const marker = markerIn(layer("orbits__people"), id)!;
  const [sx, sy] = layer("orbits__people").querySelector("g")!.getAttribute("transform")!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.slice(1).map(Number);
  const at = { clientX: sx + Number(marker.getAttribute("cx")), clientY: sy + Number(marker.getAttribute("cy")) };
  await act(async () => void host.querySelector("svg.orbits")!.dispatchEvent(new PointerEvent("pointermove", { ...at, bubbles: true, pointerType: "mouse" })));
}

describe("a hover on the map", () => {
  for (const look of ["night", "web"] as const) {
    it(`dims the people's layer as a whole, touching only the marks of those it picks out (${look})`, async () => {
      await mount(look);
      const people = layer("orbits__people");
      expect(people.style.opacity).toBe("");
      expect(marksOfIn(people, 30).length).toBeGreaterThan(0);
      const changed: MutationRecord[] = [];
      const watch = new MutationObserver((records) => changed.push(...records));
      watch.observe(people, { subtree: true, attributes: true, childList: true });
      // The layer drawn again would have its marks found again (useHiddenMarks): it is not.
      const found = vi.spyOn(people, "querySelectorAll");

      await pointAt(30);
      watch.takeRecords().forEach((r) => changed.push(r));
      expect(found.mock.calls.filter(([selector]) => selector === "[data-p]")).toEqual([]);
      found.mockRestore();
      // One opacity on the layer, and the marks of the hovered and their two links hidden; nothing else in it changes.
      expect(people.style.opacity).toBe(String(DIM));
      expect(changed.filter((r) => r.type === "childList")).toEqual([]);
      const touched = new Set(changed.map((r) => r.target as Element).filter((el) => el !== people).map((el) => Number(el.getAttribute("data-p"))));
      expect([...touched].sort()).toEqual([30, 31, 32]);
      for (const id of [30, 31, 32]) for (const mark of marksOfIn(people, id)) expect(mark.style.visibility).toBe("hidden");
      for (const mark of marksOfIn(people, 1)) expect(mark.style.visibility).toBe("");

      // Over it: the two linked at 70%; the hovered named by the hover, at full strength, with no icon under the name.
      const lit = layer("orbits__lit");
      for (const id of [31, 32]) expect(Number(markerIn(lit, id)!.getAttribute("opacity"))).toBeCloseTo(0.7, 6);
      expect(markerIn(lit, 30)).toBeNull();
      expect(markerIn(lit, 1)).toBeNull();
      const names = layer("orbits__name-layer").querySelectorAll(".orbits__name");
      expect(names).toHaveLength(1);
      expect(names[0].classList.contains("orbits__name--focus")).toBe(true);
      expect(names[0].getAttribute("opacity")).toBe("1");
      expect(host.querySelectorAll("svg.orbits:not(.orbits__people):not(.orbits__lit):not(.orbits__name-layer) .orbits__links line")).toHaveLength(2);

      // The pointer gone, all of it as it was.
      // (React hears a pointer leaving from its pointerout, to nowhere.)
      await act(async () => void host.querySelector("svg.orbits")!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: null })));
      watch.disconnect();
      expect(people.style.opacity).toBe("");
      for (const id of [30, 31, 32]) for (const mark of marksOfIn(people, id)) expect(mark.style.visibility).toBe("");
      expect(layer("orbits__lit").querySelector(".orbits__body")).toBeNull();
    });
  }
});

describe("swapHidden", () => {
  const page = () => {
    const box = document.createElement("div");
    box.innerHTML = '<i data-p="1"></i><i data-p="1"></i><i data-p="2"></i><i data-p="3"></i>';
    return box;
  };
  const shown = (box: Element) => [...box.querySelectorAll<HTMLElement>("i")].map((i) => i.style.visibility !== "hidden");

  it("hides the marks of everyone newly hidden and shows again those let go, touching no one else", () => {
    const box = page();
    const marks = marksOf(box);
    swapHidden(marks, new Set(), new Set([1]));
    expect(shown(box)).toEqual([false, false, true, true]);
    // 3 hidden by hand: not one of those swapped, so left alone.
    box.querySelectorAll<HTMLElement>("i")[3].style.visibility = "hidden";
    swapHidden(marks, new Set([1]), new Set([2]));
    expect(shown(box)).toEqual([true, true, false, false]);
  });

  it("after the layer is drawn again, sets everyone's in either", () => {
    const box = page();
    swapHidden(marksOf(box), new Set([2]), new Set([1, 2]), true);
    expect(shown(box)).toEqual([false, false, false, true]);
  });
});
