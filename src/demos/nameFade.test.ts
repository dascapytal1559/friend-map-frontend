// How names fade (nameFade.ts): the Names settings, as the map was drawn
// until moved, the fade's steps between the guide rings, how faint the
// faintest is, people to reach out to fading as everyone does, and who is no longer
// named once their names fade out entirely.

import { afterEach, describe, expect, it } from "vitest";
import { savedAllowed, savedName } from "../savedSettings.ts";
import { DEFAULT_NAME_FADE, FADE_STOPS, NAME_FADE_KEYS, nameFadeStores, nameHidden, nameOpacity, nameStrengthOf, type NameFade } from "./nameFade.ts";
import { BACKGROUND, fadeTiers, personOpacity, RING_STOPS, TIER_FLOOR, TIERS } from "./orbitsLayout.ts";
import { nameable, nameOrderOf } from "./orbitsSky.ts";

function memory(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

const stores = Object.values(nameFadeStores);
afterEach(() => stores.forEach((store) => store.reload(memory())));

const fade = (change: Partial<NameFade> = {}): NameFade => ({ ...DEFAULT_NAME_FADE, ...change });
const places = [1, 10, 11, 25, 26, 50, 51, 100, 101, 250, 501, null];

describe("the name fade's steps", () => {
  it("are TIERS until moved: the closest 10 to the closest 100, down to TIER_FLOOR, so names are drawn as their people are", () => {
    expect(fadeTiers(10, 100, TIER_FLOOR)).toEqual(TIERS);
    expect(DEFAULT_NAME_FADE).toEqual({ top: 10, bottom: 100, faintest: TIER_FLOOR });
    for (const place of places) expect(nameOpacity(place, DEFAULT_NAME_FADE)).toBe(personOpacity(place, false));
  });

  it("step at every guide ring between the top and the bottom, each the same step fainter, to the faintest past the bottom", () => {
    expect(fadeTiers(25, 250, 0)).toEqual([{ closest: 25, opacity: 1 }, { closest: 50, opacity: 0.75 }, { closest: 100, opacity: 0.5 }, { closest: 250, opacity: 0.25 }]);
    expect(fadeTiers(10, 50, 0.4)).toEqual([{ closest: 10, opacity: 1 }, { closest: 25, opacity: 0.8 }, { closest: 50, opacity: 0.6 }]);
    expect([24, 25, 26, 249, 250, 251, null].map((place) => nameOpacity(place, fade({ top: 25, bottom: 250, faintest: 0 })))).toEqual([1, 1, 0.75, 0.25, 0.25, 0, 0]);
    expect(FADE_STOPS.every((n) => RING_STOPS.includes(n))).toBe(true);
  });

  it("are a hard edge with the bottom no further out than the top: the closest at full strength, everyone else at the faintest", () => {
    expect(fadeTiers(50, 50, 0.3)).toEqual([{ closest: 50, opacity: 1 }]);
    expect(fadeTiers(100, 25, 0.3)).toEqual([{ closest: 100, opacity: 1 }]);
    expect([1, 100, 101].map((place) => nameOpacity(place, fade({ top: 100, bottom: 25, faintest: 0.3 })))).toEqual([1, 1, 0.3]);
  });

  it("go no fainter than full strength with the faintest at 100%: no fade at all", () => {
    for (const place of places) expect(nameOpacity(place, fade({ faintest: 1 }))).toBe(1);
  });
});

describe("people to reach out to", () => {
  it("fade by their place, as everyone does, however strong the Reach-out glow", () => {
    const reachOut = new Set([4]);
    expect(nameOpacity(400, DEFAULT_NAME_FADE)).toBe(0.2);
    expect(nameOpacity(5, DEFAULT_NAME_FADE)).toBe(1);
    expect(nameStrengthOf(4, 400, null, new Set(), DEFAULT_NAME_FADE)).toBe(0.2);
    expect(nameable(new Map([[4, 400]]), reachOut, fade({ faintest: 0 })).keep(4)).toBe(false);
  });
});

describe("a name's strength while someone is picked out", () => {
  const linked = new Set([2]);
  it("is full for them, 70% for those linked to them, and BACKGROUND for everyone else, as their people are until moved", () => {
    expect(nameStrengthOf(1, 300, 1, linked, DEFAULT_NAME_FADE)).toBe(1);
    expect(nameStrengthOf(2, 300, 1, linked, DEFAULT_NAME_FADE)).toBe(0.7);
    for (const place of places) expect(nameStrengthOf(3, place, 1, linked, DEFAULT_NAME_FADE)).toBe(BACKGROUND);
    expect(nameStrengthOf(3, 60, null, linked, DEFAULT_NAME_FADE)).toBe(0.4);
  });

  it("is never more than its own fade for everyone else, so a name faded out stays out under the pointer", () => {
    const out = fade({ faintest: 0 });
    expect(nameStrengthOf(3, 300, 1, linked, out)).toBe(0);
    expect(nameStrengthOf(3, 5, 1, linked, out)).toBe(BACKGROUND);
  });
});

describe("names faded out entirely", () => {
  const out = fade({ faintest: 0 });
  const closest = new Map([[1, 1], [2, 50], [3, 150], [4, 400]]);
  const people = [1, 2, 3, 4, 5, 6].map((id) => ({ id, rank: [id <= 4 ? closest.get(id)! : 0], total: 10 - id }) as never);

  it("are only those past the bottom, and the belt, with the faintest at none", () => {
    expect([1, 100, 101, null].map((place) => nameHidden(place, out))).toEqual([false, false, true, true]);
    expect(nameHidden(400, DEFAULT_NAME_FADE)).toBe(false);
    expect(nameHidden(400, out)).toBe(true);
  });

  it("are left out of whoever may be named, so those people keep their icons; people to reach out to among them", () => {
    const reachOut = new Set([4, 6]);
    const all = nameable(closest, reachOut, DEFAULT_NAME_FADE);
    expect(nameOrderOf(people, 0, closest, all.keep).order).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...all.always]).toEqual([4, 6]);
    const fewer = nameable(closest, reachOut, out);
    expect(nameOrderOf(people, 0, closest, fewer.keep)).toEqual({ order: [1, 2], ranked: 2 });
    expect([...fewer.always]).toEqual([]);
  });
});

