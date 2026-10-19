// The files the life archive (~/Projects/life-archive) keeps pinned copies of, the same file on both
// sides and drift-tested there: the contract between friend-map and the archive (src/archive.ts)
// and the made-up names (server/fixtures/madeUpNames.ts). Each imports nothing, so its copy stands on its own.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname;

const PINNED = ["src/archive.ts", "server/fixtures/madeUpNames.ts"];

/** Each import in `text`: import and export ... from, a bare import, and import("...") with a literal. */
function importsOf(text: string): string[] {
  const statements = /^\s*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm;
  return [...text.matchAll(statements)].map((m) => (m[1] ?? m[2] ?? m[3])!);
}

describe("the files the life archive pins", () => {
  it("reads every kind of import", () => {
    expect(importsOf('import type { A } from "./a.ts";\nimport {\n  b,\n} from "../b.ts";\nexport { c } from "./c.ts";\nimport "./d.ts";\nawait import("./e.ts");\nimport x from "react";'))
      .toEqual(["./a.ts", "../b.ts", "./c.ts", "./d.ts", "./e.ts", "react"]);
  });

  it("import nothing", () => {
    for (const file of PINNED) expect(importsOf(readFileSync(ROOT + file, "utf8")), file).toEqual([]);
  });
});
