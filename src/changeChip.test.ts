import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonSummary } from "./archive.ts";
import { ArchiveError, provideArchive, type ArchiveApi } from "./archiveApi.ts";
import { addCatchUp, addPerson, archives, changeCatchUp, changeChip, CHIP_MS, CHIP_STACK, createTag, deleteCatchUp, deleteTag, saveGroupUnlinked, saveIdenticon, saveLocation, saveNames, saveTags, UNDONE_MS, type Chip } from "./changeChip.ts";
import { ChangeChipView, refusal } from "./demos/page.tsx";
import { nameStyleStore } from "./names.ts";

const ada = { id: 7, name: "Ada Sample", aliases: ["Ada S"] } as unknown as PersonSummary;

/**
 * An archive whose tag saves answer changeset 41 (making or deleting `tagged`'s tags), whose tag manager answers
 * changeset 60, and whose undo does `undo`.
 */
function provide(undo: ArchiveApi["undoChange"] = async () => ({}) as never, tagged: { created?: string[]; deleted?: string[] } = {}) {
  const api = {
    setTags: vi.fn(async (_id: number, tags: string[]) => ({
      person: { ...ada, tags }, changeset: tags.length > 0 ? 41 : null, created: tagged.created ?? [], deleted: tagged.deleted ?? [],
    })),
    createTag: vi.fn(async () => ({ tags: [], changeset: 60 })),
    deleteTag: vi.fn(async () => ({ tags: [], changeset: 60 })),
    addCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 70 })),
    changeCatchUp: vi.fn(async (id: number) => ({ catchUp: null, changeset: id === 9 ? null : 71 })),
    deleteCatchUp: vi.fn(async () => ({ catchUp: null, changeset: 72 })),
    addPerson: vi.fn(async ({ name, anyway }: { name: string; anyway?: boolean }) =>
      name === ada.name && !anyway ? { person: null, changeset: null, sameName: [{ id: 7, name: ada.name, aliases: [] }] }
        : { person: { ...ada, id: 8, name, aliases: [] }, changeset: 80, sameName: [] }),
    // Changeset 90, or none when it is already there but for case (Ada is in Brisbane).
    setLocation: vi.fn(async (_id: number, location: string | null) => ({
      person: { ...ada, location: location === "brisbane" ? "Brisbane" : location },
      changeset: location === "brisbane" ? null : 90,
    })),
    setIdenticon: vi.fn(async (_id: number, seed: string, hue: number | null) => ({ person: { ...ada, identiconSeed: seed, identiconHue: hue }, changeset: 95 })),
    // Changeset 97, or none when they are as they were.
    setNames: vi.fn(async (_id: number, names: string[]) => ({
      person: { ...ada, name: names[0], aliases: names.slice(1) },
      changeset: names.join() === [ada.name, ...ada.aliases].join() ? null : 97,
    })),
    // Changeset 99, or none when group 5 is asked to be as it is (linked).
    setGroupUnlinked: vi.fn(async (_id: number, groupId: number, unlinked: boolean) => ({ unlinked, changeset: groupId === 5 && !unlinked ? null : 99 })),
    undoChange: vi.fn(undo),
  };
  provideArchive(api as unknown as ArchiveApi);
  return api;
}

let changed: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  // archiveChanged tells the page through document; here, a listener counts it.
  const page = new EventTarget();
  changed = vi.fn();
  page.addEventListener("friend-map:archive-changed", () => changed());
  vi.stubGlobal("document", page);
});

