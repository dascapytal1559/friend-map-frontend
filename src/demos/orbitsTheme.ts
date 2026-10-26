// A look's colours for Orbits' own SVG marks (Orbits.tsx), and Orbits' theme
// colour: the sun's warm orange until another is chosen under Theme in
// Orbits' settings in the menu (viewSettings.ts), kept on this device as the
// app's other settings are. The theme colours the sun and the guide rings
// (ringColours.ts: the gradient starts at it and keeps its turn of hue
// outward), and the ring round your photo; everyone's own colours,
// the trails' warm and cool, and the names stay as they are. Its lightness is
// kept within what reads on the night sky (themeSun), so a dark pick still
// shows. Orbits alone: Circles and Orbits 3D keep the orange.

import { oklchHex } from "../identicon.ts";
import { keptAs } from "../demoMode.ts";
import { keptSetting, useStore } from "../keptSetting.ts";
import { COLORS, PAPER } from "./palette.ts";
import { hexIn, inkOf, oklch, turned, type Hex } from "./themeColour.ts";
import { rgba } from "./webDraw.ts";

/** A look's colours for Orbits' own SVG marks. */
export interface LookPalette {
  /** The sun's gradient: offset, colour, opacity. */
  sun: Array<[number, string, number]>;
  /** The markers' rims: whoever is picked out, the belt, and everyone else (by their main colour). */
  body: { lit: string; silent: string; plain: (main: string) => string; width: { lit: number; silent: number; plain: number } };
  /** The comet trails: moved in, moved out. */
  trail: { warm: string; cool: string };
}

/** The sun's white-hot core, at the theme's default. */
const CORE = "#fff8e8";

/** Orbits' look for a sun of colour `sun`: its warm gradient, dark rims, and warm and cool trails. */
function nightPalette(sun: string): LookPalette {
  const core = sun === COLORS.me ? CORE : turned(CORE, oklch(sun)[2] - oklch(COLORS.me)[2]);
  return {
    sun: [[0, core, 1], [0.35, sun, 1], [0.7, sun, 0.18], [1, sun, 0]],
    body: { lit: COLORS.star, silent: COLORS.dim, plain: () => "rgba(7, 11, 22, 0.55)", width: { lit: 1.6, silent: 1, plain: 0.8 } },
    trail: { warm: COLORS.warm, cool: COLORS.cool },
  };
}

/** Orbits' look on paper for a sun of colour `sun`: a solid disc in its hue with a pale halo, rims in ink (the plain one its person's own), Paper's warm and cool trails. */
function paperPalette(sun: string): LookPalette {
  const [, c, h] = oklch(sun);
  const core = oklchHex(0.7, Math.max(c, 0.16), h);
  const halo = oklchHex(0.84, Math.max(c * 0.8, 0.1), h);
  return {
    sun: [[0, core, 1], [0.3, core, 1], [0.42, halo, 0.9], [0.7, halo, 0.22], [1, halo, 0]],
    body: { lit: PAPER.star, silent: PAPER.dim, plain: (main) => rgba(inkOf(main), 0.55), width: { lit: 1.6, silent: 1, plain: 0.8 } },
    trail: { warm: PAPER.warm, cool: PAPER.cool },
  };
}

/** Orbits' own look, in the sun's orange. */
export const NIGHT_PALETTE: LookPalette = nightPalette(COLORS.me);

/** Orbits' look on paper, in the sun's orange. */
export const PAPER_PALETTE: LookPalette = paperPalette(COLORS.me);

/** The theme until another is chosen: the sun's orange. */
export const ORANGE = COLORS.me as Hex;

/** The presets, in the order offered, with what each is called and a line on it. */
export const ORBITS_PRESETS: readonly { colour: Hex; title: string; about: string }[] = [
  { colour: ORANGE, title: "Orange", about: "The sun's own warm orange" },
];

/** How light the sun may be, in OKLCH: never so dark it sinks into the night, nor so light it loses its colour. */
const SUN_LIGHTNESS = { min: 0.72, max: 0.9 };

/** The sun's colour for a chosen theme colour: its hue and chroma, its lightness kept where it reads on the night. */
export function themeSun(chosen: string): string {
  if (chosen === ORANGE) return ORANGE;
  const [l, c, h] = oklch(chosen);
  const kept = Math.max(SUN_LIGHTNESS.min, Math.min(SUN_LIGHTNESS.max, l));
  return kept === l ? chosen : oklchHex(kept, c, h);
}

const palettes = { night: new Map<string, LookPalette>([[ORANGE, NIGHT_PALETTE]]), paper: new Map<string, LookPalette>([[ORANGE, PAPER_PALETTE]]) };

/** Orbits' look in a theme colour: the sun's gradient in it, the rest as Orbits' own; on paper (`light`), paperPalette's. */
export function orbitsPalette(chosen: string, light = false): LookPalette {
  const sun = themeSun(chosen);
  const kept = light ? palettes.paper : palettes.night;
  let palette = kept.get(sun);
  if (!palette) {
    // A colour picker dragged makes a new one every step; keep only the latest few.
    if (kept.size > 32) kept.clear();
    palette = light ? paperPalette(sun) : nightPalette(sun);
    kept.set(sun, palette);
  }
  return palette;
}

/** Orbits' theme colour, kept on this device (apart in the demo). */
export const orbitsThemeStore = keptSetting<Hex>(keptAs("friend-map.orbits.theme"), ORANGE, (kept) => hexIn(kept) ?? ORANGE);

/** The custom colour offered until one is chosen: the teal Orbits uses for the other person, far from the orange. */
export const DEFAULT_ORBITS_CUSTOM = COLORS.them as Hex;

/** The last custom colour chosen, kept on this device, so the Custom swatch offers it again after Orange. */
export const orbitsCustomStore = keptSetting<Hex>(keptAs("friend-map.orbits.customColour"), DEFAULT_ORBITS_CUSTOM, (kept) => hexIn(kept) ?? DEFAULT_ORBITS_CUSTOM);

export function useOrbitsTheme(): Hex {
  return useStore(orbitsThemeStore);
}
