import { afterEach, describe, expect, it, vi } from "vitest";
import { keptAs } from "./demoMode.ts";
import { DEFAULT_NAME_STYLE, displayName, enoughToSearch, holds, joinCandidates, makeNameStyleStore, NAME_STYLE_KEY, NAME_STYLES, nameStylesFor, namesFor, searchForm, shortened, type NameStyle } from "./names.ts";

const DEMO_KEY = keptAs(NAME_STYLE_KEY, true);

function person(id: number, name: string) {
  return { id, name };
}

describe("the name choices", () => {
  it("are First name, First L., Full name, No name and No name except…, in that order", () => {
    expect(NAME_STYLES.map((s) => [s.style, s.title])).toEqual([
      ["first", "First name"], ["initial", "First L."], ["full", "Full name"], ["hide", "No name"], ["except", "No name except…"],
    ]);
  });

  it("are the first four in the demo, whose people are all made up; both apps start at First L.", () => {
    expect(nameStylesFor(true).map((s) => s.style)).toEqual(["first", "initial", "full", "hide"]);
    expect(nameStylesFor(false)).toBe(NAME_STYLES);
    expect(DEFAULT_NAME_STYLE).toBe("initial");
  });
});

describe("shortened", () => {
  const both = (name: string) => [shortened(name, "first"), shortened(name, "initial")];

  it("is the first name, or it and the last name's first letter with a full stop", () => {
    expect(both("Ada Sample")).toEqual(["Ada", "Ada S."]);
    expect(both("  Bruno   de la Placeholder ")).toEqual(["Bruno", "Bruno P."]);
    expect(both("José Ñúñez")).toEqual(["José", "José Ñ."]);
  });

  it("counts only words with a letter in them, and takes the last's first letter, wherever in the word it is", () => {
    expect(both("Ada Sample 🌸")).toEqual(["Ada", "Ada S."]);
    expect(both("🌸 Ada (Sample)")).toEqual(["Ada", "Ada S."]);
    expect(both("Ada Sample 2")).toEqual(["Ada", "Ada S."]);
    // A letter beyond the Basic Multilingual Plane is one letter, not half of one.
    expect(shortened("Ada 𝒮ample", "initial")).toBe("Ada 𝒮.");
  });

  it("leaves a name of one word as it is, Chinese, Japanese or Korean too, spaced or not", () => {
    for (const name of ["Ada", "周伟", "周 伟", "山田 太郎", "김 민준", "Ada 🌸", "+61 491 570 006"]) expect(both(name)).toEqual([name, name]);
  });

  it("leaves an email and a platform's name for an account it no longer knows as they are", () => {
    expect(both("ada.kettle10@example.org")).toEqual(["ada.kettle10@example.org", "ada.kettle10@example.org"]);
    expect(both("Facebook user")).toEqual(["Facebook user", "Facebook user"]);
  });

  it("changes nothing with any other choice", () => {
    for (const style of ["full", "hide", "except"] as NameStyle[]) expect(shortened(" Ada Sample ", style)).toBe(" Ada Sample ");
  });
});

describe("displayName", () => {
  const ada = person(1, "Ada Sample");

  it("leads with their name, the first of their names, and keeps their next name beneath", () => {
    expect(displayName(ada, ["Addy", "Ada L."])).toEqual({ primary: "Ada Sample", secondary: "Addy" });
  });

  it("shows the name once when the alias is the name", () => {
    expect(displayName(ada, ["Ada Sample"])).toEqual({ primary: "Ada Sample", secondary: null });
  });

  it("uses the name alone when there is no alias, space at either end aside", () => {
    expect(displayName(ada, [])).toEqual({ primary: "Ada Sample", secondary: null });
    expect(displayName(person(2, " Haru "), [" Haruki  Oda "])).toEqual({ primary: "Haru", secondary: "Haruki  Oda" });
  });

  it("shortens the name and the next one with First name and First L., the next one once only when it reads differently", () => {
    expect(displayName(ada, ["Addy Sample"], "first")).toEqual({ primary: "Ada", secondary: "Addy" });
    expect(displayName(ada, ["Ada Smith"], "initial")).toEqual({ primary: "Ada S.", secondary: null });
    expect(displayName(ada, ["Ada Smith"], "first")).toEqual({ primary: "Ada", secondary: null });
  });

  it("shows nothing with No name: no label, no name beneath", () => {
    expect(displayName(ada, ["Addy"], "hide")).toEqual({ primary: "", secondary: null });
  });

  it("names only those picked with No name except…, by name without the alias, and nobody before they are known", () => {
    const named = new Set([1, 3]);
    expect(displayName(ada, ["Addy"], "except", named)).toEqual({ primary: "Ada Sample", secondary: null });
    expect(displayName(person(2, "Bruno Placeholder"), [], "except", named)).toEqual({ primary: "", secondary: null });
    expect(displayName(ada, ["Addy"], "except")).toEqual({ primary: "", secondary: null });
  });
});