afterEach(() => {
  changeChip.dismiss();
  nameStyleStore.set("full");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the chip after archiving someone", () => {
  it("shows for a save that adds your archive tag, and only then", async () => {
    expect(archives(["friend"], ["friend", "archive"])).toBe(true);
    expect(archives(["archive"], ["archive", "friend"])).toBe(false);
    expect(archives(["archive"], [])).toBe(false);
    expect(archives([], ["friend"])).toBe(false);

    provide();
    await saveTags(7, [], ["friend"]);
    expect(changeChip.get()).toBeNull();
    const saved = await saveTags(7, ["friend"], ["friend", "archive"]);
    expect(saved).toMatchObject({ id: 7, tags: ["friend", "archive"] });
    expect(changeChip.get()).toMatchObject({ what: { kind: "archived", who: { id: 7, name: "Ada Sample" } }, changeset: 41, phase: "shown" });
  });

  it("goes by itself after a few seconds, or when dismissed", async () => {
    provide();
    await saveTags(7, [], ["archive"]);
    vi.advanceTimersByTime(CHIP_MS - 1);
    expect(changeChip.get()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(changeChip.get()).toBeNull();

    await saveTags(7, [], ["archive"]);
    changeChip.dismiss();
    expect(changeChip.get()).toBeNull();
  });

  it("undoes that archive's changeset, tells the page, and says they are back", async () => {
    const api = provide();
    await saveTags(7, [], ["archive"]);
    const undoing = changeChip.undo();
    expect(changeChip.get()?.phase).toBe("undoing");
    await undoing;
    expect(api.undoChange).toHaveBeenCalledWith(41);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changeChip.get()?.phase).toBe("undone");
    vi.advanceTimersByTime(UNDONE_MS);
    expect(changeChip.get()).toBeNull();
  });

  it("says why when the undo is refused, and stays until dismissed", async () => {
    provide(async () => {
      throw new ArchiveError("POST /changes/41/undo failed (409)", "can't undo #41: changed again since: Ada Sample [person 7] (tags)");
    });
    await saveTags(7, [], ["archive"]);
    await changeChip.undo();
    expect(changed).not.toHaveBeenCalled();
    expect(changeChip.get()).toMatchObject({ phase: "refused", reason: "can't undo #41: changed again since: Ada Sample [person 7] (tags)" });
    vi.advanceTimersByTime(CHIP_MS * 10);
    expect(changeChip.get()?.phase).toBe("refused");
  });
});

describe("the chip after a tag is made or deleted", () => {
  it("names a tag a person's tag box made, or deleted as nobody has it now, and an archive in the same save wins", async () => {
    provide(undefined, { created: ["night-owls"] });
    await saveTags(7, ["friend"], ["friend", "night-owls"]);
    expect(changeChip.get()).toMatchObject({ what: { kind: "tags", created: ["night-owls"], deleted: [], emptied: true }, changeset: 41, phase: "shown" });
    provide(undefined, { deleted: ["oops"] });
    await saveTags(7, ["friend", "oops"], ["friend"]);
    expect(changeChip.get()).toMatchObject({ what: { kind: "tags", created: [], deleted: ["oops"] }, changeset: 41 });
    provide(undefined, { deleted: ["oops"] });
    await saveTags(7, ["oops"], ["archive"]);
    expect(changeChip.get()?.what.kind).toBe("archived");
    changeChip.dismiss();
    provide();
    await saveTags(7, ["friend"], ["friend", "uni"]);
    expect(changeChip.get()).toBeNull();
  });

  it("names a tag the tag manager made or deleted, and undoes its changeset", async () => {
    const api = provide();
    await createTag("later");
    expect(api.createTag).toHaveBeenCalledWith("later");
    expect(changeChip.get()).toMatchObject({ what: { kind: "tags", created: ["later"], deleted: [], emptied: false }, changeset: 60 });
    await deleteTag("later");
    expect(api.deleteTag).toHaveBeenCalledWith("later");
    expect(changeChip.get()).toMatchObject({ what: { kind: "tags", created: [], deleted: ["later"], emptied: false }, changeset: 60 });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(60);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changeChip.get()?.phase).toBe("undone");
  });

  it("is drawn naming the tags, with Undo, then what was undone or why not", () => {
    const tags = (created: string[], deleted: string[], emptied: boolean, phase: Chip["phase"] = "shown", reason: string | null = null) =>
      renderToStaticMarkup(createElement(ChangeChipView, {
        chip: { what: { kind: "tags", created, deleted, emptied }, changeset: 60, phase, reason }, onUndo: () => {}, onDismiss: () => {},
      }));
    expect(tags(["later"], [], false)).toContain("Created tag <strong>later</strong>");
    expect(tags(["later"], [], false)).toContain(">Undo</button>");
    expect(tags([], ["later"], false)).toContain("Deleted tag <strong>later</strong></span>");
    expect(tags([], ["oops"], true)).toContain("Deleted tag <strong>oops</strong>, as nobody has it now");
    expect(tags(["a"], ["b", "c"], true)).toContain("Created tag <strong>a</strong>, deleted tags <strong>b</strong>, <strong>c</strong>, as nobody has them now");
    expect(tags(["later"], [], false, "undoing")).toContain("Undoing…");
    expect(tags([], ["oops"], true, "undone")).toContain("Undid deleting tag <strong>oops</strong>");
    expect(tags([], ["oops"], true, "undone")).not.toContain(">Undo<");
    expect(tags(["later"], [], false, "refused", "can't undo #60: changed again since: the tag \"later\" (tags)"))
      .toContain("Can’t undo creating tag <strong>later</strong>: changed again since: the tag &quot;later&quot; (tags)");
  });
});

