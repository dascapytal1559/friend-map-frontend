// The proxy to the archive's server, against a stand-in archive: requests and answers passed both ways as they came,
// streaming (a body, a byte range, the change stream), the page's headers passed on for the archive's own checks,
// and 503 when nothing answers.

import { once } from "node:events";
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { archiveProxy } from "./archiveProxy.ts";
import { ARCHIVE_FOLDER_HEADER } from "./dataHome.ts";

const FILE = Buffer.from("0123456789abcdefghij");

let archive: Server;
let front: Server;
let downFront: Server;
let namedFront: Server;
let archiveUrl: string;
let frontUrl: string;
let downUrl: string;
let namedUrl: string;
/** What the stand-in archive was asked, last first. */
let asked: Array<{ method: string; url: string; headers: IncomingHttpHeaders; body: string }>;
/** Each change stream's request, to see it closed. */
let streams: IncomingMessage[];

const listen = async (server: Server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeAll(async () => {
  asked = [];
  streams = [];
  archive = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    asked.unshift({ method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() });
    if (req.url === "/api/archive/events") {
      streams.push(req);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      res.write(": watching people\n\n");
      setTimeout(() => res.write("event: people\ndata: 7\n\n"), 50);
      return;
    }
    if (req.url === "/api/archive/content/attachments/1") {
      const [, from, to] = /bytes=(\d+)-(\d+)/.exec(req.headers.range ?? "") ?? [];
      if (from === undefined) return void res.writeHead(200, { "content-type": "video/mp4", "content-length": FILE.length }).end(FILE);
      const part = FILE.subarray(Number(from), Number(to) + 1);
      res.writeHead(206, { "content-type": "video/mp4", "content-range": `bytes ${from}-${to}/${FILE.length}`, "content-length": part.length }).end(part);
      return;
    }
    if (req.headers["if-none-match"] === '"v1"') return void res.writeHead(304, { etag: '"v1"' }).end();
    res.writeHead(req.method === "POST" ? 201 : 200, { "content-type": "application/json; charset=utf-8", etag: '"v1"', "x-archive": "yes" });
    res.end(JSON.stringify({ method: req.method, url: req.url }));
  });
  archiveUrl = await listen(archive);
  const proxy = archiveProxy(archiveUrl);
  front = createServer((req, res) => void proxy(req, res));
  frontUrl = await listen(front);
  // A port nothing answers on: one taken and given back.
  const gone = createServer();
  const goneUrl = await listen(gone);
  await new Promise((resolve) => gone.close(resolve));
  const downProxy = archiveProxy(goneUrl);
  downFront = createServer((req, res) => void downProxy(req, res));
  downUrl = await listen(downFront);
  const namedProxy = archiveProxy(archiveUrl, { folder: "/srv/life archive ü/data" });
  namedFront = createServer((req, res) => void namedProxy(req, res));
  namedUrl = await listen(namedFront);
});

afterAll(async () => {
  archive.closeAllConnections();
  front.closeAllConnections();
  await Promise.all([archive, front, downFront, namedFront].map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("the archive's proxy", () => {
  it("passes each method, path, query and body on, and the archive's status, headers and body back", async () => {
    const got = await fetch(`${frontUrl}/api/archive/people?query=ada&tag=x`);
    expect(got.status).toBe(200);
    expect(got.headers.get("x-archive")).toBe("yes");
    expect(got.headers.get("etag")).toBe('"v1"');
    expect(await got.json()).toEqual({ method: "GET", url: "/api/archive/people?query=ada&tag=x" });

    const posted = await fetch(`${frontUrl}/api/archive/catch-ups`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ day: "2026-03-01" }) });
    expect(posted.status).toBe(201);
    expect(asked[0]).toMatchObject({ method: "POST", url: "/api/archive/catch-ups", body: '{"day":"2026-03-01"}' });
    expect(asked[0]!.headers["content-type"]).toBe("application/json");

    const put = await fetch(`${frontUrl}/api/archive/people/2/note`, { method: "PUT", body: "x".repeat(200_000) });
    expect(put.status).toBe(200);
    expect(asked[0]!.body).toHaveLength(200_000);
    expect((await fetch(`${frontUrl}/api/archive/drafts/1`, { method: "DELETE" })).status).toBe(200);
    expect(asked[0]!.method).toBe("DELETE");
  });

  it("passes the page's Host, Origin, Sec-Fetch-Site and If-None-Match on unchanged, so the archive's own checks read them", async () => {
    const headers = await new Promise<IncomingHttpHeaders>((resolve, reject) => {
      const out = request(`${frontUrl}/api/archive/changes/3/undo`, {
        method: "POST",
        headers: { host: "mac.tailnet.example", origin: "https://mac.tailnet.example", "sec-fetch-site": "same-origin", "if-none-match": '"v0"' },
      }, (res) => {
        res.resume();
        res.on("end", () => resolve(asked[0]!.headers));
      });
      out.on("error", reject);
      out.end();
    });
    expect(headers).toMatchObject({ host: "mac.tailnet.example", origin: "https://mac.tailnet.example", "sec-fetch-site": "same-origin", "if-none-match": '"v0"' });
  });

  it("names the archive's folder it was given, in place of any the page sent, and none when given none", async () => {
    await fetch(`${namedUrl}/api/archive/people`, { headers: { [ARCHIVE_FOLDER_HEADER]: "/elsewhere" } });
    expect(decodeURIComponent(String(asked[0]!.headers[ARCHIVE_FOLDER_HEADER]))).toBe("/srv/life archive ü/data");
    await fetch(`${frontUrl}/api/archive/people`);
    expect(asked[0]!.headers[ARCHIVE_FOLDER_HEADER]).toBeUndefined();
  });

  it("passes a 304 back with nothing in it", async () => {
    const got = await fetch(`${frontUrl}/api/archive/score-report`, { headers: { "if-none-match": '"v1"' } });
    expect(got.status).toBe(304);
    expect(await got.text()).toBe("");
  });

  it("passes a byte range of an attachment, so a video can seek", async () => {
    const got = await fetch(`${frontUrl}/api/archive/content/attachments/1`, { headers: { range: "bytes=5-9" } });
    expect(got.status).toBe(206);
    expect(got.headers.get("content-range")).toBe("bytes 5-9/20");
    expect(await got.text()).toBe("56789");
    expect(Buffer.from(await (await fetch(`${frontUrl}/api/archive/content/attachments/1`)).arrayBuffer())).toEqual(FILE);
  });

  it("streams the change stream as it comes, and closes it at the archive when the page goes", async () => {
    const stop = new AbortController();
    const got = await fetch(`${frontUrl}/api/archive/events`, { signal: stop.signal });
    expect(got.headers.get("content-type")).toBe("text/event-stream");
    const reader = got.body!.getReader();
    let text = "";
    while (!text.includes("event: people")) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toBe(": watching people\n\nevent: people\ndata: 7\n\n");
    const stream = streams.at(-1)!;
    const closed = once(stream.socket, "close");
    stop.abort();
    await closed;
  });

  it("answers 503 as the archive does when nothing answers, and the page says the archive is unavailable", async () => {
    const got = await fetch(`${downUrl}/api/archive/people`);
    expect(got.status).toBe(503);
    expect(got.headers.get("content-type")).toMatch(/^application\/json/);
    expect(((await got.json()) as { error: string }).error).toMatch(/^the archive is not available: nothing answers at http:\/\/127\.0\.0\.1:\d+ \(ECONNREFUSED\)$/);
  });
});
