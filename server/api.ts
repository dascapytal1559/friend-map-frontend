// The JSON API the page talks to, besides the archive's. Mounted under /api:
//
//   POST /api/usage                {view, opened, seconds} -> 204: appends a line to data/usage.jsonl
//                                  (see usage.ts)
//   GET  /api/settings             -> {settings, problems}: data/settings.json with the defaults
//                                  filling any gap (see settings.ts)
//   GET  /api/view-settings        -> {settings}: the saved view settings, data/view-settings.json
//                                  (see viewSettings.ts)
//   PUT  /api/view-settings        {<setting>: <value> | null} -> {settings}: each saved, or with null
//                                  forgotten, the rest kept
//   GET  /api/me                   -> {photo}: where your photo for the sun on Orbits is shown
//                                  from, or null for none (see mePhoto.ts)
//   GET  /api/me/photo             -> the photo's file (404 for none)
//   PUT  /api/me/photo             the image's bytes (JPEG, PNG, WebP or HEIC, up to 15 MB) -> {photo}:
//                                  kept in data/me/, in place of any before it
//   DELETE /api/me/photo           -> {photo: null}: removed, so the sun is drawn again
//
// People and messages are served by the archive, under /api/archive (see archive/http.ts).

import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import { ForbiddenError, InvalidInputError, NotFoundError } from "./errors.ts";
import { fromOwnPage, readBytes, readJson, sendJson, type ApiHandler } from "./jsonApi.ts";
import { currentPhoto, MAX_PHOTO_BYTES, photoUrl, removePhoto, savePhoto, type HeicConverter } from "./mePhoto.ts";
import { readSettings } from "./settings.ts";
import { recordUsage, usageFile } from "./usage.ts";
import { readViewSettings, saveViewSettings } from "./viewSettings.ts";

export function createApiHandler(dataDir: string, options: { convertHeic?: HeicConverter } = {}): ApiHandler {
  return async (req, res) => {
    try {
      await route(dataDir, req, res, options.convertHeic);
    } catch (error) {
      if (error instanceof NotFoundError) return sendJson(res, 404, { error: error.message });
      if (error instanceof InvalidInputError) return sendJson(res, 400, { error: error.message });
      if (error instanceof ForbiddenError) return sendJson(res, 403, { error: error.message });
      console.error(error);
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

async function route(dataDir: string, req: IncomingMessage, res: ServerResponse, convertHeic?: HeicConverter): Promise<void> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const method = req.method ?? "GET";
  if (path === "/api/settings") {
    if (method === "GET") return sendJson(res, 200, await readSettings(dataDir));
  } else if (path === "/api/view-settings") {
    if (method === "GET") return sendJson(res, 200, { settings: await readViewSettings(dataDir) });
    if (method === "PUT") {
      fromOwnPage(req);
      return sendJson(res, 200, { settings: await saveViewSettings(dataDir, await readJson(req)) });
    }
  } else if (path === "/api/usage") {
    if (method === "POST") {
      await recordUsage(usageFile(dataDir), await readJson(req));
      res.writeHead(204).end();
      return;
    }
  } else if (path === "/api/me") {
    if (method === "GET") return sendJson(res, 200, { photo: await photoUrl(dataDir) });
  } else if (path === "/api/me/photo") {
    if (method === "GET") return sendPhoto(dataDir, res);
    // PUT and DELETE are never sent cross-site without asking first, which this server never answers; fromOwnPage too.
    if (method === "PUT") {
      fromOwnPage(req);
      await savePhoto(dataDir, await readBytes(req, MAX_PHOTO_BYTES, "the photo"), convertHeic);
      return sendJson(res, 200, { photo: await photoUrl(dataDir) });
    }
    if (method === "DELETE") {
      fromOwnPage(req);
      await removePhoto(dataDir);
      return sendJson(res, 200, { photo: null });
    }
  } else {
    throw new NotFoundError(`no route ${path}`);
  }
  sendJson(res, 405, { error: `${method} not allowed on ${path}` });
}

async function sendPhoto(dataDir: string, res: ServerResponse): Promise<void> {
  const photo = await currentPhoto(dataDir);
  if (!photo) throw new NotFoundError("no photo");
  // The page asks for it by an address that changes with each new photo, so it may keep it, but must check it is still there.
  res.writeHead(200, { "content-type": photo.type, "x-content-type-options": "nosniff", "cache-control": "private, no-cache" });
  await pipeline(createReadStream(photo.path), res).catch(() => res.destroy());
}
