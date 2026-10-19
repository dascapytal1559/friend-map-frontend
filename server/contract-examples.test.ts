// The contract's generated pages (docs/contract/examples/ and shapes.md) are current: what npm run contract-examples
// would write now, with nothing else beside them, and every name in them made up.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { ROUTES } from "../src/archive.ts";
import { contractPages, EXAMPLES_DIR, exampleFile, GUIDE_FILE, SHAPES_FILE } from "./contract-examples.ts";
import { REPO } from "./dataHome.ts";

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

it("are what npm run contract-examples writes now, and nothing else", async () => {
  const pages = await contractPages();
  const at = (path: string) => relative(REPO, path);
  expect(files(EXAMPLES_DIR).map(at).sort()).toEqual([...pages.keys()].filter((p) => p !== SHAPES_FILE && p !== GUIDE_FILE).map(at).sort());
  for (const [path, text] of pages) expect([at(path), readFileSync(path, "utf8")]).toEqual([at(path), text]);
}, 30_000);

it("have the demo's answer to the map's four routes, and the minimal backend's", async () => {
  const pages = [...(await contractPages()).keys()].map((p) => relative(EXAMPLES_DIR, p));
  for (const route of ROUTES.filter((r) => r.capability === "map")) {
    expect(pages).toContain(join("demo", exampleFile(route.path)));
    expect(pages).toContain(join("minimal", exampleFile(route.path)));
  }
});

it("list every route in the guide, under its capability", async () => {
  const guide = (await contractPages()).get(GUIDE_FILE)!;
  for (const route of ROUTES) expect(guide).toContain(`| \`${route.method} ${route.path}\` |`);
});
