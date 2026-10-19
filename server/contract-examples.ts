// Writes the data contract's generated pages, which docs/contract.md links to:
//
//   docs/contract/examples/demo/     an answer to every read route the demo serves, from its made-up crowd at the
//                                    tests' size (SMALL_CROWD), as contract-check asks them: the reference backend's
//   docs/contract/examples/minimal/  the four routes of a backend that serves only the map, with only the fields the
//                                    contract requires (server/fixtures/fourRouteBackend.ts)
//   docs/contract/shapes.md          every shape an answer has, field by field: required, optional (and what the page
//                                    puts in its place), or an extension (src/contract/schema.ts)
//   docs/contract.md, Every route    each route of each capability, what it is sent and answers, and its examples
//                                    (ROUTES in src/archive.ts), between the page's two routes markers
//
//   npm run contract-examples        writes them; contract-examples.test.ts fails while they are not current
//
// Every name in them is made up (src/demo/words.ts, server/fixtures/madeUpNames.ts). Lists are cut to their first
// three items, so each file stays short enough to read.

import "./onPinnedNode.ts";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { ALSO_READS, CAPABILITIES, CONTRACT_VERSION, ROUTES, type Capability } from "../src/archive.ts";
import { checkBackend } from "../src/contract/check.ts";
import { ANSWERS } from "../src/contract/schema.ts";
import type { AnyShape, ObjectShape } from "../src/contract/shape.ts";
import { demoBackend, httpBackend } from "./contract-check.ts";
import { fourRouteServer, standInCrowd } from "./fixtures/fourRouteBackend.ts";
import { REPO } from "./dataHome.ts";

/** When the examples' crowds are as of: a fixed day, so they are the same each time they are made. */
const NOW = Date.parse("2026-10-01T12:00:00+10:00");
const LIST_MOST = 3;

export const EXAMPLES_DIR = join(REPO, "docs", "contract", "examples");
export const SHAPES_FILE = join(REPO, "docs", "contract", "shapes.md");
export const GUIDE_FILE = join(REPO, "docs", "contract.md");
const ROUTES_START = "<!-- routes: written by npm run contract-examples from ROUTES in src/archive.ts -->";
const ROUTES_END = "<!-- /routes -->";

/** A route as a file name: /people/:id/groups is people-id-groups.json. */
export const exampleFile = (route: string) => `${route.slice(1).replace(/[/:]+/g, "-")}.json`;

/** `value` with every list cut to its first few items. */
function trimmed(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, LIST_MOST).map(trimmed);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimmed(item)]));
  return value;
}

/** Each route's example, by file name: the request and its answer, from the backend `backend` is. */
async function examplesOf(backend: Parameters<typeof checkBackend>[0]): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const report = await checkBackend(backend, {
    record: (route, path, body) => {
      if (!files.has(exampleFile(route))) files.set(exampleFile(route), `${JSON.stringify({ request: `GET /api/archive${path}`, response: trimmed(body) }, null, 2)}\n`);
    },
  });
  if (!report.ok) throw new Error(`the examples' backend does not fit the contract: ${report.checks.filter((c) => c.outcome === "wrong").map((c) => c.route).join(", ")}`);
  return files;
}