describe("what each choice changes", () => {
  const ada = { id: 1, name: "Ada Sample", aliases: ["Addy Kettle"] };
  const bruno = { id: 2, name: "Bruno Placeholder", aliases: [] };
  const everywhere = (style: NameStyle, demo = false, named: ReadonlySet<number> = new Set([1])) => {
    const names = namesFor(style, named, demo);
    return {
      map: [names.mapLabel(ada).primary, names.mapLabel(bruno).primary],
      label: names.label(ada),
      other: [names.label(bruno).primary, names.shown("Ada Sample"), names.titled("Climbing crew")],
      hidden: names.hidden,
      outside: [names.outside(1), names.outside(2)],
    };
  };
  const asItIs = { label: { primary: "Ada Sample", secondary: "Addy Kettle" }, other: ["Bruno Placeholder", "Ada Sample", "Climbing crew"], hidden: false, outside: [false, false] };

  it("First name, First L., Full name and No name change only the names drawn on the map", () => {
    expect(everywhere("first")).toEqual({ map: ["Ada", "Bruno"], ...asItIs });
    expect(everywhere("initial")).toEqual({ map: ["Ada S.", "Bruno P."], ...asItIs });
    expect(everywhere("full")).toEqual({ map: ["Ada Sample", "Bruno Placeholder"], ...asItIs });
    expect(everywhere("hide")).toEqual({ map: ["", ""], ...asItIs });
  });

  it("No name except… hides every name on every screen but those picked, and any other name that may be anyone's", () => {
    expect(everywhere("except")).toEqual({
      map: ["Ada Sample", ""], label: { primary: "Ada Sample", secondary: null }, other: ["", "", ""], hidden: true, outside: [false, true],
    });
  });

  it("names everyone as First L. off the demo's map, aliases and accounts too, whatever its map shows; a title as it is", () => {
    for (const style of ["first", "initial", "full", "hide"] as NameStyle[]) {
      const shown = everywhere(style, true);
      expect([style, shown.label, shown.other]).toEqual([style, { primary: "Ada S.", secondary: "Addy K." }, ["Bruno P.", "Ada S.", "Climbing crew"]]);
    }
    expect(everywhere("full", true).map).toEqual(["Ada Sample", "Bruno Placeholder"]);
  });
});

