// Holding a person on the map: whoever's panel is open stays picked out, lit
// with the people they share group chats with, whoever is under the pointer
// (the user's asks with "In the sidebar", and that hovering someone else
// should not show their links), and with one of their group chats open in the
// panel, only the people in it. The rules are focusOf and linksOf; the map is
// drawn to markup to see them wired through ViewProps.held and heldGroup, with
// names beside their icons (Next to).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PersonRelationship, RelationshipsReport } from "../archive.ts";
import { NOBODY, nameStyleStore } from "../names.ts";
import { buildModel } from "./model.ts";
import { emptyAt, focusLinksOf, focusOf, heldOnly, linksOf, OrbitMap } from "./Orbits.tsx";
import { BACKGROUND, LINKED_FLOOR } from "./orbitsLayout.ts";


describe("focusOf", () => {
  const drawn = (id: number) => id !== 3;

  it("keeps the held person picked out, whoever is under the pointer", () => {
    expect(focusOf(2, 1, drawn)).toBe(1);
    expect(focusOf(null, 1, drawn)).toBe(1);
  });

  it("picks out the person under the pointer while nobody is held", () => {
    expect(focusOf(2, null, drawn)).toBe(2);
    expect(focusOf(null, null, drawn)).toBeNull();
  });

  it("leaves it to the pointer for a held person who isn't drawn (filtered off the map)", () => {
    expect(focusOf(2, 3, drawn)).toBe(2);
    expect(focusOf(null, 3, drawn)).toBeNull();
  });
});

describe("emptyAt, where a click lets go of whoever is held on the Spider web", () => {
  const dots = [{ x: 100, y: 0, r: 6 }, { x: 0, y: 200, r: 30 }];
  const boxes = [{ left: -40, right: 40, top: -120, bottom: -106 }];

  it("is empty away from every dot, name and ring label", () => {
    expect(emptyAt({ x: -150, y: 50 }, dots, boxes, 16)).toBe(true);
    expect(emptyAt({ x: 100, y: 0 }, [], [], 16)).toBe(true);
  });

  it("is not on someone's dot, within the pick's reach or their radius and 8 more", () => {
    expect(emptyAt({ x: 115, y: 0 }, dots, boxes, 16)).toBe(false);
    expect(emptyAt({ x: 117, y: 0 }, dots, boxes, 16)).toBe(true);
    // A finger reaches further.
    expect(emptyAt({ x: 123, y: 0 }, dots, boxes, 24)).toBe(false);
    // A big dot reaches past the pick's reach.
    expect(emptyAt({ x: 0, y: 237 }, dots, boxes, 16)).toBe(false);
    expect(emptyAt({ x: 0, y: 239 }, dots, boxes, 16)).toBe(true);
  });

  it("is not on a name or a ring label", () => {
    expect(emptyAt({ x: 30, y: -110 }, dots, boxes, 16)).toBe(false);
    expect(emptyAt({ x: 45, y: -110 }, dots, boxes, 16)).toBe(true);
  });
});

const NOW = Date.parse("2026-03-15T12:00:00+11:00");
const counts = (directFromMe: number, directFromThem: number) => ({ directFromMe, directFromMeSelfOnly: 0, directFromThem, groupFromMe: 0, groupFromThem: 0 });
function person(id: number, name: string, messages: number): PersonRelationship {
  return {
    id, name, aliases: [], tags: [], note: "", unknown: false, platforms: [], shouldReachOut: false, identiconSeed: "00000000000000a1", identiconHue: null, location: null,
    totals: counts(messages, messages), firstMessageAt: NOW, lastMessageAt: NOW,
    months: [{ month: "2026-03", ...counts(messages, messages) }],
    reactions: { fromMe: 0, fromThem: 0 }, openings: { byMe: 0, byThem: 0 },
  };
}
// Ada and Bea share a group; Cy shares none.
const report: RelationshipsReport = {
  generatedAt: NOW,
  gapDays: 14,
  people: [person(1, "Ada", 30), person(2, "Bea", 20), person(3, "Cy", 10)],
  archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
  groups: [{ id: 10, memberIds: [1, 2], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] }],
};
const model = buildModel(report);

