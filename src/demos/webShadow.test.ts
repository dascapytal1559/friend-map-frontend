// The spider's shadow (webShadow.ts): a toggle's setting, saved with the web's other settings (savedStore.ts).

import { afterEach, describe, expect, it } from "vitest";
import { SHADOW_KEY, webShadowStore } from "./webShadow.ts";

function memory(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

afterEach(() => webShadowStore.reload(memory()));

describe("the spider's shadow", () => {
  it("is on until set, and whatever was kept, anything else on", () => {
    webShadowStore.reload(memory());
    expect(webShadowStore.get()).toBe(true);
    webShadowStore.reload(memory({ [SHADOW_KEY]: "off" }));
    expect(webShadowStore.get()).toBe(false);
    webShadowStore.reload(memory({ [SHADOW_KEY]: "maybe" }));
    expect(webShadowStore.get()).toBe(true);
  });

  it("is kept as on or off", () => {
    const kept = memory();
    webShadowStore.reload(kept);
    webShadowStore.set(false);
    expect(kept.kept.get(SHADOW_KEY)).toBe("off");
  });
});
