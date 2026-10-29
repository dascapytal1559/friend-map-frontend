// friend-map on the least a backend can be: the four routes of the `map` capability, with only the fields the contract
// requires (fixtures/fourRouteBackend.ts). friend-map's server stands in front of it as it does of any backend, and
// the page's own binding (archiveHttp.ts) reads it through that server: the handshake taken, its time zone counted in,
// the views it cannot serve not offered, every field it leaves out filled in, the query language run in the page and
// the Events chart scored from its map's report. Then the Spider web and Orbits draw its people. And with no backend
// behind friend-map's server, the handshake says so, and the page in place of the app points at the public demo.

import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ArchiveError, ArchiveUnavailable } from "../src/archiveApi.ts";
import { httpArchive } from "../src/archiveHttp.ts";
import { checkBackend } from "../src/contract/check.ts";
import { contract, shakeHands } from "../src/contract/handshake.ts";
import { DEMO_TIME_ZONE } from "../src/demo/timeZone.ts";
import { DEMOS } from "../src/demos/Demos.tsx";
import { buildModel } from "../src/demos/model.ts";
import { identiconSeedOf } from "../src/identicon.ts";
import { NoBackend } from "../src/NoBackend.tsx";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { setTimeZone, timeZone } from "../src/time.ts";
import { viewsFor } from "../src/views.ts";
import { archiveProxy } from "./archiveProxy.ts";
import { httpArchiveClient } from "./archiveClient.ts";
import { httpBackend } from "./contract-check.ts";
import { fourRouteServer, standInCrowd, STAND_IN_CONTRACT } from "./fixtures/fourRouteBackend.ts";
import { createMethodologyHandler } from "./methodology.ts";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const crowd = standInCrowd(NOW);

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
  backend = fourRouteServer(crowd, { now: () => NOW });
  backendUrl = await listen(backend);
  const handler = createMethodologyHandler(httpArchiveClient(backendUrl), archiveProxy(backendUrl), { now: () => NOW });
  front = createServer((req, res) => void handler(req, res));
  frontUrl = await listen(front);
  // The page asks friend-map's server at its own addresses (/api/archive/...), as on its page.
  const fetchFromNode = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fetchFromNode(new URL(url, frontUrl), init));
  // The map asks the window whether motion is reduced, and the river measures names on a canvas; neither is here.
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  setTimeZone(DEMO_TIME_ZONE);
  for (const server of [front, backend]) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("friend-map on a backend of four routes", () => {
  it("takes its handshake through friend-map's server: the map and friend-map's own scores, in the backend's time zone", async () => {
    expect(await shakeHands(httpArchive)).toBeNull();
    expect(contract()).toEqual({ ...STAND_IN_CONTRACT, capabilities: ["map", "scores"] });
    expect(timeZone()).toBe("Europe/Berlin");
  });

  it("offers the map views, and not the Table, the Calendar or the Time river, which need more than the map", () => {
    const offered = viewsFor(false).map((view) => view.slug);
    expect(offered).toEqual(expect.arrayContaining(["web", "orbits", "orbits-3d", "circles", "city", "river", "reciprocity"]));
    for (const slug of ["table", "calendar", "time-river"]) expect(offered).not.toContain(slug);
  });

  it("draws everyone on the Spider web and Orbits", async () => {
    const report = await httpArchive.relationships();
    const model = buildModel(report, { settings: DEFAULT_SETTINGS });
    expect(model.people.map((p) => p.id).sort()).toEqual(crowd.map((f) => f.id).sort());
    for (const slug of ["web", "orbits"]) {
      const { View } = DEMOS.find((demo) => demo.slug === slug)!;
      const html = renderToStaticMarkup(createElement(View, {
        model, width: 1600, height: 1000, inset: 80, hover: () => {}, open: () => {}, held: null, heldGroup: null, find: null,
      }));
      const named = crowd.filter((f) => html.includes(f.name.split(" ")[0]));
      expect([slug, named.length]).toEqual([slug, crowd.length]);
    }
  });

  it("fills in what the backend leaves out: the person panel's header has everyone's defaults", async () => {
    const person = await httpArchive.person(101);
    expect(person).toMatchObject({
      id: 101, name: "Ada Sample", aliases: [], tags: [], note: "", accounts: [], archived: null, location: null,
      identiconSeed: identiconSeedOf(101, 0), messageCount: 0, lastMessageAt: null, joined: null,
    });
    const report = await httpArchive.relationships();
    const ada = report.people.find((p) => p.id === 101)!;
    expect(ada.totals.directFromThem).toBe(ada.months.reduce((sum, m) => sum + m.directFromThem, 0));
    expect([report.gapDays, report.unlinks, report.callDays, report.groups[0].messageCount]).toEqual([14, [], [], 0]);
    await expect(httpArchive.person(999)).rejects.toBeInstanceOf(ArchiveUnavailable);
  });

  it("runs the query language in the page, as the backend runs none", async () => {
    expect((await httpArchive.query("")).ids.sort()).toEqual(crowd.map((f) => f.id).sort());
    expect((await httpArchive.query("group:#1")).ids.sort()).toEqual(crowd.slice(0, 4).map((f) => f.id).sort());
    await expect(httpArchive.query("SELECT 1")).rejects.toThrow(ArchiveError);
    await expect(httpArchive.query("tag:climbing")).rejects.toThrow(/climbing/);
  });

  it("scores the Events chart from the map's report, the backend having no score report", async () => {
    const activity = await httpArchive.activity(101, DEFAULT_SETTINGS);
    expect(activity.months.map((m) => m.month)).toEqual(crowd[0].months.map(([month]) => month));
    expect(activity.points.length).toBeGreaterThan(0);
  });

  it("finds what the backend does not serve not there, as a 404 the page passes over", async () => {
    await expect(httpArchive.groups(101)).rejects.toBeInstanceOf(ArchiveUnavailable);
    await expect(httpArchive.timeline(101)).rejects.toBeInstanceOf(ArchiveUnavailable);
    await expect(httpArchive.table(DEFAULT_SETTINGS)).rejects.toBeInstanceOf(ArchiveUnavailable);
  });

  it("fits the contract, by contract-check, alone and behind friend-map's server", async () => {
    const alone = await checkBackend(httpBackend(backendUrl));
    expect(alone.checks.filter((c) => c.outcome !== "ok")).toEqual([]);
    expect([alone.ok, alone.checks.map((c) => c.route)]).toEqual([true, ["/contract", "/people", "/relationships", "/people/:id", "/people/:id (someone not there)"]]);
    const behind = await checkBackend(httpBackend(frontUrl));
    expect([behind.ok, behind.checks.map((c) => c.route).at(-1)]).toEqual([true, "/people/:id/activity"]);
  });
});