describe("the chip after a catch-up is added, changed or deleted", () => {
  const call = { day: "2026-09-27", time: null, hours: 1.5, trip: null, note: "", personIds: [7], others: 0 } as const;

  it("names the catch-up and undoes its changeset; a change that changed nothing shows none", async () => {
    const api = provide();
    await addCatchUp({ ...call, personIds: [7] });
    expect(changeChip.get()).toMatchObject({ what: { kind: "event", done: "added", what: "hangout of 1.5 hours on 27 Sept 2026" }, changeset: 70 });
    await changeCatchUp(3, { ...call, hours: 1, time: null, trip: null, personIds: [7] });
    expect(changeChip.get()).toMatchObject({ what: { done: "changed", what: "hangout of 1 hour on 27 Sept 2026" }, changeset: 71 });
    await deleteCatchUp({ id: 3, ...call, people: [] });
    expect(changeChip.get()).toMatchObject({ what: { done: "deleted" }, changeset: 72 });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(72);
    changeChip.dismiss();
    await changeCatchUp(9, { ...call, personIds: [7] });
    expect(changeChip.get()).toBeNull();
  });

  it("is drawn saying what was done, with Undo, then what was undone or why not", () => {
    const draw = (done: "added" | "changed" | "deleted" | "converted", phase: Chip["phase"] = "shown") => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "event", done, what: "hangout of 1.5 hours on 27 Sept 2026" }, changeset: 70, phase, reason: "can't undo #70: changed again since" },
      onUndo: () => {}, onDismiss: () => {},
    }));
    expect(draw("added")).toContain("Added a <strong>hangout of 1.5 hours on 27 Sept 2026</strong>");
    expect(draw("added")).toContain(">Undo</button>");
    expect(draw("changed")).toContain("Changed the <strong>hangout of 1.5 hours on 27 Sept 2026</strong>");
    expect(draw("deleted")).toContain("Deleted the <strong>hangout of 1.5 hours on 27 Sept 2026</strong>");
    expect(draw("deleted", "undone")).toContain("Undid deleting the <strong>hangout of 1.5 hours on 27 Sept 2026</strong>");
    expect(draw("added", "refused")).toContain("Can’t undo adding the <strong>hangout of 1.5 hours on 27 Sept 2026</strong>: changed again since");
    // A call made a hangout is named as it is now.
    expect(draw("converted")).toContain("Made it a <strong>hangout of 1.5 hours on 27 Sept 2026</strong>");
    expect(draw("converted", "undone")).toContain("Undid making it a <strong>hangout of 1.5 hours on 27 Sept 2026</strong>");
  });
});

