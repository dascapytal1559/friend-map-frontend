// The page's look (theme.ts): Auto, Light or Dark, kept in this browser;
// the device followed under Auto; the address's ?theme= and the embedding
// page's message winning while the page is open; a night scene staying dark;
// and the Look choice in the menu.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askedTheme, choiceOf, currentTheme, DEFAULT_THEME_CHOICE, forcedThemeStore, listenToEmbedder, lookOf, lookSetting, resolveTheme, THEME_CHOICES, THEME_COLOR, THEME_KEY,
  THEME_MESSAGE, themeChoiceStore, themeMessage, themeOf, showLook,
} from "./theme.ts";
import { VIEWS } from "./views.ts";

/** A browser's storage, in memory. */
const memory = () => {
  const items = new Map<string, string>();
  return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
};

afterEach(() => {
  themeChoiceStore.reload(memory());
  forcedThemeStore.set(null);
});

describe("the choice", () => {
  it("is Auto, Light or Dark, Auto until one is made, and anything else kept is Auto", () => {
    expect(THEME_CHOICES.map((choice) => choice.value)).toEqual(["auto", "light", "dark"]);
    expect(DEFAULT_THEME_CHOICE).toBe("auto");
    expect(choiceOf(null)).toBe("auto");
    for (const kept of ["auto", "light", "dark"]) expect(choiceOf(kept)).toBe(kept);
    for (const kept of ["", "paper", "LIGHT", "night"]) expect(choiceOf(kept)).toBe("auto");
  });

  it("follows the device under Auto, and the choice otherwise", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("is kept in this browser under its key, the default never written", () => {
    const kept = memory();
    themeChoiceStore.reload(kept);
    expect(themeChoiceStore.get()).toBe("auto");
    themeChoiceStore.set("light");
    expect(kept.items.get(THEME_KEY)).toBe("light");
    themeChoiceStore.set("auto");
    expect(kept.items.has(THEME_KEY)).toBe(false);
  });

  it("is the Look toggle in the menu, over the kept choice", () => {
    expect(lookSetting.kind).toBe("toggle");
    expect(lookSetting.label).toBe("Look");
    expect(lookSetting.choices.map((choice) => choice.title)).toEqual(["Auto", "Light", "Dark"]);
    expect(lookSetting.store).toBe(themeChoiceStore);
  });
});

describe("what wins", () => {
  it("is the address's ?theme= while the page is open, light or dark and nothing else", () => {
    expect(askedTheme("?theme=light")).toBe("light");
    expect(askedTheme("?view=orbits&theme=dark")).toBe("dark");
    for (const search of ["", "?theme=", "?theme=auto", "?theme=paper", "?colour=light"]) expect(askedTheme(search)).toBeNull();
    expect(themeOf("light")).toBe("light");
    expect(themeOf("Light")).toBeNull();
  });

  it("is the embedding page's message, when it is one of ours", () => {
    expect(themeMessage({ type: THEME_MESSAGE, theme: "light" })).toBe("light");
    expect(themeMessage({ type: THEME_MESSAGE, theme: "dark" })).toBe("dark");
    for (const data of [null, "light", { type: THEME_MESSAGE }, { type: THEME_MESSAGE, theme: "auto" }, { type: "theme", theme: "light" }, { theme: "light" }]) {
      expect(themeMessage(data)).toBeNull();
    }
  });

  it("is what is forced over the choice, and the choice over the device", () => {
    expect(currentTheme(null, "auto", true)).toBe("dark");
    expect(currentTheme(null, "light", true)).toBe("light");
    expect(currentTheme("dark", "light", false)).toBe("dark");
    expect(currentTheme("light", "dark", true)).toBe("light");
  });

  it("takes the embedder's message from the parent page alone", () => {
    const listeners = new Map<string, (event: MessageEvent) => void>();
    const parent = {} as Window;
    const target = { parent, addEventListener: (type: string, listener: (event: MessageEvent) => void) => listeners.set(type, listener), removeEventListener: (type: string) => listeners.delete(type) } as unknown as Window;
    const stop = listenToEmbedder(target);
    const message = listeners.get("message")!;
    message({ source: {} as Window, data: { type: THEME_MESSAGE, theme: "light" } } as MessageEvent);
    expect(forcedThemeStore.get()).toBeNull();
    message({ source: parent, data: { type: "something else", theme: "light" } } as MessageEvent);
    expect(forcedThemeStore.get()).toBeNull();
    message({ source: parent, data: { type: THEME_MESSAGE, theme: "light" } } as MessageEvent);
    expect(forcedThemeStore.get()).toBe("light");
    message({ source: parent, data: { type: THEME_MESSAGE, theme: "dark" } } as MessageEvent);
    expect(forcedThemeStore.get()).toBe("dark");
    stop();
    expect(listeners.has("message")).toBe(false);
  });

  it("hears nothing on a page that is not embedded", () => {
    const listeners = new Map<string, (event: MessageEvent) => void>();
    const target = { addEventListener: (type: string, listener: (event: MessageEvent) => void) => listeners.set(type, listener), removeEventListener: vi.fn() } as unknown as Window;
    (target as { parent: Window }).parent = target;
    listenToEmbedder(target);
    listeners.get("message")!({ source: target, data: { type: THEME_MESSAGE, theme: "light" } } as MessageEvent);
    expect(forcedThemeStore.get()).toBeNull();
  });
});

describe("the look a view is drawn in", () => {
  it("is the theme, but a night scene (Orbits 3D, the City) and a view whose sheet is the night's alone stay dark", () => {
    expect(lookOf("light", false)).toBe("light");
    expect(lookOf("dark", false)).toBe("dark");
    expect(lookOf("light", true)).toBe("dark");
    expect(VIEWS.filter((view) => view.night).map((view) => view.slug)).toEqual(["orbits-3d", "city", "time-river", "river", "reciprocity"]);
  });

  it("is told to the browser: its colour scheme and its theme-color, the page's own ground", () => {
    const meta = { content: "#030812" };
    const doc = { documentElement: { style: {} as CSSStyleDeclaration }, querySelector: () => meta } as unknown as Document;
    showLook("light", doc);
    expect(doc.documentElement.style.colorScheme).toBe("light");
    expect(meta.content).toBe(THEME_COLOR.light);
    showLook("dark", doc);
    expect(doc.documentElement.style.colorScheme).toBe("dark");
    expect(meta.content).toBe("#030812");
  });
});
