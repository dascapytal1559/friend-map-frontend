// Every surface that shows a name, drawn to markup under each name choice on
// people from the made-up crowd. First name, First L., Full name and No name
// are for the map alone: the map labels (Orbits, Circles, Orbits 3D) read
// as the choice says, and every other surface draws exactly as with Full
// name. No name except… is the privacy mode: no surface lets a real name
// through but those of the people picked, nor a stand-in in place of one,
// and where something must be there to click, a neutral shape is. The other
// surfaces: the Table (people and catch-ups), the Calendar's day, the hover
// card, People, the person panel, a group's members, chats and Changes. The
// City paints its names on a canvas, with the same labels (useNames), so it
// has no markup here.

import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CROWD_FIRST, CROWD_LAST } from "../server/fixtures/madeUpNames.ts";
import type { CalendarDay, CatchUp, ChangesetInfo, GroupMembership, MergeProposal, PersonRelationship, PersonSummary, RelationshipsReport, TablePerson, TimelineMessage } from "./archive.ts";
import { CATCH_UP_SORT } from "./demos/catchUpsTable.ts";
import { CatchUpsTable } from "./demos/CatchUpsTable.tsx";
import { DayContent } from "./demos/DayPanel.tsx";
import { ChangeItem } from "./demos/ChangesPanel.tsx";
import { changeEntry, changeLine } from "./demos/changesList.ts";
import { buildModel } from "./demos/model.ts";
import { OrbitMap } from "./demos/Orbits.tsx";
import { Orbits3DMap } from "./demos/Orbits3D.tsx";
import { columnsFor, PersonRow } from "./demos/Table.tsx";
import { HoverCard } from "./demos/view.tsx";
import { GroupMembers } from "./GroupChat.tsx";
import { NAME_STYLES, type NameStyle, nameStyleStore, namesFor, NOBODY } from "./names.ts";
import { connectionsOf } from "./shownNames.ts";
import { settingsOpenStore } from "./ViewSettings.tsx";
import { ViewList } from "./ViewSwitcher.tsx";
import { PeopleList, Review } from "./PeoplePanel.tsx";
import { DraftEditor } from "./DraftBox.tsx";
import { NamesField } from "./NameChips.tsx";
import { AccountList, NoteEditor } from "./PersonParts.tsx";
import { Message } from "./Timeline.tsx";

const NOW = Date.parse("2026-03-15T12:00:00+11:00");

// Twelve people of the made-up crowd, each with an alias, a note and a draft that name them.
const crowdNames = CROWD_FIRST.slice(0, 12).map((first, i) => `${first} ${CROWD_LAST[i]}`);
const people: PersonSummary[] = crowdNames.map((name, i) => summary(i + 1, name));
/** A draft to them that names them. */
const draftTo = (p: PersonSummary) => ({ id: p.id, personId: p.id, text: `Draft for ${p.name.split(" ")[0]}`, createdAt: 0, updatedAt: 0 });
/** Every word of their names, aliases, notes and drafts: none may show unless names are. */
const realWords = [...new Set(people.flatMap((p) => [p.name, ...p.aliases, p.note, draftTo(p).text].join(" ").split(/\s+/)))]
  .filter((word) => /^[A-Z][a-z]{2,}$/.test(word) && !["Nickname", "Note", "Draft"].includes(word));

function summary(id: number, name: string): PersonSummary {
  const first = name.split(" ")[0];
  return {
    id, name, aliases: [`${first}o`], tags: ["climbing"], note: `Note about ${name}`, noteFromContacts: false, shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null,
    edited: true, untouched: false, archived: null, archiveRule: null, location: null,
    accounts: [{
      id: id * 10, platform: "messenger", displayName: name, handle: null, link: "import",
      messageCount: 5, directMessageCount: 5, groupMessageCount: 0, lastMessageAt: NOW,
    }],
    messageCount: 5, directMessageCount: 5, groupMessageCount: 0, marketplaceMessageCount: 0, lastMessageAt: NOW,
    unknown: false, lastByPlatform: [{ platform: "messenger", at: NOW }], joined: null,
  };
}

