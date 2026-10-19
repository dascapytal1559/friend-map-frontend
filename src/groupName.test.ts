import { describe, expect, it } from "vitest";
import { groupName } from "./groupName.ts";
import { namesFor, type NameStyle } from "./names.ts";

const ada = { id: 1, name: "Ada Sample", aliases: [] };
const bo = { id: 2, name: "Bo", aliases: ["Bruno Placeholder"] };
const cy = { id: 3, name: "Cleo Example", aliases: [] };
/** The map's own choices, which change nothing off the map. */
const MAP_ONLY: NameStyle[] = ["first", "initial", "full", "hide"];

describe("groupName", () => {
  it("uses a group's title, whatever the map shows, and nothing while names are hidden", () => {
    const crew = { title: "Sunday crew", people: 7, namedBy: [] };
    for (const style of MAP_ONLY) expect(groupName(crew, namesFor(style))).toBe("Sunday crew");
    expect(groupName(crew, namesFor("except", new Set([1, 2, 3])))).toBe("");
  });

  it("names an untitled group by the people in it, as they are labelled off the map", () => {
    for (const style of MAP_ONLY) expect(groupName({ title: null, people: 4, namedBy: [ada, bo, cy] }, namesFor(style))).toBe("Ada Sample, Bo and Cleo Example");
    expect(groupName({ title: null, people: 4, namedBy: [ada, bo, cy] }, namesFor("full", undefined, true))).toBe("Ada S., Bo and Cleo E.");
    expect(groupName({ title: null, people: 4, namedBy: [ada, bo, cy] }, namesFor("except", new Set([1])))).toBe("");
    expect(groupName({ title: null, people: 2, namedBy: [ada] }, namesFor("full"))).toBe("Ada Sample");
  });

  it("says how many more there are", () => {
    expect(groupName({ title: null, people: 12, namedBy: [ada, bo, cy] }, namesFor("full"))).toBe("Ada Sample, Bo, Cleo Example and 8 more");
  });

  it("is - with nobody to name it by, or a blank title, and nothing while names are hidden", () => {
    expect(groupName({ title: null, people: 1, namedBy: [] }, namesFor("full"))).toBe("-");
    expect(groupName({ title: "", people: 3, namedBy: [] }, namesFor("full"))).toBe("-");
    expect(groupName({ title: " ", people: 3, namedBy: [] }, namesFor("hide"))).toBe("-");
    expect(groupName({ title: "", people: 3, namedBy: [] }, namesFor("except"))).toBe("");
  });
});
