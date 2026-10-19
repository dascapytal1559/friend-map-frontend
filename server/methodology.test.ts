import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PeopleTable, PersonActivity, ScoreReport, TableRow } from "../src/archive.ts";
import { DEMO_TIME_ZONE } from "../src/demo/timeZone.ts";
import { closenessSettings, DEFAULT_SETTINGS } from "../src/settings.ts";
import { dayKey, monthKey } from "../src/time.ts";
import { sendJson, type ApiHandler } from "./jsonApi.ts";
import { ArchiveUnavailableError, type ArchiveClient } from "./archiveClient.ts";
import { createMethodologyHandler } from "./methodology.ts";

const NOW = Date.parse("2026-10-12T03:00:00Z");
const TODAY = dayKey(NOW);
const [ADA, CY, WALT, FELIX] = [2, 3, 4, 5];

const row = (id: number, name: string): TableRow => ({
  id, name, aliases: [], tags: [], note: "", identiconSeed: "0123456789abcdef", identiconHue: null, location: null, unknown: false,
  untouched: false, archived: null, platforms: [], messageCount: 0, directMessageCount: 0, groupMessageCount: 0, lastMessageAt: null,
  byPlatform: [], calls: null, addedAt: 1, firstContactAt: null,
});
const ROWS = [row(ADA, "Ada Sample"), row(CY, "Cy Example"), row(WALT, "Walt Example"), row(FELIX, "Felix Demo")];
const month = (directFromMe: number, directFromThem: number) => ({
  month: monthKey(NOW), directFromMe, directFromThem, directFromMeSelfOnly: 0, groupFromMe: 0, groupFromThem: 0,
});
/** Ada writes this month; Cy and Walt were at a two-hour catch-up today, Walt with no messages at all. */
const REPORT: ScoreReport = {
  generatedAt: 0,
  people: [{ id: ADA, months: [month(10, 10)] }, { id: CY, months: [] }, { id: WALT, months: [] }],
  groups: [],
  catchUps: [{ id: 1, day: TODAY, hours: 2, time: null, trip: null, byCall: false, others: 0, personIds: [CY, WALT] }],
  callDays: [],
};

let client: ArchiveClient & { down: string | null; asked: string[] };
let server: Server;
let base: string;

beforeAll(async () => {
  client = {
    down: null,
    asked: [],
    async contract() {
      if (this.down) throw new ArchiveUnavailableError(this.down);
      return { version: "1.0.0", capabilities: ["map", "score-report", "table"], timeZone: DEMO_TIME_ZONE };
    },
    async scoreReport() {
      if (this.down) throw new ArchiveUnavailableError(this.down);
      return structuredClone(REPORT);
    },
    async tableRows() {
      if (this.down) throw new ArchiveUnavailableError(this.down);
      return structuredClone(ROWS);
    },
    async hasPerson(id) {
      if (this.down) throw new ArchiveUnavailableError(this.down);
      return ROWS.some((r) => r.id === id);
    },
    async mapFacts() {
      throw new Error("the Table and the activity chart never read the map's facts");
    },
  };
  const archive: ApiHandler = async (req, res) => {
    client.asked.push(`${req.method} ${req.url}`);
    sendJson(res, 200, { archive: true });
  };
  const handler = createMethodologyHandler(client, archive, { now: () => NOW });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/archive`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${base}${path}`);
  expect(response.status, path).toBe(200);
  return (await response.json()) as T;
}

