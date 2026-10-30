// The Spider web's colours (webColour.ts): the canvas's inks (webLook.ts, and the
// spider's, webSpider.ts, made from them), Orbits' own SVG marks restyled
// (LookPalette), and the stylesheet's (orbits.css, as custom properties on the
// SVG). Amber is tuned by hand. A custom colour is worked out from its hue
// alone (customTheme): the strands in it, light and strong, the accents a
// little further round the wheel, a partner across the wheel for the rings,
// the sun's glow and the cool trails, and the ground and the spider's dark
// faintly tinted with it. The beam, the eyes and the scan line are the
// Spider web's teal in every colour, a teal custom colour included. On paper
// (the light look, src/theme.ts) the web is drawn in ink rather than light,
// keeping the night's own balance: the names the strongest marks, the web
// under them, and the spider weighing no more than the names. PAPER_AMBER by
// hand, and a custom colour worked out as ink (paperCustomTheme): the ground
// a paper faintly tinted with the colour, the grid and the strands drawn
// heavier than on the night (weight), since ink at an alpha reads fainter on
// white than light does on the night, the haze a shade deeper toward the
// edges in place of the night's black, the scanlines all but gone, the
// spider's chitin pale, so that its ink lines and seams draw it as its lit
// edges do on the night, its shadow light, and whatever flashes white on the
// night flashing the darkest ink (bright).

import { mix, oklchHex } from "../identicon.ts";
import type { LookPalette } from "./orbitsTheme.ts";
import { PAPER } from "./palette.ts";
import { oklch } from "./themeColour.ts";
import type { WebColour } from "./webColour.ts";
import { rgba } from "./webDraw.ts";

/** The spider's chitin: the dark of its depths and its joints, its plates, and their faces toward the light. */
export interface Chitin {
  deep: string;
  shell: string;
  lit: string;
}

/** A colour's inks for the canvas. */
export interface Ink {
  background: string;
  grid: string;
  /** The spokes, the rings, and the accents (brackets, the reticle). */
  strand: string;
  rings: string;
  accent: string;
  /** The threads' beam, the scan line, the spider's eyes. */
  beam: string;
  scan: string;
  eye: string;
  /** The chromatic split's two copies. */
  split: [string, string];
  /** The haze over the ground: at the sun, and at the edges. */
  haze: [string, string];
  /** What the spider is made of, and how dark its shadow falls on the web, 0 to 1. */
  chitin: Chitin;
  shadow: number;
  /** The brightest a thing is drawn, as a beam's head and a flash: white on the night; the darkest ink on paper, where white is the ground. */
  bright: string;
  /** How much heavier every strand is drawn than on the night, where it is 1: ink at an alpha reads fainter on white than light does on the night. */
  weight: number;
  /** The scanlines over the ground: black on the night, next to nothing on paper. */
  scanline: string;
}

/** The stylesheet's colours for the Spider web (orbits.css): ring labels and accents, the rings, the held person's links, the friend circles. */
export interface WebCss {
  "--web-accent": string;
  "--web-ring": string;
  "--web-link": string;
  "--web-circle": string;
}

export interface WebTheme {
  ink: Ink;
  palette: LookPalette;
  css: WebCss;
}

/** The Spider web's own teal and amber: the teal is the beam's in every colour. */
export const TEAL = "#39d8ff";
const AMBER = "#ffb347";
/** The teal as ink on paper, for the beam, the scan line and the eyes there. */
export const PAPER_TEAL = "#0891b2";
const NIGHT_SCANLINE = "rgba(0, 0, 0, 0.22)";
const PAPER_SCANLINE = "rgba(0, 0, 0, 0.03)";
/** How dark the spider's shadow falls: plain on the night, where it is lost in the ground anyway; light on paper, where it would weigh as much as the spider. */
const NIGHT_SHADOW = 0.3;
const PAPER_SHADOW = 0.1;
const NIGHT_BRIGHT = "#ffffff";
const PAPER_BRIGHT = PAPER.star;
/** How much heavier every strand is drawn on paper than on the night. */
export const PAPER_WEIGHT = 2;

