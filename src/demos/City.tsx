// City, at /city: Orbits' closeness as a neon city seen from above at an
// angle, in the manner of Tron. Your tower stands in the middle, lit
// amber; whoever you live with has a lit floor in it, in their own colour;
// everyone else is a building on a dark grid round it, nearer the tower the
// closer they are, by closeness rank on the scale Orbits uses, with ring
// roads (avenues) round the closest 10, 25, 50 and so on. A building's height
// is their closeness score, its footprint how much you have talked, both
// tapering away past the closest few hundred to dots at the edge, and its
// neon edges their identicon's colour, the closest tier brightest and the
// rest fainter tier by tier as on Orbits. Names are painted on the roofs,
// where a roof is big enough on the screen to carry one, of as many of the
// closest as the City's Show top names says (everyone's until another is chosen;
// topNames.ts). A beacon pulses on
// the roof of everyone you should reach out to, and light runs down
// the roads to the tower from everyone you have talked with this week.
// Hovering a building shows their card, clicking opens their panel, and
// whoever's panel is open stays picked out with lines on the ground to the
// people they share group chats with. It zooms and pans as Orbits does
// (orbitsZoom.ts: the wheel or a pinch, a drag, the + − 0 keys), and the
// camera turns and tilts like Google Maps' (cityCamera.ts: a drag with the
// middle or right button or with Ctrl held, two fingers twisted or dragged
// up and down, and a compass to put it back). The geometry is in
// cityLayout.ts.
//
// Drawn on three canvases rather than SVG: hundreds of buildings each have
// three faces, glowing edges and a name, and the light on the roads and the
// beacons move every frame; as SVG that is thousands of nodes restyled a
// frame, which a phone cannot keep up with, while a canvas redraws the whole
// city in a few milliseconds. The ground (grid, avenues, links, moving
// light) is the bottom canvas, redrawn every frame while anything moves; the
// buildings and names the middle one, redrawn only when the layout, zoom,
// camera or who is picked out changes; the beacons the top one, every frame.
// No WebGL: the Canvas 2D API draws all of this fast enough, turning
// included, and needs no shaders or library. No new dependencies.

import { easeCubicOut } from "d3";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { livesTogether } from "../archive.ts";
import { useNames } from "../names.ts";
import {
  cameraBetween, cityExtent, corners, depth, drawnBuilding, HOME_CAMERA, inPolygon, LINE_HEIGHT, paintOrder, project, roofLines, squash, turnCamera, twistCamera,
  type Camera, type Drawn, type XY,
} from "./cityCamera.ts";
import { scoreLabel } from "./closeness.ts";
import { avenues as avenueRoads, faces, GAP_ANGLE, layoutCity, NEON, neonOf, taper, TAPER_KNEE, tint, traffic, type Plot } from "./cityLayout.ts";
import { Compass } from "./Compass.tsx";
import { Curve } from "./Curve.tsx";
import { standing, trendAt, type DemoPerson } from "./model.ts";
import { focusLinksOf, focusOf, PHONE } from "./Orbits.tsx";
import { BACKGROUND, nameColour, personOpacity, TIER_FLOOR, TIERS } from "./orbitsLayout.ts";
import { clampZoom, HOME, MAX_ZOOM, panBy, pinchZoom, wheelFactor, ZOOM_STEP, zoomAt, zoomBetween, zoomToShow, type Fingers, type Zoom } from "./orbitsZoom.ts";
import { COLORS } from "./palette.ts";
import { glowLook, useReachGlow } from "./reachGlow.ts";
import { ringColours, ringShare } from "./ringColours.ts";
import { trendSummary, windowLabel } from "./trend.ts";
import { ALL, amongTop, useTopNames } from "./topNames.ts";
import { basicRows, fieldRows, Legend, number, Swatch, tipAt, type Demo, type ViewProps } from "./view.tsx";
import "./city.css";

/**
 * A name on a roof shows once its type stands at least this tall on the
 * screen (after the tilt squashes it), and grows no taller than NAME_MAX_PX
 * however far in; whoever is picked out gets theirs flat over the roof, at
 * full size, unless it already stands NAME_FOCUS_PX tall on the roof.
 */
export const NAME_MIN_PX = 8;
export const NAME_MAX_PX = 18;
export const NAME_FOCUS_PX = 11;
/** Light runs down the road from everyone you have talked with in the last this many days. */
export const TRAFFIC_DAYS = 7;
/** The most roads with light on them: the most recent. */
const TRAFFIC_MOST = 80;
/** How long one light takes to run from a building to the tower, in seconds, and a beacon's pulse. */
const TRAFFIC_S = 4;
const BEACON_S = 2.2;
/** How long the city takes to rise out of the ground when it first appears, in ms, and how much later the furthest building starts. */
const RISE_MS = 900;
const RISE_STAGGER_MS = 600;
/** How long a press of + or −, going back to the whole city, or the compass takes to glide there, in ms. */
const GLIDE_MS = 240;
/** How far in from the edges, in pixels, someone found with the find box counts as in view. */
const FIND_MARGIN = 60;
/** How far, in pixels, a mouse or a finger moves before a press is a drag. */
const DRAG_START = { mouse: 3, touch: 10 };
/** How long a finger held on someone takes to show their card, in ms. */
const HOLD_MS = 400;
/** How near, in pixels, the pointer (or a finger, further) must come to a small building's foot to pick it. */
const REACH = { mouse: 12, touch: 24 };
/** The type of the names, the tower's "you" and the avenue labels. */
const SIGN_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const SIGN_SIZE = 12.5;
/** Canvases are drawn no sharper than this, so a phone's 3× screen does not triple the work. */
const MAX_DPR = 2;
/** A building drawn narrower than this many pixels is a dot: one shape, no faces or glow, so a tapered crowd of hundreds costs little. */
const DOT_PX = 5;

type Layer = { canvas: HTMLCanvasElement | null };

/** The zoom and the camera, kept while the page is open, so switching views and back keeps them. */
export const keptZoom: { current: Zoom } = { current: HOME };
export const keptCamera: { current: Camera } = { current: HOME_CAMERA };

/** How wide each name is, as a share of its type size, measured once. */
const TYPE_WIDTHS = new Map<string, number>();

/**
 * Whose roof may carry their name (`rank` their closeness rank, 0 for none yet): the closest `named` (the City's Top
 * names, topNames.ts), everyone to reach out to, and everyone who shares group chats with whoever is held
 * (`heldLinks`); with All, everyone.
 */
