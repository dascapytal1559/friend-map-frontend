// What a first visit finds, in each app, before anything is chosen (the
// user's asks: for the demo "top 50 show name. mobile dont show name.
// symmetrical web. web str 35%. names First L. name on icon. theme amber.",
// and for the real app "similar, except top100 show name. full name.", then
// for the demo Strand curve 10% and 14 Spokes; since then the user's own Spider web,
// "I would like that to just be the default settings": First L., Name only,
// 14 spokes curved 10%, a blue and 5 px between names, in both apps; and as
// the demo went public, Orbits' closest 100 named, 10 px apart, and names
// fading to their faintest, 40%, past the closest 50, src/demo/defaults.ts). Every
// one is a default only: in the real app a choice saved on the server
// (savedStore.ts) stands, the demo's own choices are kept apart in its
// visitor's browser, and the demo starts at your saved choices
// (savedStore.test.ts). On a phone nobody is named whatever is chosen
// (phoneNames.test.ts).

import { describe, expect, it } from "vitest";
import { keptAs } from "./demoMode.ts";
import { makeNamePaddingStores } from "./demos/namePadding.ts";
import { MAIN_VIEWS, makeTopNamesStores, topNamesKey } from "./demos/topNames.ts";
import { makeWebColourChosen } from "./demos/webColour.ts";
import { makeWebStrengthStore } from "./demos/webStrength.ts";
import { CURVE_KEY, makeWebCurveStore, makeWebSpokesStore, SPOKES_KEY } from "./demos/webStyle.ts";
import { makeNameStyleStore, NAME_STYLE_KEY } from "./names.ts";

const kept = (initial: Record<string, string> = {}) => ({ getItem: (key: string) => initial[key] ?? null, setItem: () => {}, removeItem: () => {} });

describe("a first visit", () => {
  for (const [app, demo, named] of [["the demo", true, 100], ["the real app", false, 100]] as const) {
    it(`to ${app} names the closest ${named} on every main view, as First L.`, () => {
      const top = makeTopNamesStores(demo);
      for (const slug of MAIN_VIEWS) {
        top[slug].reload(kept());
        expect(top[slug].get(), slug).toBe(named);
      }
      const style = makeNameStyleStore(demo);
      style.reload(kept());
      expect(style.get()).toBe("initial");
    });

    it(`to ${app} finds the Spider web in the default blue, curved 10% on 14 spokes at 35% strength, its names 5 px apart`, () => {
      const stores = [makeWebColourChosen(demo), makeWebCurveStore(demo), makeWebSpokesStore(demo), makeWebStrengthStore(demo), makeNamePaddingStores(demo).web];
      for (const store of stores) store.reload(kept());
      expect(stores.map((store) => store.get())).toEqual(["#65a5e2", 0.1, 14, 0.35, 5]);
      expect(makeNamePaddingStores(demo).orbits.get()).toBe(3);
    });

    it(`to ${app} fits Orbits' (the solar system's) names ${demo ? 10 : 3} px apart`, () => {
      const solar = makeNamePaddingStores(demo)["orbits-3d"];
      solar.reload(kept());
      expect(solar.get()).toBe(demo ? 10 : 3);
    });
  }

  it("leaves a choice already made as it was, the demo's apart from the real app's", () => {
    // The demo's Spider web was set to 200, and the real app's Orbits to 25, which the demo's Orbits does not read.
    const browser = kept({ [topNamesKey("web", true)]: "200", [topNamesKey("orbits", false)]: "25" });
    const top = makeTopNamesStores(true);
    for (const store of Object.values(top)) store.reload(browser);
    expect([top.web.get(), top.orbits.get()]).toEqual([200, 100]);
    // The demo's Spokes set to 40, and the real app's Strand curve to 50%, which the demo's does not read.
    const web = kept({ [keptAs(SPOKES_KEY, true)]: "40", [CURVE_KEY]: "0.5" });
    const [curve, spokes] = [makeWebCurveStore(true), makeWebSpokesStore(true)];
    for (const store of [curve, spokes]) store.reload(web);
    expect([curve.get(), spokes.get()]).toEqual([0.1, 40]);
    const style = makeNameStyleStore(false);
    style.reload(kept({ [NAME_STYLE_KEY]: "first" }));
    expect(style.get()).toBe("first");
  });
});
