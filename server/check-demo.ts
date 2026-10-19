// Holds the static demo's built files (dist-demo/, npm run build:demo) to what
// may be published, before they are:
//
//   npm run check-demo                          checks dist-demo/
//   npm run check-demo -- [dist dir] [--data <dir>]
//
// - Nothing from the friend data's folders (the data folder and the archive's): no file is any file in them, byte
//   for byte, whatever it is called. A git repository kept inside it (a
//   clone of this repository) is not friend
//   data in two places, which are passed over and noted: a file this
//   repository has committed (its public source, as a clone has it), and a
//   clone's own earlier demo build, the same file at the same path in its
//   dist-demo/. Everything else inside such a repository, and everything
//   outside one, is held to as before, so a built file with the bytes of a
//   real data file is still refused.
// - Only what a web page is made of (html, scripts, styles, images, fonts, and
//   Cloudflare Pages' _headers and _redirects): no database, no export, no
//   JSON or log of any kind.
// - No server route: "/api/" nowhere in them, so nothing in the page can ask
//   for the archive (the page's own policy keeps it off the network too).
// - No private data: what the life archive's privacy guard stops in a commit,
//   by its local check (npm run guard -- scan --json, in the life archive at
//   LIFE_ARCHIVE_HOME, from the environment or .env.local, else
//   ~/Projects/life-archive: real people's names, group chats' titles, account
//   ids and notes from its archive, your own name, real-looking
//   numbers, emails and host names, this machine's names), which says where
//   and which rule, never what. With no life archive there, or a guard that
//   cannot answer, nothing may be published. Something it finds that the app's
//   own code has too, or the libraries the page is built from (React, d3), is
//   an ordinary word there (a handle that is also a CSS property, a group chat
//   called what a function is called), not someone in the crowd: it is noted,
//   not refused. The files of made-up people (words.ts, the examples, the
//   fixtures) are not the app's code for this, so a made-up name that is a
//   real one is refused. It says only how many of which rule it found in which
//   file, never what.
//
// The folders are --data's alone, else (server/dataHome.ts) git config friendmap.dataDir
// and friendmap.archiveDir, else FRIEND_MAP_DATA and FRIEND_MAP_ARCHIVE_FOLDER from the
// environment or .env.local, else data/.
// Prints every file with its size, raw and gzipped, then one line per
// problem, and exits 0 when they may be published, 1 when not, 2 when there
// is nothing built to check.

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dataHome, envSetting, gitConfigSource, type DataHome } from "./dataHome.ts";
import { gzipSync } from "node:zlib";

/** What a page is made of; anything else in the built files is a problem. */
const PAGE_FILES = /^(_headers|_redirects|.*\.(html|js|css|svg|png|jpe?g|gif|webp|avif|ico|woff2?|txt))$/;
/** The files of made-up people, which are not the app's own code when a finding is weighed (see the top of this file). */
const MADE_UP = /^(src\/demo\/words\.ts|src\/demo\/examples\.ts|server\/fixtures\/.*|.*\.test\.tsx?)$/;
/** The libraries the page is built from, with what they depend on. */
const LIBRARIES = ["react", "react-dom", "d3"];
const REPO = fileURLToPath(new URL("..", import.meta.url));
/** Where the demo is built, here and in a clone of this repository. */
const BUILD = "dist-demo";

/** Something the privacy guard found in a text: where, and which rule, never what. */
export interface Finding {
  rule: string;
  start: number;
  end: number;
}

/** The privacy guard's local check over several texts at once: each text's findings, in its order. Throws when it cannot answer. */
export type Scan = (texts: string[]) => Finding[][];

export interface DemoFile {
  path: string;
  bytes: number;
  gzipped: number;
}

export interface DemoCheck {
  files: DemoFile[];
  problems: string[];
  /**
   * What the scanner found that the app's own code has too (ordinary words there, said by file and rule, never what),
   * and the files the same only as this repository's own copies in the data folder.
   */
  notes: string[];
}

/** Every file under `dir` (none for a folder that is not there), as paths relative to it. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
/** A finding's text as found anywhere: lower case, its words apart by one space (Ada_Sample, ada sample). */
const found = (text: string) => text.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Everything `scan` finds in each of `texts`, and in each with every dot between two words read as a space, so a list
 * the minifier joined with dots ("Perth.Hobart".split(".")) is read word by word; the dots stand where they were, so
 * both readings' places are the text's own. One call of `scan` for them all.
 */
