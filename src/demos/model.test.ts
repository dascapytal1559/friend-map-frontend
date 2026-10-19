import { describe, expect, it } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { DEFAULT_SETTINGS } from "../settings.ts";
import { monthRange } from "../time.ts";
import { friendCircles } from "./friendCircles.ts";
import { hides } from "./hideChoices.ts";
import { buildModel, communities, durationLabel, groupLinks, standing } from "./model.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-03-15T12:00:00+11:00");

function person(id: number, name: string, extra: Partial<PersonRelationship> = {}): PersonRelationship {
  return {
    id, name, aliases: [], tags: [], note: "", shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null, unknown: false, platforms: [],
    totals: { directFromMe: 0, directFromThem: 0, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0 },
    firstMessageAt: null, lastMessageAt: null, months: [],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
    ...extra,
  };
}

const counts = (directFromMe: number, directFromThem: number, groupFromThem = 0) =>
  ({ directFromMe, directFromThem, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem });

const report: RelationshipsReport = {
  generatedAt: NOW,
  gapDays: 14,
  people: [
    person(1, "Ada", {
      totals: counts(25, 15, 5),
      lastMessageAt: NOW - 3 * DAY,
      months: [
        { month: "2025-12", ...counts(5, 5) },
        { month: "2026-03", ...counts(20, 10, 5) },
      ],
    }),
    person(2, "Bea", { months: [{ month: "2025-11", ...counts(0, 0, 4) }], totals: counts(0, 0, 4) }),
    person(3, "Cy"),
  ],
  // Dot (4) and a "Facebook user" (5) are archived: counted, and named only in the groups they are in.
  archivedCount: 2, catchUps: [], callDays: [], unlinks: [],
  groups: [
    { id: 10, memberIds: [1, 2, 3], selfOnly: false, messageCount: 50, lastMessageAt: NOW, months: [] },
    { id: 11, memberIds: [2, 4], selfOnly: false, messageCount: 5, lastMessageAt: NOW, months: [] },
  ],
};

