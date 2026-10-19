// A backend as contract-check asks it: a route of the contract under /api/archive (its path and query), and the answer
// (its status, its JSON, its content type). Over HTTP that is a fetch (httpBackend, server/contract-check.ts); for a
// backend held in the page (an ArchiveApi, such as the demo's made-up crowd, src/demo/archive.ts) it is servedBy, which
// answers each read route as an HTTP backend would. servedBy is also the seam a runnable backend can be made from: an
// HTTP server that hands each request to it serves that ArchiveApi as a backend.

import { CONTRACT_VERSION } from "../archive.ts";
import { ArchiveError, ArchiveUnavailable, type ArchiveApi } from "../archiveApi.ts";
import { closenessSettings, DEFAULT_SETTINGS, settingAllowed, type ClosenessSettings } from "../settings.ts";
import { isDay, isMonth } from "../time.ts";

export interface Answer {
  status: number;
  /** The answer's JSON; null for none, or for an answer that is not JSON (a file, the event stream). */
  body: unknown;
  /** Its content type ("application/json", "text/event-stream", "image/jpeg"); null when it says none. */
  contentType: string | null;
}

/** A backend: what it answers `method` on `path` (with its query, as under /api/archive: "/people/3?x=1"). */
export type Backend = (method: string, path: string) => Promise<Answer>;

const json = (status: number, body: unknown): Answer => ({ status, body, contentType: "application/json" });

/** One read route, matched by its path, answered by the ArchiveApi. */
interface Read {
  path: RegExp;
  answer(api: ArchiveApi, parts: string[], query: URLSearchParams): Promise<unknown>;
}

const n = Number;
/** A query's number, or undefined without one. */
const num = (query: URLSearchParams, key: string) => (query.get(key) === null ? undefined : Number(query.get(key)));
const flag = (query: URLSearchParams, key: string) => query.get(key) === "1" || query.get(key) === "true";

/** The closeness settings a scores route names in its query, the default for each left out. */
function settingsOf(query: URLSearchParams): ClosenessSettings {
  const settings = closenessSettings(DEFAULT_SETTINGS);
  for (const key of Object.keys(settings) as Array<keyof ClosenessSettings>) {
    const value = num(query, key);
    if (value === undefined) continue;
    if (!settingAllowed(key, value)) throw new ArchiveError(`GET failed (400): ${key} is out of range`, `${key} is out of range`);
    settings[key] = value;
  }
  return settings;
}

const READS: Read[] = [
  { path: /^\/contract$/, answer: (api) => api.contract() },
  { path: /^\/relationships$/, answer: (api, _, q) => api.relationships(q.get("q") ?? "", q.get("reveal") !== null) },
  { path: /^\/people$/, answer: (api, _, q) => api.people({ query: q.get("query") ?? undefined, tag: q.get("tag") ?? undefined }) },
  { path: /^\/people\/(\d+)$/, answer: (api, [id]) => api.person(n(id)) },
  { path: /^\/query$/, answer: (api, _, q) => api.query(q.get("q") ?? "", q.getAll("hide")) },
  { path: /^\/people\/(\d+)\/groups$/, answer: (api, [id]) => api.groups(n(id)) },
  { path: /^\/groups\/(\d+)$/, answer: (api, [id]) => api.group(n(id)) },
  { path: /^\/people\/(\d+)\/calls$/, answer: (api, [id], q) => api.calls(n(id), num(q, "account")) },
  { path: /^\/catch-ups$/, answer: (api, _, q) => api.catchUps(num(q, "person")) },
  { path: /^\/calls\/(\d+)$/, answer: (api, [id]) => api.loggedCall(n(id)) },
  {
    path: /^\/content\/people\/(\d+)\/timeline$/,
    answer: (api, [id], q) => api.timeline(n(id), {
      before: q.get("before") ?? undefined, after: q.get("after") ?? undefined, limit: num(q, "limit"), count: flag(q, "count"),
      groups: flag(q, "groups"), marketplace: flag(q, "marketplace"), account: num(q, "account"),
    }),
  },
  {
    path: /^\/content\/conversations\/(\d+)\/messages$/,
    answer: (api, [id], q) => api.conversation(n(id), { before: q.get("before") ?? undefined, after: q.get("after") ?? undefined, limit: num(q, "limit"), count: flag(q, "count") }),
  },
  { path: /^\/calls$/, answer: (api) => api.listCalls() },
  { path: /^\/locations$/, answer: (api) => api.locations() },
  { path: /^\/tags$/, answer: (api) => api.tags() },
  {
    path: /^\/calendar\/([^/]+)$/,
    answer: (api, [at]) => {
      const when = decodeURIComponent(at);
      if (isMonth(when)) return api.calendarMonth(when);
      if (isDay(when)) return api.calendarDay(when);
      return Promise.reject(new ArchiveError("GET /calendar failed (400): not a month or a day", "not a month (YYYY-MM) or a day (YYYY-MM-DD)"));
    },
  },
  {
    path: /^\/content\/conversations\/(\d+)\/days\/([^/]+)$/,
    answer: (api, [id, day], q) => api.dayMessages(n(id), decodeURIComponent(day), { after: q.get("after") ?? undefined, limit: num(q, "limit") }),
  },
  { path: /^\/message-apps$/, answer: (api) => api.messageApps() },
  { path: /^\/merge-proposals$/, answer: (api) => api.proposals() },
  { path: /^\/changes$/, answer: (api, _, q) => api.changes(num(q, "limit")) },
  { path: /^\/changes\/(\d+)$/, answer: (api, [id]) => api.changeset(n(id)) },
  { path: /^\/people\/(\d+)\/drafts$/, answer: (api, [id]) => api.drafts(n(id)) },
  { path: /^\/people\/(\d+)\/send-targets$/, answer: (api, [id]) => api.sendTargets(n(id)) },
  { path: /^\/table$/, answer: (api, _, q) => api.table(settingsOf(q)) },
  { path: /^\/people\/(\d+)\/activity$/, answer: (api, [id], q) => api.activity(n(id), settingsOf(q)) },
];

/** An error's HTTP status: the one its message names ("... failed (409): ..."), else 400; 404 for what is not there. */
function statusOf(error: ArchiveError): number {
  if (error instanceof ArchiveUnavailable) return 404;
  const named = /\((\d{3})\)/.exec(error.message);
  return named ? Number(named[1]) : 400;
}

/**
 * `api` as an HTTP backend answers its read routes: each one's answer as JSON, an ArchiveError as its status with
 * { error }; a route it has no read for (the score report, the Table's rows, the event stream and attachment files,
 * which a page's ArchiveApi does not hand out) 404, as a backend without it answers. Writes it does not serve (405).
 */
export function servedBy(api: ArchiveApi): Backend {
  return async (method, path) => {
    const url = new URL(path, "http://backend");
    const read = method === "GET" ? READS.find((r) => r.path.test(url.pathname)) : undefined;
    if (!read) return method === "GET" ? json(404, { error: `no route GET ${url.pathname}` }) : json(405, { error: `this backend serves contract ${CONTRACT_VERSION}'s reads only` });
    try {
      return json(200, await read.answer(api, read.path.exec(url.pathname)!.slice(1), url.searchParams));
    } catch (error) {
      if (error instanceof ArchiveError) return json(statusOf(error), { error: error.reason });
      throw error;
    }
  };
}
