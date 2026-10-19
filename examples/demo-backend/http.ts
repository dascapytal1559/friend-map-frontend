// What every route of the demo backend is: a request under /api/archive (ROUTES in src/archive.ts writes each one),
// the capability it belongs to, and how it answers from the database.

import type { Capability } from "../../src/archive.ts";
import type { Db } from "./db.ts";

/** What a route is asked: the parts of its path (":id" as params.id), its query, and the JSON it was sent. */
export interface Asked {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export interface Route {
  capability: Capability;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** As ROUTES writes it, under /api/archive: "/people/:id". */
  path: string;
  /** The answer, sent as JSON; a Refusal for an error. */
  answer(db: Db, asked: Asked): unknown;
}

/** An answer that is an error: its status, and `{ error }` in a sentence, which the page shows as it is. */
export class Refusal extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;

  constructor(status: Refusal["status"], message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what: string) => new Refusal(404, `no ${what}`);

/** `value`, or a 404 for what is not there. */
export function found<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw notFound(what);
  return value;
}

export const badRequest = (why: string) => new Refusal(400, why);

/** The number in a path's part (":id"). */
export const idOf = (asked: Asked, part = "id") => Number(asked.params[part]);