function scanned(scan: Scan, texts: string[]): Finding[][] {
  const found = scan(texts.flatMap((text) => [text, text.replace(/(?<=[\p{L}\p{N}_])\.(?=[\p{L}\p{N}_])/gu, " ")]));
  return texts.map((_, i) => {
    const seen = new Set<string>();
    return [...found[2 * i]!, ...found[2 * i + 1]!].filter((f) => !seen.has(`${f.start}:${f.end}:${f.rule}`) && seen.add(`${f.start}:${f.end}:${f.rule}`));
  });
}

/**
 * The git repositories kept inside `data` (not `data` itself), as paths relative to it: work trees (a folder with a
 * .git, folder or file) and bare repositories (HEAD beside objects/ and refs/).
 */
function repositoriesIn(data: string): string[] {
  const roots = new Set<string>();
  for (const entry of readdirSync(data, { recursive: true, withFileTypes: true })) {
    const at = entry.parentPath;
    const bare = entry.name === "HEAD" && entry.isFile() && existsSync(join(at, "objects")) && existsSync(join(at, "refs"));
    if ((entry.name === ".git" || bare) && resolve(at) !== resolve(data)) roots.add(relative(data, at));
  }
  return [...roots];
}

/**
 * The blobs `repo` has committed (at HEAD) of the given sizes, by object id, with the hash that names them, so a file's
 * id is found without reading the repository; none where `repo` is not a repository with a commit.
 */
function committed(repo: string, sizes: Set<number>): { ids: Set<string>; id: (file: string) => string } {
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const ids = new Set<string>();
  let format = "sha1";
  try {
    format = git("rev-parse", "--show-object-format").trim();
    for (const line of git("ls-tree", "-r", "-l", "HEAD").split("\n")) {
      const [, type, id, size] = line.split(/\s+/);
      if (type === "blob" && sizes.has(Number(size))) ids.add(id);
    }
  } catch {
    // not a repository, or nothing committed: nothing of it is passed over
  }
  return { ids, id: (file) => { const content = readFileSync(file); return createHash(format).update(`blob ${content.length}\0`).update(content).digest("hex"); } };
}

/**
 * The built files in `dist`, held to what may be published (see the top of this file): `data` the friend data's
 * folders, `scan` what finds private data (guardScan; when it throws, that is a problem), `code` the app's own code
 * and its libraries' (codeOf), against which a finding is weighed, and `repo` this repository, whose committed files
 * a clone in `data` may hold.
 */
