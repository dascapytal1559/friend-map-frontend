// The demo backend over HTTP: every route of every capability it serves, under /api/archive, in JSON (docs/contract.md,
// "Transport"). Its handshake names the capabilities its routes are for, so a route added here is a capability offered.
//
// - A route it does not serve answers 404, which the page reads as "not here".
// - Errors are { error } in a sentence, with the status the contract gives them (a Refusal in http.ts).
// - A write is refused (403) unless it came from friend-map's own page: its Origin is the Host it was sent to, and the
//   browser does not say another site sent it. friend-map's server passes both on as the browser sent them.
// - Each read carries an ETag that changes with every write, so friend-map's server can keep a copy (If-None-Match).
// - GET /events is the live-reload stream (`events`): after every write it sends `people`, and the page draws again.
// - friend-map names its archive folder in x-archive-folder; this backend keeps no other, so it passes it over.

import type { IncomingMessage, ServerResponse } from "node:http";
import { CONTRACT_VERSION, type Capability, type Contract } from "../../src/archive.ts";
import { CALENDAR } from "./calendar.ts";
import { CONTENT } from "./content.ts";
import type { Db } from "./db.ts";
import { EDIT_PEOPLE } from "./edit.ts";
import { Refusal, type Route } from "./http.ts";
import { MAP } from "./map.ts";
import { PANEL } from "./panel.ts";
import { RIVER } from "./river.ts";
import { TABLE } from "./table.ts";

/** Every route this backend serves, by capability (GET /contract and GET /events are answered below). */
export const ROUTES: readonly Route[] = [...MAP, ...PANEL, ...CONTENT, ...TABLE, ...CALENDAR, ...RIVER, ...EDIT_PEOPLE];

/** What each part of a path may be: ids are numbers, months and days are dates; anything else, one part. */
const PARTS: Record<string, string> = { ":id": "(\\d+)", ":month": "(\\d{4}-\\d{2})", ":day": "(\\d{4}-\\d{2}-\\d{2})" };

const matcher = (path: string) => {
  const names = path.match(/:\w+/g) ?? [];
  const pattern = path.replace(/:\w+/g, (part) => PARTS[part] ?? "([^/]+)");
  return { names: names.map((n) => n.slice(1)), regex: new RegExp(`^${pattern}$`) };
};
const MATCHERS = ROUTES.map((route) => ({ route, ...matcher(route.path) }));

const MOST_BYTES = 1024 * 1024;

/** The handshake: the contract this backend serves, what of it, and the time zone its days are in. */
export function contractOf(db: Db): Contract {
  const capabilities = new Set<Capability>([...ROUTES.map((route) => route.capability), "events"]);
  return { version: CONTRACT_VERSION, capabilities: [...capabilities], timeZone: db.meta("time-zone")! };
}

/** The backend's request handler, over the database `db`. */
export function demoBackend(db: Db): (req: IncomingMessage, res: ServerResponse) => void {
  const started = Date.now();
  const listeners = new Set<ServerResponse>();

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
    res.end(JSON.stringify(body));
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://backend");
    if (!url.pathname.startsWith("/api/archive/")) return send(res, 404, { error: "this backend answers under /api/archive" });
    const path = url.pathname.slice("/api/archive".length);
    const method = req.method ?? "GET";

    if (method === "GET" && path === "/contract") return send(res, 200, contractOf(db));
    if (method === "GET" && path === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(": the demo backend's changes\n\n");
      listeners.add(res);
      res.on("close", () => listeners.delete(res));
      return;
    }

    const found = MATCHERS.find((m) => m.route.method === method && m.regex.test(path));
    if (!found) return send(res, 404, { error: `no route ${method} ${path}` });
    const params = Object.fromEntries(found.regex.exec(path)!.slice(1).map((value, i) => [found.names[i], decodeURIComponent(value)]));

    if (method === "GET") {
      const etag = `"${started}.${db.version}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, { etag });
        return void res.end();
      }
      return send(res, 200, found.route.answer(db, { params, query: url.searchParams, body: null }), { etag });
    }

    fromOwnPage(req);
    const body = await readJson(req);
    const answer = found.route.answer(db, { params, query: url.searchParams, body });
    send(res, 200, answer);
    for (const listener of listeners) listener.write("event: people\ndata: {}\n\n");
  }

  return (req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (res.headersSent) return void res.destroy();
      if (error instanceof Refusal) return send(res, error.status, { error: error.message });
      console.error(error);
      send(res, 500, { error: `the demo backend failed: ${(error as Error).message}` });
    });
  };
}

/** Refuses a write another site's page sent (docs/contract.md, "Transport"). */
function fromOwnPage(req: IncomingMessage): void {
  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") throw new Refusal(403, "this is only for friend-map's own page");
  const origin = req.headers.origin;
  if (origin === undefined) return;
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {
    // An Origin that is no address is refused below.
  }
  if (host !== req.headers.host) throw new Refusal(403, "this is only for friend-map's own page");
}

/** The request's JSON body (null for none); a 400 for one that is not JSON or is too big. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MOST_BYTES) throw new Refusal(400, "the request is over 1 MB");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Refusal(400, "the request is not JSON");
  }
}
