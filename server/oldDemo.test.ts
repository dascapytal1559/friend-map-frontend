import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { oldDemoAddress, PUBLIC_DEMO } from "../src/views.ts";
import { serveAtBase } from "./basePath.ts";
import { redirectOldDemo } from "./oldDemo.ts";

describe("oldDemoAddress", () => {
  it("sends /demo to the public demo's Spider web", () => {
    expect(PUBLIC_DEMO).toBe("https://friend-map-demo.pages.dev/spider");
    for (const url of ["/demo", "/demo/"]) expect(oldDemoAddress(url), url).toBe(PUBLIC_DEMO);
    expect(oldDemoAddress("/demo?colour=3dff9a")).toBe(`${PUBLIC_DEMO}?colour=3dff9a`);
  });

  it("sends /demo/<view> to the same view on the public demo's site, its query kept", () => {
    expect(oldDemoAddress("/demo/orbits-3d")).toBe("https://friend-map-demo.pages.dev/orbits-3d");
    expect(oldDemoAddress("/demo/spider/")).toBe("https://friend-map-demo.pages.dev/spider");
    expect(oldDemoAddress("/demo/spider?colour=3dff9a")).toBe("https://friend-map-demo.pages.dev/spider?colour=3dff9a");
    // A view the demo has not is its site's to answer: it shows its Spider web.
    expect(oldDemoAddress("/demo/city")).toBe("https://friend-map-demo.pages.dev/city");
  });

  it("leaves every other address to the app, lookalikes included", () => {
    for (const url of ["/", "/spider", "/demos", "/demos/orbits", "/demonstration", "/city/demo", "/api/demo"]) expect(oldDemoAddress(url), url).toBeNull();
  });
});

describe("redirectOldDemo, on the app's server", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer();
    serveAtBase(server, {
      archive: (_req, res) => res.end("archive"),
      api: (_req, res) => res.end("api"),
      page: (req, res) => void (redirectOldDemo(req, res) || res.end(`page ${req.url}`)),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  function get(path: string): Promise<{ status: number; location?: string; body: string }> {
    return new Promise((resolve, reject) => {
      request({ host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body }));
      }).on("error", reject).end();
    });
  }

  it("sends an old /demo link on to the public demo, at the root or under /friend-map, before any page is served", async () => {
    expect(await get("/demo")).toEqual({ status: 302, location: PUBLIC_DEMO, body: "" });
    expect(await get("/friend-map/demo")).toEqual({ status: 302, location: PUBLIC_DEMO, body: "" });
    expect((await get("/friend-map/demo/orbits-3d")).location).toBe("https://friend-map-demo.pages.dev/orbits-3d");
  });

  it("serves the app's own pages as ever", async () => {
    expect(await get("/spider")).toEqual({ status: 200, location: undefined, body: "page /friend-map/spider" });
    expect(await get("/friend-map/demos")).toEqual({ status: 200, location: undefined, body: "page /friend-map/demos" });
  });
});