describe("buildModel", () => {
  it("leaves out archived people, whom the report only counts", () => {
    const model = buildModel(report);
    expect(model.people.map((p) => p.name)).toEqual(["Ada", "Bea", "Cy"]);
    expect(model.archivedCount).toBe(2);
    // Dot is archived, so the second group has only Bea left and binds nobody.
    expect(model.groups.map((g) => g.memberIds)).toEqual([[1, 2, 3], [2]]);
    expect(model.links).toHaveLength(3);
  });

  it("starts the months at a group's first message when that is before anyone shown wrote (archived people did)", () => {
    const withGroup: RelationshipsReport = {
      ...report,
      groups: [{
        id: 12, memberIds: [2, 4], selfOnly: false, messageCount: 4, lastMessageAt: NOW,
        months: [{ month: "2025-09", messages: 4, fromMe: 2, fromMembers: [{ id: 2, count: 1 }, { id: 4, count: 1 }] }],
      }],
    };
    const model = buildModel(withGroup);
    expect(model.months[0]).toBe("2025-09");
    // What Bea and I wrote there in September counts for her, as it does for the Table's score (worked out over everyone).
    expect(model.people.find((p) => p.name === "Bea")!.closeness[0]).toBeGreaterThan(0);
  });

  it("lines each person's months up from the first message to now", () => {
    const model = buildModel(report);
    expect(model.months).toEqual(["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
    const ada = model.people[0];
    expect(ada.series).toEqual([0, 10, 0, 0, 35]);
    expect(ada.seriesMe).toEqual([0, 5, 0, 0, 20]);
    expect(ada).toMatchObject({ total: 45, direct: 40, myShare: 0.625 });
    expect(model.people[1].myShare).toBeNull();
  });
});

describe("Hide in the model", () => {
  it("leaves out anyone with a tag on in Hide, counts the rows over who the query leaves, and re-ranks the rest", () => {
    const tagged: RelationshipsReport = {
      ...report,
      people: report.people.map((p) =>
        p.id === 1 ? { ...p, tags: ["commercial", "keep"] } : p.id === 2 ? { ...p, tags: ["cousin"], totals: counts(2, 2), months: [{ month: "2026-02", ...counts(2, 2) }] } : p),
    };
    // The frozen views pass no choices: nobody is left out and there are no rows.
    const unfiltered = buildModel(tagged);
    expect(unfiltered.people.map((p) => p.name)).toEqual(["Ada", "Bea", "Cy"]);
    expect(unfiltered.hideEntries).toEqual([]);
    expect(unfiltered.hiddenCount).toBe(0);
    expect(unfiltered.people[1].rank.at(-1)).toBe(2);

    // "commercial" starts on; archived people are not in the report while hidden, so they are not counted.
    const hidden = buildModel(tagged, { hide: {} });
    expect(hidden.people.map((p) => p.name)).toEqual(["Bea", "Cy"]);
    expect(hidden.hiddenCount).toBe(1);
    expect(hidden.hideEntries.map((e) => [e.tag, e.count, hides({}, e.tag)])).toEqual([
      ["cousin", 1, false], ["keep", 1, false], ["archive", null, true], ["commercial", 1, true],
    ]);
    // Bea ranks first once Ada is off the map.
    expect(hidden.people[0].rank.at(-1)).toBe(1);
    expect(hidden.groups.flatMap((g) => g.memberIds)).not.toContain(1);

    const cousinsHidden = buildModel(tagged, { hide: { commercial: false, cousin: true } });
    expect(cousinsHidden.people.map((p) => p.name)).toEqual(["Ada", "Cy"]);
  });

  it("shows the archived people the report holds once archive is unticked, your and the rules' alike, and counts them", () => {
    // Bea archived by you, Cy by the rules: both carry "archive".
    const withArchived: RelationshipsReport = {
      ...report,
      people: report.people.map((p) => (p.id === 3 ? { ...p, tags: ["archive"] } : p.id === 2 ? { ...p, tags: ["archive"] } : p)),
    };
    const archiveShown = buildModel(withArchived, { hide: { archive: false } });
    expect(archiveShown.people.map((p) => p.name)).toEqual(["Ada", "Bea", "Cy"]);
    expect(archiveShown.hideEntries.filter((e) => e.tag.includes("archive"))).toEqual([{ tag: "archive", count: 2 }]);
  });

  it("takes the query's matches first, then Hide, counting Hide's rows over the matches", () => {
    const tagged: RelationshipsReport = {
      ...report,
      people: report.people.map((p) =>
        p.id === 1 ? { ...p, tags: ["commercial"] } : p.id === 2 ? { ...p, tags: ["cousin"], totals: counts(2, 2), months: [{ month: "2026-02", ...counts(2, 2) }] } : p),
    };
    // The query matches Ada and Bea; Hide still takes the commercial Ada.
    const model = buildModel(tagged, { hide: {}, only: new Set([1, 2]) });
    expect(model.people.map((p) => p.name)).toEqual(["Bea"]);
    expect(model.hiddenCount).toBe(2);
    expect(model.hideEntries.find((e) => e.tag === "commercial")).toEqual({ tag: "commercial", count: 1 });
    expect(model.hideEntries.find((e) => e.tag === "cousin")).toEqual({ tag: "cousin", count: 1 });
    // Ranks run over the people shown.
    expect(model.people[0].rank.at(-1)).toBe(1);
    // A query matching nobody (one that no longer runs) leaves nobody; no query, everyone.
    expect(buildModel(tagged, { hide: {}, only: new Set() }).people).toEqual([]);
    expect(buildModel(tagged, { hide: {}, only: null }).people.map((p) => p.name)).toEqual(["Bea", "Cy"]);
  });
});

describe("closeness in the model", () => {
  it("scores and ranks everyone shown, month by month, with the half-life from the settings", () => {
    const model = buildModel(report);
    expect(model.settings).toEqual(DEFAULT_SETTINGS);
    const [ada, bea, cy] = model.people;
    expect(ada.closeness).toHaveLength(model.months.length);
    // Ada's direct messages make her the closest from December on; Bea wrote only in a group I never wrote in.
    expect(ada.rank).toEqual([0, 1, 1, 1, 1]);
    expect(bea.closeness.every((c) => c === 0)).toBe(true);
    expect(bea.rank.every((r) => r === 0)).toBe(true);
    expect(cy.rank.at(-1)).toBe(0);
    // A longer half-life keeps December's messages closer by March.
    expect(buildModel(report, { settings: { ...DEFAULT_SETTINGS, closenessHalfLifeDays: 365 } }).people[0].closeness[3]).toBeGreaterThan(ada.closeness[3]);
  });

  it("scores a hangout for everyone at it, someone with no messages too, each taking their share", () => {
    // Walt has no messages at all: in the report (as the archive gives it) only as someone at a hangout today.
    const withHangout = (others = 0): RelationshipsReport => ({
      ...report,
      people: [...report.people, person(4, "Walt")],
      catchUps: [{ id: 1, day: "2026-03-15", hours: 2, time: null, trip: null, byCall: false, others, personIds: [3, 4] }],
    });
    const closeness = (others = 0, settings = DEFAULT_SETTINGS) =>
      new Map(buildModel(withHangout(others), { settings }).people.map((p) => [p.id, p.closeness.at(-1)!]));
    // Today, so whole: two hours at 50 messages an hour, each of the two taking 75% (half shared, half split).
    expect(closeness().get(4)).toBeCloseTo(75);
    expect(closeness().get(3)).toBeCloseTo(75);
    expect(closeness(0, { ...DEFAULT_SETTINGS, catchUpHourWorth: 0 }).get(4)).toBe(0);
    expect(closeness(0, { ...DEFAULT_SETTINGS, catchUpHourWorth: 30 }).get(4)).toBeCloseTo(45);
    // Split equally, nothing shared: 50 each.
    expect(closeness(0, { ...DEFAULT_SETTINGS, groupSharedPart: 0 }).get(4)).toBeCloseTo(50);
    // Two others there unnamed: four share it, ½ + ½ ÷ 4 of 100 each.
    expect(closeness(2).get(4)).toBeCloseTo(62.5);
    // On the map, Walt has a rank too.
    expect(buildModel(withHangout()).people.find((p) => p.id === 4)!.rank.at(-1)).toBeGreaterThan(0);
  });

  it("counts a group chat you write in, sized by everyone in it, the archived too", () => {
    const withGroup: RelationshipsReport = {
      ...report,
      groups: [{
        id: 12, memberIds: [2, 3, 4], selfOnly: false, messageCount: 10, lastMessageAt: NOW,
        months: [{ month: "2026-02", messages: 10, fromMe: 5, fromMembers: [{ id: 2, count: 4 }, { id: 3, count: 1 }] }],
      }],
    };
    const model = buildModel(withGroup);
    const [ada, bea, cy] = model.people;
    // Theirs at my share, a half, and mine at theirs, split among three (Dot, archived, still counts in the size).
    const feb = (n: number) => (n / 3) * 0.5 ** (30.44 / 2 / 90);
    expect(bea.closeness[3]).toBeCloseTo(feb(4 * 0.5 + 5 * 0.4));
    expect(cy.closeness[3]).toBeCloseTo(feb(1 * 0.5 + 5 * 0.1));
    expect([ada.rank[3], bea.rank[3], cy.rank[3]]).toEqual([1, 2, 3]);
  });
});

describe("standing", () => {
  const model = buildModel(report);
  const ada = model.people[0];

  it("uses the exact last message now, and month steps in the past", () => {
    expect(standing(ada, 4, model).daysSince).toBeCloseTo(3);
    expect(standing(ada, 4, model).total).toBe(45);
    const december = standing(ada, 2, model);
    expect(december.total).toBe(10);
    expect(december.daysSince).toBeCloseTo(30.44 + 15);
    expect(standing(ada, 0, model).daysSince).toBeNull();
  });

  it("warms when the last three months outweigh the three before", () => {
    expect(standing(ada, 4, model).trend).toBeGreaterThan(0);
    expect(standing(model.people[1], 4, model).trend).toBe(-1);
    expect(standing(model.people[2], 4, model).trend).toBe(0);
  });
});

describe("friend groups", () => {
  it("weights a shared group by its size and finds the groups", () => {
    const links = groupLinks([{ memberIds: [1, 2, 3] }, { memberIds: [1, 2] }, { memberIds: [7, 8] }]);
    expect(links.find((l) => l.source === 1 && l.target === 2)).toEqual({ source: 1, target: 2, weight: 1.5, groups: 2 });
    const found = communities([1, 2, 3, 7, 8, 9], links);
    expect(found.get(1)).toBe(found.get(3));
    expect(found.get(7)).toBe(found.get(8));
    expect(found.get(7)).not.toBe(found.get(1));
    expect(found.get(1)).toBe(0);
    expect(found.get(9)).toBe(-1);
  });
});

describe("a group chat someone is unlinked from", () => {
  // Ada, Bea and Cy share 10, Ada and Bea 13, and you unlinked Cy from 10; Cy and Dee (archived) share 11.
  const shared: RelationshipsReport = {
    ...report,
    groups: [
      {
        id: 10, memberIds: [1, 2, 3], selfOnly: false, messageCount: 50, lastMessageAt: NOW,
        months: [{ month: "2026-02", messages: 10, fromMe: 5, fromMembers: [{ id: 1, count: 2 }, { id: 3, count: 3 }] }],
      },
      { id: 13, memberIds: [1, 2], selfOnly: false, messageCount: 5, lastMessageAt: NOW, months: [] },
    ],
  };
  const linked = buildModel(shared);
  const unlinked = buildModel({ ...shared, unlinks: [{ personId: 3, groupId: 10 }] });
  const pair = (model: ReturnType<typeof buildModel>, a: number, b: number) => model.links.find((l) => l.source === a && l.target === b);

  it("links them to nobody through it, and leaves the others' links as they were", () => {
    expect(pair(linked, 1, 3)).toBeDefined();
    expect(pair(unlinked, 1, 3)).toBeUndefined();
    expect(pair(unlinked, 2, 3)).toBeUndefined();
    expect(pair(unlinked, 1, 2)).toEqual(pair(linked, 1, 2));
    expect(unlinked.groups.find((g) => g.id === 10)).toMatchObject({ memberIds: [1, 2], unlinkedIds: [3], size: 3 });
  });

  it("leaves them out of its friend group and friend circle", () => {
    const ids = [1, 2, 3];
    expect(communities(ids, linked.links).get(3)).toBe(communities(ids, linked.links).get(1));
    expect(unlinked.people.find((p) => p.id === 3)!.community).toBe(-1);
    const circles = (model: ReturnType<typeof buildModel>) => friendCircles(model.people, model.groups);
    expect(circles(linked).circles.some((c) => c.ids.includes(1) && c.ids.includes(3))).toBe(true);
    expect(circles(unlinked).circles.some((c) => c.ids.includes(3))).toBe(false);
    expect(circles(unlinked).apart).toContain(3);
  });

  it("changes no one's closeness: it is still a group they and you write in", () => {
    expect(unlinked.people.map((p) => p.closeness)).toEqual(linked.people.map((p) => p.closeness));
  });

  it("keeps a group chat in the model while only the unlinked are on the map in it", () => {
    const alone = buildModel({ ...shared, unlinks: [{ personId: 1, groupId: 13 }, { personId: 2, groupId: 13 }] });
    expect(alone.groups.find((g) => g.id === 13)).toMatchObject({ memberIds: [], unlinkedIds: [1, 2] });
  });
});

describe("labels", () => {
  it("spans months across years", () => {
    expect(monthRange("2024-11", "2025-02")).toEqual(["2024-11", "2024-12", "2025-01", "2025-02"]);
  });

  it("says how long ago", () => {
    expect([0.5, 3, 20, 100, 800].map(durationLabel)).toEqual(["today", "3 days", "3 weeks", "3 months", "2.2 years"]);
  });
});
