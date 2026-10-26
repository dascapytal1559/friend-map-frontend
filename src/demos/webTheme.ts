// The Spider web's colours (webColour.ts): the canvas's inks (webLook.ts, and the
// spider's, webSpider.ts, made from them), Orbits' own SVG marks restyled
// (LookPalette), and the stylesheet's (orbits.css, as custom properties on the
// SVG). Amber is tuned by hand. A custom colour is worked out from its hue
// alone (customTheme): the strands in it, light and strong, the accents a
// little further round the wheel, a partner across the wheel for the rings,
// the sun's glow and the cool trails, and the ground and the spider's dark
// faintly tinted with it. The beam, the eyes and the scan line are the
// Spider web's teal in every colour, a teal custom colour included. On paper
// (the light look, src/theme.ts) the web is drawn in ink rather than light:
// PAPER_AMBER by hand, and a custom colour worked out as ink (paperCustomTheme),
// the ground white, the haze white toward the edges in place of black, the
// scanlines all but gone, and the spider the same dark it was.

import { oklchHex } from "../identicon.ts";
import type { LookPalette } from "./orbitsTheme.ts";
import { oklch } from "./themeColour.ts";
import type { WebColour } from "./webColour.ts";
import { rgba } from "./webDraw.ts";

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
  /** The dark the spider is made of. */
  dark: string;
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

const AMBER_THEME: WebTheme = {
  ink: {
    background: "#030812", grid: "rgba(57, 216, 255, 0.07)", strand: AMBER, rings: TEAL, accent: AMBER, beam: TEAL, scan: TEAL, eye: TEAL,
    split: ["#ff3b6b", TEAL], haze: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.45)"], dark: "#070c17", scanline: NIGHT_SCANLINE,
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
      split: ["#ff3b6b", partner], haze: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.5)"], dark: oklchHex(0.17, 0.035, hue), scanline: NIGHT_SCANLINE,
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

/** Amber on paper: its amber and teal as inks on white. */
const PAPER_AMBER: WebTheme = paperTheme({
  background: "#ffffff", grid: "rgba(15, 15, 15, 0.05)", strand: "#b45309", rings: "#0e7490", accent: "#b45309", beam: PAPER_TEAL, scan: PAPER_TEAL, eye: PAPER_TEAL,
  split: ["#e11d48", PAPER_TEAL], haze: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.55)"], dark: "#1f2937", scanline: PAPER_SCANLINE,
});

/** The whole theme on paper worked out from one colour (#rrggbb), as customTheme does for the night, every colour as ink. */
export function paperCustomTheme(colour: string): WebTheme {
  const [, chroma, hue] = oklch(colour);
  const c = Math.min(0.17, Math.max(chroma, 0.12));
  const strand = oklchHex(0.5, c, hue);
  const accent = oklchHex(0.48, Math.max(c, Math.min(0.18, chroma * 1.2)), hue + 35);
  const partner = oklchHex(0.5, Math.max(0.1, Math.min(0.14, c)), hue + 150);
  return paperTheme({
    background: "#ffffff", grid: rgba(partner, 0.06), strand, rings: partner, accent, beam: PAPER_TEAL, scan: PAPER_TEAL, eye: PAPER_TEAL,
    split: ["#e11d48", partner], haze: ["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.55)"], dark: oklchHex(0.22, 0.03, hue), scanline: PAPER_SCANLINE,
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
