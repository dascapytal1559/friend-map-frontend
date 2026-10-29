// The data contract's own parts: the shapes (what they let a backend leave out, and what the page fills in), the
// handshake (which backends the page refuses, and why), and contract-check (the demo, the reference backend, fits;
// what is wrong is said by route and field, never with a value).

import { describe, expect, it } from "vitest";
import { CAPABILITIES, CONTRACT_VERSION, ROUTES, type Contract } from "../archive.ts";
import { DEMO_CONTRACT, DemoArchive } from "../demo/archive.ts";
import { generateDemo, SMALL_CROWD } from "../demo/generate.ts";
import { DEMO_TIME_ZONE } from "../demo/timeZone.ts";
import { identiconSeedOf } from "../identicon.ts";
import { machineTimeZone, setTimeZone } from "../time.ts";
import { checkBackend, reportLines } from "./check.ts";
import { contract, KNOWN_CAPABILITIES, majorOf, offers, preContract, refusal, takeContract, takesEdits } from "./handshake.ts";
import { servedBy, type Backend } from "./routes.ts";
import { ANSWERS, catchUp, peopleListing, personSummary, relationshipsReport, scoredCatchUp, strict, timelineMessage } from "./schema.ts";
import { problemsOf } from "./shape.ts";

const NOW = Date.parse("2026-10-01T12:00:00+10:00");
const demo = new DemoArchive(generateDemo(NOW, SMALL_CROWD));

describe("the shapes", () => {
  it("let a `map` answer name only who people are, and fill in the rest", () => {
    expect(problemsOf(personSummary, { id: 7, name: "Ada Sample" })).toEqual([]);
    const ada = personSummary.fill({
      id: 7, name: "Ada Sample",
      accounts: [{ id: 1, platform: "signal", displayName: "Ada", messageCount: 5, directMessageCount: 5, lastMessageAt: 20 }, { id: 2, platform: "sms", displayName: "Ada", messageCount: 2, lastMessageAt: 30 }],
    });
    expect(ada).toMatchObject({
      aliases: [], tags: [], note: "", shouldReachOut: false, identiconSeed: identiconSeedOf(7, 0), identiconHue: null, archived: null,
      messageCount: 7, directMessageCount: 5, groupMessageCount: 0, lastMessageAt: 30, lastByPlatform: [{ platform: "sms", at: 30 }, { platform: "signal", at: 20 }],
    });
    expect(ada.accounts[1]).toMatchObject({ handle: null, link: "import", directMessageCount: 0 });
    expect(peopleListing.fill({ people: [{ id: 1, name: "Bo Test", tags: ["climbing"] }, { id: 2, name: "Cy Test", tags: ["climbing", "keep"] }] }).tags)
      .toEqual([{ tag: "climbing", count: 2 }, { tag: "keep", count: 1 }]);
  });

  it("take a null for a field left out, unless null is one of its values, and keep what was sent", () => {
    expect(personSummary.fill({ id: 7, name: "Ada Sample", tags: null, archived: "you" })).toMatchObject({ tags: [], archived: "you" });
    expect(personSummary.fill({ id: 7, name: "Ada Sample", location: null }).location).toBeNull();
  });

  it("work out a person's totals and a report's defaults from what the map's report must send", () => {
    const report = relationshipsReport.fill({
      people: [{ id: 1, name: "Bo Test", months: [{ month: "2026-08", directFromMe: 2, directFromThem: 3, groupFromMe: 0, groupFromThem: 1 }, { month: "2026-09", directFromMe: 1, directFromThem: 1, groupFromMe: 4, groupFromThem: 0 }] }],
    });
    expect(report.people[0].totals).toEqual({ directFromMe: 3, directFromThem: 4, directFromMeSelfOnly: 0, groupFromMe: 4, groupFromThem: 1 });
    expect([report.gapDays, report.groups, report.catchUps, report.callDays, report.unlinks, report.archivedCount]).toEqual([14, [], [], [], [], 0]);
  });

  it("say what is wrong by path, never with the value", () => {
    const problems = problemsOf(peopleListing, { people: [{ id: "seven", name: "Ada Quill" }, { name: 3 }] });
    expect(problems).toEqual([
      { path: "people[0].id", problem: "should be a number, not a string" },
      { path: "people[1].id", problem: "is missing" },
      { path: "people[1].name", problem: "should be a string, not a number" },
    ]);
    expect(JSON.stringify(problems)).not.toContain("Quill");
    expect(problemsOf(personSummary, [])).toEqual([{ path: "(the answer)", problem: "should be PersonSummary, an object, not an array" }]);
  });

  it("take a call record's answer of yours (1.1.0), and one from a backend before it that sends none", () => {
    const record = {
      id: 2, platform: "messenger", conversation: { id: 9, type: "direct", title: null, marketplace: false }, sentAt: 0, fromSelf: false, sender: "Ada",
      type: "call", text: null, unsent: false, callSeconds: null, callLengthGiven: false, callNote: "", attachments: [], reactions: [],
    };
    for (const callAnswer of [undefined, null, "missed", "answered", "unknown"]) expect(problemsOf(strict(timelineMessage), { ...record, callAnswer })).toEqual([]);
    expect(problemsOf(timelineMessage, { ...record, callAnswer: "no" })).toEqual([{ path: "callAnswer", problem: expect.any(String) }]);
  });

  it("take a hangout with no byCall (1.2.0: a hangout is in person), and one a backend before it sends with byCall, passed over", () => {
    const hangout = { id: 3, day: "2026-10-04", time: "19:30", trip: null, hours: 2, note: "", people: [{ id: 7, name: "Ada Sample", aliases: [] }], others: 0 };
    const scored = { id: 3, day: "2026-10-04", time: "19:30", trip: null, hours: 2, personIds: [7], others: 0 };
    for (const byCall of [undefined, false, true]) {
      expect(problemsOf(strict(catchUp), { ...hangout, byCall })).toEqual([]);
      expect(problemsOf(strict(scoredCatchUp), { ...scored, byCall })).toEqual([]);
    }
  });

  it("hold every answer but the map's to every field (strict), and know every answer ROUTES names", () => {
    expect(problemsOf(strict(personSummary), { id: 7, name: "Ada Sample" }).length).toBeGreaterThan(10);
    for (const route of ROUTES) if (!["events", "file"].includes(route.answer)) expect([route.method, route.path, route.answer in ANSWERS]).toEqual([route.method, route.path, true]);
  });
});

