// How friend-map reads the archive's facts: over HTTP from the archive's server (the backend, such as the life
// archive's npm start, at FRIEND_MAP_ARCHIVE_URL; dataHome.ts), which is the only process that opens the archive.
// friend-map's own scoring (methodology.ts) and the demo's shape (demo-shape.ts) read it through this; the page's other
// requests reach the archive through the proxy (archiveProxy.ts).
//
// A backend without the score report (no `score-report` capability) is scored from the map's report instead: the same
// facts, for the people on the map (scoreReportOf). A backend without the handshake (GET /contract answers 404) is
// one from before it (preContract, src/contract/handshake.ts).
//
// The score report and the Table's rows carry an ETag, so a copy is kept and asked for again with If-None-Match: the
// archive answers 304, with nothing to send or read, until it changes. Every request names the archive's folder
// friend-map was given (ARCHIVE_FOLDER_HEADER), and a server keeping another answers 503.

import type { Contract, MapFacts, RelationshipsReport, ScoreReport, TableRow } from "../src/archive.ts";
import { preContract } from "../src/contract/handshake.ts";
import { relationshipsReport } from "../src/contract/schema.ts";
import { ARCHIVE_FOLDER_HEADER } from "./dataHome.ts";
import { NotFoundError } from "./errors.ts";

/** How friend-map reads the archive's facts. */
export interface ArchiveClient {
  /** The backend's handshake (GET /api/archive/contract); preContract() for a backend from before it. */
  contract(): Promise<Contract>;
  /** What closeness and activity are worked out from (the archive's GET /api/archive/score-report, else scoreReportOf its map's report). */
  scoreReport(): Promise<ScoreReport>;
  /** The Table's rows, without closeness (GET /api/archive/table-rows). */
  tableRows(): Promise<TableRow[]>;
  /** Whether there is a person `id` (GET /api/archive/people/:id answers). */
  hasPerson(id: number): Promise<boolean>;
  /** What the static demo's shape is worked out from (GET /api/archive/map-facts). */
  mapFacts(): Promise<MapFacts>;
}

/** What an ArchiveClient throws when the archive cannot answer; friend-map's routes then answer 503. */
export class ArchiveUnavailableError extends Error {}

/** What the archive says when it cannot answer, which the proxy says too when nothing answers (archiveProxy.ts). */
export const UNAVAILABLE = "the archive is not available: ";

/**
 * An ArchiveClient over the archive's server at `base` (archiveUrl() in dataHome.ts), which must keep the archive at
 * `folder` (dataHome().archive) when it is given.
 */
export function httpArchiveClient(base: string, { folder }: { folder?: string } = {}): ArchiveClient {
  const kept = new Map<string, { etag: string; body: unknown }>();
  const named: Record<string, string> = folder === undefined ? {} : { [ARCHIVE_FOLDER_HEADER]: encodeURIComponent(folder) };

  async function ask(path: string, headers: Record<string, string> = {}): Promise<Response> {
    try {
      return await fetch(new URL(path, base), { headers: { ...named, ...headers } });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      throw new ArchiveUnavailableError(`nothing answers at ${base}${cause ? ` (${cause})` : ""}`);
    }
  }

  /** The answer of a route the backend may not have: undefined for a 404. */
  async function maybe<T>(response: Response): Promise<T | undefined> {
    if (response.status !== 404) return answer<T>(response);
    await response.body?.cancel();
    return undefined;
  }

  async function answer<T>(response: Response): Promise<T> {
    if (response.ok) return (await response.json()) as T;
    const said = await response.json().then((body: { error?: unknown }) => String(body.error), () => response.statusText);
    if (response.status === 503) throw new ArchiveUnavailableError(said.startsWith(UNAVAILABLE) ? said.slice(UNAVAILABLE.length) : said);
    throw new Error(`the archive answered ${response.status}: ${said}`);
  }

  /** A route whose answer carries an ETag: the copy kept while the archive says it is current; undefined for a 404. */
  async function versioned<T>(path: string): Promise<T | undefined> {
    const held = kept.get(path);
    const response = await ask(path, held ? { "if-none-match": held.etag } : {});
    if (response.status === 304 && held) return held.body as T;
    const body = await maybe<T>(response);
    if (body === undefined) {
      kept.delete(path);
      return undefined;
    }
    const etag = response.headers.get("etag");
    if (etag) kept.set(path, { etag, body });
    else kept.delete(path);
    return body;
  }

  return {
    contract: async () => (await maybe<Contract>(await ask("/api/archive/contract"))) ?? preContract(),
    scoreReport: async () =>
      (await versioned<ScoreReport>("/api/archive/score-report")) ??
      scoreReportOf(relationshipsReport.fill(await answer<RelationshipsReport>(await ask("/api/archive/relationships")))),
    async tableRows() {
      const rows = await versioned<TableRow[]>("/api/archive/table-rows");
      if (rows === undefined) throw new NotFoundError("the archive has no Table (it does not serve the `table` capability)");
      return rows;
    },
    async hasPerson(id) {
      const response = await ask(`/api/archive/people/${id}`);
      if (response.status === 404) {
        await response.body?.cancel();
        return false;
      }
      await answer(response);
      return true;
    },
    mapFacts: async () => answer<MapFacts>(await ask("/api/archive/map-facts")),
  };
}

/** The score report a backend without one gives: its map's report, the people on it, and their group chats, hangouts and calls. */
export function scoreReportOf(report: RelationshipsReport): ScoreReport {
  return {
    generatedAt: report.generatedAt,
    people: report.people.map(({ id, months }) => ({ id, months })),
    groups: report.groups,
    catchUps: report.catchUps,
    callDays: report.callDays,
  };
}