/** The chitin of a spider on the night, made of its dark: plates a shade toward the strands, faces lit toward white. */
function nightChitin(dark: string, strand: string): Chitin {
  return { deep: dark, shell: mix(dark, strand, 0.14), lit: mix(dark, "#ffffff", 0.3) };
}

/** The chitin of a spider on paper, faintly tinted with a hue: pale plates, paler faces, depths of a mid tone, so that its ink lines draw it. */
function paperChitin(hue: number): Chitin {
  return { deep: oklchHex(0.56, 0.045, hue), shell: oklchHex(0.86, 0.025, hue), lit: oklchHex(0.95, 0.01, hue) };
}

/** Paper faintly tinted with a hue: the ground, and the shade it deepens to toward the edges (the haze). */
function paper(hue: number): { ground: string; edge: string } {
  return { ground: oklchHex(0.99, 0.004, hue), edge: oklchHex(0.95, 0.01, hue) };
}

const AMBER_THEME: WebTheme = {
  ink: {
    background: "#030812", grid: "rgba(57, 216, 255, 0.07)", strand: AMBER, rings: TEAL, accent: AMBER, beam: TEAL, scan: TEAL, eye: TEAL,
    split: ["#ff3b6b", TEAL], haze: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.45)"], chitin: nightChitin("#070c17", AMBER), shadow: NIGHT_SHADOW, bright: NIGHT_BRIGHT, weight: 1, scanline: NIGHT_SCANLINE,
  },
  palette: {
    sun: [[0, TEAL, 0.22], [0.5, TEAL, 0.06], [1, TEAL, 0]],
    body: { lit: "#ffffff", silent: "rgba(57, 216, 255, 0.45)", plain: () => "rgba(255, 179, 71, 0.75)", width: { lit: 1.8, silent: 1, plain: 1 } },
    trail: { warm: AMBER, cool: TEAL },
  },
  css: { "--web-accent": "rgba(255, 179, 71, 0.8)", "--web-ring": "rgba(255, 179, 71, 0.16)", "--web-link": "rgba(57, 216, 255, 0.55)", "--web-circle": "rgba(57, 216, 255, 0.35)" },
};

/** The whole theme worked out from one colour (#rrggbb): see the head of this file. */
export function customTheme(colour: string): WebTheme {
  const [, chroma, hue] = oklch(colour);
  // Strong enough to glow, whatever was picked; a grey stays nearly grey.
  const c = Math.min(0.19, chroma);
  const strand = oklchHex(0.8, c, hue);
  const accent = oklchHex(0.74, Math.max(c, Math.min(0.2, chroma * 1.2)), hue + 35);
  const partner = oklchHex(0.8, Math.max(0.1, Math.min(0.14, c)), hue + 150);
  const background = oklchHex(0.13, 0.03, hue);
  return {
    ink: {
      background, grid: rgba(partner, 0.07), strand, rings: partner, accent, beam: TEAL, scan: TEAL, eye: TEAL,
      split: ["#ff3b6b", partner], haze: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.5)"], chitin: nightChitin(oklchHex(0.17, 0.035, hue), strand), shadow: NIGHT_SHADOW, bright: NIGHT_BRIGHT, weight: 1, scanline: NIGHT_SCANLINE,
    },
    palette: {
      sun: [[0, partner, 0.22], [0.5, partner, 0.06], [1, partner, 0]],
      body: { lit: "#ffffff", silent: rgba(partner, 0.45), plain: () => rgba(strand, 0.75), width: { lit: 1.8, silent: 1, plain: 1 } },
      trail: { warm: strand, cool: partner },
    },
    css: { "--web-accent": rgba(accent, 0.8), "--web-ring": rgba(strand, 0.16), "--web-link": rgba(TEAL, 0.55), "--web-circle": rgba(partner, 0.35) },
  };
}

