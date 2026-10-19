// The check on the static demo's built files (npm run check-demo), over made-up
// built files, a made-up data folder and a stand-in for the life archive's
// privacy guard that knows made-up people: it lets through a page and nothing
// else, refuses a file from the data folder by its bytes, a file that is no
// part of a page, a server route and private data (in a list the minifier
// joined with dots too), notes what the app's own code has too, never says
// what it found, and lets nothing through when the guard cannot answer or is
// not there. Clones of the repository in the data folder: its committed files
// and earlier demo builds there are passed over, a real data file there or
// beside them is not.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkDemo, guardScan, hasGuard, lifeArchiveHome, type Finding, type Scan } from "./check-demo.ts";

let root: string;
let dist: string;
let data: string;

// A value that would be real-looking is put together from pieces, so that this file itself holds none.
const pieces = (...parts: string[]) => parts.join("");
const HANDLE = pieces("ada", "_sample", "_77");
const NUMBER = pieces("+61 4", "91 57", "0 123");

/** What the stand-in guard knows of made-up people, by rule, each found as a whole word or words. */
const KNOWN: Array<[string, string]> = [
  ["Ada Sample", "a real person's name"],
  ["Cleo Example", "a real person's name"],
  ["Lorem Crew", "a real group chat's title"],
  [HANDLE, "a real account id or phone number"],
  [NUMBER, "a real account id or phone number"],
];

