// The guide rings' colours (Orbits, Circles and Orbits 3D; the City's
// avenues): one family that starts at the sun's orange (COLORS.me) and cools
// ring by ring through amber and dusky rose to a muted violet, the lines and
// their labels fainter outward, each label in its line's colour, faded. On
// Orbits in another theme colour (orbitsTheme.ts) the family starts at that
// sun instead, every step after it turned round the wheel as far as the sun
// was, so the gradient keeps its shape and its lightness. On paper (the light
// look, src/theme.ts) every stop is ink, darkened to read on white, and the
// lines and labels are drawn stronger, since ink at an alpha reads fainter on
// white than light does on the night.

import { mix } from "../identicon.ts";
import { COLORS } from "./palette.ts";
import { inkOf, oklch, turned } from "./themeColour.ts";

/** The gradient, from the ring nearest the sun to the furthest, spread evenly along `ringShare`. */
const STOPS = [COLORS.me, "#ec9a6a", "#c98196", "#8d7fbf"];
/** How dark the family is as ink on paper. */
const INK = 0.58;
const PAPER_STOPS = STOPS.map((stop) => inkOf(stop, INK));

/** The bands the rings mark, nearest first (rings() in orbitsLayout.ts); the gradient runs over these six. */
const BANDS = [10, 25, 50, 100, 250, 500];

/**
 * How far out a ring is in the gradient: 0 for "top 10", a step further for
 * each band out, 1 for "top 500" and beyond. A ring's colour depends on its
 * band alone, so the Query bar narrowing who is shown drops rings without
 * changing the others' colours.
 */
export function ringShare(rank: number): number {
  const band = BANDS.findIndex((n) => Math.floor(rank) <= n);
  return band === -1 ? 1 : band / (BANDS.length - 1);
}

/** How strongly a ring's line is drawn, nearest the sun first: nearly flat, so the inner rings do not stand out. */
const RING_LINE = { night: { near: 0.16, far: 0.13 }, paper: { near: 0.34, far: 0.26 } };
/**
 * How strongly the labels are drawn: faded, so they mark the rings without
 * competing with the names, and fainter outward by the gradient's darkening
 * alone, which keeps the furthest, the violet, legible (a contrast of 2 on the night).
 */
export const RING_LABEL = 0.5;
/** How strongly the labels are drawn on paper: nearly whole, since ink fades faster than light. */
export const PAPER_RING_LABEL = 0.9;

const themed = new Map<string, string[]>([[`night:${COLORS.me}`, STOPS], [`paper:${COLORS.me}`, PAPER_STOPS]]);

/**
 * The gradient's stops for a sun of colour `sun`: the sun, then the rest turned as far round the wheel as it is from the
 * orange; on paper (`light`) the sun as ink, then the ink family turned the same way.
 */
function stopsFor(sun: string, light: boolean): string[] {
  const key = `${light ? "paper" : "night"}:${sun}`;
  let stops = themed.get(key);
  if (!stops) {
    // A colour picker dragged makes a new one every step; keep only the latest few.
    if (themed.size > 64) themed.clear();
    const by = oklch(sun)[2] - oklch(COLORS.me)[2];
    stops = light ? [inkOf(sun, INK), ...PAPER_STOPS.slice(1).map((stop) => turned(stop, by))] : [sun, ...STOPS.slice(1).map((stop) => turned(stop, by))];
    themed.set(key, stops);
  }
  return stops;
}

/** A ring's colour, and its line's and label's (rgba), by its rank (rings(): 10.5 for the top 10), from a sun of colour `sun`, on the night or on paper (`light`). */
export function ringColours(rank: number, sun: string = COLORS.me, light = false): { colour: string; line: string; label: string } {
  const stops = stopsFor(sun, light);
  const line = light ? RING_LINE.paper : RING_LINE.night;
  const t = ringShare(rank);
  const at = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(at));
  const colour = mix(stops[i], stops[i + 1], at - i);
  return {
    colour,
    line: rgba(colour, line.near + (line.far - line.near) * t),
    label: rgba(colour, light ? PAPER_RING_LABEL : RING_LABEL),
  };
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
}