describe("the handshake", () => {
  const good: Contract = { version: CONTRACT_VERSION, capabilities: ["map"], timeZone: "Europe/Berlin" };

  it("takes a backend of this major version that serves the map, in a real time zone", () => {
    expect(refusal(good)).toBeNull();
    expect(refusal({ ...good, version: "1.9.3", capabilities: ["map", "telepathy"] })).toBeNull();
    expect(majorOf(CONTRACT_VERSION)).toBe(1);
  });

  it("refuses, saying why, another major version, no map, a zone that is none, and anything not a contract", () => {
    expect(refusal({ ...good, version: "2.0.0" })).toMatch(/serves contract 2\.0\.0, and this friend-map reads contract 1\.x/);
    expect(refusal({ ...good, capabilities: ["table"] })).toMatch(/does not serve the map/);
    expect(refusal({ ...good, timeZone: "Mars/Olympus_Mons" })).toMatch(/is not one/);
    expect(refusal({ version: "one" })).toMatch(/version should be semver.*capabilities is missing/);
  });

  it("once taken, says what the backend offers, and a backend that takes no edit makes the page read-only", () => {
    const before = contract();
    try {
      takeContract({ ...good, capabilities: ["map", "panel"] });
      expect([offers("map"), offers("panel"), offers("table"), takesEdits()]).toEqual([true, true, false, false]);
      takeContract({ ...good, capabilities: ["map", "edit.tags"] });
      expect(takesEdits()).toBe(true);
    } finally {
      takeContract(before);
      setTimeZone(DEMO_TIME_ZONE);
    }
  });

  it("takes a backend from before it to serve everything a backend may, in this machine's zone", () => {
    expect(preContract()).toEqual({ version: CONTRACT_VERSION, capabilities: KNOWN_CAPABILITIES.filter((c) => c !== "scores"), timeZone: machineTimeZone() });
    expect(KNOWN_CAPABILITIES).toEqual(Object.keys(CAPABILITIES));
    // Every route is under a capability the contract has.
    for (const route of ROUTES) expect(KNOWN_CAPABILITIES).toContain(route.capability);
  });
});

describe("contract-check", () => {
  it("passes the demo, the contract's reference backend, on every route it serves", async () => {
    const report = await checkBackend(servedBy(demo.api));
    expect(report.contract).toEqual(DEMO_CONTRACT);
    expect(report.contract.timeZone).toBe(DEMO_TIME_ZONE);
    expect(report.checks.filter((c) => c.outcome === "wrong")).toEqual([]);
    expect(report.ok).toBe(true);
    const asked = report.checks.filter((c) => c.outcome === "ok").map((c) => c.route);
    expect(asked).toEqual(expect.arrayContaining(["/contract", "/relationships", "/people", "/people/:id", "/query", "/people/:id/groups", "/groups/:id", "/content/people/:id/timeline", "/people/:id/activity"]));
    // It never asks what the demo does not say it serves.
    expect(asked).not.toContain("/calendar/:month");
  });

  it("says what is wrong by route and field, never what an answer holds, and fails", async () => {
    const real = servedBy(demo.api);
    const broken: Backend = async (method, path) => {
      const answer = await real(method, path);
      if (path.startsWith("/people/") && !path.includes("/", 8)) return { ...answer, body: { ...(answer.body as object), name: 42, aliases: "Wren Moxie" } };
      if (path === "/relationships") return { status: 500, body: { error: "broken" }, contentType: "application/json" };
      return answer;
    };
    const report = await checkBackend(broken);
    expect(report.ok).toBe(false);
    const wrong = report.checks.filter((c) => c.outcome === "wrong");
    expect(wrong.map((c) => [c.route, c.problems])).toEqual([
      ["/relationships", [{ path: "(the answer)", problem: "is 500, not 200" }]],
      ["/people/:id", [{ path: "name", problem: "should be a string, not a number" }, { path: "aliases", problem: "should be an array, not a string" }]],
    ]);
    const lines = reportLines(report, { where: "a broken backend" }).join("\n");
    expect(lines).toContain("FAIL GET /people/:id [map]");
    expect(lines).not.toContain("Moxie");
    for (const person of demo.data.people.slice(0, 50)) expect(lines).not.toContain(person.name);
  });

  it("fails a backend with no handshake, which friend-map still uses as one from before it", async () => {
    const real = servedBy(demo.api);
    const report = await checkBackend(async (method, path) => (path === "/contract" ? { status: 404, body: { error: "no route" }, contentType: "application/json" } : real(method, path)));
    expect([report.ok, report.noHandshake, report.refused, report.contract.capabilities]).toEqual([false, true, null, preContract().capabilities]);
    expect(reportLines(report, { where: "an old backend" }).join("\n")).toMatch(/serves no handshake: friend-map takes it to be a backend from before contract 1\.0/);
  });
});
