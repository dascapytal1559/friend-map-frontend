import { describe, expect, it } from "vitest";
import { fieldRows } from "./demos/view.tsx";
import { locationMatches, sameLocation, writtenLocation } from "./locations.ts";

describe("locations on the page", () => {
  it("writes a location trimmed and single-spaced, keeping its case, and takes locations differing in case as one", () => {
    expect(writtenLocation("  New   York ")).toBe("New York");
    expect(sameLocation("toowoomba", "Toowoomba")).toBe(true);
    expect(sameLocation("Toowoomba", "Brisbane")).toBe(false);
  });

  it("finds a person by their location", () => {
    const person = { location: "Toronto" };
    expect(["toronto", "TOR"].map((words) => locationMatches(person, words))).toEqual([true, true]);
    expect(locationMatches(person, "brisbane")).toBe(false);
    expect(locationMatches({ location: null }, "a")).toBe(false);
  });
});

describe("the hover card's rows", () => {
  it("shows location only when said", () => {
    expect(fieldRows({ location: "Brisbane" })).toEqual([["Location", "Brisbane"]]);
    expect(fieldRows({ location: null })).toEqual([]);
  });
});
