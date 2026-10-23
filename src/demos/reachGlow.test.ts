// The Reach-out glow (reachGlow.ts): a slider's setting every glowing view
// shares, saved with the Spider web's settings (savedStore.ts), the usual look
// until it is moved; what each view draws from it (glowLook, nameGlow); and
// Orbits drawn to markup at the usual glow and the strongest.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { resetSaved } from "../savedStore.ts";
import { buildModel } from "./model.ts";
import { OrbitMap } from "./Orbits.tsx";
import { NAME_GLOW, nameGlow, personOpacity } from "./orbitsLayout.ts";
import { DEFAULT_REACH_GLOW, glowLook, pulseAt, PULSE_MS, REACH_GLOW_KEY, reachGlowLabel, reachGlowOf, reachGlowStore } from "./reachGlow.ts";
import type { ViewProps } from "./view.tsx";

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
  resetSaved();
  reachGlowStore.reload(memory());
  vi.unstubAllGlobals();
});

describe("the Reach-out glow", () => {
  it("is the usual look, 0, until set, and whatever was kept, within 0 and 1", () => {
    expect(DEFAULT_REACH_GLOW).toBe(0);
    reachGlowStore.reload(memory());
    expect(reachGlowStore.get()).toBe(0);
    reachGlowStore.reload(memory({ [REACH_GLOW_KEY]: "0.6" }));
    expect(reachGlowStore.get()).toBe(0.6);
    reachGlowStore.reload(memory({ [REACH_GLOW_KEY]: "bright" }));
    expect(reachGlowStore.get()).toBe(0);
    expect([reachGlowOf("1.7"), reachGlowOf(-2), reachGlowOf(undefined), reachGlowOf("")]).toEqual([1, 0, 0, 0]);
  });

  it("keeps every setting where it is kept, the default too, and tells whoever listens", () => {
    const kept = memory();
    reachGlowStore.reload(kept);
    const heard: number[] = [];
    const stop = reachGlowStore.subscribe(() => heard.push(reachGlowStore.get()));
    reachGlowStore.set(1);
    reachGlowStore.set(1);
    expect(kept.kept.get(REACH_GLOW_KEY)).toBe("1");
    reachGlowStore.set(0);
    expect(kept.kept.get(REACH_GLOW_KEY)).toBe("0");
    expect(heard).toEqual([1, 0]);
    stop();
  });

  it("reads Usual at 0 and how far toward the strongest past it", () => {
    expect([0, 0.05, 0.5, 1].map(reachGlowLabel)).toEqual(["Usual", "+5%", "+50%", "+100%"]);
  });
});

describe("the glow's look", () => {
  it("is the usual one at 0: as far, as bright, and still", () => {
    expect(glowLook(0)).toEqual({ reach: 1, core: 0.75, mid: 0.22, gain: 1, bright: 1, pulse: 0, lift: 0 });
  });

  it("grows with the setting, reaching farther and brighter, its core never past full", () => {
    const steps = [0, 0.25, 0.5, 0.75, 1].map(glowLook);
    for (const [a, b] of steps.slice(1).map((look, i) => [steps[i], look])) {
      for (const key of ["reach", "core", "mid", "gain", "bright", "lift"] as const) expect(b[key]).toBeGreaterThan(a[key]);
    }
    expect(glowLook(1)).toEqual({ reach: 2.2, core: 1, mid: 0.5, gain: expect.closeTo(4 / 3, 9), bright: 1.6, pulse: 1, lift: 0.75 });
    // Orbits 3D's fixed gradient, brightened by gain, is full at its core at the strongest and no more.
    expect(0.75 * glowLook(1).gain).toBeCloseTo(1, 9);
  });

  it("lifts someone to reach out to toward full strength far out, never anyone else, nor anyone already stronger", () => {
    const lift = glowLook(1).lift;
    expect(personOpacity(300, true, { lift: 0 })).toBe(0.4);
    expect(personOpacity(300, true, { lift })).toBeCloseTo(0.85, 9);
    expect(personOpacity(300, false, { lift })).toBe(0.2);
    expect(personOpacity(5, true, { lift })).toBe(1);
  });

  it("breathes only past halfway, and as much as the setting is past it", () => {
    expect([0, 0.25, 0.5, 0.75, 1].map((b) => glowLook(b).pulse)).toEqual([0, 0, 0, 0.5, 1]);
    expect([0, PULSE_MS / 4, PULSE_MS / 2, PULSE_MS].map(pulseAt)).toEqual([0, expect.closeTo(0.5, 9), 1, expect.closeTo(0, 9)]);
  });

  it("leaves a glowing name's halo as it was at 0, and adds a wider, brighter one round it with the setting", () => {
    const colour = "#3a7bd5";
    expect(nameGlow(colour, 1, 0)).toBe(nameGlow(colour, 1));
    expect(nameGlow(colour, 1, 0)).toBe(`drop-shadow(0 0 ${NAME_GLOW.blur.toFixed(2)}px ${colour}cc)`);
    expect(nameGlow(colour, 1, 1)).toBe(`drop-shadow(0 0 3.00px ${colour}ff) drop-shadow(0 0 10.00px ${colour}99)`);
    expect(nameGlow(colour, 0.5, 1)).toBe(`drop-shadow(0 0 1.50px ${colour}80) drop-shadow(0 0 5.00px ${colour}4d)`);
    expect(nameGlow(colour, 0, 1)).toBeUndefined();
  });
});

