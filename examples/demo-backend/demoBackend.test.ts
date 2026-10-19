// The demo backend, seeded with a small made-up crowd held in memory, and friend-map's server in front of it as
// `npm run demo-backend` and `npm start` run them: it fits the contract by contract-check, alone and behind friend-map,
// and the page's own binding reads the Table, the Calendar and the Time river from it, changes someone through it, and
// hears the change on the event stream.

import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ArchiveUnavailable } from "../../src/archiveApi.ts";
import { httpArchive } from "../../src/archiveHttp.ts";
import { checkBackend } from "../../src/contract/check.ts";
import { contract, shakeHands, takesEdits } from "../../src/contract/handshake.ts";
import { SMALL_CROWD } from "../../src/demo/generate.ts";
import { DEMO_TIME_ZONE } from "../../src/demo/timeZone.ts";
import { DEFAULT_SETTINGS } from "../../src/settings.ts";
import { setTimeZone } from "../../src/time.ts";
import { viewsFor } from "../../src/views.ts";
import { archiveProxy } from "../../server/archiveProxy.ts";
import { httpArchiveClient } from "../../server/archiveClient.ts";
import { httpBackend } from "../../server/contract-check.ts";
import { createMethodologyHandler } from "../../server/methodology.ts";
import { Db } from "./db.ts";
import { seed } from "./seed.ts";
import { demoBackend } from "./server.ts";
import { localMoment } from "./time.ts";

const NOW = Date.parse("2026-10-01T12:00:00Z");

let db: Db;
let backend: Server;
let front: Server;
let backendUrl: string;
let frontUrl: string;

