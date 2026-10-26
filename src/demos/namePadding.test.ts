// Each map view's Name padding (namePadding.ts): a slider's setting, kept per view: both Orbits' on this device, the Spider web's saved with its other settings (savedStore.ts).

import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_NAME_PADDING, MAP_VIEWS, NAME_PADDING, namePaddingKey, namePaddingOf, namePaddingStores, WEB_NAME_PADDING } from "./namePadding.ts";

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
  for (const store of Object.values(namePaddingStores)) store.reload(memory());
});

describe("the map views' name padding", () => {
  it("is offered for both Orbits and the Spider web, 0 to 10 pixels in whole steps, until set 3 on either Orbits and 5 on the Spider web", () => {
    expect(MAP_VIEWS).toEqual(["orbits", "orbits-3d", "web"]);
    expect(NAME_PADDING).toEqual({ min: 0, max: 10, step: 1 });
    expect([DEFAULT_NAME_PADDING, WEB_NAME_PADDING]).toEqual([3, 5]);
    expect([namePaddingStores.orbits.get(), namePaddingStores["orbits-3d"].get(), namePaddingStores.web.get()]).toEqual([3, 3, 5]);
  });

  it("reads whatever was kept as a whole number within 0 and 5, and anything else as the default", () => {
    expect(namePaddingOf("4")).toBe(4);
    expect(namePaddingOf(1.6)).toBe(2);
    expect(namePaddingOf("9")).toBe(9);
    expect(namePaddingOf("14")).toBe(10);
    expect(namePaddingOf(-1)).toBe(0);
    for (const odd of ["wide", "", undefined, null]) expect(namePaddingOf(odd)).toBe(DEFAULT_NAME_PADDING);
  });

  it("keeps each view's apart, and apart in the demo, Orbits' forgetting the default", () => {
    expect(namePaddingKey("orbits", false)).toBe("friend-map.orbits.name-padding");
    expect(namePaddingKey("web", true)).toBe("friend-map.web.name-padding@demo");
    const kept = memory({ [namePaddingKey("web")]: "1" });
    for (const store of Object.values(namePaddingStores)) store.reload(kept);
    expect(namePaddingStores.web.get()).toBe(1);
    expect(namePaddingStores.orbits.get()).toBe(3);
    const heard: number[] = [];
    const stop = namePaddingStores.orbits.subscribe(() => heard.push(namePaddingStores.orbits.get()));
    namePaddingStores.orbits.set(5);
    expect(kept.kept.get(namePaddingKey("orbits"))).toBe("5");
    expect(namePaddingStores.web.get()).toBe(1);
    namePaddingStores.orbits.set(3);
    expect(kept.kept.has(namePaddingKey("orbits"))).toBe(false);
    expect(heard).toEqual([5, 3]);
    stop();
  });
});