describe("Orbits drawn with the Reach-out glow", () => {
  const NOW = Date.parse("2026-03-15T12:00:00+11:00");
  const counts = (n: number) => ({ directFromMe: n, directFromThem: n, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 });
  const person = (id: number): PersonRelationship => ({
    id, name: `Sample Person ${id}`, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: id === 7, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(2000 - id * 8), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(2000 - id * 8) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  });
  const report: RelationshipsReport = { generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: Array.from({ length: 40 }, (_, i) => person(i + 1)) };
  const props = { model: buildModel(report), width: 1200, height: 900, inset: 60, hover: () => {}, open: () => {} } as ViewProps;

  /** Orbits at the Reach-out glow `boost`, its names as `names` says, settled at once (reduced motion). */
  function draw(boost: number, names: string, look?: "web"): string {
    resetSaved({ names, "reach-glow": String(boost) });
    vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) });
    return renderToStaticMarkup(createElement(OrbitMap, { ...props, look }));
  }
  /** The glow round a marker: its gradient's stops, its radius over its marker's, and its class and style. */
  const markerGlow = (markup: string) => {
    const stops = [...markup.matchAll(/<radialGradient id="orbits-glow-\d+">(.*?)<\/radialGradient>/g)].map((m) => [...m[1].matchAll(/stop-opacity="([\d.]+)"/g)].map((s) => Number(s[1])));
    const circle = /<circle cx="[^"]*" cy="[^"]*" r="([\d.e]+)" fill="url\(#orbits-glow-\d+\)" opacity="[^"]*" class="(orbits__glow[^"]*)"(?: style="([^"]*)")?/.exec(markup);
    return { stops, r: circle ? Number(circle[1]) : null, className: circle?.[2], style: circle?.[3] };
  };
  /** The glowing name: its class and style. */
  const glowingName = (markup: string) => /<text class="(orbits__name[^"]*)"[^>]*style="([^"]*drop-shadow[^"]*)"[^>]*>Sample Person 7</.exec(markup)?.slice(1);

  it("draws the marker's glow as usual at 0, and wider and brighter at the strongest, breathing", () => {
    const usual = markerGlow(draw(0, "hide"));
    expect(usual.stops).toEqual([[0.75, 0.22, 0]]);
    expect(usual.className).toBe("orbits__glow");
    expect(usual.style).toBeUndefined();
    const strongest = markerGlow(draw(1, "hide"));
    expect(strongest.stops).toEqual([[1, 0.5, 0]]);
    expect(strongest.r! - usual.r!).toBeCloseTo(18 * 1.2, 6);
    expect(strongest.className).toBe("orbits__glow orbits__glow--pulse");
    expect(strongest.style).toContain("--swell:1.12");
  });

  it("draws the glowing name's halo as usual at 0, and with a wider one at the strongest, breathing between it and a swell more, on Orbits and the Spider web", () => {
    for (const look of [undefined, "web"] as const) {
      const [usualClass, usualStyle] = glowingName(draw(0, "full", look))!;
      expect(usualClass, look).not.toContain("--pulse");
      expect(usualStyle, look).not.toContain("--glow-peak");
      expect(usualStyle.match(/drop-shadow/g), look).toHaveLength(1);
      const [strongClass, strongStyle] = glowingName(draw(1, "full", look))!;
      expect(strongClass, look).toContain("orbits__name--pulse");
      expect(strongStyle, look).toContain("--glow-rest:drop-shadow(0 0 3.00px");
      expect(strongStyle, look).toContain("drop-shadow(0 0 10.00px");
      expect(strongStyle, look).toContain("--glow-peak:drop-shadow(0 0 3.00px");
      expect(strongStyle, look).toContain("drop-shadow(0 0 11.80px");
    }
  });

  it("breathes not at all up to halfway", () => {
    expect(markerGlow(draw(0.5, "hide")).className).toBe("orbits__glow");
    expect(glowingName(draw(0.5, "full"))![0]).not.toContain("--pulse");
  });
});
