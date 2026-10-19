import { describe, expect, it } from "vitest";
import type { TagInfo } from "../archive.ts";
import { inOrder, moveTo, renameOutcome } from "./tagManager.ts";

const tag = (name: string, count = 0): TagInfo => ({ name, count, builtIn: name === "archive" || name === "keep" });
const tags = [tag("archive"), tag("keep"), tag("uni", 3), tag("family", 5)];

describe("the tag manager", () => {
  it("renames a tag as the archive writes names, merges onto one that exists, and does nothing for the same name or none", () => {
    expect(renameOutcome(tags, "uni", " Uni  Friends ")).toEqual({ kind: "rename", to: "uni-friends" });
    expect(renameOutcome(tags, "uni", "Family")).toEqual({ kind: "merge", to: "family", into: tags[3] });
    expect(renameOutcome(tags, "uni", "UNI")).toEqual({ kind: "none" });
    expect(renameOutcome(tags, "uni", "  ")).toEqual({ kind: "none" });
  });

  it("moves a tag to a place in the order, clamped to the ends", () => {
    const names = tags.map((t) => t.name);
    expect(moveTo(names, "family", 0)).toEqual(["family", "archive", "keep", "uni"]);
    expect(moveTo(names, "archive", 2)).toEqual(["keep", "uni", "archive", "family"]);
    expect(moveTo(names, "keep", 99)).toEqual(["archive", "uni", "family", "keep"]);
    expect(moveTo(names, "uni", -3)).toEqual(["uni", "archive", "keep", "family"]);
  });

  it("shows the tags in a dragged order, any it does not name after", () => {
    expect(inOrder(tags, null)).toEqual(tags);
    expect(inOrder(tags, ["family", "uni"]).map((t) => t.name)).toEqual(["family", "uni", "archive", "keep"]);
    expect(inOrder(tags, ["gone", "keep"]).map((t) => t.name)).toEqual(["keep", "archive", "uni", "family"]);
  });
});
