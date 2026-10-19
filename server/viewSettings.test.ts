// The saved view settings on the server (viewSettings.ts, GET and PUT
// /api/view-settings) and their serving into each page (savedSettingsPlugin.ts),
// on a folder of their own, never the real data.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SAVED_SETTINGS_ID, savedSettingsIn } from "../src/savedSettings.ts";
import { createApiHandler } from "./api.ts";
import { savedSettingsPlugin } from "./savedSettingsPlugin.ts";
import { readViewSettings, saveViewSettings, viewSettingsFile } from "./viewSettings.ts";

let dataDir: string;
let server: Server;
let base: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "friend-map-view-settings-"));
  const api = createApiHandler(dataDir);
  server = createServer((req, res) => void api(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/view-settings`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const put = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(base, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("the saved view settings", () => {
  it("are none until one is chosen, or when the file is not valid JSON, and only the settings saved, each one of its own values", async () => {
    expect(await readViewSettings(dataDir)).toEqual({});
    await writeFile(viewSettingsFile(dataDir), "{");
    expect(await readViewSettings(dataDir)).toEqual({});
    await writeFile(viewSettingsFile(dataDir), JSON.stringify({ "web.spokes": "20", "web.colour": "Ada Sample", names: "full", "orbits.top-names": "25", query: "tag:x" }));
    expect(await readViewSettings(dataDir)).toEqual({ "web.spokes": "20", names: "full" });
  });

  it("saves each change over the rest, null forgetting one, in the order sent", async () => {
    await Promise.all([saveViewSettings(dataDir, { "web.spokes": "20", names: "first" }), saveViewSettings(dataDir, { "web.spokes": "22" })]);
    expect(await saveViewSettings(dataDir, { names: null, "web.top-names": "all" })).toEqual({ "web.spokes": "22", "web.top-names": "all" });
    expect(JSON.parse(await readFile(viewSettingsFile(dataDir), "utf8"))).toEqual({ "web.spokes": "22", "web.top-names": "all" });
  });

  it("refuses a setting not saved, or a value not one of its own, and saves nothing of that change", async () => {
    await expect(saveViewSettings(dataDir, { "web.spokes": "20", "orbits.theme": "#123456" })).rejects.toThrow("orbits.theme is not a saved setting");
    await expect(saveViewSettings(dataDir, { names: "Ada" })).rejects.toThrow('"Ada" is not a value of names');
    await expect(saveViewSettings(dataDir, { "web.curve": 0.5 })).rejects.toThrow("0.5 is not a value of web.curve");
    await expect(saveViewSettings(dataDir, ["web.spokes"])).rejects.toThrow("expected an object");
    expect(await readViewSettings(dataDir)).toEqual({});
  });

  it("are served and changed through /api/view-settings, from friend-map's own page only", async () => {
    expect(await (await fetch(base)).json()).toEqual({ settings: {} });
    // Name placement, no longer kept, from a page still open from before: let pass, unsaved.
    const saved = await put({ "name-placement": "next", names: "full", "web.colour": "#3dff9a" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ settings: { names: "full", "web.colour": "#3dff9a" } });
    expect(await (await fetch(base)).json()).toEqual({ settings: { names: "full", "web.colour": "#3dff9a" } });
    expect((await put({ "web.spokes": "lots" })).status).toBe(400);
    expect((await put({ "web.spokes": "20" }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await fetch(base, { method: "DELETE" })).status).toBe(405);
    expect(await readViewSettings(dataDir)).toEqual({ names: "full", "web.colour": "#3dff9a" });
  });
});

describe("serving the saved set into the page", () => {
  /** The tags the plugin puts in a page's head, in the app (`server`) or a build. */
  const tags = async (plugin: ReturnType<typeof savedSettingsPlugin>, server: boolean) => {
    const hook = plugin.transformIndexHtml as (html: string, context: { server?: unknown }) => Promise<{ tag: string; attrs: Record<string, string>; children: string; injectTo: string }[]>;
    return hook("<html></html>", server ? { server: {} } : {});
  };

  it("puts the set, read afresh for each page, in a JSON script in the head, which the page reads back", async () => {
    const plugin = savedSettingsPlugin(dataDir);
    const [empty] = await tags(plugin, true);
    expect(empty).toEqual({ tag: "script", attrs: { type: "application/json", id: SAVED_SETTINGS_ID }, children: "{}", injectTo: "head" });
    await saveViewSettings(dataDir, { "web.spokes": "20", names: "full" });
    const [tag] = await tags(plugin, true);
    const doc = { getElementById: (id: string) => (id === SAVED_SETTINGS_ID ? { textContent: tag.children } : null) };
    expect(savedSettingsIn(doc)).toEqual({ "web.spokes": "20", names: "full" });
  });

  it("says, in a build, which settings it carried", async () => {
    await saveViewSettings(dataDir, { "web.curve": "0.3" });
    const heard: string[][] = [];
    const plugin = savedSettingsPlugin(dataDir, (names) => heard.push(names));
    await tags(plugin, true);
    await tags(plugin, false);
    expect(heard).toEqual([["web.curve"]]);
  });
});