describe("the Names settings", () => {
  it("are as the map was drawn until moved, and whatever was kept, within their choices", () => {
    expect(stores.map((store) => store.get())).toEqual([10, 100, 0.2]);
    const kept = memory({
      [NAME_FADE_KEYS.top]: "25", [NAME_FADE_KEYS.bottom]: "250", [NAME_FADE_KEYS.faintest]: "0",
    });
    stores.forEach((store) => store.reload(kept));
    expect(stores.map((store) => store.get())).toEqual([25, 250, 0]);
    const junk = memory({ [NAME_FADE_KEYS.top]: "30", [NAME_FADE_KEYS.bottom]: "far", [NAME_FADE_KEYS.faintest]: "1.5" });
    stores.forEach((store) => store.reload(junk));
    expect(stores.map((store) => store.get())).toEqual([10, 100, 1]);
  });

  it("are kept as the saved settings they are, each as one of its own values", () => {
    const kept = memory();
    stores.forEach((store) => store.reload(kept));
    nameFadeStores.top.set(50);
    nameFadeStores.faintest.set(0.35);
    expect(Object.fromEntries(kept.kept)).toEqual({ [NAME_FADE_KEYS.top]: "50", [NAME_FADE_KEYS.faintest]: "0.35" });
    for (const [key, value] of kept.kept) {
      const name = savedName(key);
      expect(name, key).not.toBeNull();
      expect(savedAllowed(name!, value), key).toBe(true);
    }
    for (const key of Object.values(NAME_FADE_KEYS)) expect(savedName(key), key).not.toBeNull();
  });
});
