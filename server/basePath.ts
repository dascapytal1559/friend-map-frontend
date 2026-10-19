// friend-map's own path, so it can share one host with other apps: Tailscale Serve mounts it at
// https://<host>/friend-map (docs/running.md, "From your phone"), while http://localhost:4600/ still opens it at the root.
// The server answers every address both ways, /friend-map/spider as /spider, so it works whether a proxy passes the
// path on whole or takes /friend-map off first: the API sees its routes from /api on, and Vite, whose base this is
// (vite.config.ts), sees everything under it, so the page's modules and its hot-reload websocket are always asked for
// under /friend-map/ (src/mount.ts puts the page's own links and requests under whichever the page was opened at).

import type { IncomingMessage, Server, ServerResponse } from "node:http";

export const BASE_PATH = "/friend-map";

/** A request's path and query with BASE_PATH taken off the front: /friend-map/spider and /spider are both /spider, /friend-map is /. */
export function withoutBase(url: string, base: string = BASE_PATH): string {
  if (url !== base && !url.startsWith(`${base}/`) && !url.startsWith(`${base}?`)) return url;
  const rest = url.slice(base.length);
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/** A request's path and query under BASE_PATH, whether it came with it or not: /spider and /friend-map/spider are both /friend-map/spider. */
export function underBase(url: string, base: string = BASE_PATH): string {
  return `${base}${withoutBase(url, base)}`;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * Answers every request on `server`, at the root and under `base` alike: the archive's routes (/api/archive/...) and
 * the app's (/api/...) each see their path from /api on, and the page (Vite's middlewares, whose base is `base`) sees
 * every other path under `base`. A websocket upgrade is put under `base` before any other listener hears it, so Vite's
 * hot reload, which answers only at its base, connects however the page was opened.
 */
export function serveAtBase(server: Server, handlers: { archive: Handler; api: Handler; page: Handler }, base: string = BASE_PATH): void {
  server.on("request", (req: IncomingMessage, res: ServerResponse) => {
    const url = withoutBase(req.url ?? "/", base);
    const handler = url.startsWith("/api/archive/") ? handlers.archive : url.startsWith("/api/") ? handlers.api : null;
    req.url = handler ? url : `${base}${url}`;
    (handler ?? handlers.page)(req, res);
  });
  server.prependListener("upgrade", (req: IncomingMessage) => {
    req.url = underBase(req.url ?? "/", base);
  });
}
