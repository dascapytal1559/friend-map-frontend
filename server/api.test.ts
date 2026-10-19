import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { createApiHandler } from "./api.ts";

let dataDir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "friend-map-api-"));
  const api = createApiHandler(dataDir);
  server = createServer((req, res) => void api(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

function send(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("API", () => {
  it("appends usage reports to data/usage.jsonl, and refuses malformed ones", async () => {
    const opened = Date.now() - 5000;
    expect((await send("/usage", "POST", { view: "orbits", opened, seconds: 0 })).status).toBe(204);
    expect((await send("/usage", "POST", { view: "orbits", opened, seconds: 42 })).status).toBe(204);
    const lines = (await readFile(join(dataDir, "usage.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { view: "orbits", opened, at: expect.any(Number), seconds: 0 },
      { view: "orbits", opened, at: expect.any(Number), seconds: 42 },
    ]);
    expect((await send("/usage", "POST", { view: "../etc", opened, seconds: 1 })).status).toBe(400);
    expect((await send("/usage", "POST", { view: "orbits", opened, seconds: -1 })).status).toBe(400);
    expect((await send("/usage", "POST", { view: "orbits", opened: "yesterday", seconds: 1 })).status).toBe(400);
    expect((await send("/usage", "GET")).status).toBe(405);
  });

  it("serves data/settings.json, with the defaults when it is missing or wrong", async () => {
    expect(await (await fetch(`${base}/settings`)).json()).toEqual({ settings: DEFAULT_SETTINGS, problems: [] });
    await writeFile(join(dataDir, "settings.json"), '{"trendMonths": 6, "catchUpHourWorth": 30}');
    expect(await (await fetch(`${base}/settings`)).json()).toEqual({ settings: { ...DEFAULT_SETTINGS, trendMonths: 6, catchUpHourWorth: 30 }, problems: [] });
    await writeFile(join(dataDir, "settings.json"), '{"trendMonths": 6,');
    const broken = await (await fetch(`${base}/settings`)).json();
    expect(broken.settings).toEqual(DEFAULT_SETTINGS);
    expect(broken.problems).toEqual([expect.stringMatching(/^is not valid JSON/)]);
    expect((await send("/settings", "PUT", {})).status).toBe(405);
  });

  it("answers bad requests with 4xx and a message, and has no person file or canvas routes any more", async () => {
    for (const path of ["/friends", "/friends/ada-sample", "/canvas", "/events", "/layouts/tldraw"]) {
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    }
    const badJson = await fetch(`${base}/usage`, { method: "POST", body: "{" });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "request body is not valid JSON" });
    expect((await send("/usage", "DELETE")).status).toBe(405);
  });
});