export function checkDemo({ dist, data = [], scan, code = "", repo }: { dist: string; data?: string[]; scan?: Scan; code?: string; repo?: string }): DemoCheck {
  const problems: string[] = [];
  const notes: string[] = [];
  const files = filesUnder(dist).map((path): DemoFile => {
    const content = readFileSync(join(dist, path));
    return { path, bytes: content.length, gzipped: gzipSync(content).length };
  });
  for (const file of files) if (!PAGE_FILES.test(file.path.split("/").at(-1)!)) problems.push(`${file.path}: not a kind of file a page is made of`);

  // Nothing from the data folders: the same bytes as any file there, but this repository's own copies in a clone there
  // (see the top of this file). Only files of the same size are read.
  for (const folder of new Set(data.map((dir) => resolve(dir)))) {
    if (!existsSync(folder)) continue;
    const bySize = new Map<number, string[]>();
    for (const path of filesUnder(folder)) {
      const size = statSync(join(folder, path)).size;
      (bySize.get(size) ?? bySize.set(size, []).get(size)!).push(path);
    }
    const repositories = repositoriesIn(folder);
    const source = repo ? committed(repo, new Set(files.map((file) => file.bytes))) : undefined;
    /** Whether `twin`, the same bytes as the built `file`, is this repository's own: its committed file, or an earlier build of it, in a clone. */
    const ours = (twin: string, file: DemoFile) =>
      repositories.some((root) => {
        if (!twin.startsWith(`${root}${sep}`)) return false;
        if (twin === join(root, BUILD, file.path)) return true;
        return !!source && source.ids.has(source.id(join(folder, twin)));
      });
    for (const file of files) {
      const twins = bySize.get(file.bytes);
      if (!twins) continue;
      const hash = sha256(join(dist, file.path));
      const same = twins.filter((twin) => sha256(join(folder, twin)) === hash);
      const theirs = same.filter((twin) => !ours(twin, file));
      if (theirs.length > 0) problems.push(`${file.path}: the same as a file in the data folder`);
      else if (same.length > 0) {
        notes.push(`${file.path}: the same as ${same.length} cop${same.length === 1 ? "y" : "ies"} of this repository's own files or demo builds in git repositories in the data folder, passed over`);
      }
    }
  }

  const texts = files.filter((file) => /\.(html|js|css|svg|txt)$|^_/.test(file.path.split("/").at(-1)!)).map((file) => ({ file, text: readFileSync(join(dist, file.path), "utf8") }));
  let scans: Finding[][] = [];
  try {
    if (scan) scans = scanned(scan, [code, ...texts.map(({ text }) => text)]);
  } catch (error) {
    problems.push(`not checked for private data: ${(error as Error).message}`);
  }
  const [inCodeFound = [], ...findings] = scans;
  const inCode = new Set(inCodeFound.map((f) => found(code.slice(f.start, f.end))));
  for (const [i, { file, text }] of texts.entries()) {
    const routes = text.split("/api/").length - 1;
    if (routes > 0) problems.push(`${file.path}: ${routes} server route${routes === 1 ? "" : "s"} (/api/)`);
    const byRule = new Map<string, { code: number; not: number }>();
    for (const finding of findings[i] ?? []) {
      const counts = byRule.get(finding.rule) ?? byRule.set(finding.rule, { code: 0, not: 0 }).get(finding.rule)!;
      if (inCode.has(found(text.slice(finding.start, finding.end)))) counts.code++;
      else counts.not++;
    }
    for (const [rule, { code: also, not }] of byRule) {
      if (not > 0) problems.push(`${file.path}: ${not} × ${rule}, in nothing of the app's own code`);
      if (also > 0) notes.push(`${file.path}: ${also} × ${rule}, also in the app's own code or its libraries`);
    }
  }
  return { files, problems, notes };
}

/** The app's own code (the repository's files at `repo`, but the made-up people's) and its libraries', as one text. */
export function codeOf(repo: string): string {
  const tracked = execFileSync("git", ["-C", repo, "ls-files"], { encoding: "utf8" }).split("\n").filter((path) => path && !MADE_UP.test(path));
  const texts = tracked.flatMap((path) => (/\.(ts|tsx|css|html|md|json)$/.test(path) && existsSync(join(repo, path)) ? [readFileSync(join(repo, path), "utf8")] : []));
  const seen = new Set<string>();
  const library = (name: string) => {
    const dir = join(repo, "node_modules", name);
    if (seen.has(name) || !existsSync(join(dir, "package.json"))) return;
    seen.add(name);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    for (const path of filesUnder(dir)) if (/\.(c?js|mjs)$/.test(path) && !path.includes("node_modules")) texts.push(readFileSync(join(dir, path), "utf8"));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) library(dependency);
  };
  for (const name of LIBRARIES) library(name);
  return texts.join("\n");
}