function tablePerson(p: PersonSummary): TablePerson {
  return {
    id: p.id, name: p.name, aliases: p.aliases, tags: p.tags, note: p.note, identiconSeed: p.identiconSeed, identiconHue: p.identiconHue, location: null, unknown: false, untouched: false, archived: null,
    platforms: ["messenger"], messageCount: 5, directMessageCount: 5, groupMessageCount: 0, lastMessageAt: NOW, byPlatform: [], calls: null, addedAt: 1, firstContactAt: null, closeness: 3,
  };
}

function relationship(p: PersonSummary, i: number): PersonRelationship {
  const counts = { directFromMe: 20 + i, directFromThem: 20, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 };
  return {
    id: p.id, name: p.name, aliases: p.aliases, tags: [], note: "", shouldReachOut: false, identiconSeed: p.identiconSeed, identiconHue: p.identiconHue, location: null, unknown: false, platforms: ["messenger"],
    totals: counts, firstMessageAt: NOW - 40 * 86_400_000, lastMessageAt: NOW, months: [{ month: "2026-03", ...counts }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}

function message(over: Partial<TimelineMessage>): TimelineMessage {
  return {
    id: 1, platform: "whatsapp", conversation: { id: 9, type: "group", title: `${crowdNames[0]} and friends`, marketplace: false },
    sentAt: NOW, fromSelf: false, sender: crowdNames[1], type: "text", text: "hello", unsent: false, callSeconds: null, callLengthGiven: false, callNote: "", attachments: [],
    reactions: [{ emoji: "👍", actor: crowdNames[2] }], ...over,
  };
}

const changeset: ChangesetInfo = {
  id: 12, at: NOW, surface: "cli", action: `edit name ${crowdNames[3]}`, description: `rename ${crowdNames[3]}`, backup: null,
  undoes: null, undoneBy: null,
  people: [{ id: 4, name: crowdNames[3], changes: [{ what: "name", before: "x", after: crowdNames[3] }] }],
  peopleCount: 1, other: [`said ${crowdNames[4]} and ${crowdNames[5]} are different people`],
};

/** A catch-up with two of them, its note naming the first. */
const catchUp: CatchUp = {
  id: 3, day: "2026-03-14", time: "19:30", hours: 2, trip: null, byCall: false, note: people[0].note, others: 0,
  people: people.slice(0, 2).map(({ id, name, aliases }) => ({ id, name, aliases })),
};

/** A Calendar day: that catch-up, a one-to-one chat with the first and a titled group chat. */
const calendarDay: CalendarDay = {
  day: "2026-03-14",
  catchUps: [catchUp],
  calls: [],
  chats: [
    { id: 1, type: "direct", people: [1], platform: "messenger", title: crowdNames[0], size: 2, namedBy: [], messages: 3, first: NOW, last: NOW },
    { id: 2, type: "group", people: [2, 3], platform: "whatsapp", title: `${crowdNames[0]} and friends`, size: 4, namedBy: [], messages: 2, first: NOW, last: NOW },
  ],
  people: people.slice(0, 3).map(({ id, name, aliases, identiconSeed, identiconHue }) => ({ id, name, aliases, tags: [], identiconSeed, identiconHue })),
};

const noop = () => {};
const mapModel = () => buildModel({ generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: people.map(relationship) });
/** Each surface, by what you call it. */
const surfaces: Record<string, () => ReactElement> = {
  "map labels": () => {
    const model = buildModel({ generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: people.map(relationship) });
    return createElement(OrbitMap, {
      model, width: 1400, height: 1000, inset: 60, hover: noop, open: noop,
    });
  },
  "Circles map labels": () => createElement(OrbitMap, { model: mapModel(), width: 1400, height: 1000, inset: 60, hover: noop, open: noop, order: "circles" }),
  "Orbits 3D map labels": () => createElement(Orbits3DMap, { model: mapModel(), width: 1400, height: 1000, inset: 60, hover: noop, open: noop }),
  "the Calendar's day": () => createElement(DayContent, { data: calendarDay, hide: {}, groups: true, onOpenPerson: noop }),
  "the Table's catch-ups": () => createElement(CatchUpsTable, {
    rows: [catchUp], sort: CATCH_UP_SORT, onSort: noop, openId: null, onOpenAt: noop, navigate: () => noop, editing: null, onEdit: noop, settings: { catchUpHourWorth: 20, groupSharedPart: 0.5, tripFullHours: 8 }, top: 0,
  }),
  "hover card": () => {
    const model = buildModel({ generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups: [], people: people.map(relationship) });
    return createElement(HoverCard, { tip: { x: 10, y: 10, person: model.people[0], rows: [["Closeness", "#1"]] }, bounds: { width: 1000, height: 800 } });
  },
  "the person panel's name, aliases, note and draft": () => createElement("div", null,
    createElement(NamesField, { person: people[0] }),
    createElement(NoteEditor, { person: people[0] }),
    createElement(DraftEditor, { personId: people[0].id, draft: draftTo(people[0]), label: "Draft" })),
  "accounts": () => createElement(AccountList, { person: people[0] }),
  "People": () => createElement(PeopleList, { listing: { people, me: people[11], tags: [{ tag: "climbing", count: 12 }] }, onOpen: noop }),
  "merge proposals": () => {
    const proposal: MergeProposal = { id: 1, tier: "high", evidence: [{ rule: "name-exact" } as MergeProposal["evidence"][number]], people: [people[0], people[1]] };
    return createElement(Review, { proposals: [proposal], onOpen: noop });
  },
  "the Table": () => createElement("table", null, createElement("tbody", null, people.map((p, i) =>
    createElement(PersonRow, { key: p.id, row: tablePerson(p), rank: i + 1, index: i, columns: columnsFor(null), open: false, onOpen: noop, now: NOW })))),
  "chat senders, group titles and reactions": () => createElement("div", null,
    createElement(Message, { message: message({}) }),
    createElement(Message, { message: message({ id: 2, conversation: { id: 8, type: "direct", title: crowdNames[6], marketplace: false }, sender: crowdNames[6] }) }),
    createElement(Message, { message: message({ id: 3, conversation: { id: 7, type: "direct", title: `${crowdNames[7]} · Bike`, marketplace: true }, sender: crowdNames[7] }) })),
  "a group's members": () => createElement(GroupMembers, {
    group: {
      id: 9, title: `${crowdNames[0]} and friends`, platform: "whatsapp", people: 6, fromMe: 3, messageCount: 20, firstMessageAt: NOW, lastMessageAt: NOW,
      members: people.slice(0, 5).map(({ id, name, aliases }) => ({ id, name, aliases, messages: 4, untouched: false, archived: false })),
    },
    onOpenPerson: noop,
  }),
  "Changes": () => createElement(ChangeItem, {
    entry: changeEntry(changeset, namesFor(nameStyleStore.get(), nameStyleStore.named()), NOW), details: false, confirming: false,
    onOpen: noop, onDetails: noop, onUndo: noop, onConfirm: noop, onCancel: noop,
  }),
};

/** Whom No name except… names in these tests: the second and third of them. */
const picked = new Set([people[1].id, people[2].id]);
/** The words of their names, which it may show; every other real word stays hidden. */
const pickedWords = new Set(people.filter((p) => picked.has(p.id)).flatMap((p) => p.name.split(/\s+/)));
/** The surfaces that draw the map's own labels, which First name, First L., Full name and No name change. */
const MAP_SURFACES = ["map labels", "Circles map labels", "Orbits 3D map labels"];
/** The map's own choices, which change nothing off the map. */
const MAP_ONLY: NameStyle[] = ["first", "initial", "hide"];

function draw(style: NameStyle, surface: () => ReactElement, named: ReadonlySet<number> = picked): string {
  nameStyleStore.set(style);
  nameStyleStore.setNamed(style === "except" ? named : NOBODY);
  return renderToStaticMarkup(surface());
}

/** The real names in `html`, as whole words. */
const leaks = (html: string) => realWords.filter((word) => new RegExp(`\\b${word}\\b`).test(html));
/** The names a map drew. */
const labels = (html: string) => [...html.matchAll(/<text[^>]*class="orbits__name[^"]*"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

// The map asks the window whether motion is reduced; there is none here.
beforeAll(() => void vi.stubGlobal("window", {}));
afterEach(() => {
  nameStyleStore.set("full");
  nameStyleStore.setNamed(NOBODY);
});

describe("the name choice on every surface", () => {
  it("has real words to look for", () => {
    expect(crowdNames).toHaveLength(12);
    expect(realWords.length).toBeGreaterThan(12);
  });

  for (const [name, surface] of Object.entries(surfaces)) {
    describe(name, () => {
      it("shows real names with Full name", () => {
        expect(leaks(draw("full", surface)).length).toBeGreaterThan(0);
      });

      if (!MAP_SURFACES.includes(name)) {
        it("draws just as with Full name with First name, First L. and No name, which are for the map alone", () => {
          const full = draw("full", surface);
          for (const style of MAP_ONLY) expect([style, draw(style, surface)]).toEqual([style, full]);
        });
      }

      it("shows only the picked people's names with No name except…, and no stand-in", () => {
        const html = draw("except", surface);
        expect(leaks(html).filter((word) => !pickedWords.has(word))).toEqual([]);
        expect(html).not.toMatch(/Person \d/);
      });

      it("shows no real name at all with No name except… and nobody picked", () => {
        const html = draw("except", surface, NOBODY);
        expect(leaks(html)).toEqual([]);
        expect(html).not.toMatch(/Person \d/);
      });
    });
  }
});

describe("how each surface labels people", () => {
  const ada = people[0];

  it("labels Orbits, Circles and Orbits 3D by the first name, it and the last's first letter, in full, or not at all", () => {
    const first = new Set(people.map((p) => p.name.split(" ")[0]));
    const initial = new Set(people.map((p) => { const words = p.name.split(" "); return `${words[0]} ${words.at(-1)![0]}.`; }));
    for (const map of MAP_SURFACES) {
      const full = labels(draw("full", surfaces[map]));
      expect([map, full.length > 0, full.every((label) => people.some((p) => p.name === label))]).toEqual([map, true, true]);
      const firsts = labels(draw("first", surfaces[map]));
      expect([map, firsts.length > 0, firsts.every((label) => first.has(label))]).toEqual([map, true, true]);
      const initials = labels(draw("initial", surfaces[map]));
      expect([map, initials.length > 0, initials.every((label) => initial.has(label))]).toEqual([map, true, true]);
      expect([map, labels(draw("hide", surfaces[map]))]).toEqual([map, []]);
      // No name except…: only those picked, each as Full name draws them, and nobody else's in their place.
      const named = people.filter((p) => picked.has(p.id) && full.includes(p.name)).map((p) => p.name);
      expect([map, named.length]).toEqual([map, 2]);
      expect([map, labels(draw("except", surfaces[map])).sort()]).toEqual([map, named.sort()]);
    }
  });

  it("names those picked in the Table and its rows, and gives everyone else a neutral shape, every row still there to click", () => {
    const table = draw("except", surfaces["the Table"]);
    expect(table.match(/<tr /g)).toHaveLength(12);
    for (const p of people) expect([p.id, table.includes(`>${p.name}<`)]).toEqual([p.id, picked.has(p.id)]);
    expect(table.match(/class="name-hidden"/g)).toHaveLength(10);
  });

  it("gives a row, a hover card, a group's member or Changes a neutral shape with No name except…, so it can still be clicked", () => {
    for (const surface of ["hover card", "the Table", "People", "merge proposals", "a group's members", "Changes"]) {
      expect([surface, draw("except", surfaces[surface], NOBODY).includes('class="name-hidden"')]).toEqual([surface, true]);
      for (const style of ["full", ...MAP_ONLY] as NameStyle[]) {
        expect([surface, style, draw(style, surfaces[surface]).includes('class="name-hidden"')]).toEqual([surface, style, false]);
      }
    }
    expect(draw("except", surfaces["a group's members"], NOBODY).match(/<button[^>]*class="group-chat__member/g)).toHaveLength(5);
  });

  it("keeps the person panel's chips in full, to change, whatever the map shows; shapes, none to change, with No name except…", () => {
    for (const style of ["full", ...MAP_ONLY] as NameStyle[]) {
      const shown = draw(style, surfaces["the person panel's name, aliases, note and draft"]);
      expect([style, shown.includes(`>${ada.name}<button`), shown.includes('aria-label="Names: add a name"')]).toEqual([style, true, true]);
    }
    const hidden = draw("except", surfaces["the person panel's name, aliases, note and draft"]);
    expect(hidden.match(/class="name-chip[^"]*"><span class="name-hidden"/g)).toHaveLength(2);
    expect(hidden).not.toContain("add a name");
    expect(hidden).not.toContain("Remove the name");
    // Someone picked keeps their name, but not their aliases.
    const theirs = renderToStaticMarkup(createElement(NamesField, { person: people[1] }));
    expect(theirs).toContain(`<span role="listitem" class="name-chip name-chip--first">${people[1].name}</span>`);
    expect(theirs).not.toContain(people[1].aliases[0]);
  });

  it("names an account, a group's senders and reactions with nothing while names are hidden", () => {
    expect(draw("except", surfaces.accounts, NOBODY)).toContain('<span class="account-list__name"><span class="name-hidden"');
    const hidden = draw("except", surfaces["chat senders, group titles and reactions"], NOBODY);
    expect(hidden).toContain('<span class="message__who"><span class="name-hidden"');
    expect(hidden).toContain('title="👍"');
    // A one-to-one chat's messages are plainly theirs, so they carry no name; a Marketplace chat keeps only that it is one.
    expect(hidden).toMatch(/Marketplace ·/);
  });

  it("keeps the user's words and who changed to what out of Changes while names are hidden", () => {
    const hidden = namesFor("except", new Set([4]));
    expect(changeEntry(changeset, hidden, NOW)).toMatchObject({ action: "edit name", words: null, people: [{ id: 4, name: crowdNames[3] }], other: ["said two people are different"] });
    expect(changeEntry(changeset, namesFor("except"), NOW).people).toEqual([{ id: 4, name: "" }]);
    expect(changeLine({ what: "name", before: "x", after: crowdNames[3] }, hidden)).toBe("name: changed");
    expect(changeLine({ what: "tags", before: "", after: "climbing" }, hidden)).toBe("tags: (none) → climbing");
    for (const style of MAP_ONLY) expect(changeEntry(changeset, namesFor(style), NOW)).toEqual(changeEntry(changeset, namesFor("full"), NOW));
  });
});

describe("No name except… on the map: those picked and their connections", () => {
  const group = (id: number, memberIds: number[]): GroupMembership => ({ id, memberIds, selfOnly: false, messageCount: 4, lastMessageAt: NOW, months: [] });
  const report = (groups: GroupMembership[]): RelationshipsReport => ({ generatedAt: NOW, gapDays: 14, archivedCount: 0, catchUps: [], callDays: [], unlinks: [], groups, people: people.map(relationship) });
  // Everyone by closeness, the closest first: Show top names 4 names the first four.
  const byCloseness = [...buildModel(report([])).people].sort((a, b) => a.rank.at(-1)! - b.rank.at(-1)!).map((p) => p.id);
  const nameOf = (id: number) => people.find((p) => p.id === id)!.name;
  // One picked, out of the closest four; they share a group chat with one of the closest four (near) and two further
  // out (far), and two others, neither picked, share another.
  const [one, near, far, further, other, another] = [byCloseness[6], byCloseness[1], byCloseness[8], byCloseness[10], byCloseness[2], byCloseness[3]];
  const map = report([group(1, [one, near, far]), group(2, [one, further]), group(3, [other, another])]);
  const named = new Set([one, ...connectionsOf(new Set([one]), map)]);
  const drawMap = (held: number | null) => {
    nameStyleStore.set("except");
    nameStyleStore.setNamed(named);
    return labels(renderToStaticMarkup(createElement(OrbitMap, { model: buildModel(map), width: 1400, height: 1000, inset: 60, hover: noop, open: noop, named: 4, held }))).sort();
  };

  it("has them where the test needs them", () => {
    expect(byCloseness).toHaveLength(12);
    expect([...named].sort()).toEqual([one, near, far, further].sort());
  });

  it("names a picked person's connections by default, as anyone, only among the closest Show top names says", () => {
    expect(drawMap(null)).toEqual([nameOf(near)]);
  });

  it("names all of them, beyond Show top names, while the picked person is held, and nobody else", () => {
    expect(drawMap(one)).toEqual([one, near, far, further].map(nameOf).sort());
  });

  it("names nobody unpicked nor unconnected, even held", () => {
    expect(drawMap(other)).toEqual([nameOf(near)]);
  });
});

describe("Name format in the menu", () => {
  const menu = (demo = false, current = "orbits") => renderToStaticMarkup(createElement(ViewList, { current, onPick: noop, names: true, demo }));
  /** Name format's own toggle (the first setting in the view's settings): each choice and whether it is pressed. */
  const choices = (html: string) => {
    const names = html.slice(html.indexOf('<div class="view-switcher__setting view-switcher__names">'));
    return [...names.slice(0, names.indexOf("</div>")).matchAll(/<button type="button" aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[2], m[1]]);
  };
  /** The settings' title, the fold's button, where the dot goes. */
  const title = (html: string) => /<button type="button" class="view-switcher__group view-switcher__fold"[^>]*>.*?<\/button>/.exec(html)![0];

  // Open, so the settings are drawn; the fold is viewSettings.test.ts's.
  beforeEach(() => {
    settingsOpenStore.reload(null);
    settingsOpenStore.set(true);
  });
  afterEach(() => settingsOpenStore.set(false));

  it("is the first of the view's settings, with no section of its own", () => {
    nameStyleStore.set("full");
    for (const current of ["orbits", "web", "orbits-3d", "circles", "city", "table", "calendar", "time-river"]) {
      const html = menu(false, current);
      const settings = /<section class="view-switcher__settings"[^>]*>.*<\/section>/.exec(html)![0];
      expect(html.match(/<section/g), current).toHaveLength(1);
      expect(/<span class="view-switcher__label"[^>]*>([^<]+)<\/span>/.exec(settings)![1], current).toBe("Name format");
    }
  });

  it("offers First name, First L., Full name, No name and No name except… as a toggle, the choice pressed", () => {
    nameStyleStore.set("initial");
    const html = menu();
    expect(choices(html)).toEqual([["First name", "false"], ["First L.", "true"], ["Full name", "false"], ["No name", "false"], ["No name except…", "false"]]);
    expect(html).toContain('class="view-switcher__toggle" role="group"');
    expect(html).not.toContain("view-switcher__dot");
    expect(html).not.toContain("Name someone");
  });

  it("with No name except…, lists who it names with a box to name someone else, and marks itself beside the settings' title, folded or not", () => {
    nameStyleStore.set("except");
    const html = menu();
    expect(title(html)).toContain('class="view-switcher__dot"');
    expect(html.match(/view-switcher__dot/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Name someone"');
    settingsOpenStore.set(false);
    const folded = menu();
    expect(title(folded)).toContain('class="view-switcher__dot"');
    expect(folded).not.toContain("Name someone");
  });

  it("offers the demo the first four alone, its people all made up", () => {
    expect(choices(menu(true)).map(([title]) => title)).toEqual(NAME_STYLES.slice(0, 4).map((s) => s.title));
    expect(menu(true)).not.toContain("Name someone");
  });

  it("is not in the menu unless the page asks for it, nor its dot", () => {
    nameStyleStore.set("except");
    const html = renderToStaticMarkup(createElement(ViewList, { current: "orbits", onPick: noop, demo: false }));
    expect(html).not.toContain("view-switcher__names");
    expect(html).not.toContain("view-switcher__dot");
    expect(html).toContain(">Theme</span>");
  });

  it("is in the menu of every live view, in the real app and the demo alike, not in its header", () => {
    // The map views' page (Orbits, Circles, the City, Orbits 3D and any live view to come; it offers Look too), the Table and the Calendar.
    for (const [file, names] of [["demos/Demos.tsx", "names={live} look />"], ["demos/TablePage.tsx", "names />"], ["demos/CalendarPage.tsx", "names />"]]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect([file, source.includes(names), source.includes("NameStylePicker")]).toEqual([file, true, false]);
      expect([file, source.includes("useShownNames(!demoMode);")]).toEqual([file, true]);
    }
  });
});
