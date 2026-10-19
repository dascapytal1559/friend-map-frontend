// Your photo for the sun on Orbits: GET /api/me, and GET, PUT and DELETE /api/me/photo (api.ts, mePhoto.ts),
// on made-up images in a temporary data directory.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiHandler } from "./api.ts";
import { heicToJpeg, MAX_PHOTO_BYTES, photoKind } from "./mePhoto.ts";

/** A real one-colour PNG, `size` pixels square. */
function png(size = 4): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x7f)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: size }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
}
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(12)]);

let dataDir: string;
let server: Server;
let base: string;
let converted: Buffer[];

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "friend-map-me-"));
  converted = [];
  const api = createApiHandler(dataDir, {
    convertHeic: async (heic) => {
      converted.push(heic);
      return JPEG;
    },
  });
  server = createServer((req, res) => void api(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
});

const put = (body: Buffer, headers: Record<string, string> = {}) =>
  fetch(`${base}/me/photo`, { method: "PUT", body: new Uint8Array(body), headers: { "content-type": "application/octet-stream", ...headers } });
const where = async () => ((await (await fetch(`${base}/me`)).json()) as { photo: string | null }).photo;

describe("your photo", () => {
  it("is none until one is sent, then kept in data/me/ and served from where /api/me says", async () => {
    expect(await where()).toBeNull();
    expect((await fetch(`${base}/me/photo`)).status).toBe(404);
    const image = png();
    const sent = await put(image);
    expect(sent.status).toBe(200);
    const { photo } = (await sent.json()) as { photo: string };
    expect(photo).toMatch(/^\/api\/me\/photo\?v=\d+$/);
    expect(await where()).toBe(photo);
    expect(await readdir(join(dataDir, "me"))).toEqual(["photo.png"]);
    const served = await fetch(`${base}${photo.slice("/api".length)}`);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await served.arrayBuffer()).equals(image)).toBe(true);
  });

  it("replaces the one before, whatever kind each is, leaving no other behind", async () => {
    await put(png());
    await put(JPEG);
    expect(await readdir(join(dataDir, "me"))).toEqual(["photo.jpg"]);
    await put(WEBP);
    expect(await readdir(join(dataDir, "me"))).toEqual(["photo.webp"]);
    expect((await fetch(`${base}/me/photo`)).headers.get("content-type")).toBe("image/webp");
  });

  it("keeps a HEIC photo as a JPEG, and refuses one that cannot be converted", async () => {
    expect((await put(HEIC)).status).toBe(200);
    expect(converted).toHaveLength(1);
    expect(await readdir(join(dataDir, "me"))).toEqual(["photo.jpg"]);
    expect(await readFile(join(dataDir, "me", "photo.jpg"))).toEqual(JPEG);

    const failing = createApiHandler(dataDir, { convertHeic: () => Promise.reject(new Error("unreadable")) });
    const other = createServer((req, res) => void failing(req, res));
    await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
    const refused = await fetch(`http://127.0.0.1:${(other.address() as AddressInfo).port}/api/me/photo`, { method: "PUT", body: new Uint8Array(HEIC) });
    await new Promise((resolve) => other.close(resolve));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(/HEIC/);
    expect(await readFile(join(dataDir, "me", "photo.jpg"))).toEqual(JPEG);
  });

  it("is removed by DELETE, so the sun is drawn again", async () => {
    await put(png());
    const removed = await fetch(`${base}/me/photo`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ photo: null });
    expect(await where()).toBeNull();
    expect(await readdir(join(dataDir, "me"))).toEqual([]);
    // Removing none is fine too.
    expect((await fetch(`${base}/me/photo`, { method: "DELETE" })).status).toBe(200);
  });

  it("refuses anything but a JPEG, PNG, WebP or HEIC image, by its bytes, whatever type it is sent as", async () => {
    await put(png());
    for (const body of [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), Buffer.from("GIF89a\x01\x00"), Buffer.alloc(0)]) {
      const refused = await put(body, { "content-type": "image/png" });
      expect(refused.status).toBe(400);
    }
    expect(await readdir(join(dataDir, "me"))).toEqual(["photo.png"]);
  });

  it("refuses one over the size cap, keeping the one before", async () => {
    await put(JPEG);
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]);
    const refused = await put(big).catch(() => null);
    // The server stops reading at the cap; the answer is a 400, or the connection is cut while still sending.
    if (refused) expect(refused.status).toBe(400);
    expect(await readFile(join(dataDir, "me", "photo.jpg"))).toEqual(JPEG);
  });

  it("refuses a change sent from another site's page", async () => {
    expect((await put(JPEG, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await put(JPEG, { origin: "http://elsewhere.example" })).status).toBe(403);
    expect((await fetch(`${base}/me/photo`, { method: "DELETE", headers: { "sec-fetch-site": "same-site" } })).status).toBe(403);
    expect(await where()).toBeNull();
    expect((await put(JPEG, { "sec-fetch-site": "same-origin" })).status).toBe(200);
  });

  it("answers other methods with 405", async () => {
    expect((await fetch(`${base}/me`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${base}/me/photo`, { method: "POST" })).status).toBe(405);
  });
});

describe("photoKind", () => {
  it("tells each kind by its first bytes", () => {
    expect(photoKind(png())).toBe("png");
    expect(photoKind(JPEG)).toBe("jpg");
    expect(photoKind(WEBP)).toBe("webp");
    expect(photoKind(HEIC)).toBe("heic");
    expect(photoKind(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42")]))).toBeNull();
    expect(photoKind(Buffer.from("hello"))).toBeNull();
  });
});

// sips is macOS's: the conversion itself is tried only where it is.
const sips = await promisify(execFile)("sips", ["--help"]).then(() => true, () => false);
describe.skipIf(!sips)("heicToJpeg", () => {
  it("turns a real HEIC image into a JPEG, leaving nothing behind", async () => {
    const work = await mkdtemp(join(tmpdir(), "friend-map-heic-"));
    try {
      await writeFile(join(work, "made-up.png"), png(16));
      await promisify(execFile)("sips", ["-s", "format", "heic", join(work, "made-up.png"), "--out", join(work, "made-up.heic")]);
      const heic = await readFile(join(work, "made-up.heic"));
      expect(photoKind(heic)).toBe("heic");
      const into = join(work, "into");
      await mkdir(into);
      expect(photoKind(await heicToJpeg(heic, into))).toBe("jpg");
      expect(await readdir(into)).toEqual([]);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
