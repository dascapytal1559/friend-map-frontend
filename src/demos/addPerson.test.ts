import { describe, expect, it } from "vitest";
import { newPerson, typedTags } from "./AddPerson.tsx";

describe("Add person's form", () => {
  it("reads tags written as tags are, commas between them, without repeats or blanks", () => {
    expect(typedTags(" Friend, uni friends,, friend ,")).toEqual(["friend", "uni-friends"]);
    expect(typedTags("")).toEqual([]);
  });

  it("sends the name and only the parts filled in", () => {
    expect(newPerson({ name: "Walt Example", location: " ", tags: "", note: "" }, false)).toEqual({ name: "Walt Example" });
    expect(newPerson({ name: "Walt Example", location: "Hobart", tags: "offline", note: "a neighbour" }, true))
      .toEqual({ name: "Walt Example", location: "Hobart", tags: ["offline"], note: "a neighbour", anyway: true });
  });
});