function draw(held: number | null): string {
  return renderToStaticMarkup(createElement(OrbitMap, {
    model, width: 800, height: 600, inset: 60, hover: () => {}, open: () => {}, held,
  }));
}
const focused = (markup: string) => [...markup.matchAll(/class="orbits__name orbits__name--focus"[^>]*>([^<]+)</g)].map((m) => m[1]);
const links = (markup: string) => (markup.match(/<g class="orbits__links">(.*?)<\/g>/)?.[1].match(/<line/g) ?? []).length;
/** Where a name is drawn: its x and y. */
const spotOf = (markup: string, name: string) => markup.match(new RegExp(`x="([-\\d.e]+)" y="([-\\d.e]+)"[^>]*>${name}<`))?.slice(1);
const labelOpacity = (markup: string, name: string) => Number(markup.match(new RegExp(`opacity="([\\d.]+)"[^>]*>${name}<`))?.[1]);

describe("heldOnly", () => {
  const linked = new Set([2, 3]);

  it("with someone held and drawn, is they and their links alone", () => {
    expect(heldOnly(1, 1, linked)).toEqual(new Set([1, 2, 3]));
  });

  it("is everyone (null) with nobody held (someone only under the pointer), or with the held person off the map", () => {
    expect(heldOnly(null, 4, linked)).toBeNull();
    expect(heldOnly(1, 4, linked)).toBeNull();
  });
});

