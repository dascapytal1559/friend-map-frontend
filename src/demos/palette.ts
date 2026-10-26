// Colours shared by the map views, in each look (src/theme.ts): COLORS on the
// night sky, PAPER on the light look's white. The same values are the .demos
// tokens in demos.css (--night, --star and the rest, and the light block's),
// for use in stylesheets; coloursOf gives a view the set for its look. Orbits
// 3D and the City draw from COLORS alone: they are night scenes.

export interface Colours {
  /** The page background, and ink on marks of the other colour. */
  night: string;
  /** Text and marks. */
  star: string;
  /** Secondary text, axes, guides. */
  dim: string;
  /** You, and the other person, wherever the two are told apart. */
  me: string;
  them: string;
  /** Moving in and moving out (Orbits' comet trails). */
  warm: string;
  cool: string;
  /** A person in no friend group. */
  loner: string;
}

/** The night's colours, tuned for its dark ground. */
export const COLORS: Colours = {
  night: "#070b16",
  star: "#e8eefc",
  dim: "#8d97ad",
  me: "#f4b860",
  them: "#6fd0c6",
  warm: "#ff9e5e",
  cool: "#6aa8ff",
  loner: "#8a93a6",
};

/**
 * Paper's: the console's white and its inks (its --c-page, --c-text and
 * --c-muted), and the sun's orange, the teal, the warm and the cool each
 * darkened to read on white.
 */
export const PAPER: Colours = {
  night: "#ffffff",
  star: "#0f0f0f",
  dim: "#6b6b6b",
  me: "#d9822b",
  them: "#0f8f86",
  warm: "#e8732a",
  cool: "#2f6fde",
  loner: "#8a8f99",
};

/** The colours a view draws in: Paper's on the light look, the night's otherwise. */
export function coloursOf(light: boolean): Colours {
  return light ? PAPER : COLORS;
}

/** One colour per friend group (DemoPerson.community), biggest group first. */
const COMMUNITY = [
  "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#a6da95", "#f5a97f",
  "#8bd5ca", "#b7bdf8", "#eed49f", "#91d7e3", "#f0c6c6", "#c6a0f6",
];

export function communityColor(community: number): string {
  return community < 0 ? COLORS.loner : COMMUNITY[community % COMMUNITY.length];
}
