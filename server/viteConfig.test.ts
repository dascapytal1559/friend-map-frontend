import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every file of this repository `file` imports, itself and on down, by relative path (type-only imports too). */
function importGraph(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const [, specifier] of source.matchAll(/(?:\bfrom|\bimport\s*\(?)\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    importGraph(resolve(dirname(file), specifier), seen);
  }
  return seen;
}

describe("vite.config.ts", () => {
  // Vite restarts, and re-optimizes its dependencies, whenever a file its config imports changes; an open page can
  // then be left with chunks from two optimizer runs. Reaching into src/ would make editing the app do that.
  it("imports nothing from src/, so editing the app never restarts Vite", () => {
    const files = [...importGraph(resolve(ROOT, "vite.config.ts"))].map((file) => relative(ROOT, file));
    expect(files).toContain("server/basePath.ts");
    expect(files.filter((file) => file.startsWith("src/"))).toEqual([]);
  });

  it("is a walk that would see src/ through the server, as the saved settings' plugin reaches it", () => {
    const files = [...importGraph(resolve(ROOT, "server/savedSettingsPlugin.ts"))].map((file) => relative(ROOT, file));
    expect(files).toContain("src/savedSettings.ts");
  });
});
