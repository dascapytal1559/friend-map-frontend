// check-settings: friend-map's own settings.json, in the folder given or the data folder the
// environment names. Every folder is made up, under a temporary one.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect, it } from "vitest";

const SCRIPT = new URL("./check-settings.ts", import.meta.url).pathname;

let root: string;
let dataDir: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "friend-map-check-")));
  dataDir = join(root, "data");
  await mkdir(dataDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function checkSettings(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, FRIEND_MAP_DATA: "", FRIEND_MAP_ARCHIVE_FOLDER: "", LIFE_ARCHIVE_DATA: "", ...env },
    });
    return { code: 0, stdout };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { code, stdout };
  }
}

it("passes with no settings file, every setting its default", async () => {
  expect(await checkSettings([dataDir])).toEqual({ code: 0, stdout: `No ${join(dataDir, "settings.json")}: every setting is its default.\n` });
});

it("checks the settings file, and fails naming each problem", async () => {
  await writeFile(join(dataDir, "settings.json"), '{"trendMonths": 6}');
  expect(await checkSettings([dataDir])).toEqual({ code: 0, stdout: `Checked ${join(dataDir, "settings.json")}: all fine.\n` });
  await writeFile(join(dataDir, "settings.json"), '{"trendMonths": 1}');
  expect(await checkSettings([dataDir])).toEqual({
    code: 1,
    stdout: "settings.json: trendMonths must be a whole number of months from 3 to 240; using 12\n" + `Checked ${join(dataDir, "settings.json")}: to fix.\n`,
  });
});

it("checks the data folder the environment names, when given no folder", async () => {
  await writeFile(join(dataDir, "settings.json"), '{"trendMonths": 6}');
  expect(await checkSettings([], { FRIEND_MAP_DATA: dataDir })).toEqual({ code: 0, stdout: `Checked ${join(dataDir, "settings.json")}: all fine.\n` });
});
