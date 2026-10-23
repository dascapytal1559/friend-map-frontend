// Each view's own settings, by its slug (views.ts): what the menu at the top
// left (ViewSwitcher.tsx) shows in a section of its own, set apart from the
// list of views, while that view is open, and nothing for a view without any.
// A setting is data: a toggle (a choice between a few, as one row of buttons),
// a theme colour (a toggle of presets and a custom colour) or a slider, each
// over a store the view itself reads, so the menu and the view stay one
// (ViewSettings.tsx draws them). A view's settings come in groups, set apart
// by a line: most views have one; the Spider web has two, its name settings
// first and then the web's own look. Every view that glows round everyone to
// reach out to ends with one more, the Reach-out glow, one setting they share. The name choice (Name format,
// NamesMenu.tsx), on every page that shows names, is put first in the first
// group by ViewSettings.tsx rather than listed here, as it is the page's, not
// one view's. Where names go is not a setting: every map view draws each
// named person as their name alone, in place of their icon. No React here but
// the stores' hooks.

import { includeGroupsStore } from "./demos/calendar.ts";
import { reachGlowLabel, reachGlowStore } from "./demos/reachGlow.ts";
import { ORBITS_PRESETS, orbitsCustomStore, orbitsThemeStore } from "./demos/orbitsTheme.ts";
import type { Hex } from "./demos/themeColour.ts";
import { COLOURS, webColourStore, webCustomStore, type WebColour } from "./demos/webColour.ts";
import { webStrengthStore } from "./demos/webStrength.ts";
import { SPOKES, webCurveStore, webSpokesStore } from "./demos/webStyle.ts";
import { NAME_PADDING, namePaddingStores, type MapView } from "./demos/namePadding.ts";
import { ALL, TOP_NAMES, topNamesStores, type MainView } from "./demos/topNames.ts";
import type { Store } from "./keptSetting.ts";

/** One of a toggle's choices: its value, what it is called, and a line on it. */
export interface Choice<T> {
  value: T;
  title: string;
  about?: string;
}

/** What every setting has: its label. */
interface Shared {
  label: string;
}

/** A choice between a few, as one row of buttons, the one chosen pressed. */
export interface ToggleSetting<T> extends Shared {
  kind: "toggle";
  choices: readonly Choice<T>[];
  store: Store<T>;
  /** Long choices, so they wrap onto a second row rather than widen the menu (Name format). */
  wrap?: boolean;
}

/** A theme colour: its presets, each with a swatch, then Custom, any colour, the last one chosen offered again (`custom`). */
export interface ColourSetting<T extends string> extends Shared {
  kind: "colour";
  presets: readonly (Choice<T> & { swatch: string })[];
  store: Store<T | Hex>;
  custom: Store<Hex>;
}

/** A value along a range, shown as a percentage of it unless `format` says otherwise. */
export interface SliderSetting extends Shared {
  kind: "slider";
  min: number;
  max: number;
  step: number;
  store: Store<number>;
  format?: (value: number) => string;
}

export type ViewSetting = ToggleSetting<unknown> | ColourSetting<string> | SliderSetting;

/** Settings that go together, drawn as one run, apart from the view's other groups. */
export type SettingGroup = readonly ViewSetting[];

/** A main view's Show top names (topNames.ts): how many of the closest it names without hovering. */
function topNames(slug: MainView): ToggleSetting<number> {
  return {
    kind: "toggle",
    label: "Show top names",
    choices: TOP_NAMES.map((n) => (n === ALL
      ? { value: n, title: "All", about: "Name everyone in view" }
      : { value: n, title: String(n), about: `Name the closest ${n}; everyone else is named on hovering, or zooming in` })),
    store: topNamesStores[slug],
  };
}

/** A map view's Name padding (namePadding.ts): how many pixels apart it fits its names. */
function namePadding(slug: MapView): SliderSetting {
  return { kind: "slider", label: "Name padding", ...NAME_PADDING, store: namePaddingStores[slug], format: (px) => `${px} px` };
}

/** The Reach-out glow (reachGlow.ts): how strongly everyone you should reach out to glows, on every view that glows. */
const REACH_GLOW: SettingGroup = [
  { kind: "slider", label: "Reach-out glow", min: 0, max: 1, step: 0.05, store: reachGlowStore, format: reachGlowLabel },
];

export const VIEW_SETTINGS: Readonly<Record<string, readonly SettingGroup[]>> = {
  orbits: [[
    {
      kind: "colour",
      label: "Theme",
      presets: ORBITS_PRESETS.map((p) => ({ value: p.colour, title: p.title, about: p.about, swatch: p.colour })),
      store: orbitsThemeStore,
      custom: orbitsCustomStore,
    } satisfies ColourSetting<Hex>,
    topNames("orbits"),
    namePadding("orbits"),
  ], REACH_GLOW],
  "orbits-3d": [[topNames("orbits-3d")], REACH_GLOW],
  circles: [REACH_GLOW],
  // Its name settings together (with Name format, first), then the web's own look.
  web: [
    [topNames("web"), namePadding("web")],
    [
      {
        kind: "colour",
        label: "Colour",
        presets: COLOURS.map((c) => ({ value: c.colour, title: c.title, about: c.about, swatch: c.swatch })),
        store: webColourStore,
        custom: webCustomStore,
      } satisfies ColourSetting<WebColour>,
      { kind: "slider", label: "Strand curve", min: 0, max: 1, step: 0.05, store: webCurveStore },
      { kind: "slider", label: "Spokes", ...SPOKES, store: webSpokesStore, format: String },
      { kind: "slider", label: "Web strength", min: 0, max: 1, step: 0.05, store: webStrengthStore },
    ],
    REACH_GLOW,
  ],
  city: [[topNames("city")], REACH_GLOW],
  calendar: [[
    {
      kind: "toggle",
      label: "Messages",
      choices: [
        { value: false, title: "One-to-one", about: "Count and show one-to-one chats only" },
        { value: true, title: "With groups", about: "Count and show group chats too, in the shading and the day panel" },
      ],
      store: includeGroupsStore,
    } satisfies ToggleSetting<boolean>,
  ]],
};

/** The groups of settings of the view `slug`: none for a view without any. */
export function groupsOf(slug: string): readonly SettingGroup[] {
  return VIEW_SETTINGS[slug] ?? [];
}

/** The settings of the view `slug`, every group's in order: none for a view without any. */
export function settingsOf(slug: string): readonly ViewSetting[] {
  return groupsOf(slug).flat();
}