// Holding someone turns off every reach-out glow but theirs and their links' (the user's ask). Ada shares one group
// with Bea and Cy (10) and another with Cy alone (11); Bea, Cy and Dee are to reach out to, and Dee shares none.
describe("the reach-out glow with someone held", () => {
  const report: RelationshipsReport = {
    generatedAt: NOW,
    gapDays: 14,
    people: [person(1, "Ada", 40), ...[person(2, "Bea", 30), person(3, "Cy", 20), person(4, "Dee", 10)].map((p) => ({ ...p, shouldReachOut: true }))],
    archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
    groups: [
      { id: 10, memberIds: [1, 2, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      { id: 11, memberIds: [1, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
    ],
  };
  const model = buildModel(report);
  const ids: Record<string, number> = { Bea: 2, Cy: 3, Dee: 4 };
  const draw = (held: number | null, heldGroup: number | null, more: object = {}) => renderToStaticMarkup(createElement(OrbitMap, {
    model, width: 800, height: 600, inset: 60, hover: () => {}, open: () => {}, held, heldGroup, ...more,
  }));
  /** Who of Bea, Cy and Dee have a glowing name (its halo), with everyone named. */
  const glowingNames = (markup: string) => Object.keys(ids).filter((name) => /drop-shadow/.test(markup.match(new RegExp(`<text class="orbits__name[^"]*"[^>]*style="([^"]*)"[^>]*>${name}<`))?.[1] ?? ""));
  /** Who of them have a glow round their marker, with nobody named. */
  const glowingMarkers = (markup: string) => Object.keys(ids).filter((name) => markup.includes(`id="orbits-glow-${ids[name]}"`));

  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => {
    nameStyleStore.set("full");
    vi.unstubAllGlobals();
  });

  for (const [view, more] of [["Orbits", {}], ["Circles", { order: "circles" }]] as const) {
    it(`on ${view}, glows everyone to reach out to while nobody is held, and only the held person's links while someone is`, () => {
      expect(glowingNames(draw(null, null, more))).toEqual(["Bea", "Cy", "Dee"]);
      expect(glowingNames(draw(1, null, more))).toEqual(["Bea", "Cy"]);
      // Only the open group chat's, as the hold's lines.
      expect(glowingNames(draw(1, 11, more))).toEqual(["Cy"]);
      // Held themselves, they glow, and nobody they share no group chat with.
      expect(glowingNames(draw(4, null, more))).toEqual(["Dee"]);
      expect(glowingNames(draw(2, null, more))).toEqual(["Bea", "Cy"]);
      // Someone held who is off the map holds nothing: everyone glows.
      expect(glowingNames(draw(99, null, more))).toEqual(["Bea", "Cy", "Dee"]);
    });

    it(`on ${view}, turns the glow round a marker off the same way`, () => {
      nameStyleStore.set("hide");
      const free = glowingMarkers(draw(null, null, more));
      const held = glowingMarkers(draw(1, null, more));
      const self = glowingMarkers(draw(4, null, more));
      nameStyleStore.set("full");
      expect(free).toEqual(["Bea", "Cy", "Dee"]);
      expect(held).toEqual(["Bea", "Cy"]);
      expect(self).toEqual(["Dee"]);
    });
  }

  it("on the Spider web, leaves the held person's links' names glowing", () => {
    expect(glowingNames(draw(null, null, { look: "web" }))).toEqual(["Bea", "Cy", "Dee"]);
    expect(glowingNames(draw(1, null, { look: "web" }))).toEqual(["Bea", "Cy"]);
  });

  // No name except… (the map shown to someone) draws no reach-out glow at all, held or not (the user's ask).
  it("under No name except…, glows nobody, on Orbits, Circles and the Spider web, held or not", () => {
    nameStyleStore.set("except");
    const markers = [null, 1, 4].map((held) => glowingMarkers(draw(held, null)));
    // Everyone picked, so named: names are drawn, without a halo.
    nameStyleStore.setNamed(new Set([1, 2, 3, 4]));
    const names = [{}, { order: "circles" }, { look: "web" }].flatMap((more) => [null, 1, 4].map((held) => [draw(held, null, more), glowingNames(draw(held, null, more))] as const));
    nameStyleStore.setNamed(NOBODY);
    nameStyleStore.set("full");
    expect(markers).toEqual([[], [], []]);
    for (const [markup, glowing] of names) {
      expect(markup).toMatch(/>(Bea|Cy|Dee)</);
      expect(glowing).toEqual([]);
    }
  });
});

describe("the map with someone held", () => {
  // There is no window here: one that asks for reduced motion draws everyone
  // where they settle at once, rather than rising out of the sun.
  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => void vi.unstubAllGlobals());

  it("picks out nobody while nobody is held or hovered", () => {
    const markup = draw(null);
    expect(focused(markup)).toEqual([]);
    expect(links(markup)).toBe(0);
    expect(labelOpacity(markup, "Cy")).toBe(1);
  });

  it("picks out the held person, lights who they share groups with, and dims everyone else", () => {
    const markup = draw(1);
    expect(focused(markup)).toEqual(["Ada"]);
    expect(links(markup)).toBe(1);
    expect(labelOpacity(markup, "Bea")).toBe(0.7);
    expect(BACKGROUND).toBe(0.2);
    expect(labelOpacity(markup, "Cy")).toBe(BACKGROUND);
  });

  it("picks out nobody for someone who is not on the map", () => {
    expect(focused(draw(99))).toEqual([]);
  });
});

// A crowd past the hundred named: Hub shares a group with Far (ranked last,
// unnamed until now), Drift (in the belt, with no closeness yet) and Top (the
// closest, named anyway); Lone shares none.
describe("the map with someone held names everyone they share groups with", () => {
  const crowd = Array.from({ length: 110 }, (_, i) => person(i + 1, `P${String(i + 1).padStart(3, "0")}`, 400 - i * 2));
  const hub = person(200, "Hub", 300);
  const far = person(201, "Far", 1);
  const drift = { ...person(202, "Drift", 0), months: [] };
  const lone = person(203, "Lone", 2);
  const report: RelationshipsReport = {
    generatedAt: NOW,
    gapDays: 14,
    people: [...crowd, hub, far, drift, lone],
    archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
    groups: [{ id: 10, memberIds: [1, 200, 201, 202], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] }],
  };
  const model = buildModel(report);
  const draw = (held: number | null) => renderToStaticMarkup(createElement(OrbitMap, {
    model, width: 1000, height: 800, inset: 60, hover: () => {}, open: () => {}, held,
  }));
  const named = (markup: string) => [...markup.matchAll(/class="orbits__name[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);

  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => {
    nameStyleStore.set("full");
    vi.unstubAllGlobals();
  });

  it("names nobody beyond the named while nobody is held", () => {
    const shown = named(draw(null));
    expect(shown).toContain("P001");
    expect(shown).not.toContain("Far");
    expect(shown).not.toContain("Drift");
    expect(shown).not.toContain("Lone");
  });

  it("names everyone linked to the held person, those not named otherwise at the 40% linked floor", () => {
    const markup = draw(200);
    const shown = named(markup);
    expect(shown).toEqual(expect.arrayContaining(["Hub", "Far", "Drift", "P001"]));
    expect(shown).not.toContain("Lone");
    expect(LINKED_FLOOR).toBe(0.4);
    expect(labelOpacity(markup, "Far")).toBe(LINKED_FLOOR);
    expect(labelOpacity(markup, "Drift")).toBe(LINKED_FLOOR);
    // Everyone else at one flat strength, whatever their tier: the 80th closest is no fainter than the second.
    expect(labelOpacity(markup, "P002")).toBe(BACKGROUND);
    expect(labelOpacity(markup, "P080")).toBe(BACKGROUND);
    // Named anyway, they keep the linked strength they had; the held person keeps theirs.
    expect(labelOpacity(markup, "P001")).toBe(0.7);
    expect(labelOpacity(markup, "Hub")).toBe(1);
    // Each name once.
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("on the Spider web names only the held person and everyone they share groups with, until they are let go (the user's ask)", () => {
    const web = (held: number | null) => renderToStaticMarkup(createElement(OrbitMap, {
      model, width: 1000, height: 800, inset: 60, hover: () => {}, open: () => {}, held, look: "web",
    }));
    const held = web(200);
    expect(new Set(named(held))).toEqual(new Set(["Hub", "Far", "Drift", "P001"]));
    // No leader runs to a name that is gone.
    expect((held.match(/class="orbits__leader"/g) ?? []).length).toBeLessThanOrEqual(4);
    // Their names stay where they were: as on the web with nobody held, which hides nobody's (and names Far, linked
    // to nobody then, only if there is room).
    const free = web(null);
    expect(named(free)).toContain("P002");
    for (const name of ["Hub", "P001"]) {
      expect(spotOf(held, name)).toHaveLength(2);
      expect(spotOf(held, name)).toEqual(spotOf(free, name));
    }
    // Let go, everyone is named again.
    expect(named(free)).toEqual(named(draw(null)));
  });

  it("names the linked of someone held who is linked themselves, not the linked of others", () => {
    const shown = named(draw(201));
    expect(shown).toEqual(expect.arrayContaining(["Far", "Hub", "Drift"]));
    expect(named(draw(203))).not.toContain("Far");
  });

  it("names nobody with No names", () => {
    nameStyleStore.set("hide");
    expect(named(draw(200))).toEqual([]);
    nameStyleStore.set("full");
  });

  it("names the same people, by their one-word names as they are, with First name and First L.", () => {
    const full = named(draw(200));
    for (const style of ["first", "initial"] as const) {
      nameStyleStore.set(style);
      const shown = named(draw(200));
      nameStyleStore.set("full");
      expect([style, shown]).toEqual([style, full]);
    }
  });
});

describe("linksOf", () => {
  const all = [
    { source: 1, target: 2, weight: 1, groups: 1 },
    { source: 1, target: 3, weight: 0.5, groups: 1 },
    { source: 2, target: 3, weight: 0.5, groups: 1 },
  ];

  it("gives everyone linked to the one picked out, and nothing for nobody", () => {
    expect(linksOf(all, 1)).toEqual([all[0], all[1]]);
    expect(linksOf(all, 3)).toEqual([all[1], all[2]]);
    expect(linksOf(all, null)).toEqual([]);
  });

  it("keeps only those in the open group chat", () => {
    expect(linksOf(all, 1, [1, 3])).toEqual([all[1]]);
    expect(linksOf(all, 3, [2, 3])).toEqual([all[2]]);
    expect(linksOf(all, 1, [1])).toEqual([]);
  });
});

// Ada shares one group with Bea and Cy (10), another with Cy alone (11), and
// none with Dee; Bea and Dee share one without her (12).
describe("the map with someone held and one of their group chats open", () => {
  const report: RelationshipsReport = {
    generatedAt: NOW,
    gapDays: 14,
    people: [person(1, "Ada", 40), person(2, "Bea", 30), person(3, "Cy", 20), person(4, "Dee", 10)],
    archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
    groups: [
      { id: 10, memberIds: [1, 2, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      { id: 11, memberIds: [1, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      { id: 12, memberIds: [2, 4], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
    ],
  };
  const model = buildModel(report);
  const draw = (held: number | null, heldGroup: number | null) => renderToStaticMarkup(createElement(OrbitMap, {
    model, width: 800, height: 600, inset: 60, hover: () => {}, open: () => {}, held, heldGroup,
  }));

  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => void vi.unstubAllGlobals());

  it("links them to everyone they share a group with while none is open", () => {
    const markup = draw(1, null);
    expect(links(markup)).toBe(2);
    expect(labelOpacity(markup, "Bea")).toBe(0.7);
    expect(labelOpacity(markup, "Cy")).toBe(0.7);
    expect(labelOpacity(markup, "Dee")).toBe(BACKGROUND);
  });

  it("links them only to the open group chat's members, everyone else at the background", () => {
    const markup = draw(1, 11);
    expect(focused(markup)).toEqual(["Ada"]);
    expect(links(markup)).toBe(1);
    expect(labelOpacity(markup, "Cy")).toBe(0.7);
    expect(labelOpacity(markup, "Bea")).toBe(BACKGROUND);
    expect(labelOpacity(markup, "Dee")).toBe(BACKGROUND);
  });

  it("follows another group chat opened, and gives them all back once it closes", () => {
    expect(links(draw(1, 10))).toBe(2);
    expect(labelOpacity(draw(1, 10), "Bea")).toBe(0.7);
    const back = draw(1, null);
    expect(links(back)).toBe(2);
    expect(labelOpacity(back, "Bea")).toBe(0.7);
  });

  it("leaves a group chat they are not in alone (a stale one from the panel before)", () => {
    const markup = draw(1, 12);
    expect(links(markup)).toBe(2);
    expect(labelOpacity(markup, "Dee")).toBe(BACKGROUND);
  });

  it("names only the open group chat's members beyond the named", () => {
    const crowd = Array.from({ length: 110 }, (_, i) => person(i + 1, `P${String(i + 1).padStart(3, "0")}`, 400 - i * 2));
    const model = buildModel({
      generatedAt: NOW,
      gapDays: 14,
      people: [...crowd, person(200, "Hub", 300), person(201, "Far", 1), person(203, "Lone", 2)],
      archivedCount: 0, catchUps: [], callDays: [], unlinks: [],
      groups: [
        { id: 20, memberIds: [200, 201], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
        { id: 21, memberIds: [200, 203], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      ],
    });
    const named = (heldGroup: number | null) => [...renderToStaticMarkup(createElement(OrbitMap, {
      model, width: 1000, height: 800, inset: 60, hover: () => {}, open: () => {}, held: 200, heldGroup,
    })).matchAll(/class="orbits__name[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(named(null)).toEqual(expect.arrayContaining(["Far", "Lone"]));
    expect(named(21)).toContain("Lone");
    expect(named(21)).not.toContain("Far");
  });
});

// Ada shares one group with Bea and Cy (10) and another with Cy alone (11), and
// you unlinked her from 10: she is still in it, but it links her to nobody.
describe("the map with someone held who is unlinked from a group chat", () => {
  const report: RelationshipsReport = {
    generatedAt: NOW,
    gapDays: 14,
    people: [person(1, "Ada", 40), person(2, "Bea", 30), person(3, "Cy", 20)],
    archivedCount: 0, catchUps: [], callDays: [],
    groups: [
      { id: 10, memberIds: [1, 2, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      { id: 11, memberIds: [1, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
    ],
    unlinks: [{ personId: 1, groupId: 10 }],
  };
  const draw = (held: number | null, heldGroup: number | null, unlinks = report.unlinks) => renderToStaticMarkup(createElement(OrbitMap, {
    model: buildModel({ ...report, unlinks }), width: 800, height: 600, inset: 60, hover: () => {}, open: () => {}, held, heldGroup,
  }));

  beforeAll(() => void vi.stubGlobal("window", { matchMedia: (query: string) => ({ matches: query.includes("reduced-motion") }) }));
  afterAll(() => void vi.unstubAllGlobals());

  it("links them only through the group chats they are not unlinked from", () => {
    const markup = draw(1, null);
    expect(links(markup)).toBe(1);
    expect(labelOpacity(markup, "Cy")).toBe(0.7);
    expect(labelOpacity(markup, "Bea")).toBe(BACKGROUND);
  });

  it("links them to nobody while that group chat is open in their panel", () => {
    const markup = draw(1, 10);
    expect(focused(markup)).toEqual(["Ada"]);
    expect(links(markup)).toBe(0);
    expect(labelOpacity(markup, "Cy")).toBe(BACKGROUND);
  });

  it("leaves its other members linked to each other, and not to them", () => {
    const markup = draw(2, null);
    expect(links(markup)).toBe(1);
    expect(labelOpacity(markup, "Cy")).toBe(0.7);
    expect(labelOpacity(markup, "Ada")).toBe(BACKGROUND);
  });

  it("links them through it again once linked again", () => {
    expect(links(draw(1, null, []))).toBe(2);
    expect(links(draw(1, 10, []))).toBe(2);
  });
});

// Orbits, Orbits 3D and the City all draw the held person's links by focusLinksOf.
describe("focusLinksOf", () => {
  // Ada (1) shares 10 with Bea and Cy and 11 with Cy; she is unlinked from 10.
  const groups = (unlinks: Array<{ personId: number; groupId: number }>) => buildModel({
    generatedAt: NOW,
    gapDays: 14,
    people: [person(1, "Ada", 40), person(2, "Bea", 30), person(3, "Cy", 20)],
    archivedCount: 0, catchUps: [], callDays: [], unlinks,
    groups: [
      { id: 10, memberIds: [1, 2, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      { id: 11, memberIds: [1, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
      { id: 12, memberIds: [2, 3], selfOnly: false, messageCount: 20, lastMessageAt: NOW, months: [] },
    ],
  });
  const others = (links: ReturnType<typeof focusLinksOf>, focus: number) => links.map((l) => (l.source === focus ? l.target : l.source)).sort();

  it("links the held person through every group chat, or only the one open in their panel", () => {
    const model = groups([]);
    expect(others(focusLinksOf(model, 1, 1, null), 1)).toEqual([2, 3]);
    expect(others(focusLinksOf(model, 1, 1, 11), 1)).toEqual([3]);
    // Someone under the pointer, not held, keeps all theirs.
    expect(others(focusLinksOf(model, 1, null, 11), 1)).toEqual([2, 3]);
    // A group chat they are not in leaves them all.
    expect(others(focusLinksOf(model, 1, 1, 12), 1)).toEqual([2, 3]);
    expect(focusLinksOf(model, null, null, null)).toEqual([]);
  });

  it("links them through no group chat they are unlinked from, and to nobody while it is open", () => {
    const model = groups([{ personId: 1, groupId: 10 }]);
    expect(others(focusLinksOf(model, 1, 1, null), 1)).toEqual([3]);
    expect(focusLinksOf(model, 1, 1, 10)).toEqual([]);
    expect(others(focusLinksOf(model, 1, 1, 11), 1)).toEqual([3]);
    expect(others(focusLinksOf(model, 2, 2, null), 2)).toEqual([3]);
  });
});
