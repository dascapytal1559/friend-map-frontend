// Checks a backend against the data contract (src/archive.ts, docs/contract.md): asks it every read route of every
// capability its handshake declares, and says, route by route, what does not fit (src/contract/check.ts).
//
//   npm run contract-check                     the backend friend-map is set to (FRIEND_MAP_ARCHIVE_URL; dataHome.ts)
//   npm run contract-check -- <url>            the backend at <url> (http://127.0.0.1:5000), or friend-map's own
//                                              server, which adds its scores (http://localhost:4600)
//   npm run contract-check -- --demo           the demo's in-page backend, the made-up crowd held in the page
//
// It only reads, and says only which routes and fields are wrong and how, never what an answer holds. Exits 0 when
// every route fits, 1 when something does not, and 2 when nothing answers.

import "./onPinnedNode.ts";
import { fileURLToPath } from "node:url";
import { checkBackend, reportLines } from "../src/contract/check.ts";
import type { Answer, Backend } from "../src/contract/routes.ts";
import { servedBy } from "../src/contract/routes.ts";
import { DemoArchive } from "../src/demo/archive.ts";
import { generateDemo, SMALL_CROWD } from "../src/demo/generate.ts";
import { DEMO_TIME_ZONE } from "../src/demo/timeZone.ts";
import { setTimeZone } from "../src/time.ts";
import { archiveUrl } from "./dataHome.ts";

/** A backend over HTTP at `base`: its routes under /api/archive, each asked once; an event stream's or a file's headers alone. */
export function httpBackend(base: string): Backend {
  return async (method, path): Promise<Answer> => {
    const stop = new AbortController();
    const response = await fetch(new URL(`/api/archive${path}`, base), { method, signal: stop.signal });
    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("application/json")) {
      stop.abort();
      return { status: response.status, body: null, contentType };
    }
    return { status: response.status, body: await response.json().catch(() => null), contentType };
  };
}

/** The demo's in-page backend, as of `now`: the made-up crowd at the tests' size, in its own time zone. */
export function demoBackend(now = Date.now()): Backend {
  setTimeZone(DEMO_TIME_ZONE);
  return servedBy(new DemoArchive(generateDemo(now, SMALL_CROWD)).api);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  const where = arg === "--demo" ? "the demo's in-page backend" : (arg ?? archiveUrl());
  try {
    const report = await checkBackend(arg === "--demo" ? demoBackend() : httpBackend(where));
    for (const line of reportLines(report, { where })) console.log(line);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code;
    console.log(`contract-check: nothing answers at ${where}${cause ? ` (${cause})` : ""}: ${(error as Error).message}`);
    process.exitCode = 2;
  }
}
