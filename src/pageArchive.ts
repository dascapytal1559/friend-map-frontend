// The app's archive and server (src/main.tsx provides them before anything draws): the server's, or on the demo's
// pages (/demo, demoMode.ts) the static demo's made-up crowd, made as the page opens and held in it, loaded only then.

import type { AppApi } from "./appApi.ts";
import { httpApp } from "./appHttp.ts";
import type { ArchiveApi } from "./archiveApi.ts";
import { httpArchive } from "./archiveHttp.ts";
import { demoApp } from "./demo/app.ts";
import { DEMO_TIME_ZONE } from "./demo/timeZone.ts";
import { demoMode } from "./demoMode.ts";
import { setTimeZone } from "./time.ts";

/** The made-up crowd's archive (src/demo/), as of `now`: made in its own time zone, which its handshake names too. */
export async function demoArchive(now?: number): Promise<ArchiveApi> {
  const [{ DemoArchive }, { generateDemo }] = await Promise.all([import("./demo/archive.ts"), import("./demo/generate.ts")]);
  setTimeZone(DEMO_TIME_ZONE);
  return new DemoArchive(generateDemo(now)).api;
}

/** The page's archive: the server's, or on the demo's pages the made-up crowd's. */
export async function pageArchive(demo: boolean = demoMode): Promise<ArchiveApi> {
  return demo ? demoArchive() : httpArchive;
}

/** friend-map's own server as the page has it: the server's, or on the demo's pages the demo's (defaults, no photo). */
export function pageApp(demo: boolean = demoMode): AppApi {
  return demo ? demoApp : httpApp;
}