describe("the chip after someone is added by hand", () => {
  it("names them and undoes their changeset; nobody added when someone goes by that name shows none", async () => {
    const api = provide();
    expect((await addPerson({ name: "Ada Sample" })).sameName).toEqual([{ id: 7, name: "Ada Sample", aliases: [] }]);
    expect(changeChip.get()).toBeNull();
    await addPerson({ name: "Ada Sample", anyway: true });
    expect(changeChip.get()).toMatchObject({ what: { kind: "added", who: { id: 8, name: "Ada Sample" } }, changeset: 80 });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(80);
  });

  it("says who was added, taken away, or why not", () => {
    const draw = (phase: Chip["phase"]) => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "added", who: { id: 8, name: "Walt Example", aliases: [] } }, changeset: 80, phase, reason: "can't undo #80: given an account since" },
      onUndo: () => {},
      onDismiss: () => {},
    }));
    expect(draw("shown")).toContain("Added <strong>Walt Example</strong>");
    expect(draw("undone")).toContain("<strong>Walt Example</strong> is gone again");
    expect(draw("refused")).toContain("Can’t undo adding <strong>Walt Example</strong>: given an account since");
  });
});

describe("the chip after a location is set", () => {
  it("names them and the place, or says it was cleared, and undoes its changeset; no change shows none", async () => {
    const api = provide();
    expect(await saveLocation(7, "Melbourne")).toMatchObject({ id: 7, location: "Melbourne" });
    expect(api.setLocation).toHaveBeenCalledWith(7, "Melbourne");
    expect(changeChip.get()).toMatchObject({ what: { kind: "location", who: { id: 7 }, location: "Melbourne" }, changeset: 90, phase: "shown" });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(90);
    expect(changed).toHaveBeenCalled();
    expect(changeChip.get()).toMatchObject({ phase: "undone" });

    changeChip.dismiss();
    await saveLocation(7, "brisbane");
    expect(changeChip.get()).toBeNull();
    await saveLocation(7, null);
    expect(changeChip.get()).toMatchObject({ what: { kind: "location", location: null }, changeset: 90 });
  });

  it("says where they are now, cleared, put back, or why not", () => {
    const draw = (location: string | null, phase: Chip["phase"]) => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "location", who: { id: 8, name: "Walt Example", aliases: [] }, location }, changeset: 90, phase, reason: "can't undo #90: changed again since" },
      onUndo: () => {},
      onDismiss: () => {},
    }));
    expect(draw("Melbourne", "shown")).toContain("<strong>Walt Example</strong> is in <strong>Melbourne</strong>");
    expect(draw(null, "shown")).toContain("Cleared where <strong>Walt Example</strong> is");
    expect(draw("Melbourne", "undone")).toContain("Put back where <strong>Walt Example</strong> is");
    expect(draw("Melbourne", "refused")).toContain("Can’t undo where <strong>Walt Example</strong> is: changed again since");
  });
});

describe("the chip after a call is said to be answered, missed or unknown", () => {
  it("says what the call on its day is now, set back as its source says, undone, or why not", () => {
    const draw = (answered: boolean | null, set: boolean, phase: Chip["phase"] = "shown") => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "call-answered", day: "3 Oct 2026", answered, set }, changeset: 91, phase, reason: "can't undo #91: changed again since" },
      onUndo: () => {},
      onDismiss: () => {},
    }));
    expect(draw(false, true)).toContain("Set the call on <strong>3 Oct 2026</strong> to <strong>missed</strong>");
    expect(draw(null, true)).toContain("to <strong>unknown</strong>");
    expect(draw(true, false)).toContain("Set the call on <strong>3 Oct 2026</strong> back to <strong>answered</strong>, as its source says");
    expect(draw(false, true, "undone")).toContain("Undid whether the call on <strong>3 Oct 2026</strong> was answered");
    expect(draw(false, true, "refused")).toContain("Can’t undo whether the call on <strong>3 Oct 2026</strong> was answered: changed again since");
  });
});

