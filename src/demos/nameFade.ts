// How names fade down the ranking on the map views (Orbits, Circles, the
// Spider web, Orbits 3D and the City): the Names group in each one's settings
// in the menu (viewSettings.ts), one set for every view. A name is full
// strength for the closest `top` (Name fade from), fainter at every guide ring
// after them, and at its faintest (`faintest`, Faintest name) past the
// closest `bottom` (Name fade to) (fadeTiers in orbitsLayout.ts); someone to
// reach out to is never fainter than the last step unless Reach-out names says
// they fade too; and a name shown only because its person shares group chats
// with whoever is held is drawn at `linked` (Linked names). Until moved, every
// one of them is as the map was drawn before there were settings: the closest
// 10 to the closest 100 down to 20%, as each person's marker is (TIERS), with
// linked names at LINKED_FLOOR. A name faded out entirely is not drawn at all,
// so its person keeps their icon. Markers, trails and glows keep TIERS. Saved
// on friend-map's server in the real app and the demo's default
// (savedStore.ts), as the names choice is, since it is every view's.

import { useMemo } from "react";
import { demoMode } from "../demoMode.ts";
import { useStore } from "../keptSetting.ts";
import { savedSetting } from "../savedStore.ts";
import { BACKGROUND, fadeTiers, LINKED_FLOOR, personOpacity, TIER_FLOOR } from "./orbitsLayout.ts";

export interface NameFade {
  /** How many of the closest keep their names at full strength. */
  top: number;
  /** Past how many of the closest names are at their faintest. */
  bottom: number;
  /** How strong the faintest names are, 0 (not drawn) to 1. */
  faintest: number;
  /** Whether someone to reach out to keeps their name at least as strong as the last step before the faintest. */
  reachOut: boolean;
  /** How strong a name shown only for a link to whoever is held is, 0 (not drawn) to 1. */
  linked: number;
}

/** The names as they were drawn before there were settings. */
export const DEFAULT_NAME_FADE: NameFade = { top: 10, bottom: 100, faintest: TIER_FLOOR, reachOut: true, linked: LINKED_FLOOR };

/** What Name fade from and Name fade to offer: the guide rings (RING_STOPS) a fade fits between. */
export const FADE_STOPS: readonly number[] = [10, 25, 50, 100, 250, 500];

/**
 * How strongly the name of whoever is `place`th closest (null for the belt) is drawn, with nobody picked out; someone to
 * reach out to, unless their names fade too, lifted toward full by the Reach-out glow (`lift`, glowLook's in
 * reachGlow.ts), as their marker is.
 */
export function nameOpacity(place: number | null, reachOut: boolean, fade: NameFade, lift = 0): number {
  return personOpacity(place, reachOut && fade.reachOut, { tiers: fadeTiers(fade.top, fade.bottom, fade.faintest), floor: fade.faintest, lift });
}

/** Whether that name has faded out entirely, so it is not drawn and its person keeps their icon. */
export function nameHidden(place: number | null, reachOut: boolean, fade: NameFade): boolean {
  return nameOpacity(place, reachOut, fade) <= 0;
}

/**
 * How strongly someone's name is drawn (strengthOf in Orbits.tsx, for names):
 * by its fade (nameOpacity, `lift` the Reach-out glow's); while someone is picked out (`focusId`), theirs
 * at full strength, those linked to them at 70%, and everyone else's at
 * BACKGROUND, or fainter if their fade has it fainter, so a name faded out
 * stays out under the pointer.
 */
export function nameStrengthOf(
  id: number,
  place: number | null,
  reachOut: boolean,
  focusId: number | null,
  linked: ReadonlySet<number>,
  fade: NameFade,
  lift = 0,
): number {
  if (focusId === null) return nameOpacity(place, reachOut, fade, lift);
  return id === focusId ? 1 : linked.has(id) ? 0.7 : Math.min(BACKGROUND, nameOpacity(place, reachOut, fade));
}

/** A number from 0 to 1; anything else is `fallback`. */
function shareOf(kept: string | null, fallback: number): number {
  const n = kept === null || kept === "" ? NaN : Number(kept);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

/** One of FADE_STOPS; anything else is `fallback`. */
function stopOf(kept: string | null, fallback: number): number {
  const n = /^\d+$/.test(kept ?? "") ? Number(kept) : NaN;
  return FADE_STOPS.includes(n) ? n : fallback;
}

/** Where each is kept. */
export const NAME_FADE_KEYS = {
  top: "friend-map.name-fade.top",
  bottom: "friend-map.name-fade.bottom",
  faintest: "friend-map.name-fade.faintest",
  reachOut: "friend-map.name-fade.reach-out",
  linked: "friend-map.name-fade.linked",
} as const;

/** An app's name fade settings, one store each (the demo's, `demo`, or the real one's). */
export function makeNameFadeStores(demo: boolean) {
  const d = DEFAULT_NAME_FADE;
  return {
    top: savedSetting(NAME_FADE_KEYS.top, demo, d.top, stopOf),
    bottom: savedSetting(NAME_FADE_KEYS.bottom, demo, d.bottom, stopOf),
    faintest: savedSetting(NAME_FADE_KEYS.faintest, demo, d.faintest, shareOf),
    reachOut: savedSetting(NAME_FADE_KEYS.reachOut, demo, d.reachOut, (kept, fallback) => (kept === "bright" ? true : kept === "fade" ? false : fallback), {
      write: (bright) => (bright ? "bright" : "fade"),
    }),
    linked: savedSetting(NAME_FADE_KEYS.linked, demo, d.linked, shareOf),
  };
}

/** This page's: the demo's in the demo, the real app's everywhere else. */
export const nameFadeStores = makeNameFadeStores(demoMode);

/** How names fade, as set; the same object until a setting changes. */
export function useNameFade(): NameFade {
  const top = useStore(nameFadeStores.top);
  const bottom = useStore(nameFadeStores.bottom);
  const faintest = useStore(nameFadeStores.faintest);
  const reachOut = useStore(nameFadeStores.reachOut);
  const linked = useStore(nameFadeStores.linked);
  return useMemo(() => ({ top, bottom, faintest, reachOut, linked }), [top, bottom, faintest, reachOut, linked]);
}