const custom = new Map<string, WebTheme>();

/** The Spider web's theme in a colour: Amber's, or one worked out from a custom colour; on paper (`light`), as ink. */
export function webTheme(colour: WebColour, light = false): WebTheme {
  if (light) return paperWebTheme(colour);
  if (colour === "amber") return AMBER_THEME;
  let theme = custom.get(colour);
  if (!theme) {
    // A colour picker dragged makes a new one every step; keep only the latest few.
    if (custom.size > 32) custom.clear();
    theme = customTheme(colour);
    custom.set(colour, theme);
  }
  return theme;
}

/** A paper theme from its inks: the hub's glow and the rims from the rings and strands, the stylesheet's colours in ink. */
function paperTheme(ink: Ink): WebTheme {
  const { strand, rings, accent, beam } = ink;
  return {
    ink,
    palette: {
      sun: [[0, rings, 0.25], [0.5, rings, 0.07], [1, rings, 0]],
      body: { lit: "#0f0f0f", silent: rgba(rings, 0.5), plain: () => rgba(strand, 0.8), width: { lit: 1.8, silent: 1, plain: 1 } },
      trail: { warm: strand, cool: rings },
    },
    css: { "--web-accent": rgba(accent, 0.9), "--web-ring": rgba(strand, 0.22), "--web-link": rgba(beam, 0.6), "--web-circle": rgba(rings, 0.4) },
  };
}

/** The hue of the night the spider's dark is: its chitin on paper is a slate of the same hue. */
const NIGHT_HUE = 260;

/** Amber on paper: its amber and teal as inks on a warm paper, the spider in slate. */
const PAPER_AMBER: WebTheme = paperTheme({
  background: paper(oklch(AMBER)[2]).ground, grid: rgba("#0e7490", 0.09), strand: "#b45309", rings: "#0e7490", accent: "#b45309", beam: PAPER_TEAL, scan: PAPER_TEAL, eye: PAPER_TEAL,
  split: ["#e11d48", PAPER_TEAL], haze: [rgba(paper(oklch(AMBER)[2]).edge, 0), rgba(paper(oklch(AMBER)[2]).edge, 0.5)], chitin: paperChitin(NIGHT_HUE), shadow: PAPER_SHADOW, bright: PAPER_BRIGHT, weight: PAPER_WEIGHT, scanline: PAPER_SCANLINE,
});

/** The whole theme on paper worked out from one colour (#rrggbb), as customTheme does for the night, every colour as ink. */
export function paperCustomTheme(colour: string): WebTheme {
  const [, chroma, hue] = oklch(colour);
  const c = Math.min(0.17, Math.max(chroma, 0.12));
  const strand = oklchHex(0.5, c, hue);
  const accent = oklchHex(0.48, Math.max(c, Math.min(0.18, chroma * 1.2)), hue + 35);
  const partner = oklchHex(0.5, Math.max(0.1, Math.min(0.14, c)), hue + 150);
  const { ground, edge } = paper(hue);
  return paperTheme({
    background: ground, grid: rgba(partner, 0.09), strand, rings: partner, accent, beam: PAPER_TEAL, scan: PAPER_TEAL, eye: PAPER_TEAL,
    split: ["#e11d48", partner], haze: [rgba(edge, 0), rgba(edge, 0.5)], chitin: paperChitin(hue), shadow: PAPER_SHADOW, bright: PAPER_BRIGHT, weight: PAPER_WEIGHT, scanline: PAPER_SCANLINE,
  });
}

const paperCustom = new Map<string, WebTheme>();

/** The Spider web's theme in a colour on paper: Amber's, or one worked out from a custom colour. */
function paperWebTheme(colour: WebColour): WebTheme {
  if (colour === "amber") return PAPER_AMBER;
  let theme = paperCustom.get(colour);
  if (!theme) {
    if (paperCustom.size > 32) paperCustom.clear();
    theme = paperCustomTheme(colour);
    paperCustom.set(colour, theme);
  }
  return theme;
}
