// The least a backend can be (docs/contract.md, "Build your own backend"): the four routes of the `map` capability,
// with only the fields the contract requires, over a dozen made-up people (server/fixtures/madeUpNames.ts). Every
// other route answers 404, as the contract says a route a backend does not serve must. The tests run friend-map's
// server and its views on it (fourRoutes.test.ts). The demo backend (examples/demo-backend/) is these four routes
// grown into a whole backend a clone can start beside friend-map.
//
//   GET /api/archive/contract       -> { version, capabilities: ["map"], timeZone }
//   GET /api/archive/relationships  -> { people: [{ id, name, months }], groups: [{ id, memberIds }], catchUps }
//   GET /api/archive/people         -> { people: [{ id, name }] }
//   GET /api/archive/people/:id     -> { id, name }, or 404

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Contract } from "../../src/archive.ts";

/** Someone in the stand-in's crowd: who, and how many messages each way, month by month. */
interface Friend {
  id: number;
  name: string;
  /** Messages per month, oldest first: [month, yours, theirs]. */
  months: Array<[string, number, number]>;
}

const NAMES = [
  "Ada Sample", "Bruno Placeholder", "Cleo Example", "Dev Testington", "Esme Fictional", "Felix Demo",
  "Gia Madeup", "Hugo Notreal", "Iris Standin", "Jonah Dummy", "Kira Mockley", "Leo Pretendo",
];

/** The crowd, as of `now`: the closest wrote most, and most lately; each one fewer, and less often. */
export function standInCrowd(now: number): Friend[] {
  const monthBack = (n: number) => new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - n, 1)).toISOString().slice(0, 7);
  return NAMES.map((name, i) => ({
    id: 101 + i,
    name,
    months: Array.from({ length: 6 }, (_, back) => [monthBack(5 - back), Math.max(1, 40 - i * 3 - back), Math.max(1, 44 - i * 3 - back * 2)] as [string, number, number])
      .filter((_, back) => back % (1 + (i % 3)) === 0),
  }));
}

export const STAND_IN_CONTRACT: Contract = { version: "1.0.0", capabilities: ["map"], timeZone: "Europe/Berlin" };

/** The four routes over `crowd`, as one request handler. */
export function fourRouteBackend(crowd: readonly Friend[], { now = Date.now }: { now?: () => number } = {}) {
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  return (req: IncomingMessage, res: ServerResponse) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const person = /^\/api\/archive\/people\/(\d+)$/.exec(path);
    if (req.method !== "GET") return send(res, 404, { error: `no route ${req.method} ${path}` });
    if (path === "/api/archive/contract") return send(res, 200, STAND_IN_CONTRACT);
    if (path === "/api/archive/people") return send(res, 200, { people: crowd.map(({ id, name }) => ({ id, name })) });
    if (person) {
      const found = crowd.find((f) => f.id === Number(person[1]));
      return found ? send(res, 200, { id: found.id, name: found.name }) : send(res, 404, { error: `no person ${person[1]}` });
    }
    if (path === "/api/archive/relationships") {
      return send(res, 200, {
        generatedAt: now(),
        people: crowd.map(({ id, name, months }) => ({
          id,
          name,
          months: months.map(([month, yours, theirs]) => ({ month, directFromMe: yours, directFromThem: theirs, groupFromMe: 0, groupFromThem: 0 })),
        })),
        // The first four in a group chat, and a hangout with the first two.
        groups: [{ id: 1, memberIds: crowd.slice(0, 4).map((f) => f.id) }],
        catchUps: [{ id: 1, day: crowd[0].months.at(-1)![0] + "-02", hours: 3, personIds: crowd.slice(0, 2).map((f) => f.id) }],
      });
    }
    send(res, 404, { error: `no route GET ${path}` });
  };
}

/** The stand-in as an HTTP server, not yet listening. */
export function fourRouteServer(crowd: readonly Friend[], options?: { now?: () => number }): Server {
  return createServer(fourRouteBackend(crowd, options));
}
