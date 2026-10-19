// The Table's tag manager (TagManager.tsx): what a rename would do, and the
// order while a tag is dragged. Pure functions, no DOM.

import { type TagInfo, writtenTag } from "../archive.ts";

/** What saving `draft` as the new name of `from` does: nothing, a rename, or a merge into a tag that exists. */
export type RenameOutcome =
  | { kind: "none" }
  | { kind: "rename"; to: string }
  | { kind: "merge"; to: string; into: TagInfo };

export function renameOutcome(tags: readonly TagInfo[], from: string, draft: string): RenameOutcome {
  const to = writtenTag(draft);
  if (!to || to === from) return { kind: "none" };
  const into = tags.find((tag) => tag.name === to);
  return into ? { kind: "merge", to, into } : { kind: "rename", to };
}

/** `names` with `name` moved to `position` (0 first; past the end is last). */
export function moveTo(names: readonly string[], name: string, position: number): string[] {
  const rest = names.filter((n) => n !== name);
  rest.splice(Math.max(0, Math.min(position, rest.length)), 0, name);
  return rest;
}

/** `tags` in the order `names` gives (a drag in progress, or a move not yet saved); any not named keep their place after. */
export function inOrder(tags: readonly TagInfo[], names: readonly string[] | null): TagInfo[] {
  if (!names) return [...tags];
  const byName = new Map(tags.map((tag) => [tag.name, tag]));
  return [...names.flatMap((name) => byName.get(name) ?? []), ...tags.filter((tag) => !names.includes(tag.name))];
}