describe("the chip after someone is unlinked from a group chat", () => {
  const group = { id: 4, title: "Book club", platform: "telegram", people: 12, fromThem: 0, fromMe: 4, lastMessageAt: null, namedBy: [], unlinked: false };

  it("names them and the group, and undoes its changeset; no change shows none", async () => {
    const api = provide();
    expect(await saveGroupUnlinked(ada, group, true)).toBe(true);
    expect(api.setGroupUnlinked).toHaveBeenCalledWith(7, 4, true);
    expect(changeChip.get()).toMatchObject({ what: { kind: "group-link", who: { id: 7 }, group: { title: "Book club" }, unlinked: true }, changeset: 99, phase: "shown" });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(99);
    expect(changed).toHaveBeenCalled();

    changeChip.dismiss();
    expect(await saveGroupUnlinked(ada, { ...group, id: 5 }, false)).toBe(false);
    expect(changeChip.get()).toBeNull();
  });

  it("says it no longer connects them, or connects them again, undone, or why not", () => {
    const draw = (unlinked: boolean, phase: Chip["phase"]) => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "group-link", who: { id: 8, name: "Walt Example", aliases: [] }, group, unlinked }, changeset: 99, phase, reason: "can't undo #99: changed again since" },
      onUndo: () => {},
      onDismiss: () => {},
    }));
    expect(draw(true, "shown")).toContain("<strong>Book club</strong> no longer connects <strong>Walt Example</strong>");
    expect(draw(false, "shown")).toContain("<strong>Book club</strong> connects <strong>Walt Example</strong> again");
    expect(draw(true, "undone")).toContain("Undid unlinking <strong>Walt Example</strong> from <strong>Book club</strong>");
    expect(draw(false, "refused")).toContain("Can’t undo linking <strong>Walt Example</strong> through <strong>Book club</strong>: changed again since");
  });
});

describe("the chip after a change to someone's names", () => {
  it("says what changed, and undoes its changeset; nothing for no change", async () => {
    const api = provide();
    expect(await saveNames(7, ["Ada Sample", "Ada S"], ["Ada S", "Ada Sample"])).toMatchObject({ id: 7, name: "Ada S", aliases: ["Ada Sample"] });
    expect(api.setNames).toHaveBeenCalledWith(7, ["Ada S", "Ada Sample"]);
    expect(changeChip.get()).toMatchObject({ what: { kind: "names", who: { id: 7, name: "Ada S" }, change: { done: "first", name: "Ada S" } }, changeset: 97, phase: "shown" });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(97);
    expect(changeChip.get()).toMatchObject({ phase: "undone" });
    changeChip.dismiss();
    await saveNames(7, ["Ada Sample", "Ada S"], ["Ada Sample", "Ada S"]);
    expect(changeChip.get()).toBeNull();
  });

  it("names the name added, removed or renamed, or the new first; made up with Demo names", () => {
    const who = { id: 8, name: "Walt Example", aliases: ["Walt E"] };
    const draw = (change: Extract<Chip["what"], { kind: "names" }>["change"], phase: Chip["phase"] = "shown") => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "names", who, change }, changeset: 97, phase, reason: "can't undo #97: changed again since" },
      onUndo: () => {},
      onDismiss: () => {},
    }));
    expect(draw({ done: "added", name: "Walt E" })).toContain("<strong>Walt Example</strong> also goes by <strong>Walt E</strong>");
    expect(draw({ done: "removed", name: "Wally" })).toContain("Took the name <strong>Wally</strong> from <strong>Walt Example</strong>");
    expect(draw({ done: "renamed", from: "Wally", to: "Walt E" })).toContain("Renamed <strong>Wally</strong> to <strong>Walt E</strong>");
    expect(draw({ done: "first", name: "Walt Example" })).toContain("Put <strong>Walt Example</strong> first: their name now");
    expect(draw({ done: "reordered" })).toContain("Put <strong>Walt Example</strong>’s names in a new order");
    expect(draw({ done: "added", name: "Walt E" }, "undone")).toContain("Put back <strong>Walt Example</strong>’s names");
    expect(draw({ done: "added", name: "Walt E" }, "refused")).toContain("Can’t undo the change to <strong>Walt Example</strong>’s names");
    try {
      // The map's own choices leave it be; No name except… keeps every name out of it.
      nameStyleStore.set("initial");
      expect(draw({ done: "added", name: "Walt E" })).toContain("<strong>Walt Example</strong> also goes by <strong>Walt E</strong>");
      nameStyleStore.set("except");
      const hidden = draw({ done: "added", name: "Walt E" });
      expect(hidden).not.toContain("Walt");
      expect(hidden).toContain('aria-label="Name hidden"');
    } finally {
      nameStyleStore.set("full");
    }
  });
});

