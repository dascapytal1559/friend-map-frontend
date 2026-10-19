import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BASE_PATH, serveAtBase, underBase, withoutBase } from "./basePath.ts";

describe("withoutBase", () => {
  it("takes the base off the front, leaving the path from / on", () => {
    expect(withoutBase("/friend-map/spider")).toBe("/spider");
    expect(withoutBase("/friend-map/")).toBe("/");
    expect(withoutBase("/friend-map")).toBe("/");
    expect(withoutBase("/friend-map?colour=3dff9a")).toBe("/?colour=3dff9a");
    expect(withoutBase("/friend-map/api/archive/people?tag=keep")).toBe("/api/archive/people?tag=keep");
  });

  it("leaves a path at the root as it is, a lookalike of the base included", () => {
    for (const url of ["/", "/spider", "/api/settings", "/friend-mapx", "/friend-map-old/spider", "/demo/friend-map"]) {
      expect(withoutBase(url), url).toBe(url);
    }
  });
});

describe("underBase", () => {
  it("puts any path under the base, once", () => {
    expect(underBase("/")).toBe("/friend-map/");
    expect(underBase("/spider?x=1")).toBe("/friend-map/spider?x=1");
    expect(underBase("/friend-map/spider")).toBe("/friend-map/spider");
    expect(underBase("/friend-map")).toBe("/friend-map/");
    expect(underBase("/?token=abc")).toBe(`${BASE_PATH}/?token=abc`);
  });
});

describe("serveAtBase", () => {
  let server: Server;
  let port: number;
  const upgrades: string[] = [];

  beforeEach(async () => {
    upgrades.length = 0;
    server = createServer();
    // Stands in for Vite's hot-reload websocket, listening before serveAtBase as Vite's does (it is made with the server).
    server.on("upgrade", (req, socket) => {
      upgrades.push(req.url ?? "");
      socket.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
    });
    serveAtBase(server, {
      archive: (req, res) => res.end(`archive ${req.url}`),
      api: (req, res) => res.end(`api ${req.url}`),
      page: (req, res) => res.end(`page ${req.url}`),
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  function get(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      request({ port, path, headers: { host: "localhost" } }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      }).on("error", reject).end();
    });
  }

  function upgrade(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      request({ port, path, headers: { host: "localhost", connection: "Upgrade", upgrade: "websocket" } })
        .on("upgrade", (_res, socket) => (socket.destroy(), resolve()))
        .on("error", reject)
        .end();
    });
  }

  it("gives the API its routes from /api on, at the root and under the base alike", async () => {
    for (const prefix of ["", "/friend-map"]) {
      expect(await get(`${prefix}/api/archive/people?tag=keep`)).toBe("archive /api/archive/people?tag=keep");
      expect(await get(`${prefix}/api/archive/content/attachments/7`)).toBe("archive /api/archive/content/attachments/7");
      expect(await get(`${prefix}/api/settings`)).toBe("api /api/settings");
      expect(await get(`${prefix}/api/me/photo?v=2`)).toBe("api /api/me/photo?v=2");
    }
  });

  it("gives the page every other path under the base, opened at the root or under it", async () => {
    expect(await get("/")).toBe("page /friend-map/");
    expect(await get("/friend-map")).toBe("page /friend-map/");
    expect(await get("/friend-map/")).toBe("page /friend-map/");
    expect(await get("/spider?colour=3dff9a")).toBe("page /friend-map/spider?colour=3dff9a");
    expect(await get("/friend-map/spider?colour=3dff9a")).toBe("page /friend-map/spider?colour=3dff9a");
    expect(await get("/friend-map/@vite/client")).toBe("page /friend-map/@vite/client");
    expect(await get("/@vite/client")).toBe("page /friend-map/@vite/client");
    expect(await get("/demo/city")).toBe("page /friend-map/demo/city");
  });

  it("puts a websocket upgrade under the base before the hot reload hears it", async () => {
    await upgrade("/?token=abc");
    await upgrade("/friend-map/?token=abc");
    expect(upgrades).toEqual(["/friend-map/?token=abc", "/friend-map/?token=abc"]);
  });
});
