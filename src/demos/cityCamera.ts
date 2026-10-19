// The City's camera (City.tsx): how the ground laid out in cityLayout.ts is
// seen. The city is viewed orthographically from above at an angle, as Google
// Maps' 3D view is: a bearing turns the city round the tower, and a tilt
// leans the view from straight down (a map) to a low oblique that shows the
// buildings' sides. Nothing here touches the DOM, so the maths can be tested
// on its own: where a ground point at some height is drawn, the ground point
// under a drawn spot, which of two buildings is nearer the viewer, the
// corners and faces of a building as seen, and how big a name fits on a roof.
//
// Coordinates: the ground is a map seen from above, x to the right and y down
// as on Orbits, the tower at (0, 0); `project` turns a ground point `h` units
// up into where it is drawn, unzoomed, relative to the tower's foot, with the
// viewer at the bottom of the screen looking in.

import type { Box } from "./orbitsLayout.ts";
import type { CityLayout, Plot } from "./cityLayout.ts";

/** Where the city is seen from: turned `bearing` radians clockwise about the tower, and leaned `tilt` radians from straight down. */
export interface Camera {
  bearing: number;
  tilt: number;
}

/** How far the view may lean: from straight down (a map, no sides seen) to a low oblique. */
export const TILT_MIN = 0;
export const TILT_MAX = (70 * Math.PI) / 180;

/**
 * How the city first appears: north up and leaned 60 degrees, so a circle on
 * the ground draws as an ellipse half as tall as it is wide (the classic 2:1
 * isometric view) and buildings show a roof and two sides while the city
 * still reads as a map.
 */
export const HOME_CAMERA: Camera = { bearing: 0, tilt: Math.PI / 3 };

/** How much the ground is foreshortened, 1 straight down: a circle's height as a share of its width. */
export const squash = (camera: Camera): number => Math.cos(camera.tilt);
/** How much of a height shows: 0 straight down, nearly all at a low oblique. */
export const lift = (camera: Camera): number => Math.sin(camera.tilt);

/** `camera` with the tilt within bounds and the bearing wrapped to (−π, π]. */
export function clampCamera(camera: Camera): Camera {
  return { bearing: wrapAngle(camera.bearing), tilt: Math.min(TILT_MAX, Math.max(TILT_MIN, camera.tilt)) };
}

/** `a` wrapped to (−π, π]. */
export function wrapAngle(a: number): number {
  const w = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  return w <= -Math.PI ? w + 2 * Math.PI : w;
}

/** How far a mouse drag of one pixel turns (sideways) or tilts (up and down) the camera, in radians. */
export const TURN_PER_PX = Math.PI / 600;
export const TILT_PER_PX = Math.PI / 600;

/**
 * `from` after a camera drag of (`dx`, `dy`) pixels: sideways turns the city
 * round the tower the way the pointer goes (dragging the near side of the
 * city to the right turns it that way); up leans the view further, down
 * brings it back toward straight down. Within bounds (clampCamera).
 */
export function turnCamera(from: Camera, dx: number, dy: number): Camera {
  return clampCamera({ bearing: from.bearing - dx * TURN_PER_PX, tilt: from.tilt - dy * TILT_PER_PX });
}

/** Two fingers on the screen, each relative to the tower's unzoomed spot. */
export type Fingers = readonly [{ x: number; y: number }, { x: number; y: number }];

/** A twist of two fingers smaller than this (radians), or a two-finger drag shorter than this (pixels), does nothing, so a pinch does not also turn or tilt. */
export const TWIST_DEADZONE = 0.05;
export const TILT_DEADZONE = 8;
/** How far a two-finger drag of one pixel up or down tilts the camera, in radians. */
export const TOUCH_TILT_PER_PX = Math.PI / 400;

/**
 * `from` after two fingers that were at `start` moved to `now`: twisting
 * them turns the city with them (a twist clockwise on the screen turns the
 * city clockwise), and dragging them up or down together tilts the view (up
 * leans it further), each beyond a small deadzone so a pinch alone does
 * neither. Within bounds (clampCamera).
 */