describe("the chip after a new identicon", () => {
  it("names them, for a colour picked or a new picture, and undoes its changeset", async () => {
    const api = provide();
    expect(await saveIdenticon(7, "0123456789abcdef", 200, "colour")).toMatchObject({ id: 7, identiconSeed: "0123456789abcdef", identiconHue: 200 });
    expect(api.setIdenticon).toHaveBeenCalledWith(7, "0123456789abcdef", 200);
    expect(changeChip.get()).toMatchObject({ what: { kind: "identicon", who: { id: 7 }, done: "colour" }, changeset: 95, phase: "shown" });
    await changeChip.undo();
    expect(api.undoChange).toHaveBeenCalledWith(95);
    expect(changeChip.get()).toMatchObject({ phase: "undone" });
  });

  it("says a new colour or a new icon, put back, or why not", () => {
    const draw = (done: "colour" | "picture", phase: Chip["phase"]) => renderToStaticMarkup(createElement(ChangeChipView, {
      chip: { what: { kind: "identicon", who: { id: 8, name: "Walt Example", aliases: [] }, done }, changeset: 95, phase, reason: "can't undo #95: changed again since" },
      onUndo: () => {},
      onDismiss: () => {},
    }));
    expect(draw("colour", "shown")).toContain("New colour for <strong>Walt Example</strong>");
    expect(draw("picture", "shown")).toContain("New icon for <strong>Walt Example</strong>");
    expect(draw("colour", "undone")).toContain("Put back <strong>Walt Example</strong>’s icon");
    expect(draw("picture", "refused")).toContain("Can’t undo <strong>Walt Example</strong>’s new icon: changed again since");
  });
});

describe("the chips after quick changes", () => {
  const bea = { id: 8, name: "Bea Placeholder", aliases: [] };
  const changesets = () => changeChip.all().map((chip) => chip.changeset);

  it("stack, the newest last, each with its own few seconds", () => {
    changeChip.show({ kind: "archived", who: ada }, 41);
    vi.advanceTimersByTime(2000);
    changeChip.show({ kind: "archived", who: bea }, 42);
    expect(changesets()).toEqual([41, 42]);
    expect(changeChip.get()).toMatchObject({ changeset: 42 });
    vi.advanceTimersByTime(CHIP_MS - 2000);
    expect(changesets()).toEqual([42]);
    vi.advanceTimersByTime(1999);
    expect(changesets()).toEqual([42]);
    vi.advanceTimersByTime(1);
    expect(changesets()).toEqual([]);
  });

  it("go one at a time when dismissed, and the same change again keeps its place", () => {
    changeChip.show({ kind: "archived", who: ada }, 41);
    changeChip.show({ kind: "archived", who: bea }, 42);
    changeChip.show({ kind: "location", who: ada, location: "Perth" }, 43);
    changeChip.dismiss(42);
    expect(changesets()).toEqual([41, 43]);
    changeChip.show({ kind: "archived", who: 2 }, 41);
    expect(changesets()).toEqual([41, 43]);
    expect(changeChip.all()[0].what).toEqual({ kind: "archived", who: 2 });
  });

  it("show at most CHIP_STACK, the oldest going early, but not one being undone", async () => {
    let finish = () => {};
    const api = provide(() => new Promise((done) => (finish = () => done({} as never))));
    for (let i = 0; i < CHIP_STACK; i++) changeChip.show({ kind: "archived", who: ada }, 100 + i);
    const undoing = changeChip.undo(100);
    changeChip.show({ kind: "archived", who: bea }, 200);
    expect(changeChip.all()).toHaveLength(CHIP_STACK);
    expect(changesets()).toEqual([100, ...Array.from({ length: CHIP_STACK - 2 }, (_, i) => 102 + i), 200]);
    finish();
    await undoing;
    expect(api.undoChange).toHaveBeenCalledWith(100);
    expect(changeChip.all()[0]).toMatchObject({ changeset: 100, phase: "undone" });
    changeChip.show({ kind: "archived", who: bea }, 201);
    expect(changesets()).toEqual([...Array.from({ length: CHIP_STACK - 2 }, (_, i) => 102 + i), 200, 201]);
  });

  it("undo an older one's own change, or say on it why not", async () => {
    const api = provide(async (changeset) => {
      if (changeset === 41) throw new ArchiveError("POST /changes/41/undo failed (409)", "can't undo #41: changed again since: Ada Sample [person 7] (tags)");
      return {} as never;
    });
    changeChip.show({ kind: "archived", who: ada }, 40);
    changeChip.show({ kind: "archived", who: ada }, 41);
    changeChip.show({ kind: "archived", who: bea }, 42);
    await changeChip.undo(40);
    expect(api.undoChange).toHaveBeenCalledWith(40);
    expect(changeChip.all().map((chip) => chip.phase)).toEqual(["undone", "shown", "shown"]);
    await changeChip.undo(41);
    expect(changeChip.all()[1]).toMatchObject({ phase: "refused", reason: "can't undo #41: changed again since: Ada Sample [person 7] (tags)" });
    expect(changeChip.all()[2].phase).toBe("shown");
    vi.advanceTimersByTime(UNDONE_MS);
    expect(changesets()).toEqual([41, 42]);
    vi.advanceTimersByTime(CHIP_MS);
    expect(changesets()).toEqual([41]);
  });

  it("hold their time while pointed at or focused, and run on for what was left", () => {
    changeChip.show({ kind: "archived", who: ada }, 41);
    changeChip.show({ kind: "archived", who: bea }, 42);
    vi.advanceTimersByTime(4000);
    changeChip.hold(41, "pointer", true);
    changeChip.hold(41, "focus", true);
    vi.advanceTimersByTime(CHIP_MS * 5);
    expect(changesets()).toEqual([41]);
    changeChip.hold(41, "pointer", false);
    vi.advanceTimersByTime(CHIP_MS);
    expect(changesets()).toEqual([41]);
    changeChip.hold(41, "focus", false);
    vi.advanceTimersByTime(CHIP_MS - 4000 - 1);
    expect(changesets()).toEqual([41]);
    vi.advanceTimersByTime(1);
    expect(changesets()).toEqual([]);
  });
});

