// Starts the demo backend: a backend for friend-map of made-up people, to run beside it (docs/running.md,
// "Run friend-map with the demo backend").
//
//   npm run demo-backend                  http://127.0.0.1:4700, its database made on first start
//   npm run demo-backend -- --fresh       the crowd made again, as of today, and every change you made gone
//
// Its database is demo-backend.sqlite beside this file (DEMO_BACKEND_FILE names another), and its port 4700 (PORT
// another). Then start friend-map in front of it: FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4700 npm start.

import "../../server/onPinnedNode.ts";
import { existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Db } from "./db.ts";
import { seed } from "./seed.ts";
import { demoBackend } from "./server.ts";

const FILE = process.env.DEMO_BACKEND_FILE ?? fileURLToPath(new URL("demo-backend.sqlite", import.meta.url));
const PORT = Number(process.env.PORT ?? 4700);
const HOST = "127.0.0.1";

const remove = () => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(FILE + suffix, { force: true });
};
if (process.argv.includes("--fresh")) remove();
const isNew = !existsSync(FILE);
const db = new Db(FILE);
if (isNew) {
  console.log("Making the demo's made-up crowd...");
  try {
    seed(db);
  } catch (error) {
    db.close();
    remove();
    throw error;
  }
}

createServer(demoBackend(db)).listen(PORT, HOST, () => {
  const { n } = db.one<{ n: number }>("SELECT COUNT(*) AS n FROM people WHERE is_you = 0")!;
  console.log(`The demo backend: ${n} made-up people, at http://${HOST}:${PORT}/api/archive, kept in ${FILE}`);
  console.log(`Start friend-map in front of it: FRIEND_MAP_ARCHIVE_URL=http://${HOST}:${PORT} npm start`);
});
