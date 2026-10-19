// Picking whom No name except… names (shownNames.ts): the "show-name" tag added to or taken from them, one change to
// their tags, every other tag as it was; and their connections, whom it names with them: everyone on the map they
// share a group chat with, as the map links them.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHOW_NAME_TAG, type GroupMembership, type PersonSummary } from "./archive.ts";
import { provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { connectionsOf, setShowName, withShowName } from "./shownNames.ts";

describe("withShowName", () => {
  it("adds the tag last, or takes it away, leaving every other tag in its place", () => {
    expect(SHOW_NAME_TAG).toBe("show-name");
    expect(withShowName(["climbing", "keep"], true)).toEqual(["climbing", "keep", "show-name"]);
    expect(withShowName(["show-name", "climbing"], true)).toEqual(["climbing", "show-name"]);
    expect(withShowName(["climbing", "show-name", "keep"], false)).toEqual(["climbing", "keep"]);
    expect(withShowName([], false)).toEqual([]);
  });
});

describe("setShowName", () => {
  const setTags = vi.fn(async (id: number, tags: string[]) => ({ person: { id, tags } as PersonSummary, changeset: 12, created: [], deleted: [] }));

  beforeEach(() => {
    vi.stubGlobal("document", new EventTarget());
    provideArchive({ setTags } as unknown as ArchiveApi);
  });
  afterEach(() => {
    setTags.mockClear();
    vi.unstubAllGlobals();
  });

  it("saves their tags with it, or without it, as one change", async () => {
    await setShowName({ id: 7, tags: ["climbing"] }, true);
    await setShowName({ id: 8, tags: ["show-name", "keep"] }, false);
    expect(setTags.mock.calls).toEqual([[7, ["climbing", "show-name"]], [8, ["keep"]]]);
  });
});

describe("connectionsOf", () => {
  const group = (id: number, memberIds: number[]): GroupMembership => ({ id, memberIds, selfOnly: false, messageCount: 4, lastMessageAt: 1, months: [] });
  /** Everyone on the map: 1 to 9 (10 is archived, so off it). */
  const people = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => ({ id }));
  const groups = [group(1, [1, 2, 3]), group(2, [3, 4]), group(3, [5, 6, 10]), group(4, [1, 7]), group(5, [8, 9])];

  it("is everyone on the map who shares a group chat with someone picked, nobody picked among them", () => {
    expect([...connectionsOf(new Set([1]), { people, groups, unlinks: [] })].sort()).toEqual([2, 3, 7]);
    // Picked together, neither is the other's connection; a friend of a friend (4, through 3) is none.
    expect([...connectionsOf(new Set([1, 3]), { people, groups, unlinks: [] })].sort()).toEqual([2, 4, 7]);
    expect([...connectionsOf(new Set(), { people, groups, unlinks: [] })]).toEqual([]);
  });

  it("follows the map's links: nobody off the map, and nobody through a group chat someone is unlinked from", () => {
    expect([...connectionsOf(new Set([5]), { people, groups, unlinks: [] })]).toEqual([6]);
    // Someone picked but off the map (archived) is linked to nobody.
    expect([...connectionsOf(new Set([10]), { people, groups, unlinks: [] })]).toEqual([]);
    // Unlinked from group chat 1, they are no connection through it, and it connects the one picked to nobody.
    expect([...connectionsOf(new Set([1]), { people, groups, unlinks: [{ personId: 2, groupId: 1 }] })].sort()).toEqual([3, 7]);
    expect([...connectionsOf(new Set([1]), { people, groups, unlinks: [{ personId: 1, groupId: 1 }] })]).toEqual([7]);
  });
});
