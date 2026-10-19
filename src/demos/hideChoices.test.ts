import { describe, expect, it } from "vitest";
import {
  chooseAllHide, chooseHide, forgetOldPanels, HIDDEN_BY_DEFAULT, HIDE_KEYS, hiddenTags, hideEntries, hides, loadHideChoices, renameHidden,
  oneArchive, renameStoredHidden, revealsArchived, saveHideChoices, shownByHide, uncountedEntries,
} from "./hideChoices.ts";

function memory() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("Hide", () => {
  it("starts with archive and commercial on, every other tag off", () => {
    expect(HIDDEN_BY_DEFAULT).toEqual(["archive", "commercial"]);
    for (const tag of HIDDEN_BY_DEFAULT) expect(hides({}, tag)).toBe(true);
    for (const tag of ["cousin", "keep", "spam", "a tag made today"]) expect(hides({}, tag)).toBe(false);
    const chosen = chooseHide(chooseHide({}, "commercial", false), "cousin", true);
    expect(hides(chosen, "commercial")).toBe(false);
    expect(hides(chosen, "cousin")).toBe(true);
  });

  it("leaves out anyone with any tag on, and nobody else", () => {
    expect(shownByHide({}, ["cousin"])).toBe(true);
    expect(shownByHide({}, [])).toBe(true);
    expect(shownByHide({}, ["cousin", "commercial"])).toBe(false);
    // Everyone archived carries "archive", by you or by the rules (tagsWithRule).
    expect(shownByHide({}, ["archive"])).toBe(false);
    const archiveShown = chooseHide({}, "archive", false);
    expect(shownByHide(archiveShown, ["archive", "cousin"])).toBe(true);
    // Unticking one box shows only the people no other ticked box hides.
    expect(shownByHide(archiveShown, ["archive", "commercial"])).toBe(false);
  });

  it("lists the tags switched on, for the server to count the query's matches under Hide", () => {
    expect(hiddenTags({})).toEqual(["archive", "commercial"]);
    expect(hiddenTags({ archive: false })).toEqual(["commercial"]);
    expect(hiddenTags({ archive: false, commercial: false, work: true, cousin: false })).toEqual(["work"]);
  });

  it("lists every tag chosen and the defaults, uncounted, before anything has shown to count", () => {
    expect(uncountedEntries({ archive: false, work: true })).toEqual([
      { tag: "archive", count: null }, { tag: "work", count: null }, { tag: "commercial", count: null },
    ]);
  });

  it("says whether it shows archived people, for the map to load them", () => {
    expect(revealsArchived({})).toBe(false);
    expect(revealsArchived({ archive: false })).toBe(true);
    expect(revealsArchived({ archive: true, commercial: false })).toBe(false);
  });

  it("lists the tags in use, most used first, then the two defaults in a fixed place, nobody's too, so they take effect once used", () => {
    const people = [{ tags: ["work"] }, { tags: ["work", "commercial"] }, { tags: ["climbing"] }, { tags: [] }, { tags: ["work"] }];
    expect(hideEntries(people)).toEqual([
      { tag: "work", count: 3 },
      { tag: "climbing", count: 1 },
      { tag: "archive", count: 0 },
      { tag: "commercial", count: 1 },
    ]);
    // However many have one, its row stays put.
    const many = [...people, ...Array.from({ length: 5 }, () => ({ tags: ["archive"] }))];
    expect(hideEntries(many).map((e) => e.tag)).toEqual(["work", "climbing", "archive", "commercial"]);
  });

  it("given the tag table, lists every tag in its order, nobody's too, then any other in use, then the defaults left", () => {
    // One archived by you, one by the rules: one archive row counting both.
    const people = [{ tags: ["work"] }, { tags: ["work", "archive"] }, { tags: ["archive"] }, { tags: ["keep"] }, { tags: [] }];
    const all = ["family", "archive", "work", "keep"];
    expect(hideEntries(people, all).map((e) => [e.tag, e.count, hides({}, e.tag)])).toEqual([
      ["family", 0, false], ["archive", 2, true], ["work", 2, false], ["keep", 1, false], ["commercial", 0, true],
    ]);
  });

  it("leaves uncounted the tags whose people are not loaded", () => {
    expect(hideEntries([{ tags: ["cousin"] }], [], ["archive"]).map((e) => [e.tag, e.count])).toEqual([
      ["cousin", 1], ["archive", null], ["commercial", 0],
    ]);
  });

  it("switches every row on or off with Select all / Unselect all", () => {
    const people = [{ tags: ["friend"] }, { tags: ["commercial"] }, { tags: [] }];
    const all = chooseAllHide({}, hideEntries(people), true);
    expect(hideEntries(people).every((entry) => hides(all, entry.tag))).toBe(true);
    expect(people.filter((person) => shownByHide(all, person.tags))).toEqual([{ tags: [] }]);
    const none = chooseAllHide(all, hideEntries(people), false);
    expect(people.every((person) => shownByHide(none, person.tags))).toBe(true);
    expect(revealsArchived(none)).toBe(true);
  });

  it("carries a renamed tag's switch over, here and in what the browser remembers, but keeps a merged-into tag's own", () => {
    const chosen = chooseHide(chooseHide({}, "uni", true), "family", false);
    expect(renameHidden(chosen, "uni", "uni-friends")).toEqual({ "uni-friends": true, family: false });
    expect(renameHidden(chosen, "uni", "family", true)).toEqual({ family: false });
    expect(renameHidden(chosen, "dota", "games")).toBe(chosen);

    const storage = memory();
    saveHideChoices(HIDE_KEYS.table, chosen, () => storage);
    renameStoredHidden("uni", "uni-friends", false, () => storage);
    expect(loadHideChoices(HIDE_KEYS.table, () => storage)).toEqual({ "uni-friends": true, family: false });
    // Nothing is written for the Calendar, which had no choices here.
    expect(storage.getItem(HIDE_KEYS.calendar)).toBeNull();
    expect(() => renameStoredHidden("a", "b", false, () => {
      throw new Error("SecurityError");
    })).not.toThrow();
  });

  it("remembers the Table's choices (which the maps follow) apart from the Calendar's, and falls back to the defaults without storage or with something unreadable", () => {
    const storage = memory();
    expect(loadHideChoices(HIDE_KEYS.table, () => storage)).toEqual({});
    saveHideChoices(HIDE_KEYS.table, { archive: false }, () => storage);
    expect(loadHideChoices(HIDE_KEYS.table, () => storage)).toEqual({ archive: false });
    expect(loadHideChoices(HIDE_KEYS.calendar, () => storage)).toEqual({});

    storage.setItem(HIDE_KEYS.calendar, "not json");
    expect(loadHideChoices(HIDE_KEYS.calendar, () => storage)).toEqual({});
    storage.setItem(HIDE_KEYS.calendar, JSON.stringify({ work: "no", cousin: true }));
    expect(loadHideChoices(HIDE_KEYS.calendar, () => storage)).toEqual({ cousin: true });
    storage.setItem(HIDE_KEYS.calendar, JSON.stringify([true]));
    expect(loadHideChoices(HIDE_KEYS.calendar, () => storage)).toEqual({});

    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(loadHideChoices(HIDE_KEYS.calendar, () => undefined)).toEqual({});
    expect(loadHideChoices(HIDE_KEYS.calendar, refusing)).toEqual({});
    expect(() => saveHideChoices(HIDE_KEYS.calendar, {}, refusing)).not.toThrow();
  });

  it("carries choices kept from before there was one archive over: system-archive folds into archive, spam goes", () => {
    // The fold: archive stays shown only when both were unticked.
    expect(oneArchive({ "system-archive": false, archive: false, cousin: true })).toEqual({ archive: false, cousin: true });
    expect(oneArchive({ "system-archive": false })).toEqual({ archive: true });
    expect(oneArchive({ "system-archive": true, archive: false })).toEqual({ archive: true });
    expect(oneArchive({ "system-archive": true })).toEqual({ archive: true });
    // spam was on by default and is a tag no more: its old switch goes, so a spam tag made later starts off.
    expect(oneArchive({ spam: true, commercial: false })).toEqual({ commercial: false });
    expect(hides(oneArchive({ spam: true }), "spam")).toBe(false);
    // Choices made since are kept as they are.
    const now = { archive: false, cousin: true };
    expect(oneArchive(now)).toBe(now);

    // As the map and the Table load them, and saved back so.
    const storage = memory();
    storage.setItem(HIDE_KEYS.calendar, JSON.stringify({ archive: false, "system-archive": false, spam: false, work: true }));
    storage.setItem(HIDE_KEYS.table, JSON.stringify({ archive: false, "system-archive": true, spam: true }));
    expect(loadHideChoices(HIDE_KEYS.calendar, () => storage)).toEqual({ archive: false, work: true });
    expect(revealsArchived(loadHideChoices(HIDE_KEYS.calendar, () => storage))).toBe(true);
    expect(loadHideChoices(HIDE_KEYS.table, () => storage)).toEqual({ archive: true });
    expect(revealsArchived(loadHideChoices(HIDE_KEYS.table, () => storage))).toBe(false);
    expect(hideEntries([{ tags: ["archive"] }]).map((e) => e.tag)).toEqual(["archive", "commercial"]);
  });

  it("clears what the old Filter and Hide panels kept, so Hide starts from its defaults", () => {
    const storage = memory();
    storage.setItem("friend-map.tags", JSON.stringify({ filter: {}, untagged: true, hide: { commercial: false }, platforms: {} }));
    storage.setItem("friend-map.table.tags", "{}");
    storage.setItem("friend-map.tagPanels", "true");
    // The maps' own Hide, from before they followed the Table's.
    storage.setItem("friend-map.hide", JSON.stringify({ archive: false }));
    storage.setItem("friend-map.query", "met:toowoomba");
    forgetOldPanels(() => storage);
    expect([...storage.items.keys()]).toEqual(["friend-map.query"]);
    expect(loadHideChoices(HIDE_KEYS.calendar, () => storage)).toEqual({});
    expect(() => forgetOldPanels(() => {
      throw new Error("SecurityError");
    })).not.toThrow();
  });
});