/** Where the life archive's project is: LIFE_ARCHIVE_HOME, from the environment or .env.local, else ~/Projects/life-archive. */
export function lifeArchiveHome(options: { root?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const named = envSetting("LIFE_ARCHIVE_HOME", options) ?? "~/Projects/life-archive";
  return resolve(options.root ?? REPO, named.replace(/^~(?=$|\/)/, homedir()));
}

/** Whether `home` is a life archive with the privacy guard (its package.json has the guard command). */
export function hasGuard(home: string): boolean {
  try {
    return typeof (JSON.parse(readFileSync(join(home, "package.json"), "utf8")) as { scripts?: Record<string, unknown> }).scripts?.guard === "string";
  } catch {
    return false;
  }
}

/**
 * The privacy guard's local check, in the life archive at `home`: each text written to a file of its own in a scratch
 * folder, then one `npm --prefix <home> run guard -- scan --json <files>`, which prints each finding as
 * {file, rule, start, end} and never the text, and exits 0 for none and 1 for some. Anything else (another exit, a
 * line that is not a finding, 1 with nothing found, as an archive it could not read gives) throws, so nothing passes
 * unchecked. What it says on stderr (no archive, so no names) is passed on.
 */
export function guardScan(home: string): Scan {
  return (texts) => {
    const dir = mkdtempSync(join(tmpdir(), "friend-map-check-demo-"));
    try {
      const files = texts.map((text, i) => {
        const file = join(dir, `${i}.txt`);
        writeFileSync(file, text);
        return file;
      });
      const run = spawnSync("npm", ["--prefix", home, "run", "--silent", "guard", "--", "scan", "--json", ...files], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
        maxBuffer: 256 * 1024 * 1024,
      });
      if (run.error) throw new Error(`the privacy guard could not be run (${run.error.message})`);
      if (run.status !== 0 && run.status !== 1) throw new Error(`the privacy guard stopped (exit ${run.status ?? run.signal})`);
      const found = texts.map((): Finding[] => []);
      let count = 0;
      for (const line of run.stdout.split("\n").filter((line) => line.trim())) {
        let finding: { file?: unknown; rule?: unknown; start?: unknown; end?: unknown };
        try {
          finding = JSON.parse(line);
        } catch {
          throw new Error("the privacy guard said something that is not a finding");
        }
        const at = files.indexOf(String(finding.file));
        if (at < 0 || typeof finding.rule !== "string" || typeof finding.start !== "number" || typeof finding.end !== "number") {
          throw new Error("the privacy guard said something that is not a finding");
        }
        found[at]!.push({ rule: finding.rule, start: finding.start, end: finding.end });
        count++;
      }
      if ((run.status === 1) !== count > 0) throw new Error(`the privacy guard exited ${run.status} with ${count} finding${count === 1 ? "" : "s"}`);
      return found;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** The friend data's folders: --data's alone, or those dataHome names (see the top of this file). */
function dataFolders(given: string | undefined): DataHome {
  if (given) return { data: resolve(given), archive: resolve(given) };
  return dataHome({ root: REPO, before: [gitConfigSource(REPO)] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--data");
  const home = dataFolders(at >= 0 ? args[at + 1] : undefined);
  const data = [...new Set([home.data, home.archive])];
  const dist = resolve(args.find((arg, i) => !arg.startsWith("--") && (at < 0 || i !== at + 1)) ?? join(REPO, "dist-demo"));
  if (!existsSync(join(dist, "index.html"))) {
    console.error(`Nothing built to check at ${dist}: run npm run build:demo first.`);
    process.exit(2);
  }
  const lifeArchive = lifeArchiveHome();
  const guarded = hasGuard(lifeArchive);
  const { files, problems, notes } = checkDemo({ dist, data, scan: guarded ? guardScan(lifeArchive) : undefined, code: codeOf(REPO), repo: REPO });
  if (!guarded) problems.push(`not checked for private data: no life archive with the privacy guard at ${lifeArchive} (LIFE_ARCHIVE_HOME)`);
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
  for (const file of files) console.log(`${file.path.padEnd(44)} ${kb(file.bytes).padStart(10)}  ${kb(file.gzipped).padStart(10)} gzipped`);
  const sum = (pick: (file: DemoFile) => number) => files.reduce((n, file) => n + pick(file), 0);
  console.log(`${`${files.length} files`.padEnd(44)} ${kb(sum((f) => f.bytes)).padStart(10)}  ${kb(sum((f) => f.gzipped)).padStart(10)} gzipped`);
  const there = data.filter((dir) => existsSync(dir));
  console.log(`Checked against ${there.length > 0 ? there.join(" and ") : "no data folder (there is none here)"}${guarded ? `, and by the privacy guard in ${lifeArchive}` : ""}.`);
  for (const note of notes) console.log(`note    ${note}`);
  for (const problem of problems) console.log(`PROBLEM ${problem}`);
  console.log(problems.length === 0 ? "The demo's files may be published." : `${problems.length} problem${problems.length === 1 ? "" : "s"}: not to be published.`);
  process.exit(problems.length === 0 ? 0 : 1);
}