export function roofNamed(id: number, rank: number, { named, reachOut, heldLinks }: { named: number; reachOut: ReadonlySet<number>; heldLinks: ReadonlySet<number> }): boolean {
  return named === ALL || amongTop(rank, named) || reachOut.has(id) || heldLinks.has(id);
}

export function CityMap({ model, width, height, inset: top, hover, open, held = null, heldGroup = null, find = null }: ViewProps) {
  const at = model.months.length - 1;
  const names = useNames();
  // How many of the closest have their names on their roofs: the City's own Show top names (topNames.ts).
  const named = useTopNames("city");
  const phone = useMedia(PHONE);
  const reduced = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  const [hoverId, setHoverId] = useState<number | null>(null);

  // The stage: the tower's foot a little below the middle of the space under the header, the city's radius what fits
  // (its drawn height is about 1.1 radii: the tower above, the ground's ellipse below).
  const area = height - top - 44;
  const outer = Math.max(90, Math.min(width / 2 - (phone ? 20 : 70), (area - 60) / 1.1));
  const inner = Math.max(34, outer * 0.16);
  const cx = width / 2;
  const cy = top + area / 2 + outer * 0.04 + 6;
  const count = model.people.length;

  const residents = useMemo(
    () => model.people.map((p) => ({ id: p.id, name: p.name, rank: p.rank[at] ?? 0, closeness: p.closeness[at] ?? 0, total: p.total, together: livesTogether(p) })),
    [model.people, at],
  );
  const layout = useMemo(() => layoutCity(residents, { inner, outer }), [residents, inner, outer]);
  const byId = useMemo(() => new Map(model.people.map((p) => [p.id, p])), [model.people]);
  const standings = useMemo(() => new Map(model.people.map((p) => [p.id, standing(p, at, model)])), [model, at]);
  const neon = useMemo(() => new Map(model.people.map((p) => [p.id, neonOf(p.identiconSeed, p.identiconHue)])), [model.people]);
  const signColours = useMemo(() => new Map(model.people.map((p) => [p.id, nameColour(p.identiconSeed, p.identiconHue)])), [model.people]);
  const reachOut = useMemo(() => new Set(model.people.filter((p) => p.shouldReachOut).map((p) => p.id)), [model.people]);
  // How strongly their beacons shine (reachGlow.ts), as the other views' glows: their light and ring wider and brighter.
  const reachGlow = useReachGlow();
  const glow = useMemo(() => glowLook(reachGlow), [reachGlow]);
  const streams = useMemo(
    () => traffic(model.people.map((p) => ({ id: p.id, daysSince: standings.get(p.id)!.daysSince })), TRAFFIC_DAYS)
      .sort((a, b) => (standings.get(a.id)!.daysSince ?? 0) - (standings.get(b.id)!.daysSince ?? 0) || a.id - b.id)
      .slice(0, TRAFFIC_MOST),
    [model.people, standings],
  );

  // The camera (cityCamera.ts): turned and tilted by a drag, back to HOME_CAMERA by the compass.
  const [camera, setCamera] = useState(() => keptCamera.current);
  useEffect(() => void (keptCamera.current = camera), [camera]);
  const sq = squash(camera);
  // Everyone from the back of the city to the front as the camera sees it, the tower (null) in its place among them.
  const scene = useMemo((): Array<Plot | null> => {
    const order = paintOrder(layout.plots.values(), camera);
    const towerAt = order.findIndex((p) => depth(camera, p.x, p.y) > 0);
    return towerAt < 0 ? [...order, null] : [...order.slice(0, towerAt), null, ...order.slice(towerAt)];
  }, [layout, camera]);
  const extent = useMemo(() => cityExtent(layout, camera), [layout, camera]);

  // Who is picked out: whoever's panel is open, else the person under the pointer; their group-chat links.
  const focusId = focusOf(hoverId, held, (id) => layout.plots.has(id) || layout.together.includes(id));
  const focusLinks = useMemo(() => focusLinksOf(model, focusId, held, heldGroup), [model, focusId, held, heldGroup]);
  const linked = useMemo(() => new Set(focusLinks.map((l) => (l.source === focusId ? l.target : l.source))), [focusLinks, focusId]);
  const strength = (id: number, rank: number) =>
    focusId === null ? personOpacity(rank > 0 ? rank : null, reachOut.has(id), { lift: glow.lift }) : id === focusId ? 1 : linked.has(id) ? 0.7 : BACKGROUND;

  // The zoom (orbitsZoom.ts): asked for, kept within the city's reach.
  const [asked, setAsked] = useState(() => keptZoom.current);
  const zoom = clampZoom(asked, extent);
  useEffect(() => void (keptZoom.current = zoom), [zoom.k, zoom.x, zoom.y]);
  const { k } = zoom;
  const origin = { x: cx + zoom.x, y: cy + zoom.y };

  // The city rises out of the ground when it first appears: 0 to 1 per building, the nearest first.
  const risen = useRef(reduced);
  const riseStart = useRef(0);
  const riseOf = (plot: Plot, now: number): number => {
    if (risen.current) return 1;
    const delay = (RISE_STAGGER_MS * Math.max(0, plot.r - inner)) / Math.max(1, outer - inner);
    return easeCubicOut(Math.min(1, Math.max(0, (now - riseStart.current - delay) / RISE_MS)));
  };

  const groundRef = useRef<HTMLCanvasElement>(null);
  const townRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);

  /** A canvas's context, cleared, scaled to the screen, and moved to the tower's foot as zoomed; drawing then multiplies places by k. */
  const begin = (layer: Layer): CanvasRenderingContext2D | null => {
    const ctx = layer.canvas?.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(origin.x, origin.y);
    return ctx;
  };
  const S = (p: XY): XY => ({ x: p.x * k, y: p.y * k });
  /** Where a ground point `h` up is drawn, zoomed, relative to the tower's foot. */
  const P = (x: number, y: number, h = 0): XY => S(project(camera, x, y, h));
  const onPage = (p: XY, margin: number) => {
    const [x, y] = [origin.x + p.x, origin.y + p.y];
    return x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
  };
  const poly = (ctx: CanvasRenderingContext2D, points: XY[]) => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };
  const towerDrawn = useMemo(() => drawnBuilding(camera, 0, 0, layout.tower.s, layout.tower.h), [layout, camera]);
  // Every building's shape at full height, for picking: made once per layout and camera, on the first pick (not as
  // the camera turns, when nothing is picked), and not per pointer move.
  const shapesFor = useRef<{ layout: typeof layout; camera: Camera; shapes: Map<number, Drawn> } | null>(null);
  const shapes = (): Map<number, Drawn> => {
    const kept = shapesFor.current;
    if (kept && kept.layout === layout && kept.camera === camera) return kept.shapes;
    const made = new Map([...layout.plots.values()].map((plot) => [plot.id, drawnBuilding(camera, plot.x, plot.y, plot.s, plot.h)]));
    shapesFor.current = { layout, camera, shapes: made };
    return made;
  };
  const floorOf = (id: number) => layout.tower.floors.find((f) => f.id === id);
  /** A floor's band on the tower's two visible faces, as drawn: the left face, the right face, both together, and the near corner's middle (for its name on it). */
  const floorBands = (floor: { bottom: number; top: number }) => {
    const g = corners(0, 0, layout.tower.s);
    const { front, leftCorner: l, rightCorner: r } = towerDrawn;
    const at = (i: number, h: number) => P(g[i].x, g[i].y, h);
    return {
      left: [at(l, floor.bottom), at(front, floor.bottom), at(front, floor.top), at(l, floor.top)],
      right: [at(front, floor.bottom), at(r, floor.bottom), at(r, floor.top), at(front, floor.top)],
      band: [at(l, floor.bottom), at(front, floor.bottom), at(r, floor.bottom), at(r, floor.top), at(front, floor.top), at(l, floor.top)],
      middle: at(front, (floor.bottom + floor.top) / 2),
    };
  };

  // The ground: the grid, the avenues, the lines to whoever is picked out's group-chat friends, and the light on the roads.
  const drawGround = (now: number) => {
    const ctx = begin({ canvas: groundRef.current });
    if (!ctx) return;
    const R = (outer + 40) * k;
    // The ground, fading out at its edge.
    const disc = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    disc.addColorStop(0, NEON.ground);
    disc.addColorStop(0.8, NEON.ground);
    disc.addColorStop(1, tint(NEON.ground, 0));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * sq, 0, 0, 2 * Math.PI);
    ctx.fillStyle = disc;
    ctx.fill();
    ctx.clip();
    // The grid: two families of lines along the buildings' diagonals, turning with the city, fading to the edge.
    const step = (outer / 7) * k;
    ctx.lineWidth = 1;
    ctx.strokeStyle = tint(NEON.grid, 0.13);
    ctx.beginPath();
    for (let c = -R * 2; c <= R * 2; c += step) {
      // A line of the ground where x + y = c runs through (c/2, c/2) along (1, -1); where x − y = c through (c/2, −c/2) along (1, 1).
      for (const sign of [1, -1]) {
        const [px, py] = [c / 2, (sign * c) / 2];
        const [dx, dy] = [1, -sign];
        const a = P(px - dx * 4 * R, py - dy * 4 * R);
        const b = P(px + dx * 4 * R, py + dy * 4 * R);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
    ctx.stroke();
    const fade = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
    fade.addColorStop(0, tint(NEON.night, 0));
    fade.addColorStop(1, tint(NEON.night, 0.9));
    ctx.fillStyle = fade;
    ctx.fillRect(-R, -R, 2 * R, 2 * R);
    ctx.restore();
    // The avenues: a glowing line each, in its ring's colour, fainter outward (ringColours.ts).
    for (const road of layout.avenues) {
      const fade = 1 - 0.45 * ringShare(road.rank);
      for (const [w, a] of [[5, 0.1], [1.2, 0.55]]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, road.r * k, road.r * k * sq, 0, 0, 2 * Math.PI);
        ctx.lineWidth = w;
        ctx.strokeStyle = tint(ringColours(road.rank).colour, a * fade);
        ctx.stroke();
      }
    }
    // The plaza round the tower, lit by it.
    const plaza = ctx.createRadialGradient(0, 0, 0, 0, 0, inner * k);
    plaza.addColorStop(0, tint(NEON.me, 0.35));
    plaza.addColorStop(1, tint(NEON.me, 0));
    ctx.beginPath();
    ctx.ellipse(0, 0, inner * k, inner * k * sq, 0, 0, 2 * Math.PI);
    ctx.fillStyle = plaza;
    ctx.fill();
    // Lines on the ground to the people whoever is picked out shares group chats with.
    const footOf = (id: number): XY | null => {
      const plot = layout.plots.get(id);
      if (plot) return P(plot.x, plot.y);
      return floorOf(id) ? { x: 0, y: 0 } : null;
    };
    if (focusId !== null) {
      const from = footOf(focusId);
      if (from) {
        ctx.lineCap = "round";
        for (const link of focusLinks) {
          const to = footOf(link.source === focusId ? link.target : link.source);
          if (!to) continue;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.lineWidth = Math.min(2.2, 0.6 + link.weight * 2.5);
          ctx.strokeStyle = tint(COLORS.star, 0.45);
          ctx.stroke();
        }
      }
    }
    // Light on the roads: from everyone you have talked with this week, a pulse of their colour running to the tower.
    ctx.lineCap = "round";
    const t = now / 1000 / TRAFFIC_S;
    for (const stream of streams) {
      const plot = layout.plots.get(stream.id);
      if (!plot) continue;
      const str = strength(stream.id, plot.rank);
      if (str <= BACKGROUND && focusId !== null) continue;
      const from = P(plot.x, plot.y);
      // To the tower's foot, stopping at its edge.
      const edge = (layout.tower.s * 0.85) / Math.max(1, plot.r);
      const to = P(plot.x * edge, plot.y * edge);
      if (!onPage(from, 40) && !onPage(to, 40)) continue;
      const p = ((t + stream.phase) % 1 + 1) % 1;
      const head = { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
      const q = Math.max(0, p - 0.14);
      const tail = { x: from.x + (to.x - from.x) * q, y: from.y + (to.y - from.y) * q };
      const colour = neon.get(stream.id)!;
      const glow = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      glow.addColorStop(0, tint(colour, 0));
      glow.addColorStop(1, tint(colour, 0.85 * str));
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = glow;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(head.x, head.y, 1.7, 0, 2 * Math.PI);
      ctx.fillStyle = tint("#ffffff", 0.9 * str);
      ctx.fill();
    }
  };

  // The town: the avenues' labels, every building with its faces, neon edges and the name on its roof, and the tower
  // with its lit floors, from the back of the city to the front.
  const drawTown = (now: number) => {
    const ctx = begin({ canvas: townRef.current });
    if (!ctx) return;
    ctx.lineJoin = "round";
    const unnamed = names.style === "hide";
    const label = (id: number) => (unnamed ? "" : names.mapLabel(byId.get(id)!).primary);
    const font = (px: number, bold = false) => `${bold ? 600 : 400} ${px.toFixed(2)}px ${SIGN_FONT}`;
    const spacing = (em: string) => void ("letterSpacing" in ctx && ((ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = em));
    spacing("0.02em");
    /** A flat label on the screen, outlined in the night so it reads over anything. */
    const text = (s: string, x: number, y: number, anchor: CanvasTextAlign, fill: string, alpha: number, scale = 1, bold = false) => {
      ctx.font = font(SIGN_SIZE * scale, bold);
      ctx.textAlign = anchor;
      ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = tint(NEON.night, 0.9);
      ctx.strokeText(s, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(s, x, y);
      ctx.globalAlpha = 1;
    };
    /** How wide a name is for each pixel of its type size. */
    const typeWidth = (s: string): number => {
      const kept = TYPE_WIDTHS.get(s);
      if (kept !== undefined) return kept;
      ctx.font = font(100);
      const w = ctx.measureText(s).width / 100;
      TYPE_WIDTHS.set(s, w);
      return w;
    };
    /** A name as one line, or as two (split at its last space) when that fits bigger type on the roof: the lines and the type size, in ground units. */
    const roofFit = (s: string, plot: Plot): { lines: string[]; size: number } => {
      const one = { lines: [s], size: roofLines(plot.s, camera.bearing, [typeWidth(s)]) };
      const at = s.lastIndexOf(" ");
      if (at <= 0 || at >= s.length - 1) return one;
      const lines = [s.slice(0, at), s.slice(at + 1)];
      const two = { lines, size: roofLines(plot.s, camera.bearing, lines.map(typeWidth)) };
      return two.size > one.size ? two : one;
    };
    const heldLinks: ReadonlySet<number> = held !== null && focusId === held ? linked : new Set();
    /**
     * A name painted on a roof: across the screen, squashed by the tilt as the roof is, as big as the roof allows
     * (roofLines, on one line or two) up to NAME_MAX_PX tall; or nothing if that would stand under NAME_MIN_PX, or
     * if they are not among those named (roofNamed). Whoever is picked out gets it flat and full size instead when
     * the roof cannot carry it NAME_FOCUS_PX tall; on a phone only they are named at all. Returns whether anything
     * was painted.
     */
    const roofName = (id: number, plot: Plot, centre: XY, str: number, picked: boolean): boolean => {
      const s = label(id);
      if (!s || (phone && !picked) || (!picked && !roofNamed(id, plot.rank, { named, reachOut, heldLinks }))) return false;
      const fit = roofFit(s, plot);
      const standing = fit.size * k * sq;
      if (picked && standing < NAME_FOCUS_PX) {
        text(s, centre.x, centre.y + 4, "center", signColours.get(id)!, 1, 1, true);
        return true;
      }
      if (standing < NAME_MIN_PX) return false;
      const px = Math.min(standing, NAME_MAX_PX) / sq;
      ctx.save();
      ctx.translate(centre.x, centre.y);
      ctx.scale(1, sq);
      ctx.font = font(px, picked);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = str;
      ctx.lineWidth = Math.min(2.5, px / 5);
      ctx.strokeStyle = tint(NEON.night, 0.7);
      ctx.fillStyle = signColours.get(id)!;
      fit.lines.forEach((line, i) => {
        const y = (i - (fit.lines.length - 1) / 2) * LINE_HEIGHT * px;
        ctx.strokeText(line, 0, y);
        ctx.fillText(line, 0, y);
      });
      ctx.restore();
      ctx.globalAlpha = 1;
      return true;
    };
    /** The silhouette, the roof's near edges and the near corner: a building's neon. */
    const edges = (w: Drawn) => {
      poly(ctx, w.outline);
      ctx.moveTo(w.roof[w.leftCorner].x, w.roof[w.leftCorner].y);
      ctx.lineTo(w.roof[w.front].x, w.roof[w.front].y);
      ctx.lineTo(w.roof[w.rightCorner].x, w.roof[w.rightCorner].y);
      ctx.moveTo(w.roof[w.front].x, w.roof[w.front].y);
      ctx.lineTo(w.foot[w.front].x, w.foot[w.front].y);
    };
    const scaled = (d: Drawn): Drawn => ({ ...d, roof: d.roof.map(S), foot: d.foot.map(S), outline: d.outline.map(S), left: d.left.map(S), right: d.right.map(S) });

    // The tower, yours: amber, its floors lit for whoever lives with you, the closest at the top.
    const drawTower = () => {
      const w = scaled(towerDrawn);
      const f = faces(NEON.me, 1);
      ctx.fillStyle = f.west;
      poly(ctx, w.left);
      ctx.fill();
      ctx.fillStyle = f.east;
      poly(ctx, w.right);
      ctx.fill();
      ctx.fillStyle = f.roof;
      poly(ctx, w.roof);
      ctx.fill();
      for (const floor of layout.tower.floors) {
        const str = strength(floor.id, byId.get(floor.id)?.rank[at] ?? 1);
        const colour = neon.get(floor.id)!;
        const band = floorBands(floor);
        ctx.fillStyle = tint(colour, 0.32 * str);
        poly(ctx, band.left);
        ctx.fill();
        ctx.fillStyle = tint(colour, 0.42 * str);
        poly(ctx, band.right);
        ctx.fill();
        for (const path of [band.left, band.right]) {
          ctx.beginPath();
          ctx.moveTo(path[0].x, path[0].y);
          ctx.lineTo(path[1].x, path[1].y);
          ctx.moveTo(path[3].x, path[3].y);
          ctx.lineTo(path[2].x, path[2].y);
          ctx.lineWidth = floor.id === focusId ? 1.6 : 1;
          ctx.strokeStyle = floor.id === focusId ? COLORS.star : tint(colour, 0.9 * str);
          ctx.stroke();
        }
      }
      edges(w);
      ctx.lineWidth = 7;
      ctx.strokeStyle = tint(NEON.me, 0.22);
      ctx.stroke();
      edges(w);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = NEON.me;
      ctx.stroke();
    };
    // "you" over the tower's top, and each floor's name centred on its floor, on the tower's near corner, over
    // everything, so no building in front hides them.
    const towerLabels = () => {
      const peak = S(towerDrawn.roof[towerDrawn.back]);
      text("you", peak.x, peak.y - 8, "center", NEON.me, 1, 1, true);
      if (unnamed) return;
      for (const floor of layout.tower.floors) {
        // Someone No name except… leaves out has no name, nor the line to it.
        if (!label(floor.id)) continue;
        const band = floorBands(floor);
        const str = strength(floor.id, byId.get(floor.id)?.rank[at] ?? 1);
        text(label(floor.id), band.middle.x, band.middle.y + 4, "center", signColours.get(floor.id)!, str, 1, floor.id === focusId);
      }
    };

    const view = { left: -origin.x, right: width - origin.x, top: -origin.y, bottom: height - origin.y };
    for (const plot of scene) {
      if (plot === null) {
        drawTower();
        continue;
      }
      const rise = riseOf(plot, now);
      const d = drawnBuilding(camera, plot.x, plot.y, plot.s, plot.h * rise);
      const box = { left: d.box.left * k, right: d.box.right * k, top: d.box.top * k, bottom: d.box.bottom * k };
      if (box.right < view.left - 4 || box.left > view.right + 4 || box.bottom < view.top - 4 || box.top > view.bottom + 4) continue;
      const str = strength(plot.id, plot.rank);
      const colour = neon.get(plot.id)!;
      const f = faces(colour, str);
      const lit = plot.id === focusId;
      // A building drawn smaller than a few pixels (the tapered crowd, zoomed out) is a dot: its silhouette once, no faces or glow.
      if (box.right - box.left < DOT_PX && !lit) {
        poly(ctx, d.outline.map(S));
        ctx.fillStyle = f.roof;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = tint(colour, plot.silent ? 0.5 * str : 0.95 * str);
        ctx.stroke();
        continue;
      }
      const w = scaled(d);
      ctx.fillStyle = f.west;
      poly(ctx, w.left);
      ctx.fill();
      ctx.fillStyle = f.east;
      poly(ctx, w.right);
      ctx.fill();
      ctx.fillStyle = f.roof;
      poly(ctx, w.roof);
      ctx.fill();
      if (str >= TIERS[2].opacity || lit) {
        edges(w);
        ctx.lineWidth = lit ? 6 : 4;
        ctx.strokeStyle = tint(colour, (lit ? 0.3 : 0.16) * str);
        ctx.stroke();
      }
      edges(w);
      ctx.lineWidth = lit ? 1.6 : 1;
      ctx.strokeStyle = lit ? COLORS.star : tint(colour, plot.silent ? 0.5 * str : 0.95 * str);
      ctx.stroke();
      roofName(plot.id, plot, P(plot.x, plot.y, plot.h * rise), str, lit);
    }

    // The avenues' labels, each where the layout leaves the ring of buildings a gap (GAP_ANGLE).
    for (const road of layout.avenues) {
      const p = P(Math.cos(GAP_ANGLE) * road.r, Math.sin(GAP_ANGLE) * road.r);
      spacing("0.08em");
      text(road.label.toUpperCase(), p.x, p.y + 3.5, "center", ringColours(road.rank).label, 1, 0.8);
      spacing("0.02em");
    }
    towerLabels();

  };

  // The sky: a beacon on the roof of everyone you should reach out to, pulsing in their colour; a floor of the tower pulses whole.
  // The Reach-out glow (glow) widens the light and the ring and brightens all three.
  const drawSky = (now: number) => {
    const ctx = begin({ canvas: skyRef.current });
    if (!ctx) return;
    const t = now / 1000 / BEACON_S;
    for (const id of reachOut) {
      const colour = neon.get(id)!;
      const plot = layout.plots.get(id);
      const phase = ((id * 0.7548776662) % 1 + 1) % 1;
      const p = ((t + phase) % 1 + 1) % 1;
      if (plot) {
        const str = strength(id, plot.rank);
        if (str <= BACKGROUND && focusId !== null) continue;
        const rise = riseOf(plot, now);
        const roof = P(plot.x, plot.y, plot.h * rise);
        if (!onPage(roof, 30)) continue;
        // The mast's light, and a ring spreading from it.
        ctx.beginPath();
        ctx.arc(roof.x, roof.y, 5 * glow.bright, 0, 2 * Math.PI);
        ctx.fillStyle = tint(colour, 0.25 * glow.bright * str);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(roof.x, roof.y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = tint("#ffffff", 0.95 * str);
        ctx.fill();
        ctx.beginPath();
        const ring = 3 + 16 * glow.reach * p;
        ctx.ellipse(roof.x, roof.y, ring, ring * sq, 0, 0, 2 * Math.PI);
        ctx.lineWidth = 1.2 * glow.bright;
        ctx.strokeStyle = tint(colour, Math.min(1, (1 - p) * 0.8 * glow.bright) * str);
        ctx.stroke();
      } else {
        const floor = floorOf(id);
        if (!floor) continue;
        const str = strength(id, byId.get(id)?.rank[at] ?? 1);
        const band = floorBands(floor);
        ctx.fillStyle = tint(colour, 0.22 * glow.bright * str * (0.5 + 0.5 * Math.sin(p * 2 * Math.PI)));
        poly(ctx, band.left);
        ctx.fill();
        poly(ctx, band.right);
        ctx.fill();
      }
    }
  };

  // Drawing. The town is drawn when what it shows changes; the ground and the sky every frame while anything moves
  // (light on the roads, beacons, the city rising), else once.
  const draw = useRef({ ground: drawGround, town: drawTown, sky: drawSky });
  draw.current = { ground: drawGround, town: drawTown, sky: drawSky };
  const moving = !reduced && (streams.length > 0 || reachOut.size > 0 || !risen.current);
  useEffect(() => {
    if (riseStart.current === 0) riseStart.current = performance.now();
    draw.current.town(performance.now());
  }, [scene, zoom.k, zoom.x, zoom.y, width, height, dpr, focusId, linked, names, named, phone, reachOut, neon, signColours, held, glow]);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      draw.current.ground(now);
      draw.current.sky(now);
      if (!risen.current) {
        draw.current.town(now);
        if (now - riseStart.current > RISE_MS + RISE_STAGGER_MS + 50) {
          risen.current = true;
          draw.current.town(now);
        }
      }
      if (moving || !risen.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Where animation frames stall (a tab in the background, a browser driven by a tool), land the city anyway.
    const fallback = setTimeout(() => {
      if (risen.current) return;
      risen.current = true;
      const now = performance.now();
      draw.current.ground(now);
      draw.current.town(now);
      draw.current.sky(now);
    }, RISE_MS + RISE_STAGGER_MS + 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
    };
  }, [moving, scene, zoom.k, zoom.x, zoom.y, width, height, dpr, focusId, focusLinks, streams, reachOut, neon, glow]);

  // Picking: the building under the pointer, the front one where they overlap, or a floor of the tower; else the
  // nearest building's foot within `reach` pixels, so the smallest are easy to catch.
  const pick = (event: { clientX: number; clientY: number }, reach = REACH.mouse): DemoPerson | null => {
    const box = wrapRef.current!.getBoundingClientRect();
    const p = { x: (event.clientX - box.left - origin.x) / k, y: (event.clientY - box.top - origin.y) / k };
    const drawn = shapes();
    for (let i = scene.length - 1; i >= 0; i--) {
      const plot = scene[i];
      if (plot === null) {
        if (!inPolygon(p, towerDrawn.outline)) continue;
        for (const floor of layout.tower.floors) if (inPolygon(S(p), floorBands(floor).band)) return byId.get(floor.id) ?? null;
        return null;
      }
      const d = drawn.get(plot.id)!;
      if (p.x < d.box.left || p.x > d.box.right || p.y < d.box.top || p.y > d.box.bottom) continue;
      if (inPolygon(p, d.outline)) return byId.get(plot.id) ?? null;
    }
    let best: { id: number; d: number } | null = null;
    for (const plot of layout.plots.values()) {
      const foot = project(camera, plot.x, plot.y);
      const d = Math.hypot((foot.x - p.x) * k, (foot.y - p.y) * k);
      if (d <= reach + plot.s * k && (!best || d < best.d)) best = { id: plot.id, d };
    }
    return best ? byId.get(best.id) ?? null : null;
  };
  const card = (person: DemoPerson, event: { clientX: number; clientY: number; pointerType?: string }) => {
    if (hoverId !== person.id) setHoverId(person.id);
    const s = standings.get(person.id)!;
    const rank = person.rank[at];
    hover(tipAt(event, person, [
      ["Closeness", rank === 0 ? "none yet" : `#${number(rank)} of ${number(count)} (score ${scoreLabel(person.closeness[at])})`],
      ...fieldRows(person),
      ...basicRows(person, s),
      [windowLabel(model.settings.trendMonths), trendSummary(trendAt(person, at, model))],
    ]));
  };
  const unhover = () => {
    setHoverId(null);
    hover(null);
  };

  // Zooming and panning, as Orbits: the wheel or a trackpad pinch about the pointer, a drag of empty ground, + − 0
  // about the middle; on a touch screen two fingers pinch, one drags, a tap opens someone and a finger held on them
  // shows their card. Turning and tilting: a drag with the middle or right button or with Ctrl held, two fingers
  // twisted or dragged up and down; the compass puts the camera back.
  const live = useRef({ extent, origin: { x: cx, y: cy }, hovering: hoverId !== null, unhover });
  live.current = { extent, origin: { x: cx, y: cy }, hovering: hoverId !== null, unhover };
  const motion = useRef<{ glide: number; fallback: ReturnType<typeof setTimeout> | undefined }>({ glide: 0, fallback: undefined });
  const finding = useRef<number | null>(null);
  const touch = useRef<{
    fingers: Map<number, { clientX: number; clientY: number }>;
    pinch: { from: Zoom; fromCamera: Camera; start: Fingers; last: Zoom } | null;
    peek: ReturnType<typeof setTimeout> | undefined;
    peeking: boolean;
    used: boolean;
  }>({ fingers: new Map(), pinch: null, peek: undefined, peeking: false, used: false });
  const stopGlide = () => {
    cancelAnimationFrame(motion.current.glide);
    clearTimeout(motion.current.fallback);
  };
  const glide = (step: (e: number) => void) => {
    stopGlide();
    if (reduced) return step(1);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / GLIDE_MS);
      step(easeCubicOut(p));
      if (p < 1) motion.current.glide = requestAnimationFrame(tick);
    };
    motion.current.glide = requestAnimationFrame(tick);
    motion.current.fallback = setTimeout(() => {
      cancelAnimationFrame(motion.current.glide);
      step(1);
    }, GLIDE_MS + 300);
  };
  const middle = { x: 0, y: (top + height) / 2 - cy };
  const zoomBy = (factor: number) => {
    finding.current = null;
    const from = zoom;
    glide((e) => setAsked(zoomAt(from, factor ** e, middle, extent)));
  };
  const goHome = () => {
    finding.current = null;
    const from = zoom;
    glide((e) => setAsked({ k: from.k ** (1 - e), x: from.x * (1 - e), y: from.y * (1 - e) }));
  };
  const resetCamera = () => {
    const from = camera;
    glide((e) => setCamera(cameraBetween(from, HOME_CAMERA, e)));
  };
  const keys = useRef({ zoomBy, goHome });
  keys.current = { zoomBy, goHome };

  // Someone picked in the find box is brought into view, zoomed in far enough for their building to read.
  useEffect(() => {
    finding.current = find?.id ?? null;
  }, [find]);
  useEffect(() => {
    const id = finding.current;
    if (id === null) return;
    const plot = layout.plots.get(id);
    const spot = plot ? project(camera, plot.x, plot.y, plot.h / 2) : floorOf(id) ? project(camera, 0, 0, layout.tower.h / 2) : null;
    if (!spot) return;
    const least = plot ? Math.min(MAX_ZOOM, 14 / Math.max(2, 2 * plot.s)) : 1;
    const view = { left: FIND_MARGIN - cx, right: width - FIND_MARGIN - cx, top: top + FIND_MARGIN - cy, bottom: height - FIND_MARGIN - cy };
    const to = zoomToShow(zoom, spot, least, view, extent);
    if (to === zoom) return;
    const from = zoom;
    glide((e) => setAsked(zoomBetween(from, to, e)));
  }, [find, layout, width, height, top]);

  useEffect(() => {
    const el = wrapRef.current!;
    const zoomTo = (factor: number, event: { clientX: number; clientY: number }) => {
      stopGlide();
      finding.current = null;
      if (live.current.hovering) live.current.unhover();
      const { extent: reach, origin: o } = live.current;
      const box = el.getBoundingClientRect();
      const about = { x: event.clientX - box.left - o.x, y: event.clientY - box.top - o.y };
      setAsked((z) => zoomAt(clampZoom(z, reach), factor, about, reach));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(wheelFactor(event), event);
    };
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    let pinched = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      pinched = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      if (touch.current.fingers.size > 0) return;
      const { scale } = event as Gesture;
      zoomTo(scale / pinched, event as Gesture);
      pinched = scale;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if (event.key === "+" || event.key === "=") keys.current.zoomBy(ZOOM_STEP);
      else if (event.key === "-" || event.key === "_") keys.current.zoomBy(1 / ZOOM_STEP);
      else if (event.key === "0") keys.current.goHome();
      else return;
      event.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      window.removeEventListener("keydown", onKey);
      stopGlide();
      clearTimeout(touch.current.peek);
    };
  }, []);

  const drag = useRef<{ x: number; y: number; from: Zoom; moved: boolean } | null>(null);
  const turning = useRef<{ x: number; y: number; from: Camera } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragged = useRef(false);
  const fromOrigin = (finger: { clientX: number; clientY: number }) => {
    const box = wrapRef.current!.getBoundingClientRect();
    return { x: finger.clientX - box.left - cx, y: finger.clientY - box.top - cy };
  };
  const twoFingers = (): Fingers => {
    const [a, b] = [...touch.current.fingers.values()];
    return [fromOrigin(a), fromOrigin(b)];
  };
  const touchDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const fingers = touch.current;
    fingers.fingers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearTimeout(fingers.peek);
    if (fingers.fingers.size > 2) return;
    if (fingers.fingers.size === 2) {
      drag.current = null;
      fingers.peeking = false;
      stopGlide();
      finding.current = null;
      if (hoverId !== null) unhover();
      fingers.pinch = { from: zoom, fromCamera: camera, start: twoFingers(), last: zoom };
      return;
    }
    fingers.peeking = false;
    drag.current = { x: event.clientX, y: event.clientY, from: zoom, moved: false };
    const person = pick(event, REACH.touch);
    if (!person) return;
    const where = { clientX: event.clientX, clientY: event.clientY, pointerType: "touch" };
    fingers.peek = setTimeout(() => {
      fingers.peeking = true;
      card(person, where);
    }, HOLD_MS);
  };
  /** Two fingers pinch (and pan sideways), twist to turn the city and drag up or down to tilt it, all at once. */
  const twoFingerMove = () => {
    const pinch = touch.current.pinch!;
    const now = twoFingers();
    // The fingers' rise or fall tilts rather than pans: for the zoom, they are as high as they started.
    const risen = (now[0].y + now[1].y - pinch.start[0].y - pinch.start[1].y) / 2;
    const level: Fingers = [{ x: now[0].x, y: now[0].y - risen }, { x: now[1].x, y: now[1].y - risen }];
    setCamera(twistCamera(pinch.fromCamera, pinch.start, now));
    setAsked((pinch.last = pinchZoom(pinch.from, pinch.start, level, extent)));
  };
  const endTurn = () => {
    if (!turning.current) return false;
    turning.current = null;
    dragged.current = true;
    setDragging(false);
    return true;
  };

  const size = { width: Math.round(width * dpr), height: Math.round(height * dpr) };
  const style = { width, height };
  const home = camera.bearing === HOME_CAMERA.bearing && camera.tilt === HOME_CAMERA.tilt;
  return (
    <>
      <div
        ref={wrapRef}
        className="city"
        style={{ ...style, cursor: dragging ? "grabbing" : hoverId !== null ? "pointer" : k > 1 ? "grab" : undefined }}
        onPointerDown={(event) => {
          dragged.current = false;
          touch.current.used = event.pointerType === "touch";
          if (event.pointerType === "touch") return touchDown(event);
          if (event.button === 1 || event.button === 2 || event.ctrlKey) {
            // The middle button would scroll the page; Ctrl with the left is the right button on a Mac, and opens a menu.
            event.preventDefault();
            stopGlide();
            finding.current = null;
            if (hoverId !== null) unhover();
            turning.current = { x: event.clientX, y: event.clientY, from: camera };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(true);
            return;
          }
          if (event.button !== 0 || pick(event)) return;
          drag.current = { x: event.clientX, y: event.clientY, from: zoom, moved: false };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const fingers = touch.current;
          if (event.pointerType === "touch") {
            if (!fingers.fingers.has(event.pointerId)) return;
            fingers.fingers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
            if (fingers.pinch) {
              if (fingers.fingers.size === 2) twoFingerMove();
              return;
            }
          }
          const turn = turning.current;
          if (turn) {
            setCamera(turnCamera(turn.from, event.clientX - turn.x, event.clientY - turn.y));
            return;
          }
          const pan = drag.current;
          if (pan) {
            const [dx, dy] = [event.clientX - pan.x, event.clientY - pan.y];
            if (!pan.moved && Math.hypot(dx, dy) < DRAG_START[event.pointerType === "touch" ? "touch" : "mouse"]) return;
            if (!pan.moved) {
              pan.moved = true;
              clearTimeout(fingers.peek);
              stopGlide();
              finding.current = null;
              setDragging(true);
              if (hoverId !== null) unhover();
            }
            setAsked(panBy(pan.from, dx, dy, extent));
            return;
          }
          if (event.pointerType === "touch") return;
          const person = pick(event);
          if (person) card(person, event);
          else if (hoverId !== null) unhover();
        }}
        onPointerUp={(event) => {
          const fingers = touch.current;
          if (event.pointerType === "touch") {
            fingers.fingers.delete(event.pointerId);
            clearTimeout(fingers.peek);
            if (fingers.pinch) {
              const [rest] = fingers.fingers.values();
              drag.current = fingers.fingers.size === 1 ? { x: rest.clientX, y: rest.clientY, from: fingers.pinch.last, moved: true } : null;
              fingers.pinch = null;
              dragged.current = true;
              return;
            }
            if (fingers.peeking) {
              fingers.peeking = false;
              dragged.current = true;
              drag.current = null;
              setDragging(false);
              unhover();
              return;
            }
          }
          if (endTurn()) return;
          dragged.current = drag.current?.moved ?? false;
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={(event) => {
          if (event.pointerType === "touch") {
            const fingers = touch.current;
            fingers.fingers.delete(event.pointerId);
            clearTimeout(fingers.peek);
            fingers.pinch = null;
            fingers.peeking = false;
            if (hoverId !== null) unhover();
          }
          endTurn();
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={() => {
          if (!drag.current && !turning.current) unhover();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          if (dragged.current) return;
          const person = touch.current.used ? pick(event, REACH.touch) : pick(event);
          if (person) open(person);
        }}
      >
        <canvas ref={groundRef} className="city__ground" {...size} style={style} aria-hidden />
        <canvas ref={townRef} className="city__town" {...size} style={style} role="img" aria-label={`A city of ${number(count)} people round you`} />
        <canvas ref={skyRef} className="city__sky" {...size} style={style} aria-hidden />
      </div>
      <Compass
        camera={camera}
        home={home}
        onReset={resetCamera}
        homeTitle="North up, tilted 60°. Drag with the middle or right button, or with Ctrl held, to turn and tilt the city (two fingers twist or drag up and down on a touch screen)"
        backTo="north up and the usual tilt"
      />
    </>
  );
}

/** Whether the window meets the media `query`, kept up to date as it changes. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [query]);
  return matches;
}

/** The taper's curve (cityLayout.ts' taper): size against closeness rank, on a log scale of rank, with 250 and 500 marked. */
export function TaperCurve({ count }: { count: number }) {
  const lg = Math.log10;
  const most = Math.max(2000, count);
  const pct = (rank: number) => `${Math.round(taper(rank, most) * 100)}%`;
  return (
    <Curve
      label={`How much smaller a building is the further out it stands: full size for the closest few hundred, half at rank ${number(TAPER_KNEE)}, a dot past a thousand`}
      x={{ min: 0, max: lg(most), ticks: [[0, "1"], [1, "10"], [2, "100"], [3, "1,000"]], title: "closeness rank" }}
      y={{ min: 0, max: 1, ticks: [[0, "dot"], [0.5, "half"], [1, "full"]], title: "size" }}
      lines={[{ f: (x) => taper(10 ** x, most) }]}
      marks={[
        { x: lg(250), y: taper(250, most), label: `250: ${pct(250)}`, anchor: "end" },
        { x: lg(500), y: taper(500, most), label: `500: ${pct(500)}`, anchor: "start" },
      ]}
    />
  );
}

/** The key, closed to a "Legend" button in the bottom-right corner until opened: what distance, height, brightness, footprint, the taper, colour, the beacons, the light on the roads and the camera mean. */
export function CityLegend({ avenues, count }: { avenues: string[]; count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="city-legend">
      <button type="button" className="city-legend__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide legend" : "Legend"}
      </button>
      {open && <Legend>
        <div><span className="city-key"><Swatch color={NEON.me} glow /></span> The tower: you; a lit floor each for whoever you live with</div>
        <div><span className="city-key city-key--avenue" aria-hidden /> Nearer the tower: closer, by closeness rank; the avenues ring the {avenues.length > 0 ? avenues.join(", ") : "closest few"}</div>
        <div>
          <svg className="city-key" width="30" height="16" aria-hidden>
            {[[4, 4], [13, 8], [22, 13]].map(([x, h]) => <rect key={x} x={x} y={15 - h} width="6" height={h} fill="none" stroke={COLORS.star} strokeWidth="1" />)}
          </svg>
          Taller: a higher closeness score
        </div>
        <div>
          <svg className="city-key" width="30" height="12" aria-hidden>
            {[TIERS[0].opacity, TIERS[2].opacity, TIER_FLOOR].map((o, i) => <rect key={i} x={3 + 9 * i} y="2" width="7" height="8" fill="none" stroke={COLORS.star} strokeWidth="1" opacity={o} />)}
          </svg>
          Brighter: closer; the outskirts' low slabs have no closeness yet
        </div>
        <div>
          <svg className="city-key" width="30" height="12" aria-hidden>
            {[[2, 5], [10, 7], [20, 9]].map(([x, w]) => <rect key={x} x={x} y="2" width={w} height="8" fill="none" stroke={COLORS.star} strokeWidth="1" />)}
          </svg>
          Wider: more messages
        </div>
        <div>
          <svg className="city-key" width="30" height="12" aria-hidden>
            {[[2, 9, 9], [14, 5, 5], [22, 2, 2]].map(([x, w, h]) => <rect key={x} x={x} y={11 - h} width={w} height={h} fill="none" stroke={COLORS.star} strokeWidth="1" />)}
          </svg>
          Smaller the further out, past the closest few hundred, to dots at the edge:
        </div>
        <div className="city-legend__curve"><TaperCurve count={count} /></div>
        <div><span className="city-key"><Swatch color={neonOf(KEY_SEED, null)} /></span> Neon: each person's identicon colour, their name on the roof tinted it; it means nothing else</div>
        <div><span className="city-key"><Swatch color={neonOf(KEY_SEED, null)} glow /></span> A beacon on the roof: should reach out</div>
        <div><span className="city-key city-key--light" aria-hidden /> Light on the road to the tower: talked in the last {TRAFFIC_DAYS} days</div>
        <div><span className="city-key city-key--line" aria-hidden /> Hover, or open a panel: lines to the people they share group chats with</div>
        <div><span className="city-key city-key--turn" aria-hidden /> Drag with the middle or right button, or with Ctrl: turn and tilt; the compass puts it back</div>
      </Legend>}
    </div>
  );
}

/** A made-up seed for the legend's colour. */
const KEY_SEED = "5a17c3e0b29d4f81";

function City(props: ViewProps) {
  const together = props.model.people.filter(livesTogether).length;
  const labels = avenueRoads(props.model.people.length, 1, 2, together).map((a) => a.label.replace("top ", ""));
  return (
    <>
      <CityMap {...props} />
      <CityLegend avenues={labels} count={props.model.people.length} />
    </>
  );
}

export const city: Demo = {
  slug: "city",
  title: "City",
  View: City,
};
