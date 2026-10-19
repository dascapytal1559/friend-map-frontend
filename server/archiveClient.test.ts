// friend-map's client of the archive's server, against a stand-in archive: the score report and the Table's rows
// kept by their ETag and asked for again with If-None-Match, a person there or not, and the archive unavailable
// (503, or nothing answering) as ArchiveUnavailableError; a backend from before the handshake, and one with no score
// report, scored from its map's report; and friend-map's own routes and the proxy together in front.

import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Contract, MapFacts, PeopleTable, RelationshipsReport, ScoreReport, TableRow } from "../src/archive.ts";
import { preContract } from "../src/contract/handshake.ts";
import { DEMO_TIME_ZONE } from "../src/demo/timeZone.ts";
import { timeZone } from "../src/time.ts";
import { ArchiveUnavailableError, httpArchiveClient } from "./archiveClient.ts";
import { archiveProxy } from "./archiveProxy.ts";
import { ARCHIVE_FOLDER_HEADER } from "./dataHome.ts";
import { sendJson } from "./jsonApi.ts";
import { createMethodologyHandler } from "./methodology.ts";

const NOW = Date.parse("2026-10-12T03:00:00Z");
const ROW: TableRow = {
  id: 2, name: "Ada Sample", aliases: [], tags: [], note: "", identiconSeed: "0123456789abcdef", identiconHue: null, location: null, unknown: false,
  untouched: false, archived: null, platforms: [], messageCount: 0, directMessageCount: 0, groupMessageCount: 0, lastMessageAt: null, byPlatform: [], calls: null, addedAt: 1, firstContactAt: null,
};
const REPORT: ScoreReport = { generatedAt: 0, people: [{ id: 2, months: [] }], groups: [], catchUps: [], callDays: [] };
const FACTS = { people: [], archived: { byHand: 0, byRule: {} } } as unknown as MapFacts;

let archive: Server;
let archiveUrl: string;
/** The map's report of a backend with no score report: only what the contract requires of it. */
const MAP = { people: [{ id: 2, name: "Ada Sample", months: [{ month: "2026-09", directFromMe: 3, directFromThem: 4, groupFromMe: 0, groupFromThem: 0 }] }] };

/**
 * The stand-in archive's state: its version (the ETag), whether it can open the archive, its handshake (none, as the
 * life archive's before it), whether it has a score report, and what it was asked.
 */
let state: { version: number; open: boolean; contract: Contract | null; scoreReport: boolean; asked: string[] };