describe("the choice", () => {
  function storage(initial: Record<string, string> = {}) {
    const items = new Map(Object.entries(initial));
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
  }
  function storeWith(initial: Record<string, string> = {}, demo = false) {
    const kept = storage(initial);
    const store = makeNameStyleStore(demo);
    store.reload(kept);
    return { store, items: kept.items };
  }

  afterEach(() => void vi.unstubAllGlobals());

  it("is First L. in the real app until chosen, and kept as chosen, the default too", () => {
    const { store, items } = storeWith();
    expect(store.get()).toBe("initial");
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    store.set("full");
    stop();
    expect(store.get()).toBe("full");
    expect(heard).toHaveBeenCalledOnce();
    expect(items.get("friend-map.names")).toBe("full");
    // Kept on the server, every choice is written, so the demo can follow it.
    store.set("initial");
    expect(items.get("friend-map.names")).toBe("initial");
  });

  it("is First L. in the demo until chosen, kept apart from the real app's, and never No name except…", () => {
    expect(DEMO_KEY).not.toBe(NAME_STYLE_KEY);
    const { store, items } = storeWith({ "friend-map.names": "hide" }, true);
    expect(store.get()).toBe("initial");
    store.set("first");
    expect([items.get(DEMO_KEY), items.get("friend-map.names")]).toEqual(["first", "hide"]);
    store.set("except");
    expect(store.get()).toBe("initial");
    expect(storeWith({ [DEMO_KEY]: "except" }, true).store.get()).toBe("initial");
  });

  it("keeps who No name except… names until they are loaded again, and forgets them on reload", () => {
    const { store } = storeWith({ "friend-map.names": "except" });
    expect([store.get(), store.named().size]).toEqual(["except", 0]);
    const heard = vi.fn();
    store.subscribe(heard);
    store.setNamed(new Set([7, 8]));
    expect([store.named().size, heard.mock.calls.length]).toEqual([2, 1]);
    store.reload(storage({ "friend-map.names": "except" }));
    expect(store.named().size).toBe(0);
  });

  it("carries an older choice over, never showing more than it did", () => {
    for (const [saved, now] of [["none", "hide"], ["hide", "hide"], ["demo", "except"], ["one", "except"], ["first", "first"], ["nonsense", "initial"]]) {
      expect([saved, storeWith({ "friend-map.names": saved }).store.get()]).toEqual([saved, now]);
    }
  });

  it("h toggles No name, and back to the choice before", () => {
    const { store } = storeWith();
    store.set("except");
    store.toggleHidden();
    expect(store.get()).toBe("hide");
    store.toggleHidden();
    expect(store.get()).toBe("except");
    const fromHidden = storeWith({ "friend-map.names": "hide" }).store;
    fromHidden.toggleHidden();
    expect(fromHidden.get()).toBe("initial");
    const demo = storeWith({ [DEMO_KEY]: "hide" }, true).store;
    demo.toggleHidden();
    expect(demo.get()).toBe("initial");
  });

  it("still works where the browser keeps nothing", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    const { store } = storeWith();
    store.reload({ getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(store.get()).toBe("initial");
    store.set("hide");
    expect(store.get()).toBe("hide");
  });
});

describe("search matching", () => {
  const ids = (everyone: { id: number; name: string; aliases: string[] }[], query: string) =>
    joinCandidates(0, everyone.map((p) => ({ ...p, archived: null })), query).map((p) => p.id);
  const everyone = [
    { id: 1, name: "周伟", aliases: [] },
    { id: 2, name: "Ryan 周", aliases: [] },
    { id: 3, name: "李 小明", aliases: [] },
    { id: 4, name: "Zhou Fang", aliases: ["芳芳"] },
    { id: 5, name: "さくら", aliases: ["サクラ"] },
    { id: 6, name: "김민준", aliases: [] },
    { id: 7, name: "ＲＹＡＮ Ｌｉ", aliases: [] },
    { id: 8, name: "José Wu", aliases: [] },
  ];

  it("finds Chinese, Japanese and Korean anywhere in a name, one character or more", () => {
    expect(ids(everyone, "周")).toEqual([1, 2]);
    expect(ids(everyone, "伟")).toEqual([1]);
    expect(ids(everyone, "周伟")).toEqual([1]);
    expect(ids(everyone, "Ryan 周")).toEqual([2]);
    expect(ids(everyone, "芳")).toEqual([4]);
    expect(ids(everyone, "さ")).toEqual([5]);
    expect(ids(everyone, "クラ")).toEqual([5]);
    expect(ids(everyone, "민")).toEqual([6]);
  });

  it("reads a name spaced between its characters as one word, either way round", () => {
    expect(ids(everyone, "李小明")).toEqual([3]);
    expect(ids(everyone, "小明")).toEqual([3]);
    expect(ids(everyone, "李 小")).toEqual([3]);
    expect(holds("周伟", "周 伟")).toBe(true);
    // Spaces between Latin words still count: "ryan周" is not "Ryan 周".
    expect(ids(everyone, "ryan周")).toEqual([]);
  });

  it("finds what an input method holds at every step, from the letters typed to the characters chosen", () => {
    // Pinyin is Latin letters until a character is chosen; Korean composes a syllable in place.
    for (const step of ["zh", "zho", "zhou"]) expect(ids(everyone, step)).toEqual([4]);
    expect(ids(everyone, "周")).toEqual([1, 2]);
    for (const step of ["ㄱ", "기", "김", "김민"]) expect(ids(everyone, step)).toEqual([6]);
  });

  it("ignores case and width, and an accent typed or not still finds an accented name", () => {
    expect(ids(everyone, "ryan li")).toEqual([7]);
    expect(ids(everyone, "ｒｙａｎ")).toEqual([2, 7]);
    expect(ids(everyone, "RYAN")).toEqual([2, 7]);
    expect(ids(everyone, "jose")).toEqual([8]);
    expect(ids(everyone, "josé")).toEqual([8]);
    expect(searchForm("ＲＹＡＮ 周 伟")).toBe("ryan 周伟");
  });

  it("needs two letters, or one character that is a syllable or word on its own", () => {
    for (const query of ["", " ", "a", " a ", "1", "é"]) expect(enoughToSearch(query)).toBe(false);
    for (const query of ["al", "周", " 周 ", "さ", "カ", "김", "ㄱ", "𠮷"]) expect(enoughToSearch(query)).toBe(true);
    expect(ids(everyone, "w")).toEqual([]);
  });

  it("holds nothing in no text", () => {
    expect(holds(null, "周")).toBe(false);
    expect(holds(undefined, "a")).toBe(false);
    expect(holds("", "a")).toBe(false);
  });
});