describe("the Table", () => {
  it("is the archive's rows, in its order, each with its closeness now, worked out with the settings asked for", async () => {
    const table = await get<PeopleTable>("/table");
    expect(table.generatedAt).toBe(NOW);
    expect(table.settings).toEqual(closenessSettings(DEFAULT_SETTINGS));
    expect(table.people.map(({ closeness, ...rest }) => rest)).toEqual(ROWS);
    const closeness = new Map(table.people.map((p) => [p.id, p.closeness]));
    // Today, so whole: two hours at 50 messages an hour, each of the two taking 75% (half shared, half split).
    expect(closeness.get(CY)).toBeCloseTo(75);
    expect(closeness.get(WALT)).toBeCloseTo(75);
    expect(closeness.get(ADA)).toBeGreaterThan(0);
    // Someone the report does not name (no messages, catch-ups or calls) has none.
    expect(closeness.get(FELIX)).toBe(0);

    const walt = async (query: string) => (await get<PeopleTable>(`/table?${query}`)).people.find((p) => p.id === WALT)!.closeness;
    expect(await walt("catchUpHourWorth=30")).toBeCloseTo(45);
    // Split equally, nothing shared: 50 each.
    expect(await walt("groupSharedPart=0")).toBeCloseTo(50);
    expect(await walt("catchUpHourWorth=0")).toBe(0);
    // A shorter half-life forgets Ada's month faster; the last of a setting named twice counts.
    const short = await get<PeopleTable>("/table?closenessHalfLifeDays=7");
    expect(short.settings.closenessHalfLifeDays).toBe(7);
    expect(short.people.find((p) => p.id === ADA)!.closeness).toBeLessThan(closeness.get(ADA)!);
    expect((await get<PeopleTable>(`/table?messageReciprocity=${String(1e-7)}&messageReciprocity=0.5`)).settings.messageReciprocity).toBe(0.5);
  });

  it("refuses anything but a closeness setting in range", async () => {
    for (const wrong of ["closenessHalfLifeDays=2", "closenessHalfLifeDays=soon", "catchUpHourWorth=-1", "catchUpHourWorth=1001", "callMinimumMinutes=1.5", "messageReciprocity=1.5", "messageReciprocity=-0.5", "messageReciprocity=half", "phoneCatchUpWorth=50", "trendMonths=12", "halfLifeDays=90"]) {
      expect((await fetch(`${base}/table?${wrong}`)).status, wrong).toBe(400);
    }
  });
});

describe("a person's activity", () => {
  it("is their months and what each counted for, with the settings asked for; 404 for nobody", async () => {
    const ada = await get<PersonActivity>(`/people/${ADA}/activity`);
    expect(ada.months).toEqual(REPORT.people[0].months);
    const even = await get<PersonActivity>(`/people/${ADA}/activity?messageReciprocity=0`);
    expect(even.points.reduce((sum, p) => sum + p.directThem + p.directYou, 0)).toBeCloseTo(20);
    const walt = await get<PersonActivity>(`/people/${WALT}/activity`);
    expect(walt.months).toEqual([]);
    expect(walt.points).toMatchObject([{ month: monthKey(NOW), hangoutCount: 1 }]);
    expect((await get<PersonActivity>(`/people/${FELIX}/activity`)).points).toEqual([]);
    expect((await fetch(`${base}/people/999999/activity`)).status).toBe(404);
    expect((await fetch(`${base}/people/${ADA}/activity?messageReciprocity=2`)).status).toBe(400);
  });
});

describe("the rest", () => {
  it("goes to the archive: every other route, and these two asked for any other way", async () => {
    client.asked.length = 0;
    expect(await get("/people")).toEqual({ archive: true });
    expect(await get("/table-rows")).toEqual({ archive: true });
    expect(await get(`/people/${ADA}/activity/more`)).toEqual({ archive: true });
    expect((await fetch(`${base}/table`, { method: "POST" })).status).toBe(200);
    expect(client.asked).toEqual(["GET /api/archive/people", "GET /api/archive/table-rows", `GET /api/archive/people/${ADA}/activity/more`, "POST /api/archive/table"]);
  });

  it("answers 503, as the archive's routes do, when the archive cannot answer", async () => {
    client.down = "there is no archive's folder";
    try {
      for (const path of ["/table", `/people/${ADA}/activity`]) {
        const response = await fetch(`${base}${path}`);
        expect([response.status, await response.json()]).toEqual([503, { error: "the archive is not available: there is no archive's folder" }]);
      }
    } finally {
      client.down = null;
    }
  });
});
