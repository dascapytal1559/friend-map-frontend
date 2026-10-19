// Where the page was opened (mount.ts): at the root, or under /friend-map (Tailscale Serve's path mount, see
// server/basePath.ts). Opened under it, every request to the server, every link of the view switcher and every
// history entry stays under it, and the views and the demo read the address as at the root.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { address, appPath, mountOf } from "./mount.ts";

describe("mountOf", () => {
  it("is the base for an address under it, and the root for any other", () => {
    expect(mountOf("/friend-map", "/friend-map")).toBe("/friend-map");
    expect(mountOf("/friend-map/", "/friend-map")).toBe("/friend-map");
    expect(mountOf("/friend-map/demo/city", "/friend-map")).toBe("/friend-map");
    for (const pathname of ["/", "/spider", "/friend-mapx", "/demo/friend-map"]) expect(mountOf(pathname, "/friend-map"), pathname).toBe("");
  });

  it("is always the root with no base (the static demo, built for the root of its own site)", () => {
    expect(mountOf("/friend-map/spider", "")).toBe("");
  });
});

describe("appPath and address", () => {
  it("read an address under the mount as the app's own path, and put the app's paths back under it", () => {
    expect(appPath("/friend-map/spider", "/friend-map")).toBe("/spider");
    expect(appPath("/friend-map/", "/friend-map")).toBe("/");
    expect(appPath("/friend-map", "/friend-map")).toBe("/");
    expect(appPath("/friend-map/demo/city", "/friend-map")).toBe("/demo/city");
    expect(address("/spider", "/friend-map")).toBe("/friend-map/spider");
    expect(address("/", "/friend-map")).toBe("/friend-map/");
    expect(address("/api/archive/events", "/friend-map")).toBe("/friend-map/api/archive/events");
  });

  it("leave everything as it is at the root", () => {
    expect(appPath("/spider", "")).toBe("/spider");
    expect(address("/api/settings", "")).toBe("/api/settings");
  });
});

/** The page's modules as they load in a page opened at `pathname`, with Vite's base the app's (vite.config.ts). */
async function openedAt(pathname: string) {
  vi.resetModules();
  vi.stubEnv("BASE_URL", "/friend-map/");
  vi.stubGlobal("location", { pathname, search: "", hash: "" });
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    const answer = url.endsWith("/api/me") ? { photo: "/api/me/photo?v=3" } : url.endsWith("/api/archive/people") ? { people: [] } : [];
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  vi.stubGlobal("EventSource", class {
    constructor(url: string) {
      asked.push(url);
    }
    addEventListener() {}
    close() {}
  });
  const { httpArchive } = await import("./archiveHttp.ts");
  const { httpApp } = await import("./appHttp.ts");
  const { ViewList } = await import("./ViewSwitcher.tsx");
  const { demoMode } = await import("./demoMode.ts");
  const mount = await import("./mount.ts");
  return { httpArchive, httpApp, ViewList, demoMode, mount, asked };
}

describe("a page opened under /friend-map", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("asks the server for everything under it, the photo and attachments it shows included", async () => {
    const { httpArchive, httpApp, asked } = await openedAt("/friend-map/spider");
    await httpArchive.people();
    await httpApp.settings();
    const photo = await httpApp.mePhoto();
    httpArchive.follow(() => {})();
    expect(asked).toEqual(["/friend-map/api/archive/people", "/friend-map/api/settings", "/friend-map/api/me", "/friend-map/api/archive/events"]);
    expect(photo).toBe("/friend-map/api/me/photo?v=3");
    expect(httpArchive.attachmentUrl(7)).toBe("/friend-map/api/archive/content/attachments/7");
  });

  it("links every view under it, and reads its own address as the app's path", async () => {
    const { ViewList, mount } = await openedAt("/friend-map/spider");
    expect(mount.mount).toBe("/friend-map");
    expect(mount.appPath("/friend-map/spider")).toBe("/spider");
    const html = renderToStaticMarkup(createElement(ViewList, { current: "web", onPick: () => {}, demo: false }));
    expect(html).toContain('href="/friend-map/orbits"');
    expect(html).toContain('href="/friend-map/spider"');
    expect(html).toContain('href="/friend-map/demo"');
    expect(html).not.toMatch(/href="\/(?!friend-map\/)/);
  });

  it("is the demo at /friend-map/demo, and the real app elsewhere under it", async () => {
    expect((await openedAt("/friend-map/demo/city")).demoMode).toBe(true);
    expect((await openedAt("/friend-map/spider")).demoMode).toBe(false);
  });
});

describe("a page opened at the root", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("asks the server and links the views at the root, as it always has", async () => {
    const { httpArchive, ViewList, demoMode, asked } = await openedAt("/spider");
    await httpArchive.people();
    expect(asked).toEqual(["/api/archive/people"]);
    expect(httpArchive.attachmentUrl(7)).toBe("/api/archive/content/attachments/7");
    const html = renderToStaticMarkup(createElement(ViewList, { current: "web", onPick: () => {}, demo: false }));
    expect(html).toContain('href="/spider"');
    expect(html).not.toContain("friend-map/");
    expect(demoMode).toBe(false);
  });
});
