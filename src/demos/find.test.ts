import { describe, expect, it } from "vitest";
import { namesFor } from "../names.ts";

const N = { full: namesFor("full"), hide: namesFor("hide") };
import { findKey, findOnMap, finds, findWords, type Findable } from "./find.ts";

type Person = Findable & { rank: number; total: number };

function person(id: number, fields: Partial<Person> = {}): Person {
  return { id, name: `Person named ${id}`, aliases: [], note: "", location: null, rank: 0, total: 0, ...fields };
}

const ADA = person(1, { name: "Ada Fictional", aliases: ["Addy"], note: "met at the gym", location: "Hobart" });

describe("finds", () => {
  it("finds by name, alias, note and location, whatever the case and whatever the map shows", () => {
    for (const names of [namesFor("first"), namesFor("initial"), N.full, N.hide]) {
      for (const words of ["fictional", "addy", "gym", "hobart"]) expect(finds(ADA, findWords(words.toUpperCase()), names)).toBe(true);
      expect(finds(ADA, "brisbane", names)).toBe(false);
    }
  });

  it("finds by name alone with No name except…, and only someone picked", () => {
    const picked = namesFor("except", new Set([ADA.id]));
    expect(finds(ADA, "fictional", picked)).toBe(true);
    for (const words of ["addy", "gym", "hobart"]) expect(finds(ADA, words, picked)).toBe(false);
    expect(finds(ADA, "fictional", namesFor("except", new Set([2])))).toBe(false);
    expect(findOnMap([ADA, person(2, { name: "Ada Sample" })], "ada", namesFor("except", new Set([2])), () => 0).found.map((p) => p.id)).toEqual([2]);
  });

  it("has no words for spaces", () => {
    expect(findWords("  ")).toBe("");
    expect(findWords("  Ada L ")).toBe("ada l");
  });

  it("finds Chinese, Japanese and Korean anywhere in a name, alias, note or location, one character or more", () => {
    const zhou = person(2, { name: "周 伟", aliases: ["伟哥"], note: "さくらの友達", location: "上海" });
    for (const words of ["周", "伟", "周伟", "哥", "さ", "上海"]) expect(finds(zhou, findWords(words), N.full)).toBe(true);
    expect(finds(person(3, { name: "김민준" }), findWords("기"), N.full)).toBe(true);
    expect(finds(person(4, { name: "ＲＹＡＮ Ｌｉ" }), findWords("Ryan"), N.full)).toBe(true);
    expect(finds(zhou, findWords("李"), N.full)).toBe(false);
  });
});

describe("findOnMap", () => {
  const rankOf = (p: Person) => p.rank;
  const people = [
    person(1, { name: "Sam Far", rank: 9 }),
    person(2, { name: "Sam Belt Quiet", total: 3 }),
    person(3, { name: "Sam Near", rank: 2 }),
    person(4, { name: "Sam Belt Busy", total: 40 }),
    person(5, { name: "Alex", rank: 1 }),
  ];

  it("lists the closest first, then those with no closeness yet, most talked to first", () => {
    expect(findOnMap(people, "sam", N.full, rankOf).found.map((p) => p.id)).toEqual([3, 1, 4, 2]);
  });

  it("lists at most the limit, and says how many more it found", () => {
    expect(findOnMap(people, "sam", N.full, rankOf, 2)).toEqual({ found: [people[2], people[0]], more: 2 });
  });

  it("lists nobody for no words, and everyone it finds with No name, which leaves only the map unnamed", () => {
    expect(findOnMap(people, " ", N.full, rankOf)).toEqual({ found: [], more: 0 });
    expect(findOnMap(people, "sam", N.hide, rankOf)).toEqual(findOnMap(people, "sam", N.full, rankOf));
  });
});

describe("findKey", () => {
  const listed = { listed: true, found: 3, active: 0 };

  it("clears with Escape, listed or not", () => {
    expect(findKey("Escape", listed)).toEqual({ do: "clear" });
    expect(findKey("Escape", { ...listed, listed: false })).toEqual({ do: "clear" });
  });

  it("opens the list with an arrow key while it is closed", () => {
    expect(findKey("ArrowDown", { ...listed, listed: false })).toEqual({ do: "open" });
    expect(findKey("ArrowUp", { ...listed, listed: false })).toEqual({ do: "open" });
  });

  it("moves through the list with the arrow keys, round from the last to the first and back", () => {
    expect(findKey("ArrowDown", listed)).toEqual({ do: "move", to: 1 });
    expect(findKey("ArrowDown", { ...listed, active: 2 })).toEqual({ do: "move", to: 0 });
    expect(findKey("ArrowUp", listed)).toEqual({ do: "move", to: 2 });
    expect(findKey("ArrowDown", { ...listed, found: 0, active: -1 })).toBeNull();
  });

  it("picks the active one with Enter, and leaves Enter alone with nobody listed", () => {
    expect(findKey("Enter", { ...listed, active: 1 })).toEqual({ do: "pick", index: 1 });
    expect(findKey("Enter", { ...listed, found: 0, active: -1 })).toBeNull();
    expect(findKey("Enter", { ...listed, listed: false })).toBeNull();
  });

  it("leaves every other key to the box", () => {
    expect(findKey("a", listed)).toBeNull();
    expect(findKey("Tab", listed)).toBeNull();
  });
});
