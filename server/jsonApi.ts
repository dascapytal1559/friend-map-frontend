// The pieces a JSON API here is made of: the handler type, reading a request's
// body, sending JSON, and refusing what another site's page sent. friend-map's
// own API (api.ts, methodology.ts) and the archive's (archive/http.ts) both use
// them; the archive keeps its own copy of this file once it moves to its own
// project.

import type { IncomingMessage, ServerResponse } from "node:http";
import { ForbiddenError, InvalidInputError } from "./errors.ts";

const MAX_BODY_BYTES = 10 * 1024 * 1024;

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

/**
 * Refuses a request another site's page sent: one whose browser says it came from elsewhere (Sec-Fetch-Site),
 * or whose Origin is not this server.
 */
export function fromOwnPage(req: IncomingMessage): void {
  const site = req.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin" && site !== "none") throw new ForbiddenError("this is only for friend-map's own page");
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      // An unreadable Origin is refused below.
    }
    if (host !== req.headers.host) throw new ForbiddenError("this is only for friend-map's own page");
  }
}

/** The request's body, refused once it passes `max` bytes. */
export async function readBytes(req: IncomingMessage, max: number, what: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new InvalidInputError(`${what} is over ${max / 1024 / 1024} MB`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const body = await readBytes(req, MAX_BODY_BYTES, "the request body");
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new InvalidInputError("request body is not valid JSON");
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
