// Where the data folder and the archive's are, and the backend (dataHome.ts): from the
// environment, then .env.local, then data/; the first source naming either folder decides the
// archive's; the old names read after the new ones; and git config ahead of both, as
// check-demo gives it. Every folder here is made up, under a temporary one, and none is ever made or
// read but .env.local.

import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveUrl, dataHome, envSetting, gitConfigSource } from "./dataHome.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "friend-map-data-home-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const envLocal = (text: string) => writeFile(join(root, ".env.local"), text);

describe("dataHome", () => {
  it("is data/ in the repository for both, with nothing set", () => {
    expect(dataHome({ root, env: {} })).toEqual({ data: join(root, "data"), archive: join(root, "data") });
  });

  it("reads .env.local, so nothing need be exported: the archive elsewhere, the data folder still data/", async () => {
    await envLocal("FRIEND_MAP_ALLOWED_HOSTS=example.test\n# the life archive\nFRIEND_MAP_ARCHIVE_FOLDER=/srv/life-archive/data\n");
    expect(dataHome({ root, env: {} })).toEqual({ data: join(root, "data"), archive: "/srv/life-archive/data" });
  });

  it("takes .env.local's paths from the repository, and ~/ as the home folder, quoted or not", async () => {
    await envLocal('FRIEND_MAP_DATA=own\nFRIEND_MAP_ARCHIVE_FOLDER="~/life-archive/data"\n');
    expect(dataHome({ root, env: {} })).toEqual({ data: join(root, "own"), archive: join(homedir(), "life-archive", "data") });
  });

  it("puts the archive in the data folder when .env.local names only that", async () => {
    await envLocal("FRIEND_MAP_DATA=/srv/friend-map\n");
    expect(dataHome({ root, env: {} })).toEqual({ data: "/srv/friend-map", archive: "/srv/friend-map" });
  });

  it("reads the environment before .env.local", async () => {
    await envLocal("FRIEND_MAP_DATA=/srv/friend-map\nFRIEND_MAP_ARCHIVE_FOLDER=/srv/life-archive\n");
    const env = { FRIEND_MAP_DATA: "/tmp/own", FRIEND_MAP_ARCHIVE_FOLDER: "/tmp/archive" };
    expect(dataHome({ root, env })).toEqual({ data: "/tmp/own", archive: "/tmp/archive" });
  });

  it("runs on a testing folder alone when the environment names it, whatever archive .env.local names", async () => {
    await envLocal("FRIEND_MAP_ARCHIVE_FOLDER=/srv/life-archive\n");
    expect(dataHome({ root, env: { FRIEND_MAP_DATA: "/tmp/friend-map-testing" } })).toEqual({ data: "/tmp/friend-map-testing", archive: "/tmp/friend-map-testing" });
  });

  it("takes an archive named in the environment alone, the data folder still from .env.local", async () => {
    await envLocal("FRIEND_MAP_DATA=/srv/friend-map\nFRIEND_MAP_ARCHIVE_FOLDER=/srv/life-archive\n");
    expect(dataHome({ root, env: { FRIEND_MAP_ARCHIVE_FOLDER: "/tmp/archive" } })).toEqual({ data: "/srv/friend-map", archive: "/tmp/archive" });
  });

  it("passes over a setting left empty", async () => {
    await envLocal("FRIEND_MAP_ARCHIVE_FOLDER=/srv/life-archive\n");
    expect(dataHome({ root, env: { FRIEND_MAP_DATA: "", FRIEND_MAP_ARCHIVE_FOLDER: "" } })).toEqual({ data: join(root, "data"), archive: "/srv/life-archive" });
  });

  it("reads a source given before the environment first, as check-demo gives git config", async () => {
    await envLocal("FRIEND_MAP_ARCHIVE_FOLDER=/srv/life-archive\n");
    const env = { FRIEND_MAP_DATA: "/tmp/own" };
    expect(dataHome({ root, env, before: [{ data: "/srv/owner/data", base: root }] })).toEqual({ data: "/srv/owner/data", archive: "/srv/owner/data" });
    expect(dataHome({ root, env, before: [{ base: root }] })).toEqual({ data: "/tmp/own", archive: "/tmp/own" });
  });

  it("still reads the archive's folder by its old name, LIFE_ARCHIVE_DATA, the new name first in one source", async () => {
    await envLocal("LIFE_ARCHIVE_DATA=/srv/life-archive/data\n");
    expect(dataHome({ root, env: {} })).toEqual({ data: join(root, "data"), archive: "/srv/life-archive/data" });
    await envLocal("LIFE_ARCHIVE_DATA=/srv/old\nFRIEND_MAP_ARCHIVE_FOLDER=/srv/new\n");
    expect(dataHome({ root, env: {} }).archive).toBe("/srv/new");
    expect(dataHome({ root, env: { LIFE_ARCHIVE_DATA: "/tmp/archive" } }).archive).toBe("/tmp/archive");
  });
});

describe("envSetting and archiveUrl", () => {
  it("read the environment, then .env.local, passing over a setting left empty", async () => {
    await envLocal("FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4651\nFRIEND_MAP_ALLOWED_HOSTS=\n");
    expect(envSetting("FRIEND_MAP_ARCHIVE_URL", { root, env: {} })).toBe("http://127.0.0.1:4651");
    expect(envSetting("FRIEND_MAP_ARCHIVE_URL", { root, env: { FRIEND_MAP_ARCHIVE_URL: "http://127.0.0.1:4652" } })).toBe("http://127.0.0.1:4652");
    expect(envSetting("FRIEND_MAP_ALLOWED_HOSTS", { root, env: {} })).toBeUndefined();
    expect(archiveUrl({ root, env: { FRIEND_MAP_ARCHIVE_URL: "" } })).toBe("http://127.0.0.1:4651");
  });

  it("still read the backend's URL by its old name, LIFE_ARCHIVE_URL: the environment first, whichever name each uses", async () => {
    await envLocal("LIFE_ARCHIVE_URL=http://127.0.0.1:4651\n");
    expect(archiveUrl({ root, env: {} })).toBe("http://127.0.0.1:4651");
    await envLocal("FRIEND_MAP_ARCHIVE_URL=http://127.0.0.1:4653\nLIFE_ARCHIVE_URL=http://127.0.0.1:4651\n");
    expect(archiveUrl({ root, env: {} })).toBe("http://127.0.0.1:4653");
    expect(archiveUrl({ root, env: { LIFE_ARCHIVE_URL: "http://127.0.0.1:4652" } })).toBe("http://127.0.0.1:4652");
  });

  it("put the backend on port 4650 of this machine, with nothing set", () => {
    expect(archiveUrl({ root, env: {} })).toBe("http://127.0.0.1:4650");
  });
});

describe("gitConfigSource", () => {
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });

  it("reads friendmap.dataDir and friendmap.archiveDir, a relative path from the repository", async () => {
    git("init", "-q");
    expect(gitConfigSource(root)).toEqual({ data: undefined, archive: undefined, base: root });
    git("config", "friendmap.dataDir", "/srv/owner/data");
    git("config", "friendmap.archiveDir", "life/data");
    const source = gitConfigSource(root);
    expect(dataHome({ root, env: {}, before: [source] })).toEqual({ data: "/srv/owner/data", archive: join(root, "life", "data") });
  });

  it("is empty outside a repository", () => {
    expect(gitConfigSource(join(root, "nowhere"))).toEqual({ data: undefined, archive: undefined, base: join(root, "nowhere") });
  });
});