/** The minimal backend's examples: its four routes, asked over HTTP as any backend is. */
async function minimalExamples(): Promise<Map<string, string>> {
  const server = fourRouteServer(standInCrowd(NOW), { now: () => NOW });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    return await examplesOf(httpBackend(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

/** Every object shape an answer has, each once, in the order the answers name them. */
function objectShapes(): ObjectShape<unknown>[] {
  const seen = new Map<string, ObjectShape<unknown>>();
  const walk = (shape: AnyShape) => {
    if (shape.name && !shape.name.startsWith("{")) {
      if (seen.has(shape.name)) return;
      seen.set(shape.name, shape as ObjectShape<unknown>);
    }
    for (const part of shape.parts ?? []) walk(part);
  };
  for (const shape of Object.values(ANSWERS)) walk(shape);
  return [...seen.values()];
}

const cell = (text: string) => text.replace(/\|/g, "\\|");

/** docs/contract/shapes.md: each shape's fields, with what a backend must send and what it may leave out. */
export function shapesPage(): string {
  const lines = [
    "# The contract's shapes",
    "",
    `Every object a backend's answers hold, field by field, for contract ${CONTRACT_VERSION}. [The guide](../contract.md) says what each route answers; \`src/archive.ts\` says what each field means.`,
    "",
    "- **required**: every answer has it.",
    "- **optional**: a backend may leave it out (or send `null` where `null` is not one of its values); the page puts the value given in its place. Only the `map` capability's answers have optional fields.",
    "- **extension**: the life archive's own; optional, and no backend needs it.",
    "- **may be left out**: the type itself has it only sometimes.",
    "",
    "Generated by `npm run contract-examples` from `src/contract/schema.ts`: edit that, not this.",
  ];
  for (const shape of objectShapes()) {
    lines.push("", `## ${shape.name}`, "", "| Field | Type | Sent |", "|---|---|---|");
    for (const [key, field] of Object.entries(shape.fields)) {
      if (!("kind" in field)) lines.push(`| \`${key}\` | ${cell(field.describe)} | required |`);
      else if (field.kind === "absent") lines.push(`| \`${key}\` | ${cell(field.shape.describe)} | may be left out |`);
      else lines.push(`| \`${key}\` | ${cell(field.shape.describe)} | ${field.extension ? "extension, " : ""}optional: ${cell(field.says)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** A shape's place in shapes.md, as GitHub names a heading's anchor. */
const anchor = (name: string) => name.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s/g, "-");

/** The guide's Every route: each capability's routes, what each is sent and answers, and its examples (`examples`, by path under examples/). */
export function routesSection(examples: ReadonlySet<string>): string {
  const shapes = new Set(objectShapes().map((shape) => shape.name));
  const answer = (text: string) => {
    const base = text.replace(/\[\]$/, "").replace(/ \| null$/, "");
    return shapes.has(base) ? `[${cell(text)}](contract/shapes.md#${anchor(base)})` : cell(text);
  };
  const lines: string[] = [];
  for (const capability of Object.keys(CAPABILITIES) as Capability[]) {
    const routes = ROUTES.filter((route) => route.capability === capability);
    const title = capability === "map" ? "`map` (required)" : capability === "scores" ? "`scores` (friend-map's own)" : `\`${capability}\``;
    lines.push("", `### ${title}`, "", `${CAPABILITIES[capability]}.`);
    if (routes.length === 0) {
      lines.push("", "No route of its own: it changes what `GET /query` takes.");
      continue;
    }
    lines.push("", "| Request | Sent | Answer | Examples |", "|---|---|---|---|");
    for (const route of routes) {
      // A query's form in code, and what is said of it after: `q=<query>&hide=<tag>` (hide repeated, optional).
      const [form, said] = route.query ? [route.query.split(" (")[0], route.query.slice(route.query.split(" (")[0].length)] : ["", ""];
      const sent = route.body ? `body: \`${route.body}\`` : route.query ? `query: \`${cell(form)}\`${cell(said)}` : "";
      const file = exampleFile(route.path);
      const found = route.method === "GET" ? ["demo", "minimal"].filter((kind) => examples.has(join(kind, file))) : [];
      const links = found.map((kind) => `[${kind}](contract/examples/${kind}/${file})`).join(", ");
      lines.push(`| \`${route.method} ${route.path}\` | ${sent} | ${answer(route.answer)} | ${links} |`);
    }
    const also = ALSO_READS[capability];
    if (also) lines.push("", `It reads ${also.map((path) => `\`GET ${path}\``).join(" and ")} too, which are listed above.`);
  }
  return `${ROUTES_START}\n${lines.join("\n").trimStart()}\n${ROUTES_END}`;
}

/** The guide (docs/contract.md) as it reads now, with Every route written again. */
function guidePage(examples: ReadonlySet<string>): string {
  const text = readFileSync(GUIDE_FILE, "utf8");
  const start = text.indexOf(ROUTES_START);
  const end = text.indexOf(ROUTES_END);
  if (start < 0 || end < start) throw new Error(`docs/contract.md has lost its routes markers: ${ROUTES_START} and ${ROUTES_END}`);
  return text.slice(0, start) + routesSection(examples) + text.slice(end + ROUTES_END.length);
}

/** Every generated file, by its path under the repository, as it should read now. */
export async function contractPages(): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  for (const [file, text] of await examplesOf(demoBackend(NOW))) pages.set(join(EXAMPLES_DIR, "demo", file), text);
  for (const [file, text] of await minimalExamples()) pages.set(join(EXAMPLES_DIR, "minimal", file), text);
  pages.set(SHAPES_FILE, shapesPage());
  pages.set(GUIDE_FILE, guidePage(new Set([...pages.keys()].map((path) => relative(EXAMPLES_DIR, path)))));
  return pages;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pages = await contractPages();
  await rm(EXAMPLES_DIR, { recursive: true, force: true });
  for (const [path, text] of pages) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }
  console.log(`Wrote ${pages.size - 2} examples under docs/contract/examples/, docs/contract/shapes.md, and docs/contract.md's Every route.`);
}