export function twistCamera(from: Camera, start: Fingers, now: Fingers): Camera {
  const heading = ([a, b]: Fingers) => Math.atan2(b.y - a.y, b.x - a.x);
  const twist = wrapAngle(heading(now) - heading(start));
  const dy = (now[0].y + now[1].y - start[0].y - start[1].y) / 2;
  return clampCamera({
    bearing: from.bearing + beyond(twist, TWIST_DEADZONE),
    tilt: from.tilt - beyond(dy, TILT_DEADZONE) * TOUCH_TILT_PER_PX,
  });
}

/** `v` past a deadzone of `dead` either way: 0 within it, and from there on counted from its edge, so nothing jumps. */
function beyond(v: number, dead: number): number {
  return Math.sign(v) * Math.max(0, Math.abs(v) - dead);
}

/** Part of the way, `e` from 0 to 1, from one camera to another, turning the short way round. */
export function cameraBetween(from: Camera, to: Camera, e: number): Camera {
  if (e >= 1) return clampCamera(to);
  return clampCamera({ bearing: from.bearing + wrapAngle(to.bearing - from.bearing) * e, tilt: from.tilt + (to.tilt - from.tilt) * e });
}

export type XY = { x: number; y: number };

/** The ground point (`x`, `y`) turned by the camera's bearing: x across the screen, y toward the viewer. */
export function turn(camera: Camera, x: number, y: number): XY {
  const [c, s] = [Math.cos(camera.bearing), Math.sin(camera.bearing)];
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Where a ground point (`x`, `y`) `h` units up is drawn, relative to the tower's foot, unzoomed. */
export function project(camera: Camera, x: number, y: number, h = 0): XY {
  const t = turn(camera, x, y);
  return { x: t.x, y: t.y * squash(camera) - h * lift(camera) };
}

/** The ground point under a drawn spot (relative to the tower's foot, unzoomed), taking it to be at ground level. */
export function unproject(camera: Camera, x: number, y: number): XY {
  const ty = y / Math.max(1e-9, squash(camera));
  const [c, s] = [Math.cos(camera.bearing), Math.sin(camera.bearing)];
  return { x: x * c + ty * s, y: -x * s + ty * c };
}

/** How near the viewer a ground point is: greater is nearer, and drawn later (paintOrder). */
export function depth(camera: Camera, x: number, y: number): number {
  return turn(camera, x, y).y;
}

/**
 * Everyone drawn in order from the back of the city to the front as the
 * camera sees it, so a nearer building covers one behind it. By the centre
 * of each footprint: as the layout keeps the circles round them apart, the
 * one whose centre is nearer the viewer is in front wherever the two overlap
 * on the screen, at any bearing.
 */
export function paintOrder(plots: Iterable<Plot>, camera: Camera): Plot[] {
  return [...plots].sort((a, b) => depth(camera, a.x, a.y) - depth(camera, b.x, b.y) || a.id - b.id);
}

/**
 * A building as seen: the four corners of its roof and of its foot (north,
 * east, south and west on the ground, in that order), which corner is
 * nearest the viewer (`front`), its silhouette (a hexagon) for drawing and
 * picking, and its two visible faces as the screen has them, left and right.
 */
export interface Drawn {
  roof: XY[];
  foot: XY[];
  front: number;
  /** The corner furthest from the viewer (the roof's top on the screen), and the two beside, as the screen has them. */
  back: number;
  leftCorner: number;
  rightCorner: number;
  outline: XY[];
  left: XY[];
  right: XY[];
  /** The box round the silhouette. */
  box: Box;
}

/** The corners of a footprint of half-diagonal `s` at (`x`, `y`): north, east, south, west. */
export function corners(x: number, y: number, s: number): XY[] {
  return [{ x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y }];
}

/** A building of half-diagonal `s` and height `h` at (`x`, `y`) on the ground, as `camera` sees it, unzoomed. */
export function drawnBuilding(camera: Camera, x: number, y: number, s: number, h: number): Drawn {
  const ground = corners(x, y, s);
  const foot = ground.map((p) => project(camera, p.x, p.y));
  const roof = ground.map((p) => project(camera, p.x, p.y, h));
  let front = 0;
  for (let i = 1; i < 4; i++) if (foot[i].y > foot[front].y) front = i;
  const back = (front + 2) % 4;
  const [a, b] = [(front + 1) % 4, (front + 3) % 4];
  const [l, r] = foot[a].x <= foot[b].x ? [a, b] : [b, a];
  const outline = [roof[back], roof[l], foot[l], foot[front], foot[r], roof[r]];
  const box = { left: foot[l].x, right: foot[r].x, top: Math.min(roof[back].y, roof[l].y, roof[r].y), bottom: foot[front].y };
  return {
    roof, foot, front, back, leftCorner: l, rightCorner: r, outline, box,
    left: [foot[l], foot[front], roof[front], roof[l]],
    right: [foot[front], foot[r], roof[r], roof[front]],
  };
}

/** Whether a point is inside a polygon (even–odd). */
export function inPolygon(p: XY, polygon: readonly XY[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * How far the city reaches from the tower's foot as `camera` sees it, drawn
 * unzoomed: a box round the disc of ground the buildings stand on (out to
 * the furthest building's far corner, whichever way the city is turned) and
 * the tallest of them, with `margin` over the roofs for what is drawn above
 * them. The disc is the same at every bearing, so this costs nothing as the
 * camera turns.
 */
export function cityExtent(layout: CityLayout, camera: Camera, margin = 24): Box {
  let reach = layout.tower.s;
  let tallest = layout.tower.h;
  for (const plot of layout.plots.values()) {
    reach = Math.max(reach, plot.r + plot.s);
    tallest = Math.max(tallest, plot.h);
  }
  return { left: -reach, right: reach, top: -reach * squash(camera) - tallest * lift(camera) - margin, bottom: reach * squash(camera) };
}

/** The share of a roof's half-diagonal a name may use: a little short of the edges. */
const ROOF_MARGIN = 0.9;

/**
 * The biggest type, in ground units, for a name painted on the roof of a
 * building of half-diagonal `s`: the name runs across the screen (so it
 * reads the same whichever way the city is turned) in a line `widthPerHeight`
 * times as wide as it is tall, centred on the roof, and must fit inside the
 * roof's square as the bearing turns it. The square is centred and symmetric,
 * so the line fits when its corners clear every edge: each edge, at distance
 * s/√2 from the centre with its normal at `bearing` + 45° + k·90°, allows a
 * type size of √2·s / (widthPerHeight·|cos| + |sin|) of that normal, and the
 * smallest of those wins. Straight on (bearing 0) the roof is a diamond,
 * whose full width across carries a long name best; turned 45° it is a
 * square, which carries a short one best.
 */
export function roofType(s: number, bearing: number, widthPerHeight: number): number {
  const theta = bearing + Math.PI / 4;
  const [c, sn] = [Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta))];
  return (Math.SQRT2 * s * ROOF_MARGIN) / Math.max(widthPerHeight * c + sn, widthPerHeight * sn + c);
}

/** A line of type's height, as a share of its size, when names stack on a roof. */
export const LINE_HEIGHT = 1.15;

/**
 * The biggest type, in ground units, for a name of several lines stacked on
 * a roof of half-diagonal `s`, each line `widths[i]` times as wide as the
 * type is tall: the block of lines must fit as roofType has one line fit. A
 * long name on two lines often fits bigger than on one.
 */
export function roofLines(s: number, bearing: number, widths: readonly number[]): number {
  const h = widths.length * LINE_HEIGHT;
  return roofType(s, bearing, Math.max(...widths) / h) / h;
}
