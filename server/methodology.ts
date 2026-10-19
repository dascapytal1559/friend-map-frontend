// friend-map's own scoring over the archive's facts: the Table's closeness and the person panel's activity chart. The
// archive gives the facts (its score report and the Table's rows, the life archive's server/archive/http.ts) and friend-map works out
// the scores itself (src/demos/closeness.ts and src/activity.ts, as the map views do in the page), so the archive
// keeps no copy of the scoring. It answers three routes under /api/archive and hands every other to the archive:
//
//   GET  /api/archive/contract                   -> Contract: the backend's handshake, with friend-map's own `scores`
//        added to its capabilities (a backend from before the handshake, preContract); friend-map counts days in the
//        time zone it names from then on, as the page does
//
//   GET  /api/archive/table?closenessHalfLifeDays=&catchUpHourWorth=&callMinimumMinutes=&messageReciprocity=&groupSharedPart=&tripFullHours=
//                                                -> PeopleTable: everyone, archived people too, one light row each
//        for the Table view (the archive's /table-rows), with closeness scored with those settings (the default for
//        any left out)
//   GET  /api/archive/people/:id/activity?<settings> -> PersonActivity: their messages, calls and hangouts each month,
//        all time, and what each counted for in closeness points with the closeness settings named (as /table takes
//        them), for the chart in their panel; 404 for no such person
//
// A setting that is not one, or out of its range, is a 400; when the archive cannot answer, both answer 503 as the
// archive's own routes do. The facts come from the archive's server over HTTP (archiveClient.ts), and every other
// request goes to it through the proxy (archiveProxy.ts).

import type { ServerResponse } from "node:http";
import { personActivity } from "../src/activity.ts";
import type { Contract, PeopleTable, PersonActivity, ScoreReport, TableRow } from "../src/archive.ts";
import { OWN_CAPABILITY, refusal, takeContract } from "../src/contract/handshake.ts";
import { closenessNow } from "../src/demos/closeness.ts";
import { closenessSettings, DEFAULT_SETTINGS, settingAllowed, settingRule, type ClosenessSettings } from "../src/settings.ts";
import { ArchiveUnavailableError, UNAVAILABLE, type ArchiveClient } from "./archiveClient.ts";
import { sendJson, type ApiHandler } from "./jsonApi.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";

/** The Table: each row with its closeness score as of `now`, worked out from `report` with `settings`; 0 for nothing between you. */
export function scoredTable(report: ScoreReport, rows: TableRow[], settings: ClosenessSettings, now: number): PeopleTable {
  const closeness = closenessNow({ ...report, generatedAt: now }, settings);
  return { generatedAt: now, settings, people: rows.map((row) => ({ ...row, closeness: closeness.get(row.id) ?? 0 })) };
}

/** Person `id`'s activity as of `now` (personActivity), from `report` with `settings`. */
export function scoredActivity(report: ScoreReport, id: number, settings: ClosenessSettings, now: number): PersonActivity {
  return personActivity({ ...report, generatedAt: now }, id, settings);
}

/** `contract` with friend-map's own capability added: it scores the Table and the Events chart itself. */
export function withOwn(contract: Contract): Contract {
  return contract.capabilities.includes(OWN_CAPABILITY) ? contract : { ...contract, capabilities: [...contract.capabilities, OWN_CAPABILITY] };
}

/** Answers /contract, /table and /people/:id/activity from `client`, and hands every other /api/archive request to `archive`. */
export function createMethodologyHandler(client: ArchiveClient, archive: ApiHandler, { now = Date.now }: { now?: () => number } = {}): ApiHandler {
  let taken = false;
  /** The backend's handshake, taken (its time zone the one days are counted in) when the page could use it. */
  async function handshake(): Promise<Contract> {
    const contract = await client.contract();
    if (refusal(contract) === null) {
      takeContract(contract);
      taken = true;
    }
    return contract;
  }
  /** Scores are counted in the backend's time zone: its handshake is asked for once, before the first. */
  const known = async () => {
    if (!taken) await handshake();
  };
  return async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname.slice("/api/archive".length);
    const method = req.method ?? "GET";
    let match: RegExpExecArray | null;
    try {
      if (path === "/contract" && method === "GET") return sendJson(res, 200, withOwn(await handshake()));
      if (path === "/table" && method === "GET") {
        await known();
        const settings = settingsParams(url);
        const [report, rows] = await Promise.all([client.scoreReport(), client.tableRows()]);
        return sendJson(res, 200, scoredTable(report, rows, settings, now()));
      }
      if ((match = /^\/people\/(\d+)\/activity$/.exec(path)) && method === "GET") {
        const settings = settingsParams(url);
        await known();
        const id = Number(match[1]);
        if (!(await client.hasPerson(id))) throw new NotFoundError(`no person ${id}`);
        return sendJson(res, 200, scoredActivity(await client.scoreReport(), id, settings, now()));
      }
    } catch (error) {
      return answerError(res, error);
    }
    return archive(req, res);
  };
}

function answerError(res: ServerResponse, error: unknown): void {
  if (error instanceof ArchiveUnavailableError) return sendJson(res, 503, { error: `${UNAVAILABLE}${error.message}` });
  if (error instanceof NotFoundError) return sendJson(res, 404, { error: error.message });
  if (error instanceof InvalidInputError) return sendJson(res, 400, { error: error.message });
  console.error(error);
  sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
}

/** The closeness settings a request names in its query (the default for any left out); 400 for anything else. */
function settingsParams(url: URL): ClosenessSettings {
  const settings = closenessSettings(DEFAULT_SETTINGS);
  for (const [key, value] of url.searchParams) {
    if (!(key in settings)) throw new InvalidInputError(`${key} is not a closeness setting; they are ${Object.keys(settings).join(", ")}`);
    const name = key as keyof typeof settings;
    // As the page writes a number (String(n)): digits, maybe a point and an exponent.
    const number = /^[\d.e+-]+$/i.test(value) ? Number(value) : NaN;
    if (!settingAllowed(name, number)) throw new InvalidInputError(`${key} must be ${settingRule(name)}`);
    settings[name] = number;
  }
  return settings;
}
