// friend-map's door to the archive: every /api/archive request the page makes that friend-map does not answer itself
// (methodology.ts answers the Table and the activity chart) is passed to the archive's server (the backend, such as
// the life archive's, at FRIEND_MAP_ARCHIVE_URL) as it came, and its answer passed back as it comes.
//
// Both ways stream: a request's body, an attachment's bytes (a Range asked for and the 206 answered, so video can
// seek) and the change stream (/api/archive/events, server-sent events), which ends when the page goes. Every header
// but the hop-by-hop ones is passed on unchanged, Host, Origin and Sec-Fetch-Site among them, so the archive's checks
// that a request came from friend-map's own page (fromOwnPage in jsonApi.ts) and from an allowed Host read what the
// browser sent. It adds the archive's folder friend-map was given (ARCHIVE_FOLDER_HEADER, in place of any the page
// sent), and a server keeping another answers 503. When nothing answers, it answers 503 as the archive does when it
// cannot open the archive, and the page says the archive is unavailable; the change stream's EventSource connects again
// by itself.

import { request, type IncomingHttpHeaders } from "node:http";
import { UNAVAILABLE } from "./archiveClient.ts";
import { ARCHIVE_FOLDER_HEADER } from "./dataHome.ts";
import { sendJson, type ApiHandler } from "./jsonApi.ts";

/** Headers that are about one connection, not the request: never passed on. */
const HOP_BY_HOP = ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];

function endToEnd(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const kept = { ...headers };
  for (const name of HOP_BY_HOP) delete kept[name];
  return kept;
}

/**
 * Passes each request to the archive's server at `upstream` (http://host:port) and its answer back; the server must
 * keep the archive at `folder` (dataHome().archive) when it is given.
 */
export function archiveProxy(upstream: string, { folder }: { folder?: string } = {}): ApiHandler {
  const target = new URL(upstream);
  return (req, res) =>
    new Promise<void>((done) => {
      const headers = endToEnd(req.headers);
      delete headers[ARCHIVE_FOLDER_HEADER];
      if (folder !== undefined) headers[ARCHIVE_FOLDER_HEADER] = encodeURIComponent(folder);
      const out = request(
        { host: target.hostname, port: target.port, method: req.method, path: req.url, headers },
        (answer) => {
          res.writeHead(answer.statusCode ?? 502, answer.statusMessage, endToEnd(answer.headers));
          answer.pipe(res);
          answer.on("error", () => res.destroy());
          answer.on("end", done);
        },
      );
      out.on("error", (error: NodeJS.ErrnoException) => {
        if (!res.headersSent) sendJson(res, 503, { error: `${UNAVAILABLE}nothing answers at ${upstream} (${error.code ?? error.message})` });
        else res.destroy();
        done();
      });
      // The page went (a closed change stream, a video skipped): stop asking the archive too.
      res.on("close", () => {
        if (!res.writableFinished) out.destroy();
        done();
      });
      req.pipe(out);
    });
}
