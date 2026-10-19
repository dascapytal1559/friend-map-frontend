// The Spider web's shape (webStyle.ts): its Strand curve and Spokes, saved
// with the web's other settings (savedStore.ts); and the map drawn to markup to see no Orbits' dashed guide
// rings on it, the web's own rings standing in for them, the labels kept,
// each on the level thread across its ring's top, even in a browser that
// still keeps the retired Natural style.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { buildModel } from "./model.ts";
import { web } from "./Orbits.tsx";
import { orbitRadius } from "./orbitsLayout.ts";
import { stageOf } from "./orbitsSky.ts";
import { keptAs } from "../demoMode.ts";
import { STRAND_DEPTH } from "./webGeometry.ts";
import { CURVE_KEY, curveOf, DEFAULT_CURVE, DEFAULT_SPOKES, SPOKES, SPOKES_KEY, spokesOf, webCurveStore, webSpokesStore } from "./webStyle.ts";

function memory(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

afterEach(() => {
  for (const store of [webCurveStore, webSpokesStore]) store.reload(memory());
  vi.unstubAllGlobals();
});

describe("the web's sliders", () => {
  it("are a strand curve from 0 to 1, 10% until moved, and an even number of spokes from 8 to 48, 14 until moved", () => {
    expect([DEFAULT_CURVE, DEFAULT_SPOKES]).toEqual([0.1, 14]);
    expect(SPOKES).toEqual({ min: 8, max: 48, step: 2 });
    expect([curveOf(0.3), curveOf("0.7"), curveOf(-1), curveOf(4), curveOf("deep"), curveOf(null), curveOf("")]).toEqual([0.3, 0.7, 0, 1, 0.1, 0.1, 0.1]);
    expect([spokesOf(8), spokesOf("48"), spokesOf(13), spokesOf(2), spokesOf(100), spokesOf("many"), spokesOf("")]).toEqual([8, 48, 14, 8, 48, 14, 14]);
  });

  it("keep every choice where they are kept, the default too, and read back what was kept", () => {
    const kept = memory();
    webCurveStore.reload(kept);
    webSpokesStore.reload(kept);
    webCurveStore.set(0.35);
    webSpokesStore.set(40);
    expect(Object.fromEntries(kept.kept)).toEqual({ [CURVE_KEY]: "0.35", [SPOKES_KEY]: "40" });
    webCurveStore.reload(kept);
    webSpokesStore.reload(kept);
    expect([webCurveStore.get(), webSpokesStore.get()]).toEqual([0.35, 40]);
    webCurveStore.set(0.1);
    webSpokesStore.set(14);
    expect(Object.fromEntries(kept.kept)).toEqual({ [CURVE_KEY]: "0.1", [SPOKES_KEY]: "14" });
  });
});

describe("the Spider web's guide rings", () => {
  const NOW = Date.parse("2026-03-15T12:00:00+11:00");
  const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
  const person = (id: number): PersonRelationship => ({
    id, name: `Sample Person ${id}`, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(100 - id), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(100 - id) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  });
  // Forty made-up people: enough for the closest 10 and 25 to have rings.
  const report: RelationshipsReport = { generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: Array.from({ length: 40 }, (_, i) => person(i + 1)) };
  const props = { model: buildModel(report), width: 800, height: 600, inset: 60, hover: () => {}, open: () => {} };
  const { inner, outer } = stageOf(props.width, props.height, props.inset);
  // The sky's two groups of rings: the guide rings under the people, and their labels over them.
  const ringGroups = (markup: string) => [...markup.matchAll(/<g class="orbits__rings">(.*?)<\/g>/g)].map((m) => m[1]);
  const labelYs = (markup: string) => [...ringGroups(markup)[1].matchAll(/<text y="([-\d.]+)"[^>]*>(top \d+)<\/text>/g)].map((m) => [m[2], Number(m[1])]);

  beforeEach(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));

  it("are the web's own rings, drawn on its canvas, evenly apart: Orbits draws no circle, only the labels, on each ring's level top", () => {
    // Straight strands, so each ring's top thread is level with its apothem.
    webCurveStore.reload(memory({ [CURVE_KEY]: "0" }));
    const markup = renderToStaticMarkup(createElement(web.View, props));
    expect(ringGroups(markup)[0]).not.toContain("<circle");
    const apothem = Math.cos(Math.PI / DEFAULT_SPOKES);
    // On the even scale: the closest orbit to the outermost cut into three equal bands by the two rings.
    const radii = [10, 25].map((n) => orbitRadius(n + 0.5, inner, outer, 40, 0, "even"));
    expect(radii).toEqual([1, 2].map((i) => expect.closeTo(inner + ((outer - inner) * i) / 3, 6)));
    expect(labelYs(markup)).toEqual([["top 10", expect.closeTo(-radii[0] * apothem + 3.5, 6)], ["top 25", expect.closeTo(-radii[1] * apothem + 3.5, 6)]]);
  });

  it("follow the web's sliders: each label on the middle of its ring's top thread, as many spokes and as low as it sags", () => {
    const straight = renderToStaticMarkup(createElement(web.View, props));
    const radii = [10, 25].map((n) => orbitRadius(n + 0.5, inner, outer, 40, 0, "even"));
    for (const store of [webCurveStore, webSpokesStore]) store.reload(memory({ [CURVE_KEY]: "1", [SPOKES_KEY]: "8" }));
    const deep = renderToStaticMarkup(createElement(web.View, props));
    const top = (r: number) => r * Math.cos(Math.PI / 8) - STRAND_DEPTH * 2 * r * Math.sin(Math.PI / 8);
    expect(labelYs(deep)).toEqual([["top 10", expect.closeTo(-top(radii[0]) + 3.5, 6)], ["top 25", expect.closeTo(-top(radii[1]) + 3.5, 6)]]);
    expect(labelYs(deep)).not.toEqual(labelYs(straight));
  });

  it("are the same in a browser that still keeps the retired Natural style: it is read no more, and the web is the one web", () => {
    const plain = renderToStaticMarkup(createElement(web.View, props));
    const stored = { [keptAs("friend-map.web.style")]: "natural" };
    vi.stubGlobal("localStorage", memory(stored));
    for (const store of [webCurveStore, webSpokesStore]) store.reload(memory(stored));
    const kept = renderToStaticMarkup(createElement(web.View, props));
    expect(ringGroups(kept)[0]).not.toContain("<circle");
    expect(kept).toBe(plain);
  });
});
