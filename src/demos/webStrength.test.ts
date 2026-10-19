// The web's strength (webStrength.ts): a slider's setting, saved with the web's other settings (savedStore.ts).

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_STRENGTH, STRENGTH_KEY, strengthOf, webStrengthStore } from "./webStrength.ts";

function memory(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

afterEach(() => webStrengthStore.reload(memory()));

describe("the web's strength", () => {
  it("is 35% until set, and whatever was kept, within 0 and 1", () => {
    expect(DEFAULT_STRENGTH).toBe(0.35);
    webStrengthStore.reload(memory());
    expect(webStrengthStore.get()).toBe(0.35);
    webStrengthStore.reload(memory({ [STRENGTH_KEY]: "0.25" }));
    expect(webStrengthStore.get()).toBe(0.25);
    webStrengthStore.reload(memory({ [STRENGTH_KEY]: "strong" }));
    expect(webStrengthStore.get()).toBe(0.35);
    expect(strengthOf("1.7")).toBe(1);
    expect(strengthOf(-2)).toBe(0);
    expect(strengthOf(undefined)).toBe(DEFAULT_STRENGTH);
  });

  it("keeps every setting where it is kept, the default too, and tells whoever listens", () => {
    const kept = memory();
    webStrengthStore.reload(kept);
    const heard: number[] = [];
    const stop = webStrengthStore.subscribe(() => heard.push(webStrengthStore.get()));
    webStrengthStore.set(0.8);
    webStrengthStore.set(0.8);
    expect(kept.kept.get(STRENGTH_KEY)).toBe("0.8");
    webStrengthStore.set(0.35);
    expect(kept.kept.get(STRENGTH_KEY)).toBe("0.35");
    expect(heard).toEqual([0.8, 0.35]);
    stop();
  });
});
