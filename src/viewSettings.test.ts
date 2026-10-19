// Each view's settings (viewSettings.ts), in a section of the menu set
// apart from the list of views (ViewSettings.tsx), shown only on a view that
// has any: Name format first on a page that shows names (NamesMenu.tsx), then
// the Spider web's Colour, Strand curve, Spokes and Web strength, Orbits'
// Theme, the Calendar's Messages, each main view's Show top names
// (topNames.ts), and Orbits' and the Spider web's Name padding; on the Spider
// web its name settings together in a group of their own, then its look in
// another.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "./demos/addressChoice.test.ts";
import { includeGroupsStore } from "./demos/calendar.ts";
import { ORANGE, orbitsCustomStore, orbitsThemeStore } from "./demos/orbitsTheme.ts";
import { resetSaved } from "./savedStore.ts";
import { webColourStore, webCustomStore } from "./demos/webColour.ts";
import { webStrengthStore } from "./demos/webStrength.ts";
import { CURVE_KEY, SPOKES_KEY, webCurveStore, webSpokesStore } from "./demos/webStyle.ts";
import { namePaddingKey, namePaddingStores } from "./demos/namePadding.ts";
import { ALL, MAIN_VIEWS as TOP_NAMED_VIEWS, topNamesOf, topNamesStores } from "./demos/topNames.ts";
import { groupsOf, settingsOf, VIEW_SETTINGS, type ColourSetting } from "./viewSettings.ts";
import { SETTINGS_OPEN_KEY, settingsOpenStore } from "./ViewSettings.tsx";
import { ViewList } from "./ViewSwitcher.tsx";
import { MAIN_VIEWS, VIEWS } from "./views.ts";

const memory = () => {
  const items = new Map<string, string>();
  return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
};

// Open, so its settings are drawn; the fold itself is tested on its own.
beforeEach(() => {
  settingsOpenStore.reload(memory());
  settingsOpenStore.set(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSaved();
  for (const store of [webStrengthStore, webCurveStore, webSpokesStore, webCustomStore, orbitsThemeStore, orbitsCustomStore, includeGroupsStore, ...Object.values(topNamesStores), ...Object.values(namePaddingStores)]) store.reload(memory());
});

const menu = (current: string, demo = false, names = true) => renderToStaticMarkup(createElement(ViewList, { current, onPick: () => {}, demo, names }));
/** The settings section of a menu, or null for none. */
const section = (html: string) => /<section class="view-switcher__settings"[^>]*>.*?<\/section>/.exec(html)?.[0] ?? null;
/** A toggle's buttons, as [title, pressed]. */
/** One setting of a section, from its label to the next setting. */
const setting = (html: string, label: string) => {
  const at = html.indexOf(`>${label}</span>`);
  const end = html.indexOf('<div class="view-switcher__setting">', at);
  return html.slice(at, end < 0 ? undefined : end);
};
const pressed = (html: string) => [...html.matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>(?:<span[^>]*><\/span>)?([^<]+)<\/button>/g)].map((m) => [m[2], m[1]]);

describe("the views' settings", () => {
  it("are the Spider web's colour, strand curve, spokes and strength, Orbits' theme, the Calendar's messages, each main view's Show top names and Orbits' and the web's Name padding, and nothing for any other view", () => {
    expect(settingsOf("web").map((s) => [s.kind, s.label])).toEqual([["toggle", "Show top names"], ["slider", "Name padding"], ["colour", "Colour"], ["slider", "Strand curve"], ["slider", "Spokes"], ["slider", "Web strength"]]);
    expect(settingsOf("orbits").map((s) => [s.kind, s.label])).toEqual([["colour", "Theme"], ["toggle", "Show top names"], ["slider", "Name padding"]]);
    expect(settingsOf("orbits-3d").map((s) => [s.kind, s.label])).toEqual([["toggle", "Show top names"]]);
    expect(settingsOf("city").map((s) => [s.kind, s.label])).toEqual([["toggle", "Show top names"]]);
    expect(settingsOf("calendar").map((s) => [s.kind, s.label])).toEqual([["toggle", "Messages"]]);
    for (const view of VIEWS.filter((v) => !["web", "orbits", "orbits-3d", "city", "calendar"].includes(v.slug))) expect(settingsOf(view.slug)).toEqual([]);
    for (const slug of Object.keys(VIEW_SETTINGS)) expect(VIEWS.some((v) => v.slug === slug)).toBe(true);
  });

  it("offer no Beam: the Spider web's beams come from the mouth alone", () => {
    const html = menu("web");
    for (const gone of ["Beam", "Mouth", "Eyes"]) expect(html).not.toContain(gone);
  });
});