describe("the chip as drawn", () => {
  const chip = (phase: Chip["phase"], reason: string | null = null): Chip => ({ what: { kind: "archived", who: ada }, changeset: 41, phase, reason });
  const draw = (c: Chip) => renderToStaticMarkup(createElement(ChangeChipView, { chip: c, onUndo: () => {}, onDismiss: () => {} }));

  it("names who was archived, with Undo and Dismiss", () => {
    const html = draw(chip("shown"));
    expect(html).toContain("Archived <strong>Ada Sample</strong>");
    expect(html).toMatch(/<button[^>]*class="change-chip__undo"[^>]*>Undo<\/button>/);
    expect(html).toContain('aria-label="Dismiss"');
    expect(draw(chip("undone"))).toContain("<strong>Ada Sample</strong> is back");
    expect(draw(chip("undone"))).not.toContain(">Undo<");
  });

  it("says why an undo was refused, in the archive's words", () => {
    const html = draw(chip("refused", "can't undo #41: changed again since: Ada Sample [person 7] (tags)"));
    expect(html).toContain("change-chip--refused");
    expect(html).toContain("Can’t undo archiving <strong>Ada Sample</strong>: changed again since: Ada Sample [person 7] (tags)");
  });

  it("follows the name choice, and keeps names out of a refusal while they are hidden", () => {
    nameStyleStore.set("hide");
    expect(draw(chip("shown"))).toContain("Ada Sample");
    nameStyleStore.set("except");
    const hidden = draw(chip("refused", "can't undo #41: changed again since: Ada Sample [person 7] (tags)"));
    expect(hidden).not.toMatch(/Ada/);
    expect(hidden).toContain('aria-label="Name hidden"');
    expect(draw(chip("shown"))).not.toMatch(/Ada/);
    expect(refusal("can't undo #41: changed again since: Ada", true)).not.toMatch(/Ada/);
    expect(refusal("#41 was undone by #43; undo #43 to do it again", false)).toBe("#41 was undone by #43; undo #43 to do it again");
  });
});
