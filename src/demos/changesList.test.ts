import { describe, expect, it } from "vitest";
import type { ChangesetInfo } from "../archive.ts";
import { namesFor } from "../names.ts";
import { changeEntry, changeLine } from "./changesList.ts";

const FULL = namesFor("full");

const NOW = Date.parse("2026-09-30T15:00:00+10:00");

const changeset = (over: Partial<ChangesetInfo> = {}): ChangesetInfo => ({
  id: 12,
  at: Date.parse("2026-09-30T14:03:00+10:00"),
  surface: "cli",
  action: "edit tag commercial",
  description: "for this group, tag everyone as commercial",
  backup: "2026-09-30T140300-before-edit-tag-commercial.sqlite",
  undoes: null,
  undoneBy: null,
  people: [{ id: 1, name: "Ada Sample", changes: [{ what: "tags", before: "", after: "commercial" }] }],
  peopleCount: 3,
  other: ['added the tag "commercial"'],
  ...over,
});

describe("the Changes list", () => {
  it("shows when, from where, what, the user's words and who, with Undo until it is undone", () => {
    expect(changeEntry(changeset(), FULL, NOW)).toEqual({
      id: 12,
      action: "edit tag commercial",
      meta: "#12 · today 14:03 · from the CLI",
      words: "for this group, tag everyone as commercial",
      people: [{ id: 1, name: "Ada Sample" }],
      more: 2,
      other: ['added the tag "commercial"'],
      state: null,
      canUndo: true,
    });
    const undone = changeEntry(changeset({ undoneBy: 13, surface: "app", at: Date.parse("2026-09-29T09:05:00+10:00") }), FULL, NOW);
    expect(undone).toMatchObject({ meta: "#12 · yesterday 09:05 · in the app", state: "undone by #13", canUndo: false });
    expect(changeEntry(changeset({ id: 13, undoes: 12, description: null }), FULL, NOW)).toMatchObject({ words: null, state: "undoes #12", canUndo: true });
  });

  it("writes each change as before and after, saying when there was none", () => {
    expect(changeLine({ what: "tags", before: "friend", after: "friend, commercial" })).toBe("tags: friend → friend, commercial");
    expect(changeLine({ what: "met", before: "Toowoomba", after: "" })).toBe("met: Toowoomba → (none)");
  });
});