const listen = async (server: Server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeAll(async () => {
  archive = createServer((req, res) => {
    const match = req.headers["if-none-match"] === `"${state.version}"`;
    const folder = req.headers[ARCHIVE_FOLDER_HEADER];
    state.asked.push(`${req.url}${req.headers["if-none-match"] ? ` if-none-match ${req.headers["if-none-match"]}` : ""}${folder ? ` folder ${decodeURIComponent(String(folder))}` : ""}`);
    if (!state.open) return sendJson(res, 503, { error: "the archive is not available: there is no archive's folder at /nowhere" });
    if (req.url === "/api/archive/contract") return state.contract ? sendJson(res, 200, state.contract) : sendJson(res, 404, { error: "no route GET /api/archive/contract" });
    if (req.url === "/api/archive/score-report" && !state.scoreReport) return sendJson(res, 404, { error: "no route GET /api/archive/score-report" });
    if (req.url === "/api/archive/relationships") return sendJson(res, 200, MAP);
    if (req.url === "/api/archive/score-report" || req.url === "/api/archive/table-rows") {
      if (match) return void res.writeHead(304, { etag: `"${state.version}"` }).end();
      res.writeHead(200, { etag: `"${state.version}"`, "content-type": "application/json" });
      return void res.end(JSON.stringify(req.url.endsWith("score-report") ? { ...REPORT, generatedAt: state.version } : [{ ...ROW, note: `v${state.version}` }]));
    }
    if (req.url === "/api/archive/people/2") return sendJson(res, 200, ROW);
    if (req.url === "/api/archive/people/9") return sendJson(res, 404, { error: "no person 9" });
    if (req.url === "/api/archive/map-facts") return sendJson(res, 200, FACTS);
    sendJson(res, 500, { error: "something broke" });
  });
  archiveUrl = await listen(archive);
});

beforeEach(() => {
  state = { version: 1, open: true, contract: null, scoreReport: true, asked: [] };
});

afterAll(async () => {
  archive.closeAllConnections();
  await new Promise((resolve) => archive.close(resolve));
});

describe("the archive's client", () => {
  it("keeps the score report and the Table's rows by their ETag until the archive changes", async () => {
    const client = httpArchiveClient(archiveUrl);
    expect((await client.scoreReport()).generatedAt).toBe(1);
    const first = await client.tableRows();
    expect(await client.tableRows()).toBe(first);
    expect((await client.scoreReport()).generatedAt).toBe(1);
    state.version = 2;
    expect((await client.scoreReport()).generatedAt).toBe(2);
    expect((await client.tableRows())[0]!.note).toBe("v2");
    expect(state.asked).toEqual([
      "/api/archive/score-report",
      "/api/archive/table-rows",
      '/api/archive/table-rows if-none-match "1"',
      '/api/archive/score-report if-none-match "1"',
      '/api/archive/score-report if-none-match "1"',
      '/api/archive/table-rows if-none-match "1"',
    ]);
  });

  it("knows whether there is a person, and reads the map's facts", async () => {
    const client = httpArchiveClient(archiveUrl);
    expect([await client.hasPerson(2), await client.hasPerson(9)]).toEqual([true, false]);
    expect(await client.mapFacts()).toEqual(FACTS);
  });

  it("names the archive's folder it was given on every request", async () => {
    const client = httpArchiveClient(archiveUrl, { folder: "/srv/life archive ü/data" });
    await client.scoreReport();
    await client.scoreReport();
    await client.hasPerson(2);
    expect(state.asked).toEqual([
      "/api/archive/score-report folder /srv/life archive ü/data",
      '/api/archive/score-report if-none-match "1" folder /srv/life archive ü/data',
      "/api/archive/people/2 folder /srv/life archive ü/data",
    ]);
  });

  it("says the archive is unavailable, and why, when it answers 503 or nothing answers", async () => {
    state.open = false;
    const client = httpArchiveClient(archiveUrl);
    await expect(client.scoreReport()).rejects.toThrow(new ArchiveUnavailableError("there is no archive's folder at /nowhere"));
    await expect(client.hasPerson(2)).rejects.toBeInstanceOf(ArchiveUnavailableError);
    // A port nothing answers on: one taken and given back.
    const freed = createServer();
    const goneUrl = await listen(freed);
    await new Promise((resolve) => freed.close(resolve));
    await expect(httpArchiveClient(goneUrl).tableRows()).rejects.toThrow(new ArchiveUnavailableError(`nothing answers at ${goneUrl} (ECONNREFUSED)`));
  });

  it("takes a backend with no handshake to be one from before it, which serves everything", async () => {
    expect(await httpArchiveClient(archiveUrl).contract()).toEqual(preContract());
    state.contract = { version: "1.2.0", capabilities: ["map"], timeZone: "Europe/Berlin" };
    expect(await httpArchiveClient(archiveUrl).contract()).toEqual(state.contract);
  });

  it("works the score report out from the map's report for a backend with none, the people on the map only", async () => {
    state.scoreReport = false;
    const report = await httpArchiveClient(archiveUrl).scoreReport();
    expect(report.people).toEqual([{ id: 2, months: [{ ...MAP.people[0].months[0], directFromMeSelfOnly: 0 }] }]);
    expect([report.groups, report.catchUps, report.callDays]).toEqual([[], [], []]);
    expect(state.asked).toEqual(["/api/archive/score-report", "/api/archive/relationships"]);
  });

  it("passes on anything else the archive answers as an error", async () => {
    await expect(httpArchiveClient(archiveUrl).hasPerson(3)).rejects.toThrow("the archive answered 500: something broke");
  });
});

describe("friend-map's door to the archive", () => {
  let front: Server;
  let frontUrl: string;

  beforeAll(async () => {
    const handler = createMethodologyHandler(httpArchiveClient(archiveUrl), archiveProxy(archiveUrl), { now: () => NOW });
    front = createServer((req, res) => void handler(req, res));
    frontUrl = await listen(front);
  });

  afterAll(async () => {
    front.closeAllConnections();
    await new Promise((resolve) => front.close(resolve));
  });

  it("scores the Table itself from the archive's facts, and passes every other request to the archive", async () => {
    const table = (await (await fetch(`${frontUrl}/api/archive/table`)).json()) as PeopleTable;
    expect(table.generatedAt).toBe(NOW);
    expect(table.people.map((p) => [p.id, p.closeness])).toEqual([[2, 0]]);
    expect((await fetch(`${frontUrl}/api/archive/people/9/activity`)).status).toBe(404);
    expect(await (await fetch(`${frontUrl}/api/archive/people/2`)).json()).toEqual(ROW);
  });

  it("answers the handshake with its own scores added, and counts days in the backend's time zone from then on", async () => {
    const before = (await (await fetch(`${frontUrl}/api/archive/contract`)).json()) as Contract;
    expect(before).toEqual({ ...preContract(), capabilities: [...preContract().capabilities, "scores"] });
    state.contract = { version: "1.0.0", capabilities: ["map"], timeZone: "Pacific/Auckland" };
    try {
      expect(await (await fetch(`${frontUrl}/api/archive/contract`)).json()).toEqual({ ...state.contract, capabilities: ["map", "scores"] });
      expect(timeZone()).toBe("Pacific/Auckland");
      // A backend of another major version is passed on as it is, for the page to refuse, and never taken.
      state.contract = { version: "2.0.0", capabilities: ["map"], timeZone: "Europe/Berlin" };
      expect(((await (await fetch(`${frontUrl}/api/archive/contract`)).json()) as Contract).version).toBe("2.0.0");
      expect(timeZone()).toBe("Pacific/Auckland");
    } finally {
      const { setTimeZone } = await import("../src/time.ts");
      setTimeZone(DEMO_TIME_ZONE);
    }
  });

  it("scores a backend with no score report from its map's report", async () => {
    state.scoreReport = false;
    const activity = (await (await fetch(`${frontUrl}/api/archive/people/2/activity`)).json()) as { months: RelationshipsReport["people"][number]["months"] };
    expect(activity.months.map((m) => [m.month, m.directFromThem])).toEqual([["2026-09", 4]]);
  });

  it("answers 503 for its own routes and the archive's alike while the archive is unavailable", async () => {
    state.open = false;
    for (const path of ["/table", "/people/2/activity", "/people/2"]) {
      const got = await fetch(`${frontUrl}/api/archive${path}`);
      expect(got.status, path).toBe(503);
      expect(((await got.json()) as { error: string }).error).toBe("the archive is not available: there is no archive's folder at /nowhere");
    }
  });
});