describe("friend-map with no backend", () => {
  it("says so at the handshake, in friend-map's server's words, and the page points at the public demo and the demo backend", async () => {
    // A port nothing listens on: taken, then let go.
    const gone = createServer();
    const goneUrl = await listen(gone);
    await new Promise((resolve) => gone.close(resolve));
    const handler = createMethodologyHandler(httpArchiveClient(goneUrl), archiveProxy(goneUrl), { now: () => NOW });
    const alone = createServer((req, res) => void handler(req, res));
    const aloneUrl = await listen(alone);
    // The page's fetch asks this server instead of the one in front of the four routes, until the test ends.
    const before = globalThis.fetch;
    try {
      vi.stubGlobal("fetch", (url: string, init?: RequestInit) => before(new URL(url, aloneUrl), init));
      const shaken = await shakeHands(httpArchive);
      expect(shaken).toEqual({ down: `the archive is not available: nothing answers at ${goneUrl} (ECONNREFUSED)` });
      const html = renderToStaticMarkup(createElement(NoBackend, { why: (shaken as { down: string }).down }));
      expect(html).toContain("friend-map has no backend running");
      expect(html).toContain('<a href="https://friend-map-demo.pages.dev/spider" target="_blank" rel="noopener noreferrer">Open the public demo</a>');
      expect(html).toContain("<code>npm run demo-backend</code>");
      expect(html).toContain("<code>FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4700 npm start</code>");
      expect(html).toContain(`nothing answers at ${goneUrl}`);
    } finally {
      vi.stubGlobal("fetch", before);
      alone.closeAllConnections();
      await new Promise((resolve) => alone.close(resolve));
    }
  });
});
