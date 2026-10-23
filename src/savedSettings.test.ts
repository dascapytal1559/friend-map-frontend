// What is saved of the view settings (savedSettings.ts): only the Spider web's
// settings, with the names choice, the Reach-out glow and the map views' Names, each as the page keeps
// it, and only one of its own values; and how the page is served the set.

import { describe, expect, it } from "vitest";
import { NAME_STYLES } from "./names.ts";
import { cleanSaved, NAME_STYLE_VALUES, SAVED_SETTINGS, SAVED_SETTINGS_ID, savedName, savedSettingsIn, savedSettingsJson } from "./savedSettings.ts";

describe("the saved settings", () => {
  it("are the Spider web's, with the names choice, the Reach-out glow and the map views' Names, named by their keys without friend-map.", () => {
    expect(SAVED_SETTINGS).toEqual([
      "names", "web.colour", "web.curve", "web.spokes", "web.strength", "web.top-names", "web.name-padding", "reach-glow",
      "name-fade.top", "name-fade.bottom", "name-fade.faintest", "name-fade.reach-out", "name-fade.linked",
    ]);
    expect([savedName("friend-map.web.spokes"), savedName("friend-map.names"), savedName("friend-map.reach-glow"), savedName("friend-map.web.spokes@demo"), savedName("friend-map.orbits.top-names"), savedName("web.spokes")]).toEqual([
      "web.spokes", "names", "reach-glow", null, null, null,
    ]);
  });

  it("know the names choice's values as the page does", () => {
    expect(NAME_STYLE_VALUES).toEqual(NAME_STYLES.map((s) => s.style));
  });

  it("keep only those saved, each one of its own values: a choice, a colour, or a number; Name placement, no longer kept, is left out", () => {
    const input = {
      names: "initial", "name-placement": "name-only", "web.colour": "#65a5e2", "web.curve": "0.1", "web.spokes": "14", "web.strength": "-1", "web.top-names": "all", "web.name-padding": 5,
      "reach-glow": "0.6", "orbits.top-names": "25", "query": "tag:x",
    };
    expect(cleanSaved(input)).toEqual({ names: "initial", "web.colour": "#65a5e2", "web.curve": "0.1", "web.spokes": "14", "web.top-names": "all", "reach-glow": "0.6" });
    expect(cleanSaved({ "reach-glow": "lots" })).toEqual({});
    expect(cleanSaved({ "web.colour": "Ada Sample", names: "Bruno" })).toEqual({});
    expect(cleanSaved({ "name-fade.top": "25", "name-fade.faintest": "0", "name-fade.reach-out": "fade", "name-fade.linked": "-0.4", "name-fade.bottom": "far" })).toEqual({
      "name-fade.top": "25", "name-fade.faintest": "0", "name-fade.reach-out": "fade",
    });
    expect(cleanSaved({ "name-fade.reach-out": "true" })).toEqual({});
    for (const junk of [null, "names", ["names"], 7]) expect(cleanSaved(junk)).toEqual({});
  });

  it("go into the page as JSON no tag can close, and are read back from it, or as none", () => {
    const json = savedSettingsJson({ names: "first", "web.spokes": "20" });
    expect(json).toBe('{"names":"first","web.spokes":"20"}');
    expect(savedSettingsJson({ names: "</script>" } as never)).toBe("{}");
    const page = (text: string | null) => ({ getElementById: (id: string) => (id === SAVED_SETTINGS_ID && text !== null ? { textContent: text } : null) });
    expect(savedSettingsIn(page(json))).toEqual({ names: "first", "web.spokes": "20" });
    expect(savedSettingsIn(page("{"))).toEqual({});
    expect(savedSettingsIn(page(null))).toEqual({});
    expect(savedSettingsIn(undefined)).toEqual({});
  });
});