describe("the settings section in the menu", () => {
  it("is on a view with settings, after the views and before the pages about the app, under its name, Name format first in it", () => {
    const html = menu("web");
    const at = html.indexOf('<section class="view-switcher__settings" aria-label="Spider web settings">');
    expect(at).toBeGreaterThan(html.indexOf(">Reciprocity</a>"));
    expect(html.indexOf("</section>")).toBeLessThan(html.indexOf("About the app"));
    expect(html.match(/<section/g)).toHaveLength(1);
    expect(section(html)!.indexOf(">Name format</span>")).toBeGreaterThan(-1);
    expect(section(html)!.indexOf(">Name format</span>")).toBeLessThan(section(html)!.indexOf(">Colour</span>"));
    expect(section(html)).toMatch(/<button type="button" class="view-switcher__group view-switcher__fold" aria-expanded="true" aria-controls="[^"]+"><span class="view-switcher__caret" aria-hidden="true"><\/span>Spider web settings<\/button>/);
  });

  it("folds under its heading, closed to start, one choice for every view kept on the device", () => {
    const kept = memory();
    settingsOpenStore.reload(kept);
    for (const slug of ["web", "orbits", "calendar"]) {
      const html = section(menu(slug))!;
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain("view-switcher__setting-list");
    }
    settingsOpenStore.set(true);
    expect(kept.items.get(SETTINGS_OPEN_KEY)).toBe("true");
    const open = section(menu("calendar"))!;
    expect(open).toContain('aria-expanded="true"');
    const controls = /aria-controls="([^"]+)"/.exec(open)![1];
    expect(open).toContain(`<div class="view-switcher__setting-list" id="${controls}">`);
    expect(open).toContain(">Messages</span>");
    settingsOpenStore.set(false);
    expect(kept.items.has(SETTINGS_OPEN_KEY)).toBe(false);
  });

  it("group the Spider web's name settings together, Name format first, apart from its look; every other view's are one group", () => {
    expect(groupsOf("web").map((group) => group.map((s) => s.label))).toEqual([["Show top names", "Name padding"], ["Colour", "Strand curve", "Spokes", "Web strength"]]);
    for (const slug of Object.keys(VIEW_SETTINGS).filter((slug) => slug !== "web")) expect(groupsOf(slug), slug).toHaveLength(1);
    /** Each group the menu draws, as its settings' labels. */
    const drawn = (slug: string) =>
      section(menu(slug))!.split('<div class="view-switcher__setting-group">').slice(1).map((group) => [...group.matchAll(/class="view-switcher__label"[^>]*>([^<]+)</g)].map((m) => m[1]));
    expect(drawn("web")).toEqual([["Name format", "Show top names", "Name padding"], ["Colour", "Strand curve", "Spokes", "Web strength"]]);
    expect(drawn("orbits")).toEqual([["Name format", "Theme", "Show top names", "Name padding"]]);
    expect(drawn("circles")).toEqual([["Name format"]]);
    expect(drawn("table")).toEqual([["Name format"]]);
  });

  it("is not on a page with no settings of its own that shows no names", () => {
    for (const slug of ["table", "time-river", "river", "reciprocity"]) expect(section(menu(slug, false, false))).toBeNull();
  });

  it("is on every page that shows names, if only for Name format: the Table, the Time river's and Circles' hold Name format alone", () => {
    for (const slug of ["table", "time-river", "circles"]) {
      const html = section(menu(slug))!;
      expect(html).toContain(">Name format</span>");
      expect(html.match(/class="view-switcher__label"/g)).toHaveLength(1);
    }
  });

  it("is in the demo's menu as well", () => {
    expect(section(menu("web", true))).toContain("Spider web settings");
    expect(section(menu("calendar", true))).toContain("Calendar settings");
  });

  it("gives the Spider web's colour as toggle buttons, each with its swatch, then Custom with a colour picker, on the default blue until another is chosen", () => {
    browser("/spider", "");
    const blue = setting(section(menu("web"))!, "Colour");
    expect(pressed(blue)).toEqual([["Amber", "false"]]);
    expect(blue).toContain('<span class="view-switcher__swatch" style="background:#ffb347" aria-hidden="true"></span>Amber');
    expect(blue).toContain('aria-label="Custom colour, chosen" value="#65a5e2"');
    resetSaved({ "web.colour": "amber" });
    const html = setting(section(menu("web"))!, "Colour");
    expect(pressed(html)).toEqual([["Amber", "true"]]);
    expect(html).toMatch(/<label class="view-switcher__custom" title="[^"]+"><input type="color" aria-label="Custom colour" value="#3dff9a"\/>Custom<\/label>/);
  });

  it("presses the colour chosen at ?colour=purple, a preset no longer offered, and Custom, on the colour, at a custom colour's address", () => {
    resetSaved({ "web.colour": "amber" });
    browser("/spider", "?colour=purple");
    expect(pressed(setting(section(menu("web"))!, "Colour"))).toEqual([["Amber", "true"]]);
    browser("/spider", "?colour=12ab34");
    const html = setting(section(menu("web"))!, "Colour");
    expect(pressed(html)).toEqual([["Amber", "false"]]);
    expect(html).toContain('<label class="view-switcher__custom" data-on="true"');
    expect(html).toContain('aria-label="Custom colour, chosen" value="#12ab34"');
  });

  it("gives the web's strength as a slider in percent, with its value beside it, 35% until moved", () => {
    webStrengthStore.reload(memory());
    expect(setting(section(menu("web"))!, "Web strength")).toContain("<output>35%</output>");
    webStrengthStore.set(0.25);
    const html = setting(section(menu("web"))!, "Web strength");
    const slider = /<input type="range"[^>]*>/.exec(html)![0];
    for (const attribute of ['min="0"', 'max="1"', 'step="0.05"', 'value="0.25"', 'aria-label="Web strength"', 'aria-valuetext="25%"']) expect(slider).toContain(attribute);
    expect(html).toContain("<output>25%</output>");
  });

  it("gives Orbits and the Spider web each a Name padding slider in pixels, 0 to 10: 3 px on Orbits and 5 px on the Spider web until moved, each kept apart", () => {
    const kept = memory();
    for (const store of Object.values(namePaddingStores)) store.reload(kept);
    const slider = (view: string) => /<input type="range"[^>]*aria-label="Name padding"[^>]*>/.exec(setting(section(menu(view))!, "Name padding"))![0];
    for (const [view, px] of [["orbits", 3], ["web", 5]] as const) {
      for (const attribute of ['min="0"', 'max="10"', 'step="1"', `value="${px}"`, `aria-valuetext="${px} px"`]) expect(slider(view)).toContain(attribute);
      expect(setting(section(menu(view))!, "Name padding")).toContain(`<output>${px} px</output>`);
    }
    namePaddingStores.web.set(1);
    expect(setting(section(menu("web"))!, "Name padding")).toContain("<output>1 px</output>");
    expect(setting(section(menu("orbits"))!, "Name padding")).toContain("<output>3 px</output>");
    expect(kept.items.get(namePaddingKey("web"))).toBe("1");
    expect(kept.items.has(namePaddingKey("orbits"))).toBe(false);
    // Nor on the views that do not fit names round the sun.
    for (const view of ["orbits-3d", "city"]) expect(section(menu(view))).not.toContain("Name padding");
  });

  it("gives the web's Strand curve and Spokes as sliders, with no Web style beside them: 10% and 14 spokes until moved, each kept", () => {
    const kept = memory();
    for (const store of [webCurveStore, webSpokesStore]) store.reload(kept);
    expect(section(menu("web"))).not.toContain("Web style");
    const slider = (label: string) => new RegExp(`<input type="range"[^>]*aria-label="${label}"[^>]*>`).exec(setting(section(menu("web"))!, label))![0];
    for (const attribute of ['min="0"', 'max="1"', 'step="0.05"', 'value="0.1"', 'aria-valuetext="10%"']) expect(slider("Strand curve")).toContain(attribute);
    for (const attribute of ['min="8"', 'max="48"', 'step="2"', 'value="14"', 'aria-valuetext="14"']) expect(slider("Spokes")).toContain(attribute);
    expect(setting(section(menu("web"))!, "Spokes")).toContain("<output>14</output>");
    webCurveStore.set(0.4);
    webSpokesStore.set(19);
    expect(setting(section(menu("web"))!, "Strand curve")).toContain("<output>40%</output>");
    expect(setting(section(menu("web"))!, "Spokes")).toContain("<output>20</output>");
    expect(Object.fromEntries(kept.items)).toEqual({ [CURVE_KEY]: "0.4", [SPOKES_KEY]: "20" });
  });

  it("gives Orbits' theme, Orange pressed until another is chosen, then Custom", () => {
    expect(pressed(setting(section(menu("orbits"))!, "Theme"))).toEqual([["Orange", "true"]]);
    orbitsThemeStore.set("#6fd0c6");
    const html = setting(section(menu("orbits"))!, "Theme");
    expect(pressed(html)).toEqual([["Orange", "false"]]);
    expect(html).toContain('data-on="true"');
  });

  it("gives the Calendar's messages as a toggle, one-to-one until group chats are chosen", () => {
    expect(pressed(setting(section(menu("calendar"))!, "Messages"))).toEqual([["One-to-one", "true"], ["With groups", "false"]]);
    includeGroupsStore.set(true);
    expect(pressed(setting(section(menu("calendar"))!, "Messages"))).toEqual([["One-to-one", "false"], ["With groups", "true"]]);
  });

  it("leaves the Time river's filters to the bar on its page: it has none in the menu", () => {
    expect(settingsOf("time-river")).toEqual([]);
  });
});

