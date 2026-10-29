// Starts friend-map on one port: its data API under /api, the message archive under /api/archive, and Vite serving
// the page (with hot reload over the same port), each at the root and again under /friend-map (server/basePath.ts).
//
//   npm start  ->  http://localhost:4600 (and http://localhost:4600/friend-map)
//
// The archive is another process, the backend (the archive's server, at FRIEND_MAP_ARCHIVE_URL; dataHome.ts), the
// only one that opens it: friend-map answers the Table and the activity chart itself from the archive's facts
// (methodology.ts, archiveClient.ts) and passes every other /api/archive request to it (archiveProxy.ts); while it is
// down those answer 503 and the rest of the page works. friend-map's own folder (settings, view usage, your
// photo) is FRIEND_MAP_DATA, from the environment or .env.local, else data/, and the archive's FRIEND_MAP_ARCHIVE_FOLDER
// (dataHome.ts), which the backend must keep when it keeps one: one keeping another answers 503, so
// FRIEND_MAP_DATA=<testing folder> alone never reaches the real archive.

import "./onPinnedNode.ts";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { guardHosts } from "./allowedHosts.ts";
import { createApiHandler } from "./api.ts";
import { httpArchiveClient } from "./archiveClient.ts";
import { archiveProxy } from "./archiveProxy.ts";
import { BASE_PATH, serveAtBase } from "./basePath.ts";
import { archiveUrl, dataHome } from "./dataHome.ts";
import { createMethodologyHandler } from "./methodology.ts";
import { redirectOldDemo } from "./oldDemo.ts";
import { savedSettingsPlugin } from "./savedSettingsPlugin.ts";

const PORT = Number(process.env.PORT ?? 4600);
const HOST = "127.0.0.1";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { data: DATA_DIR, archive: ARCHIVE_DIR } = dataHome();
const ARCHIVE_URL = archiveUrl();

await mkdir(DATA_DIR, { recursive: true });
const api = createApiHandler(DATA_DIR);
// The archive's server must keep the archive's folder this one was given, so friend-map on a testing folder never meets the real archive.
const archiveApi = createMethodologyHandler(httpArchiveClient(ARCHIVE_URL, { folder: ARCHIVE_DIR }), archiveProxy(ARCHIVE_URL, { folder: ARCHIVE_DIR }));
const server = createServer();
const vite = await createViteServer({
  root: ROOT,
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  server: { middlewareMode: true, ws: { server } },
  // Every page is served your saved view settings, read afresh; added here rather than in vite.config.ts, whose
  // imports Vite watches, so editing the app (src/savedSettings.ts) never restarts it.
  plugins: [savedSettingsPlugin(DATA_DIR)],
});
// Every request and websocket upgrade first passes the Host check, with the names Vite read from
// FRIEND_MAP_ALLOWED_HOSTS (vite.config.ts), so the API and media refuse a DNS-rebinding page as the page does.
const extraHosts = vite.config.server.allowedHosts;
if (extraHosts === true) throw new Error("vite.config.ts must list the allowed Host names, not allow every one.");
guardHosts(server, extraHosts);

// Every address is answered at the root and under /friend-map alike, the hot-reload websocket included (server/basePath.ts).
serveAtBase(server, {
  archive: (req, res) => void archiveApi(req, res),
  api: (req, res) => void api(req, res),
  // An old /demo link leads to the public demo (server/oldDemo.ts); the app no longer holds one.
  page: (req, res) => void (redirectOldDemo(req, res) || vite.middlewares(req, res)),
});

server.listen(PORT, HOST, () => {
  console.log(`friend-map running at http://localhost:${PORT}/ (and under ${BASE_PATH}/)`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`The archive's server: ${ARCHIVE_URL}, keeping ${ARCHIVE_DIR}`);
});
