// The app's own demo, at /demo, is gone: the demo is only the public one now (PUBLIC_DEMO in src/views.ts). An old
// /demo link to the app, at the root or under /friend-map, leads there before any page is served (oldDemoAddress),
// with a 302 rather than a 301, so no browser keeps it for good should the app hold a demo again.

import type { IncomingMessage, ServerResponse } from "node:http";
import { oldDemoAddress } from "../src/views.ts";
import { withoutBase } from "./basePath.ts";

/** Sends an old /demo address on to the public demo and says it did; leaves any other request alone. */
export function redirectOldDemo(req: IncomingMessage, res: ServerResponse): boolean {
  const to = oldDemoAddress(withoutBase(req.url ?? "/"));
  if (to === null) return false;
  res.writeHead(302, { location: to }).end();
  return true;
}
