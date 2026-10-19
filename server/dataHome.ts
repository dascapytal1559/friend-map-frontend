// Where friend-map's files are, and where its backend is:
//
//   the data folder       friend-map's own: settings.json, view-settings.json, usage.jsonl and
//                         your photo (me/)
//   the archive's folder  the folder friend-map names to the backend on every request
//                         (ARCHIVE_FOLDER_HEADER), so a backend keeping another refuses it
//   the backend's URL     where the archive's server answers
//
// FRIEND_MAP_DATA names the data folder, else it is data/ in this repository;
// FRIEND_MAP_ARCHIVE_FOLDER names the archive's folder, else it is the data folder, so one
// testing folder holds both; FRIEND_MAP_ARCHIVE_URL names the backend, else port 4650 on this
// machine. Each is read from the environment, then from .env.local in this repository
// (gitignored, KEY=value lines; a relative path is from the repository, and ~/ is the home
// folder), so every entry point (the server, check-settings, usage, check-demo) finds them
// without anything exported. The names they had while the archive was friend-map's, LIFE_ARCHIVE_DATA and LIFE_ARCHIVE_URL, are read too, after the new ones in the
// same source. The first source naming either folder decides the archive's folder:
// FRIEND_MAP_DATA=/tmp/testing in the environment runs on that folder alone, whatever archive
// .env.local names. check-demo and the demo's build read git config ahead of both
// (friendmap.dataDir and friendmap.archiveDir, gitConfigSource), which is how a worktree of
// your copy, with no .env.local or data/ of its own, finds yours.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const REPO = fileURLToPath(new URL("..", import.meta.url));

export interface DataHome {
  /** friend-map's own files. */
  data: string;
  /** The archive's, as named to the backend. */
  archive: string;
}

/** Each setting's names, the new one first and then the old one it replaces. */
const NAMES = {
  data: ["FRIEND_MAP_DATA"],
  archive: ["FRIEND_MAP_ARCHIVE_FOLDER", "LIFE_ARCHIVE_DATA"],
  url: ["FRIEND_MAP_ARCHIVE_URL", "LIFE_ARCHIVE_URL"],
};

/** Where a source's folders came from, which its relative paths are from. */
export interface HomeSource {
  data?: string;
  archive?: string;
  /** The folder a relative path in it is from. */
  base: string;
}

/** The two folders (see the top of this file); `before` are sources ahead of the environment (git config, gitConfigSource). */
export function dataHome({ root = REPO, env = process.env, before = [] }: { root?: string; env?: NodeJS.ProcessEnv; before?: HomeSource[] } = {}): DataHome {
  const sources = [...before, source(env, process.cwd()), source(envFile(join(root, ".env.local")), root)];
  const at = (source: HomeSource, key: "data" | "archive") =>
    source[key] ? resolve(source.base, source[key].replace(/^~(?=$|\/)/, homedir())) : undefined;
  const data = sources.map((source) => at(source, "data")).find(Boolean) ?? join(root, "data");
  const decides = sources.find((source) => source.data || source.archive);
  const archive = decides && (at(decides, "archive") ?? at(decides, "data"));
  return { data, archive: archive || data };
}

/**
 * A setting from the environment, else from .env.local in the repository at `root`; undefined when neither names it.
 * Given several names (a setting's new one and its old), the first a source names wins, and the environment before
 * .env.local whichever name each uses.
 */
export function envSetting(keys: string | string[], { root = REPO, env = process.env }: { root?: string; env?: NodeJS.ProcessEnv } = {}): string | undefined {
  return named(env, keys) ?? named(envFile(join(root, ".env.local")), keys);
}

/** Where the backend answers (the archive's server): FRIEND_MAP_ARCHIVE_URL (or LIFE_ARCHIVE_URL), from the environment or .env.local, else port 4650 on this machine. */
export function archiveUrl(options: { root?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return envSetting(NAMES.url, options) ?? "http://127.0.0.1:4650";
}

/**
 * The header friend-map sends the archive's server with the archive's folder it was given (encodeURIComponent'd), on
 * every request: a server that keeps another answers 503, so friend-map on a testing folder never meets the real
 * archive, whatever server FRIEND_MAP_ARCHIVE_URL names. A backend that keeps no such folder may ignore it.
 */
export const ARCHIVE_FOLDER_HEADER = "x-archive-folder";

/** The folders git config names in the repository at `top`: friendmap.dataDir and friendmap.archiveDir, as FRIEND_MAP_DATA and FRIEND_MAP_ARCHIVE_FOLDER. */
export function gitConfigSource(top: string): HomeSource {
  const get = (key: string) => {
    try {
      return execFileSync("git", ["-C", top, "config", "--get", "--type=path", key], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
    } catch {
      return undefined; // not set
    }
  };
  return { data: get("friendmap.dataDir"), archive: get("friendmap.archiveDir"), base: top };
}

function source(values: Record<string, string | undefined>, base: string): HomeSource {
  return { data: named(values, NAMES.data), archive: named(values, NAMES.archive), base };
}

/** The value of the first of `keys` that `values` sets to something other than empty. */
function named(values: Record<string, string | undefined>, keys: string | string[]): string | undefined {
  for (const key of [keys].flat()) if (values[key]) return values[key];
  return undefined;
}

function envFile(path: string): Record<string, string> {
  try {
    return parseEnv(readFileSync(path, "utf8")) as Record<string, string>;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return {};
    throw error;
  }
}