/** Every place a known term is in `text`, as the guard says it: where and which rule. */
function findIn(text: string): Finding[] {
  const escaped = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return KNOWN.flatMap(([term, rule]) =>
    [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(term)}(?![\\p{L}\\p{N}_])`, "gu"))].map((m) => ({ rule, start: m.index, end: m.index + term.length })),
  );
}

/** A stand-in for the guard's local check, counting its calls. */
let calls = 0;
const scan: Scan = (texts) => (calls++, texts.map(findIn));

/** A built demo of `files` (path to content), made afresh. */
async function built(files: Record<string, string>): Promise<string> {
  await rm(dist, { recursive: true, force: true });
  await written(dist, { "index.html": "<!doctype html><title>Friend map · demo</title>", "_headers": HEADERS, ...files });
  return dist;
}

const HEADERS = "/*\n  X-Content-Type-Options: nosniff\n";

/** `files` (path to content) written under `dir`. */
async function written(dir: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
}

/** A git repository at `dir` (bare: a bare one) with `files` written and, when `commit`, committed. */
async function repository(dir: string, files: Record<string, string>, { commit = true, bare = false } = {}) {
  await mkdir(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "core.hooksPath=/dev/null", ...args], { stdio: "ignore" });
  git("init", "-q", ...(bare ? ["--bare"] : []));
  await written(dir, files);
  if (commit && !bare) {
    git("add", "-A");
    git("commit", "-q", "-m", "files");
  }
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "friend-map-check-demo-"));
  dist = join(root, "dist");
  data = join(root, "data");
  await mkdir(join(data, "platform-exports"), { recursive: true });
  await writeFile(join(data, "archive.sqlite"), "SQLite format 3\u0000 made up");
  await writeFile(join(data, "platform-exports", "photo.jpg"), "a made-up photo's bytes");
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe("the check on the demo's built files", () => {
  it("lets a page through, with every file's size", async () => {
    const check = checkDemo({ dist: await built({ "assets/index-1.js": "console.log('hello')", "assets/index-1.css": "body{margin:0}" }), data: [data], scan });
    expect([check.problems, check.notes]).toEqual([[], []]);
    expect(check.files.map((f) => f.path)).toEqual(["_headers", "assets/index-1.css", "assets/index-1.js", "index.html"]);
    expect(check.files.every((f) => f.bytes > 0 && f.gzipped > 0)).toBe(true);
  });

  it("refuses a file from the archive's folder too, when it is not the data folder", async () => {
    const archive = join(root, "life-archive");
    await mkdir(join(archive, "platform-exports"), { recursive: true });
    await writeFile(join(archive, "platform-exports", "voice.jpg"), "a made-up voice note's cover");
    const check = checkDemo({ dist: await built({ "assets/logo.jpg": "a made-up photo's bytes", "assets/cover.jpg": "a made-up voice note's cover" }), data: [join(root, "own"), archive, data] });
    expect(check.problems.sort()).toEqual(["assets/cover.jpg: the same as a file in the data folder", "assets/logo.jpg: the same as a file in the data folder"]);
  });

  it("refuses a file from the data folder whatever it is called, and a file no page is made of", async () => {
    const check = checkDemo({ dist: await built({ "assets/logo.jpg": "a made-up photo's bytes", "crowd.json": "{}", "archive.sqlite": "x" }), data: [data] });
    expect(check.problems).toEqual([
      "archive.sqlite: not a kind of file a page is made of",
      "crowd.json: not a kind of file a page is made of",
      "assets/logo.jpg: the same as a file in the data folder",
    ]);
  });

  it("refuses a server route", async () => {
    const check = checkDemo({ dist: await built({ "assets/index-1.js": 'fetch("/api/archive/people")' }), data: [data] });
    expect(check.problems).toEqual(["assets/index-1.js: 1 server route (/api/)"]);
  });

  it("refuses private data, a list joined with dots too, and says how many of which rule, never what, asking the guard once", async () => {
    const js = `const a="Ada Sample",b="@${HANDLE}",c="${NUMBER}",d="Lorem Crew",e="Perth.Cleo.Example.Hobart".split(".");`;
    calls = 0;
    const check = checkDemo({ dist: await built({ "assets/index-1.js": js, "assets/index-1.css": "body{margin:0}" }), data: [data], scan });
    expect(check.problems.sort()).toEqual([
      "assets/index-1.js: 1 × a real group chat's title, in nothing of the app's own code",
      "assets/index-1.js: 2 × a real account id or phone number, in nothing of the app's own code",
      "assets/index-1.js: 2 × a real person's name, in nothing of the app's own code",
    ]);
    expect(check.problems.join("\n")).not.toMatch(/ada|sample|cleo|lorem|perth|98/i);
    expect(calls).toBe(1);
  });

  it("lets nothing through when the guard cannot answer", async () => {
    const broken: Scan = () => {
      throw new Error("the privacy guard stopped (exit 2)");
    };
    const check = checkDemo({ dist: await built({ "assets/index-1.js": "console.log('hello')" }), data: [data], scan: broken });
    expect(check.problems).toEqual(["not checked for private data: the privacy guard stopped (exit 2)"]);
  });

  it("notes, but lets through, what the app's own code has too", async () => {
    const check = checkDemo({ dist: await built({ "assets/index-1.js": 'const t="Lorem Crew"' }), data: [data], scan, code: "export const title = 'Lorem Crew';" });
    expect(check.problems).toEqual([]);
    expect(check.notes).toEqual(["assets/index-1.js: 1 × a real group chat's title, also in the app's own code or its libraries"]);
  });

  describe("with clones of the repository in the data folder", () => {
    let repo: string;
    let cloned: string;

    beforeAll(async () => {
      repo = join(root, "repo");
      cloned = join(root, "cloned-data");
      await repository(repo, { "src/demo/public/_headers": HEADERS, "src/app.css": "body{margin:0}" });
      await written(cloned, { "archive.sqlite": "SQLite format 3\u0000 made up", "platform-exports/photo.jpg": "a made-up photo's bytes" });
      await repository(join(cloned, "public-prep", "clone"), {
        "src/demo/public/_headers": HEADERS,
        "src/private.svg": "<svg>committed by the clone alone</svg>",
      });
      // What the clone has but has not committed: an earlier demo build, and copies of real data.
      await written(join(cloned, "public-prep", "clone"), {
        "dist-demo/_headers": HEADERS,
        "dist-demo/assets/index-1.css": "body{margin:0;padding:0}",
        "dist-demo/assets/logo.jpg": "a made-up photo's bytes",
        "dist-demo/assets/elsewhere.jpg": "a made-up face's bytes, moved",
        "data/face.jpg": "a made-up face's bytes",
      });
      await repository(join(cloned, "public-prep", "bare.git"), { "_headers": HEADERS, "refs/kept.jpg": "a made-up voice note's bytes" }, { bare: true });
    });

    it("passes over the repository's committed files and an earlier demo build there, and notes them", async () => {
      const check = checkDemo({ dist: await built({ "assets/index-1.css": "body{margin:0;padding:0}" }), data: [cloned], repo });
      expect(check.problems).toEqual([]);
      expect(check.notes).toEqual([
        "_headers: the same as 3 copies of this repository's own files or demo builds in git repositories in the data folder, passed over",
        "assets/index-1.css: the same as 1 copy of this repository's own files or demo builds in git repositories in the data folder, passed over",
      ]);
    });

    it("still refuses a real data file, beside a copy in a clone's build or only inside a clone", async () => {
      const check = checkDemo({
        dist: await built({
          "assets/logo.jpg": "a made-up photo's bytes", // in platform-exports/, and in the clone's earlier build
          "assets/face.jpg": "a made-up face's bytes", // only in a folder of the clone's that is not its build
          "assets/moved.jpg": "a made-up face's bytes, moved", // the clone's build has it, but at another path
          "assets/private.svg": "<svg>committed by the clone alone</svg>", // committed by the clone, not by this repository
          "assets/kept.jpg": "a made-up voice note's bytes", // inside a bare repository, committed by nobody
        }),
        data: [cloned],
        repo,
      });
      expect(check.problems.sort()).toEqual([
        "assets/face.jpg: the same as a file in the data folder",
        "assets/kept.jpg: the same as a file in the data folder",
        "assets/logo.jpg: the same as a file in the data folder",
        "assets/moved.jpg: the same as a file in the data folder",
        "assets/private.svg: the same as a file in the data folder",
      ]);
    });

    it("passes over no committed file when it is not told which repository is this one", async () => {
      const check = checkDemo({ dist: await built({}), data: [cloned] });
      expect(check.problems).toEqual(["_headers: the same as a file in the data folder"]);
    });
  });
});

describe("the life archive's guard, as check-demo asks it", { timeout: 60_000 }, () => {
  /** A stand-in life archive at `dir` whose `npm run guard` runs `body` (an ES module, given the command's arguments as `args`). */
  async function lifeArchive(dir: string, body: string): Promise<string> {
    await written(dir, {
      "package.json": JSON.stringify({ name: "life-archive-stand-in", private: true, type: "module", scripts: { guard: "node guard.js" } }),
      "guard.js": `import { readFileSync } from "node:fs";\nconst args = process.argv.slice(2);\n${body}`,
    });
    return dir;
  }

  /** The guard's scan --json, as the life archive's: each place of "Ada Sample" in each file. */
  const SCAN = `
if (args[0] !== "scan" || args[1] !== "--json") process.exit(2);
let found = 0;
for (const file of args.slice(2)) {
  const text = readFileSync(file, "utf8");
  for (let at = text.indexOf("Ada Sample"); at >= 0; at = text.indexOf("Ada Sample", at + 1)) {
    found++;
    console.log(JSON.stringify({ file, rule: "a real person's name", start: at, end: at + 10 }));
  }
}
process.exit(found > 0 ? 1 : 0);`;

  it("finds where its texts hold private data, never what, in one call", async () => {
    const scanned = guardScan(await lifeArchive(join(root, "guarded"), SCAN));
    expect(scanned(["nothing here", 'const a="Ada Sample";', "Ada Sample and Ada Sample"])).toEqual([
      [],
      [{ rule: "a real person's name", start: 9, end: 19 }],
      [{ rule: "a real person's name", start: 0, end: 10 }, { rule: "a real person's name", start: 15, end: 25 }],
    ]);
  });

  it("throws, so nothing passes unchecked, when it stops, finds nothing but exits 1, or says what is no finding", async () => {
    const cases: Array<[string, string, RegExp]> = [
      ["stops", "process.exit(2);", /stopped \(exit 2\)/],
      ["fails quietly", "process.exit(1);", /exited 1 with 0 findings/],
      ["talks", 'console.log("Ada Sample"); process.exit(1);', /not a finding/],
    ];
    for (const [name, body, error] of cases) {
      const scanned = guardScan(await lifeArchive(join(root, name), body));
      expect(() => scanned(["Ada Sample"]), name).toThrow(error);
    }
  });

  it("is found at LIFE_ARCHIVE_HOME, else ~/Projects/life-archive, and is there only with the guard command", async () => {
    expect(lifeArchiveHome({ root, env: { LIFE_ARCHIVE_HOME: "/elsewhere/life-archive" } })).toBe("/elsewhere/life-archive");
    expect(lifeArchiveHome({ root, env: { HOME: "/nowhere" } })).toMatch(/\/Projects\/life-archive$/);
    expect(hasGuard(join(root, "guarded"))).toBe(true);
    expect(hasGuard(join(root, "no-life-archive"))).toBe(false);
  });

  it("is not there, so npm run check-demo says the demo may not be published", async () => {
    await built({ "assets/index-1.js": "console.log('hello')" });
    const run = spawnSync(process.execPath, ["--no-warnings", new URL("./check-demo.ts", import.meta.url).pathname, dist, "--data", data], {
      encoding: "utf8",
      env: { ...process.env, LIFE_ARCHIVE_HOME: join(root, "no-life-archive") },
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain(`PROBLEM not checked for private data: no life archive with the privacy guard at ${join(root, "no-life-archive")} (LIFE_ARCHIVE_HOME)`);
    expect(run.stdout).toContain("1 problem: not to be published.");
  });
});