describe("each main view's Show top names", () => {
  const choices = (pressedOne: string) => ["25", "50", "100", "200", "All"].map((n) => [n, String(n === pressedOne)]);

  it("is a setting of the main views alone, the same ones the switcher groups", () => {
    expect([...TOP_NAMED_VIEWS]).toEqual(MAIN_VIEWS);
    for (const view of VIEWS) expect(settingsOf(view.slug).some((s) => s.label === "Show top names")).toBe(MAIN_VIEWS.includes(view.slug));
  });

  it("offers the closest 25, 50, 100 or 200, or All: 100 on every main view until another is chosen", () => {
    for (const slug of MAIN_VIEWS) expect(pressed(setting(section(menu(slug))!, "Show top names"))).toEqual(choices("100"));
    expect(section(menu("orbits"))).toMatch(/<button type="button" aria-pressed="false" title="Name the closest 25; everyone else is named on hovering, or zooming in">25<\/button>/);
    expect(section(menu("city", true))).toContain("Show top names");
  });

  it("is each view's own: choosing one on Orbits leaves the others as they were", () => {
    topNamesStores.orbits.set(25);
    topNamesStores.city.set(200);
    expect(pressed(setting(section(menu("orbits"))!, "Show top names"))).toEqual(choices("25"));
    expect(pressed(setting(section(menu("web"))!, "Show top names"))).toEqual(choices("100"));
    expect(pressed(setting(section(menu("orbits-3d"))!, "Show top names"))).toEqual(choices("100"));
    expect(pressed(setting(section(menu("city"))!, "Show top names"))).toEqual(choices("200"));
  });

  it("is kept under the view's own key, All as all; the Spider web's, saved, with the default written too", () => {
    const kept = memory();
    topNamesStores.web.reload(kept);
    topNamesStores.web.set(ALL);
    expect([...kept.items]).toEqual([["friend-map.web.top-names", "all"]]);
    topNamesStores.web.reload(kept);
    expect(topNamesStores.web.get()).toBe(ALL);
    topNamesStores.web.set(50);
    expect([...kept.items]).toEqual([["friend-map.web.top-names", "50"]]);
    topNamesStores.web.set(100);
    expect([...kept.items]).toEqual([["friend-map.web.top-names", "100"]]);
    topNamesStores.orbits.reload(kept);
    topNamesStores.orbits.set(25);
    topNamesStores.orbits.set(100);
    expect([...kept.items]).toEqual([["friend-map.web.top-names", "100"]]);
  });

  it("reads only the choices offered, anything else as the view's default", () => {
    expect(topNamesOf("all", 100)).toBe(ALL);
    expect(topNamesOf("200", 100)).toBe(200);
    for (const junk of [null, "", "0", "75", "-25", "Infinity", "lots"]) expect(topNamesOf(junk, 100)).toBe(100);
    expect(topNamesOf("75", ALL)).toBe(ALL);
  });
});

describe("a theme colour's custom choice", () => {
  it("saves the Spider web's custom colour, leaving the address plain, keeps it on the device as the last custom one, and a preset leaves it kept", () => {
    const page = browser("/spider", "?colour=amber");
    const colour = settingsOf("web").find((s) => s.kind === "colour") as ColourSetting<string>;
    colour.custom.set("#12ab34");
    colour.store.set("#12ab34");
    expect(page.location.search).toBe("");
    expect(webColourStore.get()).toBe("#12ab34");
    colour.store.set("amber");
    expect(webColourStore.get()).toBe("amber");
    expect(webCustomStore.get()).toBe("#12ab34");
  });

  it("keeps Orbits' theme on the device, forgetting the orange", () => {
    const kept = memory();
    orbitsThemeStore.reload(kept);
    orbitsThemeStore.set("#12AB34" as `#${string}`);
    expect(orbitsThemeStore.get()).toBe("#12ab34");
    expect([...kept.items.values()]).toEqual(["#12ab34"]);
    orbitsThemeStore.set(ORANGE);
    expect(kept.items.size).toBe(0);
  });
});