const listen = async (server: Server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeAll(async () => {
  db = new Db(":memory:");
  seed(db, { now: NOW, crowd: SMALL_CROWD });
  backend = createServer(demoBackend(db));
  backendUrl = await listen(backend);
  const handler = createMethodologyHandler(httpArchiveClient(backendUrl), archiveProxy(backendUrl), { now: () => NOW });
  front = createServer((req, res) => void handler(req, res));
  frontUrl = await listen(front);
  // The page asks friend-map's server at its own addresses, from its own page.
  const fetchFromNode = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetchFromNode(new URL(url, frontUrl), { ...init, headers: { ...init?.headers, origin: frontUrl } }));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  setTimeZone(DEMO_TIME_ZONE);
  for (const server of [front, backend]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  db.close();
});

/** Someone on the map with one-to-one messages. */
const someone = async () => (await httpArchive.relationships()).people.find((p) => p.totals.directFromThem > 0)!;

describe("the demo backend", () => {
  it("names what it serves in its handshake, in the crowd's time zone, and friend-map adds its scores", async () => {
    expect(await shakeHands(httpArchive)).toBeNull();
    expect(contract()).toEqual({
      version: "1.0.0", timeZone: DEMO_TIME_ZONE,
      capabilities: ["map", "panel", "content", "table", "calendar", "river", "edit.people", "events", "scores"],
    });
    expect(takesEdits()).toBe(true);
  });

  it("offers the Table, the Calendar and the Time river beside the map views", () => {
    expect(viewsFor(false).map((view) => view.slug)).toEqual(expect.arrayContaining(["web", "orbits", "table", "calendar", "time-river"]));
  });

  it("fits the contract, by contract-check, alone and behind friend-map's server", async () => {
    const alone = await checkBackend(httpBackend(backendUrl));
    expect(alone.checks.filter((c) => c.outcome === "wrong")).toEqual([]);
    expect(alone.ok).toBe(true);
    expect(alone.checks.filter((c) => c.outcome === "ok").map((c) => c.route)).toEqual(expect.arrayContaining([
      "/relationships", "/people/:id/groups", "/content/people/:id/timeline", "/table-rows", "/calendar/:month", "/calendar/:day",
      "/content/conversations/:id/days/:day", "/message-apps", "/events",
    ]));
    const behind = await checkBackend(httpBackend(frontUrl));
    expect([behind.ok, behind.checks.some((c) => c.route === "/table" && c.outcome === "ok")]).toEqual([true, true]);
  });

  it("draws its map from the people nothing archives, and lists everyone in the Table, scored by friend-map", async () => {
    const report = await httpArchive.relationships();
    const archived = db.all<{ id: number }>("SELECT id FROM people WHERE is_you = 0 AND archive_rule IS NOT NULL AND edited = 0");
    expect(report.people.length).toBeGreaterThan(SMALL_CROWD.size! * 0.9);
    expect(report.people.map((p) => p.id)).not.toContain(archived[0].id);
    const table = await httpArchive.table(DEFAULT_SETTINGS);
    expect(table.people.length).toBe(db.one<{ n: number }>("SELECT COUNT(*) AS n FROM people WHERE is_you = 0")!.n);
    expect(table.people.some((p) => p.closeness > 0)).toBe(true);
  });

  it("counts a person's one-to-one messages the same everywhere: the map's months, their summary, their timeline", async () => {
    const person = await someone();
    const summary = await httpArchive.person(person.id);
    expect(summary.directMessageCount).toBe(person.totals.directFromMe + person.totals.directFromThem);
    const page = await httpArchive.timeline(person.id, { limit: 10, count: true });
    expect([page.messages.length, page.total]).toEqual([10, summary.directMessageCount + (await httpArchive.calls(person.id)).length]);
    const older = await httpArchive.timeline(person.id, { limit: 10, before: page.nextBefore! });
    expect(older.messages[0].sentAt).toBeLessThanOrEqual(page.messages.at(-1)!.sentAt);
    expect(new Set([...page.messages, ...older.messages].map((m) => m.id)).size).toBe(20);
  });

  it("answers a Calendar month and day in the crowd's days, and the day's messages of a chat", async () => {
    const person = await someone();
    const last = (await httpArchive.timeline(person.id, { limit: 1 })).messages[0];
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: DEMO_TIME_ZONE }).format(last.sentAt);
    const month = await httpArchive.calendarMonth(day.slice(0, 7));
    expect(month.days.find((d) => d.day === day)?.chats.map((c) => c.chat)).toContain(last.conversation.id);
    const calendarDay = await httpArchive.calendarDay(day);
    expect(calendarDay.chats.map((c) => c.id)).toContain(last.conversation.id);
    const messages = await httpArchive.dayMessages(last.conversation.id, day);
    expect(messages.messages.map((m) => m.id)).toContain(last.id);
  });

  it("gives the Time river each person's messages by app", async () => {
    const person = await someone();
    const apps = (await httpArchive.messageApps()).find((p) => p.id === person.id)!;
    const counted = apps.apps.flatMap((a) => a.months).reduce((n, m) => n + m.messages, 0);
    expect(counted).toBe(person.totals.directFromMe + person.totals.directFromThem + person.totals.groupFromThem);
  });

  it("keeps a change from friend-map's page, says so on the event stream, and the map draws it", async () => {
    const person = await someone();
    const events = await fetch(new URL("/api/archive/events", frontUrl));
    const reader = events.body!.getReader();
    await reader.read();
    const saved = await httpArchive.setNote(person.id, "Ask about the allotment");
    expect(saved.note).toBe("Ask about the allotment");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: people");
    await reader.cancel();
    expect((await httpArchive.relationships()).people.find((p) => p.id === person.id)!.note).toBe("Ask about the allotment");
    const tagged = await httpArchive.setTags(person.id, ["allotment club"]);
    expect([tagged.person.tags, tagged.created]).toEqual([["allotment-club"], ["allotment-club"]]);
    expect((await httpArchive.tags()).map((t) => t.name)).toContain("allotment-club");
  });

  it("refuses a change another site's page sent, and says what is not there", async () => {
    const person = await someone();
    const sent = await fetch(new URL(`/api/archive/people/${person.id}/note`, backendUrl), {
      method: "PUT", headers: { origin: "http://elsewhere.example" }, body: JSON.stringify({ note: "x" }),
    });
    expect([sent.status, await sent.json()]).toEqual([403, { error: "this is only for friend-map's own page" }]);
    await expect(httpArchive.person(999_999)).rejects.toBeInstanceOf(ArchiveUnavailable);
    expect((await fetch(new URL("/api/archive/score-report", backendUrl))).status).toBe(404);
  });

  it("works out local moments across a change of clocks", () => {
    // Melbourne moves its clocks forward on 2026-10-04, from 02:00 to 03:00.
    expect(localMoment("2026-10-03", "12:00", DEMO_TIME_ZONE)).toBe(Date.parse("2026-10-03T02:00:00Z"));
    expect(localMoment("2026-10-05", null, DEMO_TIME_ZONE)).toBe(Date.parse("2026-10-04T13:00:00Z"));
  });
});
