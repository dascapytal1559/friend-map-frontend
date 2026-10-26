// The page's look (docs/settings.md, "Look"): dark, the night sky friend-map
// has always been drawn on, or light, Paper: the life archive console's
// premium white, so friend-map embedded in the console reads as one of its
// pages. The choice is the console's own three: Auto (follow the device),
// Light and Dark, kept in this browser (the demo's apart, keptAs), under Look
// in the open view's settings in the menu at the top left (ViewSettings.tsx).
// A page that embeds friend-map sets the look for it, so one switch, the
// embedder's, rules inside it: ?theme=light|dark on the address wins while
// the page is open, and a message from the embedding page ({ type:
// "friend-map:theme", theme }, listenToEmbedder) switches it as the embedder's
// own look flips, with no reload. Orbits 3D and the City are night scenes
// and stay dark whatever the look, as do the views whose sheets are the
// night's alone (lookOf; `night` in views.ts), so the map page tells its
// views and the panel the look it is drawn in (Look). The
// colours each look is drawn in are the stylesheets' tokens (demos.css) and
// the palettes drawn in code (src/demos/palette.ts and the modules it names).

import { createContext, useContext } from "react";
import { keptAs } from "./demoMode.ts";
import { keptSetting, useStore, type Store } from "./keptSetting.ts";
import type { ToggleSetting } from "./viewSettings.ts";

export type Theme = "light" | "dark";
export type ThemeChoice = "auto" | Theme;

/** Where the choice is kept. */
export const THEME_KEY = "friend-map.theme";

/** The choice until one is made: follow the device. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "auto";

/** The choices offered, as the console offers them. */
export const THEME_CHOICES: readonly { value: ThemeChoice; title: string; about: string }[] = [
  { value: "auto", title: "Auto", about: "Follow the device's own setting" },
  { value: "light", title: "Light", about: "Paper: the console's white" },
  { value: "dark", title: "Dark", about: "The night sky" },
];

/** A theme written as light or dark; null for anything else. */
export function themeOf(value: unknown): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** A choice as kept; anything else is `fallback`. */
export function choiceOf(kept: string | null, fallback: ThemeChoice = DEFAULT_THEME_CHOICE): ThemeChoice {
  return kept === "auto" ? "auto" : themeOf(kept) ?? fallback;
}

/** The theme a choice gives on a device that prefers dark or not. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  return choice === "auto" ? (prefersDark ? "dark" : "light") : choice;
}

/** The theme the address asks for (?theme=light|dark), which wins while the page is open; null for none. */
export function askedTheme(search: string): Theme | null {
  return themeOf(new URLSearchParams(search).get("theme"));
}

/** What a page that embeds friend-map posts to switch its look (listenToEmbedder). */
export const THEME_MESSAGE = "friend-map:theme";

/** The theme a message asks for, if it is one of ours; null for any other message. */
export function themeMessage(data: unknown): Theme | null {
  if (typeof data !== "object" || data === null) return null;
  const { type, theme } = data as { type?: unknown; theme?: unknown };
  return type === THEME_MESSAGE ? themeOf(theme) : null;
}

/** The theme a page is drawn in: the one forced on it (the address's, or the embedder's), else its choice on this device. */
export function currentTheme(forced: Theme | null, choice: ThemeChoice, prefersDark: boolean): Theme {
  return forced ?? resolveTheme(choice, prefersDark);
}

/** The look a view is drawn in under a theme: a night scene (`night`, views.ts: Orbits 3D and the City) stays dark. */
export function lookOf(theme: Theme, night: boolean): Theme {
  return night ? "dark" : theme;
}

/** The choice, kept in this browser (the demo's apart). */
export const themeChoiceStore = keptSetting<ThemeChoice>(keptAs(THEME_KEY), DEFAULT_THEME_CHOICE, (kept) => choiceOf(kept));

/** The theme forced on this page while it is open: the address's, then whatever the embedder last asked for. */
export const forcedThemeStore = keptSetting<Theme | null>("friend-map.theme.forced", null, themeOf, (value) => value ?? "", { storage: () => null });
forcedThemeStore.set(askedTheme(globalThis.location?.search ?? ""));

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

/** Whether the device prefers dark, kept up to date. */
export const prefersDarkStore: Store<boolean> = {
  get: () => media?.matches ?? false,
  set() {},
  subscribe(listener) {
    media?.addEventListener("change", listener);
    return () => media?.removeEventListener("change", listener);
  },
};

/** The theme this page is drawn in, as the choice, the device and the embedder have it. */
export function useTheme(): Theme {
  const forced = useStore(forcedThemeStore);
  const choice = useStore(themeChoiceStore);
  const prefersDark = useStore(prefersDarkStore);
  return currentTheme(forced, choice, prefersDark);
}

/** Whether the look is forced on this page (by the address or the embedder), so the choice in the menu is not its own to make. */
export function useForcedTheme(): Theme | null {
  return useStore(forcedThemeStore);
}

/**
 * Follows the page that embeds this one: a theme message from it (and from it alone) sets the look while the page is
 * open. Called once as the page starts (src/main.tsx, src/demo/main.tsx); a page not embedded hears nothing.
 */
export function listenToEmbedder(target: Window = window): () => void {
  const onMessage = (event: MessageEvent) => {
    if (target.parent === target || event.source !== target.parent) return;
    const theme = themeMessage(event.data);
    if (theme) forcedThemeStore.set(theme);
  };
  target.addEventListener("message", onMessage);
  return () => target.removeEventListener("message", onMessage);
}

/** The look the map page is drawn in, for everything in it that draws by it (Identicon.tsx, the views); dark until the page says. */
export const Look = createContext<Theme>("dark");

export function useLook(): Theme {
  return useContext(Look);
}

/** The Look choice as a toggle, for the settings in the menu (ViewSettings.tsx). */
export const lookSetting: ToggleSetting<ThemeChoice> = {
  kind: "toggle",
  label: "Look",
  choices: THEME_CHOICES.map((choice) => ({ value: choice.value, title: choice.title, about: choice.about })),
  store: themeChoiceStore,
};

/** What the browser paints round the page in each look (its theme-color): the page's own ground, as demos.css has it. */
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#030812" };

/** Tells the browser the look the page is drawn in: its colour scheme (form controls, scrollbars) and its theme-color. */
export function showLook(look: Theme, doc: Document = document): void {
  doc.documentElement.style.colorScheme = look;
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[look];
}
